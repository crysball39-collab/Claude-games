/* =============================================================================
   THINGS IN THE DARK - how all of it is drawn.

     the Grasp     a dark mass trailing away to nothing, and out of it pale
                   arms: reaching on ahead of it, fingers spread, and
                   streaming back behind it like weed in a current
     the Rattle    a ball of rusted chain, wound round and round itself and
                   spinning, hooks sticking out of it, chain trailing behind,
                   and something burning at the heart of it
     the Listener  tall, thin and ash grey: a smooth face with nothing on it,
                   two great fans of ears (pink inside, ridged) that turn after
                   sounds, long hands with long thin fingers, and the little
                   rings of its clicking
     the wardrobe  dark old wood, two doors, a knob on each; and in the gap
                   between the doors, now and then, somebody's eyes
   ========================================================================== */
import { drawInjuries } from '../../game/draw.js';
import { DIM, P, solve, makeJoints } from '../../game/skeleton.js';
import { clamp01, TAU } from '../../core/util.js';
import {
  ARM_PALE, ARM_SHADE, ARM_DEEP, RUST, RUST_DARK, IRON, EMBER, ASH, ASH_DARK, ASH_FAR, EAR_IN, WOOD, WOOD_DARK, WOOD_LIGHT,
} from './common.js';

/** A fixed little sequence of numbers per seed (so a thing drawn every frame keeps its shape). */
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/** A tapered limb: a filled capsule from a (width wa) to b (width wb). */
function bone(ctx, a, b, wa, wb) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-6;
  const nx = -dy / d, ny = dx / d;
  ctx.beginPath();
  ctx.moveTo(a.x + nx * wa / 2, a.y + ny * wa / 2);
  ctx.lineTo(b.x + nx * wb / 2, b.y + ny * wb / 2);
  ctx.arc(b.x, b.y, wb / 2, Math.atan2(ny, nx), Math.atan2(ny, nx) + Math.PI, true);
  ctx.lineTo(a.x - nx * wa / 2, a.y - ny * wa / 2);
  ctx.arc(a.x, a.y, wa / 2, Math.atan2(-ny, -nx), Math.atan2(-ny, -nx) + Math.PI, true);
  ctx.closePath();
  ctx.fill();
}

/* ---------------------------------- the Grasp ---------------------------------- */

/** One pale arm, out of the mass at root, reaching along angle a for length L. */
function paleArm(ctx, root, a, L, w, bend, spread) {
  const ex = root.x + Math.cos(a) * L * 0.5, ey = root.y + Math.sin(a) * L * 0.5;
  const a2 = a + bend;
  const hx = ex + Math.cos(a2) * L * 0.5, hy = ey + Math.sin(a2) * L * 0.5;
  // an outline of shadow, then the arm
  for (const [col, k] of [[ARM_DEEP, 1.35], [ARM_PALE, 1]]) {
    ctx.fillStyle = col;
    bone(ctx, root, { x: ex, y: ey }, w * k, w * 0.86 * k);
    bone(ctx, { x: ex, y: ey }, { x: hx, y: hy }, w * 0.86 * k, w * 0.7 * k);
  }
  // the hand: a palm, and the fingers fanned out
  ctx.fillStyle = ARM_PALE;
  ctx.beginPath();
  ctx.arc(hx, hy, w * 0.75, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = ARM_PALE;
  ctx.lineCap = 'round';
  ctx.lineWidth = w * 0.32;
  for (let i = 0; i < 5; i++) {
    const fa = a2 + (i - 2) * spread * (i === 0 ? 1.6 : 1);
    const fl = w * (i === 0 ? 1.5 : 2.2 + (i === 2 ? 0.4 : 0));
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + Math.cos(fa) * fl, hy + Math.sin(fa) * fl);
    ctx.stroke();
  }
  ctx.strokeStyle = ARM_SHADE;
  ctx.lineWidth = w * 0.12;
  ctx.beginPath();
  ctx.moveTo(ex - Math.sin(a) * w * 0.2, ey + Math.cos(a) * w * 0.2);
  ctx.lineTo(ex + Math.cos(a2) * w * 0.6, ey + Math.sin(a2) * w * 0.6);
  ctx.stroke();
}

export function drawGrasp(ctx, r) {
  const t = r.sandbox.time, dir = r.dir, L = r.spec.len, H = r.spec.h;
  const front = r.x, mid = { x: front - dir * L * 0.45, y: H * 0.5 };
  ctx.save();
  // a pale glow round it, in the dark
  const g = ctx.createRadialGradient(mid.x, mid.y, 0.2, mid.x, mid.y, L * 0.75);
  g.addColorStop(0, 'rgba(210, 208, 198, 0.28)');
  g.addColorStop(1, 'rgba(210, 208, 198, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(mid.x - L, mid.y - L, L * 2, L * 2);
  const N = 40;
  const arms = [];
  for (let i = 0; i < N; i++) {
    const h1 = hash(i + 1), h2 = hash(i + 41), h3 = hash(i + 83);
    const trailing = h1 < 0.38;
    const rx = front - dir * L * (0.2 + h2 * 0.55), ry = 0.45 + h3 * (H - 0.9);
    const wave = Math.sin(t * (5 + h2 * 4) + i * 1.7) * (trailing ? 0.35 : 0.22);
    const up = (ry - H * 0.5) / H * 0.9;
    const base = trailing ? (dir > 0 ? Math.PI : 0) - up * 0.6 : (dir > 0 ? 0 : Math.PI) + up * dir;
    arms.push({ trailing, root: { x: rx, y: ry }, a: base + wave * (trailing ? 1 : dir), len: trailing ? 1.4 + h2 * 1.3 : 0.9 + h1 * 1.5, w: 0.095 + h3 * 0.04, bend: (trailing ? 0.4 : -0.35) * dir * (h3 - 0.3) + wave * 0.5, spread: 0.32 + h2 * 0.14 });
  }
  // the ones streaming behind, then the mass, then the ones reaching ahead
  for (const a of arms) if (a.trailing) paleArm(ctx, a.root, a.a, a.len, a.w * 0.85, a.bend, a.spread);
  for (let k = 0; k < 5; k++) {
    const cx = front - dir * L * (0.15 + k * 0.17), cy = H * (0.5 + Math.sin(t * 3 + k) * 0.04);
    const rr = H * (0.42 - k * 0.06);
    const gg = ctx.createRadialGradient(cx, cy, rr * 0.2, cx, cy, rr);
    gg.addColorStop(0, 'rgba(22, 21, 20, 0.96)');
    gg.addColorStop(0.7, 'rgba(30, 29, 27, 0.7)');
    gg.addColorStop(1, 'rgba(30, 29, 27, 0)');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rr * 1.25, rr, 0, 0, TAU);
    ctx.fill();
  }
  for (const a of arms) if (!a.trailing) paleArm(ctx, a.root, a.a, a.len, a.w, a.bend, a.spread);
  ctx.restore();
}

/* --------------------------------- the Rattle --------------------------------- */

/** A run of chain links along a path of points. */
function chainAlong(ctx, pts, size) {
  let acc = 0, n = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    for (let s = acc; s < d; s += size * 1.6) {
      const x = a.x + dx * (s / d), y = a.y + dy * (s / d);
      const flat = n++ % 2 === 0;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.strokeStyle = n % 5 === 0 ? IRON : RUST;
      ctx.lineWidth = size * 0.45;
      ctx.beginPath();
      if (flat) ctx.ellipse(0, 0, size, size * 0.55, 0, 0, TAU);
      else { ctx.moveTo(-size, 0); ctx.lineTo(size, 0); }
      ctx.stroke();
      if (flat) {
        ctx.strokeStyle = 'rgba(200, 120, 70, 0.55)';
        ctx.lineWidth = size * 0.14;
        ctx.beginPath();
        ctx.ellipse(0, size * 0.1, size * 0.8, size * 0.35, 0, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }
      ctx.restore();
    }
    acc = (acc + Math.ceil((d - acc) / (size * 1.6)) * size * 1.6) - d;
  }
}

export function drawRattle(ctx, r) {
  const t = r.sandbox.time, dir = r.dir, spin = r.spin;
  const c = { x: r.x - dir * 1.25, y: 1.25 };
  const R = 1.05;
  ctx.save();
  ctx.lineCap = 'round';
  // the chain trailing out behind it, swinging
  for (let k = 0; k < 3; k++) {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const s = i / 14;
      pts.push({ x: c.x - dir * (R * 0.7 + s * (1.8 + k * 0.5)), y: c.y + (k - 1) * 0.42 + Math.sin(t * 9 + s * 5 + k * 2) * 0.22 * s - s * 0.25 });
    }
    chainAlong(ctx, pts, 0.045);
  }
  // the fire at the middle of it
  const flick = 0.75 + Math.sin(t * 31) * 0.12 + Math.sin(t * 13.7) * 0.1;
  const g = ctx.createRadialGradient(c.x, c.y, 0.02, c.x, c.y, R * 0.75);
  g.addColorStop(0, `rgba(255, 210, 120, ${flick.toFixed(2)})`);
  g.addColorStop(0.35, `rgba(255, 90, 31, ${(flick * 0.85).toFixed(2)})`);
  g.addColorStop(0.75, 'rgba(120, 20, 10, 0.35)');
  g.addColorStop(1, 'rgba(120, 20, 10, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c.x, c.y, R * 0.75, 0, TAU);
  ctx.fill();
  // loop after loop of chain round it, each turning its own way
  for (let k = 0; k < 8; k++) {
    const rx = R * (0.62 + hash(k + 3) * 0.4), ry = R * (0.32 + hash(k + 9) * 0.6);
    const rot = spin * (0.6 + hash(k + 5) * 0.9) * (k % 2 ? 1 : -1) + k * 0.8;
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * TAU;
      const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      pts.push({ x: c.x + x * Math.cos(rot) - y * Math.sin(rot), y: c.y + x * Math.sin(rot) + y * Math.cos(rot) });
    }
    chainAlong(ctx, pts, 0.05);
  }
  // hooks, sticking out of it as it turns
  for (let k = 0; k < 7; k++) {
    const a = spin * 1.3 + (k / 7) * TAU + hash(k) * 0.4;
    const p0 = { x: c.x + Math.cos(a) * R * 0.75, y: c.y + Math.sin(a) * R * 0.75 };
    const p1 = { x: c.x + Math.cos(a) * R * 1.12, y: c.y + Math.sin(a) * R * 1.12 };
    ctx.strokeStyle = IRON;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.arc(p1.x + Math.cos(a + 1.57) * 0.09, p1.y + Math.sin(a + 1.57) * 0.09, 0.09, a - 1.57, a + 2.2);
    ctx.stroke();
    ctx.strokeStyle = RUST_DARK;
    ctx.lineWidth = 0.02;
    ctx.stroke();
  }
  // and sparks off it, behind
  ctx.strokeStyle = 'rgba(255, 200, 110, 0.9)';
  ctx.lineWidth = 0.022;
  for (let k = 0; k < 9; k++) {
    const h1 = hash(Math.floor(t * 30) * 13 + k), h2 = hash(Math.floor(t * 30) * 7 + k + 50);
    const x = c.x - dir * (0.4 + h1 * 1.8), y = 0.3 + h2 * 2.1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - dir * 0.18, y - 0.05);
    ctx.stroke();
  }
  ctx.restore();
}

/* -------------------------------- the Listener -------------------------------- */

/**
 * An ear, in the head's own frame (+x the way the face looks, +y up): a great
 * fan rising from `root`, tipped back by `a` radians - ridged, and pink inside.
 */
function earLocal(ctx, root, a, size, far) {
  ctx.save();
  ctx.translate(root.x, root.y);
  ctx.rotate(a);
  ctx.fillStyle = far ? ASH_FAR : ASH;
  ctx.beginPath();
  ctx.moveTo(size * 0.12, 0);
  ctx.bezierCurveTo(size * 0.62, size * 0.3, size * 0.62, size * 1.05, size * 0.06, size * 1.3);
  ctx.bezierCurveTo(-size * 0.5, size * 1.12, -size * 0.62, size * 0.42, -size * 0.18, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = ASH_DARK;
  ctx.lineWidth = size * 0.045;
  ctx.stroke();
  ctx.fillStyle = far ? '#9a7671' : EAR_IN;
  ctx.beginPath();
  ctx.moveTo(size * 0.06, size * 0.14);
  ctx.bezierCurveTo(size * 0.44, size * 0.34, size * 0.44, size * 0.96, size * 0.05, size * 1.12);
  ctx.bezierCurveTo(-size * 0.34, size * 0.98, -size * 0.44, size * 0.46, -size * 0.1, size * 0.14);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(110, 70, 66, 0.65)';
  ctx.lineWidth = size * 0.032;
  for (let i = 0; i < 4; i++) {
    const k = 0.3 + i * 0.19;
    ctx.beginPath();
    ctx.moveTo(-size * 0.24 * (1 - k * 0.3), size * k);
    ctx.quadraticCurveTo(0, size * (k + 0.07), size * 0.24 * (1 - k * 0.3), size * k);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Its head: a long smooth oval with nothing on it, and the mouth when it
 * opens - and its ears, up and back off the top of it, turned after whatever
 * it heard. part 'back': the far ear only (behind everything); 'front': the
 * head and the near ear.
 */
function listenerHead(ctx, j, f, r, L, dead, part = 'front') {
  const hx = j.head.x, hy = j.head.y, ha = j.headAngle;
  // (turned forward, toward something ahead; laid back otherwise)
  const turn = L ? L.ear * 0.35 : 0;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(-ha * f);
  ctx.scale(f, 1);
  if (part === 'back') {
    earLocal(ctx, { x: -r * 0.2, y: r * 0.85 }, 0.32 - turn, r * 1.6, true);
    ctx.restore();
    return;
  }
  ctx.fillStyle = dead ? '#8f8b83' : ASH;
  ctx.strokeStyle = ASH_DARK;
  ctx.lineWidth = r * 0.08;
  ctx.beginPath();
  ctx.ellipse(r * 0.08, r * 0.1, r * 0.92, r * 1.18, 0.15, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // the faintest hollows where eyes would be, and a crease down the front
  ctx.strokeStyle = 'rgba(95, 92, 85, 0.5)';
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.moveTo(r * 0.5, r * 0.45);
  ctx.quadraticCurveTo(r * 0.72, r * 0.3, r * 0.86, r * 0.38);
  ctx.moveTo(r * 0.84, r * 0.2);
  ctx.quadraticCurveTo(r * 0.94, -r * 0.12, r * 0.86, -r * 0.36);
  ctx.stroke();
  // the mouth: a slit, opening into a round black hole
  const m = L ? L.mouth : 0;
  ctx.fillStyle = '#120f0d';
  ctx.beginPath();
  ctx.ellipse(r * 0.6, -r * 0.62, r * (0.1 + m * 0.18), r * (0.03 + m * 0.3), 0.2, 0, TAU);
  ctx.fill();
  earLocal(ctx, { x: -r * 0.42, y: r * 0.72 }, 0.5 - turn, r * 1.75, false);
  ctx.restore();
}

/** The little rings of its clicks, going out from its mouth. */
function clickRings(ctx, j, f, r, L) {
  for (const c of L.clicks) {
    const k = c.t / 0.6;
    ctx.strokeStyle = `rgba(230, 228, 220, ${(0.55 * (1 - k)).toFixed(3)})`;
    ctx.lineWidth = r * 0.07;
    ctx.beginPath();
    ctx.arc(j.head.x + f * r * 0.7, j.head.y - r * 0.5, r * (0.4 + k * 1.6), f > 0 ? -0.7 : Math.PI - 0.7, f > 0 ? 0.7 : Math.PI + 0.7);
    ctx.stroke();
  }
}

/** Long thin fingers off a hand, along the forearm and spread. */
function fingers(ctx, e, h, s, f, curl) {
  const a = Math.atan2(h.y - e.y, h.x - e.x);
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.022 * s;
  for (let i = 0; i < 3; i++) {
    const fa = a + (i - 1) * 0.32 - curl * f * 0.5;
    const L1 = 0.13 * s, L2 = 0.1 * s;
    const m = { x: h.x + Math.cos(fa) * L1, y: h.y + Math.sin(fa) * L1 };
    const fa2 = fa - curl * f * 0.9;
    ctx.beginPath();
    ctx.moveTo(h.x, h.y);
    ctx.lineTo(m.x, m.y);
    ctx.lineTo(m.x + Math.cos(fa2) * L2, m.y + Math.sin(fa2) * L2);
    ctx.stroke();
  }
}

export const listenerSkin = {
  full(ctx, j, o) {
    const man = o.man, L = man && man.ls;
    const s = o.scale || 1, f = o.facing || 1, r = DIM.headR * s * 1.05;
    const w = DIM.line * s * 0.85;
    const cut = o.cut || {};
    const dead = man && man.dead;
    ctx.save();
    // the far side, a shade darker
    ctx.fillStyle = ASH_FAR;
    if (!cut.legB) { bone(ctx, j.hip, j.kneeB, w * 1.2, w * 0.9); bone(ctx, j.kneeB, j.footB, w * 0.9, w * 0.6); }
    if (!cut.armB) { bone(ctx, j.shoulder, j.elbowB, w * 1.0, w * 0.75); bone(ctx, j.elbowB, j.handB, w * 0.75, w * 0.55); ctx.strokeStyle = ASH_FAR; fingers(ctx, j.elbowB, j.handB, s, f, L && L.phase === 'lift' ? 0.6 : 0.2); }
    // the far ear, behind the head
    if (!cut.head) listenerHead(ctx, j, f, r, L, dead, 'back');
    // a long thin body
    ctx.fillStyle = dead ? '#8f8b83' : ASH;
    bone(ctx, j.hip, j.chest, w * 1.5, w * 1.9);
    bone(ctx, j.chest, j.neck, w * 1.9, w * 1.1);
    if (!cut.head) bone(ctx, j.neck, j.head, w * 1.0, w * 0.8);
    ctx.strokeStyle = 'rgba(90, 87, 80, 0.5)';
    ctx.lineWidth = w * 0.18;
    ctx.beginPath();
    ctx.moveTo(j.chest.x + f * w * 0.3, j.chest.y + 0.1 * s);
    ctx.quadraticCurveTo(j.hip.x + f * w * 0.6, (j.hip.y + j.chest.y) / 2, j.hip.x + f * w * 0.2, j.hip.y + 0.04 * s);
    ctx.stroke();
    ctx.fillStyle = dead ? '#8f8b83' : ASH;
    if (!cut.legA) { bone(ctx, j.hip, j.kneeA, w * 1.25, w * 0.95); bone(ctx, j.kneeA, j.footA, w * 0.95, w * 0.62); }
    if (!cut.head) listenerHead(ctx, j, f, r, L, dead, 'front');
    ctx.fillStyle = dead ? '#8f8b83' : ASH;
    if (!cut.armA) { bone(ctx, j.shoulder, j.elbowA, w * 1.05, w * 0.8); bone(ctx, j.elbowA, j.handA, w * 0.8, w * 0.6); ctx.strokeStyle = dead ? '#8f8b83' : ASH; fingers(ctx, j.elbowA, j.handA, s, f, L && (L.phase === 'lift' || L.phase === 'crush') ? 0.8 : 0.25); }
    drawInjuries(ctx, j, o, w);
    if (L && !dead) clickRings(ctx, j, f, r, L);
    ctx.restore();
  },
};

/* -------------------------------- the wardrobe -------------------------------- */

export function drawWardrobe(ctx, wd) {
  const t = wd.t, k = clamp01(wd.open);
  const jig = Math.sin(t * 47) * 0.025 * wd.shake;
  const x = wd.pos.x + jig, W = wd.w, H = wd.h, x0 = x - W / 2, x1 = x + W / 2;
  ctx.save();
  ctx.lineJoin = 'round';
  // feet, the body, the top
  ctx.fillStyle = WOOD_DARK;
  for (const fx of [x0 + 0.06, x1 - 0.12]) ctx.fillRect(fx, 0, 0.06, 0.1);
  ctx.fillStyle = WOOD;
  ctx.strokeStyle = WOOD_DARK;
  ctx.lineWidth = 0.025;
  ctx.fillRect(x0, 0.08, W, H - 0.08);
  ctx.strokeRect(x0, 0.08, W, H - 0.08);
  ctx.fillStyle = WOOD_LIGHT;
  ctx.fillRect(x0 - 0.05, H - 0.02, W + 0.1, 0.09);
  ctx.strokeRect(x0 - 0.05, H - 0.02, W + 0.1, 0.09);
  const top = H - 0.1, bot = 0.16, dw = W / 2 - 0.05;
  // inside: dark, a rail, and something hanging
  if (k > 0.02 || wd.broken) {
    ctx.fillStyle = '#140e09';
    ctx.fillRect(x0 + 0.04, bot, W - 0.08, top - bot);
    ctx.strokeStyle = '#3a2a1c';
    ctx.lineWidth = 0.02;
    ctx.beginPath();
    ctx.moveTo(x0 + 0.06, top - 0.12);
    ctx.lineTo(x1 - 0.06, top - 0.12);
    ctx.stroke();
    ctx.strokeStyle = '#4c4038';
    for (const hx of [x - 0.22, x + 0.18]) {
      ctx.beginPath();
      ctx.moveTo(hx, top - 0.12);
      ctx.lineTo(hx, top - 0.18);
      ctx.moveTo(hx - 0.14, top - 0.27);
      ctx.lineTo(hx, top - 0.18);
      ctx.lineTo(hx + 0.14, top - 0.27);
      ctx.stroke();
    }
  }
  if (!wd.broken) {
    // the doors: swung open toward their hinges, or shut
    for (const side of [-1, 1]) {
      const hinge = side < 0 ? x0 + 0.04 : x1 - 0.04;
      const ww = dw * (1 - k * 0.82);
      const dx0 = side < 0 ? hinge : hinge - ww;
      ctx.fillStyle = k > 0.3 ? WOOD_LIGHT : WOOD;
      ctx.strokeStyle = WOOD_DARK;
      ctx.lineWidth = 0.02;
      ctx.fillRect(dx0, bot, ww, top - bot);
      ctx.strokeRect(dx0, bot, ww, top - bot);
      // a panel in each, and a knob
      ctx.strokeRect(dx0 + ww * 0.15, bot + 0.18, ww * 0.7, (top - bot) * 0.4);
      ctx.strokeRect(dx0 + ww * 0.15, bot + 0.3 + (top - bot) * 0.42, ww * 0.7, (top - bot) * 0.36);
      ctx.fillStyle = '#c8a25a';
      ctx.beginPath();
      ctx.arc(side < 0 ? dx0 + ww - 0.07 : dx0 + 0.07, H * 0.5, 0.025, 0, TAU);
      ctx.fill();
    }
    // shut, with somebody in it: in the gap between the doors, now and then, eyes
    if (k < 0.1) {
      ctx.fillStyle = '#060403';
      ctx.fillRect(x - 0.012, bot, 0.024, top - bot);
      wd.inside.forEach((p, i) => {
        if (Math.sin(t * 0.8 + i * 2.1 + p.seed) < 0.35) return;
        ctx.fillStyle = 'rgba(235, 235, 225, 0.85)';
        const ey = 1.45 - i * 0.12;
        ctx.beginPath();
        ctx.arc(x - 0.004, ey, 0.009, 0, TAU);
        ctx.arc(x + 0.006, ey - 0.002, 0.009, 0, TAU);
        ctx.fill();
      });
    }
  } else {
    // the doors torn off: splintered hinges
    ctx.strokeStyle = WOOD_LIGHT;
    ctx.lineWidth = 0.025;
    for (const hx of [x0 + 0.05, x1 - 0.05]) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) ctx.lineTo(hx + (i % 2 ? 0.04 : -0.01) * (hx < x ? 1 : -1), bot + 0.2 + i * 0.28);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/* ----------------------------------- icons ----------------------------------- */

/** The pictures on the spawn menu's cards. */
export function drawIcon(ctx, w, h, card, kind) {
  ctx.save();
  if (kind === 'wardrobe') {
    const s = h * 0.42;
    ctx.setTransform(s, 0, 0, -s, w / 2, h * 0.95);
    drawWardrobe(ctx, { pos: { x: 0, y: 0 }, w: 1, h: 2.1, open: 0, shake: 0, broken: false, inside: [], t: 0 });
  } else if (kind === 'grasp') {
    const s = h * 0.34;
    ctx.setTransform(s, 0, 0, -s, w * 0.92, h * 0.98);
    drawGrasp(ctx, { x: 0, dir: 1, spec: { len: 4.2, h: 2.75 }, sandbox: { time: 0.4 } });
  } else if (kind === 'rattle') {
    const s = h * 0.36;
    ctx.setTransform(s, 0, 0, -s, w * 0.62, h * 0.94);
    drawRattle(ctx, { x: 1.25, dir: 1, spin: 0.6, sandbox: { time: 0.7 } });
  } else if (kind === 'listener') {
    const j = solve(P({ t: 22, h: 18, aA: [40, 60], aB: [70, 90], lA: [8, -6], lB: [-6, -6] }), 1.42, makeJoints());
    const s = card ? h / 1.9 : h * 0.62;
    ctx.setTransform(s, 0, 0, -s, w * 0.46, card ? h * 1.32 : h * 1.25);
    const fake = { ls: { ear: 0.4, mouth: 0, clicks: [{ t: 0.15 }, { t: 0.4 }], phase: 'listen' }, dead: false };
    listenerSkin.full(ctx, j, { man: fake, scale: 1.42, facing: 1, cut: {}, wounds: [] });
  }
  ctx.restore();
}

/** The mod's picture: a doorway of black, a light going, and two great ears in the dark. */
export function drawModIcon(ctx, w, h) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w * 0.5, h * 0.2, h * 0.02, w * 0.5, h * 0.45, h * 0.85);
  g.addColorStop(0, '#5a5650');
  g.addColorStop(0.45, '#1d1c1a');
  g.addColorStop(1, '#050505');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // a bulb, half lit
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = w * 0.015;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, 0);
  ctx.lineTo(w * 0.5, h * 0.14);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 236, 170, 0.85)';
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.19, w * 0.045, 0, TAU);
  ctx.fill();
  // the Listener's head and ears, out of the dark
  const s = h * 0.36;
  ctx.setTransform(s, 0, 0, -s, w * 0.5, h * 0.95);
  const j = { head: { x: 0, y: 1.25 }, headAngle: 0 };
  const r = 0.55;
  listenerHead(ctx, j, 1, r, { mouth: 0, ear: 0 }, false, 'back');
  listenerHead(ctx, j, 1, r, { mouth: 0, ear: 0 }, false, 'front');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
