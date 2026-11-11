/* Low polygon models built out of boxes and cylinders: cars and street furniture. */
import * as THREE from 'three';
import { Merger } from '../render/merge.js';

export const CAR = { halfW: 0.9, halfH: 0.62, halfL: 2.15, centreY: 0.75 };

export const CAR_PAINT = [0xb8312b, 0x2d4f8c, 0xd9d9d6, 0x1c1d20, 0x6b7076, 0x2f6b4a, 0xe0b021, 0x7a2f55, 0xc96a2a, 0x3c8d94];

const _lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
const _glow = new THREE.MeshBasicMaterial({ vertexColors: true });

/**
 * A car, nose toward +Z, wheels on y = 0. Returns a Group of two meshes:
 * the painted body, and the lamps, which ignore the light.
 */
export function buildCar(paint, kind = 'sedan') {
  const m = new Merger(), g = new Merger();
  const van = kind === 'van', taxi = kind === 'taxi';
  const dark = 0x15171a, glass = 0x1b242d, trim = 0x2a2c30;
  // body
  m.box(0, 0.52, 0, 1.8, 0.5, 4.3, paint);
  if (van) {
    m.box(0, 1.17, -0.25, 1.74, 0.8, 3.5, paint);
    m.box(0, 1.25, 1.52, 1.6, 0.5, 0.08, glass);
    m.box(0.875, 1.28, 0.9, 0.02, 0.42, 0.9, glass); m.box(-0.875, 1.28, 0.9, 0.02, 0.42, 0.9, glass);
  } else {
    m.box(0, 1.03, -0.2, 1.62, 0.52, 2.3, glass);
    m.box(0, 1.31, -0.2, 1.64, 0.06, 2.12, paint);
    // pillars, so the cabin does not read as a black brick
    for (const z of [0.93, -0.2, -1.33]) { m.box(0.8, 1.03, z, 0.06, 0.52, 0.09, paint); m.box(-0.8, 1.03, z, 0.06, 0.52, 0.09, paint); }
  }
  m.box(0, 0.36, 2.12, 1.84, 0.22, 0.22, trim); m.box(0, 0.36, -2.12, 1.84, 0.22, 0.22, trim);
  m.box(0, 0.6, 2.16, 0.9, 0.16, 0.04, dark);                       // grille
  m.box(0.98, 0.98, 0.75, 0.16, 0.1, 0.2, paint); m.box(-0.98, 0.98, 0.75, 0.16, 0.1, 0.2, paint);
  for (const sx of [0.86, -0.86]) for (const sz of [1.32, -1.32]) {
    m.cyl(sx, 0.33, sz, 0.66, 0.26, dark, 0, 0, Math.PI / 2);
    m.cyl(sx + Math.sign(sx) * 0.12, 0.33, sz, 0.34, 0.04, 0x8d9197, 0, 0, Math.PI / 2);
  }
  if (taxi) m.box(0, 1.42, -0.1, 0.5, 0.16, 0.22, 0xf4e9b0);
  // lamps
  g.box(0.62, 0.62, 2.16, 0.34, 0.14, 0.05, 0xfff3c8); g.box(-0.62, 0.62, 2.16, 0.34, 0.14, 0.05, 0xfff3c8);
  g.box(0.66, 0.64, -2.16, 0.3, 0.12, 0.05, 0xc41515); g.box(-0.66, 0.64, -2.16, 0.3, 0.12, 0.05, 0xc41515);
  const group = new THREE.Group();
  const body = new THREE.Mesh(m.build(), _lambert);
  body.castShadow = true; body.receiveShadow = true;
  const lamps = new THREE.Mesh(g.build(), _glow);
  group.add(body, lamps);
  group.userData.brake = lamps;
  return group;
}

/** A street lamp, standing at the origin with its arm reaching toward +X. */
export function addLamp(m, glow, x, y, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  m.cyl(x, y + 2.6, z, 0.14, 5.2, 0x2b2f33);
  m.cyl(x, y + 0.25, z, 0.26, 0.5, 0x24282c);
  m.box(x + c * 0.7, y + 5.15, z - s * 0.7, 1.5, 0.08, 0.08, 0x2b2f33, 0, yaw, 0);
  m.box(x + c * 1.35, y + 5.1, z - s * 1.35, 0.55, 0.12, 0.26, 0x2b2f33, 0, yaw, 0);
  glow.box(x + c * 1.35, y + 5.03, z - s * 1.35, 0.45, 0.03, 0.2, 0xfff0bf, 0, yaw, 0);
}

export function addTree(m, x, y, z, seed) {
  const r = (n) => { const v = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453; return v - Math.floor(v); };
  const h = 2.6 + r(1) * 1.2;
  m.cyl(x, y + h / 2, z, 0.34, h, 0x4a3524);
  const greens = [0x35502c, 0x2c4525, 0x406034, 0x4a6b3a];
  m.box(x, y + h + 0.7, z, 2.9 + r(2) * 0.6, 1.7, 2.9 + r(3) * 0.6, greens[(r(4) * 4) | 0], 0, r(5) * 1.5, 0);
  m.box(x + (r(6) - 0.5) * 0.6, y + h + 1.9, z + (r(7) - 0.5) * 0.6, 2.1, 1.3, 2.1, greens[(r(8) * 4) | 0], 0, r(9) * 1.5, 0);
  m.box(x, y + h + 2.8, z, 1.2, 0.9, 1.2, greens[(r(10) * 4) | 0], 0, r(11) * 1.5, 0);
}

/** A bench whose sitter would face +Z before `yaw` turns it. */
export function addBench(m, x, y, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  let p = at(0, 0); m.box(p[0], y + 0.45, p[1], 1.7, 0.07, 0.46, 0x6e4f33, 0, yaw, 0);
  p = at(0, -0.22); m.box(p[0], y + 0.78, p[1], 1.7, 0.42, 0.06, 0x6e4f33, 0, yaw, 0);
  for (const lx of [-0.75, 0.75]) { p = at(lx, 0); m.box(p[0], y + 0.22, p[1], 0.07, 0.44, 0.44, 0x24282c, 0, yaw, 0); }
}

export function addBin(m, x, y, z) {
  m.cyl(x, y + 0.45, z, 0.5, 0.9, 0x2e4a38);
  m.cyl(x, y + 0.92, z, 0.54, 0.06, 0x1f3227);
}

export function addHydrant(m, x, y, z) {
  m.cyl(x, y + 0.3, z, 0.22, 0.6, 0xb3261e);
  m.cyl(x, y + 0.64, z, 0.16, 0.1, 0xb3261e);
  m.box(x, y + 0.4, z, 0.4, 0.1, 0.1, 0x8f1e18);
}

export const propMaterial = _lambert;
export const glowMaterial = _glow;
