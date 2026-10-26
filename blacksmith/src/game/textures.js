/* =============================================================================
   Procedural textures. Everything is painted onto a canvas when the game
   loads, so the game ships without a single image file.
   ========================================================================== */
import {
  CanvasTexture, RepeatWrapping, ClampToEdgeWrapping, SRGBColorSpace,
  LinearFilter, LinearMipmapLinearFilter,
} from 'three';
import { makeRng, makeTileableNoise, tileableFbm, valueNoise2D, fbm, clamp01, lerp } from '../core/util.js';

export function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function toTexture(canvas, { repeat = 1, clamp = false, srgb = true } = {}) {
  const t = new CanvasTexture(canvas);
  t.wrapS = t.wrapT = clamp ? ClampToEdgeWrapping : RepeatWrapping;
  t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  return t;
}

/** Fills a tileable image pixel by pixel from fn(u, v) -> [r, g, b]. */
function paintPixels(size, fn) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = fn(x / size, y / size);
      const i = (y * size + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { c, ctx };
}

/** Draws at (x, y) and at every wrapped copy, so a tile has no seam. */
function wrapped(size, x, y, r, draw) {
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) {
      if (x + ox + r < 0 || x + ox - r > size || y + oy + r < 0 || y + oy - r > size) continue;
      draw(x + ox, y + oy);
    }
  }
}

/* --------------------------------- grass ---------------------------------- */

export function grassTexture(size = 512) {
  const noise = makeTileableNoise(7);
  const rng = makeRng(77);
  const { c, ctx } = paintPixels(size, (u, v) => {
    const broad = tileableFbm(noise, u, v, 5, 3, 0.55);
    const fine = tileableFbm(noise, u + 0.37, v - 0.11, 28, 3, 0.6);
    const t = clamp01(broad * 0.4 + fine * 0.7 - 0.08);
    const dry = clamp01(tileableFbm(noise, u - 0.21, v + 0.44, 7, 2, 0.5) - 0.58) * 1.2;
    return [58 + t * 52 + dry * 46, 112 + t * 66 - dry * 6, 40 + t * 30 - dry * 8];
  });
  // blades, wrapped so the tile still meets itself
  for (let i = 0; i < size * 6; i++) {
    const x = rng() * size, y = rng() * size;
    const h = 2 + rng() * 6, dx = (rng() - 0.5) * 3;
    const s = 60 + rng() * 120;
    ctx.strokeStyle = `rgba(${(s * 0.6) | 0},${(s * 1.18) | 0},${(s * 0.45) | 0},${0.25 + rng() * 0.35})`;
    ctx.lineWidth = 0.8 + rng() * 0.9;
    wrapped(size, x, y, 8, (px, py) => {
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + dx, py - h); ctx.stroke();
    });
  }
  return toTexture(c);
}

/* ---------------------------------- dirt ---------------------------------- */

export function dirtTexture(size = 256) {
  const noise = makeTileableNoise(19);
  const rng = makeRng(191);
  const { c, ctx } = paintPixels(size, (u, v) => {
    const n = tileableFbm(noise, u, v, 6, 4, 0.55);
    const f = tileableFbm(noise, u + 0.5, v + 0.2, 32, 2, 0.5);
    const k = 0.75 + n * 0.35 + f * 0.15;
    return [132 * k, 101 * k, 68 * k];
  });
  // pebbles trodden into it
  for (let i = 0; i < 160; i++) {
    const x = rng() * size, y = rng() * size, r = 1 + rng() * 3.2;
    const g = 110 + rng() * 70;
    wrapped(size, x, y, r + 1, (px, py) => {
      ctx.fillStyle = `rgba(${g * 1.02 | 0},${g * 0.95 | 0},${g * 0.86 | 0},0.8)`;
      ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.75, rng() * 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.ellipse(px + 0.6, py + 0.8, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    });
  }
  return toTexture(c);
}

/* -------------------------- the stone circle ------------------------------ */

/**
 * The flagstones you spawn on: rings of stones laid round a centre stone,
 * drawn as one picture for one disc rather than a repeating tile.
 */
export function stoneCircleTexture(size = 1024) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const rng = makeRng(5);
  const noise = valueNoise2D(55);
  const cx = size / 2, cy = size / 2;
  ctx.fillStyle = '#3c3a36';
  ctx.fillRect(0, 0, size, size);
  const stone = (path, shade) => {
    const g = ctx.createLinearGradient(0, 0, size, size);
    const b = 128 + shade * 40;
    g.addColorStop(0, `rgb(${b + 18},${b + 14},${b + 6})`);
    g.addColorStop(1, `rgb(${b - 16},${b - 18},${b - 22})`);
    ctx.fillStyle = g;
    path(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2; path(); ctx.stroke();
  };
  // centre stone, with a ring carved into it
  stone(() => { ctx.beginPath(); ctx.arc(cx, cy, size * 0.085, 0, Math.PI * 2); }, 0.3);
  ctx.strokeStyle = 'rgba(40,36,30,0.55)'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(cx, cy, size * 0.055, 0, Math.PI * 2); ctx.stroke();
  // the rings
  const rings = [[0.095, 0.19, 9], [0.2, 0.31, 15], [0.32, 0.43, 21], [0.44, 0.5, 28]];
  for (const [r0, r1, n] of rings) {
    const off = rng() * Math.PI;
    for (let i = 0; i < n; i++) {
      const a0 = off + (i / n) * Math.PI * 2 + 0.012, a1 = off + ((i + 1) / n) * Math.PI * 2 - 0.012;
      const R0 = r0 * size + 3, R1 = r1 * size - 3;
      stone(() => {
        ctx.beginPath();
        ctx.arc(cx, cy, R1, a0, a1);
        ctx.arc(cx, cy, R0, a1, a0, true);
        ctx.closePath();
      }, rng() - 0.5);
    }
  }
  // wear, moss in the cracks, and grit
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n = fbm(noise, x / 40, y / 40, 4);
      const k = 0.82 + n * 0.32;
      d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
      if (d[i] < 70 && n > 0.5) { d[i] = 64; d[i + 1] = 92; d[i + 2] = 44; }
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = toTexture(c, { clamp: true });
  return t;
}

/* ------------------------------ masonry ----------------------------------- */

/** Rough-cut stone blocks in courses, for the forge's walls and hearth. */
export function bricksTexture(size = 256, { tone = 1, rows = 4, cols = 3, seed = 9 } = {}) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const rng = makeRng(seed);
  const noise = valueNoise2D(seed * 3);
  ctx.fillStyle = '#2e2b27';
  ctx.fillRect(0, 0, size, size);
  const bh = size / rows, bw = size / cols;
  for (let r = 0; r < rows; r++) {
    const shift = (r % 2) * bw * 0.5;
    for (let k = -1; k < cols + 1; k++) {
      const x = k * bw + shift, y = r * bh;
      const b = (108 + rng() * 44) * tone;
      ctx.fillStyle = `rgb(${b + 6 | 0},${b | 0},${b - 8 | 0})`;
      const m = 3;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x + m, y + m, bw - m * 2, bh - m * 2, 6) : ctx.rect(x + m, y + m, bw - m * 2, bh - m * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x + m, y + m, bw - m * 2, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x + m, y + bh - m - 4, bw - m * 2, 4);
    }
  }
  const img = ctx.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const k = 0.8 + fbm(noise, x / 18, y / 18, 3) * 0.4;
      img.data[i] *= k; img.data[i + 1] *= k; img.data[i + 2] *= k;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

/* ---------------------------------- wood ---------------------------------- */

export function drawWood(ctx, w, h, { seed = 3, planks = 4, base = [150, 102, 58], vertical = false } = {}) {
  const noise = valueNoise2D(seed);
  const rng = makeRng(seed * 17 + 3);
  ctx.save();
  if (vertical) { ctx.translate(w, 0); ctx.rotate(Math.PI / 2); [w, h] = [h, w]; }
  const ph = h / planks;
  for (let p = 0; p < planks; p++) {
    const k = 0.85 + rng() * 0.3;
    ctx.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`;
    ctx.fillRect(0, p * ph, w, ph);
    for (let i = 0; i < 18; i++) {
      const y = p * ph + rng() * ph;
      ctx.strokeStyle = `rgba(60,36,14,${0.07 + rng() * 0.16})`;
      ctx.lineWidth = 0.6 + rng() * 1.5;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const yy = y + Math.sin(x * 0.05 + p) * 1.4 + (fbm(noise, x / 22, y / 9, 3) - 0.5) * 5;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(30,16,6,0.6)';
    ctx.fillRect(0, p * ph, w, Math.max(1.5, h / 90));
  }
  for (let i = 0; i < 3; i++) {
    const x = rng() * w, y = rng() * h, r = 2 + rng() * 4;
    ctx.strokeStyle = 'rgba(58,32,12,0.5)';
    for (let k = 0; k < 4; k++) {
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.ellipse(x, y, r + k * 1.5, (r + k * 1.5) * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.restore();
}

export function woodTexture(size = 256, opts = {}) {
  const c = makeCanvas(size);
  drawWood(c.getContext('2d'), size, size, opts);
  return toTexture(c);
}

/* ---------------------------------- rock ---------------------------------- */

export function rockTexture(size = 256, { seed = 11, tint = [1, 0.98, 0.93], dark = 0 } = {}) {
  const noise = makeTileableNoise(seed);
  const rng = makeRng(seed * 13 + 1);
  const { c, ctx } = paintPixels(size, (u, v) => {
    const n = tileableFbm(noise, u, v, 5, 5, 0.55);
    const ridge = 1 - Math.abs(tileableFbm(noise, u + 0.3, v + 0.7, 3, 3, 0.5) * 2 - 1);
    const val = (78 + n * 96 + ridge * 22) * (1 - dark);
    return [val * tint[0], val * tint[1], val * tint[2]];
  });
  for (let i = 0; i < 22; i++) {
    let x = rng() * size, y = rng() * size;
    ctx.strokeStyle = `rgba(30,28,26,${0.15 + rng() * 0.3})`;
    ctx.lineWidth = 0.7 + rng() * 1.4;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += (rng() - 0.5) * 30; y += (rng() - 0.5) * 30; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  return toTexture(c);
}

/* ------------------------------ stone slabs ------------------------------- */

/**
 * Irregular flagstones with dark cracks between them, for the cave floor.
 * Each slab is the area closest to one of a jittered grid of points; the
 * grid wraps, so the tile does too.
 */
export function slabTexture(size = 256, { seed = 27, cells = 5, base = [124, 120, 117] } = {}) {
  const rng = makeRng(seed);
  const noise = makeTileableNoise(seed + 1);
  const pts = [], shade = [];
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      pts.push([(i + 0.2 + rng() * 0.6) / cells, (j + 0.2 + rng() * 0.6) / cells]);
      shade.push(0.8 + rng() * 0.32);
    }
  }
  const mod = (a, n) => ((a % n) + n) % n;
  const { c } = paintPixels(size, (u, v) => {
    const ci = Math.floor(u * cells), cj = Math.floor(v * cells);
    let d1 = 9, d2 = 9, id = 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const ii = mod(ci + di, cells), jj = mod(cj + dj, cells);
        const p = pts[jj * cells + ii];
        const px = p[0] + (ci + di - ii) / cells, py = p[1] + (cj + dj - jj) / cells;
        const d = Math.hypot(u - px, v - py);
        if (d < d1) { d2 = d1; d1 = d; id = jj * cells + ii; } else if (d < d2) d2 = d;
      }
    }
    const crack = 1 - clamp01((d2 - d1) / 0.014);
    const grain = 0.84 + tileableFbm(noise, u, v, 8, 4, 0.55) * 0.32;
    const k = shade[id] * grain * (1 - crack * 0.62);
    return [base[0] * k, base[1] * k, base[2] * k];
  });
  return toTexture(c);
}

/* ------------------------------- roof tiles ------------------------------- */

export function shinglesTexture(size = 256) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const rng = makeRng(31);
  ctx.fillStyle = '#3a2416';
  ctx.fillRect(0, 0, size, size);
  const rows = 8, cols = 6;
  const rh = size / rows, cw = size / cols;
  for (let r = 0; r < rows; r++) {
    const shift = (r % 2) * cw / 2;
    for (let k = -1; k <= cols; k++) {
      const x = k * cw + shift, y = r * rh;
      const b = 0.75 + rng() * 0.35;
      ctx.fillStyle = `rgb(${120 * b | 0},${64 * b | 0},${40 * b | 0})`;
      ctx.beginPath();
      ctx.moveTo(x + 1, y); ctx.lineTo(x + cw - 1, y); ctx.lineTo(x + cw - 1, y + rh * 0.8);
      ctx.quadraticCurveTo(x + cw / 2, y + rh * 1.15, x + 1, y + rh * 0.8);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + 1, y, cw - 2, 3);
    }
  }
  return toTexture(c);
}

/* ---------------------------------- sky ----------------------------------- */

export function skyTexture() {
  const c = makeCanvas(16, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#3f7fc9');
  g.addColorStop(0.32, '#78b2e6');
  g.addColorStop(0.48, '#cfe6f5');
  g.addColorStop(0.52, '#e9efe6');
  g.addColorStop(1, '#9fb38a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  const t = toTexture(c, { clamp: true });
  return t;
}

/* ------------------------------ grass tufts ------------------------------- */

/** A clump of blades on a clear background, for the tufts dotted over the grass. */
export function tuftTexture(size = 64) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const rng = makeRng(23);
  for (let i = 0; i < 16; i++) {
    const x = size * (0.2 + rng() * 0.6), lean = (rng() - 0.5) * size * 0.5;
    const h = size * (0.45 + rng() * 0.5);
    const g = 90 + rng() * 80;
    ctx.fillStyle = `rgb(${g * 0.55 | 0},${g * 1.15 | 0},${g * 0.4 | 0})`;
    ctx.beginPath();
    ctx.moveTo(x - 2.5, size);
    ctx.quadraticCurveTo(x + lean * 0.3, size - h * 0.6, x + lean, size - h);
    ctx.quadraticCurveTo(x + lean * 0.3 + 1, size - h * 0.6, x + 2.5, size);
    ctx.fill();
  }
  return toTexture(c, { clamp: true });
}

/* --------------------------------- lava ----------------------------------- */

export function lavaTexture(size = 128) {
  const noise = makeTileableNoise(41);
  const { c } = paintPixels(size, (u, v) => {
    const n = tileableFbm(noise, u, v, 4, 4, 0.6);
    const cracks = 1 - Math.abs(tileableFbm(noise, u + 0.4, v, 6, 3, 0.5) * 2 - 1);
    const h = clamp01(n * 0.8 + Math.pow(cracks, 4) * 0.9);
    return [255, lerp(60, 230, h), lerp(0, 90, h * h)];
  });
  return toTexture(c);
}

/* -------------------------------- sprites --------------------------------- */

/** A soft round dot: smoke, steam, the glow round a flame. */
export function softDotTexture(size = 64, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(c, { clamp: true });
}

/**
 * A flame tongue for torches and the hearth, worked out pixel by pixel: round
 * at the foot, drawn up to a point, white-hot low in its heart, then yellow,
 * orange and a red fringe that fades to nothing, so it has no hard edge.
 * Its foot sits a tenth of the way up the texture (FLAME_FOOT in torch.js).
 */
export function flameTexture(size = 64) {
  const w = size, h = size * 2;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const ramp = [[0, [190, 40, 6]], [0.3, [255, 120, 30]], [0.6, [255, 205, 95]], [0.85, [255, 245, 205]], [1, [255, 255, 245]]];
  const colour = (t) => {
    for (let k = 1; k < ramp.length; k++) {
      if (t <= ramp[k][0]) {
        const [t0, a] = ramp[k - 1], [t1, b] = ramp[k];
        const f = (t - t0) / (t1 - t0);
        return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
      }
    }
    return ramp[ramp.length - 1][1];
  };
  // half the flame's width, across the texture, at height v (0 the bottom, 1 the top)
  const halfWidth = (v) => {
    if (v < 0.04 || v > 0.97) return 0;
    if (v < 0.24) return 0.86 * Math.sqrt(1 - ((0.24 - v) / 0.2) ** 2);
    return 0.86 * (1 - (v - 0.24) / 0.73) ** 1.35;
  };
  for (let y = 0; y < h; y++) {
    const v = 1 - (y + 0.5) / h;
    const hw = halfWidth(v);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const u = Math.abs(((x + 0.5) / w) * 2 - 1);
      const d = hw > 0 ? u / hw : 9;
      if (d >= 1) { img.data[i + 3] = 0; continue; }
      const body = 1 - d * d;
      const heat = clamp01(body * (1.15 - v * 1.05));
      const [r, g, b] = colour(heat);
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
      img.data[i + 3] = 255 * clamp01(body * 1.6) * (0.45 + 0.55 * heat);
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { clamp: true });
}

/* ---------------------------------- text ---------------------------------- */

/** The board over the cave mouth: planks with "Cave" cut into them. */
export function signTexture(text, w = 512, h = 192) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  drawWood(ctx, w, h, { seed: 12, planks: 2, base: [140, 92, 50] });
  ctx.strokeStyle = 'rgba(40,22,8,0.85)';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, w - 10, h - 10);
  // nails in the corners
  ctx.fillStyle = '#3b3631';
  for (const [x, y] of [[22, 22], [w - 22, 22], [22, h - 22], [w - 22, h - 22]]) {
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // as big as the board allows, and smaller for a longer word
  let size = Math.round(h * 0.62);
  ctx.font = `bold ${size}px Georgia, "Times New Roman", serif`;
  const room = w - 70, wide = ctx.measureText(text).width;
  if (wide > room) {
    size = Math.floor(size * room / wide);
    ctx.font = `bold ${size}px Georgia, "Times New Roman", serif`;
  }
  // carved: a light lip below, dark cut above
  ctx.fillStyle = 'rgba(230,190,140,0.55)';
  ctx.fillText(text, w / 2 + 2, h / 2 + 5);
  ctx.fillStyle = '#2b1606';
  ctx.fillText(text, w / 2, h / 2 + 2);
  return toTexture(c, { clamp: true });
}

/**
 * One face of an arrow-shaped signboard: planks, a dark edge that follows
 * the arrow round to its point, and the word in the body of it. The point
 * is always on the right of the picture; `mirrored` writes the word back to
 * front, for the face on the far side, which is seen from behind.
 */
export function arrowSignTexture(text, bodyFrac, mirrored = false, w = 512, h = 140) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  drawWood(ctx, w, h, { seed: 12, planks: 2, base: [140, 92, 50] });
  const bw = w * bodyFrac, i = 7;
  ctx.strokeStyle = 'rgba(40,22,8,0.85)';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(i, i); ctx.lineTo(bw, i); ctx.lineTo(w - i * 1.6, h / 2); ctx.lineTo(bw, h - i); ctx.lineTo(i, h - i);
  ctx.closePath();
  ctx.stroke();
  ctx.save();
  if (mirrored) { ctx.translate(bw / 2, 0); ctx.scale(-1, 1); ctx.translate(-bw / 2, 0); }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(h * 0.6)}px Georgia, "Times New Roman", serif`;
  ctx.fillStyle = 'rgba(230,190,140,0.55)';
  ctx.fillText(text, bw / 2 + 2, h / 2 + 5);
  ctx.fillStyle = '#2b1606';
  ctx.fillText(text, bw / 2, h / 2 + 2);
  ctx.restore();
  return toTexture(c, { clamp: true });
}

/** A price, burnt into a little plank, for under each pickaxe on the wall. */
export function drawPriceTag(ctx, w, h, text, color = '#2b1606') {
  drawWood(ctx, w, h, { seed: 31, planks: 1, base: [178, 134, 86] });
  ctx.strokeStyle = 'rgba(40,22,8,0.85)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, w - 6, h - 6);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(h * 0.54)}px Georgia, "Times New Roman", serif`;
  ctx.fillStyle = 'rgba(240,200,150,0.5)';
  ctx.fillText(text, w / 2 + 1, h / 2 + 4);
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2 + 2);
}

/** A name or a level, as a little pill that floats over someone's head. */
export function tagCanvas(text, { fg = '#fff', bg = 'rgba(20,14,10,0.72)', border = 'rgba(255,220,170,0.6)', w = 256, h = 72 } = {}) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  drawTag(ctx, text, { fg, bg, border, w, h });
  return c;
}

export function drawTag(ctx, text, { fg = '#fff', bg = 'rgba(20,14,10,0.72)', border = 'rgba(255,220,170,0.6)', w = 256, h = 72 } = {}) {
  ctx.clearRect(0, 0, w, h);
  ctx.font = `800 ${Math.round(h * 0.52)}px "Trebuchet MS", system-ui, sans-serif`;
  const tw = Math.min(w - 8, ctx.measureText(text).width + h * 0.7);
  const x = (w - tw) / 2, y = h * 0.12, hh = h * 0.76;
  ctx.fillStyle = bg;
  ctx.strokeStyle = border;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, tw, hh, hh / 2) : ctx.rect(x, y, tw, hh);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
}

/* ---------------------------------- faces --------------------------------- */

/**
 * The front of a head. `kind` is 'smith' for you, 'rob' for Rob with his
 * beard, 'jack' for Jack, grey and scarred, 'skull' for the skeletons.
 */
export function faceTexture(kind, skin = '#e0ac7e') {
  const s = 128;
  const c = makeCanvas(s);
  const ctx = c.getContext('2d');
  if (kind === 'skull' || kind === 'skull-elite') {
    const elite = kind === 'skull-elite';
    ctx.fillStyle = elite ? '#cfc4ac' : '#e8e0cc';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(120,110,90,0.25)';
    ctx.fillRect(0, s * 0.8, s, s * 0.2);
    // sockets
    ctx.fillStyle = '#1b1410';
    for (const x of [s * 0.3, s * 0.7]) {
      ctx.beginPath(); ctx.ellipse(x, s * 0.42, s * 0.14, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    }
    // the red that lives in them - blue, in an elite's
    for (const x of [s * 0.3, s * 0.7]) {
      const g = ctx.createRadialGradient(x, s * 0.43, 0, x, s * 0.43, s * 0.08);
      if (elite) { g.addColorStop(0, 'rgba(120,210,255,1)'); g.addColorStop(1, 'rgba(40,140,255,0)'); }
      else { g.addColorStop(0, 'rgba(255,80,40,1)'); g.addColorStop(1, 'rgba(255,40,0,0)'); }
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, s * 0.43, s * 0.08, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#2a201a';
    ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.55); ctx.lineTo(s * 0.44, s * 0.66); ctx.lineTo(s * 0.56, s * 0.66); ctx.fill();
    // teeth
    ctx.fillStyle = '#2a201a';
    ctx.fillRect(s * 0.26, s * 0.76, s * 0.48, s * 0.11);
    ctx.fillStyle = '#f2ecdc';
    for (let i = 0; i < 6; i++) ctx.fillRect(s * 0.27 + i * s * 0.08, s * 0.765, s * 0.065, s * 0.09);
    return toTexture(c, { clamp: true });
  }
  ctx.fillStyle = skin;
  ctx.fillRect(0, 0, s, s);
  // eyes
  for (const x of [s * 0.32, s * 0.68]) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - s * 0.08, s * 0.4, s * 0.16, s * 0.11);
    ctx.fillStyle = kind === 'rob' ? '#3a6b8f' : kind === 'jack' ? '#5f7a74' : '#4a3020';
    ctx.fillRect(x - s * 0.035, s * 0.41, s * 0.07, s * 0.09);
    ctx.fillStyle = '#111';
    ctx.fillRect(x - s * 0.018, s * 0.43, s * 0.036, s * 0.05);
    // brows
    ctx.fillStyle = kind === 'rob' ? '#6b4a2a' : kind === 'jack' ? '#8d8a84' : '#3b2414';
    ctx.fillRect(x - s * 0.1, s * 0.32, s * 0.2, s * 0.045);
  }
  if (kind === 'jack') {
    // a short grey beard and moustache, and an old scar through one brow
    ctx.fillStyle = '#9a968e';
    ctx.beginPath();
    ctx.moveTo(s * 0.06, s * 0.62);
    ctx.lineTo(s * 0.26, s * 0.64); ctx.lineTo(s * 0.74, s * 0.64); ctx.lineTo(s * 0.94, s * 0.62);
    ctx.lineTo(s * 0.86, s); ctx.lineTo(s * 0.14, s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7d7972';
    ctx.fillRect(s * 0.3, s * 0.63, s * 0.4, s * 0.06);
    ctx.fillStyle = '#4a2a20';
    ctx.fillRect(s * 0.4, s * 0.76, s * 0.2, s * 0.04);
    ctx.fillStyle = 'rgba(150,70,60,0.55)';
    ctx.fillRect(s * 0.45, s * 0.5, s * 0.1, s * 0.08);
    ctx.strokeStyle = 'rgba(120,50,45,0.75)';
    ctx.lineWidth = s * 0.025;
    ctx.beginPath(); ctx.moveTo(s * 0.62, s * 0.27); ctx.lineTo(s * 0.74, s * 0.55); ctx.stroke();
  } else if (kind === 'rob') {
    // a big ginger beard and moustache
    ctx.fillStyle = '#a5582a';
    ctx.beginPath();
    ctx.moveTo(0, s * 0.56);
    ctx.lineTo(s * 0.2, s * 0.6); ctx.lineTo(s * 0.8, s * 0.6); ctx.lineTo(s, s * 0.56);
    ctx.lineTo(s, s); ctx.lineTo(0, s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8a4520';
    ctx.fillRect(s * 0.3, s * 0.6, s * 0.4, s * 0.07);
    ctx.fillStyle = '#5a2010';
    ctx.fillRect(s * 0.4, s * 0.72, s * 0.2, s * 0.05);
    // a bit of a nose
    ctx.fillStyle = 'rgba(160,80,60,0.6)';
    ctx.fillRect(s * 0.45, s * 0.5, s * 0.1, s * 0.08);
  } else {
    ctx.fillStyle = 'rgba(160,90,60,0.45)';
    ctx.fillRect(s * 0.46, s * 0.52, s * 0.08, s * 0.08);
    ctx.fillStyle = '#7a3524';
    ctx.fillRect(s * 0.38, s * 0.7, s * 0.24, s * 0.045);
    ctx.fillStyle = 'rgba(80,40,20,0.25)';
    ctx.fillRect(s * 0.36, s * 0.66, s * 0.28, s * 0.03);
  }
  return toTexture(c, { clamp: true });
}
