/* =============================================================================
   MURDER DRONES - Uzi's railgun.

   She built it herself. Brought up and held on someone it charges for a
   moment - the coils light up, one after another, and it whines higher and
   higher - and then it fires a slug fast enough to go straight through
   everything in its way: people, crates, more people, all the way to the
   wall. What it hits in an arm or a leg usually comes off. It kicks like
   nothing else, and it takes a few seconds to charge again. It never runs
   out.

   Anyone can pick it up once it is on the floor. Tapped where it lies, it
   charges up on its own and goes off the way it is pointing.
   ========================================================================== */
import { Body } from '../../physics/rigid.js';
import { GUN_KINDS, defineArm } from '../../game/props.js';
import { INK } from '../../game/draw.js';
import { clamp, chance, sign } from '../../core/util.js';

export const RAIL_W = 1.0, RAIL_H = 0.2;
/** In the gun's own frame (muzzle toward +x): where the hand closes on the grip, and the end of the rails. */
const GRIP = { x: -0.03, y: -0.1 };
const MUZZLE = { x: 0.62, y: 0 };
// the drawing runs from the stock at -0.36 to the rails' end at 0.62: its middle, for a body centred on it
const MIDDLE = 0.13;
const CHARGE = 0.9;
const COOL = 2.6;

GUN_KINDS.add('railgun');
defineArm('rail', {
  name: 'Railgun', wound: 'Railgun', cause: 'a railgun shot', shot: true, sharp: 1, sever: 1.1, shove: 2.4, spray: 1.6, nasty: 3, scary: 0.6,
  memory: 'shotMe', hurt: 'shot', verb: 'shot me with a railgun', power: 4,
});

function gauss() { return (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 1.73; }

/** Where a railgun in the near hand is: along the forearm, the grip in the fist. */
export function railFrame(j, s, f) {
  const from = j.midForeA, hand = j.handA;
  const a = Math.atan2(hand.y - from.y, hand.x - from.x);
  const c = Math.cos(a), n = Math.sin(a);
  const gx = -GRIP.x * s, gy = -GRIP.y * s * f;
  return { x: hand.x + c * gx - n * gy, y: hand.y + n * gx + c * gy, a, f, s };
}

function railPoint(g, lx, ly) {
  const c = Math.cos(g.a), n = Math.sin(g.a);
  const x = lx * g.s, y = ly * g.s * g.f;
  return { x: g.x + c * x - n * y, y: g.y + n * x + c * y };
}

/** The railgun in its own frame, muzzle toward +x: stock, body, four coils that light up as it charges, and the two rails. */
export function drawRailgunShape(ctx, charge = 0, blood = 0, ready = true) {
  ctx.lineJoin = 'round';
  const box = (x0, y0, x1, y1, fill, stroke = INK, w = 0.008) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = w; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); }
  };
  // the stock, with a pad at the end
  box(-0.36, -0.045, -0.12, 0.035, '#2b2b31');
  box(-0.38, -0.06, -0.34, 0.05, '#18181c');
  // the grip, under the body
  ctx.fillStyle = '#26262c';
  ctx.beginPath();
  ctx.moveTo(-0.07, -0.05); ctx.lineTo(0.01, -0.05); ctx.lineTo(-0.01, -0.15); ctx.lineTo(-0.08, -0.14);
  ctx.closePath();
  ctx.fill();
  // the body, with Uzi's purple down the side
  box(-0.14, -0.055, 0.38, 0.06, '#4b4b57');
  box(-0.1, 0.012, 0.34, 0.03, '#7d3cc8', null);
  if (blood > 0.05) { ctx.fillStyle = `rgba(110, 7, 16, ${Math.min(0.8, blood)})`; ctx.fillRect(0.1, -0.05, 0.2, 0.04); }
  // a little sight on top
  box(0.0, 0.06, 0.12, 0.085, '#2b2b31');
  // the coils: dim, then lit one after another as it charges
  for (let i = 0; i < 4; i++) {
    const x = 0.05 + i * 0.075;
    const lit = clamp(charge * 4 - i, 0, 1);
    if (lit > 0) {
      ctx.fillStyle = `rgba(190, 110, 255, ${0.35 * lit})`;
      ctx.beginPath(); ctx.arc(x + 0.017, 0, 0.11, 0, Math.PI * 2); ctx.fill();
    }
    const c = lit > 0 ? `rgb(${Math.round(120 + 110 * lit)}, ${Math.round(60 + 140 * lit)}, 255)` : ready ? '#6a2fa8' : '#3d2a52';
    box(x, -0.078, x + 0.035, 0.078, c, INK, 0.006);
  }
  // the rails, with the gap between them the slug comes out of
  box(0.36, 0.022, 0.62, 0.05, '#c3cad1', '#5f676d', 0.006);
  box(0.36, -0.05, 0.62, -0.022, '#c3cad1', '#5f676d', 0.006);
}

/** The streak a railgun shot leaves: a thick purple line, white hot in the middle, fading. */
class RailBeam {
  constructor(x0, y0, x1, y1) {
    this.mod = 'murder-drones';
    this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1;
    this.age = 0;
    this.life = 0.5;
    this.sparks = [];
    const L = Math.hypot(x1 - x0, y1 - y0);
    for (let i = 0; i < Math.min(60, L * 4); i++) this.sparks.push({ t: Math.random(), o: (Math.random() - 0.5) * 0.12, r: 0.01 + Math.random() * 0.02 });
  }
  update(dt) { this.age += dt; return this.age < this.life; }
  draw(ctx) {
    const k = this.age / this.life, a = 1 - k;
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(182, 92, 255, ${0.45 * a})`;
    ctx.lineWidth = 0.16 * (1 - k * 0.4);
    ctx.beginPath(); ctx.moveTo(this.x0, this.y0); ctx.lineTo(this.x1, this.y1); ctx.stroke();
    ctx.strokeStyle = `rgba(246, 232, 255, ${0.95 * a})`;
    ctx.lineWidth = 0.035 * (1 - k * 0.6);
    ctx.stroke();
    const dx = this.x1 - this.x0, dy = this.y1 - this.y0, L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    ctx.fillStyle = `rgba(214, 160, 255, ${0.8 * a})`;
    for (const s of this.sparks) {
      const o = s.o * (1 + k * 3);
      ctx.beginPath();
      ctx.arc(this.x0 + dx * s.t + nx * o, this.y0 + dy * s.t + ny * o, s.r * a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Where a ray from (px, py) along (dx, dy) goes into a box body, and how far it is through it: { t, out } or null. */
function rayBox(b, px, py, dx, dy, max) {
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  const rx = px - b.pos.x, ry = py - b.pos.y;
  const ox = rx * c + ry * s, oy = -rx * s + ry * c;
  const vx = dx * c + dy * s, vy = -dx * s + dy * c;
  let t0 = -Infinity, t1 = Infinity;
  for (const [o, v, h] of [[ox, vx, b.w / 2], [oy, vy, b.h / 2]]) {
    if (Math.abs(v) < 1e-9) { if (o < -h || o > h) return null; continue; }
    let lo = (-h - o) / v, hi = (h - o) / v;
    if (lo > hi) [lo, hi] = [hi, lo];
    t0 = Math.max(t0, lo);
    t1 = Math.min(t1, hi);
    if (t0 > t1) return null;
  }
  if (t1 < 1e-4 || t0 > max) return null;
  const t = Math.max(t0, 0);
  return { t, out: t1 - t };
}

let nextId = 1;

export class Railgun {
  constructor(sandbox, x, y, rot = 0) {
    this.id = 'railgun-' + nextId++;
    this.kind = 'railgun';
    this.name = 'Railgun';
    this.mod = 'murder-drones';
    this.sandbox = sandbox;
    this.body = new Body(RAIL_W, RAIL_H * 0.7, 4.5, {
      x, y, rot, owner: this, friction: 0.6, restitution: 0.12, angularDamping: 0.7,
    });
    sandbox.phys.add(this.body);
    this.inWorld = true;
    this.wornBy = null;
    // a battery, not a magazine: what the AI checks before it reloads, and it never needs to
    this.mag = 1;
    this.spare = 0;
    this.lastShot = -99;
    this.charge = 0;
    this.charging = false;
    this.chargeBy = null;
    this.blood = 0;
    this.thrownBy = null;
    this.thrownAt = -99;
    this.owner = null;
    this.lastSound = -99;
    this.removed = false;
    // it needs to be told the time: charging, and going off when tapped
    sandbox.effects.push({ mod: 'murder-drones', update: (dt) => this.tick(dt), draw: null });
  }

  get pos() { return this.wornBy ? this.wornBy.wj.handA : this.body.pos; }
  get loose() { return !this.wornBy && !this.removed; }
  get ammo() { return Infinity; }
  get slide() { return 0; }
  /** Charged again and ready to go. */
  get ready() { return this.sandbox.time - this.lastShot >= COOL; }

  wear(by) {
    this.wornBy = by;
    this.charging = false;
    this.charge = 0;
    if (this.inWorld) { this.sandbox.phys.remove(this.body); this.inWorld = false; }
  }

  drop(x, y, vx = 0, vy = 0) {
    this.wornBy = null;
    this.charging = false;
    const b = this.body;
    b.pos.x = x; b.pos.y = Math.max(y, 0.12);
    b.vel.x = vx; b.vel.y = vy;
    b.rot = (Math.random() - 0.5) * 0.6;
    b.angVel = (Math.random() - 0.5) * 5;
    if (!this.inWorld) { this.sandbox.phys.add(this.body); this.inWorld = true; }
  }

  reload() { return false; }

  /** Lying loose: where the rails end, and the way they point. */
  muzzle() {
    const p = this.body.toWorld(MUZZLE.x - MIDDLE, MUZZLE.y);
    return { x: p.x, y: p.y, a: this.body.rot };
  }

  tick(dt) {
    if (this.removed) return false;
    const holder = this.wornBy;
    if (this.charging) {
      // held, it charges only while it is held up on someone; loose, it was tapped
      const keep = this.chargeBy ? this.chargeBy === holder && holder.aiming : !holder;
      if (!keep) {
        this.charging = false;
        this.sandbox.emit('railAbort', { what: this, x: this.pos.x, y: this.pos.y });
      } else {
        this.charge = Math.min(1, this.charge + dt / CHARGE);
        if (this.charge >= 1 && !holder) {
          const m = this.muzzle();
          this.shootFrom(null, m.x, m.y, m.a);
          this.body.applyImpulse(-Math.cos(m.a) * 22, -Math.sin(m.a) * 22 + 6, m.x, m.y);
        }
      }
    } else if (this.charge > 0) {
      this.charge = Math.max(0, this.charge - dt * 2.5);
    }
    return true;
  }

  /**
   * Called by whoever holds it, over and over while they aim: the first call
   * starts it charging, and once it is charged the next one fires.
   */
  fire(man) {
    const sb = this.sandbox;
    if (!this.ready) return false;
    if (!this.charging) {
      this.charging = true;
      this.chargeBy = man;
      this.charge = 0;
      sb.emit('railCharge', { who: man, what: this, x: man.wj.handA.x, y: man.wj.handA.y });
      if (man.brain) man.brain.speak('railCharge', {}, 0.5, null, true);
      return false;
    }
    if (this.charge < 1) return false;
    const frame = railFrame(man.wj, man.scale, man.facing);
    const m = railPoint(frame, MUZZLE.x, MUZZLE.y);
    const tp = man.aimPoint();
    let a = frame.a;
    if (tp && man.steady > 0.3) a = Math.atan2(tp.y - m.y, tp.x - m.x);
    a += gauss() * man.spread() * 0.45;
    this.shootFrom(man, m.x, m.y, a);
    // and it kicks: a little one like Uzi is lucky to stay on her feet
    man.recoil = 1;
    man.vel.x -= man.facing * 3.2;
    if (man.scale < 0.9 && chance(0.3)) man.staggerFrom(-man.facing, 1.1);
    return true;
  }

  /** Tapped where it lies: it starts to charge, and goes off when it is ready. */
  fireLoose() {
    if (!this.ready) return `The railgun is still recharging`;
    if (this.charging) return 'It is charging...';
    this.charging = true;
    this.chargeBy = null;
    this.charge = 0;
    this.sandbox.emit('railCharge', { who: null, what: this, x: this.body.pos.x, y: this.body.pos.y });
    return 'The railgun starts to charge...';
  }

  /** The shot itself: straight through everything along the line, out to the wall or the floor. */
  shootFrom(by, x, y, a) {
    const sb = this.sandbox;
    this.lastShot = sb.time;
    this.charging = false;
    this.charge = 0;
    const dx = Math.cos(a), dy = Math.sin(a);
    let end = 45;
    if (dy < -1e-6) end = Math.min(end, -y / dy);
    const tw = dx > 0 ? (sb.right - x) / dx : dx < 0 ? (sb.left - x) / dx : Infinity;
    if (tw > 0) end = Math.min(end, tw);
    const hits = [];
    for (const q of sb.people) {
      if (q === by || q.removed) continue;
      const h = q.rayHit(x, y, dx, dy, end);
      if (h) hits.push({ t: h.t, q, h });
    }
    for (const c of sb.crates) {
      if (c.removed) continue;
      const h = rayBox(c.body, x, y, dx, dy, end);
      if (h) hits.push({ t: h.t, c, out: h.out });
    }
    hits.sort((p, q) => p.t - q.t);
    const target = by && by.aimTarget && by.aimTarget.kind === 'stickman' ? by.aimTarget : null;
    for (const e of hits) {
      if (e.q) {
        const q = e.q, hh = e.h;
        q.takeHit({ by, part: hh.part, x: hh.x, y: hh.y, dir: sign(dx) || 1, power: 5.2, kind: 'shot', weapon: 'rail', bone: q.boneName(hh.bone, hh.tb), deep: true });
        if (!q.removed) {
          if (hh.part === 'head') q.headMark(hh.x, hh.y, 1.4);
          else q.addWound({ bone: hh.bone, t: hh.tb, r: 0.7, hole: true });
          sb.fx.blood(hh.x, hh.y, dx * 6, dy * 6 + 1, 24, 1.6, q);
          // it knocks them clean off their feet
          if (!q.dead && (q.state === 'stand' || q.state === 'stagger') && chance(0.75)) q.launch(dx * 6, 2 + Math.max(0, dy) * 4);
        }
        sb.emit('bulletHit', { what: q, x: hh.x, y: hh.y, energy: 3 });
      } else {
        const c = e.c, hx = x + dx * e.t, hy = y + dy * e.t;
        c.hole(hx, hy);
        c.hole(hx + dx * e.out, hy + dy * e.out);
        sb.fx.splinters(hx, hy, -dx, -dy, 8);
        sb.fx.splinters(hx + dx * e.out, hy + dy * e.out, dx, dy, 12);
        c.body.applyImpulse(dx * 70, dy * 70 + 25, hx, hy);
        sb.emit('bulletHit', { what: c, x: hx, y: hy, energy: 3 });
      }
    }
    const ex = x + dx * end, ey = y + dy * end;
    sb.fx.sparks(ex, Math.max(ey, 0.01), 14);
    sb.fx.dust(ex, Math.max(0, ey), 8, 1.3);
    sb.fx.flash(x, y, a);
    sb.effects.push(new RailBeam(x, y, ex, ey));
    sb.emit('railShot', { who: by, what: this, x, y, ex, ey });
    // everyone hears it - as a gunshot, the loudest one there ever was (it makes its own noise)
    sb.emit('shot', { who: by, gun: this, x, y, target, loud: true, silent: true, heardAs: 'railHeard' });
  }

  draw(ctx) {
    const b = this.body;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(b.rot);
    ctx.translate(-MIDDLE, 0);
    drawRailgunShape(ctx, this.charge, this.blood, this.ready);
    ctx.restore();
  }

  drawHeld(ctx, j, s, f) {
    const g = railFrame(j, s, f);
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.a);
    ctx.scale(s, s * f);
    drawRailgunShape(ctx, this.charge, this.blood, this.ready);
    ctx.restore();
  }

  /** For the inspector. */
  describe(man) {
    // the one who built it: Uzi
    const her = man && man === this.owner ? 'her' : 'a';
    if (this.charging) return `Holding ${her} railgun (charging, ${Math.round(this.charge * 100)}%)`;
    return `Holding ${her} railgun (${this.ready ? 'charged' : 'recharging'})`;
  }
}

/** For icons: the railgun held in a pose that has no real railgun behind it. */
export function drawHeldRailgun(ctx, j, s, f, charge = 0) {
  const g = railFrame(j, s, f);
  ctx.save();
  ctx.translate(g.x, g.y);
  ctx.rotate(g.a);
  ctx.scale(s, s * f);
  drawRailgunShape(ctx, charge, 0, true);
  ctx.restore();
}
