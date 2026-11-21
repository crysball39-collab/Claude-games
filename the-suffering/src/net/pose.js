/* =============================================================================
   A whole body in a few hundred characters: where each of its 17 parts is
   (to the centimetre) and which way it is turned, packed as 16-bit numbers
   and written out in base64, for sending to other players; and back again.
   ========================================================================== */
import { PART_COUNT } from '../human/rig.js';

const N = PART_COUNT * 7;
const q16 = (v) => (v > 32767 ? 32767 : v < -32768 ? -32768 : Math.round(v));

export function encodePose(h) {
  const a = new Int16Array(N);
  for (let i = 0; i < PART_COUNT; i++) {
    const b = h.bodies[i], o = i * 7, s = b.qw < 0 ? -1 : 1;
    a[o] = q16(b.px * 100); a[o + 1] = q16(b.py * 100); a[o + 2] = q16(b.pz * 100);
    a[o + 3] = q16(b.qx * s * 32767); a[o + 4] = q16(b.qy * s * 32767); a[o + 5] = q16(b.qz * s * 32767); a[o + 6] = q16(b.qw * s * 32767);
  }
  const u = new Uint8Array(a.buffer);
  let bin = '';
  for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
  return btoa(bin);
}

/** A pose from another player: a Float32Array of 17 x (x, y, z, qx, qy, qz, qw), or null if it is not one. */
export function decodePose(s) {
  if (typeof s !== 'string' || s.length > 400) return null;
  let bin;
  try { bin = atob(s); } catch { return null; }
  if (bin.length !== N * 2) return null;
  const u = new Uint8Array(N * 2);
  for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(i);
  const a = new Int16Array(u.buffer), out = new Float32Array(N);
  for (let i = 0; i < PART_COUNT; i++) {
    const o = i * 7;
    out[o] = a[o] / 100; out[o + 1] = a[o + 1] / 100; out[o + 2] = a[o + 2] / 100;
    let x = a[o + 3], y = a[o + 4], z = a[o + 5], w = a[o + 6];
    const l = Math.hypot(x, y, z, w) || 1;
    if (l < 1000) { x = 0; y = 0; z = 0; w = 1; } else { x /= l; y /= l; z /= l; w /= l; }
    out[o + 3] = x; out[o + 4] = y; out[o + 5] = z; out[o + 6] = w;
  }
  return out;
}

/** Puts a body's parts between two poses (`k` of the way from a to b), as kinematic parts that know how fast they moved. */
export function poseBetween(h, a, b, k, dt) {
  for (let i = 0; i < PART_COUNT; i++) {
    if (!h.attached[i] || h.gone[i]) continue;
    const o = i * 7;
    const px = a[o] + (b[o] - a[o]) * k, py = a[o + 1] + (b[o + 1] - a[o + 1]) * k, pz = a[o + 2] + (b[o + 2] - a[o + 2]) * k;
    let bx = b[o + 3], by = b[o + 4], bz = b[o + 5], bw = b[o + 6];
    const ax = a[o + 3], ay = a[o + 4], az = a[o + 5], aw = a[o + 6];
    if (ax * bx + ay * by + az * bz + aw * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; }
    let qx = ax + (bx - ax) * k, qy = ay + (by - ay) * k, qz = az + (bz - az) * k, qw = aw + (bw - aw) * k;
    const l = Math.hypot(qx, qy, qz, qw) || 1;
    qx /= l; qy /= l; qz /= l; qw /= l;
    const body = h.bodies[i];
    if (!body.kinematic) body.setKinematic(true);
    body.setPose(px, py, pz, qx, qy, qz, qw, dt);
  }
}
