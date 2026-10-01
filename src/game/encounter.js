/* =============================================================================
   Red Plains: the fire over the pillar, and what comes out of it.

   The encounter owns everything that is neither the map nor Silva himself:
   the fireball floating over the pillar, the cutscene that starts when you
   touch it, the fight, and the red RCV2 he leaves behind.

   The cutscene, in order:
     the ball swells and pulses        you are looking at it over your shoulder
     it goes off                       the pillar comes apart, and so do you:
                                       the blast carries you back across the
                                       field into the wall
     the fire comes together           what was left of the ball pulls itself
                                       into the top half of a man on four legs
     his mouth tears open              and he roars; his name comes up
     back to you                       getting up off the grass by the wall
   ========================================================================== */
import {
  Group, Mesh, SphereGeometry, BoxGeometry, MeshBasicMaterial, AdditiveBlending,
  PointLight, Vector3,
} from 'three';
import { Silva } from './silva.js';
import { createRCV2Model } from './rcv2.js';
import { STATE } from './character.js';
import { RAGDOLL } from './joints.js';
import { softGlowMaterial } from './fx.js';
import { unlock } from './progress.js';
import { clamp, clamp01, lerp, makeRng } from '../core/util.js';

const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3();
const _c = new Vector3(), _want = new Vector3();
const UP = new Vector3(0, 1, 0);

/** When each part of the cutscene starts, in seconds from touching the ball. */
export const CUT = {
  charge: 1.6,      // the ball swells; then it goes off
  flight: 1.8,      // how long the blast carries you
  form: 4.0,        // the fire starts to come together
  roar: 6.9,        // the mouth opens
  title: 8.3,       // his name, once the roar is out of him
  back: 9.7,        // back to you
  giveUp: 14,       // if you are somehow still not up by now, you are stood up
};

const ARM = /^(elbow|wrist|handEnd)/;
const LEG = /^(knee|ankle|toe)/;

export class SilvaEncounter {
  constructor(game) {
    this.game = game;
    const map = game.map;
    this.rng = makeRng(0x5e1a);
    this.state = 'waiting';
    this.t = 0;
    this.clock = 0;
    this.cam = null;              // { pos, look } while the cutscene has the camera
    this.flight = null;
    this.respawnPoint = new Vector3(0, 0, 30);
    this.respawnYaw = 0;

    const top = map.platform ? map.platform.height : 0;
    this.altar = (map.altar || new Vector3(0, top + 1, 0)).clone();
    this.home = new Vector3(this.altar.x, top, this.altar.z);
    this.orbBase = this.altar.clone().add(_v1.set(0, 0.55, 0));

    /* ------------------------------- the ball ------------------------------ */
    this.geo = new SphereGeometry(1, 20, 14);
    this.mats = [
      // red: a hot centre, and red fire round it
      new MeshBasicMaterial({ color: 0xffc8a0, transparent: true, opacity: 0.96,
        blending: AdditiveBlending, depthWrite: false }),
      softGlowMaterial(0xff3412, 0.95, 1.4),
      softGlowMaterial(0xff1206, 0.5, 2.6),
    ];
    this.orb = new Group();
    this.orbParts = [0.17, 0.34, 0.66].map((r, i) => {
      const m = new Mesh(this.geo, this.mats[i]);
      m.scale.setScalar(r);
      m.renderOrder = 8 + i;
      m.userData.r = r;
      this.orb.add(m);
      return m;
    });
    this.orb.position.copy(this.orbBase);
    game.scene.add(this.orb);
    /* One light for the whole encounter: the ball's while it burns, the red
       RCV2's at the end. It is made now and never leaves the scene, because
       adding a light later would rebuild every shader mid-fight. */
    this.light = new PointLight(0xff4a14, 3.2, 9, 1.6);
    this.light.position.copy(this.orbBase);
    game.scene.add(this.light);

    // the stone the pillar turns into
    this.chunkGeo = new BoxGeometry(1, 1, 1);

    /* ------------------------------- Silva -------------------------------- */
    this.boss = new Silva(game, this.home);
    this.boss.onDeath = (pos) => this._bossDied(pos);

    /* ---------------------- what he leaves behind ------------------------- */
    this.reward = createRCV2Model({ variant: 'red' });
    this.reward.scale.setScalar(2.2);
    this.reward.visible = false;
    game.scene.add(this.reward);
    this.rewardBase = new Vector3();

    /* --------------------------- interactables ----------------------------- */
    this.orbUse = {
      id: 'silvaOrb',
      label: 'TOUCH',
      position: this.orbBase.clone(),
      radius: 2.3,
      prompt: 'It is warm. It is watching you.',
      use: () => this.begin(),
    };
    this.rewardUse = {
      id: 'silvaRCV2',
      label: 'TAKE',
      position: new Vector3(),
      radius: 2.4,
      enabled: false,
      prompt: 'It hums. It wants to go back.',
      use: () => this.claim(),
    };
    game.interactables.push(this.orbUse, this.rewardUse);
  }

  get active() { return this.state === 'cutscene' || this.state === 'fight'; }

  /* -------------------------------- frame --------------------------------- */

  update(dt) {
    this.clock += dt;
    this.boss.update(dt);
    switch (this.state) {
      case 'waiting': this._idleBall(dt); break;
      case 'cutscene': this._cutscene(dt); break;
      case 'won': this._floatReward(dt); break;
      default: break;
    }
  }

  /** The ball over the pillar, minding its own business. */
  _idleBall(dt) {
    const t = this.clock;
    this.orb.position.copy(this.orbBase);
    this.orb.position.y += Math.sin(t * 1.6) * 0.07;
    const flick = 1 + Math.sin(t * 9.1) * 0.05 + Math.sin(t * 23.7) * 0.03;
    for (const m of this.orbParts) m.scale.setScalar(m.userData.r * flick);
    this.light.position.copy(this.orb.position);
    this.light.intensity = 3 + Math.sin(t * 7.3) * 0.5;
    const fx = this.game.fx;
    if (fx) {
      fx.fire(this.orb.position, { count: 1, spread: 0.12, up: 0.7, size: 0.3, life: 0.5 });
      if (this.rng() < dt * 4) fx.embers(this.orb.position, { count: 1, spread: 0.3, up: 0.8 });
    }
  }

  /* ------------------------------ the cutscene ----------------------------- */

  /** Touching the ball. */
  begin() {
    if (this.state !== 'waiting') return;
    const g = this.game, p = g.player;
    if (!p || p.dead || p.state !== STATE.CONTROLLED) return;
    this.state = 'cutscene';
    this.t = 0;
    this.orbUse.enabled = false;
    this.launched = false;
    this.formed = false;
    this.roared = false;
    this.titled = false;
    this.backToYou = false;
    this.shot = '';
    this.cam = { pos: new Vector3(), look: new Vector3() };
    g.cutscene = this;
    g.hud?.setCutscene(true);
    p.animator.cancelAction();
    p.moveInput.set(0, 0, 0);
  }

  _cutscene(dt) {
    const g = this.game, p = g.player;
    const t = (this.t += dt);
    p.moveInput.set(0, 0, 0);

    if (t < CUT.charge) {
      this._swell(t / CUT.charge);
      this._shotCharge(t / CUT.charge, dt);
      return;
    }
    if (!this.launched) this._blast(true);
    if (this.flight && !this.flight.done) this._carry(dt);
    if (t < CUT.form) this._remains(dt);
    if (t >= CUT.form && !this.formed) { this.formed = true; this.boss.startForming(); }
    if (t >= CUT.roar && !this.roared) { this.roared = true; this.boss.startRoar(); }
    if (t >= CUT.title && !this.titled) {
      this.titled = true;
      g.hud?.showTitle('SILVA', 'THE FIRE OVER RED PLAINS');
    }

    if (t < CUT.form) this._shotFlight(dt);
    else if (t < CUT.roar) this._shotForming(t, dt);
    else if (t < CUT.back) this._shotRoar(t, dt);
    else {
      if (!this.backToYou) {
        // on the grass by the wall, getting up to face him
        this.backToYou = true;
        g.hud?.hideTitle();
        p.wantsUp = true;
        p.getUpDelay = 0;
        p.balance = Math.max(p.balance, 0.6);
      }
      this._shotBack(dt);
    }
    if (this.backToYou && (p.state === STATE.CONTROLLED || t > CUT.giveUp)) {
      if (p.state !== STATE.CONTROLLED) this._standUp();
      this._startFight();
    }
  }

  /** The ball swelling, faster and brighter, until it cannot any more. */
  _swell(k) {
    const t = this.t;
    const pulse = Math.sin(t * (6 + 26 * k)) * (0.06 + 0.12 * k);
    const s = 1 + k * k * 0.9 + pulse;
    this.orb.position.copy(this.orbBase);
    this.orb.position.y += Math.sin(this.clock * 1.6) * 0.07 * (1 - k);
    for (const m of this.orbParts) m.scale.setScalar(m.userData.r * s);
    this.mats[2].uniforms.opacity.value = 0.42 + k * 0.4;
    this.light.position.copy(this.orb.position);
    this.light.intensity = 3 + k * k * 18 + pulse * 8;
    const g = this.game, fx = g.fx;
    if (fx) {
      fx.fire(this.orb.position, { count: 1 + Math.round(k * 5), spread: 0.15 + k * 0.2,
        up: 0.6 + k, size: 0.3 + k * 0.25, life: 0.45 });
      // the air round it being pulled in
      if (this.rng() < 0.6 + k * 0.4) {
        const a = this.rng() * Math.PI * 2, r = 1.4 + this.rng() * 1.2;
        _v1.set(this.orb.position.x + Math.cos(a) * r, this.orb.position.y + (this.rng() - 0.5) * 1.6,
          this.orb.position.z + Math.sin(a) * r);
        _v2.copy(this.orb.position).sub(_v1).multiplyScalar(2.4);
        fx.fire(_v1, { count: 1, size: 0.14, life: 0.4, up: 0, vel: _v2 });
      }
    }
    g.shake = Math.max(g.shake, k * 0.5);
  }

  /** It goes off. */
  _blast(launch) {
    this.launched = true;
    const g = this.game, fx = g.fx;
    const at = this.orb.position.clone();
    fx?.explosion(at, { scale: 2.3 });
    fx?.ring(at, { radius: 11, life: 0.9, color: 0xff5a14, y: this.home.y });
    fx?.smoke(at, { count: 22, spread: 1.4, size: 1.6, up: 1.6 });
    fx?.embers(at, { count: 40, spread: 1.2, up: 3 });
    g.shake = Math.min(1.8, g.shake + 1.6);
    g.hud?.flashDamage(0.55);
    this.orb.visible = false;
    this.light.intensity = 0;
    g.fire?.scorchFloor(_v1.set(this.home.x, this.home.y, this.home.z), 2.4);
    this._shatterPillar(at);
    if (launch) this._launchPlayer(at);
  }

  /** The pillar does not survive it. */
  _shatterPillar(at) {
    const g = this.game, map = g.map;
    for (const part of map.altarParts || []) {
      g.world.removeBody(part.body);
      const i = map.solids.indexOf(part.body);
      if (i >= 0) map.solids.splice(i, 1);
      part.mesh?.removeFromParent();
    }
    if (map.altarParts) map.altarParts.length = 0;
    g.nav.dirty = true;
    const mat = map.altarMaterial;
    if (!mat || !g.gore) return;
    for (let i = 0; i < 12; i++) {
      const m = new Mesh(this.chunkGeo, mat);
      const s = 0.1 + this.rng() * 0.18;
      m.scale.set(s * (0.8 + this.rng() * 0.6), s, s * (0.8 + this.rng() * 0.6));
      m.castShadow = true;
      const a = this.rng() * Math.PI * 2;
      m.position.set(at.x + Math.cos(a) * 0.25, this.home.y + 0.2 + this.rng() * 0.9, at.z + Math.sin(a) * 0.25);
      m.rotation.set(this.rng() * 3, this.rng() * 3, this.rng() * 3);
      _v1.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(4 + this.rng() * 6);
      _v1.y = 3 + this.rng() * 5;
      g.gore.throwPart(m, _v1, { bleed: 0 });
    }
  }

  /** The middle of a body, from its particles. */
  _bodyCenter(c, out) {
    out.set(0, 0, 0);
    const list = c.particleList;
    for (const q of list) { out.x += q.x; out.y += q.y; out.z += q.z; }
    return out.multiplyScalar(1 / Math.max(1, list.length));
  }

  /** Where the blast sends you: straight back from the ball, into the wall. */
  _launchPlayer(at) {
    const g = this.game, p = g.player;
    const from = this._bodyCenter(p, new Vector3());
    const dir = new Vector3(from.x - at.x, 0, from.z - at.z);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
    dir.normalize();
    const to = this._wallPoint(from, dir, new Vector3());
    to.y = g.world.floorAt(to.x, to.z, 5) + 1.15;
    this.flight = { from, to, dir, t: 0, T: CUT.flight, done: false };

    p.animator.cancelAction();
    p.animator.cancelFull();
    p.balance = 0;
    p.wantsUp = false;
    p.setState(STATE.RAGDOLL);
    // limp now, not at the end of the frame: a joint still held to the
    // standing pose would be dragged back to where you were
    p.strength = RAGDOLL.strength;
    for (const q of p.particleList) q.muscle = Math.min(q.muscle, RAGDOLL.strength);
    /* Thrown back from the chest: the arms and legs are left behind for a
       moment and the head goes first, which is the shape people make. */
    const h = g.world.substepDt;
    for (const [name, q] of Object.entries(p.particles)) {
      if (!p.particleList.includes(q)) continue;
      let kx = 0, ky = 0, kz = 0;
      if (ARM.test(name)) { kx = -dir.x * 6; kz = -dir.z * 6; ky = 2.5; }
      else if (LEG.test(name)) { kx = -dir.x * 5; kz = -dir.z * 5; ky = 1.5; }
      else if (name === 'headTop' || name === 'neckTop') { kx = dir.x * 1.5; kz = dir.z * 1.5; }
      q.px -= kx * h; q.py -= ky * h; q.pz -= kz * h;
    }
  }

  /** Where a line from `from` along flat `dir` meets the inside of the walls. */
  _wallPoint(from, dir, out) {
    const inner = this.game.map.half - 1.0 - 0.32;
    const tx = Math.abs(dir.x) > 1e-4 ? (inner - from.x * Math.sign(dir.x)) / Math.abs(dir.x) : Infinity;
    const tz = Math.abs(dir.z) > 1e-4 ? (inner - from.z * Math.sign(dir.z)) / Math.abs(dir.z) : Infinity;
    const d = Math.max(0, Math.min(tx, tz));
    return out.set(from.x + dir.x * d, from.y, from.z + dir.z * d);
  }

  /**
   * Carries the ragdoll along the blast. The middle of the body is put on
   * the line and given the line's speed; how the limbs are moving relative
   * to the middle is kept, so it flails on the way rather than gliding.
   */
  _carry(dt) {
    const g = this.game, p = g.player, f = this.flight;
    f.t += dt;
    const k = Math.min(1, f.t / f.T);
    const apex = 2.6;
    const x = lerp(f.from.x, f.to.x, k);
    const z = lerp(f.from.z, f.to.z, k);
    const y = lerp(f.from.y, f.to.y, k) + 4 * apex * k * (1 - k);
    const vx = (f.to.x - f.from.x) / f.T;
    const vz = (f.to.z - f.from.z) / f.T;
    const vy = (f.to.y - f.from.y) / f.T + 4 * apex * (1 - 2 * k) / f.T;
    const list = p.particleList;
    const n = Math.max(1, list.length);
    let cx = 0, cy = 0, cz = 0, mx = 0, my = 0, mz = 0;
    for (const q of list) {
      cx += q.x; cy += q.y; cz += q.z;
      mx += q.x - q.px; my += q.y - q.py; mz += q.z - q.pz;
    }
    cx /= n; cy /= n; cz /= n; mx /= n; my /= n; mz /= n;
    const h = g.world.substepDt;
    const dx = x - cx, dy = y - cy, dz = z - cz;
    for (const q of list) {
      const rx = (q.x - q.px - mx) * 0.97;
      const ry = (q.y - q.py - my) * 0.97;
      const rz = (q.z - q.pz - mz) * 0.97;
      q.x += dx; q.y += dy; q.z += dz;
      q.px = q.x - (rx + vx * h);
      q.py = q.y - (ry + vy * h);
      q.pz = q.z - (rz + vz * h);
    }
    // a trail of fire and smoke off you on the way
    if (g.fx && this.rng() < 0.8) {
      g.fx.fire(_v1.set(x, y, z), { count: 1, size: 0.35, life: 0.35, up: 0.4 });
      g.fx.smoke(_v1, { count: 1, size: 0.5, up: 0.2, life: 1.2 });
    }
    if (k >= 1) {
      f.done = true;
      this._hitWall(_v1.set(x, y, z));
    }
  }

  /** The wall. It hurts, but the cutscene is not where you die. */
  _hitWall(at) {
    const g = this.game, p = g.player;
    g.shake = Math.min(1.8, g.shake + 1.3);
    g.hud?.flashDamage(0.85);
    g.fx?.smoke(at, { count: 10, spread: 0.6, size: 0.9, up: 0.6, dark: 0.05 });
    g.fx?.sparks(at, this.flight.dir.clone().negate(), { count: 10, speed: 4, life: 0.5 });
    const amount = Math.min(16, Math.max(0, p.health - 30));
    if (amount > 0) {
      p.applyDamage(amount, { boneName: 'upperTorso', point: at.clone(), type: 'blunt', severity: 0.7 });
    }
  }

  /** What is left of the ball, hanging in the air where it was. */
  _remains(dt) {
    const fx = this.game.fx;
    if (!fx) return;
    const t = this.t - CUT.charge;
    for (let i = 0; i < 2; i++) {
      const a = this.rng() * Math.PI * 2 + t * 2, r = 0.3 + this.rng() * 1.1;
      _v1.set(this.orbBase.x + Math.cos(a) * r, this.orbBase.y - 0.3 + this.rng() * 1.2,
        this.orbBase.z + Math.sin(a) * r);
      fx.embers(_v1, { count: 1, spread: 0.1, up: 0.25, life: 1.1 });
    }
    if (this.rng() < dt * 12) fx.fire(this.orbBase, { count: 1, spread: 0.4, size: 0.25, up: 0.3, life: 0.5 });
  }

  /* ------------------------------- the shots ------------------------------- */

  _setCam(pos, look, dt, follow) {
    const c = this.cam;
    if (!c) return;
    // a new shot is a cut; inside a shot the camera moves smoothly
    if (follow == null) { c.pos.copy(pos); c.look.copy(look); return; }
    c.pos.lerp(pos, clamp01(dt * follow));
    c.look.lerp(look, clamp01(dt * follow * 1.4));
  }

  _shot(name) {
    if (this.shot === name) return false;
    this.shot = name;
    return true;
  }

  /** Over your shoulder at the ball, closing in on it. */
  _shotCharge(k, dt) {
    const p = this.game.player;
    p.eyePosition(_c);
    _v1.set(_c.x - this.orbBase.x, 0, _c.z - this.orbBase.z);
    if (_v1.lengthSq() < 1e-4) _v1.set(0, 0, 1);
    _v1.normalize();
    const side = _v2.set(-_v1.z, 0, _v1.x);
    const back = lerp(1.25, 0.75, k);
    _want.copy(_c).addScaledVector(_v1, back).addScaledVector(side, 0.45).addScaledVector(UP, 0.28);
    _v3.copy(this.orb.position);
    this._setCam(_want, _v3, dt, this._shot('charge') ? null : 5);
  }

  /** Alongside you as the blast carries you into the wall. */
  _shotFlight(dt) {
    const p = this.game.player, f = this.flight;
    this._bodyCenter(p, _c);
    const side = _v2.set(-f.dir.z, 0, f.dir.x);
    _want.copy(_c).addScaledVector(side, 3.6).addScaledVector(UP, 1.1).addScaledVector(f.dir, -1.3);
    const lim = this.game.map.half - 1.4;
    _want.x = clamp(_want.x, -lim, lim);
    _want.z = clamp(_want.z, -lim, lim);
    _want.y = Math.max(_want.y, this.game.world.floorAt(_want.x, _want.z, _want.y) + 0.6);
    this._setCam(_want, _c, dt, this._shot('flight') ? null : 7);
  }

  /** From your side of the platform, as the fire pulls itself into him. */
  _shotForming(t, dt) {
    const s = clamp01((t - CUT.form) / (CUT.roar - CUT.form));
    const p = this.game.player;
    _v1.set(p.pos.x - this.home.x, 0, p.pos.z - this.home.z);
    if (_v1.lengthSq() < 1e-4) _v1.copy(this.flight?.dir || _v2.set(0, 0, 1));
    _v1.normalize().applyAxisAngle(UP, (s - 0.5) * 0.55);
    _want.copy(this.home).addScaledVector(_v1, 7.4 - s * 1.4).addScaledVector(UP, 2.4 - s * 0.3);
    _v3.copy(this.boss.center);
    _v3.y = Math.max(_v3.y, this.home.y + 0.8);
    this._setCam(_want, _v3, dt, this._shot('forming') ? null : 3);
  }

  /**
   * In his face as it tears open: in close and a little above for the
   * tearing, so the mouth is what fills the frame, then back out as the roar
   * comes, to take all of him in.
   */
  _shotRoar(t, dt) {
    const r = t - CUT.roar;
    const b = this.boss;
    const head = b.m.head.localToWorld(_c.set(0, 0.14, 0));
    const fwd = b.forward(_v1);
    const side = _v2.set(-fwd.z, 0, fwd.x);
    const close = clamp01(r / 0.7) * (1 - clamp01((r - 1.0) / 1.2));
    _want.copy(head).addScaledVector(fwd, lerp(2.9, 1.55, close))
      .addScaledVector(side, lerp(0.7, 0.3, close)).addScaledVector(UP, lerp(0.05, 0.28, close));
    _v3.copy(head).addScaledVector(UP, -0.05 * close);
    this._setCam(_want, _v3, dt, this._shot('roar') ? null : 5);
  }

  /** From his side of the field, as you pick yourself up off the grass. */
  _shotBack(dt) {
    const p = this.game.player;
    this._bodyCenter(p, _c);
    _v1.set(this.boss.pos.x - _c.x, 0, this.boss.pos.z - _c.z);
    if (_v1.lengthSq() < 1e-4) _v1.set(0, 0, -1);
    _v1.normalize();
    const side = _v2.set(-_v1.z, 0, _v1.x);
    _want.copy(_c).addScaledVector(_v1, 3.4).addScaledVector(side, 1.2).addScaledVector(UP, 0.9);
    _want.y = Math.max(_want.y, this.game.world.floorAt(_want.x, _want.z, _want.y) + 0.5);
    _v3.copy(_c).addScaledVector(UP, 0.35);
    this._setCam(_want, _v3, dt, this._shot('back') ? null : 4);
  }

  /** Silva and the red RCV2 are hidden until they are needed, and a hidden
      thing's shaders are not built by a warm-up compile; show them for it. */
  showForCompile(on) {
    this.boss.setVisible(on);
    this.reward.visible = on;
  }

  /** The cutscene is over one way or another and you have to be on your feet. */
  _standUp() {
    const g = this.game, p = g.player;
    this._bodyCenter(p, _c);
    const yaw = Math.atan2(-(this.boss.pos.x - _c.x), -(this.boss.pos.z - _c.z));
    p.teleport(_c.x, _c.z, yaw);
  }

  /** SKIP: straight to the end of it, with everything where it would be. */
  skip() {
    if (this.state !== 'cutscene') return;
    const g = this.game, p = g.player;
    if (!this.launched) {
      this._blast(false);
      _v1.set(p.pos.x - this.altar.x, 0, p.pos.z - this.altar.z);
      if (_v1.lengthSq() < 0.01) _v1.set(0, 0, 1);
      _v1.normalize();
      this.flight = { from: p.pos.clone(), to: this._wallPoint(p.pos, _v1, new Vector3()), dir: _v1.clone(),
        t: 0, T: CUT.flight, done: true };
    }
    if (this.flight) {
      const to = this.flight.to, dir = this.flight.dir;
      const x = to.x - dir.x * 0.9, z = to.z - dir.z * 0.9;
      const yaw = Math.atan2(-(this.boss.home.x - x), -(this.boss.home.z - z));
      p.teleport(x, z, yaw);
      this.flight.done = true;
    } else if (p.state !== STATE.CONTROLLED) {
      this._standUp();
    }
    p.wantsUp = true;
    this._startFight();
  }

  /* -------------------------------- the fight ------------------------------- */

  _startFight() {
    const g = this.game, p = g.player, b = this.boss;
    this.state = 'fight';
    this.cam = null;
    g.cutscene = null;
    g.hud?.setCutscene(false);
    g.hud?.hideTitle();
    // skipped before he had formed: he arrives facing you
    if (!this.formed) b.yaw = Math.atan2(-(p.pos.x - b.pos.x), -(p.pos.z - b.pos.z));
    b.wake();
    g.hud?.setBoss('SILVA', b.hp, b.maxHp);
    p.wantsUp = true;
    // facing him, looking up at him
    g.camYaw = Math.atan2(-(b.pos.x - p.pos.x), -(b.pos.z - p.pos.z));
    g.camPitch = 0.1;
    p.gazeYaw = g.camYaw;
    g.hud?.toast('Kill Silva', 1800);
  }

  /** You came back: so does he, at full strength, where he started. */
  onRespawn() {
    if (this.state !== 'fight') return;
    this.boss.reset();
    this.game.fire?.clear();
  }

  _bossDied(pos) {
    const g = this.game;
    this.state = 'won';
    this.wonAt = this.clock;
    const lim = g.map.half - 3;
    const x = clamp(pos.x, -lim, lim), z = clamp(pos.z, -lim, lim);
    const floor = g.world.floorAt(x, z, pos.y + 3);
    this.rewardBase.set(x, (Number.isFinite(floor) ? floor : 0) + 1.25, z);
    this.reward.position.copy(this.rewardBase);
    this.reward.visible = true;
    this.rewardUse.position.copy(this.rewardBase);
    this.rewardUse.enabled = true;
    this.light.color.set(0xff2a14);
    this.light.distance = 6;
    g.fire?.clear();
    g.fx?.ring(this.rewardBase, { radius: 4, life: 1.2, color: 0xff2a14, y: this.rewardBase.y - 1.2 });
    g.hud?.toast('Silva is dead', 2400);
  }

  /** The red RCV2, turning over slowly in the air where he died. */
  _floatReward(dt) {
    const t = this.clock;
    const r = this.reward;
    r.position.copy(this.rewardBase);
    r.position.y += Math.sin(t * 1.8) * 0.12;
    r.rotation.set(0.35, t * 0.9, Math.sin(t * 0.7) * 0.25);
    const glow = r.userData.glowMat;
    if (glow) glow.opacity = 0.6 + Math.sin(t * 3.1) * 0.35;
    this.light.position.copy(r.position);
    this.light.intensity = 2.4 + Math.sin(t * 3.1) * 0.9;
    if (this.rng() < dt * 6) this.game.fx?.embers(r.position, { count: 1, spread: 0.35, up: 0.5, life: 1.2 });
    // the bar goes once he has been dead long enough for it to sink in
    if (t - this.wonAt > 1.8 && !this.barHidden) {
      this.barHidden = true;
      this.game.hud?.hideBoss();
    }
  }

  /** TAKE: the Fire Fist is yours, and the RCV2 takes you back. */
  claim() {
    if (this.state !== 'won') return;
    this.state = 'claimed';
    this.rewardUse.enabled = false;
    const first = unlock('firefist');
    const g = this.game;
    g.hud?.setFireFist?.(true);
    g.hud?.hideBoss();
    g.travel('pitvalley', first ? 'FIRE FIST UNLOCKED - slot 9' : 'The red RCV2 takes you back');
  }

  /* ------------------------------- tidying up ------------------------------ */

  dispose() {
    const g = this.game;
    if (g.cutscene === this) g.cutscene = null;
    g.hud?.setCutscene(false);
    g.hud?.hideTitle();
    g.hud?.hideBoss();
    this.boss.dispose();
    for (const it of [this.orbUse, this.rewardUse]) {
      const i = g.interactables.indexOf(it);
      if (i >= 0) g.interactables.splice(i, 1);
    }
    this.orb.removeFromParent();
    this.light.removeFromParent();
    this.reward.removeFromParent();
    this.geo.dispose();
    this.chunkGeo.dispose();
    for (const m of this.mats) m.dispose();
    for (const m of this.reward.userData.materials || []) m.dispose();
    this.reward.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}
