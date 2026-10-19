/* =============================================================================
   SHALLOW - what the rest of the mod shares: its id, its colours, where its
   hands and mouth are, and the arm-reaching sum its claws need.
   ========================================================================== */
import { DIM } from '../../game/skeleton.js';
import { clamp, lerp } from '../../core/util.js';

export const MOD = 'shallow';

// the thing itself: blacker than anybody's ink, and what comes out of it
export const BLACK = '#030303';
export const BLACK_FAR = '#161616';
export const ICHOR = ['#161616', '#070707'];
export const BONE = '#ece5d0';
export const BONE_DARK = '#9b917a';
export const FLESH = '#c2364a';
export const FLESH_DARK = '#7a1424';
export const GUT = '#d98a8f';
export const GUT_DARK = '#9c4b55';

/** How much taller than the skin it came out of it stands, at its full height. */
export const GROWTH = 1.65;

/** Something of the mod's: one of its bodies, or a thing it left lying about. */
export const isShallowThing = (t) => !!t && ((t.species && t.species.mod === MOD) || t.mod === MOD);
/** The thing itself, in whatever body it has on. */
export const isShallow = (t) => !!(t && t.sh && t.species && t.species.mod === MOD && t.sh.form !== 'gone');

export const lerpPt = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

/**
 * Where the mouth is on a head, in the world: the head's own frame is +x
 * the way the face looks and +y the top of the head (see game/draw.js).
 */
export function headPoint(man, lx, ly) {
  const j = man.wj, s = man.scale, r = DIM.headR * s;
  const f = man.rag ? man.rag.facing : man.facing;
  const a = j.headAngle;
  // the head frame turned by the head's angle (clockwise from straight up), mirrored by the facing
  const x = lx * r, y = ly * r;
  const c = Math.cos(a), sn = Math.sin(a);
  return { x: j.head.x + f * (x * c + y * sn), y: j.head.y + (-x * sn + y * c) };
}

/** The middle of its grin, where whatever it eats goes. */
export const mouthAt = (man) => headPoint(man, 0.42, -0.42);

/**
 * Where a hand of its holds things: a little way out along the claws, in
 * the curl of them. side 'A' (the near hand) or 'B'.
 */
export function gripAt(man, side = 'A') {
  const j = man.wj;
  const e = j['elbow' + side], h = j['hand' + side];
  const d = Math.hypot(h.x - e.x, h.y - e.y) || 1;
  const k = 0.1 * man.scale;
  return { x: h.x + ((h.x - e.x) / d) * k, y: h.y + ((h.y - e.y) / d) * k };
}

/**
 * Two bones, a shoulder and a point to reach: where the elbow and the hand
 * go. The elbow bends the way an arm does - down and back, whichever way
 * they face. Out of reach, the arm points at it as far as it goes.
 */
export function reach(shoulder, target, L1, L2, facing) {
  let dx = target.x - shoulder.x, dy = target.y - shoulder.y;
  let d = Math.hypot(dx, dy);
  if (d < 1e-6) { dx = facing; dy = 0; d = 1e-6; }
  const ux = dx / d, uy = dy / d;
  const D = clamp(d, Math.abs(L1 - L2) + 1e-4, (L1 + L2) * 0.999);
  const a = (L1 * L1 - L2 * L2 + D * D) / (2 * D);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  // the side the elbow goes: to the right of the line, as they face
  const px = uy * facing, py = -ux * facing;
  const elbow = { x: shoulder.x + ux * a + px * h, y: shoulder.y + uy * a + py * h };
  const hand = { x: shoulder.x + ux * D, y: shoulder.y + uy * D };
  return { elbow, hand, short: d > L1 + L2 };
}

/**
 * Puts one of its arms where it reaches for something, by fraction k of the
 * way from where its animation had the hand - in the world joints, after the
 * pose is solved (the species' pose hook).
 */
export function reachArm(man, side, target, k = 1) {
  if (!target || k <= 0) return false;
  const j = man.wj, s = man.scale;
  const sh = j.shoulder, hand = j['hand' + side];
  const goal = k >= 1 ? target : lerpPt(hand, target, k);
  // the grip sits a little beyond the hand: reach so that it, not the wrist, gets there
  const r = reach(sh, goal, DIM.upperArm * s, DIM.foreArm * s + 0.1 * s, man.facing);
  const fe = DIM.foreArm / (DIM.foreArm + 0.1);
  const e = r.elbow;
  const h = { x: e.x + (r.hand.x - e.x) * fe, y: e.y + (r.hand.y - e.y) * fe };
  j['elbow' + side].x = e.x; j['elbow' + side].y = e.y;
  j['hand' + side].x = h.x; j['hand' + side].y = h.y;
  const mh = j['midHum' + side], mf = j['midFore' + side];
  mh.x = (sh.x + e.x) / 2; mh.y = (sh.y + e.y) / 2;
  mf.x = (e.x + h.x) / 2; mf.y = (e.y + h.y) / 2;
  return !r.short;
}
