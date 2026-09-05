/* =============================================================================
   Things the RCV2 can spawn.

     Crate       - a wooden box that tumbles and stacks
     Boulder     - a rock that rolls properly, because it really is a sphere
     Machete     - a blade you can pick up and swing
     Sledgehammer- two-handed, heavy enough to break what it lands on
     Citizen     - a person (built in citizen.js)
   ========================================================================== */
import {
  Group, Mesh, MeshLambertMaterial, SphereGeometry, BoxGeometry, Vector3,
  CanvasTexture, SRGBColorSpace, LinearMipmapLinearFilter, Color,
} from 'three';
import { RigidBody } from '../physics/rigid.js';
import { makeAtlasBoxGeometry, localPointToFaceUV, faceRect } from './skeleton.js';
import { drawWood, drawRock, makeCanvas } from './textures.js';
import { paintSplat, paintBlood } from './paint.js';
import { makeRng, clamp01 } from '../core/util.js';

const _v1 = new Vector3(), _v2 = new Vector3();

const rng = makeRng(0x12345);

/* ------------------------- shared base appearances ------------------------ */

let woodBase = null, rockBase = null;

export function prewarmObjectArt() {
  if (!woodBase) {
    woodBase = makeCanvas(192, 128);
    const ctx = woodBase.getContext('2d');
    // one cell per box face, laid out 3x2 to match the atlas
    for (let f = 0; f < 6; f++) {
      const r = faceRect(f, 192, 128);
      ctx.save();
      ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
      ctx.translate(r.x, r.y);
      drawWood(ctx, r.w, r.h, 3 + f);
      // plank frame so it reads as a crate
      ctx.strokeStyle = 'rgba(48,28,10,0.75)';
      ctx.lineWidth = Math.max(2, r.w * 0.06);
      ctx.strokeRect(0, 0, r.w, r.h);
      ctx.strokeStyle = 'rgba(70,44,18,0.45)';
      ctx.lineWidth = Math.max(1.5, r.w * 0.045);
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(r.w, r.h);
      ctx.moveTo(r.w, 0); ctx.lineTo(0, r.h);
      ctx.stroke();
      ctx.restore();
    }
  }
  if (!rockBase) {
    rockBase = makeCanvas(256, 128);
    drawRock(rockBase.getContext('2d'), 256, 128, 11);
  }
  return { woodBase, rockBase };
}

function textureFrom(canvas) {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 2;
  return t;
}

let sharedWoodTex = null, sharedRockTex = null;
function sharedWood() { if (!sharedWoodTex) sharedWoodTex = textureFrom(prewarmObjectArt().woodBase); return sharedWoodTex; }
function sharedRock() { if (!sharedRockTex) sharedRockTex = textureFrom(prewarmObjectArt().rockBase); return sharedRockTex; }

/* -------------------------------------------------------------------------- */
/*                                   crate                                    */
/* -------------------------------------------------------------------------- */

const crateGeoCache = new Map();
function crateGeo(size) {
  const k = size.toFixed(3);
  if (!crateGeoCache.has(k)) crateGeoCache.set(k, makeAtlasBoxGeometry(size, size, size));
  return crateGeoCache.get(k);
}

export function spawnCrate(game, position, { size = 0.72, mass = 24 } = {}) {
  const half = size / 2;
  const body = new RigidBody({
    shape: 'box',
    half: new Vector3(half, half, half),
    mass,
    pos: position.clone(),
    friction: 0.62,
    restitution: 0.05,
    linDamp: 0.14,
    angDamp: 0.30,
    tag: 'crate',
  });
  body.quat.setFromAxisAngle(_v1.set(0, 1, 0), rng() * Math.PI * 2);
  body.updateDerived();

  const mat = new MeshLambertMaterial({ map: sharedWood() });
  const mesh = new Mesh(crateGeo(size), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  body.mesh = mesh;
  body.userData.label = 'Crate';
  body.userData.grabbable = true;
  body.userData.material = mat;
  body.userData.paintBlood = makeBoxPainter(body, mat);
  game.scene.add(mesh);
  game.world.addBody(body);
  game.trackSpawn(body);
  return body;
}

/**
 * Lazily gives a box its own canvas the first time something lands on it.
 * An existing surface can be handed in so a machete keeps the blood on its
 * blade when it is dropped and picked up again.
 */
function makeBoxPainter(body, material, adopt = null, base = 'wood') {
  let surface = adopt;
  if (surface) {
    material.map = surface.texture;
    material.needsUpdate = true;
    body.userData.paintSurface = surface;
  }
  return function paint(worldPoint, severity, vel) {
    if (!surface) {
      const c = makeCanvas(192, 128);
      const ctx = c.getContext('2d');
      if (base === 'wood') {
        ctx.drawImage(prewarmObjectArt().woodBase, 0, 0);
      } else {
        // Start from what the material already looks like, so painting the
        // first drop of blood on a steel blade does not turn it into a plank.
        ctx.fillStyle = '#' + material.color.getHexString();
        ctx.fillRect(0, 0, c.width, c.height);
      }
      surface = { canvas: c, ctx, texture: textureFrom(c) };
      material.map = surface.texture;
      material.color.set(0xffffff);
      material.needsUpdate = true;
      body.userData.paintSurface = surface;
    }
    body.worldToLocal(worldPoint, _v1);
    const { face, u, v } = localPointToFaceUV(_v1, body.half);
    const r = faceRect(face, surface.canvas.width, surface.canvas.height);
    const px = r.x + clamp01(u) * r.w;
    const py = r.y + (1 - clamp01(v)) * r.h;
    const ctx = surface.ctx;
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    const rad = Math.max(2.5, r.w * (0.05 + severity * 0.10));
    if (vel) paintSplat(ctx, px, py, rad, vel.x, -vel.y, rng, 0.15);
    else paintBlood(ctx, px, py, rad, severity, rng, 0.15);
    ctx.restore();
    surface.texture.needsUpdate = true;
  };
}

/* -------------------------------------------------------------------------- */
/*                                  boulder                                   */
/* -------------------------------------------------------------------------- */

const boulderGeoCache = new Map();
function boulderGeo(radius) {
  const k = radius.toFixed(3);
  if (!boulderGeoCache.has(k)) {
    const g = new SphereGeometry(radius, 20, 14);
    // Rough it up so it looks like rock, while the collider stays a true sphere
    // and therefore rolls the way a boulder should.
    const pos = g.attributes.position;
    const n = makeRng(99);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const len = Math.hypot(x, y, z) || 1;
      const bump = 1 - 0.055 * n();
      pos.setXYZ(i, x / len * radius * bump, y / len * radius * bump, z / len * radius * bump);
    }
    g.computeVertexNormals();
    boulderGeoCache.set(k, g);
  }
  return boulderGeoCache.get(k);
}

export function spawnBoulder(game, position, { radius = 0.55, mass = 130 } = {}) {
  const body = new RigidBody({
    shape: 'sphere',
    radius,
    mass,
    pos: position.clone(),
    friction: 0.86,
    restitution: 0.10,
    linDamp: 0.06,
    angDamp: 0.05,
    rollFriction: 0.55,
    tag: 'boulder',
  });
  body.angVel.set((rng() - 0.5) * 1.4, (rng() - 0.5) * 0.6, (rng() - 0.5) * 1.4);

  const mat = new MeshLambertMaterial({ map: sharedRock(), color: new Color(0.86 + rng() * 0.24, 0.86 + rng() * 0.2, 0.84 + rng() * 0.2) });
  const mesh = new Mesh(boulderGeo(radius), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  body.mesh = mesh;
  body.userData.label = 'Boulder';
  body.userData.grabbable = true;
  body.userData.material = mat;
  body.userData.paintBlood = makeSpherePainter(body, mat, radius);
  game.scene.add(mesh);
  game.world.addBody(body);
  game.trackSpawn(body);
  return body;
}

function makeSpherePainter(body, material, radius) {
  let surface = null;
  return function paint(worldPoint, severity, vel) {
    if (!surface) {
      const src = prewarmObjectArt().rockBase;
      const c = makeCanvas(src.width, src.height);
      c.getContext('2d').drawImage(src, 0, 0);
      surface = { canvas: c, ctx: c.getContext('2d'), texture: textureFrom(c) };
      material.map = surface.texture;
      material.color.set(0xffffff);
      material.needsUpdate = true;
      body.userData.paintSurface = surface;
    }
    body.worldToLocal(worldPoint, _v1);
    const len = _v1.length() || 1;
    const y = _v1.y / len;
    const v = Math.acos(Math.max(-1, Math.min(1, y))) / Math.PI;
    let phi = Math.atan2(_v1.z, -_v1.x);
    if (phi < 0) phi += Math.PI * 2;
    const u = phi / (Math.PI * 2);
    const W = surface.canvas.width, H = surface.canvas.height;
    const ctx = surface.ctx;
    const rad = Math.max(2.5, (severity * 0.14 + 0.05) * W / (radius * 4));
    ctx.save();
    if (vel) paintSplat(ctx, u * W, v * H, rad, vel.x, -vel.y, rng, 0.2);
    else paintBlood(ctx, u * W, v * H, rad, severity, rng, 0.2);
    ctx.restore();
    surface.texture.needsUpdate = true;
  };
}

/* -------------------------------------------------------------------------- */
/*                                  machete                                   */
/* -------------------------------------------------------------------------- */

/**
 * Grip at the origin, blade running up +Y. Held that way it continues the
 * line of the fist, which is what makes a swing read as a swing.
 */
export const MACHETE = {
  grip: 0.115,          // length of the handle
  blade: 0.46,          // length of the blade above the guard
  width: 0.052,
  thick: 0.011,
  get length() { return this.grip + this.blade; },
};

let macheteParts = null;
function macheteGeometry() {
  if (!macheteParts) {
    const M = MACHETE;
    macheteParts = {
      handle: new BoxGeometry(0.030, M.grip, 0.026),
      guard: new BoxGeometry(0.062, 0.016, 0.030),
      blade: makeAtlasBoxGeometry(M.width, M.blade, M.thick),
      tip: new BoxGeometry(M.width * 0.62, 0.075, M.thick),
      edge: new BoxGeometry(0.008, M.blade * 0.98, M.thick * 1.35),
    };
  }
  return macheteParts;
}

/** The visible machete. Used both for the loose item and the carried one. */
export function createMacheteModel() {
  const M = MACHETE;
  const g = macheteGeometry();
  const group = new Group();
  const steel = new MeshLambertMaterial({ color: 0x9aa2ab });
  const edge = new MeshLambertMaterial({ color: 0xe8edf2 });
  const grip = new MeshLambertMaterial({ color: 0x2e2119 });
  const brass = new MeshLambertMaterial({ color: 0x7d6330 });

  const add = (geo, mat, y, x = 0) => {
    const m = new Mesh(geo, mat);
    m.position.set(x, y, 0);
    m.castShadow = true;
    group.add(m);
    return m;
  };
  add(g.handle, grip, M.grip / 2);
  add(g.guard, brass, M.grip + 0.008);
  const blade = add(g.blade, steel, M.grip + M.blade / 2);
  add(g.edge, edge, M.grip + M.blade / 2, M.width / 2 - 0.004);
  add(g.tip, steel, M.grip + M.blade + 0.030);

  group.userData.bladeMesh = blade;
  group.userData.bladeMat = steel;
  group.userData.materials = [steel, edge, grip, brass];
  return group;
}

/**
 * @param {object} [reuse] an existing model, blade material and paint surface
 *   to adopt, so a dropped machete is the same machete that was picked up.
 */
export function spawnMachete(game, position, { quat = null, reuse = null } = {}) {
  const M = MACHETE;
  const body = new RigidBody({
    shape: 'box',
    half: new Vector3(M.width / 2, M.length / 2, M.thick / 2 + 0.006),
    mass: 1.1,
    pos: position.clone(),
    friction: 0.7,
    restitution: 0.03,
    linDamp: 0.25,
    angDamp: 0.5,
    tag: 'machete',
  });
  if (quat) body.quat.copy(quat);
  else body.quat.setFromAxisAngle(_v1.set(0, 0, 1), Math.PI / 2 + (rng() - 0.5) * 0.4);
  body.updateDerived();

  const mesh = reuse ? reuse.model : createMacheteModel();
  const bladeMat = reuse ? reuse.material : mesh.userData.bladeMat;
  // the model's grip sits at its origin; the collider is centred on the blade
  mesh.userData.bodyOffset = new Vector3(0, -M.length / 2, 0);
  mesh.matrixAutoUpdate = false;
  body.mesh = mesh;
  body.userData.label = 'Machete';
  body.userData.grabbable = true;
  body.userData.pickup = 'machete';
  body.userData.material = bladeMat;
  // The painter has to be bound to THIS body: it maps a world point into the
  // body's own frame, and a stale one would paint blood in the wrong place.
  body.userData.paintBlood = makeBoxPainter(body, bladeMat, reuse ? reuse.surface : null, 'steel');
  if (!reuse || !mesh.parent) game.scene.add(mesh);
  game.world.addBody(body);
  game.trackSpawn(body);
  return body;
}

/* -------------------------------------------------------------------------- */
/*                               sledgehammer                                 */
/* -------------------------------------------------------------------------- */

/** A long wooden haft with a steel block across the top of it. */
export const SLEDGE = {
  haft: 0.68,           // length of the handle
  headW: 0.235,         // across, the striking span
  headH: 0.115,
  headD: 0.115,
  get length() { return this.haft + this.headH; },
};

let sledgeParts = null;
function sledgeGeometry() {
  if (!sledgeParts) {
    const S = SLEDGE;
    sledgeParts = {
      haft: new BoxGeometry(0.036, S.haft, 0.030),
      grip: new BoxGeometry(0.042, 0.20, 0.036),
      head: makeAtlasBoxGeometry(S.headW, S.headH, S.headD),
      face: new BoxGeometry(0.016, S.headH * 0.92, S.headD * 0.92),
      collar: new BoxGeometry(0.055, 0.030, 0.048),
    };
  }
  return sledgeParts;
}

export function createSledgeModel() {
  const S = SLEDGE;
  const g = sledgeGeometry();
  const group = new Group();
  const steel = new MeshLambertMaterial({ color: 0x767c84 });
  const worn = new MeshLambertMaterial({ color: 0x9ba3ab });
  const haft = new MeshLambertMaterial({ color: 0x8a6438 });
  const grip = new MeshLambertMaterial({ color: 0x241c16 });

  const add = (geo, mat, y, x = 0) => {
    const m = new Mesh(geo, mat);
    m.position.set(x, y, 0);
    m.castShadow = true;
    group.add(m);
    return m;
  };
  add(g.grip, grip, 0.10);                                  // bound handle end
  add(g.haft, haft, S.haft / 2);
  add(g.collar, steel, S.haft - 0.018);
  const head = add(g.head, steel, S.haft + S.headH / 2);
  // the two striking faces, worn brighter than the block
  add(g.face, worn, S.haft + S.headH / 2, S.headW / 2 - 0.008);
  add(g.face, worn, S.haft + S.headH / 2, -(S.headW / 2 - 0.008));

  group.userData.headMesh = head;
  group.userData.bladeMat = steel;      // what blood paints onto
  group.userData.materials = [steel, worn, haft, grip];
  return group;
}

/** @param {object} [reuse] see spawnMachete. */
export function spawnSledge(game, position, { quat = null, reuse = null } = {}) {
  const S = SLEDGE;
  const body = new RigidBody({
    shape: 'box',
    // one collider around the whole thing, fattest at the head
    half: new Vector3(S.headW / 2, S.length / 2, S.headD / 2),
    mass: 7.5,
    pos: position.clone(),
    friction: 0.85,
    restitution: 0.02,
    linDamp: 0.3,
    angDamp: 0.7,
    tag: 'sledge',
  });
  if (quat) body.quat.copy(quat);
  else body.quat.setFromAxisAngle(_v1.set(0, 0, 1), Math.PI / 2 + (rng() - 0.5) * 0.3);
  body.updateDerived();

  const mesh = reuse ? reuse.model : createSledgeModel();
  const headMat = reuse ? reuse.material : mesh.userData.bladeMat;
  mesh.userData.bodyOffset = new Vector3(0, -S.length / 2, 0);
  mesh.matrixAutoUpdate = false;
  body.mesh = mesh;
  body.userData.label = 'Sledgehammer';
  body.userData.grabbable = true;
  body.userData.pickup = 'sledge';
  body.userData.material = headMat;
  body.userData.paintBlood = makeBoxPainter(body, headMat, reuse ? reuse.surface : null, 'steel');
  if (!reuse || !mesh.parent) game.scene.add(mesh);
  game.world.addBody(body);
  game.trackSpawn(body);
  return body;
}

/* -------------------------------------------------------------------------- */

/** Keeps the visible mesh glued to its rigid body. */
export function syncBodyMesh(body) {
  const m = body.mesh;
  if (!m) return;
  m.quaternion.copy(body.quat);
  const off = m.userData.bodyOffset;
  if (off) m.position.copy(off).applyQuaternion(body.quat).add(body.pos);
  else m.position.copy(body.pos);
  m.updateMatrix();
}

export function disposeBody(game, body) {
  if (body.mesh) {
    game.scene.remove(body.mesh);
    const s = body.userData.paintSurface;
    if (s) s.texture.dispose();
    const mats = body.mesh.userData.materials;
    if (mats) mats.forEach((m) => m.dispose());
    else if (body.userData.material) body.userData.material.dispose();
  }
  game.world.removeBody(body);
}
