/* =============================================================================
   Blood.

   Every drop is simulated: it leaves a wound with the speed of the blow,
   arcs under gravity, and paints itself onto the first thing it touches -
   the ground, the grey platform, another fighter, a crate, the sword in
   someone's hand. Blows leave blood on whatever delivered them, too: the
   knuckles that landed, the barrel of the bat, the blade. Open wounds keep
   dripping, run down the body they are on, and the dead leave pools.
   ========================================================================== */
import {
  InstancedMesh, BoxGeometry, MeshLambertMaterial, Object3D, Vector3, Quaternion, DynamicDrawUsage,
} from 'three';
import { PARTS, NP, P } from './rig.js';
import { pointInBox } from '../physics/collide.js';
import { rand, chance, clamp } from '../core/util.js';

const MAX = 1400;
const UP = new Vector3(0, 1, 0);
const _o = new Object3D();
const _v = new Vector3(), _w = new Vector3(), _d = new Vector3(), _l = new Vector3();

export class Blood {
  constructor(game) {
    this.game = game;
    this.n = 0;
    this.p = new Float32Array(MAX * 3);
    this.v = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.age = new Float32Array(MAX);
    this.src = new Array(MAX).fill(null);
    this.wounds = [];
    this.enabled = true;
    this.amount = 1;
    this.stats = { drops: 0, splats: 0, onBodies: 0, onProps: 0, onGround: 0 };

    const geo = new BoxGeometry(1, 1, 1);
    this.mesh = new InstancedMesh(geo, new MeshLambertMaterial({ color: '#8c0909' }), MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    game.scene.add(this.mesh);
  }

  /* ------------------------------- emitting ------------------------------- */

  drop(x, y, z, vx, vy, vz, size, src = null) {
    if (!this.enabled) return;
    let i;
    if (this.n < MAX) i = this.n++;
    else i = (Math.random() * MAX) | 0;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.size[i] = size;
    this.age[i] = 0;
    this.src[i] = src;
    this.stats.drops++;
  }

  /** A burst from a point, mostly along dir. */
  spray(point, dir, count, speed, spread = 0.6, size = 0.012, src = null, base = null) {
    count = Math.round(count * this.amount);
    for (let k = 0; k < count; k++) {
      _d.set(dir.x + rand(-spread, spread), dir.y + rand(-spread, spread) + 0.25, dir.z + rand(-spread, spread)).normalize();
      const s = speed * rand(0.35, 1.15);
      let vx = _d.x * s, vy = _d.y * s, vz = _d.z * s;
      if (base) {
        // carried along with the body, but not flung by one wild limb
        const bl = Math.hypot(base.x, base.y, base.z), k = bl > 3 ? 3 / bl : 1;
        vx += base.x * k; vy += base.y * k; vz += base.z * k;
      }
      this.drop(point.x, point.y, point.z, vx, vy, vz, size * rand(0.6, 1.6), src);
    }
  }

  addWound(h, part, local, normal, rate, life) {
    // keep a body from turning into a sieve of tiny wounds
    let mine = 0;
    for (const w of this.wounds) if (w.h === h) mine++;
    if (mine >= 6) {
      const oldest = this.wounds.find((w) => w.h === h);
      this.wounds.splice(this.wounds.indexOf(oldest), 1);
    }
    this.wounds.push({ h, part, local: local.clone(), normal: normal.clone(), rate, life, t: 0, acc: 0, pool: 0.04, poolT: 0, run: 0 });
  }

  /* ------------------------------ from a blow ----------------------------- */

  onHit(victim, hit) {
    const part = hit.part;
    const body = victim.bodies[part];
    const def = PARTS[part];
    const tiles = victim.layout.tiles[part];
    const local = body.toLocal(hit.point, _l).clone();
    // the outward normal at that spot, in the part's frame
    const n = outward(local, def.half);

    if (!hit.sharp) {
      victim.paint.splat(local, def.size, tiles, 0.03 + hit.speed * 0.004, {
        kind: 'bruise', strength: clamp(hit.damage / 14, 0.35, 1),
      });
    }

    let amount = 0;
    if (hit.kind === 'impact') amount = hit.damage > 6 ? 0.2 : 0;
    else if (hit.sharp) amount = clamp(0.55 + hit.damage / 40, 0.6, 1.2);
    else if (hit.kind === 'bat') amount = hit.damage > 12 ? clamp(hit.damage / 40, 0.3, 0.8) : 0.12;
    else {
      const face = part === P.head || part === P.neck;
      const worn = 1 - victim.health / 100;
      amount = (face ? 0.2 + worn * 0.5 : worn * 0.25) * clamp(hit.damage / 10, 0.4, 1.4);
    }
    if (!victim.alive) amount *= 1.2;
    if (amount <= 0 || !chance(clamp(amount * 1.7, 0, 1))) return;

    const worldN = _w.copy(n).applyQuaternion(body.q);
    const out = _v.copy(hit.dir).multiplyScalar(-0.3).add(worldN).add(hit.dir).normalize();
    const count = 6 + amount * 34 + hit.speed * 1.2;
    this.spray(hit.point, out, count, 1.4 + hit.speed * 0.38, 0.75, 0.011 + amount * 0.006, victim, body.v);
    // blood at the wound itself
    victim.paint.splat(local, def.size, tiles, 0.016 + amount * 0.03, { sats: 4 });
    this.addWound(victim, part, local, n, 3 + amount * 12, 5 + amount * 18);
    if (part === P.head && !hit.sharp && chance(0.6)) {
      // a nose bleed: just under the middle of the face
      this.addWound(victim, part, new Vector3(0, -0.04, def.half.z), new Vector3(0, 0, 1), 2.5 + amount * 4, 8 + amount * 10);
    }

    // and on whatever hit them
    const s = hit.striker;
    if (s && s.owner) {
      if (s.owner.paint && s.owner.bodies) {
        const h = s.owner;
        const sl = s.toLocal(hit.point, _l).clone();
        h.paint.splat(sl, PARTS[s.part].size, h.layout.tiles[s.part], 0.012 + amount * 0.02, { sats: 3 });
      } else if (s.owner.splat) {
        s.owner.splat(hit.point, 0.018 + amount * 0.035, { sats: 5 });
        this.stats.onProps++;
      }
    }
  }

  /** A body part hitting something hard. */
  impact(h, part, point, speed) {
    const body = h.bodies[part];
    const def = PARTS[part];
    const local = body.toLocal(point, _l).clone();
    const n = outward(local, def.half);
    const amount = clamp((speed - 6) / 8, 0.1, 0.8);
    this.spray(point, UP, 4 + amount * 18, 1 + speed * 0.2, 0.9, 0.011, h);
    if (chance(0.5)) this.addWound(h, part, local, n, 2 + amount * 6, 4 + amount * 8);
  }

  /* -------------------------------- update -------------------------------- */

  update(dt) {
    const g = this.game;
    // wounds bleed
    for (let k = this.wounds.length - 1; k >= 0; k--) {
      const w = this.wounds[k];
      if (w.h.removed) { this.wounds.splice(k, 1); continue; }
      w.t += dt;
      const fade = w.h.alive ? Math.exp(-w.t / w.life) : 0.35 + 0.65 * Math.exp(-w.t / (w.life * 2));
      if (w.t > w.life * (w.h.alive ? 3 : 6)) { this.wounds.splice(k, 1); continue; }
      const body = w.h.bodies[w.part];
      w.acc += w.rate * fade * dt * this.amount;
      while (w.acc >= 1) {
        w.acc -= 1;
        const wp = body.toWorld(w.local, _v);
        const wn = _w.copy(w.normal).applyQuaternion(body.q);
        const s = rand(0.15, 0.7);
        const bl = body.v.length(), k = bl > 3 ? 3 / bl : 1;
        this.drop(wp.x + wn.x * 0.01, wp.y + wn.y * 0.01, wp.z + wn.z * 0.01,
          body.v.x * k + wn.x * s + rand(-0.1, 0.1), body.v.y * k + wn.y * s, body.v.z * k + wn.z * s + rand(-0.1, 0.1),
          rand(0.008, 0.016), w.h);
        if (w.h.alive) w.h.health -= 0.08;
        w.h.bleed += 1;
      }
      // blood runs down the skin
      w.run += dt * fade;
      if (w.run > 0.7) {
        w.run = 0;
        const def = PARTS[w.part];
        const down = _d.set(0, -1, 0).applyQuaternion(body.q.clone().invert());
        const p = _l.copy(w.local).addScaledVector(down, rand(0.01, 0.04));
        w.h.paint.splat(p, def.size, w.h.layout.tiles[w.part], 0.01, { kind: 'drip', dir: down });
      }
      // a still body pools
      if (!w.h.alive || w.h.state === 'ragdoll') {
        w.poolT += dt;
        if (w.poolT > 0.35) {
          w.poolT = 0;
          const wp = body.toWorld(w.local, _v);
          const gy = g.groundAt(wp.x, wp.z);
          if (isFinite(gy) && wp.y - gy < 0.3 && body.v.lengthSq() < 0.05) {
            w.pool = Math.min(0.5, w.pool + 0.012 * fade + 0.004);
            g.map.paintPool(wp.x, gy, wp.z, w.pool, 0.12 * fade + 0.04);
          }
        }
      }
    }
    if (this.wounds.length && g.humans.length === 0) this.wounds.length = 0;

    // drops fly
    const p = this.p, v = this.v;
    const humans = g.humans, props = g.props;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      const j = i * 3;
      v[j + 1] -= 9.81 * dt;
      const drag = 1 - 0.4 * dt;
      v[j] *= drag; v[j + 2] *= drag;
      const ox = p[j], oy = p[j + 1], oz = p[j + 2];
      p[j] += v[j] * dt; p[j + 1] += v[j + 1] * dt; p[j + 2] += v[j + 2] * dt;
      const x = p[j], y = p[j + 1], z = p[j + 2];
      let hit = false;

      // the ground
      const gy = g.groundAt(x, z);
      if (isFinite(gy) && y <= gy && oy >= gy - 0.25) {
        _d.set(v[j], 0, v[j + 2]);
        const sp = Math.hypot(v[j], v[j + 1], v[j + 2]);
        g.map.paintSplat(x, gy, z, this.size[i] * (1.2 + sp * 0.12), _d.multiplyScalar(0.25));
        this.stats.onGround++;
        hit = true;
      } else if (y < -40) {
        hit = true;
      }

      // people (not the wound it just left)
      if (!hit) {
        const young = this.age[i] < 0.06;
        for (let k = 0; k < humans.length && !hit; k++) {
          const h = humans[k];
          if (h.removed || (young && this.src[i] === h)) continue;
          const pc = h.pelvis.x;
          const dx = x - pc.x, dy = y - pc.y, dz = z - pc.z;
          if (dx * dx + dy * dy + dz * dz > 1.3 * 1.3) continue;
          for (let pi = 0; pi < NP; pi++) {
            const b = h.bodies[pi];
            if (!pointInBox(x, y, z, b.x, b.axes, b.half, 0.004)) continue;
            _v.set(x, y, z);
            const local = b.toLocal(_v, _l);
            const dir = _d.set(v[j], v[j + 1], v[j + 2]).applyQuaternion(_qInv.copy(b.q).invert()).multiplyScalar(0.15);
            h.paint.splat(local, PARTS[pi].size, h.layout.tiles[pi], this.size[i] * 1.1, { dir, sats: 1 });
            this.stats.onBodies++;
            hit = true;
            break;
          }
        }
      }
      // objects, in hands or not
      if (!hit) {
        for (let k = 0; k < props.length; k++) {
          const pr = props[k];
          if (pr.removed) continue;
          const b = pr.body;
          const dx = x - b.x.x, dy = y - b.x.y, dz = z - b.x.z;
          const r = b.radius + 0.02;
          if (dx * dx + dy * dy + dz * dz > r * r) continue;
          if (!pointInBox(x, y, z, b.x, b.axes, b.half, 0.006)) continue;
          _v.set(x, y, z);
          pr.splat(_v, this.size[i] * 1.2, { sats: 1 });
          this.stats.onProps++;
          hit = true;
        }
      }

      if (hit) {
        this.stats.splats++;
        this.kill(i);
        i--;
      }
    }

    // draw
    const m = this.mesh;
    for (let i = 0; i < this.n; i++) {
      const j = i * 3;
      _o.position.set(p[j], p[j + 1], p[j + 2]);
      _d.set(v[j], v[j + 1], v[j + 2]);
      const sp = _d.length();
      if (sp > 1e-3) _o.quaternion.setFromUnitVectors(UP, _d.multiplyScalar(1 / sp));
      const s = this.size[i] * 0.6;
      _o.scale.set(s, s * (1 + Math.min(5, sp * 0.45)), s);
      _o.updateMatrix();
      m.setMatrixAt(i, _o.matrix);
    }
    m.count = this.n;
    m.instanceMatrix.needsUpdate = true;
  }

  kill(i) {
    const last = --this.n;
    if (i !== last) {
      this.p[i * 3] = this.p[last * 3]; this.p[i * 3 + 1] = this.p[last * 3 + 1]; this.p[i * 3 + 2] = this.p[last * 3 + 2];
      this.v[i * 3] = this.v[last * 3]; this.v[i * 3 + 1] = this.v[last * 3 + 1]; this.v[i * 3 + 2] = this.v[last * 3 + 2];
      this.size[i] = this.size[last];
      this.age[i] = this.age[last];
      this.src[i] = this.src[last];
    }
    this.src[last] = null;
  }

  clear() {
    this.n = 0;
    this.wounds.length = 0;
    this.src.fill(null);
    this.mesh.count = 0;
  }
}

const _qInv = new Quaternion();

/** The face of a box a local point is closest to, as a unit normal. */
function outward(local, half) {
  const ax = Math.abs(local.x) / half.x, ay = Math.abs(local.y) / half.y, az = Math.abs(local.z) / half.z;
  if (ax >= ay && ax >= az) return new Vector3(Math.sign(local.x) || 1, 0, 0);
  if (ay >= az) return new Vector3(0, Math.sign(local.y) || 1, 0);
  return new Vector3(0, 0, Math.sign(local.z) || 1);
}
