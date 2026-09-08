// Pumped Palms — a desert oasis settlement sitting on top of a buried research
// lab: a long hallway with four one-way-glass observation rooms, a control room
// at one end and a resting unit at the other.
import * as THREE from 'three';
import { StructureBuilder } from './props.js';
import { makeRng } from './util.js';

const SAND_WALL = 0xd9c39a;
const CONCRETE = 0x9aa0a6;
const CONCRETE_DARK = 0x70767c;
const LAB_WALL = 0xdfe6ec;
const LAB_FLOOR = 0xb6bfc7;
const rng = makeRng(4242);

function palm(b, x, y, z, h = 6.5) {
  const g = new THREE.Group();
  b.mesh(g, x, y, z, rng() * 6.28);
  b.into(g, () => {
    for (let i = 0; i < 6; i++) {
      const t = i / 6;
      b.deco(Math.sin(t * 2.2) * 0.5 * h * 0.12, h * t + h / 12, 0, 0.42 - t * 0.12, h / 6 + 0.05, 0.42 - t * 0.12, 0x8a6a45, t * 0.4);
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const frond = b.deco(Math.cos(a) * 1.5, h + 0.15 - 0.35, Math.sin(a) * 1.5, 3.2, 0.14, 0.85, 0x4f8f3f, -a);
      frond.rotation.z = 0.32;
      frond.rotation.order = 'YZX';
    }
    b.deco(0, h + 0.1, 0, 0.7, 0.5, 0.7, 0x5f7f3f);
  });
  b.physics.addCyl(x, z, 0.5, y, y + h, { tag: 'wood' });
  return g;
}

function labRoom(b, x0, z0, x1, z1, floorY, ceilY, opts) {
  // Room shell.  The wall shared with the hallway carries a door *and* a wide
  // one-way glass panel, so it is assembled segment by segment.
  const T = 0.3, H = ceilY - floorY;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
  const yc = floorY + H / 2;
  b.solid(cx, floorY - 0.15, cz, w + T * 2, 0.3, d + T * 2, LAB_FLOOR);
  b.solid(cx, ceilY + 0.15, cz, w + T * 2, 0.3, d + T * 2, CONCRETE_DARK);

  const shareZ = opts.side === 'north' ? z1 : z0;
  const doorX = x0 + 1.9, doorW = 1.6, doorH = 2.4;
  const glassX0 = doorX + 1.5, glassX1 = x1 - 0.8;
  const glassY0 = floorY + 0.6, glassY1 = floorY + 2.6;
  const seg = (ax0, ax1, ay0, ay1) => {
    if (ax1 - ax0 < 0.04 || ay1 - ay0 < 0.04) return;
    b.solid((ax0 + ax1) / 2, (ay0 + ay1) / 2, shareZ, ax1 - ax0, ay1 - ay0, T, LAB_WALL);
  };
  seg(x0, doorX - doorW / 2, floorY, ceilY);
  seg(doorX + doorW / 2, glassX0, floorY, ceilY);
  seg(glassX1, x1, floorY, ceilY);
  seg(doorX - doorW / 2, doorX + doorW / 2, floorY + doorH, ceilY);
  seg(glassX0, glassX1, floorY, glassY0);
  seg(glassX0, glassX1, glassY1, ceilY);
  b.door(doorX, floorY, shareZ, doorW, doorH, 'x', { color: 0xc8ced4 });
  b.oneWayGlass((glassX0 + glassX1) / 2, (glassY0 + glassY1) / 2, shareZ,
    glassX1 - glassX0, glassY1 - glassY0, 'x');

  // remaining shell
  b.solid(cx, yc, opts.side === 'north' ? z0 : z1, w + T * 2, H, T, LAB_WALL);
  b.solid(x0, yc, cz, T, H, d, LAB_WALL);
  b.solid(x1, yc, cz, T, H, d, LAB_WALL);
  b.deco(cx, ceilY - 0.06, cz, w * 0.5, 0.08, 0.5, 0xfdfff0, 0, { matOpts: { emissive: 0xbfc8a0 } });
}

export function buildPumpedPalms(scene, physics) {
  const b = new StructureBuilder(scene, physics, 'pumped-palms');
  const CX = 0, CZ = 0, G = 6;

  // =========================== surface =================================
  // oasis pool
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.4, 20),
    new THREE.MeshLambertMaterial({ color: 0x2f9fc8, transparent: true, opacity: 0.85 }));
  pool.position.set(CX - 44, G + 0.1, CZ - 30);
  b.group.add(pool);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    b.deco(CX - 44 + Math.cos(a) * 12, G + 0.2, CZ - 30 + Math.sin(a) * 12, 2.2, 0.5, 2.2, 0xc9b487, a);
  }
  const palms = [[-30, -18], [-56, -16], [-38, -44], [-58, -42], [-24, -34], [-46, -12],
                 [22, -36], [40, -20], [30, 30], [-20, 34], [52, 34], [12, -46]];
  for (const p of palms) palm(b, CX + p[0], G, CZ + p[1], 5.5 + rng() * 3);

  // a couple of small sandstone buildings
  const shed = (ox, oz, w, d, h, doorSide) => {
    b.solid(ox, G - 0.15, oz, w + 1, 0.3, d + 1, 0xb9a882);
    if (doorSide === 'z+') {
      b.wallWithHole(ox, G + h / 2, oz + d / 2, w, h, 0.3, SAND_WALL, 'x', 0, 1.5, 2.3, 0);
      b.door(ox, G, oz + d / 2, 1.5, 2.3, 'x', { color: 0x8a6640 });
      b.solid(ox, G + h / 2, oz - d / 2, w, h, 0.3, SAND_WALL);
    } else {
      b.wallWithHole(ox - w / 2, G + h / 2, oz, d, h, 0.3, SAND_WALL, 'z', 0, 1.5, 2.3, 0);
      b.door(ox - w / 2, G, oz, 1.5, 2.3, 'z', { color: 0x8a6640 });
      b.solid(ox + w / 2, G + h / 2, oz, 0.3, h, d, SAND_WALL);
    }
    if (doorSide === 'z+') {
      b.solid(ox - w / 2, G + h / 2, oz, 0.3, h, d, SAND_WALL);
      b.solid(ox + w / 2, G + h / 2, oz, 0.3, h, d, SAND_WALL);
    } else {
      b.solid(ox, G + h / 2, oz - d / 2, w, h, 0.3, SAND_WALL);
      b.solid(ox, G + h / 2, oz + d / 2, w, h, 0.3, SAND_WALL);
    }
    b.solid(ox, G + h + 0.15, oz, w + 0.8, 0.3, d + 0.8, 0xc2ab84);
  };
  shed(CX - 26, CZ + 22, 9, 8, 3.2, 'z+');
  b.counter(CX - 26, G, CZ + 19.5, Math.PI, 3.0);
  b.crate(CX - 29, G, CZ + 24, 0.3);
  b.barrel(CX - 23, G, CZ + 24.5);
  shed(CX + 26, CZ - 20, 10, 9, 3.4, 'x-');
  b.shelf(CX + 29, G, CZ - 20, -Math.PI / 2, 2.6, 2.0);
  b.crate(CX + 24, G, CZ - 23, -0.2);
  b.table(CX + 25, G, CZ - 17, 0, 1.8, 1.0);

  // fuel pumps (the "pumped" half of the name)
  for (const s of [-1, 1]) {
    b.solid(CX + 46 + s * 3, G + 1.0, CZ + 8, 1.0, 2.0, 1.4, 0xc85040);
    b.deco(CX + 46 + s * 3, G + 1.7, CZ + 8.75, 0.6, 0.5, 0.12, 0x22262b);
  }
  b.solid(CX + 46, G + 4.6, CZ + 8, 12, 0.4, 8, 0xd8d2c6);
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    b.solid(CX + 46 + sx * 5, G + 2.3, CZ + 8 + sz * 3, 0.4, 4.6, 0.4, 0x9aa0a6);

  // =========================== bunker entrance ==========================
  const FLOOR = -6.4, CEIL = -2.6;
  const HUT_Z0 = 29.0, HUT_Z1 = 37.4, MOUTH_Z = 32.8;
  b.solid(CX, G - 0.15, (MOUTH_Z + HUT_Z1) / 2, 8.8, 0.3, HUT_Z1 - MOUTH_Z + 0.6, CONCRETE);
  b.wallWithHole(CX, G + 1.6, HUT_Z1, 8.8, 3.2, 0.4, CONCRETE, 'x', 0, 1.6, 2.4, 0);
  b.door(CX, G, HUT_Z1, 1.6, 2.4, 'x', { color: 0xb0873a });
  for (const s2 of [-1, 1])
    b.solid(CX + s2 * 4.4, G + 1.6, (HUT_Z0 + HUT_Z1) / 2, 0.4, 3.2, HUT_Z1 - HUT_Z0, CONCRETE);
  b.solid(CX, G + 1.85, HUT_Z0, 8.8, 3.1, 0.4, CONCRETE);
  b.solid(CX, G + 3.4, (HUT_Z0 + HUT_Z1) / 2, 9.2, 0.35, HUT_Z1 - HUT_Z0 + 0.4, CONCRETE_DARK);
  b.deco(CX, G + 1.8, HUT_Z1 + 0.3, 3.0, 0.6, 0.1, 0xd8b028);
  b.deco(CX, G + 1.8, HUT_Z1 + 0.34, 2.4, 0.24, 0.04, 0x22262b);

  // the shaft: one long flight of stairs from the hut down to the lab
  b.stairs(CX, FLOOR, 19.5, G, 'z', 7.8, CONCRETE_DARK, 1);
  for (const s2 of [-1, 1])
    b.solid(CX + s2 * 4.1, (FLOOR + G) / 2, 25.0, 0.5, G - FLOOR + 1.2, 16.0, CONCRETE);
  b.solid(CX, FLOOR - 0.15, 21.5, 8.2, 0.3, 8.0, LAB_FLOOR);
  b.solid(CX, G + 0.2, 23.2, 8.2, 0.4, 12.6, CONCRETE_DARK);          // lid over the trench
  for (let i = 0; i < 3; i++)
    b.deco(CX, G - 0.1, 18.5 + i * 4.5, 1.4, 0.08, 0.5, 0xfdfff0, 0, { matOpts: { emissive: 0xbfc8a0 } });

  // access corridor from the shaft bottom to the main hallway
  const corW = 4.0;
  b.solid(CX, FLOOR - 0.15, 11.0, corW + 0.6, 0.3, 15.0, LAB_FLOOR);
  b.solid(CX, CEIL + 0.15, 11.5, corW + 0.6, 0.3, 16.0, CONCRETE_DARK);
  for (const s2 of [-1, 1])
    b.solid(CX + s2 * (corW / 2 + 0.15), (FLOOR + CEIL) / 2, 11.0, 0.3, CEIL - FLOOR, 15.0, LAB_WALL);
  for (let i = 0; i < 3; i++)
    b.deco(CX, CEIL - 0.08, 6 + i * 5, 0.5, 0.08, 1.6, 0xfdfff0, 0, { matOpts: { emissive: 0xbfc8a0 } });

  // =========================== main hallway =============================
  const HX0 = -34, HX1 = 34, HZ0 = -3.2, HZ1 = 3.2;
  b.solid(CX, FLOOR - 0.15, 0, HX1 - HX0, 0.3, HZ1 - HZ0, LAB_FLOOR);
  b.solid(CX, CEIL + 0.15, 0, HX1 - HX0, 0.3, HZ1 - HZ0, CONCRETE_DARK);
  for (let i = 0; i < 9; i++)
    b.deco(HX0 + 4 + i * 8, CEIL - 0.08, 0, 3.2, 0.08, 0.55, 0xfdfff0, 0, { matOpts: { emissive: 0xbfc8a0 } });
  // yellow safety stripes
  b.deco(0, FLOOR + 0.02, HZ0 + 0.5, HX1 - HX0, 0.03, 0.3, 0xd8b028);
  b.deco(0, FLOOR + 0.02, HZ1 - 0.5, HX1 - HX0, 0.03, 0.3, 0xd8b028);

  // hallway walls: solid except where the rooms, doors and glass cut through
  const hw = (side, a, c) => b.solid((a + c) / 2, (FLOOR + CEIL) / 2, side, c - a, CEIL - FLOOR, 0.3, LAB_WALL);
  hw(HZ0, -34, -32); hw(HZ0, -20, -16); hw(HZ0, -4, 34);          // rooms A and B
  hw(HZ1, -34, -2); hw(HZ1, 2, 4); hw(HZ1, 16, 20); hw(HZ1, 32, 34);

  // four observation rooms with one-way glass onto the hallway
  labRoom(b, -32, -16, -20, HZ0, FLOOR, CEIL, { side: 'north' });
  labRoom(b, -16, -16, -4, HZ0, FLOOR, CEIL, { side: 'north' });
  labRoom(b, 4, HZ1, 16, 16, FLOOR, CEIL, { side: 'south' });
  labRoom(b, 20, HZ1, 32, 16, FLOOR, CEIL, { side: 'south' });

  const furnishCell = (cx, cz, variant) => {
    if (variant === 0) {
      b.medBed(cx - 2.5, FLOOR, cz, 0);
      b.ivStand(cx - 0.9, FLOOR, cz - 1.0);
      b.medCabinet(cx + 3.0, FLOOR, cz - 4.0, 0);
      b.chair(cx + 2.4, FLOOR, cz + 2.0, 0.4);
    } else if (variant === 1) {
      b.table(cx, FLOOR, cz, 0, 1.8, 1.1, 0xd8dde2);
      b.chair(cx, FLOOR, cz + 1.5, Math.PI);
      b.chair(cx, FLOOR, cz - 1.5, 0);
      b.serverRack(cx + 3.6, FLOOR, cz - 3.0, 0);
    } else if (variant === 2) {
      b.crate(cx - 3.0, FLOOR, cz + 2.0, 0.2);
      b.crate(cx - 3.2, FLOOR, cz + 0.6, -0.3, 0.8);
      b.barrel(cx + 3.0, FLOOR, cz + 1.6);
      b.medCabinet(cx + 1.0, FLOOR, cz - 4.2, 0);
      b.shelf(cx + 3.4, FLOOR, cz - 1.6, -Math.PI / 2, 2.2, 1.8);
    } else {
      b.medBed(cx + 2.6, FLOOR, cz + 0.5, 0);
      b.monitorDesk(cx - 2.2, FLOOR, cz - 3.4, 0, 2);
      b.ivStand(cx + 1.0, FLOOR, cz - 0.6);
    }
  };
  furnishCell(-26, -9.6, 0);
  furnishCell(-10, -9.6, 1);
  furnishCell(10, 9.6, 2);
  furnishCell(26, 9.6, 3);

  // =========================== control room =============================
  const CR = { x0: -52, x1: -34, z0: -12, z1: 12 };
  const crCx = (CR.x0 + CR.x1) / 2, crCz = (CR.z0 + CR.z1) / 2;
  const crW = CR.x1 - CR.x0, crD = CR.z1 - CR.z0;
  b.solid(crCx, FLOOR - 0.15, crCz, crW, 0.3, crD, LAB_FLOOR);
  b.solid(crCx, CEIL + 0.15, crCz, crW, 0.3, crD, CONCRETE_DARK);
  b.solid(crCx, (FLOOR + CEIL) / 2, CR.z0, crW, CEIL - FLOOR, 0.3, LAB_WALL);
  b.solid(crCx, (FLOOR + CEIL) / 2, CR.z1, crW, CEIL - FLOOR, 0.3, LAB_WALL);
  b.solid(CR.x0, (FLOOR + CEIL) / 2, crCz, 0.3, CEIL - FLOOR, crD, LAB_WALL);
  b.wallWithHole(CR.x1, (FLOOR + CEIL) / 2, crCz, crD, CEIL - FLOOR, 0.3, LAB_WALL, 'z', 0, 2.0, 2.6, 0);
  b.door(CR.x1, FLOOR, crCz, 2.0, 2.6, 'z', { color: 0xc8ced4 });
  b.monitorDesk(crCx - 4.0, FLOOR, CR.z0 + 2.0, 0, 3);
  b.monitorDesk(crCx + 3.0, FLOOR, CR.z0 + 2.0, 0, 3);
  b.monitorDesk(crCx - 4.0, FLOOR, CR.z1 - 2.0, Math.PI, 3);
  b.chair(crCx - 4.0, FLOOR, CR.z0 + 3.6, Math.PI);
  b.chair(crCx + 3.0, FLOOR, CR.z0 + 3.6, Math.PI);
  b.serverRack(CR.x0 + 1.2, FLOOR, crCz - 4.0, -Math.PI / 2);
  b.serverRack(CR.x0 + 1.2, FLOOR, crCz - 1.6, -Math.PI / 2);
  b.serverRack(CR.x0 + 1.2, FLOOR, crCz + 0.8, -Math.PI / 2);
  b.table(crCx + 2.0, FLOOR, crCz + 4.0, 0, 3.0, 1.4, 0xd8dde2);
  b.crate(CR.x0 + 2.0, FLOOR, CR.z1 - 2.5, 0.3);
  // big wall display
  b.deco(crCx, FLOOR + 2.3, CR.z0 + 0.2, 9.0, 2.2, 0.12, 0x15181c);
  b.deco(crCx, FLOOR + 2.3, CR.z0 + 0.3, 8.4, 1.9, 0.03, 0x2a6ad0, 0, { matOpts: { emissive: 0x123a70 } });
  for (let i = 0; i < 4; i++)
    b.deco(crCx - 3.6 + i * 2.4, FLOOR + 2.3, CR.z0 + 0.33, 1.8, 1.4, 0.02, i % 2 ? 0x30e08a : 0x50a8d8);
  for (let i = 0; i < 3; i++)
    b.deco(crCx - 5 + i * 5, CEIL - 0.08, crCz, 3.0, 0.08, 0.55, 0xfdfff0, 0, { matOpts: { emissive: 0xbfc8a0 } });

  // =========================== resting unit =============================
  const RU = { x0: 34, x1: 52, z0: -10, z1: 12 };
  const ruCx = (RU.x0 + RU.x1) / 2, ruCz = (RU.z0 + RU.z1) / 2;
  const ruW = RU.x1 - RU.x0, ruD = RU.z1 - RU.z0;
  b.solid(ruCx, FLOOR - 0.15, ruCz, ruW, 0.3, ruD, LAB_FLOOR);
  b.solid(ruCx, CEIL + 0.15, ruCz, ruW, 0.3, ruD, CONCRETE_DARK);
  b.solid(ruCx, (FLOOR + CEIL) / 2, RU.z0, ruW, CEIL - FLOOR, 0.3, LAB_WALL);
  b.solid(ruCx, (FLOOR + CEIL) / 2, RU.z1, ruW, CEIL - FLOOR, 0.3, LAB_WALL);
  b.solid(RU.x1, (FLOOR + CEIL) / 2, ruCz, 0.3, CEIL - FLOOR, ruD, LAB_WALL);
  b.wallWithHole(RU.x0, (FLOOR + CEIL) / 2, ruCz, ruD, CEIL - FLOOR, 0.3, LAB_WALL, 'z', 0, 2.0, 2.6, 0);
  b.door(RU.x0, FLOOR, ruCz, 2.0, 2.6, 'z', { color: 0xc8ced4 });
  for (let i = 0; i < 3; i++) {
    b.bed(RU.x0 + 3.0, FLOOR, RU.z0 + 3.0 + i * 3.4, 0, 0xcfd8e0);
    b.bed(RU.x1 - 3.0, FLOOR, RU.z0 + 3.0 + i * 3.4, 0, 0xcfd8e0);
  }
  b.table(ruCx, FLOOR, RU.z1 - 4.0, 0, 2.4, 1.2, 0xd8dde2);
  const restChair = b.chair(ruCx - 1.9, FLOOR, RU.z1 - 4.0, Math.PI / 2);
  b.chair(ruCx + 1.9, FLOOR, RU.z1 - 4.0, -Math.PI / 2);
  b.counter(ruCx, FLOOR, RU.z1 - 0.9, Math.PI, 3.2, 0xc8ced4);
  b.fridge(RU.x1 - 2.0, FLOOR, RU.z1 - 2.6, Math.PI);
  b.shelf(RU.x0 + 2.0, FLOOR, RU.z1 - 2.4, Math.PI / 2, 2.0, 1.8);
  for (let i = 0; i < 2; i++)
    b.deco(ruCx - 3 + i * 6, CEIL - 0.08, ruCz, 3.0, 0.08, 0.55, 0xfdfff0, 0, { matOpts: { emissive: 0xbfc8a0 } });
  // the chest sits on the chair by the table
  b.chestSpot(ruCx - 1.9, restChair.userData.top, RU.z1 - 4.0, Math.PI / 2, 'resting');

  // carve the terrain out of everything underground
  physics.addVoid(-56, -20, 56, 20.5, 4.0);
  physics.addVoid(-3.95, 17.6, 3.95, 37.3, 6.6);
  b.finalize();
  return b;
}
