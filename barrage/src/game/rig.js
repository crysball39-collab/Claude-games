/* =============================================================================
   The human rig.

   Eighteen body parts, each a box with its own mass:

     head, neck, upper torso, middle torso, lower torso, pelvis,
     upper arms, lower arms, hands, upper legs, lower legs, feet

   Each part hangs from its parent at a joint where the two actually meet:

     pelvis (root)
     ├── lower torso → middle torso → upper torso
     │                                ├── neck → head
     │                                ├── upper arm L → lower arm L → hand L
     │                                └── upper arm R → lower arm R → hand R
     ├── upper leg L → lower leg L → foot L
     └── upper leg R → lower leg R → foot R

   Coordinates: metres, Y up, the body faces +Z, so its left is +X.
   Angles in this file are degrees.
   ========================================================================== */
import { Vector3, Quaternion } from 'three';

const D = Math.PI / 180;

/** side: +1 left, -1 right, 0 centre */
const RAW = [
  // name           parent         joint (from parent joint)  size [w,h,d]          centre (from own joint)   kg   look
  ['pelvis',       null,          [0, 0.98, 0],              [0.33, 0.16, 0.21],   [0, 0, 0],                10,  'pants'],
  ['lowerTorso',   'pelvis',      [0, 0.08, 0],              [0.28, 0.14, 0.18],   [0, 0.07, 0],             6,   'shirt'],
  ['middleTorso',  'lowerTorso',  [0, 0.14, 0],              [0.31, 0.15, 0.19],   [0, 0.075, 0],            8,   'shirt'],
  ['upperTorso',   'middleTorso', [0, 0.15, 0],              [0.38, 0.20, 0.21],   [0, 0.10, 0],             12,  'shirt'],
  ['neck',         'upperTorso',  [0, 0.20, 0],              [0.10, 0.09, 0.10],   [0, 0.045, 0],            1.2, 'skin'],
  ['head',         'neck',        [0, 0.08, 0],              [0.20, 0.22, 0.22],   [0, 0.11, 0.01],          5,   'head'],
  ['upperArmL',    'upperTorso',  [0.24, 0.16, 0],           [0.10, 0.30, 0.10],   [0, -0.15, 0],            2,   'shirt'],
  ['lowerArmL',    'upperArmL',   [0, -0.30, 0],             [0.085, 0.27, 0.085], [0, -0.135, 0],           1.5, 'skin'],
  ['handL',        'lowerArmL',   [0, -0.27, 0],             [0.085, 0.11, 0.095], [0, -0.055, 0],           0.6, 'skin'],
  ['upperArmR',    'upperTorso',  [-0.24, 0.16, 0],          [0.10, 0.30, 0.10],   [0, -0.15, 0],            2,   'shirt'],
  ['lowerArmR',    'upperArmR',   [0, -0.30, 0],             [0.085, 0.27, 0.085], [0, -0.135, 0],           1.5, 'skin'],
  ['handR',        'lowerArmR',   [0, -0.27, 0],             [0.085, 0.11, 0.095], [0, -0.055, 0],           0.6, 'skin'],
  ['upperLegL',    'pelvis',      [0.095, -0.03, 0],         [0.14, 0.45, 0.15],   [0, -0.215, 0],           7,   'pants'],
  ['lowerLegL',    'upperLegL',   [0, -0.43, 0],             [0.11, 0.43, 0.12],   [0, -0.215, 0],           3.5, 'pants'],
  ['footL',        'lowerLegL',   [0, -0.43, 0],             [0.10, 0.08, 0.26],   [0, -0.05, 0.05],         1.1, 'shoe'],
  ['upperLegR',    'pelvis',      [-0.095, -0.03, 0],        [0.14, 0.45, 0.15],   [0, -0.215, 0],           7,   'pants'],
  ['lowerLegR',    'upperLegR',   [0, -0.43, 0],             [0.11, 0.43, 0.12],   [0, -0.215, 0],           3.5, 'pants'],
  ['footR',        'lowerLegR',   [0, -0.43, 0],             [0.10, 0.08, 0.26],   [0, -0.05, 0.05],         1.1, 'shoe'],
];

export const PARTS = RAW.map(([name, parent, joint, size, centre, mass, look], i) => ({
  index: i,
  name,
  parentName: parent,
  parent: -1,
  jointOffset: new Vector3(...joint),
  size: new Vector3(...size),
  half: new Vector3(size[0] / 2, size[1] / 2, size[2] / 2),
  centre: new Vector3(...centre),
  mass,
  look,
  side: name.endsWith('L') ? 1 : name.endsWith('R') ? -1 : 0,
  restJoint: new Vector3(),
  restCentre: new Vector3(),
}));

export const NP = PARTS.length;
export const P = {};
PARTS.forEach((p) => { P[p.name] = p.index; });
for (const p of PARTS) {
  if (p.parentName) p.parent = P[p.parentName];
  p.restJoint.copy(p.jointOffset);
  if (p.parent >= 0) p.restJoint.add(PARTS[p.parent].restJoint);
  p.restCentre.copy(p.restJoint).add(p.centre);
}

export const TOTAL_MASS = PARTS.reduce((s, p) => s + p.mass, 0);
export const STANDING_PELVIS = PARTS[0].restJoint.y;

/** Parts that strike: the two fists. */
export const FISTS = [P.handL, P.handR];

/** Damage multiplier by part. */
export const VITAL = PARTS.map((p) => {
  if (p.name === 'head') return 1.6;
  if (p.name === 'neck') return 1.4;
  if (p.name.includes('Torso')) return 1.0;
  if (p.name === 'pelvis') return 0.9;
  if (p.name.startsWith('hand') || p.name.startsWith('foot')) return 0.4;
  return 0.6;
});

/** How much a hit to the part rocks the whole body. */
export const BALANCE_HIT = PARTS.map((p) => {
  if (p.name === 'head') return 1.5;
  if (p.name === 'neck') return 1.3;
  if (p.name.includes('Torso') || p.name === 'pelvis') return 1.0;
  if (p.name.startsWith('lowerLeg') || p.name.startsWith('foot')) return 1.1;
  return 0.55;
});

/* -------------------------------------------------------------------------- */
/*                        joints, for when muscles let go                     */
/* -------------------------------------------------------------------------- */

const v = (x, y, z) => new Vector3(x, y, z).normalize();

/** The limits each joint keeps in a ragdoll. Hinges fold one way only. */
export const JOINTS = PARTS.filter((p) => p.parent >= 0).map((p) => {
  const n = p.name;
  const s = p.side;
  const base = { child: p.index, parent: p.parent };
  if (n === 'lowerTorso' || n === 'middleTorso' || n === 'upperTorso') {
    return { ...base, type: 'ball', coneAxis: v(0, 1, 0), boneAxis: v(0, 1, 0), coneAngle: 24 * D,
      twistMin: -18 * D, twistMax: 18 * D, damping: 14 };
  }
  if (n === 'neck') {
    return { ...base, type: 'ball', coneAxis: v(0, 1, 0.12), boneAxis: v(0, 1, 0), coneAngle: 32 * D,
      twistMin: -35 * D, twistMax: 35 * D, damping: 8 };
  }
  if (n === 'head') {
    return { ...base, type: 'ball', coneAxis: v(0, 1, 0.1), boneAxis: v(0, 1, 0), coneAngle: 36 * D,
      twistMin: -45 * D, twistMax: 45 * D, damping: 8 };
  }
  if (n.startsWith('upperArm')) {
    return { ...base, type: 'ball', coneAxis: v(0.5 * s, -0.35, 0.62), boneAxis: v(0, -1, 0), coneAngle: 98 * D,
      twistMin: -75 * D, twistMax: 75 * D, damping: 4 };
  }
  if (n.startsWith('lowerArm')) {
    // the elbow: a hinge about X, folding forward only
    return { ...base, type: 'hinge', hinge: v(1, 0, 0), ref: v(0, -1, 0), min: -150 * D, max: 0, damping: 3 };
  }
  if (n.startsWith('hand')) {
    return { ...base, type: 'ball', coneAxis: v(0, -1, 0), boneAxis: v(0, -1, 0), coneAngle: 55 * D,
      twistMin: -40 * D, twistMax: 40 * D, damping: 2 };
  }
  if (n.startsWith('upperLeg')) {
    return { ...base, type: 'ball', coneAxis: v(0.32 * s, -0.72, 0.62), boneAxis: v(0, -1, 0), coneAngle: 70 * D,
      twistMin: -35 * D, twistMax: 35 * D, damping: 6 };
  }
  if (n.startsWith('lowerLeg')) {
    // the knee: folds backwards only
    return { ...base, type: 'hinge', hinge: v(1, 0, 0), ref: v(0, -1, 0), min: 0, max: 150 * D, damping: 4 };
  }
  // the ankle
  return { ...base, type: 'hinge', hinge: v(1, 0, 0), ref: v(0, 0, 1), min: -35 * D, max: 45 * D, damping: 4 };
});

/** Pairs of parts of the same body that may collide with each other. Parts
    that share a joint always touch, and so do a few that lie against each
    other by the shape of a body; those are left out. */
export const SELF_PAIRS = (() => {
  const pairs = new Set();
  const add = (a, b) => { const i = P[a], j = P[b]; pairs.add(Math.min(i, j) * 64 + Math.max(i, j)); };
  for (const s of ['L', 'R']) {
    const o = s === 'L' ? 'R' : 'L';
    for (const arm of ['lowerArm' + s, 'hand' + s]) {
      for (const t of ['upperTorso', 'middleTorso', 'lowerTorso', 'pelvis', 'head',
        'upperLegL', 'upperLegR', 'lowerLegL', 'lowerLegR', 'upperArm' + o, 'lowerArm' + o, 'hand' + o]) add(arm, t);
    }
    for (const t of ['middleTorso', 'lowerTorso', 'pelvis', 'upperLeg' + s]) add('upperArm' + s, t);
    add('lowerLeg' + s, 'upperLeg' + o);
    add('lowerLeg' + s, 'lowerLeg' + o);
    add('foot' + s, 'lowerLeg' + o);
    add('foot' + s, 'foot' + o);
    add('foot' + s, 'upperLeg' + o);
  }
  add('upperLegL', 'upperLegR');
  return pairs;
})();

export function selfCollide(i, j) {
  return SELF_PAIRS.has(Math.min(i, j) * 64 + Math.max(i, j));
}

/* -------------------------------------------------------------------------- */
/*                             forward kinematics                             */
/* -------------------------------------------------------------------------- */

const _jq = [], _jp = [];
for (let i = 0; i < NP; i++) { _jq.push(new Quaternion()); _jp.push(new Vector3()); }
const _t = new Vector3();

/**
 * Poses the body. rootPos/rootQuat place the character (feet on the ground
 * under rootPos); off is the pelvis offset from standing, in root space;
 * q[i] is each joint's rotation relative to its parent.
 * Writes box centres and orientations into outPos/outQuat.
 */
export function forwardKinematics(rootPos, rootQuat, off, q, outPos, outQuat, outJoint = null) {
  for (let i = 0; i < NP; i++) {
    const p = PARTS[i];
    const jp = _jp[i], jq = _jq[i];
    if (p.parent < 0) {
      jp.copy(p.restJoint).add(off).applyQuaternion(rootQuat).add(rootPos);
      jq.copy(rootQuat).multiply(q[i]);
    } else {
      const pq = _jq[p.parent];
      jp.copy(p.jointOffset).applyQuaternion(pq).add(_jp[p.parent]);
      jq.copy(pq).multiply(q[i]);
    }
    outQuat[i].copy(jq);
    outPos[i].copy(p.centre).applyQuaternion(jq).add(jp);
    if (outJoint) outJoint[i].copy(jp);
  }
}

/** Lowest point of any box, given box centres and orientations. */
export function lowestPoint(pos, quat, only = null) {
  let min = Infinity;
  const idx = only || PARTS;
  for (const it of idx) {
    const i = typeof it === 'number' ? it : it.index;
    const h = PARTS[i].half, q = quat[i];
    // extent of the box along world Y
    const x = q.x, y = q.y, z = q.z, w = q.w;
    const r0 = Math.abs(2 * (x * y + w * z));        // X axis . Y
    const r1 = Math.abs(1 - 2 * (x * x + z * z));    // Y axis . Y
    const r2 = Math.abs(2 * (y * z - w * x));        // Z axis . Y
    const low = pos[i].y - (h.x * r0 + h.y * r1 + h.z * r2);
    if (low < min) min = low;
  }
  return min;
}

/** Anchor of a joint in the parent's and the child's body frames (box centres). */
export function jointAnchors(child) {
  const p = PARTS[child];
  const parent = PARTS[p.parent];
  return {
    a: new Vector3().subVectors(p.restJoint, parent.restCentre),
    b: new Vector3().copy(p.centre).negate(),
  };
}

export { D as DEG };
