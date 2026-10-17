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
 * @param {object} o    { scale, facing, hair, face, weapon ('knuckles' or
 *                      'knife', in the near hand), weaponBlood, alpha,
 *                      wounds: [{bone, t, r}], broken: { boneName: true },
 *                      stuck: [{ x, y, a, blood }] knives stuck in them,
 *                      pale (0..1) }
 */
export function drawStickman(ctx, j, o) {
  const s = o.scale || 1;
  const lw = DIM.line * s;
  const r = DIM.headR * s;
  const ink = o.ink || INK, far = o.far || INK_FAR;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;

  // far side first, so the near arm and leg sit in front of the body
  ctx.strokeStyle = far;
  polyline(ctx, [j.hip, j.midFemB, j.kneeB, j.midTibB, j.footB, j.toeB]);
  polyline(ctx, [j.shoulder, j.midHumB, j.elbowB, j.midForeB, j.handB]);

  ctx.strokeStyle = ink;
  // the spine, then the neck up to the bottom of the head
  const ha = j.headAngle, f = o.facing || 1;
  const nx = j.head.x - Math.sin(ha) * f * r, ny = j.head.y - Math.cos(ha) * r;
  polyline(ctx, [j.hip, j.chest, j.neck, { x: nx, y: ny }]);
  polyline(ctx, [j.hip, j.midFemA, j.kneeA, j.midTibA, j.footA, j.toeA]);

  drawHead(ctx, j, o, r, lw);

  ctx.strokeStyle = ink;
  ctx.lineWidth = lw;
  polyline(ctx, [j.shoulder, j.midHumA, j.elbowA, j.midForeA, j.handA]);

  if (o.broken) drawBreaks(ctx, j, o.broken, lw);
  if (o.wounds && o.wounds.length) drawWounds(ctx, j, o.wounds, lw);
  if (o.weapon === 'knuckles') drawWornKnuckles(ctx, j.elbowA, j.handA, s, o.weaponBlood || 0);
  else if (o.weapon === 'knife') drawHeldKnife(ctx, j.midForeA, j.handA, s, o.weaponBlood || 0);
  if (o.stuck) {
    for (const k of o.stuck) {
      ctx.save();
      ctx.translate(k.x, k.y);
      ctx.rotate(k.a);
      drawKnifeShape(ctx, KNIFE_W * s, KNIFE_H * s, k.blood || 0);
      ctx.restore();
    }
  }
}

/** Where each broken bone shows: a dark mark where it gave, so it reads at a glance. */
const BREAK_AT = {
  humerusA: 'midHumA', forearmA: 'midForeA', humerusB: 'midHumB', forearmB: 'midForeB',
  femurA: 'midFemA', tibiaA: 'midTibA', femurB: 'midFemB', tibiaB: 'midTibB',
  ribs: 'chest', pelvis: 'hip', neck: 'neck',
};

function drawBreaks(ctx, j, broken, lw) {
  ctx.fillStyle = BLOOD_DARK;
  for (const [bone, on] of Object.entries(broken)) {
    if (!on) continue;
    if (bone === 'spine') {
      const x = (j.hip.x + j.chest.x) / 2, y = (j.hip.y + j.chest.y) / 2;
      ctx.beginPath(); ctx.arc(x, y, lw * 0.7, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    const at = j[BREAK_AT[bone]];
    if (!at) continue;
    ctx.beginPath();
    ctx.arc(at.x, at.y, lw * 0.72, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Blood that has run onto the body: dots along whichever bone it landed on. */
function drawWounds(ctx, j, wounds, lw) {
  const p = { x: 0, y: 0 };
  for (const w of wounds) {
    pointOnBone(j, w.bone, w.t, p);
    ctx.fillStyle = w.dark ? BLOOD_DARK : BLOOD;
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
  if (o.headMarks && o.headMarks.length) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    for (const m of o.headMarks) {
      ctx.fillStyle = m.dark ? BLOOD_DARK : BLOOD;
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
  if (o.face) drawFace(ctx, o.face, r, lw);
  ctx.restore();
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
function drawFace(ctx, face, r, lw) {
  const ex = [r * 0.12, r * 0.6], ey = r * 0.12;
  const thin = lw * 0.55;
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

/* ----------------------------------- a crate -------------------------------- */

const WOOD = '#b98243', WOOD_DARK = '#7a4f22', WOOD_LIGHT = '#d9a464', WOOD_EDGE = '#4d300f';

/** A wooden crate, w by h, centred on the origin. Stains are in its own frame. */
export function drawCrateShape(ctx, w, h, stains) {
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
      ctx.fillStyle = st.dark ? 'rgba(110, 7, 16, 0.85)' : 'rgba(163, 16, 28, 0.8)';
      ctx.beginPath();
      ctx.ellipse(st.x, st.y, st.r, st.r * (st.flat || 1), st.a || 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
