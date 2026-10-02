/* =============================================================================
   Procedural textures. Everything is generated at load time on a 2D canvas so
   the game ships without a single image file.
   ========================================================================== */
import {
  CanvasTexture, RepeatWrapping, ClampToEdgeWrapping, SRGBColorSpace,
  NearestFilter, LinearFilter, LinearMipmapLinearFilter,
} from 'three';
import { makeRng, valueNoise2D, fbm, clamp01, makeTileableNoise, tileableFbm } from '../core/util.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTexture(canvas, { repeat = 1, srgb = true, nearest = false } = {}) {
  const t = new CanvasTexture(canvas);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.magFilter = nearest ? NearestFilter : LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  return t;
}

/* --------------------------------- grass ---------------------------------- */

/** Grass colours. `red` is Plains as it is on the other side of the RCV2. */
const GRASS_PALETTES = {
  green: { base: [52, 100, 40], blade: [0.55, 1.25, 0.5], t: [62, 76, 42], dry: [40, -10, -6] },
  red: { base: [96, 20, 18], blade: [1.35, 0.32, 0.28], t: [88, 26, 18], dry: [34, 14, 4] },
};

export function makeGrassTexture(size = 512, seed = 7, palette = 'green') {
  const P = GRASS_PALETTES[palette] || GRASS_PALETTES.green;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const noise = makeTileableNoise(seed);
  const rng = makeRng(seed * 31 + 5);

  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // Two seamless layers: broad patches, and a fine blade-scale grain.
      const broad = tileableFbm(noise, u, v, 6, 3, 0.55);
      const fine = tileableFbm(noise, u + 0.37, v - 0.11, 26, 3, 0.6);
      const t = clamp01(broad * 0.34 + fine * 0.74 - 0.06);
      const dry = clamp01(tileableFbm(noise, u - 0.21, v + 0.44, 8, 2, 0.5) - 0.56) * 1.1;
      const i = (y * size + x) * 4;
      img.data[i] = P.base[0] + t * P.t[0] + dry * P.dry[0];
      img.data[i + 1] = P.base[1] + t * P.t[1] + dry * P.dry[1];
      img.data[i + 2] = P.base[2] + t * P.t[2] + dry * P.dry[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Blades, drawn wrapped so the edges of the tile still line up.
  const blade = (x, y) => {
    const h = 2 + rng() * 5;
    const shade = 40 + rng() * 120;
    ctx.strokeStyle = `rgba(${(shade * P.blade[0]) | 0},${(shade * P.blade[1]) | 0},${(shade * P.blade[2]) | 0},${0.24 + rng() * 0.36})`;
    ctx.lineWidth = 0.8 + rng() * 0.8;
    const dx = (rng() - 0.5) * 2.4;
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      ctx.beginPath();
      ctx.moveTo(x + ox, y + oy);
      ctx.lineTo(x + ox + dx, y + oy - h);
      ctx.stroke();
    }
  };
  for (let i = 0; i < size * 5; i++) blade(rng() * size, rng() * size);

  return { canvas: c, texture: toTexture(c, { repeat: 1 }) };
}

/* ---------------------------------- wood ---------------------------------- */

export function drawWood(ctx, w, h, seed = 3) {
  const noise = valueNoise2D(seed);
  const rng = makeRng(seed * 17 + 3);
  const planks = 4;
  const ph = h / planks;
  for (let p = 0; p < planks; p++) {
    const base = 118 + rng() * 34;
    ctx.fillStyle = `rgb(${(base * 1.36) | 0},${(base * 0.92) | 0},${(base * 0.50) | 0})`;
    ctx.fillRect(0, p * ph, w, ph);
    // grain
    for (let i = 0; i < 22; i++) {
      const y = p * ph + rng() * ph;
      ctx.strokeStyle = `rgba(70,44,18,${0.06 + rng() * 0.16})`;
      ctx.lineWidth = 0.6 + rng() * 1.6;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const yy = y + Math.sin(x * 0.06 + p) * 1.6 + (fbm(noise, x / 22, y / 9, 3) - 0.5) * 5;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    // plank seam
    ctx.fillStyle = 'rgba(38,22,8,0.62)';
    ctx.fillRect(0, p * ph, w, Math.max(1, h / 96));
  }
  // knots
  for (let i = 0; i < 3; i++) {
    const x = rng() * w, y = rng() * h, r = 2 + rng() * 5;
    ctx.strokeStyle = 'rgba(64,38,14,0.55)';
    for (let k = 0; k < 4; k++) {
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.ellipse(x, y, r + k * 1.6, (r + k * 1.6) * 0.7, rng(), 0, Math.PI * 2); ctx.stroke();
    }
  }
  // edge darkening reads as bevelled planks
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(0,0,0,0.22)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  g.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

export function makeWoodTexture(size = 256, seed = 3) {
  const c = makeCanvas(size, size);
  drawWood(c.getContext('2d'), size, size, seed);
  return { canvas: c, texture: toTexture(c) };
}

/* ---------------------------------- rock ---------------------------------- */

export function drawRock(ctx, w, h, seed = 11) {
  const noise = valueNoise2D(seed);
  const rng = makeRng(seed * 13 + 1);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm(noise, x / 14, y / 14, 5, 0.52, 2.2);
      const v = 96 + n * 92;
      const i = (y * w + x) * 4;
      img.data[i] = v * 1.02; img.data[i + 1] = v; img.data[i + 2] = v * 0.94; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // cracks
  for (let i = 0; i < 26; i++) {
    let x = rng() * w, y = rng() * h;
    ctx.strokeStyle = `rgba(38,36,32,${0.18 + rng() * 0.3})`;
    ctx.lineWidth = 0.7 + rng();
    ctx.beginPath(); ctx.moveTo(x, y);
    const steps = 5 + (rng() * 10) | 0;
    let a = rng() * Math.PI * 2;
    for (let s = 0; s < steps; s++) {
      a += (rng() - 0.5) * 1.1;
      x += Math.cos(a) * (3 + rng() * 8);
      y += Math.sin(a) * (3 + rng() * 8);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // speckles
  for (let i = 0; i < w * 3; i++) {
    const x = rng() * w, y = rng() * h;
    ctx.fillStyle = rng() < 0.5 ? 'rgba(220,220,214,0.16)' : 'rgba(30,28,26,0.18)';
    ctx.fillRect(x, y, 1 + rng(), 1 + rng());
  }
}

export function makeRockTexture(size = 256, seed = 11) {
  const c = makeCanvas(size, size);
  drawRock(c.getContext('2d'), size, size, seed);
  return { canvas: c, texture: toTexture(c) };
}

/* ---------------------------------- sky ----------------------------------- */

/** Sky gradients, zenith first. */
export const SKIES = {
  day: [[0.00, '#2f5f9e'], [0.34, '#5f92c8'], [0.62, '#9dc0dd'], [0.80, '#cfdce2'], [1.00, '#e3e0d2']],
  // Pit Valley: the same day, an hour before the light goes
  evening: [[0.00, '#2c4f86'], [0.30, '#5a83b8'], [0.58, '#a8b9c9'], [0.78, '#e2c79c'], [1.00, '#f1c88c']],
  // Dark Legacy: night with no moon, the fog lit from nowhere
  dark: [[0.00, '#050507'], [0.40, '#0e1015'], [0.70, '#1a1d24'], [0.88, '#252830'], [1.00, '#2c2f37']],
  // the other side of the red RCV2
  blood: [[0.00, '#2a0306'], [0.30, '#5c0a0e'], [0.58, '#a3181a'], [0.80, '#d8452a'], [1.00, '#f07a3c']],
};

export function makeSkyTexture(w = 32, h = 256, stops = SKIES.day) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [at, col] of stops) g.addColorStop(at, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  return t;
}

/* --------------------------------- stone ---------------------------------- */

/**
 * Dressed stone in courses, tileable, for the walls of a pit and the pillar
 * on the red platform. Every block gets its own tone, and the mortar sits
 * back in shadow, which is most of what makes a wall read as built rather
 * than painted.
 */
export function makeStoneTexture(size = 256, seed = 23, { tone = [128, 124, 116], courses = 4 } = {}) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const noise = makeTileableNoise(seed);
  const rng = makeRng(seed * 17 + 3);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = tileableFbm(noise, x / size, y / size, 10, 4, 0.55);
      const i = (y * size + x) * 4;
      const k = 0.72 + n * 0.5;
      img.data[i] = tone[0] * k; img.data[i + 1] = tone[1] * k; img.data[i + 2] = tone[2] * k;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const rowH = size / courses;
  for (let r = 0; r < courses; r++) {
    const y0 = r * rowH;
    const blocks = 2 + ((rng() * 2) | 0);
    const off = (r % 2) * (size / blocks / 2);
    for (let b = -1; b <= blocks; b++) {
      const x0 = b * (size / blocks) + off;
      const shade = (rng() - 0.5) * 0.22;
      ctx.fillStyle = shade > 0 ? `rgba(255,250,240,${shade})` : `rgba(10,8,6,${-shade})`;
      ctx.fillRect(x0 + 2, y0 + 2, size / blocks - 4, rowH - 4);
      // the mortar joint, in shadow, drawn wrapped so the tile still meets
      ctx.fillStyle = 'rgba(28,24,20,0.62)';
      for (const ox of [0, size, -size]) ctx.fillRect(x0 + ox - 1.5, y0, 3, rowH);
    }
    ctx.fillStyle = 'rgba(28,24,20,0.62)';
    ctx.fillRect(0, y0 - 1.5, size, 3);
    ctx.fillStyle = 'rgba(255,250,240,0.10)';
    ctx.fillRect(0, y0 + 1.5, size, 1.5);
  }
  return { canvas: c, texture: toTexture(c) };
}

/* ---------------------------------- dirt ---------------------------------- */

/** A walked path: packed earth with gravel pressed into it. Tileable. */
export function makePathTexture(size = 256, seed = 31) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const noise = makeTileableNoise(seed);
  const rng = makeRng(seed * 7 + 11);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const broad = tileableFbm(noise, x / size, y / size, 5, 3, 0.55);
      const fine = tileableFbm(noise, x / size + 0.3, y / size - 0.2, 24, 3, 0.6);
      const k = 0.62 + broad * 0.32 + fine * 0.26;
      const i = (y * size + x) * 4;
      img.data[i] = 128 * k; img.data[i + 1] = 104 * k; img.data[i + 2] = 76 * k;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < size * 2.2; i++) {
    const x = rng() * size, y = rng() * size, r = 0.6 + rng() * 1.8;
    const v = 120 + rng() * 90;
    ctx.fillStyle = `rgba(${v | 0},${(v * 0.96) | 0},${(v * 0.88) | 0},${0.5 + rng() * 0.4})`;
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      ctx.beginPath(); ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  return { canvas: c, texture: toTexture(c) };
}

/* ---------------------------------- water --------------------------------- */

/** Ripples for the pond: light caustic lines over a deep green-blue. */
export function makeWaterTexture(size = 256, seed = 41) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const noise = makeTileableNoise(seed);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = tileableFbm(noise, x / size, y / size, 6, 4, 0.5);
      // ridges where the noise crosses its middle: that is what caustics look like
      const ridge = 1 - Math.min(1, Math.abs(n - 0.5) * 9);
      const i = (y * size + x) * 4;
      img.data[i] = 34 + ridge * 120;
      img.data[i + 1] = 92 + ridge * 120;
      img.data[i + 2] = 104 + ridge * 100;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: c, texture: toTexture(c) };
}

export { makeCanvas, toTexture };
