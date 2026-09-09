// The island: heightfield terrain, three biomes, and the natural props
// (trees, snow trees, cacti, rocks) that can be harvested for wood.
import * as THREE from 'three';
import { fbm, noise2, clamp, lerp, smoothstep, TAU } from './util.js';

export const WORLD = {
  size: 2400,
  half: 1200,
  seg: 400,
  // biome boundaries along Z
  forestEnd: -340,
  desertEnd: 340,
  blend: 110,
};

// Regions that get levelled so buildings sit flat.
export const FLATS = [
  { x: 0,    z: -940, r: 200, fade: 120, y: 16 },    // Summering Falls
  { x: 0,    z: 0,    r: 190, fade: 130, y: 6 },     // Pumped Palms
  { x: -800, z: 820,  r: 195, fade: 130, y: 26 },    // Snowy Snarks
  { x: 0,    z: -1160, r: 72, fade: 46,  y: 7.4 },   // the falls basin
];

export const POIS = [
  { id: 'summering', name: 'Summering Falls', x: 0,    z: -940, y: 16, r: 190, biome: 'forest' },
  { id: 'pumped',    name: 'Pumped Palms',    x: 0,    z: 0,    y: 6,  r: 180, biome: 'desert' },
  { id: 'snowy',     name: 'Snowy Snarks',    x: -800, z: 820,  y: 26, r: 185, biome: 'snow' },
];

export function biomeWeights(x, z) {
  const b = WORLD.blend;
  const forest = 1 - smoothstep(WORLD.forestEnd - b, WORLD.forestEnd + b, z);
  const snow = smoothstep(WORLD.desertEnd - b, WORLD.desertEnd + b, z);
  const desert = clamp(1 - forest - snow, 0, 1);
  return { forest, desert, snow };
}

export function biomeAt(x, z) {
  const w = biomeWeights(x, z);
  if (w.forest >= w.desert && w.forest >= w.snow) return 'forest';
  if (w.snow >= w.desert) return 'snow';
  return 'desert';
}

/** The single source of truth for ground height. */
export function heightAt(x, z) {
  const w = biomeWeights(x, z);

  // rolling base hills everywhere
  let h = 14 + fbm(x * 0.00085, z * 0.00085, 4) * 26;
  h += fbm(x * 0.0034 + 11, z * 0.0034 - 7, 3) * 9 * (0.5 + w.forest * 0.8);
  h += noise2(x * 0.011, z * 0.011) * 1.9;

  // desert dunes: long smooth ridges
  const dune = Math.abs(noise2(x * 0.0021 + 40, z * 0.0021 + 40));
  h = lerp(h, 6 + dune * 22 + noise2(x * 0.0075, z * 0.0075) * 2.2, w.desert * 0.85);

  // snow: taller, sharper peaks toward the far edge
  const peak = Math.pow(clamp((z - WORLD.desertEnd) / 700, 0, 1), 1.5);
  h += w.snow * (peak * 46 * (0.55 + 0.45 * fbm(x * 0.0016 - 5, z * 0.0016 + 3, 3)));

  // island falloff so the map edge drops toward the sea
  const edge = Math.max(Math.abs(x), Math.abs(z));
  const fall = smoothstep(WORLD.half - 230, WORLD.half + 40, edge);
  h = lerp(h, -12, fall);

  for (const f of FLATS) {
    const d = Math.hypot(x - f.x, z - f.z);
    const t = 1 - smoothstep(f.r, f.r + f.fade, d);
    h = lerp(h, f.y, t);
  }
  return h;
}

export const SEA_LEVEL = 2.0;
export const FALLS_WATER = 8.6;

function terrainColor(x, z, h, slope, out) {
  const w = biomeWeights(x, z);
  const n = noise2(x * 0.06, z * 0.06) * 0.5 + noise2(x * 0.014, z * 0.014) * 0.5;
  let r = 0, g = 0, b = 0;
  // forest grass
  const grassT = 0.5 + n * 0.22;
  r += w.forest * lerp(0.22, 0.36, grassT);
  g += w.forest * lerp(0.44, 0.60, grassT);
  b += w.forest * lerp(0.17, 0.24, grassT);
  // desert sand
  r += w.desert * lerp(0.80, 0.91, 0.5 + n * 0.3);
  g += w.desert * lerp(0.68, 0.78, 0.5 + n * 0.3);
  b += w.desert * lerp(0.44, 0.53, 0.5 + n * 0.3);
  // snow
  const sn = lerp(0.86, 0.99, 0.5 + n * 0.3);
  r += w.snow * sn; g += w.snow * sn; b += w.snow * (sn + 0.02);

  // cliffs show rock
  const rock = smoothstep(0.55, 0.86, slope);
  const rc = 0.40 + n * 0.06;
  r = lerp(r, rc, rock); g = lerp(g, rc * 0.97, rock); b = lerp(b, rc * 0.92, rock);

  // beach ring
  const beach = 1 - smoothstep(3.0, 7.5, h);
  r = lerp(r, 0.85, beach * 0.85); g = lerp(g, 0.78, beach * 0.85); b = lerp(b, 0.58, beach * 0.85);

  out[0] = r; out[1] = g; out[2] = b;
}

// Rectangles where the terrain mesh is cut away (the bunker shaft at Pumped Palms).
export const TERRAIN_HOLES = [
  { x0: -3.9, z0: 18.0, x1: 3.9, z1: 37.2 },
];

export function createTerrain() {
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, WORLD.seg, WORLD.seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
  }
  const cell = WORLD.size / WORLD.seg;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i);
    const hx = heightAt(x + cell, z) - heightAt(x - cell, z);
    const hz = heightAt(x, z + cell) - heightAt(x, z - cell);
    const slope = Math.min(1, Math.hypot(hx, hz) / (cell * 2) * 1.6);
    terrainColor(x, z, h, slope, c);
    colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // cut holes: drop any triangle whose centroid falls inside a hole rect
  if (TERRAIN_HOLES.length) {
    const idx = geo.index.array;
    const keep = [];
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i], b2 = idx[i + 1], c2 = idx[i + 2];
      const cx = (pos.getX(a) + pos.getX(b2) + pos.getX(c2)) / 3;
      const cz = (pos.getZ(a) + pos.getZ(b2) + pos.getZ(c2)) / 3;
      let inside = false;
      for (const h of TERRAIN_HOLES) {
        if (cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1) { inside = true; break; }
      }
      if (!inside) keep.push(a, b2, c2);
    }
    geo.setIndex(keep);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return { mesh, mapCanvas: createMapCanvas(pos, colors) };
}

/**
 * Top-down map image, built straight from the terrain's own vertex grid so the
 * map and the world can never disagree — and so it costs no extra heightAt calls.
 * Row 0 is z = -half (north), column 0 is x = -half (west).
 */
function createMapCanvas(pos, colors) {
  const n = WORLD.seg + 1;
  const canvas = document.createElement('canvas');
  canvas.width = n; canvas.height = n;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(n, n);
  const d = img.data;
  const hAt = (ix, iy) => pos.getY(clamp(iy, 0, n - 1) * n + clamp(ix, 0, n - 1));
  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      const vi = iy * n + ix;
      const h = pos.getY(vi);
      // cheap hillshade from the height difference to the north-west
      const shade = clamp(1 + (hAt(ix - 1, iy) + hAt(ix, iy - 1) - h * 2) * 0.05, 0.6, 1.45);
      const under = h < SEA_LEVEL;
      const o = vi * 4;
      if (under) {
        const deep = clamp((SEA_LEVEL - h) / 14, 0, 1);
        d[o] = lerp(60, 18, deep); d[o + 1] = lerp(120, 54, deep); d[o + 2] = lerp(165, 104, deep);
      } else {
        d[o] = clamp(colors[vi * 3] * 255 * shade, 0, 255);
        d[o + 1] = clamp(colors[vi * 3 + 1] * 255 * shade, 0, 255);
        d[o + 2] = clamp(colors[vi * 3 + 2] * 255 * shade, 0, 255);
      }
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function createWater() {
  const g = new THREE.Group();
  const mkPlane = (size, y, color, opacity) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshLambertMaterial({ color, transparent: true, opacity })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    return m;
  };
  const sea = mkPlane(WORLD.size * 2.4, SEA_LEVEL, 0x1d5c8c, 0.86);
  g.add(sea);
  const pond = mkPlane(230, FALLS_WATER, 0x2f86b8, 0.8);
  pond.position.set(0, FALLS_WATER, -1160);
  g.add(pond);
  g.userData.pond = pond;
  return g;
}

// ---------------------------------------------------------------------------
// Harvestable nature.  Trees are instanced (a few thousand of them) and each
// instance carries hit points; breaking one hides that instance and drops its
// collider.
// ---------------------------------------------------------------------------
export class Nature {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.groups = [];
    this.instances = [];   // { groupIndex, index, hp, maxHp, collider, alive, x,z, wood }
  }

  _makeGroup(defs, count) {
    const parts = defs.map(d => {
      const im = new THREE.InstancedMesh(d.geo, d.mat, count);
      im.castShadow = true;
      im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      this.scene.add(im);
      return { im, off: d.off, scaleY: d.scaleY ?? 1 };
    });
    const g = { parts, count, used: 0 };
    this.groups.push(g);
    return g;
  }

  scatter(rng) {
    const dummy = new THREE.Object3D();

    const geoTrunk = new THREE.CylinderGeometry(0.24, 0.40, 5.2, 6);
    const geoLeaf1 = new THREE.ConeGeometry(2.5, 4.2, 7);
    const geoLeaf2 = new THREE.ConeGeometry(1.9, 3.4, 7);
    const geoSnowLeaf1 = new THREE.ConeGeometry(2.4, 4.0, 7);
    const geoSnowCap = new THREE.ConeGeometry(1.7, 2.6, 7);
    const geoCactusBody = new THREE.CylinderGeometry(0.42, 0.5, 3.6, 8);
    const geoCactusArm = new THREE.CylinderGeometry(0.26, 0.28, 1.7, 7);
    const geoRock = new THREE.DodecahedronGeometry(1.5, 0);
    const geoBush = new THREE.IcosahedronGeometry(1.0, 0);

    const barkMat = new THREE.MeshLambertMaterial({ color: 0x5a3d24 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f6d2c, flatShading: true });
    const leafMat2 = new THREE.MeshLambertMaterial({ color: 0x3b8235, flatShading: true });
    const snowBark = new THREE.MeshLambertMaterial({ color: 0x4a3a2c });
    const snowLeaf = new THREE.MeshLambertMaterial({ color: 0x2d5a4a, flatShading: true });
    const snowCap = new THREE.MeshLambertMaterial({ color: 0xf2f7ff, flatShading: true });
    const cactusMat = new THREE.MeshLambertMaterial({ color: 0x3f7a45, flatShading: true });
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x6f6f70, flatShading: true });
    const rockSnowMat = new THREE.MeshLambertMaterial({ color: 0xc9d6e2, flatShading: true });
    const bushMat = new THREE.MeshLambertMaterial({ color: 0x35702f, flatShading: true });

    const FOREST_TREES = 1500, SNOW_TREES = 800, CACTI = 420, ROCKS = 330, BUSHES = 420;

    const gForest = this._makeGroup([
      { geo: geoTrunk, mat: barkMat, off: [0, 2.6, 0] },
      { geo: geoLeaf1, mat: leafMat, off: [0, 5.6, 0] },
      { geo: geoLeaf2, mat: leafMat2, off: [0, 7.6, 0] },
    ], FOREST_TREES);
    const gSnow = this._makeGroup([
      { geo: geoTrunk, mat: snowBark, off: [0, 2.6, 0] },
      { geo: geoSnowLeaf1, mat: snowLeaf, off: [0, 5.4, 0] },
      { geo: geoSnowCap, mat: snowCap, off: [0, 7.4, 0] },
    ], SNOW_TREES);
    const gCactus = this._makeGroup([
      { geo: geoCactusBody, mat: cactusMat, off: [0, 1.8, 0] },
      { geo: geoCactusArm, mat: cactusMat, off: [0.75, 2.5, 0] },
      { geo: geoCactusArm, mat: cactusMat, off: [-0.75, 2.1, 0] },
    ], CACTI);
    const gRock = this._makeGroup([{ geo: geoRock, mat: rockMat, off: [0, 0.6, 0] }], ROCKS);
    const gRockSnow = this._makeGroup([{ geo: geoRock, mat: rockSnowMat, off: [0, 0.6, 0] }], 120);
    const gBush = this._makeGroup([{ geo: geoBush, mat: bushMat, off: [0, 0.7, 0] }], BUSHES);

    const nearPOI = (x, z, pad = 0) => POIS.some(p => Math.hypot(x - p.x, z - p.z) < p.r + pad);

    const place = (group, x, y, z, scale, rotY, hp, wood, radius, height, tag) => {
      const idx = group.used++;
      if (idx >= group.count) return null;
      for (const part of group.parts) {
        dummy.position.set(x + part.off[0] * scale, y + part.off[1] * scale, z + part.off[2] * scale);
        dummy.rotation.set(0, rotY, 0);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        part.im.setMatrixAt(idx, dummy.matrix);
      }
      const gi = this.groups.indexOf(group);
      const col = this.physics.addCyl(x, z, radius * scale, y, y + height * scale, { tag });
      const inst = { kind: 'nature', gi, idx, hp, maxHp: hp, wood, alive: true, collider: col, x, z, y };
      col.owner = inst;
      this.instances.push(inst);
      return inst;
    };

    let guard = 0;
    const tryScatter = (count, fn) => {
      let placed = 0;
      while (placed < count && guard < count * 60) {
        guard++;
        const x = (rng() * 2 - 1) * (WORLD.half - 40);
        const z = (rng() * 2 - 1) * (WORLD.half - 40);
        const y = heightAt(x, z);
        if (y < 4.5) continue;
        if (nearPOI(x, z, -10)) continue;
        if (fn(x, y, z)) placed++;
      }
      guard = 0;
    };

    tryScatter(FOREST_TREES, (x, y, z) => {
      const w = biomeWeights(x, z);
      if (rng() > w.forest * 0.95) return false;
      const s = 0.8 + rng() * 0.75;
      return !!place(gForest, x, y, z, s, rng() * TAU, 190, 34, 0.55, 8.4, 'wood');
    });
    tryScatter(SNOW_TREES, (x, y, z) => {
      const w = biomeWeights(x, z);
      if (rng() > w.snow * 0.75) return false;
      const s = 0.75 + rng() * 0.65;
      return !!place(gSnow, x, y, z, s, rng() * TAU, 190, 34, 0.55, 8.2, 'wood');
    });
    tryScatter(CACTI, (x, y, z) => {
      const w = biomeWeights(x, z);
      if (rng() > w.desert * 0.55) return false;
      const s = 0.85 + rng() * 0.6;
      return !!place(gCactus, x, y, z, s, rng() * TAU, 120, 22, 0.55, 4.0, 'wood');
    });
    tryScatter(ROCKS, (x, y, z) => {
      const w = biomeWeights(x, z);
      if (rng() > (w.forest + w.desert) * 0.8) return false;
      const s = 0.7 + rng() * 1.5;
      return !!place(gRock, x, y - 0.3, z, s, rng() * TAU, 260, 0, 1.25, 1.6, 'stone');
    });
    tryScatter(120, (x, y, z) => {
      const w = biomeWeights(x, z);
      if (rng() > w.snow * 0.8) return false;
      const s = 0.8 + rng() * 1.3;
      return !!place(gRockSnow, x, y - 0.3, z, s, rng() * TAU, 260, 0, 1.25, 1.6, 'stone');
    });
    tryScatter(BUSHES, (x, y, z) => {
      const w = biomeWeights(x, z);
      if (rng() > (w.forest * 0.9 + w.snow * 0.2)) return false;
      const s = 0.7 + rng() * 0.8;
      return !!place(gBush, x, y, z, s, rng() * TAU, 60, 14, 0.7, 1.3, 'wood');
    });

    for (const g of this.groups) {
      for (const p of g.parts) {
        p.im.count = g.used;
        p.im.instanceMatrix.needsUpdate = true;
        p.im.computeBoundingSphere();
      }
    }
  }

  /** Returns { wood, destroyed } */
  damage(inst, amount) {
    if (!inst.alive) return { wood: 0, destroyed: false };
    const before = inst.hp;
    inst.hp -= amount;
    const woodTotal = inst.wood;
    // wood is paid out proportionally to damage dealt
    const frac = (before - Math.max(0, inst.hp)) / inst.maxHp;
    let wood = Math.round(woodTotal * frac);
    if (inst.hp <= 0) {
      inst.alive = false;
      this._hide(inst);
      this.physics.remove(inst.collider);
      return { wood, destroyed: true };
    }
    return { wood, destroyed: false };
  }

  _hide(inst) {
    const g = this.groups[inst.gi];
    const m = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
    m.setPosition(inst.x, -500, inst.z);
    for (const part of g.parts) {
      part.im.setMatrixAt(inst.idx, m);
      part.im.instanceMatrix.needsUpdate = true;
    }
  }
}
