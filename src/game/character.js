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
import { Vector3, Quaternion, Matrix4, Euler } from 'three';
import { SkeletonRig, HIP_HEIGHT, boneBoxCenter } from './skeleton.js';
import { Body } from './body.js';
import { Animator } from './animator.js';
import {
  BONE_MASS, HINGE_GUARDS, CONE_LIMITS, SELF_COLLISION, RAGDOLL, IMPACT, JOINT_LIMITS,
  clampBoneEuler,
  LOOK_CHAIN, BODY_TURN_THRESHOLD, AIM_ARM_FOLLOW, DRAWN_LIMIT_BONES,
  SOLID_PARTS, SOLID_IGNORE, SOLID_STIFFNESS, GIB,
} from './joints.js';
import {
  Particle, DistanceConstraint, HingeGuard, ConeLimit, JointSpacing, SelfCollision,
} from '../physics/world.js';
import {
  clamp, clamp01, lerp, damp, dampAngle, angleDelta, makeRng, smoothstep,
} from '../core/util.js';

const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3(), _v4 = new Vector3();
const _q1 = new Quaternion(), _q2 = new Quaternion();
const _e = new Euler();
const _m4 = new Matrix4();
const UP = new Vector3(0, 1, 0);

/* How far each eye state is down the road, and how much sight it costs. */
const EYE_STATE = ['ok', 'bloodshot', 'bleeding', 'hanging', 'gone'];
const EYE_LEVEL = { ok: 0, bloodshot: 1, bleeding: 2, hanging: 3, gone: 4 };
const EYE_BLIND = { ok: 0, bloodshot: 0.08, bleeding: 0.3, hanging: 0.5, gone: 0.5 };
/**
 * A shoulder and a hip can be turned about the limb's own axis without moving
 * either joint, so the particles - which are only two points - do not say
 * which way the elbow or the knee below them is pointing. Left to fall out of
 * the maths it comes out arbitrary, and a knee drawn bending sideways then
 * gets clamped to straight, which is a leg that ignores its own physics.
 *
 * So the twist is taken from the joint below: the limb is rolled until the
 * hinge bends in the plane the two bones actually make, the way it bends on
 * the side it is on. +1 elbows fold forwards, -1 knees fold backwards.
 */
const TWIST_FROM_CHILD = {
  upperArmR: ['lowerArmR', 1], upperArmL: ['lowerArmL', 1],
  upperLegR: ['lowerLegR', -1], upperLegL: ['lowerLegL', -1],
};

const LEG_BONES = new Set([
  'upperLegR', 'lowerLegR', 'footR', 'upperLegL', 'lowerLegL', 'footL',
]);

/** Which pair of one-shot clips each carried weapon swings with. */
export const MELEE_CLIPS = {
  machete: ['slashR', 'slashL'],
  sledge: ['swingR', 'swingL'],
  crowbar: ['crowbarR', 'crowbarL'],
};
/** The tallest thing you walk up without jumping, in metres. The ground scan
    and the walking capsule have to agree on this exactly: anything the scan
    will step onto, the capsule must let you walk into, and anything taller
    the capsule must stop - or you walk into the side of a platform and stand
    inside it. */
export const STEP_UP = 0.48;

/** How long you are committed after swinging each one, in seconds. */
export const MELEE_COOLDOWN = { machete: 0.34, sledge: 0.52, crowbar: 0.42 };
/** Which held pose each one stands in - guns included. */
export const MELEE_HOLD = {
  machete: 'macheteHold', sledge: 'sledgeHold', crowbar: 'crowbarHold',
  glock: 'glockHold', ak47: 'akHold', m16: 'm16Hold', flamethrower: 'flamerHold',
};
const MELEE_ACTIONS = new Set(Object.values(MELEE_CLIPS).flat());
/** Reload clips: they own the arms while they run, but nothing strikes. */
const RELOADS = new Set(['reloadPistol', 'reloadPistolEmpty', 'reloadRifle',
  'reloadRifleEmpty', 'reloadM16', 'reloadM16Empty', 'reloadFlamer']);

export const STATE = {
  CONTROLLED: 'controlled',
  STUMBLE: 'stumble',
  RAGDOLL: 'ragdoll',
  GETUP: 'getup',
  DEAD: 'dead',
};

/* Which physical joint hangs off which bone, and what it weighs. The numbers
   themselves live in joints.js so they can be tuned in one place. */
function particleLayout() { return BONE_MASS; }

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
    this.yaw = opts.yaw || 0;          // where the hips face
    this.gazeYaw = this.yaw;           // where the eyes are pointed
    this.pitch = 0;
    this.grounded = true;
    /** The water this person is in, set by the game each frame: { surface, floor } or null. */
    this.water = null;
    this.swimming = false;
    this.swimUp = false;      // held: swim for the surface
    this.swimDown = false;    // held: dive
    /** Breath left, 0..1. Goes down with the head under water. */
    this.air = 1;
    this._stepUp = STEP_UP;
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
    /* Damage a part has taken AFTER its health ran out. partHealth stops at
       zero, so without this there is no difference between a part that is
       finished and one that has been hit twenty more times since. */
    this.partOverkill = Object.create(null);
    for (const b of this.rig.bones) { this.partHealth[b.name] = b.hp; this.partOverkill[b.name] = 0; }
    /** Parts that are no longer attached. */
    this.gone = new Set();

    /* ----------------------------- injuries ----------------------------- */
    /* What is wrong with this person beyond a health bar. Eyes run
       ok -> bloodshot -> bleeding -> hanging -> gone and never back. */
    this.injuries = { eyeR: 'ok', eyeL: 'ok', noseBleed: 0, mouthBleed: 0 };
    this.blind = 0;              // 0 sees fine, 1 sees nothing
    this.broken = new Set();     // bone names that are broken
    /** A vest, if one is being worn. It eats damage before the body sees it. */
    /** What is being worn, by slot: torso, neck, head. */
    this.worn = {};
    /** Multiplies walking speed. The game sets it each frame - water to the
        shins halves it - and it goes back to 1 the moment that stops. */
    this.speedScale = 1;
    /* Sleeping. A body that has gone limp and stopped going anywhere is held
       exactly where it lies until something disturbs it. See _updateSleep. */
    this.asleep = false;
    this._sleepRef = null;
    this._sleepT = 0;
    this._stillWindows = 0;
    this._limpT = 0;
    this._frozen = null;
    this._sleepBox = null;
    /* Per bone muscle multiplier. A broken bone cannot hold itself up, and
       neither can anything hanging off it. */
    this.limpScale = Object.create(null);
    this.boneAncestry = Object.create(null);
    for (const b of this.rig.bones) {
      const chain = [];
      for (let n = b; n; n = n.parent) chain.push(n.name);
      this.boneAncestry[b.name] = chain;
      this.limpScale[b.name] = 1;
    }
    this.onInjury = null;        // (info) => void, wired by the game

    /* ------------------------------ combat ------------------------------ */
    this.equipped = 'fists';
    this.punchSide = 'R';
    this.slashSide = 'L';       // so the first swing is the forehand
    this.punchCooldown = 0;
    this.recoil = 0;            // how much of a gun's kick is still in the arms
    // how far the body has moved from the pose the muscles are holding
    this.muscleShiftX = 0; this.muscleShiftY = 0; this.muscleShiftZ = 0;
    /* Fighting, you turn to face what you are hitting rather than swinging
       across your own body. Anything that wants the hips brought round now
       instead of eventually sets this. */
    this.squareUp = false;
    this.squareTimer = 0;
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
    this.guards = [];
    this._buildPhysics();

    /* A broken bone is allowed out of its joint limits - that is what broken
       means - so the rig is told to let those through. Self collision still
       stops it going through the ribs. */
    this.rig.limitExempt = this.broken;

    /* Who each bone touches, so an impact can travel along the body rather
       than through the air. */
    this.boneNeighbours = Object.create(null);
    for (const b of this.rig.bones) {
      const n = [];
      if (b.parent) n.push(b.parent.name);
      for (const c of b.children) n.push(c.name);
      this.boneNeighbours[b.name] = n;
    }

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

    // ---- joint guards ----
    /* The distance constraints above hold the body together; these keep it
       anatomical. A frame taken from the pelvis tells each hinge which way its
       own joint is supposed to fold, whichever way the body happens to be
       lying. */
    const frame = { right: P.hipR, left: P.hipL, base: P.hip, top: P.shoulders };
    for (const g of HINGE_GUARDS) {
      const guard = new HingeGuard(P[g.a], P[g.b], P[g.c], frame, g.sign, g.margin);
      this.guards.push(guard);
      this.world.addConstraint(guard, true);
    }
    /* A hip and a shoulder need a cone rather than a side: they move every
       way, they simply cannot move far in some of them. */
    const D = Math.PI / 180;
    for (const cl of CONE_LIMITS) {
      if (!P[cl.root] || !P[cl.tip]) continue;
      const cone = new ConeLimit(P[cl.root], P[cl.tip], frame, {
        fwd: cl.fwd * D, back: cl.back * D, out: cl.out * D, across: cl.across * D,
      }, cl.side);
      this.guards.push(cone);
      this.world.addConstraint(cone, true);
    }

    for (const [a, b, min] of SELF_COLLISION) {
      if (!P[a] || !P[b]) continue;
      const sc = new JointSpacing(P[a], P[b], min);
      this.guards.push(sc);
      this.world.addConstraint(sc, true);
    }

    /* ---- every bone as a solid volume ----
       A joint is a point; a bone is not. Testing only the joints let a whole
       forearm swing through a chest between them, so each bone is a capsule
       now and every pair that could genuinely meet is tested. */
    this.solids = SOLID_PARTS
      .filter((d) => P[d.a] && P[d.b])
      .map((d) => ({ name: d.name, a: P[d.a], b: P[d.b], r: d.r }));
    this.solidByName = Object.create(null);
    for (const c of this.solids) this.solidByName[c.name] = c;

    const ignore = new Set();
    for (const [a, b] of SOLID_IGNORE) { ignore.add(a + '|' + b); ignore.add(b + '|' + a); }
    const pairs = [];
    for (let i = 0; i < this.solids.length; i++) {
      for (let j = i + 1; j < this.solids.length; j++) {
        const A = this.solids[i], B = this.solids[j];
        // bones that meet at a joint are always touching, by definition
        if (A.a === B.a || A.a === B.b || A.b === B.a || A.b === B.b) continue;
        if (ignore.has(A.name + '|' + B.name)) continue;
        pairs.push({
          a0: A.a, a1: A.b, ra: A.r, b0: B.a, b1: B.b, rb: B.r,
          stiffness: SOLID_STIFFNESS, names: A.name + '|' + B.name,
        });
      }
    }
    this.selfCollisionPairs = pairs;
    /* Solved only when it can achieve something: a body pinned to an animation
       has its particles put back at the end of every substep anyway. */
    this.selfCollide = false;
    const self = new SelfCollision(this, pairs);
    this.selfSolver = self;
    this.guards.push(self);
    this.world.addConstraint(self, true);

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

    this.totalMass = this.particleList.reduce((sum, p) => sum + p.mass, 0);
  }

  /* ---------------------------------------------------------------- helpers */

  teleport(x, z, yaw = this.yaw, y = null) {
    this.wake();
    this.gazeYaw = yaw;
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
    this._syncArmour();
  }

  _snapParticlesToRig() {
    for (const [name, , , boneName, which] of particleLayout()) {
      const bone = this.rig.byName[boneName];
      const src = which === 'pos' ? bone.worldPos : bone.worldEnd;
      const p = this.particles[name];
      p.setPosition(src.x, src.y, src.z);
      p.tx = src.x; p.ty = src.y; p.tz = src.z;
      p.tvx = 0; p.tvy = 0; p.tvz = 0;
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

  _groundHeight(x, z, fromY, step = STEP_UP) {
    const w = this.world;
    let best = -Infinity;
    if (w.hasGroundAt(x, z) && w.groundY <= fromY + step) best = w.groundY;
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
      if (top <= fromY + step && top > best) best = top;
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
    this.wake();
    if (s === STATE.STUMBLE) {
      this.animator.cancelAction();
      this.animator.playBase('stagger', { fade: 0.14 });
      this.targetStrength = 0.34;
    } else if (s === STATE.RAGDOLL) {
      this.animator.cancelAction();
      this.animator.playBase('fall', { fade: 0.2 });
      this.targetStrength = this.dead ? RAGDOLL.deadStrength : RAGDOLL.strength;
      this.getUpDelay = 0.55 + this.rng() * 1.1;
    } else if (s === STATE.GETUP) {
      this.targetStrength = 0.14;
    } else if (s === STATE.CONTROLLED) {
      this.targetStrength = 1;
      this.balance = Math.max(this.balance, 0.75);
    } else if (s === STATE.DEAD) {
      this.targetStrength = RAGDOLL.deadStrength;
      this.dead = true;
      this.body.setExpression('frown');
    }
  }

  /** Knocks the character about. `force` is an impulse in kg*m/s. */
  applyImpact(point, force, { boneName = null, damage = 0, type = 'blunt', attacker = null, severity = null, crush = 0, wound = null } = {}) {
    if (this.dead && damage <= 0) return;
    this.wake();
    const mag = force.length();

    /* A hit belongs to the part it landed on, and travels from there ALONG
       THE SKELETON: head, then neck, then a little of the chest. Straight line
       distance would put a punch to the jaw into the shoulder it happens to be
       near, which is not how a body works.

       Two shares go out. The body share moves the whole person, spread by mass
       so a hard jab is 1.9 m/s to a seventy kilo adult rather than forty to a
       wrist. The local share is dealt out by how many joints away each bone is
       from the one that was hit, and the harder the hit the further it
       reaches. */
    const dt = this.world.substepDt;
    const hops = clamp(Math.round(IMPACT.hopsPerSeverity * clamp01(severity ?? 0.5)) + 1,
      1, IMPACT.maxHops);
    const weights = this._impactWeights(boneName, hops);

    const bodyK = IMPACT.bodyShare / Math.max(1, this.totalMass);
    const cap = IMPACT.maxJointSpeed / Math.max(mag, 1e-6);

    // Normalise the local share by the mass it is actually moving, so the
    // momentum handed out is the momentum the hit had.
    let effMass = 0;
    for (let i = 0; i < this.particleList.length; i++) {
      const p = this.particleList[i];
      const w = weights[p.name] || 0;
      if (w > 0) effMass += p.mass * w;
    }
    const localShare = 1 - IMPACT.bodyShare;

    for (let i = 0; i < this.particleList.length; i++) {
      const p = this.particleList[i];
      const w = weights[p.name] || 0;
      const local = effMass > 1e-6 ? (localShare * w) / effMass : 0;
      const k = clamp(bodyK + local, 0, cap);
      p.addVelocity(force.x * k, force.y * k, force.z * k, dt);
    }

    if (damage > 0) this.applyDamage(damage, { boneName, point, type, attacker, force, severity, crush, wound });

    /* Balance loss scales with the speed the hit actually imparts, not with
       the raw impulse: 130 kg m/s is a knockout to a wrist and a shove to a
       whole person. Measured against the body's own mass, a solid jab costs
       about a quarter of the bar, so it takes a run of them - or one properly
       heavy hit - to put anyone down. */
    const dv = mag / Math.max(1, this.totalMass);
    const height = clamp01((point.y - (this.pos.y - HIP_HEIGHT)) / 1.8);
    const loss = dv * 0.11 * (0.6 + height * 0.7);
    this.balance = clamp01(this.balance - loss);
    this._checkBalance();
  }

  applyDamage(amount, { boneName = null, point = null, type = 'blunt', attacker = null, force = null, severity = null, crush = 0, wound = null } = {}) {
    this.wake();
    /* Armour comes first, because everything after this point - health, bone
       wear, breaks, bleeding, the face - is about a hit that actually reached
       the person. What the plate ate never did.

       It stops damage, not momentum: a vest will not let a sledgehammer break
       your ribs, and it will still put you on the floor. */
    const armour = this.armourOn(boneName);
    if (armour) {
      const through = armour.absorb(amount, boneName);
      const stopped = amount - through;
      if (stopped > 0) {
        // Bone only breaks under what reached it, so the crush the weapon
        // asked for is scaled down by however much the plate kept.
        crush *= amount > 0 ? through / amount : 0;
        severity = severity == null ? null : severity * (amount > 0 ? through / amount : 0);
        this.onArmourHit?.({ character: this, boneName, point, stopped, armour });
      }
      if (armour.spent) this.onArmourBreak?.({ character: this, point, armour });
      amount = through;
      if (amount <= 0.01) {
        /* Nothing reached them - but something certainly happened, and the
           person it happened to has to know. Being shot in the vest is still
           being shot: it turns you round, and it starts a fight. */
        this.lastDamageTime = performance.now() / 1000;
        if (attacker) this.lastAttacker = attacker;
        this.onDamage?.({
          character: this, boneName, point, type, amount: 0, absorbed: stopped,
          force, severity: 0, fatal: false, attacker,
        });
        return;
      }
    }
    /* Wear on the part itself is kept whether or not the person is alive to
       feel it: a corpse can still be taken apart, and keeping this above the
       check for death is the whole reason it can. */
    if (boneName && this.partHealth[boneName] != null) {
      const had = this.partHealth[boneName];
      this.partHealth[boneName] = Math.max(0, had - amount);
      if (amount >= GIB.minHit) {
        const k = GIB.sever[wound || 'none'] ?? GIB.sever.none;
        this.partOverkill[boneName] += Math.max(0, amount - had) * k;
      }
    }
    if (this.dead) {
      // corpses still take visible damage, and can still come apart
      this.onDamage?.({ character: this, boneName, point, type, amount, severity: severity ?? clamp01(amount / 14), force, fatal: false, wound, attacker });
      if (this._shouldGib(boneName, amount)) this.explodeBone(boneName, point, force);
      return;
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
      fatal: this.health <= 0, wound, attacker,
    });

    this._injure({
      boneName, point, type, crush, amount, force,
      severity: severity ?? clamp01(amount / 14),
      fatal: this.health <= 0,
    });

    if (this.health <= 0) this.die();
    else if (dealt > 8) this.balance = clamp01(this.balance - (dealt - 8) / 90);
    this._checkBalance();
  }

  /**
   * How much of a hit each JOINT sees, walking out from the bone that was
   * struck. Every step along the skeleton keeps a fraction of what the last
   * one had, so the reaction fades through the body instead of stopping dead
   * at the part or spreading evenly across all of it.
   */
  _impactWeights(boneName, hops) {
    const out = Object.create(null);
    const start = boneName && this.rig.byName[boneName] ? boneName : 'midTorso';
    let front = [start];
    const seen = new Set(front);
    let w = 1;
    for (let hop = 0; hop <= hops && front.length; hop++) {
      for (const name of front) {
        const pair = this.boneParticles[name];
        if (pair) {
          out[pair[0]] = Math.max(out[pair[0]] || 0, w);
          out[pair[1]] = Math.max(out[pair[1]] || 0, w);
        }
      }
      const next = [];
      for (const name of front) {
        for (const n of this.boneNeighbours[name] || []) {
          if (seen.has(n)) continue;
          seen.add(n);
          next.push(n);
        }
      }
      front = next;
      w *= IMPACT.falloff;
    }
    return out;
  }

  /* ------------------------------------------------------------ injuries */

  /**
   * What a hit does beyond taking health off. Faces bleed and lose eyes;
   * anything heavy enough breaks what it lands on.
   */
  _injure({ boneName, point, type, severity, crush = 0, fatal = false, amount = 0, force = null }) {
    if (!boneName) return;
    const rng = this.rng;
    const sev = clamp01(severity);
    const cut = type === 'impact';
    // Fire chars what it touches; it takes a blast, not a lick of flame, to
    // do anything to the eyes or the bones underneath.
    if (type === 'burn' && sev < 0.6) return;
    // drowning leaves no mark on anyone
    if (type === 'drown') return;

    if (boneName === 'head' || boneName === 'neck') {
      const next = {};
      // A nose goes at the slightest excuse, a lip almost as easily.
      if (rng() < 0.45 + sev) next.noseBleed = clamp01(this.injuries.noseBleed + 0.2 + sev * 0.45);
      if (rng() < 0.3 + sev * 0.7) next.mouthBleed = clamp01(this.injuries.mouthBleed + 0.15 + sev * 0.45);

      /* Eyes. A knock reddens one, a real hit opens it, and something with an
         edge or a lot of weight behind it takes it out of the socket. */
      let level = 0;
      // An eye normally comes out and hangs there. Losing it altogether takes
      // something that carries it away.
      if (cut) level = sev > 0.7 ? (rng() < 0.25 ? 4 : 3) : 2;
      else if (sev > 0.8 || crush > 0.4) level = rng() < 0.4 ? 3 : 2;
      else if (sev > 0.45) level = 2;
      else if (sev > 0.12 && rng() < 0.55) level = 1;
      if (level > 0) {
        const side = rng() < 0.5 ? 'eyeR' : 'eyeL';
        const now = EYE_LEVEL[this.injuries[side]];
        if (level > now) next[side] = EYE_STATE[level];
        // something that takes one eye out often catches the other
        if (level >= 3 && rng() < 0.28) {
          const other = side === 'eyeR' ? 'eyeL' : 'eyeR';
          if (EYE_LEVEL[this.injuries[other]] < 2) next[other] = 'bleeding';
        }
      }
      this.setInjuries(next, point);
    }

    /* Parts coming off. A limb that has been worked well past the point of
       being any use, or one that takes a single hit far bigger than it is,
       does not break - it leaves. Checked before breaking, because there is
       nothing left to break afterwards. */
    if (this._shouldGib(boneName, amount)) {
      this.explodeBone(boneName, point, force);
      return;
    }

    // Breaks. The sledgehammer asks for them outright; anything else has to
    // have already worked the part to pieces.
    if (this.broken.has(boneName)) return;
    const worn = this.partHealth[boneName] != null && this.partHealth[boneName] <= 0;
    const chance = crush + (worn ? (cut ? 0.25 : 0.4) * sev : 0) + (fatal ? 0.1 : 0);
    if (chance > 0 && rng() < chance) this.breakBone(boneName, point);
  }

  /** Applies a set of face injuries and repaints the face. */
  setInjuries(next, point = null) {
    let changed = false;
    for (const key of Object.keys(next)) {
      if (this.injuries[key] === next[key]) continue;
      this.injuries[key] = next[key];
      changed = true;
    }
    if (!changed) return false;
    this.body.setInjuries(this.injuries);
    /* Blindness is simply the sum of what the eyes can no longer do. Lose
       both and you are in the dark. */
    this.blind = clamp01(EYE_BLIND[this.injuries.eyeR] + EYE_BLIND[this.injuries.eyeL]);
    if (this.injuries.noseBleed > 0 || this.injuries.mouthBleed > 0) {
      this.bleeding = Math.min(4, this.bleeding + 0.4);
    }
    this.onInjury?.({ character: this, kind: 'face', point, injuries: this.injuries });
    return true;
  }

  /** Breaks a bone: it bleeds, it goes limp, and it stops being any use. */
  breakBone(boneName, point = null) {
    const bone = this.rig.byName[boneName];
    if (!bone || this.broken.has(boneName)) return false;
    if (bone.def.finger || boneName === 'pelvis') return false;
    this.broken.add(boneName);
    // the angle it now sits at, decided once and kept
    this.breakBend = this.breakBend || Object.create(null);
    const sign = this.rng() < 0.5 ? -1 : 1;
    this.breakBend[boneName] = {
      x: sign * (0.45 + this.rng() * 0.55),
      y: (this.rng() - 0.5) * 0.5,
      z: sign * (0.30 + this.rng() * 0.45),
    };

    // everything hanging off a broken bone goes with it
    for (const b of this.rig.bones) {
      if (this.boneAncestry[b.name].includes(boneName)) {
        this.limpScale[b.name] = b.name === boneName ? 0.05 : 0.08;
      }
    }
    this.partHealth[boneName] = 0;
    this.bleeding = Math.min(4, this.bleeding + 1.2);
    this.balance = clamp01(this.balance - (LEG_BONES.has(boneName) ? 0.5 : 0.2));
    this.painTimer = Math.max(this.painTimer, 1.4);
    this.onInjury?.({ character: this, kind: 'break', boneName, point });
    this._checkBalance();
    return true;
  }

  /* --------------------------------------------------- parts coming off */

  /** Has this part had enough to come off, from this hit or from all of them? */
  _shouldGib(boneName, amount) {
    if (!GIB.parts.has(boneName) || this.gone.has(boneName)) return false;
    const bone = this.rig.byName[boneName];
    if (!bone) return false;
    const hp = bone.hp || 10;
    if (amount >= hp * GIB.oneShot && amount >= GIB.minHit) return true;
    return (this.partOverkill[boneName] || 0) >= hp * GIB.overkill;
  }

  /**
   * Takes a part off the body for good.
   *
   * Three things have to happen together or the result is a body that looks
   * wrong or behaves wrong: the meshes have to leave (and be thrown, because
   * a limb that vanishes is not gore), the physics has to stop simulating
   * joints that are not there any more, and the drawing has to stop asking
   * particles where a bone is when that bone has no particles left.
   *
   * @param {Vector3} [force] which way the hit was going; the pieces follow it
   * @returns {boolean} whether anything actually came off
   */
  explodeBone(boneName, point = null, force = null) {
    if (!GIB.parts.has(boneName) || this.gone.has(boneName)) return false;
    const bone = this.rig.byName[boneName];
    if (!bone) return false;

    /* Everything hanging off it goes too: a hand cannot stay in the air
       where its forearm used to be. */
    const gone = [];
    for (const b of this.rig.bones) {
      if (b.name === boneName || this.boneAncestry[b.name].includes(boneName)) {
        if (!this.gone.has(b.name)) gone.push(b);
      }
    }

    // ---- where the wound is, and which way everything leaves ----
    const wound = _v1.copy(point || bone.worldPos);
    _v2.set(0, 0, 0);
    if (force && force.lengthSq() > 1e-6) _v2.copy(force).normalize();
    else _v2.copy(bone.worldEnd).sub(bone.worldPos).normalize();

    // ---- the meshes leave, still where they were, and are thrown ----
    for (const b of gone) {
      const parts = this.body.detach(b.name);
      for (const m of parts) {
        m.userData.owner = this;
        _v3.copy(_v2).multiplyScalar(GIB.speed * (0.5 + this.rng() * 0.9));
        _v3.x += (this.rng() - 0.5) * 2.6;
        _v3.y += 1.2 + this.rng() * 2.4;
        _v3.z += (this.rng() - 0.5) * 2.6;
        this.onGib?.({ character: this, mesh: m, vel: _v3, boneName: b.name, point: wound });
      }
      this.gone.add(b.name);
      this.broken.add(b.name);          // nothing that is gone still works
      this.limpScale[b.name] = 0.02;
      this.partHealth[b.name] = 0;
    }

    /* ---- the physics forgets it ----
       The joint where the limb WAS stays: that is the stump, and the torso
       still needs it for its girdle and its bracing. Everything beyond it
       goes. */
    const dead = new Set();
    for (const b of gone) {
      const pair = this.boneParticles[b.name];
      if (pair) dead.add(pair[1]);      // the far end, never the near one
      delete this.boneParticles[b.name];
    }
    // ...unless the stump itself belongs to a bone that is also gone
    for (const b of gone) {
      const spec = LAYOUT.find((l) => l[3] === b.name && l[4] === 'pos');
      if (spec && b.parent && this.gone.has(b.parent.name)) dead.add(spec[0]);
    }
    if (dead.size) this._forgetParticles(dead);

    // ---- what was strapped to it falls off ----
    for (const slot of Object.keys(this.worn)) {
      const a = this.worn[slot];
      const bones = a.model.userData.parts
        ? a.model.userData.parts.map((p) => p.userData.mount.bone) : [a.spec.bone];
      if (!bones.some((n) => this.gone.has(n))) continue;
      this.stripArmour(slot);
      if (this.onArmourLost) this.onArmourLost({ character: this, armour: a, dir: _v2.clone() });
      else a.dispose();
    }

    // ---- what it costs the person ----
    const hp = bone.hp || 10;
    this.bleeding = 4;
    this.painTimer = Math.max(this.painTimer, 2.5);
    this.balance = 0;
    this.onInjury?.({ character: this, kind: 'gib', boneName, point: wound, dir: _v2 });
    if (GIB.fatal.has(boneName)) {
      this.health = 0;
    } else {
      this.health = Math.max(0, this.health - hp * GIB.cost);
    }
    if (this.health <= 0) this.die();
    else this._checkBalance();
    return true;
  }

  /**
   * Drops particles out of the simulation, along with everything that acts
   * on them. They stay in the map by name so the rest of the character can
   * still look them up without checking first; nothing solves them.
   */
  _forgetParticles(names) {
    const dead = new Set();
    for (const n of names) {
      const p = this.particles[n];
      if (!p) continue;
      p.gone = true;
      p.muscle = 0;
      p.radius = 0;
      dead.add(p);
    }
    if (!dead.size) return;
    const hits = (c) => (c.touches ? c.touches(dead) : false);
    this.particleList = this.particleList.filter((p) => !dead.has(p));
    this.constraints = this.constraints.filter((c) => !hits(c));
    this.guards = this.guards.filter((g) => !hits(g));
    for (const p of dead) this.world.removeParticle(p);
    this.world.constraints = this.world.constraints.filter((c) => !hits(c));
    this.world.segments = this.world.segments.filter((sg) => !dead.has(sg.a) && !dead.has(sg.b));
    /* The self collision solver stops testing pairs that no longer exist.
       Its pairs hold the particles themselves, not their names. */
    this.solids = this.solids.filter((c) => !dead.has(c.a) && !dead.has(c.b));
    this.solidByName = Object.create(null);
    for (const c of this.solids) this.solidByName[c.name] = c;
    this.selfCollisionPairs = this.selfCollisionPairs.filter(
      (q) => !dead.has(q.a0) && !dead.has(q.a1) && !dead.has(q.b0) && !dead.has(q.b1));
    if (this.selfSolver) this.selfSolver.pairs = this.selfCollisionPairs;
    this.totalMass = this.particleList.reduce((sum, p) => sum + p.mass, 0);
  }

  /**
   * A broken limb does not just go slack, it sits wrong. The bend is fixed at
   * the moment of the break and rides on top of whatever the animation is
   * doing, so the shape of the injury stays put.
   */
  _applyBreakBends() {
    if (!this.breakBend) return;
    for (const name of this.broken) {
      const bend = this.breakBend[name];
      const bone = this.rig.byName[name];
      if (!bend || !bone) continue;
      bone.anim.x += bend.x;
      bone.anim.y += bend.y;
      bone.anim.z += bend.z;
    }
  }

  /* ------------------------------------------------------------- armour */

  /**
   * Puts a vest on. The scene has to be told where to hang the model, since
   * a character owns its rig but not the world it is drawn in.
   * @param {Armour} armour
   * @param {Object3D} parent  where the vest's mesh should live
   */
  wearArmour(armour, parent) {
    const old = this.stripArmour(armour.slot);
    this.worn[armour.slot] = armour;
    if (parent) parent.add(armour.model);
    armour.model.visible = true;
    armour.sync(this.rig);
    this._wornOrder = (this._wornOrder || []).filter((s) => s !== armour.slot);
    this._wornOrder.push(armour.slot);
    if (armour.spec.hidesHair) this.body.setHairVisible(false);
    return old;
  }

  /**
   * Takes one piece off - the one in `slot`, or the last one put on - and
   * hands it back, still as worn as it was.
   */
  stripArmour(slot = null) {
    if (!slot) slot = (this._wornOrder || []).filter((s) => this.worn[s]).pop();
    const a = slot ? this.worn[slot] : null;
    if (!a) return null;
    delete this.worn[slot];
    if (this._wornOrder) this._wornOrder = this._wornOrder.filter((s) => s !== slot);
    a.model.removeFromParent();
    if (a.spec.hidesHair) this.body.setHairVisible(true);
    return a;
  }

  /** The vest, if there is one. */
  get armour() { return this.worn.torso || null; }

  /** Every piece being worn. */
  get armourPieces() { return Object.values(this.worn); }

  /** The piece that would take a hit on this bone, if it still can. */
  armourOn(boneName) {
    for (const slot in this.worn) {
      const a = this.worn[slot];
      if (!a.spent && a.covers(boneName)) return a;
    }
    return null;
  }

  _syncArmour() {
    for (const slot in this.worn) this.worn[slot].sync(this.rig);
  }

  /** Puts everything back: health, breaks, eyes, all of it. */
  heal() {
    this.health = this.maxHealth;
    this.balance = 1;
    this.bleeding = 0;
    this.dead = false;
    this.blind = 0;
    this.broken.clear();
    this.breakBend = null;
    for (const b of this.rig.bones) {
      this.partHealth[b.name] = b.hp;
      this.partOverkill[b.name] = 0;
      this.limpScale[b.name] = 1;
    }
    /* Health comes back; limbs do not. A part that has been blown off has no
       particles, no constraints and no mesh left to restore, so it stays off
       and stays useless. */
    for (const name of this.gone) {
      this.broken.add(name);
      this.limpScale[name] = 0.02;
      this.partHealth[name] = 0;
    }
    this.injuries = { eyeR: 'ok', eyeL: 'ok', noseBleed: 0, mouthBleed: 0 };
    this.body.setInjuries(this.injuries);
    this.body.setExpression('neutral');
    this.air = 1;
    for (const a of this.armourPieces) a.repair();
  }

  /** True while any bone in that arm is broken. */
  armBroken(side) {
    return this.broken.has('upperArm' + side) || this.broken.has('lowerArm' + side) ||
           this.broken.has('hand' + side);
  }

  legBroken(side) {
    return this.broken.has('upperLeg' + side) || this.broken.has('lowerLeg' + side) ||
           this.broken.has('foot' + side);
  }

  get canWalk() { return !(this.legBroken('R') && this.legBroken('L')); }

  _checkBalance() {
    if (this.dead) return;
    if (this.state === STATE.CONTROLLED || this.state === STATE.GETUP) {
      if (this.balance < 0.16) { this.animator.cancelFull(); this.setState(STATE.RAGDOLL); }
      else if (this.balance < 0.45) { this.animator.cancelFull(); this.setState(STATE.STUMBLE); }
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
    this.squareTimer = Math.max(0, this.squareTimer - dt);
    this.painTimer = Math.max(0, this.painTimer - dt);
    this.bleeding = Math.max(0, this.bleeding - dt * 0.35);
    if (!this.dead) this.balance = clamp01(this.balance + dt * 0.36);
    /* Letting go is faster than taking hold. A body that has just been
       knocked out does not spend a third of a second on the way to limp - it
       drops - but a body getting back up tightens gradually, which is what
       the slower rate the other way is for. */
    this.strength = damp(this.strength, this.targetStrength,
      this.targetStrength < this.strength ? 26 : 9, dt);

    switch (this.state) {
      case STATE.CONTROLLED: this._updateControlled(dt); break;
      case STATE.STUMBLE: this._updateStumble(dt); break;
      case STATE.RAGDOLL: this._updateRagdoll(dt); break;
      case STATE.GETUP: this._updateGetUp(); break;
      case STATE.DEAD: this._updateDead(); break;
      default: break;
    }

    /* Bones are solid whenever the animation is not the only thing posing
       them - a ragdoll, a stumble, a get-up - and whenever something is broken,
       since a break is free to turn into places an animation never would. */
    this.selfCollide = this.state !== STATE.CONTROLLED || this.broken.size > 0;
    this._updateSleep(dt);

    this.animator.update(dt);
    this.recoil = Math.max(0, (this.recoil || 0) - dt * 7.5);
    this._applyLookOffsets();
    this._applyRecoil();
    this._applyBreakBends();
    this.rig.updateFK();
    this._writeMuscleTargets(dt);
  }

  _updateControlled(dt) {
    const w = this.world;
    // --- crouch ---
    this.crouch = damp(this.crouch, this.crouchWant && this.grounded ? 1 : 0, 11, dt);

    // --- horizontal movement ---
    const wish = _v1.set(this.moveInput.x, 0, this.moveInput.z);
    const wishLen = Math.min(1, wish.length());
    if (wishLen > 1e-4) wish.multiplyScalar(1 / wish.length());
    const lame = (this.legBroken('R') ? 1 : 0) + (this.legBroken('L') ? 1 : 0);
    const running = this.wantRun && wishLen > 0.72 && this.crouch < 0.4 && lame === 0;
    let speed = this.crouch > 0.45 ? this.speedCrouch : (running ? this.speedRun : this.speedWalk);
    speed *= wishLen;
    // wading, burning legs, whatever else the world is doing to you this frame
    speed *= this.speedScale;
    speed *= lerp(1, 0.55, clamp01(1 - this.health / this.maxHealth) * 0.9);
    // A broken leg is a limp; two is a crawl, and you will not stay upright.
    if (lame) {
      speed *= lame === 1 ? 0.45 : 0.16;
      this.balance = clamp01(this.balance - dt * (lame === 1 ? 0.30 : 0.85));
      this._checkBalance();
    }

    const accel = this.grounded ? 15 : 4.2;
    const targetVX = wish.x * speed, targetVZ = wish.z * speed;
    this.vel.x = damp(this.vel.x, targetVX, accel, dt);
    this.vel.z = damp(this.vel.z, targetVZ, accel, dt);

    /* The hips follow the gaze, but not instantly and not always. Standing
       still you look over your shoulder and the body catches up only once the
       spine has run out of turn; walking, the hips come round to where you are
       going, because that is what legs do. */
    const off = angleDelta(this.yaw, this.gazeYaw);
    if (wishLen > 0.1 || this.squareUp || this.squareTimer > 0) {
      this.yaw = dampAngle(this.yaw, this.gazeYaw, 13, dt);
    } else if (Math.abs(off) > BODY_TURN_THRESHOLD) {
      const keep = BODY_TURN_THRESHOLD * 0.8 * Math.sign(off);
      this.yaw = dampAngle(this.yaw, this.gazeYaw - keep, 7, dt);
    }

    /* --- swimming ---
       Water deeper than your chest takes your feet: you sink slowly unless
       you swim, float with your head out once you are up, and at the
       surface can pull yourself out onto any edge within reach. Anyone who
       is not the player swims for the surface on their own. */
    const W = this.water;
    const feet0 = this.pos.y - HIP_HEIGHT;
    this.swimming = !!W && W.surface - feet0 > 1.25;
    this._stepUp = STEP_UP;
    if (this.swimming) {
      const floatFeet = W.surface - 1.4;
      const up = this.swimUp || !this.isPlayer;
      let target;
      if (this.swimDown) target = -2.2;
      else if (up || feet0 > floatFeet - 0.15) target = clamp((floatFeet - feet0) * 4, -1, 2.6);
      else target = -0.35;
      this.vel.y = damp(this.vel.y, target, 5, dt);
      // at the surface, an edge up to two metres over your feet can be climbed onto
      if (feet0 > floatFeet - 0.45) this._stepUp = 2.0;
      this.wantJump = false;
      this.jumpBuffer = 0;
    }

    // --- jump ---
    if (this.wantJump) { this.jumpBuffer = 0.16; this.wantJump = false; }
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (lame) this.jumpBuffer = 0;                 // you cannot push off a break
    if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0)) {
      this.vel.y = 7.55;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.animator.playBase('jump', { fade: 0.06, restart: true });
      this._jumpLatch = 0.28;
    }

    // --- gravity and ground ---
    if (!this.swimming) this.vel.y += w.gravity.y * dt;
    this.pos.addScaledVector(this.vel, dt);

    const feetY = this.pos.y - HIP_HEIGHT;
    const gh = this._groundHeight(this.pos.x, this.pos.z, feetY, this._stepUp);
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
    this._resolveCharacterCollisions();

    // --- animation selection ---
    this._jumpLatch = Math.max(0, (this._jumpLatch || 0) - dt);
    const planar = Math.hypot(this.vel.x, this.vel.z);
    if (this.swimming && !this.grounded) {
      // treading water: the legs keep going whether you are moving or not
      this.animator.playBase('walk', { fade: 0.25 });
      this.animator.setBaseSpeed(0.55 + clamp(planar / 2, 0, 0.6));
    } else if (!this.grounded) {
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
    } else if (MELEE_HOLD[this.equipped]) {
      // A blade is not a fist, and a sledgehammer is not a blade: each is
      // carried the way its weight wants to be carried.
      this.animator.setUpper(MELEE_HOLD[this.equipped]);
    } else {
      // a pose of its own if it has one (a zombie's reach), otherwise the guard
      this.animator.setUpper(this.upperPose || (this.isPlayer || this.combatReady ? 'fistGuard' : null));
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

  /**
   * Keeps the walking capsule out of crates, boulders - and walls.
   *
   * Walls used to be missing from this. Nothing stopped a person walking
   * into one except the limbs of their own body hitting it, and those are
   * pinned to the animation, so the only thing that ever came of it was a
   * hail of nonsense impacts that killed whoever touched a wall. Static map
   * parts are tested against their bounding box rather than their centre,
   * because the centre of an eighty metre wall is never within three metres
   * of the person leaning on it.
   */
  _resolveBodyCollisions(dt) {
    const w = this.world;
    const feet = this.pos.y - HIP_HEIGHT;
    const top = feet + lerp(1.72, 1.12, this.crouch);
    const radius = 0.27;

    for (let s = 0; s < 2; s++) {
      const list = s === 0 ? w.staticBodies : w.bodies;
      for (let i = 0; i < list.length; i++) this._capsuleVsBody(list[i], feet, top, radius, dt);
    }
  }

  _capsuleVsBody(b, feet, top, radius, dt) {
    if (b.aabbMax.y < feet + 0.06 || b.aabbMin.y > top) return;
    if (this.pos.x < b.aabbMin.x - radius - 0.05 || this.pos.x > b.aabbMax.x + radius + 0.05 ||
        this.pos.z < b.aabbMin.z - radius - 0.05 || this.pos.z > b.aabbMax.z + radius + 0.05) return;
    // Low enough to step onto: the ground scan already handles it.
    if (b.aabbMax.y <= feet + (this._stepUp || STEP_UP)) return;

    _v1.set(this.pos.x, clamp(b.pos.y, feet + 0.3, top), this.pos.z);
    b.closestPoint(_v1, _v2);
    _v3.set(_v1.x - _v2.x, 0, _v1.z - _v2.z);
    let d = _v3.length();
    let pen;
    if (d < 1e-5) {
      /* The centre itself is inside: a long frame on a slow phone can carry
         someone half a metre, which is half of a wall. Out through the
         nearest side face - never towards the middle of the box, which for
         an eighty metre wall would mean sliding along it instead. */
      if (b.shape === 'sphere') {
        _v3.set(this.pos.x - b.pos.x, 0, this.pos.z - b.pos.z);
        if (_v3.lengthSq() < 1e-8) _v3.set(1, 0, 0);
        _v3.normalize();
        pen = radius + b.radius - Math.hypot(this.pos.x - b.pos.x, this.pos.z - b.pos.z);
      } else {
        b.worldToLocal(_v1, _v4);
        const h = b.half;
        const px = h.x - Math.abs(_v4.x), pz = h.z - Math.abs(_v4.z);
        if (px < pz) _v3.set(_v4.x >= 0 ? 1 : -1, 0, 0);
        else _v3.set(0, 0, _v4.z >= 0 ? 1 : -1);
        _v3.applyQuaternion(b.quat);
        _v3.y = 0;
        _v3.normalize();
        pen = Math.min(px, pz) + radius;
      }
    } else {
      _v3.multiplyScalar(1 / d);
      if (d >= radius) return;
      pen = radius - d;
    }

    const massRatio = b.invMass > 0 ? clamp(b.mass / (b.mass + 78), 0, 0.6) : 0;
    this.pos.addScaledVector(_v3, pen * (1 - massRatio));
    if (b.invMass > 0) {
      _v4.copy(_v3).multiplyScalar(-pen * 1400 * Math.min(dt, 0.033));
      b.applyImpulse(_v4, _v2);
    }
    const vn = this.vel.x * _v3.x + this.vel.z * _v3.z;
    if (vn < 0) { this.vel.x -= vn * _v3.x; this.vel.z -= vn * _v3.z; }
  }

  /**
   * People are solid. Only bodies that are still on their feet block you;
   * a ragdoll on the floor is something you walk over, and its limbs are
   * already handled by the particle collisions.
   */
  _resolveCharacterCollisions() {
    const chars = this.world.characters;
    const RADIUS = 0.26;
    const minD = RADIUS * 2;
    for (let i = 0; i < chars.length; i++) {
      const o = chars[i];
      if (o === this || !o.collidable) continue;
      const upright = o.state === STATE.CONTROLLED ||
        (o.state === STATE.STUMBLE && o.particles.hip.y > this.world.groundY + 0.55);
      if (!upright) continue;
      if (Math.abs(this.pos.y - o.pos.y) > 1.6) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
      let d = Math.hypot(dx, dz);
      if (d >= minD) continue;
      let nx, nz;
      if (d < 1e-5) { nx = 1; nz = 0; d = 0; } else { nx = dx / d; nz = dz / d; }
      // Both sides run this, so half the overlap each resolves the pair.
      const share = this.state === STATE.CONTROLLED ? 0.55 : 1;
      this.pos.x += nx * (minD - d) * share;
      this.pos.z += nz * (minD - d) * share;
      const vn = this.vel.x * nx + this.vel.z * nz;
      if (vn < 0) { this.vel.x -= vn * nx; this.vel.z -= vn * nz; }
    }
  }

  _updateStumble(dt) {
    const P = this.particles;
    this.animator.playBase('stagger', { fade: 0.2 });
    this.animator.setUpper(null);
    this.targetStrength = lerp(RAGDOLL.stumbleStrength[0], RAGDOLL.stumbleStrength[1],
      clamp01(this.balance / 0.55));

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
    /* An unconscious body goes limp. While a ragdoll is still trying - which
       is most of the time, since anyone who can get up does - it keeps the
       muscle tone that makes it flinch and reach; left down long enough with
       no intention of getting up, it relaxes to a dead weight. Without that,
       a body lying on the grass is quietly pulled towards a standing pose
       for ever, and creeps across the map at a few centimetres a second. */
    const limp = this.dead || !this.wantsUp
      ? clamp01((this.stateTime - 1.4) / 2.5) : 0;
    this.targetStrength = this.dead
      ? RAGDOLL.deadStrength
      : lerp(RAGDOLL.strength, RAGDOLL.deadStrength, limp);
    this.getUpDelay -= dt;

    if (!this.dead) {
      /* Alive ragdolls are not sacks of flour - but they are not electrified
         either. This used to fire a random four-metre-a-second kick into a
         random joint several times a second, which is not writhing, it is
         vibrating. What a body on the floor actually does is push against the
         ground in slow waves, so that is what this is: a low frequency effort
         through the hips and shoulders that fades as the pain does, plus the
         occasional weak shove from a limb. */
      const h = this.world.substepDt;
      /* Effort is pain and nothing else, so a body that has stopped hurting
         stops moving. A permanent floor here is the difference between a
         person lying still and a person buzzing. */
      const effort = this._noWrithe ? 0 : clamp01(this.painTimer / 1.2);
      const t = this.stateTime;
      const w = effort > 0.001
        ? Math.sin(t * 2.1 + this.id) * Math.sin(t * 0.73 + this.id * 2.3) : 0;
      this.particles.hip.addVelocity(
        w * 0.9 * effort, Math.max(0, w) * 0.5 * effort, w * 0.6 * effort, h * dt * 60);
      this.particles.shoulders.addVelocity(
        -w * 0.7 * effort, Math.max(0, -w) * 0.4 * effort, -w * 0.5 * effort, h * dt * 60);
      if (effort > 0.2 && this.rng() < dt * 1.4) {
        const limb = this.particleList[this.rng.int(0, this.particleList.length - 1)];
        limb.addVelocity((this.rng() - 0.5) * 1.1 * effort, this.rng() * 0.7 * effort,
          (this.rng() - 0.5) * 1.1 * effort, h);
      }
      // Deliberate shoving: a body on the floor can still drag itself about.
      const push = _v1.set(this.moveInput.x, 0, this.moveInput.z);
      if (push.lengthSq() > 0.01) {
        push.normalize();
        const k = this.wantsUp ? 3.4 : 2.2;
        this.particles.hip.addVelocity(push.x * k, 0.45, push.z * k, h);
        this.particles.shoulders.addVelocity(push.x * k * 0.6, 0.25, push.z * k * 0.6, h);
      }
      // Asking to jump is asking to get up now.
      if (this.wantJump) {
        this.wantJump = false;
        this.getUpDelay = Math.min(this.getUpDelay, 0.05);
        this.balance = Math.max(this.balance, 0.4);
      }
      const settled = this._ragdollSpeed() < 1.5;
      if (this.getUpDelay <= 0 && settled && this.wantsUp && this.balance > 0.35) {
        this._beginGetUp();
      }
      this.balance = clamp01(this.balance + dt * 0.22);
    }
  }

  _updateDead() {
    this._rootFromPhysics();
    this.targetStrength = RAGDOLL.deadStrength;
  }

  get wantsUp() { return this._wantsUp !== false; }
  set wantsUp(v) { this._wantsUp = v; }

  _beginGetUp() {
    const P = this.particles;
    // Which way up are we? That decides which get-up plays.
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
  }

  _updateGetUp() {
    const a = this.animator;
    const prog = a.fullActive ? clamp01(a.fullTime / a.fullDuration) : 1;
    this.targetStrength = lerp(0.16, 1.0, smoothstep(prog * 1.12));
    const groundY = this._groundHeight(this.getUpX, this.getUpZ, 1e9);
    const absY = a.rootYAbs ? a.rootYAbs.value : HIP_HEIGHT;
    this.rig.rootPos.set(this.getUpX, groundY + absY, this.getUpZ);
    _q1.setFromAxisAngle(UP, this.getUpYaw);
    _q2.setFromAxisAngle(_v1.set(1, 0, 0), a.rootPitch);
    this.rig.rootQuat.copy(_q1).multiply(_q2);
    this.pos.set(this.getUpX, groundY + HIP_HEIGHT, this.getUpZ);
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
  /**
   * Where the character is looking, spread down the neck and spine.
   *
   * A person does not swivel like a turret. The head goes first and takes what
   * it can, the neck picks up what is left, and only then does the chest start
   * to come round - each within its own limit, so nothing has to be clamped
   * afterwards. The hips only turn when the gaze has gone further round than a
   * spine can follow, which is what BODY_TURN_THRESHOLD is.
   */
  _applyLookOffsets() {
    if (this.state !== STATE.CONTROLLED) return;
    const rig = this.rig;

    /* Pitch, down the same chain, head first. Looking up leans the head back,
       which is the same +X the spine uses, so the sign carries straight over. */
    const want = clamp(this.pitch, -1.15, 1.15);
    let left = want;
    for (const link of LOOK_CHAIN.pitch) {
      if (Math.abs(left) < 1e-4) break;
      left -= this._spend(rig.byName[link.bone], 'x', left, link.share);
    }

    /* Yaw: how far the gaze has gone past where the hips point. Turning the
       right shoulder forward with +Y turns the body the same way a bigger root
       yaw does, so this too carries straight over. */
    let yawLeft = angleDelta(this.yaw, this.gazeYaw);
    for (const link of LOOK_CHAIN.yaw) {
      if (Math.abs(yawLeft) < 1e-4) break;
      yawLeft -= this._spend(rig.byName[link.bone], 'y', yawLeft, link.share);
    }

    /* Aiming: the arms come round with the gaze rather than being left behind
       by it, so what is in your hands ends up pointed at what you are looking
       at and the hands stay on the weapon. */
    const a = this.animator;
    const aim = Math.max(a.upperWeight, a.actionWeight);
    if (aim > 0.01) {
      const k = want * AIM_ARM_FOLLOW * aim;
      rig.byName.upperArmR.anim.x += k;
      rig.byName.upperArmL.anim.x += k;
    }
  }

  /**
   * Recoil, added on top of whatever the hands are already doing. A gun going
   * off rotates about the wrist first, then folds the elbow, then moves the
   * shoulder - which is why the muzzle climbs rather than the whole arm
   * travelling backwards. The support arm comes with it, because it is holding
   * the same gun.
   */
  _applyRecoil() {
    const k = this.recoil || 0;
    if (k < 0.001) return;
    const rig = this.rig;
    rig.byName.handR.anim.x += k * 0.42;
    rig.byName.lowerArmR.anim.x += k * 0.30;
    rig.byName.upperArmR.anim.x -= k * 0.12;
    rig.byName.handL.anim.x += k * 0.34;
    rig.byName.lowerArmL.anim.x += k * 0.24;
    rig.byName.upperTorso.anim.x += k * 0.05;
  }

  /**
   * Puts as much of `demand` into one joint's axis as that joint is allowed to
   * spend, and reports how much it took.
   */
  _spend(bone, axis, demand, share) {
    if (!bone) return 0;
    const lim = JOINT_LIMITS[bone.name];
    if (!lim) { bone.anim[axis] += demand; return demand; }
    const range = lim[axis];
    const room = demand > 0
      ? Math.max(0, range[1] * share - bone.anim[axis])
      : Math.min(0, range[0] * share - bone.anim[axis]);
    const take = demand > 0 ? Math.min(demand, room) : Math.max(demand, room);
    bone.anim[axis] += take;
    return take;
  }

  /* ----------------------------------------------------------- muscle target */

  /**
   * Hands the solver where the animation wants each joint, and how fast it is
   * moving it. The speed matters: it is what a limb carries away with it when
   * the character stops being in control mid-swing.
   */
  _writeMuscleTargets(dt) {
    const layout = LAYOUT;
    const strength = this.strength;
    const inv = dt > 1e-5 ? 1 / dt : 0;
    const MAX_TARGET_SPEED = 14;
    for (let i = 0; i < layout.length; i++) {
      const [name, , , boneName, which] = layout[i];
      const bone = this.rig.byName[boneName];
      const src = which === 'pos' ? bone.worldPos : bone.worldEnd;
      const p = this.particles[name];
      const limp = this.limpScale[boneName];
      let vx = (src.x - p.tx) * inv, vy = (src.y - p.ty) * inv, vz = (src.z - p.tz) * inv;
      // A teleport or a state change moves a target a long way in one frame;
      // that is not the limb travelling, so do not let it read as speed.
      const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (sp > MAX_TARGET_SPEED) { const k = MAX_TARGET_SPEED / sp; vx *= k; vy *= k; vz *= k; }
      p.tvx = vx; p.tvy = vy; p.tvz = vz;
      p.tx = src.x; p.ty = src.y; p.tz = src.z;
      // A broken bone holds nothing up: its joints go slack whatever the rest
      // of the body is doing.
      p.muscle = limp < 1 ? strength * limp : strength;
    }
  }

  /* ------------------------------------------------------------ physics hook */

  preSubstep(h) {
    /* A body nobody is driving any more still has to settle. Without this the
       constraint solver and the last of the muscle tone trade energy back and
       forth and the limbs ring like springs; with it they swing, slow, and
       stop, which is what a fallen body does.
       
       But only the swinging. Damping every particle's whole velocity damps
       the body's own fall with it - that is air resistance, and at this rate
       it held a falling body to gravity divided by the damping, about eight
       metres a second, which is a corpse coming down like a leaf. So the
       body's own motion is taken out first, the rest is damped, and the
       motion is put back: the limbs still stop ringing, and the body falls at
       the gravity everything else falls at. */
    /* Carry the whole target pose to where the body actually is, so the
       muscles answer for the pose being wrong and for nothing else. Measured
       against the hip, which is the root the pose is built on. */
    const hip = this.particles.hip;
    this.muscleShiftX = hip.x - hip.tx;
    this.muscleShiftY = hip.y - hip.ty;
    this.muscleShiftZ = hip.z - hip.tz;

    if (this.state !== STATE.CONTROLLED) {
      const k = Math.exp(-RAGDOLL.damping * h);
      const list = this.particleList;
      let mx = 0, my = 0, mz = 0, mass = 0;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const w = p.mass;
        mx += (p.x - p.px) * w; my += (p.y - p.py) * w; mz += (p.z - p.pz) * w;
        mass += w;
      }
      if (mass > 1e-6) { mx /= mass; my /= mass; mz /= mass; }
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        p.px = p.x - (mx + (p.x - p.px - mx) * k);
        p.py = p.y - (my + (p.y - p.py - my) * k);
        p.pz = p.z - (mz + (p.z - p.pz - mz) * k);
      }
    }
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
      /* The reflex that fights to stay on your feet. Kept under gravity on
         purpose: a body already on its back should stay there and go to a
         ragdoll, not haul its own shoulders off the floor. */
      const upErr = clamp01(0.92 - this._uprightness());
      P.shoulders.addVelocity(0, upErr * 15 * h, 0, h);
      P.hip.addVelocity(0, upErr * 6 * h, 0, h);
    }
  }

  postSubstep() {
    // asleep: whatever the substep did to this body, it is back where it lay
    if (this.asleep) {
      const list = this.particleList, f = this._frozen;
      if (f && f.length === list.length * 3) {
        for (let i = 0; i < list.length; i++) {
          const p = list[i];
          p.x = p.px = f[i * 3]; p.y = p.py = f[i * 3 + 1]; p.z = p.pz = f[i * 3 + 2];
        }
      } else {
        this.wake();
      }
    }
    const P = this.particles;
    this.center.set(
      (P.hip.x + P.shoulders.x) * 0.5,
      (P.hip.y + P.shoulders.y) * 0.5,
      (P.hip.z + P.shoulders.z) * 0.5,
    );
  }

  /* ------------------------------------------------------------------ sleep */

  /**
   * A body lying still is held still.
   *
   * Four limp bodies in a heap are a pile of things leaning on each other, and
   * the solver never quite agrees with itself about who is holding whom up: a
   * toe caught between two shins trades a millimetre back and forth every
   * substep, a body on top creeps off the one under it at a few millimetres a
   * second, and that goes on for as long as anyone is watching. Real piles do
   * not do that; friction holds them. So once a body that is not trying to do
   * anything - dead, or down and not getting up - has gone a full second
   * without any part of it getting anywhere, it goes to sleep: every substep
   * ends with it put back exactly where it was. To everything else it is now
   * a solid thing to lie on.
   *
   * Anything that would move it wakes it first: a hit, damage, a change of
   * state, a teleport, the RCV2, or something moving into the space it is
   * lying in.
   */
  _updateSleep(dt) {
    const limp = this.state === STATE.DEAD || (this.state === STATE.RAGDOLL && !this.wantsUp);
    if (!limp || this.stateTime < 2) {
      if (this.asleep || this._sleepRef || this._limpT) this.wake();
      return;
    }
    if (this.asleep) {
      if (this._disturbed()) this.wake();
      return;
    }
    this._limpT += dt;
    const list = this.particleList;
    if (!this._sleepRef || this._sleepRef.length !== list.length * 3) {
      this._sleepRef = new Float64Array(list.length * 3);
      this._snapshot(this._sleepRef);
      this._sleepT = 0;
      this._stillWindows = 0;
      return;
    }
    this._sleepT += dt;
    if (this._sleepT < SLEEP.window) return;
    this._sleepT = 0;
    // how far has any part of it got in the last half second?
    const ref = this._sleepRef;
    let worst = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const dx = p.x - ref[i * 3], dy = p.y - ref[i * 3 + 1], dz = p.z - ref[i * 3 + 2];
      worst = Math.max(worst, dx * dx + dy * dy + dz * dz);
    }
    this._snapshot(ref);
    this._stillWindows = worst < SLEEP.still * SLEEP.still ? this._stillWindows + 1 : 0;
    if (this._ready && this._slow()) this._fallAsleep();
  }

  /**
   * Ready to sleep: still for long enough - or limp and left alone for so
   * long that whatever it is still doing can only be the solver creeping.
   * A body that has had nothing touch it for six seconds has finished
   * falling; if it is still inching across the floor, that is not physics.
   */
  get _ready() {
    return this._stillWindows >= SLEEP.windows || this._limpT > SLEEP.force;
  }

  /** Not on its way anywhere: a body sliding or falling is never frozen. */
  _slow() {
    const list = this.particleList;
    const h = this.world.substepDt;
    let mx = 0, my = 0, mz = 0, fast = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const vx = p.x - p.px, vy = p.y - p.py, vz = p.z - p.pz;
      mx += vx; my += vy; mz += vz;
      fast = Math.max(fast, vx * vx + vy * vy + vz * vz);
    }
    const n = Math.max(1, list.length);
    const com = Math.hypot(mx / n, my / n, mz / n) / h;
    return com < SLEEP.creep && Math.sqrt(fast) / h < SLEEP.limbSpeed;
  }

  _snapshot(out) {
    const list = this.particleList;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      out[i * 3] = p.x; out[i * 3 + 1] = p.y; out[i * 3 + 2] = p.z;
    }
  }

  _fallAsleep() {
    const list = this.particleList;
    this._frozen = new Float64Array(list.length * 3);
    this._snapshot(this._frozen);
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const p of list) {
      p.px = p.x; p.py = p.y; p.pz = p.z;
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); minZ = Math.min(minZ, p.z);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); maxZ = Math.max(maxZ, p.z);
    }
    const m = SLEEP.margin;
    this._sleepBox = { minX: minX - m, minY: minY - m, minZ: minZ - m, maxX: maxX + m, maxY: maxY + m, maxZ: maxZ + m };
    /* Not with something still settling against it. This body has still
       settled - its count stands, and it tries again next window - or two
       settled bodies lying against each other would each keep resetting the
       other and neither would ever sleep. */
    if (this._disturbed()) {
      this._frozen = null;
      this._sleepBox = null;
      return;
    }
    this.asleep = true;
  }

  /** Back to being simulated. Cheap, and safe to call whenever. */
  wake() {
    this.asleep = false;
    this._frozen = null;
    this._sleepRef = null;
    this._sleepT = 0;
    this._stillWindows = 0;
    this._limpT = 0;
  }

  /** Is anything moving into the space this sleeping body takes up? */
  _disturbed() {
    const box = this._sleepBox;
    if (!box) return true;
    const w = this.world;
    /* A crate or a boulder that is awake and touching it, however slowly it
       is moving: something resting on a body has to be held up by a body
       that answers back, so the body stays awake until the crate sleeps. */
    for (let i = 0; i < w.bodies.length; i++) {
      const b = w.bodies[i];
      if (b.sleeping) continue;
      if (b.aabbMax.x < box.minX || b.aabbMin.x > box.maxX || b.aabbMax.y < box.minY ||
          b.aabbMin.y > box.maxY || b.aabbMax.z < box.minZ || b.aabbMin.z > box.maxZ) continue;
      return true;
    }
    /* Other people. Anyone moving into it wakes it, and so does anyone lying
       against it who has not settled yet: a pile sleeps together or not at
       all. A body that froze while the one on top of it was still sliding
       would be a rigid slope, and the one on top would slide all the way
       down it - nothing under it gives. */
    const step = SLEEP.wakeSpeed * w.substepDt;
    for (let i = 0; i < w.characters.length; i++) {
      const c = w.characters[i];
      if (c === this || c.asleep) continue;
      if (c.center.x < box.minX - 1.2 || c.center.x > box.maxX + 1.2 ||
          c.center.z < box.minZ - 1.2 || c.center.z > box.maxZ + 1.2) continue;
      let against = false;
      for (const p of c.particleList) {
        if (p.x < box.minX || p.x > box.maxX || p.y < box.minY || p.y > box.maxY ||
            p.z < box.minZ || p.z > box.maxZ) continue;
        against = true;
        const dx = p.x - p.px, dy = p.y - p.py, dz = p.z - p.pz;
        if (dx * dx + dy * dy + dz * dz > step * step) return true;
      }
      if (against && !c._ready) return true;
    }
    return false;
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
        /* And then held to the same joint limits the animation is.
           The particles describe where the body has ended up; a pair of them is
           only a direction, and nothing about a direction says a knee may not
           point backwards. Measured on a body that had simply fallen over, the
           drawn pose had knees a hundred and seventy degrees past straight and
           a spine folded double - which is exactly what a ragdoll looking
           wrong looks like. Clamped here, after the blend, because this is the
           pose that actually gets drawn: two valid rotations slerped together
           are not necessarily a valid rotation. */
        if (b.parent) {
          this._limitDrawnBone(b);
          b.worldPos.copy(b.offset).applyQuaternion(b.parent.worldQuat).add(b.parent.worldPos);
        }
        b.worldEnd.copy(_v1.set(0, b.length, 0).applyQuaternion(b.worldQuat)).add(b.worldPos);
      }
    }
    this._updateStrike(dt);
    this.body._eyeDt = dt;
    this.body.sync();
    this._syncArmour();
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
          /* Turn the bone from where it would hang with no animation onto
             where its two particles actually are.

             The rest rotation has to be part of that. A bone points along its
             own +Y, and a limb that hangs downwards has a half turn built into
             its rest - so leaving the rest out here drew every thigh and every
             upper arm pointing exactly the wrong way, up through the body
             instead of down out of it, with the shin and the foot hanging off
             the wrong end. That is what a ragdoll with its legs inside its
             chest was: not the physics, which was right all along, but the
             drawing of it. */
          const pq = this._physQuat[bone.parent.index];
          _v2.copy(bone.restDirInParent).applyQuaternion(pq);
          _q1.setFromUnitVectors(_v2, _v1);
          this._physQuat[idx].copy(_q1).multiply(pq).multiply(bone.restQuat);
          this._twistFromChild(bone, idx, _v1);
        }
      } else {
        // fingers and foot tips just follow their parent
        const pq = this._physQuat[bone.parent.index];
        this._physPos[idx].copy(bone.offset).applyQuaternion(pq).add(this._physPos[bone.parent.index]);
        this._physQuat[idx].copy(pq).multiply(bone.restQuat).multiply(bone.animQuat);
      }
    }
  }

  /**
   * Rolls a limb about its own axis so the hinge below it bends the way it
   * really is bent. `dir` is where the limb points, already normalised.
   */
  _twistFromChild(bone, idx, dir) {
    const spec = TWIST_FROM_CHILD[bone.name];
    if (!spec) return;
    const pair = this.boneParticles[spec[0]];
    if (!pair) return;
    const P = this.particles;
    const a = P[pair[0]], b = P[pair[1]];
    _v3.set(b.x - a.x, b.y - a.y, b.z - a.z);
    if (_v3.lengthSq() < 1e-10) return;
    _v3.normalize();
    // sin(bend) * the hinge axis, in world space
    _v4.crossVectors(dir, _v3);
    // A straight limb has no plane to speak of; leave it as it came out.
    if (_v4.lengthSq() < 4e-4) return;
    _v4.normalize().multiplyScalar(spec[1]);
    // rebuild the orientation from the two axes the body actually has
    _v2.crossVectors(_v4, dir);
    _m4.makeBasis(_v4, dir, _v2);
    this._physQuat[idx].setFromRotationMatrix(_m4);
  }

  /**
   * Pulls one drawn bone back inside its joint's range.
   *
   * Works on the DIRECTION the bone points, not on its euler angles. Taking a
   * rotation apart into three angles and clamping them is fine near the middle
   * of the range and disastrous away from it: a leg lying flat behind a body
   * reads as a large turn about one axis, and clamping the other two then
   * swings the whole limb somewhere else entirely - which is how a settled
   * ragdoll ended up with one leg standing straight up in the air.
   *
   * A direction cannot gimbal. The bone's own axis is taken into the parent's
   * frame, checked against the cone the joint allows, and - only if it is
   * outside - turned by the smallest rotation that brings it back. Twist along
   * the bone is left exactly as it was, since a box limb barely shows it and
   * nothing here can judge it safely.
   *
   * Broken bones are let through: that is what broken means, and the solid
   * capsules are what keep those honest instead.
   */
  _limitDrawnBone(bone) {
    if (!DRAWN_LIMIT_BONES.has(bone.name) || this._skipDrawnLimits) return;
    const lim = JOINT_LIMITS[bone.name];
    if (!lim) return;
    if (this.broken.size && this.broken.has(bone.name)) return;

    // the bone's direction, in the frame its joint limits are written in
    _q1.copy(bone.parent.worldQuat).invert().multiply(bone.worldQuat);
    _q2.copy(bone.restQuat).invert().multiply(_q1);
    _v3.set(0, 1, 0).applyQuaternion(_q2);

    /* Where a rotation of Rx(a)*Ry(b)*Rz(c) puts +Y is (-sin c, cos a cos c,
       sin a cos c), which inverts exactly - and without ever consulting the
       twist b. */
    const a = Math.atan2(_v3.z, _v3.y);
    const c = Math.asin(clamp(-_v3.x, -1, 1));
    const a2 = clamp(a, lim.x[0], lim.x[1]);
    const c2 = clamp(c, lim.z[0], lim.z[1]);
    if (a2 === a && c2 === c) return;

    const cc = Math.cos(c2), sc = Math.sin(c2);
    _v4.set(-sc, Math.cos(a2) * cc, Math.sin(a2) * cc);
    if (_v4.lengthSq() < 1e-9) return;
    _q1.setFromUnitVectors(_v3.normalize(), _v4.normalize());
    _q2.premultiply(_q1);
    bone.worldQuat.copy(bone.parent.worldQuat).multiply(bone.restQuat).multiply(_q2);
  }

  /* ---------------------------------------------------------------- punching */

  /** Throws a jab. Alternates sides, exactly as asked. */
  punch(force = false) {
    if (this.state !== STATE.CONTROLLED) return false;
    if (this.equipped !== 'fists' && !force) return false;
    if (this.punchCooldown > 0 || this.animator.actionActive) return false;
    // You throw the jab you still have an arm for.
    const want = this.punchSide === 'R' ? 'L' : 'R';
    const other = want === 'R' ? 'L' : 'R';
    this.punchSide = !this.armBroken(want) ? want : (!this.armBroken(other) ? other : null);
    if (!this.punchSide) return false;
    const clip = this.punchSide === 'R' ? 'punchR' : 'punchL';
    this.animator.playAction(clip);
    this.punchCooldown = 0.30;
    this.squareTimer = 0.7;
    this.struck.clear();
    this.combatReady = true;
    this.combatTimer = 3.5;
    return true;
  }

  /**
   * Starts a reload. It is an ordinary one shot upper body clip, so the legs
   * keep walking and a hit still interrupts it, both of which are true.
   */
  playReload(clip) {
    if (this.state !== STATE.CONTROLLED) return false;
    if (this.armBroken('R') || this.armBroken('L')) return false;
    if (this.animator.actionActive) return false;
    this.animator.playAction(clip);
    return true;
  }

  get reloading() { return RELOADS.has(this.animator.actionName); }

  /** A round going off shoves the gun, and the gun is in your hands. */
  kick(amount) { this.recoil = Math.min(1.6, (this.recoil || 0) + amount); }

  /** Swings whatever is in hand. One way, then back the other. */
  slash(force = false) {
    if (this.state !== STATE.CONTROLLED) return false;
    const clips = MELEE_CLIPS[this.equipped];
    if (!clips && !force) return false;
    if (this.armBroken('R')) return false;      // nothing to swing it with
    if (this.punchCooldown > 0 || this.animator.actionActive) return false;
    const pair = clips || MELEE_CLIPS.machete;
    this.slashSide = this.slashSide === 'R' ? 'L' : 'R';
    this.animator.playAction(this.slashSide === 'R' ? pair[0] : pair[1]);
    this.punchCooldown = MELEE_COOLDOWN[this.equipped] ?? 0.34;
    this.squareTimer = 0.9;
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
    const clip = a.actionName;
    const isPunch = clip === 'punchR' || clip === 'punchL';
    const isSlash = MELEE_ACTIONS.has(clip);
    if (!isPunch && !isSlash) return;      // a reload hits nothing
    const strike = a.action.clip.strike;
    const t = a.actionTime;
    if (t < strike.from || t > strike.to) return;

    // Both weapons are held in a hand, so the hand is what carries the speed.
    const side = strike.hand === 'handR' ? 'R' : 'L';
    if (isPunch) this.onStrike?.(this, side, this.handVel[side]);
    else this.onSlash?.(this, side, this.handVel[side]);
  }

  /* ------------------------------------------------------------------ misc */

  setEquipped(name) {
    this.equipped = name;
    if (name !== 'fists') this.animator.cancelAction();
  }

  dispose() {
    this.world.removeCharacter(this);
    this.ai?.dispose?.();
    // Whatever they were wearing goes with them, or it hangs in the air
    // where they used to be.
    for (const a of this.armourPieces) a.dispose();
    this.worn = {};
    this.body.dispose();
  }
}

const LAYOUT = particleLayout();

/** When a body lying still is allowed to sleep, and what wakes it. */
/* `still` is generous on purpose. Bodies stacked on each other creep: the
   overlap between them is resolved along a tilted line every substep, and
   that sideways nudge is a position fix the ground's friction never sees, so
   the bottom one slides a few centimetres a second for as long as the pile is
   simulated. Ten centimetres a second is well past most of that creep and
   well short of anything still really going somewhere; `force` catches the
   rest. Gripping the floor harder instead was tried, and it stopped bodies
   that buckle at the knees from sliding their feet out and lying down flat. */
const SLEEP = {
  window: 0.5,       // seconds per look
  still: 0.05,       // no part may have moved further than this in a window...
  windows: 2,        // ...this many windows running
  force: 6,          // or this long limp with nothing touching it, seconds...
  creep: 0.3,        // ...as long as it is creeping, not sliding, m/s
  limbSpeed: 1.5,    // and no part of it is moving faster than this, m/s
  margin: 0.3,       // how close a moving thing has to come to wake it, metres
  wakeSpeed: 0.45,   // and how fast it has to be moving, m/s
};

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

