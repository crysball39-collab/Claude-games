/* =============================================================================
   Walls - wood, metal and glass - that come apart a piece at a time.

   A wall is a grid of cells a few centimetres across: the pixels it is drawn
   with, and the bits it breaks into. Every bullet, blow, body and blast takes
   something out of the cells it reaches - how much depends on what the wall
   is made of - and a cell with nothing left goes: splinters off wood, a
   scrap of steel and a spark, shards off glass. Where a bullet went in, where
   something hit it hard, it shows: a hole, a dent, a crack.

   What holds a wall up is its bottom row, standing on whatever is under it.
   Anything no longer joined to that, through the cells that are left, comes
   away as a piece of its own - a slab like the wall, but loose: it falls,
   tumbles, lands and breaks further, and lands on whoever is underneath. A
   wall cut through at the bottom comes away whole, and goes over. Glass does
   not wear through: crack it enough and the whole pane comes down at once.

   To the physics (rigid.js) each slab is one box, round the cells it has
   left. Narrow as a wall is, that is near enough what it is: anything that
   gets all the way through it cuts it in two.
   ========================================================================== */
import { Body } from '../physics/rigid.js';
import { defineArm } from './props.js';
import { clamp, rand, chance } from '../core/util.js';

/** How big a cell is, in metres. */
export const CELL = 0.04;
// pixels of picture for every cell
const PX = 6;
// a piece smaller than this is not a piece: it goes to bits
const CRUMBS = 5;

/**
 * What each is made of:
 *   mass      kg a cell
 *   tough     how much it takes to knock a cell out
 *   resist    how much of a bullet's energy each cell it goes through takes
 *   take      how much of each kind of harm gets through to the cells
 *   bits      the colours of what comes off it
 */
export const MATERIALS = {
  wood: {
    name: 'wood', mass: 0.1, tough: 1, resist: 0.07, friction: 0.7, restitution: 0.05,
    take: { bullet: 0.2, blade: 1.1, blunt: 0.85, impact: 0.7, blast: 1.2 },
    bits: ['#c08a52', '#9a6a3a', '#d9a464'],
  },
  metal: {
    name: 'metal', mass: 0.45, tough: 6, resist: 0.42, friction: 0.45, restitution: 0.12,
    take: { bullet: 0.5, blade: 0.06, blunt: 0.3, impact: 0.22, blast: 1 },
    bits: ['#8d969e', '#5f676d', '#b9c0c6'],
  },
  glass: {
    name: 'glass', mass: 0.2, tough: 0.32, resist: 0.03, friction: 0.3, restitution: 0.02, brittle: true,
    take: { bullet: 1, blade: 0.7, blunt: 1, impact: 1, blast: 1 },
    bits: ['#cfe9f5', '#a9d4ea', '#eef8fc'],
  },
};

/** The three walls: what each is called, made of, and how big it is (wide, tall). */
export const WALLS = {
  woodWall: { name: 'Wood Wall', mat: 'wood', w: 0.24, h: 2.4 },
  metalWall: { name: 'Metal Wall', mat: 'metal', w: 0.2, h: 2.4 },
  glassWall: { name: 'Glass Wall', mat: 'glass', w: 0.16, h: 2.4 },
};
export const isWall = (kind) => !!WALLS[kind];

// what a shard of glass does to somebody it falls on, or who goes through a pane
defineArm('glass', {
  name: 'Glass', noun: 'glass', wound: 'Glass', cause: 'cut by glass', blade: true, sharp: 0.9, mult: 0.6, gash: 0, sever: 0,
  shove: 0.2, spray: 0.7, scary: 0, nasty: 0.4,
});

let nextId = 1;

export class Slab {
  /**
   * A wall of `type` (a WALLS key) standing with the middle of its foot at
   * (x, y) - or, with o.from, a piece of another slab: o.grid its cells
   * ({ cols, rows, hp, marks }), o.at the middle of them in the world, o.rot
   * and o.vel how it was lying and moving.
   */
  constructor(sb, type, x, y, o = {}) {
    const spec = WALLS[type];
    this.id = nextId++;
    this.sandbox = sb;
    this.type = type;
    this.spec = spec;
    this.mat = MATERIALS[spec.mat];
    this.kind = o.from ? 'piece' : 'wall';
    this.name = o.from ? `Piece of ${spec.name.toLowerCase()}` : spec.name;
    this.removed = false;
    this.frozenInPlace = false;
    this.anchored = !o.from;      // standing, held up by its bottom row: the physics never moves it
    this.strain = o.strain || 0;  // glass: how cracked it is (1, and it gives)
    this.stains = [];             // blood, in cells: { c, r, r0, a, flat, dark, tint }
    this.thrownBy = null;
    this.thrownAt = -99;
    this.lastSound = -99;
    this.age = 0;
    this.tex = null;
    this.dirty = true;
    if (o.grid) {
      this.cols = o.grid.cols;
      this.rows = o.grid.rows;
      this.hp = o.grid.hp;
      this.marks = o.grid.marks || [];
    } else {
      this.cols = Math.round(spec.w / CELL);
      this.rows = Math.round(spec.h / CELL);
      this.hp = new Float32Array(this.cols * this.rows).fill(1);
      this.marks = [];            // { c, r (fractional), kind: 'hole' | 'dent' | 'crack', s, a }
    }
    this.seed = o.seed ?? Math.floor(rand(0, 1e6));
    // the box round what is left, and where it sits in the grid
    this.ox = 0;
    this.oy = 0;
    const gw = this.cols * CELL, gh = this.rows * CELL;
    const at = o.at || { x, y: y + gh / 2 };
    const mass = this.anchored ? Infinity : 1;
    this.body = new Body(gw, gh, mass, {
      x: at.x, y: at.y, rot: o.rot || 0, owner: this, friction: this.mat.friction, restitution: this.mat.restitution, angularDamping: 0.6,
    });
    if (o.vel) { this.body.vel.x = o.vel.x; this.body.vel.y = o.vel.y; this.body.angVel = o.vel.w || 0; }
    sb.phys.add(this.body);
    this.fit();
  }

  get pos() { return this.body.pos; }
  get loose() { return !this.anchored && !this.removed; }
  get gw() { return this.cols * CELL; }
  get gh() { return this.rows * CELL; }
  get alive() { let n = 0; for (let i = 0; i < this.hp.length; i++) if (this.hp[i] > 0) n++; return n; }
  /** Whether people can see through it. */
  get clear() { return this.mat.brittle; }

  idx(c, r) { return r * this.cols + c; }
  cellOk(c, r) { return c >= 0 && r >= 0 && c < this.cols && r < this.rows && this.hp[r * this.cols + c] > 0; }

  /** The middle of the grid, in the world. */
  gridCentre() {
    const b = this.body, c = Math.cos(b.rot), s = Math.sin(b.rot);
    return { x: b.pos.x - (c * this.ox - s * this.oy), y: b.pos.y - (s * this.ox + c * this.oy) };
  }

  /** A world point as a place in the grid: { gx, gy } in metres from its bottom left corner. */
  toGrid(wx, wy) {
    const l = this.body.toLocal(wx, wy);
    return { gx: l.x + this.ox + this.gw / 2, gy: l.y + this.oy + this.gh / 2 };
  }

  /** A point in the grid (metres from its bottom left corner), in the world. */
  fromGrid(gx, gy) {
    return this.body.toWorld(gx - this.gw / 2 - this.ox, gy - this.gh / 2 - this.oy);
  }

  /** The middle of cell (c, r), in the world. */
  cellWorld(c, r) {
    return this.body.toWorld((c + 0.5) * CELL - this.gw / 2 - this.ox, (r + 0.5) * CELL - this.gh / 2 - this.oy);
  }

  /**
   * The box made to fit what is left: its size, its middle, its weight. The
   * grid stays where it is in the world while the box round it shrinks.
   */
  fit() {
    let c0 = Infinity, c1 = -1, r0 = Infinity, r1 = -1, n = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.hp[r * this.cols + c] <= 0) continue;
        n++;
        if (c < c0) c0 = c; if (c > c1) c1 = c;
        if (r < r0) r0 = r; if (r > r1) r1 = r;
      }
    }
    if (!n) return false;
    const g = this.gridCentre();
    const ox = ((c0 + c1 + 1) / 2) * CELL - this.gw / 2, oy = ((r0 + r1 + 1) / 2) * CELL - this.gh / 2;
    const b = this.body, cs = Math.cos(b.rot), sn = Math.sin(b.rot);
    this.ox = ox;
    this.oy = oy;
    b.pos.x = g.x + cs * ox - sn * oy;
    b.pos.y = g.y + sn * ox + cs * oy;
    b.w = (c1 - c0 + 1) * CELL;
    b.h = (r1 - r0 + 1) * CELL;
    this.box = { c0, c1, r0, r1 };
    // standing, nothing moves it; loose, it weighs what is left of it; frozen in place, it weighs that but goes nowhere
    if (this.anchored) b.setKinematic(false, Infinity);
    else b.setKinematic(this.frozenInPlace, n * this.mat.mass);
    this.cellCount = n;
    return true;
  }

  contains(x, y, r = 0) {
    if (!this.body.contains(x, y, r)) return false;
    const g = this.toGrid(x, y);
    const c = Math.floor(g.gx / CELL), rr = Math.floor(g.gy / CELL), k = Math.ceil(r / CELL);
    for (let dr = -k; dr <= k; dr++) for (let dc = -k; dc <= k; dc++) if (this.cellOk(c + dc, rr + dr)) return true;
    return false;
  }

  /** Going from (x, y) along (dx, dy), the first point in what is left of it, within `max`: where a blow lands. */
  firstSolid(x, y, dx, dy, max) {
    for (let t = 0; t <= max; t += CELL * 0.5) {
      if (this.contains(x + dx * t, y + dy * t, 0)) return { x: x + dx * t, y: y + dy * t };
    }
    return null;
  }

  /* ------------------------------- being hurt ------------------------------- */

  /**
   * Harm reaching the cells round (x, y), out to r: `amount` of `kind`
   * ('bullet', 'blade', 'blunt', 'impact', 'blast'), falling off toward the
   * edge. Returns how many cells went.
   */
  damage(x, y, r, amount, kind = 'blunt', o = {}) {
    if (this.removed || amount <= 0) return 0;
    const take = (this.mat.take[kind] ?? 1) * amount / this.mat.tough;
    const g = this.toGrid(x, y);
    const k = Math.ceil(r / CELL) + 1;
    const c0 = Math.floor(g.gx / CELL), r0 = Math.floor(g.gy / CELL);
    let gone = 0, hit = 0;
    for (let dr = -k; dr <= k; dr++) {
      for (let dc = -k; dc <= k; dc++) {
        const c = c0 + dc, rr = r0 + dr;
        if (!this.cellOk(c, rr)) continue;
        const d = Math.hypot((c + 0.5) * CELL - g.gx, (rr + 0.5) * CELL - g.gy);
        if (d > r) continue;
        const i = this.idx(c, rr);
        hit++;
        this.hp[i] -= take * Math.sqrt(1 - d / r) * rand(0.75, 1.25);
        if (this.hp[i] <= 0) { this.hp[i] = 0; gone++; this.bits(c, rr, o.dx || 0, o.dy || 0, o.speed || 1); }
      }
    }
    if (!hit) return 0;
    // glass: every knock cracks it further
    if (this.mat.brittle) {
      this.strain += take * 0.22 + gone * 0.035;
      if (o.mark !== false) this.mark(g.gx / CELL, g.gy / CELL, 'crack', clamp(take, 0.4, 2.5));
    } else if (o.mark !== false && kind !== 'blast') {
      this.mark(g.gx / CELL, g.gy / CELL, this.mat.name === 'metal' ? 'dent' : 'chip', clamp(take * 2, 0.4, 1.6));
    }
    this.dirty = true;
    this.after(o);
    return gone;
  }

  /**
   * A bullet going in at (x, y) along (dx, dy) with `energy`, out to `max`:
   * cell by cell through whatever is left of it, each taking its share of
   * the energy and of the cell. Returns { energy, out } - what it comes out
   * with, and how far along it came out (or stopped).
   */
  bullet(x, y, dx, dy, energy, max) {
    const step = CELL * 0.5;
    let t = 0, first = null, last = null, lastCell = -1;
    const take = this.mat.take.bullet / this.mat.tough;
    while (t <= max && energy > 0.15) {
      const px = x + dx * t, py = y + dy * t;
      const g = this.toGrid(px, py);
      const c = Math.floor(g.gx / CELL), r = Math.floor(g.gy / CELL);
      const i = c >= 0 && r >= 0 && c < this.cols && r < this.rows ? this.idx(c, r) : -1;
      if (i >= 0 && i !== lastCell && this.hp[i] > 0) {
        lastCell = i;
        if (!first) first = { x: px, y: py, c: g.gx / CELL, r: g.gy / CELL };
        last = { x: px, y: py, c: g.gx / CELL, r: g.gy / CELL, t };
        // (glass: it goes straight through, cracking what is round the hole - one alone does not cut a pane in two)
        this.hp[i] -= this.mat.brittle ? Math.min(0.8, energy * take) : energy * take;
        if (this.hp[i] <= 0) { this.hp[i] = 0; this.bits(c, r, dx, dy, 2); }
        energy -= this.mat.resist;
      }
      t += step;
    }
    if (!first) return { energy, out: max, hit: false };
    this.mark(first.c, first.r, this.mat.name === 'metal' ? 'dent' : 'hole', 1);
    if (energy > 0.15 && last) this.mark(last.c, last.r, this.mat.name === 'metal' ? 'dent' : 'hole', 1.2);
    if (this.mat.brittle) {
      this.strain += 0.3;
      this.mark(first.c, first.r, 'crack', 1.6);
    }
    this.dirty = true;
    this.after({ dx, dy, speed: 2 });
    return { energy: Math.max(0, energy), out: last ? last.t + step : max, hit: true, at: first };
  }

  /** Something hitting it at `speed` m/s with `mass` kg behind it, at (x, y), going along (dx, dy). */
  impact(x, y, speed, mass, dx = 0, dy = 0) {
    if (speed < 2.5) return 0;
    const e = 0.5 * Math.min(mass, 120) * speed * speed;
    // glass gives to far less than wood, and steel to hardly anything at all
    const amount = e / 260;
    if (amount < 0.05) return 0;
    const r = clamp(0.05 + Math.sqrt(e) * 0.004, 0.05, 0.22);
    return this.damage(x, y, r, amount, 'impact', { dx, dy, speed: speed * 0.3 });
  }

  /** A mark where something landed: in cells, fractional. */
  mark(c, r, kind, s = 1) {
    if (this.marks.length > 90) this.marks.splice(this.marks.findIndex((m) => m.kind !== 'crack') >>> 0, 1);
    this.marks.push({ c, r, kind, s, a: rand(0, Math.PI * 2), n: Math.floor(rand(3, 6)) });
  }

  /** What comes off a cell that went: splinters, scraps, shards. */
  bits(c, r, dx, dy, speed = 1) {
    const fx = this.sandbox.fx, p = this.cellWorld(c, r);
    const cols = this.mat.bits;
    fx.bits(p.x, p.y, chance(0.5) ? 2 : 1, cols[Math.floor(Math.random() * cols.length)], dx * speed + rand(-1, 1), dy * speed + rand(0, 1.6), {
      size: CELL * rand(0.35, 0.6), sharp: this.mat.brittle, glow: this.mat.name === 'metal' && chance(0.35),
    });
  }

  /**
   * After cells have gone: glass that is cracked enough comes down; anything
   * no longer joined to what holds the rest up comes away; the box shrinks
   * to what is left.
   */
  after(o = {}) {
    if (this.removed) return;
    if (this.mat.brittle && this.strain >= 1) { this.shatter(o); return; }
    this.split(o);
  }

  /** Every cell left, in pieces joined to each other: [[index, ...], ...]. */
  parts() {
    const seen = new Uint8Array(this.hp.length), out = [];
    const stack = [];
    for (let i = 0; i < this.hp.length; i++) {
      if (this.hp[i] <= 0 || seen[i]) continue;
      const part = [];
      stack.push(i);
      seen[i] = 1;
      while (stack.length) {
        const j = stack.pop();
        part.push(j);
        const c = j % this.cols, r = (j - c) / this.cols;
        for (const [nc, nr] of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]) {
          if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
          const k = nr * this.cols + nc;
          if (!seen[k] && this.hp[k] > 0) { seen[k] = 1; stack.push(k); }
        }
      }
      out.push(part);
    }
    return out;
  }

  split(o = {}) {
    const parts = this.parts();
    if (!parts.length) { this.sandbox.remove(this, { quiet: true }); return; }
    // what stays this slab: standing, the part on its bottom row (the biggest, if more than one is);
    // loose, the biggest part
    const standing = (p) => p.some((i) => i < this.cols);
    let keep = null;
    if (this.anchored) {
      for (const p of parts) if (standing(p) && (!keep || p.length > keep.length)) keep = p;
    } else {
      for (const p of parts) if (!keep || p.length > keep.length) keep = p;
    }
    // nothing left standing on the bottom row: the whole of it goes over
    if (!keep) {
      this.anchored = false;
      keep = parts.reduce((a, b) => (b.length > a.length ? b : a));
      this.body.setMass(1);
      this.sandbox.emit('slabFree', { what: this, x: this.pos.x, y: this.pos.y });
    }
    for (const p of parts) {
      if (p === keep) continue;
      if (this.anchored && standing(p)) this.breakAway(p, true);
      else this.breakAway(p, false, o);
    }
    if (keep.length < CRUMBS && !this.anchored) {
      for (const i of keep) { this.crumb(i); this.hp[i] = 0; }
      this.sandbox.remove(this, { quiet: true });
      return;
    }
    this.fit();
  }

  /** A cell gone to bits. */
  crumb(i) {
    const c = i % this.cols, r = (i - c) / this.cols;
    this.bits(c, r, 0, 0.5, 1);
  }

  /** The cells of part `p` out of this slab and into one of their own (standing, if `stands`). */
  breakAway(p, stands, o = {}) {
    if (p.length < CRUMBS && !stands) {
      for (const i of p) { this.crumb(i); this.hp[i] = 0; }
      return null;
    }
    let c0 = Infinity, c1 = -1, r0 = Infinity, r1 = -1;
    for (const i of p) {
      const c = i % this.cols, r = (i - c) / this.cols;
      if (c < c0) c0 = c; if (c > c1) c1 = c;
      if (r < r0) r0 = r; if (r > r1) r1 = r;
    }
    const cols = c1 - c0 + 1, rows = r1 - r0 + 1;
    const hp = new Float32Array(cols * rows);
    for (const i of p) {
      const c = i % this.cols, r = (i - c) / this.cols;
      hp[(r - r0) * cols + (c - c0)] = this.hp[i];
      this.hp[i] = 0;
    }
    const marks = this.marks.filter((m) => m.c >= c0 && m.c < c1 + 1 && m.r >= r0 && m.r < r1 + 1).map((m) => ({ ...m, c: m.c - c0, r: m.r - r0 }));
    const stains = this.stains.filter((s) => s.c >= c0 && s.c < c1 + 1 && s.r >= r0 && s.r < r1 + 1).map((s) => ({ ...s, c: s.c - c0, r: s.r - r0 }));
    // the middle of it, in the world, and how fast that is moving
    const b = this.body;
    const mid = b.toWorld(((c0 + c1 + 1) / 2) * CELL - this.gw / 2 - this.ox, ((r0 + r1 + 1) / 2) * CELL - this.gh / 2 - this.oy);
    const v = b.velAt(mid.x, mid.y);
    const kick = o.dx || o.dy ? { x: (o.dx || 0) * 0.6, y: (o.dy || 0) * 0.6 } : { x: 0, y: 0 };
    const piece = this.sandbox.addSlab(new Slab(this.sandbox, this.type, 0, 0, {
      from: this, grid: { cols, rows, hp, marks }, at: mid, rot: b.rot, seed: this.seed + c0 * 31 + r0 * 17,
      vel: { x: v.x + kick.x + rand(-0.2, 0.2), y: v.y + kick.y, w: b.angVel + rand(-0.6, 0.6) }, strain: this.strain,
    }));
    if (!piece) return null;
    piece.stains = stains;
    piece.paintFrom = { src: this, c0, r0 };
    if (stands) {
      // standing on its own bottom row, like the wall it was part of
      piece.anchored = true;
      piece.kind = 'wall';
      piece.name = this.spec.name;
      piece.body.setMass(Infinity);
      piece.body.vel.x = piece.body.vel.y = piece.body.angVel = 0;
    } else {
      // (for a moment it passes through what it came off, so the two do not fly apart)
      piece.body.ignore = new Set([b]);
      piece.unIgnoreT = 0.25;
      this.sandbox.emit('slabBreak', { what: this, piece, x: mid.x, y: mid.y, cells: p.length });
    }
    return piece;
  }

  /** Glass that has had enough: the whole pane, down in shards. */
  shatter(o = {}) {
    const fx = this.sandbox.fx;
    const b = this.body;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const i = this.idx(c, r);
        if (this.hp[i] <= 0) continue;
        this.hp[i] = 0;
        if (chance(0.55)) continue;
        const p = this.cellWorld(c, r), v = b.velAt(p.x, p.y);
        fx.bits(p.x, p.y, 1, this.mat.bits[(c + r) % 3], v.x + (o.dx || 0) * rand(0.5, 2.5) + rand(-1.4, 1.4), v.y + (o.dy || 0) * rand(0.5, 2) + rand(-0.5, 1.5), {
          size: CELL * rand(0.6, 1.3), sharp: true, spin: true,
        });
      }
    }
    this.sandbox.emit('glassShatter', { what: this, x: b.pos.x, y: b.pos.y });
    this.sandbox.remove(this, { quiet: true });
  }

  /** Blood landing on it: kept on the cell it landed on. */
  stain(wx, wy, r, tint = null) {
    const g = this.toGrid(wx, wy);
    const c = g.gx / CELL, rr = g.gy / CELL;
    if (!this.cellOk(Math.floor(c), Math.floor(rr))) return;
    for (const s of this.stains) {
      if (s.tint === tint && Math.hypot(s.c - c, s.r - rr) * CELL < s.r0) { s.r0 = Math.min(0.07, s.r0 + r * 0.15); this.dirty = true; return; }
    }
    if (this.stains.length > 60) this.stains.shift();
    this.stains.push({ c, r: rr, r0: r, a: rand(0, Math.PI), flat: rand(0.55, 1), dark: chance(0.3), tint });
    this.dirty = true;
  }

  /* --------------------------------- moving --------------------------------- */

  /** Moved by (dx, dy), as it is: by the hand, or with the world paused. */
  shift(dx, dy) {
    this.body.pos.x += dx;
    this.body.pos.y += dy;
  }

  /**
   * Down onto whatever is under it, standing - unless it is frozen in place,
   * which keeps it wherever it was put.
   */
  settle() {
    if (!this.anchored || this.frozenInPlace) return;
    const b = this.body, half = b.w / 2;
    const below = this.sandbox.surfaceBelow(b.pos.x, half * 0.8, b.pos.y - b.h / 2 + 0.05, this);
    b.pos.y = below.y + b.h / 2;
  }

  /* -------------------------------- the hand -------------------------------- */

  /**
   * Taken hold of by the hand from above at (x, y). A loose piece is a body
   * like a crate, and swings from the hand; a standing wall is slid where it
   * is dragged, upright, and stands on whatever is under it when let go.
   */
  handGrab(x, y) {
    if (!this.anchored) return 'body';
    this.grabOff = { x: this.body.pos.x - x, y: this.body.pos.y - y };
    return 'self';
  }

  /** Held at (x, y): it goes there, pushing aside whatever it runs into on the way. */
  handHold(x, y, dt) {
    const b = this.body, o = this.grabOff || { x: 0, y: 0 };
    const tx = x + o.x, ty = Math.max(y + o.y, b.h / 2 + 0.002);
    // how fast it went is what it pushes with
    b.vel.x = clamp((tx - b.pos.x) / dt, -8, 8);
    b.vel.y = clamp((ty - b.pos.y) / dt, -8, 8);
    b.pos.x = tx;
    b.pos.y = ty;
  }

  handRelease() {
    this.grabOff = null;
    this.body.vel.x = this.body.vel.y = 0;
    this.settle();
  }

  /** What it says for itself, tapped. */
  tap() {
    const n = this.cellCount || this.alive, of = this.cols * this.rows;
    const left = Math.round((n / of) * 100);
    const what = this.kind === 'piece' ? this.name : this.spec.name;
    const state = this.frozenInPlace ? ', frozen in place' : this.anchored ? '' : ', lying loose';
    if (this.mat.brittle) {
      const crack = this.strain > 0.6 ? 'cracked right through' : this.strain > 0.25 ? 'cracked' : this.marks.length ? 'chipped' : 'not a scratch on it';
      return `${what}: ${crack}${state}`;
    }
    return `${what}: ${left}% of it left, ${this.marks.length} mark${this.marks.length === 1 ? '' : 's'} in it${state}`;
  }

  update(dt) {
    this.age += dt;
    if (this.unIgnoreT !== undefined && (this.unIgnoreT -= dt) <= 0) { this.body.ignore = null; this.unIgnoreT = undefined; }
    // nothing holds a standing slab up but what it stands on: knocked about, it stays put
    if (this.anchored) { this.body.vel.x = this.body.vel.y = this.body.angVel = 0; }
  }

  /* --------------------------------- drawing -------------------------------- */

  draw(ctx) {
    if (typeof document === 'undefined') return;
    if (!this.base) this.base = this.paintFrom ? cropOf(this.paintFrom, this.cols, this.rows) : paint(this);
    if (this.dirty || !this.tex) this.redraw();
    const b = this.body;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(b.rot);
    ctx.translate(-this.ox, -this.oy);
    ctx.scale(1, -1);
    ctx.drawImage(this.tex, -this.gw / 2, -this.gh / 2, this.gw, this.gh);
    ctx.restore();
  }

  /** The picture as it is now: the cells that are left, worn as far as they are, and what landed on them. */
  redraw() {
    this.dirty = false;
    const W = this.cols * PX, H = this.rows * PX;
    if (!this.tex) { this.tex = document.createElement('canvas'); this.tex.width = W; this.tex.height = H; }
    const g = this.tex.getContext('2d');
    g.clearRect(0, 0, W, H);
    g.drawImage(this.base, 0, 0);
    const y = (r) => (this.rows - 1 - r) * PX;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const h = this.hp[r * this.cols + c];
        if (h <= 0) g.clearRect(c * PX, y(r), PX, PX);
        else if (h < 0.92 && !this.mat.brittle) {
          g.fillStyle = `rgba(20, 14, 8, ${((1 - h) * 0.45).toFixed(3)})`;
          g.fillRect(c * PX, y(r), PX, PX);
        }
      }
    }
    // only on what is still there
    g.save();
    g.globalCompositeOperation = 'source-atop';
    for (const m of this.marks) drawMark(g, this, m, (m.c) * PX, (this.rows - m.r) * PX);
    for (const s of this.stains) {
      g.fillStyle = s.tint ? s.tint[s.dark ? 1 : 0] : s.dark ? 'rgba(110, 7, 16, 0.9)' : 'rgba(163, 16, 28, 0.85)';
      g.beginPath();
      g.ellipse(s.c * PX, (this.rows - s.r) * PX, (s.r0 / CELL) * PX, (s.r0 / CELL) * PX * s.flat, s.a, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
}

/** A mark drawn on a slab's picture at (x, y), in its pixels. */
function drawMark(g, s, m, x, y) {
  const k = m.s * PX;
  if (m.kind === 'hole') {
    g.fillStyle = s.mat.name === 'glass' ? 'rgba(255,255,255,0.5)' : '#2a1a0e';
    g.beginPath(); g.arc(x, y, k * 0.45, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(40, 24, 10, 0.55)';
    g.lineWidth = 1;
    for (let i = 0; i < m.n; i++) {
      const a = m.a + (i / m.n) * Math.PI * 2;
      g.beginPath(); g.moveTo(x + Math.cos(a) * k * 0.4, y + Math.sin(a) * k * 0.4); g.lineTo(x + Math.cos(a) * k * 1.1, y + Math.sin(a) * k * 1.1); g.stroke();
    }
  } else if (m.kind === 'dent') {
    g.fillStyle = 'rgba(30, 34, 38, 0.65)';
    g.beginPath(); g.arc(x, y, k * 0.42, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(235, 240, 244, 0.75)';
    g.lineWidth = 1.2;
    g.beginPath(); g.arc(x, y, k * 0.62, m.a, m.a + 2.2); g.stroke();
  } else if (m.kind === 'chip') {
    g.fillStyle = 'rgba(60, 36, 16, 0.45)';
    g.beginPath(); g.ellipse(x, y, k * 0.7, k * 0.4, m.a, 0, Math.PI * 2); g.fill();
  } else if (m.kind === 'crack') {
    g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    g.lineWidth = 1;
    for (let i = 0; i < m.n + 2; i++) {
      let a = m.a + (i / (m.n + 2)) * Math.PI * 2, px = x, py = y;
      g.beginPath(); g.moveTo(px, py);
      for (let j = 0; j < 3; j++) {
        a += (Math.sin(m.a * 7 + i * 3 + j) * 0.5);
        px += Math.cos(a) * k * 1.4; py += Math.sin(a) * k * 1.4;
        g.lineTo(px, py);
      }
      g.stroke();
    }
  }
}

/** A piece's picture: the part of what it came off that it was. */
function cropOf(from, cols, rows) {
  const src = from.src;
  if (!src.base) src.base = src.paintFrom ? cropOf(src.paintFrom, src.cols, src.rows) : paint(src);
  const cv = document.createElement('canvas');
  cv.width = cols * PX; cv.height = rows * PX;
  // (rows count up from the bottom; the picture's from the top)
  const sy = (src.rows - from.r0 - rows) * PX;
  cv.getContext('2d').drawImage(src.base, from.c0 * PX, sy, cols * PX, rows * PX, 0, 0, cols * PX, rows * PX);
  return cv;
}

/** A seeded little random, for a slab to look the same every time it is painted. */
function rng(seed) {
  let s = seed | 0 || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** The slab's picture whole, before anything happened to it: planks, a steel plate, a pane. */
function paint(s) {
  const W = s.cols * PX, H = s.rows * PX;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const R = rng(s.seed);
  // the cells it was made with: a piece is painted as the whole wall was, where it was in it
  if (s.mat.name === 'wood') {
    const planks = 2, pw = W / planks;
    for (let i = 0; i < planks; i++) {
      const tone = 0.88 + R() * 0.2;
      g.fillStyle = `rgb(${Math.round(176 * tone)}, ${Math.round(122 * tone)}, ${Math.round(70 * tone)})`;
      g.fillRect(i * pw, 0, pw, H);
      // the grain
      g.strokeStyle = 'rgba(90, 52, 22, 0.35)';
      g.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        const x0 = i * pw + 2 + R() * (pw - 4);
        g.beginPath();
        g.moveTo(x0, 0);
        for (let yy = 0; yy <= H; yy += 12) g.lineTo(x0 + Math.sin(yy * 0.05 + k * 2 + i) * 1.5, yy);
        g.stroke();
      }
      // a knot or two
      for (let k = 0; k < 2; k++) {
        g.fillStyle = 'rgba(96, 58, 26, 0.55)';
        g.beginPath(); g.ellipse(i * pw + pw * (0.3 + R() * 0.4), R() * H, 2.4, 4, 0, 0, Math.PI * 2); g.fill();
      }
    }
    g.fillStyle = 'rgba(60, 34, 14, 0.8)';
    for (let i = 1; i < planks; i++) g.fillRect(i * pw - 0.6, 0, 1.2, H);
    // battens across, nailed on
    for (const yy of [H * 0.12, H * 0.5, H * 0.88]) {
      g.fillStyle = 'rgba(120, 76, 38, 0.95)';
      g.fillRect(0, yy - PX, W, PX * 2);
      g.fillStyle = 'rgba(60, 34, 14, 0.6)';
      g.fillRect(0, yy - PX, W, 1);
      g.fillRect(0, yy + PX - 1, W, 1);
      g.fillStyle = '#3a3a3a';
      for (const xx of [W * 0.25, W * 0.75]) { g.beginPath(); g.arc(xx, yy, 1.1, 0, Math.PI * 2); g.fill(); }
    }
    g.strokeStyle = 'rgba(60, 34, 14, 0.9)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, W - 2, H - 2);
  } else if (s.mat.name === 'metal') {
    const grad = g.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, '#6e767d'); grad.addColorStop(0.45, '#9aa3aa'); grad.addColorStop(1, '#5d646a');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // brushed
    g.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    for (let yy = 0; yy < H; yy += 3) { g.beginPath(); g.moveTo(0, yy + R()); g.lineTo(W, yy + R()); g.stroke(); }
    // panel seams and rivets
    g.fillStyle = 'rgba(40, 44, 48, 0.8)';
    for (const yy of [H / 3, (2 * H) / 3]) g.fillRect(0, yy - 0.6, W, 1.2);
    g.fillStyle = '#4b5258';
    for (let yy = PX; yy < H; yy += PX * 5) for (const xx of [PX * 0.7, W - PX * 0.7]) { g.beginPath(); g.arc(xx, yy, 1.4, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let yy = PX; yy < H; yy += PX * 5) for (const xx of [PX * 0.7, W - PX * 0.7]) { g.beginPath(); g.arc(xx - 0.4, yy - 0.4, 0.6, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(30, 34, 38, 0.9)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, W - 2, H - 2);
  } else {
    g.fillStyle = 'rgba(178, 222, 242, 0.34)';
    g.fillRect(0, 0, W, H);
    // light across it
    g.fillStyle = 'rgba(255, 255, 255, 0.35)';
    for (let k = 0; k < 4; k++) {
      const y0 = R() * H;
      g.beginPath();
      g.moveTo(0, y0); g.lineTo(W, y0 - W * 1.4); g.lineTo(W, y0 - W * 1.4 + 6 + R() * 8); g.lineTo(0, y0 + 6 + R() * 8);
      g.closePath(); g.fill();
    }
    g.strokeStyle = 'rgba(120, 170, 196, 0.85)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, W - 2, H - 2);
  }
  return cv;
}

/**
 * A wall of `type` drawn whole, its foot at (x, y), `h` tall: for the spawn
 * menu, the same planks, plate or pane as the real thing.
 */
export function drawWallShape(ctx, type, x, y, h) {
  if (typeof document === 'undefined') return;
  const spec = WALLS[type];
  const fake = { cols: Math.round(spec.w / CELL), rows: Math.round(spec.h / CELL), seed: 7, mat: MATERIALS[spec.mat] };
  const pic = wallPics[type] || (wallPics[type] = paint(fake));
  const w = h * (spec.w / spec.h);
  ctx.drawImage(pic, x - w / 2, y - h, w, h);
}
const wallPics = {};
