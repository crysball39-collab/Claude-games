// Pre-match: a floating spawn island everyone warms up on, and the battle bus
// that carries the lobby over the map so each player can drop where they like.
import * as THREE from 'three';
import { StructureBuilder } from './props.js';
import { WORLD, POIS, heightAt } from './world.js';
import { clamp, TAU } from './util.js';

export const SPAWN = { x: 0, y: 300, z: 0, half: 48, radius: 74 };
export const SPAWN_TIME = 60;      // seconds on the spawn island
export const BUS_TIME = 56;        // seconds for the bus to cross the island
export const BUS_ALTITUDE = 330;
export const DROP_FROM = 0.07;     // fraction of the route the doors open
export const DROP_TO = 0.88;       // ...and the point everyone still aboard is pushed

/** A grassy platform in the sky with a fence you cannot walk off. */
export function buildSpawnIsland(scene, physics) {
  const b = new StructureBuilder(scene, physics, 'spawn-island');
  const { x: CX, y: Y, z: CZ, half: H } = SPAWN;

  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(SPAWN.radius, SPAWN.radius * 0.82, 9, 40),
    new THREE.MeshLambertMaterial({ color: 0x3f8f3c, flatShading: true })
  );
  disc.position.set(CX, Y - 4.5, CZ);
  disc.receiveShadow = true;
  b.group.add(disc);
  const rock = new THREE.Mesh(
    new THREE.ConeGeometry(SPAWN.radius * 0.8, 34, 20),
    new THREE.MeshLambertMaterial({ color: 0x6b5a48, flatShading: true })
  );
  rock.position.set(CX, Y - 26, CZ);
  rock.rotation.x = Math.PI;
  b.group.add(rock);
  // the walkable surface itself
  b.solid(CX, Y - 0.4, CZ, H * 2 + 8, 0.8, H * 2 + 8, 0x4aa347);

  // fence: invisible walls plus a visible rail, so nobody falls to their death
  for (const [ox, oz, sx, sz] of [[0, -1, 1, 0], [0, 1, 1, 0], [-1, 0, 0, 1], [1, 0, 0, 1]]) {
    physics.addBox(
      CX + ox * H - (sx ? H + 2 : 1.2), Y, CZ + oz * H - (sz ? H + 2 : 1.2),
      CX + ox * H + (sx ? H + 2 : 1.2), Y + 12, CZ + oz * H + (sz ? H + 2 : 1.2)
    );
    for (let i = -H + 4; i <= H - 4; i += 8) {
      b.deco(CX + (sx ? i : ox * H), Y + 0.8, CZ + (sz ? i : oz * H), sx ? 0.3 : 0.3, 1.6, 0.3, 0x8a6640);
    }
    b.deco(CX + ox * H, Y + 1.5, CZ + oz * H, sx ? H * 2 : 0.24, 0.2, sz ? H * 2 : 0.24, 0x8a6640);
  }

  // a bit of scenery to run around while you wait
  b.solid(CX - 18, Y + 1.6, CZ - 16, 12, 3.2, 9, 0xc9b79a);
  b.solid(CX - 18, Y + 3.4, CZ - 16, 13.5, 0.4, 10.5, 0x7a4a34);
  b.crate(CX - 9, Y, CZ - 8, 0.3);
  b.crate(CX - 10.4, Y, CZ - 6.6, -0.4, 0.8);
  b.barrel(CX - 6, Y, CZ - 11);
  b.crate(CX + 14, Y, CZ + 12, 0.2);
  b.crate(CX + 15.6, Y, CZ + 13.4, 0.5, 0.8);
  b.crate(CX + 14.6, Y, CZ + 11.0, -0.2, 0.7);
  b.table(CX + 10, Y, CZ - 14, 0.4, 2.0, 1.1);
  b.solid(CX + 20, Y + 2.4, CZ - 6, 3.0, 4.8, 3.0, 0xb9c6d2);   // a block to climb
  b.solid(CX + 24, Y + 1.2, CZ - 6, 3.0, 2.4, 3.0, 0xb9c6d2);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.3;
    const r = H - 9;
    const x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r;
    b.deco(x, Y + 2.6, z, 0.7, 5.2, 0.7, 0x5a3d24);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(2.6, 4.6, 7),
      new THREE.MeshLambertMaterial({ color: 0x2f6d2c, flatShading: true }));
    leaf.position.set(x, Y + 7.0, z);
    leaf.castShadow = true;
    b.group.add(leaf);
  }
  b.finalize();
  return b;
}

export class BattleBus {
  constructor(scene, rng) {
    this.t = 0;                      // 0..1 along the route
    this.done = false;
    const a = rng() * TAU;
    const span = WORLD.half * 1.35;
    this.start = new THREE.Vector3(Math.cos(a) * -span, BUS_ALTITUDE, Math.sin(a) * -span);
    this.end = new THREE.Vector3(Math.cos(a) * span, BUS_ALTITUDE, Math.sin(a) * span);
    this.heading = Math.atan2(this.end.x - this.start.x, this.end.z - this.start.z);
    this.pos = this.start.clone();

    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.2, 4.4, 15),
      new THREE.MeshLambertMaterial({ color: 0x2f6fd0 }));
    body.castShadow = true;
    g.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.5, 15.2),
      new THREE.MeshLambertMaterial({ color: 0x1d4f9c }));
    roof.position.y = 2.4;
    g.add(roof);
    for (let i = -5; i <= 5; i += 2.5) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(5.3, 1.3, 1.8),
        new THREE.MeshLambertMaterial({ color: 0x9fd8ec }));
      win.position.set(0, 0.7, i);
      g.add(win);
    }
    for (const s of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.7, 10),
        new THREE.MeshLambertMaterial({ color: 0x1a1c20 }));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(s * 2.6, -2.3, 4.4);
      g.add(wheel);
      const wheel2 = wheel.clone();
      wheel2.position.z = -4.4;
      g.add(wheel2);
    }
    const balloon = new THREE.Mesh(new THREE.SphereGeometry(7.4, 18, 14),
      new THREE.MeshLambertMaterial({ color: 0x3aa0ff }));
    balloon.position.y = 15;
    balloon.scale.set(1, 1.15, 1);
    g.add(balloon);
    for (let i = 0; i < 6; i++) {
      const a2 = (i / 6) * TAU;
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 9, 4),
        new THREE.MeshLambertMaterial({ color: 0x2a2d33 }));
      rope.position.set(Math.cos(a2) * 3.4, 7.2, Math.sin(a2) * 3.4);
      g.add(rope);
    }
    g.frustumCulled = false;
    scene.add(g);
    this.mesh = g;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }

  posAt(t, out = new THREE.Vector3()) {
    return out.lerpVectors(this.start, this.end, clamp(t, 0, 1));
  }

  /** Route fraction that passes closest to a world point. */
  closestT(x, z) {
    const dx = this.end.x - this.start.x, dz = this.end.z - this.start.z;
    const len2 = dx * dx + dz * dz;
    return clamp(((x - this.start.x) * dx + (z - this.start.z) * dz) / len2, 0, 1);
  }

  update(dt) {
    if (this.done) return;
    this.t += dt / BUS_TIME;
    if (this.t >= 1) { this.t = 1; this.done = true; }
    this.posAt(this.t, this.pos);
    this.mesh.position.copy(this.pos);
    this.mesh.position.y += Math.sin(this.t * 40) * 0.6;
    this.mesh.rotation.z = Math.sin(this.t * 26) * 0.02;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}

/** Where a bot wants to land: mostly the named POIs, sometimes open ground. */
export function pickDropTarget(rng) {
  if (rng() < 0.72) {
    const p = POIS[Math.floor(rng() * POIS.length)];
    const a = rng() * TAU, d = rng() * 120;
    return { x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d };
  }
  let x, z, tries = 0;
  do {
    x = (rng() * 2 - 1) * (WORLD.half - 150);
    z = (rng() * 2 - 1) * (WORLD.half - 150);
  } while (heightAt(x, z) < 6 && tries++ < 20);
  return { x, z };
}
