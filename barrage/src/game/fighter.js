/* =============================================================================
   A fighter: you, the box ragdolls who come through the gates, and the man
   who runs the Stall.

   Always two things at once: an animated skeleton (where the muscles want
   each part to be) and eighteen rigid boxes joined at real joints (where
   each part actually is). What you see is the boxes. The state decides who
   wins:

     active   muscles in full control: the boxes follow the animation
              exactly - walking, sprinting, crouching, jumping, punching,
              kicking, swinging, blocking - and shove whatever they walk into
     stumble  knocked off balance: the boxes are simulated and the muscles
              pull them toward a staggering pose with reduced strength, so
              the hit is carried through the body and it may recover...
     ragdoll  ...or not: no muscle at all, every part swings on its own joint
     getup    lying still again: a get-up animation takes over, blended in
              from wherever the ragdoll came to rest
     dead     a ragdoll that does not get up

   Damage only happens through contact: a fist, a foot or a blade has to
   actually overlap a body part (or the face of a raised shield, which stops
   it), and a body part has to actually hit something hard. Bullets are rays,
   tested against the same boxes.

   The rig, the physics of a person and the stumble / ragdoll / get-up
   machinery come from OVERGROWTH; Barrage adds health and stamina, kicks,
   guards, shields, crouching, jumping and sprinting.
   ========================================================================== */
import { Vector3, Quaternion, Matrix4, Bone, Skeleton, SkinnedMesh, MeshLambertMaterial } from 'three';
import { Body, Joint } from '../physics/world.js';
import { boxOverlap, lastNormal, boxBox, ContactPoint } from '../physics/collide.js';
import {
  PARTS, NP, P, JOINTS, jointAnchors, forwardKinematics, lowestPoint, VITAL, BALANCE_HIT,
} from './rig.js';
import {
  makePose, poseQuats, locomotion, strideAt, blendParts, makeQuats,
  GUARD, HOLD, STANCE, FLAIL, UPPER, LEGS, ARMS, GETUP_BACK, GETUP_FRONT,
  BLOCK, SHIELD_READY, SHIELD_BLOCK, SHIELD_PARTS, AIM, AIM_PARTS, JUMP, addCrouch,
} from './anim.js';
import { packBoxes, buildBoxGeometry, PaintCanvas } from './paint.js';
import { makeLook, paintBody, paintHead } from './appearance.js';
import { clamp, rand, smooth, turnToward, wrapAngle, approach } from '../core/util.js';

const UP = new Vector3(0, 1, 0);
const D = Math.PI / 180;
const FEET = [P.footL, P.footR];
/** A shield block moves the chest and the left arm; the sword arm keeps doing its own thing. */
const SHIELD_BLOCK_PARTS = ['lowerTorso', 'middleTorso', 'upperTorso', 'neck', 'head', 'upperArmL', 'lowerArmL', 'handL'].map((n) => P[n]);

let LAYOUT = null, GEOMETRY = null;
function shared() {
  if (!LAYOUT) {
    LAYOUT = packBoxes(PARTS.map((p) => ({ size: p.size, density: p.name === 'head' ? 360 : 250 })), 512);
    GEOMETRY = buildBoxGeometry(PARTS.map((p) => ({ size: p.size })), LAYOUT, true);
  }
  return { layout: LAYOUT, geometry: GEOMETRY };
}

const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3();
const _q1 = new Quaternion();
const _rootQ = new Quaternion();
const _pts = [0, 1, 2, 3].map(() => new ContactPoint());
const _ZERO = new Vector3();
const _bp = new Vector3(), _bq = new Quaternion();
const _blendQ = PARTS.map(() => new Quaternion());
const _scale = new Vector3(1, 1, 1);

let _id = 0;

/** Strength of each muscle state (1 = rigidly follows the animation). */
const STUMBLE_STRENGTH = 0.42;
/** The most speed a blow gives any one part directly, m/s; the rest travels up the body. */
const PUSH_SPEED = 6;

/** What each kind of blow does: impulse per m/s of closing speed, and damage. */
const BLOWS = {
  fist: { J: 2.6, base: 1.5, per: 1.15, cap: 11 },
  kick: { J: 4.1, base: 3, per: 1.5, cap: 12 },
};

export class Fighter {
  /**
   * opts: kind (an appearance kind), team, x, z, heading, health, power (damage
   * dealt, x), toughness (knock taken, x), stamina
   */
  constructor(game, opts) {
    this.game = game;
    this.id = ++_id;
    this.kind = opts.kind;
    this.team = opts.team;
    this.look = makeLook(opts.kind);
    this.removed = false;

    /* ------------------------------ visuals ------------------------------ */
    const { layout, geometry } = shared();
    this.layout = layout;
    this.paint = new PaintCanvas(layout.width, layout.height);
    paintBody(this.paint.ctx, layout, this.look);
    this.paint.dirty = true;
    this.material = new MeshLambertMaterial({ map: this.paint.texture });
    this.bones = PARTS.map(() => { const b = new Bone(); b.matrixAutoUpdate = false; return b; });
    const skeleton = new Skeleton(this.bones, PARTS.map(() => new Matrix4()));
    this.mesh = new SkinnedMesh(geometry, this.material);
    this.mesh.bind(skeleton, new Matrix4());
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.userData.fighter = this;
    game.scene.add(this.mesh);

    /* ------------------------------ physics ------------------------------ */
    this.bodies = PARTS.map((p) => {
      const b = new Body({ half: p.half, mass: p.mass, kind: 'kinematic', friction: 0.8, restitution: 0.02 });
      b.owner = this; b.part = p.index;
      b.linDamp = 0.08; b.angDamp = 0.8;
      game.world.add(b);
      return b;
    });
    this.joints = JOINTS.map((j) => {
      const a = jointAnchors(j.child);
      return game.world.addJoint(new Joint(this.bodies[j.parent], this.bodies[j.child], a.a, a.b, j));
    });
    this.prevPos = PARTS.map(() => new Vector3());
    this.prevQuat = PARTS.map(() => new Quaternion());

    /* ------------------------------- state ------------------------------- */
    this.state = 'active';
    this.alive = true;
    this.maxHealth = opts.health || 100;
    this.health = this.maxHealth;
    this.maxStamina = opts.stamina || 100;
    this.stamina = this.maxStamina;
    this.sinceSpend = 10;
    this.winded = false;            // ran dry: no attacks or sprinting until it recovers a little
    this.power = opts.power || 1;
    this.toughness = opts.toughness || 1;
    this.stumbleAt = opts.stumbleAt || 15;      // how big a knock it takes to stagger
    this.balance = 100;
    this.sinceHit = 10;
    this.upTime = 10;               // seconds since last getting to your feet
    this.root = new Vector3(opts.x || 0, game.groundAt(opts.x || 0, opts.z || 0), opts.z || 0);
    this.heading = opts.heading || 0;
    this.vel = new Vector3();
    this.move = new Vector3();      // desired velocity, set by whoever controls this fighter
    this.face = null;               // desired heading, or null to face the way it walks
    this.legYaw = 0;
    this.phase = Math.random();
    this.time = Math.random() * 10;
    this.guard = 0;
    this.combat = false;
    this.action = null;
    this.flinch = { x: 0, y: 0, vx: 0, vy: 0 };
    this.stumble = null;
    this.down = null;
    this.getup = null;
    this.still = 0;
    this.sleeping = false;
    this.bleed = 0;
    this.lastAttacker = null;
    this.lastHitT = -99;
    this.fade = 1;                  // 1 solid; a corpse being cleared fades to 0

    // stances
    this.wantBlock = false; this.block = 0;
    this.wantCrouch = false; this.crouch = 0;
    this.wantAim = false; this.aimW = 0;
    this.sprinting = false;
    this.air = null;                // { vy, t } while off the ground

    this.weapon = null;             // a sword in the right hand
    this.shield = null;             // a shield on the left
    this.gun = null;                // a pistol in the right hand
    this.invulnerable = false;
    this.controller = null;
    this.mask = opts.mask != null ? opts.mask : 2;   // which walls stop it (see arena MASK)

    this.pose = makePose();
    this.actPose = makePose();
    this.jq = makeQuats();
    this.tPos = PARTS.map(() => new Vector3());
    this.tQuat = PARTS.map(() => new Quaternion());
    this.capPos = PARTS.map(() => new Vector3());
    this.capQuat = PARTS.map(() => new Quaternion());
    this.capLocal = PARTS.map(() => new Quaternion());

    this.buildPose(1 / 60);
    this.place(1 / 60, true, FEET);
    for (let i = 0; i < NP; i++) {
      this.bodies[i].setPose(this.tPos[i], this.tQuat[i]);
      this.prevPos[i].copy(this.tPos[i]); this.prevQuat[i].copy(this.tQuat[i]);
    }
    this.syncVisual(1);
  }

  get pelvis() { return this.bodies[P.pelvis]; }
  get head() { return this.bodies[P.head]; }
  get chest() { return this.bodies[P.upperTorso]; }
  get standing() { return this.state === 'active' || this.state === 'getup' && this.getup && this.getup.t > this.getup.clip.duration * 0.7; }
  get upright() { return this.state === 'active' || this.state === 'stumble'; }
  get forward() { return _v3.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }
  get blocking() { return this.block > 0.55 && this.state === 'active'; }

  /* ======================================================================= */
  /*                                per step                                 */
  /* ======================================================================= */

  beginStep() {
    for (let i = 0; i < NP; i++) {
      this.prevPos[i].copy(this.bodies[i].x);
      this.prevQuat[i].copy(this.bodies[i].q);
    }
  }

  update(dt) {
    if (this.removed) return;
    this.time += dt;
    this.sinceHit += dt;
    this.sinceSpend += dt;
    this.upTime += dt;
    if (this.sinceHit > 0.6) this.balance = Math.min(100, this.balance + 32 * dt);
    if (this.alive && this.sinceSpend > 0.65) {
      this.stamina = Math.min(this.maxStamina, this.stamina + (this.block > 0.5 ? 9 : 24) * dt);
    }
    if (this.winded && this.stamina >= 22) this.winded = false;
    this.updateFlinch(dt);

    switch (this.state) {
      case 'active': this.updateActive(dt); break;
      case 'stumble': this.updateStumble(dt); break;
      case 'ragdoll': this.updateDown(dt); break;
      case 'getup': this.updateGetup(dt); break;
      case 'dead': this.updateDead(dt); break;
    }
    if (this.weapon) this.weapon.follow(dt);
    if (this.shield) this.shield.follow(dt);
    if (this.gun) this.gun.follow(dt);
  }

  /** After physics: things that read where the bodies ended up. */
  afterStep(dt) {
    if (this.removed) return;
    this.impacts();
    if (this.state !== 'active' && this.state !== 'getup') {
      // the root follows the body around, so others know where it is
      const p = this.pelvis.x;
      if (this.state !== 'stumble') { this.root.x = p.x; this.root.z = p.z; }
      this.root.y = this.game.groundAt(p.x, p.z);
    }
  }

  /** Spends stamina on something; false (and nothing spent) when there is none to spend. */
  spend(cost) {
    if (this.winded || this.stamina <= 0) return false;
    this.stamina = Math.max(0, this.stamina - cost);
    this.sinceSpend = 0;
    if (this.stamina <= 0) this.winded = true;
    return true;
  }

  /* ------------------------------- active -------------------------------- */

  updateActive(dt) {
    if (this.controller) this.controller.update(dt);
    const acting = !!this.action;
    this.block += ((this.wantBlock && !acting ? 1 : 0) - this.block) * approach(16, dt);
    this.crouch += ((this.wantCrouch && !this.air ? 1 : 0) - this.crouch) * approach(10, dt);
    this.aimW += ((this.wantAim && !acting ? 1 : 0) - this.aimW) * approach(10, dt);

    // locomotion: slower crouched or behind a guard, and no steering in the air
    const slow = Math.max(0.35, 1 - 0.5 * this.crouch - 0.45 * this.block);
    const k = approach(this.air ? 1.2 : 9, dt);
    this.vel.x += (this.move.x * slow - this.vel.x) * k;
    this.vel.z += (this.move.z * slow - this.vel.z) * k;
    this.root.x += this.vel.x * dt;
    this.root.z += this.vel.z * dt;
    this.game.arena.confine(this.root, 0.3, this.mask);
    const speed = Math.hypot(this.vel.x, this.vel.z);
    let want = this.face;
    if (want == null && speed > 0.3) want = Math.atan2(this.vel.x, this.vel.z);
    if (want != null) this.heading = turnToward(this.heading, want, (this.combat ? 8 : 6) * dt);

    const g = this.game.groundAt(this.root.x, this.root.z);
    if (this.air) {
      this.air.vy -= 13 * dt;
      this.air.t += dt;
      this.root.y += this.air.vy * dt;
      if (this.root.y <= g && this.air.vy < 0) this.land(g);
    } else {
      this.root.y += (g - this.root.y) * approach(14, dt);
    }

    // combat stance
    this.guard += ((this.combat ? 1 : 0) - this.guard) * approach(6, dt);

    if (this.action) this.updateAction(dt);

    this.buildPose(dt);
    this.place(dt, false, FEET);
  }

  /** Builds this.pose for walking, fighting and attacking. */
  buildPose(dt) {
    const speed = Math.hypot(this.vel.x, this.vel.z);
    // which way the legs walk relative to where the chest faces
    let legYaw = 0, dir = 1;
    if (speed > 0.15) {
      const m = wrapAngle(Math.atan2(this.vel.x, this.vel.z) - this.heading);
      if (Math.abs(m) <= 100 * D) legYaw = clamp(m, -70 * D, 70 * D);
      else { legYaw = clamp(wrapAngle(m - Math.PI), -70 * D, 70 * D); dir = -1; }
    }
    this.legYaw += (legYaw - this.legYaw) * approach(10, dt);
    if (!this.air) {
      this.phase += dir * (speed / strideAt(speed)) * dt;
      this.phase -= Math.floor(this.phase);
    }

    const pose = this.pose;
    locomotion(pose, this.air ? 0 : speed, this.phase, this.time);
    // stance when standing and squared up
    const still = clamp(1 - speed / 0.6, 0, 1);
    if (this.guard > 0.01) {
      blendParts(pose, STANCE, this.guard * still * (1 - this.crouch), LEGS);
      blendParts(pose, this.weapon ? HOLD : GUARD, this.guard, UPPER);
      pose.e[P.pelvis * 3 + 1] += STANCE.e[P.pelvis * 3 + 1] * this.guard * still;
    } else if (this.weapon) {
      blendParts(pose, HOLD, 0.6, ARMS);
    }
    if (this.shield) blendParts(pose, SHIELD_READY, 0.85, SHIELD_PARTS);
    if (this.aimW > 0.01) blendParts(pose, AIM, this.aimW, AIM_PARTS);
    if (this.block > 0.01) {
      if (this.shield) blendParts(pose, SHIELD_BLOCK, this.block, SHIELD_BLOCK_PARTS);
      else blendParts(pose, BLOCK, this.block, UPPER);
    }
    if (this.crouch > 0.01) addCrouch(pose, this.crouch);
    if (this.air) {
      const w = clamp(this.air.t * 7, 0, 1);
      blendParts(pose, JUMP, w, LEGS);
      if (!this.weapon && !this.shield && this.block < 0.1) blendParts(pose, JUMP, w * 0.7, ARMS);
    }
    // legs face the way they walk, the chest stays on the target
    const ly = this.legYaw;
    pose.e[P.pelvis * 3 + 1] += ly;
    pose.e[P.lowerTorso * 3 + 1] -= ly * 0.4;
    pose.e[P.middleTorso * 3 + 1] -= ly * 0.3;
    pose.e[P.upperTorso * 3 + 1] -= ly * 0.3;

    // attacks and other one-shots
    const a = this.action;
    if (a) {
      a.clip.sample(a.t, this.actPose);
      const w = a.weight;
      blendParts(pose, this.actPose, w, a.clip.parts);
      if (a.aim && a.clip.side) {
        const r = a.clip.reachAt(a.t) * w;
        const arm = a.clip.side > 0 ? P.upperArmL : P.upperArmR;
        pose.e[arm * 3] -= a.aim * r;
        pose.e[P.lowerTorso * 3] -= a.aim * r * 0.15;
      }
    }
    this.applyFlinch(pose);
  }

  /** FK, sit the lowest point of `fit` on the ground, hand the targets to the bodies. */
  place(dt, snap, fit) {
    poseQuats(this.pose, this.jq);
    _rootQ.setFromAxisAngle(UP, this.heading);
    forwardKinematics(this.root, _rootQ, this.pose.off, this.jq, this.tPos, this.tQuat);
    const low = lowestPoint(this.tPos, this.tQuat, fit);
    const shift = this.root.y - low + 0.003;
    for (let i = 0; i < NP; i++) this.tPos[i].y += shift;
    if (this.state === 'active' || this.state === 'getup' || this.state === 'stumble') {
      const blend = this.blendIn;
      if (blend && blend.t < blend.dur) {
        blend.t += dt;
        this.blendFrom(smooth(blend.t / blend.dur));
      }
      for (let i = 0; i < NP; i++) this.bodies[i].setTarget(this.tPos[i], this.tQuat[i], dt, snap);
    }
  }

  /* ------------------------------ moving about ---------------------------- */

  jump() {
    if (this.state !== 'active' || this.air || (this.action && this.action.clip.kind === 'kick')) return false;
    if (!this.spend(10)) return false;
    this.air = { vy: 4.6, t: 0 };
    this.root.y += 0.02;
    this.game.emit('jump', this);
    return true;
  }

  land(g) {
    const vy = this.air.vy;
    this.air = null;
    this.root.y = g;
    this.flinch.vx += Math.min(4, -vy * 0.5);
    this.game.emit('land', this, -vy);
  }

  /* ------------------------------- actions ------------------------------- */

  canAct() { return this.state === 'active' && !this.action; }

  /** Starts a clip. aim: extra degrees to raise the striking arm. rate: playback speed. */
  play(clip, aim = 0, rate = 1) {
    const ghosts = [];
    if (clip.active) {
      // what strikes passes through people: the hit is judged by contact, not shoved
      ghosts.push(this.bodies[clip.striker]);
      if (clip.kind === 'swing' && this.weapon) ghosts.push(this.weapon.body);
      for (const g of ghosts) g.ghost = true;
    }
    this.action = { clip, t: 0, rate, aim: aim * D, weight: 0, hits: new Set(), done: false, back: false, ghosts };
    if (clip.kind === 'swing') this.game.emit('swing', this, this.bodies[P.handR].x);
    else if (clip.kind === 'kick' || clip.kind === 'jab') this.game.emit('swing', this, this.bodies[clip.striker].x, clip.kind);
  }

  updateAction(dt) {
    const a = this.action;
    const c = a.clip;
    if (a.back) {
      // the strike landed: the limb comes straight back the way it went
      a.t -= dt * 1.6 * a.rate;
      if (a.t <= 0) { this.endAction(); return; }
    } else {
      a.t += dt * a.rate;
      if (a.t >= c.duration) { this.endAction(); return; }
    }
    a.weight = Math.min(1, a.back ? 1 : a.t / 0.05) * Math.min(1, (c.duration - a.t) / 0.08 + (a.back ? 1 : 0));
  }

  endAction() {
    for (const g of this.action.ghosts) g.ghost = false;
    this.action = null;
  }

  /** Called every physics substep while a strike is live. */
  strikeTest() {
    const a = this.action;
    if (!a || a.done || a.back) return;
    const c = a.clip;
    if (!c.active || a.t < c.active[0] || a.t > c.active[1]) return;
    const held = c.kind === 'swing' && this.weapon ? this.weapon : null;
    // a swing lands with the blade, or - too close for that - with the fist around it
    if (held && this.strikeWith(held.body, held)) return;
    this.strikeWith(this.bodies[c.striker], null);
  }

  /** Tests one striking box against every enemy's shield and body; true if it landed. */
  strikeWith(s, weapon) {
    const a = this.action;
    for (const v of this.game.fighters) {
      if (v === this || v.removed || v.invulnerable || !this.game.foes(this, v) || a.hits.has(v)) continue;
      const dx = v.pelvis.x.x - s.x.x, dz = v.pelvis.x.z - s.x.z;
      if (dx * dx + dz * dz > 6) continue;

      // a raised shield in the way stops it dead
      const sh = v.shield;
      if (sh && v.blocking) {
        const b = sh.body;
        const rr = s.radius + b.radius;
        if (s.x.distanceToSquared(b.x) < rr * rr && boxOverlap(s.x, s.axes, s.half, b.x, b.axes, b.half) > 0) {
          a.hits.add(v); a.done = true; a.back = true;
          const n = lastNormal(_v1);
          v.blockedHit({ attacker: this, point: s.x.clone(), dir: _v2.copy(n).negate().clone(), shield: true, weapon, kind: weapon ? weapon.type.hit : a.clip.kind === 'kick' ? 'kick' : 'fist' });
          return true;
        }
      }

      for (let i = 0; i < NP; i++) {
        const b = v.bodies[i];
        const rr = s.radius + b.radius;
        if (s.x.distanceToSquared(b.x) > rr * rr) continue;
        if (boxOverlap(s.x, s.axes, s.half, b.x, b.axes, b.half) <= 0) continue;
        // contact. The normal points from the victim's part to the striker.
        const n = lastNormal(_v1);
        const push = _v2.copy(n).negate();
        const rel = _v3.subVectors(s.v, b.v);
        let sp = rel.dot(push);
        if (sp < 0.8) sp = Math.max(0.8, rel.length() * 0.4);
        // where they actually met: the middle of the contact points, on the victim's surface
        const point = new Vector3();
        const nc = boxBox(s.x, s.axes, s.half, b.x, b.axes, b.half, _pts, 4);
        if (nc) {
          for (let k = 0; k < nc; k++) point.x += _pts[k].bx, point.y += _pts[k].by, point.z += _pts[k].bz;
          point.multiplyScalar(1 / nc);
        } else {
          point.copy(b.x);
        }
        let kind, J, damage;
        if (weapon) {
          const T = weapon.type;
          sp = Math.min(sp, 14);
          kind = T.hit;
          J = Math.min(38, T.strikeMass * sp);
          damage = (T.damageBase + T.damage * sp) * VITAL[i];
        } else {
          kind = a.clip.kind === 'kick' ? 'kick' : 'fist';
          const B = BLOWS[kind];
          sp = Math.min(sp, B.cap);
          J = B.J * sp;
          damage = (B.base + B.per * sp) * VITAL[i];
        }
        damage *= this.power * rand(0.85, 1.15);
        a.hits.add(v);
        a.done = true;
        a.back = true;
        v.takeHit({
          part: i, point, dir: push.clone(), J, speed: sp, damage, attacker: this,
          kind, striker: s, weapon, swing: s.v.clone(),
        });
        return true;
      }
    }
    return false;
  }

  /* -------------------------------- damage ------------------------------- */

  /** Facing the blow: within about 70 degrees of straight ahead. */
  facing(dir) { return -(dir.x * Math.sin(this.heading) + dir.z * Math.cos(this.heading)) > 0.34; }

  /** A blow stopped by a raised shield: no harm, a shove, and some stamina. */
  blockedHit(h) {
    this.sinceHit = 0;
    const cost = h.kind === 'bullet' ? 6 : h.kind === 'kick' ? 12 : h.weapon ? 10 : 6;
    this.stamina = Math.max(0, this.stamina - cost);
    this.sinceSpend = 0;
    const local = _v1.copy(h.dir).applyAxisAngle(UP, -this.heading);
    this.flinch.vx += local.z * 3;
    this.flinch.vy += local.x * 2;
    this.vel.addScaledVector(_v2.copy(h.dir).setY(0), h.kind === 'kick' ? 1.6 : 0.8);
    this.game.emit('blocked', this, h);
    if (this.stamina <= 0) this.guardBreak(h.dir);
  }

  /** Out of stamina behind a guard: the guard comes down and the next blow stumbles you. */
  guardBreak(dir) {
    this.wantBlock = false;
    this.block = 0;
    this.winded = true;
    this.game.emit('guardbreak', this);
    if (this.state === 'active') this.enterStumble(dir, 22);
  }

  takeHit(h) {
    if (this.removed || this.invulnerable) return;
    this.wake();
    this.sinceHit = 0;
    if (h.attacker) { this.lastAttacker = h.attacker; this.lastHitT = this.game.time; }

    // a guard up, facing the blow: the arms take it
    if (h.kind !== 'impact' && this.blocking && this.facing(h.dir)) {
      h.blocked = true;
      const bullet = h.kind === 'bullet';
      h.damage *= bullet ? 0.6 : 0.3;
      h.J *= bullet ? 0.6 : 0.35;
      this.stamina = Math.max(0, this.stamina - (5 + h.damage * 0.6));
      this.sinceSpend = 0;
      this.game.emit('blocked', this, h);
    }
    // braced low, harder to knock about
    h.J *= this.toughness * (1 - 0.3 * this.crouch);

    this.health -= h.damage;
    this.game.blood.onHit(this, h);
    this.game.onHit(this, h);
    if (this.controller && this.controller.onHit) this.controller.onHit(h.attacker, h);
    if (this.health <= 0 && this.alive) this.die(h.kind === 'bullet' ? 'shot' : 'hit');
    else if (this.health < this.maxHealth * 0.35) this.paintFace('hurt');

    const knock = h.J * BALANCE_HIT[h.part];
    this.balance -= knock * 2.3;
    if (h.blocked && this.stamina <= 0 && this.alive) { this.guardBreak(h.dir); return; }

    const st = this.state;
    if (!this.alive || st === 'ragdoll' || st === 'dead') {
      this.push(h.part, h.point, h.dir, h.J);
      return;
    }
    if (st === 'getup') return;
    if (this.balance <= 0 || knock > 60) {
      this.enterRagdoll();
      this.push(h.part, h.point, h.dir, h.J * 1.4);
    } else if (st === 'stumble') {
      if (knock > 16 || this.balance < 35) this.enterRagdoll();
      else this.stumble.t = Math.min(this.stumble.t, this.stumble.dur * 0.3);
      this.push(h.part, h.point, h.dir, h.J);
    } else if (knock > this.stumbleAt && !this.air) {
      this.enterStumble(h.dir, knock);
      this.push(h.part, h.point, h.dir, h.J);
    } else {
      // rocked, but in control
      const local = _v1.copy(h.dir).applyAxisAngle(UP, -this.heading);
      const k = knock * 0.12 * (h.part === P.head || h.part === P.neck ? 1.6 : 1);
      this.flinch.vx += local.z * k * 9;
      this.flinch.vy += local.x * k * 7;
    }
  }

  /**
   * Impulse J along dir at a point on a part (only bites when simulated).
   * A blow carries through the body: the part that was hit takes as much as
   * would move it at a hard pace and hands the rest to the part it hangs
   * from, and so on up - a fist to the hand swings the arm and turns the
   * shoulders rather than firing a 600 gram hand off its wrist.
   */
  push(part, point, dir, J) {
    let left = J;
    let i = part;
    while (i >= 0 && left > 1e-3) {
      const b = this.bodies[i];
      const take = i === part && PARTS[i].parent >= 0
        ? Math.min(left * 0.78, b.mass * PUSH_SPEED)
        : Math.min(left, b.mass * PUSH_SPEED);
      _v1.copy(dir).multiplyScalar(take);
      if (i === part) { _v2.subVectors(point, b.x); b.applyImpulse(_v1, _v2, 1); }
      else b.applyImpulse(_v1, null, 1);
      left -= take;
      i = PARTS[i].parent;
    }
    // whatever is left goes into the hips
    if (left > 1e-3) {
      _v1.copy(dir).multiplyScalar(left);
      this.pelvis.applyImpulse(_v1, null, 1);
    }
  }

  /** Getting your breath back between rounds. */
  heal(n) {
    if (!this.alive) return;
    this.health = Math.min(this.maxHealth, this.health + n);
    if (this.health > this.maxHealth * 0.35 && this.faceExpr === 'hurt') {
      this.faceExpr = null;
      this.paintFace(this.look.face || 'normal');
    }
  }

  /** Blood lost from open wounds. You can bleed down to almost nothing, never out. */
  bleedOut(n) {
    if (!this.alive || this.invulnerable) return;
    this.health -= n;
    if (this.team === 'player') this.health = Math.max(1, this.health);
    else if (this.health <= 0) this.die('bled');
  }

  /** Hard landings hurt: any part hitting anything above a walking pace. */
  impacts() {
    if (this.state === 'active' || this.state === 'getup') { this.bumped(); return; }
    // only a body nobody is holding up can land hard enough to hurt
    if (this.state !== 'ragdoll' && this.state !== 'dead') return;
    for (let i = 0; i < NP; i++) {
      if (i === P.footL || i === P.footR || i === P.handL || i === P.handR) continue;
      const b = this.bodies[i];
      const sp = b.impact;
      if (sp > 3 && (i === P.pelvis || i === P.upperTorso || i === P.head) && b.impactOther && b.impactOther.isStatic &&
          this.time - (this.lastThud || -9) > 0.3) {
        this.lastThud = this.time;
        this.game.emit('thud', b.x, sp);
      }
      if (sp < 7.5) continue;
      const other = b.impactOther;
      if (other && other.owner === this) continue;
      // being trodden on by someone walking past is not a fall (blows are hits, not this)
      if (other && other.kinematic) continue;
      const dmg = (sp - 7.5) * 2.5 * VITAL[i];
      if (this.alive && !this.invulnerable) {
        this.health -= dmg;
        if (this.health <= 0) this.die('impact');
      }
      if (sp > 8 && (i === P.head || Math.random() < 0.3)) {
        this.game.blood.impact(this, i, b.x, sp);
      }
    }
  }

  /** Standing, and something heavy came flying in: a body, a shield. */
  bumped() {
    let best = 0, part = -1;
    for (let i = 0; i < NP; i++) {
      const b = this.bodies[i];
      const o = b.impactOther;
      if (b.impact <= best || !o || o.owner === this || o.kinematic || o.isStatic) continue;
      best = b.impact; part = i;
    }
    if (best < 3.2) return;
    const b = this.bodies[part], o = b.impactOther;
    // a body that has been lying on the ground a moment does not fly at
    // anyone; if it moves, it is being stepped on
    const oh = o.owner;
    if (oh && oh.bodies && (oh.state === 'ragdoll' || oh.state === 'dead') &&
        (o.x.y - this.root.y < 0.35 || !oh.down || oh.down.t > 0.8)) return;
    const dir = new Vector3().subVectors(b.x, o.x);
    if (dir.lengthSq() < 1e-6) return;
    const sp = best;
    const J = Math.min(45, Math.min(o.mass, 15) * sp * 0.6);
    if (J < 10) return;
    dir.setY(0);
    if (dir.lengthSq() < 1e-6) dir.copy(o.v).setY(0);
    if (dir.lengthSq() < 1e-6) return;
    dir.normalize();
    this.takeHit({
      part, point: b.x.clone(), dir, J, speed: sp, damage: Math.max(0, (sp - 4) * 1.2),
      attacker: null, kind: 'impact', striker: null, weapon: null,
    });
  }

  updateFlinch(dt) {
    const f = this.flinch;
    const w = 16, z = 0.45;
    f.vx += (-w * w * f.x - 2 * z * w * f.vx) * dt;
    f.vy += (-w * w * f.y - 2 * z * w * f.vy) * dt;
    f.x += f.vx * dt; f.y += f.vy * dt;
    f.x = clamp(f.x, -0.6, 0.6); f.y = clamp(f.y, -0.6, 0.6);
  }

  applyFlinch(pose) {
    const f = this.flinch;
    if (Math.abs(f.x) + Math.abs(f.y) < 1e-4) return;
    const e = pose.e;
    e[P.lowerTorso * 3] += f.x * 0.2; e[P.middleTorso * 3] += f.x * 0.3; e[P.upperTorso * 3] += f.x * 0.3;
    e[P.neck * 3] += f.x * 0.5; e[P.head * 3] += f.x * 0.6;
    e[P.upperTorso * 3 + 1] += f.y * 0.3; e[P.neck * 3 + 1] += f.y * 0.4; e[P.head * 3 + 1] += f.y * 0.6;
  }

  /* -------------------------------- stumble ------------------------------ */

  setDynamic() {
    for (const b of this.bodies) {
      b.setKinematic(false);
      b.sleeping = false;
      b.linDamp = 0.08; b.angDamp = 0.8;
    }
    this.sleeping = false;
  }

  setMuscle(s) {
    // natural frequency of the muscle "spring", rad/s, and its damping
    const w = 3 + 27 * Math.pow(s, 1.4);
    for (const b of this.bodies) {
      if (s <= 0) { b.drive = null; continue; }
      const I = (b.inertia.x + b.inertia.y + b.inertia.z) / 3;
      const d = b.drive || (b.drive = {});
      d.pos = 1 / (b.mass * w * w);
      d.rot = 1 / (I * w * w * 1.6);
      d.lin = 1.2 * w;
      d.ang = 1.6 * w;
    }
  }

  enterStumble(dir, knock) {
    if (this.action) this.endAction();
    this.air = null;
    this.state = 'stumble';
    this.setDynamic();
    const sp = clamp(0.7 + knock * 0.045, 0.8, 2.6);
    this.stumble = {
      t: 0,
      dur: clamp(0.55 + knock * 0.02, 0.6, 1.4),
      vel: new Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(sp),
      strength: clamp(STUMBLE_STRENGTH - knock * 0.003, 0.24, 0.42),
    };
    this.blendIn = null;
    this.setMuscle(this.stumble.strength);
    this.game.emit('stumble', this);
  }

  updateStumble(dt) {
    const st = this.stumble;
    st.t += dt;
    // the muscles stay weak for a moment before they win back control
    const s = st.strength + (1 - st.strength) * smooth((st.t - st.dur * 0.3) / (st.dur * 0.7));
    this.setMuscle(s);
    st.vel.multiplyScalar(Math.exp(-1.6 * dt));
    this.root.addScaledVector(st.vel, dt);
    // stay with the body: the muscles pull toward the root, the root follows the hips
    const p = this.pelvis.x;
    const k = approach(5, dt);
    this.root.x += (p.x - this.root.x) * k;
    this.root.z += (p.z - this.root.z) * k;
    this.game.arena.confine(this.root, 0.3, this.mask);
    const g = this.game.groundAt(this.root.x, this.root.z);
    this.root.y += (g - this.root.y) * approach(10, dt);

    this.vel.set(st.vel.x, 0, st.vel.z);
    this.guard = 0;
    this.block = 0;
    this.buildPose(dt);
    blendParts(this.pose, FLAIL, clamp((1 - s) * 1.6, 0, 1), UPPER);
    this.place(dt, false, FEET);

    // fallen over?
    const ut = this.bodies[P.upperTorso];
    const upY = 1 - 2 * (ut.q.x * ut.q.x + ut.q.z * ut.q.z);    // world Y of the chest's up axis
    const tilt = Math.acos(clamp(upY, -1, 1));
    const height = p.y - this.root.y;
    if (tilt > 55 * D || height < 0.55) { this.enterRagdoll(); return; }
    if (st.t >= st.dur && tilt < 20 * D) this.recover();
  }

  /** Muscles back in charge: blend from the pose the body is in to the animation. */
  recover() {
    this.capture();
    for (const b of this.bodies) { b.setKinematic(true); b.drive = null; }
    this.state = 'active';
    this.stumble = null;
    this.vel.set(0, 0, 0);
    this.blendIn = { t: 0, dur: 0.22 };
    if (this.controller && this.controller.recovered) this.controller.recovered();
  }

  /** Remembers the pose the bodies are in: the hips in the world, every other joint relative to its parent. */
  capture() {
    for (let i = 0; i < NP; i++) {
      this.capPos[i].copy(this.bodies[i].x);
      this.capQuat[i].copy(this.bodies[i].q);
    }
    for (let i = 1; i < NP; i++) {
      this.capLocal[i].copy(this.capQuat[PARTS[i].parent]).invert().multiply(this.capQuat[i]);
    }
  }

  /**
   * Mixes the captured pose into the animated targets, w = 0 all captured,
   * 1 all animation. The mix is done joint by joint and the skeleton rebuilt
   * from the hips out, so every bone stays attached at every moment of it.
   */
  blendFrom(w) {
    const lq = _blendQ;
    lq[0].identity();
    for (let i = 1; i < NP; i++) lq[i].slerpQuaternions(this.capLocal[i], this.jq[i], w);
    _bq.slerpQuaternions(this.capQuat[0], this.tQuat[0], w);
    _bp.lerpVectors(this.capPos[0], this.tPos[0], w);
    _bp.sub(_v1.copy(PARTS[0].restJoint).applyQuaternion(_bq));
    forwardKinematics(_bp, _bq, _ZERO, lq, this.tPos, this.tQuat);
  }

  /* -------------------------------- ragdoll ------------------------------ */

  enterRagdoll() {
    if (this.action) this.endAction();
    this.air = null;
    if (this.state !== 'stumble' && this.state !== 'ragdoll') this.setDynamic();
    for (const b of this.bodies) b.drive = null;
    this.state = this.alive ? 'ragdoll' : 'dead';
    this.stumble = null;
    this.getup = null;
    this.blendIn = null;
    this.block = 0;
    const hurt = 1 - this.health / this.maxHealth;
    this.down = this.team === 'player'
      ? { t: 0, wait: rand(0.7, 1.1) + hurt * 1.1 }
      : { t: 0, wait: rand(1.2, 2.4) + hurt * 2.0 };
    this.still = 0;
    this.vel.set(0, 0, 0);
    this.game.emit('down', this);
  }

  updateDown(dt) {
    const d = this.down;
    d.t += dt;
    const max = this.settle(dt);
    this.quiet = max < 0.16 ? (this.quiet || 0) + dt : 0;
    if (this.alive && d.t > d.wait && this.quiet > 0.25) this.startGetup();
  }

  updateDead(dt) {
    if (this.down) this.down.t += dt;
    if (!this.sleeping) this.settle(dt);
  }

  /**
   * A body lying still settles: once it has been down a moment the joints
   * stiffen with friction so the small parts stop twitching, and once it is
   * quiet it sleeps until something touches it. Returns the largest speed
   * squared of any part.
   */
  settle(dt) {
    let sum = 0, max = 0;
    for (const b of this.bodies) {
      const v = b.v.lengthSq();
      sum += v;
      if (v > max) max = v;
    }
    const p = this.pelvis.x;
    const g = this.game.groundAt(p.x, p.z);
    const grounded = p.y - g < 1.2;
    const t = this.down ? this.down.t : 0;
    const k = grounded ? clamp((t - 0.8) / 1.0, 0, 1) : 0;
    for (const b of this.bodies) { b.linDamp = 0.08 + 1.8 * k; b.angDamp = 0.8 + 6 * k; }
    // judged on a smoothed average, so one twitching hand does not keep a body awake
    this.restAvg = (this.restAvg == null ? sum / NP : this.restAvg + (sum / NP - this.restAvg) * Math.min(1, dt * 4));
    this.still = grounded && this.restAvg < 0.025 ? this.still + dt : 0;
    if (!this.sleeping && this.still > 0.5) this.sleep();
    return max;
  }

  sleep() {
    this.sleeping = true;
    for (const b of this.bodies) { b.sleeping = true; b.v.set(0, 0, 0); b.w.set(0, 0, 0); }
  }

  wake() {
    if (!this.sleeping) return;
    this.sleeping = false;
    this.still = 0;
    this.restAvg = null;
    for (const b of this.bodies) b.sleeping = false;
  }

  die(cause) {
    if (!this.alive) return;
    this.alive = false;
    this.health = 0;
    if (this.state === 'active' || this.state === 'getup' || this.state === 'stumble') this.enterRagdoll();
    this.state = 'dead';
    this.wantBlock = false;
    this.dropAll();
    this.paintFace('dead');
    this.game.onDeath(this, cause);
  }

  paintFace(expr) {
    if (this.faceExpr === expr || this.faceExpr === 'dead') return;
    this.faceExpr = expr;
    paintHead(this.paint.ctx, this.layout.tiles[P.head], this.look, expr);
    this.paint.dirty = true;
  }

  /* --------------------------------- get up ------------------------------ */

  startGetup() {
    this.wake();
    const ut = this.bodies[P.upperTorso], pv = this.pelvis;
    // which way the chest faces: up means lying on the back
    const fwd = _v1.set(0, 0, 1).applyQuaternion(ut.q);
    const supine = fwd.y > 0;
    const dir = _v2.subVectors(ut.x, pv.x).setY(0);
    if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0).applyQuaternion(pv.q).setY(0);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    this.heading = supine ? Math.atan2(-dir.x, -dir.z) : Math.atan2(dir.x, dir.z);
    this.root.set(pv.x.x, this.game.groundAt(pv.x.x, pv.x.z), pv.x.z);
    this.capture();
    for (const b of this.bodies) { b.setKinematic(true); b.drive = null; }
    this.state = 'getup';
    this.getup = { clip: supine ? GETUP_BACK : GETUP_FRONT, t: 0 };
    this.blendIn = { t: 0, dur: 0.38 };
    this.down = null;
  }

  updateGetup(dt) {
    const gu = this.getup;
    // you get up a little quicker than they do
    gu.t += dt * (this.team === 'player' ? 1.35 : 1);
    this.root.y += (this.game.groundAt(this.root.x, this.root.z) - this.root.y) * approach(10, dt);
    if (gu.t >= gu.clip.duration) {
      // hand the distance travelled over to the root
      gu.clip.sample(gu.clip.duration, this.pose);
      const o = _v1.set(this.pose.off.x, 0, this.pose.off.z).applyAxisAngle(UP, this.heading);
      this.root.add(o);
      this.game.arena.confine(this.root, 0.3, this.mask);
      this.state = 'active';
      this.getup = null;
      this.blendIn = null;
      this.vel.set(0, 0, 0);
      this.upTime = 0;
      this.balance = Math.max(this.balance, 60);
      this.updateActive(dt);
      return;
    }
    gu.clip.sample(gu.t, this.pose);
    this.applyFlinch(this.pose);
    this.place(dt, false, null);
  }

  /* -------------------------------- gear --------------------------------- */

  /** Puts an item (an ITEMS id, or null) in the right hand or on the left arm. */
  equip(slot, kind) {
    const field = slot === 'offhand' ? 'shield' : 'weapon';
    const cur = this[field];
    if (cur && cur.kind === kind) return;
    if (cur) this.game.removeHeld(cur);
    this[field] = kind ? this.game.addHeld(kind).attach(this) : null;
  }

  giveGun() {
    this.gun = this.game.addHeld('pistol').attach(this);
  }

  dropAll() {
    for (const f of ['weapon', 'shield', 'gun']) {
      const h = this[f];
      if (!h) continue;
      h.drop();
      this.game.dropped.push(h);
      this[f] = null;
    }
  }

  /* -------------------------------- drawing ------------------------------ */

  syncVisual(alpha) {
    for (let i = 0; i < NP; i++) {
      const b = this.bodies[i];
      _v1.lerpVectors(this.prevPos[i], b.x, alpha);
      _q1.slerpQuaternions(this.prevQuat[i], b.q, alpha);
      this.bones[i].matrixWorld.compose(_v1, _q1, _scale);
    }
  }

  /** Fades a body out (0..1); used to clear the arena of the dead. */
  setFade(f) {
    this.fade = f;
    const m = this.material;
    m.transparent = f < 1;
    m.opacity = f;
    m.depthWrite = f > 0.5;
  }

  remove() {
    if (this.removed) return;
    this.removed = true;
    this.game.guns.dropLaser(this);
    if (this.action) this.endAction();
    for (const f of ['weapon', 'shield', 'gun']) {
      if (this[f]) { this.game.removeHeld(this[f]); this[f] = null; }
    }
    for (const j of this.joints) this.game.world.removeJoint(j);
    for (const b of this.bodies) this.game.world.remove(b);
    this.game.scene.remove(this.mesh);
    this.material.dispose();
    this.paint.dispose();
    this.mesh.skeleton.dispose();
  }
}
