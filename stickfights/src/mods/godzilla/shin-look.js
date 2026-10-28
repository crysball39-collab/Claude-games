/* =============================================================================
   SHIN GODZILLA - how he is drawn.

   Near black, with a red-brown cast - and everywhere the hide has split, a
   crack of red light, as if what is inside him were burning. The hide itself
   rough and lumped like scar tissue. Rows on rows of plates down his back
   and tail, jagged as broken rock, dark, with red under them; when the beam
   is coming they light up purple, from the tail up, and so do the cracks.
   A small head: a long jaw full of uneven teeth that stick out every way,
   and a tiny white eye with a pinprick of black in it - nothing in it at
   all. Legs like towers, the arms tiny and limp, the long fingers hanging;
   and the end of his tail a knot of pale bone.

   Drawn in his own frame (body.js, shin-body.js), squeezed and turned the
   way he faces, like the 1954 one (look.js, whose ways of drawing these
   borrow).
   ========================================================================== */
import { clamp, lerp, TAU, rng } from '../../core/util.js';
import { makeJoints } from '../../game/skeleton.js';
import { newBody, stepBody, boundsOf } from './body.js';
import { SD, SHK, shinTailR, SHIN_BUILD } from './shin-body.js';
import { taper, circle, poly, blob, mixHex, OUT } from './look.js';

export const SC = {
  ink: '#0a0606',
  skin: '#2a1b19',
  far: '#1b1110',
  belly: '#3b2521',
  rough: '#140c0b',
  crack: '#d93a1c',
  plate: '#2c201e',
  plateFar: '#1c1413',
  plateEdge: '#0c0807',
  plateRed: '#6a1c12',
  teeth: '#ddd3c1',
  mouth: '#330908',
  eye: '#f4f1ea',
  pupil: '#040303',
  bone: '#cdc3b1',
  boneDark: '#8c8273',
  claw: '#140e0d',
  purple: '#a86cff',
  lilac: '#ead9ff',
};

/** Outlined and filled: the outline drawn first, fat, so only the outside edge of it shows. */
function solid(ctx, build, fill) {
  ctx.beginPath();
  build();
  ctx.lineWidth = OUT * 2;
  ctx.strokeStyle = SC.ink;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** A number in 0..1 that is always the same for (i, k): how each plate, tooth and crack differs from the next. */
const hash = (i, k = 0) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

/* --------------------------------- the head --------------------------------- */

// the upper head and snout, and the lower jaw, in the head's own frame (x along the snout, y up)
// (a flat top to the skull, the snout ending blunt, and the lower jaw longer than the upper, jutting past it)
const HEAD = [
  [-0.6, -0.42], [-0.78, 0.08], [-0.6, 0.5], [-0.1, 0.66], [0.6, 0.66], [1.3, 0.6], [1.9, 0.5], [2.3, 0.4],
  [2.52, 0.26], [2.58, 0.04], [2.48, -0.16], [2.15, -0.24], [1.7, -0.27], [1.15, -0.3], [0.6, -0.34], [0.1, -0.42],
];
const JAW = [
  [-0.1, -0.4], [0.6, -0.36], [1.3, -0.34], [2.0, -0.33], [2.62, -0.28], [2.92, -0.36], [2.9, -0.6],
  [2.55, -0.84], [1.8, -0.98], [1.0, -1.04], [0.35, -1.0], [-0.2, -0.84], [-0.5, -0.6],
];
const HX = 0.15, HY = -0.38;

/** Points of the head (jaw: turned about the hinge by angle a, the jaw's own). */
function headPts(sk, list, a = null) {
  const out = [];
  const c = a === null ? 1 : Math.cos(-a), s = a === null ? 0 : Math.sin(-a);
  for (const [x0, y0] of list) {
    let x = x0, y = y0;
    if (a !== null) { const dx = x - HX, dy = y - HY; x = HX + dx * c - dy * s; y = HY + dx * s + dy * c; }
    out.push(sk.hd(x, y));
  }
  return out;
}

// his teeth: every one a different length, at a different angle - they stick out every way
const R = rng(2016);
const UP_TEETH = [], LOW_TEETH = [];
for (let i = 0; i < 17; i++) UP_TEETH.push({ u: 0.4 + i * 0.13 + (R() - 0.5) * 0.06, len: 0.13 + R() * 0.2 + (i > 11 ? 0.1 : 0), ang: (R() - 0.5) * 0.95, w: 0.07 + R() * 0.05 });
for (let i = 0; i < 15; i++) LOW_TEETH.push({ u: 0.45 + i * 0.156 + (R() - 0.5) * 0.06, len: 0.12 + R() * 0.18 + (i > 10 ? 0.08 : 0), ang: (R() - 0.5) * 0.95, w: 0.07 + R() * 0.05 });

/** One row of teeth. at(u): the root of the tooth at u, in the head's frame; turn: how that frame is turned (the jaw's). */
function teeth(ctx, sk, list, at, up, turn, fill) {
  const c = Math.cos(-turn), s = Math.sin(-turn);
  const rot = (x, y) => { const dx = x - HX, dy = y - HY; return sk.hd(HX + dx * c - dy * s, HY + dx * s + dy * c); };
  ctx.beginPath();
  for (const t of list) {
    const r = at(t.u);
    const dx = Math.sin(t.ang) * t.len, dy = (up ? 1 : -1) * Math.cos(t.ang) * t.len;
    const a = rot(r.x - t.w / 2, r.y), b = rot(r.x + t.w / 2, r.y), tip = rot(r.x + dx, r.y + dy);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(b.x, b.y);
    ctx.closePath();
  }
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 0.02;
  ctx.strokeStyle = 'rgba(20, 10, 8, 0.9)';
  ctx.stroke();
}

const lipUp = (u) => ({ x: u, y: lerp(-0.37, -0.22, clamp((u - 0.3) / 2.3, 0, 1)) });
const lipLow = (u) => ({ x: u, y: lerp(-0.38, -0.33, clamp((u - 0.3) / 2.4, 0, 1)) });

function headDetails(ctx, sk, gz) {
  // the teeth: the upper ones down out of the lip, the lower ones up out of the jaw - even shut, they show
  teeth(ctx, sk, UP_TEETH, lipUp, false, 0, SC.teeth);
  teeth(ctx, sk, LOW_TEETH, lipLow, true, sk.jawA, SC.teeth);
  // the eye: tiny, white, with a pinprick of black - and nothing behind it
  const e = sk.eye, ea = Math.atan2(sk.F.y, sk.F.x);
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, 0.2 * SHK, 0.14 * SHK, ea, 0, TAU);
  ctx.fillStyle = '#0b0606';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e.x, e.y, 0.1 * SHK, 0, TAU);
  ctx.fillStyle = gz.dead ? '#6d6660' : SC.eye;
  ctx.fill();
  if (!gz.dead) {
    ctx.beginPath();
    ctx.arc(e.x + sk.F.x * 0.025, e.y + sk.F.y * 0.025, 0.032 * SHK, 0, TAU);
    ctx.fillStyle = SC.pupil;
    ctx.fill();
  }
  // a fold of skin under the eye, and the nostril high on the snout
  ctx.lineCap = 'round';
  ctx.beginPath();
  const f0 = sk.hd(0.75, -0.02), f1 = sk.hd(1.05, -0.1), f2 = sk.hd(1.4, -0.02);
  ctx.moveTo(f0.x, f0.y);
  ctx.quadraticCurveTo(f1.x, f1.y, f2.x, f2.y);
  ctx.lineWidth = 0.05;
  ctx.strokeStyle = SC.rough;
  ctx.stroke();
  const ns = sk.hd(2.36, 0.3);
  ctx.beginPath();
  ctx.ellipse(ns.x, ns.y, 0.1 * SHK, 0.035 * SHK, ea - 0.25, 0, TAU);
  ctx.fillStyle = '#060404';
  ctx.fill();
  // the ridges over the top of his skull
  ctx.beginPath();
  for (const [a, b] of [[[0.1, 0.62], [0.9, 0.7]], [[1.0, 0.6], [1.8, 0.46]], [[-0.3, 0.3], [0.4, 0.42]], [[1.5, 0.3], [2.2, 0.16]]]) {
    const p = sk.hd(a[0], a[1]), q = sk.hd(b[0], b[1]);
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
  }
  ctx.lineWidth = 0.045;
  ctx.stroke();
}

/** The far half of his lower jaw, split away from the near one and hanging lower. */
function farJaw(ctx, sk) {
  const a = sk.jawA + sk.splitA;
  solid(ctx, () => blob(ctx, headPts(sk, JAW, a)), SC.far);
  teeth(ctx, sk, LOW_TEETH, lipLow, true, a, '#a49b8c');
}

/** The inside of his mouth, behind the jaws: only shows when it is open - and with the beam coming, it burns. */
function drawMouth(ctx, sk, gz) {
  if (sk.jawA < 0.04) return;
  ctx.beginPath();
  const far = sk.splitA > 0.02 ? sk.jawA + sk.splitA : sk.jawA;
  poly(ctx, [sk.hd(0.05, -0.36), sk.hd(2.5, -0.2), ...headPts(sk, [[2.6, -0.34], [0.3, -0.38]], far)]);
  const g = gz.glow || 0;
  ctx.fillStyle = g > 0.25 ? mixHex(SC.mouth, '#c99cff', Math.min(1, (g - 0.25) * 1.6)) : SC.mouth;
  ctx.fill();
}

/* -------------------------------- the plates -------------------------------- */

/** The ridge along his back, from behind his head to the end of his tail: points, which way is out (back, or up), how thick he is there. */
function spineOf(sk) {
  const raw = [
    { p: sk.neckTop, r: SD.neckR * 0.8 }, { p: sk.neckMid, r: SD.neckR * 1.05 }, { p: sk.chest, r: SD.neckR * 1.3 },
    { p: sk.hump, r: SD.chestR * 0.92 }, { p: { x: sk.hip.x - sk.n.x * 0.5, y: sk.hip.y - sk.n.y * 0.5 }, r: SD.belly * 0.85 },
  ];
  const T = sk.tail;
  for (let i = 1; i < T.length; i++) raw.push({ p: T[i], r: shinTailR(i) });
  const pts = [];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[Math.max(0, i - 1)].p, b = raw[Math.min(raw.length - 1, i + 1)].p;
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    // (going from his head to the end of his tail, the side to the right of that is his back - and the top of his tail)
    pts.push({ x: raw[i].p.x, y: raw[i].p.y, nx: dy / l, ny: -dx / l, r: raw[i].r });
  }
  let s = 0;
  pts[0].s = 0;
  for (let i = 1; i < pts.length; i++) { s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); pts[i].s = s; }
  for (const p of pts) p.k = p.s / (s || 1);
  pts.len = s;
  return pts;
}

function along(spine, s) {
  for (let i = 1; i < spine.length; i++) {
    const a = spine[i - 1], b = spine[i];
    if (s <= b.s || i === spine.length - 1) {
      const u = clamp((s - a.s) / ((b.s - a.s) || 1), 0, 1);
      const nx = lerp(a.nx, b.nx, u), ny = lerp(a.ny, b.ny, u), l = Math.hypot(nx, ny) || 1;
      return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), nx: nx / l, ny: ny / l, r: lerp(a.r, b.r, u), k: lerp(a.k, b.k, u) };
    }
  }
  return spine[spine.length - 1];
}

/** How big a plate is, a fraction k of the way from his head to the end of his tail. */
const plateSize = (k) => (k < 0.08 ? lerp(1.3, 3.0, k / 0.08) : k < 0.3 ? 3.0 : lerp(3.0, 0.34, Math.pow((k - 0.3) / 0.7, 0.8)));

// shards of broken rock: base on the x axis, pointing up y, about 1 wide and 1 tall
const SHARDS = [
  [[-0.42, 0], [-0.5, 0.22], [-0.32, 0.38], [-0.4, 0.6], [-0.16, 0.66], [-0.08, 1.0], [0.06, 0.7], [0.24, 0.8], [0.26, 0.5], [0.44, 0.36], [0.36, 0.16], [0.46, 0]],
  [[-0.46, 0], [-0.36, 0.3], [-0.5, 0.48], [-0.22, 0.56], [-0.2, 0.86], [0.02, 0.62], [0.12, 1.0], [0.22, 0.6], [0.42, 0.62], [0.32, 0.34], [0.5, 0.2], [0.4, 0]],
  [[-0.4, 0], [-0.46, 0.34], [-0.26, 0.42], [-0.3, 0.72], [-0.06, 0.6], [0.04, 1.0], [0.16, 0.66], [0.36, 0.7], [0.3, 0.42], [0.48, 0.28], [0.42, 0]],
];

function platesOf(spine, row) {
  const out = [];
  const k0 = row === 'mid' ? 1 : row === 'side' ? 0.62 : 0.42;
  let s = row === 'mid' ? 0.4 : row === 'side' ? 0.9 : 1.3, i = row === 'mid' ? 0 : row === 'side' ? 100 : 200;
  while (s < spine.len - 0.3) {
    const p = along(spine, s);
    const size = plateSize(p.k) * k0 * (0.85 + hash(i, 1) * 0.3);
    const sink = row === 'mid' ? 0.78 : 0.62;
    out.push({ x: p.x + p.nx * p.r * sink, y: p.y + p.ny * p.r * sink, nx: p.nx, ny: p.ny, size, k: p.k, i });
    s += Math.max(0.28, plateSize(p.k) * (row === 'mid' ? 0.62 : 0.7));
    i++;
  }
  return out;
}

/** How lit a plate is (or a crack), a fraction k of the way down from his head, the glow at `glow`: it climbs up from the tail. */
const lit = (glow, k) => clamp((glow * 1.35 - (1 - k) * 0.9) * 2.2, 0, 1);

function drawPlates(ctx, list, fill, glow) {
  for (const p of list) {
    const shard = SHARDS[p.i % SHARDS.length], flip = hash(p.i, 2) < 0.5 ? -1 : 1;
    const w = p.size * 1.0, h = p.size * (0.9 + hash(p.i, 3) * 0.25);
    // standing out of his back, leaning toward the tail, and none at quite the same angle
    const ang = Math.atan2(p.ny, p.nx) - Math.PI / 2 + 0.3 + (hash(p.i, 4) - 0.5) * 0.3;
    const c = Math.cos(ang), s = Math.sin(ang);
    const at = (lx, ly) => ({ x: p.x + lx * flip * w * c - ly * h * s, y: p.y + lx * flip * w * s + ly * h * c });
    const L = lit(glow, p.k);
    ctx.beginPath();
    for (let j = 0; j < shard.length; j++) { const q = at(shard[j][0], shard[j][1]); if (j) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }
    ctx.closePath();
    ctx.fillStyle = L > 0 ? mixHex(fill, '#b78cff', L * 0.75) : fill;
    ctx.fill();
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = L > 0.5 ? 'rgba(200, 160, 255, 0.95)' : SC.plateEdge;
    ctx.stroke();
    // the red under it, where it comes out of him (white-hot purple, lit)
    if (p.size > 0.5) {
      ctx.beginPath();
      for (let j = 0; j < shard.length; j++) { const q = at(shard[j][0] * 0.55, shard[j][1] * 0.42); if (j) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }
      ctx.closePath();
      ctx.fillStyle = L > 0 ? mixHex(SC.plateRed, '#f1e4ff', L) : SC.plateRed;
      ctx.fill();
      // and a crease or two down it
      ctx.beginPath();
      const a = at(-0.05, 0.1), b = at(0.02, 0.85), d = at(0.25, 0.2), e = at(0.18, 0.62);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.moveTo(d.x, d.y); ctx.lineTo(e.x, e.y);
      ctx.lineWidth = 0.035;
      ctx.strokeStyle = L > 0.5 ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.45)';
      ctx.stroke();
    }
  }
}

/** The light off lit plates: drawn over everything, adding. */
function plateGlow(ctx, list, glow) {
  if (glow <= 0.02) return;
  for (const p of list) {
    const L = lit(glow, p.k);
    if (L <= 0.05) continue;
    const r = p.size * 1.15;
    const cx = p.x + p.nx * p.size * 0.45, cy = p.y + p.ny * p.size * 0.45;
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, `rgba(196, 140, 255, ${0.38 * L})`);
    gr.addColorStop(1, 'rgba(140, 80, 255, 0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
  }
}

/* ---------------------------------- the body --------------------------------- */

function tailPoly(sk) {
  const T = sk.tail, n = T.length;
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = T[Math.max(0, i - 1)], b = T[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l, r = shinTailR(i);
    left.push({ x: T[i].x + nx * r, y: T[i].y + ny * r });
    right.push({ x: T[i].x - nx * r, y: T[i].y - ny * r });
  }
  const e = T[n - 1], p = T[n - 2];
  const dx = e.x - p.x, dy = e.y - p.y, l = Math.hypot(dx, dy) || 1;
  const tip = { x: e.x + (dx / l) * shinTailR(n - 1) * 1.4, y: e.y + (dy / l) * shinTailR(n - 1) * 1.4 };
  return [...left, tip, ...right.reverse()];
}

/** The tail, the body, the hunch, the neck and the head: one shape. */
function mainBody(ctx, sk) {
  blob(ctx, tailPoly(sk));
  taper(ctx, sk.hip, sk.chest, SD.belly * 1.0, SD.chestR);
  // the belly, low and heavy in front
  ctx.moveTo(sk.belly.x + SD.belly * 1.1, sk.belly.y);
  ctx.ellipse(sk.belly.x, sk.belly.y, SD.belly * 1.1, SD.belly * 0.98, -sk.a + Math.PI / 2, 0, TAU, false);
  // the haunch, and the hunch of his back
  circle(ctx, { x: sk.hip.x - 0.5, y: sk.hip.y - 0.2 }, SD.belly * 0.92);
  circle(ctx, sk.hump, SD.chestR * 0.95);
  taper(ctx, sk.chest, sk.neckMid, SD.neckR * 1.5, SD.neckR * 1.12);
  taper(ctx, sk.neckMid, sk.neckTop, SD.neckR * 1.12, SD.neckR * 0.82);
  blob(ctx, headPts(sk, HEAD));
  blob(ctx, headPts(sk, JAW, sk.jawA));
}

/** One leg: the huge thigh, the shin, the foot. */
function leg(ctx, L) {
  taper(ctx, L.hip, L.knee, SD.thighR * 1.05, SD.shinR * 1.18);
  taper(ctx, L.knee, L.ankle, SD.shinR * 1.18, SD.shinR * 0.88);
  const c = Math.cos(L.tilt), s = Math.sin(L.tilt);
  const at = (x, y) => ({ x: L.ankle.x + x * c - y * s, y: L.ankle.y + x * s + y * c });
  blob(ctx, [at(-1.05, -1.12), at(-1.2, -0.4), at(-0.7, 0.42), at(0.4, 0.5), at(1.5, 0.0), at(2.2, -0.62), at(2.3, -1.12)]);
}

function legDetails(ctx, L, fill) {
  const c = Math.cos(L.tilt), s = Math.sin(L.tilt);
  const at = (x, y) => ({ x: L.ankle.x + x * c - y * s, y: L.ankle.y + x * s + y * c });
  // four toes, and the claws on them: long, and as dark as he is
  for (const [x, y, r] of [[1.05, -0.78, 0.36], [1.45, -0.82, 0.38], [1.83, -0.86, 0.36], [2.15, -0.9, 0.3]]) {
    const p = at(x, y);
    ctx.beginPath();
    circle(ctx, p, r);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = SC.ink;
    ctx.stroke();
    const q = at(x + r * 0.9, y - 0.05), tip = at(x + r * 2.1, y - 0.36), b = at(x + r * 0.5, y - r * 0.9);
    ctx.beginPath();
    ctx.moveTo(q.x, q.y);
    ctx.quadraticCurveTo(tip.x, tip.y + 0.15, tip.x, tip.y);
    ctx.lineTo(b.x, b.y);
    ctx.closePath();
    ctx.fillStyle = SC.claw;
    ctx.fill();
    ctx.lineWidth = 0.03;
    ctx.strokeStyle = '#3a2c28';
    ctx.stroke();
  }
  // folds at the knee and round the ankle
  ctx.beginPath();
  ctx.arc(L.knee.x, L.knee.y, SD.shinR * 0.75, -0.5, 1.2);
  for (let i = 0; i < 3; i++) {
    const y = 0.3 + i * 0.28;
    const a = at(-0.8, y), b = at(0.55, y + 0.06), m = at(-0.1, y - 0.16);
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(m.x, m.y, b.x, b.y);
  }
  ctx.lineWidth = 0.07;
  ctx.strokeStyle = SC.rough;
  ctx.stroke();
}

/** One of his arms: tiny, hanging. */
function arm(ctx, A) {
  taper(ctx, A.shoulder, A.elbow, SD.upperR * 1.15, SD.foreR * 1.1);
  taper(ctx, A.elbow, A.hand, SD.foreR * 1.1, SD.foreR * 0.85);
  circle(ctx, A.hand, SD.foreR * 0.95);
}

/** His fingers: long and thin, hanging down off the end of the arm, a little curled. */
function fingers(ctx, A, fill) {
  const dx = A.hand.x - A.elbow.x, dy = A.hand.y - A.elbow.y, a = Math.atan2(dy, dx);
  for (const [off, len] of [[-0.35, 0.95], [-0.05, 1.05], [0.25, 1.0], [0.6, 0.75]]) {
    const ang = a + off;
    const mid = { x: A.hand.x + Math.cos(ang) * len * 0.55, y: A.hand.y + Math.sin(ang) * len * 0.55 };
    const bend = ang - 0.45;
    const tip = { x: mid.x + Math.cos(bend) * len * 0.5, y: mid.y + Math.sin(bend) * len * 0.5 };
    ctx.beginPath();
    taper(ctx, A.hand, mid, 0.11, 0.08);
    taper(ctx, mid, tip, 0.08, 0.05);
    ctx.lineWidth = OUT * 1.2;
    ctx.strokeStyle = SC.ink;
    ctx.stroke();
    ctx.fillStyle = fill;
    ctx.fill();
  }
}

/** The end of his tail: a knot of pale bone, spines and a gaping slot like a mouth. */
function tailTip(ctx, sk, gz) {
  const T = sk.tail, n = T.length, e = T[n - 1], p = T[n - 3];
  const dx = e.x - p.x, dy = e.y - p.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
  const r = shinTailR(n - 1);
  const at = (f, o) => ({ x: e.x + ux * f + nx * o, y: e.y + uy * f + ny * o });
  // the spines
  ctx.beginPath();
  for (const [f, o, len, ang] of [[0.1, 0.25, 0.9, 0.9], [0.35, 0.12, 1.1, 0.45], [0.5, -0.05, 1.0, 0.1], [0.4, -0.2, 0.85, -0.45], [0.1, -0.28, 0.7, -0.9], [-0.25, 0.3, 0.6, 1.3]]) {
    const b = at(f, o), c = Math.cos(ang), s = Math.sin(ang);
    const tx = ux * c - uy * s, ty = ux * s + uy * c;
    const t2 = { x: b.x + tx * len, y: b.y + ty * len };
    ctx.moveTo(b.x - ty * 0.09, b.y + tx * 0.09);
    ctx.lineTo(t2.x, t2.y);
    ctx.lineTo(b.x + ty * 0.09, b.y - tx * 0.09);
    ctx.closePath();
  }
  ctx.fillStyle = SC.bone;
  ctx.fill();
  ctx.lineWidth = 0.035;
  ctx.strokeStyle = SC.ink;
  ctx.stroke();
  // the knot of bone itself, and the slot in the end of it
  ctx.beginPath();
  ctx.ellipse(e.x + ux * 0.2, e.y + uy * 0.2, r * 1.5, r * 1.2, Math.atan2(uy, ux), 0, TAU);
  ctx.fillStyle = SC.boneDark;
  ctx.fill();
  ctx.stroke();
  const m0 = at(0.15, 0.12), m1 = at(0.62, 0.02), m2 = at(0.15, -0.14);
  ctx.beginPath();
  ctx.moveTo(m0.x, m0.y);
  ctx.lineTo(m1.x, m1.y);
  ctx.lineTo(m2.x, m2.y);
  ctx.closePath();
  const tg = gz.tailGlow || 0;
  ctx.fillStyle = tg > 0.05 ? mixHex('#120808', '#e3cfff', tg) : '#120808';
  ctx.fill();
}

/* --------------------------------- his hide --------------------------------- */

/**
 * The cracks in his hide, where the red shows through, and the rough lumps of
 * it: made once for each of him, in each part's own terms (how far along it,
 * how far across), and put where that part is now.
 */
export function makeCracks(seed) {
  const r = rng(seed || 1);
  const out = [];
  const add = (part, n, spread) => {
    for (let i = 0; i < n; i++) {
      const segs = [];
      const m = 2 + Math.floor(r() * 3);
      for (let j = 0; j < m; j++) segs.push([(r() - 0.3) * 0.09, (r() - 0.5) * 0.35]);
      out.push({ part, t: 0.04 + r() * 0.92, o: (r() * 2 - 1) * spread, segs, lump: r() < 0.45, lr: 0.5 + r() * 0.6, la: r() * 3 });
    }
  };
  add('torso', 14, 0.85); add('neck', 7, 0.8); add('tail', 22, 0.7);
  add('thighA', 8, 0.8); add('shinA', 5, 0.75); add('thighB', 5, 0.75); add('shinB', 3, 0.7);
  return out;
}

/** Where a point on a part is: { x, y, ax, ay, r } (ax, ay: the way the part runs). */
function onPart(sk, part, t, o) {
  const on = (a, b, r) => {
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, ax = dx / l, ay = dy / l;
    return { x: a.x + dx * t - ay * o * r, y: a.y + dy * t + ax * o * r, ax, ay, r };
  };
  switch (part) {
    case 'torso': return on(sk.hip, sk.chest, lerp(SD.belly, SD.chestR, t));
    case 'neck': return t < 0.5 ? on(sk.chest, sk.neckMid, SD.neckR * 1.3) : on(sk.neckMid, sk.neckTop, SD.neckR);
    case 'tail': {
      const T = sk.tail, f = clamp(t, 0, 0.98) * (T.length - 1.3), i = Math.floor(f);
      const a = T[i], b = T[i + 1], k = f - i, rr = lerp(shinTailR(i), shinTailR(i + 1), k);
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, ax = dx / l, ay = dy / l;
      return { x: a.x + dx * k - ay * o * rr, y: a.y + dy * k + ax * o * rr, ax, ay, r: rr };
    }
    case 'thighA': case 'thighB': { const L = sk.legs[part.slice(-1)]; return on(L.hip, L.knee, SD.thighR); }
    case 'shinA': case 'shinB': { const L = sk.legs[part.slice(-1)]; return on(L.knee, L.ankle, SD.shinR); }
    default: return null;
  }
}

/** The cracks (and lumps) on the parts `only` picks; glow: how far the purple has climbed. */
function drawHide(ctx, sk, cracks, only, glow) {
  const lines = [], lumps = [];
  for (const c of cracks) {
    if (!only(c.part)) continue;
    const p0 = onPart(sk, c.part, c.t, c.o);
    if (!p0) continue;
    if (c.lump) lumps.push({ x: p0.x, y: p0.y, r: p0.r * 0.22 * c.lr, a: c.la });
    const pts = [p0];
    let t = c.t, o = c.o;
    for (const [dt, dO] of c.segs) {
      t = clamp(t + dt, 0, 1); o = clamp(o + dO, -0.95, 0.95);
      const q = onPart(sk, c.part, t, o);
      if (q) pts.push(q);
    }
    lines.push({ pts, k: c.part === 'tail' ? 0.3 + c.t * 0.7 : c.part === 'neck' ? 0.1 : 0.25 });
  }
  // the lumps: darker, rough
  ctx.beginPath();
  for (const q of lumps) { ctx.moveTo(q.x + Math.cos(q.a) * q.r, q.y + Math.sin(q.a) * q.r); ctx.ellipse(q.x, q.y, q.r, q.r * 0.6, q.a, 0, TAU); }
  ctx.fillStyle = 'rgba(10, 5, 5, 0.4)';
  ctx.fill();
  // the cracks: a dark bed, and the red in it
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const path = () => {
    ctx.beginPath();
    for (const l of lines) { ctx.moveTo(l.pts[0].x, l.pts[0].y); for (let i = 1; i < l.pts.length; i++) ctx.lineTo(l.pts[i].x, l.pts[i].y); }
  };
  path();
  ctx.lineWidth = 0.16;
  ctx.strokeStyle = 'rgba(10, 4, 4, 0.8)';
  ctx.stroke();
  ctx.lineWidth = 0.055;
  ctx.strokeStyle = glow > 0.3 ? mixHex(SC.crack, '#c79bff', Math.min(1, (glow - 0.3) * 1.6)) : SC.crack;
  ctx.stroke();
  return lines;
}

/** The light off the cracks: a red smoulder - purple, with the beam coming. */
function crackGlow(ctx, lines, glow, t, frost = 0) {
  if (!lines.length || frost > 0.95) return;
  const flick = (0.85 + Math.sin(t * 3.1) * 0.1) * (1 - frost);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const l of lines) { ctx.moveTo(l.pts[0].x, l.pts[0].y); for (let i = 1; i < l.pts.length; i++) ctx.lineTo(l.pts[i].x, l.pts[i].y); }
  ctx.lineWidth = 0.2;
  ctx.strokeStyle = glow > 0.3 ? `rgba(160, 90, 255, ${0.4 * flick})` : `rgba(255, 60, 20, ${0.3 * flick})`;
  ctx.stroke();
}

/* ------------------------------------ all of him ------------------------------------ */

export function drawShin(ctx, sk, gz, t = 0) {
  const glow = gz.glow || 0;
  const spine = spineOf(sk);
  const mid = platesOf(spine, 'mid'), side = platesOf(spine, 'side'), inner = platesOf(spine, 'inner');
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // behind him: the far rows of plates, then the middle row, then the far leg and arm
  drawPlates(ctx, side.map((p) => ({ ...p, x: p.x - 0.35, y: p.y + 0.1 })), SC.plateFar, glow);
  drawPlates(ctx, inner.map((p) => ({ ...p, x: p.x - 0.2, y: p.y + 0.05 })), SC.plateFar, glow);
  drawPlates(ctx, mid, SC.plate, glow);
  solid(ctx, () => leg(ctx, sk.legs.B), SC.far);
  ctx.save();
  ctx.beginPath();
  leg(ctx, sk.legs.B);
  ctx.clip();
  const lB = drawHide(ctx, sk, gz.marks, (p) => p === 'thighB' || p === 'shinB', glow);
  ctx.restore();
  legDetails(ctx, sk.legs.B, SC.far);
  solid(ctx, () => arm(ctx, sk.arms.B), SC.far);
  fingers(ctx, sk.arms.B, SC.far);
  // the far half of his jaw, when it splits; the inside of his mouth
  if (sk.splitA > 0.02) farJaw(ctx, sk);
  drawMouth(ctx, sk, gz);
  // the body
  solid(ctx, () => mainBody(ctx, sk), SC.skin);
  ctx.save();
  ctx.beginPath();
  mainBody(ctx, sk);
  ctx.clip();
  const lg = ctx.createLinearGradient(sk.belly.x + sk.n.x * 4, sk.belly.y + 3, sk.belly.x - sk.n.x * 4, sk.belly.y - 4);
  lg.addColorStop(0, 'rgba(120, 80, 70, 0.16)');
  lg.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = lg;
  ctx.fillRect(sk.hip.x - 30, -2, 60, 30);
  // the belly: a little paler, ridged across
  ctx.beginPath();
  ctx.ellipse(sk.belly.x + sk.n.x * 0.9, sk.belly.y + sk.n.y * 0.9, SD.belly * 0.85, SD.belly * 0.55, -sk.a + Math.PI / 2, 0, TAU);
  ctx.fillStyle = 'rgba(80, 50, 44, 0.35)';
  ctx.fill();
  const lBody = drawHide(ctx, sk, gz.marks, (p) => p === 'torso' || p === 'neck' || p === 'tail', glow);
  ctx.restore();
  headDetails(ctx, sk, gz);
  // the near rows of plates, over his back
  drawPlates(ctx, side, mixHex(SC.plate, '#6b5550', 0.12), glow);
  // the near leg and arm, in front of all of it
  solid(ctx, () => leg(ctx, sk.legs.A), SC.skin);
  ctx.save();
  ctx.beginPath();
  leg(ctx, sk.legs.A);
  ctx.clip();
  const lA = drawHide(ctx, sk, gz.marks, (p) => p === 'thighA' || p === 'shinA', glow);
  ctx.restore();
  legDetails(ctx, sk.legs.A, SC.skin);
  solid(ctx, () => arm(ctx, sk.arms.A), SC.skin);
  fingers(ctx, sk.arms.A, SC.skin);
  tailTip(ctx, sk, gz);
  // the light: off the cracks, the plates, his throat and the end of his tail
  // frozen solid: pale all over, the fire in him out
  const frost = gz.frost || 0;
  if (frost > 0.01) {
    ctx.save();
    ctx.globalAlpha = frost * 0.66;
    ctx.fillStyle = '#d3dce1';
    ctx.beginPath();
    mainBody(ctx, sk);
    leg(ctx, sk.legs.A);
    leg(ctx, sk.legs.B);
    arm(ctx, sk.arms.A);
    arm(ctx, sk.arms.B);
    ctx.fill();
    drawPlates(ctx, mid, '#c9d3d9', 0);
    drawPlates(ctx, side, '#dbe3e7', 0);
    ctx.restore();
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  crackGlow(ctx, [...lB, ...lBody, ...lA], glow, t, frost);
  plateGlow(ctx, mid, glow);
  plateGlow(ctx, side, glow);
  if (glow > 0.3 && sk.jawA > 0.1) {
    const m = sk.throat, r = 1.6;
    const gr = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, r);
    gr.addColorStop(0, `rgba(235, 215, 255, ${0.8 * (glow - 0.3)})`);
    gr.addColorStop(1, 'rgba(150, 90, 255, 0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(m.x, m.y, r, 0, TAU);
    ctx.fill();
  }
  const tg = gz.tailGlow || 0;
  if (tg > 0.05) {
    const T = sk.tail, e = T[T.length - 1], r = 2.2;
    const gr = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
    gr.addColorStop(0, `rgba(230, 205, 255, ${0.7 * tg})`);
    gr.addColorStop(1, 'rgba(150, 90, 255, 0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export const shinSkin = {
  full(ctx, j, o) {
    const man = o.man, gz = man && man.gz;
    if (!gz || !gz.body || !gz.body.sk) return;
    const g = gz.body, t = man.sandbox ? man.sandbox.time : 0;
    const sh = gz.shake || 0;
    ctx.save();
    ctx.translate(man.pos.x + (sh ? (Math.sin(t * 61) + Math.sin(t * 37)) * 0.05 * sh : 0), man.pos.y);
    ctx.scale(g.sx, 1);
    drawShin(ctx, g.sk, gz, t);
    ctx.restore();
  },
};

/* ---------------------------------- pictures --------------------------------- */

/** A Shin Godzilla standing still, for a picture (nothing to do with any in the world). */
function standIn(o = {}) {
  const man = { pos: { x: 0, y: 0 }, facing: 1, sandbox: { time: 2, left: -999, right: 999 }, wj: makeJoints(), box: {} };
  man.gz = { body: newBody(man, SHIN_BUILD), glow: o.glow || 0, tailGlow: o.tailGlow || 0, marks: makeCracks(2016) };
  const g = man.gz.body;
  Object.assign(g, o.pose || {});
  for (let i = 0; i < 3; i++) stepBody(man, 1 / 60);
  stepBody(man, 0);
  return man;
}

let ghostOf = null;

/** Where he will be, before he is: all of him, standing on the spot (drawn once, whole, into a picture, and the picture faded). */
export function drawShinGhost(ctx, at) {
  if (!ghostOf) {
    const man = standIn(), box = {};
    boundsOf(man.gz.body, box);
    const P = 26, pad = 0.4;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((box.maxX - box.minX + pad * 2) * P);
    cv.height = Math.ceil((box.maxY - box.minY + pad * 2) * P);
    const c = cv.getContext('2d');
    c.setTransform(P, 0, 0, -P, (pad - box.minX) * P, (box.maxY + pad) * P);
    drawShin(c, man.gz.body.sk, man.gz);
    ghostOf = { cv, x0: box.minX - pad, y1: box.maxY + pad, w: cv.width / P, h: cv.height / P };
  }
  ctx.save();
  ctx.scale(shinFacingAt(at ? at.x : 0), -1);
  ctx.drawImage(ghostOf.cv, ghostOf.x0, -ghostOf.y1, ghostOf.w, ghostOf.h);
  ctx.restore();
}

/** Which way he faces, put down at x: toward the middle of the street - with his tail's length behind him. */
export const shinFacingAt = (x) => (x > 0 ? -1 : 1);

/** A city burning at night, behind a picture of him: the sky red over black rooftops, and smoke. */
function burningCity(ctx, w, h, seed) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0d0708');
  sky.addColorStop(0.55, '#3b120c');
  sky.addColorStop(1, '#a3361a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const r = rng(seed);
  // smoke drifting across it
  for (let i = 0; i < 9; i++) {
    const x = r() * w, y = h * (0.15 + r() * 0.5), rr = w * (0.08 + r() * 0.12);
    ctx.fillStyle = `rgba(20, 12, 12, ${0.25 + r() * 0.25})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rr * 1.8, rr * 0.6, 0, 0, TAU);
    ctx.fill();
  }
  for (let x = 0; x < w;) {
    const bw = w * (0.05 + r() * 0.09), bh = h * (0.15 + r() * 0.4);
    ctx.fillStyle = '#0b0707';
    ctx.fillRect(x, h - bh, bw, bh);
    ctx.fillStyle = 'rgba(255, 120, 50, 0.45)';
    const s = Math.max(1, w / 70);
    for (let yy = h - bh + 2 * s; yy < h - 2 * s; yy += 3 * s) for (let xx = x + s; xx < x + bw - 1.5 * s; xx += 2.5 * s) if (r() < 0.18) ctx.fillRect(xx, yy, s, 1.5 * s);
    x += bw + Math.max(1, w / 140);
  }
}

/** His card in the spawn menu: head and neck, over a burning city. */
export function drawShinIcon(ctx, w, h, card) {
  const man = standIn({ pose: { jaw: 0.25, goal: { jaw: 0.25 } } });
  const sk = man.gz.body.sk;
  const cx = sk.neckTop.x + 0.6, cy = sk.neckTop.y - 0.6, span = card ? 6.6 : 9;
  const s = Math.min(w, h) / span;
  if (card) {
    burningCity(ctx, w, h, 2016);
    // the fire behind him, lighting up the edge of him
    const hx = w / 2 + (sk.head.x - cx) * s, hy = h / 2 - (sk.head.y - cy) * s;
    const gr = ctx.createRadialGradient(hx, hy, 0, hx, hy, w * 0.6);
    gr.addColorStop(0, 'rgba(255, 150, 70, 0.75)');
    gr.addColorStop(1, 'rgba(255, 90, 30, 0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.setTransform(s, 0, 0, -s, w / 2 - cx * s, h / 2 + cy * s);
  drawShin(ctx, sk, man.gz, 1);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** All of him, lit up purple, the jaw split: for the mod's picture. */
export function drawShinWhole(ctx, x, y, s, o = {}) {
  const man = standIn({ glow: o.glow ?? 0.8, pose: { jaw: 0.6, split: 0.5, head: -0.15, goal: { jaw: 0.6, split: 0.5 } } });
  ctx.setTransform(-s, 0, 0, -s, x, y);
  drawShin(ctx, man.gz.body.sk, man.gz, 1);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/**
 * His half of the mod's picture, over the 1954 one's: cut in on a slant down
 * the right of it - a city burning, and him in front of it, lit up purple.
 */
export function shinHalf(ctx, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(w * 0.6, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h); ctx.lineTo(w * 0.46, h);
  ctx.closePath();
  ctx.clip();
  burningCity(ctx, w, h, 2016);
  drawShinWhole(ctx, w * 0.95, h * 1.06, h / 20, { glow: 0.85 });
  ctx.restore();
  // the cut between them
  ctx.beginPath();
  ctx.moveTo(w * 0.6, 0);
  ctx.lineTo(w * 0.46, h);
  ctx.lineWidth = Math.max(1.5, w / 90);
  ctx.strokeStyle = 'rgba(230, 210, 255, 0.85)';
  ctx.stroke();
}

export { burningCity };
