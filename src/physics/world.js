/* =============================================================================
   The simulation world: Verlet particles + distance constraints (ragdolls and
   the muscle system that animates them) living alongside the impulse based
   rigid bodies, with two-way coupling between the two.
   ========================================================================== */
import { Vector3, Quaternion } from 'three';
import {
  Contact, collideBodies, resetContactPool, solveContacts,
  integrateBody, integratePositions,
} from './rigid.js';

const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3(), _v4 = new Vector3();

let _pid = 1;

/** How much of a muscle correction is allowed to become velocity. */
const MUSCLE_VELOCITY_SHARE = 0.28;
/** ...and the most speed, in m/s, one substep of muscle may add on top. */
const MAX_MUSCLE_DV = 2.0;
/** Metres per second no joint may exceed. Well past a hard fall, well short
    of anything that reads as a body being launched. */
const MAX_PARTICLE_SPEED = 13;
/** How elastic a body-against-flesh contact is. Barely. */
const BODY_RESTITUTION = 0.85;
/** Most speed a single contact may hand to one joint, in m/s. A boulder
    should knock someone flat, not fire an arm across the map. */
const MAX_CONTACT_DV = 10;
/** How hard one body's bones push against another body's. */
const CROSS_BODY_STIFFNESS = 0.45;
/** Deepest overlap two bones may unwind in one solver pass, in metres. */
const MAX_CAPSULE_STEP = 0.03;
/** Deepest overlap two people may unwind in one solver pass, in metres.
    Small on purpose: the solver runs this many times per step, and racing the
    skeleton's own constraints is what pulls limbs long. */
const MAX_SEPARATION_STEP = 0.02;

/* -------------------------------------------------------------------------- */
/*                                  particle                                  */
/* -------------------------------------------------------------------------- */

export class Particle {
  constructor(x = 0, y = 0, z = 0, opts = {}) {
    this.id = _pid++;
    this.x = x; this.y = y; this.z = z;
    this.px = x; this.py = y; this.pz = z;
    // muscle target (where the animation wants this joint to be) and how fast
    // the animation is moving it, in metres per second
    this.tx = x; this.ty = y; this.tz = z;
    this.tvx = 0; this.tvy = 0; this.tvz = 0;
    this.muscle = 0;

    this.mass = opts.mass != null ? opts.mass : 3;
    this.invMass = this.mass > 0 ? 1 / this.mass : 0;
    this.radius = opts.radius != null ? opts.radius : 0.06;
    this.friction = opts.friction != null ? opts.friction : 0.72;
    this.owner = opts.owner || null;
    this.name = opts.name || '';
    this.grounded = false;
    this.lastImpactSpeed = 0;
    this.pinned = false;
    /* How much speed contacts may still hand this particle during the current
       fixed step. Capping each contact on its own is not enough: a boulder
       ploughing through a crowd touches the same joint on every solver pass,
       and a dozen "safe" impulses in a row is still a launch. */
    this.dvBudget = 0;
  }

  get vx() { return this.x - this.px; }
  get vy() { return this.y - this.py; }
  get vz() { return this.z - this.pz; }

  setPosition(x, y, z, keepVelocity = false) {
    if (keepVelocity) {
      const dx = x - this.x, dy = y - this.y, dz = z - this.z;
      this.px += dx; this.py += dy; this.pz += dz;
    } else {
      this.px = x; this.py = y; this.pz = z;
    }
    this.x = x; this.y = y; this.z = z;
  }

  addVelocity(vx, vy, vz, dt) {
    this.px -= vx * dt; this.py -= vy * dt; this.pz -= vz * dt;
  }

  /** Instant velocity in metres/second (needs the substep length). */
  velocity(dt, out) {
    const inv = dt > 0 ? 1 / dt : 0;
    out.set((this.x - this.px) * inv, (this.y - this.py) * inv, (this.z - this.pz) * inv);
    return out;
  }

  speed(dt) { return Math.hypot(this.x - this.px, this.y - this.py, this.z - this.pz) / (dt || 1); }
}

/* -------------------------------------------------------------------------- */
/*                                constraints                                 */
/* -------------------------------------------------------------------------- */

export class DistanceConstraint {
  /** kind: 'eq' | 'min' (never closer) | 'max' (never further) */
  constructor(a, b, rest, kind = 'eq', stiffness = 1) {
    this.a = a; this.b = b; this.rest = rest; this.kind = kind; this.stiffness = stiffness;
    this.enabled = true;
  }
  solve() {
    if (!this.enabled) return;
    const a = this.a, b = this.b;
    let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 1e-7) { dx = 0; dy = 1e-5; dz = 0; d = 1e-5; }
    if (this.kind === 'min' && d >= this.rest) return;
    if (this.kind === 'max' && d <= this.rest) return;
    const wa = a.pinned ? 0 : a.invMass;
    const wb = b.pinned ? 0 : b.invMass;
    const w = wa + wb;
    if (w <= 0) return;
    const diff = ((d - this.rest) / d) * this.stiffness;
    const ka = (wa / w) * diff, kb = (wb / w) * diff;
    a.x += dx * ka; a.y += dy * ka; a.z += dz * ka;
    b.x -= dx * kb; b.y -= dy * kb; b.z -= dz * kb;
  }
}

/**
 * Stops a hinge folding the wrong way once physics has the body.
 *
 * A knee is only a knee because it bends one way. The particle rig has no twist
 * to constrain - a bone is a line between two points, so it cannot corkscrew in
 * the first place - but nothing stops the middle joint of a limb crossing to
 * the wrong side of the line between its neighbours, which is exactly what a
 * backwards knee is. This keeps it on its own side, measured along the body's
 * own forward axis so it works whichever way the body is lying.
 *
 * It is a position correction, so the previous positions travel with it: a
 * joint pushed back where it belongs must not be handed speed for the trip.
 */
export class HingeGuard {
  /**
   * @param {object} frame particles defining the body: hipR, hipL, hip, top
   * @param {number} sign +1 the middle joint stays in front of the line
   *                      -1 it stays behind
   */
  constructor(a, b, c, frame, sign, margin = 0.03) {
    this.a = a; this.b = b; this.c = c;
    this.frame = frame; this.sign = sign; this.margin = margin;
    this.enabled = true;
  }

  solve() {
    if (!this.enabled) return;
    const f = this.frame;
    // right = across the hips, up = along the spine, forward = up x right
    const rx = f.right.x - f.left.x, ry = f.right.y - f.left.y, rz = f.right.z - f.left.z;
    const ux = f.top.x - f.base.x, uy = f.top.y - f.base.y, uz = f.top.z - f.base.z;
    let fx = uy * rz - uz * ry, fy = uz * rx - ux * rz, fz = ux * ry - uy * rx;
    const fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
    if (fl < 1e-6) return;
    fx /= fl; fy /= fl; fz /= fl;
    if (this.sign < 0) { fx = -fx; fy = -fy; fz = -fz; }

    const a = this.a, b = this.b, c = this.c;
    const mx = (a.x + c.x) * 0.5, my = (a.y + c.y) * 0.5, mz = (a.z + c.z) * 0.5;
    const d = (b.x - mx) * fx + (b.y - my) * fy + (b.z - mz) * fz;
    if (d >= this.margin) return;

    // Push the joint back onto its own side, and the ends a little the other
    // way, so the limb folds rather than the whole body sliding.
    const need = this.margin - d;
    const kb = need * 0.62, ke = need * 0.19;
    b.x += fx * kb; b.y += fy * kb; b.z += fz * kb;
    b.px += fx * kb; b.py += fy * kb; b.pz += fz * kb;
    for (const p of [a, c]) {
      p.x -= fx * ke; p.y -= fy * ke; p.z -= fz * ke;
      p.px -= fx * ke; p.py -= fy * ke; p.pz -= fz * ke;
    }
  }
}

/**
 * Closest approach between two line segments, as the parameters along each.
 *
 * The standard clamped solve. Everything about limbs not passing through each
 * other comes down to this: a bone is a segment with a thickness, and two of
 * them are apart if the nearest points on their centre lines are further apart
 * than the two thicknesses added together.
 */
function segmentClosest(a0, a1, b0, b1, out) {
  const dax = a1.x - a0.x, day = a1.y - a0.y, daz = a1.z - a0.z;
  const dbx = b1.x - b0.x, dby = b1.y - b0.y, dbz = b1.z - b0.z;
  const rx = a0.x - b0.x, ry = a0.y - b0.y, rz = a0.z - b0.z;
  const A = dax * dax + day * day + daz * daz;
  const E = dbx * dbx + dby * dby + dbz * dbz;
  const F = dbx * rx + dby * ry + dbz * rz;
  let s = 0, t = 0;
  if (A < 1e-9 && E < 1e-9) { out.s = 0; out.t = 0; return out; }
  if (A < 1e-9) {
    t = F / E;
  } else {
    const C = dax * rx + day * ry + daz * rz;
    if (E < 1e-9) {
      s = -C / A;
    } else {
      const B = dax * dbx + day * dby + daz * dbz;
      const denom = A * E - B * B;
      s = denom > 1e-9 ? (B * F - C * E) / denom : 0;
      s = s < 0 ? 0 : s > 1 ? 1 : s;
      t = (B * s + F) / E;
      if (t < 0) { t = 0; s = -C / A; } else if (t > 1) { t = 1; s = (B - C) / A; }
    }
  }
  out.s = s < 0 ? 0 : s > 1 ? 1 : s;
  out.t = t < 0 ? 0 : t > 1 ? 1 : t;
  return out;
}

const _seg = { s: 0, t: 0 };

/**
 * Pushes two thick bones apart along the line of their closest approach.
 *
 * The correction is shared between each bone's two ends in proportion to where
 * along the bone the contact happened, and weighted by mass, so a forearm
 * caught against a chest moves mostly the forearm. Previous positions travel
 * with it: separating two things that overlap is a position fix, and Verlet
 * would otherwise read it as a shove.
 */
export function collideCapsules(a0, a1, ra, b0, b1, rb, stiffness = 1) {
  segmentClosest(a0, a1, b0, b1, _seg);
  const s = _seg.s, t = _seg.t;
  const ax = a0.x + (a1.x - a0.x) * s, ay = a0.y + (a1.y - a0.y) * s, az = a0.z + (a1.z - a0.z) * s;
  const bx = b0.x + (b1.x - b0.x) * t, by = b0.y + (b1.y - b0.y) * t, bz = b0.z + (b1.z - b0.z) * t;
  let nx = bx - ax, ny = by - ay, nz = bz - az;
  const min = ra + rb;
  let d2 = nx * nx + ny * ny + nz * nz;
  if (d2 >= min * min) return false;
  let d = Math.sqrt(d2);
  if (d < 1e-6) { nx = 0; ny = 1; nz = 0; d = 1e-6; } else { nx /= d; ny /= d; nz /= d; }

  const wa0 = 1 - s, wa1 = s, wb0 = 1 - t, wb1 = t;
  const inv = wa0 * wa0 * a0.invMass + wa1 * wa1 * a1.invMass
            + wb0 * wb0 * b0.invMass + wb1 * wb1 * b1.invMass;
  if (inv <= 1e-9) return false;
  /* Only so far in one pass. Bodies dropped into each other overlap deeply,
     and yanking them apart in a single solve pulls the bones themselves long -
     the separation and the skeleton end up fighting. Unwound a little at a
     time, over the several passes and substeps of a frame, both are satisfied. */
  const pen = Math.min(min - d, MAX_CAPSULE_STEP);
  const k = (pen / inv) * stiffness;

  const push = (p, w, sign) => {
    if (p.invMass <= 0) return;
    const m = sign * k * w * p.invMass;
    p.x += nx * m; p.y += ny * m; p.z += nz * m;
    p.px += nx * m; p.py += ny * m; p.pz += nz * m;
  };
  push(a0, wa0, -1); push(a1, wa1, -1);
  push(b0, wb0, 1); push(b1, wb1, 1);
  return true;
}

/**
 * Every bone of one body against every other bone of the same body.
 *
 * The pairs are worked out once, at build time: anything sharing a joint is
 * skipped, because two bones meeting at a joint are always touching, and so are
 * the handful of pairs that sit against each other by construction - an upper
 * arm lies on the chest whatever anyone does. What is left is every way a limb
 * can genuinely be put somewhere it does not belong.
 *
 * It only runs when it can achieve anything. A body under full muscle control
 * is pinned to an animation that does not intersect itself, and its particles
 * are put back at the end of every substep regardless, so solving this for one
 * would be work thrown away.
 */
export class SelfCollision {
  constructor(owner, pairs) {
    this.owner = owner;
    this.pairs = pairs;
    this.enabled = true;
    this.hits = 0;
  }

  solve() {
    if (!this.enabled || !this.owner.selfCollide) return;
    const pairs = this.pairs;
    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i];
      if (collideCapsules(p.a0, p.a1, p.ra, p.b0, p.b1, p.rb, p.stiffness)) this.hits++;
    }
  }
}

/**
 * Keeps two parts of the same body out of each other.
 *
 * This is what stops an arm being folded through the chest, and it is the only
 * thing keeping a broken bone honest: a break is allowed to turn any way it
 * likes, but it still cannot occupy the same space as the ribs.
 */
export class JointSpacing {
  constructor(a, b, minDist) {
    this.a = a; this.b = b; this.min = minDist;
    this.enabled = true;
  }

  solve() {
    if (!this.enabled) return;
    const a = this.a, b = this.b;
    let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= this.min * this.min) return;
    let d = Math.sqrt(d2);
    if (d < 1e-6) { dx = 0; dy = 1; dz = 0; d = 1e-6; }
    const wsum = a.invMass + b.invMass;
    if (wsum <= 0) return;
    // Separation only: the previous positions come along, so pushing two parts
    // apart never hands either of them speed.
    const push = ((this.min - d) / d) * 0.5;
    const wa = a.invMass / wsum, wb = b.invMass / wsum;
    const ax = dx * push * wa, ay = dy * push * wa, az = dz * push * wa;
    const bx = dx * push * wb, by = dy * push * wb, bz = dz * push * wb;
    a.x -= ax; a.y -= ay; a.z -= az;
    a.px -= ax; a.py -= ay; a.pz -= az;
    b.x += bx; b.y += by; b.z += bz;
    b.px += bx; b.py += by; b.pz += bz;
  }
}

/* -------------------------------------------------------------------------- */
/*                                   world                                    */
/* -------------------------------------------------------------------------- */

export class PhysicsWorld {
  constructor() {
    this.gravity = new Vector3(0, -22, 0);
    this.particles = [];
    this.constraints = [];
    this.segments = [];         // { a, b, radius, part } capsule-ish limbs
    this.bodies = [];
    this.staticBodies = [];
    this.characters = [];

    this.groundY = 0;
    this.groundMin = new Vector3(-40, -1, -40);
    this.groundMax = new Vector3(40, 0, 40);
    this.hasGround = true;
    this.killY = -40;

    this.substeps = 3;
    this.constraintIters = 6;
    this.contactIters = 8;
    this.accumulator = 0;
    this.fixedStep = 1 / 90;
    this.timeScale = 1;
    this.time = 0;

    this._contacts = [];
    // Uniform grid broadphase, rebuilt once per fixed step. Without it every
    // particle would be tested against every body, six times an iteration.
    this._grid = new Map();
    this._gridCell = 2.0;
    this._gridBodies = [];
    this._gridOversized = [];   // too big to index; always considered
    this.onImpact = null;       // ({point, normal, speed, target, source}) => void
    this.onKillPlane = null;
  }

  /* ------------------------------ registration --------------------------- */

  addParticle(p) { this.particles.push(p); return p; }
  removeParticle(p) { const i = this.particles.indexOf(p); if (i >= 0) this.particles.splice(i, 1); }
  /**
   * @param {boolean} [first] solve this one BEFORE the rest each pass.
   *
   * Order matters inside a pass: whatever solves last has the final word. The
   * bones' own lengths have to be last, or a body pushed out of itself ends the
   * pass with its limbs pulled long, so anything that separates parts - joint
   * guards, self collision - goes to the front and lets the skeleton answer.
   */
  addConstraint(c, first = false) {
    if (first) this.constraints.unshift(c); else this.constraints.push(c);
    return c;
  }
  addSegment(s) { this.segments.push(s); return s; }

  addBody(b) {
    if (b.isStatic) this.staticBodies.push(b); else this.bodies.push(b);
    return b;
  }
  removeBody(b) {
    let i = this.bodies.indexOf(b); if (i >= 0) this.bodies.splice(i, 1);
    i = this.staticBodies.indexOf(b); if (i >= 0) this.staticBodies.splice(i, 1);
  }

  addCharacter(c) { this.characters.push(c); }
  removeCharacter(c) {
    const i = this.characters.indexOf(c); if (i >= 0) this.characters.splice(i, 1);
    this.particles = this.particles.filter((p) => p.owner !== c);
    /* Constraints come in two shapes: most name the particles they act on,
       while the self collision solver owns a whole body's worth of pairs and
       names the body instead. Both have to go when their owner does. */
    this.constraints = this.constraints.filter((k) => (k.owner
      ? k.owner !== c
      : !(k.a && k.a.owner === c) && !(k.b && k.b.owner === c)));
    this.segments = this.segments.filter((s) => s.a.owner !== c);
  }

  clearDynamic() {
    this.bodies.length = 0;
  }

  /**
   * How long one substep is. Anything handing a particle a velocity has to
   * measure it against THIS, not against the fixed step: a Verlet particle
   * stores speed as a position offset, so using the wrong slice multiplies
   * every push by the substep count.
   */
  get substepDt() { return this.fixedStep / this.substeps; }

  /* --------------------------------- step -------------------------------- */

  step(dt) {
    dt = Math.min(dt, 0.05) * this.timeScale;
    this.accumulator += dt;
    let guard = 0;
    while (this.accumulator >= this.fixedStep && guard++ < 6) {
      this.accumulator -= this.fixedStep;
      this._fixedStep(this.fixedStep);
      this.time += this.fixedStep;
    }
    if (guard >= 6) this.accumulator = 0;
  }

  _fixedStep(dt) {
    const h = dt / this.substeps;
    this._rebuildBroadphase();
    for (let i = 0; i < this.particles.length; i++) this.particles[i].dvBudget = MAX_CONTACT_DV;
    for (let s = 0; s < this.substeps; s++) {
      for (let i = 0; i < this.characters.length; i++) this.characters[i].preSubstep(h, this);
      this._stepBodies(h);
      this._stepParticles(h);
      for (let i = 0; i < this.characters.length; i++) this.characters[i].postSubstep(h, this);
    }
    this._cullFallen();
  }

  /* ----------------------------- broadphase ------------------------------ */

  _rebuildBroadphase() {
    const grid = this._grid;
    grid.clear();
    const all = this._gridBodies;
    all.length = 0;
    this._gridOversized.length = 0;
    for (let i = 0; i < this.staticBodies.length; i++) all.push(this.staticBodies[i]);
    for (let i = 0; i < this.bodies.length; i++) all.push(this.bodies[i]);
    const c = this._gridCell;
    // Padded, so a body still lands in every cell it could reach during the
    // substeps this grid has to survive, plus a particle's own radius.
    const pad = 0.5;
    for (let i = 0; i < all.length; i++) {
      const b = all[i];
      const x0 = Math.floor((b.aabbMin.x - pad) / c), x1 = Math.floor((b.aabbMax.x + pad) / c);
      const y0 = Math.floor((b.aabbMin.y - pad) / c), y1 = Math.floor((b.aabbMax.y + pad) / c);
      const z0 = Math.floor((b.aabbMin.z - pad) / c), z1 = Math.floor((b.aabbMax.z + pad) / c);
      // A body spanning a silly number of cells is not worth indexing finely;
      // it goes on the always-test list instead of being dropped.
      if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > 512) {
        this._gridOversized.push(b);
        continue;
      }
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          for (let z = z0; z <= z1; z++) {
            const key = x * 73856093 ^ y * 19349663 ^ z * 83492791;
            let list = grid.get(key);
            if (!list) { list = []; grid.set(key, list); }
            list.push(b);
          }
        }
      }
    }
  }

  _bodiesNear(x, y, z) {
    const c = this._gridCell;
    const key = Math.floor(x / c) * 73856093 ^ Math.floor(y / c) * 19349663 ^ Math.floor(z / c) * 83492791;
    return this._grid.get(key);
  }

  /* ------------------------------- bodies -------------------------------- */

  _stepBodies(dt) {
    const bodies = this.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (b.sleeping) continue;
      integrateBody(b, dt, this.gravity);
    }

    resetContactPool();
    resetWorldContacts();
    const contacts = this._contacts;
    contacts.length = 0;

    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      if (a.sleeping) continue;
      if (this.hasGround) this._groundContacts(a, contacts);
      for (let j = 0; j < this.staticBodies.length; j++) {
        const s = this.staticBodies[j];
        if (!aabbOverlap(a, s)) continue;
        collideBodies(a, s, contacts);
      }
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (a.sleeping && b.sleeping) continue;
        if (!aabbOverlap(a, b)) continue;
        collideBodies(a, b, contacts);
      }
    }

    // Report the hard hits so the gore layer can react.
    if (this.onImpact) {
      for (let i = 0; i < contacts.length; i++) {
        const c = contacts[i];
        const rel = _v1.copy(c.a.vel);
        if (c.b && !c.b.isStatic) rel.sub(c.b.vel);
        const sp = -rel.dot(c.normal);
        if (sp > 5) this.onImpact({ point: c.point, normal: c.normal, speed: sp, bodyA: c.a, bodyB: c.b });
      }
    }

    solveContacts(contacts, dt, this.contactIters);

    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      integratePositions(b, dt);
      if (b.canSleep) {
        const still = b.vel.lengthSq() < 0.02 && b.angVel.lengthSq() < 0.04;
        b.sleepTimer = still ? b.sleepTimer + dt : 0;
        if (b.sleepTimer > 0.7) { b.sleeping = true; b.vel.set(0, 0, 0); b.angVel.set(0, 0, 0); }
      }
    }
  }

  _groundContacts(body, out) {
    const gy = this.groundY;
    if (body.aabbMin.y > gy) return;
    if (body.pos.x < this.groundMin.x - 2 || body.pos.x > this.groundMax.x + 2 ||
        body.pos.z < this.groundMin.z - 2 || body.pos.z > this.groundMax.z + 2) return;

    if (body.shape === 'sphere') {
      const depth = body.radius - (body.pos.y - gy);
      if (depth <= 0) return;
      const c = pushContact(out, body, null);
      c.normal.set(0, 1, 0);
      c.depth = depth;
      c.point.set(body.pos.x, gy, body.pos.z);
      return;
    }
    const h = body.half;
    for (let i = 0; i < 8; i++) {
      const s = CORNER[i];
      _v1.set(s[0] * h.x, s[1] * h.y, s[2] * h.z).applyQuaternion(body.quat).add(body.pos);
      const depth = gy - _v1.y;
      if (depth <= 0) continue;
      if (_v1.x < this.groundMin.x || _v1.x > this.groundMax.x ||
          _v1.z < this.groundMin.z || _v1.z > this.groundMax.z) continue;
      const c = pushContact(out, body, null);
      c.normal.set(0, 1, 0);
      c.depth = depth;
      c.point.copy(_v1);
    }
  }

  /* ------------------------------ particles ------------------------------ */

  _stepParticles(dt) {
    const ps = this.particles;
    const gx = this.gravity.x * dt * dt, gy = this.gravity.y * dt * dt, gz = this.gravity.z * dt * dt;
    const drag = 0.9975;

    const maxStep = MAX_PARTICLE_SPEED * dt;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.pinned) { p.px = p.x; p.py = p.y; p.pz = p.z; continue; }
      let vx = (p.x - p.px) * drag, vy = (p.y - p.py) * drag, vz = (p.z - p.pz) * drag;
      // Nothing in a human body has any business moving this fast; if it does,
      // something upstream has gone wrong and this stops it leaving the map.
      const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (sp > maxStep) { const s2 = maxStep / sp; vx *= s2; vy *= s2; vz *= s2; }
      p.px = p.x; p.py = p.y; p.pz = p.z;
      p.x += vx + gx; p.y += vy + gy; p.z += vz + gz;
      p.grounded = false;
    }

    // muscles pull the ragdoll towards the animated pose
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.muscle <= 0) continue;
      if (p.muscle >= 0.999) {
        /* Pinned to the animation. The previous position has to be derived
           from the target's real speed and THIS substep, not from where the
           target sat a whole frame ago - otherwise every joint carries a
           velocity inflated by the substep ratio, and the moment the
           character ragdolls the body is flung apart by it. */
        p.x = p.tx; p.y = p.ty; p.z = p.tz;
        p.px = p.tx - p.tvx * dt;
        p.py = p.ty - p.tvy * dt;
        p.pz = p.tz - p.tvz * dt;
      } else {
        /* Verlet reads any position edit as velocity, so pulling a limb
           towards its animated pose every substep pumps energy in and the
           ragdoll winds itself up until it flies. Move the previous position
           along with it, so only a share of the correction survives as speed,
           and cap that share: the further the body has been shoved from its
           animated pose - exactly what a boulder does - the bigger the
           correction, and an uncapped share of a big correction is a launch.
           A muscle may pull a limb home; it may not throw it there. */
        const k = p.muscle * p.muscle * 0.45;
        const dx = (p.tx - p.x) * k, dy = (p.ty - p.y) * k, dz = (p.tz - p.z) * k;
        p.x += dx; p.y += dy; p.z += dz;
        let sx = dx * MUSCLE_VELOCITY_SHARE, sy = dy * MUSCLE_VELOCITY_SHARE, sz = dz * MUSCLE_VELOCITY_SHARE;
        const lim = MAX_MUSCLE_DV * dt;
        const m2 = sx * sx + sy * sy + sz * sz;
        if (m2 > lim * lim) {
          const s2 = lim / Math.sqrt(m2);
          sx *= s2; sy *= s2; sz *= s2;
        }
        p.px += dx - sx; p.py += dy - sy; p.pz += dz - sz;
      }
    }

    for (let it = 0; it < this.constraintIters; it++) {
      const cs = this.constraints;
      for (let i = 0; i < cs.length; i++) cs[i].solve();
      const last = it === this.constraintIters - 1;
      this._collideParticles(dt, last, it >= this.constraintIters - 2);
    }

    /* Two guarantees about what leaves a substep.
       One: a joint held by a working muscle is where the animation says it is,
       moving at the speed the animation says. The solver spends six iterations
       dragging such a joint about to satisfy its neighbours, and every one of
       those position edits would otherwise read as speed - which is how a body
       shoved by a boulder while still under animation used to come apart at
       forty metres a second.
       Two: nothing at all leaves faster than a person can credibly move. */
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.pinned) continue;
      if (p.muscle >= 0.999) {
        p.x = p.tx; p.y = p.ty; p.z = p.tz;
        p.px = p.tx - p.tvx * dt;
        p.py = p.ty - p.tvy * dt;
        p.pz = p.tz - p.tvz * dt;
        continue;
      }
      const dx = p.x - p.px, dy = p.y - p.py, dz = p.z - p.pz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > maxStep) {
        const k = maxStep / d;
        p.px = p.x - dx * k; p.py = p.y - dy * k; p.pz = p.z - dz * k;
      }
    }
  }

  _collideParticles(dt, lastIteration, closingIterations) {
    const ps = this.particles;
    const gy = this.groundY;

    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.pinned) continue;
      // ---- ground ----
      if (this.hasGround && p.y - p.radius < gy &&
          p.x > this.groundMin.x && p.x < this.groundMax.x &&
          p.z > this.groundMin.z && p.z < this.groundMax.z) {
        const pen = gy - (p.y - p.radius);
        // Move the previous position with it: separating two overlapping
        // things is a position fix, and Verlet would otherwise read it as a
        // launch.
        p.y += pen; p.py += pen;
        p.grounded = true;
        // tangential friction
        const f = p.friction;
        p.px += (p.x - p.px) * f * 0.55;
        p.pz += (p.z - p.pz) * f * 0.55;
        if (p.py > p.y) p.py = p.y;
        if (lastIteration) {
          const impact = -(p.y - p.py) / dt;
          if (impact > 4.5) this._reportParticleImpact(p, 0, 1, 0, impact);
        }
      }
      // ---- crates, boulders and map parts, via the broadphase ----
      const near = this._bodiesNear(p.x, p.y, p.z);
      if (near) {
        for (let j = 0; j < near.length; j++) this._particleVsBody(p, near[j], dt, lastIteration);
      }
      const big = this._gridOversized;
      for (let j = 0; j < big.length; j++) this._particleVsBody(p, big[j], dt, lastIteration);
    }

    // Limbs and body-to-body pushing are expensive and do not need solving on
    // every constraint iteration, so they run on the closing ones only.
    if (!closingIterations) return;

    // ---- limbs as segments (so forearms do not sink into the floor) ----
    for (let i = 0; i < this.segments.length; i++) {
      const s = this.segments[i];
      if (s.disabled) continue;
      this._collideSegment(s, dt);
    }

    // ---- character vs character ----
    this._collideCharacters();
  }

  _particleVsBody(p, body, dt, report) {
    if (p.x + p.radius < body.aabbMin.x || p.x - p.radius > body.aabbMax.x ||
        p.y + p.radius < body.aabbMin.y || p.y - p.radius > body.aabbMax.y ||
        p.z + p.radius < body.aabbMin.z || p.z - p.radius > body.aabbMax.z) return;

    _v1.set(p.x, p.y, p.z);
    body.closestPoint(_v1, _v2);
    _v3.copy(_v1).sub(_v2);
    let d = _v3.length();
    let inside = false;
    if (d < 1e-7 || body.containsPoint(_v1)) {
      // deep inside: escape along the shortest axis
      if (body.shape === 'sphere') {
        _v3.copy(_v1).sub(body.pos);
        if (_v3.lengthSq() < 1e-9) _v3.set(0, 1, 0);
        _v3.normalize();
        d = -(body.radius - _v1.distanceTo(body.pos));
      } else {
        body.worldToLocal(_v1, _v4);
        const h = body.half;
        const px = h.x - Math.abs(_v4.x), py = h.y - Math.abs(_v4.y), pz = h.z - Math.abs(_v4.z);
        let axis = 0, pen = px;
        if (py < pen) { axis = 1; pen = py; }
        if (pz < pen) { axis = 2; pen = pz; }
        const sign = _v4.getComponent(axis) >= 0 ? 1 : -1;
        _v3.set(0, 0, 0).setComponent(axis, sign).applyQuaternion(body.quat);
        d = -pen;
      }
      inside = true;
    } else {
      _v3.multiplyScalar(1 / d);
    }
    const pen = p.radius - d;
    if (!inside && pen <= 0) return;

    // Separate them. This is a position correction, so the previous position
    // travels with it - otherwise a boulder ploughing through a crowd hands
    // out tens of metres per second of free velocity through depenetration
    // alone.
    p.x += _v3.x * pen; p.y += _v3.y * pen; p.z += _v3.z * pen;
    p.px += _v3.x * pen; p.py += _v3.y * pen; p.pz += _v3.z * pen;
    if (_v3.y > 0.55) p.grounded = true;

    // Relative velocity along the normal for the coupling impulse.
    const inv = 1 / dt;
    _v4.set((p.x - p.px) * inv, (p.y - p.py) * inv, (p.z - p.pz) * inv);
    if (body.invMass > 0) {
      body.pointVelocity(_v2, _v1);
      _v4.sub(_v1);
    }
    const vn = _v4.dot(_v3);
    if (vn < 0) {
      const eff = p.invMass + body.invMass;
      if (eff > 1e-8) {
        // Flesh does not bounce, and no joint may be handed more than a
        // survivable amount of speed by the contacts of one step.
        let j = (-BODY_RESTITUTION * vn) / eff;
        const want = j * p.invMass;
        const spend = Math.min(want, p.dvBudget);
        if (want > 1e-9) j *= spend / want;
        p.dvBudget -= spend;
        if (j > 1e-9) {
          // particle side
          p.px -= _v3.x * j * p.invMass * dt;
          p.py -= _v3.y * j * p.invMass * dt;
          p.pz -= _v3.z * j * p.invMass * dt;
          if (body.invMass > 0) {
            _v1.copy(_v3).multiplyScalar(-j * 0.85);
            body.applyImpulse(_v1, _v2);
          }
        }
        if (report && -vn > 5.5) this._reportParticleImpact(p, _v3.x, _v3.y, _v3.z, -vn, body);
      }
    }
    // surface friction
    const f = p.friction * 0.5;
    const tx = (p.x - p.px), ty = (p.y - p.py), tz = (p.z - p.pz);
    const dn = tx * _v3.x + ty * _v3.y + tz * _v3.z;
    p.px += (tx - _v3.x * dn) * f;
    p.py += (ty - _v3.y * dn) * f;
    p.pz += (tz - _v3.z * dn) * f;
  }

  _collideSegment(s, dt) {
    const a = s.a, b = s.b;
    const r = s.radius;
    for (let k = 1; k <= 2; k++) {
      const t = k / 3;
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
      let ny = 0, pen = 0;
      if (this.hasGround && y - r < this.groundY &&
          x > this.groundMin.x && x < this.groundMax.x && z > this.groundMin.z && z < this.groundMax.z) {
        pen = this.groundY - (y - r); ny = 1;
      }
      if (pen > 0) {
        const wa = (1 - t), wb = t;
        const norm = wa * wa + wb * wb;
        a.y += ny * pen * (wa / norm) * 0.5;
        b.y += ny * pen * (wb / norm) * 0.5;
        a.grounded = true; b.grounded = true;
      }
    }
  }

  _collideCharacters() {
    const chars = this.characters;
    for (let i = 0; i < chars.length; i++) {
      const A = chars[i];
      if (!A.collidable) continue;
      for (let j = i + 1; j < chars.length; j++) {
        const B = chars[j];
        if (!B.collidable) continue;
        if (Math.abs(A.center.x - B.center.x) > 2.4 || Math.abs(A.center.z - B.center.z) > 2.4 ||
            Math.abs(A.center.y - B.center.y) > 2.6) continue;
        /* Bone against bone, so an arm cannot be put through someone else's
           chest either. The joint spheres below still run: they catch the
           head-on cases the capsules resolve slowly. */
        /* Skip only when neither body can move: two people both pinned to
           their animations have their particles put back anyway, and the
           capsule around each body keeps them apart at that range. */
        if (A.solids && B.solids && (A.selfCollide || B.selfCollide ||
            A.strength < 0.999 || B.strength < 0.999)) {
          for (let m = 0; m < A.solids.length; m++) {
            const ca = A.solids[m];
            for (let n = 0; n < B.solids.length; n++) {
              const cb = B.solids[n];
              collideCapsules(ca.a, ca.b, ca.r, cb.a, cb.b, cb.r, CROSS_BODY_STIFFNESS);
            }
          }
        }

        const pa = A.collisionParticles, pb = B.collisionParticles;
        for (let m = 0; m < pa.length; m++) {
          const p = pa[m];
          for (let n = 0; n < pb.length; n++) {
            const q = pb[n];
            const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z;
            const rr = p.radius + q.radius;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= rr * rr || d2 < 1e-9) continue;
            const d = Math.sqrt(d2);
            const wsum = p.invMass + q.invMass;
            if (wsum <= 0) continue;
            /* Separation only, never propulsion. This is a position edit, and
               Verlet reads any position edit as speed, so the previous
               position travels with it - otherwise two ragdolls dropped into
               each other trade the whole overlap for velocity and fire apart.
               The step is capped as well, so a deep spawn overlap unwinds over
               a few substeps instead of teleporting limbs. */
            const overlap = Math.min(rr - d, MAX_SEPARATION_STEP);
            const push = (overlap / d) * 0.4;
            const wp = p.invMass / wsum, wq = q.invMass / wsum;
            const ax = dx * push * wp, ay = dy * push * wp, az = dz * push * wp;
            const bx = dx * push * wq, by = dy * push * wq, bz = dz * push * wq;
            p.x -= ax; p.y -= ay; p.z -= az;
            p.px -= ax; p.py -= ay; p.pz -= az;
            q.x += bx; q.y += by; q.z += bz;
            q.px += bx; q.py += by; q.pz += bz;
          }
        }
      }
    }
  }

  _reportParticleImpact(p, nx, ny, nz, speed, body) {
    if (!this.onImpact) return;
    _v1.set(p.x - nx * p.radius, p.y - ny * p.radius, p.z - nz * p.radius);
    _v2.set(nx, ny, nz);
    this.onImpact({ point: _v1, normal: _v2, speed, particle: p, character: p.owner, bodyB: body || null });
  }

  _cullFallen() {
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      if (b.pos.y < this.killY) { this.onKillPlane?.({ body: b }); }
    }
    for (let i = 0; i < this.characters.length; i++) {
      const c = this.characters[i];
      if (c.center.y < this.killY) this.onKillPlane?.({ character: c });
    }
  }

  /* -------------------------------- queries ------------------------------ */

  /** Ray against every rigid body. Returns {body, point, distance, normal} or null. */
  raycastBodies(origin, dir, maxDist = 100, filter = null) {
    let best = null;
    const all = this.bodies;
    for (let i = 0; i < all.length; i++) {
      const b = all[i];
      if (filter && !filter(b)) continue;
      const t = b.shape === 'sphere'
        ? raySphere(origin, dir, b.pos, b.radius)
        : rayOBB(origin, dir, b);
      if (t != null && t >= 0 && t < maxDist && (!best || t < best.distance)) {
        best = { body: b, distance: t };
      }
    }
    if (best) {
      best.point = new Vector3().copy(dir).multiplyScalar(best.distance).add(origin);
      best.normal = new Vector3();
      if (best.body.shape === 'sphere') best.normal.copy(best.point).sub(best.body.pos).normalize();
      else {
        best.body.worldToLocal(best.point, _v1);
        const h = best.body.half;
        const ax = Math.abs(_v1.x) / h.x, ay = Math.abs(_v1.y) / h.y, az = Math.abs(_v1.z) / h.z;
        if (ax >= ay && ax >= az) best.normal.set(Math.sign(_v1.x), 0, 0);
        else if (ay >= az) best.normal.set(0, Math.sign(_v1.y), 0);
        else best.normal.set(0, 0, Math.sign(_v1.z));
        best.normal.applyQuaternion(best.body.quat);
      }
    }
    return best;
  }

  /** Ray against the ground plate. */
  raycastGround(origin, dir, maxDist = 200) {
    if (!this.hasGround || Math.abs(dir.y) < 1e-6) return null;
    const t = (this.groundY - origin.y) / dir.y;
    if (t < 0 || t > maxDist) return null;
    const x = origin.x + dir.x * t, z = origin.z + dir.z * t;
    if (x < this.groundMin.x || x > this.groundMax.x || z < this.groundMin.z || z > this.groundMax.z) return null;
    return { distance: t, point: new Vector3(x, this.groundY, z), normal: new Vector3(0, 1, 0), ground: true };
  }
}

/* -------------------------------------------------------------------------- */
/*                                  helpers                                   */
/* -------------------------------------------------------------------------- */

const CORNER = [
  [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1],
];

function aabbOverlap(a, b) {
  return a.aabbMin.x <= b.aabbMax.x && a.aabbMax.x >= b.aabbMin.x &&
         a.aabbMin.y <= b.aabbMax.y && a.aabbMax.y >= b.aabbMin.y &&
         a.aabbMin.z <= b.aabbMax.z && a.aabbMax.z >= b.aabbMin.z;
}

/* Ground contacts get their own pool; it is rewound once per body step. */
const _worldContacts = [];
let _wcIndex = 0;
function resetWorldContacts() { _wcIndex = 0; }
function pushContact(out, a, b) {
  if (_wcIndex >= _worldContacts.length) _worldContacts.push(new Contact());
  const c = _worldContacts[_wcIndex++];
  c.a = a; c.b = b; c.impulse = 0;
  out.push(c);
  return c;
}

export function raySphere(origin, dir, center, radius) {
  const ox = origin.x - center.x, oy = origin.y - center.y, oz = origin.z - center.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t0 = -b - s, t1 = -b + s;
  if (t0 >= 0) return t0;
  if (t1 >= 0) return t1;
  return null;
}

/** Slab test in the body's local frame. */
export function rayOBB(origin, dir, body) {
  body.worldToLocal(origin, _v1);
  _v2.copy(dir).applyQuaternion(_conjugate(body.quat));
  return raySlab(_v1, _v2, body.half);
}

const _qc = new Quaternion();
function _conjugate(q) { return _qc.set(-q.x, -q.y, -q.z, q.w); }

export function raySlab(o, d, half) {
  let tmin = -Infinity, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const oi = i === 0 ? o.x : i === 1 ? o.y : o.z;
    const di = i === 0 ? d.x : i === 1 ? d.y : d.z;
    const h = i === 0 ? half.x : i === 1 ? half.y : half.z;
    if (Math.abs(di) < 1e-9) {
      if (oi < -h || oi > h) return null;
    } else {
      let t1 = (-h - oi) / di, t2 = (h - oi) / di;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : tmax;
}

