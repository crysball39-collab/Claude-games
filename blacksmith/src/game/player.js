/* =============================================================================
   You. A smith in a leather apron, seen from behind.

   Moving is relative to the camera. SPRINT runs, DASH lunges and for that
   moment nothing can touch you, and both cost stamina. ATTACK swings
   whichever tool suits what is in front of you: the pickaxe at a rock, your
   weapon at a skeleton. What you are wearing and carrying is drawn from the
   profile, part by part, in the ores it was made from. Your level floats
   over your head.
   ========================================================================== */
import { Group, Vector3, Mesh, CircleGeometry, MeshBasicMaterial } from 'three';
import { Rig, dressHuman, SWINGS } from './character.js';
import { Outfit } from './gear.js';
import { Tag } from './fx.js';
import { PLAYER, afterArmor, partsOf } from './data.js';
import { softDotTexture } from './textures.js';
import { damp, dampAngle, clamp, clamp01 } from '../core/util.js';

const SMITH = {
  skin: '#d9a273', hair: '#3a2416', shirt: '#9a5b36', sleeves: '#8a5030', pants: '#4a3a2e',
  boots: '#2c2118', belt: '#2a1a0e', apron: '#5b3a22', face: 'smith',
};

/** How long each kind of swing takes, when the item does not say. */
const PICK_TIME = 0.6;
const SWING_OF = { dagger: 'stab', sword: 'slash', broadsword: 'heavy' };

let blobTex = null;
/** A soft dark spot under someone's feet, so they sit on the ground even in the dark. */
export function blobShadow(size = 1.1) {
  blobTex = blobTex || softDotTexture(64, 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0)');
  const m = new Mesh(new CircleGeometry(size / 2, 16), new MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  m.renderOrder = 1;
  return m;
}

export class Player {
  constructor(profile) {
    this.profile = profile;
    this.rig = dressHuman(new Rig(), SMITH);
    this.outfit = new Outfit(this.rig);
    this.group = new Group();
    this.group.add(this.rig.root);
    this.shadow = blobShadow(1.0);
    this.group.add(this.shadow);
    this.tag = new Tag('Lv. 1', { fg: '#ffe7a8', scale: 1.0 });
    this.tag.sprite.position.y = 2.22;
    this.group.add(this.tag.sprite);

    this.pos = new Vector3();
    this.vel = new Vector3();
    this.yaw = Math.PI;
    this.radius = PLAYER.radius;
    this.hp = profile.maxHp();
    this.stamina = PLAYER.stamina;
    this.sinceHurt = 99;
    this.sinceStamina = 99;
    this.exhausted = false;
    this.sprinting = false;
    this.swing = null;
    this.queued = false;
    this.dash = null;
    this.dashCooldown = 0;
    this.dead = false;
    this.deadT = 0;
    this.hurtT = 0;
    this.tool = 'pickaxe';      // what is in the hand
    this.speed = 0;
    this.moving = false;
    this.frozen = false;        // at the anvil, talking: the world goes on, you do not move
    this.onExhausted = null;
    this.refreshGear();
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  /** Brings the model in line with what the profile says you have on. */
  refreshGear() {
    const p = this.profile;
    for (const [slot, type] of [['helmet', 'helmet'], ['chest', 'chestplate'], ['legs', 'leggings'], ['boots', 'boots']]) {
      this.outfit.setArmor(slot, type, p.equippedItem(slot));
    }
    const weapon = p.equippedItem('weapon'), pick = p.equippedItem('pickaxe');
    if (!weapon) this.tool = 'pickaxe';
    const inHand = this.tool === 'weapon' ? weapon : pick;
    const onBack = this.tool === 'weapon' ? pick : weapon;
    this.outfit.setHeld(inHand);
    this.outfit.setBack(onBack);
    this.tag.set('Lv. ' + p.level);
    this.hp = Math.min(this.hp, p.maxHp());
  }

  /** Swaps tools: 'weapon' or 'pickaxe'. */
  useTool(tool) {
    if (tool === 'weapon' && !this.profile.equippedItem('weapon')) tool = 'pickaxe';
    if (tool === this.tool) return;
    this.tool = tool;
    this.refreshGear();
  }

  /** Takes up the smith's hammer for the anvil, or puts it down. */
  holdHammer(on) {
    if (on) { this.outfit.setHeld(null, 'hammer'); this.outfit.setBack(null); }
    else this.refreshGear();
  }

  teleport(x, z, yaw = this.yaw, y = 0) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.group.position.copy(this.pos);
    this.rig.root.rotation.y = yaw;
  }

  /** Back on your feet, whole. */
  revive() {
    this.dead = false;
    this.deadT = 0;
    this.hp = this.profile.maxHp();
    this.stamina = PLAYER.stamina;
    this.swing = null;
    this.dash = null;
    this.exhausted = false;
  }

  /** Is a dash carrying you right now? Nothing lands while it does. */
  get invulnerable() { return !!this.dash && this.dash.t < PLAYER.dashTime + 0.06; }

  /**
   * A blow from something at `from`. Armour takes its share first.
   * @returns {number} what it actually cost you, or -1 if it missed you.
   */
  takeHit(raw, from) {
    if (this.dead) return -1;
    if (this.invulnerable) return -1;
    const dmg = Math.max(1, Math.round(afterArmor(raw, this.profile.defense())));
    this.hp = Math.max(0, this.hp - dmg);
    this.sinceHurt = 0;
    this.hurtT = 1;
    this.rig.flash(0.14);
    const dx = this.pos.x - from.x, dz = this.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
    this.vel.x += (dx / d) * 3.2; this.vel.z += (dz / d) * 3.2;
    if (this.hp <= 0) { this.dead = true; this.deadT = 0; this.swing = null; this.dash = null; }
    return dmg;
  }

  /**
   * world: { collider, ground(x, z), pickTarget(player) -> { tool, target },
   *          impact(player, swing), camYaw }
   */
  update(dt, input, world) {
    const P = PLAYER;
    this.sinceHurt += dt;
    this.sinceStamina += dt;
    this.dashCooldown -= dt;
    this.hurtT = Math.max(0, this.hurtT - dt * 3);

    if (this.dead) {
      this.deadT += dt;
      this.vel.multiplyScalar(Math.exp(-dt * 6));
      this._move(dt, world);
      this.rig.update(dt, { dead: clamp01(this.deadT / 0.7) });
      return;
    }

    // stamina and health come back on their own
    if (this.sinceStamina > P.staminaDelay) this.stamina = Math.min(P.stamina, this.stamina + P.staminaRegen * dt);
    if (this.exhausted && this.stamina >= 30) this.exhausted = false;
    if (this.sinceHurt > P.regenDelay) this.hp = Math.min(this.profile.maxHp(), this.hp + P.regenRate * dt);

    // where the stick points, turned to the camera
    const free = !this.frozen;
    const mx = free ? input.move.x : 0, my = free ? input.move.y : 0;
    const mag = Math.min(1, Math.hypot(mx, my));
    const sy = Math.sin(world.camYaw), cy = Math.cos(world.camYaw);
    let dirX = -sy * my + cy * mx, dirZ = -cy * my - sy * mx;
    const dl = Math.hypot(dirX, dirZ);
    if (dl > 1e-4) { dirX /= dl; dirZ /= dl; }
    this.moving = mag > 0.08;

    // dash
    if (free && input.pressed.dash && this.dashCooldown <= 0) {
      if (this.stamina >= P.dashCost) {
        const dx = this.moving ? dirX : Math.sin(this.yaw), dz = this.moving ? dirZ : Math.cos(this.yaw);
        this.dash = { t: 0, x: dx, z: dz };
        this.stamina -= P.dashCost;
        this.sinceStamina = 0;
        this.dashCooldown = P.dashCooldown;
        this.swing = null;
        this.queued = false;
        world.onDash?.(this);
      } else {
        world.onTired?.(this);
      }
    }

    // sprint
    const wantSprint = free && input.sprint && this.moving && mag > 0.4 && !this.swing;
    this.sprinting = wantSprint && !this.exhausted && this.stamina > 0;
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - P.sprintCost * dt);
      this.sinceStamina = 0;
      if (this.stamina <= 0) { this.exhausted = true; this.sprinting = false; this.onExhausted?.(); }
    }

    // attack: a press starts a swing, holding keeps them coming
    if (free && (input.pressed.attack || input.down.attack)) {
      if (!this.swing && !this.dash) this._startSwing(world);
      else if (input.pressed.attack && this.swing && this.swing.t > 0.45) this.queued = true;
    }

    // velocity
    let tx = 0, tz = 0;
    if (this.dash) {
      this.dash.t += dt;
      const k = 1 - Math.pow(clamp01(this.dash.t / P.dashTime), 2) * 0.6;
      tx = this.dash.x * P.dashSpeed * k; tz = this.dash.z * P.dashSpeed * k;
      this.vel.set(tx, 0, tz);
      this.yaw = Math.atan2(this.dash.x, this.dash.z);
      if (this.dash.t > P.dashTime + 0.12) this.dash = null;
    } else {
      const speed = (this.sprinting ? P.sprint : P.walk) * mag * (this.swing ? 0.35 : 1);
      tx = dirX * speed; tz = dirZ * speed;
      const k = 1 - Math.exp(-dt * 14);
      this.vel.x += (tx - this.vel.x) * k;
      this.vel.z += (tz - this.vel.z) * k;
      if (this.swing?.face != null) this.yaw = dampAngle(this.yaw, this.swing.face, 22, dt);
      else if (this.moving) this.yaw = dampAngle(this.yaw, Math.atan2(dirX, dirZ), 12, dt);
    }
    this._move(dt, world);

    // the swing itself, and the moment it lands
    let swingPose = null;
    if (this.swing) {
      const s = this.swing;
      s.t += dt / s.dur;
      if (!s.landed && s.t >= SWINGS[s.kind].hit) { s.landed = true; world.impact(this, s); }
      if (s.t >= 1) {
        this.swing = null;
        if (this.queued || input.down.attack) { this.queued = false; this._startSwing(world); }
      } else {
        swingPose = { kind: s.kind, t: s.t };
      }
    }
    this.rig.update(dt, {
      speed: this.speed, swing: swingPose,
      dash: this.dash ? clamp01(this.dash.t / (P.dashTime + 0.12)) : 0,
      hurt: this.hurtT,
    });
  }

  _move(dt, world) {
    const before = { x: this.pos.x, z: this.pos.z };
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    world.collider.resolve(this.pos, this.radius);
    this.speed = Math.hypot(this.pos.x - before.x, this.pos.z - before.z) / Math.max(dt, 1e-4);
    this.pos.y = damp(this.pos.y, world.ground(this.pos.x, this.pos.z), 18, dt);
    this.group.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
  }

  _startSwing(world) {
    const pick = world.pickTarget(this);
    this.useTool(pick.tool);
    const weapon = this.profile.weapon();
    let kind = 'chop', dur = PICK_TIME;
    if (pick.tool === 'weapon' && weapon) {
      kind = SWING_OF[weapon.item.type] || 'slash';
      dur = weapon.cooldown;
    }
    this.swing = { kind, t: 0, dur, tool: pick.tool, target: pick.target, landed: false, face: pick.face ?? null };
    world.onSwing?.(this, this.swing);
  }

  /** The look of what you are holding, for the HUD's attack button. */
  heldParts() {
    const it = this.tool === 'weapon' ? this.profile.equippedItem('weapon') : this.profile.equippedItem('pickaxe');
    return it ? { item: it, parts: it.mix ? partsOf(it.mix) : null } : null;
  }

  dispose() {
    this.group.removeFromParent();
    this.rig.dispose();
    this.tag.dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
  }
}
