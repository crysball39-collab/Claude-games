// Broadphase grid + capsule-vs-world resolution + analytic raycasting.
// Every solid in the world registers a collider here; nothing uses THREE.Raycaster
// so bullets, the pickaxe and footsteps all agree on what is solid.

const CELL = 12;

let NEXT_ID = 1;

export class Collider {
  constructor(kind) {
    this.id = NEXT_ID++;
    this.kind = kind;        // 'box' | 'cyl'
    this.solid = true;       // doors flip this off when opened
    this.tag = null;         // 'wood' | 'stone' | 'build' | null
    this.owner = null;       // back-reference (prop, door, build piece)
    this.cells = [];
  }
}

export class BoxCollider extends Collider {
  constructor(minx, miny, minz, maxx, maxy, maxz) {
    super('box');
    this.minx = minx; this.miny = miny; this.minz = minz;
    this.maxx = maxx; this.maxy = maxy; this.maxz = maxz;
  }
  get top() { return this.maxy; }
}

export class CylCollider extends Collider {
  constructor(x, z, r, y0, y1) {
    super('cyl');
    this.x = x; this.z = z; this.r = r; this.y0 = y0; this.y1 = y1;
    this.minx = x - r; this.maxx = x + r;
    this.minz = z - r; this.maxz = z + r;
    this.miny = y0; this.maxy = y1;
  }
  get top() { return this.y1; }
}

export class Physics {
  constructor(heightAt) {
    this.heightAt = heightAt;
    this.voids = [];      // regions where terrain is ignored below yTop (the lab)
    this.grid = new Map();
    this.all = new Set();
    this._scratch = new Set();
  }

  key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }

  /** Carve out a volume where the terrain heightfield does not apply. */
  addVoid(x0, z0, x1, z1, yTop) { this.voids.push({ x0, z0, x1, z1, yTop }); }

  /** Terrain height, honouring carved-out volumes. */
  groundHeight(x, z, y) {
    for (let i = 0; i < this.voids.length; i++) {
      const v = this.voids[i];
      if (y < v.yTop && x > v.x0 && x < v.x1 && z > v.z0 && z < v.z1) return -1000;
    }
    return this.heightAt(x, z);
  }

  _insert(c) {
    const x0 = Math.floor(c.minx / CELL), x1 = Math.floor(c.maxx / CELL);
    const z0 = Math.floor(c.minz / CELL), z1 = Math.floor(c.maxz / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = this.key(cx, cz);
        let list = this.grid.get(k);
        if (!list) { list = []; this.grid.set(k, list); }
        list.push(c);
        c.cells.push(k);
      }
    }
  }

  addBox(minx, miny, minz, maxx, maxy, maxz, opts = {}) {
    const c = new BoxCollider(minx, miny, minz, maxx, maxy, maxz);
    Object.assign(c, opts);
    this.all.add(c); this._insert(c);
    return c;
  }

  /** Convenience: box from centre + size. */
  addBoxCS(cx, cy, cz, sx, sy, sz, opts = {}) {
    return this.addBox(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, opts);
  }

  addCyl(x, z, r, y0, y1, opts = {}) {
    const c = new CylCollider(x, z, r, y0, y1);
    Object.assign(c, opts);
    this.all.add(c); this._insert(c);
    return c;
  }

  remove(c) {
    if (!this.all.has(c)) return;
    this.all.delete(c);
    for (const k of c.cells) {
      const list = this.grid.get(k);
      if (!list) continue;
      const i = list.indexOf(c);
      if (i >= 0) list.splice(i, 1);
    }
    c.cells.length = 0;
  }

  /** All colliders whose AABB may overlap the given XZ rectangle. */
  query(minx, minz, maxx, maxz, out = []) {
    out.length = 0;
    const seen = this._scratch; seen.clear();
    const x0 = Math.floor(minx / CELL), x1 = Math.floor(maxx / CELL);
    const z0 = Math.floor(minz / CELL), z1 = Math.floor(maxz / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const list = this.grid.get(this.key(cx, cz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          if (seen.has(c.id)) continue;
          if (c.maxx < minx || c.minx > maxx || c.maxz < minz || c.minz > maxz) continue;
          seen.add(c.id);
          out.push(c);
        }
      }
    }
    return out;
  }

  /** Horizontal overlap between a circle and a collider footprint. */
  _overlapXZ(c, x, z, r) {
    if (c.kind === 'box') {
      const nx = Math.max(c.minx, Math.min(x, c.maxx));
      const nz = Math.max(c.minz, Math.min(z, c.maxz));
      const dx = x - nx, dz = z - nz;
      return dx * dx + dz * dz < r * r;
    }
    const dx = x - c.x, dz = z - c.z, rr = r + c.r;
    return dx * dx + dz * dz < rr * rr;
  }

  /**
   * Move an actor (vertical capsule) through the world.
   * actor: { pos:{x,y,z}, vel:{x,y,z}, radius, height, grounded, stepUp }
   * pos.y is the feet position.
   */
  moveActor(a, dt) {
    const r = a.radius, h = a.height, step = a.stepUp ?? 0.62;
    const cand = this.query(a.pos.x - r - 2.5, a.pos.z - r - 2.5, a.pos.x + r + 2.5, a.pos.z + r + 2.5);

    // --- horizontal, axis at a time so sliding along walls feels right ---
    const tryAxis = (axis, amount) => {
      if (amount === 0) return;
      const oldV = a.pos[axis];
      a.pos[axis] = oldV + amount;
      const feet = a.pos.y, headY = a.pos.y + h;
      for (const c of cand) {
        if (!c.solid) continue;
        if (c.maxy <= feet + step || c.miny >= headY) continue; // walk over / duck under
        if (!this._overlapXZ(c, a.pos.x, a.pos.z, r)) continue;
        a.pos[axis] = oldV;
        a.vel[axis] *= 0.0;
        return;
      }
    };
    tryAxis('x', a.vel.x * dt);
    tryAxis('z', a.vel.z * dt);

    // --- vertical ---
    const prevY = a.pos.y;
    a.pos.y += a.vel.y * dt;

    let ground = this.groundHeight(a.pos.x, a.pos.z, a.pos.y);
    let groundCollider = null;
    const near = this.query(a.pos.x - r, a.pos.z - r, a.pos.x + r, a.pos.z + r);
    for (const c of near) {
      if (!c.solid) continue;
      if (!this._overlapXZ(c, a.pos.x, a.pos.z, r)) continue;
      // surface we can land on / stand on
      if (c.maxy > ground && c.maxy <= prevY + step + 0.02) {
        ground = c.maxy; groundCollider = c;
      }
    }
    // ceiling
    for (const c of near) {
      if (!c.solid) continue;
      if (!this._overlapXZ(c, a.pos.x, a.pos.z, r)) continue;
      if (c.miny >= a.pos.y + h - 0.05 && c.miny < prevY + h + 0.6 && a.vel.y > 0) {
        a.pos.y = Math.min(a.pos.y, c.miny - h);
        a.vel.y = Math.min(a.vel.y, 0);
      }
    }

    if (a.pos.y <= ground) {
      a.pos.y = ground;
      if (a.vel.y < 0) {
        a.fallSpeed = -a.vel.y;
        a.vel.y = 0;
      }
      a.grounded = true;
      a.groundCollider = groundCollider;
    } else {
      a.grounded = false;
      a.groundCollider = null;
    }
    return a.grounded;
  }

  /** Highest walkable surface under a point (terrain or structure). */
  floorAt(x, z, fromY = 1e4, radius = 0.3) {
    let ground = this.groundHeight(x, z, fromY);
    const near = this.query(x - radius, z - radius, x + radius, z + radius);
    for (const c of near) {
      if (!c.solid) continue;
      if (!this._overlapXZ(c, x, z, radius)) continue;
      if (c.maxy > ground && c.maxy <= fromY + 0.05) ground = c.maxy;
    }
    return ground;
  }

  // --- raycasting ---------------------------------------------------------

  _rayBox(ox, oy, oz, dx, dy, dz, c, maxT) {
    let t0 = 0, t1 = maxT;
    const lo = [c.minx, c.miny, c.minz], hi = [c.maxx, c.maxy, c.maxz];
    const o = [ox, oy, oz], d = [dx, dy, dz];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-8) {
        if (o[i] < lo[i] || o[i] > hi[i]) return -1;
      } else {
        const inv = 1 / d[i];
        let a = (lo[i] - o[i]) * inv, b = (hi[i] - o[i]) * inv;
        if (a > b) { const tmp = a; a = b; b = tmp; }
        if (a > t0) t0 = a;
        if (b < t1) t1 = b;
        if (t0 > t1) return -1;
      }
    }
    return t0;
  }

  _rayCyl(ox, oy, oz, dx, dy, dz, c, maxT) {
    const px = ox - c.x, pz = oz - c.z;
    const a = dx * dx + dz * dz;
    if (a < 1e-9) return -1;
    const b = 2 * (px * dx + pz * dz);
    const cc = px * px + pz * pz - c.r * c.r;
    const disc = b * b - 4 * a * cc;
    if (disc < 0) return -1;
    const sq = Math.sqrt(disc);
    let t = (-b - sq) / (2 * a);
    if (t < 0) t = (-b + sq) / (2 * a);
    if (t < 0 || t > maxT) return -1;
    const y = oy + dy * t;
    if (y < c.y0 || y > c.y1) return -1;
    return t;
  }

  /**
   * Cast a ray against colliders + terrain.
   * Returns { t, point:{x,y,z}, collider, terrain } or null.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxT = 200, filter = null) {
    let best = maxT, hit = null;
    const minx = Math.min(ox, ox + dx * maxT), maxx = Math.max(ox, ox + dx * maxT);
    const minz = Math.min(oz, oz + dz * maxT), maxz = Math.max(oz, oz + dz * maxT);
    const cand = this.query(minx - 1, minz - 1, maxx + 1, maxz + 1);
    for (const c of cand) {
      if (!c.solid) continue;
      if (filter && !filter(c)) continue;
      const t = c.kind === 'box'
        ? this._rayBox(ox, oy, oz, dx, dy, dz, c, best)
        : this._rayCyl(ox, oy, oz, dx, dy, dz, c, best);
      if (t >= 0 && t < best) { best = t; hit = c; }
    }
    // terrain march
    const stepLen = 1.0;
    let prevAbove = oy - this.groundHeight(ox, oz, oy);
    for (let t = stepLen; t <= Math.min(best, maxT); t += stepLen) {
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      const above = y - this.groundHeight(x, z, y);
      if (above <= 0) {
        const frac = prevAbove / (prevAbove - above || 1);
        const tt = t - stepLen + stepLen * frac;
        if (tt < best) {
          return { t: tt, point: { x: ox + dx * tt, y: oy + dy * tt, z: oz + dz * tt }, collider: null, terrain: true };
        }
        break;
      }
      prevAbove = above;
    }
    if (!hit) return null;
    return { t: best, point: { x: ox + dx * best, y: oy + dy * best, z: oz + dz * best }, collider: hit, terrain: false };
  }

  /** True when nothing solid blocks the segment (used by AI line-of-sight). */
  lineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.001) return true;
    const h = this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len - 0.35);
    return !h;
  }
}
