/* =============================================================================
   The Suffering - physics.

   A small rigid body engine built on extended position based dynamics. Every
   moving thing in the game is a box shaped rigid body: the seventeen parts of
   a person, a crate, a dropped pistol, a severed forearm, a lump of what used
   to be a shin. Bodies are tied together with joints that have real angular
   limits and, optionally, a muscle: a soft drive toward a target pose, which
   is what lets a ragdoll fight to keep its feet instead of simply dropping.

   One fixed step is cut into substeps. Each substep: integrate, solve joints
   and muscles once, solve contacts once, then read the velocities back off
   the positions. Small steps do the work that iterations do elsewhere.

   The file has no dependencies, so it runs under Node for testing.
   ========================================================================== */

export const GRAVITY = -9.81;
/** Metres per second an existing overlap is allowed to unwind at. */
const MAX_DEPEN = 2.5;
const MAX_LIN = 45;
const MAX_ANG = 45;
/** Radians per second a muscle may turn a joint at full strength. */
const MUSCLE_RATE = 14;
/** How fast a muscle wants to close an error: radians per second, per radian. */
const MUSCLE_GAIN = 16;

const SLEEP_LIN = 0.14;
const SLEEP_ANG = 1.1;
const SLEEP_TIME = 0.9;

export const BALL = 0;
export const HINGE = 1;

/* scratch outputs for the vector helpers - no allocation in the hot loops */
let _x = 0, _y = 0, _z = 0;

function rot(qx, qy, qz, qw, vx, vy, vz) {
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  _x = vx + qw * tx + (qy * tz - qz * ty);
  _y = vy + qw * ty + (qz * tx - qx * tz);
  _z = vz + qw * tz + (qx * ty - qy * tx);
}
function irot(qx, qy, qz, qw, vx, vy, vz) {
  rot(-qx, -qy, -qz, qw, vx, vy, vz);
}

let _bodyId = 1;
let _groupId = 1;
export function newGroup() { return _groupId++; }

/* -------------------------------------------------------------------------- */
/*                                    body                                    */
/* -------------------------------------------------------------------------- */

export class Body {
  /**
   * @param {object} o  hx,hy,hz half extents; mass; x,y,z; optional quaternion
   */
  constructor(o = {}) {
    this.id = _bodyId++;
    this.hx = o.hx ?? 0.1; this.hy = o.hy ?? 0.1; this.hz = o.hz ?? 0.1;
    this.px = o.x ?? 0; this.py = o.y ?? 0; this.pz = o.z ?? 0;
    this.qx = o.qx ?? 0; this.qy = o.qy ?? 0; this.qz = o.qz ?? 0; this.qw = o.qw ?? 1;
    this.ox = this.px; this.oy = this.py; this.oz = this.pz;
    this.oqx = this.qx; this.oqy = this.qy; this.oqz = this.qz; this.oqw = this.qw;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.wx = 0; this.wy = 0; this.wz = 0;

    this.mass = o.mass ?? 1;
    this.invMass = 1 / this.mass;
    // inertia of a solid box, with a floor so that a hand is not a thousand
    // times easier to spin than the arm it hangs from
    const m3 = this.mass / 3;
    const floor = o.inertiaFloor ?? 0.0025 * this.mass + 0.002;
    this.iix = 1 / Math.max(floor, m3 * (this.hy * this.hy + this.hz * this.hz));
    this.iiy = 1 / Math.max(floor, m3 * (this.hx * this.hx + this.hz * this.hz));
    this.iiz = 1 / Math.max(floor, m3 * (this.hx * this.hx + this.hy * this.hy));
    // what the solver actually uses: zero while kinematic or asleep
    this.im = this.invMass; this.ex = this.iix; this.ey = this.iiy; this.ez = this.iiz;

    this.kinematic = false;
    this.island = null;
    this.group = o.group ?? 0;
    /** 0: a body part (spheres against other bodies), 1: a box (corners + faces) */
    this.shape = o.shape ?? 0;
    this.friction = o.friction ?? 0.7;
    this.bounce = o.bounce ?? 0;
    this.linDamp = o.linDamp ?? 0.04;
    this.angDamp = o.angDamp ?? 0.6;
    this.gravity = o.gravity ?? 1;
    this.boundR = Math.hypot(this.hx, this.hy, this.hz);
    this.collides = o.collides ?? true;

    // points tested against the ground and static geometry: x,y,z,radius ...
    this.pts = o.pts || boxCorners(this.hx, this.hy, this.hz, 0.012);
    // volume spheres tested against other bodies: x,y,z,radius ...
    this.sph = o.sph || [0, 0, 0, Math.min(this.hx, this.hy, this.hz)];
    // a box's sample points against other boxes
    this.bpts = o.dense ? boxSamples(this.hx, this.hy, this.hz, 0.012) : this.pts;

    this.owner = o.owner ?? null;
    this.part = o.part ?? -1;
    this.kind = o.kind || 'body';

    // the hardest knock this body took during the last step
    this.hit = 0; this.hitOther = null; this.hitNx = 0; this.hitNy = 1; this.hitNz = 0;
    this.hitX = 0; this.hitY = 0; this.hitZ = 0;
    this.grounded = 0;
    // an optional pull toward a world orientation (the "stay upright" reflex)
    this.orient = null;
  }

  _refresh() {
    const live = !this.kinematic && !(this.island && this.island.sleeping);
    this.im = live ? this.invMass : 0;
    this.ex = live ? this.iix : 0; this.ey = live ? this.iiy : 0; this.ez = live ? this.iiz : 0;
  }

  setKinematic(k) {
    if (this.kinematic === k) return;
    this.kinematic = k;
    this._refresh();
  }

  /** Places a kinematic body, remembering how fast it got there. */
  setPose(px, py, pz, qx, qy, qz, qw, dt) {
    if (dt > 0) {
      const inv = 1 / dt;
      this.vx = (px - this.px) * inv; this.vy = (py - this.py) * inv; this.vz = (pz - this.pz) * inv;
      // dq = q * conj(old)
      const ax = this.qx, ay = this.qy, az = this.qz, aw = this.qw;
      let dx = qx * aw - qw * ax - qy * az + qz * ay;
      let dy = qy * aw - qw * ay - qz * ax + qx * az;
      let dz = qz * aw - qw * az - qx * ay + qy * ax;
      const dw = qw * aw + qx * ax + qy * ay + qz * az;
      const s = (dw < 0 ? -2 : 2) * inv;
      this.wx = dx * s; this.wy = dy * s; this.wz = dz * s;
      const sp = Math.hypot(this.vx, this.vy, this.vz);
      if (sp > MAX_LIN) { const k = MAX_LIN / sp; this.vx *= k; this.vy *= k; this.vz *= k; }
      const sa = Math.hypot(this.wx, this.wy, this.wz);
      if (sa > MAX_ANG) { const k = MAX_ANG / sa; this.wx *= k; this.wy *= k; this.wz *= k; }
    }
    this.px = px; this.py = py; this.pz = pz;
    this.qx = qx; this.qy = qy; this.qz = qz; this.qw = qw;
    this.ox = px; this.oy = py; this.oz = pz;
    this.oqx = qx; this.oqy = qy; this.oqz = qz; this.oqw = qw;
  }

  teleport(px, py, pz) {
    this.px = px; this.py = py; this.pz = pz; this.ox = px; this.oy = py; this.oz = pz;
  }

  /** Local point to world. Result in the returned array (scratch reuse). */
  toWorld(lx, ly, lz, out) {
    rot(this.qx, this.qy, this.qz, this.qw, lx, ly, lz);
    out[0] = this.px + _x; out[1] = this.py + _y; out[2] = this.pz + _z;
    return out;
  }
  toLocal(wx, wy, wz, out) {
    irot(this.qx, this.qy, this.qz, this.qw, wx - this.px, wy - this.py, wz - this.pz);
    out[0] = _x; out[1] = _y; out[2] = _z;
    return out;
  }
  dirToWorld(lx, ly, lz, out) {
    rot(this.qx, this.qy, this.qz, this.qw, lx, ly, lz);
    out[0] = _x; out[1] = _y; out[2] = _z;
    return out;
  }
  dirToLocal(wx, wy, wz, out) {
    irot(this.qx, this.qy, this.qz, this.qw, wx, wy, wz);
    out[0] = _x; out[1] = _y; out[2] = _z;
    return out;
  }

  /** Velocity of a world point carried by this body. */
  velocityAt(wx, wy, wz, out) {
    const rx = wx - this.px, ry = wy - this.py, rz = wz - this.pz;
    out[0] = this.vx + this.wy * rz - this.wz * ry;
    out[1] = this.vy + this.wz * rx - this.wx * rz;
    out[2] = this.vz + this.wx * ry - this.wy * rx;
    return out;
  }

  /** An instantaneous shove at a world point. Wakes whatever it belongs to. */
  applyImpulse(ix, iy, iz, wx, wy, wz) {
    if (this.kinematic) return;
    if (this.island) this.island.wake();
    this.vx += ix * this.invMass; this.vy += iy * this.invMass; this.vz += iz * this.invMass;
    if (wx !== undefined) {
      const rx = wx - this.px, ry = wy - this.py, rz = wz - this.pz;
      const tx = ry * iz - rz * iy, ty = rz * ix - rx * iz, tz = rx * iy - ry * ix;
      irot(this.qx, this.qy, this.qz, this.qw, tx, ty, tz);
      rot(this.qx, this.qy, this.qz, this.qw, _x * this.iix, _y * this.iiy, _z * this.iiz);
      this.wx += _x; this.wy += _y; this.wz += _z;
    }
  }

  /* ---- solver internals ---- */

  _wPos(nx, ny, nz, rx, ry, rz) {
    const ax = ry * nz - rz * ny, ay = rz * nx - rx * nz, az = rx * ny - ry * nx;
    irot(this.qx, this.qy, this.qz, this.qw, ax, ay, az);
    return this.im + _x * _x * this.ex + _y * _y * this.ey + _z * _z * this.ez;
  }
  _wRot(nx, ny, nz) {
    irot(this.qx, this.qy, this.qz, this.qw, nx, ny, nz);
    return _x * _x * this.ex + _y * _y * this.ey + _z * _z * this.ez;
  }
  _applyPos(cx, cy, cz, rx, ry, rz) {
    this.px += cx * this.im; this.py += cy * this.im; this.pz += cz * this.im;
    this._applyRot(ry * cz - rz * cy, rz * cx - rx * cz, rx * cy - ry * cx);
  }
  _applyVel(jx, jy, jz, rx, ry, rz) {
    this.vx += jx * this.im; this.vy += jy * this.im; this.vz += jz * this.im;
    irot(this.qx, this.qy, this.qz, this.qw, ry * jz - rz * jy, rz * jx - rx * jz, rx * jy - ry * jx);
    rot(this.qx, this.qy, this.qz, this.qw, _x * this.ex, _y * this.ey, _z * this.ez);
    this.wx += _x; this.wy += _y; this.wz += _z;
  }
  _applyRot(ax, ay, az) {
    irot(this.qx, this.qy, this.qz, this.qw, ax, ay, az);
    rot(this.qx, this.qy, this.qz, this.qw, _x * this.ex, _y * this.ey, _z * this.ez);
    let rx = _x, ry = _y, rz = _z;
    const phi = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (phi > 0.4) { const k = 0.4 / phi; rx *= k; ry *= k; rz *= k; }
    const qx = this.qx, qy = this.qy, qz = this.qz, qw = this.qw;
    this.qx = qx + 0.5 * (rx * qw + ry * qz - rz * qy);
    this.qy = qy + 0.5 * (ry * qw + rz * qx - rx * qz);
    this.qz = qz + 0.5 * (rz * qw + rx * qy - ry * qx);
    this.qw = qw + 0.5 * (-rx * qx - ry * qy - rz * qz);
    const n = 1 / Math.sqrt(this.qx * this.qx + this.qy * this.qy + this.qz * this.qz + this.qw * this.qw);
    this.qx *= n; this.qy *= n; this.qz *= n; this.qw *= n;
  }
}

/**
 * Corners, edge midpoints and face centres: enough points for two boxes of
 * a similar size to find each other however they are turned. Corners alone
 * miss a crate sitting askew on another, where only the edges cross.
 */
export function boxSamples(hx, hy, hz, r = 0.012) {
  const a = [];
  const x = Math.max(0.001, hx - r), y = Math.max(0.001, hy - r), z = Math.max(0.001, hz - r);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    if (i === 0 && j === 0 && k === 0) continue;
    a.push(i * x, j * y, k * z, r);
  }
  return a;
}

/** Eight corners of a box, pulled in by their own radius. */
export function boxCorners(hx, hy, hz, r = 0.012) {
  const a = [];
  const x = Math.max(0.001, hx - r), y = Math.max(0.001, hy - r), z = Math.max(0.001, hz - r);
  for (let i = 0; i < 8; i++) a.push((i & 1 ? x : -x), (i & 2 ? y : -y), (i & 4 ? z : -z), r);
  return a;
}

/* -------------------------------------------------------------------------- */
/*                                   island                                   */
/* -------------------------------------------------------------------------- */

/** A set of bodies that sleep and wake together: one ragdoll, one crate. */
export class Island {
  constructor(owner = null) {
    this.owner = owner;
    this.bodies = [];
    this.sleeping = false;
    this.quiet = 0;
    this.canSleep = true;
    this.near = [];            // static boxes near enough to matter this frame
    this.minx = 0; this.miny = 0; this.minz = 0; this.maxx = 0; this.maxy = 0; this.maxz = 0;
    this.selfPairs = null;     // [bodyA, bodyB, ...] pairs inside one ragdoll
    this.constrain = null;     // (h) => void, the owner's own per-substep rules
    this.mover = false;        // driven by something other than physics, and moving
    this.live = false;         // has at least one dynamic, awake body
    this._wakeFlag = false;
  }
  add(b) { b.island = this; this.bodies.push(b); b._refresh(); return b; }
  remove(b) {
    const i = this.bodies.indexOf(b);
    if (i >= 0) this.bodies.splice(i, 1);
    if (b.island === this) b.island = null;
  }
  wake() {
    this.quiet = 0;
    if (!this.sleeping) return;
    this.sleeping = false;
    for (const b of this.bodies) b._refresh();
  }
  sleep() {
    this.sleeping = true;
    for (const b of this.bodies) {
      b.vx = b.vy = b.vz = 0; b.wx = b.wy = b.wz = 0;
      b._refresh();
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                                   joint                                    */
/* -------------------------------------------------------------------------- */

export class Joint {
  /**
   * @param {Body} a parent   @param {Body} b child
   * @param {object} o
   *   la, lb        anchor in each body's own space, [x,y,z]
   *   type          BALL or HINGE (about each body's local X)
   *   min, max      hinge range in radians
   *   refAxis       ball: the centre of the cone, in the parent's space
   *   boneAxis      ball: the child's own long axis
   *   swing, twist  ball: half angle of the cone, and twist either way
   */
  constructor(a, b, o = {}) {
    this.a = a; this.b = b;
    const la = o.la || [0, 0, 0], lb = o.lb || [0, 0, 0];
    this.lax = la[0]; this.lay = la[1]; this.laz = la[2];
    this.lbx = lb[0]; this.lby = lb[1]; this.lbz = lb[2];
    this.type = o.type ?? BALL;
    this.min = o.min ?? -1; this.max = o.max ?? 1;
    const ra = norm(o.refAxis || [0, 1, 0]), ba = norm(o.boneAxis || [0, 1, 0]);
    this.sax = ra[0]; this.say = ra[1]; this.saz = ra[2];
    this.sbx = ba[0]; this.sby = ba[1]; this.sbz = ba[2];
    this.swing = o.swing ?? Math.PI;
    this.swingCos = Math.cos(this.swing);
    this.twist = o.twist ?? Math.PI;
    this.limitCompliance = o.limitCompliance ?? 0.00015;
    this.compliance = o.compliance ?? 0;
    this.enabled = true;
    this.limits = true;         // a shattered joint keeps its anchor and loses its limits
    // muscle: a target for the child's rotation relative to the parent
    this.tx = 0; this.ty = 0; this.tz = 0; this.tw = 1;
    this.muscle = 0;
    this.torque = o.torque ?? 100;   // newton metres at full strength
    this.damp = o.damp ?? 0.6;
    this.name = o.name || '';
  }
  setTarget(x, y, z, w) { this.tx = x; this.ty = y; this.tz = z; this.tw = w; }
}

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/* -------------------------------------------------------------------------- */
/*                                   world                                    */
/* -------------------------------------------------------------------------- */

const _pairA = [], _pairB = [];
const _tmp = [0, 0, 0];
/* contacts found during a substep, kept for the velocity pass */
const _cA = [], _cB = [];
let _cN = new Float64Array(10 * 256);
let _cCount = 0;

export class World {
  constructor() {
    this.islands = [];
    this.joints = [];
    this.statics = [];
    this.grid = new Map();
    this.cell = 8;
    this.substeps = 8;
    /** Height of the ground under a point. The city replaces this. */
    this.ground = () => 0;
    /** Height of the pavement above the road, for rays. */
    this.kerb = 0;
    this.h = 1 / 480;
    this.stamp = 1;
    this.stats = { live: 0, pairs: 0, bodies: 0 };
  }

  /* ------------------------------ membership ----------------------------- */

  addIsland(isl) { this.islands.push(isl); return isl; }
  removeIsland(isl) {
    const i = this.islands.indexOf(isl);
    if (i >= 0) this.islands.splice(i, 1);
    // anything that was resting on it has to find out
    this.wakeBox(isl.minx - 0.3, isl.miny - 0.3, isl.minz - 0.3, isl.maxx + 0.3, isl.maxy + 0.6, isl.maxz + 0.3);
  }
  addJoint(j) { this.joints.push(j); return j; }
  removeJoint(j) {
    const i = this.joints.indexOf(j);
    if (i >= 0) this.joints.splice(i, 1);
  }

  /** A fixed axis aligned box: a building, a bench, a lamp post. */
  addStatic(minx, miny, minz, maxx, maxy, maxz, ref = null) {
    const s = { minx, miny, minz, maxx, maxy, maxz, ref, stamp: 0, solid: true };
    this.statics.push(s);
    const c = this.cell;
    for (let gx = Math.floor(minx / c); gx <= Math.floor(maxx / c); gx++) {
      for (let gz = Math.floor(minz / c); gz <= Math.floor(maxz / c); gz++) {
        const k = gx * 4096 + gz;
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, list = []);
        list.push(s);
      }
    }
    return s;
  }

  /** Static boxes whose footprint touches a rectangle. */
  queryStatics(minx, minz, maxx, maxz, out) {
    out.length = 0;
    const c = this.cell, st = ++this.stamp;
    for (let gx = Math.floor(minx / c); gx <= Math.floor(maxx / c); gx++) {
      for (let gz = Math.floor(minz / c); gz <= Math.floor(maxz / c); gz++) {
        const list = this.grid.get(gx * 4096 + gz);
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const s = list[i];
          if (s.stamp === st) continue;
          s.stamp = st;
          if (s.maxx < minx || s.minx > maxx || s.maxz < minz || s.minz > maxz) continue;
          out.push(s);
        }
      }
    }
    return out;
  }

  /** The fixed box, if any, that a point is inside. */
  staticAt(x, y, z) {
    const c = this.cell;
    const list = this.grid.get(Math.floor(x / c) * 4096 + Math.floor(z / c));
    if (!list) return null;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (x > s.minx && x < s.maxx && y > s.miny && y < s.maxy && z > s.minz && z < s.maxz) return s;
    }
    return null;
  }

  wakeBox(minx, miny, minz, maxx, maxy, maxz) {
    for (const isl of this.islands) {
      if (!isl.sleeping) continue;
      if (isl.maxx < minx || isl.minx > maxx || isl.maxy < miny || isl.miny > maxy || isl.maxz < minz || isl.minz > maxz) continue;
      isl.wake();
    }
  }

  /* -------------------------------- stepping ----------------------------- */

  step(dt) {
    const n = this.substeps;
    const h = dt / n;
    this.h = h;
    this._prepare();
    for (let s = 0; s < n; s++) this._substep(h);
    this._finish(dt);
  }

  _prepare() {
    const islands = this.islands;
    let live = 0, bodies = 0;
    // something driven (a car, a walking person) ploughing into something
    // asleep has to wake it, or it would pass straight through
    for (let i = 0; i < islands.length; i++) {
      const M = islands[i];
      if (!M.mover) continue;
      for (let j = 0; j < islands.length; j++) {
        const S = islands[j];
        if (!S.sleeping) continue;
        if (M.maxx < S.minx || M.minx > S.maxx || M.maxy < S.miny || M.miny > S.maxy || M.maxz < S.minz || M.minz > S.maxz) continue;
        let touch = false;
        for (let a = 0; a < M.bodies.length && !touch; a++) {
          const ba = M.bodies[a];
          if (ba.vx * ba.vx + ba.vy * ba.vy + ba.vz * ba.vz < 0.09) continue;
          for (let b = 0; b < S.bodies.length; b++) {
            const bb = S.bodies[b];
            const dx = ba.px - bb.px, dy = ba.py - bb.py, dz = ba.pz - bb.pz;
            const rr = ba.boundR + bb.boundR;
            if (dx * dx + dy * dy + dz * dz < rr * rr) { touch = true; break; }
          }
        }
        if (touch) S.wake();
      }
    }
    for (let i = 0; i < islands.length; i++) {
      const isl = islands[i];
      let any = false;
      let minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
      const bs = isl.bodies;
      for (let k = 0; k < bs.length; k++) {
        const b = bs[k];
        if (b.im > 0) any = true;
        const r = b.boundR;
        if (b.px - r < minx) minx = b.px - r; if (b.px + r > maxx) maxx = b.px + r;
        if (b.py - r < miny) miny = b.py - r; if (b.py + r > maxy) maxy = b.py + r;
        if (b.pz - r < minz) minz = b.pz - r; if (b.pz + r > maxz) maxz = b.pz + r;
        b.hit = 0; b.hitOther = null; b.grounded = 0;
      }
      isl.minx = minx; isl.miny = miny; isl.minz = minz; isl.maxx = maxx; isl.maxy = maxy; isl.maxz = maxz;
      isl.live = any;
      if (any) {
        live++; bodies += bs.length;
        // one frame of travel, plus a little, so nothing arrives unannounced
        this.queryStatics(minx - 0.9, minz - 0.9, maxx + 0.9, maxz + 0.9, isl.near);
      }
    }
    // candidate pairs: every live island against everything it could touch
    _pairA.length = 0; _pairB.length = 0;
    const m = 0.25;
    for (let i = 0; i < islands.length; i++) {
      const I = islands[i];
      if (!I.live) continue;
      for (let j = 0; j < islands.length; j++) {
        if (i === j) continue;
        const J = islands[j];
        if (J.live && j < i) continue;       // live against live is found once
        if (I.maxx + m < J.minx || I.minx - m > J.maxx || I.maxy + m < J.miny || I.miny - m > J.maxy ||
            I.maxz + m < J.minz || I.minz - m > J.maxz) continue;
        const A = I.bodies, B = J.bodies;
        for (let a = 0; a < A.length; a++) {
          const ba = A[a];
          if (!ba.collides) continue;
          for (let b = 0; b < B.length; b++) {
            const bb = B[b];
            if (!bb.collides) continue;
            if (ba.group !== 0 && ba.group === bb.group) continue;
            if (ba.im === 0 && bb.im === 0) continue;
            const dx = ba.px - bb.px, dy = ba.py - bb.py, dz = ba.pz - bb.pz;
            const rr = ba.boundR + bb.boundR + m;
            if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
            _pairA.push(ba); _pairB.push(bb);
          }
        }
      }
      if (I.selfPairs) {
        const sp = I.selfPairs;
        for (let k = 0; k < sp.length; k += 2) {
          const ba = sp[k], bb = sp[k + 1];
          if (ba.island !== I || bb.island !== I) continue;
          _pairA.push(ba); _pairB.push(bb);
        }
      }
    }
    this.stats.live = live; this.stats.bodies = bodies; this.stats.pairs = _pairA.length;
  }

  _substep(h) {
    const islands = this.islands;
    const g = GRAVITY * h;
    /* ---- integrate ---- */
    for (let i = 0; i < islands.length; i++) {
      const isl = islands[i];
      if (!isl.live) continue;
      const bs = isl.bodies;
      for (let k = 0; k < bs.length; k++) {
        const b = bs[k];
        if (b.im === 0) continue;
        b.ox = b.px; b.oy = b.py; b.oz = b.pz;
        b.oqx = b.qx; b.oqy = b.qy; b.oqz = b.qz; b.oqw = b.qw;
        b.vy += g * b.gravity;
        const ld = 1 - b.linDamp * h, ad = 1 - b.angDamp * h;
        b.vx *= ld; b.vy *= ld; b.vz *= ld;
        b.wx *= ad; b.wy *= ad; b.wz *= ad;
        const sp = b.vx * b.vx + b.vy * b.vy + b.vz * b.vz;
        if (sp > MAX_LIN * MAX_LIN) { const s = MAX_LIN / Math.sqrt(sp); b.vx *= s; b.vy *= s; b.vz *= s; }
        const sa = b.wx * b.wx + b.wy * b.wy + b.wz * b.wz;
        if (sa > MAX_ANG * MAX_ANG) { const s = MAX_ANG / Math.sqrt(sa); b.wx *= s; b.wy *= s; b.wz *= s; }
        b.px += b.vx * h; b.py += b.vy * h; b.pz += b.vz * h;
        const hx = b.wx * h * 0.5, hy = b.wy * h * 0.5, hz = b.wz * h * 0.5;
        const qx = b.qx, qy = b.qy, qz = b.qz, qw = b.qw;
        b.qx = qx + hx * qw + hy * qz - hz * qy;
        b.qy = qy + hy * qw + hz * qx - hx * qz;
        b.qz = qz + hz * qw + hx * qy - hy * qx;
        b.qw = qw - hx * qx - hy * qy - hz * qz;
        const n = 1 / Math.sqrt(b.qx * b.qx + b.qy * b.qy + b.qz * b.qz + b.qw * b.qw);
        b.qx *= n; b.qy *= n; b.qz *= n; b.qw *= n;
      }
    }
    /* ---- joints and muscles ---- */
    const joints = this.joints;
    for (let i = 0; i < joints.length; i++) {
      const j = joints[i];
      if (j.enabled) this._solveJoint(j, h);
    }
    /* ---- whatever else the owner wants enforced ---- */
    for (let i = 0; i < islands.length; i++) {
      const isl = islands[i];
      if (isl.live && isl.constrain) isl.constrain(h);
    }
    /* ---- contacts ---- */
    _cCount = 0;
    for (let i = 0; i < _pairA.length; i++) this._collidePair(_pairA[i], _pairB[i], h);
    for (let i = 0; i < islands.length; i++) {
      const isl = islands[i];
      if (!isl.live) continue;
      const bs = isl.bodies, near = isl.near;
      for (let k = 0; k < bs.length; k++) {
        const b = bs[k];
        if (b.im === 0 || !b.collides) continue;
        this._collideWorld(b, near, h);
      }
    }
    /* ---- the ground may have pulled a joint apart: close it again, so a
       body is never drawn with a gap in it ---- */
    for (let i = 0; i < joints.length; i++) {
      const j = joints[i];
      if (j.enabled && (j.a.im > 0 || j.b.im > 0)) this._solveAnchor(j, h);
    }
    /* ---- velocities from positions ---- */
    const inv = 1 / h;
    for (let i = 0; i < islands.length; i++) {
      const isl = islands[i];
      if (!isl.live) continue;
      const bs = isl.bodies;
      for (let k = 0; k < bs.length; k++) {
        const b = bs[k];
        if (b.im === 0) continue;
        b.vx = (b.px - b.ox) * inv; b.vy = (b.py - b.oy) * inv; b.vz = (b.pz - b.oz) * inv;
        const ax = b.oqx, ay = b.oqy, az = b.oqz, aw = b.oqw;
        const dx = b.qx * aw - b.qw * ax - b.qy * az + b.qz * ay;
        const dy = b.qy * aw - b.qw * ay - b.qz * ax + b.qx * az;
        const dz = b.qz * aw - b.qw * az - b.qx * ay + b.qy * ax;
        const dw = b.qw * aw + b.qx * ax + b.qy * ay + b.qz * az;
        const s = (dw < 0 ? -2 : 2) * inv;
        b.wx = dx * s; b.wy = dy * s; b.wz = dz * s;
      }
    }
    /* ---- pushing two things apart must not leave them flying apart: the
       speed the solver added along each contact normal is taken back out,
       less whatever bounce the pair has ---- */
    for (let i = 0; i < _cCount; i++) {
      const A = _cA[i], B = _cB[i], o = i * 10;
      const rax = _cN[o], ray = _cN[o + 1], raz = _cN[o + 2];
      const nx = _cN[o + 6], ny = _cN[o + 7], nz = _cN[o + 8];
      let vx = A.vx + A.wy * raz - A.wz * ray;
      let vy = A.vy + A.wz * rax - A.wx * raz;
      let vz = A.vz + A.wx * ray - A.wy * rax;
      let rbx = 0, rby = 0, rbz = 0;
      if (B) {
        rbx = _cN[o + 3]; rby = _cN[o + 4]; rbz = _cN[o + 5];
        vx -= B.vx + B.wy * rbz - B.wz * rby;
        vy -= B.vy + B.wz * rbx - B.wx * rbz;
        vz -= B.vz + B.wx * rby - B.wy * rbx;
      }
      const vn = vx * nx + vy * ny + vz * nz;
      const pre = _cN[o + 9];
      let want = 0;
      if (pre < -1.2) want = -pre * (B ? Math.max(A.bounce, B.bounce) : A.bounce);
      const dv = want - vn;
      if (dv >= 0) continue;                    // only ever takes speed away
      const wA = A.im > 0 ? A._wPos(nx, ny, nz, rax, ray, raz) : 0;
      const wB = B && B.im > 0 ? B._wPos(nx, ny, nz, rbx, rby, rbz) : 0;
      const w = wA + wB;
      if (w <= 0) continue;
      const J = dv / w;
      if (wA > 0) A._applyVel(nx * J, ny * J, nz * J, rax, ray, raz);
      if (wB > 0) B._applyVel(-nx * J, -ny * J, -nz * J, rbx, rby, rbz);
    }
    /* ---- muscles and reflexes act on the spin ---- */
    for (let i = 0; i < islands.length; i++) {
      const isl = islands[i];
      if (!isl.live) continue;
      const bs = isl.bodies;
      for (let k = 0; k < bs.length; k++) {
        const b = bs[k];
        if (b.orient && b.im > 0 && b.orient.s > 0) this._solveOrient(b, h);
      }
    }
    /* ---- joints rub a little: without it a limp arm swings forever ---- */
    for (let i = 0; i < joints.length; i++) {
      const j = joints[i];
      if (!j.enabled) continue;
      if (j.muscle > 0) this._solveMuscle(j, h);
      if (j.damp <= 0) continue;
      const A = j.a, B = j.b;
      if (A.im === 0 && B.im === 0) continue;
      const f = Math.min(1, j.damp * h * 8);
      const dx = (B.wx - A.wx) * f, dy = (B.wy - A.wy) * f, dz = (B.wz - A.wz) * f;
      const ia = A.im > 0 ? (A.ex + A.ey + A.ez) : 0, ib = B.im > 0 ? (B.ex + B.ey + B.ez) : 0;
      const t = ia + ib; if (t <= 0) continue;
      const sa = ia / t, sb = ib / t;
      A.wx += dx * sa; A.wy += dy * sa; A.wz += dz * sa;
      B.wx -= dx * sb; B.wy -= dy * sb; B.wz -= dz * sb;
    }
    /* ---- anything hit hard enough gets up ---- */
    for (let i = 0; i < islands.length; i++) {
      const isl = islands[i];
      if (isl._wakeFlag) { isl._wakeFlag = false; isl.wake(); isl.live = true; }
    }
  }

  _finish(dt) {
    for (const isl of this.islands) {
      if (!isl.live || !isl.canSleep) { if (!isl.sleeping) isl.quiet = 0; continue; }
      let quiet = true;
      for (const b of isl.bodies) {
        if (b.im === 0) continue;
        const v = b.vx * b.vx + b.vy * b.vy + b.vz * b.vz;
        const w = b.wx * b.wx + b.wy * b.wy + b.wz * b.wz;
        if (v > SLEEP_LIN * SLEEP_LIN || w > SLEEP_ANG * SLEEP_ANG) { quiet = false; break; }
      }
      if (quiet) {
        isl.quiet += dt;
        if (isl.quiet > SLEEP_TIME) isl.sleep();
      } else isl.quiet = 0;
    }
  }

  /* ------------------------------ constraint kit -------------------------- */

  /** Turns A one way and B the other about a vector, by its length in total. */
  _angular(A, B, vx, vy, vz, compliance, h) {
    const C = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (C < 1e-8) return;
    const nx = vx / C, ny = vy / C, nz = vz / C;
    const wA = A && A.im > 0 ? A._wRot(nx, ny, nz) : 0;
    const wB = B && B.im > 0 ? B._wRot(nx, ny, nz) : 0;
    const w = wA + wB;
    if (w <= 0) return;
    const l = C / (w + compliance / (h * h));
    if (wA > 0) A._applyRot(nx * l, ny * l, nz * l);
    if (wB > 0) B._applyRot(-nx * l, -ny * l, -nz * l);
  }

  _solveJoint(j, h) {
    const A = j.a, B = j.b;
    if (A.im === 0 && B.im === 0) return;
    if (j.limits) {
      if (j.type === HINGE) {
        rot(A.qx, A.qy, A.qz, A.qw, 1, 0, 0); let ax = _x, ay = _y, az = _z;
        rot(B.qx, B.qy, B.qz, B.qw, 1, 0, 0);
        this._angular(A, B, ay * _z - az * _y, az * _x - ax * _z, ax * _y - ay * _x, 0, h);
        rot(A.qx, A.qy, A.qz, A.qw, 1, 0, 0); ax = _x; ay = _y; az = _z;
        rot(A.qx, A.qy, A.qz, A.qw, 0, 1, 0); const yax = _x, yay = _y, yaz = _z;
        rot(B.qx, B.qy, B.qz, B.qw, 0, 1, 0);
        const s = (yay * _z - yaz * _y) * ax + (yaz * _x - yax * _z) * ay + (yax * _y - yay * _x) * az;
        const c = yax * _x + yay * _y + yaz * _z;
        const th = Math.atan2(s, c);
        let d = 0;
        if (th < j.min) d = th - j.min; else if (th > j.max) d = th - j.max;
        if (d !== 0) this._angular(A, B, ax * d, ay * d, az * d, j.limitCompliance, h);
      } else {
        if (j.swing < 3.1) {
          rot(A.qx, A.qy, A.qz, A.qw, j.sax, j.say, j.saz); const ax = _x, ay = _y, az = _z;
          rot(B.qx, B.qy, B.qz, B.qw, j.sbx, j.sby, j.sbz);
          const d = ax * _x + ay * _y + az * _z;
          if (d < j.swingCos) {
            const nx = ay * _z - az * _y, ny = az * _x - ax * _z, nz = ax * _y - ay * _x;
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
            if (len > 1e-6) {
              const k = (Math.atan2(len, d) - j.swing) / len;
              this._angular(A, B, nx * k, ny * k, nz * k, j.limitCompliance, h);
            }
          }
        }
        if (j.twist < 3.1) {
          // conj(qA) * qB, then how much of it turns about the child's own axis
          const ax = -A.qx, ay = -A.qy, az = -A.qz, aw = A.qw;
          const rx = aw * B.qx + ax * B.qw + ay * B.qz - az * B.qy;
          const ry = aw * B.qy - ax * B.qz + ay * B.qw + az * B.qx;
          const rz = aw * B.qz + ax * B.qy - ay * B.qx + az * B.qw;
          const rw = aw * B.qw - ax * B.qx - ay * B.qy - az * B.qz;
          let tw = 2 * Math.atan2(rx * j.sbx + ry * j.sby + rz * j.sbz, rw);
          if (tw > Math.PI) tw -= 2 * Math.PI; else if (tw < -Math.PI) tw += 2 * Math.PI;
          let d = 0;
          if (tw > j.twist) d = tw - j.twist; else if (tw < -j.twist) d = tw + j.twist;
          if (d !== 0) {
            rot(B.qx, B.qy, B.qz, B.qw, j.sbx, j.sby, j.sbz);
            this._angular(A, B, _x * d, _y * d, _z * d, j.limitCompliance, h);
          }
        }
      }
    }
    this._solveAnchor(j, h);
  }

  /** The joint's anchor: the two bodies must meet at one point. */
  _solveAnchor(j, h) {
    const A = j.a, B = j.b;
    rot(A.qx, A.qy, A.qz, A.qw, j.lax, j.lay, j.laz); const rax = _x, ray = _y, raz = _z;
    rot(B.qx, B.qy, B.qz, B.qw, j.lbx, j.lby, j.lbz); const rbx = _x, rby = _y, rbz = _z;
    const cx = (B.px + rbx) - (A.px + rax), cy = (B.py + rby) - (A.py + ray), cz = (B.pz + rbz) - (A.pz + raz);
    const C = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (C < 1e-9) return;
    const nx = cx / C, ny = cy / C, nz = cz / C;
    const wA = A.im > 0 ? A._wPos(nx, ny, nz, rax, ray, raz) : 0;
    const wB = B.im > 0 ? B._wPos(nx, ny, nz, rbx, rby, rbz) : 0;
    const w = wA + wB;
    if (w <= 0) return;
    const l = C / (w + j.compliance / (h * h));
    if (wA > 0) A._applyPos(nx * l, ny * l, nz * l, rax, ray, raz);
    if (wB > 0) B._applyPos(-nx * l, -ny * l, -nz * l, rbx, rby, rbz);
  }

  /**
   * Drives the spin of B relative to A toward a target, removing a share `k`
   * of the difference, with at most `maxL` of angular impulse.
   */
  _servo(A, B, tx, ty, tz, k, maxL) {
    const dx = (tx - (B.wx - (A ? A.wx : 0))) * k;
    const dy = (ty - (B.wy - (A ? A.wy : 0))) * k;
    const dz = (tz - (B.wz - (A ? A.wz : 0))) * k;
    const m = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (m < 1e-9) return;
    const nx = dx / m, ny = dy / m, nz = dz / m;
    const wA = A && A.im > 0 ? A._wRot(nx, ny, nz) : 0;
    const wB = B.im > 0 ? B._wRot(nx, ny, nz) : 0;
    const w = wA + wB;
    if (w <= 0) return;
    // the limit is on the twist the muscle can deliver, not on the speed it
    // produces: a hand and a thigh are then held by honestly different forces
    let L = m / w;
    if (L > maxL) L = maxL;
    if (wA > 0) {
      irot(A.qx, A.qy, A.qz, A.qw, nx * L, ny * L, nz * L);
      rot(A.qx, A.qy, A.qz, A.qw, _x * A.ex, _y * A.ey, _z * A.ez);
      A.wx -= _x; A.wy -= _y; A.wz -= _z;
    }
    if (wB > 0) {
      irot(B.qx, B.qy, B.qz, B.qw, nx * L, ny * L, nz * L);
      rot(B.qx, B.qy, B.qz, B.qw, _x * B.ex, _y * B.ey, _z * B.ez);
      B.wx += _x; B.wy += _y; B.wz += _z;
    }
  }

  /** Muscle: a servo that turns the child toward where the pose wants it. */
  _solveMuscle(j, h) {
    const A = j.a, B = j.b;
    if (A.im === 0 && B.im === 0) return;
    // wanted = qA * target ; error = qB * conj(wanted)
    const ax = A.qx, ay = A.qy, az = A.qz, aw = A.qw;
    const dx = aw * j.tx + ax * j.tw + ay * j.tz - az * j.ty;
    const dy = aw * j.ty - ax * j.tz + ay * j.tw + az * j.tx;
    const dz = aw * j.tz + ax * j.ty - ay * j.tx + az * j.tw;
    const dw = aw * j.tw - ax * j.tx - ay * j.ty - az * j.tz;
    let ex = -B.qw * dx + B.qx * dw - B.qy * dz + B.qz * dy;
    let ey = -B.qw * dy + B.qy * dw - B.qz * dx + B.qx * dz;
    let ez = -B.qw * dz + B.qz * dw - B.qx * dy + B.qy * dx;
    let ew = B.qw * dw + B.qx * dx + B.qy * dy + B.qz * dz;
    if (ew < 0) { ex = -ex; ey = -ey; ez = -ez; ew = -ew; }
    const sl = Math.sqrt(ex * ex + ey * ey + ez * ez);
    let sp = 0;
    if (sl > 1e-6) {
      const phi = 2 * Math.atan2(sl, ew);
      sp = -Math.min(phi * MUSCLE_GAIN, MUSCLE_RATE * (0.35 + 0.65 * j.muscle)) / sl;
    }
    const m = j.muscle;
    this._servo(A, B, ex * sp, ey * sp, ez * sp, Math.min(0.9, 0.15 + m), m * j.torque * h);
  }

  /**
   * The upright reflex: a soft pull of one body toward a world rotation, or -
   * with `tilt` set - only of its own up axis toward a direction, leaving it
   * free to turn about that axis.
   */
  _solveOrient(b, h) {
    const o = b.orient;
    let ex, ey, ez, phi, sl;
    if (o.tilt) {
      rot(b.qx, b.qy, b.qz, b.qw, 0, 1, 0);
      // target x current up: the turn that carries the target onto where we are
      ex = o.y * _z - o.z * _y; ey = o.z * _x - o.x * _z; ez = o.x * _y - o.y * _x;
      sl = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (sl < 1e-6) return;
      phi = Math.atan2(sl, o.x * _x + o.y * _y + o.z * _z);
    } else {
      ex = -b.qw * o.x + b.qx * o.w - b.qy * o.z + b.qz * o.y;
      ey = -b.qw * o.y + b.qy * o.w - b.qz * o.x + b.qx * o.z;
      ez = -b.qw * o.z + b.qz * o.w - b.qx * o.y + b.qy * o.x;
      let ew = b.qw * o.w + b.qx * o.x + b.qy * o.y + b.qz * o.z;
      if (ew < 0) { ex = -ex; ey = -ey; ez = -ez; ew = -ew; }
      sl = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (sl < 1e-6) return;
      phi = 2 * Math.atan2(sl, ew);
    }
    const sp = -Math.min(phi * MUSCLE_GAIN, MUSCLE_RATE) / sl;
    this._servo(null, b, ex * sp, ey * sp, ez * sp, Math.min(0.9, 0.15 + o.s), o.s * (o.t || 100) * h);
  }

  /* --------------------------------- contacts ----------------------------- */

  /**
   * One contact. P is the touching point, n points out of B (or out of the
   * world) into A, pen is how deep.
   */
  _contact(A, B, px, py, pz, nx, ny, nz, pen, mu, h) {
    const rax = px - A.px, ray = py - A.py, raz = pz - A.pz;
    const wA = A.im > 0 ? A._wPos(nx, ny, nz, rax, ray, raz) : 0;
    let wB = 0, rbx = 0, rby = 0, rbz = 0;
    // how far the touching point travelled this substep, on each side
    let dx, dy, dz;
    if (A.im > 0) {
      dx = (A.px - A.ox) + (A.wy * raz - A.wz * ray) * h;
      dy = (A.py - A.oy) + (A.wz * rax - A.wx * raz) * h;
      dz = (A.pz - A.oz) + (A.wx * ray - A.wy * rax) * h;
    } else {
      dx = (A.vx + A.wy * raz - A.wz * ray) * h;
      dy = (A.vy + A.wz * rax - A.wx * raz) * h;
      dz = (A.vz + A.wx * ray - A.wy * rax) * h;
    }
    if (B) {
      rbx = px - B.px; rby = py - B.py; rbz = pz - B.pz;
      wB = B.im > 0 ? B._wPos(nx, ny, nz, rbx, rby, rbz) : 0;
      if (B.im > 0) {
        dx -= (B.px - B.ox) + (B.wy * rbz - B.wz * rby) * h;
        dy -= (B.py - B.oy) + (B.wz * rbx - B.wx * rbz) * h;
        dz -= (B.pz - B.oz) + (B.wx * rby - B.wy * rbx) * h;
      } else if (!(B.island && B.island.sleeping)) {
        dx -= (B.vx + B.wy * rbz - B.wz * rby) * h;
        dy -= (B.vy + B.wz * rbx - B.wx * rbz) * h;
        dz -= (B.vz + B.wx * rby - B.wy * rbx) * h;
      }
    }
    const w = wA + wB;
    if (w <= 0) return;
    const dn = dx * nx + dy * ny + dz * nz;
    const closing = dn < 0 ? -dn : 0;
    let c = closing + MAX_DEPEN * h;
    if (c > pen) c = pen;
    const l = c / w;
    if (wA > 0) A._applyPos(nx * l, ny * l, nz * l, rax, ray, raz);
    if (wB > 0) B._applyPos(-nx * l, -ny * l, -nz * l, rbx, rby, rbz);

    // friction: undo the sideways slip, as far as the grip allows
    let tx = dx - nx * dn, ty = dy - ny * dn, tz = dz - nz * dn;
    const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (tl > 1e-9) {
      let m = mu * c;
      if (m > tl) m = tl;
      tx /= tl; ty /= tl; tz /= tl;
      const tA = A.im > 0 ? A._wPos(tx, ty, tz, rax, ray, raz) : 0;
      const tB = wB > 0 ? B._wPos(tx, ty, tz, rbx, rby, rbz) : 0;
      const tw = tA + tB;
      if (tw > 0) {
        const lt = m / tw;
        if (tA > 0) A._applyPos(-tx * lt, -ty * lt, -tz * lt, rax, ray, raz);
        if (tB > 0) B._applyPos(tx * lt, ty * lt, tz * lt, rbx, rby, rbz);
      }
    }

    // keep it for the velocity pass
    if (_cCount * 10 + 10 > _cN.length) { const n = new Float64Array(_cN.length * 2); n.set(_cN); _cN = n; }
    const o = _cCount * 10;
    _cA[_cCount] = A; _cB[_cCount] = B;
    _cN[o] = rax; _cN[o + 1] = ray; _cN[o + 2] = raz;
    _cN[o + 3] = rbx; _cN[o + 4] = rby; _cN[o + 5] = rbz;
    _cN[o + 6] = nx; _cN[o + 7] = ny; _cN[o + 8] = nz; _cN[o + 9] = dn / h;
    _cCount++;

    // remember the hardest knock for whoever wants to bruise something
    const speed = closing / h;
    if (speed > A.hit) {
      A.hit = speed; A.hitOther = B; A.hitNx = nx; A.hitNy = ny; A.hitNz = nz;
      A.hitX = px; A.hitY = py; A.hitZ = pz;
    }
    if (B) {
      if (speed > B.hit) {
        B.hit = speed; B.hitOther = A; B.hitNx = -nx; B.hitNy = -ny; B.hitNz = -nz;
        B.hitX = px; B.hitY = py; B.hitZ = pz;
      }
      if (speed > 0.7) {
        if (B.island && B.island.sleeping) B.island._wakeFlag = true;
        if (A.island && A.island.sleeping) A.island._wakeFlag = true;
      }
    }
  }

  _collideWorld(b, near, h) {
    const ground = this.ground;
    const pts = b.pts;
    const qx = b.qx, qy = b.qy, qz = b.qz, qw = b.qw;
    const mu = b.friction;
    for (let i = 0; i < pts.length; i += 4) {
      rot(qx, qy, qz, qw, pts[i], pts[i + 1], pts[i + 2]);
      const wx = b.px + _x, wy = b.py + _y, wz = b.pz + _z, r = pts[i + 3];
      const gh = ground(wx, wz);
      const pen = gh + r - wy;
      if (pen > 0) {
        b.grounded++;
        this._contact(b, null, wx, wy - r, wz, 0, 1, 0, pen, mu, h);
      }
      for (let k = 0; k < near.length; k++) {
        const s = near[k];
        if (!s.solid) continue;
        if (wx < s.minx - r || wx > s.maxx + r || wy < s.miny - r || wy > s.maxy + r || wz < s.minz - r || wz > s.maxz + r) continue;
        this._sphereBox(b, wx, wy, wz, r, s, mu, h);
      }
    }
    if (b.shape === 0 && near.length) {
      const sph = b.sph;
      for (let i = 0; i < sph.length; i += 4) {
        rot(qx, qy, qz, qw, sph[i], sph[i + 1], sph[i + 2]);
        const wx = b.px + _x, wy = b.py + _y, wz = b.pz + _z, r = sph[i + 3];
        for (let k = 0; k < near.length; k++) {
          const s = near[k];
          if (!s.solid) continue;
          if (wx < s.minx - r || wx > s.maxx + r || wy < s.miny - r || wy > s.maxy + r || wz < s.minz - r || wz > s.maxz + r) continue;
          this._sphereBox(b, wx, wy, wz, r, s, mu, h);
        }
      }
    }
  }

  /** A sphere against a fixed axis aligned box. */
  _sphereBox(b, wx, wy, wz, r, s, mu, h) {
    const cx = wx < s.minx ? s.minx : wx > s.maxx ? s.maxx : wx;
    const cy = wy < s.miny ? s.miny : wy > s.maxy ? s.maxy : wy;
    const cz = wz < s.minz ? s.minz : wz > s.maxz ? s.maxz : wz;
    let dx = wx - cx, dy = wy - cy, dz = wz - cz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > r * r) return;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      this._contact(b, null, cx, cy, cz, dx / d, dy / d, dz / d, r - d, mu, h);
      if (dy / d > 0.6) b.grounded++;
      return;
    }
    // the centre is inside: leave by the nearest face
    let best = wx - s.minx, nx = -1, ny = 0, nz = 0;
    let t = s.maxx - wx; if (t < best) { best = t; nx = 1; ny = 0; nz = 0; }
    t = wy - s.miny; if (t < best) { best = t; nx = 0; ny = -1; nz = 0; }
    t = s.maxy - wy; if (t < best) { best = t; nx = 0; ny = 1; nz = 0; }
    t = wz - s.minz; if (t < best) { best = t; nx = 0; ny = 0; nz = -1; }
    t = s.maxz - wz; if (t < best) { best = t; nx = 0; ny = 0; nz = 1; }
    if (ny > 0.5) b.grounded++;
    this._contact(b, null, wx, wy, wz, nx, ny, nz, best + r, mu, h);
  }

  _collidePair(A, B, h) {
    if (A.im === 0 && B.im === 0) return;
    const dx = A.px - B.px, dy = A.py - B.py, dz = A.pz - B.pz;
    const rr = A.boundR + B.boundR;
    if (dx * dx + dy * dy + dz * dz > rr * rr) return;
    const mu = Math.min(A.friction, B.friction) * 0.8;
    if (A.shape === 0 && B.shape === 0) {
      const sa = A.sph, sb = B.sph;
      for (let i = 0; i < sa.length; i += 4) {
        rot(A.qx, A.qy, A.qz, A.qw, sa[i], sa[i + 1], sa[i + 2]);
        const ax = A.px + _x, ay = A.py + _y, az = A.pz + _z, ar = sa[i + 3];
        for (let k = 0; k < sb.length; k += 4) {
          rot(B.qx, B.qy, B.qz, B.qw, sb[k], sb[k + 1], sb[k + 2]);
          const ex = ax - (B.px + _x), ey = ay - (B.py + _y), ez = az - (B.pz + _z);
          const r = ar + sb[k + 3];
          const d2 = ex * ex + ey * ey + ez * ez;
          if (d2 >= r * r || d2 < 1e-10) continue;
          const d = Math.sqrt(d2);
          const nx = ex / d, ny = ey / d, nz = ez / d;
          this._contact(A, B, ax - nx * ar, ay - ny * ar, az - nz * ar, nx, ny, nz, r - d, mu * 0.6, h);
        }
      }
    } else if (A.shape === 0) {
      this._spheresVsBox(A, A.sph, B, mu, h);
    } else if (B.shape === 0) {
      this._spheresVsBox(B, B.sph, A, mu, h);
    } else {
      this._spheresVsBox(A, A.bpts, B, mu, h);
      this._spheresVsBox(B, B.bpts, A, mu, h);
    }
  }

  /** A's spheres (or corner points) against B's oriented box. */
  _spheresVsBox(A, list, B, mu, h) {
    const hx = B.hx, hy = B.hy, hz = B.hz;
    irot(B.qx, B.qy, B.qz, B.qw, A.px - B.px, A.py - B.py, A.pz - B.pz);
    const rcx = _x, rcy = _y, rcz = _z;
    const rcl = 1 / (Math.sqrt(rcx * rcx + rcy * rcy + rcz * rcz) || 1);
    for (let i = 0; i < list.length; i += 4) {
      rot(A.qx, A.qy, A.qz, A.qw, list[i], list[i + 1], list[i + 2]);
      const wx = A.px + _x, wy = A.py + _y, wz = A.pz + _z, r = list[i + 3];
      irot(B.qx, B.qy, B.qz, B.qw, wx - B.px, wy - B.py, wz - B.pz);
      const lx = _x, ly = _y, lz = _z;
      if (lx < -hx - r || lx > hx + r || ly < -hy - r || ly > hy + r || lz < -hz - r || lz > hz + r) continue;
      const cx = lx < -hx ? -hx : lx > hx ? hx : lx;
      const cy = ly < -hy ? -hy : ly > hy ? hy : ly;
      const cz = lz < -hz ? -hz : lz > hz ? hz : lz;
      const ex = lx - cx, ey = ly - cy, ez = lz - cz;
      const d2 = ex * ex + ey * ey + ez * ez;
      let nx, ny, nz, pen, px, py, pz;
      if (d2 > 1e-10) {
        if (d2 > r * r) continue;
        const d = Math.sqrt(d2);
        nx = ex / d; ny = ey / d; nz = ez / d; pen = r - d;
        px = cx; py = cy; pz = cz;
      } else {
        // inside: the nearest face is not always the right one - a crate that
        // has sunk a finger's width into the one below it is nearer to a side
        // than to the top. Weigh each face by how squarely it looks at A.
        const sx = rcx < 0 ? -1 : 1, sy = rcy < 0 ? -1 : 1, sz = rcz < 0 ? -1 : 1;
        const px0 = hx - lx * sx, py0 = hy - ly * sy, pz0 = hz - lz * sz;
        let best = px0 / Math.max(0.06, Math.abs(rcx) * rcl); pen = px0; nx = sx; ny = 0; nz = 0;
        let t = py0 / Math.max(0.06, Math.abs(rcy) * rcl); if (t < best) { best = t; pen = py0; nx = 0; ny = sy; nz = 0; }
        t = pz0 / Math.max(0.06, Math.abs(rcz) * rcl); if (t < best) { best = t; pen = pz0; nx = 0; ny = 0; nz = sz; }
        pen += r; px = lx; py = ly; pz = lz;
      }
      rot(B.qx, B.qy, B.qz, B.qw, nx, ny, nz); const wnx = _x, wny = _y, wnz = _z;
      rot(B.qx, B.qy, B.qz, B.qw, px, py, pz);
      this._contact(A, B, B.px + _x, B.py + _y, B.pz + _z, wnx, wny, wnz, pen, mu, h);
      if (wny > 0.6) A.grounded++;
    }
  }

  /* ---------------------------------- rays -------------------------------- */

  /**
   * A ray against the fixed world: static boxes and the ground.
   * Returns the distance, or -1. The normal is left in `hitN`.
   */
  rayWorld(ox, oy, oz, dx, dy, dz, maxT, hitN = _tmp) {
    let best = maxT, hit = false;
    hitN[0] = 0; hitN[1] = 1; hitN[2] = 0;
    this.rayStatic = null;
    // the ground has two levels, road and pavement: try the higher one first
    if (dy < -1e-6) {
      const k = this.kerb;
      let t = (k - oy) / dy;
      if (t >= 0 && t < best && this.ground(ox + dx * t, oz + dz * t) >= k - 1e-3) { best = t; hit = true; }
      else {
        t = -oy / dy;
        if (t >= 0 && t < best) { best = t; hit = true; }
      }
    }
    const st = this.statics;
    const ix = 1 / (dx || 1e-12), iy = 1 / (dy || 1e-12), iz = 1 / (dz || 1e-12);
    for (let i = 0; i < st.length; i++) {
      const s = st[i];
      if (!s.solid && !s.blocksRays) continue;
      let t1 = (s.minx - ox) * ix, t2 = (s.maxx - ox) * ix;
      let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2), axis = 0;
      t1 = (s.miny - oy) * iy; t2 = (s.maxy - oy) * iy;
      let a = Math.min(t1, t2), b = Math.max(t1, t2);
      if (a > tmin) { tmin = a; axis = 1; } if (b < tmax) tmax = b;
      t1 = (s.minz - oz) * iz; t2 = (s.maxz - oz) * iz;
      a = Math.min(t1, t2); b = Math.max(t1, t2);
      if (a > tmin) { tmin = a; axis = 2; } if (b < tmax) tmax = b;
      if (tmax < 0 || tmin > tmax || tmin < 0 || tmin >= best) continue;
      best = tmin; hit = true; this.rayStatic = s;
      hitN[0] = axis === 0 ? (dx > 0 ? -1 : 1) : 0;
      hitN[1] = axis === 1 ? (dy > 0 ? -1 : 1) : 0;
      hitN[2] = axis === 2 ? (dz > 0 ? -1 : 1) : 0;
    }
    return hit ? best : -1;
  }

  /** True when nothing fixed stands between two points. */
  lineClear(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-4) return true;
    const st = this.statics;
    const ix = len / (dx || 1e-12), iy = len / (dy || 1e-12), iz = len / (dz || 1e-12);
    for (let i = 0; i < st.length; i++) {
      const s = st[i];
      if (!s.opaque) continue;
      let t1 = (s.minx - ax) * ix, t2 = (s.maxx - ax) * ix;
      let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
      t1 = (s.miny - ay) * iy; t2 = (s.maxy - ay) * iy;
      tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
      t1 = (s.minz - az) * iz; t2 = (s.maxz - az) * iz;
      tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
      if (tmax >= 0 && tmin <= tmax && tmin < len && tmax > 0) return false;
    }
    return true;
  }
}

/**
 * A ray against one body's box. Returns the distance or -1; the local hit
 * point and the local face normal are written to `out` (6 numbers).
 */
export function rayBody(b, ox, oy, oz, dx, dy, dz, maxT, out, grow = 0) {
  irot(b.qx, b.qy, b.qz, b.qw, ox - b.px, oy - b.py, oz - b.pz);
  const lox = _x, loy = _y, loz = _z;
  irot(b.qx, b.qy, b.qz, b.qw, dx, dy, dz);
  const ldx = _x, ldy = _y, ldz = _z;
  const hx = b.hx + grow, hy = b.hy + grow, hz = b.hz + grow;
  const ix = 1 / (ldx || 1e-12), iy = 1 / (ldy || 1e-12), iz = 1 / (ldz || 1e-12);
  let t1 = (-hx - lox) * ix, t2 = (hx - lox) * ix;
  let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2), axis = 0;
  t1 = (-hy - loy) * iy; t2 = (hy - loy) * iy;
  let a = Math.min(t1, t2), c = Math.max(t1, t2);
  if (a > tmin) { tmin = a; axis = 1; } if (c < tmax) tmax = c;
  t1 = (-hz - loz) * iz; t2 = (hz - loz) * iz;
  a = Math.min(t1, t2); c = Math.max(t1, t2);
  if (a > tmin) { tmin = a; axis = 2; } if (c < tmax) tmax = c;
  if (tmax < 0 || tmin > tmax || tmin > maxT) return -1;
  // starting inside counts as a hit at the start
  const t = tmin < 0 ? 0 : tmin;
  if (out) {
    out[0] = lox + ldx * t; out[1] = loy + ldy * t; out[2] = loz + ldz * t;
    out[3] = axis === 0 ? (ldx > 0 ? -1 : 1) : 0;
    out[4] = axis === 1 ? (ldy > 0 ? -1 : 1) : 0;
    out[5] = axis === 2 ? (ldz > 0 ? -1 : 1) : 0;
    out[6] = tmax;            // where the ray leaves again, for exit wounds
  }
  return t;
}

/** Quaternion helpers shared with the rest of the game, allocation free. */
export function quatMul(a, b, out) {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = b[3];
  out[0] = aw * bx + ax * bw + ay * bz - az * by;
  out[1] = aw * by - ax * bz + ay * bw + az * bx;
  out[2] = aw * bz + ax * by - ay * bx + az * bw;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}
export function quatRotate(q, v, out) {
  rot(q[0], q[1], q[2], q[3], v[0], v[1], v[2]);
  out[0] = _x; out[1] = _y; out[2] = _z;
  return out;
}
