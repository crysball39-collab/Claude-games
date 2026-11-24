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

/* ---------------------------------- lighter ---------------------------------- */

/*
 * A body in fewer characters still, for the many people of a shared city: the
 * pelvis to the centimetre, every other part to a centimetre and a half from
 * it, every turn to a degree or so (168 characters). `frame`, if given (a
 * THREE.Object3D: the car or helicopter they sit in), makes it a pose in that
 * frame, so that whoever puts it back puts it back in the same seat.
 */
const NL = 6 + PART_COUNT * 7, STEP = 0.015;
const i8 = (v) => (v > 127 ? 127 : v < -127 ? -127 : Math.round(v)) & 255;
const s8 = (u) => (u > 127 ? u - 256 : u);
const _lp = [0, 0, 0], _lq = [0, 0, 0, 1];

function toFrame(F, px, py, pz, qx, qy, qz, qw) {
  // the inverse of the frame's turn, applied to the offset from it, and to the part's own turn
  const fp = F.position, fq = F.quaternion, ax = -fq.x, ay = -fq.y, az = -fq.z, aw = fq.w;
  const x = px - fp.x, y = py - fp.y, z = pz - fp.z;
  const tx = 2 * (ay * z - az * y), ty = 2 * (az * x - ax * z), tz = 2 * (ax * y - ay * x);
  _lp[0] = x + aw * tx + (ay * tz - az * ty); _lp[1] = y + aw * ty + (az * tx - ax * tz); _lp[2] = z + aw * tz + (ax * ty - ay * tx);
  _lq[0] = aw * qx + ax * qw + ay * qz - az * qy; _lq[1] = aw * qy - ax * qz + ay * qw + az * qx;
  _lq[2] = aw * qz + ax * qy - ay * qx + az * qw; _lq[3] = aw * qw - ax * qx - ay * qy - az * qz;
}

export function encodeLite(h, frame = null) {
  const u = new Uint8Array(NL), dv = new DataView(u.buffer);
  const B = h.bodies, pose = new Float32Array(PART_COUNT * 7);
  for (let i = 0; i < PART_COUNT; i++) {
    const b = B[i], o = i * 7;
    if (frame) { toFrame(frame, b.px, b.py, b.pz, b.qx, b.qy, b.qz, b.qw); pose[o] = _lp[0]; pose[o + 1] = _lp[1]; pose[o + 2] = _lp[2]; pose[o + 3] = _lq[0]; pose[o + 4] = _lq[1]; pose[o + 5] = _lq[2]; pose[o + 6] = _lq[3]; }
    else { pose[o] = b.px; pose[o + 1] = b.py; pose[o + 2] = b.pz; pose[o + 3] = b.qx; pose[o + 4] = b.qy; pose[o + 5] = b.qz; pose[o + 6] = b.qw; }
  }
  const rx = q16(pose[0] * 100), ry = q16(pose[1] * 100), rz = q16(pose[2] * 100);
  dv.setInt16(0, rx, true); dv.setInt16(2, ry, true); dv.setInt16(4, rz, true);
  const ox = rx / 100, oy = ry / 100, oz = rz / 100;
  for (let i = 0; i < PART_COUNT; i++) {
    const o = i * 7, k = 6 + i * 7, s = pose[o + 6] < 0 ? -1 : 1;
    u[k] = i8((pose[o] - ox) / STEP); u[k + 1] = i8((pose[o + 1] - oy) / STEP); u[k + 2] = i8((pose[o + 2] - oz) / STEP);
    u[k + 3] = i8(pose[o + 3] * s * 127); u[k + 4] = i8(pose[o + 4] * s * 127); u[k + 5] = i8(pose[o + 5] * s * 127); u[k + 6] = i8(pose[o + 6] * s * 127);
  }
  let bin = '';
  for (let i = 0; i < NL; i++) bin += String.fromCharCode(u[i]);
  return btoa(bin);
}

/** Back again: 17 x (x, y, z, qx, qy, qz, qw), in the world or in the frame it was sent in; null if it is not one. */
export function decodeLite(s) {
  if (typeof s !== 'string' || s.length > 200) return null;
  let bin;
  try { bin = atob(s); } catch { return null; }
  if (bin.length !== NL) return null;
  const u = new Uint8Array(NL);
  for (let i = 0; i < NL; i++) u[i] = bin.charCodeAt(i);
  const dv = new DataView(u.buffer), out = new Float32Array(PART_COUNT * 7);
  const ox = dv.getInt16(0, true) / 100, oy = dv.getInt16(2, true) / 100, oz = dv.getInt16(4, true) / 100;
  for (let i = 0; i < PART_COUNT; i++) {
    const k = 6 + i * 7, o = i * 7;
    out[o] = ox + s8(u[k]) * STEP; out[o + 1] = oy + s8(u[k + 1]) * STEP; out[o + 2] = oz + s8(u[k + 2]) * STEP;
    let x = s8(u[k + 3]), y = s8(u[k + 4]), z = s8(u[k + 5]), w = s8(u[k + 6]);
    const l = Math.hypot(x, y, z, w);
    if (l < 20) { x = 0; y = 0; z = 0; w = 1; } else { x /= l; y /= l; z /= l; w /= l; }
    out[o + 3] = x; out[o + 4] = y; out[o + 5] = z; out[o + 6] = w;
  }
  return out;
}
