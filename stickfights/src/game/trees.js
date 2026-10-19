/* =============================================================================
   Trees and bushes.

   A tree is a trunk, branches off the trunk, smaller branches off those,
   twigs off those, and leaves on the ends - and every one of those is a
   springy limb (a bough) that bends where it grows out of the one before.
   Pushed, pulled, shot, hung from or dragged by the hand, it bends; let go,
   it whips back and sways itself still; it moves a little in the air all
   the time. Bent further than the wood can take, it snaps, and whatever was
   beyond the break comes down.

   The wood is cells, like a wall's (structures.js): a bullet takes out what
   it goes through, a blade chops, a blow knocks splinters off, and a limb
   cut right across - or so nearly across that what is left cannot hold it -
   lets go of everything above the cut: a twig, a branch with its leaves
   still on, or the whole tree. What comes down is a log: a body like a
   crate, that can be picked up, tied, frozen and cut up again, whose own
   branches break off under it when it lands on them.

   A bush is the same, low and soft, all stems and leaves. People walk
   through it - it gives way round them and closes behind - and it is drawn
   in front of them. A tree is drawn behind everything; neither is in
   anybody's way. Only what is shot into them, cut into them, tied to them
   or dragged through them touches them.
   ========================================================================== */
import { Body } from '../physics/rigid.js';
import { CELL } from './structures.js';
import { clamp, rand, chance } from '../core/util.js';

export const PLANTS = {
  tree: { name: 'Tree', limit: 'plants' },
  bush: { name: 'Bush', limit: 'plants' },
};

const WOOD = 620;            // kg per cubic metre, green wood
const LEAF_MASS = 0.05;      // a cluster of leaves
const STIFF = 6.3e8;         // how hard a bough is to bend: k = STIFF * r^4 / len (N m per radian)
const BREAK = 3.9e7;         // and to break: BREAK * r^3 (N m), less as it is cut across
const BARK = { trunk: '#5f4129', branch: '#6e4b2f', twig: '#7f5a38' };
const FRESH = '#d9b27a';     // the wood inside, where it has been cut or chipped
const TAKE = { bullet: 0.22, blade: 1.25, blunt: 0.45, impact: 0.12, blast: 1 };
const RESIST = 0.11;         // what each cell of wood takes out of a bullet

let nextBough = 1;
let nextPlant = 1;

/* --------------------------------- a bough --------------------------------- */

/**
 * One limb: `len` long from its base, r0 thick (half of it) there and r1 at
 * its tip, growing off `parent` at `at` metres along it, turned `rest` from
 * it (a root: its angle in the world).
 */
function bough(parent, at, rest, len, r0, r1, depth) {
  const rows = Math.max(1, Math.round(len / CELL));
  len = rows * CELL;
  const cols = Math.max(1, Math.round((2 * r0) / CELL));
  const b = {
    id: nextBough++, parent, kids: [], at, rest, len, r0, r1, depth, rows, cols,
    hp: new Float32Array(rows * cols), solid: new Uint8Array(rows * cols),
    bend: 0, w: 0, was: 0, weak: 1, leaves: [], stains: [], marks: 0, damaged: false, ox: 0,
    x: 0, y: 0, ang: 0, c: 1, s: 0, swayF: rand(0.5, 0.9), phase: rand(0, Math.PI * 2),
  };
  // the cells inside its outline: all of them across, at the base; fewer, up toward the tip
  for (let i = 0; i < rows; i++) {
    const rad = r0 + (r1 - r0) * ((i + 0.5) / rows);
    for (let j = 0; j < cols; j++) {
      const v = -cols * CELL / 2 + (j + 0.5) * CELL;
      if (cols === 1 || Math.abs(v) < rad + CELL * 0.3) { b.solid[i * cols + j] = 1; b.hp[i * cols + j] = 1; }
    }
  }
  if (parent) parent.kids.push(b);
  return b;
}

/** How much of row r of a bough is left (of what was there). */
function rowLeft(b, r) {
  let solid = 0, alive = 0;
  for (let j = 0; j < b.cols; j++) { const n = r * b.cols + j; if (b.solid[n]) { solid++; if (b.hp[n] > 0) alive++; } }
  return solid ? alive / solid : 1;
}

/** How thick (half of it) a bough is, u along it. */
const radiusAt = (b, u) => b.r0 + (b.r1 - b.r0) * clamp(u / b.len, 0, 1);

/** Its springiness, its weight about its base, and how much it takes to snap it: from what it is and what grows off it. */
function weigh(b) {
  let m = 0, I = 0;
  const add = (q, ox, oy) => {
    // q's own wood, and its leaves, about b's base (in b's rest frame, roughly: the distances are what matter)
    const mw = WOOD * Math.PI * ((q.r0 + q.r1) / 2) ** 2 * q.len;
    const d = Math.hypot(ox, oy) + q.len / 2;
    m += mw;
    I += mw * (d * d + (q.len * q.len) / 12);
    for (const l of q.leaves) { const dl = Math.hypot(ox, oy) + l.along; m += LEAF_MASS; I += LEAF_MASS * dl * dl; }
    for (const k of q.kids) add(k, ox + k.at * 0.9, oy);
  };
  add(b, 0, 0);
  b.mass = m;
  b.I = Math.max(I, 1e-4);
  b.k = STIFF * b.r0 ** 4 / Math.max(0.15, b.len);
  b.brk = BREAK * b.r0 ** 3;
  const om = Math.sqrt(b.k / b.I);
  b.om2 = b.k / b.I;
  b.damp = 0.3 * om + 1.2;
  // how far it moves in the air: twigs most, the trunk hardly at all
  b.sway = clamp(0.012 / Math.max(0.01, b.r0 * 4), 0.002, 0.05);
}

/** Leaves at `along` on a bough, `side` out from it. */
function leaf(b, along, side, r, tone) {
  b.leaves.push({ along: Math.min(along, b.len), side, r, hp: 1, tone, a: rand(0, Math.PI * 2) });
}

/* --------------------------------- growing --------------------------------- */

function rng(seed) {
  let s = (seed % 2147483647) || 1;
  if (s < 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** A tree's limbs, from its seed: roots (the trunk) first, every bough after the one it grows from. */
function growTree(R) {
  const H = 3.3 + R() * 1.1;
  const lean = (R() - 0.5) * 0.07;
  const t0 = bough(null, 0, Math.PI / 2 + lean, H * 0.42, 0.15, 0.125, 0);
  const t1 = bough(t0, t0.len, (R() - 0.5) * 0.1, H * 0.32, 0.125, 0.1, 0);
  const t2 = bough(t1, t1.len, (R() - 0.5) * 0.12, H * 0.26, 0.1, 0.075, 0);
  const top = bough(t2, t2.len, (R() - 0.5) * 0.25, 0.8 + R() * 0.35, 0.07, 0.03, 1);
  let side = R() < 0.5 ? 1 : -1;
  const twigs = (p, size) => {
    // twigs off a branch, and leaves on the twigs
    const n = 2 + (R() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const at = p.len * (0.45 + (0.55 * i) / Math.max(1, n - 1));
      const sd = i % 2 ? 1 : -1;
      const tw = bough(p, at, sd * (0.35 + R() * 0.5), (0.24 + R() * 0.16) * Math.max(0.7, size), 0.016, 0.007, 3);
      leaf(tw, tw.len * 0.55, sd * 0.05, 0.19 + R() * 0.08, 0.85 + R() * 0.3);
      leaf(tw, tw.len, 0, 0.22 + R() * 0.09, 0.85 + R() * 0.3);
    }
    leaf(p, p.len, 0, 0.24 + R() * 0.08, 0.85 + R() * 0.3);
  };
  const branch = (p, at, size) => {
    const a = side * (0.62 + R() * 0.42);
    side = -side;
    const br = bough(p, at, a, (1.05 + R() * 0.45) * size, 0.03 + 0.035 * size, 0.026, 1);
    const n = 2 + (R() < 0.45 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const sd = i % 2 ? -Math.sign(a) : Math.sign(a);
      const sub = bough(br, br.len * (0.42 + (0.58 * i) / Math.max(1, n - 1)), sd * (0.3 + R() * 0.45), (0.5 + R() * 0.3) * size, 0.03, 0.016, 2);
      twigs(sub, size);
    }
    leaf(br, br.len * 0.75, 0.06, 0.24, 0.9 + R() * 0.2);
  };
  branch(t1, t1.len * (0.55 + R() * 0.2), 1);
  branch(t2, t2.len * (0.1 + R() * 0.15), 0.95);
  branch(t2, t2.len * (0.62 + R() * 0.2), 0.85);
  branch(t2, t2.len, 0.72);
  branch(top, top.len * 0.45, 0.55);
  twigs(top, 0.8);
  leaf(top, top.len, 0, 0.3, 1);
  return order([t0]);
}

/** A bush: stems from the ground, each with stems off it, leaves all over. */
function growBush(R) {
  const roots = [];
  const n = 5 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    const st = bough(null, 0, Math.PI / 2 + (0.95 - 1.9 * f) + (R() - 0.5) * 0.2, 0.45 + R() * 0.35, 0.02, 0.01, 1);
    st.ox = (f - 0.5) * 0.32;
    roots.push(st);
    const m = 1 + (R() < 0.6 ? 1 : 0);
    for (let k = 0; k < m; k++) {
      const sd = k % 2 ? 1 : -1;
      const sub = bough(st, st.len * (0.45 + R() * 0.4), sd * (0.45 + R() * 0.4), 0.24 + R() * 0.16, 0.013, 0.007, 2);
      leaf(sub, sub.len, 0, 0.15 + R() * 0.06, 0.85 + R() * 0.3);
      leaf(sub, sub.len * 0.5, sd * 0.04, 0.13 + R() * 0.05, 0.85 + R() * 0.3);
    }
    for (const t of [0.35, 0.65, 1]) leaf(st, st.len * t, (R() - 0.5) * 0.1, 0.14 + R() * 0.08, 0.85 + R() * 0.3);
  }
  return order(roots);
}

/** Every bough of these and what grows off them, each after the one it grows from. */
function order(roots) {
  const out = [];
  const go = (b) => { out.push(b); for (const k of b.kids) go(k); };
  for (const r of roots) go(r);
  return out;
}

/* ------------------------------ wood, shared -------------------------------- */

/**
 * What a standing plant and a fallen log have in common: limbs made of
 * cells, where every one of them is (`pose` puts them there), that can be
 * hit, shot, cut, stained and drawn.
 */
class Wood {
  constructor(sb) {
    this.sandbox = sb;
    this.removed = false;
    this.frozenInPlace = false;
    this.boughs = [];
    this.thrownBy = null;
    this.thrownAt = -99;
    this.lastSound = -99;
  }

  /** A point u along a bough and v out from it, in the world. */
  at(b, u, v = 0) { return { x: b.x + b.c * u - b.s * v, y: b.y + b.s * u + b.c * v }; }

  /** The other way: a world point, as (u, v) on a bough. */
  local(b, x, y) {
    const dx = x - b.x, dy = y - b.y;
    return { u: dx * b.c + dy * b.s, v: -dx * b.s + dy * b.c };
  }

  /** The cell of b at (u, v), or -1. */
  cellAt(b, u, v) {
    const i = Math.floor(u / CELL), j = Math.floor((v + (b.cols * CELL) / 2) / CELL);
    if (i < 0 || j < 0 || i >= b.rows || j >= b.cols) return -1;
    return i * b.cols + j;
  }

  /** The bough at (x, y), within r of its wood (or its leaves, with leaves): { b, u, v, d } or null. */
  hitTest(x, y, r = 0, leaves = false) {
    let best = null;
    for (const b of this.boughs) {
      const l = this.local(b, x, y);
      if (l.u < -r || l.u > b.len + r) continue;
      const rad = radiusAt(b, l.u);
      const d = Math.abs(l.v) - rad;
      if (d > r) continue;
      // (inside the outline, but only where wood is left)
      const i = this.cellAt(b, clamp(l.u, 0, b.len - 1e-6), clamp(l.v, -rad, rad));
      if (i >= 0 && b.hp[i] <= 0 && r < CELL) continue;
      if (!best || d < best.d) best = { b, u: clamp(l.u, 0, b.len), v: l.v, d };
    }
    if (best || !leaves) return best;
    for (const b of this.boughs) {
      for (const lf of b.leaves) {
        const p = this.at(b, lf.along, lf.side);
        const d = Math.hypot(p.x - x, p.y - y) - lf.r * Math.sqrt(lf.hp);
        if (d <= r && (!best || d < best.d)) best = { b, u: lf.along, v: 0, d, leaf: lf };
      }
    }
    return best;
  }

  contains(x, y, r = 0) { return !!this.hitTest(x, y, r, true); }

  /** Going from (x, y) along (dx, dy), the first point in the wood that is left, within `max`: where a blow lands. */
  firstSolid(x, y, dx, dy, max) {
    for (let t = 0; t <= max; t += CELL * 0.5) {
      const h = this.hitTest(x + dx * t, y + dy * t, 0);
      if (h) return { x: x + dx * t, y: y + dy * t };
    }
    return null;
  }

  /** Where a ray from (px, py) along (dx, dy) first meets wood, out to `range`: { t, out } or null. */
  rayHit(px, py, dx, dy, range) {
    let best = null;
    for (const b of this.boughs) {
      const h = this.span(b, px, py, dx, dy, range);
      if (h && (!best || h.t0 < best.t)) best = { t: h.t0, out: h.t1 - h.t0 };
    }
    return best;
  }

  /**
   * A bullet in at (x, y) along (dx, dy) with `energy`, out to `max` metres:
   * through the wood cell by cell (every bough it crosses), each cell taking
   * its share. Returns { energy, out, hit, at }, as a wall's does.
   */
  bullet(x, y, dx, dy, energy, max) {
    const step = CELL * 0.5;
    // every bough the line crosses, nearest first, and where it goes in and comes out
    const spans = [];
    for (const b of this.boughs) {
      const h = this.span(b, x, y, dx, dy, max);
      if (h) spans.push({ b, t0: h.t0, t1: h.t1 });
    }
    spans.sort((p, q) => p.t0 - q.t0);
    let first = null, out = 0;
    const seen = new Set();
    for (const sp of spans) {
      const b = sp.b;
      for (let t = sp.t0; t <= sp.t1 && energy > 0.15; t += step) {
        const px = x + dx * t, py = y + dy * t;
        const l = this.local(b, px, py);
        const i = this.cellAt(b, l.u, l.v);
        if (i < 0 || b.hp[i] <= 0 || seen.has(b.id * 100000 + i)) continue;
        seen.add(b.id * 100000 + i);
        if (!first) first = { x: px, y: py, b };
        out = t + step;
        b.hp[i] -= energy * TAKE.bullet;
        b.damaged = true;
        if (b.hp[i] <= 0) { b.hp[i] = 0; this.chip(px, py, dx, dy, 2); }
        energy -= RESIST;
      }
      if (energy <= 0.15) break;
      out = Math.max(out, sp.t1);
    }
    if (!first) return { energy, out: max, hit: false };
    first.b.marks++;
    this.chip(first.x, first.y, -dx, -dy, 1.5);
    this.shake(first.b, first.x, first.y, dx * 0.6, dy * 0.6);
    this.afterHarm({ dx, dy });
    return { energy: Math.max(0, energy), out: Math.min(max, out), hit: true, at: first };
  }

  /** Where the line from (x, y) along (dx, dy) goes into bough b's outline and out of it, within `max`: { t0, t1 } or null. */
  span(b, x, y, dx, dy, max) {
    const p = this.local(b, x, y);
    const du = dx * b.c + dy * b.s, dv = -dx * b.s + dy * b.c;
    const hw = Math.max(b.r0, b.r1);
    let t0 = 0, t1 = max;
    for (const [o, d, lo, hi] of [[p.u, du, 0, b.len], [p.v, dv, -hw, hw]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
      let a = (lo - o) / d, c = (hi - o) / d;
      if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, c);
      if (t0 > t1) return null;
    }
    return { t0, t1 };
  }

  /**
   * Harm to the wood round (x, y), out to r: `amount` of `kind` ('blade',
   * 'blunt', 'impact', 'blast', 'bullet'). Returns how many cells went.
   */
  damage(x, y, r, amount, kind = 'blunt', o = {}) {
    if (this.removed || amount <= 0) return 0;
    const take = (TAKE[kind] ?? 1) * amount;
    let gone = 0, hit = null;
    for (const b of this.boughs) {
      const l = this.local(b, x, y);
      if (l.u < -r || l.u > b.len + r) continue;
      if (Math.abs(l.v) > radiusAt(b, l.u) + r) continue;
      const k = Math.ceil(r / CELL) + 1;
      const i0 = Math.floor(l.u / CELL), j0 = Math.floor((l.v + (b.cols * CELL) / 2) / CELL);
      for (let di = -k; di <= k; di++) {
        for (let dj = -k; dj <= k; dj++) {
          const i = i0 + di, j = j0 + dj;
          if (i < 0 || j < 0 || i >= b.rows || j >= b.cols) continue;
          const n = i * b.cols + j;
          if (b.hp[n] <= 0) continue;
          const cu = (i + 0.5) * CELL, cv = -b.cols * CELL / 2 + (j + 0.5) * CELL;
          const d = Math.hypot(cu - l.u, cv - l.v);
          if (d > r) continue;
          // (a blow, as opposed to a cut, hardly marks a thick limb: it bends it)
          b.hp[n] -= take * Math.sqrt(1 - d / r) * rand(0.75, 1.25) * (kind === 'impact' || kind === 'blunt' ? 1 / (1 + b.r0 * 30) : 1);
          b.damaged = true;
          hit = hit || b;
          if (b.hp[n] <= 0) {
            b.hp[n] = 0;
            gone++;
            const p = this.at(b, cu, cv);
            this.chip(p.x, p.y, o.dx || 0, o.dy || 0, o.speed || 1);
          }
        }
      }
    }
    if (!hit) return 0;
    hit.marks++;
    this.shake(hit, x, y, (o.dx || 0) * amount * 0.5, (o.dy || 0) * amount * 0.5);
    this.afterHarm(o);
    return gone;
  }

  /** Something hitting it at `speed` with `mass` behind it. */
  impact(x, y, speed, mass, dx = 0, dy = 0) {
    if (speed < 3) return 0;
    const e = 0.5 * Math.min(mass, 120) * speed * speed;
    const amount = e / 300;
    if (amount < 0.05) return 0;
    return this.damage(x, y, clamp(0.05 + Math.sqrt(e) * 0.004, 0.05, 0.2), amount, 'impact', { dx, dy, speed: speed * 0.3 });
  }

  /** A blast at (x, y), out to r: the wood near it blown out, the leaves stripped, every limb in reach thrown about. */
  blast(x, y, r, power = 1) {
    const bb = this.bounds();
    if (x < bb.x0 - r || x > bb.x1 + r || y < bb.y0 - r || y > bb.y1 + r) return;
    for (const b of this.boughs) {
      for (const lf of [...b.leaves]) {
        const p = this.at(b, lf.along, lf.side), d = Math.hypot(p.x - x, p.y - y);
        if (d > r * 1.3) continue;
        lf.hp -= power * (1 - d / (r * 1.3)) * 1.4;
        this.shed(b, lf, 3);
        if (lf.hp <= 0.15) b.leaves.splice(b.leaves.indexOf(lf), 1);
      }
      const tip = this.at(b, b.len), d = Math.hypot(tip.x - x, tip.y - y);
      if (d < r * 1.5) this.shake(b, tip.x, tip.y, Math.sign(tip.x - x) * 30 * power * (1 - d / (r * 1.5)), 10 * power * (1 - d / (r * 1.5)));
    }
    this.damage(x, y, r * 0.5, power * 1.2, 'blast', { dx: 0, dy: 1, speed: 2 });
  }

  /** Splinters, and bark. */
  chip(x, y, dx, dy, speed = 1) {
    this.sandbox.fx.bits(x, y, 1, chance(0.5) ? FRESH : '#6e4b2f', dx * speed + rand(-1, 1), dy * speed + rand(0, 1.5), { size: CELL * rand(0.3, 0.55) });
  }

  /** A knock moves the bough it lands on (a plant's; a log is a body, and is pushed as one). */
  shake() {}

  /** After cells have gone: anything cut through - or nearly - lets go of what is beyond the cut. */
  afterHarm(o = {}) {
    for (const b of [...this.boughs]) {
      if (b.gone || !b.damaged || !this.boughs.includes(b)) continue;
      b.damaged = false;
      let weakest = 1, at = -1, empty = -1;
      for (let i = 0; i < b.rows; i++) {
        let solid = 0, alive = 0;
        for (let j = 0; j < b.cols; j++) {
          const n = i * b.cols + j;
          if (!b.solid[n]) continue;
          solid++;
          if (b.hp[n] > 0) alive++;
        }
        if (!solid) continue;
        if (!alive) { empty = i; break; }
        const f = alive / solid;
        if (f < weakest) { weakest = f; at = i; }
      }
      b.weak = weakest;
      if (empty >= 0) this.cut(b, empty, o);
      // so little left across it that it cannot hold up what is above
      else if (weakest < 0.2 && b.cols > 2) this.cut(b, at, o);
    }
  }

  /**
   * b cut through at row i: the row gone, and everything beyond it - the
   * rest of b, and all that grows off that - away, as a log of its own (or,
   * small enough, in bits).
   */
  cut(b, i, o = {}) {
    // the row itself goes to splinters
    for (let j = 0; j < b.cols; j++) {
      const n = i * b.cols + j;
      if (b.hp[n] > 0) { const p = this.at(b, (i + 0.5) * CELL, -b.cols * CELL / 2 + (j + 0.5) * CELL); this.chip(p.x, p.y, o.dx || 0, o.dy || 0, 1); }
      b.hp[n] = 0;
    }
    const from = (i + 1) * CELL;
    // what goes: whatever grows off b past the cut (cut at its base, all of it), and the rest of b
    const beyond = i === 0 ? [...b.kids] : b.kids.filter((k) => k.at >= i * CELL + CELL * 0.5);
    let tail = null;
    if (i + 1 < b.rows) {
      tail = bough(null, 0, 0, (b.rows - i - 1) * CELL, radiusAt(b, from), b.r1, b.depth);
      tail.hp.fill(0);
      tail.solid.fill(0);
      // its cells, as they were in b
      for (let r = 0; r < tail.rows; r++) {
        for (let j = 0; j < tail.cols; j++) {
          const v = -tail.cols * CELL / 2 + (j + 0.5) * CELL;
          const jj = Math.floor((v + (b.cols * CELL) / 2) / CELL);
          if (jj < 0 || jj >= b.cols) continue;
          const n = (r + i + 1) * b.cols + jj;
          tail.solid[r * tail.cols + j] = b.solid[n];
          tail.hp[r * tail.cols + j] = b.hp[n];
        }
      }
      tail.leaves = b.leaves.filter((l) => l.along >= from).map((l) => ({ ...l, along: l.along - from }));
      tail.stains = b.stains.filter((st) => st.u >= from).map((st) => ({ ...st, u: st.u - from }));
      for (const k of beyond) { k.parent = tail; k.at = Math.max(0, k.at - from); tail.kids.push(k); }
      const p = this.at(b, from);
      tail.x = p.x; tail.y = p.y; tail.ang = b.ang; tail.c = b.c; tail.s = b.s;
      tail.rest = b.rest; tail.bend = b.bend; tail.w = b.w;
      tail.lx = b.lx; tail.la = b.la;
    }
    b.kids = b.kids.filter((k) => !beyond.includes(k));
    const fallen = [];
    if (tail) fallen.push(tail);
    else for (const k of beyond) { k.parent = null; fallen.push(k); }
    // b keeps what is short of the cut - or, cut at its base, is gone from where it grew
    if (i === 0) {
      if (b.parent) b.parent.kids = b.parent.kids.filter((k) => k !== b);
      b.gone = true;
      this.boughs = this.boughs.filter((q) => q !== b);
      // (a wire on it goes with the rest of it, if there is a rest)
      for (const w of [...this.sandbox.wires]) {
        for (const e of [w.a, w.b]) {
          if (w.removed || e.kind !== 'tree' || e.t !== this || e.seg !== b) continue;
          if (tail) { e.seg = tail; e.along = Math.max(0, e.along - from); } else w.snap('cut');
        }
      }
    } else {
      const r1 = radiusAt(b, i * CELL);
      b.rows = i;
      b.len = i * CELL;
      b.r1 = r1;
      b.hp = b.hp.slice(0, i * b.cols);
      b.solid = b.solid.slice(0, i * b.cols);
      // what is left at the top, cut most of the way through, is splinters
      while (b.rows > 1 && rowLeft(b, b.rows - 1) < 0.5) {
        for (let j = 0; j < b.cols; j++) {
          const n = (b.rows - 1) * b.cols + j;
          if (b.hp[n] > 0) { const p = this.at(b, (b.rows - 0.5) * CELL, -b.cols * CELL / 2 + (j + 0.5) * CELL); this.chip(p.x, p.y, o.dx || 0, o.dy || 0, 1); }
        }
        b.rows--;
        b.len = b.rows * CELL;
        b.hp = b.hp.slice(0, b.rows * b.cols);
        b.solid = b.solid.slice(0, b.rows * b.cols);
      }
      b.weak = 1;
      for (let r = 0; r < b.rows; r++) b.weak = Math.min(b.weak, rowLeft(b, r));
      b.leaves = b.leaves.filter((l) => l.along < b.len);
      b.stains = b.stains.filter((st) => st.u < b.len);
      // (a wire tied past the end of what is left of it - on the row that went - goes with the rest)
      for (const w of [...this.sandbox.wires]) {
        for (const e of [w.a, w.b]) if (e.kind === 'tree' && e.t === this && e.seg === b && e.along > b.len) { if (tail) { e.seg = tail; e.along = Math.max(0, e.along - from); } else e.along = b.len; }
      }
    }
    const logs = fallen.map((f) => this.fall(f, o));
    this.reweigh();
    return logs;
  }

  /**
   * A bough no longer joined to this one (the root of what came off): out of
   * this, with all that grows off it, into a log - or, too small to bother
   * with, leaves and splinters.
   */
  fall(root, o = {}) {
    const sb = this.sandbox;
    const set = order([root]);
    const mine = new Set(set);
    this.boughs = this.boughs.filter((q) => !mine.has(q));
    const big = root.len >= 0.2 && this.kind !== 'bush';
    const log = big && sb.logs.length < LOG_LIMIT ? sb.addLog(new Log(sb, set, this, o)) : null;
    // the wires tied to any of it go with it - or, if it has gone to bits, snap
    for (const w of [...sb.wires]) {
      for (const e of [w.a, w.b]) {
        if (w.removed) break;
        const on = e.kind === 'tree' ? e.t === this && mine.has(e.seg) : e.kind === 'body' && e.t === this && this.body && set.some((z) => this.near(z, e));
        if (!on) continue;
        if (!log) { w.snap('cut'); break; }
        const p = e.kind === 'tree' ? this.at(e.seg, e.along) : this.body.toWorld(e.lx, e.ly);
        const l = log.body.toLocal(p.x, p.y);
        e.kind = 'body'; e.t = log; e.lx = l.x; e.ly = l.y;
        delete e.seg; delete e.along;
      }
    }
    if (sb.hand && sb.hand.holding === this && this.held && this.held.b && mine.has(this.held.b)) sb.hand.release();
    if (!log) {
      for (const q of set) {
        q.gone = true;
        for (const lf of q.leaves) this.shed(q, lf, 3);
        const mid = this.at(q, q.len / 2);
        sb.fx.bits(mid.x, mid.y, Math.max(1, Math.round(q.len / 0.1)), BARK.twig, rand(-0.5, 0.5), 0.5, { size: Math.max(0.012, q.r0 * 1.3) });
      }
    }
    sb.emit('limbFall', { what: this, log, x: root.x, y: root.y, big: root.r0 >= 0.06, tree: this.kind === 'tree' && root.depth === 0 });
    return log;
  }

  /** Leaves off a cluster, drifting down: n of them. */
  shed(b, lf, n = 2) {
    const p = this.at(b, lf.along, lf.side);
    for (let k = 0; k < n; k++) {
      this.sandbox.fx.bits(p.x + rand(-lf.r, lf.r) * 0.6, p.y + rand(-lf.r, lf.r) * 0.6, 1, leafColour(lf.tone, chance(0.5)), rand(-0.6, 0.6), rand(-0.2, 0.4), { leaf: true, size: rand(0.035, 0.055) });
    }
  }

  /** A bullet's path from (x0, y0) to (x1, y1) through the leaves: some of them knocked off. */
  leavesThrough(x0, y0, x1, y1) {
    const vx = x1 - x0, vy = y1 - y0, l2 = vx * vx + vy * vy || 1e-9;
    for (const b of this.boughs) {
      for (const lf of [...b.leaves]) {
        const p = this.at(b, lf.along, lf.side);
        const t = clamp(((p.x - x0) * vx + (p.y - y0) * vy) / l2, 0, 1);
        if (Math.hypot(x0 + vx * t - p.x, y0 + vy * t - p.y) > lf.r * Math.sqrt(lf.hp)) continue;
        if (!chance(0.7)) continue;
        lf.hp -= rand(0.2, 0.35);
        this.shed(b, lf, 2 + Math.floor(rand(0, 3)));
        if (lf.hp <= 0.15) b.leaves.splice(b.leaves.indexOf(lf), 1);
      }
    }
  }

  /** Blood landing on the wood. */
  stain(wx, wy, r, tint = null) {
    const h = this.hitTest(wx, wy, 0.01);
    if (!h) return;
    const b = h.b;
    if (b.stains.length > 12) b.stains.shift();
    b.stains.push({ u: h.u, v: clamp(h.v, -radiusAt(b, h.u), radiusAt(b, h.u)), r: Math.min(r, radiusAt(b, h.u) * 1.4), a: rand(0, Math.PI), dark: chance(0.3), tint });
  }

  /** Mass and springiness, again, after something came off. */
  reweigh() {}

  /* --------------------------------- drawing -------------------------------- */

  /** The wood: every bough as it is now, cut where it has been cut. */
  drawWood(ctx) {
    for (const b of this.boughs) {
      const bark = b.depth === 0 ? BARK.trunk : b.depth === 1 ? BARK.branch : BARK.twig;
      // anything gone out of it, or chipped, or bloodied: drawn through its cells (slower); whole, as a plain shape
      let marked = b.stains.length > 0;
      if (!marked) for (let n = 0; n < b.hp.length; n++) if (b.solid[n] && b.hp[n] < 0.9) { marked = true; break; }
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.ang);
      // its outline: tapering, rounded where it grows from what it grows on
      const outline = () => {
        ctx.beginPath();
        ctx.moveTo(0, -b.r0);
        ctx.lineTo(b.len, -b.r1);
        ctx.arc(b.len, 0, b.r1, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(0, b.r0);
        ctx.arc(0, 0, b.r0, Math.PI / 2, Math.PI * 1.5);
        ctx.closePath();
      };
      const W = b.cols * CELL;
      if (marked) {
        outline();
        ctx.clip();
        // with the cells that have gone cut out of it
        let holes = false;
        for (let n = 0; n < b.hp.length; n++) if (b.solid[n] && b.hp[n] <= 0) { holes = true; break; }
        if (holes) {
          ctx.beginPath();
          ctx.rect(-b.r0 - 0.05, -W, b.len + b.r0 + 0.1, W * 2 + 0.1);
          for (let i = 0; i < b.rows; i++) {
            for (let j = 0; j < b.cols; j++) {
              const n = i * b.cols + j;
              if (!b.solid[n] || b.hp[n] > 0) continue;
              // (a cell gone at the base takes the rounded end with it; at the tip, the cap)
              const x0 = i === 0 ? -b.r0 - 0.01 : i * CELL, x1 = i === b.rows - 1 ? b.len + b.r1 + 0.01 : (i + 1) * CELL;
              const y0 = j === 0 ? -W : -W / 2 + j * CELL, y1 = j === b.cols - 1 ? W : -W / 2 + (j + 1) * CELL;
              ctx.rect(x0, y0, x1 - x0, y1 - y0);
            }
          }
          ctx.clip('evenodd');
        }
        ctx.fillStyle = bark;
        ctx.fillRect(-b.r0 - 0.02, -W - 0.02, b.len + b.r0 + b.r1 + 0.04, W * 2 + 0.04);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
        ctx.fillRect(-b.r0, -W, b.len + b.r0 + b.r1, W * 0.75);
      } else {
        outline();
        ctx.fillStyle = bark;
        ctx.fill();
        // the shade down one side
        ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
        ctx.beginPath();
        ctx.moveTo(0, -b.r0);
        ctx.lineTo(b.len, -b.r1);
        ctx.lineTo(b.len, -b.r1 * 0.25);
        ctx.lineTo(0, -b.r0 * 0.25);
        ctx.closePath();
        ctx.fill();
      }
      // the bark: lines along it
      if (b.r0 > 0.035) {
        ctx.strokeStyle = 'rgba(40, 24, 12, 0.45)';
        ctx.lineWidth = 0.008;
        ctx.beginPath();
        for (const f of [-0.45, 0.1, 0.55]) {
          for (let u = 0; u <= b.len; u += 0.1) {
            const v = f * radiusAt(b, u) + Math.sin(u * 13 + f * 7 + b.id) * 0.006;
            if (u === 0) ctx.moveTo(u, v); else ctx.lineTo(u, v);
          }
        }
        ctx.stroke();
      }
      if (marked) {
        // where it has been hit: the pale wood under the bark
        for (let i = 0; i < b.rows; i++) {
          for (let j = 0; j < b.cols; j++) {
            const h = b.hp[i * b.cols + j];
            if (h <= 0 || h > 0.9) continue;
            ctx.fillStyle = `rgba(217, 178, 122, ${((1 - h) * 0.9).toFixed(2)})`;
            ctx.fillRect(i * CELL, -W / 2 + j * CELL, CELL, CELL);
          }
        }
        for (const st of b.stains) {
          ctx.fillStyle = st.tint ? st.tint[st.dark ? 1 : 0] : st.dark ? 'rgba(110, 7, 16, 0.9)' : 'rgba(150, 14, 24, 0.85)';
          ctx.beginPath();
          ctx.ellipse(st.u, st.v, st.r, st.r * 0.7, st.a, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  /**
   * The leaves: a dark mass, and the light on top of it - each in a few
   * shades, every bunch of leaves of a shade in one go (so a patch where
   * bunches overlap is painted once, not once for each).
   */
  drawLeaves(ctx, t = 0) {
    const groups = [[], [], []];
    for (const b of this.boughs) {
      for (const lf of b.leaves) groups[lf.tone < 0.95 ? 0 : lf.tone < 1.05 ? 1 : 2].push([b, lf]);
    }
    const TONES = [0.88, 1, 1.12];
    for (const pass of [0, 1]) {
      for (let g = 0; g < 3; g++) {
        if (!groups[g].length) continue;
        ctx.fillStyle = leafColour(TONES[g], pass === 0);
        ctx.beginPath();
        for (const [b, lf] of groups[g]) {
          const p = this.at(b, lf.along, lf.side);
          const r = lf.r * (0.55 + 0.45 * lf.hp);
          const x = p.x + Math.sin(t * 1.3 + lf.a) * r * 0.04, y = p.y;
          // (a bunch is a lumpy ellipse of dark, and a smaller one of light up its top side)
          if (pass === 0) {
            ctx.moveTo(x + r * 1.25, y - r * 0.08);
            ctx.ellipse(x, y - r * 0.08, r * 1.25, r * 0.95, lf.a * 0.2, 0, Math.PI * 2);
          } else {
            ctx.moveTo(x + r * 0.62, y + r * 0.18);
            ctx.ellipse(x, y + r * 0.18, r * 0.8, r * 0.58, lf.a * 0.2, 0, Math.PI * 2);
          }
        }
        ctx.fill();
      }
    }
  }

  /** The box round all of it, in the world. */
  bounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of this.boughs) {
      for (const p of [{ x: b.x, y: b.y }, this.at(b, b.len)]) {
        x0 = Math.min(x0, p.x - b.r0); x1 = Math.max(x1, p.x + b.r0);
        y0 = Math.min(y0, p.y - b.r0); y1 = Math.max(y1, p.y + b.r0);
      }
      for (const lf of b.leaves) {
        const p = this.at(b, lf.along, lf.side);
        x0 = Math.min(x0, p.x - lf.r); x1 = Math.max(x1, p.x + lf.r);
        y0 = Math.min(y0, p.y - lf.r); y1 = Math.max(y1, p.y + lf.r);
      }
    }
    return { x0, y0, x1, y1 };
  }
}

const leafColour = (tone, dark) => {
  const k = clamp(tone, 0.6, 1.4);
  return dark ? `rgb(${Math.round(40 * k)}, ${Math.round(96 * k)}, ${Math.round(38 * k)})` : `rgb(${Math.round(78 * k)}, ${Math.round(146 * k)}, ${Math.round(58 * k)})`;
};

/* ---------------------------------- plants ---------------------------------- */

const LOG_LIMIT = 40;

/** A tree, or a bush, growing at (x, y). */
export class Plant extends Wood {
  constructor(sb, kind, x, y, seed = Math.floor(rand(1, 1e9))) {
    super(sb);
    this.id = nextPlant++;
    this.kind = kind;
    this.name = PLANTS[kind].name;
    this.x = x;
    this.y = y;
    this.seed = seed;
    this.held = null;
    const R = rng(seed);
    this.boughs = kind === 'bush' ? growBush(R) : growTree(R);
    this.reweigh();
    this.pose();
    this.rustleT = 0;
  }

  get pos() { return { x: this.x, y: this.y + (this.kind === 'bush' ? 0.4 : 1.2) }; }
  get front() { return this.kind === 'bush'; }

  reweigh() {
    for (const b of this.boughs) weigh(b);
    // nothing left of it standing at all
    if (!this.boughs.length && !this.removed && this.sandbox.remove) this.sandbox.remove(this, { quiet: true });
  }

  /** Every bough where it is now: off the ground, off the one it grows from, as bent as it is. */
  pose() {
    for (const b of this.boughs) {
      if (!b.parent) {
        b.x = this.x + (b.ox || 0);
        b.y = this.y;
        b.ang = b.rest + b.bend;
      } else {
        const p = b.parent;
        b.x = p.x + p.c * b.at;
        b.y = p.y + p.s * b.at;
        b.ang = p.ang + b.rest + b.bend;
      }
      b.c = Math.cos(b.ang);
      b.s = Math.sin(b.ang);
    }
  }

  update(dt) {
    const sb = this.sandbox;
    if (this.frozenInPlace) { this.pose(); return; }
    const t = sb.time;
    // whatever pushed a bough since last time (a rope, the hand) is how fast it is going now
    for (const b of this.boughs) {
      // (one in the hand goes where the hand puts it)
      if (this.held && this.held.b === b) { b.w = 0; b.was = b.bend; continue; }
      b.w += (b.bend - b.was) / dt;
      // the air moving it, a little, all the time
      const sway = b.sway * (Math.sin(t * b.swayF + b.phase) + 0.4 * Math.sin(t * b.swayF * 2.7 + b.phase * 1.7));
      const om2 = b.om2;
      b.w = (b.w - dt * om2 * (b.bend - sway)) / (1 + dt * b.damp + dt * dt * om2);
      b.w = clamp(b.w, -30, 30);
      b.bend += b.w * dt;
      b.was = b.bend;
    }
    this.pose();
    // bent further than the wood will take: it snaps where it is weakest
    for (const b of [...this.boughs]) {
      if (b.gone) continue;
      const torque = b.k * Math.abs(b.bend);
      if (torque > b.brk * b.weak * b.weak) this.snap(b);
    }
    // a bush: people (and anything moving through it) push it aside, and it rustles
    if (this.kind === 'bush') this.brush(dt);
    // anything flying into it knocks it about
    this.struck(dt);
    // and now and then, a leaf drifts down by itself
    if (chance(dt * 0.04 * Math.min(4, this.boughs.length / 10))) {
      const b = this.boughs[Math.floor(Math.random() * this.boughs.length)];
      if (b && b.leaves.length) this.shed(b, b.leaves[Math.floor(Math.random() * b.leaves.length)], 1);
    }
  }

  /** b, bent too far: it breaks, at its weakest row (its base, if it is whole). */
  snap(b) {
    let at = 0, weakest = 2;
    for (let i = 0; i < Math.min(b.rows, 6); i++) {
      let solid = 0, alive = 0;
      for (let j = 0; j < b.cols; j++) { const n = i * b.cols + j; if (b.solid[n]) { solid++; if (b.hp[n] > 0) alive++; } }
      const f = solid ? alive / solid : 1;
      if (f < weakest - 0.05) { weakest = f; at = i; }
    }
    this.sandbox.emit('snapBough', { what: this, x: b.x, y: b.y, big: b.r0 >= 0.03 });
    this.cut(b, at, { dx: -b.s * Math.sign(b.bend), dy: b.c * Math.sign(b.bend) });
  }

  /** People walking through a bush: the stems give way round them, and spring back after. */
  brush(dt) {
    const sb = this.sandbox;
    const bb = this.bounds();
    this.rustleT -= dt;
    for (const m of sb.people) {
      if (m.removed) continue;
      const mx = m.wj.hip.x;
      if (mx < bb.x0 - 0.3 || mx > bb.x1 + 0.3) continue;
      const foot = m.rag ? Math.min(m.wj.footA.y, m.wj.footB.y, m.wj.hip.y, m.wj.head.y) : m.pos.y;
      if (foot > bb.y1) continue;
      const v = m.rag ? 0 : m.vel.x;
      let moved = false;
      for (const b of this.boughs) {
        const tip = this.at(b, b.len);
        const half = (m.rag ? 0.35 : 0.2) * (m.scale || 1);
        const dx = tip.x - mx;
        if (Math.abs(dx) > half || tip.y < foot - 0.05 || tip.y > foot + 1.7 * (m.scale || 1)) continue;
        // out of the way, to whichever side it was already on (but a stem only bends so far)
        const want = mx + (dx >= 0 ? half : -half);
        const push = (want - tip.x) * 0.25;
        if (Math.abs(b.bend) > 0.9 && Math.sign(push * (b.s >= 0 ? -1 : 1)) === Math.sign(b.bend)) continue;
        this.bendBy(b, b.len, push, 0);
        moved = true;
      }
      if (moved && Math.abs(v) > 0.8 && this.rustleT <= 0) {
        this.rustleT = 0.35;
        sb.emit('rustle', { what: this, x: mx, y: foot + 0.4, who: m });
        const b = this.boughs[Math.floor(Math.random() * this.boughs.length)];
        if (b && b.leaves.length && chance(0.3)) this.shed(b, b.leaves[0], 1);
      }
    }
  }

  /** Anything flying into it - a thrown crate, a gun, a log, somebody thrown - knocks it about, and may break it. */
  struck() {
    const sb = this.sandbox, now = sb.time;
    const bb = this.bounds();
    this.hitBy = this.hitBy || new Map();
    const hit = (key, x, y, vx, vy, mass, size) => {
      const sp = Math.hypot(vx, vy);
      if (sp < 3 || x < bb.x0 - size || x > bb.x1 + size || y < bb.y0 - size || y > bb.y1 + size) return;
      if (now - (this.hitBy.get(key) || -9) < 0.3) return;
      const h = this.hitTest(x, y, size, true);
      if (!h) return;
      this.hitBy.set(key, now);
      if (h.leaf) {
        h.leaf.hp -= 0.12;
        this.shed(h.b, h.leaf, 2);
        if (h.leaf.hp <= 0.15) h.b.leaves.splice(h.b.leaves.indexOf(h.leaf), 1);
      } else {
        this.impact(x, y, sp, mass, vx / sp, vy / sp);
        this.shake(h.b, x, y, vx * mass * 0.3, vy * mass * 0.3);
      }
      sb.emit('rustle', { what: this, x, y, hard: !h.leaf && mass > 5 });
    };
    for (const k of sb.crates) if (!k.carriedBy && !k.removed) hit(k, k.body.pos.x, k.body.pos.y, k.body.vel.x, k.body.vel.y, k.body.mass, Math.max(k.body.w, k.body.h) / 2);
    for (const k of sb.loose()) if (k.body) hit(k, k.body.pos.x, k.body.pos.y, k.body.vel.x, k.body.vel.y, k.body.mass, Math.max(k.body.w, k.body.h) / 2);
    for (const m of sb.people) {
      if (m.removed) continue;
      if (m.rag) {
        const q = m.rag.p[m.rag.byName.chest];
        if (q) hit(m, q.x, q.y, (q.x - q.px) * 120, (q.y - q.py) * 120, 70 * (m.scale || 1), 0.2);
      } else if (m.state === 'thrown') hit(m, m.wj.chest.x, m.wj.chest.y, m.vel.x, m.vel.y, 70 * (m.scale || 1), 0.2);
    }
    for (const [k, t] of this.hitBy) if (now - t > 2) this.hitBy.delete(k);
  }

  /** A knock on a bough sets it moving. */
  shake(b, x, y, ix, iy) {
    if (!b || this.frozenInPlace) return;
    const rx = x - b.x, ry = y - b.y;
    b.w += clamp((rx * iy - ry * ix) / (b.I * 4 + 0.05), -6, 6);
  }

  /* ------------------------- what wires and the hand use ------------------------- */

  /** The bough nearest (x, y) and how far along it: what a wire is tied to. */
  branchAt(x, y) {
    const h = this.hitTest(x, y, 0.6, true) || { b: this.boughs[0], u: 0 };
    return { seg: h.b, along: clamp(h.u, 0, h.b.len) };
  }

  branchPoint(b, along) { return this.at(b, Math.min(along, b.len)); }

  /** How easily a bough gives, at `along`, pulled along (nx, ny). */
  branchGive(b, along, nx = 0, ny = 1) {
    if (this.frozenInPlace || b.gone) return 0;
    const rx = b.c * along, ry = b.s * along;
    const pn = rx * ny - ry * nx;
    return (pn * pn) / b.I;
  }

  /** A bough turned at its base so that the point `along` it moves by (dx, dy) - as near as turning can. */
  bendBy(b, along, dx, dy) {
    if (this.frozenInPlace || b.gone) return;
    const rx = b.c * along, ry = b.s * along;
    const cr = rx * dy - ry * dx;
    if (Math.abs(cr) < 1e-9) return;
    const d2 = dx * dx + dy * dy;
    b.bend += clamp(d2 / cr, -0.3, 0.3);
    // (the boughs off it move with it)
    this.poseFrom(b);
  }

  /** b and everything off it, put where they are now. */
  poseFrom(b) {
    for (const q of order([b])) {
      if (!q.parent) { q.x = this.x + (q.ox || 0); q.y = this.y; q.ang = q.rest + q.bend; } else {
        const p = q.parent;
        q.x = p.x + p.c * q.at; q.y = p.y + p.s * q.at;
        q.ang = p.ang + q.rest + q.bend;
      }
      q.c = Math.cos(q.ang); q.s = Math.sin(q.ang);
    }
  }

  /**
   * Taken hold of by the hand: by the trunk (or the base of a bush), it is
   * moved, as it is; by a branch or a twig, that is bent - and bent too far,
   * it snaps off.
   */
  handGrab(x, y) {
    const h = this.hitTest(x, y, 0.15, true);
    if (!h || h.b.depth === 0 || (this.kind === 'bush' && h.u < 0.12 && !h.b.parent)) {
      this.held = { move: true, ox: this.x - x, oy: this.y - y };
    } else {
      this.held = { b: h.b, along: Math.max(0.05, h.u) };
    }
    return 'self';
  }

  handHold(x, y) {
    const h = this.held;
    if (!h) return;
    if (h.move) {
      this.shift(x + h.ox - this.x, Math.max(0, y + h.oy) - this.y);
      return;
    }
    const b = h.b;
    if (b.gone || !this.boughs.includes(b)) { this.held = null; return; }
    // bent round toward the hand, a little at a time: as far as the wood will go before it snaps
    const straight = (b.parent ? b.parent.ang : 0) + b.rest;
    const want = angDiff(Math.atan2(y - b.y, x - b.x), straight);
    b.bend += clamp(angDiff(want, b.bend), -0.1, 0.1);
    this.poseFrom(b);
  }

  handRelease() {
    if (this.held && this.held.move) this.settle();
    this.held = null;
  }

  /** Moved by (dx, dy), as it is. */
  shift(dx, dy) {
    this.x += dx;
    this.y = Math.max(0, this.y + dy);
    this.pose();
  }

  /** Down onto whatever is under it. */
  settle() {
    const below = this.sandbox.surfaceBelow(this.x, 0.1, this.y + 0.05);
    this.y = below.y;
    this.pose();
  }

  /** What it says for itself, tapped. */
  tap() {
    let leaves = 0, cut = 0;
    for (const b of this.boughs) { leaves += b.leaves.length; if (b.weak < 0.999) cut++; }
    const what = this.kind === 'bush' ? 'Bush' : 'Tree';
    const n = this.boughs.length;
    const state = this.frozenInPlace ? ', frozen in place' : '';
    return `${what}: ${n} ${this.kind === 'bush' ? 'stems' : 'limbs'}, ${leaves} bunches of leaves` + (cut ? `, ${cut} cut into` : '') + state;
  }

  draw(ctx) {
    this.drawWood(ctx);
    this.drawLeaves(ctx, this.sandbox.time);
  }
}

/* ----------------------------------- logs ----------------------------------- */

/**
 * What came off a tree: a body along the bough it came off at (and, a trunk,
 * the rest of the trunk above that), with everything that grew off it still
 * on it, just as it was when it came off.
 */
export class Log extends Wood {
  constructor(sb, set, from, o = {}) {
    super(sb);
    const root = set[0];
    this.id = nextPlant++;
    this.kind = 'log';
    this.boughs = set;
    this.name = root.depth === 0 ? (from.kind !== 'log' && set.length > 3 ? 'Fallen tree' : 'Log') : root.r0 >= 0.04 ? 'Branch' : 'Twig';
    this.age = 0;
    this.body = new Body(0.1, 0.1, 1, { x: root.x, y: root.y, rot: root.ang, owner: this, friction: 0.75, restitution: 0.05, angularDamping: 0.5 });
    this.refit();
    const b = this.body;
    // moving as it was: off a log, as the log was; off a tree, going over the way it was pushed (or leans)
    if (from.body) {
      const v = from.body.velAt(b.pos.x, b.pos.y);
      b.vel.x = v.x; b.vel.y = v.y; b.angVel = from.body.angVel;
    } else {
      const lean = Math.sign(o.dx || 0) || (root.c >= 0 ? 1 : -1);
      b.angVel = clamp(root.w || 0, -2, 2) * 0.5 - lean * (root.depth === 0 ? 0.3 : 0.12);
      b.vel.x = (o.dx || 0) * 0.3;
    }
    for (const q of set) q.w = 0;
  }

  get pos() { return this.body.pos; }
  get loose() { return !this.removed; }

  /**
   * The body made to fit: along the root bough and on up through whatever
   * carries straight on from its tip (a trunk's next length), as thick as
   * the root, as heavy as all of it - with every bough fixed on it where it
   * is in the world now.
   */
  refit() {
    const root = this.boughs[0];
    const spine = [root];
    for (let last = root; ;) {
      const next = last.kids.find((k) => k.at >= last.len - CELL * 1.5 && k.depth === last.depth && Math.abs(angDiff(k.ang, last.ang)) < 0.35);
      if (!next) break;
      spine.push(next);
      last = next;
    }
    this.spine = new Set(spine);
    const end = spine[spine.length - 1];
    const tip = this.at(end, end.len);
    const len = Math.max(0.06, (tip.x - root.x) * root.c + (tip.y - root.y) * root.s);
    const thick = Math.max(0.03, 2 * root.r0 * 0.85);
    let mass = 0;
    for (const q of this.boughs) {
      let alive = 0, solid = 0;
      for (let n = 0; n < q.hp.length; n++) if (q.solid[n]) { solid++; if (q.hp[n] > 0) alive++; }
      mass += WOOD * Math.PI * ((q.r0 + q.r1) / 2) ** 2 * q.len * (solid ? alive / solid : 1) + q.leaves.length * LEAF_MASS;
    }
    const b = this.body;
    b.rot = root.ang;
    b.pos.x = root.x + root.c * len / 2;
    b.pos.y = root.y + root.s * len / 2;
    b.w = len;
    b.h = thick;
    b.setKinematic(this.frozenInPlace, clamp(mass, 0.15, 220));
    for (const q of this.boughs) {
      const l = b.toLocal(q.x, q.y);
      q.lx = l.x; q.ly = l.y; q.la = q.ang - root.ang;
    }
  }

  /** Every bough where the body has it now. */
  pose() {
    const b = this.body;
    for (const q of this.boughs) {
      const p = b.toWorld(q.lx, q.ly);
      q.x = p.x; q.y = p.y; q.ang = b.rot + q.la;
      q.c = Math.cos(q.ang); q.s = Math.sin(q.ang);
    }
  }

  /** A knock on a log pushes it, like any body. */
  shake(b, x, y, ix, iy) {
    if (this.frozenInPlace) return;
    this.body.applyImpulse(ix * 2, iy * 2, x, y);
  }

  /** After a cut: what is left fitted again - or, the root gone, what is left in logs of its own. */
  reweigh() {
    if (this.removed) return;
    const roots = this.boughs.filter((q) => !q.parent);
    if (this.boughs.length && roots.length === 1 && roots[0] === this.boughs[0]) { this.refit(); return; }
    for (const r of roots) this.fall(r);
    this.sandbox.remove(this, { quiet: true });
  }

  update(dt) {
    this.age += dt;
    this.pose();
    // branches on the side it lands on break off under it
    const sb = this.sandbox;
    for (const q of [...this.boughs]) {
      if (this.spine.has(q) || q.gone || !this.boughs.includes(q)) continue;
      const tip = this.at(q, q.len), mid = this.at(q, q.len / 2);
      if (Math.min(tip.y, mid.y) > 0.005) continue;
      const set = order([q]);
      if (q.parent) q.parent.kids = q.parent.kids.filter((k) => k !== q);
      for (const w of [...sb.wires]) if ([w.a, w.b].some((e) => e.kind === 'body' && e.t === this && set.some((z) => this.near(z, e)))) w.snap('cut');
      for (const z of set) {
        z.gone = true;
        for (const lf of z.leaves) this.shed(z, lf, 2);
        const p = this.at(z, z.len / 2);
        sb.fx.bits(p.x, Math.max(0.02, p.y), Math.max(1, Math.round(z.len / 0.12)), BARK.twig, rand(-0.8, 0.8), rand(0.5, 1.5), { size: Math.max(0.012, z.r0 * 1.2) });
      }
      this.boughs = this.boughs.filter((z) => !set.includes(z));
      sb.emit('snapBough', { what: this, x: tip.x, y: Math.max(0, tip.y), big: q.r0 >= 0.03 });
    }
  }

  /** Whether a wire end tied to this log is on bough z. */
  near(z, e) {
    const p = this.body.toWorld(e.lx, e.ly);
    const l = this.local(z, p.x, p.y);
    return l.u >= -0.02 && l.u <= z.len + 0.02 && Math.abs(l.v) <= radiusAt(z, l.u) + 0.03;
  }

  /** Moved by (dx, dy), as it is. */
  shift(dx, dy) {
    this.body.pos.x += dx;
    this.body.pos.y += dy;
    this.pose();
  }

  tap() {
    let leaves = 0;
    for (const b of this.boughs) leaves += b.leaves.length;
    return `${this.name}, ${Math.round(this.body.mass)} kg` + (leaves ? ', still in leaf' : '') + (this.frozenInPlace ? ', frozen in place' : '');
  }

  draw(ctx) {
    this.pose();
    this.drawWood(ctx);
    this.drawLeaves(ctx, 0);
  }
}

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** A tree (or a bush) drawn whole, its foot at (x, y), to fit in `h` (tall and wide): for the spawn menu. */
export function drawPlantShape(ctx, kind, x, y, h, seed = 11) {
  const fake = { fx: { bits() {} }, time: 0, wires: [], logs: [], people: [], emit() {}, surfaceBelow: () => ({ y: 0 }) };
  const p = new Plant(fake, kind, 0, 0, seed);
  const bb = p.bounds();
  const k = h / Math.max(bb.y1, bb.x1 - bb.x0);
  ctx.save();
  ctx.translate(x - k * (bb.x0 + bb.x1) / 2, y);
  ctx.scale(k, -k);
  p.draw(ctx);
  ctx.restore();
}
