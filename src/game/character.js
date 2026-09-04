/* =============================================================================
   A character: player and citizen alike.

   The rig is always animated by forward kinematics, and the ragdoll particles
   are always simulated. A single "muscle strength" value decides which of the
   two you actually see:

     1.00  fully in control - the ragdoll is pinned to the animation
     0.30  stumbling        - physics leads, muscles fight to stay upright,
                              and the character can still steer
     0.06  ragdolling       - limp, but a living body still twitches and shoves
     0.01  dead

   Getting up ramps that number back to one over the length of the get-up clip,
   so the ragdoll melts into the animation instead of snapping to it.
   ========================================================================== */
import { Vector3, Quaternion, Matrix4 } from 'three';
import { SkeletonRig, HIP_HEIGHT, boneBoxCenter, worldToBoxLocal, boneCorners, pointInBone } from './skeleton.js';
import { Body } from './body.js';
import { Animator } from './animator.js';
import { Particle, DistanceConstraint } from '../physics/world.js';
import { clamp, clamp01, lerp, damp, dampAngle, angleDelta, makeRng, smoothstep } from '../core/util.js';

const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3(), _v4 = new Vector3();
const _q1 = new Quaternion(), _q2 = new Quaternion();
const _m4 = new Matrix4();
const UP = new Vector3(0, 1, 0);

export const STATE = {
  CONTROLLED: 'controlled',
  STUMBLE: 'stumble',
  RAGDOLL: 'ragdoll',
  GETUP: 'getup',
  DEAD: 'dead',
};

/* Particle layout: name -> { mass, radius, joint } where joint says which bone
   end the muscle target comes from. */
function particleLayout() {
  const L = [
    ['hip', 7.0, 0.13, 'pelvis', 'pos'],
    ['pelvisTop', 5.0, 0.12, 'pelvis', 'end'],
    ['lt', 5.0, 0.12, 'lowerTorso', 'end'],
    ['mt', 6.0, 0.13, 'midTorso', 'end'],
    ['shoulders', 7.0, 0.13, 'upperTorso', 'end'],
    ['neckTop', 2.5, 0.07, 'neck', 'end'],
    ['headTop', 4.5, 0.11, 'head', 'end'],
  ];
  for (const S of ['R', 'L']) {
    L.push([`shoulder${S}`, 2.2, 0.09, 'upperArm' + S, 'pos']);
    L.push([`elbow${S}`, 2.0, 0.07, 'upperArm' + S, 'end']);
    L.push([`wrist${S}`, 1.4, 0.06, 'lowerArm' + S, 'end']);
    L.push([`handEnd${S}`, 0.9, 0.06, 'hand' + S, 'end']);
    L.push([`hip${S}`, 3.5, 0.10, 'upperLeg' + S, 'pos']);
    L.push([`knee${S}`, 3.5, 0.08, 'upperLeg' + S, 'end']);
    L.push([`ankle${S}`, 2.2, 0.07, 'lowerLeg' + S, 'end']);
    L.push([`toe${S}`, 1.1, 0.06, 'foot' + S, 'end']);
  }
  return L;
}

/* bone -> [proximal particle, distal particle] */
function boneParticleMap() {
  const m = {
    pelvis: ['hip', 'pelvisTop'],
    lowerTorso: ['pelvisTop', 'lt'],
    midTorso: ['lt', 'mt'],
    upperTorso: ['mt', 'shoulders'],
    neck: ['shoulders', 'neckTop'],
    head: ['neckTop', 'headTop'],
  };
  for (const S of ['R', 'L']) {
    m['upperArm' + S] = [`shoulder${S}`, `elbow${S}`];
    m['lowerArm' + S] = [`elbow${S}`, `wrist${S}`];
    m['hand' + S] = [`wrist${S}`, `handEnd${S}`];
    m['upperLeg' + S] = [`hip${S}`, `knee${S}`];
    m['lowerLeg' + S] = [`knee${S}`, `ankle${S}`];
    m['foot' + S] = [`ankle${S}`, `toe${S}`];
  }
  return m;
}

let _charId = 1;

export class Character {
  constructor(world, look, opts = {}) {
    this.id = _charId++;
    this.world = world;
    this.look = look;
    this.isPlayer = !!opts.isPlayer;
    this.name = opts.name || 'Citizen';
    this.rng = makeRng(opts.seed || (Math.random() * 1e9) | 0);

    this.rig = new SkeletonRig();
    this.animator = new Animator(this.rig);
    this.body = new Body(this.rig, look, { castShadow: opts.castShadow !== false, seed: opts.seed || 1 });
    this.body.setVisible(!this.isPlayer || opts.showSelf !== false);

    /* --------------------------- motion state --------------------------- */
    this.state = STATE.CONTROLLED;
    this.strength = 1;
    this.targetStrength = 1;
    this.pos = new Vector3(opts.x || 0, HIP_HEIGHT, opts.z || 0);
    this.vel = new Vector3();
    this.yaw = opts.yaw || 0;
    this.pitch = 0;
    this.grounded = true;
    this.groundHeight = 0;
    this.coyote = 0;
    this.crouch = 0;
    this.crouchWant = false;
    this.moveInput = new Vector3();   // world space XZ, length 0..1
    this.wantRun = true;
    this.wantJump = false;
    this.jumpBuffer = 0;
    this.speedWalk = 2.15;
    this.speedRun = 5.05;
    this.speedCrouch = 1.15;
    this.center = new Vector3().copy(this.pos);

    /* ------------------------------ health ------------------------------ */
    this.maxHealth = 100;
    this.health = 100;
    this.balance = 1;
    this.dead = false;
    this.stateTime = 0;
    this.uprightTime = 0;
    this.downTime = 0;
    this.getUpDelay = 0;
    this.painTimer = 0;
    this.lastDamageTime = -99;
    this.lastAttacker = null;
    this.bleeding = 0;
    this.partHealth = Object.create(null);
    for (const b of this.rig.bones) this.partHealth[b.name] = b.hp;

    /* ------------------------------ combat ------------------------------ */
    this.equipped = 'fists';
    this.punchSide = 'R';
    this.punchCooldown = 0;
    this.struck = new Set();
    this.prevHand = { R: new Vector3(), L: new Vector3() };
    this.handVel = { R: new Vector3(), L: new Vector3() };
    this.onDamage = null;        // (info) => void, wired by the game
    this.onFootstep = null;
    this.collidable = true;

    /* ---------------------------- physics rig --------------------------- */
    this.particles = Object.create(null);
    this.particleList = [];
    this.constraints = [];
    this.collisionParticles = [];
    this.boneParticles = boneParticleMap();
    this._buildPhysics();

    this._physPos = this.rig.bones.map(() => new Vector3());
    this._physQuat = this.rig.bones.map(() => new Quaternion());
    this._rootPhys = new Quaternion();
    this._blendQ = new Quaternion();

    world.addCharacter(this);
    this.teleport(this.pos.x, this.pos.z, this.yaw);
  }

  /* ------------------------------------------------------------------ setup */

  _buildPhysics() {
    // Put the rig in its rest pose so the particle rest lengths are exact.
    this.rig.resetPose();
    this.rig.rootPos.set(0, HIP_HEIGHT, 0);
    this.rig.rootQuat.identity();
    this.rig.updateFK();

    for (const [name, mass, radius, boneName, which] of particleLayout()) {
      const bone = this.rig.byName[boneName];
      const src = which === 'pos' ? bone.worldPos : bone.worldEnd;
      const p = new Particle(src.x, src.y, src.z, { mass, radius, owner: this, name });
      this.particles[name] = p;
      this.particleList.push(p);
      this.world.addParticle(p);
    }

    const P = this.particles;
    const link = (a, b, kind = 'eq', stiff = 1, restOverride = null) => {
      const pa = P[a], pb = P[b];
      const rest = restOverride != null ? restOverride : distance(pa, pb);
      const c = new DistanceConstraint(pa, pb, rest, kind, stiff);
      this.constraints.push(c);
      this.world.addConstraint(c);
      return c;
    };

    // ---- bone lengths ----
    for (const boneName of Object.keys(this.boneParticles)) {
      const [a, b] = this.boneParticles[boneName];
      link(a, b, 'eq', 1);
    }

    // ---- shoulder and hip girdles ----
    for (const S of ['R', 'L']) {
      link('mt', `shoulder${S}`, 'eq', 1);
      link('shoulders', `shoulder${S}`, 'eq', 1);
      link('neckTop', `shoulder${S}`, 'eq', 0.6);
      link('hip', `hip${S}`, 'eq', 1);
      link('pelvisTop', `hip${S}`, 'eq', 1);
    }
    link('shoulderR', 'shoulderL', 'eq', 1);
    link('hipR', 'hipL', 'eq', 1);
    // torso bracing so the spine does not concertina
    link('shoulderR', 'hipL', 'eq', 0.85);
    link('shoulderL', 'hipR', 'eq', 0.85);
    link('shoulderR', 'hipR', 'eq', 0.85);
    link('shoulderL', 'hipL', 'eq', 0.85);
    link('lt', 'shoulders', 'eq', 0.75);
    link('hip', 'mt', 'eq', 0.75);
    link('hip', 'shoulders', 'eq', 0.55);
    link('pelvisTop', 'mt', 'eq', 0.6);
    link('lt', 'neckTop', 'eq', 0.4);
    link('shoulders', 'headTop', 'min', 0.8, 0.235);
    link('mt', 'neckTop', 'min', 0.5, 0.235);

    // ---- joint limits ----
    for (const S of ['R', 'L']) {
      link(`shoulder${S}`, `wrist${S}`, 'max', 1, 0.532);   // elbow cannot invert
      link(`shoulder${S}`, `wrist${S}`, 'min', 0.7, 0.185);  // nor fold flat
      link(`hip${S}`, `ankle${S}`, 'max', 1, 0.842);         // knee cannot invert
      link(`hip${S}`, `ankle${S}`, 'min', 0.7, 0.255);
      link(`elbow${S}`, `handEnd${S}`, 'max', 0.8, 0.352);
      link(`knee${S}`, `toe${S}`, 'max', 0.8, 0.575);
      link(`hip${S}`, `hip${S === 'R' ? 'L' : 'R'}`, 'min', 0.3, 0.16);
      link(`shoulder${S}`, `elbow${S === 'R' ? 'L' : 'R'}`, 'min', 0.25, 0.30);
    }

    // ---- segments, so limbs do not sink into the floor ----
    for (const boneName of ['upperArmR', 'lowerArmR', 'upperArmL', 'lowerArmL',
      'upperLegR', 'lowerLegR', 'upperLegL', 'lowerLegL',
      'pelvis', 'lowerTorso', 'midTorso', 'upperTorso']) {
      const [a, b] = this.boneParticles[boneName];
      const bone = this.rig.byName[boneName];
      this.world.addSegment({
        a: P[a], b: P[b],
        radius: Math.min(bone.boxHalf.x, bone.boxHalf.z) * 0.95,
        part: boneName,
      });
    }

    this.collisionParticles = [
      P.headTop, P.neckTop, P.shoulders, P.mt, P.lt, P.hip,
      P.elbowR, P.elbowL, P.handEndR, P.handEndL,
      P.kneeR, P.kneeL, P.ankleR, P.ankleL,
    ];
  }

  /* ---------------------------------------------------------------- helpers */

  teleport(x, z, yaw = this.yaw, y = null) {
    this.pos.set(x, y != null ? y : this._groundHeight(x, z, 1e9) + HIP_HEIGHT, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.state = STATE.CONTROLLED;
    this.strength = 1; this.targetStrength = 1;
    this.balance = 1;
    this.animator.cancelFull();
    this.animator.cancelAction();
    this.animator.playBase('idle', { fade: 0 });
    this.rig.resetPose();
    this.rig.rootPos.copy(this.pos);
    this.rig.rootQuat.setFromAxisAngle(UP, this.yaw);
    this.rig.updateFK();
    this._snapParticlesToRig();
    this.body.sync();
  }

  _snapParticlesToRig() {
    for (const [name, , , boneName, which] of particleLayout()) {
      const bone = this.rig.byName[boneName];
      const src = which === 'pos' ? bone.worldPos : bone.worldEnd;
      const p = this.particles[name];
      p.setPosition(src.x, src.y, src.z);
      p.tx = src.x; p.ty = src.y; p.tz = src.z;
      p.ptx = src.x; p.pty = src.y; p.ptz = src.z;
    }
  }

  get isDown() {
    return this.state === STATE.RAGDOLL || this.state === STATE.DEAD || this.state === STATE.GETUP;
  }
  get isRagdolling() {
    return this.state !== STATE.CONTROLLED;
  }

  /** Where the eyes are, for cameras and for line of sight. */
  eyePosition(out) {
    const head = this.rig.byName.head;
    boneBoxCenter(head, out);
    _v1.set(0, -head.boxHalf.y * 0.02, -head.boxHalf.z * 0.62).applyQuaternion(head.worldQuat);
    return out.add(_v1);
  }

  chestPosition(out) {
    return boneBoxCenter(this.rig.byName.upperTorso, out);
  }

  /* ------------------------------------------------------------- ground scan */

  _groundHeight(x, z, fromY) {
    const w = this.world;
    let best = -Infinity;
    if (w.hasGround && x > w.groundMin.x && x < w.groundMax.x && z > w.groundMin.z && z < w.groundMax.z) {
      best = w.groundY;
    }
    const consider = (b) => {
      if (x < b.aabbMin.x || x > b.aabbMax.x || z < b.aabbMin.z || z > b.aabbMax.z) return;
      let top;
      if (b.shape === 'sphere') {
        const dx = x - b.pos.x, dz = z - b.pos.z;
        const r2 = b.radius * b.radius - dx * dx - dz * dz;
        if (r2 <= 0) return;
        top = b.pos.y + Math.sqrt(r2);
      } else {
        top = b.aabbMax.y;
      }
      if (top <= fromY + 0.42 && top > best) best = top;
    };
    for (let i = 0; i < w.staticBodies.length; i++) consider(w.staticBodies[i]);
    for (let i = 0; i < w.bodies.length; i++) consider(w.bodies[i]);
    return best;
  }

  /* ----------------------------------------------------------- state machine */

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
    if (s === STATE.STUMBLE) {
      this.animator.cancelAction();
      this.animator.playBase('stagger', { fade: 0.14 });
      this.targetStrength = 0.34;
    } else if (s === STATE.RAGDOLL) {
      this.animator.cancelAction();
      this.animator.playBase('fall', { fade: 0.2 });
      this.targetStrength = this.dead ? 0.012 : 0.075;
      this.getUpDelay = 0.55 + this.rng() * 1.1;
    } else if (s === STATE.GETUP) {
      this.targetStrength = 0.14;
    } else if (s === STATE.CONTROLLED) {
      this.targetStrength = 1;
      this.balance = Math.max(this.balance, 0.75);
    } else if (s === STATE.DEAD) {
      this.targetStrength = 0.012;
      this.dead = true;
      this.body.setExpression('frown');
    }
  }

  /** Knocks the character about. `force` is an impulse in kg*m/s. */
  applyImpact(point, force, { boneName = null, damage = 0, type = 'blunt', attacker = null, severity = null } = {}) {
    if (this.dead && damage <= 0) return;
    const mag = force.length();

    // spread the impulse over the nearest particles
    let nearest = null, nd = Infinity;
    for (let i = 0; i < this.particleList.length; i++) {
      const p = this.particleList[i];
      const d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2 + (p.z - point.z) ** 2;
      if (d < nd) { nd = d; nearest = p; }
    }
    if (nearest) {
      const dt = this.world.fixedStep / this.world.substeps;
      const inv = nearest.invMass;
      nearest.addVelocity(force.x * inv, force.y * inv, force.z * inv, dt);
      // neighbours take a share so the whole body reacts, not just one joint
      for (let i = 0; i < this.particleList.length; i++) {
        const p = this.particleList[i];
        if (p === nearest) continue;
        const d = Math.sqrt((p.x - point.x) ** 2 + (p.y - point.y) ** 2 + (p.z - point.z) ** 2);
        if (d > 0.55) continue;
        const k = (1 - d / 0.55) * 0.34 * p.invMass;
        p.addVelocity(force.x * k, force.y * k, force.z * k, dt);
      }
    }

    if (damage > 0) this.applyDamage(damage, { boneName, point, type, attacker, force, severity });

    // balance loss scales with how hard, how high and how off-centre the hit is
    const height = clamp01((point.y - (this.pos.y - HIP_HEIGHT)) / 1.8);
    const loss = (mag / 125) * (0.55 + height * 0.9);
    this.balance = clamp01(this.balance - loss);
    this._checkBalance();
  }

  applyDamage(amount, { boneName = null, point = null, type = 'blunt', attacker = null, force = null, severity = null } = {}) {
    if (this.dead) {
      // corpses still take visible damage
      this.onDamage?.({ character: this, boneName, point, type, amount, severity: severity ?? clamp01(amount / 14), force, fatal: false });
      return;
    }
    if (boneName && this.partHealth[boneName] != null) {
      this.partHealth[boneName] = Math.max(0, this.partHealth[boneName] - amount);
    }
    const headshot = boneName === 'head' || boneName === 'neck';
    const dealt = amount * (headshot ? 1.85 : 1);
    this.health = Math.max(0, this.health - dealt);
    this.lastDamageTime = performance.now() / 1000;
    if (attacker) this.lastAttacker = attacker;
    this.painTimer = Math.max(this.painTimer, 0.6);
    if (dealt > 6) this.bleeding = Math.min(4, this.bleeding + dealt * 0.06);

    this.onDamage?.({
      character: this, boneName, point, type, amount: dealt, force,
      severity: severity ?? clamp01(amount / 14),
      fatal: this.health <= 0,
    });

    if (this.health <= 0) this.die();
    else if (dealt > 9) this.balance = clamp01(this.balance - dealt / 40);
    this._checkBalance();
  }

  _checkBalance() {
    if (this.dead) return;
    if (this.state === STATE.CONTROLLED || this.state === STATE.GETUP) {
      if (this.balance < 0.16) { this.animator.cancelFull(); this.setState(STATE.RAGDOLL); }
      else if (this.balance < 0.55) { this.animator.cancelFull(); this.setState(STATE.STUMBLE); }
    } else if (this.state === STATE.STUMBLE && this.balance < 0.14) {
      this.setState(STATE.RAGDOLL);
    }
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.health = 0;
    this.setState(STATE.DEAD);
  }

  /* --------------------------------------------------------------- movement */

  update(dt) {
    this.stateTime += dt;
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.painTimer = Math.max(0, this.painTimer - dt);
    this.bleeding = Math.max(0, this.bleeding - dt * 0.35);
    if (!this.dead) this.balance = clamp01(this.balance + dt * 0.36);
    this.strength = damp(this.strength, this.targetStrength, 9, dt);

    switch (this.state) {
      case STATE.CONTROLLED: this._updateControlled(dt); break;
      case STATE.STUMBLE: this._updateStumble(dt); break;
      case STATE.RAGDOLL: this._updateRagdoll(dt); break;
      case STATE.GETUP: this._updateGetUp(dt); break;
      case STATE.DEAD: this._updateDead(dt); break;
      default: break;
    }

    this.animator.update(dt);
    this._applyLookOffsets();
    this.rig.updateFK();
    this._writeMuscleTargets();
  }

  _updateControlled(dt) {
    const w = this.world;
    // --- crouch ---
    this.crouch = damp(this.crouch, this.crouchWant && this.grounded ? 1 : 0, 11, dt);

    // --- horizontal movement ---
    const wish = _v1.set(this.moveInput.x, 0, this.moveInput.z);
    const wishLen = Math.min(1, wish.length());
    if (wishLen > 1e-4) wish.multiplyScalar(1 / wish.length());
    const running = this.wantRun && wishLen > 0.72 && this.crouch < 0.4;
    let speed = this.crouch > 0.45 ? this.speedCrouch : (running ? this.speedRun : this.speedWalk);
    speed *= wishLen;
    speed *= lerp(1, 0.55, clamp01(1 - this.health / this.maxHealth) * 0.9);

    const accel = this.grounded ? 15 : 4.2;
    const targetVX = wish.x * speed, targetVZ = wish.z * speed;
    this.vel.x = damp(this.vel.x, targetVX, accel, dt);
    this.vel.z = damp(this.vel.z, targetVZ, accel, dt);

    // --- jump ---
    if (this.wantJump) { this.jumpBuffer = 0.16; this.wantJump = false; }
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0)) {
      this.vel.y = 7.55;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.animator.playBase('jump', { fade: 0.06, restart: true });
      this._jumpLatch = 0.28;
    }

    // --- gravity and ground ---
    this.vel.y += w.gravity.y * dt;
    this.pos.addScaledVector(this.vel, dt);

    const feetY = this.pos.y - HIP_HEIGHT;
    const gh = this._groundHeight(this.pos.x, this.pos.z, feetY);
    this.groundHeight = gh;
    const wasGrounded = this.grounded;
    if (feetY <= gh + 0.02 && this.vel.y <= 0.01) {
      const fallSpeed = -this.vel.y;
      this.pos.y = gh + HIP_HEIGHT;
      this.vel.y = 0;
      this.grounded = true;
      this.coyote = 0.12;
      if (!wasGrounded && fallSpeed > 9) this._landHard(fallSpeed);
    } else {
      this.grounded = false;
      this.coyote = Math.max(0, this.coyote - dt);
    }
    if (this.pos.y < w.killY) return;

    this._resolveBodyCollisions(dt);

    // --- animation selection ---
    this._jumpLatch = Math.max(0, (this._jumpLatch || 0) - dt);
    const planar = Math.hypot(this.vel.x, this.vel.z);
    if (!this.grounded) {
      if (this._jumpLatch > 0) this.animator.playBase('jump', { fade: 0.08 });
      else this.animator.playBase('fall', { fade: 0.18 });
    } else if (this.crouch > 0.45) {
      if (planar > 0.35) {
        this.animator.playBase('crouchWalk', { fade: 0.18 });
        this.animator.setBaseSpeed(clamp(planar / 1.15, 0.55, 1.7));
      } else {
        this.animator.playBase('crouchIdle', { fade: 0.22 });
      }
    } else if (planar > 3.0) {
      this.animator.playBase('run', { fade: 0.18 });
      this.animator.setBaseSpeed(clamp(planar / 5.05, 0.7, 1.5));
    } else if (planar > 0.22) {
      this.animator.playBase('walk', { fade: 0.2 });
      this.animator.setBaseSpeed(clamp(planar / 2.15, 0.55, 1.6));
    } else {
      this.animator.playBase('idle', { fade: 0.26 });
      this.animator.setBaseSpeed(1);
    }

    // upper body layer for whatever is in hand
    if (this.animator.actionActive) {
      /* the jab owns the arms */
    } else if (this.equipped === 'rcv2') {
      this.animator.setUpper('holding');
    } else {
      this.animator.setUpper(this.isPlayer || this.combatReady ? 'fistGuard' : null);
    }

    // --- rig root ---
    const bob = this.animator.rootYOffset;
    this.rig.rootPos.set(this.pos.x, this.pos.y + bob, this.pos.z);
    this.rig.rootQuat.setFromAxisAngle(UP, this.yaw);
  }

  _landHard(fallSpeed) {
    const dmg = (fallSpeed - 9) * 2.6;
    if (dmg <= 0) return;
    this.balance = clamp01(this.balance - (fallSpeed - 8) * 0.10);
    const point = _v2.set(this.pos.x, this.pos.y - HIP_HEIGHT + 0.1, this.pos.z);
    this.applyDamage(dmg, {
      boneName: this.rng() < 0.5 ? 'lowerLegR' : 'lowerLegL',
      point, type: fallSpeed > 15 ? 'impact' : 'blunt',
      severity: clamp01((fallSpeed - 8) / 14),
    });
    this._checkBalance();
  }

  /** Keeps the walking capsule out of crates and boulders. */
  _resolveBodyCollisions(dt) {
    const w = this.world;
    const feet = this.pos.y - HIP_HEIGHT;
    const top = feet + lerp(1.72, 1.12, this.crouch);
    const radius = 0.27;

    for (let i = 0; i < w.bodies.length; i++) {
      const b = w.bodies[i];
      if (b.aabbMax.y < feet + 0.06 || b.aabbMin.y > top) continue;
      if (Math.abs(b.pos.x - this.pos.x) > 3 || Math.abs(b.pos.z - this.pos.z) > 3) continue;
      // Low enough to stand on: the ground scan already handles it.
      if (b.aabbMax.y <= feet + 0.42) continue;

      _v1.set(this.pos.x, clamp(b.pos.y, feet + 0.3, top), this.pos.z);
      b.closestPoint(_v1, _v2);
      _v3.set(_v1.x - _v2.x, 0, _v1.z - _v2.z);
      let d = _v3.length();
      if (d < 1e-5) {
        _v3.set(this.pos.x - b.pos.x, 0, this.pos.z - b.pos.z);
        if (_v3.lengthSq() < 1e-8) _v3.set(1, 0, 0);
        d = 0;
      }
      _v3.normalize();
      if (d >= radius) continue;

      const pen = radius - d;
      const massRatio = b.invMass > 0 ? clamp(b.mass / (b.mass + 78), 0, 0.6) : 0;
      this.pos.addScaledVector(_v3, pen * (1 - massRatio));
      if (b.invMass > 0) {
        _v4.copy(_v3).multiplyScalar(-pen * 1400 * Math.min(dt, 0.033));
        b.applyImpulse(_v4, _v2);
      }
      const vn = this.vel.x * _v3.x + this.vel.z * _v3.z;
      if (vn < 0) { this.vel.x -= vn * _v3.x; this.vel.z -= vn * _v3.z; }
    }
  }

  _updateStumble(dt) {
    const P = this.particles;
    this.animator.playBase('stagger', { fade: 0.2 });
    this.animator.setUpper(null);
    this.targetStrength = lerp(0.22, 0.46, clamp01(this.balance / 0.55));

    // Root comes from the ragdoll, so the pose is relative to where the body is.
    this._rootFromPhysics();

    const hipY = P.hip.y - this._feetReference();
    const upright = this._uprightness();
    if (upright > 0.62 && hipY > 0.62 && Math.abs(P.hip.y - P.hip.py) < 0.03) {
      this.uprightTime += dt;
    } else {
      this.uprightTime = 0;
    }
    if (this.uprightTime > 0.42 && this.balance > 0.5) {
      // caught it
      this.pos.set(P.hip.x, this._groundHeight(P.hip.x, P.hip.z, P.hip.y) + HIP_HEIGHT, P.hip.z);
      this.vel.set((P.hip.x - P.hip.px) * 60, 0, (P.hip.z - P.hip.pz) * 60);
      this.yaw = this._physicsYaw();
      this.uprightTime = 0;
      this.setState(STATE.CONTROLLED);
      return;
    }
    if (upright < 0.30 || hipY < 0.42) {
      this.downTime += dt;
      if (this.downTime > 0.28) { this.downTime = 0; this.setState(STATE.RAGDOLL); }
    } else this.downTime = 0;
  }

  _updateRagdoll(dt) {
    this.animator.setUpper(null);
    this._rootFromPhysics();
    this.targetStrength = this.dead ? 0.012 : 0.075;
    this.getUpDelay -= dt;

    if (!this.dead) {
      // Alive ragdolls are not sacks of flour: they writhe.
      this.painTimer = Math.max(this.painTimer, 0.05);
      if (this.rng() < dt * 5.5) {
        const limb = this.particleList[this.rng.int(0, this.particleList.length - 1)];
        const k = (0.5 + this.rng()) * (this.painTimer > 0.3 ? 2.2 : 0.9);
        limb.addVelocity((this.rng() - 0.5) * 2.6 * k, this.rng() * 1.8 * k, (this.rng() - 0.5) * 2.6 * k, 1 / 90);
      }
      // deliberate shoving with the arms and legs to right themselves
      if (this.wantsUp && this.getUpDelay < 0.4) {
        const push = _v1.set(this.moveInput.x, 0, this.moveInput.z);
        if (push.lengthSq() > 0.01) {
          push.normalize().multiplyScalar(3.2);
          this.particles.hip.addVelocity(push.x, 0.4, push.z, 1 / 90);
        }
      }
      const settled = this._ragdollSpeed() < 1.5;
      if (this.getUpDelay <= 0 && settled && this.wantsUp !== false && this.balance > 0.35) {
        this._beginGetUp();
      }
      this.balance = clamp01(this.balance + dt * 0.22);
    }
  }

  _updateDead(dt) {
    this._rootFromPhysics();
    this.targetStrength = 0.012;
    void dt;
  }

  get wantsUp() { return this._wantsUp !== false; }
  set wantsUp(v) { this._wantsUp = v; }

  _beginGetUp() {
    const P = this.particles;
    // Which way up are we? The chest's own up axis decides the animation.
    const chestUp = _v1.copy(_v2.set(P.shoulders.x - P.hip.x, P.shoulders.y - P.hip.y, P.shoulders.z - P.hip.z));
    const faceDown = this._facingDown();
    this.getUpYaw = this._physicsYaw();
    this.getUpX = P.hip.x;
    this.getUpZ = P.hip.z;
    this.setState(STATE.GETUP);
    this.animator.playFull(faceDown ? 'getUpFront' : 'getUpBack', () => {
      this.pos.set(this.getUpX, this._groundHeight(this.getUpX, this.getUpZ, 1e9) + HIP_HEIGHT, this.getUpZ);
      this.vel.set(0, 0, 0);
      this.yaw = this.getUpYaw;
      this.balance = Math.max(this.balance, 0.85);
      this.setState(STATE.CONTROLLED);
    });
    void chestUp;
  }

  _updateGetUp(dt) {
    const a = this.animator;
    const prog = a.fullActive ? clamp01(a.fullTime / 1.85) : 1;
    this.targetStrength = lerp(0.16, 1.0, smoothstep(prog * 1.12));
    const groundY = this._groundHeight(this.getUpX, this.getUpZ, 1e9);
    const absY = a.rootYAbs ? a.rootYAbs.value : HIP_HEIGHT;
    this.rig.rootPos.set(this.getUpX, groundY + absY, this.getUpZ);
    _q1.setFromAxisAngle(UP, this.getUpYaw);
    _q2.setFromAxisAngle(_v1.set(1, 0, 0), a.rootPitch);
    this.rig.rootQuat.copy(_q1).multiply(_q2);
    this.pos.set(this.getUpX, groundY + HIP_HEIGHT, this.getUpZ);
    void dt;
  }

  /* --------------------------------------------------- physics derived root */

  _feetReference() {
    return this._groundHeight(this.particles.hip.x, this.particles.hip.z, 1e9);
  }

  _uprightness() {
    const P = this.particles;
    const dy = P.shoulders.y - P.hip.y;
    const d = Math.hypot(P.shoulders.x - P.hip.x, dy, P.shoulders.z - P.hip.z) || 1;
    return dy / d;
  }

  _facingDown() {
    const P = this.particles;
    // chest forward axis = right x up
    _v1.set(P.hipR.x - P.hipL.x, P.hipR.y - P.hipL.y, P.hipR.z - P.hipL.z).normalize();
    _v2.set(P.shoulders.x - P.hip.x, P.shoulders.y - P.hip.y, P.shoulders.z - P.hip.z).normalize();
    _v3.copy(_v1).cross(_v2);   // local +Z (backwards)
    return _v3.y > 0;           // back is up => we are face down
  }

  _physicsYaw() {
    const P = this.particles;
    _v1.set(P.hipR.x - P.hipL.x, 0, P.hipR.z - P.hipL.z);
    if (_v1.lengthSq() < 1e-6) return this.yaw;
    _v1.normalize();
    // right = (sin(yaw+90), .., cos(yaw+90)) ; forward = -Z rotated by yaw
    return Math.atan2(_v1.x, _v1.z) - Math.PI / 2;
  }

  _ragdollSpeed() {
    let s = 0;
    for (let i = 0; i < this.particleList.length; i++) {
      const p = this.particleList[i];
      s += Math.hypot(p.x - p.px, p.y - p.py, p.z - p.pz);
    }
    return (s / this.particleList.length) * 90;
  }

  _rootFromPhysics() {
    const P = this.particles;
    this.rig.rootPos.set(P.hip.x, P.hip.y, P.hip.z);
    this._buildRootFrame(this.rig.rootQuat);
    this.pos.set(P.hip.x, P.hip.y, P.hip.z);
  }

  _buildRootFrame(outQuat) {
    const P = this.particles;
    const right = _v1.set(P.hipR.x - P.hipL.x, P.hipR.y - P.hipL.y, P.hipR.z - P.hipL.z);
    const up = _v2.set(P.pelvisTop.x - P.hip.x, P.pelvisTop.y - P.hip.y, P.pelvisTop.z - P.hip.z);
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
    if (up.lengthSq() < 1e-8) up.set(0, 1, 0);
    up.normalize();
    right.addScaledVector(up, -right.dot(up)).normalize();
    const back = _v3.copy(right).cross(up).normalize();
    _m4.makeBasis(right, up, back);
    outQuat.setFromRotationMatrix(_m4);
    return outQuat;
  }

  /* ------------------------------------------------------------ look offsets */

  /** Adds head/neck aim on top of whatever the animator produced. */
  _applyLookOffsets() {
    if (this.state !== STATE.CONTROLLED) return;
    const neck = this.rig.byName.neck;
    const head = this.rig.byName.head;
    const p = clamp(this.pitch, -1.15, 1.15);
    neck.anim.x += p * 0.34;
    head.anim.x += p * 0.42;

    // Aim the arms with the head, so a jab lands where you are looking.
    const a = this.animator;
    const aim = Math.max(a.upperWeight, a.actionWeight);
    if (aim > 0.01) {
      const k = p * 0.62 * aim;
      this.rig.byName.upperArmR.anim.x += k;
      this.rig.byName.upperArmL.anim.x += k;
    }
    if (this.aimYawOffset) {
      neck.anim.y += this.aimYawOffset * 0.4;
      head.anim.y += this.aimYawOffset * 0.5;
    }
  }

  /* ----------------------------------------------------------- muscle target */

  _writeMuscleTargets() {
    const layout = LAYOUT;
    const strength = this.strength;
    for (let i = 0; i < layout.length; i++) {
      const [name, , , boneName, which] = layout[i];
      const bone = this.rig.byName[boneName];
      const src = which === 'pos' ? bone.worldPos : bone.worldEnd;
      const p = this.particles[name];
      p.ptx = p.tx; p.pty = p.ty; p.ptz = p.tz;
      p.tx = src.x; p.ty = src.y; p.tz = src.z;
      p.muscle = strength;
    }
  }

  /* ------------------------------------------------------------ physics hook */

  preSubstep(h) {
    if (this.state === STATE.STUMBLE) {
      // The stumbling body can still be steered: nudge the hips and let the
      // legs sort themselves out.
      const P = this.particles;
      const wish = _v1.set(this.moveInput.x, 0, this.moveInput.z);
      if (wish.lengthSq() > 0.02) {
        wish.normalize();
        const a = 16 * h;                       // metres per second, per substep
        P.hip.addVelocity(wish.x * a, 0, wish.z * a, h);
        P.pelvisTop.addVelocity(wish.x * a * 0.6, 0, wish.z * a * 0.6, h);
      }
      // the reflex that fights to stay on your feet
      const upErr = clamp01(0.92 - this._uprightness());
      P.shoulders.addVelocity(0, upErr * 26 * h, 0, h);
      P.hip.addVelocity(0, upErr * 10 * h, 0, h);
    }
  }

  postSubstep() {
    const P = this.particles;
    this.center.set(
      (P.hip.x + P.shoulders.x) * 0.5,
      (P.hip.y + P.shoulders.y) * 0.5,
      (P.hip.z + P.shoulders.z) * 0.5,
    );
  }

  /* ------------------------------------------------------------- late update */

  lateUpdate(dt) {
    const blend = clamp01(1 - this.strength);
    if (blend > 0.0015) {
      this._computePhysicsTransforms();
      const order = this.rig.order;
      // Blend the ROOT and the per bone ORIENTATIONS, then rebuild the chain.
      // Blending each joint position on its own would pull the skeleton apart,
      // because neighbouring joints would drift by different amounts.
      const rootBone = order[0];
      rootBone.worldPos.lerp(this._physPos[rootBone.index], blend);
      for (let i = 0; i < order.length; i++) {
        const b = order[i];
        b.worldQuat.slerp(this._physQuat[b.index], blend);
        if (b.parent) {
          b.worldPos.copy(b.offset).applyQuaternion(b.parent.worldQuat).add(b.parent.worldPos);
        }
        b.worldEnd.copy(_v1.set(0, b.length, 0).applyQuaternion(b.worldQuat)).add(b.worldPos);
      }
    }
    this._updateStrike(dt);
    this.body.sync();
    this.body.flush();
  }

  _computePhysicsTransforms() {
    const rig = this.rig;
    const P = this.particles;
    const order = rig.order;
    this._buildRootFrame(this._rootPhys);

    for (let i = 0; i < order.length; i++) {
      const bone = order[i];
      const idx = bone.index;
      const pair = this.boneParticles[bone.name];
      if (pair) {
        const pa = P[pair[0]], pb = P[pair[1]];
        this._physPos[idx].set(pa.x, pa.y, pa.z);
        _v1.set(pb.x - pa.x, pb.y - pa.y, pb.z - pa.z);
        if (_v1.lengthSq() < 1e-10) _v1.set(0, 1, 0);
        _v1.normalize();
        if (!bone.parent) {
          this._physQuat[idx].copy(this._rootPhys);
        } else {
          const pq = this._physQuat[bone.parent.index];
          _v2.copy(bone.restDirInParent).applyQuaternion(pq);
          _q1.setFromUnitVectors(_v2, _v1);
          this._physQuat[idx].copy(_q1).multiply(pq);
        }
      } else {
        // fingers and foot tips just follow their parent
        const pq = this._physQuat[bone.parent.index];
        this._physPos[idx].copy(bone.offset).applyQuaternion(pq).add(this._physPos[bone.parent.index]);
        this._physQuat[idx].copy(pq).multiply(bone.restQuat).multiply(bone.animQuat);
      }
    }
  }

  /* ---------------------------------------------------------------- punching */

  /** Throws a jab. Alternates sides, exactly as asked. */
  punch(force = false) {
    if (this.state !== STATE.CONTROLLED) return false;
    if (this.equipped !== 'fists' && !force) return false;
    if (this.punchCooldown > 0 || this.animator.actionActive) return false;
    this.punchSide = this.punchSide === 'R' ? 'L' : 'R';
    const clip = this.punchSide === 'R' ? 'punchR' : 'punchL';
    this.animator.playAction(clip);
    this.punchCooldown = 0.30;
    this.struck.clear();
    this.combatReady = true;
    this.combatTimer = 3.5;
    return true;
  }

  _updateStrike(dt) {
    for (const S of ['R', 'L']) {
      const bone = this.rig.byName['hand' + S];
      boneBoxCenter(bone, _v1);
      this.handVel[S].copy(_v1).sub(this.prevHand[S]).divideScalar(Math.max(dt, 1e-4));
      this.prevHand[S].copy(_v1);
    }
    if (this.combatTimer > 0) {
      this.combatTimer -= dt;
      if (this.combatTimer <= 0) this.combatReady = false;
    }

    const a = this.animator;
    if (!a.actionActive) return;
    const clipName = a.actionName;
    if (clipName !== 'punchR' && clipName !== 'punchL') return;
    const side = clipName === 'punchR' ? 'R' : 'L';
    const strike = a.action.clip.strike;
    const t = a.actionTime;
    if (t < strike.from || t > strike.to) return;

    this.onStrike?.(this, side, this.handVel[side]);
  }

  /* ------------------------------------------------------------------ misc */

  setEquipped(name) {
    this.equipped = name;
    if (name !== 'fists') this.animator.cancelAction();
  }

  dispose() {
    this.world.removeCharacter(this);
    this.body.dispose();
  }
}

const LAYOUT = particleLayout();

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export { boneCorners, worldToBoxLocal, pointInBone, HIP_HEIGHT, angleDelta, dampAngle };
