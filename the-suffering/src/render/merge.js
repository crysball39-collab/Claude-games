/* Folds many small coloured shapes into one mesh, so a street lamp or a car
   costs one draw call instead of a dozen. */
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color();
const _nm = new THREE.Matrix3();

const _box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const _cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10).toNonIndexed();
const _plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).toNonIndexed();

export class Merger {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.uv = []; }

  /** Adds a transformed copy of a geometry, in one flat colour. */
  add(geo, x, y, z, sx, sy, sz, color, rx = 0, ry = 0, rz = 0, uvScale = null) {
    _e.set(rx, ry, rz); _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    _nm.getNormalMatrix(_m);
    _c.setHex(color);
    const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      _p.fromBufferAttribute(P, i).applyMatrix4(_m);
      this.pos.push(_p.x, _p.y, _p.z);
      _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize();
      this.nor.push(_n.x, _n.y, _n.z);
      this.col.push(_c.r, _c.g, _c.b);
      if (U) this.uv.push(U.getX(i) * (uvScale ? uvScale[0] : 1), U.getY(i) * (uvScale ? uvScale[1] : 1));
      else this.uv.push(0, 0);
    }
    return this;
  }
  box(x, y, z, sx, sy, sz, color, rx, ry, rz) { return this.add(_box, x, y, z, sx, sy, sz, color, rx, ry, rz); }
  /** A cylinder standing along Y: sx and sz are its diameter. */
  cyl(x, y, z, d, h, color, rx, ry, rz) { return this.add(_cyl, x, y, z, d, h, d, color, rx, ry, rz); }
  /** A flat rectangle facing up. */
  flat(x, y, z, w, d, color, ry = 0, uvScale = null) { return this.add(_plane, x, y, z, w, 1, d, color, 0, ry, 0, uvScale); }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

/** A box whose sides repeat a texture every `tile` metres. Top and bottom are plain. */
export function tiledBox(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // BoxGeometry lays its faces out in the order +x, -x, +y, -y, +z, -z, four vertices each
  const spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * spans[f][0] / tile, uv.getY(k) * spans[f][1] / tile);
    }
  }
  return g;
}
