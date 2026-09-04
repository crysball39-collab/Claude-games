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

/* -------------------------------------------------------------------------- */
/*                                  particle                                  */
/* -------------------------------------------------------------------------- */

export class Particle {
  constructor(x = 0, y = 0, z = 0, opts = {}) {
    this.id = _pid++;
    this.x = x; this.y = y; this.z = z;
    this.px = x; this.py = y; this.pz = z;
    // muscle target (where the animation wants this joint to be)
    this.tx = x; this.ty = y; this.tz = z;
    this.ptx = x; this.pty = y; this.ptz = z;
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
  addConstraint(c) { this.constraints.push(c); return c; }
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
    this.constraints = this.constraints.filter((k) => k.a.owner !== c && k.b.owner !== c);
    this.segments = this.segments.filter((s) => s.a.owner !== c);
  }

  clearDynamic() {
    this.bodies.length = 0;
  }

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

    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.pinned) { p.px = p.x; p.py = p.y; p.pz = p.z; continue; }
      const vx = (p.x - p.px) * drag, vy = (p.y - p.py) * drag, vz = (p.z - p.pz) * drag;
      p.px = p.x; p.py = p.y; p.pz = p.z;
      p.x += vx + gx; p.y += vy + gy; p.z += vz + gz;
      p.grounded = false;
    }

    // muscles pull the ragdoll towards the animated pose
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.muscle <= 0) continue;
      if (p.muscle >= 0.999) {
        p.x = p.tx; p.y = p.ty; p.z = p.tz;
        p.px = p.ptx; p.py = p.pty; p.pz = p.ptz;
      } else {
        const k = p.muscle * p.muscle * 0.45;
        p.x += (p.tx - p.x) * k;
        p.y += (p.ty - p.y) * k;
        p.z += (p.tz - p.z) * k;
      }
    }

    for (let it = 0; it < this.constraintIters; it++) {
      const cs = this.constraints;
      for (let i = 0; i < cs.length; i++) cs[i].solve();
      const last = it === this.constraintIters - 1;
      this._collideParticles(dt, last, it >= this.constraintIters - 2);
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
        p.y += pen;
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

    // Move the particle out.
    p.x += _v3.x * pen; p.y += _v3.y * pen; p.z += _v3.z * pen;
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
        const j = (-1.02 * vn) / eff;
        // particle side
        p.px -= _v3.x * j * p.invMass * dt;
        p.py -= _v3.y * j * p.invMass * dt;
        p.pz -= _v3.z * j * p.invMass * dt;
        if (body.invMass > 0) {
          _v1.copy(_v3).multiplyScalar(-j * 0.85);
          body.applyImpulse(_v1, _v2);
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
            const push = ((rr - d) / d) * 0.6;
            const wp = p.invMass / wsum, wq = q.invMass / wsum;
            p.x -= dx * push * wp; p.y -= dy * push * wp; p.z -= dz * push * wp;
            q.x += dx * push * wq; q.y += dy * push * wq; q.z += dz * push * wq;
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

