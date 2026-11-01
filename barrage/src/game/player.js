/* =============================================================================
   You.

   The stick moves you relative to the camera. PUNCH throws a left and a
   right in turn - or, with a sword in the weapon slot, swings it forehand
   and backhand; with a bow, and an arrow for it, draws and looses at the
   nearest box ragdoll in front of you - and KICK drives a front kick. Both
   turn you onto the
   nearest box ragdoll in front of you first, so you do not have to aim on a
   phone. BLOCK is held: forearms up, or the shield if one is on your left
   arm. SPRINT and CROUCH are switches; JUMP is a jump. Everything but
   walking costs stamina, and with none left you are winded: no attacks and
   no sprinting until you have caught your breath.

   A press that lands while you are still finishing a move is remembered
   for a moment, so a quick double tap comes out as a combination.
   ========================================================================== */
import { Vector3 } from 'three';
import { JAB_L, JAB_R, SWING_L, SWING_R, KICK } from './anim.js';
import { FIST_RANGE } from './brain.js';
import { clamp, wrapAngle } from '../core/util.js';

export const WALK = 2.7;
export const SPRINT = 5.4;
const COST = { punch: 5, kick: 10, claw: 6, shot: 4 };
const _to = new Vector3();

export class Player {
  constructor(f, input) {
    this.f = f;
    this.game = f.game;
    this.input = input;
    this.side = 1;
    this.buffer = null;
    this.sprintOn = false;
    this.stillT = 0;
    this.lastAttack = -9;
    this.enabled = true;
    this.draw = null;               // drawing the bow: { t, foe }
    this.after = 0;                 // the bow held up a moment after the arrow is away
  }

  onHit() {}
  recovered() {}

  /** The box ragdoll you most likely mean: close, and in front of where you are going or looking. */
  target(maxD = 3.4) {
    const f = this.f, g = this.game;
    const fx = Math.sin(f.heading), fz = Math.cos(f.heading);
    let best = null, bs = Infinity;
    for (const o of g.fighters) {
      if (o === f || o.removed || !o.alive || !g.foes(f, o)) continue;
      const dx = o.root.x - f.root.x, dz = o.root.z - f.root.z;
      const d = Math.hypot(dx, dz);
      if (d > maxD) continue;
      const ahead = (dx * fx + dz * fz) / (d || 1);
      const s = d - ahead * 1.2 + (o.upright ? 0 : 1.5);
      if (s < bs) { bs = s; best = o; }
    }
    return best;
  }

  update(dt) {
    const f = this.f, inp = this.input, g = this.game;
    f.move.set(0, 0, 0);
    if (!this.enabled) { f.wantBlock = false; f.combat = false; f.wantAim = false; this.draw = null; this.sprintOn = false; f.sprinting = false; return; }

    /* ----------------------------- switches ----------------------------- */
    if (inp.pressed('sprint')) { this.sprintOn = !this.sprintOn; this.sprintMoved = false; if (this.sprintOn) f.wantCrouch = false; }
    if (inp.pressed('crouch')) { f.wantCrouch = !f.wantCrouch; if (f.wantCrouch) this.sprintOn = false; }
    f.wantBlock = inp.held('block');
    if (inp.pressed('jump')) {
      f.wantCrouch = false;
      if (!f.jump() && f.state === 'active' && !f.air) g.emit('tired', f);
    }

    /* ------------------------------ moving ------------------------------ */
    const ax = inp.moveAxes();
    const mag = Math.min(1, Math.hypot(ax.x, ax.y));
    const yaw = g.cam.yaw;
    // the camera looks along (-sin yaw, -cos yaw)
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let dx = fx * ax.y + rx * ax.x, dz = fz * ax.y + rz * ax.x;
    const dl = Math.hypot(dx, dz);
    this.stillT = mag < 0.15 ? this.stillT + dt : 0;
    // the switch stays on until you stop running
    if (this.sprintOn && mag > 0.3) this.sprintMoved = true;
    if (this.sprintMoved && this.stillT > 0.6) this.sprintOn = false;
    let sprint = (this.sprintOn || inp.sprintKey) && mag > 0.3 && f.crouch < 0.5 && !f.wantBlock && !f.air;
    if (sprint && !f.spend(14 * dt)) { sprint = false; this.sprintOn = false; g.emit('tired', f); }
    f.sprinting = sprint;
    if (dl > 0.01 && mag > 0.08) {
      const fast = f.speedMul * (f.morph ? f.morph.kind.speed : 1);
      const speed = (sprint ? SPRINT : WALK * clamp(mag * 1.15, 0.35, 1)) * fast;
      f.move.set(dx / dl * speed, 0, dz / dl * speed);
    }

    /* ----------------------------- fighting ----------------------------- */
    const foe = this.target();
    const recent = g.time - this.lastAttack < 1.2;
    f.combat = !!foe && !sprint && (recent || f.wantBlock || Math.hypot(foe.root.x - f.root.x, foe.root.z - f.root.z) < 2.6);
    f.face = null;
    if (foe && (f.wantBlock || f.action || recent) && !sprint) {
      f.face = Math.atan2(foe.root.x - f.root.x, foe.root.z - f.root.z);
    }

    // a morph's own moves (read either way, so a press made before does not go off later)
    const surge = inp.pressed('surge'), eat = inp.pressed('eat'), impale = inp.pressed('impale');
    if (f.morph && ((surge && f.morph.surge()) || (eat && f.morph.eat()) || (impale && f.morph.impale()))) this.lastAttack = g.time;
    // drawing the bow: hold it on them, and loose once it is drawn
    if (this.draw) this.drawing(dt);
    else if (this.after > 0) { this.after -= dt; f.wantAim = this.after > 0; }
    if (inp.pressed('punch')) this.buffer = { type: 'punch', t: 0.35 };
    if (inp.pressed('kick')) this.buffer = { type: 'kick', t: 0.35 };
    // a button held down keeps attacking, as long as there is breath for it
    if (!this.buffer && f.canAct() && !f.winded && !this.draw) {
      if (inp.held('punch')) this.buffer = { type: 'punch', t: 0.1 };
      else if (inp.held('kick')) this.buffer = { type: 'kick', t: 0.1 };
    }
    if (this.buffer) {
      this.buffer.t -= dt;
      if (this.buffer.t <= 0) this.buffer = null;
      else if (f.canAct() && !this.draw) {
        const type = this.buffer.type;
        this.buffer = null;
        this.attack(type, foe);
      }
    }
  }

  /** The bow coming up and back, then the arrow away at whoever you meant. */
  drawing(dt) {
    const f = this.f, d = this.draw;
    d.t += dt;
    f.wantAim = true;
    if (!d.foe || d.foe.removed || !d.foe.alive) d.foe = this.target(12);
    if (d.foe) f.face = Math.atan2(d.foe.root.x - f.root.x, d.foe.root.z - f.root.z);
    if (f.state !== 'active' || !f.weapon || !f.weapon.isBow) { this.draw = null; f.wantAim = false; return; }
    if (d.t >= f.weapon.type.arrow.draw / f.quick && f.aimW > 0.8) {
      f.shoot(d.foe ? d.foe.chest.x : null, 0.008);
      this.lastAttack = this.game.time;
      this.draw = null;
      this.after = 0.18;            // a moment with the bow still up
    }
  }

  attack(type, foe) {
    const f = this.f, g = this.game;
    const weapon = f.weapon;
    const claws = f.morph && f.morph.claws && type === 'punch';
    // a bow with an arrow for it shoots; out of arrows, you punch
    const bow = !claws && type === 'punch' && weapon && weapon.isBow;
    if (bow && !f.hasArrow()) g.emit('noArrows', f);
    const shoot = bow && f.hasArrow();
    const sword = weapon && weapon.isSword ? weapon : null;
    const cost = type === 'kick' ? COST.kick : claws ? COST.claw : shoot ? COST.shot : sword ? sword.type.cost : COST.punch;
    if (!f.spend(cost)) { g.emit('tired', f); return false; }
    this.lastAttack = g.time;
    f.wantCrouch = false;
    let d = 9;
    if (foe) {
      _to.set(foe.root.x - f.root.x, 0, foe.root.z - f.root.z);
      d = _to.length();
      if (d > 0.01) {
        _to.multiplyScalar(1 / d);
        // square up to them at once: a swing that starts facing the wrong way never lands
        const want = Math.atan2(_to.x, _to.z);
        if (Math.abs(wrapAngle(want - f.heading)) < 2.2) f.heading = want;
        f.face = want;
      }
    } else {
      _to.set(Math.sin(f.heading), 0, Math.cos(f.heading));
    }
    if (type === 'kick') {
      f.play(KICK);
      if (foe && d > 1.25) f.vel.addScaledVector(_to, 1.2);
      return true;
    }
    if (claws) {
      // claws rake across, the way a sword swings
      const clip = this.side > 0 ? SWING_R : SWING_L;
      this.side = -this.side;
      f.play(clip, 0, 1.35);
      if (foe && d > 0.7 * f.scale) f.vel.addScaledVector(_to, 2.4);
      return true;
    }
    if (shoot) {
      this.draw = { t: 0, foe: foe || this.target(12) };
      return true;
    }
    if (sword) {
      const clip = this.side > 0 ? SWING_R : SWING_L;
      this.side = -this.side;
      f.play(clip, 0, sword.type.rate);
      if (foe && d > sword.range) f.vel.addScaledVector(_to, 1.4);
      return true;
    }
    // jabs: aimed at the head of whoever is in front
    let aim = 4;
    if (foe) {
      const shoulder = f.chest.x.y + 0.06;
      aim = clamp(Math.atan2(foe.head.x.y - shoulder, Math.max(0.3, d)) * 180 / Math.PI + 4, -30, 34);
    }
    const clip = this.side > 0 ? JAB_L : JAB_R;
    this.side = -this.side;
    f.play(clip, aim);
    if (foe && d > FIST_RANGE - 0.1) f.vel.addScaledVector(_to, 1.5);
    return true;
  }
}
