/* =============================================================================
   SHIN GODZILLA - what comes out of him.

     Spew   before the beam: black smoke and fire, pouring out of his split
            jaws in a flood, down onto the street and along it - everything
            it rolls over burns
     Beam   the beam itself: a thin line of purple light that goes straight
            through whatever is in its way. Whoever it touches is gone; a
            building it crosses is cut clean through along it, and whatever
            that leaves hanging comes down; where it meets the ground, the
            ground goes up in flames. Out of his mouth, out of the plates
            on his back (a dozen at once, sweeping), and out of the end of
            his tail.

   Effects go in sandbox.effects ({ update(dt) -> false when done, draw }),
   tagged with the mod so that removing it clears them out.
   ========================================================================== */
import { rand, chance, clamp, TAU } from '../../core/util.js';
import { ignite } from '../../game/vitals.js';
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

/**
 * Black smoke and fire out of his mouth, in a flood: src() says where it
 * comes out and which way, every step.
 */
export class Spew {
  constructor(sb, man, src) {
    this.mod = MOD;
    this.sb = sb;
    this.man = man;
    this.src = src;
    this.parts = [];
    this.on = true;
    this.t = 0;
    this.acc = 0;
    this.tickT = 0;
  }

  stop() { this.on = false; }

  update(dt) {
    const man = this.man, sb = this.sb;
    if (man.removed || !man.gz || !man.gz.body || !man.gz.body.sk) return false;
    this.t += dt;
    const s = this.on ? this.src() : null;
    if (s) {
      this.acc += dt * 260;
      while (this.acc >= 1 && this.parts.length < 520) {
        this.acc -= 1;
        const a = Math.atan2(s.dy, s.dx) + rand(-0.2, 0.2), v = rand(11, 19), fire = chance(0.42);
        this.parts.push({ x: s.x + rand(-0.3, 0.3), y: s.y + rand(-0.3, 0.3), vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rand(0.35, 0.65), age: 0, life: fire ? rand(0.9, 1.5) : rand(1.6, 2.6), fire, seed: rand(0, 6) });
      }
    }
    for (const q of this.parts) {
      q.age += dt;
      const k = Math.exp(-dt * (q.fire ? 1.4 : 1.8));
      q.vx *= k;
      q.vy = q.vy * k + (q.fire ? -3 : 1.6) * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.r += dt * (q.fire ? 1.1 : 1.8);
      // along the ground, it spreads out
      if (q.y < q.r * 0.55) { q.y = q.r * 0.55; q.vy = Math.abs(q.vy) * 0.1; }
      if (q.x < sb.left || q.x > sb.right) q.vx = -q.vx * 0.3;
    }
    this.parts = this.parts.filter((q) => q.age < q.life);
    if ((this.tickT -= dt) <= 0) { this.tickT = 0.12; this.burn(); }
    return this.on || this.parts.length > 0;
  }

  /** Whoever the fire rolls over burns; walls and buildings it rolls into are scorched. */
  burn() {
    const sb = this.sb, man = this.man;
    const fires = this.parts.filter((q) => q.fire && q.age < q.life * 0.8);
    if (!fires.length) return;
    for (const p of sb.people) {
      if (p === man || p.removed || (p.species && p.species.giant)) continue;
      let hit = null;
      for (const q of fires) {
        if (q.x < p.box.minX - q.r || q.x > p.box.maxX + q.r || q.y < p.box.minY - q.r || q.y > p.box.maxY + q.r) continue;
        hit = q;
        break;
      }
      if (!hit) continue;
      struck(man, p);
      const n = p.nearestPart(hit.x, hit.y);
      p.takeHit({ by: man, part: n.part, x: n.x, y: n.y, dir: Math.sign(hit.vx) || 1, power: 1.6, kind: 'burn', weapon: 'shinFire', bone: p.boneName(n.bone, n.t) });
      if (!p.removed) ignite(p, { power: 1, by: man });
      if (!p.removed && !p.lying && !p.rag && p.alive && Math.abs(hit.vx) > 4) p.launch(Math.sign(hit.vx) * 4, 2.5);
    }
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
    // the smoke: thick, black, rolling
    for (const q of this.parts) {
      if (q.fire) continue;
      const k = q.age / q.life;
      ctx.globalAlpha = Math.min(1, k * 8) * (1 - k) * 0.55;
      ctx.fillStyle = k < 0.15 ? '#2a1a14' : '#151111';
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // the fire in it
    ctx.globalCompositeOperation = 'lighter';
    for (const q of this.parts) {
      if (!q.fire) continue;
      const k = q.age / q.life, a = (1 - k) * 0.6;
      ctx.fillStyle = k < 0.25 ? `rgba(255, 210, 120, ${a})` : k < 0.6 ? `rgba(255, 120, 40, ${a})` : `rgba(200, 50, 20, ${a})`;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r * (0.8 + 0.2 * Math.sin(this.t * 20 + q.seed)), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}
