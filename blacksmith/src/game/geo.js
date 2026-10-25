/* =============================================================================
   Geometry helpers: baking static parts together, boxes that tile their
   texture, paths, and the lumpy low-poly rock everything stony is made of.
   ========================================================================== */
import {
  BufferGeometry, Float32BufferAttribute, BoxGeometry, IcosahedronGeometry,
  Mesh, Matrix3, Matrix4, Vector3,
} from 'three';
import { makeRng, valueNoise2D } from '../core/util.js';

/**
 * Bakes every plain static mesh directly under `group` into one mesh per
 * material. A phone pays for each thing it draws separately, not for how
 * many triangles there are, and a forge is a lot of separate planks.
 */
export function mergeStatic(group) {
  const buckets = new Map();
  for (const m of [...group.children]) {
    if (!m.isMesh || m.isInstancedMesh || m.userData.keep || m.children.length) continue;
    const mat = m.material;
    if (Array.isArray(mat) || mat.transparent) continue;
    const g = m.geometry;
    if (!g.attributes.position || !g.attributes.normal || !g.attributes.uv) continue;
    const key = mat.uuid + (m.castShadow ? 's' : '') + (m.receiveShadow ? 'r' : '') + (g.attributes.color ? 'c' : '');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(m);
  }
  const nm = new Matrix3();
  const v = new Vector3();
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const pos = [], nor = [], uv = [], col = [];
    const colored = !!list[0].geometry.attributes.color;
    for (const m of list) {
      m.updateMatrix();
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, c = g.attributes.color;
      nm.getNormalMatrix(m.matrix);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.matrix);
        pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
        nor.push(v.x, v.y, v.z);
        uv.push(u.getX(i), u.getY(i));
        if (colored) col.push(c.getX(i), c.getY(i), c.getZ(i));
      }
      if (g !== m.geometry) g.dispose();
      m.geometry.dispose();
      m.removeFromParent();
    }
    const merged = new BufferGeometry();
    merged.setAttribute('position', new Float32BufferAttribute(pos, 3));
    merged.setAttribute('normal', new Float32BufferAttribute(nor, 3));
    merged.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    if (colored) merged.setAttribute('color', new Float32BufferAttribute(col, 3));
    merged.computeBoundingSphere();
    const out = new Mesh(merged, list[0].material);
    out.castShadow = list[0].castShadow;
    out.receiveShadow = list[0].receiveShadow;
    group.add(out);
  }
}

/**
 * Takes a group of meshes that will never move apart - a bucket, a rack of
 * swords - and puts each mesh straight into `into` with its place baked into
 * its geometry, so mergeStatic can fold it in with everything else.
 */
export function flatten(group, into) {
  group.updateMatrixWorld(true);
  into.updateMatrixWorld(true);
  const toInto = new Matrix4().copy(into.matrixWorld).invert();
  const meshes = [];
  group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) {
    const g = m.geometry.clone();
    g.applyMatrix4(new Matrix4().multiplyMatrices(toInto, m.matrixWorld));
    const out = new Mesh(g, m.material);
    out.castShadow = m.castShadow;
    out.receiveShadow = m.receiveShadow;
    into.add(out);
    m.geometry.dispose();
  }
  group.removeFromParent();
}

/** A box whose texture repeats every `tile` metres instead of stretching. */
export function tiledBox(w, h, d, tile = 1) {
  const g = new BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
    }
  }
  return g;
}

/** A flat strip laid along a line of [x, z] points: a path. */
export function pathGeometry(points, width, y = 0.02, tile = 2.4) {
  const pos = [], uv = [], idx = [];
  let along = 0;
  for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i];
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const nx = -dz, nz = dx;
    if (i > 0) along += Math.hypot(x - points[i - 1][0], z - points[i - 1][1]);
    // a ragged edge reads as trodden earth, not a ribbon
    const wob = 1 + Math.sin(i * 2.3) * 0.08;
    pos.push(x + nx * width / 2 * wob, y, z + nz * width / 2 * wob, x - nx * width / 2 * wob, y, z - nz * width / 2 * wob);
    uv.push(0, along / tile, width / tile, along / tile);
    if (i > 0) {
      const k = i * 2;
      idx.push(k - 2, k, k - 1, k - 1, k, k + 1);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // whichever way the path was wound, its face points up
  const n = geo.attributes.normal;
  if (n.getY(0) < 0) {
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    geo.setIndex(idx);
    geo.computeVertexNormals();
  }
  return geo;
}

/** Smooths a polyline of [x, z] points by Catmull-Rom, so paths curve. */
export function smoothPath(points, perSegment = 6) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < perSegment; s++) {
      const t = s / perSegment, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/**
 * A lump of rock: an icosahedron pushed about by noise, flattened a little
 * and sat on its base, then shaded flat so every facet catches the light.
 */
export function rockGeometry(radius = 1, { seed = 1, detail = 1, squash = 0.72, rough = 0.28, flatBase = true } = {}) {
  const g = new IcosahedronGeometry(radius, detail);
  const noise = valueNoise2D(seed);
  const rng = makeRng(seed * 7 + 1);
  const ox = rng() * 50, oy = rng() * 50;
  const pos = g.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    const k = 1 + (noise(n.x * 2.2 + ox, n.y * 2.2 + n.z * 1.7 + oy) - 0.5) * 2 * rough;
    v.multiplyScalar(k);
    v.y *= squash;
    if (flatBase && v.y < -radius * squash * 0.35) v.y = -radius * squash * 0.35 + (v.y + radius * squash * 0.35) * 0.25;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  // The icosahedron already keeps a copy of each corner per face. Every copy
  // moved the same way, so the lump stays closed, and its normals come out
  // one per face: flat shaded.
  g.computeVertexNormals();
  g.computeBoundingBox();
  // stand it on the ground
  g.translate(0, -g.boundingBox.min.y, 0);
  g.computeBoundingSphere();
  return g;
}
