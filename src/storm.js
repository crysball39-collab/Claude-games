// The storm: a circle that holds for two minutes, then takes one minute to
// close onto a smaller circle chosen inside it.  Anything caught outside takes
// damage per second, and the damage climbs with every zone.
import * as THREE from 'three';
import { clamp, lerp, TAU } from './util.js';
import { heightAt, SEA_LEVEL, WORLD } from './world.js';

export const HOLD_TIME = 120;    // seconds the circle sits still
export const CLOSE_TIME = 60;    // seconds it takes to close in

// Radius of each successive safe circle. The first covers the whole island.
const RADII = [1500, 950, 620, 400, 250, 150, 90, 46, 20];
// Damage per second to anything left outside, per zone.
const DPS = [1, 1, 2, 3, 5, 7, 10, 12, 15];

export class Storm {
  constructor(scene, rng) {
    this.rng = rng;
    this.zone = 0;
    this.phase = 'hold';          // 'hold' | 'closing'
    this.t = HOLD_TIME;
    this.cx = 0; this.cz = 0;
    this.radius = RADII[0];
    this.from = { x: 0, z: 0, r: RADII[0] };
    this.to = { x: 0, z: 0, r: RADII[0] };
    this.pickNext();

    const geo = new THREE.CylinderGeometry(1, 1, 1600, 64, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9b5cff, transparent: true, opacity: 0.28,
      side: THREE.DoubleSide, depthWrite: false, fog: true,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 5;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    // brighter band right at the boundary so the edge reads from a distance
    const edgeGeo = new THREE.CylinderGeometry(1, 1, 26, 64, 1, true);
    this.edge = new THREE.Mesh(edgeGeo, new THREE.MeshBasicMaterial({
      color: 0xd0a8ff, transparent: true, opacity: 0.4,
      side: THREE.DoubleSide, depthWrite: false, fog: true,
    }));
    this.edge.renderOrder = 6;
    this.edge.frustumCulled = false;
    scene.add(this.edge);
    this.syncMesh();
  }

  get isFinal() { return this.zone >= RADII.length - 1; }
  get dps() { return DPS[Math.min(this.zone, DPS.length - 1)]; }

  /** The circle players should be standing in: the target while it closes. */
  safeCircle() {
    return this.phase === 'closing'
      ? { x: this.to.x, z: this.to.z, r: this.to.r }
      : { x: this.cx, z: this.cz, r: this.radius };
  }
  /** The circle drawn as "next" on the map during a hold. */
  nextCircle() {
    if (this.isFinal) return null;
    return { x: this.to.x, z: this.to.z, r: this.to.r };
  }
  currentCircle() { return { x: this.cx, z: this.cz, r: this.radius }; }

  /** Choose where the next circle will sit — fully inside the current one. */
  pickNext() {
    if (this.isFinal) { this.to = { x: this.cx, z: this.cz, r: this.radius }; return; }
    const nr = RADII[this.zone + 1];
    const slack = Math.max(0, this.radius - nr);
    let best = null;
    for (let i = 0; i < 24; i++) {
      const a = this.rng() * TAU;
      const d = Math.sqrt(this.rng()) * slack;
      const x = this.cx + Math.cos(a) * d, z = this.cz + Math.sin(a) * d;
      if (Math.abs(x) > WORLD.half - 60 || Math.abs(z) > WORLD.half - 60) continue;
      // prefer dry land so the last circles are playable
      if (heightAt(x, z) > SEA_LEVEL + 4) { best = { x, z, r: nr }; break; }
      if (!best) best = { x, z, r: nr };
    }
    this.to = best || { x: this.cx, z: this.cz, r: nr };
  }

  syncMesh() {
    this.mesh.position.set(this.cx, 560, this.cz);
    this.mesh.scale.set(this.radius, 1, this.radius);
    this.edge.position.set(this.cx, 13, this.cz);
    this.edge.scale.set(this.radius, 1, this.radius);
  }

  isInside(x, z, pad = 0) {
    const dx = x - this.cx, dz = z - this.cz;
    return dx * dx + dz * dz <= (this.radius + pad) * (this.radius + pad);
  }

  update(dt, actors) {
    this.t -= dt;
    if (this.phase === 'hold') {
      if (this.t <= 0 && !this.isFinal) {
        this.phase = 'closing';
        this.t = CLOSE_TIME;
        this.from = { x: this.cx, z: this.cz, r: this.radius };
      } else if (this.isFinal) {
        this.t = HOLD_TIME;      // final circle never moves again
      }
    } else {
      const p = clamp(1 - this.t / CLOSE_TIME, 0, 1);
      const e = p * p * (3 - 2 * p);
      this.cx = lerp(this.from.x, this.to.x, e);
      this.cz = lerp(this.from.z, this.to.z, e);
      this.radius = lerp(this.from.r, this.to.r, e);
      if (this.t <= 0) {
        this.zone++;
        this.cx = this.to.x; this.cz = this.to.z; this.radius = this.to.r;
        this.phase = 'hold';
        this.t = HOLD_TIME;
        this.pickNext();
      }
    }
    this.syncMesh();

    // damage everything caught outside
    const dmg = this.dps * dt;
    for (const a of actors) {
      if (!a.alive) continue;
      if (this.isInside(a.pos.x, a.pos.z)) continue;
      a.stormTick = (a.stormTick || 0) + dmg;
      if (a.stormTick >= 1) {
        const whole = Math.floor(a.stormTick);
        a.stormTick -= whole;
        a.takeDamage(whole, null, a.pos, false, 'storm');
      }
    }
  }

  /** "1:23" style countdown for the HUD. */
  statusText() {
    const t = Math.max(0, Math.ceil(this.t));
    const m = Math.floor(t / 60), s = t % 60;
    const clock = `${m}:${s < 10 ? '0' : ''}${s}`;
    if (this.isFinal && this.phase === 'hold') return { label: 'FINAL ZONE', time: '', closing: false };
    return this.phase === 'hold'
      ? { label: `ZONE ${this.zone + 1} · CLOSES IN`, time: clock, closing: false }
      : { label: `STORM CLOSING`, time: clock, closing: true };
  }
}
