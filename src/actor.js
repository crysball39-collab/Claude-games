// Shared behaviour for anything that walks, shoots, builds and dies —
// the local player and all 99 bots run through this class.
import * as THREE from 'three';
import { CharacterRig, makeNamePlate } from './character.js';
import { makeGunMesh, makePickaxe, makeMuzzleFlash, makeBandage, makeShieldPotion, makeBigShieldPotion, RARITY } from './models.js';
import { Inventory } from './loot.js';
import { clamp, lerp, damp, TAU } from './util.js';
import { WORLD } from './world.js';

const WORLD_HALF = WORLD.half;

export const DIVE = {
  terminal: 58,        // free-fall speed
  steer: 30,           // how fast you can move sideways while diving
  glideAt: 58,         // metres above the ground the glider opens
  glideFall: 13,
  glideSteer: 19,
};

export const MOVE = {
  walk: 4.4,
  sprint: 7.3,
  crouch: 2.3,
  air: 3.4,
  accel: 42,
  airAccel: 9,
  friction: 12,
  jump: 8.1,
  gravity: 24,
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class Actor {
  constructor(game, opts = {}) {
    this.game = game;
    this.isPlayer = !!opts.isPlayer;
    this.name = opts.name || 'Player';
    this.team = opts.team ?? -1;

    this.pos = new THREE.Vector3(opts.x || 0, opts.y || 0, opts.z || 0);
    this.vel = new THREE.Vector3();
    this.radius = 0.42;
    this.height = 1.82;
    this.stepUp = 0.62;
    this.grounded = false;
    this.fallSpeed = 0;
    this.mode = 'ground';        // 'ground' | 'bus' | 'dive'
    this.gliding = false;
    this.diveTarget = null;      // bots steer toward a landing spot

    this.yaw = opts.yaw || 0;
    this.pitch = 0;
    this.moveInput = new THREE.Vector2();
    this.wantJump = false;
    this.sprinting = false;
    this.crouching = false;
    this.speed2D = 0;

    this.health = 100;
    this.maxHealth = 100;
    this.shield = 0;
    this.maxShield = 100;
    this.alive = true;
    this.kills = 0;

    this.inv = new Inventory(5);
    this.inv.wood = opts.wood ?? 0;

    this.fireCooldown = 0;
    this.reloadT = 0;
    this.reloadKind = null;
    this.useT = 0;
    this.useSlot = -1;
    this.swingT = 0;
    this.swingHit = false;
    this.aiming = false;
    this.triggerHeld = false;
    this.equipT = 0;
    this.lastDamageBy = null;
    this.lastDamageAt = -99;
    this.deadT = 0;

    this.rig = new CharacterRig(opts.cosmetics, { tint: opts.tint });
    this.root = this.rig.root;
    this.root.position.copy(this.pos);
    game.scene.add(this.root);

    this.muzzle = makeMuzzleFlash();
    this.muzzleT = 0;
    game.scene.add(this.muzzle);

    this.pickaxeMesh = makePickaxe(this.rig.cos.pickaxe);
    this.heldMesh = null;
    this.heldFor = undefined;

    if (!this.isPlayer && opts.plate !== false) {
      this.plate = makeNamePlate(this.name);
      this.plate.position.y = 2.35;
      this.root.add(this.plate);
    }
    this.refreshHeld();
  }

  // --- inventory / holding ------------------------------------------------
  get weapon() { const c = this.inv.current; return c && c.kind === 'weapon' ? c : null; }

  select(slot) {
    const s = clamp(slot, 0, this.inv.size);
    if (s === this.inv.selected) return;
    this.inv.selected = s;
    this.cancelActions();
    this.equipT = 0.28;
    this.refreshHeld();
  }

  cancelActions() {
    this.reloadT = 0; this.reloadKind = null;
    this.useT = 0; this.useSlot = -1;
    this.swingT = 0;
    this.rig.clearAction();
  }

  refreshHeld() {
    const cur = this.inv.holdingPickaxe ? 'pickaxe' : this.inv.current;
    const key = cur === 'pickaxe' ? 'pickaxe' : cur ? cur.uid : 'none';
    if (key === this.heldFor) return;
    this.heldFor = key;
    if (cur === 'pickaxe') {
      this.rig.setStowed(null);
      this.pickaxeMesh = makePickaxe(this.rig.cos.pickaxe);
      this.pickaxeMesh.scale.setScalar(0.72);
      this.rig.setHeld(this.pickaxeMesh);
      this.heldMesh = this.pickaxeMesh;
    } else if (cur && cur.kind === 'weapon') {
      const m = makeGunMesh(cur.id);
      const rc = RARITY[cur.rarity];
      // rarity tint on the receiver so you can read a gun at a glance
      m.traverse(o => {
        if (o.isMesh && o.material && o.material.color) {
          o.material = o.material.clone();
          o.material.color.lerp(new THREE.Color(rc.color), 0.22);
        }
      });
      this.rig.setHeld(m);
      this.rig.setStowed(makePickaxe(this.rig.cos.pickaxe));
      this.heldMesh = m;
    } else if (cur && cur.kind === 'item') {
      const mesh = cur.id === 'bandage' ? makeBandage()
        : cur.id === 'bigshield' ? makeBigShieldPotion() : makeShieldPotion();
      this.rig.setHeld(mesh);
      this.rig.setStowed(makePickaxe(this.rig.cos.pickaxe));
      this.heldMesh = mesh;
    } else {
      this.rig.setHeld(null);
      this.rig.setStowed(makePickaxe(this.rig.cos.pickaxe));
      this.heldMesh = null;
    }
  }

  // --- actions -----------------------------------------------------------
  get busy() { return this.reloadT > 0 || this.useT > 0; }

  canFire() {
    const w = this.weapon;
    return !!w && this.alive && this.fireCooldown <= 0 && this.reloadT <= 0 &&
      this.useT <= 0 && this.equipT <= 0 && w.ammo > 0;
  }

  tryFire() {
    const w = this.weapon;
    if (!w) return false;
    if (w.ammo <= 0 && this.reloadT <= 0) { this.tryReload(); return false; }
    if (!this.canFire()) return false;
    this.fire();
    return true;
  }

  fire() {
    const w = this.weapon;
    w.ammo--;
    this.fireCooldown = 1 / w.def.rps;
    // Spread: wider while moving, in the air, or hip-firing; tighter crouched
    // and aiming.  Bots carry an extra multiplier so they are not laser sights.
    const spreadDeg = (this.aiming ? w.adsSpread : w.spread)
      * (this.crouching ? 0.7 : 1)
      * (this.speed2D > 4 ? 1.7 : this.speed2D > 0.5 ? 1.25 : 1)
      * (this.grounded ? 1 : 2.0)
      * (this.aiSpreadMul || 1);
    const origin = this.muzzleWorld(_v) || this.eyePos(_v);
    // the local player aims through the camera's crosshair, bots use their own facing
    const base = this.aimTarget
      ? _v2.copy(this.aimTarget).sub(origin).normalize()
      : this.aimDir(_v2);
    const spread = spreadDeg * Math.PI / 180;
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(base, up).normalize();
    const realUp = new THREE.Vector3().crossVectors(right, base).normalize();
    const pellets = w.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random()) * spread;
      const dir = new THREE.Vector3().copy(base);
      dir.addScaledVector(right, Math.tan(r) * Math.cos(a));
      dir.addScaledVector(realUp, Math.tan(r) * Math.sin(a));
      dir.normalize();
      this.game.fireBullet(this, origin, dir, w);
    }
    this.game.makeNoise(this.pos.x, this.pos.z, 105, this, 'shot');

    this.rig.kick(0.30 + w.def.recoil * 0.22);
    this.recoilKick = (this.recoilKick || 0) + w.def.camKick;
    this.muzzleT = 0.05;
    this.lastFiredAt = this.game.time;
    this.onFired && this.onFired();
  }

  tryReload() {
    const w = this.weapon;
    if (!w || this.reloadT > 0 || this.useT > 0 || !this.alive) return false;
    if (w.ammo >= w.mag || w.reserve <= 0) return false;
    this.reloadKind = w.ammo <= 0 ? 'reloadEmpty' : 'reload';
    this.reloadT = this.reloadKind === 'reloadEmpty' ? w.reloadEmpty : w.reload;
    this.reloadTotal = this.reloadT;
    this.rig.playAction(this.reloadKind, this.reloadT);
    return true;
  }

  finishReload() {
    const w = this.weapon;
    if (w) {
      const need = w.mag - w.ammo;
      const take = Math.min(need, w.reserve);
      w.ammo += take; w.reserve -= take;
    }
    this.reloadT = 0; this.reloadKind = null;
  }

  tryUse() {
    const cur = this.inv.current;
    if (!cur || cur.kind !== 'item' || this.busy || !this.alive) return false;
    if (cur.id === 'bandage' && this.health >= cur.def.healCap) return false;
    if (cur.def.shield && this.shield >= cur.def.shieldCap) return false;
    this.useT = cur.def.useTime;
    this.useTotal = this.useT;
    this.useSlot = this.inv.selected;
    this.rig.playAction('use', this.useT);
    return true;
  }

  finishUse() {
    const cur = this.inv.slots[this.useSlot];
    this.useT = 0;
    if (!cur || cur.kind !== 'item') { this.useSlot = -1; return; }
    if (cur.id === 'bandage') this.health = Math.min(cur.def.healCap, this.health + cur.def.heal);
    else this.shield = Math.min(cur.def.shieldCap, this.shield + cur.def.shield);
    this.game.makeNoise(this.pos.x, this.pos.z, 16, this, 'heal');
    this.inv.consumeOne(this.useSlot);
    this.useSlot = -1;
    this.refreshHeld();
    this.onHealed && this.onHealed();
  }

  trySwing() {
    if (!this.inv.holdingPickaxe || this.swingT > 0 || !this.alive) return false;
    this.swingT = 0.55;
    this.swingHit = false;
    this.rig.playAction('swing', 0.55);
    return true;
  }

  // --- damage ------------------------------------------------------------
  takeDamage(amount, from, point, isHead = false, cause = 'shot') {
    if (!this.alive || !this.game.damageEnabled) return 0;
    this.lastCause = cause;
    let dmg = amount;
    let shieldPart = 0;
    if (this.shield > 0) {
      shieldPart = Math.min(this.shield, dmg);
      this.shield -= shieldPart;
      dmg -= shieldPart;
    }
    this.health -= dmg;
    this.lastDamageBy = from || null;
    this.lastDamageAt = this.game.time;
    if (this.health <= 0) { this.health = 0; this.die(from); }
    return amount;
  }

  die(killer) {
    if (!this.alive) return;
    this.alive = false;
    this.deadT = 0;
    this.rig.deadT = 0;
    this.cancelActions();
    this.game.onDeath(this, killer);
  }

  // --- helpers -----------------------------------------------------------
  /** World position of the barrel tip, when a gun is in hand. */
  muzzleWorld(out) {
    const gun = this.heldMesh;
    if (!gun || !gun.userData || !gun.userData.muzzle) return null;
    gun.userData.muzzle.getWorldPosition(out);
    return out;
  }

  eyePos(out) {
    return out.set(this.pos.x, this.pos.y + (this.crouching ? 1.20 : 1.60), this.pos.z);
  }
  chestPos(out) {
    return out.set(this.pos.x, this.pos.y + (this.crouching ? 0.95 : 1.30), this.pos.z);
  }
  aimDir(out) {
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).normalize();
  }
  /** Capsule test used by bullets. */
  hitTest(ox, oy, oz, dx, dy, dz, maxT) {
    const rad = this.radius + 0.14;
    const h = this.crouching ? 1.35 : this.height;
    const px = ox - this.pos.x, pz = oz - this.pos.z;
    const a = dx * dx + dz * dz;
    if (a < 1e-9) return -1;
    const b = 2 * (px * dx + pz * dz);
    const c = px * px + pz * pz - rad * rad;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    const sq = Math.sqrt(disc);
    let t = (-b - sq) / (2 * a);
    if (t < 0) t = (-b + sq) / (2 * a);
    if (t < 0 || t > maxT) return -1;
    const y = oy + dy * t;
    const rel = y - this.pos.y;
    if (rel < 0.05 || rel > h) return -1;
    return t;
  }
  isHead(y) {
    const h = this.crouching ? 1.35 : this.height;
    return (y - this.pos.y) > h - 0.34;
  }

  // --- per-frame ---------------------------------------------------------
  /** Free-fall out of the bus, then glide the last stretch to the ground. */
  updateDive(dt) {
    const phys = this.game.physics;
    const ground = phys.floorAt(this.pos.x, this.pos.z, this.pos.y, this.radius);
    const above = this.pos.y - ground;
    this.gliding = above < DIVE.glideAt;

    const steer = this.gliding ? DIVE.glideSteer : DIVE.steer;
    let wishX = 0, wishZ = 0;
    if (this.diveTarget) {
      const dx = this.diveTarget.x - this.pos.x, dz = this.diveTarget.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1) { wishX = dx / d; wishZ = dz / d; }
      this.yaw = Math.atan2(dx, dz);
    } else {
      const inp = this.moveInput;
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
      wishX = fx * inp.y + rx * inp.x;
      wishZ = fz * inp.y + rz * inp.x;
      const m = Math.hypot(wishX, wishZ);
      if (m > 1) { wishX /= m; wishZ /= m; }
    }
    const accel = 26;
    this.vel.x += clamp(wishX * steer - this.vel.x, -accel * dt, accel * dt);
    this.vel.z += clamp(wishZ * steer - this.vel.z, -accel * dt, accel * dt);
    const targetFall = this.gliding ? -DIVE.glideFall : -DIVE.terminal;
    this.vel.y = damp(this.vel.y, targetFall, this.gliding ? 5 : 1.6, dt);

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    const h = WORLD_HALF;
    this.pos.x = clamp(this.pos.x, -h, h);
    this.pos.z = clamp(this.pos.z, -h, h);

    const land = phys.floorAt(this.pos.x, this.pos.z, this.pos.y, this.radius);
    if (this.pos.y <= land) {
      this.pos.y = land;
      this.vel.set(0, 0, 0);
      this.mode = 'ground';
      this.gliding = false;
      this.grounded = true;
      this.fallSpeed = 0;
      this.diveTarget = null;
      this.onLanded && this.onLanded();
    }
    this.speed2D = Math.hypot(this.vel.x, this.vel.z);
  }

  updatePhysics(dt) {
    if (this.mode === 'bus') { this.speed2D = 0; return; }
    if (this.mode === 'dive') { this.updateDive(dt); return; }
    const phys = this.game.physics;
    const wantSprint = this.sprinting && !this.crouching && this.moveInput.lengthSq() > 0.05 && !this.aiming;
    let target = wantSprint ? MOVE.sprint : this.crouching ? MOVE.crouch : MOVE.walk;
    const w = this.weapon;
    if (w && this.aiming) target *= 0.55;
    if (w) target *= w.def.moveMul;
    if (this.useT > 0) target *= 0.5;

    const inp = this.moveInput;
    const len = inp.length();
    let wishX = 0, wishZ = 0;
    if (len > 0.001) {
      // forward is +Z at yaw 0, so screen-right is cross(forward, up) = (-cos, sin)
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
      wishX = fx * inp.y + rx * inp.x;
      wishZ = fz * inp.y + rz * inp.x;
      const m = Math.hypot(wishX, wishZ);
      if (m > 1) { wishX /= m; wishZ /= m; }
    }

    const accel = this.grounded ? MOVE.accel : MOVE.airAccel;
    const desiredX = wishX * target, desiredZ = wishZ * target;
    this.vel.x += clamp(desiredX - this.vel.x, -accel * dt, accel * dt);
    this.vel.z += clamp(desiredZ - this.vel.z, -accel * dt, accel * dt);
    if (len < 0.01 && this.grounded) {
      const f = Math.max(0, 1 - MOVE.friction * dt);
      this.vel.x *= f; this.vel.z *= f;
    }

    if (this.wantJump && this.grounded && this.useT <= 0) {
      this.vel.y = MOVE.jump;
      this.grounded = false;
      this.onJump && this.onJump();
    }
    this.wantJump = false;
    this.vel.y -= MOVE.gravity * dt;
    if (this.vel.y < -55) this.vel.y = -55;

    phys.moveActor(this, dt);
    if (this.grounded && this.fallSpeed > 21) {
      const dmg = Math.round((this.fallSpeed - 21) * 3.4);
      this.fallSpeed = 0;
      if (dmg > 0) this.takeDamage(dmg, null, this.pos, false, 'fall');
    }
    if (this.pos.y < -60) this.takeDamage(1000, null, this.pos);
    this.speed2D = Math.hypot(this.vel.x, this.vel.z);
  }

  updateTimers(dt) {
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.equipT > 0) this.equipT -= dt;
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.finishReload(); }
    if (this.useT > 0) { this.useT -= dt; if (this.useT <= 0) this.finishUse(); }
    if (this.swingT > 0) {
      this.swingT -= dt;
      if (!this.swingHit && this.swingT < 0.30) { this.swingHit = true; this.game.pickaxeStrike(this); }
    }
    if (this.muzzleT > 0) this.muzzleT -= dt;
    if (this.recoilKick) this.recoilKick = damp(this.recoilKick, 0, 9, dt);
  }

  updateVisual(dt) {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.alive ? this.yaw : this.root.rotation.y;
    const w = this.weapon;
    this.rig.update(dt, {
      speed: this.speed2D,
      sprinting: this.sprinting && this.speed2D > 4.8,
      crouching: this.crouching,
      grounded: this.grounded,
      aiming: this.aiming,
      hasGun: !!w,
      hasTool: this.inv.holdingPickaxe,
      pitch: this.pitch,
      dead: !this.alive,
      diving: this.mode === 'dive' && !this.gliding,
      gliding: this.mode === 'dive' && this.gliding,
    });

    // muzzle flash follows the gun's barrel tip
    const gun = this.heldMesh;
    if (gun && gun.userData && gun.userData.muzzle && this.muzzleT > 0) {
      gun.userData.muzzle.getWorldPosition(this.muzzle.position);
      gun.userData.muzzle.getWorldQuaternion(this.muzzle.quaternion);
      this.muzzle.visible = true;
      const s = 0.7 + Math.random() * 0.7;
      this.muzzle.scale.setScalar(s);
      for (const m of this.muzzle.userData.mats) m.opacity = clamp(this.muzzleT / 0.05, 0, 1) * 0.95;
    } else {
      this.muzzle.visible = false;
    }
    // plates vanish when someone is right in your face
    if (this.plate) {
      const d2 = this.game.camera.position.distanceToSquared(this.root.position);
      this.plate.visible = this.alive && d2 > 16;
    }
  }

  dispose() {
    this.game.scene.remove(this.root);
    this.game.scene.remove(this.muzzle);
    this.rig.dispose();
  }
}
