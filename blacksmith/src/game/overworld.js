/* =============================================================================
   The meadow: where you start.

   A stone circle in the grass, and two paths out of it. One runs west to the
   Forge - anvil, a bucket of lava hung over a sword mould, a water bucket to
   quench in, the hearth and the rest of a smith's things. The other runs
   straight ahead, north, to a cave in the cliff with a wooden sign hung over
   its mouth that says "Cave".

       north (-Z)            cliff ─── cave mouth (0, -45.5)
                                         │
                                         │ cave path
                                         │
       Forge (-27, -4.6) ═══ forge path ═╡
                                       (0, 0) stone circle, where you spawn
   ========================================================================== */
import {
  Scene, Group, Mesh, InstancedMesh, Object3D, Color, Fog, Vector3,
  PlaneGeometry, BoxGeometry, CylinderGeometry, ConeGeometry, SphereGeometry,
  IcosahedronGeometry, CircleGeometry, TorusGeometry, ShapeGeometry, ExtrudeGeometry, Shape, BufferGeometry,
  Float32BufferAttribute, MeshLambertMaterial, MeshPhongMaterial, MeshBasicMaterial,
  SpriteMaterial, Sprite, HemisphereLight, DirectionalLight, AmbientLight, PointLight,
  DoubleSide, BackSide, AdditiveBlending,
} from 'three';
import { makeRng, valueNoise2D, fbm, clamp01, lerp, smoothstep } from '../core/util.js';
import {
  grassTexture, dirtTexture, stoneCircleTexture, bricksTexture, woodTexture, rockTexture,
  shinglesTexture, skyTexture, lavaTexture, signTexture, flameTexture, tuftTexture, softDotTexture,
  makeCanvas, drawPriceTag, toTexture, arrowSignTexture,
} from './textures.js';
import { mergeStatic, flatten, tiledBox, pathGeometry, smoothPath, rockGeometry } from './geo.js';
import { addTorch } from './torch.js';
import { Collider } from './collide.js';
import { buildWeapon, buildPickaxe } from './gear.js';
import { oreMaterial } from './materials.js';
import { PICKAXES } from './data.js';

/* --------------------------------- layout ---------------------------------- */

export const OW = {
  bounds: { minX: -39.4, maxX: 29.4, minZ: -45.3, maxZ: 25.4 },
  circle: { x: 0, z: 0, r: 5, top: 0.12 },
  spawn: { x: 0, z: 1.6, yaw: Math.PI },          // facing north, up the cave path
  forge: { minX: -32, maxX: -22, minZ: -8.6, maxZ: -0.6, floor: 0.15 },
  anvil: { x: -24.6, z: -4.4 },
  mold: { x: -24.8, z: -2.55 },
  water: { x: -24.4, z: -6.0 },
  cave: { x: 0, mouthZ: -45.3, half: 2.3, enterZ: -48.2 },
  /** where you come out of the cave, facing home */
  caveExit: { x: 0, z: -42.2, yaw: 0 },
  /** the pickaxe wall, just left of the cave mouth, turned to face the path */
  wall: { x: -5.6, z: -40.4, yaw: 1.035 },
};

const CAVE_PATH = [[0, -4.4], [0.7, -10], [-0.5, -16], [0.6, -23], [-0.4, -30], [0.2, -36], [0, -41], [0, -47]];
const FORGE_PATH = [[-4.3, -1.7], [-8.5, -3.3], [-13, -4.7], [-17.5, -4.9], [-22.2, -4.6]];

function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = clamp01(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

const hillNoise = valueNoise2D(3);
/** Well outside the fence the land rises into hills; inside it, it is flat. */
function hillHeight(x, z) {
  const far = Math.max(0, x - 34, -44 - x, z - 30);
  if (far <= 0) return 0;
  return Math.pow(far, 1.3) * 0.18 * (0.6 + fbm(hillNoise, x * 0.04, z * 0.04, 4));
}

/** Height of the ground you stand on: the circle and the forge floor are raised. */
export function overworldGround(x, z) {
  if (x * x + z * z < OW.circle.r * OW.circle.r) return OW.circle.top;
  const f = OW.forge;
  if (x > f.minX && x < f.maxX && z > f.minZ && z < f.maxZ) return f.floor;
  return 0;
}

/* --------------------------------- build ----------------------------------- */

export function buildOverworld({ quality }) {
  const scene = new Scene();
  scene.background = new Color('#9cc7e8');
  scene.fog = new Fog('#cfe2ee', 55, 175);
  const col = new Collider();
  const disposables = [];
  const keep = (...xs) => { disposables.push(...xs); return xs[0]; };
  const shadows = quality.shadows;
  const low = quality.name === 'low';

  /* ------------------------------ materials ------------------------------ */
  const grassTex = keep(grassTexture(low ? 256 : 512));
  grassTex.repeat.set(48, 48);
  const dirtTex = keep(dirtTexture(256));
  const bricksTex = keep(bricksTexture(256, { rows: 4, cols: 3 }));
  const floorTex = keep(bricksTexture(256, { rows: 3, cols: 3, tone: 0.85, seed: 4 }));
  const woodTex = keep(woodTexture(256, { seed: 3 }));
  const beamTex = keep(woodTexture(128, { seed: 8, planks: 1, base: [118, 78, 44] }));
  const rockTex = keep(rockTexture(256, { seed: 11 }));
  const roofTex = keep(shinglesTexture(256));
  const lavaTex = keep(lavaTexture(128));

  const M = {
    grass: new MeshLambertMaterial({ map: grassTex, vertexColors: true }),
    dirt: new MeshLambertMaterial({ map: dirtTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    circleTop: new MeshLambertMaterial({ map: keep(stoneCircleTexture(low ? 512 : 1024)) }),
    stone: new MeshLambertMaterial({ map: bricksTex }),
    floor: new MeshLambertMaterial({ map: floorTex }),
    wood: new MeshLambertMaterial({ map: woodTex }),
    beam: new MeshLambertMaterial({ map: beamTex }),
    darkWood: new MeshLambertMaterial({ color: 0x5b3a20 }),
    rock: new MeshLambertMaterial({ map: rockTex, color: 0xb8b2a6 }),
    cliff: new MeshLambertMaterial({ map: rockTex, color: 0x9d968a, emissive: 0x15130f }),
    cliffFace: new MeshLambertMaterial({ map: rockTex, color: 0xa39c90, emissive: 0x15130f, vertexColors: true }),
    roof: new MeshLambertMaterial({ map: roofTex, transparent: true, opacity: 1, side: DoubleSide }),
    roofWood: new MeshLambertMaterial({ map: woodTex, transparent: true, opacity: 1, side: DoubleSide }),
    iron: new MeshPhongMaterial({ color: 0x3b3f45, specular: 0x8a8f96, shininess: 45 }),
    darkIron: new MeshPhongMaterial({ color: 0x24272b, specular: 0x55595e, shininess: 30 }),
    lava: new MeshBasicMaterial({ map: lavaTex }),
    coal: new MeshLambertMaterial({ color: 0x1c1a19 }),
    ember: new MeshBasicMaterial({ color: 0xff6a1a }),
    water: new MeshPhongMaterial({ color: 0x2f6f9e, specular: 0xffffff, shininess: 110, transparent: true, opacity: 0.86 }),
    leather: new MeshLambertMaterial({ color: 0x6b4426 }),
    trunk: new MeshLambertMaterial({ color: 0x6b4a2b }),
    pine: new MeshLambertMaterial({ color: 0x2c6431, flatShading: true }),
    leaf: new MeshLambertMaterial({ color: 0x4f9440, flatShading: true }),
    bush: new MeshLambertMaterial({ color: 0x3f8236, flatShading: true }),
    lantern: new MeshBasicMaterial({ color: 0xffd27a }),
    tunnel: new MeshLambertMaterial({ map: rockTex, vertexColors: true }),
    black: new MeshBasicMaterial({ color: 0x000000 }),
    chain: new MeshPhongMaterial({ color: 0x55585c, specular: 0x999999, shininess: 50 }),
  };
  for (const m of Object.values(M)) disposables.push(m);

  const world = new Group();
  scene.add(world);
  const box = (w, h, d, mat, x, y, z, { ry = 0, rx = 0, rz = 0, tile = 0, cast = true, parent = world } = {}) => {
    const m = new Mesh(tile ? tiledBox(w, h, d, tile) : new BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = shadows && cast;
    m.receiveShadow = shadows;
    parent.add(m);
    return m;
  };
  const cyl = (rt, rb, h, mat, x, y, z, { seg = 12, parent = world, cast = true } = {}) => {
    const m = new Mesh(new CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = shadows && cast;
    m.receiveShadow = shadows;
    parent.add(m);
    return m;
  };

  /* ------------------------------ sky & light ---------------------------- */
  const skyTex = keep(skyTexture());
  const sky = new Mesh(new SphereGeometry(400, 24, 12), new MeshBasicMaterial({ map: skyTex, side: BackSide, fog: false, depthWrite: false }));
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);
  disposables.push(sky.geometry, sky.material);
  // a sun to look at, where the light comes from
  const sunDisc = new Sprite(new SpriteMaterial({ map: keep(softDotTexture(64, 'rgba(255,250,225,1)', 'rgba(255,240,200,0)')), fog: false, depthWrite: false, blending: AdditiveBlending }));
  sunDisc.position.set(30, 55, 20).normalize().multiplyScalar(330);
  sunDisc.scale.set(60, 60, 1);
  sunDisc.renderOrder = -9;
  scene.add(sunDisc);
  disposables.push(sunDisc.material);

  scene.add(new HemisphereLight(0xd6ecff, 0x5d6b3a, 1.5));
  scene.add(new AmbientLight(0xffffff, 0.35));
  const sun = new DirectionalLight(0xfff0d4, 2.6);
  sun.position.set(30, 55, 20);
  scene.add(sun, sun.target);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
    const d = 26;
    Object.assign(sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 1, far: 140 });
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.03;
  }

  /* -------------------------------- ground ------------------------------- */
  {
    const size = 280, seg = low ? 40 : 70;
    const g = new PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    g.translate(-5, 0, -10);
    const noise = hillNoise;
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const n = fbm(noise, x * 0.04, z * 0.04, 4);
      const dry = clamp01(fbm(noise, x * 0.017 + 40, z * 0.017, 3) * 1.6 - 0.6);
      const k = 0.82 + n * 0.32;
      colors[i * 3] = k * (1 + dry * 0.25);
      colors[i * 3 + 1] = k;
      colors[i * 3 + 2] = k * (1 - dry * 0.2);
      pos.setY(i, hillHeight(x, z));
    }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    const ground = new Mesh(g, M.grass);
    ground.receiveShadow = shadows;
    world.add(ground);
    disposables.push(g);
  }

  /* ------------------------------ the paths ------------------------------ */
  const cavePath = smoothPath(CAVE_PATH, 6);
  const forgePath = smoothPath(FORGE_PATH, 6);
  for (const [pts, w] of [[cavePath, 3.2], [forgePath, 2.8]]) {
    const geo = pathGeometry(pts, w, 0.02);
    const m = new Mesh(geo, M.dirt);
    m.receiveShadow = shadows;
    world.add(m);
    disposables.push(geo);
  }
  // stepping stones where each path leaves the circle
  {
    const rng = makeRng(14);
    for (const [pts, w] of [[cavePath, 3.2], [forgePath, 2.8]]) {
      for (let i = 2; i < pts.length - 2; i += 3) {
        const [x, z] = pts[i];
        if (Math.hypot(x, z) < 5.4) continue;
        const r = 0.22 + rng() * 0.2;
        const s = new Mesh(new CylinderGeometry(r, r * 1.1, 0.06, 7), M.rock);
        s.position.set(x + (rng() - 0.5) * w * 0.6, 0.03, z + (rng() - 0.5) * 0.6);
        s.rotation.y = rng() * 3;
        s.receiveShadow = shadows;
        world.add(s);
      }
    }
  }

  /* --------------------------- the stone circle --------------------------- */
  {
    const c = OW.circle;
    const top = new Mesh(new CircleGeometry(c.r, 64), M.circleTop);
    top.rotation.x = -Math.PI / 2;
    top.position.set(c.x, c.top, c.z);
    top.receiveShadow = shadows;
    top.userData.keep = true;
    world.add(top);
    const sideTex = bricksTex.clone();
    sideTex.repeat.set(10, 0.12);
    sideTex.needsUpdate = true;
    keep(sideTex);
    const sideMat = keep(new MeshLambertMaterial({ map: sideTex }));
    const side = new Mesh(new CylinderGeometry(c.r, c.r + 0.06, c.top, 64, 1, true), sideMat);
    side.position.set(c.x, c.top / 2, c.z);
    world.add(side);
    disposables.push(top.geometry, side.geometry);
    // four lanterns stand round it
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2;
      const x = Math.cos(a) * 5.7, z = Math.sin(a) * 5.7;
      lampPost(x, z, 1.7);
    }
  }

  function lampPost(x, z, h = 2.2) {
    box(0.14, h, 0.14, M.darkWood, x, h / 2, z);
    box(0.4, 0.06, 0.14, M.darkWood, x, h - 0.05, z);
    box(0.24, 0.3, 0.24, M.iron, x, h + 0.12, z);
    const glass = box(0.18, 0.22, 0.18, M.lantern, x, h + 0.12, z, { cast: false });
    glass.userData.keep = true;
    box(0.3, 0.05, 0.3, M.iron, x, h + 0.29, z);
    col.circle(x, z, 0.16, { h, camera: false });
  }

  /* -------------------------------- signpost ------------------------------ */
  {
    const x = -2.7, z = -6.4;
    box(0.16, 2.4, 0.16, M.beam, x, 1.2, z);
    const cap = new Mesh(new ConeGeometry(0.15, 0.16, 4), M.darkWood);
    cap.rotation.y = Math.PI / 4;
    cap.position.set(x, 2.48, z);
    world.add(cap);
    col.circle(x, z, 0.15, { h: 2.4, camera: false });
    /**
     * A board cut to an arrow, its point the way it says: one solid plank
     * with the point on the end of it, lettered on both faces so it reads
     * from either side.
     */
    const arrow = (text, y, ry) => {
      const body = 1.0, tip = 0.3, h = 0.38, depth = 0.06, L = body + tip;
      const shape = new Shape();
      shape.moveTo(0, -h / 2); shape.lineTo(body, -h / 2); shape.lineTo(L, 0);
      shape.lineTo(body, h / 2); shape.lineTo(0, h / 2); shape.closePath();
      const geo = new ExtrudeGeometry(shape, { depth, bevelEnabled: false });
      geo.translate(0.07, 0, -depth / 2);
      // The two faces come first, back then front, then the edges: give each
      // face its own lettering, and the edges plain wood.
      const pos = geo.attributes.position, uv = geo.attributes.uv;
      const [faces, edges] = geo.groups;
      for (let i = faces.start; i < faces.start + faces.count; i++) {
        uv.setXY(i, (pos.getX(i) - 0.07) / L, (pos.getY(i) + h / 2) / h);
      }
      for (let i = edges.start; i < edges.start + edges.count; i++) {
        uv.setXY(i, (pos.getX(i) + pos.getY(i)) / 0.9, (pos.getZ(i) + depth) / 0.9);
      }
      const half = faces.count / 2;
      geo.clearGroups();
      geo.addGroup(faces.start, half, 0);
      geo.addGroup(faces.start + half, half, 1);
      geo.addGroup(edges.start, edges.count, 2);
      const back = keep(new MeshLambertMaterial({ map: keep(arrowSignTexture(text, body / L, true)) }));
      const front = keep(new MeshLambertMaterial({ map: keep(arrowSignTexture(text, body / L, false)) }));
      const board = new Mesh(geo, [back, front, M.wood]);
      board.position.set(x, y, z);
      board.rotation.y = ry;
      board.castShadow = shadows;
      board.userData.keep = true;
      world.add(board);
      disposables.push(geo);
    };
    // +X of each board points the way it says: north is -Z, west is -X
    arrow('Cave', 2.05, Math.PI / 2);
    arrow('Forge', 1.6, Math.PI);
  }

  /* -------------------------------- lamp posts ---------------------------- */
  for (const [x, z] of [[2.6, -14], [-2.4, -26], [2.4, -36], [-11, -6.6], [-17.5, -2.7]]) lampPost(x, z);

  /* -------------------------------- the forge ----------------------------- */
  const forge = buildForge();

  function buildForge() {
    const f = OW.forge;
    const cx = (f.minX + f.maxX) / 2, cz = (f.minZ + f.maxZ) / 2;
    const W = f.maxX - f.minX, D = f.maxZ - f.minZ;
    const eave = 3.4, ridge = 5.3;
    // floor
    box(W + 0.4, f.floor, D + 0.4, M.floor, cx, f.floor / 2, cz, { tile: 1.6 });
    // back wall with the chimney, half walls on the sides
    box(0.6, eave, D, M.stone, f.minX + 0.3, eave / 2 + f.floor, cz, { tile: 1.4 });
    col.box(f.minX + 0.3, cz, 0.3, D / 2, { h: eave + 2 });
    const halfW = f.maxX - 2.5 - f.minX;
    for (const z of [f.minZ + 0.2, f.maxZ - 0.2]) {
      box(halfW, 1.1, 0.4, M.stone, f.minX + halfW / 2, 0.55 + f.floor, z, { tile: 1.2 });
      col.box(f.minX + halfW / 2, z, halfW / 2, 0.2, { h: 1.25 });
    }
    // posts and beams
    const posts = [[f.maxX - 0.2, f.minZ + 0.2], [f.maxX - 0.2, f.maxZ - 0.2], [f.maxX - 2.5, f.minZ + 0.2], [f.maxX - 2.5, f.maxZ - 0.2],
      [f.minX + 0.3, f.minZ + 0.2], [f.minX + 0.3, f.maxZ - 0.2]];
    for (const [x, z] of posts) {
      box(0.3, eave, 0.3, M.beam, x, eave / 2 + f.floor, z);
      col.circle(x, z, 0.2, { h: eave });
    }
    box(0.32, 0.3, D + 0.3, M.beam, f.maxX - 0.2, eave + f.floor, cz);
    for (const z of [f.minZ + 0.2, f.maxZ - 0.2]) box(W, 0.3, 0.32, M.beam, cx, eave + f.floor, z);
    // the roof: two pitched planes, and the gable ends; it fades out while you are under it
    const roof = new Group();
    world.add(roof);
    const run = D / 2 + 0.4, rise = ridge - eave;
    const len = Math.hypot(run, rise), ang = Math.atan2(rise, run);
    for (const s of [-1, 1]) {
      const plane = new Mesh(tiledBox(W + 0.9, 0.12, len, 1.4), M.roof);
      plane.position.set(cx, eave + f.floor + rise / 2 + 0.06, cz + s * run / 2);
      plane.rotation.x = s * ang;
      plane.castShadow = shadows;
      roof.add(plane);
      disposables.push(plane.geometry);
    }
    const gable = new Shape();
    gable.moveTo(-D / 2, 0); gable.lineTo(D / 2, 0); gable.lineTo(0, rise); gable.closePath();
    const gGeo = new ShapeGeometry(gable);
    const uv = gGeo.attributes.uv, gp = gGeo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, gp.getX(i) / 2, gp.getY(i) / 2);
    disposables.push(gGeo);
    for (const x of [f.minX + 0.05, f.maxX - 0.05]) {
      const gm = new Mesh(gGeo, M.roofWood);
      gm.position.set(x, eave + f.floor + 0.15, cz);
      gm.rotation.y = Math.PI / 2;
      roof.add(gm);
    }
    box(W + 1, 0.22, 0.22, M.beam, cx, ridge + f.floor + 0.08, cz, { parent: roof });
    // chimney, through the roof
    box(1.0, ridge + 1.6 - eave, 1.25, M.stone, f.minX + 0.6, eave + f.floor + (ridge + 1.6 - eave) / 2, cz - 1.4, { tile: 1.2 });

    // the hearth: a stone bed of coals, a hood above it, bellows to one side
    const hx = f.minX + 1.25, hz = cz - 1.4;
    box(1.5, 0.8, 2.1, M.stone, hx, f.floor + 0.4, hz, { tile: 1 });
    box(1.3, 0.06, 1.8, M.coal, hx + 0.02, f.floor + 0.83, hz);
    const coalRng = makeRng(8);
    for (let i = 0; i < 18; i++) {
      const lump = new Mesh(new IcosahedronGeometry(0.08 + coalRng() * 0.06, 0), coalRng() < 0.55 ? M.ember : M.coal);
      lump.position.set(hx + (coalRng() - 0.5) * 1.1, f.floor + 0.88, hz + (coalRng() - 0.5) * 1.5);
      lump.rotation.set(coalRng() * 3, coalRng() * 3, 0);
      world.add(lump);
    }
    const hood = new Mesh(new CylinderGeometry(0.55, 1.15, 1.2, 4, 1), M.stone);
    hood.rotation.y = Math.PI / 4;
    hood.scale.set(0.95, 1, 1.2);
    hood.position.set(hx, f.floor + 2.65, hz);
    hood.castShadow = shadows;
    world.add(hood);
    disposables.push(hood.geometry);
    col.box(hx, hz, 0.78, 1.08, { h: 3.4 });
    // bellows
    const bel = new Group();
    bel.position.set(hx + 0.1, f.floor + 0.35, hz + 1.55);
    world.add(bel);
    box(0.7, 0.08, 0.45, M.wood, 0, 0.2, 0, { parent: bel });
    box(0.7, 0.08, 0.45, M.wood, 0, -0.05, 0, { parent: bel });
    box(0.6, 0.2, 0.4, M.leather, 0, 0.08, 0, { parent: bel });
    cyl(0.04, 0.05, 0.4, M.iron, 0.5, 0.08, 0, { parent: bel }).rotation.z = Math.PI / 2;
    for (const z of [-0.18, 0.18]) box(0.08, 0.35, 0.08, M.darkWood, -0.25, -0.17, z, { parent: bel });
    col.box(hx + 0.1, hz + 1.55, 0.4, 0.3, { h: 0.6 });

    // flames over the coals
    const flameTex = keep(flameTexture(64));
    const flames = [];
    for (let i = 0; i < 5; i++) {
      const sp = new Sprite(new SpriteMaterial({ map: flameTex, blending: AdditiveBlending, depthWrite: false, color: 0xffb070 }));
      sp.position.set(hx + (i % 2 ? 0.25 : -0.25) * (i > 2 ? 1 : 0.4), f.floor + 1.12, hz - 0.6 + i * 0.3);
      sp.userData.base = 0.45 + (i % 3) * 0.1;
      sp.userData.phase = i * 1.7;
      world.add(sp);
      flames.push(sp);
      disposables.push(sp.material);
    }
    const fire = new PointLight(0xff8a3a, 14, 11, 1.6);
    fire.position.set(hx + 0.4, f.floor + 1.5, hz);
    world.add(fire);

    // the anvil, on a stump
    const A = OW.anvil;
    const anvil = new Group();
    anvil.position.set(A.x, f.floor, A.z);
    world.add(anvil);
    const stump = cyl(0.34, 0.4, 0.46, M.beam, 0, 0.23, 0, { seg: 10, parent: anvil });
    stump.userData.keep = true;
    const anvilBody = [
      box(0.34, 0.1, 0.44, M.iron, 0, 0.51, 0, { parent: anvil }),
      box(0.2, 0.16, 0.3, M.iron, 0, 0.64, 0, { parent: anvil }),
      box(0.38, 0.14, 0.62, M.iron, 0, 0.79, -0.02, { parent: anvil }),
      box(0.4, 0.025, 0.6, M.darkIron, 0, 0.872, -0.02, { parent: anvil }),
    ];
    const horn = new Mesh(new ConeGeometry(0.12, 0.42, 8), M.iron);
    horn.rotation.x = Math.PI / 2;
    horn.scale.set(1, 1, 0.75);
    horn.position.set(0, 0.8, 0.48);
    horn.castShadow = shadows;
    anvil.add(horn);
    disposables.push(horn.geometry);
    for (const m of anvilBody) m.userData.keep = true;
    col.circle(A.x, A.z, 0.42, { h: 1.0 });
    const anvilTop = new Vector3(A.x, f.floor + 0.9, A.z - 0.02);

    // the lava bucket, hung from a little gantry over the sword mould
    const L = OW.mold;
    const gantry = new Group();
    gantry.position.set(L.x, f.floor, L.z);
    world.add(gantry);
    // pedestal and the mould on it, the sword cut into its top
    box(0.6, 0.6, 1.25, M.stone, 0, 0.3, 0, { parent: gantry, tile: 0.7 });
    box(0.5, 0.12, 1.1, M.darkIron, 0, 0.66, 0, { parent: gantry });
    const swordShape = new Shape();
    swordShape.moveTo(0, -0.46); swordShape.lineTo(0.035, -0.38); swordShape.lineTo(0.035, 0.18);
    swordShape.lineTo(0.12, 0.18); swordShape.lineTo(0.12, 0.23); swordShape.lineTo(0.025, 0.23);
    swordShape.lineTo(0.025, 0.36); swordShape.lineTo(0.05, 0.4); swordShape.lineTo(-0.05, 0.4);
    swordShape.lineTo(-0.025, 0.36); swordShape.lineTo(-0.025, 0.23); swordShape.lineTo(-0.12, 0.23);
    swordShape.lineTo(-0.12, 0.18); swordShape.lineTo(-0.035, 0.18); swordShape.lineTo(-0.035, -0.38);
    swordShape.closePath();
    const cutGeo = new ShapeGeometry(swordShape);
    disposables.push(cutGeo);
    const cut = new Mesh(cutGeo, M.black);
    cut.rotation.x = -Math.PI / 2;
    cut.position.y = 0.722;
    gantry.add(cut);
    const moldLava = new Mesh(cutGeo, M.lava);
    moldLava.rotation.x = -Math.PI / 2;
    moldLava.position.y = 0.724;
    moldLava.scale.set(0.001, 0.001, 1);
    gantry.add(moldLava);
    // posts and crossbar
    for (const z of [-0.72, 0.72]) box(0.12, 2.3, 0.12, M.beam, 0, 1.15, z, { parent: gantry });
    box(0.14, 0.14, 1.6, M.beam, 0, 2.3, 0, { parent: gantry });
    // the bucket swings from a chain; pour = turn it on its pivot
    const pivot = new Group();
    pivot.position.set(0, 2.2, 0);
    gantry.add(pivot);
    const chain = cyl(0.015, 0.015, 0.45, M.chain, 0, -0.22, 0, { seg: 5, parent: pivot });
    chain.userData.keep = true;
    const bucket = new Group();
    bucket.position.y = -0.45;
    pivot.add(bucket);
    const pail = new Mesh(new CylinderGeometry(0.22, 0.17, 0.36, 14, 1, true),
      keep(new MeshPhongMaterial({ color: 0x24272b, specular: 0x55595e, shininess: 30, side: DoubleSide })));
    pail.position.y = -0.2;
    bucket.add(pail);
    const pailBase = cyl(0.17, 0.17, 0.03, M.darkIron, 0, -0.37, 0, { parent: bucket });
    const handle = new Mesh(new TorusGeometry(0.21, 0.012, 5, 16, Math.PI), M.chain);
    handle.position.y = -0.03;
    bucket.add(handle);
    const lavaTop = new Mesh(new CircleGeometry(0.2, 14), M.lava);
    lavaTop.rotation.x = -Math.PI / 2;
    lavaTop.position.y = -0.06;
    bucket.add(lavaTop);
    for (const m of [pail, handle, lavaTop, pailBase]) m.userData.keep = true;
    disposables.push(pail.geometry, handle.geometry, lavaTop.geometry);
    // the stream of lava a pour makes, hidden until then
    const stream = new Mesh(new CylinderGeometry(0.035, 0.05, 1, 8), M.lava);
    stream.visible = false;
    stream.userData.keep = true;
    gantry.add(stream);
    disposables.push(stream.geometry);
    col.box(L.x, L.z, 0.35, 0.82, { h: 2.4 });
    const lavaGlow = new PointLight(0xff6a20, 2.5, 3.5, 1.8);
    lavaGlow.position.set(0, 1.45, 0);
    gantry.add(lavaGlow);

    // the water bucket for quenching
    const Wt = OW.water;
    const wb = new Group();
    wb.position.set(Wt.x, f.floor, Wt.z);
    world.add(wb);
    const tub = new Mesh(new CylinderGeometry(0.34, 0.28, 0.52, 16, 1, true), M.wood);
    tub.material = M.wood;
    tub.position.y = 0.26;
    tub.castShadow = shadows;
    const tubIn = new Mesh(new CylinderGeometry(0.32, 0.26, 0.5, 16, 1, true), M.darkWood);
    tubIn.material = new MeshLambertMaterial({ color: 0x4a2e18, side: BackSide });
    tubIn.position.y = 0.26;
    keep(tubIn.material);
    wb.add(tub, tubIn);
    cyl(0.28, 0.28, 0.03, M.darkWood, 0, 0.015, 0, { parent: wb });
    for (const y of [0.1, 0.42]) {
      const band = new Mesh(new TorusGeometry(0.31 + (y > 0.2 ? 0.025 : 0), 0.014, 4, 20), M.iron);
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      wb.add(band);
      disposables.push(band.geometry);
    }
    const water = new Mesh(new CircleGeometry(0.32, 18), M.water);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.45;
    wb.add(water);
    for (const m of [tub, tubIn, water]) m.userData.keep = true;
    disposables.push(tub.geometry, tubIn.geometry, water.geometry);
    col.circle(Wt.x, Wt.z, 0.36, { h: 0.6 });

    // workbench along the south wall, tools and bars on it
    const bx = f.minX + 3.8, bz = f.maxZ - 0.75;
    box(2.2, 0.08, 0.7, M.wood, bx, f.floor + 0.92, bz);
    for (const [dx, dz] of [[-1, -0.28], [1, -0.28], [-1, 0.28], [1, 0.28]]) box(0.08, 0.9, 0.08, M.darkWood, bx + dx, f.floor + 0.45, bz + dz);
    box(0.4, 0.05, 0.05, M.darkWood, bx - 0.4, f.floor + 0.98, bz, { ry: 0.3 });
    box(0.14, 0.08, 0.07, M.iron, bx - 0.25, f.floor + 0.99, bz - 0.04, { ry: 0.3 });
    // tongs
    for (const s of [-1, 1]) box(0.5, 0.02, 0.025, M.darkIron, bx + 0.35, f.floor + 0.975, bz + 0.12 + s * 0.02, { ry: -0.2 + s * 0.05 });
    // ingots
    const ingots = [['iron', 0.6], ['bronze', 0.75], ['gold', 0.9]];
    for (const [ore, dx] of ingots) {
      const ig = new Mesh(new BoxGeometry(0.12, 0.05, 0.24), oreMaterial(ore));
      ig.position.set(bx + dx, f.floor + 0.985, bz - 0.12);
      ig.castShadow = shadows;
      ig.userData.keep = true;
      world.add(ig);
    }
    col.box(bx, bz, 1.12, 0.37, { h: 1.0 });

    // weapon rack along the north wall
    const rx = f.minX + 3.6, rz = f.minZ + 0.65;
    box(2.0, 0.1, 0.3, M.darkWood, rx, f.floor + 0.18, rz);
    box(2.0, 0.08, 0.12, M.darkWood, rx, f.floor + 1.25, rz - 0.06);
    for (const dx of [-0.95, 0.95]) box(0.1, 1.4, 0.3, M.darkWood, rx + dx, f.floor + 0.7, rz);
    const racked = [['sword', ['iron', 'bronze', 'stone']], ['broadsword', ['iron', 'iron', 'gold']], ['dagger', ['bronze', 'stone', 'stone']], ['sword', ['stone', 'stone', 'bronze']]];
    racked.forEach(([type, parts], i) => {
      const wpn = buildWeapon(type, parts);
      wpn.position.set(rx - 0.65 + i * 0.43, f.floor + 0.3, rz + 0.02);
      wpn.rotation.z = 0.05;
      wpn.rotation.x = -0.12;
      wpn.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      world.add(wpn);
      flatten(wpn, world);
    });
    col.box(rx, rz, 1.05, 0.25, { h: 1.6 });

    // a grindstone at the front, by the posts
    const gx = f.maxX - 1.3, gz = f.minZ + 1.2;
    const wheel = new Mesh(new CylinderGeometry(0.42, 0.42, 0.14, 18), new MeshLambertMaterial({ map: rockTex, color: 0xd9cfbe }));
    keep(wheel.material);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(gx, f.floor + 0.72, gz);
    wheel.castShadow = shadows;
    wheel.userData.keep = true;
    world.add(wheel);
    disposables.push(wheel.geometry);
    for (const dz of [-0.14, 0.14]) box(0.08, 0.75, 0.06, M.darkWood, gx, f.floor + 0.37, gz + dz);
    box(0.7, 0.06, 0.4, M.darkWood, gx, f.floor + 0.12, gz);
    col.circle(gx, gz, 0.45, { h: 1.2 });

    // barrels, crates and a heap of coal in the corners
    const barrel = (x, z) => {
      const b = cyl(0.34, 0.3, 0.85, M.wood, x, f.floor + 0.425, z, { seg: 14 });
      b.userData.keep = true;
      for (const y of [0.15, 0.7]) {
        const band = new Mesh(new TorusGeometry(0.335, 0.015, 4, 18), M.iron);
        band.rotation.x = Math.PI / 2;
        band.position.set(x, f.floor + y, z);
        world.add(band);
        disposables.push(band.geometry);
      }
      cyl(0.3, 0.3, 0.02, M.darkWood, x, f.floor + 0.86, z);
      col.circle(x, z, 0.36, { h: 0.9 });
    };
    barrel(f.minX + 0.95, f.minZ + 0.95);
    barrel(f.minX + 1.75, f.minZ + 0.85);
    box(0.7, 0.7, 0.7, M.wood, f.minX + 1.0, f.floor + 0.35, f.maxZ - 0.95, { tile: 0.7 });
    box(0.5, 0.5, 0.5, M.wood, f.minX + 1.05, f.floor + 0.95, f.maxZ - 0.95, { ry: 0.4, tile: 0.5 });
    col.box(f.minX + 1.0, f.maxZ - 0.95, 0.4, 0.4, { h: 1.2 });
    const heap = new Mesh(new ConeGeometry(0.55, 0.45, 9), M.coal);
    heap.position.set(f.minX + 1.1, f.floor + 0.22, cz + 0.85);
    world.add(heap);
    disposables.push(heap.geometry);
    col.circle(f.minX + 1.1, cz + 0.85, 0.48, { h: 0.5 });

    // a board over the open front that says what this is
    const signTex = keep(signTexture('Forge', 448, 160));
    const signFace = keep(new MeshLambertMaterial({ map: signTex }));
    const sign = new Group();
    sign.position.set(f.maxX + 0.05, eave + f.floor - 0.1, cz);
    world.add(sign);
    for (const z of [-0.6, 0.6]) {
      const ch = new Mesh(new CylinderGeometry(0.012, 0.012, 0.4, 4), M.chain);
      ch.position.set(0, -0.2, z);
      sign.add(ch);
      disposables.push(ch.geometry);
    }
    const board = new Mesh(new BoxGeometry(0.07, 0.5, 1.45), [signFace, signFace, M.wood, M.wood, M.wood, M.wood]);
    board.position.y = -0.62;
    board.castShadow = shadows;
    sign.add(board);
    disposables.push(board.geometry);

    // the static bits that were easier to build as groups, folded into the rest
    for (const g of [wb, bel, sign]) flatten(g, world);

    return {
      anvil, anvilTop, flames, fire, roof, lavaGlow,
      bucket: pivot, tipper: bucket, stream, moldLava, moldTop: new Vector3(L.x, f.floor + 0.73, L.z),
      bucketLip: new Vector3(L.x, f.floor + 1.6, L.z),
      waterTop: new Vector3(Wt.x, f.floor + 0.46, Wt.z),
      chimneyTop: new Vector3(f.minX + 0.6, ridge + f.floor + 1.7, cz - 1.4),
      hearth: new Vector3(hx, f.floor + 1.0, hz),
      center: new Vector3(cx, 0, cz),
    };
  }

  /* --------------------------- the cliff and cave ------------------------- */
  const cave = buildCaveMouth();

  function buildCaveMouth() {
    const C = OW.cave;
    const rng = makeRng(61);
    const tunnelEnd = C.mouthZ - 12.4;
    // The cliff: big lumps of rock shouldered up against each other. None of
    // them may reach into the tunnel, or it would show through its walls, so
    // any that would is moved sideways until it clears.
    const lumps = [];
    for (let x = -80; x <= 80; x += 7 + rng() * 3) {
      lumps.push([x, -56 - rng() * 3, 6 + rng() * 4, 1.2 + rng() * 0.8, 0]);
    }
    lumps.push([-6.4, -47.6, 2.9, 1.35, 0], [6.4, -47.6, 2.9, 1.25, 0]);
    // and one sat on top of the tunnel, over the mouth
    lumps.push([0, -52, 6, 1.3, 5.25]);
    for (const L of lumps) {
      const [x, z, r, , y0] = L;
      const rx = r * 1.25;
      if (y0 > 0) continue;
      if (z + r > tunnelEnd && z - r < C.mouthZ + 0.5 && Math.abs(x) - rx < C.half + 0.45) {
        L[0] = (x < 0 ? -1 : 1) * (C.half + 0.45 + rx);
      }
    }
    for (const [x, z, r, sy, y0] of lumps) {
      const geo = rockGeometry(r, { seed: (x * 13 + z * 7) | 0, detail: r > 3 ? 2 : 1, squash: 1, rough: 0.22, flatBase: !!y0 });
      const m = new Mesh(geo, M.cliff);
      m.position.set(x, y0 || -r * 0.35, z);
      m.scale.set(1.25, sy, 1);
      m.castShadow = shadows && r < 5;
      m.receiveShadow = shadows;
      world.add(m);
      disposables.push(geo);
      if (z + r > C.mouthZ - 1.5 && !y0) col.circle(x, z, r * 1.12, { h: 20 });
    }
    // boulders at the foot of the cliff
    for (const [x, z, r] of [[-4.7, -44.4, 0.95], [5.0, -44.3, 0.85], [-8.4, -44.9, 1.4], [9.0, -45.0, 1.6], [-14, -45.2, 1.2], [15.5, -45.4, 1.3]]) {
      const geo = rockGeometry(r, { seed: (x * 17) | 0, detail: 1 });
      const m = new Mesh(geo, M.cliff);
      m.position.set(x, -0.05, z);
      m.rotation.y = rng() * 6;
      m.castShadow = shadows;
      m.receiveShadow = shadows;
      world.add(m);
      disposables.push(geo);
      col.circle(x, z, r * 0.95, { h: r * 1.4 });
    }
    // The face of the cliff: one sheet of rock along its whole foot, with the
    // mouth cut out of it to the tunnel's exact size, so there is nowhere
    // beside the frame or over it to see through. It only ever bulges back,
    // away from you, and it is flat where it meets the tunnel.
    {
      const noise = valueNoise2D(77);
      const z0 = C.mouthZ - 0.15, hx = C.half + 0.15, hy = 4.62;
      const xs = [];
      for (let x = -44; x <= 36.01; x += 0.8) if (Math.abs(Math.abs(x) - hx) > 0.2) xs.push(x);
      xs.push(-hx, hx);
      xs.sort((a, b) => a - b);
      const top = (x) => 9.5 + fbm(noise, x * 0.045 + 7, 3.1, 3) * 6 - Math.max(0, 6 - Math.abs(x)) * 0.1;
      const rowsLow = 8, rowsHigh = 9;
      const pos = [], uv = [], colr = [], idx = [];
      for (let j = 0; j <= rowsLow + rowsHigh; j++) {
        for (const x of xs) {
          const y = j <= rowsLow ? -0.6 + (hy + 0.6) * (j / rowsLow) : hy + (top(x) - hy) * ((j - rowsLow) / rowsHigh);
          // how far it may bulge back: nothing at the edge of the mouth
          const edge = Math.max(Math.abs(x) - hx, y - hy, 0);
          const nearMouth = Math.abs(x) < hx + 1.2 && y < hy + 1.2 ? Math.min(1, edge / 1.0) : 1;
          const d = (0.2 + fbm(noise, x * 0.32, y * 0.32, 4) * 1.3) * nearMouth;
          pos.push(x, y, z0 - d);
          uv.push(x / 3, y / 3);
          const k = (0.7 + 0.3 * (1 - d / 1.5)) * (0.82 + fbm(noise, x * 0.8 + 3, y * 0.8, 2) * 0.3);
          const moss = Math.max(0, 1 - y / 1.4) * 0.25;
          colr.push(k * (1 - moss * 0.4), k, k * (1 - moss * 0.6));
        }
      }
      const row = xs.length;
      for (let j = 0; j < rowsLow + rowsHigh; j++) {
        for (let i = 0; i < row - 1; i++) {
          const xc = (xs[i] + xs[i + 1]) / 2;
          if (j < rowsLow && Math.abs(xc) < hx) continue;          // the mouth itself
          const a = j * row + i, b = a + 1, c2 = a + row, d2 = c2 + 1;
          idx.push(a, b, d2, a, d2, c2);
        }
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
      geo.setAttribute('color', new Float32BufferAttribute(colr, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const face = new Mesh(geo, M.cliffFace);
      face.receiveShadow = shadows;
      face.userData.keep = true;
      world.add(face);
      disposables.push(geo);
    }
    // mountains behind it
    for (let i = 0; i < 9; i++) {
      const x = -90 + i * 22 + (rng() - 0.5) * 10;
      const h = 26 + rng() * 22;
      const geo = new ConeGeometry(16 + rng() * 10, h, 7, 3);
      const p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) {
        if (p.getY(k) > h / 2 - 0.01) continue;
        p.setX(k, p.getX(k) * (0.85 + rng() * 0.3));
        p.setZ(k, p.getZ(k) * (0.85 + rng() * 0.3));
      }
      geo.computeVertexNormals();
      const m = new Mesh(geo, M.cliff);
      m.position.set(x, h / 2 - 2, -78 - rng() * 20);
      world.add(m);
      disposables.push(geo);
    }

    // the tunnel into the dark: rock that gets blacker the deeper it goes
    const depth = 12, H = 4.6, hw = C.half + 0.1, z0 = C.mouthZ - 0.15;
    const tunnelPart = (w, h, d, x, y, z) => {
      const g = tiledBox(w, h, d, 1.6);
      const p = g.attributes.position;
      const c = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const wz = z + p.getZ(i);
        const k = clamp01(1 - (z0 - wz) / (depth * 0.55));
        const v = 0.05 + 0.75 * k * k;
        c[i * 3] = v; c[i * 3 + 1] = v * 0.95; c[i * 3 + 2] = v * 0.9;
      }
      g.setAttribute('color', new Float32BufferAttribute(c, 3));
      const m = new Mesh(g, M.tunnel);
      m.position.set(x, y, z);
      m.receiveShadow = shadows;
      m.userData.keep = true;
      world.add(m);
      disposables.push(g);
      return m;
    };
    const zc = z0 - depth / 2;
    tunnelPart(0.6, H, depth, -hw - 0.3, H / 2, zc);
    tunnelPart(0.6, H, depth, hw + 0.3, H / 2, zc);
    tunnelPart(hw * 2 + 1.2, 0.6, depth, 0, H + 0.3, zc);
    tunnelPart(hw * 2, 0.04, depth, 0, 0.01, zc);
    const end = new Mesh(new PlaneGeometry(hw * 2, H), M.black);
    end.position.set(0, H / 2, z0 - depth + 0.1);
    world.add(end);
    disposables.push(end.geometry);

    // the timber frame round the mouth
    const fz = C.mouthZ + 0.05;
    for (const sx of [-1, 1]) {
      box(0.34, 5.0, 0.34, M.beam, sx * (C.half + 0.32), 2.5, fz);
      box(0.2, 1.3, 0.2, M.beam, sx * (C.half - 0.15), 4.35, fz + 0.02, { rz: sx * 0.75 });
    }
    box(6.2, 0.42, 0.42, M.beam, 0, 5.05, fz);
    // a torch on the front of each post, leaning out towards you
    const flameTex = keep(flameTexture(64));
    const pitch = keep(new MeshLambertMaterial({ color: 0x23150b, emissive: 0x3e1604 }));
    const torches = [];
    for (const sx of [-1, 1]) {
      const { flame } = addTorch(world, { x: sx * (C.half + 0.32), y: 2.42, z: fz + 0.17 }, { x: 0, z: 1 },
        { wood: M.darkWood, iron: M.iron, pitch, flameTex, disposables });
      flame.userData.phase = sx * 2;
      torches.push(flame);
    }

    // the sign: hung from the lintel on two chains, swinging a little
    const signTex = keep(signTexture('Cave', 512, 192));
    const face = keep(new MeshLambertMaterial({ map: signTex }));
    const sign = new Group();
    sign.position.set(0, 4.82, fz + 0.12);
    world.add(sign);
    for (const sx of [-0.78, 0.78]) {
      for (let k = 0; k < 4; k++) {
        const link = new Mesh(new TorusGeometry(0.045, 0.012, 4, 8), M.chain);
        link.position.set(sx, -0.08 - k * 0.12, 0);
        link.rotation.y = k % 2 ? Math.PI / 2 : 0;
        sign.add(link);
        disposables.push(link.geometry);
      }
    }
    const board = new Mesh(new BoxGeometry(2.2, 0.8, 0.09), [M.wood, M.wood, M.wood, M.wood, face, face]);
    board.position.y = -0.95;
    board.castShadow = shadows;
    sign.add(board);
    disposables.push(board.geometry);

    return { sign, torches };
  }

  /* ---------------------------- the pickaxe wall --------------------------- */
  const pickWall = buildPickaxeWall();

  /**
   * A timber wall by the cave mouth with every pickaxe for sale hung on
   * pegs, a price under each. The timber is folded into the world like any
   * other prop; the pickaxes and their tags stay loose, because inspecting
   * one takes it down off its pegs, and buying one changes its tag.
   */
  function buildPickaxeWall() {
    const Wd = OW.wall;
    const types = Object.keys(PICKAXES);
    const width = Math.max(2.8, types.length * 1.2 + 0.8);
    const frame = new Group();
    frame.position.set(Wd.x, 0, Wd.z);
    frame.rotation.y = Wd.yaw;
    world.add(frame);
    const plankTex = keep(woodTexture(256, { seed: 14, planks: 5, vertical: true, base: [150, 104, 60] }));
    const planks = keep(new MeshLambertMaterial({ map: plankTex }));
    const shingle = keep(new MeshLambertMaterial({ map: roofTex }));
    const half = width / 2;
    // posts, boards, rails, and a little roof to keep the rain off
    for (const sx of [-1, 1]) box(0.18, 3.05, 0.18, M.beam, sx * (half + 0.05), 1.52, -0.05, { parent: frame });
    box(width, 1.95, 0.08, planks, 0, 1.2, -0.04, { parent: frame, tile: 1.6 });
    box(width + 0.1, 0.12, 0.16, M.darkWood, 0, 0.2, 0, { parent: frame });
    box(width + 0.4, 0.18, 0.22, M.beam, 0, 2.27, 0, { parent: frame });
    const roofBoard = box(width + 0.8, 0.07, 1.0, shingle, 0, 3.1, 0.28, { parent: frame, tile: 1.2 });
    roofBoard.rotation.x = 0.32;
    // the name over it
    const signFace = keep(new MeshLambertMaterial({ map: keep(signTexture('Pickaxes', 512, 160)) }));
    const signBoard = new Mesh(new BoxGeometry(1.9, 0.56, 0.07), [M.wood, M.wood, M.wood, M.wood, signFace, M.wood]);
    signBoard.position.set(0, 2.7, 0.05);
    signBoard.castShadow = shadows;
    frame.add(signBoard);
    // a lantern on the left post, a barrel and a crate at the right end
    box(0.22, 0.28, 0.22, M.iron, -half - 0.05, 2.0, 0.2, { parent: frame });
    box(0.16, 0.2, 0.16, M.lantern, -half - 0.05, 2.0, 0.2, { parent: frame, cast: false });
    box(0.08, 0.08, 0.3, M.darkWood, -half - 0.05, 2.18, 0.08, { parent: frame });
    const bx = half + 0.5, bz = 0.35;
    cyl(0.32, 0.28, 0.8, M.wood, bx, 0.4, bz, { seg: 14, parent: frame });
    for (const y of [0.14, 0.66]) {
      const band = new Mesh(new TorusGeometry(0.315, 0.014, 4, 18), M.iron);
      band.rotation.x = Math.PI / 2;
      band.position.set(bx, y, bz);
      frame.add(band);
    }
    box(0.6, 0.6, 0.6, M.wood, bx + 0.15, 0.3, bz - 0.75, { parent: frame, ry: 0.3, tile: 0.6 });

    // the loose parts: a pickaxe on two pegs per slot, and its tag under it
    const live = new Group();
    live.position.copy(frame.position);
    live.rotation.copy(frame.rotation);
    world.add(live);
    const slots = {};
    types.forEach((type, i) => {
      const x = (i - (types.length - 1) / 2) * 1.2;
      for (const px of [-0.13, 0.13]) {
        const peg = new Mesh(new CylinderGeometry(0.022, 0.022, 0.2, 6), M.darkWood);
        peg.rotation.x = Math.PI / 2;
        peg.position.set(x + px, 1.4, 0.09);
        frame.add(peg);
      }
      const pick = buildPickaxe(type);
      const home = new Vector3(x, 0.8, 0.14);
      pick.position.copy(home);
      pick.traverse((o) => { if (o.isMesh) o.castShadow = shadows; });
      live.add(pick);
      // the tag: redrawn when the pickaxe changes hands
      const canvas = makeCanvas(256, 96);
      const tex = toTexture(canvas, { clamp: true });
      const tagMat = new MeshLambertMaterial({ map: tex });
      keep(tex, tagMat);
      const tag = new Mesh(new BoxGeometry(0.66, 0.24, 0.035), [M.wood, M.wood, M.wood, M.wood, tagMat, M.wood]);
      tag.position.set(x, 0.5, 0.04);
      tag.rotation.z = (i % 2 ? 1 : -1) * 0.04;
      live.add(tag);
      const nail = new Mesh(new CylinderGeometry(0.012, 0.012, 0.06, 5), M.chain);
      nail.rotation.x = Math.PI / 2;
      nail.position.set(x, 0.62, 0.06);
      frame.add(nail);
      const setTag = (text, color) => {
        drawPriceTag(canvas.getContext('2d'), 256, 96, text, color);
        tex.needsUpdate = true;
      };
      const p = PICKAXES[type];
      setTag(p.price ? '$' + p.price.toLocaleString('en-US') : 'FREE');
      slots[type] = { type, pick, home, setTag, k: 0, spin: 0 };
    });
    // a tap anywhere on the wall lands on this
    const hit = new Mesh(new BoxGeometry(width + 0.5, 3.3, 1.0), M.black);
    hit.position.set(0, 1.65, 0.2);
    hit.visible = false;
    live.add(hit);
    // the ground in front of it, trodden bare, and a way over from the path
    const n = new Vector3(Math.sin(Wd.yaw), 0, Math.cos(Wd.yaw));
    const r = new Vector3(Math.cos(Wd.yaw), 0, -Math.sin(Wd.yaw));
    const patchAt = new Vector3(Wd.x, 0, Wd.z).addScaledVector(n, 1.35);
    const patchGeo = new CircleGeometry(2.0, 24);
    patchGeo.rotateX(-Math.PI / 2);
    const pu = patchGeo.attributes.uv, pp = patchGeo.attributes.position;
    for (let k = 0; k < pu.count; k++) pu.setXY(k, (pp.getX(k) + patchAt.x) / 2.4, (pp.getZ(k) + patchAt.z) / 2.4);
    const patch = new Mesh(patchGeo, M.dirt);
    patch.position.set(patchAt.x, 0.018, patchAt.z);
    patch.receiveShadow = shadows;
    patch.userData.keep = true;
    world.add(patch);
    const spur = new Mesh(pathGeometry([[-1.2, -38.6], [-2.4, -38.95], [patchAt.x + 0.8, patchAt.z + 0.35]], 1.5, 0.019), M.dirt);
    spur.receiveShadow = shadows;
    spur.userData.keep = true;
    world.add(spur);
    disposables.push(patchGeo, spur.geometry, hit.geometry);
    col.box(Wd.x, Wd.z, half + 0.18, 0.2, { ry: Wd.yaw, h: 3.2 });
    const barrelAt = new Vector3(Wd.x, 0, Wd.z).addScaledVector(r, bx).addScaledVector(n, bz);
    col.circle(barrelAt.x, barrelAt.z, 0.36, { h: 0.9 });
    const crateAt = new Vector3(Wd.x, 0, Wd.z).addScaledVector(r, bx + 0.15).addScaledVector(n, bz - 0.75);
    col.circle(crateAt.x, crateAt.z, 0.4, { h: 0.7 });
    flatten(frame, world);

    return {
      group: live, hit, slots, width, normal: n, right: r,
      center: new Vector3(Wd.x, 1.35, Wd.z),
      /** where you stand to look the wall over: off its left end, out of the camera's way */
      standAt: new Vector3(Wd.x, 0, Wd.z).addScaledVector(r, -(half + 0.65)).addScaledVector(n, 0.95),
      /** which one is down off its pegs being looked at, or null */
      showing: null,
      /** The middle of a pickaxe as it is shown, in the world. */
      showPoint(type) {
        const s = slots[type];
        live.updateMatrixWorld();
        return live.localToWorld(new Vector3(s.home.x, s.home.y + 0.7, s.home.z + 0.55));
      },
    };
  }

  /* ------------------------- trees, bushes, fence ------------------------- */
  const free = (x, z, pad = 0) => {
    if (Math.hypot(x, z) < 8.5 + pad) return false;
    if (Math.hypot(x - OW.wall.x, z - OW.wall.z) < 4.3) return false;
    if (distToPolyline(x, z, cavePath) < 4 + pad) return false;
    if (distToPolyline(x, z, forgePath) < 3.6 + pad) return false;
    const f = OW.forge;
    if (x > f.minX - 3.5 - pad && x < f.maxX + 3.5 + pad && z > f.minZ - 3.5 - pad && z < f.maxZ + 3.5 + pad) return false;
    if (z < -41 - pad && z > -60) return false;
    return true;
  };
  {
    const rng = makeRng(101);
    const trees = [];
    const tryPlace = (x, z, inside) => {
      if (!free(x, z)) return;
      for (const t of trees) if ((t.x - x) ** 2 + (t.z - z) ** 2 < (inside ? 12 : 9)) return;
      trees.push({ x, z, s: 0.8 + rng() * 0.6, pine: rng() < 0.55, ry: rng() * 6.28, inside });
    };
    const B = OW.bounds;
    for (let i = 0; i < 400 && trees.length < 34; i++) tryPlace(lerp(B.minX + 1, B.maxX - 1, rng()), lerp(B.minZ + 5, B.maxZ - 1, rng()), true);
    for (let i = 0; i < 900 && trees.length < (low ? 80 : 130); i++) {
      const x = lerp(-80, 70, rng()), z = lerp(-44, 70, rng());
      if (x > B.minX - 2 && x < B.maxX + 2 && z < B.maxZ + 2) continue;
      tryPlace(x, z, false);
    }
    // three instanced meshes draw every tree there is
    const trunkGeo = new CylinderGeometry(0.16, 0.24, 2, 6);
    trunkGeo.translate(0, 1, 0);
    const pineGeo = mergeGeos([
      coneAt(1.5, 2.2, 2.4), coneAt(1.15, 1.9, 3.5), coneAt(0.75, 1.6, 4.5),
    ]);
    const leafGeo = mergeGeos([
      blobAt(1.35, 0, 3.1, 0, 3), blobAt(0.95, 0.75, 2.6, 0.3, 4), blobAt(0.9, -0.65, 2.75, -0.35, 5), blobAt(0.8, 0.1, 3.9, 0.1, 6),
    ]);
    const nPine = trees.filter((t) => t.pine).length, nLeaf = trees.length - nPine;
    const trunks = new InstancedMesh(trunkGeo, M.trunk, trees.length);
    const pines = new InstancedMesh(pineGeo, M.pine, Math.max(1, nPine));
    const leaves = new InstancedMesh(leafGeo, M.leaf, Math.max(1, nLeaf));
    const o = new Object3D();
    const tint = new Color();
    let ip = 0, il = 0;
    trees.forEach((t, i) => {
      o.position.set(t.x, hillHeight(t.x, t.z) - 0.1, t.z);
      o.rotation.set(0, t.ry, 0);
      o.scale.setScalar(t.s);
      o.updateMatrix();
      trunks.setMatrixAt(i, o.matrix);
      tint.setHSL(t.pine ? 0.33 : 0.27 + rng() * 0.05, 0.4 + rng() * 0.15, 0.75 + rng() * 0.25);
      if (t.pine) { pines.setMatrixAt(ip, o.matrix); pines.setColorAt(ip++, tint); }
      else { leaves.setMatrixAt(il, o.matrix); leaves.setColorAt(il++, tint); }
      // a tree trunk stops you, but the camera may swing past it
      if (t.inside) col.circle(t.x, t.z, 0.32 * t.s + 0.05, { h: 6, camera: false });
    });
    pines.count = nPine; leaves.count = nLeaf;
    for (const m of [trunks, pines, leaves]) {
      m.castShadow = shadows;
      m.receiveShadow = shadows;
      m.computeBoundingSphere();
      world.add(m);
    }
    disposables.push(trunkGeo, pineGeo, leafGeo);

    // bushes and flowers on the open ground
    const bushGeo = new IcosahedronGeometry(0.5, 0);
    bushGeo.translate(0, 0.3, 0);
    const bushes = new InstancedMesh(bushGeo, M.bush, 40);
    let nb = 0;
    for (let i = 0; i < 300 && nb < 40; i++) {
      const x = lerp(B.minX + 1, B.maxX - 1, rng()), z = lerp(B.minZ + 4, B.maxZ - 1, rng());
      if (!free(x, z, -1.6)) continue;
      o.position.set(x, 0, z);
      o.rotation.set(0, rng() * 6, 0);
      const s = 0.6 + rng() * 0.8;
      o.scale.set(s * 1.3, s, s * 1.1);
      o.updateMatrix();
      bushes.setMatrixAt(nb, o.matrix);
      bushes.setColorAt(nb++, tint.setHSL(0.28 + rng() * 0.06, 0.45, 0.7 + rng() * 0.3));
    }
    bushes.count = nb;
    bushes.castShadow = shadows;
    world.add(bushes);
    disposables.push(bushGeo);

    const flowerGeo = new BoxGeometry(0.08, 0.08, 0.08);
    flowerGeo.translate(0, 0.16, 0);
    const flowers = new InstancedMesh(flowerGeo, new MeshBasicMaterial({ color: 0xffffff }), 260);
    keep(flowers.material);
    const petal = ['#fff5f0', '#ffd84a', '#c88cff', '#ff8aa8', '#8ac4ff'];
    let nf = 0;
    for (let i = 0; i < 900 && nf < 260; i++) {
      const x = lerp(-34, 26, rng()), z = lerp(-38, 22, rng());
      if (!free(x, z, -2.4)) continue;
      o.position.set(x, 0, z);
      o.rotation.set(0, rng() * 3, 0);
      o.scale.setScalar(0.7 + rng() * 0.7);
      o.updateMatrix();
      flowers.setMatrixAt(nf, o.matrix);
      flowers.setColorAt(nf++, tint.set(petal[(rng() * petal.length) | 0]));
    }
    flowers.count = nf;
    world.add(flowers);
    disposables.push(flowerGeo);

    // grass tufts, as many as the phone can take
    const nTufts = quality.tufts;
    if (nTufts > 0) {
      const tex = keep(tuftTexture(64));
      const tm = keep(new MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: DoubleSide, color: 0xcfe0b0 }));
      const a = new PlaneGeometry(0.6, 0.42); a.translate(0, 0.21, 0);
      const b = a.clone(); b.rotateY(Math.PI / 2);
      const tuftGeo = mergeGeos([a, b]);
      // light the blades as if they were the ground, not walls
      const n = tuftGeo.attributes.normal;
      for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
      const tufts = new InstancedMesh(tuftGeo, tm, nTufts);
      let nt = 0;
      for (let i = 0; i < nTufts * 3 && nt < nTufts; i++) {
        const x = lerp(-38, 28, rng()), z = lerp(-42, 24, rng());
        if (Math.hypot(x, z) < 5.3) continue;
        if (Math.hypot(x - OW.wall.x, z - OW.wall.z) < 3.4) continue;
        if (distToPolyline(x, z, cavePath) < 1.8 || distToPolyline(x, z, forgePath) < 1.6) continue;
        const f = OW.forge;
        if (x > f.minX - 0.3 && x < f.maxX + 0.3 && z > f.minZ - 0.3 && z < f.maxZ + 0.3) continue;
        o.position.set(x, 0, z);
        o.rotation.set(0, rng() * 3, 0);
        o.scale.setScalar(0.7 + rng() * 0.8);
        o.updateMatrix();
        tufts.setMatrixAt(nt++, o.matrix);
      }
      tufts.count = nt;
      world.add(tufts);
      disposables.push(tuftGeo, a, b);
    }

    // a fence round the meadow
    const postGeo = new BoxGeometry(0.14, 1.1, 0.14);
    postGeo.translate(0, 0.55, 0);
    const fenceRuns = [
      [[B.minX - 0.4, B.maxZ + 0.4], [B.maxX + 0.4, B.maxZ + 0.4]],
      [[B.maxX + 0.4, B.maxZ + 0.4], [B.maxX + 0.4, -45]],
      [[B.minX - 0.4, -45], [B.minX - 0.4, B.maxZ + 0.4]],
    ];
    const postsAt = [];
    for (const [[ax, az], [bx, bz]] of fenceRuns) {
      const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 2.6);
      for (let i = 0; i <= n; i++) postsAt.push([lerp(ax, bx, i / n), lerp(az, bz, i / n)]);
      for (const y of [0.45, 0.85]) {
        const rail = box(len, 0.08, 0.06, M.wood, (ax + bx) / 2, y, (az + bz) / 2, { ry: -Math.atan2(bz - az, bx - ax) });
        rail.castShadow = false;
      }
    }
    const posts = new InstancedMesh(postGeo, M.darkWood, postsAt.length);
    postsAt.forEach(([x, z], i) => { o.position.set(x, 0, z); o.rotation.set(0, 0, 0); o.scale.setScalar(1); o.updateMatrix(); posts.setMatrixAt(i, o.matrix); });
    posts.castShadow = shadows;
    world.add(posts);
    disposables.push(postGeo);

    // loose rocks here and there
    for (let i = 0; i < 16; i++) {
      const x = lerp(B.minX + 2, B.maxX - 2, rng()), z = lerp(B.minZ + 6, B.maxZ - 2, rng());
      if (!free(x, z, -2)) continue;
      const r = 0.25 + rng() * 0.5;
      const g = rockGeometry(r, { seed: i * 31 + 5, detail: 1 });
      const m = new Mesh(g, M.rock);
      m.position.set(x, -0.04, z);
      m.rotation.y = rng() * 6;
      m.castShadow = shadows;
      m.receiveShadow = shadows;
      world.add(m);
      disposables.push(g);
      if (r > 0.38) col.circle(x, z, r * 0.9, { h: r });
    }
  }

  mergeStatic(world);

  /* ------------------------------- collision ------------------------------ */
  const C = OW.cave, Bd = OW.bounds;
  col.constrain((p, r) => {
    let moved = false;
    const clampTo = (v, lo, hi) => { const c = Math.min(hi, Math.max(lo, v)); if (c !== v) moved = true; return c; };
    p.x = clampTo(p.x, Bd.minX + r, Bd.maxX - r);
    p.z = clampTo(p.z, -1e9, Bd.maxZ - r);
    // the cliff, with a gap for the tunnel
    const inMouth = Math.abs(p.x) < C.half - r;
    if (!inMouth && p.z < C.mouthZ + r) { p.z = C.mouthZ + r; moved = true; }
    if (p.z < C.mouthZ) {
      p.x = clampTo(p.x, -C.half + r, C.half - r);
      p.z = clampTo(p.z, C.mouthZ - 10, 1e9);
    }
    return moved;
  });

  /* -------------------------------- update -------------------------------- */
  let roofFade = 1;
  const update = (dt, t, { player, camera, fx }) => {
    // flicker
    for (const fl of forge.flames) {
      const k = fl.userData.base * (0.85 + 0.25 * Math.sin(t * 13 + fl.userData.phase) * Math.sin(t * 7.3 + fl.userData.phase * 2));
      fl.scale.set(k * 0.7, k * 1.25, 1);
    }
    for (const fl of cave.torches) {
      const k = fl.userData.base * (0.9 + 0.15 * Math.sin(t * 15 + fl.userData.phase));
      fl.scale.set(k, k * 1.8, 1);
    }
    forge.fire.intensity = 14 * (0.85 + 0.15 * Math.sin(t * 9.1) * Math.sin(t * 5.3));
    M.lava.map.offset.set((t * 0.02) % 1, (t * 0.035) % 1);
    cave.sign.rotation.x = Math.sin(t * 1.3) * 0.045;
    // a pickaxe being looked at comes down off its pegs and sways in the light,
    // never turning so far that its head goes edge-on
    for (const sl of Object.values(pickWall.slots)) {
      const want = pickWall.showing === sl.type;
      sl.k = clamp01(sl.k + (want ? dt : -dt) * 2.6);
      if (want) sl.spin += dt;
      const e = smoothstep(sl.k);
      sl.pick.position.set(sl.home.x, sl.home.y + 0.3 * e, sl.home.z + 0.55 * e);
      sl.pick.rotation.set(-0.1 * e, Math.sin(sl.spin * 0.9) * 0.7 * e, 0.18 * e);
    }
    cave.sign.rotation.z = Math.sin(t * 0.9) * 0.02;
    // chimney smoke
    if (fx && Math.random() < dt * 3.5) {
      fx.smokePuff(forge.chimneyTop, { color: new Color('#6b6560'), size: 0.7, alpha: 0.32, rise: 1.3, life: 4 });
    }
    if (fx && Math.random() < dt * 6) fx.sparks(forge.hearth, 1, { speed: 0.4, up: 1.6, life: 0.9, size: 0.05 });
    // the roof gets out of the way while you are under it
    const f = OW.forge;
    const under = player && player.x > f.minX - 0.5 && player.x < f.maxX + 0.6 && player.z > f.minZ - 0.4 && player.z < f.maxZ + 0.4;
    const camUnder = camera && camera.position.x > f.minX - 1 && camera.position.x < f.maxX + 1 &&
      camera.position.z > f.minZ - 1 && camera.position.z < f.maxZ + 1 && camera.position.y < 6.5;
    roofFade = lerp(roofFade, under || camUnder ? 0.12 : 1, 1 - Math.exp(-dt * 6));
    M.roof.opacity = M.roofWood.opacity = roofFade;
    M.roof.depthWrite = M.roofWood.depthWrite = roofFade > 0.95;
    forge.roof.visible = roofFade > 0.03;
    // the sun's shadow follows you about
    if (shadows && player) {
      sun.position.set(player.x + 30, 55, player.z + 20);
      sun.target.position.set(player.x, 0, player.z);
      sun.target.updateMatrixWorld();
    }
  };

  /* -------------------------------- camera -------------------------------- */
  /** Keeps the camera out of the cliff and out of the forge's walls. */
  const clampCamera = (from, to) => {
    // out of the cliff, unless it is looking down the tunnel
    if (to.z < C.mouthZ + 0.6 && Math.abs(to.x) > C.half - 0.4) to.z = C.mouthZ + 0.6;
    if (to.z < C.mouthZ) to.x = Math.max(-C.half + 0.4, Math.min(C.half - 0.4, to.x));
    if (to.z < C.mouthZ && to.y > 4.2) to.y = 4.2;
    return to;
  };

  const dispose = () => {
    scene.traverse((o) => { if (o.isMesh || o.isInstancedMesh) o.geometry?.dispose(); });
    for (const d of disposables) d.dispose?.();
  };

  return {
    id: 'overworld', name: 'The Meadow', sub: 'Mine below, forge above',
    scene, collider: col, ground: overworldGround, sun,
    spawn: OW.spawn, forge, cave, pickWall, update, clampCamera, dispose,
    /** You are walking into the dark: time to go in. */
    enteringCave: (p) => p.z < OW.cave.enterZ,
    nearAnvil: (p) => Math.hypot(p.x - OW.anvil.x, p.z - OW.anvil.z) < 2.6,
    /** Close to the pickaxe wall, on its front side. */
    nearWall: (p) => {
      const dx = p.x - OW.wall.x, dz = p.z - OW.wall.z;
      return Math.hypot(dx, dz) < 3.6 && dx * pickWall.normal.x + dz * pickWall.normal.z > 0.1;
    },
  };
}

/* ------------------------------ tree geometry ------------------------------ */

function coneAt(r, h, y) {
  const g = new ConeGeometry(r, h, 7);
  g.translate(0, y, 0);
  return g;
}

function blobAt(r, x, y, z, seed) {
  const g = new IcosahedronGeometry(r, 0);
  const rng = makeRng(seed);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    // icosahedron corners repeat, so jitter by position to keep it closed
    const k = 1 + Math.sin(p.getX(i) * 9.1 + p.getY(i) * 7.3 + p.getZ(i) * 5.7 + seed) * 0.12;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.85, p.getZ(i) * k);
  }
  rng();
  g.computeVertexNormals();
  g.translate(x, y, z);
  return g;
}

/** Glues non-indexed geometries with positions and normals into one. */
function mergeGeos(list) {
  const pos = [], nor = [], uv = [];
  for (let g of list) {
    if (g.index) g = g.toNonIndexed();
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
    }
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}
