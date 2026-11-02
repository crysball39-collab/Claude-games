/* =============================================================================
   Explosives that can be put down, picked up and thrown - and wait to be set
   off (the explode tool sets one off where it is tapped; these are things):

     Grenade   tap it and the pin comes out, and the lever flies off: four
               seconds later it goes off, its casing flying. Throw it with the
               hand in the meantime.
     C4        a block of it with a detonator on top. It sticks to whatever
               it lands on - a wall, a crate, somebody - and tapped, it beeps,
               faster and faster, and goes, harder than anything but a bomb.
     TNT       three sticks taped together with a fuse. Tapped, the fuse is
               lit and fizzes down; somebody on fire coming near lights it too.
     Missile   tapped, its motor lights and it goes the way it points,
               straight, trailing fire and smoke, until its nose meets
               something - somebody, a wall, the ground - and it goes off.

   Any of them caught in a blast goes off too, a moment later: one set off
   among the rest sets them all off. They live in sandbox.items, like a mod's
   things, so the hand, the wires, the freeze tool and the eraser all work on
   them as they do on anything else.
   ========================================================================== */
import { Body } from '../physics/rigid.js';
import { explode } from './explode.js';
import { clamp, rand, chance, TAU } from '../core/util.js';

/** What each looks like and weighs: size (m), mass (kg), how it bounces. */
const SIZE = {
  grenade: { w: 0.1, h: 0.13, mass: 0.4, bounce: 0.3 },
  c4: { w: 0.24, h: 0.09, mass: 0.7, bounce: 0.05 },
  tnt: { w: 0.24, h: 0.2, mass: 1.2, bounce: 0.1 },
  missile: { w: 1.2, h: 0.17, mass: 16, bounce: 0.05 },
};
/** How long each takes, from being set off to going off (s). */
const FUSE = { grenade: 4, c4: 3, tnt: 3.6 };

class Explosive {
  constructor(sb, kind, name, x, y, o = {}) {
    const S = SIZE[kind];
    this.kind = kind;
    this.name = name;
    this.sandbox = sb;
    this.removed = false;
    this.body = new Body(S.w, S.h, S.mass, { x, y, rot: o.rot || 0, owner: this, friction: 0.6, restitution: S.bounce, angularDamping: 0.6 });
    sb.phys.add(this.body);
    this.inWorld = true;
    this.lit = false;           // set off, and counting down
    this.left = 0;              // how long it has left
    this.t = 0;
    this.by = null;
  }

  get pos() { return this.body.pos; }
  get loose() { return !this.removed && this.inWorld; }
  contains(x, y, r) { return this.body.contains(x, y, r * 0.6 + 0.06); }
  leave(sb) { if (this.inWorld) { sb.phys.remove(this.body); this.inWorld = false; } }

  /** Set off: counting down from `t`. */
  light(t, by = null) {
    if (this.lit) { this.left = Math.min(this.left, t); return false; }
    this.lit = true;
    this.left = t;
    this.by = by;
    return true;
  }

  /** Caught in a blast: it goes off too, in a moment. */
  chain() { this.light(rand(0.08, 0.25)); }

  /** Off, where it is. */
  detonate(kind = this.kind) {
    if (this.removed) return;
    const sb = this.sandbox, p = this.pos, by = this.by;
    sb.remove(this, { quiet: true });
    explode(sb, p.x, p.y, kind, by);
  }

  update(dt, sb) {
    this.t += dt;
    if (!this.lit) return;
    this.left -= dt;
    if (this.left <= 0) this.detonate();
  }
}

/* ---------------------------------- grenade ---------------------------------- */

export class Grenade extends Explosive {
  constructor(sb, x, y) {
    super(sb, 'grenade', 'Grenade', x, y, { rot: rand(-0.4, 0.4) });
  }

  tap(sb) {
    if (this.lit) return 'The pin is out. Get rid of it!';
    this.light(FUSE.grenade);
    const p = this.pos;
    // the lever flies off
    sb.fx.bits(p.x, p.y + 0.05, 1, '#6f7a50', rand(-1.5, 1.5), rand(2, 3.5), { size: 0.035 });
    sb.emit('pinPulled', { what: this, x: p.x, y: p.y });
    return 'Pin out: four seconds. Throw it!';
  }

  draw(ctx) {
    const b = this.body;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(b.rot);
    drawGrenadeShape(ctx, !this.lit);
    ctx.restore();
  }
}

/** A grenade, centred on the origin, upright: the pin and lever on, unless it has been pulled. */
export function drawGrenadeShape(ctx, pin = true) {
  // the body: olive, ribbed
  ctx.fillStyle = '#5d6b3a';
  ctx.strokeStyle = '#2b3219';
  ctx.lineWidth = 0.008;
  ctx.beginPath();
  ctx.ellipse(0, -0.012, 0.047, 0.055, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(30, 36, 16, 0.6)';
  ctx.lineWidth = 0.005;
  ctx.beginPath();
  for (const y of [-0.04, -0.012, 0.016]) { ctx.moveTo(-0.044, y); ctx.lineTo(0.044, y); }
  ctx.moveTo(0, -0.066); ctx.lineTo(0, 0.04);
  ctx.stroke();
  // the fuse on top
  ctx.fillStyle = '#8a8f93';
  ctx.fillRect(-0.016, 0.038, 0.032, 0.026);
  if (pin) {
    // the lever down the side, and the ring
    ctx.strokeStyle = '#8a8f93';
    ctx.lineWidth = 0.008;
    ctx.beginPath();
    ctx.moveTo(0.012, 0.062); ctx.lineTo(0.05, 0.05); ctx.lineTo(0.055, -0.02);
    ctx.stroke();
    ctx.strokeStyle = '#c9b25a';
    ctx.lineWidth = 0.005;
    ctx.beginPath();
    ctx.arc(-0.032, 0.058, 0.016, 0, TAU);
    ctx.stroke();
  }
}

/* ------------------------------------ C4 ------------------------------------ */

export class C4 extends Explosive {
  constructor(sb, x, y) {
    super(sb, 'c4', 'C4', x, y);
    this.on = null;             // what it is stuck to: { t, lx, ly, rot } (a body's frame) or { man, joint, dx, dy }
    this.beepT = 0;
  }

  tap(sb) {
    if (this.lit) return 'It is going to go!';
    this.light(FUSE.c4);
    sb.emit('c4Beep', { what: this, x: this.pos.x, y: this.pos.y, k: 0 });
    return 'Armed: three seconds.';
  }

  update(dt, sb) {
    // stuck to something: wherever that is - or let go, if it has gone
    if (this.on) this.follow(sb);
    else if (this.t > 0.15) this.stickTo(sb);
    if (this.lit) {
      // the beeps, faster as it comes
      const k = 1 - clamp(this.left / FUSE.c4, 0, 1);
      if ((this.beepT -= dt) <= 0) {
        this.beepT = 0.45 * (1 - k * 0.85);
        sb.emit('c4Beep', { what: this, x: this.pos.x, y: this.pos.y, k });
      }
    }
    super.update(dt, sb);
  }

  /** Touching something, it sticks to it: a wall, a crate, a block, somebody. */
  stickTo(sb) {
    const b = this.body, p = b.pos;
    // (only once it has come to it: not while it is being carried about)
    if (sb.hand && sb.hand.holding === this) return;
    const r = 0.11;
    for (const man of sb.people) {
      if (man.removed || (man.species && man.species.giant)) continue;
      const n = man.nearestPart(p.x, p.y);
      if (!n || n.d > r) continue;
      const joint = ['hip', 'chest', 'neck', 'kneeA', 'kneeB', 'elbowA', 'elbowB'].reduce((a, k) => (Math.hypot(man.wj[k].x - p.x, man.wj[k].y - p.y) < Math.hypot(man.wj[a].x - p.x, man.wj[a].y - p.y) ? k : a), 'chest');
      this.on = { man, joint, dx: p.x - man.wj[joint].x, dy: p.y - man.wj[joint].y };
      this.leave(sb);
      sb.emit('c4Stick', { what: this, on: man, x: p.x, y: p.y });
      return;
    }
    for (const t of [...sb.slabs, ...sb.crates, ...sb.items]) {
      if (t === this || t.removed || !t.body || (t.background && !t.loose)) continue;
      if (!t.body.contains(p.x, p.y, r)) continue;
      const l = t.body.toLocal(p.x, p.y);
      this.on = { t, lx: l.x, ly: l.y, rot: b.rot - t.body.rot };
      this.leave(sb);
      sb.emit('c4Stick', { what: this, on: t, x: p.x, y: p.y });
      return;
    }
  }

  /** Where what it is stuck to has taken it - and off, if that is gone. */
  follow(sb) {
    const o = this.on, b = this.body;
    if (o.man) {
      if (o.man.removed) { this.unstick(sb); return; }
      const j = o.man.wj[o.joint];
      b.pos.x = j.x + o.dx;
      b.pos.y = j.y + o.dy;
      return;
    }
    if (o.t.removed || !o.t.body) { this.unstick(sb); return; }
    const q = o.t.body.toWorld(o.lx, o.ly);
    b.pos.x = q.x;
    b.pos.y = q.y;
    b.rot = o.t.body.rot + o.rot;
  }

  unstick(sb) {
    this.on = null;
    this.t = -0.6;
    const b = this.body;
    b.vel.x = b.vel.y = 0;
    b.angVel = 0;
    if (!this.inWorld && !this.removed) { sb.phys.add(b); this.inWorld = true; }
  }

  /** Taken hold of by the hand: pulled off whatever it is stuck to. */
  uproot() {
    if (this.on) this.unstick(this.sandbox);
    return this;
  }

  draw(ctx) {
    const b = this.body;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(b.rot);
    drawC4Shape(ctx, this.lit && this.beepT > 0.32 * (this.left / FUSE.c4));
    ctx.restore();
  }
}

/** A block of C4 with its detonator, centred on the origin (blink: the light on). */
export function drawC4Shape(ctx, blink = false) {
  ctx.fillStyle = '#c9bb8e';
  ctx.strokeStyle = '#6d6447';
  ctx.lineWidth = 0.007;
  ctx.fillRect(-0.12, -0.045, 0.24, 0.09);
  ctx.strokeRect(-0.12, -0.045, 0.24, 0.09);
  // wrapped round
  ctx.fillStyle = 'rgba(60, 54, 36, 0.35)';
  ctx.fillRect(-0.06, -0.045, 0.02, 0.09);
  ctx.fillRect(0.045, -0.045, 0.02, 0.09);
  // the detonator, and its wires
  ctx.fillStyle = '#2b2d30';
  ctx.fillRect(-0.035, 0.012, 0.07, 0.04);
  ctx.strokeStyle = '#c4322b';
  ctx.lineWidth = 0.006;
  ctx.beginPath(); ctx.moveTo(-0.03, 0.03); ctx.quadraticCurveTo(-0.07, 0.05, -0.09, 0.02); ctx.stroke();
  ctx.strokeStyle = '#2f6fd0';
  ctx.beginPath(); ctx.moveTo(0.03, 0.03); ctx.quadraticCurveTo(0.07, 0.055, 0.09, 0.02); ctx.stroke();
  ctx.fillStyle = blink ? '#ff3b30' : '#5a1714';
  ctx.beginPath(); ctx.arc(0, 0.04, 0.009, 0, TAU); ctx.fill();
  if (blink) {
    ctx.fillStyle = 'rgba(255, 70, 50, 0.35)';
    ctx.beginPath(); ctx.arc(0, 0.04, 0.03, 0, TAU); ctx.fill();
  }
}

/* ------------------------------------ TNT ------------------------------------ */

export class TNT extends Explosive {
  constructor(sb, x, y) {
    super(sb, 'tnt', 'TNT', x, y);
    this.fizzT = 0;
  }

  tap(sb) {
    if (this.lit) return 'The fuse is burning down!';
    this.lightFuse(sb, null);
    return 'Fuse lit.';
  }

  lightFuse(sb, by) {
    if (!this.light(FUSE.tnt, by)) return;
    sb.emit('fuseLit', { what: this, x: this.pos.x, y: this.pos.y });
  }

  update(dt, sb) {
    if (!this.lit) {
      // somebody on fire, coming near: the fuse catches
      for (const man of sb.people) {
        if (!man.flames || man.removed) continue;
        const n = man.nearestPart(this.pos.x, this.pos.y);
        if (n && n.d < 0.35) { this.lightFuse(sb, man.flames.by || null); break; }
      }
    } else {
      // the spark on the end of the fuse, and the fizz
      const e = this.fuseEnd();
      if (Math.random() < dt * 40) sb.fx.sparks(e.x, e.y, 1);
      if ((this.fizzT -= dt) <= 0) { this.fizzT = 0.32; sb.emit('fuseFizz', { what: this, x: e.x, y: e.y }); }
      if (Math.random() < dt * 6) sb.fx.smoke(e.x, e.y, 1, 0.6);
    }
    super.update(dt, sb);
  }

  /** Where the burning end of the fuse is, in the world. */
  fuseEnd() {
    const k = this.lit ? clamp(this.left / FUSE.tnt, 0, 1) : 1;
    const q = fusePoint(k);
    return this.body.toWorld(q.x, q.y);
  }

  draw(ctx) {
    const b = this.body;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(b.rot);
    drawTNTShape(ctx, this.lit ? clamp(this.left / FUSE.tnt, 0, 1) : 1, this.lit);
    ctx.restore();
  }
}

/** A point k of the way along the fuse, from where it goes into the bundle (0) to its end (1). */
const fusePoint = (k) => ({ x: 0.01 + Math.sin(k * 3.2) * 0.03, y: 0.1 + k * 0.08 });

/** Three sticks of TNT taped together, centred on the origin; the fuse left (k of it), burning or not. */
export function drawTNTShape(ctx, k = 1, burning = false) {
  ctx.strokeStyle = '#4d0d0b';
  ctx.lineWidth = 0.007;
  for (const x of [-0.075, 0, 0.075]) {
    ctx.fillStyle = '#c4231b';
    ctx.fillRect(x - 0.036, -0.1, 0.072, 0.2);
    ctx.strokeRect(x - 0.036, -0.1, 0.072, 0.2);
    // the light down one side of each stick
    ctx.fillStyle = 'rgba(255, 140, 120, 0.35)';
    ctx.fillRect(x - 0.026, -0.1, 0.012, 0.2);
  }
  // the tape round them
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(-0.115, -0.02, 0.23, 0.045);
  ctx.fillStyle = '#e8d14a';
  ctx.fillRect(-0.115, 0.0, 0.23, 0.006);
  // the fuse, as much of it as is left
  if (k > 0.01) {
    ctx.strokeStyle = '#3a2d1a';
    ctx.lineWidth = 0.012;
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const q = fusePoint((i / 12) * k);
      if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
    }
    ctx.stroke();
  }
  if (burning) {
    const q = fusePoint(k);
    const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, 0.05);
    g.addColorStop(0, 'rgba(255, 245, 190, 1)');
    g.addColorStop(0.4, 'rgba(255, 160, 50, 0.7)');
    g.addColorStop(1, 'rgba(255, 90, 20, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(q.x, q.y, 0.05, 0, TAU); ctx.fill();
  }
}

/* ---------------------------------- missile ---------------------------------- */

const BURN = 4.5;        // how long the motor burns (s)
const THRUST = 75;       // how hard it pushes, for each kilo of it (m/s/s)
const TOP = 32;          // as fast as it goes (m/s)

export class Missile extends Explosive {
  constructor(sb, x, y, facing = 1) {
    super(sb, 'missile', 'Missile', x, y, { rot: facing < 0 ? Math.PI : 0 });
    this.firing = false;
    this.burnT = 0;
  }

  tap(sb) {
    if (this.firing) return 'It is already on its way.';
    this.fire(sb);
    return 'Fired!';
  }

  fire(sb, by = null) {
    this.firing = true;
    this.burnT = 0;
    this.by = by;
    const b = this.body;
    // (off the ground it is lying on: up, a little)
    b.vel.y = Math.max(b.vel.y, 1.2);
    sb.emit('missileLaunch', { what: this, x: b.pos.x, y: b.pos.y, dur: BURN });
  }

  // (caught in a blast: it goes off rather than flying)
  chain() { this.light(rand(0.08, 0.2)); }

  update(dt, sb) {
    const b = this.body;
    if (this.firing && !this.removed) {
      this.burnT += dt;
      const ux = Math.cos(b.rot), uy = Math.sin(b.rot);
      if (this.burnT < BURN) {
        // straight the way it points: the motor, and the fins keeping it from turning or dropping
        const along = b.vel.x * ux + b.vel.y * uy;
        if (along < TOP) b.applyForce(ux * THRUST * b.mass, uy * THRUST * b.mass, b.pos.x, b.pos.y);
        b.applyForce(0, 18 * b.mass, b.pos.x, b.pos.y);
        // (what is not along it, it loses)
        const sx = b.vel.x - ux * along, sy = b.vel.y - uy * along;
        b.vel.x -= sx * Math.min(1, dt * 6);
        b.vel.y -= sy * Math.min(1, dt * 6);
        b.angVel *= Math.exp(-dt * 8);
        const tail = b.toWorld(-0.62, 0);
        sb.fx.smoke(tail.x, tail.y, 1, 1.4);
        if (Math.random() < dt * 30) sb.fx.embers(tail.x, tail.y, 1);
      }
      // its nose into something, and it goes off
      if (this.burnT > 0.12 && this.hitSomething(sb)) { this.detonate(); return; }
      if (this.burnT > BURN + 6) { this.detonate(); return; }
    }
    super.update(dt, sb);
  }

  /** Whether its nose has met anything: somebody, a wall or a building, a crate, the ground or the end of the world. */
  hitSomething(sb) {
    const b = this.body, n = b.toWorld(0.62, 0);
    if (n.y < 0.05 || n.x < sb.left + 0.05 || n.x > sb.right - 0.05) return true;
    if (sb.personAt(n.x, n.y, 0.1)) return true;
    for (const w of sb.slabs) if (!w.removed && w.contains(n.x, n.y, 0.04)) return true;
    for (const c of sb.crates) if (!c.removed && c.body.contains(n.x, n.y, 0.04)) return true;
    for (const t of sb.items) if (t !== this && !t.removed && t.body && t.body.contains(n.x, n.y, 0.03)) return true;
    for (const t of sb.plants) if (!t.removed && t.hitTest(n.x, n.y, 0.05)) return true;
    return false;
  }

  draw(ctx) {
    const b = this.body;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(b.rot);
    drawMissileShape(ctx, this.firing && this.burnT < BURN ? this.t : -1);
    ctx.restore();
  }
}

/** A missile, centred on the origin, nose to +x; flame (its age, or -1 for none) out of the back. */
export function drawMissileShape(ctx, flame = -1) {
  if (flame >= 0) {
    const L = 0.35 + Math.sin(flame * 47) * 0.05 + Math.sin(flame * 31) * 0.04;
    const g = ctx.createLinearGradient(-0.6, 0, -0.6 - L, 0);
    g.addColorStop(0, 'rgba(255, 250, 210, 1)');
    g.addColorStop(0.35, 'rgba(255, 170, 60, 0.9)');
    g.addColorStop(1, 'rgba(255, 80, 20, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-0.6, 0.05); ctx.lineTo(-0.6 - L, 0); ctx.lineTo(-0.6, -0.05);
    ctx.closePath();
    ctx.fill();
  }
  // the fins
  ctx.fillStyle = '#3d4247';
  ctx.beginPath();
  ctx.moveTo(-0.6, 0.06); ctx.lineTo(-0.46, 0.06); ctx.lineTo(-0.58, 0.14); ctx.lineTo(-0.66, 0.14);
  ctx.moveTo(-0.6, -0.06); ctx.lineTo(-0.46, -0.06); ctx.lineTo(-0.58, -0.14); ctx.lineTo(-0.66, -0.14);
  ctx.fill();
  // the body, and the nose
  ctx.fillStyle = '#d9dcdf';
  ctx.strokeStyle = '#5c6166';
  ctx.lineWidth = 0.01;
  ctx.beginPath();
  ctx.moveTo(-0.6, 0.065); ctx.lineTo(0.38, 0.065);
  ctx.quadraticCurveTo(0.6, 0.05, 0.62, 0);
  ctx.quadraticCurveTo(0.6, -0.05, 0.38, -0.065);
  ctx.lineTo(-0.6, -0.065);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#c4322b';
  ctx.beginPath();
  ctx.moveTo(0.42, 0.063); ctx.quadraticCurveTo(0.6, 0.05, 0.62, 0); ctx.quadraticCurveTo(0.6, -0.05, 0.42, -0.063);
  ctx.closePath();
  ctx.fill();
  // a band round it, and the fins' near one over it
  ctx.fillStyle = '#e2b84a';
  ctx.fillRect(0.12, -0.065, 0.04, 0.13);
  ctx.fillStyle = '#4c5257';
  ctx.beginPath(); ctx.moveTo(-0.6, 0.012); ctx.lineTo(-0.46, 0.012); ctx.lineTo(-0.62, -0.03); ctx.lineTo(-0.68, -0.03); ctx.fill();
}

/* ---------------------------------- spawning ---------------------------------- */

/** The explosives, for the spawn menu (ui.js): each as a mod's spawnable is described. */
export const EXPLOSIVES = {
  grenade: { make: (sb, x, y) => new Grenade(sb, x, Math.max(y, 0.07)), draw: (ctx) => drawGrenadeShape(ctx), w: 0.12, h: 0.14 },
  c4: { make: (sb, x, y) => new C4(sb, x, Math.max(y, 0.05)), draw: (ctx) => drawC4Shape(ctx), w: 0.26, h: 0.1 },
  tnt: { make: (sb, x, y) => new TNT(sb, x, Math.max(y, 0.1)), draw: (ctx) => drawTNTShape(ctx), w: 0.26, h: 0.3 },
  missile: { make: (sb, x, y) => new Missile(sb, x, Math.max(y, 0.09), x > 0 ? -1 : 1), draw: (ctx) => drawMissileShape(ctx), w: 1.3, h: 0.3 },
};

export const isExplosive = (t) => t instanceof Explosive;
