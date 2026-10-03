/* =============================================================================
   Rigid bodies, solved with extended position based dynamics (XPBD - Müller,
   Macklin et al., "Detailed Rigid Body Simulation with Extended Position
   Based Dynamics", 2020).

   Each body part of a human is its own rigid box with its own mass and
   inertia. Parts are held together by joints at the places they actually
   meet - a knee joins the thigh to the shin, nothing else - and each joint
   carries the limits of the joint it copies: knees and elbows are hinges
   that only fold one way, hips and shoulders are cones with a twist limit.
   So when muscle control is gone, every part swings on its own and drags
   its neighbours only through the joint.

   A body is one of:
     static     - never moves (the platforms)
     kinematic  - moved by the game along a path (a person under full muscle
                  control, a held weapon); pushes dynamic bodies, is never
                  pushed back
     dynamic    - simulated. Optionally "driven": pulled toward a target pose
                  with a given compliance, which is what a muscle is
   ========================================================================== */
import { Vector3, Quaternion } from 'three';
import { quatAxes, boxBox, boxPlane, boxOverlap, ContactPoint } from './collide.js';

export const GRAVITY = -9.81;

let _bodyId = 1;

const _t1 = new Vector3(), _t2 = new Vector3(), _t3 = new Vector3(), _t4 = new Vector3();
const _t5 = new Vector3(), _t6 = new Vector3(), _t7 = new Vector3(), _t8 = new Vector3();
const _qc = new Quaternion(), _q1 = new Quaternion();

export class Body {
  /**
   * half: half extents of the box. mass in kg.
   * kind: 'dynamic' | 'kinematic' | 'static'
   */
  constructor({ half, mass = 1, kind = 'dynamic', friction = 0.6, restitution = 0.05 }) {
    this.id = _bodyId++;
    this.half = new Vector3().copy(half);
    this.radius = this.half.length();
    this.x = new Vector3();
    this.q = new Quaternion();
    this.v = new Vector3();
    this.w = new Vector3();
    this.prevX = new Vector3();
    this.prevQ = new Quaternion();
    this.axes = new Float64Array(9);
    quatAxes(this.q, this.axes);

    // the path a kinematic body follows this step, or a driven body's target
    this.kFrom = { x: new Vector3(), q: new Quaternion() };
    this.kTo = { x: new Vector3(), q: new Quaternion() };
    this.kv = new Vector3();   // target velocity
    this.kw = new Vector3();   // target angular velocity

    this.isStatic = kind === 'static';
    this.slab = false;       // static and axis aligned: its top is a plane
    this.ghost = false;      // passes through everything (a strike in flight)
    this.soft = 0;           // seconds left of easing out of overlaps it was born into
    this.kinematic = kind === 'kinematic';
    this.sleeping = false;
    this.friction = friction;
    this.restitution = restitution;
    this.linDamp = 0.02;
    this.angDamp = 0.12;
    this.invI = new Vector3();
    this.setMass(mass);

    /** Muscle: null, or { pos, rot } compliances and { lin, ang } damping rates. */
    this.drive = null;

    this.owner = null;      // whatever this belongs to (a human, a prop)
    this.part = -1;         // index of the body part, for humans
    this.world = null;
    this.impact = 0;        // hardest approach speed into anything this step
    this.impactOther = null;
    this._mark = 0;
  }

  setMass(mass) {
    this.mass = mass;
    const hx = this.half.x, hy = this.half.y, hz = this.half.z;
    // a box, with a floor so a blade does not spin up like a drill bit
    const floor = mass * 0.0006;
    const ix = Math.max(floor, (mass / 3) * (hy * hy + hz * hz));
    const iy = Math.max(floor, (mass / 3) * (hx * hx + hz * hz));
    const iz = Math.max(floor, (mass / 3) * (hx * hx + hy * hy));
    this.inertia = new Vector3(ix, iy, iz);
    this.invMass = this.isStatic || this.kinematic ? 0 : 1 / mass;
    this.invI.set(1 / ix, 1 / iy, 1 / iz);
    if (this.isStatic || this.kinematic) this.invI.set(0, 0, 0);
  }

  get dynamic() { return !this.isStatic && !this.kinematic && !this.sleeping; }

  setPose(x, q) {
    this.x.copy(x); this.q.copy(q);
    this.prevX.copy(x); this.prevQ.copy(q);
    this.kFrom.x.copy(x); this.kFrom.q.copy(q);
    this.kTo.x.copy(x); this.kTo.q.copy(q);
    quatAxes(this.q, this.axes);
  }

  /** Makes the body kinematic (true) or dynamic (false). Keeps its motion. */
  setKinematic(on) {
    if (this.isStatic || this.kinematic === on) return;
    this.kinematic = on;
    if (on) {
      this.kFrom.x.copy(this.x); this.kFrom.q.copy(this.q);
      this.kTo.x.copy(this.x); this.kTo.q.copy(this.q);
      this.invMass = 0; this.invI.set(0, 0, 0);
    } else {
      this.invMass = 1 / this.mass;
      this.invI.set(1 / this.inertia.x, 1 / this.inertia.y, 1 / this.inertia.z);
      this.v.copy(this.kv); this.w.copy(this.kw);
      // an animated body may be overlapping something the moment it is let go
      // (two fighters with their arms tangled); ease out rather than explode
      this.soft = 0.25;
    }
  }

  /** Where this body (kinematic) or its muscle target (driven) goes this step. */
  setTarget(x, q, dt, snap = false) {
    if (snap) { this.kFrom.x.copy(x); this.kFrom.q.copy(q); }
    else { this.kFrom.x.copy(this.kTo.x); this.kFrom.q.copy(this.kTo.q); }
    this.kTo.x.copy(x); this.kTo.q.copy(q);
    if (dt > 0) {
      this.kv.subVectors(this.kTo.x, this.kFrom.x).multiplyScalar(1 / dt);
      angularVelocity(this.kFrom.q, this.kTo.q, dt, this.kw);
    }
  }

  /** Inverse mass seen by a push along unit n at offset r from the centre. */
  wPos(r, n) {
    if (!this.dynamic) return 0;
    rotInv(this.q, r.y * n.z - r.z * n.y, r.z * n.x - r.x * n.z, r.x * n.y - r.y * n.x);
    const I = this.invI;
    return this.invMass + _o[0] * _o[0] * I.x + _o[1] * _o[1] * I.y + _o[2] * _o[2] * I.z;
  }

  /** Inverse inertia seen by a rotation about unit n. */
  wRot(n) {
    if (!this.dynamic) return 0;
    rotInv(this.q, n.x, n.y, n.z);
    const I = this.invI;
    return _o[0] * _o[0] * I.x + _o[1] * _o[1] * I.y + _o[2] * _o[2] * I.z;
  }

  /** out = I^-1 v, in world space. */
  invInertiaMul(v, out) {
    rotInv(this.q, v.x, v.y, v.z);
    const I = this.invI;
    rot(this.q, _o[0] * I.x, _o[1] * I.y, _o[2] * I.z);
    return out.set(_o[0], _o[1], _o[2]);
  }

  /** Small rotation by the rotation vector (rx,ry,rz). */
  rotate(rx, ry, rz) {
    const q = this.q;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    q.x += 0.5 * (rx * qw + ry * qz - rz * qy);
    q.y += 0.5 * (ry * qw + rz * qx - rx * qz);
    q.z += 0.5 * (rz * qw + rx * qy - ry * qx);
    q.w += 0.5 * (-rx * qx - ry * qy - rz * qz);
    q.normalize();
  }

  /** Positional impulse p applied at offset r (world). sign +1 or -1. */
  applyPosCorrection(p, r, sign) {
    if (!this.dynamic) return;
    this.x.addScaledVector(p, this.invMass * sign);
    if (r) {
      const t = _t7.crossVectors(r, p).multiplyScalar(sign);
      this.invInertiaMul(t, t);
      this.rotate(t.x, t.y, t.z);
    }
  }

  applyRotCorrection(p, sign) {
    if (!this.dynamic) return;
    const t = _t7.copy(p).multiplyScalar(sign);
    this.invInertiaMul(t, t);
    this.rotate(t.x, t.y, t.z);
  }

  /** Velocity impulse p at offset r. */
  applyImpulse(p, r, sign = 1) {
    if (!this.dynamic) return;
    this.v.addScaledVector(p, this.invMass * sign);
    if (r) {
      const t = _t7.crossVectors(r, p).multiplyScalar(sign);
      this.invInertiaMul(t, t);
      this.w.add(t);
    }
  }

  /** Velocity of the material point at world position p. */
  pointVelocity(p, out) {
    _t6.subVectors(p, this.x);
    return out.crossVectors(this.w, _t6).add(this.v);
  }

  /** World position of a point given in this body's frame. */
  toWorld(local, out) { return out.copy(local).applyQuaternion(this.q).add(this.x); }

  /** This body's frame coordinates of a world point. */
  toLocal(world, out) {
    rotInv(this.q, world.x - this.x.x, world.y - this.x.y, world.z - this.x.z);
    return out.set(_o[0], _o[1], _o[2]);
  }
}

/* Rotating vectors by a quaternion, without allocating, into _o. */
const _o = new Float64Array(3);
function rot(q, x, y, z) {
  const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  _o[0] = x + qw * tx + qy * tz - qz * ty;
  _o[1] = y + qw * ty + qz * tx - qx * tz;
  _o[2] = z + qw * tz + qx * ty - qy * tx;
}
function rotInv(q, x, y, z) {
  const qx = -q.x, qy = -q.y, qz = -q.z, qw = q.w;
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  _o[0] = x + qw * tx + qy * tz - qz * ty;
  _o[1] = y + qw * ty + qz * tx - qx * tz;
  _o[2] = z + qw * tz + qx * ty - qy * tx;
}

/** Normalised linear blend of two rotations: slerp for the small steps between substeps. */
function nlerp(out, a, b, t) {
  let bx = b.x, by = b.y, bz = b.z, bw = b.w;
  if (a.x * bx + a.y * by + a.z * bz + a.w * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; }
  const x = a.x + (bx - a.x) * t, y = a.y + (by - a.y) * t, z = a.z + (bz - a.z) * t, w = a.w + (bw - a.w) * t;
  const l = 1 / Math.sqrt(x * x + y * y + z * z + w * w);
  out.set(x * l, y * l, z * l, w * l);
}

/** Angular velocity that turns q0 into q1 over dt. */
export function angularVelocity(q0, q1, dt, out) {
  _q1.copy(q0).conjugate().premultiply(q1);     // q1 * q0^-1
  const s = _q1.w < 0 ? -2 / dt : 2 / dt;
  return out.set(_q1.x * s, _q1.y * s, _q1.z * s);
}

/* -------------------------------------------------------------------------- */
/*                                   joints                                   */
/* -------------------------------------------------------------------------- */

export class Joint {
  /**
   * a: parent, b: child. anchorA/anchorB: where the joint is, in each frame.
   * opts.type 'ball': cone (coneAxis in a, boneAxis in b, coneAngle) and
   *   twist (twistRef in both frames, twistMin/twistMax, about the bone axis)
   * opts.type 'hinge': hinge axis (in both frames), ref (perpendicular, in both
   *   frames), min/max - the signed angle from a's ref to b's ref about the axis
   */
  constructor(a, b, anchorA, anchorB, opts = {}) {
    this.a = a; this.b = b;
    this.anchorA = new Vector3().copy(anchorA);
    this.anchorB = new Vector3().copy(anchorB);
    this.type = opts.type || 'ball';
    this.coneAxis = new Vector3().copy(opts.coneAxis || new Vector3(0, -1, 0)).normalize();
    this.boneAxisA = new Vector3().copy(opts.boneAxis || new Vector3(0, -1, 0)).normalize();
    this.boneAxis = new Vector3().copy(opts.boneAxis || new Vector3(0, -1, 0)).normalize();
    this.coneAngle = opts.coneAngle != null ? opts.coneAngle : Math.PI;
    this.twistRef = new Vector3().copy(opts.twistRef || new Vector3(0, 0, 1)).normalize();
    this.twistMin = opts.twistMin != null ? opts.twistMin : -Math.PI;
    this.twistMax = opts.twistMax != null ? opts.twistMax : Math.PI;
    this.hinge = new Vector3().copy(opts.hinge || new Vector3(1, 0, 0)).normalize();
    this.ref = new Vector3().copy(opts.ref || new Vector3(0, -1, 0)).normalize();
    this.min = opts.min != null ? opts.min : -Math.PI;
    this.max = opts.max != null ? opts.max : Math.PI;
    this.damping = opts.damping != null ? opts.damping : 6;
    this.enabled = true;
  }
}

/* -------------------------------------------------------------------------- */
/*                                  contacts                                  */
/* -------------------------------------------------------------------------- */

class Contact {
  constructor() {
    this.a = null; this.b = null;
    this.n = new Vector3();
    this.rA = new Vector3();   // anchor in a's frame
    this.rB = new Vector3();   // anchor in b's frame
    this.lambdaN = 0; this.lambdaT = 0;
    this.vnPre = 0;
    this.friction = 0.6; this.restitution = 0;
    this.kin = false;
  }
}

const MAX_KINEMATIC_PUSH = 0.005;
const MAX_KINEMATIC_DV = 2.2;
const MAX_SOFT_PUSH = 0.0025;      // metres per substep for a body just let go   // metres per substep a kinematic body may shove
const MAX_SPEED = 35;
const MAX_SPIN = 50;
const CELL = 1.25;

/* -------------------------------------------------------------------------- */
/*                                   world                                    */
/* -------------------------------------------------------------------------- */

export class World {
  constructor() {
    this.bodies = [];
    this.statics = [];
    this.joints = [];
    this.substeps = 8;
    this.gravity = GRAVITY;
    this.filter = null;       // (a, b) => may they collide
    this.onSubstep = null;    // (h, alpha) after each substep
    this.onWake = null;       // (body) a sleeping body was hit
    this._pairs = [];
    this._contacts = [];
    this._pool = [];
    this._nContacts = 0;
    this._grid = new Map();
    this._cellPool = [];
    this._stamp = 1;
    this._pts = [];
    for (let i = 0; i < 4; i++) this._pts.push(new ContactPoint());
    this.stats = { pairs: 0, contacts: 0 };
  }

  add(body) {
    if (body.world) return body;
    body.world = this;
    if (body.isStatic) {
      quatAxes(body.q, body.axes);
      this.statics.push(body);
      body.aabbMin = new Vector3(); body.aabbMax = new Vector3();
      const m = body.axes, h = body.half;
      for (let i = 0; i < 3; i++) {
        const r = Math.abs(m[i]) * h.x + Math.abs(m[3 + i]) * h.y + Math.abs(m[6 + i]) * h.z;
        body.aabbMin.setComponent(i, body.x.getComponent(i) - r);
        body.aabbMax.setComponent(i, body.x.getComponent(i) + r);
      }
    } else {
      this.bodies.push(body);
    }
    return body;
  }

  remove(body) {
    if (body.world !== this) return;
    body.world = null;
    const list = body.isStatic ? this.statics : this.bodies;
    const i = list.indexOf(body);
    if (i >= 0) list.splice(i, 1);
  }

  addJoint(j) { this.joints.push(j); return j; }
  removeJoint(j) { const i = this.joints.indexOf(j); if (i >= 0) this.joints.splice(i, 1); }

  step(dt) {
    const n = this.substeps, h = dt / n;
    for (const b of this.bodies) {
      b.impact = 0; b.impactOther = null;
      if (b.soft > 0) b.soft -= dt;
    }
    this._broadphase(dt);
    for (let s = 0; s < n; s++) {
      const alpha = (s + 1) / n;
      this._integrate(h, alpha);
      this._narrow();
      this._solvePositions(h, alpha);
      this._updateVelocities(h);
      this._solveVelocities(h);
      if (this.onSubstep) this.onSubstep(h, alpha);
    }
  }

  /* ------------------------------ broad phase ----------------------------- */

  _cell(key) {
    let c = this._grid.get(key);
    if (!c) {
      c = this._cellPool.pop() || [];
      this._grid.set(key, c);
    }
    return c;
  }

  _broadphase(dt) {
    for (const c of this._grid.values()) { c.length = 0; this._cellPool.push(c); }
    this._grid.clear();
    const bodies = this.bodies;
    for (const b of bodies) {
      const move = b.kinematic ? b.kTo.x.distanceTo(b.kFrom.x) : b.sleeping ? 0 : b.v.length() * dt;
      const r = b.radius + move + 0.04;
      b._bp = r;
      const x0 = Math.floor((b.x.x - r) / CELL), x1 = Math.floor((b.x.x + r) / CELL);
      const z0 = Math.floor((b.x.z - r) / CELL), z1 = Math.floor((b.x.z + r) / CELL);
      b._c0 = x0; b._c1 = x1; b._c2 = z0; b._c3 = z1;
      for (let i = x0; i <= x1; i++) {
        for (let k = z0; k <= z1; k++) this._cell((i + 4096) * 8192 + (k + 4096)).push(b);
      }
    }
    const pairs = this._pairs;
    pairs.length = 0;
    for (const a of bodies) {
      if (!a.dynamic) continue;
      const stamp = ++this._stamp;
      a._mark = stamp;
      for (let i = a._c0; i <= a._c1; i++) {
        for (let k = a._c2; k <= a._c3; k++) {
          const cell = this._grid.get((i + 4096) * 8192 + (k + 4096));
          if (!cell) continue;
          for (const b of cell) {
            if (b._mark === stamp) continue;
            b._mark = stamp;
            if (b.dynamic && b.id < a.id) continue;
            if (b.ghost) continue;
            const rr = a._bp + b._bp;
            if (a.x.distanceToSquared(b.x) > rr * rr) continue;
            if (this.filter && !this.filter(a, b)) continue;
            pairs.push(a, b);
          }
        }
      }
    }
    this.stats.pairs = pairs.length / 2;

    // something moved by the game (a walking leg) bumping a sleeping body wakes it
    if (!this.onWake) return;
    for (const a of bodies) {
      if (!a.kinematic || a.ghost || a._bp - a.radius < 0.045) continue;
      const stamp = ++this._stamp;
      for (let i = a._c0; i <= a._c1; i++) {
        for (let k = a._c2; k <= a._c3; k++) {
          const cell = this._grid.get((i + 4096) * 8192 + (k + 4096));
          if (!cell) continue;
          for (const b of cell) {
            if (!b.sleeping || b._mark === stamp) continue;
            b._mark = stamp;
            const rr = a.radius + b.radius;
            if (a.x.distanceToSquared(b.x) > rr * rr) continue;
            if (this.filter && !this.filter(a, b)) continue;
            if (boxOverlap(a.x, a.axes, a.half, b.x, b.axes, b.half) > 0) this.onWake(b);
          }
        }
      }
    }
  }

  /* ------------------------------- integrate ------------------------------ */

  _integrate(h, alpha) {
    const g = this.gravity * h;
    for (const b of this.bodies) {
      b.prevX.copy(b.x); b.prevQ.copy(b.q);
      if (b.kinematic) {
        b.x.lerpVectors(b.kFrom.x, b.kTo.x, alpha);
        nlerp(b.q, b.kFrom.q, b.kTo.q, alpha);
        quatAxes(b.q, b.axes);
        continue;
      }
      if (b.sleeping) continue;
      b.v.y += g;
      const ld = 1 / (1 + b.linDamp * h), ad = 1 / (1 + b.angDamp * h);
      b.v.multiplyScalar(ld);
      b.w.multiplyScalar(ad);
      b.x.addScaledVector(b.v, h);
      b.rotate(b.w.x * h, b.w.y * h, b.w.z * h);
      quatAxes(b.q, b.axes);
    }
  }

  /* ------------------------------ narrow phase ---------------------------- */

  _contact() {
    let c = this._contacts[this._nContacts];
    if (!c) { c = new Contact(); this._contacts.push(c); }
    this._nContacts++;
    return c;
  }

  _addContacts(a, b, count) {
    const pts = this._pts;
    for (let i = 0; i < count; i++) {
      const p = pts[i];
      const c = this._contact();
      c.a = a; c.b = b;
      c.n.set(p.nx, p.ny, p.nz);
      _t1.set(p.ax, p.ay, p.az);
      _t2.set(p.bx, p.by, p.bz);
      a.toLocal(_t1, c.rA);
      b.toLocal(_t2, c.rB);
      c.lambdaN = 0; c.lambdaT = 0;
      c.friction = Math.sqrt(a.friction * b.friction);
      c.restitution = Math.max(a.restitution, b.restitution);
      c.kin = a.kinematic || b.kinematic;
      // approach speed along the normal, before anything is solved
      a.pointVelocity(_t1, _t3);
      if (b.isStatic || b.sleeping) _t4.set(0, 0, 0);
      else if (b.kinematic) { _t5.subVectors(_t2, b.x); _t4.crossVectors(b.kw, _t5).add(b.kv); }
      else b.pointVelocity(_t2, _t4);
      const vaN = _t3.dot(c.n);
      const vn = _t3.sub(_t4).dot(c.n);
      c.vnPre = vn;
      if (-vn > a.impact) { a.impact = -vn; a.impactOther = b; }
      if (b.dynamic && -vn > b.impact) { b.impact = -vn; b.impactOther = a; }
      // something moved by the game records how fast the other came at it, on its own
      if (b.kinematic && -vaN > b.impact) { b.impact = -vaN; b.impactOther = a; }
      if (b.sleeping && -vn > 0.6 && this.onWake) this.onWake(b);
    }
  }

  _narrow() {
    this._nContacts = 0;
    const pairs = this._pairs, pts = this._pts;
    for (let i = 0; i < pairs.length; i += 2) {
      const a = pairs[i], b = pairs[i + 1];
      if (!a.dynamic || a.ghost || b.ghost) continue;
      if (!a.world || !b.world) continue;
      const rr = a.radius + b.radius;
      if (a.x.distanceToSquared(b.x) > rr * rr) continue;
      const n = boxBox(a.x, a.axes, a.half, b.x, b.axes, b.half, pts, 4);
      if (n) this._addContacts(a, b, n);
    }
    for (const a of this.bodies) {
      if (!a.dynamic) continue;
      const r = a.radius;
      for (const s of this.statics) {
        if (a.x.x + r < s.aabbMin.x || a.x.x - r > s.aabbMax.x ||
            a.x.y + r < s.aabbMin.y || a.x.y - r > s.aabbMax.y ||
            a.x.z + r < s.aabbMin.z || a.x.z - r > s.aabbMax.z) continue;
        let n;
        if (s.slab && a.x.x - r > s.aabbMin.x && a.x.x + r < s.aabbMax.x &&
            a.x.z - r > s.aabbMin.z && a.x.z + r < s.aabbMax.z) {
          // well inside an axis aligned slab: only its top can be touched
          n = boxPlane(a.x, a.axes, a.half, s.aabbMax.y, pts, 4);
        } else {
          n = boxBox(a.x, a.axes, a.half, s.x, s.axes, s.half, pts, 4);
        }
        if (n) this._addContacts(a, s, n);
      }
    }
    this.stats.contacts = this._nContacts;
  }

  /* ---------------------------- position solve ---------------------------- */

  /** Moves the point rA on a by +corr and the point rB on b by -corr, shared by inverse mass. */
  _positional(a, b, corr, rA, rB, compliance, h) {
    const c = corr.length();
    if (c < 1e-9) return 0;
    const nrm = _t1.copy(corr).multiplyScalar(1 / c);
    const wA = a ? a.wPos(rA || _zero, nrm) : 0;
    const wB = b ? b.wPos(rB || _zero, nrm) : 0;
    const alpha = compliance / (h * h);
    const den = wA + wB + alpha;
    if (den < 1e-12) return 0;
    const dl = c / den;
    const p = _t2.copy(nrm).multiplyScalar(dl);
    if (a) a.applyPosCorrection(p, rA, 1);
    if (b) b.applyPosCorrection(p, rB, -1);
    return dl;
  }

  /** Rotates a by +rot and b by -rot, shared by inverse inertia. */
  _angular(a, b, rot, compliance, h) {
    const th = rot.length();
    if (th < 1e-9) return;
    const nrm = _t1.copy(rot).multiplyScalar(1 / th);
    const wA = a ? a.wRot(nrm) : 0;
    const wB = b ? b.wRot(nrm) : 0;
    const alpha = compliance / (h * h);
    const den = wA + wB + alpha;
    if (den < 1e-12) return;
    const p = _t2.copy(nrm).multiplyScalar(th / den);
    if (a) a.applyRotCorrection(p, 1);
    if (b) b.applyRotCorrection(p, -1);
  }

  /** Keeps the signed angle from n1 to n2 about n inside [lo, hi]. */
  _limitAngle(a, b, n, n1, n2, lo, hi, h) {
    let phi = Math.asin(Math.max(-1, Math.min(1, _t3.crossVectors(n1, n2).dot(n))));
    if (n1.dot(n2) < 0) phi = Math.PI - phi;
    if (phi > Math.PI) phi -= 2 * Math.PI;
    if (phi < -Math.PI) phi += 2 * Math.PI;
    if (phi >= lo && phi <= hi) return;
    phi = Math.max(lo, Math.min(hi, phi));
    _q1.setFromAxisAngle(n, phi);
    const m1 = _t4.copy(n1).applyQuaternion(_q1);
    const corr = _t5.crossVectors(m1, n2);
    this._angular(a, b, corr, 0, h);
  }

  _solveJoint(j, h) {
    const a = j.a, b = j.b;
    if (!a.dynamic && !b.dynamic) return;
    if (j.type === 'hinge') {
      // keep the hinge axes together
      const ha = _t6.copy(j.hinge).applyQuaternion(a.q);
      const hb = _t7.copy(j.hinge).applyQuaternion(b.q);
      this._angular(a, b, _t3.crossVectors(ha, hb), 0, h);
      // and the fold inside its range
      ha.copy(j.hinge).applyQuaternion(a.q);
      const n1 = _jA.copy(j.ref).applyQuaternion(a.q);
      const n2 = _jB.copy(j.ref).applyQuaternion(b.q);
      n1.addScaledVector(ha, -n1.dot(ha)).normalize();
      n2.addScaledVector(ha, -n2.dot(ha)).normalize();
      this._limitAngle(a, b, _jN.copy(ha), n1, n2, j.min, j.max, h);
    } else {
      // swing: the child's bone may not leave the cone
      const a1 = _jA.copy(j.coneAxis).applyQuaternion(a.q);
      const a2 = _jB.copy(j.boneAxis).applyQuaternion(b.q);
      const cos = Math.max(-1, Math.min(1, a1.dot(a2)));
      const ang = Math.acos(cos);
      if (ang > j.coneAngle) {
        const ax = _t6.crossVectors(a1, a2);
        const len = ax.length();
        if (len > 1e-6) {
          ax.multiplyScalar((ang - j.coneAngle) / len);
          this._angular(a, b, ax, 0, h);
        }
      }
      // twist about the bone
      if (j.twistMin > -Math.PI || j.twistMax < Math.PI) {
        const b1 = _jA.copy(j.boneAxisA).applyQuaternion(a.q);
        const b2 = _jB.copy(j.boneAxis).applyQuaternion(b.q);
        const nn = _jN.addVectors(b1, b2);
        if (nn.lengthSq() > 0.01) {
          nn.normalize();
          const n1 = _jA.copy(j.twistRef).applyQuaternion(a.q);
          const n2 = _jB.copy(j.twistRef).applyQuaternion(b.q);
          n1.addScaledVector(nn, -n1.dot(nn)).normalize();
          n2.addScaledVector(nn, -n2.dot(nn)).normalize();
          this._limitAngle(a, b, nn, n1, n2, j.twistMin, j.twistMax, h);
        }
      }
    }
    this._joinJoint(j, h);
  }

  /** The joint itself: the two anchors are one point. */
  _joinJoint(j, h) {
    const a = j.a, b = j.b;
    const rA = _jRA.copy(j.anchorA).applyQuaternion(a.q);
    const rB = _jRB.copy(j.anchorB).applyQuaternion(b.q);
    const corr = _jC.copy(b.x).add(rB).sub(a.x).sub(rA);
    this._positional(a, b, corr, rA, rB, 0, h);
  }

  _solveDrive(b, h, alpha) {
    const d = b.drive;
    const tx = _t3.lerpVectors(b.kFrom.x, b.kTo.x, alpha);
    const corr = tx.sub(b.x);
    if (d.pos != null) this._positional(b, null, corr, null, null, d.pos, h);
    if (d.rot != null) {
      nlerp(_q2, b.kFrom.q, b.kTo.q, alpha);
      _q2.multiply(_qc.copy(b.q).conjugate());       // target * current^-1
      const s = _q2.w < 0 ? -2 : 2;
      const rv = _t4.set(_q2.x * s, _q2.y * s, _q2.z * s);
      this._angular(b, null, rv, d.rot, h);
    }
  }

  _solvePositions(h, alpha) {
    for (const j of this.joints) if (j.enabled) this._solveJoint(j, h);
    for (const b of this.bodies) if (b.drive && b.dynamic) this._solveDrive(b, h, alpha);

    const cs = this._contacts;
    for (let i = 0; i < this._nContacts; i++) {
      const c = cs[i];
      const a = c.a, b = c.b;
      const rA = _cRA.copy(c.rA).applyQuaternion(a.q);
      const rB = _cRB.copy(c.rB).applyQuaternion(b.q);
      const pA = _cPA.copy(a.x).add(rA);
      const pB = _cPB.copy(b.x).add(rB);
      let d = _t3.subVectors(pB, pA).dot(c.n);
      if (d <= 0) continue;
      if (c.kin && d > MAX_KINEMATIC_PUSH) d = MAX_KINEMATIC_PUSH;
      if ((a.soft > 0 || b.soft > 0) && !b.isStatic && d > MAX_SOFT_PUSH) d = MAX_SOFT_PUSH;
      const wA = a.wPos(rA, c.n), wB = b.wPos(rB, c.n);
      const w = wA + wB;
      if (w < 1e-12) continue;
      const dl = d / w;
      c.lambdaN += dl;
      const p = _t4.copy(c.n).multiplyScalar(dl);
      a.applyPosCorrection(p, rA, 1);
      b.applyPosCorrection(p, rB, -1);

      // static friction: undo the sliding of the two contact points this
      // substep, as long as the push it takes stays inside the friction cone
      rA.copy(c.rA).applyQuaternion(a.q);
      rB.copy(c.rB).applyQuaternion(b.q);
      pA.copy(a.x).add(rA);
      pB.copy(b.x).add(rB);
      const qa = _t5.copy(c.rA).applyQuaternion(a.prevQ).add(a.prevX);
      const qb = _t6.copy(c.rB).applyQuaternion(b.prevQ).add(b.prevX);
      const dp = _t7.subVectors(pA, qa).sub(pB).add(qb);
      dp.addScaledVector(c.n, -dp.dot(c.n));
      const lt = dp.length();
      if (lt < 1e-9) continue;
      const tdir = _t8a.copy(dp).multiplyScalar(1 / lt);
      const wt = a.wPos(rA, tdir) + b.wPos(rB, tdir);
      if (wt < 1e-12) continue;
      const dlt = lt / wt;
      if (c.lambdaT + dlt > c.friction * 1.15 * c.lambdaN) continue;
      c.lambdaT += dlt;
      const pt = _t4.copy(tdir).multiplyScalar(-dlt);
      a.applyPosCorrection(pt, rA, 1);
      b.applyPosCorrection(pt, rB, -1);
    }

    // contacts shove parts about; pull the joints back together after them
    for (const j of this.joints) {
      if (j.enabled && (j.a.dynamic || j.b.dynamic)) this._joinJoint(j, h);
    }
  }

  _updateVelocities(h) {
    const inv = 1 / h;
    for (const b of this.bodies) {
      if (b.kinematic) {
        b.v.subVectors(b.x, b.prevX).multiplyScalar(inv);
        angularVelocity(b.prevQ, b.q, h, b.w);
        continue;
      }
      if (!b.dynamic) continue;
      b.v.subVectors(b.x, b.prevX).multiplyScalar(inv);
      angularVelocity(b.prevQ, b.q, h, b.w);
    }
  }

  _solveVelocities(h) {
    const cs = this._contacts;
    const gh = Math.abs(this.gravity) * h * 2;
    for (let i = 0; i < this._nContacts; i++) {
      const c = cs[i];
      if (c.lambdaN <= 0) continue;
      const a = c.a, b = c.b;
      const rA = _cRA.copy(c.rA).applyQuaternion(a.q);
      const rB = _cRB.copy(c.rB).applyQuaternion(b.q);
      const va = _t3.crossVectors(a.w, rA).add(a.v);
      const vb = b.isStatic || b.sleeping ? _t4.set(0, 0, 0) : _t4.crossVectors(b.w, rB).add(b.v);
      const vr = va.sub(vb);
      const vn = vr.dot(c.n);
      const dv = _t5.set(0, 0, 0);
      const vt = _t6.copy(vr).addScaledVector(c.n, -vn);
      const vtl = vt.length();
      if (vtl > 1e-6) {
        const fn = c.lambdaN / (h * h);
        const f = Math.min(h * c.friction * fn, vtl);
        dv.addScaledVector(vt, -f / vtl);
      }
      const e = Math.abs(c.vnPre) <= gh ? 0 : c.restitution;
      let dn = -vn + Math.max(-e * c.vnPre, 0);
      // something moved by the game is not a battering ram
      if (c.kin && dn > MAX_KINEMATIC_DV) dn = MAX_KINEMATIC_DV;
      dv.addScaledVector(c.n, dn);
      const dl = dv.length();
      if (dl < 1e-9) continue;
      const dir = _t7.copy(dv).multiplyScalar(1 / dl);
      const w = a.wPos(rA, dir) + b.wPos(rB, dir);
      if (w < 1e-12) continue;
      const p = _t8a.copy(dv).multiplyScalar(1 / w);
      a.applyImpulse(p, rA, 1);
      b.applyImpulse(p, rB, -1);
    }

    // joints: a little friction in every joint, so a limb swings and settles
    // instead of pendulum-ing forever
    for (const j of this.joints) {
      if (!j.enabled || j.damping <= 0) continue;
      const a = j.a, b = j.b;
      if (!a.dynamic && !b.dynamic) continue;
      const dw = _t3.subVectors(b.w, a.w);
      const k = Math.min(1, j.damping * h);
      dw.multiplyScalar(k);
      const l = dw.length();
      if (l < 1e-9) continue;
      const dir = _t4.copy(dw).multiplyScalar(1 / l);
      const wsum = a.wRot(dir) + b.wRot(dir);
      if (wsum < 1e-12) continue;
      const p = _t5.copy(dw).multiplyScalar(1 / wsum);
      if (a.dynamic) { a.invInertiaMul(p, _t6); a.w.add(_t6); }
      if (b.dynamic) { b.invInertiaMul(p, _t6); b.w.sub(_t6); }
    }

    // muscles damp toward the motion they are trying to make
    for (const b of this.bodies) {
      if (!b.dynamic) continue;
      const d = b.drive;
      if (d) {
        if (d.lin) b.v.lerp(b.kv, Math.min(1, d.lin * h));
        if (d.ang) b.w.lerp(b.kw, Math.min(1, d.ang * h));
      }
      const sp = b.v.length();
      if (sp > MAX_SPEED) b.v.multiplyScalar(MAX_SPEED / sp);
      const sw = b.w.length();
      if (sw > MAX_SPIN) b.w.multiplyScalar(MAX_SPIN / sw);
    }
  }
}

const _zero = new Vector3();
const _jA = new Vector3(), _jB = new Vector3(), _jN = new Vector3();
const _jRA = new Vector3(), _jRB = new Vector3(), _jC = new Vector3();
const _cRA = new Vector3(), _cRB = new Vector3(), _cPA = new Vector3(), _cPB = new Vector3();
const _t8a = new Vector3();
const _q2 = new Quaternion();
