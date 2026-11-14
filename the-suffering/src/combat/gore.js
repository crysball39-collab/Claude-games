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
   ========================================================================== */
import * as THREE from 'three';
import { Quads, cellUV } from '../render/quads.js';
import { DECAL, ATLAS_COLS, ATLAS_ROWS } from '../render/textures.js';
import { Body, Island } from '../physics/world.js';
import { groundHeight } from '../world/city.js';
import { P, PARTS } from '../human/rig.js';
import { rgb } from '../render/boxes.js';
import { clamp, clamp01, rand, pick, TAU, chance } from '../core/util.js';

const uv = (c) => cellUV(c[0], c[1], ATLAS_COLS, ATLAS_ROWS);
const UV = {};
for (const k in DECAL) UV[k] = Array.isArray(DECAL[k][0]) ? DECAL[k].map(uv) : uv(DECAL[k]);

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
    this.fx = new Quads(scene, 96, game.atlas, { offset: 0, renderOrder: 6, alphaTest: 0.01 });
    this.fxList = [];

    /* ---- lumps ---- */
    this.gibsList = [];
    this.maxGibs = 54;
    this.stats = { emitted: 0, landed: 0, parted: 0, streams: 0, merged: 0, onWeapons: 0, onPeople: 0, satellites: 0 };
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
    const cell = kind === 'entry' ? UV.entry : kind === 'bruise' ? UV.bruise : kind === 'slash' ? UV.slash : kind === 'dot' ? UV.dot : pick(UV.splat);
    const d = this._attach(b, this._onFace(b, lp, ln, size, size, rand(TAU), lift), cell, human, part);
    if (d && (kind === 'dot' || kind === 'splat')) d.stain = true;
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
    this.gInfo[i] = { born: this.game.time, alpha, pool: null, x, y, z, rot, wall: false };
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
    this.gInfo[i] = { born: this.game.time, alpha: 1, pool: null, wall: true };
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
    for (let i = 0; i < this.ground.capacity; i++) { this.ground.hide(i); this.gInfo[i] = null; }
    this.pools.length = 0; this.flowing.clear(); this.drains.length = 0;
    for (let i = 0; i < this.N; i++) this.life[i] = 0;
    for (let i = this.bDecals.length - 1; i >= 0; i--) if (this.bDecals[i].stain) this._detach(i);
  }

  /* ---------------------------------- lumps ------------------------------- */

  gibs(x, y, z, vel, size, skinHex, clothHex) {
    const g = this.game, n = 5 + ((Math.random() * 4) | 0);
    const colours = [0x7a0e0e, 0x5c0808, 0x8f1818, skinHex, clothHex, 0xe9e2d0, 0x7a0e0e];
    for (let i = 0; i < n; i++) {
      while (this.gibsList.length >= this.maxGibs) this._dropGib(0);
      const s = rand(0.035, 0.085);
      const b = new Body({
        hx: s * rand(0.6, 1.3), hy: s * rand(0.5, 1), hz: s * rand(0.6, 1.3), mass: 0.25,
        x: x + rand(-1, 1) * size[0] * 0.4, y: y + rand(-1, 1) * size[1] * 0.4, z: z + rand(-1, 1) * size[2] * 0.4,
        kind: 'gib', friction: 0.9, linDamp: 0.1, angDamp: 1.2, inertiaFloor: 0.0006,
      });
      b.vx = vel[0] + rand(-3, 3); b.vy = vel[1] + rand(0.5, 4.5); b.vz = vel[2] + rand(-3, 3);
      b.wx = rand(-14, 14); b.wy = rand(-14, 14); b.wz = rand(-14, 14);
      const isl = new Island(null); isl.add(b);
      g.world.addIsland(isl);
      const idx = g.boxes.alloc();
      g.boxes.colorHex(idx, colours[i % colours.length]);
      this.gibsList.push({ body: b, island: isl, idx, born: g.time, bled: 0 });
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
          for (let k = 0; k < n; k++) this._spawn(_v[0], _v[1], _v[2], _w[0] + _n[0] * 0.25 + rand(-0.08, 0.08), _w[1] + _n[1] * 0.2, _w[2] + _n[2] * 0.25 + rand(-0.08, 0.08), ml, 0, hm);
          w.last = -1;
        }
        // blood runs down from a wound that keeps bleeding
        if (!w.runDone && w.age > 0.8 && w.type !== 'stump' && Math.abs(w.ny) < 0.5) {
          w.runDone = true;
          const d = this._attach(b, this._onFace(b, [w.x, w.y - 0.05, w.z], [w.nx, w.ny, w.nz], 0.07, 0.11, 0), pick(UV.drip), hm, w.part);
          if (d) { d.grow = 1; d.wound = w; d.top = w.y; }
        }
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
        if (this.owner[i] === hm && this.age[i] < 0.3) continue;
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
          }
          hitSomething = true;
          break;
        }
      }
      if (hitSomething) this.life[i] = 0;
    }
    this.live = live;
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
      // a run of blood lengthens while the wound it comes from is still open
      if (d.grow && d.wound) {
        if (d.wound.flow > 0.05 && d.grow < 4) {
          d.grow += this.game.dt * (0.25 + d.wound.flow * 0.05);
          const w = d.wound, len = Math.min(0.11 * d.grow, w.y + b.hy);
          if (len > 0.03) d.c = this._onFace(b, [w.x, w.y - len * 0.5, w.z], [w.nx, w.ny, w.nz], 0.05 + d.grow * 0.012, len, 0);
          d.settled = false;
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

function nearestFace(l, b) {
  const dx = b.hx - Math.abs(l[0]), dy = b.hy - Math.abs(l[1]), dz = b.hz - Math.abs(l[2]);
  if (dx <= dy && dx <= dz) return [l[0] < 0 ? -1 : 1, 0, 0];
  if (dy <= dz) return [0, l[1] < 0 ? -1 : 1, 0];
  return [0, 0, l[2] < 0 ? -1 : 1];
}
