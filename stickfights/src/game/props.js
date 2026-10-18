/* =============================================================================
   The things you can spawn that are not people: a wooden crate, a set of
   brass knuckles, a combat knife, a machete, two pistols (a Glock-19 and an
   M1911), a light vest and three sizes of ammo box - and the pieces of
   people a machete leaves on the floor. (The taser has a file of its own,
   taser.js.)

   Each one is a rigid body in the physics world while it is lying about; a
   crate someone is carrying turns kinematic and goes where their hands go,
   and a weapon in someone's hand - or in their holster, or their pocket -
   leaves the world altogether and is drawn on them.

   A blade that flies point first into something stays in it: a crate, the
   floor, or a person (stickman.js holds it to the bone it went into). A gun
   carries its own ammunition, whoever is holding it: a magazine and two
   spare magazines' worth - topped up again from an ammo box.
   ========================================================================== */
import { Body } from '../physics/rigid.js';
import {
  KNIFE_W, KNIFE_H, KNIFE_GRIP, MACHETE_W, MACHETE_H, MACHETE_GRIP,
  GLOCK_W, GLOCK_H, GLOCK_GRIP, GLOCK_MUZZLE, GLOCK_PORT, M1911_W, M1911_H, M1911_GRIP, M1911_MUZZLE, M1911_PORT,
} from './draw.js';

let nextId = 1;

export const CRATE_SIZE = 0.78;
// drawn a good deal bigger than real ones, so they can be seen at all
export const KNUCKLES_W = 0.26;
export const KNUCKLES_H = 0.11;
export const CRATE_MASS = 22;

export class Crate {
  constructor(sandbox, x, y, rot = 0) {
    this.id = nextId++;
    this.kind = 'crate';
    this.name = 'Crate';
    this.sandbox = sandbox;
    this.size = CRATE_SIZE;
    this.body = sandbox.phys.add(new Body(CRATE_SIZE, CRATE_SIZE, CRATE_MASS, {
      x, y, rot, owner: this, friction: 0.65, restitution: 0.08, angularDamping: 0.35,
    }));
    this.stains = [];
    this.holes = [];         // bullet holes, in its own frame
    this.carriedBy = null;   // a stickman holding it overhead
    this.thrownBy = null;    // who threw it last, so a hit can be blamed on them
    this.thrownAt = -99;
    this.lastSound = -99;
    this.removed = false;
  }

  get pos() { return this.body.pos; }

  /** Blood that lands on it stays where it landed, in the crate's own frame. */
  stain(wx, wy, r, tint = null) {
    const l = this.body.toLocal(wx, wy);
    const h = this.size / 2;
    l.x = Math.max(-h, Math.min(h, l.x));
    l.y = Math.max(-h, Math.min(h, l.y));
    if (this.stains.length > 60) this.stains.shift();
    this.stains.push({ x: l.x, y: l.y, r, a: Math.random() * Math.PI, flat: 0.6 + Math.random() * 0.4, dark: Math.random() < 0.3, tint });
  }

  /** Where a bullet went through, in the crate's own frame, so it turns with the crate. */
  hole(wx, wy) {
    const l = this.body.toLocal(wx, wy);
    const h = this.size / 2 - 0.02;
    if (this.holes.length > 40) this.holes.shift();
    this.holes.push({ x: Math.max(-h, Math.min(h, l.x)), y: Math.max(-h, Math.min(h, l.y)) });
  }

  /** Picked up overhead: it follows the hands and stops being pushed about. */
  carry(by) {
    this.carriedBy = by;
    this.body.setKinematic(true);
    this.body.rot = 0;
    this.body.angVel = 0;
  }

  release(vx, vy, spin = 0) {
    this.carriedBy = null;
    this.body.setKinematic(false, CRATE_MASS);
    this.body.vel.x = vx;
    this.body.vel.y = vy;
    this.body.angVel = spin;
  }
}

export class Knuckles {
  constructor(sandbox, x, y, rot = 0) {
    this.id = nextId++;
    this.kind = 'knuckles';
    this.name = 'Brass Knuckles';
    this.sandbox = sandbox;
    this.body = new Body(KNUCKLES_W, KNUCKLES_H, 0.4, {
      x, y, rot, owner: this, friction: 0.55, restitution: 0.32, angularDamping: 0.8,
    });
    sandbox.phys.add(this.body);
    this.wornBy = null;
    this.blood = 0;
    this.thrownBy = null;
    this.thrownAt = -99;
    this.lastSound = -99;
    this.removed = false;
  }

  get pos() { return this.body.pos; }
  get loose() { return !this.wornBy && !this.removed; }

  wear(by) {
    this.wornBy = by;
    this.sandbox.phys.remove(this.body);
  }

  /** Off the hand and back into the world, moving the way the hand was. */
  drop(x, y, vx = 0, vy = 0) {
    this.wornBy = null;
    const b = this.body;
    b.pos.x = x; b.pos.y = y;
    b.vel.x = vx; b.vel.y = vy;
    b.rot = Math.random() * Math.PI;
    b.angVel = (Math.random() - 0.5) * 10;
    this.sandbox.phys.add(b);
  }
}

/** The two blades, and how each is built: drawn length and depth, weight, where the fist goes. */
export const BLADES = {
  knife: { name: 'Combat Knife', w: KNIFE_W, h: KNIFE_H, mass: 0.35, grip: KNIFE_GRIP },
  machete: { name: 'Machete', w: MACHETE_W, h: MACHETE_H, mass: 0.6, grip: MACHETE_GRIP },
};
export const isBlade = (kind) => kind === 'knife' || kind === 'machete';

/** The kinds of thing that are guns: aimed, fired, carried by a stickman like the Glock. Mods add theirs. */
export const GUN_KINDS = new Set(['glock', 'm1911', 'taser']);
export const isGun = (kind) => GUN_KINDS.has(kind);
/** A gun that kills: anything aimed and fired except the taser. */
export const isFirearm = (kind) => GUN_KINDS.has(kind) && kind !== 'taser';

/**
 * Weapons that are part of somebody rather than something they pick up -
 * hands that turn into blades, from a mod - and what each one does. A spec:
 *   blade   strikes with it cut, and land wherever its edge actually is
 *           (the owner's species says where that is: bladePoints)
 *   sharp   how much it cuts, 0..1          mult    how hard its blows land
 *   deep    the strikes with it that go in deep (stab, chop...)
 *   gash    how many open wounds a blow leaves      sever   how readily it takes limbs off
 *   shove   how much a blow knocks someone back     spray   how much blood flies
 *   scary   how frightening it is to see    fear    what people say when they see it
 *   nasty   how bad it is to watch          memory  what being hurt by it is remembered as
 *   hurt    what the one it hits says       power   how much it counts for in a fight
 *   chop    it hacks, and leaves gashes     shot    it goes in like a bullet
 *   burn    it burns rather than cuts: scorch marks, and no blood
 *   r       how thick its edge is, for what it touches
 *   name    what it is called, in the inspector      noun    what it is, in a sentence
 *   wound   what its wounds are called      cause   what a death from it is put down to
 *   seen    what people who watch it land say       verb    how the one it hurt puts it
 */
export const ARMS = {};
export function defineArm(kind, spec) { ARMS[kind] = spec; }
export const armOf = (kind) => (kind && ARMS[kind]) || null;

export class Blade {
  constructor(sandbox, x, y, rot = 0, kind = 'knife') {
    const spec = BLADES[kind];
    this.id = nextId++;
    this.kind = kind;
    this.name = spec.name;
    this.sandbox = sandbox;
    this.w = spec.w;
    this.h = spec.h;
    this.grip = spec.grip;
    this.body = new Body(spec.w, spec.h, spec.mass, {
      x, y, rot, owner: this, friction: 0.45, restitution: 0.15, angularDamping: 0.5,
    });
    sandbox.phys.add(this.body);
    this.inWorld = true;
    this.wornBy = null;     // in someone's hand
    this.stuckIn = null;    // { person, entry } | { crate, lx, ly, lr } | { floor: true }
    this.blood = 0;
    this.thrownBy = null;
    this.thrownAt = -99;
    this.lastSound = -99;
    this.impactCool = new Map();
    this.removed = false;
  }

  get pos() {
    if (this.wornBy) return this.wornBy.wj.handA;
    if (this.stuckIn && this.stuckIn.person) {
      const q = this.stuckIn.person.knifePose(this.stuckIn.entry);
      return { x: q.x, y: q.y };
    }
    return this.body.pos;
  }

  /** Free in the world, not in a hand or stuck in anything. */
  get loose() { return !this.wornBy && !this.stuckIn && !this.removed; }

  /** Where its point is, while it is a body of its own. */
  get tip() { return this.body.toWorld(this.w / 2, 0); }

  leaveWorld() { if (this.inWorld) { this.sandbox.phys.remove(this.body); this.inWorld = false; } }
  enterWorld() { if (!this.inWorld) { this.sandbox.phys.add(this.body); this.inWorld = true; } }

  wear(by) {
    this.wornBy = by;
    this.stuckIn = null;
    this.leaveWorld();
  }

  /** Out of a hand (or out of something) and back into the world, moving the way it was. */
  drop(x, y, vx = 0, vy = 0) {
    this.wornBy = null;
    this.stuckIn = null;
    const b = this.body;
    b.pos.x = x; b.pos.y = y;
    b.vel.x = vx; b.vel.y = vy;
    b.rot = Math.random() * Math.PI * 2;
    b.angVel = (Math.random() - 0.5) * 12;
    this.enterWorld();
  }

  /** Thrown, point first, the way it is going. */
  throwFrom(x, y, vx, vy, by) {
    this.wornBy = null;
    this.stuckIn = null;
    const b = this.body;
    b.pos.x = x; b.pos.y = y;
    b.vel.x = vx; b.vel.y = vy;
    b.rot = Math.atan2(vy, vx);
    b.angVel = 0;
    this.thrownBy = by;
    this.thrownAt = this.sandbox.time;
    this.enterWorld();
  }

  stickInto(o) {
    this.stuckIn = o;
    this.wornBy = null;
    this.body.vel.x = this.body.vel.y = 0;
    this.body.angVel = 0;
    this.leaveWorld();
  }

  unstick() { this.stuckIn = null; }

  /** Stuck in a crate, it goes where the crate goes. */
  follow() {
    const st = this.stuckIn;
    if (!st || !st.crate) return;
    const c = st.crate.body;
    const p = c.toWorld(st.lx, st.ly);
    this.body.pos.x = p.x;
    this.body.pos.y = p.y;
    this.body.rot = c.rot + st.lr;
  }
}

export class Knife extends Blade {
  constructor(sandbox, x, y, rot = 0) { super(sandbox, x, y, rot, 'knife'); }
}

export class Machete extends Blade {
  constructor(sandbox, x, y, rot = 0) { super(sandbox, x, y, rot, 'machete'); }
}

export const GLOCK_MAG = 15;
export const GLOCK_SPARE = 30;

/**
 * The two pistols, and how they differ:
 *   mag, spare  rounds in a magazine, and spare rounds carried with it
 *   energy      how hard a round hits (and how far into things it goes)
 *   cadence     how soon after one shot the next can go
 *   kick        how far the muzzle climbs, and how long it takes to come back down
 */
export const GUN_MODELS = {
  glock: {
    name: 'Glock-19', a: 'a', mag: 15, spare: 30, energy: 1, cadence: 0.11, kick: 1, round: '9 mm',
    w: GLOCK_W, h: GLOCK_H, mass: 0.85, grip: GLOCK_GRIP, muzzle: GLOCK_MUZZLE, port: GLOCK_PORT,
  },
  m1911: {
    name: 'M1911', a: 'an', mag: 7, spare: 14, energy: 1.25, cadence: 0.2, kick: 1.6, round: '.45',
    w: M1911_W, h: M1911_H, mass: 1.1, grip: M1911_GRIP, muzzle: M1911_MUZZLE, port: M1911_PORT,
  },
};

/**
 * A pistol: a Glock-19 (fifteen 9 mm rounds in the magazine) or an M1911
 * (seven .45s: heavier, slower, and it kicks), with two more magazines'
 * worth either way. Lying about it is a body like any other; tap it and it
 * fires the way it is pointing.
 */
export class Gun {
  constructor(sandbox, x, y, rot = 0, kind = 'glock') {
    const spec = GUN_MODELS[kind] || GUN_MODELS.glock;
    this.id = nextId++;
    this.kind = kind;
    this.spec = spec;
    this.name = spec.name;
    this.sandbox = sandbox;
    this.body = new Body(spec.w, spec.h * 0.72, spec.mass, {
      x, y, rot, owner: this, friction: 0.55, restitution: 0.18, angularDamping: 0.6,
    });
    sandbox.phys.add(this.body);
    this.inWorld = true;
    this.wornBy = null;
    this.mag = spec.mag;
    this.spare = spec.spare;
    this.lastShot = -99;
    this.blood = 0;
    this.thrownBy = null;
    this.thrownAt = -99;
    this.lastSound = -99;
    this.removed = false;
  }

  get pos() { return this.wornBy ? this.wornBy.wj.handA : this.body.pos; }
  get loose() { return !this.wornBy && !this.removed; }
  /** Every round it has, in the magazine and out. */
  get ammo() { return this.mag + this.spare; }
  /** How far back the slide is: kicked back for an instant by each shot, locked back when it is empty. */
  get slide() {
    if (this.mag <= 0) return 0.04;
    const t = this.sandbox.time - this.lastShot;
    return t < 0.06 ? 0.045 * (1 - t / 0.06) : 0;
  }
  /** How many more rounds it could carry: what an ammo box would give it. */
  get short() { return Math.max(0, this.spec.spare - this.spare) + Math.max(0, this.spec.mag - this.mag); }
  canReload() { return this.spare > 0 && this.mag < this.spec.mag; }
  describe(p) {
    return `${p && p.weapon === this ? 'Holding' : 'Carrying'} ${this.spec.a} ${this.name} (${this.mag}/${this.spec.mag}, ${this.spare} spare)${p && p.reloading && p.weapon === this ? ', reloading' : ''}`;
  }

  wear(by) {
    this.wornBy = by;
    if (this.inWorld) { this.sandbox.phys.remove(this.body); this.inWorld = false; }
  }

  drop(x, y, vx = 0, vy = 0) {
    this.wornBy = null;
    const b = this.body;
    b.pos.x = x; b.pos.y = y;
    b.vel.x = vx; b.vel.y = vy;
    b.rot = Math.random() * Math.PI * 2;
    b.angVel = (Math.random() - 0.5) * 9;
    if (!this.inWorld) { this.sandbox.phys.add(b); this.inWorld = true; }
  }

  /** Lying loose: where the muzzle is, and the way it points (counter-clockwise from +x). */
  muzzle() {
    const p = this.body.toWorld(this.spec.muzzle.x, this.spec.muzzle.y);
    return { x: p.x, y: p.y, a: this.body.rot };
  }

  /** A full magazine from the spares, if there is one. */
  reload() {
    const M = this.spec.mag;
    if (this.spare <= 0 || this.mag >= M) return false;
    const n = Math.min(M - this.mag, this.spare);
    this.mag += n;
    this.spare -= n;
    return true;
  }

  /** Rounds from an ammo box, up to what it carries: the spare magazines first, then the one in it. */
  topUp(n) {
    let left = n;
    const s = Math.min(left, Math.max(0, this.spec.spare - this.spare));
    this.spare += s;
    left -= s;
    const m = Math.min(left, Math.max(0, this.spec.mag - this.mag));
    this.mag += m;
    left -= m;
    return n - left;
  }
}

/* --------------------------------- ammo boxes -------------------------------- */

/** Three sizes of box of pistol rounds: what each holds, and how big and heavy it is. */
export const AMMO_BOXES = {
  small: { name: 'Small Ammo Box', short: 'SMALL AMMO', w: 0.24, h: 0.15, mass: 1.2, rounds: 30 },
  medium: { name: 'Medium Ammo Box', short: 'MEDIUM AMMO', w: 0.34, h: 0.2, mass: 3, rounds: 80 },
  big: { name: 'Big Ammo Box', short: 'BIG AMMO', w: 0.5, h: 0.28, mass: 8, rounds: 200 },
};

/**
 * A box of pistol rounds: a cardboard one, a plastic case, a steel can.
 * Anyone with a pistol running low comes and fills their magazines from it
 * (any pistol: the boxes are mixed), until it is empty.
 */
export class AmmoBox {
  constructor(sandbox, x, y, size = 'medium') {
    const spec = AMMO_BOXES[size] || AMMO_BOXES.medium;
    this.id = nextId++;
    this.kind = 'ammo';
    this.size = size;
    this.spec = spec;
    this.name = spec.name;
    this.sandbox = sandbox;
    this.rounds = spec.rounds;
    this.body = new Body(spec.w, spec.h, spec.mass, {
      x, y, rot: 0, owner: this, friction: 0.7, restitution: 0.08, angularDamping: 0.6,
    });
    sandbox.phys.add(this.body);
    this.wornBy = null;
    this.thrownBy = null;
    this.thrownAt = -99;
    this.lastSound = -99;
    this.removed = false;
  }
  get pos() { return this.body.pos; }
  get loose() { return !this.removed; }
  get empty() { return this.rounds <= 0; }
  /** Up to n rounds out of it: how many there were. */
  take(n) {
    const k = Math.max(0, Math.min(n, this.rounds));
    this.rounds -= k;
    return k;
  }
  describe() { return this.rounds > 0 ? `${this.name}: ${this.rounds} rounds left` : `${this.name}: empty`; }
}

/* ---------------------------------- the vest --------------------------------- */

export const VEST_W = 0.42;
export const VEST_H = 0.075;

/**
 * A light vest: soft armour, for the body only. On, it stops most pistol
 * rounds that hit the torso - the round still lands like a hammer blow, and
 * knocks them back - and takes the worst out of a blade. Every round it
 * stops wears it down, and a worn-out one stops nothing much.
 */
export class Vest {
  constructor(sandbox, x, y, o = {}) {
    this.id = nextId++;
    this.kind = 'vest';
    this.police = !!o.police;
    this.name = this.police ? 'Police Vest' : 'Light Vest';
    this.sandbox = sandbox;
    this.hp = 100;
    this.body = new Body(VEST_W, VEST_H, 2.2, {
      x, y, rot: 0, owner: this, friction: 0.85, restitution: 0.02, angularDamping: 0.9,
    });
    sandbox.phys.add(this.body);
    this.inWorld = true;
    this.wornBy = null;
    this.dents = [];          // where rounds hit it: { t (along the torso, 0 hips .. 1 neck), side (1 front, -1 back) }
    this.blood = 0;
    this.thrownBy = null;
    this.thrownAt = -99;
    this.lastSound = -99;
    this.removed = false;
  }
  get pos() { return this.wornBy ? this.wornBy.wj.chest : this.body.pos; }
  get loose() { return !this.wornBy && !this.removed; }
  /** 0..1: how much of it is left. */
  get condition() { return Math.max(0, this.hp / 100); }

  wear(by) {
    this.wornBy = by;
    if (this.inWorld) { this.sandbox.phys.remove(this.body); this.inWorld = false; }
  }

  drop(x, y, vx = 0, vy = 0) {
    this.wornBy = null;
    const b = this.body;
    b.pos.x = x; b.pos.y = Math.max(y, VEST_H / 2 + 0.01);
    b.vel.x = vx; b.vel.y = vy;
    b.rot = 0;
    b.angVel = (Math.random() - 0.5) * 3;
    if (!this.inWorld) { this.sandbox.phys.add(b); this.inWorld = true; }
  }

  /**
   * A round into it with `energy` (1 is a 9 mm). Whether it stops it - a
   * light vest stops pistol rounds while it lasts - and the wear it takes.
   */
  stopsRound(energy, t, side) {
    const k = this.condition;
    const stop = k > 0.08 && Math.random() < (energy > 1.6 ? 0.25 : 0.55 + k * 0.45);
    this.hp = Math.max(0, this.hp - (stop ? 9 + energy * 7 : 14));
    if (this.dents.length > 12) this.dents.shift();
    this.dents.push({ t, side, hole: !stop });
    return stop;
  }

  /** How much of a blade's damage gets through (and only to the body). */
  bladeThrough(kind) {
    const k = this.condition;
    this.hp = Math.max(0, this.hp - 2);
    if (kind === 'stab') return 1 - 0.45 * k;
    if (kind === 'chop' || kind === 'hack') return 1 - 0.35 * k;
    return 1 - 0.6 * k;
  }
}

/** How heavy each piece a machete can take off is, and what to call it. */
const PIECES = {
  forearm: { name: 'Severed hand', mass: 0.9 },
  humerus: { name: 'Severed arm', mass: 2.4 },
  tibia: { name: 'Severed foot', mass: 2.2 },
  femur: { name: 'Severed leg', mass: 6.5 },
};

/**
 * A piece of someone that a machete took off: rigid, as it was when it came
 * away, bleeding for a while from the cut end. `pts` are its joints in the
 * world, from the cut end outward; `bone` the bone it was cut through.
 */
export class Limb {
  constructor(sandbox, pts, bone, of, vx = 0, vy = 0, spin = 0, scale = 1) {
    this.id = nextId++;
    this.kind = 'limb';
    const kind = bone.replace(/[AB]$/, '');
    this.name = PIECES[kind].name;
    this.bone = bone;
    this.of = of;             // whose it was
    this.sandbox = sandbox;
    this.scale = scale;
    // a box along the piece, from the cut end to the far end
    const a = pts[0], z = pts[pts.length - 1];
    const ang = Math.atan2(z.y - a.y, z.x - a.x);
    const c = Math.cos(ang), s = Math.sin(ang);
    let lo = Infinity, hi = -Infinity, lo2 = Infinity, hi2 = -Infinity;
    for (const p of pts) {
      const u = (p.x - a.x) * c + (p.y - a.y) * s, v = -(p.x - a.x) * s + (p.y - a.y) * c;
      lo = Math.min(lo, u); hi = Math.max(hi, u); lo2 = Math.min(lo2, v); hi2 = Math.max(hi2, v);
    }
    const len = Math.max(0.1, hi - lo), dep = Math.max(0.06, hi2 - lo2 + 0.05);
    const mu = (lo + hi) / 2, mv = (lo2 + hi2) / 2;
    const cx = a.x + c * mu - s * mv, cy = a.y + s * mu + c * mv;
    this.body = new Body(len, dep, PIECES[kind].mass * scale, {
      x: cx, y: Math.max(cy, dep / 2), rot: ang, owner: this, friction: 0.8, restitution: 0.06, angularDamping: 0.8,
    });
    this.body.vel.x = vx; this.body.vel.y = vy; this.body.angVel = spin;
    this.local = pts.map((p) => this.body.toLocal(p.x, p.y));
    sandbox.phys.add(this.body);
    this.bleed = 1;           // drips from the cut end, slowing to nothing
    this.blood = 1;
    this.dripAcc = 0;
    this.thrownBy = null;
    this.thrownAt = -99;
    this.lastSound = -99;
    this.removed = false;
  }

  get pos() { return this.body.pos; }
  get loose() { return !this.removed; }
  /** The cut end, in the world. */
  get end() { const p = this.local[0]; return this.body.toWorld(p.x, p.y); }
}
