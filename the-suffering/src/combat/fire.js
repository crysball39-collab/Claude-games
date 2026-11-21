/* =============================================================================
   Fire.

   A flamethrower throws a stream of burning fuel: it arcs down as it goes,
   spreads where it lands, and burns on the ground for a few seconds where it
   pools. Whatever it touches catches. A person's clothes and skin burn part
   by part, the flames creep from one part to the next, and they burn until
   the fuel on them is spent or they put it out, which rolling on the ground
   does fastest. Wood chars and catches: a crate burns for half a minute and
   falls apart; a wooden wall burns cube by cube, upward. Steel only gets hot.

   Every flame is a sprite drawn added on to what is behind it, so a crowd of
   them glows; the biggest fires near the camera also get a real light.
   ========================================================================== */
import * as THREE from 'three';
import { Quads, cellUV } from '../render/quads.js';
import { DECAL, ATLAS_COLS, ATLAS_ROWS } from '../render/textures.js';
import { groundHeight } from '../world/city.js';
import { P, PART_COUNT, PARTS } from '../human/rig.js';
import { ST } from '../human/human.js';
import { clamp, clamp01, rand, chance, TAU } from '../core/util.js';

const FLAME_UV = DECAL.flame.map((c) => cellUV(c[0], c[1], ATLAS_COLS, ATLAS_ROWS));
const EMBER_UV = cellUV(DECAL.ember[0], DECAL.ember[1], ATLAS_COLS, ATLAS_ROWS);
const SCORCH_UV = cellUV(DECAL.scorch[0], DECAL.scorch[1], ATLAS_COLS, ATLAS_ROWS);
const MAX = 640;
/** The parts each part touches: fire spreads along these. */
const NEXT = [[1, 11, 14], [0, 2], [1, 3, 5, 8], [2, 4], [3], [2, 6], [5, 7], [6], [2, 9], [8, 10], [9], [0, 12], [11, 13], [12], [0, 15], [14, 16], [15]];
const _a = [0, 0, 0];

export class Fire {
  constructor(game) {
    this.g = game;
    this.q = new Quads(game.scene, MAX, game.atlas, { offset: 0, renderOrder: 7, alphaTest: 0.003 });
    this.q.material.blending = THREE.AdditiveBlending;
    this.n = 0;
    const F = () => new Float32Array(MAX);
    this.x = F(); this.y = F(); this.z = F(); this.vx = F(); this.vy = F(); this.vz = F();
    this.life = F(); this.max = F(); this.size = F(); this.grow = F();
    this.kind = new Uint8Array(MAX);      // 0 a jet of burning fuel, 1 a flame licking up off something, 2 a pilot light
    this.cell = new Uint8Array(MAX);
    this.who = new Array(MAX).fill(null);  // who threw it, for the blame
    this.people = new Set();
    this.crates = new Set();
    this.patches = [];
    this.check = 0;
    this.stats = { emitted: 0, ignited: 0, people: 0, crates: 0, patches: 0, wood: 0 };
  }

  _add(kind, x, y, z, vx, vy, vz, life, size, grow, who) {
    if (this.n >= MAX) return -1;
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.z[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.grow[i] = grow;
    this.kind[i] = kind; this.cell[i] = (Math.random() * 3) | 0; this.who[i] = who;
    this.stats.emitted++;
    return i;
  }
  _kill(i) {
    const j = --this.n;
    if (i === j) { this.who[j] = null; return; }
    this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.z[i] = this.z[j]; this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
    this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.size[i] = this.size[j]; this.grow[i] = this.grow[j];
    this.kind[i] = this.kind[j]; this.cell[i] = this.cell[j]; this.who[i] = this.who[j]; this.who[j] = null;
  }

  /* ---------------------------------- making -------------------------------- */

  /** One frame of a flamethrower: burning fuel out of the nozzle along (dx,dy,dz). */
  spray(who, mx, my, mz, dx, dy, dz, dt) {
    const n = Math.max(1, Math.round(dt * 75));
    for (let k = 0; k < n; k++) {
      const sp = rand(11, 14), s = 0.07;
      const ox = dx + rand(-s, s), oy = dy + rand(-s, s), oz = dz + rand(-s, s);
      // spread along this frame's path so the stream is unbroken
      const back = (k / n) * dt * sp;
      this._add(0, mx + ox * back, my + oy * back, mz + oz * back, ox * sp + (who ? who.vx : 0), oy * sp, oz * sp + (who ? who.vz : 0), rand(0.5, 0.68), 0.16, 1.25, who);
    }
  }
  /** A flame licking up off something burning. */
  flameAt(x, y, z, size = 0.25, who = null) {
    this._add(1, x + rand(-0.03, 0.03), y, z + rand(-0.03, 0.03), rand(-0.15, 0.15), rand(0.6, 1.3), rand(-0.15, 0.15), rand(0.35, 0.7), size * 0.6, size * 1.2, who);
  }
  /** The flamethrower's pilot light: a small blue-white flame at the nozzle. */
  pilot(x, y, z) { this._add(2, x, y, z, 0, 0.25, 0, 0.07, 0.035, 0.2, null); }

  /* -------------------------------- catching -------------------------------- */

  /** A part of somebody catches (or burns harder). */
  ignite(h, part, amount, who = null, weapon = 'flamethrower') {
    if (!h || h.removed || h.gone[part]) return;
    // another player: theirs to catch fire, on their own screen
    if (h.puppet) { this.g.mp?.burnRemote(h, part, amount, who, weapon); return; }
    if (h.h.god) return;
    if (!h.fire) { h.fire = new Float32Array(PART_COUNT); h.burning = 0; }
    const first = !this.people.has(h);
    h.fire[part] = Math.min(1, h.fire[part] + amount);
    if (first) {
      this.people.add(h);
      this.stats.people++;
      h.fireBy = who; h.fireT = 0;
      const b = h.bodies[part];
      this.g.audio?.at('whump', b.px, b.py, b.pz, 0.7);
      // the moment it catches: pain, terror, and anyone watching sees it
      if (h.mind) h.mind.feel(part, 'burn', { pain: 30, bones: [], ko: false }, who && who !== h ? who : null, weapon);
      if (who && who !== h) this.g.minds?.witness({ kind: 'attack', actor: who, victim: h, weapon, part, x: b.px, y: b.py, z: b.pz, rep: { pain: 30, bones: [] } });
      this.g.minds?.witness({ kind: 'fire', victim: h, x: b.px, y: b.py, z: b.pz });
    }
  }

  /** A crate catches. */
  igniteCrate(o, amount = 0.1) {
    o.heat = (o.heat || 0) + amount;
    if (o.heat > 1 && !o.fire) { o.fire = { t: 0 }; this.crates.add(o); this.stats.crates++; this.g.audio?.at('whump', o.body.px, o.body.py, o.body.pz, 0.5); }
  }

  /** Burning fuel pooled on the ground. */
  patch(x, y, z, r = 0.3, life = rand(3, 6), who = null) {
    if (this.patches.length > 40) this.patches.shift();
    this.patches.push({ x, y, z, r, life, who });
    this.stats.patches++;
    if (chance(0.5)) this.g.gore._groundDecal(SCORCH_UV, x, y + 0.012, z, r * 2.6, r * 2.6, rand(TAU), 0.8);
  }

  /* ---------------------------------- frame --------------------------------- */

  update(dt) {
    const g = this.g;
    this.check = (this.check + 1) & 1;
    // a flamethrower in somebody's hands keeps its pilot light lit
    const e = g.weapons && g.weapons.equipped, p = g.player;
    if (e && e.def.flame && p.weapon === e && !p.swap && e.ammo > 0 && e.muzzleWorld) this.pilot(e.muzzleWorld[0], e.muzzleWorld[1], e.muzzleWorld[2]);
    this._particles(dt);
    this._people(dt);
    this._crates(dt);
    this._patches(dt);
    this._draw();
  }

  _particles(dt) {
    const g = this.g, world = g.world;
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this._kill(i); continue; }
      const k = this.kind[i];
      if (k === 0) {
        // burning fuel: a heavy stream that slows and falls, while the flame round it rises off it
        const drag = Math.exp(-dt * 1.5);
        this.vx[i] *= drag; this.vz[i] *= drag; this.vy[i] = this.vy[i] * drag - 3.2 * dt;
      } else { this.vy[i] += 0.6 * dt; this.vx[i] *= 0.97; this.vz[i] *= 0.97; }
      const ox = this.x[i], oz = this.z[i];
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt; this.z[i] += this.vz[i] * dt;
      if (k !== 0 || (i & 1) !== this.check) continue;
      const x = this.x[i], y = this.y[i], z = this.z[i], who = this.who[i];
      // the ground: it splashes, and a little pools and burns there
      const gy = groundHeight(x, z);
      if (y < gy + 0.04) {
        this.y[i] = gy + 0.04; this.vy[i] = 0; this.vx[i] *= 0.35; this.vz[i] *= 0.35;
        this.kind[i] = 1; this.life[i] = Math.min(this.life[i], 0.45);
        if (chance(0.06)) this.patch(x, gy, z, rand(0.22, 0.4), rand(3, 6), who);
        continue;
      }
      // a wall
      const s = world.staticAt(x, y, z);
      if (s) {
        this.x[i] = ox; this.z[i] = oz; this.vx[i] *= -0.1; this.vz[i] *= -0.1; this.vy[i] = Math.abs(this.vy[i]) * 0.3 + 0.5;
        this.kind[i] = 1; this.life[i] = Math.min(this.life[i], 0.4);
        if (chance(0.04)) {
          let nx = 0, nz = 0, wx = x, wz = z;
          if (ox <= s.minx) { nx = -1; wx = s.minx; } else if (ox >= s.maxx) { nx = 1; wx = s.maxx; } else if (oz <= s.minz) { nz = -1; wz = s.minz; } else { nz = 1; wz = s.maxz; }
          if (nx || nz) g.gore._wallDecal(SCORCH_UV, wx, y, wz, nx, nz, rand(0.4, 0.8), rand(0.5, 0.9));
        }
        continue;
      }
      // people
      let hit = false;
      for (const h of g.humans) {
        if (h.removed) continue;
        const c = h.bodies[P.CHEST];
        if ((c.px - x) ** 2 + (c.py - y) ** 2 + (c.pz - z) ** 2 > 1.6) continue;
        // the one holding the nozzle is behind the flame, not in it
        if (h === who && this.max[i] - this.life[i] < 0.12) continue;
        for (let p = 0; p < PART_COUNT; p++) {
          if (h.gone[p]) continue;
          const b = h.bodies[p];
          b.toLocal(x, y, z, _a);
          if (Math.abs(_a[0]) > b.hx + 0.07 || Math.abs(_a[1]) > b.hy + 0.07 || Math.abs(_a[2]) > b.hz + 0.07) continue;
          this.ignite(h, p, 0.22, who);
          h.h.burn(p, 1.4, h.clothed[p]);
          hit = true;
          break;
        }
        if (hit) break;
      }
      if (hit) { this.kind[i] = 1; this.vx[i] *= 0.2; this.vz[i] *= 0.2; this.vy[i] = 0.8; this.life[i] = Math.min(this.life[i], 0.35); continue; }
      // crates, walls and beams, lamps
      for (const o of g.props) {
        const b = o.body;
        if ((b.px - x) ** 2 + (b.py - y) ** 2 + (b.pz - z) ** 2 > b.boundR * b.boundR) continue;
        b.toLocal(x, y, z, _a);
        if (Math.abs(_a[0]) > b.hx + 0.02 || Math.abs(_a[1]) > b.hy + 0.02 || Math.abs(_a[2]) > b.hz + 0.02) continue;
        if (o.vox) {
          const v = o.vox;
          // which cube: the nearest solid one to the point
          const c = this._cellAt(v, _a);
          if (c < 0) continue;
          v.heatUp(c, 0.6);
          this.stats.wood += v.mat === 'wood' ? 1 : 0;
        } else if (o.kind === 'crate') this.igniteCrate(o, 0.05);
        else if (o.thing && o.thing.type === 'bulb' && chance(0.1)) g.things?.smash(o.thing);
        hit = true;
        break;
      }
      if (hit) { this.kind[i] = 1; this.vx[i] *= -0.1; this.vz[i] *= -0.1; this.vy[i] = 0.6; this.life[i] = Math.min(this.life[i], 0.35); continue; }
      // a car: burning fuel on the paint, and in through a broken window; enough of it and the car is alight
      if (g.traffic) for (const c of g.traffic.cars) {
        if ((c.x - x) ** 2 + (c.z - z) ** 2 > 7) continue;
        c.toLocal(x, y, z, _a);
        if (Math.abs(_a[0]) > 0.95 || Math.abs(_a[2]) > 2.2 || _a[1] < 0.2 || _a[1] > (c.van ? 1.65 : 1.55)) continue;
        g.traffic.heat(c, 0.012, who);
        // whoever is sitting inside catches too, if the glass is not there to keep it off
        for (const h of c.seats) if (h && chance(0.08) && c.windows.some((w) => w && w.broken)) this.ignite(h, (Math.random() * PART_COUNT) | 0, 0.15, who);
        hit = true;
        break;
      }
      if (hit) { this.kind[i] = 1; this.vx[i] *= -0.1; this.vz[i] *= -0.1; this.vy[i] = 0.7; this.life[i] = Math.min(this.life[i], 0.4); }
    }
  }

  /** The solid cube of a voxel thing at (or right next to) a point in its own space; -1 if none. */
  _cellAt(v, lp) {
    const cs = v.cs;
    const gx = lp[0] + v.cx, gy = lp[1] + v.cy, gz = lp[2] + v.cz;
    const i0 = Math.floor(gx / cs[0]), j0 = Math.floor(gy / cs[1]), k0 = Math.floor(gz / cs[2]);
    for (let r = 0; r <= 1; r++) {
      for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) for (let dk = -r; dk <= r; dk++) {
        const i = i0 + di, j = j0 + dj, k = k0 + dk;
        if (i < 0 || j < 0 || k < 0 || i >= v.nx || j >= v.ny || k >= v.nz) continue;
        const c = v.idx(i, j, k);
        if (v.cells[c]) return c;
      }
    }
    return -1;
  }

  /** Everyone who is on fire. */
  _people(dt) {
    const g = this.g;
    for (const h of [...this.people]) {
      if (h.removed || !h.fire) { this.people.delete(h); continue; }
      const down = h.state === ST.RAGDOLL;
      // rolling on the ground smothers it
      let roll = 0;
      if (down) {
        const c = h.bodies[P.CHEST];
        roll = clamp01(Math.hypot(c.wx, c.wy, c.wz) / 4);
        if (h.rollT > 0) this._roll(h, dt);
      }
      let total = 0;
      for (let p = 0; p < PART_COUNT; p++) {
        const f = h.fire[p];
        if (f <= 0) continue;
        if (h.gone[p]) { h.fire[p] = 0; continue; }
        h.h.burn(p, f * 14 * dt, h.clothed[p]);
        for (const q of NEXT[p]) if (!h.gone[q] && h.fire[q] < f && chance(dt * 0.55 * f)) h.fire[q] = Math.min(1, h.fire[q] + 0.3);
        h.fire[p] = Math.max(0, f - dt * (0.065 + roll * 0.45 + (down ? 0.03 : 0)));
        total += h.fire[p];
        if (chance(dt * 30 * f)) {
          const b = h.bodies[p];
          b.toWorld(rand(-b.hx, b.hx), rand(-b.hy, b.hy), rand(-b.hz, b.hz), _a);
          this.flameAt(_a[0], _a[1], _a[2], 0.18 + f * 0.2, h);
        }
      }
      h.burning = total;
      h.fireT = (h.fireT || 0) + dt;
      if (total < 0.02) {
        this.people.delete(h);
        h.fire = null; h.burning = 0; h.rollT = 0;
        if (h.mind && h.h.alive && h.h.conscious) { h.mind.note('felt', 'fireOut', 'the flames on me went out', 0.8); h.mind.ask('burned', 70, null, 0.6); }
        if (down) h.stayDown = false;
        continue;
      }
      const c = h.bodies[P.CHEST];
      g.audio?.loop('burn' + h.id, 'fire', c.px, c.py, c.pz, 0.5 + Math.min(1, total * 0.25));
      g.lights?.ask('point', c.px, c.py + 0.2, c.pz, 0xff8a30, 3 + total * 0.9 + rand(-0.6, 0.6), 7);
      if (chance(dt * 3)) g.gore.puff('smoke', c.px + rand(-0.2, 0.2), c.py + 0.4, c.pz + rand(-0.2, 0.2), 0.35, 1.4, 0.18, 0.17, 0.16);
    }
  }

  /** Somebody on the ground rolling to put themselves out: over and back along their own length. */
  _roll(h, dt) {
    h.rollT -= dt;
    const dir = Math.sin(this.g.time * 2.6 + h.id) > 0 ? 1 : -1;
    for (const p of [P.PELVIS, P.ABDOMEN, P.CHEST]) {
      const b = h.bodies[p];
      b.dirToWorld(0, 1, 0, _a);
      const k = 5.5 * dir;
      b.wx += (_a[0] * k - b.wx) * 0.2; b.wy += (_a[1] * k - b.wy) * 0.2; b.wz += (_a[2] * k - b.wz) * 0.2;
    }
    if (h.island && h.island.sleeping) h.island.wake();
  }

  _crates(dt) {
    const g = this.g;
    for (const o of [...this.crates]) {
      if (o.removed || !g.props.includes(o)) { this.crates.delete(o); continue; }
      const b = o.body, f = o.fire;
      f.t += dt;
      const k = 1 - Math.min(0.88, f.t / 28);
      g.crateBoxes.color(o.idx, k, k * 0.92, k * 0.85);
      const n = chance(dt * 18) ? 1 : 0;
      for (let i = 0; i < n + (chance(dt * 10) ? 1 : 0); i++) {
        b.toWorld(rand(-b.hx, b.hx), b.hy * rand(0.2, 1), rand(-b.hz, b.hz), _a);
        this.flameAt(_a[0], _a[1], _a[2], 0.3 + Math.min(0.3, f.t / 40), null);
      }
      g.audio?.loop('crate' + b.id, 'fire', b.px, b.py, b.pz, 0.7);
      g.lights?.ask('point', b.px, b.py + b.hy + 0.3, b.pz, 0xff8a30, 5 + rand(-1, 1), 8);
      if (chance(dt * 2)) g.gore.puff('smoke', b.px, b.py + b.hy + 0.5, b.pz, 0.5, 2, 0.2, 0.19, 0.18);
      // anyone leaning on it catches too
      for (const h of g.humans) {
        if (h.removed || Math.hypot(h.x - b.px, h.z - b.pz) > b.boundR + 0.35) continue;
        for (const p of [P.SHIN_L, P.SHIN_R, P.FARM_L, P.FARM_R]) {
          const pb = h.bodies[p];
          b.toLocal(pb.px, pb.py, pb.pz, _a);
          if (Math.abs(_a[0]) < b.hx + 0.12 && Math.abs(_a[1]) < b.hy + 0.12 && Math.abs(_a[2]) < b.hz + 0.12 && chance(dt * 1.5)) this.ignite(h, p, 0.3, null);
        }
      }
      // burnt through: it falls apart
      if (f.t > 32) {
        if (g.voxels) for (let i = 0; i < 26; i++) { b.toWorld(rand(-b.hx, b.hx), rand(-b.hy, b.hy), rand(-b.hz, b.hz), _a); g.voxels.chip(_a[0], _a[1], _a[2], rand(-1, 1), rand(0, 1.5), rand(-1, 1), CHAR, CHAR_COL, 0); }
        g.audio?.at('splinter', b.px, b.py, b.pz, 0.9);
        this.patch(b.px, groundHeight(b.px, b.pz), b.pz, 0.5, 5, null);
        this.crates.delete(o);
        g.removeProp(o);
      }
    }
  }

  _patches(dt) {
    const g = this.g;
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const f = this.patches[i];
      f.life -= dt;
      if (f.life <= 0) { this.patches.splice(i, 1); continue; }
      const k = clamp01(f.life / 2);
      if (chance(dt * 14 * k)) this.flameAt(f.x + rand(-f.r, f.r) * 0.8, f.y + 0.02, f.z + rand(-f.r, f.r) * 0.8, 0.22 + f.r * 0.4 * k, f.who);
      // whoever stands in it
      for (const h of g.humans) {
        if (h.removed || Math.hypot(h.x - f.x, h.z - f.z) > f.r + 0.15 || Math.abs(h.y - f.y) > 0.5) continue;
        if (chance(dt * 2.5)) this.ignite(h, chance(0.5) ? P.FOOT_L : P.FOOT_R, 0.25, f.who);
      }
      // crates and wood beside it: burning fuel against a wooden wall sets it alight from the bottom
      for (const o of g.props) {
        const b = o.body;
        if (Math.hypot(b.px - f.x, b.pz - f.z) > f.r + b.boundR + 0.3) continue;
        if (o.kind === 'crate') { if (Math.hypot(b.px - f.x, b.pz - f.z) < f.r + 0.6) this.igniteCrate(o, dt * 0.4); continue; }
        if (!o.vox || o.vox.mat !== 'wood' || !chance(dt * 6)) continue;
        const px = f.x + rand(-f.r, f.r), pz = f.z + rand(-f.r, f.r);
        b.toLocal(px, f.y + rand(0.04, 0.2), pz, _a);
        if (Math.abs(_a[0]) > b.hx + 0.08 || Math.abs(_a[1]) > b.hy + 0.08 || Math.abs(_a[2]) > b.hz + 0.08) continue;
        const c = this._cellAt(o.vox, _a);
        if (c >= 0) o.vox.heatUp(c, 0.5);
      }
    }
    // one sound for all the little fires, at the nearest
    let best = null, bd = 1e9;
    const L = g.audio;
    for (const f of this.patches) { const d = (f.x - g.camX) ** 2 + (f.z - g.camZ) ** 2; if (d < bd) { bd = d; best = f; } }
    if (best) { L?.loop('patches', 'fire', best.x, best.y, best.z, 0.6); g.lights?.ask('point', best.x, best.y + 0.4, best.z, 0xff8030, 2.5 + rand(-0.5, 0.5), 5); }
  }

  /** Every flame, turned to the camera. */
  _draw() {
    const q = this.q, cam = this.g.camera.matrixWorld.elements;
    const rx = cam[0], ry = cam[1], rz = cam[2], ux = cam[4], uy = cam[5], uz = cam[6];
    const pos = q.pos, uv = q.uv, col = q.col;
    let biggest = 0, bx = 0, by = 0, bz = 0;
    for (let i = 0; i < this.n; i++) {
      const t = 1 - this.life[i] / this.max[i], k = this.kind[i];
      const s = (this.size[i] + this.grow[i] * t) * 0.5;
      const x = this.x[i], y = this.y[i] + s * 0.35, z = this.z[i];
      const o = i * 12;
      // tipped a little this way or that, so no two look alike, but upright
      const ang = (((i * 2.39996) % TAU) - Math.PI) * 0.06, ca = Math.cos(ang), sa = Math.sin(ang);
      const ax = (rx * ca + ux * sa) * s, ay = (ry * ca + uy * sa) * s, az = (rz * ca + uz * sa) * s;
      const bx2 = (ux * ca - rx * sa) * s, by2 = (uy * ca - ry * sa) * s, bz2 = (uz * ca - rz * sa) * s;
      pos[o] = x - ax - bx2; pos[o + 1] = y - ay - by2; pos[o + 2] = z - az - bz2;
      pos[o + 3] = x + ax - bx2; pos[o + 4] = y + ay - by2; pos[o + 5] = z + az - bz2;
      pos[o + 6] = x + ax + bx2; pos[o + 7] = y + ay + by2; pos[o + 8] = z + az + bz2;
      pos[o + 9] = x - ax + bx2; pos[o + 10] = y - ay + by2; pos[o + 11] = z - az + bz2;
      const r = k === 2 ? EMBER_UV : FLAME_UV[this.cell[i]], u = i * 8;
      uv[u] = r[0]; uv[u + 1] = r[1]; uv[u + 2] = r[2]; uv[u + 3] = r[1]; uv[u + 4] = r[2]; uv[u + 5] = r[3]; uv[u + 6] = r[0]; uv[u + 7] = r[3];
      // white-yellow when it leaves the nozzle, orange, then a dull red as it dies
      let cr, cg, cb, al;
      if (k === 2) { cr = 0.5; cg = 0.7; cb = 1; al = 0.8; }
      else { const f = 1 - t; cr = 1; cg = 0.35 + 0.55 * f * f; cb = 0.08 + 0.4 * f * f * f; al = (k === 0 ? 1 : 0.7) * Math.pow(1 - t, k === 0 ? 0.8 : 1.1) * Math.min(1, t * 6 + (k === 0 ? 0.55 : 0.3)); }
      const cc = i * 16;
      for (let v = 0; v < 16; v += 4) { col[cc + v] = cr; col[cc + v + 1] = cg; col[cc + v + 2] = cb; col[cc + v + 3] = al; }
      if (k === 0 && s > biggest) { biggest = s; bx = x; by = y; bz = z; }
    }
    q.count = this.n;
    q.dPos = q.dUv = q.dCol = true;
    q.commit();
    // the stream lights what is round it
    if (biggest > 0) this.g.lights?.ask('point', bx, by, bz, 0xff9a40, 6 + rand(-1.2, 1.2), 9);
  }

  /** Everything out. */
  clear() {
    this.n = 0;
    for (const h of this.people) { h.fire = null; h.burning = 0; }
    this.people.clear(); this.crates.clear(); this.patches.length = 0;
    this.q.count = 0; this.q.commit();
  }
}

const CHAR = [0.05, 0.04, 0.05], CHAR_COL = [0.08, 0.06, 0.05];
