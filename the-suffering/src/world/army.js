/* =============================================================================
   The army's guns, at six stars.

   A jeep's machine gun on its post and a tank's turret turn toward you (the
   jeep's quickly, the tank's slowly), and the gun is laid up or down to
   bear. Whoever works it fires when they can see you and the gun is on you:
   the machine gun in bursts, walking on to you the longer it keeps at it;
   the tank's main gun every few seconds, a shell that bursts where it lands,
   and the machine gun beside it in between. Lose them and the gun stays on
   where you were for a few seconds, then comes back round to the front.
   The attack helicopter's chin gun and its missiles go off from here too
   (Heli._attack says when).

   Shells and missiles fly: a shell fast and nearly flat; a missile slowly
   at first and then faster and faster, trailing smoke, steering for where
   it was sent. Either bursts on the first thing it meets (a wall, the
   ground, a car, a person, a helicopter) like a car's fuel tank going up.

   On a server the host's guns are the ones that fire; everyone else sees
   the rounds, the shells and the missiles fly, and the blasts.
   ========================================================================== */
import * as THREE from 'three';
import { P } from '../human/rig.js';
import { groundHeight } from './city.js';
import { rayBody } from '../physics/world.js';
import { clamp, clamp01, lerp, rand, chance, wrapAngle, TAU } from '../core/util.js';

/** A heavy machine gun's round: a rifle's, only heavier, and it goes on through. */
export const MG = { id: 'mg', name: 'Machine gun', gun: true, rifle: true, power: 1.5, hp: 46, impulse: 7, pierce: true, loud: 150 };
/** What flies: how fast it leaves, how it falls or speeds up, how big a blast, how long it can fly, how it is drawn. */
const SHELL = { speed: 170, drop: 2.5, power: 1.0, life: 2.4, len: 0.7, size: 0.11, col: 0xfff0b0 };
const MISSILE = { speed: 32, top: 85, accel: 110, turn: 2.4, power: 0.95, life: 4.5, len: 0.9, size: 0.13, col: 0x3a3d38 };

const _a = [0, 0, 0], _b = [0, 0, 0], _hit = [0, 0, 0, 0, 0, 0];
const _ch = { lp: [0, 0, 0], ln: [0, 0, 0], xn: [0, 0, 0], tag: '', glass: -1, piece: 0, exit: 0, exitTag: '' };
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _fwd = new THREE.Vector3(0, 0, 1);

const fit = (h) => !!h && !h.removed && h.h.alive && h.h.conscious && !(h.tased > 0);

export class Army {
  constructor(game) {
    this.g = game;
    this.shots = [];          // shells and missiles in the air
    this.stats = { rounds: 0, shells: 0, missiles: 0, booms: 0 };
  }

  update(dt) {
    const T = this.g.traffic;
    if (T) for (const car of T.cars) if (car.turretCfg && !car.removed) this._turret(car, dt);
    this._fly(dt);
  }

  /** Everything in the air, gone: a fresh start. */
  clear() {
    for (const s of this.shots) this.g.boxes.release(s.idx);
    this.shots.length = 0;
  }

  /* ------------------------------- turrets -------------------------------- */

  /** Who works its gun: the jeep's gunner; in a tank the gunner inside (or the commander, if the gunner is gone). */
  crewOf(car) {
    if (car.kind === 'tank') return fit(car.seats[1]) ? car.seats[1] : fit(car.seats[2]) ? car.seats[2] : null;
    const i = car.seatKind ? car.seatKind.findIndex((k) => k && k.gunner) : -1;
    return i >= 0 && fit(car.seats[i]) ? car.seats[i] : null;
  }

  _turret(car, dt) {
    const g = this.g, C = car.turretCfg, Pz = g.police, p = g.player;
    // the gun runs back out after it kicks
    car.recoil = Math.max(0, car.recoil - dt * 0.9);
    // the host's: turned by what they send
    if (car.mirror) return;
    const crew = !car.wreck && car.fire < 0 ? this.crewOf(car) : null;
    // what it is after: you, while you are wanted (and only a unit sent after you)
    let seen = false, tx = 0, ty = 0, tz = 0;
    if (crew && car.unit && Pz && Pz.wanted >= 2 && p && p.h.alive && !p.removed) {
      if (p.car) { tx = p.car.x; ty = p.car.y + 1.0; tz = p.car.z; }
      else { const c = p.bodies[P.CHEST]; tx = c.px; ty = c.py; tz = c.pz; }
      car.turretPoint(0, 0, 0, _a, true);
      const dx = tx - _a[0], dy = ty - _a[1], dz = tz - _a[2], d = Math.hypot(dx, dy, dz);
      car.aimD = d;
      if (d > 2 && d < (car.kind === 'tank' ? 150 : 95)) seen = g.world.rayWorld(_a[0], _a[1], _a[2], dx / d, dy / d, dz / d, d - 0.8) < 0;
      if (seen) car.lastAim = { x: tx, y: ty, z: tz, t: g.time };
    }
    // at you if it can see you; at where you were for a few seconds after; then round to the front again
    let yawT = 0, pitchT = 0;
    const L = car.lastAim, at = seen ? [tx, ty, tz] : crew && L && g.time - L.t < 5 ? [L.x, L.y, L.z] : null;
    if (at) {
      car.turretPoint(0, 0, 0, _a, true);
      car.dirToLocal(at[0] - _a[0], at[1] - _a[1], at[2] - _a[2], _b);
      yawT = Math.atan2(_b[0], _b[2]); pitchT = Math.atan2(_b[1], Math.hypot(_b[0], _b[2]));
    }
    pitchT = clamp(pitchT, C.pitch[0], C.pitch[1]);
    const ey = wrapAngle(yawT - car.tYaw), ep = pitchT - car.tPitch;
    if (crew) {
      car.tYaw = wrapAngle(car.tYaw + clamp(ey, -C.yawRate * dt, C.yawRate * dt));
      car.tPitch += clamp(ep, -C.pitchRate * dt, C.pitchRate * dt);
      if (car.kind === 'tank' && Math.abs(ey) > 0.01) g.audio?.loop('traverse' + car.id, 'buzz', car.x, car.y + 2, car.z, 0.5);
    }
    if (!seen) { car.onT = 0; return; }
    const err = Math.abs(ey) + Math.abs(ep);
    car.onT = err < 0.09 ? (car.onT || 0) + dt : 0;
    if (car.kind === 'tank') this._tankFire(car, dt, crew, err);
    else this._mgFire(car, dt, crew, err, C.muzzle);
  }

  /**
   * A machine gun on a mount: a moment to get on you, then bursts, a breath between them, the first ones wide and
   * closer and closer the longer it keeps on you.
   */
  _mgFire(car, dt, shooter, err, muzzle) {
    car.burstT = (car.burstT || 0) - dt;
    car.shotT = (car.shotT || 0) - dt;
    if (err > 0.07 || car.burstT > 0 || car.onT < 0.9 || car.shotT > 0) return;
    if (!(car.burst > 0)) car.burst = 4 + ((Math.random() * 5) | 0);
    car.shotT = 0.1;
    const spread = lerp(0.075, 0.018, clamp01((car.onT - 0.9) / 3.5));
    car.turretPoint(muzzle[0], muzzle[1], muzzle[2], _a, true);
    car.gunDir(_b);
    this.fire(shooter, _a[0], _a[1], _a[2], _b[0] + rand(-spread, spread), _b[1] + rand(-spread, spread) * 0.7, _b[2] + rand(-spread, spread), car);
    if (--car.burst <= 0) car.burstT = rand(0.9, 1.7);
    if (!car.saidFire && shooter.mind) { car.saidFire = true; shooter.mind.ask('copFire', 70, null, rand(0.1, 0.5)); }
  }

  /** The tank: the main gun when it is laid on you and loaded; the machine gun beside it in between. */
  _tankFire(car, dt, shooter, err) {
    const C = car.turretCfg;
    if (car.reloadT == null) car.reloadT = rand(1.5, 3);
    car.reloadT -= dt;
    if (car.reloadT <= 0 && err < 0.035 && car.onT > 0.6) {
      car.reloadT = rand(5.5, 7.5);
      car.turretPoint(C.muzzle[0], C.muzzle[1], C.muzzle[2], _a, true);
      car.gunDir(_b);
      const s = 0.006;
      this.cannon(shooter, car, _a[0], _a[1], _a[2], _b[0] + rand(-s, s), _b[1] + rand(-s, s), _b[2] + rand(-s, s));
      return;
    }
    if (car.reloadT > 1.0 && car.aimD < 85) this._mgFire(car, dt, shooter, err, C.coax);
  }

  /* -------------------------------- firing -------------------------------- */

  /** One round from a mounted machine gun (a jeep's, a tank's, a helicopter's chin gun): flash, noise, the round. */
  fire(shooter, ox, oy, oz, dx, dy, dz, car = null) {
    const g = this.g, l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    g.audio?.at('mg', ox, oy, oz, 1);
    g.gore.puff('flash', ox + dx * 0.1, oy + dy * 0.1, oz + dz * 0.1, 0.34, 0.05, 1, 0.85, 0.5);
    if (chance(0.35)) g.gore.puff('smoke', ox, oy, oz, 0.3, 0.6, 0.62, 0.6, 0.56);
    g.lights?.ask('point', ox, oy, oz, 0xffb060, 10, 6);
    g.minds?.noise(ox, oy, oz, MG.loud, 'gunshot', shooter);
    if (g.weapons && shooter) g.weapons._bullet(shooter, MG, ox, oy, oz, dx, dy, dz, MG.power, 0, car);
    g.mp?.armyFx?.('mg', ox, oy, oz, dx, dy, dz);
    this.stats.rounds++;
  }

  /** A round fired somewhere else (the host's gun): the flash, the noise and the streak of it, no more. */
  ghostRound(ox, oy, oz, dx, dy, dz) {
    const g = this.g;
    g.audio?.at('mg', ox, oy, oz, 1);
    g.gore.puff('flash', ox + dx * 0.1, oy + dy * 0.1, oz + dz * 0.1, 0.34, 0.05, 1, 0.85, 0.5);
    let far = 200;
    const w = g.world.rayWorld(ox, oy, oz, dx, dy, dz, far);
    if (w >= 0) far = w;
    if (g.weapons) g.weapons.tracers.push({ ax: ox, ay: oy, az: oz, bx: ox + dx * far, by: oy + dy * far, bz: oz + dz * far, t: 0, q: g.gore.fx.alloc() });
  }

  /** The tank's main gun: the shell away, the gun kicking back, the flash and the smoke and the noise of it. */
  cannon(by, car, x, y, z, dx, dy, dz) {
    const g = this.g;
    car.recoil = 0.42;
    g.audio?.at('cannon', x, y, z, 1.3);
    for (let k = 0; k < 6; k++) g.gore.puff('flash', x + dx * k * 0.35, y + dy * k * 0.35, z + dz * k * 0.35, Math.max(0.3, rand(0.9, 1.6) - k * 0.14), rand(0.08, 0.14), 1, 0.8, 0.45);
    for (let k = 0; k < 12; k++) { const a = rand(TAU), r = rand(0.3, 1.5); g.gore.puff('smoke', x + Math.cos(a) * r, y + rand(-0.3, 0.5), z + Math.sin(a) * r, rand(1.2, 2.2), rand(1.8, 3.2), 0.64, 0.62, 0.58); }
    // the blast off the muzzle raises the dust under it
    const gy = groundHeight(x, z);
    for (let k = 0; k < 8; k++) { const a = rand(TAU), r = rand(0.5, 3); g.gore.puff('smoke', x + Math.cos(a) * r, gy + 0.3, z + Math.sin(a) * r, rand(1, 2), rand(1, 2), 0.72, 0.68, 0.6); }
    g.lights?.ask('point', x, y, z, 0xffa040, 40, 14);
    g.minds?.noise(x, y, z, 165, 'explosion', by);
    const cam = Math.hypot(g.camX - x, g.camZ - z);
    g.shake = Math.max(g.shake, clamp(1.4 - cam / 30, 0.1, 1.4));
    this.launch('shell', by, x, y, z, dx, dy, dz, car, null, null);
    this.stats.shells++;
  }

  /** A missile off a helicopter's pod, steering for `target` (a point). */
  missile(by, heli, x, y, z, dx, dy, dz, target) {
    const g = this.g;
    g.audio?.at('missile', x, y, z, 1.1);
    for (let k = 0; k < 4; k++) g.gore.puff('smoke', x - dx * k * 0.4, y - dy * k * 0.4, z - dz * k * 0.4, rand(0.6, 1.1), rand(1.2, 2), 0.78, 0.76, 0.72);
    g.gore.puff('flash', x, y, z, 0.7, 0.08, 1, 0.8, 0.45);
    g.minds?.noise(x, y, z, 130, 'explosion', by);
    this.launch('missile', by, x, y, z, dx, dy, dz, null, heli, target);
    this.stats.missiles++;
  }

  /** Something on its way. `ghost`: the host's, shown here, that does nothing when it lands (the host's blast does). */
  launch(kind, by, x, y, z, dx, dy, dz, car = null, heli = null, target = null, ghost = false) {
    const g = this.g, K = kind === 'missile' ? MISSILE : SHELL;
    const l = Math.hypot(dx, dy, dz) || 1;
    const s = { kind, K, by, x, y, z, vx: dx / l * K.speed, vy: dy / l * K.speed, vz: dz / l * K.speed, t: 0, car, heli, target, ghost, idx: g.boxes.alloc() };
    g.boxes.colorHex(s.idx, K.col);
    this.shots.push(s);
    if (!ghost) g.mp?.armyFx?.('pj', kind, x, y, z, s.vx, s.vy, s.vz, target);
    return s;
  }

  _fly(dt) {
    const g = this.g;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i], K = s.K;
      s.t += dt;
      if (s.kind === 'missile') {
        // faster and faster, steering for where it was sent; smoke behind it, and its flame
        const sp0 = Math.hypot(s.vx, s.vy, s.vz) || 1, sp1 = Math.min(K.top, sp0 + K.accel * dt);
        let ux = s.vx / sp0, uy = s.vy / sp0, uz = s.vz / sp0;
        if (s.target) {
          const ex = s.target[0] - s.x, ey = s.target[1] - s.y, ez = s.target[2] - s.z, el = Math.hypot(ex, ey, ez) || 1;
          const k = Math.min(1, dt * K.turn);
          ux += (ex / el - ux) * k; uy += (ey / el - uy) * k; uz += (ez / el - uz) * k;
          const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
        }
        s.vx = ux * sp1; s.vy = uy * sp1; s.vz = uz * sp1;
        s.trailT = (s.trailT || 0) - dt;
        if (s.trailT <= 0) {
          s.trailT = 0.025;
          g.gore.puff('smoke', s.x - ux * 0.5, s.y - uy * 0.5, s.z - uz * 0.5, rand(0.35, 0.6), rand(1.4, 2.4), 0.76, 0.74, 0.7);
          g.gore.puff('flash', s.x - ux * 0.55, s.y - uy * 0.55, s.z - uz * 0.55, 0.28, 0.04, 1, 0.75, 0.35);
        }
        g.audio?.loop('missile' + s.idx, 'flame', s.x, s.y, s.z, 0.7);
      } else s.vy -= K.drop * dt;
      const sp = Math.hypot(s.vx, s.vy, s.vz) || 1, step = sp * dt;
      const dx = s.vx / sp, dy = s.vy / sp, dz = s.vz / sp;
      const hit = this._sweep(s, dx, dy, dz, step);
      if (hit != null || s.t > K.life) {
        const t = Math.max(0, (hit != null ? hit : step) - 0.12);
        this._burst(s, s.x + dx * t, s.y + dy * t, s.z + dz * t);
        g.boxes.release(s.idx);
        this.shots.splice(i, 1);
        continue;
      }
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      _q.setFromUnitVectors(_fwd, _v.set(dx, dy, dz));
      g.boxes.set(s.idx, s.x, s.y, s.z, _q.x, _q.y, _q.z, _q.w, K.size, K.size, K.len);
    }
  }

  /** How far along its next step it meets something, or null. */
  _sweep(s, dx, dy, dz, len) {
    const g = this.g;
    let far = len, hit = false;
    const w = g.world.rayWorld(s.x, s.y, s.z, dx, dy, dz, far);
    if (w >= 0) { far = w; hit = true; }
    // the ground
    const ex = s.x + dx * far, ez = s.z + dz * far, gy = groundHeight(ex, ez);
    if (s.y + dy * far <= gy + 0.05) { far = dy < -1e-4 ? clamp((gy + 0.05 - s.y) / dy, 0, far) : 0; hit = true; }
    for (const o of g.props) {
      if (!o.solid) continue;
      const t = o.vox ? o.vox.ray(s.x, s.y, s.z, dx, dy, dz, far) : rayBody(o.body, s.x, s.y, s.z, dx, dy, dz, far, _hit);
      if (t >= 0 && t < far) { far = t; hit = true; }
    }
    if (g.traffic) for (const c of g.traffic.cars) {
      if (c === s.car && s.t < 0.5) continue;
      const cx = c.x - s.x, cz = c.z - s.z;
      if (cx * cx + cz * cz > (far + 7) ** 2) continue;
      const t = c.ray(s.x, s.y, s.z, dx, dy, dz, far, _ch);
      if (t >= 0 && t < far) { far = t; hit = true; }
    }
    if (g.air && g.air.list.length) { const ah = g.air.ray(s.x, s.y, s.z, dx, dy, dz, far, s.heli); if (ah) { far = ah.t; hit = true; } }
    const ph = g.rayPeople(s.x, s.y, s.z, dx, dy, dz, far, s.by && s.by.removed === false ? s.by : null, 0.05);
    if (ph && !(s.car && ph.human.car === s.car) && !(s.heli && ph.human.car === s.heli)) { far = ph.t; hit = true; }
    return hit ? far : null;
  }

  /** It lands: a blast (the host's, on a server: here it only stops flying), a scorch on the ground. */
  _burst(s, x, y, z) {
    const g = this.g;
    if (s.ghost) return;
    const T = g.traffic;
    if (T) T.blast(x, y, z, s.K.power, s.by, null);
    g.mp?.boomFx?.(x, y, z, s.K.power);
    T?.scorch?.(x, y, z, 4);
    this.stats.booms++;
  }
}
