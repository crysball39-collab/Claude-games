/* =============================================================================
   Rigid bodies for Stickfights: crates, brass knuckles, the ground and the two
   walls - all of them boxes - plus a stand-in box for every stickman.

   It is Box2D-lite (Erin Catto's small teaching version of Box2D) carried over
   to JavaScript: box against box by separating axes, contact points found by
   clipping the incident edge against the reference face, and sequential
   impulses that start from last step's answer (warm starting), so a stack of
   crates stands still instead of buzzing. On top of that:

   - restitution, so brass knuckles bounce and crates mostly do not
   - a soft grab joint (Box2D's mouse joint), for the hand that drags things
   - kinematic bodies: infinite mass, but moving. Every stickman owns one, put
     wherever its animation is, so a crate can land on a stickman, rest on a
     body or bounce off a head - and the contact says how hard it hit.

   Positions are metres, y is up, angles are radians counter-clockwise.
   ========================================================================== */

let nextId = 1;

export class Body {
  /**
   * @param {number} w  full width
   * @param {number} h  full height
   * @param {number} mass  Infinity for something that never moves
   */
  constructor(w, h, mass = Infinity, o = {}) {
    this.id = nextId++;
    this.w = w;
    this.h = h;
    this.pos = { x: o.x || 0, y: o.y || 0 };
    this.rot = o.rot || 0;
    this.vel = { x: 0, y: 0 };
    this.angVel = 0;
    this.force = { x: 0, y: 0 };
    this.torque = 0;
    this.friction = o.friction ?? 0.6;
    this.restitution = o.restitution ?? 0;
    this.kinematic = !!o.kinematic;       // moved from outside, never by contacts
    // How heavy a kinematic body is to anything it runs into. 0 is immovable;
    // anything else lets it give a little in the solver (it is put back where
    // it belongs next step anyway), so whatever it squeezes against the floor
    // is not crushed with infinite force.
    this.pushMass = o.pushMass || 0;
    this.owner = o.owner || null;
    this.linearDamping = o.linearDamping ?? 0.04;
    this.angularDamping = o.angularDamping ?? 0.25;
    this.ignore = null;                   // a Set of bodies this one passes through
    this.setMass(mass);
  }

  setMass(m) {
    this.mass = m;
    if (m < Infinity && !this.kinematic) {
      this.invMass = 1 / m;
      this.I = (m * (this.w * this.w + this.h * this.h)) / 12;
      this.invI = 1 / this.I;
    } else {
      this.invMass = 0;
      this.I = Infinity;
      this.invI = 0;
    }
    // what the contact solver uses: the real thing, or the push mass of a
    // kinematic body (which never turns)
    this.sim = this.kinematic && this.pushMass ? 1 / this.pushMass : this.invMass;
    this.siI = this.kinematic ? 0 : this.invI;
  }

  /** Turns a body kinematic (carried, held still by a hand) or back to dynamic. */
  setKinematic(on, mass = this.mass) {
    this.kinematic = on;
    this.setMass(mass);
  }

  setSize(w, h) {
    this.w = w;
    this.h = h;
    if (this.invMass) this.setMass(this.mass);
  }

  get dynamic() { return this.invMass > 0; }

  toWorld(lx, ly) {
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    return { x: this.pos.x + c * lx - s * ly, y: this.pos.y + s * lx + c * ly };
  }

  toLocal(wx, wy) {
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    const dx = wx - this.pos.x, dy = wy - this.pos.y;
    return { x: c * dx + s * dy, y: -s * dx + c * dy };
  }

  corners() {
    const hw = this.w / 2, hh = this.h / 2;
    return [this.toWorld(-hw, -hh), this.toWorld(hw, -hh), this.toWorld(hw, hh), this.toWorld(-hw, hh)];
  }

  aabb() {
    const c = Math.abs(Math.cos(this.rot)), s = Math.abs(Math.sin(this.rot));
    const ex = (c * this.w + s * this.h) / 2, ey = (s * this.w + c * this.h) / 2;
    return { minX: this.pos.x - ex, maxX: this.pos.x + ex, minY: this.pos.y - ey, maxY: this.pos.y + ey };
  }

  velAt(wx, wy) {
    const rx = wx - this.pos.x, ry = wy - this.pos.y;
    return { x: this.vel.x - this.angVel * ry, y: this.vel.y + this.angVel * rx };
  }

  applyImpulse(ix, iy, wx, wy) {
    if (!this.invMass) return;
    this.vel.x += this.invMass * ix;
    this.vel.y += this.invMass * iy;
    const rx = wx - this.pos.x, ry = wy - this.pos.y;
    this.angVel += this.invI * (rx * iy - ry * ix);
  }

  applyForce(fx, fy, wx, wy) {
    this.force.x += fx;
    this.force.y += fy;
    const rx = wx - this.pos.x, ry = wy - this.pos.y;
    this.torque += rx * fy - ry * fx;
  }

  contains(wx, wy, pad = 0) {
    const l = this.toLocal(wx, wy);
    return Math.abs(l.x) <= this.w / 2 + pad && Math.abs(l.y) <= this.h / 2 + pad;
  }

  /** The highest point of the outline above x, or -Infinity where it does not reach. */
  topAt(x) {
    const p = this.corners();
    let best = -Infinity;
    for (let i = 0; i < 4; i++) {
      const a = p[i], b = p[(i + 1) % 4];
      const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
      if (x < lo - 1e-9 || x > hi + 1e-9) continue;
      const y = hi - lo < 1e-9 ? Math.max(a.y, b.y) : a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
      if (y > best) best = y;
    }
    return best;
  }
}

/* -------------------------------------------------------------------------- */
/*                               box against box                              */
/* -------------------------------------------------------------------------- */

// Edges, numbered the way Box2D-lite numbers them, so features can be matched
// from one step to the next.
const NO_EDGE = 0, EDGE1 = 1, EDGE2 = 2, EDGE3 = 3, EDGE4 = 4;

const vtx = (x, y, in1, out1, in2, out2) => ({ x, y, in1, out1, in2, out2 });
const copyVtx = (v) => vtx(v.x, v.y, v.in1, v.out1, v.in2, v.out2);
const featureKey = (v) => v.in1 | (v.out1 << 3) | (v.in2 << 6) | (v.out2 << 9);

function incidentEdge(hx, hy, pos, c, s, nx, ny) {
  // the reference normal, in the incident box's frame, reversed
  const ix = -(c * nx + s * ny), iy = -(-s * nx + c * ny);
  let v0, v1;
  if (Math.abs(ix) > Math.abs(iy)) {
    if (ix >= 0) { v0 = vtx(hx, -hy, 0, 0, EDGE3, EDGE4); v1 = vtx(hx, hy, 0, 0, EDGE4, EDGE1); }
    else { v0 = vtx(-hx, hy, 0, 0, EDGE1, EDGE2); v1 = vtx(-hx, -hy, 0, 0, EDGE2, EDGE3); }
  } else if (iy >= 0) {
    v0 = vtx(hx, hy, 0, 0, EDGE4, EDGE1); v1 = vtx(-hx, hy, 0, 0, EDGE1, EDGE2);
  } else {
    v0 = vtx(-hx, -hy, 0, 0, EDGE2, EDGE3); v1 = vtx(hx, -hy, 0, 0, EDGE3, EDGE4);
  }
  for (const v of [v0, v1]) {
    const x = v.x, y = v.y;
    v.x = pos.x + c * x - s * y;
    v.y = pos.y + s * x + c * y;
  }
  return [v0, v1];
}

function clipSegment(vIn, nx, ny, offset, clipEdge) {
  const out = [];
  const d0 = nx * vIn[0].x + ny * vIn[0].y - offset;
  const d1 = nx * vIn[1].x + ny * vIn[1].y - offset;
  if (d0 <= 0) out.push(copyVtx(vIn[0]));
  if (d1 <= 0) out.push(copyVtx(vIn[1]));
  if (d0 * d1 < 0) {
    const t = d0 / (d0 - d1);
    const v = copyVtx(d0 > 0 ? vIn[0] : vIn[1]);
    v.x = vIn[0].x + t * (vIn[1].x - vIn[0].x);
    v.y = vIn[0].y + t * (vIn[1].y - vIn[0].y);
    if (d0 > 0) { v.in1 = clipEdge; v.in2 = NO_EDGE; } else { v.out1 = clipEdge; v.out2 = NO_EDGE; }
    out.push(v);
  }
  return out;
}

/** Contact points between two boxes, the normal pointing from a to b. */
export function collide(a, b) {
  const hAx = a.w / 2, hAy = a.h / 2, hBx = b.w / 2, hBy = b.h / 2;
  const cA = Math.cos(a.rot), sA = Math.sin(a.rot);
  const cB = Math.cos(b.rot), sB = Math.sin(b.rot);
  const dpx = b.pos.x - a.pos.x, dpy = b.pos.y - a.pos.y;
  const dAx = cA * dpx + sA * dpy, dAy = -sA * dpx + cA * dpy;
  const dBx = cB * dpx + sB * dpy, dBy = -sB * dpx + cB * dpy;
  // C = RotA^T RotB is a rotation by the difference, so |C| is symmetric
  const cr = Math.abs(Math.cos(b.rot - a.rot)), sr = Math.abs(Math.sin(b.rot - a.rot));

  const faceAx = Math.abs(dAx) - hAx - (cr * hBx + sr * hBy);
  const faceAy = Math.abs(dAy) - hAy - (sr * hBx + cr * hBy);
  if (faceAx > 0 || faceAy > 0) return [];
  const faceBx = Math.abs(dBx) - (cr * hAx + sr * hAy) - hBx;
  const faceBy = Math.abs(dBy) - (sr * hAx + cr * hAy) - hBy;
  if (faceBx > 0 || faceBy > 0) return [];

  // the axis of least penetration, preferring A's faces when it is close
  const relTol = 0.95, absTol = 0.01;
  let axis = 0, sep = faceAx;
  let nx = dAx > 0 ? cA : -cA, ny = dAx > 0 ? sA : -sA;
  if (faceAy > relTol * sep + absTol * hAy) {
    axis = 1; sep = faceAy;
    nx = dAy > 0 ? -sA : sA; ny = dAy > 0 ? cA : -cA;
  }
  if (faceBx > relTol * sep + absTol * hBx) {
    axis = 2; sep = faceBx;
    nx = dBx > 0 ? cB : -cB; ny = dBx > 0 ? sB : -sB;
  }
  if (faceBy > relTol * sep + absTol * hBy) {
    axis = 3; sep = faceBy;
    nx = dBy > 0 ? -sB : sB; ny = dBy > 0 ? cB : -cB;
  }

  let fnx, fny, front, snx, sny, negSide, posSide, negEdge, posEdge, inc;
  if (axis === 0) {
    fnx = nx; fny = ny;
    front = a.pos.x * fnx + a.pos.y * fny + hAx;
    snx = -sA; sny = cA;
    const side = a.pos.x * snx + a.pos.y * sny;
    negSide = -side + hAy; posSide = side + hAy;
    negEdge = EDGE3; posEdge = EDGE1;
    inc = incidentEdge(hBx, hBy, b.pos, cB, sB, fnx, fny);
  } else if (axis === 1) {
    fnx = nx; fny = ny;
    front = a.pos.x * fnx + a.pos.y * fny + hAy;
    snx = cA; sny = sA;
    const side = a.pos.x * snx + a.pos.y * sny;
    negSide = -side + hAx; posSide = side + hAx;
    negEdge = EDGE2; posEdge = EDGE4;
    inc = incidentEdge(hBx, hBy, b.pos, cB, sB, fnx, fny);
  } else if (axis === 2) {
    fnx = -nx; fny = -ny;
    front = b.pos.x * fnx + b.pos.y * fny + hBx;
    snx = -sB; sny = cB;
    const side = b.pos.x * snx + b.pos.y * sny;
    negSide = -side + hBy; posSide = side + hBy;
    negEdge = EDGE3; posEdge = EDGE1;
    inc = incidentEdge(hAx, hAy, a.pos, cA, sA, fnx, fny);
  } else {
    fnx = -nx; fny = -ny;
    front = b.pos.x * fnx + b.pos.y * fny + hBy;
    snx = cB; sny = sB;
    const side = b.pos.x * snx + b.pos.y * sny;
    negSide = -side + hBx; posSide = side + hBx;
    negEdge = EDGE2; posEdge = EDGE4;
    inc = incidentEdge(hAx, hAy, a.pos, cA, sA, fnx, fny);
  }

  // clip the incident edge to the two side planes of the reference face
  const c1 = clipSegment(inc, -snx, -sny, negSide, negEdge);
  if (c1.length < 2) return [];
  const c2 = clipSegment(c1, snx, sny, posSide, posEdge);
  if (c2.length < 2) return [];

  const out = [];
  for (const v of c2) {
    const s = fnx * v.x + fny * v.y - front;
    if (s > 0) continue;
    if (axis >= 2) { // the feature was found from b's side: swap it round
      const i = v.in1, o = v.out1;
      v.in1 = v.in2; v.out1 = v.out2; v.in2 = i; v.out2 = o;
    }
    out.push({
      x: v.x - s * fnx, y: v.y - s * fny,      // slid onto the reference face
      nx, ny, sep: s, key: featureKey(v),
      Pn: 0, Pt: 0, massN: 0, massT: 0, bias: 0,
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*                                  arbiters                                  */
/* -------------------------------------------------------------------------- */

// How much overlap is left alone, and what fraction of the rest is pushed out
// each step. Exported so a test can try other values.
export const TUNING = { allowed: 0.005, bias: 0.2 };
const BOUNCE_THRESHOLD = 1.2;     // m/s; slower than this, nothing bounces

class Arbiter {
  constructor(b1, b2, contacts) {
    this.b1 = b1;
    this.b2 = b2;
    this.contacts = contacts;
    this.friction = Math.sqrt(b1.friction * b2.friction);
    this.restitution = Math.max(b1.restitution, b2.restitution);
    this.fresh = true;       // touched for the first time this step
    this.approach = 0;       // how fast the two were closing, m/s
    this.into1 = 0;          // how fast b1 itself was moving at b2, and b2 at b1:
    this.into2 = 0;          // a crate thrown at someone, not someone running into one
    this.impulse = 0;        // the normal impulse this step, N s
  }

  update(contacts) {
    for (const c of contacts) {
      const old = this.contacts.find((o) => o.key === c.key);
      if (old) { c.Pn = old.Pn; c.Pt = old.Pt; }
    }
    this.contacts = contacts;
    this.fresh = false;
  }

  /**
   * Masses and biases. This has to see every body's velocity before anyone's
   * warm start is applied: a stack's bottom contact warm-starts the crate it
   * holds up by most of a metre a second, and the contact above it would read
   * that as an impact and bounce.
   */
  preStep(invDt) {
    const b1 = this.b1, b2 = this.b2;
    this.approach = 0;
    this.into1 = 0;
    this.into2 = 0;
    for (const c of this.contacts) {
      const r1x = c.x - b1.pos.x, r1y = c.y - b1.pos.y;
      const r2x = c.x - b2.pos.x, r2y = c.y - b2.pos.y;
      const rn1 = r1x * c.nx + r1y * c.ny, rn2 = r2x * c.nx + r2y * c.ny;
      const v1n = (b1.vel.x - b1.angVel * r1y) * c.nx + (b1.vel.y + b1.angVel * r1x) * c.ny;
      const v2n = (b2.vel.x - b2.angVel * r2y) * c.nx + (b2.vel.y + b2.angVel * r2x) * c.ny;
      if (v1n > this.into1) this.into1 = v1n;
      if (-v2n > this.into2) this.into2 = -v2n;
      let kN = b1.sim + b2.sim;
      kN += b1.siI * (r1x * r1x + r1y * r1y - rn1 * rn1) + b2.siI * (r2x * r2x + r2y * r2y - rn2 * rn2);
      c.massN = 1 / kN;
      const tx = c.ny, ty = -c.nx;
      const rt1 = r1x * tx + r1y * ty, rt2 = r2x * tx + r2y * ty;
      let kT = b1.sim + b2.sim;
      kT += b1.siI * (r1x * r1x + r1y * r1y - rt1 * rt1) + b2.siI * (r2x * r2x + r2y * r2y - rt2 * rt2);
      c.massT = 1 / kT;

      // how fast they are closing, before any of this step's impulses
      const dvx = b2.vel.x - b2.angVel * r2y - b1.vel.x + b1.angVel * r1y;
      const dvy = b2.vel.y + b2.angVel * r2x - b1.vel.y - b1.angVel * r1x;
      const vn = dvx * c.nx + dvy * c.ny;
      if (-vn > this.approach) this.approach = -vn;
      const bounce = vn < -BOUNCE_THRESHOLD ? -this.restitution * vn : 0;
      const push = -TUNING.bias * invDt * Math.min(0, c.sep + TUNING.allowed);
      c.bias = Math.max(bounce, Math.min(push, 4));
    }
  }

  /** Last step's impulses, applied up front so the solver starts near the answer. */
  warmStart() {
    const b1 = this.b1, b2 = this.b2;
    for (const c of this.contacts) {
      const r1x = c.x - b1.pos.x, r1y = c.y - b1.pos.y;
      const r2x = c.x - b2.pos.x, r2y = c.y - b2.pos.y;
      const tx = c.ny, ty = -c.nx;
      const px = c.Pn * c.nx + c.Pt * tx, py = c.Pn * c.ny + c.Pt * ty;
      b1.vel.x -= b1.sim * px; b1.vel.y -= b1.sim * py;
      b1.angVel -= b1.siI * (r1x * py - r1y * px);
      b2.vel.x += b2.sim * px; b2.vel.y += b2.sim * py;
      b2.angVel += b2.siI * (r2x * py - r2y * px);
    }
  }

  applyImpulse() {
    const b1 = this.b1, b2 = this.b2;
    for (const c of this.contacts) {
      const r1x = c.x - b1.pos.x, r1y = c.y - b1.pos.y;
      const r2x = c.x - b2.pos.x, r2y = c.y - b2.pos.y;

      let dvx = b2.vel.x - b2.angVel * r2y - b1.vel.x + b1.angVel * r1y;
      let dvy = b2.vel.y + b2.angVel * r2x - b1.vel.y - b1.angVel * r1x;
      const vn = dvx * c.nx + dvy * c.ny;
      let dPn = c.massN * (-vn + c.bias);
      const Pn0 = c.Pn;
      c.Pn = Math.max(Pn0 + dPn, 0);
      dPn = c.Pn - Pn0;
      let px = dPn * c.nx, py = dPn * c.ny;
      b1.vel.x -= b1.sim * px; b1.vel.y -= b1.sim * py;
      b1.angVel -= b1.siI * (r1x * py - r1y * px);
      b2.vel.x += b2.sim * px; b2.vel.y += b2.sim * py;
      b2.angVel += b2.siI * (r2x * py - r2y * px);

      dvx = b2.vel.x - b2.angVel * r2y - b1.vel.x + b1.angVel * r1y;
      dvy = b2.vel.y + b2.angVel * r2x - b1.vel.y - b1.angVel * r1x;
      const tx = c.ny, ty = -c.nx;
      const vt = dvx * tx + dvy * ty;
      let dPt = c.massT * -vt;
      const maxPt = this.friction * c.Pn;
      const Pt0 = c.Pt;
      c.Pt = Math.max(-maxPt, Math.min(maxPt, Pt0 + dPt));
      dPt = c.Pt - Pt0;
      px = dPt * tx; py = dPt * ty;
      b1.vel.x -= b1.sim * px; b1.vel.y -= b1.sim * py;
      b1.angVel -= b1.siI * (r1x * py - r1y * px);
      b2.vel.x += b2.sim * px; b2.vel.y += b2.sim * py;
      b2.angVel += b2.siI * (r2x * py - r2y * px);
    }
  }

  /** The other body, and the normal pointing from `body` toward it. */
  other(body) {
    const flip = body === this.b2;
    const c = this.contacts[0];
    return { body: flip ? this.b1 : this.b2, nx: flip ? -c.nx : c.nx, ny: flip ? -c.ny : c.ny };
  }

  /** Where they touch: the average of the contact points. */
  point() {
    let x = 0, y = 0;
    for (const c of this.contacts) { x += c.x; y += c.y; }
    const n = this.contacts.length || 1;
    return { x: x / n, y: y / n };
  }
}

/* -------------------------------------------------------------------------- */
/*                                 grab joint                                 */
/* -------------------------------------------------------------------------- */

/**
 * Box2D's mouse joint: a stiff, damped spring from a point on a body to a
 * target, with a cap on its force, so a grabbed crate swings from where it
 * was picked up and something too heavy just will not come.
 */
export class GrabJoint {
  constructor(body, wx, wy, o = {}) {
    this.body = body;
    this.local = body.toLocal(wx, wy);
    this.target = { x: wx, y: wy };
    this.hz = o.hz ?? 4.5;
    this.damping = o.damping ?? 0.75;
    this.maxForce = o.maxForce ?? 900 * body.mass;
    this.acc = { x: 0, y: 0 };
  }

  anchor() { return this.body.toWorld(this.local.x, this.local.y); }

  preStep(dt) {
    const b = this.body;
    const m = b.mass, omega = 2 * Math.PI * this.hz;
    const d = 2 * m * this.damping * omega, k = m * omega * omega;
    let gamma = dt * (d + dt * k);
    gamma = gamma ? 1 / gamma : 0;
    this.gamma = gamma;
    const beta = dt * k * gamma;
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    const rx = c * this.local.x - s * this.local.y, ry = s * this.local.x + c * this.local.y;
    this.rx = rx; this.ry = ry;
    const k11 = b.invMass + b.invI * ry * ry + gamma;
    const k12 = -b.invI * rx * ry;
    const k22 = b.invMass + b.invI * rx * rx + gamma;
    let det = k11 * k22 - k12 * k12;
    det = det ? 1 / det : 0;
    this.m11 = det * k22; this.m12 = -det * k12; this.m22 = det * k11;
    this.cx = (b.pos.x + rx - this.target.x) * beta;
    this.cy = (b.pos.y + ry - this.target.y) * beta;
    this.maxImpulse = dt * this.maxForce;
    b.angVel *= 0.98;
    b.vel.x += b.invMass * this.acc.x;
    b.vel.y += b.invMass * this.acc.y;
    b.angVel += b.invI * (rx * this.acc.y - ry * this.acc.x);
  }

  applyImpulse() {
    const b = this.body;
    const vx = b.vel.x - b.angVel * this.ry, vy = b.vel.y + b.angVel * this.rx;
    const qx = -(vx + this.cx + this.gamma * this.acc.x);
    const qy = -(vy + this.cy + this.gamma * this.acc.y);
    let ix = this.m11 * qx + this.m12 * qy, iy = this.m12 * qx + this.m22 * qy;
    const ox = this.acc.x, oy = this.acc.y;
    this.acc.x += ix; this.acc.y += iy;
    const len = Math.hypot(this.acc.x, this.acc.y);
    if (len > this.maxImpulse) { this.acc.x *= this.maxImpulse / len; this.acc.y *= this.maxImpulse / len; }
    ix = this.acc.x - ox; iy = this.acc.y - oy;
    b.vel.x += b.invMass * ix; b.vel.y += b.invMass * iy;
    b.angVel += b.invI * (this.rx * iy - this.ry * ix);
  }
}

/* -------------------------------------------------------------------------- */
/*                                    world                                   */
/* -------------------------------------------------------------------------- */

const MAX_SPEED = 30;

export class World {
  constructor({ gravity = -18, iterations = 10 } = {}) {
    this.gravity = gravity;
    this.iterations = iterations;
    this.bodies = [];
    this.arbiters = new Map();
    this.joints = [];
    /** Optional (a, b) => false to let two bodies pass through each other. */
    this.filter = null;
  }

  add(b) { this.bodies.push(b); return b; }

  remove(b) {
    const i = this.bodies.indexOf(b);
    if (i >= 0) this.bodies.splice(i, 1);
    for (const [k, arb] of this.arbiters) if (arb.b1 === b || arb.b2 === b) this.arbiters.delete(k);
    this.joints = this.joints.filter((j) => j.body !== b);
  }

  addJoint(j) { this.joints.push(j); return j; }
  removeJoint(j) { this.joints = this.joints.filter((x) => x !== j); }

  /** Every arbiter touching body b. */
  *contactsOf(b) {
    for (const arb of this.arbiters.values()) if (arb.b1 === b || arb.b2 === b) yield arb;
  }

  broadPhase() {
    const bs = this.bodies;
    for (let i = 0; i < bs.length; i++) {
      const bi = bs[i];
      const ai = bi.aabb();
      for (let j = i + 1; j < bs.length; j++) {
        const bj = bs[j];
        const b1 = bi.id < bj.id ? bi : bj, b2 = b1 === bi ? bj : bi;
        const key = b1.id * 65536 + b2.id;
        if (bi.invMass === 0 && bj.invMass === 0) { this.arbiters.delete(key); continue; }
        const aj = bj.aabb();
        const apart = ai.maxX < aj.minX || aj.maxX < ai.minX || ai.maxY < aj.minY || aj.maxY < ai.minY;
        const skip = apart || (bi.ignore && bi.ignore.has(bj)) || (bj.ignore && bj.ignore.has(bi)) ||
          (this.filter && this.filter(bi, bj) === false);
        const contacts = skip ? [] : collide(b1, b2);
        if (contacts.length) {
          const arb = this.arbiters.get(key);
          if (arb) arb.update(contacts);
          else this.arbiters.set(key, new Arbiter(b1, b2, contacts));
        } else {
          this.arbiters.delete(key);
        }
      }
    }
  }

  step(dt) {
    const invDt = dt > 0 ? 1 / dt : 0;
    this.broadPhase();

    for (const b of this.bodies) {
      if (!b.invMass) continue;
      b.vel.x += dt * b.invMass * b.force.x;
      b.vel.y += dt * (this.gravity + b.invMass * b.force.y);
      b.angVel += dt * b.invI * b.torque;
      const ld = 1 / (1 + dt * b.linearDamping), ad = 1 / (1 + dt * b.angularDamping);
      b.vel.x *= ld; b.vel.y *= ld; b.angVel *= ad;
    }

    for (const arb of this.arbiters.values()) arb.preStep(invDt);
    for (const arb of this.arbiters.values()) arb.warmStart();
    for (const j of this.joints) j.preStep(dt);
    for (let i = 0; i < this.iterations; i++) {
      for (const arb of this.arbiters.values()) arb.applyImpulse();
      for (const j of this.joints) j.applyImpulse();
    }

    for (const b of this.bodies) {
      if (!b.invMass) { b.force.x = b.force.y = b.torque = 0; continue; }
      const sp = Math.hypot(b.vel.x, b.vel.y);
      if (sp > MAX_SPEED) { b.vel.x *= MAX_SPEED / sp; b.vel.y *= MAX_SPEED / sp; }
      b.angVel = Math.max(-40, Math.min(40, b.angVel));
      b.pos.x += dt * b.vel.x;
      b.pos.y += dt * b.vel.y;
      b.rot += dt * b.angVel;
      b.force.x = b.force.y = b.torque = 0;
    }
    for (const arb of this.arbiters.values()) {
      let sum = 0;
      for (const c of arb.contacts) sum += c.Pn;
      arb.impulse = sum;
    }
  }

  /** The first body a segment runs into, and how far along it: { body, t } or null. */
  raycast(x0, y0, x1, y1, filter = null) {
    let best = null;
    for (const b of this.bodies) {
      if (filter && !filter(b)) continue;
      const t = rayBox(b, x0, y0, x1, y1);
      if (t !== null && (!best || t < best.t)) best = { body: b, t };
    }
    return best;
  }

  /** Bodies under a point, most recently added first. */
  pointQuery(x, y, pad = 0, filter = null) {
    const out = [];
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      if (filter && !filter(b)) continue;
      if (b.contains(x, y, pad)) out.push(b);
    }
    return out;
  }
}

function rayBox(b, x0, y0, x1, y1) {
  const p = b.toLocal(x0, y0), q = b.toLocal(x1, y1);
  const dx = q.x - p.x, dy = q.y - p.y;
  const hw = b.w / 2, hh = b.h / 2;
  let tmin = 0, tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (Math.abs(p.x) > hw) return null;
  } else {
    let t1 = (-hw - p.x) / dx, t2 = (hw - p.x) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (Math.abs(dy) < 1e-9) {
    if (Math.abs(p.y) > hh) return null;
  } else {
    let t1 = (-hh - p.y) / dy, t2 = (hh - p.y) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}
