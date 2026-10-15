/* =============================================================================
   The stickman's skeleton: how long each bone is, what a pose is, and where
   every joint lands for a given pose (forward kinematics).

   A pose is a handful of angles, authored in degrees with "forward" positive
   for every bone, the way an animator thinks about it:

     rot     the whole body: + tips forward onto the face, - back onto the back
     t       the torso, from the hips: + leans forward
     h       the head, on the torso: + nods forward
     aA, aB  arms [shoulder, elbow]: 0 hangs straight down, 90 points ahead,
             180 straight up; the elbow bends the forearm forward and up
     lA, lB  legs [hip, knee]: 0 straight down, 90 thigh level ahead; the knee
             bends the shin back, so it is negative
     x       the hips shifted ahead of the feet (a lunge)
     lift    the whole body raised off the ground (a hop, a bounce)

   A is the near arm and leg, drawn in front of the body; B is the far pair.
   Arm and leg angles are measured from straight down in the body's own frame,
   not along the torso, so a relaxed arm hangs under gravity however far the
   torso leans - which is what arms do.

   Internally every bone becomes one clockwise angle from straight up, so a
   whole-body rotation turns every bone the same way: a body lying on its back
   has its legs pointing away from its head, not back at it.

   A body is "anchored" by its lowest point: whatever pose it is in, the lowest
   thing on it - a foot, a knee, a hand on the floor, the back of a head -
   rests on the ground. So a crouch sinks, a kneel kneels and a fall ends lying
   down, without any clip having to say how high the hips are.
   ========================================================================== */
import { DEG } from '../core/util.js';

/** Bone lengths in metres for a stickman of scale 1, about 1.75 m tall. */
export const DIM = {
  torso: 0.5,
  neck: 0.05,
  headR: 0.155,
  upperArm: 0.29,
  foreArm: 0.28,
  thigh: 0.43,
  shin: 0.43,
  shoulderAt: 0.9,    // how far up the torso the arms hang, as a fraction
  line: 0.07,         // stroke width
};

export const POSE_KEYS = ['rot', 't', 'h', 'aAu', 'aAl', 'aBu', 'aBl', 'lAu', 'lAl', 'lBu', 'lBl', 'x', 'lift'];
const ANGLE_KEYS = new Set(['rot', 't', 'h', 'aAu', 'aAl', 'aBu', 'aBl', 'lAu', 'lAl', 'lBu', 'lBl']);
export const isAngleKey = (k) => ANGLE_KEYS.has(k);

/** A pose from degrees. Anything not given takes a relaxed standing value. */
export function P(o = {}) {
  const aA = o.aA || [6, 12], aB = o.aB || [-5, 12];
  const lA = o.lA || [4, -3], lB = o.lB || [-4, -3];
  return {
    rot: (o.rot || 0) * DEG, t: (o.t ?? 2) * DEG, h: (o.h || 0) * DEG,
    aAu: aA[0] * DEG, aAl: aA[1] * DEG, aBu: aB[0] * DEG, aBl: aB[1] * DEG,
    lAu: lA[0] * DEG, lAl: lA[1] * DEG, lBu: lB[0] * DEG, lBl: lB[1] * DEG,
    x: o.x || 0, lift: o.lift || 0,
    anchor: o.anchor || 'low', hipY: o.hipY || 0,
  };
}

/** The same pose with arm A and B, and leg A and B, swapped. */
export function mirror(p) {
  return {
    ...p,
    aAu: p.aBu, aAl: p.aBl, aBu: p.aAu, aBl: p.aAl,
    lAu: p.lBu, lAl: p.lBl, lBu: p.lAu, lBl: p.lAl,
  };
}

export function copyPose(src, out = {}) {
  for (const k of POSE_KEYS) out[k] = src[k];
  out.anchor = src.anchor;
  out.hipY = src.hipY;
  return out;
}

/** Copies a pose with some fields changed (in degrees, like P). */
export function tweak(p, o) {
  const q = copyPose(p);
  for (const [k, v] of Object.entries(o)) {
    if (k === 'aA') { q.aAu = v[0] * DEG; q.aAl = v[1] * DEG; }
    else if (k === 'aB') { q.aBu = v[0] * DEG; q.aBl = v[1] * DEG; }
    else if (k === 'lA') { q.lAu = v[0] * DEG; q.lAl = v[1] * DEG; }
    else if (k === 'lB') { q.lBu = v[0] * DEG; q.lBl = v[1] * DEG; }
    else if (isAngleKey(k)) q[k] = v * DEG;
    else q[k] = v;
  }
  return q;
}

export const JOINTS = ['hip', 'neck', 'shoulder', 'head', 'elbowA', 'handA', 'elbowB', 'handB', 'kneeA', 'footA', 'kneeB', 'footB'];

/** The bones, as [from, to, body part]. The neck counts as the head. */
export const BONES = [
  ['hip', 'neck', 'torso'],
  ['neck', 'head', 'head'],
  ['shoulder', 'elbowA', 'armA'], ['elbowA', 'handA', 'armA'],
  ['shoulder', 'elbowB', 'armB'], ['elbowB', 'handB', 'armB'],
  ['hip', 'kneeA', 'legA'], ['kneeA', 'footA', 'legA'],
  ['hip', 'kneeB', 'legB'], ['kneeB', 'footB', 'legB'],
];

export function makeJoints() {
  const j = {};
  for (const k of JOINTS) j[k] = { x: 0, y: 0 };
  j.headAngle = 0;
  return j;
}

/**
 * Forward kinematics, in the body's own frame: facing +x, the origin on the
 * ground under the hips. Fills `out` and returns it.
 */
export function solve(p, scale, out) {
  const s = scale;
  const R = p.rot;
  const set = (k, x, y) => { out[k].x = x; out[k].y = y; };

  const ta = R + p.t;
  const tx = Math.sin(ta), ty = Math.cos(ta);
  set('hip', 0, 0);
  set('neck', tx * DIM.torso * s, ty * DIM.torso * s);
  set('shoulder', tx * DIM.torso * DIM.shoulderAt * s, ty * DIM.torso * DIM.shoulderAt * s);
  const ha = ta + p.h;
  out.headAngle = ha;
  const hd = (DIM.neck + DIM.headR) * s;
  set('head', out.neck.x + Math.sin(ha) * hd, out.neck.y + Math.cos(ha) * hd);

  const limb = (from, mid, end, u, l, l1, l2) => {
    const a1 = R + Math.PI - u, a2 = a1 - l;
    const mx = out[from].x + Math.sin(a1) * l1 * s, my = out[from].y + Math.cos(a1) * l1 * s;
    set(mid, mx, my);
    set(end, mx + Math.sin(a2) * l2 * s, my + Math.cos(a2) * l2 * s);
  };
  limb('shoulder', 'elbowA', 'handA', p.aAu, p.aAl, DIM.upperArm, DIM.foreArm);
  limb('shoulder', 'elbowB', 'handB', p.aBu, p.aBl, DIM.upperArm, DIM.foreArm);
  limb('hip', 'kneeA', 'footA', p.lAu, p.lAl, DIM.thigh, DIM.shin);
  limb('hip', 'kneeB', 'footB', p.lBu, p.lBl, DIM.thigh, DIM.shin);

  // rest the lowest thing on the ground, or the hips at a set height
  const half = (DIM.line / 2) * s;
  let dy;
  if (p.anchor === 'hip') {
    dy = p.hipY;
  } else {
    let low = out.head.y - DIM.headR * s - half;
    for (const k of JOINTS) {
      if (k === 'head') continue;
      const y = out[k].y - half;
      if (y < low) low = y;
    }
    dy = -low;
  }
  dy += p.lift;
  for (const k of JOINTS) {
    out[k].x += p.x;
    out[k].y += dy;
  }
  return out;
}

/** The pose's bounding box in its own frame: { minX, maxX, minY, maxY }. */
export function bounds(j, scale, arms = true) {
  const half = (DIM.line / 2) * scale, r = DIM.headR * scale + half;
  let minX = j.head.x - r, maxX = j.head.x + r, minY = j.head.y - r, maxY = j.head.y + r;
  for (const k of JOINTS) {
    if (k === 'head') continue;
    if (!arms && (k === 'elbowA' || k === 'handA' || k === 'elbowB' || k === 'handB')) continue;
    const p = j[k];
    if (p.x - half < minX) minX = p.x - half;
    if (p.x + half > maxX) maxX = p.x + half;
    if (p.y - half < minY) minY = p.y - half;
    if (p.y + half > maxY) maxY = p.y + half;
  }
  return { minX, maxX, minY, maxY };
}
