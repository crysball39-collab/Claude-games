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
import { DAMAGEABLE, pointInBone, boneBoxCenter, boxLocalToWorld } from './skeleton.js';
import { softGlowMaterial } from './fx.js';
import { paintSplat } from './paint.js';
import { inPool } from './map.js';
import { makeRng, clamp01 } from '../core/util.js';

const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3(), _v4 = new Vector3();
const _force = new Vector3(), _prev = new Vector3();

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

/** A flamethrower's stream is a run of these: puffs of burning gas. */
const PUFF = {
  max: 70,
  life: 0.68,        // seconds a puff burns for
  drag: 1.7,         // per second, so the stream slows and billows out
  rise: 3.2,         // m/s^2: hot gas goes up
  r0: 0.09,          // radius leaving the nozzle
  r1: 0.62,          // radius at the end of its life
  bite: 0.22,        // seconds of flame a person soaks before it hurts
  scorchEvery: 0.09, // seconds between marks one puff leaves where it rolls
};

export class FireSystem {
  constructor(game) {
    this.game = game;
    this.rng = makeRng(0xf12e);
    this.balls = [];
    /** character -> { time, dps, acc, parts, source, smoke } */
    this.burning = new Map();
    this.puffs = [];
    /** character -> flame soaked since the last bite { acc, t, bone, point, dir, source } */
    this.soak = new Map();
  }

  /* ------------------------------ flamethrower ----------------------------- */

  /**
   * One puff of burning gas from a nozzle. A held trigger lets go of twenty
   * a second, and together they are the stream: it reaches, slows, swells and
   * lifts, rolls along whatever it hits, and sets alight whoever it touches.
   *
   * @param {object} o  from, dir (unit), owner, damage, hitsBoss, speed, carry
   *   (the shooter's own velocity, some of which the gas keeps)
   */
  spray(o) {
    const rng = this.rng;
    const speed = (o.speed ?? 15) * (0.88 + rng() * 0.24);
    const vel = o.dir.clone().multiplyScalar(speed);
    vel.x += (rng() - 0.5) * 0.9;
    vel.y += (rng() - 0.5) * 0.7;
    vel.z += (rng() - 0.5) * 0.9;
    if (o.carry) vel.addScaledVector(o.carry, 0.6);
    if (this.puffs.length >= PUFF.max) this.puffs.shift();
    this.puffs.push({
      pos: o.from.clone(), vel, age: 0, life: PUFF.life * (0.85 + rng() * 0.3),
      owner: o.owner ?? null, damage: o.damage ?? 2.2, hitsBoss: o.hitsBoss ?? true,
      hit: new Set(), stuck: false, mark: 0, bossHit: false,
    });
  }

  _updatePuffs(dt) {
    const g = this.game, w = g.world, fx = g.fx, rng = this.rng;
    const drag = Math.exp(-PUFF.drag * dt);
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        if (rng() < 0.35) fx?.smoke(p.pos, { count: 1, size: 0.5, up: 0.9, life: 1.4, dark: 0.12 });
        this.puffs.splice(i, 1);
        continue;
      }
      const rad = PUFF.r0 + (PUFF.r1 - PUFF.r0) * Math.sqrt(k);
      _prev.copy(p.pos);
      p.vel.multiplyScalar(drag);
      p.vel.y += PUFF.rise * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.mark -= dt;

      // water puts it straight out
      if (this._puffInWater(p.pos)) {
        fx?.smoke(p.pos, { count: 2, size: 0.45, up: 1.4, life: 1.1, dark: 0.02 });
        this.puffs.splice(i, 1);
        continue;
      }
      // the floor: it spreads out along it and leaves it black
      const floor = w.floorAt(p.pos.x, p.pos.z, p.pos.y + 0.3);
      const low = rad * 0.45;
      if (p.pos.y - low < floor) {
        p.pos.y = floor + low;
        if (p.vel.y < 0) {
          const v = -p.vel.y;
          p.vel.y = 0;
          // pressed into the floor, it rolls outwards instead
          const h = Math.hypot(p.vel.x, p.vel.z) || 1;
          p.vel.x += (p.vel.x / h) * v * 0.6;
          p.vel.z += (p.vel.z / h) * v * 0.6;
        }
        if (p.mark <= 0 && k < 0.85) {
          p.mark = PUFF.scorchEvery;
          _v1.set(p.pos.x, floor, p.pos.z);
          this.scorchFloor(_v1, 0.10 + rad * 0.35, 0.55);
        }
      }
      // walls and anything else solid stop it dead and get scorched
      if (!p.stuck) this._puffSolids(p, rad * 0.5);
      // people
      this._puffPeople(p, rad);
      // the boss, once a puff
      if (p.hitsBoss && !p.bossHit && g.encounter?.boss) {
        const boss = g.encounter.boss;
        if (boss.hitTest(p.pos, rad * 0.6)) { p.bossHit = true; boss.takeDamage(p.damage * 1.45, p.pos, 'fire'); }
      }

      if (fx) {
        /* The stream itself: hot and tight near the nozzle, swelling as it
           goes. A fresh puff covers half a metre a frame, so it lays flame
           down all along the way it came rather than in dots. */
        const hot = 1 - k;
        const size = 0.14 + rad * 0.85;
        const travel = _prev.distanceTo(p.pos);
        const n = Math.min(4, Math.max(k < 0.5 ? 1 : 2, Math.ceil(travel / (size * 0.7))));
        _v2.copy(p.vel).multiplyScalar(0.35);
        for (let j = 0; j < n; j++) {
          _v3.copy(_prev).lerp(p.pos, (j + 1) / n);
          fx.fire(_v3, { count: 1, spread: rad * 0.45, up: 0.5 + k * 0.9,
            size, life: 0.2 + hot * 0.12, vel: _v2 });
        }
        if (k > 0.55 && rng() < 0.08) fx.smoke(p.pos, { count: 1, size: 0.5, up: 1.1, life: 1.3, dark: 0.1 });
        if (rng() < 0.04) fx.embers(p.pos, { count: 1, spread: rad * 0.5, up: 0.8, life: 0.8 });
      }
    }
  }

  _puffInWater(pos) {
    for (const pool of this.game.map?.water || []) {
      if (inPool(pool, pos.x, pos.z) && pos.y < pool.y + 0.06) return true;
    }
    return false;
  }

  _puffSolids(p, r) {
    const w = this.game.world, pos = p.pos;
    for (const list of [w.staticBodies, w.bodies]) {
      for (const body of list) {
        if (pos.x < body.aabbMin.x - r || pos.x > body.aabbMax.x + r ||
            pos.y < body.aabbMin.y - r || pos.y > body.aabbMax.y + r ||
            pos.z < body.aabbMin.z - r || pos.z > body.aabbMax.z + r) continue;
        body.closestPoint(pos, _v1);
        if (_v1.distanceToSquared(pos) > r * r && !body.containsPoint(pos)) continue;
        // a map part as wide as the floor it stands on: only its face stops gas
        const n = _v3.copy(pos).sub(_v1);
        const d = n.length();
        if (d > 1e-5) n.multiplyScalar(1 / d); else n.copy(p.vel).normalize().negate();
        // the top of a map part is floor, and the floor test has that
        if (body.isStatic && n.y > 0.7) return;
        // lose what was going into the wall, keep what runs along it
        const into = p.vel.dot(n);
        if (into < 0) p.vel.addScaledVector(n, -into * 1.15);
        p.vel.multiplyScalar(0.55);
        pos.copy(_v1).addScaledVector(n, r);
        p.stuck = true;
        if (p.mark <= 0) {
          p.mark = PUFF.scorchEvery * 1.6;
          body.userData?.paintBlood?.(_v1, 0.45 + this.rng() * 0.35, null, 'burn');
        }
        if (body.invMass > 0) {
          body.wake?.();
          body.applyImpulse(_v4.copy(p.vel).multiplyScalar(0.02), _v1);
        }
        return;
      }
    }
  }

  _puffPeople(p, rad) {
    const g = this.game, pos = p.pos;
    const reach = rad * 0.7;
    for (const c of g.characters) {
      if (c === p.owner || p.hit.has(c) || c.body?.destroyed) continue;
      if (c.center.distanceToSquared(pos) > (1.4 + reach) * (1.4 + reach)) continue;
      let best = null, bd = Infinity;
      for (const name of DAMAGEABLE) {
        if (c.gone?.has(name)) continue;
        const bone = c.rig.byName[name];
        if (!bone || !pointInBone(bone, pos, reach)) continue;
        const d = boneBoxCenter(bone, _v1).distanceToSquared(pos);
        if (d < bd) { bd = d; best = name; }
      }
      if (!best) continue;
      p.hit.add(c);
      // a puff that has reached someone has spent itself on them
      p.vel.multiplyScalar(0.45);
      const k = p.age / p.life;
      let s = this.soak.get(c);
      if (!s) { s = { acc: 0, t: 0, n: 0, bone: best, point: new Vector3(), dir: new Vector3(), source: null }; this.soak.set(c, s); }
      s.acc += p.damage * (1 - 0.55 * k);
      s.n++;
      s.bone = best;
      s.point.copy(pos);
      s.dir.copy(p.vel).normalize();
      if (p.owner) s.source = p.owner;
    }
  }

  /** What the flame has done to each person it touched, in bites. */
  _updateSoak(dt) {
    for (const [c, s] of this.soak) {
      s.t += dt;
      if (s.t < PUFF.bite) continue;
      this.soak.delete(c);
      if (c.body?.destroyed || !this.game.characters.includes(c) || s.acc <= 0) continue;
      const bone = c.rig.byName[s.bone];
      if (!bone || c.gone?.has(s.bone)) continue;
      // the hit lands on the part itself, where the gas met it
      const at = boneBoxCenter(bone, _v1).lerp(s.point, 0.5).clone();
      _force.copy(s.dir).multiplyScalar(6 + s.acc * 1.5);
      c.applyImpact(at, _force, {
        boneName: s.bone, damage: s.acc, type: 'burn', severity: clamp01(0.22 + s.n * 0.05),
        attacker: s.source, wound: 'burn',
      });
      this.ignite(c, 4.5, s.source);
      // keep the fire spreading over them while the stream stays on
      const b = this.burning.get(c);
      if (b && !b.parts.includes(s.bone) && b.parts.length < 6) b.parts.push(s.bone);
    }
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
      attacker: b.owner === 'boss' ? null : b.owner, wound: k > 0.5 ? 'burn' : null,
    });
    if (b.igniteFor > 0) this.ignite(c, b.igniteFor * (0.5 + 0.5 * k), b.owner === 'boss' ? null : b.owner);
  }

  /** A black mark on the floor sheet. `strength` below 1 is a lighter one
      that builds up, which is what a flamethrower's stream leaves. */
  scorchFloor(at, radius, strength = 1) {
    const gore = this.game.gore;
    if (!gore) return;
    const rng = this.rng;
    const a = strength;
    gore.sheet.paint(at.x, at.z, (ctx, px, py, ppm) => {
      const r = Math.max(3, radius * ppm);
      const gr = ctx.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, `rgba(12,8,6,${0.85 * a})`);
      gr.addColorStop(0.6, `rgba(30,20,14,${0.45 * a})`);
      gr.addColorStop(1, 'rgba(40,28,20,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      // a few sparks of it thrown further
      const n = a < 1 ? 2 : 6;
      for (let i = 0; i < n; i++) paintSplat(ctx, px + (rng() - 0.5) * r, py + (rng() - 0.5) * r,
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
      if (inPool(pool, c.center.x, c.center.z) && c.center.y < pool.y + 0.9) return true;
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
      /* And it marks them, more the longer it goes on: the parts that are
         alight char a little more every few tenths of a second, scorch marks
         spread across them, and once it has been going a while the skin
         blisters and splits open. */
      b.mark = (b.mark ?? 0.15) - dt;
      if (b.mark <= 0) {
        b.mark = 0.32 + this.rng() * 0.12;
        const name = b.parts[(this.rng() * b.parts.length) | 0];
        const bone = name && !c.gone?.has(name) ? c.rig.byName[name] : null;
        if (bone && c.body && !c.body.destroyed && this.game.gore?.enabled) {
          const charred = c.body.char(name, 0.08 + 0.05 * fierce);
          // somewhere on the part, not always its middle
          boxLocalToWorld(bone, _v2.set(
            (this.rng() - 0.5) * bone.boxHalf.x * 2.2,
            (this.rng() - 0.5) * bone.boxHalf.y * 2.2,
            (this.rng() - 0.5) * bone.boxHalf.z * 2.2), _v3);
          const sev = clamp01(0.25 + b.t * 0.07);
          c.body.paintHit(name, _v3, { kind: 'burn', severity: sev, allowTear: true });
          if (charred > 0.25 && this.rng() < 0.4) {
            this.game.wounds?.add(c, name, _v3, 'burn', { severity: sev });
          }
        }
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
    this._updatePuffs(dt);
    this._updateSoak(dt);
    this._updateBurning(dt);
  }

  clear() {
    for (const b of this.balls) b.dispose();
    this.balls.length = 0;
    this.puffs.length = 0;
    this.soak.clear();
    this.burning.clear();
  }

  dispose() { this.clear(); }
}
