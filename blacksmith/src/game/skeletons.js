/* =============================================================================
   The skeletons. There are always three in the cave, each with a wooden
   dagger, and three elites in the deep mine below it, in an Iron Chestplate
   and Iron Boots with an Iron Straight-Sword. They wander until they see you,
   then come at you and strike - with a wind-up you can see coming, and dash
   out of. Killed, they fall apart, sometimes leaving their bones behind, and
   a few seconds later another one claws its way up out of the floor
   somewhere else.

   Each pack keeps to its own place, which it is handed as an arena: where
   they may stand, what they can see past, how they get round what is in the
   way, and where you are safe from them - a camp, a tunnel, the hall down.
   ========================================================================== */
import { Group, Vector3, Color, MeshPhongMaterial } from 'three';
import { Rig, dressSkeleton } from './character.js';
import { buildWoodenDagger, buildWeapon, buildArmor } from './gear.js';
import { Bar3D } from './fx.js';
import { SKELETON, ORES, ELITE_GEAR, afterArmor, partsOf } from './data.js';
import { angleDelta, dampAngle, clamp01, makeRng } from '../core/util.js';

const BONE = '#e6dcc4';

/**
 * An elite's iron: the same iron as yours, but old, darkened with soot and
 * duller, so it reads as armour over the bone even in firelight.
 */
let eliteIron = null;
function elitesIron() {
  if (!eliteIron) {
    eliteIron = new MeshPhongMaterial({ color: '#56606b', specular: '#3c444e', shininess: 18, emissive: '#151d26' });
    eliteIron.userData.ore = 'iron';
  }
  return eliteIron;
}

export class SkeletonPack {
  /**
   * arena: { spots, keepIn(pos, r), sees(a, b), steer(from, to) -> {x, z},
   *          wanderPoint(from, rng) -> {x, z}, playerSafe(pos) }
   * kind: SKELETON or ELITE, from data.js
   */
  constructor({ scene, arena, fx, kind = SKELETON, seed = 1313 }) {
    this.scene = scene;
    this.arena = arena;
    this.fx = fx;
    this.kind = kind;
    this.rng = makeRng(seed);
    this.list = [];
    this.waiting = [];           // respawn timers
    this.time = 0;
  }

  get elite() { return !!this.kind.elite; }

  populate(avoid = null) {
    for (let i = 0; i < this.kind.count; i++) this.spawn(avoid, false);
  }

  /** Somewhere well away from you. */
  _spot(avoid) {
    const spots = this.arena.spots;
    const far = spots.filter((s) => !avoid || Math.hypot(s.x - avoid.x, s.z - avoid.z) > 10);
    const pool = far.length ? far : spots;
    return pool[Math.floor(this.rng() * pool.length)];
  }

  /** A skeleton's body, and what it carries and wears. */
  _dress() {
    const rig = dressSkeleton(new Rig(), { elite: this.elite }).bake();
    if (this.elite) {
      rig.joints.grip.add(buildWeapon(ELITE_GEAR.weapon.type, partsOf(ELITE_GEAR.weapon.mix)));
      const worn = [
        ...buildArmor(rig, ELITE_GEAR.chest.type, partsOf(ELITE_GEAR.chest.mix)),
        ...buildArmor(rig, ELITE_GEAR.boots.type, partsOf(ELITE_GEAR.boots.mix)),
      ];
      for (const m of worn) m.material = elitesIron();
    } else {
      rig.joints.grip.add(buildWoodenDagger());
    }
    return rig;
  }

  spawn(avoid = null, rise = true) {
    const K = this.kind;
    const s = this._spot(avoid);
    const rig = this._dress();
    const group = new Group();
    group.add(rig.root);
    const bar = new Bar3D(this.elite ? 1.0 : 0.8, 0.09, this.elite ? '#ff7a3a' : '#e8463a');
    bar.group.position.y = this.elite ? 2.35 : 2.2;
    group.add(bar.group);
    group.position.set(s.x, rise ? -1.9 : 0, s.z);
    this.scene.add(group);
    const sk = {
      rig, group, bar, elite: this.elite,
      pos: new Vector3(s.x, 0, s.z), vel: new Vector3(), yaw: this.rng() * Math.PI * 2,
      hp: K.hp, maxHp: K.hp, radius: K.radius,
      state: rise ? 'rise' : 'wander', t: 0, cooldown: 0, struck: false,
      wanderTo: null, idle: this.rng() * 2, hurt: 0, dead: 0, speed: 0, seen: 0,
    };
    if (rise) this.fx.dust(new Vector3(s.x, 0.1, s.z), 8, { size: 0.7 });
    this.list.push(sk);
    return sk;
  }

  alive() { return this.list.filter((s) => s.state !== 'dying' && s.state !== 'gone'); }

  /** The skeletons a swing from `pos` facing `yaw` would catch. */
  inReach(pos, yaw, reach, arcDeg, max = 9) {
    const arc = (arcDeg * Math.PI / 180) / 2;
    const out = [];
    for (const s of this.alive()) {
      const dx = s.pos.x - pos.x, dz = s.pos.z - pos.z;
      const d = Math.hypot(dx, dz) - s.radius;
      if (d > reach) continue;
      const off = Math.abs(angleDelta(yaw, Math.atan2(dx, dz)));
      // right up against you, it counts whichever way you are facing
      if (off > arc && d > 0.35) continue;
      out.push({ s, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out.slice(0, max).map((o) => o.s);
  }

  nearest(pos, maxDist = Infinity) {
    let best = null, bd = maxDist;
    for (const s of this.alive()) {
      const d = Math.hypot(s.pos.x - pos.x, s.pos.z - pos.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  /** What a blow of `damage` does to one of these, through its armour. */
  damageFrom(damage) { return Math.max(1, Math.round(afterArmor(damage, this.kind.defense || 0))); }

  /**
   * A blow from you, of `damage` before its armour has its say. Returns the
   * damage it took, and whether that killed it.
   */
  hit(s, damage, from) {
    if (!s || s.state === 'dying' || s.state === 'gone') return { dealt: 0, killed: false };
    const dealt = this.damageFrom(damage);
    s.hp -= dealt;
    s.rig.flash(0.12);
    s.bar.group.visible = true;
    s.bar.set(s.hp / s.maxHp);
    const dx = s.pos.x - from.x, dz = s.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
    const shove = this.elite ? 3 : 4.5;
    s.vel.x += (dx / d) * shove; s.vel.z += (dz / d) * shove;
    const at = new Vector3(s.pos.x, 1.2, s.pos.z);
    this.fx.debris(at, 4, this.elite ? '#b8bec6' : BONE, { speed: 2.5, size: 0.05, floor: 0 });
    if (s.hp <= 0) {
      s.state = 'dying';
      s.t = 0;
      s.bar.group.visible = false;
      return { dealt, killed: true };
    }
    // caught early in its wind-up, the blow is spoiled
    const A = this.kind.attack;
    if (s.state === 'attack' && s.t / A.time < A.hit * 0.7) { s.state = 'hurt'; s.t = 0; }
    else if (s.state !== 'attack') { s.state = 'hurt'; s.t = 0; }
    s.hurt = 1;
    s.seen = 6;
    return { dealt, killed: false };
  }

  /**
   * hooks: hitPlayer(damage, from), playerAlive(), onDeath(s, at)
   */
  update(dt, player, hooks) {
    this.time += dt;
    const K = this.kind, A = K.attack, arena = this.arena;
    const P = player.pos;
    const playerSafe = !hooks.playerAlive() || arena.playerSafe(P);

    for (let i = this.waiting.length - 1; i >= 0; i--) {
      if ((this.waiting[i] -= dt) > 0) continue;
      this.waiting.splice(i, 1);
      this.spawn(P, true);
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.t += dt;
      s.cooldown -= dt;
      s.hurt = Math.max(0, s.hurt - dt * 4);
      s.seen = Math.max(0, s.seen - dt);
      let want = null, speed = 0;
      const dx = P.x - s.pos.x, dz = P.z - s.pos.z;
      const dist = Math.hypot(dx, dz);
      const faceP = Math.atan2(dx, dz);

      switch (s.state) {
        case 'rise': {
          const k = clamp01(s.t / 1.1);
          s.group.position.y = -1.9 * (1 - k) * (1 - k);
          if (Math.random() < dt * 10) this.fx.dust(new Vector3(s.pos.x, 0.05, s.pos.z), 1, { size: 0.5 });
          if (k >= 1) { s.state = 'wander'; s.t = 0; s.group.position.y = 0; }
          break;
        }
        case 'wander': {
          if (!playerSafe && dist < K.aggro && arena.sees(s.pos, P)) { s.state = 'chase'; s.t = 0; s.seen = 6; break; }
          if (s.idle > 0) { s.idle -= dt; break; }
          if (!s.wanderTo) s.wanderTo = arena.wanderPoint(s.pos, this.rng);
          const wx = s.wanderTo.x - s.pos.x, wz = s.wanderTo.z - s.pos.z;
          if (Math.hypot(wx, wz) < 0.6 || s.t > 9) { s.wanderTo = null; s.idle = 1 + this.rng() * 2.5; s.t = 0; break; }
          want = arena.steer(s.pos, s.wanderTo);
          speed = K.wander;
          break;
        }
        case 'chase': {
          if (playerSafe || dist > K.leash) { s.state = 'wander'; s.wanderTo = null; s.t = 0; break; }
          if (dist < K.reach && s.cooldown <= 0) { s.state = 'attack'; s.t = 0; s.struck = false; break; }
          want = dist > K.reach * 0.8 ? arena.steer(s.pos, P) : null;
          speed = K.speed;
          s.yaw = dampAngle(s.yaw, faceP, 8, dt);
          break;
        }
        case 'attack': {
          const k = s.t / A.time;
          // it keeps turning to follow you, but slowly: you can step round it
          if (k < A.hit) s.yaw = dampAngle(s.yaw, faceP, 3.2, dt);
          if (!s.struck && k >= A.hit) {
            s.struck = true;
            const off = Math.abs(angleDelta(s.yaw, faceP));
            if (dist < K.reach + 0.5 && off < 1.15 && hooks.playerAlive()) hooks.hitPlayer(K.damage, s.pos);
          }
          if (k >= 1) { s.state = playerSafe ? 'wander' : 'chase'; s.t = 0; s.cooldown = K.cooldown; }
          break;
        }
        case 'hurt': {
          if (s.t > (this.elite ? 0.22 : 0.28)) { s.state = 'chase'; s.t = 0; }
          break;
        }
        case 'dying': {
          if (s.t > 0.6) {
            this._crumble(s);
            hooks.onDeath(s, new Vector3(s.pos.x, 0.5, s.pos.z));
            this.list.splice(i, 1);
            const [lo, hi] = K.respawn;
            this.waiting.push(lo + this.rng() * (hi - lo));
            continue;
          }
          break;
        }
        default: break;
      }

      // move: what it wants, plus whatever knocked it back, fading
      const ax = want ? want.x * speed : 0, az = want ? want.z * speed : 0;
      if (want) s.yaw = dampAngle(s.yaw, Math.atan2(want.x, want.z), s.state === 'chase' ? 6 : 4, dt);
      s.vel.multiplyScalar(Math.exp(-dt * 7));
      const before = { x: s.pos.x, z: s.pos.z };
      s.pos.x += (ax + s.vel.x) * dt;
      s.pos.z += (az + s.vel.z) * dt;
      if (s.state !== 'rise') arena.keepIn(s.pos, s.radius);
      s.speed = Math.hypot(s.pos.x - before.x, s.pos.z - before.z) / Math.max(dt, 1e-4);

      // the pose
      const swing = s.state === 'attack' ? { kind: A.kind, t: s.t / A.time } : null;
      const dead = s.state === 'dying' ? clamp01(s.t / 0.55) : 0;
      s.rig.update(dt, { speed: s.state === 'attack' ? 0 : s.speed, swing, hurt: s.hurt, dead });
      // its eyes flare as the blow winds up
      if (s.rig.eyeMat) {
        const k = s.state === 'attack' && s.t / A.time < A.hit ? (s.t / A.time) / A.hit : 0;
        if (this.elite) s.rig.eyeMat.emissive.setRGB(0.2 + k * 0.6, 0.55 + k * 0.3, 1);
        else s.rig.eyeMat.emissive.setRGB(1, 0.16 + k * 0.5, k * 0.2);
      }
      s.group.position.x = s.pos.x;
      s.group.position.z = s.pos.z;
      s.rig.root.rotation.y = s.yaw;
      s.bar.group.visible = s.state !== 'dying' && (s.hp < s.maxHp || s.state === 'attack');
    }

    // they keep out of each other's way, and out of yours
    const L = this.list;
    for (let a = 0; a < L.length; a++) {
      for (let b = a + 1; b < L.length; b++) separate(L[a].pos, L[b].pos, 0.85, 0.5);
      if (L[a].state !== 'dying' && L[a].state !== 'rise' && hooks.playerAlive()) separate(P, L[a].pos, 0.76, 0.85);
    }
  }

  /** Falls to pieces, its iron with it. */
  _crumble(s) {
    const at = new Vector3(s.pos.x, 0.6, s.pos.z);
    this.fx.debris(at, 18, BONE, { speed: 3, size: 0.09 });
    this.fx.debris(at, 4, this.elite ? '#8a9098' : '#c8a070', { speed: 2, size: this.elite ? 0.1 : 0.07 });
    this.fx.dust(at, 6, { size: 0.6, color: new Color('#a89c8c') });
    s.group.removeFromParent();
    s.rig.dispose();
    s.bar.dispose();
    s.state = 'gone';
  }

  /** As if you had never been here: a fresh pack, nobody waiting. */
  reset(player = null) {
    for (const s of this.list) { s.group.removeFromParent(); s.rig.dispose(); s.bar.dispose(); }
    this.list.length = 0;
    this.waiting.length = 0;
    this.populate(player);
  }

  dispose() {
    for (const s of this.list) { s.group.removeFromParent(); s.rig.dispose(); s.bar.dispose(); }
    this.list.length = 0;
  }
}

function separate(a, b, min, bShare) {
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
  if (d >= min || d < 1e-5) return;
  const push = min - d;
  b.x += (dx / d) * push * bShare; b.z += (dz / d) * push * bShare;
  a.x -= (dx / d) * push * (1 - bShare); a.z -= (dz / d) * push * (1 - bShare);
}

/** Does the segment a-b pass within `r` of (cx, cz)? */
export function segmentHitsCircle(a, b, r, cx = 0, cz = 0) {
  const ax = a.x - cx, az = a.z - cz;
  const dx = b.x - a.x, dz = b.z - a.z;
  const l2 = dx * dx + dz * dz || 1e-9;
  const t = Math.min(1, Math.max(0, -(ax * dx + az * dz) / l2));
  const px = ax + dx * t, pz = az + dz * t;
  return px * px + pz * pz < r * r;
}

export const BONES_ONE_IN = ORES.bones.oneIn;
