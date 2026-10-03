/* =============================================================================
   Surfaces that blood can land on.

   Every body, every prop and the grey platform owns a canvas laid out as the
   six faces of each of its boxes. A splat is drawn at the exact spot on the
   exact face it hit, so blood stays where it landed: on a fist, on a cheek,
   on a sword, on the side of a crate. The green platform is too big for one
   canvas, so it is covered by transparent tiles that are only created where
   blood actually falls.
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
      const w = Math.max(minPx, Math.min(maxPx, Math.round(du * b.density)));
      const h = Math.max(minPx, Math.min(maxPx, Math.round(dv * b.density)));
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

/** A bruise: blood under the skin, no break. */
export function drawBruise(ctx, x, y, r, strength = 0.5) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(88, 30, 70, ${0.55 * strength})`);
  g.addColorStop(0.6, `rgba(110, 40, 60, ${0.3 * strength})`);
  g.addColorStop(1, 'rgba(120, 60, 40, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
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
export function drawDrip(ctx, x, y, len, w) {
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = BLOOD[0];
  ctx.fillRect(x - w / 2, y, w, len);
  ctx.beginPath();
  ctx.arc(x, y + len, w * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
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
    let dx = 0, dy = 0;
    if (opts.dir) {
      const f = FACES[L.face];
      const d = opts.dir;
      dx = d.x * f.u[0] + d.y * f.u[1] + d.z * f.u[2];
      dy = -(d.x * f.v[0] + d.y * f.v[1] + d.z * f.v[2]);
    }
    this.clip(L.tile);
    if (opts.kind === 'bruise') drawBruise(this.ctx, L.x, L.y, r, opts.strength);
    else if (opts.kind === 'drip') drawDrip(this.ctx, L.x, L.y, r * 3, Math.max(1, r * 0.4));
    else drawSplat(this.ctx, L.x, L.y, r, { dx, dy, alpha: opts.alpha, sats: opts.sats });
    this.ctx.restore();
    this.dirty = true;
    return L;
  }

  /** Uploads if painted since last time, at most every `gap` seconds. */
  flush(now, gap = 0.05) {
    if (!this.dirty || now - this.lastUpload < gap) return;
    this.dirty = false;
    this.lastUpload = now;
    this.texture.needsUpdate = true;
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

export function flushAll(now) {
  for (const pc of PaintCanvas.all) pc.flush(now);
}

export { rng };
export const tmpLocal = new Vector3();
