/* =============================================================================
   Particles: blood, dust and the little bursts that go with a hit - and the
   gun's: the flash at the muzzle, the streak of a bullet, sparks, splinters,
   and the empty cases, which bounce and stay where they land.

   Blood is simulated until it lands, and it stays where it lands, on
   whatever it lands on: on the floor as a splat that spreads, on a wall as
   a splash that runs, on somebody as a mark on whichever bone it hit, and
   on anything else - a crate, a block, a knife, a gun, a vest, a severed
   limb, a mod's things - as a stain in that thing's own frame, so it goes
   where the thing goes (blood.js). Not everything bleeds red: whatever
   bleeds something else (a mod's robots bleed oil) gives its drops a tint,
   [colour, darker], and the tint goes wherever the drop does.

   A stream is blood coming out hard - an artery, a stump - and is drops
   one after another, each joined to the last, so it is drawn as one
   unbroken arc of it until it breaks up or lands. Wounds keep theirs going
   (feedStream, from blood.js); a bad blow lets out a squirt (gush).

   And what fire and ice give off (vitals.js): smoke and steam going up and
   spreading, embers rising and winking out, shards of ice that bounce and
   skitter, and meltwater, which drips and runs away rather than staying.
   ========================================================================== */
import { rand, chance, segDist, clamp as clampTo } from '../core/util.js';
import { BONES, DIM } from './skeleton.js';
import { goneAt } from './draw.js';
import { bloodK, stainThing } from './blood.js';

const G = 18;
const MAX_DROPS = 1400;
const MAX_SPLATS = 420;
const MAX_WALL = 160;
// how likely blood that runs into someone is to stay on them, rather than go past in front or behind
const STICK = 0.75;
const MAX_CASINGS = 80;
const MAX_SMOKE = 260;
const MAX_DEBRIS = 700;
const WATER = ['#9fd0f2', '#6aa9d6'];

export class FX {
  constructor(sandbox) {
    this.sb = sandbox;
    this.drops = [];
    this.puffs = [];
    this.bursts = [];
    this.splats = [];
    this.wallSplats = [];   // blood on the walls: { side (-1 left, 1 right), y, w, h, run, runTo, dark, tint }
    this.streams = [];      // blood coming out hard: see feedStream and gush
    this.flashes = [];
    this.tracers = [];
    this.sparkles = [];
    this.chips = [];
    this.casings = [];
    this.smokes = [];       // smoke and steam: { x, y, vx, vy, r, age, life, steam, k }
    this.emberBits = [];
    this.iceBits = [];
    this.debris = [];       // what comes off walls and trees: splinters, scraps, shards, leaves - { x, y, vx, vy, s, c, a, va, rest, age, sharp, leaf }
  }

  clear() {
    this.drops.length = 0;
    this.puffs.length = 0;
    this.bursts.length = 0;
    this.splats.length = 0;
    this.wallSplats.length = 0;
    this.streams.length = 0;
    this.flashes.length = 0;
    this.tracers.length = 0;
    this.sparkles.length = 0;
    this.chips.length = 0;
    this.casings.length = 0;
    this.smokes.length = 0;
    this.emberBits.length = 0;
    this.iceBits.length = 0;
    this.debris.length = 0;
  }

  /**
   * Bits off something broken, flung along (vx, vy): splinters, scraps of
   * steel (now and then still glowing), shards of glass - which cut whoever
   * they come down on - and leaves, which flutter. They come to rest where
   * they land, and stay a while.
   */
  bits(x, y, n, colour, vx = 0, vy = 0, o = {}) {
    for (let i = 0; i < n; i++) {
      if (this.debris.length >= MAX_DEBRIS) {
        // the oldest that have come to rest make room
        const k = this.debris.findIndex((d) => d.rest);
        this.debris.splice(k >= 0 ? k : 0, 1);
      }
      this.debris.push({
        x: x + rand(-0.01, 0.01), y: y + rand(-0.01, 0.01), vx: vx + rand(-0.4, 0.4), vy: vy + rand(-0.3, 0.5),
        s: o.size || 0.018, c: colour, a: rand(0, Math.PI), va: o.spin || o.leaf ? rand(-14, 14) : rand(-6, 6),
        rest: false, age: 0, sharp: !!o.sharp, leaf: !!o.leaf, glow: o.glow ? rand(0.4, 0.9) : 0, from: o.from || null,
      });
    }
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
  /** A spent case flying out of a gun (o.long: a rifle's; o.shell: a shotgun's, red). */
  casing(x, y, vx, vy, o = {}) {
    if (this.casings.length >= MAX_CASINGS) this.casings.shift();
    this.casings.push({ x, y, vx, vy, a: rand(0, Math.PI), va: rand(-30, 30), rest: false, bounces: 0, long: !!o.long, shell: !!o.shell });
  }

  /**
   * A spray of blood from (x, y), flung along (vx, vy) - or of oil, or acid,
   * given a tint. Out of somebody (`from`), as much as they have left to
   * give: none at all, bled dry.
   */
  blood(x, y, vx, vy, n, spread = 1, from = null, tint = null) {
    if (!this.sb.settings.blood) return;
    if (from && from.health) n = Math.round(n * bloodK(from));
    const t = tint || (from && from.tint) || null;
    for (let i = 0; i < n && this.drops.length < MAX_DROPS; i++) {
      const k = rand(0.3, 1.1);
      this.drops.push({
        x: x + rand(-0.02, 0.02), y: y + rand(-0.02, 0.02),
        vx: vx * k + rand(-1, 1) * spread, vy: vy * k + rand(-0.4, 1.4) * spread,
        r: rand(0.011, 0.028), age: 0, from, sticky: Math.random() < STICK, tint: t,
      });
    }
  }

  /** One drop of it, going exactly along (vx, vy). */
  drop(x, y, vx, vy, r = 0.016, from = null, tint = null) {
    if (!this.sb.settings.blood || this.drops.length >= MAX_DROPS) return null;
    const d = { x, y, vx, vy, r, age: 0, from, sticky: Math.random() < STICK, tint: tint || (from && from.tint) || null };
    this.drops.push(d);
    return d;
  }

  /** One slow drop, off a wound or a fist. */
  drip(x, y, from = null, tint = null) {
    if (!this.sb.settings.blood || this.drops.length >= MAX_DROPS) return;
    if (from && from.health && bloodK(from) <= 0) return;
    this.drops.push({ x, y, vx: rand(-0.15, 0.15), vy: rand(-0.3, 0), r: rand(0.01, 0.018), age: 0, from, sticky: Math.random() < STICK, tint: tint || (from && from.tint) || null });
  }

  /**
   * A stream kept going by whatever it is coming out of (blood.js
   * feedStreams), under its own name: where it comes out (x, y), which way
   * (nx, ny), how fast what it comes out of is going (vx, vy), how much is
   * coming (flow, 0..1) and how hard (power, metres a second). A stream
   * not fed again this step stops.
   */
  feedStream(key, o) {
    let s = null;
    for (const q of this.streams) if (q.key === key) { s = q; break; }
    if (!s) {
      s = { key, fixed: false, acc: 0, last: null };
      this.streams.push(s);
    }
    Object.assign(s, o);
    s.seen = this.sb.time;
    return s;
  }

  /**
   * A squirt: a stream from (x, y) along (vx, vy), k strong, for `life`
   * seconds, falling off as it goes - a bad blow, a limb the moment it
   * comes off. `follow(s)`, if given, moves it with what it comes out of.
   */
  gush(x, y, vx, vy, k = 1, life = 0.25, from = null, tint = null, follow = null) {
    if (!this.sb.settings.blood || k <= 0) return null;
    const sp = Math.hypot(vx, vy) || 1;
    const s = {
      key: null, fixed: true, t: 0, life, k, x, y, nx: vx / sp, ny: vy / sp, power: sp, vx: 0, vy: 0,
      flow: k, acc: 1, last: null, from, tint: tint || (from && from.tint) || null, follow,
    };
    this.streams.push(s);
    return s;
  }

  /** The streams pour: drops one after another, each joined to the one before while it comes hard. */
  updateStreams(dt) {
    const on = this.sb.settings.blood;
    for (let i = this.streams.length - 1; i >= 0; i--) {
      const s = this.streams[i];
      if (s.fixed) {
        s.t += dt;
        if (s.t >= s.life) { this.streams.splice(i, 1); continue; }
        s.flow = s.k * Math.sqrt(1 - s.t / s.life);
        if (s.follow) s.follow(s);
      } else if (s.seen !== this.sb.time) { this.streams.splice(i, 1); continue; }
      if (!on || s.flow < 0.03) { s.last = null; continue; }
      // hard, it holds together as a stream; between spurts it only dribbles
      const joined = s.flow > 0.18;
      s.acc += dt * (joined ? 64 : 12);
      while (s.acc >= 1) {
        s.acc -= 1;
        if (this.drops.length >= MAX_DROPS) break;
        const sp = s.power * (0.35 + 0.65 * Math.min(1, s.flow));
        // (held together, it hardly wavers; dribbling, each drop goes its own way)
        const j = joined ? 0.03 : 0.15;
        const d = {
          x: s.x, y: s.y,
          vx: s.nx * sp + s.vx + rand(-j, j), vy: s.ny * sp + s.vy + rand(-j, j),
          r: 0.007 + 0.014 * Math.min(1, s.flow), age: 0, from: s.from, sticky: Math.random() < STICK, tint: s.tint,
          link: joined ? s.last : null, stream: true,
        };
        this.drops.push(d);
        s.last = joined ? d : null;
      }
    }
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

  /** Blood on a wall (side -1 the left one, 1 the right) at height y: a splash, and now and then a run down from it. */
  wallSplat(side, y, r, tint = null) {
    for (const s of this.wallSplats) {
      if (s.side === side && s.tint === tint && Math.abs(s.y - y) < s.h * 0.6) {
        s.h = Math.min(0.3, s.h + r * 0.3);
        s.w = Math.min(0.08, s.w + r * 0.1);
        s.runTo = Math.min(s.y, 0.6, s.runTo + r * 1.5);
        return;
      }
    }
    if (this.wallSplats.length >= MAX_WALL) this.wallSplats.shift();
    this.wallSplats.push({ side, y, w: r * rand(1.2, 2), h: r * rand(1.8, 3.2), run: 0, runTo: chance(0.6) ? Math.min(y, r * rand(3, 12)) : 0, dark: chance(0.35), tint });
  }

  /** Blood straight onto whatever is at (x, y): the floor, a wall, or a thing - where a body hit it, say. */
  splashAt(x, y, r, tint = null) {
    const sb = this.sb;
    if (!sb.settings.blood) return;
    if (y <= 0.03) this.splat(x, r, tint);
    else if (x <= sb.left + 0.03) this.wallSplat(-1, y, r, tint);
    else if (x >= sb.right - 0.03) this.wallSplat(1, y, r, tint);
    else {
      const t = this.thingUnder(x, y);
      if (t) stainThing(t, x, y, r, tint);
    }
  }

  /**
   * Everything blood can land on but people, the floor and the walls, with
   * a box round each: crates and blocks, whatever is lying about or stuck
   * in something, severed limbs, a mod's things.
   */
  eachTarget(fn) {
    const sb = this.sb;
    for (const c of sb.crates) if (!c.removed) fn(c, c.body.aabb());
    for (const k of sb.knuckles) if (!k.wornBy && !k.removed) fn(k, k.body.aabb());
    for (const k of sb.blades) if (!k.wornBy && !k.removed && !(k.stuckIn && k.stuckIn.person)) fn(k, k.body.aabb());
    for (const g of sb.guns) if (!g.wornBy && !g.removed && g.body) fn(g, g.body.aabb());
    for (const v of sb.vests) if (!v.wornBy && !v.removed) fn(v, v.body.aabb());
    for (const a of sb.ammo) if (!a.removed) fn(a, a.body.aabb());
    for (const l of sb.limbs) if (!l.removed) fn(l, l.body.aabb());
    for (const w of sb.slabs) if (!w.removed) fn(w, w.body.aabb());
    for (const k of sb.crowbars) if (!k.wornBy && !k.removed) fn(k, k.body.aabb());
    // trees, bushes, and what has come off them: on the wood
    for (const t of [...sb.plants, ...sb.logs]) {
      if (t.removed) continue;
      const b = t.bounds();
      fn(t, { minX: b.x0, maxX: b.x1, minY: b.y0, maxY: b.y1 });
    }
    for (const it of sb.items) {
      if (it.removed || it.stainable === false || !it.pos) continue;
      // (a thing that is neither, a box big enough for anything: what it says it contains decides)
      const bb = it.body ? it.body.aabb() : it.rag ? it.rag.aabb(0.06) : { minX: it.pos.x - 1.6, maxX: it.pos.x + 1.6, minY: it.pos.y - 0.4, maxY: it.pos.y + 3.2 };
      fn(it, bb);
    }
  }

  /** Whether (x, y) is on the thing (its box having been checked). */
  static on(t, x, y) { return t.cols || t.boughs ? t.contains(x, y, 0) : t.body ? t.body.contains(x, y) : !!(t.contains && t.contains(x, y, 0)); }

  /** The thing at (x, y), if blood landing there would land on something. */
  thingUnder(x, y) {
    let hit = null;
    this.eachTarget((t, bb) => {
      if (!hit && x >= bb.minX && x <= bb.maxX && y >= bb.minY && y <= bb.maxY && FX.on(t, x, y)) hit = t;
    });
    return hit;
  }

  /** The things, by the metre across the world, for the drops in the air this step to look up. */
  gatherTargets() {
    const sb = this.sb, x0 = sb.left - 1, n = Math.ceil(sb.right - sb.left) + 3;
    if (!this.cols || this.cols.length !== n) this.cols = Array.from({ length: n }, () => []);
    for (const c of this.cols) c.length = 0;
    this.eachTarget((t, bb) => {
      const a = Math.max(0, Math.floor(bb.minX - x0)), b = Math.min(n - 1, Math.floor(bb.maxX - x0));
      for (let i = a; i <= b; i++) this.cols[i].push({ t, bb });
    });
    this.colX0 = x0;
  }

  /** What a drop at (x, y) has run into, of the things gathered this step (but `skip`). */
  targetAt(x, y, skip = null) {
    const col = this.cols && this.cols[Math.floor(x - this.colX0)];
    if (!col) return null;
    for (const { t, bb } of col) if (t !== skip && x >= bb.minX && x <= bb.maxX && y >= bb.minY && y <= bb.maxY && FX.on(t, x, y)) return t;
    return null;
  }

  update(dt) {
    const sb = this.sb;
    this.updateStreams(dt);
    if (this.drops.length) this.gatherTargets();
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
      } else if (d.x <= sb.left || d.x >= sb.right) {
        if (!d.water) this.wallSplat(d.x <= sb.left ? -1 : 1, d.y, d.r, d.tint);
        gone = true;
      } else {
        // whoever is in the way first (they stand in front of things), then whatever it is
        if (d.age > 0.05 && !d.water) gone = this.hitPerson(d);
        if (!gone) {
          // (not, at first, what it came out of: a severed limb's own blood falls off it)
          const t = this.targetAt(d.x, d.y, d.age < 0.4 ? d.from : null);
          if (t) { if (!d.water) stainThing(t, d.x, d.y, d.r * 1.5, d.tint); gone = true; }
        }
      }
      if (gone || d.age > 4) {
        // (the next drop of a stream sees this one is gone, and starts the stream again from itself)
        d.gone = true;
        const last = this.drops.pop();
        if (last !== d) this.drops[i] = last;
      }
    }
    // blood on a wall runs down it, slowly, for a while
    for (const w of this.wallSplats) if (w.run < w.runTo) w.run = Math.min(w.runTo, w.run + dt * 0.05);
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
    this.updateDebris(dt);
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

  /**
   * The bits fall, tumble and come to rest on the floor or on top of
   * something; leaves drift as they go. A shard coming down on somebody cuts
   * them. After half a minute or so they fade.
   */
  updateDebris(dt) {
    const sb = this.sb;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.age += dt;
      if (d.glow) d.glow = Math.max(0, d.glow - dt * 0.8);
      if (d.rest) { if (d.age > 40) this.debris.splice(i, 1); continue; }
      if (d.leaf) {
        // a leaf falls slowly, rocking from side to side
        d.vy = Math.max(d.vy - G * 0.12 * dt, -0.7);
        d.vx += Math.sin(d.age * 5 + d.a) * 1.6 * dt;
        d.vx *= 1 - dt * 1.5;
      } else d.vy -= G * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.a += d.va * dt;
      if (d.sharp && d.vy < -2 && d.age > 0.05) this.shardHits(d);
      const top = this.casingFloor(d.x, d.y + 0.02);
      if (d.y <= top) {
        d.y = top;
        if (Math.abs(d.vy) > 1.2 && !d.leaf) { d.vy = -d.vy * 0.25; d.vx *= 0.5; d.va *= 0.5; }
        else { d.rest = true; d.vx = d.vy = d.va = 0; d.age = 0; }
      }
      if (d.x < sb.left) { d.x = sb.left; d.vx = -d.vx * 0.3; }
      if (d.x > sb.right) { d.x = sb.right; d.vx = -d.vx * 0.3; }
    }
  }

  /** A falling shard of glass coming down on somebody: a small cut where it lands. */
  shardHits(d) {
    for (const p of this.sb.people) {
      if (p.removed || d.x < p.box.minX || d.x > p.box.maxX || d.y < p.box.minY || d.y > p.box.maxY) continue;
      const t = p.touch(d.x, d.y, 0.01);
      if (!t) continue;
      if (this.sb.time - (p.shardT || -9) > 0.3) {
        p.shardT = this.sb.time;
        p.takeHit({ by: null, part: t.part, x: t.x, y: t.y, dir: Math.sign(d.vx) || 1, power: clampTo(-d.vy * 0.05, 0.15, 0.6), kind: 'slash', weapon: 'glass', bone: p.boneName(t.bone, t.t) });
      }
      d.vy = -d.vy * 0.2;
      d.vx *= 0.3;
      d.sharp = false;
      return;
    }
  }

  /** What an empty case lands on: the floor, or the top of a crate. */
  casingFloor(x, y) {
    let top = 0.006;
    for (const c of this.sb.crates) {
      if (c.removed || c.carriedBy || !c.body.contains(x, y - 0.02, 0.01)) continue;
      top = Math.max(top, c.body.topAt(x) + 0.006);
    }
    for (const s of this.sb.slabs) {
      if (s.removed || !s.body.contains(x, y - 0.02, 0.01)) continue;
      top = Math.max(top, s.body.topAt(x) + 0.006);
    }
    return top;
  }

  /** A drop that runs into someone may stay on them, on the bone it hit (as blood on them, not a wound of theirs). */
  hitPerson(d) {
    if (!d.sticky) return false;
    for (const p of this.sb.people) {
      if (p === d.from && d.age < 0.4) continue;
      if (Math.abs(p.pos.x - d.x) > 1.2 || d.y > p.pos.y + 2.2) continue;
      const j = p.wj;
      if (Math.abs(d.x - j.hip.x) > 1) continue;
      if (Math.hypot(d.x - j.head.x, d.y - j.head.y) < (DIM.headR + 0.02) * p.scale) {
        p.headMark(d.x, d.y, 0.5 + d.r * 10, false, true, d.tint);
        return true;
      }
      // the limbs (not what is not there any more); the spine is checked last, so an arm across the chest wins
      for (let b = 2; b < BONES.length; b++) {
        const [a, c] = BONES[b];
        const s = segDist(d.x, d.y, j[a].x, j[a].y, j[c].x, j[c].y);
        if (s.d < 0.045 * p.scale && !goneAt(p.cut, b, s.t)) {
          p.mark(b, s.t, 0.3 + d.r * 6, false, d.tint, true);
          return true;
        }
      }
      const t = segDist(d.x, d.y, j.hip.x, j.hip.y, j.neck.x, j.neck.y);
      if (t.d < 0.045 * p.scale) { p.mark(t.t < 0.5 ? 0 : 1, t.t < 0.5 ? t.t * 2 : t.t * 2 - 1, 0.3 + d.r * 6, false, d.tint, true); return true; }
    }
    return false;
  }
}
