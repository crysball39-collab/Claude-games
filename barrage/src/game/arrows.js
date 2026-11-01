/* =============================================================================
   Arrows.

   An arrow is a real thing in flight: it leaves the bow fast, drops under
   gravity, and every step the line it travels along is tested against every
   box of every body in the arena, every raised shield, the walls and the
   sand - the first thing it meets is what it hits. So an archer who misses
   you can hit the brawler standing between you, and a shield held up in
   front of you stops it.

   Where it hits, it stays: stuck in the body part it went into (and moving
   with it, all the way down to the ground and back up), in the shield, in
   the wall, or standing up out of the sand.
   ========================================================================== */
import { Mesh, MeshLambertMaterial, BoxGeometry, Group, Vector3, Quaternion } from 'three';
import { rayBox } from '../physics/collide.js';
import { NP, P, VITAL } from './rig.js';
import { rand } from '../core/util.js';

const _o = new Vector3(), _d = new Vector3(), _p = new Vector3(), _q = new Quaternion();
const Z = new Vector3(0, 0, 1);
const GRAVITY = 9.8;
/** How long a stuck arrow stays, and how many may stick about at once. */
const STAY = 14, MOST = 40;

/** An arrow: a shaft, a head and fletching, pointing down +Z, its tip at z = 0. */
export function arrowModel(mats) {
  const g = new Group();
  const shaft = new Mesh(new BoxGeometry(0.012, 0.012, 0.72), mats.shaft);
  shaft.position.z = -0.36;
  const head = new Mesh(new BoxGeometry(0.026, 0.008, 0.06), mats.head);
  head.position.z = -0.02;
  const f1 = new Mesh(new BoxGeometry(0.004, 0.04, 0.1), mats.fletch);
  f1.position.z = -0.66;
  const f2 = new Mesh(new BoxGeometry(0.04, 0.004, 0.1), mats.fletch);
  f2.position.z = -0.66;
  g.add(shaft, head, f1, f2);
  for (const m of g.children) m.castShadow = true;
  return g;
}

export class Archery {
  constructor(game) {
    this.game = game;
    this.flying = [];
    this.stuck = [];
    this.mats = {
      shaft: new MeshLambertMaterial({ color: '#8a6238' }),
      head: new MeshLambertMaterial({ color: '#5d6266' }),
      fletch: new MeshLambertMaterial({ color: '#e4ddc8' }),
    };
    this.stats = { loosed: 0, hitBodies: 0, hitShields: 0, friendly: 0 };
  }

  /**
   * The first thing along a ray: { t, fighter, part } or { t, shield } or
   * { t, wall } or { t, ground }. `skip` is the shooter.
   */
  cast(o, d, maxT, skip) {
    let best = { t: maxT };
    for (const f of this.game.fighters) {
      if (f === skip || f.removed) continue;
      // cheap: does the ray pass near this person at all?
      const px = f.pelvis.x.x - o.x, py = f.pelvis.x.y - o.y, pz = f.pelvis.x.z - o.z;
      const along = px * d.x + py * d.y + pz * d.z;
      if (along < -1.5 * f.scale || along > best.t + 1.5 * f.scale) continue;
      const cx = px - d.x * along, cy = py - d.y * along, cz = pz - d.z * along;
      const reach = 2.2 * f.scale;
      if (cx * cx + cy * cy + cz * cz > reach * reach) continue;
      if (f.shield && f.blocking) {
        const b = f.shield.body;
        const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, b.x, b.axes, b.half, best.t);
        if (t >= 0 && t < best.t) best = { t, shield: f.shield, fighter: f };
      }
      for (let i = 0; i < NP; i++) {
        const b = f.bodies[i];
        const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, b.x, b.axes, b.half, best.t);
        if (t >= 0 && t < best.t) best = { t, fighter: f, part: i };
      }
    }
    const wall = this.game.arena.rayWalls(o, d, best.t);
    if (wall < best.t) best = { t: wall, wall: true };
    if (d.y < -1e-4) {
      const t = -o.y / d.y;
      if (t > 0 && t < best.t) best = { t, ground: true };
    }
    return best;
  }

  /**
   * Which way to loose from `from` to hit `at` at `speed`, given the drop:
   * aimed a little high, by how far it falls on the way. `spread` wobbles it.
   */
  aim(from, at, speed, spread, out) {
    out.subVectors(at, from);
    const t = out.length() / speed;
    out.y += 0.5 * GRAVITY * t * t;
    out.normalize();
    out.x += rand(-spread, spread);
    out.y += rand(-spread, spread) * 0.6;
    out.z += rand(-spread, spread);
    return out.normalize();
  }

  /** An arrow away: from `from`, along `dir`, at `speed`; `damage` at a vital factor of 1. */
  loose(shooter, from, dir, speed, damage) {
    const m = arrowModel(this.mats);
    m.position.copy(from);
    m.quaternion.setFromUnitVectors(Z, dir);
    this.game.scene.add(m);
    this.flying.push({ shooter, pos: from.clone(), vel: dir.clone().multiplyScalar(speed), damage, mesh: m, t: 0 });
    this.stats.loosed++;
    this.game.emit('loose', shooter, from);
  }

  update(dt) {
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const a = this.flying[i];
      a.t += dt;
      a.vel.y -= GRAVITY * dt;
      const step = a.vel.length() * dt;
      _d.copy(a.vel).normalize();
      // the shooter is safe from their own arrow only as it leaves the bow
      const hit = this.cast(a.pos, _d, step, a.t < 0.2 ? a.shooter : null);
      if (hit.t < step) {
        _p.copy(a.pos).addScaledVector(_d, hit.t);
        this.land(a, hit, _p, _d);
        this.flying.splice(i, 1);
        continue;
      }
      a.pos.addScaledVector(_d, step);
      a.mesh.position.copy(a.pos);
      a.mesh.quaternion.setFromUnitVectors(Z, _d);
      if (a.t > 4) { this.game.scene.remove(a.mesh); this.flying.splice(i, 1); }
    }
    // the stuck ones ride along with whatever they are in
    for (let i = this.stuck.length - 1; i >= 0; i--) {
      const s = this.stuck[i];
      s.t += dt;
      const gone = s.body && ((s.owner && s.owner.removed) || !s.body.world);
      if (gone || s.t > STAY) { this.game.scene.remove(s.mesh); this.stuck.splice(i, 1); continue; }
      if (s.body) {
        const sc = s.owner && s.owner.scale ? s.owner.scale : 1;
        s.mesh.position.copy(_o.copy(s.local).multiplyScalar(sc)).applyQuaternion(s.body.q).add(s.body.x);
        s.mesh.quaternion.copy(s.body.q).multiply(s.localQ);
      }
    }
  }

  /** It hit something: hurt it, and stay in it. */
  land(a, hit, point, dir) {
    const g = this.game;
    if (hit.shield) {
      this.stats.hitShields++;
      hit.shield.splat(point, 0.01, { kind: 'pit' });
      hit.fighter.blockedHit({ attacker: a.shooter, point, dir: dir.clone(), shield: true, kind: 'arrow', weapon: null });
      this.stick(a, point, dir, hit.shield.body, null, 0.05);
      g.emit('thunk', point, 'wood');
    } else if (hit.fighter) {
      const f = hit.fighter;
      this.stats.hitBodies++;
      if (a.shooter && !g.foes(a.shooter, f)) this.stats.friendly++;
      f.takeHit({
        part: hit.part, point: point.clone(), dir: dir.clone(), J: 9, speed: 10,
        damage: a.damage * VITAL[hit.part] * rand(0.9, 1.1), attacker: a.shooter, kind: 'arrow', striker: null, weapon: null,
      });
      this.stick(a, point, dir, f.bodies[hit.part], f, 0.09);
    } else if (hit.ground) {
      g.arena.paintPit(point.x, point.z, 0.015);
      this.stick(a, point, dir, null, null, 0.12);
      g.emit('thunk', point, 'sand');
    } else {
      this.stick(a, point, dir, null, null, 0.06);
      g.emit('thunk', point, 'stone');
    }
  }

  /** Leaves the arrow where it went in, `depth` of it buried. */
  stick(a, point, dir, body, owner, depth) {
    this.stickModel(a.mesh, point, dir, body, owner, depth);
  }

  /**
   * Leaves any model pointing down +Z (its point at the origin) stuck in
   * `body` (or the world, for null) at `point`, gone in along `dir`.
   */
  stickModel(m, point, dir, body, owner, depth) {
    if (!m.parent) this.game.scene.add(m);
    m.position.copy(point).addScaledVector(dir, depth);
    m.quaternion.setFromUnitVectors(Z, dir);
    const s = { mesh: m, body, owner, t: 0, local: null, localQ: null };
    if (body) {
      const sc = owner && owner.scale ? owner.scale : 1;
      _q.copy(body.q).invert();
      s.local = m.position.clone().sub(body.x).applyQuaternion(_q).divideScalar(sc);
      s.localQ = _q.clone().multiply(m.quaternion);
    }
    this.stuck.push(s);
    if (this.stuck.length > MOST) {
      const old = this.stuck.shift();
      this.game.scene.remove(old.mesh);
    }
  }

  /** Every arrow off the sand. */
  clear() {
    for (const a of this.flying) this.game.scene.remove(a.mesh);
    for (const s of this.stuck) this.game.scene.remove(s.mesh);
    this.flying.length = 0;
    this.stuck.length = 0;
  }
}

export { P };
