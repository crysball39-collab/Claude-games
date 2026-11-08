/* =============================================================================
   THINGS IN THE DARK - what the rest of the mod shares: its id, its colours,
   the lights going, and the sum for an arm reaching for something.
   ========================================================================== */
import { DIM } from '../../game/skeleton.js';
import { clamp, lerp } from '../../core/util.js';

export const MOD = 'dark';

// the Grasp: arms the grey of something left too long in water
export const ARM_PALE = '#c9c6bd';
export const ARM_SHADE = '#8f8b82';
export const ARM_DEEP = '#5d5a54';
// the Rattle: old chain, rust, and the coals at the middle of it
export const RUST = '#7a4a2b';
export const RUST_DARK = '#4a2c19';
export const IRON = '#3b3a38';
export const EMBER = '#ff5a1f';
// the Listener: ash, and the insides of its ears
export const ASH = '#a7a39a';
export const ASH_DARK = '#6f6b63';
export const ASH_FAR = '#8a867e';
export const EAR_IN = '#b88b84';
// the wardrobe: dark old wood
export const WOOD = '#5b3d26';
export const WOOD_DARK = '#3d2817';
export const WOOD_LIGHT = '#7a5535';

/** Something of the mod's: one of its creatures, or a thing it put in the world. */
export const isDarkThing = (t) => !!t && ((t.species && t.species.mod === MOD) || t.mod === MOD);

export const lerpPt = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

/**
 * The lights going: the whole world dimmed by k (0 bright .. 1 black), drawn
 * over everything - people included - by whatever is coming.
 */
export function drawDark(ctx, sb, k) {
  if (k <= 0.01) return;
  ctx.save();
  ctx.fillStyle = `rgba(4, 4, 6, ${clamp(k, 0, 0.94).toFixed(3)})`;
  ctx.fillRect(sb.left - 60, -6, sb.right - sb.left + 120, 120);
  ctx.restore();
}

/**
 * Two bones from a shoulder to a point: where the elbow and the hand go, the
 * elbow bending down and back the way an arm does. Out of reach, the arm
 * points at it as far as it goes.
 */
export function reachFor(shoulder, target, L1, L2, facing) {
  let dx = target.x - shoulder.x, dy = target.y - shoulder.y;
  let d = Math.hypot(dx, dy);
  if (d < 1e-6) { dx = facing; dy = 0; d = 1e-6; }
  const ux = dx / d, uy = dy / d;
  const D = clamp(d, Math.abs(L1 - L2) + 1e-4, (L1 + L2) * 0.999);
  const a = (L1 * L1 - L2 * L2 + D * D) / (2 * D);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const px = uy * facing, py = -ux * facing;
  return { elbow: { x: shoulder.x + ux * a + px * h, y: shoulder.y + uy * a + py * h }, hand: { x: shoulder.x + ux * D, y: shoulder.y + uy * D } };
}

/**
 * One of a body's arms put out toward `target`, by fraction k of the way
 * from where its animation had the hand (on the world joints, after the pose
 * is solved: a species' pose hook).
 */
export function armTo(man, side, target, k = 1) {
  if (!target || k <= 0) return;
  const j = man.wj, s = man.scale;
  const hand = j['hand' + side];
  const goal = k >= 1 ? target : lerpPt(hand, target, k);
  const r = reachFor(j.shoulder, goal, DIM.upperArm * s, DIM.foreArm * s, man.facing);
  const e = j['elbow' + side], h = j['hand' + side];
  e.x = r.elbow.x; e.y = r.elbow.y;
  h.x = r.hand.x; h.y = r.hand.y;
  const mh = j['midHum' + side], mf = j['midFore' + side];
  mh.x = (j.shoulder.x + e.x) / 2; mh.y = (j.shoulder.y + e.y) / 2;
  mf.x = (e.x + h.x) / 2; mf.y = (e.y + h.y) / 2;
}
