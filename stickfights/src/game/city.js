/* =============================================================================
   The city: a street of buildings, with trees and bushes along it and lamps
   over it, and a skyline far off behind.

   A building is a slab (structures.js) like a wall, only much bigger, its
   cells twelve centimetres across: concrete or brick, with glass in its
   windows and wood in its doors, cell by cell. It stands behind the street -
   people walk past it and shoot past it - but it comes apart a few cells at
   a time like anything else: whatever breaks it (a blast, the hand pulling a
   lump off, something the size of a building walking into it) takes out the
   cells it reaches, the glass long before the concrete. Its storeys bear
   what is above them: knock most of one out, or the ground from under a
   stretch of it wider than it can span, and what it was holding up comes
   down - into the street, a lump of building as solid as anything else in
   it, which breaks up where it lands.

   Each building plans itself out from its size and its seed - storeys,
   windows, doors, what stands on the roof - and paints itself from the same
   plan, so the glass is drawn where the glass cells are.
   ========================================================================== */
import { Slab, defineSlab } from './structures.js';
import { clamp } from '../core/util.js';

/** A building's cells (m), and the pixels of picture to each. */
export const CS = 0.12;
const PX = 5;
// what a building is made of besides its walls: glass (1) and wood (2)
const MATS = ['pane', 'wood'];

const common = {
  cell: CS, px: PX, mats: MATS, background: true, load: true, crumbles: true, crumbs: 12, tear: true, noStand: true,
};

/** A seeded little random, for a building to come out the same every time. */
function rng(seed) {
  let s = (seed | 0) % 2147483647 || 1;
  if (s < 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/* ---------------------------------- plans ---------------------------------- */

/**
 * What a building is, cell by cell: how high its body goes (the rest of its
 * grid is what stands on the roof), its storeys, windows and doors, and the
 * things on top. Rows count up from the ground. Kept on the slab.
 */
function planOf(s) {
  if (s.plan) return s.plan;
  const R = rng(s.seed), cols = s.cols, rows = s.rows, style = s.spec.style;
  const P = { style, cols, rows, body: rows, windows: [], doors: [], extras: [], floors: [], R };
  const win = (c0, r0, w, h, o = {}) => {
    const { lit = 0.12, blind = 0.2, ...rest } = o;
    P.windows.push({ c0, r0, c1: c0 + w - 1, r1: r0 + h - 1, lit: R() < lit, blind: R() < blind ? 0.3 + R() * 0.5 : 0, ...rest });
  };
  // storeys: as many as fit between the ground floor and the top, each as tall as that makes it
  const storeys = (from, top, about) => {
    const room = P.body - from - top, n = Math.max(1, Math.round(room / about)), fl = Math.floor(room / n), out = [];
    for (let k = 0; k < n; k++) out.push(from + k * fl);
    return { at: out, fl };
  };
  if (style === 'tower') {
    P.body = rows - 30;
    // the lobby: glass from side to side, the doors in the middle
    const lob = 28;
    for (let c = 2; c < cols - 2;) { const w = Math.min(8, cols - 2 - c); if (w >= 3) win(c, 1, w, lob - 4, { kind: 'lobby', lit: 0.5 }); c += w + 1; }
    const dc = Math.floor(cols / 2) - 3;
    P.doors.push({ c0: dc, r0: 0, c1: dc + 5, r1: 18, glass: true });
    // the storeys above: a band of glass right round, a mullion every so often
    const st = storeys(lob, 3, 25);
    for (const f of st.at) {
      P.floors.push(f);
      for (let c = 2; c < cols - 2;) { const w = Math.min(7, cols - 2 - c); if (w >= 3) win(c, f + Math.round(st.fl * 0.2), w, Math.round(st.fl * 0.6), { kind: 'band', lit: 0.16 }); c += w + 1; }
    }
    // on the roof: the plant room, and an aerial with a light on it
    const bw = Math.round(cols * 0.42), bc = Math.round(cols * 0.3 + R() * cols * 0.2);
    P.extras.push({ c0: bc, r0: P.body, c1: bc + bw - 1, r1: P.body + 11, kind: 'box' });
    const ac = bc + Math.floor(bw / 2);
    P.extras.push({ c0: ac, r0: P.body + 12, c1: ac, r1: rows - 1, kind: 'aerial' });
  } else if (style === 'apartments') {
    P.body = rows - 15;
    const n = Math.max(2, Math.floor((cols - 4) / 13)), gap = (cols - n * 10) / (n + 1);
    // the ground floor: the way in, and a window either side
    const dc = Math.floor(cols / 2) - 4;
    P.doors.push({ c0: dc, r0: 0, c1: dc + 8, r1: 19 });
    for (const c of [Math.round(gap * 0.6), cols - Math.round(gap * 0.6) - 10]) if (c + 10 <= dc || c >= dc + 9) win(c, 7, 10, 12, { kind: 'sash' });
    const st = storeys(26, 2, 24);
    for (const f of st.at) {
      P.floors.push(f);
      for (let k = 0; k < n; k++) win(Math.round(gap + k * (10 + gap)), f + Math.round(st.fl * 0.29), 10, Math.round(st.fl * 0.5), { kind: 'sash', balcony: R() < 0.3, lit: 0.1, blind: 0.35 });
    }
    // a water tank on legs, at one end of the roof
    const tw = 10, tc = R() < 0.5 ? 3 : cols - 3 - tw;
    P.extras.push({ c0: tc + 1, r0: P.body, c1: tc + 1, r1: P.body + 5, kind: 'leg' });
    P.extras.push({ c0: tc + tw - 2, r0: P.body, c1: tc + tw - 2, r1: P.body + 5, kind: 'leg' });
    P.extras.push({ c0: tc, r0: P.body + 6, c1: tc + tw - 1, r1: rows - 1, kind: 'tank', wood: true });
  } else if (style === 'brick') {
    const chim = R() < 0.7;
    P.body = chim ? rows - 9 : rows;
    const n = Math.max(2, Math.floor((cols - 4) / 12)), gap = (cols - n * 8) / (n + 1);
    // a shop on the ground floor, and its door
    const sw = Math.min(cols - 16, 22), sc = 3;
    win(sc, 4, sw, 17, { kind: 'shop', lit: 0.4, blind: 0 });
    P.doors.push({ c0: sc + sw + 3, r0: 0, c1: sc + sw + 10, r1: 20 });
    const st = storeys(28, 5, 26);
    for (const f of st.at) {
      P.floors.push(f);
      for (let k = 0; k < n; k++) win(Math.round(gap + k * (8 + gap)), f + Math.round(st.fl * 0.22), 8, Math.round(st.fl * 0.6), { kind: 'arch', lit: 0.1, blind: 0.3 });
    }
    P.cornice = P.body - 5;
    if (chim) { const cc = R() < 0.5 ? 4 : cols - 9; P.extras.push({ c0: cc, r0: P.body, c1: cc + 4, r1: rows - 1, kind: 'chimney' }); }
  } else if (style === 'shop') {
    P.body = rows;
    const two = rows >= 44;
    // the shop window, and the door beside it
    const dw = 7, right = R() < 0.5, dc = right ? cols - dw - 3 : 3;
    const gc0 = right ? 3 : dc + dw + 2, gc1 = right ? dc - 3 : cols - 4;
    for (let c = gc0; c <= gc1;) { const w = Math.min(Math.ceil((gc1 - gc0 + 1) / 2) - 1, gc1 - c + 1); if (w >= 3) win(c, 3, w, 16, { kind: 'shop', lit: 0.6, blind: 0 }); c += w + 1; }
    P.doors.push({ c0: dc, r0: 0, c1: dc + dw - 1, r1: 18, glass: true });
    P.awning = 20;
    P.sign = 24;
    if (two) {
      P.floors.push(31);
      const n = Math.max(2, Math.floor((cols - 4) / 12)), gap = (cols - n * 9) / (n + 1);
      for (let k = 0; k < n; k++) win(Math.round(gap + k * (9 + gap)), 35, 9, Math.min(9, rows - 38), { kind: 'sash', blind: 0.4 });
    }
    P.tint = ['#a8473b', '#2f6f73', '#6a5b8c', '#b07a2a'][Math.floor(R() * 4)];
  } else if (style === 'lamp') {
    // a post, an arm at the top, and the lamp hanging off the end of it
    P.body = 0;
    const side = R() < 0.5 ? 1 : -1, pc = side > 0 ? 0 : cols - 1;
    P.extras.push({ c0: pc, r0: 0, c1: pc, r1: rows - 1, kind: 'post' });
    const a0 = Math.min(pc, pc + side * (cols - 1)), a1 = Math.max(pc, pc + side * (cols - 1));
    P.extras.push({ c0: a0, r0: rows - 2, c1: a1, r1: rows - 1, kind: 'arm' });
    const lc = pc + side * (cols - 1);
    P.windows.push({ c0: lc, r0: rows - 4, c1: lc, r1: rows - 3, kind: 'lamp', lit: true, blind: 0 });
  }
  s.plan = P;
  return P;
}

/** Which cell is which - and which are not there at all (the sky round what stands on the roof). */
function layout(s) {
  const P = planOf(s), cols = s.cols, m = new Uint8Array(cols * s.rows);
  const fill = (q, v) => { for (let r = q.r0; r <= q.r1; r++) for (let c = q.c0; c <= q.c1; c++) if (c >= 0 && r >= 0 && c < cols && r < s.rows) m[r * cols + c] = v; };
  for (const w of P.windows) {
    fill(w, 1);
    // an arched window: the corners of its top are wall
    if (w.kind === 'arch') for (const [dc, dr] of [[0, 0], [0, 1], [1, 0], [w.c1 - w.c0, 0], [w.c1 - w.c0, 1], [w.c1 - w.c0 - 1, 0]]) m[(w.r1 - dr) * cols + w.c0 + dc] = 0;
  }
  for (const d of P.doors) fill(d, d.glass ? 1 : 2);
  // above the body only what stands on the roof is there
  const keep = new Uint8Array(cols * s.rows);
  for (const e of P.extras) for (let r = e.r0; r <= e.r1; r++) for (let c = e.c0; c <= e.c1; c++) if (c >= 0 && c < cols && r < s.rows) keep[r * cols + c] = 1;
  for (const w of P.windows) if (w.kind === 'lamp') for (let r = w.r0; r <= w.r1; r++) keep[r * cols + w.c0] = 1;
  for (let r = P.body; r < s.rows; r++) for (let c = 0; c < cols; c++) { const i = r * cols + c; if (!keep[i]) s.hp[i] = 0; }
  for (const e of P.extras) if (e.wood) fill(e, 2);
  return m;
}

/* --------------------------------- painting --------------------------------- */

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => clamp(Math.round(v * k), 0, 255);
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
};

/** The building's picture whole, from its plan: walls, storeys, glass, doors, and what stands on top. */
function paint(s) {
  const P = planOf(s), cols = s.cols, rows = s.rows, W = cols * PX, H = rows * PX;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const R = rng(s.seed * 7 + 3);
  const y = (r) => (rows - 1 - r) * PX;   // the top of row r, in the picture
  const rect = (c0, r0, c1, r1) => [c0 * PX, y(r1), (c1 - c0 + 1) * PX, (r1 - r0 + 1) * PX];
  const base = s.spec.color;
  // the walls, every cell a shade of its own
  if (P.body > 0) {
    for (let r = 0; r < P.body; r++) {
      for (let c = 0; c < cols; c++) {
        g.fillStyle = shade(base, 0.95 + R() * 0.09);
        g.fillRect(c * PX, y(r), PX, PX);
      }
    }
  }
  if (P.style === 'brick') {
    // courses of brick, and the mortar between
    g.fillStyle = 'rgba(232, 214, 196, 0.35)';
    for (let yy = H - P.body * PX; yy < H; yy += 3) g.fillRect(0, yy, W, 1);
    for (let yy = H - P.body * PX, k = 0; yy < H; yy += 3, k++) for (let xx = (k % 2) * 5; xx < W; xx += 10) g.fillRect(xx, yy, 1, 3);
  } else if (P.style === 'tower' || P.style === 'apartments') {
    // panel joints
    g.fillStyle = 'rgba(0, 0, 0, 0.08)';
    for (let c = 0; c < cols; c += 10) g.fillRect(c * PX, y(P.body - 1), 1, P.body * PX);
  }
  // the storeys: a slab edge at each floor
  for (const f of P.floors) {
    g.fillStyle = 'rgba(0, 0, 0, 0.22)';
    g.fillRect(0, y(f), W, 2);
    g.fillStyle = 'rgba(255, 255, 255, 0.12)';
    g.fillRect(0, y(f) + 2, W, 1);
  }
  // a stone cornice along the top of an old one
  if (P.cornice !== undefined) {
    g.fillStyle = '#c9bfae';
    g.fillRect(0, y(P.body - 1), W, 5 * PX);
    g.fillStyle = 'rgba(0, 0, 0, 0.25)';
    g.fillRect(0, y(P.cornice), W, 2);
    for (let c = 1; c < cols; c += 3) g.fillRect(c * PX, y(P.body - 2), 2, PX);
  }
  // the parapet: the top edge, darker
  if (P.body > 0 && P.cornice === undefined) {
    g.fillStyle = 'rgba(0, 0, 0, 0.2)';
    g.fillRect(0, y(P.body - 1), W, 2 * PX);
  }
  // the glass
  for (const w of P.windows) drawWindow(g, w, rect(w.c0, w.r0, w.c1, w.r1), R);
  // doors
  for (const d of P.doors) {
    const [x0, y0, w, h] = rect(d.c0, d.r0, d.c1, d.r1);
    if (d.glass) {
      g.fillStyle = '#4c5d68'; g.fillRect(x0, y0, w, h);
      g.fillStyle = 'rgba(190, 215, 228, 0.35)'; g.fillRect(x0 + 2, y0 + 2, w / 2 - 3, h - 4);
      g.fillStyle = '#2b3136'; g.fillRect(x0 + w / 2 - 1, y0, 2, h);
      g.fillStyle = '#c9c9c9'; g.fillRect(x0 + w / 2 - 4, y0 + h * 0.5, 2, 6); g.fillRect(x0 + w / 2 + 2, y0 + h * 0.5, 2, 6);
    } else {
      g.fillStyle = '#5e3f26'; g.fillRect(x0, y0, w, h);
      g.strokeStyle = 'rgba(0, 0, 0, 0.35)'; g.lineWidth = 1;
      g.strokeRect(x0 + 3.5, y0 + 3.5, w / 2 - 5, h / 2 - 5); g.strokeRect(x0 + w / 2 + 1.5, y0 + 3.5, w / 2 - 5, h / 2 - 5);
      g.strokeRect(x0 + 3.5, y0 + h / 2 + 1.5, w / 2 - 5, h / 2 - 5); g.strokeRect(x0 + w / 2 + 1.5, y0 + h / 2 + 1.5, w / 2 - 5, h / 2 - 5);
      g.fillStyle = '#d4b15a'; g.fillRect(x0 + w - 7, y0 + h * 0.52, 3, 3);
    }
    g.fillStyle = 'rgba(0, 0, 0, 0.45)'; g.fillRect(x0 - 2, y0 - 3, w + 4, 3);
  }
  // a shop's awning, striped, and the sign above it
  if (P.awning !== undefined) {
    const [x0, y0, w, h] = rect(1, P.awning, cols - 2, P.awning + 3);
    for (let k = 0, xx = x0; xx < x0 + w; xx += 8, k++) { g.fillStyle = k % 2 ? '#efe9dc' : P.tint; g.fillRect(xx, y0, Math.min(8, x0 + w - xx), h); }
    g.fillStyle = 'rgba(0, 0, 0, 0.3)'; g.fillRect(x0, y0 + h - 2, w, 2);
    for (let xx = x0 + 4; xx < x0 + w; xx += 8) { g.beginPath(); g.arc(xx, y0 + h, 4, 0, Math.PI); g.fillStyle = (Math.round((xx - x0 - 4) / 8) % 2) ? '#efe9dc' : P.tint; g.fill(); }
    const [sx, sy, sw, sh] = rect(3, P.sign, cols - 4, P.sign + 4);
    g.fillStyle = '#2a2a2a'; g.fillRect(sx, sy, sw, sh);
    g.fillStyle = '#efe6cf';
    // (lettering, too far off to read)
    for (let xx = sx + 6; xx < sx + sw - 8; xx += 9) g.fillRect(xx, sy + 6, 6, sh - 12);
  }
  // what stands on the roof
  for (const e of P.extras) {
    const [x0, y0, w, h] = rect(e.c0, e.r0, e.c1, e.r1);
    if (e.kind === 'box') {
      g.fillStyle = shade(base, 0.85); g.fillRect(x0, y0, w, h);
      g.fillStyle = 'rgba(0, 0, 0, 0.25)'; g.fillRect(x0, y0, w, 3);
      g.fillStyle = '#5b6066';
      for (let xx = x0 + 4; xx < x0 + w - 6; xx += 7) g.fillRect(xx, y0 + 8, 4, h - 14);
    } else if (e.kind === 'aerial') {
      g.fillStyle = '#4a4e52'; g.fillRect(x0 + 1, y0, w - 2, h);
      g.fillStyle = '#d23a2a'; g.fillRect(x0, y0, w, 4);
    } else if (e.kind === 'leg' || e.kind === 'post') {
      g.fillStyle = e.kind === 'post' ? '#33373a' : '#4a3626'; g.fillRect(x0 + 1, y0, w - 2, h);
    } else if (e.kind === 'tank') {
      g.fillStyle = '#7a5434'; g.fillRect(x0, y0 + 6, w, h - 6);
      g.fillStyle = '#5a3b22';
      for (let yy = y0 + 10; yy < y0 + h; yy += 8) g.fillRect(x0, yy, w, 2);
      g.beginPath(); g.moveTo(x0 - 2, y0 + 7); g.lineTo(x0 + w / 2, y0); g.lineTo(x0 + w + 2, y0 + 7); g.closePath(); g.fill();
    } else if (e.kind === 'chimney') {
      g.fillStyle = shade(base, 0.9); g.fillRect(x0, y0, w, h);
      g.fillStyle = 'rgba(232, 214, 196, 0.35)';
      for (let yy = y0; yy < y0 + h; yy += 3) g.fillRect(x0, yy, w, 1);
      g.fillStyle = '#2d2d2d'; g.fillRect(x0 - 1, y0, w + 2, 4);
    } else if (e.kind === 'arm') {
      g.fillStyle = '#33373a'; g.fillRect(x0, y0 + 2, w, h - 4);
    }
  }
  // an edge to it all
  g.strokeStyle = 'rgba(25, 25, 25, 0.55)';
  g.lineWidth = 2;
  if (P.body > 0) g.strokeRect(1, H - P.body * PX + 1, W - 2, P.body * PX - 2);
  return cv;
}

/** A window (or a lamp's glass), in its rectangle of the picture. */
function drawWindow(g, w, [x0, y0, ww, hh], R) {
  if (w.kind === 'lamp') {
    g.fillStyle = '#f3e2a2'; g.fillRect(x0, y0, ww, hh);
    g.fillStyle = 'rgba(255, 250, 220, 0.8)'; g.fillRect(x0 + 1, y0 + hh - 3, ww - 2, 2);
    return;
  }
  g.save();
  if (w.kind === 'arch') {
    // (round-topped, the way the corners of its cells are)
    g.beginPath(); g.moveTo(x0, y0 + hh); g.lineTo(x0, y0 + ww / 2); g.arc(x0 + ww / 2, y0 + ww / 2, ww / 2, Math.PI, 0); g.lineTo(x0 + ww, y0 + hh); g.closePath(); g.clip();
  }
  const grad = g.createLinearGradient(x0, y0, x0, y0 + hh);
  if (w.lit) { grad.addColorStop(0, '#e7d79d'); grad.addColorStop(1, '#c9b276'); }
  else { grad.addColorStop(0, '#7f93a1'); grad.addColorStop(1, '#4b5b66'); }
  g.fillStyle = grad;
  g.fillRect(x0, y0, ww, hh);
  // the sky in it
  g.fillStyle = 'rgba(255, 255, 255, 0.16)';
  g.beginPath(); g.moveTo(x0, y0 + hh * 0.75); g.lineTo(x0 + ww * 0.55, y0); g.lineTo(x0 + ww * 0.8, y0); g.lineTo(x0, y0 + hh); g.closePath(); g.fill();
  if (w.blind) { g.fillStyle = 'rgba(214, 204, 182, 0.85)'; g.fillRect(x0, y0, ww, hh * w.blind); g.fillStyle = 'rgba(0, 0, 0, 0.12)'; for (let yy = y0 + 2; yy < y0 + hh * w.blind; yy += 3) g.fillRect(x0, yy, ww, 1); }
  // its frame and bars
  g.strokeStyle = w.kind === 'band' || w.kind === 'lobby' ? '#2f363b' : '#e9e4da';
  g.lineWidth = 2;
  g.strokeRect(x0 + 1, y0 + 1, ww - 2, hh - 2);
  if (w.kind === 'sash') { g.beginPath(); g.moveTo(x0, y0 + hh / 2); g.lineTo(x0 + ww, y0 + hh / 2); g.moveTo(x0 + ww / 2, y0); g.lineTo(x0 + ww / 2, y0 + hh); g.stroke(); }
  if (w.kind === 'arch') { g.beginPath(); g.moveTo(x0 + ww / 2, y0 + 6); g.lineTo(x0 + ww / 2, y0 + hh); g.moveTo(x0, y0 + hh * 0.55); g.lineTo(x0 + ww, y0 + hh * 0.55); g.stroke(); }
  if (w.kind === 'shop') { g.fillStyle = 'rgba(40, 32, 24, 0.35)'; for (let k = 0; k < 3; k++) g.fillRect(x0 + 6 + R() * (ww - 18), y0 + hh - 10 - R() * 8, 6 + R() * 6, 10 + R() * 8); }
  g.restore();
  // a sill under it, and a balcony rail across it
  g.fillStyle = 'rgba(0, 0, 0, 0.35)';
  g.fillRect(x0 - 2, y0 + hh, ww + 4, 2);
  if (w.balcony) {
    g.fillStyle = '#2f3134';
    g.fillRect(x0 - 4, y0 + hh * 0.55, ww + 8, 2);
    for (let xx = x0 - 3; xx <= x0 + ww + 3; xx += 4) g.fillRect(xx, y0 + hh * 0.55, 1, hh * 0.45);
  }
}

/* ---------------------------------- types ---------------------------------- */

defineSlab('tower', { ...common, name: 'Office Tower', mat: 'concrete', w: 6, h: 18, style: 'tower', color: '#9ea6ad', span: 3.4, layout, paint });
defineSlab('apartments', { ...common, name: 'Apartment Block', mat: 'concrete', w: 6, h: 12, style: 'apartments', color: '#c4b79f', span: 3, layout, paint });
defineSlab('brick', { ...common, name: 'Brick Building', mat: 'brick', w: 5, h: 11, style: 'brick', color: '#8f4c39', span: 2.6, layout, paint });
defineSlab('shop', { ...common, name: 'Shop', mat: 'concrete', w: 4.5, h: 4, style: 'shop', color: '#d2cabb', span: 2.6, layout, paint });
defineSlab('lamp', { ...common, name: 'Street Lamp', mat: 'metal', w: 0.6, h: 4.6, style: 'lamp', color: '#33373a', load: false, crumbs: 3, layout, paint });

/** Every kind of building the city is made of. */
export const BUILDING_TYPES = ['tower', 'apartments', 'brick', 'shop', 'lamp'];
export const isBuilding = (w) => !!(w && w.spec && w.spec.background);

/** A building of `type`, `w` wide and `h` tall (its grid: what stands on the roof as well), standing with its middle at x. */
export function addBuilding(sb, type, x, w, h, seed) {
  const s = new Slab(sb, type, x, 0, { size: { w, h }, seed });
  return sb.addSlab(s);
}

/* ---------------------------------- the city -------------------------------- */

// left to right along the street: [type, middle, wide, tall]
const STREET = [
  ['brick', -17.3, 4.8, 13.1],
  ['tower', -10.6, 6.2, 19.4],
  ['shop', -5.0, 4.2, 5.6],
  ['apartments', 0.7, 6.0, 14.2],
  ['shop', 6.1, 4.0, 4.2],
  ['brick', 10.6, 5.0, 11.4],
  ['tower', 16.4, 6.0, 16.6],
];
const GREEN = [['tree', -14.0], ['bush', -13.2], ['bush', -7.0], ['tree', -2.4], ['bush', -1.6], ['tree', 3.9], ['bush', 8.3], ['tree', 13.4], ['bush', 19.2]];
const LAMPS = [-19.7, -8.2, -2.9, 8.6, 13.0];

/**
 * The city, built: the buildings along the street, the lamps over it, the
 * trees and bushes on it, and the skyline behind. (Whatever was in the
 * sandbox is cleared first: maps.js.)
 */
export function buildCity(sb) {
  STREET.forEach(([type, x, w, h], i) => addBuilding(sb, type, x, w, h, 1009 + i * 7717));
  LAMPS.forEach((x, i) => addBuilding(sb, 'lamp', x, 0.48, 4.6, 331 + i * 97));
  for (const [kind, x] of GREEN) sb.spawnPlant(kind, x);
  sb.skyline = skyline(77);
}

/** Two rows of far-off towers, each further off than the last, for the sky behind the city. */
function skyline(seed) {
  const R = rng(seed), out = [];
  for (const [color, drift, lo, hi, lights] of [['#919191', 0.62, 6, 17, null], ['#868686', 0.42, 4, 12, 'rgba(160, 160, 150, 0.35)']]) {
    const blocks = [];
    for (let x = -46; x < 46;) {
      const w = 2.2 + R() * 4.5, h = lo + R() * (hi - lo);
      blocks.push({ x, w, h, spire: R() < 0.18 ? 1 + R() * 3 : 0 });
      x += w + (R() < 0.3 ? R() * 1.5 : 0);
    }
    out.push({ color, drift, blocks, lights });
  }
  return out;
}
