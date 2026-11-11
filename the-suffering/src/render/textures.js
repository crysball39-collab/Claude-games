/* =============================================================================
   Every picture in the game is painted here, onto canvases, when it loads.
   There are no image files.

   Three kinds: tiling surfaces for the city, one atlas of decals (blood,
   wounds, bullet holes, the odd effect sprite), and one atlas of faces that
   is repainted as people's expressions change.
   ========================================================================== */
import * as THREE from 'three';
import { mulberry, TAU, clamp01 } from '../core/util.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function tex(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}
function speckle(ctx, w, h, rng, n, colors, size = 1.6) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(rng() * colors.length) | 0];
    const s = 0.5 + rng() * size;
    ctx.fillRect(rng() * w, rng() * h, s, s);
  }
}

/* ------------------------------- surfaces --------------------------------- */

export function asphaltTexture() {
  const c = canvas(256, 256), x = c.getContext('2d'), r = mulberry(11);
  x.fillStyle = '#2b2d31'; x.fillRect(0, 0, 256, 256);
  speckle(x, 256, 256, r, 2600, ['#33363b', '#24262a', '#3a3d42', '#1f2124'], 2);
  // old repairs and oil
  x.globalAlpha = 0.18;
  for (let i = 0; i < 5; i++) { x.fillStyle = r() < 0.5 ? '#1a1b1e' : '#3c3f45'; x.fillRect(r() * 220, r() * 220, 20 + r() * 60, 8 + r() * 30); }
  x.globalAlpha = 1;
  return tex(c);
}

export function pavementTexture() {
  const c = canvas(256, 256), x = c.getContext('2d'), r = mulberry(5);
  x.fillStyle = '#8b8d8c'; x.fillRect(0, 0, 256, 256);
  speckle(x, 256, 256, r, 1800, ['#959796', '#7f8180', '#a0a2a0', '#777978'], 2);
  x.strokeStyle = 'rgba(40,42,44,0.55)'; x.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); }
  // a few darker slabs, gum, a crack
  x.globalAlpha = 0.12; x.fillStyle = '#3a3c3d';
  for (let i = 0; i < 6; i++) x.fillRect(((r() * 4) | 0) * 64 + 2, ((r() * 4) | 0) * 64 + 2, 60, 60);
  x.globalAlpha = 0.5; x.fillStyle = '#4b4d4e';
  for (let i = 0; i < 26; i++) { x.beginPath(); x.arc(r() * 256, r() * 256, 1 + r() * 2, 0, TAU); x.fill(); }
  x.globalAlpha = 1;
  return tex(c);
}

export function grassTexture() {
  const c = canvas(256, 256), x = c.getContext('2d'), r = mulberry(8);
  x.fillStyle = '#3f5a33'; x.fillRect(0, 0, 256, 256);
  speckle(x, 256, 256, r, 5200, ['#48663a', '#36502c', '#52733f', '#2f4727', '#5a7a45'], 2.4);
  return tex(c);
}

const FACADES = [
  { wall: '#6f4a3d', line: '#573a30', glass: '#2c3a47', lit: '#e9c877', frame: '#3a2a24', brick: true },
  { wall: '#8e8f8a', line: '#74756f', glass: '#33424e', lit: '#f0d48a', frame: '#55564f' },
  { wall: '#b7a98d', line: '#9a8e75', glass: '#2a3640', lit: '#f3d99a', frame: '#6d624d' },
  { wall: '#3e4650', line: '#2f363e', glass: '#5d7386', lit: '#dfe8ee', frame: '#252b31', curtain: true },
  { wall: '#c9c7c0', line: '#aeaca4', glass: '#2e3b46', lit: '#f6e2a8', frame: '#8a887f' },
  { wall: '#5d3b33', line: '#492d27', glass: '#283340', lit: '#e3b862', frame: '#2e1d19', brick: true },
];
export const FACADE_COUNT = FACADES.length;

/** One tile is four windows wide and four storeys tall: 12.8 m each way. */
export function facadeTexture(i) {
  const f = FACADES[i % FACADES.length];
  const c = canvas(256, 256), x = c.getContext('2d'), r = mulberry(40 + i * 7);
  x.fillStyle = f.wall; x.fillRect(0, 0, 256, 256);
  if (f.brick) {
    x.strokeStyle = f.line; x.lineWidth = 1;
    for (let y = 0; y < 256; y += 8) {
      x.beginPath(); x.moveTo(0, y + 0.5); x.lineTo(256, y + 0.5); x.stroke();
      for (let bx = (y / 8) % 2 ? 0 : 8; bx < 256; bx += 16) { x.beginPath(); x.moveTo(bx + 0.5, y); x.lineTo(bx + 0.5, y + 8); x.stroke(); }
    }
  } else {
    speckle(x, 256, 256, r, 900, [f.line, f.wall], 2);
    x.strokeStyle = f.line; x.lineWidth = 2;
    for (let y = 0; y <= 256; y += 64) { x.beginPath(); x.moveTo(0, y); x.lineTo(256, y); x.stroke(); }
  }
  for (let wy = 0; wy < 4; wy++) for (let wx = 0; wx < 4; wx++) {
    const ox = wx * 64, oy = wy * 64;
    const m = f.curtain ? 4 : 13, top = f.curtain ? 4 : 12, bot = f.curtain ? 4 : 18;
    const lit = r() < 0.2;
    x.fillStyle = f.frame; x.fillRect(ox + m - 2, oy + top - 2, 64 - 2 * m + 4, 64 - top - bot + 4);
    const g = x.createLinearGradient(0, oy + top, 0, oy + 64 - bot);
    if (lit) { g.addColorStop(0, f.lit); g.addColorStop(1, '#b98f47'); }
    else { g.addColorStop(0, f.glass); g.addColorStop(1, '#141b22'); }
    x.fillStyle = g; x.fillRect(ox + m, oy + top, 64 - 2 * m, 64 - top - bot);
    // a reflection of the sky, a mullion, sometimes a blind half down
    x.fillStyle = 'rgba(190,205,220,0.13)';
    x.beginPath(); x.moveTo(ox + m, oy + top); x.lineTo(ox + m + 16, oy + top); x.lineTo(ox + m, oy + top + 22); x.fill();
    x.fillStyle = f.frame; x.fillRect(ox + 31, oy + top, 2, 64 - top - bot);
    if (!f.curtain && r() < 0.35) { x.fillStyle = 'rgba(225,220,205,0.5)'; x.fillRect(ox + m, oy + top, 64 - 2 * m, 6 + r() * 16); }
    if (!f.curtain) { x.fillStyle = f.line; x.fillRect(ox + m - 4, oy + 64 - bot + 2, 64 - 2 * m + 8, 3); }
  }
  // rain streaks under the sills
  x.globalAlpha = 0.1; x.fillStyle = '#000';
  for (let i2 = 0; i2 < 30; i2++) x.fillRect(r() * 256, r() * 256, 1.5, 10 + r() * 30);
  x.globalAlpha = 1;
  return tex(c);
}

export function crateTexture() {
  const c = canvas(128, 128), x = c.getContext('2d'), r = mulberry(3);
  x.fillStyle = '#8a6a42'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 5; i++) {
    x.fillStyle = ['#8f6e45', '#836440', '#96744a', '#7c5e3b', '#8b6a43'][i];
    x.fillRect(0, i * 25.6, 128, 25.6);
    x.strokeStyle = 'rgba(40,26,12,0.5)'; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(0, i * 25.6); x.lineTo(128, i * 25.6); x.stroke();
  }
  x.strokeStyle = 'rgba(60,40,20,0.25)'; x.lineWidth = 1;
  for (let i = 0; i < 70; i++) { const y = r() * 128, x0 = r() * 128; x.beginPath(); x.moveTo(x0, y); x.lineTo(x0 + 10 + r() * 40, y + (r() - 0.5) * 2); x.stroke(); }
  // frame and a diagonal brace
  x.strokeStyle = '#5d4426'; x.lineWidth = 14; x.strokeRect(7, 7, 114, 114);
  x.lineWidth = 12; x.beginPath(); x.moveTo(12, 12); x.lineTo(116, 116); x.stroke();
  x.strokeStyle = 'rgba(30,20,8,0.55)'; x.lineWidth = 1.5; x.strokeRect(14, 14, 100, 100); x.strokeRect(0.75, 0.75, 126.5, 126.5);
  x.fillStyle = '#2f2516';
  for (const [px, py] of [[7, 7], [121, 7], [7, 121], [121, 121], [64, 7], [64, 121], [7, 64], [121, 64]]) { x.beginPath(); x.arc(px, py, 2.2, 0, TAU); x.fill(); }
  return tex(c);
}

export function skyTexture() {
  const c = canvas(16, 256), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  // the top of the canvas is straight up; the horizon is half way down
  g.addColorStop(0, '#465262'); g.addColorStop(0.3, '#6f7c89'); g.addColorStop(0.44, '#a2a6a5');
  g.addColorStop(0.5, '#c0b6a4'); g.addColorStop(0.53, '#a4a6a3'); g.addColorStop(1, '#8d9296');
  x.fillStyle = g; x.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------ decal atlas ------------------------------- */

export const ATLAS_COLS = 8, ATLAS_ROWS = 4;
/** Where each decal lives in the atlas: [column, row]. */
export const DECAL = {
  splat: [[0, 0], [1, 0], [2, 0], [3, 0]], pool: [[4, 0], [5, 0]], drip: [[6, 0], [7, 0]],
  entry: [0, 1], exit: [1, 1], cut: [2, 1], slash: [3, 1], stab: [4, 1], bruise: [5, 1], stump: [6, 1], scrape: [7, 1],
  hole: [0, 2], chip: [1, 2], smear: [[2, 2], [3, 2]], vomit: [4, 2], bruise2: [5, 2], mist: [6, 2], dot: [7, 2],
  shadow: [0, 3], ring: [1, 3], flash: [2, 3], smoke: [3, 3], streak: [[4, 3], [5, 3]], glow: [6, 3], white: [7, 3],
};

const BLOOD = '#7d0606', BLOOD_DARK = '#4a0202', BLOOD_BRIGHT = '#a30c0c';

function blobPath(x, cx, cy, r, rough, rng, n = 14, sx = 1, sy = 1) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, rr = r * (1 + (rng() - 0.5) * rough);
    pts.push([cx + Math.cos(a) * rr * sx, cy + Math.sin(a) * rr * sy]);
  }
  x.beginPath();
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    if (i === 0) x.moveTo(mx, my);
    const nn = pts[(i + 2) % n];
    x.quadraticCurveTo(q[0], q[1], (q[0] + nn[0]) / 2, (q[1] + nn[1]) / 2);
  }
  x.closePath();
}

function drawSplat(x, rng, big) {
  x.fillStyle = BLOOD;
  blobPath(x, 64, 64, big ? 30 : 24, 0.6, rng); x.fill();
  const spikes = 7 + ((rng() * 8) | 0);
  for (let i = 0; i < spikes; i++) {
    const a = rng() * TAU, len = 24 + rng() * 30, w = 2 + rng() * 5;
    x.save(); x.translate(64, 64); x.rotate(a);
    x.beginPath(); x.moveTo(8, -w); x.quadraticCurveTo(len * 0.6, -w * 0.6, len, 0); x.quadraticCurveTo(len * 0.6, w * 0.6, 8, w); x.fill();
    if (rng() < 0.7) { x.beginPath(); x.arc(len + 3 + rng() * 6, (rng() - 0.5) * 4, 1.5 + rng() * 2.8, 0, TAU); x.fill(); }
    x.restore();
  }
  for (let i = 0; i < 12; i++) { const a = rng() * TAU, d = 30 + rng() * 28; x.beginPath(); x.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 0.8 + rng() * 2.4, 0, TAU); x.fill(); }
  x.fillStyle = BLOOD_DARK; x.globalAlpha = 0.55;
  blobPath(x, 64 + (rng() - 0.5) * 6, 64 + (rng() - 0.5) * 6, big ? 18 : 13, 0.5, rng); x.fill();
  x.globalAlpha = 1;
}

function drawPool(x, rng) {
  const g = x.createRadialGradient(64, 64, 6, 64, 64, 58);
  g.addColorStop(0, '#3f0101'); g.addColorStop(0.7, '#640404'); g.addColorStop(1, '#7a0707');
  x.fillStyle = g;
  blobPath(x, 64, 64, 52, 0.22, rng, 16); x.fill();
  // the wet edge catches the light
  x.strokeStyle = 'rgba(190,40,40,0.5)'; x.lineWidth = 1.6;
  blobPath(x, 64, 64, 49, 0.2, mulberry(9), 16); x.stroke();
  x.fillStyle = 'rgba(255,190,190,0.14)';
  x.beginPath(); x.ellipse(48, 46, 15, 6, -0.6, 0, TAU); x.fill();
}

function drawDrip(x, rng) {
  x.fillStyle = BLOOD;
  blobPath(x, 64, 16, 11, 0.5, rng, 10); x.fill();
  const runs = 1 + ((rng() * 3) | 0);
  for (let i = 0; i < runs; i++) {
    const ox = 64 + (i - (runs - 1) / 2) * 9 + (rng() - 0.5) * 4, len = 50 + rng() * 55, w = 3 + rng() * 2.4;
    x.beginPath(); x.moveTo(ox - w, 16); x.lineTo(ox - w * 0.55, 16 + len); x.arc(ox, 16 + len, w * 0.75, Math.PI, 0, true); x.lineTo(ox + w, 16); x.fill();
  }
  x.fillStyle = BLOOD_DARK; x.globalAlpha = 0.45; blobPath(x, 64, 16, 6, 0.4, rng, 8); x.fill(); x.globalAlpha = 1;
}

function drawStreak(x, rng) {
  x.fillStyle = BLOOD;
  x.beginPath(); x.ellipse(40, 64, 26, 13, 0, 0, TAU); x.fill();
  x.beginPath(); x.moveTo(40, 52); x.quadraticCurveTo(92, 56, 122, 64); x.quadraticCurveTo(92, 72, 40, 76); x.fill();
  for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(70 + rng() * 54, 64 + (rng() - 0.5) * 30, 1 + rng() * 2.6, 0, TAU); x.fill(); }
  x.fillStyle = BLOOD_DARK; x.globalAlpha = 0.5; x.beginPath(); x.ellipse(38, 64, 15, 7, 0, 0, TAU); x.fill(); x.globalAlpha = 1;
}

function taperedLine(x, x0, y0, x1, y1, w, bow = 0) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
  const mx = (x0 + x1) / 2 + nx * bow, my = (y0 + y1) / 2 + ny * bow;
  x.beginPath(); x.moveTo(x0, y0);
  x.quadraticCurveTo(mx + nx * w, my + ny * w, x1, y1);
  x.quadraticCurveTo(mx - nx * w, my - ny * w, x0, y0);
  x.fill();
}

function paintDecals(x) {
  const cell = (c, fn) => { x.save(); x.translate(c[0] * 128, c[1] * 128); x.beginPath(); x.rect(0, 0, 128, 128); x.clip(); fn(); x.restore(); };
  DECAL.splat.forEach((c, i) => cell(c, () => drawSplat(x, mulberry(100 + i * 13), i % 2 === 0)));
  DECAL.pool.forEach((c, i) => cell(c, () => drawPool(x, mulberry(200 + i * 5))));
  DECAL.drip.forEach((c, i) => cell(c, () => drawDrip(x, mulberry(300 + i * 3))));
  DECAL.streak.forEach((c, i) => cell(c, () => drawStreak(x, mulberry(330 + i * 3))));

  cell(DECAL.entry, () => {
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 26);
    g.addColorStop(0, 'rgba(20,0,0,1)'); g.addColorStop(0.35, 'rgba(70,4,4,1)'); g.addColorStop(0.6, 'rgba(120,20,16,0.8)'); g.addColorStop(1, 'rgba(120,30,20,0)');
    x.fillStyle = g; x.beginPath(); x.arc(64, 64, 26, 0, TAU); x.fill();
    x.fillStyle = '#0b0000'; x.beginPath(); x.arc(64, 64, 9, 0, TAU); x.fill();
    x.fillStyle = BLOOD; taperedLine(x, 62, 70, 60, 112, 4); taperedLine(x, 68, 70, 71, 98, 2.5);
  });
  cell(DECAL.exit, () => {
    const r = mulberry(71);
    x.fillStyle = BLOOD; blobPath(x, 64, 64, 38, 0.7, r, 13); x.fill();
    x.fillStyle = '#b05a4c';
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + r(); x.save(); x.translate(64, 64); x.rotate(a); x.beginPath(); x.moveTo(8, -7); x.lineTo(30 + r() * 10, 0); x.lineTo(8, 7); x.fill(); x.restore(); }
    x.fillStyle = '#2a0000'; blobPath(x, 64, 64, 19, 0.6, r, 11); x.fill();
    x.fillStyle = '#0a0000'; blobPath(x, 64, 64, 10, 0.5, r, 9); x.fill();
    x.fillStyle = BLOOD; taperedLine(x, 58, 84, 54, 124, 6); taperedLine(x, 72, 84, 78, 116, 4);
  });
  cell(DECAL.cut, () => {
    x.fillStyle = BLOOD_BRIGHT; taperedLine(x, 8, 64, 120, 64, 4.5, 3);
    x.fillStyle = BLOOD_DARK; taperedLine(x, 16, 64, 112, 64, 1.8, 3);
    x.fillStyle = BLOOD; for (let i = 0; i < 4; i++) taperedLine(x, 30 + i * 20, 66, 30 + i * 20 + 2, 78 + (i % 2) * 10, 1.8);
  });
  cell(DECAL.slash, () => {
    x.fillStyle = '#b4584a'; taperedLine(x, 4, 64, 124, 64, 15, 5);
    x.fillStyle = BLOOD_BRIGHT; taperedLine(x, 6, 64, 122, 64, 11, 5);
    x.fillStyle = BLOOD_DARK; taperedLine(x, 14, 64, 114, 64, 6, 5);
    x.fillStyle = '#1c0000'; taperedLine(x, 26, 65, 102, 65, 2.5, 5);
    x.fillStyle = BLOOD; for (let i = 0; i < 6; i++) taperedLine(x, 20 + i * 17, 70, 20 + i * 17 + 2, 92 + ((i * 7) % 3) * 11, 3);
  });
  cell(DECAL.stab, () => {
    const g = x.createRadialGradient(64, 64, 3, 64, 64, 24);
    g.addColorStop(0, 'rgba(120,10,10,0.9)'); g.addColorStop(1, 'rgba(120,10,10,0)');
    x.fillStyle = g; x.beginPath(); x.arc(64, 64, 24, 0, TAU); x.fill();
    x.fillStyle = BLOOD_BRIGHT; taperedLine(x, 44, 64, 84, 64, 8);
    x.fillStyle = '#120000'; taperedLine(x, 48, 64, 80, 64, 4);
    x.fillStyle = BLOOD; taperedLine(x, 62, 68, 60, 118, 4.5); taperedLine(x, 70, 68, 73, 100, 3);
  });
  const bruise = (seed, a, b) => {
    const r = mulberry(seed);
    for (let i = 0; i < 5; i++) {
      const cx = 64 + (r() - 0.5) * 34, cy = 64 + (r() - 0.5) * 30, rad = 22 + r() * 20;
      const g = x.createRadialGradient(cx, cy, 2, cx, cy, rad);
      g.addColorStop(0, a); g.addColorStop(0.6, b); g.addColorStop(1, 'rgba(120,110,40,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rad, 0, TAU); x.fill();
    }
  };
  cell(DECAL.bruise, () => bruise(31, 'rgba(66,24,84,0.75)', 'rgba(84,40,96,0.4)'));
  cell(DECAL.bruise2, () => bruise(37, 'rgba(96,20,40,0.7)', 'rgba(70,40,110,0.35)'));
  cell(DECAL.stump, () => {
    const r = mulberry(55);
    x.fillStyle = '#6e0a0a'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 60; i++) { x.fillStyle = ['#8f1414', '#560606', '#a11d1d', '#7a0d0d'][(r() * 4) | 0]; x.beginPath(); x.ellipse(r() * 128, r() * 128, 4 + r() * 12, 3 + r() * 6, r() * 3, 0, TAU); x.fill(); }
    x.strokeStyle = '#d7b9a2'; x.lineWidth = 7; x.strokeRect(3.5, 3.5, 121, 121);     // skin
    x.strokeStyle = '#e8d68e'; x.lineWidth = 4; x.strokeRect(10, 10, 108, 108);        // fat
    x.fillStyle = '#efe6d2'; x.beginPath(); x.arc(64, 64, 21, 0, TAU); x.fill();        // bone
    x.fillStyle = '#8c2a22'; x.beginPath(); x.arc(64, 64, 10, 0, TAU); x.fill();        // marrow
    x.strokeStyle = '#cfc4ad'; x.lineWidth = 2; x.beginPath(); x.arc(64, 64, 21, 0, TAU); x.stroke();
    x.fillStyle = '#3a0000'; for (let i = 0; i < 5; i++) { x.beginPath(); x.arc(24 + r() * 80, 24 + r() * 80, 3 + r() * 3, 0, TAU); x.fill(); } // vessels
  });
  cell(DECAL.scrape, () => {
    const r = mulberry(88);
    for (let i = 0; i < 16; i++) {
      x.fillStyle = r() < 0.5 ? BLOOD_BRIGHT : '#b8695a';
      const y = 20 + r() * 88, x0 = 6 + r() * 30;
      taperedLine(x, x0, y, x0 + 50 + r() * 60, y + (r() - 0.5) * 6, 1.4 + r() * 2);
    }
  });
  cell(DECAL.hole, () => {
    const g = x.createRadialGradient(64, 64, 6, 64, 64, 30);
    g.addColorStop(0, 'rgba(8,8,8,1)'); g.addColorStop(0.45, 'rgba(30,30,30,0.95)'); g.addColorStop(0.6, 'rgba(180,180,175,0.7)'); g.addColorStop(1, 'rgba(160,160,155,0)');
    x.fillStyle = g; x.beginPath(); x.arc(64, 64, 30, 0, TAU); x.fill();
    x.strokeStyle = 'rgba(20,20,20,0.7)'; x.lineWidth = 1.5;
    const r = mulberry(4);
    for (let i = 0; i < 6; i++) { const a = r() * TAU; x.beginPath(); x.moveTo(64 + Math.cos(a) * 12, 64 + Math.sin(a) * 12); x.lineTo(64 + Math.cos(a + 0.2) * (26 + r() * 22), 64 + Math.sin(a + 0.2) * (26 + r() * 22)); x.stroke(); }
  });
  cell(DECAL.chip, () => {
    const r = mulberry(14);
    x.fillStyle = 'rgba(200,198,190,0.8)'; blobPath(x, 64, 64, 34, 0.7, r, 11); x.fill();
    x.fillStyle = 'rgba(60,58,55,0.9)'; blobPath(x, 64, 64, 20, 0.6, r, 10); x.fill();
    x.fillStyle = '#0d0d0d'; x.beginPath(); x.arc(64, 64, 7, 0, TAU); x.fill();
  });
  DECAL.smear.forEach((c, i) => cell(c, () => {
    const r = mulberry(120 + i * 9);
    for (let k = 0; k < 22; k++) {
      x.fillStyle = k % 3 ? BLOOD : BLOOD_DARK; x.globalAlpha = 0.5 + r() * 0.5;
      const y = 26 + r() * 76, x0 = 4 + r() * 26;
      taperedLine(x, x0, y, 124 - r() * 30, y + (r() - 0.5) * 10, 2 + r() * 5, (r() - 0.5) * 6);
    }
    x.globalAlpha = 1;
  }));
  cell(DECAL.vomit, () => {
    const r = mulberry(66);
    x.fillStyle = '#9a9442'; blobPath(x, 64, 64, 40, 0.5, r, 13); x.fill();
    for (let i = 0; i < 40; i++) { x.fillStyle = ['#b9ae5a', '#7d7a33', '#c9b77a', '#a36f3a'][(r() * 4) | 0]; x.beginPath(); x.arc(64 + (r() - 0.5) * 70, 64 + (r() - 0.5) * 70, 1.5 + r() * 5, 0, TAU); x.fill(); }
  });
  cell(DECAL.mist, () => {
    const r = mulberry(21);
    x.fillStyle = BLOOD;
    for (let i = 0; i < 260; i++) { const a = r() * TAU, d = Math.pow(r(), 0.7) * 60; x.globalAlpha = 0.5 + r() * 0.5; x.beginPath(); x.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 0.5 + r() * 1.9, 0, TAU); x.fill(); }
    x.globalAlpha = 1;
  });
  cell(DECAL.dot, () => {
    x.fillStyle = BLOOD; blobPath(x, 64, 64, 40, 0.25, mulberry(2), 12); x.fill();
    x.fillStyle = BLOOD_DARK; x.globalAlpha = 0.5; x.beginPath(); x.arc(64, 64, 22, 0, TAU); x.fill(); x.globalAlpha = 1;
    x.fillStyle = 'rgba(255,200,200,0.25)'; x.beginPath(); x.ellipse(50, 50, 10, 5, -0.7, 0, TAU); x.fill();
  });
  const radial = (c, stops) => cell(c, () => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 62); stops.forEach(([o, col]) => g.addColorStop(o, col)); x.fillStyle = g; x.fillRect(0, 0, 128, 128); });
  radial(DECAL.shadow, [[0, 'rgba(0,0,0,0.62)'], [0.55, 'rgba(0,0,0,0.38)'], [1, 'rgba(0,0,0,0)']]);
  radial(DECAL.glow, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
  radial(DECAL.smoke, [[0, 'rgba(210,210,210,0.75)'], [0.5, 'rgba(180,180,180,0.4)'], [1, 'rgba(160,160,160,0)']]);
  cell(DECAL.ring, () => {
    x.strokeStyle = '#7fe9ff'; x.lineWidth = 7; x.beginPath(); x.arc(64, 64, 54, 0, TAU); x.stroke();
    x.strokeStyle = 'rgba(127,233,255,0.35)'; x.lineWidth = 14; x.beginPath(); x.arc(64, 64, 50, 0, TAU); x.stroke();
    x.strokeStyle = '#eaffff'; x.lineWidth = 2;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; x.beginPath(); x.moveTo(64 + Math.cos(a) * 40, 64 + Math.sin(a) * 40); x.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); x.stroke(); }
  });
  cell(DECAL.flash, () => {
    const r = mulberry(17);
    const g = x.createRadialGradient(64, 64, 2, 64, 64, 60);
    g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.3, 'rgba(255,220,120,0.95)'); g.addColorStop(1, 'rgba(255,140,30,0)');
    x.fillStyle = g;
    x.beginPath();
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, rr = i % 2 ? 18 + r() * 10 : 42 + r() * 20; x.lineTo(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr); }
    x.closePath(); x.fill();
  });
  cell(DECAL.white, () => { x.fillStyle = '#fff'; x.fillRect(0, 0, 128, 128); });
}

export function decalAtlas() {
  const c = canvas(ATLAS_COLS * 128, ATLAS_ROWS * 128);
  paintDecals(c.getContext('2d'));
  const t = tex(c, false);
  t.generateMipmaps = true;
  return t;
}

/* -------------------------------- faces ----------------------------------- */

export const FACE_COLS = 8, FACE_ROWS = 8, FACE_PX = 64;

export class FaceAtlas {
  constructor() {
    this.canvas = canvas(FACE_COLS * FACE_PX, FACE_ROWS * FACE_PX);
    this.ctx = this.canvas.getContext('2d');
    this.texture = tex(this.canvas, false);
    this.texture.magFilter = THREE.LinearFilter;
    this.used = new Array(FACE_COLS * FACE_ROWS).fill(false);
    this.dirty = false;
    this._last = 0;
  }
  alloc() {
    const i = this.used.indexOf(false);
    if (i < 0) return -1;
    this.used[i] = true;
    return i;
  }
  release(i) { if (i >= 0) this.used[i] = false; }

  /**
   * Paints one face. `look` is who they are (eye colour, brows, lips, sex);
   * `e` is what their face is doing right now.
   */
  draw(i, look, e) {
    if (i < 0) return;
    const x = this.ctx, ox = (i % FACE_COLS) * FACE_PX, oy = ((i / FACE_COLS) | 0) * FACE_PX;
    x.save(); x.translate(ox, oy);
    x.clearRect(0, 0, 64, 64);
    x.beginPath(); x.rect(0, 0, 64, 64); x.clip();

    const open = e.eyeOpen, wide = Math.max(0, open - 1);
    // bruising and blood on the skin come first, features go over them
    if (e.bruise > 0) {
      x.globalAlpha = Math.min(0.75, e.bruise);
      const g = x.createRadialGradient(46, 28, 2, 46, 28, 16); g.addColorStop(0, '#4a1f5e'); g.addColorStop(1, 'rgba(74,31,94,0)');
      x.fillStyle = g; x.fillRect(26, 10, 38, 36);
      if (e.bruise > 0.5) { const g2 = x.createRadialGradient(18, 44, 2, 18, 44, 13); g2.addColorStop(0, '#6a2340'); g2.addColorStop(1, 'rgba(106,35,64,0)'); x.fillStyle = g2; x.fillRect(4, 30, 30, 30); }
      x.globalAlpha = 1;
    }
    for (let s = 0; s < 2; s++) {
      const cx = s === 0 ? 20 : 44;      // image left is the person's right
      const alive = s === 0 ? e.eyeR : e.eyeL;
      const cy = 26;
      if (!alive) {
        x.fillStyle = '#1a0000'; x.beginPath(); x.ellipse(cx, cy, 6.5, 5, 0, 0, TAU); x.fill();
        x.fillStyle = '#7d0606'; x.fillRect(cx - 2, cy + 3, 3, 14 + s * 4); x.fillRect(cx + 2, cy + 3, 2, 8);
        continue;
      }
      const h = Math.max(0.6, 4.3 * Math.min(open, 1) + wide * 2.4);
      if (open < 0.08) {
        x.strokeStyle = '#2a1c16'; x.lineWidth = 1.8; x.beginPath(); x.moveTo(cx - 6, cy + 0.5); x.quadraticCurveTo(cx, cy + 2.5, cx + 6, cy + 0.5); x.stroke();
      } else {
        x.fillStyle = e.pale ? '#f2f0e8' : '#f5f1e6';
        x.beginPath(); x.ellipse(cx, cy, 6.2, h, 0, 0, TAU); x.fill();
        if (e.red > 0) { x.fillStyle = `rgba(190,30,30,${Math.min(0.6, e.red)})`; x.beginPath(); x.ellipse(cx, cy, 6.2, h, 0, 0, TAU); x.fill(); }
        x.save(); x.beginPath(); x.ellipse(cx, cy, 6.2, h, 0, 0, TAU); x.clip();
        const gx = cx + e.gazeX * 2.4, gy = cy + e.gazeY * 1.6;
        x.fillStyle = look.eye; x.beginPath(); x.arc(gx, gy, 3.5, 0, TAU); x.fill();
        x.fillStyle = '#0c0c0c'; x.beginPath(); x.arc(gx, gy, e.pupil, 0, TAU); x.fill();
        x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillRect(gx + 0.6, gy - 2.2, 1.3, 1.3);
        x.restore();
        x.strokeStyle = '#2a1c16'; x.lineWidth = 1.5;
        x.beginPath(); x.ellipse(cx, cy, 6.4, h + 0.3, 0, Math.PI, TAU); x.stroke();       // upper lid
        if (open < 0.7) { x.fillStyle = look.skinShade; x.beginPath(); x.ellipse(cx, cy - h, 7, h * (1.3 - open), 0, 0, TAU); x.fill(); }
      }
      // brow: tilt > 0 is anger (inner end down), < 0 is sorrow (inner end up)
      const inner = s === 0 ? 1 : -1;
      const by = 16.5 - e.browRaise * 4.5 - wide * 2;
      x.strokeStyle = look.brow; x.lineWidth = look.browW; x.lineCap = 'round';
      x.beginPath();
      x.moveTo(cx - inner * 7, by - e.browTilt * 1.2);
      x.lineTo(cx + inner * 6, by + e.browTilt * 3.6);
      x.stroke();
      if (e.tears > 0) {
        x.strokeStyle = `rgba(170,215,255,${Math.min(0.9, e.tears)})`; x.lineWidth = 1.8;
        x.beginPath(); x.moveTo(cx - inner * 3, cy + 4); x.quadraticCurveTo(cx - inner * 5, cy + 16, cx - inner * 4, cy + 26); x.stroke();
      }
    }
    // nose
    x.strokeStyle = look.skinShade; x.lineWidth = 2; x.lineCap = 'round';
    x.beginPath(); x.moveTo(31.5, 30); x.lineTo(30.5, 38.5); x.lineTo(34, 39); x.stroke();
    if (e.noseBleed > 0) { x.strokeStyle = '#8a0707'; x.lineWidth = 2.2; x.beginPath(); x.moveTo(32, 40); x.lineTo(32.5, 40 + 5 + e.noseBleed * 16); x.stroke(); }
    // mouth: curve > 0 smiles, < 0 turns down; open is how far the jaw drops
    const my = 49, mw = 9 + e.mouthWide * 3, o = e.mouthOpen, cv = e.mouthCurve;
    if (o > 0.06) {
      const mh = 2 + o * 8.5;
      x.fillStyle = '#2a0808';
      x.beginPath(); x.ellipse(32, my + o * 1.5, mw * (1 - o * 0.25), mh, 0, 0, TAU); x.fill();
      if (e.teeth) { x.fillStyle = '#eeeadc'; x.fillRect(32 - mw * 0.62, my + o * 1.5 - mh, mw * 1.24, Math.min(3, mh * 0.55)); }
      if (o > 0.4) { x.fillStyle = '#9b3a3a'; x.beginPath(); x.ellipse(32, my + o * 1.5 + mh * 0.5, mw * 0.5, mh * 0.42, 0, 0, TAU); x.fill(); }
      x.strokeStyle = look.lip; x.lineWidth = 1.6;
      x.beginPath(); x.ellipse(32, my + o * 1.5, mw * (1 - o * 0.25), mh, 0, 0, TAU); x.stroke();
    } else {
      x.strokeStyle = look.lip; x.lineWidth = 2.2; x.lineCap = 'round';
      x.beginPath(); x.moveTo(32 - mw, my - cv * 2.6); x.quadraticCurveTo(32, my + cv * 4.4, 32 + mw, my - cv * 2.6); x.stroke();
      if (e.teeth) { x.strokeStyle = '#eeeadc'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(32 - mw * 0.7, my); x.lineTo(32 + mw * 0.7, my); x.stroke(); }
    }
    if (e.mouthBleed > 0) {
      x.strokeStyle = '#8a0707'; x.lineWidth = 2.4; x.lineCap = 'round';
      x.beginPath(); x.moveTo(32 + mw - 2, my + 1); x.lineTo(32 + mw - 1, my + 3 + e.mouthBleed * 11); x.stroke();
      if (e.mouthBleed > 0.5) { x.beginPath(); x.moveTo(30, my + 3); x.lineTo(29.5, my + 3 + e.mouthBleed * 8); x.stroke(); }
    }
    if (look.stubble) { x.fillStyle = 'rgba(40,30,25,0.16)'; x.fillRect(12, 42, 40, 22); }
    x.restore();
    this.dirty = true;
  }

  /** Pushes repainted faces to the graphics card, not more than ten times a second. */
  flush(now) {
    if (!this.dirty || now - this._last < 0.1) return;
    this.texture.needsUpdate = true;
    this.dirty = false; this._last = now;
  }
}

/** A neutral face, to copy and bend. */
export function restingFace() {
  return {
    eyeOpen: 1, eyeL: true, eyeR: true, gazeX: 0, gazeY: 0, pupil: 1.5, red: 0, pale: false,
    browTilt: 0, browRaise: 0, mouthCurve: 0, mouthOpen: 0, mouthWide: 0, teeth: false,
    tears: 0, noseBleed: 0, mouthBleed: 0, bruise: 0,
  };
}

/** A key that changes exactly when the face would look different. */
export function faceKey(e) {
  const q = (v, n) => Math.round(clamp01(v / 1.4) * n);
  return [q(e.eyeOpen, 7), e.eyeL ? 1 : 0, e.eyeR ? 1 : 0, Math.round(e.gazeX * 2), Math.round(e.browTilt * 4), q(e.browRaise * 1.4, 4),
    Math.round(e.mouthCurve * 4), q(e.mouthOpen * 1.4, 6), e.teeth ? 1 : 0, q(e.tears * 1.4, 2), q(e.noseBleed * 1.4, 3),
    q(e.mouthBleed * 1.4, 3), q(e.bruise * 1.4, 3), q(e.red * 1.4, 2), e.pale ? 1 : 0].join('.');
}
