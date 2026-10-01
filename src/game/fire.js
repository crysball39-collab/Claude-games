/* =============================================================================
   Fire: thrown fireballs, and being on fire.

   Both Silva and the Fire Fist throw the same fireball - they differ in how
   big, how fast and how much it hurts - so it lives here rather than with
   either of them. Burning is a state a person is in for a few seconds: flames
   come off them, they scorch, they take damage, and if they are a citizen
   they run. Water puts it out.
   ========================================================================== */
import {
  Group, Mesh, SphereGeometry, MeshBasicMaterial, AdditiveBlending, Vector3,
} from 'three';
import { DAMAGEABLE, pointInBone, boneBoxCenter } from './skeleton.js';
import { softGlowMaterial } from './fx.js';
import { paintSplat } from './paint.js';
import { makeRng, clamp01 } from '../core/util.js';

const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3(), _v4 = new Vector3();
const _force = new Vector3();

/** Parts that catch: big enough to see flames on, spread round the body. */
const FLAME_PARTS = ['upperTorso', 'midTorso', 'upperArmR', 'upperArmL', 'upperLegR',
  'upperLegL', 'head', 'lowerArmR', 'lowerArmL', 'lowerLegR', 'lowerLegL'];

const sharedGeo = new SphereGeometry(1, 14, 10);

class Fireball {
  constructor(sys, o) {
    this.sys = sys;
    this.pos = o.from.clone();
    this.prev = o.from.clone();
    this.vel = o.dir.clone().normalize().multiplyScalar(o.speed);
    this.radius = o.radius;
    this.damage = o.damage;
    this.splash = o.splash;
    this.igniteFor = o.ignite;
    this.owner = o.owner;          // a character, or 'boss'
    this.life = o.life ?? 4;
    this.scale = o.scale ?? 1;
    this.hitsBoss = o.hitsBoss ?? false;
    this.alive = true;

    this.group = new Group();
    this.glowMat = softGlowMaterial(o.color ?? 0xff6a1a, 0.9, 1.6);
    this.coreMat = new MeshBasicMaterial({
      color: 0xfff0b0, transparent: true, opacity: 0.95,
      blending: AdditiveBlending, depthWrite: false,
    });
    const glow = new Mesh(sharedGeo, this.glowMat);
    glow.scale.setScalar(this.radius * 2.1);
    const core = new Mesh(sharedGeo, this.coreMat);
    core.scale.setScalar(this.radius * 0.8);
    glow.renderOrder = 9; core.renderOrder = 10;
    this.group.add(glow, core);
    this.glow = glow;
    this.group.position.copy(this.pos);
    sys.game.scene.add(this.group);
    this.t = 0;
  }

  dispose() {
    this.group.removeFromParent();
    this.glowMat.dispose();
    this.coreMat.dispose();
  }
}

export class FireSystem {
  constructor(game) {
    this.game = game;
    this.rng = makeRng(0xf12e);
    this.balls = [];
    /** character -> { time, dps, acc, parts, source, smoke } */
    this.burning = new Map();
  }

  /* ------------------------------- fireballs ------------------------------ */

  /**
   * @param {object} o  from, dir, speed, radius, damage, splash (radius),
   *   ignite (seconds), owner, hitsBoss, scale, color
   */
  shoot(o) {
    const b = new Fireball(this, {
      speed: 16, radius: 0.22, damage: 18, splash: 1.8, ignite: 3,
      ...o,
    });
    this.balls.push(b);
    return b;
  }

  _updateBalls(dt) {
    const g = this.game;
    const fx = g.fx;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.t += dt;
      b.life -= dt;
      if (b.life <= 0) { this._fizzle(b); this.balls.splice(i, 1); continue; }
      // swept in short hops so nothing fast tunnels through a thin limb
      const travel = b.vel.length() * dt;
      const hops = Math.max(1, Math.ceil(travel / Math.max(0.12, b.radius * 0.7)));
      let hit = null;
      for (let h = 0; h < hops && !hit; h++) {
        b.prev.copy(b.pos);
        b.pos.addScaledVector(b.vel, dt / hops);
        hit = this._collide(b);
      }
      b.group.position.copy(b.pos);
      const flick = 1 + Math.sin(b.t * 31) * 0.08 + Math.sin(b.t * 17) * 0.06;
      b.glow.scale.setScalar(b.radius * 2.1 * flick);
      if (fx) {
        fx.fire(b.pos, { count: 2, spread: b.radius * 0.5, up: 0.4, size: b.radius * 1.6,
          life: 0.32, vel: _v4.copy(b.vel).multiplyScalar(-0.12) });
        if (this.rng() < 0.4) fx.embers(b.pos, { count: 1, spread: b.radius, up: 0.6, life: 0.7 });
      }
      if (hit) { this._explode(b, hit); this.balls.splice(i, 1); }
    }
  }

  /** What, if anything, the ball has just run into. */
  _collide(b) {
    const g = this.game, w = g.world, p = b.pos, r = b.radius;
    // people
    for (const c of g.characters) {
      if (c === b.owner || c.body?.destroyed) continue;
      if (c.center.distanceToSquared(p) > 2.6) continue;
      for (const name of DAMAGEABLE) {
        if (c.gone?.has(name)) continue;
        const bone = c.rig.byName[name];
        if (bone && pointInBone(bone, p, r)) return { character: c, boneName: name };
      }
    }
    // the boss
    if (b.hitsBoss && g.encounter?.boss) {
      const part = g.encounter.boss.hitTest(p, r);
      if (part) return { boss: g.encounter.boss, part };
    }
    // floors, the ground, the platform
    const floor = w.floorAt(p.x, p.z, p.y + r);
    if (p.y - r <= floor) return { ground: true, y: floor };
    // walls and anything else solid
    for (const list of [w.staticBodies, w.bodies]) {
      for (const body of list) {
        if (p.x < body.aabbMin.x - r || p.x > body.aabbMax.x + r ||
            p.y < body.aabbMin.y - r || p.y > body.aabbMax.y + r ||
            p.z < body.aabbMin.z - r || p.z > body.aabbMax.z + r) continue;
        body.closestPoint(p, _v1);
        if (_v1.distanceToSquared(p) <= r * r || body.containsPoint(p)) return { body };
      }
    }
    if (p.y < w.killY) return { ground: true, y: p.y };
    return null;
  }

  _fizzle(b) {
    this.game.fx?.smoke(b.pos, { count: 3, size: 0.4 * b.scale });
    b.dispose();
  }

  _explode(b, hit) {
    const g = this.game;
    const at = _v2.copy(b.pos);
    if (hit.ground) at.y = hit.y + 0.05;
    g.fx?.explosion(at, { scale: 0.55 * b.scale });
    const dir = _v3.copy(b.vel).normalize();
    // the one it hit takes the whole thing
    if (hit.character) this._burnHit(hit.character, hit.boneName, at, dir, b.damage, b, 1);
    if (hit.boss) hit.boss.takeDamage(b.damage * (hit.part.mult || 1), at, 'fire');
    if (hit.body && hit.body.invMass > 0) {
      hit.body.applyImpulse(_v1.copy(dir).multiplyScalar(b.damage * 0.6), at);
      hit.body.wake?.();
    }
    // everyone else close enough catches the edge of it
    if (b.splash > 0) {
      for (const c of g.characters) {
        if (c === b.owner || c === hit.character || c.body?.destroyed) continue;
        const d = c.center.distanceTo(at);
        if (d > b.splash) continue;
        const k = 1 - d / b.splash;
        let best = 'midTorso', bd = Infinity;
        for (const name of ['upperTorso', 'midTorso', 'head', 'upperLegR', 'upperLegL']) {
          const bone = c.rig.byName[name];
          if (!bone || c.gone?.has(name)) continue;
          const dd = boneBoxCenter(bone, _v1).distanceToSquared(at);
          if (dd < bd) { bd = dd; best = name; }
        }
        boneBoxCenter(c.rig.byName[best], _v1);
        this._burnHit(c, best, _v1.clone(), _v4.copy(_v1).sub(at).normalize(), b.damage * 0.5 * k, b, k);
      }
      if (b.hitsBoss && g.encounter?.boss && !hit.boss) {
        const boss = g.encounter.boss;
        const d = boss.center.distanceTo(at);
        if (d < b.splash + 0.8) boss.takeDamage(b.damage * 0.35, at, 'fire');
      }
    }
    // and it leaves a burnt patch where it went off
    this.scorchFloor(at, 0.35 * b.scale);
    b.dispose();
  }

  _burnHit(c, boneName, at, dir, damage, b, k) {
    const force = _force.copy(dir).multiplyScalar(60 + damage * 4 * k);
    force.y += 28 * k;
    c.applyImpact(at, force, {
      boneName, damage, type: 'burn', severity: clamp01(0.35 + damage / 40),
      attacker: b.owner === 'boss' ? null : b.owner,
    });
    if (b.igniteFor > 0) this.ignite(c, b.igniteFor * (0.5 + 0.5 * k), b.owner === 'boss' ? null : b.owner);
  }

  /** A black mark on the floor sheet. */
  scorchFloor(at, radius) {
    const gore = this.game.gore;
    if (!gore) return;
    const rng = this.rng;
    gore.sheet.paint(at.x, at.z, (ctx, px, py, ppm) => {
      const r = Math.max(3, radius * ppm);
      const gr = ctx.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, 'rgba(12,8,6,0.85)');
      gr.addColorStop(0.6, 'rgba(30,20,14,0.45)');
      gr.addColorStop(1, 'rgba(40,28,20,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      // a few sparks of it thrown further
      for (let i = 0; i < 6; i++) paintSplat(ctx, px + (rng() - 0.5) * r, py + (rng() - 0.5) * r,
        r * 0.18, rng() - 0.5, rng() - 0.5, rng, 0.85);
    });
  }

  /* -------------------------------- burning ------------------------------- */

  /** Sets someone alight for `seconds`, or tops up the fire they are in. */
  ignite(c, seconds = 4, source = null) {
    if (!c || c.body?.destroyed) return;
    const cur = this.burning.get(c);
    if (cur) {
      cur.time = Math.max(cur.time, seconds);
      if (source) cur.source = source;
      return;
    }
    const live = FLAME_PARTS.filter((n) => c.rig.byName[n] && !c.gone?.has(n));
    const parts = [];
    for (let i = 0; i < 3 && live.length; i++) {
      parts.push(live.splice((this.rng() * live.length) | 0, 1)[0]);
    }
    this.burning.set(c, { time: seconds, dps: 4.5, acc: 0, parts, source, t: 0 });
    if (c === this.game.player) this.game.hud?.toast('You are on fire', 1200);
  }

  extinguish(c) {
    if (!this.burning.has(c)) return;
    this.burning.delete(c);
    if (!c.body?.destroyed) {
      boneBoxCenter(c.rig.byName.midTorso, _v1);
      this.game.fx?.smoke(_v1, { count: 6, size: 0.5, dark: 0.3 });
    }
  }

  isBurning(c) { return this.burning.has(c); }

  _inWater(c) {
    for (const pool of this.game.map?.water || []) {
      const dx = c.center.x - pool.x, dz = c.center.z - pool.z;
      if (dx * dx + dz * dz < pool.r * pool.r && c.center.y < pool.y + 0.9) return true;
    }
    return false;
  }

  _updateBurning(dt) {
    const g = this.game;
    for (const [c, b] of this.burning) {
      if (c.body?.destroyed || !g.characters.includes(c)) { this.burning.delete(c); continue; }
      if (this._inWater(c)) { this.extinguish(c); continue; }
      b.time -= dt;
      b.t += dt;
      if (b.time <= 0) { this.burning.delete(c); continue; }
      // flames off each part that caught, more of them while it is fresh
      const fierce = clamp01(b.time / 3);
      for (const name of b.parts) {
        if (c.gone?.has(name)) continue;
        const bone = c.rig.byName[name];
        if (!bone) continue;
        boneBoxCenter(bone, _v1);
        g.fx?.fire(_v1, { count: fierce > 0.4 ? 2 : 1, spread: 0.07, up: 1.4, size: 0.2 + fierce * 0.1,
          life: 0.42 });
      }
      if (this.rng() < dt * 6) {
        boneBoxCenter(c.rig.byName.upperTorso, _v1);
        g.fx?.smoke(_v1, { count: 1, size: 0.45, up: 1.2 });
        g.fx?.embers(_v1, { count: 1, spread: 0.2 });
      }
      // it hurts, in steady bites rather than sixty tiny ones a second
      b.acc += b.dps * dt * (c.dead ? 0.4 : 1);
      if (b.acc >= 2.5) {
        const name = b.parts[(this.rng() * b.parts.length) | 0] || 'midTorso';
        const bone = c.rig.byName[name];
        if (bone && !c.gone?.has(name)) {
          boneBoxCenter(bone, _v1);
          c.applyDamage(b.acc, { boneName: name, point: _v1.clone(), type: 'burn',
            severity: 0.35, attacker: b.source });
        }
        b.acc = 0;
      }
      /* A person on fire runs, and does not stop to think about it. Away from
         whoever did it if they know who that was, and otherwise away from
         where it happened. */
      if (c.ai && !c.dead) {
        const ai = c.ai;
        ai.fear = 1;
        ai.panic = 0.4;
        if (!ai.threat) {
          if (!b.away) {
            b.away = { pos: c.pos.clone(), dead: false, combatReady: false, equipped: null };
            b.away.pos.x += (this.rng() - 0.5) * 1.5;
            b.away.pos.z += (this.rng() - 0.5) * 1.5;
          }
          ai.threat = b.source && !b.source.dead ? b.source : b.away;
        }
        ai.threatSeen = Math.max(ai.threatSeen, 1);
        if (ai.state !== 'flee' && ai.state !== 'down') ai._setState('flee');
      }
    }
  }

  /** How much of the player is on fire right now, 0..1, for the HUD. */
  playerBurn() {
    const b = this.burning.get(this.game.player);
    return b ? clamp01(b.time / 2) : 0;
  }

  /* --------------------------------- frame -------------------------------- */

  update(dt) {
    this._updateBalls(dt);
    this._updateBurning(dt);
  }

  clear() {
    for (const b of this.balls) b.dispose();
    this.balls.length = 0;
    this.burning.clear();
  }

  dispose() { this.clear(); }
}
