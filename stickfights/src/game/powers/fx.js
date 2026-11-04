/* =============================================================================
   SUPERPOWERS - what they look like: afterimages behind a speedster, the
   glow round whatever a telekinetic has hold of, rings of air from a clap or
   a punch, cracks in the floor, streaks of wind, the line a speedster leaves,
   and rounds hanging in the air in front of somebody who stopped them.

   They are sandbox effects (sb.effects): update(dt) says whether they are
   still there, draw(ctx) goes on top of everything, drawUnder(ctx) under the
   people (render.js).
   ========================================================================== */
import { DIM } from '../skeleton.js';
import { rand, clamp } from '../../core/util.js';

const TAU = Math.PI * 2;
const BONES = [
  ['hip', 'chest'], ['chest', 'neck'], ['shoulder', 'elbowA'], ['elbowA', 'handA'], ['shoulder', 'elbowB'], ['elbowB', 'handB'],
  ['hip', 'kneeA'], ['kneeA', 'footA'], ['footA', 'toeA'], ['hip', 'kneeB'], ['kneeB', 'footB'], ['footB', 'toeB'],
];

/** One effect of a kind per sandbox, made the first time it is wanted (and again after a clear). */
function single(sb, key, make) {
  let e = sb[key];
  if (!e || !sb.effects.includes(e)) { e = make(); sb[key] = e; sb.effects.push(e); }
  return e;
}

/* -------------------------------- afterimages -------------------------------- */

/** Pictures of a speedster where they just were, fading out behind them. */
class Ghosts {
  constructor() { this.list = []; }
  /** A picture of them now. `every` keeps them from piling up: at most one per that long, per person. */
  add(man, alpha = 0.4, every = 0.03) {
    const t = man.sandbox.time;
    if (t - (man.ghostT ?? -9) < every) return;
    man.ghostT = t;
    const j = {};
    for (const [a, b] of BONES) { j[a] = { x: man.wj[a].x, y: man.wj[a].y }; j[b] = { x: man.wj[b].x, y: man.wj[b].y }; }
    j.head = { x: man.wj.head.x, y: man.wj.head.y };
    this.list.push({ j, s: man.scale, a: alpha, life: 0.28, age: 0, hue: man.powers && man.powers.has('speed') ? 48 : 210 });
    if (this.list.length > 90) this.list.shift();
  }
  update(dt) {
    for (const g of this.list) g.age += dt;
    this.list = this.list.filter((g) => g.age < g.life);
    return true;
  }
  drawUnder(ctx) {
    if (!this.list.length) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const g of this.list) {
      const k = 1 - g.age / g.life;
      ctx.globalAlpha = g.a * k;
      ctx.strokeStyle = `hsl(${g.hue}, 90%, 55%)`;
      ctx.fillStyle = `hsla(${g.hue}, 90%, 70%, 0.6)`;
      ctx.lineWidth = DIM.line * g.s;
      ctx.beginPath();
      for (const [a, b] of BONES) { ctx.moveTo(g.j[a].x, g.j[a].y); ctx.lineTo(g.j[b].x, g.j[b].y); }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(g.j.head.x, g.j.head.y, DIM.headR * g.s, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}
export const ghostsOf = (sb) => single(sb, '_pwGhosts', () => new Ghosts());

/* ----------------------------- telekinetic glow ----------------------------- */

/** The glow on a telekinetic's hand, and round whatever they have hold of: refreshed every step it lasts. */
class TkGlows {
  constructor() { this.marks = new Map(); }
  mark(man, thing, k) {
    const e = this.marks.get(man) || { man, things: new Map(), k: 0 };
    e.k = Math.max(e.k, k);
    e.t = man.sandbox.time;
    if (thing) e.things.set(thing, Math.max(e.things.get(thing) || 0, k));
    this.marks.set(man, e);
  }
  update(dt) {
    for (const [man, e] of this.marks) {
      e.k -= dt * 2.5;
      for (const [t, k] of e.things) { if (k - dt * 2.5 <= 0 || t.removed) e.things.delete(t); else e.things.set(t, k - dt * 2.5); }
      if (e.k <= 0 || man.removed) this.marks.delete(man);
    }
    return true;
  }
  draw(ctx) {
    if (!this.marks.size) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [man, e] of this.marks) {
      const h = man.wj.handA, k = clamp(e.k, 0, 1);
      glow(ctx, h.x, h.y, 0.22 + 0.06 * Math.sin(man.sandbox.time * 12), k);
      for (const [t, tk] of e.things) {
        const p = t.wj ? t.wj.chest : t.body ? t.body.pos : t.pos;
        if (!p) continue;
        const r = t.wj ? 0.55 * (t.scale || 1) : 0.35;
        glow(ctx, p.x, p.y, r, clamp(tk, 0, 1) * 0.8);
        // a faint line of it, from the hand to what it holds
        ctx.strokeStyle = `rgba(190, 120, 255, ${0.25 * tk})`;
        ctx.lineWidth = 0.025;
        ctx.setLineDash([0.06, 0.07]);
        ctx.beginPath();
        ctx.moveTo(h.x, h.y);
        ctx.quadraticCurveTo((h.x + p.x) / 2, Math.max(h.y, p.y) + 0.4, p.x, p.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }
}
function glow(ctx, x, y, r, k) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(215, 160, 255, ${0.55 * k})`);
  g.addColorStop(0.5, `rgba(160, 80, 255, ${0.25 * k})`);
  g.addColorStop(1, 'rgba(120, 40, 255, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}
/** Light up a telekinetic's hand (and `thing`, if they have hold of something) for a moment. */
export function tkGlow(man, thing = null, k = 1) { single(man.sandbox, '_pwTk', () => new TkGlows()).mark(man, thing, k); }

/* ------------------------------ rings and cracks ------------------------------ */

/** A ring of air going out from a blow, a clap or a pound. `flat` keeps it to the ground. */
export class Ring {
  constructor(x, y, r, life = 0.4, flat = false) { this.x = x; this.y = y; this.r = r; this.life = life; this.age = 0; this.flat = flat; }
  update(dt) { this.age += dt; return this.age < this.life; }
  draw(ctx) {
    const k = this.age / this.life, r = this.r * (0.25 + 0.75 * k);
    ctx.save();
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 * (1 - k)})`;
    ctx.lineWidth = 0.05 * (1 - k) + 0.01;
    ctx.beginPath();
    if (this.flat) ctx.ellipse(this.x, Math.max(0.02, this.y), r, r * 0.12, 0, 0, TAU);
    else ctx.arc(this.x, this.y, r, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

/** Cracks in the floor where something hit it hard enough. */
export class Cracks {
  constructor(x, k = 1) {
    this.x = x;
    this.k = k;
    this.age = 0;
    this.life = 14;
    this.lines = [];
    const n = Math.round(5 + k * 5);
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1, len = rand(0.3, 1.2) * k;
      const pts = [[0, 0]];
      let px = 0;
      for (let s = 0; s < 4; s++) { px += dir * len / 4; pts.push([px, rand(-0.015, 0.03)]); }
      this.lines.push(pts);
    }
  }
  update(dt) { this.age += dt; return this.age < this.life; }
  draw(ctx) {
    const a = Math.min(1, (this.life - this.age) / 3);
    ctx.save();
    ctx.strokeStyle = `rgba(150, 150, 150, ${0.8 * a})`;
    ctx.lineWidth = 0.018;
    ctx.beginPath();
    for (const pts of this.lines) {
      ctx.moveTo(this.x + pts[0][0], 0.005 + pts[0][1]);
      for (const p of pts) ctx.lineTo(this.x + p[0], 0.005 + p[1]);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/** Streaks of air going past something moving fast, or blown out in front of a punch. */
export class Wind {
  constructor(x, y, dx, dy, k = 1) {
    this.age = 0;
    this.life = 0.35;
    this.lines = [];
    const n = Math.round(4 + k * 4);
    for (let i = 0; i < n; i++) {
      const ox = rand(-0.4, 0.4) * k, oy = rand(-0.5, 0.5) * k;
      this.lines.push({ x: x + ox, y: y + oy, l: rand(0.4, 1.1) * k, v: rand(4, 9) });
    }
    const d = Math.hypot(dx, dy) || 1;
    this.dx = dx / d; this.dy = dy / d;
  }
  update(dt) {
    this.age += dt;
    for (const l of this.lines) { l.x += this.dx * l.v * dt; l.y += this.dy * l.v * dt; }
    return this.age < this.life;
  }
  draw(ctx) {
    const k = 1 - this.age / this.life;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.55 * k})`;
    ctx.lineWidth = 0.014;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const l of this.lines) { ctx.moveTo(l.x, l.y); ctx.lineTo(l.x - this.dx * l.l, l.y - this.dy * l.l); }
    ctx.stroke();
    ctx.restore();
  }
}

/** The line a speedster draws through a crowd: a crackle of yellow along it, gone in a moment. */
export class Streak {
  constructor(x0, x1, y) {
    this.age = 0;
    this.life = 0.45;
    this.pts = [];
    const n = Math.max(4, Math.round(Math.abs(x1 - x0) / 0.35));
    for (let i = 0; i <= n; i++) this.pts.push([x0 + (x1 - x0) * (i / n), y + rand(-0.12, 0.12)]);
  }
  update(dt) { this.age += dt; return this.age < this.life; }
  draw(ctx) {
    const k = 1 - this.age / this.life;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [w, a] of [[0.09, 0.25], [0.03, 0.9]]) {
      ctx.strokeStyle = `rgba(255, 220, 90, ${a * k})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      this.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    ctx.restore();
  }
}

/* --------------------------- rounds hanging in the air --------------------------- */

/** Bullets that stopped short of a telekinetic: hanging in the air, until they let them drop. */
export class StoppedRounds {
  static of(sb) { return single(sb, '_pwRounds', () => new StoppedRounds()); }
  constructor() { this.list = []; }
  add(x, y, a) {
    const r = { x, y, a, vy: 0, drop: false, age: 0, down: false };
    this.list.push(r);
    if (this.list.length > 60) this.list.shift();
    return r;
  }
  update(dt) {
    for (const r of this.list) {
      r.age += dt;
      if (!r.drop) { r.y += Math.sin(r.age * 6 + r.x) * 0.002; continue; }
      if (r.down) continue;
      r.vy -= 18 * dt;
      r.y += r.vy * dt;
      r.a += dt * 9;
      if (r.y <= 0.01) { r.y = 0.01; r.down = true; r.age = 0; }
    }
    // (on the floor, they stay a while, then go)
    this.list = this.list.filter((r) => !(r.down && r.age > 25));
    return true;
  }
  draw(ctx) {
    if (!this.list.length) return;
    ctx.save();
    for (const r of this.list) {
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(r.a);
      ctx.fillStyle = '#b08d3c';
      ctx.fillRect(-0.016, -0.0055, 0.032, 0.011);
      ctx.fillStyle = '#6b5a36';
      ctx.fillRect(0.012, -0.0055, 0.008, 0.011);
      ctx.restore();
      if (!r.drop) {
        // the air round it, rippling
        ctx.strokeStyle = 'rgba(200, 150, 255, 0.35)';
        ctx.lineWidth = 0.008;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 0.05 + 0.015 * Math.sin(r.age * 10), 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

/* --------------------------------- laser vision --------------------------------- */

/** What is left of a gun (or a knife) a beam of heat melted: glowing, then cooling, then just a lump. */
export class Slag {
  constructor(x, y) {
    this.x = x; this.y = Math.max(0.01, y); this.age = 0; this.life = 30;
    this.blobs = [];
    for (let i = 0; i < 6; i++) this.blobs.push({ dx: rand(-0.08, 0.08), r: rand(0.025, 0.05), h: rand(0.5, 1) });
    this.smokeT = 0;
  }
  update(dt, sb) {
    this.age += dt;
    return this.age < this.life;
  }
  drawUnder(ctx) {
    const hot = clamp(1 - this.age / 5, 0, 1), fade = Math.min(1, (this.life - this.age) / 4);
    ctx.save();
    for (const b of this.blobs) {
      const r = Math.round(60 + 195 * hot), g = Math.round(58 + 110 * hot * hot), bl = Math.round(56 + 20 * hot * hot * hot);
      ctx.fillStyle = `rgba(${r}, ${g}, ${bl}, ${fade})`;
      ctx.beginPath();
      ctx.ellipse(this.x + b.dx, this.y + b.r * b.h * 0.4, b.r * 1.4, b.r * b.h * 0.5, 0, 0, TAU);
      ctx.fill();
    }
    if (hot > 0.05) {
      const gl = ctx.createRadialGradient(this.x, this.y + 0.02, 0, this.x, this.y + 0.02, 0.22);
      gl.addColorStop(0, `rgba(255, 140, 40, ${0.45 * hot})`);
      gl.addColorStop(1, 'rgba(255, 90, 20, 0)');
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(this.x, this.y + 0.02, 0.22, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  draw() {}
}

/** Black burns on the floor where a beam ran along it (one of these per sandbox, holding all of them). */
export class Scorch {
  static of(sb) { return single(sb, '_pwScorch', () => new Scorch()); }
  constructor() { this.marks = []; }
  mark(x, r = 0.2) {
    const last = this.marks[this.marks.length - 1];
    // (a beam held on one spot darkens it, rather than piling up marks)
    if (last && Math.abs(last.x - x) < 0.04) { last.r = Math.min(0.45, last.r + 0.01); last.age = 0; return; }
    this.marks.push({ x, r, age: 0 });
    if (this.marks.length > 160) this.marks.shift();
  }
  update(dt) {
    for (const m of this.marks) m.age += dt;
    while (this.marks.length && this.marks[0].age > 60) this.marks.shift();
    return true;
  }
  drawUnder(ctx) {
    ctx.save();
    for (const m of this.marks) {
      const a = Math.min(1, (60 - m.age) / 8) * 0.55, hot = clamp(1 - m.age / 1.5, 0, 1);
      ctx.fillStyle = `rgba(${Math.round(25 + 200 * hot)}, ${Math.round(20 + 60 * hot)}, 15, ${a + 0.3 * hot})`;
      ctx.beginPath(); ctx.ellipse(m.x, 0.004, m.r * 0.5, 0.012, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  draw() {}
}

/** A flash out of somebody's eyes: a burst of white, and a cone of light in front of them. */
export class EyeFlash {
  constructor(x, y, dir) { this.x = x; this.y = y; this.dir = dir || 1; this.age = 0; this.life = 0.45; }
  update(dt) { this.age += dt; return this.age < this.life; }
  draw(ctx) {
    const k = 1 - this.age / this.life;
    ctx.save();
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, 0.6 + 0.6 * (1 - k));
    g.addColorStop(0, `rgba(255, 255, 255, ${0.95 * k})`);
    g.addColorStop(0.35, `rgba(255, 210, 200, ${0.6 * k})`);
    g.addColorStop(1, 'rgba(255, 80, 60, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(this.x, this.y, 0.6 + 0.6 * (1 - k), 0, TAU); ctx.fill();
    // the cone, out in front
    const L = 9, a = 0.42;
    const cg = ctx.createLinearGradient(this.x, this.y, this.x + this.dir * L, this.y);
    cg.addColorStop(0, `rgba(255, 245, 235, ${0.5 * k})`);
    cg.addColorStop(1, 'rgba(255, 245, 235, 0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x + this.dir * L, this.y + Math.tan(a) * L);
    ctx.lineTo(this.x + this.dir * L, this.y - Math.tan(a) * L);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
