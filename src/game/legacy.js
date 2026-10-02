/* =============================================================================
   Legacy.

   An island inside a wall, laid out from a photograph taken straight down.
   North is up (-Z); you arrive at the bottom middle.

        +--------------------------------------------------+
        |#=====================( ledge )==#   [ tent  ]     |  <- walkway on the wall
        |#sand |~~~~~~~ lake ~~~~~~~~~|                    |
        | sand |~~~~~~~~~~~~~~~~~~~~~~~~~~~~ river ~~~~~~~~=  <- stone bridge
        | sand ~~~~~~~~~  crane  ~~~~~~|     on the path   |
        | beach  [hotel][garage] crates                    |
        |                                                  |
        |           [tower]=========ramp====               |
        |  .  trees, paths  .                             /
        |                       spawn                   /
        +----------------------------------------------+

   Everything solid here is a box, the same as every other map. The ramp is
   no exception: what you walk up is a staircase of steps two hand-widths
   high, under a smooth slope you see, so it climbs like a ramp with nothing
   new in the physics.
   ========================================================================== */
import {
  Group, Mesh, BoxGeometry, PlaneGeometry, CylinderGeometry, ConeGeometry,
  IcosahedronGeometry, MeshLambertMaterial, MeshBasicMaterial, Fog, Color, Vector3,
  Float32BufferAttribute, BufferGeometry, Shape, ShapeGeometry, InstancedMesh, Matrix4, Matrix3,
  Quaternion, Euler, CanvasTexture, SRGBColorSpace, DoubleSide, RepeatWrapping,
} from 'three';
import {
  addLights, addSky, grassPatch, decalPatch, makeSolids, pathRibbon, pathDisc,
  mapRecord, decalMaterial,
} from './map.js';
import {
  makeGrassTexture, makeStoneTexture, makePathTexture, makeWaterTexture, makeWoodTexture,
  makeCanvas, SKIES,
} from './textures.js';
import { valueNoise2D, makeRng } from '../core/util.js';

/* ---------------------------------- layout --------------------------------- */

/** The ground: 110 m east to west, 90 m north to south. */
const BOUNDS = { minX: -55, maxX: 55, minZ: -45, maxZ: 45 };
/** The south east corner is cut off on a slant, between these two points. */
const CUT = { a: [55, 20], b: [36, 45] };

/* The water. A lake in the north west, and the river it runs out into,
   east along the north side and out under the wall. Both are holes in the
   ground with a stone bed, shin to knee deep. */
const LAKE = { minX: -48, maxX: 16, minZ: -45, maxZ: -30 };
const RIVER = { minX: -44, maxX: 55, minZ: -30, maxZ: -24.5 };
const BED = -3.4, WATER = -0.35;

const TOWER = { minX: -18, maxX: -8, minZ: -4, maxZ: 6, h: 9 };
const RAMP = { x0: -8, x1: 16, z0: -0.5, z1: 2.5, rise: 0.2 };
const HOTEL = { minX: -31, maxX: -21, minZ: -21, maxZ: -13, floor: 3.0, floors: 3, wall: 0.25 };
const GARAGE = { minX: -21, maxX: -15, minZ: -20, maxZ: -13, h: 3.2 };
const BRIDGE = { minX: 38, maxX: 42, top: 0.3 };
const TENT = { x: 43.5, z: -37.5, w: 13, d: 9, ridge: 4.2, eave: 2.5 };
const CRANE = { x: -6, z: -18, mast: 18 };
const SPAWN = new Vector3(0, 0, 38);

/** Paths as polylines, in the order they were drawn on the photo. */
const PATHS = [
  // from where you arrive, up to the foot of the ramp
  [[0, 41], [-1.5, 33], [0, 26], [3, 19], [9, 10], [14, 5], [18, 3]],
  // the east side: round to the stone bridge and the tent beyond it
  [[18, 3], [26, 2.5], [34, -1], [39, -7], [40.5, -14], [40, -21], [40, -31.5], [41, -33.5]],
  // the diagonal from the ramp to the crane yard
  [[18, 3], [12, -3], [5, -8.5], [-1, -12]],
  // round the west: crane yard, hotel, beach, and back down to the start
  [[-1, -12], [-8, -10.5], [-16, -9.5], [-24, -9], [-32, -6], [-40, 0], [-45, 9],
    [-45, 20], [-40, 30], [-29, 37], [-14, 40], [0, 41]],
  // a spur to the south face of the tower
  [[3, 19], [-4, 15], [-10, 11], [-13, 7.5]],
  // from the tent to the foot of the lake walkway
  [[34, -40], [27, -42], [20.5, -42.5]],
];

/* The second bridge: a walkway raised a metre over the water, along the
   north wall from the lake's east end to the north west corner, then south
   along the west wall and down onto the beach. Half way along, a round
   ledge stands out over the lake. */
const WALK = {
  y: 1.0, w: 3,
  north: { x0: -54, x1: 16, z0: -44, z1: -41 },
  west: { x0: -54, x1: -51, z0: -41, z1: -31 },
  ledge: { x: -16, z: -41, r: 7 },
};

/** Where nothing grows: the water, the buildings, the paths and their verges. */
function treeAllowed(x, z) {
  const inside = (r, m = 0) => x > r.minX - m && x < r.maxX + m && z > r.minZ - m && z < r.maxZ + m;
  if (inside(LAKE, 2.5) || inside(RIVER, 2.5)) return false;
  if (x < -24 && z < 2 && x + z < -24) return false;                 // the beach
  if (inside(TOWER, 2.5)) return false;
  if (x > RAMP.x0 && x < RAMP.x1 + 3 && z > RAMP.z0 - 3 && z < RAMP.z1 + 3) return false;
  if (inside({ minX: HOTEL.minX, maxX: GARAGE.maxX, minZ: HOTEL.minZ, maxZ: HOTEL.maxZ }, 4)) return false;
  if (x > -16 && x < 4 && z > -24 && z < -8) return false;             // the crane yard
  if (x > 33 && z < -29) return false;                                 // the tent and parking
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z + 15) < 11) return false;    // where people start
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 6) return false;
  if (x > 15 && x < 35 && z > 13 && z < 35) return false;              // left open on purpose
  if (x < BOUNDS.minX + 2.5 || x > BOUNDS.maxX - 2.5 || z < BOUNDS.minZ + 2.5 || z > BOUNDS.maxZ - 2.5) return false;
  // inside the slanted corner
  const [ax, az] = CUT.a, [bx, bz] = CUT.b;
  if ((bx - ax) * (z - az) - (bz - az) * (x - ax) < 12) return false;
  for (const path of PATHS) {
    for (let i = 1; i < path.length; i++) {
      if (distToSegment(x, z, path[i - 1], path[i]) < 2.6) return false;
    }
  }
  return true;
}

function distToSegment(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}

/** A path polyline, smoothed (Catmull-Rom) and resampled every metre and a half. */
function smooth(points, step = 1.5) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** A triangular prism: the solid body of the ramp, slope on top. */
function wedgeGeometry(x0, x1, y0top, y1top, z0, z1) {
  // x0 is the high end. Corners: bottom at y = 0, top edge along the slope.
  const A = [x0, 0, z0], B = [x1, 0, z0], C = [x1, y1top, z0], D = [x0, y0top, z0];
  const E = [x0, 0, z1], F = [x1, 0, z1], G = [x1, y1top, z1], H = [x0, y0top, z1];
  const tris = [
    D, H, C, H, G, C,          // the slope
    A, D, B, B, D, C,          // side at z0
    E, F, H, H, F, G,          // side at z1
    A, E, D, D, E, H,          // the tall end, against the tower
    A, B, E, E, B, F,          // bottom
    B, C, F, C, G, F,          // the low end (a lip a hand high)
  ];
  const pos = [];
  for (const v of tris) pos.push(v[0], v[1], v[2]);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  // uv from x and height, so the concrete texture runs up the slope
  const uv = [];
  for (const v of tris) uv.push((v[0] + v[2]) / 2.5, v[1] / 2.5);
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Pale yellow sand with a fine grain and a few darker, damp patches. */
function sandTexture() {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  const rng = makeRng(1801);
  ctx.fillStyle = '#e6d39a';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1800; i++) {
    const v = rng();
    ctx.fillStyle = v < 0.5 ? `rgba(255,248,220,${0.25 + rng() * 0.3})` : `rgba(150,120,70,${0.12 + rng() * 0.2})`;
    ctx.fillRect(rng() * 128, rng() * 128, 1 + rng(), 1 + rng());
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** A flat-coloured canvas sign: black letters on a light board. */
function signTexture(text, { w = 256, h = 64, bg = '#e8e2d2', fg = '#2a2420' } = {}) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.font = `bold ${Math.round(h * 0.62)}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h * 0.54);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * Bakes every plain, opaque, static mesh directly under `group` into one
 * mesh per material. Legacy is built from several hundred boxes - the crane
 * alone is a lattice of them - and a phone pays for each one it draws
 * separately, not for how many triangles there are.
 */
function mergeStatic(group, disposables) {
  const buckets = new Map();
  for (const m of [...group.children]) {
    if (!m.isMesh || m.isInstancedMesh || m.renderOrder !== 0) continue;
    const mat = m.material;
    if (Array.isArray(mat) || mat.transparent || mat.vertexColors) continue;
    const g = m.geometry;
    if (!g.attributes.position || !g.attributes.normal || !g.attributes.uv || g.attributes.color) continue;
    const key = mat.uuid + (m.castShadow ? 's' : '') + (m.receiveShadow ? 'r' : '');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(m);
  }
  const nm = new Matrix3();
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const pos = [], nor = [], uv = [];
    for (const m of list) {
      m.updateMatrix();
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
      nm.getNormalMatrix(m.matrix);
      const v = new Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.matrix);
        pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
        nor.push(v.x, v.y, v.z);
        uv.push(u.getX(i), u.getY(i));
      }
      if (g !== m.geometry) g.dispose();
      m.removeFromParent();
    }
    const merged = new BufferGeometry();
    merged.setAttribute('position', new Float32BufferAttribute(pos, 3));
    merged.setAttribute('normal', new Float32BufferAttribute(nor, 3));
    merged.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    merged.computeBoundingSphere();
    const out = new Mesh(merged, list[0].material);
    out.castShadow = list[0].castShadow;
    out.receiveShadow = list[0].receiveShadow;
    group.add(out);
    disposables.push(merged);
  }
}

/* ---------------------------------- build ---------------------------------- */

/** The four sewer outfalls under the walkway, and the one with a bent bar. */
const GRATES = [-44, -30, -4, 10];
const BENT = -30;

/**
 * Legacy, or with `dark` set, Dark Legacy: the same island on the other side
 * of the bent bar - black sky, fog down to the trees, nobody living there,
 * and something under the ground by the tower.
 */
export function buildLegacy(ctx, { dark = false } = {}) {
  const { scene, world, quality } = ctx;
  const group = new Group();
  const HALF = 55;
  const disposables = [];
  const keep = (...xs) => { disposables.push(...xs); return xs[0]; };

  /* ------------------------------- lighting ------------------------------ */
  scene.background = new Color(dark ? 0x23262e : 0x9dc0dd);
  scene.fog = dark ? new Fog(0x2a2d35, 6, 62) : new Fog(0xa8c6dc, 70, 230);
  const lights = addLights(scene, quality, dark ? {
    sky: 0x6a7488, ground: 0x15180f, hemi: 0.95, sunColor: 0xb0bcd8, sunIntensity: 0.85,
    sunPos: [-26, 50, -30], ambient: 0.3, ambientColor: 0xa8b0c8,
  } : { sunPos: [30, 60, 26], sunIntensity: 1.5 });
  addSky(group, disposables, dark ? SKIES.dark : SKIES.day);

  /* ------------------------------ materials ------------------------------- */
  const grass = makeGrassTexture(quality.grassSize, 13, 'green');
  const grassMat = keep(new MeshLambertMaterial({ map: grass.texture, vertexColors: true,
    color: dark ? 0x6c786a : 0xffffff }));
  keep(grass.texture);
  const concrete = makeStoneTexture(256, 47, { tone: [150, 150, 146], courses: 3 });
  const concreteMat = keep(new MeshLambertMaterial({ map: concrete.texture, color: 0xf2f2ee }));
  const concreteDark = keep(new MeshLambertMaterial({ map: concrete.texture, color: 0xb4b4b0 }));
  keep(concrete.texture);
  const stone = makeStoneTexture(256, 53, { tone: [124, 118, 106], courses: 4 });
  const stoneMat = keep(new MeshLambertMaterial({ map: stone.texture }));
  const bedMat = keep(new MeshLambertMaterial({ map: stone.texture, color: 0x5a6a60 }));
  keep(stone.texture);
  const path = makePathTexture(256, 37);
  const pathMat = keep(new MeshLambertMaterial({
    map: path.texture, color: 0xd6a878, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  const sandTex = keep(sandTexture());
  const sandMat = keep(new MeshLambertMaterial({
    map: sandTex, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -0.5,
  }));
  const sandSolid = keep(new MeshLambertMaterial({ map: sandTex, color: 0xeee2c2 }));
  keep(path.texture);
  const wood = makeWoodTexture(256, 9);
  const woodMat = keep(new MeshLambertMaterial({ map: wood.texture }));
  keep(wood.texture);
  const wallMat = keep(new MeshLambertMaterial({ color: 0xd9d6cf }));
  const { solids, add } = makeSolids(group, world, quality, disposables);

  /* ------------------------------- the ground ----------------------------- */
  /* Grass everywhere there is ground, in rectangles round the water so the
     holes stay holes. The floor sheet for blood goes down the same way. */
  const noise = valueNoise2D(59);
  const groundRects = [
    [BOUNDS.minX, BOUNDS.maxX, RIVER.maxZ, BOUNDS.maxZ],          // everything south of the water
    [BOUNDS.minX, LAKE.minX, BOUNDS.minZ, RIVER.maxZ],            // the west strip
    [LAKE.minX, RIVER.minX, LAKE.maxZ, RIVER.maxZ],               // the corner between them
    [LAKE.maxX, BOUNDS.maxX, BOUNDS.minZ, RIVER.minZ],            // north of the river, the tent
  ];
  for (const [x0, x1, z0, z1] of groundRects) {
    const m = grassPatch(grassMat, x0, x1, z0, z1, noise, { density: 0.45 });
    m.receiveShadow = quality.shadows;
    group.add(m);
    keep(m.geometry);
  }
  world.hasGround = true;
  world.groundY = 0;
  world.groundMin.set(BOUNDS.minX, -2, BOUNDS.minZ);
  world.groundMax.set(BOUNDS.maxX, 0, BOUNDS.maxZ);
  world.groundHoles.length = 0;
  world.groundHoles.push({ ...LAKE }, { ...RIVER });
  world.killY = -35;

  /* The sea all round, and the island's edge dropping into it. */
  const sea = makeWaterTexture(256, 71);
  sea.texture.repeat.set(40, 40);
  const seaMat = keep(new MeshLambertMaterial({ map: sea.texture, color: 0x5d8ea0, emissive: 0x06202a }));
  keep(sea.texture);
  const seaMesh = new Mesh(new PlaneGeometry(700, 700), seaMat);
  seaMesh.rotation.x = -Math.PI / 2;
  seaMesh.position.y = -2.4;
  group.add(seaMesh);
  keep(seaMesh.geometry);
  const cliffMat = keep(new MeshLambertMaterial({ color: 0x6a5a44 }));
  for (const [w, d, x, z] of [
    [110.4, 0.4, 0, BOUNDS.minZ - 0.2], [110.4, 0.4, 0, BOUNDS.maxZ + 0.2],
    [0.4, 90.4, BOUNDS.minX - 0.2, 0], [0.4, 90.4, BOUNDS.maxX + 0.2, 0],
  ]) {
    const m = new Mesh(new BoxGeometry(w, 3.2, d), cliffMat);
    m.position.set(x, -1.6, z);
    group.add(m);
    keep(m.geometry);
  }

  // past the slanted wall the island ends: sea over the grass there
  {
    const [ax, az] = CUT.a, [bx, bz] = CUT.b;
    const tri = new BufferGeometry();
    // wound so it faces up
    const pts = [ax, az - 0.6, bx - 0.6, bz, BOUNDS.maxX + 0.4, BOUNDS.maxZ + 0.4];
    tri.setAttribute('position', new Float32BufferAttribute([
      pts[0], 0, pts[1], pts[2], 0, pts[3], pts[4], 0, pts[5],
    ], 3));
    // the sea's own tiling, so the two meet without a seam
    tri.setAttribute('uv', new Float32BufferAttribute(pts.map((v, i) => (i % 2 ? -v : v) / 17.5), 2));
    tri.computeVertexNormals();
    const m = new Mesh(tri, seaMat);
    m.position.y = 0.03;
    group.add(m);
    keep(tri);
  }

  /* ----------------------------- the outer wall --------------------------- */
  /* Down below the ground as well as above it, because the river runs out
     under the wall and nobody gets to follow it. */
  const WH = 6.2, WY = 4.6 - WH / 2;
  add(110, WH, 1, 0, WY, BOUNDS.minZ + 0.5, wallMat);
  add(1, WH, 90, BOUNDS.minX + 0.5, WY, 0, wallMat);
  add(91, WH, 1, -9.5, WY, BOUNDS.maxZ - 0.5, wallMat);                 // south, to the cut
  add(1, WH, 65, BOUNDS.maxX - 0.5, WY, -12.5, wallMat);                // east, to the cut
  {
    const [ax, az] = CUT.a, [bx, bz] = CUT.b;
    const len = Math.hypot(bx - ax, bz - az) + 1.2;
    add(len, WH, 1, (ax + bx) / 2 - 0.35, WY, (az + bz) / 2 - 0.35, wallMat,
      { ry: Math.atan2(bz - az, ax - bx) });
  }

  /* -------------------------------- the water ----------------------------- */
  // the bed
  add(LAKE.maxX - LAKE.minX, 0.4, LAKE.maxZ - LAKE.minZ, (LAKE.minX + LAKE.maxX) / 2, BED - 0.2,
    (LAKE.minZ + LAKE.maxZ) / 2, bedMat, { tile: 3, floorDecal: true });
  add(RIVER.maxX - RIVER.minX, 0.4, RIVER.maxZ - RIVER.minZ, (RIVER.minX + RIVER.maxX) / 2, BED - 0.2,
    (RIVER.minZ + RIVER.maxZ) / 2, bedMat, { tile: 3, floorDecal: true });
  // stone banks wherever the ground stops at the water
  const bankH = -BED - 0.02, bankY = BED + bankH / 2, T = 0.8;
  const bank = (x0, x1, z0, z1) => add(x1 - x0, bankH, z1 - z0, (x0 + x1) / 2, bankY, (z0 + z1) / 2,
    stoneMat, { tile: 1.6 });
  bank(LAKE.minX - T, LAKE.minX, LAKE.minZ, LAKE.maxZ + T);              // lake, west
  bank(LAKE.minX - T, RIVER.minX, LAKE.maxZ, LAKE.maxZ + T);             // lake, south of the west end
  bank(RIVER.minX - T, RIVER.minX, LAKE.maxZ, RIVER.maxZ + T);           // west end of the south bulge
  bank(RIVER.minX, BOUNDS.maxX, RIVER.maxZ, RIVER.maxZ + T);             // the whole south shore
  bank(LAKE.maxX, LAKE.maxX + T, LAKE.minZ, LAKE.maxZ);                  // lake, east
  bank(LAKE.maxX, BOUNDS.maxX, RIVER.minZ - T, RIVER.minZ);              // river, north bank

  /* The beach runs down into the lake in three terraces of sand, each a
     comfortable step, so the shore is somewhere you can walk in and out. */
  const terraces = [];
  for (let i = 0; i < 3; i++) {
    const top = -0.3 * (i + 1);
    const z1 = RIVER.maxZ - 1.4 * i, z0 = z1 - 1.4;
    const h = top - BED;
    add(18, h, 1.4, -35, BED + h / 2, (z0 + z1) / 2, sandSolid, { tile: 2, floorDecal: true });
    terraces.push([-44, -26, z0, z1, top]);
  }
  // and two flights of stone steps elsewhere: by the crane, and by the bridge
  for (const sx of [3, 31]) {
    for (let i = 0; i < 3; i++) {
      const top = -0.3 * (i + 1);
      const z1 = RIVER.maxZ - 0.55 * i, z0 = z1 - 0.55;
      const h = top - BED;
      add(2.4, h, 0.55, sx, BED + h / 2, (z0 + z1) / 2, stoneMat, { tile: 1, floorDecal: true });
    }
  }

  // the surface itself
  const lakeTex = makeWaterTexture(256, 83);
  lakeTex.texture.repeat.set(8, 4);
  const waterMat = keep(new MeshLambertMaterial({
    map: lakeTex.texture, color: 0x86b2be, transparent: true, opacity: 0.8,
    emissive: 0x0a2228, depthWrite: false,
  }));
  keep(lakeTex.texture);
  for (const r of [LAKE, RIVER]) {
    const m = new Mesh(new PlaneGeometry(r.maxX - r.minX, r.maxZ - r.minZ), waterMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((r.minX + r.maxX) / 2, WATER, (r.minZ + r.maxZ) / 2);
    m.renderOrder = 3;
    group.add(m);
    keep(m.geometry);
  }

  /* ------------------------------ the beach ------------------------------- */
  const beach = new Shape();
  [[-54.5, -44.5], [-48, -44.5], [-48, -30], [-44, -30], [-44, -24.5], [-26, -24.5],
    [-27, -21.5], [-33, -15], [-40, -8], [-47, -2], [-54.5, 0]].forEach(([x, z], i) => {
    // ShapeGeometry is in XY; z becomes -y so it lies the right way up once turned flat
    if (i === 0) beach.moveTo(x, -z); else beach.lineTo(x, -z);
  });
  const beachGeo = new ShapeGeometry(beach);
  beachGeo.rotateX(-Math.PI / 2);
  {
    const p = beachGeo.attributes.position, uv = beachGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 3, p.getZ(i) / 3);
  }
  const beachMesh = new Mesh(beachGeo, sandMat);
  beachMesh.position.y = 0.004;
  beachMesh.renderOrder = 1;
  group.add(beachMesh);
  keep(beachGeo);

  /* ------------------------------- the paths ------------------------------ */
  for (const pts of PATHS) {
    const m = pathRibbon(smooth(pts), 2.6, pathMat, 0.006);
    group.add(m);
    keep(m.geometry);
  }
  for (const [x, z] of [[18, 3], [-1, -12], [3, 19], [0, 41]]) {
    const m = pathDisc(x, z, 2.0, pathMat);
    group.add(m);
    keep(m.geometry);
  }

  /* -------------------------------- the tower ----------------------------- */
  /* Ten metres square and nine high, grey concrete with darker bands, a
     parapet round the roof and a gap in it where the ramp comes in. */
  const TX = (TOWER.minX + TOWER.maxX) / 2, TZ = (TOWER.minZ + TOWER.maxZ) / 2;
  const TW = TOWER.maxX - TOWER.minX, TD = TOWER.maxZ - TOWER.minZ;
  add(TW, TOWER.h, TD, TX, TOWER.h / 2, TZ, concreteMat, { tile: 2.5, floorDecal: true });
  for (const y of [3, 6]) {
    const band = new Mesh(new BoxGeometry(TW + 0.06, 0.3, TD + 0.06), concreteDark);
    band.position.set(TX, y, TZ);
    group.add(band);
    keep(band.geometry);
  }
  const PH = 1.1, PT = 0.3, top = TOWER.h;
  add(TW, PH, PT, TX, top + PH / 2, TOWER.minZ + PT / 2, concreteDark);
  add(TW, PH, PT, TX, top + PH / 2, TOWER.maxZ - PT / 2, concreteDark);
  add(PT, PH, TD, TOWER.minX + PT / 2, top + PH / 2, TZ, concreteDark);
  add(PT, PH, RAMP.z0 - TOWER.minZ, TOWER.maxX - PT / 2, top + PH / 2, (TOWER.minZ + RAMP.z0) / 2, concreteDark);
  add(PT, PH, TOWER.maxZ - RAMP.z1, TOWER.maxX - PT / 2, top + PH / 2, (RAMP.z1 + TOWER.maxZ) / 2, concreteDark);
  // a door at the foot of the tower that goes nowhere: it is a tower
  const door = new Mesh(new BoxGeometry(1.4, 2.3, 0.06), keep(new MeshLambertMaterial({ color: 0x3e4044 })));
  door.position.set(TX, 1.15, TOWER.maxZ + 0.03);
  group.add(door);
  keep(door.geometry);

  /* -------------------------------- the ramp ------------------------------ */
  /* Forty five steps of twenty centimetres, each one solid down to the
     ground, under a slope drawn through the middle of them. */
  const run = RAMP.x1 - RAMP.x0;
  const steps = Math.round(TOWER.h / RAMP.rise);
  const tread = run / steps;
  const RZ = (RAMP.z0 + RAMP.z1) / 2, RW = RAMP.z1 - RAMP.z0;
  for (let i = 1; i <= steps; i++) {
    const h = RAMP.rise * i;
    const xa = RAMP.x1 - tread * i, xb = RAMP.x1 - tread * (i - 1);
    add(xb - xa, h, RW, (xa + xb) / 2, h / 2, RZ, concreteMat, { visible: false, floorDecal: true });
  }
  const wedge = new Mesh(wedgeGeometry(RAMP.x0, RAMP.x1, TOWER.h + RAMP.rise / 2, RAMP.rise / 2, RAMP.z0, RAMP.z1),
    concreteMat);
  wedge.castShadow = quality.shadows;
  wedge.receiveShadow = quality.shadows;
  group.add(wedge);
  keep(wedge.geometry);
  /* Railings up both sides: drawn as a slanted rail on posts, and solid in
     short lengths that each stand a metre over the slope where they are. */
  const railMat = keep(new MeshLambertMaterial({ color: 0x6a6e72 }));
  const slope = TOWER.h / run;
  const lenSlope = Math.hypot(run, TOWER.h);
  for (const z of [RAMP.z0 + 0.06, RAMP.z1 - 0.06]) {
    const rail = new Mesh(new BoxGeometry(lenSlope, 0.07, 0.07), railMat);
    rail.position.set((RAMP.x0 + RAMP.x1) / 2, TOWER.h / 2 + 1.0, z);
    rail.rotation.z = -Math.atan(slope);
    group.add(rail);
    keep(rail.geometry);
    for (let x = RAMP.x1 - 0.4; x > RAMP.x0; x -= 2.4) {
      const y = (RAMP.x1 - x) * slope;
      const post = new Mesh(new BoxGeometry(0.07, 1.0, 0.07), railMat);
      post.position.set(x, y + 0.5, z);
      group.add(post);
      keep(post.geometry);
    }
    const pieces = 8;
    for (let k = 0; k < pieces; k++) {
      const xa = RAMP.x1 - (run * (k + 1)) / pieces, xb = RAMP.x1 - (run * k) / pieces;
      const hTop = (RAMP.x1 - xa) * slope + 1.0;
      add(xb - xa, hTop, 0.12, (xa + xb) / 2, hTop / 2, z, railMat, { visible: false });
    }
  }

  /* -------------------------------- the hotel ----------------------------- */
  /* Three storeys and a garage, by the beach. You can walk in: a lobby with
     a desk, a staircase up the north wall to the first floor, another up the
     south wall to the second, and windows all round. */
  const H = HOTEL, HW = H.wall;
  const hotelMat = keep(new MeshLambertMaterial({ color: 0xe0d4ba }));
  const hotelTrim = keep(new MeshLambertMaterial({ color: 0x8a7458 }));
  const glassMat = keep(new MeshLambertMaterial({ color: 0x3a5466, emissive: 0x0c1820 }));
  const HX = (H.minX + H.maxX) / 2, HZ = (H.minZ + H.maxZ) / 2;
  const HL = H.maxX - H.minX, HD = H.maxZ - H.minZ, HH = H.floor * H.floors;
  const DOOR = { x0: -27, x1: -25.5, h: 2.4 };
  const SIDE = { z0: -15, z1: -14, h: 2.4 };
  // north and west walls, full height
  add(HL, HH, HW, HX, HH / 2, H.minZ + HW / 2, hotelMat, { tile: 3 });
  add(HW, HH, HD, H.minX + HW / 2, HH / 2, HZ, hotelMat, { tile: 3 });
  // south wall, with the front door
  add(DOOR.x0 - H.minX, HH, HW, (H.minX + DOOR.x0) / 2, HH / 2, H.maxZ - HW / 2, hotelMat, { tile: 3 });
  add(H.maxX - DOOR.x1, HH, HW, (DOOR.x1 + H.maxX) / 2, HH / 2, H.maxZ - HW / 2, hotelMat, { tile: 3 });
  add(DOOR.x1 - DOOR.x0, HH - DOOR.h, HW, (DOOR.x0 + DOOR.x1) / 2, DOOR.h + (HH - DOOR.h) / 2,
    H.maxZ - HW / 2, hotelMat);
  // east wall, with a door through to the garage
  add(HW, HH, SIDE.z0 - H.minZ, H.maxX - HW / 2, HH / 2, (H.minZ + SIDE.z0) / 2, hotelMat, { tile: 3 });
  add(HW, HH, H.maxZ - SIDE.z1, H.maxX - HW / 2, HH / 2, (SIDE.z1 + H.maxZ) / 2, hotelMat, { tile: 3 });
  add(HW, HH - SIDE.h, SIDE.z1 - SIDE.z0, H.maxX - HW / 2, SIDE.h + (HH - SIDE.h) / 2,
    (SIDE.z0 + SIDE.z1) / 2, hotelMat);
  // floors, with a hole over each staircase
  const IN = { x0: H.minX + HW, x1: H.maxX - HW, z0: H.minZ + HW, z1: H.maxZ - HW };
  const STAIR = { x0: IN.x0, x1: -27.2, w: 1.45 };
  const slab = (x0, x1, z0, z1, y) => add(x1 - x0, 0.25, z1 - z0, (x0 + x1) / 2, y - 0.125, (z0 + z1) / 2,
    hotelTrim, { floorDecal: true });
  // first floor: hole by the north wall
  slab(IN.x0, IN.x1, IN.z0 + STAIR.w, IN.z1, H.floor);
  slab(STAIR.x1, IN.x1, IN.z0, IN.z0 + STAIR.w, H.floor);
  // second floor: hole by the south wall
  slab(IN.x0, IN.x1, IN.z0, IN.z1 - STAIR.w, H.floor * 2);
  slab(STAIR.x1, IN.x1, IN.z1 - STAIR.w, IN.z1, H.floor * 2);
  // the roof, and a parapet round it
  add(HL, 0.3, HD, HX, HH + 0.15, HZ, hotelTrim);
  add(HL, 0.7, 0.2, HX, HH + 0.65, H.minZ + 0.1, hotelTrim);
  add(HL, 0.7, 0.2, HX, HH + 0.65, H.maxZ - 0.1, hotelTrim);
  add(0.2, 0.7, HD, H.minX + 0.1, HH + 0.65, HZ, hotelTrim);
  add(0.2, 0.7, HD, H.maxX - 0.1, HH + 0.65, HZ, hotelTrim);
  // the staircases: ten steps of thirty centimetres to each floor
  const flight = (z0, z1, base) => {
    const n = 10, rise = H.floor / n, step = (STAIR.x1 - STAIR.x0) / n;
    for (let i = 1; i <= n; i++) {
      const topY = base + rise * i;
      const xa = STAIR.x1 - step * i, xb = STAIR.x1 - step * (i - 1);
      add(xb - xa, topY - base, z1 - z0, (xa + xb) / 2, base + (topY - base) / 2, (z0 + z1) / 2,
        woodMat, { floorDecal: true });
    }
  };
  flight(IN.z0, IN.z0 + STAIR.w, 0);
  flight(IN.z1 - STAIR.w, IN.z1, H.floor);
  // the reception desk
  add(2.4, 1.05, 0.7, -23.6, 0.525, -16.4, woodMat);
  // windows on every face of every floor, and the sign over the door
  const win = (x, y, z, ry) => {
    const m = new Mesh(new PlaneGeometry(1.3, 1.25), glassMat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    group.add(m);
    keep(m.geometry);
  };
  for (let f = 0; f < H.floors; f++) {
    const y = f * H.floor + 1.65;
    for (const x of [-29.5, -23]) {
      win(x, y, H.minZ - 0.01, Math.PI);
      if (!(f === 0 && x > DOOR.x0 - 1 && x < DOOR.x1 + 1)) win(x, y, H.maxZ + 0.01, 0);
    }
    if (f > 0) win(-26.25, y, H.maxZ + 0.01, 0);
    for (const z of [-19, -15]) win(H.minX - 0.01, y, z, -Math.PI / 2);
    // the east face is the garage's wall downstairs
    if (f > 0) win(H.maxX + 0.01, y, -19, Math.PI / 2);
  }
  const signTex = keep(signTexture('HOTEL'));
  const sign = new Mesh(new PlaneGeometry(2.6, 0.65), keep(new MeshBasicMaterial({ map: signTex })));
  sign.position.set((DOOR.x0 + DOOR.x1) / 2, 2.75, H.maxZ + 0.02);
  group.add(sign);
  keep(sign.geometry);
  // an awning over the door
  add(2.6, 0.12, 1.4, (DOOR.x0 + DOOR.x1) / 2, 2.55, H.maxZ + 0.7, hotelTrim);

  // the garage: one storey, a wide door to the south
  const G = GARAGE, GX = (G.minX + G.maxX) / 2, GZ = (G.minZ + G.maxZ) / 2;
  const garageMat = keep(new MeshLambertMaterial({ color: 0xcfc4ab }));
  const GDOOR = { x0: -20.3, x1: -15.7, h: 2.6 };
  add(G.maxX - G.minX, G.h, HW, GX, G.h / 2, G.minZ + HW / 2, garageMat);
  add(HW, G.h, G.maxZ - G.minZ, G.maxX - HW / 2, G.h / 2, GZ, garageMat);
  add(G.maxX - GDOOR.x1, G.h, HW, (GDOOR.x1 + G.maxX) / 2, G.h / 2, G.maxZ - HW / 2, garageMat);
  add(GDOOR.x0 - G.minX, G.h, HW, (G.minX + GDOOR.x0) / 2, G.h / 2, G.maxZ - HW / 2, garageMat);
  add(GDOOR.x1 - GDOOR.x0, G.h - GDOOR.h, HW, (GDOOR.x0 + GDOOR.x1) / 2, GDOOR.h + (G.h - GDOOR.h) / 2,
    G.maxZ - HW / 2, garageMat);
  add(G.maxX - G.minX, 0.25, G.maxZ - G.minZ, GX, G.h + 0.125, GZ, hotelTrim);
  // the roller door, rolled up into its box over the opening
  add(GDOOR.x1 - GDOOR.x0 + 0.2, 0.4, 0.4, (GDOOR.x0 + GDOOR.x1) / 2, GDOOR.h + 0.2, G.maxZ + 0.2, railMat);
  // an oil stain and a workbench, so it reads as a garage
  add(2.2, 0.9, 0.6, G.maxX - 1.4, 0.45, G.minZ + 0.6, woodMat);
  const pad = new Mesh(new PlaneGeometry(G.maxX - G.minX - 0.5, G.maxZ - G.minZ - 0.5),
    keep(new MeshLambertMaterial({ color: 0x55585c })));
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(GX, 0.005, GZ);
  group.add(pad);
  keep(pad.geometry);

  /* ----------------------- the crane, crates, containers ------------------ */
  const yellow = keep(new MeshLambertMaterial({ color: 0xe9b51c }));
  const yellowDark = keep(new MeshLambertMaterial({ color: 0xb8860e }));
  const cabMat = keep(new MeshLambertMaterial({ color: 0xf0efe8 }));
  const C = CRANE, M = 1.6, cx = C.x, cz = C.z;
  // the concrete foot, and the mast: a lattice drawn, a solid box to the physics
  add(3.4, 0.6, 3.4, cx, 0.3, cz, concreteDark, { floorDecal: true });
  add(M, C.mast, M, cx, 0.6 + C.mast / 2, cz, yellow, { visible: false });
  const beam = (w, h, d, x, y, z, rot = null, mat = yellow) => {
    const m = new Mesh(new BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    m.castShadow = quality.shadows;
    group.add(m);
    keep(m.geometry);
    return m;
  };
  const mastTop = 0.6 + C.mast;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    beam(0.16, C.mast, 0.16, cx + sx * M / 2, 0.6 + C.mast / 2, cz + sz * M / 2);
  }
  for (let y = 0.6 + 1.6; y < mastTop; y += 1.6) {
    for (const [w, d, ox, oz] of [[M, 0.08, 0, -M / 2], [M, 0.08, 0, M / 2], [0.08, M, -M / 2, 0], [0.08, M, M / 2, 0]]) {
      beam(w, 0.08, d, cx + ox, y, cz + oz);
    }
    // a diagonal on each face
    const diag = Math.hypot(M, 1.6);
    beam(diag, 0.06, 0.06, cx, y - 0.8, cz - M / 2, [0, 0, Math.atan2(1.6, M)]);
    beam(diag, 0.06, 0.06, cx, y - 0.8, cz + M / 2, [0, 0, -Math.atan2(1.6, M)]);
    beam(0.06, 0.06, diag, cx - M / 2, y - 0.8, cz, [Math.atan2(1.6, M), 0, 0]);
    beam(0.06, 0.06, diag, cx + M / 2, y - 0.8, cz, [-Math.atan2(1.6, M), 0, 0]);
  }
  // the slewing unit, the cab beside it, and the peak above
  beam(2.4, 1.2, 2.4, cx, mastTop + 0.6, cz, null, yellowDark);
  beam(1.6, 1.7, 1.7, cx + 1.9, mastTop + 0.6, cz - 0.4, null, cabMat);
  beam(1.62, 0.9, 1.4, cx + 1.9, mastTop + 0.75, cz - 0.42, null, glassMat);
  for (const sx of [-1, 1]) beam(0.14, 4.2, 0.14, cx + sx * 0.6, mastTop + 3.1, cz, [0, 0, -sx * 0.14]);
  // the jib, out north over the water, and the counter jib south
  const JIB = 22, CJ = 8, jy = mastTop + 1.6;
  for (const sx of [-1, 1]) beam(0.12, 0.12, JIB, cx + sx * 0.45, jy, cz - JIB / 2 - 0.6);
  beam(0.12, 0.12, JIB, cx, jy + 0.9, cz - JIB / 2 - 0.6);
  for (let z = 0; z < JIB; z += 1.4) {
    beam(0.06, 1.05, 0.06, cx - 0.22, jy + 0.45, cz - 0.6 - z, [0.6, 0, 0.45]);
    beam(0.06, 1.05, 0.06, cx + 0.22, jy + 0.45, cz - 0.6 - z, [0.6, 0, -0.45]);
  }
  for (const sx of [-1, 1]) beam(0.14, 0.3, CJ, cx + sx * 0.5, jy, cz + CJ / 2 + 0.6);
  beam(1.6, 1.4, 2.2, cx, jy - 0.4, cz + CJ - 0.6, null, concreteDark);    // counterweight
  // tie bars from the peak out to both ends
  const peak = [cx, mastTop + 5.2, cz];
  const tie = (to) => {
    const dx = to[0] - peak[0], dy = to[1] - peak[1], dz = to[2] - peak[2];
    const len = Math.hypot(dx, dy, dz);
    const m = beam(0.05, 0.05, len, (peak[0] + to[0]) / 2, (peak[1] + to[1]) / 2, (peak[2] + to[2]) / 2);
    m.lookAt(to[0], to[1], to[2]);
  };
  tie([cx, jy + 0.9, cz - JIB * 0.7]);
  tie([cx, jy + 0.2, cz + CJ]);
  // the trolley, the cable, and what is hanging off the hook: a pallet of crates
  const hookZ = cz - 12, hookY = 5.4;
  beam(0.9, 0.3, 0.9, cx, jy - 0.25, hookZ, null, yellowDark);
  beam(0.04, jy - hookY - 0.6, 0.04, cx, (jy + hookY) / 2 + 0.2, hookZ, null, railMat);
  beam(0.3, 0.4, 0.3, cx, hookY + 0.6, hookZ, null, yellowDark);
  for (const [ox, oz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) {
    beam(0.75, 0.75, 0.75, cx + ox, hookY, hookZ + oz, null, woodMat);
  }

  // containers and stacks of crates in the yard
  const containerMat = (c) => keep(new MeshLambertMaterial({ color: c }));
  const ribs = (x, z, ry, mat) => {
    const m = new Mesh(new BoxGeometry(6.06, 0.08, 2.46), mat);
    m.position.set(x, 2.62, z); m.rotation.y = ry; group.add(m); keep(m.geometry);
  };
  const box = (w, h, d, x, y, z, mat, ry = 0) => add(w, h, d, x, y, z, mat, { ry, floorDecal: true });
  const red = containerMat(0xa8322a), blue = containerMat(0x2e5a8c), green = containerMat(0x3d6b45);
  box(6, 2.6, 2.4, -12.5, 1.3, -14.5, red, 0.08); ribs(-12.5, -14.5, 0.08, red);
  box(6, 2.6, 2.4, -12.2, 1.3, -11.6, blue, -0.04); ribs(-12.2, -11.6, -0.04, blue);
  box(6, 2.6, 2.4, -12.4, 3.9, -13.1, green, 0.5);
  for (const [x, z, n] of [[-1.5, -15.5, 3], [0.2, -15.6, 2], [-0.8, -17.2, 2], [2.4, -18.2, 1], [-3.4, -21.2, 2]]) {
    for (let k = 0; k < n; k++) box(1, 1, 1, x, 0.5 + k, z, woodMat, (x * 0.37 + k * 0.6) % 0.6);
  }

  /* ------------------------- the river and the bridge --------------------- */
  /* An old stone bridge, arched, with a parapet down each side. The deck is
     one easy step up from the path. */
  const BX = (BRIDGE.minX + BRIDGE.maxX) / 2, BW = BRIDGE.maxX - BRIDGE.minX;
  const span = RIVER.maxZ - RIVER.minZ + 1.6, BZ = (RIVER.minZ + RIVER.maxZ) / 2;
  add(BW, 0.5, span, BX, BRIDGE.top - 0.25, BZ, stoneMat, { tile: 1.4 });
  for (const sx of [-1, 1]) {
    add(0.35, 0.85, span, BX + sx * (BW / 2 - 0.175), BRIDGE.top + 0.425, BZ, stoneMat, { tile: 1 });
  }
  // the arch, seen from the water
  const archMat = keep(new MeshLambertMaterial({ map: stone.texture, color: 0xa49c8c, side: DoubleSide }));
  // the upper half of a cylinder lying across the river, its crown under the deck
  const arch = new Mesh(new CylinderGeometry(2.7, 2.7, BW - 0.1, 16, 1, true, 0, Math.PI), archMat);
  arch.rotation.z = Math.PI / 2;
  arch.position.set(BX, BRIDGE.top - 0.5 - 2.7, BZ);
  group.add(arch);
  keep(arch.geometry);
  for (const sz of [-1, 1]) {
    add(BW + 0.4, -BED + BRIDGE.top - 0.5, 0.9, BX, (BED + BRIDGE.top - 0.5) / 2, BZ + sz * (span / 2 - 0.4), stoneMat);
  }

  /* --------------------------- the lake walkway --------------------------- */
  {
    const W = WALK, top = W.y, thick = 0.3;
    const deckMat = concreteMat;
    const deck = (x0, x1, z0, z1) => add(x1 - x0, thick, z1 - z0, (x0 + x1) / 2, top - thick / 2,
      (z0 + z1) / 2, deckMat, { tile: 2 });
    deck(W.north.x0, W.north.x1, W.north.z0, W.north.z1);
    deck(W.west.x0, W.west.x1, W.west.z0, W.west.z1);
    // a kerb along the deck's edge, so it reads as a walkway and not a slab
    const kerb = (w, d, x, z) => {
      const m = new Mesh(new BoxGeometry(w, 0.12, d), concreteDark);
      m.position.set(x, top + 0.06, z);
      group.add(m);
      keep(m.geometry);
    };
    /* The ledge: half a disc out over the water, laid down as strips for the
       physics (a box can only be a box) under one round slab you see. */
    const L0 = W.ledge;
    const strips = 14;
    for (let i = 0; i < strips; i++) {
      const xa = L0.x - L0.r + (2 * L0.r * i) / strips, xb = xa + (2 * L0.r) / strips;
      const xm = (xa + xb) / 2 - L0.x;
      const reach = Math.sqrt(Math.max(0, L0.r * L0.r - xm * xm));
      if (reach < 0.3) continue;
      add(xb - xa, thick, reach, (xa + xb) / 2, top - thick / 2, L0.z + reach / 2, deckMat,
        { visible: false });
    }
    const disc = new Mesh(new CylinderGeometry(L0.r, L0.r, thick, 40, 1, false, -Math.PI / 2, Math.PI), deckMat);
    disc.position.set(L0.x, top - thick / 2, L0.z);
    disc.castShadow = quality.shadows;
    disc.receiveShadow = quality.shadows;
    group.add(disc);
    keep(disc.geometry);

    /* Pillars down to the lake bed - or to the sand, under the west leg -
       every six metres, and a ring of them under the ledge. */
    const pillar = (x, z) => {
      const base = world.hasGroundAt(x, z) ? 0 : BED;
      const h = top - thick - base;
      add(0.5, h, 0.5, x, base + h / 2, z, concreteDark, { tile: 1 });
    };
    for (let x = W.north.x1 - 1; x > W.north.x0 + 2; x -= 6) pillar(x, -42.5);
    pillar(-52.5, -37);
    pillar(-52.5, -33);
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (Math.PI * (k + 0.5)) / 5;
      pillar(L0.x + Math.sin(a) * (L0.r - 0.8), L0.z + Math.cos(a) * (L0.r - 0.8));
    }

    /* Railings. Drawn as a top rail on posts; solid as a thin wall a metre
       high, so nobody walks off the edge into the lake by accident. */
    const railH = 1.0;
    const railRun = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.05) return;
      const ry = Math.atan2(-(bz - az), bx - ax);
      add(len, railH, 0.1, (ax + bx) / 2, top + railH / 2, (az + bz) / 2, railMat, { visible: false, ry });
      const bar = new Mesh(new BoxGeometry(len, 0.07, 0.07), railMat);
      bar.position.set((ax + bx) / 2, top + railH - 0.035, (az + bz) / 2);
      bar.rotation.y = ry;
      group.add(bar);
      keep(bar.geometry);
      const mid = new Mesh(new BoxGeometry(len, 0.05, 0.05), railMat);
      mid.position.set((ax + bx) / 2, top + railH * 0.5, (az + bz) / 2);
      mid.rotation.y = ry;
      group.add(mid);
      keep(mid.geometry);
      const posts = Math.max(1, Math.round(len / 2));
      for (let i = 0; i <= posts; i++) {
        const t = i / posts;
        const post = new Mesh(new BoxGeometry(0.07, railH, 0.07), railMat);
        post.position.set(ax + (bx - ax) * t, top + railH / 2, az + (bz - az) * t);
        group.add(post);
        keep(post.geometry);
      }
    };
    // along the lake side of the north leg, broken where the ledge opens off it
    railRun(W.west.x1, W.north.z1 - 0.05, L0.x - L0.r, W.north.z1 - 0.05);
    railRun(L0.x + L0.r, W.north.z1 - 0.05, W.north.x1, W.north.z1 - 0.05);
    // round the ledge
    const segs = 16;
    for (let i = 0; i < segs; i++) {
      const a0 = -Math.PI / 2 + (Math.PI * i) / segs, a1 = -Math.PI / 2 + (Math.PI * (i + 1)) / segs;
      const r = L0.r - 0.06;
      railRun(L0.x + Math.sin(a0) * r, L0.z + Math.cos(a0) * r, L0.x + Math.sin(a1) * r, L0.z + Math.cos(a1) * r);
    }
    // the inner side of the west leg
    railRun(W.west.x1 - 0.05, W.north.z1, W.west.x1 - 0.05, W.west.z1);
    kerb(W.north.x1 - W.north.x0, 0.2, (W.north.x0 + W.north.x1) / 2, W.north.z0 + 0.1);
    kerb(0.2, W.west.z1 - W.west.z0, W.west.x0 + 0.1, (W.west.z0 + W.west.z1) / 2);

    /* Steps down at both ends: four of a quarter metre each, east onto the
       grass by the river, south onto the beach. */
    for (let i = 1; i <= 3; i++) {
      const t = top - 0.25 * i;
      add(1, t, W.w, W.north.x1 + i - 0.5, t / 2, (W.north.z0 + W.north.z1) / 2, concreteDark,
        { floorDecal: true });
      add(W.w, t, 1, (W.west.x0 + W.west.x1) / 2, t / 2, W.west.z1 + i - 0.5, concreteDark,
        { floorDecal: true });
    }
  }

  /* ---------------------- the tent over the parking ----------------------- */
  // tarmac with white bays
  const tarmac = new Mesh(new PlaneGeometry(17, 11.5), keep(new MeshLambertMaterial({ color: 0x4a4d50 })));
  tarmac.rotation.x = -Math.PI / 2;
  tarmac.position.set(TENT.x, 0.005, TENT.z);
  group.add(tarmac);
  keep(tarmac.geometry);
  const lineMat = keep(new MeshBasicMaterial({ color: 0xe8e8e0 }));
  for (let i = 0; i <= 5; i++) {
    const m = new Mesh(new PlaneGeometry(0.12, 4.6), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(TENT.x - 7 + i * 2.8, 0.007, TENT.z - 2.6);
    group.add(m);
    keep(m.geometry);
  }
  // the tent: grey canvas on poles, open at both ends
  const canvas = keep(new MeshLambertMaterial({ color: 0x7c8078, side: DoubleSide }));
  const halfD = TENT.d / 2, roofLen = Math.hypot(halfD, TENT.ridge - TENT.eave);
  const pitch = Math.atan2(TENT.ridge - TENT.eave, halfD);
  for (const sz of [-1, 1]) {
    const roof = new Mesh(new BoxGeometry(TENT.w + 0.6, 0.06, roofLen + 0.3), canvas);
    roof.position.set(TENT.x, (TENT.ridge + TENT.eave) / 2, TENT.z + sz * halfD / 2);
    roof.rotation.x = sz * pitch;
    roof.castShadow = quality.shadows;
    group.add(roof);
    keep(roof.geometry);
    // short side walls hanging under the eaves
    const skirt = new Mesh(new BoxGeometry(TENT.w + 0.6, 0.9, 0.05), canvas);
    skirt.position.set(TENT.x, TENT.eave - 0.45, TENT.z + sz * (halfD + 0.12));
    group.add(skirt);
    keep(skirt.geometry);
  }
  const poleMat = keep(new MeshLambertMaterial({ color: 0x4a4e4a }));
  for (const ox of [-TENT.w / 2, 0, TENT.w / 2]) {
    for (const sz of [-1, 1]) add(0.14, TENT.eave, 0.14, TENT.x + ox, TENT.eave / 2, TENT.z + sz * halfD, poleMat);
    add(0.16, TENT.ridge, 0.16, TENT.x + ox, TENT.ridge / 2, TENT.z, poleMat);
  }
  // a pair of jerry cans and a crate under it
  add(1, 1, 1, TENT.x + 4.5, 0.5, TENT.z + 2.5, woodMat, { floorDecal: true });
  add(0.35, 0.5, 0.2, TENT.x + 5.4, 0.25, TENT.z + 3.3, keep(new MeshLambertMaterial({ color: 0x48562e })));

  /* --------------------------------- trees -------------------------------- */
  /* Pines and broadleaves scattered wherever the photo has dark green and
     nothing else is in the way. The trunks are solid; the leaves are drawn,
     all of one kind in one batch. */
  const rng = makeRng(4441);
  const trees = [];
  for (let gx = BOUNDS.minX + 4; gx < BOUNDS.maxX - 3; gx += 6.2) {
    for (let gz = BOUNDS.minZ + 4; gz < BOUNDS.maxZ - 3; gz += 6.2) {
      const x = gx + (rng() - 0.5) * 4.6, z = gz + (rng() - 0.5) * 4.6;
      if (rng() < 0.28) continue;
      if (!treeAllowed(x, z)) continue;
      trees.push({ x, z, pine: rng() < 0.55, s: 0.8 + rng() * 0.5, ry: rng() * Math.PI * 2 });
    }
  }
  const trunkMat = keep(new MeshLambertMaterial({ color: 0x5a4028 }));
  const pineMat = keep(new MeshLambertMaterial({ color: 0x2c5a30 }));
  const leafMat = keep(new MeshLambertMaterial({ color: 0x3e7a34 }));
  const trunkGeo = keep(new CylinderGeometry(0.16, 0.22, 1, 7));
  const coneGeo = keep(new ConeGeometry(1, 1, 8));
  const blobGeo = keep(new IcosahedronGeometry(1, 0));
  const trunks = new InstancedMesh(trunkGeo, trunkMat, trees.length);
  const cones = new InstancedMesh(coneGeo, pineMat, trees.filter((t) => t.pine).length * 3);
  const blobs = new InstancedMesh(blobGeo, leafMat, trees.filter((t) => !t.pine).length * 2);
  const mtx = new Matrix4(), q = new Quaternion(), e = new Euler(), sc = new Vector3(), at = new Vector3();
  let ci = 0, bi = 0;
  trees.forEach((t, i) => {
    const trunkH = (t.pine ? 2.0 : 2.4) * t.s;
    mtx.compose(at.set(t.x, trunkH / 2, t.z), q.identity(), sc.set(t.s, trunkH, t.s));
    trunks.setMatrixAt(i, mtx);
    add(0.38 * t.s, trunkH + 0.6, 0.38 * t.s, t.x, (trunkH + 0.6) / 2, t.z, trunkMat, { visible: false });
    if (t.pine) {
      for (let k = 0; k < 3; k++) {
        const r = (1.7 - k * 0.42) * t.s, h = (2.2 - k * 0.3) * t.s;
        mtx.compose(at.set(t.x, trunkH + 0.6 + k * 1.15 * t.s, t.z),
          q.setFromEuler(e.set(0, t.ry + k, 0)), sc.set(r, h, r));
        cones.setMatrixAt(ci++, mtx);
      }
    } else {
      mtx.compose(at.set(t.x, trunkH + 1.3 * t.s, t.z), q.setFromEuler(e.set(0.3, t.ry, 0.2)),
        sc.set(1.9 * t.s, 1.6 * t.s, 1.9 * t.s));
      blobs.setMatrixAt(bi++, mtx);
      mtx.compose(at.set(t.x + 0.6 * t.s, trunkH + 2.2 * t.s, t.z - 0.3 * t.s), q.setFromEuler(e.set(0, t.ry * 2, 0.5)),
        sc.set(1.3 * t.s, 1.2 * t.s, 1.3 * t.s));
      blobs.setMatrixAt(bi++, mtx);
    }
  });
  for (const im of [trunks, cones, blobs]) {
    im.castShadow = quality.shadows;
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    group.add(im);
    disposables.push(im);
  }

  /* ---------------------------- the floor sheet --------------------------- */
  const decalMat = keep(decalMaterial());
  const decals = [
    ...groundRects.map(([x0, x1, z0, z1]) => [x0, x1, z0, z1, 0]),
    [LAKE.minX, LAKE.maxX, LAKE.minZ, LAKE.maxZ, BED],
    [RIVER.minX, -26, RIVER.minZ, RIVER.maxZ - 4.2, BED],
    [-26, RIVER.maxX, RIVER.minZ, RIVER.maxZ, BED],
    ...terraces,
    [TOWER.minX, TOWER.maxX, TOWER.minZ, TOWER.maxZ, TOWER.h],
  ];
  for (const [x0, x1, z0, z1, y] of decals) {
    const m = decalPatch(decalMat, HALF, x0, x1, z0, z1, y);
    group.add(m);
    keep(m.geometry);
  }

  /* --------------------------- the sewer outfalls ------------------------- */
  /* Four square concrete mouths in the north wall, down on the lake bed under
     the walkway, each barred. In one of them a bar has been bent aside, and
     air keeps coming up out of the dark behind it. */
  const outfall = keep(new MeshLambertMaterial({ map: concrete.texture, color: 0x8a908c }));
  const voidMat = keep(new MeshBasicMaterial({ color: 0x020304 }));
  const barMat = keep(new MeshLambertMaterial({ color: 0x4a4440 }));
  const rust = keep(new MeshLambertMaterial({ color: 0x6a3a22 }));
  const wallZ = BOUNDS.minZ + 1;
  const GY = BED + 1.0;
  const grateAt = [];
  for (const gx of GRATES) {
    // the frame round the opening, standing a little proud of the wall
    add(2.2, 0.35, 0.4, gx, GY + 0.82, wallZ + 0.2, outfall);
    add(2.2, 0.3, 0.4, gx, GY - 0.75, wallZ + 0.2, outfall);
    add(0.35, 1.9, 0.4, gx - 0.92, GY, wallZ + 0.2, outfall);
    add(0.35, 1.9, 0.4, gx + 0.92, GY, wallZ + 0.2, outfall);
    const hole = new Mesh(new PlaneGeometry(1.5, 1.3), voidMat);
    hole.position.set(gx, GY, wallZ + 0.02);
    group.add(hole);
    keep(hole.geometry);
    // the bars: solid, so nothing gets through but what fits past the bent one
    const bent = gx === BENT;
    for (let i = 0; i < 6; i++) {
      const bx = gx - 0.62 + i * 0.25;
      if (bent && i === 3) {
        // bent out and aside in the middle: two pieces with a kink between
        for (const [y0, y1, out] of [[GY - 0.62, GY - 0.1, 0.0], [GY - 0.1, GY + 0.62, 0.0]]) {
          const len = y1 - y0;
          const bar = new Mesh(new CylinderGeometry(0.035, 0.035, len, 6), rust);
          bar.position.set(bx + 0.18, (y0 + y1) / 2, wallZ + 0.32 + out);
          bar.rotation.z = y0 < GY - 0.2 ? 0.55 : -0.55;
          bar.rotation.x = -0.5;
          group.add(bar);
          keep(bar.geometry);
        }
        continue;
      }
      const bar = new Mesh(new CylinderGeometry(0.035, 0.035, 1.28, 6), bent ? rust : barMat);
      bar.position.set(bx, GY, wallZ + 0.22);
      group.add(bar);
      keep(bar.geometry);
      add(0.07, 1.28, 0.07, bx, GY, wallZ + 0.22, barMat, { visible: false });
    }
    grateAt.push(new Vector3(gx, GY, wallZ + 0.6));
  }
  const bentAt = grateAt[GRATES.indexOf(BENT)];

  mergeStatic(group, disposables);
  scene.add(group);

  let clock = 0, bubbleT = 0;
  const _bub = new Vector3();
  return mapRecord({
    scene, world, group, solids, lights, disposables, decalMat,
    id: dark ? 'darklegacy' : 'legacy',
    name: dark ? 'Dark Legacy' : 'Legacy',
    half: HALF,
    /* Flat, empty grass that nothing will ever be built on, for the tests. */
    openArea: new Vector3(25, 0, 24),
    /* Dark Legacy starts where the bent bar lets out: under the water, just
       off the grate, facing out into the lake. */
    spawnPoint: dark ? new Vector3(BENT, 0, -38.5) : SPAWN.clone(),
    spawnYaw: dark ? Math.PI : 0,
    citizens: dark ? 0 : undefined,
    encounter: dark ? 'shadow' : null,
    interactables: [{
      id: 'bentGrate',
      label: 'ENTER',
      position: bentAt,
      radius: 2.2,
      prompt: dark ? 'Back the way you came' : 'One of the bars is bent wide enough to squeeze through',
      use: (game) => game.travel(dark ? 'legacy' : 'darklegacy',
        dark ? 'You squeeze back through the bars' : 'You squeeze through the bent bar'),
    }],
    water: [
      { ...LAKE, y: WATER, floor: BED },
      { ...RIVER, y: WATER, floor: BED },
    ],
    // crates by the crane that you can knock about
    props: dark ? [] : [
      { kind: 'crate', pos: new Vector3(-4.5, 0.6, -14) },
      { kind: 'crate', pos: new Vector3(-4.2, 1.5, -14.1) },
      { kind: 'crate', pos: new Vector3(1.8, 0.6, -13.2) },
      { kind: 'crate', pos: new Vector3(-7.5, 0.6, -21.5) },
    ],
    tick(dt, game) {
      clock += dt;
      lakeTex.texture.offset.set(clock * 0.03, Math.sin(clock * 0.2) * 0.05);
      sea.texture.offset.set(clock * 0.004, clock * 0.006);
      // air coming up out of the bent grate, in little bursts
      bubbleT -= dt;
      if (bubbleT <= 0 && game?.fx) {
        bubbleT = 0.12 + Math.random() * 0.25;
        game.fx.bubbles(_bub.set(bentAt.x + (Math.random() - 0.5) * 0.6, bentAt.y - 0.3, bentAt.z - 0.25),
          { count: 2, up: 1.3, life: 2.6, size: 0.07 });
      }
    },
    // where things are, for anyone who needs to find them
    landmarks: {
      tower: new Vector3(TX, TOWER.h, TZ), rampFoot: new Vector3(RAMP.x1 + 1, 0, RZ),
      hotelDoor: new Vector3((DOOR.x0 + DOOR.x1) / 2, 0, H.maxZ), garage: new Vector3(GX, 0, GZ),
      bridge: new Vector3(BX, BRIDGE.top, BZ), tent: new Vector3(TENT.x, 0, TENT.z),
      crane: new Vector3(cx, 0, cz), beach: new Vector3(-36, 0, -18),
      stairTop2: new Vector3(STAIR.x0 + 0.3, H.floor * 2, IN.z1 - STAIR.w / 2),
      walkEast: new Vector3(WALK.north.x1 + 4, 0, (WALK.north.z0 + WALK.north.z1) / 2),
      walkLedge: new Vector3(WALK.ledge.x, WALK.y, WALK.ledge.z + WALK.ledge.r - 1),
      walkBeach: new Vector3((WALK.west.x0 + WALK.west.x1) / 2, 0, WALK.west.z1 + 4),
      grates: grateAt, bentGrate: bentAt, towerLine: TOWER.maxZ,
    },
  });
}
