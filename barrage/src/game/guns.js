/* =============================================================================
   Bullets.

   A round is a ray from the muzzle. It is tested against every box of every
   body in the arena, against every raised shield, and against the walls and
   the sand; the nearest thing it meets is what it hits. So a gunner who
   misses you can hit the brawler standing between you - that is where the
   box ragdolls' bullet holes come from - and a shield held up in front of
   you stops it.

   Before a gunner fires, a red line runs from the barrel to where it is
   aimed, so you can see it coming and get your shield up or get out of the
   way.
   ========================================================================== */
import {
  Mesh, MeshBasicMaterial, BoxGeometry, Vector3, Quaternion, AdditiveBlending, OctahedronGeometry,
} from 'three';
import { rayBox } from '../physics/collide.js';
import { NP, P, VITAL } from './rig.js';
import { rand } from '../core/util.js';

const _o = new Vector3(), _d = new Vector3(), _p = new Vector3();
const Z = new Vector3(0, 0, 1);

export class Guns {
  constructor(game) {
    this.game = game;
    this.fx = [];
    this.laserMat = new MeshBasicMaterial({ color: '#ff3b2f', transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false });
    this.tracerMat = new MeshBasicMaterial({ color: '#ffe7a8', transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false });
    this.flashMat = new MeshBasicMaterial({ color: '#ffc861', transparent: true, opacity: 1, blending: AdditiveBlending, depthWrite: false });
    this.unit = new BoxGeometry(1, 1, 1);
    this.flashGeo = new OctahedronGeometry(0.09, 0);
    this.stats = { shots: 0, hitBodies: 0, hitShields: 0, friendly: 0 };
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
      if (along < -1.5 || along > best.t + 1.5) continue;
      const cx = px - d.x * along, cy = py - d.y * along, cz = pz - d.z * along;
      if (cx * cx + cy * cy + cz * cz > 2.2 * 2.2) continue;
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

  /** Where a gunner's barrel is pointing: from the muzzle toward `at`, with a little wobble. */
  aim(shooter, at, spread, out) {
    shooter.gun.muzzle(_o, out);
    out.subVectors(at, _o).normalize();
    out.x += rand(-spread, spread);
    out.y += rand(-spread, spread) * 0.6;
    out.z += rand(-spread, spread);
    return out.normalize();
  }

  /** Fires once along dir from shooter's muzzle. damage: at a vital factor of 1. */
  fire(shooter, dir, damage) {
    const gun = shooter.gun;
    if (!gun) return null;
    gun.muzzle(_o, _p);
    const o = _o.clone(), d = dir.clone().normalize();
    const hit = this.cast(o, d, 60, shooter);
    const end = o.clone().addScaledVector(d, hit.t);
    this.stats.shots++;
    this.game.emit('shot', shooter, o);

    if (hit.shield) {
      this.stats.hitShields++;
      hit.shield.splat(end, 0.012, { kind: 'pit' });
      hit.fighter.blockedHit({ attacker: shooter, point: end, dir: d, shield: true, kind: 'bullet', weapon: null });
      this.game.emit('ricochet', end, 'wood');
    } else if (hit.fighter) {
      const f = hit.fighter;
      this.stats.hitBodies++;
      if (!this.game.foes(shooter, f)) this.stats.friendly++;
      f.takeHit({
        part: hit.part, point: end, dir: d, J: 11, speed: 12, damage: damage * VITAL[hit.part] * rand(0.9, 1.1),
        attacker: shooter, kind: 'bullet', striker: null, weapon: null,
      });
    } else if (hit.ground) {
      this.game.arena.paintPit(end.x, end.z, 0.02);
      this.game.emit('ricochet', end, 'sand');
    } else if (hit.wall) {
      this.game.emit('ricochet', end, 'stone');
    }
    this.tracer(o, end);
    this.flash(o);
    return hit;
  }

  /** A short-lived streak of light along the path of the round. */
  tracer(a, b) {
    const m = new Mesh(this.unit, this.tracerMat.clone());
    this.place(m, a, b, 0.012);
    this.game.scene.add(m);
    this.fx.push({ m, t: 0, life: 0.07 });
  }

  flash(at) {
    const m = new Mesh(this.flashGeo, this.flashMat.clone());
    m.position.copy(at);
    m.rotation.set(rand(0, 3), rand(0, 3), 0);
    this.game.scene.add(m);
    this.fx.push({ m, t: 0, life: 0.06, grow: true });
  }

  /** A thin box from a to b. */
  place(m, a, b, thick) {
    const len = a.distanceTo(b);
    m.position.addVectors(a, b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(Z, _d.subVectors(b, a).normalize());
    m.scale.set(thick, thick, Math.max(0.01, len));
  }

  /** The aiming line for one gunner: shown while it lines up a shot. */
  laser(shooter, show) {
    let m = shooter._laser;
    if (!show) { if (m) m.visible = false; return; }
    if (!m) {
      m = shooter._laser = new Mesh(this.unit, this.laserMat);
      this.game.scene.add(m);
    }
    m.visible = true;
    const gun = shooter.gun;
    if (!gun) { m.visible = false; return; }
    gun.muzzle(_o, _d);
    const hit = this.cast(_o, _d, 30, shooter);
    _p.copy(_o).addScaledVector(_d, hit.t);
    this.place(m, _o, _p, 0.008);
  }

  dropLaser(shooter) {
    if (shooter._laser) { this.game.scene.remove(shooter._laser); shooter._laser = null; }
  }

  update(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      const k = 1 - f.t / f.life;
      if (k <= 0) {
        this.game.scene.remove(f.m);
        f.m.material.dispose();
        this.fx.splice(i, 1);
        continue;
      }
      f.m.material.opacity = k;
      if (f.grow) f.m.scale.setScalar(1 + (1 - k) * 1.5);
    }
  }
}

export { P };
