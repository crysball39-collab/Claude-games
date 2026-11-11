/* =============================================================================
   A batch of textured quads in one draw call: blood on the road, wounds on a
   body, faces. Each quad is four corners the game places itself, a rectangle
   of a texture atlas, and a tint.
   ========================================================================== */
import * as THREE from 'three';

export class Quads {
  constructor(scene, capacity, texture, o = {}) {
    this.capacity = capacity;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(capacity * 12);
    this.uv = new Float32Array(capacity * 8);
    this.col = new Float32Array(capacity * 16).fill(1);
    const idx = new (capacity * 4 > 65535 ? Uint32Array : Uint16Array)(capacity * 6);
    for (let i = 0; i < capacity; i++) {
      const v = i * 4, k = i * 6;
      idx[k] = v; idx[k + 1] = v + 1; idx[k + 2] = v + 2; idx[k + 3] = v; idx[k + 4] = v + 2; idx[k + 5] = v + 3;
    }
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aUv = new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('uv', this.aUv);
    geo.setAttribute('color', this.aCol);
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.material = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, depthWrite: false, vertexColors: true,
      side: o.doubleSide === false ? THREE.FrontSide : THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: o.offset ?? -3, polygonOffsetUnits: o.offset ?? -3,
      alphaTest: o.alphaTest ?? 0.02, fog: true,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = o.renderOrder ?? 2;
    this.geo = geo;
    this.count = 0;
    this.free = [];
    this.dPos = false; this.dUv = false; this.dCol = false;
    geo.setDrawRange(0, 0);
    scene.add(this.mesh);
  }

  alloc() {
    if (this.free.length) return this.free.pop();
    if (this.count >= this.capacity) return -1;
    return this.count++;
  }
  release(i) {
    if (i < 0) return;
    this.pos.fill(0, i * 12, i * 12 + 12);
    this.dPos = true;
    this.free.push(i);
  }
  hide(i) { if (i >= 0) { this.pos.fill(0, i * 12, i * 12 + 12); this.dPos = true; } }

  corners(i, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz) {
    if (i < 0) return;
    const p = this.pos, o = i * 12;
    p[o] = ax; p[o + 1] = ay; p[o + 2] = az; p[o + 3] = bx; p[o + 4] = by; p[o + 5] = bz;
    p[o + 6] = cx; p[o + 7] = cy; p[o + 8] = cz; p[o + 9] = dx; p[o + 10] = dy; p[o + 11] = dz;
    this.dPos = true;
  }
  /** A flat quad lying on the ground (or any horizontal plane), turned by `rot`. */
  flat(i, x, y, z, w, d, rot) {
    const c = Math.cos(rot), s = Math.sin(rot), hw = w * 0.5, hd = d * 0.5;
    const ux = c * hw, uz = s * hw, vx = -s * hd, vz = c * hd;
    this.corners(i, x - ux - vx, y, z - uz - vz, x + ux - vx, y, z + uz - vz, x + ux + vx, y, z + uz + vz, x - ux + vx, y, z - uz + vz);
  }
  /** Atlas rectangle, corners in the same order as `corners`. */
  uvRect(i, u0, v0, u1, v1) {
    if (i < 0) return;
    const t = this.uv, o = i * 8;
    t[o] = u0; t[o + 1] = v0; t[o + 2] = u1; t[o + 3] = v0; t[o + 4] = u1; t[o + 5] = v1; t[o + 6] = u0; t[o + 7] = v1;
    this.dUv = true;
  }
  tint(i, r, g, b, a) {
    if (i < 0) return;
    const c = this.col, o = i * 16;
    for (let k = 0; k < 16; k += 4) { c[o + k] = r; c[o + k + 1] = g; c[o + k + 2] = b; c[o + k + 3] = a; }
    this.dCol = true;
  }
  alpha(i, a) {
    if (i < 0) return;
    const c = this.col, o = i * 16;
    c[o + 3] = a; c[o + 7] = a; c[o + 11] = a; c[o + 15] = a;
    this.dCol = true;
  }

  commit() {
    this.geo.setDrawRange(0, this.count * 6);
    if (this.dPos) { this.aPos.needsUpdate = true; this.dPos = false; }
    if (this.dUv) { this.aUv.needsUpdate = true; this.dUv = false; }
    if (this.dCol) { this.aCol.needsUpdate = true; this.dCol = false; }
  }
}

/** The rectangle of cell (cx, cy) in an atlas of `cols` by `rows`, inset a hair. */
export function cellUV(cx, cy, cols, rows, pad = 0.004) {
  return [cx / cols + pad, 1 - (cy + 1) / rows + pad, (cx + 1) / cols - pad, 1 - cy / rows - pad];
}
