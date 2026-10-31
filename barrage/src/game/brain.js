/* =============================================================================
   How the box ragdolls fight.

   They come out of their tunnel, find you, and spread out around you. Only a
   few may close in and swing at once - the director hands out turns - and
   the rest circle at a distance, shuffling and waiting, taunting when you
   go down. Whoever has a turn squares up at the distance their jab or kick
   actually reaches (measured from the animation), throws lefts and rights,
   sometimes in quick pairs, mixes in kicks, and raises a guard when you
   swing at them. Shield bearers come in behind their shields. Swordsmen
   swing.

   Gunners keep their distance instead, line up a shot - the red line from
   their barrel - and fire a few rounds, and anyone standing in the way
   catches them. Get close and they use their fists.

   The rig, the jab and the reach measurements come from OVERGROWTH's brain.
   ========================================================================== */
import { Vector3, Quaternion } from 'three';
import { forwardKinematics, NP, P } from './rig.js';
import {
  makePose, poseQuats, makeQuats, JAB_L, JAB_R, SWING_L, SWING_R, KICK, TAUNT, WAVE, RUN_SPEED,
} from './anim.js';
import { R } from './arena.js';
import { rand, chance, clamp, wrapAngle } from '../core/util.js';

/** How far in front of the root the striking part's centre gets, at the height of a clip. */
function reach(clip, t, part) {
  const pose = makePose(), q = makeQuats();
  const pos = [], quat = [];
  for (let i = 0; i < NP; i++) { pos.push(new Vector3()); quat.push(new Quaternion()); }
  clip.sample(t, pose);
  poseQuats(pose, q);
  forwardKinematics(new Vector3(), new Quaternion(), pose.off, q, pos, quat);
  return pos[part].z;
}

/** Root-to-root distances at which a jab and a kick land. */
export const FIST_RANGE = reach(JAB_L, 0.17, P.handL) + 0.1;
export const KICK_RANGE = reach(KICK, 0.23, P.footR) + 0.05;

const _to = new Vector3(), _s = new Vector3(), _aim = new Vector3(), _at = new Vector3();

/* -------------------------------------------------------------------------- */
/*                                   enemies                                  */
/* -------------------------------------------------------------------------- */

const ROLES = {
  brawler: { kick: 0.2, block: 0.22, combo: 0.35, aggr: 1 },
  swordsman: { kick: 0.12, block: 0.18, combo: 0.25, aggr: 0.95 },
  shield: { kick: 0.2, block: 0.7, combo: 0.2, aggr: 0.8 },
  gunner: { kick: 0.35, block: 0.1, combo: 0.2, aggr: 0.8 },
  champion: { kick: 0.3, block: 0.35, combo: 0.45, aggr: 1.15 },
  red: { kick: 0.25, block: 0.2, combo: 0.45, aggr: 1 },
  blue: { kick: 0.25, block: 0.2, combo: 0.45, aggr: 1 },
};

export class Brain {
  /** skill 0..1: reaction, accuracy and nerve, rising with the waves. */
  constructor(f, role, skill = 0.3) {
    this.f = f;
    this.game = f.game;
    this.role = role;
    this.R = ROLES[role] || ROLES.brawler;
    this.skill = skill;
    this.gunner = role === 'gunner';
    this.target = null;
    this.thinkT = rand(0, 0.3);
    this.cool = rand(1.0, 1.8);
    this.aggr = this.R.aggr * rand(0.85, 1.1) * (0.85 + skill * 0.4);
    this.nerve = rand(0.3, 1);
    this.side = chance(0.5) ? 1 : -1;
    this.combo = 0;
    this.strafeDir = chance(0.5) ? 1 : -1;
    this.strafeT = rand(0.6, 2);
    this.strafing = true;
    this.slot = rand(-Math.PI, Math.PI);   // where around the target to wait
    this.slotDrift = rand(-0.25, 0.25);
    this.retreatT = 0;
    this.blockT = 0;
    this.tauntT = rand(2, 5);
    this.headAim = rand(0.35, 0.75);
    this.turn = false;                     // may it close in and attack (the director says)
    // gunners: a cycle of moving, lining up, firing and cooling off
    this.gun = { state: 'move', t: rand(1.2, 2.6), shots: 0 };
  }

  onHit(attacker) {
    if (attacker && this.game.foes(this.f, attacker)) this.target = attacker;
    if (this.f.health < this.f.maxHealth * 0.3 && this.nerve < 0.45 && chance(0.35)) this.retreatT = rand(1, 2);
    // hit while lining up a shot: start again
    if (this.gunner && this.gun.state === 'aim') { this.gun.state = 'cool'; this.gun.t = rand(0.5, 1); }
  }

  recovered() {
    this.cool = Math.max(this.cool, rand(0.2, 0.5));
  }

  choose() {
    const h = this.f, g = this.game;
    let best = null, bs = Infinity;
    for (const o of g.fighters) {
      if (o === h || o.removed || !o.alive || !g.foes(h, o)) continue;
      let s = Math.hypot(o.root.x - h.root.x, o.root.z - h.root.z);
      if (!o.upright) s += 3;
      if (o === this.target) s -= 1;
      if (s < bs) { bs = s; best = o; }
    }
    this.target = best;
  }

  update(dt) {
    const h = this.f, g = this.game;
    this.thinkT -= dt; this.cool -= dt; this.strafeT -= dt; this.retreatT -= dt; this.blockT -= dt; this.tauntT -= dt;
    if (this.thinkT <= 0) { this.thinkT = rand(0.25, 0.5); this.choose(); }
    h.move.set(0, 0, 0);
    h.face = null;
    h.combat = false;
    h.wantAim = false;
    if (h.action && h.action.clip.kind === 'emote') return;

    // still in the tunnel: out through the gate first
    const r = Math.hypot(h.root.x, h.root.z);
    if (this.gate && r < R - 1) this.gate = null;
    if (this.gate) {
      if (!g.arena.gateOpen(this.gate.id)) { h.face = Math.atan2(-h.root.x, -h.root.z); return; }
      const m = this.gate.mouth;
      _to.set(m.x - h.root.x, 0, m.z - h.root.z);
      const d = _to.length();
      if (d > 0.05) h.move.copy(_to).multiplyScalar(2.6 / d);
      this.avoid();
      return;
    }

    const t = this.target;
    if (!t || t.removed || !t.alive) {
      this.target = null;
      h.wantBlock = false;
      return;
    }
    const to = _to.set(t.root.x - h.root.x, 0, t.root.z - h.root.z);
    const d = Math.max(0.001, to.length());
    to.multiplyScalar(1 / d);
    h.face = Math.atan2(to.x, to.z);
    h.combat = d < 6;

    if (this.gunner && d > 2.6) { this.shoot(dt, t, to, d); this.avoid(); return; }

    // the target is down: wait, and maybe show off
    if (!t.upright || t.upTime < 0.45) {
      h.wantBlock = false;
      const want = 2.4;
      if (d < want) h.move.copy(to).multiplyScalar(-1.1);
      else if (d > want + 1.5) h.move.copy(to).multiplyScalar(1.6);
      if (this.tauntT <= 0 && h.canAct() && d < 6) {
        this.tauntT = rand(4, 8);
        if (chance(0.5)) { h.play(TAUNT); g.emit('taunt', h); }
      }
      this.avoid();
      return;
    }

    const weapon = h.weapon;
    const range = weapon ? weapon.range : FIST_RANGE;
    const may = this.turn;

    /* ------------------------------- guard ------------------------------ */
    const threat = t.action && t.action.clip.active && !t.action.back && d < 2.6;
    if (threat && this.blockT <= 0 && h.canAct() && chance(this.R.block * (0.6 + this.skill * 0.8) * dt * 20)) {
      this.blockT = rand(0.45, 0.85);
    }
    // shield bearers walk in behind the shield
    const shieldUp = h.shield && d > range + 0.5 && d < 6 && !may;
    h.wantBlock = (this.blockT > 0 || shieldUp) && !h.winded;

    /* ------------------------------ moving ------------------------------ */
    if (this.retreatT > 0) {
      h.move.copy(to).multiplyScalar(-1.4);
    } else if (!may) {
      // wait your turn on the ring around the target
      this.slot += this.slotDrift * dt;
      const ring = 2.9 + (this.role === 'gunner' ? 1.5 : 0);
      const sx = t.root.x + Math.sin(this.slot) * ring, sz = t.root.z + Math.cos(this.slot) * ring;
      _s.set(sx - h.root.x, 0, sz - h.root.z);
      const sd = _s.length();
      if (sd > 0.3) h.move.copy(_s).multiplyScalar(Math.min(sd > 3 ? 3.2 : 1.6, sd * 2) / sd);
      if (d < 2.2) h.move.addScaledVector(to, -1.2);
      if (this.tauntT <= 0 && h.canAct() && d > 2.4 && chance(0.25)) {
        this.tauntT = rand(5, 10);
        h.play(TAUNT);
        g.emit('taunt', h);
      }
    } else {
      const want = range;
      if (d > want + 0.28) {
        const sp = d > 5 ? RUN_SPEED : d > 2.2 ? 2.6 : clamp((d - want) * 3, 0.6, 1.6);
        h.move.copy(to).multiplyScalar(sp);
      } else if (d < want - 0.22) {
        h.move.copy(to).multiplyScalar(-1.1);
      } else {
        if (this.strafeT <= 0) {
          this.strafeT = rand(0.7, 2.2);
          this.strafing = chance(0.6);
          if (chance(0.5)) this.strafeDir *= -1;
        }
        if (this.strafing) h.move.set(-to.z * this.strafeDir, 0, to.x * this.strafeDir).multiplyScalar(0.55);
        h.move.addScaledVector(to, (d - want) * 2.5);
      }
    }
    this.avoid();

    /* ------------------------------ attack ------------------------------ */
    if (!may || !h.canAct() || this.cool > 0 || this.retreatT > 0 || this.blockT > 0.15) return;
    if (Math.abs(wrapAngle(h.face - h.heading)) > 0.4) return;
    // two or three closing in still take turns to swing: just after one starts, the others hold
    if (t.swungBy && t.swungBy !== h && g.time - t.swungAt < 0.95 - this.skill * 0.4) return;
    // a kick reaches further than a jab
    if (!weapon && d > FIST_RANGE + 0.15 && d < KICK_RANGE + 0.15 && chance(this.R.kick)) {
      h.wantBlock = false;
      this.strike(t, KICK);
      this.cool = rand(0.95, 1.6) / this.aggr;
      return;
    }
    if (d > range + 0.3) return;
    h.wantBlock = false;
    if (weapon) {
      const clip = this.side > 0 ? SWING_L : SWING_R;
      this.side = -this.side;
      this.strike(t, clip, 0, weapon.type.rate);
      h.vel.addScaledVector(to, 0.9);
      this.cool = rand(0.85, 1.5) / this.aggr;
      return;
    }
    if (d < FIST_RANGE && chance(this.R.kick * 0.4)) {
      this.strike(t, KICK);
      this.cool = rand(0.95, 1.6) / this.aggr;
      return;
    }
    // jabs: left and right, sometimes in quick pairs
    const head = chance(this.headAim);
    const aimAt = head ? t.head.x.y : t.chest.x.y;
    const shoulder = h.chest.x.y + 0.06;
    let aim = Math.atan2(aimAt - shoulder, Math.max(0.3, d)) * 180 / Math.PI + 4;
    aim = clamp(aim, -30, 34);
    // a gunner keeps the pistol hand back and jabs with the left
    const clip = this.gunner || this.side > 0 ? JAB_L : JAB_R;
    this.side = -this.side;
    this.strike(t, clip, aim);
    h.vel.addScaledVector(to, 1.3);
    if (this.combo > 0) { this.combo--; this.cool = rand(0.14, 0.24); }
    else {
      // combinations come more often as the waves go on
      this.combo = chance(this.R.combo * this.aggr * (0.5 + this.skill * 0.5)) ? 1 + (chance(0.25) ? 1 : 0) : 0;
      this.cool = this.combo > 0 ? rand(0.14, 0.24) : rand(0.95, 1.7) / this.aggr;
    }
  }

  /** Starts a blow at t, and lets anyone else after t know whose turn it is. */
  strike(t, clip, aim = 0, rate = 1) {
    this.f.play(clip, aim, rate);
    t.swungBy = this.f;
    t.swungAt = this.game.time;
  }

  /** The gunner's cycle: keep the range, line it up, fire, cool off. */
  shoot(dt, t, to, d) {
    const h = this.f, g = this.game, s = this.gun;
    h.wantBlock = false;
    s.t -= dt;
    if (s.state === 'move' || s.state === 'cool') {
      g.guns.laser(h, false);
      if (d < 5.5) h.move.copy(to).multiplyScalar(-2.2);
      else if (d > 9.5) h.move.copy(to).multiplyScalar(2.4);
      else {
        if (this.strafeT <= 0) { this.strafeT = rand(1, 2.5); this.strafeDir *= -1; }
        h.move.set(-to.z * this.strafeDir, 0, to.x * this.strafeDir).multiplyScalar(1.1);
      }
      if (s.t <= 0 && h.canAct() && t.upright) {
        s.state = 'aim';
        s.t = 1.15 - this.skill * 0.35;
        s.shots = 1 + (chance(0.3 + this.skill * 0.4) ? 1 : 0) + (chance(this.skill * 0.4) ? 1 : 0);
      }
      return;
    }
    // aiming and firing: stand still, gun out
    h.wantAim = true;
    h.combat = true;
    if (!t.upright) { s.state = 'cool'; s.t = rand(0.6, 1.2); g.guns.laser(h, false); return; }
    g.guns.laser(h, s.state === 'aim' && h.aimW > 0.6);
    if (s.state === 'aim') {
      if (s.t <= 0 && h.aimW > 0.85) { s.state = 'fire'; s.t = 0; }
      return;
    }
    if (s.t <= 0) {
      // at the chest, a little off, less so as the waves go on
      _at.copy(t.chest.x);
      g.guns.fire(h, g.guns.aim(h, _at, 0.06 - this.skill * 0.03, _aim), 9 * h.power);
      s.shots--;
      s.t = 0.32;
      if (s.shots <= 0) { s.state = 'cool'; s.t = rand(1.6, 2.8) - this.skill * 0.6; g.guns.laser(h, false); }
    }
  }

  /** Don't walk into your friends. */
  avoid() {
    const h = this.f, g = this.game;
    for (const o of g.fighters) {
      if (o === h || o.removed || !o.upright) continue;
      const dx = h.root.x - o.root.x, dz = h.root.z - o.root.z;
      const dd = dx * dx + dz * dz;
      const friend = !g.foes(h, o);
      const r = friend ? 1.1 : 0.55;
      if (dd > r * r || dd < 1e-6) continue;
      const dist = Math.sqrt(dd);
      const k = (r - dist) / r * (friend ? 2.2 : 3);
      h.move.x += (dx / dist) * k;
      h.move.z += (dz / dist) * k;
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                                the shopkeeper                              */
/* -------------------------------------------------------------------------- */

export class Keeper {
  constructor(f, home) {
    this.f = f;
    this.home = home.clone();
    this.near = false;
    this.cool = 0;
  }

  update(dt) {
    const h = this.f, p = h.game.player;
    h.move.set(0, 0, 0);
    h.root.x = this.home.x; h.root.z = this.home.z;
    this.cool -= dt;
    let face = Math.PI;
    if (p && p.alive) {
      const dx = p.root.x - h.root.x, dz = p.root.z - h.root.z;
      const d = Math.hypot(dx, dz);
      if (d < 9) face = Math.PI + clamp(wrapAngle(Math.atan2(dx, dz) - Math.PI), -0.9, 0.9);
      const near = d < 5.5;
      if (near && !this.near && this.cool <= 0 && h.canAct()) { h.play(WAVE); this.cool = 12; h.game.emit('greet', h); }
      this.near = near;
    }
    h.face = face;
  }
}
