/* =============================================================================
   Things made of small cubes, that come apart a cube at a time.

   A wooden wall, a steel wall and two steel beams are each a grid of cubes a
   few centimetres across. Every cube can be lost. A round punches out the
   cubes it goes through, and coming out of the far side of wood it tears out
   more round its exit than it made going in; steel takes more than one round
   in the same place before it gives. A machete chops cubes out of wood. Fire
   catches in wood, creeps up it, chars it black and burns it away.

   To the physics each thing is one box: the bounds of the cubes it still
   has, with their mass. When what is left falls into separate pieces, each
   piece becomes a thing of its own. A wall stands on the ground and stays
   where it is put, and so does any piece of it still standing on the ground;
   a piece that is joined to the ground by nothing falls.
   ========================================================================== */
import * as THREE from 'three';
import { Body, Island } from '../physics/world.js';
import { groundHeight } from './city.js';
import { clamp, clamp01, lerp, rand, chance, mulberry } from '../core/util.js';

/**
 * What a thing is made of. mass: kilograms a cube; hp: how much a cube takes
 * before it goes; dmg: how hard a round of power 1 hits it; resist: how much
 * power a round loses going through one.
 */
export const MAT = {
  wood: { mass: 0.065, hp: 1, dmg: 2.2, resist: 0.12, burns: true, chop: 1, sound: 'splinter', spark: false },
  sheet: { mass: 0.07, hp: 1.6, dmg: 1.5, resist: 0.5, burns: false, chop: 0.12, sound: 'clang', spark: true },
  steel: { mass: 0.12, hp: 2.2, dmg: 1.5, resist: 0.85, burns: false, chop: 0.06, sound: 'clang', spark: true },
};

const _p = [0, 0, 0], _d = [0, 0, 0], _w = [0, 0, 0], _l = [0, 0, 0];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const UNIT = new THREE.BoxGeometry(1, 1, 1);
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/* -------------------------------------------------------------------------- */
/*                                  one thing                                 */
/* -------------------------------------------------------------------------- */

export class VoxelThing {
  /**
   * @param {object} o
   *   kind, name    what it is ('wall' or 'beam'), and what to call it
   *   mat           a key of MAT
   *   n             [nx, ny, nz] cubes along each local axis
   *   cs            [x, y, z] size of one cube along each axis, metres
   *   cells         Uint8Array of nx*ny*nz, 1 where there is a cube
   *   colors        Float32Array of 3 per cell
   *   x, y, z, q    where the centre of its bounds is, and which way it is turned
   *   anchored      stands on the ground and does not move
   */
  constructor(sys, o) {
    this.sys = sys;
    const g = this.g = sys.g;
    this.kind = o.kind; this.name = o.name || o.kind;
    this.mat = o.mat; this.M = MAT[o.mat];
    [this.nx, this.ny, this.nz] = o.n;
    this.cs = o.cs;
    const N = this.N = this.nx * this.ny * this.nz;
    this.cells = o.cells;
    this.col = o.colors;
    this.base = new Float32Array(o.colors);
    this.hp = o.hp || new Float32Array(N).fill(this.M.hp);
    this.burn = o.burn || new Float32Array(N);       // seconds of burning left, 0 when not alight
    this.heat = o.heat || new Float32Array(N);       // 0..1: charred (wood) or glowing hot (steel)
    this.anchored = !!o.anchored;
    this.groundJ = o.groundJ ?? (this.anchored ? 0 : -1);   // the row that stands on the ground
    this.removed = false;
    this.dirtyShape = false; this.dirtyColor = false; this.lost = 0;
    this.burning = [];
    for (let c = 0; c < N; c++) if (this.burn[c] > 0 && this.cells[c]) this.burning.push(c);
    this.slot = new Int32Array(N).fill(-1);
    this.cellAt = new Int32Array(N).fill(-1);
    this.used = 0;
    this._bounds();
    this.count = 0;
    for (let c = 0; c < N; c++) if (this.cells[c]) this.count++;

    // drawn: one mesh, its cubes laid out in grid space, carried by a group that follows the body
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    const mesh = this.mesh = new THREE.InstancedMesh(UNIT, sys.material, Math.max(1, N));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, N) * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = g.shadows; mesh.receiveShadow = g.shadows;
    this.group.add(mesh);
    g.scene.add(this.group);
    for (let c = 0; c < N; c++) if (this.cells[c] && this._exposed(c)) this._show(c);

    // the box the physics sees
    const [hx, hy, hz] = this._half();
    const q = o.q || [0, 0, 0, 1];
    this.body = new Body({ hx, hy, hz, mass: Math.max(0.5, this.count * this.M.mass), x: o.x, y: o.y, z: o.z, qx: q[0], qy: q[1], qz: q[2], qw: q[3],
      shape: 1, dense: true, kind: 'voxel', friction: this.mat === 'wood' ? 0.75 : 0.55, bounce: 0.05, angDamp: 0.5, linDamp: 0.05 });
    this.island = new Island(null);
    this.island.add(this.body);
    g.world.addIsland(this.island);
    if (this.anchored) this.body.setKinematic(true);
    if (o.v) { this.body.vx = o.v[0]; this.body.vy = o.v[1]; this.body.vz = o.v[2]; }
    this.prop = { kind: this.kind, vox: this, body: this.body, island: this.island, solid: true, born: g.time };
    this.body.owner = this.prop;
    g.props.push(this.prop);
    this._place(true);
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }

  /* --------------------------------- layout ------------------------------- */

  idx(i, j, k) { return i + this.nx * (j + this.ny * k); }
  ijk(c, out) { out[0] = c % this.nx; const r = (c - out[0]) / this.nx; out[1] = r % this.ny; out[2] = (r - out[1]) / this.ny; return out; }

  /** The bounds of whatever cubes are left, in cells. */
  _bounds() {
    let i0 = 1e9, j0 = 1e9, k0 = 1e9, i1 = -1, j1 = -1, k1 = -1;
    const nx = this.nx, ny = this.ny;
    for (let c = 0; c < this.N; c++) {
      if (!this.cells[c]) continue;
      const i = c % nx, r = (c - i) / nx, j = r % ny, k = (r - j) / ny;
      if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; if (k < k0) k0 = k; if (k > k1) k1 = k;
    }
    this.i0 = i0; this.i1 = i1; this.j0 = j0; this.j1 = j1; this.k0 = k0; this.k1 = k1;
    // the centre of the bounds in grid space: the body's centre
    this.cx = (i0 + i1 + 1) * this.cs[0] * 0.5; this.cy = (j0 + j1 + 1) * this.cs[1] * 0.5; this.cz = (k0 + k1 + 1) * this.cs[2] * 0.5;
  }
  _half() { return [(this.i1 - this.i0 + 1) * this.cs[0] * 0.5, (this.j1 - this.j0 + 1) * this.cs[1] * 0.5, (this.k1 - this.k0 + 1) * this.cs[2] * 0.5]; }

  /** A cell's centre in the body's own space. */
  local(c, out) {
    this.ijk(c, out);
    out[0] = (out[0] + 0.5) * this.cs[0] - this.cx; out[1] = (out[1] + 0.5) * this.cs[1] - this.cy; out[2] = (out[2] + 0.5) * this.cs[2] - this.cz;
    return out;
  }
  /** A cell's centre in the world. */
  world(c, out) { this.local(c, _l); return this.body.toWorld(_l[0], _l[1], _l[2], out); }

  _solid(i, j, k) { return i >= 0 && j >= 0 && k >= 0 && i < this.nx && j < this.ny && k < this.nz && this.cells[this.idx(i, j, k)] === 1; }
  _exposed(c) {
    const a = this.ijk(c, _w), i = a[0], j = a[1], k = a[2];
    return !this._solid(i + 1, j, k) || !this._solid(i - 1, j, k) || !this._solid(i, j + 1, k) || !this._solid(i, j - 1, k) || !this._solid(i, j, k + 1) || !this._solid(i, j, k - 1);
  }

  /* -------------------------------- drawing ------------------------------- */

  _show(c) {
    if (this.slot[c] >= 0) return;
    const s = this.used++;
    this.slot[c] = s; this.cellAt[s] = c;
    this._matrix(s, c);
    this._color(c);
  }
  _hide(c) {
    const s = this.slot[c];
    if (s < 0) return;
    const last = --this.used;
    if (s !== last) {
      // the last instance moves into the gap
      const lc = this.cellAt[last];
      const m = this.mesh.instanceMatrix.array, col = this.mesh.instanceColor.array;
      m.copyWithin(s * 16, last * 16, last * 16 + 16);
      col.copyWithin(s * 3, last * 3, last * 3 + 3);
      this.slot[lc] = s; this.cellAt[s] = lc;
    }
    this.slot[c] = -1; this.cellAt[last] = -1;
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
  _matrix(s, c) {
    const a = this.ijk(c, _w), cs = this.cs;
    // a hair bigger than the cell, so that neighbours overlap and no sliver of a side shows between them
    _m.makeScale(cs[0] * 1.006, cs[1] * 1.006, cs[2] * 1.006);
    _m.setPosition((a[0] + 0.5) * cs[0], (a[1] + 0.5) * cs[1], (a[2] + 0.5) * cs[2]);
    _m.toArray(this.mesh.instanceMatrix.array, s * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  _color(c) {
    const s = this.slot[c];
    if (s < 0) return;
    const col = this.mesh.instanceColor.array, o = s * 3, q = c * 3;
    col[o] = this.col[q]; col[o + 1] = this.col[q + 1]; col[o + 2] = this.col[q + 2];
    this.dirtyColor = true;
  }
  /** The mesh and its group, put where the body is. */
  _place(force = false) {
    const b = this.body;
    if (!force && b.px === this._px && b.py === this._py && b.pz === this._pz && b.qw === this._qw && b.qx === this._qx && b.qy === this._qy) return;
    this._px = b.px; this._py = b.py; this._pz = b.pz; this._qx = b.qx; this._qy = b.qy; this._qw = b.qw;
    _q.set(b.qx, b.qy, b.qz, b.qw); _v.set(b.px, b.py, b.pz); _s.set(1, 1, 1);
    this.group.matrix.compose(_v, _q, _s);
    this.group.matrixWorldNeedsUpdate = true;
    this.mesh.position.set(-this.cx, -this.cy, -this.cz);
    this.mesh.updateMatrix();
  }

  /* ---------------------------------- rays -------------------------------- */

  /**
   * Walks a ray (in world space) through the grid, cell by cell, calling
   * visit(c, t, axis, sign) for every cell inside the bounds it passes
   * through, nearest first, until visit returns true or the ray leaves.
   * Returns false if the ray never enters the bounds.
   */
  walk(ox, oy, oz, dx, dy, dz, maxT, visit) {
    const b = this.body, cs = this.cs;
    b.toLocal(ox, oy, oz, _p); b.dirToLocal(dx, dy, dz, _d);
    const g = [_p[0] + this.cx, _p[1] + this.cy, _p[2] + this.cz], d = [_d[0], _d[1], _d[2]];
    const lo = [this.i0 * cs[0], this.j0 * cs[1], this.k0 * cs[2]], hi = [(this.i1 + 1) * cs[0], (this.j1 + 1) * cs[1], (this.k1 + 1) * cs[2]];
    let t0 = 0, t1 = maxT, axis0 = -1;
    this._tEnd = -1;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) { if (g[a] < lo[a] || g[a] > hi[a]) return false; continue; }
      let ta = (lo[a] - g[a]) / d[a], tb = (hi[a] - g[a]) / d[a];
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) { t0 = ta; axis0 = a; }
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
    const lim = [this.i1, this.j1, this.k1], low = [this.i0, this.j0, this.k0];
    this._tEnd = t1;
    const t = t0 + 1e-7;
    const cell = [0, 0, 0], step = [0, 0, 0], tMax = [0, 0, 0], tDel = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      cell[a] = clamp(Math.floor((g[a] + d[a] * t) / cs[a]), low[a], lim[a]);
      if (d[a] > 1e-9) { step[a] = 1; tMax[a] = ((cell[a] + 1) * cs[a] - g[a]) / d[a]; tDel[a] = cs[a] / d[a]; }
      else if (d[a] < -1e-9) { step[a] = -1; tMax[a] = (cell[a] * cs[a] - g[a]) / d[a]; tDel[a] = -cs[a] / d[a]; }
      else { step[a] = 0; tMax[a] = Infinity; tDel[a] = Infinity; }
    }
    let tc = t0, axis = axis0;
    for (let guard = 0; guard < 600; guard++) {
      const c = cell[0] + this.nx * (cell[1] + this.ny * cell[2]);
      if (visit(c, tc, axis, axis >= 0 ? -step[axis] : 0)) return true;
      // the next cell along
      let a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
      tc = tMax[a];
      if (tc > t1) return true;
      cell[a] += step[a];
      if (cell[a] < low[a] || cell[a] > lim[a]) return true;
      tMax[a] += tDel[a]; axis = a;
    }
    return true;
  }

  /** The first cube a ray meets: distance, or -1. The cell and the face it came in through are kept in `this.hit`. */
  ray(ox, oy, oz, dx, dy, dz, maxT) {
    let best = -1;
    const h = this.hit || (this.hit = { c: -1, t: 0, axis: 0, sign: 0 });
    this.walk(ox, oy, oz, dx, dy, dz, maxT, (c, t, axis, sign) => {
      if (!this.cells[c]) return false;
      best = t; h.c = c; h.t = t; h.axis = axis; h.sign = sign;
      return true;
    });
    return best;
  }

  /** The world normal of the face a ray came in through. */
  faceNormal(axis, sign, out) {
    const a = [0, 0, 0];
    if (axis >= 0) a[axis] = sign;
    return this.body.dirToWorld(a[0], a[1], a[2], out);
  }

  /* -------------------------------- damage -------------------------------- */

  /**
   * A round arriving at distance `t0` along the ray. Every cube it passes
   * through takes its share; a cube that gives lets the round on with less
   * power, one that holds stops it there. Returns what is left of the round
   * and where it comes out, or null if it stopped inside.
   */
  shoot(ox, oy, oz, dx, dy, dz, power, maxT) {
    const M = this.M;
    let left = power, entered = false, lastSolid = -1, exitT = -1, stopped = false;
    const cuts = [];
    let entryC = -1, entryAxis = 0, entrySign = 0;
    this.walk(ox, oy, oz, dx, dy, dz, maxT, (c, t, axis, sign) => {
      if (!this.cells[c]) {
        // out through a far face: a bigger hole on this side
        if (lastSolid >= 0) { this._exitHole(lastSolid, axis, dx, dy, dz, left); lastSolid = -1; exitT = t; }
        return false;
      }
      if (!entered) { entered = true; entryC = c; entryAxis = axis; entrySign = sign; }
      this.hp[c] -= left * M.dmg;
      if (this.hp[c] > 0) {
        // it held: a dent, and the round is spent
        this._dent(c);
        stopped = true;
        return true;
      }
      cuts.push(c);
      left -= M.resist;
      lastSolid = c;
      if (left <= 0.05) { stopped = true; return true; }
      return false;
    });
    if (!entered) return { power, exit: null };
    if (entryC >= 0 && entryAxis >= 0) this._entryRim(entryC, entryAxis);
    for (const c of cuts) this.remove(c, dx * rand(2, 5), dy * rand(2, 5) + rand(0.5, 2), dz * rand(2, 5));
    // a round that went right through, and out of the bounds on the far side
    if (!stopped && lastSolid >= 0) this._exitHole(lastSolid, -1, dx, dy, dz, left);
    if (stopped) return null;
    return { power: left, exitT };
  }

  /** A cube that took a round and held: darker, scuffed. */
  _dent(c) {
    const q = c * 3, k = this.mat === 'wood' ? 0.7 : 1.25;
    for (let a = 0; a < 3; a++) this.col[q + a] = clamp01(this.col[q + a] * k);
    this._color(c);
    this.sys.sparks(this, c, this.M.spark);
  }
  /** Round the way in: the edge pushed in a little, darkened. */
  _entryRim(c, axis) {
    const a = this.ijk(c, [0, 0, 0]);
    for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) {
      if (!u && !v) continue;
      const p = [a[0], a[1], a[2]], ax1 = (axis + 1) % 3, ax2 = (axis + 2) % 3;
      p[ax1] += u; p[ax2] += v;
      if (!this._solid(p[0], p[1], p[2])) continue;
      const n = this.idx(p[0], p[1], p[2]), q = n * 3;
      const k = this.mat === 'wood' ? 0.82 : 0.9;
      for (let i = 0; i < 3; i++) this.col[q + i] *= k;
      this._color(n);
    }
  }
  /**
   * Where a round comes out of wood it takes splinters with it: a few more
   * cubes round the hole on that face, and the raw wood showing round the rest.
   * Out of steel, the edge is torn bright.
   */
  _exitHole(c, axis, dx, dy, dz, left) {
    const a = this.ijk(c, [0, 0, 0]);
    // the face it leaves by: across the way it was going
    let ax = axis;
    if (ax < 0) { this.body.dirToLocal(dx, dy, dz, _d); ax = Math.abs(_d[0]) > Math.abs(_d[1]) ? (Math.abs(_d[0]) > Math.abs(_d[2]) ? 0 : 2) : (Math.abs(_d[1]) > Math.abs(_d[2]) ? 1 : 2); }
    const ax1 = (ax + 1) % 3, ax2 = (ax + 2) % 3;
    const wood = this.mat === 'wood';
    let torn = 0;
    for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) {
      if (!u && !v) continue;
      const p = [a[0], a[1], a[2]];
      p[ax1] += u; p[ax2] += v;
      if (!this._solid(p[0], p[1], p[2])) continue;
      const n = this.idx(p[0], p[1], p[2]);
      if (wood && torn < 3 && chance(0.4 + left * 0.1)) { torn++; this.remove(n, dx * rand(1.5, 4), dy * rand(1.5, 4) + rand(0.3, 1.5), dz * rand(1.5, 4)); continue; }
      const q = n * 3;
      if (wood) { this.col[q] = lerp(this.col[q], 0.86, 0.6); this.col[q + 1] = lerp(this.col[q + 1], 0.66, 0.6); this.col[q + 2] = lerp(this.col[q + 2], 0.42, 0.6); }
      else for (let i = 0; i < 3; i++) this.col[q + i] = lerp(this.col[q + i], 0.85, 0.55);
      this._color(n);
    }
    this.sys.exits++;
  }

  /** A blow from a blade (or a fist) at a cell: what it takes out, if anything. */
  chop(c, power, dx, dy, dz) {
    if (!this.cells[c]) return 0;
    const take = power * this.M.chop;
    let lost = 0;
    this.hp[c] -= take * this.M.hp * 1.4;
    if (this.hp[c] <= 0) { this.remove(c, dx * 2, dy * 2 + 1, dz * 2); lost++; }
    else this._dent(c);
    // a good chop into wood takes a neighbour or two along the edge with it
    if (this.mat === 'wood' && power > 0.8) {
      const a = this.ijk(c, [0, 0, 0]);
      for (const [ox, oy, oz] of DIRS) {
        if (lost >= 1 + Math.floor(power * 1.5)) break;
        if (!this._solid(a[0] + ox, a[1] + oy, a[2] + oz) || !chance(0.45)) continue;
        this.remove(this.idx(a[0] + ox, a[1] + oy, a[2] + oz), dx * 2, dy * 2 + 1, dz * 2);
        lost++;
      }
    }
    return lost;
  }

  /** One cube gone: it flies off as a chip, and whatever was behind it now shows. */
  remove(c, vx = 0, vy = 0, vz = 0, chip = true) {
    if (!this.cells[c]) return;
    this.cells[c] = 0;
    this.count--; this.lost++;
    if (chip) { this.world(c, _w); this.sys.chip(_w[0], _w[1], _w[2], vx + this.body.vx, vy + this.body.vy, vz + this.body.vz, this.cs, this.col, c * 3); }
    this._hide(c);
    const a = this.ijk(c, [0, 0, 0]);
    for (const [ox, oy, oz] of DIRS) {
      const i = a[0] + ox, j = a[1] + oy, k = a[2] + oz;
      if (this._solid(i, j, k)) this._show(this.idx(i, j, k));
    }
    this.dirtyShape = true;
    this.sys.dirty.add(this);
  }

  /* ---------------------------------- fire -------------------------------- */

  /** Flame against a cell: wood catches, steel heats. */
  heatUp(c, amount) {
    if (!this.cells[c]) return;
    if (this.M.burns) {
      if (this.burn[c] <= 0) {
        this.heat[c] = Math.min(1, this.heat[c] + amount * 0.5);
        if (this.heat[c] > 0.25) this.ignite(c);
      }
    } else {
      this.heat[c] = Math.min(1, this.heat[c] + amount * 0.08);
      this._tint(c);
      this.sys.hot.add(this);
    }
  }
  ignite(c) {
    if (!this.cells[c] || !this.M.burns || this.burn[c] > 0) return;
    this.burn[c] = rand(9, 16);
    this.burning.push(c);
    this.sys.fires.add(this);
  }
  /** The colour a cube is now: charred toward black, or glowing toward orange. */
  _tint(c) {
    const q = c * 3, h = this.heat[c];
    if (this.M.burns) {
      const k = 1 - h * 0.92;
      this.col[q] = this.base[q] * k + h * 0.02; this.col[q + 1] = this.base[q + 1] * k; this.col[q + 2] = this.base[q + 2] * k;
    } else {
      const glow = clamp01((h - 0.35) / 0.65);
      this.col[q] = lerp(this.base[q], 1.6, glow); this.col[q + 1] = lerp(this.base[q + 1], 0.42, glow); this.col[q + 2] = lerp(this.base[q + 2], 0.08, glow);
    }
    this._color(c);
  }

  /** Ten times a second: fire spreads, chars and eats; hot steel cools. */
  tickFire(dt) {
    const list = this.burning, fire = this.g.fire;
    // only so many flames for one thing at a time, from cubes picked at random; and one light and one sound for it all
    let flames = 0, sx = 0, sy = 0, sz = 0, sn = 0;
    const want = Math.min(14, Math.ceil(list.length * dt * 3));
    for (let n = list.length - 1; n >= 0; n--) {
      const c = list[n];
      if (!this.cells[c]) { list.splice(n, 1); continue; }
      this.burn[c] -= dt;
      this.heat[c] = Math.min(1, this.heat[c] + dt / 10);
      this._tint(c);
      const a = this.ijk(c, [0, 0, 0]);
      // it climbs more readily than it spreads, and spreads more readily than it goes down
      for (let d = 0; d < 6; d++) {
        const [ox, oy, oz] = DIRS[d];
        const i = a[0] + ox, j = a[1] + oy, k = a[2] + oz;
        if (!this._solid(i, j, k)) continue;
        const p = oy > 0 ? 0.035 : oy < 0 ? 0.004 : 0.012;
        if (chance(p * dt * 10)) this.ignite(this.idx(i, j, k));
      }
      if (fire && flames < want && this.slot[c] >= 0 && chance(want / Math.max(1, list.length) * 1.5)) { this.world(c, _w); fire.flameAt(_w[0], _w[1] + 0.05, _w[2], rand(0.22, 0.4), this); flames++; }
      if (sn < 24 && chance(0.3)) { this.world(c, _w); sx += _w[0]; sy += _w[1]; sz += _w[2]; sn++; }
      if (this.burn[c] <= 0) {
        list.splice(n, 1);
        this.burn[c] = 0;
        // burnt through: a little ash drops
        this.remove(c, rand(-0.2, 0.2), -0.2, rand(-0.2, 0.2), chance(0.3));
      }
    }
    if (!list.length) { this.sys.fires.delete(this); this.fireAt = null; }
    else if (sn) this.fireAt = [sx / sn, sy / sn, sz / sn, list.length];
  }
  coolDown(dt) {
    let any = false;
    for (let c = 0; c < this.N; c++) {
      if (this.heat[c] <= 0 || !this.cells[c]) continue;
      this.heat[c] = Math.max(0, this.heat[c] - dt * 0.03);
      this._tint(c);
      any = true;
    }
    if (!any) this.sys.hot.delete(this);
  }

  /* ------------------------------ coming apart ---------------------------- */

  /** After cubes have gone: the new shape, and whether it is still one piece. */
  settle() {
    this.dirtyShape = false;
    if (this.count <= 0) { this.g.removeProp(this.prop); return; }
    // which cubes are still joined to which
    const N = this.N, lab = new Int32Array(N).fill(-1), comps = [];
    const stack = [];
    for (let c0 = 0; c0 < N; c0++) {
      if (!this.cells[c0] || lab[c0] >= 0) continue;
      const comp = { id: comps.length, cells: [], ground: false };
      lab[c0] = comp.id; stack.push(c0);
      while (stack.length) {
        const c = stack.pop();
        comp.cells.push(c);
        const a = this.ijk(c, _w), i = a[0], j = a[1], k = a[2];
        if (j === this.groundJ) comp.ground = true;
        if (i + 1 < this.nx) { const n = c + 1; if (this.cells[n] && lab[n] < 0) { lab[n] = comp.id; stack.push(n); } }
        if (i > 0) { const n = c - 1; if (this.cells[n] && lab[n] < 0) { lab[n] = comp.id; stack.push(n); } }
        if (j + 1 < this.ny) { const n = c + this.nx; if (this.cells[n] && lab[n] < 0) { lab[n] = comp.id; stack.push(n); } }
        if (j > 0) { const n = c - this.nx; if (this.cells[n] && lab[n] < 0) { lab[n] = comp.id; stack.push(n); } }
        const L = this.nx * this.ny;
        if (k + 1 < this.nz) { const n = c + L; if (this.cells[n] && lab[n] < 0) { lab[n] = comp.id; stack.push(n); } }
        if (k > 0) { const n = c - L; if (this.cells[n] && lab[n] < 0) { lab[n] = comp.id; stack.push(n); } }
      }
      comps.push(comp);
    }
    if (comps.length > 1) {
      // the piece that stays this thing: the biggest one still on the ground, or else the biggest
      let keep = null;
      for (const cp of comps) if ((!this.anchored || cp.ground) && (!keep || cp.cells.length > keep.cells.length)) keep = cp;
      if (!keep) keep = comps.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
      for (const cp of comps) {
        if (cp === keep) continue;
        if (cp.cells.length < 5) { for (const c of cp.cells) this.remove(c, rand(-1, 1), rand(0, 1.5), rand(-1, 1)); continue; }
        this._breakOff(cp);
      }
      this.count = keep.cells.length;
      if (this.anchored && !keep.ground) this._letGo();
    } else if (this.anchored && !comps[0].ground) this._letGo();
    this._reshape();
  }

  /** No longer standing on anything: it falls. */
  _letGo() {
    this.anchored = false; this.groundJ = -1;
    this.body.setKinematic(false);
    this.island.wake();
    // nothing stands perfectly straight: something tall and thin, let go, starts to topple
    const b = this.body;
    if (b.hy > 2.5 * Math.min(b.hx, b.hz)) { b.toWorld(0, 0, b.hz < b.hx ? 1 : 0, _w); const tx = _w[0] - b.px, tz = _w[2] - b.pz, s = chance(0.5) ? 1 : -1; b.wx = tz * 0.6 * s; b.wz = -tx * 0.6 * s; }
    this.g.audio?.at(this.M.sound === 'splinter' ? 'creak' : 'clang', this.body.px, this.body.py, this.body.pz, 0.7);
  }

  /** One piece of this thing becomes a thing of its own. */
  _breakOff(cp) {
    let i0 = 1e9, j0 = 1e9, k0 = 1e9, i1 = -1, j1 = -1, k1 = -1;
    const a = [0, 0, 0];
    for (const c of cp.cells) { this.ijk(c, a); i0 = Math.min(i0, a[0]); i1 = Math.max(i1, a[0]); j0 = Math.min(j0, a[1]); j1 = Math.max(j1, a[1]); k0 = Math.min(k0, a[2]); k1 = Math.max(k1, a[2]); }
    const nx = i1 - i0 + 1, ny = j1 - j0 + 1, nz = k1 - k0 + 1, N = nx * ny * nz;
    const cells = new Uint8Array(N), colors = new Float32Array(N * 3), hp = new Float32Array(N), burn = new Float32Array(N), heat = new Float32Array(N);
    for (const c of cp.cells) {
      this.ijk(c, a);
      const n = (a[0] - i0) + nx * ((a[1] - j0) + ny * (a[2] - k0));
      cells[n] = 1; hp[n] = this.hp[c]; burn[n] = this.burn[c]; heat[n] = this.heat[c];
      colors[n * 3] = this.col[c * 3]; colors[n * 3 + 1] = this.col[c * 3 + 1]; colors[n * 3 + 2] = this.col[c * 3 + 2];
      // gone from here, without a chip: it is all still there, in the new piece
      this.cells[c] = 0; this.burn[c] = 0; this._hide(c);
    }
    // where its centre is now
    const cx = (i0 + i1 + 1) * this.cs[0] * 0.5 - this.cx, cy = (j0 + j1 + 1) * this.cs[1] * 0.5 - this.cy, cz = (k0 + k1 + 1) * this.cs[2] * 0.5 - this.cz;
    const b = this.body;
    b.toWorld(cx, cy, cz, _w);
    const v = [0, 0, 0]; b.velocityAt(_w[0], _w[1], _w[2], v);
    const grounded = this.anchored && cp.ground;
    const piece = new VoxelThing(this.sys, {
      kind: this.kind, name: this.name, mat: this.mat, n: [nx, ny, nz], cs: this.cs, cells, colors, hp, burn, heat,
      x: _w[0], y: _w[1], z: _w[2], q: [b.qx, b.qy, b.qz, b.qw], anchored: grounded, groundJ: grounded ? this.groundJ - j0 : -1, v,
    });
    piece.base.set(colors);
    this.sys.list.push(piece);
    if (piece.burning.length) this.sys.fires.add(piece);
    this.sys.broken++;
    if (!grounded) this.g.audio?.at(this.mat === 'wood' ? 'splinter' : 'clang', _w[0], _w[1], _w[2], 0.8);
    return piece;
  }

  /** The body takes the size and mass of what is left, centred where it now is. */
  _reshape() {
    const b = this.body, ocx = this.cx, ocy = this.cy, ocz = this.cz;
    this._bounds();
    if (this.i1 < 0) return;
    const sx = this.cx - ocx, sy = this.cy - ocy, sz = this.cz - ocz;
    b.toWorld(sx, sy, sz, _w);
    // whatever is fixed to it (marks, rope ends) stays on the same spot of it
    if (sx || sy || sz) { this.g.gore.recentre(b, sx, sy, sz); this.g.ropes?.recentre(b, sx, sy, sz); }
    const [hx, hy, hz] = this._half();
    b.setBox(hx, hy, hz, Math.max(0.3, this.count * this.M.mass), true);
    b.px = _w[0]; b.py = _w[1]; b.pz = _w[2]; b.ox = b.px; b.oy = b.py; b.oz = b.pz;
    if (!this.anchored) this.island.wake();
    this.g.world.wakeBox(b.px - b.boundR - 0.3, b.py - b.boundR - 0.3, b.pz - b.boundR - 0.3, b.px + b.boundR + 0.3, b.py + b.boundR + 0.6, b.pz + b.boundR + 0.3);
    this._place(true);
  }

  dispose() {
    if (this.removed) return;
    this.removed = true;
    this.g.scene.remove(this.group);
    this.mesh.dispose();
    this.sys.forget(this);
  }

  update() {
    this._place(false);
    // a fire in it: one light, one crackle
    if (this.fireAt && this.burning.length) {
      const f = this.fireAt, k = Math.min(1, f[3] / 60);
      this.g.lights?.ask('point', f[0], f[1] + 0.3, f[2], 0xff8a30, 3 + k * 6 + rand(-0.8, 0.8), 6 + k * 6);
      this.g.audio?.loop('vox' + this.body.id, 'fire', f[0], f[1], f[2], 0.4 + k * 0.8);
      if (chance(0.02 + k * 0.1)) this.g.gore.puff('smoke', f[0] + rand(-0.3, 0.3), f[1] + 0.5, f[2] + rand(-0.3, 0.3), 0.5 + k * 0.6, 2.2, 0.2, 0.19, 0.18);
    }
    if (this.dirtyColor) { this.mesh.instanceColor.needsUpdate = true; this.dirtyColor = false; }
    this.mesh.count = this.used;
    const b = this.body;
    if (b.py < -20) this.g.removeProp(this.prop);
  }
}

/* -------------------------------------------------------------------------- */
/*                         the things, and their chips                         */
/* -------------------------------------------------------------------------- */

const CHIPS = 500;

export class Voxels {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.dirty = new Set();
    this.fires = new Set();
    this.hot = new Set();
    this.material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.fireT = 0;
    this.exits = 0; this.broken = 0; this.chips = 0;
    // flying chips: little cubes that tumble, bounce and fade
    const mesh = this.chipMesh = new THREE.InstancedMesh(UNIT, this.material, CHIPS);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CHIPS * 3), 3);
    mesh.frustumCulled = false; mesh.count = 0;
    game.scene.add(mesh);
    this.cp = new Float32Array(CHIPS * 3); this.cv = new Float32Array(CHIPS * 3); this.cr = new Float32Array(CHIPS * 4);
    this.cw = new Float32Array(CHIPS * 3); this.cs = new Float32Array(CHIPS * 3); this.cl = new Float32Array(CHIPS);
    this.cn = 0;
  }

  forget(t) {
    const i = this.list.indexOf(t);
    if (i >= 0) this.list.splice(i, 1);
    this.dirty.delete(t); this.fires.delete(t); this.hot.delete(t);
  }

  /** A chip of something, thrown off at a speed. */
  chip(x, y, z, vx, vy, vz, cs, col, q) {
    const n = this.cn < CHIPS ? this.cn++ : (this._ring = ((this._ring || 0) + 1) % CHIPS);
    const o = n * 3;
    this.cp[o] = x; this.cp[o + 1] = y; this.cp[o + 2] = z;
    this.cv[o] = vx + rand(-0.6, 0.6); this.cv[o + 1] = vy + rand(-0.3, 0.8); this.cv[o + 2] = vz + rand(-0.6, 0.6);
    this.cw[o] = rand(-14, 14); this.cw[o + 1] = rand(-14, 14); this.cw[o + 2] = rand(-14, 14);
    const k = rand(0.45, 0.85);
    this.cs[o] = cs[0] * k; this.cs[o + 1] = cs[1] * k; this.cs[o + 2] = cs[2] * k;
    const r = n * 4; this.cr[r] = 0; this.cr[r + 1] = 0; this.cr[r + 2] = 0; this.cr[r + 3] = 1;
    this.cl[n] = rand(2.5, 4);
    const ic = this.chipMesh.instanceColor.array;
    ic[o] = col[q]; ic[o + 1] = col[q + 1]; ic[o + 2] = col[q + 2];
    this.chipMesh.instanceColor.needsUpdate = true;
    this.chips++;
  }

  /** A round that hit steel and held: a spark or two. */
  sparks(t, c, steel) {
    if (!steel) return;
    t.world(c, _w);
    this.g.gore.puff('flash', _w[0], _w[1], _w[2], 0.14, 0.06, 1, 0.85, 0.5);
  }

  /* --------------------------------- making -------------------------------- */

  /**
   * A wall standing on the ground, `yaw` the way its face looks. Wood: boards
   * ten centimetres thick; steel: a plate two centimetres thick, ribbed.
   */
  wall(mat, x, z, yaw) {
    const steel = mat === 'sheet';
    const cs = steel ? [0.05, 0.05, 0.02] : [0.05, 0.05, 0.05];
    const nx = 48, ny = 44, nz = steel ? 1 : 2, N = nx * ny * nz;
    const cells = new Uint8Array(N).fill(1), colors = new Float32Array(N * 3);
    const rng = mulberry((Math.random() * 1e9) | 0);
    // boards a few rows high, each its own shade, with a dark seam between them; or ribs of steel
    const shades = [];
    for (let b = 0; b < 12; b++) shades.push(steel ? 0.5 + rng() * 0.08 : 0.82 + rng() * 0.3);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = i + nx * (j + ny * k), o = c * 3;
      if (steel) {
        const rib = (i % 6) < 2 ? 1.12 : (i % 6) === 2 || (i % 6) === 5 ? 0.92 : 1;
        const v = shades[((i / 6) | 0) % 12] * rib * (0.96 + rng() * 0.08);
        const rust = rng() < 0.03 + (j < 4 ? 0.12 : 0) ? 1 : 0;
        colors[o] = v * (rust ? 1.25 : 0.95); colors[o + 1] = v * (rust ? 0.72 : 1); colors[o + 2] = v * (rust ? 0.45 : 1.08);
      } else {
        const board = (j / 4) | 0, seam = j % 4 === 3;
        const v = shades[board % 12] * (seam ? 0.62 : 1) * (0.93 + rng() * 0.12) * (1 - Math.abs(Math.sin(i * 0.9 + board * 2.1)) * 0.06);
        colors[o] = 0.55 * v; colors[o + 1] = 0.36 * v; colors[o + 2] = 0.2 * v;
      }
    }
    const h = ny * cs[1];
    const q = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
    const t = new VoxelThing(this, {
      kind: 'wall', name: steel ? 'Steel wall' : 'Wooden wall', mat, n: [nx, ny, nz], cs, cells, colors,
      x, y: groundHeight(x, z) + h / 2 + 0.002, z, q, anchored: true, groundJ: 0,
    });
    this.list.push(t);
    return t;
  }

  /**
   * A steel I-beam lying on the ground across the way the player looks:
   * `len` metres long, flanges top and bottom, the web between them.
   */
  beam(large, x, z, yaw) {
    const cs = [0.04, 0.04, 0.04];
    const nx = large ? 90 : 30, ny = large ? 8 : 6, nz = large ? 6 : 5, N = nx * ny * nz, web = (nz / 2) | 0;
    const cells = new Uint8Array(N), colors = new Float32Array(N * 3);
    const rng = mulberry((Math.random() * 1e9) | 0);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const flange = j === 0 || j === ny - 1, solid = flange || k === web;
      if (!solid) continue;
      const c = i + nx * (j + ny * k), o = c * 3;
      cells[c] = 1;
      // mill scale grey, rust coming through here and there
      const v = 0.34 + rng() * 0.05, rust = rng() < 0.06 ? rng() * 0.6 : 0;
      colors[o] = v + rust * 0.3; colors[o + 1] = v - rust * 0.05; colors[o + 2] = v + 0.03 - rust * 0.15;
    }
    const q = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
    const t = new VoxelThing(this, {
      kind: 'beam', name: large ? 'Large steel beam' : 'Short steel beam', mat: 'steel', n: [nx, ny, nz], cs, cells, colors,
      x, y: groundHeight(x, z) + ny * cs[1] / 2 + 0.05, z, q, anchored: false,
    });
    this.list.push(t);
    return t;
  }

  /* ---------------------------------- frame -------------------------------- */

  update(dt) {
    // whatever lost cubes since last frame: a new shape, perhaps new pieces
    if (this.dirty.size) {
      const list = [...this.dirty];
      this.dirty.clear();
      for (const t of list) if (!t.removed && t.dirtyShape) t.settle();
    }
    this.fireT += dt;
    if (this.fireT >= 0.1) {
      const step = this.fireT; this.fireT = 0;
      for (const t of [...this.fires]) if (!t.removed) t.tickFire(step);
      for (const t of [...this.hot]) if (!t.removed) t.coolDown(step);
    }
    for (const t of this.list) t.update(dt);
    this._chips(dt);
  }

  _chips(dt) {
    const n = this.cn;
    if (!n) return;
    const m = this.chipMesh.instanceMatrix.array, world = this.g.world;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      if (this.cl[i] <= 0) { for (let k = 0; k < 16; k++) m[i * 16 + k] = 0; continue; }
      this.cl[i] -= dt;
      this.cv[o + 1] -= 9.81 * dt;
      let x = this.cp[o] + this.cv[o] * dt, y = this.cp[o + 1] + this.cv[o + 1] * dt, z = this.cp[o + 2] + this.cv[o + 2] * dt;
      const gy = groundHeight(x, z) + this.cs[o + 1] * 0.5;
      if (y < gy) {
        y = gy;
        if (this.cv[o + 1] < -1) this.cv[o + 1] *= -0.25; else this.cv[o + 1] = 0;
        this.cv[o] *= 0.6; this.cv[o + 2] *= 0.6;
        this.cw[o] *= 0.5; this.cw[o + 1] *= 0.5; this.cw[o + 2] *= 0.5;
      } else if (world.staticAt(x, y, z)) { x = this.cp[o]; z = this.cp[o + 2]; this.cv[o] *= -0.3; this.cv[o + 2] *= -0.3; }
      this.cp[o] = x; this.cp[o + 1] = y; this.cp[o + 2] = z;
      // tumble
      const r = i * 4, hx = this.cw[o] * dt * 0.5, hy = this.cw[o + 1] * dt * 0.5, hz = this.cw[o + 2] * dt * 0.5;
      let qx = this.cr[r], qy = this.cr[r + 1], qz = this.cr[r + 2], qw = this.cr[r + 3];
      const nx = qx + hx * qw + hy * qz - hz * qy, ny = qy + hy * qw + hz * qx - hx * qz, nz = qz + hz * qw + hx * qy - hy * qx, nw = qw - hx * qx - hy * qy - hz * qz;
      const l = 1 / Math.hypot(nx, ny, nz, nw);
      qx = nx * l; qy = ny * l; qz = nz * l; qw = nw * l;
      this.cr[r] = qx; this.cr[r + 1] = qy; this.cr[r + 2] = qz; this.cr[r + 3] = qw;
      // shrinks away at the end
      const k = clamp01(this.cl[i] / 0.6);
      _q.set(qx, qy, qz, qw); _v.set(x, y, z); _s.set(this.cs[o] * k, this.cs[o + 1] * k, this.cs[o + 2] * k);
      _m.compose(_v, _q, _s); _m.toArray(m, i * 16);
    }
    this.chipMesh.count = n;
    this.chipMesh.instanceMatrix.needsUpdate = true;
  }

  /** Everything made of cubes goes. */
  clear() {
    for (const t of [...this.list]) this.g.removeProp(t.prop);
    this.cn = 0; this.chipMesh.count = 0;
  }
}
