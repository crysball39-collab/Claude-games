/* =============================================================================
   SHIN GODZILLA - what comes out of him.

     Spew         before the beam, out of his split jaws: first black smog,
                  thick and slow, rolling out over the street - hardly a
                  breath of air in it; then the smog catching, and fire
                  pouring out after it, everything it rolls over burning;
                  then the fire drawn in, thinner and faster and going purple,
                  the beam coming down the middle of it
     Beam         the beam itself: a thin line of purple light that goes
                  straight through whatever is in its way. Whoever it touches
                  is gone; a building it crosses is cut clean through along
                  it, and whatever that leaves hanging comes down; where it
                  meets the ground, the ground goes up in flames. Out of his
                  mouth, out of the plates on his back (a dozen at once,
                  sweeping), and out of the end of his tail.
     EvolveCloud  the steam he changes from one form into the next in
     Gush         the red that pours out of the gills of his early forms

   Effects go in sandbox.effects ({ update(dt) -> false when done, draw }),
   tagged with the mod so that removing it clears them out.
   ========================================================================== */
import { rand, chance, clamp, lerp, TAU } from '../../core/util.js';
import { ignite, breatheSmoke } from '../../game/vitals.js';
import { defineArm } from '../../game/props.js';
import { explode } from '../../game/explode.js';
import { blame, mostlyGone, struck } from './world.js';

const MOD = 'godzilla';
const SCORCH = ['#1b1210', '#0d0807'];

defineArm('shinBeam', { name: 'Atomic beam', noun: 'beam', cause: 'atomic beam', burn: true, ignite: false, shove: 0.6, nasty: 3, memory: 'hurtMe', hurt: 'gzBurned', verb: 'burned me', power: 14 });
defineArm('shinFire', { name: 'Atomic fire', noun: 'fire', cause: 'burned alive', burn: true, shove: 0.3, nasty: 3, memory: 'hurtMe', hurt: 'gzBurned', verb: 'burned me', power: 10 });

/** Does the segment (x0, y0)-(x1, y1) cross the box b at all? */
function segBox(x0, y0, x1, y1, b) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  for (const [p, d, lo, hi] of [[x0, dx, b.minX, b.maxX], [y0, dy, b.minY, b.maxY]]) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
    let a = (lo - p) / d, c = (hi - p) / d;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    if (t0 > t1) return false;
  }
  return true;
}

/* ---------------------------------- the beam ---------------------------------- */

/**
 * A beam out of him: src() says where it starts and which way it goes
 * ({ x, y, dx, dy }, in the world), every step. o.width how thick its core
 * is, o.range how far it goes, o.ground whether the ground it meets goes up
 * in flames, o.tick how often it does what it does, o.k how much harm.
 */
export class Beam {
  constructor(sb, man, src, o = {}) {
    this.mod = MOD;
    this.sb = sb;
    this.man = man;
    this.src = src;
    this.w = o.width ?? 0.42;
    this.range = o.range ?? 75;
    this.ground = o.ground !== false;
    this.every = o.tick ?? 0.05;
    this.k = o.k ?? 1;
    this.t = 0;
    this.on = true;
    this.off = 0;
    this.reach = 0;
    this.tickT = 0;
    this.boomT = 0.2;
    this.from = null;
    this.end = null;
    this.hits = 0;
  }

  stop() { this.on = false; }

  update(dt) {
    const man = this.man, sb = this.sb;
    if (man.removed || !man.gz || !man.gz.body || !man.gz.body.sk) return false;
    this.t += dt;
    if (!this.on) { this.off += dt; return this.off < 0.3; }
    const s = this.src();
    if (!s) return true;
    this.from = s;
    this.reach = Math.min(this.range, this.reach + dt * 170);
    // where it ends: the ground, the end of the world, or as far as it reaches
    let d = this.reach;
    if (s.dy < -1e-4) d = Math.min(d, Math.max(0, (s.y - 0.03) / -s.dy));
    if (s.dx > 1e-4) d = Math.min(d, (sb.right + 1 - s.x) / s.dx);
    else if (s.dx < -1e-4) d = Math.min(d, (sb.left - 1 - s.x) / s.dx);
    d = Math.max(0, d);
    this.d = d;
    this.end = { x: s.x + s.dx * d, y: s.y + s.dy * d };
    this.ground0 = s.dy < -1e-4 && this.end.y < 0.1 && d < this.reach - 1e-3;
    if ((this.tickT -= dt) <= 0) { this.tickT = this.every; this.cut(s, d); }
    // the ground it lands on goes up
    if (this.ground0) {
      if (Math.random() < dt * 30) sb.fx.embers(this.end.x + rand(-0.4, 0.4), 0.1, 2);
      if (this.ground && (this.boomT -= dt) <= 0) {
        this.boomT = 0.42;
        explode(sb, this.end.x, 0.35, 'flare', man);
        if (chance(0.6)) sb.fx.splat(this.end.x + rand(-0.6, 0.6), rand(0.4, 0.8), SCORCH);
      }
    }
    return true;
  }

  /** What it does along the whole of it, now: cuts, burns, kills. */
  cut(s, d) {
    const sb = this.sb, man = this.man, ex = s.x + s.dx * d, ey = s.y + s.dy * d;
    const x0 = Math.min(s.x, ex), x1 = Math.max(s.x, ex), y0 = Math.min(s.y, ey), y1 = Math.max(s.y, ey);
    // walls, buildings, what has come off them: a line cut clean through
    for (const w of [...sb.slabs]) {
      if (w.removed) continue;
      const b = w.body.aabb();
      if (x1 < b.minX || x0 > b.maxX || y1 < b.minY || y0 > b.maxY || !segBox(s.x, s.y, ex, ey, b)) continue;
      blame(man, w);
      if (w.background && w.gzCells0 === undefined) w.gzCells0 = w.cellCount;
      const n = w.carve(s.x, s.y, ex, ey, this.w * 0.9, { dx: s.dx * 0.5, dy: 0.5, speed: 2, bulk: true, soft: true, mark: false });
      if (n) {
        this.hits += n;
        if (w.background && !w.removed) mostlyGone(man, w);
      }
    }
    // trees and bushes: burned through where it crosses them
    for (const t of sb.plants) {
      if (t.removed) continue;
      const b = t.bounds();
      if (x1 < b.x0 || x0 > b.x1 || y1 < b.y0 || y0 > b.y1 || !segBox(s.x, s.y, ex, ey, { minX: b.x0, maxX: b.x1, minY: b.y0, maxY: b.y1 })) continue;
      // (along it, where it is inside the tree's box)
      for (let u = 0; u <= d; u += 0.6) {
        const x = s.x + s.dx * u, y = s.y + s.dy * u;
        if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
        t.damage(x, y, 0.5, 40, 'blast', { dx: s.dx, dy: s.dy, speed: 2 });
        if (t.removed) break;
      }
    }
    // whoever it touches
    for (const p of [...sb.people]) {
      if (p === man || p.removed) continue;
      if (p.box.maxX < x0 - 1 || p.box.minX > x1 + 1 || p.box.maxY < y0 - 1 || p.box.minY > y1 + 1) continue;
      let hit = null;
      if (p.species && p.species.shape) {
        // (something the size of a building: wherever the line goes into it)
        const r = p.rayHit(s.x, s.y, s.dx, s.dy, d);
        if (r) hit = { part: r.part, x: r.x, y: r.y, bone: r.bone, t: r.tb };
      } else {
        // (anyone else: the part of them nearest the line, if it is near enough)
        for (const j of [p.wj.head, p.wj.chest, p.wj.hip, p.wj.kneeA, p.wj.kneeB]) {
          const u = clamp((j.x - s.x) * s.dx + (j.y - s.y) * s.dy, 0, d);
          const q = p.nearestPart(s.x + s.dx * u, s.y + s.dy * u);
          if (q && q.d < this.w * 0.6 + 0.2 && (!hit || q.d < hit.d)) hit = q;
        }
      }
      if (!hit) continue;
      struck(man, p);
      const giant = !!(p.species && p.species.giant);
      p.takeHit({ by: man, part: hit.part, x: hit.x, y: hit.y, dir: Math.sign(s.dx) || 1, power: (giant ? 9 : 7) * this.k, kind: 'burn', weapon: 'shinBeam', bone: p.boneName(hit.bone, hit.t) });
      if (p.removed || giant) continue;
      // (what is left of them, alight)
      ignite(p, { power: 1, by: man });
      if (!p.dead && p.alive) p.health.hit('torso', 60 * this.k, { burn: true, cutBy: 'Atomic beam', cause: 'atomic beam' });
      if (p.health.dead && p.alive) p.die('atomic beam', man);
      sb.emit('shinBeamHit', { who: p, by: man, x: hit.x, y: hit.y });
    }
    // loose things: knocked off the line of it
    for (const t of sb.loose()) {
      if (!t.body || t.removed || t.body.invMass === 0) continue;
      const b = t.body.pos;
      if (b.x < x0 - 1 || b.x > x1 + 1 || b.y < y0 - 1 || b.y > y1 + 1) continue;
      const u = clamp((b.x - s.x) * s.dx + (b.y - s.y) * s.dy, 0, d);
      if (Math.hypot(b.x - (s.x + s.dx * u), b.y - (s.y + s.dy * u)) > 0.8) continue;
      t.body.vel.x += s.dx * 2 + rand(-1, 1);
      t.body.vel.y += 2.5;
    }
  }

  draw(ctx) {
    const s = this.from, e = this.end;
    if (!s || !e) return;
    const fade = this.on ? Math.min(1, this.t / 0.06) : Math.max(0, 1 - this.off / 0.3);
    if (fade <= 0) return;
    const flick = 0.86 + Math.sin(this.t * 57) * 0.08 + Math.sin(this.t * 23) * 0.06;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const [w, col, a] of [[this.w * 5, '120, 50, 255', 0.13], [this.w * 2.6, '160, 100, 255', 0.3], [this.w * 1.3, '205, 165, 255', 0.6], [this.w * 0.5, '255, 248, 255', 0.95]]) {
      ctx.strokeStyle = `rgba(${col}, ${a * fade * flick})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
    }
    // where it comes out of him, and where it lands: a glare
    for (const [p, r, a] of [[s, this.w * 4, 0.7], ...(this.ground0 ? [[e, this.w * 7, 0.85]] : [])]) {
      const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      gr.addColorStop(0, `rgba(255, 245, 255, ${a * fade})`);
      gr.addColorStop(0.4, `rgba(185, 130, 255, ${a * 0.45 * fade})`);
      gr.addColorStop(1, 'rgba(120, 60, 255, 0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

/* ---------------------------------- the spew ---------------------------------- */

const SOOT = ['#0d0a0a', '#2a2321'];
// (the fire's colours, hottest first: orange, and - drawn in for the beam - purple)
const FLAME = [[255, 210, 120], [255, 120, 40], [200, 50, 20]];
const VIOLET = [[238, 214, 255], [172, 104, 255], [104, 46, 210]];

/**
 * What pours out of his split jaws before the beam - src() says where it
 * comes out and which way, every step - as the move says (mode):
 *   smog    black smoke, thick and slow: it rolls out over the street and
 *           lies there, and whoever is in it can hardly breathe
 *   fire    (ignite()) the smoke catching, out from his mouth along all of
 *           it - and fire pouring out after it: whoever it rolls over burns
 *   narrow  the fire drawn in (narrow, 0..1), thinner and faster, going from
 *           orange to purple - and down the middle of it, the beam coming
 */
export class Spew {
  constructor(sb, man, src) {
    this.mod = MOD;
    this.sb = sb;
    this.man = man;
    this.src = src;
    this.parts = [];
    this.mode = 'smog';
    this.narrow = 0;
    this.front = -1;
    this.litT = 0;
    this.lit0 = null;
    this.from = null;
    this.on = true;
    this.t = 0;
    this.acc = 0;
    this.tickT = 0;
  }

  stop() { this.on = false; }

  /** The smoke catches: from his mouth out, along all of it. */
  ignite() {
    if (this.front >= 0) return;
    this.front = 0;
    this.litT = this.t;
    this.lit0 = this.from ? { x: this.from.x, y: this.from.y } : null;
    this.mode = 'fire';
  }

  update(dt) {
    const man = this.man, sb = this.sb;
    if (man.removed || !man.gz || !man.gz.body || !man.gz.body.sk) return false;
    this.t += dt;
    const s = this.on ? this.src() : null;
    this.from = s;
    if (s) this.pour(s, dt);
    // the fire going out along the smoke from where it caught: every puff of it it reaches goes up at once
    if (this.front >= 0 && this.front < 90) {
      this.front += dt * 24;
      const o = this.lit0 || s;
      if (o) {
        for (const q of this.parts) {
          if (q.fire || q.born > this.litT || Math.hypot(q.x - o.x, q.y - o.y) > this.front) continue;
          q.fire = true;
          q.caught = true;
          q.age = 0;
          q.life = rand(0.8, 1.5);
          q.vy += rand(0.5, 2);
          if (chance(0.15)) sb.fx.embers(q.x, q.y, 2);
        }
      }
    }
    for (const q of this.parts) {
      q.age += dt;
      if (q.fire) {
        // (poured, it comes down on the street and floods along it - the less, the more it is drawn in; caught, it goes up)
        const k = Math.exp(-dt * (q.caught ? 2.2 : 1));
        q.vx *= k;
        q.vy = q.vy * k + (q.caught ? 2.5 : -4 * (1 - (q.purple || 0))) * dt;
        q.r += dt * (q.caught ? 0.7 : 1.1);
      } else {
        // the smog: heavy - it sinks onto the street and rolls out along it, and only lifts, slowly, once it has spread
        const k = Math.exp(-dt * 0.55);
        q.vx *= k;
        q.vy = q.vy * k + (0.25 - 3.2 * Math.max(0, 1 - q.age / 2.5)) * dt;
        q.r += dt * 0.5;
      }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.y < q.r * 0.55) {
        // (coming down on the street: it goes on out along it, the way it was going)
        if (q.vy < -0.5) q.vx += (Math.sign(q.vx) || (chance(0.5) ? 1 : -1)) * Math.min(10, -q.vy) * 0.55;
        q.y = q.r * 0.55;
        q.vy = Math.abs(q.vy) * 0.1;
      }
      if (q.x < sb.left || q.x > sb.right) q.vx = -q.vx * 0.3;
    }
    this.parts = this.parts.filter((q) => q.age < q.life);
    if ((this.tickT -= dt) <= 0) { this.tickT = 0.12; this.burn(); }
    return this.on || this.parts.length > 0;
  }

  /** More of it, out of his mouth. */
  pour(s, dt) {
    const n = this.narrow, mode = this.mode;
    this.acc += dt * (mode === 'smog' ? 95 : 250 - n * 90);
    const a0 = Math.atan2(s.dy, s.dx);
    while (this.acc >= 1) {
      this.acc -= 1;
      if (this.parts.length >= 560) { this.acc = 0; break; }
      if (mode === 'smog') {
        const a = a0 + rand(-0.3, 0.3), v = rand(10, 15);
        this.parts.push({ x: s.x + rand(-0.4, 0.4), y: s.y + rand(-0.4, 0.4), vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rand(0.55, 0.95), age: 0, life: rand(4, 7), fire: false, born: this.t, seed: rand(0, 6) });
        continue;
      }
      // (fire, with some smoke still in it - less and less of it, and narrower and faster, as it draws in)
      const spread = lerp(0.2, 0.03, n), a = a0 + rand(-spread, spread), v = rand(14, 22) * (1 + n * 0.6), fire = chance(0.62 + n * 0.38);
      const off = 0.3 * (1 - n * 0.7);
      this.parts.push({
        x: s.x + rand(-off, off), y: s.y + rand(-off, off), vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rand(0.35, 0.65) * (1 - n * 0.45), age: 0,
        life: fire ? rand(1.1, 1.8) * (1 - n * 0.35) : rand(2, 3.2), fire, purple: n, born: this.t, seed: rand(0, 6),
      });
    }
  }

  /**
   * Whoever the fire rolls over burns, and walls and buildings it rolls into
   * are scorched; whoever is in the smog breathes it.
   */
  burn() {
    const sb = this.sb, man = this.man;
    const fires = [], smog = [];
    for (const q of this.parts) {
      if (q.fire) { if (q.age < q.life * 0.8) fires.push(q); } else if (q.age > 0.25) smog.push(q);
    }
    if (!fires.length && !smog.length) return;
    const near = (p, q, f) => !(q.x < p.box.minX - q.r * f || q.x > p.box.maxX + q.r * f || q.y < p.box.minY - q.r * f || q.y > p.box.maxY + q.r * f);
    for (const p of sb.people) {
      if (p === man || p.removed || (p.species && p.species.giant)) continue;
      let hit = null;
      for (const q of fires) if (near(p, q, 1)) { hit = q; break; }
      if (!hit) {
        // (in the smog: how thick it is round them)
        let thick = 0;
        for (const q of smog) if (near(p, q, 0.6) && (thick += (1 - q.age / q.life) * 0.5) >= 1) break;
        if (thick > 0.15 && p.alive) {
          breatheSmoke(p, Math.min(1, thick));
          if (p.brain && chance(0.06)) p.brain.speak('inSmog', {}, 1, null, false);
        }
        continue;
      }
      struck(man, p);
      const n = p.nearestPart(hit.x, hit.y);
      p.takeHit({ by: man, part: n.part, x: n.x, y: n.y, dir: Math.sign(hit.vx) || 1, power: 1.6, kind: 'burn', weapon: 'shinFire', bone: p.boneName(n.bone, n.t) });
      if (!p.removed) ignite(p, { power: 1, by: man });
      if (!p.removed && !p.lying && !p.rag && p.alive && Math.abs(hit.vx) > 4) p.launch(Math.sign(hit.vx) * 4, 2.5);
    }
    if (!fires.length) return;
    // (a few of them, each time: what they are in, scorched)
    for (let i = 0; i < 3; i++) {
      const q = fires[Math.floor(Math.random() * fires.length)];
      for (const w of sb.slabs) {
        if (w.removed || !w.contains(q.x, q.y, q.r * 0.5)) continue;
        blame(man, w);
        w.damage(q.x, q.y, q.r, 1.2, 'blast', { dx: q.vx * 0.05, dy: 0.5, speed: 1, bulk: true, soft: true, mark: false });
      }
    }
    const q = fires[Math.floor(Math.random() * fires.length)];
    if (q.y < 1) sb.fx.splat(q.x, rand(0.3, 0.6), SCORCH);
  }

  draw(ctx) {
    ctx.save();
    // the smoke: thick, black, rolling - a dimmer edge round each puff of it
    for (const q of this.parts) {
      if (q.fire) continue;
      const k = q.age / q.life, a = Math.min(1, q.age * 2.5) * Math.pow(1 - k, 0.8) * 0.62;
      ctx.globalAlpha = a * 0.45;
      ctx.fillStyle = SOOT[1];
      ctx.beginPath();
      ctx.arc(q.x, q.y + q.r * 0.1, q.r * 1.12, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = a;
      ctx.fillStyle = SOOT[0];
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // the fire in it
    ctx.globalCompositeOperation = 'lighter';
    for (const q of this.parts) {
      if (!q.fire) continue;
      const k = q.age / q.life, a = (1 - k) * (q.caught ? 0.5 : 0.6), i = k < 0.25 ? 0 : k < 0.6 ? 1 : 2, u = q.purple || 0;
      const c0 = FLAME[i], c1 = VIOLET[i];
      ctx.fillStyle = `rgba(${Math.round(lerp(c0[0], c1[0], u))}, ${Math.round(lerp(c0[1], c1[1], u))}, ${Math.round(lerp(c0[2], c1[2], u))}, ${a})`;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r * (0.8 + 0.2 * Math.sin(this.t * 20 + q.seed)), 0, TAU);
      ctx.fill();
    }
    // drawn in to nothing, the beam coming down the middle of it: a thread of light, brighter and longer
    const s = this.from, n = this.narrow;
    if (this.on && s && n > 0.05) {
      const len = 3 + n * 16, w = 0.05 + n * 0.16, fl = 0.7 + Math.sin(this.t * 71) * 0.2 + Math.sin(this.t * 29) * 0.1;
      ctx.lineCap = 'round';
      for (const [lw, col, a] of [[w * 4, '150, 90, 255', 0.2], [w * 1.6, '200, 160, 255', 0.45], [w * 0.6, '250, 240, 255', 0.9]]) {
        ctx.strokeStyle = `rgba(${col}, ${a * n * fl})`;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + s.dx * len, s.y + s.dy * len);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

/* -------------------------------- changing form -------------------------------- */

/**
 * The steam he changes in: pouring off all of him, white, until there is
 * hardly anything of him to be seen in it - then (stop()) thinning away
 * from whatever comes out of it.
 */
export class EvolveCloud {
  constructor(sb, man) {
    this.mod = MOD;
    this.sb = sb;
    this.man = man;
    this.parts = [];
    this.on = true;
    this.t = 0;
    this.acc = 0;
  }

  stop() { this.on = false; }

  update(dt) {
    const man = this.man, g = man.gz && man.gz.body;
    this.t += dt;
    if (this.on && g && g.caps.length && !man.removed) {
      // (thicker as it goes on)
      this.acc += dt * Math.min(120, 40 + this.t * 60);
      let tries = 0;
      while (this.acc >= 1 && this.parts.length < 380 && tries++ < 400) {
        // (off the big parts of him more than the small: a piece picked by how thick it is)
        const c = g.caps[Math.floor(Math.random() * g.caps.length)];
        if (Math.random() > c.r / 2.2) continue;
        this.acc -= 1;
        const u = Math.random(), a = rand(0, TAU), rr = c.r * Math.sqrt(Math.random());
        const x = c.x0 + (c.x1 - c.x0) * u + Math.cos(a) * rr, y = Math.max(0.3, c.y0 + (c.y1 - c.y0) * u + Math.sin(a) * rr);
        this.parts.push({ x, y, vx: rand(-1.6, 1.6), vy: rand(0.4, 2.2), r: rand(0.5, 1.1) + c.r * 0.35, age: 0, life: rand(2, 3.4) });
      }
    }
    for (const q of this.parts) {
      q.age += dt;
      const k = Math.exp(-dt * 0.9);
      q.vx *= k;
      q.vy = q.vy * k + 0.5 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.r += dt * 0.9;
      if (q.y < q.r * 0.5) q.y = q.r * 0.5;
    }
    this.parts = this.parts.filter((q) => q.age < q.life);
    return (this.on && !man.removed) || this.parts.length > 0;
  }

  draw(ctx) {
    ctx.save();
    for (const q of this.parts) {
      const k = q.age / q.life, a = Math.min(1, q.age * 4) * Math.pow(1 - k, 1.3);
      // (the shadowed underside of each billow, then the white of it)
      ctx.fillStyle = `rgba(148, 154, 160, ${0.34 * a})`;
      ctx.beginPath();
      ctx.arc(q.x, q.y - q.r * 0.15, q.r * 1.05, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(230, 233, 236, ${0.55 * a})`;
      ctx.beginPath();
      ctx.arc(q.x, q.y + q.r * 0.1, q.r * 0.85, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

/* ---------------------------------- the gills ---------------------------------- */

const GILL_RED = ['#c41f14', '#5e0c08'];

/**
 * Red pouring out of the gills down the side of its neck - src() says from
 * where, and how fast, every step - in gouts that fall, splash on the street
 * and pool there.
 */
export class Gush {
  constructor(sb, man, src) {
    this.mod = MOD;
    this.sb = sb;
    this.man = man;
    this.src = src;
    this.drops = [];
    this.on = true;
    this.acc = 0;
  }

  stop() { this.on = false; }

  update(dt) {
    const sb = this.sb, man = this.man;
    if (this.on && sb.settings.blood && !man.removed && man.gz && man.gz.body && man.gz.body.sk) {
      this.acc += dt * 70;
      while (this.acc >= 1 && this.drops.length < 260) {
        this.acc -= 1;
        const s = this.src();
        if (!s) break;
        this.drops.push({ x: s.x, y: s.y, vx: s.vx + rand(-0.8, 0.8), vy: s.vy + rand(-0.6, 0.8), r: rand(0.07, 0.17), age: 0 });
      }
    }
    for (const d of this.drops) {
      d.age += dt;
      d.vy -= 9.8 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.y > d.r) continue;
      d.done = true;
      if (chance(0.25)) sb.fx.pool(d.x, 0, 0.05, GILL_RED);
      if (chance(0.15)) sb.fx.splat(d.x, rand(0.15, 0.35), GILL_RED);
      // (and a splash up off the street)
      if (chance(0.3)) sb.fx.blood(d.x, 0.05, d.vx * 0.2, 1.2, 3, 0.8, null, GILL_RED);
    }
    this.drops = this.drops.filter((d) => !d.done && d.age < 4);
    return this.on || this.drops.length > 0;
  }

  draw(ctx) {
    if (!this.drops.length) return;
    ctx.save();
    ctx.fillStyle = GILL_RED[0];
    for (const d of this.drops) {
      // (drawn out along the way it is going, the faster the longer)
      const a = Math.atan2(d.vy, d.vx), sp = Math.hypot(d.vx, d.vy);
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r * (1 + Math.min(1.5, sp * 0.12)), d.r, a, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}
