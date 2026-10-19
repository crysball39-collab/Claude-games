/* =============================================================================
   MURDER DRONES - what the drones' abilities leave in the world.

     Beam       a laser out of a palm: a ray to the first thing in the way,
                burning it for as long as it stays on it
     Missile    a little homing missile, trailing smoke, that goes off on
                whatever it reaches first
     explode()  a blast: everyone near it hurt and thrown by how near they
                were, crates and loose things flung, a scorch on the floor
     Acid       nanite acid, from the tail: it eats at the part it went
                into, spreading, for a good ten seconds. Worker drones are
                made of the stuff it eats; nothing else takes it as badly
     Cracks     the floor where a disassembly drone came down hard

   Effects go in sandbox.effects ({ update(dt) -> false when done, draw }),
   afflictions in a stickman's afflictions ({ update(man, dt), draw, label }).
   ========================================================================== */
import { clamp, rand, chance, sign } from '../../core/util.js';
import { pointOnBone } from '../../game/skeleton.js';
import { ACID } from './look.js';
import { ignite } from '../../game/vitals.js';

const PART_NAMES = { head: 'head', torso: 'body', armA: 'right arm', armB: 'left arm', legA: 'right leg', legB: 'left leg' };

/** The first thing along a ray: a person, a crate, the floor or a wall. */
export function castRay(sb, x, y, dx, dy, max, skip = null) {
  let best = { t: max, what: null };
  if (dy < -1e-6) { const t = -y / dy; if (t > 0 && t < best.t) best = { t, what: 'floor' }; }
  const tw = dx > 0 ? (sb.right - x) / dx : dx < 0 ? (sb.left - x) / dx : Infinity;
  if (tw > 0 && tw < best.t) best = { t: tw, what: 'wall' };
  for (const c of sb.crates) {
    if (c.removed || c.carriedBy) continue;
    const b = c.body;
    const cs = Math.cos(b.rot), sn = Math.sin(b.rot);
    const rx = x - b.pos.x, ry = y - b.pos.y;
    const ox = rx * cs + ry * sn, oy = -rx * sn + ry * cs;
    const vx = dx * cs + dy * sn, vy = -dx * sn + dy * cs;
    let t0 = -Infinity, t1 = Infinity, ok = true;
    for (const [o, v, h] of [[ox, vx, b.w / 2], [oy, vy, b.h / 2]]) {
      if (Math.abs(v) < 1e-9) { if (o < -h || o > h) ok = false; continue; }
      let lo = (-h - o) / v, hi = (h - o) / v;
      if (lo > hi) [lo, hi] = [hi, lo];
      t0 = Math.max(t0, lo); t1 = Math.min(t1, hi);
    }
    if (ok && t0 <= t1 && t1 > 1e-4 && t0 < best.t) best = { t: Math.max(0, t0), what: 'crate', crate: c };
  }
  for (const q of sb.people) {
    if (q === skip || q.removed) continue;
    const h = q.rayHit(x, y, dx, dy, best.t);
    if (h && h.t < best.t) best = { t: h.t, what: 'person', who: q, hit: h };
  }
  best.x = x + dx * best.t;
  best.y = y + dy * best.t;
  return best;
}

/* ---------------------------------- laser ---------------------------------- */

export class Beam {
  /** `from()` gives where it comes out and where it is pointed, every step: { x, y, a } */
  constructor(sb, by, from, life = 0.9) {
    this.mod = 'murder-drones';
    this.sb = sb;
    this.by = by;
    this.from = from;
    this.age = 0;
    this.life = life;
    this.tick = 0;
    this.end = null;
    this.start = null;
  }
  update(dt) {
    this.age += dt;
    const by = this.by;
    if (this.age > this.life || (by && (by.removed || !by.conscious || by.rag))) {
      if (by && by.md) by.md.laserGlow = 0;
      return false;
    }
    const f = this.from();
    if (!f) return false;
    if (by && by.md) by.md.laserGlow = 1;
    const dx = Math.cos(f.a), dy = Math.sin(f.a);
    const hit = castRay(this.sb, f.x, f.y, dx, dy, 30, by);
    this.start = f;
    this.end = hit;
    if ((this.tick -= dt) > 0) return true;
    this.tick = 0.06;
    const sb = this.sb;
    if (hit.what === 'person') {
      const q = hit.who, h = hit.hit;
      q.takeHit({ by, part: h.part, x: h.x, y: h.y, dir: sign(dx) || 1, power: 0.42, kind: 'laser', weapon: 'laser', bone: q.boneName(h.bone, h.tb) });
      sb.fx.sparks(h.x, h.y, 2);
    } else if (hit.what === 'crate') {
      hit.crate.stain(hit.x, hit.y, 0.035, ['rgba(30, 22, 16, 0.85)', 'rgba(20, 14, 10, 0.9)']);
      hit.crate.body.applyImpulse(dx * 2, dy * 2, hit.x, hit.y);
      sb.fx.dust(hit.x, hit.y, 1, 0.3);
      sb.fx.sparks(hit.x, hit.y, 1);
    } else if (hit.what === 'floor') {
      sb.fx.sparks(hit.x, 0.01, 2);
      if (chance(0.3)) sb.fx.dust(hit.x, 0, 1, 0.3);
    }
    return true;
  }
  draw(ctx) {
    if (!this.start || !this.end) return;
    const k = clamp(Math.min(this.age / 0.06, (this.life - this.age) / 0.12), 0, 1);
    const flick = 0.85 + Math.sin(this.age * 90) * 0.15;
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(255, 150, 40, ${0.38 * k * flick})`;
    ctx.lineWidth = 0.12;
    ctx.beginPath(); ctx.moveTo(this.start.x, this.start.y); ctx.lineTo(this.end.x, this.end.y); ctx.stroke();
    ctx.strokeStyle = `rgba(255, 240, 170, ${0.95 * k})`;
    ctx.lineWidth = 0.035;
    ctx.stroke();
    ctx.fillStyle = `rgba(255, 230, 150, ${0.8 * k * flick})`;
    ctx.beginPath(); ctx.arc(this.end.x, this.end.y, 0.07 * flick, 0, Math.PI * 2); ctx.fill();
  }
}

/* --------------------------------- missiles -------------------------------- */

export class Missile {
  constructor(sb, by, x, y, vx, vy, target) {
    this.mod = 'murder-drones';
    this.sb = sb;
    this.by = by;
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.target = target;
    this.age = 0;
    this.trail = [];
    this.smokeT = 0;
    this.dead = false;
  }
  update(dt) {
    if (this.dead) return false;
    const sb = this.sb;
    this.age += dt;
    // after a moment it turns toward whoever it was fired at
    const t = this.target;
    if (t && !t.removed && this.age > 0.12) {
      const tx = t.wj.chest.x, ty = t.lying ? t.wj.hip.y + 0.1 : t.wj.chest.y;
      const want = Math.atan2(ty - this.y, tx - this.x);
      const now = Math.atan2(this.vy, this.vx);
      let d = want - now;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const turn = clamp(d, -dt * 4.5, dt * 4.5);
      const sp = Math.min(17, Math.hypot(this.vx, this.vy) + dt * 14);
      this.vx = Math.cos(now + turn) * sp;
      this.vy = Math.sin(now + turn) * sp;
    } else {
      this.vy -= 4 * dt;
    }
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    // what it runs into on the way
    const L = Math.hypot(nx - this.x, ny - this.y) || 1e-6;
    const hit = castRay(sb, this.x, this.y, (nx - this.x) / L, (ny - this.y) / L, L + 0.05, this.age < 0.25 ? this.by : null);
    if (hit.what || this.age > 4) {
      explode(sb, hit.what ? hit.x : this.x, Math.max(0.02, hit.what ? hit.y : this.y), this.by, 1);
      this.dead = true;
      return false;
    }
    this.x = nx; this.y = ny;
    if ((this.smokeT -= dt) <= 0) {
      this.smokeT = 0.025;
      this.trail.push({ x: this.x, y: this.y, age: 0 });
      if (this.trail.length > 26) this.trail.shift();
    }
    for (const p of this.trail) p.age += dt;
    return true;
  }
  draw(ctx) {
    for (const p of this.trail) {
      const k = clamp(p.age / 0.65, 0, 1);
      ctx.fillStyle = `rgba(120, 120, 125, ${0.4 * (1 - k)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 0.03 + k * 0.08, 0, Math.PI * 2); ctx.fill();
    }
    const a = Math.atan2(this.vy, this.vx);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(a);
    ctx.fillStyle = `rgba(255, 170, 50, ${0.7 + Math.random() * 0.3})`;
    ctx.beginPath(); ctx.moveTo(-0.07, 0.018); ctx.lineTo(-0.15 - Math.random() * 0.05, 0); ctx.lineTo(-0.07, -0.018); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#dcdcdc';
    ctx.fillRect(-0.07, -0.018, 0.1, 0.036);
    ctx.fillStyle = '#e23b3b';
    ctx.beginPath(); ctx.moveTo(0.03, 0.018); ctx.lineTo(0.07, 0); ctx.lineTo(0.03, -0.018); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#555';
    ctx.beginPath(); ctx.moveTo(-0.07, 0.018); ctx.lineTo(-0.09, 0.04); ctx.lineTo(-0.04, 0.018); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-0.07, -0.018); ctx.lineTo(-0.09, -0.04); ctx.lineTo(-0.04, -0.018); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

/* --------------------------------- the blast ------------------------------- */

class Blast {
  constructor(x, y, r) { this.mod = 'murder-drones'; this.x = x; this.y = y; this.r = r; this.age = 0; this.life = 0.55; }
  update(dt) { this.age += dt; return this.age < this.life; }
  draw(ctx) {
    const k = this.age / this.life;
    const R = this.r * (0.35 + k * 0.85);
    ctx.fillStyle = `rgba(255, 245, 200, ${Math.max(0, 0.9 - k * 3)})`;
    ctx.beginPath(); ctx.arc(this.x, this.y, R * 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255, 150, 40, ${0.6 * (1 - k)})`;
    ctx.beginPath(); ctx.arc(this.x, this.y, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 * (1 - k)})`;
    ctx.lineWidth = 0.04;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r * (0.4 + k * 1.4), 0, Math.PI * 2); ctx.stroke();
  }
}

/**
 * Something going off at (x, y). Everyone within reach is hurt and thrown by
 * how close they were; crates and anything loose are flung away from it.
 */
export function explode(sb, x, y, by, power = 1) {
  const R = 1.9 * power;
  for (const p of [...sb.people]) {
    if (p.removed) continue;
    const n = p.nearestPart(x, y);
    if (!n || n.d > R) continue;
    const k = 1 - n.d / R;
    const dir = sign(p.wj.hip.x - x) || 1;
    p.takeHit({ by, part: n.part, x: n.x, y: n.y, dir, power: 0.6 + 4.2 * k * power, kind: 'impact', weapon: 'blast', bone: p.boneName(n.bone, n.t) });
    if (p.removed) continue;
    // close to it, the heat as well
    if (k > 0.45 && p.alive) {
      p.health.hit(n.part, 6 * k * power, { burn: true, cutBy: 'Blast', cause: 'an explosion' });
      if (n.part === 'head') p.headMark(n.x, n.y, 0.6, true);
      else p.addWound({ bone: n.bone, t: n.t, r: 0.6, burn: true });
      if (p.health.dead && p.alive) p.die('an explosion', by && !by.removed ? by : null);
      // and right in it, the flames catch
      else if (k > 0.6 && chance(0.45)) ignite(p, { part: n.part, power: 0.45, by: by && !by.removed ? by : null });
    }
    if (k > 0.25 && p.state !== 'held') {
      const vx = dir * (3 + 8 * k) * power, vy = 2 + 6 * k * power;
      if (p.rag) p.rag.kick(vx * 0.8, vy * 0.8);
      else if (p.alive) p.launch(vx, vy);
    }
  }
  for (const c of sb.crates) {
    if (c.removed || c.carriedBy) continue;
    const dx = c.pos.x - x, dy = c.pos.y - y, d = Math.hypot(dx, dy);
    if (d > R * 1.3) continue;
    const k = 1 - d / (R * 1.3);
    c.body.applyImpulse((dx / (d || 1)) * 160 * k * power, (Math.max(0.2, dy / (d || 1)) * 160 + 40) * k * power, c.pos.x, c.pos.y - 0.2);
    c.thrownBy = by;
    c.thrownAt = sb.time;
  }
  for (const t of sb.loose()) {
    const dx = t.body.pos.x - x, dy = t.body.pos.y - y, d = Math.hypot(dx, dy);
    if (d > R * 1.2) continue;
    const k = (1 - d / (R * 1.2)) * t.body.mass;
    t.body.applyImpulse((dx / (d || 1)) * 7 * k, (Math.max(0.3, dy / (d || 1)) * 7 + 2) * k, t.body.pos.x, t.body.pos.y);
    t.body.angVel += rand(-12, 12);
  }
  // walls and trees take it too, cell by cell
  if (sb.blast) sb.blast(x, y, R, power);
  sb.fx.flash(x, y, 0);
  sb.fx.sparks(x, y, 16);
  sb.fx.dust(x, Math.max(0, y), 14, 1.8);
  sb.fx.splinters(x, y, 0, 1, 8);
  sb.effects.push(new Blast(x, y, R));
  if (y < 0.6) sb.fx.splats.push({ x, w: 0.45 * power, h: 0.035, dark: true, pool: false, tint: ['#2b2621', '#1a1612'] });
  sb.emit('explosion', { who: by, x, y, power });
  // and everyone for miles around hears it, like a shot
  sb.emit('shot', { who: by, x, y, target: null, loud: true, silent: true, heardAs: 'boomHeard' });
}

/* ----------------------------------- acid ---------------------------------- */

/**
 * Nanite acid, injected by a disassembly drone's tail. It eats at the part it
 * went into - more and more of it - and the burning spreads to the body, for
 * about ten seconds. A drone of the kind it was made for falls apart.
 */
export class Acid {
  constructor(victim, part, bone, t, by) {
    this.mod = 'murder-drones';
    this.part = part;
    this.bone = bone;
    this.t = t;
    this.by = by;
    this.left = 9 + rand(0, 2);
    this.tick = 0;
    this.k = victim.species && victim.species.acid !== undefined ? victim.species.acid : 1;
    this.spots = [];
    for (let i = 0; i < 5; i++) this.spots.push({ dt: rand(-0.18, 0.18), o: rand(0, 6.28), r: rand(0.6, 1.1) });
    this.label = `Nanite acid eating at the ${PART_NAMES[part] || part}`;
  }
  update(man, dt) {
    if (man.removed) return false;
    this.left -= dt;
    if ((this.tick -= dt) <= 0) {
      this.tick = 0.3;
      const h = man.health;
      const was = man.alive;
      const spread = this.left < 6 ? ['torso'] : [];
      for (const part of [this.part, ...spread]) {
        if (!h.parts[part]) continue;
        h.hit(part, (part === this.part ? 2.4 : 1.2) * this.k, { burn: true, cutBy: 'Nanite acid' });
      }
      if (was && man.alive) {
        man.lastHit = { by: this.by, t: man.sandbox.time, part: this.part, power: 0.3, kind: 'acid', blocked: false, object: null, weapon: 'acid' };
        if (man.brain && chance(0.25)) man.brain.speak('acidBurn', {}, 0.6, null, true);
      }
      if (was && h.dead) man.die(h.cause || 'nanite acid', this.by && !this.by.removed ? this.by : null);
      // it fizzes, and drips
      const q = this.where(man);
      man.sandbox.fx.blood(q.x, q.y, rand(-0.3, 0.3), 0.2, 2, 0.4, null, ACID);
      if (chance(0.35)) man.sandbox.emit('acidHiss', { who: man, x: q.x, y: q.y });
    }
    return this.left > 0;
  }
  where(man) {
    if (this.part === 'head') return { x: man.wj.head.x, y: man.wj.head.y };
    return pointOnBone(man.wj, this.bone, this.t);
  }
  draw(ctx, man) {
    const now = man.sandbox.time;
    const fade = clamp(this.left / 2, 0, 1);
    for (const s of this.spots) {
      const q = this.part === 'head' ? { x: man.wj.head.x, y: man.wj.head.y } : pointOnBone(man.wj, this.bone, clamp(this.t + s.dt, 0.02, 0.98));
      const pulse = 0.5 + 0.5 * Math.sin(now * 7 + s.o);
      const r = (0.025 + pulse * 0.02) * s.r * man.scale;
      ctx.fillStyle = `rgba(170, 240, 60, ${0.65 * fade})`;
      ctx.beginPath(); ctx.arc(q.x + Math.cos(s.o) * 0.02, q.y + Math.sin(s.o) * 0.02, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(230, 255, 170, ${0.7 * fade * pulse})`;
      ctx.beginPath(); ctx.arc(q.x + Math.cos(s.o) * 0.02, q.y + Math.sin(s.o) * 0.02, r * 0.4, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/* ---------------------------------- cracks --------------------------------- */

/** Where something came down hard enough to crack the floor: lines in it, fading after a while. */
export class Cracks {
  constructor(x, size = 1) {
    this.mod = 'murder-drones';
    this.x = x;
    this.age = 0;
    this.life = 14;
    this.lines = [];
    for (let i = 0; i < 7; i++) {
      const pts = [[x + rand(-0.1, 0.1), 0]];
      let px = pts[0][0], py = 0;
      const dir = rand(-1, 1);
      for (let k = 0; k < 4; k++) {
        px += (dir * 0.25 + rand(-0.08, 0.08)) * size;
        py -= rand(0.04, 0.12) * size;
        pts.push([px, py]);
      }
      this.lines.push(pts);
    }
  }
  update(dt) { this.age += dt; return this.age < this.life; }
  draw(ctx) {
    const a = clamp((this.life - this.age) / 3, 0, 1) * 0.8;
    ctx.strokeStyle = `rgba(110, 110, 110, ${a})`;
    ctx.lineWidth = 0.018;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const pts of this.lines) {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
