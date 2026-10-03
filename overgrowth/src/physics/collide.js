/* =============================================================================
   Box against box.

   Every collider in Overgrowth is an oriented box: each body part, every
   crate, every bat and sword, the green platform and the grey one. Two boxes
   are tested with the separating axis theorem over all fifteen axes, and the
   contact is then built from the actual geometry - every corner of one box
   that is inside the other becomes its own contact point, so a forearm lying
   across a chest rests on two corners rather than balancing on one, and an
   edge crossing an edge meets at the real closest points of the two edges.
   ========================================================================== */

/** Writes the three world axes of a rotation into m: m[0..2] = X, m[3..5] = Y, m[6..8] = Z. */
export function quatAxes(q, m) {
  const x = q.x, y = q.y, z = q.z, w = q.w;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  m[0] = 1 - (yy + zz); m[1] = xy + wz; m[2] = xz - wy;
  m[3] = xy - wz; m[4] = 1 - (xx + zz); m[5] = yz + wx;
  m[6] = xz + wy; m[7] = yz - wx; m[8] = 1 - (xx + yy);
}

/** A contact as the narrow phase reports it: a point on each box and the
    direction A has to move to leave B. */
export class ContactPoint {
  constructor() {
    this.ax = 0; this.ay = 0; this.az = 0;   // point on A, world
    this.bx = 0; this.by = 0; this.bz = 0;   // point on B, world
    this.nx = 0; this.ny = 1; this.nz = 0;   // normal, from B towards A
    this.depth = 0;
  }
}

const _R = new Float64Array(9);    // R[i*3+j] = Ai . Bj
const _AR = new Float64Array(9);
const _va = new Float64Array(24);
const _vb = new Float64Array(24);
const _cand = [];
for (let i = 0; i < 16; i++) _cand.push(new ContactPoint());

/** The eight corners of a box, packed x,y,z. */
function corners(c, m, e, out) {
  let k = 0;
  for (let i = -1; i <= 1; i += 2) {
    for (let j = -1; j <= 1; j += 2) {
      for (let l = -1; l <= 1; l += 2) {
        const a = i * e[0], b = j * e[1], d = l * e[2];
        out[k++] = c.x + m[0] * a + m[3] * b + m[6] * d;
        out[k++] = c.y + m[1] * a + m[4] * b + m[7] * d;
        out[k++] = c.z + m[2] * a + m[5] * b + m[8] * d;
      }
    }
  }
}

function inside(px, py, pz, c, m, e, tol) {
  const dx = px - c.x, dy = py - c.y, dz = pz - c.z;
  return Math.abs(dx * m[0] + dy * m[1] + dz * m[2]) <= e[0] + tol &&
         Math.abs(dx * m[3] + dy * m[4] + dz * m[5]) <= e[1] + tol &&
         Math.abs(dx * m[6] + dy * m[7] + dz * m[8]) <= e[2] + tol;
}

/** How far a box reaches along a unit direction. */
function radiusAlong(m, e, nx, ny, nz) {
  return e[0] * Math.abs(m[0] * nx + m[1] * ny + m[2] * nz) +
         e[1] * Math.abs(m[3] * nx + m[4] * ny + m[5] * nz) +
         e[2] * Math.abs(m[6] * nx + m[7] * ny + m[8] * nz);
}

const _ea = [0, 0, 0], _eb = [0, 0, 0];
const _sa = { x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, edge: false, cx: 0, cy: 0, cz: 0 };
const _sb = { x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, edge: false, cx: 0, cy: 0, cz: 0 };

/**
 * The feature of a box furthest along direction (dx,dy,dz): a corner, an edge
 * or a face. Writes the centre of it, and the two ends if it is an edge.
 */
function support(c, m, e, dx, dy, dz, out) {
  let free = 0, freeAxis = -1;
  let px = c.x, py = c.y, pz = c.z;
  for (let i = 0; i < 3; i++) {
    const ax = m[i * 3], ay = m[i * 3 + 1], az = m[i * 3 + 2];
    const d = ax * dx + ay * dy + az * dz;
    if (Math.abs(d) < 0.02) { free++; freeAxis = i; continue; }
    const s = d > 0 ? e[i] : -e[i];
    px += ax * s; py += ay * s; pz += az * s;
  }
  out.cx = px; out.cy = py; out.cz = pz;
  out.edge = free === 1;
  if (out.edge) {
    const i = freeAxis, s = e[i];
    const ax = m[i * 3], ay = m[i * 3 + 1], az = m[i * 3 + 2];
    out.x0 = px - ax * s; out.y0 = py - ay * s; out.z0 = pz - az * s;
    out.x1 = px + ax * s; out.y1 = py + ay * s; out.z1 = pz + az * s;
  }
}

const _cp = { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0 };
/** Closest points between segments p0-p1 and q0-q1. */
function segSeg(s, t, out) {
  const d1x = s.x1 - s.x0, d1y = s.y1 - s.y0, d1z = s.z1 - s.z0;
  const d2x = t.x1 - t.x0, d2y = t.y1 - t.y0, d2z = t.z1 - t.z0;
  const rx = s.x0 - t.x0, ry = s.y0 - t.y0, rz = s.z0 - t.z0;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let sc, tc;
  const c = d1x * rx + d1y * ry + d1z * rz;
  const b = d1x * d2x + d1y * d2y + d1z * d2z;
  const den = a * e - b * b;
  sc = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
  tc = (b * sc + f) / (e || 1);
  if (tc < 0) { tc = 0; sc = Math.min(1, Math.max(0, -c / (a || 1))); }
  else if (tc > 1) { tc = 1; sc = Math.min(1, Math.max(0, (b - c) / (a || 1))); }
  out.ax = s.x0 + d1x * sc; out.ay = s.y0 + d1y * sc; out.az = s.z0 + d1z * sc;
  out.bx = t.x0 + d2x * tc; out.by = t.y0 + d2y * tc; out.bz = t.z0 + d2z * tc;
}

/**
 * Is box A overlapping box B? Cheap yes/no, no contact points. Used for
 * strikes, where all that matters is whether the fist is inside the face.
 * Returns the overlap depth (> 0) or 0.
 */
export function boxOverlap(cA, mA, hA, cB, mB, hB) {
  return satAxis(cA, mA, hA, cB, mB, hB) ? _best.depth : 0;
}

const _best = { depth: 0, nx: 0, ny: 0, nz: 0 };

/** The separating axis test. Fills _best with the shallowest axis, normal from B to A. */
function satAxis(cA, mA, hA, cB, mB, hB) {
  _ea[0] = hA.x; _ea[1] = hA.y; _ea[2] = hA.z;
  _eb[0] = hB.x; _eb[1] = hB.y; _eb[2] = hB.z;
  const tx = cB.x - cA.x, ty = cB.y - cA.y, tz = cB.z - cA.z;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const r = mA[i * 3] * mB[j * 3] + mA[i * 3 + 1] * mB[j * 3 + 1] + mA[i * 3 + 2] * mB[j * 3 + 2];
      _R[i * 3 + j] = r;
      _AR[i * 3 + j] = Math.abs(r) + 1e-7;
    }
  }
  // T in A's frame
  const T0 = tx * mA[0] + ty * mA[1] + tz * mA[2];
  const T1 = tx * mA[3] + ty * mA[4] + tz * mA[5];
  const T2 = tx * mA[6] + ty * mA[7] + tz * mA[8];
  const T = [T0, T1, T2];

  let best = Infinity, bnx = 0, bny = 0, bnz = 0;

  // A's faces
  for (let i = 0; i < 3; i++) {
    const ra = _ea[i];
    const rb = _eb[0] * _AR[i * 3] + _eb[1] * _AR[i * 3 + 1] + _eb[2] * _AR[i * 3 + 2];
    const o = ra + rb - Math.abs(T[i]);
    if (o < 0) return false;
    if (o < best) {
      best = o;
      const s = T[i] > 0 ? -1 : 1;
      bnx = mA[i * 3] * s; bny = mA[i * 3 + 1] * s; bnz = mA[i * 3 + 2] * s;
    }
  }
  // B's faces
  for (let j = 0; j < 3; j++) {
    const ra = _ea[0] * _AR[j] + _ea[1] * _AR[3 + j] + _ea[2] * _AR[6 + j];
    const rb = _eb[j];
    const d = T0 * _R[j] + T1 * _R[3 + j] + T2 * _R[6 + j];
    const o = ra + rb - Math.abs(d);
    if (o < 0) return false;
    if (o < best) {
      best = o;
      const s = d > 0 ? -1 : 1;
      bnx = mB[j * 3] * s; bny = mB[j * 3 + 1] * s; bnz = mB[j * 3 + 2] * s;
    }
  }
  // edge cross edge. Only taken when clearly shallower than a face, because
  // a box resting on a face would otherwise flicker between the two.
  for (let i = 0; i < 3; i++) {
    const i1 = (i + 1) % 3, i2 = (i + 2) % 3;
    for (let j = 0; j < 3; j++) {
      const j1 = (j + 1) % 3, j2 = (j + 2) % 3;
      // world axis = Ai x Bj
      const ax = mA[i * 3], ay = mA[i * 3 + 1], az = mA[i * 3 + 2];
      const bx = mB[j * 3], by = mB[j * 3 + 1], bz = mB[j * 3 + 2];
      let lx = ay * bz - az * by, ly = az * bx - ax * bz, lz = ax * by - ay * bx;
      const len = Math.sqrt(lx * lx + ly * ly + lz * lz);
      if (len < 1e-4) continue;
      const ra = _ea[i1] * _AR[i2 * 3 + j] + _ea[i2] * _AR[i1 * 3 + j];
      const rb = _eb[j1] * _AR[i * 3 + j2] + _eb[j2] * _AR[i * 3 + j1];
      const d = T[i2] * _R[i1 * 3 + j] - T[i1] * _R[i2 * 3 + j];
      const o = (ra + rb - Math.abs(d)) / len;
      if (o < 0) return false;
      if (o * 1.08 + 0.002 < best) {
        best = o;
        lx /= len; ly /= len; lz /= len;
        const s = (lx * tx + ly * ty + lz * tz) > 0 ? -1 : 1;
        bnx = lx * s; bny = ly * s; bnz = lz * s;
      }
    }
  }
  _best.depth = best; _best.nx = bnx; _best.ny = bny; _best.nz = bnz;
  return true;
}

/**
 * Full contact between two boxes. Writes up to `max` ContactPoints into out
 * starting at out[0] and returns how many. Normal points from B to A.
 */
export function boxBox(cA, mA, hA, cB, mB, hB, out, max = 4) {
  if (!satAxis(cA, mA, hA, cB, mB, hB)) return 0;
  const nx = _best.nx, ny = _best.ny, nz = _best.nz, depth = _best.depth;
  let n = 0;
  const tol = 0.003;

  // corners of A inside B
  corners(cA, mA, _ea, _va);
  const rB = radiusAlong(mB, _eb, nx, ny, nz);
  const topB = cB.x * nx + cB.y * ny + cB.z * nz + rB;
  for (let k = 0; k < 24 && n < 16; k += 3) {
    const px = _va[k], py = _va[k + 1], pz = _va[k + 2];
    if (!inside(px, py, pz, cB, mB, _eb, tol)) continue;
    const d = topB - (px * nx + py * ny + pz * nz);
    if (d <= 0) continue;
    const c = _cand[n++];
    c.ax = px; c.ay = py; c.az = pz;
    c.bx = px + nx * d; c.by = py + ny * d; c.bz = pz + nz * d;
    c.nx = nx; c.ny = ny; c.nz = nz; c.depth = d;
  }
  // corners of B inside A
  corners(cB, mB, _eb, _vb);
  const rA = radiusAlong(mA, _ea, nx, ny, nz);
  const botA = cA.x * nx + cA.y * ny + cA.z * nz - rA;
  for (let k = 0; k < 24 && n < 16; k += 3) {
    const px = _vb[k], py = _vb[k + 1], pz = _vb[k + 2];
    if (!inside(px, py, pz, cA, mA, _ea, tol)) continue;
    const d = (px * nx + py * ny + pz * nz) - botA;
    if (d <= 0) continue;
    const c = _cand[n++];
    c.bx = px; c.by = py; c.bz = pz;
    c.ax = px - nx * d; c.ay = py - ny * d; c.az = pz - nz * d;
    c.nx = nx; c.ny = ny; c.nz = nz; c.depth = d;
  }

  if (n === 0) {
    // No corner inside either box: an edge across an edge, or a corner
    // grazing a face that the tolerance missed. Meet at the closest features.
    support(cA, mA, _ea, -nx, -ny, -nz, _sa);
    support(cB, mB, _eb, nx, ny, nz, _sb);
    const c = _cand[n++];
    if (_sa.edge && _sb.edge) {
      segSeg(_sa, _sb, _cp);
      c.ax = _cp.ax; c.ay = _cp.ay; c.az = _cp.az;
    } else {
      c.ax = _sa.cx; c.ay = _sa.cy; c.az = _sa.cz;
    }
    c.bx = c.ax + nx * depth; c.by = c.ay + ny * depth; c.bz = c.az + nz * depth;
    c.nx = nx; c.ny = ny; c.nz = nz; c.depth = depth;
  }

  // keep the deepest
  if (n > max) {
    for (let i = 1; i < n; i++) {
      const c = _cand[i];
      let j = i - 1;
      while (j >= 0 && _cand[j].depth < c.depth) { _cand[j + 1] = _cand[j]; j--; }
      _cand[j + 1] = c;
    }
    n = max;
  }
  for (let i = 0; i < n; i++) {
    const s = _cand[i], d = out[i];
    d.ax = s.ax; d.ay = s.ay; d.az = s.az; d.bx = s.bx; d.by = s.by; d.bz = s.bz;
    d.nx = s.nx; d.ny = s.ny; d.nz = s.nz; d.depth = s.depth;
  }
  return n;
}

/**
 * Box against the flat top of a slab at height `top`: every corner below it
 * is a contact, pushed straight up. Returns how many (deepest first, up to max).
 */
export function boxPlane(cA, mA, hA, top, out, max = 4) {
  _ea[0] = hA.x; _ea[1] = hA.y; _ea[2] = hA.z;
  corners(cA, mA, _ea, _va);
  let n = 0;
  for (let k = 0; k < 24; k += 3) {
    const y = _va[k + 1];
    if (y >= top) continue;
    const c = _cand[n++];
    c.ax = _va[k]; c.ay = y; c.az = _va[k + 2];
    c.bx = c.ax; c.by = top; c.bz = c.az;
    c.nx = 0; c.ny = 1; c.nz = 0; c.depth = top - y;
  }
  if (n > max) {
    for (let i = 1; i < n; i++) {
      const c = _cand[i];
      let j = i - 1;
      while (j >= 0 && _cand[j].depth < c.depth) { _cand[j + 1] = _cand[j]; j--; }
      _cand[j + 1] = c;
    }
    n = max;
  }
  for (let i = 0; i < n; i++) {
    const s = _cand[i], d = out[i];
    d.ax = s.ax; d.ay = s.ay; d.az = s.az; d.bx = s.bx; d.by = s.by; d.bz = s.bz;
    d.nx = 0; d.ny = 1; d.nz = 0; d.depth = s.depth;
  }
  return n;
}

/** The last overlap's normal (B to A) after boxOverlap. */
export function lastNormal(out) {
  out.x = _best.nx; out.y = _best.ny; out.z = _best.nz;
  return out;
}

/** Ray against box. Returns distance along the ray or -1. */
export function rayBox(ox, oy, oz, dx, dy, dz, c, m, h, maxT = Infinity) {
  // into box space
  const rx = ox - c.x, ry = oy - c.y, rz = oz - c.z;
  const e = [h.x, h.y, h.z];
  let tmin = 0, tmax = maxT;
  for (let i = 0; i < 3; i++) {
    const ax = m[i * 3], ay = m[i * 3 + 1], az = m[i * 3 + 2];
    const o = rx * ax + ry * ay + rz * az;
    const d = dx * ax + dy * ay + dz * az;
    if (Math.abs(d) < 1e-9) {
      if (o < -e[i] || o > e[i]) return -1;
    } else {
      let t1 = (-e[i] - o) / d, t2 = (e[i] - o) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

/** Point against box: is it inside? (with a margin) */
export function pointInBox(px, py, pz, c, m, h, margin = 0) {
  _eb[0] = h.x; _eb[1] = h.y; _eb[2] = h.z;
  return inside(px, py, pz, c, m, _eb, margin);
}
