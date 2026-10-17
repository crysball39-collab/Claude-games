/* =============================================================================
   A stickman as a ragdoll (physics/ragdoll.js): which joints are points and
   how heavy each one is, which bones join them, how far every joint bends,
   and how to go between the ragdoll and the animated skeleton.

   The joint ranges are a person's, give or take, for a body facing +x and
   measured the way the ragdoll measures them (the child bone's angle minus
   the parent bone's, clockwise from straight up):

     waist     the upper back on the lower      -25 .. 55   (arch .. hunch)
     neck      the head on the upper back       -50 .. 60   (back .. chin down)
     shoulder  the upper arm on the upper back   -5 .. 240  (overhead .. well back)
     elbow     the forearm on the upper arm    -150 .. 5    (it only folds forward)
     hip       the thigh on the lower back       45 .. 210  (knee to chest .. leg back)
     knee      the shin on the thigh             -3 .. 150  (it only folds back)
     ankle     the foot on the shin            -150 .. -60
     a break   either half of a broken bone     -75 .. 75   (it just flops)

   A joint out of its socket bends a good way further than that, and a limb
   that has been cut off is not part of the body any more: its points are
   kept, for the bookkeeping, but weigh nothing and touch nothing.
   ========================================================================== */
import { Ragdoll } from '../physics/ragdoll.js';
import { DIM, BONES, MIDS, BELOW_BREAK } from './skeleton.js';

// kilograms, about 70 in all; and how big each point is, for touching things
const MASS = {
  hip: 13, chest: 13, neck: 5, head: 5,
  elbowA: 2.2, handA: 1.6, elbowB: 2.2, handB: 1.6,
  kneeA: 6.5, footA: 3.8, toeA: 0.7, kneeB: 6.5, footB: 3.8, toeB: 0.7,
};
const half = DIM.line / 2;
const RADIUS = {
  hip: 0.042, chest: 0.042, neck: 0.038,
  elbowA: 0.036, handA: 0.038, elbowB: 0.036, handB: 0.038,
  kneeA: 0.038, footA: 0.036, toeA: 0.03, kneeB: 0.038, footB: 0.036, toeB: 0.03,
};

/**
 * The joints: [name, parent from, parent to, child from (the pivot), child to,
 * lo, hi, muscle, rest]. `rest` is the bend the joint drifts back to when
 * nobody is holding it anywhere - the give of the tissue around it - so a
 * limp body ends up lying the way a limp body lies.
 */
const JOINTS = [
  ['waist', 'hip', 'chest', 'chest', 'neck', -25, 55, 0.3, 4],
  ['neck', 'chest', 'neck', 'neck', 'head', -50, 60, 0.25, 8],
  ['shoulderA', 'chest', 'neck', 'shoulder', 'elbowA', -5, 240, 0.14, 170],
  ['elbowA', 'shoulder', 'elbowA', 'elbowA', 'handA', -150, 5, 0.12, -20],
  ['shoulderB', 'chest', 'neck', 'shoulder', 'elbowB', -5, 240, 0.14, 175],
  ['elbowB', 'shoulder', 'elbowB', 'elbowB', 'handB', -150, 5, 0.12, -25],
  ['hipA', 'hip', 'chest', 'hip', 'kneeA', 45, 210, 0.2, 172],
  ['kneeA', 'hip', 'kneeA', 'kneeA', 'footA', -3, 150, 0.2, 12],
  ['ankleA', 'kneeA', 'footA', 'footA', 'toeA', -150, -60, 0.12, -110],
  ['hipB', 'hip', 'chest', 'hip', 'kneeB', 45, 210, 0.2, 178],
  ['kneeB', 'hip', 'kneeB', 'kneeB', 'footB', -3, 150, 0.2, 18],
  ['ankleB', 'kneeB', 'footB', 'footB', 'toeB', -150, -60, 0.12, -110],
];
export const LIMP_JOINTS = JOINTS.map((j) => j[0]);
const JOINT_DEF = Object.fromEntries(JOINTS.map((j) => [j[0], j]));
const ARM_JOINTS = new Set(['shoulderA', 'elbowA', 'shoulderB', 'elbowB']);
const LEG_JOINTS = new Set(['hipA', 'kneeA', 'ankleA', 'hipB', 'kneeB', 'ankleB']);

// the broken bone each long bone's break point belongs to
const MID_BONE = {};
for (const b of BONES) if (b[4]) MID_BONE[b[4]] = b;

/**
 * Builds a ragdoll for stickman `man` in the pose its joints are in now,
 * moving the way they were moving. Broken bones get a point at the break.
 */
export function makeRagdoll(man, dt = 1 / 120) {
  const s = man.scale;
  const rag = new Ragdoll({ facing: man.facing, gravity: 18 });
  const w = man.wj, pw = man.prevWj;
  const broken = man.health.broken, severed = man.health.severed || {}, out = man.health.dislocated || {};
  // everything past a cut
  const gone = new Set();
  for (const mid of Object.values(man.cut || {})) for (const k of BELOW_BREAK[mid]) gone.add(k);
  const add = (name, mass, r) => {
    const q = w[name], o = pw[name];
    const vx = clamp((q.x - o.x) / dt, -25, 25), vy = clamp((q.y - o.y) / dt, -25, 25);
    const g = gone.has(name);
    return rag.point(name, q.x, q.y, (g ? 0.02 : mass) * s, (g ? 0.004 : r) * s, vx, vy, dt);
  };
  for (const k of Object.keys(RADIUS)) add(k, MASS[k], RADIUS[k]);
  add('head', MASS.head, DIM.headR + half);
  const n = rag.byName;
  // the shoulders sit partway up the upper back, so the arms move it and it moves them
  const shoulder = rag.along(n.chest, n.neck, DIM.shoulderAt);
  const ref = (name) => (name === 'shoulder' ? shoulder : n[name]);

  // which long bones are snapped: they get a point at the break
  const snapped = new Set();
  for (const [from, to, , bone, mid] of BONES) {
    if (!mid || !(broken[bone] || severed[bone])) continue;
    snapped.add(mid);
    add(mid, 1, 0.036);
    rag.link(ref(from), n[mid], boneLength(from, to, s) / 2);
    rag.link(n[mid], n[to], boneLength(from, to, s) / 2);
  }
  for (const [from, to, , , mid] of BONES) {
    if (mid && snapped.has(mid)) continue;
    rag.link(ref(from), n[to], boneLength(from, to, s));
  }

  // joints, with the child bone running to the break point where there is one
  const midAfter = (from, to) => {
    for (const m of snapped) { const b = MID_BONE[m]; if (b[0] === from && b[1] === to) return n[m]; }
    return null;
  };
  const muscles = [];
  for (const [name, pf, pt, cf, ct, lo0, hi0, k, rest] of JOINTS) {
    const pm = midAfter(pf, pt), cm = midAfter(cf, ct);
    // the parent's direction is taken from the part of it next to the pivot
    const p0 = pm && pt === cf ? pm : ref(pf), p1 = pm && pf === cf ? pm : ref(pt);
    // out of its socket, a joint goes a long way past where it should stop
    let lo = lo0, hi = hi0;
    if (out[name]) {
      if (name.startsWith('shoulder')) { lo -= 70; hi += 50; }
      else if (name.startsWith('elbow')) hi += 70;
      else if (name.startsWith('knee')) lo -= 65;
    }
    const i = rag.joint(name, p0, p1, ref(cf), cm || ref(ct), lo, hi);
    rag.joints[i].rest = rest * Math.PI / 180;
    muscles.push({ i, k, name, arm: ARM_JOINTS.has(name), leg: LEG_JOINTS.has(name), gone: gone.has(ct) || gone.has(cf) || !!out[name] });
  }
  for (const m of snapped) {
    const [from, to] = MID_BONE[m];
    rag.joint('break-' + m, ref(from), n[m], n[m], n[to], -75, 75);
  }
  rag.muscles = muscles;
  rag.shoulder = shoulder;
  rag.snapped = snapped;
  return rag;
}

function boneLength(from, to, s) {
  const L = {
    'hip>chest': DIM.spineLow, 'chest>neck': DIM.spineUp, 'neck>head': DIM.neck + DIM.headR,
    'shoulder>elbowA': DIM.upperArm, 'elbowA>handA': DIM.foreArm, 'shoulder>elbowB': DIM.upperArm, 'elbowB>handB': DIM.foreArm,
    'hip>kneeA': DIM.thigh, 'kneeA>footA': DIM.shin, 'footA>toeA': DIM.foot,
    'hip>kneeB': DIM.thigh, 'kneeB>footB': DIM.shin, 'footB>toeB': DIM.foot,
  };
  return L[from + '>' + to] * s;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angleOf = (a, b) => Math.atan2(b.x - a.x, b.y - a.y);
const wrap = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };

/**
 * Points the muscles at the pose in `local` (joints in the body's own frame,
 * facing +x, as skeleton.solve leaves them). `tone` is how hard they pull,
 * and arms or legs that cannot be used do not pull at all.
 */
export function aimMuscles(rag, local, health, tone, mix = null) {
  rag.tone = tone;
  const armsOK = { A: health.canUse('armA'), B: health.canUse('armB') };
  const legsOK = health.paralysed === 'none';
  for (const m of rag.muscles) {
    const [, pf, pt, cf, ct] = JOINT_DEF[m.name];
    const bend = wrap(angleOf(local[cf], local[ct]) - angleOf(local[pf], local[pt]));
    let k = m.k;
    // how much of each part of the body is trying: arms, legs, the trunk
    if (mix) k *= m.arm ? mix.arms : m.leg ? mix.legs : mix.core;
    if (m.arm && !armsOK[m.name.slice(-1)]) k = 0;
    if (m.gone) k = 0;
    if (m.leg && !legsOK) k = 0;
    if (health.paralysed === 'all' && m.name !== 'neck') k = 0;
    rag.setTarget(m.i, bend, k);
  }
}

/** Copies the ragdoll back onto the skeleton's world joints. */
export function toJoints(rag, man) {
  const w = man.wj, n = rag.byName;
  for (const k of Object.keys(n)) { const q = rag.p[n[k]]; w[k].x = q.x; w[k].y = q.y; }
  rag.pos(rag.shoulder, w.shoulder);
  // break points that have not snapped sit halfway along their bones
  for (const m of MIDS) {
    if (rag.snapped.has(m)) continue;
    const [from, to] = MID_BONE[m];
    w[m].x = (w[from].x + w[to].x) / 2;
    w[m].y = (w[from].y + w[to].y) / 2;
  }
  // the head's angle, in the body's own (facing) frame, for drawing the face
  const f = rag.facing;
  w.headAngle = Math.atan2((w.head.x - w.neck.x) * f, w.head.y - w.neck.y);
}

/**
 * The point of the ragdoll nearest (x, y): a joint, or somewhere along a
 * bone. Returns a reference the ragdoll can grab by.
 */
export function refNear(rag, man, x, y) {
  const near = man.nearestPart(x, y);
  const n = rag.byName;
  if (near.part === 'head' && near.t > 0.5) return n.head;
  const [from, to, , , mid] = BONES[near.bone];
  const fromRef = from === 'shoulder' ? rag.shoulder : n[from];
  let a = fromRef, b = n[to], t = near.t;
  if (mid && rag.snapped.has(mid)) {
    if (t < 0.5) { b = n[mid]; t *= 2; } else { a = n[mid]; t = t * 2 - 1; }
  }
  if (typeof a !== 'number') {
    // a point partway along a bone that starts partway along another: take the end instead
    return t < 0.5 ? n.neck : b;
  }
  if (t < 0.12) return a;
  if (t > 0.88) return b;
  return rag.along(a, b, t);
}

/** Lying on their back (chest up) or their front, from the way the upper body faces. */
export function lyingSide(rag) {
  const n = rag.byName;
  const h = rag.p[n.hip], c = rag.p[n.neck];
  const dx = c.x - h.x, dy = c.y - h.y;
  // the chest faces the body's own forward, turned with the torso
  const fy = rag.facing > 0 ? -dx : dx;
  return fy > 0 ? 'back' : 'front';
}
