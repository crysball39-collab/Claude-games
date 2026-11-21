'use strict';
/* =============================================================================
   Sprites. Every character and effect is drawn once with canvas paths into an
   offscreen canvas at the screen's real resolution, then stamped with
   drawImage every frame. Characters are drawn facing right; mirrored copies
   and white "hit flash" copies are made from those.
   ========================================================================== */

const OUT = '#1a1520';
let RES = 2;
const SPR = {};

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}

/* ------------------------------ path helpers ----------------------------- */

function strokeOut(g, lw) { if (lw) { g.lineWidth = lw; g.strokeStyle = OUT; g.stroke(); } }
function circ(g, x, y, r, fill, lw = 2) {
  g.beginPath(); g.arc(x, y, r, 0, TAU);
  if (fill) { g.fillStyle = fill; g.fill(); }
  strokeOut(g, lw);
}
function ell(g, x, y, rx, ry, fill, lw = 2, rot = 0) {
  g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
  if (fill) { g.fillStyle = fill; g.fill(); }
  strokeOut(g, lw);
}
function rrPath(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
function rr(g, x, y, w, h, r, fill, lw = 2) {
  rrPath(g, x, y, w, h, r);
  if (fill) { g.fillStyle = fill; g.fill(); }
  strokeOut(g, lw);
}
function poly(g, pts, fill, lw = 2, close = true) {
  g.beginPath(); g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  if (close) g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  strokeOut(g, lw);
}
function seg(g, x1, y1, x2, y2, color, w) {
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
  g.lineWidth = w; g.strokeStyle = color; g.lineCap = 'round'; g.stroke();
}
/* A limb: a fat dark stroke with a thinner coloured stroke on top reads as an
   outlined, rounded tube. */
function limb(g, x1, y1, x2, y2, w, color) {
  seg(g, x1, y1, x2, y2, OUT, w + 3);
  seg(g, x1, y1, x2, y2, color, w);
}
function glow(g, color, blur, fn) {
  g.save(); g.shadowColor = color; g.shadowBlur = blur; fn(); g.restore();
}
function radial(g, x, y, r, stops) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  stops.forEach(([o, c]) => gr.addColorStop(o, c));
  return gr;
}
function star(g, x, y, ro, ri, n, rot, fill, lw = 2) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + i / (n * 2) * TAU, r = i % 2 ? ri : ro;
    pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  poly(g, pts, fill, lw);
}

/* ---------------------------- sprite plumbing ---------------------------- */

function makeSprite(w, h, ax, ay, draw, res = RES) {
  const c = mkCanvas(w * res, h * res);
  const g = c.getContext('2d');
  g.scale(res, res); g.translate(ax, ay);
  g.lineJoin = 'round'; g.lineCap = 'round';
  draw(g);
  return { c, w, h, ax, ay };
}
function flipSprite(s) {
  const c = mkCanvas(s.c.width, s.c.height), g = c.getContext('2d');
  g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(s.c, 0, 0);
  return { c, w: s.w, h: s.h, ax: s.w - s.ax, ay: s.ay };
}
function tintSprite(s, color, alpha = 1) {
  const c = mkCanvas(s.c.width, s.c.height), g = c.getContext('2d');
  g.drawImage(s.c, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = alpha; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return { c, w: s.w, h: s.h, ax: s.ax, ay: s.ay };
}
/* frames -> [{ r, l, wr, wl }] : right, left, and white flashes of each. */
function frameSet(w, h, ax, ay, n, draw, opts = {}) {
  const out = [];
  for (let f = 0; f < n; f++) {
    const r = makeSprite(w, h, ax, ay, g => draw(g, f));
    const fr = { r, l: opts.noFlip ? r : flipSprite(r) };
    const fa = opts.flash || 0.75;
    fr.wr = tintSprite(fr.r, '#ffffff', fa);
    fr.wl = opts.noFlip ? fr.wr : tintSprite(fr.l, '#ffffff', fa);
    if (opts.green) { fr.gr = tintSprite(fr.r, '#5dff3a', 0.42); fr.gl = tintSprite(fr.l, '#5dff3a', 0.42); }
    out.push(fr);
  }
  return out;
}
function drawSpr(ctx, s, x, y, scale = 1) {
  ctx.drawImage(s.c, x - s.ax * scale, y - s.ay * scale, s.w * scale, s.h * scale);
}

/* -------------------------------- survivor ------------------------------- */

function drawSurvivor(g, f, moving) {
  const ph = f / 4 * TAU;
  const sw = moving ? Math.sin(ph) : 0;
  const bob = moving ? -Math.abs(Math.sin(ph)) * 1.8 : -Math.sin(ph) * 0.6;
  const jacket = '#2fa596', jacketD = '#1f7a6e', pants = '#2b3149', skin = '#f2c39b', hair = '#6a4126';

  // back arm and leg
  limb(g, -5, -23 + bob, -9 + sw * 3.2, -14.5 + bob, 4.5, jacketD);
  circ(g, -9 + sw * 3.2, -13.5 + bob, 2.6, skin, 1.6);
  limb(g, -3, -12 + bob, -3 - sw * 4, -2.5, 5, '#22283c');
  ell(g, -2.5 - sw * 4, -1.8, 4.2, 2.4, '#3a2a20', 1.6);
  limb(g, 3, -12 + bob, 3 + sw * 4, -2.5, 5, pants);
  ell(g, 3.8 + sw * 4, -1.8, 4.4, 2.5, '#4a3627', 1.6);

  // backpack
  rr(g, -16, -29 + bob, 9, 15, 3.5, '#a37b49');
  rr(g, -16, -22 + bob, 9, 4, 1.5, '#86633a', 1.4);

  // jacket
  rr(g, -9.5, -28.5 + bob, 19, 18, 6.5, jacket);
  g.save(); rrPath(g, -9.5, -28.5 + bob, 19, 18, 6.5); g.clip();
  g.fillStyle = jacketD; g.fillRect(-9.5, -28.5 + bob, 6, 18);
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(1, -27 + bob, 6, 3);
  g.restore();
  rrPath(g, -9.5, -28.5 + bob, 19, 18, 6.5); strokeOut(g, 2);
  seg(g, 2, -26 + bob, 2, -12 + bob, '#155c53', 1.4);
  rr(g, 4, -18 + bob, 4, 4, 1, '#26897c', 1.2);

  // bandana
  poly(g, [-5, -28.5 + bob, 8, -28.5 + bob, 2, -22 + bob], '#d94a3d', 1.6);

  // head
  const hx = 1.5, hy = -38 + bob, hr = 11.5;
  circ(g, hx, hy, hr, skin, 0);
  g.save(); g.beginPath(); g.arc(hx, hy, hr, 0, TAU); g.clip();
  ell(g, hx - 4, hy - 7, 14, 9, hair, 0);
  ell(g, hx - 10, hy + 1, 5.5, 9, hair, 0);
  g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(hx - hr, hy + 4, hr * 2, 8);
  g.restore();
  poly(g, [hx - 8, hy - 8, hx - 5, hy - 16, hx - 1, hy - 9], hair, 1.6);
  poly(g, [hx - 2, hy - 10, hx + 3, hy - 16.5, hx + 5, hy - 9], hair, 1.6);
  circ(g, hx, hy, hr, null, 2);
  // goggles pushed up on the head
  seg(g, hx - 11, hy - 5, hx + 11, hy - 6.5, '#2b2b31', 3);
  circ(g, hx + 4.5, hy - 7.5, 3.6, '#ffb03b', 1.6);
  circ(g, hx + 10.2, hy - 6.6, 2.7, '#ffb03b', 1.4);
  circ(g, hx + 3.5, hy - 8.6, 1, '#fff8dc', 0);
  // face
  ell(g, hx + 4.2, hy + 1, 1.6, 2.5, OUT, 0);
  ell(g, hx + 9.2, hy + 1, 1.4, 2.3, OUT, 0);
  circ(g, hx + 3.7, hy, 0.7, '#ffffff', 0);
  circ(g, hx + 8.8, hy, 0.6, '#ffffff', 0);
  circ(g, hx + 9, hy + 5, 1.9, 'rgba(255,110,110,0.45)', 0);
  g.beginPath(); g.arc(hx + 6.5, hy + 5.5, 1.8, 0.2, Math.PI - 0.2); g.lineWidth = 1.2; g.strokeStyle = OUT; g.stroke();

  // front arm
  limb(g, 6, -23 + bob, 9.5 - sw * 3.2, -14.5 + bob, 4.5, jacket);
  circ(g, 9.5 - sw * 3.2, -13.5 + bob, 2.6, skin, 1.6);
}

/* --------------------------------- mobs ---------------------------------- */

const ZOMBIE_PAL = { skin: '#8db36d', skinD: '#6f9254', shirt: '#55728c', shirtD: '#3f586e', pants: '#5a4636', eye: '#ffe86b', pupil: '#c0262d' };
const BRUTE_PAL = { skin: '#7c9f58', skinD: '#5e7f40', shirt: '#7a2f34', shirtD: '#5a1f24', pants: '#3b3030', eye: '#ffffff', pupil: '#ff2a2a' };

function drawZombie(g, f, p) {
  const ph = f / 4 * TAU, sw = Math.sin(ph), bob = -Math.abs(Math.sin(ph)) * 1.3, sway = Math.cos(ph) * 1.6;
  // back arm reaches forward
  limb(g, -1, -24 + bob, 11, -22.5 + bob + sway, 4.6, p.shirtD);
  limb(g, 9, -22.6 + bob + sway, 15.5, -22 + bob + sway, 3.8, p.skinD);
  // legs (one drags)
  limb(g, -3, -12 + bob, -4.5 - sw * 3, -2.5, 5, p.pants);
  ell(g, -4 - sw * 3, -1.8, 4, 2.3, '#2e2620', 1.5);
  limb(g, 3, -12 + bob, 3.5 + sw * 3, -2.5, 5, p.pants);
  ell(g, 4.2 + sw * 3, -1.8, 4.2, 2.3, '#2e2620', 1.5);
  // hunched torso
  g.save(); g.translate(0, bob); g.rotate(0.12);
  rr(g, -8.5, -27, 17, 16.5, 5, p.shirt);
  g.save(); rrPath(g, -8.5, -27, 17, 16.5, 5); g.clip();
  poly(g, [-9, -13, -6, -16, -3, -12.5, 0, -15.5, 3, -12, 6, -15, 9, -12.5, 9, -10, -9, -10], p.skin, 0);
  ell(g, 3, -21, 2.6, 3.4, p.skin, 0);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(-8.5, -27, 5, 17);
  ell(g, -2, -23, 2, 1.5, 'rgba(90,20,20,0.55)', 0);
  g.restore();
  rrPath(g, -8.5, -27, 17, 16.5, 5); strokeOut(g, 2);
  g.restore();
  // head, pushed forward
  const hx = 4.5, hy = -34.5 + bob;
  circ(g, hx, hy, 10, p.skin);
  g.save(); g.beginPath(); g.arc(hx, hy, 10, 0, TAU); g.clip();
  ell(g, hx - 6, hy - 6, 9, 6, '#33402a', 0);
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(hx - 10, hy + 3, 20, 8);
  g.restore();
  circ(g, hx, hy, 10, null, 2);
  poly(g, [hx - 6, hy - 8, hx - 4, hy - 13, hx - 1, hy - 9], '#33402a', 1.4);
  // stitched scar
  seg(g, hx - 3, hy - 4, hx + 1, hy - 7, '#4a2a2a', 1);
  seg(g, hx - 2.4, hy - 6.6, hx - 1.2, hy - 4.2, '#4a2a2a', 0.8);
  seg(g, hx - 0.8, hy - 7.4, hx + 0.4, hy - 5.2, '#4a2a2a', 0.8);
  // eyes
  circ(g, hx + 4, hy - 1, 2.8, p.eye, 1.3);
  circ(g, hx + 4.6, hy - 1, 1.1, p.pupil, 0);
  circ(g, hx + 8.6, hy - 0.2, 2, p.eye, 1.2);
  circ(g, hx + 9, hy - 0.2, 0.8, p.pupil, 0);
  // mouth
  poly(g, [hx + 3, hy + 4.5, hx + 9.5, hy + 4, hx + 8, hy + 7.5, hx + 4, hy + 7.2], '#3a1418', 1.2);
  poly(g, [hx + 5, hy + 4.4, hx + 6, hy + 6, hx + 7, hy + 4.2], '#f3ecd0', 0);
  // front arm
  limb(g, 4, -23 + bob, 15, -20.5 + bob - sway, 4.6, p.shirt);
  limb(g, 13, -20.6 + bob - sway, 19, -20 + bob - sway, 3.8, p.skin);
  poly(g, [19, -21.5 + bob - sway, 22.5, -21 + bob - sway, 19.5, -18.8 + bob - sway], p.skin, 1.2);
}

const MOTH_PAL = { wing: '#9581b8', wingD: '#5f4b85', spot: '#e3f59a', body: '#3a2c3c', eye: '#9dff6a' };
const MOTH_ELITE = { wing: '#c4505d', wingD: '#7c2433', spot: '#ffe07a', body: '#2b1d22', eye: '#ffef5a' };

function drawButterfly(g, f, p) {
  const k = [1, 0.74, 0.4, 0.74][f];
  for (const s of [-1, 1]) {
    g.save(); g.scale(s * k, 1);
    // upper wing, tattered at the edge
    g.beginPath();
    g.moveTo(1, -3);
    g.bezierCurveTo(5, -18, 17, -21, 21.5, -13);
    g.lineTo(19, -10.5); g.lineTo(22.5, -6.5); g.lineTo(18, -4.5); g.lineTo(20, -1);
    g.quadraticCurveTo(10, 3, 1, 0); g.closePath();
    g.fillStyle = p.wing; g.fill(); strokeOut(g, 1.8);
    g.save(); g.clip();
    ell(g, 3, -3, 9, 7, p.wingD, 0);
    seg(g, 2, -2, 18, -14, 'rgba(30,20,40,0.45)', 0.9);
    seg(g, 2, -1, 19, -5, 'rgba(30,20,40,0.45)', 0.9);
    g.restore();
    circ(g, 13, -11, 3.8, p.spot, 1.3);
    circ(g, 13.3, -11, 1.8, '#2a1f33', 0);
    ell(g, 17, -4, 1.4, 1, '#2a1f33', 0);
    // lower wing
    g.beginPath();
    g.moveTo(1, 1); g.quadraticCurveTo(12, 2, 15, 8.5);
    g.lineTo(12, 10); g.lineTo(13.5, 14); g.quadraticCurveTo(6, 15.5, 1, 5.5); g.closePath();
    g.fillStyle = p.wingD; g.fill(); strokeOut(g, 1.8);
    circ(g, 9, 9, 1.8, p.spot, 1);
    g.restore();
  }
  ell(g, 0, 1.5, 3.2, 9.5, p.body, 1.8);
  seg(g, -2.6, 3, 2.6, 3, 'rgba(255,255,255,0.18)', 0.8);
  seg(g, -2.4, 6.5, 2.4, 6.5, 'rgba(255,255,255,0.18)', 0.8);
  circ(g, 0, -8.5, 3.8, p.body, 1.8);
  circ(g, -1.7, -9.3, 1.25, p.eye, 0);
  circ(g, 1.7, -9.3, 1.25, p.eye, 0);
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(s * 1.2, -11.5); g.quadraticCurveTo(s * 3, -17, s * 6.5, -17.5);
    g.lineWidth = 1.2; g.strokeStyle = OUT; g.stroke();
    circ(g, s * 6.6, -17.6, 1.2, p.body, 0.8);
  }
}

const BEETLE_PAL = { shell: '#2f5d58', shellD: '#21423f', hi: '#8fd6c4', belly: '#1d2a29', head: '#1c2726', eye: '#ff5a4a', leg: '#141c1c' };
const BEETLE_ELITE = { shell: '#b0812e', shellD: '#7d5a1c', hi: '#ffe1a0', belly: '#3a2a14', head: '#2a1e10', eye: '#ff3b2f', leg: '#1d150c' };
const MINION_PAL = { shell: '#2d1c18', shellD: '#1d1210', hi: '#ff9a4a', belly: '#1a0f0d', head: '#1a0f0d', eye: '#ffd84a', leg: '#120a08', lava: true };

function drawBeetle(g, f, p, horn) {
  const ph = f / 4 * TAU, a = Math.sin(ph), b = Math.sin(ph + Math.PI);
  // far-side legs
  for (const [i, x] of [-8, 0, 8].entries()) {
    const m = i % 2 ? a : b;
    limb(g, x - 1, -7, x - 4 + m * 3, -1.2, 1.8, p.leg);
  }
  ell(g, 0, -5.5, 13, 4.2, p.belly, 1.8);
  // shell
  ell(g, -2, -11.5, 15, 9.8, p.shell, 2);
  g.save(); g.beginPath(); g.ellipse(-2, -11.5, 15, 9.8, 0, 0, TAU); g.clip();
  ell(g, -2, -5, 16, 5, p.shellD, 0);
  seg(g, 12, -16, -17, -13, 'rgba(0,0,0,0.35)', 1.2);
  ell(g, -7, -16, 6, 2.2, p.hi + '66', 0);
  if (p.lava) {
    g.save(); g.shadowColor = '#ff7a1a'; g.shadowBlur = 4;
    seg(g, -10, -12, -4, -9, '#ff8a2a', 1.3); seg(g, -4, -9, 1, -13, '#ff8a2a', 1.3);
    seg(g, 3, -8, 8, -11, '#ffb04a', 1.1);
    g.restore();
  }
  g.restore();
  ell(g, -2, -11.5, 15, 9.8, null, 2);
  // thorax and head
  ell(g, 10.5, -9, 5.8, 5.5, p.shellD, 1.8);
  circ(g, 15, -7.5, 4.6, p.head, 1.8);
  // mandibles
  g.lineWidth = 2; g.strokeStyle = OUT;
  g.beginPath(); g.moveTo(18, -9.5); g.quadraticCurveTo(22.5, -10.5, 22, -7.5); g.stroke();
  g.beginPath(); g.moveTo(18, -6); g.quadraticCurveTo(22, -4.8, 21.5, -2.8); g.stroke();
  if (horn) {
    g.beginPath(); g.moveTo(15.5, -11.5); g.quadraticCurveTo(19, -16, 21, -23); g.lineTo(18, -14.5); g.closePath();
    g.fillStyle = p.shellD; g.fill(); strokeOut(g, 1.5);
  }
  circ(g, 16.5, -9.2, 1.3, p.eye, 0);
  // near-side legs
  for (const [i, x] of [-7, 1, 9].entries()) {
    const m = i % 2 ? b : a;
    limb(g, x, -6, x + 3 + m * 3.2, -0.6, 2, p.leg);
  }
}

/* --------------------------------- bosses -------------------------------- */

function drawRock(g, x, y, r) {
  poly(g, [x - r, y + r * 0.2, x - r * 0.7, y - r * 0.7, x, y - r, x + r * 0.8, y - r * 0.6, x + r, y + r * 0.3, x + r * 0.4, y + r * 0.85, x - r * 0.5, y + r * 0.8], '#8d939b', 2);
  poly(g, [x - r * 0.7, y - r * 0.7, x, y - r, x + r * 0.1, y - r * 0.2, x - r * 0.5, y], '#a9aeb5', 0);
  poly(g, [x + r * 0.4, y + r * 0.85, x + r, y + r * 0.3, x + r * 0.2, y + r * 0.2], '#6a7078', 0);
  seg(g, x - r * 0.2, y - r * 0.1, x + r * 0.3, y + r * 0.4, 'rgba(0,0,0,0.3)', 1.2);
}

function drawDreadnought(g, f, pose) {
  const ph = f / 4 * TAU;
  const sw = pose === 'walk' ? Math.sin(ph) : 0;
  const bob = pose === 'crouch' ? 9 : -Math.abs(Math.sin(ph)) * 2.2;
  const skin = '#7a9b57', skinD = '#5b7a40', iron = '#7f8a96', ironD = '#58616b', rust = 'rgba(160,88,45,0.75)', pants = '#4b3a2f';
  // back arm
  limb(g, -20, -62 + bob, -29 - sw * 4, -37 + bob, 12, skinD);
  circ(g, -30 - sw * 4, -33 + bob, 8.5, skinD);
  // legs
  const legY = pose === 'crouch' ? -24 : -30;
  limb(g, -10, legY + bob, -13 - sw * 7, -7, 14, '#3d2f26');
  rr(g, -24 - sw * 7, -11, 21, 11, 4, ironD);
  limb(g, 10, legY + bob, 12 + sw * 7, -7, 14, pants);
  rr(g, 2 + sw * 7, -11, 22, 11, 4, iron);
  // torso
  ell(g, -2, -52 + bob, 31, 27, skin);
  g.save(); g.beginPath(); g.ellipse(-2, -52 + bob, 31, 27, 0, 0, TAU); g.clip();
  ell(g, -18, -50 + bob, 14, 28, skinD, 0);
  g.restore();
  ell(g, -2, -52 + bob, 31, 27, null, 2.2);
  // riveted chest plate
  rr(g, -20, -73 + bob, 37, 29, 7, iron, 2.2);
  rr(g, -20, -73 + bob, 37, 8, 4, '#98a3ae', 0);
  seg(g, -18, -60 + bob, 15, -60 + bob, ironD, 2);
  ell(g, -8, -52 + bob, 6, 3.5, rust, 0);
  ell(g, 8, -66 + bob, 4, 2.5, rust, 0);
  for (const [x, y] of [[-16, -69], [13, -69], [-16, -49], [13, -49], [-2, -69]]) circ(g, x, y + bob, 1.6, '#d2d8de', 1);
  // belt with a skull buckle
  rr(g, -27, -36 + bob, 51, 8, 3, '#3a2c23', 2);
  circ(g, 1, -32 + bob, 4.5, '#e8e0c8', 1.6);
  circ(g, -0.6, -33 + bob, 1, OUT, 0); circ(g, 2.6, -33 + bob, 1, OUT, 0);
  // head in an iron helmet
  const hx = 9, hy = -84 + bob;
  circ(g, hx, hy, 12, skin, 2);
  g.save(); g.beginPath(); g.arc(hx, hy, 12, 0, TAU); g.clip();
  g.fillStyle = ironD; g.fillRect(hx - 13, hy - 13, 26, 11);
  g.fillStyle = '#8f99a4'; g.fillRect(hx - 13, hy - 13, 26, 3);
  g.restore();
  circ(g, hx, hy, 12, null, 2);
  seg(g, hx - 12, hy - 2, hx + 12, hy - 2, OUT, 1.8);
  glow(g, '#ffd000', 8, () => circ(g, hx + 6, hy + 2, 2.6, '#ffe14a', 0));
  poly(g, [hx + 1, hy + 6, hx + 11, hy + 5.5, hx + 9.5, hy + 9.5, hx + 2, hy + 9.5], '#2a1416', 1.4);
  for (let i = 0; i < 3; i++) poly(g, [hx + 2.5 + i * 2.7, hy + 6, hx + 3.8 + i * 2.7, hy + 8, hx + 5 + i * 2.7, hy + 6], '#efe6c8', 0);
  // spiked shoulder pad
  for (let i = 0; i < 3; i++) poly(g, [8 + i * 8, -76 + bob, 11 + i * 8, -88 + bob, 14 + i * 8, -76 + bob], '#c9d0d7', 1.6);
  ell(g, 17, -71 + bob, 15.5, 11, iron, 2.2);
  ell(g, 13, -75 + bob, 7, 3, '#a4aeb8', 0);
  // the giant front arm
  if (pose === 'raise') {
    limb(g, 16, -70 + bob, 21, -102 + bob, 14, skin);
    circ(g, 21, -106 + bob, 10, iron, 2.2);
    drawRock(g, 19, -124 + bob, 17);
  } else {
    const fx = 32 + sw * 4, fy = -36 + bob;
    limb(g, 17, -66 + bob, fx, fy, 15, skin);
    circ(g, fx + 1, fy + 3, 12, iron, 2.2);
    for (let i = 0; i < 3; i++) poly(g, [fx + 7, fy - 4 + i * 5, fx + 15, fy - 2 + i * 5, fx + 7, fy + 1 + i * 5], '#c9d0d7', 1.4);
    // chain
    for (let i = 0; i < 3; i++) ell(g, fx - 6 - i * 2, fy + 14 + i * 5, 2.2, 3, null, 1.6);
  }
}

function drawMothra(g, f) {
  const k = 0.38 + 0.62 * Math.abs(Math.cos(f / 6 * Math.PI));
  for (const s of [-1, 1]) {
    g.save(); g.scale(s * k, 1);
    // upper wing
    g.beginPath();
    g.moveTo(3, -9);
    g.bezierCurveTo(14, -50, 52, -60, 71, -41);
    g.lineTo(64, -35); g.lineTo(73, -27); g.lineTo(62, -21); g.lineTo(69, -12);
    g.quadraticCurveTo(36, 1, 3, 0); g.closePath();
    const gr = g.createLinearGradient(0, 0, 70, -40);
    gr.addColorStop(0, '#2c0f40'); gr.addColorStop(0.5, '#6a2c96'); gr.addColorStop(1, '#9b4fd0');
    g.fillStyle = gr; g.fill(); strokeOut(g, 2.4);
    g.save(); g.clip();
    for (const [x, y] of [[60, -38], [52, -14], [40, -50], [66, -24]]) seg(g, 4, -4, x, y, 'rgba(10,0,20,0.55)', 1.4);
    g.restore();
    glow(g, '#a8ff4a', 10, () => { circ(g, 44, -31, 7.5, '#a8ff4a', 2); });
    circ(g, 44.5, -31, 3.2, '#1f2a10', 0);
    glow(g, '#a8ff4a', 6, () => { circ(g, 27, -20, 3.2, '#c6ff7a', 1.4); circ(g, 60, -29, 2.6, '#c6ff7a', 1.2); });
    // lower wing with a long tail
    g.beginPath();
    g.moveTo(3, 2); g.quadraticCurveTo(30, 4, 45, 18);
    g.lineTo(40, 24); g.lineTo(47, 33);
    g.quadraticCurveTo(40, 44, 31, 55); g.lineTo(27, 47);
    g.quadraticCurveTo(14, 31, 3, 11); g.closePath();
    g.fillStyle = '#56206c'; g.fill(); strokeOut(g, 2.4);
    glow(g, '#a8ff4a', 6, () => circ(g, 30, 50, 3, '#a8ff4a', 1.2));
    circ(g, 24, 18, 4, '#7d3a9a', 1.2);
    g.restore();
  }
  // abdomen
  for (let i = 4; i >= 0; i--) {
    ell(g, 0, 6 + i * 6.5, 7.5 - i * 0.9, 5, i % 2 ? '#2a1d2e' : '#33223a', 2);
    poly(g, [-(7 - i), 6 + i * 6.5, -(11 - i), 3 + i * 6.5, -(6 - i), 2 + i * 6.5], '#8e44ad', 1.2);
    poly(g, [(7 - i), 6 + i * 6.5, (11 - i), 3 + i * 6.5, (6 - i), 2 + i * 6.5], '#8e44ad', 1.2);
  }
  ell(g, 0, -6, 10, 9, '#3d2545', 2.2);
  ell(g, -3, -9, 3.5, 2, 'rgba(255,255,255,0.15)', 0);
  circ(g, 0, -18, 7.5, '#2a1d2e', 2.2);
  glow(g, '#c6ff4d', 6, () => {
    circ(g, -3.2, -20, 1.9, '#c6ff4d', 0); circ(g, 3.2, -20, 1.9, '#c6ff4d', 0);
    circ(g, -1.4, -16, 1.4, '#c6ff4d', 0); circ(g, 1.4, -16, 1.4, '#c6ff4d', 0);
  });
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(s * 3, -24); g.bezierCurveTo(s * 6, -36, s * 16, -40, s * 18, -32);
    g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
    for (let i = 0; i < 4; i++) seg(g, s * (6 + i * 3), -34 - (i < 2 ? i : 3 - i), s * (7 + i * 3), -38 - i, OUT, 1);
  }
}

function drawTitanus(g, f) {
  const ph = f / 4 * TAU, a = Math.sin(ph), b = Math.sin(ph + Math.PI);
  const shell = '#2a1714', shellD = '#180c0a', lava = '#ff7a1a', lavaHot = '#ffd36a';
  for (const [i, x] of [-34, -6, 22].entries()) {
    const m = i % 2 ? a : b;
    limb(g, x, -22, x - 12 + m * 8, -3, 6, '#120807');
  }
  ell(g, 2, -18, 50, 12, '#1a0d0b', 2.4);
  // shell
  ell(g, -8, -50, 55, 37, shell, 2.6);
  g.save(); g.beginPath(); g.ellipse(-8, -50, 55, 37, 0, 0, TAU); g.clip();
  ell(g, -8, -26, 60, 16, shellD, 0);
  seg(g, 44, -76, -62, -56, 'rgba(0,0,0,0.55)', 3);
  for (const x of [-38, -14, 10]) seg(g, x, -84, x - 6, -16, 'rgba(0,0,0,0.4)', 2);
  glow(g, lava, 10, () => {
    g.lineJoin = 'round';
    poly(g, [-50, -48, -40, -42, -36, -52, -26, -46, -22, -34], null, 0, false);
    g.lineWidth = 3; g.strokeStyle = lava; g.stroke();
    poly(g, [-6, -70, -2, -60, 6, -62, 10, -50, 20, -48], null, 0, false);
    g.lineWidth = 3; g.strokeStyle = lava; g.stroke();
    poly(g, [-24, -66, -18, -60, -20, -54], null, 0, false);
    g.lineWidth = 2; g.strokeStyle = lavaHot; g.stroke();
    poly(g, [14, -36, 24, -32, 30, -40], null, 0, false);
    g.lineWidth = 2.4; g.strokeStyle = lava; g.stroke();
  });
  ell(g, -24, -72, 18, 6, 'rgba(255,190,150,0.16)', 0);
  g.restore();
  ell(g, -8, -50, 55, 37, null, 2.6);
  // pronotum and head
  ell(g, 40, -44, 21, 20, '#231210', 2.4);
  glow(g, lava, 8, () => { seg(g, 30, -56, 44, -48, lava, 2.2); seg(g, 44, -48, 50, -36, lava, 2); });
  ell(g, 58, -34, 14, 12, '#1c0f0d', 2.4);
  // horns
  g.beginPath(); g.moveTo(56, -44); g.bezierCurveTo(64, -60, 76, -76, 92, -96); g.bezierCurveTo(84, -74, 76, -58, 70, -38); g.closePath();
  const hg = g.createLinearGradient(60, -40, 92, -96); hg.addColorStop(0, '#2a1512'); hg.addColorStop(0.7, '#4a2418'); hg.addColorStop(1, '#ff8c2e');
  g.fillStyle = hg; g.fill(); strokeOut(g, 2.4);
  g.beginPath(); g.moveTo(66, -30); g.quadraticCurveTo(78, -32, 84, -44); g.quadraticCurveTo(80, -28, 70, -24); g.closePath();
  g.fillStyle = '#3a1d16'; g.fill(); strokeOut(g, 2);
  glow(g, '#ffe05a', 8, () => circ(g, 63, -38, 3.2, '#ffe05a', 0));
  for (const [i, x] of [-28, 0, 28].entries()) {
    const m = i % 2 ? b : a;
    const fx = x + 10 + m * 9;
    limb(g, x, -20, fx, -3, 7, '#1c0f0d');
    poly(g, [x + 4, -14, x + 9, -19, x + 7, -12], '#3a1d16', 1.2);
  }
}

/* --------------------------- projectiles & fx ---------------------------- */

function drawShuriken(g) {
  star(g, 0, 0, 10.5, 3.6, 4, 0, '#c58d55', 2);
  seg(g, -6, -1, 6, 1, 'rgba(120,70,30,0.6)', 0.9);
  seg(g, -1, -6, 1, 6, 'rgba(120,70,30,0.6)', 0.9);
  circ(g, 0, 0, 2.1, '#3a2516', 1.2);
}
function drawBlade(g, evo) {
  const fill = evo ? '#ff4b4b' : '#d7dde3', mid = evo ? '#b3262a' : '#9aa3ad', hub = evo ? '#3a0f12' : '#3a3f46';
  const pts = [];
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * TAU, r = i % 2 ? 9.5 : 12.5;
    pts.push(Math.cos(a + (i % 2 ? 0.08 : 0)) * r, Math.sin(a + (i % 2 ? 0.08 : 0)) * r);
  }
  if (evo) glow(g, '#ff2020', 6, () => poly(g, pts, fill, 1.8)); else poly(g, pts, fill, 1.8);
  circ(g, 0, 0, 7, mid, 1.4);
  circ(g, 0, 0, 3, hub, 1.2);
  g.beginPath(); g.arc(0, 0, 9, -2.4, -1.2); g.lineWidth = 1.6; g.strokeStyle = 'rgba(255,255,255,0.7)'; g.stroke();
}
function drawDurian(g, evo) {
  const body = evo ? '#b71c1c' : '#7cb342', spike = evo ? '#1a1416' : '#aad65c', inner = evo ? '#e53935' : '#9ccc65';
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * TAU;
    const x = Math.cos(a), y = Math.sin(a);
    poly(g, [x * 14 - y * 4, y * 14 + x * 4, x * 21.5, y * 21.5, x * 14 + y * 4, y * 14 - x * 4], spike, 1.6);
  }
  circ(g, 0, 0, 15.5, body, 2);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * TAU + 0.3, r = i % 3 === 0 ? 4 : 9.5;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    poly(g, [x - 2.2, y + 1.6, x, y - 2.6, x + 2.2, y + 1.6], inner, 1);
  }
  ell(g, -5, -6, 5, 3, 'rgba(255,255,255,0.28)', 0, -0.6);
}
function drawSpike(g) {
  poly(g, [11, 0, -8, -3.2, -5, 0, -8, 3.2], '#151217', 1.2);
  seg(g, -3, -0.8, 7, -0.3, 'rgba(255,255,255,0.35)', 0.8);
}
function drawMissile(g, evo) {
  const body = evo ? '#1f1a26' : '#f3f3f3', trim = evo ? '#9b3fe0' : '#e53935';
  poly(g, [-11, -4, -16, -9, -8, -4], trim, 1.4);
  poly(g, [-11, 4, -16, 9, -8, 4], trim, 1.4);
  rr(g, -13, -4.5, 23, 9, 4, body, 1.8);
  poly(g, [10, -4.5, 17, 0, 10, 4.5], trim, 1.8);
  g.fillStyle = trim; g.fillRect(-2, -4.5, 3, 9);
  seg(g, -10, -2.2, 6, -2.2, 'rgba(255,255,255,0.35)', 1);
}
function drawMolotov(g) {
  rr(g, -5, -4, 10, 14, 4, 'rgba(70,170,80,0.92)', 1.8);
  rr(g, -2.2, -10, 4.4, 7, 1.5, 'rgba(70,170,80,0.92)', 1.6);
  ell(g, -2, 2, 1.3, 4, 'rgba(255,255,255,0.4)', 0);
  poly(g, [-2.5, -10, 2.5, -10, 3.5, -13, 0, -12, -3, -14], '#e8e1d0', 1.2);
  glow(g, '#ff9800', 5, () => poly(g, [-2, -13, 0, -19, 2.5, -13], '#ffb02e', 0));
}
function drawCanister(g) {
  rr(g, -6, -9, 12, 20, 4, '#5f7fa0', 1.8);
  g.save(); rrPath(g, -6, -9, 12, 20, 4); g.clip();
  for (let i = -2; i < 4; i++) poly(g, [i * 4 - 6, -2, i * 4 - 4, -2, i * 4 - 8, 3, i * 4 - 10, 3], '#f2c230', 0);
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(-4.5, -8, 2.5, 18);
  g.restore();
  rr(g, -2.5, -13, 5, 5, 1.5, '#3a3f46', 1.4);
  seg(g, -4, -13, 4, -13, OUT, 1.8);
}
function drawGem(g, s) {
  poly(g, [0, -7 * s, 5.5 * s, -1 * s, 0, 7 * s, -5.5 * s, -1 * s], '#43e06a', 1.6);
  poly(g, [0, -7 * s, 0, 7 * s, -5.5 * s, -1 * s], '#2fbf56', 0);
  poly(g, [0, -7 * s, -5.5 * s, -1 * s, 0, -1 * s], '#b6ffc8', 0);
  poly(g, [0, -7 * s, 5.5 * s, -1 * s, 0, 7 * s, -5.5 * s, -1 * s], null, 1.6);
}
function drawFlame(g, f, pal) {
  const w = [1, 0.9, 1.08, 0.95][f], h = [1, 1.1, 0.94, 1.05][f], lean = [0, 1.5, -1, 0.5][f];
  const shape = (sx, sy, c) => {
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-9 * sx, -1, -8 * sx, -12 * sy, lean * 2, -24 * sy);
    g.bezierCurveTo(8 * sx, -12 * sy, 9 * sx, -1, 0, 0);
    g.fillStyle = c; g.fill();
  };
  shape(w, h, pal[0]); shape(w * 0.7, h * 0.72, pal[1]); shape(w * 0.4, h * 0.42, pal[2]);
}
const FLAME_PALS = {
  orange: ['#ff5a14', '#ffae2b', '#fff3a6'],
  blue:   ['#2361ff', '#5fb2ff', '#e6f6ff'],
  purple: ['#7f1fd0', '#c77dff', '#f8e6ff'],
};

/* --------------------------------- build --------------------------------- */

function buildSprites(res) {
  RES = res;
  SPR.player = frameSet(44, 58, 22, 52, 8, (g, f) => drawSurvivor(g, f % 4, f < 4), { green: true });
  SPR.zombie = frameSet(48, 56, 20, 52, 4, (g, f) => drawZombie(g, f, ZOMBIE_PAL));
  SPR.brute = frameSet(74, 86, 31, 80, 4, (g, f) => { g.scale(1.55, 1.55); drawZombie(g, f, BRUTE_PAL); });
  SPR.butterfly = frameSet(50, 42, 25, 21, 4, (g, f) => drawButterfly(g, f, MOTH_PAL), { noFlip: true });
  SPR.mothElite = frameSet(78, 64, 39, 32, 4, (g, f) => { g.scale(1.55, 1.55); drawButterfly(g, f, MOTH_ELITE); }, { noFlip: true });
  SPR.beetle = frameSet(50, 34, 24, 31, 4, (g, f) => drawBeetle(g, f, BEETLE_PAL, false));
  SPR.beetleElite = frameSet(76, 56, 37, 50, 4, (g, f) => { g.scale(1.55, 1.55); drawBeetle(g, f, BEETLE_ELITE, true); });
  SPR.minion = frameSet(50, 34, 24, 31, 4, (g, f) => drawBeetle(g, f, MINION_PAL, true));
  const B = { flash: 0.32 };
  SPR.dread = frameSet(120, 150, 52, 142, 4, (g, f) => drawDreadnought(g, f, 'walk'), B);
  SPR.dreadRaise = frameSet(120, 150, 52, 142, 1, g => drawDreadnought(g, 0, 'raise'), B)[0];
  SPR.dreadCrouch = frameSet(120, 150, 52, 142, 1, g => drawDreadnought(g, 0, 'crouch'), B)[0];
  SPR.mothra = frameSet(160, 130, 80, 62, 6, (g, f) => drawMothra(g, f), { noFlip: true, flash: 0.32 });
  SPR.titanus = frameSet(200, 140, 90, 132, 4, (g, f) => drawTitanus(g, f), B);

  SPR.shadow = makeSprite(40, 16, 20, 8, g => ell(g, 0, 0, 19, 7, 'rgba(0,0,0,0.32)', 0));
  SPR.shuriken = makeSprite(24, 24, 12, 12, drawShuriken);
  SPR.blade = makeSprite(30, 30, 15, 15, g => drawBlade(g, false));
  SPR.bladeEvo = makeSprite(34, 34, 17, 17, g => drawBlade(g, true));
  SPR.durian = makeSprite(48, 48, 24, 24, g => drawDurian(g, false));
  SPR.durianEvo = makeSprite(48, 48, 24, 24, g => drawDurian(g, true));
  SPR.spike = makeSprite(24, 10, 10, 5, drawSpike);
  SPR.missile = makeSprite(36, 22, 17, 11, g => drawMissile(g, false));
  SPR.missileEvo = makeSprite(36, 22, 17, 11, g => drawMissile(g, true));
  SPR.molotov = makeSprite(16, 34, 8, 20, drawMolotov);
  SPR.canister = makeSprite(18, 30, 9, 16, drawCanister);
  SPR.rock = makeSprite(40, 36, 20, 18, g => drawRock(g, 0, 0, 15));
  SPR.gem = makeSprite(14, 18, 7, 9, g => drawGem(g, 1));
  SPR.gemBig = makeSprite(22, 28, 11, 14, g => drawGem(g, 1.6));
  SPR.poison = makeSprite(30, 30, 15, 15, g => {
    g.fillStyle = radial(g, 0, 0, 14, [[0, 'rgba(200,255,140,1)'], [0.5, 'rgba(110,230,60,0.95)'], [1, 'rgba(60,160,30,0)']]);
    g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.fill();
    circ(g, 0, 0, 7.5, '#5fd43a', 1.6);
    circ(g, -2.5, -2.5, 2.2, '#d6ffb0', 0);
    circ(g, 2.6, 1.8, 1.4, '#2f7a1c', 0);
  });
  SPR.dust = makeSprite(18, 18, 9, 9, g => {
    g.fillStyle = radial(g, 0, 0, 9, [[0, '#ffffff'], [0.35, '#f0b8ff'], [0.7, 'rgba(190,90,255,0.8)'], [1, 'rgba(150,50,230,0)']]);
    g.beginPath(); g.arc(0, 0, 9, 0, TAU); g.fill();
  });
  SPR.lava = makeSprite(20, 20, 10, 10, g => {
    g.fillStyle = radial(g, 0, 0, 10, [[0, '#fff6c0'], [0.35, '#ffc43a'], [0.7, 'rgba(255,110,20,0.85)'], [1, 'rgba(255,60,0,0)']]);
    g.beginPath(); g.arc(0, 0, 10, 0, TAU); g.fill();
  });
  SPR.lavaSpike = makeSprite(36, 46, 18, 40, g => {
    glow(g, '#ff7a1a', 10, () => poly(g, [-13, 0, -6, -24, -2, -15, 3, -36, 8, -16, 13, 0], '#3a2420', 2));
    poly(g, [-4, -2, 0, -14, 3, -30, 5, -12, 7, -2], '#ff8a2a', 0);
    poly(g, [-1, -3, 2, -22, 4, -4], '#ffe08a', 0);
  });
  SPR.mine = [0, 1].map(i => makeSprite(34, 34, 17, 17, g => {
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.785; poly(g, [Math.cos(a) * 9 - Math.sin(a) * 3, Math.sin(a) * 9 + Math.cos(a) * 3, Math.cos(a) * 15, Math.sin(a) * 15, Math.cos(a) * 9 + Math.sin(a) * 3, Math.sin(a) * 9 - Math.cos(a) * 3], '#4a3530', 1.4); }
    circ(g, 0, 0, 11, '#2a1d1a', 2);
    circ(g, 0, 0, 8, '#4a3530', 1.2);
    if (i) glow(g, '#ffb030', 10, () => circ(g, 0, 0, 4.5, '#ffd36a', 0));
    else circ(g, 0, 0, 4, '#b8400e', 0);
  }));
  SPR.flames = {};
  for (const k in FLAME_PALS) SPR.flames[k] = [0, 1, 2, 3].map(f => makeSprite(22, 28, 11, 26, g => drawFlame(g, f, FLAME_PALS[k])));
  const disc = stops => makeSprite(128, 128, 64, 64, g => { g.fillStyle = radial(g, 0, 0, 64, stops); g.beginPath(); g.arc(0, 0, 64, 0, TAU); g.fill(); }, Math.min(res, 1.5));
  SPR.glowOrange = disc([[0, 'rgba(255,170,50,0.55)'], [0.6, 'rgba(255,90,20,0.32)'], [1, 'rgba(255,60,0,0)']]);
  SPR.glowBlue = disc([[0, 'rgba(120,200,255,0.6)'], [0.6, 'rgba(40,110,255,0.35)'], [1, 'rgba(20,60,255,0)']]);
  SPR.glowPurple = disc([[0, 'rgba(230,170,255,0.7)'], [0.5, 'rgba(160,60,240,0.4)'], [1, 'rgba(110,20,200,0)']]);
  SPR.glowRed = disc([[0, 'rgba(255,190,90,0.7)'], [0.45, 'rgba(255,90,30,0.4)'], [1, 'rgba(255,40,0,0)']]);
  SPR.fieldGreen = disc([[0, 'rgba(90,255,120,0.05)'], [0.75, 'rgba(90,255,120,0.16)'], [0.95, 'rgba(140,255,160,0.38)'], [1, 'rgba(140,255,160,0)']]);
  SPR.fieldRed = disc([[0, 'rgba(255,70,70,0.07)'], [0.75, 'rgba(255,60,60,0.2)'], [0.95, 'rgba(255,120,120,0.45)'], [1, 'rgba(255,120,120,0)']]);
  SPR.dizzy = makeSprite(12, 12, 6, 6, g => star(g, 0, 0, 5.5, 2.4, 5, -Math.PI / 2, '#ffe14a', 1.2));
  SPR.drop = makeSprite(12, 14, 6, 8, g => { g.beginPath(); g.moveTo(0, -6); g.quadraticCurveTo(5, 1, 0, 5.5); g.quadraticCurveTo(-5, 1, 0, -6); g.fillStyle = '#6dff4a'; g.fill(); strokeOut(g, 1.4); });
}
