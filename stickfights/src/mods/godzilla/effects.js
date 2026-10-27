/* =============================================================================
   GODZILLA - what he leaves in the air.

     Breath     the atomic breath, the 1954 way: not a beam so much as a
                white-hot breath of vapour, billowing out of his mouth and
                along wherever his head points. Whatever it reaches burns;
                where it meets something solid it eats into it, cell by
                cell, and goes on through what is left; where it meets the
                ground it scorches it.
     RoarRings  rings of shaken air, going out from his mouth as he roars.

   Effects go in sandbox.effects ({ update(dt) -> false when done, draw }),
   tagged with the mod so that removing it clears them out.
   ========================================================================== */
import { rand, TAU } from '../../core/util.js';
import { ignite } from '../../game/vitals.js';
import { toWorld, K } from './body.js';
import { wreck, struck } from './world.js';

const MOD = 'godzilla';
const RANGE = 34;
const SCORCH = ['#1b1a17', '#0f0e0c'];

export class Breath {
  constructor(sb, man) {
    this.mod = MOD;
    this.sb = sb;
    this.man = man;
    this.t = 0;
    this.on = true;
    this.off = 0;
    this.aim = null;
    this.puffs = [];
    this.reach = 0;          // how far out of his mouth it has got, so far
    this.hit = null;         // where it is meeting something: { x, y, d, what }
    this.from = null;
    this.dir = { x: 1, y: 0 };
    this.tickT = 0;
    this.burned = new Map();
  }

  /** Where it is going: `building`, if that is a building (it stops at the first one, then). */
  aimAt(p, building = false) { this.aim = p; this.intoBuilding = building; }
  stop() { this.on = false; }

  /** Where it comes out, and which way: out of his mouth, the way his head points. */
  source() {
    const man = this.man, g = man.gz.body, sk = g.sk;
    const mo = toWorld(g, man, sk.mouth);
    let dx = g.sx * sk.F.x, dy = sk.F.y;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    return { x: mo.x + dx * 0.4 * K, y: mo.y + dy * 0.4 * K, dx, dy };
  }

  /**
   * The first solid thing along it: a wall or building, a tree - or the
   * ground. (The buildings are behind the street: short of what he is
   * aiming at, it goes past them; beyond it, it hits the one behind.)
   */
  cast(s, max) {
    const sb = this.sb;
    const aim = this.aim, past = aim && !this.intoBuilding ? Math.max(0, (aim.x - s.x) * s.dx + (aim.y - s.y) * s.dy - 0.5) : 0;
    for (let d = 0.5; d <= max; d += 0.25) {
      const x = s.x + s.dx * d, y = s.y + s.dy * d;
      if (y <= 0.05) return { x, y: 0.05, d, what: 'ground' };
      if (x < sb.left || x > sb.right) return { x, y, d, what: 'edge' };
      for (const w of sb.slabs) {
        if (w.removed || (w.background && d < past)) continue;
        const b = w.body.aabb();
        if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) continue;
        if (w.contains(x, y, 0.06)) return { x, y, d, what: 'slab', w };
      }
      for (const t of sb.plants) {
        if (t.removed) continue;
        const b = t.bounds();
        if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
        if (t.hitTest && t.hitTest(x, y, 0.05)) return { x, y, d, what: 'plant', t };
      }
    }
    return { x: s.x + s.dx * max, y: s.y + s.dy * max, d: max, what: null };
  }

  update(dt) {
    const man = this.man, sb = this.sb;
    if (man.removed || !man.gz || !man.gz.body || !man.gz.body.sk) return false;
    this.t += dt;
    if (!this.on) this.off += dt;
    const s = this.source();
    this.from = s;
    this.dir = { x: s.dx, y: s.dy };
    if (this.on) this.reach = Math.min(RANGE, this.reach + dt * 42);
    const hit = this.cast(s, this.reach);
    this.hit = hit;
    // the vapour: out of his mouth, along it, billowing
    if (this.on) {
      for (let i = 0; i < 5; i++) {
        this.puffs.push({ s: rand(0, 1), o: rand(-0.3, 0.3), v: rand(34, 44), r: rand(0.25, 0.45), age: 0, life: rand(0.45, 0.7), spin: rand(-1, 1) });
      }
    }
    for (const p of this.puffs) {
      p.age += dt;
      p.s += p.v * dt;
      if (p.s > hit.d) { p.s = hit.d; p.v = 0; p.splash = true; }
      p.r += dt * (p.splash ? 3.6 : 1.9);
      p.o += p.spin * dt * 1.2;
    }
    this.puffs = this.puffs.filter((p) => p.age < p.life);
    // what it does, ten times a second
    if (this.on && (this.tickT -= dt) <= 0) {
      this.tickT = 0.1;
      this.burn(s, hit);
    }
    if (this.on && hit.what) {
      if (Math.random() < dt * 30) sb.fx.embers(hit.x + rand(-0.4, 0.4), hit.y, 2);
      if (Math.random() < dt * 14) sb.fx.smoke(hit.x + rand(-0.5, 0.5), hit.y, 1, 1.6);
    }
    return this.on || this.puffs.length > 0;
  }

  /** Everything along it burns; what it meets, it eats into. */
  burn(s, hit) {
    const sb = this.sb, man = this.man;
    const ex = s.x + s.dx * hit.d, ey = s.y + s.dy * hit.d;
    for (const p of sb.people) {
      if (p === man || p.removed || (p.species && p.species.giant)) continue;
      if (p.box.maxX < Math.min(s.x, ex) - 1 || p.box.minX > Math.max(s.x, ex) + 1) continue;
      // the nearest point of them to the stream
      let best = null;
      for (let t = 0; t <= 1; t += 0.1) {
        const q = p.nearestPart(s.x + (ex - s.x) * t, s.y + (ey - s.y) * t);
        if (q && (!best || q.d < best.d)) best = q;
      }
      if (!best || best.d > 0.75 + hit.d * 0.012) continue;
      const n = (this.burned.get(p) || 0) + 1;
      this.burned.set(p, n);
      struck(man, p);
      p.takeHit({ by: man, part: best.part, x: best.x, y: best.y, dir: Math.sign(s.dx) || 1, power: 2.2, kind: 'burn', weapon: 'gzBreath', bone: p.boneName(best.bone, best.t) });
      if (p.removed) continue;
      ignite(p, { power: 1, by: man });
      if (p.alive && !p.steadfast && !p.lying && n === 2) p.launch(s.dx * 5, 2 + s.dy * 2);
      if (n === 1) sb.emit('gzBurn', { who: p, by: man, x: best.x, y: best.y });
    }
    // loose things are blown along it
    for (const t of sb.loose()) {
      if (!t.body || t.removed || t.body.invMass === 0) continue;
      const b = t.body.pos;
      const u = (b.x - s.x) * s.dx + (b.y - s.y) * s.dy;
      if (u < 0 || u > hit.d) continue;
      const px = s.x + s.dx * u, py = s.y + s.dy * u;
      if (Math.hypot(b.x - px, b.y - py) > 1.2) continue;
      t.body.vel.x += s.dx * 1.5;
      t.body.vel.y += s.dy * 1.5 + 0.5;
    }
    if (hit.what === 'slab' || hit.what === 'plant') {
      wreck(man, hit.x + s.dx * 0.3, hit.y + s.dy * 0.3, 0.75, 4.5, { kind: 'blast', dx: s.dx, dy: s.dy, speed: 3 });
    } else if (hit.what === 'ground') {
      if (Math.random() < 0.5) sb.fx.splat(hit.x + rand(-0.4, 0.4), rand(0.25, 0.5), SCORCH);
      sb.fx.dust(hit.x, 0.05, 3, 1.4);
      // whatever lies there, it burns too (people: above)
      wreck(man, hit.x, 0.3, 0.8, 3, { kind: 'blast', dx: 0, dy: 1, speed: 2, loose: true });
    }
  }

  draw(ctx) {
    const s = this.from, hit = this.hit;
    if (!s || !hit) return;
    const fade = this.on ? 1 : Math.max(0, 1 - this.off / 0.35);
    const nx = -s.dy, ny = s.dx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // the billowing vapour
    for (const p of this.puffs) {
      const k = p.age / p.life;
      const x = s.x + s.dx * p.s + nx * p.o * (0.5 + p.s * 0.04), y = s.y + s.dy * p.s + ny * p.o * (0.5 + p.s * 0.04);
      const a = (1 - k) * 0.32;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, p.r);
      gr.addColorStop(0, `rgba(225, 242, 255, ${a})`);
      gr.addColorStop(0.55, `rgba(150, 200, 255, ${a * 0.5})`);
      gr.addColorStop(1, 'rgba(120, 170, 255, 0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, TAU);
      ctx.fill();
    }
    if (fade > 0) {
      const ex = s.x + s.dx * hit.d, ey = s.y + s.dy * hit.d;
      const flick = 0.85 + Math.sin(this.t * 53) * 0.1 + Math.sin(this.t * 31) * 0.05;
      ctx.lineCap = 'round';
      for (const [w, a] of [[1.2 * K, 0.16], [0.6 * K, 0.35], [0.24 * K, 0.85]]) {
        ctx.strokeStyle = `rgba(215, 238, 255, ${a * fade * flick})`;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
      // where it lands, a white glare
      if (hit.what) {
        const r = 1.5 * K * flick;
        const gr = ctx.createRadialGradient(ex, ey, 0, ex, ey, r);
        gr.addColorStop(0, `rgba(255, 255, 255, ${0.75 * fade})`);
        gr.addColorStop(0.4, `rgba(190, 225, 255, ${0.35 * fade})`);
        gr.addColorStop(1, 'rgba(140, 190, 255, 0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(ex, ey, r, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

/** The roar, seen: rings of shaken air going out from his mouth. */
export class RoarRings {
  constructor(sb, man, dur = 2.2) {
    this.mod = MOD;
    this.sb = sb;
    this.man = man;
    this.t = 0;
    this.dur = dur;
    this.rings = [];
    this.nextT = 0;
  }
  update(dt) {
    const man = this.man;
    if (man.removed || !man.gz || !man.gz.body.sk) return false;
    this.t += dt;
    const g = man.gz.body, sk = g.sk;
    this.at = toWorld(g, man, sk.mouth);
    if (this.t < this.dur && (this.nextT -= dt) <= 0) { this.nextT = 0.28; this.rings.push({ r: 0.6, age: 0 }); }
    for (const r of this.rings) { r.age += dt; r.r += dt * 16; }
    this.rings = this.rings.filter((r) => r.age < 1.1);
    return this.t < this.dur || this.rings.length > 0;
  }
  draw(ctx) {
    if (!this.at) return;
    ctx.save();
    for (const r of this.rings) {
      const k = r.age / 1.1;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.22 * (1 - k)})`;
      ctx.lineWidth = 0.35 * (1 - k) + 0.05;
      ctx.beginPath();
      ctx.arc(this.at.x, this.at.y, r.r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}

