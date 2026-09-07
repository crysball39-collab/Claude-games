/* =============================================================================
   The Reality Crusher V2. Shoot it at anything that can move - crates,
   boulders, citizens - and it takes hold of them so you can carry them around.
   ========================================================================== */
import {
  Group, Mesh, BoxGeometry, CylinderGeometry, SphereGeometry, MeshLambertMaterial,
  MeshBasicMaterial, Vector3, Quaternion, AdditiveBlending, Color, DoubleSide,
} from 'three';
import { rayBone, boneBoxCenter } from './skeleton.js';
import { gripWorld } from './grip.js';
import { STATE } from './character.js';
import { clamp, clamp01 } from '../core/util.js';

/** Fastest the beam will ever drag a held body, in m/s. */
const HOLD_SPEED = 9;

/** Trims a particle back to `max` metres of travel per substep, keeping its
    direction. Verlet stores speed as a position gap, so this edits the gap. */
function capSpeed(p, max) {
  const dx = p.x - p.px, dy = p.y - p.py, dz = p.z - p.pz;
  const d = Math.hypot(dx, dy, dz);
  if (d <= max || d === 0) return;
  const k = max / d;
  p.px = p.x - dx * k; p.py = p.y - dy * k; p.pz = p.z - dz * k;
}

const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3(), _v4 = new Vector3();
const _q1 = new Quaternion();

/* -------------------------------------------------------------------------- */
/*                                  the model                                 */
/* -------------------------------------------------------------------------- */

export function createRCV2Model() {
  const g = new Group();
  const dark = new MeshLambertMaterial({ color: 0x2b2f36 });
  const mid = new MeshLambertMaterial({ color: 0x4a515c });
  const brass = new MeshLambertMaterial({ color: 0x8a6a34 });
  const glowMat = new MeshBasicMaterial({ color: 0xff5a2a, transparent: true, opacity: 0.95 });

  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = false;
    g.add(m);
    return m;
  };

  /* Grip and foregrip, both sized for a hand to close round: a fist leaves a
     hole about thirty millimetres across, and anything fatter than that is
     something the fingers are inside rather than around. */
  add(new BoxGeometry(0.036, 0.13, 0.044), dark, 0, -0.075, 0.02, 0.22, 0, 0);
  add(new BoxGeometry(0.038, 0.014, 0.048), mid, 0, -0.139, 0.034, 0.22, 0, 0);
  // the front grip, under the shroud, which is what the other hand holds
  add(new BoxGeometry(0.034, 0.088, 0.038), dark, 0, -0.052, -0.145, -0.10, 0, 0);
  add(new BoxGeometry(0.038, 0.012, 0.042), mid, 0, -0.096, -0.150, -0.10, 0, 0);
  // receiver
  add(new BoxGeometry(0.075, 0.085, 0.235), mid, 0, 0.005, -0.03);
  // top rail
  add(new BoxGeometry(0.05, 0.022, 0.16), dark, 0, 0.056, -0.05);
  // barrel shroud
  add(new CylinderGeometry(0.036, 0.042, 0.20, 8), dark, 0, 0.005, -0.20, Math.PI / 2, 0, 0);
  // emitter rings
  add(new CylinderGeometry(0.052, 0.052, 0.018, 10), brass, 0, 0.005, -0.255, Math.PI / 2, 0, 0);
  add(new CylinderGeometry(0.044, 0.044, 0.014, 10), brass, 0, 0.005, -0.185, Math.PI / 2, 0, 0);
  // the core
  const core = add(new SphereGeometry(0.030, 10, 8), glowMat, 0, 0.005, -0.262);
  // side canisters
  add(new BoxGeometry(0.020, 0.05, 0.10), mid, 0.048, -0.008, -0.06);
  add(new BoxGeometry(0.020, 0.05, 0.10), mid, -0.048, -0.008, -0.06);

  g.userData.core = core;
  g.userData.glowMat = glowMat;
  g.userData.emitter = new Vector3(0, 0.005, -0.30);
  g.userData.materials = [dark, mid, brass, glowMat];
  return g;
}

/* -------------------------------------------------------------------------- */
/*                                   weapon                                   */
/* -------------------------------------------------------------------------- */

export class RCV2 {
  constructor(game, owner) {
    this.game = game;
    this.owner = owner;
    this.model = createRCV2Model();
    this.model.visible = false;
    game.scene.add(this.model);

    this.grab = null;
    this.holdDist = 3.2;
    this.range = 30;
    this.charge = 0;
    this.recoil = 0;

    // the beam
    const beamGeo = new CylinderGeometry(0.018, 0.05, 1, 6, 1, true);
    beamGeo.translate(0, 0.5, 0);
    beamGeo.rotateX(Math.PI / 2);
    this.beamMat = new MeshBasicMaterial({
      color: new Color(0xff6a30), transparent: true, opacity: 0.5,
      blending: AdditiveBlending, depthWrite: false, side: DoubleSide,
    });
    this.beam = new Mesh(beamGeo, this.beamMat);
    this.beam.visible = false;
    this.beam.frustumCulled = false;
    game.scene.add(this.beam);

    this.haloMat = new MeshBasicMaterial({
      color: new Color(0xff7a3a), transparent: true, opacity: 0.28,
      blending: AdditiveBlending, depthWrite: false,
    });
    this.halo = new Mesh(new SphereGeometry(1, 12, 8), this.haloMat);
    this.halo.visible = false;
    game.scene.add(this.halo);
  }

  setVisible(v) {
    this.model.visible = v;
    if (!v) this.release();
  }

  get holding() { return !!this.grab; }

  /* ------------------------------- targeting ----------------------------- */

  /** Nearest grabbable thing along the aim ray. */
  pick(origin, dir, range = this.range) {
    let best = null;

    const bodyHit = this.game.world.raycastBodies(origin, dir, range, (b) => b.userData.grabbable !== false);
    if (bodyHit) best = { type: 'body', body: bodyHit.body, distance: bodyHit.distance, point: bodyHit.point };

    for (const c of this.game.characters) {
      if (c === this.owner) continue;
      if (c.body.destroyed) continue;
      // cheap reject on the torso before touching every bone
      _v1.copy(c.center).sub(origin);
      const along = _v1.dot(dir);
      if (along < -1.5 || along > range + 2) continue;
      if (_v1.addScaledVector(dir, -along).lengthSq() > 2.6) continue;
      for (const bone of c.rig.bones) {
        if (bone.def.finger) continue;
        const t = rayBone(origin, dir, bone);
        if (t == null || t < 0 || t > range) continue;
        if (!best || t < best.distance) {
          best = { type: 'character', character: c, bone, distance: t };
        }
      }
    }
    return best;
  }

  /* --------------------------------- grab -------------------------------- */

  shoot(origin, dir) {
    if (this.grab) { this.release(); return 'released'; }
    const hit = this.pick(origin, dir);
    if (!hit) { this.recoil = 0.55; return 'miss'; }
    this.recoil = 1;

    if (hit.type === 'body') {
      hit.body.wake();
      _v1.copy(dir).multiplyScalar(hit.distance).add(origin);
      hit.body.worldToLocal(_v1, _v2);
      this.grab = { type: 'body', body: hit.body, local: _v2.clone() };
      this.holdDist = clamp(hit.distance, 1.8, 9);
      return 'grabbed';
    }

    const c = hit.character;
    this.grab = { type: 'character', character: c, bone: hit.bone };
    this.holdDist = clamp(hit.distance, 1.8, 9);
    if (!c.dead) {
      c.wantsUp = false;
      c.balance = 0;
      c.setState(STATE.RAGDOLL);
      c.ai?.onThreatened?.(this.owner, 0.7);
    }
    return 'grabbed';
  }

  release() {
    if (!this.grab) return;
    if (this.grab.type === 'character') {
      const c = this.grab.character;
      /* Distal joints spend the carry lagging behind the one under the beam,
         and the solver drags them along by moving them rather than by giving
         them speed. Let go without this and all of that comes out at once: the
         feet leave at three times the speed the body was ever carried at. You
         cannot throw something faster than you were holding it. */
      const cap = HOLD_SPEED * this.game.world.substepDt;
      for (const p of c.particleList) capSpeed(p, cap);
      c.wantsUp = true;
      c.getUpDelay = 0.35 + Math.random() * 0.5;
    } else if (this.grab.type === 'body') {
      this.grab.body.wake();
    }
    this.grab = null;
    this.beam.visible = false;
    this.halo.visible = false;
  }

  /** Removes whatever is being held, or whatever is under the crosshair. */
  deleteTarget(origin, dir) {
    let target = this.grab;
    if (!target) {
      const hit = this.pick(origin, dir);
      if (!hit) return null;
      target = hit.type === 'body'
        ? { type: 'body', body: hit.body }
        : { type: 'character', character: hit.character };
    }
    this.grab = null;
    this.beam.visible = false;
    this.halo.visible = false;
    if (target.type === 'body') { this.game.removeBody(target.body); return 'Crate'; }
    this.game.removeCharacter(target.character);
    return 'Citizen';
  }

  /* -------------------------------- update ------------------------------- */

  update(dt, camera) {
    this.recoil = Math.max(0, this.recoil - dt * 4.2);
    const core = this.model.userData.glowMat;
    const pulse = 0.65 + Math.sin(performance.now() * 0.006) * 0.12 + this.recoil * 0.5 + (this.grab ? 0.3 : 0);
    core.opacity = clamp01(pulse);

    if (!this.grab) { this.beam.visible = false; this.halo.visible = false; return; }

    camera.getWorldDirection(_v1);
    const hold = _v2.copy(camera.position).addScaledVector(_v1, this.holdDist);

    if (this.grab.type === 'body') {
      const b = this.grab.body;
      if (b.dead) { this.grab = null; return; }
      b.wake();
      b.localToWorld(this.grab.local, _v3);
      _v4.copy(hold).sub(_v3).multiplyScalar(11);
      const speed = _v4.length();
      if (speed > 26) _v4.multiplyScalar(26 / speed);
      b.vel.lerp(_v4, clamp01(dt * 22));
      b.angVel.multiplyScalar(Math.exp(-5.5 * dt));
      this._drawBeam(_v3, Math.max(0.35, b.shape === 'sphere' ? b.radius : b.half.length() * 0.9));
    } else {
      const c = this.grab.character;
      if (c.body.destroyed) { this.grab = null; return; }
      boneBoxCenter(this.grab.bone, _v3);
      const pair = c.boneParticles[this.grab.bone.name];
      const parts = pair ? [c.particles[pair[0]], c.particles[pair[1]]] : [c.particles.mt];
      _v4.copy(hold).sub(_v3).multiplyScalar(7);
      const speed = _v4.length();
      if (speed > HOLD_SPEED) _v4.multiplyScalar(HOLD_SPEED / speed);
      /* The whole person comes along, not just the joint under the beam.
         Yanking two particles and leaving the constraint solver to drag the
         other thirty is what made a held citizen crack like a whip; easing
         every joint towards the same velocity carries them instead. */
      const h = this.game.world.substepDt;
      const FOLLOW = 0.24;                 // how much of the pull the rest gets
      const DAMP = 0.9;                    // takes the flail out of what is left
      for (const p of c.particleList) {
        const grabbed = parts.includes(p);
        const a = grabbed ? 1 : FOLLOW;
        const vx = grabbed ? 0 : (p.x - p.px) * DAMP;
        const vy = grabbed ? 0 : (p.y - p.py) * DAMP;
        const vz = grabbed ? 0 : (p.z - p.pz) * DAMP;
        p.px = p.x - (vx * (1 - a) + _v4.x * h * a);
        p.py = p.y - (vy * (1 - a) + _v4.y * h * a);
        p.pz = p.z - (vz * (1 - a) + _v4.z * h * a);
        capSpeed(p, HOLD_SPEED * h);
      }
      if (!c.dead) { c.wantsUp = false; c.balance = 0; }
      this._drawBeam(_v3, 0.45);
    }
  }

  _drawBeam(target, radius) {
    const from = this.emitterWorld(_v1);
    _v2.copy(target).sub(from);
    const len = _v2.length();
    if (len < 0.01) { this.beam.visible = false; return; }
    this.beam.visible = true;
    this.beam.position.copy(from);
    this.beam.quaternion.setFromUnitVectors(_v3.set(0, 0, 1), _v2.multiplyScalar(1 / len));
    this.beam.scale.set(1, 1, len);
    this.beamMat.opacity = 0.34 + Math.sin(performance.now() * 0.02) * 0.08;

    this.halo.visible = true;
    this.halo.position.copy(target);
    const s = radius * (1.12 + Math.sin(performance.now() * 0.008) * 0.06);
    this.halo.scale.set(s, s, s);
  }

  emitterWorld(out) {
    return out.copy(this.model.userData.emitter).applyQuaternion(this.model.quaternion).add(this.model.position);
  }

  /** Sticks the gun into the owner's right hand. */
  attachToHand(character) {
    /* Held the way everything else is held: the grip through the fist, in the
       hole the closed fingers leave. It used to be stuck to the outside of the
       hand box with a fudged quarter turn, which is why the hand never looked
       like it had hold of anything. */
    const hand = character.rig.byName.handR;
    gripWorld(hand, RCV2_GRIP, _q1, _v1);
    this.model.position.copy(_v1);
    this.model.quaternion.copy(_q1);
    const kick = this.recoil * 0.06;
    if (kick > 0) {
      this.model.getWorldDirection(_v3);
      this.model.position.addScaledVector(_v3, kick);
    }
  }

  dispose() {
    this.model.removeFromParent();
    for (const m of this.model.userData.materials) m.dispose();
    this.model.traverse((o) => o.geometry?.dispose?.());
    this.beam.geometry.dispose(); this.beamMat.dispose(); this.beam.removeFromParent();
    this.halo.geometry.dispose(); this.haloMat.dispose(); this.halo.removeFromParent();
  }
}

/** Where the fist closes on it, and which way it points once it is there. */
export const RCV2_GRIP = { rake: 0.32, roll: -Math.PI / 2, hold: [0, -0.062, 0.018] };
/** And where the other hand goes: the front grip, in the weapon's own space. */
export const RCV2_FOREGRIP = [0, -0.050, -0.146];

