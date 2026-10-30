/* =============================================================================
   Surfaces that get marked.

   Every body, every weapon and shield owns a canvas laid out as the six
   faces of each of its boxes. Damage is drawn at the exact spot on the exact
   face it landed: a bruise on a cheek, a cut along a forearm, a slash across
   a chest in the direction the blade travelled, a bullet hole where the round
   went in and a bigger one where it came out, blood on a fist or a blade.
   Cloth tears and shows the skin under it. The arena floor is too big for
   one canvas, so it is covered by transparent tiles that are only created
   where something actually lands.
   ========================================================================== */
import {
  BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute, CanvasTexture,
  Mesh, PlaneGeometry, MeshLambertMaterial, SRGBColorSpace, Vector3,
} from 'three';
import { rng } from '../core/util.js';

/* --------------------------------- faces --------------------------------- */
/* For each face of a box: its normal and which way is "up" on the picture.
   u is the viewer's right when looking at the face from outside. */
export const FACES = [
  { n: [1, 0, 0], v: [0, 1, 0] },
  { n: [-1, 0, 0], v: [0, 1, 0] },
  { n: [0, 1, 0], v: [0, 0, 1] },
  { n: [0, -1, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 0, -1], v: [0, 1, 0] },
];
for (const f of FACES) {
  const [vx, vy, vz] = f.v, [nx, ny, nz] = f.n;
  f.u = [vy * nz - vz * ny, vz * nx - vx * nz, vx * ny - vy * nx];
  f.axisN = f.n.findIndex((c) => c !== 0);
  f.axisU = f.u.findIndex((c) => c !== 0);
  f.axisV = f.v.findIndex((c) => c !== 0);
}
export const FACE = { px: 0, nx: 1, py: 2, ny: 3, pz: 4, nz: 5 };

const comp = (vec, i) => (i === 0 ? vec.x : i === 1 ? vec.y : vec.z);

/* -------------------------------- packing -------------------------------- */

/**
 * Lays out the faces of a set of boxes on one canvas.
 * boxes: [{ size: Vector3, density: px per metre }]
 * Returns { width, height, tiles: [box][face] -> {x, y, w, h} }.
 */
export function packBoxes(boxes, width, pad = 2, minPx = 6, maxPx = 512) {
  const items = [];
  boxes.forEach((b, bi) => {
    FACES.forEach((f, fi) => {
      const du = comp(b.size, f.axisU), dv = comp(b.size, f.axisV);
      // a face can ask for less: nobody sees the underside of a platform
      const dens = b.faceDensity && b.faceDensity[fi] != null ? b.faceDensity[fi] : b.density;
      const w = Math.max(minPx, Math.min(maxPx, Math.round(du * dens)));
      const h = Math.max(minPx, Math.min(maxPx, Math.round(dv * dens)));
      items.push({ bi, fi, w, h });
    });
  });
  const order = items.slice().sort((a, b) => b.h - a.h || b.w - a.w);
  let x = 0, y = 0, rowH = 0;
  for (const it of order) {
    if (x + it.w + pad * 2 > width) { x = 0; y += rowH; rowH = 0; }
    it.x = x + pad; it.y = y + pad;
    x += it.w + pad * 2;
    rowH = Math.max(rowH, it.h + pad * 2);
  }
  const height = nextPow2(y + rowH);
  const tiles = boxes.map(() => new Array(6));
  for (const it of items) tiles[it.bi][it.fi] = { x: it.x, y: it.y, w: it.w, h: it.h };
  return { width, height, tiles };
}

function nextPow2(n) { let p = 16; while (p < n) p *= 2; return p; }

/**
 * Geometry for a set of boxes sharing one atlas. Each box gets its own
 * skin index when `skinned`, so a SkinnedMesh can move every box on its own.
 */
export function buildBoxGeometry(boxes, layout, skinned = false) {
  const pos = [], nor = [], uv = [], idx = [], si = [], sw = [];
  let base = 0;
  boxes.forEach((b, bi) => {
    const hx = b.size.x / 2, hy = b.size.y / 2, hz = b.size.z / 2;
    const half = [hx, hy, hz];
    FACES.forEach((f, fi) => {
      const t = layout.tiles[bi][fi];
      const hn = half[f.axisN], hu = half[f.axisU], hv = half[f.axisV];
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (const [su, sv] of corners) {
        const p = [0, 0, 0];
        for (let k = 0; k < 3; k++) p[k] = f.n[k] * hn + f.u[k] * su * hu + f.v[k] * sv * hv;
        if (b.offset) { p[0] += b.offset.x; p[1] += b.offset.y; p[2] += b.offset.z; }
        pos.push(p[0], p[1], p[2]);
        nor.push(f.n[0], f.n[1], f.n[2]);
        const px = t.x + (su + 1) / 2 * t.w;
        const py = t.y + (1 - (sv + 1) / 2) * t.h;
        uv.push(px / layout.width, 1 - py / layout.height);
        if (skinned) { si.push(bi, 0, 0, 0); sw.push(1, 0, 0, 0); }
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      base += 4;
    });
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  if (skinned) {
    g.setAttribute('skinIndex', new Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new Float32BufferAttribute(sw, 4));
  }
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/**
 * Where a point in a box's own frame lands on the atlas: which face, and the
 * pixel. Also how many pixels one metre is on that face.
 */
export function locate(local, size, tiles, out) {
  const ax = Math.abs(local.x) / (size.x / 2);
  const ay = Math.abs(local.y) / (size.y / 2);
  const az = Math.abs(local.z) / (size.z / 2);
  let fi;
  if (ax >= ay && ax >= az) fi = local.x >= 0 ? 0 : 1;
  else if (ay >= az) fi = local.y >= 0 ? 2 : 3;
  else fi = local.z >= 0 ? 4 : 5;
  const f = FACES[fi], t = tiles[fi];
  const du = comp(size, f.axisU), dv = comp(size, f.axisV);
  const lu = local.x * f.u[0] + local.y * f.u[1] + local.z * f.u[2];
  const lv = local.x * f.v[0] + local.y * f.v[1] + local.z * f.v[2];
  const su = Math.max(-1, Math.min(1, lu / (du / 2)));
  const sv = Math.max(-1, Math.min(1, lv / (dv / 2)));
  out.face = fi;
  out.tile = t;
  out.x = t.x + (su + 1) / 2 * t.w;
  out.y = t.y + (1 - (sv + 1) / 2) * t.h;
  out.ppm = t.w / du;
  out.ppmV = t.h / dv;
  return out;
}

/* ------------------------------- drawing ink ----------------------------- */

export const BLOOD = ['#7d0606', '#8f0a0a', '#6b0404', '#9c1010'];

/**
 * A blood splat: an irregular blob, satellite drops, and a smear in the
 * direction it was travelling. r in pixels; (dx, dy) direction on the face.
 */
export function drawSplat(ctx, x, y, r, opts = {}) {
  const rand = opts.rand || Math.random;
  const col = opts.color || BLOOD[(rand() * BLOOD.length) | 0];
  const alpha = opts.alpha != null ? opts.alpha : 0.88;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = col;
  // main blob, wobbly edge
  ctx.beginPath();
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.75 + rand() * 0.45);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  // streak
  const dx = opts.dx || 0, dy = opts.dy || 0;
  const dl = Math.hypot(dx, dy);
  if (dl > 0.2) {
    const ux = dx / dl, uy = dy / dl;
    const len = r * (1 + dl * 1.5);
    ctx.beginPath();
    ctx.moveTo(x - uy * r * 0.5, y + ux * r * 0.5);
    ctx.lineTo(x + ux * len, y + uy * len);
    ctx.lineTo(x + uy * r * 0.5, y - ux * r * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  // satellites
  const sats = opts.sats != null ? opts.sats : (2 + rand() * 4) | 0;
  for (let i = 0; i < sats; i++) {
    const a = rand() * Math.PI * 2;
    const d = r * (1.2 + rand() * 1.6);
    const sr = Math.max(0.6, r * (0.12 + rand() * 0.25));
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d + (dx * d * 0.3), y + Math.sin(a) * d + (dy * d * 0.3), sr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

const TAU = Math.PI * 2;

function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }

/** A spindle along +x centred on the origin: the shape of a split in skin or cloth. */
function lens(ctx, len, w, ox = 0, oy = 0, wobble = 0) {
  const h = len / 2;
  ctx.beginPath();
  ctx.moveTo(ox - h, oy);
  ctx.quadraticCurveTo(ox, oy - w + wobble, ox + h, oy);
  ctx.quadraticCurveTo(ox, oy + w - wobble, ox - h, oy);
  ctx.fill();
}

/** A ragged blob of radius r: torn edges, exit wounds. */
function ragged(ctx, x, y, r, points = 11, spread = 0.45) {
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * TAU;
    const rr = r * (1 - spread / 2 + Math.random() * spread);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * A bruise: blood under unbroken skin. A mottled plum heart, a red rim, and
 * the faint yellow-green halo it spreads into.
 */
export function drawBruise(ctx, x, y, r, strength = 0.5) {
  const s = Math.max(0.2, Math.min(1, strength));
  let g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 1.35);
  g.addColorStop(0, `rgba(140, 130, 55, ${0.2 * s})`);
  g.addColorStop(1, 'rgba(140, 130, 55, 0)');
  ctx.fillStyle = g;
  circle(ctx, x, y, r * 1.35);
  for (let i = 0; i < 4; i++) {
    const a = Math.random() * TAU, d = r * 0.4 * Math.random();
    const cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d;
    const rr = r * (0.45 + Math.random() * 0.4);
    g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
    g.addColorStop(0, `rgba(66, 22, 78, ${0.55 * s})`);
    g.addColorStop(0.5, `rgba(112, 34, 66, ${0.36 * s})`);
    g.addColorStop(1, 'rgba(130, 50, 60, 0)');
    ctx.fillStyle = g;
    circle(ctx, cx, cy, rr);
  }
}

/** What a blunt hit leaves on cloth: a grubby scuff, the bruise is underneath. */
export function drawScuff(ctx, x, y, r, strength = 0.5) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(40, 28, 20, ${0.32 * strength})`);
  g.addColorStop(1, 'rgba(40, 28, 20, 0)');
  ctx.fillStyle = g;
  circle(ctx, x, y, r);
}

/** A torn slit in cloth along +x, with the skin showing through it. */
function tear(ctx, len, w, cloth, skin) {
  ctx.fillStyle = cloth ? shadeHex(cloth, 1.35) : '#ddd';
  lens(ctx, len * 1.08, w * 1.35);
  ctx.fillStyle = skin || '#d29a72';
  lens(ctx, len, w, 0, 0, w * 0.25);
}

/**
 * A cut: a short split in the skin. A swollen pink margin, the dark line of
 * the wound, fresh blood along it. Drawn along +x after the caller has
 * turned the canvas to the direction of the stroke.
 */
function cutShape(ctx, len, w) {
  ctx.fillStyle = 'rgba(198, 92, 88, 0.8)';
  lens(ctx, len * 1.08, w * 1.9);
  ctx.fillStyle = '#4a0505';
  lens(ctx, len, w, 0, 0, w * 0.2);
  ctx.fillStyle = '#a5121a';
  lens(ctx, len * 0.72, w * 0.45, len * 0.04, -w * 0.12);
}

/** Blood running from a wound, in the direction (gx, gy) that is down on this face. */
function runs(ctx, x, y, count, len, w, gx, gy) {
  const gl = Math.hypot(gx, gy);
  if (gl < 0.2) return;
  gx /= gl; gy /= gl;
  ctx.fillStyle = BLOOD[0];
  ctx.globalAlpha = 0.85;
  for (let i = 0; i < count; i++) {
    const sx = x + (Math.random() - 0.5) * len, sy = y + (Math.random() - 0.5) * len * 0.3;
    const l = len * (0.35 + Math.random() * 0.8);
    const ww = Math.max(0.8, w * (0.5 + Math.random() * 0.5));
    ctx.beginPath();
    ctx.moveTo(sx - gy * ww, sy + gx * ww);
    ctx.lineTo(sx + gx * l - gy * ww * 0.6, sy + gy * l + gx * ww * 0.6);
    ctx.lineTo(sx + gx * l + gy * ww * 0.6, sy + gy * l - gx * ww * 0.6);
    ctx.lineTo(sx + gy * ww, sy - gx * ww);
    ctx.fill();
    circle(ctx, sx + gx * l, sy + gy * l, ww * 0.9);
  }
  ctx.globalAlpha = 1;
}

export function drawCut(ctx, x, y, len, ang, o = {}) {
  const w = Math.max(1, len * 0.13);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  if (o.cloth) tear(ctx, len * 1.2, w * 2.4, o.cloth, o.skin);
  cutShape(ctx, len, w);
  ctx.restore();
  runs(ctx, x, y, 1 + (Math.random() < 0.5 ? 1 : 0), len * 0.9, w * 0.7, o.gx || 0, o.gy || 0);
}

/** A slash: a long gash with the flesh showing, ragged at the edges, running with blood. */
export function drawSlash(ctx, x, y, len, ang, o = {}) {
  const w = Math.max(1.4, len * 0.085);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang + (Math.random() - 0.5) * 0.12);
  if (o.cloth) tear(ctx, len * 1.12, w * 2.6, o.cloth, o.skin);
  ctx.fillStyle = 'rgba(176, 58, 58, 0.75)';
  lens(ctx, len * 1.06, w * 2.2);
  ctx.fillStyle = '#3d0404';
  lens(ctx, len, w * 1.35, 0, 0, w * 0.3);
  ctx.fillStyle = '#c4434a';
  lens(ctx, len * 0.8, w * 0.55, 0, -w * 0.2);
  ctx.fillStyle = '#e07a7a';
  lens(ctx, len * 0.45, w * 0.22, -len * 0.05, -w * 0.3);
  ctx.restore();
  runs(ctx, x, y, 3 + ((Math.random() * 3) | 0), len * 0.9, w * 0.8, o.gx || 0, o.gy || 0);
}

/** Where a bullet went in: a small dark hole, a red-brown abrasion ring, a little soot. */
export function drawBulletHole(ctx, x, y, r, o = {}) {
  if (o.cloth) {
    ctx.fillStyle = shadeHex(o.cloth, 0.45);
    ragged(ctx, x, y, r * 2.6, 9, 0.6);
    ctx.fillStyle = o.skin || '#d29a72';
    ragged(ctx, x, y, r * 2.0, 9, 0.5);
  }
  ctx.fillStyle = 'rgba(40, 30, 28, 0.35)';
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * TAU, d = r * (1.6 + Math.random() * 1.6);
    circle(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(0.6, r * 0.25));
  }
  ctx.fillStyle = 'rgba(122, 32, 26, 0.9)';
  circle(ctx, x, y, r * 1.6);
  ctx.fillStyle = '#120202';
  circle(ctx, x, y, r);
  ctx.fillStyle = '#5c0808';
  circle(ctx, x + r * 0.2, y + r * 0.2, r * 0.45);
  runs(ctx, x, y, 1, r * 3, r * 0.7, o.gx || 0, o.gy || 0);
}

/** Where it came out: bigger, torn outward, bright, with spatter. */
export function drawExitWound(ctx, x, y, r, o = {}) {
  if (o.cloth) {
    ctx.fillStyle = shadeHex(o.cloth, 1.3);
    ragged(ctx, x, y, r * 2.4, 12, 0.7);
  }
  ctx.fillStyle = '#7d0606';
  ragged(ctx, x, y, r * 1.9, 12, 0.7);
  ctx.fillStyle = '#b0182a';
  ragged(ctx, x, y, r * 1.2, 10, 0.6);
  ctx.fillStyle = '#2a0202';
  ragged(ctx, x, y, r * 0.6, 8, 0.5);
  drawSplat(ctx, x, y, r * 1.2, { sats: 6, alpha: 0.7 });
  runs(ctx, x, y, 2, r * 3.5, r * 0.8, o.gx || 0, o.gy || 0);
}

/** A pool: a soft, slowly widening patch. */
export function drawPool(ctx, x, y, r, alpha = 0.25) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#6a0505';
  ctx.beginPath();
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.85 + 0.25 * Math.sin(a * 3 + x) * Math.cos(a * 2 + y));
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** A run of blood dripping down a face. */
export function drawDrip(ctx, x, y, len, w, gx = 0, gy = 1) {
  runs(ctx, x, y, 1, len, w, gx, gy);
}

/** A bullet's mark in sand or wood: a dark pit with a pale rim. */
export function drawPit(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(255, 240, 210, 0.25)';
  circle(ctx, x, y, r * 1.8);
  ctx.fillStyle = 'rgba(30, 20, 12, 0.75)';
  circle(ctx, x, y, r);
}

function shadeHex(hex, k) {
  if (hex[0] !== '#') return hex;
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

/* ------------------------------ paintable box ---------------------------- */

const _loc = { face: 0, tile: null, x: 0, y: 0, ppm: 1, ppmV: 1 };

/**
 * One canvas for one or more boxes. paintBox() takes a point in a box's own
 * frame and draws there. Uploading is deferred to flush(), once per frame.
 */
export class PaintCanvas {
  constructor(width, height) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width; this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.dirty = false;
    this.lastUpload = 0;
    PaintCanvas.all.add(this);
  }

  clip(t) {
    const c = this.ctx;
    c.save();
    c.beginPath();
    c.rect(t.x, t.y, t.w, t.h);
    c.clip();
  }

  /**
   * Splat on a box. local: point in the box's frame; size: the box's size;
   * tiles: the six tiles of that box; radius in metres; dir: travel
   * direction in the box's frame (optional).
   */
  splat(local, size, tiles, radius, opts = {}) {
    const L = locate(local, size, tiles, _loc);
    const r = Math.max(1, radius * L.ppm);
    const f = FACES[L.face];
    let dx = 0, dy = 0;
    if (opts.dir) {
      const d = opts.dir;
      dx = d.x * f.u[0] + d.y * f.u[1] + d.z * f.u[2];
      dy = -(d.x * f.v[0] + d.y * f.v[1] + d.z * f.v[2]);
    }
    // which way is down on this face, for blood that runs
    let gx = 0, gy = 0;
    if (opts.down) {
      const d = opts.down;
      gx = d.x * f.u[0] + d.y * f.u[1] + d.z * f.u[2];
      gy = -(d.x * f.v[0] + d.y * f.v[1] + d.z * f.v[2]);
    }
    const o = { cloth: opts.cloth || null, skin: opts.skin, gx, gy };
    const ang = Math.atan2(dy, dx);
    const ctx = this.ctx;
    this.clip(L.tile);
    switch (opts.kind) {
      case 'bruise': drawBruise(ctx, L.x, L.y, r, opts.strength); break;
      case 'scuff': drawScuff(ctx, L.x, L.y, r, opts.strength); break;
      case 'cut': drawCut(ctx, L.x, L.y, Math.max(3, (opts.length || 0.04) * L.ppm), ang, o); break;
      case 'slash': drawSlash(ctx, L.x, L.y, Math.max(5, (opts.length || 0.16) * L.ppm), ang, o); break;
      case 'bullet': drawBulletHole(ctx, L.x, L.y, r, o); break;
      case 'exit': drawExitWound(ctx, L.x, L.y, r, o); break;
      case 'pit': drawPit(ctx, L.x, L.y, r); break;
      case 'drip': drawDrip(ctx, L.x, L.y, r * 3, Math.max(1, r * 0.4), gx || dx, gy || dy || 1); break;
      default: drawSplat(ctx, L.x, L.y, r, { dx, dy, alpha: opts.alpha, sats: opts.sats });
    }
    ctx.restore();
    this.dirty = true;
    return L;
  }

  dispose() {
    this.texture.dispose();
    PaintCanvas.all.delete(this);
  }
}
PaintCanvas.all = new Set();

/* ------------------------------ the floor tiles -------------------------- */

/**
 * Transparent tiles laid over a flat surface, made on demand where blood
 * falls. bounds: [minX, minZ, maxX, maxZ]; y: height of the surface.
 */
export class FloorPaint {
  constructor(scene, bounds, y, tileSize = 5, px = 512) {
    this.scene = scene;
    this.bounds = bounds;
    this.y = y;
    this.size = tileSize;
    this.px = px;
    this.tiles = new Map();
    this.nx = Math.ceil((bounds[2] - bounds[0]) / tileSize);
    this.nz = Math.ceil((bounds[3] - bounds[1]) / tileSize);
  }

  inside(x, z) {
    const b = this.bounds;
    return x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3];
  }

  tile(ix, iz) {
    const key = ix * 1000 + iz;
    let t = this.tiles.get(key);
    if (t) return t;
    const pc = new PaintCanvas(this.px, this.px);
    const mat = new MeshLambertMaterial({
      map: pc.texture, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const geo = new PlaneGeometry(this.size, this.size);
    const mesh = new Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    const x0 = this.bounds[0] + ix * this.size, z0 = this.bounds[1] + iz * this.size;
    mesh.position.set(x0 + this.size / 2, this.y + 0.002, z0 + this.size / 2);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    this.scene.add(mesh);
    t = { pc, mesh, x0, z0 };
    this.tiles.set(key, t);
    return t;
  }

  /** Draws with fn(ctx, px, py, pixelsPerMetre) at world (x, z), across tile seams. */
  draw(x, z, radius, fn) {
    if (!this.inside(x, z)) return false;
    const ppm = this.px / this.size;
    const s = this.size;
    const ix0 = Math.floor((x - radius - this.bounds[0]) / s), ix1 = Math.floor((x + radius - this.bounds[0]) / s);
    const iz0 = Math.floor((z - radius - this.bounds[1]) / s), iz1 = Math.floor((z + radius - this.bounds[1]) / s);
    for (let ix = Math.max(0, ix0); ix <= Math.min(this.nx - 1, ix1); ix++) {
      for (let iz = Math.max(0, iz0); iz <= Math.min(this.nz - 1, iz1); iz++) {
        const t = this.tile(ix, iz);
        // plane is rotated -90 about X: texture u = +x, texture v = -z
        const px = (x - t.x0) * ppm;
        const py = (z - t.z0) * ppm;
        fn(t.pc.ctx, px, py, ppm);
        t.pc.dirty = true;
      }
    }
    return true;
  }

  splat(x, z, radius, dir = null, alpha) {
    return this.draw(x, z, radius * 3, (ctx, px, py, ppm) => {
      drawSplat(ctx, px, py, Math.max(1, radius * ppm), {
        dx: dir ? dir.x : 0, dy: dir ? dir.z : 0, alpha,
      });
    });
  }

  pool(x, z, radius, alpha) {
    return this.draw(x, z, radius * 1.2, (ctx, px, py, ppm) => drawPool(ctx, px, py, radius * ppm, alpha));
  }

  /** Where a stray bullet went into the ground. */
  pit(x, z, radius) {
    return this.draw(x, z, radius * 2, (ctx, px, py, ppm) => drawPit(ctx, px, py, Math.max(1, radius * ppm)));
  }

  clear() {
    for (const t of this.tiles.values()) {
      this.scene.remove(t.mesh);
      t.mesh.geometry.dispose();
      t.mesh.material.dispose();
      t.pc.dispose();
    }
    this.tiles.clear();
  }
}

/**
 * Uploads painted canvases to the GPU. Each waits at least `gap` seconds
 * between uploads, and no more than `budget` bytes go up in one frame - a
 * phone does not want twenty fresh textures every frame of a bloody brawl.
 * Whatever waited longest goes first.
 */
export function flushAll(now, gap = 0.08, budget = 2.2e6) {
  const ready = [];
  for (const pc of PaintCanvas.all) if (pc.dirty && now - pc.lastUpload >= gap) ready.push(pc);
  if (!ready.length) return;
  ready.sort((a, b) => a.lastUpload - b.lastUpload);
  let bytes = 0;
  for (const pc of ready) {
    const size = pc.canvas.width * pc.canvas.height * 4;
    if (bytes > 0 && bytes + size > budget) break;
    bytes += size;
    pc.dirty = false;
    pc.lastUpload = now;
    pc.texture.needsUpdate = true;
  }
}

export { rng };
export const tmpLocal = new Vector3();
