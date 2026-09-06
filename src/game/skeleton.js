/* =============================================================================
   The humanoid rig. Every single body part is a six sided box, exactly as the
   design calls for:

     head, neck, upper torso, middle torso (slimmer), lower torso (slimmer
     still), pelvis, upper arms, lower arms, hands, fingers (two independently
     turning segments each), upper legs, lower legs, feet (plus a rigid tip
     that never turns).

   Bones point along their own +Y. A rest rotation orients each one, so limbs
   that hang downwards get a half turn about X, which conveniently keeps their
   local X axis aligned with world X - a positive rotation about local X always
   swings a limb forwards.
   ========================================================================== */
import { BoxGeometry, Quaternion, Euler, Vector3 } from 'three';
import { clampBoneEuler } from './joints.js';

const PI = Math.PI;

/* -------------------------------------------------------------------------- */
/*                              bone definitions                              */
/* -------------------------------------------------------------------------- */

/**
 * offset  - joint position inside the parent bone's local space
 * rest    - euler applied before the animated rotation
 * length  - distance to the child joint, along local +Y
 * box     - [w,h,d] of the rendered box, and where its centre sits locally
 * cloth   - which garment (if any) covers this part
 */
function coreBones() {
  return [
    { name: 'pelvis', parent: null, offset: [0, 0, 0], rest: [0, 0, 0], length: 0.12,
      box: { size: [0.30, 0.13, 0.21] }, cloth: 'pants', hp: 28, atlas: 40 },

    { name: 'lowerTorso', parent: 'pelvis', offset: [0, 0.12, 0], rest: [0, 0, 0], length: 0.14,
      box: { size: [0.285, 0.15, 0.195] }, cloth: 'shirt', hp: 26, atlas: 40 },

    { name: 'midTorso', parent: 'lowerTorso', offset: [0, 0.14, 0], rest: [0, 0, 0], length: 0.14,
      box: { size: [0.315, 0.15, 0.205] }, cloth: 'shirt', hp: 26, atlas: 40 },

    { name: 'upperTorso', parent: 'midTorso', offset: [0, 0.14, 0], rest: [0, 0, 0], length: 0.19,
      box: { size: [0.365, 0.20, 0.225] }, cloth: 'shirt', hp: 34, atlas: 48 },

    { name: 'neck', parent: 'upperTorso', offset: [0, 0.19, 0], rest: [0, 0, 0], length: 0.09,
      box: { size: [0.115, 0.10, 0.115] }, hp: 12, atlas: 24 },

    { name: 'head', parent: 'neck', offset: [0, 0.09, 0], rest: [0, 0, 0], length: 0.23,
      box: { size: [0.205, 0.235, 0.215] }, hp: 20, atlas: 72, face: true },
  ];
}

function armBones(side) {
  const s = side === 'R' ? 1 : -1;
  const S = side;
  const bones = [
    { name: 'upperArm' + S, parent: 'upperTorso', offset: [0.176 * s, 0.152, 0], rest: [PI, 0, 0],
      length: 0.28, box: { size: [0.105, 0.29, 0.108] }, cloth: 'sleeve', hp: 18, atlas: 32, side: s },

    { name: 'lowerArm' + S, parent: 'upperArm' + S, offset: [0, 0.28, 0], rest: [0, 0, 0],
      length: 0.26, box: { size: [0.09, 0.265, 0.094] }, cloth: 'cuff', hp: 16, atlas: 32, side: s },

    /* A palm is about as thick as two fingers, not as thick as a wrist is
       wide: a deeper box than this cannot close around anything, which is
       what a hand is for. */
    { name: 'hand' + S, parent: 'lowerArm' + S, offset: [0, 0.26, 0], rest: [0, 0, 0],
      length: 0.095, box: { size: [0.088, 0.10, 0.042] }, hp: 10, atlas: 24, side: s, isHand: true },
  ];

  /* Four fingers plus a thumb. Both segments of every finger turn on their
     own. The knuckles sit towards the palm side of the hand, where a real
     knuckle is, so that a closed fist leaves a hole in front of the palm
     rather than folding into the middle of it. */
  const spread = [-0.030, -0.010, 0.010, 0.030];
  for (let i = 0; i < 4; i++) {
    bones.push({
      name: `finger${S}${i}A`, parent: 'hand' + S, offset: [spread[i], 0.098, -0.008], rest: [0, 0, 0],
      length: 0.040, box: { size: [0.018, 0.042, 0.021] }, hp: 3, atlas: 8, side: s, finger: true,
    });
    bones.push({
      name: `finger${S}${i}B`, parent: `finger${S}${i}A`, offset: [0, 0.040, 0], rest: [0, 0, 0],
      length: 0.034, box: { size: [0.017, 0.036, 0.020] }, hp: 3, atlas: 8, side: s, finger: true,
    });
  }
  bones.push({
    name: `thumb${S}A`, parent: 'hand' + S, offset: [-0.040 * s, 0.048, -0.010], rest: [0, 0, 0.95 * s],
    length: 0.038, box: { size: [0.021, 0.040, 0.023] }, hp: 3, atlas: 8, side: s, finger: true,
  });
  bones.push({
    name: `thumb${S}B`, parent: `thumb${S}A`, offset: [0, 0.038, 0], rest: [0, 0, 0],
    length: 0.030, box: { size: [0.020, 0.032, 0.022] }, hp: 3, atlas: 8, side: s, finger: true,
  });
  return bones;
}

function legBones(side) {
  const s = side === 'R' ? 1 : -1;
  const S = side;
  return [
    { name: 'upperLeg' + S, parent: 'pelvis', offset: [0.093 * s, 0.006, 0], rest: [PI, 0, 0],
      length: 0.44, box: { size: [0.148, 0.45, 0.158] }, cloth: 'pants', hp: 22, atlas: 32, side: s },

    { name: 'lowerLeg' + S, parent: 'upperLeg' + S, offset: [0, 0.44, 0], rest: [0, 0, 0],
      length: 0.41, box: { size: [0.124, 0.415, 0.132] }, cloth: 'pantLeg', hp: 20, atlas: 32, side: s },

    // Foot: rotating about local X is the ankle. Local +Y runs forward, local
    // +Z points up, so the box is pushed down to sit under the ankle.
    { name: 'foot' + S, parent: 'lowerLeg' + S, offset: [0, 0.41, -0.045], rest: [PI / 2, 0, 0],
      length: 0.17, box: { size: [0.108, 0.175, 0.092], offset: [0, 0.082, -0.046] },
      cloth: 'shoe', hp: 12, atlas: 24, side: s, isFoot: true },

    // The tip is welded to the foot - it never turns.
    { name: 'footTip' + S, parent: 'foot' + S, offset: [0, 0.17, 0], rest: [0, 0, 0],
      length: 0.075, box: { size: [0.102, 0.078, 0.086], offset: [0, 0.038, -0.043] },
      cloth: 'shoe', hp: 6, atlas: 16, side: s, rigid: true },
  ];
}

export const BONE_DEFS = [
  ...coreBones(),
  ...armBones('R'), ...armBones('L'),
  ...legBones('R'), ...legBones('L'),
];

export const BONE_INDEX = (() => {
  const m = Object.create(null);
  BONE_DEFS.forEach((b, i) => { m[b.name] = i; });
  return m;
})();

/** Parts that take part in damage / gore (fingers are too small to bother). */
export const DAMAGEABLE = BONE_DEFS.filter((b) => !b.finger).map((b) => b.name);

/** Height of the rig, useful for cameras and spawn offsets. */
export const RIG_HEIGHT = 1.855;
export const HIP_HEIGHT = 0.945;
export const EYE_HEIGHT = 1.70;

/* -------------------------------------------------------------------------- */
/*                          box geometry with an atlas                        */
/* -------------------------------------------------------------------------- */

/**
 * three's BoxGeometry gives every face the full 0..1 UV square. To let a single
 * canvas hold all six sides (so blood can land anywhere on a limb) the UVs are
 * folded into a 3x2 atlas: +X -X +Y on the top row, -Y +Z -Z on the bottom.
 */
export function makeAtlasBoxGeometry(w, h, d) {
  const geo = new BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4);       // 0..5 in three's px,nx,py,ny,pz,nz order
    const col = face % 3, row = Math.floor(face / 3);
    const u = uv.getX(i), v = uv.getY(i);
    uv.setXY(i, (u + col) / 3, (v + (1 - row)) / 2);
  }
  uv.needsUpdate = true;
  return geo;
}

export const FACE_PX = 0, FACE_NX = 1, FACE_PY = 2, FACE_NY = 3, FACE_PZ = 4, FACE_NZ = 5;

/** Where a face lives inside the atlas canvas, in pixels. */
export function faceRect(face, canvasW, canvasH) {
  const col = face % 3, row = Math.floor(face / 3);
  const cw = canvasW / 3, ch = canvasH / 2;
  return { x: col * cw, y: row * ch, w: cw, h: ch };
}

/**
 * Maps a point in a box's local space onto (face, u, v) so damage can be
 * painted exactly where it landed.
 */
export function localPointToFaceUV(local, half) {
  const ax = Math.abs(local.x) / half.x;
  const ay = Math.abs(local.y) / half.y;
  const az = Math.abs(local.z) / half.z;
  let face, u, v;
  if (ax >= ay && ax >= az) {
    if (local.x >= 0) { face = FACE_PX; u = 0.5 - local.z / (2 * half.z); }
    else { face = FACE_NX; u = 0.5 + local.z / (2 * half.z); }
    v = 0.5 + local.y / (2 * half.y);
  } else if (ay >= az) {
    if (local.y >= 0) { face = FACE_PY; v = 0.5 - local.z / (2 * half.z); }
    else { face = FACE_NY; v = 0.5 + local.z / (2 * half.z); }
    u = 0.5 + local.x / (2 * half.x);
  } else {
    if (local.z >= 0) { face = FACE_PZ; u = 0.5 + local.x / (2 * half.x); }
    else { face = FACE_NZ; u = 0.5 - local.x / (2 * half.x); }
    v = 0.5 + local.y / (2 * half.y);
  }
  return { face, u, v };
}

/* -------------------------------------------------------------------------- */
/*                                 the rig                                    */
/* -------------------------------------------------------------------------- */

const _q = new Quaternion();
const _e = new Euler();
const _v = new Vector3();

export class Bone {
  constructor(def, index) {
    this.def = def;
    this.name = def.name;
    this.index = index;
    this.parent = null;
    this.children = [];
    this.length = def.length;

    this.offset = new Vector3().fromArray(def.offset);
    this.restQuat = new Quaternion().setFromEuler(new Euler(def.rest[0], def.rest[1], def.rest[2], 'XYZ'));
    this.restDirInParent = new Vector3(0, 1, 0).applyQuaternion(this.restQuat);

    this.anim = new Euler(0, 0, 0, 'XYZ');   // pose written by the animator
    this.animQuat = new Quaternion();

    this.worldQuat = new Quaternion();
    this.worldPos = new Vector3();
    this.worldEnd = new Vector3();

    this.boxSize = new Vector3().fromArray(def.box.size);
    this.boxHalf = new Vector3().copy(this.boxSize).multiplyScalar(0.5);
    this.boxOffset = def.box.offset
      ? new Vector3().fromArray(def.box.offset)
      : new Vector3(0, def.length / 2, 0);

    this.hp = def.hp || 10;
  }
}

export class SkeletonRig {
  constructor() {
    this.bones = BONE_DEFS.map((d, i) => new Bone(d, i));
    this.byName = Object.create(null);
    for (const b of this.bones) this.byName[b.name] = b;
    for (const b of this.bones) {
      if (b.def.parent) {
        b.parent = this.byName[b.def.parent];
        b.parent.children.push(b);
      }
    }
    this.root = this.byName.pelvis;
    this.rootPos = new Vector3(0, HIP_HEIGHT, 0);
    this.rootQuat = new Quaternion();
    // Ordered parents-before-children (BONE_DEFS already is, but be explicit).
    this.order = [];
    const walk = (b) => { this.order.push(b); b.children.forEach(walk); };
    walk(this.root);
    /** Bones allowed out of their joint limits - a broken one can go any way. */
    this.limitExempt = null;
    /** How many bones the last pose had to be pulled back into range... */
    this.limitHits = 0;
    /** ...and which ones. */
    this.limitClamped = [];
  }

  /**
   * Forward kinematics from the current pose.
   *
   * Every bone is held inside the range its real joint has before the pose is
   * built, so nothing downstream - animation, look offsets, the bend a break
   * leaves behind - can put an elbow through the back of an arm. Bones listed
   * in `limitExempt` are let through: that is what a broken bone is.
   */
  updateFK() {
    this.limitHits = 0;
    this.limitClamped.length = 0;
    const exempt = this.limitExempt;
    for (let i = 0; i < this.order.length; i++) {
      const b = this.order[i];
      if (!(exempt && exempt.has(b.name)) && clampBoneEuler(b.name, b.anim)) {
        this.limitHits++;
        // Names of what had to be pulled back, so a clip that asks for
        // something anatomically impossible can be found and fixed.
        this.limitClamped.push(b.name);
      }
      b.animQuat.setFromEuler(_e.set(b.anim.x, b.anim.y, b.anim.z, 'XYZ'));
      if (b.parent) {
        b.worldPos.copy(b.offset).applyQuaternion(b.parent.worldQuat).add(b.parent.worldPos);
        b.worldQuat.copy(b.parent.worldQuat).multiply(b.restQuat).multiply(b.animQuat);
      } else {
        b.worldPos.copy(this.rootPos);
        b.worldQuat.copy(this.rootQuat).multiply(b.restQuat).multiply(b.animQuat);
      }
      b.worldEnd.copy(_v.set(0, b.length, 0).applyQuaternion(b.worldQuat)).add(b.worldPos);
    }
  }

  resetPose() {
    for (const b of this.bones) b.anim.set(0, 0, 0);
  }

  get(name) { return this.byName[name]; }
}


/* -------------------------------------------------------------------------- */
/*                      world space queries against a bone                    */
/* -------------------------------------------------------------------------- */

const _qi = new Quaternion();
const _tmp = new Vector3();
const _tmp2 = new Vector3();

/** Centre of a bone's rendered box, in world space. */
export function boneBoxCenter(bone, out) {
  return out.copy(bone.boxOffset).applyQuaternion(bone.worldQuat).add(bone.worldPos);
}

/** Converts a world point into the bone's box space (origin at the box centre). */
export function worldToBoxLocal(bone, world, out) {
  boneBoxCenter(bone, _tmp);
  out.copy(world).sub(_tmp);
  _qi.copy(bone.worldQuat).invert();
  return out.applyQuaternion(_qi);
}

export function boxLocalToWorld(bone, local, out) {
  boneBoxCenter(bone, _tmp);
  return out.copy(local).applyQuaternion(bone.worldQuat).add(_tmp);
}

export function pointInBone(bone, world, pad = 0) {
  // _tmp2, not _tmp: worldToBoxLocal uses _tmp internally, and aliasing the
  // output onto it silently collapses every point to the box centre.
  worldToBoxLocal(bone, world, _tmp2);
  return Math.abs(_tmp2.x) <= bone.boxHalf.x + pad &&
         Math.abs(_tmp2.y) <= bone.boxHalf.y + pad &&
         Math.abs(_tmp2.z) <= bone.boxHalf.z + pad;
}

/** Ray against a bone's oriented box; returns the hit distance or null. */
export function rayBone(origin, dir, bone) {
  boneBoxCenter(bone, _tmp);
  _qi.copy(bone.worldQuat).invert();
  const o = _rayO.copy(origin).sub(_tmp).applyQuaternion(_qi);
  const d = _rayD.copy(dir).applyQuaternion(_qi);
  const h = bone.boxHalf;
  let tmin = -Infinity, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const oi = i === 0 ? o.x : i === 1 ? o.y : o.z;
    const di = i === 0 ? d.x : i === 1 ? d.y : d.z;
    const hh = i === 0 ? h.x : i === 1 ? h.y : h.z;
    if (Math.abs(di) < 1e-9) { if (oi < -hh || oi > hh) return null; continue; }
    let t1 = (-hh - oi) / di, t2 = (hh - oi) / di;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : tmax;
}

const _rayO = new Vector3();
const _rayD = new Vector3();

/** The eight corners of a bone's box, in world space (reused array). */
const _cornerScratch = Array.from({ length: 8 }, () => new Vector3());
const CORNER_SIGNS = [
  [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1],
];
export function boneCorners(bone) {
  boneBoxCenter(bone, _tmp);
  for (let i = 0; i < 8; i++) {
    const s = CORNER_SIGNS[i];
    _cornerScratch[i]
      .set(s[0] * bone.boxHalf.x, s[1] * bone.boxHalf.y, s[2] * bone.boxHalf.z)
      .applyQuaternion(bone.worldQuat)
      .add(_tmp);
  }
  return _cornerScratch;
}
