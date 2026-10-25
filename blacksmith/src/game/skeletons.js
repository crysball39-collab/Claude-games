/* =============================================================================
   The skeletons. There are always three in the cave, each with a wooden
   dagger. They wander the ring until they see you, then come at you and stab
   - with a wind-up you can see coming, and dash out of. Killed, they fall
   apart, sometimes leaving their bones behind, and a few seconds later
   another one claws its way up out of the floor somewhere else.

   They never set foot in Rob's camp or the tunnel: that is where you go to
   catch your breath.
   ========================================================================== */
import { Group, Vector3, Color } from 'three';
import { Rig, dressSkeleton } from './character.js';
import { buildWoodenDagger } from './gear.js';
import { Bar3D } from './fx.js';
import { SKELETON, ORES } from './data.js';
import { CV } from './cave.js';
import { angleDelta, dampAngle, clamp, clamp01, makeRng } from '../core/util.js';

const STAB_TIME = 0.95;          // the whole stab, wind-up to recovery
const STAB_HIT = 0.62;           // the point in it where the dagger lands
const BONE = '#e6dcc4';

export class SkeletonPack {
  constructor({ scene, collider, spots, fx, inCamp }) {
    this.scene = scene;
    this.collider = collider;
    this.spots = spots;
    this.fx = fx;
    this.inCamp = inCamp;
    this.rng = makeRng(1313);
    this.list = [];
    this.waiting = [];           // respawn timers
    this.time = 0;
    this._v = new Vector3();
  }

  populate(avoid = null) {
    for (let i = 0; i < SKELETON.count; i++) this.spawn(avoid, false);
  }

  /** Somewhere on the far side of the ring, and not on top of you. */
  _spot(avoid) {
    const far = this.spots.filter((s) => !avoid || Math.hypot(s.x - avoid.x, s.z - avoid.z) > 10);
    const pool = far.length ? far : this.spots;
    return pool[Math.floor(this.rng() * pool.length)];
  }

  spawn(avoid = null, rise = true) {
    const s = this._spot(avoid);
    const rig = dressSkeleton(new Rig()).bake();
    rig.joints.grip.add(buildWoodenDagger());
    const group = new Group();
    group.add(rig.root);
    const bar = new Bar3D(0.8, 0.09, '#e8463a');
    bar.group.position.y = 2.2;
    group.add(bar.group);
    group.position.set(s.x, rise ? -1.9 : 0, s.z);
    this.scene.add(group);
    const sk = {
      rig, group, bar,
      pos: new Vector3(s.x, 0, s.z), vel: new Vector3(), yaw: this.rng() * Math.PI * 2,
      hp: SKELETON.hp, maxHp: SKELETON.hp, radius: SKELETON.radius,
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

  /** Damage from you. Returns true if that killed it. */
  hit(s, damage, from) {
    if (!s || s.state === 'dying' || s.state === 'gone') return false;
    s.hp -= damage;
    s.rig.flash(0.12);
    s.bar.group.visible = true;
    s.bar.set(s.hp / s.maxHp);
    const dx = s.pos.x - from.x, dz = s.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
    s.vel.x += (dx / d) * 4.5; s.vel.z += (dz / d) * 4.5;
    const at = new Vector3(s.pos.x, 1.2, s.pos.z);
    this.fx.debris(at, 4, BONE, { speed: 2.5, size: 0.05, floor: 0 });
    if (s.hp <= 0) {
      s.state = 'dying';
      s.t = 0;
      s.bar.group.visible = false;
      return true;
    }
    // caught early in its wind-up, the stab is spoiled
    if (s.state === 'attack' && s.t < STAB_HIT * 0.7) { s.state = 'hurt'; s.t = 0; }
    else if (s.state !== 'attack') { s.state = 'hurt'; s.t = 0; }
    s.hurt = 1;
    s.seen = 6;
    return false;
  }

  /**
   * hooks: hitPlayer(damage, from) -> bool, playerAlive, onDeath(s, at)
   */
  update(dt, player, hooks) {
    this.time += dt;
    const P = player.pos;
    const playerSafe = !hooks.playerAlive() || this.inCamp(P.x, P.z, 0.5) || P.z > CV.rOut - 1.4 && Math.abs(P.x) < CV.tunnel.half;

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
          if (!playerSafe && dist < SKELETON.aggro && this._sees(s.pos, P)) { s.state = 'chase'; s.t = 0; s.seen = 6; break; }
          if (s.idle > 0) { s.idle -= dt; break; }
          if (!s.wanderTo) s.wanderTo = this._wanderPoint(s.pos);
          const wx = s.wanderTo.x - s.pos.x, wz = s.wanderTo.z - s.pos.z;
          if (Math.hypot(wx, wz) < 0.6 || s.t > 9) { s.wanderTo = null; s.idle = 1 + this.rng() * 2.5; s.t = 0; break; }
          want = this._steer(s.pos, s.wanderTo);
          speed = SKELETON.wander;
          break;
        }
        case 'chase': {
          if (playerSafe || dist > SKELETON.leash) { s.state = 'wander'; s.wanderTo = null; s.t = 0; break; }
          if (dist < SKELETON.reach && s.cooldown <= 0) { s.state = 'attack'; s.t = 0; s.struck = false; break; }
          want = dist > SKELETON.reach * 0.8 ? this._steer(s.pos, P) : null;
          speed = SKELETON.speed;
          s.yaw = dampAngle(s.yaw, faceP, 8, dt);
          break;
        }
        case 'attack': {
          const k = s.t / STAB_TIME;
          // it keeps turning to follow you, but slowly: you can step round it
          if (k < STAB_HIT) s.yaw = dampAngle(s.yaw, faceP, 3.2, dt);
          if (!s.struck && k >= STAB_HIT) {
            s.struck = true;
            const off = Math.abs(angleDelta(s.yaw, faceP));
            if (dist < SKELETON.reach + 0.5 && off < 1.15 && hooks.playerAlive()) {
              hooks.hitPlayer(SKELETON.damage, s.pos);
            }
          }
          if (k >= 1) { s.state = playerSafe ? 'wander' : 'chase'; s.t = 0; s.cooldown = SKELETON.cooldown; }
          break;
        }
        case 'hurt': {
          if (s.t > 0.28) { s.state = 'chase'; s.t = 0; }
          break;
        }
        case 'dying': {
          if (s.t > 0.6) {
            this._crumble(s);
            hooks.onDeath(s, new Vector3(s.pos.x, 0.5, s.pos.z));
            this.list.splice(i, 1);
            const [lo, hi] = SKELETON.respawn;
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
      const nx = s.pos.x + (ax + s.vel.x) * dt, nz = s.pos.z + (az + s.vel.z) * dt;
      const before = { x: s.pos.x, z: s.pos.z };
      s.pos.x = nx; s.pos.z = nz;
      if (s.state !== 'rise') this._keepIn(s);
      s.speed = Math.hypot(s.pos.x - before.x, s.pos.z - before.z) / Math.max(dt, 1e-4);

      // the pose
      const swing = s.state === 'attack' ? { kind: 'skel', t: s.t / STAB_TIME } : null;
      const dead = s.state === 'dying' ? clamp01(s.t / 0.55) : 0;
      s.rig.update(dt, { speed: s.state === 'attack' ? 0 : s.speed, swing, hurt: s.hurt, dead });
      // its eyes flare as the stab winds up
      if (s.rig.eyeMat) {
        const k = s.state === 'attack' && s.t / STAB_TIME < STAB_HIT ? (s.t / STAB_TIME) / STAB_HIT : 0;
        s.rig.eyeMat.emissive.setRGB(1, 0.16 + k * 0.5, k * 0.2);
      }
      s.group.position.x = s.pos.x;
      s.group.position.z = s.pos.z;
      s.rig.root.rotation.y = s.yaw;
      s.bar.group.visible = s.state !== 'dying' && (s.hp < s.maxHp || s.state === 'attack');
    }

    // they keep out of each other's way, and out of yours
    const L = this.list;
    for (let a = 0; a < L.length; a++) {
      for (let b = a + 1; b < L.length; b++) this._separate(L[a].pos, L[b].pos, 0.85, 0.5);
      if (L[a].state !== 'dying' && L[a].state !== 'rise' && hooks.playerAlive()) {
        this._separate(P, L[a].pos, 0.76, 0.85);
      }
    }
  }

  _separate(a, b, min, bShare) {
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d >= min || d < 1e-5) return;
    const push = min - d;
    b.x += (dx / d) * push * bShare; b.z += (dz / d) * push * bShare;
    a.x -= (dx / d) * push * (1 - bShare); a.z -= (dz / d) * push * (1 - bShare);
  }

  /** In the ring, out of the walls and rocks, out of the camp, out of the tunnel. */
  _keepIn(s) {
    this.collider.resolve(s.pos, s.radius);
    const d = Math.hypot(s.pos.x, s.pos.z) || 1;
    const lim = CV.outLimit - s.radius - 0.1;
    if (d > lim) { s.pos.x *= lim / d; s.pos.z *= lim / d; }
    const c = CV.camp;
    const cx = s.pos.x - c.x, cz = s.pos.z - c.z, cd = Math.hypot(cx, cz) || 1;
    if (cd < c.r) { s.pos.x = c.x + (cx / cd) * c.r; s.pos.z = c.z + (cz / cd) * c.r; }
  }

  /** Can it see you, or is the wall in the middle between you? */
  _sees(a, b) {
    return !segmentHitsCircle(a, b, CV.inLimit - 0.3);
  }

  /** Toward `to`, going round the wall in the middle when it is in the way. */
  _steer(from, to) {
    const dx = to.x - from.x, dz = to.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    if (!segmentHitsCircle(from, to, CV.inLimit + 0.4)) return { x: dx / d, z: dz / d };
    const r = Math.hypot(from.x, from.z) || 1;
    const ox = from.x / r, oz = from.z / r;
    let tx = -oz, tz = ox;
    if (tx * dx + tz * dz < 0) { tx = -tx; tz = -tz; }
    const x = tx + ox * 0.2, z = tz + oz * 0.2, l = Math.hypot(x, z);
    return { x: x / l, z: z / l };
  }

  _wanderPoint(from) {
    for (let k = 0; k < 12; k++) {
      const phi = Math.atan2(from.x, from.z) + (this.rng() - 0.5) * 1.4;
      const d = CV.inLimit + 1.5 + this.rng() * (CV.outLimit - CV.inLimit - 3);
      const x = Math.sin(phi) * d, z = Math.cos(phi) * d;
      if (!this.inCamp(x, z, 1)) return { x, z };
    }
    return { x: from.x, z: from.z };
  }

  /** Falls to pieces. */
  _crumble(s) {
    const at = new Vector3(s.pos.x, 0.6, s.pos.z);
    this.fx.debris(at, 18, BONE, { speed: 3, size: 0.09 });
    this.fx.debris(at, 4, '#c8a070', { speed: 2, size: 0.07 });
    this.fx.dust(at, 6, { size: 0.6, color: new Color('#a89c8c') });
    s.group.removeFromParent();
    s.rig.dispose();
    s.bar.dispose();
    s.state = 'gone';
  }

  /** As if you had never been here: three fresh ones, nobody waiting. */
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

/** Does the segment a-b pass within `r` of the origin? */
function segmentHitsCircle(a, b, r) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const l2 = dx * dx + dz * dz || 1e-9;
  const t = clamp(-(a.x * dx + a.z * dz) / l2, 0, 1);
  const px = a.x + dx * t, pz = a.z + dz * t;
  return px * px + pz * pz < r * r;
}

export const BONES_ONE_IN = ORES.bones.oneIn;
