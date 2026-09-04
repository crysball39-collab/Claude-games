/* =============================================================================
   Things the RCV2 can spawn.

     Crate   - a wooden box that tumbles and stacks
     Boulder - a rock that rolls properly, because it really is a sphere
     Citizen - a person (built in citizen.js)
   ========================================================================== */
import {
  Mesh, MeshLambertMaterial, SphereGeometry, Vector3, Quaternion, CanvasTexture,
  SRGBColorSpace, LinearMipmapLinearFilter, Color,
} from 'three';
import { RigidBody } from '../physics/rigid.js';
import { makeAtlasBoxGeometry, localPointToFaceUV, faceRect } from './skeleton.js';
import { drawWood, drawRock, makeCanvas } from './textures.js';
import { paintSplat, paintBlood } from './paint.js';
import { makeRng, clamp01 } from '../core/util.js';

const _v1 = new Vector3(), _v2 = new Vector3();
const _q = new Quaternion();

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

/** Lazily gives a crate its own canvas the first time something lands on it. */
function makeBoxPainter(body, material) {
  let surface = null;
  return function paint(worldPoint, severity, vel) {
    if (!surface) {
      const src = prewarmObjectArt().woodBase;
      const c = makeCanvas(src.width, src.height);
      c.getContext('2d').drawImage(src, 0, 0);
      surface = { canvas: c, ctx: c.getContext('2d'), texture: textureFrom(c) };
      material.map = surface.texture;
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

/** Keeps the visible mesh glued to its rigid body. */
export function syncBodyMesh(body) {
  const m = body.mesh;
  if (!m) return;
  m.position.copy(body.pos);
  m.quaternion.copy(body.quat);
  m.updateMatrix();
}

export function disposeBody(game, body) {
  if (body.mesh) {
    game.scene.remove(body.mesh);
    const s = body.userData.paintSurface;
    if (s) s.texture.dispose();
    if (body.userData.material) body.userData.material.dispose();
  }
  game.world.removeBody(body);
}

export { _q };
