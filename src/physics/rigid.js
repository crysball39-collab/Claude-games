/* =============================================================================
   Impulse based rigid bodies. Only two shapes are needed for the sandbox:
   an oriented box (crates, map parts) and a sphere (boulders, which get their
   rolling for free out of the friction impulses at the contact point).
   ========================================================================== */
import { Vector3, Quaternion, Matrix3, Matrix4 } from 'three';
import { clamp } from '../core/util.js';

let _uid = 1;

const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3(), _v4 = new Vector3();
const _v5 = new Vector3(), _v6 = new Vector3(), _v7 = new Vector3();
const _q1 = new Quaternion();
const _m1 = new Matrix3(), _m2 = new Matrix3();
const _mat4 = new Matrix4();

const BOX_CORNERS = [
  [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1],
];
const FACE_NORMALS = [
  new Vector3(1, 0, 0), new Vector3(-1, 0, 0),
  new Vector3(0, 1, 0), new Vector3(0, -1, 0),
  new Vector3(0, 0, 1), new Vector3(0, 0, -1),
];

export class RigidBody {
  constructor(opts = {}) {
    this.id = _uid++;
    this.shape = opts.shape || 'box';
    this.half = new Vector3().copy(opts.half || new Vector3(0.5, 0.5, 0.5));
    this.radius = opts.radius != null ? opts.radius : 0.5;

    this.pos = new Vector3().copy(opts.pos || new Vector3());
    this.quat = new Quaternion().copy(opts.quat || new Quaternion());
    this.vel = new Vector3().copy(opts.vel || new Vector3());
    this.angVel = new Vector3().copy(opts.angVel || new Vector3());

    this.isStatic = !!opts.isStatic;
    this.mass = this.isStatic ? 0 : (opts.mass != null ? opts.mass : 20);
    this.invMass = this.isStatic || this.mass <= 0 ? 0 : 1 / this.mass;

    this.friction = opts.friction != null ? opts.friction : 0.55;
    this.restitution = opts.restitution != null ? opts.restitution : 0.06;
    this.linDamp = opts.linDamp != null ? opts.linDamp : 0.16;   // per second
    this.angDamp = opts.angDamp != null ? opts.angDamp : 0.28;   // per second
    this.rollFriction = opts.rollFriction != null ? opts.rollFriction : 0.0;

    this.userData = opts.userData || {};
    this.tag = opts.tag || '';
    this.mesh = null;
    this.dead = false;

    this.sleeping = false;
    this.sleepTimer = 0;
    this.canSleep = opts.canSleep !== false;

    this.invInertiaLocal = new Vector3();
    this.invInertiaWorld = new Matrix3();
    this.aabbMin = new Vector3();
    this.aabbMax = new Vector3();

    this.computeInertia();
    this.updateDerived();
  }

  computeInertia() {
    if (this.invMass === 0) { this.invInertiaLocal.set(0, 0, 0); return; }
    if (this.shape === 'sphere') {
      const i = 0.4 * this.mass * this.radius * this.radius;
      this.invInertiaLocal.set(1 / i, 1 / i, 1 / i);
    } else {
      const w = this.half.x * 2, h = this.half.y * 2, d = this.half.z * 2;
      const k = this.mass / 12;
      const ix = k * (h * h + d * d), iy = k * (w * w + d * d), iz = k * (w * w + h * h);
      this.invInertiaLocal.set(1 / ix, 1 / iy, 1 / iz);
    }
  }

  updateDerived() {
    // invInertiaWorld = R * diag(invI) * R^T
    if (this.invMass === 0) {
      this.invInertiaWorld.set(0, 0, 0, 0, 0, 0, 0, 0, 0);
    } else {
      _m1.setFromMatrix4(_mat4FromQuat(this.quat));
      const e = _m1.elements;
      const a = this.invInertiaLocal;
      // M = R * D
      const m = _m2.elements;
      m[0] = e[0] * a.x; m[1] = e[1] * a.x; m[2] = e[2] * a.x;
      m[3] = e[3] * a.y; m[4] = e[4] * a.y; m[5] = e[5] * a.y;
      m[6] = e[6] * a.z; m[7] = e[7] * a.z; m[8] = e[8] * a.z;
      // invIW = M * R^T.  Matrix3 is column major, so element (row r, col c)
      // of a matrix X is X.elements[c * 3 + r], and R^T(k, c) = R(c, k).
      const o = this.invInertiaWorld.elements;
      for (let c = 0; c < 3; c++) {
        for (let r = 0; r < 3; r++) {
          o[c * 3 + r] = m[0 * 3 + r] * e[0 * 3 + c] + m[1 * 3 + r] * e[1 * 3 + c] + m[2 * 3 + r] * e[2 * 3 + c];
        }
      }
    }
    this.updateAABB();
  }

  updateAABB() {
    if (this.shape === 'sphere') {
      this.aabbMin.set(this.pos.x - this.radius, this.pos.y - this.radius, this.pos.z - this.radius);
      this.aabbMax.set(this.pos.x + this.radius, this.pos.y + this.radius, this.pos.z + this.radius);
    } else {
      const e = _mat4FromQuat(this.quat).elements;
      const ex = Math.abs(e[0]) * this.half.x + Math.abs(e[4]) * this.half.y + Math.abs(e[8]) * this.half.z;
      const ey = Math.abs(e[1]) * this.half.x + Math.abs(e[5]) * this.half.y + Math.abs(e[9]) * this.half.z;
      const ez = Math.abs(e[2]) * this.half.x + Math.abs(e[6]) * this.half.y + Math.abs(e[10]) * this.half.z;
      this.aabbMin.set(this.pos.x - ex, this.pos.y - ey, this.pos.z - ez);
      this.aabbMax.set(this.pos.x + ex, this.pos.y + ey, this.pos.z + ez);
    }
  }

  /** World-space velocity of the material point at `p`. */
  pointVelocity(p, out) {
    out.copy(p).sub(this.pos).cross(this.angVel).multiplyScalar(-1).add(this.vel);
    return out;
  }

  applyImpulse(imp, point) {
    if (this.invMass === 0) return;
    this.vel.addScaledVector(imp, this.invMass);
    _v7.copy(point).sub(this.pos).cross(imp).applyMatrix3(this.invInertiaWorld);
    this.angVel.add(_v7);
    this.wake();
  }

  applyForceImpulse(imp) {
    if (this.invMass === 0) return;
    this.vel.addScaledVector(imp, this.invMass);
    this.wake();
  }

  wake() { this.sleeping = false; this.sleepTimer = 0; }

  localToWorld(local, out) { return out.copy(local).applyQuaternion(this.quat).add(this.pos); }
  worldToLocal(world, out) {
    out.copy(world).sub(this.pos);
    _q1.copy(this.quat).invert();
    return out.applyQuaternion(_q1);
  }

  /** Closest point on this body's surface/volume to a world point. */
  closestPoint(world, out) {
    if (this.shape === 'sphere') {
      out.copy(world).sub(this.pos);
      const l = out.length() || 1e-6;
      return out.multiplyScalar(Math.min(l, this.radius) / l).add(this.pos);
    }
    this.worldToLocal(world, out);
    out.x = clamp(out.x, -this.half.x, this.half.x);
    out.y = clamp(out.y, -this.half.y, this.half.y);
    out.z = clamp(out.z, -this.half.z, this.half.z);
    return out.applyQuaternion(this.quat).add(this.pos);
  }

  containsPoint(world) {
    if (this.shape === 'sphere') return world.distanceToSquared(this.pos) < this.radius * this.radius;
    this.worldToLocal(world, _v6);
    return Math.abs(_v6.x) < this.half.x && Math.abs(_v6.y) < this.half.y && Math.abs(_v6.z) < this.half.z;
  }
}

/* Reused Matrix4 for quaternion -> basis conversions. */
function _mat4FromQuat(q) { return _mat4.makeRotationFromQuaternion(q); }

/* ========================================================================== */
/*                             contact generation                             */
/* ========================================================================== */

export class Contact {
  constructor() {
    this.a = null; this.b = null;
    this.point = new Vector3();
    this.normal = new Vector3();   // points from b towards a
    this.depth = 0;
    this.impulse = 0;
  }
}

const contactPool = [];
let contactCount = 0;
function nextContact() {
  if (contactCount === contactPool.length) contactPool.push(new Contact());
  const c = contactPool[contactCount++];
  c.impulse = 0;
  return c;
}

/** Adds the contacts between two bodies to `out`. */
export function collideBodies(a, b, out) {
  if (a.shape === 'sphere' && b.shape === 'sphere') return sphereSphere(a, b, out);
  if (a.shape === 'sphere' && b.shape === 'box') return sphereBox(a, b, out);
  if (a.shape === 'box' && b.shape === 'sphere') return sphereBox(b, a, out, true);
  return boxBox(a, b, out);
}

function sphereSphere(a, b, out) {
  _v1.copy(a.pos).sub(b.pos);
  const d = _v1.length();
  const r = a.radius + b.radius;
  if (d >= r || d < 1e-9) return;
  const c = nextContact();
  c.a = a; c.b = b;
  c.normal.copy(_v1).multiplyScalar(1 / d);
  c.depth = r - d;
  c.point.copy(b.pos).addScaledVector(c.normal, b.radius);
  out.push(c);
}

function sphereBox(s, box, out, flip = false) {
  box.closestPoint(s.pos, _v1);
  _v2.copy(s.pos).sub(_v1);
  let d = _v2.length();
  let inside = false;
  if (d < 1e-9) {
    // Centre is inside the box: escape through the nearest face.
    box.worldToLocal(s.pos, _v3);
    let best = Infinity, axis = 0, sign = 1;
    const h = [box.half.x, box.half.y, box.half.z];
    const p = [_v3.x, _v3.y, _v3.z];
    for (let i = 0; i < 3; i++) {
      const pen = h[i] - Math.abs(p[i]);
      if (pen < best) { best = pen; axis = i; sign = p[i] >= 0 ? 1 : -1; }
    }
    _v2.set(0, 0, 0);
    _v2.setComponent(axis, sign);
    _v2.applyQuaternion(box.quat);
    d = -best;
    inside = true;
  } else {
    _v2.multiplyScalar(1 / d);
  }
  if (!inside && d >= s.radius) return;
  const c = nextContact();
  const depth = s.radius - d;
  if (flip) {
    c.a = box; c.b = s;
    c.normal.copy(_v2).multiplyScalar(-1);
  } else {
    c.a = s; c.b = box;
    c.normal.copy(_v2);
  }
  c.depth = depth;
  c.point.copy(_v1);
  out.push(c);
}

/**
 * Corner based box/box test. It misses pure edge-edge configurations but is
 * stable, cheap, and perfectly adequate for crates tumbling on a baseplate.
 */
function boxBox(a, b, out) {
  cornersInto(a, b, out, false);
  cornersInto(b, a, out, true);
}

function cornersInto(src, dst, out, flip) {
  const h = src.half;
  for (let i = 0; i < 8; i++) {
    const cc = BOX_CORNERS[i];
    _v1.set(cc[0] * h.x, cc[1] * h.y, cc[2] * h.z).applyQuaternion(src.quat).add(src.pos);
    dst.worldToLocal(_v1, _v2);
    const dx = dst.half.x - Math.abs(_v2.x);
    if (dx <= 0) continue;
    const dy = dst.half.y - Math.abs(_v2.y);
    if (dy <= 0) continue;
    const dz = dst.half.z - Math.abs(_v2.z);
    if (dz <= 0) continue;

    let axis = 0, pen = dx;
    if (dy < pen) { axis = 1; pen = dy; }
    if (dz < pen) { axis = 2; pen = dz; }
    const sign = _v2.getComponent(axis) >= 0 ? 1 : -1;
    _v3.set(0, 0, 0).setComponent(axis, sign).applyQuaternion(dst.quat);

    const c = nextContact();
    if (flip) { c.a = dst; c.b = src; c.normal.copy(_v3).multiplyScalar(-1); }
    else { c.a = src; c.b = dst; c.normal.copy(_v3); }
    c.depth = pen;
    c.point.copy(_v1);
    out.push(c);
  }
}

export function resetContactPool() { contactCount = 0; }

/* ========================================================================== */
/*                              contact solving                               */
/* ========================================================================== */

const BAUMGARTE = 0.22;
const SLOP = 0.004;
const MAX_BIAS = 3.0;

export function solveContacts(contacts, dt, iterations = 8) {
  const invDt = dt > 0 ? 1 / dt : 0;
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < contacts.length; i++) {
      solveContact(contacts[i], invDt, it === 0);
    }
  }
}

function solveContact(c, invDt, first) {
  const a = c.a, b = c.b;
  const ima = a.invMass, imb = b ? b.invMass : 0;
  if (ima === 0 && imb === 0) return;

  _v1.copy(c.point).sub(a.pos);                    // rA
  if (b) _v2.copy(c.point).sub(b.pos); else _v2.set(0, 0, 0);   // rB

  // relative velocity at contact
  _v3.copy(a.vel).addScaledVector(_v4.copy(a.angVel).cross(_v1), 1);
  if (b) { _v5.copy(b.vel).addScaledVector(_v4.copy(b.angVel).cross(_v2), 1); _v3.sub(_v5); }

  const vn = _v3.dot(c.normal);

  // effective mass along the normal
  let eff = ima + imb;
  _v4.copy(_v1).cross(c.normal).applyMatrix3(a.invInertiaWorld).cross(_v1);
  eff += _v4.dot(c.normal);
  if (b && imb > 0) {
    _v4.copy(_v2).cross(c.normal).applyMatrix3(b.invInertiaWorld).cross(_v2);
    eff += _v4.dot(c.normal);
  }
  // Never drop a contact outright: falling back to the translation-only mass
  // keeps a body on the floor even if the angular term degenerates.
  if (!(eff > 1e-9)) eff = ima + imb;
  if (eff <= 1e-9) return;

  const rest = (first && vn < -1.4) ? Math.max(a.restitution, b ? b.restitution : 0) : 0;
  // Capped, so a deeply overlapping pair eases apart instead of launching.
  const bias = Math.min(MAX_BIAS, BAUMGARTE * invDt * Math.max(0, c.depth - SLOP));
  let jn = (-(1 + rest) * vn + bias) / eff;

  const old = c.impulse;
  c.impulse = Math.max(0, old + jn);
  jn = c.impulse - old;

  _v6.copy(c.normal).multiplyScalar(jn);
  applyPair(a, b, _v6, _v1, _v2);

  /* ------------------------------- friction ------------------------------ */
  if (c.impulse <= 0) return;

  _v3.copy(a.vel).addScaledVector(_v4.copy(a.angVel).cross(_v1), 1);
  if (b) { _v5.copy(b.vel).addScaledVector(_v4.copy(b.angVel).cross(_v2), 1); _v3.sub(_v5); }
  _v3.addScaledVector(c.normal, -_v3.dot(c.normal));   // tangential part
  const tvLen = _v3.length();
  if (tvLen < 1e-6) return;
  _v3.multiplyScalar(1 / tvLen);                        // tangent dir

  let effT = ima + imb;
  _v4.copy(_v1).cross(_v3).applyMatrix3(a.invInertiaWorld).cross(_v1);
  effT += _v4.dot(_v3);
  if (b && imb > 0) {
    _v4.copy(_v2).cross(_v3).applyMatrix3(b.invInertiaWorld).cross(_v2);
    effT += _v4.dot(_v3);
  }
  if (!(effT > 1e-9)) effT = ima + imb;
  if (effT <= 1e-9) return;

  const mu = Math.sqrt(a.friction * (b ? b.friction : a.friction));
  let jt = -tvLen / effT;
  const maxT = mu * c.impulse;
  jt = clamp(jt, -maxT, maxT);

  _v6.copy(_v3).multiplyScalar(jt);
  applyPair(a, b, _v6, _v1, _v2);
}

function applyPair(a, b, imp, rA, rB) {
  if (a.invMass > 0) {
    a.vel.addScaledVector(imp, a.invMass);
    _v7.copy(rA).cross(imp).applyMatrix3(a.invInertiaWorld);
    a.angVel.add(_v7);
  }
  if (b && b.invMass > 0) {
    b.vel.addScaledVector(imp, -b.invMass);
    _v7.copy(rB).cross(imp).applyMatrix3(b.invInertiaWorld).multiplyScalar(-1);
    b.angVel.add(_v7);
  }
}

/* ========================================================================== */
/*                                integration                                 */
/* ========================================================================== */

const _spin = new Quaternion();

export function integrateBody(body, dt, gravity) {
  if (body.invMass === 0 || body.sleeping) return;
  body.vel.addScaledVector(gravity, dt);
  body.vel.multiplyScalar(Math.exp(-body.linDamp * dt));
  body.angVel.multiplyScalar(Math.exp(-body.angDamp * dt));
  if (body.rollFriction > 0) {
    // Rolling resistance: boulders should coast for a while, then settle.
    const w = body.angVel.length();
    if (w > 1e-4) body.angVel.multiplyScalar(Math.max(0, 1 - (body.rollFriction * dt) / w));
  }
}

export function integratePositions(body, dt) {
  if (body.invMass === 0 || body.sleeping) return;
  body.pos.addScaledVector(body.vel, dt);
  const w = body.angVel;
  const wl = w.length();
  if (wl > 1e-8) {
    _spin.setFromAxisAngle(_v1.copy(w).multiplyScalar(1 / wl), wl * dt);
    body.quat.premultiply(_spin).normalize();
  }
  body.updateDerived();
}

export const SCRATCH = { _v1, _v2, _v3 };
export { FACE_NORMALS, BOX_CORNERS };
