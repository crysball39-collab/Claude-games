/* =============================================================================
   Blood, and everything it lands on.

   Every bleeding wound is a source. A slow one drips. A fast one throws a
   stream: droplets let go one after another and joined to the one before, so
   that what you see is a ribbon - until the pulse falls away, or the arc
   stretches it, and the ribbon parts into separate drops. Each droplet
   carries a measured amount, and where it lands it leaves that amount: a
   speck, a splat, a streak if it came in low, or a little more depth in a
   pool that was already there.

   Wounds themselves are decals fixed to the body part they are on, and move
   with it.

   Blood on anything that is not lying flat runs down it: down a wall to the
   pavement, down the side of a crate and off its bottom edge, down a shirt
   from a wound to the belt and on down the trouser leg, dripping from
   wherever the run gives out. Cloth around a wound soaks it up, a stain that
   spreads with every millilitre lost, and somebody lying in a pool soaks
   from underneath. A wet blade drips.
   ========================================================================== */
import * as THREE from 'three';
import { Quads, cellUV } from '../render/quads.js';
import { DECAL, ATLAS_COLS, ATLAS_ROWS } from '../render/textures.js';
import { Body, Island } from '../physics/world.js';
import { groundHeight } from '../world/city.js';
import { P, PARTS } from '../human/rig.js';
import { rgb } from '../render/boxes.js';
import { carDecal } from '../world/car.js';
import { clamp, clamp01, rand, pick, TAU, chance } from '../core/util.js';

const uv = (c) => cellUV(c[0], c[1], ATLAS_COLS, ATLAS_ROWS);
const UV = {};
for (const k in DECAL) UV[k] = Array.isArray(DECAL[k][0]) ? DECAL[k].map(uv) : uv(DECAL[k]);

const _carHit = { lp: [0, 0, 0], ln: [0, 0, 0], xn: [0, 0, 0], tag: '', piece: 0, exit: 0, glass: -1 };
const BREAK = 0.17;            // a stream stretched past this parts
const _v = [0, 0, 0], _w = [0, 0, 0], _n = [0, 0, 0];
const NONE = [];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1), _d = new THREE.Vector3(), _col = new THREE.Color();

export class Gore {
  constructor(game, { particles = 900, decals = 800, bodyDecals = 1500 } = {}) {
    this.game = game;
    const scene = game.scene;
    this.enabled = true;

    /* ---- droplets ---- */
    const N = this.N = particles;
    this.px = new Float32Array(N); this.py = new Float32Array(N); this.pz = new Float32Array(N);
    this.vx = new Float32Array(N); this.vy = new Float32Array(N); this.vz = new Float32Array(N);
    this.life = new Float32Array(N);        // <= 0 means free
    this.age = new Float32Array(N);
    this.ml = new Float32Array(N);
    this.rad = new Float32Array(N);
    this.kind = new Uint8Array(N);          // 0 blood, 1 vomit
    this.prev = new Int32Array(N).fill(-1); // the droplet let go just before this one, while they are joined
    this.gen = new Uint32Array(N);
    this.prevGen = new Uint32Array(N);
    this.owner = new Array(N).fill(null);
    this.drip = new Uint8Array(N);          // 1: let go from the end of a run, falling clear of whoever it ran down
    this.head = 0;
    this.live = 0;

    const dropGeo = new THREE.IcosahedronGeometry(1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.drops = new THREE.InstancedMesh(dropGeo, mat, N);
    this.drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.drops.frustumCulled = false;
    this.drops.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    const linkGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).rotateX(Math.PI / 2);
    this.links = new THREE.InstancedMesh(linkGeo, mat, N);
    this.links.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.links.frustumCulled = false;
    this.links.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    this.drops.count = 0; this.links.count = 0;
    scene.add(this.drops, this.links);
    this.blood = rgb(0x7e0505); this.bloodDark = rgb(0x4a0303); this.vomitCol = rgb(0x9a9442);

    /* ---- decals ---- */
    this.ground = new Quads(scene, decals, game.atlas, { offset: -4, renderOrder: 1 });
    this.gSlot = 0;
    this.gInfo = new Array(decals).fill(null);
    this.pools = [];
    this.flowing = new Set();             // pools on their way to a new size or place
    this.drains = [];                     // marks being drawn into a pool that has reached them
    this.body = new Quads(scene, bodyDecals, game.atlas, { offset: -6, renderOrder: 3 });
    this.bDecals = [];                    // { body, c[12], quad, human, part, grow }
    this.fx = new Quads(scene, 192, game.atlas, { offset: 0, renderOrder: 6, alphaTest: 0.01 });
    this.fxList = [];

    /* ---- lumps ---- */
    this.gibsList = [];
    this.maxGibs = 54;
    this.stats = { emitted: 0, landed: 0, parted: 0, streams: 0, merged: 0, onWeapons: 0, onPeople: 0, satellites: 0, runs: 0, chained: 0, drips: 0, soaks: 0, bladeDrips: 0 };
    this.runs = [];                       // blood running down walls: { q, info, x, y, z, nx, nz, w, len, max, v, ml, floor }
    this._soakT = 0;
    this._budget = 0;
    this._tintT = 0;
  }

  /* ------------------------------ droplets -------------------------------- */

  _spawn(x, y, z, vx, vy, vz, ml, kind = 0, owner = null, link = -1) {
    const i = this.head;
    this.head = (this.head + 1) % this.N;
    this.gen[i]++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = 6; this.age[i] = 0; this.ml[i] = ml; this.kind[i] = kind;
    this.rad[i] = clamp(0.007 + Math.cbrt(ml) * 0.0068, 0.009, 0.027);
    this.owner[i] = owner;
    this.drip[i] = 0;
    if (link >= 0 && this.life[link] > 0) { this.prev[i] = link; this.prevGen[i] = this.gen[link]; } else this.prev[i] = -1;
    this.stats.emitted++;
    return i;
  }

  /** A spray of loose drops from a point. */
  burst(x, y, z, dx, dy, dz, count, speed, spread = 0.8) {
    if (!this.enabled) return;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    count = Math.min(count, 110);
    for (let i = 0; i < count; i++) {
      const s = speed * (0.25 + Math.random() * 0.85);
      this._spawn(x, y, z,
        dx * s + (Math.random() - 0.5) * speed * spread, dy * s + (Math.random() - 0.3) * speed * spread * 0.8, dz * s + (Math.random() - 0.5) * speed * spread,
        1.5 + Math.random() * 4);
    }
  }

  /** Fine spray: many small drops, fast, the kind a bullet throws out of the far side. */
  mist(x, y, z, dx, dy, dz, count, speed, spread = 0.5) {
    if (!this.enabled) return;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    count = Math.min(count, 70);
    for (let i = 0; i < count; i++) {
      const s = speed * (0.35 + Math.random() * 0.9);
      this._spawn(x, y, z, dx * s + (Math.random() - 0.5) * speed * spread, dy * s + (Math.random() - 0.4) * speed * spread, dz * s + (Math.random() - 0.5) * speed * spread, 0.25 + Math.random() * 0.8);
    }
  }

  /** Blood thrown off a wet blade as it swings: a line of drops along the way the tip is going. */
  castOff(x, y, z, vx, vy, vz, wet) {
    if (!this.enabled) return;
    const n = 1 + ((wet * 3) | 0);
    for (let i = 0; i < n; i++) this._spawn(x, y, z, vx * rand(0.45, 0.8) + rand(-0.4, 0.4), vy * rand(0.45, 0.8) + rand(0, 0.8), vz * rand(0.45, 0.8) + rand(-0.4, 0.4), 0.6 + Math.random() * 1.6);
  }

  /**
   * Blood on a weapon: `n` marks on whichever of its surfaces took it. With a
   * point (world space) the mark goes on the nearest surface to it; without,
   * anywhere along the blade or the front of the gun.
   */
  smear(item, n = 1, big = false) {
    if (!this.enabled || !item.skin || !item.skin.length) return 0;
    let made = 0;
    for (let k = 0; k < n; k++) {
      const f = item.skin[(Math.random() * item.skin.length) | 0];
      // the widest pair of faces is the one that shows
      const ax = f.hx <= f.hy && f.hx <= f.hz ? 0 : f.hy <= f.hz ? 1 : 2;
      const sgn = Math.random() < 0.5 ? -1 : 1;
      const lp = [rand(-f.hx, f.hx), rand(-f.hy, f.hy), rand(f.hz * (item.def.gun ? 0.2 : -0.6), f.hz)];
      const ln = [ax === 0 ? sgn : 0, ax === 1 ? sgn : 0, ax === 2 ? sgn : 0];
      const size = big ? rand(0.05, 0.1) : rand(0.025, 0.055);
      const d = this._attach(f, this._onFace(f, lp, ln, size, size, rand(TAU), 0.0015), Math.random() < 0.5 ? UV.dot : pick(UV.splat), null, -1, rand(0.6, 1));
      if (d) { d.stain = true; made++; }
    }
    this.stats.onWeapons += made;
    return made;
  }

  /** A drop in flight meets a weapon somebody is carrying. */
  _dropOnItems(x, y, z, ml) {
    const list = this.game.weapons ? this.game.weapons.items : NONE;
    for (let k = 0; k < list.length; k++) {
      const it = list[k];
      if (!it.skin || !it.shown || it.body) continue;
      const dx = x - it.px, dy = y - it.py, dz = z - it.pz;
      if (dx * dx + dy * dy + dz * dz > it.reach2) continue;
      for (const f of it.skin) {
        f.toLocal(x, y, z, _v);
        const m = 0.014;
        if (Math.abs(_v[0]) > f.hx + m || Math.abs(_v[1]) > f.hy + m || Math.abs(_v[2]) > f.hz + m) continue;
        const face = nearestFace(_v, f);
        const size = clamp(0.02 + Math.cbrt(ml) * 0.022, 0.022, 0.07);
        const d = this._attach(f, this._onFace(f, [_v[0], _v[1], _v[2]], face, size, size, rand(TAU), 0.0015), ml > 2.5 ? pick(UV.splat) : UV.dot, null, -1, rand(0.6, 1));
        if (d) { d.stain = true; this.stats.onWeapons++; }
        if (it.def.blade && it.bloody < 1) { it.bloody = Math.min(1, it.bloody + 0.04); this.game.weapons._paint(it); }
        return true;
      }
    }
    return false;
  }

  vomit(human) {
    const hd = human.bodies[P.HEAD];
    if (human.gone[P.HEAD] || !human.attached[P.HEAD]) return;
    hd.toWorld(0, -0.07 * human.scale, 0.12 * human.scale, _v);
    hd.dirToWorld(0, -0.35, 1, _w);
    const bloody = human.h.vomitBlood;
    for (let i = 0; i < 46; i++) {
      const s = 1.6 + Math.random() * 1.8;
      this._spawn(_v[0], _v[1], _v[2], _w[0] * s + rand(-0.4, 0.4) + hd.vx, _w[1] * s + rand(-0.2, 0.5), _w[2] * s + rand(-0.4, 0.4) + hd.vz, 6, bloody && i % 3 ? 0 : 1, human);
    }
    human.scream = 0; human.talkT = 0.9;
    this.game.audio?.at('vomit', _v[0], _v[1], _v[2], 0.9);
    this.game.onVomit?.(human);
  }

  /* ------------------------------- wounds --------------------------------- */

  /** Fixes a decal to a body: `c` holds four corners in the body's own space. */
  _attach(body, c, cell, human, part, tint = 1, alpha = 1) {
    // each person may only carry so much; the oldest stains are painted over
    if (human) {
      let n = 0, oldest = -1;
      for (let i = 0; i < this.bDecals.length; i++) { const d = this.bDecals[i]; if (d.human === human) { n++; if (oldest < 0 && d.stain) oldest = i; } }
      if (n > 64 && oldest >= 0) this._detach(oldest);
    }
    let q = this.body.alloc();
    if (q < 0) {
      const i = this.bDecals.findIndex((d) => d.stain);
      if (i < 0) return null;
      this._detach(i);
      q = this.body.alloc();
      if (q < 0) return null;
    }
    this.body.uvRect(q, cell[0], cell[1], cell[2], cell[3]);
    this.body.tint(q, tint, tint, tint, alpha);
    const d = { body, c, quad: q, human, part, stain: false, grow: 0, settled: false };
    this.bDecals.push(d);
    return d;
  }
  _detach(i) {
    const d = this.bDecals[i];
    this.body.release(d.quad);
    this.bDecals[i] = this.bDecals[this.bDecals.length - 1];
    this.bDecals.pop();
  }

  /** Corners of a decal lying on one face of a box, centred as near `lp` as the face allows. */
  _onFace(b, lp, ln, w, h, angle = 0, lift = 0.004) {
    const hx = b.hx, hy = b.hy, hz = b.hz;
    let ux, uy, uz, vx, vy, vz, hu, hv, cx = lp[0], cy = lp[1], cz = lp[2];
    if (Math.abs(ln[0]) > 0.5) { ux = 0; uy = 0; uz = ln[0] > 0 ? -1 : 1; vx = 0; vy = 1; vz = 0; hu = hz; hv = hy; cx = Math.sign(ln[0]) * (hx + lift); }
    else if (Math.abs(ln[1]) > 0.5) { ux = 1; uy = 0; uz = 0; vx = 0; vy = 0; vz = ln[1] > 0 ? -1 : 1; hu = hx; hv = hz; cy = Math.sign(ln[1]) * (hy + lift); }
    else { ux = ln[2] > 0 ? 1 : -1; uy = 0; uz = 0; vx = 0; vy = 1; vz = 0; hu = hx; hv = hy; cz = Math.sign(ln[2]) * (hz + lift); }
    const ca = Math.cos(angle), sa = Math.sin(angle);
    let hw = w * 0.5, hh = h * 0.5;
    // a decal never hangs off the face it is on
    const eu = Math.abs(ca) * hw + Math.abs(sa) * hh, ev = Math.abs(sa) * hw + Math.abs(ca) * hh;
    const k = Math.min(1, hu / eu, hv / ev);
    hw *= k; hh *= k;
    const fu = Math.abs(ca) * hw + Math.abs(sa) * hh, fv = Math.abs(sa) * hw + Math.abs(ca) * hh;
    let pu = cx * ux + cy * uy + cz * uz, pv = cx * vx + cy * vy + cz * vz;
    pu = clamp(pu, -hu + fu, hu - fu); pv = clamp(pv, -hv + fv, hv - fv);
    const nx = Math.abs(ln[0]) > 0.5 ? cx : 0, ny = Math.abs(ln[1]) > 0.5 ? cy : 0, nz = Math.abs(ln[2]) > 0.5 ? cz : 0;
    const ox = nx + ux * pu + vx * pv, oy = ny + uy * pu + vy * pv, oz = nz + uz * pu + vz * pv;
    const ax = (ux * ca + vx * sa) * hw, ay = (uy * ca + vy * sa) * hw, az = (uz * ca + vz * sa) * hw;
    const bx = (-ux * sa + vx * ca) * hh, by = (-uy * sa + vy * ca) * hh, bz = (-uz * sa + vz * ca) * hh;
    return [ox - ax - bx, oy - ay - by, oz - az - bz, ox + ax - bx, oy + ay - by, oz + az - bz, ox + ax + bx, oy + ay + by, oz + az + bz, ox - ax + bx, oy - ay + by, oz - az + bz];
  }

  /* --------------------------------- runs -------------------------------- */

  /**
   * Blood starting to run down a body (a person's part, a crate) from a point
   * on one of its faces. It goes the way that is downhill along that face,
   * as the body lies now, and stops where the blood gives out or the face
   * does; at the edge it carries on to whatever is below, or drips off.
   * `w` is the wound that feeds it, if one does.
   */
  _bodyRun(human, part, b, lp, ln, ml, depth = 0, w = null) {
    if (!this.enabled || (human && human.gone[part])) return null;
    const face = [Math.abs(ln[0]) > 0.5 ? Math.sign(ln[0]) : 0, Math.abs(ln[1]) > 0.5 ? Math.sign(ln[1]) : 0, Math.abs(ln[2]) > 0.5 ? Math.sign(ln[2]) : 0];
    // downhill along the face, in the body's own space
    b.dirToLocal(0, -1, 0, _w);
    const dn = _w[0] * face[0] + _w[1] * face[1] + _w[2] * face[2];
    let dx = _w[0] - face[0] * dn, dy = _w[1] - face[1] * dn, dz = _w[2] - face[2] * dn;
    const l = Math.hypot(dx, dy, dz);
    if (l < 0.4) return null;            // near enough flat: it stays where it fell
    dx /= l; dy /= l; dz /= l;
    // from the point, as far as the face goes that way
    const h = [b.hx, b.hy, b.hz], dir = [dx, dy, dz], p = [lp[0], lp[1], lp[2]];
    let edge = Infinity;
    for (let a = 0; a < 3; a++) {
      if (face[a]) { p[a] = face[a] * h[a]; continue; }
      p[a] = clamp(p[a], -h[a] * 0.95, h[a] * 0.95);
      if (dir[a] > 1e-3) edge = Math.min(edge, (h[a] - p[a]) / dir[a]);
      else if (dir[a] < -1e-3) edge = Math.min(edge, (-h[a] - p[a]) / dir[a]);
    }
    const want = clamp(0.07 + Math.cbrt(ml) * 0.075, 0.07, 0.5);
    const max = Math.max(0.025, Math.min(want, edge));
    const width = clamp(0.03 + Math.cbrt(ml) * 0.016, 0.034, 0.075) * (human ? human.scale : 1);
    const d = this._attach(b, this._runCorners(b, p, dir, face, width, 0.015), pick(UV.run), human, part, rand(0.72, 1));
    if (!d) return null;
    d.stain = true;
    d.run = { lp: p, dir, face, w: width, len: 0.015, max, reach: edge, v: rand(0.1, 0.2), ml, depth, edge: want > edge, wound: w, human, part };
    this.stats.runs++;
    if (depth) this.stats.chained++;
    return d;
  }

  /** Four corners for a run: the far end (corners 0 and 1) carries the bead, the start (2 and 3) the head. */
  _runCorners(b, p, dir, face, w, len) {
    const lift = 0.0045;
    const sx = p[0] + face[0] * lift, sy = p[1] + face[1] * lift, sz = p[2] + face[2] * lift;
    const ex = sx + dir[0] * len, ey = sy + dir[1] * len, ez = sz + dir[2] * len;
    // across the run: the face normal crossed with the way it runs
    const ux = (face[1] * dir[2] - face[2] * dir[1]) * w * 0.5, uy = (face[2] * dir[0] - face[0] * dir[2]) * w * 0.5, uz = (face[0] * dir[1] - face[1] * dir[0]) * w * 0.5;
    return [ex - ux, ey - uy, ez - uz, ex + ux, ey + uy, ez + uz, sx + ux, sy + uy, sz + uz, sx - ux, sy - uy, sz - uz];
  }

  /**
   * Where the blood running from a wound leaves the body, in the world: the
   * end of the last run in the chain, once it has got there. RUNNING while it
   * is still on its way down; null if there is no run to speak of.
   */
  _tipOf(w) {
    let d = w.runTip;
    if (!d || !d.run || this.bDecals.indexOf(d) < 0) return null;
    while (d.next && d.next.run && this.bDecals.indexOf(d.next) >= 0) d = d.next;
    const r = d.run;
    if (r.len < r.max - 1e-3) return RUNNING;
    return d.body.toWorld(r.lp[0] + r.face[0] * 0.012 + r.dir[0] * r.len, r.lp[1] + r.face[1] * 0.012 + r.dir[1] * r.len, r.lp[2] + r.face[2] * 0.012 + r.dir[2] * r.len, _tip);
  }

  /** A run has gone as far as it will on this face: on to the part below, or off the edge. */
  _runEnd(d) {
    const r = d.run, b = d.body;
    if (!r.edge) return;
    const ex = r.lp[0] + r.dir[0] * r.len, ey = r.lp[1] + r.dir[1] * r.len, ez = r.lp[2] + r.dir[2] * r.len;
    b.toWorld(ex + r.face[0] * 0.006, ey + r.face[1] * 0.006, ez + r.face[2] * 0.006, _v);
    const wx = _v[0], wy = _v[1], wz = _v[2];
    const left = r.ml * 0.6;
    // on a person, it carries on to whatever part is below the edge it reached
    const hm = r.human;
    if (hm && r.depth < 4 && left > 0.8) {
      b.dirToWorld(r.face[0], r.face[1], r.face[2], _n);
      const nx = _n[0], ny = _n[1], nz = _n[2];
      for (let i = 0; i < hm.bodies.length; i++) {
        if (i === r.part || hm.gone[i] || !hm.attached[i]) continue;
        const o = hm.bodies[i];
        o.toLocal(wx, wy - 0.03, wz, _w);
        if (Math.abs(_w[0]) > o.hx + 0.025 || Math.abs(_w[1]) > o.hy + 0.025 || Math.abs(_w[2]) > o.hz + 0.025) continue;
        // the face of that part that looks the same way as the one it came down
        o.dirToLocal(nx, ny, nz, _n);
        const f = nearestAxis(_n);
        const nd = this._bodyRun(hm, i, o, [_w[0], _w[1], _w[2]], f, left, r.depth + 1, r.wound);
        if (nd) { d.next = nd; return; }
      }
    }
    // nowhere further to run: it gathers at the end and drops off
    const j = this._spawn(wx, wy - 0.01, wz, rand(-0.05, 0.05), -0.2, rand(-0.05, 0.05), Math.min(3, left), 0, hm || null);
    this.drip[j] = 1;
    this.stats.drips++;
  }

  /** Blood that hit a wall runs down it, a streak lengthening for a few seconds; one that reaches the pavement leaves a little there. */
  _wallRun(x, y, z, nx, nz, ml) {
    const room = y - groundHeight(x, z) - 0.01;
    if (room < 0.06 || this.runs.length > 70) return;
    const max = Math.min(room, clamp(0.12 + Math.cbrt(ml) * 0.17, 0.12, 1.0) * rand(0.7, 1.3));
    const w = clamp(0.04 + Math.cbrt(ml) * 0.02, 0.045, 0.1);
    const q = this._wallDecal(pick(UV.run), x, y, z, nx, nz, w, 0.02);
    this.runs.push({ q, info: this.gInfo[q], x, y, z, nx, nz, w, len: 0.02, max, v: rand(0.16, 0.3), ml, floor: room - max < 0.03 });
    this.stats.runs++;
  }

  _wallQuad(i, r) {
    const tx = -r.nz, tz = r.nx, hw = r.w * 0.5, ox = r.x + r.nx * 0.013, oz = r.z + r.nz * 0.013, top = r.y, bot = r.y - r.len;
    this.ground.corners(i, ox - tx * hw, bot, oz - tz * hw, ox + tx * hw, bot, oz + tz * hw, ox + tx * hw, top, oz + tz * hw, ox - tx * hw, top, oz - tz * hw);
  }

  /* ---------------------------------- soaking ------------------------------ */

  /** The cloth round a bleeding wound takes the blood up: a stain that spreads with what has been lost. */
  _soakWound(hm, b, w) {
    const s = hm.scale, r = clamp(0.028 + Math.sqrt(w.lost) * 0.011, 0.032, 0.34) * s;
    const sd = w.soakD;
    if (sd && this.bDecals.indexOf(sd) >= 0) {
      if (r < sd.r * 1.12) return;
      sd.r = r;
      sd.c = this._onFace(b, [w.x, w.y - r * 0.25, w.z], [w.nx, w.ny, w.nz], r * 2, r * 2.3, sd.ang, 0.0035);
      sd.settled = false;
      return;
    }
    const ang = rand(-0.3, 0.3);
    const d = this._attach(b, this._onFace(b, [w.x, w.y - r * 0.25, w.z], [w.nx, w.ny, w.nz], r * 2, r * 2.3, ang, 0.0035), pick(UV.soak), hm, w.part, rand(0.85, 1), 0.95);
    if (d) { d.soak = true; d.stain = true; d.r = r; d.ang = ang; w.soakD = d; this.stats.soaks++; }
  }

  /** Somebody lying in blood soaks from underneath: the faces of them that lie in it. */
  _soakPools() {
    const g = this.game;
    for (const hm of g.humans) {
      if (hm.removed || hm.state !== 2 || !hm.soak) continue;
      for (let i = 0; i < hm.bodies.length; i++) {
        if (hm.gone[i] || !hm.attached[i]) continue;
        const b = hm.bodies[i], gy = groundHeight(b.px, b.pz);
        if (b.py - b.boundR > gy + 0.06) continue;
        let wet = false;
        for (const p of this.pools) { if (Math.abs(p.y - gy) < 0.08 && Math.hypot(p.x - b.px, p.z - b.pz) < p.r * 0.9 + 0.04) { wet = true; break; } }
        if (!wet) continue;
        hm.soak[i] = Math.min(1, hm.soak[i] + (hm.clothed[i] ? 0.035 : 0.012));
        // a stain on whichever face is underneath, spreading
        if (!hm.clothed[i]) continue;
        b.dirToLocal(0, -1, 0, _w);
        const f = nearestAxis(_w), key = 'pool' + i;
        const r = clamp(0.04 + hm.soak[i] * 0.16, 0.04, 0.2) * hm.scale;
        let d = hm._poolSoak && hm._poolSoak[key];
        if (d && this.bDecals.indexOf(d) >= 0 && d.body === b) {
          if (r < d.r * 1.15) continue;
          d.r = r; d.c = this._onFace(b, [0, 0, 0], f, r * 2.2, r * 2.2, d.ang, 0.0035); d.settled = false;
        } else {
          const ang = rand(TAU);
          d = this._attach(b, this._onFace(b, [0, 0, 0], f, r * 2.2, r * 2.2, ang, 0.0035), pick(UV.soak), hm, i, rand(0.8, 1), 0.92);
          if (d) { d.soak = true; d.stain = true; d.r = r; d.ang = ang; (hm._poolSoak || (hm._poolSoak = {}))[key] = d; this.stats.soaks++; }
        }
      }
    }
  }

  /** A wet blade drips, from whichever end of it is lowest, until it has dried. */
  _dripBlades(dt) {
    const list = this.game.weapons ? this.game.weapons.items : NONE;
    for (const it of list) {
      if (!it.def.blade || !(it.bloody > 0.3) || !it.skin || !it.skin.length || (!it.shown && !it.body)) continue;
      it.bloody = Math.max(0, it.bloody - dt * 0.0035);
      it.dripT = (it.dripT || rand(0, 1)) - dt;
      if (it.dripT > 0) continue;
      it.dripT = rand(0.5, 1.6) / it.bloody;
      const f = it.skin[0];
      let low = null;
      for (const sz of [-1, 1]) for (const sy of [-1, 1]) { f.toWorld(0, sy * f.hy, sz * f.hz, _v); if (!low || _v[1] < low[1]) low = [_v[0], _v[1], _v[2]]; }
      this._spawn(low[0], low[1] - 0.006, low[2], 0, -0.12, 0, rand(0.25, 0.6), 0, it.holder || null);
      this.stats.bladeDrips++;
    }
  }

  /** Draws a wound the health model has just recorded. */
  wound(human, w) {
    if (!this.enabled || human.gone[w.part]) return;
    const b = human.bodies[w.part], lp = [w.x, w.y, w.z], ln = [w.nx, w.ny, w.nz];
    let cell, ww = w.size, hh = w.size, ang = rand(TAU), alpha = 1;
    switch (w.type) {
      case 'bruise': cell = UV.bruise; ww = hh = w.size * 2; alpha = human.clothed[w.part] ? 0.4 : 0.85; break;
      case 'crush': cell = UV.bruise2; ww = hh = w.size * 2.6; alpha = 0.9; break;
      case 'cut': cell = UV.cut; ww = w.size * 1.5; hh = w.size * 0.9; ang = w.angle + rand(-0.3, 0.3); break;
      case 'slash': cell = UV.slash; ww = w.size * 1.9; hh = w.size * 1.2; ang = w.angle + rand(-0.25, 0.25); break;
      case 'stab': cell = UV.stab; ww = hh = 0.09; ang = 0; break;
      case 'gunshot': cell = UV.entry; ww = hh = 0.085; ang = 0; break;
      case 'exit': cell = UV.exit; ww = hh = 0.15; ang = 0; break;
      case 'scrape': cell = UV.scrape; ww = hh = w.size * 2; break;
      default: return;
    }
    const d = this._attach(b, this._onFace(b, lp, ln, ww, hh, ang), cell, human, w.part, 1, alpha);
    if (d) d.wound = w;
    w.decal = 1;
  }

  /** A plain mark on any body part: a stain, a hole in something already dead. */
  mark(human, part, kind, lp, ln, size, lift = 0.004) {
    if (!this.enabled || human.gone[part]) return;
    const b = human.bodies[part];
    const cell = kind === 'entry' ? UV.entry : kind === 'crack' ? UV.crack : kind === 'bruise' ? UV.bruise : kind === 'slash' ? UV.slash : kind === 'dot' ? UV.dot : kind === 'frost' ? UV.frost : pick(UV.splat);
    const d = this._attach(b, this._onFace(b, lp, ln, size, size, rand(TAU), lift), cell, human, part);
    if (d && (kind === 'dot' || kind === 'splat')) d.stain = true;
    if (d && kind === 'frost') d.frost = true;
  }
  /** The rime on somebody, gone: it has thawed. */
  clearFrost(human) {
    for (let i = this.bDecals.length - 1; i >= 0; i--) { const d = this.bDecals[i]; if (d.human === human && d.frost) this._detach(i); }
  }

  /** The raw end left where a part came away. */
  stump(human, part, anchor, lostPart, w) {
    if (part < 0 || human.gone[part]) return;
    const b = human.bodies[part], s = human.scale;
    const lp = [anchor[0] * s, anchor[1] * s, anchor[2] * s];
    // which face of this box does the joint sit on?
    const rx = Math.abs(lp[0]) / b.hx, ry = Math.abs(lp[1]) / b.hy;
    const ln = rx > 1.05 && rx > ry ? [Math.sign(lp[0]), 0, 0] : [0, lp[1] < 0 ? -1 : 1, 0];
    const ref = lostPart >= 0 ? PARTS[lostPart].size : PARTS[part].size;
    const wide = Math.min(ref[0], PARTS[part].size[ln[0] ? 2 : 0]) * s * 1.02, deep = Math.min(ref[2], PARTS[part].size[2]) * s * 1.02;
    this._attach(b, this._onFace(b, lp, ln, wide, ln[0] ? ref[1] * s * 0.5 : deep, 0, 0.003), UV.stump, human, part);
    human.capStump?.(part, lp, ln, wide, ln[0] ? ref[1] * s * 0.5 : deep, lostPart);
    // and it runs down from there
    if (ln[1] >= 0 && part <= P.HEAD) {
      const d = this._attach(b, this._onFace(b, [lp[0], lp[1] - 0.02, b.hz], [0, 0, 1], 0.12 * s, 0.16 * s, 0), pick(UV.drip), human, part);
      if (d) d.stain = false;
    }
  }

  clearPart(human, part) {
    for (let i = this.bDecals.length - 1; i >= 0; i--) { const d = this.bDecals[i]; if (d.human === human && d.part === part) this._detach(i); }
  }
  clearHuman(human) {
    for (let i = this.bDecals.length - 1; i >= 0; i--) if (this.bDecals[i].human === human) this._detach(i);
    for (let i = 0; i < this.N; i++) if (this.owner[i] === human) this.owner[i] = null;
  }
  clearBody(body) {
    for (let i = this.bDecals.length - 1; i >= 0; i--) if (this.bDecals[i].body === body) this._detach(i);
  }

  /** A body whose centre has moved within it by (ox,oy,oz) (a wall that lost cubes): its marks stay where they were on it. */
  recentre(body, ox, oy, oz) {
    for (const d of this.bDecals) {
      if (d.body !== body) continue;
      const c = d.c;
      for (let k = 0; k < 12; k += 3) { c[k] -= ox; c[k + 1] -= oy; c[k + 2] -= oz; }
      if (d.run) { d.run.lp[0] -= ox; d.run.lp[1] -= oy; d.run.lp[2] -= oz; }
      d.settled = false;
    }
  }

  /* -------------------------------- the ground ---------------------------- */

  _groundDecal(cell, x, y, z, w, d, rot, alpha = 1) {
    const i = this.gSlot;
    this.gSlot = (this.gSlot + 1) % this.ground.capacity;
    if (this.ground.count <= i) this.ground.count = i + 1;
    const old = this.gInfo[i];
    if (old && old.pool) { const k = this.pools.indexOf(old.pool); if (k >= 0) this.pools.splice(k, 1); }
    this.ground.flat(i, x, y + 0.012 + (i % 7) * 0.0008, z, w, d, rot);
    this.ground.uvRect(i, cell[0], cell[1], cell[2], cell[3]);
    this.ground.tint(i, 1, 1, 1, alpha);
    this.gInfo[i] = { born: this.game.time, alpha, pool: null, x, y, z, rot, wall: false, blood: cell !== UV.vomit && cell !== UV.hole && cell !== UV.chip && cell !== UV.scorch && cell !== UV.soot };
    return i;
  }

  /** A mark on an upright surface: nx, nz say which way the wall faces. */
  _wallDecal(cell, x, y, z, nx, nz, w, h) {
    const i = this.gSlot;
    this.gSlot = (this.gSlot + 1) % this.ground.capacity;
    if (this.ground.count <= i) this.ground.count = i + 1;
    const old = this.gInfo[i];
    if (old && old.pool) { const k = this.pools.indexOf(old.pool); if (k >= 0) this.pools.splice(k, 1); }
    const tx = -nz, tz = nx, hw = w * 0.5, hh = h * 0.5, ox = x + nx * 0.012, oz = z + nz * 0.012;
    this.ground.corners(i, ox - tx * hw, y - hh, oz - tz * hw, ox + tx * hw, y - hh, oz + tz * hw, ox + tx * hw, y + hh, oz + tz * hw, ox - tx * hw, y + hh, oz - tz * hw);
    this.ground.uvRect(i, cell[0], cell[1], cell[2], cell[3]);
    this.ground.tint(i, 1, 1, 1, 1);
    this.gInfo[i] = { born: this.game.time, alpha: 1, pool: null, wall: true, blood: cell !== UV.hole && cell !== UV.chip && cell !== UV.scorch && cell !== UV.soot };
    return i;
  }

  /** A bullet hole in the world. */
  hole(x, y, z, nx, ny, nz, big = false) {
    const s = big ? 0.3 : 0.16;
    if (Math.abs(ny) > 0.6) this._groundDecal(big ? UV.chip : UV.hole, x, y - 0.012, z, s, s, rand(TAU));
    else this._wallDecal(big ? UV.chip : UV.hole, x, y, z, nx, nz, s, s);
  }

  _land(i, speed) {
    const x = this.px[i], z = this.pz[i], y = groundHeight(x, z), ml = this.ml[i];
    this.stats.landed++;
    if (this.kind[i] === 1) {
      if (Math.random() < 0.12) this._groundDecal(UV.vomit, x, y, z, rand(0.25, 0.45), rand(0.25, 0.45), rand(TAU), 0.95);
      return;
    }
    // near blood that is already there, it simply joins it
    // (a fine drop only joins what it actually lands in, so that spray stays spray)
    let best = null, bd = ml < 1.3 ? 0.01 : 0.2;
    for (const p of this.pools) {
      if (Math.abs(p.y - y) > 0.06) continue;
      const d = Math.hypot(p.x - x, p.z - z) - p.tr * 0.8 + (p.big || ml < 1.3 ? 0 : 0.12);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) { this._feed(best, ml); return; }
    const hs = Math.hypot(this.vx[i], this.vz[i]);
    let q, size;
    if (hs > 2.4 && hs > -this.vy[i] * 0.9) {
      // came in low and fast: a streak along the way it was going
      const len = clamp(0.18 + hs * 0.07, 0.2, 0.7) * rand(0.8, 1.25);
      q = this._groundDecal(pick(UV.streak), x, y, z, len, len * 0.45, -Math.atan2(this.vz[i], this.vx[i]));
      size = len * 0.6;
    } else if (speed > 3.2 || ml > 5) {
      size = clamp(0.1 + Math.cbrt(ml) * 0.07 + speed * 0.012, 0.12, 0.42) * rand(0.7, 1.45);
      q = this._groundDecal(pick(UV.splat), x, y, z, size, size * rand(0.8, 1.1), rand(TAU));
    } else {
      size = clamp(0.035 + Math.cbrt(ml) * 0.03, 0.04, 0.12) * rand(0.8, 1.6);
      q = this._groundDecal(UV.dot, x, y, z, size, size, rand(TAU));
    }
    // no two marks quite the same red
    const k = rand(0.55, 1);
    this.gInfo[q].shade = k;
    this.ground.tint(q, k, k, k, 1);
    // a drop that lands hard throws smaller ones on ahead of it
    if (ml > 2.2 && speed > 4.6) {
      const n = speed > 7 ? 3 : 2, dir = hs > 0.4 ? Math.atan2(this.vz[i], this.vx[i]) : rand(TAU);
      for (let j = 0; j < n; j++) {
        const a = dir + rand(-0.9, 0.9) * (hs > 0.4 ? 1 : 3.4), v = rand(0.7, 1.9) + hs * 0.2;
        this._spawn(x, y + 0.02, z, Math.cos(a) * v, rand(0.7, 1.6), Math.sin(a) * v, rand(0.25, 0.7));
        this.stats.satellites++;
      }
    }
    if (this.pools.length < 180) {
      const pool = { x, y, z, tx: x, tz: z, vol: ml, r: size * 0.42, tr: size * 0.42, quad: q, rot: this.gInfo[q].rot, big: false, size, info: this.gInfo[q] };
      this.gInfo[q].pool = pool;
      this.pools.push(pool);
      this._merge(pool);
    }
  }

  /** More blood arrives in a pool. */
  _feed(p, ml) {
    p.vol += ml;
    const r = Math.min(1.5, 0.07 + Math.sqrt(p.vol) * 0.021);
    if (r > p.tr + 0.003) {
      p.tr = r;
      this.flowing.add(p);
      this._merge(p);
    }
  }

  /**
   * Two pools that have grown into each other are one pool. The larger takes
   * the smaller's blood and moves a little toward where it lay; the smaller is
   * drawn in and gone. Repeats, because the pool that results may now touch a third.
   */
  _merge(p) {
    for (let pass = 0; pass < 6; pass++) {
      let other = null;
      for (const o of this.pools) {
        if (o === p || Math.abs(o.y - p.y) > 0.06) continue;
        const d = Math.hypot(o.tx - p.tx, o.tz - p.tz);
        if (d < (p.tr + o.tr) * 0.84) { other = o; break; }
      }
      if (!other) return;
      let big = p, small = other;
      if (other.vol > p.vol) { big = other; small = p; }
      const total = big.vol + small.vol, f = small.vol / total;
      big.tx += (small.tx - big.tx) * f; big.tz += (small.tz - big.tz) * f;
      big.vol = total;
      big.tr = Math.max(big.tr, Math.min(1.5, 0.07 + Math.sqrt(total) * 0.021));
      this.flowing.add(big);
      this._drain(small, big);
      this.stats.merged++;
      p = big;
    }
  }

  _drain(small, into) {
    const k = this.pools.indexOf(small);
    if (k >= 0) this.pools.splice(k, 1);
    this.flowing.delete(small);
    const info = this.gInfo[small.quad];
    if (!info || info.pool !== small) return;
    info.pool = null;
    this.drains.push({ quad: small.quad, info, x: small.x, y: small.y, z: small.z, into, size: small.big ? small.r * 2.3 : small.size, rot: small.rot, t: 0 });
  }

  /** Pools easing out to the size and place they are heading for; marks being swallowed. */
  _flow(dt) {
    const G = this.ground, k = 1 - Math.exp(-dt * 4.5);
    for (const p of this.flowing) {
      const info = this.gInfo[p.quad];
      if (!info || info.pool !== p) { this.flowing.delete(p); continue; }
      p.r += (p.tr - p.r) * k; p.x += (p.tx - p.x) * k; p.z += (p.tz - p.z) * k;
      if (!p.big && (p.vol > 40 || p.r > 0.14)) { p.big = true; const c = pick(UV.pool); G.uvRect(p.quad, c[0], c[1], c[2], c[3]); }
      if (p.big) G.flat(p.quad, p.x, p.y + 0.014 + (p.quad % 7) * 0.0008, p.z, p.r * 2.3, p.r * 2.3, p.rot);
      info.x = p.x; info.z = p.z;
      if (Math.abs(p.tr - p.r) < 0.002 && Math.abs(p.tx - p.x) + Math.abs(p.tz - p.z) < 0.004) this.flowing.delete(p);
    }
    for (let i = this.drains.length - 1; i >= 0; i--) {
      const d = this.drains[i];
      if (this.gInfo[d.quad] !== d.info) { this.drains.splice(i, 1); continue; }
      d.t += dt / 0.5;
      if (d.t >= 1) { G.hide(d.quad); this.gInfo[d.quad] = null; this.drains.splice(i, 1); continue; }
      const u = d.t * d.t * (3 - 2 * d.t), sz = d.size * (1 - u);
      G.flat(d.quad, d.x + (d.into.x - d.x) * u, d.y + 0.013, d.z + (d.into.z - d.z) * u, sz, sz, d.rot);
    }
  }

  /** Everything blood has been spilled on, wiped clean. */
  clean() {
    this.runs.length = 0;
    for (const hm of this.game.humans) if (hm.soak) { hm.soak.fill(0); hm._poolSoak = null; for (const w of hm.h.wounds) { w.soakD = null; w.runTip = null; } }
    for (let i = 0; i < this.ground.capacity; i++) { this.ground.hide(i); this.gInfo[i] = null; }
    this.pools.length = 0; this.flowing.clear(); this.drains.length = 0;
    for (let i = 0; i < this.N; i++) this.life[i] = 0;
    for (let i = this.bDecals.length - 1; i >= 0; i--) if (this.bDecals[i].stain) this._detach(i);
  }

  /* ---------------------------------- lumps ------------------------------- */

  gibs(x, y, z, vel, size, skinHex, clothHex, part = -1) {
    const g = this.game, n = 5 + ((Math.random() * 4) | 0);
    // what comes out depends on what it was: skull and brain, ribs and lung, gut, or bone and muscle
    const inside = part === P.HEAD ? [0xb48c88, 0xa07a76, 0xe9e2d0, 0xf2eee4] : part === P.CHEST ? [0xe9e2d0, 0xb25b5b, 0x8f1818] : part === P.ABDOMEN || part === P.PELVIS ? [0x9a5a52, 0xb0706a, 0x7a3a34] : [0xe9e2d0, 0x8f1818];
    const colours = [0x7a0e0e, 0x5c0808, 0x8f1818, skinHex, clothHex, ...inside];
    for (let i = 0; i < n + inside.length; i++) {
      while (this.gibsList.length >= this.maxGibs) this._dropGib(0);
      const hex = colours[i % colours.length];
      const bone = hex === 0xe9e2d0 || hex === 0xf2eee4, gut = hex === 0x9a5a52 || hex === 0xb0706a || hex === 0x7a3a34;
      const s = bone ? rand(0.02, 0.05) : rand(0.035, 0.085);
      // bone splinters long and thin, gut in ropes, the rest in lumps
      const long = bone || gut ? rand(2.2, 3.6) : 1;
      const b = new Body({
        hx: s * rand(0.6, 1.3) * (bone ? 0.5 : 1), hy: s * rand(0.5, 1) * (bone ? 0.5 : 1), hz: s * rand(0.6, 1.3) * long, mass: 0.25,
        x: x + rand(-1, 1) * size[0] * 0.4, y: y + rand(-1, 1) * size[1] * 0.4, z: z + rand(-1, 1) * size[2] * 0.4,
        kind: 'gib', friction: 0.9, linDamp: 0.1, angDamp: 1.2, inertiaFloor: 0.0006,
      });
      b.vx = vel[0] + rand(-3, 3); b.vy = vel[1] + rand(0.5, 4.5); b.vz = vel[2] + rand(-3, 3);
      b.wx = rand(-14, 14); b.wy = rand(-14, 14); b.wz = rand(-14, 14);
      const isl = new Island(null); isl.add(b);
      g.world.addIsland(isl);
      const idx = g.boxes.alloc();
      g.boxes.colorHex(idx, hex);
      this.gibsList.push({ body: b, island: isl, idx, born: g.time, bled: bone ? 2 : 0 });
    }
  }
  _dropGib(i) {
    const o = this.gibsList[i];
    this.game.world.removeIsland(o.island);
    this.game.boxes.release(o.idx);
    this.gibsList.splice(i, 1);
  }

  /* --------------------------------- effects ------------------------------ */

  /** A short lived sprite that faces the camera: a muzzle flash, a puff of dust. */
  puff(kind, x, y, z, size, life, r = 1, g = 1, b = 1) {
    const q = this.fx.alloc();
    if (q < 0) return;
    const c = UV[kind];
    this.fx.uvRect(q, c[0], c[1], c[2], c[3]);
    this.fxList.push({ q, x, y, z, size, life, t: 0, r, g, b, rot: rand(TAU), grow: kind === 'smoke' ? 1.6 : 0.3, vy: kind === 'smoke' ? 0.5 : 0 });
  }

  /* ---------------------------------- frame ------------------------------- */

  update(dt, camera) {
    const g = this.game, t = g.time;
    this._emit(dt, t);
    this._simulate(dt);
    this._flow(dt);
    // blood running down walls
    for (let i = this.runs.length - 1; i >= 0; i--) {
      const r = this.runs[i];
      if (this.gInfo[r.q] !== r.info) { this.runs.splice(i, 1); continue; }
      r.len = Math.min(r.max, r.len + r.v * dt);
      r.v *= Math.exp(-dt * 0.4);
      this._wallQuad(r.q, r);
      if (r.len >= r.max - 1e-3 || r.v < 0.008) {
        if (r.floor) { this._spawn(r.x + r.nx * 0.03, r.y - r.len + 0.015, r.z + r.nz * 0.03, r.nx * 0.05, -0.1, r.nz * 0.05, Math.min(3, r.ml * 0.6)); this.stats.drips++; }
        this.runs.splice(i, 1);
      }
    }
    if (this.enabled) this._dripBlades(dt);
    this._soakT += dt;
    if (this._soakT > 0.5) { this._soakT = 0; if (this.enabled) this._soakPools(); }
    this._trailT = (this._trailT || 0) + dt;
    if (this._trailT > 0.15) { this._trailT = 0; if (this.enabled) this._trails(); }
    this._dryT = (this._dryT || 0) + dt;
    if (this._dryT > 2) { this._dryT = 0; this._dry(); }
    this._drawDrops();
    this._moveDecals();

    // lumps
    for (let i = this.gibsList.length - 1; i >= 0; i--) {
      const o = this.gibsList[i], b = o.body;
      if (t - o.born > 28 || b.py < -5) { this._dropGib(i); continue; }
      g.boxes.set(o.idx, b.px, b.py, b.pz, b.qx, b.qy, b.qz, b.qw, b.hx * 2, b.hy * 2, b.hz * 2);
      // they leave a little wherever they first come down
      if (o.bled < 3 && b.hit > 1.5) { o.bled++; this._spawn(b.px, b.py + 0.02, b.pz, rand(-0.4, 0.4), 0.3, rand(-0.4, 0.4), 4); }
    }

    // sprites
    if (camera) {
      const e = camera.matrixWorld.elements;
      const rx = e[0], ry = e[1], rz = e[2], ux = e[4], uy = e[5], uz = e[6];
      for (let i = this.fxList.length - 1; i >= 0; i--) {
        const f = this.fxList[i];
        f.t += dt; f.y += f.vy * dt;
        const k = f.t / f.life;
        if (k >= 1) { this.fx.release(f.q); this.fxList.splice(i, 1); continue; }
        const s = f.size * (1 + f.grow * k) * 0.5;
        const c = Math.cos(f.rot), sn = Math.sin(f.rot);
        const ax = (rx * c + ux * sn) * s, ay = (ry * c + uy * sn) * s, az = (rz * c + uz * sn) * s;
        const bx = (-rx * sn + ux * c) * s, by = (-ry * sn + uy * c) * s, bz = (-rz * sn + uz * c) * s;
        this.fx.corners(f.q, f.x - ax - bx, f.y - ay - by, f.z - az - bz, f.x + ax - bx, f.y + ay - by, f.z + az - bz, f.x + ax + bx, f.y + ay + by, f.z + az + bz, f.x - ax + bx, f.y - ay + by, f.z - az + bz);
        this.fx.tint(f.q, f.r, f.g, f.b, 1 - k * k);
      }
    }

    // blood darkens as it dries
    this._tintT += dt;
    if (this._tintT > 1.5) {
      this._tintT = 0;
      for (let i = 0; i < this.ground.count; i++) {
        const info = this.gInfo[i];
        if (!info) continue;
        const dry = clamp01((t - info.born) / 90);
        const k = (1 - dry * 0.45) * (info.shade || 1);
        this.ground.tint(i, k, k * (1 - dry * 0.15), k * (1 - dry * 0.1), info.alpha);
      }
    }
    this.ground.commit(); this.body.commit(); this.fx.commit();
  }

  /** Lets blood out of every open wound. */
  _emit(dt, t) {
    const g = this.game;
    if (!this.enabled) return;
    let budget = 70;
    this.stats.streams = 0;
    for (const hm of g.humans) {
      if (hm.removed) continue;
      const h = hm.h;
      if (h.bleedOut <= 0.01) continue;
      // near enough to matter?
      const dx = hm.x - g.camX, dz = hm.z - g.camZ;
      if (dx * dx + dz * dz > 70 * 70) continue;
      // the pulse: a wave from zero to one, once a heartbeat
      const beat = h.heartStopped ? 0 : Math.pow(Math.max(0, Math.sin(t * h.pulse / 60 * TAU + hm.id)), 2);
      const pressure = h.heartStopped ? 0.12 : clamp(h.bloodPct / 100, 0.3, 1);
      for (const w of h.wounds) {
        if (!(w.flow > 0.03) || w.gone || hm.gone[w.part]) continue;
        const b = hm.bodies[w.part];
        const stream = w.flow > 3.2;
        w.acc = (w.acc || 0) + dt * (stream ? clamp(w.flow * 1.5, 16, 58) : clamp(w.flow * 1.8, 0.25, 5));
        if (w.acc < 1) continue;
        b.toWorld(w.x + w.nx * 0.012, w.y + w.ny * 0.012, w.z + w.nz * 0.012, _v);
        let nl = Math.hypot(w.nx, w.ny, w.nz) || 1;
        b.dirToWorld(w.nx / nl, w.ny / nl, w.nz / nl, _n);
        b.velocityAt(_v[0], _v[1], _v[2], _w);
        const n = Math.min(4, w.acc | 0, budget);
        if (n <= 0) continue;
        w.acc -= n; budget -= n;
        const rate = stream ? clamp(w.flow * 1.5, 16, 58) : clamp(w.flow * 1.8, 0.25, 5);
        const ml = w.flow / rate;
        if (stream) {
          this.stats.streams++;
          const sp = w.arterial ? (0.7 + 3.4 * beat) * pressure : (0.4 + 0.5 * beat) * pressure;
          let link = (w.last >= 0 && this.gen[w.last] === w.lastGen && this.life[w.last] > 0 && this.age[w.last] < 0.12) ? w.last : -1;
          for (let k = 0; k < n; k++) {
            const j = 0.12 * sp + 0.05;
            link = this._spawn(_v[0], _v[1], _v[2], _w[0] + _n[0] * sp + rand(-j, j), _w[1] + _n[1] * sp + rand(-j, j) + 0.25 * sp, _w[2] + _n[2] * sp + rand(-j, j), ml, 0, hm, link);
            // each drop is a little way along the path already, so the stream is unbroken
            const back = (k / n) * dt;
            this.px[link] += this.vx[link] * back; this.py[link] += this.vy[link] * back; this.pz[link] += this.vz[link] * back;
          }
          w.last = link; w.lastGen = this.gen[link];
        } else {
          // a slow bleed drips from wherever the blood running from it has got to
          const tip = this._tipOf(w);
          if (tip === RUNNING) { /* the blood is still running down them, not yet dripping off */ }
          else if (tip) { for (let k = 0; k < n; k++) { const j = this._spawn(tip[0], tip[1], tip[2], _w[0] + rand(-0.03, 0.03), _w[1] - 0.15, _w[2] + rand(-0.03, 0.03), ml, 0, hm); this.drip[j] = 1; } this.stats.drips += n; }
          else for (let k = 0; k < n; k++) this._spawn(_v[0], _v[1], _v[2], _w[0] + _n[0] * 0.25 + rand(-0.08, 0.08), _w[1] + _n[1] * 0.2, _w[2] + _n[2] * 0.25 + rand(-0.08, 0.08), ml, 0, hm);
          w.last = -1;
        }
        // blood runs down from a wound that keeps bleeding, and the cloth round it soaks
        w.lost = (w.lost || 0) + w.flow * dt;
        if (!w.runDone && w.age > 0.6 && w.type !== 'stump') {
          w.runDone = true;
          const d = this._bodyRun(hm, w.part, b, [w.x, w.y, w.z], [w.nx, w.ny, w.nz], 4 + w.flow * 3, 0, w);
          if (d) w.runTip = d;
        }
        if (hm.clothed[w.part] && w.lost > 0.6 && w.type !== 'stump') this._soakWound(hm, b, w);
        if (hm.soak) hm.soak[w.part] = Math.min(1, hm.soak[w.part] + w.flow * dt / (hm.clothed[w.part] ? 140 : 400));
      }
    }
  }

  _simulate(dt) {
    const g = this.game, world = g.world, humans = g.humans;
    const N = this.N;
    let live = 0;
    const half = (this._flip = !this._flip) ? 0 : 1;
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) continue;
      live++;
      this.life[i] -= dt; this.age[i] += dt;
      const ox = this.px[i], oy = this.py[i], oz = this.pz[i];
      this.vy[i] -= 9.81 * dt;
      const drag = 1 - 0.35 * dt;
      this.vx[i] *= drag; this.vz[i] *= drag;
      const x = this.px[i] = ox + this.vx[i] * dt, y = this.py[i] = oy + this.vy[i] * dt, z = this.pz[i] = oz + this.vz[i] * dt;
      // joined drops part when the stream has stretched too thin
      const p = this.prev[i];
      if (p >= 0) {
        if (this.life[p] <= 0 || this.gen[p] !== this.prevGen[i]) this.prev[i] = -1;
        else {
          const dx = this.px[p] - x, dy = this.py[p] - y, dz = this.pz[p] - z;
          if (dx * dx + dy * dy + dz * dz > BREAK * BREAK) { this.prev[i] = -1; this.stats.parted++; }
        }
      }
      const gy = groundHeight(x, z);
      if (y <= gy + 0.006) {
        this.py[i] = gy;
        this._land(i, Math.hypot(this.vx[i], this.vy[i], this.vz[i]));
        this.life[i] = 0;
        continue;
      }
      if (y < 60) {
        const s = world.staticAt(x, y, z);
        if (s) {
          // which wall did it come through?
          if (this.kind[i] === 0) {
            if (oy >= s.maxy) this._groundDecal(pick(UV.splat), x, s.maxy - 0.01, z, 0.16, 0.16, rand(TAU));
            else {
              let nx = 0, nz = 0, wx = x, wz = z;
              if (ox <= s.minx) { nx = -1; wx = s.minx; } else if (ox >= s.maxx) { nx = 1; wx = s.maxx; }
              else if (oz <= s.minz) { nz = -1; wz = s.minz; } else { nz = 1; wz = s.maxz; }
              const sz = clamp(0.1 + Math.cbrt(this.ml[i]) * 0.08, 0.1, 0.4);
              this._wallDecal(pick(Math.random() < 0.35 ? UV.drip : UV.splat), wx, y, wz, nx, nz, sz, sz * 1.25);
              // and anything more than a speck runs down from there
              if (this.ml[i] > 0.9) this._wallRun(wx, y - sz * 0.2, wz, nx, nz, this.ml[i]);
            }
          }
          this.life[i] = 0;
          continue;
        }
      }
      // people and things: half of the drops look each frame
      if ((i & 1) !== half || this.age[i] < 0.05) continue;
      let hitSomething = false;
      for (let k = 0; k < humans.length && !hitSomething; k++) {
        const hm = humans[k];
        if (hm.removed) continue;
        const dx = hm.x - x, dz = hm.z - z;
        if (dx * dx + dz * dz > 1.7) continue;
        if (this.owner[i] === hm && (this.age[i] < 0.3 || this.drip[i])) continue;
        for (let pi = 0; pi < hm.bodies.length; pi++) {
          if (hm.gone[pi]) continue;
          const b = hm.bodies[pi];
          const ex = x - b.px, ey = y - b.py, ez = z - b.pz;
          if (ex * ex + ey * ey + ez * ez > b.boundR * b.boundR) continue;
          b.toLocal(x, y, z, _v);
          if (Math.abs(_v[0]) > b.hx || Math.abs(_v[1]) > b.hy || Math.abs(_v[2]) > b.hz) continue;
          if (this.kind[i] === 0 && Math.random() < 0.6) {
            const face = nearestFace(_v, b);
            this.mark(hm, pi, this.ml[i] > 4 ? 'splat' : 'dot', [_v[0], _v[1], _v[2]], face, clamp(0.035 + Math.cbrt(this.ml[i]) * 0.035, 0.04, 0.13));
            if (this.ml[i] > 1.4 && this.owner[i] !== hm) this._bodyRun(hm, pi, b, [_v[0], _v[1], _v[2]], face, this.ml[i]);
            if (hm.soak && hm.clothed[pi]) hm.soak[pi] = Math.min(1, hm.soak[pi] + this.ml[i] / 260);
            if (this.owner[i] !== hm) { hm.bloodied = Math.min(1, hm.bloodied + 0.02); hm.mind?.splashed(this.owner[i]); this.stats.onPeople++; }
          }
          hitSomething = true;
          break;
        }
      }
      if (!hitSomething && this.kind[i] === 0 && this._dropOnItems(x, y, z, this.ml[i])) hitSomething = true;
      if (!hitSomething) {
        for (const o of g.props) {
          const b = o.body;
          const ex = x - b.px, ey = y - b.py, ez = z - b.pz;
          if (ex * ex + ey * ey + ez * ez > b.boundR * b.boundR) continue;
          b.toLocal(x, y, z, _v);
          if (Math.abs(_v[0]) > b.hx || Math.abs(_v[1]) > b.hy || Math.abs(_v[2]) > b.hz) continue;
          if (o.kind === 'weapon') {
            // a weapon on the ground takes blood on its own surfaces, not on the box round it
            if (this.kind[i] === 0 && o.item && o.item.skin && Math.random() < 0.6) this.smear(o.item, 1);
          } else if (this.kind[i] === 0 && Math.random() < 0.5) {
            const face = nearestFace(_v, b);
            const d = this._attach(b, this._onFace(b, [_v[0], _v[1], _v[2]], face, 0.14, 0.14, rand(TAU)), pick(UV.splat), null, -1);
            if (d) d.stain = true;
            if (this.ml[i] > 1.2) this._bodyRun(null, -1, b, [_v[0], _v[1], _v[2]], face, this.ml[i] * 1.4);
          }
          hitSomething = true;
          break;
        }
      }
      // a car: blood on the paint, or the glass, wherever on it the drop actually lands
      if (!hitSomething && g.traffic) {
        const vv = Math.hypot(this.vx[i], this.vy[i], this.vz[i]) || 1, reach = vv * dt * 2 + 0.06;
        for (const c of g.traffic.cars) {
          if ((c.x - x) ** 2 + (c.z - z) ** 2 > 8) continue;
          const t = c.ray(x - this.vx[i] * dt * 2, y - this.vy[i] * dt * 2, z - this.vz[i] * dt * 2, this.vx[i] / vv, this.vy[i] / vv, this.vz[i] / vv, reach, _carHit);
          if (t < 0 || _carHit.glass === -2) continue;
          if (this.kind[i] === 0 && Math.random() < 0.7) {
            const sz = clamp(0.06 + Math.cbrt(this.ml[i]) * 0.06, 0.06, 0.3);
            const d = this._attach(c.body, carDecal(c, _carHit.lp, _carHit.ln, sz, sz, rand(TAU), 0.008 + Math.random() * 0.004), pick(_carHit.ln[1] < 0.5 && Math.random() < 0.4 ? UV.drip : UV.splat), null, -1);
            if (d) d.stain = true;
            this.stats.onCars = (this.stats.onCars || 0) + 1;
          }
          hitSomething = true;
          break;
        }
      }
      if (hitSomething) this.life[i] = 0;
    }
    this.live = live;
  }

  /** Somebody bleeding, dragged or crawling along the ground, leaves a smear the way they went. */
  _trails() {
    const g = this.game;
    for (const hm of g.humans) {
      if (hm.removed || hm.state !== 2 || hm.h.god || !(hm.h.bleedOut > 0.35)) continue;
      // the lowest part that is bleeding
      let b = null;
      for (const w of hm.h.wounds) { if (w.flow > 0.05 && !w.gone && !hm.gone[w.part]) { const pb = hm.bodies[w.part]; if (!b || pb.py < b.py) b = pb; } }
      if (!b) continue;
      const gy = groundHeight(b.px, b.pz);
      if (b.py - gy > b.boundR + 0.05) { hm._trail = null; continue; }
      const last = hm._trail;
      if (!last) { hm._trail = { x: b.px, z: b.pz }; continue; }
      const dx = b.px - last.x, dz = b.pz - last.z, d = Math.hypot(dx, dz);
      if (d < 0.26) continue;
      const lx = last.x, lz = last.z;
      last.x = b.px; last.z = b.pz;
      if (d > 2.5) continue;                       // flung, not dragged
      // an unbroken smear from where they were to where they are now
      const a = clamp(hm.h.bleedOut / 5, 0.35, 0.9), n = Math.ceil(d / 0.4), rot = Math.atan2(-dx, dz);
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n;
        this._groundDecal(pick(UV.smear), lx + dx * u, gy, lz + dz * u, rand(0.22, 0.32), (d / n) * 1.5 + 0.08, rot + rand(-0.12, 0.12), a * rand(0.8, 1));
        this.stats.trails = (this.stats.trails || 0) + 1;
      }
    }
  }

  /** Blood on the ground goes dark as it dries: brown-black at the edges first, in a few minutes all of it. */
  _dry() {
    const now = this.game.time, G = this.ground;
    for (let i = 0; i < G.count; i++) {
      const info = this.gInfo[i];
      if (!info || !info.blood) continue;
      const age = now - info.born;
      if (age < 25) continue;
      const k = clamp((age - 25) / 200, 0, 1);
      if (Math.abs(k - (info.dry || 0)) < 0.04) continue;
      info.dry = k;
      G.tint(i, 1 - 0.5 * k, 1 - 0.62 * k, 1 - 0.6 * k, info.alpha);
    }
  }

  _drawDrops() {
    const N = this.N, dm = this.drops.instanceMatrix.array, lm = this.links.instanceMatrix.array;
    const dc = this.drops.instanceColor.array, lc = this.links.instanceColor.array;
    let nd = 0, nl = 0;
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) continue;
      const x = this.px[i], y = this.py[i], z = this.pz[i], r = this.rad[i];
      const col = this.kind[i] === 1 ? this.vomitCol : this.blood;
      const p = this.prev[i];
      if (p >= 0) {
        // a length of the stream, from this drop back to the one before it
        _d.set(this.px[p] - x, this.py[p] - y, this.pz[p] - z);
        const len = _d.length();
        if (len > 1e-4) {
          _q.setFromUnitVectors(_z, _d.multiplyScalar(1 / len));
          // it keeps its volume: longer means thinner
          const rr = r * 0.82 * Math.min(1, Math.sqrt(0.05 / Math.max(0.05, len)) * 1.15);
          _m.compose(_p.set((x + this.px[p]) * 0.5, (y + this.py[p]) * 0.5, (z + this.pz[p]) * 0.5), _q, _s.set(rr, rr, len));
          _m.toArray(lm, nl * 16);
          lc[nl * 3] = col[0]; lc[nl * 3 + 1] = col[1]; lc[nl * 3 + 2] = col[2];
          nl++;
        }
      }
      // the drop itself, drawn out along the way it is going
      const sp = Math.hypot(this.vx[i], this.vy[i], this.vz[i]);
      if (sp > 0.3) { _d.set(this.vx[i] / sp, this.vy[i] / sp, this.vz[i] / sp); _q.setFromUnitVectors(_z, _d); } else _q.identity();
      const stretch = p >= 0 ? 1 : 1 + Math.min(1.6, sp * 0.11);
      const rr = p >= 0 ? r * 0.8 : r;
      _m.compose(_p.set(x, y, z), _q, _s.set(rr, rr, rr * stretch));
      _m.toArray(dm, nd * 16);
      dc[nd * 3] = col[0]; dc[nd * 3 + 1] = col[1]; dc[nd * 3 + 2] = col[2];
      nd++;
    }
    this.drops.count = nd; this.links.count = nl;
    this.drops.instanceMatrix.needsUpdate = true; this.links.instanceMatrix.needsUpdate = true;
    this.drops.instanceColor.needsUpdate = true; this.links.instanceColor.needsUpdate = true;
  }

  _moveDecals() {
    const B = this.body;
    for (let i = this.bDecals.length - 1; i >= 0; i--) {
      const d = this.bDecals[i], b = d.body, c = d.c;
      if (d.human && d.human.removed) { this._detach(i); continue; }
      // a run of blood lengthens, slowing as it thins; one fed by an open wound keeps going
      if (d.run) {
        const r = d.run, dt = this.game.dt;
        const fed = r.wound && r.wound.flow > 0.05 && !r.wound.gone;
        // a wound that goes on bleeding goes on feeding the end of its run, on down to the edge of the cloth and over it
        if (fed && !d.next && !r.edge && r.len >= r.max - 1e-4 && r.max < r.reach) r.max = Math.min(r.reach, r.max + r.wound.flow * dt * 0.006);
        if (r.len < r.max - 1e-4) {
          r.v = fed ? Math.max(r.v, 0.05 + Math.min(0.25, r.wound.flow * 0.04)) : r.v * Math.exp(-dt * 0.45);
          if (r.v > 0.006) {
            r.len = Math.min(r.max, r.len + r.v * dt);
            d.c = this._runCorners(b, r.lp, r.dir, r.face, r.w, r.len);
            d.settled = false;
            if (r.len >= r.max - 1e-4) { if (r.max >= r.reach - 1e-4) r.edge = true; this._runEnd(d); }
          }
        }
      }
      if (b.item && !b.item.shown) { if (!d.hidden) { B.hide(d.quad); d.hidden = true; } continue; }
      d.hidden = false;
      const asleep = b.island && b.island.sleeping;
      if (asleep && d.settled) continue;
      d.settled = asleep;
      b.toWorld(c[0], c[1], c[2], _v); const ax = _v[0], ay = _v[1], az = _v[2];
      b.toWorld(c[3], c[4], c[5], _v); const bx = _v[0], by = _v[1], bz = _v[2];
      b.toWorld(c[6], c[7], c[8], _v); const cx = _v[0], cy = _v[1], cz = _v[2];
      b.toWorld(c[9], c[10], c[11], _v);
      B.corners(d.quad, ax, ay, az, bx, by, bz, cx, cy, cz, _v[0], _v[1], _v[2]);
    }
  }
}

const _tip = [0, 0, 0];
const RUNNING = [];

/** The axis a direction lies nearest, as a unit face normal. */
function nearestAxis(v) {
  const ax = Math.abs(v[0]), ay = Math.abs(v[1]), az = Math.abs(v[2]);
  if (ax >= ay && ax >= az) return [v[0] < 0 ? -1 : 1, 0, 0];
  if (ay >= az) return [0, v[1] < 0 ? -1 : 1, 0];
  return [0, 0, v[2] < 0 ? -1 : 1];
}

function nearestFace(l, b) {
  const dx = b.hx - Math.abs(l[0]), dy = b.hy - Math.abs(l[1]), dz = b.hz - Math.abs(l[2]);
  if (dx <= dy && dx <= dz) return [l[0] < 0 ? -1 : 1, 0, 0];
  if (dy <= dz) return [0, l[1] < 0 ? -1 : 1, 0];
  return [0, 0, l[2] < 0 ? -1 : 1];
}
