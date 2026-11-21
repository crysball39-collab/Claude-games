'use strict';
/* =============================================================================
   The Abandoned City floor. The world is an endless grid of city blocks: each
   512 x 512 chunk is one block with half a road along each edge, so chunks
   tile into streets and crossroads. Chunks are painted once from a seed and
   cached, and only decoration is drawn - nothing on the ground blocks you.
   ========================================================================== */

const CHUNK = 512, ROAD = 64;
const chunkCache = new Map();
let CHUNK_RES = 1.5;

function setChunkRes(r) {
  if (Math.abs(r - CHUNK_RES) > 0.01) { CHUNK_RES = r; chunkCache.clear(); }
}

function getChunk(cx, cy) {
  const key = cx + ',' + cy;
  let c = chunkCache.get(key);
  if (c) { chunkCache.delete(key); chunkCache.set(key, c); return c; }
  c = mkCanvas(CHUNK * CHUNK_RES, CHUNK * CHUNK_RES);
  const g = c.getContext('2d');
  g.scale(CHUNK_RES, CHUNK_RES);
  paintChunk(g, cx, cy);
  chunkCache.set(key, c);
  if (chunkCache.size > 18) chunkCache.delete(chunkCache.keys().next().value);
  return c;
}

function speckle(g, rnd, x, y, w, h, n, colors, size = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(rnd() * colors.length) | 0];
    const s = size * (0.5 + rnd());
    g.fillRect(x + rnd() * w, y + rnd() * h, s, s);
  }
}
function crack(g, rnd, x, y, len, color = 'rgba(15,16,20,0.55)', w = 1.4) {
  g.beginPath(); g.moveTo(x, y);
  let a = rnd() * TAU;
  for (let i = 0; i < 5; i++) {
    a += (rnd() - 0.5) * 1.4;
    x += Math.cos(a) * len / 5; y += Math.sin(a) * len / 5;
    g.lineTo(x, y);
    if (rnd() < 0.3) { g.moveTo(x, y); g.lineTo(x + Math.cos(a + 1.2) * len / 6, y + Math.sin(a + 1.2) * len / 6); g.moveTo(x, y); }
  }
  g.lineWidth = w; g.strokeStyle = color; g.lineCap = 'round'; g.stroke();
}
function carTopDown(g, x, y, ang, color, rnd) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.fillStyle = 'rgba(0,0,0,0.3)'; rrPath(g, -15, -29, 34, 62, 9); g.fill();
  rr(g, -16, -31, 32, 62, 9, color, 2);
  rr(g, -12, -18, 24, 14, 4, '#2a3140', 1.6);   // windscreen
  rr(g, -12, 12, 24, 10, 3, '#2a3140', 1.6);    // rear window
  rr(g, -11, -3, 22, 14, 3, 'rgba(255,255,255,0.12)', 0);
  // rust and dents
  for (let i = 0; i < 4; i++) ell(g, (rnd() - 0.5) * 22, (rnd() - 0.5) * 50, 2 + rnd() * 4, 1.5 + rnd() * 3, 'rgba(120,60,30,0.55)', 0);
  if (rnd() < 0.6) { poly(g, [-12, -18, 2, -18, -4, -10], 'rgba(220,230,255,0.25)', 0); }
  g.restore();
}
function rubble(g, rnd, x, y, n, spread) {
  for (let i = 0; i < n; i++) {
    const px = x + (rnd() - 0.5) * spread, py = y + (rnd() - 0.5) * spread * 0.7, s = 3 + rnd() * 7;
    const c = ['#8a847c', '#6f6a63', '#9a5b45', '#5f5a54', '#a39d93'][(rnd() * 5) | 0];
    poly(g, [px - s, py, px - s * 0.4, py - s * 0.8, px + s * 0.6, py - s * 0.6, px + s, py + s * 0.2, px + s * 0.2, py + s * 0.7], c, 1.2);
  }
}
function deadTree(g, rnd, x, y) {
  ell(g, x + 6, y + 6, 26, 20, 'rgba(0,0,0,0.25)', 0);
  for (let i = 0; i < 7; i++) {
    const a = rnd() * TAU, l = 14 + rnd() * 16;
    seg(g, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, '#3b2c22', 3);
    seg(g, x + Math.cos(a) * l * 0.6, y + Math.sin(a) * l * 0.6, x + Math.cos(a + 0.6) * l, y + Math.sin(a + 0.6) * l, '#3b2c22', 1.6);
  }
  for (let i = 0; i < 5; i++) ell(g, x + (rnd() - 0.5) * 34, y + (rnd() - 0.5) * 30, 6 + rnd() * 6, 5 + rnd() * 5, ['#4d5a2c', '#5d6b34', '#3f4a24'][(rnd() * 3) | 0], 0);
  circ(g, x, y, 4.5, '#2e2219', 1.4);
}

function paintChunk(g, cx, cy) {
  const rnd = mulberry32(hash2(cx, cy) ^ 0x51ed);
  const S = CHUNK, R = ROAD;

  // asphalt everywhere first
  g.fillStyle = '#3b3e47'; g.fillRect(0, 0, S, S);
  speckle(g, rnd, 0, 0, S, S, 900, ['#34373f', '#43464f', '#2f3239', '#4a4d55'], 2.2);
  for (let i = 0; i < 4; i++) ell(g, rnd() * S, rnd() * S, 40 + rnd() * 60, 30 + rnd() * 40, 'rgba(255,255,255,0.025)', 0, rnd() * 3);

  // lane markings on the shared edges (the centre line of each street)
  g.fillStyle = 'rgba(232,190,70,0.75)';
  for (let x = R + 8; x < S - R - 8; x += 32) { g.fillRect(x, -2, 18, 4); g.fillRect(x, S - 2, 18, 4); }
  for (let y = R + 8; y < S - R - 8; y += 32) { g.fillRect(-2, y, 4, 18); g.fillRect(S - 2, y, 4, 18); }
  // crossings next to every crossroads
  g.fillStyle = 'rgba(225,228,232,0.55)';
  const zebraH = (x0, y0) => { for (let i = 0; i < 5; i++) if (rnd() > 0.15) g.fillRect(x0, y0 + 4 + i * 11, 22, 6); };
  const zebraV = (x0, y0) => { for (let i = 0; i < 5; i++) if (rnd() > 0.15) g.fillRect(x0 + 4 + i * 11, y0, 6, 22); };
  zebraH(R + 6, 0); zebraH(S - R - 28, 0); zebraH(R + 6, S - R); zebraH(S - R - 28, S - R);
  zebraV(0, R + 6); zebraV(0, S - R - 28); zebraV(S - R, R + 6); zebraV(S - R, S - R - 28);
  // road wear
  for (let i = 0; i < 7; i++) {
    const side = (rnd() * 4) | 0, t = R + rnd() * (S - 2 * R), o = 8 + rnd() * (R - 16);
    const [x, y] = side === 0 ? [t, o] : side === 1 ? [t, S - o] : side === 2 ? [o, t] : [S - o, t];
    crack(g, rnd, x, y, 30 + rnd() * 40);
  }
  for (let i = 0; i < 2; i++) {
    const side = (rnd() * 4) | 0, t = R + 20 + rnd() * (S - 2 * R - 40), o = 14 + rnd() * (R - 28);
    const [x, y] = side === 0 ? [t, o] : side === 1 ? [t, S - o] : side === 2 ? [o, t] : [S - o, t];
    ell(g, x, y, 9 + rnd() * 8, 6 + rnd() * 5, '#26282e', 0, rnd() * 3);
    ell(g, x - 1, y - 1, 7 + rnd() * 6, 4 + rnd() * 4, '#2e3036', 0, rnd() * 3);
  }
  if (rnd() < 0.7) {
    const [x, y] = [R + 30 + rnd() * (S - 2 * R - 60), rnd() < 0.5 ? 30 : S - 30];
    circ(g, x, y, 11, '#4b4e56', 1.6); circ(g, x, y, 7.5, null, 1);
    for (let k = -1; k <= 1; k++) seg(g, x - 6, y + k * 3.5, x + 6, y + k * 3.5, 'rgba(0,0,0,0.35)', 1);
  }
  // an abandoned car parked along one of the streets
  if (rnd() < 0.55) {
    const colors = ['#7a3b32', '#3c5a78', '#6f6a3a', '#5b5f66', '#7d5a2c'];
    const side = (rnd() * 4) | 0, t = R + 60 + rnd() * (S - 2 * R - 120);
    const ang = (side < 2 ? Math.PI / 2 : 0) + (rnd() - 0.5) * 0.5;
    const [x, y] = side === 0 ? [t, 34] : side === 1 ? [t, S - 34] : side === 2 ? [34, t] : [S - 34, t];
    carTopDown(g, x, y, ang, colors[(rnd() * colors.length) | 0], rnd);
  }

  // sidewalk ring
  const bx = R, by = R, bw = S - 2 * R;
  rr(g, bx - 3, by - 3, bw + 6, bw + 6, 10, '#585c64', 0);
  rr(g, bx, by, bw, bw, 8, '#7b8088', 0);
  g.strokeStyle = 'rgba(40,42,48,0.35)'; g.lineWidth = 1;
  for (let x = bx + 24; x < bx + bw; x += 24) { g.beginPath(); g.moveTo(x, by); g.lineTo(x, by + 22); g.moveTo(x, by + bw - 22); g.lineTo(x, by + bw); g.stroke(); }
  for (let y = by + 24; y < by + bw; y += 24) { g.beginPath(); g.moveTo(bx, y); g.lineTo(bx + 22, y); g.moveTo(bx + bw - 22, y); g.lineTo(bx + bw, y); g.stroke(); }
  speckle(g, rnd, bx, by, bw, bw, 260, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.06)'], 2);

  // the lot inside the block
  const lx = bx + 22, ly = by + 22, lw = bw - 44;
  const kind = ['ruin', 'ruin', 'park', 'lot', 'plaza'][(rnd() * 5) | 0];
  if (kind === 'ruin') {
    rr(g, lx, ly, lw, lw, 4, '#655f58', 0);
    speckle(g, rnd, lx, ly, lw, lw, 500, ['#5a554f', '#706a62', '#4f4b46'], 3);
    // the footprint of a fallen building: wall stubs with gaps
    g.lineCap = 'square';
    const wall = (x1, y1, x2, y2) => { seg(g, x1, y1, x2, y2, '#3e3a36', 9); seg(g, x1, y1, x2, y2, '#8b847a', 5); };
    const m = 26, a = lx + m, b = lx + lw - m;
    const gapA = a + 40 + rnd() * (b - a - 120), gapB = gapA + 40 + rnd() * 30;
    wall(a, a, gapA, a); wall(gapB, a, b, a);
    wall(b, a, b, a + (b - a) * (0.3 + rnd() * 0.3));
    wall(a, a, a, b); wall(a, b, a + (b - a) * (0.4 + rnd() * 0.4), b);
    const ix = a + (b - a) * (0.35 + rnd() * 0.3);
    wall(ix, a, ix, a + (b - a) * (0.3 + rnd() * 0.3));
    g.lineCap = 'round';
    for (let i = 0; i < 5; i++) rubble(g, rnd, a + rnd() * (b - a), a + rnd() * (b - a), 10 + (rnd() * 10 | 0), 50);
    for (let i = 0; i < 6; i++) crack(g, rnd, lx + rnd() * lw, ly + rnd() * lw, 40 + rnd() * 40, 'rgba(20,18,16,0.5)', 1.6);
    for (let i = 0; i < 3; i++) ell(g, lx + rnd() * lw, ly + rnd() * lw, 8 + rnd() * 10, 6 + rnd() * 8, 'rgba(95,120,60,0.55)', 0);
  } else if (kind === 'park') {
    rr(g, lx, ly, lw, lw, 6, '#56633a', 0);
    speckle(g, rnd, lx, ly, lw, lw, 700, ['#4d5934', '#65743f', '#5c5a33', '#6f6a3c'], 3);
    // a dirt path across the park
    g.lineWidth = 22; g.strokeStyle = '#7a6a50'; g.lineCap = 'round';
    g.beginPath(); g.moveTo(lx, ly + lw * (0.3 + rnd() * 0.4)); g.quadraticCurveTo(lx + lw / 2, ly + rnd() * lw, lx + lw, ly + lw * (0.3 + rnd() * 0.4)); g.stroke();
    g.lineWidth = 14; g.strokeStyle = '#86765a'; g.stroke();
    for (let i = 0; i < 4; i++) deadTree(g, rnd, lx + 40 + rnd() * (lw - 80), ly + 40 + rnd() * (lw - 80));
    // a broken bench
    const bx2 = lx + 30 + rnd() * (lw - 90), by2 = ly + 30 + rnd() * (lw - 60);
    rr(g, bx2, by2, 46, 12, 2, '#6b4a30', 1.6);
    for (let k = 1; k < 4; k++) seg(g, bx2 + 2, by2 + k * 3, bx2 + 44, by2 + k * 3, 'rgba(0,0,0,0.3)', 0.8);
  } else if (kind === 'lot') {
    rr(g, lx, ly, lw, lw, 4, '#42454e', 0);
    speckle(g, rnd, lx, ly, lw, lw, 500, ['#3a3d45', '#4b4e57', '#363940'], 2.4);
    g.fillStyle = 'rgba(230,230,235,0.5)';
    for (let r = 0; r < 2; r++) for (let i = 0; i <= 8; i++) {
      const x = lx + 30 + i * ((lw - 60) / 8), y = ly + 40 + r * (lw - 120);
      g.fillRect(x - 1.5, y, 3, 40);
    }
    const colors = ['#7a3b32', '#3c5a78', '#6f6a3a', '#5b5f66', '#2f4f3f', '#8a7a6a'];
    for (let r = 0; r < 2; r++) for (let i = 0; i < 8; i++) {
      if (rnd() < 0.55) continue;
      const x = lx + 30 + (i + 0.5) * ((lw - 60) / 8), y = ly + 60 + r * (lw - 120);
      g.save(); g.translate(x, y); g.scale(0.72, 0.72); carTopDown(g, 0, 0, (rnd() - 0.5) * 0.4, colors[(rnd() * colors.length) | 0], rnd); g.restore();
    }
    for (let i = 0; i < 5; i++) ell(g, lx + rnd() * lw, ly + rnd() * lw, 10 + rnd() * 14, 6 + rnd() * 9, 'rgba(15,15,22,0.45)', 0, rnd() * 3);
    for (let i = 0; i < 4; i++) crack(g, rnd, lx + rnd() * lw, ly + rnd() * lw, 50 + rnd() * 40);
  } else {
    rr(g, lx, ly, lw, lw, 4, '#857b6e', 0);
    const t = 28;
    for (let y = 0; y < lw; y += t) for (let x = 0; x < lw; x += t) {
      g.fillStyle = ((x + y) / t) % 2 ? '#7d7366' : '#8f8578';
      if (rnd() < 0.08) g.fillStyle = '#5f574d';
      g.fillRect(lx + x, ly + y, Math.min(t, lw - x), Math.min(t, lw - y));
    }
    const fx = lx + lw / 2 + (rnd() - 0.5) * 40, fy = ly + lw / 2 + (rnd() - 0.5) * 40;
    circ(g, fx, fy, 62, '#a39a8c', 2.4);
    circ(g, fx, fy, 52, '#2e3e4a', 2);
    ell(g, fx - 14, fy - 14, 22, 12, 'rgba(120,160,190,0.18)', 0, -0.5);
    circ(g, fx, fy, 14, '#a39a8c', 2);
    rubble(g, rnd, fx + 26, fy + 10, 8, 30);
    for (let i = 0; i < 6; i++) crack(g, rnd, lx + rnd() * lw, ly + rnd() * lw, 40 + rnd() * 30, 'rgba(40,34,28,0.5)');
  }

  // litter, stains and weeds anywhere
  for (let i = 0; i < 10; i++) {
    const x = rnd() * S, y = rnd() * S, r = rnd();
    if (r < 0.35) { g.save(); g.translate(x, y); g.rotate(rnd() * 3); g.fillStyle = 'rgba(225,220,205,0.55)'; g.fillRect(-5, -3.5, 10, 7); g.restore(); }
    else if (r < 0.55) { ell(g, x, y, 10 + rnd() * 12, 6 + rnd() * 8, 'rgba(80,25,25,0.35)', 0, rnd() * 3); }
    else if (r < 0.8) { for (let k = 0; k < 5; k++) seg(g, x, y, x + (rnd() - 0.5) * 12, y - 4 - rnd() * 8, '#5d7a34', 1.6); }
    else { rr(g, x - 3, y - 5, 6, 10, 2, '#8a9298', 1.2); }
  }
}

/* Draw every chunk that touches the view rectangle (world units). */
function drawGround(ctx, left, top, right, bottom) {
  const c0 = Math.floor(left / CHUNK), c1 = Math.floor(right / CHUNK);
  const r0 = Math.floor(top / CHUNK), r1 = Math.floor(bottom / CHUNK);
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
    ctx.drawImage(getChunk(cx, cy), cx * CHUNK, cy * CHUNK, CHUNK + 0.5, CHUNK + 0.5);
  }
}
