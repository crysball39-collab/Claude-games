/* =============================================================================
   The human rig.

   Seventeen box shaped parts, sixteen joints. In the rest pose a person
   stands at the origin with their feet on the ground, facing +Z, arms down.
   +X is their LEFT, +Y is up. Every part's own axes line up with the world's
   in that pose, which keeps the joint maths honest: a joint's rest rotation
   is always the identity.

   A pose is forty numbers ("channels"): where the pelvis is, and what each
   joint is doing, in the terms an animator would use - flex this, abduct
   that. `solvePose` turns channels into part transforms.
   ========================================================================== */
import { Body, Island, Joint, BALL, HINGE, newGroup } from '../physics/world.js';

export const P = {
  PELVIS: 0, ABDOMEN: 1, CHEST: 2, NECK: 3, HEAD: 4,
  UARM_L: 5, FARM_L: 6, HAND_L: 7,
  UARM_R: 8, FARM_R: 9, HAND_R: 10,
  THIGH_L: 11, SHIN_L: 12, FOOT_L: 13,
  THIGH_R: 14, SHIN_R: 15, FOOT_R: 16,
};
export const PART_COUNT = 17;

/** name, label, parent, size [w,h,d], centre, mass, what covers it, joint to parent */
export const PARTS = [
  { name: 'pelvis', label: 'hips', parent: -1, size: [0.32, 0.20, 0.20], c: [0, 1.00, 0], mass: 9, cover: 'pants' },
  { name: 'abdomen', label: 'belly', parent: 0, size: [0.29, 0.20, 0.18], c: [0, 1.20, 0], mass: 8, cover: 'shirt',
    joint: { at: [0, 1.10, 0], type: BALL, ref: [0, 1, 0], bone: [0, 1, 0], swing: 0.45, twist: 0.35, damp: 1.2 } },
  { name: 'chest', label: 'chest', parent: 1, size: [0.36, 0.30, 0.22], c: [0, 1.45, 0], mass: 14, cover: 'shirt',
    joint: { at: [0, 1.30, 0], type: BALL, ref: [0, 1, 0], bone: [0, 1, 0], swing: 0.45, twist: 0.45, damp: 1.2 } },
  { name: 'neck', label: 'neck', parent: 2, size: [0.11, 0.08, 0.11], c: [0, 1.64, 0], mass: 1.5, cover: 'skin',
    joint: { at: [0, 1.60, 0], type: BALL, ref: [0, 1, 0], bone: [0, 1, 0], swing: 0.5, twist: 0.5, damp: 1.0 } },
  { name: 'head', label: 'head', parent: 3, size: [0.21, 0.24, 0.22], c: [0, 1.80, 0.01], mass: 5, cover: 'skin',
    joint: { at: [0, 1.68, 0], type: BALL, ref: [0, 1, 0], bone: [0, 1, 0], swing: 0.55, twist: 0.7, damp: 1.0 } },

  { name: 'upperArmL', label: 'left upper arm', parent: 2, size: [0.10, 0.30, 0.10], c: [0.235, 1.41, 0], mass: 2.2, cover: 'shirt',
    joint: { at: [0.235, 1.55, 0], type: BALL, ref: [0.645, -0.591, 0.484], bone: [0, -1, 0], swing: 2.3, twist: 1.3 } },
  { name: 'forearmL', label: 'left forearm', parent: 5, size: [0.085, 0.27, 0.085], c: [0.235, 1.125, 0], mass: 1.4, cover: 'skin',
    joint: { at: [0.235, 1.26, 0], type: HINGE, min: -2.5, max: 0.05 } },
  { name: 'handL', label: 'left hand', parent: 6, size: [0.05, 0.12, 0.09], c: [0.235, 0.93, 0], mass: 0.5, cover: 'skin',
    joint: { at: [0.235, 0.99, 0], type: BALL, ref: [0, -1, 0], bone: [0, -1, 0], swing: 0.8, twist: 0.4 } },

  { name: 'upperArmR', label: 'right upper arm', parent: 2, size: [0.10, 0.30, 0.10], c: [-0.235, 1.41, 0], mass: 2.2, cover: 'shirt',
    joint: { at: [-0.235, 1.55, 0], type: BALL, ref: [-0.645, -0.591, 0.484], bone: [0, -1, 0], swing: 2.3, twist: 1.3 } },
  { name: 'forearmR', label: 'right forearm', parent: 8, size: [0.085, 0.27, 0.085], c: [-0.235, 1.125, 0], mass: 1.4, cover: 'skin',
    joint: { at: [-0.235, 1.26, 0], type: HINGE, min: -2.5, max: 0.05 } },
  { name: 'handR', label: 'right hand', parent: 9, size: [0.05, 0.12, 0.09], c: [-0.235, 0.93, 0], mass: 0.5, cover: 'skin',
    joint: { at: [-0.235, 0.99, 0], type: BALL, ref: [0, -1, 0], bone: [0, -1, 0], swing: 0.8, twist: 0.4 } },

  { name: 'thighL', label: 'left thigh', parent: 0, size: [0.14, 0.44, 0.14], c: [0.10, 0.72, 0], mass: 8, cover: 'pants',
    joint: { at: [0.10, 0.94, 0], type: BALL, ref: [0.12, -0.8, 0.58], bone: [0, -1, 0], swing: 1.2, twist: 0.6 } },
  { name: 'shinL', label: 'left shin', parent: 11, size: [0.11, 0.42, 0.11], c: [0.10, 0.29, 0], mass: 4, cover: 'pants',
    joint: { at: [0.10, 0.50, 0], type: HINGE, min: -0.03, max: 2.4 } },
  { name: 'footL', label: 'left foot', parent: 12, size: [0.10, 0.08, 0.26], c: [0.10, 0.04, 0.05], mass: 1.2, cover: 'shoes',
    joint: { at: [0.10, 0.08, 0], type: HINGE, min: -0.5, max: 0.8 } },

  { name: 'thighR', label: 'right thigh', parent: 0, size: [0.14, 0.44, 0.14], c: [-0.10, 0.72, 0], mass: 8, cover: 'pants',
    joint: { at: [-0.10, 0.94, 0], type: BALL, ref: [-0.12, -0.8, 0.58], bone: [0, -1, 0], swing: 1.2, twist: 0.6 } },
  { name: 'shinR', label: 'right shin', parent: 14, size: [0.11, 0.42, 0.11], c: [-0.10, 0.29, 0], mass: 4, cover: 'pants',
    joint: { at: [-0.10, 0.50, 0], type: HINGE, min: -0.03, max: 2.4 } },
  { name: 'footR', label: 'right foot', parent: 15, size: [0.10, 0.08, 0.26], c: [-0.10, 0.04, 0.05], mass: 1.2, cover: 'shoes',
    joint: { at: [-0.10, 0.08, 0], type: HINGE, min: -0.5, max: 0.8 } },
];

/**
 * The most twist each part's muscles can put out, in newton metres: about
 * half as much again as a strong person manages, so a healthy pose is held
 * without visible strain and a failing one fails where a real one would.
 */
export const MUSCLE_TORQUE = [400, 320, 280, 60, 40, 110, 70, 20, 110, 70, 20, 300, 260, 120, 300, 260, 120];

export const THIGH_LEN = 0.44;
export const SHIN_LEN = 0.42;
export const HIP_HEIGHT = 0.94;
export const PELVIS_HEIGHT = 1.00;
export const STAND_HEIGHT = 1.92;

/** Everything hanging off a part, the part included. */
export const SUBTREE = PARTS.map((_, i) => {
  const out = [i];
  for (let k = i + 1; k < PARTS.length; k++) if (out.includes(PARTS[k].parent)) out.push(k);
  return out;
});
export const CHILDREN = PARTS.map((_, i) => PARTS.map((p, k) => (p.parent === i ? k : -1)).filter((k) => k >= 0));

/* local anchors, worked out once */
for (const p of PARTS) {
  if (!p.joint) continue;
  const par = PARTS[p.parent];
  p.la = [p.joint.at[0] - par.c[0], p.joint.at[1] - par.c[1], p.joint.at[2] - par.c[2]];
  p.lb = [p.joint.at[0] - p.c[0], p.joint.at[1] - p.c[1], p.joint.at[2] - p.c[2]];
}

/* ------------------------------- channels --------------------------------- */

export const CH = {
  rootX: 0, rootY: 1, rootZ: 2, rootPitch: 3, rootYaw: 4, rootRoll: 5,
  waistBend: 6, waistTwist: 7, waistSide: 8,
  spineBend: 9, spineTwist: 10, spineSide: 11,
  neckBend: 12, neckTwist: 13, neckSide: 14,
  headBend: 15, headTwist: 16, headSide: 17,
  shL: 18, shLOut: 19, shLIn: 20, elL: 21, wrL: 22, wrLSide: 23,
  shR: 24, shROut: 25, shRIn: 26, elR: 27, wrR: 28, wrRSide: 29,
  hipL: 30, hipLOut: 31, hipLTwist: 32, kneeL: 33, ankleL: 34,
  hipR: 35, hipROut: 36, hipRTwist: 37, kneeR: 38, ankleR: 39,
};
export const CHANNELS = 40;

const _qa = [0, 0, 0, 1], _qb = [0, 0, 0, 1], _qc = [0, 0, 0, 1];

function qmul(a, b, out) {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = b[3];
  out[0] = aw * bx + ax * bw + ay * bz - az * by;
  out[1] = aw * by - ax * bz + ay * bw + az * bx;
  out[2] = aw * bz + ax * by - ay * bx + az * bw;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}
function qrot(q, x, y, z, out) {
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  out[0] = x + qw * tx + (qy * tz - qz * ty);
  out[1] = y + qw * ty + (qz * tx - qx * tz);
  out[2] = z + qw * tz + (qx * ty - qy * tx);
  return out;
}
/** q = Ry(y) * Rz(z) * Rx(x), written into out at offset o. */
function yzx(y, z, x, out, o) {
  const sx = Math.sin(x * 0.5), cx = Math.cos(x * 0.5);
  const sy = Math.sin(y * 0.5), cy = Math.cos(y * 0.5);
  const sz = Math.sin(z * 0.5), cz = Math.cos(z * 0.5);
  const mx = cz * sx, my = sz * sx, mz = sz * cx, mw = cz * cx;
  out[o] = cy * mx + sy * mz;
  out[o + 1] = cy * my + sy * mw;
  out[o + 2] = cy * mz - sy * mx;
  out[o + 3] = cy * mw - sy * my;
}

/**
 * Channels to joint rotations: each part's rotation relative to its parent,
 * four numbers per part. Part 0 is the pelvis relative to the character.
 */
export function channelsToLocal(ch, out) {
  // bend forward is +X, turn left is +Y, lean left is -Z
  yzx(ch[CH.rootYaw], -ch[CH.rootRoll], ch[CH.rootPitch], out, 0);
  yzx(ch[CH.waistTwist], -ch[CH.waistSide], ch[CH.waistBend], out, 4);
  yzx(ch[CH.spineTwist], -ch[CH.spineSide], ch[CH.spineBend], out, 8);
  yzx(ch[CH.neckTwist], -ch[CH.neckSide], ch[CH.neckBend], out, 12);
  yzx(ch[CH.headTwist], -ch[CH.headSide], ch[CH.headBend], out, 16);
  // arms: raise forward is -X; out to the side is +Z on the left, -Z on the
  // right; "in" swings a raised arm across the body
  yzx(-ch[CH.shLIn], ch[CH.shLOut], -ch[CH.shL], out, 20);
  yzx(0, 0, -ch[CH.elL], out, 24);
  yzx(0, ch[CH.wrLSide], -ch[CH.wrL], out, 28);
  yzx(ch[CH.shRIn], -ch[CH.shROut], -ch[CH.shR], out, 32);
  yzx(0, 0, -ch[CH.elR], out, 36);
  yzx(0, -ch[CH.wrRSide], -ch[CH.wrR], out, 40);
  // legs: thigh forward is -X, knee folds +X, toes up is -X
  yzx(ch[CH.hipLTwist], ch[CH.hipLOut], -ch[CH.hipL], out, 44);
  yzx(0, 0, ch[CH.kneeL], out, 48);
  yzx(0, 0, -ch[CH.ankleL], out, 52);
  yzx(-ch[CH.hipRTwist], -ch[CH.hipROut], -ch[CH.hipR], out, 56);
  yzx(0, 0, ch[CH.kneeR], out, 60);
  yzx(0, 0, -ch[CH.ankleR], out, 64);
  return out;
}

const _v = [0, 0, 0], _w = [0, 0, 0];

/**
 * Forward kinematics. Given where the character stands, which way it faces
 * and its joint rotations, fills `pos` (3 per part) and `quat` (4 per part)
 * in world space.
 */
export function solvePose(x, y, z, yaw, scale, ch, local, pos, quat) {
  const sy = Math.sin(yaw * 0.5), cy = Math.cos(yaw * 0.5);
  _qa[0] = 0; _qa[1] = sy; _qa[2] = 0; _qa[3] = cy;
  // pelvis
  _qb[0] = local[0]; _qb[1] = local[1]; _qb[2] = local[2]; _qb[3] = local[3];
  qmul(_qa, _qb, _qc);
  quat[0] = _qc[0]; quat[1] = _qc[1]; quat[2] = _qc[2]; quat[3] = _qc[3];
  qrot(_qa, ch[CH.rootX] * scale, (PELVIS_HEIGHT + ch[CH.rootY]) * scale, ch[CH.rootZ] * scale, _v);
  pos[0] = x + _v[0]; pos[1] = y + _v[1]; pos[2] = z + _v[2];
  for (let i = 1; i < PART_COUNT; i++) {
    const p = PARTS[i], par = p.parent, o = i * 4, po = par * 4;
    _qa[0] = quat[po]; _qa[1] = quat[po + 1]; _qa[2] = quat[po + 2]; _qa[3] = quat[po + 3];
    _qb[0] = local[o]; _qb[1] = local[o + 1]; _qb[2] = local[o + 2]; _qb[3] = local[o + 3];
    qmul(_qa, _qb, _qc);
    quat[o] = _qc[0]; quat[o + 1] = _qc[1]; quat[o + 2] = _qc[2]; quat[o + 3] = _qc[3];
    qrot(_qa, p.la[0] * scale, p.la[1] * scale, p.la[2] * scale, _v);
    qrot(_qc, p.lb[0] * scale, p.lb[1] * scale, p.lb[2] * scale, _w);
    pos[i * 3] = pos[par * 3] + _v[0] - _w[0];
    pos[i * 3 + 1] = pos[par * 3 + 1] + _v[1] - _w[1];
    pos[i * 3 + 2] = pos[par * 3 + 2] + _v[2] - _w[2];
  }
}

/**
 * Two bone leg: where should the hip and knee be for the ankle to sit at a
 * point given relative to the hip? side is +1 left, -1 right; out is how far
 * to that side, down is how far below, fwd how far in front (all unscaled).
 * Writes flex, outward, knee into out[0..2].
 */
export function legIK(out3, outward, down, fwd) {
  const L1 = THIGH_LEN, L2 = SHIN_LEN;
  const abd = Math.atan2(outward, Math.max(0.05, down));
  const dd = Math.hypot(outward, down);
  let D = Math.hypot(dd, fwd);
  const maxD = L1 + L2 - 0.004, minD = 0.16;
  if (D > maxD) D = maxD; else if (D < minD) D = minD;
  const kInt = Math.acos(clampUnit((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2)));
  const knee = Math.PI - kInt;
  const alpha = Math.atan2(fwd, dd);
  const beta = Math.acos(clampUnit((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D)));
  out3[0] = alpha + beta;
  out3[1] = abd;
  out3[2] = knee;
  return out3;
}
function clampUnit(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }

/* ------------------------------ physics bodies ---------------------------- */

function limbSpheres(hx, hy, hz) {
  const r = Math.max(hx, hz);
  const off = hy - r;
  if (off < r * 0.4) return [0, 0, 0, Math.min(r, hy)];
  return [0, off, 0, r, 0, -off, 0, r];
}

const SPHERES = {
  pelvis: (s) => [0.07 * s, 0, 0, 0.105 * s, -0.07 * s, 0, 0, 0.105 * s],
  abdomen: (s) => [0.06 * s, 0, 0, 0.095 * s, -0.06 * s, 0, 0, 0.095 * s],
  chest: (s) => [0.075 * s, 0.01 * s, 0, 0.115 * s, -0.075 * s, 0.01 * s, 0, 0.115 * s],
  neck: (s) => [0, 0, 0, 0.055 * s],
  head: (s) => [0, 0, 0, 0.115 * s],
  handL: (s) => [0, 0, 0, 0.05 * s], handR: (s) => [0, 0, 0, 0.05 * s],
  footL: (s) => [0, 0, -0.055 * s, 0.045 * s, 0, 0, 0.07 * s, 0.045 * s],
  footR: (s) => [0, 0, -0.055 * s, 0.045 * s, 0, 0, 0.07 * s, 0.045 * s],
};

/** Pairs inside one body that are allowed to collide with each other. */
const SELF_PAIRS = [
  [P.FARM_L, P.CHEST], [P.FARM_L, P.ABDOMEN], [P.FARM_L, P.PELVIS], [P.HAND_L, P.CHEST], [P.HAND_L, P.ABDOMEN],
  [P.HAND_L, P.PELVIS], [P.HAND_L, P.HEAD], [P.FARM_L, P.HEAD],
  [P.FARM_R, P.CHEST], [P.FARM_R, P.ABDOMEN], [P.FARM_R, P.PELVIS], [P.HAND_R, P.CHEST], [P.HAND_R, P.ABDOMEN],
  [P.HAND_R, P.PELVIS], [P.HAND_R, P.HEAD], [P.FARM_R, P.HEAD],
  [P.SHIN_L, P.SHIN_R], [P.THIGH_L, P.THIGH_R], [P.FOOT_L, P.FOOT_R], [P.SHIN_L, P.THIGH_R], [P.SHIN_R, P.THIGH_L],
  [P.FOOT_L, P.SHIN_R], [P.FOOT_R, P.SHIN_L], [P.FARM_L, P.FARM_R], [P.HAND_L, P.THIGH_L], [P.HAND_R, P.THIGH_R],
];

/**
 * Builds the seventeen bodies and sixteen joints for one person, standing at
 * the origin. Returns { island, bodies, joints, group }.
 */
export function buildRagdoll(world, owner, scale = 1) {
  const island = new Island(owner);
  const group = newGroup();
  const bodies = [], joints = [];
  for (let i = 0; i < PART_COUNT; i++) {
    const p = PARTS[i];
    const hx = p.size[0] * 0.5 * scale, hy = p.size[1] * 0.5 * scale, hz = p.size[2] * 0.5 * scale;
    const sph = SPHERES[p.name] ? SPHERES[p.name](scale) : limbSpheres(hx, hy, hz);
    const b = new Body({
      hx, hy, hz, mass: p.mass * scale * scale * scale,
      x: p.c[0] * scale, y: p.c[1] * scale, z: p.c[2] * scale,
      group, owner, part: i, kind: 'part', sph,
      friction: 0.85, linDamp: 0.05, angDamp: 0.9,
    });
    island.add(b);
    bodies.push(b);
  }
  for (let i = 1; i < PART_COUNT; i++) {
    const p = PARTS[i], jd = p.joint;
    const j = new Joint(bodies[p.parent], bodies[i], {
      la: [p.la[0] * scale, p.la[1] * scale, p.la[2] * scale],
      lb: [p.lb[0] * scale, p.lb[1] * scale, p.lb[2] * scale],
      type: jd.type, min: jd.min, max: jd.max,
      refAxis: jd.ref, boneAxis: jd.bone, swing: jd.swing, twist: jd.twist,
      damp: jd.damp ?? 0.6, name: p.name,
    });
    j.child = i;
    world.addJoint(j);
    joints.push(j);
  }
  const sp = [];
  for (const [a, b] of SELF_PAIRS) sp.push(bodies[a], bodies[b]);
  island.selfPairs = sp;
  world.addIsland(island);
  return { island, bodies, joints, group };
}
