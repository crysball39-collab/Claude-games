/* =============================================================================
   BARRAGE - start-up, the menus, and the frame loop.

       loading -> title (a fight behind it) -> playing <-> paused / bag / Stall
                                                 \-> fallen -> playing

   Everything you own is in the Profile; every change to it is saved on the
   device at once and, when you are logged in, to the cloud a moment later.
   ========================================================================== */
import { WebGLRenderer, PCFSoftShadowMap, SRGBColorSpace, ACESFilmicToneMapping, Vector3, Quaternion } from 'three';
import { $, $$ } from './core/util.js';
import { Input } from './core/input.js';
import { Sound } from './core/audio.js';
import { Game } from './game/game.js';
import * as anim from './game/anim.js';
import { roster } from './game/waves.js';
import { R } from './game/arena.js';
import { Held, STOCK, ITEMS } from './game/gear.js';
import { Hud } from './ui/hud.js';
import { InventoryUI } from './ui/inventory.js';
import { ShopUI } from './ui/shop.js';
import { AccountUI } from './ui/account.js';
import { settings, renderSettings } from './ui/settings.js';
import { Profile } from './data/profile.js';
import { readSave, writeSave, saveHooks } from './data/save.js';
import { cloud } from './data/cloud.js';

const app = {
  state: 'boot',          // boot | title | playing | paused | bag | shop | fallen
  game: null,
  profile: null,
  hud: null,
  input: null,
  sound: null,
  renderer: null,
};

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/* -------------------------------------------------------------------------- */
/*                                   loading                                  */
/* -------------------------------------------------------------------------- */

function loadingStep(k, text) {
  $('#load-bar').style.width = `${Math.round(k * 100)}%`;
  $('#load-text').textContent = text;
  return nextFrame();
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

async function fonts() {
  if (!document.fonts || !document.fonts.load) return;
  const all = Promise.all([
    document.fonts.load('40px Bungee'),
    document.fonts.load('600 16px "Barlow Condensed"'),
    document.fonts.load('700 16px "Barlow Condensed"'),
  ]).catch(() => {});
  await Promise.race([all, new Promise((r) => setTimeout(r, 2500))]);
}

async function boot(resume = {}) {
  settings.load();
  await loadingStep(0.05, 'Raking the sand...');
  if (!hasWebGL()) {
    $('#load-text').textContent = 'This browser cannot draw 3D (WebGL is off or missing). Try another browser.';
    return;
  }
  await fonts();
  await loadingStep(0.2, 'Building the arena...');

  const canvas = $('#view');
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  app.renderer = renderer;

  const game = new Game(renderer);
  app.game = game;
  await loadingStep(0.55, 'Seating the crowd...');

  app.input = new Input();
  app.sound = new Sound();
  app.hud = new Hud(game);
  app.input.attach({
    view: canvas, zone: $('#stick-zone'), base: $('#stick-base'), knob: $('#stick-knob'),
    buttons: $$('#hud [data-act]'),
  });
  dressStall();
  wireGame();
  wireMenus();
  applySettings();
  settings.onChange(applySettings);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();
  await loadingStep(0.75, 'Finding your fighter...');

  // every save goes up to the cloud too, when you are logged in
  saveHooks.onWrite = (data) => { if (cloud.account) cloud.queue(data); };
  // logged in here before? straight back into that account - unless the cloud is so slow
  // to answer that a fight has started by then
  const found = cloud.connect().then(() => cloud.restore(() => app.state === 'boot' || app.state === 'title'));
  found.then((back) => { if (back && app.state === 'title') loadProfile(); });
  await Promise.race([found, new Promise((r) => setTimeout(r, 6000))]);
  if (resume.save) writeSave(resume.save, { notify: false });
  loadProfile();
  await loadingStep(1, 'Opening the gates...');

  // the first frame, so the title has something behind it
  game.demo();
  $('#loading').classList.remove('show');
  showTitle();
  requestAnimationFrame(loop);
  if (resume.playing) play();
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  app.renderer.setSize(w, h, false);
  app.game.resize(w, h);
}

/* -------------------------------------------------------------------------- */
/*                                   profile                                  */
/* -------------------------------------------------------------------------- */

let saveTimer = 0;
function loadProfile() {
  app.profile = new Profile(readSave());
  app.profile.onChange = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
    app.hud.setCoins(app.profile.coins);
  };
  paintRecord();
  app.hud.setCoins(app.profile.coins);
}

function saveNow() {
  clearTimeout(saveTimer);
  if (app.profile) writeSave(app.profile.toJSON());
}

function paintRecord() {
  const d = app.profile.d;
  $('#rec-coins').textContent = d.coins;
  $('#rec-best').textContent = d.best ? `${d.best}` : '—';
  $('#rec-kills').textContent = d.kills;
  $('#btn-play').textContent = d.wave > 1 ? `CONTINUE · WAVE ${d.wave}` : 'PLAY';
}

/* -------------------------------------------------------------------------- */
/*                                    menus                                   */
/* -------------------------------------------------------------------------- */

function showPanel(id) {
  for (const p of ['panel-main', 'panel-account', 'panel-offline', 'panel-settings']) $('#' + p).classList.toggle('hidden', p !== id);
  if (id === 'panel-main') paintRecord();
}

function showTitle() {
  app.state = 'title';
  $('#title').classList.add('show');
  app.hud.show(false);
  showPanel('panel-main');
  app.account.paint();
}

function wireMenus() {
  const s = app.sound;
  app.account = new AccountUI({
    showPanel,
    sound: s,
    onChanged: (note) => {
      loadProfile();
      if (note) $('#save-line').textContent = note;
    },
  });
  for (const b of $$('[data-back]')) b.addEventListener('click', () => { s.click(); showPanel('panel-main'); });
  $('#btn-play').addEventListener('click', () => { s.unlock(); play(); });
  $('#btn-settings').addEventListener('click', () => { s.unlock(); s.click(); renderSettings($('#settings-list'), s); showPanel('panel-settings'); });
  // the first tap anywhere wakes the audio
  window.addEventListener('pointerdown', () => s.unlock(), { once: true });

  app.inventory = new InventoryUI({
    profile: () => app.profile,
    atStall: () => app.game.atStall() && app.game.waves.state === 'rest',
    onChange: () => { equipFromProfile(); },
    onClose: () => resume(),
    sound: s,
    toast: (t, d) => app.hud.toast(t, d),
  });
  app.shop = new ShopUI({
    profile: () => app.profile,
    onChange: () => { app.hud.setCoins(app.profile.coins, true); },
    onClose: () => resume(),
    sound: s,
    toast: (t, d) => app.hud.toast(t, d),
  });

  $('#btn-resume').addEventListener('click', () => { s.click(); $('#pause').classList.add('hidden'); resume(); });
  $('#btn-pause-settings').addEventListener('click', () => {
    s.click();
    const box = $('#pause-settings');
    box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) renderSettings(box, s);
  });
  $('#btn-quit').addEventListener('click', () => { s.click(); quit(); });
  $('#btn-again').addEventListener('click', () => { s.click(); again(); });

  // on a keyboard, Esc (or the key that opened it) closes whatever is open
  window.addEventListener('keydown', (e) => {
    if (e.repeat || (e.target && e.target.tagName === 'INPUT')) return;
    const k = e.code;
    if (app.state === 'bag' && (k === 'Escape' || k === 'KeyI' || k === 'Tab')) { e.preventDefault(); app.inventory.close(); }
    else if (app.state === 'shop' && (k === 'Escape' || k === 'KeyE')) app.shop.close();
    else if (app.state === 'paused' && (k === 'Escape' || k === 'KeyP')) { $('#pause').classList.add('hidden'); resume(); }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      saveNow();
      cloud.flush();
      if (app.state === 'playing') openPause();
    }
  });
  window.addEventListener('pagehide', () => { saveNow(); cloud.flush(); });
}

function openPause() {
  if (app.state !== 'playing') return;
  app.state = 'paused';
  $('#pause').classList.remove('hidden');
  $('#pause-settings').classList.add('hidden');
  app.account.paint();
  app.sound.setDrums(false);
  saveNow();
  cloud.flush();
}

function openBag() {
  if (app.state !== 'playing') return;
  app.state = 'bag';
  app.inventory.show();
}

function openShop() {
  if (app.state !== 'playing') return;
  app.state = 'shop';
  app.shop.show();
  app.sound.coin();
}

/** Back to the fight from any menu. */
function resume() {
  if (app.state === 'title' || app.state === 'fallen') return;
  app.state = 'playing';
  app.input.releaseAll();
  if (app.game.waves.fighting) app.sound.setDrums(true);
}

function quit() {
  $('#pause').classList.add('hidden');
  saveNow();
  cloud.flush();
  app.sound.setDrums(false);
  app.hud.clearFloaters();
  app.game.demo();
  showTitle();
}

/* -------------------------------------------------------------------------- */
/*                                   playing                                  */
/* -------------------------------------------------------------------------- */

/** Into the arena: the middle of the sand, and - on a fresh run - the doors open at once. */
function play() {
  const g = app.game;
  $('#title').classList.remove('show');
  app.hud.show(true);
  app.hud.clearFloaters();
  g.clearAll();
  g.spawnKeeper();
  g.spawnPlayer(app.input, app.profile.gear());
  app.input.releaseAll();
  app.state = 'playing';
  app.hud.setCoins(app.profile.coins);
  const wave = app.profile.d.wave;
  g.waves.wave = wave;
  if (wave <= 1) g.waves.begin(1);
  else g.waves.rest();
  fullscreen();
  setTimeout(() => $('#rotate').classList.add('gone'), 6000);
}

/** After a fall: back on your feet in the middle, doors open, wave 1 next. */
function again() {
  const g = app.game;
  $('#death').classList.add('hidden');
  g.waves.reset();
  g.blood.clear();
  g.arena.clearBlood();
  app.hud.clearFloaters();
  g.spawnPlayer(app.input, app.profile.gear());
  g.waves.wave = 1;
  g.waves.rest();
  app.state = 'playing';
  app.input.releaseAll();
}

/** The sword and shield in your hands match the slots. */
function equipFromProfile() {
  const p = app.game.player;
  if (!p || !p.alive) return;
  const gear = app.profile.gear();
  p.equip('weapon', gear.weapon);
  p.equip('offhand', gear.offhand);
}

function fullscreen() {
  const el = document.documentElement;
  if (!el.requestFullscreen || !matchMedia('(pointer: coarse)').matches || document.fullscreenElement) return;
  el.requestFullscreen().then(() => {
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
  }).catch(() => {});
}

/* -------------------------------------------------------------------------- */
/*                                   events                                   */
/* -------------------------------------------------------------------------- */

function wireGame() {
  const g = app.game, s = app.sound;
  g.on('hit', (v, h) => {
    s.hit(h.kind, h.speed, h.point, h.blocked);
    if (v === g.player) {
      app.hud.hurt();
      g.cam.shake(Math.min(0.12, 0.03 + h.damage * 0.004));
      if (h.damage > 9 && Math.random() < 0.5) s.grunt(h.point, 1.1);
    } else if (h.attacker === g.player) {
      if (h.damage > 12 && Math.random() < 0.4) s.grunt(h.point, 0.9 + Math.random() * 0.3);
      if (h.damage > 14) g.arena.cheer(0.25);
    }
  });
  g.on('blocked', (f, h) => {
    s.block(!!h.shield || !!f.shield, h.point || f.chest.x);
    if (f === g.player) g.cam.shake(0.02);
  });
  g.on('guardbreak', (f) => { if (f === g.player) app.hud.toast('Guard broken: out of stamina'); });
  g.on('swing', (f, at, kind) => s.whoosh(at, f.weapon ? 'swing' : kind === 'kick' ? 'kick' : 'jab'));
  g.on('thud', (p, sp) => s.thud(sp, p));
  g.on('shot', (f, at) => s.shot(at));
  g.on('ricochet', (at, kind) => s.ricochet(at, kind));
  g.on('gate', (gate) => {
    const a = gate.angle;
    s.gate(!!gate.player, new Vector3(Math.sin(a) * R, 1.5, Math.cos(a) * R));
  });
  g.on('land', (f, vy) => { if (f === g.player) s.step(f.root, inSand(f)); });
  g.on('tired', (f) => {
    if (f !== g.player) return;
    const now = performance.now();
    if (now - (app.tiredAt || 0) > 900) { app.tiredAt = now; s.deny(); app.hud.toast('Out of breath', 1.2); }
  });
  g.on('taunt', () => g.arena.cheer(0.35));
  g.on('down', (f) => { if (f.team === 'enemy') { g.arena.cheer(0.3); } });

  g.on('death', (f) => {
    if (f === g.player) {
      g.waves.defeat();
      return;
    }
    if (f.team !== 'enemy' || app.state === 'title') return;
    const coins = g.waves.onDeath(f);
    g.arena.cheer(0.9);
    s.cheer(0.8);
    if (coins > 0 && app.profile) {
      app.profile.kill();
      app.profile.addCoins(coins);
      app.hud.coinPop(f.chest.x, coins);
      app.hud.setCoins(app.profile.coins, true);
      s.coin();
    }
  });

  g.on('waveIntro', (n, count) => {
    app.hud.banner(`WAVE ${n}`, `${count} box ragdoll${count === 1 ? '' : 's'}${n % 5 === 0 ? ' and a champion' : ''}`, 2.6);
    s.horn();
    g.arena.cheer(0.6);
    s.cheer(0.6);
    s.setDrums(true);
  });
  g.on('waveStart', () => { app.hud.banner('FIGHT!', '', 1.1); g.arena.cheer(1); s.cheer(1); });
  g.on('waveCleared', (n, coins) => {
    app.hud.banner(`WAVE ${n} CLEARED`, `+${coins} coins`, 3);
    if (app.profile) {
      app.profile.addCoins(coins);
      app.profile.cleared(n);
      app.hud.setCoins(app.profile.coins, true);
    }
    s.victory();
    s.cheer(1.4);
    g.arena.cheer(1.2);
    s.setDrums(false);
  });
  g.on('rest', () => {
    app.restT = 0;
  });
  g.on('defeat', (wave, run) => {
    s.setDrums(false);
    s.defeat();
    g.cam.mode = 'watch';
    if (app.profile) app.profile.fell();
    app.state = 'fallen';
    $('#death-wave').textContent = `on wave ${wave}`;
    $('#death-kills').textContent = run.kills;
    $('#death-coins').textContent = run.coins;
    $('#death-best').textContent = app.profile ? app.profile.d.best : 0;
    setTimeout(() => { if (app.state === 'fallen') $('#death').classList.remove('hidden'); }, 2600);
  });
}

function inSand(f) { return f.root.x * f.root.x + f.root.z * f.root.z < R * R; }

/* -------------------------------------------------------------------------- */
/*                                  settings                                  */
/* -------------------------------------------------------------------------- */

const quality = { t: 0, n: 0, sum: 0, level: 0 };

function applySettings() {
  const g = app.game, r = app.renderer;
  app.sound.setSfx(settings.sfx);
  app.sound.setMusic(settings.music);
  g.cam.sens = 0.0055 * settings.look;
  g.blood.enabled = settings.blood;
  const q = settings.effectiveQuality;
  const small = Math.min(window.innerWidth, window.innerHeight) < 500;
  r.setPixelRatio(q === 'low' ? Math.min(1, window.devicePixelRatio || 1) : Math.min(window.devicePixelRatio || 1, small ? 2 : 1.6));
  g.arena.sun.castShadow = q !== 'low';
  g.lowPower = q === 'low';
  g.arena.lowPower = q === 'low';
  quality.level = q === 'low' ? 2 : 0;
  if (app.renderer.domElement) resize();
}

/* A phone that cannot keep up on 'auto' gets a lighter picture: first fewer
   pixels, then no shadows and fewer physics substeps. Judged over a few
   seconds of play, at most twice. */
function adapt(dt) {
  if (settings.quality !== 'auto' || quality.level >= 2 || dt > 0.25) return;
  quality.t += dt; quality.sum += dt; quality.n++;
  if (quality.t < 4) return;
  const avg = quality.sum / quality.n;
  quality.t = 0; quality.sum = 0; quality.n = 0;
  if (avg < 0.026) return;
  quality.level++;
  if (quality.level === 1) {
    app.renderer.setPixelRatio(Math.min(1, window.devicePixelRatio || 1));
    resize();
  } else {
    app.game.arena.sun.castShadow = false;
    app.game.lowPower = true;
    app.game.arena.lowPower = true;
  }
}

/* -------------------------------------------------------------------------- */
/*                                 the Stall                                  */
/* -------------------------------------------------------------------------- */

/** What is for sale hangs on the back wall of the Stall. */
function dressStall() {
  const models = STOCK.map((kind) => {
    const h = new Held(app.game, kind, true);
    const m = h.mesh;
    if (ITEMS[kind].slot === 'weapon') {
      m.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), kind === 'wooden_sword' ? 0.5 : -0.5)
        .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2));
    } else {
      m.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
    }
    return m;
  });
  app.game.arena.dressStall(models);
}

/* -------------------------------------------------------------------------- */
/*                                    loop                                    */
/* -------------------------------------------------------------------------- */

let last = performance.now();

function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const g = app.game;
  const st = app.state;
  g.paused = !(st === 'title' || st === 'playing' || st === 'fallen');
  if (st === 'playing') playTick(dt);
  g.frame(dt, st === 'playing' || st === 'fallen' ? app.input : null);
  if (st !== 'title') app.hud.update(dt);
  if (st === 'playing') adapt(dt);
  const c = g.camera.position;
  app.sound.listener.x = c.x; app.sound.listener.y = c.y; app.sound.listener.z = c.z;
  app.renderer.render(g.scene, g.camera);
  if (st !== 'playing') app.input.endFrame();
  requestAnimationFrame(loop);
}

function playTick(dt) {
  const g = app.game, inp = app.input, hud = app.hud, w = g.waves;
  const p = g.player;
  if (inp.pressed('inventory')) { openBag(); return; }
  if (inp.pressed('pause')) { openPause(); return; }
  if (!p) return;

  // what the big button in the middle does right now
  let ctx = null, hint = '';
  const inside = g.arena.inArena(p.root.x, p.root.z, 0.6);
  const outside = !g.arena.inArena(p.root.x, p.root.z, -1.2);
  if (w.state === 'rest' && p.alive) {
    if (g.atStall()) { ctx = 'OPEN THE STALL'; hint = ''; }
    else if (inside) { ctx = `START WAVE ${w.wave}`; hint = 'The south doors are open. The Stall is outside: buy gear, then come back in.'; }
    else if (outside) hint = 'Walk up to the Stall\'s counter to buy and sell. Come back inside to start the next wave.';
    app.restT = (app.restT || 0) + dt;
    if (app.restT > 14 && hint) hint = '';
  }
  hud.context(ctx);
  hud.hint(hint);
  if (ctx && inp.pressed('use')) {
    if (ctx === 'OPEN THE STALL') openShop();
    else { w.begin(w.wave); app.sound.click(); }
  }
  // walking up to the counter opens the Stall once
  const at = g.atStall() && w.state === 'rest';
  if (at && !app.wasAtStall) openShop();
  app.wasAtStall = at;
  g.arena.showMarkers(w.state === 'rest' && !at, false);

  app.sound.crowdLevel(inside ? 1 : 0.45);
  // footsteps
  if (p.state === 'active' && !p.air) {
    const sp = Math.hypot(p.vel.x, p.vel.z);
    const half = Math.floor(p.phase * 2);
    if (sp > 0.6 && half !== app.lastHalf) s_step(p);
    app.lastHalf = half;
  }
}

function s_step(p) { app.sound.step(p.root, inSand(p)); }

/* -------------------------------------------------------------------------- */
/*                                    start                                   */
/* -------------------------------------------------------------------------- */

// when a new version of the page arrives while you play, the viewer reloads it;
// this is how the game picks up again where you were
const hot = typeof window !== 'undefined' ? window.claude?.hot : null;
hot?.snapshot?.(() => {
  const playing = !!app.game && app.state !== 'title' && app.state !== 'boot';
  if (app.profile) saveNow();
  return { playing, save: app.profile ? app.profile.toJSON() : null };
});
if (hot?.ready) hot.ready((data) => boot(data || {}));
else boot(hot?.data ?? {});

// for tests and the curious
app.lib = { anim, roster, cloud };
window.__barrage = app;
