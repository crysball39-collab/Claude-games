/* =============================================================================
   GODZILLA - how he is drawn: Gojira, as he was in 1954.

   Charcoal grey all over - near enough black, as the film had him - and
   rough with raised welts in rows across every part of him, like burn
   scars (the suit was made to look like keloid scarring). The belly paler,
   and creased across. Three rows of pale dorsal plates shaped like maple
   leaves, the biggest between his shoulders, from behind his head to the
   end of his tail - and when the breath is coming they light up, from the
   tail up, white. A small domed head on a thick neck: a heavy brow over
   small, white-rimmed, glaring eyes, little pointed ears, a short blunt
   snout and a heavy jaw, with rows of small sharp teeth that always show.
   Thick pillar legs, wrinkled round like an elephant's, on four-toed feet;
   short arms held up in front, the four fingers curled.

   Drawn in his own frame (body.js), squeezed and turned the way he faces.
   His pictures - the card, the MODS screen - are stills from the film:
   black and white, grainy, dark at the edges.
   ========================================================================== */
import { clamp, lerp, TAU, rng } from '../../core/util.js';
import { makeJoints } from '../../game/skeleton.js';
import { D, K, tailR, newBody, stepBody, boundsOf } from './body.js';

export const C = {
  ink: '#0b0b0a',
  skin: '#2c2c2a',
  far: '#1f1f1e',
  belly: '#3c3c39',
  ridge: '#161615',
  welt: '#4d4d49',
  lump: '#383835',
  plate: '#a9a79d',
  plateFar: '#6b6a64',
  plateEdge: '#34332f',
  teeth: '#eeeadd',
  mouth: '#3b1513',
  tongue: '#5c2420',
  eye: '#ebe7d9',
  iris: '#17130f',
  claw: '#d8d3c3',
  glow: '#eaf7ff',
};
const OUT = 0.075;   // the outline, in metres

/* --------------------------------- helpers --------------------------------- */

/** A tapered round-ended piece from a (radius ra) to b (radius rb), into the current path (counter-clockwise). */
function taper(ctx, a, b, ra, rb) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (d < 1e-6 || d <= Math.abs(ra - rb) + 1e-6) {
    const p = ra >= rb ? a : b, r = Math.max(ra, rb);
    ctx.moveTo(p.x + r, p.y);
    ctx.arc(p.x, p.y, r, 0, TAU, false);
    return;
  }
  const ang = Math.atan2(dy, dx), off = Math.acos(clamp((ra - rb) / d, -1, 1));
  ctx.moveTo(b.x + rb * Math.cos(ang - off), b.y + rb * Math.sin(ang - off));
  ctx.arc(b.x, b.y, rb, ang - off, ang + off, false);
  ctx.arc(a.x, a.y, ra, ang + off, ang - off + TAU, false);
  ctx.closePath();
}

function circle(ctx, p, r) { ctx.moveTo(p.x + r, p.y); ctx.arc(p.x, p.y, r, 0, TAU, false); }

/** A polygon, into the current path, counter-clockwise whichever way it was given. */
function poly(ctx, pts) {
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a.x * b.y - b.x * a.y; }
  const list = area < 0 ? [...pts].reverse() : pts;
  ctx.moveTo(list[0].x, list[0].y);
  for (let i = 1; i < list.length; i++) ctx.lineTo(list[i].x, list[i].y);
  ctx.closePath();
}

/** A smooth closed outline through points (quadratic curves between their midpoints). */
function blob(ctx, pts) {
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a.x * b.y - b.x * a.y; }
  const L = area < 0 ? [...pts].reverse() : pts, n = L.length;
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const m0 = mid(L[n - 1], L[0]);
  ctx.moveTo(m0.x, m0.y);
  for (let i = 0; i < n; i++) { const p = L[i], m = mid(p, L[(i + 1) % n]); ctx.quadraticCurveTo(p.x, p.y, m.x, m.y); }
  ctx.closePath();
}

const mixHex = (a, b, k) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, k));
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
};

/** Outlined and filled: the outline drawn first, fat, so only the outside edge of it shows. */
function solid(ctx, build, fill, ink = C.ink) {
  ctx.beginPath();
  build();
  ctx.lineWidth = OUT * 2;
  ctx.strokeStyle = ink;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

/* -------------------------------- the head --------------------------------- */

// the upper head and snout, and the lower jaw, in the head's own frame (x along the snout, y up, in suit units)
const HEAD = [
  [-0.5, -0.1], [-0.56, 0.45], [-0.32, 0.95], [0.18, 1.26], [0.72, 1.3], [1.08, 1.15], [1.36, 0.97], [1.42, 0.8], [1.72, 0.72],
  [2.14, 0.66], [2.42, 0.52], [2.56, 0.28], [2.58, 0.03], [2.46, -0.13], [2.0, -0.18], [1.3, -0.22], [0.6, -0.28], [0.1, -0.36], [-0.32, -0.36],
];
const JAW = [[0.05, -0.3], [0.8, -0.26], [1.6, -0.23], [2.25, -0.24], [2.4, -0.38], [2.3, -0.6], [1.72, -0.8], [0.9, -0.87], [0.2, -0.79], [-0.15, -0.55]];

function headPts(sk, list, jaw) {
  const out = [];
  const hx = 0.25, hy = -0.3;
  const c = Math.cos(-sk.jawA), s = Math.sin(-sk.jawA);
  for (const [x0, y0] of list) {
    let x = x0, y = y0;
    if (jaw) { const dx = x - hx, dy = y - hy; x = hx + dx * c - dy * s; y = hy + dx * s + dy * c; }
    out.push(sk.hd(x, y));
  }
  return out;
}

function drawHeadDetails(ctx, sk, gz) {
  // teeth along both jaws, always showing: small and sharp, the ones at the front of the top jaw longer
  const tooth = (base, dir, n0, n1, n, size, fang) => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const u = n0 + (n1 - n0) * (i / (n - 1));
      const p = base(u), q = base(u + 0.1);
      const long = (fang && i >= n - 3 && i < n - 1 ? 1.7 : 1) * (0.7 + 0.3 * (i / (n - 1))) * (i % 2 ? 0.82 : 1);
      const tip = { x: (p.x + q.x) / 2 + dir.x * size * long, y: (p.y + q.y) / 2 + dir.y * size * long };
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(q.x, q.y);
      ctx.closePath();
    }
    ctx.fillStyle = C.teeth;
    ctx.fill();
    ctx.lineWidth = 0.022;
    ctx.strokeStyle = 'rgba(25, 24, 20, 0.85)';
    ctx.stroke();
  };
  const up = (u) => sk.hd(u, lerp(-0.22, -0.14, (u - 0.6) / 1.8));
  const down = { x: -sk.U.x, y: -sk.U.y };
  tooth(up, down, 0.65, 2.3, 12, 0.15 * K, true);
  const c = Math.cos(-sk.jawA), s = Math.sin(-sk.jawA);
  const low = (u) => {
    const x = u, y = -0.24, dx = x - 0.25, dy = y + 0.3;
    return sk.hd(0.25 + dx * c - dy * s, -0.3 + dx * s + dy * c);
  };
  // (the lower teeth point up out of the lower jaw, turned with it)
  const jn = { x: -(sk.jawDir.y), y: sk.jawDir.x };
  tooth(low, jn, 0.75, 2.15, 10, 0.12 * K, false);
  // the eye: small, the white showing round a dark iris, glaring out from under the brow
  const eye = sk.eye, ea = Math.atan2(sk.F.y, sk.F.x) - 0.12;
  ctx.beginPath();
  ctx.ellipse(eye.x, eye.y, 0.19 * K, 0.105 * K, ea, 0, TAU);
  ctx.fillStyle = '#0f0f0e';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(eye.x, eye.y, 0.155 * K, 0.08 * K, ea, 0, TAU);
  ctx.fillStyle = gz.dead ? '#55534d' : C.eye;
  ctx.fill();
  if (!gz.dead) {
    const ix = eye.x + sk.F.x * 0.03 * K + sk.U.x * 0.012 * K, iy = eye.y + sk.F.y * 0.03 * K + sk.U.y * 0.012 * K;
    ctx.beginPath();
    ctx.arc(ix, iy, 0.068 * K, 0, TAU);
    ctx.fillStyle = C.iris;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ix + sk.F.x * 0.025 * K + sk.U.x * 0.03 * K, iy + sk.F.y * 0.025 * K + sk.U.y * 0.03 * K, 0.02 * K, 0, TAU);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();
  } else {
    ctx.beginPath();
    const a = sk.hd(1.02, 0.66), b = sk.hd(1.32, 0.64);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineWidth = 0.05 * K;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
  }
  // the brow: a heavy ridge over it, scowling - and a fold under it
  ctx.lineCap = 'round';
  ctx.beginPath();
  const b0 = sk.hd(0.8, 0.84), b1 = sk.hd(1.15, 0.92), b2 = sk.hd(1.42, 0.74);
  ctx.moveTo(b0.x, b0.y);
  ctx.quadraticCurveTo(b1.x, b1.y, b2.x, b2.y);
  ctx.lineWidth = 0.17 * K;
  ctx.strokeStyle = C.ridge;
  ctx.stroke();
  ctx.beginPath();
  const h0 = sk.hd(0.84, 0.92), h1 = sk.hd(1.15, 1.0), h2 = sk.hd(1.38, 0.86);
  ctx.moveTo(h0.x, h0.y);
  ctx.quadraticCurveTo(h1.x, h1.y, h2.x, h2.y);
  ctx.lineWidth = 0.05 * K;
  ctx.strokeStyle = C.welt;
  ctx.stroke();
  ctx.beginPath();
  const l0 = sk.hd(0.92, 0.5), l1 = sk.hd(1.15, 0.44), l2 = sk.hd(1.36, 0.52);
  ctx.moveTo(l0.x, l0.y);
  ctx.quadraticCurveTo(l1.x, l1.y, l2.x, l2.y);
  ctx.lineWidth = 0.045 * K;
  ctx.strokeStyle = C.ridge;
  ctx.stroke();
  // the nostril, near the top of the snout
  const ns = sk.hd(2.36, 0.42);
  ctx.beginPath();
  ctx.ellipse(ns.x, ns.y, 0.08 * K, 0.045 * K, Math.atan2(sk.F.y, sk.F.x) + 0.3, 0, TAU);
  ctx.fillStyle = '#080807';
  ctx.fill();
  // the little pointed ear, behind the eye
  ctx.beginPath();
  poly(ctx, [sk.hd(-0.02, 0.78), sk.hd(-0.42, 1.2), sk.hd(0.3, 1.02)]);
  ctx.fillStyle = C.skin;
  ctx.fill();
  ctx.lineWidth = 0.045;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  ctx.beginPath();
  const e0 = sk.hd(0.04, 0.88), e1 = sk.hd(-0.22, 1.08);
  ctx.moveTo(e0.x, e0.y);
  ctx.lineTo(e1.x, e1.y);
  ctx.lineWidth = 0.035 * K;
  ctx.strokeStyle = C.ridge;
  ctx.stroke();
  // welts over the skull and the snout, and the line of the cheek back from the mouth
  ctx.lineWidth = 0.045 * K;
  ctx.strokeStyle = C.ridge;
  ctx.beginPath();
  for (const [a, b] of [[[1.62, 0.5], [2.1, 0.44]], [[1.75, 0.3], [2.25, 0.22]], [[0.1, 0.5], [0.6, 0.62]], [[0.2, 0.15], [0.75, 0.3]],
    [[0.3, 0.95], [0.75, 1.08]], [[-0.2, 0.62], [0.15, 0.78]]]) {
    const p = sk.hd(a[0], a[1]), q = sk.hd(b[0], b[1]), m = sk.hd((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.07);
    ctx.moveTo(p.x, p.y);
    ctx.quadraticCurveTo(m.x, m.y, q.x, q.y);
  }
  ctx.stroke();
  ctx.lineWidth = 0.03 * K;
  ctx.strokeStyle = C.welt;
  ctx.beginPath();
  for (const [a, b] of [[[1.62, 0.55], [2.1, 0.49]], [[0.1, 0.56], [0.6, 0.68]], [[0.3, 1.01], [0.75, 1.14]]]) {
    const p = sk.hd(a[0], a[1]), q = sk.hd(b[0], b[1]);
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
  }
  ctx.stroke();
}

/* --------------------------------- the plates -------------------------------- */

/** The ridge along his back, from behind his head to the end of his tail: points, which way is out, how thick he is there. */
function spineOf(sk) {
  const pts = [];
  const push = (p, nx, ny, r) => pts.push({ x: p.x, y: p.y, nx, ny, r });
  // the neck: from behind the head down to the shoulders
  const dN = { x: sk.neckTop.x - sk.chest.x, y: sk.neckTop.y - sk.chest.y };
  const lN = Math.hypot(dN.x, dN.y) || 1;
  const bn = { x: -dN.y / lN, y: dN.x / lN };
  for (let i = 0; i <= 3; i++) {
    const k = i / 3;
    const p = { x: lerp(sk.neckTop.x, sk.chest.x, k), y: lerp(sk.neckTop.y, sk.chest.y, k) };
    push(p, bn.x, bn.y, lerp(D.neckR * 0.85, D.neckR, k));
  }
  // the back
  const u = sk.u, back = { x: -sk.n.x, y: -sk.n.y };
  for (let i = 1; i <= 4; i++) {
    const k = i / 4;
    const p = { x: sk.chest.x - u.x * D.torso * k * 0.9, y: sk.chest.y - u.y * D.torso * k * 0.9 };
    const nx = lerp(bn.x, back.x, Math.min(1, k * 2)), ny = lerp(bn.y, back.y, Math.min(1, k * 2)) + 0.25;
    const l = Math.hypot(nx, ny) || 1;
    push(p, nx / l, ny / l, lerp(D.chestR, D.belly, k) * 0.95);
  }
  // the tail
  const T = sk.tail;
  for (let i = 1; i < T.length; i++) {
    const a = T[i - 1], b = T[Math.min(T.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    // (whichever side of it is up)
    let nx = -dy / l, ny = dx / l;
    if (ny < 0) { nx = -nx; ny = -ny; }
    push(T[i], nx, ny, tailR(i));
  }
  // how far along each one is
  let s = 0;
  pts[0].s = 0;
  for (let i = 1; i < pts.length; i++) { s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); pts[i].s = s; }
  for (const p of pts) p.k = p.s / (s || 1);
  pts.len = s;
  return pts;
}

/** The point along the ridge at arc length s. */
function along(spine, s) {
  for (let i = 1; i < spine.length; i++) {
    const a = spine[i - 1], b = spine[i];
    if (s <= b.s || i === spine.length - 1) {
      const u = clamp((s - a.s) / ((b.s - a.s) || 1), 0, 1);
      const nx = lerp(a.nx, b.nx, u), ny = lerp(a.ny, b.ny, u), l = Math.hypot(nx, ny) || 1;
      return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), nx: nx / l, ny: ny / l, r: lerp(a.r, b.r, u), k: lerp(a.k, b.k, u) };
    }
  }
  return spine[spine.length - 1];
}

/** How big a plate is, a fraction k of the way from his head to the end of his tail. */
const plateSize = (k) => K * (k < 0.14 ? lerp(0.85, 2.05, k / 0.14) : k < 0.3 ? 2.05 : lerp(2.05, 0.26, Math.pow((k - 0.3) / 0.7, 0.75)));

// a maple leaf, more or less: seven lobes, base on the x axis, pointing up y, about 1 wide and 1 tall
const LEAF = [
  [-0.4, 0], [-0.48, 0.18], [-0.62, 0.3], [-0.47, 0.39], [-0.55, 0.58], [-0.32, 0.6], [-0.27, 0.84], [-0.09, 0.75], [0.02, 1],
  [0.13, 0.76], [0.3, 0.85], [0.33, 0.6], [0.56, 0.6], [0.47, 0.4], [0.62, 0.3], [0.49, 0.18], [0.4, 0],
];
// its ribs: from the base out to the tips of the lobes
const RIBS = [[-0.62, 0.3], [-0.55, 0.58], [-0.27, 0.84], [0.02, 1], [0.3, 0.85], [0.56, 0.6], [0.62, 0.3]];

/** Where each plate of one row is, and how big: the row's own spacing and offset. */
function platesOf(spine, row) {
  const out = [];
  const side = row !== 'mid';
  let s = 0.5 * K;
  // (each row's plates between the last one and the next: the side rows halfway along)
  let first = true;
  while (s < spine.len - 0.3) {
    const p = along(spine, s);
    const size = plateSize(p.k) * (side ? 0.64 : 1);
    if (!(side && first)) {
      const sink = side ? 0.66 : 0.8;
      out.push({ x: p.x + p.nx * p.r * sink, y: p.y + p.ny * p.r * sink, nx: p.nx, ny: p.ny, size, k: p.k });
    }
    const gap = Math.max(0.3 * K, plateSize(p.k) * 0.78);
    s += side && first ? gap * 0.5 : gap;
    first = false;
  }
  return out;
}

/** How lit a plate is, a fraction k of the way down from his head, with the glow at `glow` (it climbs up from the tail). */
const lit = (glow, k) => clamp((glow * 1.35 - (1 - k) * 0.9) * 2.2, 0, 1);

function drawPlates(ctx, list, fill, glow, edge = C.plateEdge) {
  for (const p of list) {
    const w = p.size * 1.05, h = p.size;
    // standing out from the back, leaning a little toward the tail
    const ang = Math.atan2(p.ny, p.nx) - Math.PI / 2 + 0.2;
    const c = Math.cos(ang), s = Math.sin(ang);
    const at = (lx, ly) => ({ x: p.x + lx * w * c - ly * h * s, y: p.y + lx * w * s + ly * h * c });
    const L = lit(glow, p.k);
    const col = L > 0 ? mixHex(fill, C.glow, L) : fill;
    ctx.beginPath();
    for (let i = 0; i < LEAF.length; i++) {
      const q = at(LEAF[i][0], LEAF[i][1]);
      if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
    }
    ctx.closePath();
    // paler toward the edge, darker where it comes out of him
    const base = at(0, 0), tip = at(0, 1);
    const gr = ctx.createLinearGradient(base.x, base.y, tip.x, tip.y);
    gr.addColorStop(0, L > 0.3 ? col : mixHex(fill, '#2c2d28', 0.45));
    gr.addColorStop(0.55, col);
    gr.addColorStop(1, L > 0 ? col : mixHex(fill, '#ffffff', 0.12));
    ctx.fillStyle = gr;
    ctx.fill();
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = L > 0.5 ? 'rgba(120, 170, 220, 0.9)' : edge;
    ctx.stroke();
    if (p.size > 0.45) {
      ctx.beginPath();
      for (const [rx, ry] of RIBS) {
        const a = at(0, 0.05), b = at(rx * 0.78, ry * 0.8);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.lineWidth = 0.03;
      ctx.strokeStyle = L > 0.5 ? 'rgba(255, 255, 255, 0.6)' : 'rgba(40, 40, 36, 0.4)';
      ctx.stroke();
    }
  }
}

/** The light coming off lit plates: drawn over everything, adding. */
function drawGlow(ctx, list, glow) {
  if (glow <= 0.02) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of list) {
    const L = lit(glow, p.k);
    if (L <= 0.05) continue;
    const r = p.size * 1.1;
    const cx = p.x + p.nx * p.size * 0.4, cy = p.y + p.ny * p.size * 0.4;
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, `rgba(205, 232, 255, ${0.42 * L})`);
    gr.addColorStop(1, 'rgba(150, 200, 255, 0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/* --------------------------------- the body --------------------------------- */

function tailPoly(sk) {
  const T = sk.tail, n = T.length;
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = T[Math.max(0, i - 1)], b = T[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l, r = tailR(i);
    left.push({ x: T[i].x + nx * r, y: T[i].y + ny * r });
    right.push({ x: T[i].x - nx * r, y: T[i].y - ny * r });
  }
  // a rounded end
  const e = T[n - 1], p = T[n - 2];
  const dx = e.x - p.x, dy = e.y - p.y, l = Math.hypot(dx, dy) || 1;
  const tip = { x: e.x + (dx / l) * tailR(n - 1) * 1.6, y: e.y + (dy / l) * tailR(n - 1) * 1.6 };
  return [...left, tip, ...right.reverse()];
}

/** The tail, the body, the neck and the head: one shape. */
function mainBody(ctx, sk) {
  blob(ctx, tailPoly(sk));
  taper(ctx, sk.hip, sk.chest, D.belly * 1.02, D.chestR);
  // the belly, out in front
  ctx.moveTo(sk.belly.x + D.belly * 1.05, sk.belly.y);
  ctx.ellipse(sk.belly.x + sk.n.x * 0.15 * K, sk.belly.y + sk.n.y * 0.15 * K, D.belly * 1.12, D.belly * 1.0, -sk.a + Math.PI / 2, 0, TAU, false);
  // the haunch, where the tail and the legs join
  circle(ctx, { x: sk.hip.x - 0.35 * K, y: sk.hip.y - 0.2 * K }, D.belly * 0.95);
  taper(ctx, sk.chest, sk.neckTop, D.neckR * 1.12, D.neckR * 0.88);
  blob(ctx, headPts(sk, HEAD, false));
  blob(ctx, headPts(sk, JAW, true));
}

/** One leg: thigh, shin, foot. */
function leg(ctx, L) {
  taper(ctx, L.hip, L.knee, D.thighR * 1.1, D.shinR * 1.05);
  taper(ctx, L.knee, L.ankle, D.shinR * 1.05, D.shinR * 0.85);
  // the foot: a heavy rounded block from the heel to the toes
  const c = Math.cos(L.tilt), s = Math.sin(L.tilt);
  const at = (x, y) => ({ x: L.ankle.x + (x * c - y * s) * K, y: L.ankle.y + (x * s + y * c) * K });
  blob(ctx, [at(-0.82, -0.8), at(-0.95, -0.2), at(-0.55, 0.35), at(0.3, 0.45), at(1.05, 0.05), at(1.62, -0.42), at(1.7, -0.8)]);
}

function legDetails(ctx, L, fill) {
  // toes and their claws
  const c = Math.cos(L.tilt), s = Math.sin(L.tilt);
  const at = (x, y) => ({ x: L.ankle.x + (x * c - y * s) * K, y: L.ankle.y + (x * s + y * c) * K });
  for (const [x, y, r] of [[0.78, -0.52, 0.26], [1.06, -0.56, 0.28], [1.34, -0.6, 0.27], [1.58, -0.66, 0.23]]) {
    const p = at(x, y);
    ctx.beginPath();
    circle(ctx, p, r * K);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    const q = at(x + r * 1.05, y - 0.12), tip = at(x + r * 1.75, y - 0.3), b = at(x + r * 0.6, y - r * 0.85);
    ctx.beginPath();
    ctx.moveTo(q.x, q.y);
    ctx.quadraticCurveTo(tip.x, tip.y + 0.1 * K, tip.x, tip.y);
    ctx.lineTo(b.x, b.y);
    ctx.closePath();
    ctx.fillStyle = C.claw;
    ctx.fill();
    ctx.lineWidth = 0.03;
    ctx.stroke();
  }
  // the knee, a fold of skin
  ctx.beginPath();
  ctx.arc(L.knee.x, L.knee.y, D.shinR * 0.7, -0.6, 1.1);
  ctx.lineWidth = 0.06 * K;
  ctx.strokeStyle = C.ridge;
  ctx.stroke();
  // and the ankle: deep wrinkles round it, where the leg meets the foot
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const y = 0.28 + i * 0.22;
    const a = at(-0.62, y), b = at(0.42, y + 0.05), m = at(-0.1, y - 0.12);
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(m.x, m.y, b.x, b.y);
  }
  ctx.lineWidth = 0.05 * K;
  ctx.stroke();
}

/** One arm: upper arm, forearm, hand - the fingers curled, the claws pale. */
function arm(ctx, A) {
  taper(ctx, A.shoulder, A.elbow, D.upperR * 1.1, D.foreR * 1.1);
  taper(ctx, A.elbow, A.hand, D.foreR * 1.1, D.foreR * 0.95);
  circle(ctx, A.hand, D.foreR * 1.05);
}

function fingers(ctx, A, fill, open = 0) {
  const dx = A.hand.x - A.elbow.x, dy = A.hand.y - A.elbow.y, a = Math.atan2(dy, dx);
  for (const [off, len] of [[-0.25, 0.75], [-0.75, 0.72], [-1.2, 0.65], [0.55, 0.5]]) {
    const ang = a + off * (1 - open * 0.6) - open * 0.2;
    const tip = { x: A.hand.x + Math.cos(ang) * len * K, y: A.hand.y + Math.sin(ang) * len * K };
    // curled: the end of it bent down
    const bend = ang - 0.9 * (1 - open);
    const end = { x: tip.x + Math.cos(bend) * 0.3 * K, y: tip.y + Math.sin(bend) * 0.3 * K };
    ctx.beginPath();
    taper(ctx, A.hand, tip, 0.17 * K, 0.13 * K);
    taper(ctx, tip, end, 0.13 * K, 0.1 * K);
    ctx.lineWidth = OUT * 1.4;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    ctx.fillStyle = fill;
    ctx.fill();
    const cl = { x: end.x + Math.cos(bend - 0.5) * 0.24 * K, y: end.y + Math.sin(bend - 0.5) * 0.24 * K };
    ctx.beginPath();
    ctx.moveTo(end.x + Math.cos(bend + 1.4) * 0.09 * K, end.y + Math.sin(bend + 1.4) * 0.09 * K);
    ctx.lineTo(cl.x, cl.y);
    ctx.lineTo(end.x + Math.cos(bend - 1.6) * 0.09 * K, end.y + Math.sin(bend - 1.6) * 0.09 * K);
    ctx.closePath();
    ctx.fillStyle = C.claw;
    ctx.fill();
  }
}

/**
 * His hide: raised welts, like keloid scars, in rough rows across every part
 * of him - made once for each of him, in each part's own terms (how far along
 * it, how far across), and put where that part is now.
 */
export function makeMarks(seed) {
  const r = rng(seed || 1);
  const out = [];
  const rows = (part, n, per, spread) => {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5 + (r() - 0.5) * 0.6) / n;
      for (let j = 0; j < per; j++) {
        const o = ((j + 0.5) / per * 2 - 1) * spread + (r() - 0.5) * (1.4 / per) * spread;
        out.push({ part, t: clamp(t, 0.02, 0.98), o, len: 0.5 + r() * 0.5, bend: 0.25 + r() * 0.45, tilt: (r() - 0.5) * 0.6 });
      }
    }
  };
  rows('torso', 16, 6, 0.84);
  rows('neck', 7, 4, 0.8);
  rows('tail', 34, 3, 0.66);
  rows('thighA', 9, 4, 0.8); rows('shinA', 8, 4, 0.78);
  rows('thighB', 8, 3, 0.75); rows('shinB', 7, 3, 0.72);
  rows('armA', 5, 3, 0.7); rows('foreA', 4, 3, 0.66);
  return out;
}

/** Where a welt is, which way its part runs there, and how thick the part is: { x, y, ax, ay, r }. */
function weltAt(sk, m) {
  const on = (a, b, r) => {
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, ax = dx / l, ay = dy / l;
    return { x: a.x + dx * m.t - ay * m.o * r, y: a.y + dy * m.t + ax * m.o * r, ax, ay, r };
  };
  switch (m.part) {
    case 'torso': return on(sk.hip, sk.chest, lerp(D.belly, D.chestR, m.t));
    case 'neck': return on(sk.chest, sk.neckTop, D.neckR);
    case 'tail': {
      const T = sk.tail, f = m.t * (T.length - 1.3), i = Math.floor(f);
      const a = T[i], b = T[i + 1], k = f - i, rr = lerp(tailR(i), tailR(i + 1), k);
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, ax = dx / l, ay = dy / l;
      return { x: a.x + dx * k - ay * m.o * rr, y: a.y + dy * k + ax * m.o * rr, ax, ay, r: rr };
    }
    case 'thighA': case 'thighB': { const L = sk.legs[m.part.slice(-1)]; return on(L.hip, L.knee, D.thighR); }
    case 'shinA': case 'shinB': { const L = sk.legs[m.part.slice(-1)]; return on(L.knee, L.ankle, D.shinR); }
    case 'armA': { const A = sk.arms.A; return on(A.shoulder, A.elbow, D.upperR); }
    case 'foreA': { const A = sk.arms.A; return on(A.elbow, A.hand, D.foreR); }
    default: return null;
  }
}

/**
 * The welts on the parts `only` picks: each a raised lump lying across the
 * part - the lump a little paler than the skin, the light on its top edge,
 * its shadow under it.
 */
function drawMarks(ctx, sk, marks, only) {
  const lumps = [];
  for (const m of marks) {
    if (!only(m.part)) continue;
    const w = weltAt(sk, m);
    if (!w) continue;
    // across the part, tilted a little
    const c = Math.cos(m.tilt), s = Math.sin(m.tilt);
    const px = -w.ay, py = w.ax;
    const dx = px * c - py * s, dy = px * s + py * c;
    const L = Math.min(0.34 * K, Math.max(0.12 * K, w.r * m.len * 0.3));
    lumps.push({ x: w.x, y: w.y, dx, dy, ax: w.ax, ay: w.ay, L, T: L * (0.32 + m.bend * 0.25), a: Math.atan2(dy, dx) });
  }
  if (!lumps.length) return;
  // the shadow under each one
  ctx.beginPath();
  for (const q of lumps) {
    const sx = q.x - q.ax * q.T * 0.55, sy = q.y - q.ay * q.T * 0.55;
    ctx.moveTo(sx + q.dx * q.L, sy + q.dy * q.L);
    ctx.ellipse(sx, sy, q.L, q.T, q.a, 0, TAU);
  }
  ctx.fillStyle = 'rgba(10, 10, 9, 0.55)';
  ctx.fill();
  // the lump
  ctx.beginPath();
  for (const q of lumps) {
    ctx.moveTo(q.x + q.dx * q.L, q.y + q.dy * q.L);
    ctx.ellipse(q.x, q.y, q.L, q.T, q.a, 0, TAU);
  }
  ctx.fillStyle = C.lump;
  ctx.fill();
  // the light along its top
  ctx.beginPath();
  for (const q of lumps) {
    const hx = q.x + q.ax * q.T * 0.35, hy = q.y + q.ay * q.T * 0.35;
    ctx.moveTo(hx - q.dx * q.L * 0.6, hy - q.dy * q.L * 0.6);
    ctx.quadraticCurveTo(hx + q.ax * q.T * 0.3, hy + q.ay * q.T * 0.3, hx + q.dx * q.L * 0.6, hy + q.dy * q.L * 0.6);
  }
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.035 * K;
  ctx.strokeStyle = 'rgba(105, 105, 98, 0.6)';
  ctx.stroke();
}

/** The belly: paler, and creased across. */
function drawBelly(ctx, sk) {
  const b = { x: sk.belly.x + sk.n.x * 0.75 * K, y: sk.belly.y + sk.n.y * 0.75 * K };
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(b.x, b.y, D.belly * 0.95, D.belly * 0.62, -sk.a + Math.PI / 2, 0, TAU);
  ctx.fillStyle = 'rgba(78, 78, 72, 0.5)';
  ctx.fill();
  ctx.clip();
  ctx.lineWidth = 0.07 * K;
  ctx.strokeStyle = 'rgba(20, 20, 18, 0.55)';
  ctx.beginPath();
  for (let i = -4; i <= 4; i++) {
    const t = i * 0.22 * K;
    const c = { x: b.x + sk.u.x * t, y: b.y + sk.u.y * t };
    const p0 = { x: c.x - sk.n.x * D.belly, y: c.y - sk.n.y * D.belly }, p1 = { x: c.x + sk.n.x * D.belly, y: c.y + sk.n.y * D.belly };
    ctx.moveTo(p0.x, p0.y);
    ctx.quadraticCurveTo(c.x - sk.u.x * 0.18 * K, c.y - sk.u.y * 0.18 * K, p1.x, p1.y);
  }
  ctx.stroke();
  ctx.restore();
}

/** The inside of his mouth, behind the jaws: only shows when it is open. */
function drawMouth(ctx, sk, gz) {
  if (sk.jawA < 0.04) return;
  ctx.beginPath();
  poly(ctx, [sk.hd(0.15, -0.28), sk.hd(2.4, -0.1), ...headPts(sk, [[2.3, -0.3], [0.2, -0.3]], true)]);
  ctx.fillStyle = C.mouth;
  ctx.fill();
  // the tongue, low in it
  const t0 = headPts(sk, [[0.5, -0.32], [1.6, -0.3]], true);
  ctx.beginPath();
  ctx.moveTo(t0[0].x, t0[0].y);
  ctx.lineTo(t0[1].x, t0[1].y);
  ctx.lineWidth = 0.18 * K;
  ctx.lineCap = 'round';
  ctx.strokeStyle = C.tongue;
  ctx.stroke();
  // and from deep in it, while the breath is coming, light
  if (gz.glow > 0.3) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const m = sk.mouth;
    const gr = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 1.1 * K);
    gr.addColorStop(0, `rgba(210, 240, 255, ${0.7 * (gz.glow - 0.3)})`);
    gr.addColorStop(1, 'rgba(150, 200, 255, 0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 1.1 * K, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/** All of him, in his own frame. */
export function drawGodzilla(ctx, sk, gz) {
  const glow = gz.glow || 0;
  const spine = spineOf(sk);
  const mid = platesOf(spine, 'mid'), side = platesOf(spine, 'side');
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // behind him: the far row of plates, then the middle row, then the far leg and arm
  drawPlates(ctx, side.map((p) => ({ ...p, x: p.x - p.nx * 0.05 - 0.25 * K, y: p.y + 0.06 * K })), C.plateFar, glow);
  drawPlates(ctx, mid, C.plate, glow);
  solid(ctx, () => leg(ctx, sk.legs.B), C.far);
  ctx.save();
  ctx.beginPath();
  leg(ctx, sk.legs.B);
  ctx.clip();
  drawMarks(ctx, sk, gz.marks, (p) => p === 'thighB' || p === 'shinB');
  ctx.restore();
  legDetails(ctx, sk.legs.B, C.far);
  solid(ctx, () => arm(ctx, sk.arms.B), C.far);
  fingers(ctx, sk.arms.B, C.far, gz.openB || 0);
  // the body
  drawMouth(ctx, sk, gz);
  solid(ctx, () => mainBody(ctx, sk), C.skin);
  ctx.save();
  ctx.beginPath();
  mainBody(ctx, sk);
  ctx.clip();
  // light from above and in front; the back and the underside of the tail in shadow
  const lg = ctx.createLinearGradient(sk.belly.x + sk.n.x * 3 * K, sk.belly.y + 2 * K, sk.belly.x - sk.n.x * 3 * K, sk.belly.y - 3 * K);
  lg.addColorStop(0, 'rgba(125, 125, 118, 0.17)');
  lg.addColorStop(1, 'rgba(0, 0, 0, 0.32)');
  ctx.fillStyle = lg;
  ctx.fillRect(sk.hip.x - 20 * K, -2, 40 * K, 20 * K);
  drawBelly(ctx, sk);
  drawMarks(ctx, sk, gz.marks, (p) => p === 'torso' || p === 'neck' || p === 'tail');
  ctx.restore();
  drawHeadDetails(ctx, sk, gz);
  // the near row of plates, over his back
  drawPlates(ctx, side, mixHex(C.plate, '#ffffff', 0.08), glow);
  // the near leg and arm, in front of all of it
  solid(ctx, () => leg(ctx, sk.legs.A), C.skin);
  ctx.save();
  ctx.beginPath();
  leg(ctx, sk.legs.A);
  ctx.clip();
  drawMarks(ctx, sk, gz.marks, (p) => p === 'thighA' || p === 'shinA');
  ctx.restore();
  legDetails(ctx, sk.legs.A, C.skin);
  solid(ctx, () => arm(ctx, sk.arms.A), C.skin);
  ctx.save();
  ctx.beginPath();
  arm(ctx, sk.arms.A);
  ctx.clip();
  drawMarks(ctx, sk, gz.marks, (p) => p === 'armA' || p === 'foreA');
  ctx.restore();
  fingers(ctx, sk.arms.A, C.skin, gz.openA || 0);
  drawGlow(ctx, mid, glow);
}

export const godzillaSkin = {
  full(ctx, j, o) {
    const man = o.man, gz = man && man.gz;
    if (!gz || !gz.body || !gz.body.sk) return;
    const g = gz.body, t = man.sandbox ? man.sandbox.time : 0;
    const sh = gz.shake || 0;
    ctx.save();
    ctx.translate(man.pos.x + (sh ? (Math.sin(t * 61) + Math.sin(t * 37)) * 0.05 * sh : 0), man.pos.y);
    ctx.scale(g.sx, 1);
    drawGodzilla(ctx, g.sk, gz);
    ctx.restore();
  },
};

/* ---------------------------------- pictures --------------------------------- */

/** A Godzilla standing still, for a picture (nothing to do with any in the world). */
function standIn(o = {}) {
  const man = { pos: { x: 0, y: 0 }, facing: 1, sandbox: { time: 2 }, wj: makeJoints(), box: {} };
  man.gz = { body: newBody(man), glow: o.glow || 0, marks: makeMarks(54), openA: 0, openB: 0 };
  const g = man.gz.body;
  Object.assign(g, o.pose || {});
  for (let i = 0; i < 3; i++) stepBody(man, 1 / 60);
  stepBody(man, 0);
  return man;
}

let ghostOf = null;

/**
 * Where he will be, before he is: all of him, standing on the spot, facing
 * the way he will (the renderer fades it - so he is drawn once, whole, into
 * a picture of his own, and the picture faded, not each part over the next).
 */
export function drawGodzillaGhost(ctx, at) {
  if (!ghostOf) {
    const man = standIn(), box = {};
    boundsOf(man.gz.body, box);
    const P = 32, pad = 0.4;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((box.maxX - box.minX + pad * 2) * P);
    cv.height = Math.ceil((box.maxY - box.minY + pad * 2) * P);
    const c = cv.getContext('2d');
    c.setTransform(P, 0, 0, -P, (pad - box.minX) * P, (box.maxY + pad) * P);
    drawGodzilla(c, man.gz.body.sk, man.gz);
    ghostOf = { cv, x0: box.minX - pad, y1: box.maxY + pad, w: cv.width / P, h: cv.height / P };
  }
  ctx.save();
  ctx.scale(facingAt(at ? at.x : 0), -1);
  ctx.drawImage(ghostOf.cv, ghostOf.x0, -ghostOf.y1, ghostOf.w, ghostOf.h);
  ctx.restore();
}

/** Which way he faces, put down at x: along the street, toward the middle of it. */
export const facingAt = (x) => (x > 6 ? -1 : 1);

/**
 * A still from the film: what is on the canvas, in black and white - the
 * contrast up, grain all over, and darker toward the edges.
 */
function filmStill(ctx, w, h, seed = 1954) {
  let img;
  try { img = ctx.getImageData(0, 0, w, h); } catch (_) { return; }
  const d = img.data, r = rng(seed);
  const cx = w / 2, cy = h / 2, R = Math.hypot(cx, cy);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
      l = (l - 118) * 1.2 + 118 + (r() - 0.5) * 26;
      const v = Math.hypot(x - cx, y - cy) / R;
      l *= 1 - v * v * 0.55;
      d[i] = d[i + 1] = d[i + 2] = clamp(l, 0, 255);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** A sky over rooftops, behind a picture of him: at night, the windows lit - or a pale, hazy day. */
function nightCity(ctx, w, h, seed, lit = true) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, lit ? '#1a1d22' : '#9a9da2');
  sky.addColorStop(1, lit ? '#5a5f66' : '#d2d4d6');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const r = rng(seed);
  for (let x = 0; x < w;) {
    const bw = w * (0.06 + r() * 0.08), bh = h * (0.18 + r() * 0.35);
    ctx.fillStyle = lit ? '#121418' : '#7d8086';
    ctx.fillRect(x, h - bh, bw, bh);
    if (lit) {
      ctx.fillStyle = 'rgba(255, 220, 160, 0.5)';
      const s = Math.max(1, w / 64);
      for (let yy = h - bh + 2 * s; yy < h - 2 * s; yy += 3 * s) for (let xx = x + s; xx < x + bw - 1.5 * s; xx += 2.5 * s) if (r() < 0.32) ctx.fillRect(xx, yy, s, 1.5 * s);
    }
    x += bw + Math.max(1, w / 128);
  }
}

/** His card in the spawn menu: head and shoulders, plates up - a still from the film. */
export function drawGodzillaIcon(ctx, w, h, card) {
  const man = standIn({ pose: { jaw: 0.35, goal: { jaw: 0.35 } } });
  const sk = man.gz.body.sk;
  if (card) nightCity(ctx, w, h, 54, false);
  // around his head and the top of his back
  const cx = sk.chest.x + 0.6 * K, cy = sk.chest.y + 1.1 * K, span = (card ? 6.6 : 8) * K;
  const s = Math.min(w, h) / span;
  ctx.setTransform(s, 0, 0, -s, w / 2 - cx * s, h / 2 + cy * s);
  drawGodzilla(ctx, sk, man.gz);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (card) filmStill(ctx, w, h);
}

/** The mod's picture: him over a city at night, the plates lit - a still from the film. */
export function drawModIcon(ctx, w, h) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  nightCity(ctx, w, h, 1954);
  const man = standIn({ glow: 0.75, pose: { jaw: 0.5, goal: { jaw: 0.5 }, rear: 0.4 } });
  const sk = man.gz.body.sk;
  const s = h / (11.5 * K);
  ctx.setTransform(s, 0, 0, -s, w * 0.42, h * 1.32);
  drawGodzilla(ctx, sk, man.gz);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  filmStill(ctx, w, h, 1955);
}
