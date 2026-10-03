/* =============================================================================
   A person.

   Always two things at once: an animated skeleton (where the muscles want
   each part to be) and eighteen rigid bodies joined at real joints (where
   each part actually is). What you see is the bodies. The state decides who
   wins:

     active   muscles in full control: the bodies follow the animation
              exactly, and shove whatever they walk into
     stumble  knocked off balance: the bodies are simulated and the muscles
              pull them toward a staggering animation with reduced strength,
              so the hit is carried through the body and it may recover...
     ragdoll  ...or not: no muscle at all, every part swings on its own joint
     getup    lying still again: the get-up animation takes over, blended in
              from wherever the ragdoll came to rest
     dead     a ragdoll that does not get up

   Damage only happens through contact: a fist or a weapon has to actually
   overlap a body part (see Game.strikes), and a body part has to actually
   hit something hard (see Human.impacts).
   ========================================================================== */
import {
  Vector3, Quaternion, Matrix4, Bone, Skeleton, SkinnedMesh, MeshLambertMaterial,
} from 'three';
import { Body, Joint } from '../physics/world.js';
import { boxOverlap, lastNormal, boxBox, ContactPoint } from '../physics/collide.js';
import {
  PARTS, NP, P, JOINTS, jointAnchors, forwardKinematics, lowestPoint, VITAL, BALANCE_HIT, TOTAL_MASS,
} from './rig.js';
import {
  makePose, poseQuats, locomotion, strideAt, blendParts, copyPose, makeQuats,
  GUARD, HOLD, STANCE, FLAIL, UPPER, LEGS, ARMS, PICKUP, GETUP_BACK, GETUP_FRONT,
} from './anim.js';
import { packBoxes, buildBoxGeometry, PaintCanvas } from './paint.js';
import { randomLook, paintBody, paintHead } from './appearance.js';
import { Brain } from './ai.js';
import { clamp, rand, smooth, turnToward, wrapAngle, approach, chance } from '../core/util.js';

const UP = new Vector3(0, 1, 0);
const D = Math.PI / 180;
const FEET = [P.footL, P.footR];

let LAYOUT = null, GEOMETRY = null;
function shared() {
  if (!LAYOUT) {
    LAYOUT = packBoxes(PARTS.map((p) => ({ size: p.size, density: p.name === 'head' ? 300 : 210 })), 512);
    GEOMETRY = buildBoxGeometry(PARTS.map((p) => ({ size: p.size })), LAYOUT, true);
  }
  return { layout: LAYOUT, geometry: GEOMETRY };
}
export function bodyLayout() { return shared().layout; }

const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3();
const _q1 = new Quaternion(), _q2 = new Quaternion();
const _rootQ = new Quaternion();
const _pts = [0, 1, 2, 3].map(() => new ContactPoint());
const _ONE = new Vector3(1, 1, 1);
const _ZERO = new Vector3();
const _bp = new Vector3(), _bq = new Quaternion();
const _blendQ = PARTS.map(() => new Quaternion());

let _humanId = 0;

/** Strength of each muscle state (1 = rigidly follows the animation). */
const STUMBLE_STRENGTH = 0.42;

export class Human {
  constructor(game, team, x, z, heading = 0) {
    this.game = game;
    this.id = ++_humanId;
    this.team = team;
    this.look = randomLook(team);
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
    this.mesh.userData.human = this;
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
    this.health = 100;
    this.balance = 100;
    this.sinceHit = 10;
    this.root = new Vector3(x, game.groundAt(x, z), z);
    if (!isFinite(this.root.y)) this.root.y = 0;
    this.heading = heading;
    this.vel = new Vector3();
    this.move = new Vector3();      // desired velocity, set by the brain
    this.face = null;               // desired heading, or null to face the way it walks
    this.legYaw = 0;
    this.phase = Math.random();
    this.time = Math.random() * 10;
    this.guard = 0;
    this.combat = false;
    this.action = null;
    this.holding = null;
    this.flinch = { x: 0, y: 0, vx: 0, vy: 0 };
    this.stumble = null;
    this.down = null;
    this.getup = null;
    this.still = 0;
    this.sleeping = false;
    this.kills = 0;
    this.bleed = 0;                 // blood lost

    this.pose = makePose();
    this.actPose = makePose();
    this.jq = makeQuats();
    this.tPos = PARTS.map(() => new Vector3());
    this.tQuat = PARTS.map(() => new Quaternion());
    this.capPos = PARTS.map(() => new Vector3());
    this.capQuat = PARTS.map(() => new Quaternion());
    this.capLocal = PARTS.map(() => new Quaternion());

    this.brain = new Brain(this);
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
  get standing() { return this.state === 'active' || this.state === 'getup' && this.getup && this.getup.t > this.getup.clip.duration * 0.7; }
  get upright() { return this.state === 'active' || this.state === 'stumble'; }
  get forward() { return _v3.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }

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
    if (this.sinceHit > 0.6) this.balance = Math.min(100, this.balance + 32 * dt);
    this.updateFlinch(dt);

    switch (this.state) {
      case 'active': this.updateActive(dt); break;
      case 'stumble': this.updateStumble(dt); break;
      case 'ragdoll': this.updateDown(dt); break;
      case 'getup': this.updateGetup(dt); break;
      case 'dead': this.updateDead(dt); break;
    }
    if (this.holding) this.holding.follow(dt);
  }

  /** After physics: things that read where the bodies ended up. */
  afterStep(dt) {
    if (this.removed) return;
    this.impacts();
    if (this.state !== 'active' && this.state !== 'getup') {
      // the root follows the body around, so others know where it is
      const p = this.pelvis.x;
      if (this.state !== 'stumble') { this.root.x = p.x; this.root.z = p.z; }
      const g = this.game.groundAt(p.x, p.z);
      if (isFinite(g)) this.root.y = g;
      if (p.y < -6 && this.alive) this.die('fell');
      if (p.y < -40) this.game.removeHuman(this);
    }
  }

  /* ------------------------------- active -------------------------------- */

  updateActive(dt) {
    this.brain.update(dt);

    // locomotion
    const k = approach(9, dt);
    this.vel.x += (this.move.x - this.vel.x) * k;
    this.vel.z += (this.move.z - this.vel.z) * k;
    this.root.x += this.vel.x * dt;
    this.root.z += this.vel.z * dt;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    let want = this.face;
    if (want == null && speed > 0.3) want = Math.atan2(this.vel.x, this.vel.z);
    if (want != null) this.heading = turnToward(this.heading, want, (this.combat ? 7 : 5) * dt);

    const g = this.game.groundAt(this.root.x, this.root.z);
    if (!isFinite(g)) {
      // walked off the edge
      this.enterRagdoll();
      return;
    }
    this.root.y += (g - this.root.y) * approach(14, dt);

    // combat stance
    this.guard += ((this.combat ? 1 : 0) - this.guard) * approach(6, dt);

    // actions
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
    this.phase += dir * (speed / strideAt(speed)) * dt;
    this.phase -= Math.floor(this.phase);

    const pose = this.pose;
    locomotion(pose, speed, this.phase, this.time);
    // stance when standing and squared up
    const still = clamp(1 - speed / 0.6, 0, 1);
    if (this.guard > 0.01) {
      blendParts(pose, STANCE, this.guard * still, LEGS);
      blendParts(pose, this.holding ? HOLD : GUARD, this.guard, UPPER);
      pose.e[P.pelvis * 3 + 1] += STANCE.e[P.pelvis * 3 + 1] * this.guard * still;
    } else if (this.holding) {
      blendParts(pose, HOLD, 0.6, ARMS);
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
      if (a.clip.kind === 'pickup') {
        blendParts(pose, this.actPose, w, LEGS);
        pose.off.lerp(this.actPose.off, w);
      }
      if (a.aim && a.clip.reach) {
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

  /* ------------------------------- actions ------------------------------- */

  canAct() { return this.state === 'active' && !this.action; }

  /** Starts a clip. aim: extra degrees to raise the striking arm. */
  play(clip, aim = 0) {
    const ghosts = [];
    if (clip.active) {
      // what strikes passes through people: the hit is judged by contact, not shoved
      ghosts.push(this.bodies[clip.striker]);
      if (clip.kind === 'swing' && this.holding) ghosts.push(this.holding.body);
      for (const g of ghosts) g.ghost = true;
    }
    this.action = { clip, t: 0, aim: aim * D, weight: 0, hits: new Set(), done: false, back: false, picked: false, ghosts };
    if (clip.kind === 'swing') this.game.emit('swing', this.bodies[P.handR].x);
  }

  updateAction(dt) {
    const a = this.action;
    const c = a.clip;
    if (a.back) {
      // the strike landed: the limb comes straight back the way it went
      a.t -= dt * 1.6;
      if (a.t <= 0) { this.endAction(); return; }
    } else {
      a.t += dt;
      if (a.t >= c.duration) { this.endAction(); return; }
    }
    a.weight = Math.min(1, a.back ? 1 : a.t / 0.05) * Math.min(1, (c.duration - a.t) / 0.08 + (a.back ? 1 : 0));
    if (c.kind === 'pickup' && !a.picked && a.t >= 0.36) {
      a.picked = true;
      this.game.tryPickup(this);
    }
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
    const held = c.kind === 'swing' && this.holding ? this.holding : null;
    // a swing lands with the weapon, or - too close for that - with the fist around it
    if (held && this.strikeWith(held.body, held)) return;
    this.strikeWith(this.bodies[c.striker], null);
  }

  /** Tests one striking box against every enemy body part; true if it landed. */
  strikeWith(s, weapon) {
    const a = this.action;
    for (const v of this.game.humans) {
      if (v === this || v.removed || v.team === this.team || a.hits.has(v)) continue;
      const dx = v.pelvis.x.x - s.x.x, dz = v.pelvis.x.z - s.x.z;
      if (dx * dx + dz * dz > 6) continue;
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
        sp = Math.min(sp, weapon ? 14 : 11);
        // where they actually met: the middle of the contact points, on the victim's surface
        const point = new Vector3();
        const nc = boxBox(s.x, s.axes, s.half, b.x, b.axes, b.half, _pts, 4);
        if (nc) {
          for (let k = 0; k < nc; k++) point.x += _pts[k].bx, point.y += _pts[k].by, point.z += _pts[k].bz;
          point.multiplyScalar(1 / nc);
        } else {
          point.copy(b.x);
        }
        const kind = weapon ? weapon.kind : 'fist';
        const J = weapon ? Math.min(38, weapon.strikeMass * sp) : 2.6 * sp;
        const base = weapon ? weapon.damageBase : 1.5;
        const per = weapon ? weapon.damage : 1.1;
        const damage = (base + per * sp) * VITAL[i] * rand(0.85, 1.15);
        a.hits.add(v);
        a.done = true;
        a.back = true;
        v.takeHit({
          part: i, point, dir: push.clone(), J, speed: sp, damage, attacker: this,
          kind, sharp: weapon ? weapon.sharp : false, striker: s, weapon,
        });
        return true;
      }
    }
    return false;
  }

  /* -------------------------------- damage ------------------------------- */

  takeHit(h) {
    if (this.removed) return;
    this.wake();
    this.sinceHit = 0;
    this.health -= h.damage;
    this.game.blood.onHit(this, h);
    this.game.onHit(this, h);
    if (h.attacker) this.brain.onHit(h.attacker);

    const knock = h.J * BALANCE_HIT[h.part];
    this.balance -= knock * 2.3;
    if (this.health <= 0 && this.alive) this.die('hit');

    const st = this.state;
    if (!this.alive || st === 'ragdoll' || st === 'dead') {
      this.push(h.part, h.point, h.dir, h.J);
      return;
    }
    if (this.balance <= 0 || knock > 60) {
      this.enterRagdoll();
      this.push(h.part, h.point, h.dir, h.J * 1.4);
    } else if (st === 'stumble') {
      if (knock > 16 || this.balance < 35) this.enterRagdoll();
      else this.stumble.t = Math.min(this.stumble.t, this.stumble.dur * 0.3);
      this.push(h.part, h.point, h.dir, h.J);
    } else if (knock > 15) {
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

  /** Impulse J along dir at a point on a part (only bites when simulated). */
  push(part, point, dir, J) {
    const b = this.bodies[part];
    const parent = PARTS[part].parent;
    // the part that was hit takes most of it; what it hangs from takes the rest
    // at once, as a neck or a shoulder would, rather than a frame later
    const share = parent >= 0 ? 0.78 : 1;
    _v1.copy(dir).multiplyScalar(J * share);
    _v2.subVectors(point, b.x);
    b.applyImpulse(_v1, _v2, 1);
    if (parent >= 0) {
      _v1.copy(dir).multiplyScalar(J * (1 - share));
      this.bodies[parent].applyImpulse(_v1, null, 1);
    }
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
      if (this.alive) {
        this.health -= dmg;
        if (this.health <= 0) this.die('impact');
      }
      if (sp > 8 && (i === P.head || chance(0.3))) {
        this.game.blood.impact(this, i, b.x, sp);
      }
    }
  }

  /** Standing, and something heavy came flying in: a body, a crate. */
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
    // a body lying on the ground does not fly at anyone; it is being stepped on
    const oh = o.owner;
    if (oh && oh.bodies && (oh.state === 'ragdoll' || oh.state === 'dead') &&
        o.x.y - this.root.y < 0.35) return;
    const dir = new Vector3().subVectors(b.x, o.x);
    if (dir.lengthSq() < 1e-6) return;
    dir.normalize();
    const sp = best;     // how fast it came at us, on its own
    const J = Math.min(45, Math.min(o.mass, 15) * sp * 0.6);
    if (J < 10) return;
    dir.setY(0);
    if (dir.lengthSq() < 1e-6) dir.copy(o.v).setY(0);
    dir.normalize();
    this.takeHit({
      part, point: b.x.clone(), dir, J, speed: sp, damage: Math.max(0, (sp - 4) * 1.2),
      attacker: null, kind: 'impact', sharp: false, striker: null, weapon: null,
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
    const g = this.game.groundAt(this.root.x, this.root.z);
    if (!isFinite(g)) { this.enterRagdoll(); return; }
    this.root.y += (g - this.root.y) * approach(10, dt);

    this.vel.set(st.vel.x, 0, st.vel.z);
    this.guard = 0;
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
    this.brain.recovered();
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
   * from the hips out, so every bone stays attached at every moment of it -
   * mixing each part's position on its own would pull joints apart mid-blend.
   */
  blendFrom(w) {
    const lq = _blendQ;
    lq[0].identity();
    for (let i = 1; i < NP; i++) lq[i].slerpQuaternions(this.capLocal[i], this.jq[i], w);
    // the pelvis's centre is its joint
    _bq.slerpQuaternions(this.capQuat[0], this.tQuat[0], w);
    _bp.lerpVectors(this.capPos[0], this.tPos[0], w);
    _bp.sub(_v1.copy(PARTS[0].restJoint).applyQuaternion(_bq));
    forwardKinematics(_bp, _bq, _ZERO, lq, this.tPos, this.tQuat);
  }

  /* -------------------------------- ragdoll ------------------------------ */

  enterRagdoll() {
    if (this.action) this.endAction();
    this.dropWeapon();
    if (this.state !== 'stumble' && this.state !== 'ragdoll') this.setDynamic();
    for (const b of this.bodies) b.drive = null;
    this.state = this.alive ? 'ragdoll' : 'dead';
    this.stumble = null;
    this.getup = null;
    this.blendIn = null;
    this.down = { t: 0, wait: rand(1.4, 2.6) + (1 - this.health / 100) * 2.2 };
    this.still = 0;
    this.vel.set(0, 0, 0);
  }

  updateDown(dt) {
    const d = this.down;
    d.t += dt;
    const max = this.settle(dt);
    this.quiet = max < 0.16 ? (this.quiet || 0) + dt : 0;
    const g = this.game.groundAt(this.pelvis.x.x, this.pelvis.x.z);
    if (this.alive && d.t > d.wait && this.quiet > 0.25 && isFinite(g) && this.pelvis.x.y > g - 0.2) {
      this.startGetup();
    }
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
    // on the platform (perhaps on top of someone), not dropping off its edge
    const grounded = isFinite(g) && p.y > g - 0.3 && p.y - g < 1.2;
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
    this.dropWeapon();
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
    gu.t += dt;
    const g = this.game.groundAt(this.root.x, this.root.z);
    if (isFinite(g)) this.root.y += (g - this.root.y) * approach(10, dt);
    if (gu.t >= gu.clip.duration) {
      // hand the distance travelled over to the root
      gu.clip.sample(gu.clip.duration, this.pose);
      const o = _v1.set(this.pose.off.x, 0, this.pose.off.z).applyAxisAngle(UP, this.heading);
      this.root.add(o);
      this.state = 'active';
      this.getup = null;
      this.blendIn = null;
      this.vel.set(0, 0, 0);
      this.updateActive(dt);
      return;
    }
    gu.clip.sample(gu.t, this.pose);
    this.applyFlinch(this.pose);
    this.place(dt, false, null);
  }

  /* -------------------------------- weapons ------------------------------ */

  dropWeapon() {
    if (this.holding) this.holding.drop();
  }

  /* -------------------------------- drawing ------------------------------ */

  syncVisual(alpha) {
    for (let i = 0; i < NP; i++) {
      const b = this.bodies[i];
      _v1.lerpVectors(this.prevPos[i], b.x, alpha);
      _q1.slerpQuaternions(this.prevQuat[i], b.q, alpha);
      this.bones[i].matrixWorld.compose(_v1, _q1, _ONE);
    }
  }

  remove() {
    if (this.removed) return;
    this.removed = true;
    this.dropWeapon();
    if (this.action) this.endAction();
    for (const j of this.joints) this.game.world.removeJoint(j);
    for (const b of this.bodies) this.game.world.remove(b);
    this.game.scene.remove(this.mesh);
    this.material.dispose();
    this.paint.dispose();
    this.mesh.skeleton.dispose();
  }
}

export { TOTAL_MASS };
