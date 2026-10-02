/* =============================================================================
   Maps.

     Plains      - a grass plate with a raised platform in the middle and a grey
                   wall down each side
     Pit Valley  - a path that forks round a stone pit: one branch curves away
                   across the grass, the other crosses the pit on a bridge. At
                   the bottom of the pit there is a pond, and in one corner
                   something that should not be there
     Red Plains  - Plains, on the other side of the red RCV2. Not on the menu.

   Everything a map is made of is built from the same handful of parts below,
   so a new map is a layout, not a new engine.
   ========================================================================== */
import {
  Group, Mesh, BoxGeometry, PlaneGeometry, CircleGeometry,
  DodecahedronGeometry, MeshLambertMaterial, MeshBasicMaterial, DirectionalLight,
  HemisphereLight, AmbientLight, PointLight, Fog, Color, BackSide, Vector3, SphereGeometry,
  DoubleSide, Float32BufferAttribute, BufferGeometry,
} from 'three';
import { RigidBody } from '../physics/rigid.js';
import {
  makeGrassTexture, makeSkyTexture, makeStoneTexture, makePathTexture,
  makeWaterTexture, makeWoodTexture, makeRockTexture, SKIES,
} from './textures.js';
import { createRCV2Model } from './rcv2.js';
import { valueNoise2D, fbm, clamp01, lerp } from '../core/util.js';
import { buildLegacy } from './legacy.js';

const UP = new Vector3(0, 1, 0);

export const MAPS = [
  {
    id: 'baseplate',
    name: 'Plains',
    subtitle: 'Grass, a platform and four walls &middot; 80 x 80 m',
    description:
      'Green flats walled in on every side, with a low grey platform in the ' +
      'middle to fight on, fall off and throw people from.',
    build: buildPlains,
  },
  {
    id: 'pitvalley',
    name: 'Pit Valley',
    subtitle: 'A forked path, a bridge and a stone pit &middot; 80 x 80 m',
    description:
      'The path splits round a pit dug out of the valley floor: one way curves ' +
      'off across the grass, the other crosses on a bridge. There is a pond at ' +
      'the bottom. Look around down there.',
    build: buildPitValley,
  },
  {
    id: 'legacy',
    name: 'Legacy',
    subtitle: 'A walled island: tower, lake, hotel, crane &middot; 110 x 90 m',
    description:
      'An island inside a wall. A grey tower with a long ramp to its roof, a ' +
      'lake and a beach, a river under a stone bridge, a three storey hotel ' +
      'with a garage, a crane over the water with crates and containers ' +
      'stacked under it, and a military tent over the parking. Paths and ' +
      'trees everywhere in between.',
    build: buildLegacy,
  },
];

/** Is (x, z) over a pool of water? Pools are circles or rectangles. */
export function inPool(pool, x, z) {
  if (pool.r != null) {
    const dx = x - pool.x, dz = z - pool.z;
    return dx * dx + dz * dz < pool.r * pool.r;
  }
  return x > pool.minX && x < pool.maxX && z > pool.minZ && z < pool.maxZ;
}

/** Maps you can only reach from inside another map. */
export const SECRET_MAPS = [
  {
    id: 'redplains',
    name: 'Red Plains',
    subtitle: '',
    description: '',
    build: buildRedPlains,
  },
];

export function getMap(id) {
  return MAPS.find((m) => m.id === id) || SECRET_MAPS.find((m) => m.id === id) || MAPS[0];
}

/* -------------------------------------------------------------------------- */
/*                                 the parts                                  */
/* -------------------------------------------------------------------------- */

/** Sun, sky light and fill. Returns the sun so the game can keep its shadow
    camera over the player. */
export function addLights(scene, quality, {
  sky = 0xbcd8f2, ground = 0x4a5a34, hemi = 0.85,
  sunColor = 0xfff3dc, sunIntensity = 1.55, sunPos = [38, 56, 22],
  ambient = 0.24, ambientColor = 0xffffff,
} = {}) {
  const h = new HemisphereLight(sky, ground, hemi);
  scene.add(h);
  const sun = new DirectionalLight(sunColor, sunIntensity);
  sun.position.set(sunPos[0], sunPos[1], sunPos[2]);
  sun.target.position.set(0, 0, 0);
  scene.add(sun);
  scene.add(sun.target);
  if (quality.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
    const d = 22;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 140;
    sun.shadow.bias = -0.0016;
    sun.shadow.normalBias = 0.028;
  }
  const amb = new AmbientLight(ambientColor, ambient);
  scene.add(amb);
  return {
    sun,
    remove() { scene.remove(h); scene.remove(sun); scene.remove(sun.target); scene.remove(amb); },
  };
}

export function addSky(group, disposables, stops) {
  const tex = makeSkyTexture(32, 256, stops);
  const mat = new MeshBasicMaterial({ map: tex, side: BackSide, fog: false, depthWrite: false });
  const sky = new Mesh(new SphereGeometry(420, 24, 16), mat);
  sky.frustumCulled = false;
  group.add(sky);
  disposables.push(sky.geometry, mat, tex);
}

/**
 * A rectangle of grass. Texture coordinates come from world position, so
 * several patches laid edge to edge - round a pit, say - tile as one field,
 * and the broad colour variation in the vertex colours carries straight
 * across the joins too.
 */
export function grassPatch(material, minX, maxX, minZ, maxZ, noise, { tile = 5, density = 0.7 } = {}) {
  const w = maxX - minX, d = maxZ - minZ;
  const geo = new PlaneGeometry(w, d, Math.max(1, Math.round(w * density)),
    Math.max(1, Math.round(d * density)));
  geo.rotateX(-Math.PI / 2);
  geo.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    uv.setXY(i, x / tile, -z / tile);
    const patch = fbm(noise, x * 0.055, z * 0.055, 4, 0.55, 2.1);
    const dry = clamp01(fbm(noise, x * 0.021 + 30, z * 0.021 - 12, 3, 0.5, 2) * 1.5 - 0.55);
    const k = 0.80 + patch * 0.40;
    colors[i * 3] = clamp01(k + dry * 0.30);
    colors[i * 3 + 1] = clamp01(k * (1 - dry * 0.10));
    colors[i * 3 + 2] = clamp01(k * (1 - dry * 0.22) * lerp(1.0, 0.92, patch));
  }
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return new Mesh(geo, material);
}

/**
 * A rectangle of the floor sheet, drawn flat at height `y`.
 *
 * Blood that lands on the floor is painted into one sheet covering the whole
 * map from above, so a splat has an (x, z) and nothing else. Each patch draws
 * only its own part of that sheet, at its own height: the grass, the floor of
 * a pit four metres down, the top of a platform. Nothing at ground level is
 * ever directly above a pit floor except a bridge, and a bridge has no patch,
 * so every splat shows up in exactly one place - where it landed.
 */
export function decalPatch(material, half, minX, maxX, minZ, maxZ, y) {
  const w = maxX - minX, d = maxZ - minZ;
  const geo = new PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  geo.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    uv.setXY(i, (x + half) / (2 * half), 1 - (z + half) / (2 * half));
  }
  const mesh = new Mesh(geo, material);
  mesh.position.y = y + 0.012;
  mesh.renderOrder = 2;
  return mesh;
}

/** A box whose texture repeats every `tile` metres instead of stretching
    one copy over each face, which is what turns a twenty metre wall from a
    smear into masonry. */
export function tiledBox(w, h, d, tile = 2) {
  const g = new BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
    }
  }
  return g;
}

/**
 * Solid, static map parts: a mesh you see and a body the physics knows
 * about, built together so they can never disagree about where a wall is.
 */
export function makeSolids(group, world, quality, disposables) {
  const solids = [];
  const add = (w, h, d, x, y, z, mat, {
    floorDecal = false, visible = true, shadow = true, geo = null, ry = 0, tile = 0,
  } = {}) => {
    let mesh = null;
    if (visible) {
      mesh = new Mesh(geo || (tile ? tiledBox(w, h, d, tile) : new BoxGeometry(w, h, d)), mat);
      mesh.position.set(x, y, z);
      mesh.rotation.y = ry;
      mesh.castShadow = quality.shadows && shadow;
      mesh.receiveShadow = quality.shadows;
      group.add(mesh);
      disposables.push(mesh.geometry);
    }
    const body = new RigidBody({
      shape: 'box',
      half: new Vector3(w / 2, h / 2, d / 2),
      pos: new Vector3(x, y, z),
      isStatic: true,
      friction: 0.9,
      restitution: 0.02,
    });
    if (ry) body.quat.setFromAxisAngle(UP, ry);
    body.updateDerived();
    if (floorDecal) body.userData.floorDecal = true;
    // there is nothing to see here, so nothing to shoot either
    if (!visible) body.userData.invisible = true;
    world.addBody(body);
    solids.push(body);
    return { mesh, body };
  };
  return { solids, add };
}

/** A flat strip laid along a line of points, for paths. */
export function pathRibbon(points, width, material, y = 0.006, tile = 2.6) {
  const pos = [], uv = [], idx = [];
  let along = 0;
  for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i];
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    // across the path is the direction turned a quarter
    const nx = -dz, nz = dx;
    if (i > 0) along += Math.hypot(x - points[i - 1][0], z - points[i - 1][1]);
    pos.push(x + nx * width / 2, y, z + nz * width / 2, x - nx * width / 2, y, z - nz * width / 2);
    uv.push(0, along / tile, width / tile, along / tile);
    if (i > 0) {
      // wound so the face points up, whichever way the path runs
      const k = i * 2;
      idx.push(k - 2, k, k - 1, k - 1, k, k + 1);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new Mesh(geo, material);
  mesh.renderOrder = 1;
  return mesh;
}

/** A round patch of the same path surface, where paths meet. */
export function pathDisc(x, z, r, material, y = 0.008, tile = 2.6) {
  const geo = new CircleGeometry(r, 28);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + x) / tile, (pos.getZ(i) + z) / tile);
  const mesh = new Mesh(geo, material);
  mesh.position.set(x, y, z);
  mesh.renderOrder = 1;
  return mesh;
}

/** The four perimeter walls every map so far has had. */
export function perimeterWalls(add, half, mat, { height = 4.5, thick = 1.0 } = {}) {
  const wy = height / 2;
  const span = half * 2;
  add(span, height, thick, 0, wy, -half + thick / 2, mat);
  add(span, height, thick, 0, wy, half - thick / 2, mat);
  add(thick, height, span, -half + thick / 2, wy, 0, mat);
  add(thick, height, span, half - thick / 2, wy, 0, mat);
}

/** The thing every map returns, filled in from what it built. */
export function mapRecord(o) {
  const { scene, world, group, solids, lights, disposables, decalMat } = o;
  return {
    id: o.id,
    name: o.name,
    group,
    half: o.half,
    openArea: o.openArea,
    solids,
    sun: lights.sun,
    spawnPoint: o.spawnPoint,
    spawnYaw: o.spawnYaw || 0,
    platform: o.platform || null,
    interactables: o.interactables || [],
    water: o.water || [],
    altar: o.altar || null,
    altarParts: o.altarParts || [],
    altarMaterial: o.altarMaterial || null,
    encounter: o.encounter || null,
    /** How many citizens to start with; undefined means the usual few. */
    citizens: o.citizens,
    /** Loose things the game drops in once the map is up: { kind, pos }. */
    props: o.props || [],
    landmarks: o.landmarks || null,
    tick: o.tick || null,
    attachDecalTexture(tex) { decalMat.map = tex; decalMat.needsUpdate = true; },
    dispose() {
      for (const b of solids) world.removeBody(b);
      solids.length = 0;
      world.groundHoles.length = 0;
      scene.remove(group);
      lights.remove();
      scene.fog = null;
      for (const d of disposables) d.dispose?.();
    },
  };
}

export function decalMaterial() {
  return new MeshBasicMaterial({
    transparent: true, depthWrite: false, side: DoubleSide, opacity: 0.94,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}

/* -------------------------------------------------------------------------- */
/*                                   Plains                                   */
/* -------------------------------------------------------------------------- */

/**
 * Plains, and with a different palette, Red Plains. The two are the same
 * place; what changes is the light, the colour of everything, and what is
 * standing in the middle of the platform.
 */
function buildPlainsLike(ctx, variant) {
  const { scene, world, quality } = ctx;
  const red = variant === 'red';
  const group = new Group();
  const HALF = 40;
  const disposables = [];

  /* ------------------------------- lighting ------------------------------ */
  scene.background = new Color(red ? 0x6a1010 : 0x9dc0dd);
  scene.fog = red ? new Fog(0x7a1a12, 40, 165) : new Fog(0xa8c6dc, 55, 190);
  const lights = addLights(scene, quality, red ? {
    sky: 0xff7a5a, ground: 0x3a0606, hemi: 0.8,
    sunColor: 0xff9a6a, sunIntensity: 1.35, sunPos: [-30, 44, -26],
    ambient: 0.3, ambientColor: 0xff8a7a,
  } : {});
  addSky(group, disposables, red ? SKIES.blood : SKIES.day);

  /* ------------------------------ the plate ------------------------------ */
  const grass = makeGrassTexture(quality.grassSize, 7, red ? 'red' : 'green');
  const plateMat = new MeshLambertMaterial({ map: grass.texture, vertexColors: true });
  disposables.push(plateMat, grass.texture);
  const top = grassPatch(plateMat, -HALF, HALF, -HALF, HALF, valueNoise2D(21));
  top.receiveShadow = quality.shadows;
  group.add(top);
  disposables.push(top.geometry);

  // the slab under it, so the plate has thickness from the side
  const slabMat = new MeshLambertMaterial({ color: red ? 0x5a1410 : 0x4d7a35 });
  const plate = new Mesh(new BoxGeometry(HALF * 2, 2, HALF * 2), slabMat);
  plate.position.set(0, -1.005, 0);
  plate.receiveShadow = quality.shadows;
  group.add(plate);
  disposables.push(plate.geometry, slabMat);

  // Painted-on side walls so the edge of the world reads as a slab, not a void.
  const sideMat = new MeshLambertMaterial({ color: red ? 0x3a1410 : 0x53412c });
  const side = new Mesh(new BoxGeometry(HALF * 2 + 0.02, 1.9, HALF * 2 + 0.02), sideMat);
  side.position.set(0, -1.02, 0);
  group.add(side);
  disposables.push(side.geometry, sideMat);

  /* --------------------- the platform and the walls ----------------------- */
  /* Solid, static and known to the physics world, so people stand on the
     platform, walk into the walls, and the citizens' pathfinder routes round
     both of them. Grey concrete, because the point of them is that they are
     not grass. */
  const greyMat = new MeshLambertMaterial({ color: red ? 0x6e6462 : 0x9a9a97 });
  const greyDark = new MeshLambertMaterial({ color: red ? 0x544846 : 0x7c7c79 });
  disposables.push(greyMat, greyDark);
  const { solids, add } = makeSolids(group, world, quality, disposables);

  // The platform: sixteen metres square, a step and a half up, sitting on the
  // ground rather than floating over it.
  const PLAT = { size: 16, height: 0.9 };
  add(PLAT.size, PLAT.height, PLAT.size, 0, PLAT.height / 2, 0, greyMat, { floorDecal: true });
  /* A darker step all the way round the base. The platform is taller than
     anyone can walk up, and it used to be "climbed" by walking straight into
     its side and standing inside it; now it is two honest steps, each one
     inside the height a person steps up without jumping. */
  const STEP = { out: 0.7, height: 0.45 };
  add(PLAT.size + STEP.out * 2, STEP.height, PLAT.size + STEP.out * 2,
    0, STEP.height / 2, 0, greyDark, { floorDecal: true });

  perimeterWalls(add, HALF, greyMat);

  /* ------------------------------ blood decals ---------------------------- */
  const decalMat = decalMaterial();
  disposables.push(decalMat);
  const S = PLAT.size / 2, O = S + STEP.out;
  for (const m of [
    decalPatch(decalMat, HALF, -HALF, HALF, -HALF, HALF, 0),
    decalPatch(decalMat, HALF, -O, O, -O, O, STEP.height),
    decalPatch(decalMat, HALF, -S, S, -S, S, PLAT.height),
  ]) { group.add(m); disposables.push(m.geometry); }

  /* --------------------------- the red altar ------------------------------ */
  /* On the other side, there is a stone pillar in the middle of the
     platform - about half as tall as a person - and something burning above
     it. The fire itself belongs to the encounter; the map only builds what
     it stands on. */
  let altar = null, altarMaterial = null;
  const altarParts = [];
  if (red) {
    const stone = makeStoneTexture(128, 61, { tone: [118, 92, 86], courses: 3 });
    const stoneMat = new MeshLambertMaterial({ map: stone.texture });
    const capMat = new MeshLambertMaterial({ color: 0x3a2624 });
    disposables.push(stone.texture, stoneMat, capMat);
    const PIL = { w: 0.62, h: 0.92 };
    altarParts.push(
      add(PIL.w, PIL.h, PIL.w, 0, PLAT.height + PIL.h / 2, 0, stoneMat, { tile: 0.62 }),
      // a wider foot and a cap, so it reads as carved rather than a crate
      add(PIL.w + 0.22, 0.12, PIL.w + 0.22, 0, PLAT.height + 0.06, 0, capMat),
      add(PIL.w + 0.14, 0.08, PIL.w + 0.14, 0, PLAT.height + PIL.h + 0.04, 0, capMat),
    );
    altar = new Vector3(0, PLAT.height + PIL.h + 0.08, 0);
    altarMaterial = stoneMat;
  }

  scene.add(group);

  world.hasGround = true;
  world.groundY = 0;
  world.groundMin.set(-HALF, -2, -HALF);
  world.groundMax.set(HALF, 0, HALF);
  world.groundHoles.length = 0;
  world.killY = -35;

  return mapRecord({
    scene, world, group, solids, lights, disposables, decalMat,
    id: red ? 'redplains' : 'baseplate',
    name: red ? 'Red Plains' : 'Plains',
    half: HALF,
    platform: { size: PLAT.size, height: PLAT.height },
    /* A patch of flat, empty grass clear of the platform and the walls. The
       test suite works here so that adding scenery to the middle of a map
       never quietly invalidates it. */
    openArea: new Vector3(24, 0, 0),
    spawnPoint: new Vector3(0, 0, 12),
    spawnYaw: 0,
    altar,
    altarParts,
    altarMaterial,
    encounter: red ? 'silva' : null,
    // nobody lives here; whatever is on the pillar saw to that
    citizens: red ? 0 : undefined,
  });
}

function buildPlains(ctx) { return buildPlainsLike(ctx, 'green'); }
function buildRedPlains(ctx) { return buildPlainsLike(ctx, 'red'); }

/* -------------------------------------------------------------------------- */
/*                                 Pit Valley                                 */
/* -------------------------------------------------------------------------- */

/*
   Seen from above, north up, you arrive at the bottom:

          (plaza)
             |
         merge (0,-15)
        /    |
       (     |  <- the bridge, over the pit
  arc  (   [pit]
       (     |
        \    |
         fork (0, 15)
             |
           spawn

   The arc is half a circle round the centre of the pit, so the bridge and the
   arc together are the shape of a D. Stairs go down into the pit in its
   south west corner. The pond is in the middle, under the bridge.
*/
const PIT = { minX: -9, maxX: 9, minZ: -8, maxZ: 8, depth: 4 };

function buildPitValley(ctx) {
  const { scene, world, quality } = ctx;
  const group = new Group();
  const HALF = 40;
  const disposables = [];
  const FLOOR = -PIT.depth;

  /* ------------------------------- lighting ------------------------------ */
  // The same valley an hour before dark: a low sun from the west, warm light.
  scene.background = new Color(0xc9b8a0);
  scene.fog = new Fog(0xd8c5a6, 50, 185);
  const lights = addLights(scene, quality, {
    sky: 0xd2dcea, ground: 0x4e5634, hemi: 0.82,
    sunColor: 0xffd7a6, sunIntensity: 1.45, sunPos: [-44, 30, 22],
    ambient: 0.22,
  });
  addSky(group, disposables, SKIES.evening);

  /* ------------------------------ the ground ------------------------------ */
  /* Four patches of grass round the pit, which is a hole in the ground the
     physics knows about: nothing stands on grass where there is no grass. */
  const grass = makeGrassTexture(quality.grassSize, 9, 'green');
  const grassMat = new MeshLambertMaterial({ map: grass.texture, vertexColors: true });
  disposables.push(grassMat, grass.texture);
  const noise = valueNoise2D(37);
  for (const [x0, x1, z0, z1] of [
    [-HALF, HALF, -HALF, PIT.minZ], [-HALF, HALF, PIT.maxZ, HALF],
    [-HALF, PIT.minX, PIT.minZ, PIT.maxZ], [PIT.maxX, HALF, PIT.minZ, PIT.maxZ],
  ]) {
    const m = grassPatch(grassMat, x0, x1, z0, z1, noise);
    m.receiveShadow = quality.shadows;
    group.add(m);
    disposables.push(m.geometry);
  }
  world.hasGround = true;
  world.groundY = 0;
  world.groundMin.set(-HALF, -2, -HALF);
  world.groundMax.set(HALF, 0, HALF);
  world.groundHoles.length = 0;
  world.groundHoles.push({ minX: PIT.minX, maxX: PIT.maxX, minZ: PIT.minZ, maxZ: PIT.maxZ });
  world.killY = -35;

  /* ------------------------------ materials ------------------------------- */
  const stone = makeStoneTexture(256, 23, { tone: [118, 112, 102], courses: 4 });
  const stoneMat = new MeshLambertMaterial({ map: stone.texture });
  const floorStone = makeStoneTexture(256, 29, { tone: [92, 90, 80], courses: 2 });
  const floorMat = new MeshLambertMaterial({ map: floorStone.texture });
  const stepMat = new MeshLambertMaterial({ map: stone.texture, color: 0xd8d2c6 });
  const wood = makeWoodTexture(256, 5);
  const deckMat = new MeshLambertMaterial({ map: wood.texture });
  const railMat = new MeshLambertMaterial({ color: 0x5a3e24 });
  const greyMat = new MeshLambertMaterial({ color: 0x9a9a97 });
  disposables.push(stone.texture, stoneMat, floorStone.texture, floorMat, stepMat,
    wood.texture, deckMat, railMat, greyMat);
  const { solids, add } = makeSolids(group, world, quality, disposables);

  /* -------------------------------- the pit ------------------------------- */
  /* Walls round the hole and a floor under it, all solid. The tops of the
     walls sit two centimetres under the grass: the grass covers them, so
     the two never fight over the same pixels, and the ground plane is what
     people stand on up there anyway. */
  const T = 1.4;
  const wallH = PIT.depth - 0.02, wallY = FLOOR + wallH / 2;
  const W = PIT.maxX - PIT.minX, D = PIT.maxZ - PIT.minZ;
  add(W + T * 2, wallH, T, 0, wallY, PIT.minZ - T / 2, stoneMat, { tile: 2 });
  add(W + T * 2, wallH, T, 0, wallY, PIT.maxZ + T / 2, stoneMat, { tile: 2 });
  add(T, wallH, D, PIT.minX - T / 2, wallY, 0, stoneMat, { tile: 2 });
  add(T, wallH, D, PIT.maxX + T / 2, wallY, 0, stoneMat, { tile: 2 });
  add(W + T * 2, 0.8, D + T * 2, 0, FLOOR - 0.4, 0, floorMat, { tile: 3, floorDecal: true });

  /* Stairs down the west wall from the south west corner: nine steps, each
     shallower than a person steps up without thinking, so the way down is
     also the way back out. */
  const STAIR = { x0: PIT.minX, x1: PIT.minX + 1.6, run: 0.65, rise: 0.4, steps: 9 };
  const stairTops = [];
  for (let i = 1; i <= STAIR.steps; i++) {
    const top = -STAIR.rise * i;
    const z1 = PIT.maxZ - STAIR.run * (i - 1), z0 = PIT.maxZ - STAIR.run * i;
    const h = top - FLOOR;
    add(STAIR.x1 - STAIR.x0, h, z1 - z0, (STAIR.x0 + STAIR.x1) / 2, FLOOR + h / 2, (z0 + z1) / 2,
      stepMat, { tile: 1.2, floorDecal: true });
    stairTops.push([STAIR.x0, STAIR.x1, z0, z1, top]);
  }

  /* ------------------------------- the pond ------------------------------- */
  /* A ring of stone kerb on the floor with water inside it, shin deep. The
     kerb is low enough to step over; the water slows whoever wades in. */
  const POND = { x: 0, z: 0, r: 3.35, kerb: 0.5, kerbH: 0.32 };
  const waterY = FLOOR + POND.kerbH - 0.06;
  const segs = 18;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const rr = POND.r + POND.kerb / 2;
    const chord = 2 * rr * Math.sin(Math.PI / segs) + 0.06;
    add(chord, POND.kerbH, POND.kerb, POND.x + Math.cos(a) * rr, FLOOR + POND.kerbH / 2,
      POND.z + Math.sin(a) * rr, stepMat, { ry: -a + Math.PI / 2, tile: 1 });
  }
  const bedMat = new MeshLambertMaterial({ color: 0x23302a });
  const bed = new Mesh(new CircleGeometry(POND.r + 0.05, 36), bedMat);
  bed.rotation.x = -Math.PI / 2;
  bed.position.set(POND.x, FLOOR + 0.004, POND.z);
  group.add(bed);
  const water = makeWaterTexture(256, 41);
  water.texture.repeat.set(2.2, 2.2);
  const waterMat = new MeshLambertMaterial({
    map: water.texture, color: 0x8fb7c0, transparent: true, opacity: 0.78,
    emissive: 0x0a2228, depthWrite: false,
  });
  const surface = new Mesh(new CircleGeometry(POND.r, 40), waterMat);
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(POND.x, waterY, POND.z);
  surface.renderOrder = 3;
  group.add(surface);
  disposables.push(bed.geometry, bedMat, water.texture, waterMat, surface.geometry);

  /* ------------------------------- the bridge ----------------------------- */
  /* Planked deck on stone piers, with a rail down each side. The deck has no
     floor patch: the floor of the pit is directly under it, and blood that
     lands on the bridge must not turn up four metres below. */
  const BR = { half: 1.7, z: PIT.maxZ + 0.7, top: 0.10, thick: 0.32 };
  add(BR.half * 2, BR.thick, BR.z * 2, 0, BR.top - BR.thick / 2, 0, deckMat, { tile: 1.6 });
  const railH = 1.02, railX = BR.half - 0.08;
  for (const sx of [-1, 1]) {
    // The rail is solid for its whole height: nobody squeezes between posts.
    add(0.12, railH, BR.z * 2, sx * railX, BR.top + railH / 2, 0, railMat, { visible: false });
    const rail = new Mesh(new BoxGeometry(0.14, 0.09, BR.z * 2), railMat);
    rail.position.set(sx * railX, BR.top + railH - 0.045, 0);
    const mid = new Mesh(new BoxGeometry(0.08, 0.06, BR.z * 2), railMat);
    mid.position.set(sx * railX, BR.top + railH * 0.5, 0);
    group.add(rail, mid);
    disposables.push(rail.geometry, mid.geometry);
    for (let z = -BR.z + 0.2; z <= BR.z; z += 1.9) {
      const post = new Mesh(new BoxGeometry(0.13, railH, 0.13), railMat);
      post.position.set(sx * railX, BR.top + railH / 2, z);
      post.castShadow = quality.shadows;
      group.add(post);
      disposables.push(post.geometry);
    }
  }
  // piers, standing on the floor of the pit
  const pierTop = BR.top - BR.thick;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const h = pierTop - FLOOR;
      add(0.72, h, 0.72, sx * 1.15, FLOOR + h / 2, sz * 4.3, stoneMat, { tile: 1.2 });
    }
    // a beam under each edge of the deck, end to end
    const beam = new Mesh(new BoxGeometry(0.34, 0.36, BR.z * 2), railMat);
    beam.position.set(sx * 1.15, pierTop - 0.18, 0);
    group.add(beam);
    disposables.push(beam.geometry);
  }

  /* ------------------------------- the paths ------------------------------ */
  const path = makePathTexture(256, 31);
  const pathMat = new MeshLambertMaterial({
    map: path.texture, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  disposables.push(path.texture, pathMat);
  const PW = 2.8, R = 15;
  const straight = (z0, z1) => {
    const pts = [];
    const n = Math.max(2, Math.ceil(Math.abs(z1 - z0) / 1.5));
    for (let i = 0; i <= n; i++) pts.push([0, z0 + (z1 - z0) * (i / n)]);
    return pts;
  };
  // fork at (0, R), half a circle round the west side, merge at (0, -R)
  const arc = [];
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * Math.PI;
    arc.push([-R * Math.sin(t), R * Math.cos(t)]);
  }
  for (const m of [
    pathRibbon(straight(34, BR.z), PW, pathMat, 0.006),
    pathRibbon(straight(-BR.z, -30.5), PW, pathMat, 0.006),
    pathRibbon(arc, PW, pathMat, 0.007),
    pathDisc(0, R, 2.1, pathMat), pathDisc(0, -R, 2.1, pathMat),
  ]) { group.add(m); disposables.push(m.geometry); }
  // the end of the path: a stone slab to stand on and look back from
  add(7.6, 0.22, 7.6, 0, 0.11, -33, stepMat, { floorDecal: true, tile: 1.9 });

  /* -------------------------------- scenery ------------------------------- */
  // rocks fallen into the pit and left where they landed
  const rock = makeRockTexture(128, 13);
  const rockMat = new MeshLambertMaterial({ map: rock.texture, color: 0xb8b0a4 });
  disposables.push(rock.texture, rockMat);
  const rockGeo = new DodecahedronGeometry(1, 0);
  disposables.push(rockGeo);
  for (const [x, z, s, h] of [
    [-7.6, -6.6, 0.55, 0.42], [-5.2, -7.2, 0.4, 0.34], [7.4, 6.4, 0.6, 0.45],
    [5.6, 7.1, 0.36, 0.3], [8.2, -1.8, 0.42, 0.32], [-3.4, 6.9, 0.3, 0.26],
  ]) {
    const m = new Mesh(rockGeo, rockMat);
    m.scale.set(s, h, s * 0.9);
    m.position.set(x, FLOOR + h * 0.62, z);
    m.rotation.set(x * 1.3, z * 0.7, x * z * 0.1);
    m.castShadow = quality.shadows;
    group.add(m);
  }
  perimeterWalls(add, HALF, greyMat);

  /* --------------------------- the floor sheet ---------------------------- */
  const decalMat = decalMaterial();
  disposables.push(decalMat);
  const decals = [
    [-HALF, HALF, -HALF, PIT.minZ, 0], [-HALF, HALF, PIT.maxZ, HALF, 0],
    [-HALF, PIT.minX, PIT.minZ, PIT.maxZ, 0], [PIT.maxX, HALF, PIT.minZ, PIT.maxZ, 0],
    [PIT.minX, PIT.maxX, PIT.minZ, PIT.maxZ, FLOOR],
    [-3.8, 3.8, -36.8, -29.2, 0.22],
    ...stairTops,
  ];
  for (const [x0, x1, z0, z1, y] of decals) {
    const m = decalPatch(decalMat, HALF, x0, x1, z0, z1, y);
    group.add(m);
    disposables.push(m.geometry);
  }

  /* ---------------------------- the Easter egg ----------------------------- */
  /* In the north east corner of the pit, behind the pond, where nobody
     coming down the stairs is looking: a red RCV2, lying on the stone. */
  const egg = createRCV2Model({ variant: 'red' });
  egg.scale.setScalar(2.0);
  egg.position.set(PIT.maxX - 0.95, FLOOR + 0.1, PIT.minZ + 0.9);
  egg.rotation.set(0, 2.3, Math.PI / 2 - 0.05);
  group.add(egg);
  disposables.push(...egg.userData.materials);
  egg.traverse((o) => { if (o.geometry) disposables.push(o.geometry); });
  const eggGlow = egg.userData.glowMat;
  /* It lights the corner it is lying in, faintly and not steadily. That is
     the whole clue: from the bottom of the stairs, one corner of the pit is
     the wrong colour. */
  const eggLight = new PointLight(0xff2a14, 2.2, 4.2, 1.6);
  eggLight.position.set(egg.position.x - 0.4, FLOOR + 0.7, egg.position.z + 0.4);
  group.add(eggLight);

  scene.add(group);

  let clock = 0;
  return mapRecord({
    scene, world, group, solids, lights, disposables, decalMat,
    id: 'pitvalley',
    name: 'Pit Valley',
    half: HALF,
    openArea: new Vector3(24, 0, 20),
    spawnPoint: new Vector3(0, 0, 31),
    spawnYaw: 0,
    water: [{ x: POND.x, z: POND.z, r: POND.r, y: waterY, floor: FLOOR }],
    interactables: [{
      id: 'redRCV2',
      label: 'TOUCH',
      position: egg.position,
      radius: 1.9,
      prompt: 'Something hums inside it',
      use: (game) => game.travel('redplains', 'The red RCV2 pulls you through'),
    }],
    tick(dt) {
      clock += dt;
      // the water moves, and the thing in the corner breathes
      water.texture.offset.set(Math.sin(clock * 0.21) * 0.08 + clock * 0.012, clock * 0.017);
      const pulse = Math.sin(clock * 2.6);
      eggGlow.opacity = 0.55 + pulse * 0.35;
      eggLight.intensity = 1.9 + pulse * 0.8 + Math.sin(clock * 11.3) * 0.15;
    },
  });
}
