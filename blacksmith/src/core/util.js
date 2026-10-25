/* =============================================================================
   Small helpers used all over Blacksmith.
   ========================================================================== */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOutCubic = (t) => {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const easeOutBack = (t) => {
  t = clamp01(t);
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

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

/** Mulberry32: a tiny seeded generator, so the world is laid out the same every time. */
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
  return rng;
}

/** Value noise on a grid, for textures and rough rock. */
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

export function fbm(noise, x, y, octaves = 4, gain = 0.5, lacunarity = 2) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= gain; freq *= lacunarity;
  }
  return sum / norm;
}

/**
 * Value noise that repeats exactly every `period` cells, so a texture built
 * from it tiles without a seam.
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

/* --------------------------------- misc ---------------------------------- */

export function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

/** Wait for the browser to actually paint before carrying on with a load step. */
export async function yieldToPaint() {
  await nextFrame();
  await nextFrame();
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

/** $1,234 */
export function money(n) {
  return '$' + Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Touch-first devices get the touch HUD and the portrait warning. */
export const IS_TOUCH = (typeof window !== 'undefined') &&
  ('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0);
