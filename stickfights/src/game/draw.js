/* =============================================================================
   Drawing a stickman, a crate, a set of brass knuckles and a combat knife onto
   a canvas.

   Everything here draws in world units on a canvas that has already been set
   up so y points up (see render.js). Text is never drawn here, because text
   in a y-up canvas comes out upside down.
   ========================================================================== */
import { DIM, pointOnBone } from './skeleton.js';

export const INK = '#111111';      // the near arm and leg, the body, the head
export const INK_FAR = '#2f2f2f';  // the far arm and leg, a touch lighter for depth
export const HEAD_FILL = '#e4e4e4';
export const BLOOD = '#a3101c';
export const BLOOD_DARK = '#6e0710';
export const BRASS = '#c9a03a';
export const BRASS_LIGHT = '#f0d27a';
export const BRASS_DARK = '#7d5f17';
export const STEEL = '#b9c0c6';
export const STEEL_LIGHT = '#eef2f4';
export const STEEL_DARK = '#5f676d';

function polyline(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

/**
 * Draws one stickman from its world-space joints.
 *
 * @param {object} j    joints in world space, plus headAngle
 * @param {object} o    { scale, facing, hair, face, weapon ('knuckles',
 *                      'knife', 'machete' or 'glock', in the near hand),
 *                      weaponBlood, gunSlide, alpha,
 *                      wounds: [{bone, t, r, hole, gash}], broken: { boneName: true },
 *                      cut: { armA: 'midForeA', ... } where a severed limb ends,
 *                      dislocated: { elbowA: true, ... },
 *                      stuck: [{ x, y, a, blood, kind }] blades stuck in them,
 *                      hurt: the face's injuries (health.face), pale (0..1) }
 */
export function drawStickman(ctx, j, o) {
  const s = o.scale || 1;
  const lw = DIM.line * s;
  const r = DIM.headR * s;
  const ink = o.ink || INK, far = o.far || INK_FAR;
  // a uniform: the shirt and the trousers their own colours
  const U = o.uniform || null;
  const topInk = U ? U.top : ink, topFar = U ? U.topFar : far, legInk = U ? U.legs : ink, legFar = U ? U.legsFar : far;
  const cut = o.cut || NO_CUTS;
  // a mod's species can draw more of them (wings, a tail, hands that are not
  // hands) and draw the head its own way: o.skin = { back, farArm, head, front }
  const skin = o.skin || null;
  const tint = o.tint || null;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  // ...or draw all of them, its own way (drawInjuries, below, puts the damage on)
  if (skin && skin.full) { skin.full(ctx, j, o, lw); return; }
  if (skin && skin.back) skin.back(ctx, j, o);

  // far side first, so the near arm and leg sit in front of the body
  const ha = j.headAngle, f = o.facing || 1;
  ctx.lineWidth = lw;
  ctx.strokeStyle = legFar;
  limb(ctx, j, LEG_B, cut.legB);
  ctx.strokeStyle = topFar;
  limb(ctx, j, ARM_B, cut.armB);
  if (skin && skin.farArm) skin.farArm(ctx, j, o);
  // what hangs on the far hip (an officer's taser, cross-draw)
  if (o.kit && o.kit.duty) drawStowed(ctx, j, f, s, 'duty', o.kit.duty);

  ctx.strokeStyle = topInk;
  ctx.lineWidth = lw;
  // the spine, then the neck up to the bottom of the head
  const nx = j.head.x - Math.sin(ha) * f * r, ny = j.head.y - Math.cos(ha) * r;
  polyline(ctx, [j.hip, j.chest, j.neck, { x: nx, y: ny }]);
  ctx.strokeStyle = legInk;
  limb(ctx, j, LEG_A, cut.legA);
  if (o.vest) drawWornVest(ctx, j, f, s, o.vest);
  if (o.belt) drawBelt(ctx, j, f, s);
  if (o.kit) {
    if (o.kit.holster) drawStowed(ctx, j, f, s, 'holster', o.kit.holster);
    if (o.kit.pocket) drawStowed(ctx, j, f, s, 'pocket', o.kit.pocket);
  }

  if (skin && skin.head) skin.head(ctx, j, o, r, lw);
  else drawHead(ctx, j, o, r, lw);

  ctx.strokeStyle = topInk;
  ctx.lineWidth = lw;
  limb(ctx, j, ARM_A, cut.armA);

  for (const k of ['armA', 'armB', 'legA', 'legB']) if (cut[k]) drawStump(ctx, j[cut[k]], lw, tint);
  if (o.dislocated) drawDislocations(ctx, j, o.dislocated, lw);
  if (o.broken) drawBreaks(ctx, j, o.broken, lw, cut, tint);
  if (o.wounds && o.wounds.length) drawWounds(ctx, j, o.wounds, lw, cut, tint);
  if (o.cuffed) drawCuffs(ctx, j, s);
  if (o.donning) drawVestBundle(ctx, j, s, o.donning);
  if (!cut.armA) {
    if (o.heldDraw) o.heldDraw(ctx, j, s, f);
    else if (o.weapon === 'knuckles') drawWornKnuckles(ctx, j.elbowA, j.handA, s, o.weaponBlood || 0);
    else if (o.weapon === 'knife') drawHeldKnife(ctx, j.midForeA, j.handA, s, o.weaponBlood || 0);
    else if (o.weapon === 'machete') drawHeldMachete(ctx, j.midForeA, j.handA, s, f, o.weaponBlood || 0);
    else if (o.weapon === 'glock' || o.weapon === 'm1911') drawHeldGun(ctx, j, s, f, o.weaponBlood || 0, o.gunSlide || 0, o.weapon);
  }
  if (o.stuck) {
    for (const k of o.stuck) {
      ctx.save();
      ctx.translate(k.x, k.y);
      ctx.rotate(k.a);
      if (k.kind === 'machete') drawMacheteShape(ctx, MACHETE_W * s, MACHETE_H * s, k.blood || 0);
      else drawKnifeShape(ctx, KNIFE_W * s, KNIFE_H * s, k.blood || 0);
      ctx.restore();
    }
  }
  if (skin && skin.front) skin.front(ctx, j, o);
}

const NO_CUTS = {};

/**
 * The damage on a body drawn some other way (a mod's full skin): stumps where
 * things were cut off, joints out, broken bones, and the wounds.
 */
export function drawInjuries(ctx, j, o, lw) {
  const cut = o.cut || NO_CUTS, tint = o.tint || null;
  for (const k of ['armA', 'armB', 'legA', 'legB']) if (cut[k]) drawStump(ctx, j[cut[k]], lw, tint);
  if (o.dislocated) drawDislocations(ctx, j, o.dislocated, lw);
  if (o.broken) drawBreaks(ctx, j, o.broken, lw, cut, tint);
  if (o.wounds && o.wounds.length) drawWounds(ctx, j, o.wounds, lw, cut, tint);
}
const ARM_A = ['shoulder', 'midHumA', 'elbowA', 'midForeA', 'handA'];
const ARM_B = ['shoulder', 'midHumB', 'elbowB', 'midForeB', 'handB'];
const LEG_A = ['hip', 'midFemA', 'kneeA', 'midTibA', 'footA', 'toeA'];
const LEG_B = ['hip', 'midFemB', 'kneeB', 'midTibB', 'footB', 'toeB'];

/** An arm or a leg, as far as it goes: to the end, or to where it was cut off. */
function limb(ctx, j, chain, end) {
  const n = end ? chain.indexOf(end) + 1 : chain.length;
  ctx.beginPath();
  ctx.moveTo(j[chain[0]].x, j[chain[0]].y);
  for (let i = 1; i < n; i++) ctx.lineTo(j[chain[i]].x, j[chain[i]].y);
  ctx.stroke();
}

/** The end of a limb that was cut off: raw, red, the bone showing in the middle (or, tinted, whatever they are made of). */
function drawStump(ctx, p, lw, tint = null) {
  ctx.fillStyle = tint ? tint[0] : BLOOD;
  ctx.beginPath();
  ctx.arc(p.x, p.y, lw * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tint ? tint[1] : BLOOD_DARK;
  ctx.beginPath();
  ctx.arc(p.x, p.y, lw * 0.48, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tint ? '#c9ced3' : '#efe9d8';
  ctx.beginPath();
  ctx.arc(p.x, p.y, lw * 0.2, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * A piece of someone that came off: the bones as they were when it did, in
 * its own frame, the cut end (the first point) raw.
 */
export function drawSeveredLimb(ctx, pts, lw, ink = INK, tint = null) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ink;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  drawStump(ctx, pts[0], lw, tint);
}

/** A joint out of its socket: a swollen lump where it sits wrong. */
function drawDislocations(ctx, j, dis, lw) {
  ctx.fillStyle = '#4e2350';
  for (const [k, on] of Object.entries(dis)) {
    if (!on) continue;
    const at = j[k === 'shoulderA' || k === 'shoulderB' ? 'shoulder' : k];
    if (!at) continue;
    ctx.beginPath();
    ctx.arc(at.x, at.y, lw * 0.85, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Where each broken bone shows: a dark mark where it gave, so it reads at a glance. */
const BREAK_AT = {
  humerusA: 'midHumA', forearmA: 'midForeA', humerusB: 'midHumB', forearmB: 'midForeB',
  femurA: 'midFemA', tibiaA: 'midTibA', femurB: 'midFemB', tibiaB: 'midTibB',
  ribs: 'chest', pelvis: 'hip', neck: 'neck',
};

function drawBreaks(ctx, j, broken, lw, cut, tint = null) {
  ctx.fillStyle = tint ? tint[1] : BLOOD_DARK;
  for (const [bone, on] of Object.entries(broken)) {
    if (!on) continue;
    if (bone === 'spine') {
      const x = (j.hip.x + j.chest.x) / 2, y = (j.hip.y + j.chest.y) / 2;
      ctx.beginPath(); ctx.arc(x, y, lw * 0.7, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    // a bone cut through where it would have broken shows as the stump, not a break
    if (CUT_HIDES[bone] && cut[CUT_HIDES[bone]]) continue;
    const at = j[BREAK_AT[bone]];
    if (!at) continue;
    ctx.beginPath();
    ctx.arc(at.x, at.y, lw * 0.72, 0, Math.PI * 2);
    ctx.fill();
  }
}
const CUT_HIDES = { humerusA: 'armA', forearmA: 'armA', humerusB: 'armB', forearmB: 'armB', femurA: 'legA', tibiaA: 'legA', femurB: 'legB', tibiaB: 'legB' };

// for each bone, which limb it is on, and how far out along that limb it starts
const BONE_LIMB = { 3: ['armA', 0], 4: ['armA', 2], 5: ['armB', 0], 6: ['armB', 2], 7: ['legA', 0], 8: ['legA', 2], 9: ['legA', 4], 10: ['legB', 0], 11: ['legB', 2], 12: ['legB', 4] };
const CHAIN_OF = { armA: ARM_A, armB: ARM_B, legA: LEG_A, legB: LEG_B };

/** Whether the point t along bone b is on a part of a limb that is no longer there. */
export function goneAt(cut, b, t) {
  const bl = BONE_LIMB[b];
  if (!bl || !cut || !cut[bl[0]]) return false;
  const end = CHAIN_OF[bl[0]].indexOf(cut[bl[0]]);
  // the chain index the point is at: each long bone spans two steps of the chain
  const at = bl[1] + (b === 9 || b === 12 ? t : t * 2);
  return at > end + 1e-6;
}

/**
 * Wounds on the body: blood that has run onto a bone, bullet holes (dark,
 * with a red rim), and the long open gash a machete leaves.
 */
function drawWounds(ctx, j, wounds, lw, cut, tint = null) {
  const p = { x: 0, y: 0 }, q = { x: 0, y: 0 };
  const B = tint ? tint[0] : BLOOD, BD = tint ? tint[1] : BLOOD_DARK;
  for (const w of wounds) {
    if (goneAt(cut, w.bone, w.t)) continue;
    pointOnBone(j, w.bone, w.t, p);
    if (w.gash) {
      // across the bone, a little slanted
      pointOnBone(j, w.bone, Math.min(1, w.t + 0.05), q);
      const a = Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2 + w.gash;
      const L = lw * 1.25;
      ctx.strokeStyle = BD;
      ctx.lineWidth = lw * 0.5;
      ctx.beginPath();
      ctx.moveTo(p.x - Math.cos(a) * L, p.y - Math.sin(a) * L);
      ctx.lineTo(p.x + Math.cos(a) * L, p.y + Math.sin(a) * L);
      ctx.stroke();
      ctx.strokeStyle = B;
      ctx.lineWidth = lw * 0.25;
      ctx.stroke();
      continue;
    }
    if (w.hole) {
      ctx.fillStyle = B;
      ctx.beginPath();
      ctx.arc(p.x, p.y, lw * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tint ? '#141414' : '#2a0306';
      ctx.beginPath();
      ctx.arc(p.x, p.y, lw * 0.28, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    if (w.burn) {
      // a scorch: black, with an angry rim
      ctx.fillStyle = 'rgba(214, 96, 24, 0.75)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, lw * 0.82, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1d1712';
      ctx.beginPath();
      ctx.arc(p.x, p.y, lw * 0.6, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.fillStyle = w.tint ? (w.dark ? w.tint[1] : w.tint[0]) : w.dark ? BLOOD_DARK : BLOOD;
    ctx.beginPath();
    ctx.arc(p.x, p.y, lw * w.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ---------------------------------- the head ------------------------------- */

function drawHead(ctx, j, o, r, lw) {
  const f = o.facing || 1;
  ctx.save();
  ctx.translate(j.head.x, j.head.y);
  ctx.scale(f, 1);
  ctx.rotate(-j.headAngle);
  // from here on: +x is the way the face looks, +y the top of the head

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = o.headFill || HEAD_FILL;
  ctx.fill();
  if (o.pale) {
    ctx.fillStyle = `rgba(190, 205, 215, ${0.55 * o.pale})`;
    ctx.fill();
  }
  if (o.bruise) {
    ctx.fillStyle = `rgba(110, 40, 120, ${Math.min(0.5, o.bruise * 0.5)})`;
    ctx.beginPath();
    ctx.ellipse(r * 0.45, -r * 0.05, r * 0.42, r * 0.36, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  const hurt = o.hurt;
  if (hurt && hurt.swell > 0.05) {
    // a swollen cheek, puffed out past the line of the face
    const k = Math.min(1, hurt.swell);
    ctx.fillStyle = o.headFill || HEAD_FILL;
    ctx.beginPath();
    ctx.ellipse(r * 0.82, -r * 0.18, r * (0.16 + k * 0.14), r * (0.2 + k * 0.12), 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(140, 50, 110, ${0.25 + k * 0.3})`;
    ctx.fill();
    ctx.strokeStyle = o.ink || INK;
    ctx.lineWidth = lw * 0.8;
    ctx.beginPath();
    ctx.ellipse(r * 0.82, -r * 0.18, r * (0.16 + k * 0.14), r * (0.2 + k * 0.12), 0.3, -1.4, 1.1);
    ctx.stroke();
  }
  if (o.headMarks && o.headMarks.length) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    for (const m of o.headMarks) {
      ctx.fillStyle = m.burn ? '#1d1712' : m.tint ? (m.dark ? m.tint[1] : m.tint[0]) : m.dark ? BLOOD_DARK : BLOOD;
      ctx.beginPath();
      ctx.ellipse(m.x * r, m.y * r, m.r * r, m.r * r * 0.8, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.strokeStyle = o.ink || INK;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  if (o.broken && o.broken.skull) {
    // a crack across the top of the skull
    ctx.strokeStyle = BLOOD_DARK;
    ctx.lineWidth = lw * 0.4;
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, r * 0.62); ctx.lineTo(-r * 0.25, r * 0.38); ctx.lineTo(-r * 0.05, r * 0.6);
    ctx.lineTo(r * 0.2, r * 0.32); ctx.lineTo(r * 0.38, r * 0.5);
    ctx.stroke();
    ctx.strokeStyle = o.ink || INK;
    ctx.lineWidth = lw;
  }

  drawHair(ctx, o.hair, r, lw);
  if (o.face) drawFace(ctx, o.face, r, lw, o.hurt);
  if (o.hat) drawHat(ctx, o.hat, r, lw);
  ctx.restore();
}

/** Something on the head, in the head's own frame (+x the way the face looks): a police cap. */
function drawHat(ctx, hat, r, lw) {
  if (hat !== 'police') return;
  // the crown: soft, a little higher at the front
  ctx.fillStyle = '#1b2848';
  ctx.strokeStyle = '#0c1326';
  ctx.lineWidth = lw * 0.45;
  ctx.beginPath();
  ctx.moveTo(-r * 0.98, r * 0.42);
  ctx.quadraticCurveTo(-r * 1.12, r * 0.96, -r * 0.55, r * 1.2);
  ctx.quadraticCurveTo(r * 0.3, r * 1.42, r * 1.14, r * 1.12);
  ctx.quadraticCurveTo(r * 1.16, r * 0.78, r * 0.92, r * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // the band, and the peak sticking out over the eyes
  ctx.fillStyle = '#0d0f14';
  ctx.beginPath();
  ctx.moveTo(-r * 0.98, r * 0.42);
  ctx.lineTo(r * 0.92, r * 0.42);
  ctx.lineTo(r * 0.98, r * 0.62);
  ctx.lineTo(-r * 1.02, r * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(r * 0.5, r * 0.46);
  ctx.quadraticCurveTo(r * 1.15, r * 0.5, r * 1.42, r * 0.3);
  ctx.lineTo(r * 1.36, r * 0.22);
  ctx.quadraticCurveTo(r * 1.05, r * 0.36, r * 0.48, r * 0.36);
  ctx.closePath();
  ctx.fill();
  // the badge on the front
  ctx.fillStyle = '#e2b84a';
  ctx.strokeStyle = '#8a6a1a';
  ctx.lineWidth = lw * 0.18;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.08 : r * 0.17;
    ctx.lineTo(r * 0.78 + Math.cos(a) * rr, r * 0.86 + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawHair(ctx, hair, r, lw) {
  if (!hair || hair === 'none') return;
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = lw * 0.8;
  ctx.beginPath();
  switch (hair) {
    case 'tuft':
      ctx.moveTo(-r * 0.1, r * 0.98);
      ctx.quadraticCurveTo(r * 0.05, r * 1.45, r * 0.4, r * 1.3);
      break;
    case 'spiky':
      for (const a of [-0.5, -0.15, 0.2, 0.55]) {
        const x0 = Math.sin(a) * r, y0 = Math.cos(a) * r;
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 * 1.45, y0 * 1.45);
      }
      break;
    case 'flat':
      ctx.lineWidth = lw * 1.5;
      ctx.arc(0, 0, r * 1.02, Math.PI * 0.15, Math.PI * 0.95);
      break;
    case 'ponytail':
      ctx.lineWidth = lw * 1.2;
      ctx.arc(0, 0, r * 1.02, Math.PI * 0.3, Math.PI * 1.05);
      ctx.moveTo(-r * 0.95, r * 0.25);
      ctx.quadraticCurveTo(-r * 1.6, r * 0.1, -r * 1.45, -r * 0.65);
      break;
    case 'bun':
      ctx.lineWidth = lw * 1.1;
      ctx.arc(0, 0, r * 1.02, Math.PI * 0.35, Math.PI * 0.95);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-r * 0.62, r * 1.02, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 'mohawk':
      for (const a of [-0.45, -0.22, 0, 0.22]) {
        const x0 = Math.sin(a) * r, y0 = Math.cos(a) * r;
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 * 1.1 - r * 0.08, y0 * 1.5);
      }
      break;
    case 'curly':
      for (const a of [-0.6, -0.2, 0.2, 0.6]) {
        const x0 = Math.sin(a) * r * 1.1, y0 = Math.cos(a) * r * 1.1;
        ctx.moveTo(x0 + r * 0.16, y0);
        ctx.arc(x0, y0, r * 0.16, 0, Math.PI * 2);
      }
      break;
    default:
      return;
  }
  ctx.stroke();
}

/**
 * The face. `face` is { eyes, brow, browLift, mouth, open, teeth, tears,
 * blood }, worked out from the emotions in stickman.js.
 *   eyes      'normal' 'wide' 'happy' 'sad' 'squint' 'closed' 'x' 'spiral'
 *   brow      -1 angry (inner ends down) .. +1 worried (inner ends up)
 *   browLift  0..1, surprise
 *   mouth     -1 frown .. +1 smile
 *   open      0..1, how far the mouth is open
 */
function drawFace(ctx, face, r, lw, hurt = null) {
  const ex = [r * 0.12, r * 0.6], ey = r * 0.12;
  const thin = lw * 0.55;
  // a black eye goes on under everything else
  if (hurt && hurt.blackEye) {
    for (let i = 0; i < 2; i++) {
      const k = hurt.blackEye[i];
      if (k < 0.05) continue;
      ctx.fillStyle = `rgba(70, 25, 85, ${Math.min(0.85, 0.25 + k * 0.6)})`;
      ctx.beginPath();
      ctx.ellipse(ex[i], ey - r * 0.02, r * (0.2 + k * 0.06), r * (0.17 + k * 0.05), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = thin;
  ctx.lineCap = 'round';

  // eyes
  for (let i = 0; i < 2; i++) {
    const x = ex[i], y = ey;
    const e = face.eyes;
    ctx.beginPath();
    if (e === 'x') {
      const k = r * 0.13;
      ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k);
      ctx.moveTo(x - k, y + k); ctx.lineTo(x + k, y - k);
      ctx.stroke();
    } else if (e === 'spiral') {
      for (let a = 0; a < Math.PI * 4; a += 0.4) {
        const rr = (a / (Math.PI * 4)) * r * 0.16;
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    } else if (e === 'closed') {
      ctx.moveTo(x - r * 0.12, y - r * 0.02); ctx.lineTo(x + r * 0.12, y - r * 0.02);
      ctx.stroke();
    } else if (e === 'happy') {
      ctx.arc(x, y - r * 0.06, r * 0.12, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    } else if (e === 'squint') {
      // > < : screwed shut
      const k = r * 0.12, d = i === 0 ? 1 : -1;
      ctx.moveTo(x - k * d, y + k * 0.8); ctx.lineTo(x + k * d * 0.6, y); ctx.lineTo(x - k * d, y - k * 0.8);
      ctx.stroke();
    } else if (e === 'wide') {
      ctx.fillStyle = '#ffffff';
      ctx.arc(x, y, r * 0.17, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.fillStyle = INK;
      ctx.arc(x + r * 0.03, y, r * 0.065, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.arc(x, y, r * 0.09, 0, Math.PI * 2);
      ctx.fill();
      if (e === 'sad') {
        // a heavy upper lid
        ctx.beginPath();
        ctx.moveTo(x - r * 0.14, y + r * 0.04);
        ctx.lineTo(x + r * 0.14, y + r * 0.1);
        ctx.stroke();
      }
    }
  }

  // eyebrows
  if (face.eyes !== 'x' && face.eyes !== 'spiral') {
    const lift = (face.browLift || 0) * r * 0.16;
    const tilt = (face.brow || 0) * r * 0.13;
    ctx.beginPath();
    for (let i = 0; i < 2; i++) {
      const x = ex[i], y = ey + r * 0.32 + lift;
      const inner = i === 0 ? 1 : -1;      // which way the inner end of this brow is
      const half = r * 0.15;
      // inner end raised by +tilt (worried) or lowered by -tilt (angry)
      ctx.moveTo(x - inner * half, y - tilt * 0.5);
      ctx.lineTo(x + inner * half, y + tilt * 0.9);
    }
    ctx.stroke();
  }

  // mouth
  const mx = r * 0.4, my = -r * 0.42, mw = r * 0.22;
  const open = face.open || 0;
  ctx.beginPath();
  if (open > 0.15) {
    ctx.fillStyle = '#3a0a0a';
    ctx.ellipse(mx, my - r * 0.02, mw * (0.7 + open * 0.2), r * (0.06 + open * 0.17), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (face.teeth) {
    ctx.fillStyle = '#ffffff';
    ctx.rect(mx - mw, my - r * 0.07, mw * 2, r * 0.14);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mx - mw, my); ctx.lineTo(mx + mw, my);
    ctx.stroke();
    // gaps where teeth were knocked out
    if (hurt && hurt.teeth) {
      ctx.fillStyle = '#2a0a0a';
      for (let i = 0; i < Math.min(3, hurt.teeth); i++) {
        const x = mx - mw * 0.55 + i * mw * 0.6;
        ctx.fillRect(x, my - r * (i % 2 ? 0.07 : 0.0), mw * 0.28, r * 0.07);
      }
    }
  } else {
    const c = (face.mouth || 0) * r * 0.2;
    ctx.moveTo(mx - mw, my + c * 0.5);
    ctx.quadraticCurveTo(mx, my - c, mx + mw, my + c * 0.5);
    ctx.stroke();
  }

  if (face.blood) {
    ctx.fillStyle = BLOOD;
    ctx.beginPath();
    ctx.ellipse(r * 0.78, -r * 0.2 - face.blood * r * 0.25, r * 0.06, r * 0.06 + face.blood * r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (hurt) {
    // a bloody nose runs from the front of the face down past the mouth
    if (hurt.nose > 0.05) {
      const k = Math.min(1, hurt.nose);
      ctx.strokeStyle = BLOOD;
      ctx.lineWidth = lw * (0.3 + k * 0.25);
      ctx.beginPath();
      ctx.moveTo(r * 0.86, -r * 0.08);
      ctx.quadraticCurveTo(r * 0.8, -r * 0.25, r * 0.66, -r * (0.36 + k * 0.2));
      ctx.stroke();
    }
    // a split lip, at the corner of the mouth
    if (hurt.lip > 0.05) {
      ctx.fillStyle = BLOOD;
      ctx.beginPath();
      ctx.ellipse(mx + mw * 0.9, my - r * 0.03, r * 0.06, r * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // a cut over the eyebrow, bleeding toward the eye
    if (hurt.brow > 0.05) {
      ctx.strokeStyle = BLOOD;
      ctx.lineWidth = lw * 0.3;
      ctx.beginPath();
      ctx.moveTo(ex[1] - r * 0.12, ey + r * 0.46);
      ctx.lineTo(ex[1] + r * 0.12, ey + r * 0.4);
      ctx.moveTo(ex[1] + r * 0.02, ey + r * 0.42);
      ctx.lineTo(ex[1] + r * 0.04, ey + r * 0.16);
      ctx.stroke();
    }
  }
  if (face.tears) {
    ctx.fillStyle = 'rgba(80, 150, 230, 0.9)';
    for (let i = 0; i < 2; i++) {
      const k = (face.tears + i * 0.5) % 1;
      ctx.beginPath();
      ctx.ellipse(ex[i] + r * 0.02, ey - r * 0.15 - k * r * 0.55, r * 0.05, r * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/* --------------------------------- brass knuckles ---------------------------- */

/** Worn: across the fist, at the end of the forearm. */
function drawWornKnuckles(ctx, elbow, hand, s, blood) {
  const a = Math.atan2(hand.y - elbow.y, hand.x - elbow.x);
  ctx.save();
  ctx.translate(hand.x, hand.y);
  ctx.rotate(a + Math.PI / 2);
  drawKnuckleShape(ctx, 0.19 * s, 0.08 * s, blood);
  ctx.restore();
}

/** Four rings and a grip bar, w long and h deep, centred on the origin. */
export function drawKnuckleShape(ctx, w, h, blood = 0) {
  const ringR = w / 8.6;
  ctx.lineWidth = Math.max(w * 0.07, 0.006);
  ctx.strokeStyle = BRASS_DARK;
  ctx.fillStyle = BRASS;
  // grip
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2);
  ctx.quadraticCurveTo(0, -h * 0.95, w / 2, -h / 2);
  ctx.lineTo(w / 2, -h * 0.1);
  ctx.lineTo(-w / 2, -h * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // rings
  for (let i = 0; i < 4; i++) {
    const x = -w / 2 + ringR * 1.1 + i * (w - ringR * 2.2) / 3;
    ctx.beginPath();
    ctx.arc(x, h * 0.18, ringR, 0, Math.PI * 2);
    ctx.fillStyle = BRASS;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, h * 0.18, ringR * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = blood > 0.3 ? BLOOD_DARK : '#3b2d0a';
    ctx.fill();
  }
  ctx.strokeStyle = BRASS_LIGHT;
  ctx.lineWidth = Math.max(w * 0.03, 0.004);
  ctx.beginPath();
  ctx.moveTo(-w * 0.4, -h * 0.55);
  ctx.quadraticCurveTo(0, -h * 0.8, w * 0.4, -h * 0.55);
  ctx.stroke();
  if (blood > 0) {
    ctx.fillStyle = `rgba(150, 12, 24, ${Math.min(0.85, blood)})`;
    ctx.beginPath();
    ctx.ellipse(w * 0.1, h * 0.35, w * 0.22, h * 0.25, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ---------------------------------- combat knife ---------------------------- */

// drawn, like the knuckles, a good deal bigger than a real one so it reads;
// KNIFE_H is how thick it is to the physics, and it is drawn a little deeper
export const KNIFE_W = 0.42;
export const KNIFE_H = 0.07;

/**
 * A combat knife w long, centred on the origin, the point toward +x: a clip-
 * point blade with the edge underneath, a cross guard, a ridged grip and a
 * pommel.
 */
export function drawKnifeShape(ctx, w, h0, blood = 0) {
  const h = h0 * 1.3;
  const g = -w * 0.06;              // the guard
  const tip = w / 2, back = -w / 2;
  const bh = h * 0.56;              // the blade's depth
  ctx.lineJoin = 'round';
  // the blade
  ctx.beginPath();
  ctx.moveTo(g, bh * 0.55);
  ctx.lineTo(tip - w * 0.16, bh * 0.55);
  ctx.lineTo(tip - w * 0.07, bh * 0.15);   // the clip toward the point
  ctx.lineTo(tip, -bh * 0.05);
  ctx.quadraticCurveTo(tip - w * 0.12, -bh * 0.6, g + w * 0.04, -bh * 0.55);
  ctx.lineTo(g, -bh * 0.5);
  ctx.closePath();
  ctx.fillStyle = STEEL;
  ctx.fill();
  ctx.lineWidth = Math.max(w * 0.012, 0.003);
  ctx.strokeStyle = STEEL_DARK;
  ctx.stroke();
  // the fuller and the bright edge
  ctx.strokeStyle = STEEL_LIGHT;
  ctx.lineWidth = Math.max(w * 0.01, 0.0025);
  ctx.beginPath();
  ctx.moveTo(g + w * 0.04, -bh * 0.38);
  ctx.quadraticCurveTo(tip - w * 0.14, -bh * 0.42, tip - w * 0.03, -bh * 0.08);
  ctx.stroke();
  ctx.strokeStyle = STEEL_DARK;
  ctx.beginPath();
  ctx.moveTo(g + w * 0.05, bh * 0.12); ctx.lineTo(tip - w * 0.2, bh * 0.12);
  ctx.stroke();
  if (blood > 0) {
    ctx.fillStyle = `rgba(150, 12, 24, ${Math.min(0.9, 0.25 + blood)})`;
    ctx.beginPath();
    ctx.moveTo(tip - w * 0.28 * Math.min(1, blood + 0.3), bh * 0.5);
    ctx.lineTo(tip - w * 0.16, bh * 0.5);
    ctx.lineTo(tip, -bh * 0.05);
    ctx.quadraticCurveTo(tip - w * 0.12, -bh * 0.55, tip - w * 0.3 * Math.min(1, blood + 0.3), -bh * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  // the guard
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(g - w * 0.025, -h * 0.5, w * 0.05, h);
  // the grip, ridged, and the pommel
  ctx.fillStyle = '#1c1c1c';
  ctx.beginPath();
  ctx.moveTo(g - w * 0.025, h * 0.27);
  ctx.lineTo(back + w * 0.05, h * 0.24);
  ctx.lineTo(back + w * 0.05, -h * 0.24);
  ctx.lineTo(g - w * 0.025, -h * 0.27);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#4a4a4a';
  ctx.lineWidth = Math.max(w * 0.008, 0.002);
  ctx.beginPath();
  for (let i = 1; i < 5; i++) {
    const x = g - w * 0.025 - i * w * 0.03;
    ctx.moveTo(x, h * 0.22); ctx.lineTo(x, -h * 0.22);
  }
  ctx.stroke();
  ctx.fillStyle = '#3a3a3a';
  ctx.beginPath();
  ctx.ellipse(back + w * 0.04, 0, w * 0.035, h * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Held in the fist, the blade carrying on the line of the forearm. */
function drawHeldKnife(ctx, from, hand, s, blood) {
  const a = Math.atan2(hand.y - from.y, hand.x - from.x);
  ctx.save();
  ctx.translate(hand.x + Math.cos(a) * KNIFE_GRIP * s, hand.y + Math.sin(a) * KNIFE_GRIP * s);
  ctx.rotate(a);
  drawKnifeShape(ctx, KNIFE_W * s, KNIFE_H * s, blood);
  ctx.restore();
}
/** How far along the knife from its middle the fist closes on it (the middle of the grip). */
export const KNIFE_GRIP = 0.118;

/* ----------------------------------- machete --------------------------------- */

export const MACHETE_W = 0.74;
export const MACHETE_H = 0.085;
/** How far along the machete from its middle the fist closes on it. */
export const MACHETE_GRIP = 0.27;

/**
 * A machete w long, centred on the origin, the point toward +x: a long blade
 * that broadens toward a rounded, clipped end, the edge underneath, on a
 * black riveted handle.
 */
export function drawMacheteShape(ctx, w, h0, blood = 0) {
  const h = h0 * 1.35;
  const hilt = -w * 0.24;             // where the blade meets the handle
  const tip = w / 2, back = -w / 2;
  ctx.lineJoin = 'round';
  // the blade
  ctx.beginPath();
  ctx.moveTo(hilt, h * 0.2);
  ctx.lineTo(tip - w * 0.12, h * 0.28);
  ctx.quadraticCurveTo(tip, h * 0.27, tip, -h * 0.04);
  ctx.lineTo(tip - w * 0.04, -h * 0.4);
  ctx.quadraticCurveTo(hilt + w * 0.32, -h * 0.5, hilt, -h * 0.24);
  ctx.closePath();
  ctx.fillStyle = STEEL;
  ctx.fill();
  ctx.lineWidth = Math.max(w * 0.007, 0.003);
  ctx.strokeStyle = STEEL_DARK;
  ctx.stroke();
  // the bright edge along the belly, and a darker bevel line above it
  ctx.strokeStyle = STEEL_LIGHT;
  ctx.lineWidth = Math.max(w * 0.008, 0.0025);
  ctx.beginPath();
  ctx.moveTo(hilt + w * 0.03, -h * 0.28);
  ctx.quadraticCurveTo(hilt + w * 0.32, -h * 0.44, tip - w * 0.05, -h * 0.34);
  ctx.stroke();
  ctx.strokeStyle = STEEL_DARK;
  ctx.lineWidth = Math.max(w * 0.005, 0.002);
  ctx.beginPath();
  ctx.moveTo(hilt + w * 0.04, -h * 0.08);
  ctx.quadraticCurveTo(hilt + w * 0.34, -h * 0.2, tip - w * 0.08, -h * 0.12);
  ctx.stroke();
  if (blood > 0) {
    ctx.fillStyle = `rgba(150, 12, 24, ${Math.min(0.9, 0.25 + blood)})`;
    const k = Math.min(1, blood + 0.3);
    ctx.beginPath();
    ctx.moveTo(tip - w * 0.42 * k, -h * 0.42);
    ctx.quadraticCurveTo(tip - w * 0.2, -h * 0.48, tip - w * 0.04, -h * 0.4);
    ctx.lineTo(tip, -h * 0.04);
    ctx.lineTo(tip - w * 0.3 * k, -h * 0.05);
    ctx.closePath();
    ctx.fill();
  }
  // the handle: two black slabs, three rivets, a lanyard hole
  ctx.fillStyle = '#1d1d1d';
  ctx.beginPath();
  ctx.moveTo(hilt + w * 0.005, h * 0.24);
  ctx.lineTo(back + w * 0.02, h * 0.2);
  ctx.quadraticCurveTo(back - w * 0.01, 0, back + w * 0.02, -h * 0.24);
  ctx.lineTo(hilt + w * 0.005, -h * 0.26);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = STEEL_LIGHT;
  for (const k of [0.25, 0.55, 0.82]) {
    ctx.beginPath();
    ctx.arc(hilt + (back - hilt) * k, -h * 0.01, h * 0.065, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = STEEL_DARK;
  ctx.fillRect(hilt - w * 0.004, -h * 0.3, w * 0.012, h * 0.58);
}

/** Held in the fist, the long blade carrying on the line of the forearm, the edge down. */
function drawHeldMachete(ctx, from, hand, s, f, blood) {
  const a = Math.atan2(hand.y - from.y, hand.x - from.x);
  ctx.save();
  ctx.translate(hand.x + Math.cos(a) * MACHETE_GRIP * s, hand.y + Math.sin(a) * MACHETE_GRIP * s);
  ctx.rotate(a);
  ctx.scale(1, f);
  drawMacheteShape(ctx, MACHETE_W * s, MACHETE_H * s, blood);
  ctx.restore();
}

/* ----------------------------------- Glock-19 -------------------------------- */

// a compact 9 mm pistol, drawn (like everything else here) bigger than life
export const GLOCK_W = 0.3;
export const GLOCK_H = 0.2;
/** In the pistol's own frame, muzzle toward +x and the sights up: where the fist closes on the grip, */
export const GLOCK_GRIP = { x: -0.095, y: -0.055 };
/** ...the end of the barrel, */
export const GLOCK_MUZZLE = { x: 0.152, y: 0.054 };
/** ...and the ejection port, where the empty cases fly out. */
export const GLOCK_PORT = { x: 0.012, y: 0.088 };

/**
 * The pistol, centred on its own origin. `slide` is how far back the slide
 * is (it slams back with each shot, and locks back once the magazine is
 * empty).
 */
export function drawGlockShape(ctx, k = 1, blood = 0, slide = 0) {
  ctx.save();
  ctx.scale(k, k);
  ctx.lineJoin = 'round';
  // the frame and the grip, with the trigger guard cut out of it
  ctx.fillStyle = '#1b1c1e';
  ctx.beginPath();
  ctx.moveTo(-0.142, 0.032);
  ctx.lineTo(0.137, 0.032);
  ctx.lineTo(0.137, 0.006);
  ctx.lineTo(0.042, 0.0);
  ctx.quadraticCurveTo(0.046, -0.062, -0.012, -0.058);
  ctx.lineTo(-0.044, -0.04);
  ctx.lineTo(-0.056, -0.112);
  ctx.quadraticCurveTo(-0.095, -0.124, -0.136, -0.114);
  ctx.lineTo(-0.152, -0.004);
  ctx.closePath();
  ctx.moveTo(-0.032, -0.006);
  ctx.lineTo(0.026, -0.006);
  ctx.quadraticCurveTo(0.03, -0.044, -0.008, -0.044);
  ctx.lineTo(-0.032, -0.03);
  ctx.closePath();
  ctx.fill('evenodd');
  // grip texture
  ctx.strokeStyle = '#2c2d30';
  ctx.lineWidth = 0.004;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const y = -0.03 - i * 0.02;
    ctx.moveTo(-0.138 + i * 0.002, y); ctx.lineTo(-0.064 - i * 0.003, y);
  }
  ctx.stroke();
  // the trigger
  ctx.strokeStyle = '#0e0e0f';
  ctx.lineWidth = 0.009;
  ctx.beginPath();
  ctx.moveTo(0.004, -0.004); ctx.quadraticCurveTo(0.012, -0.024, 0.0, -0.034);
  ctx.stroke();
  // the slide, with its serrations, sights and ejection port
  ctx.save();
  ctx.translate(-slide, 0);
  ctx.fillStyle = '#2b2d31';
  ctx.beginPath();
  ctx.moveTo(-0.152, 0.03);
  ctx.lineTo(0.152, 0.03);
  ctx.lineTo(0.152, 0.078);
  ctx.quadraticCurveTo(0.152, 0.088, 0.14, 0.088);
  ctx.lineTo(-0.144, 0.088);
  ctx.quadraticCurveTo(-0.152, 0.088, -0.152, 0.078);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#17181a';
  ctx.lineWidth = 0.004;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const x = -0.14 + i * 0.011; ctx.moveTo(x, 0.036); ctx.lineTo(x, 0.082); }
  ctx.moveTo(0.152, 0.036); ctx.lineTo(0.152, 0.08);
  ctx.stroke();
  ctx.fillStyle = '#0f1011';
  ctx.fillRect(-0.004, 0.07, 0.05, 0.018);
  ctx.fillRect(0.128, 0.088, 0.014, 0.01);
  ctx.fillRect(-0.15, 0.088, 0.018, 0.01);
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(0.133, 0.091, 0.005, 0.005);
  ctx.restore();
  if (blood > 0) {
    ctx.fillStyle = `rgba(150, 12, 24, ${Math.min(0.8, blood)})`;
    ctx.beginPath();
    ctx.ellipse(-0.1, -0.06, 0.03, 0.045, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Where a pistol in the near hand is: its origin, its angle (along the
 * forearm, the way it points) and whether it is drawn mirrored, so that it
 * is always the right way up for the way they face.
 */
export function heldGunFrame(j, s, f, grip = GLOCK_GRIP) {
  const from = j.midForeA, hand = j.handA;
  const a = Math.atan2(hand.y - from.y, hand.x - from.x);
  const c = Math.cos(a), n = Math.sin(a);
  // the grip sits in the fist: the origin is the grip's offset back from the hand
  const gx = -grip.x * s, gy = -grip.y * s * f;
  return { x: hand.x + c * gx - n * gy, y: hand.y + n * gx + c * gy, a, f, s };
}

/** A point in a held pistol's own frame, in the world. */
export function gunPoint(g, lx, ly) {
  const c = Math.cos(g.a), n = Math.sin(g.a);
  const x = lx * g.s, y = ly * g.s * g.f;
  return { x: g.x + c * x - n * y, y: g.y + n * x + c * y };
}

function drawHeldGun(ctx, j, s, f, blood, slide, kind = 'glock') {
  const m1911 = kind === 'm1911';
  const g = heldGunFrame(j, s, f, m1911 ? M1911_GRIP : GLOCK_GRIP);
  ctx.save();
  ctx.translate(g.x, g.y);
  ctx.rotate(g.a);
  ctx.scale(1, f);
  if (m1911) drawM1911Shape(ctx, s, blood, slide);
  else drawGlockShape(ctx, s, blood, slide);
  ctx.restore();
}

/* ------------------------------------ M1911 ---------------------------------- */

// the old .45: a long steel slide, wooden grips, a hammer at the back
export const M1911_W = 0.33;
export const M1911_H = 0.2;
export const M1911_GRIP = { x: -0.104, y: -0.058 };
export const M1911_MUZZLE = { x: 0.166, y: 0.056 };
export const M1911_PORT = { x: 0.028, y: 0.088 };

/** The M1911, centred on its own origin, muzzle toward +x. `slide` as for the Glock. */
export function drawM1911Shape(ctx, k = 1, blood = 0, slide = 0) {
  ctx.save();
  ctx.scale(k, k);
  ctx.lineJoin = 'round';
  // the frame, the trigger guard cut out of it, and the grip's steel round the wood
  ctx.fillStyle = '#2a2c30';
  ctx.beginPath();
  ctx.moveTo(-0.15, 0.034);
  ctx.lineTo(0.128, 0.034);
  ctx.lineTo(0.128, 0.012);
  ctx.lineTo(0.05, 0.006);
  ctx.quadraticCurveTo(0.052, -0.058, -0.004, -0.058);
  ctx.lineTo(-0.058, -0.036);
  ctx.lineTo(-0.074, -0.122);
  ctx.quadraticCurveTo(-0.112, -0.132, -0.146, -0.124);
  ctx.lineTo(-0.156, -0.012);
  ctx.lineTo(-0.168, 0.0);
  ctx.closePath();
  ctx.moveTo(-0.034, -0.004);
  ctx.lineTo(0.032, -0.004);
  ctx.quadraticCurveTo(0.036, -0.044, -0.004, -0.044);
  ctx.lineTo(-0.034, -0.03);
  ctx.closePath();
  ctx.fill('evenodd');
  // the wooden grip panel, chequered, two screws
  ctx.fillStyle = '#7b4a24';
  ctx.beginPath();
  ctx.moveTo(-0.07, -0.03);
  ctx.lineTo(-0.083, -0.112);
  ctx.quadraticCurveTo(-0.112, -0.12, -0.138, -0.112);
  ctx.lineTo(-0.146, -0.022);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#5a3416';
  ctx.lineWidth = 0.003;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) { const y = -0.04 - i * 0.016; ctx.moveTo(-0.142 + i * 0.001, y); ctx.lineTo(-0.076 - i * 0.002, y - 0.006); }
  ctx.stroke();
  ctx.fillStyle = '#c9ced3';
  for (const y of [-0.042, -0.1]) { ctx.beginPath(); ctx.arc(-0.108, y, 0.0055, 0, Math.PI * 2); ctx.fill(); }
  // the trigger
  ctx.strokeStyle = '#121214';
  ctx.lineWidth = 0.009;
  ctx.beginPath();
  ctx.moveTo(0.006, -0.002); ctx.lineTo(0.008, -0.03);
  ctx.stroke();
  // the hammer, cocked back over the grip safety
  ctx.fillStyle = '#1d1f22';
  ctx.beginPath();
  ctx.moveTo(-0.15, 0.05); ctx.lineTo(-0.178, 0.078); ctx.lineTo(-0.172, 0.088); ctx.lineTo(-0.142, 0.068);
  ctx.closePath();
  ctx.fill();
  // the slide: long, flat-topped, serrated at the back, a bushing at the muzzle
  ctx.save();
  ctx.translate(-slide, 0);
  ctx.fillStyle = '#3c4046';
  ctx.beginPath();
  ctx.moveTo(-0.152, 0.032);
  ctx.lineTo(0.162, 0.032);
  ctx.lineTo(0.166, 0.04);
  ctx.lineTo(0.166, 0.078);
  ctx.quadraticCurveTo(0.166, 0.086, 0.156, 0.086);
  ctx.lineTo(-0.146, 0.086);
  ctx.quadraticCurveTo(-0.152, 0.086, -0.154, 0.078);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#565b62';
  ctx.fillRect(-0.15, 0.078, 0.31, 0.008);
  ctx.strokeStyle = '#25282c';
  ctx.lineWidth = 0.004;
  ctx.beginPath();
  for (let i = 0; i < 7; i++) { const x = -0.145 + i * 0.009; ctx.moveTo(x, 0.038); ctx.lineTo(x, 0.08); }
  ctx.stroke();
  ctx.fillStyle = '#16181a';
  ctx.fillRect(0.004, 0.068, 0.048, 0.018);
  ctx.fillRect(0.146, 0.086, 0.012, 0.011);
  ctx.fillRect(-0.142, 0.086, 0.016, 0.01);
  ctx.beginPath();
  ctx.arc(0.163, 0.057, 0.013, 0, Math.PI * 2);
  ctx.fillStyle = '#2b2e33';
  ctx.fill();
  ctx.restore();
  if (blood > 0) {
    ctx.fillStyle = `rgba(150, 12, 24, ${Math.min(0.8, blood)})`;
    ctx.beginPath();
    ctx.ellipse(-0.11, -0.06, 0.03, 0.045, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ----------------------------------- a crate -------------------------------- */

const WOOD = '#b98243', WOOD_DARK = '#7a4f22', WOOD_LIGHT = '#d9a464', WOOD_EDGE = '#4d300f';

/** A wooden crate, w by h, centred on the origin. Stains are in its own frame. */
export function drawCrateShape(ctx, w, h, stains, holes = null) {
  const hw = w / 2, hh = h / 2, frame = w * 0.13;
  ctx.fillStyle = WOOD;
  ctx.fillRect(-hw, -hh, w, h);
  // planks
  ctx.strokeStyle = WOOD_DARK;
  ctx.lineWidth = w * 0.018;
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    const y = -hh + (h * i) / 4;
    ctx.moveTo(-hw, y); ctx.lineTo(hw, y);
  }
  ctx.stroke();
  // the frame and the brace
  ctx.fillStyle = WOOD_LIGHT;
  ctx.fillRect(-hw, hh - frame, w, frame);
  ctx.fillRect(-hw, -hh, w, frame);
  ctx.fillRect(-hw, -hh, frame, h);
  ctx.fillRect(hw - frame, -hh, frame, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-hw + frame, -hh + frame, w - frame * 2, h - frame * 2);
  ctx.clip();
  ctx.strokeStyle = WOOD_LIGHT;
  ctx.lineWidth = frame * 0.95;
  ctx.beginPath();
  ctx.moveTo(-hw, -hh); ctx.lineTo(hw, hh);
  ctx.stroke();
  ctx.strokeStyle = WOOD_DARK;
  ctx.lineWidth = w * 0.014;
  ctx.beginPath();
  const o = frame * 0.47 * Math.SQRT2;
  ctx.moveTo(-hw - o, -hh + o); ctx.lineTo(hw - o, hh + o);
  ctx.moveTo(-hw + o, -hh - o); ctx.lineTo(hw + o, hh - o);
  ctx.stroke();
  ctx.restore();
  // nails
  ctx.fillStyle = WOOD_EDGE;
  for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    ctx.beginPath();
    ctx.arc(x * (hw - frame / 2), y * (hh - frame / 2), w * 0.017, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = WOOD_EDGE;
  ctx.lineWidth = w * 0.03;
  ctx.strokeRect(-hw, -hh, w, h);
  if (stains) {
    for (const st of stains) {
      ctx.fillStyle = st.tint ? st.tint[st.dark ? 1 : 0] : st.dark ? 'rgba(110, 7, 16, 0.85)' : 'rgba(163, 16, 28, 0.8)';
      ctx.beginPath();
      ctx.ellipse(st.x, st.y, st.r, st.r * (st.flat || 1), st.a || 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (holes) {
    // bullet holes: splintered light wood round a dark hole
    for (const ho of holes) {
      ctx.fillStyle = WOOD_LIGHT;
      ctx.beginPath();
      ctx.arc(ho.x, ho.y, w * 0.03, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1006';
      ctx.beginPath();
      ctx.arc(ho.x, ho.y, w * 0.016, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/* ------------------------------------ taser ---------------------------------- */

export const TASER_W = 0.26;
export const TASER_H = 0.17;
export const TASER_GRIP = { x: -0.064, y: -0.052 };
export const TASER_MUZZLE = { x: 0.132, y: 0.03 };

/** A taser, centred on its own origin, the business end toward +x: yellow, a black grip, a cartridge in the front. */
export function drawTaserShape(ctx, k = 1, cart = true) {
  ctx.save();
  ctx.scale(k, k);
  ctx.lineJoin = 'round';
  // the grip and the trigger guard
  ctx.fillStyle = '#18191b';
  ctx.beginPath();
  ctx.moveTo(-0.03, 0.004);
  ctx.lineTo(-0.042, -0.102);
  ctx.quadraticCurveTo(-0.07, -0.112, -0.1, -0.104);
  ctx.lineTo(-0.104, 0.004);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#18191b';
  ctx.lineWidth = 0.009;
  ctx.beginPath();
  ctx.moveTo(-0.028, -0.002); ctx.quadraticCurveTo(0.03, -0.004, 0.028, -0.04); ctx.lineTo(-0.034, -0.044);
  ctx.stroke();
  ctx.strokeStyle = '#0c0c0d';
  ctx.beginPath();
  ctx.moveTo(-0.006, -0.004); ctx.quadraticCurveTo(0.004, -0.02, -0.006, -0.03);
  ctx.stroke();
  // the body
  ctx.fillStyle = '#f2c81c';
  ctx.beginPath();
  ctx.moveTo(-0.112, 0.0);
  ctx.lineTo(0.074, 0.0);
  ctx.lineTo(0.074, 0.066);
  ctx.lineTo(-0.098, 0.066);
  ctx.quadraticCurveTo(-0.114, 0.066, -0.114, 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#8f7406';
  ctx.lineWidth = 0.004;
  ctx.stroke();
  ctx.fillStyle = '#1c1c1e';
  ctx.fillRect(-0.09, 0.044, 0.05, 0.012);
  ctx.fillStyle = '#c4161c';
  ctx.beginPath(); ctx.arc(0.058, 0.012, 0.007, 0, Math.PI * 2); ctx.fill();
  // the cartridge: black, with a yellow band, two probe ports at the front
  if (cart) {
    ctx.fillStyle = '#202022';
    ctx.fillRect(0.074, 0.002, 0.058, 0.062);
    ctx.fillStyle = '#f2c81c';
    ctx.fillRect(0.09, 0.002, 0.01, 0.062);
    ctx.fillStyle = '#5c5c60';
    ctx.beginPath(); ctx.arc(0.128, 0.046, 0.007, 0, Math.PI * 2); ctx.arc(0.128, 0.018, 0.007, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = '#3a3a3c';
    ctx.fillRect(0.074, 0.016, 0.012, 0.034);
  }
  ctx.restore();
}

/* ------------------------------------ vests ---------------------------------- */

const VEST = { civ: ['#30333a', '#1d1f24', '#4b505a'], police: ['#1c2a4a', '#111a30', '#33476f'] };

/**
 * A light vest worn on the body: front and back panels along the spine, from
 * just above the hips to just under the neck, shoulder straps over the top.
 * A police one says so, in white, on the chest.
 */
function drawWornVest(ctx, j, f, s, v) {
  const C = v.police ? VEST.police : VEST.civ;
  const lerpP = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const fwd = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1; return { x: (dy / d) * f, y: (-dx / d) * f }; };
  const lo = lerpP(j.hip, j.chest, 0.3), up = lerpP(j.chest, j.neck, 0.82);
  const n1 = fwd(j.hip, j.chest), n2 = fwd(j.chest, j.neck);
  const nc = { x: (n1.x + n2.x) / 2, y: (n1.y + n2.y) / 2 };
  const F = 0.088 * s, B = 0.074 * s;
  const at = (p, n, k) => ({ x: p.x + n.x * k, y: p.y + n.y * k });
  const pts = [at(lo, n1, F), at(j.chest, nc, F * 1.02), at(up, n2, F * 0.85), at(up, n2, -B * 0.85), at(j.chest, nc, -B), at(lo, n1, -B)];
  ctx.fillStyle = C[0];
  ctx.strokeStyle = C[1];
  ctx.lineWidth = 0.012 * s;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // the side seam, the straps, and a pocket on the front panel
  ctx.strokeStyle = C[2];
  ctx.lineWidth = 0.008 * s;
  ctx.beginPath();
  ctx.moveTo(lo.x, lo.y); ctx.lineTo(j.chest.x, j.chest.y); ctx.lineTo(up.x, up.y);
  ctx.stroke();
  ctx.strokeStyle = C[1];
  ctx.lineWidth = 0.02 * s;
  ctx.beginPath();
  const top = at(j.neck, n2, 0.01 * s);
  ctx.moveTo(pts[2].x, pts[2].y); ctx.quadraticCurveTo(top.x + n2.x * F * 0.4, top.y + n2.y * F * 0.4 + 0.02 * s, top.x, top.y);
  ctx.quadraticCurveTo(top.x - n2.x * B * 0.4, top.y - n2.y * B * 0.4 + 0.02 * s, pts[3].x, pts[3].y);
  ctx.stroke();
  // where rounds hit it
  for (const d of v.dents || []) {
    const p = d.t < 0.5 ? lerpP(lo, j.chest, d.t * 2) : lerpP(j.chest, up, d.t * 2 - 1);
    const n = d.t < 0.5 ? n1 : n2;
    const q = at(p, n, d.side > 0 ? F * 0.62 : -B * 0.6);
    ctx.fillStyle = d.hole ? '#2a0306' : '#0b0c0f';
    ctx.beginPath();
    ctx.arc(q.x, q.y, (d.hole ? 0.014 : 0.018) * s, 0, Math.PI * 2);
    ctx.fill();
    if (!d.hole) {
      ctx.strokeStyle = '#7d8590';
      ctx.lineWidth = 0.005 * s;
      ctx.stroke();
    }
  }
  if (v.police) {
    // POLICE, upright whatever the lean, small, on the chest
    const p = at(lerpP(lo, up, 0.62), nc, F * 0.32);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(0.0011 * s, -0.0011 * s);
    ctx.fillStyle = '#f4f4f4';
    ctx.font = '800 34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('POLICE', 0, 0);
    ctx.restore();
  }
}

/** A light vest folded up, lying on the floor or carried: w long, h deep, centred on the origin. */
export function drawVestShape(ctx, w, h, police = false, wear = 1) {
  const C = police ? VEST.police : VEST.civ;
  ctx.lineJoin = 'round';
  ctx.fillStyle = C[0];
  ctx.strokeStyle = C[1];
  ctx.lineWidth = w * 0.02;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2);
  ctx.lineTo(w / 2, -h / 2);
  ctx.quadraticCurveTo(w / 2 + h * 0.4, 0, w / 2, h / 2);
  ctx.lineTo(-w / 2, h / 2);
  ctx.quadraticCurveTo(-w / 2 - h * 0.4, 0, -w / 2, -h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = C[2];
  ctx.lineWidth = w * 0.012;
  ctx.beginPath();
  ctx.moveTo(-w * 0.42, 0); ctx.lineTo(w * 0.42, 0);
  ctx.stroke();
  // two straps, buckled
  ctx.fillStyle = C[1];
  for (const x of [-w * 0.22, w * 0.22]) ctx.fillRect(x - w * 0.03, -h / 2, w * 0.06, h);
  ctx.fillStyle = '#9aa1aa';
  for (const x of [-w * 0.22, w * 0.22]) ctx.fillRect(x - w * 0.018, -h * 0.18, w * 0.036, h * 0.36);
  if (police) {
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(-w * 0.12, -h * 0.28, w * 0.24, h * 0.56);
    ctx.fillStyle = C[0];
    ctx.fillRect(-w * 0.1, -h * 0.06, w * 0.2, h * 0.12);
  }
  if (wear < 0.5) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath(); ctx.arc(w * 0.08, h * 0.05, h * 0.18, 0, Math.PI * 2); ctx.fill();
  }
}

/** Carried while it goes on: the vest bundled between the hands. */
function drawVestBundle(ctx, j, s, v) {
  const x = (j.handA.x + j.handB.x) / 2, y = (j.handA.y + j.handB.y) / 2;
  const a = Math.atan2(j.handB.y - j.handA.y, j.handB.x - j.handA.x);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  drawVestShape(ctx, 0.26 * s, 0.13 * s, v.police, v.condition ?? 1);
  ctx.restore();
}

/* ------------------------------- worn kit and cuffs ------------------------------ */

/** A duty belt: a black band round the hips, a buckle at the front. */
function drawBelt(ctx, j, f, s) {
  const dx = j.chest.x - j.hip.x, dy = j.chest.y - j.hip.y, d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d, nx = uy * f, ny = -ux * f;
  const cx = j.hip.x + ux * 0.035 * s, cy = j.hip.y + uy * 0.035 * s;
  ctx.strokeStyle = '#0d0e10';
  ctx.lineWidth = 0.05 * s;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(cx - nx * 0.072 * s, cy - ny * 0.072 * s);
  ctx.lineTo(cx + nx * 0.08 * s, cy + ny * 0.08 * s);
  ctx.stroke();
  ctx.lineCap = 'round';
  ctx.fillStyle = '#b9c0c6';
  ctx.beginPath();
  ctx.arc(cx + nx * 0.072 * s, cy + ny * 0.072 * s, 0.017 * s, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Something put away: a pistol in its holster on the near hip, the grip
 * showing; an officer's taser on the far hip, grip forward; the handle of a
 * knife (or a glint of brass knuckles) out of the front pocket.
 */
function drawStowed(ctx, j, f, s, slot, kind) {
  const tx = j.kneeA.x - j.hip.x, ty = j.kneeA.y - j.hip.y, tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl, uy = ty / tl;                 // down the thigh
  const fx = -uy * f, fy = ux * f;                  // the thigh's front
  const a = Math.atan2(uy, ux);
  if (slot === 'holster' || slot === 'duty') {
    const duty = slot === 'duty';
    const along = duty ? 0.05 : 0.07, side = duty ? 0.04 : -0.035;
    const x = j.hip.x + ux * along * s + fx * side * s, y = j.hip.y + uy * along * s + fy * side * s;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.scale(1, duty ? -f : f);
    const k = 0.78 * s;
    if (kind === 'taser') drawTaserShape(ctx, k, true);
    else if (kind === 'm1911') drawM1911Shape(ctx, k, 0, 0);
    else drawGlockShape(ctx, k, 0, 0);
    // the holster over all but the grip
    ctx.fillStyle = '#121315';
    ctx.strokeStyle = '#2a2c30';
    ctx.lineWidth = 0.006 * s;
    ctx.beginPath();
    ctx.moveTo(-0.07 * k, -0.01 * k);
    ctx.lineTo(0.175 * k, -0.004 * k);
    ctx.quadraticCurveTo(0.19 * k, 0.05 * k, 0.17 * k, 0.1 * k);
    ctx.lineTo(-0.06 * k, 0.1 * k);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }
  // the front pocket, partway down the thigh
  const x = j.hip.x + ux * 0.13 * s + fx * 0.036 * s, y = j.hip.y + uy * 0.13 * s + fy * 0.036 * s;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a + Math.PI);                         // sticking up, out of the pocket
  if (kind === 'knife') {
    ctx.fillStyle = '#1c1c1c';
    ctx.fillRect(0, -0.016 * s, 0.075 * s, 0.032 * s);
    ctx.fillStyle = '#3a3a3a';
    ctx.beginPath(); ctx.ellipse(0.08 * s, 0, 0.012 * s, 0.018 * s, 0, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'taser') {
    ctx.fillStyle = '#18191b';
    ctx.fillRect(0, -0.018 * s, 0.06 * s, 0.036 * s);
    ctx.fillStyle = '#f2c81c';
    ctx.fillRect(0.06 * s, -0.022 * s, 0.03 * s, 0.044 * s);
  } else if (kind === 'knuckles') {
    ctx.strokeStyle = BRASS;
    ctx.lineWidth = 0.012 * s;
    ctx.beginPath(); ctx.arc(0.012 * s, 0, 0.018 * s, -1.2, 1.2); ctx.stroke();
  }
  ctx.restore();
}

/** Handcuffs: a steel ring round each wrist, and the short chain between them. */
function drawCuffs(ctx, j, s) {
  const a = j.handA, b = j.handB;
  ctx.strokeStyle = '#c9ced3';
  ctx.lineWidth = 0.014 * s;
  for (const p of [a, b]) { ctx.beginPath(); ctx.arc(p.x, p.y, 0.03 * s, 0, Math.PI * 2); ctx.stroke(); }
  ctx.strokeStyle = '#8e959c';
  ctx.lineWidth = 0.01 * s;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/* ---------------------------------- ammo boxes -------------------------------- */

/** A cartridge lying on its side, centred on the origin, `len` long: a brass case and a lead nose. */
function drawCartridge(ctx, len) {
  const r = len * 0.2;
  ctx.fillStyle = BRASS;
  ctx.fillRect(-len / 2, -r, len * 0.68, r * 2);
  ctx.fillStyle = '#8a8f96';
  ctx.beginPath();
  ctx.moveTo(len * 0.18, -r);
  ctx.quadraticCurveTo(len * 0.52, -r * 0.9, len * 0.5, 0);
  ctx.quadraticCurveTo(len * 0.52, r * 0.9, len * 0.18, r);
  ctx.closePath();
  ctx.fill();
}

/**
 * An ammo box, w by h, centred on the origin: a small cardboard box, a
 * medium plastic case, or a big steel can. `full` is how much is left in it.
 */
export function drawAmmoBoxShape(ctx, size, w, h, full = 1) {
  const hw = w / 2, hh = h / 2;
  ctx.lineJoin = 'round';
  if (size === 'small') {
    ctx.fillStyle = '#c9a36b';
    ctx.fillRect(-hw, -hh, w, h);
    ctx.fillStyle = '#b28a52';
    ctx.fillRect(-hw, hh - h * 0.2, w, h * 0.2);
    ctx.fillStyle = '#a8322c';
    ctx.fillRect(-hw, -h * 0.18, w, h * 0.34);
    ctx.save();
    ctx.translate(-w * 0.05, -h * 0.01);
    drawCartridge(ctx, h * 0.42);
    ctx.restore();
    ctx.strokeStyle = '#6e5330';
    ctx.lineWidth = w * 0.03;
    ctx.strokeRect(-hw, -hh, w, h);
  } else if (size === 'big') {
    ctx.fillStyle = '#5b5e2d';
    ctx.fillRect(-hw, -hh, w, h);
    ctx.fillStyle = '#474922';
    ctx.fillRect(-hw, hh - h * 0.26, w, h * 0.26);
    ctx.strokeStyle = '#33351a';
    ctx.lineWidth = w * 0.012;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) { const x = -hw + (w * i) / 4; ctx.moveTo(x, -hh + h * 0.08); ctx.lineTo(x, hh - h * 0.3); }
    ctx.stroke();
    // the stencilled band, and the folding handle on the lid
    ctx.fillStyle = '#d6c35a';
    ctx.fillRect(-hw + w * 0.08, -h * 0.12, w * 0.5, h * 0.09);
    ctx.fillRect(-hw + w * 0.08, -h * 0.32, w * 0.34, h * 0.07);
    ctx.save();
    ctx.translate(hw - w * 0.2, -h * 0.12);
    drawCartridge(ctx, h * 0.36);
    ctx.restore();
    ctx.strokeStyle = '#2e3017';
    ctx.lineWidth = h * 0.06;
    ctx.beginPath();
    ctx.moveTo(-w * 0.16, hh); ctx.lineTo(-w * 0.12, hh + h * 0.12); ctx.lineTo(w * 0.12, hh + h * 0.12); ctx.lineTo(w * 0.16, hh);
    ctx.stroke();
    ctx.strokeStyle = '#2e3017';
    ctx.lineWidth = w * 0.022;
    ctx.strokeRect(-hw, -hh, w, h);
  } else {
    ctx.fillStyle = '#3e5236';
    ctx.beginPath();
    ctx.moveTo(-hw + h * 0.12, -hh);
    ctx.lineTo(hw - h * 0.12, -hh);
    ctx.quadraticCurveTo(hw, -hh, hw, -hh + h * 0.12);
    ctx.lineTo(hw, hh - h * 0.12);
    ctx.quadraticCurveTo(hw, hh, hw - h * 0.12, hh);
    ctx.lineTo(-hw + h * 0.12, hh);
    ctx.quadraticCurveTo(-hw, hh, -hw, hh - h * 0.12);
    ctx.lineTo(-hw, -hh + h * 0.12);
    ctx.quadraticCurveTo(-hw, -hh, -hw + h * 0.12, -hh);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#26331f';
    ctx.lineWidth = w * 0.025;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-hw, hh - h * 0.3); ctx.lineTo(hw, hh - h * 0.3);
    ctx.stroke();
    ctx.fillStyle = '#b7bdb2';
    ctx.fillRect(-w * 0.06, hh - h * 0.42, w * 0.12, h * 0.22);
    ctx.strokeStyle = '#26331f';
    ctx.lineWidth = h * 0.08;
    ctx.beginPath();
    ctx.moveTo(-w * 0.2, hh); ctx.quadraticCurveTo(0, hh + h * 0.32, w * 0.2, hh);
    ctx.stroke();
    ctx.save();
    ctx.translate(-w * 0.12, -h * 0.12);
    drawCartridge(ctx, h * 0.4);
    ctx.restore();
  }
  if (full <= 0) {
    // empty: the lid hangs open
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(-hw * 0.9, hh - h * 0.12, w * 0.9, h * 0.1);
  }
}
