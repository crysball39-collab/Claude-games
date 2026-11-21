'use strict';
/* =============================================================================
   Small helpers, the save file, synthesized sound and input.
   ========================================================================== */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return (h ^ (h >>> 16)) >>> 0; }

function weightedPick(weights) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = Math.random() * total;
  for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
  return Object.keys(weights)[0];
}

function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
function fmtNum(n) {
  n = Math.floor(n);
  if (n >= 100000) return (n / 1000).toFixed(0) + 'K';
  if (n >= 10000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

/* --------------------------------- save ---------------------------------- */

const SAVE_KEY = 'hordeSurvivor.save.v1';
let SAVE = null;
let uidCounter = 1;

function newItem(type, level = 1) { return { uid: 'i' + Date.now().toString(36) + (uidCounter++).toString(36), type, level }; }

function defaultSave() {
  const shuriken = newItem('wood_shuriken');
  return {
    v: 1,
    gold: START_SAVE.gold,
    gems: START_SAVE.gems,
    items: [shuriken],
    equipped: { weapon: shuriken.uid, gloves: null, accessory: null, chest: null, helmet: null, belt: null },
    best: {},            // chapter id -> longest survival in seconds
    cleared: {},         // chapter id -> times finished
    settings: { sound: true, numbers: true },
    stats: { runs: 0, kills: 0, chests: 0 },
  };
}

function sanitizeSave(s) {
  const d = defaultSave();
  if (!s || typeof s !== 'object') return d;
  const out = Object.assign(d, s);
  out.settings = Object.assign(defaultSave().settings, s.settings || {});
  out.stats = Object.assign(defaultSave().stats, s.stats || {});
  out.items = Array.isArray(s.items) ? s.items.filter(i => i && ITEMS[i.type]) : d.items;
  out.items.forEach(i => { i.level = clamp(i.level | 0 || 1, 1, itemMax(i)); });
  out.equipped = Object.assign({ weapon: null, gloves: null, accessory: null, chest: null, helmet: null, belt: null }, s.equipped || {});
  for (const slot in out.equipped) {
    const it = out.items.find(i => i.uid === out.equipped[slot]);
    if (!it || ITEMS[it.type].slot !== slot) out.equipped[slot] = null;
  }
  out.gold = Math.max(0, +out.gold || 0);
  out.gems = Math.max(0, +out.gems || 0);
  return out;
}

function loadSave(fromHot) {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { /* storage blocked */ }
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { parsed = null; }
  if (!parsed && fromHot) parsed = fromHot;
  SAVE = sanitizeSave(parsed);
}
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* storage blocked */ }
}
function itemByUid(uid) { return SAVE.items.find(i => i.uid === uid) || null; }
function equippedItem(slot) { const uid = SAVE.equipped[slot]; return uid ? itemByUid(uid) : null; }
function isEquipped(item) { return SAVE.equipped[ITEMS[item.type].slot] === item.uid; }

function gearTotals() {
  let atk = BASE.atk, hp = BASE.hp;
  for (const s of SLOTS) {
    const it = equippedItem(s.id);
    if (!it) continue;
    if (s.stat === 'atk') atk += itemStat(it); else hp += itemStat(it);
  }
  const w = equippedItem('weapon');
  return { atk, hp, weapon: w ? ITEMS[w.type].weapon : null };
}

/* --------------------------------- sound --------------------------------- */
/* Every sound is synthesized with WebAudio, so nothing is downloaded. */

const Sfx = (() => {
  let ac = null, master = null, noise = null;
  const last = {};
  const gaps = { gem: 0.035, hit: 0.045, shoot: 0.06, boom: 0.07, fire: 0.25, hurt: 0.18, coin: 0.05, spike: 0.08, thud: 0.1 };

  function unlock() {
    if (ac) { if (ac.state === 'suspended') ac.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ac = new AC();
      master = ac.createGain(); master.gain.value = 0.32; master.connect(ac.destination);
      noise = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ac = null; }
  }

  function tone(type, f0, f1, dur, vol, when = 0) {
    const t = ac.currentTime + when;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function hiss(dur, vol, f0, f1, type = 'lowpass', when = 0) {
    const t = ac.currentTime + when;
    const s = ac.createBufferSource(); s.buffer = noise;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
  }

  const bank = {
    gem: () => tone('sine', 1250 + Math.random() * 200, 1750, 0.06, 0.12),
    coin: () => { tone('square', 1320, 1320, 0.05, 0.05); tone('square', 1760, 1760, 0.08, 0.05, 0.05); },
    hit: () => tone('triangle', 260, 120, 0.05, 0.07),
    shoot: () => tone('square', 700, 420, 0.04, 0.025),
    boom: () => { hiss(0.38, 0.45, 1400, 120); tone('sine', 90, 40, 0.3, 0.3); },
    bigboom: () => { hiss(0.8, 0.6, 1800, 80); tone('sine', 70, 30, 0.7, 0.45); },
    fire: () => hiss(0.3, 0.12, 2400, 600, 'bandpass'),
    spike: () => hiss(0.12, 0.12, 3000, 800, 'highpass'),
    thud: () => { tone('sine', 120, 45, 0.25, 0.4); hiss(0.2, 0.25, 700, 100); },
    hurt: () => tone('sawtooth', 190, 70, 0.14, 0.13),
    levelup: () => [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.16, 0.13, i * 0.07)),
    evolve: () => { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone('triangle', f, f, 0.3, 0.12, i * 0.06)); hiss(0.6, 0.08, 6000, 2000, 'highpass', 0.3); },
    pick: () => tone('sine', 660, 990, 0.09, 0.1),
    click: () => tone('square', 900, 700, 0.03, 0.04),
    warn: () => { for (let i = 0; i < 3; i++) { tone('sawtooth', 440, 440, 0.22, 0.09, i * 0.5); tone('sawtooth', 330, 330, 0.22, 0.09, i * 0.5 + 0.25); } },
    wave: () => { tone('sawtooth', 110, 220, 0.6, 0.12); tone('sawtooth', 165, 330, 0.6, 0.08, 0.1); },
    chest: () => { hiss(0.5, 0.1, 5000, 1500, 'highpass'); [784, 988, 1175, 1568].forEach((f, i) => tone('sine', f, f, 0.25, 0.1, 0.25 + i * 0.08)); },
    buy: () => { tone('square', 523, 523, 0.06, 0.05); tone('square', 784, 784, 0.1, 0.05, 0.06); },
    win: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone('triangle', f, f, 0.22, 0.13, i * 0.12)),
    lose: () => [392, 349, 311, 262].forEach((f, i) => tone('triangle', f, f * 0.98, 0.3, 0.13, i * 0.22)),
    roar: () => { tone('sawtooth', 120, 60, 0.7, 0.2); hiss(0.7, 0.2, 900, 200); },
  };

  return {
    unlock,
    play(name) {
      if (!ac || !SAVE || !SAVE.settings.sound) return;
      const now = ac.currentTime, gap = gaps[name] || 0;
      if (gap && last[name] && now - last[name] < gap) return;
      last[name] = now;
      try { bank[name] && bank[name](); } catch (e) { /* ignore */ }
    },
  };
})();

/* --------------------------------- input --------------------------------- */
/* A floating joystick wherever the finger lands, plus WASD / arrow keys. */

const Input = {
  keys: new Set(),
  joy: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 },
  JOY_R: 46,
  axis() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('ArrowLeft') || k.has('KeyA')) x -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) x += 1;
    if (k.has('ArrowUp') || k.has('KeyW')) y -= 1;
    if (k.has('ArrowDown') || k.has('KeyS')) y += 1;
    let m = Math.hypot(x, y);
    if (m > 0) { x /= m; y /= m; m = 1; }
    const j = this.joy;
    if (j.active) {
      const dx = j.x - j.ox, dy = j.y - j.oy, d = Math.hypot(dx, dy);
      if (d > 6) {
        const s = Math.min(1, d / (this.JOY_R * 0.75));
        x = dx / d * s; y = dy / d * s; m = s;
      }
    }
    return { x, y, m };
  },
  attach(el, onAnyInput) {
    const j = this.joy;
    el.addEventListener('pointerdown', e => {
      onAnyInput && onAnyInput();
      if (j.active) return;
      j.active = true; j.id = e.pointerId; j.ox = j.x = e.clientX; j.oy = j.y = e.clientY;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      e.preventDefault();
    });
    el.addEventListener('pointermove', e => {
      if (!j.active || e.pointerId !== j.id) return;
      j.x = e.clientX; j.y = e.clientY;
      // Drag the base along so the stick never needs a long reach back.
      const dx = j.x - j.ox, dy = j.y - j.oy, d = Math.hypot(dx, dy), max = this.JOY_R * 1.25;
      if (d > max) { j.ox = j.x - dx / d * max; j.oy = j.y - dy / d * max; }
    });
    const end = e => { if (e.pointerId === j.id) { j.active = false; j.id = null; } };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    window.addEventListener('keydown', e => {
      onAnyInput && onAnyInput();
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); j.active = false; });
  },
  reset() { this.keys.clear(); this.joy.active = false; this.joy.id = null; },
};
