/* =============================================================================
   Animation.

   A pose is a pelvis offset plus one Euler rotation per joint (order YXZ:
   twist about the parent's up axis last), relative to the parent. Clips are
   keyframed poses sampled with a Catmull-Rom spline so motion flows through
   the keys instead of stopping at each one. Walking and running are not
   keyframed at all: they are written as functions of the gait phase, so the
   stride can stretch with speed and blend smoothly between the two.

   Sign conventions, so the numbers below can be read:
     arms and legs (hanging down): x < 0 swings forward, x > 0 back
     elbows fold at x < 0, knees fold at x > 0
     spine, neck, head (pointing up): x > 0 bends forward
     abduction: +z moves a left limb out, -z a right one
     y is twist about the vertical; +y turns the chest to the right (left
       shoulder back)
   ========================================================================== */
import { Vector3, Quaternion, Euler } from 'three';
import { PARTS, NP, P } from './rig.js';

const D = Math.PI / 180;
const TAU = Math.PI * 2;

export function makePose() {
  return { off: new Vector3(), e: new Float32Array(NP * 3) };
}

export function copyPose(dst, src) {
  dst.off.copy(src.off);
  dst.e.set(src.e);
  return dst;
}

/** Builds a pose from { joint: [x,y,z] degrees }. A name without L/R sets both
    sides, mirrored. `off` is the pelvis offset in metres. */
export function pose(spec) {
  const p = makePose();
  for (const key of Object.keys(spec)) {
    const val = spec[key];
    if (key === 'off') { p.off.set(val[0], val[1], val[2]); continue; }
    if (P[key] !== undefined) {
      setJ(p.e, P[key], val[0], val[1] || 0, val[2] || 0);
    } else if (P[key + 'L'] !== undefined) {
      setJ(p.e, P[key + 'L'], val[0], val[1] || 0, val[2] || 0);
      setJ(p.e, P[key + 'R'], val[0], -(val[1] || 0), -(val[2] || 0));
    } else {
      throw new Error('unknown joint ' + key);
    }
  }
  return p;
}

function setJ(e, i, x, y, z) { e[i * 3] = x * D; e[i * 3 + 1] = y * D; e[i * 3 + 2] = z * D; }

/** Left becomes right. */
const MIRROR = PARTS.map((p) => {
  if (p.side === 0) return p.index;
  const other = p.name.slice(0, -1) + (p.side > 0 ? 'R' : 'L');
  return P[other];
});

export function mirrorPose(src, dst = makePose()) {
  const tmp = new Float32Array(NP * 3);
  for (let i = 0; i < NP; i++) {
    const j = MIRROR[i];
    tmp[j * 3] = src.e[i * 3];
    tmp[j * 3 + 1] = -src.e[i * 3 + 1];
    tmp[j * 3 + 2] = -src.e[i * 3 + 2];
  }
  dst.e.set(tmp);
  dst.off.set(-src.off.x, src.off.y, src.off.z);
  return dst;
}

export function lerpPose(out, a, b, t) {
  out.off.lerpVectors(a.off, b.off, t);
  for (let i = 0; i < out.e.length; i++) out.e[i] = a.e[i] + (b.e[i] - a.e[i]) * t;
  return out;
}

/** Blends b over out for the given parts only. */
export function blendParts(out, b, t, parts) {
  if (t <= 0) return out;
  for (const i of parts) {
    for (let k = 0; k < 3; k++) {
      const j = i * 3 + k;
      out.e[j] += (b.e[j] - out.e[j]) * t;
    }
  }
  return out;
}

const _eu = new Euler(0, 0, 0, 'YXZ');
/** Euler angles to joint quaternions. */
export function poseQuats(p, out) {
  for (let i = 0; i < NP; i++) {
    _eu.set(p.e[i * 3], p.e[i * 3 + 1], p.e[i * 3 + 2], 'YXZ');
    out[i].setFromEuler(_eu);
  }
  return out;
}

export const UPPER = ['lowerTorso', 'middleTorso', 'upperTorso', 'neck', 'head',
  'upperArmL', 'lowerArmL', 'handL', 'upperArmR', 'lowerArmR', 'handR'].map((n) => P[n]);
export const ARMS = ['upperArmL', 'lowerArmL', 'handL', 'upperArmR', 'lowerArmR', 'handR'].map((n) => P[n]);
export const ARM_L = ['upperArmL', 'lowerArmL', 'handL'].map((n) => P[n]);
export const ARM_R = ['upperArmR', 'lowerArmR', 'handR'].map((n) => P[n]);
export const LEGS = ['upperLegL', 'lowerLegL', 'footL', 'upperLegR', 'lowerLegR', 'footR'].map((n) => P[n]);
export const ALL = PARTS.map((p) => p.index);

/* -------------------------------------------------------------------------- */
/*                                    clips                                   */
/* -------------------------------------------------------------------------- */

export class Clip {
  /**
   * keys: [[time, pose], ...]. opts.active: [from, to] - the window in which
   * the strike can land. opts.reach: [from, peak, to] for aiming.
   */
  constructor(name, keys, opts = {}) {
    this.name = name;
    this.times = keys.map((k) => k[0]);
    this.poses = keys.map((k) => k[1]);
    this.duration = this.times[this.times.length - 1];
    this.active = opts.active || null;
    this.reach = opts.reach || null;
    this.parts = opts.parts || ALL;
    this.striker = opts.striker != null ? opts.striker : -1;
    this.kind = opts.kind || '';
    this.side = opts.side || 0;
  }

  /** Samples the clip at time t into out. */
  sample(t, out) {
    const T = this.times, Ps = this.poses, n = T.length;
    if (t <= T[0]) return copyPose(out, Ps[0]);
    if (t >= T[n - 1]) return copyPose(out, Ps[n - 1]);
    let k = 0;
    while (k < n - 2 && t > T[k + 1]) k++;
    const u = (t - T[k]) / (T[k + 1] - T[k]);
    const p0 = Ps[Math.max(0, k - 1)], p1 = Ps[k], p2 = Ps[k + 1], p3 = Ps[Math.min(n - 1, k + 2)];
    const u2 = u * u, u3 = u2 * u;
    // Catmull-Rom
    const c0 = -0.5 * u3 + u2 - 0.5 * u;
    const c1 = 1.5 * u3 - 2.5 * u2 + 1;
    const c2 = -1.5 * u3 + 2 * u2 + 0.5 * u;
    const c3 = 0.5 * u3 - 0.5 * u2;
    const e = out.e;
    for (let i = 0; i < e.length; i++) {
      e[i] = p0.e[i] * c0 + p1.e[i] * c1 + p2.e[i] * c2 + p3.e[i] * c3;
    }
    out.off.set(
      p0.off.x * c0 + p1.off.x * c1 + p2.off.x * c2 + p3.off.x * c3,
      p0.off.y * c0 + p1.off.y * c1 + p2.off.y * c2 + p3.off.y * c3,
      p0.off.z * c0 + p1.off.z * c1 + p2.off.z * c2 + p3.off.z * c3,
    );
    return out;
  }

  /** 0..1, how far into its reach the strike is. */
  reachAt(t) {
    if (!this.reach) return 0;
    const [a, b, c] = this.reach;
    if (t <= a || t >= c) return 0;
    if (t < b) return smooth((t - a) / (b - a));
    return 1 - smooth((t - b) / (c - b));
  }
}

function smooth(x) { return x * x * (3 - 2 * x); }

/* ----------------------------- standing poses ---------------------------- */

export const IDLE = pose({
  upperArm: [3, 0, 7], lowerArm: [-12, 0, 0], hand: [0, 0, 0],
  upperLeg: [-2, 0, 2], lowerLeg: [4, 0, 0], foot: [-2, 0, 0],
  neck: [2, 0, 0],
});

/** Fists up, chin down, ready. */
export const GUARD = pose({
  lowerTorso: [2, 0, 0], middleTorso: [3, 0, 0], upperTorso: [4, 0, 0],
  neck: [-2, 0, 0], head: [2, 0, 0],
  upperArm: [-36, -24, 10], lowerArm: [-122, 0, 0], hand: [-8, 0, 0],
});

/** Legs for a fighting stance: left foot forward, knees soft. */
export const STANCE = pose({
  pelvis: [0, 10, 0],
  lowerTorso: [0, -4, 0], middleTorso: [0, -3, 0],
  upperLegL: [-14, -4, 4], lowerLegL: [16, 0, 0], footL: [-2, 0, 0],
  upperLegR: [8, -8, -5], lowerLegR: [16, 0, 0], footR: [-14, 0, 0],
  head: [0, -6, 0],
});

/** Carrying a weapon in the right hand, raised and ready. */
export const HOLD = pose({
  lowerTorso: [2, 0, 0], middleTorso: [3, 0, 0], upperTorso: [4, 0, 0],
  upperArmL: [-36, -24, 10], lowerArmL: [-118, 0, 0], handL: [-8, 0, 0],
  upperArmR: [-24, 18, -16], lowerArmR: [-74, 0, 0], handR: [-20, 0, 0],
});

/** Arms thrown out, for staggering. */
export const FLAIL = pose({
  upperArm: [-30, 0, 62], lowerArm: [-40, 0, 0], hand: [0, 0, 0],
  upperTorso: [-6, 0, 0], neck: [-6, 0, 0], head: [-6, 0, 0],
});

/* ---------------------------------- jabs --------------------------------- */

const JAB_OUT = {
  lowerTorso: [5, -6, 0], middleTorso: [6, -9, 0], upperTorso: [6, -16, 0],
  neck: [-2, 10, 0], head: [2, 14, 0],
  upperArmL: [-86, -14, -2], lowerArmL: [-6, 0, 0], handL: [6, 0, 0],
  upperArmR: [-34, -22, -10], lowerArmR: [-124, 0, 0], handR: [-8, 0, 0],
};
const JAB_WIND = {
  lowerTorso: [2, 3, 0], middleTorso: [3, 4, 0], upperTorso: [4, 6, 0],
  neck: [-2, -3, 0], head: [2, -3, 0],
  upperArmL: [-30, -22, 14], lowerArmL: [-128, 0, 0], handL: [-8, 0, 0],
  upperArmR: [-36, -24, -10], lowerArmR: [-122, 0, 0], handR: [-8, 0, 0],
};

export const JAB_L = new Clip('jabL', [
  [0, GUARD],
  [0.06, pose(JAB_WIND)],
  [0.15, pose(JAB_OUT)],
  [0.2, pose(JAB_OUT)],
  [0.42, GUARD],
], { active: [0.08, 0.23], reach: [0.05, 0.15, 0.3], parts: UPPER, striker: P.handL, kind: 'jab', side: 1 });

export const JAB_R = new Clip('jabR', [
  [0, GUARD],
  [0.06, mirrorPose(pose(JAB_WIND))],
  [0.15, mirrorPose(pose(JAB_OUT))],
  [0.2, mirrorPose(pose(JAB_OUT))],
  [0.42, GUARD],
], { active: [0.08, 0.23], reach: [0.05, 0.15, 0.3], parts: UPPER, striker: P.handR, kind: 'jab', side: -1 });

/* ------------------------------ weapon swings ---------------------------- */
/* The weapon sits in the right fist pointing along the hand's +Z. */

const GUARD_L = { upperArmL: [-36, -24, 10], lowerArmL: [-118, 0, 0], handL: [-8, 0, 0] };

/** Forehand: cocked high over the right shoulder, chopped down and across. */
export const SWING_R = new Clip('swingR', [
  [0, HOLD],
  [0.2, pose({
    ...GUARD_L,
    lowerTorso: [0, -8, 0], middleTorso: [0, -12, 0], upperTorso: [-2, -18, 0],
    neck: [0, 10, 0], head: [0, 14, 0],
    upperArmR: [-150, 30, -30], lowerArmR: [-80, 0, 0], handR: [-30, 0, 0],
  })],
  [0.34, pose({
    ...GUARD_L,
    lowerTorso: [6, 8, 0], middleTorso: [8, 12, 0], upperTorso: [8, 18, 0],
    neck: [0, -10, 0], head: [4, -14, 0],
    upperArmR: [-88, -10, -6], lowerArmR: [-8, 0, 0], handR: [40, 0, 0],
  })],
  [0.44, pose({
    ...GUARD_L,
    lowerTorso: [8, 14, 0], middleTorso: [10, 18, 0], upperTorso: [10, 24, 0],
    neck: [0, -12, 0], head: [4, -16, 0],
    upperArmR: [-50, -30, 12], lowerArmR: [-20, 0, 0], handR: [50, 0, 0],
  })],
  [0.78, HOLD],
], { active: [0.24, 0.42], reach: [0.2, 0.33, 0.45], parts: UPPER, striker: P.handR, kind: 'swing', side: -1 });

/** Backhand: wound up over the left shoulder, swept across to the right. */
export const SWING_L = new Clip('swingL', [
  [0, HOLD],
  [0.2, pose({
    ...GUARD_L,
    lowerTorso: [0, 8, 0], middleTorso: [0, 12, 0], upperTorso: [-2, 20, 0],
    neck: [0, -10, 0], head: [0, -16, 0],
    upperArmR: [-120, -40, 20], lowerArmR: [-110, 0, 0], handR: [-20, 0, 0],
  })],
  [0.34, pose({
    ...GUARD_L,
    lowerTorso: [6, -6, 0], middleTorso: [8, -10, 0], upperTorso: [8, -14, 0],
    neck: [0, 8, 0], head: [4, 12, 0],
    upperArmR: [-90, -8, -2], lowerArmR: [-6, 0, 0], handR: [40, 0, 0],
  })],
  [0.44, pose({
    ...GUARD_L,
    lowerTorso: [6, -12, 0], middleTorso: [8, -16, 0], upperTorso: [8, -22, 0],
    neck: [0, 12, 0], head: [4, 16, 0],
    upperArmR: [-62, 30, -36], lowerArmR: [-14, 0, 0], handR: [40, 0, 0],
  })],
  [0.78, HOLD],
], { active: [0.24, 0.42], reach: [0.2, 0.33, 0.45], parts: UPPER, striker: P.handR, kind: 'swing', side: 1 });

/* --------------------------------- pick up ------------------------------- */

export const PICKUP = new Clip('pickup', [
  [0, IDLE],
  [0.3, pose({
    lowerTorso: [22, 0, 0], middleTorso: [22, 0, 0], upperTorso: [16, 0, 0], neck: [10, 0, 0],
    upperLeg: [-70, 0, 6], lowerLeg: [95, 0, 0], foot: [-25, 0, 0],
    upperArmL: [-30, 0, 10], lowerArmL: [-30, 0, 0],
    upperArmR: [-55, 10, -8], lowerArmR: [-8, 0, 0],
  })],
  [0.42, pose({
    lowerTorso: [22, 0, 0], middleTorso: [22, 0, 0], upperTorso: [16, 0, 0], neck: [10, 0, 0],
    upperLeg: [-70, 0, 6], lowerLeg: [95, 0, 0], foot: [-25, 0, 0],
    upperArmL: [-30, 0, 10], lowerArmL: [-30, 0, 0],
    upperArmR: [-50, 10, -8], lowerArmR: [-20, 0, 0],
  })],
  [0.75, IDLE],
], { kind: 'pickup' });

/* --------------------------------- get up -------------------------------- */
/* Each starts lying the way a ragdoll lands and ends standing. The pelvis
   height is not authored: the body is lowered until its lowest point touches
   the ground, so only the shape of each key matters. `off.z` is how far the
   pelvis travels forward while getting up. */

/** Flat on the back, head toward -Z: sit up, tuck, rock onto the feet, stand. */
export const GETUP_BACK = new Clip('getupBack', [
  [0, pose({ pelvis: [-90, 0, 0], upperArm: [0, 0, 10], lowerArm: [-10, 0, 0], foot: [20, 0, 0] })],
  [0.32, pose({
    pelvis: [-88, 0, 0], lowerTorso: [16, 0, 0], middleTorso: [14, 0, 0], upperTorso: [12, 0, 0], neck: [14, 0, 0],
    upperArm: [-30, 0, 16], lowerArm: [-30, 0, 0],
    upperLeg: [-40, 0, 6], lowerLeg: [80, 0, 0], foot: [10, 0, 0],
  })],
  [0.7, pose({
    pelvis: [-30, 0, 0], lowerTorso: [18, 0, 0], middleTorso: [16, 0, 0], upperTorso: [14, 0, 0], neck: [6, 0, 0],
    upperArm: [-60, 0, 16], lowerArm: [-20, 0, 0],
    upperLeg: [-112, 0, 10], lowerLeg: [104, 0, 0], foot: [38, 0, 0],
  })],
  [1.05, pose({
    off: [0, 0, 0.4],
    pelvis: [12, 0, 0], lowerTorso: [16, 0, 0], middleTorso: [14, 0, 0], upperTorso: [12, 0, 0], neck: [-6, 0, 0], head: [-8, 0, 0],
    upperArm: [-75, 0, 14], lowerArm: [-24, 0, 0],
    upperLeg: [-96, 0, 10], lowerLeg: [118, 0, 0], foot: [-30, 0, 0],
  })],
  [1.45, pose({
    off: [0, 0, 0.56],
    pelvis: [8, 0, 0], lowerTorso: [8, 0, 0], middleTorso: [6, 0, 0], upperTorso: [4, 0, 0], neck: [-2, 0, 0],
    upperArm: [-30, 0, 10], lowerArm: [-30, 0, 0],
    upperLeg: [-52, 0, 4], lowerLeg: [70, 0, 0], foot: [-18, 0, 0],
  })],
  [1.85, pose({
    off: [0, 0, 0.6],
    upperArm: [3, 0, 7], lowerArm: [-12, 0, 0],
    upperLeg: [-2, 0, 2], lowerLeg: [4, 0, 0], foot: [-2, 0, 0], neck: [2, 0, 0],
  })],
], { kind: 'getup' });

/** Face down, head toward +Z: hands under the shoulders, push up, knees in, stand. */
export const GETUP_FRONT = new Clip('getupFront', [
  [0, pose({ pelvis: [90, 0, 0], upperArm: [0, 0, 12], lowerArm: [-10, 0, 0], foot: [30, 0, 0] })],
  [0.35, pose({
    pelvis: [90, 0, 0], neck: [-10, 0, 0], head: [-10, 0, 0],
    upperArm: [-28, 0, 36], lowerArm: [-110, 0, 0], hand: [-30, 0, 0],
    foot: [30, 0, 0],
  })],
  [0.75, pose({
    pelvis: [72, 0, 0], lowerTorso: [-14, 0, 0], middleTorso: [-12, 0, 0], upperTorso: [-6, 0, 0], neck: [-14, 0, 0],
    upperArm: [-78, 0, 16], lowerArm: [-12, 0, 0], hand: [-50, 0, 0],
    upperLeg: [-20, 0, 4], lowerLeg: [40, 0, 0], foot: [30, 0, 0],
  })],
  [1.15, pose({
    off: [0, 0, -0.05],
    pelvis: [62, 0, 0], lowerTorso: [6, 0, 0], middleTorso: [6, 0, 0], upperTorso: [4, 0, 0], neck: [-20, 0, 0], head: [-10, 0, 0],
    upperArm: [-76, 0, 12], lowerArm: [-6, 0, 0], hand: [-50, 0, 0],
    upperLeg: [-62, 0, 6], lowerLeg: [96, 0, 0], foot: [40, 0, 0],
  })],
  [1.55, pose({
    off: [0, 0, 0.1],
    pelvis: [26, 0, 0], lowerTorso: [14, 0, 0], middleTorso: [12, 0, 0], upperTorso: [10, 0, 0], neck: [-12, 0, 0], head: [-10, 0, 0],
    upperArm: [-50, 0, 12], lowerArm: [-30, 0, 0],
    upperLeg: [-96, 0, 10], lowerLeg: [110, 0, 0], foot: [-36, 0, 0],
  })],
  [2.0, pose({
    off: [0, 0, 0.18],
    upperArm: [3, 0, 7], lowerArm: [-12, 0, 0],
    upperLeg: [-2, 0, 2], lowerLeg: [4, 0, 0], foot: [-2, 0, 0], neck: [2, 0, 0],
  })],
], { kind: 'getup' });

/* -------------------------------------------------------------------------- */
/*                               walking, running                             */
/* -------------------------------------------------------------------------- */

/** Metres covered by one full gait cycle (two steps). */
export const WALK_STRIDE = 1.45;
export const RUN_STRIDE = 2.5;
export const WALK_SPEED = 1.5;
export const RUN_SPEED = 4.2;

function bump(x, centre, width) {
  let d = x - centre;
  d -= Math.round(d);
  if (Math.abs(d) > width) return 0;
  return 0.5 + 0.5 * Math.cos((d / width) * Math.PI);
}

const _W = makePose(), _R = makePose();

function gait(out, phase, run, idleT) {
  const e = out.e;
  e.fill(0);
  out.off.set(0, 0, 0);
  for (const side of [1, -1]) {
    const ph = side > 0 ? phase : phase + 0.5;
    const c = Math.cos(ph * TAU);
    const ul = P[side > 0 ? 'upperLegL' : 'upperLegR'];
    const ll = P[side > 0 ? 'lowerLegL' : 'lowerLegR'];
    const ft = P[side > 0 ? 'footL' : 'footR'];
    const ua = P[side > 0 ? 'upperArmL' : 'upperArmR'];
    const la = P[side > 0 ? 'lowerArmL' : 'lowerArmR'];
    if (!run) {
      e[ul * 3] = -(22 * c + 4) * D;
      e[ul * 3 + 2] = side * 2 * D;
      e[ll * 3] = (8 + 10 * bump(ph, 0.1, 0.14) + 58 * bump(ph, 0.72, 0.22)) * D;
      e[ft * 3] = (-8 * bump(ph, 0.0, 0.12) + 16 * bump(ph, 0.52, 0.12) - 10 * bump(ph, 0.78, 0.15)) * D;
      e[ua * 3] = (16 * c) * D;
      e[ua * 3 + 2] = side * 6 * D;
      e[la * 3] = -(16 + 10 * (0.5 - 0.5 * c)) * D;
    } else {
      e[ul * 3] = -(36 * c + 14) * D;
      e[ul * 3 + 2] = side * 2 * D;
      e[ll * 3] = (22 + 14 * bump(ph, 0.12, 0.14) + 92 * bump(ph, 0.7, 0.26)) * D;
      e[ft * 3] = (-10 * bump(ph, 0.0, 0.12) + 26 * bump(ph, 0.5, 0.14) - 8 * bump(ph, 0.8, 0.15)) * D;
      e[ua * 3] = (40 * c - 6) * D;
      e[ua * 3 + 1] = -side * 8 * D;
      e[ua * 3 + 2] = side * 10 * D;
      e[la * 3] = -(82 + 12 * c) * D;
    }
  }
  const s2 = Math.sin(phase * TAU);
  if (!run) {
    e[P.pelvis * 3 + 1] = -5 * s2 * D;
    e[P.upperTorso * 3 + 1] = 4 * s2 * D;
    e[P.middleTorso * 3 + 1] = 2 * s2 * D;
    e[P.upperTorso * 3] = 2 * D;
    e[P.neck * 3] = 2 * D;
  } else {
    e[P.pelvis * 3 + 1] = -8 * s2 * D;
    e[P.upperTorso * 3 + 1] = 8 * s2 * D;
    e[P.middleTorso * 3 + 1] = 3 * s2 * D;
    e[P.lowerTorso * 3] = 6 * D;
    e[P.middleTorso * 3] = 4 * D;
    e[P.upperTorso * 3] = 3 * D;
    e[P.neck * 3] = -6 * D;
    e[P.head * 3] = -4 * D;
  }
  return out;
}

/** Idle: breathing, a slow shift of weight. */
export function idlePose(out, t) {
  copyPose(out, IDLE);
  const b = Math.sin(t * 1.9);
  out.e[P.upperTorso * 3] += 1.2 * b * D;
  out.e[P.middleTorso * 3] += 0.6 * b * D;
  out.e[P.neck * 3] -= 1.0 * b * D;
  out.e[P.upperArmL * 3 + 2] += 1.5 * b * D;
  out.e[P.upperArmR * 3 + 2] -= 1.5 * b * D;
  const sway = Math.sin(t * 0.55);
  out.e[P.pelvis * 3 + 2] = 1.5 * sway * D;
  out.e[P.lowerTorso * 3 + 2] = -1.0 * sway * D;
  out.e[P.head * 3 + 1] = 6 * Math.sin(t * 0.31) * D;
  return out;
}

/**
 * Locomotion at a given speed (m/s): idle below a stroll, walking, running,
 * blended by speed. phase is the gait phase (0..1), which the caller advances
 * by distance / stride.
 */
export function locomotion(out, speed, phase, t) {
  const walkW = Math.min(1, speed / 0.5);
  const runW = Math.max(0, Math.min(1, (speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED)));
  idlePose(out, t);
  if (walkW <= 0) return out;
  gait(_W, phase, false, t);
  if (runW > 0) {
    gait(_R, phase, true, t);
    lerpPose(_W, _W, _R, runW);
  }
  return lerpPose(out, out, _W, walkW);
}

export function strideAt(speed) {
  const runW = Math.max(0, Math.min(1, (speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED)));
  return WALK_STRIDE + (RUN_STRIDE - WALK_STRIDE) * runW;
}

/** Joint quaternions holder. */
export function makeQuats() {
  const a = [];
  for (let i = 0; i < NP; i++) a.push(new Quaternion());
  return a;
}
