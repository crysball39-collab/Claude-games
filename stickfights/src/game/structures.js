/* =============================================================================
   Walls - wood, metal and glass - that come apart a piece at a time.

   A wall is a grid of cells a few centimetres across: the pixels it is drawn
   with, and the bits it breaks into. Every bullet, blow, body and blast takes
   something out of the cells it reaches - how much depends on what the wall
   is made of - and a cell with nothing left goes: splinters off wood, a
   scrap of steel and a spark, shards off glass. Where a bullet went in, where
   something hit it hard, it shows: a hole, a dent, a crack.

   What holds a wall up is its bottom row, standing on whatever is under it
   (and what holds up a timber of the gallows, gallows.js, is whatever it
   rests on - the post, a leg). Anything no longer joined to that, through
   the cells that are left, comes away as a piece of its own - a slab like
   the wall, but loose: it falls, tumbles, lands and breaks further, and lands
   on whoever is underneath. A wall cut through at the bottom comes away
   whole, and goes over. Glass does not wear through: crack it enough and the
   whole pane comes down at once.

   Taken hold of by the hand, a standing wall comes away from where it stood
   and is a loose body like any other: it hangs from the hand, swings round,
   falls when let go, and tumbles where it lands. Set down upright on its
   foot, it stands again.

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
  // what a city is built of (city.js): its cells are bigger, and much heavier
  concrete: {
    name: 'concrete', mass: 9, tough: 3.2, resist: 0.5, friction: 0.8, restitution: 0.02,
    take: { bullet: 0.25, blade: 0.03, blunt: 0.45, impact: 0.55, blast: 1 },
    bits: ['#b9b6ae', '#8e8b84', '#d2cfc7'], hole: '#3a3936', chip: 'rgba(40, 38, 34, 0.4)',
  },
  brick: {
    name: 'brick', mass: 7, tough: 2.4, resist: 0.42, friction: 0.8, restitution: 0.02,
    take: { bullet: 0.3, blade: 0.04, blunt: 0.55, impact: 0.65, blast: 1.1 },
    bits: ['#9a5a44', '#7b4433', '#b9735a'], hole: '#33211a', chip: 'rgba(52, 28, 20, 0.45)',
  },
  pane: {
    // a window: glass, but in a building - its own cell or so of it gives, not the whole of it
    name: 'glass', mass: 1.2, tough: 0.3, resist: 0.03, friction: 0.3, restitution: 0.02, brittle: true,
    take: { bullet: 1, blade: 0.8, blunt: 1, impact: 1.2, blast: 1.4 },
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

/** Slabs that are not walls: the timbers something is built of (gallows.js), each its own size. */
export const TIMBERS = {
  gallows: { name: 'Gallows', mat: 'wood', w: 0.2, h: 1, timber: true },
};

/**
 * Every kind of slab there is, by type: the walls, the timbers, and whatever
 * else is defined (the buildings of the city, city.js). Besides a name, what
 * it is made of and how big it is, a type may have:
 *   cell, px    how big its cells are (m), and the pixels of picture to each
 *   mats, layout(slab)  more materials than one: layout says which cell is
 *               which (0 its own, 1 the first of mats...) - and may leave
 *               some out from the start
 *   paint(slab) its own picture, whole
 *   background  standing, it is behind the street: people walk and shoot past
 *               it, nothing lands on it or bumps into it - though anything
 *               that comes off it is as solid as anything else
 *   load, span  its storeys bear what is above them: a storey mostly gone, or
 *               a stretch more than `span` metres across with nothing on the
 *               ground under it, gives way
 *   crumbles    a piece of it landing hard breaks up
 *   tear        the hand pulls a lump off it, rather than the whole of it up
 */
export const SLAB_TYPES = { ...WALLS, ...TIMBERS };
export function defineSlab(type, spec) { SLAB_TYPES[type] = spec; return spec; }
// a slab with more cells than this (a building) takes what happens to it in a step all at once, after it
const BIG = 4000;

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
    const spec = SLAB_TYPES[type];
    this.id = nextId++;
    this.sandbox = sb;
    this.type = type;
    this.spec = spec;
    this.mat = MATERIALS[spec.mat];
    this.cs = spec.cell || CELL;
    this.px = spec.px || PX;
    // what each cell is made of, where a slab is made of more than one thing (glass in a building's windows)
    this.mats = [this.mat, ...(spec.mats || []).map((m) => MATERIALS[m])];
    this.cellMat = null;
    this.timber = !!spec.timber;
    this.kind = o.from ? 'piece' : 'wall';
    this.name = o.from ? `Piece of ${spec.name.toLowerCase()}` : o.name || spec.name;
    this.group = o.group || null;  // what it is a part of (a gallows), if anything
    this.removed = false;
    this.frozenInPlace = false;
    this.anchored = !o.from;      // standing, held up: the physics never moves it
    // what holds it up: its bottom row on whatever is under it, or (o.holds) where it rests on other slabs:
    // { ground: true } | { cells: Set of cell indices, by: slab, gx, gy (the point in its grid that rests on that) }
    this.holds = o.from ? [] : o.holds || [{ ground: true }];
    this.strain = o.strain || 0;  // glass: how cracked it is (1, and it gives)
    this.stains = [];             // blood, in cells: { c, r, r0, a, flat, dark, tint }
    this.thrownBy = null;
    this.thrownAt = -99;
    this.lastSound = -99;
    this.age = 0;
    this.tex = null;
    this.dirty = true;
    this.seed = o.seed ?? Math.floor(rand(0, 1e6));
    if (o.grid) {
      this.cols = o.grid.cols;
      this.rows = o.grid.rows;
      this.hp = o.grid.hp;
      this.marks = o.grid.marks || [];
      this.cellMat = o.grid.mat || null;
    } else {
      const size = o.size || spec;
      this.cols = Math.max(1, Math.round(size.w / this.cs));
      this.rows = Math.max(1, Math.round(size.h / this.cs));
      this.hp = new Float32Array(this.cols * this.rows).fill(1);
      this.marks = [];            // { c, r (fractional), kind: 'hole' | 'dent' | 'crack', s, a }
      if (spec.layout) this.cellMat = spec.layout(this);
    }
    this.big = this.cols * this.rows > BIG;
    // (a building: how much of each storey holds it up, as built)
    this.rowBase = spec.load ? this.structure() : null;
    // the box round what is left, and where it sits in the grid
    this.ox = 0;
    this.oy = 0;
    const gw = this.cols * this.cs, gh = this.rows * this.cs;
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
  /** Standing behind the street (a building): nothing in the street touches it, or is stopped by it. */
  get background() { return !!this.spec.background && this.anchored && !this.removed; }
  get gw() { return this.cols * this.cs; }
  get gh() { return this.rows * this.cs; }
  get alive() { let n = 0; for (let i = 0; i < this.hp.length; i++) if (this.hp[i] > 0) n++; return n; }
  /** Whether people can see through it. */
  get clear() { return this.mat.brittle; }

  idx(c, r) { return r * this.cols + c; }
  cellOk(c, r) { return c >= 0 && r >= 0 && c < this.cols && r < this.rows && this.hp[r * this.cols + c] > 0; }
  /** What cell i is made of. */
  matOf(i) { return this.cellMat ? this.mats[this.cellMat[i]] || this.mat : this.mat; }

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
    return this.body.toWorld((c + 0.5) * this.cs - this.gw / 2 - this.ox, (r + 0.5) * this.cs - this.gh / 2 - this.oy);
  }

  /**
   * The box made to fit what is left: its size, its middle, its weight. The
   * grid stays where it is in the world while the box round it shrinks.
   */
  fit() {
    let c0 = Infinity, c1 = -1, r0 = Infinity, r1 = -1, n = 0, mass = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        if (this.hp[i] <= 0) continue;
        n++;
        if (this.cellMat) mass += this.matOf(i).mass;
        if (c < c0) c0 = c; if (c > c1) c1 = c;
        if (r < r0) r0 = r; if (r > r1) r1 = r;
      }
    }
    if (!n) return false;
    const g = this.gridCentre();
    const ox = ((c0 + c1 + 1) / 2) * this.cs - this.gw / 2, oy = ((r0 + r1 + 1) / 2) * this.cs - this.gh / 2;
    const b = this.body, cs = Math.cos(b.rot), sn = Math.sin(b.rot);
    this.ox = ox;
    this.oy = oy;
    b.pos.x = g.x + cs * ox - sn * oy;
    b.pos.y = g.y + sn * ox + cs * oy;
    b.w = (c1 - c0 + 1) * this.cs;
    b.h = (r1 - r0 + 1) * this.cs;
    this.box = { c0, c1, r0, r1 };
    // standing, nothing moves it; loose, it weighs what is left of it; frozen in place, it weighs that but goes nowhere
    if (this.anchored) b.setKinematic(false, Infinity);
    else b.setKinematic(this.frozenInPlace, this.cellMat ? mass : n * this.mat.mass);
    this.cellCount = n;
    return true;
  }

  contains(x, y, r = 0) {
    if (!this.body.contains(x, y, r)) return false;
    const g = this.toGrid(x, y);
    const c = Math.floor(g.gx / this.cs), rr = Math.floor(g.gy / this.cs), k = Math.ceil(r / this.cs);
    for (let dr = -k; dr <= k; dr++) for (let dc = -k; dc <= k; dc++) if (this.cellOk(c + dc, rr + dr)) return true;
    return false;
  }

  /** Going from (x, y) along (dx, dy), the first point in what is left of it, within `max`: where a blow lands. */
  firstSolid(x, y, dx, dy, max) {
    for (let t = 0; t <= max; t += this.cs * 0.5) {
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
    let take = (this.mat.take[kind] ?? 1) * amount / this.mat.tough;
    const g = this.toGrid(x, y);
    const k = Math.ceil(r / this.cs) + 1;
    const c0 = Math.floor(g.gx / this.cs), r0 = Math.floor(g.gy / this.cs);
    let gone = 0, hit = 0;
    // (only what is on the grid: a blast as big as a street need not look at cells there are not)
    for (let rr = Math.max(0, r0 - k), rEnd = Math.min(this.rows - 1, r0 + k); rr <= rEnd; rr++) {
      for (let c = Math.max(0, c0 - k), cEnd = Math.min(this.cols - 1, c0 + k); c <= cEnd; c++) {
        if (!this.cellOk(c, rr)) continue;
        const d = Math.hypot((c + 0.5) * this.cs - g.gx, (rr + 0.5) * this.cs - g.gy);
        if (d > r) continue;
        const i = this.idx(c, rr);
        // (made of more than one thing: each cell takes it as what it is made of)
        let t = take;
        if (this.cellMat) {
          const m = this.matOf(i);
          if (o.only && !o.only(m)) continue;
          t = (m.take[kind] ?? 1) * amount / m.tough;
        }
        hit++;
        this.hp[i] -= t * Math.sqrt(1 - d / r) * rand(0.75, 1.25);
        if (this.hp[i] <= 0) { this.hp[i] = 0; gone++; this.bits(c, rr, o.dx || 0, o.dy || 0, o.speed || 1, o); }
      }
    }
    if (!hit) return 0;
    // glass: every knock cracks it further
    if (this.mat.brittle) {
      this.strain += take * 0.22 + gone * 0.035;
      if (o.mark !== false) this.mark(g.gx / this.cs, g.gy / this.cs, 'crack', clamp(take, 0.4, 2.5));
    } else if (o.mark !== false && kind !== 'blast') {
      this.mark(g.gx / this.cs, g.gy / this.cs, this.mat.name === 'metal' ? 'dent' : 'chip', clamp(take * 2, 0.4, 1.6));
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
    const step = this.cs * 0.5;
    let t = 0, first = null, last = null, lastCell = -1;
    const take = this.mat.take.bullet / this.mat.tough;
    while (t <= max && energy > 0.15) {
      const px = x + dx * t, py = y + dy * t;
      const g = this.toGrid(px, py);
      const c = Math.floor(g.gx / this.cs), r = Math.floor(g.gy / this.cs);
      const i = c >= 0 && r >= 0 && c < this.cols && r < this.rows ? this.idx(c, r) : -1;
      if (i >= 0 && i !== lastCell && this.hp[i] > 0) {
        lastCell = i;
        if (!first) first = { x: px, y: py, c: g.gx / this.cs, r: g.gy / this.cs };
        last = { x: px, y: py, c: g.gx / this.cs, r: g.gy / this.cs, t };
        const m = this.cellMat ? this.matOf(i) : this.mat, tk = this.cellMat ? m.take.bullet / m.tough : take;
        // (glass: it goes straight through, cracking what is round the hole - one alone does not cut a pane in two)
        this.hp[i] -= m.brittle ? Math.min(0.8, energy * tk) : energy * tk;
        if (this.hp[i] <= 0) { this.hp[i] = 0; this.bits(c, r, dx, dy, 2); }
        energy -= m.resist;
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

  /**
   * What comes off a cell that went: splinters, scraps, shards. (o.bulk: one
   * of a great many going at once - only a few of those throw anything; o.soft:
   * glass that comes down as a glitter, not as blades.)
   */
  bits(c, r, dx, dy, speed = 1, o = {}) {
    const fx = this.sandbox.fx, p = this.cellWorld(c, r);
    const m = this.matOf(this.idx(c, r)), cols = m.bits;
    // (a building's worth of cells: not every one of them throws something off)
    if (this.big && chance(o.bulk ? 0.88 : 0.45)) return;
    fx.bits(p.x, p.y, chance(0.5) ? 2 : 1, cols[Math.floor(Math.random() * cols.length)], dx * speed + rand(-1, 1), dy * speed + rand(0, 1.6), {
      size: this.cs * rand(0.35, 0.6), sharp: m.brittle && !o.soft, glow: m.name === 'metal' && chance(0.35),
    });
  }

  /** How much of each row is still there that holds anything up: its cells that are not glass. */
  structure() {
    const { cols, rows, hp } = this;
    const count = new Int32Array(rows);
    for (let r = 0; r < rows; r++) {
      let n = 0;
      for (let c = 0; c < cols; c++) { const i = r * cols + c; if (hp[i] > 0 && !(this.cellMat && this.matOf(i).brittle)) n++; }
      count[r] = n;
    }
    return count;
  }

  /**
   * After cells have gone: glass that is cracked enough comes down; anything
   * no longer joined to what holds the rest up comes away; the box shrinks
   * to what is left.
   */
  after(o = {}) {
    if (this.removed) return;
    if (this.mat.brittle && this.strain >= 1) { this.shatter(o); return; }
    // (a building: everything that happened to it this step, sorted out once, after it - see update)
    if (this.big) { this.splitDue = this.splitDue || o; return; }
    this.split(o);
  }

  /**
   * A building's storeys bearing what is above them. A storey with most of it
   * gone gives way under the rest; so does a stretch with nothing on the
   * ground under it wider than it can span (from one side, or across the
   * middle) - and whatever it was holding up comes down. Cuts what gives way
   * through, and says whether anything did.
   */
  bearLoad() {
    const { cols, rows, hp } = this;
    let gave = false;
    const cut = (cells) => {
      for (const i of cells) {
        if (hp[i] <= 0) continue;
        hp[i] = 0;
        if (chance(0.3)) { const c = i % cols; this.bits(c, (i - c) / cols, 0, -0.5, 1); }
        gave = true;
      }
    };
    // a storey: what is left of what holds it up - its walls and columns, not its glass - against
    // what there was of them to begin with, with anything above it to hold up
    const count = this.structure();
    const base = this.rowBase || (this.rowBase = count);
    let above = 0, fail = -1;
    for (let r = rows - 2; r >= 0; r--) {
      above = Math.max(above, count[r + 1]);
      if (above >= 10 && base[r] >= 6 && count[r] < base[r] * 0.3) fail = r;
    }
    if (fail >= 0) {
      const row = [];
      for (let c = 0; c < cols; c++) row.push(fail * cols + c);
      cut(row);
    }
    // a stretch with nothing on the ground: as far as it can reach out, and no further
    const span = Math.round((this.spec.span || 3) / this.cs);
    const grounded = (c) => hp[c] > 0 || (rows > 1 && hp[cols + c] > 0);
    const column = (c) => { const out = []; for (let r = 0; r < rows; r++) out.push(r * cols + c); return out; };
    for (let c = 0; c < cols;) {
      if (grounded(c)) { c++; continue; }
      let e = c;
      while (e < cols && !grounded(e)) e++;
      const len = e - c, left = c > 0, right = e < cols;
      if (left && right && len > span * 2) { cut(column(c + span)); cut(column(e - 1 - span)); }
      else if (left && !right && len > span) cut(column(c + span));
      else if (right && !left && len > span) cut(column(e - 1 - span));
      c = e;
    }
    if (gave) this.sandbox.emit('slabGive', { what: this, x: this.pos.x, y: this.pos.y });
    return gave;
  }

  /**
   * A piece of a building landing hard at (x, y). A small one cracks across,
   * a line or two. A big one is crushed at the bottom - as far up as how hard
   * it came down - and cracks right through, along its floors and its
   * columns mostly, into lumps a couple of metres across that spill outwards
   * as they come apart: a heap, not a building standing in the street.
   */
  fracture(x, y, speed) {
    if (this.removed || this.anchored) return;
    const cs = this.cs, sb = this.sandbox, before = new Set(sb.slabs);
    const L = Math.hypot(this.gw, this.gh);
    const cut = (px, py, a) => {
      const ux = Math.cos(a), uy = Math.sin(a);
      for (let t = -L; t <= L; t += cs * 0.5) {
        const c = Math.floor((px + ux * t) / cs), r = Math.floor((py + uy * t) / cs);
        if (!this.cellOk(c, r)) continue;
        this.hp[this.idx(c, r)] = 0;
        if (chance(0.2)) this.bits(c, r, ux * 0.4, 0.5, 1.2);
      }
    };
    const big = this.cellCount > 160;
    if (!big) {
      // through somewhere near where it hit, along it or across it (or any way)
      const g = this.toGrid(x, y);
      for (let k = clamp(Math.round(speed / 5), 1, 2); k > 0; k--) {
        const a = chance(0.7) ? (chance(0.5) ? 0 : Math.PI / 2) + rand(-0.06, 0.06) : rand(0, Math.PI);
        cut(clamp(g.gx + rand(-1, 1) * this.gw * 0.3, 0, this.gw), clamp(g.gy + rand(-1, 1) * this.gh * 0.3, 0, this.gh), a);
      }
    } else {
      // the bottom of it, crushed
      const low = this.body.aabb().minY, crush = clamp(speed * 0.1, 0.2, 1.3);
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const i = r * this.cols + c;
          if (this.hp[i] <= 0 || this.cellWorld(c, r).y - low >= crush) continue;
          this.hp[i] = 0;
          if (chance(0.1)) this.bits(c, r, rand(-1.5, 1.5), 0.8, 1.5);
        }
      }
      // and the rest, through and through
      const size = clamp(2.8 - speed * 0.1, 1.3, 2.8);
      for (let gy = size * rand(0.6, 1.1); gy < this.gh - size * 0.4; gy += size * rand(0.8, 1.2)) cut(this.gw / 2, gy, rand(-0.05, 0.05));
      for (let gx = size * rand(0.5, 1); gx < this.gw - size * 0.4; gx += size * rand(0.8, 1.2)) cut(gx, this.gh / 2, Math.PI / 2 + rand(-0.05, 0.05));
      if (speed > 6 && chance(0.6)) cut(rand(0, this.gw), rand(0, this.gh), rand(0.4, 1.2));
      for (let k = 0; k < 5; k++) sb.fx.dust(x + rand(-1, 1) * this.body.w * 0.45, low + 0.2, 6, Math.min(2, speed / 5));
    }
    this.dirty = true;
    sb.fx.dust(x, y, 6, Math.min(1.6, speed / 6));
    sb.emit('rubble', { what: this, x, y, speed, cells: this.cellCount, big });
    const mid = this.body.pos.x, h0 = this.body.aabb().minY, tall = Math.max(0.5, this.body.aabb().maxY - h0);
    // (all at once, now: it is landing)
    this.split({ dx: 0, dy: 0.5, speed: 1 });
    if (!big) return;
    // the lumps of it spill out sideways as it comes down, the higher up the further
    for (const s of sb.slabs) {
      if (s !== this && before.has(s)) continue;
      if (s.removed || s.anchored) continue;
      const v = s.body.vel, up = clamp((s.body.pos.y - h0) / tall, 0, 1);
      v.x += (Math.sign(s.body.pos.x - mid) || (chance(0.5) ? 1 : -1)) * rand(0.4, 1.8) * (0.3 + up);
      s.body.angVel += rand(-1.2, 1.2) * (0.4 + up);
      s.body.gentle = Math.max(s.body.gentle || 0, 1.2);
    }
  }

  /** Taken hold of by the hand at (x, y): a lump of it, out to r, comes away in the hand. */
  tearAt(x, y, r = 0.7) {
    const g = this.toGrid(x, y), cs = this.cs, k = Math.ceil(r / cs) + 1;
    const c0 = Math.floor(g.gx / cs), r0 = Math.floor(g.gy / cs);
    const lump = [];
    for (let dr = -k; dr <= k; dr++) {
      for (let dc = -k; dc <= k; dc++) {
        const c = c0 + dc, rr = r0 + dr;
        // (a ragged lump, not a round one)
        if (!this.cellOk(c, rr) || Math.hypot(dc, dr) * cs > r * (0.75 + 0.35 * Math.sin(c * 1.7 + rr * 2.3 + this.seed))) continue;
        lump.push(this.idx(c, rr));
      }
    }
    if (lump.length < CRUMBS) return null;
    const piece = this.breakAway(lump, false, {});
    if (!piece) return null;
    this.dirty = true;
    // (what is left may not stand up without it)
    this.after({});
    this.sandbox.emit('slabTear', { what: this, piece, x, y });
    return piece;
  }

  /** Every cell left, in pieces joined to each other: [[index, ...], ...]. */
  parts() {
    const hp = this.hp, cols = this.cols, rows = this.rows, seen = new Uint8Array(hp.length), out = [];
    const stack = [];
    const reach = (k) => { if (!seen[k] && hp[k] > 0) { seen[k] = 1; stack.push(k); } };
    for (let i = 0; i < hp.length; i++) {
      if (hp[i] <= 0 || seen[i]) continue;
      const part = [];
      stack.push(i);
      seen[i] = 1;
      while (stack.length) {
        const j = stack.pop();
        part.push(j);
        const c = j % cols, r = (j - c) / cols;
        if (c + 1 < cols) reach(j + 1);
        if (c > 0) reach(j - 1);
        if (r + 1 < rows) reach(j + cols);
        if (r > 0) reach(j - cols);
      }
      out.push(part);
    }
    return out;
  }

  /**
   * The cells holding it up just now: its bottom row, standing on whatever
   * is under it - or, a timber resting on others, the cells where it rests
   * on them, for as long as what they rest on is still there to rest on.
   */
  heldCells() {
    const out = new Set();
    for (const h of this.holds) {
      if (h.ground) { for (let c = 0; c < this.cols; c++) out.add(c); continue; }
      if (!this.holding(h)) continue;
      for (const i of h.cells) out.add(i);
    }
    return out;
  }

  /** Whether what one of its holds rests on is still there, standing, under it. */
  holding(h) {
    if (h.ground) return true;
    const by = h.by;
    if (!by || by.removed || !by.anchored) return false;
    const p = this.fromGrid(h.gx, h.gy);
    return by.contains(p.x, p.y, by.cs * 0.75);
  }

  split(o = {}) {
    const parts = this.parts();
    if (!parts.length) { this.sandbox.remove(this, { quiet: true }); return; }
    // what stays this slab: standing, the part held up (the biggest, if more than one is);
    // loose, the biggest part
    const held = this.anchored ? this.heldCells() : null;
    const standing = (p) => !!held && p.some((i) => held.has(i));
    let keep = null;
    if (this.anchored) {
      for (const p of parts) if (standing(p) && (!keep || p.length > keep.length)) keep = p;
    } else {
      for (const p of parts) if (!keep || p.length > keep.length) keep = p;
    }
    // nothing left holding it up: the whole of it goes over (or down)
    if (!keep) {
      this.anchored = false;
      this.holds = [];
      keep = parts.reduce((a, b) => (b.length > a.length ? b : a));
      this.body.setMass(1);
      this.sandbox.emit('slabFree', { what: this, x: this.pos.x, y: this.pos.y });
    }
    for (const p of parts) {
      if (p === keep) continue;
      if (this.anchored && standing(p)) this.breakAway(p, true, o, held);
      else this.breakAway(p, false, o);
    }
    if (keep.length < (this.spec.crumbs || CRUMBS) && !this.anchored) {
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

  /** The cells of part `p` out of this slab and into one of their own (standing, if `stands`: held up by what held them). */
  breakAway(p, stands, o = {}, held = null) {
    if (p.length < (this.spec.crumbs || CRUMBS) && !stands) {
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
    const mat = this.cellMat ? new Uint8Array(cols * rows) : null;
    for (const i of p) {
      const c = i % this.cols, r = (i - c) / this.cols;
      hp[(r - r0) * cols + (c - c0)] = this.hp[i];
      if (mat) mat[(r - r0) * cols + (c - c0)] = this.cellMat[i];
      this.hp[i] = 0;
    }
    const marks = this.marks.filter((m) => m.c >= c0 && m.c < c1 + 1 && m.r >= r0 && m.r < r1 + 1).map((m) => ({ ...m, c: m.c - c0, r: m.r - r0 }));
    const stains = this.stains.filter((s) => s.c >= c0 && s.c < c1 + 1 && s.r >= r0 && s.r < r1 + 1).map((s) => ({ ...s, c: s.c - c0, r: s.r - r0 }));
    // the middle of it, in the world, and how fast that is moving
    const b = this.body;
    const mid = b.toWorld(((c0 + c1 + 1) / 2) * this.cs - this.gw / 2 - this.ox, ((r0 + r1 + 1) / 2) * this.cs - this.gh / 2 - this.oy);
    const v = b.velAt(mid.x, mid.y);
    const kick = o.dx || o.dy ? { x: (o.dx || 0) * 0.6, y: (o.dy || 0) * 0.6 } : { x: 0, y: 0 };
    const piece = this.sandbox.addSlab(new Slab(this.sandbox, this.type, 0, 0, {
      from: this, grid: { cols, rows, hp, marks, mat }, at: mid, rot: b.rot, seed: this.seed + c0 * 31 + r0 * 17,
      vel: { x: v.x + kick.x + rand(-0.2, 0.2), y: v.y + kick.y, w: b.angVel + rand(-0.6, 0.6) }, strain: this.strain,
    }));
    if (!piece) return null;
    piece.stains = stains;
    piece.paintFrom = { src: this, c0, r0 };
    // (whoever brought it down is to blame for where the pieces land)
    piece.thrownBy = this.thrownBy || null;
    piece.thrownAt = this.thrownAt ?? -99;
    if (stands) {
      // standing on its own bottom row, like the wall it was part of - or resting where that rested
      piece.anchored = true;
      piece.kind = 'wall';
      piece.name = this.name;
      piece.group = this.group;
      piece.timber = this.timber;
      const mine = new Set(p);
      piece.holds = [];
      for (const h of this.holds) {
        if (h.ground) { piece.holds.push({ ground: true }); continue; }
        const cells = new Set();
        for (const i of h.cells) {
          if (!mine.has(i)) continue;
          const c = i % this.cols, r = (i - c) / this.cols;
          cells.add((r - r0) * cols + (c - c0));
        }
        if (cells.size) piece.holds.push({ cells, by: h.by, gx: h.gx - c0 * this.cs, gy: h.gy - r0 * this.cs });
      }
      piece.body.setMass(Infinity);
      piece.body.vel.x = piece.body.vel.y = piece.body.angVel = 0;
      piece.fit();
    } else {
      // (for a moment it passes through what it came off, so the two do not fly apart - and,
      // lying in among what came off with it, eases its way out rather than being thrown out)
      piece.body.ignore = new Set([b]);
      piece.unIgnoreT = 0.25;
      if (this.spec.crumbles) piece.body.gentle = 1.2;
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
          size: this.cs * rand(0.6, 1.3), sharp: true, spin: true,
        });
      }
    }
    this.sandbox.emit('glassShatter', { what: this, x: b.pos.x, y: b.pos.y });
    this.sandbox.remove(this, { quiet: true });
  }

  /** Blood landing on it: kept on the cell it landed on. */
  stain(wx, wy, r, tint = null) {
    const g = this.toGrid(wx, wy);
    const c = g.gx / this.cs, rr = g.gy / this.cs;
    if (!this.cellOk(Math.floor(c), Math.floor(rr))) return;
    for (const s of this.stains) {
      if (s.tint === tint && Math.hypot(s.c - c, s.r - rr) * this.cs < s.r0) { s.r0 = Math.min(0.07, s.r0 + r * 0.15); this.dirty = true; return; }
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
   * Let go of where it was (unfrozen, say): a wall standing on something
   * stays standing; one left in mid-air comes loose, and falls.
   */
  settle() {
    if (!this.anchored || this.frozenInPlace || !this.holds.every((h) => h.ground)) return;
    const b = this.body, bb = b.aabb();
    const below = this.sandbox.surfaceBelow(b.pos.x, b.w * 0.4, bb.minY + 0.05, this);
    if (bb.minY - below.y > 0.03) this.uproot();
  }

  /* -------------------------------- the hand -------------------------------- */

  /**
   * Taken hold of by the hand: it comes away from where it stood, and is a
   * body like any other from now on - it hangs from the hand at the point it
   * was taken by, and swings and turns with it, and falls when let go.
   */
  uproot(x, y) {
    // too big to come up whole: a lump of it comes away instead
    if (this.spec.tear && this.anchored) return x === undefined ? null : this.tearAt(x, y);
    if (this.anchored) {
      this.anchored = false;
      this.holds = [];
      this.fit();
    }
    return this;
  }

  /**
   * A wall lying loose, come to rest upright on its foot - put down that way
   * by the hand, or just landed so: it stands again, as solid as it was.
   */
  tryStand() {
    const b = this.body, sb = this.sandbox;
    if (this.spec.noStand || !this.box || this.box.r0 !== 0 || b.h < b.w * 1.5) return false;
    if (Math.abs(Math.atan2(Math.sin(b.rot), Math.cos(b.rot))) > 0.07) return false;
    if (Math.hypot(b.vel.x, b.vel.y) > 0.5 || Math.abs(b.angVel) > 0.5) return false;
    const bb = b.aabb();
    const below = sb.surfaceBelow(b.pos.x, b.w * 0.4, bb.minY + 0.05, this);
    if (bb.minY - below.y > 0.04) return false;
    b.rot = 0;
    b.pos.y = below.y + b.h / 2;
    this.anchored = true;
    this.holds = [{ ground: true }];
    this.fit();
    sb.emit('slabStand', { what: this, x: b.pos.x, y: below.y });
    return true;
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
    if (this.body.gentle > 0) this.body.gentle -= dt;
    // a building: what happened to it this step, sorted out - and whether what is left still stands
    if (this.splitDue && !this.removed) {
      const o = this.splitDue;
      this.splitDue = null;
      if (this.spec.load && this.anchored) this.bearLoad();
      this.split(o);
      if (this.removed) return;
    }
    // nothing holds a standing slab up but what it stands on: knocked about, it stays put
    if (this.anchored) {
      this.body.vel.x = this.body.vel.y = this.body.angVel = 0;
      // a timber resting on others: when one of those goes (or moves), it may be left resting on nothing
      if (!this.frozenInPlace && this.holds.some((h) => !h.ground) && (this.holdT = (this.holdT || 0) - dt) <= 0) {
        this.holdT = 0.1;
        let sig = 0;
        this.holds.forEach((h, k) => { if (this.holding(h)) sig |= 1 << k; });
        if (this.holdSig !== undefined && sig !== this.holdSig) this.split();
        this.holdSig = sig;
      }
    } else if (this.kind === 'wall' && !this.frozenInPlace && !(this.sandbox.hand && this.sandbox.hand.holding === this)) {
      // a wall lying loose, set down upright: it stands again
      if ((this.standT = (this.standT || 0) - dt) <= 0) { this.standT = 0.05; this.tryStand(); }
    }
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
    const W = this.cols * this.px, H = this.rows * this.px;
    if (!this.tex) { this.tex = document.createElement('canvas'); this.tex.width = W; this.tex.height = H; }
    const g = this.tex.getContext('2d');
    g.clearRect(0, 0, W, H);
    g.drawImage(this.base, 0, 0);
    const y = (r) => (this.rows - 1 - r) * this.px;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const h = this.hp[r * this.cols + c];
        if (h <= 0) g.clearRect(c * this.px, y(r), this.px, this.px);
        else if (h < 0.92 && !(this.cellMat ? this.matOf(r * this.cols + c) : this.mat).brittle) {
          g.fillStyle = `rgba(20, 14, 8, ${((1 - h) * 0.45).toFixed(3)})`;
          g.fillRect(c * this.px, y(r), this.px, this.px);
        }
      }
    }
    // only on what is still there
    g.save();
    g.globalCompositeOperation = 'source-atop';
    for (const m of this.marks) drawMark(g, this, m, (m.c) * this.px, (this.rows - m.r) * this.px);
    for (const s of this.stains) {
      g.fillStyle = s.tint ? s.tint[s.dark ? 1 : 0] : s.dark ? 'rgba(110, 7, 16, 0.9)' : 'rgba(163, 16, 28, 0.85)';
      g.beginPath();
      g.ellipse(s.c * this.px, (this.rows - s.r) * this.px, (s.r0 / this.cs) * this.px, (s.r0 / this.cs) * this.px * s.flat, s.a, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
}

/** A mark drawn on a slab's picture at (x, y), in its pixels. */
function drawMark(g, s, m, x, y) {
  const k = m.s * s.px;
  if (m.kind === 'hole') {
    g.fillStyle = s.mat.name === 'glass' ? 'rgba(255,255,255,0.5)' : s.mat.hole || '#2a1a0e';
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
    g.fillStyle = s.mat.chip || 'rgba(60, 36, 16, 0.45)';
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
  const src = from.src, P = src.px;
  if (!src.base) src.base = src.paintFrom ? cropOf(src.paintFrom, src.cols, src.rows) : paint(src);
  const cv = document.createElement('canvas');
  cv.width = cols * P; cv.height = rows * P;
  // (rows count up from the bottom; the picture's from the top)
  const sy = (src.rows - from.r0 - rows) * P;
  cv.getContext('2d').drawImage(src.base, from.c0 * P, sy, cols * P, rows * P, 0, 0, cols * P, rows * P);
  return cv;
}

/** A seeded little random, for a slab to look the same every time it is painted. */
function rng(seed) {
  let s = seed | 0 || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** The slab's picture whole, before anything happened to it: planks, a steel plate, a pane. */
function paint(s) {
  // (a slab of a kind of its own - a building - paints itself)
  if (s.spec && s.spec.paint) return s.spec.paint(s);
  const W = s.cols * PX, H = s.rows * PX;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const R = rng(s.seed);
  // the cells it was made with: a piece is painted as the whole wall was, where it was in it
  if (s.timber) {
    // a squared timber: one length of wood, the grain along it, bolted where it joins
    const along = W >= H;
    const L = along ? W : H, T = along ? H : W;
    const tone = 0.9 + R() * 0.15;
    g.fillStyle = `rgb(${Math.round(150 * tone)}, ${Math.round(100 * tone)}, ${Math.round(56 * tone)})`;
    g.fillRect(0, 0, W, H);
    const line = (a0, b0, a1, b1) => { if (along) { g.moveTo(a0, b0); g.lineTo(a1, b1); } else { g.moveTo(b0, a0); g.lineTo(b1, a1); } };
    g.strokeStyle = 'rgba(80, 48, 20, 0.35)';
    g.lineWidth = 1;
    g.beginPath();
    for (let k = 0; k < Math.max(2, Math.round(T / 5)); k++) {
      const t0 = 2 + R() * (T - 4);
      for (let a = 0; a < L; a += 10) line(a, t0 + Math.sin(a * 0.04 + k * 2) * 1.5, a + 10, t0 + Math.sin((a + 10) * 0.04 + k * 2) * 1.5);
    }
    g.stroke();
    for (let k = 0; k < L / 60; k++) {
      g.fillStyle = 'rgba(90, 54, 24, 0.5)';
      const a = R() * L, b = T * (0.3 + R() * 0.4);
      g.beginPath();
      if (along) g.ellipse(a, b, 5, 2.2, 0, 0, Math.PI * 2); else g.ellipse(b, a, 2.2, 5, 0, 0, Math.PI * 2);
      g.fill();
    }
    // the shadowed underside, and the edges
    g.fillStyle = 'rgba(40, 22, 8, 0.28)';
    if (along) g.fillRect(0, H * 0.7, W, H * 0.3); else g.fillRect(W * 0.7, 0, W * 0.3, H);
    g.strokeStyle = 'rgba(50, 28, 10, 0.9)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, W - 2, H - 2);
    // a bolt near each end
    g.fillStyle = '#2e2e2e';
    for (const a of [PX * 2, L - PX * 2]) { g.beginPath(); if (along) g.arc(a, H / 2, 1.8, 0, Math.PI * 2); else g.arc(W / 2, a, 1.8, 0, Math.PI * 2); g.fill(); }
  } else if (s.mat.name === 'wood') {
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
