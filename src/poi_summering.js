// Summering Falls — forest POI on the north edge of the island.
// Five coloured 3-storey apartment blocks (living room / storage / living room)
// ringed by seven houses (living room, kitchen, bathroom) beside the falls.
import * as THREE from 'three';
import { StructureBuilder } from './props.js';

const GLASS = { matOpts: { transparent: true, opacity: 0.35 } };

const BLOCK_COLORS = [
  { wall: 0xc4564a, trim: 0x8e3a31, name: 'Red' },
  { wall: 0x4a7ec4, trim: 0x31558e, name: 'Blue' },
  { wall: 0x5aa85c, trim: 0x3a7a3c, name: 'Green' },
  { wall: 0xd8b34a, trim: 0xa07f2c, name: 'Yellow' },
  { wall: 0x8f5ac4, trim: 0x63398e, name: 'Purple' },
];

function apartment(b, ox, oy, oz, colors, index) {
  const W = 12, D = 11, T = 0.3, FH = 3.35;
  const wall = colors.wall, trim = colors.trim;
  const floorColor = 0x9c7a52;
  const hole = { x0: ox + 1.4, x1: ox + 4.4, z0: oz - D / 2 + 0.4, z1: oz - D / 2 + 4.2 };

  // ground slab
  b.solid(ox, oy - 0.15, oz, W + 1.2, 0.3, D + 1.2, 0x8b8b86);

  for (let f = 0; f < 3; f++) {
    const y = oy + f * FH;
    if (f > 0) b.slabWithHole(ox, y - 0.1, oz, W, D, 0.2, floorColor, hole);

    // exterior walls: south has the entrance on the ground floor, windows above
    const doorW = 1.5, doorH = 2.4;
    if (f === 0) {
      b.wallWithHole(ox, y + FH / 2, oz + D / 2, W, FH, T, wall, 'x', 0, doorW, doorH, 0);
      b.door(ox, y, oz + D / 2, doorW, doorH, 'x', { color: trim });
    } else {
      b.wallWithHole(ox, y + FH / 2, oz + D / 2, W, FH, T, wall, 'x', 0, 3.2, 1.5, 0.9);
      b.deco(ox, y + 1.65, oz + D / 2, 3.2, 1.5, 0.08, 0xcfe8f5, 0, GLASS);
      b.solid(ox, y + 0.5, oz + D / 2 + 0.35, 3.6, 0.12, 0.9, trim);   // balcony
      b.deco(ox, y + 0.9, oz + D / 2 + 0.78, 3.6, 0.75, 0.08, trim);
    }
    // north wall with window
    b.wallWithHole(ox, y + FH / 2, oz - D / 2, W, FH, T, wall, 'x', -3, 2.0, 1.4, 1.0);
    b.deco(ox - 3, y + 1.7, oz - D / 2, 2.0, 1.4, 0.08, 0xcfe8f5, 0, GLASS);
    // east / west walls with windows
    for (const sx of [-1, 1]) {
      b.wallWithHole(ox + sx * W / 2, y + FH / 2, oz, D, FH, T, wall, 'z', 1.5, 2.2, 1.4, 1.0);
      b.deco(ox + sx * W / 2, y + 1.7, oz + 1.5, 0.08, 1.4, 2.2, 0xcfe8f5, 0, GLASS);
    }

    // stairs up (except from the top floor)
    if (f < 2) {
      b.stairs(ox + 2.9, y, oz - D / 2 + 0.6, y + FH, 'z', 2.6, trim, 1);
      b.solid(ox + 1.35, y + 1.1, oz - D / 2 + 2.0, 0.12, 1.0, 3.4, trim);  // banister
    }

    // ---- furnishing -----------------------------------------------------
    if (f === 1) {
      // storage room
      b.crate(ox - 4.2, y, oz - 3.4, 0.3);
      b.crate(ox - 4.4, y + 0.9, oz - 3.3, 0.7, 0.8);
      b.crate(ox - 3.0, y, oz - 4.0, -0.2);
      b.crate(ox - 4.6, y, oz - 1.6, 0.1, 0.8);
      b.barrel(ox - 2.0, y, oz - 2.2);
      b.barrel(ox - 2.7, y, oz - 1.2);
      b.shelf(ox - 5.4, y, oz + 1.6, Math.PI / 2, 3.0, 2.1);
      b.shelf(ox + 5.4, y, oz + 2.4, -Math.PI / 2, 2.6, 2.1);
      b.crate(ox + 4.4, y, oz + 4.2, 0.5);
      b.table(ox + 1.0, y, oz + 3.6, 0, 1.8, 1.0);
      if (index % 2 === 0) b.chestSpot(ox - 3.6, y, oz - 2.6, 0.4, 'apartment');
      else b.chestSpot(ox + 3.4, y, oz + 3.4, -0.5, 'apartment');
    } else {
      // living rooms (ground + top)
      const rugC = f === 0 ? 0x8c3b45 : 0x3b5c8c;
      b.rug(ox - 1.6, y, oz + 1.6, 0, 4.0, 3.0, rugC);
      b.sofa(ox - 1.6, y, oz + 0.1, 0, f === 0 ? 0x8a4a3a : 0x3f5f7a);
      b.sofa(ox - 4.6, y, oz + 2.4, Math.PI / 2, f === 0 ? 0x8a4a3a : 0x3f5f7a);
      b.table(ox - 1.6, y, oz + 2.0, 0, 1.4, 0.8);
      b.tv(ox - 1.6, y, oz + 4.3, Math.PI);
      b.shelf(ox + 5.3, y, oz - 1.0, -Math.PI / 2, 2.4, 1.9);
      b.chair(ox + 3.6, y, oz + 3.6, -0.6);
      b.table(ox + 4.4, y, oz + 4.0, 0.3, 1.0, 0.7);
      if (f === 2) {
        b.crate(ox + 4.8, y, oz - 4.0, 0.2, 0.8);
        b.chestSpot(ox - 4.0, y, oz + 4.0, 0.3, 'apartment');
      } else {
        b.chestSpot(ox + 4.2, y, oz + 1.0, -1.2, 'apartment');
      }
    }
  }

  // roof
  const top = oy + 3 * FH;
  b.slabWithHole(ox, top - 0.1, oz, W, D, 0.2, floorColor, hole);
  b.solid(ox, top + 0.35, oz, W + 0.8, 0.3, D + 0.8, trim);
  for (const s of [-1, 1]) {
    b.solid(ox + s * (W / 2 + 0.2), top + 0.9, oz, 0.25, 0.9, D + 0.8, trim);
    b.solid(ox, top + 0.9, oz + s * (D / 2 + 0.2), W + 0.8, 0.9, 0.25, trim);
  }
  b.deco(ox + 4.5, top + 1.4, oz - 3.5, 1.2, 1.8, 1.2, trim);
}

function house(b, ox, oy, oz, idx) {
  // Houses are built in world space (colliders are AABB) so they stay axis
  // aligned; variety comes from the wall colour and the furniture layout.
  const W = 10, D = 9, T = 0.28, H = 3.1;
  const wall = [0xd9cdb5, 0xc9b79a, 0xbfc7cf, 0xd6c0a8, 0xc8d0c2][idx % 5];
  const trim = 0x6b4a2e;
  b.solid(ox, oy - 0.15, oz, W + 1.0, 0.3, D + 1.0, 0x8b8b86);

  // outer shell: door on +Z
  b.wallWithHole(ox, oy + H / 2, oz + D / 2, W, H, T, wall, 'x', -2.4, 1.4, 2.3, 0);
  b.door(ox - 2.4, oy, oz + D / 2, 1.4, 2.3, 'x', { color: trim });
  b.wallWithHole(ox, oy + H / 2, oz - D / 2, W, H, T, wall, 'x', 2.0, 1.8, 1.3, 1.0);
  b.deco(ox + 2.0, oy + 1.65, oz - D / 2, 1.8, 1.3, 0.06, 0xcfe8f5, 0, GLASS);
  b.wallWithHole(ox - W / 2, oy + H / 2, oz, D, H, T, wall, 'z', 1.6, 1.8, 1.3, 1.0);
  b.deco(ox - W / 2, oy + 1.65, oz + 1.6, 0.06, 1.3, 1.8, 0xcfe8f5, 0, GLASS);
  b.wallWithHole(ox + W / 2, oy + H / 2, oz, D, H, T, wall, 'z', -1.8, 1.6, 1.3, 1.0);
  b.deco(ox + W / 2, oy + 1.65, oz - 1.8, 0.06, 1.3, 1.6, 0xcfe8f5, 0, GLASS);

  // interior: living room across the +Z half, kitchen back-left, bathroom back-right
  const midZ = oz - 0.6;
  b.wallWithHole(ox, oy + H / 2, midZ, W, H, 0.2, 0xe4ddd0, 'x', -3.0, 1.4, 2.2, 0);   // living -> kitchen
  const bathZ = (midZ + (oz - D / 2)) / 2, bathLen = midZ - (oz - D / 2);
  b.wallWithHole(ox + 1.0, oy + H / 2, bathZ, bathLen, H, 0.2, 0xe4ddd0, 'z', 0, 1.2, 2.2, 0);
  b.door(ox + 1.0, oy, bathZ, 1.2, 2.2, 'z', { color: 0xd8d2c6 });

  // ceiling + roof
  b.solid(ox, oy + H + 0.1, oz, W, 0.2, D, 0xbca88a);
  b.solid(ox, oy + H + 0.5, oz, W + 0.9, 0.25, D + 0.9, 0x7a4a34);
  b.deco(ox, oy + H + 1.15, oz, W * 0.8, 1.1, D * 0.8, 0x8a5540);
  b.deco(ox + 3.0, oy + H + 1.9, oz - 2.4, 0.8, 1.6, 0.8, 0x5f5a55);

  // --- living room ---
  b.rug(ox - 1.0, oy, oz + 2.0, 0, 3.4, 2.4, 0x7a4450);
  b.sofa(ox - 1.0, oy, oz + 1.0, 0);
  b.table(ox - 1.0, oy, oz + 2.6, 0, 1.3, 0.8);
  b.tv(ox - 1.0, oy, oz + 3.9, Math.PI);
  b.chair(ox + 3.2, oy, oz + 2.4, -0.8);
  b.shelf(ox + 4.4, oy, oz + 0.4, -Math.PI / 2, 2.0, 1.8);

  // --- kitchen (back-left) ---
  b.counter(ox - 3.4, oy, oz - 3.6, 0, 3.2);
  b.stove(ox - 0.9, oy, oz - 3.6, 0);
  b.fridge(ox - 4.4, oy, oz - 1.9, Math.PI / 2);
  b.table(ox - 2.4, oy, oz - 1.6, 0, 1.5, 0.9);
  b.chair(ox - 3.3, oy, oz - 1.6, Math.PI / 2);
  b.chair(ox - 1.5, oy, oz - 1.6, -Math.PI / 2);

  // --- bathroom (back-right) ---
  b.toilet(ox + 3.9, oy, oz - 3.5, -Math.PI / 2);
  b.sink(ox + 1.9, oy, oz - 3.9, 0);
  b.bathtub(ox + 3.1, oy, oz - 1.6, 0);
  b.deco(ox + 3.0, oy + 0.02, oz - 2.6, 3.8, 0.03, 3.6, 0xdfe6ee);
  b.chestSpot(ox + 3.3, oy, oz - 2.8, Math.PI, 'bathroom');
}

function falls(b, cx, cz) {
  // Cliff face + waterfall between the town plateau and the pond below.
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x63c8ec, transparent: true, opacity: 0.7 });
  const foamMat = new THREE.MeshLambertMaterial({ color: 0xf0fbff, transparent: true, opacity: 0.75 });
  for (let i = 0; i < 3; i++) {
    const x = cx - 9 + i * 9;
    const fall = new THREE.Mesh(new THREE.BoxGeometry(6.5, 9.5, 0.6), waterMat);
    fall.position.set(x, 12.0, cz - 84 - i * 1.5);
    fall.rotation.x = -0.16;
    b.group.add(fall);
    const foam = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 5.2, 0.5, 12), foamMat);
    foam.position.set(x, 8.75, cz - 90 - i * 1.5);
    b.group.add(foam);
  }
  // rocks along the lip
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI - Math.PI / 2;
    const x = cx + Math.sin(a) * 26, z = cz - 76 + Math.cos(a) * 6;
    b.deco(x, 15.4, z, 2.2 + (i % 3), 1.6, 2.0, 0x74716c, i * 0.7);
  }
  // little wooden bridge over the stream
  for (let i = 0; i < 9; i++) b.solid(cx - 4 + i, 16.4, cz - 70, 1.0, 0.16, 3.2, 0x8a6640);
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++)
    b.deco(cx - 4 + i * 2, 16.9, cz - 70 + s * 1.5, 0.14, 0.9, 0.14, 0x6b4526);
}

export function buildSummeringFalls(scene, physics) {
  const b = new StructureBuilder(scene, physics, 'summering-falls');
  const CX = 0, CZ = -940, Y = 16;

  const blocks = [
    [-19, -16], [0, -19], [19, -16], [-11, 6], [11, 6],
  ];
  blocks.forEach((p, i) => apartment(b, CX + p[0], Y, CZ + p[1], BLOCK_COLORS[i], i));

  const houses = [
    [-52, -44], [52, -44], [-64, 12], [64, 12],
    [-38, 46], [8, 52], [50, 46],
  ];
  houses.forEach((h, i) => house(b, CX + h[0], Y, CZ + h[1], i));

  // paths + street furniture
  for (let i = -6; i <= 6; i++) b.deco(CX + i * 6, Y + 0.03, CZ + 24, 6.0, 0.05, 5.0, 0x8f8a80);
  for (let i = -3; i <= 3; i++) b.deco(CX + 30, Y + 0.03, CZ + 24 + i * 6, 5.0, 0.05, 6.0, 0x8f8a80);
  for (let i = 0; i < 6; i++) {
    const x = CX - 40 + i * 16;
    b.solid(x, Y + 2.0, CZ + 30, 0.2, 4.0, 0.2, 0x4a4f55);
    b.deco(x, Y + 4.1, CZ + 30, 0.5, 0.3, 0.9, 0x2b3037);
  }
  falls(b, CX, CZ);
  b.finalize();
  return b;
}
