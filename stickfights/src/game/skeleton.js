/* =============================================================================
   The stickman's skeleton: the bones, how long each one is, what a pose is,
   and where every joint lands for a given pose (forward kinematics).

   The bones are the real ones, as far as a stick figure has them: a skull on
   a neck, a spine in two parts (the lower back, and the upper back with the
   ribs on it) standing on the pelvis, and for each arm a humerus and a
   forearm, for each leg a femur, a tibia and a foot. Every long bone also has
   a point halfway along it, which is where it snaps if it breaks: an intact
   bone runs straight through it, a broken one bends there.

   A pose is a handful of angles, authored in degrees with "forward" positive
   for every bone, the way an animator thinks about it:

     rot     the whole body: + tips forward onto the face, - back onto the back
     t       the torso, from the hips: + leans forward. The lean is spread
             along the spine - a little in the lower back, more in the upper -
             so a body bending over rounds its back instead of hinging
     s       extra bend in the middle of the back (a hunch, an arch)
     h       the head, on the torso: + nods forward
     aA, aB  arms [shoulder, elbow]: 0 hangs straight down, 90 points ahead,
             180 straight up; the elbow bends the forearm forward and up
     lA, lB  legs [hip, knee]: 0 straight down, 90 thigh level ahead; the knee
             bends the shin back, so it is negative
     fA, fB  the ankles: + points the toes, - pulls them up. At 0 the foot is
             square to the shin, so a standing foot is flat and a walking one
             rolls from heel to toe on its own
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
   thing on it - a heel, a knee, a hand on the floor, the back of a head -
   rests on the ground. So a crouch sinks, a kneel kneels and a fall ends lying
   down, without any clip having to say how high the hips are. Toes that would
   go through the floor are laid flat on it instead.
   ========================================================================== */
import { DEG } from '../core/util.js';

/** Bone lengths in metres for a stickman of scale 1, about 1.75 m tall. */
export const DIM = {
  spineLow: 0.25,     // pelvis to the middle of the back
  spineUp: 0.25,      // the middle of the back to the base of the neck
  torso: 0.5,
  neck: 0.05,
  headR: 0.155,
  upperArm: 0.29,
  foreArm: 0.28,
  thigh: 0.43,
  shin: 0.43,
  foot: 0.12,
  shoulderAt: 0.8,    // how far up the upper back the arms hang, as a fraction
  line: 0.07,         // stroke width
};

export const POSE_KEYS = ['rot', 't', 's', 'h', 'aAu', 'aAl', 'aBu', 'aBl', 'lAu', 'lAl', 'lBu', 'lBl', 'fA', 'fB', 'x', 'lift'];
const ANGLE_KEYS = new Set(['rot', 't', 's', 'h', 'aAu', 'aAl', 'aBu', 'aBl', 'lAu', 'lAl', 'lBu', 'lBl', 'fA', 'fB']);
export const isAngleKey = (k) => ANGLE_KEYS.has(k);

/** A pose from degrees. Anything not given takes a relaxed standing value. */
export function P(o = {}) {
  const aA = o.aA || [6, 12], aB = o.aB || [-5, 12];
  const lA = o.lA || [4, -3], lB = o.lB || [-4, -3];
  return {
    rot: (o.rot || 0) * DEG, t: (o.t ?? 2) * DEG, s: (o.s || 0) * DEG, h: (o.h || 0) * DEG,
    aAu: aA[0] * DEG, aAl: aA[1] * DEG, aBu: aB[0] * DEG, aBl: aB[1] * DEG,
    lAu: lA[0] * DEG, lAl: lA[1] * DEG, lBu: lB[0] * DEG, lBl: lB[1] * DEG,
    fA: (o.fA || 0) * DEG, fB: (o.fB || 0) * DEG,
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
    fA: p.fB, fB: p.fA,
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

/** Where a long bone snaps, if it does: halfway along it. */
export const MIDS = ['midHumA', 'midForeA', 'midHumB', 'midForeB', 'midFemA', 'midTibA', 'midFemB', 'midTibB'];
const TOES = new Set(['toeA', 'toeB']);
const MID_SET = new Set(MIDS);

export const JOINTS = [
  'hip', 'chest', 'neck', 'shoulder', 'head',
  'elbowA', 'handA', 'elbowB', 'handB',
  'kneeA', 'footA', 'toeA', 'kneeB', 'footB', 'toeB',
  ...MIDS,
];

/**
 * The bones, as [from, to, body part, bone, break point]. The bone is which
 * one health.js tracks (a foot counts as the ankle end of the tibia); the
 * break point, on the long bones, is where it bends once it has snapped.
 */
export const BONES = [
  ['hip', 'chest', 'torso', 'spine'],                        // 0  the lower back, on the pelvis
  ['chest', 'neck', 'torso', 'ribs'],                        // 1  the upper back and the ribcage
  ['neck', 'head', 'head', 'neck'],                          // 2  the neck; the skull is the circle on top
  ['shoulder', 'elbowA', 'armA', 'humerusA', 'midHumA'],    // 3
  ['elbowA', 'handA', 'armA', 'forearmA', 'midForeA'],      // 4
  ['shoulder', 'elbowB', 'armB', 'humerusB', 'midHumB'],    // 5
  ['elbowB', 'handB', 'armB', 'forearmB', 'midForeB'],      // 6
  ['hip', 'kneeA', 'legA', 'femurA', 'midFemA'],            // 7
  ['kneeA', 'footA', 'legA', 'tibiaA', 'midTibA'],          // 8
  ['footA', 'toeA', 'legA', 'tibiaA'],                       // 9  the foot
  ['hip', 'kneeB', 'legB', 'femurB', 'midFemB'],            // 10
  ['kneeB', 'footB', 'legB', 'tibiaB', 'midTibB'],          // 11
  ['footB', 'toeB', 'legB', 'tibiaB'],                       // 12
];
export const HEAD_BONE = 2;
export const SPINE_BONES = [0, 1];

/** The joints downstream of each break point: what moves when that bone bends. */
export const BELOW_BREAK = {
  midHumA: ['elbowA', 'midForeA', 'handA'], midForeA: ['handA'],
  midHumB: ['elbowB', 'midForeB', 'handB'], midForeB: ['handB'],
  midFemA: ['kneeA', 'midTibA', 'footA', 'toeA'], midTibA: ['footA', 'toeA'],
  midFemB: ['kneeB', 'midTibB', 'footB', 'toeB'], midTibB: ['footB', 'toeB'],
};

export function makeJoints() {
  const j = {};
  for (const k of JOINTS) j[k] = { x: 0, y: 0 };
  j.headAngle = 0;
  return j;
}

/** A point t of the way along bone b (0 at its start, 1 at its end), through the break point if it has one. */
export function pointOnBone(j, b, t, out = { x: 0, y: 0 }) {
  const [from, to, , , mid] = BONES[b];
  const p = j[from], q = j[to];
  if (mid) {
    const m = j[mid];
    if (t < 0.5) { out.x = p.x + (m.x - p.x) * t * 2; out.y = p.y + (m.y - p.y) * t * 2; }
    else { out.x = m.x + (q.x - m.x) * (t * 2 - 1); out.y = m.y + (q.y - m.y) * (t * 2 - 1); }
  } else {
    out.x = p.x + (q.x - p.x) * t;
    out.y = p.y + (q.y - p.y) * t;
  }
  return out;
}

/**
 * The straight pieces bone b is drawn and hit as: one, or two either side of
 * its break point. Each is [ax, ay, bx, by, t0, t1], t0..t1 being that piece's
 * share of the bone.
 */
export function boneSegments(j, b) {
  const [from, to, , , mid] = BONES[b];
  const p = j[from], q = j[to];
  if (!mid) return [[p.x, p.y, q.x, q.y, 0, 1]];
  const m = j[mid];
  return [[p.x, p.y, m.x, m.y, 0, 0.5], [m.x, m.y, q.x, q.y, 0.5, 1]];
}

const dirX = (a) => Math.sin(a), dirY = (a) => Math.cos(a);

/**
 * Forward kinematics, in the body's own frame: facing +x, the origin on the
 * ground under the hips. Fills `out` and returns it.
 */
export function solve(p, scale, out) {
  const s = scale;
  const R = p.rot;
  const set = (k, x, y) => { out[k].x = x; out[k].y = y; };

  // the spine: the lean shared between the lower and the upper back
  const t1 = R + p.t * 0.75, t2 = R + p.t * 1.25 + p.s;
  set('hip', 0, 0);
  const cx = dirX(t1) * DIM.spineLow * s, cy = dirY(t1) * DIM.spineLow * s;
  set('chest', cx, cy);
  const ux = dirX(t2) * DIM.spineUp * s, uy = dirY(t2) * DIM.spineUp * s;
  set('neck', cx + ux, cy + uy);
  set('shoulder', cx + ux * DIM.shoulderAt, cy + uy * DIM.shoulderAt);
  const ha = R + p.t + p.h;
  out.headAngle = ha;
  const hd = (DIM.neck + DIM.headR) * s;
  set('head', out.neck.x + dirX(ha) * hd, out.neck.y + dirY(ha) * hd);

  const limb = (from, mid, end, u, l, l1, l2, m1, m2) => {
    const a1 = R + Math.PI - u, a2 = a1 - l;
    const o = out[from];
    const mx = o.x + dirX(a1) * l1 * s, my = o.y + dirY(a1) * l1 * s;
    set(mid, mx, my);
    set(end, mx + dirX(a2) * l2 * s, my + dirY(a2) * l2 * s);
    set(m1, (o.x + mx) / 2, (o.y + my) / 2);
    set(m2, (mx + out[end].x) / 2, (my + out[end].y) / 2);
    return a2;
  };
  limb('shoulder', 'elbowA', 'handA', p.aAu, p.aAl, DIM.upperArm, DIM.foreArm, 'midHumA', 'midForeA');
  limb('shoulder', 'elbowB', 'handB', p.aBu, p.aBl, DIM.upperArm, DIM.foreArm, 'midHumB', 'midForeB');
  const shinA = limb('hip', 'kneeA', 'footA', p.lAu, p.lAl, DIM.thigh, DIM.shin, 'midFemA', 'midTibA');
  const shinB = limb('hip', 'kneeB', 'footB', p.lBu, p.lBl, DIM.thigh, DIM.shin, 'midFemB', 'midTibB');
  // the foot: square to the shin, toes forward, unless the ankle says otherwise
  const fa = shinA - Math.PI / 2 - p.fA, fb = shinB - Math.PI / 2 - p.fB;
  set('toeA', out.footA.x + dirX(fa) * DIM.foot * s, out.footA.y + dirY(fa) * DIM.foot * s);
  set('toeB', out.footB.x + dirX(fb) * DIM.foot * s, out.footB.y + dirY(fb) * DIM.foot * s);

  // rest the lowest thing on the ground, or the hips at a set height
  const half = (DIM.line / 2) * s;
  let dy;
  if (p.anchor === 'hip') {
    dy = p.hipY;
  } else {
    let low = out.head.y - DIM.headR * s - half;
    for (const k of JOINTS) {
      if (k === 'head' || TOES.has(k) || MID_SET.has(k)) continue;
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
  flattenToes(out, 'footA', 'toeA', DIM.foot * s, half);
  flattenToes(out, 'footB', 'toeB', DIM.foot * s, half);
  return out;
}

/** A toe below the floor, on a foot whose heel is on or above it, is laid flat on the floor. */
function flattenToes(out, foot, toe, len, half) {
  const f = out[foot], t = out[toe];
  if (t.y - half >= 0 || f.y - half < -0.005) return;
  const dy = Math.max(-1, Math.min(1, (half - f.y) / len));
  const dx = Math.sqrt(1 - dy * dy) * (t.x >= f.x ? 1 : -1);
  t.x = f.x + dx * len;
  t.y = f.y + dy * len;
}

/** The pose's bounding box in its own frame: { minX, maxX, minY, maxY }. */
export function bounds(j, scale, arms = true) {
  const half = (DIM.line / 2) * scale, r = DIM.headR * scale + half;
  let minX = j.head.x - r, maxX = j.head.x + r, minY = j.head.y - r, maxY = j.head.y + r;
  for (const k of JOINTS) {
    if (k === 'head') continue;
    if (!arms && ARM_JOINTS.has(k)) continue;
    const p = j[k];
    if (p.x - half < minX) minX = p.x - half;
    if (p.x + half > maxX) maxX = p.x + half;
    if (p.y - half < minY) minY = p.y - half;
    if (p.y + half > maxY) maxY = p.y + half;
  }
  return { minX, maxX, minY, maxY };
}
const ARM_JOINTS = new Set(['elbowA', 'handA', 'elbowB', 'handB', 'midHumA', 'midForeA', 'midHumB', 'midForeB']);

/** Clockwise angle from straight up of the line from a to b. */
export const angleOf = (a, b) => Math.atan2(b.x - a.x, b.y - a.y);
