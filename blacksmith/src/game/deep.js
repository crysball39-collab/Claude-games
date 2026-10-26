/* =============================================================================
   The deep mine: below the cave, at the bottom of the hall's steps. One wide
   cavern, broader than it is deep, its roof held up by great pillars of rock
   and lit as much by its crystals as by its torches. More boulders here than
   anywhere, and the elite skeletons, in iron. Jack keeps a camp just inside
   the way in, where they never come.

                    north (-Z)
          .-''''''''''''''''''''''-.
        .'  ( )               ( )   '.
       |          ( )                 |       pillars of rock
       |  ( )            ( )          |
        '.      Jack's camp     ( )  .'
          '-.______    ______.-'
                   | |                        the steps back up to the cave
                 south (+Z)
   ========================================================================== */
import {
  Scene, Group, Mesh, Color, Fog, BufferGeometry, Float32BufferAttribute,
  BoxGeometry, CylinderGeometry, ConeGeometry, OctahedronGeometry, PlaneGeometry, CircleGeometry,
  MeshLambertMaterial, MeshPhongMaterial, MeshBasicMaterial, SpriteMaterial, Sprite,
  HemisphereLight, AmbientLight, PointLight, AdditiveBlending,
} from 'three';
import { makeRng, valueNoise2D, fbm, clamp01, lerp, TAU } from '../core/util.js';
import { rockTexture, slabTexture, woodTexture, flameTexture, softDotTexture, signTexture } from './textures.js';
import { mergeStatic, flatten, tiledBox } from './geo.js';
import { addTorch } from './torch.js';
import { Collider } from './collide.js';
import { oreMaterial } from './materials.js';
import { buildWeapon } from './gear.js';
import { segmentHitsCircle } from './skeletons.js';

export const DM = {
  rx: 24, rz: 18,                                  // the cavern's half-width (x) and half-depth (z)
  margin: 1.3,                                     // how close to its wall you can walk
  wallH: 5.6, vault: 3.2,
  tunnel: { half: 2.0, h: 4.2, end: 28.5 },        // the way back up, to the south
  entry: { x: 0, z: 23.2, yaw: Math.PI },          // just down the steps, facing the cavern
  exitZ: 26.6,
  camp: { x: -7.2, z: 12.4, r: 5.6 },              // Jack's, and no elite comes near it
  jack: { x: -5.4, z: 12.9, yaw: 2.25 },           // facing whoever comes down
  pillars: [
    [-11.0, -2.5, 1.7], [9.5, 3.5, 1.9], [1.0, -8.0, 1.6],
    [-16.5, -9.0, 1.4], [15.5, -8.5, 1.5], [6.5, -13.0, 1.2],
  ],
};

/** How far the cavern's wall is from its middle, looking along `phi` (0 = south). */
export function wallRadius(phi) {
  const s = Math.sin(phi) / DM.rx, c = Math.cos(phi) / DM.rz;
  return 1 / Math.sqrt(s * s + c * c);
}

/** 0 in the middle of the cavern, 1 at its wall. */
const ellipseT = (x, z) => Math.sqrt((x / DM.rx) ** 2 + (z / DM.rz) ** 2);

/** Height of the roof over a point. */
export function roofAt(x, z) {
  const t = Math.min(1, ellipseT(x, z));
  return DM.wallH + DM.vault * Math.pow(1 - t * t, 0.6);
}

export function buildDeep({ quality }) {
  const scene = new Scene();
  scene.background = new Color('#04050a');
  scene.fog = new Fog('#070a14', 16, 52);
  const col = new Collider();
  const disposables = [];
  const keep = (...xs) => { disposables.push(...xs); return xs[0]; };
  const low = quality.name === 'low';
  const rng = makeRng(2026);
  const noise = valueNoise2D(41);

  const rockTex = keep(rockTexture(256, { seed: 57, tint: [0.84, 0.86, 0.98] }));
  const floorTex = keep(slabTexture(256));
  const woodTex = keep(woodTexture(128, { seed: 19, planks: 1, base: [100, 68, 40] }));
  const M = {
    wall: new MeshLambertMaterial({ map: rockTex, vertexColors: true }),
    floor: new MeshLambertMaterial({ map: floorTex, vertexColors: true, color: 0x9ea3b4 }),
    rock: new MeshLambertMaterial({ map: rockTex, color: 0x6f7184 }),
    beam: new MeshLambertMaterial({ map: woodTex }),
    darkWood: new MeshLambertMaterial({ color: 0x45301c }),
    iron: new MeshPhongMaterial({ color: 0x3b3f45, specular: 0x777777, shininess: 40 }),
    cloth: new MeshLambertMaterial({ color: 0x5c6b4a }),
    canvas: new MeshLambertMaterial({ color: 0x8d7a5a }),
    ember: new MeshBasicMaterial({ color: 0xff7a2a }),
    lantern: new MeshBasicMaterial({ color: 0xffd27a }),
    up: new MeshBasicMaterial({ color: 0x1a1a22 }),
  };
  for (const m of Object.values(M)) disposables.push(m);
  const world = new Group();
  scene.add(world);
  const box = (w, h, d, mat, x, y, z, { ry = 0, rx = 0, rz = 0, tile = 0, parent = world } = {}) => {
    const m = new Mesh(tile ? tiledBox(w, h, d, tile) : new BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  };

  /* --------------------------------- light -------------------------------- */
  // colder and dimmer than the cave above: the torches, the crystals and
  // Jack's fire do the rest
  scene.add(new HemisphereLight(0x8a9ad8, 0x241c2a, 1.7));
  scene.add(new AmbientLight(0x7880a8, 0.7));

  /* ------------------------------ the rock shell -------------------------- */
  const T = DM.tunnel;
  const phiE = Math.asin((T.half + 0.1) / DM.rz);
  const TORCHES = Array.from({ length: 8 }, (_, k) => (k + 0.5) * (TAU / 8));
  const angleDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  const shadeAt = (y) => 0.55 + 0.4 * Math.exp(-((y - 2.4) ** 2) / 5);

  // the wall: a grid round the ellipse, bulging in and out, flat behind each torch
  function wallGrid(phi0, phi1, y0, y1, nPhi, nY, amp) {
    const pos = [], uv = [], colr = [], idx = [];
    for (let j = 0; j <= nY; j++) {
      const y = lerp(y0, y1, j / nY);
      for (let i = 0; i <= nPhi; i++) {
        const phi = lerp(phi0, phi1, i / nPhi);
        let a = amp;
        for (const tp of [0, ...TORCHES]) a *= clamp01(Math.abs(angleDiff(phi, tp)) / 0.2 - 0.5);
        const R = wallRadius(phi);
        const rr = R + (fbm(noise, phi * R * 0.16 + 3, y * 0.3, 4) - 0.5) * 2 * a + 0.25;
        pos.push(Math.sin(phi) * rr, y, Math.cos(phi) * rr);
        uv.push(phi * R / 3, y / 3);
        const k = shadeAt(y) * (0.8 + fbm(noise, phi * 6, y * 0.5, 2) * 0.35);
        colr.push(k * 0.92, k * 0.94, k);
      }
    }
    const row = nPhi + 1;
    for (let j = 0; j < nY; j++) {
      for (let i = 0; i < nPhi; i++) {
        const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new Float32BufferAttribute(colr, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    disposables.push(g);
    world.add(new Mesh(g, M.wall));
  }
  const segs = low ? 72 : 120;
  wallGrid(phiE, TAU - phiE, 0, DM.wallH + 0.6, segs, 9, 0.8);
  wallGrid(-phiE, phiE, T.h, DM.wallH + 0.6, 4, 3, 0.0);

  // the roof: a low dome over the whole cavern, rough and dark
  {
    const nPhi = segs, nR = 12;
    const pos = [], uv = [], colr = [], idx = [];
    for (let j = 0; j <= nR; j++) {
      const t = (j / nR) * 1.06;
      for (let i = 0; i <= nPhi; i++) {
        const phi = (i / nPhi) * TAU;
        const R = wallRadius(phi) * t;
        const x = Math.sin(phi) * R, z = Math.cos(phi) * R;
        const y = roofAt(x, z) + 0.35 + (fbm(noise, phi * 4 + 7, t * 6, 3) - 0.5) * 1.3;
        pos.push(x, y, z);
        uv.push(x / 3, z / 3);
        const k = 0.36 + fbm(noise, phi * 5 + 1, t * 5, 2) * 0.22;
        colr.push(k * 0.95, k * 0.96, k * 1.06);
      }
    }
    const row = nPhi + 1;
    for (let j = 0; j < nR; j++) {
      for (let i = 0; i < nPhi; i++) {
        // wound to face down, at whoever is under it
        const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new Float32BufferAttribute(colr, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    disposables.push(g);
    world.add(new Mesh(g, M.wall));
  }

  // the floor: worn slabs, darker toward the wall
  {
    const g = new CircleGeometry(1, segs, 0, TAU);
    g.rotateX(-Math.PI / 2);
    g.scale(DM.rx + 1.6, 1, DM.rz + 1.6);
    const pos = g.attributes.position, uv = g.attributes.uv;
    const colr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      uv.setXY(i, x / 4, z / 4);
      const k = 0.92 - Math.min(1, ellipseT(x, z)) * 0.25 + (fbm(noise, x * 0.2, z * 0.2, 3) - 0.5) * 0.2;
      colr[i * 3] = k * 0.95; colr[i * 3 + 1] = k * 0.96; colr[i * 3 + 2] = k;
    }
    g.setAttribute('color', new Float32BufferAttribute(colr, 3));
    disposables.push(g);
    world.add(new Mesh(g, M.floor));
  }

  /* ------------------------------- the pillars ----------------------------- */
  // great twisted columns of rock, floor to roof; nothing sees or walks through them
  for (const [px, pz, pr] of DM.pillars) {
    const h = roofAt(px, pz) + 1.2;
    const g = new CylinderGeometry(pr * 0.82, pr * 1.18, h, 11, 8, true);
    const p = g.attributes.position;
    const seed = px * 3.1 + pz * 1.7;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(x, z);
      // waisted in the middle, flared where it meets the floor and the roof
      const waist = 1 - 0.16 * Math.sin(Math.PI * (y / h + 0.5));
      const k = waist * (1 + (fbm(noise, a * 1.8 + seed, y * 0.45, 3) - 0.5) * 0.45);
      p.setXYZ(i, x * k, y, z * k);
    }
    g.computeVertexNormals();
    const colr = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const k = shadeAt(p.getY(i) + h / 2) * 0.95;
      colr[i * 3] = k * 0.93; colr[i * 3 + 1] = k * 0.95; colr[i * 3 + 2] = k;
    }
    g.setAttribute('color', new Float32BufferAttribute(colr, 3));
    const m = new Mesh(g, M.wall);
    m.position.set(px, h / 2 - 0.3, pz);
    world.add(m);
    disposables.push(g);
    col.circle(px, pz, pr + 0.05, { h: 10 });
  }

  /* -------------------------------- the way up ----------------------------- */
  {
    // its walls start right at the cavern's, so nothing juts out into the cavern for the camera to get behind
    const z0 = DM.rz - 0.4, len = T.end - z0 + 1;
    const zc = z0 + len / 2;
    const part = (w, h, d, x, y, z) => {
      const g = tiledBox(w, h, d, 1.6);
      const pp = g.attributes.position;
      const c = new Float32Array(pp.count * 3);
      for (let i = 0; i < pp.count; i++) {
        const k = 0.42 * (0.6 + 0.4 * clamp01((z + pp.getZ(i) - z0) / len));
        c[i * 3] = k; c[i * 3 + 1] = k; c[i * 3 + 2] = k * 1.06;
      }
      g.setAttribute('color', new Float32BufferAttribute(c, 3));
      disposables.push(g);
      const m = new Mesh(g, M.wall);
      m.position.set(x, y, z);
      m.userData.keep = true;
      world.add(m);
    };
    part(0.6, T.h + 3, len, -T.half - 0.3, (T.h + 3) / 2, zc);
    part(0.6, T.h + 3, len, T.half + 0.3, (T.h + 3) / 2, zc);
    part(T.half * 2 + 1.2, 0.6, len, 0, T.h + 0.3, zc);
    part(T.half * 2 + 0.2, 0.04, len, 0, 0.0, zc);
    // steps going up out of sight at the far end
    for (let k = 0; k < 8; k++) {
      const s = box(T.half * 2 + 0.1, 0.22 * (k + 1), 0.62, M.rock, 0, 0.11 * (k + 1), DM.exitZ + 0.5 + k * 0.62);
      s.userData.keep = true;
    }
    const top = new Mesh(new PlaneGeometry(T.half * 2 + 0.2, T.h + 3), M.up);
    top.position.set(0, (T.h + 3) / 2, T.end + 0.3);
    top.rotation.y = Math.PI;
    world.add(top);
    disposables.push(top.geometry);
    for (let z = z0 + 0.5; z < DM.exitZ; z += 3.0) {
      for (const sx of [-1, 1]) box(0.3, T.h, 0.3, M.beam, sx * (T.half - 0.05), T.h / 2, z);
      box(T.half * 2 + 0.4, 0.3, 0.32, M.beam, 0, T.h - 0.15, z);
    }
    // the sign that says which way is up, nailed to the lintel over the way out
    const face = keep(new MeshLambertMaterial({ map: keep(signTexture('Up to the Cave', 720, 180)) }));
    const board = new Mesh(new BoxGeometry(1.95, 0.5, 0.07), [M.beam, M.beam, M.beam, M.beam, face, face]);
    board.position.set(0, T.h + 0.3, z0 - 0.06);
    board.rotation.y = Math.PI;
    world.add(board);
    disposables.push(board.geometry);
  }

  /* --------------------------------- torches ------------------------------ */
  const flameTex = keep(flameTexture(64));
  const haloTex = keep(softDotTexture(64, 'rgba(255,170,90,0.45)', 'rgba(255,120,40,0)'));
  const pitch = keep(new MeshLambertMaterial({ color: 0x23150b, emissive: 0x4a1a05 }));
  const flames = [];
  const lights = [];
  const maxLights = quality.caveLights;
  TORCHES.forEach((phi, k) => {
    // flat wall behind it: the ellipse, 0.25 out
    const R = wallRadius(phi) + 0.25;
    const sx = Math.sin(phi), cz = Math.cos(phi);
    // the wall faces along the ellipse's normal there
    const nx = (sx * R) / (DM.rx * DM.rx), nz = (cz * R) / (DM.rz * DM.rz), nl = Math.hypot(nx, nz);
    const out = { x: -nx / nl, z: -nz / nl };
    const { flame, tip } = addTorch(world, { x: sx * R, y: 2.4, z: cz * R }, out,
      { wood: M.darkWood, iron: M.iron, pitch, flameTex, haloTex, size: 1.1, disposables });
    flame.userData.phase = phi * 3;
    flames.push(flame);
    if ((maxLights >= 8 || k % 2 === 0) && lights.length < maxLights) {
      const pl = new PointLight(0xffa050, 30, 18, 1.25);
      pl.position.set(tip.x + out.x * 0.35, tip.y + 0.1, tip.z + out.z * 0.35);
      pl.userData.phase = phi * 5;
      world.add(pl);
      lights.push(pl);
    }
  });

  /* ------------------------------- the crystals ---------------------------- */
  // clusters that glow on their own, at the foot of the wall and the pillars
  const crystalMats = ['diamond', 'amethyst', 'emerald', 'diamond'].map((ore) => {
    const base = oreMaterial(ore);
    return keep(new MeshPhongMaterial({ color: base.color, emissive: base.color.clone().multiplyScalar(0.6), shininess: 120, flatShading: true }));
  });
  const glowTex = keep(softDotTexture(64, 'rgba(150,200,255,0.5)', 'rgba(120,160,255,0)'));
  const cluster = (cx, cz, n, mat, glow) => {
    for (let k = 0; k < n; k++) {
      const s = 0.12 + rng() * 0.18;
      const g = new OctahedronGeometry(s, 0);
      g.scale(1, 2.4 + rng() * 1.8, 1);
      const m = new Mesh(g, mat);
      m.position.set(cx + (rng() - 0.5) * 0.6, s * 1.8, cz + (rng() - 0.5) * 0.6);
      m.rotation.set((rng() - 0.5) * 0.9, rng() * 3, (rng() - 0.5) * 0.9);
      world.add(m);
      disposables.push(g);
    }
    if (glow) {
      const sp = new Sprite(new SpriteMaterial({ map: glowTex, blending: AdditiveBlending, depthWrite: false, color: mat.color }));
      sp.position.set(cx, 0.8, cz);
      sp.scale.set(2.6, 2.6, 1);
      world.add(sp);
      disposables.push(sp.material);
    }
  };
  for (let i = 0; i < (low ? 10 : 18); i++) {
    const phi = rng() * TAU;
    if (Math.abs(angleDiff(phi, 0)) < 0.5) continue;
    const R = wallRadius(phi) - 0.5;
    cluster(Math.sin(phi) * R, Math.cos(phi) * R, 4 + ((rng() * 3) | 0), crystalMats[i % crystalMats.length], i % 2 === 0);
  }
  DM.pillars.forEach(([px, pz, pr], i) => {
    const a = rng() * TAU;
    cluster(px + Math.sin(a) * (pr + 0.35), pz + Math.cos(a) * (pr + 0.35), 4, crystalMats[(i + 1) % crystalMats.length], true);
  });
  // stalactites
  for (let i = 0; i < (low ? 24 : 46); i++) {
    const t = Math.sqrt(rng()) * 0.95, phi = rng() * TAU;
    const R = wallRadius(phi) * t, x = Math.sin(phi) * R, z = Math.cos(phi) * R;
    const len = 0.7 + rng() * 2.0;
    const g = new ConeGeometry(0.16 + rng() * 0.28, len, 6);
    g.rotateX(Math.PI);
    const m = new Mesh(g, M.rock);
    m.position.set(x, roofAt(x, z) + 0.25 - len / 2, z);
    world.add(m);
    disposables.push(g);
  }

  /* -------------------------------- Jack's camp ---------------------------- */
  let fire = null;
  const fireFlames = [];
  {
    const { x, z } = DM.camp;
    // a canvas lean-to against nothing in particular
    const tent = new Group();
    tent.position.set(x - 2.4, 0, z - 1.0);
    tent.rotation.y = 0.5;
    world.add(tent);
    for (const sx of [-1, 1]) box(1.8, 0.05, 2.4, M.canvas, sx * 0.62, 0.78, 0, { rz: sx * 0.95, parent: tent });
    box(0.08, 1.5, 0.08, M.darkWood, 0, 0.75, 1.15, { parent: tent });
    box(0.08, 1.5, 0.08, M.darkWood, 0, 0.75, -1.15, { parent: tent });
    box(0.06, 0.06, 2.5, M.darkWood, 0, 1.48, 0, { parent: tent });
    flatten(tent, world);
    col.box(x - 2.4, z - 1.0, 1.25, 1.3, { ry: 0.5, h: 1.6 });
    // a bedroll and a crate or two
    box(0.8, 0.08, 1.8, M.cloth, x - 0.6, 0.04, z - 2.6, { ry: 1.7 });
    const crate = (cx, cz, s, ry) => {
      box(s, s, s, M.beam, cx, s / 2, cz, { ry, tile: s });
      col.box(cx, cz, s / 2 + 0.02, s / 2 + 0.02, { ry, h: s });
    };
    crate(x + 2.6, z - 1.4, 0.8, 0.3);
    crate(x + 3.2, z - 0.5, 0.6, -0.4);
    crate(x - 3.6, z + 1.6, 0.7, 0.9);
    // a rack with the swords he has taken off them
    const rack = new Group();
    rack.position.set(x + 1.4, 0, z - 3.1);
    rack.rotation.y = -0.3;
    world.add(rack);
    box(1.6, 0.08, 0.1, M.darkWood, 0, 1.05, 0, { parent: rack });
    box(1.6, 0.08, 0.1, M.darkWood, 0, 0.35, 0, { parent: rack });
    for (const sx of [-0.75, 0.75]) box(0.08, 1.2, 0.12, M.darkWood, sx, 0.6, 0, { parent: rack });
    for (const sx of [-0.45, 0, 0.45]) {
      const sw = buildWeapon('sword', ['iron', 'iron', 'iron']);
      sw.position.set(sx, 0.18, 0.08);
      sw.rotation.z = (rng() - 0.5) * 0.12;
      rack.add(sw);
    }
    flatten(rack, world);
    col.box(x + 1.4, z - 3.1, 0.85, 0.2, { ry: -0.3, h: 1.2 });
    // the fire: a ring of stones, logs, and a flame that lights the camp
    const fx = x + 0.6, fz = z + 0.4;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const st = new Mesh(new OctahedronGeometry(0.15, 0), M.rock);
      st.position.set(fx + Math.cos(a) * 0.55, 0.08, fz + Math.sin(a) * 0.55);
      world.add(st);
      disposables.push(st.geometry);
    }
    for (let k = 0; k < 3; k++) box(0.12, 0.12, 0.8, M.darkWood, fx, 0.1, fz, { ry: k * 1.05 });
    const coals = box(0.5, 0.06, 0.5, M.ember, fx, 0.06, fz);
    coals.userData.keep = true;
    for (let k = 0; k < 3; k++) {
      const sp = new Sprite(new SpriteMaterial({ map: flameTex, blending: AdditiveBlending, depthWrite: false, color: 0xffc080 }));
      sp.center.set(0.5, 0.1);
      sp.position.set(fx + (k - 1) * 0.14, 0.1, fz + (k === 1 ? 0.1 : -0.05));
      sp.userData.base = k === 1 ? 0.5 : 0.36;
      sp.userData.phase = k * 2.1;
      world.add(sp);
      fireFlames.push(sp);
      disposables.push(sp.material);
    }
    col.circle(fx, fz, 0.6, { h: 0.4 });
    fire = new PointLight(0xff9a48, 26, 15, 1.3);
    fire.position.set(fx, 1.0, fz);
    world.add(fire);
    // and a lantern on a pole, by the way up
    const lx = x + 4.4, lz = z + 3.4;
    box(0.12, 2.0, 0.12, M.darkWood, lx, 1.0, lz);
    box(0.5, 0.06, 0.1, M.darkWood, lx - 0.2, 1.97, lz);
    box(0.22, 0.28, 0.22, M.iron, lx - 0.4, 1.72, lz);
    const glass = box(0.16, 0.2, 0.16, M.lantern, lx - 0.4, 1.72, lz);
    glass.userData.keep = true;
    col.circle(lx, lz, 0.15, { h: 2 });
  }

  mergeStatic(world);

  /* ------------------------------- collision ------------------------------ */
  // inside the ellipse, less a margin for its bumps; the way up has its own walls
  const ellipseClamp = (p, inset) => {
    const a = DM.rx - inset, b = DM.rz - inset;
    const e = Math.sqrt((p.x / a) ** 2 + (p.z / b) ** 2);
    if (e <= 1) return false;
    p.x /= e; p.z /= e;
    return true;
  };
  col.constrain((p, r) => {
    let moved = false;
    const a = DM.rx - DM.margin - r, b = DM.rz - DM.margin - r;
    if ((p.x / a) ** 2 + (p.z / b) ** 2 > 1) {
      const inTunnel = p.z > b * Math.sqrt(Math.max(0, 1 - (T.half / a) ** 2)) + 0.25;
      if (inTunnel && Math.abs(p.x) < T.half + 1.5) {
        const lim = T.half - r;
        if (Math.abs(p.x) > lim) { p.x = Math.sign(p.x) * lim; moved = true; }
      } else if (p.z < 0 || Math.abs(p.x) > T.half - r) {
        moved = ellipseClamp(p, DM.margin + r) || moved;
      }
    }
    if (p.z > T.end - 1.2 - r) { p.z = T.end - 1.2 - r; moved = true; }
    return moved;
  });

  /* -------------------------------- spawns -------------------------------- */
  const inCamp = (x, z, pad = 0) => Math.hypot(x - DM.camp.x, z - DM.camp.z) < DM.camp.r + pad;
  const nearPillar = (x, z, pad) => DM.pillars.some(([px, pz, pr]) => Math.hypot(x - px, z - pz) < pr + pad);
  const rockSpots = [];
  for (let i = 0; i < 4000 && rockSpots.length < 70; i++) {
    const t = Math.sqrt(rng()) * 0.86, phi = rng() * TAU;
    const R = wallRadius(phi) * t, x = Math.sin(phi) * R, z = Math.cos(phi) * R;
    if (z > DM.rz - 4 && Math.abs(x) < T.half + 2) continue;
    if (inCamp(x, z, 1.6) || nearPillar(x, z, 2.0)) continue;
    if (col.shapes.some((s) => Math.hypot(s.x - x, s.z - z) < (s.r || Math.max(s.hx, s.hz)) + 1.6)) continue;
    if (rockSpots.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < 3.2 * 3.2)) continue;
    rockSpots.push({ x, z, ry: rng() * TAU });
  }
  const skeletonSpots = [];
  for (let i = 0; i < 600 && skeletonSpots.length < 14; i++) {
    const t = 0.25 + rng() * 0.6, phi = Math.PI + (rng() - 0.5) * 4.4;
    const R = wallRadius(phi) * t, x = Math.sin(phi) * R, z = Math.cos(phi) * R;
    if (inCamp(x, z, 3) || nearPillar(x, z, 1.2) || z > DM.rz - 6) continue;
    skeletonSpots.push({ x, z });
  }

  /* ------------------------- where the elites go -------------------------- */
  const blocking = (a, b, pad) => DM.pillars.find(([px, pz, pr]) => segmentHitsCircle(a, b, pr + pad, px, pz));
  const arena = {
    spots: skeletonSpots,
    playerSafe: (P) => inCamp(P.x, P.z, 0.5) || (P.z > DM.rz - 1.6 && Math.abs(P.x) < T.half),
    keepIn(pos, r) {
      col.resolve(pos, r);
      ellipseClamp(pos, DM.margin + r + 0.1);
      const c = DM.camp;
      const cx = pos.x - c.x, cz = pos.z - c.z, cd = Math.hypot(cx, cz) || 1;
      if (cd < c.r) { pos.x = c.x + (cx / cd) * c.r; pos.z = c.z + (cz / cd) * c.r; }
    },
    /** Unless a pillar is between you. */
    sees: (a, b) => !blocking(a, b, -0.2),
    /** Toward `to`, round whichever pillar is in the way. */
    steer(from, to) {
      const dx = to.x - from.x, dz = to.z - from.z;
      const d = Math.hypot(dx, dz) || 1;
      const p = blocking(from, to, 0.55);
      if (!p) return { x: dx / d, z: dz / d };
      const [px, pz] = p;
      const ox0 = from.x - px, oz0 = from.z - pz, ol = Math.hypot(ox0, oz0) || 1;
      const ox = ox0 / ol, oz = oz0 / ol;
      let tx = -oz, tz = ox;
      if (tx * dx + tz * dz < 0) { tx = -tx; tz = -tz; }
      const x = tx + ox * 0.25, z = tz + oz * 0.25, l = Math.hypot(x, z);
      return { x: x / l, z: z / l };
    },
    wanderPoint(from, rand) {
      for (let k = 0; k < 14; k++) {
        const t = 0.15 + rand() * 0.7, phi = rand() * TAU;
        const R = wallRadius(phi) * t, x = Math.sin(phi) * R, z = Math.cos(phi) * R;
        if (!inCamp(x, z, 1.5) && !nearPillar(x, z, 0.9) && z < DM.rz - 4) return { x, z };
      }
      return { x: from.x, z: from.z };
    },
  };

  /* -------------------------------- update -------------------------------- */
  const update = (dt, t) => {
    for (const fl of flames) {
      const k = fl.userData.base * (0.88 + 0.16 * Math.sin(t * 14 + fl.userData.phase) * Math.sin(t * 6.1 + fl.userData.phase));
      fl.scale.set(k, k * 1.8, 1);
    }
    for (const fl of fireFlames) {
      const k = fl.userData.base * (0.85 + 0.22 * Math.sin(t * 12 + fl.userData.phase) * Math.sin(t * 7.7 + fl.userData.phase));
      fl.scale.set(k, k * 1.7, 1);
    }
    for (const pl of lights) pl.intensity = 30 * (0.86 + 0.14 * Math.sin(t * 11 + pl.userData.phase) * Math.sin(t * 4.7 + pl.userData.phase));
    fire.intensity = 26 * (0.8 + 0.2 * Math.sin(t * 9.3) * Math.sin(t * 5.1));
  };

  /** Where the camera may be: in the cavern, under the roof, out of the pillars; or in the way up. */
  const cameraAllowed = (x, y, z) => {
    if (z > DM.rz - 2 && Math.abs(x) < T.half - 0.35) return y < T.h - 0.35 && z < T.end - 0.6;
    if (ellipseT(x, z) > 0.94) return false;
    if (nearPillar(x, z, 0.35)) return false;
    return y < roofAt(x, z) - 0.6;
  };

  const dispose = () => {
    scene.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });
    for (const d of disposables) d.dispose?.();
  };

  return {
    id: 'deep', name: 'The Deep Mine', sub: 'Elite skeletons below. Jack keeps camp by the steps',
    scene, collider: col, ground: () => 0,
    spawn: DM.entry, rockSpots, skeletonSpots, inCamp, torches: flames, arena, mine: true,
    update, cameraAllowed, dispose,
    /** Up the steps at the south end: back to the cave. */
    leaving: (p) => p.z > DM.exitZ,
  };
}
