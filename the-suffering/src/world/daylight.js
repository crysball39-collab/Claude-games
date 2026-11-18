/* =============================================================================
   The time of day: the grey afternoon the city has always had, dusk, or night.

   At night the sun is a cold moon, the sky goes dark, windows are lit from
   inside, and every street lamp throws a pool of warm light on the pavement
   under it (the ones nearest you light the people walking through them, too).
   It is when anything you light yourself - a bulb, a floodlight, a fire -
   counts for most.
   ========================================================================== */
import * as THREE from 'three';
import { Quads, cellUV } from '../render/quads.js';
import { DECAL, ATLAS_COLS, ATLAS_ROWS } from '../render/textures.js';
import { KERB } from './city.js';

export const TIMES = {
  day: { sun: 0xffe9cf, sunI: 1.9, sunAt: [30, 55, 18], sky: 0xb7c4d2, ground: 0x4a4640, hemi: 1.25, fog: 0x9da2a3, near: 55, far: 210, tint: [1, 1, 1], windows: 0, lamps: 0 },
  dusk: { sun: 0xffa874, sunI: 1.0, sunAt: [62, 16, 30], sky: 0x8d7f9c, ground: 0x3a3030, hemi: 0.72, fog: 0x7d7078, near: 45, far: 190, tint: [0.92, 0.7, 0.66], windows: 0.55, lamps: 0.55 },
  night: { sun: 0x9fb4ff, sunI: 0.2, sunAt: [-24, 50, -30], sky: 0x2b3654, ground: 0x0e0e13, hemi: 0.34, fog: 0x0c111b, near: 30, far: 150, tint: [0.1, 0.12, 0.2], windows: 1, lamps: 1 },
};
const GLOW = cellUV(DECAL.glow[0], DECAL.glow[1], ATLAS_COLS, ATLAS_ROWS);

export class Daylight {
  constructor(game) {
    this.g = game;
    this.mode = 'day';
    this.T = TIMES.day;
    // a pool of light on the ground under every street lamp, added on to what is there
    const lamps = game.city.lamps || [];
    this.pools = new Quads(game.scene, Math.max(1, lamps.length), game.atlas, { offset: -4, renderOrder: 3, alphaTest: 0.002 });
    this.pools.material.blending = THREE.AdditiveBlending;
    lamps.forEach((l, i) => {
      const q = this.pools.alloc();
      this.pools.flat(q, l[0], KERB + 0.02, l[1], 7.5, 7.5, 0);
      this.pools.uvRect(q, GLOW[0], GLOW[1], GLOW[2], GLOW[3]);
      this.pools.tint(q, 0, 0, 0, 0);
    });
    this.pools.commit();
    this.pools.mesh.visible = false;
  }

  /** Afternoon ('day'), 'dusk' or 'night'. */
  set(mode) {
    const T = TIMES[mode] || TIMES.day, g = this.g;
    this.mode = TIMES[mode] ? mode : 'day'; this.T = T;
    g.sun.color.setHex(T.sun); g.sun.intensity = T.sunI;
    this.sunAt = T.sunAt;
    if (!g.shadows) g.sun.position.set(T.sunAt[0], T.sunAt[1], T.sunAt[2]);
    if (g.hemi) { g.hemi.color.setHex(T.sky); g.hemi.groundColor.setHex(T.ground); g.hemi.intensity = T.hemi; }
    g.scene.fog.color.setHex(T.fog); g.scene.fog.near = T.near; g.scene.fog.far = T.far;
    g.scene.background.setHex(T.fog);
    if (g.city.sky) g.city.sky.material.color.setRGB(T.tint[0], T.tint[1], T.tint[2]);
    for (const m of g.city.facades || []) if (m.emissiveMap) { m.emissive.setRGB(T.windows, T.windows * 0.92, T.windows * 0.8); }
    const k = T.lamps;
    this.pools.mesh.visible = k > 0;
    for (let i = 0; i < this.pools.count; i++) this.pools.tint(i, 0.55 * k, 0.44 * k, 0.28 * k, 1);
    this.pools.commit();
  }

  /** The street lamps nearest the camera light whoever is under them. */
  update() {
    const k = this.T.lamps, g = this.g;
    if (k <= 0 || !g.lights) return;
    const cx = g.camX, cz = g.camZ, lamps = g.city.lamps || [];
    let a = null, ad = 900, b = null, bd = 900;
    for (const l of lamps) {
      const d = (l[0] - cx) ** 2 + (l[1] - cz) ** 2;
      if (d < ad) { b = a; bd = ad; a = l; ad = d; } else if (d < bd) { b = l; bd = d; }
    }
    if (a) g.lights.ask('point', a[0], KERB + 4.9, a[1], 0xffdcaa, 30 * k, 14, 0, -1, 0, 0);
    if (b) g.lights.ask('point', b[0], KERB + 4.9, b[1], 0xffdcaa, 30 * k, 14, 0, -1, 0, 0);
  }
}
