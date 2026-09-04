/* =============================================================================
   Small math / helper toolbox used across GOREBOX.
   ========================================================================== */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
export const smootherstep = (t) => { t = clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10); };
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOutSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));

/** Frame-rate independent exponential approach. */
export function damp(current, target, lambda, dt) {
  return lerp(target, current, Math.exp(-lambda * dt));
}

/** Shortest signed difference between two angles. */
export function angleDelta(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function dampAngle(current, target, lambda, dt) {
  return current + angleDelta(current, target) * (1 - Math.exp(-lambda * dt));
}

export function moveTowards(current, target, maxDelta) {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

/* ------------------------------- randomness ------------------------------ */

/** Mulberry32 - tiny deterministic PRNG so citizens can be reproducible. */
export function makeRng(seed = (Math.random() * 4294967296) >>> 0) {
  let a = seed >>> 0;
  const rng = function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + rng() * (hi - lo);
  rng.int = (lo, hi) => Math.floor(lo + rng() * (hi - lo + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length) % arr.length];
  rng.chance = (p) => rng() < p;
  rng.sign = () => (rng() < 0.5 ? -1 : 1);
  rng.gauss = () => {
    // Irwin-Hall approximation, plenty good for jitter.
    return (rng() + rng() + rng() + rng() - 2) * 0.8660254;
  };
  return rng;
}

export const rand = makeRng();

/* --------------------------------- misc ---------------------------------- */

export function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

export function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Wait for the browser to actually paint before continuing a load step. */
export async function yieldToPaint() {
  await nextFrame();
  await nextFrame();
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

/** Hex/rgb helpers working on plain {r,g,b} 0..1 objects. */
export function hslToRgb(h, s, l) {
  h = ((h % 1) + 1) % 1;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
  };
  return { r: f(0), g: f(8), b: f(4) };
}

export function rgbToCss({ r, g, b }, alpha = 1) {
  const c = (v) => Math.round(clamp01(v) * 255);
  return alpha >= 1 ? `rgb(${c(r)},${c(g)},${c(b)})` : `rgba(${c(r)},${c(g)},${c(b)},${alpha})`;
}

export function rgbToHex({ r, g, b }) {
  const c = (v) => Math.round(clamp01(v) * 255);
  return (c(r) << 16) | (c(g) << 8) | c(b);
}

export function shade({ r, g, b }, k) {
  return { r: clamp01(r * k), g: clamp01(g * k), b: clamp01(b * k) };
}

export function mixRgb(a, b, t) {
  return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
}

/** Cheap value noise on a 2D grid; used for grass, wood and rock textures. */
export function valueNoise2D(seed = 1) {
  const rng = makeRng(seed);
  const size = 256;
  const table = new Float32Array(size * size);
  for (let i = 0; i < table.length; i++) table[i] = rng();
  const at = (x, y) => table[((y & 255) * size + (x & 255))];
  return function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
}

/**
 * Value noise that repeats exactly every `period` cells, so a texture built
 * from it tiles without a seam. Each octave gets its own period, which is what
 * keeps the whole stack seamless rather than just the first layer.
 */
export function makeTileableNoise(seed = 1) {
  const rng = makeRng(seed);
  const N = 256;
  const table = new Float32Array(N * N);
  for (let i = 0; i < table.length; i++) table[i] = rng();
  const wrap = (v, p) => ((v % p) + p) % p;
  const at = (x, y, p) => table[wrap(y, p) * N + wrap(x, p)];
  return function noise(x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi, period), b = at(xi + 1, yi, period);
    const c = at(xi, yi + 1, period), d = at(xi + 1, yi + 1, period);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
}

/** Seamless fbm over the unit square. `cells` is the base period. */
export function tileableFbm(noise, u, v, cells = 4, octaves = 4, gain = 0.55) {
  let sum = 0, norm = 0, amp = 1, p = cells;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(u * p, v * p, p);
    norm += amp;
    amp *= gain;
    p *= 2;
    if (p > 256) break;
  }
  return sum / norm;
}

export function fbm(noise, x, y, octaves = 4, gain = 0.5, lacunarity = 2) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= gain; freq *= lacunarity;
  }
  return sum / norm;
}

/** Detects touch-first devices so the HUD can adapt. */
export const IS_TOUCH = (typeof window !== 'undefined') &&
  ('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0);

export const IS_MOBILE = IS_TOUCH && Math.min(screen.width, screen.height) < 900;
