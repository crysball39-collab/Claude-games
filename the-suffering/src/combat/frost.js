/* =============================================================================
   Frost.

   The frost thrower throws liquid nitrogen as a freezing mist: a white jet
   that slows and spreads and sinks as it goes (the cold air is heavy), and
   drifts along the ground where it lands. Whatever it touches is chilled.

   On a person the cold builds up part by part as a crust of rime: skin and
   clothes go white, then blue-grey; the part stiffens, and the body's own
   heat is drawn out through it. Frosted legs will hardly walk. A body iced
   nearly all over cannot move at all, and stands, or falls, as stiff as a
   board until it thaws. Under the rime the skin is frostbitten, and the core
   of the body cools: shivering, then confusion, then nothing, and at the end
   the heart stops. A limb frozen through is brittle: a hard enough blow
   breaks it off.

   The cold puts fire out, on people, on crates and on the ground. On the
   street it leaves a skin of ice, which is slippery. All of it thaws.
   ========================================================================== */
import { Quads, cellUV } from '../render/quads.js';
import { DECAL, ATLAS_COLS, ATLAS_ROWS } from '../render/textures.js';
import { groundHeight } from '../world/city.js';
import { P, PART_COUNT } from '../human/rig.js';
import { SKIN_AREA } from '../human/health.js';
import { ST } from '../human/human.js';
import { clamp01, rand, chance, TAU } from '../core/util.js';

const MIST_UV = cellUV(DECAL.vapour[0], DECAL.vapour[1], ATLAS_COLS, ATLAS_ROWS);
const RIME_UV = cellUV(DECAL.rime[0], DECAL.rime[1], ATLAS_COLS, ATLAS_ROWS);
const FROST_UV = cellUV(DECAL.frost[0], DECAL.frost[1], ATLAS_COLS, ATLAS_ROWS);
const ICE_UV = cellUV(DECAL.ice[0], DECAL.ice[1], ATLAS_COLS, ATLAS_ROWS);
const MAX = 600;
/** How much of the body has to be iced before it cannot move. */
export const FROZEN_AT = 0.5;
/** The parts each part touches: rime creeps along these. */
const NEXT = [[1, 11, 14], [0, 2], [1, 3, 5, 8], [2, 4], [3], [2, 6], [5, 7], [6], [2, 9], [8, 10], [9], [0, 12], [11, 13], [12], [0, 15], [14, 16], [15]];
const _a = [0, 0, 0];

export class Frost {
  constructor(game) {
    this.g = game;
    this.q = new Quads(game.scene, MAX, game.atlas, { offset: 0, renderOrder: 6, alphaTest: 0.004 });
    this.n = 0;
    const F = () => new Float32Array(MAX);
    this.x = F(); this.y = F(); this.z = F(); this.vx = F(); this.vy = F(); this.vz = F();
    this.life = F(); this.max = F(); this.size = F(); this.grow = F();
    this.kind = new Uint8Array(MAX);      // 0 the jet, 1 mist drifting off it, 2 a glint of ice
    this.who = new Array(MAX).fill(null);
    this.people = new Set();
    this.patches = [];                    // ice on the ground: { x, y, z, r, life }
    this.check = 0; this.check4 = 0;
    this.stats = { emitted: 0, people: 0, frozen: 0, quenched: 0, patches: 0, slips: 0, shattered: 0 };
  }

  _add(kind, x, y, z, vx, vy, vz, life, size, grow, who) {
    if (this.n >= MAX) return -1;
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.z[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.grow[i] = grow;
    this.kind[i] = kind; this.who[i] = who;
    this.stats.emitted++;
    return i;
  }
  _kill(i) {
    const j = --this.n;
    if (i === j) { this.who[j] = null; return; }
    this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.z[i] = this.z[j]; this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
    this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.size[i] = this.size[j]; this.grow[i] = this.grow[j];
    this.kind[i] = this.kind[j]; this.who[i] = this.who[j]; this.who[j] = null;
  }

  /* ---------------------------------- making -------------------------------- */

  /** One frame of a frost thrower: a freezing jet out of the nozzle along (dx, dy, dz). */
  spray(who, mx, my, mz, dx, dy, dz, dt) {
    const n = Math.max(1, Math.round(dt * 70));
    for (let k = 0; k < n; k++) {
      const sp = rand(10, 12.5), s = 0.085;
      const ox = dx + rand(-s, s), oy = dy + rand(-s, s), oz = dz + rand(-s, s);
      const back = (k / n) * dt * sp;
      this._add(0, mx + ox * back, my + oy * back, mz + oz * back, ox * sp + (who ? who.vx : 0), oy * sp, oz * sp + (who ? who.vz : 0), rand(0.5, 0.66), 0.1, 1.15, who);
    }
  }
  /** A cloud of cold mist, drifting. */
  mistAt(x, y, z, size = 0.35, vx = 0, vz = 0) { this._add(1, x, y, z, vx + rand(-0.3, 0.3), rand(-0.1, 0.15), vz + rand(-0.3, 0.3), rand(0.7, 1.3), size * 0.7, size * 1.4, null); }
  /** A glint of ice coming off somebody. */
  glint(x, y, z) { this._add(2, x, y, z, rand(-0.2, 0.2), rand(-0.4, 0.1), rand(-0.2, 0.2), rand(0.3, 0.6), 0.035, 0.02, null); }

  /* -------------------------------- chilling -------------------------------- */

  /** Cold on a part of somebody: the rime on it builds up, and any fire on it goes out. */
  chill(h, part, amount, who = null, weapon = 'frostthrower') {
    if (!h || h.removed || h.gone[part]) return;
    // another player: theirs to freeze, on their own screen
    if (h.puppet) { this.g.mp?.chillRemote(h, part, amount, who, weapon); return; }
    if (h.h.god) return;
    if (!h.ice) h.ice = new Float32Array(PART_COUNT);
    h.ice[part] = Math.min(1, h.ice[part] + amount * (h.clothed[part] ? 0.8 : 1));
    h.chillT = this.g.time;
    // white patches of rime on it as it thickens
    const marks = h.iceMarks || (h.iceMarks = new Uint8Array(PART_COUNT));
    if (marks[part] < 3 && h.ice[part] > 0.25 + marks[part] * 0.28) { marks[part]++; this._rime(h, part); }
    if (h.fire && h.fire[part] > 0) { h.fire[part] = Math.max(0, h.fire[part] - amount * 14); this.stats.quenched++; }
    if (!this.people.has(h)) {
      this.people.add(h);
      this.stats.people++;
      h.iceBy = who;
      const b = h.bodies[part];
      this.g.audio?.at('freeze', b.px, b.py, b.pz, 0.6);
      // the shock of it, and anyone watching sees what was done
      if (h.mind) h.mind.feel(part, 'cold', { pain: 16, bones: [], ko: false }, who && who !== h ? who : null, weapon);
      if (who && who !== h) this.g.minds?.witness({ kind: 'attack', actor: who, victim: h, weapon, part, x: b.px, y: b.py, z: b.pz, rep: { pain: 16, bones: [] } });
    }
  }

  /** A patch of white frost on one face of a part. */
  _rime(h, part) {
    const b = h.bodies[part], f = (Math.random() * 4) | 0;
    const ln = f === 0 ? [0, 0, 1] : f === 1 ? [0, 0, -1] : f === 2 ? [1, 0, 0] : [-1, 0, 0];
    const lp = [ln[0] ? ln[0] * b.hx : rand(-b.hx, b.hx) * 0.6, rand(-b.hy, b.hy) * 0.6, ln[2] ? ln[2] * b.hz : rand(-b.hz, b.hz) * 0.6];
    this.g.gore.mark(h, part, 'frost', lp, ln, Math.min(0.22, 1.3 * Math.max(b.hx, b.hz) + 0.04));
  }

  /** A drifting cloud of the cold reaching somebody: a gentler chill, but it wraps round the whole body. */
  _mistOn(i) {
    const g = this.g, x = this.x[i], y = this.y[i], z = this.z[i], who = this.who[i], m = 0.1 + this.size[i] * 0.25;
    for (const h of g.humans) {
      if (h.removed || h === who) continue;
      const c = h.bodies[P.CHEST];
      if ((c.px - x) ** 2 + (c.py - y) ** 2 + (c.pz - z) ** 2 > 1.5) continue;
      for (let p = 0; p < PART_COUNT; p++) {
        if (h.gone[p]) continue;
        const b = h.bodies[p];
        b.toLocal(x, y, z, _a);
        if (Math.abs(_a[0]) > b.hx + m || Math.abs(_a[1]) > b.hy + m || Math.abs(_a[2]) > b.hz + m) continue;
        this.chill(h, p, 0.016, who);
        return;
      }
    }
  }

  /** Ice on the street. */
  ice(x, y, z, r = 0.4, life = rand(20, 32)) {
    for (const p of this.patches) if (Math.hypot(p.x - x, p.z - z) < p.r * 0.7) { p.r = Math.min(1.4, p.r + 0.05); p.life = Math.max(p.life, life); return; }
    if (this.patches.length > 36) this.patches.shift();
    this.patches.push({ x, y, z, r, life });
    this.stats.patches++;
    this.g.gore._groundDecal(ICE_UV, x, y + 0.013, z, r * 2.3, r * 2.3, rand(TAU), 0.85);
  }

  /** How slippery it is underfoot here: 0 dry, 1 ice. */
  slippery(x, z) {
    for (const p of this.patches) if (Math.hypot(p.x - x, p.z - z) < p.r) return 1;
    return 0;
  }

  /* ---------------------------------- frame --------------------------------- */

  update(dt) {
    const g = this.g;
    this.check = (this.check + 1) & 1; this.check4 = (this.check4 + 1) & 3;
    // the nozzle of a frost thrower in the hands smokes with cold
    const e = g.weapons && g.weapons.equipped, p = g.player;
    if (e && e.def.frost && p.weapon === e && !p.swap && e.ammo > 0 && e.muzzleWorld && chance(dt * 9)) {
      const m = e.muzzleWorld;
      this._add(1, m[0], m[1] - 0.02, m[2], rand(-0.05, 0.05), -0.25, rand(-0.05, 0.05), 0.45, 0.04, 0.12, null);
    }
    this._particles(dt);
    this._people(dt);
    this._patches(dt);
    this._draw();
  }

  _particles(dt) {
    const g = this.g, world = g.world, F = g.fire;
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this._kill(i); continue; }
      const k = this.kind[i];
      if (k === 0) {
        // the jet: it slows and spreads and sinks
        const drag = Math.exp(-dt * 2.1);
        this.vx[i] *= drag; this.vz[i] *= drag; this.vy[i] = this.vy[i] * drag - 1.3 * dt;
      } else if (k === 1) { const d = Math.exp(-dt * 1.4); this.vx[i] *= d; this.vz[i] *= d; this.vy[i] = this.vy[i] * d - 0.18 * dt; }
      else this.vy[i] -= 1.5 * dt;
      const ox = this.x[i], oz = this.z[i];
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt; this.z[i] += this.vz[i] * dt;
      if (k === 1) { const gy = groundHeight(this.x[i], this.z[i]) + 0.05; if (this.y[i] < gy) { this.y[i] = gy; this.vy[i] = 0; } }
      if (k === 1 && this.who[i] && (i & 3) === this.check4) { this._mistOn(i); continue; }
      if (k !== 0 || (i & 1) !== this.check) continue;
      const x = this.x[i], y = this.y[i], z = this.z[i], who = this.who[i];
      // the cold puts out what it reaches: burning fuel on the ground, a burning crate
      if (F) {
        for (const f of F.patches) if (Math.hypot(f.x - x, f.z - z) < f.r + 0.35 && y - f.y < 0.8) { f.life -= 0.6; this.stats.quenched++; }
        for (const o of F.crates) { const b = o.body; if ((b.px - x) ** 2 + (b.py - y) ** 2 + (b.pz - z) ** 2 < (b.boundR + 0.3) ** 2) { o.heat = 0; F.crates.delete(o); o.fire = null; this.stats.quenched++; g.gore.puff('smoke', b.px, b.py + b.hy, b.pz, 0.5, 1.6, 0.8, 0.8, 0.8); } }
      }
      // the ground: it lands, spreads into mist, and ices the street
      const gy = groundHeight(x, z);
      if (y < gy + 0.06) {
        this.kind[i] = 1; this.y[i] = gy + 0.06; this.vy[i] = 0; this.vx[i] *= 0.45; this.vz[i] *= 0.45; this.life[i] = Math.min(this.life[i] + 0.5, 1.1);
        if (chance(0.08)) this.ice(x, gy, z, rand(0.3, 0.45));
        continue;
      }
      // a wall: it frosts over where it is hit
      const s = world.staticAt(x, y, z);
      if (s) {
        this.x[i] = ox; this.z[i] = oz; this.vx[i] *= -0.15; this.vz[i] *= -0.15;
        this.kind[i] = 1; this.life[i] = Math.min(this.life[i] + 0.3, 1);
        if (chance(0.05)) {
          let nx = 0, nz = 0, wx = x, wz = z;
          if (ox <= s.minx) { nx = -1; wx = s.minx; } else if (ox >= s.maxx) { nx = 1; wx = s.maxx; } else if (oz <= s.minz) { nz = -1; wz = s.minz; } else { nz = 1; wz = s.maxz; }
          if (nx || nz) g.gore._wallDecal(FROST_UV, wx, y, wz, nx, nz, rand(0.5, 0.9), rand(0.5, 0.9));
        }
        continue;
      }
      // people
      let hit = false;
      for (const h of g.humans) {
        if (h.removed) continue;
        const c = h.bodies[P.CHEST];
        if ((c.px - x) ** 2 + (c.py - y) ** 2 + (c.pz - z) ** 2 > 1.6) continue;
        if (h === who && this.max[i] - this.life[i] < 0.12) continue;
        for (let p = 0; p < PART_COUNT; p++) {
          if (h.gone[p]) continue;
          const b = h.bodies[p];
          b.toLocal(x, y, z, _a);
          if (Math.abs(_a[0]) > b.hx + 0.08 || Math.abs(_a[1]) > b.hy + 0.08 || Math.abs(_a[2]) > b.hz + 0.08) continue;
          this.chill(h, p, 0.05, who);
          hit = true;
          break;
        }
        if (hit) break;
      }
      if (hit) { this.kind[i] = 1; this.vx[i] *= 0.25; this.vz[i] *= 0.25; this.vy[i] = 0.1; this.life[i] = Math.min(this.life[i] + 0.3, 0.9); continue; }
      // crates, walls and beams, lamps: it whitens and drifts off them
      for (const o of g.props) {
        const b = o.body;
        if ((b.px - x) ** 2 + (b.py - y) ** 2 + (b.pz - z) ** 2 > b.boundR * b.boundR) continue;
        b.toLocal(x, y, z, _a);
        if (Math.abs(_a[0]) > b.hx + 0.02 || Math.abs(_a[1]) > b.hy + 0.02 || Math.abs(_a[2]) > b.hz + 0.02) continue;
        if (o.vox && F) { const c = F._cellAt(o.vox, _a); if (c >= 0 && o.vox.cool(c)) this.stats.quenched++; }
        hit = true;
        break;
      }
      if (hit) { this.kind[i] = 1; this.vx[i] *= -0.1; this.vz[i] *= -0.1; this.vy[i] = 0.1; this.life[i] = Math.min(this.life[i] + 0.3, 0.9); continue; }
      // a car: a skin of frost on the paint and the glass, and in through a broken window
      if (g.traffic) for (const c of g.traffic.cars) {
        if ((c.x - x) ** 2 + (c.z - z) ** 2 > 7) continue;
        c.toLocal(x, y, z, _a);
        if (Math.abs(_a[0]) > 0.95 || Math.abs(_a[2]) > 2.2 || _a[1] < 0.2 || _a[1] > (c.van ? 1.65 : 1.55)) continue;
        // enough of it puts out a car that has caught (one that has gone up burns on regardless)
        c.heat = Math.max(0, (c.heat || 0) - 0.03);
        if (c.fire >= 0 && !c.wreck && (c.cold = (c.cold || 0) + 0.025) > 1) { c.fire = -1; c.cold = 0; this.stats.quenched++; g.gore.puff('smoke', c.x, c.y + 1.4, c.z, 0.9, 2.2, 0.8, 0.8, 0.8); }
        for (const h of c.seats) if (h && chance(0.08) && c.windows.some((w) => w && w.broken)) this.chill(h, (Math.random() * PART_COUNT) | 0, 0.08, who);
        hit = true;
        break;
      }
      if (hit) { this.kind[i] = 1; this.vx[i] *= -0.1; this.vz[i] *= -0.1; this.vy[i] = 0.1; this.life[i] = Math.min(this.life[i] + 0.3, 0.9); }
    }
  }

  /** Everyone with ice on them. */
  _people(dt) {
    const g = this.g;
    for (const h of [...this.people]) {
      if (h.removed || !h.ice) { this.people.delete(h); continue; }
      let total = 0, legs = 0;
      // while the spray is on them, the rime creeps out from the parts that are thick with it; and the cold cloud
      // round them smothers flames anywhere on them, as a fire extinguisher would
      const sprayed = g.time - (h.chillT ?? -9) < 0.6;
      if (sprayed) for (let p = 0; p < PART_COUNT; p++) {
        const f = h.ice[p];
        if (h.fire && h.fire[p] > 0) h.fire[p] = Math.max(0, h.fire[p] - dt * 1.6);
        if (f < 0.45) continue;
        for (const q of NEXT[p]) if (!h.gone[q] && h.ice[q] < f) h.ice[q] = Math.min(1, h.ice[q] + dt * 0.3 * f);
      }
      for (let p = 0; p < PART_COUNT; p++) {
        let f = h.ice[p];
        if (f <= 0) continue;
        if (h.gone[p]) { h.ice[p] = 0; continue; }
        // it thaws: slowly on its own, quickly in a fire; and a fire on rime does not last
        const warm = h.fire ? h.fire[p] : 0;
        if (warm > 0) h.fire[p] = Math.max(0, warm - dt * 3 * f);
        f = Math.max(0, f - dt * (0.009 + warm * 1.5));
        h.ice[p] = f;
        // and where it is thick, the skin under it freezes
        if (f > 0.3) h.h.freeze(p, (f - 0.3) * 7 * dt);
        total += f * SKIN_AREA[p];
        if (p >= P.THIGH_L) legs += f / 6;
        if (chance(dt * 5 * f)) {
          const b = h.bodies[p];
          b.toWorld(rand(-b.hx, b.hx), rand(-b.hy, b.hy), rand(-b.hz, b.hz), _a);
          this.glint(_a[0], _a[1], _a[2]);
        }
      }
      h.iced = total;
      h.h.iceArea = total;
      // stiff with cold: slow, and slower still with frozen legs
      h.coldMul = 1 - 0.8 * clamp01(legs * 1.1 + total * 0.5);
      // iced nearly all over: frozen stiff until it thaws
      if (total > FROZEN_AT && !h.frozen && h.h.alive) { h.freezeSolid(); this.stats.frozen++; }
      else if (h.frozen && total < FROZEN_AT * 0.75) h.thawOut();
      // breath that smokes in the cold
      if (h.h.alive && h.h.conscious && chance(dt * 0.9 * clamp01(total * 4))) {
        const hd = h.bodies[P.HEAD];
        hd.toWorld(0, -0.02 * h.scale, 0.1 * h.scale, _a);
        this.mistAt(_a[0], _a[1], _a[2], 0.12, hd.vx, hd.vz);
      }
      if (h.mind && h.h.alive && h.h.conscious && !h.frozen && total > 0.08 && chance(dt * 0.35)) h.mind.ask('frozen', 82);
      if (total < 0.004) {
        this.people.delete(h);
        h.ice = null; h.iced = 0; h.h.iceArea = 0; h.coldMul = 1; h.iceMarks = null;
        g.gore.clearFrost(h);
        if (h.frozen) h.thawOut();
        if (h.mind && h.h.alive && h.h.conscious) h.mind.note('felt', 'thawed', 'the ice on me melted, and the feeling came back, and it hurt', 0.7);
      }
    }
  }

  /** Ice on the street: it melts, and anyone hurrying over it may go down. */
  _patches(dt) {
    const g = this.g;
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const f = this.patches[i];
      f.life -= dt;
      if (f.life <= 0) this.patches.splice(i, 1);
    }
    if (!this.patches.length) return;
    for (const h of g.humans) {
      if (h.removed || h.state !== ST.ANIM || h.car || !h.grounded || h.puppet) continue;
      let on = false;
      for (const f of this.patches) if (Math.hypot(h.x - f.x, h.z - f.z) <= f.r && Math.abs(h.y - f.y) <= 0.4) { on = true; break; }
      if (!on) continue;
      // walking carefully is fine; hurrying is not, and the longer you hurry over it the surer it is that a foot
      // goes (how long varies: a quick step across a small patch may get away with it, a sprint across a street will not)
      const risk = h.speed > 3.2 ? 1.6 : h.speed > 1.8 ? 0.5 : 0;
      if (!risk) continue;
      if (!h.slipAt || g.time - h.slipLast > 1) { h.slip = 0; h.slipAt = rand(0.25, 1); }
      h.slipLast = g.time;
      h.slip += dt * risk;
      if (h.slip < h.slipAt) continue;
      h.slipAt = 0;
      this.stats.slips++;
      h.toStumble(42);
      const pel = h.bodies[P.PELVIS];
      pel.applyImpulse(h.vx * pel.mass * 0.6, 0, h.vz * pel.mass * 0.6);
      if (h.mind && h.h.conscious) h.mind.note('felt', 'slipped', 'slipped on ice', 0.5);
    }
  }

  /** Every puff of mist and glint of ice, turned to the camera. */
  _draw() {
    const q = this.q, cam = this.g.camera.matrixWorld.elements;
    const rx = cam[0], ry = cam[1], rz = cam[2], ux = cam[4], uy = cam[5], uz = cam[6];
    const pos = q.pos, uv = q.uv, col = q.col;
    for (let i = 0; i < this.n; i++) {
      const t = 1 - this.life[i] / this.max[i], k = this.kind[i];
      const s = (this.size[i] + this.grow[i] * t) * 0.5;
      const x = this.x[i], y = this.y[i], z = this.z[i];
      const o = i * 12;
      const ang = ((i * 2.39996) % TAU), ca = Math.cos(ang), sa = Math.sin(ang);
      const ax = (rx * ca + ux * sa) * s, ay = (ry * ca + uy * sa) * s, az = (rz * ca + uz * sa) * s;
      const bx2 = (ux * ca - rx * sa) * s, by2 = (uy * ca - ry * sa) * s, bz2 = (uz * ca - rz * sa) * s;
      pos[o] = x - ax - bx2; pos[o + 1] = y - ay - by2; pos[o + 2] = z - az - bz2;
      pos[o + 3] = x + ax - bx2; pos[o + 4] = y + ay - by2; pos[o + 5] = z + az - bz2;
      pos[o + 6] = x + ax + bx2; pos[o + 7] = y + ay + by2; pos[o + 8] = z + az + bz2;
      pos[o + 9] = x - ax + bx2; pos[o + 10] = y - ay + by2; pos[o + 11] = z - az + bz2;
      const r = k === 2 ? RIME_UV : MIST_UV, u = i * 8;
      uv[u] = r[0]; uv[u + 1] = r[1]; uv[u + 2] = r[2]; uv[u + 3] = r[1]; uv[u + 4] = r[2]; uv[u + 5] = r[3]; uv[u + 6] = r[0]; uv[u + 7] = r[3];
      // white where it leaves the nozzle, a cold blue-white as it thins
      let cr, cg, cb, al;
      if (k === 2) { cr = 0.92; cg = 0.97; cb = 1; al = 0.9 * (1 - t); }
      else { const f = 1 - t; cr = 0.82 + 0.16 * f; cg = 0.9 + 0.09 * f; cb = 1; al = (k === 0 ? 0.62 : 0.38) * Math.pow(f, 0.9) * Math.min(1, t * 8 + 0.3); }
      const cc = i * 16;
      for (let v = 0; v < 16; v += 4) { col[cc + v] = cr; col[cc + v + 1] = cg; col[cc + v + 2] = cb; col[cc + v + 3] = al; }
    }
    q.count = this.n;
    q.dPos = q.dUv = q.dCol = true;
    q.commit();
  }

  /** Everything thawed. */
  clear() {
    this.n = 0;
    for (const h of this.people) { h.ice = null; h.iced = 0; h.h.iceArea = 0; h.coldMul = 1; h.iceMarks = null; this.g.gore.clearFrost(h); if (h.frozen) h.thawOut(); }
    this.people.clear(); this.patches.length = 0;
    this.q.count = 0; this.q.commit();
  }
}
