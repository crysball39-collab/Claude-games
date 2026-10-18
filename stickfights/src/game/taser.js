/* =============================================================================
   The taser.

   It is aimed and fired like a pistol, but what comes out is a pair of barbed
   probes on thin wires. If both land in somebody - and do not stop in a vest
   - five seconds of current go down the wires, and every muscle they have
   locks up at once: they go rigid, topple over like a plank, and lie there
   shaking and yelling until it stops. Then they are dazed for a little while
   longer, which is when an officer gets the cuffs on.

   One cartridge in it, two spares. While the probes are still in someone and
   the wires are whole, pulling the trigger again gives them another five
   seconds. Out of cartridges, it still works pressed against somebody (a
   drive stun): it hurts like anything and takes the fight out of them, but
   it does not put them down.

   A taser lying on the floor fires when tapped, the way a pistol does.
   ========================================================================== */
import { Body } from '../physics/rigid.js';
import { defineArm } from './props.js';
import { heldGunFrame, gunPoint, drawTaserShape, TASER_W, TASER_H, TASER_GRIP, TASER_MUZZLE } from './draw.js';
import { clamp, rand, chance, sign } from '../core/util.js';

export const RIDE = 5;           // seconds of current a trigger pull gives
const SPEED = 24;                // how fast the probes fly, m/s (slowed down from life, to be seen)
const REACH = 7;                 // how far the wires run out
const SPREAD = 0.13;             // how far apart the two probes go, radians

// the drive stun: what a taser pressed against someone does, as a blow
defineArm('taserZap', {
  name: 'Taser', noun: 'taser', cause: 'a taser', shove: 0.35, nasty: 1.6, scary: 0.3, fear: 'taserFear',
  memory: 'tasedMe', hurt: 'driveStunned', verb: 'zapped me with a taser', power: 1.3, mult: 0.7,
});

let nextId = 1;

export const TASER_SPEC = {
  name: 'Taser', a: 'a', mag: 1, spare: 2, energy: 0, cadence: 0.6, kick: 0.45, round: 'cartridge',
  w: TASER_W, h: TASER_H, mass: 0.5, grip: TASER_GRIP, muzzle: TASER_MUZZLE, port: TASER_MUZZLE,
};

export class Taser {
  constructor(sandbox, x, y, rot = 0) {
    this.id = 'tz' + nextId++;
    this.kind = 'taser';
    this.name = 'Taser';
    this.spec = TASER_SPEC;
    this.sandbox = sandbox;
    this.body = new Body(TASER_W, TASER_H * 0.7, 0.5, {
      x, y, rot, owner: this, friction: 0.55, restitution: 0.2, angularDamping: 0.6,
    });
    sandbox.phys.add(this.body);
    this.inWorld = true;
    this.wornBy = null;
    this.cart = true;        // a cartridge in it, not yet fired
    this.spare = 2;
    this.lastShot = -99;
    this.shot = null;        // the probes and wires out of the last cartridge, while there are any
    this.blood = 0;
    this.thrownBy = null;
    this.thrownAt = -99;
    this.lastSound = -99;
    this.removed = false;
  }

  get pos() { return this.wornBy ? this.wornBy.wj.handA : this.body.pos; }
  get loose() { return !this.wornBy && !this.removed; }
  /** Shots left: the cartridge in it and the spares (what the brain asks a gun for). */
  get ammo() { return (this.cart ? 1 : 0) + this.spare; }
  get mag() { return this.cart ? 1 : 0; }
  /** The probes are in someone and the wires are whole: the trigger can give them another ride. */
  get hooked() { return !!(this.shot && this.shot.target && this.shot.live); }
  /** The probes still on their way: no reloading now, or the wires go with the cartridge. */
  get flying() { return !!(this.shot && this.shot.live && this.shot.darts.some((d) => !d.done)); }
  get short() { return Math.max(0, 2 - this.spare) + (this.cart ? 0 : 1); }
  canReload() { return !this.cart && this.spare > 0; }

  wear(by) {
    this.wornBy = by;
    if (this.inWorld) { this.sandbox.phys.remove(this.body); this.inWorld = false; }
  }

  drop(x, y, vx = 0, vy = 0) {
    this.wornBy = null;
    const b = this.body;
    b.pos.x = x; b.pos.y = y;
    b.vel.x = vx; b.vel.y = vy;
    b.rot = Math.random() * Math.PI * 2;
    b.angVel = (Math.random() - 0.5) * 9;
    if (!this.inWorld) { this.sandbox.phys.add(b); this.inWorld = true; }
  }

  /** A fresh cartridge on the front, the old wires let go. */
  reload() {
    if (this.cart || this.spare <= 0) return false;
    this.spare--;
    this.cart = true;
    if (this.shot) this.shot.cut();
    return true;
  }

  /** Where the probes come out, and the way it points: in a hand, or lying loose. */
  muzzle() {
    const m = this.wornBy;
    if (m) {
      const fr = heldGunFrame(m.wj, m.scale, m.facing, TASER_GRIP);
      const p = gunPoint(fr, TASER_MUZZLE.x, TASER_MUZZLE.y);
      return { x: p.x, y: p.y, a: fr.a };
    }
    const p = this.body.toWorld(TASER_MUZZLE.x, TASER_MUZZLE.y);
    return { x: p.x, y: p.y, a: this.body.rot };
  }

  /**
   * The trigger, from the hand of `man`: a cartridge fires its probes; with
   * the probes already in someone, it gives them another ride; with neither,
   * it just clicks and crackles.
   */
  fire(man) {
    const sb = this.sandbox, now = sb.time;
    if (now - this.lastShot < this.spec.cadence) return false;
    if (!this.cart && this.hooked) {
      this.lastShot = now;
      this.shot.cycle();
      return true;
    }
    if (!this.cart) {
      this.lastShot = now;
      const m = this.muzzle();
      sb.emit('taserArc', { who: man, x: m.x, y: m.y });
      sb.fx.sparks(m.x, m.y, 3);
      return false;
    }
    const m = this.muzzle();
    const tp = man.aimPoint();
    let a = m.a;
    if (tp && man.steady > 0.3) a = Math.atan2(tp.y - m.y, tp.x - m.x);
    a += (Math.random() + Math.random() + Math.random() - 1.5) * man.spread() * 0.8;
    this.launch(man, m.x, m.y, a, man.aimTarget && man.aimTarget.kind === 'stickman' ? man.aimTarget : null);
    man.recoil = this.spec.kick;
    man.lastShotT = now;
    return true;
  }

  /** Fired lying loose (tapped by the hand): off it goes the way it points. */
  fireLoose(sb) {
    if (!this.cart) {
      if (this.hooked) { this.shot.cycle(); return 'Another five seconds down the wires'; }
      if (this.reload()) return `A fresh cartridge on: ${this.spare} left`;
      sb.emit('taserArc', { who: null, x: this.body.pos.x, y: this.body.pos.y });
      return 'No cartridges left';
    }
    const m = this.muzzle();
    this.launch(null, m.x, m.y, m.a + rand(-0.02, 0.02), null);
    this.body.applyImpulse(-Math.cos(m.a) * 0.6, 0.4, m.x, m.y);
    return 'Pop! The probes are out';
  }

  launch(by, x, y, a, target) {
    const sb = this.sandbox;
    this.cart = false;
    this.lastShot = sb.time;
    if (this.shot) this.shot.cut();
    this.shot = new TaserShot(sb, this, by, x, y, a, target);
    sb.effects.push(this.shot);
    sb.fx.flash(x, y, a, 0.45);
    sb.emit('taserFire', { who: by, x, y, target });
  }

  describe(p) {
    const hand = p && p.weapon === this;
    const state = this.cart ? 'loaded' : this.hooked ? 'probes in ' + this.shot.target.name : 'spent';
    return `${hand ? 'Holding' : 'Carrying'} a taser (${state}, ${this.spare} spare cartridge${this.spare === 1 ? '' : 's'})`;
  }

  /** In the hand: drawn like a pistol, held the same way. */
  drawHeld(ctx, j, s, f) {
    const g = heldGunFrame(j, s, f, TASER_GRIP);
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.a);
    ctx.scale(1, f);
    drawTaserShape(ctx, s, this.cart);
    ctx.restore();
  }

  draw(ctx) {
    const b = this.body;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(b.rot);
    drawTaserShape(ctx, 1, this.cart);
    ctx.restore();
  }
}

/**
 * Two probes out of a cartridge, on their wires. They fly, drop a little,
 * and stick in whatever they hit first - a person (unless a vest stops it),
 * a crate, the floor. With both in one person the current goes through
 * them. The wires break if whoever holds the taser gets too far away.
 */
class TaserShot {
  constructor(sb, taser, by, x, y, a, aimed) {
    this.sandbox = sb;
    this.taser = taser;
    this.by = by;
    this.aimed = aimed;
    this.live = true;
    this.t = 0;
    this.ride = 0;              // seconds of current left
    this.target = null;
    this.sparkT = 0;
    this.darts = [-1, 1].map((k) => {
      const da = a + k * SPREAD * 0.5 - SPREAD * 0.25;
      return { x, y, vx: Math.cos(da) * SPEED, vy: Math.sin(da) * SPEED, stuck: null, out: 0, done: false };
    });
  }

  /** Whoever's the probes are in, while they stay in. */
  get inPerson() { return this.darts.filter((d) => d.stuck && d.stuck.person); }

  update(dt, sb) {
    this.t += dt;
    if (!this.live) return false;
    const m = this.taser.removed ? null : this.taser.muzzle();
    for (const d of this.darts) {
      if (d.done) {
        if (d.stuck && d.stuck.person) {
          const p = d.stuck.person;
          if (p.removed) { d.stuck = null; continue; }
          const q = p.bonePoint(d.stuck.bone, d.stuck.t);
          d.x = q.x; d.y = q.y;
        }
        continue;
      }
      const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt;
      d.vy -= 3 * dt;
      d.out += Math.hypot(nx - d.x, ny - d.y);
      let hit = null;
      for (const q of sb.people) {
        if (q.removed || q === this.by) continue;
        const h = q.touch(nx, ny, 0.025) || q.touch((d.x + nx) / 2, (d.y + ny) / 2, 0.025);
        if (h) { hit = { q, h }; break; }
      }
      if (hit) {
        const { q, h } = hit;
        // a vest stops most of what hits the body
        if (h.part === 'torso' && q.vest && q.vest.condition > 0.1 && chance(0.7)) {
          d.done = true;
          d.vx = d.vy = 0;
          sb.fx.sparks(h.x, h.y, 2);
          sb.emit('probeBlocked', { who: q, x: h.x, y: h.y });
        } else {
          d.done = true;
          d.stuck = { person: q, bone: h.bone, t: h.t };
          d.x = h.x; d.y = h.y;
          sb.emit('probeHit', { who: q, by: this.by, x: h.x, y: h.y });
        }
        continue;
      }
      if (ny <= 0.01 || d.out > REACH || sb.crateAt(nx, ny) || nx < sb.left || nx > sb.right) {
        d.done = true;
        d.x = clamp(nx, sb.left, sb.right);
        d.y = Math.max(0.005, ny);
        d.stuck = { floor: true };
        continue;
      }
      d.x = nx; d.y = ny;
    }
    // both in the one person: the current goes through them
    if (!this.target && this.darts.every((d) => d.done)) {
      const ps = this.inPerson;
      const who = ps.length ? ps[0].stuck.person : null;
      const both = who && ps.length === 2 && ps[1].stuck.person === who;
      // one in them and the other just in their clothes, close enough: half the time it still works
      if (who && (both || chance(0.45))) { this.target = who; this.cycle(); }
      else if (who) sb.emit('probeMiss', { who, by: this.by });
      else sb.emit('probeMiss', { who: null, by: this.by });
    }
    if (this.target && this.ride > 0) {
      this.ride -= dt;
      const p = this.target;
      if (p.removed || p.dead) this.ride = 0;
      else if ((this.sparkT -= dt) <= 0) {
        this.sparkT = 0.09;
        for (const d of this.inPerson) sb.fx.sparks(d.x, d.y, 1);
        sb.emit('taserTick', { who: p, x: p.wj.chest.x, y: p.wj.chest.y });
      }
    }
    // a wire runs out, or whoever holds it walks off: it parts
    if (m) {
      for (const d of this.darts) {
        if (Math.hypot(d.x - m.x, d.y - m.y) > REACH + 1.2) { this.cut(); break; }
      }
    }
    if (this.taser.removed || this.t > 40) this.cut();
    // probes in the floor, or nobody to hold on to any more: gone after a while
    if (this.t > 8 && (!this.target || this.target.removed || !this.inPerson.length)) this.cut();
    return this.live;
  }

  /** Another ride down the wires, if the probes are still in someone. */
  cycle() {
    const p = this.target;
    if (!p || p.removed || !this.live || !this.inPerson.length) return false;
    this.ride = RIDE;
    zap(p, this.by, RIDE);
    return true;
  }

  /** The wires let go: the probes stay where they were, and that is the end of it. */
  cut() {
    if (!this.live) return;
    this.live = false;
    this.ride = 0;
    if (this.target && this.target.tased && this.target.tased.shot === this) this.target.tased.t = Math.max(this.target.tased.t, this.target.tased.dur - 0.3);
    if (this.taser.shot === this) this.taser.shot = null;
  }

  draw(ctx) {
    if (!this.live) return;
    const m = this.taser.removed ? null : this.taser.muzzle();
    ctx.lineCap = 'round';
    for (const d of this.darts) {
      if (m) {
        // the wire: thin, sagging a little between the taser and the probe
        const mx = (m.x + d.x) / 2, my = (m.y + d.y) / 2 - Math.min(0.35, Math.hypot(d.x - m.x, d.y - m.y) * 0.06);
        ctx.strokeStyle = 'rgba(40, 40, 40, 0.85)';
        ctx.lineWidth = 0.007;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.quadraticCurveTo(mx, my, d.x, d.y);
        ctx.stroke();
      }
      ctx.fillStyle = '#c9ced3';
      ctx.beginPath();
      ctx.arc(d.x, d.y, 0.012, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.ride > 0) {
      // the current: a jagged blue-white flicker along the body between the probes
      const ds = this.inPerson;
      if (ds.length === 2) {
        ctx.strokeStyle = `rgba(170, 215, 255, ${0.5 + Math.random() * 0.5})`;
        ctx.lineWidth = 0.012;
        ctx.beginPath();
        ctx.moveTo(ds[0].x, ds[0].y);
        for (let i = 1; i < 5; i++) {
          const k = i / 5;
          ctx.lineTo(ds[0].x + (ds[1].x - ds[0].x) * k + rand(-0.04, 0.04), ds[0].y + (ds[1].y - ds[0].y) * k + rand(-0.04, 0.04));
        }
        ctx.lineTo(ds[1].x, ds[1].y);
        ctx.stroke();
      }
    }
  }
}

/**
 * Current through someone, for `secs`: every muscle locks. They drop what
 * they are holding and go over stiff as a board, shaking, and stay down
 * until it stops - and a little longer. Something a mod makes may take it
 * differently (its species' zap: false to shrug it off).
 */
export function zap(man, by = null, secs = RIDE) {
  if (!man || man.removed || man.dead) return false;
  if (man.species && man.species.zap && man.species.zap(man, by, secs) === false) return false;
  const sb = man.sandbox;
  man.health.pain = Math.min(130, man.health.pain + 45);
  if (man.steadfast) return false;
  const fresh = !man.tased;
  man.tased = { by, t: 0, dur: secs, shot: by && by.weapon && by.weapon.shot ? by.weapon.shot : null };
  man.stamina = 0;
  man.strike = null;
  man.blocking = false;
  man.dropCarried();
  if (man.weapon) man.dropWeapon(0.8);
  man.lastHit = { by, t: sb.time, part: 'torso', power: 1, kind: 'tased', blocked: false, object: null, weapon: 'taser' };
  man.hurtT = sb.time;
  if (man.state !== 'held' && man.state !== 'dead') {
    if (man.ragdolls) {
      if (!man.rag) man.goLimp({ state: 'thrown', tone: 0.9, after: 'down', dir: by ? sign(man.pos.x - by.pos.x) : 0, shove: 0.2 });
      else if (man.state === 'down' || man.state === 'ko') man.setState('thrown');
    } else if (man.state !== 'down' && man.state !== 'ko') {
      man.knockDown(by ? sign(man.pos.x - by.pos.x) : 0, 0.4);
    }
  }
  man.downT = Math.max(man.downT || 0, secs + rand(1.4, 2.6));
  if (fresh) {
    sb.emit('tased', { who: man, by, x: man.wj.chest.x, y: man.wj.chest.y });
    man.notify('tased', { by });
  }
  return true;
}

/** Every step while the current is on: the body shakes and stays locked; then it lets go. */
export function updateTased(man, dt) {
  const z = man.tased;
  if (!z) return;
  z.t += dt;
  if (man.dead || man.removed) { man.tased = null; return; }
  man.stamina = 0;
  man.health.pain = Math.max(man.health.pain, 70);
  if (man.rag && chance(dt * 30)) {
    const j = man.wj;
    const pick = ['handA', 'handB', 'footA', 'footB', 'head'][Math.floor(Math.random() * 5)];
    man.rag.shove(j[pick].x, j[pick].y, rand(-0.6, 0.6), rand(-0.2, 0.5), 0.2);
  }
  // stiff as a board on the floor: the shaking does not walk them anywhere
  if (man.rag && man.wj.hip.y < 0.45 && z.t > 0.6) {
    const k = Math.min(1, dt * 12);
    for (const q of man.rag.p) q.px += (q.x - q.px) * k;
  }
  if (z.t >= z.dur) {
    man.tased = null;
    man.downT = Math.max(man.downT || 0, rand(1.2, 2.4));
    man.notify('tasedEnd', { by: z.by });
    man.sandbox.emit('tasedEnd', { who: man, by: z.by });
  }
}
