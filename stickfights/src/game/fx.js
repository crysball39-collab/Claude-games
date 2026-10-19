/* =============================================================================
   Particles: blood, dust and the little bursts that go with a hit - and the
   gun's: the flash at the muzzle, the streak of a bullet, sparks, splinters,
   and the empty cases, which bounce and stay where they land.

   Blood is simulated until it lands, and it stays where it lands: on the
   floor as a splat that spreads, on a crate as a stain in the crate's own
   frame (so it turns with the crate), or on somebody, as a mark on whichever
   bone it hit. Not everything bleeds red: whatever bleeds something else
   (a mod's robots bleed oil) gives its drops a tint, [colour, darker], and
   the tint goes wherever the drop does.

   And what fire and ice give off (vitals.js): smoke and steam going up and
   spreading, embers rising and winking out, shards of ice that bounce and
   skitter, and meltwater, which drips and runs away rather than staying.
   ========================================================================== */
import { rand, segDist, clamp as clampTo } from '../core/util.js';
import { BONES, DIM } from './skeleton.js';

const G = 18;
const MAX_DROPS = 700;
const MAX_SPLATS = 420;
const MAX_CASINGS = 80;
const MAX_SMOKE = 260;
const WATER = ['#9fd0f2', '#6aa9d6'];

export class FX {
  constructor(sandbox) {
    this.sb = sandbox;
    this.drops = [];
    this.puffs = [];
    this.bursts = [];
    this.splats = [];
    this.flashes = [];
    this.tracers = [];
    this.sparkles = [];
    this.chips = [];
    this.casings = [];
    this.smokes = [];       // smoke and steam: { x, y, vx, vy, r, age, life, steam, k }
    this.emberBits = [];
    this.iceBits = [];
  }

  clear() {
    this.drops.length = 0;
    this.puffs.length = 0;
    this.bursts.length = 0;
    this.splats.length = 0;
    this.flashes.length = 0;
    this.tracers.length = 0;
    this.sparkles.length = 0;
    this.chips.length = 0;
    this.casings.length = 0;
    this.smokes.length = 0;
    this.emberBits.length = 0;
    this.iceBits.length = 0;
  }

  /** Smoke going up from (x, y), k how thick. */
  smoke(x, y, n = 1, k = 1) {
    for (let i = 0; i < n && this.smokes.length < MAX_SMOKE; i++) {
      this.smokes.push({ x: x + rand(-0.03, 0.03), y, vx: rand(-0.15, 0.15), vy: rand(0.5, 0.9), r: rand(0.04, 0.07), age: 0, life: rand(1.1, 1.8), steam: false, k });
    }
  }

  /** Steam: like smoke, but white, and gone sooner. */
  steam(x, y, n = 1) {
    for (let i = 0; i < n && this.smokes.length < MAX_SMOKE; i++) {
      this.smokes.push({ x: x + rand(-0.03, 0.03), y, vx: rand(-0.12, 0.12), vy: rand(0.4, 0.75), r: rand(0.03, 0.05), age: 0, life: rand(0.7, 1.1), steam: true, k: 1 });
    }
  }

  /** Sparks off a fire, going up on the heat. */
  embers(x, y, n = 1) {
    for (let i = 0; i < n && this.emberBits.length < 160; i++) {
      this.emberBits.push({ x: x + rand(-0.04, 0.04), y, vx: rand(-0.4, 0.4), vy: rand(0.6, 1.6), age: 0, life: rand(0.5, 1.1), seed: rand(0, 6) });
    }
  }

  /** Bits of ice flying from (x, y), along (vx, vy). */
  shards(x, y, n = 8, vx = 0, vy = 1) {
    for (let i = 0; i < n && this.iceBits.length < 220; i++) {
      this.iceBits.push({
        x: x + rand(-0.06, 0.06), y: y + rand(-0.06, 0.06), vx: vx + rand(-2.4, 2.4), vy: vy + rand(-0.5, 2.8),
        a: rand(0, Math.PI), va: rand(-18, 18), s: rand(0.012, 0.032), age: 0, life: rand(1.2, 2.4),
      });
    }
  }

  /** Meltwater: drops that fall and run away, leaving nothing (not blood: it falls whatever the settings). */
  water(x, y, n = 1, vx = 0, vy = 0) {
    for (let i = 0; i < n && this.drops.length < MAX_DROPS; i++) {
      this.drops.push({ x, y, vx: vx + rand(-0.2, 0.2), vy: vy + rand(-0.3, 0), r: rand(0.009, 0.015), age: 0, from: null, sticky: false, tint: WATER, water: true });
    }
  }

  /** The flash at a muzzle, pointing the way the shot went (a counter-clockwise from +x). */
  flash(x, y, a, k = 1) { this.flashes.push({ x, y, a, age: 0, life: 0.05, s: rand(0.8, 1.2) * k }); }

  /** The streak a bullet leaves along its path for an instant. */
  tracer(x0, y0, x1, y1) { this.tracers.push({ x0, y0, x1, y1, age: 0, life: 0.07 }); }

  sparks(x, y, n = 4) {
    for (let i = 0; i < n; i++) {
      this.sparkles.push({ x, y, vx: rand(-3, 3), vy: rand(0.5, 4), age: 0, life: rand(0.12, 0.3) });
    }
  }

  /** Wood flying off a crate where a bullet went in or out, along (dx, dy). */
  splinters(x, y, dx, dy, n = 5) {
    for (let i = 0; i < n; i++) {
      this.chips.push({
        x, y, vx: dx * rand(1, 3) + rand(-1, 1), vy: dy * rand(1, 3) + rand(-0.5, 1.5),
        a: rand(0, Math.PI), va: rand(-20, 20), age: 0, life: rand(0.4, 0.8),
      });
    }
  }

  /** An empty case, out of the ejection port: it tumbles, bounces and stays put. */
  casing(x, y, vx, vy) {
    if (this.casings.length >= MAX_CASINGS) this.casings.shift();
    this.casings.push({ x, y, vx, vy, a: rand(0, Math.PI), va: rand(-30, 30), rest: false, bounces: 0 });
  }

  /** A spray of blood from (x, y), flung along (vx, vy) - or of oil, or acid, given a tint. */
  blood(x, y, vx, vy, n, spread = 1, from = null, tint = null) {
    if (!this.sb.settings.blood) return;
    const t = tint || (from && from.tint) || null;
    for (let i = 0; i < n && this.drops.length < MAX_DROPS; i++) {
      const k = rand(0.3, 1.1);
      this.drops.push({
        x: x + rand(-0.02, 0.02), y: y + rand(-0.02, 0.02),
        vx: vx * k + rand(-1, 1) * spread, vy: vy * k + rand(-0.4, 1.4) * spread,
        r: rand(0.011, 0.028), age: 0, from, sticky: Math.random() < 0.35, tint: t,
      });
    }
  }

  /** One slow drop, off a wound or a fist. */
  drip(x, y, from = null, tint = null) {
    if (!this.sb.settings.blood || this.drops.length >= MAX_DROPS) return;
    this.drops.push({ x, y, vx: rand(-0.15, 0.15), vy: rand(-0.3, 0), r: rand(0.01, 0.018), age: 0, from, sticky: Math.random() < 0.35, tint: tint || (from && from.tint) || null });
  }

  dust(x, y, n = 6, power = 1) {
    for (let i = 0; i < n; i++) {
      this.puffs.push({
        x: x + rand(-0.15, 0.15), y: y + rand(0, 0.05),
        vx: rand(-1, 1) * power, vy: rand(0.1, 0.6) * power,
        r: rand(0.04, 0.09) * (0.7 + power * 0.3), age: 0, life: rand(0.35, 0.7),
      });
    }
  }

  burst(x, y, power = 1) {
    this.bursts.push({ x, y, r: 0.1 + power * 0.06, age: 0, life: 0.13 + power * 0.03, a: rand(0, Math.PI) });
  }

  /** Blood pooling on the floor under (x, y), from a body that is still bleeding. */
  pool(x, y, amount, tint = null) {
    if (!this.sb.settings.blood) return;
    if (y > 0.06) {
      const c = this.sb.crateAt(x, y - 0.05);
      if (c && Math.random() < amount * 40) c.stain(x + rand(-0.2, 0.2), y - 0.02, rand(0.03, 0.06), tint);
      return;
    }
    let near = null;
    for (const s of this.splats) if (s.pool && s.tint === tint && Math.abs(s.x - x) < 0.35) { near = s; break; }
    if (!near) {
      near = { x, w: 0.06, h: 0.02, dark: true, pool: true, tint };
      this.splats.push(near);
    }
    near.w = Math.min(0.75, near.w + amount * 7);
    near.h = Math.min(0.045, 0.012 + near.w * 0.05);
  }

  splat(x, r, tint = null) {
    for (const s of this.splats) {
      if (!s.pool && s.tint === tint && Math.abs(s.x - x) < s.w * 0.6) {
        s.w = Math.min(0.5, s.w + r * 0.4);
        return;
      }
    }
    if (this.splats.length >= MAX_SPLATS) this.splats.splice(this.splats.findIndex((s) => !s.pool), 1);
    this.splats.push({ x, w: r * rand(1.6, 3.2), h: r * rand(0.35, 0.6), dark: Math.random() < 0.35, pool: false, tint });
  }

  update(dt) {
    const sb = this.sb;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      d.vy -= G * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      let gone = false;
      if (d.y <= 0) {
        if (!d.water) this.splat(d.x, d.r, d.tint);
        gone = true;
      } else {
        const c = sb.crateAt(d.x, d.y);
        if (c) { if (!d.water) c.stain(d.x, d.y, d.r * 1.5, d.tint); gone = true; }
        else if (d.age > 0.05) gone = this.hitPerson(d);
      }
      if (gone || d.age > 4 || d.x < sb.left - 1 || d.x > sb.right + 1) this.drops.splice(i, 1);
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - dt * 3; p.vy *= 1 - dt * 3;
      if (p.age > p.life) this.puffs.splice(i, 1);
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.age += dt;
      if (b.age > b.life) this.bursts.splice(i, 1);
    }
    // smoke and steam: rising, slowing, spreading out
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const p = this.smokes[i];
      p.age += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx += Math.sin(p.age * 2 + p.y * 3) * 0.12 * dt;
      p.vy *= 1 - dt * 0.6;
      if (p.age > p.life) this.smokes.splice(i, 1);
    }
    for (let i = this.emberBits.length - 1; i >= 0; i--) {
      const e = this.emberBits[i];
      e.age += dt;
      e.x += (e.vx + Math.sin(e.age * 9 + e.seed) * 0.3) * dt; e.y += e.vy * dt;
      e.vy -= dt * 0.8;
      if (e.age > e.life) this.emberBits.splice(i, 1);
    }
    for (let i = this.iceBits.length - 1; i >= 0; i--) {
      const p = this.iceBits[i];
      p.age += dt;
      p.vy -= G * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.a += p.va * dt;
      if (p.y < p.s) { p.y = p.s; p.vy = Math.abs(p.vy) > 1 ? -p.vy * 0.3 : 0; p.vx *= 0.7; p.va *= 0.6; }
      if (p.age > p.life || p.x < sb.left - 1 || p.x > sb.right + 1) this.iceBits.splice(i, 1);
    }
    for (const list of [this.flashes, this.tracers]) {
      for (let i = list.length - 1; i >= 0; i--) if ((list[i].age += dt) > list[i].life) list.splice(i, 1);
    }
    for (const list of [this.sparkles, this.chips]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.age += dt;
        p.vy -= G * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.va) p.a += p.va * dt;
        if (p.y < 0) { p.y = 0; p.vy *= -0.3; p.vx *= 0.5; p.va = 0; }
        if (p.age > p.life) list.splice(i, 1);
      }
    }
    for (const c of this.casings) {
      if (c.rest) continue;
      c.vy -= G * dt;
      c.x += c.vx * dt; c.y += c.vy * dt;
      c.a += c.va * dt;
      const top = this.casingFloor(c.x, c.y);
      if (c.y <= top) {
        c.y = top;
        if (Math.abs(c.vy) > 0.8 && c.bounces < 4) {
          c.bounces++;
          this.sb.emit('casing', { x: c.x, y: c.y, speed: -c.vy });
          c.vy = -c.vy * 0.35;
          c.vx *= 0.55;
          c.va *= 0.5;
        } else {
          c.rest = true;
          c.vy = 0;
          c.a = Math.round(c.a / Math.PI) * Math.PI;
        }
      }
      if (c.x < sb.left || c.x > sb.right) { c.x = clampTo(c.x, sb.left, sb.right); c.vx = -c.vx * 0.3; }
    }
  }

  /** What an empty case lands on: the floor, or the top of a crate. */
  casingFloor(x, y) {
    let top = 0.006;
    for (const c of this.sb.crates) {
      if (c.removed || c.carriedBy || !c.body.contains(x, y - 0.02, 0.01)) continue;
      top = Math.max(top, c.body.topAt(x) + 0.006);
    }
    return top;
  }

  /** A drop that runs into someone may stay on them, on the bone it hit. */
  hitPerson(d) {
    if (!d.sticky) return false;
    for (const p of this.sb.people) {
      if (p === d.from && d.age < 0.4) continue;
      if (Math.abs(p.pos.x - d.x) > 1.2 || d.y > p.pos.y + 2.2) continue;
      const j = p.wj;
      if (Math.abs(d.x - j.hip.x) > 1) continue;
      if (Math.hypot(d.x - j.head.x, d.y - j.head.y) < (DIM.headR + 0.02) * p.scale) {
        p.headMark(d.x, d.y, 0.5 + d.r * 10);
        const m = p.headMarks[p.headMarks.length - 1];
        if (m) m.tint = d.tint;
        return true;
      }
      // the limbs; the spine is checked last, so an arm across the chest wins
      for (let b = 2; b < BONES.length; b++) {
        const [a, c] = BONES[b];
        const s = segDist(d.x, d.y, j[a].x, j[a].y, j[c].x, j[c].y);
        if (s.d < 0.045 * p.scale) {
          p.mark(b, s.t, 0.3 + d.r * 6, false, d.tint);
          return true;
        }
      }
      const t = segDist(d.x, d.y, j.hip.x, j.hip.y, j.neck.x, j.neck.y);
      if (t.d < 0.045 * p.scale) { p.mark(0, t.t, 0.3 + d.r * 6, false, d.tint); return true; }
    }
    return false;
  }
}
