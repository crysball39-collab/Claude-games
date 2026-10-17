/* =============================================================================
   The things you can spawn that are not people: a wooden crate, a set of
   brass knuckles and a combat knife. Each one is a rigid body in the physics
   world while it is lying about; a crate someone is carrying turns kinematic
   and goes where their hands go, and knuckles or a knife in someone's hand
   leave the world altogether and are drawn in it.

   A knife that flies point first into something stays in it: a crate, the
   floor, or a person (stickman.js holds it to the bone it went into).
   ========================================================================== */
import { Body } from '../physics/rigid.js';
import { KNIFE_W, KNIFE_H } from './draw.js';

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
    this.carriedBy = null;   // a stickman holding it overhead
    this.thrownBy = null;    // who threw it last, so a hit can be blamed on them
    this.thrownAt = -99;
    this.lastSound = -99;
    this.removed = false;
  }

  get pos() { return this.body.pos; }

  /** Blood that lands on it stays where it landed, in the crate's own frame. */
  stain(wx, wy, r) {
    const l = this.body.toLocal(wx, wy);
    const h = this.size / 2;
    l.x = Math.max(-h, Math.min(h, l.x));
    l.y = Math.max(-h, Math.min(h, l.y));
    if (this.stains.length > 60) this.stains.shift();
    this.stains.push({ x: l.x, y: l.y, r, a: Math.random() * Math.PI, flat: 0.6 + Math.random() * 0.4, dark: Math.random() < 0.3 });
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

export class Knife {
  constructor(sandbox, x, y, rot = 0) {
    this.id = nextId++;
    this.kind = 'knife';
    this.name = 'Combat Knife';
    this.sandbox = sandbox;
    this.body = new Body(KNIFE_W, KNIFE_H, 0.35, {
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
  get tip() { return this.body.toWorld(KNIFE_W / 2, 0); }

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
