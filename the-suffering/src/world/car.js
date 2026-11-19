/* =============================================================================
   A car.

   The painted shell is cut into a fine grid of panels so that it can be
   dented anywhere. A knock pushes the metal in round the point it lands; a
   harder one creases the panel and bends what is round it; a crash at speed
   folds a whole end up and lifts the bonnet. How far the metal goes is the
   energy the impact had: a car that rolls into a post at walking pace has
   a scuffed bumper, at forty it has no front left.

   The windows are glass that can be seen through, at whoever is sitting
   inside. A side window bursts into pieces at the first round or the first
   real blow; a windscreen is laminated, stars where it is hit, crazes, and
   holds until there is nothing left of it. Lamps break.

   Behind all that is the engine, which decides whether it still goes. Hurt,
   it trails thin pale smoke; badly hurt, grey; nearly finished, thick dark
   smoke and it runs rough. When there is nothing left the engine bay is on
   fire, and a few seconds later the tank goes.
   ========================================================================== */
import * as THREE from 'three';
import { Body, Island } from '../physics/world.js';
import { Merger } from '../render/merge.js';
import { clamp, clamp01, lerp, rand } from '../core/util.js';

/** The physics box: it rides high, so a body lying in the road goes under it (and under the wheels). */
export const BODY = { hx: 0.9, hy: 0.6, hz: 2.15, cy: 0.9 };
export const WHEEL_R = 0.33, WHEELBASE = 2.64, TRACK = 1.72;
const SEG = 0.15;

const _lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
const _glow = new THREE.MeshBasicMaterial({ vertexColors: true });
const _glass = new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, shininess: 90, specular: 0x9aa7b4 });
const _c = new THREE.Color();

/** What each kind of car is like to drive. */
export const SPECS = {
  sedan: { mass: 1350, top: 46, accel: 4.6, rev: 8, grip: 9.6, seats: 4, steer: 0.62 },
  taxi: { mass: 1450, top: 44, accel: 4.3, rev: 8, grip: 9.4, seats: 4, steer: 0.62 },
  police: { mass: 1700, top: 52, accel: 5.4, rev: 9, grip: 10.2, seats: 4, steer: 0.6 },
  van: { mass: 2300, top: 36, accel: 3.0, rev: 6, grip: 8.0, seats: 2, steer: 0.56 },
};

/** Where the hips go, in the car's own space (nose toward +Z, +X its left, the ground at y = 0). The driver sits on the left. */
const SEATS = {
  sedan: [[0.38, 0.56, 0.02], [-0.38, 0.56, 0.02], [0.38, 0.56, -0.92], [-0.38, 0.56, -0.92]],
  van: [[0.42, 0.64, 0.8], [-0.42, 0.64, 0.8]],
};
/** Where the steering wheel is. */
const WHEEL_AT = { sedan: [0.38, 0.92, 0.5], van: [0.42, 1.0, 1.2] };

/* ------------------------------- the shape -------------------------------- */

/**
 * The car as convex pieces, each a list of planes (n·p <= d) in its own
 * space, each face tagged with what it is made of. Rays, bullets and blasts
 * test against these, so a round through the windscreen goes through the
 * windscreen, not a box round the car.
 */
function shapeFor(kind) {
  const P = (nx, ny, nz, px, py, pz, tag) => { const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l; return [nx, ny, nz, nx * px + ny * py + nz * pz, tag]; };
  const lower = [P(1, 0, 0, 0.9, 0, 0, 'side'), P(-1, 0, 0, -0.9, 0, 0, 'side'), P(0, 1, 0, 0, 0.77, 0, 'top'), P(0, -1, 0, 0, 0.27, 0, 'under'), P(0, 0, 1, 0, 0, 2.15, 'front'), P(0, 0, -1, 0, 0, -2.15, 'back')];
  if (kind === 'van') {
    const cab = [P(1, 0, 0, 0.87, 0, 0, 'vside'), P(-1, 0, 0, -0.87, 0, 0, 'vside'), P(0, -1, 0, 0, 0.77, 0, 'floor'), P(0, 1, 0, 0, 1.57, 0, 'roof'), P(0, 0, -1, 0, 0, -2.15, 'doors'), P(0, 0.25, 0.76, 0, 0.79, 1.45, 'screen')];
    return [lower, cab];
  }
  const cab = [P(1, 0, 0, 0.81, 0, 0, 'cside'), P(-1, 0, 0, -0.81, 0, 0, 'cside'), P(0, -1, 0, 0, 0.77, 0, 'floor'), P(0, 1, 0, 0, 1.47, 0, 'roof'),
    P(0, 0.45, 0.66, 0, 0.79, 1.0, 'screen'), P(0, 0.29, -0.66, 0, 0.79, -1.42, 'rear')];
  return [lower, cab];
}

/* ------------------------------ the builders ------------------------------ */

/** Boxes cut into a grid of small quads, all in one bendable mesh. */
class Shell {
  constructor() { this.pos = []; this.col = []; }
  box(cx, cy, cz, sx, sy, sz, hex, rx = 0, seg = SEG) {
    _c.setHex(hex);
    const r = _c.r, g = _c.g, b = _c.b;
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const cr = Math.cos(rx), sr = Math.sin(rx);
    // each face: its normal axis, its u and v axes (u x v = n), and how big it is along each
    const faces = [
      [[1, 0, 0], [0, 0, -1], [0, 1, 0], hz, hy], [[-1, 0, 0], [0, 0, 1], [0, 1, 0], hz, hy],
      [[0, 1, 0], [1, 0, 0], [0, 0, -1], hx, hz], [[0, -1, 0], [1, 0, 0], [0, 0, 1], hx, hz],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0], hx, hy], [[0, 0, -1], [-1, 0, 0], [0, 1, 0], hx, hy],
    ];
    const pt = (n, u, v, hn, a, bb, out) => {
      // a point on the face, in the box's own space, then turned about X and moved
      const x = n[0] * hn + u[0] * a + v[0] * bb, y = n[1] * hn + u[1] * a + v[1] * bb, z = n[2] * hn + u[2] * a + v[2] * bb;
      out[0] = cx + x; out[1] = cy + y * cr - z * sr; out[2] = cz + y * sr + z * cr;
    };
    const A = [0, 0, 0], B = [0, 0, 0], C = [0, 0, 0], D = [0, 0, 0];
    for (const [n, u, v, hu, hv] of faces) {
      const hn = Math.abs(n[0]) ? hx : Math.abs(n[1]) ? hy : hz;
      const nu = Math.max(1, Math.ceil((hu * 2) / seg)), nv = Math.max(1, Math.ceil((hv * 2) / seg));
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const a0 = -hu + (2 * hu * i) / nu, a1 = -hu + (2 * hu * (i + 1)) / nu, b0 = -hv + (2 * hv * j) / nv, b1 = -hv + (2 * hv * (j + 1)) / nv;
        pt(n, u, v, hn, a0, b0, A); pt(n, u, v, hn, a1, b0, B); pt(n, u, v, hn, a1, b1, C); pt(n, u, v, hn, a0, b1, D);
        this.pos.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2], A[0], A[1], A[2], C[0], C[1], C[2], D[0], D[1], D[2]);
        for (let k = 0; k < 6; k++) this.col.push(r, g, b);
      }
    }
  }
  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }
}

/** Flat quads: glass, lamps. Each quad is a run of six vertices whose colour (and alpha) can be changed. */
class Panes {
  constructor(alpha) { this.pos = []; this.col = []; this.alpha = alpha; this.items = []; }
  /** A four cornered pane (corners in order round it); returns its index. */
  quad(a, b, c, d, hex, al = 1, cut = 2) {
    _c.setHex(hex);
    const start = this.pos.length / 3;
    // cut into a few pieces so it bends with the body round it
    const L = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
    for (let i = 0; i < cut; i++) for (let j = 0; j < cut; j++) {
      const u0 = i / cut, u1 = (i + 1) / cut, v0 = j / cut, v1 = (j + 1) / cut;
      const p00 = L(L(a, b, u0), L(d, c, u0), v0), p10 = L(L(a, b, u1), L(d, c, u1), v0), p11 = L(L(a, b, u1), L(d, c, u1), v1), p01 = L(L(a, b, u0), L(d, c, u0), v1);
      for (const p of [p00, p10, p11, p00, p11, p01]) {
        this.pos.push(p[0], p[1], p[2]);
        if (this.alpha) this.col.push(_c.r, _c.g, _c.b, al); else this.col.push(_c.r, _c.g, _c.b);
      }
    }
    const n = this.pos.length / 3 - start;
    this.items.push({ start, n, hex, al });
    return this.items.length - 1;
  }
  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, this.alpha ? 4 : 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }
}

/* ---------------------------------- a car --------------------------------- */

let _carId = 1;

export class Car {
  constructor(game, kind = 'sedan', paint = 0xb8312b) {
    this.g = game;
    this.id = _carId++;
    this.kind = kind; this.paint = paint;
    this.spec = SPECS[kind] || SPECS.sedan;
    this.van = kind === 'van';
    this.seatAt = SEATS[this.van ? 'van' : 'sedan'];
    this.seats = this.seatAt.map(() => null);
    this.shape = shapeFor(kind);
    this._build();
    // the physics body: kinematic while anyone (or nothing) is driving it, a free body once it is a wreck
    this.body = new Body({ hx: BODY.hx, hy: BODY.hy + (this.van ? 0.1 : 0), hz: BODY.hz, mass: this.spec.mass, y: BODY.cy, shape: 1, kind: 'car', friction: 0.6, angDamp: 0.4 });
    this.body.setKinematic(true);
    this.body.owner = this;
    this.island = new Island(null); this.island.add(this.body); this.island.mover = true;
    game.world.addIsland(this.island);
    // where it is and how it is moving
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.vx = 0; this.vz = 0; this.vy = 0; this.w = 0; this.speed = 0;
    this.dx = 0; this.dz = 1;
    // what its driver is asking of it
    this.gas = 0; this.brake = 0; this.hand = 0; this.steerIn = 0; this.horn = false;
    this.steer = 0; this.gear = 1; this.spin = 0; this.rpm = 0; this.pull = 0;
    // what has been done to it
    this.hp = 100; this.fire = -1; this.wreck = false; this.boomT = 0; this.dents = 0; this.lastBy = null;
    this.smokeT = 0; this.braking = false; this.reversing = false;
    this.mode = 'parked';          // 'rail' in traffic, 'loose' driven freely, 'parked', 'wreck'
    this.hitCool = 0;
  }

  /* -------------------------------- the model ----------------------------- */

  _build() {
    const g = this.g, kind = this.kind, van = this.van, police = kind === 'police', taxi = kind === 'taxi';
    const paint = this.paint, trim = 0x232528, dark = 0x15171a, door = police ? 0x16306b : paint;
    const S = new Shell(), G = new Panes(true), L = new Panes(false), I = new Merger();
    /* ---- the painted shell ---- */
    if (van) {
      S.box(0, 0.52, 1.8, 1.8, 0.5, 0.7, paint);                 // the nose
      S.box(0.87, 0.52, 0.92, 0.06, 0.5, 1.06, door); S.box(-0.87, 0.52, 0.92, 0.06, 0.5, 1.06, door);
      S.box(0, 1.17, -0.88, 1.8, 1.3, 2.54, paint, 0, 0.18);     // the box at the back
      S.box(0, 1.555, 0.81, 1.76, 0.04, 0.82, paint);            // the cab roof
      for (const sx of [0.85, -0.85]) S.box(sx, 1.17, 1.33, 0.06, 0.76, 0.08, paint, -0.32);   // windscreen pillars
    } else {
      S.box(0, 0.52, 1.6, 1.8, 0.5, 1.1, paint);                 // bonnet and wings, the engine under them
      S.box(0, 0.52, -1.78, 1.8, 0.5, 0.74, paint);              // the boot
      S.box(0.87, 0.52, -0.18, 0.06, 0.5, 2.46, door); S.box(-0.87, 0.52, -0.18, 0.06, 0.5, 2.46, door);   // the doors
      S.box(0, 1.475, -0.285, 1.62, 0.05, 1.7, paint);           // the roof
      for (const sx of [0.79, -0.79]) {
        S.box(sx, 1.12, 0.775, 0.06, 0.8, 0.07, paint, -0.598);    // A pillars, raked back with the windscreen
        S.box(sx, 1.12, -0.22, 0.07, 0.68, 0.09, paint);          // B
        S.box(sx, 1.12, -1.285, 0.06, 0.74, 0.07, paint, 0.4636);  // C
      }
      S.box(0, 0.78, 1.02, 1.7, 0.04, 0.08, paint);              // the scuttle under the windscreen
    }
    S.box(0, 0.36, 2.13, 1.84, 0.22, 0.2, trim); S.box(0, 0.36, -2.13, 1.84, 0.22, 0.2, trim);   // bumpers
    S.box(0, 0.6, 2.16, 0.9, 0.16, 0.04, dark);                  // grille
    S.box(0.97, 0.9, van ? 1.42 : 0.92, 0.14, 0.1, 0.18, paint); S.box(-0.97, 0.9, van ? 1.42 : 0.92, 0.14, 0.1, 0.18, paint);   // mirrors
    S.box(0.9, 0.29, 0, 0.03, 0.05, 2.0, dark); S.box(-0.9, 0.29, 0, 0.03, 0.05, 2.0, dark);     // sills
    if (police) {
      S.box(0, 0.79, 1.6, 1.82, 0.03, 1.0, 0x16306b);
      S.box(0, 1.53, -0.2, 1.2, 0.07, 0.3, 0x1c1e22);
    }
    if (taxi) S.box(0, 1.58, -0.1, 0.5, 0.16, 0.22, 0xf4e9b0);
    const shellGeo = S.build();
    /* ---- glass ---- */
    const GL = 0x9fb3c2, A = 0.3;
    this.windows = [];
    const win = (i, a, b, c, d, laminated) => { this.windows[i] = { pane: G.quad(a, b, c, d, GL, A, laminated ? 3 : 2), laminated, cracks: 0, broken: false }; };
    if (van) {
      win(0, [0.84, 0.79, 1.45], [-0.84, 0.79, 1.45], [-0.84, 1.53, 1.21], [0.84, 1.53, 1.21], true);
      win(2, [0.875, 0.8, 1.38], [0.875, 0.8, 0.45], [0.875, 1.5, 0.45], [0.875, 1.5, 1.18], false);
      win(4, [-0.875, 0.8, 0.45], [-0.875, 0.8, 1.38], [-0.875, 1.5, 1.18], [-0.875, 1.5, 0.45], false);
    } else {
      win(0, [0.78, 0.79, 1.0], [-0.78, 0.79, 1.0], [-0.75, 1.45, 0.55], [0.75, 1.45, 0.55], true);
      win(1, [-0.78, 0.79, -1.42], [0.78, 0.79, -1.42], [0.75, 1.45, -1.13], [-0.75, 1.45, -1.13], true);
      win(2, [0.81, 0.8, 0.97], [0.81, 0.8, -0.17], [0.81, 1.44, -0.17], [0.81, 1.44, 0.56], false);
      win(3, [0.81, 0.8, -0.27], [0.81, 0.8, -1.4], [0.81, 1.44, -1.12], [0.81, 1.44, -0.27], false);
      win(4, [-0.81, 0.8, -0.17], [-0.81, 0.8, 0.97], [-0.81, 1.44, 0.56], [-0.81, 1.44, -0.17], false);
      win(5, [-0.81, 0.8, -1.4], [-0.81, 0.8, -0.27], [-0.81, 1.44, -0.27], [-0.81, 1.44, -1.12], false);
    }
    const glassGeo = G.build();
    /* ---- lamps ---- */
    const zf = 2.181, zb = -2.181;
    this.lamps = {
      head: [L.quad([0.79, 0.55, zf], [0.45, 0.55, zf], [0.45, 0.69, zf], [0.79, 0.69, zf], 0xfff3c8, 1, 1), L.quad([-0.45, 0.55, zf], [-0.79, 0.55, zf], [-0.79, 0.69, zf], [-0.45, 0.69, zf], 0xfff3c8, 1, 1)],
      tail: [L.quad([0.51, 0.58, zb], [0.81, 0.58, zb], [0.81, 0.7, zb], [0.51, 0.7, zb], 0x6e0c0c, 1, 1), L.quad([-0.81, 0.58, zb], [-0.51, 0.58, zb], [-0.51, 0.7, zb], [-0.81, 0.7, zb], 0x6e0c0c, 1, 1)],
      rev: [L.quad([0.38, 0.6, zb], [0.5, 0.6, zb], [0.5, 0.68, zb], [0.38, 0.68, zb], 0x3a3a38, 1, 1), L.quad([-0.5, 0.6, zb], [-0.38, 0.6, zb], [-0.38, 0.68, zb], [-0.5, 0.68, zb], 0x3a3a38, 1, 1)],
      bar: [],
    };
    if (police) {
      const y = 1.575;
      this.lamps.bar.push(L.quad([0.56, y, -0.08], [0.16, y, -0.08], [0.16, y + 0.09, -0.08], [0.56, y + 0.09, -0.08], 0x2b6cff, 1, 1));
      this.lamps.bar.push(L.quad([-0.16, y, -0.08], [-0.56, y, -0.08], [-0.56, y + 0.09, -0.08], [-0.16, y + 0.09, -0.08], 0xd41f1f, 1, 1));
      this.lamps.bar.push(L.quad([0.16, y, -0.32], [0.56, y, -0.32], [0.56, y + 0.09, -0.32], [0.16, y + 0.09, -0.32], 0x2b6cff, 1, 1));
      this.lamps.bar.push(L.quad([-0.56, y, -0.32], [-0.16, y, -0.32], [-0.16, y + 0.09, -0.32], [-0.56, y + 0.09, -0.32], 0xd41f1f, 1, 1));
    }
    this.lampsBroken = {};
    const lampGeo = L.build();
    this._glassP = G; this._lampP = L;
    /* ---- the inside: seats, dashboard, floor ---- */
    const SEAT = 0x2c2f34, DASH = 0x1c1e21, FLOOR = 0x232527;
    if (van) {
      I.box(0, 0.3, 0.9, 1.7, 0.05, 1.1, FLOOR);
      for (const sx of [0.42, -0.42]) { I.box(sx, 0.48, 0.85, 0.52, 0.14, 0.5, SEAT); I.box(sx, 0.86, 0.54, 0.52, 0.66, 0.12, SEAT, -0.16); I.box(sx, 1.26, 0.5, 0.28, 0.16, 0.1, SEAT); }
      I.box(0, 0.88, 1.38, 1.7, 0.2, 0.3, DASH);
      I.box(0, 1.0, 0.36, 1.72, 1.1, 0.04, 0x2a2c2f);           // the bulkhead behind the seats
    } else {
      I.box(0, 0.26, -0.2, 1.72, 0.05, 2.4, FLOOR);
      for (const sx of [0.38, -0.38]) { I.box(sx, 0.4, 0.08, 0.5, 0.12, 0.52, SEAT); I.box(sx, 0.77, -0.24, 0.5, 0.66, 0.12, SEAT, -0.17); I.box(sx, 1.17, -0.3, 0.28, 0.16, 0.1, SEAT); }
      I.box(0, 0.4, -0.88, 1.56, 0.12, 0.5, SEAT); I.box(0, 0.74, -1.2, 1.56, 0.6, 0.12, SEAT, -0.2);
      I.box(0, 0.84, 0.8, 1.68, 0.18, 0.22, DASH);
      I.box(0, 0.52, 0.42, 0.22, 0.3, 0.7, DASH);                // the console between the seats
      I.box(0, 0.98, -1.35, 1.5, 0.03, 0.3, DASH);               // the shelf under the back window
    }
    const intGeo = I.build();
    /* ---- the steering wheel, which turns ---- */
    const W = new Merger();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      W.box(Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0, 0.035, 0.11, 0.035, 0x141517, 0, 0, a);
    }
    W.box(0, 0, 0, 0.3, 0.035, 0.03, 0x141517); W.box(0, -0.08, 0, 0.035, 0.16, 0.03, 0x141517); W.box(0, 0, 0.02, 0.09, 0.09, 0.05, 0x1f2124);
    W.box(0, 0, 0.16, 0.05, 0.05, 0.3, 0x141517);
    const wheelGeo = W.build();

    const grp = new THREE.Group();
    this.shellMesh = new THREE.Mesh(shellGeo, _lambert);
    this.glassMesh = new THREE.Mesh(glassGeo, _glass); this.glassMesh.renderOrder = 6;
    this.lampMesh = new THREE.Mesh(lampGeo, _glow);
    this.innerMesh = new THREE.Mesh(intGeo, _lambert);
    this.wheelMesh = new THREE.Mesh(wheelGeo, _lambert);
    const wa = WHEEL_AT[van ? 'van' : 'sedan'];
    this.wheelPivot = new THREE.Group();
    this.wheelPivot.position.set(wa[0], wa[1], wa[2]);
    this.wheelPivot.rotation.x = -0.42;
    this.wheelPivot.add(this.wheelMesh);
    for (const m of [this.shellMesh, this.innerMesh]) { m.castShadow = !!g.shadows; m.receiveShadow = !!g.shadows; }
    grp.add(this.shellMesh, this.innerMesh, this.wheelPivot, this.lampMesh, this.glassMesh);
    this.group = grp;
    g.scene.add(grp);
    // the metal as it was made, for the dents to be measured against
    this.base = Float32Array.from(shellGeo.attributes.position.array);
    this.glassBase = Float32Array.from(glassGeo.attributes.position.array);
    this.lampBase = Float32Array.from(lampGeo.attributes.position.array);
    // wheels: drawn with everyone else's, from the shared set
    this.wheelIdx = [];
    const set = g.traffic && g.traffic.wheelSet;
    if (set) for (let k = 0; k < 4; k++) this.wheelIdx.push([set.tyres.alloc(), set.hubs.alloc(), g.boxes.alloc()]);
    if (set) for (const [t, h, b] of this.wheelIdx) { set.tyres.colorHex(t, 0x141517); set.hubs.colorHex(h, 0x8d9197); g.boxes.colorHex(b, 0x6f7378); }
    this.wheelPos = [[0.86, WHEEL_R, 1.32], [-0.86, WHEEL_R, 1.32], [0.86, WHEEL_R, -1.32], [-0.86, WHEEL_R, -1.32]];
    this.wheelBend = [0, 0, 0, 0];
  }

  dispose() {
    const g = this.g;
    g.scene.remove(this.group);
    for (const m of [this.shellMesh, this.glassMesh, this.lampMesh, this.innerMesh, this.wheelMesh]) m.geometry.dispose();
    g.world.removeIsland(this.island);
    g.gore.clearBody(this.body);
    const set = g.traffic && g.traffic.wheelSet;
    if (set) for (const [t, h, b] of this.wheelIdx) { set.tyres.release(t); set.hubs.release(h); g.boxes.release(b); }
    this.wheelIdx = [];
  }

  /* ------------------------------ where it is ----------------------------- */

  /** Puts the car (and its body, and the people in it) where it now is. `dt` > 0 lets the body know how fast it got there. */
  place(dt) {
    const grp = this.group;
    grp.position.set(this.x, this.y, this.z);
    grp.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    const q = grp.quaternion;
    if (!this.wreck) {
      // the body's centre is BODY.cy up from the ground, in the car's own space
      const ux = 2 * (q.x * q.y - q.w * q.z), uy = 1 - 2 * (q.x * q.x + q.z * q.z), uz = 2 * (q.y * q.z + q.w * q.x);
      const c = BODY.cy + (this.van ? 0.1 : 0);
      this.body.setPose(this.x + ux * c, this.y + uy * c, this.z + uz * c, q.x, q.y, q.z, q.w, dt);
    }
    this.dx = Math.sin(this.yaw); this.dz = Math.cos(this.yaw);
  }

  /** The car follows its body: once it is a wreck, the physics moves it. */
  follow() {
    const b = this.body, grp = this.group;
    const c = this.wreckCy || BODY.cy + (this.van ? 0.1 : 0);
    // the ground point is the body's centre less its height, along the body's own up
    const qx = b.qx, qy = b.qy, qz = b.qz, qw = b.qw;
    const ux = 2 * (qx * qy - qw * qz), uy = 1 - 2 * (qx * qx + qz * qz), uz = 2 * (qy * qz + qw * qx);
    this.x = b.px - ux * c; this.y = b.py - uy * c; this.z = b.pz - uz * c;
    grp.position.set(this.x, this.y, this.z);
    grp.quaternion.set(qx, qy, qz, qw);
    // its heading, for anything that wants one
    const fx = 2 * (qx * qz + qw * qy), fz = 1 - 2 * (qx * qx + qy * qy);
    this.yaw = Math.atan2(fx, fz);
    this.dx = Math.sin(this.yaw); this.dz = Math.cos(this.yaw);
    this.vx = b.vx; this.vz = b.vz; this.speed = Math.hypot(b.vx, b.vz);
  }

  /** A point in the car's own space, in the world. */
  toWorld(lx, ly, lz, out) {
    const q = this.group.quaternion, p = this.group.position;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const tx = 2 * (qy * lz - qz * ly), ty = 2 * (qz * lx - qx * lz), tz = 2 * (qx * ly - qy * lx);
    out[0] = p.x + lx + qw * tx + (qy * tz - qz * ty);
    out[1] = p.y + ly + qw * ty + (qz * tx - qx * tz);
    out[2] = p.z + lz + qw * tz + (qx * ty - qy * tx);
    return out;
  }
  /** And back. */
  toLocal(wx, wy, wz, out) {
    const q = this.group.quaternion, p = this.group.position;
    const qx = -q.x, qy = -q.y, qz = -q.z, qw = q.w;
    const lx = wx - p.x, ly = wy - p.y, lz = wz - p.z;
    const tx = 2 * (qy * lz - qz * ly), ty = 2 * (qz * lx - qx * lz), tz = 2 * (qx * ly - qy * lx);
    out[0] = lx + qw * tx + (qy * tz - qz * ty);
    out[1] = ly + qw * ty + (qz * tx - qx * tz);
    out[2] = lz + qw * tz + (qx * ty - qy * tx);
    return out;
  }
  dirToLocal(dx, dy, dz, out) {
    const q = this.group.quaternion;
    const qx = -q.x, qy = -q.y, qz = -q.z, qw = q.w;
    const tx = 2 * (qy * dz - qz * dy), ty = 2 * (qz * dx - qx * dz), tz = 2 * (qx * dy - qy * dx);
    out[0] = dx + qw * tx + (qy * tz - qz * ty);
    out[1] = dy + qw * ty + (qz * tx - qx * tz);
    out[2] = dz + qw * tz + (qx * ty - qy * tx);
    return out;
  }
  dirToWorld(dx, dy, dz, out) {
    const q = this.group.quaternion;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const tx = 2 * (qy * dz - qz * dy), ty = 2 * (qz * dx - qx * dz), tz = 2 * (qx * dy - qy * dx);
    out[0] = dx + qw * tx + (qy * tz - qz * ty);
    out[1] = dy + qw * ty + (qz * tx - qx * tz);
    out[2] = dz + qw * tz + (qx * ty - qy * tx);
    return out;
  }

  /* ---------------------------------- rays -------------------------------- */

  /**
   * A ray against the car's real shape. Returns the distance, or -1, and
   * fills `out` with { lp: local point, ln: local normal, tag: what the face
   * is, piece, exit: where it comes out of that piece }.
   */
  ray(ox, oy, oz, dx, dy, dz, maxT, out) {
    const o = this.toLocal(ox, oy, oz, _o), d = this.dirToLocal(dx, dy, dz, _d);
    let best = -1;
    for (let pi = 0; pi < this.shape.length; pi++) {
      const planes = this.shape[pi];
      let t0 = 0, t1 = maxT, enter = -1, leave = -1;
      let ok = true;
      for (let k = 0; k < planes.length; k++) {
        const pl = planes[k];
        const dn = pl[0] * d[0] + pl[1] * d[1] + pl[2] * d[2];
        const dist = pl[3] - (pl[0] * o[0] + pl[1] * o[1] + pl[2] * o[2]);
        if (Math.abs(dn) < 1e-9) { if (dist < 0) { ok = false; break; } continue; }
        const t = dist / dn;
        if (dn < 0) { if (t > t0) { t0 = t; enter = k; } }
        else if (t < t1) { t1 = t; leave = k; }
        if (t0 > t1) { ok = false; break; }
      }
      if (!ok || enter < 0) continue;            // missed, or starts inside this piece
      if (best >= 0 && t0 >= best) continue;
      best = t0;
      const pl = planes[enter];
      out.lp[0] = o[0] + d[0] * t0; out.lp[1] = o[1] + d[1] * t0; out.lp[2] = o[2] + d[2] * t0;
      out.ln[0] = pl[0]; out.ln[1] = pl[1]; out.ln[2] = pl[2];
      out.tag = pl[4]; out.piece = pi; out.exit = t1;
      out.exitTag = leave >= 0 ? planes[leave][4] : '';
      if (leave >= 0) { const q = planes[leave]; out.xn[0] = q[0]; out.xn[1] = q[1]; out.xn[2] = q[2]; }
    }
    if (best >= 0) out.glass = this.glassAt(out.tag, out.lp);
    return best;
  }

  /** How far along a ray that starts inside the car it is until it is out of it again (or 0 if it is not inside). */
  exitT(ox, oy, oz, dx, dy, dz, out) {
    const o = this.toLocal(ox, oy, oz, _o), d = this.dirToLocal(dx, dy, dz, _d);
    let tOut = 0;
    for (let pi = 0; pi < this.shape.length; pi++) {
      const planes = this.shape[pi];
      let inside = true, t1 = Infinity, leave = -1;
      for (let k = 0; k < planes.length; k++) {
        const pl = planes[k];
        const dist = pl[3] - (pl[0] * o[0] + pl[1] * o[1] + pl[2] * o[2]);
        if (dist < -0.02) { inside = false; break; }
        const dn = pl[0] * d[0] + pl[1] * d[1] + pl[2] * d[2];
        if (dn > 1e-9) { const t = dist / dn; if (t < t1) { t1 = t; leave = k; } }
      }
      if (!inside || leave < 0 || t1 <= tOut) continue;
      tOut = t1;
      if (out) {
        const pl = planes[leave];
        out.lp[0] = o[0] + d[0] * t1; out.lp[1] = o[1] + d[1] * t1; out.lp[2] = o[2] + d[2] * t1;
        out.ln[0] = pl[0]; out.ln[1] = pl[1]; out.ln[2] = pl[2]; out.tag = pl[4]; out.piece = pi;
        out.glass = this.glassAt(out.tag, out.lp);
      }
    }
    return tOut;
  }

  /** Which window, if any, a point on a face of the car is on. */
  glassAt(tag, lp) {
    const z = lp[2], y = lp[1];
    if (tag === 'screen') return this.windows[0] && !this.windows[0].broken ? 0 : this.windows[0] ? -2 : -1;
    if (tag === 'rear') return this.windows[1] && !this.windows[1].broken ? 1 : this.windows[1] ? -2 : -1;
    let i = -1;
    if (tag === 'cside') {
      if (y < 0.8 || y > 1.45) return -1;
      if (Math.abs(z + 0.22) < 0.06) return -1;              // the B pillar
      i = (lp[0] > 0 ? 2 : 4) + (z > -0.22 ? 0 : 1);
    } else if (tag === 'vside') {
      if (y < 0.8 || y > 1.5 || z < 0.45) return -1;
      i = lp[0] > 0 ? 2 : 4;
    } else return -1;
    const w = this.windows[i];
    return w ? (w.broken ? -2 : i) : -1;
  }

  /* --------------------------------- glass -------------------------------- */

  /** A window takes a hit: a side window goes; a windscreen stars, then crazes, then goes. */
  hitGlass(i, lp, power = 1) {
    const w = this.windows[i];
    if (!w || w.broken) return false;
    const g = this.g;
    if (w.laminated) {
      w.cracks += power;
      if (w.cracks < 7) { this._tintPane(i, 0xc6d0d6, Math.min(0.62, 0.3 + w.cracks * 0.05)); return false; }
    }
    this.breakGlass(i);
    return true;
  }
  breakGlass(i) {
    const w = this.windows[i];
    if (!w || w.broken) return;
    w.broken = true;
    const g = this.g, it = this._glassP.items[w.pane], pos = this.glassMesh.geometry.attributes.position.array;
    // where it was, for the shards
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < it.n; k++) { const o = (it.start + k) * 3; cx += pos[o]; cy += pos[o + 1]; cz += pos[o + 2]; }
    cx /= it.n; cy /= it.n; cz /= it.n;
    const col = this.glassMesh.geometry.attributes.color.array;
    for (let k = 0; k < it.n; k++) col[(it.start + k) * 4 + 3] = 0;
    this.glassMesh.geometry.attributes.color.needsUpdate = true;
    this.toWorld(cx, cy, cz, _o);
    g.audio?.at('glass', _o[0], _o[1], _o[2], 0.9);
    g.minds?.noise(_o[0], _o[1], _o[2], 80, 'glass', null);
    // the pieces: little bright cubes that rain down and lie there
    if (g.voxels) for (let k = 0; k < 12; k++) g.voxels.chip(_o[0] + rand(-0.3, 0.3), _o[1] + rand(-0.15, 0.15), _o[2] + rand(-0.3, 0.3), rand(-1.5, 1.5) + this.vx, rand(0, 1.5), rand(-1.5, 1.5) + this.vz, SHARD, SHARD_COL, 0);
  }
  _tintPane(i, hex, alpha) {
    const w = this.windows[i], it = this._glassP.items[w.pane], col = this.glassMesh.geometry.attributes.color.array;
    _c.setHex(hex);
    for (let k = 0; k < it.n; k++) { const o = (it.start + k) * 4; col[o] = _c.r; col[o + 1] = _c.g; col[o + 2] = _c.b; col[o + 3] = alpha; }
    this.glassMesh.geometry.attributes.color.needsUpdate = true;
  }

  /* --------------------------------- lamps -------------------------------- */

  _lamp(idx, hex) {
    const it = this._lampP.items[idx], col = this.lampMesh.geometry.attributes.color.array;
    if (this.lampsBroken[idx]) hex = 0x1a1a1a;
    if (it.cur === hex) return;
    it.cur = hex;
    _c.setHex(hex);
    for (let k = 0; k < it.n; k++) { const o = (it.start + k) * 3; col[o] = _c.r; col[o + 1] = _c.g; col[o + 2] = _c.b; }
    this.lampMesh.geometry.attributes.color.needsUpdate = true;
  }
  /** A lamp near a point breaks. */
  breakLampsNear(lx, ly, lz, r) {
    const pos = this.lampBase;
    for (const group of [this.lamps.head, this.lamps.tail, this.lamps.rev, this.lamps.bar]) for (const idx of group) {
      if (this.lampsBroken[idx]) continue;
      const it = this._lampP.items[idx], o = it.start * 3;
      if (Math.hypot(pos[o] - lx, pos[o + 1] - ly, pos[o + 2] - lz) < r) { this.lampsBroken[idx] = true; this._lamp(idx, 0x1a1a1a); }
    }
  }

  /* --------------------------------- dents -------------------------------- */

  /**
   * The metal pushed in round a point on the car (its own space), along a
   * direction (into the car), by `depth` metres at the middle, falling off
   * over `radius`. A wide, shallow push goes with every deep one: that is
   * the panel and the frame behind it bending.
   */
  dent(lx, ly, lz, dx, dy, dz, depth, radius) {
    if (depth < 0.004) return;
    const geo = this.shellMesh.geometry, pos = geo.attributes.position.array, base = this.base;
    const r2 = radius * radius, R = radius * 2.4, R2 = R * R, bend = depth * 0.28;
    const front = dz < -0.6 && lz > 1.1, back = dz > 0.6 && lz < -1.2;
    let moved = 0;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      const ex = x - lx, ey = y - ly, ez = z - lz, d2 = ex * ex + ey * ey + ez * ez;
      if (d2 > R2) continue;
      const near = d2 < r2 ? (1 - d2 / r2) ** 2 : 0;
      const far = (1 - d2 / R2) ** 2;
      let push = depth * near + bend * far;
      // never more than the car has in it: the cabin keeps its shape longer than the ends do
      const bx = base[i], by = base[i + 1], bz = base[i + 2];
      const soFar = Math.hypot(x - bx, y - by, z - bz);
      const cap = Math.abs(bz) > 1.0 ? 0.95 : 0.42;
      if (soFar + push > cap) push = Math.max(0, cap - soFar);
      if (push <= 1e-5) continue;
      // crumpled, not smooth: each point goes a little its own way
      const h = Math.sin(bx * 91.7 + by * 47.3 + bz * 13.1) * 43758.5453, n = (h - Math.floor(h)) - 0.5;
      const h2 = Math.sin(bx * 17.9 + by * 71.1 + bz * 37.7) * 24634.6345, m = (h2 - Math.floor(h2)) - 0.5;
      pos[i] += dx * push + n * push * 0.35;
      pos[i + 1] += dy * push + m * push * 0.3;
      pos[i + 2] += dz * push + (n + m) * push * 0.18;
      // a front or back folding up: the bonnet (or the boot lid) buckles upward in the middle
      if ((front || back) && by > 0.7 && Math.abs(bz) > 1.0) pos[i + 1] += push * 0.45 * (1 - Math.min(1, Math.abs(bx) / 0.9));
      // nothing goes below the ground
      if (pos[i + 1] < 0.02) pos[i + 1] = 0.02;
      moved++;
    }
    if (!moved) return;
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    this.dents++;
    // glass in the way of that goes; a windscreen cracks first
    const gp = this.glassMesh.geometry.attributes.position.array;
    for (let i = 0; i < this.windows.length; i++) {
      const w = this.windows[i];
      if (!w || w.broken) continue;
      const it = this._glassP.items[w.pane];
      let worst = 0;
      for (let k = 0; k < it.n; k++) {
        const o = (it.start + k) * 3, ex = gp[o] - lx, ey = gp[o + 1] - ly, ez = gp[o + 2] - lz, d2 = ex * ex + ey * ey + ez * ez;
        if (d2 > R2) continue;
        const push = depth * (d2 < r2 ? (1 - d2 / r2) ** 2 : 0) + bend * (1 - d2 / R2) ** 2;
        gp[o] += dx * push; gp[o + 1] += dy * push; gp[o + 2] += dz * push;
        if (push > worst) worst = push;
      }
      if (worst > (w.laminated ? 0.03 : 0.022)) this.hitGlass(i, null, w.laminated ? worst * 60 : 9);
    }
    this.glassMesh.geometry.attributes.position.needsUpdate = true;
    // lamps in the way of it
    if (depth > 0.03) this.breakLampsNear(lx, ly, lz, radius * 0.9);
    // a corner hit hard enough bends the wheel there
    for (let k = 0; k < 4; k++) {
      const wp = this.wheelPos[k];
      const d = Math.hypot(wp[0] - lx, wp[1] - ly, wp[2] - lz);
      if (d < radius * 1.4 && depth > 0.12) this.wheelBend[k] = Math.min(0.35, this.wheelBend[k] + depth * 0.5);
    }
    this.pull = clamp((this.wheelBend[0] - this.wheelBend[1]) * 0.6, -0.12, 0.12);
  }

  /* --------------------------------- damage ------------------------------- */

  /** The engine takes `amount` (out of 100). */
  damage(amount, by = null) {
    if (this.wreck || amount <= 0) return;
    if (by) this.lastBy = by;
    const was = this.hp;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0 && was > 0 && this.fire < 0) this.catchFire(by);
  }
  catchFire(by = null) {
    if (this.wreck || this.fire >= 0) return;
    this.fire = 0;
    this.hp = 0;
    this.boomT = rand(4.5, 8);
    if (by) this.lastBy = by;
    const g = this.g;
    this.toWorld(0, 0.8, 1.6, _o);
    g.audio?.at('whump', _o[0], _o[1], _o[2], 0.8);
    g.minds?.witness({ kind: 'carFire', car: this, x: _o[0], y: _o[1], z: _o[2] });
  }
  /** How much of its power the engine still has. */
  get power() { return this.wreck || this.fire >= 0 ? 0 : this.hp > 25 ? 1 : 0.45 + this.hp / 25 * 0.4; }
  get drivable() { return !this.wreck && this.fire < 0; }
  /** The level of smoke: 0 none, 1 light grey, 2 grey, 3 dark grey. */
  get smoke() { return this.wreck ? 3 : this.hp >= 75 ? 0 : this.hp >= 50 ? 1 : this.hp >= 25 ? 2 : 3; }

  /* -------------------------------- drawing ------------------------------- */

  draw(dt) {
    const g = this.g, set = g.traffic && g.traffic.wheelSet;
    // the steering wheel turns three times what the road wheels do
    this.wheelMesh.rotation.z = -this.steer * 2.8;
    // lamps: brake lights, reversing lights, and a light bar that is either flashing or not
    const night = g.daylight && g.daylight.mode !== 'day';
    const live = !this.wreck && this.fire < 0;
    for (const i of this.lamps.head) this._lamp(i, live && (night || this.seats[0]) ? 0xfff6d8 : 0x8c887a);
    for (const i of this.lamps.tail) this._lamp(i, !live ? 0x2a0808 : this.braking ? 0xff2a1a : night || this.seats[0] ? 0xa01410 : 0x6e0c0c);
    for (const i of this.lamps.rev) this._lamp(i, live && this.reversing ? 0xf4f4ee : 0x3a3a38);
    if (this.lamps.bar.length) {
      const on = live && this.siren, f = Math.floor(g.time * 6) % 2;
      this.lamps.bar.forEach((i, k) => this._lamp(i, !on ? (k % 2 ? 0x5a1414 : 0x1b2f66) : (k % 2 === f ? (k % 2 ? 0xff3030 : 0x4a8cff) : 0x101010)));
    }
    // the wheels
    if (set && this.wheelIdx.length) {
      const q = this.group.quaternion;
      for (let k = 0; k < 4; k++) {
        const wp = this.wheelPos[k], [ti, hi, bi] = this.wheelIdx[k];
        const left = wp[0] > 0, front = wp[2] > 0;
        const steer = front ? this.steer : 0;
        const bend = this.wheelBend[k] * (left ? 1 : -1);
        // the wheel's own turn: about Y for steering (and a bent one splayed), about X as it rolls
        _q1.setFromEuler(_e.set(this.spin, steer + bend * 0.6, bend * 0.5, 'YXZ'));
        _q2.copy(q).multiply(_q1);
        this.toWorld(wp[0], wp[1] - this.wheelBend[k] * 0.1, wp[2], _o);
        // tyre: a cylinder lying along X
        _q3.copy(_q2).multiply(_qcyl);
        set.tyres.set(ti, _o[0], _o[1], _o[2], _q3.x, _q3.y, _q3.z, _q3.w, WHEEL_R * 2, 0.24, WHEEL_R * 2);
        // the hub on its outside face, and a bar across it so it can be seen to turn
        const side = left ? 1 : -1;
        _v1.set(side * 0.125, 0, 0).applyQuaternion(_q2);
        set.hubs.set(hi, _o[0] + _v1.x, _o[1] + _v1.y, _o[2] + _v1.z, _q3.x, _q3.y, _q3.z, _q3.w, 0.36, 0.02, 0.36);
        _v1.set(side * 0.136, 0, 0).applyQuaternion(_q2);
        g.boxes.set(bi, _o[0] + _v1.x, _o[1] + _v1.y, _o[2] + _v1.z, _q2.x, _q2.y, _q2.z, _q2.w, 0.012, 0.3, 0.05);
      }
    }
  }
}

const _o = [0, 0, 0], _d = [0, 0, 0];
const SHARD = [0.024, 0.008, 0.024], SHARD_COL = [0.74, 0.82, 0.88];
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _qcyl = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
const _e = new THREE.Euler(), _v1 = new THREE.Vector3();

/** Everybody's wheels: one set of tyres and one of hubs, for every car. */
export class WheelSet {
  constructor(scene, Boxes, capacity = 160) {
    const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
    this.tyres = new Boxes(scene, capacity, new THREE.MeshLambertMaterial({ color: 0xffffff }), { geometry: cyl });
    this.hubs = new Boxes(scene, capacity, new THREE.MeshLambertMaterial({ color: 0xffffff }), { geometry: new THREE.CylinderGeometry(0.5, 0.5, 1, 10), shadows: false });
  }
  commit() { this.tyres.commit(); this.hubs.commit(); }
}

/** A quad lying on a surface of the car (body-local corners for a decal on its physics body). */
export function carDecal(car, lp, ln, w, h, angle = 0, lift = 0.006) {
  // body space is the car's own space less the body's height
  const cy = car.wreckCy || BODY.cy + (car.van ? 0.1 : 0);
  const nx = ln[0], ny = ln[1], nz = ln[2];
  // two directions along the surface
  let ux, uy, uz;
  if (Math.abs(ny) > 0.9) { ux = 1; uy = 0; uz = 0; } else { ux = nz; uy = 0; uz = -nx; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l; }
  let vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const ax = (ux * ca + vx * sa) * w * 0.5, ay = (uy * ca + vy * sa) * w * 0.5, az = (uz * ca + vz * sa) * w * 0.5;
  const bx = (-ux * sa + vx * ca) * h * 0.5, by = (-uy * sa + vy * ca) * h * 0.5, bz = (-uz * sa + vz * ca) * h * 0.5;
  const ox = lp[0] + nx * lift, oy = lp[1] + ny * lift - cy, oz = lp[2] + nz * lift;
  return [ox - ax - bx, oy - ay - by, oz - az - bz, ox + ax - bx, oy + ay - by, oz + az - bz, ox + ax + bx, oy + ay + by, oz + az + bz, ox - ax + bx, oy - ay + by, oz - az + bz];
}
