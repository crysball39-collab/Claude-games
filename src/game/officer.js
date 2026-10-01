/* =============================================================================
   Officers.

   A police officer is a person like any other - same body, same bones, same
   way of falling over - in a black uniform, a light vest with a badge on it
   and POLICE across the back, and a Glock-19 in a holster on the right hip.

   They keep the peace and nothing more. An officer walks about like anyone
   else and does not care what you are carrying. Hurt an officer, or hurt
   anybody where an officer can see it, and they draw on you: they keep their
   distance, keep you in their sights, fire in aimed shots, reload when the
   magazine is empty, and come looking for you if you get out of sight.
   Other officers who can see one of their own being attacked come in too.

   They stand down once you are dead, or after they have gone a while
   without seeing you.
   ========================================================================== */
import {
  Group, Mesh, MeshLambertMaterial, MeshBasicMaterial, PlaneGeometry, Shape, ExtrudeGeometry,
  BoxGeometry, Vector3, Quaternion, Color, CanvasTexture, SRGBColorSpace,
} from 'three';
import { Character, STATE } from './character.js';
import { CitizenAI, AI_STATE } from './ai.js';
import { makeAppearance } from './appearance.js';
import { Armour, ARMOUR } from './armour.js';
import { GLOCK, createGlockModel, spawnGlock, MuzzleFlash } from './guns.js';
import { gripWorld } from './grip.js';
import { boneBoxCenter } from './skeleton.js';
import { makeCanvas } from './textures.js';
import { makeRng, clamp, clamp01, angleDelta, dampAngle, lerp } from '../core/util.js';

const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3(), _v4 = new Vector3();
const _q = new Quaternion(), _q2 = new Quaternion();
const _gunPos = new Vector3(), _gunQuat = new Quaternion();

/** How an officer fights. All in seconds and metres. */
export const OFFICER = {
  /** Their Glock: the player's gun, but a person is not a crosshair. */
  damageMult: 0.45,
  capacity: 15,
  /** From seeing it happen to the first shot, holster draw included. */
  react: [0.55, 0.95],
  /** Between aimed shots. */
  cadence: [0.38, 0.72],
  /** Base cone of error, and how it grows with range and movement. */
  spread: { base: 0.016, perMetre: 0.0022, targetSpeed: 0.010, moving: 0.012, hurt: 0.03 },
  /** Where they like to stand. */
  near: 3.6, far: 15, chase: 22,
  /** What they can see. */
  sight: 32, fov: 1.15,       // radians either side of where they are looking
  /** How long they keep looking for you once you are out of sight. */
  forget: 25,
  /** Their own range for a provoked colleague to join in. */
  backup: 26,
};

/* -------------------------------------------------------------------------- */
/*                                  the look                                  */
/* -------------------------------------------------------------------------- */

const UNIFORM = { shirt: 0x15171b, pants: 0x101216, shoes: 0x0b0b0c };

function officerAppearance(rng) {
  const look = makeAppearance(rng);
  look.shirt = new Color(UNIFORM.shirt);
  look.pants = new Color(UNIFORM.pants);
  look.shoes = new Color(UNIFORM.shoes);
  look.longSleeves = true;
  look.longPants = true;
  // kept short under regulations, and nothing that sticks up
  if (look.hairStyle === 'mop' || look.hairStyle === 'tall') look.hairStyle = 'short';
  look.bravery = 1;
  look.aggression = 0.6;
  return look;
}

let BADGE_MATS = null;
function badgeMaterials() {
  if (BADGE_MATS) return BADGE_MATS;
  const c = makeCanvas(256, 64);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = '#e9e9e4';
  ctx.font = 'bold 50px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('POLICE', 128, 34);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  BADGE_MATS = {
    gold: new MeshLambertMaterial({ color: 0xd9b24a, emissive: 0x3a2a08 }),
    goldDark: new MeshLambertMaterial({ color: 0x9c7a26 }),
    blue: new MeshLambertMaterial({ color: 0x1f3d7a }),
    text: new MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.4 }),
    holster: new MeshLambertMaterial({ color: 0x0c0d0f }),
    belt: new MeshLambertMaterial({ color: 0x141518 }),
  };
  return BADGE_MATS;
}

/**
 * A badge: a gold shield, a smaller blue field in it and a gold star on that.
 * Built facing +Z, about six centimetres tall.
 */
export function createBadgeModel() {
  const M = badgeMaterials();
  const g = new Group();
  const shield = new Shape();
  shield.moveTo(0, 0.032);
  shield.lineTo(0.020, 0.028);
  shield.lineTo(0.025, 0.012);
  shield.quadraticCurveTo(0.024, -0.014, 0, -0.032);
  shield.quadraticCurveTo(-0.024, -0.014, -0.025, 0.012);
  shield.lineTo(-0.020, 0.028);
  shield.closePath();
  const plate = new Mesh(new ExtrudeGeometry(shield, { depth: 0.004, bevelEnabled: true,
    bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 1 }), M.gold);
  g.add(plate);
  const field = new Mesh(new BoxGeometry(0.026, 0.024, 0.002), M.blue);
  field.position.set(0, 0.002, 0.0062);
  g.add(field);
  const star = new Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 0.0045 : 0.0105;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  star.closePath();
  const s = new Mesh(new ExtrudeGeometry(star, { depth: 0.0015, bevelEnabled: false }), M.goldDark);
  s.position.set(0, 0.002, 0.0072);
  g.add(s);
  g.name = 'badge';
  return g;
}

/** The light vest, made a police vest: badge on the chest, POLICE across the back. */
function createPoliceVest() {
  const spec = ARMOUR.vest;
  const model = spec.build();
  const M = badgeMaterials();
  const badge = createBadgeModel();
  // on the wearer's left breast, facing out of the front (-Z)
  badge.position.set(-0.095, 0.080, -0.150);
  badge.rotation.y = Math.PI;
  model.add(badge);
  const back = new Mesh(new PlaneGeometry(0.30, 0.075), M.text);
  back.position.set(0, 0.055, 0.1365);
  model.add(back);
  const front = new Mesh(new PlaneGeometry(0.14, 0.035), M.text);
  front.position.set(0.085, 0.112, -0.1415);
  front.rotation.y = Math.PI;
  model.add(front);
  model.userData.badge = badge;
  return model;
}

/** A holster on the right hip, on a duty belt round the waist. */
function createBelt() {
  const M = badgeMaterials();
  const g = new Group();
  const add = (mat, w, h, d, x, y, z) => {
    const m = new Mesh(new BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  // the belt itself, just clear of the trousers
  add(M.belt, 0.330, 0.042, 0.016, 0, 0.088, -0.118);
  add(M.belt, 0.330, 0.042, 0.016, 0, 0.088, 0.118);
  for (const sx of [-1, 1]) add(M.belt, 0.016, 0.042, 0.236, sx * 0.165, 0.088, 0);
  add(M.goldDark, 0.040, 0.030, 0.006, 0, 0.088, -0.128);
  // the holster, hanging off the right side
  add(M.holster, 0.040, 0.175, 0.066, 0.192, -0.008, 0.012);
  // a pouch for the spare magazine on the left
  add(M.holster, 0.030, 0.070, 0.050, -0.180, 0.060, -0.030);
  g.matrixAutoUpdate = false;
  return g;
}

/* -------------------------------------------------------------------------- */
/*                                  spawning                                  */
/* -------------------------------------------------------------------------- */

export function spawnOfficer(game, position, opts = {}) {
  const seed = opts.seed != null ? opts.seed : (Math.random() * 1e9) | 0;
  const rng = makeRng(seed);
  const look = officerAppearance(rng);

  const c = new Character(game.world, look, {
    x: position.x,
    z: position.z,
    yaw: opts.yaw != null ? opts.yaw : rng() * Math.PI * 2,
    seed,
    name: 'Officer',
    castShadow: game.quality.shadows,
  });
  game.scene.add(c.body.group);
  c.isOfficer = true;
  c.ai = new OfficerAI(c, game);
  c.onDamage = (info) => game.handleDamage(info);
  c.onStrike = (attacker, side, vel) => game.resolveStrike(attacker, side, vel);
  c.onInjury = (info) => game.handleInjury(info);
  c.onGib = (info) => game.gore?.throwPart(info.mesh, info.vel);
  c.onArmourLost = (info) => game.dropWorn(info.character, info.armour, info.dir);
  game.registerCharacter(c);
  c.teleport(position.x, position.z, c.yaw);
  c.wearArmour(new Armour(createPoliceVest(), null, 'vest'), game.scene);
  c.ai.lateUpdate(0);
  return c;
}

/* -------------------------------------------------------------------------- */
/*                                  the brain                                 */
/* -------------------------------------------------------------------------- */

export class OfficerAI extends CitizenAI {
  constructor(character, game) {
    super(character, game);
    this.isOfficer = true;
    /** Who they are after, if anyone. */
    this.target = null;
    this.hostileTime = 0;       // seconds left before standing down
    this.sinceSeen = 0;
    this.lastSeen = new Vector3();
    this.react = 0;             // until the first shot after being provoked
    this.shotTimer = 0;
    this.ammo = OFFICER.capacity;
    this.drawn = false;
    this.strafe = 0;
    this.strafeTimer = 0;
    this.shots = 0;
    this.hits = 0;

    this.gun = createGlockModel();
    this.gun.matrixAutoUpdate = false;
    game.scene.add(this.gun);
    this.belt = createBelt();
    game.scene.add(this.belt);
    this.flash = new MuzzleFlash(game.scene);
  }

  /* -------------------------------- provoking ------------------------------ */

  /** Can this officer see that person right now? */
  canSee(other) {
    const c = this.c;
    if (!other || other === c || c.dead || c.blind > 0.85) return false;
    const eye = this._eye(_v1);
    const at = boneBoxCenter(other.rig.byName.upperTorso, _v2);
    const d = eye.distanceTo(at);
    if (d > OFFICER.sight * (1 - c.blind)) return false;
    // very close, you notice whichever way you face
    if (d > 3) {
      const want = Math.atan2(-(at.x - c.pos.x), -(at.z - c.pos.z));
      if (Math.abs(angleDelta(c.gazeYaw, want)) > OFFICER.fov) return false;
    }
    return this._clear(eye, at, d);
  }

  _eye(out) {
    return out.copy(this.c.rig.byName.head.worldPos).addScaledVector(_v4.set(0, 1, 0), 0.1);
  }

  /** Nothing solid between two points: walls, the platform, crates. */
  _clear(from, to, d = null) {
    const w = this.game.world;
    _v3.copy(to).sub(from);
    const dist = d ?? _v3.length();
    if (dist < 1e-4) return true;
    _v3.multiplyScalar(1 / dist);
    if (w.raycastStatic(from, _v3, dist - 0.3)) return false;
    if (w.raycastBodies(from, _v3, dist - 0.3)) return false;
    return true;
  }

  /**
   * Someone has just hurt somebody. If it was this officer, or someone this
   * officer can see, the one who did it is now their problem.
   */
  witness(victim, attacker) {
    if (!attacker || attacker === this.c || attacker.dead || this.c.dead) return;
    if (attacker.isOfficer) return;
    if (victim !== this.c && !this.canSee(victim)) return;
    this.provoke(attacker);
  }

  provoke(attacker, relay = true) {
    const fresh = this.target !== attacker || this.hostileTime <= 0;
    this.target = attacker;
    this.hostileTime = OFFICER.forget;
    this.lastSeen.copy(attacker.pos);
    this.sinceSeen = 0;
    this.fear = 0;
    if (fresh) {
      this.react = OFFICER.react[0] + this.rng() * (OFFICER.react[1] - OFFICER.react[0]);
      this.c.body.setExpression('frown');
      this._setState(AI_STATE.FIGHT);
    }
    // a colleague who can see this officer comes in too
    if (relay) {
      for (const o of this.game.characters) {
        if (o === this.c || !o.ai?.isOfficer || o.dead) continue;
        if (o.pos.distanceTo(this.c.pos) > OFFICER.backup) continue;
        if (o.ai.canSee(this.c) || o.ai.canSee(attacker)) o.ai.provoke(attacker, false);
      }
    }
  }

  /** Everything stops: the player came back, or the map was cleared. */
  standDown() {
    this.target = null;
    this.hostileTime = 0;
    this._setState(AI_STATE.IDLE);
    this.c.body.setExpression('neutral');
  }

  get hostile() { return !!this.target && this.hostileTime > 0; }

  /* An officer is not frightened off by people with weapons, and does not
     panic at the sight of someone hurt. They only notice it. */
  onThreatened() {}
  onWitness() {}

  onHurt(info) {
    const attacker = info.attacker || this.c.lastAttacker;
    if (attacker && attacker !== this.c && !attacker.isOfficer) this.provoke(attacker);
  }

  /* --------------------------------- update -------------------------------- */

  update(dt) {
    const c = this.c;
    this.stateTime += dt;
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    this.panic = Math.max(0, this.panic - dt);
    this.react = Math.max(0, this.react - dt);
    this.shotTimer = Math.max(0, this.shotTimer - dt);
    if (this.hostileTime > 0) this.hostileTime -= dt;

    if (c.dead) { c.moveInput.set(0, 0, 0); return; }
    if (c.state !== STATE.CONTROLLED) {
      this._setState(AI_STATE.DOWN);
      c.moveInput.set(0, 0, 0);
      c.wantsUp = true;
      return;
    }
    if (this.state === AI_STATE.DOWN) this._setState(this.hostile ? AI_STATE.FIGHT : AI_STATE.IDLE);

    // on fire, nobody holds their position
    if (this.panic > 0 && this.threat) {
      this.state = AI_STATE.FLEE;
      this._flee(dt);
      this._maybeJump(dt);
      this._stuckCheck(dt);
      return;
    }

    const t = this.target;
    if (t && (t.dead || t.body?.destroyed || !this.game.characters.includes(t))) {
      // done: put it away a moment later
      this.target = null;
      this.hostileTime = 0;
      this.holsterTimer = 2.5;
    }

    if (this.hostile) {
      this._engage(dt);
    } else {
      if (this.state === AI_STATE.FIGHT) this._setState(AI_STATE.IDLE);
      c.squareUp = false;
      c.combatReady = false;
      if (this.drawn) {
        this.holsterTimer = (this.holsterTimer ?? 3) - dt;
        if (this.holsterTimer <= 0 && !c.reloading) this._holster();
      }
      if (this.state === AI_STATE.WANDER) this._wander(dt);
      else { this._setState(AI_STATE.IDLE); this._idle(dt); }
    }
    this._maybeJump(dt);
    this._stuckCheck(dt);
  }

  _engage(dt) {
    const c = this.c, t = this.target;
    c.squareUp = true;
    c.combatReady = true;
    c.combatTimer = 3;
    if (this.state !== AI_STATE.FIGHT) this._setState(AI_STATE.FIGHT);

    const eye = this._eye(_v1);
    const aimAt = boneBoxCenter(t.rig.byName.upperTorso, _v2).clone();
    const d = eye.distanceTo(aimAt);
    const seen = d < OFFICER.sight && this._clear(eye, aimAt, d);
    if (seen) {
      this.sinceSeen = 0;
      this.lastSeen.copy(t.pos);
      this.hostileTime = OFFICER.forget;
    } else {
      this.sinceSeen += dt;
    }

    // draw as soon as there is trouble; the reaction time covers it
    if (!this.drawn && this.react < 0.35) this._draw();

    // ---- where to stand ----
    const flat = Math.hypot(t.pos.x - c.pos.x, t.pos.z - c.pos.z);
    c.crouchWant = false;
    if (!seen) {
      // go to where they were last seen, and look round from there
      c.wantRun = this.sinceSeen > 1.5;
      const arrived = this._followPath(dt, this.lastSeen, 1.2, true);
      if (arrived) { c.moveInput.set(0, 0, 0); this._faceYaw(dt, c.gazeYaw + dt * 1.6); }
      return;
    }
    if (flat > OFFICER.far) {
      c.wantRun = flat > OFFICER.chase;
      this._followPath(dt, t.pos, OFFICER.far - 2, true);
    } else if (flat < OFFICER.near) {
      // too close for a pistol: back off, still facing them
      c.wantRun = false;
      _v3.set(c.pos.x - t.pos.x, 0, c.pos.z - t.pos.z).normalize();
      if (this.game.nav.isBlockedWorld(c.pos.x + _v3.x * 0.8, c.pos.z + _v3.z * 0.8)) {
        _v3.set(-_v3.z, 0, _v3.x);       // a wall behind: step round instead
      }
      c.moveInput.copy(_v3).multiplyScalar(0.8);
    } else {
      // in range: mostly stand and shoot, now and then side-step
      c.wantRun = false;
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = 1.2 + this.rng() * 2.2;
        this.strafe = this.rng() < 0.45 ? (this.rng() < 0.5 ? -1 : 1) : 0;
      }
      if (this.strafe) {
        _v3.set(t.pos.x - c.pos.x, 0, t.pos.z - c.pos.z).normalize();
        c.moveInput.set(-_v3.z * this.strafe * 0.45, 0, _v3.x * this.strafe * 0.45);
        if (this.game.nav.isBlockedWorld(c.pos.x + c.moveInput.x, c.pos.z + c.moveInput.z)) this.strafe *= -1;
      } else {
        c.moveInput.set(0, 0, 0);
      }
    }

    // ---- aim: the body comes round, the arms come up with the pitch ----
    const want = Math.atan2(-(aimAt.x - c.pos.x), -(aimAt.z - c.pos.z));
    c.gazeYaw = dampAngle(c.gazeYaw, want, 9, dt);
    const shoulder = c.rig.byName.upperArmR.worldPos;
    const pitch = Math.atan2(aimAt.y - shoulder.y, Math.max(0.3, flat));
    c.pitch = lerp(c.pitch, clamp(pitch, -1.0, 1.0), clamp01(dt * 8));

    // ---- shoot ----
    if (!this.drawn || this.react > 0 || this.shotTimer > 0 || c.reloading) return;
    if (c.armBroken('R') || c.gone?.has('handR')) return;
    if (this.ammo <= 0) { this._reload(); return; }
    if (Math.abs(angleDelta(c.gazeYaw, want)) > 0.16) return;
    this._fire(aimAt, d, flat);
  }

  _faceYaw(dt, yaw) {
    this.c.gazeYaw = dampAngle(this.c.gazeYaw, yaw, 3, dt);
  }

  _fire(aimAt, d) {
    const c = this.c, t = this.target, g = this.game;
    const spec = GUNS_GLOCK();
    gripWorld(c.rig.byName.handR, spec.grip, _gunQuat, _gunPos);
    const muzzle = _v3.copy(GLOCK.muzzle).applyQuaternion(_gunQuat).add(_gunPos).clone();

    // a person is not a crosshair: the round goes somewhere in a cone
    const S = OFFICER.spread;
    const tv = t.vel ? Math.hypot(t.vel.x, t.vel.z) : 0;
    const moving = c.moveInput.lengthSq() > 0.05 ? S.moving : 0;
    const err = S.base + S.perMetre * d + S.targetSpeed * tv + moving
      + (c.painTimer > 0 ? S.hurt : 0) + c.blind * 0.2;
    const dir = _v4.copy(aimAt).sub(muzzle).normalize();
    // two random perpendicular nudges, gaussian-ish
    _v1.set(dir.z, 0, -dir.x);
    if (_v1.lengthSq() < 1e-6) _v1.set(1, 0, 0);
    _v1.normalize();
    _v2.copy(dir).cross(_v1).normalize();
    const r1 = (this.rng() + this.rng() - 1), r2 = (this.rng() + this.rng() - 1);
    dir.addScaledVector(_v1, r1 * err * 1.4).addScaledVector(_v2, r2 * err * 1.4).normalize();

    const hit = g._traceShot(muzzle, dir, spec, c, OFFICER.damageMult);
    this.shots++;
    if (hit?.type === 'character' && hit.character === t) this.hits++;
    this.ammo--;
    this.shotTimer = OFFICER.cadence[0] + this.rng() * (OFFICER.cadence[1] - OFFICER.cadence[0]);

    // the flash, the brass, the kick, and everyone nearby hearing it
    _q.setFromUnitVectors(_v1.set(0, 0, -1), dir);
    this.flash.fire(muzzle, _q, spec.flash);
    g.cases?.eject(_v1.copy(GLOCK.ejectAt).applyQuaternion(_gunQuat).add(_gunPos),
      _v2.set(0.92, 0.36, 0.14).applyQuaternion(_gunQuat).normalize());
    g.fx?.light(muzzle, { color: 0xffc070, intensity: 10, life: 0.06, distance: 6 });
    c.kick(spec.recoil.arm);
    this.gunKick = 1;
    for (const o of g.characters) {
      if (o === c || o === t || !o.ai || o.ai.isOfficer) continue;
      if (o.pos.distanceTo(c.pos) < 16) o.ai.onThreatened(t, 0.3);
    }
  }

  _reload() {
    const c = this.c;
    if (c.reloading) return;
    if (c.playReload('reloadPistolEmpty')) {
      this._reloading = true;
      this.shotTimer = 0.3;
    }
  }

  _draw() {
    this.drawn = true;
    this.holsterTimer = 3;
    this.c.setEquipped('glock');
  }

  _holster() {
    this.drawn = false;
    this.c.setEquipped('fists');
  }

  /* ---------------------------- after the physics ---------------------------- */

  /** Keeps the gun in the hand (or the holster), the belt on, the flash fading. */
  lateUpdate(dt) {
    const c = this.c;
    this.flash.update(dt);
    this.gunKick = Math.max(0, (this.gunKick || 0) - dt * 9);
    if (this._reloading && !c.reloading) {
      this._reloading = false;
      this.ammo = OFFICER.capacity;
    }
    // the belt rides the hips
    const pelvis = c.rig.byName.pelvis;
    this.belt.position.copy(pelvis.worldPos);
    this.belt.quaternion.copy(pelvis.worldQuat);
    this.belt.updateMatrix();

    if (!this.gun) return;
    // a dead officer lets go of a drawn gun
    if (c.dead && this.drawn) { this._dropGun(); return; }
    if (this.drawn && !c.gone?.has('handR')) {
      const spec = GUNS_GLOCK();
      gripWorld(c.rig.byName.handR, spec.grip, _gunQuat, _gunPos);
      this.gun.position.copy(_gunPos);
      this.gun.quaternion.copy(_gunQuat);
      this._syncParts(spec);
    } else if (this.drawn) {
      this._dropGun();
      return;
    } else {
      // holstered: muzzle down, grip back, in the holster on the right hip
      _gunPos.set(0.192, 0.075, 0.020).applyQuaternion(pelvis.worldQuat).add(pelvis.worldPos);
      _q2.setFromAxisAngle(_v1.set(1, 0, 0), -Math.PI / 2);
      this.gun.quaternion.copy(pelvis.worldQuat).multiply(_q2);
      this.gun.position.copy(_gunPos);
      const u = this.gun.userData;
      if (u.magazine) u.magazine.visible = true;
      if (u.slide) u.slide.position.z = 0;
    }
    this.gun.updateMatrix();
  }

  _syncParts(spec) {
    const u = this.gun.userData;
    const a = this.c.animator;
    const win = a.actionName ? spec.parts?.[a.actionName] : null;
    const t = a.actionName ? a.actionTime : 0;
    const inside = (w) => w && t >= w[0] && t <= w[1];
    if (u.magazine) u.magazine.visible = !inside(win?.magOut);
    if (u.slide) u.slide.position.z = inside(win?.slide) ? 0.030 : Math.max(0, this.gunKick * 0.028);
  }

  /** The gun goes on the floor, where anyone can pick it up. */
  _dropGun() {
    const c = this.c, g = this.game;
    const spec = GUNS_GLOCK();
    const hand = c.rig.byName.handR;
    gripWorld(hand, spec.grip, _gunQuat, _gunPos);
    _v1.copy(spec.center).applyQuaternion(_gunQuat).add(_gunPos);
    const body = spawnGlock(g, _v1, { quat: _gunQuat, reuse: { model: this.gun, ammo: this.ammo } });
    body.vel.set((this.rng() - 0.5) * 1.5, 1.2, (this.rng() - 0.5) * 1.5);
    body.wake();
    this.gun = null;
    this.drawn = false;
    c.setEquipped('fists');
  }

  dispose() {
    this.gun?.removeFromParent();
    this.gun = null;
    this.belt.removeFromParent();
    this.flash.dispose();
  }
}

/** The Glock's entry in the game's gun table, without importing game.js here. */
let _glockSpec = null;
export function setOfficerGunSpec(spec) { _glockSpec = spec; }
function GUNS_GLOCK() { return _glockSpec; }
