/* =============================================================================
   BLACKSMITH - start-up, the menu, and the frame loop.

       loading screen -> main menu -> loading the world -> playing <-> paused
   ========================================================================== */
import { $, IS_TOUCH } from './core/util.js';
import { loading } from './core/loading.js';
import { input } from './core/input.js';
import { canFullscreen, isFullscreen, toggleFullscreen, onFullscreenChange } from './core/fullscreen.js';
import { Menu } from './ui/menu.js';
import { Hud } from './ui/hud.js';
import { InventoryUI } from './ui/inventory.js';
import { ForgeUI } from './ui/forge.js';
import { ShopUI } from './ui/shop.js';
import { DialogueUI } from './ui/dialogue.js';
import { AccountUI } from './ui/account.js';
import { Profile } from './game/profile.js';
import { readSave, writeSave, clearSave, saveHooks } from './game/save.js';
import { cloud } from './game/cloud.js';
import { sfx } from './game/sfx.js';

/* -------------------------------------------------------------------------- */
/*                                  settings                                  */
/* -------------------------------------------------------------------------- */

function weakDevice() {
  return (navigator.hardwareConcurrency || 4) <= 4 && (navigator.deviceMemory || 4) <= 4;
}

const settings = {
  quality: weakDevice() ? 'low' : IS_TOUCH ? 'medium' : 'high',
  shadows: !weakDevice(),
  sound: true,
  sensitivity: 1,
  invertY: false,
  _listeners: {},
  load() {
    try {
      const raw = localStorage.getItem('blacksmith.settings');
      if (raw) {
        const s = JSON.parse(raw);
        for (const k of ['quality', 'shadows', 'sound', 'sensitivity', 'invertY']) if (k in s) this[k] = s[k];
      }
    } catch { /* private browsing: defaults it is */ }
    return this;
  },
  save() {
    try {
      localStorage.setItem('blacksmith.settings', JSON.stringify({
        quality: this.quality, shadows: this.shadows, sound: this.sound,
        sensitivity: this.sensitivity, invertY: this.invertY,
      }));
    } catch { /* ignore */ }
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
  Game: null,
  game: null,
  profile: null,
  menu: null,
  hud: null,
  inventory: null,
  forge: null,
  shop: null,
  dialogue: null,
  lastTime: 0,
};

const gameScreen = $('#game-screen');
const viewport = $('#viewport');
const pauseOverlay = $('#pause-overlay');

/**
 * When a new version of the page arrives while you are playing, the viewer
 * reloads it; this is how the game picks up again where you were.
 */
const hot = typeof window !== 'undefined' ? window.claude?.hot : null;
hot?.snapshot?.(() => {
  const playing = app.state === 'playing' || app.state === 'paused';
  if (playing) app.game?.save();
  return { playing, save: playing ? readSave() : null };
});

async function boot(resume = {}) {
  loading.show('HEATING THE FORGE', 'Waking up...');
  await loading.run([
    ['Checking the hardware', async () => {
      if (!hasWebGL()) throw new Error('WebGL is not available on this device.');
    }],
    ['Loading the engine', async () => {
      app.Game = (await import('./game/game.js')).Game;
    }],
    ['Building the menus', async () => {
      app.menu = new Menu(settings, {
        onContinue: () => startGame(false),
        onNewGame: () => startGame(true),
      });
      app.account = new AccountUI({
        showPanel: (id) => app.menu.showPanel(id),
        onChanged: (note) => app.menu.show(readSave(), note || null),
      });
    }],
    ['Finding your smith', async () => {
      // every save goes up to the cloud too, when you are logged in
      saveHooks.onWrite = (data) => { if (cloud.account) cloud.queue(data); };
      // logged in here before? then straight back into that account - unless the cloud
      // is so slow to answer that a smith is already being played by then
      const found = cloud.connect().then(() => cloud.restore(() => app.state === 'boot' || app.state === 'menu'));
      found.then((back) => { if (back && app.state === 'menu') app.menu.paint(readSave()); });
      await Promise.race([found, new Promise((r) => setTimeout(r, 6000))]);
      // the page was replaced while you played: put back what you had
      if (resume.save) writeSave(resume.save, { notify: false });
    }],
    ['Wiring the controls', async () => {
      input.attach({ viewport, stickZone: $('#stick-zone'), stickBase: $('#stick-base'), stickKnob: $('#stick-knob') });
      applySettings();
      app.hud = new Hud(input);
      wireButtons();
    }],
  ]);
  loading.hide();
  showMenu();
  requestAnimationFrame(loop);
  if (resume.playing) startGame(false);
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

function applySettings() {
  input.sensitivity = 0.0065 * settings.sensitivity;
  input.invertY = settings.invertY;
  sfx.enabled = settings.sound;
}
settings.on('sensitivity', applySettings);
settings.on('invertY', applySettings);
settings.on('sound', applySettings);

function showMenu() {
  app.state = 'menu';
  gameScreen.classList.remove('active');
  app.menu.show(readSave());
}

/* --------------------------------- playing --------------------------------- */

async function startGame(fresh) {
  if (app.state === 'loading') return;
  app.state = 'loading';
  sfx.unlock();
  app.menu.hide();
  if (fresh) clearSave();
  const profile = new Profile(fresh ? null : readSave());
  app.profile = profile;
  gameScreen.classList.add('active');
  app.hud.setVisible(false);
  loading.show({ cave: 'INTO THE CAVE', deep: 'DOWN TO THE DEEP MINE' }[profile.where] || 'OUT TO THE MEADOW', 'Preparing...');
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  // the screens that look at your things are made once and handed each new smith
  if (!app.inventory) {
    app.inventory = new InventoryUI(profile, {
      onEquip: (uid) => app.game?.equip(uid),
      onUnequip: (slot) => app.game?.unequip(slot),
      onScrap: (uid) => app.game?.scrap(uid),
      onClose: () => app.game?.closeInventory(),
    });
    app.forge = new ForgeUI(profile, {
      onForge: (type, mix) => app.game?.forge(type, mix),
      onClose: () => app.game?.closeForge(),
      onEquip: (uid) => app.game?.equipForged(uid),
      onSkip: () => app.game?.skipCraft(),
    });
    app.shop = new ShopUI(profile, {
      onSelect: (type) => app.game?.inspectPickaxe(type),
      onBuy: (type) => app.game?.buyPickaxe(type),
      onEquip: (type) => app.game?.equipPickaxe(type),
      onClose: () => app.game?.closeShop(),
    });
    app.dialogue = new DialogueUI();
  } else {
    app.inventory.setProfile(profile);
    app.forge.setProfile(profile);
    app.shop.setProfile(profile);
  }

  const game = new app.Game({
    viewport, settings, profile, hud: app.hud, input,
    inventory: app.inventory, forgeUI: app.forge, shopUI: app.shop, dialogue: app.dialogue,
  });
  app.game = game;
  try {
    await game.load((p, label) => loading.setProgress(p, label));
  } catch (err) {
    console.error(err);
    loading.setProgress(1, 'Failed: ' + err.message);
    return;
  }
  game.begin();
  game.save();
  app.hud.hideDeath();
  app.hud.setBusy(false);
  app.hud.setVisible(true);
  loading.hide();
  app.state = 'playing';
  input.enabled = true;
  app.lastTime = performance.now();
  if (fresh) {
    setTimeout(() => app.hud.toast('The path ahead leads to the Cave. The path to the left, to the Forge.', 4200), 2600);
  }
}

function quitToMenu() {
  if (!app.game) return;
  app.game.save();
  cloud.flush();
  input.enabled = false;
  input.reset();
  app.game.dispose();
  app.game = null;
  pauseOverlay.classList.add('hidden');
  app.inventory?.close();
  app.forge?.close();
  app.shop?.close();
  app.dialogue?.close();
  showMenu();
}

function setPaused(on) {
  if (on && app.state === 'playing') {
    app.state = 'paused';
    pauseOverlay.classList.remove('hidden');
    input.enabled = false;
    input.reset();
    const g = app.game, p = app.profile;
    const mins = Math.floor((p.stats.playTime || 0) / 60);
    app.game?.save();
    cloud.flush();
    $('#pause-stats').innerHTML = `${p.stats.mined} rocks broken &middot; ${p.stats.ores} ore found &middot; ${p.stats.kills} skeletons` +
      (p.stats.elites ? ` (${p.stats.elites} elite)` : '') + '<br>' +
      `${p.stats.crafted} things forged &middot; ${mins} min played &middot; ${g?.stats.fps || 0} fps<br>` +
      `<span class="pause-cloud">${cloud.describe()}</span>`;
  } else if (!on && app.state === 'paused') {
    app.state = 'playing';
    pauseOverlay.classList.add('hidden');
    input.reset();
    input.enabled = true;
    app.lastTime = performance.now();
  }
}

/** Escape and the hardware back button: close whatever is open, else pause. */
function back() {
  const g = app.game;
  if (!g) return;
  if (app.state === 'paused') { setPaused(false); return; }
  if (g.mode === 'menu') g.closeInventory();
  else if (g.mode === 'forge') g.closeForge();
  else if (g.mode === 'shop') g.closeShop();
  else if (g.mode === 'talk') g.closeTalk();
  else setPaused(true);
}

function wireButtons() {
  $('#btn-inventory').addEventListener('click', () => {
    const g = app.game;
    if (!g) return;
    if (g.mode === 'menu') g.closeInventory(); else g.openInventory();
  });
  input.onInventory = () => {
    const g = app.game;
    if (!g || app.state !== 'playing') return;
    if (g.mode === 'menu') g.closeInventory(); else g.openInventory();
  };
  input.onPause = () => back();
  input.onTap = (x, y) => app.game?.onTap(x, y);
  $('#btn-pause').addEventListener('click', () => setPaused(true));
  $('#btn-resume').addEventListener('click', () => setPaused(false));
  $('#btn-save').addEventListener('click', () => {
    app.game?.save();
    $('#btn-save').textContent = 'SAVED ✓';
    setTimeout(() => { $('#btn-save').textContent = 'SAVE GAME'; }, 1200);
  });
  $('#btn-quit').addEventListener('click', () => quitToMenu());
  $('#btn-respawn').addEventListener('click', () => app.game?.respawn());

  // full screen, from the HUD or the pause card
  const hudBtn = $('#btn-fullscreen'), pauseBtn = $('#btn-fullscreen-pause');
  if (!canFullscreen()) {
    hudBtn.style.display = 'none';
    pauseBtn.style.display = 'none';
  } else {
    const paint = (on) => {
      hudBtn.classList.toggle('on', on);
      pauseBtn.textContent = on ? 'LEAVE FULL SCREEN' : 'FULL SCREEN';
    };
    const flip = async () => { await toggleFullscreen(); paint(isFullscreen()); };
    hudBtn.addEventListener('click', flip);
    pauseBtn.addEventListener('click', flip);
    onFullscreenChange((on) => { paint(on); checkOrientation(); });
  }

  // the first touch anywhere is what lets the page make sound
  window.addEventListener('pointerdown', () => sfx.unlock(), { passive: true });
  // whatever happens to the tab, the smith is saved first, and sent up if logged in
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { app.game?.save(); cloud.flush(); if (app.state === 'playing') setPaused(true); }
  });
  window.addEventListener('pagehide', () => { app.game?.save(); cloud.flush(); });
}

/* ---------------------------------- loop ----------------------------------- */

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - app.lastTime) / 1000) || 0;
  app.lastTime = now;
  const g = app.game;
  if (!g) return;
  if (app.state === 'playing') {
    // presses are only read when a frame of the game is going to use them
    input.beginFrame();
    g.update(dt, input);
    g.render();
  } else if (app.state === 'paused') {
    g.render();
  }
}

/* ------------------------------- orientation ------------------------------- */

function checkOrientation() {
  if (!IS_TOUCH) { document.body.classList.remove('portrait-block'); return; }
  document.body.classList.toggle('portrait-block', window.innerHeight > window.innerWidth * 1.06);
}
window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', () => setTimeout(checkOrientation, 180));
checkOrientation();

document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', (e) => e.preventDefault());

const start = (data) => boot(data || {}).catch((err) => {
  console.error(err);
  $('#load-status').textContent = 'Failed to start: ' + err.message;
});
if (hot?.ready) hot.ready(start); else start(hot?.data ?? {});

// for poking at from the console, and for tools/verify.mjs
app.input = input;
app.cloud = cloud;
window.BLACKSMITH = app;

export { app, settings };
