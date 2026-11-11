/* =============================================================================
   Every box in the game - body parts, hair, guns, gibs - is one instance of
   one mesh. A crowd is a single draw call, which is what makes this playable
   on a phone.
   ========================================================================== */
import * as THREE from 'three';

const _c = new THREE.Color();
const _cache = new Map();

/** A colour as the three numbers the renderer wants (linear, not sRGB). */
export function rgb(hex) {
  let v = _cache.get(hex);
  if (!v) { _c.setHex(hex); v = [_c.r, _c.g, _c.b]; _cache.set(hex, v); }
  return v;
}

export class Boxes {
  constructor(scene, capacity, material, { shadows = true } = {}) {
    this.capacity = capacity;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadows; this.mesh.receiveShadow = shadows;
    this.m = this.mesh.instanceMatrix.array;
    this.m.fill(0);
    const col = new Float32Array(capacity * 3).fill(1);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.c = col;
    this.count = 0;
    this.free = [];
    this.colorDirty = true;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  alloc() {
    if (this.free.length) return this.free.pop();
    if (this.count >= this.capacity) return -1;
    return this.count++;
  }
  release(i) {
    if (i < 0) return;
    this.hide(i);
    this.free.push(i);
  }
  hide(i) {
    if (i < 0) return;
    const o = i * 16;
    for (let k = 0; k < 16; k++) this.m[o + k] = 0;
  }
  color(i, r, g, b) {
    if (i < 0) return;
    const o = i * 3;
    this.c[o] = r; this.c[o + 1] = g; this.c[o + 2] = b;
    this.colorDirty = true;
  }
  colorHex(i, hex) { const v = rgb(hex); this.color(i, v[0], v[1], v[2]); }

  /** Position, rotation and full size of one box. */
  set(i, px, py, pz, qx, qy, qz, qw, sx, sy, sz) {
    if (i < 0) return;
    const m = this.m, o = i * 16;
    const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
    const xx = qx * x2, xy = qx * y2, xz = qx * z2, yy = qy * y2, yz = qy * z2, zz = qz * z2;
    const wx = qw * x2, wy = qw * y2, wz = qw * z2;
    m[o] = (1 - (yy + zz)) * sx; m[o + 1] = (xy + wz) * sx; m[o + 2] = (xz - wy) * sx; m[o + 3] = 0;
    m[o + 4] = (xy - wz) * sy; m[o + 5] = (1 - (xx + zz)) * sy; m[o + 6] = (yz + wx) * sy; m[o + 7] = 0;
    m[o + 8] = (xz + wy) * sz; m[o + 9] = (yz - wx) * sz; m[o + 10] = (1 - (xx + yy)) * sz; m[o + 11] = 0;
    m[o + 12] = px; m[o + 13] = py; m[o + 14] = pz; m[o + 15] = 1;
  }

  /**
   * A box riding on something else: (lx,ly,lz) is its centre in the parent's
   * own space. An optional local rotation turns it within that space.
   */
  setOn(i, px, py, pz, qx, qy, qz, qw, lx, ly, lz, sx, sy, sz, lq) {
    if (i < 0) return;
    const tx = 2 * (qy * lz - qz * ly), ty = 2 * (qz * lx - qx * lz), tz = 2 * (qx * ly - qy * lx);
    const wx = px + lx + qw * tx + (qy * tz - qz * ty);
    const wy = py + ly + qw * ty + (qz * tx - qx * tz);
    const wz = pz + lz + qw * tz + (qx * ty - qy * tx);
    if (lq) {
      const bx = lq[0], by = lq[1], bz = lq[2], bw = lq[3];
      this.set(i, wx, wy, wz,
        qw * bx + qx * bw + qy * bz - qz * by,
        qw * by - qx * bz + qy * bw + qz * bx,
        qw * bz + qx * by - qy * bx + qz * bw,
        qw * bw - qx * bx - qy * by - qz * bz, sx, sy, sz);
    } else this.set(i, wx, wy, wz, qx, qy, qz, qw, sx, sy, sz);
  }

  commit() {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.colorDirty) { this.mesh.instanceColor.needsUpdate = true; this.colorDirty = false; }
  }
}
