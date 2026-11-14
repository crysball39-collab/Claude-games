/* =============================================================================
   The city: three blocks by three, four streets each way.

   Everything is on a grid, so "is this point on a road" is arithmetic, and
   the two graphs the inhabitants need - pavements for people, lanes for cars -
   fall straight out of the layout. The middle block is a park, which is where
   you start. One corner block is a car park with a few crates in it.
   ========================================================================== */
import * as THREE from 'three';
import { mulberry } from '../core/util.js';
import { Merger, tiledBox } from '../render/merge.js';
import {
  asphaltTexture, pavementTexture, grassTexture, facadeTexture, skyTexture, signTexture, FACADE_COUNT,
} from '../render/textures.js';
import {
  buildCar, addLamp, addTree, addBench, addBin, addHydrant, propMaterial, glowMaterial, CAR, CAR_PAINT,
} from './models.js';

export const ROADS = [-54, -18, 18, 54];
export const ROAD_W = 9;
export const SIDEWALK = 2.8;
export const KERB = 0.14;
export const LANE = 2.15;
export const EDGE = 54 + ROAD_W / 2;       // outer edge of the outer streets
export const LIMIT = EDGE + SIDEWALK;      // where the surrounding buildings start

/** Height of the ground: zero on a street, a kerb's worth everywhere else. */
export function groundHeight(x, z) {
  const ax = x < 0 ? -x : x, az = z < 0 ? -z : z;
  if (ax > EDGE || az > EDGE) return KERB;
  const dx = ax - 18, dX = ax - 54;
  if ((dx < 4.5 && dx > -4.5) || (dX < 4.5 && dX > -4.5)) return 0;
  const dz = az - 18, dZ = az - 54;
  if ((dz < 4.5 && dz > -4.5) || (dZ < 4.5 && dZ > -4.5)) return 0;
  return KERB;
}
export const onRoad = (x, z) => groundHeight(x, z) === 0;

export class City {
  constructor(scene, world, { shadows = true } = {}) {
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.rng = mulberry(1337);
    this.buildings = [];
    this.parked = [];
    this.crateSpots = [];
    this.spawn = { x: 0, z: -7.2, yaw: 0 };
    this.shadows = shadows;

    world.ground = groundHeight;
    world.kerb = KERB;

    this.props = new Merger();
    this.glow = new Merger();
    this.marks = new Merger();

    this._ground();
    this._blocks();
    this._surround();
    this._streetFurniture();
    this._markings();
    this._finishMeshes();
    this._navigation();
  }

  /* ------------------------------- helpers -------------------------------- */

  _solid(x0, y0, z0, x1, y1, z1, kind, opaque = false) {
    const s = this.world.addStatic(x0, y0, z0, x1, y1, z1, kind);
    s.opaque = opaque; s.kind = kind;
    return s;
  }
  _mesh(geo, mat, x, y, z, cast = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast && this.shadows; m.receiveShadow = this.shadows;
    m.matrixAutoUpdate = false; m.updateMatrix();
    this.group.add(m);
    return m;
  }

  /* -------------------------------- ground -------------------------------- */

  _ground() {
    const asphalt = asphaltTexture(); asphalt.repeat.set(60, 60);
    const g = new THREE.PlaneGeometry(360, 360).rotateX(-Math.PI / 2);
    this._mesh(g, new THREE.MeshLambertMaterial({ map: asphalt }), 0, 0, 0, false);
    this.pavement = new THREE.MeshLambertMaterial({ map: pavementTexture() });
    const grass = grassTexture(); grass.repeat.set(7, 7);
    this.grass = new THREE.MeshLambertMaterial({ map: grass });
    this.facades = [];
    for (let i = 0; i < FACADE_COUNT; i++) this.facades.push(new THREE.MeshLambertMaterial({ map: facadeTexture(i) }));
    this.roofs = [0x3a3c40, 0x4a4640, 0x2f3236, 0x55504a].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    const sky = new THREE.Mesh(new THREE.SphereGeometry(320, 16, 12), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -10;
    this.sky = sky;
    this.scene.add(sky);
  }

  _slab(x0, z0, x1, z1) {
    const w = x1 - x0, d = z1 - z0;
    this._mesh(tiledBox(w, KERB, d, 3.2), this.pavement, (x0 + x1) / 2, KERB / 2, (z0 + z1) / 2, false);
  }

  /* -------------------------------- blocks -------------------------------- */

  _blocks() {
    const r = this.rng;
    this.blocks = [];
    const patterns = ['quad', 'single', 'splitX', 'plaza', 'splitZ', 'quad', 'splitX'];
    let pi = 0;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const x0 = ROADS[i] + ROAD_W / 2, x1 = ROADS[i + 1] - ROAD_W / 2;
      const z0 = ROADS[j] + ROAD_W / 2, z1 = ROADS[j + 1] - ROAD_W / 2;
      const kind = i === 1 && j === 1 ? 'park' : i === 2 && j === 0 ? 'lot' : i === 1 && j === 2 ? 'police' : 'buildings';
      const b = { i, j, x0, x1, z0, z1, kind };
      this.blocks.push(b);
      this._slab(x0, z0, x1, z1);
      const ix0 = x0 + SIDEWALK, ix1 = x1 - SIDEWALK, iz0 = z0 + SIDEWALK, iz1 = z1 - SIDEWALK;
      if (kind === 'park') this._park(ix0, iz0, ix1, iz1);
      else if (kind === 'lot') this._lot(ix0, iz0, ix1, iz1);
      else if (kind === 'police') this._police(ix0, iz0, ix1, iz1);
      else this._buildingBlock(ix0, iz0, ix1, iz1, patterns[pi++ % patterns.length], r);
    }
  }

  _building(x0, z0, x1, z1, h, style) {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const fac = this.facades[style % this.facades.length], roof = this.roofs[style % this.roofs.length];
    this._mesh(tiledBox(w, h, d, 12.8), [fac, fac, roof, roof, fac, fac], cx, KERB + h / 2, cz);
    this._solid(x0, 0, z0, x1, KERB + h, z1, 'building', true);
    this.buildings.push({ x0, z0, x1, z1, h });
    const r = this.rng, top = KERB + h;
    // things on the roof
    const n = 1 + ((r() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const bw = 1.2 + r() * 2.2, bd = 1.2 + r() * 2.2, bh = 0.8 + r() * 1.6;
      this.props.box(x0 + 1.5 + r() * Math.max(0.1, w - 3), top + bh / 2, z0 + 1.5 + r() * Math.max(0.1, d - 3), bw, bh, bd, r() < 0.5 ? 0x6d7175 : 0x565a5e);
    }
    this.props.box(cx, top + 0.25, cz, w + 0.3, 0.5, d + 0.3, 0x2d2f33);   // parapet, reads as an edge
    // a door and an awning on whichever wall is nearest a street
    const awn = [0x7d2a2a, 0x2a4f7d, 0x2f6b4a, 0x8a6a1f, 0x4b4f55][(r() * 5) | 0];
    const sides = [
      { d: Math.abs(z0 - nearestRoad(z0)), x: cx, z: z0, nx: 0, nz: -1 },
      { d: Math.abs(z1 - nearestRoad(z1)), x: cx, z: z1, nx: 0, nz: 1 },
      { d: Math.abs(x0 - nearestRoad(x0)), x: x0, z: cz, nx: -1, nz: 0 },
      { d: Math.abs(x1 - nearestRoad(x1)), x: x1, z: cz, nx: 1, nz: 0 },
    ].sort((a, b) => a.d - b.d);
    for (let k = 0; k < 2; k++) {
      const s = sides[k];
      if (s.d > 9) continue;
      const along = s.nx ? d : w, off = (r() - 0.5) * Math.max(0, along - 6);
      const px = s.x + (s.nx ? 0 : off), pz = s.z + (s.nz ? 0 : off);
      const yaw = s.nx ? Math.PI / 2 : 0;
      this.props.box(px + s.nx * 0.04, KERB + 1.15, pz + s.nz * 0.04, 1.5, 2.3, 0.1, 0x1c1410, 0, yaw, 0);
      this.props.box(px + s.nx * 0.07, KERB + 1.2, pz + s.nz * 0.07, 1.2, 2.0, 0.1, 0x33291f, 0, yaw, 0);
      this.props.box(px + s.nx * 0.5, KERB + 2.75, pz + s.nz * 0.5, 3.0, 0.12, 1.0, awn, 0, yaw, 0);
    }
  }

  _buildingBlock(x0, z0, x1, z1, pattern, r) {
    const h = () => (r() < 0.25 ? 30 + r() * 16 : 9 + r() * 17);
    const st = () => (r() * FACADE_COUNT) | 0;
    const mx = (x0 + x1) / 2 + (r() - 0.5) * 4, mz = (z0 + z1) / 2 + (r() - 0.5) * 4, a = 1.4;
    if (pattern === 'single') this._building(x0, z0, x1, z1, h() + 6, st());
    else if (pattern === 'splitX') { this._building(x0, z0, mx - a, z1, h(), st()); this._building(mx + a, z0, x1, z1, h(), st()); }
    else if (pattern === 'splitZ') { this._building(x0, z0, x1, mz - a, h(), st()); this._building(x0, mz + a, x1, z1, h(), st()); }
    else if (pattern === 'quad') {
      this._building(x0, z0, mx - a, mz - a, h(), st()); this._building(mx + a, z0, x1, mz - a, h(), st());
      this._building(x0, mz + a, mx - a, z1, h(), st()); this._building(mx + a, mz + a, x1, z1, h(), st());
    } else {
      // a building and an open corner with a tree in it
      const cut = x0 + (x1 - x0) * 0.62;
      this._building(x0, z0, cut, z1, h(), st());
      this._building(cut + 2.6, z0 + 9, x1, z1, 7 + r() * 5, st());
      addTree(this.props, cut + 6, KERB, z0 + 4.2, 3);
      this._solid(cut + 5.8, 0, z0 + 4, cut + 6.2, 3, z0 + 4.4, 'tree');
      addBench(this.props, cut + 3.4, KERB, z0 + 7.6, Math.PI);
      this._solid(cut + 2.55, 0, z0 + 7.3, cut + 4.25, 0.95, z0 + 7.85, 'bench');
      addBin(this.props, cut + 8.4, KERB, z0 + 7.4);
      this._solid(cut + 8.15, 0, z0 + 7.15, cut + 8.65, 1.05, z0 + 7.65, 'bin');
    }
  }

  _park(x0, z0, x1, z1) {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2);
    this._mesh(g, this.grass, (x0 + x1) / 2, KERB + 0.012, (z0 + z1) / 2, false);
    const gravel = 0xa39a86;
    this.marks.flat(0, KERB + 0.02, 0, 2.2, z1 - z0, gravel);
    this.marks.flat(0, KERB + 0.021, 0, x1 - x0, 2.2, gravel);
    this.marks.flat(0, KERB + 0.024, 0, 7.4, 7.4, 0x8f8a7c);
    // the monument
    this.props.box(0, KERB + 0.3, 0, 1.9, 0.6, 1.9, 0x77766f);
    this.props.box(0, KERB + 0.75, 0, 1.3, 0.3, 1.3, 0x8a8880);
    this.props.box(0, KERB + 2.3, 0, 0.8, 2.8, 0.8, 0x9c9a92);
    this.props.box(0, KERB + 3.85, 0, 1.0, 0.3, 1.0, 0x8a8880);
    this._solid(-0.95, 0, -0.95, 0.95, KERB + 0.6, 0.95, 'plinth');
    this._solid(-0.45, 0, -0.45, 0.45, KERB + 4, 0.45, 'plinth', true);
    const trees = [[-7, -7], [7, -7], [-7, 7], [7, 7], [-3.6, 8.4], [8.4, 3.6], [3.6, -8.6], [-8.4, -3.4]];
    trees.forEach(([tx, tz], k) => {
      addTree(this.props, tx, KERB, tz, 10 + k);
      this._solid(tx - 0.2, 0, tz - 0.2, tx + 0.2, 3.2, tz + 0.2, 'tree');
    });
    for (const [bx, bz, yaw] of [[-2.6, 4.2, Math.PI], [2.6, 4.2, Math.PI], [-2.6, -4.2, 0], [2.6, -4.2, 0]]) {
      addBench(this.props, bx, KERB, bz, yaw);
      this._solid(bx - 0.85, 0, bz - 0.28, bx + 0.85, KERB + 0.82, bz + 0.28, 'bench');
    }
    addBin(this.props, 4.3, KERB, 4.3); this._solid(4.05, 0, 4.05, 4.55, 1.05, 4.55, 'bin');
    addBin(this.props, -4.3, KERB, -4.3); this._solid(-4.55, 0, -4.55, -4.05, 1.05, -4.05, 'bin');
  }

  _lot(x0, z0, x1, z1) {
    this.marks.flat((x0 + x1) / 2, KERB + 0.02, (z0 + z1) / 2, x1 - x0, z1 - z0, 0x34363a);
    const r = this.rng;
    // a row of bays along the far side, a few of them taken
    for (let k = 0; k <= 6; k++) this.marks.flat(x0 + 1.5 + k * 3, KERB + 0.03, z1 - 3.1, 0.12, 5.2, 0xd8d8d2);
    const kinds = ['sedan', 'van', 'sedan', 'taxi', 'sedan'];
    [0, 1, 3, 4, 5].forEach((bay, k) => {
      if (k === 2 && r() < 0.5) return;
      const x = x0 + 3 + bay * 3, z = z1 - 3.1, yaw = r() < 0.5 ? 0 : Math.PI;
      const car = buildCar(CAR_PAINT[(r() * CAR_PAINT.length) | 0], kinds[k]);
      car.position.set(x, KERB, z); car.rotation.y = yaw;
      car.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); if (o.isMesh) { o.castShadow = this.shadows; } });
      this.group.add(car);
      this._solid(x - CAR.halfW, 0, z - CAR.halfL, x + CAR.halfW, KERB + 1.38, z + CAR.halfL, 'car', true);
      this.parked.push({ x, z, yaw });
    });
    // a low wall with a gap in it
    this.props.box(x0 + 5.5, KERB + 0.45, z0 + 0.3, 11, 0.9, 0.4, 0x7b7c78);
    this._solid(x0, 0, z0 + 0.1, x0 + 11, KERB + 0.9, z0 + 0.5, 'wall');
    this.props.box(x1 - 3.5, KERB + 0.45, z0 + 0.3, 7, 0.9, 0.4, 0x7b7c78);
    this._solid(x1 - 7, 0, z0 + 0.1, x1, KERB + 0.9, z0 + 0.5, 'wall');
    // somewhere for the first crates
    this.crateSpots.push([x0 + 4, z0 + 5], [x0 + 5.0, z0 + 5.1], [x0 + 4.5, z0 + 5, 1], [x0 + 9, z0 + 8.5]);
  }

  /**
   * The police station, across the road from the far side of the park. A
   * forecourt with patrol cars, a single storey lobby you can walk into - a
   * front desk, a cell, a bench - and the rest of the building behind it.
   * Its front faces -Z.
   */
  _police(x0, z0, x1, z1) {
    const P = this.props, cx = (x0 + x1) / 2;
    const BLUE = 0x16306b, WALL = 0xa9b0b8, TRIM = 0x2a2e34, FLOOR = 0x7d848c;
    const bx0 = x0 + 1, bx1 = x1 - 1, zf = z0 + 5.4, zb = zf + 6.2, top = KERB + 3.3, T = 0.3;
    // the offices behind: an ordinary building, with the lobby against its front wall
    this._building(bx0, zb, bx1, z1, 8.5, 1);
    // forecourt and lobby floor
    this.marks.flat(cx, KERB + 0.02, (z0 + zf) / 2, x1 - x0, zf - z0, 0x3a3d42);
    this.marks.flat(cx, KERB + 0.025, (zf + zb) / 2, bx1 - bx0, zb - zf, FLOOR);
    for (let k = 0; k < 4; k++) this.marks.flat(x0 + 1.4 + k * 3, KERB + 0.03, z0 + 2.6, 0.12, 4.8, 0xd8d8d2);
    // walls: a piece of masonry is drawn and is solid
    const wall = (ax0, ay0, az0, ax1, ay1, az1, hex = WALL, opaque = true) => {
      P.box((ax0 + ax1) / 2, KERB + (ay0 + ay1) / 2, (az0 + az1) / 2, ax1 - ax0, ay1 - ay0, az1 - az0, hex);
      this._solid(ax0, KERB + ay0, az0, ax1, KERB + ay1, az1, 'building', opaque);
    };
    const door = 1.7;                                    // half the width of the way in
    wall(bx0, 0, zf, bx0 + T, 3.3, zb);                  // the side walls
    wall(bx1 - T, 0, zf, bx1, 3.3, zb);
    for (const s of [-1, 1]) {
      // each side of the door: a sill, a window you can see through, a header, and a pier at either end
      const a = s < 0 ? bx0 + T : cx + door, b = s < 0 ? cx - door : bx1 - T;
      wall(a, 0, zf, b, 1.0, zf + T);
      wall(a, 2.45, zf, b, 3.3, zf + T);
      wall(s < 0 ? b - 0.7 : a, 1.0, zf, s < 0 ? b : a + 0.7, 2.45, zf + T);
      wall(s < 0 ? a : b - 0.9, 1.0, zf, s < 0 ? a + 0.9 : b, 2.45, zf + T);
      // window frame, and a lamp beside the door
      P.box((a + b) / 2, KERB + 1.0, zf - 0.02, b - a - 1.6, 0.07, 0.1, TRIM);
      P.box((a + b) / 2, KERB + 2.45, zf - 0.02, b - a - 1.6, 0.07, 0.1, TRIM);
      this.glow.box(cx + s * (door + 0.35), KERB + 2.2, zf - 0.12, 0.2, 0.3, 0.16, 0x4f86ff);
    }
    wall(cx - door, 2.45, zf, cx + door, 3.3, zf + T);   // over the door
    // roof, with a blue band round the edge
    P.box(cx, top + 0.15, (zf + zb) / 2 - 0.15, bx1 - bx0 + 0.4, 0.3, zb - zf + 0.3, 0x3a3e45);
    this._solid(bx0 - 0.2, top, zf - 0.3, bx1 + 0.2, top + 0.3, zb, 'building', true);
    P.box(cx, top - 0.14, zf - 0.04, bx1 - bx0 + 0.1, 0.28, 0.1, BLUE);
    // a ceiling that is lit from below, with strip lights, so indoors does not look like night
    this.glow.box(cx, top - 0.012, (zf + zb) / 2 + 0.1, bx1 - bx0 - 0.5, 0.02, zb - zf - 0.4, 0x767d85);
    for (const k of [-1, 0, 1]) this.glow.box(cx + k * 5.6, top - 0.035, (zf + zb) / 2, 2.2, 0.03, 0.42, 0xf6f2e2);
    // the sign
    const sign = new THREE.MeshBasicMaterial({ map: signTexture('POLICE') }), edge = new THREE.MeshLambertMaterial({ color: 0x10244f });
    this._mesh(new THREE.BoxGeometry(6.4, 1.2, 0.16), [edge, edge, edge, edge, edge, sign], cx, top + 0.95, zf - 0.1, false);
    P.box(cx - 2.6, top + 0.35, zf - 0.1, 0.12, 0.2, 0.12, TRIM); P.box(cx + 2.6, top + 0.35, zf - 0.1, 0.12, 0.2, 0.12, TRIM);
    // inside: the desk, facing the door
    const dz = zb - 1.9;
    wall(cx - 2.6, 0, dz, cx + 2.6, 1.08, dz + 0.6, 0x3b4654, false);
    P.box(cx, KERB + 1.11, dz + 0.3, 5.4, 0.06, 0.8, 0x23272d);
    P.box(cx + 1.4, KERB + 1.3, dz + 0.36, 0.5, 0.34, 0.05, 0x15171a);            // a screen
    P.box(cx, KERB + 2.5, zb - 0.06, 3.2, 0.9, 0.06, BLUE);                        // a board on the back wall
    P.box(cx, KERB + 2.5, zb - 0.1, 2.9, 0.62, 0.03, 0xdad6c8);
    // a cell in the right hand corner: bars you can see and be seen through
    const cxa = bx1 - T - 3.6, cza = zb - 3.2;
    for (let k = 0; k <= 12; k++) P.box(cxa, KERB + 1.3, cza + k * 0.266, 0.05, 2.6, 0.05, 0x3d4249);
    for (let k = 1; k <= 13; k++) if (k < 2 || k > 5) P.box(cxa + k * 0.257, KERB + 1.3, cza, 0.05, 2.6, 0.05, 0x3d4249);
    // the cell door, standing open
    for (let k = 0; k <= 4; k++) P.box(cxa + 1.542 - k * 0.09, KERB + 1.3, cza - k * 0.27, 0.05, 2.6, 0.05, 0x3d4249);
    P.box(cxa + 1.36, KERB + 2.62, cza - 0.54, 0.08, 0.08, 1.16, 0x3d4249, 0, -0.32, 0); P.box(cxa + 1.36, KERB + 0.08, cza - 0.54, 0.08, 0.08, 1.16, 0x3d4249, 0, -0.32, 0);
    P.box(cxa + 1.8, KERB + 2.62, cza, 3.6, 0.08, 0.08, 0x3d4249); P.box(cxa, KERB + 2.62, cza + 1.6, 0.08, 0.08, 3.2, 0x3d4249);
    this._solid(cxa - 0.04, KERB, cza, cxa + 0.04, KERB + 2.6, zb, 'bars', false);
    this._solid(cxa, KERB, cza - 0.04, cxa + 0.3, KERB + 2.6, cza + 0.04, 'bars', false);
    this._solid(cxa + 1.5, KERB, cza - 0.04, bx1 - T, KERB + 2.6, cza + 0.04, 'bars', false);
    wall(cxa + 0.5, 0, zb - 0.6, bx1 - T - 0.3, 0.45, zb - 0.1, 0x5b5f66, false);   // the bunk
    // on the left: a bench for whoever is waiting, and lockers
    wall(bx0 + T + 0.2, 0, zf + 1.4, bx0 + T + 0.7, 0.45, zf + 4.2, 0x6a4a2c, false);
    P.box(bx0 + T + 0.26, KERB + 0.75, zf + 2.8, 0.08, 0.5, 2.8, 0x6a4a2c);
    for (let k = 0; k < 4; k++) P.box(bx0 + T + 1.6 + k * 0.62, KERB + 0.95, zb - 0.28, 0.58, 1.9, 0.5, k % 2 ? 0x3c4a5c : 0x445468);
    this._solid(bx0 + T + 1.3, KERB, zb - 0.55, bx0 + T + 3.8, KERB + 1.9, zb, 'building', true);
    // patrol cars in the bays, nose out
    this.patrol = [];
    for (const k of [0, 1]) {
      const x = x0 + 2.9 + k * 3, z = z0 + 2.6;
      const car = buildCar(0xf0f0ec, 'police');
      car.position.set(x, KERB, z); car.rotation.y = Math.PI;
      car.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); if (o.isMesh) o.castShadow = this.shadows; });
      this.group.add(car);
      this._solid(x - CAR.halfW, 0, z - CAR.halfL, x + CAR.halfW, KERB + 1.38, z + CAR.halfL, 'car', true);
      this.parked.push({ x, z, yaw: Math.PI });
      this.patrol.push({ x, z });
    }
    // where the officers stand, and how they get in and out
    this.police = {
      door: { x: cx, z: zf - 1.1 }, inside: { x: cx, z: zf + 1.6 },
      x0: bx0, x1: bx1, z0: zf, z1: zb, deskZ: dz, side: cx + 3.4,
      cellDoor: { x: cxa + 0.9, z: cza }, cell: { x: cxa + 2.1, z: cza + 1.5 }, cellWait: { x: cxa - 0.7, z: cza - 1.3 }, cellX0: cxa,
      posts: [
        { x: cx + 0.2, z: dz + 1.25, yaw: Math.PI, kind: 'desk', indoors: true },
        { x: cx - door - 1.0, z: zf - 0.9, yaw: Math.PI, kind: 'door' },
        { x: cx + door + 1.0, z: zf - 0.9, yaw: Math.PI, kind: 'door' },
        { x: cx + 5.5, z: z0 - 1.4, yaw: Math.PI, kind: 'beat' },
      ],
    };
  }

  /* ----------------------- the buildings all around ----------------------- */

  _surround() {
    const r = this.rng, D = 16;
    const run = (horizontal, side) => {
      let p = -(LIMIT + D);
      while (p < LIMIT + D) {
        const w = Math.min(12 + r() * 14, LIMIT + D - p);
        const h = 14 + r() * 30;
        const a0 = p, a1 = p + w - 0.02;
        const b0 = side > 0 ? LIMIT : -(LIMIT + D), b1 = side > 0 ? LIMIT + D : -LIMIT;
        const st = (r() * FACADE_COUNT) | 0;
        if (horizontal) this._building(a0, b0, a1, b1, h, st);
        else if (a1 > -LIMIT && a0 < LIMIT) this._building(b0, Math.max(a0, -LIMIT), b1, Math.min(a1, LIMIT), h, st);
        p += w;
      }
    };
    run(true, 1); run(true, -1); run(false, 1); run(false, -1);
    // the pavement between the outer streets and those buildings
    this._slab(-LIMIT, EDGE, LIMIT, LIMIT); this._slab(-LIMIT, -LIMIT, LIMIT, -EDGE);
    this._slab(EDGE, -EDGE, LIMIT, EDGE); this._slab(-LIMIT, -EDGE, -EDGE, EDGE);
  }

  /* ---------------------------- lamps and so on --------------------------- */

  _streetFurniture() {
    const r = this.rng;
    this.lamps = [];
    for (const c of ROADS) {
      let k = 0;
      for (let t = -45; t <= 45; t += 18) {
        if (ROADS.some((q) => Math.abs(t - q) < 7)) continue;
        const side = (k++ % 2) ? 1 : -1;
        const off = c + side * (ROAD_W / 2 + 0.45);
        // a street running along Z, then one running along X
        addLamp(this.props, this.glow, off, KERB, t, side > 0 ? Math.PI : 0);
        this._solid(off - 0.1, 0, t - 0.1, off + 0.1, 5.4, t + 0.1, 'lamp');
        this.lamps.push([off - side * 1.35, t]);
        addLamp(this.props, this.glow, t + 4, KERB, off, side > 0 ? Math.PI / 2 : -Math.PI / 2);
        this._solid(t + 3.9, 0, off - 0.1, t + 4.1, 5.4, off + 0.1, 'lamp');
        this.lamps.push([t + 4, off - side * 1.35]);
      }
    }
    // hydrants and bins on a few corners
    for (const b of this.blocks) {
      if (b.kind !== 'buildings') continue;
      if (r() < 0.7) { const x = b.x0 + 0.6, z = b.z0 + 5 + r() * 12; addHydrant(this.props, x, KERB, z); this._solid(x - 0.15, 0, z - 0.15, x + 0.15, 0.85, z + 0.15, 'hydrant'); }
      if (r() < 0.7) { const x = b.x1 - 3 - r() * 14, z = b.z1 - 0.55; addBin(this.props, x, KERB, z); this._solid(x - 0.25, 0, z - 0.25, x + 0.25, 1.05, z + 0.25, 'bin'); }
      if (r() < 0.6) { const x = b.x0 + 6 + r() * 10, z = b.z0 + SIDEWALK - 0.4; addBench(this.props, x, KERB, z, Math.PI); this._solid(x - 0.85, 0, z - 0.28, x + 0.85, KERB + 0.82, z + 0.28, 'bench'); }
    }
  }

  _markings() {
    const m = this.marks, y = 0.014, white = 0xcfcfc8, yellow = 0xc9a227;
    for (const c of ROADS) {
      for (let k = 0; k < 3; k++) {
        const a = ROADS[k] + ROAD_W / 2 + 3.4, b = ROADS[k + 1] - ROAD_W / 2 - 3.4;
        // centre line, dashed
        for (let t = a + 1; t < b - 1; t += 3.2) {
          m.flat(c, y, t + 0.8, 0.14, 1.6, yellow);
          m.flat(t + 0.8, y, c, 1.6, 0.14, yellow);
        }
        // stop lines, on the half of the road that arrives
        m.flat(c - LANE, y, b + 0.2, ROAD_W / 2 - 0.5, 0.3, white); m.flat(c + LANE, y, a - 0.2, ROAD_W / 2 - 0.5, 0.3, white);
        m.flat(b + 0.2, y, c + LANE, 0.3, ROAD_W / 2 - 0.5, white); m.flat(a - 0.2, y, c - LANE, 0.3, ROAD_W / 2 - 0.5, white);
        // zebra crossings just past them
        for (let s = -3.6; s <= 3.6; s += 1.2) {
          m.flat(c + s, y, b + 1.9, 0.6, 2.2, white); m.flat(c + s, y, a - 1.9, 0.6, 2.2, white);
          m.flat(b + 1.9, y, c + s, 2.2, 0.6, white); m.flat(a - 1.9, y, c + s, 2.2, 0.6, white);
        }
      }
    }
  }

  _finishMeshes() {
    const props = new THREE.Mesh(this.props.build(), propMaterial);
    props.castShadow = this.shadows; props.receiveShadow = this.shadows;
    const glow = new THREE.Mesh(this.glow.build(), glowMaterial);
    const marks = new THREE.Mesh(this.marks.build(), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    marks.receiveShadow = this.shadows;
    for (const m of [props, glow, marks]) { m.matrixAutoUpdate = false; this.group.add(m); }
    this.props = null; this.glow = null; this.marks = null;
  }

  /* ------------------------------ navigation ------------------------------ */

  _navigation() {
    // pavements: a ring of four nodes around every block, joined across each
    // street by the zebra crossings
    const nodes = [];
    const add = (x, z) => { nodes.push({ id: nodes.length, x, z, links: [] }); return nodes.length - 1; };
    const link = (a, b, cross = null) => {
      const len = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z);
      nodes[a].links.push({ to: b, len, cross }); nodes[b].links.push({ to: a, len, cross });
    };
    const id = (i, j, c) => (j * 3 + i) * 4 + c;
    const inset = SIDEWALK / 2;
    for (const b of this.blocks) {
      const x0 = b.x0 + inset, x1 = b.x1 - inset, z0 = b.z0 + inset, z1 = b.z1 - inset;
      add(x0, z0); add(x1, z0); add(x1, z1); add(x0, z1);       // SW, SE, NE, NW
    }
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      for (let c = 0; c < 4; c++) link(id(i, j, c), id(i, j, (c + 1) % 4));
      if (i < 2) {
        link(id(i, j, 1), id(i + 1, j, 0), { axis: 'x', at: ROADS[i + 1] });
        link(id(i, j, 2), id(i + 1, j, 3), { axis: 'x', at: ROADS[i + 1] });
      }
      if (j < 2) {
        link(id(i, j, 3), id(i, j + 1, 0), { axis: 'z', at: ROADS[j + 1] });
        link(id(i, j, 2), id(i, j + 1, 1), { axis: 'z', at: ROADS[j + 1] });
      }
    }
    // the park's paths
    const centre = add(0, 2.6), e = 13.5 - inset;
    const south = add(0, -e), east = add(e, 0), north = add(0, e), west = add(-e, 0);
    const c2 = add(2.6, 0), c3 = add(0, -2.6), c4 = add(-2.6, 0);
    link(centre, c2); link(c2, c3); link(c3, c4); link(c4, centre);
    link(north, centre); link(east, c2); link(south, c3); link(west, c4);
    const pk = (c) => id(1, 1, c);
    link(south, pk(0)); link(south, pk(1)); link(east, pk(1)); link(east, pk(2));
    link(north, pk(2)); link(north, pk(3)); link(west, pk(3)); link(west, pk(0));
    this.nodes = nodes;

    // streets: sixteen junctions, each joined to its neighbours
    this.junctions = [];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const out = [];
      if (i > 0) out.push(j * 4 + i - 1); if (i < 3) out.push(j * 4 + i + 1);
      if (j > 0) out.push((j - 1) * 4 + i); if (j < 3) out.push((j + 1) * 4 + i);
      this.junctions.push({ id: j * 4 + i, x: ROADS[i], z: ROADS[j], out, holder: null });
    }
  }

  nearestNode(x, z) {
    let best = 0, bd = Infinity;
    for (const n of this.nodes) {
      const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
      if (d < bd) { bd = d; best = n.id; }
    }
    return best;
  }

  /** Shortest way along the pavements, as a list of node ids. */
  path(from, to, avoid = null) {
    const nodes = this.nodes, n = nodes.length;
    const dist = new Float32Array(n).fill(Infinity), prev = new Int16Array(n).fill(-1), done = new Uint8Array(n);
    dist[from] = 0;
    for (;;) {
      let u = -1, bd = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
      if (u < 0 || u === to) break;
      done[u] = 1;
      for (const l of nodes[u].links) {
        let w = l.len;
        // somewhere to stay away from makes the road past it longer
        if (avoid) { const d = Math.hypot(nodes[l.to].x - avoid.x, nodes[l.to].z - avoid.z); if (d < avoid.r) w += (avoid.r - d) * 6; }
        if (dist[u] + w < dist[l.to]) { dist[l.to] = dist[u] + w; prev[l.to] = u; }
      }
    }
    const out = [];
    for (let u = to; u >= 0; u = prev[u]) { out.unshift(u); if (u === from) break; }
    return out[0] === from ? out : [from];
  }

  /** A random spot on a pavement, away from the corners. */
  randomPavement(rnd = Math.random) {
    const b = this.blocks[(rnd() * this.blocks.length) | 0];
    const inset = SIDEWALK / 2, side = (rnd() * 4) | 0, t = 0.15 + rnd() * 0.7;
    const x0 = b.x0 + inset, x1 = b.x1 - inset, z0 = b.z0 + inset, z1 = b.z1 - inset;
    if (side === 0) return { x: x0 + (x1 - x0) * t, z: z0 };
    if (side === 1) return { x: x1, z: z0 + (z1 - z0) * t };
    if (side === 2) return { x: x0 + (x1 - x0) * t, z: z1 };
    return { x: x0, z: z0 + (z1 - z0) * t };
  }

  /** Is a circle of this radius clear of everything fixed? */
  isClear(x, z, r = 0.4) {
    const list = this.world.queryStatics(x - r, z - r, x + r, z + r, []);
    for (const s of list) if (s.maxy > 0.3 && x + r > s.minx && x - r < s.maxx && z + r > s.minz && z - r < s.maxz) return false;
    return Math.abs(x) < LIMIT - 0.5 && Math.abs(z) < LIMIT - 0.5;
  }
}

function nearestRoad(v) {
  let best = ROADS[0];
  for (const c of ROADS) if (Math.abs(v - c) < Math.abs(v - best)) best = c;
  return best;
}
