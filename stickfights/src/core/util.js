/* Small helpers used everywhere. */

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
export const easeOut = (t) => { t = clamp01(t); return 1 - (1 - t) * (1 - t); };
export const easeIn = (t) => { t = clamp01(t); return t * t; };
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;
export const sign = (v) => (v < 0 ? -1 : 1);

/** Wraps an angle to [-PI, PI). */
export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Interpolates two angles the short way round. */
export const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;

/** Exponential approach factor for a rate per second. */
export const approach = (rate, dt) => 1 - Math.exp(-rate * dt);

/** Moves v toward target by at most step. */
export function moveToward(v, target, step) {
  if (v < target) return Math.min(target, v + step);
  return Math.max(target, v - step);
}

/** Distance from point (px, py) to the segment (ax, ay)-(bx, by), and where along it. */
export function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 1e-12 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = clamp01(t);
  const cx = ax + dx * t, cy = ay + dy * t;
  return { d: Math.hypot(px - cx, py - cy), t, x: cx, y: cy };
}

/** Picks one entry, each weighted by w(entry). */
export function weighted(list, w) {
  let total = 0;
  for (const e of list) total += Math.max(0, w(e));
  if (total <= 0) return list.length ? list[0] : null;
  let r = Math.random() * total;
  for (const e of list) {
    r -= Math.max(0, w(e));
    if (r <= 0) return e;
  }
  return list[list.length - 1];
}

/** A small seeded generator, for things that should look the same twice. */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** A smooth wobble in [-1, 1] that never repeats exactly: three detuned sines. */
export function wobble(t, seed = 0) {
  return (Math.sin(t * 1.7 + seed) + Math.sin(t * 2.9 + seed * 1.3) * 0.6 + Math.sin(t * 4.3 + seed * 2.1) * 0.3) / 1.9;
}
