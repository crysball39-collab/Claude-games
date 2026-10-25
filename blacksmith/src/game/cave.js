/* =============================================================================
   Inside the cave: one round stone room with a great round wall standing in
   the middle of it, so the floor is a ring you can walk all the way round.
   You come in down a tunnel from the south, where Rob keeps his camp.

            north (-Z)
          .-'''''''-.
        .'  .-----.  '.        R_OUT  the room's wall
       /   /       \   \       R_IN   the wall in the middle
      |   |  wall   |   |
       \   \       /   /
        '.  '-----'  .'
          '-.__ __.-'
              | |              the tunnel out, and Rob just inside it
            south (+Z)
   ========================================================================== */
import {
  Scene, Group, Mesh, Color, Fog, Vector3, BufferGeometry, Float32BufferAttribute,
  BoxGeometry, CylinderGeometry, ConeGeometry, OctahedronGeometry, PlaneGeometry, CircleGeometry, TorusGeometry,
  MeshLambertMaterial, MeshPhongMaterial, MeshBasicMaterial, SpriteMaterial, Sprite,
  HemisphereLight, AmbientLight, PointLight, AdditiveBlending,
} from 'three';
import { makeRng, valueNoise2D, fbm, clamp01, lerp, TAU } from '../core/util.js';
import { rockTexture, slabTexture, woodTexture, flameTexture, softDotTexture } from './textures.js';
import { mergeStatic, flatten, tiledBox, rockGeometry } from './geo.js';
import { Collider } from './collide.js';
import { oreMaterial } from './materials.js';
import { ORE_ORDER } from './data.js';

export const CV = {
  rOut: 22, rIn: 6.5,
  /** how close to the walls you can actually walk, allowing for their bumps */
  outLimit: 21.0, inLimit: 7.3,
  wallH: 6.6, vault: 3.2,
  tunnel: { half: 2.3, h: 4.6, end: 34 },
  entry: { x: 0, z: 28.6, yaw: Math.PI },        // just in, facing the room
  exitZ: 32.6,
  camp: { x: 5.6, z: 16.6, r: 6.0 },             // Rob's, and no skeleton comes near it
  rob: { x: 4.3, z: 16.2, yaw: -0.86 },          // facing whoever walks in
};

/** Torches: angles round the outer wall and round the middle one. */
const OUTER_TORCHES = Array.from({ length: 8 }, (_, k) => (k + 0.5) * (TAU / 8));
const INNER_TORCHES = Array.from({ length: 4 }, (_, k) => k * (TAU / 4) + TAU / 8 + 0.4);

/** Height of the ceiling over a point on the ring. */
export function ceilingAt(d) {
  const t = clamp01((d - CV.rIn) / (CV.rOut - CV.rIn));
  return CV.wallH + CV.vault * Math.sin(Math.PI * t);
}

export function buildCave({ quality }) {
  const scene = new Scene();
  scene.background = new Color('#07060a');
  scene.fog = new Fog('#100e14', 22, 62);
  const col = new Collider();
  const disposables = [];
  const keep = (...xs) => { disposables.push(...xs); return xs[0]; };
  const low = quality.name === 'low';
  const rng = makeRng(808);
  const noise = valueNoise2D(17);

  const rockTex = keep(rockTexture(256, { seed: 21, tint: [0.92, 0.9, 0.94] }));
  const floorTex = keep(slabTexture(256));
  const woodTex = keep(woodTexture(128, { seed: 8, planks: 1, base: [110, 74, 42] }));
  const M = {
    wall: new MeshLambertMaterial({ map: rockTex, vertexColors: true }),
    floor: new MeshLambertMaterial({ map: floorTex, vertexColors: true, color: 0xc2bdbb }),
    rock: new MeshLambertMaterial({ map: rockTex, color: 0x8d8790 }),
    beam: new MeshLambertMaterial({ map: woodTex }),
    darkWood: new MeshLambertMaterial({ color: 0x4f321b }),
    iron: new MeshPhongMaterial({ color: 0x3b3f45, specular: 0x777777, shininess: 40 }),
    daylight: new MeshBasicMaterial({ color: 0xeaf6ff, fog: false }),
    lantern: new MeshBasicMaterial({ color: 0xffd27a }),
    cloth: new MeshLambertMaterial({ color: 0x8c6b45 }),
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
  // enough cold light to see by everywhere; the torches bring the warmth
  scene.add(new HemisphereLight(0xa8b4d8, 0x3a3028, 2.1));
  scene.add(new AmbientLight(0x9098b0, 0.85));

  /* ------------------------------ the rock shell -------------------------- */
  // How far each bit of wall leans in or out, so it reads as rock, not a pipe.
  const bump = (phi, y, r, amp) => (fbm(noise, phi * r * 0.16 + r, y * 0.32, 4) - 0.5) * 2 * amp;
  const phiE = Math.asin((CV.tunnel.half + 0.1) / CV.rOut);
  /** shade by depth, with the lit band at torch height */
  const shadeAt = (y) => 0.62 + 0.38 * Math.exp(-((y - 2.6) ** 2) / 6);

  /**
   * A wall as a grid over angle and height. `inward` = the room is inside
   * the circle (the outer wall), otherwise outside it (the middle wall).
   */
  function wallGrid(R, phi0, phi1, y0, y1, nPhi, nY, inward, amp, tapers = []) {
    const pos = [], uv = [], colr = [], idx = [];
    for (let j = 0; j <= nY; j++) {
      const y = lerp(y0, y1, j / nY);
      for (let i = 0; i <= nPhi; i++) {
        const phi = lerp(phi0, phi1, i / nPhi);
        let a = amp;
        for (const tp of tapers) a *= clamp01(Math.abs(angleDiff(phi, tp)) / 0.22 - 0.5);
        const rr = R + (inward ? 1 : -1) * bump(phi, y, R, a) * 0.9 + (inward ? 0.25 : 0);
        pos.push(Math.sin(phi) * rr, y, Math.cos(phi) * rr);
        uv.push(phi * R / 3, y / 3);
        const k = shadeAt(y) * (0.85 + fbm(noise, phi * 6, y * 0.5, 2) * 0.3);
        colr.push(k, k * 0.97, k * 0.95);
      }
    }
    const row = nPhi + 1;
    for (let j = 0; j < nY; j++) {
      for (let i = 0; i < nPhi; i++) {
        const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
        if (inward) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new Float32BufferAttribute(colr, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    disposables.push(g);
    const m = new Mesh(g, M.wall);
    world.add(m);
    return m;
  }
  const angleDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

  const segs = low ? 64 : 110;
  // outer wall, all the way round but for the tunnel, and the stretch over
  // it; flat where it meets the tunnel and behind each torch
  wallGrid(CV.rOut, phiE, TAU - phiE, 0, CV.wallH + 0.4, segs, 9, true, 0.75, [0, ...OUTER_TORCHES]);
  wallGrid(CV.rOut, -phiE, phiE, CV.tunnel.h, CV.wallH + 0.4, 4, 3, true, 0.0);
  // the wall in the middle, floor to ceiling
  wallGrid(CV.rIn, 0, TAU, 0, CV.wallH + 0.4, low ? 40 : 64, 12, false, 0.75, INNER_TORCHES);

  // the vault: a ring of ceiling, highest halfway between the walls
  {
    const nPhi = segs, nR = 10;
    const pos = [], uv = [], colr = [], idx = [];
    for (let j = 0; j <= nR; j++) {
      const d = lerp(CV.rIn - 0.4, CV.rOut + 0.6, j / nR);
      for (let i = 0; i <= nPhi; i++) {
        const phi = (i / nPhi) * TAU;
        const y = ceilingAt(Math.min(CV.rOut, Math.max(CV.rIn, d))) + 0.3 + (fbm(noise, phi * 4, d * 0.3, 3) - 0.5) * 1.4;
        pos.push(Math.sin(phi) * d, y, Math.cos(phi) * d);
        uv.push(phi * 3, d / 3);
        const k = 0.42 + fbm(noise, phi * 5 + 3, d * 0.2, 2) * 0.25;
        colr.push(k, k, k * 1.04);
      }
    }
    const row = nPhi + 1;
    for (let j = 0; j < nR; j++) {
      for (let i = 0; i < nPhi; i++) {
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

  // the floor: darker near the walls, worn paler round the middle of the ring
  {
    const g = new CircleGeometry(CV.rOut + 1.4, segs, 0, TAU);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, uv = g.attributes.uv;
    const colr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), d = Math.hypot(x, z);
      uv.setXY(i, x / 4, z / 4);
      const mid = 1 - Math.abs((d - (CV.rIn + CV.rOut) / 2) / ((CV.rOut - CV.rIn) / 2));
      const k = 0.82 + mid * 0.2 + (fbm(noise, x * 0.2, z * 0.2, 3) - 0.5) * 0.25;
      colr[i * 3] = k; colr[i * 3 + 1] = k * 0.96; colr[i * 3 + 2] = k * 0.92;
    }
    // the ring is circular enough that a fan from the centre will do
    g.setAttribute('color', new Float32BufferAttribute(colr, 3));
    disposables.push(g);
    world.add(new Mesh(g, M.floor));
  }

  /* -------------------------------- the tunnel ---------------------------- */
  {
    const T = CV.tunnel, z0 = CV.rOut - 1.2, len = T.end - z0 + 1;
    const zc = z0 + len / 2;
    // walls brighten toward the daylight at the far end
    const part = (w, h, d, x, y, z) => {
      const g = tiledBox(w, h, d, 1.6);
      const p = g.attributes.position;
      const c = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const wz = z + p.getZ(i);
        const k = 0.5 + 0.3 * clamp01((wz - (T.end - 7)) / 7);
        c[i * 3] = k; c[i * 3 + 1] = k; c[i * 3 + 2] = k * 1.03;
      }
      g.setAttribute('color', new Float32BufferAttribute(c, 3));
      disposables.push(g);
      const m = new Mesh(g, M.wall);
      m.position.set(x, y, z);
      m.userData.keep = true;
      world.add(m);
    };
    part(0.6, T.h, len, -T.half - 0.4, T.h / 2, zc);
    part(0.6, T.h, len, T.half + 0.4, T.h / 2, zc);
    part(T.half * 2 + 1.4, 0.6, len, 0, T.h + 0.3, zc);
    part(T.half * 2 + 0.2, 0.04, len, 0, 0.0, zc);
    const out = new Mesh(new PlaneGeometry(T.half * 2 + 0.2, T.h), M.daylight);
    out.position.set(0, T.h / 2, T.end + 0.4);
    out.rotation.y = Math.PI;
    world.add(out);
    disposables.push(out.geometry);
    // the glow sits in the opening itself, behind anywhere the camera can be
    const glow = new Sprite(new SpriteMaterial({ map: keep(softDotTexture(64, 'rgba(230,245,255,0.7)', 'rgba(200,230,255,0)')), blending: AdditiveBlending, depthWrite: false, fog: false }));
    glow.position.set(0, T.h / 2, T.end + 0.3);
    glow.scale.set(6, 5, 1);
    world.add(glow);
    disposables.push(glow.material);
    const day = new PointLight(0xdfeeff, 5, 9, 1.4);
    day.position.set(0, 2.6, T.end - 1);
    world.add(day);
    // timber frames down the tunnel and round its mouth
    for (let z = z0 + 0.4; z < T.end; z += 3.4) {
      for (const sx of [-1, 1]) box(0.3, T.h, 0.3, M.beam, sx * (T.half - 0.05), T.h / 2, z);
      box(T.half * 2 + 0.4, 0.32, 0.34, M.beam, 0, T.h - 0.16, z);
    }
  }

  /* --------------------------------- torches ------------------------------ */
  const flameTex = keep(flameTexture(64));
  const flames = [];
  const lights = [];
  const maxLights = quality.caveLights;
  const torch = (phi, R, inward, light) => {
    // the wall is flat behind a torch: R + 0.25 on the outside wall, R on the middle one
    const surface = inward ? R + 0.25 : R;
    const off = inward ? -0.6 : 0.55;
    const d = surface + off;
    const x = Math.sin(phi) * d, z = Math.cos(phi) * d;
    const y = 2.7;
    const stick = new Mesh(new CylinderGeometry(0.045, 0.035, 0.7, 6), M.darkWood);
    // leaning out from the wall, into the room
    const tilt = inward ? -0.5 : 0.5;
    stick.position.set(Math.sin(phi) * (d - off * 0.35), y - 0.25, Math.cos(phi) * (d - off * 0.35));
    stick.rotation.set(Math.cos(phi) * tilt, 0, -Math.sin(phi) * tilt);
    world.add(stick);
    const bracket = new Mesh(new BoxGeometry(0.16, 0.16, 0.16), M.iron);
    bracket.position.set(Math.sin(phi) * (surface + off * 0.12), y - 0.45, Math.cos(phi) * (surface + off * 0.12));
    world.add(bracket);
    const fl = new Sprite(new SpriteMaterial({ map: flameTex, blending: AdditiveBlending, depthWrite: false, color: 0xffc080 }));
    fl.position.set(x, y + 0.2, z);
    fl.userData.base = 0.36;
    fl.userData.phase = phi * 3;
    world.add(fl);
    flames.push(fl);
    disposables.push(fl.material);
    const halo = new Sprite(new SpriteMaterial({ map: keep(softDotTexture(64, 'rgba(255,170,90,0.5)', 'rgba(255,120,40,0)')), blending: AdditiveBlending, depthWrite: false }));
    halo.position.set(x, y + 0.15, z);
    halo.scale.set(2.2, 2.2, 1);
    world.add(halo);
    disposables.push(halo.material);
    if (light && lights.length < maxLights) {
      const pl = new PointLight(0xffa050, 34, 20, 1.25);
      pl.position.set(Math.sin(phi) * (d + off * 0.6), y + 0.1, Math.cos(phi) * (d + off * 0.6));
      pl.userData.phase = phi * 5;
      world.add(pl);
      lights.push(pl);
    }
  };
  // with only a few lights to go round, they go to every other torch
  OUTER_TORCHES.forEach((phi, k) => torch(phi, CV.rOut, true, maxLights >= 8 || k % 2 === 0));
  for (const phi of INNER_TORCHES) torch(phi, CV.rIn, false, maxLights >= 10);
  // Rob's lantern, by the way in
  {
    const { x, z } = CV.camp;
    const lx = x + 0.9, lz = z + 2.3;
    box(0.12, 2.0, 0.12, M.darkWood, lx, 1.0, lz);
    box(0.5, 0.06, 0.1, M.darkWood, lx - 0.2, 1.97, lz);
    box(0.22, 0.28, 0.22, M.iron, lx - 0.4, 1.72, lz);
    const glass = box(0.16, 0.2, 0.16, M.lantern, lx - 0.4, 1.72, lz);
    glass.userData.keep = true;
    const pl = new PointLight(0xffc070, 16, 12, 1.4);
    pl.position.set(lx - 0.4, 1.9, lz);
    world.add(pl);
    col.circle(lx, lz, 0.15, { h: 2 });
  }

  /* --------------------------- the room's dressing ------------------------ */
  // stalactites overhead, stalagmites against the walls
  {
    const n = low ? 26 : 50;
    for (let i = 0; i < n; i++) {
      const phi = rng() * TAU, d = lerp(CV.rIn + 1, CV.rOut - 1, rng());
      const len = 0.6 + rng() * 1.8;
      const g = new ConeGeometry(0.15 + rng() * 0.25, len, 6);
      g.rotateX(Math.PI);
      const m = new Mesh(g, M.rock);
      m.position.set(Math.sin(phi) * d, ceilingAt(d) + 0.2 - len / 2, Math.cos(phi) * d);
      world.add(m);
      disposables.push(g);
    }
    for (let i = 0; i < (low ? 16 : 30); i++) {
      const phi = rng() * TAU;
      if (Math.abs(angleDiff(phi, 0)) < 0.3) continue;
      // kept back against the walls, out of the way of your feet
      const outer = rng() < 0.72;
      const d = outer ? CV.rOut - 0.4 - rng() * 0.4 : CV.rIn + 0.25 + rng() * 0.2;
      const h = 0.6 + rng() * 1.6;
      const g = new ConeGeometry(0.18 + rng() * (outer ? 0.22 : 0.17), h, 6);
      const m = new Mesh(g, M.rock);
      m.position.set(Math.sin(phi) * d, h / 2 - 0.05, Math.cos(phi) * d);
      world.add(m);
      disposables.push(g);
    }
  }
  // crystals that give off their own faint light
  const crystalMats = ['amethyst', 'emerald', 'diamond'].map((ore) => {
    const base = oreMaterial(ore);
    return keep(new MeshPhongMaterial({ color: base.color, emissive: base.color.clone().multiplyScalar(0.45), shininess: 120, flatShading: true }));
  });
  for (let i = 0; i < (low ? 8 : 14); i++) {
    const phi = rng() * TAU;
    if (Math.abs(angleDiff(phi, 0)) < 0.45) continue;
    const outer = rng() < 0.7;
    const d = outer ? CV.rOut - 0.45 : CV.rIn + 0.4;
    const mat = crystalMats[(rng() * 3) | 0];
    const cx = Math.sin(phi) * d, cz = Math.cos(phi) * d;
    for (let k = 0; k < 4; k++) {
      const s = 0.12 + rng() * 0.14;
      const g = new OctahedronGeometry(s, 0);
      g.scale(1, 2.6 + rng() * 1.5, 1);
      const m = new Mesh(g, mat);
      m.position.set(cx + (rng() - 0.5) * 0.45, s * 1.8, cz + (rng() - 0.5) * 0.45);
      m.rotation.set((rng() - 0.5) * 0.9, rng() * 3, (rng() - 0.5) * 0.9);
      world.add(m);
      disposables.push(g);
    }
  }
  // old mine props about the walls
  {
    const crate = (x, z, s = 0.7, ry = 0) => {
      box(s, s, s, M.beam, x, s / 2, z, { ry, tile: s });
      col.box(x, z, s / 2 + 0.02, s / 2 + 0.02, { ry, h: s });
    };
    // Rob's camp, off to the right of the way in: a mine cart full of ore,
    // and crates to sit on
    const { x, z } = CV.camp;
    const cart = new Group();
    cart.position.set(x + 2.0, 0, z - 2.0);
    cart.rotation.y = 0.5;
    world.add(cart);
    box(1.0, 0.5, 1.4, M.iron, 0, 0.55, 0, { parent: cart });
    box(0.86, 0.06, 1.26, M.darkWood, 0, 0.78, 0, { parent: cart });
    for (const sx of [-0.52, 0.52]) {
      for (const sz of [-0.45, 0.45]) {
        const w = new Mesh(new CylinderGeometry(0.17, 0.17, 0.08, 10), M.iron);
        w.rotation.z = Math.PI / 2;
        w.position.set(sx, 0.17, sz);
        cart.add(w);
        disposables.push(w.geometry);
      }
    }
    for (let i = 0; i < 9; i++) {
      const ore = ORE_ORDER[[0, 0, 0, 1, 2, 1, 4, 0, 2][i]];
      const lump = new Mesh(new OctahedronGeometry(0.12 + rng() * 0.06, 0), oreMaterial(ore));
      lump.position.set((rng() - 0.5) * 0.6, 0.86 + rng() * 0.1, (rng() - 0.5) * 0.95);
      lump.rotation.set(rng() * 3, rng() * 3, 0);
      cart.add(lump);
      disposables.push(lump.geometry);
    }
    col.box(x + 2.0, z - 2.0, 0.62, 0.8, { ry: 0.5, h: 1.1 });
    crate(x + 2.6, z + 1.0, 0.8, 0.2);
    crate(x + 3.2, z + 1.9, 0.6, 0.6);
    crate(x - 0.2, z - 2.8, 0.75, -0.3);
    flatten(cart, world);
    // a bedroll and a cold campfire ring
    box(0.8, 0.08, 1.8, M.cloth, x + 1.7, 0.04, z + 3.3, { ry: 1.2 });
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU;
      const s = new Mesh(new OctahedronGeometry(0.13, 0), M.rock);
      s.position.set(x - 1.9 + Math.cos(a) * 0.45, 0.07, z - 1.6 + Math.sin(a) * 0.45);
      world.add(s);
      disposables.push(s.geometry);
    }
    // supports and crates elsewhere round the ring
    for (const phi of [1.2, 2.3, 3.6, 4.6, 5.5]) {
      const d = CV.rOut - 1.25;
      const px = Math.sin(phi) * d, pz = Math.cos(phi) * d;
      box(0.28, 4.2, 0.28, M.beam, px, 2.1, pz);
      // the beam it holds up runs along the wall
      box(0.25, 0.25, 2.2, M.beam, px, 4.1, pz, { ry: phi + Math.PI / 2 });
      col.circle(px, pz, 0.2, { h: 4.2 });
    }
    for (const [phi, d] of [[1.6, 19.6], [3.1, 19.8], [4.1, 9.0], [5.2, 19.5]]) {
      crate(Math.sin(phi) * d, Math.cos(phi) * d, 0.7, phi);
    }
  }

  mergeStatic(world);

  /* ------------------------------- collision ------------------------------ */
  const T = CV.tunnel;
  col.constrain((p, r) => {
    let moved = false;
    const d = Math.hypot(p.x, p.z) || 1e-6;
    if (d < CV.inLimit + r) {
      const k = (CV.inLimit + r) / d;
      p.x *= k; p.z *= k; moved = true;
    }
    const inMouth = p.z > 0 && Math.abs(p.x) < T.half - r;
    if (!inMouth && d > CV.outLimit - r) {
      const k = (CV.outLimit - r) / d;
      p.x *= k; p.z *= k; moved = true;
    }
    if (p.z > T.end - r) { p.z = T.end - r; moved = true; }
    return moved;
  });

  /* -------------------------------- spawns -------------------------------- */
  const inCamp = (x, z, pad = 0) => Math.hypot(x - CV.camp.x, z - CV.camp.z) < CV.camp.r + pad;
  const rockSpots = [];
  for (let i = 0; i < 3000 && rockSpots.length < 64; i++) {
    const phi = rng() * TAU;
    if (Math.abs(angleDiff(phi, 0)) < 0.42) continue;
    const d = lerp(CV.inLimit + 1.6, CV.outLimit - 1.7, Math.sqrt(rng()));
    const x = Math.sin(phi) * d, z = Math.cos(phi) * d;
    if (inCamp(x, z, 1.2)) continue;
    if (col.shapes.some((s) => Math.hypot(s.x - x, s.z - z) < (s.r || Math.max(s.hx, s.hz)) + 1.6)) continue;
    if (rockSpots.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < 3.1 * 3.1)) continue;
    rockSpots.push({ x, z, ry: rng() * TAU });
  }
  const skeletonSpots = [];
  for (let i = 0; i < 400 && skeletonSpots.length < 12; i++) {
    const phi = lerp(1.9, TAU - 1.9, rng());
    const d = lerp(CV.inLimit + 2.5, CV.outLimit - 2.5, rng());
    skeletonSpots.push({ x: Math.sin(phi) * d, z: Math.cos(phi) * d });
  }

  /* -------------------------------- update -------------------------------- */
  const update = (dt, t) => {
    for (const fl of flames) {
      const k = fl.userData.base * (0.88 + 0.16 * Math.sin(t * 14 + fl.userData.phase) * Math.sin(t * 6.1 + fl.userData.phase));
      fl.scale.set(k, k * 1.8, 1);
    }
    for (const pl of lights) pl.intensity = 34 * (0.86 + 0.14 * Math.sin(t * 11 + pl.userData.phase) * Math.sin(t * 4.7 + pl.userData.phase));
  };

  /** Where the camera may be: inside the room or the tunnel, under the roof. */
  const cameraAllowed = (x, y, z) => {
    const d = Math.hypot(x, z);
    if (z > CV.rOut - 2 && Math.abs(x) < T.half - 0.35) return y < T.h - 0.35 && z < T.end;
    if (d < CV.rIn + 1.0 || d > CV.rOut - 1.3) return false;
    return y < ceilingAt(d) - 0.6;
  };

  const dispose = () => {
    scene.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });
    for (const d of disposables) d.dispose?.();
  };

  return {
    id: 'cave', name: 'The Cave', sub: 'Rob is just inside',
    scene, collider: col, ground: () => 0,
    spawn: CV.entry, rockSpots, skeletonSpots, inCamp,
    update, cameraAllowed, dispose,
    leaving: (p) => p.z > CV.exitZ,
  };
}
