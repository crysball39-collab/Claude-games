/* =============================================================================
   What a person decides to do.

   Pick the nearest enemy still on their feet (with a bias toward whoever hit
   you last, and away from someone already being mobbed), close the distance,
   square up at the range the jab actually reaches, circle a little, and
   throw. Pick up a weapon on the way if one is lying closer than the fight.
   Stay away from the edge of the platform.
   ========================================================================== */
import { Vector3, Quaternion } from 'three';
import { forwardKinematics, NP, P } from './rig.js';
import {
  makePose, poseQuats, makeQuats, JAB_L, JAB_R, SWING_L, SWING_R, PICKUP, RUN_SPEED,
} from './anim.js';
import { rand, chance, clamp, wrapAngle } from '../core/util.js';

/** How far in front of the root a fully extended jab puts the fist's centre. */
export const JAB_REACH = (() => {
  const pose = makePose(), q = makeQuats();
  const pos = [], quat = [];
  for (let i = 0; i < NP; i++) { pos.push(new Vector3()); quat.push(new Quaternion()); }
  JAB_L.sample(0.17, pose);
  poseQuats(pose, q);
  forwardKinematics(new Vector3(), new Quaternion(), pose.off, q, pos, quat);
  return pos[P.handL].z;
})();

/** Root-to-root distance a fighter wants: a fist's length past the face. */
export const FIST_RANGE = JAB_REACH + 0.1;

const _to = new Vector3(), _s = new Vector3();

export class Brain {
  constructor(h) {
    this.h = h;
    this.target = null;
    this.thinkT = rand(0, 0.3);
    this.cool = rand(0.4, 1.2);
    this.aggr = rand(0.6, 1.05);
    this.nerve = rand(0.2, 1);
    this.strafeDir = chance(0.5) ? 1 : -1;
    this.strafeT = rand(0.6, 2);
    this.strafing = true;
    this.side = chance(0.5) ? 1 : -1;
    this.combo = 0;
    this.weapon = null;
    this.grudge = null;
    this.grudgeT = 0;
    this.retreatT = 0;
    this.headAim = rand(0.35, 0.8);   // how often it goes for the head
    this.wander = null;
    this.wanderT = rand(1, 4);
  }

  onHit(attacker) {
    this.grudge = attacker;
    this.grudgeT = 5;
    if (this.h.health < 35 && this.nerve < 0.45 && chance(0.4)) this.retreatT = rand(1.2, 2.5);
  }

  recovered() {
    this.cool = Math.max(this.cool, rand(0.15, 0.45));
  }

  choose() {
    const h = this.h, g = h.game;
    let best = null, bs = Infinity;
    for (const o of g.humans) {
      if (o === h || o.removed || !o.alive || o.team === h.team) continue;
      let s = Math.hypot(o.root.x - h.root.x, o.root.z - h.root.z);
      if (!o.upright) s += 4;
      if (o === this.grudge && this.grudgeT > 0) s -= 2.5;
      if (o === this.target) s -= 0.8;
      let mob = 0;
      for (const a of g.humans) if (a !== h && a.alive && a.brain.target === o && a.team === h.team) mob++;
      s += mob * 1.1;
      if (s < bs) { bs = s; best = o; }
    }
    this.target = best;

    if (!h.holding && !this.weapon) {
      let w = null, wd = 9;
      for (const p of g.props) {
        if (!p.weapon || p.holder || p.removed) continue;
        // someone else is already going for it (if they still are)
        const c = p.claimedBy;
        if (c && c !== h && !c.removed && c.alive && c.brain.weapon === p) continue;
        if (p.body.x.y < g.groundAt(p.body.x.x, p.body.x.z) - 0.3) continue;
        const d = Math.hypot(p.body.x.x - h.root.x, p.body.x.z - h.root.z);
        if (d < wd) { wd = d; w = p; }
      }
      const td = best ? Math.hypot(best.root.x - h.root.x, best.root.z - h.root.z) : Infinity;
      if (w && (wd + 1.2 < td || td > 3.5)) { this.weapon = w; w.claimedBy = h; }
    }
  }

  dropClaim() {
    if (this.weapon && this.weapon.claimedBy === this.h) this.weapon.claimedBy = null;
    this.weapon = null;
  }

  update(dt) {
    const h = this.h, g = h.game;
    this.thinkT -= dt; this.cool -= dt; this.grudgeT -= dt; this.strafeT -= dt; this.retreatT -= dt;
    if (this.thinkT <= 0) { this.thinkT = rand(0.25, 0.5); this.choose(); }
    h.move.set(0, 0, 0);
    h.face = null;
    h.combat = false;
    if (h.action && h.action.clip === PICKUP) return;

    /* ------------------------- go and get a weapon ------------------------ */
    const w = this.weapon;
    if (w) {
      if (w.removed || w.holder || h.holding) this.dropClaim();
      else {
        const to = _to.set(w.body.x.x - h.root.x, 0, w.body.x.z - h.root.z);
        const d = to.length();
        if (d > 12) { this.dropClaim(); }
        else {
          // stand so the weapon is just in front of the right hand
          h.face = Math.atan2(to.x, to.z);
          if (d < 0.62) {
            if (h.canAct() && Math.abs(wrapAngle(h.face - h.heading)) < 0.5) h.play(PICKUP);
          } else {
            to.multiplyScalar(1 / d);
            const sp = d > 4 ? RUN_SPEED : clamp(d * 1.2, 0.8, 2.2);
            h.move.copy(to).multiplyScalar(sp);
            this.avoid(dt);
          }
          return;
        }
      }
    }

    /* ------------------------------- fight -------------------------------- */
    const t = this.target;
    if (!t || t.removed || !t.alive) {
      this.target = null;
      this.idle(dt);
      return;
    }
    const to = _to.set(t.root.x - h.root.x, 0, t.root.z - h.root.z);
    const d = Math.max(0.001, to.length());
    to.multiplyScalar(1 / d);
    h.face = Math.atan2(to.x, to.z);
    h.combat = d < 4.5;
    const range = h.holding ? h.holding.range : FIST_RANGE;
    const want = t.upright ? range : range + 0.7;

    if (this.retreatT > 0) {
      h.move.copy(to).multiplyScalar(-1.3);
    } else if (d > want + 0.28) {
      const sp = d > 5 ? RUN_SPEED : d > 2.2 ? 2.6 : clamp((d - want) * 3, 0.6, 1.6);
      h.move.copy(to).multiplyScalar(sp);
    } else if (d < want - 0.22) {
      h.move.copy(to).multiplyScalar(-1.1);
    } else {
      if (this.strafeT <= 0) {
        this.strafeT = rand(0.7, 2.2);
        this.strafing = chance(0.65);
        if (chance(0.5)) this.strafeDir *= -1;
      }
      if (this.strafing) {
        h.move.set(-to.z * this.strafeDir, 0, to.x * this.strafeDir).multiplyScalar(0.55);
      }
      h.move.addScaledVector(to, (d - want) * 2.5);
    }
    this.avoid(dt);

    /* ------------------------------- attack ------------------------------- */
    if (!h.canAct() || this.cool > 0 || !t.upright || this.retreatT > 0) return;
    if (d > want + 0.3) return;
    if (Math.abs(wrapAngle(h.face - h.heading)) > 0.35) return;
    if (h.holding) {
      const clip = this.side > 0 ? SWING_L : SWING_R;
      this.side = -this.side;
      h.play(clip, 0);
      h.vel.addScaledVector(to, 0.9);
      this.cool = rand(0.55, 1.1) / this.aggr;
      return;
    }
    // jabs: left and right, sometimes in quick pairs
    const head = chance(this.headAim);
    const aimAt = head ? t.head.x.y : t.bodies[P.upperTorso].x.y;
    const shoulder = h.bodies[P.upperTorso].x.y + 0.06;
    let aim = Math.atan2(aimAt - shoulder, Math.max(0.3, d)) * 180 / Math.PI + 4;
    aim = clamp(aim, -30, 34);
    const clip = this.side > 0 ? JAB_L : JAB_R;
    this.side = -this.side;
    h.play(clip, aim);
    // step into it
    h.vel.addScaledVector(to, 1.3);
    if (this.combo > 0) { this.combo--; this.cool = rand(0.1, 0.2); }
    else {
      this.combo = chance(0.45 * this.aggr) ? 1 + (chance(0.3) ? 1 : 0) : 0;
      this.cool = this.combo > 0 ? rand(0.1, 0.2) : rand(0.4, 1.0) / this.aggr;
    }
  }

  idle(dt) {
    const h = this.h;
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = rand(2, 5);
      this.wander = chance(0.5) ? null : new Vector3(h.root.x + rand(-4, 4), 0, h.root.z + rand(-4, 4));
    }
    if (this.wander) {
      const to = _to.set(this.wander.x - h.root.x, 0, this.wander.z - h.root.z);
      const d = to.length();
      if (d < 0.4) this.wander = null;
      else h.move.copy(to).multiplyScalar(1.1 / d);
    }
    this.avoid(dt);
  }

  /** Don't walk off the platform; don't walk into your friends. */
  avoid() {
    const h = this.h, g = h.game;
    const e = g.edgeDistance(h.root.x, h.root.z);
    if (e < 3) {
      const k = (3 - e) * 1.5;
      _s.set(-h.root.x, 0, -h.root.z).normalize().multiplyScalar(k);
      h.move.add(_s);
      // never step toward the edge when already close
      if (e < 1.2) {
        const out = _s.set(h.root.x, 0, h.root.z).normalize();
        const v = h.move.dot(out);
        if (v > 0) h.move.addScaledVector(out, -v * 1.2);
      }
    }
    for (const o of g.humans) {
      if (o === h || o.removed || !o.upright) continue;
      const dx = h.root.x - o.root.x, dz = h.root.z - o.root.z;
      const dd = dx * dx + dz * dz;
      const r = o.team === h.team ? 1.1 : 0.55;
      if (dd > r * r || dd < 1e-6) continue;
      const dist = Math.sqrt(dd);
      const k = (r - dist) / r * (o.team === h.team ? 2.2 : 3);
      h.move.x += (dx / dist) * k;
      h.move.z += (dz / dist) * k;
    }
  }
}
