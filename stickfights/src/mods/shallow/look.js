/* =============================================================================
   SHALLOW - how it is all drawn.

     the disguise    an ordinary stickman, drawn the ordinary way - until it
                     cracks: black lines spread over the body, the face goes
                     dark, and two white pupils look out of it. (Now and then,
                     for a blink, the face slips.)
     the thing       tall, thin and blacker than the ink everyone else is
                     drawn in: limbs that taper, a long head, two white
                     pupils with nothing around them, a grin from the back of
                     the jaw to the front full of sharp white teeth, and five
                     long black claws on each hand. Wisps of black come off it.
     an empty skin   a stickman with nothing inside: the lines hollow, the
                     head sagging flat, holes where the eyes were, and a long
                     ragged split where something came out (or went in)
     the halves      the top half of someone, torn off at the waist, and the
                     legs on their own: a raw end, a stub of spine, and
                     what hangs out of it
     a skeleton      every bone of somebody, in one piece: skull, spine,
                     ribs, pelvis, arms and legs
     the insides     a heart, the lungs, a stomach, the guts
   ========================================================================== */
import { drawStickman, drawInjuries, drawHead, INK, INK_FAR, BLOOD, BLOOD_DARK } from '../../game/draw.js';
import { DIM, P, solve, makeJoints, pointOnBone } from '../../game/skeleton.js';
import { clamp01, TAU } from '../../core/util.js';
import { BLACK, BLACK_FAR, BONE, BONE_DARK, FLESH, FLESH_DARK, GUT, GUT_DARK, lerpPt } from './common.js';

const TEETH = '#f5f3ea';

/* --------------------------------- shapes ---------------------------------- */

/** A limb that is thicker at one end: a filled quad from a (width wa) to b (width wb), rounded at both ends. */
function taper(ctx, a, b, wa, wb) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-6;
  const nx = -dy / d, ny = dx / d;
  ctx.beginPath();
  ctx.moveTo(a.x + nx * wa / 2, a.y + ny * wa / 2);
  ctx.lineTo(b.x + nx * wb / 2, b.y + ny * wb / 2);
  ctx.lineTo(b.x - nx * wb / 2, b.y - ny * wb / 2);
  ctx.lineTo(a.x - nx * wa / 2, a.y - ny * wa / 2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(a.x, a.y, wa / 2, 0, TAU);
  ctx.arc(b.x, b.y, wb / 2, 0, TAU);
  ctx.fill();
}

function taperChain(ctx, pts, ws) {
  for (let i = 0; i < pts.length - 1; i++) taper(ctx, pts[i], pts[i + 1], ws[i], ws[i + 1]);
}

const ARM = { A: ['shoulder', 'midHumA', 'elbowA', 'midForeA', 'handA'], B: ['shoulder', 'midHumB', 'elbowB', 'midForeB', 'handB'] };
const LEG = { A: ['hip', 'midFemA', 'kneeA', 'midTibA', 'footA', 'toeA'], B: ['hip', 'midFemB', 'kneeB', 'midTibB', 'footB', 'toeB'] };

/** The joints of a limb, as far as it goes (to where it was cut off). */
function chainOf(j, chain, end) {
  const n = end ? chain.indexOf(end) + 1 : chain.length;
  return chain.slice(0, Math.max(1, n)).map((k) => j[k]);
}

function polyline(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

/* ---------------------------------- the thing -------------------------------- */

/**
 * Its grin, in the head's own frame (+x the way it looks, +y up), with the
 * jaw down by `m` (0 shut .. 1 as far as it goes, which is a long way).
 */
function grin(ctx, r, m, blood) {
  const L = { x: -r * 0.36, y: -r * 0.1 }, R = { x: r * 0.98, y: -r * 0.02 };
  const cu = { x: r * 0.34, y: -r * (0.62 - m * 0.18) };
  const cl = { x: r * 0.34, y: -r * (0.86 + m * 1.5) };
  const q = (c, t, out) => {
    const u = 1 - t;
    out.x = u * u * L.x + 2 * u * t * c.x + t * t * R.x;
    out.y = u * u * L.y + 2 * u * t * c.y + t * t * R.y;
    return out;
  };
  if (m > 0.02) {
    // the jaw, unhinged, hanging below where a chin would be
    ctx.fillStyle = BLACK;
    ctx.beginPath();
    ctx.moveTo(L.x, L.y);
    ctx.quadraticCurveTo(cl.x - r * 0.1, cl.y - r * 0.32, R.x, R.y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = m > 0.05 ? '#26040b' : '#000000';
  ctx.beginPath();
  ctx.moveTo(L.x, L.y);
  ctx.quadraticCurveTo(cu.x, cu.y, R.x, R.y);
  ctx.quadraticCurveTo(cl.x, cl.y, L.x, L.y);
  ctx.fill();
  // two rows of teeth, each pointing at the other, the bottom row in the gaps of the top
  const n = 11, a = { x: 0, y: 0 }, b = { x: 0, y: 0 }, mid = { x: 0, y: 0 }, opp = { x: 0, y: 0 };
  const row = (c, other, off) => {
    for (let i = 0; i < n - (off ? 1 : 0); i++) {
      const t0 = 0.035 + ((i + off) / n) * 0.93, t1 = 0.035 + ((i + 1 + off) / n) * 0.93, tm = (t0 + t1) / 2;
      q(c, t0, a); q(c, t1, b); q(c, tm, mid); q(other, tm, opp);
      const dx = opp.x - mid.x, dy = opp.y - mid.y, d = Math.hypot(dx, dy) || 1;
      const len = Math.min(r * 0.24 * (0.55 + Math.sin(tm * Math.PI) * 0.6), d * 0.64 + r * 0.035);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(mid.x + (dx / d) * len, mid.y + (dy / d) * len);
      ctx.closePath();
      ctx.fill();
    }
  };
  ctx.fillStyle = TEETH;
  row(cu, cl, 0);
  row(cl, cu, 0.5);
  if (blood > 0.02) {
    // what is left on them
    ctx.fillStyle = `rgba(150, 12, 28, ${Math.min(0.85, blood)})`;
    for (let i = 0; i < 5; i++) {
      q(cu, 0.2 + i * 0.15, mid);
      ctx.beginPath();
      ctx.ellipse(mid.x, mid.y - r * 0.05, r * 0.07, r * (0.05 + (i % 2) * 0.06) * blood, 0, 0, TAU);
      ctx.fill();
    }
  }
}

function eyes(ctx, r, pin) {
  const k = pin ? 0.048 : 0.068;
  for (const [x, y] of [[r * 0.15, r * 0.3], [r * 0.6, r * 0.34]]) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * k * 3.4);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.34)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * k * 3.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, r * k, 0, TAU);
    ctx.fill();
  }
}

/** The head of it, in the head's own frame from (translate, mirror, turn). */
function creatureHead(ctx, j, f, r, sh) {
  ctx.save();
  ctx.translate(j.head.x, j.head.y);
  ctx.scale(f, 1);
  ctx.rotate(-j.headAngle);
  // long, and not quite round: it is not quite a head
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.ellipse(-r * 0.04, r * 0.1, r * 0.9, r * 1.14, 0.1, 0, TAU);
  ctx.fill();
  grin(ctx, r, sh ? sh.mouth : 0, sh ? sh.blood : 0);
  eyes(ctx, r, !!(sh && sh.pin));
  ctx.restore();
}

/**
 * Five claws off the end of a hand, fanned out along the forearm and curling
 * in toward the palm - more when they have hold of something.
 */
function claws(ctx, j, side, s, f, ext, curl) {
  const e = j['elbow' + side], h = j['hand' + side];
  const d = Math.hypot(h.x - e.x, h.y - e.y) || 1;
  const ux = (h.x - e.x) / d, uy = (h.y - e.y) / d;
  // the way they curl: the palm side, as they face
  const cx = -uy * f, cy = ux * f;
  const LEN = [0.23, 0.29, 0.33, 0.3, 0.24];
  const SPREAD = [-0.52, -0.25, 0, 0.24, 0.5];
  const w = DIM.line * s * 0.2;
  for (let i = 0; i < 5; i++) {
    const L = LEN[i] * s * (0.18 + 0.82 * ext);
    const a = SPREAD[i] * (1 - curl * 0.45) * f;
    const dx = ux * Math.cos(a) - uy * Math.sin(a), dy = ux * Math.sin(a) + uy * Math.cos(a);
    const off = (i - 2) * 0.016 * s;
    const bx = h.x + cx * off, by = h.y + cy * off;
    const bend = 0.12 + curl * 0.5;
    const tx = bx + dx * L * (1 - curl * 0.25) + cx * L * bend, ty = by + dy * L * (1 - curl * 0.25) + cy * L * bend;
    const mx = bx + dx * L * 0.58 + cx * L * bend * 0.2, my = by + dy * L * 0.58 + cy * L * bend * 0.2;
    const nx = -dy * w, ny = dx * w;
    ctx.beginPath();
    ctx.moveTo(bx + nx, by + ny);
    ctx.quadraticCurveTo(mx + nx * 0.7, my + ny * 0.7, tx, ty);
    ctx.quadraticCurveTo(mx - nx * 0.5, my - ny * 0.5, bx - nx, by - ny);
    ctx.closePath();
    ctx.fill();
    // a thin edge of light along each, so five read as five
    ctx.strokeStyle = 'rgba(120, 120, 120, 0.55)';
    ctx.lineWidth = w * 0.35;
    ctx.beginPath();
    ctx.moveTo(bx + nx * 0.8, by + ny * 0.8);
    ctx.quadraticCurveTo(mx + nx * 0.6, my + ny * 0.6, tx, ty);
    ctx.stroke();
  }
}

/** The wisps of black that drift up off it. */
function drawWisps(ctx, sh) {
  for (const w of sh.wisps) {
    const k = w.age / w.life;
    // flakes of it coming away, shrinking as they go
    ctx.fillStyle = `rgba(3, 3, 3, ${(0.75 * (1 - k * k)).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.r * (1 - k * 0.7), 0, TAU);
    ctx.fill();
  }
}

/** The thing itself: man.sh says how far out its claws are, how wide its mouth, and so on. */
export const creatureSkin = {
  full(ctx, j, o, lw) {
    const man = o.man, sh = man && man.sh;
    const s = o.scale || 1, f = o.facing || 1, r = DIM.headR * s;
    const w = DIM.line * s * 0.78;
    const cut = o.cut || {};
    ctx.save();
    if (sh && sh.fade < 1) ctx.globalAlpha *= clamp01(sh.fade);
    if (sh && sh.wisps.length) drawWisps(ctx, sh);
    const ext = sh ? sh.claws : 1;
    // the far side first, a shade lighter
    ctx.fillStyle = BLACK_FAR;
    taperChain(ctx, chainOf(j, LEG.B, cut.legB), [w * 1.25, w * 1.05, w * 0.85, w * 0.7, w * 0.55, w * 0.35]);
    taperChain(ctx, chainOf(j, ARM.B, cut.armB), [w * 1.1, w * 0.95, w * 0.8, w * 0.7, w * 0.55]);
    if (!cut.armB) claws(ctx, j, 'B', s, f, ext, sh ? sh.curlB : 0);
    ctx.fillStyle = BLACK;
    // a long thin body, wider at the shoulders, the ribs showing through
    const nx = j.head.x - Math.sin(j.headAngle) * f * r, ny = j.head.y - Math.cos(j.headAngle) * r;
    taperChain(ctx, [j.hip, j.chest, j.neck, { x: nx, y: ny }], [w * 1.25, w * 1.75, w * 1.05, w * 0.75]);
    taper(ctx, j.shoulder, j.shoulder, w * 1.6, w * 1.6);
    if (sh && sh.bulge) {
      // something going down
      const b = sh.bulge, p = lerpPt(j.neck, j.hip, clamp01(b.t));
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, w * (1.3 + b.k), w * (1.2 + b.k * 0.8), 0, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(70, 70, 70, 0.7)';
    ctx.lineWidth = w * 0.14;
    for (let i = 0; i < 4; i++) {
      const p = lerpPt(j.chest, j.neck, 0.12 + i * 0.2);
      const q = lerpPt(j.chest, j.neck, 0.02 + i * 0.2);
      ctx.beginPath();
      ctx.moveTo(p.x - f * w * 0.15, p.y);
      ctx.quadraticCurveTo(p.x + f * w * 0.75, p.y, q.x + f * w * 0.62, q.y - w * 0.12);
      ctx.stroke();
    }
    ctx.fillStyle = BLACK;
    taperChain(ctx, chainOf(j, LEG.A, cut.legA), [w * 1.3, w * 1.1, w * 0.88, w * 0.72, w * 0.56, w * 0.36]);
    creatureHead(ctx, j, f, r, sh);
    ctx.fillStyle = BLACK;
    taperChain(ctx, chainOf(j, ARM.A, cut.armA), [w * 1.15, w * 1.0, w * 0.82, w * 0.72, w * 0.56]);
    if (!cut.armA) claws(ctx, j, 'A', s, f, ext, sh ? sh.curlA : 0);
    drawInjuries(ctx, j, o, w);
    ctx.restore();
    if (sh && sh.pour && sh.pour.k > 0.02) {
      // going in: black running out of it into the split, in long strands
      const P = sh.pour;
      ctx.strokeStyle = `rgba(3, 3, 3, ${(0.9 * P.k).toFixed(3)})`;
      ctx.lineCap = 'round';
      for (const [from, k] of [[j.chest, 1], [j.neck, 0.8], [j.handA, 0.6], [j.handB, 0.6], [j.hip, 0.9]]) {
        ctx.lineWidth = w * 0.55 * k * P.k;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo((from.x + P.x) / 2, Math.max(from.y, P.y) + 0.15 * s, P.x, P.y);
        ctx.stroke();
      }
    }
  },
};

/* ------------------------------- the disguise ------------------------------ */

/**
 * The cracks that open over a disguise as it goes: made once when it starts,
 * as points on the bones and the ways the cracks run from them.
 */
export function makeCracks() {
  const out = [];
  const bones = [0, 1, 1, 1, 0, 3, 5, 4, 6, 7, 10, 8, 11, 2];
  for (const b of bones) {
    const pts = [];
    let a = Math.random() * TAU, L = 0;
    const n = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      a += (Math.random() - 0.5) * 1.6;
      L = 0.025 + Math.random() * 0.04;
      pts.push([a, L]);
    }
    out.push({ bone: b, t: 0.15 + Math.random() * 0.7, pts, at: Math.random() * 0.5 });
  }
  return out;
}

/** A cracking, or the face slipping for a moment, over an ordinary stickman. */
export const disguiseSkin = {
  front(ctx, j, o) {
    const man = o.man, sh = man && man.sh;
    if (!sh) return;
    const crack = sh.crack || 0, glitch = sh.glitch || 0;
    if (crack <= 0 && glitch <= 0) return;
    const s = o.scale || 1, f = o.facing || 1, r = DIM.headR * s, lw = DIM.line * s;
    if (crack > 0 && sh.cracks) {
      ctx.strokeStyle = BLACK;
      ctx.lineCap = 'round';
      const p = { x: 0, y: 0 };
      for (const c of sh.cracks) {
        const k = clamp01((crack - c.at) / (1 - c.at));
        if (k <= 0) continue;
        pointOnBone(j, c.bone, c.t, p);
        let x = p.x, y = p.y;
        ctx.lineWidth = lw * (0.18 + k * 0.26);
        ctx.beginPath();
        ctx.moveTo(x, y);
        const n = Math.ceil(c.pts.length * k);
        for (let i = 0; i < n; i++) {
          const [a, L] = c.pts[i];
          x += Math.cos(a) * L * s;
          y += Math.sin(a) * L * s;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    // the face going dark, and what is underneath looking out
    const face = Math.max(glitch, clamp01((crack - 0.3) / 0.55));
    if (face > 0) {
      ctx.save();
      ctx.translate(j.head.x, j.head.y);
      ctx.scale(f, 1);
      ctx.rotate(-j.headAngle);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.97, 0, TAU);
      ctx.clip();
      ctx.fillStyle = BLACK;
      ctx.beginPath();
      ctx.ellipse(r * 0.42, -r * 0.05, r * (0.15 + 0.9 * face), r * (0.15 + 0.95 * face), 0, 0, TAU);
      ctx.fill();
      if (face > 0.45) {
        const k = clamp01((face - 0.45) / 0.55);
        ctx.globalAlpha *= k;
        grin(ctx, r * 0.92, 0, 0);
        eyes(ctx, r * 0.92, true);
      }
      ctx.restore();
    }
  },
};

/* --------------------------------- empty skins ------------------------------ */

/** The holes in a face with nothing behind it, in the head's own frame. */
function emptyFace(ctx, r, k) {
  ctx.fillStyle = `rgba(30, 30, 30, ${0.5 + 0.4 * k})`;
  for (const [x, y] of [[r * 0.12, r * 0.12], [r * 0.6, r * 0.12]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.1, r * (0.13 - 0.05 * k), 0, 0, TAU);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(r * 0.42, -r * 0.42, r * 0.16, r * (0.12 + 0.05 * k), 0, 0, TAU);
  ctx.fill();
}

/** A head with nothing in it: it sags, and goes flat toward the floor. */
function saggingHead(ctx, j, o, r, lw, k, face) {
  const cx = j.head.x, cy = j.head.y;
  ctx.save();
  ctx.translate(cx, cy - r * 0.34 * k);
  ctx.scale(1 + 0.18 * k, 1 - 0.5 * k);
  ctx.translate(-cx, -cy);
  drawHead(ctx, j, { ...o, face: k < 0.35 ? face : null }, r, lw);
  if (k >= 0.35) {
    const f = o.facing || 1;
    ctx.translate(cx, cy);
    ctx.scale(f, 1);
    ctx.rotate(-j.headAngle);
    emptyFace(ctx, r, k);
  }
  ctx.restore();
}

/**
 * The long split something comes out of (or goes into): down the back from
 * the neck to the hips, `open` wide, ragged-edged, wet - with blood, or
 * with the black the thing leaves on everything.
 */
function split(ctx, j, s, f, open, black, side = 1) {
  if (open <= 0.01) return;
  const lw = DIM.line * s;
  const pts = [j.hip, j.chest, lerpPt(j.chest, j.neck, 0.5), j.neck];
  // along the back (side 1): the side away from the way they face
  const edge = (sgn) => {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      const nx = (-dy / d) * f * side, ny = (dx / d) * f * side;
      for (let k = 0; k < 4; k++) {
        const t = k / 4, m = Math.sin(((i + t) / (pts.length - 1)) * Math.PI);
        const jag = (((i * 4 + k) % 2) ? 0.35 : 0) * lw;
        const wide = lw * (0.35 + open * 1.0 * m) * sgn + jag * sgn;
        out.push({ x: a.x + dx * t + nx * (lw * 0.4 + wide), y: a.y + dy * t + ny * (lw * 0.4 + wide) });
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  };
  const outer = edge(1), inner = edge(-0.4);
  ctx.fillStyle = black ? '#050505' : '#2a0308';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of outer) ctx.lineTo(p.x, p.y);
  for (let i = inner.length - 1; i >= 0; i--) ctx.lineTo(inner[i].x, inner[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = black ? '#2b2b2b' : BLOOD;
  ctx.lineWidth = lw * 0.18;
  polyline(ctx, [pts[0], ...outer]);
}

/**
 * Somebody's skin with nothing in it, drawn from the joints it lies in.
 * look: { scale, facing, hair, uniform, hat, belt, ink } - how they looked.
 * o: { deflate 0..1, open 0..1 (the split), black (what it is wet with), face }
 */
export function drawEmptySkin(ctx, j, look, o) {
  const s = look.scale || 1, f = look.facing || 1, k = clamp01(o.deflate ?? 1);
  drawStickman(ctx, j, {
    scale: s, facing: f, hair: look.hair, face: null, uniform: look.uniform || null, hat: look.hat || null, belt: !!look.belt,
    ink: look.ink || INK, far: look.far || INK_FAR, cut: o.cut || null, wounds: o.wounds || null, tint: o.tint || null,
    skin: {
      head: (c, jj, oo, r, lw) => saggingHead(c, jj, oo, r, lw, k, o.face || null),
      front: (c, jj) => {
        if (k > 0.05) {
          // nothing inside: the lines go hollow
          const lw = DIM.line * s;
          c.strokeStyle = `rgba(150, 150, 150, ${(0.85 * k).toFixed(3)})`;
          c.lineWidth = lw * 0.36 * k;
          const cut = o.cut || {};
          for (const ch of [LEG.B, ARM.B, LEG.A, ARM.A]) {
            const limb = ch === LEG.A ? 'legA' : ch === LEG.B ? 'legB' : ch === ARM.A ? 'armA' : 'armB';
            const pts = chainOf(jj, ch, cut[limb]);
            if (pts.length > 1) polyline(c, pts);
          }
          polyline(c, [jj.hip, jj.chest, jj.neck]);
        }
        split(c, jj, s, f, o.open || 0, !!o.black);
      },
    },
  });
}

/* ---------------------------------- halves ---------------------------------- */

/**
 * Where a body was torn through: raw, a stub of spine sticking out, and what
 * hangs out of it, swinging. `dir` is the way out of the body.
 */
function tornEnd(ctx, at, dir, s, t, tint = null) {
  const lw = DIM.line * s;
  const d = Math.hypot(dir.x, dir.y) || 1, ux = dir.x / d, uy = dir.y / d;
  // the guts first, hanging down whichever way up the rest is
  ctx.lineCap = 'round';
  if (!tint) {
    for (let i = 0; i < 3; i++) {
      const L = (0.16 + i * 0.07) * s;
      const sway = Math.sin(t * (1.7 + i * 0.6) + i * 2) * 0.05 * s;
      const sx = at.x + ux * lw * 0.3 + (i - 1) * lw * 0.25, sy = at.y + uy * lw * 0.3;
      const ex = sx + ux * L * 0.3 + sway, ey = sy - L;
      ctx.strokeStyle = GUT_DARK;
      ctx.lineWidth = lw * 0.55;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.bezierCurveTo(sx + ux * L * 0.6, sy + uy * L * 0.6, ex + (i - 1) * 0.06 * s, ey + L * 0.3, ex, ey);
      ctx.stroke();
      ctx.strokeStyle = GUT;
      ctx.lineWidth = lw * 0.36;
      ctx.stroke();
    }
  }
  // the spine, snapped off
  ctx.strokeStyle = BONE_DARK;
  ctx.lineWidth = lw * 0.42;
  ctx.beginPath();
  ctx.moveTo(at.x, at.y);
  ctx.lineTo(at.x + ux * 0.075 * s, at.y + uy * 0.075 * s);
  ctx.stroke();
  ctx.strokeStyle = BONE;
  ctx.lineWidth = lw * 0.28;
  ctx.stroke();
  // and the raw end, ragged
  ctx.fillStyle = tint ? tint[0] : FLESH;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU, rr = lw * (i % 2 ? 0.62 : 0.9);
    ctx.lineTo(at.x + Math.cos(a) * rr, at.y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tint ? tint[1] : FLESH_DARK;
  ctx.beginPath();
  ctx.arc(at.x, at.y, lw * 0.42, 0, TAU);
  ctx.fill();
}

const LEG_JOINTS = ['hip', 'midFemA', 'kneeA', 'midTibA', 'footA', 'toeA', 'midFemB', 'kneeB', 'midTibB', 'footB', 'toeB'];

/** Where somebody torn in half ends: a little below the middle of the back. */
export const tearPoint = (j) => lerpPt(j.chest, j.hip, 0.6);

/** The top half of somebody, torn off at the waist (their legs are a thing of their own now). */
export const halfSkin = {
  full(ctx, j, o) {
    const T = tearPoint(j);
    const j2 = { ...j };
    for (const k of LEG_JOINTS) j2[k] = T;
    const cut = { ...(o.cut || {}), legA: 'hip', legB: 'hip' };
    const wounds = (o.wounds || []).filter((w) => w.bone >= 1 && w.bone <= 6);
    drawStickman(ctx, j2, { ...o, skin: null, cut, wounds, belt: false, kit: null });
    const t = o.man ? o.man.sandbox.time : 0;
    tornEnd(ctx, T, { x: T.x - j.chest.x, y: T.y - j.chest.y }, o.scale || 1, t + (o.man ? o.man.seed : 0), o.tint);
  },
};

/** Somebody with their head bitten off. */
export const headlessSkin = {
  head(ctx, j, o, r, lw) {
    const f = o.facing || 1, a = j.headAngle;
    const nx = j.head.x - Math.sin(a) * f * r, ny = j.head.y - Math.cos(a) * r;
    tornEnd(ctx, { x: nx, y: ny }, { x: nx - j.neck.x, y: ny - j.neck.y }, o.scale || 1, 0, o.tint || [BLOOD, BLOOD_DARK]);
  },
};

/**
 * The legs, on their own: pts { U (the top of what is left of the back),
 * hip, kneeA/B, footA/B, toeA/B }; look as for drawEmptySkin.
 */
export function drawLowerHalf(ctx, pts, look, t = 0, clip = null) {
  const s = look.scale || 1, lw = DIM.line * s;
  const U = look.uniform || null;
  ctx.save();
  if (clip) {
    // half of it already gone into something's mouth: nothing past the line shows
    ctx.beginPath();
    ctx.rect(clip.x - 40, clip.y, 80, 40);
    ctx.clip();
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = U ? U.legsFar : look.far || INK_FAR;
  polyline(ctx, [pts.hip, pts.kneeB, pts.footB, pts.toeB]);
  ctx.strokeStyle = U ? U.top : look.ink || INK;
  polyline(ctx, [pts.hip, pts.U]);
  ctx.strokeStyle = U ? U.legs : look.ink || INK;
  polyline(ctx, [pts.hip, pts.kneeA, pts.footA, pts.toeA]);
  tornEnd(ctx, pts.U, { x: pts.U.x - pts.hip.x, y: pts.U.y - pts.hip.y }, s, t, look.tint || null);
  ctx.restore();
}

/* --------------------------------- a skeleton -------------------------------- */

function bone(ctx, a, b, w) {
  ctx.strokeStyle = BONE_DARK;
  ctx.lineWidth = w * 1.45;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.strokeStyle = BONE;
  ctx.lineWidth = w;
  ctx.stroke();
  for (const p of [a, b]) {
    ctx.fillStyle = BONE_DARK;
    ctx.beginPath();
    ctx.arc(p.x, p.y, w * 0.95, 0, TAU);
    ctx.fill();
    ctx.fillStyle = BONE;
    ctx.beginPath();
    ctx.arc(p.x, p.y, w * 0.7, 0, TAU);
    ctx.fill();
  }
}

/** Every bone in somebody, from the joints they lie in (j, as a body's; f the way the skull faces). */
export function drawSkeleton(ctx, j, s, f) {
  const w = DIM.line * s * 0.36, r = DIM.headR * s * 0.9;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // far limbs, then the spine and ribs, then the near limbs
  bone(ctx, j.hip, j.kneeB, w); bone(ctx, j.kneeB, j.footB, w); bone(ctx, j.footB, j.toeB, w * 0.8);
  bone(ctx, j.shoulder, j.elbowB, w * 0.9); bone(ctx, j.elbowB, j.handB, w * 0.8);
  // the spine: a row of little bones
  const sp = [j.hip, j.chest, j.neck];
  for (let i = 0; i < 2; i++) {
    const a = sp[i], b = sp[i + 1];
    for (let k = 0; k < 4; k++) {
      const p = lerpPt(a, b, k / 4 + 0.02), q = lerpPt(a, b, (k + 1) / 4 - 0.04);
      bone(ctx, p, q, w * 0.95);
    }
  }
  // the ribs, curving round to the front
  const ux = j.neck.x - j.chest.x, uy = j.neck.y - j.chest.y, L = Math.hypot(ux, uy) || 1;
  const fx = (uy / L) * f, fy = (-ux / L) * f;
  ctx.strokeStyle = BONE_DARK;
  for (let i = 0; i < 4; i++) {
    const p = lerpPt(j.chest, j.neck, 0.12 + i * 0.2);
    const reachOut = (0.13 + (i === 0 ? -0.02 : 0)) * s;
    ctx.lineWidth = w * 0.95;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.quadraticCurveTo(p.x + fx * reachOut + ux / L * 0.02 * s, p.y + fy * reachOut + uy / L * 0.02 * s, p.x + fx * reachOut * 0.9 - ux / L * 0.07 * s, p.y + fy * reachOut * 0.9 - uy / L * 0.07 * s);
    ctx.stroke();
    ctx.strokeStyle = BONE;
    ctx.lineWidth = w * 0.6;
    ctx.stroke();
    ctx.strokeStyle = BONE_DARK;
  }
  // the pelvis
  ctx.fillStyle = BONE;
  ctx.strokeStyle = BONE_DARK;
  ctx.lineWidth = w * 0.4;
  ctx.beginPath();
  ctx.ellipse(j.hip.x, j.hip.y + 0.01 * s, w * 2.3, w * 1.5, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // the near limbs
  bone(ctx, j.hip, j.kneeA, w); bone(ctx, j.kneeA, j.footA, w); bone(ctx, j.footA, j.toeA, w * 0.8);
  // the skull
  ctx.save();
  ctx.translate(j.head.x, j.head.y);
  ctx.scale(f, 1);
  ctx.rotate(-j.headAngle);
  ctx.fillStyle = BONE;
  ctx.strokeStyle = BONE_DARK;
  ctx.lineWidth = w * 0.45;
  ctx.beginPath();
  ctx.arc(0, r * 0.08, r * 0.92, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // the jaw, and its teeth
  ctx.beginPath();
  ctx.moveTo(-r * 0.1, -r * 0.55);
  ctx.quadraticCurveTo(r * 0.3, -r * 0.98, r * 0.8, -r * 0.62);
  ctx.lineTo(r * 0.82, -r * 0.42);
  ctx.lineTo(-r * 0.1, -r * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 5; i++) { ctx.moveTo(r * (0.1 + i * 0.16), -r * 0.42); ctx.lineTo(r * (0.1 + i * 0.16), -r * 0.6); }
  ctx.stroke();
  ctx.fillStyle = '#2b2620';
  ctx.beginPath();
  ctx.ellipse(r * 0.48, r * 0.12, r * 0.2, r * 0.22, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(r * 0.82, -r * 0.08); ctx.lineTo(r * 0.72, -r * 0.28); ctx.lineTo(r * 0.9, -r * 0.26);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  bone(ctx, j.shoulder, j.elbowA, w * 0.9); bone(ctx, j.elbowA, j.handA, w * 0.8);
}

/* --------------------------------- the insides ------------------------------- */

/** Each drawn about its middle, w wide and h high. */
export const ORGANS = {
  heart(ctx, w, h) {
    ctx.fillStyle = '#9c1022';
    ctx.strokeStyle = '#4e0610';
    ctx.lineWidth = w * 0.06;
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.5);
    ctx.bezierCurveTo(-w * 0.62, -h * 0.05, -w * 0.55, h * 0.55, -w * 0.12, h * 0.42);
    ctx.quadraticCurveTo(0, h * 0.36, w * 0.12, h * 0.42);
    ctx.bezierCurveTo(w * 0.55, h * 0.55, w * 0.62, -h * 0.05, 0, -h * 0.5);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#6a0b18';
    ctx.lineWidth = w * 0.14;
    ctx.beginPath();
    ctx.moveTo(-w * 0.1, h * 0.38); ctx.lineTo(-w * 0.16, h * 0.62);
    ctx.moveTo(w * 0.12, h * 0.38); ctx.lineTo(w * 0.2, h * 0.58);
    ctx.stroke();
  },
  lungs(ctx, w, h) {
    ctx.fillStyle = '#d27a86';
    ctx.strokeStyle = '#8c3a48';
    ctx.lineWidth = w * 0.05;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * w * 0.24, -h * 0.05, w * 0.22, h * 0.44, sx * 0.15, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.strokeStyle = '#b8a8a8';
    ctx.lineWidth = w * 0.09;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5); ctx.lineTo(0, h * 0.18);
    ctx.lineTo(-w * 0.16, h * 0.04); ctx.moveTo(0, h * 0.18); ctx.lineTo(w * 0.16, h * 0.04);
    ctx.stroke();
  },
  stomach(ctx, w, h) {
    ctx.fillStyle = '#c8616b';
    ctx.strokeStyle = '#7d2834';
    ctx.lineWidth = w * 0.06;
    ctx.beginPath();
    ctx.moveTo(-w * 0.3, h * 0.48);
    ctx.quadraticCurveTo(-w * 0.2, h * 0.1, -w * 0.45, -h * 0.1);
    ctx.quadraticCurveTo(-w * 0.5, -h * 0.5, 0, -h * 0.45);
    ctx.quadraticCurveTo(w * 0.55, -h * 0.4, w * 0.4, h * 0.05);
    ctx.quadraticCurveTo(w * 0.1, h * 0.05, -w * 0.12, h * 0.48);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  },
  guts(ctx, w, h) {
    ctx.lineCap = 'round';
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(-w * 0.42, h * 0.3);
      ctx.bezierCurveTo(-w * 0.5, -h * 0.4, -w * 0.05, -h * 0.4, -w * 0.08, h * 0.05);
      ctx.bezierCurveTo(-w * 0.1, h * 0.45, w * 0.35, h * 0.45, w * 0.32, 0);
      ctx.bezierCurveTo(w * 0.3, -h * 0.42, w * 0.05, -h * 0.4, w * 0.12, -h * 0.05);
      ctx.bezierCurveTo(w * 0.2, h * 0.25, w * 0.5, h * 0.2, w * 0.46, -h * 0.3);
    };
    path();
    ctx.strokeStyle = GUT_DARK;
    ctx.lineWidth = h * 0.3;
    ctx.stroke();
    ctx.strokeStyle = GUT;
    ctx.lineWidth = h * 0.2;
    ctx.stroke();
  },
};

/* ----------------------------------- icons ----------------------------------- */

const ICON_CRACKS = makeCracksFixed();

/** The same cracks every time, for the pictures. */
function makeCracksFixed() {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const out = [];
  for (const b of [0, 1, 1, 3, 4, 7, 10, 1]) {
    const pts = [];
    let a = rnd() * TAU;
    for (let i = 0; i < 5; i++) { a += (rnd() - 0.5) * 1.6; pts.push([a, 0.03 + rnd() * 0.04]); }
    out.push({ bone: b, t: 0.2 + rnd() * 0.6, pts, at: 0 });
  }
  return out;
}

/** Its card in the spawn menu: somebody ordinary, splitting - and what is underneath looking out. */
export function drawShallowIcon(ctx, w, h, card) {
  const j = solve(P({ t: 3, h: 4, aA: [26, 30], aB: [-8, 14], lA: [6, -4], lB: [-5, -4] }), 1, makeJoints());
  // close in on the top half: the face is the thing
  const s = card ? (h * 1.12) / 1.78 : h * 0.95;
  ctx.setTransform(s, 0, 0, -s, w * 0.44, card ? h * 1.16 : h + 0.86 * s);
  const fake = { sh: { crack: 0.85, cracks: ICON_CRACKS, glitch: 0 }, sandbox: { time: 0 }, seed: 0 };
  drawStickman(ctx, j, { scale: 1, facing: 1, hair: 'tuft', face: { eyes: 'normal', brow: 0, mouth: 0.2, open: 0 }, man: fake, skin: disguiseSkin, ink: INK });
  // and its claws, already out of one hand
  ctx.fillStyle = BLACK;
  claws(ctx, j, 'A', 1.15, 1, 1, 0.1);
}

/** The mod's picture: its face, close up, and its hands. */
export function drawModIcon(ctx, w, h) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w * 0.5, h * 0.45, h * 0.05, w * 0.5, h * 0.5, h * 0.75);
  g.addColorStop(0, '#a6a6a6');
  g.addColorStop(1, '#3d3d3d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const r = h * 0.3;
  ctx.setTransform(1, 0, 0, -1, w * 0.47, h * 0.47);
  const head = { head: { x: 0, y: 0 }, headAngle: 0 };
  creatureHead(ctx, head, 1, r, { mouth: 0.12, blood: 0, pin: false });
  // a hand of claws coming up at each side
  for (const sx of [-1, 1]) {
    const e = { x: sx * w * 0.42, y: -h * 0.62 }, hd = { x: sx * w * 0.36, y: -h * 0.36 };
    const jj = { elbowA: e, handA: hd };
    ctx.fillStyle = BLACK;
    taper(ctx, e, hd, r * 0.24, r * 0.17);
    claws(ctx, jj, 'A', r / 0.3, sx, 1, 0.15);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
