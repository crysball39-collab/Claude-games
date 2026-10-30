/* =============================================================================
   The arena, and the plaza outside it.

   A ring of sand 24 metres across inside a sandstone wall. Three iron
   portcullis gates - north, east and west - open onto dark tunnels under the
   stands, and that is where the box ragdolls come from. The fourth gate,
   south, is a pair of oak doors: it stays shut while a round is on and opens
   between rounds onto the cobbled plaza, where the Stall is.

   Stands climb away from the wall on every side but the south, and the crowd
   sits in them. They are boxes too.

   People walking about (whose bodies follow their animation) are kept out
   of walls by line segments on the ground plan - the wall's inner face, the
   tunnel walls, the plaza wall, the Stall - pushed out like a circle from a
   line. Ragdolls and dropped gear are kept out by the same walls built as
   static boxes for the physics.
   ========================================================================== */
import {
  BufferGeometry, Float32BufferAttribute, Mesh, MeshLambertMaterial, MeshBasicMaterial, Group, Vector3, Quaternion,
  HemisphereLight, DirectionalLight, Color, Fog, SphereGeometry, ShaderMaterial, BackSide, CircleGeometry,
  PlaneGeometry, InstancedMesh, BoxGeometry, Object3D, DoubleSide, OctahedronGeometry, AdditiveBlending,
} from 'three';
import { Body } from '../physics/world.js';
import { rayBox } from '../physics/collide.js';
import { FloorPaint, drawSplat, drawPool } from './paint.js';
import {
  sandTexture, stoneTexture, cobbleTexture, grassTexture, woodTexture, doorTexture, awningTexture,
  bannerTexture, signTexture, dirtTexture,
} from './textures.js';
import { rng, clamp, wrapAngle } from '../core/util.js';

const D = Math.PI / 180;

export const R = 12;              // radius of the sand, out to the inner face of the wall
export const WALL_T = 1.0;
export const WALL_H = 3.4;
export const GATE_W = 2.8;
export const GATE_H = 3.0;
const TUNNEL_L = 6;
const STANDS_GAP = 56 * D;         // no stands within this angle either side of the south gate
const OUTER = 21.5;                // back of the stands
export const PLAZA_X = 10.5;
export const PLAZA_Z = 27;

/** a: angle from +Z (south) toward +X (east). */
export const GATES = [
  { id: 'south', angle: 0, player: true },
  { id: 'north', angle: Math.PI },
  { id: 'west', angle: -Math.PI / 2 },
  { id: 'east', angle: Math.PI / 2 },
];

/** Who a segment stops. */
export const MASK = { player: 1, others: 2, all: 3 };

/** The Stall: where it is and which way its counter faces (-Z, toward the arena). */
export const STALL = { x: 5.2, z: 21.2, w: 3.6, d: 2.8, counterZ: 19.8 };
/** Where you stand to be served. */
export const STALL_SPOT = new Vector3(STALL.x, 0, STALL.counterZ - 1.0);

const polar = (a, r) => [Math.sin(a) * r, Math.cos(a) * r];

/* -------------------------------------------------------------------------- */
/*                          boxes with world-scale UVs                         */
/* -------------------------------------------------------------------------- */

/** Faces of a box: outward normal, and the two directions its picture runs along (u x v = n). */
const BOX_FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];
const ext = (a, h) => Math.abs(a[0]) * h[0] + Math.abs(a[1]) * h[1] + Math.abs(a[2]) * h[2];

/**
 * Many boxes in one geometry, so a wall of sixty stones is one draw call.
 * Texture coordinates are in metres / tile, so the texture keeps its scale
 * on a box of any size.
 */
class BoxBatch {
  constructor(tile = 2) { this.tile = tile; this.pos = []; this.nor = []; this.uv = []; this.idx = []; this.n = 0; }

  add(size, center, quat = null, tile = this.tile) {
    const h = [size[0] / 2, size[1] / 2, size[2] / 2];
    const q = quat || new Quaternion();
    const c = new Vector3(...center);
    const v = new Vector3(), nn = new Vector3();
    for (const f of BOX_FACES) {
      const hn = ext(f.n, h), hu = ext(f.u, h), hv = ext(f.v, h);
      nn.set(...f.n).applyQuaternion(q);
      const base = this.n;
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        v.set(
          f.n[0] * hn + f.u[0] * su * hu + f.v[0] * sv * hv,
          f.n[1] * hn + f.u[1] * su * hu + f.v[1] * sv * hv,
          f.n[2] * hn + f.u[2] * su * hu + f.v[2] * sv * hv,
        ).applyQuaternion(q).add(c);
        this.pos.push(v.x, v.y, v.z);
        this.nor.push(nn.x, nn.y, nn.z);
        this.uv.push(((su + 1) * hu) / tile, ((sv + 1) * hv) / tile);
        this.n++;
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  mesh(material, { cast = true, receive = true } = {}) {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    const m = new Mesh(g, material);
    m.castShadow = cast;
    m.receiveShadow = receive;
    return m;
  }
}

const yawQ = (a) => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), a);

/* -------------------------------------------------------------------------- */
/*                                   arena                                    */
/* -------------------------------------------------------------------------- */

export class Arena {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.segs = [];
    this.statics = [];
    this.gates = {};
    this.time = 0;
    this.crowdMood = 0;          // > 0 while cheering
    this.lowPower = false;

    this.sky();
    this.lights();
    this.ground();
    this.wall();
    this.gatesBuild();
    this.stands();
    this.plaza();
    this.stall();
    this.markers();

    this.floor = new FloorPaint(this.scene, [-R, -R, R, R], 0.012, 6, 512);
    this.plazaFloor = new FloorPaint(this.scene, [-PLAZA_X, R, PLAZA_X, PLAZA_Z], 0.011, 6, 256);
  }

  /* --------------------------------- sky ---------------------------------- */

  sky() {
    const scene = this.scene;
    const sky = new Color('#e8c9a0');
    scene.background = sky;
    scene.fog = new Fog(sky, 60, 190);
    const mat = new ShaderMaterial({
      side: BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new Color('#3f78b8') }, mid: { value: new Color('#a9c8de') }, low: { value: new Color('#f0d2a6') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.55)) : mix(mid, low, pow(-h, 0.4)); c = mix(c, low, smoothstep(0.18, 0.0, abs(h)) * 0.7); gl_FragColor = vec4(c, 1.0); }',
    });
    const s = new Mesh(new SphereGeometry(400, 24, 16), mat);
    s.renderOrder = -1;
    scene.add(s);
  }

  lights() {
    const scene = this.scene;
    scene.add(new HemisphereLight('#fff1d8', '#8a6a48', 1.25));
    const sun = new DirectionalLight('#ffe2b8', 2.1);
    sun.position.set(-16, 30, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = -17; s.right = 17; s.top = 17; s.bottom = -17; s.near = 1; s.far = 90;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;
  }

  /** Keeps the sun's shadow box on whatever the camera is looking at. */
  followShadow(focus) {
    const s = this.sun;
    s.target.position.set(focus.x, 0, focus.z);
    s.position.set(focus.x - 16, 30, focus.z + 12);
    s.target.updateMatrixWorld();
  }

  /* --------------------------- collision helpers -------------------------- */

  seg(ax, az, bx, bz, mask = MASK.all) {
    const s = { ax, az, bx, bz, mask, on: true };
    s.len2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1e-9;
    this.segs.push(s);
    return s;
  }

  /** A rectangle (centre, half sizes, yaw) as four segments. */
  rectSegs(cx, cz, hx, hz, yaw = 0, mask = MASK.all) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const pt = (x, z) => [cx + x * c + z * s, cz - x * s + z * c];
    const p = [pt(-hx, -hz), pt(hx, -hz), pt(hx, hz), pt(-hx, hz)];
    return p.map((a, i) => { const b = p[(i + 1) % 4]; return this.seg(a[0], a[1], b[0], b[1], mask); });
  }

  /** A static box for the physics. */
  solid(size, center, quat = null) {
    const b = new Body({ half: new Vector3(size[0] / 2, size[1] / 2, size[2] / 2), kind: 'static', friction: 0.8 });
    b.setPose(new Vector3(...center), quat || new Quaternion());
    this.game.world.add(b);
    this.statics.push(b);
    return b;
  }

  /**
   * Keeps a circle of radius r centred on p out of every segment that stops
   * `mask`. Moves p.
   */
  confine(p, r, mask = MASK.all) {
    if (!mask) return p;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const s of this.segs) {
        if (!s.on || !(s.mask & mask)) continue;
        const dx = s.bx - s.ax, dz = s.bz - s.az;
        // quick reject on the bounding box
        if (p.x + r < Math.min(s.ax, s.bx) || p.x - r > Math.max(s.ax, s.bx) ||
            p.z + r < Math.min(s.az, s.bz) || p.z - r > Math.max(s.az, s.bz)) continue;
        const t = clamp(((p.x - s.ax) * dx + (p.z - s.az) * dz) / s.len2, 0, 1);
        const cx = s.ax + dx * t, cz = s.az + dz * t;
        let ox = p.x - cx, oz = p.z - cz;
        const d2 = ox * ox + oz * oz;
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2);
        if (d < 1e-6) { const l = Math.sqrt(s.len2); ox = -dz / l; oz = dx / l; } else { ox /= d; oz /= d; }
        p.x = cx + ox * r;
        p.z = cz + oz * r;
        moved = true;
      }
      if (!moved) break;
    }
    return p;
  }

  groundAt() { return 0; }

  /** Inside the ring of sand? */
  inArena(x, z, margin = 0) { return x * x + z * z < (R - margin) * (R - margin); }

  /** Distance along a ray to the nearest wall (static box), or maxT. */
  rayWalls(o, d, maxT) {
    let best = maxT;
    for (const b of this.statics) {
      if (b === this.groundBody) continue;
      const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, b.x, b.axes, b.half, best);
      if (t >= 0 && t < best) best = t;
    }
    return best;
  }

  /* -------------------------------- ground -------------------------------- */

  ground() {
    const scene = this.scene;
    // the earth everything stands on
    this.groundBody = this.solid([140, 1, 140], [0, -0.5, 0]);
    this.groundBody.slab = true;
    // ground layers sit centimetres apart and are pushed forward in depth as well, so they
    // never shimmer through each other, even on a phone with a 16-bit depth buffer
    const layer = (mesh, y, push) => {
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = y;
      mesh.receiveShadow = true;
      if (push) Object.assign(mesh.material, { polygonOffset: true, polygonOffsetFactor: -push, polygonOffsetUnits: -push * 2 });
      scene.add(mesh);
      return mesh;
    };
    layer(new Mesh(new PlaneGeometry(240, 240), new MeshLambertMaterial({ map: grassTexture() })), -0.05, 0);
    const dirt = dirtTexture();
    dirt.repeat.set(12, 12);
    layer(new Mesh(new CircleGeometry(OUTER + 3, 64), new MeshLambertMaterial({ map: dirt })), -0.02, 1);
    const cob = layer(new Mesh(new PlaneGeometry(PLAZA_X * 2, PLAZA_Z - 6), new MeshLambertMaterial({ map: cobbleTexture() })), -0.004, 2);
    cob.position.z = (PLAZA_Z + 6) / 2;
    // the sand
    layer(new Mesh(new CircleGeometry(R + 0.2, 72), new MeshLambertMaterial({ map: sandTexture() })), 0.002, 3);
  }

  /* --------------------------------- wall --------------------------------- */

  wall() {
    const stone = new MeshLambertMaterial({ map: stoneTexture(5, '#c09a6c', 5) });
    const cap = new MeshLambertMaterial({ map: stoneTexture(8, '#d8bc90', 2) });
    const wall = new BoxBatch(3.4);
    const caps = new BoxBatch(2);
    const half = (GATE_W / 2) / R;
    const gates = GATES.map((g) => g.angle).sort((a, b) => a - b);
    // the arcs between gates
    for (let i = 0; i < gates.length; i++) {
      const a0 = gates[i] + half;
      let a1 = gates[(i + 1) % gates.length] - half;
      if (a1 <= a0) a1 += Math.PI * 2;
      const n = Math.max(2, Math.round(((a1 - a0) * R) / 1.2));
      const step = (a1 - a0) / n;
      let pa = polar(a0, R);
      for (let k = 0; k < n; k++) {
        const a = a0 + step * (k + 0.5);
        const [cx, cz] = polar(a, R + WALL_T / 2);
        const len = 2 * (R + WALL_T) * Math.sin(step / 2) + 0.04;
        const q = yawQ(a);
        wall.add([len, WALL_H, WALL_T], [cx, WALL_H / 2, cz], q);
        caps.add([len + 0.02, 0.22, WALL_T + 0.24], [cx, WALL_H + 0.11, cz], q, 1);
        this.solid([len, WALL_H, WALL_T], [cx, WALL_H / 2, cz], q);
        const pb = polar(a0 + step * (k + 1), R);
        this.seg(pa[0], pa[1], pb[0], pb[1]);
        pa = pb;
      }
    }
    // lintels over the gates
    for (const g of GATES) {
      const [cx, cz] = polar(g.angle, R + WALL_T / 2);
      const q = yawQ(g.angle);
      const lh = WALL_H - GATE_H;
      wall.add([GATE_W + 0.1, lh, WALL_T], [cx, GATE_H + lh / 2, cz], q);
      caps.add([GATE_W + 0.12, 0.22, WALL_T + 0.24], [cx, WALL_H + 0.11, cz], q, 1);
      this.solid([GATE_W + 0.1, lh, WALL_T], [cx, GATE_H + lh / 2, cz], q);
    }
    this.scene.add(wall.mesh(stone));
    this.scene.add(caps.mesh(cap));
    this.stoneMat = stone;

    // banners hanging on the inside face, between the gates
    const red = new MeshLambertMaterial({ map: bannerTexture('#9c1f1a', '#d9a538'), transparent: true, alphaTest: 0.5, side: DoubleSide });
    const blue = new MeshLambertMaterial({ map: bannerTexture('#24406e', '#d9a538'), transparent: true, alphaTest: 0.5, side: DoubleSide });
    const geo = new PlaneGeometry(0.95, 1.9);
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) * (Math.PI / 4);
      const [x, z] = polar(a, R - 0.03);
      const m = new Mesh(geo, i % 2 ? blue : red);
      m.position.set(x, WALL_H - 1.05, z);
      m.rotation.y = a + Math.PI;
      this.scene.add(m);
    }
  }

  /* --------------------------------- gates -------------------------------- */

  gatesBuild() {
    const iron = new MeshLambertMaterial({ color: '#2d2e31' });
    const dark = new MeshLambertMaterial({ color: '#17120e' });
    const tunnelStone = new MeshLambertMaterial({ map: stoneTexture(11, '#7a6248', 4) });
    const doorMat = new MeshLambertMaterial({ map: doorTexture() });
    const hw = GATE_W / 2;

    for (const g of GATES) {
      const q = yawQ(g.angle);
      const gate = { ...g, open: 0, target: 0, group: new Group(), segs: [], blockers: [] };
      this.gates[g.id] = gate;
      // local frame: x along the wall, z outward
      const toWorld = (x, z) => {
        const c = Math.cos(g.angle), s = Math.sin(g.angle);
        return [x * c + z * s, -x * s + z * c];
      };

      if (g.player) {
        // two oak doors hinged at the outer face, swinging out to the plaza
        gate.doors = [];
        for (const side of [-1, 1]) {
          const pivot = new Group();
          const [px, pz] = toWorld(side * hw, R + WALL_T - 0.08);
          pivot.position.set(px, 0, pz);
          pivot.rotation.y = g.angle;
          const leaf = new Mesh(new BoxGeometry(hw, GATE_H - 0.05, 0.12), doorMat);
          leaf.position.set(-side * hw / 2, (GATE_H - 0.05) / 2, 0);
          leaf.castShadow = true;
          leaf.receiveShadow = true;
          pivot.add(leaf);
          this.scene.add(pivot);
          gate.doors.push({ pivot, side });
        }
        // the passage through the wall
        const a = toWorld(-hw, R), b = toWorld(-hw, R + WALL_T), c = toWorld(hw, R), d = toWorld(hw, R + WALL_T);
        this.seg(a[0], a[1], b[0], b[1]);
        this.seg(c[0], c[1], d[0], d[1]);
        const l = toWorld(-hw, R + WALL_T - 0.1), r = toWorld(hw, R + WALL_T - 0.1);
        gate.segs.push(this.seg(l[0], l[1], r[0], r[1]));
        const [bx, bz] = toWorld(0, R + WALL_T - 0.1);
        gate.blockers.push({ size: [GATE_W, GATE_H, 0.2], center: [bx, GATE_H / 2, bz], quat: q, body: null });
      } else {
        // a portcullis just inside the wall, and a tunnel behind it: one mesh of bars
        const bars = new BoxBatch(1);
        const nb = 9;
        for (let i = 0; i < nb; i++) {
          const x = -hw + 0.15 + (i * (GATE_W - 0.3)) / (nb - 1);
          bars.add([0.06, GATE_H, 0.06], [x, GATE_H / 2, 0]);
          bars.add([0.035, 0.12, 0.035], [x, -0.06, 0]);
        }
        for (let j = 0; j < 5; j++) bars.add([GATE_W - 0.1, 0.06, 0.05], [0, 0.35 + j * 0.6, 0.02]);
        const grid = bars.mesh(iron, { receive: false });
        const [gx, gz] = polar(g.angle, R + 0.3);
        grid.position.set(gx, 0, gz);
        grid.rotation.y = g.angle;
        this.scene.add(grid);
        gate.grid = grid;

        // the tunnel: two walls, a roof, a back wall, dark inside
        const tb = new BoxBatch(2.5);
        const len = TUNNEL_L + WALL_T;
        for (const side of [-1, 1]) {
          const [x, z] = toWorld(side * (hw + 0.25), R + len / 2);
          tb.add([0.5, GATE_H + 0.5, len], [x, (GATE_H + 0.5) / 2, z], q);
          this.solid([0.5, GATE_H + 0.5, len], [x, (GATE_H + 0.5) / 2, z], q);
          const a = toWorld(side * hw, R), b = toWorld(side * hw, R + len);
          this.seg(a[0], a[1], b[0], b[1]);
        }
        const [rx, rz] = toWorld(0, R + WALL_T + TUNNEL_L / 2);
        tb.add([GATE_W + 1, 0.4, TUNNEL_L], [rx, GATE_H + 0.2, rz], q);
        const [kx, kz] = toWorld(0, R + len + 0.25);
        tb.add([GATE_W + 1, GATE_H + 0.5, 0.5], [kx, (GATE_H + 0.5) / 2, kz], q);
        this.solid([GATE_W + 1, GATE_H + 0.5, 0.5], [kx, (GATE_H + 0.5) / 2, kz], q);
        const a = toWorld(-hw, R + len), b = toWorld(hw, R + len);
        this.seg(a[0], a[1], b[0], b[1]);
        this.scene.add(tb.mesh(tunnelStone, { cast: false }));
        // darkness further in
        const shade = new Mesh(new PlaneGeometry(GATE_W, GATE_H), dark);
        const [sx, sz] = toWorld(0, R + len - 0.02);
        shade.position.set(sx, GATE_H / 2, sz);
        shade.rotation.y = g.angle + Math.PI;
        this.scene.add(shade);

        // closed, it stops everyone; open, it still stops you from wandering into the tunnel
        const l = toWorld(-hw, R + 0.3), r = toWorld(hw, R + 0.3);
        gate.segs.push(this.seg(l[0], l[1], r[0], r[1]));
        const l2 = toWorld(-hw - 0.05, R + 0.05), r2 = toWorld(hw + 0.05, R + 0.05);
        this.seg(l2[0], l2[1], r2[0], r2[1], MASK.player);
        const [bx, bz] = polar(g.angle, R + 0.3);
        gate.blockers.push({ size: [GATE_W, GATE_H, 0.2], center: [bx, GATE_H / 2, bz], quat: q, body: null });
        // where the box ragdolls wait their turn
        gate.spawn = (k) => {
          const across = ((k % 3) - 1) * 0.75;
          const out = R + WALL_T + 1.4 + Math.floor(k / 3) * 1.1;
          const [x, z] = toWorld(across, Math.min(out, R + len - 0.6));
          return new Vector3(x, 0, z);
        };
        const [mx, mz] = polar(g.angle, R - 1.2);
        gate.mouth = new Vector3(mx, 0, mz);
      }
      this.setGate(g.id, false, true);
    }

    // braziers either side of each gate: the bowls in one mesh, the flames instanced
    const bowls = new BoxBatch(1);
    this.flameSpots = [];
    for (const g of GATES) {
      for (const side of [-1, 1]) {
        const c = Math.cos(g.angle), s = Math.sin(g.angle);
        const x = side * (GATE_W / 2 + 0.55), z = R - 0.25;
        const px = x * c + z * s, pz = -x * s + z * c;
        bowls.add([0.34, 0.2, 0.34], [px, 2.35, pz]);
        bowls.add([0.1, 0.5, 0.1], [px, 2.0, pz + 0.0]);
        this.flameSpots.push(new Vector3(px, 2.6, pz));
      }
    }
    this.scene.add(bowls.mesh(new MeshLambertMaterial({ color: '#3a3330' }), { receive: false }));
    const fire = new MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false });
    this.flames = new InstancedMesh(new OctahedronGeometry(0.17, 0), fire, this.flameSpots.length);
    this.flames.frustumCulled = false;
    this.scene.add(this.flames);
    this._fo = new Object3D();
  }

  /** Opens (true) or shuts a gate; `now` skips the animation. */
  setGate(id, open, now = false) {
    const g = this.gates[id];
    g.target = open ? 1 : 0;
    if (now) g.open = g.target;
    for (const s of g.segs) s.on = !open;
    for (const b of g.blockers) {
      if (open && b.body) { this.game.world.remove(b.body); this.statics.splice(this.statics.indexOf(b.body), 1); b.body = null; }
      if (!open && !b.body) b.body = this.solid(b.size, b.center, b.quat);
    }
    if (!now) this.game.emit('gate', g, open);
    this.poseGate(g);
  }

  gateOpen(id) { return this.gates[id].open > 0.85; }

  poseGate(g) {
    if (g.grid) g.grid.position.y = g.open * (GATE_H - 0.15);
    if (g.doors) {
      for (const d of g.doors) d.pivot.rotation.y = g.angle + d.side * g.open * 100 * D;
    }
  }

  /* -------------------------------- stands -------------------------------- */

  stands() {
    const stone = new MeshLambertMaterial({ map: stoneTexture(14, '#b49067', 3) });
    const batch = new BoxBatch(2.2);
    const span0 = STANDS_GAP, span1 = Math.PI * 2 - STANDS_GAP;
    const tiers = 4;
    this.seats = [];
    const tunnels = GATES.filter((g) => !g.player).map((g) => g.angle);
    for (let t = 0; t < tiers; t++) {
      const r0 = R + WALL_T + t * 2.1;
      const h = WALL_H + 0.35 + t * 1.15;
      const n = Math.round(((span1 - span0) * (r0 + OUTER) / 2) / 1.6);
      const step = (span1 - span0) / n;
      for (let k = 0; k < n; k++) {
        const a = span0 + step * (k + 0.5);
        const rc = (r0 + OUTER) / 2;
        const [cx, cz] = polar(a, rc);
        const len = 2 * OUTER * Math.sin(step / 2) + 0.05;
        // above a tunnel the stand starts at the tunnel's roof
        const overTunnel = tunnels.some((ta) => Math.abs(wrapAngle(a - ta)) < step / 2 + Math.asin(Math.min(1, 2.1 / r0)));
        const y0 = overTunnel ? GATE_H + 0.4 : 0;
        batch.add([len, h - y0, OUTER - r0], [cx, (h + y0) / 2, cz], yawQ(a));
        this.seats.push({ a, r: r0 + 0.75, y: h, step });
      }
    }
    // the back wall, high enough to hide the world behind
    const nb = 70, sb = (span1 - span0) / nb;
    for (let k = 0; k < nb; k++) {
      const a = span0 + sb * (k + 0.5);
      const [cx, cz] = polar(a, OUTER + 0.3);
      batch.add([2 * (OUTER + 0.6) * Math.sin(sb / 2) + 0.05, 9.2, 0.6], [cx, 4.6, cz], yawQ(a));
    }
    // the stands' ends, facing the plaza
    for (const a of [span0, span1]) {
      const [cx, cz] = polar(a, (R + WALL_T + OUTER) / 2 + 0.15);
      batch.add([0.6, 9.2, OUTER - R - WALL_T + 0.6], [cx, 4.6, cz], yawQ(a));
      const p0 = polar(a, R + WALL_T), p1 = polar(a, OUTER + 0.6);
      this.seg(p0[0], p0[1], p1[0], p1[1]);
    }
    this.scene.add(batch.mesh(stone));
    this.crowd();
  }

  crowd() {
    const r = rng(41);
    const spots = [];
    for (const s of this.seats) {
      const n = Math.max(1, Math.floor((s.step * s.r) / 0.62));
      for (let i = 0; i < n; i++) {
        if (r() < 0.32) continue;
        const a = s.a + ((i + 0.5) / n - 0.5) * s.step + (r() - 0.5) * 0.01;
        spots.push({ a, r: s.r + (r() - 0.5) * 0.3, y: s.y, phase: r() * 10, jump: 0.6 + r() * 0.8 });
      }
    }
    this.spectators = spots;
    const n = spots.length;
    const bodies = new InstancedMesh(new BoxGeometry(0.38, 0.5, 0.26), new MeshLambertMaterial(), n);
    const heads = new InstancedMesh(new BoxGeometry(0.21, 0.23, 0.21), new MeshLambertMaterial(), n);
    const arms = new InstancedMesh(new BoxGeometry(0.5, 0.09, 0.09), new MeshLambertMaterial(), n);
    const shirts = ['#9c1f1a', '#24406e', '#d9a538', '#e8e0cc', '#4b5d3a', '#6b4a2a', '#7a2e5a', '#2f6f6a', '#c8642a'];
    const skins = ['#f3cba9', '#e6b28b', '#d29a72', '#b07650', '#8a5636', '#5f3a24'];
    const col = new Color();
    for (let i = 0; i < n; i++) {
      const shirt = shirts[(r() * shirts.length) | 0];
      bodies.setColorAt(i, col.set(shirt));
      arms.setColorAt(i, col.set(shirt));
      heads.setColorAt(i, col.set(skins[(r() * skins.length) | 0]));
    }
    for (const m of [bodies, heads, arms]) { m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; this.scene.add(m); }
    this.crowdMeshes = { bodies, heads, arms };
    this._o = new Object3D();
    this.crowdT = 0;
    this.poseCrowd(0);
  }

  /** The crowd bobs in its seats; when it cheers it jumps and throws its arms up. */
  poseCrowd(dt) {
    this.crowdT += dt;
    const { bodies, heads, arms } = this.crowdMeshes;
    const o = this._o;
    const mood = this.crowdMood;
    const t = this.crowdT;
    for (let i = 0; i < this.spectators.length; i++) {
      const s = this.spectators[i];
      const [x, z] = polar(s.a, s.r);
      const bob = Math.max(0, Math.sin(t * (3 + mood * 6) * s.jump + s.phase)) * (0.03 + mood * 0.22);
      const y = s.y + 0.25 + bob;
      const face = s.a + Math.PI;
      o.position.set(x, y, z);
      o.rotation.set(0, face, 0);
      o.scale.set(1, 1, 1);
      o.updateMatrix();
      bodies.setMatrixAt(i, o.matrix);
      o.position.set(x, y + 0.37, z);
      o.updateMatrix();
      heads.setMatrixAt(i, o.matrix);
      // arms down by the sides, or up over the head
      const up = Math.min(1, mood * 1.3) * (0.5 + 0.5 * Math.sin(t * 9 + s.phase));
      o.position.set(x, y + 0.12 + up * 0.36, z);
      o.scale.set(1, 1 + up * 2.5, 1);
      o.rotation.set(0, face, 0);
      o.updateMatrix();
      arms.setMatrixAt(i, o.matrix);
    }
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    arms.instanceMatrix.needsUpdate = true;
  }

  cheer(amount = 1) { this.crowdMood = Math.min(1.2, this.crowdMood + amount); }

  /* -------------------------------- plaza --------------------------------- */

  plaza() {
    const stone = new MeshLambertMaterial({ map: stoneTexture(23, '#a98c6c', 2) });
    const b = new BoxBatch(1.2);
    const H = 1.1;
    const z0 = Math.sqrt(Math.max(0, (R + WALL_T) ** 2 - PLAZA_X ** 2)) - 0.5;
    // east and west walls, the far wall with a gap for the road to town
    for (const side of [-1, 1]) {
      const x = side * (PLAZA_X + 0.3);
      b.add([0.6, H, PLAZA_Z - z0], [x, H / 2, (PLAZA_Z + z0) / 2]);
      this.solid([0.6, H, PLAZA_Z - z0], [x, H / 2, (PLAZA_Z + z0) / 2]);
      this.seg(side * PLAZA_X, z0, side * PLAZA_X, PLAZA_Z);
      // pillars
      for (let z = z0 + 2; z < PLAZA_Z; z += 4.5) b.add([0.8, H + 0.5, 0.8], [x, (H + 0.5) / 2, z]);
    }
    b.add([PLAZA_X * 2 + 1.2, H, 0.6], [0, H / 2, PLAZA_Z + 0.3]);
    this.solid([PLAZA_X * 2 + 1.2, H, 0.6], [0, H / 2, PLAZA_Z + 0.3]);
    this.seg(-PLAZA_X, PLAZA_Z, PLAZA_X, PLAZA_Z);
    // the arena's outside face where it meets the plaza
    const a0 = Math.asin(PLAZA_X / (R + WALL_T));
    const half = (GATE_W / 2) / (R + WALL_T);
    for (const [from, to] of [[-a0 - 0.05, -half], [half, a0 + 0.05]]) {
      const n = 6;
      for (let k = 0; k < n; k++) {
        const p = polar(from + ((to - from) * k) / n, R + WALL_T);
        const q = polar(from + ((to - from) * (k + 1)) / n, R + WALL_T);
        this.seg(p[0], p[1], q[0], q[1]);
      }
    }
    this.scene.add(b.mesh(stone));

    // a sign over the south gate, outside
    const sign = new Mesh(new BoxGeometry(4.2, 0.9, 0.12), [
      new MeshLambertMaterial({ color: '#4a2e16' }), new MeshLambertMaterial({ color: '#4a2e16' }),
      new MeshLambertMaterial({ color: '#4a2e16' }), new MeshLambertMaterial({ color: '#4a2e16' }),
      new MeshLambertMaterial({ map: signTexture('BARRAGE', { size: 78 }) }), new MeshLambertMaterial({ color: '#4a2e16' }),
    ]);
    sign.position.set(0, WALL_H + 0.75, R + WALL_T + 0.1);
    this.scene.add(sign);
    this.gateSign = sign;

    // trees beyond the walls
    const trunk = new MeshLambertMaterial({ color: '#5a3d22' });
    const leaf = new MeshLambertMaterial({ color: '#4f7a34' });
    const leaf2 = new MeshLambertMaterial({ color: '#5f8c3c' });
    const r = rng(77);
    const trees = new BoxBatch();
    const leaves = new BoxBatch();
    const leaves2 = new BoxBatch();
    for (let i = 0; i < 26; i++) {
      const x = (r() < 0.5 ? -1 : 1) * (PLAZA_X + 3 + r() * 14);
      const z = R + 2 + r() * 26;
      const h = 2.2 + r() * 2;
      trees.add([0.35, h, 0.35], [x, h / 2, z]);
      const s = 1.6 + r() * 1.4;
      (i % 2 ? leaves : leaves2).add([s, s * 0.9, s], [x, h + s * 0.35, z], yawQ(r() * 3));
      (i % 2 ? leaves2 : leaves).add([s * 0.7, s * 0.6, s * 0.7], [x + 0.2, h + s * 0.95, z - 0.1], yawQ(r() * 3));
    }
    this.scene.add(trees.mesh(trunk), leaves.mesh(leaf), leaves2.mesh(leaf2));
  }

  /* -------------------------------- stall --------------------------------- */

  stall() {
    const { x, z, w, d, counterZ } = STALL;
    const wood = new MeshLambertMaterial({ map: woodTexture('#8a5a32', 13, 4) });
    const dark = new MeshLambertMaterial({ map: woodTexture('#5e3c20', 19, 6) });
    const g = new Group();
    const add = (geo, mat, px, py, pz) => { const m = new Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    const back = z + d / 2;
    const light = new BoxBatch(1.2), darkB = new BoxBatch(1.2);
    // counter
    light.add([w, 1.0, 0.7], [x, 0.5, counterZ + 0.35]);
    darkB.add([w + 0.2, 0.08, 0.86], [x, 1.04, counterZ + 0.35]);
    // posts
    for (const sx of [-1, 1]) {
      darkB.add([0.16, 2.7, 0.16], [x + sx * (w / 2 - 0.08), 1.35, counterZ + 0.1]);
      darkB.add([0.16, 3.1, 0.16], [x + sx * (w / 2 - 0.08), 1.55, back - 0.1]);
    }
    // back wall and sides
    darkB.add([w, 3.0, 0.12], [x, 1.5, back]);
    for (const sx of [-1, 1]) light.add([0.1, 1.6, d - 0.8], [x + sx * (w / 2 - 0.05), 0.8, (counterZ + back) / 2 + 0.3]);
    g.add(light.mesh(wood), darkB.mesh(dark));
    // the awning: sloping from the back wall out past the counter
    const awn = new Mesh(new BoxGeometry(w + 0.5, 0.05, d + 0.9), new MeshLambertMaterial({ map: awningTexture() }));
    awn.position.set(x, 2.95, (counterZ + back) / 2 - 0.3);
    awn.rotation.x = -0.16;
    awn.castShadow = true;
    g.add(awn);
    // solid, so the camera stays out from under it (and a flying body bounces off it)
    this.solid([w + 0.5, 0.3, d + 0.9], [x, 2.95, (counterZ + back) / 2 - 0.3], awn.quaternion.clone());
    // a valance hanging off the front
    const val = new Mesh(new BoxGeometry(w + 0.5, 0.32, 0.03), new MeshLambertMaterial({ map: awningTexture() }));
    val.position.set(x, 2.55, counterZ - 0.75);
    g.add(val);
    // the sign
    const sign = new Mesh(new BoxGeometry(2.4, 0.55, 0.08), new MeshLambertMaterial({ map: signTexture('THE STALL', { size: 60 }) }));
    sign.position.set(x, 3.35, counterZ - 0.45);
    sign.rotation.x = -0.12;
    g.add(sign);
    this.stallSign = sign;
    // crates and a barrel by it
    const crate = new MeshLambertMaterial({ map: woodTexture('#9a6a3a', 33, 3) });
    add(new BoxGeometry(0.7, 0.7, 0.7), crate, x + w / 2 + 0.6, 0.35, counterZ + 0.6);
    add(new BoxGeometry(0.55, 0.55, 0.55), crate, x + w / 2 + 0.55, 0.98, counterZ + 0.62).rotation.y = 0.4;
    add(new BoxGeometry(0.6, 0.9, 0.6), dark, x - w / 2 - 0.55, 0.45, counterZ + 0.9);
    this.scene.add(g);
    this.stallGroup = g;

    // what is for sale, hanging on the back wall
    this.display = new Group();
    this.display.position.set(x, 0, back - 0.1);
    this.scene.add(this.display);

    // nobody walks through it
    this.rectSegs(x, (counterZ + back) / 2, w / 2 + 0.05, (back - counterZ) / 2 + 0.05);
    this.rectSegs(x + w / 2 + 0.6, counterZ + 0.6, 0.4, 0.4);
    this.rectSegs(x - w / 2 - 0.55, counterZ + 0.9, 0.35, 0.35);
    this.solid([w, 1.05, 0.7], [x, 0.52, counterZ + 0.35]);
    this.solid([w, 3.0, 0.12], [x, 1.5, back]);
    this.solid([0.7, 0.7, 0.7], [x + w / 2 + 0.6, 0.35, counterZ + 0.6]);
    this.keeperSpot = new Vector3(x, 0, (counterZ + back) / 2 + 0.25);
  }

  /** Hangs a model of each thing for sale on the back wall of the Stall. */
  dressStall(models) {
    const spots = [[-1.1, 1.75, 0.5], [0, 1.75, 0.5], [1.15, 1.5, 0]];
    models.forEach((m, i) => {
      const s = spots[i];
      m.position.set(s[0], s[1], -0.06);
      m.rotation.set(0, Math.PI, s[2]);
      this.display.add(m);
    });
  }

  /* -------------------------------- markers ------------------------------- */

  markers() {
    const mat = new MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.92, depthWrite: false });
    const make = () => {
      const m = new Mesh(new OctahedronGeometry(0.24, 0), mat);
      m.scale.set(1, 1.5, 1);
      m.visible = false;
      this.scene.add(m);
      return m;
    };
    this.stallMarker = make();
    this.stallMarker.position.set(STALL.x, 4.1, STALL.counterZ - 0.4);
    this.gateMarker = make();
    this.gateMarker.position.set(0, GATE_H + 0.6, R + 0.2);
  }

  showMarkers(stall, gate) {
    this.stallMarker.visible = stall;
    this.gateMarker.visible = gate;
  }

  /* -------------------------------- blood --------------------------------- */

  paintSplat(x, y, z, radius, dir) {
    if (this.floor.inside(x, z) && x * x + z * z < R * R) this.floor.splat(x, z, radius, dir);
    else if (this.plazaFloor.inside(x, z)) this.plazaFloor.splat(x, z, radius, dir);
  }

  paintPool(x, y, z, radius, alpha) {
    if (this.floor.inside(x, z) && x * x + z * z < R * R) this.floor.pool(x, z, radius, alpha);
    else if (this.plazaFloor.inside(x, z)) this.plazaFloor.pool(x, z, radius, alpha);
  }

  paintPit(x, z, radius) {
    if (this.floor.inside(x, z)) this.floor.pit(x, z, radius);
    else if (this.plazaFloor.inside(x, z)) this.plazaFloor.pit(x, z, radius);
  }

  clearBlood() {
    this.floor.clear();
    this.plazaFloor.clear();
  }

  /* -------------------------------- update -------------------------------- */

  update(dt) {
    this.time += dt;
    for (const g of Object.values(this.gates)) {
      if (g.open === g.target) continue;
      const speed = g.player ? 0.9 : 0.75;
      g.open = g.target > g.open ? Math.min(g.target, g.open + dt * speed) : Math.max(g.target, g.open - dt * speed * 1.4);
      this.poseGate(g);
    }
    this.crowdMood = Math.max(0, this.crowdMood - dt * 0.35);
    this.crowdAcc = (this.crowdAcc || 0) + dt;
    // the crowd is far away: it moves at half rate, or less on a slow phone
    const every = this.lowPower ? 1 / 15 : 1 / 30;
    if (this.crowdAcc >= every) { this.poseCrowd(this.crowdAcc); this.crowdAcc = 0; }
    const fo = this._fo;
    for (let i = 0; i < this.flameSpots.length; i++) {
      const k = 0.85 + 0.25 * Math.sin(this.time * 13 + i * 1.7) + 0.1 * Math.sin(this.time * 31 + i);
      fo.position.copy(this.flameSpots[i]);
      fo.scale.set(k, 1.3 * k, k);
      fo.rotation.set(0, this.time * 2 + i, 0);
      fo.updateMatrix();
      this.flames.setMatrixAt(i, fo.matrix);
    }
    this.flames.instanceMatrix.needsUpdate = true;
    for (const m of [this.stallMarker, this.gateMarker]) {
      if (!m.visible) continue;
      m.rotation.y = this.time * 2.2;
      m.position.y = (m === this.stallMarker ? 4.1 : GATE_H + 0.6) + Math.sin(this.time * 3) * 0.12;
    }
  }
}
