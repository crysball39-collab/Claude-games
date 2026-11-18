/* =============================================================================
   Things you can put down that are neither weapons nor built of cubes: a
   light bulb, a floodlight on its stand, and a petrol generator to light them.

   A light needs power. Start the generator (walk up to it: START), then take
   the wire to it and to the light: WIRE one, WIRE TO the other. While the
   generator runs, the light is on. Lights pass power along, so one generator
   can feed a string of bulbs (power.js has the rest). A floodlight also has
   its own switch.

   Glass breaks. A bulb dropped from any height, kicked, trodden on, hit or
   shot is done for, and so is a floodlight's lens if a round finds it. A
   generator takes a few rounds before it coughs and stops for good.
   ========================================================================== */
import * as THREE from 'three';
import { Body, Island } from '../physics/world.js';
import { groundHeight } from './city.js';
import { Quads, cellUV } from '../render/quads.js';
import { DECAL, ATLAS_COLS, ATLAS_ROWS } from '../render/textures.js';
import { rgb } from '../render/boxes.js';
import { clamp, clamp01, rand, chance, TAU } from '../core/util.js';

const DARK = 0x222428, GLASS = 0xd6dee2, BRASS = 0xb59a52, LENS = 0xbfc8cc;
const H = Math.SQRT1_2;
const rotY = (a) => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
const leg = (a) => {
  // a tripod leg from the hub out and down to the ground, splayed at angle a round the mast
  const tilt = -0.42, ca = Math.cos(a), sa = Math.sin(a);
  const qy = [0, Math.sin(a / 2), 0, Math.cos(a / 2)], qx = [Math.sin(tilt / 2), 0, 0, Math.cos(tilt / 2)];
  // qy * qx
  return [qy[3] * qx[0] + qy[0] * qx[3] + qy[1] * qx[2] - qy[2] * qx[1], qy[3] * qx[1] - qy[0] * qx[2] + qy[1] * qx[3] + qy[2] * qx[0],
    qy[3] * qx[2] + qy[0] * qx[1] - qy[1] * qx[0] + qy[2] * qx[3], qy[3] * qx[3] - qy[0] * qx[0] - qy[1] * qx[1] - qy[2] * qx[2], sa, ca];
};
const LEGS = [0, TAU / 3, 2 * TAU / 3].map(leg);

/**
 * Box lists as for weapons: x, y, z, width, height, depth, colour, rotation,
 * and a role: 'glow' lights up when the thing is lit, 'lens' is the glass that
 * breaks, 'led' is the generator's running light.
 */
export const THINGS = {
  bulb: {
    name: 'Light bulb', mass: 0.06, half: [0.034, 0.062, 0.034], light: 'point', at: [0, 0.018, 0], solid: false,
    boxes: [[0, 0.018, 0, 0.062, 0.07, 0.062, GLASS, null, 'glow'], [0, 0.018, 0, 0.05, 0.08, 0.05, GLASS, rotY(Math.PI / 4), 'glow'],
      [0, -0.028, 0, 0.034, 0.022, 0.034, 0xe4e4dc], [0, -0.047, 0, 0.028, 0.02, 0.028, BRASS], [0, -0.06, 0, 0.012, 0.006, 0.012, 0x1b1b1b],
      [0, 0.02, 0, 0.022, 0.004, 0.004, 0x5d5a52, null, 'filament']],
  },
  flood: {
    name: 'Floodlight', mass: 14, half: [0.3, 0.8, 0.3], light: 'spot', at: [0, 0.66, 0.11], aim: [0, -0.2, 1], solid: false,
    boxes: [[0, -0.06, 0, 0.032, 1.22, 0.032, DARK], [0, 0.55, 0, 0.38, 0.03, 0.04, DARK], [0.19, 0.6, 0, 0.02, 0.12, 0.04, DARK], [-0.19, 0.6, 0, 0.02, 0.12, 0.04, DARK],
      [0, 0.66, 0.015, 0.36, 0.26, 0.15, 0x2b2d31], [0, 0.66, 0.095, 0.32, 0.22, 0.012, LENS, null, 'lens'], [0, 0.66, -0.07, 0.32, 0.2, 0.02, 0x1a1c1f],
      [0, 0.81, 0.015, 0.16, 0.022, 0.03, DARK], [0, 0.52, -0.05, 0.05, 0.06, 0.05, 0x111214],
      ...LEGS.map((l) => [l[4] * 0.16, -0.58, l[5] * 0.16, 0.026, 0.48, 0.026, DARK, [l[0], l[1], l[2], l[3]]])],
  },
  generator: {
    name: 'Generator', mass: 62, half: [0.37, 0.29, 0.27], solid: true, source: true, hp: 7, exhaust: [-0.36, 0.04, -0.2],
    boxes: [[-0.1, -0.09, 0, 0.3, 0.26, 0.28, 0x7c8086], [0.17, -0.11, 0, 0.22, 0.22, 0.22, 0x2f3236], [0, 0.17, 0, 0.56, 0.12, 0.34, 0xc8322a],
      [-0.15, 0.245, 0, 0.06, 0.03, 0.06, 0x1d1f22], [0.2, 0, 0.255, 0.2, 0.15, 0.02, 0x1d1f22], [0.25, 0.04, 0.268, 0.028, 0.028, 0.01, 0x2f5f2f, null, 'led'],
      [0.16, -0.03, 0.268, 0.05, 0.035, 0.01, 0x8a8a84], [-0.31, 0.03, -0.2, 0.1, 0.08, 0.08, 0x45484d], [-0.25, -0.02, 0.255, 0.07, 0.022, 0.022, 0x101010],
      [0.35, 0, 0.25, 0.026, 0.56, 0.026, DARK], [-0.35, 0, 0.25, 0.026, 0.56, 0.026, DARK], [0.35, 0, -0.25, 0.026, 0.56, 0.026, DARK], [-0.35, 0, -0.25, 0.026, 0.56, 0.026, DARK],
      [0, 0.28, 0.25, 0.72, 0.024, 0.024, DARK], [0, 0.28, -0.25, 0.72, 0.024, 0.024, DARK], [0, -0.28, 0.25, 0.72, 0.024, 0.04, DARK], [0, -0.28, -0.25, 0.72, 0.024, 0.04, DARK]],
  },
};

const GLOW_UV = cellUV(DECAL.glow[0], DECAL.glow[1], ATLAS_COLS, ATLAS_ROWS);
const _a = [0, 0, 0], _b = [0, 0, 0];

export class Things {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.near = null;
    // glows round lit lamps, drawn added on top of whatever is behind them
    this.glows = new Quads(game.scene, 48, game.atlas, { offset: 0, renderOrder: 8, alphaTest: 0.002 });
    this.glows.material.blending = THREE.AdditiveBlending;
    this.stats = { broken: 0, lit: 0, powered: 0 };
  }

  spawn(type, x, z, yaw = 0) {
    const g = this.g, def = THINGS[type];
    if (this.list.length >= 30) { const old = this.list.find((t) => t.type === type) || this.list[0]; g.removeProp(old.prop); }
    const y = groundHeight(x, z) + def.half[1] + (type === 'bulb' ? 0.005 : 0.02);
    const body = new Body({ hx: def.half[0], hy: def.half[1], hz: def.half[2], mass: def.mass, x, y, z, qy: Math.sin(yaw / 2), qw: Math.cos(yaw / 2),
      shape: 1, dense: true, kind: 'thing', friction: type === 'generator' ? 0.8 : 0.6, bounce: 0.05, angDamp: 0.8, inertiaFloor: type === 'bulb' ? 0.00004 : undefined });
    const island = new Island(null); island.add(body); g.world.addIsland(island);
    const t = { type, def, body, island, inst: def.boxes.map(() => g.boxes.alloc()), on: true, running: false, powered: false, lit: false, broken: false,
      hp: def.hp || 1, born: g.time, smokeT: 0, noiseT: 0, glow: -1, flick: 0 };
    t.prop = { kind: 'thing', thing: t, body, island, solid: def.solid, born: g.time };
    body.owner = t.prop;
    g.props.push(t.prop);
    this.list.push(t);
    this._paint(t);
    return t;
  }

  forget(t) {
    const i = this.list.indexOf(t);
    if (i < 0) return;
    this.list.splice(i, 1);
    for (const n of t.inst) this.g.boxes.release(n);
    if (t.glow >= 0) { this.glows.release(t.glow); t.glow = -1; }
    if (this.near === t) { this.near = null; this.g.ui?.nearChanged(); }
  }

  /** The colours of its boxes for how it is now: lit glass glows, broken glass is dark and grey. */
  _paint(t) {
    const bx = this.g.boxes;
    t.def.boxes.forEach((b, i) => {
      const role = b[8];
      let c = rgb(b[6]);
      if (role === 'glow' || role === 'lens') c = t.broken ? [0.12, 0.12, 0.12] : t.lit ? (role === 'lens' ? [2.2, 2.1, 1.85] : [2.0, 1.75, 1.2]) : c;
      else if (role === 'filament') c = t.broken ? [0.1, 0.1, 0.1] : t.lit ? [3, 2.6, 1.6] : c;
      else if (role === 'led') c = t.broken ? [0.15, 0.04, 0.03] : t.running ? [0.3, 1.8, 0.4] : c;
      bx.color(t.inst[i], c[0], c[1], c[2]);
    });
  }

  /* ---------------------------------- using --------------------------------- */

  label(t) {
    if (t.type === 'generator') return t.broken ? 'BROKEN' : t.running ? 'STOP' : 'START';
    if (t.type === 'flood') return t.on ? 'SWITCH OFF' : 'SWITCH ON';
    return '';
  }

  /** The player's USE on whatever is within reach. */
  use(t = this.near) {
    if (!t) return false;
    const g = this.g, b = t.body;
    if (t.type === 'generator') {
      if (t.broken) { g.ui?.toast('It is wrecked. It will not start.'); return true; }
      t.running = !t.running;
      g.audio?.at(t.running ? 'start' : 'stop', b.px, b.py, b.pz, 0.9);
      g.ui?.toast(t.running ? 'Generator running. WIRE it to a light, or to anything else.' : 'Generator off.');
      g.minds?.noise(b.px, b.py, b.pz, 74, 'engine', g.player);
    } else if (t.type === 'flood') {
      t.on = !t.on;
      g.audio?.at('switch', b.px, b.py + 0.6, b.pz, 0.7);
      g.ui?.toast(!t.on ? 'Floodlight off.' : t.broken ? 'The lens is smashed.' : this._powered(t) ? 'Floodlight on.' : 'Switched on, but there is no power: WIRE it to a running generator.');
    } else return false;
    this._paint(t);
    g.ui?.nearChanged();
    return true;
  }

  /* --------------------------------- damage ------------------------------- */

  /** A round, a blow or a fall: what it does to this thing. `lp` is where, in its own space. */
  hurt(t, power, lp, kind) {
    const g = this.g, b = t.body;
    if (t.type === 'bulb') return this.smash(t);
    if (t.type === 'flood') {
      // the lens is the front of the head; anywhere else is the stand
      const onLens = lp && lp[1] > 0.52 && lp[1] < 0.8 && lp[2] > 0.06;
      if (onLens || kind === 'fall') return this.smash(t);
      g.audio?.at('clang', b.px, b.py, b.pz, 0.5);
      return false;
    }
    if (t.type === 'generator') {
      t.hp -= power;
      g.audio?.at('clang', b.px, b.py, b.pz, 0.7);
      g.gore.puff('flash', b.px, b.py + 0.1, b.pz, 0.18, 0.06, 1, 0.85, 0.5);
      if (t.hp <= 0 && !t.broken) {
        t.broken = true; t.running = false;
        t.smokeT = 22;                 // it smokes for a while after
        g.audio?.at('stop', b.px, b.py, b.pz, 1);
        this.stats.broken++;
        this._paint(t);
        if (this.near === t) g.ui?.nearChanged();
      }
      return true;
    }
    return false;
  }

  /** Glass gone: a pop, a tinkle, shards, and dark. */
  smash(t) {
    if (t.broken) return false;
    const g = this.g, b = t.body;
    t.broken = true; t.lit = false;
    const at = t.def.at || [0, 0, 0];
    b.toWorld(at[0], at[1], at[2], _a);
    g.audio?.at('glass', _a[0], _a[1], _a[2], 0.9);
    g.minds?.noise(_a[0], _a[1], _a[2], 70, 'glass', null);
    if (g.voxels) for (let i = 0; i < (t.type === 'bulb' ? 7 : 12); i++) g.voxels.chip(_a[0], _a[1], _a[2], rand(-1.5, 1.5), rand(0.3, 2), rand(-1.5, 1.5), SHARD, SHARD_COL, 0);
    if (t.glow >= 0) { this.glows.release(t.glow); t.glow = -1; }
    this.stats.broken++;
    this._paint(t);
    return true;
  }

  /* ---------------------------------- power --------------------------------- */

  /** Whether a light is fed, right now, by a running generator (power.js works out what is live). */
  _powered(t) { const P = this.g.power; if (!P) return false; P._network(); return P.live.has(t.prop); }

  /* ---------------------------------- frame --------------------------------- */

  update(dt) {
    const g = this.g, p = g.player, L = g.lights, bx = g.boxes;
    const live = g.power ? g.power.live : null;
    let lit = 0, powered = 0;
    let near = null, nd = 1.7;
    for (const t of this.list) {
      const b = t.body, def = t.def;
      const was = t.lit;
      t.powered = def.light && live ? live.has(t.prop) : false;
      t.lit = t.powered && !t.broken && (t.type !== 'flood' || t.on);
      if (t.powered) powered++;
      if (t.lit !== was) { this._paint(t); if (t.lit) { g.audio?.at('switch', b.px, b.py, b.pz, 0.25); g.minds?.noise(b.px, b.py, b.pz, 62, 'light', null); } }
      // glass does not take knocks
      if ((t.type === 'bulb' && b.hit > 3.2 && g.time - t.born > 0.6) || (t.type === 'flood' && b.hit > 7 && g.time - t.born > 1)) this.hurt(t, 1, null, 'fall');
      // nor being trodden on
      if (t.type === 'bulb' && !t.broken) for (const h of g.humans) {
        if (h.removed || h.state !== 0 || Math.abs(h.y - b.py) > 0.25) continue;
        if (Math.hypot(h.x - b.px, h.z - b.pz) < 0.13 && h.speed > 0.3) { this.smash(t); break; }
      }
      // drawn, with a running engine's shiver
      const j = t.running ? 0.0015 : 0;
      const jx = j ? rand(-j, j) : 0, jy = j ? rand(-j, j) : 0, jz = j ? rand(-j, j) : 0;
      def.boxes.forEach((d, i) => bx.setOn(t.inst[i], b.px + jx, b.py + jy, b.pz + jz, b.qx, b.qy, b.qz, b.qw, d[0], d[1], d[2], d[3], d[4], d[5], d[7] || undefined));
      // light
      if (t.lit) {
        lit++;
        const at = def.at;
        b.toWorld(at[0], at[1], at[2], _a);
        if (t.type === 'flood') {
          b.dirToWorld(def.aim[0], def.aim[1], def.aim[2], _b);
          const l = Math.hypot(_b[0], _b[1], _b[2]) || 1;
          L?.ask('spot', _a[0], _a[1], _a[2], 0xfff2dc, 170, 42, _b[0] / l, _b[1] / l, _b[2] / l);
          this._glow(t, _a[0] + _b[0] / l * 0.04, _a[1] + _b[1] / l * 0.04, _a[2] + _b[2] / l * 0.04, 0.9, 1, 0.95, 0.85);
        } else {
          L?.ask('point', _a[0], _a[1], _a[2], 0xffd29a, 7, 9);
          this._glow(t, _a[0], _a[1], _a[2], 0.42, 1, 0.82, 0.5);
        }
      } else if (t.glow >= 0) { this.glows.release(t.glow); t.glow = -1; }
      // an engine: its noise, its exhaust, and people round it hear it
      if (t.type === 'generator') {
        if (t.running) {
          g.audio?.loop('gen' + b.id, 'engine', b.px, b.py, b.pz, 1);
          t.smokeT += dt;
          if (t.smokeT > 0.35) { t.smokeT = 0; const e = def.exhaust; b.toWorld(e[0], e[1], e[2], _a); g.gore.puff('smoke', _a[0], _a[1] + 0.05, _a[2], 0.16, 1.1, 0.55, 0.55, 0.56); }
          t.noiseT -= dt;
          if (t.noiseT <= 0) { t.noiseT = 2; g.minds?.noise(b.px, b.py, b.pz, 72, 'engine', null); }
        } else if (t.broken && t.smokeT > 0) {
          t.smokeT -= dt;
          if (chance(dt * 4)) g.gore.puff('smoke', b.px + rand(-0.2, 0.2), b.py + 0.3, b.pz + rand(-0.2, 0.2), 0.3, 1.6, 0.2, 0.2, 0.2);
        }
      }
      if (b.py < -20) { g.removeProp(t.prop); continue; }
      // within reach and something to do with it
      if ((t.type === 'generator' || t.type === 'flood') && p.state === 0) {
        const d = Math.hypot(b.px - p.x, b.pz - p.z) - Math.max(def.half[0], def.half[2]);
        if (d < nd) { nd = d; near = t; }
      }
    }
    this.stats.lit = lit; this.stats.powered = powered;
    if (near !== this.near) { this.near = near; g.ui?.nearChanged(); }
    this.glows.commit();
  }

  /** A soft glow round a lamp, facing the camera. */
  _glow(t, x, y, z, size, r, gg, bb) {
    const q = this.glows;
    if (t.glow < 0) { t.glow = q.alloc(); if (t.glow < 0) return; q.uvRect(t.glow, GLOW_UV[0], GLOW_UV[1], GLOW_UV[2], GLOW_UV[3]); }
    const e = this.g.camera.matrixWorld.elements;
    const s = size * (0.94 + Math.random() * 0.06);
    const rx = e[0] * s, ry = e[1] * s, rz = e[2] * s, ux = e[4] * s, uy = e[5] * s, uz = e[6] * s;
    q.corners(t.glow, x - rx - ux, y - ry - uy, z - rz - uz, x + rx - ux, y + ry - uy, z + rz - uz, x + rx + ux, y + ry + uy, z + rz + uz, x - rx + ux, y - ry + uy, z - rz + uz);
    q.tint(t.glow, r * 0.55, gg * 0.55, bb * 0.55, 1);
  }

  clear() { for (const t of [...this.list]) this.g.removeProp(t.prop); }
}

const SHARD = [0.012, 0.003, 0.01], SHARD_COL = [0.85, 0.9, 0.92];
