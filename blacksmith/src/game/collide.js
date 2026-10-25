/* =============================================================================
   Collision, in the plane. The ground is flat everywhere you can walk, so a
   person is a circle and everything solid is a circle or a turned box, and
   anything shaped otherwise - the cave's round walls - is a constraint
   function. The camera asks the same shapes what it would pass through.
   ========================================================================== */
import { clamp } from '../core/util.js';

export class Collider {
  constructor() {
    this.shapes = [];
    this.constraints = [];
  }

  /** A post, a tree, a rock. `h` is how tall it is, for the camera. */
  circle(x, z, r, { h = 3, data = null, camera = true } = {}) {
    const s = { type: 'c', x, z, r, h, data, camera, off: false };
    this.shapes.push(s);
    return s;
  }

  /** A wall, a table: half-sizes `hx`, `hz`, turned `ry` the way mesh.rotation.y turns. */
  box(x, z, hx, hz, { ry = 0, h = 3, data = null, camera = true } = {}) {
    const s = { type: 'b', x, z, hx, hz, h, data, camera, off: false, c: Math.cos(ry), s: Math.sin(ry) };
    this.shapes.push(s);
    return s;
  }

  remove(shape) {
    const i = this.shapes.indexOf(shape);
    if (i >= 0) this.shapes.splice(i, 1);
  }

  /** fn(p, r) moves p to where it is allowed to be and returns true if it moved it. */
  constrain(fn) { this.constraints.push(fn); }

  /** Pushes a circle at p (anything with x and z) out of everything solid. */
  resolve(p, r, skip = null) {
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const s of this.shapes) {
        if (s.off || s === skip) continue;
        if (s.type === 'c') {
          const dx = p.x - s.x, dz = p.z - s.z;
          const R = r + s.r;
          const d2 = dx * dx + dz * dz;
          if (d2 >= R * R) continue;
          const d = Math.sqrt(d2) || 1e-6;
          const push = R - d;
          p.x += (d2 > 1e-12 ? dx / d : 1) * push;
          p.z += (d2 > 1e-12 ? dz / d : 0) * push;
          moved = true;
        } else {
          const wx = p.x - s.x, wz = p.z - s.z;
          let lx = wx * s.c - wz * s.s;
          let lz = wx * s.s + wz * s.c;
          const cx = clamp(lx, -s.hx, s.hx), cz = clamp(lz, -s.hz, s.hz);
          const dx = lx - cx, dz = lz - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-10) {
            const d = Math.sqrt(d2);
            lx += (dx / d) * (r - d);
            lz += (dz / d) * (r - d);
          } else {
            // the centre is inside: out along whichever side is nearest
            const px = s.hx - Math.abs(lx) + r, pz = s.hz - Math.abs(lz) + r;
            if (px < pz) lx += Math.sign(lx || 1) * px; else lz += Math.sign(lz || 1) * pz;
          }
          p.x = s.x + lx * s.c + lz * s.s;
          p.z = s.z - lx * s.s + lz * s.c;
          moved = true;
        }
      }
      for (const fn of this.constraints) moved = fn(p, r) || moved;
      if (!moved) break;
    }
    return p;
  }

  /** Is the point (x, y, z) inside anything that blocks the camera? */
  blocksCamera(x, y, z, pad = 0.25) {
    for (const s of this.shapes) {
      if (s.off || !s.camera || y > s.h) continue;
      if (s.type === 'c') {
        const dx = x - s.x, dz = z - s.z, R = s.r + pad;
        if (dx * dx + dz * dz < R * R) return true;
      } else {
        const wx = x - s.x, wz = z - s.z;
        const lx = wx * s.c - wz * s.s, lz = wx * s.s + wz * s.c;
        if (Math.abs(lx) < s.hx + pad && Math.abs(lz) < s.hz + pad) return true;
      }
    }
    return false;
  }
}
