/* =============================================================================
   MINECRAFT - what its things leave in the world.

     explode()     a blast the blocky way: a white flash, a cloud of grey
                   puffs, everyone near it hurt and thrown by how near they
                   were, crates and loose things flung - and, from a wither
                   skull, withering for whoever was caught in it
     Withering     the Wither's curse: it eats at someone for a while, more
                   slowly than they would ever like, turning them ashen.
                   The undead (the Wither, its skeletons) are made of it
     Regeneration  a golden apple's: everything mends, for a few seconds
     SkullShot     a skull the Wither spits: a black one, quick, or a blue
                   one, slow and far worse
     Arrow         one of Steve's: it flies in an arc, and stays in whatever
                   it hits - unless that is armoured, and it bounces off
     puffs, soul fire, sparkles: the bits in between

   Effects go in sandbox.effects ({ update(dt) -> false when done, draw }),
   afflictions in a stickman's afflictions ({ update(man, dt), draw, label }).
   Everything here is tagged with the mod, so removing the mod clears it out.
   ========================================================================== */
import { clamp, rand, chance, sign, lerp, TAU } from '../../core/util.js';
import { pointOnBone } from '../../game/skeleton.js';
import { PART_NAMES } from '../../game/health.js';
import { sprite, blitAt, SKULL, BLUE_SKULL, C } from './pixels.js';

export const MOD = 'minecraft';

/** The undead - the Wither, its skeletons - are what withering is made of: it does nothing to them. */
export const undead = (p) => !!(p && p.species && p.species.undead);

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

/* ---------------------------------- puffs ---------------------------------- */

/**
 * A burst of square puffs - the blocky game's smoke, flame and sparkle all
 * look like this: squares that grow or shrink, drift, and fade.
 */
export class Puffs {
  constructor(o) {
    this.mod = MOD;
    this.list = [];
    this.gravity = o.gravity ?? 0;
    this.add(o);
  }
  add({ x, y, n = 10, speed = 2, size = 0.2, grow = 0.6, life = 0.8, colors = ['#e6e6e6', '#bdbdbd', '#8f8f8f'], up = 0, spread = 0.2 }) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), v = rand(0.3, 1) * speed;
      this.list.push({
        x: x + rand(-spread, spread), y: y + rand(-spread, spread) * 0.6, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 + up,
        r: size * rand(0.6, 1.3), grow, age: 0, life: life * rand(0.6, 1.2), c: colors[Math.floor(Math.random() * colors.length)],
      });
    }
    return this;
  }
  update(dt) {
    for (const p of this.list) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.02, p.y + p.vy * dt);
      p.vx *= Math.exp(-dt * 2.5);
      p.vy = p.vy * Math.exp(-dt * 2.5) - this.gravity * dt;
      p.r = Math.max(0.01, p.r + p.grow * dt * p.r);
    }
    this.list = this.list.filter((p) => p.age < p.life);
    return this.list.length > 0;
  }
  draw(ctx) {
    for (const p of this.list) {
      const k = p.age / p.life;
      ctx.globalAlpha = clamp(1.2 - k * 1.1, 0, 1);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
    }
    ctx.globalAlpha = 1;
  }
}

export const puffs = (sb, o) => { const e = new Puffs(o); sb.effects.push(e); return e; };

/** Blue flames rising: a wither skeleton called up out of nothing. */
export const soulFire = (sb, x, y, n = 14) => puffs(sb, {
  x, y, n, speed: 0.8, size: 0.12, grow: -0.5, life: 1.1, up: 1.8, spread: 0.35,
  colors: [C.soulFire, '#7ff3ff', '#1d9bb0', '#ffffff'],
});

/** White glints: a nether star, a totem charging. */
export const sparkles = (sb, x, y, n = 6, spread = 0.3) => puffs(sb, {
  x, y, n, speed: 0.5, size: 0.06, grow: -0.8, life: 0.7, up: 0.4, spread, colors: ['#ffffff', '#fff6c9', '#d8f0ff'],
});

/* -------------------------------- explosions -------------------------------- */

/**
 * A blast at (x, y). Everyone within reach is hurt and thrown by how close
 * they were, crates and loose things are flung, and the floor is scorched.
 * o.wither: seconds of withering for whoever was caught (level o.level);
 * o.knock: how hard it throws people (1 is a big bang), o.throwAt: how
 * close (0..1 of the way in) someone has to be to be thrown at all, o.hurt:
 * how much it hurts, next to a bang of its size.
 */
export function explode(sb, x, y, by, power = 1, o = {}) {
  const R = 0.5 + 1.4 * power;
  for (const p of [...sb.people]) {
    if (p.removed || p === o.spare) continue;
    // (the undead's own blasts do not touch the undead)
    if (by && undead(by) && undead(p)) continue;
    const n = p.nearestPart(x, y);
    if (!n || n.d > R) continue;
    const k = 1 - n.d / R;
    const dir = sign(p.wj.hip.x - x) || 1;
    // (a blast is all over a body: it is taken on the body, not the head)
    const part = n.part === 'head' ? 'torso' : n.part;
    p.takeHit({ by, part, x: n.x, y: n.y, dir, power: (0.5 + 3.4 * k * power) * (o.hurt ?? 1), kind: 'impact', weapon: 'mcBlast', bone: part === n.part ? p.boneName(n.bone, n.t) : 'ribs' });
    if (p.removed) continue;
    if (o.wither && k > 0.15) wither(p, o.wither * (0.5 + k * 0.5), o.level || 1, by);
    const knock = o.knock ?? 1;
    if (k > (o.throwAt ?? 0.25) && p.state !== 'held') {
      const vx = dir * (2.5 + 7 * k) * power * knock, vy = (2 + 5 * k * power) * knock;
      if (p.rag) p.rag.kick(vx * 0.8, vy * 0.8);
      else if (p.alive) p.launch(vx, vy);
    } else if (k > 0.3 && p.alive && p.state === 'stand') {
      // not enough to throw them: it rocks them back on their heels
      p.staggerFrom(dir, 0.6 + k * knock);
    }
  }
  for (const c of sb.crates) {
    if (c.removed || c.carriedBy) continue;
    const dx = c.pos.x - x, dy = c.pos.y - y, d = Math.hypot(dx, dy);
    if (d > R * 1.3) continue;
    const k = 1 - d / (R * 1.3);
    c.body.applyImpulse((dx / (d || 1)) * 150 * k * power, (Math.max(0.2, dy / (d || 1)) * 150 + 40) * k * power, c.pos.x, c.pos.y - 0.2);
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
  sb.fx.dust(x, Math.max(0, y), 10, 1.4);
  // the cloud: white in the middle, grey round it
  puffs(sb, { x, y, n: Math.round(14 + 10 * power), speed: 2.2 * power, size: 0.32 * power, grow: 0.7, life: 0.9, colors: ['#ffffff', '#e8e8e8', '#c9c9c9', '#9e9e9e'], spread: 0.25 * power });
  puffs(sb, { x, y, n: 8, speed: 1.2, size: 0.45 * power, grow: 0.3, life: 1.6, up: 0.6, colors: ['#7a7a7a', '#5e5e5e', '#8b8b8b'], spread: 0.4 });
  if (y < 0.8) sb.fx.splats.push({ x, w: 0.5 * power, h: 0.035, dark: true, pool: false, tint: ['#2b2621', '#1a1612'] });
  sb.emit('mcExplosion', { who: by, x, y, power });
  // everyone for miles around hears it
  sb.emit('shot', { who: by, x, y, target: null, loud: true, silent: true, heardAs: 'mcBoomHeard' });
}

/* -------------------------------- withering --------------------------------- */

/**
 * Withering: every so often it takes a little more out of them, mostly from
 * the body, and they go grey and ashen with black wisps coming off them.
 * Level II is quicker. It can kill.
 */
export class Withering {
  constructor(victim, secs, level, by) {
    this.mod = MOD;
    this.left = secs;
    this.level = level;
    this.by = by;
    this.tick = 0.4;
    this.age = 0;
    this.seed = rand(0, 100);
    this.withering = true;
  }
  get label() { return `Withering${this.level > 1 ? ' II' : ''} (${Math.ceil(this.left)}s)`; }
  update(man, dt) {
    if (man.removed || man.dead) return false;
    this.left -= dt;
    this.age += dt;
    if ((this.tick -= dt) <= 0) {
      this.tick = this.level > 1 ? 0.55 : 0.8;
      const h = man.health, was = man.alive;
      const parts = ['armA', 'armB', 'legA', 'legB', 'head'];
      h.hit('torso', this.level > 1 ? 1.2 : 1, { cutBy: 'Withering', cause: 'withering' });
      h.hit(parts[Math.floor(Math.random() * parts.length)], this.level > 1 ? 0.6 : 0.5, { cutBy: 'Withering', cause: 'withering' });
      h.pain = Math.min(130, h.pain + 1.2);
      if (was && man.alive) {
        man.lastHit = { by: this.by, t: man.sandbox.time, part: 'torso', power: 0.2, kind: 'wither', blocked: false, object: null, weapon: 'wither' };
        if (man.brain && chance(0.12)) man.brain.speak('withering', {}, 0.7, null, true);
      }
      if (was && h.dead) man.die(h.cause || 'withering', this.by && !this.by.removed ? this.by : null);
      man.sandbox.emit('witherTick', { who: man, x: man.wj.chest.x, y: man.wj.chest.y });
    }
    return this.left > 0;
  }
  draw(ctx, man) {
    const j = man.wj, t = man.sandbox.time, fade = clamp(this.left / 1.5, 0, 1);
    // ashen: the body goes grey where the curse has it
    ctx.save();
    ctx.lineCap = 'round';
    ctx.globalAlpha = (0.35 + 0.15 * Math.sin(t * 6 + this.seed)) * fade;
    ctx.strokeStyle = '#7d7d7d';
    ctx.lineWidth = 0.05 * man.scale;
    ctx.beginPath();
    ctx.moveTo(j.hip.x, j.hip.y); ctx.lineTo(j.chest.x, j.chest.y); ctx.lineTo(j.neck.x, j.neck.y);
    for (const [a, b, c] of [['shoulder', 'elbowA', 'handA'], ['shoulder', 'elbowB', 'handB'], ['hip', 'kneeA', 'footA'], ['hip', 'kneeB', 'footB']]) {
      ctx.moveTo(j[a].x, j[a].y); ctx.lineTo(j[b].x, j[b].y); ctx.lineTo(j[c].x, j[c].y);
    }
    ctx.stroke();
    ctx.restore();
    // and black wisps, curling up off them
    for (let i = 0; i < 5; i++) {
      const k = ((t * 0.7 + i / 5 + this.seed) % 1);
      const base = i % 2 ? j.chest : j.hip;
      const x = base.x + Math.sin(t * 2.3 + i * 1.7) * 0.18, y = base.y + k * 0.9;
      ctx.globalAlpha = (1 - k) * 0.85 * fade;
      ctx.fillStyle = i % 3 ? '#0d0d0d' : '#2a2030';
      const s = 0.07 * (1 - k * 0.5);
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
}

/** Withers someone (the undead shrug it off). More of it on someone already withering makes it last longer. */
export function wither(victim, secs, level = 1, by = null) {
  if (!victim || victim.removed || victim.dead || undead(victim)) return null;
  const old = victim.afflictions.find((a) => a.withering);
  if (old) {
    old.left = Math.max(old.left, secs);
    old.level = Math.max(old.level, level);
    return old;
  }
  const w = new Withering(victim, secs, level, by);
  victim.afflictions.push(w);
  victim.sandbox.emit('withered', { who: victim, by, x: victim.wj.chest.x, y: victim.wj.chest.y });
  if (victim.brain) victim.brain.speak('withering', {}, 0.8, null, true);
  return w;
}

/* ------------------------------- regeneration ------------------------------- */

/** Everything mending, for a few seconds, with little red-pink glints coming off them. */
export class Regeneration {
  constructor(secs = 6) {
    this.mod = MOD;
    this.left = secs;
    this.label = 'Regeneration';
  }
  update(man, dt) {
    if (man.removed || man.dead) return false;
    this.left -= dt;
    const h = man.health;
    for (const p of Object.values(h.parts)) {
      p.hp = Math.min(p.max, p.hp + dt * 3.2);
      p.bleed *= Math.exp(-dt * 0.8);
    }
    h.internal *= Math.exp(-dt * 0.5);
    h.pain = Math.max(0, h.pain - dt * 4);
    h.blood = Math.min(1, h.blood + dt * 0.01);
    return this.left > 0;
  }
  draw(ctx, man) {
    const t = man.sandbox.time;
    for (let i = 0; i < 4; i++) {
      const k = (t * 0.9 + i / 4) % 1;
      const x = man.wj.chest.x + Math.sin(i * 2.1 + t) * 0.25, y = man.wj.hip.y + k * 1.2 * man.scale;
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.fillStyle = i % 2 ? '#ff5ab2' : '#ff9ad0';
      ctx.fillRect(x - 0.03, y - 0.03, 0.06, 0.06);
    }
    ctx.globalAlpha = 1;
  }
}

/* --------------------------------- skulls ----------------------------------- */

/** A skull out of one of the Wither's mouths: straight at whoever it was spat at, and it goes off on whatever it meets. */
export class SkullShot {
  constructor(sb, by, x, y, vx, vy, blue = false) {
    this.mod = MOD;
    this.sb = sb;
    this.by = by;
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.blue = blue;
    this.age = 0;
    this.trail = [];
    this.smokeT = 0;
    this.dead = false;
  }
  update(dt) {
    if (this.dead) return false;
    const sb = this.sb;
    this.age += dt;
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    const L = Math.hypot(nx - this.x, ny - this.y) || 1e-6;
    const hit = castRay(sb, this.x, this.y, (nx - this.x) / L, (ny - this.y) / L, L + 0.08, this.age < 0.4 ? this.by : null);
    // the undead are not what it is for: it goes straight through its own
    const own = hit.what === 'person' && undead(hit.who);
    if ((hit.what && !own) || this.age > 6) {
      const at = hit.what ? hit : this;
      explode(sb, at.x, Math.max(0.05, at.y), this.by, this.blue ? 1.0 : 0.45, {
        wither: this.blue ? 9 : 6, level: this.blue ? 2 : 1, knock: this.blue ? 0.85 : 0.5, throwAt: this.blue ? 0.6 : 2, hurt: this.blue ? 0.9 : 0.6,
      });
      sb.emit('skullHit', { by: this.by, x: at.x, y: at.y, blue: this.blue });
      this.dead = true;
      return false;
    }
    this.x = nx; this.y = ny;
    this.trail.push({ x: nx, y: ny });
    if (this.trail.length > 10) this.trail.shift();
    return true;
  }
  draw(ctx) {
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i], k = i / this.trail.length;
      ctx.globalAlpha = k * 0.45;
      ctx.fillStyle = this.blue ? '#7fa8ff' : '#2c2c2c';
      const s = (this.blue ? 0.16 : 0.11) * k;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    const s = this.blue ? 0.36 : 0.26;
    blitAt(ctx, sprite(this.blue ? BLUE_SKULL : SKULL), this.x, this.y, s, s, 0, this.vx < 0);
    if (this.blue) {
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(this.age * 20);
      ctx.fillStyle = '#9ec2ff';
      ctx.fillRect(this.x - s * 0.7, this.y - s * 0.7, s * 1.4, s * 1.4);
      ctx.globalAlpha = 1;
    }
  }
}

/* --------------------------------- arrows ----------------------------------- */

const ARROW_G = 13;

/** An arrow in flight, then stuck in whatever it hit for a while (or bounced off armour, and lying there). */
export class Arrow {
  constructor(sb, by, x, y, vx, vy, power) {
    this.mod = MOD;
    this.sb = sb;
    this.by = by;
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.power = power;
    this.age = 0;
    this.stuck = null;     // { crate, lx, ly, la } or { floor: true, a }
    this.left = 18;
    this.bounced = false;
    this.spin = 0;
    this.target = by && by.aimTarget && by.aimTarget.kind === 'stickman' ? by.aimTarget : null;
    this.missed = new Set();     // people it has already gone past
  }
  get a() { return Math.atan2(this.vy, this.vx); }
  update(dt) {
    const sb = this.sb;
    this.age += dt;
    if (this.stuck) {
      this.left -= dt;
      if (this.stuck.crate && this.stuck.crate.removed) return false;
      return this.left > 0;
    }
    this.vy -= ARROW_G * dt;
    if (this.bounced) this.spin += dt * 14;
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    const L = Math.hypot(nx - this.x, ny - this.y) || 1e-6;
    const ux = (nx - this.x) / L, uy = (ny - this.y) / L;
    let hit = castRay(sb, this.x, this.y, ux, uy, L, this.age < 0.15 || this.bounced ? this.by : null);
    // someone it was not meant for, in the way: as often as not it goes past them
    while (hit.what === 'person' && hit.who !== this.target && (this.missed.has(hit.who) || (!chance(0.4) && this.missed.add(hit.who)))) {
      const skip = hit.who;
      hit = castRay(sb, hit.x + ux * 0.02, hit.y + uy * 0.02, ux, uy, Math.max(0.01, L - hit.t), skip);
      if (hit.what === 'person' && hit.who === skip) break;
    }
    if (hit.what === 'person' && !this.bounced) {
      const q = hit.who, h = hit.hit;
      if (q.species && q.species.deflects && q.species.deflects(q, 'arrow')) {
        // armour: off it goes
        this.bounced = true;
        this.vx = -this.vx * 0.25 + rand(-1, 1);
        this.vy = Math.abs(this.vy) * 0.2 + 3;
        this.x = hit.x - ux * 0.05; this.y = hit.y - uy * 0.05;
        sb.fx.sparks(hit.x, hit.y, 4);
        sb.emit('armorDeflect', { who: q, x: hit.x, y: hit.y });
        return true;
      }
      q.takeHit({ by: this.by, part: h.part, x: h.x, y: h.y, dir: sign(this.vx), power: this.power, kind: 'shot', weapon: 'arrow', bone: q.boneName(h.bone, h.tb), deep: true });
      if (!q.removed && !q.steadfast) q.afflictions.push(new StuckArrow(h.bone, h.tb, this.a, q.rag ? q.rag.facing : q.facing));
      sb.emit('arrowHit', { who: q, by: this.by, x: h.x, y: h.y });
      return false;
    }
    if (hit.what === 'crate') {
      const c = hit.crate, b = c.body;
      const l = b.toLocal(hit.x, hit.y);
      this.stuck = { crate: c, lx: l.x, ly: l.y, la: this.a - b.rot };
      this.x = hit.x; this.y = hit.y;
      sb.emit('arrowHit', { what: c, x: hit.x, y: hit.y });
      return true;
    }
    if (hit.what === 'floor' || hit.what === 'wall' || ny < 0) {
      if (this.bounced) { this.x = hit.x; this.y = 0.02; this.stuck = { floor: true, a: rand(-0.2, 0.2) + Math.PI }; return true; }
      this.stuck = { floor: true, a: this.a };
      this.x = hit.x; this.y = Math.max(0, hit.y);
      sb.emit('arrowHit', { what: hit.what, x: hit.x, y: hit.y });
      return true;
    }
    this.x = nx; this.y = ny;
    return this.age < 6;
  }
  draw(ctx) {
    let x = this.x, y = this.y, a = this.bounced && !this.stuck ? this.spin : this.a;
    if (this.stuck && this.stuck.crate) {
      const b = this.stuck.crate.body, p = b.toWorld(this.stuck.lx, this.stuck.ly);
      x = p.x; y = p.y; a = this.stuck.la + b.rot;
    } else if (this.stuck) a = this.stuck.a;
    ctx.globalAlpha = this.stuck ? clamp(this.left / 2, 0, 1) : 1;
    drawArrow(ctx, x, y, a, this.stuck && !this.bounced ? 0.22 : 0);
    ctx.globalAlpha = 1;
  }
}

/**
 * An arrow, its point at (x, y), pointing along a. `sunk` is how much of it
 * is inside whatever it hit.
 */
export function drawArrow(ctx, x, y, a, sunk = 0) {
  const L = 0.62;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.translate(sunk, 0);
  ctx.lineCap = 'butt';
  ctx.strokeStyle = '#5a3a1a';
  ctx.lineWidth = 0.028;
  ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(-0.06, 0); ctx.stroke();
  // the head
  ctx.fillStyle = '#9a9a9a';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-0.09, 0.04); ctx.lineTo(-0.09, -0.04); ctx.closePath(); ctx.fill();
  // the flights
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(-L, 0.012, 0.13, 0.03);
  ctx.fillRect(-L, -0.042, 0.13, 0.03);
  ctx.restore();
}

/** An arrow sticking out of somebody, where it went in, until it is pulled out (by healing) or a while has passed. */
export class StuckArrow {
  constructor(bone, t, a, facing) {
    this.mod = MOD;
    this.bone = bone;
    this.t = t;
    // the way it points, in their own frame: it turns round with them
    this.la = facing > 0 ? a : Math.PI - a;
    this.left = 25;
    this.label = null;
  }
  update(man, dt) {
    this.left -= dt;
    return this.left > 0 && !man.removed;
  }
  draw(ctx, man) {
    const f = man.rag ? man.rag.facing : man.facing;
    const p = pointOnBone(man.wj, this.bone, clamp(this.t, 0, 1));
    drawArrow(ctx, p.x, p.y, f > 0 ? this.la : Math.PI - this.la, 0.18);
  }
}

export { PART_NAMES, lerp };
