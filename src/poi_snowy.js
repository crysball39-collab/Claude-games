// Snowy Snarks — a snow-caked castle on the west side of the snow biome.
// Two floors plus three towers, repurposed as a field hospital: medical beds,
// IV stands, cabinets and monitors throughout, half of it buried in snow/ice.
import * as THREE from 'three';
import { StructureBuilder } from './props.js';
import { makeRng } from './util.js';

const STONE = 0x93a3b3;
const STONE_DARK = 0x6f7d8b;
const SNOW = 0xf4f9ff;
const ICE = { matOpts: { transparent: true, opacity: 0.55 } };
const rng = makeRng(90210);

function snowCap(b, x, y, z, w, d, h = 0.22) {
  b.deco(x, y + h / 2, z, w, h, d, SNOW);
}
function iceChunk(b, x, y, z, s = 1) {
  b.deco(x, y + 0.4 * s, z, 1.1 * s, 0.8 * s, 0.9 * s, 0x9fd8ec, rng() * 3, ICE);
}

function battlements(b, x, y, z, w, d, step = 1.6) {
  for (let i = -w / 2 + step; i <= w / 2 - step + 0.01; i += step * 2) {
    for (const sz of [-1, 1]) {
      b.solid(x + i, y + 0.55, z + sz * d / 2, step, 1.1, 0.5, STONE);
      snowCap(b, x + i, y + 1.1, z + sz * d / 2, step, 0.5);
    }
  }
  for (let i = -d / 2 + step; i <= d / 2 - step + 0.01; i += step * 2) {
    for (const sx of [-1, 1]) {
      b.solid(x + sx * w / 2, y + 0.55, z + i, 0.5, 1.1, step, STONE);
      snowCap(b, x + sx * w / 2, y + 1.1, z + i, 0.5, step);
    }
  }
}

/** A square tower with three flights of stairs winding up to a battlemented roof. */
function tower(b, cx, cz, y0, height, opts = {}) {
  const S = 9.4, T = 0.6, inner = S / 2 - T;
  const top = y0 + height;
  const face = opts.face || 'z+';
  const doorW = 1.8, doorH = 2.8;

  const wall = (side) => {
    const isDoor = side === face;
    if (side === 'z+' || side === 'z-') {
      const zz = cz + (side === 'z+' ? S / 2 : -S / 2);
      if (isDoor) b.wallWithHole(cx, y0 + height / 2, zz, S, height, T, STONE, 'x', 0, doorW, doorH, 0);
      else b.wallWithHole(cx, y0 + height / 2, zz, S, height, T, STONE, 'x', 0, 1.1, 1.8, height - 4.6);
    } else {
      const xx = cx + (side === 'x+' ? S / 2 : -S / 2);
      if (isDoor) b.wallWithHole(xx, y0 + height / 2, cz, S, height, T, STONE, 'z', 0, doorW, doorH, 0);
      else b.wallWithHole(xx, y0 + height / 2, cz, S, height, T, STONE, 'z', 0, 1.1, 1.8, height - 4.6);
    }
  };
  ['z+', 'z-', 'x+', 'x-'].forEach(wall);
  b.solid(cx, y0 - 0.15, cz, S, 0.3, S, STONE_DARK);

  // three flights + two landings, hugging the inside of the shell
  const h3 = height / 3;
  b.stairs(cx - 3.0, y0, cz - 2.5, y0 + h3, 'x', 2.0, STONE_DARK, 1);
  b.solid(cx + 2.7, y0 + h3 - 0.1, cz - 2.5, 2.0, 0.2, 2.0, STONE_DARK);
  b.stairs(cx + 2.6, y0 + h3, cz - 2.5, y0 + h3 * 2, 'z', 2.0, STONE_DARK, 1);
  b.solid(cx + 2.6, y0 + h3 * 2 - 0.1, cz + 2.9, 2.0, 0.2, 2.0, STONE_DARK);
  b.stairs(cx + 2.6, y0 + h3 * 2, cz + 2.6, top, 'x', 2.0, STONE_DARK, -1);

  b.slabWithHole(cx, top - 0.1, cz, S - T * 2, S - T * 2, 0.25, STONE, {
    x0: cx - inner, x1: cx - 1.1, z0: cz + 1.4, z1: cz + inner,
  });
  snowCap(b, cx + 1.2, top + 0.06, cz - 1.2, 4.6, 4.6, 0.1);
  battlements(b, cx, top, cz, S - 0.6, S - 0.6);
  if (opts.chest) b.chestSpot(cx + 1.4, top + 0.08, cz - 1.4, 0.6, 'tower');
  if (opts.medical) {
    b.medCabinet(cx - 2.8, y0, cz - 3.0, 0);
    b.crate(cx - 2.6, y0, cz + 2.6, 0.4);
    b.ivStand(cx - 1.2, y0, cz + 1.4);
  }
  return { top };
}

export function buildSnowySnarks(scene, physics) {
  const b = new StructureBuilder(scene, physics, 'snowy-snarks');
  const CX = -800, CZ = 820, G = 26;
  const Y0 = G + 1.4;                        // keep floor sits on a plinth
  const W = 44, D = 36, T = 0.7, FH = 4.4;
  const Y1 = Y0 + FH, ROOF = Y1 + FH;
  const x0 = CX - W / 2, x1 = CX + W / 2, z0 = CZ - D / 2, z1 = CZ + D / 2;
  const TOWER_Z = CZ - 6;

  // --- plinth + approach bridge -----------------------------------------
  b.solid(CX, G + 0.7, CZ, W + 20, 1.4, D + 20, STONE_DARK);
  snowCap(b, CX, G + 1.4, CZ, W + 20, D + 20, 0.06);
  for (let i = 0; i < 17; i++) b.solid(CX, Y0 - 0.15, z1 + 3.2 + i * 1.6, 7.0, 0.3, 1.6, 0x8a6640);
  for (const s of [-1, 1]) for (let i = 0; i < 9; i++) {
    b.solid(CX + s * 3.3, Y0 + 0.55, z1 + 3.6 + i * 3.0, 0.35, 1.1, 0.35, STONE);
    b.deco(CX + s * 3.3, Y0 + 1.15, z1 + 3.6 + i * 3.0, 0.5, 0.14, 0.5, SNOW);
  }
  for (let i = 0; i < 6; i++) b.solid(CX, Y0 - 0.4 - i * 0.24, z1 + 30.5 + i * 1.2, 7.0, 0.5, 1.2, STONE_DARK);
  b.chestSpot(CX + 1.9, Y0, z1 + 6.0, Math.PI, 'bridge');

  // --- outer walls -------------------------------------------------------
  const gateW = 3.6, gateH = 3.6;
  // ground floor
  b.wallWithHole(CX, Y0 + FH / 2, z1, W, FH, T, STONE, 'x', 0, gateW, gateH, 0);
  b.door(CX - gateW / 4, Y0, z1, gateW / 2, gateH, 'x', { color: 0x6b4526, flip: true });
  b.door(CX + gateW / 4, Y0, z1, gateW / 2, gateH, 'x', { color: 0x6b4526 });
  b.wallWithHole(CX, Y0 + FH / 2, z0, W, FH, T, STONE, 'x', 12, 1.8, 2.8, 0);        // -> north tower
  b.wallWithHole(x0, Y0 + FH / 2, CZ, D, FH, T, STONE, 'z', TOWER_Z - CZ, 1.8, 2.8, 0);
  b.wallWithHole(x1, Y0 + FH / 2, CZ, D, FH, T, STONE, 'z', TOWER_Z - CZ, 1.8, 2.8, 0);
  // upper floor
  b.wallWithHole(CX, Y1 + FH / 2, z1, W, FH, T, STONE, 'x', 0, 5.0, 2.6, 0.8);
  b.wallWithHole(CX, Y1 + FH / 2, z0, W, FH, T, STONE, 'x', -8, 2.0, 2.0, 1.2);
  b.wallWithHole(x0, Y1 + FH / 2, CZ, D, FH, T, STONE, 'z', 8, 1.6, 2.0, 1.2);
  b.wallWithHole(x1, Y1 + FH / 2, CZ, D, FH, T, STONE, 'z', 8, 1.6, 2.0, 1.2);

  // slabs: the upper floor covers the back of the keep, the hall is double height
  b.solid(CX, Y0 - 0.15, CZ, W, 0.3, D, 0x6f6a63);
  const upperZ0 = z0, upperZ1 = CZ + 2;
  b.solid(CX, Y1 - 0.15, (upperZ0 + upperZ1) / 2, W, 0.3, upperZ1 - upperZ0, 0x6f6a63);
  for (let i = 0; i < 21; i++) b.solid(x0 + 1.5 + i * 2.05, Y1 + 0.55, upperZ1, 0.3, 1.1, 0.3, STONE);
  b.solid(CX, Y1 + 1.15, upperZ1, W - 2, 0.2, 0.45, STONE);
  b.solid(CX, ROOF - 0.15, CZ, W, 0.3, D, 0x6f6a63);
  snowCap(b, CX, ROOF, CZ, W, D, 0.25);
  battlements(b, CX, ROOF + 0.25, CZ, W, D, 2.0);

  // --- great hall --------------------------------------------------------
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    b.solid(CX + sx * 14, Y0 + FH / 2, CZ + sz * 7, 1.2, FH * 2, 1.2, STONE_DARK);
  b.rug(CX, Y0, CZ + 8, 0, 8, 16, 0x7a2f3a);

  // dinner table (chest spawns on it)
  const dinnerZ = CZ + 9.5;
  b.table(CX, Y0, dinnerZ, 0, 9.0, 2.4, 0x6b4526);
  for (let i = -3; i <= 3; i++) {
    b.chair(CX + i * 1.35, Y0, dinnerZ - 2.0, 0);
    b.chair(CX + i * 1.35, Y0, dinnerZ + 2.0, Math.PI);
    b.deco(CX + i * 1.35, Y0 + 0.92, dinnerZ, 0.34, 0.06, 0.34, 0xe8e2d4);
  }
  b.deco(CX - 2.0, Y0 + 1.02, dinnerZ, 0.3, 0.34, 0.3, 0xd8c070);
  iceChunk(b, CX + 3.4, Y0 + 0.87, dinnerZ, 0.7);
  b.chestSpot(CX + 1.2, Y0 + 0.9, dinnerZ, 0.2, 'dining');

  // throne on a dais
  const throneZ = z0 + 6;
  b.solid(CX, Y0 + 0.2, throneZ, 12, 0.4, 6, STONE_DARK);
  b.solid(CX, Y0 + 0.6, throneZ - 1.2, 10, 0.4, 3.6, STONE_DARK);
  for (let i = 0; i < 3; i++) b.solid(CX, Y0 + 0.13 + i * 0.13, throneZ + 3.3 + i * 0.55, 6, 0.26, 0.55, STONE_DARK);
  b.solid(CX, Y0 + 1.35, throneZ - 1.4, 1.9, 1.1, 1.6, 0x7d6a55);
  b.solid(CX, Y0 + 2.6, throneZ - 2.3, 2.1, 3.4, 0.4, 0x7d6a55);
  b.deco(CX, Y0 + 4.4, throneZ - 2.3, 1.2, 0.5, 0.5, 0xd8c070);
  for (const s of [-1, 1]) b.deco(CX + s * 1.1, Y0 + 1.9, throneZ - 1.4, 0.25, 1.2, 1.6, 0x6a5a48);
  snowCap(b, CX, Y0 + 3.05, throneZ - 2.3, 2.1, 0.4, 0.16);
  b.chestSpot(CX, Y0 + 1.95, throneZ - 1.2, Math.PI, 'throne');
  b.torch(CX - 5.6, Y0 + 2.6, throneZ - 2.6, true);
  b.torch(CX + 5.6, Y0 + 2.6, throneZ - 2.6, true);

  // field hospital on the ground floor
  for (let i = 0; i < 4; i++) {
    const z = CZ - 5 + i * 4.4;
    b.medBed(x0 + 4.2, Y0, z, 0);
    b.ivStand(x0 + 5.9, Y0, z - 0.9);
    b.medBed(x1 - 4.2, Y0, z, 0);
    b.ivStand(x1 - 5.9, Y0, z - 0.9);
  }
  b.medCabinet(x0 + 2.2, Y0, z0 + 12, Math.PI / 2);
  b.medCabinet(x1 - 2.2, Y0, z0 + 12, -Math.PI / 2);
  b.monitorDesk(x1 - 5.0, Y0, z0 + 16, -Math.PI / 2, 2);
  iceChunk(b, x0 + 7.5, Y0, CZ + 3, 1.3);
  iceChunk(b, x1 - 8.2, Y0, CZ - 7, 1.0);
  snowCap(b, CX - 8, Y0 + 0.02, CZ + 14, 6, 5, 0.08);
  snowCap(b, CX + 9, Y0 + 0.02, CZ + 16, 5, 4, 0.08);
  b.torch(x0 + 1.4, Y0 + 2.4, CZ + 8, true);
  b.torch(x1 - 1.4, Y0 + 2.4, CZ + 8, true);

  // stairs to the upper floor along the west wall
  b.stairs(x0 + 3.2, Y0, CZ + 8.5, Y1, 'z', 3.0, STONE_DARK, -1);
  b.solid(x0 + 1.6, Y0 + 1.2, CZ + 6.0, 0.25, 1.1, 5.5, STONE);

  // --- upper floor: armoury (west) + ward (east) -------------------------
  const midX = CX + 2;
  const upMidZ = (upperZ0 + upperZ1) / 2;
  b.wallWithHole(midX, Y1 + FH / 2, upMidZ, upperZ1 - upperZ0, FH, 0.4, STONE, 'z', 4, 1.6, 2.5, 0);
  b.door(midX, Y1, upMidZ + 4, 1.6, 2.5, 'z', { color: 0x6b4526 });

  for (let i = 0; i < 5; i++) {
    const z = z0 + 3.5 + i * 3.2;
    b.shelf(x0 + 1.7, Y1, z, Math.PI / 2, 2.6, 2.2);
    for (let k = 0; k < 3; k++)
      b.deco(x0 + 2.3, Y1 + 0.6 + k * 0.72, z, 0.12, 0.6, 1.6, k % 2 ? 0x8a6640 : 0x9aa3ad, 0.2);
  }
  for (let i = 0; i < 4; i++) {
    b.solid(midX - 3.2, Y1 + 1.1, z0 + 4 + i * 4, 0.4, 2.2, 0.4, 0x6b4526);
    b.deco(midX - 3.2, Y1 + 2.45, z0 + 4 + i * 4, 1.0, 0.55, 1.0, 0x9aa3ad);
  }
  b.crate(x0 + 5.4, Y1, z0 + 4.5, 0.3);
  b.crate(x0 + 6.6, Y1, z0 + 6.0, -0.4, 0.8);
  b.crate(x0 + 5.6, Y1, z0 + 12.0, 0.2);
  b.barrel(x0 + 7.4, Y1, z0 + 9.0);
  b.chestSpot(x0 + 4.4, Y1, z0 + 8.5, 0.5, 'armory');

  for (let i = 0; i < 4; i++) {
    const z = z0 + 4 + i * 4.2;
    b.medBed(x1 - 4.2, Y1, z, 0);
    b.ivStand(x1 - 5.9, Y1, z - 0.9);
  }
  b.medCabinet(midX + 2.6, Y1, z0 + 2.4, 0);
  b.medCabinet(midX + 5.2, Y1, z0 + 2.4, 0);
  b.monitorDesk(x1 - 4.2, Y1, upperZ1 - 3.0, Math.PI, 3);
  b.table(midX + 5.2, Y1, z0 + 10, 0, 2.0, 1.2, 0xd8dde2);
  b.chair(midX + 5.2, Y1, z0 + 11.6, Math.PI);
  iceChunk(b, midX + 3.2, Y1, z0 + 14, 1.1);
  snowCap(b, x1 - 6, Y1 + 0.02, z0 + 6, 7, 8, 0.07);

  // --- towers (attached outside each wall, entered through the keep) -----
  tower(b, x0 - 4.65, TOWER_Z, Y0, 15.4, { face: 'x+', chest: true, medical: true });
  tower(b, x1 + 4.65, TOWER_Z, Y0, 15.4, { face: 'x-', medical: true });
  tower(b, CX + 12, z0 - 4.65, Y0, 17.2, { face: 'z+', medical: true });

  // exterior drifts
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const r = 38 + (i % 4) * 3.5;
    b.deco(CX + Math.cos(a) * r, G + 0.35, CZ + Math.sin(a) * r, 5 + (i % 3) * 2, 0.7, 4 + (i % 2) * 2, SNOW, a);
  }
  for (let i = 0; i < 10; i++) iceChunk(b, CX - 34 + i * 7, G, CZ + 40 + (i % 3) * 4, 1 + (i % 3) * 0.4);
  b.finalize();
  return b;
}
