/* =============================================================================
   Procedural textures. Everything is generated at load time on a 2D canvas so
   the game ships without a single image file.
   ========================================================================== */
import {
  CanvasTexture, RepeatWrapping, ClampToEdgeWrapping, SRGBColorSpace,
  NearestFilter, LinearFilter, LinearMipmapLinearFilter,
} from 'three';
import { makeRng, valueNoise2D, fbm, clamp01 } from '../core/util.js';

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

export function makeGrassTexture(size = 512, seed = 7) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const noise = valueNoise2D(seed);
  const rng = makeRng(seed * 31 + 5);

  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(noise, x / 26, y / 26, 4, 0.55, 2.1);
      const m = fbm(noise, x / 5.5 + 40, y / 5.5 - 20, 2, 0.6, 2);
      const t = clamp01(n * 0.72 + m * 0.42 - 0.08);
      const r = 46 + t * 74;
      const g = 92 + t * 96;
      const b = 38 + t * 52;
      const i = (y * size + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Scatter blades and a few dirt patches so it does not read as flat noise.
  for (let i = 0; i < size * 5; i++) {
    const x = rng() * size, y = rng() * size;
    const h = 2 + rng() * 5;
    const shade = 40 + rng() * 120;
    ctx.strokeStyle = `rgba(${(shade * 0.55) | 0},${(shade * 1.25) | 0},${(shade * 0.5) | 0},${0.28 + rng() * 0.4})`;
    ctx.lineWidth = 0.8 + rng() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 2.4, y - h);
    ctx.stroke();
  }
  for (let i = 0; i < 26; i++) {
    const x = rng() * size, y = rng() * size, r = 8 + rng() * 34;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(108,92,58,${0.10 + rng() * 0.16})`);
    g.addColorStop(1, 'rgba(108,92,58,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
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

export function makeSkyTexture(w = 32, h = 256) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0.00, '#2f5f9e');
  g.addColorStop(0.34, '#5f92c8');
  g.addColorStop(0.62, '#9dc0dd');
  g.addColorStop(0.80, '#cfdce2');
  g.addColorStop(1.00, '#e3e0d2');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  return t;
}

export { makeCanvas, toTexture };
