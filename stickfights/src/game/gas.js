/* =============================================================================
   Poison gas: what the gas rifle fires.

     Canister   out of the muzzle in an arc, trailing a wisp of it; it bursts
                where it lands - on the ground, a wall, a crate, somebody - or
                in the air once it has flown far enough
     Cloud      a green cloud, rolling out from where it burst and hanging
                there a quarter of a minute, thinning as it goes. Whoever is
                in it breathes it: they choke on it (vitals.js breatheSmoke),
                cough, and it eats at their lungs (health.js organHurt) - a
                good while in it and the lungs give out, and they suffocate

   Both are effects in sandbox.effects ({ update(dt) -> false when done, draw }).
   ========================================================================== */
import { breatheSmoke, sicken } from './vitals.js';
import { rand, chance, TAU } from '../core/util.js';

const G = 18;
const SPEED = 22;
export const GAS_SPEED = SPEED, GAS_G = G;

/**
 * The angle to fire something at speed v, falling at g, so it comes down dx
 * along and dy up (dx > 0): the flatter of the two ways there, or 45 degrees
 * when it cannot reach that far.
 */
export function lob(dx, dy, v, g) {
  const v2 = v * v, d = v2 * v2 - g * (g * dx * dx + 2 * dy * v2);
  return d < 0 ? Math.PI / 4 : Math.atan((v2 - Math.sqrt(d)) / (g * dx));
}

/** A canister of it, fired by `by` from (x, y) along angle a. */
export function launchGas(sb, by, x, y, a) {
  sb.effects.push(new Canister(sb, by, x, y, Math.cos(a) * SPEED, Math.sin(a) * SPEED));
  sb.emit('gasFired', { who: by, x, y });
}

class Canister {
  constructor(sb, by, x, y, vx, vy) {
    this.sb = sb;
    this.by = by;
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.t = 0;
    this.done = false;
  }

  update(dt) {
    if (this.done) return false;
    const sb = this.sb;
    this.t += dt;
    // a few small steps, so it does not pass through somebody thin
    for (let i = 0; i < 3; i++) {
      const h = dt / 3;
      this.vy -= G * h;
      this.x += this.vx * h;
      this.y += this.vy * h;
      if (this.hit()) { this.burst(); return false; }
    }
    if (Math.random() < dt * 30 && sb.fx.smokes.length < 250) sb.fx.smokes.push({ x: this.x, y: this.y, vx: rand(-0.1, 0.1), vy: rand(0, 0.2), r: rand(0.03, 0.05), age: 0, life: rand(0.6, 1.1), steam: false, k: 1, gas: true });
    if (this.t > 2.5) { this.burst(); return false; }
    return true;
  }

  /** Whether it has come to something. */
  hit() {
    const sb = this.sb, x = this.x, y = this.y;
    if (y <= 0.05 || x <= sb.left || x >= sb.right) return true;
    // (somebody: it goes off on them, or as it goes by close enough to - never on whoever fired it, as it leaves)
    if (this.t > 0.06) { const n = sb.personAt(x, y, 0.22); if (n && (n.who !== this.by || this.t > 0.4)) return true; }
    for (const w of sb.slabs) if (!w.removed && !w.background && w.contains(x, y, 0.02)) return true;
    for (const c of sb.crates) if (!c.removed && c.body.contains(x, y, 0.02)) return true;
    return false;
  }

  burst() {
    this.done = true;
    const sb = this.sb, y = Math.max(0.2, this.y);
    sb.effects.push(new Cloud(sb, this.by, this.x, y));
    sb.emit('gasBurst', { who: this.by, x: this.x, y });
  }

  draw(ctx) {
    if (this.done) return;
    const a = Math.atan2(this.vy, this.vx);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(a);
    ctx.fillStyle = '#5c6e2c';
    ctx.fillRect(-0.06, -0.025, 0.12, 0.05);
    ctx.fillStyle = '#e2c13a';
    ctx.fillRect(-0.02, -0.025, 0.02, 0.05);
    ctx.restore();
  }
}

/** The cloud of it: puffs rolling out from where it burst, and hanging there, thinning. */
export class Cloud {
  constructor(sb, by, x, y) {
    this.sb = sb;
    this.by = by;
    this.t = 0;
    this.life = 15;
    this.puffs = [];
    for (let i = 0; i < 42; i++) {
      const a = rand(0, TAU), s = rand(0.4, 2.5);
      this.puffs.push({ x: x + rand(-0.2, 0.2), y: y + rand(-0.2, 0.2), vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, r: rand(0.25, 0.5), seed: rand(0, 6) });
    }
    this.tickT = 0;
  }

  update(dt) {
    const sb = this.sb;
    this.t += dt;
    for (const q of this.puffs) {
      const k = Math.exp(-dt * 1.1);
      q.vx = q.vx * k + Math.sin(this.t * 0.4 + q.seed) * 0.05 * dt;
      q.vy = q.vy * k + 0.02 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.r = Math.min(1.15, q.r + dt * 0.11);
      if (q.y < q.r * 0.5) { q.y = q.r * 0.5; q.vy = Math.abs(q.vy) * 0.2; }
      if (q.x < sb.left) q.x = sb.left; else if (q.x > sb.right) q.x = sb.right;
    }
    if ((this.tickT -= dt) <= 0) { this.tickT = 0.15; this.choke(0.15); }
    return this.t < this.life;
  }

  /** How thick it is now: thinning out over its last seconds. */
  get thick() { return Math.min(1, (this.life - this.t) / 6); }

  /** Whoever is in it breathes it. */
  choke(dt) {
    const sb = this.sb, k0 = this.thick;
    let cx = 0;
    for (const q of this.puffs) cx += q.x;
    cx /= this.puffs.length;
    for (const p of sb.people) {
      if (p.removed || p.dead || (p.species && p.species.giant)) continue;
      const head = p.wj.head;
      let k = 0;
      for (const q of this.puffs) if (Math.hypot(head.x - q.x, head.y - q.y) < q.r) { k += 0.35; if (k >= 1) break; }
      k = Math.min(1, k) * k0;
      if (k < 0.1) continue;
      breatheSmoke(p, k);
      if (!p.vit || p.health.frozen) continue;
      // what it does to the lungs: a little every breath of it
      const h = p.health;
      if (h.organs) { h.organHurt(chance(0.5) ? 'lungA' : 'lungB', dt * 0.06 * k); }
      h.pain = Math.min(130, h.pain + dt * 12 * k);
      sicken(p, dt * 0.12 * k);
      p.gassed = sb.time;
      p.gasAt = { x: cx, t: sb.time };
      p.gassedBy = this.by && !this.by.removed ? this.by : null;
      if (p.brain && chance(0.08)) p.brain.speak('inGas', {}, 1, null, false);
      if (chance(dt * 2 * k)) sb.emit('cough', { who: p, x: head.x, y: head.y });
    }
  }

  draw(ctx) {
    const k = this.thick, fade = Math.min(1, this.t * 4) * k;
    ctx.save();
    for (const q of this.puffs) {
      ctx.fillStyle = `rgba(118, 176, 58, ${0.2 * fade})`;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r * 1.15, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(150, 205, 80, ${0.22 * fade})`;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r * 0.75, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}
