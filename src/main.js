/* =============================================================================
   GOREBOX - bootstrap and the application state machine.

       boot loading screen -> main menu -> maps -> map loading screen -> game
   ========================================================================== */
import { $, IS_TOUCH } from './core/util.js';
import { bootScreen, mapScreen } from './core/loading.js';
import { input } from './core/input.js';
import { Menu } from './ui/menu.js';
import { Hud } from './ui/hud.js';
import { SpawnMenu } from './ui/spawnMenu.js';

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
};

function guessQuality() {
  const px = Math.min(window.screen.width, window.screen.height);
  const cores = navigator.hardwareConcurrency || 4;
  if (isWeakDevice()) return 'low';
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
      }));
    } catch (e) { /* ignore */ }
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
    ['Loading the engine', async () => { GameClass = (await import('./game/game.js')).Game; }],
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

async function startGame(mapId) {
  if (app.state === 'loading') return;
  app.state = 'loading';
  app.menu.hide();
  gameScreen.classList.add('active');
  app.hud.setVisible(false);

  const mapName = (mapId === 'baseplate' ? 'TEST BASEPLATE' : mapId.toUpperCase());
  $('#map-loading-title').textContent = mapName;
  mapScreen.show('Preparing...');

  // let the loading screen paint before the heavy lifting starts
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const game = new app.Game(viewport, settings);
  app.game = game;
  game.hud = app.hud;

  app.hud.onWeaponSelect = (name) => game.setEquipped(name);
  app.spawnMenu.onSelect = (id) => {
    const item = game.setSelected(id);
    app.hud.setSelectedItem(item.name);
  };
  app.spawnMenu.onToggle = (open) => {
    input.enabled = !open;
    if (open) input.reset();
  };
  input.onWeaponSelect = (i) => game.setEquipped(['fists', 'rcv2', 'machete'][i] || 'fists');
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
  app.hud.setVisible(true);
  app.hud.hideDeath();

  mapScreen.hide();
  app.state = 'playing';
  input.enabled = true;
  app.lastTime = performance.now();
}

function quitToMenu() {
  if (!app.game) return;
  input.enabled = false;
  input.reset();
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

function wireGameButtons() {
  $('#btn-pause').addEventListener('click', () => togglePause(true));
  $('#btn-resume').addEventListener('click', () => togglePause(false));
  $('#btn-quit').addEventListener('click', () => quitToMenu());
  $('#btn-clear').addEventListener('click', () => { app.game?.clearSpawns(); updatePauseStats(); });
  $('#btn-cleangore').addEventListener('click', () => { app.game?.washGore(); updatePauseStats(); });
  $('#btn-respawn').addEventListener('click', () => app.game?.respawnPlayer());

  settings.on('sensitivity', (v) => { input.sensitivity = v; });
  settings.on('invertY', (v) => { input.invertY = v; });
  settings.on('fov', (v) => { app.game?.setFov(v); });
  settings.on('gore', (v) => { app.game?.gore?.setEnabled(v); });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && app.state === 'playing') togglePause(true);
  });
}

/* ------------------------------- the loop ---------------------------------- */

function loop(now) {
  app.rafId = requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - app.lastTime) / 1000) || 0;
  app.lastTime = now;

  input.beginFrame();

  if (app.state === 'playing' && app.game) {
    app.game.update(dt, input);
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
