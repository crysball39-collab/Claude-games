/* =============================================================================
   MURDER DRONES - how the drones look.

   A drone is drawn on a stickman's bones like anybody else, with a head of
   its own: a casing with a screen for a face, and eyes that glow on it and
   show how it feels. On top of that, whatever makes each one who they are:
   Uzi's beanie and her purple hair, N's cap, V's long pale hair and her
   apron. A disassembly drone has wings on its back that fold up and spread,
   a tail with a needle on the end, and hands that can turn into a sword, a
   set of claws, a chainsaw, a gun, a laser or a missile pod.

   Everything here draws from the state species.js keeps on the drone
   (man.md): how far open the wings are, where the tail is, which hands are
   out and how far they have unfolded.
   ========================================================================== */
import { drawStickman, INK } from '../../game/draw.js';
import { solve, makeJoints, P } from '../../game/skeleton.js';
import { clamp, lerp, smooth } from '../../core/util.js';

export const OIL = ['#9a7b2b', '#5e4710'];
export const ACID = ['#b6f23a', '#5f8f12'];
export const UZI_PURPLE = '#b65cff';
export const DRONE_YELLOW = '#ffd23c';
const STEEL = '#c3cad1', STEEL_LIGHT = '#eef2f4', STEEL_DARK = '#5f676d';
const SCREEN = '#0b0b12';

const TAU = Math.PI * 2;
const norm = (x, y) => { const d = Math.hypot(x, y) || 1; return { x: x / d, y: y / d }; };

/** A rounded rectangle path, centred on (cx, cy). */
function rrect(ctx, cx, cy, w, h, r) {
  const x0 = cx - w / 2, y0 = cy - h / 2, x1 = cx + w / 2, y1 = cy + h / 2;
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x0 + r, y0);
  ctx.lineTo(x1 - r, y0);
  ctx.quadraticCurveTo(x1, y0, x1, y0 + r);
  ctx.lineTo(x1, y1 - r);
  ctx.quadraticCurveTo(x1, y1, x1 - r, y1);
  ctx.lineTo(x0 + r, y1);
  ctx.quadraticCurveTo(x0, y1, x0, y1 - r);
  ctx.lineTo(x0, y0 + r);
  ctx.quadraticCurveTo(x0, y0, x0 + r, y0);
  ctx.closePath();
}

/** The spine's frame: up along it, and the way out of their back. */
export function spineFrame(j, f) {
  const u = norm(j.neck.x - j.hip.x, j.neck.y - j.hip.y);
  return { u, back: { x: -u.y * f, y: u.x * f } };
}

/* ---------------------------------- wings ---------------------------------- */

// folded tight down the back, or spread up and back: [angle from the spine, length]
const FOLDED = [[132, 0.42], [148, 0.52], [162, 0.46]];
const SPREAD = [[28, 0.68], [62, 0.86], [96, 0.72]];

/** Where the struts of a wing end, for how far open it is. */
export function wingTips(j, f, s, open, flap = 0, spreadOff = 0) {
  const { u, back } = spineFrame(j, f);
  const root = { x: lerp(j.chest.x, j.neck.x, 0.6) + back.x * 0.04 * s, y: lerp(j.chest.y, j.neck.y, 0.6) + back.y * 0.04 * s };
  const k = smooth(clamp(open, 0, 1));
  const tips = [];
  for (let i = 0; i < 3; i++) {
    const a = (lerp(FOLDED[i][0], SPREAD[i][0], k) + flap * (8 + i * 4) + spreadOff * k) * Math.PI / 180;
    const L = lerp(FOLDED[i][1], SPREAD[i][1], k) * s;
    tips.push({ x: root.x + (u.x * Math.cos(a) + back.x * Math.sin(a)) * L, y: root.y + (u.y * Math.cos(a) + back.y * Math.sin(a)) * L });
  }
  return { root, tips };
}

function drawWing(ctx, j, f, s, open, flap, far, glow) {
  const { root, tips } = wingTips(j, f, s, open, flap, far ? 14 : 0);
  const lw = 0.07 * s;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // the membrane, scalloped between the struts
  ctx.fillStyle = far ? '#17171b' : '#25252c';
  ctx.beginPath();
  ctx.moveTo(root.x, root.y);
  ctx.lineTo(tips[0].x, tips[0].y);
  for (let i = 1; i < 3; i++) {
    const a = tips[i - 1], b = tips[i];
    const mx = root.x + ((a.x + b.x) / 2 - root.x) * 0.62, my = root.y + ((a.y + b.y) / 2 - root.y) * 0.62;
    ctx.quadraticCurveTo(mx, my, b.x, b.y);
  }
  ctx.closePath();
  ctx.fill();
  // the struts
  ctx.strokeStyle = far ? '#202024' : INK;
  ctx.lineWidth = lw * 0.55;
  ctx.beginPath();
  for (const t of tips) { ctx.moveTo(root.x, root.y); ctx.lineTo(t.x, t.y); }
  ctx.stroke();
  // and a glow at the end of each, from the thrusters, when they are out
  if (glow > 0.05) {
    for (const t of tips) {
      ctx.fillStyle = `rgba(255, 196, 58, ${0.35 * glow})`;
      ctx.beginPath(); ctx.arc(t.x, t.y, lw * 1.1, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255, 236, 160, ${0.9 * glow})`;
      ctx.beginPath(); ctx.arc(t.x, t.y, lw * 0.4, 0, TAU); ctx.fill();
    }
  }
}

/* ----------------------------------- tail ---------------------------------- */

/**
 * The tail, as a curve from the base of the spine: through `ctrl` to `tip`.
 * Left to itself it hangs down behind the legs, swaying, and curls up at the end.
 */
export function idleTail(j, f, s, t, seed = 0) {
  const { u, back } = spineFrame(j, f);
  const root = { x: j.hip.x + back.x * 0.06 * s - u.x * 0.04 * s, y: j.hip.y + back.y * 0.06 * s - u.y * 0.04 * s };
  const sway = Math.sin(t * 1.6 + seed) * 0.08;
  const ctrl = { x: root.x + back.x * (0.42 + sway) * s - u.x * 0.42 * s, y: root.y + back.y * (0.42 + sway) * s - u.y * 0.42 * s };
  const tip = { x: root.x + back.x * (0.72 + sway * 1.5) * s - u.x * 0.18 * s, y: root.y + back.y * (0.72 + sway * 1.5) * s - u.y * 0.18 * s };
  return { root, ctrl, tip };
}

function drawTail(ctx, tl, s) {
  const { root, ctrl, tip } = tl;
  const N = 12, lw = 0.07 * s;
  let px = root.x, py = root.y;
  ctx.lineCap = 'round';
  for (let i = 1; i <= N; i++) {
    const t = i / N, a = 1 - t;
    const x = a * a * root.x + 2 * a * t * ctrl.x + t * t * tip.x;
    const y = a * a * root.y + 2 * a * t * ctrl.y + t * t * tip.y;
    ctx.strokeStyle = INK;
    ctx.lineWidth = lw * (0.85 - t * 0.45);
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
    if (i === 4 || i === 8) {
      ctx.fillStyle = DRONE_YELLOW;
      ctx.beginPath(); ctx.arc(x, y, lw * 0.22, 0, TAU); ctx.fill();
    }
    px = x; py = y;
  }
  // the needle, along the way the tail ends
  const d = norm(tip.x - ctrl.x, tip.y - ctrl.y);
  const n = { x: -d.y, y: d.x };
  const L = 0.11 * s, w = 0.028 * s;
  ctx.fillStyle = STEEL;
  ctx.beginPath();
  ctx.moveTo(tip.x + n.x * w, tip.y + n.y * w);
  ctx.lineTo(tip.x + d.x * L, tip.y + d.y * L);
  ctx.lineTo(tip.x - n.x * w, tip.y - n.y * w);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = ACID[0];
  ctx.beginPath(); ctx.arc(tip.x + d.x * L * 0.92, tip.y + d.y * L * 0.92, w * 0.55, 0, TAU); ctx.fill();
}

/* ---------------------------------- hands ---------------------------------- */

/** The forearm's frame at a hand: along it, and across it on the top side. */
function armFrame(j, side, f) {
  const e = j['elbow' + side], h = j['hand' + side];
  const u = norm(h.x - e.x, h.y - e.y);
  return { h, u, n: { x: -u.y * f, y: u.x * f } };
}

/** How far along the forearm each form reaches, at full size (the blade points use this). */
export const FORM_REACH = { sword: 0.78, claw: 0.22, chainsaw: 0.62, gunArm: 0.26, laser: 0.15, missile: 0.24 };

function drawForm(ctx, j, side, md, s, f, now) {
  const form = md.form;
  if (!form) return;
  const { h, u, n } = armFrame(j, side, f);
  const k = smooth(clamp(md.formT, 0, 1));
  if (k <= 0.01) return;
  const at = (a, b) => ({ x: h.x + u.x * a * s + n.x * b * s, y: h.y + u.y * a * s + n.y * b * s });
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const poly = (pts, fill, stroke, w) => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = w; ctx.stroke(); }
  };
  if (form === 'sword') {
    const L = FORM_REACH.sword * k;
    poly([at(-0.02, 0.034), at(L * 0.82, 0.026), at(L, -0.004), at(L * 0.84, -0.03), at(-0.02, -0.026)], STEEL, STEEL_DARK, 0.008 * s);
    ctx.strokeStyle = STEEL_LIGHT;
    ctx.lineWidth = 0.006 * s;
    ctx.beginPath(); const a = at(0.04, -0.012), b = at(L * 0.86, -0.016); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    poly([at(-0.03, 0.05), at(0.02, 0.05), at(0.02, -0.044), at(-0.03, -0.044)], '#1c1c21', null, 0);
  } else if (form === 'claw') {
    for (const i of [-1, 0, 1]) {
      const L = FORM_REACH.claw * k * (i === 0 ? 1 : 0.86);
      const b0 = at(0, i * 0.026 + 0.012), b1 = at(0, i * 0.026 - 0.012);
      const tip = at(L, i * 0.05 - 0.05 * k);
      const mid = at(L * 0.6, i * 0.04 + 0.012);
      ctx.fillStyle = '#d8dde2';
      ctx.beginPath();
      ctx.moveTo(b0.x, b0.y);
      ctx.quadraticCurveTo(mid.x, mid.y, tip.x, tip.y);
      ctx.lineTo(b1.x, b1.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#3a3f45';
      ctx.lineWidth = 0.006 * s;
      ctx.stroke();
    }
  } else if (form === 'chainsaw') {
    const L = FORM_REACH.chainsaw * k, w = 0.045;
    // the bar
    ctx.fillStyle = '#4a4f55';
    ctx.beginPath();
    const a0 = at(0.03, w), a1 = at(L - w, w), a2 = at(L - w, -w), a3 = at(0.03, -w), c = at(L - w, 0);
    ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y);
    ctx.arc(c.x, c.y, w * s, Math.atan2(n.y, n.x), Math.atan2(-n.y, -n.x), f > 0);
    ctx.lineTo(a3.x, a3.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#1d1f22';
    ctx.lineWidth = 0.007 * s;
    ctx.stroke();
    // the teeth, running round it
    const run = md.sawRun ? (now * 2.2) % 0.05 : 0;
    ctx.fillStyle = '#ececec';
    for (let x = 0.05 + run; x < L - w; x += 0.05) {
      for (const sd of [1, -1]) {
        const p0 = at(x, sd * w), p1 = at(x + 0.022, sd * (w + 0.018)), p2 = at(x + 0.03, sd * w);
        poly([p0, p1, p2], '#ececec', null, 0);
      }
    }
    // the motor, at the wrist
    poly([at(-0.06, 0.06), at(0.05, 0.06), at(0.05, -0.06), at(-0.06, -0.06)], '#2a2a2e', null, 0);
    poly([at(-0.04, 0.062), at(0.03, 0.062), at(0.03, 0.044), at(-0.04, 0.044)], DRONE_YELLOW, null, 0);
  } else if (form === 'gunArm') {
    const L = FORM_REACH.gunArm * k;
    poly([at(-0.04, 0.042), at(L, 0.032), at(L, -0.032), at(-0.04, -0.042)], '#2a2a30', INK, 0.007 * s);
    const m = at(L, 0);
    const hot = clamp(1 - (now - (md.shotT ?? -9)) / 0.12, 0, 1);
    ctx.fillStyle = hot > 0 ? `rgba(255, 220, 90, ${0.5 + hot * 0.5})` : '#6b5a20';
    ctx.beginPath(); ctx.arc(m.x, m.y, 0.022 * s, 0, TAU); ctx.fill();
  } else if (form === 'laser') {
    const L = FORM_REACH.laser * k;
    poly([at(-0.03, 0.045), at(L, 0.04), at(L, -0.04), at(-0.03, -0.045)], '#2d2d33', INK, 0.007 * s);
    const m = at(L, 0), g = clamp(md.laserGlow || 0, 0, 1);
    ctx.fillStyle = `rgba(255, 176, 46, ${0.3 + g * 0.5})`;
    ctx.beginPath(); ctx.arc(m.x, m.y, (0.04 + g * 0.05) * s, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff2a8';
    ctx.beginPath(); ctx.arc(m.x, m.y, (0.02 + g * 0.012) * s, 0, TAU); ctx.fill();
  } else if (form === 'missile') {
    const L = FORM_REACH.missile * k;
    poly([at(-0.08, 0.065), at(L, 0.06), at(L, -0.06), at(-0.08, -0.065)], '#33363c', INK, 0.007 * s);
    const loaded = md.missiles === undefined ? 3 : md.missiles;
    for (let i = 0; i < 3; i++) {
      if (i >= loaded) continue;
      const y = (i - 1) * 0.036;
      poly([at(L - 0.01, y + 0.013), at(L + 0.04 * k, y), at(L - 0.01, y - 0.013)], '#e23b3b', null, 0);
    }
  }
}

/* ----------------------------------- head ---------------------------------- */

function eyeShape(ctx, x, y, w, h, kind, angry, slit) {
  ctx.beginPath();
  if (kind === 'closed' || kind === 'squint') {
    rrect(ctx, x, y - h * 0.15, w * 1.25, h * 0.2, h * 0.1);
  } else if (kind === 'happy') {
    ctx.moveTo(x - w * 0.7, y - h * 0.12);
    ctx.quadraticCurveTo(x, y + h * 0.55, x + w * 0.7, y - h * 0.12);
    ctx.quadraticCurveTo(x, y + h * 0.22, x - w * 0.7, y - h * 0.12);
  } else if (kind === 'wide') {
    ctx.arc(x, y, Math.max(w, h * 0.5) * 0.62, 0, TAU);
  } else if (slit) {
    // a disassembly drone with something in its sights: thin and sharp
    ctx.moveTo(x - w * 0.75, y + h * 0.28);
    ctx.lineTo(x + w * 0.75, y + h * 0.05);
    ctx.lineTo(x + w * 0.35, y - h * 0.22);
    ctx.lineTo(x - w * 0.6, y - h * 0.08);
    ctx.closePath();
  } else if (angry || kind === 'sad') {
    // the inner top corner cut down: a scowl (or, the other way, a droop)
    const dip = kind === 'sad' ? -1 : 1;
    ctx.moveTo(x - w / 2, y + h / 2 - (dip > 0 ? h * 0.35 : 0));
    ctx.lineTo(x + w / 2, y + h / 2 - (dip > 0 ? 0 : h * 0.35));
    ctx.lineTo(x + w / 2, y - h / 2);
    ctx.lineTo(x - w / 2, y - h / 2);
    ctx.closePath();
  } else {
    rrect(ctx, x, y, w, h, w / 2);
  }
}

function drawEyes(ctx, r, look, face, dead, ko, now) {
  const col = look.eye || DRONE_YELLOW;
  const eyes = face ? face.eyes : 'normal';
  const angry = face && face.brow < -0.35;
  const slit = angry && look.type === 'disassembly';
  const spots = [[r * 0.6, r * 0.02, r * 0.2, r * 0.44], [r * 0.12, r * 0.02, r * 0.15, r * 0.38]];
  if (dead) {
    ctx.strokeStyle = 'rgba(150, 140, 120, 0.85)';
    ctx.lineWidth = r * 0.07;
    for (const [x, y, w] of spots) {
      ctx.beginPath();
      ctx.moveTo(x - w * 0.6, y - w * 0.6); ctx.lineTo(x + w * 0.6, y + w * 0.6);
      ctx.moveTo(x - w * 0.6, y + w * 0.6); ctx.lineTo(x + w * 0.6, y - w * 0.6);
      ctx.stroke();
    }
    return;
  }
  if (ko) {
    // out cold: the screen fizzes
    ctx.fillStyle = 'rgba(200, 200, 200, 0.35)';
    for (let i = 0; i < 7; i++) {
      const y = -r * 0.45 + ((i * 0.17 + now * 1.7) % 1) * r * 0.9;
      ctx.fillRect(-r * 0.3, y, r * 1.15 * (0.4 + ((i * 7) % 5) / 8), r * 0.035);
    }
    return;
  }
  for (const [x, y, w, h] of spots) {
    // a glow first, then the eye itself
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = col;
    eyeShape(ctx, x, y, w * 1.7, h * 1.35, eyes, angry, slit);
    ctx.fill();
    ctx.globalAlpha = 1;
    eyeShape(ctx, x, y, w, h, eyes, angry, slit);
    ctx.fill();
  }
}

function drawHat(ctx, r, lw, look) {
  if (look.hat === 'beanie') {
    // Uzi's beanie, pulled down to her screen, with a band at the bottom
    ctx.fillStyle = '#2f2a3a';
    ctx.beginPath();
    ctx.moveTo(-r * 1.08, r * 0.36);
    ctx.bezierCurveTo(-r * 1.15, r * 1.25, r * 0.1, r * 1.6, r * 0.62, r * 1.18);
    ctx.quadraticCurveTo(r * 1.02, r * 0.86, r * 1.05, r * 0.36);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = lw * 0.8;
    ctx.stroke();
    ctx.strokeStyle = '#4c4259';
    ctx.lineWidth = r * 0.22;
    ctx.beginPath();
    ctx.moveTo(-r * 1.0, r * 0.47);
    ctx.quadraticCurveTo(0, r * 0.56, r * 0.98, r * 0.46);
    ctx.stroke();
  } else if (look.hat === 'cap') {
    // N's cap: snug, with a short peak and a flap down over the back of the head
    ctx.fillStyle = '#17171c';
    ctx.beginPath();
    ctx.moveTo(-r * 1.04, r * 0.3);
    ctx.bezierCurveTo(-r * 1.1, r * 1.12, r * 0.25, r * 1.38, r * 0.8, r * 0.98);
    ctx.quadraticCurveTo(r * 1.05, r * 0.72, r * 1.02, r * 0.42);
    ctx.lineTo(r * 1.42, r * 0.36);
    ctx.lineTo(r * 1.36, r * 0.27);
    ctx.lineTo(-r * 0.6, r * 0.28);
    ctx.lineTo(-r * 0.64, -r * 0.42);
    ctx.lineTo(-r * 1.02, -r * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = lw * 0.8;
    ctx.stroke();
    ctx.fillStyle = DRONE_YELLOW;
    ctx.beginPath(); ctx.arc(r * 0.35, r * 0.82, r * 0.09, 0, TAU); ctx.fill();
  }
}

function drawHair(ctx, r, look) {
  if (look.hair === 'uzi') {
    // a purple fringe out from under the beanie, and a lock at the back
    ctx.fillStyle = '#7d3cc8';
    ctx.beginPath();
    ctx.moveTo(r * 0.02, r * 0.4);
    ctx.lineTo(r * 1.08, r * 0.4);
    ctx.lineTo(r * 1.02, r * 0.08);
    ctx.lineTo(r * 0.84, r * 0.26);
    ctx.lineTo(r * 0.7, -r * 0.02);
    ctx.lineTo(r * 0.52, r * 0.24);
    ctx.lineTo(r * 0.34, r * 0.06);
    ctx.lineTo(r * 0.18, r * 0.26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#a866f0';
    ctx.beginPath();
    ctx.moveTo(r * 0.6, r * 0.4); ctx.lineTo(r * 0.95, r * 0.4); ctx.lineTo(r * 0.8, r * 0.18); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7d3cc8';
    ctx.beginPath();
    ctx.moveTo(-r * 1.06, r * 0.4);
    ctx.quadraticCurveTo(-r * 1.32, -r * 0.1, -r * 1.02, -r * 0.62);
    ctx.lineTo(-r * 0.86, -r * 0.2);
    ctx.lineTo(-r * 0.78, r * 0.38);
    ctx.closePath();
    ctx.fill();
  } else if (look.hair === 'v') {
    // long and pale: a sweep across the front over one eye, and the rest down her back
    ctx.fillStyle = '#d9cb98';
    ctx.beginPath();
    ctx.moveTo(-r * 0.92, r * 0.62);
    ctx.bezierCurveTo(-r * 1.55, -r * 0.4, -r * 1.25, -r * 1.6, -r * 0.7, -r * 2.25);
    ctx.lineTo(-r * 0.28, -r * 1.45);
    ctx.quadraticCurveTo(-r * 0.6, -r * 0.6, -r * 0.55, r * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f1e6bf';
    ctx.beginPath();
    ctx.moveTo(-r * 1.02, r * 0.22);
    ctx.bezierCurveTo(-r * 1.0, r * 1.25, r * 0.6, r * 1.32, r * 1.04, r * 0.62);
    ctx.quadraticCurveTo(r * 1.12, r * 0.2, r * 0.86, -r * 0.18);
    ctx.quadraticCurveTo(r * 0.72, r * 0.32, r * 0.2, r * 0.42);
    ctx.quadraticCurveTo(-r * 0.4, r * 0.5, -r * 1.02, r * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#bfae74';
    ctx.lineWidth = r * 0.045;
    ctx.beginPath();
    ctx.moveTo(r * 0.0, r * 0.92); ctx.quadraticCurveTo(r * 0.6, r * 0.72, r * 0.85, r * 0.1);
    ctx.stroke();
  } else if (look.hair === 'n') {
    // a pale tuft out from under the cap
    ctx.fillStyle = '#e6e6e6';
    ctx.beginPath();
    ctx.moveTo(r * 0.55, r * 0.3); ctx.lineTo(r * 0.95, r * 0.3); ctx.lineTo(r * 0.82, r * 0.08); ctx.lineTo(r * 0.7, r * 0.2); ctx.lineTo(r * 0.6, r * 0.04);
    ctx.closePath();
    ctx.fill();
  }
}

/** What they wear below the head: a white collar, and V's apron over a black skirt. */
function drawClothes(ctx, j, f, s, look) {
  const { u, back } = spineFrame(j, f);
  const fwd = { x: -back.x, y: -back.y };
  if (look.apron) {
    const h = j.hip;
    const P2 = (a, b) => ({ x: h.x + u.x * a * s + fwd.x * b * s, y: h.y + u.y * a * s + fwd.y * b * s });
    const skirt = [P2(0.08, -0.1), P2(0.08, 0.1), P2(-0.3, 0.17), P2(-0.33, -0.19)];
    ctx.fillStyle = '#121214';
    ctx.beginPath(); ctx.moveTo(skirt[0].x, skirt[0].y); for (const p of skirt.slice(1)) ctx.lineTo(p.x, p.y); ctx.closePath(); ctx.fill();
    const apron = [P2(0.06, 0.04), P2(0.06, 0.12), P2(-0.27, 0.19), P2(-0.29, 0.06)];
    ctx.fillStyle = '#f3f3f3';
    ctx.beginPath(); ctx.moveTo(apron[0].x, apron[0].y); for (const p of apron.slice(1)) ctx.lineTo(p.x, p.y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#9a9a9a';
    ctx.lineWidth = 0.008 * s;
    ctx.stroke();
  }
  if (look.collar) {
    const n = j.neck;
    ctx.fillStyle = '#f3f3f3';
    ctx.beginPath();
    ctx.moveTo(n.x + fwd.x * 0.02 * s, n.y + fwd.y * 0.02 * s);
    ctx.lineTo(n.x + fwd.x * 0.08 * s - u.x * 0.07 * s, n.y + fwd.y * 0.08 * s - u.y * 0.07 * s);
    ctx.lineTo(n.x - fwd.x * 0.01 * s - u.x * 0.06 * s, n.y - fwd.y * 0.01 * s - u.y * 0.06 * s);
    ctx.closePath();
    ctx.fill();
  }
}

function drawDroneHead(ctx, j, o, r, lw) {
  const man = o.man || {};
  const look = man.look || {};
  const f = o.facing || 1;
  drawClothes(ctx, j, f, o.scale || 1, look);
  ctx.save();
  ctx.translate(j.head.x, j.head.y);
  ctx.scale(f, 1);
  ctx.rotate(-j.headAngle);
  if (look.hair === 'v') {
    // her hair hangs behind the head, so it goes first
    ctx.save();
    ctx.beginPath();
    ctx.rect(-r * 3, -r * 3, r * 2.25, r * 6);
    ctx.clip();
    drawHair(ctx, r, look);
    ctx.restore();
  }
  // the casing, and the screen in it
  ctx.beginPath();
  rrect(ctx, 0, 0.02 * r, r * 2.05, r * 1.88, r * 0.62);
  ctx.fillStyle = look.type === 'disassembly' ? '#26262d' : '#3d3d46';
  ctx.fill();
  if (o.headMarks && o.headMarks.length) {
    ctx.save();
    ctx.clip();
    for (const m of o.headMarks) {
      ctx.fillStyle = m.burn ? '#1d1712' : m.tint ? (m.dark ? m.tint[1] : m.tint[0]) : OIL[m.dark ? 1 : 0];
      ctx.beginPath();
      ctx.ellipse(m.x * r, m.y * r, m.r * r, m.r * r * 0.8, 0.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.strokeStyle = o.ink || INK;
  ctx.lineWidth = lw;
  ctx.beginPath();
  rrect(ctx, 0, 0.02 * r, r * 2.05, r * 1.88, r * 0.62);
  ctx.stroke();
  ctx.fillStyle = SCREEN;
  ctx.beginPath();
  rrect(ctx, r * 0.3, 0, r * 1.3, r * 1.12, r * 0.42);
  ctx.fill();
  const face = o.face || { eyes: 'normal', brow: 0 };
  const dead = face.eyes === 'x';
  drawEyes(ctx, r, look, face, dead, face.eyes === 'spiral', man.sandbox ? man.sandbox.time : 0);
  // a cracked screen, if the head has taken enough
  if (o.broken && o.broken.skull) {
    ctx.strokeStyle = 'rgba(230, 230, 230, 0.7)';
    ctx.lineWidth = lw * 0.25;
    ctx.beginPath();
    ctx.moveTo(r * 0.0, r * 0.45); ctx.lineTo(r * 0.3, r * 0.1); ctx.lineTo(r * 0.18, -r * 0.2); ctx.lineTo(r * 0.5, -r * 0.48);
    ctx.moveTo(r * 0.3, r * 0.1); ctx.lineTo(r * 0.7, r * 0.2);
    ctx.stroke();
  }
  drawHat(ctx, r, lw, look);
  if (look.hair !== 'v') drawHair(ctx, r, look);
  else {
    // the fringe goes over the front of her head
    ctx.save();
    ctx.beginPath();
    ctx.rect(-r * 0.75, -r * 3, r * 4, r * 6);
    ctx.clip();
    drawHair(ctx, r, look);
    ctx.restore();
  }
  ctx.restore();
}

/* --------------------------------- the skin -------------------------------- */

/** What drawStickman calls, at each layer, for a drone. */
export const droneSkin = {
  back(ctx, j, o) {
    const man = o.man || {}, md = man.md || {}, look = man.look || {};
    const f = o.facing || 1, s = o.scale || 1;
    const now = man.sandbox ? man.sandbox.time : 0;
    if (look.wings) {
      const w = md.wing || { open: 0 };
      const flap = w.flap ? Math.sin(now * 13 + (man.seed || 0)) * w.flap : 0;
      const glow = clamp(w.thrust || 0, 0, 1);
      drawWing(ctx, j, f, s, w.open, flap * 0.8, true, glow * 0.7);
      drawWing(ctx, j, f, s, w.open, flap, false, glow);
    }
    if (look.tail) {
      const tl = md.tail && md.tail.root ? md.tail : idleTail(j, f, s, now, man.seed || 0);
      drawTail(ctx, tl, s);
    }
  },
  farArm(ctx, j, o) {
    const man = o.man || {};
    if (man.md && man.md.form && !(o.cut && o.cut.armB)) drawForm(ctx, j, 'B', man.md, o.scale || 1, o.facing || 1, man.sandbox ? man.sandbox.time : 0);
  },
  head: drawDroneHead,
  front(ctx, j, o) {
    const man = o.man || {};
    if (man.md && man.md.form && !(o.cut && o.cut.armA)) drawForm(ctx, j, 'A', man.md, o.scale || 1, o.facing || 1, man.sandbox ? man.sandbox.time : 0);
  },
};

/* ---------------------------------- icons ---------------------------------- */

/** One of the three, standing, for the spawn menu (and the little one on the spawn tool). */
export function drawDroneIcon(ctx, w, h, card, who, looks, drawRailgun) {
  const look = looks[who];
  const pose = who === 'uzi' ? P({ t: 4, aA: [62, 34], aB: [48, 52] })
    : who === 'n' ? P({ t: 2, aA: [26, 70], aB: [-14, 30], lA: [6, -4], lB: [-6, -4] })
      : P({ t: 6, h: 6, aA: [70, 30], aB: [40, 64], lA: [14, -10], lB: [-10, -6] });
  const j = solve(pose, 1, makeJoints());
  const fake = {
    look,
    md: {
      wing: { open: who === 'uzi' ? 0 : 0.8, flap: 0, thrust: 0 },
      form: who === 'v' ? 'claw' : who === 'n' ? 'sword' : null, formT: 1,
      tail: null,
    },
    seed: 1,
  };
  const s = card ? (h * 0.7) / 1.78 : h * 0.95;
  ctx.setTransform(s, 0, 0, -s, w * (who === 'uzi' ? 0.46 : 0.56), card ? h * 0.84 : h + 0.86 * s);
  drawStickman(ctx, j, {
    scale: 1, facing: 1, face: { eyes: who === 'v' ? 'normal' : 'happy', brow: who === 'v' ? -0.5 : 0, mouth: 0.4, open: 0 },
    man: fake, skin: droneSkin, ink: INK, far: '#2f2f2f',
    heldDraw: who === 'uzi' && drawRailgun ? (c, jj, sc, f) => drawRailgun(c, jj, sc, f, 0.4) : null,
  });
}

/** The three heads side by side: the mod's picture on the MODS screen. */
export function drawModIcon(ctx, w, h, looks) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#1a1520';
  ctx.fillRect(0, 0, w, h);
  // Copper 9's sky: dark, with a bit of glow at the bottom
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(255, 140, 60, 0.28)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const heads = [['n', 0.27, 0.58, 0.95], ['v', 0.73, 0.58, 0.95], ['uzi', 0.5, 0.66, 1.05]];
  for (const [who, x, y, k] of heads) {
    const r = h * 0.17 * k;
    const j = { head: { x: 0, y: 0 }, headAngle: 0, neck: { x: 0, y: -1 }, hip: { x: 0, y: -3 }, chest: { x: 0, y: -2 } };
    ctx.setTransform(1, 0, 0, -1, x * w, y * h);
    drawDroneHead(ctx, j, { man: { look: looks[who], md: {} }, facing: who === 'v' ? -1 : 1, face: { eyes: 'normal', brow: who === 'v' ? -0.5 : 0 }, scale: 1, ink: INK }, r, r * 0.42);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

