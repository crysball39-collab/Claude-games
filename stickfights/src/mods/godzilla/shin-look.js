/* =============================================================================
   SHIN GODZILLA - how he is drawn, in each of his forms.

   FOURTH FORM  near black, with a red-brown cast - and everywhere the hide
                has split, a crack of red light, as if what is inside him
                were burning. The hide rough and lumped like scar tissue.
                Rows on rows of plates down his back and tail, jagged as
                broken rock, dark, with red under them; when the beam is
                coming they light up purple, from the tail up, and so do the
                cracks. A small head: a long jaw full of uneven teeth that
                stick out every way, and a tiny white eye with a pinprick of
                black in it - nothing in it at all. Legs like towers, the
                arms tiny and limp, the long fingers hanging; and the end of
                his tail a knot of pale bone. Frozen solid, the end of his
                tail is a knot of figures - something like people - reaching
                up out of it: what he would have become next.
   THIRD FORM   red-brown going to orange, the first cracks just showing;
                gills still down his neck; the eyes smaller now; small arms
                held up in front.
   SECOND FORM  mottled brown, the belly pale; enormous round staring eyes;
                gills down the sides of the neck that open and pour out red;
                a row of small fins down the back.

   Drawn in his own frame (body.js, shin-body.js), squeezed and turned the
   way he faces, like the 1954 one (look.js, whose ways of drawing these
   borrow).
   ========================================================================== */
import { clamp, lerp, TAU, rng } from '../../core/util.js';
import { makeJoints } from '../../game/skeleton.js';
import { newBody, stepBody, boundsOf } from './body.js';
import { SHIN_BUILD, SHIN_BUILDS } from './shin-body.js';
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
  spot: '#100908',
  gill: '#b8281c',
  purple: '#a86cff',
  lilac: '#ead9ff',
};

/* ---------------------------------- each form ---------------------------------- */

// the upper head and snout, and the lower jaw, in the head's own frame (x along the snout, y up)
// (the fourth form's: a flat top to the skull, the snout ending blunt, and the lower jaw longer than the upper, jutting past it)
const HEAD4 = [
  [-0.6, -0.42], [-0.78, 0.08], [-0.6, 0.5], [-0.1, 0.66], [0.6, 0.66], [1.3, 0.6], [1.9, 0.5], [2.3, 0.4],
  [2.52, 0.26], [2.58, 0.04], [2.48, -0.16], [2.15, -0.24], [1.7, -0.27], [1.15, -0.3], [0.6, -0.34], [0.1, -0.42],
];
const JAW4 = [
  [-0.1, -0.4], [0.6, -0.36], [1.3, -0.34], [2.0, -0.33], [2.62, -0.28], [2.92, -0.36], [2.9, -0.6],
  [2.55, -0.84], [1.8, -0.98], [1.0, -1.04], [0.35, -1.0], [-0.2, -0.84], [-0.5, -0.6],
];
// (the third form's: rounder, the jaw not yet jutting)
const HEAD3 = [
  [-0.6, -0.42], [-0.8, 0.1], [-0.62, 0.58], [-0.1, 0.8], [0.6, 0.82], [1.3, 0.72], [1.9, 0.55], [2.32, 0.38],
  [2.56, 0.17], [2.62, -0.06], [2.48, -0.2], [2.1, -0.27], [1.6, -0.3], [1.0, -0.33], [0.5, -0.36], [0.05, -0.42],
];
const JAW3 = [
  [-0.1, -0.4], [0.6, -0.37], [1.3, -0.35], [2.0, -0.33], [2.5, -0.3], [2.62, -0.42], [2.5, -0.64],
  [2.15, -0.84], [1.5, -0.96], [0.85, -1.0], [0.25, -0.95], [-0.25, -0.8], [-0.5, -0.58],
];
// (the second form's: big and rounded, a fish's - the eyes up on top of it, and the mouth very wide)
const HEAD2 = [
  [-0.72, -0.46], [-0.88, 0.1], [-0.66, 0.62], [-0.1, 0.92], [0.6, 1.02], [1.3, 0.98], [1.9, 0.78], [2.38, 0.48],
  [2.66, 0.16], [2.7, -0.12], [2.46, -0.3], [1.9, -0.37], [1.2, -0.41], [0.5, -0.43], [-0.1, -0.47],
];
const JAW2 = [
  [-0.2, -0.46], [0.6, -0.43], [1.4, -0.41], [2.1, -0.37], [2.56, -0.33], [2.6, -0.56],
  [2.28, -0.84], [1.6, -1.0], [0.8, -1.04], [0.1, -0.96], [-0.46, -0.72],
];

/**
 * How each form looks. c: its colours; head, jaw: its head; hinge: where the
 * jaw turns; eye, pupil: how big they are (in the head's units); sclera: the
 * white of the eye; gills: how many down the neck; plates: how big, against
 * the fourth form's; cracks: the red light in the splits of the hide (and how
 * strongly); spots: dark mottling instead; arms: 'hang' (long fingers), 'up'
 * (small hands held up), 'nub' (no hands at all); teeth: how big; bone: the
 * knot at the end of the tail.
 */
const LOOKS = {
  4: { c: SC, head: HEAD4, jaw: JAW4, hinge: [0.15, -0.38], eye: 0.1, pupil: 0.032, sclera: SC.eye, gills: 0, plates: 1, cracks: 1, spots: 0, arms: 'hang', teeth: 1, bone: true },
  3: {
    c: { ...SC, skin: '#5e2717', far: '#40180e', belly: '#8c4c30', rough: '#260d07', crack: '#ff6a28', plate: '#40190f', plateFar: '#2c110a', plateEdge: '#120604', plateRed: '#9a2e18', mouth: '#460c08', spot: '#2c0f08', gill: '#d23422' },
    head: HEAD3, jaw: JAW3, hinge: [0.15, -0.38], eye: 0.17, pupil: 0.055, sclera: '#efe8d8', gills: 4, plates: 0.55, cracks: 0.55, spots: 0.5, arms: 'up', teeth: 0.8, bone: false,
  },
  2: {
    c: { ...SC, ink: '#140a05', skin: '#7a4828', far: '#58321b', belly: '#d6c19c', rough: '#3c2211', crack: '#b8401e', plate: '#6c3d22', plateFar: '#4e2b16', plateEdge: '#26140a', plateRed: '#8a3a20', mouth: '#5a1410', claw: '#2a1a10', spot: '#3a200f', gill: '#c4302a' },
    head: HEAD2, jaw: JAW2, hinge: [0.1, -0.42], eye: 0.36, pupil: 0.1, sclera: '#e6d07a', gills: 5, plates: 0.3, cracks: 0, spots: 1, arms: 'nub', teeth: 0.55, bone: false,
  },
};

// (what is being drawn, right now: its build, and its look)
let B = SHIN_BUILD, LK = LOOKS[4], C = SC;

/** Outlined and filled: the outline drawn first, fat, so only the outside edge of it shows. */
function solid(ctx, build, fill) {
  ctx.beginPath();
  build();
  ctx.lineWidth = OUT * 2;
  ctx.strokeStyle = C.ink;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** A number in 0..1 that is always the same for (i, k): how each plate, tooth and crack differs from the next. */
const hash = (i, k = 0) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

/* --------------------------------- the head --------------------------------- */

/** Points of the head (jaw: turned about the hinge by angle a, the jaw's own). */
function headPts(sk, list, a = null) {
  const out = [];
  const [HX, HY] = LK.hinge;
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
  const [HX, HY] = LK.hinge, k = LK.teeth;
  const c = Math.cos(-turn), s = Math.sin(-turn);
  const rot = (x, y) => { const dx = x - HX, dy = y - HY; return sk.hd(HX + dx * c - dy * s, HY + dx * s + dy * c); };
  ctx.beginPath();
  for (const t of list) {
    const r = at(t.u);
    const dx = Math.sin(t.ang * k) * t.len * k, dy = (up ? 1 : -1) * Math.cos(t.ang * k) * t.len * k;
    const a = rot(r.x - t.w * k / 2, r.y), b = rot(r.x + t.w * k / 2, r.y), tip = rot(r.x + dx, r.y + dy);
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
  const HK = B.HK;
  // the teeth: the upper ones down out of the lip, the lower ones up out of the jaw - even shut, they show
  teeth(ctx, sk, UP_TEETH, lipUp, false, 0, C.teeth);
  teeth(ctx, sk, LOW_TEETH, lipLow, true, sk.jawA, C.teeth);
  // the eye: in the fourth form tiny, white, with a pinprick of black in it - and nothing behind it;
  // in the second, huge, round and staring
  const e = sk.eye, ea = Math.atan2(sk.F.y, sk.F.x), r = LK.eye * HK;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, r * 1.9 + 0.02, r * 1.35 + 0.02, ea, 0, TAU);
  ctx.fillStyle = mixHex(C.skin, '#000000', 0.55);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e.x, e.y, r, 0, TAU);
  ctx.fillStyle = gz.dead ? '#6d6660' : LK.sclera;
  ctx.fill();
  if (LK.eye > 0.2) { ctx.lineWidth = 0.05; ctx.strokeStyle = C.ink; ctx.stroke(); }
  if (!gz.dead) {
    ctx.beginPath();
    ctx.arc(e.x + sk.F.x * r * 0.25, e.y + sk.F.y * r * 0.25, LK.pupil * HK, 0, TAU);
    ctx.fillStyle = C.pupil;
    ctx.fill();
    // (the big eyes catch the light)
    if (LK.eye > 0.2) {
      ctx.beginPath();
      ctx.arc(e.x - sk.F.x * r * 0.25 + sk.U.x * r * 0.4, e.y - sk.F.y * r * 0.25 + sk.U.y * r * 0.4, r * 0.18, 0, TAU);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.fill();
    }
  }
  // a fold of skin under the eye, and the nostril high on the snout
  ctx.lineCap = 'round';
  ctx.beginPath();
  const f0 = sk.hd(0.75, -0.02), f1 = sk.hd(1.05, -0.1), f2 = sk.hd(1.4, -0.02);
  ctx.moveTo(f0.x, f0.y);
  ctx.quadraticCurveTo(f1.x, f1.y, f2.x, f2.y);
  ctx.lineWidth = 0.05;
  ctx.strokeStyle = C.rough;
  ctx.stroke();
  const ns = sk.hd(2.36, 0.3);
  ctx.beginPath();
  ctx.ellipse(ns.x, ns.y, 0.1 * HK, 0.035 * HK, ea - 0.25, 0, TAU);
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
  solid(ctx, () => blob(ctx, headPts(sk, LK.jaw, a)), C.far);
  teeth(ctx, sk, LOW_TEETH, lipLow, true, a, '#a49b8c');
}

/** The inside of his mouth, behind the jaws: only shows when it is open - and with the beam coming, it burns. */
function drawMouth(ctx, sk, gz) {
  if (sk.jawA < 0.04) return;
  ctx.beginPath();
  const far = sk.splitA > 0.02 ? sk.jawA + sk.splitA : sk.jawA;
  poly(ctx, [sk.hd(0.05, -0.36), sk.hd(2.5, -0.2), ...headPts(sk, [[2.6, -0.34], [0.3, -0.38]], far)]);
  const g = gz.glow || 0;
  ctx.fillStyle = g > 0.25 ? mixHex(C.mouth, '#c99cff', Math.min(1, (g - 0.25) * 1.6)) : C.mouth;
  ctx.fill();
}

/**
 * The gills down the side of his neck (the second and third forms'): slits
 * across it - and, open (gz.gills), red, frilled, pouring.
 */
function drawGills(ctx, sk, gz) {
  const n = LK.gills;
  if (!n) return;
  const open = gz.gills || 0;
  const a = sk.chest, b = sk.neckTop;
  const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  const w = B.D.neckR * 0.8;
  for (let i = 0; i < n; i++) {
    const t = 0.2 + (i / Math.max(1, n - 1)) * 0.55;
    const c = { x: a.x + dx * t - uy * 0.05, y: a.y + dy * t + ux * 0.05 };
    const len = w * (1 - Math.abs(i - (n - 1) / 2) / n * 0.6);
    const ang = Math.atan2(uy, ux) + Math.PI / 2 + 0.25;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, len, 0.06 + open * 0.2, ang, 0, TAU);
    ctx.fillStyle = open > 0.05 ? mixHex(C.mouth, C.gill, Math.min(1, open * 1.5)) : C.rough;
    ctx.fill();
    ctx.lineWidth = 0.04;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    if (open > 0.3) {
      // the frills inside it
      ctx.beginPath();
      for (let j = -2; j <= 2; j++) {
        const p = { x: c.x + Math.cos(ang) * len * j * 0.35, y: c.y + Math.sin(ang) * len * j * 0.35 };
        ctx.moveTo(p.x - ux * 0.12 * open, p.y - uy * 0.12 * open);
        ctx.lineTo(p.x + ux * 0.12 * open, p.y + uy * 0.12 * open);
      }
      ctx.lineWidth = 0.035;
      ctx.strokeStyle = '#ff8a7a';
      ctx.stroke();
    }
  }
}

/* -------------------------------- the plates -------------------------------- */

/** The ridge along his back, from behind his head to the end of his tail: points, which way is out (back, or up), how thick he is there. */
function spineOf(sk) {
  const D = B.D;
  const raw = [
    { p: sk.neckTop, r: D.neckR * 0.8 }, { p: sk.neckMid, r: D.neckR * 1.05 }, { p: sk.chest, r: D.neckR * 1.3 },
    { p: sk.hump, r: D.chestR * 0.92 }, { p: { x: sk.hip.x - sk.n.x * 0.5, y: sk.hip.y - sk.n.y * 0.5 }, r: D.belly * 0.85 },
  ];
  const T = sk.tail;
  for (let i = 1; i < T.length; i++) raw.push({ p: T[i], r: B.tailR(i) });
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
const plateSize = (k) => (k < 0.08 ? lerp(1.3, 3.0, k / 0.08) : k < 0.3 ? 3.0 : lerp(3.0, 0.34, Math.pow((k - 0.3) / 0.7, 0.8))) * LK.plates;

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
    ctx.strokeStyle = L > 0.5 ? 'rgba(200, 160, 255, 0.95)' : C.plateEdge;
    ctx.stroke();
    // the red under it, where it comes out of him (white-hot purple, lit)
    if (p.size > 0.5) {
      ctx.beginPath();
      for (let j = 0; j < shard.length; j++) { const q = at(shard[j][0] * 0.55, shard[j][1] * 0.42); if (j) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }
      ctx.closePath();
      ctx.fillStyle = L > 0 ? mixHex(C.plateRed, '#f1e4ff', L) : C.plateRed;
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

/** The light off lit plates: drawn over everything, adding (brighter still with the beam about to come: flare). */
function plateGlow(ctx, list, glow, flare = 0) {
  if (glow <= 0.02) return;
  for (const p of list) {
    const L = lit(glow, p.k);
    if (L <= 0.05) continue;
    const r = p.size * (1.15 + flare * 0.35);
    const cx = p.x + p.nx * p.size * 0.45, cy = p.y + p.ny * p.size * 0.45;
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, `rgba(196, 140, 255, ${(0.38 + flare * 0.3) * L})`);
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
    const nx = -dy / l, ny = dx / l, r = B.tailR(i);
    left.push({ x: T[i].x + nx * r, y: T[i].y + ny * r });
    right.push({ x: T[i].x - nx * r, y: T[i].y - ny * r });
  }
  const e = T[n - 1], p = T[n - 2];
  const dx = e.x - p.x, dy = e.y - p.y, l = Math.hypot(dx, dy) || 1;
  const tip = { x: e.x + (dx / l) * B.tailR(n - 1) * 1.4, y: e.y + (dy / l) * B.tailR(n - 1) * 1.4 };
  return [...left, tip, ...right.reverse()];
}

/** The tail, the body, the hunch, the neck and the head: one shape. */
function mainBody(ctx, sk) {
  const D = B.D, s = B.s;
  blob(ctx, tailPoly(sk));
  taper(ctx, sk.hip, sk.chest, D.belly * 1.0, D.chestR);
  // the belly, low and heavy in front (underneath, crawling)
  ctx.moveTo(sk.belly.x + D.belly * 1.1, sk.belly.y);
  ctx.ellipse(sk.belly.x, sk.belly.y, D.belly * 1.1, D.belly * 0.98, -sk.a + Math.PI / 2, 0, TAU, false);
  // the haunch, and the hunch of his back
  circle(ctx, { x: sk.hip.x - 0.5 * s, y: sk.hip.y - 0.2 * s }, D.belly * 0.92);
  circle(ctx, sk.hump, D.chestR * 0.95);
  taper(ctx, sk.chest, sk.neckMid, D.neckR * 1.5, D.neckR * 1.12);
  taper(ctx, sk.neckMid, sk.neckTop, D.neckR * 1.12, D.neckR * 0.82);
  blob(ctx, headPts(sk, LK.head));
  blob(ctx, headPts(sk, LK.jaw, sk.jawA));
}

/** One leg: the thigh, the shin, the foot. */
function leg(ctx, L) {
  const D = B.D, s = B.s;
  taper(ctx, L.hip, L.knee, D.thighR * 1.05, D.shinR * 1.18);
  taper(ctx, L.knee, L.ankle, D.shinR * 1.18, D.shinR * 0.88);
  const c = Math.cos(L.tilt), sn = Math.sin(L.tilt);
  const at = (x, y) => ({ x: L.ankle.x + (x * c - y * sn) * s, y: L.ankle.y + (x * sn + y * c) * s });
  const h = D.ankle / s;
  blob(ctx, [at(-1.05, -h), at(-1.2, -0.4), at(-0.7, 0.42), at(0.4, 0.5), at(1.5, 0.0), at(2.2, -h * 0.55), at(2.3, -h)]);
}

function legDetails(ctx, L, fill) {
  const D = B.D, s = B.s;
  const c = Math.cos(L.tilt), sn = Math.sin(L.tilt);
  const at = (x, y) => ({ x: L.ankle.x + (x * c - y * sn) * s, y: L.ankle.y + (x * sn + y * c) * s });
  const h = D.ankle / s;
  // four toes, and the claws on them: long, and as dark as he is
  for (const [x, y, r] of [[1.05, -h * 0.68, 0.36], [1.45, -h * 0.71, 0.38], [1.83, -h * 0.75, 0.36], [2.15, -h * 0.78, 0.3]]) {
    const p = at(x, y);
    ctx.beginPath();
    circle(ctx, p, r * s);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    const q = at(x + r * 0.9, y - 0.05), tip = at(x + r * 2.1, y - 0.36), b = at(x + r * 0.5, y - r * 0.9);
    ctx.beginPath();
    ctx.moveTo(q.x, q.y);
    ctx.quadraticCurveTo(tip.x, tip.y + 0.15 * s, tip.x, tip.y);
    ctx.lineTo(b.x, b.y);
    ctx.closePath();
    ctx.fillStyle = C.claw;
    ctx.fill();
    ctx.lineWidth = 0.03;
    ctx.strokeStyle = '#3a2c28';
    ctx.stroke();
  }
  // folds at the knee and round the ankle
  ctx.beginPath();
  ctx.arc(L.knee.x, L.knee.y, D.shinR * 0.75, -0.5, 1.2);
  for (let i = 0; i < 3; i++) {
    const y = 0.3 + i * 0.28;
    const a = at(-0.8, y), b = at(0.55, y + 0.06), m = at(-0.1, y - 0.16);
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(m.x, m.y, b.x, b.y);
  }
  ctx.lineWidth = 0.07 * Math.max(0.6, s);
  ctx.strokeStyle = C.rough;
  ctx.stroke();
}

/** One of his arms: tiny. */
function arm(ctx, A) {
  const D = B.D;
  taper(ctx, A.shoulder, A.elbow, D.upperR * 1.15, D.foreR * 1.1);
  taper(ctx, A.elbow, A.hand, D.foreR * 1.1, D.foreR * 0.85);
  circle(ctx, A.hand, D.foreR * 0.95);
}

/** His fingers: long and thin, hanging off the end of the arm, a little curled (the third form's: short, held up). */
function fingers(ctx, A, fill) {
  if (LK.arms === 'nub') return;
  const dx = A.hand.x - A.elbow.x, dy = A.hand.y - A.elbow.y, a = Math.atan2(dy, dx);
  const k = LK.arms === 'hang' ? 1 : 0.5;
  for (const [off, len] of [[-0.35, 0.95], [-0.05, 1.05], [0.25, 1.0], [0.6, 0.75]]) {
    const ang = a + off;
    const mid = { x: A.hand.x + Math.cos(ang) * len * 0.55 * k, y: A.hand.y + Math.sin(ang) * len * 0.55 * k };
    const bend = ang - 0.45;
    const tip = { x: mid.x + Math.cos(bend) * len * 0.5 * k, y: mid.y + Math.sin(bend) * len * 0.5 * k };
    ctx.beginPath();
    taper(ctx, A.hand, mid, 0.11 * k, 0.08 * k);
    taper(ctx, mid, tip, 0.08 * k, 0.05 * k);
    ctx.lineWidth = OUT * 1.2;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    ctx.fillStyle = fill;
    ctx.fill();
  }
}

/** The end of his tail: a knot of pale bone, spines and a gaping slot like a mouth. */
function tailTip(ctx, sk, gz) {
  const T = sk.tail, n = T.length, e = T[n - 1], p = T[n - 3];
  const dx = e.x - p.x, dy = e.y - p.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
  const r = B.tailR(n - 1);
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
  ctx.fillStyle = C.bone;
  ctx.fill();
  ctx.lineWidth = 0.035;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  // the knot of bone itself, and the slot in the end of it
  ctx.beginPath();
  ctx.ellipse(e.x + ux * 0.2, e.y + uy * 0.2, r * 1.5, r * 1.2, Math.atan2(uy, ux), 0, TAU);
  ctx.fillStyle = C.boneDark;
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

/**
 * Frozen solid, the end of his tail: a knot of figures, something like
 * people, thin as skeletons, reaching up out of it - what would have come
 * next (shown as he freezes: k how far).
 */
function fifthForm(ctx, sk, k) {
  const T = sk.tail, n = T.length;
  ctx.save();
  ctx.globalAlpha = Math.min(1, k * 1.5);
  ctx.lineCap = 'round';
  for (let j = 0; j < 5; j++) {
    const i = n - 2 - j;
    if (i < 1) break;
    const a = T[i], b = T[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    let nx = -dy / l, ny = dx / l;
    if (ny < 0) { nx = -nx; ny = -ny; }
    const r = B.tailR(i);
    const base = { x: a.x + nx * r * 0.7, y: a.y + ny * r * 0.7 };
    const h = (0.9 + hash(j, 7) * 0.5) * k;
    const lean = (hash(j, 8) - 0.5) * 0.6;
    const ux = nx * Math.cos(lean) - ny * Math.sin(lean), uy = nx * Math.sin(lean) + ny * Math.cos(lean);
    const hip = base, neck = { x: base.x + ux * h * 0.7, y: base.y + uy * h * 0.7 }, head = { x: base.x + ux * h * 0.88, y: base.y + uy * h * 0.88 };
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y); ctx.lineTo(neck.x, neck.y);
    // arms up, reaching
    for (const sd of [-1, 1]) {
      const sh = { x: hip.x + ux * h * 0.6, y: hip.y + uy * h * 0.6 };
      ctx.moveTo(sh.x, sh.y);
      ctx.lineTo(sh.x + ux * h * 0.35 - uy * sd * h * 0.25, sh.y + uy * h * 0.35 + ux * sd * h * 0.25);
    }
    // the ribs
    for (let q = 0; q < 3; q++) {
      const m = { x: hip.x + ux * h * (0.35 + q * 0.1), y: hip.y + uy * h * (0.35 + q * 0.1) };
      ctx.moveTo(m.x - uy * h * 0.1, m.y + ux * h * 0.1);
      ctx.lineTo(m.x + uy * h * 0.1, m.y - ux * h * 0.1);
    }
    ctx.lineWidth = 0.07 * h;
    ctx.strokeStyle = '#e4e9ec';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(head.x, head.y, h * 0.1, 0, TAU);
    ctx.fillStyle = '#e4e9ec';
    ctx.fill();
  }
  ctx.restore();
}

/* --------------------------------- his hide --------------------------------- */

/**
 * The cracks in his hide, where the red shows through, and the rough lumps of
 * it (in the second form, the dark mottling): made once for each of him, in
 * each part's own terms (how far along it, how far across), and put where
 * that part is now.
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
  const D = B.D;
  const on = (a, b, r) => {
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, ax = dx / l, ay = dy / l;
    return { x: a.x + dx * t - ay * o * r, y: a.y + dy * t + ax * o * r, ax, ay, r };
  };
  switch (part) {
    case 'torso': return on(sk.hip, sk.chest, lerp(D.belly, D.chestR, t));
    case 'neck': return t < 0.5 ? on(sk.chest, sk.neckMid, D.neckR * 1.3) : on(sk.neckMid, sk.neckTop, D.neckR);
    case 'tail': {
      const T = sk.tail, f = clamp(t, 0, 0.98) * (T.length - 1.3), i = Math.floor(f);
      const a = T[i], b = T[i + 1], k = f - i, rr = lerp(B.tailR(i), B.tailR(i + 1), k);
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, ax = dx / l, ay = dy / l;
      return { x: a.x + dx * k - ay * o * rr, y: a.y + dy * k + ax * o * rr, ax, ay, r: rr };
    }
    case 'thighA': case 'thighB': { const L = sk.legs[part.slice(-1)]; return on(L.hip, L.knee, D.thighR); }
    case 'shinA': case 'shinB': { const L = sk.legs[part.slice(-1)]; return on(L.knee, L.ankle, D.shinR); }
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
    if (c.lump || LK.spots) lumps.push({ x: p0.x, y: p0.y, r: p0.r * (LK.spots ? 0.3 : 0.22) * c.lr, a: c.la });
    if (!LK.cracks) continue;
    const pts = [p0];
    let t = c.t, o = c.o;
    for (const [dt, dO] of c.segs) {
      t = clamp(t + dt, 0, 1); o = clamp(o + dO, -0.95, 0.95);
      const q = onPart(sk, c.part, t, o);
      if (q) pts.push(q);
    }
    lines.push({ pts, k: c.part === 'tail' ? 0.3 + c.t * 0.7 : c.part === 'neck' ? 0.1 : 0.25 });
  }
  // the lumps: darker, rough (the second form's: its mottling)
  ctx.beginPath();
  for (const q of lumps) { ctx.moveTo(q.x + Math.cos(q.a) * q.r, q.y + Math.sin(q.a) * q.r); ctx.ellipse(q.x, q.y, q.r, q.r * 0.6, q.a, 0, TAU); }
  ctx.fillStyle = LK.spots ? mixHex(C.spot, C.skin, 0.2) : 'rgba(10, 5, 5, 0.4)';
  ctx.globalAlpha = LK.spots ? 0.4 + 0.35 * LK.spots : 1;
  ctx.fill();
  ctx.globalAlpha = 1;
  if (!lines.length) return lines;
  // the cracks: a dark bed, and the red in it
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const l of lines) { ctx.moveTo(l.pts[0].x, l.pts[0].y); for (let i = 1; i < l.pts.length; i++) ctx.lineTo(l.pts[i].x, l.pts[i].y); }
  ctx.lineWidth = 0.16 * LK.cracks;
  ctx.strokeStyle = 'rgba(10, 4, 4, 0.8)';
  ctx.stroke();
  ctx.lineWidth = 0.055 * LK.cracks;
  ctx.strokeStyle = glow > 0.3 ? mixHex(C.crack, '#c79bff', Math.min(1, (glow - 0.3) * 1.6)) : C.crack;
  ctx.stroke();
  return lines;
}

/** The light off the cracks: a red smoulder - purple, with the beam coming. */
function crackGlow(ctx, lines, glow, t, frost = 0) {
  if (!lines.length || frost > 0.95) return;
  const flick = (0.85 + Math.sin(t * 3.1) * 0.1) * (1 - frost) * LK.cracks;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const l of lines) { ctx.moveTo(l.pts[0].x, l.pts[0].y); for (let i = 1; i < l.pts.length; i++) ctx.lineTo(l.pts[i].x, l.pts[i].y); }
  ctx.lineWidth = 0.2;
  ctx.strokeStyle = glow > 0.3 ? `rgba(160, 90, 255, ${0.4 * flick})` : `rgba(255, 60, 20, ${0.3 * flick})`;
  ctx.stroke();
}

/* ------------------------------------ all of him ------------------------------------ */

/** All of him, in his own frame - in whichever form he is in (gz.form: 2, 3 or 4). */
export function drawShin(ctx, sk, gz, t = 0) {
  B = (gz.body && gz.body.b) || SHIN_BUILDS[gz.form || 4] || SHIN_BUILD;
  LK = LOOKS[gz.form || 4] || LOOKS[4];
  C = LK.c;
  const glow = gz.glow || 0, flare = gz.flare || 0;
  const spine = spineOf(sk);
  const mid = platesOf(spine, 'mid'), side = platesOf(spine, 'side'), inner = LK.plates > 0.5 ? platesOf(spine, 'inner') : [];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // behind him: the far rows of plates, then the middle row, then the far leg and arm
  drawPlates(ctx, side.map((p) => ({ ...p, x: p.x - 0.35 * B.s, y: p.y + 0.1 * B.s })), C.plateFar, glow);
  drawPlates(ctx, inner.map((p) => ({ ...p, x: p.x - 0.2, y: p.y + 0.05 })), C.plateFar, glow);
  drawPlates(ctx, mid, C.plate, glow);
  solid(ctx, () => leg(ctx, sk.legs.B), C.far);
  ctx.save();
  ctx.beginPath();
  leg(ctx, sk.legs.B);
  ctx.clip();
  const lB = drawHide(ctx, sk, gz.marks, (p) => p === 'thighB' || p === 'shinB', glow);
  ctx.restore();
  legDetails(ctx, sk.legs.B, C.far);
  solid(ctx, () => arm(ctx, sk.arms.B), C.far);
  fingers(ctx, sk.arms.B, C.far);
  // the far half of his jaw, when it splits; the inside of his mouth
  if (sk.splitA > 0.02) farJaw(ctx, sk);
  drawMouth(ctx, sk, gz);
  // the body
  solid(ctx, () => mainBody(ctx, sk), C.skin);
  ctx.save();
  ctx.beginPath();
  mainBody(ctx, sk);
  ctx.clip();
  const lg = ctx.createLinearGradient(sk.belly.x + sk.n.x * 4, sk.belly.y + 3, sk.belly.x - sk.n.x * 4, sk.belly.y - 4);
  lg.addColorStop(0, 'rgba(120, 80, 70, 0.16)');
  lg.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = lg;
  ctx.fillRect(sk.hip.x - 30, -2, 60, 30);
  // the belly: a little paler, ridged across (the second form's, pale)
  ctx.beginPath();
  ctx.ellipse(sk.belly.x + sk.n.x * 0.9 * B.s * 2, sk.belly.y + sk.n.y * 0.9 * B.s * 2, B.D.belly * 0.85, B.D.belly * 0.55, -sk.a + Math.PI / 2, 0, TAU);
  ctx.fillStyle = LK.spots >= 1 ? C.belly : 'rgba(80, 50, 44, 0.35)';
  ctx.fill();
  const lBody = drawHide(ctx, sk, gz.marks, (p) => p === 'torso' || p === 'neck' || p === 'tail', glow);
  ctx.restore();
  drawGills(ctx, sk, gz);
  headDetails(ctx, sk, gz);
  // the near rows of plates, over his back
  drawPlates(ctx, side, mixHex(C.plate, '#6b5550', 0.12), glow);
  // the near leg and arm, in front of all of it
  solid(ctx, () => leg(ctx, sk.legs.A), C.skin);
  ctx.save();
  ctx.beginPath();
  leg(ctx, sk.legs.A);
  ctx.clip();
  const lA = drawHide(ctx, sk, gz.marks, (p) => p === 'thighA' || p === 'shinA', glow);
  ctx.restore();
  legDetails(ctx, sk.legs.A, C.skin);
  solid(ctx, () => arm(ctx, sk.arms.A), C.skin);
  fingers(ctx, sk.arms.A, C.skin);
  if (LK.bone) tailTip(ctx, sk, gz);
  // frozen solid: pale all over, the fire in him out - and on the end of his tail, what was coming
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
    if (LK.bone && frost > 0.4) fifthForm(ctx, sk, (frost - 0.4) / 0.6);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  crackGlow(ctx, [...lB, ...lBody, ...lA], glow, t, frost);
  plateGlow(ctx, mid, glow, flare);
  plateGlow(ctx, side, glow, flare);
  if (glow > 0.3 && sk.jawA > 0.1) {
    const m = sk.throat, r = 1.6 * (1 + flare * 0.6);
    const gr = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, r);
    gr.addColorStop(0, `rgba(235, 215, 255, ${Math.min(1, 0.8 * (glow - 0.3) + flare * 0.3)})`);
    gr.addColorStop(1, 'rgba(150, 90, 255, 0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(m.x, m.y, r, 0, TAU);
    ctx.fill();
  }
  const tg = gz.tailGlow || 0;
  if (tg > 0.05 && LK.bone) {
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

/** A Shin Godzilla standing still, in a form, for a picture (nothing to do with any in the world). */
function standIn(o = {}) {
  const form = o.form || 4;
  const man = { pos: { x: 0, y: 0 }, facing: 1, sandbox: { time: 2, left: -999, right: 999 }, wj: makeJoints(), box: {} };
  man.gz = { form, body: newBody(man, SHIN_BUILDS[form]), glow: o.glow || 0, tailGlow: o.tailGlow || 0, marks: makeCracks(2016) };
  const g = man.gz.body;
  Object.assign(g, o.pose || {});
  for (let i = 0; i < 3; i++) stepBody(man, 1 / 60);
  stepBody(man, 0);
  return man;
}

const ghosts = {};

/**
 * Where he will be, before he is: all of him, in the form he comes as,
 * standing on the spot (drawn once, whole, into a picture, and the picture
 * faded).
 */
export function drawShinGhost(ctx, at, form = 2) {
  if (!ghosts[form]) {
    const man = standIn({ form }), box = {};
    boundsOf(man.gz.body, box);
    const P = 26, pad = 0.4;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((box.maxX - box.minX + pad * 2) * P);
    cv.height = Math.ceil((box.maxY - box.minY + pad * 2) * P);
    const c = cv.getContext('2d');
    c.setTransform(P, 0, 0, -P, (pad - box.minX) * P, (box.maxY + pad) * P);
    drawShin(c, man.gz.body.sk, man.gz);
    ghosts[form] = { cv, x0: box.minX - pad, y1: box.maxY + pad, w: cv.width / P, h: cv.height / P };
  }
  const gh = ghosts[form];
  ctx.save();
  ctx.scale(shinFacingAt(at ? at.x : 0), -1);
  ctx.drawImage(gh.cv, gh.x0, -gh.y1, gh.w, gh.h);
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

/** His card in the spawn menu: head and neck (the fourth form's), over a burning city. */
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

export { burningCity, standIn as shinStandIn };
