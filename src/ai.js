// Bot brain.  Bots loot chests, hunt for upgrades, heal up and fight — with
// deliberately human aim: a wandering error cone, reaction delay, and bursts
// that drift off target the further away (and the faster) you move.
import * as THREE from 'three';
import { Actor } from './actor.js';
import { itemScore } from './loot.js';
import { clamp, lerp, damp, angleDiff, TAU, makeRng } from './util.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

const NAMES = ['Ace', 'Bolt', 'Cinder', 'Drift', 'Echo', 'Flux', 'Ghost', 'Havoc', 'Iris', 'Jinx',
  'Kilo', 'Lynx', 'Mako', 'Nomad', 'Onyx', 'Pilot', 'Quill', 'Rogue', 'Sable', 'Tundra',
  'Umber', 'Vex', 'Wraith', 'Xeno', 'Yeti', 'Zephyr', 'Bandit', 'Cobalt', 'Dozer', 'Ember',
  'Falcon', 'Gizmo', 'Hex', 'Ion', 'Jet', 'Krait', 'Lumen', 'Mirage', 'Nova', 'Orbit',
  'Prism', 'Quartz', 'Ranger', 'Slate', 'Talon', 'Ultra', 'Volt', 'Warden', 'Yarrow', 'Zenith'];

export function botName(i, rng) {
  return `${NAMES[i % NAMES.length]}${rng ? Math.floor(rng() * 90 + 10) : i}`;
}

export class Bot extends Actor {
  constructor(game, opts) {
    super(game, { ...opts, isPlayer: false });
    this.rng = makeRng((opts.seed || 1) * 7919 + 13);
    this.skill = clamp(0.25 + this.rng() * 0.6, 0, 1);      // 0 = hopeless, 1 = sharp
    this.state = 'loot';
    this.thinkT = this.rng() * 0.3;
    this.target = null;               // enemy actor
    this.goal = null;                 // {x,z,type,ref}
    this.goalT = 0;
    this.aimErr = new THREE.Vector2();
    this.aimErrTarget = new THREE.Vector2();
    this.aimErrT = 0;
    this.trackT = 0;
    this.burstLeft = 0;
    this.burstPause = 0;
    this.strafe = this.rng() < 0.5 ? 1 : -1;
    this.strafeT = 0;
    this.stuckT = 0;
    this.lastPos = this.pos.clone();
    this.jumpCd = 0;
    this.doorCd = 0;
    this.lootCd = 0;
    this.aiSpreadMul = lerp(1.9, 0.85, this.skill);
    this.reactT = lerp(0.55, 0.16, this.skill);
    this.viewRange = lerp(58, 96, this.skill);
    this.fov = Math.cos(lerp(1.05, 1.35, this.skill));
    this.desiredRange = lerp(9, 24, this.rng());
    this.wanderAngle = this.rng() * TAU;
    this.lastSawT = -99;
  }

  // ---------------------------------------------------------------- senses
  scanForEnemies() {
    const g = this.game;
    let best = null, bestD = this.viewRange;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const candidates = [];
    for (const a of g.actors) {
      if (a === this || !a.alive) continue;
      const dx = a.pos.x - this.pos.x, dz = a.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > this.viewRange) continue;
      const dot = (dx * fx + dz * fz) / (d || 1);
      // wide awareness when close, cone at distance
      if (d > 9 && dot < this.fov) continue;
      candidates.push({ a, d });
    }
    candidates.sort((p, q) => p.d - q.d);
    for (let i = 0; i < Math.min(3, candidates.length); i++) {
      const { a, d } = candidates[i];
      this.eyePos(_v);
      a.chestPos(_v2);
      if (!g.physics.lineOfSight(_v.x, _v.y, _v.z, _v2.x, _v2.y, _v2.z)) continue;
      if (d < bestD) { bestD = d; best = a; }
    }
    return best;
  }

  nearestLoot() {
    const g = this.game;
    let best = null, bestD = 62;
    const wantWeapon = this.inv.countWeapons() < 2;
    const myBest = this.inv.bestWeapon() >= 0 ? itemScore(this.inv.slots[this.inv.bestWeapon()]) : 0;
    for (const c of g.chests) {
      if (c.opened) continue;
      const d = Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z);
      if (d < bestD) { bestD = d; best = { x: c.pos.x, y: c.pos.y, z: c.pos.z, type: 'chest', ref: c }; }
    }
    for (const p of g.pickups) {
      if (!p.alive) continue;
      const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      if (d > bestD) continue;
      const it = p.item;
      let want = false;
      if (it.kind === 'weapon') want = wantWeapon || itemScore(it) > myBest + 6;
      else if (it.id === 'bandage') want = this.health < 100 || this.inv.findItem('bandage') < 0;
      else want = this.shield < 100 || this.inv.findItem('shield') < 0;
      if (this.inv.firstEmpty() < 0 && !want) continue;
      if (!want) continue;
      bestD = d;
      best = { x: p.pos.x, y: p.pos.y, z: p.pos.z, type: 'pickup', ref: p };
    }
    return best;
  }

  pickPoiGoal() {
    const g = this.game;
    const pois = g.poiCenters;
    // prefer a POI we are not already standing in
    const options = pois.filter(p => Math.hypot(p.x - this.pos.x, p.z - this.pos.z) > 90);
    const p = options.length ? options[Math.floor(this.rng() * options.length)] : pois[0];
    const a = this.rng() * TAU, r = this.rng() * 70;
    return { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r, type: 'roam' };
  }

  // ---------------------------------------------------------------- brain
  think(dt) {
    const g = this.game;
    const enemy = this.scanForEnemies();
    if (enemy) {
      if (this.target !== enemy) { this.trackT = 0; this.target = enemy; }
    } else if (this.target && (!this.target.alive || g.time - this.lastSawT > 3.0)) {
      this.target = null;
    }
    if (this.target && this.target.alive) this.lastSawT = g.time;

    const hurt = this.health < 55;
    const canHeal = this.inv.findItem('bandage') >= 0 && this.health < 100;
    const canShield = this.inv.findItem('shield') >= 0 && this.shield < 100;
    let threatened = this.target && this.target.alive;

    // an unarmed bot has nothing to fight with: unless someone is right on top
    // of it, going for loot beats running in circles
    if (threatened && this.inv.bestWeapon() < 0 && this.distTo(this.target) > 14) {
      this.lootCd = 0;
      if (this.nearestLoot()) threatened = false;
    }

    if (threatened) {
      this.state = (hurt && canHeal && this.distTo(this.target) > 34) ? 'heal' : 'fight';
    } else if ((canHeal && this.health < 85) || (canShield && this.shield < 50)) {
      this.state = 'heal';
    } else {
      const loot = this.lootCd <= 0 ? this.nearestLoot() : null;
      if (loot) {
        // give every new goal a fresh clock, otherwise a long roam leaks into
        // the loot goal and it is abandoned before the bot ever arrives
        if (!this.goal || this.goal.ref !== loot.ref) this.goalT = 0;
        this.state = 'loot';
        this.goal = loot;
      } else if (!this.goal || this.goal.type !== 'roam' || this.goalT > 22) {
        this.state = 'roam'; this.goal = this.pickPoiGoal(); this.goalT = 0;
      } else this.state = 'roam';
    }

    // always hold the best weapon unless healing
    if (this.state !== 'heal') {
      const bw = this.inv.bestWeapon();
      if (bw >= 0 && this.inv.selected !== bw) this.select(bw);
      else if (bw < 0 && !this.inv.holdingPickaxe) this.select(this.inv.pickaxeSlot);
    }
  }

  distTo(a) { return Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z); }

  // ---------------------------------------------------------------- acting
  update(dt, lod) {
    if (!this.alive) {
      this.deadT += dt;
      if (lod < 2) this.updateVisual(dt);
      return;
    }
    this.goalT += dt;
    this.jumpCd -= dt; this.doorCd -= dt;
    if (this.lootCd > 0) this.lootCd -= dt;
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.28 + this.rng() * 0.16; this.think(dt); }

    this.moveInput.set(0, 0);
    this.sprinting = false;
    this.crouching = false;
    this.aiming = false;

    if (this.state === 'fight' && this.target && this.target.alive) this.doFight(dt);
    else if (this.state === 'heal') this.doHeal(dt);
    else this.doTravel(dt);

    this.avoidAndUnstick(dt);
    this.updateTimers(dt);
    this.updatePhysics(dt);
    if (lod < 2) this.updateVisual(dt);
    else this.root.position.copy(this.pos);
  }

  faceTowards(x, z, dt, rate = 7) {
    const want = Math.atan2(x - this.pos.x, z - this.pos.z);
    this.yaw = angleDiffLerp(this.yaw, want, clamp(rate * dt, 0, 1));
  }

  moveTowards(x, z, dt, sprint = true) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.4) return true;
    this.faceTowards(x, z, dt, 6);
    const want = Math.atan2(dx, dz);
    const off = Math.abs(angleDiff(this.yaw, want));
    this.moveInput.set(0, off < 1.2 ? 1 : 0.55);
    this.sprinting = sprint && off < 0.7 && d > 6;
    return false;
  }

  doTravel(dt) {
    const goal = this.goal;
    if (!goal) { this.goal = this.pickPoiGoal(); return; }
    const d = Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z);

    if (goal.type === 'chest') {
      const c = goal.ref;
      if (c.opened) { this.goal = null; this.lootCd = 0.4; return; }
      const dy = Math.abs(c.pos.y - this.pos.y);
      if (d < 2.0 && dy < 2.6) {
        this.game.openChest(c, this);
        this.goal = null; this.lootCd = 0.5;
        return;
      }
      if (this.goalT > 18) { this.goal = null; this.lootCd = 3.0; return; }
      this.moveTowards(c.pos.x, c.pos.z, dt);
      return;
    }
    if (goal.type === 'pickup') {
      const p = goal.ref;
      if (!p.alive) { this.goal = null; this.lootCd = 0.2; return; }
      if (d < 1.6 && Math.abs(p.pos.y - this.pos.y) < 2.6) {
        this.game.tryPickup(this, p);
        this.goal = null; this.lootCd = 0.3;
        return;
      }
      if (this.goalT > 14) { this.goal = null; this.lootCd = 3.0; return; }
      this.moveTowards(p.pos.x, p.pos.z, dt);
      return;
    }
    if (d < 6) { this.goal = this.pickPoiGoal(); this.goalT = 0; return; }
    this.moveTowards(goal.x, goal.z, dt);
    // occasional hop while travelling, like a real player
    if (this.jumpCd <= 0 && this.rng() < 0.004) { this.wantJump = true; this.jumpCd = 1.6; }
  }

  doHeal(dt) {
    const wantSlot = (this.health < 100 && this.inv.findItem('bandage') >= 0)
      ? this.inv.findItem('bandage') : this.inv.findItem('shield');
    if (wantSlot < 0) { this.state = 'roam'; return; }
    if (this.inv.selected !== wantSlot) { this.select(wantSlot); return; }
    if (this.useT <= 0 && this.equipT <= 0) this.tryUse();
    // back away from danger while healing
    if (this.target && this.target.alive) {
      this.faceTowards(this.target.pos.x, this.target.pos.z, dt, 4);
      this.moveInput.set(this.strafe * 0.6, -0.8);
    }
  }

  doFight(dt) {
    const t = this.target;
    const dist = this.distTo(t);
    this.trackT += dt;

    // --- aim: point at the chest, then add a wandering error cone --------
    this.eyePos(_v);
    t.chestPos(_v2);
    // lead the target a little, badly
    const lead = lerp(0.0, 0.22, this.skill);
    _v2.x += t.vel.x * lead; _v2.z += t.vel.z * lead;
    const dx = _v2.x - _v.x, dy = _v2.y - _v.y, dz = _v2.z - _v.z;
    const flat = Math.hypot(dx, dz);
    const wantYaw = Math.atan2(dx, dz);
    const wantPitch = Math.atan2(dy, flat);

    this.aimErrT -= dt;
    if (this.aimErrT <= 0) {
      this.aimErrT = 0.28 + this.rng() * 0.45;
      // error grows with distance and with how much the target is moving
      const moveFactor = 1 + clamp(Math.hypot(t.vel.x, t.vel.z) / 7, 0, 1) * 0.9;
      const base = lerp(0.115, 0.032, this.skill) * moveFactor
        * (1 + clamp(dist / 60, 0, 1.4))
        * clamp(1.6 - this.trackT * 0.55, 0.65, 1.6);
      this.aimErrTarget.set((this.rng() * 2 - 1) * base, (this.rng() * 2 - 1) * base * 0.7);
    }
    this.aimErr.x = damp(this.aimErr.x, this.aimErrTarget.x, 6, dt);
    this.aimErr.y = damp(this.aimErr.y, this.aimErrTarget.y, 6, dt);

    const turn = lerp(4.5, 10.0, this.skill);
    this.yaw = angleDiffLerp(this.yaw, wantYaw + this.aimErr.x, clamp(turn * dt, 0, 1));
    this.pitch = lerp(this.pitch, clamp(wantPitch + this.aimErr.y, -1.1, 1.1), clamp(turn * dt, 0, 1));

    // --- positioning ------------------------------------------------------
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeT = 0.7 + this.rng() * 1.3; if (this.rng() < 0.45) this.strafe *= -1; }
    const closing = dist > this.desiredRange + 4 ? 1 : dist < this.desiredRange - 4 ? -1 : 0;
    this.moveInput.set(this.strafe * 0.85, closing * 0.9);
    this.sprinting = closing > 0 && dist > 26;
    if (dist > 30 && this.rng() < 0.02 && this.grounded) this.crouching = true;
    this.crouching = this.crouching || (dist > 34 && this.skill > 0.6 && this.speed2D < 0.5);
    if (this.jumpCd <= 0 && dist < 16 && this.rng() < 0.012) { this.wantJump = true; this.jumpCd = 1.8; }

    const w = this.weapon;
    if (!w) {
      // no gun: run away and look for loot
      this.moveInput.set(0, -1); this.sprinting = true;
      this.state = 'roam'; this.goal = this.nearestLoot() || this.pickPoiGoal();
      return;
    }
    this.aiming = dist > 16 && this.rng() < 0.9;

    if (w.ammo <= 0) { this.tryReload(); return; }
    if (w.ammo < w.mag * 0.25 && dist > 38 && this.reloadT <= 0) { this.tryReload(); return; }

    // --- trigger discipline ----------------------------------------------
    const inRange = dist < w.def.range * 0.92;
    const onTarget = Math.abs(angleDiff(this.yaw, wantYaw)) < 0.16 + 0.1 * (1 - this.skill);
    const reacted = this.trackT > this.reactT;
    if (!inRange || !onTarget || !reacted) return;
    if (!this.game.physics.lineOfSight(_v.x, _v.y, _v.z, _v2.x, _v2.y, _v2.z)) return;

    this.burstPause -= dt;
    if (this.burstLeft <= 0) {
      if (this.burstPause > 0) return;
      this.burstLeft = w.def.auto ? Math.round(lerp(3, 8, this.rng())) : 1 + (this.rng() < 0.4 ? 1 : 0);
    }
    if (this.tryFire()) {
      this.burstLeft--;
      if (this.burstLeft <= 0) this.burstPause = lerp(0.55, 0.16, this.skill) + this.rng() * 0.3;
    }
  }

  /** Whiskers keep bots off walls; doors get opened; being stuck triggers a detour. */
  avoidAndUnstick(dt) {
    const phys = this.game.physics;
    const moving = this.moveInput.lengthSq() > 0.02;
    if (!moving) { this.stuckT = 0; this.lastPos.copy(this.pos); return; }

    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const eyeY = this.pos.y + 1.0;
    const probe = (ax, az, len) => phys.raycast(this.pos.x, eyeY, this.pos.z, ax, 0, az, len);

    const ahead = probe(fx, fz, 2.4);
    if (ahead && ahead.collider) {
      const owner = ahead.collider.owner;
      if (owner && owner.kind === 'door' && !owner.open && this.doorCd <= 0) {
        owner.toggle();
        this.doorCd = 1.6;
      } else {
        // steer around: test both shoulders and take the open one
        const lx = Math.sin(this.yaw - 0.9), lz = Math.cos(this.yaw - 0.9);
        const rx = Math.sin(this.yaw + 0.9), rz = Math.cos(this.yaw + 0.9);
        const left = probe(lx, lz, 3.0), right = probe(rx, rz, 3.0);
        const lFree = !left, rFree = !right;
        if (lFree && !rFree) this.yaw -= 2.4 * dt;
        else if (rFree && !lFree) this.yaw += 2.4 * dt;
        else this.yaw += (this.strafe > 0 ? 1 : -1) * 2.4 * dt;
        if (ahead.t < 1.2 && this.grounded && this.jumpCd <= 0) { this.wantJump = true; this.jumpCd = 0.9; }
      }
    }

    const moved = this.pos.distanceToSquared(this.lastPos);
    this.lastPos.copy(this.pos);
    if (moved < 0.0009) {
      this.stuckT += dt;
      if (this.stuckT > 0.7) {
        this.yaw += (this.rng() < 0.5 ? -1 : 1) * (0.9 + this.rng());
        this.wantJump = this.grounded;
        this.stuckT = 0;
        if (this.goal && this.goal.type !== 'roam' && this.rng() < 0.4) { this.goal = null; this.lootCd = 2.5; }
      }
    } else this.stuckT = Math.max(0, this.stuckT - dt);
  }
}

function angleDiffLerp(a, b, t) {
  return a + angleDiff(a, b) * t;
}
