/* =============================================================================
   Ragdolls: a body that physics moves instead of an animation.

   It is Verlet integration, the way Thomas Jakobsen did it for the bodies in
   Hitman: every joint is a point with a mass, every bone a stick between two
   points that always keeps its length, and the position each point had a
   step ago stands in for its velocity, so pushing a point somewhere is all
   it takes to set it moving. Each step:

     1. every point carries on the way it was going, and falls a little
     2. a few times over, everything that has to be true is made true:
          bones keep their length
          joints stay inside the range a real one bends through - a knee
            never bends forwards, an elbow never backwards - and a broken
            bone flops at the break; locked (a body frozen solid), they do
            not bend at all, and the whole thing moves as one stiff piece
          muscles, while there is anyone awake inside, pull each joint some
            of the way toward the pose an animation wants
          a hand that has hold of the body drags that part of it along
          nothing goes through the floor, the walls or a crate
     3. whatever hit something gets its speed into it taken out, and a crate
        it hit gets that as a shove - so a body knocks crates about, and a
        crate dropped on a body lands on it and stays there

   Points can also sit partway along a bone (the shoulders sit on the upper
   back): anything that pushes one shares the push out between the two ends.

   Angles are clockwise from straight up, as everywhere else. A ragdoll keeps
   the facing it was made with: a body tumbling in 2D can turn over, but it can
   never turn into its own mirror image, so the joint ranges stay the right
   way round however it lands.
   ========================================================================== */

const TAU = Math.PI * 2;
const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const MAX_STEP = 40;            // metres per second no point is allowed to exceed

export class Ragdoll {
  /**
   * @param {object} o  { facing, gravity, iterations }
   */
  constructor(o = {}) {
    this.facing = o.facing || 1;
    this.gravity = o.gravity ?? 18;
    this.iterations = o.iterations || 10;
    this.p = [];           // points: { name, x, y, px, py, im, r, ground, body }
    this.links = [];       // bones: { a, b, len }
    this.joints = [];      // { p0, p1, c0, c1, center, half, target, k, prev, name }
    this.byName = {};
    this.grabRef = null;
    this.grabAt = { x: 0, y: 0 };
    this.grabK = 0.85;
    this.tone = 0;          // how hard the muscles pull, 0 limp .. 1 wide awake
    this.friction = 0.03;   // joint friction: keeps a limp body from flopping for ever
    this.passive = 0.004;   // how hard the joints drift back to rest, per pass
    this.drag = 0.1;        // air, per second
    this.contacts = [];
    this.impacts = [];      // { i, speed, what } from the last step: what hit what, how hard
    this.asleep = false;
    this.still = 0;
    this.maxSpeed = 0;
  }

  /* ------------------------------- building -------------------------------- */

  point(name, x, y, mass, r, vx = 0, vy = 0, dt = 1 / 120) {
    const i = this.p.length;
    this.p.push({ name, x, y, px: x - vx * dt, py: y - vy * dt, im: mass > 0 ? 1 / mass : 0, r, ground: false, body: null });
    this.byName[name] = i;
    return i;
  }

  /** A point t of the way from point a to point b, standing for whatever hangs off it. */
  along(a, b, t) { return { a, b, t }; }

  link(a, b, len = null) {
    const P = this.pos(a), Q = this.pos(b);
    this.links.push({ a, b, len: len ?? Math.hypot(P.x - Q.x, P.y - Q.y) });
  }

  /**
   * A joint between the parent bone p0->p1 and the child bone c0->c1 (c0 is
   * the pivot). It may bend so that the child's angle minus the parent's lies
   * in [lo, hi] (in degrees, for a body facing +x).
   */
  joint(name, p0, p1, c0, c1, lo, hi) {
    const D = Math.PI / 180;
    // what turns when the parent side gives: the end of the parent bone away
    // from the pivot, or both ends when the pivot sits partway along it
    const far = c0 === p1 ? [p0] : c0 === p0 ? [p1] : [p0, p1];
    this.joints.push({
      name, p0, p1, c0, c1, far,
      center: ((lo + hi) / 2) * D, half: ((hi - lo) / 2) * D,
      target: null, k: 0, prev: null,
    });
    return this.joints.length - 1;
  }

  /* ------------------------------ point access ----------------------------- */

  pos(ref, out = { x: 0, y: 0 }) {
    if (typeof ref === 'number') { const q = this.p[ref]; out.x = q.x; out.y = q.y; return out; }
    const A = this.p[ref.a], B = this.p[ref.b];
    out.x = A.x + (B.x - A.x) * ref.t;
    out.y = A.y + (B.y - A.y) * ref.t;
    return out;
  }

  /** The inverse mass of a point, or of a point partway along a bone, as a push sees it. */
  invMass(ref) {
    if (typeof ref === 'number') return this.p[ref].im;
    const t = ref.t;
    return (1 - t) * (1 - t) * this.p[ref.a].im + t * t * this.p[ref.b].im;
  }

  /**
   * Moves a point by lambda times its share: the right way to push on
   * something with a mass (lambda is a displacement per unit inverse mass).
   */
  push(ref, lx, ly) {
    if (typeof ref === 'number') {
      const q = this.p[ref];
      q.x += lx * q.im; q.y += ly * q.im;
      return;
    }
    const A = this.p[ref.a], B = this.p[ref.b], t = ref.t;
    A.x += lx * (1 - t) * A.im; A.y += ly * (1 - t) * A.im;
    B.x += lx * t * B.im; B.y += ly * t * B.im;
  }

  angle(a, b) {
    const P = this.pos(a, _p), Q = this.pos(b, _q);
    return Math.atan2(Q.x - P.x, Q.y - P.y);
  }

  /** A joint's bend, as a body facing +x would have it. */
  bend(j) {
    return wrap(this.angle(j.c0, j.c1) - this.angle(j.p0, j.p1)) * this.facing;
  }

  /* ------------------------------ controlling ------------------------------ */

  /** The muscles' goal for joint i, a bend in radians (facing +x), and how hard to pull. */
  setTarget(i, bend, k) {
    const j = this.joints[i];
    j.target = bend;
    j.k = k;
  }

  grab(ref, x, y) {
    this.grabRef = ref;
    this.grabAt.x = x;
    this.grabAt.y = y;
    this.wake();
  }

  release() { this.grabRef = null; }

  /**
   * Every joint held at the bend it has right now: the body moves as one
   * stiff piece, toppling and sliding all of a piece (frozen solid).
   */
  lock() { for (const j of this.joints) j.lock = this.rawBend(j); this.wake(); }
  unlock() { for (const j of this.joints) j.lock = null; this.wake(); }
  get locked() { return this.joints.length > 0 && this.joints[0].lock != null; }

  /** Adds velocity to every point (vx, vy in m/s). */
  kick(vx, vy, dt = 1 / 120) {
    for (const q of this.p) { q.px -= vx * dt; q.py -= vy * dt; }
    this.wake();
  }

  /** Every point's velocity taken fraction k of the way to (vx, vy): the body flung as a whole. */
  fling(vx, vy, k, dt = 1 / 120) {
    for (const q of this.p) {
      const ux = (q.x - q.px) / dt, uy = (q.y - q.py) / dt;
      const nx = ux + (vx - ux) * k, ny = uy + (vy - uy) * k;
      q.px = q.x - nx * dt;
      q.py = q.y - ny * dt;
    }
    this.wake();
  }

  /** Adds velocity to the points near (x, y), falling off over radius r. */
  shove(x, y, vx, vy, r = 0.35, dt = 1 / 120) {
    for (const q of this.p) {
      const d = Math.hypot(q.x - x, q.y - y);
      const w = Math.max(0, 1 - d / r);
      if (w <= 0) continue;
      q.px -= vx * w * dt;
      q.py -= vy * w * dt;
    }
    this.wake();
  }

  velocity(i, dt = 1 / 120) {
    const q = this.p[i];
    return { x: (q.x - q.px) / dt, y: (q.y - q.py) / dt };
  }

  wake() { this.asleep = false; this.still = 0; }

  get center() {
    let x = 0, y = 0, m = 0;
    for (const q of this.p) { const w = q.im > 0 ? 1 / q.im : 0; x += q.x * w; y += q.y * w; m += w; }
    return { x: x / m, y: y / m };
  }

  aabb(pad = 0) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const q of this.p) {
      if (q.x - q.r < minX) minX = q.x - q.r;
      if (q.x + q.r > maxX) maxX = q.x + q.r;
      if (q.y - q.r < minY) minY = q.y - q.r;
      if (q.y + q.r > maxY) maxY = q.y + q.r;
    }
    return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
  }

  /* --------------------------------- stepping ------------------------------- */

  /**
   * @param {number} dt
   * @param {object} world { floor, left, right, boxes: [Body], friction }
   */
  step(dt, world) {
    this.impacts.length = 0;
    if (this.asleep && !this.grabRef) return;
    const g = this.gravity * dt * dt;
    const keep = 1 - this.drag * dt;
    const lim = MAX_STEP * dt;
    for (const q of this.p) {
      if (q.im === 0) continue;
      let vx = (q.x - q.px) * keep, vy = (q.y - q.py) * keep;
      const sp = Math.hypot(vx, vy);
      if (sp > lim) { vx *= lim / sp; vy *= lim / sp; }
      q.px = q.x; q.py = q.y;
      q.x += vx;
      q.y += vy - g;
      q.ground = false;
      q.body = null;
      q.wall = 0;
    }
    // joint friction, measured against where each joint was last step
    for (const j of this.joints) {
      const b = this.rawBend(j);
      if (j.prev !== null && this.friction > 0) this.bendBy(j, wrap(j.prev - b), this.friction);
      j.prev = b;
    }

    this.contacts.length = 0;
    const boxes = this.nearBoxes(world);
    for (let it = 0; it < this.iterations; it++) {
      const last = it === this.iterations - 1;
      for (const l of this.links) this.solveLink(l);
      for (const j of this.joints) this.solveJoint(j);
      if (this.grabRef !== null) {
        const P = this.pos(this.grabRef, _p);
        const w = this.invMass(this.grabRef);
        if (w > 0) this.push(this.grabRef, (this.grabAt.x - P.x) * this.grabK / w, (this.grabAt.y - P.y) * this.grabK / w);
      }
      for (let i = 0; i < this.p.length; i++) this.collide(i, world, boxes, last);
    }
    this.afterContacts(dt, world);

    // asleep once nothing has moved for a second and a half
    let fast = 0;
    for (const q of this.p) fast = Math.max(fast, Math.hypot(q.x - q.px, q.y - q.py));
    this.maxSpeed = fast / dt;
    if (fast < 0.0005 && !this.grabRef) {
      if ((this.still += dt) > 1.5) this.asleep = true;
    } else this.still = 0;
  }

  solveLink(l) {
    const P = this.pos(l.a, _p), Q = this.pos(l.b, _q);
    const dx = Q.x - P.x, dy = Q.y - P.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-9) return;
    const w = this.invMass(l.a) + this.invMass(l.b);
    if (w <= 0) return;
    const lam = (d - l.len) / (d * w);
    this.push(l.a, dx * lam, dy * lam);
    this.push(l.b, -dx * lam, -dy * lam);
  }

  solveJoint(j) {
    // locked: it does not bend at all, whatever pulls on it
    if (j.lock != null) { this.bendBy(j, wrap(j.lock - this.rawBend(j)), 1); return; }
    const f = this.facing;
    const rel = this.rawBend(j);
    // the limit
    const off = wrap(rel - f * j.center);
    if (off > j.half) this.bendBy(j, j.half - off, 1);
    else if (off < -j.half) this.bendBy(j, -j.half - off, 1);
    // the muscle
    if (j.target !== null && j.k > 0 && this.tone > 0) {
      this.bendBy(j, wrap(f * j.target - this.rawBend(j)), j.k * this.tone);
    }
    // and the give of everything round the joint, back toward its resting bend
    if (j.rest !== undefined && this.passive > 0) this.bendBy(j, wrap(f * j.rest - this.rawBend(j)), this.passive);
  }

  /** The bend of joint j as it is, world angles (clockwise), not yet flipped for facing. */
  rawBend(j) { return wrap(this.angle(j.c0, j.c1) - this.angle(j.p0, j.p1)); }

  /**
   * Bends joint j by angle a (a fraction k of the way), moving all four ends
   * of the two bones by how much each one's position changes the angle and
   * by how heavy it is - so a bend pushes the body around, but never drags
   * it anywhere as a whole.
   */
  bendBy(j, a, k) {
    if (a === 0) return;
    const P0 = this.pos(j.p0, _a), P1 = this.pos(j.p1, _b), C0 = this.pos(j.c0, _c), C1 = this.pos(j.c1, _d);
    const v1x = P1.x - P0.x, v1y = P1.y - P0.y, v2x = C1.x - C0.x, v2y = C1.y - C0.y;
    const l1 = v1x * v1x + v1y * v1y, l2 = v2x * v2x + v2y * v2y;
    if (l1 < 1e-8 || l2 < 1e-8) return;
    // how each end moves the bend (child angle minus parent angle)
    const g1x = v1y / l1, g1y = -v1x / l1;
    const g2x = v2y / l2, g2y = -v2x / l2;
    const G = j.grads || (j.grads = []);
    G.length = 0;
    const add = (ref, gx, gy) => {
      for (const e of G) if (e.ref === ref) { e.gx += gx; e.gy += gy; return; }
      G.push({ ref, gx, gy });
    };
    add(j.p0, g1x, g1y);
    add(j.p1, -g1x, -g1y);
    add(j.c0, -g2x, -g2y);
    add(j.c1, g2x, g2y);
    let wsum = 0;
    for (const e of G) wsum += this.invMass(e.ref) * (e.gx * e.gx + e.gy * e.gy);
    if (wsum < 1e-9) return;
    const lam = (a * k) / wsum;
    for (const e of G) this.push(e.ref, e.gx * lam, e.gy * lam);
  }

  nearBoxes(world) {
    const out = [];
    if (!world.boxes) return out;
    const bb = this.aabb(0.6);
    for (const b of world.boxes) {
      const a = b.aabb();
      if (a.maxX < bb.minX || a.minX > bb.maxX || a.maxY < bb.minY || a.minY > bb.maxY) continue;
      out.push(b);
    }
    return out;
  }

  collide(i, world, boxes, record) {
    const q = this.p[i];
    const r = q.r;
    if (q.y < world.floor + r) {
      q.y = world.floor + r;
      q.ground = true;
    }
    if (q.x < world.left + r) { q.x = world.left + r; q.wall = -1; }
    else if (q.x > world.right - r) { q.x = world.right - r; q.wall = 1; }
    for (const b of boxes) {
      const c = Math.cos(b.rot), s = Math.sin(b.rot);
      const dx = q.x - b.pos.x, dy = q.y - b.pos.y;
      const lx = c * dx + s * dy, ly = -s * dx + c * dy;
      const hx = b.w / 2 + r, hy = b.h / 2 + r;
      const ox = hx - Math.abs(lx), oy = hy - Math.abs(ly);
      if (ox <= 0 || oy <= 0) continue;
      let nlx, nly, depth;
      if (ox < oy) { nlx = Math.sign(lx) || 1; nly = 0; depth = ox; } else { nlx = 0; nly = Math.sign(ly) || 1; depth = oy; }
      const nx = c * nlx - s * nly, ny = s * nlx + c * nly;
      const bodyIm = b.kinematic || !b.invMass ? 0 : b.invMass;
      // a point pinned against the floor cannot give: the crate on it has to
      let share = q.im + bodyIm > 0 ? q.im / (q.im + bodyIm) : 1;
      if (q.ground && ny < -0.5) share = 0;
      q.x += nx * depth * share;
      q.y += ny * depth * share;
      if (bodyIm > 0 && share < 1) {
        b.pos.x -= nx * depth * (1 - share);
        b.pos.y -= ny * depth * (1 - share);
      }
      if (ny > 0.5) { q.ground = true; q.body = b; }
      if (record) this.contacts.push({ i, b, nx, ny });
    }
  }

  /** Speed into whatever was hit is taken out; a crate takes it as a shove. */
  afterContacts(dt, world) {
    const fr = world.friction ?? 0.5;
    const gdt = this.gravity * dt * dt;
    for (let i = 0; i < this.p.length; i++) {
      const q = this.p[i];
      if (q.wall) {
        const vx = q.x - q.px;
        if (vx * q.wall > 0) {
          if (Math.abs(vx) / dt > 2.5) this.impacts.push({ i, speed: Math.abs(vx) / dt, what: 'wall' });
          q.px = q.x + vx * 0.25;
        }
      }
      if (!q.ground || q.body) continue;
      // the floor: no bounce worth mentioning, and friction along it - as much
      // as the weight on it, and whatever slammed into it, allows
      const vy = q.y - q.py;
      const vx = q.x - q.px;
      const normal = Math.max(0, -vy) + gdt;
      const stop = Math.min(Math.abs(vx), fr * normal);
      q.px = q.x - (vx - Math.sign(vx) * stop);
      if (vy < 0) {
        const speed = -vy / dt;
        if (speed > 2.5) this.impacts.push({ i, speed, what: null });
        q.py = q.y + vy * 0.12;
      }
    }
    for (const ct of this.contacts) {
      const q = this.p[ct.i], b = ct.b;
      const vx = (q.x - q.px) / dt, vy = (q.y - q.py) / dt;
      const bv = b.velAt(q.x, q.y);
      const rx = vx - bv.x, ry = vy - bv.y;
      const vn = rx * ct.nx + ry * ct.ny;
      if (vn >= 0) continue;
      const bodyIm = b.kinematic || !b.invMass ? 0 : b.invMass;
      const arm = (q.x - b.pos.x) * ct.ny - (q.y - b.pos.y) * ct.nx;
      const kn = q.im + bodyIm + (bodyIm ? arm * arm * b.invI : 0);
      if (kn <= 0) continue;
      const J = -vn / kn;
      // friction along the surface, no more than the push allows
      const tx = -ct.ny, ty = ct.nx;
      const vt = rx * tx + ry * ty;
      const Jt = Math.max(-fr * J, Math.min(fr * J, -vt / kn));
      const ix = ct.nx * J + tx * Jt, iy = ct.ny * J + ty * Jt;
      q.px -= ix * q.im * dt;
      q.py -= iy * q.im * dt;
      if (bodyIm > 0) b.applyImpulse(-ix, -iy, q.x, q.y);
      if (-vn > 2.5) this.impacts.push({ i: ct.i, speed: -vn, what: b });
    }
  }
}

const _p = { x: 0, y: 0 }, _q = { x: 0, y: 0 };
const _a = { x: 0, y: 0 }, _b = { x: 0, y: 0 }, _c = { x: 0, y: 0 }, _d = { x: 0, y: 0 };
