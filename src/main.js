/* =============================================================================
   GOREBOX - bootstrap and the application state machine.

       boot loading screen -> main menu -> maps -> map loading screen -> game
   ========================================================================== */
import { $, IS_TOUCH } from './core/util.js';
import { bootScreen, mapScreen } from './core/loading.js';
import { input } from './core/input.js';
import { canFullscreen, isFullscreen, toggleFullscreen, onFullscreenChange } from './core/fullscreen.js';
import { getMap as getMapDef } from './game/map.js';
import { isUnlocked } from './game/progress.js';
import { Menu } from './ui/menu.js';
import { Hud } from './ui/hud.js';
import { SpawnMenu } from './ui/spawnMenu.js';
import { AiChat } from './ui/aichat.js';

/* -------------------------------------------------------------------------- */
/*                                  settings                                  */
/* -------------------------------------------------------------------------- */

const DEFAULTS = {
  quality: guessQuality(),
  shadows: !isWeakDevice(),
  gore: true,
  sensitivity: 0.0022,
  fov: 78,
  invertY: false,
  aiModel: 'claude-opus-5-5',
  aiEvery: 15,
};

function guessQuality() {
  const px = Math.min(window.screen.width, window.screen.height);
  const cores = navigator.hardwareConcurrency || 4;
  if (isWeakDevice()) return 'low';
  /* A phone with eight cores and a 1080p screen is still a phone: high means
     twice the pixels, antialiasing and soft shadows, which is what makes it
     lag. It can be picked in settings; it is never the default on touch. */
  if (IS_TOUCH) return 'medium';
  if (px >= 720 && cores >= 8) return 'high';
  return 'medium';
}

function isWeakDevice() {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  return cores <= 4 && mem <= 4;
}

const settings = {
  ...DEFAULTS,
  _listeners: {},
  load() {
    try {
      const raw = localStorage.getItem('gorebox.settings');
      if (raw) Object.assign(this, JSON.parse(raw));
    } catch (e) { /* private mode, never mind */ }
    return this;
  },
  save() {
    try {
      localStorage.setItem('gorebox.settings', JSON.stringify({
        quality: this.quality, shadows: this.shadows, gore: this.gore,
        sensitivity: this.sensitivity, fov: this.fov, invertY: this.invertY,
        aiModel: this.aiModel, aiEvery: this.aiEvery,
      }));
    } catch (e) { /* ignore */ }
  },
  /* The Claude API key for AI play. Kept apart from the rest so it is never
     written anywhere but this browser's own storage. */
  getAiKey() {
    try { return localStorage.getItem('gorebox.aikey') || ''; } catch (e) { return this._aiKey || ''; }
  },
  setAiKey(k) {
    this._aiKey = k;
    try { if (k) localStorage.setItem('gorebox.aikey', k); else localStorage.removeItem('gorebox.aikey'); } catch (e) { /* ignore */ }
  },
  on(key, fn) { (this._listeners[key] = this._listeners[key] || []).push(fn); },
  emit(key) { for (const fn of this._listeners[key] || []) fn(this[key]); },
};
settings.load();

/* -------------------------------------------------------------------------- */
/*                                    app                                     */
/* -------------------------------------------------------------------------- */

const app = {
  state: 'boot',
  game: null,
  Game: null,
  menu: null,
  hud: null,
  spawnMenu: null,
  /** The AI that plays for you, when AI play is on. It outlives every map. */
  ai: null,
  lastTime: 0,
  rafId: 0,
};

const gameScreen = $('#game-screen');
const viewport = $('#viewport');
const pauseOverlay = $('#pause-overlay');

/* --------------------------------- boot ----------------------------------- */

async function boot() {
  bootScreen.show('Waking up...');

  let GameClass = null;
  await bootScreen.run([
    ['Checking hardware', async () => {
      if (!hasWebGL()) throw new Error('WebGL is not available on this device.');
    }],
    ['Loading the engine', async () => {
      GameClass = (await import('./game/game.js')).Game;
      app.AutoPilot = (await import('./game/autopilot.js')).AutoPilot;
      const brain = await import('./game/brain.js');
      app.Brain = brain.Brain;
      settings.aiModels = brain.BRAIN_MODELS;
    }],
    ['Building the menus', async () => {
      app.menu = new Menu(settings);
      app.menu.onPlay = (mapId) => startGame(mapId);
    }],
    ['Wiring the controls', async () => {
      input.attach({
        viewport,
        stickZone: $('#stick-zone'),
        stickBase: $('#stick-base'),
        stickKnob: $('#stick-knob'),
      });
      input.sensitivity = settings.sensitivity;
      input.invertY = settings.invertY;
      app.hud = new Hud(input);
      app.spawnMenu = new SpawnMenu();
      app.brain = new app.Brain({
        getKey: () => settings.getAiKey(),
        getModel: () => settings.aiModel,
      });
      app.ai = new app.AutoPilot({
        chat: new AiChat(), hud: app.hud, brain: app.brain,
        thinkEvery: () => settings.aiEvery || 15,
      });
      wireGameButtons();
    }],
    ['Almost there', async () => { await new Promise((r) => setTimeout(r, 220)); }],
  ]);

  app.Game = GameClass;
  bootScreen.hide();
  app.state = 'menu';
  app.menu.show();
  loop(performance.now());
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

/* ------------------------------- game start -------------------------------- */

async function startGame(mapId, statusMessage = '') {
  if (app.state === 'loading') return;
  app.state = 'loading';
  app.menu.hide();
  gameScreen.classList.add('active');
  app.hud.setVisible(false);

  const mapName = (getMapDef(mapId)?.name || mapId).toUpperCase();
  $('#map-loading-title').textContent = mapName;
  mapScreen.show(statusMessage || 'Preparing...');

  // let the loading screen paint before the heavy lifting starts
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const game = new app.Game(viewport, settings);
  app.game = game;
  game.hud = app.hud;
  game.onTravel = (id, message) => travelTo(id, message);

  // while the AI is playing, it is the only one choosing weapons
  app.hud.onWeaponSelect = (name) => { if (!app.ai?.enabled) game.setEquipped(name); };
  app.spawnMenu.onSelect = (id) => {
    const item = game.setSelected(id);
    app.hud.setSelectedItem(item.name);
  };
  app.spawnMenu.onToggle = (open) => {
    input.enabled = !open;
    if (open) input.reset();
  };
  input.onWeaponSelect = (i) => {
    if (app.ai?.enabled) return;
    game.setEquipped(
      ['fists', 'rcv2', 'machete', 'sledge', 'crowbar', 'glock', 'ak47', 'm16', 'firefist', 'flamethrower',
        'mossberg'][i] || 'fists');
  };
  input.onToggleDrawer = () => app.spawnMenu.toggle();
  input.onPause = () => togglePause();

  try {
    await game.load(mapId, (p, label) => mapScreen.setProgress(p, label));
  } catch (err) {
    console.error(err);
    mapScreen.setProgress(1, 'Failed: ' + err.message);
    return;
  }

  game.setSelected(app.spawnMenu.selectedId);
  app.hud.setSelectedItem(game.selected.name);
  app.hud.setWeapon('fists');
  app.hud.setFireFist(isUnlocked('firefist'));
  app.hud.setVisible(true);
  app.hud.hideDeath();

  mapScreen.hide();
  app.ai?.attach(game);
  app.state = 'playing';
  input.enabled = true;
  app.lastTime = performance.now();
  // whatever brought you here has something to say about it
  if (statusMessage) app.hud.toast(statusMessage, 3200);
}

/**
 * Straight from one map into another, without going back to the menu: the
 * red RCV2 in Pit Valley, and the one Silva leaves behind. Everything about
 * the old map goes; what you have unlocked is kept by the progress store.
 */
async function travelTo(mapId, message = '') {
  if (!app.game || app.state === 'loading') return;
  input.enabled = false;
  input.reset();
  app.ai?.detach();
  app.game.dispose();
  app.game = null;
  pauseOverlay.classList.add('hidden');
  app.spawnMenu.close();
  app.state = 'menu';            // startGame refuses to start over a load
  await startGame(mapId, message);
}

function quitToMenu() {
  if (!app.game) return;
  input.enabled = false;
  input.reset();
  app.ai?.detach();
  setAiPlay(false);
  app.game.dispose();
  app.game = null;
  gameScreen.classList.remove('active');
  pauseOverlay.classList.add('hidden');
  app.spawnMenu.close();
  app.state = 'menu';
  app.menu.show();
}

function togglePause(force) {
  if (app.state !== 'playing' && app.state !== 'paused') return;
  const wantPaused = force != null ? force : app.state !== 'paused';
  if (wantPaused) {
    app.state = 'paused';
    if (app.game) app.game.paused = true;
    pauseOverlay.classList.remove('hidden');
    input.enabled = false;
    input.reset();
    updatePauseStats();
  } else {
    app.state = 'playing';
    if (app.game) app.game.paused = false;
    pauseOverlay.classList.add('hidden');
    input.enabled = true;
    app.lastTime = performance.now();
  }
}

function updatePauseStats() {
  const g = app.game;
  if (!g) return;
  $('#pause-stats').innerHTML =
    `${g.stats.fps} fps &middot; ${g.stats.objects} objects &middot; ${g.stats.citizens} citizens<br>` +
    `${g.gore ? g.gore.stats.splats : 0} splatters on the map`;
}

/**
 * Both full screen buttons: the one in the corner of the HUD and the one in
 * the pause card. They are the same switch, so whichever way it is thrown the
 * other has to agree, and the browser's own Escape key has to be heard too.
 */
function wireFullscreen() {
  const hudBtn = $('#btn-fullscreen');
  const pauseBtn = $('#btn-fullscreen-pause');
  if (!canFullscreen()) {
    // iPhone Safari cannot do this for anything but a video. A button that
    // silently does nothing is worse than no button.
    hudBtn.style.display = 'none';
    pauseBtn.style.display = 'none';
    return;
  }
  const paint = (on) => {
    hudBtn.classList.toggle('on', on);
    hudBtn.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen');
    hudBtn.innerHTML = on ? '&#10066;' : '&#9974;';
    pauseBtn.textContent = on ? 'LEAVE FULL SCREEN' : 'FULL SCREEN';
  };
  const flip = async () => {
    await toggleFullscreen();
    /* The change event repaints too, but it does not always arrive - a
       refused request fires nothing at all - so settle the buttons against
       what is actually true now. Painting twice costs nothing. */
    paint(isFullscreen());
  };
  hudBtn.addEventListener('click', flip);
  pauseBtn.addEventListener('click', flip);
  onFullscreenChange((on) => { paint(on); checkOrientation(); });
  paint(isFullscreen());
}

function wireGameButtons() {
  wireFullscreen();
  $('#btn-pause').addEventListener('click', () => togglePause(true));
  $('#btn-resume').addEventListener('click', () => togglePause(false));
  $('#btn-quit').addEventListener('click', () => quitToMenu());
  $('#btn-clear').addEventListener('click', () => { app.game?.clearSpawns(); updatePauseStats(); });
  $('#btn-cleangore').addEventListener('click', () => { app.game?.washGore(); updatePauseStats(); });
  $('#btn-respawn').addEventListener('click', () => app.game?.respawnPlayer());
  $('#btn-ai').addEventListener('click', () => setAiPlay(!app.ai.enabled));
  // talking to the AI
  const sayInput = $('#ai-say-input');
  $('#ai-say').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = sayInput.value;
    sayInput.value = '';
    app.ai?.tell(text);
    sayInput.blur();
  });
  sayInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') sayInput.blur(); e.stopPropagation(); });
  settings.on('ai', () => showAiMode());
  $('#btn-ai-pause').addEventListener('click', () => { setAiPlay(!app.ai.enabled); togglePause(false); });
  input.onToggleAI = () => { if (app.state === 'playing') setAiPlay(!app.ai.enabled); };
  // AI PLAY on the main menu: the AI picks a map and starts playing
  $('#btn-aiplay').addEventListener('click', () => {
    setAiPlay(true);
    startGame(['baseplate', 'pitvalley', 'legacy'][(Math.random() * 3) | 0], 'The AI is playing');
  });

  settings.on('sensitivity', (v) => { input.sensitivity = v; });
  settings.on('invertY', (v) => { input.invertY = v; });
  settings.on('fov', (v) => { app.game?.setFov(v); });
  settings.on('gore', (v) => { app.game?.gore?.setEnabled(v); });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && app.state === 'playing') togglePause(true);
  });
}

/* -------------------------------- AI play ---------------------------------- */

/** The badge by the AI's talk box: thinking with Claude, or on instinct. */
function showAiMode() {
  const m = (settings.aiModels || []).find((x) => x.id === settings.aiModel);
  app.ai?.chat?.setOnline(!!settings.getAiKey(), m ? m.name.replace('Claude ', '') : '');
}

/** Turns AI play on or off, and keeps both of its buttons saying which. */
function setAiPlay(on) {
  if (!app.ai) return;
  showAiMode();
  app.ai.setEnabled(on);
  $('#btn-ai').classList.toggle('on', on);
  $('#btn-ai-pause').textContent = on ? 'AI PLAY: ON' : 'AI PLAY: OFF';
  document.body.classList.toggle('ai-play', on);
  input.reset();
}

/* ------------------------------- the loop ---------------------------------- */

function loop(now) {
  app.rafId = requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - app.lastTime) / 1000) || 0;
  app.lastTime = now;

  input.beginFrame();

  if (app.state === 'playing' && app.game) {
    let controls = input;
    if (app.ai?.enabled) {
      // the AI drives; whatever the real controls did this frame is dropped
      input.consumeLook();
      controls = app.ai.update(dt);
    }
    app.game.update(dt, controls);
    app.game.render();
  } else if (app.game && (app.state === 'paused')) {
    app.game.render();
  }
}

/* ------------------------------- orientation ------------------------------- */

function checkOrientation() {
  if (!IS_TOUCH) { document.body.classList.remove('portrait-block'); return; }
  const portrait = window.innerHeight > window.innerWidth * 1.06;
  document.body.classList.toggle('portrait-block', portrait);
}
window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', () => setTimeout(checkOrientation, 180));
checkOrientation();

/* prevent the page itself from scrolling or zooming under the game */
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', (e) => e.preventDefault());

boot().catch((err) => {
  console.error(err);
  $('#boot-status').textContent = 'Failed to start: ' + err.message;
});

window.GOREBOX = app;

export { app, settings };
