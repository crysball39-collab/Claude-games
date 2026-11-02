/* =============================================================================
   Electricity: a generator makes it, a power cord carries it, and whatever is
   at the other end runs on it - or is electrocuted by it.

     Generator    tapped, it pulls over, coughs, and runs: 230 volts out of
                  it, rattling and smoking, until it is tapped again
     Power cord   the wire tool's seventh wire: it carries the current from
                  whatever it is tied to to whatever else - and so does any
                  metal wall or beam it is tied to, into whatever touches that
     Lightbulb    lights up, warm, with power. Dropped from any height, hit
                  hard, shot, or caught in a blast, it shatters - glass
                  everywhere - and live, the bare filament sparks
     Floodlight   a hard white beam of light, the way it points (turn it with
                  the hand); its glass shatters the same way
     Volt meter   shows what it is getting: 000 with nothing, 230 off a
                  running generator - tie a cord from it to whatever is to be
                  tested
     People       tied to it, or touching live metal, the current goes through
                  them: every muscle locks, they go over shaking, burned where
                  it goes in - and it goes for the heart. Kept on them long
                  enough, the heart stops.

   The network is worked out again every step, from the power cords and the
   metal they are tied to: anything in one piece of it with a running
   generator is live. Everything here is in sandbox.items, like a mod's
   things, so the hand, the wires, the freeze tool and the eraser all work on
   it as they do on anything else.
   ========================================================================== */
import { Body } from '../physics/rigid.js';
import { endPos } from './wires.js';
import { zap } from './taser.js';
import { clamp, lerp, rand, chance, rng, TAU } from '../core/util.js';

// (the flicker of the arcs is only how they look: random numbers of its own, so drawing never changes what happens)
const arcRand = rng(0xa7c5);
const arc = (a, b) => a + arcRand() * (b - a);

export const VOLTS = 230;

/* ---------------------------------- the network ---------------------------------- */

/** Whether a slab is metal (a metal wall, a beam, a piece of either): it carries the current. */
const metal = (s) => !s.removed && s.mat && s.mat.name === 'metal' && !s.background;

/**
 * The network as it is this step: every thing joined to every other by power
 * cords (and live metal, and what touches it), and which pieces of it have a
 * running generator. volts(t) for anything: 230, or 0.
 */
export function network(sb) {
  if (sb.power && sb.power.t === sb.time) return sb.power;
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { const g = parent.get(parent.get(x)); parent.set(x, g); x = g; } return x; };
  const join = (a, b) => {
    for (const t of [a, b]) if (!parent.has(t)) parent.set(t, t);
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  // where each person is touched by it: where the cord is tied, or where they touch the metal
  const contact = new Map();
  for (const w of sb.wires) {
    if (!w.spec.power || w.removed || !w.a.t || !w.b.t) continue;
    join(w.a.t, w.b.t);
    for (const e of [w.a, w.b]) if (e.t.kind === 'stickman' && !contact.has(e.t)) contact.set(e.t, endPos(e));
  }
  // metal with a cord on it carries it on, to whatever touches it
  for (const s of sb.slabs) {
    if (!metal(s) || !parent.has(s)) continue;
    for (const it of sb.items) {
      if (!it.conducts || it.removed || parent.has(it) && find(it) === find(s)) continue;
      const r = Math.max(it.body.w, it.body.h) * 0.6;
      if (s.contains(it.pos.x, it.pos.y, r)) join(s, it);
    }
    for (const p of sb.people) {
      if (p.removed) continue;
      const b = s.body.aabb();
      if (p.box.maxX < b.minX - 0.1 || p.box.minX > b.maxX + 0.1 || p.box.maxY < b.minY - 0.1 || p.box.minY > b.maxY + 0.1) continue;
      // (a joint's own thickness counts: lying on it, they are touching it)
      for (const k of ['handA', 'handB', 'footA', 'footB', 'toeA', 'toeB', 'kneeA', 'kneeB', 'elbowA', 'elbowB', 'hip', 'chest', 'head']) {
        const j = p.wj[k];
        if (j && s.contains(j.x, j.y, 0.1 * (p.scale || 1))) { join(s, p); if (!contact.has(p)) contact.set(p, { x: j.x, y: j.y }); break; }
      }
    }
  }
  const live = new Set();
  for (const it of sb.items) if (it.kind === 'generator' && it.running && parent.has(it)) live.add(find(it));
  const volts = (t) => (parent.has(t) && live.has(find(t)) ? VOLTS : 0);
  sb.power = { t: sb.time, volts, contact };
  return sb.power;
}

/* ------------------------------ what they all share ------------------------------ */

class Device {
  constructor(sb, kind, name, w, h, mass, x, y, o = {}) {
    this.kind = kind;
    this.name = name;
    this.sandbox = sb;
    this.removed = false;
    this.conducts = true;
    this.body = new Body(w, h, mass, { x, y, rot: o.rot || 0, owner: this, friction: o.friction ?? 0.7, restitution: o.bounce ?? 0.1, angularDamping: 0.6 });
    sb.phys.add(this.body);
    this.inWorld = true;
    this.volts = 0;
  }

  get pos() { return this.body.pos; }
  get loose() { return !this.removed && this.inWorld; }
  contains(x, y, r) { return this.body.contains(x, y, r * 0.6 + 0.05); }
  leave(sb) { if (this.inWorld) { sb.phys.remove(this.body); this.inWorld = false; } }

  update(dt, sb) {
    this.volts = network(sb).volts(this);
    shockPeople(sb, dt);
    lights(sb);
  }
}

/* ---------------------------------- the generator --------------------------------- */

export class Generator extends Device {
  constructor(sb, x, y) {
    super(sb, 'generator', 'Generator', 0.9, 0.62, 70, x, y, { friction: 0.9 });
    this.on = false;
    this.startT = 0;
    this.runT = 0;
    this.thudT = 0;
  }

  /** Running: started, and caught. */
  get running() { return this.on && this.startT <= 0; }

  tap(sb) {
    if (this.on) {
      this.on = false;
      sb.emit('genStop', { what: this, x: this.pos.x, y: this.pos.y });
      return 'Generator off.';
    }
    this.on = true;
    this.startT = 0.9;
    sb.emit('genStart', { what: this, x: this.pos.x, y: this.pos.y });
    return 'The generator coughs and starts: 230 volts.';
  }

  update(dt, sb) {
    if (this.on && this.startT > 0) this.startT -= dt;
    if (this.running) {
      this.runT += dt;
      const ex = this.body.toWorld(-0.38, 0.26);
      if (Math.random() < dt * 6) sb.fx.smoke(ex.x, ex.y, 1, 0.7);
      // (the engine thudding: for the sound)
      if ((this.thudT -= dt) <= 0) { this.thudT = 0.45; sb.emit('genRun', { what: this, x: this.pos.x, y: this.pos.y }); }
    }
    super.update(dt, sb);
  }

  draw(ctx) {
    const b = this.body, j = this.running ? Math.sin(this.runT * 70) * 0.004 : 0;
    ctx.save();
    ctx.translate(b.pos.x + j, b.pos.y + Math.abs(j));
    ctx.rotate(b.rot);
    drawGeneratorShape(ctx, this.running);
    ctx.restore();
  }
}

/** A generator, centred on the origin: a tube frame round an engine and a tank, the panel on the front. */
export function drawGeneratorShape(ctx, running = false) {
  // the engine, and the tank on top of it
  ctx.fillStyle = '#3a3f44';
  ctx.fillRect(-0.36, -0.24, 0.5, 0.3);
  ctx.fillStyle = '#d12f24';
  ctx.strokeStyle = '#6e1712';
  ctx.lineWidth = 0.01;
  ctx.beginPath();
  ctx.moveTo(-0.38, 0.08); ctx.lineTo(0.38, 0.08); ctx.lineTo(0.34, 0.27); ctx.lineTo(-0.34, 0.27);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e8c547';
  ctx.fillRect(-0.12, 0.16, 0.24, 0.05);
  ctx.fillStyle = '#26292c';
  ctx.beginPath(); ctx.arc(0.22, 0.27, 0.03, Math.PI, 0); ctx.fill();
  // the panel: an outlet and a light
  ctx.fillStyle = '#e6e2d6';
  ctx.fillRect(0.16, -0.2, 0.2, 0.22);
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(0.2, -0.14, 0.05, 0.08);
  ctx.fillRect(0.28, -0.14, 0.05, 0.08);
  ctx.fillStyle = running ? '#5dff6a' : '#1d4a22';
  ctx.beginPath(); ctx.arc(0.26, -0.02, 0.016, 0, TAU); ctx.fill();
  if (running) {
    ctx.fillStyle = 'rgba(90, 255, 110, 0.3)';
    ctx.beginPath(); ctx.arc(0.26, -0.02, 0.04, 0, TAU); ctx.fill();
  }
  // the exhaust
  ctx.fillStyle = '#6b6f73';
  ctx.fillRect(-0.42, 0.14, 0.08, 0.1);
  // the frame
  ctx.strokeStyle = '#1b1d1f';
  ctx.lineWidth = 0.035;
  ctx.lineJoin = 'round';
  ctx.strokeRect(-0.43, -0.29, 0.86, 0.58);
  ctx.beginPath(); ctx.moveTo(-0.43, -0.31); ctx.lineTo(-0.43, -0.27); ctx.moveTo(0.43, -0.31); ctx.lineTo(0.43, -0.27); ctx.stroke();
}

/* ------------------------------- the lightbulb ------------------------------- */

/** Glass: breaks if what it is on changes how it is moving by this much in a step (m/s), or it is shot or blasted. */
class Glass extends Device {
  constructor(sb, kind, name, w, h, mass, x, y, o = {}) {
    super(sb, kind, name, w, h, mass, x, y, o);
    this.broken = false;
    this.lit = 0;
    this.was = { x: 0, y: 0 };
    this.tough = o.tough || 5.5;
    this.sparkT = 0;
    this.wasHeld = false;
  }

  update(dt, sb) {
    super.update(dt, sb);
    const b = this.body;
    // hit hard enough - landing, or something landing on it - and it goes
    const dv = Math.hypot(b.vel.x - this.was.x, b.vel.y - this.was.y);
    if (!this.broken && this.t0 > 0.3 && dv > this.tough) this.shatter(sb);
    this.was.x = b.vel.x; this.was.y = b.vel.y;
    this.t0 = (this.t0 || 0) + dt;
    this.lit = lerp(this.lit, this.volts > 100 && !this.broken ? 1 : 0, 1 - Math.exp(-dt * (this.broken ? 30 : 9)));
    // broken and still live: the filament sparks
    if (this.broken && this.volts > 0 && (this.sparkT -= dt) <= 0) {
      this.sparkT = rand(0.15, 0.6);
      const q = this.glow();
      sb.fx.sparks(q.x, q.y, 3);
      sb.emit('fizz', { what: this, x: q.x, y: q.y });
    }
  }

  /** Shattered: the glass everywhere, and no more light out of it. */
  shatter(sb = this.sandbox) {
    if (this.broken || this.removed) return false;
    this.broken = true;
    const q = this.glow();
    for (let i = 0; i < 10; i++) sb.fx.debris.push({ x: q.x + rand(-0.04, 0.04), y: q.y + rand(-0.04, 0.04), vx: rand(-2.5, 2.5), vy: rand(0.5, 3.5), s: rand(0.012, 0.03), c: 'rgba(225, 240, 250, 0.85)', a: rand(0, 3), va: rand(-20, 20), rest: false, age: 0, sharp: true });
    if (this.volts > 0) sb.fx.sparks(q.x, q.y, 8);
    sb.emit('glassBreak', { what: this, x: q.x, y: q.y });
    return true;
  }
}

export class Lightbulb extends Glass {
  constructor(sb, x, y) {
    super(sb, 'lightbulb', 'Lightbulb', 0.11, 0.17, 0.12, x, y, { bounce: 0.2, tough: 5.5 });
  }

  /** Where the light comes from, in the world. */
  glow() { return this.body.toWorld(0, 0.025); }

  tap() {
    if (this.broken) return this.volts ? 'Broken - and still live. Careful.' : 'A broken lightbulb.';
    return this.lit > 0.5 ? 'A lightbulb, lit.' : 'A lightbulb. Tie a power cord from a running generator to it.';
  }

  draw(ctx) {
    const b = this.body;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(b.rot);
    drawBulbShape(ctx, this.lit, this.broken);
    ctx.restore();
  }
}

/** A lightbulb, centred on the origin, the screw cap at the bottom: lit (0..1), or broken. */
export function drawBulbShape(ctx, lit = 0, broken = false) {
  // the cap
  ctx.fillStyle = '#b9a35a';
  ctx.fillRect(-0.025, -0.085, 0.05, 0.05);
  ctx.strokeStyle = '#6c5c2a';
  ctx.lineWidth = 0.005;
  ctx.beginPath();
  for (const y of [-0.072, -0.058, -0.044]) { ctx.moveTo(-0.025, y); ctx.lineTo(0.025, y); }
  ctx.stroke();
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(-0.012, -0.092, 0.024, 0.008);
  // the filament
  ctx.strokeStyle = lit > 0.1 ? `rgb(255, ${Math.round(160 + 90 * lit)}, ${Math.round(80 + 140 * lit)})` : '#5a4a3a';
  ctx.lineWidth = 0.005;
  ctx.beginPath();
  ctx.moveTo(-0.01, -0.035); ctx.lineTo(-0.012, 0.02); ctx.lineTo(-0.004, 0.03); ctx.lineTo(0.004, 0.02); ctx.lineTo(0.012, 0.03); ctx.lineTo(0.01, -0.035);
  ctx.stroke();
  if (broken) {
    // what is left of the glass: a jagged ring round the cap
    ctx.fillStyle = 'rgba(210, 228, 240, 0.55)';
    ctx.beginPath();
    ctx.moveTo(-0.03, -0.035); ctx.lineTo(-0.042, 0.0); ctx.lineTo(-0.026, -0.008); ctx.lineTo(-0.02, 0.02); ctx.lineTo(-0.008, -0.01);
    ctx.lineTo(0.006, 0.012); ctx.lineTo(0.016, -0.012); ctx.lineTo(0.034, 0.016); ctx.lineTo(0.03, -0.035);
    ctx.closePath();
    ctx.fill();
    return;
  }
  // the glass
  ctx.fillStyle = lit > 0.05 ? `rgba(255, ${Math.round(236 + 14 * lit)}, ${Math.round(170 + 50 * lit)}, ${0.35 + 0.6 * lit})` : 'rgba(215, 232, 242, 0.45)';
  ctx.strokeStyle = 'rgba(120, 140, 155, 0.8)';
  ctx.lineWidth = 0.005;
  ctx.beginPath();
  ctx.moveTo(-0.026, -0.035);
  ctx.bezierCurveTo(-0.03, -0.01, -0.06, 0.02, -0.055, 0.045);
  ctx.arc(0, 0.045, 0.055, Math.PI, 0, true);
  ctx.bezierCurveTo(0.06, 0.02, 0.03, -0.01, 0.026, -0.035);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath(); ctx.ellipse(-0.022, 0.06, 0.008, 0.018, -0.4, 0, TAU); ctx.fill();
}

/* ---------------------------------- the floodlight --------------------------------- */

export class Floodlight extends Glass {
  constructor(sb, x, y, facing = 1) {
    super(sb, 'floodlight', 'Floodlight', 0.52, 0.42, 7, x, y, { tough: 8, rot: 0 });
    this.facing = facing;
  }

  /** Where the lens is, in the world, and which way it shines. */
  glow() { return this.body.toWorld(0.17 * this.facing, 0.08); }
  beamDir() { const a = this.body.rot + (this.facing > 0 ? 0.28 : Math.PI - 0.28); return { x: Math.cos(a), y: Math.sin(a) }; }

  tap() {
    if (this.broken) return 'The glass is gone: it will not light again.';
    return this.lit > 0.5 ? 'A floodlight, on. Turn it with the hand.' : 'A floodlight. Tie a power cord from a running generator to it.';
  }

  draw(ctx) {
    const b = this.body;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(b.rot);
    ctx.scale(this.facing, 1);
    drawFloodShape(ctx, this.lit, this.broken);
    ctx.restore();
  }
}

/** A floodlight, centred on the origin, on its stand, the lamp facing +x and tilted up: lit (0..1), or its glass broken. */
export function drawFloodShape(ctx, lit = 0, broken = false) {
  // the stand: feet and a yoke
  ctx.strokeStyle = '#2a2d30';
  ctx.lineWidth = 0.03;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-0.22, -0.2); ctx.lineTo(0, -0.04); ctx.lineTo(0.22, -0.2);
  ctx.moveTo(0, -0.04); ctx.lineTo(0, 0.06);
  ctx.stroke();
  // the lamp head, tilted up
  ctx.save();
  ctx.translate(0, 0.08);
  ctx.rotate(0.28);
  ctx.fillStyle = '#3d4247';
  ctx.strokeStyle = '#1a1c1e';
  ctx.lineWidth = 0.01;
  ctx.fillRect(-0.16, -0.11, 0.3, 0.22);
  ctx.strokeRect(-0.16, -0.11, 0.3, 0.22);
  // fins at the back
  ctx.strokeStyle = '#26292c';
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  for (const y of [-0.08, -0.04, 0, 0.04, 0.08]) { ctx.moveTo(-0.2, y); ctx.lineTo(-0.16, y); }
  ctx.stroke();
  // the lens
  if (broken) {
    ctx.fillStyle = '#15171a';
    ctx.fillRect(0.14, -0.1, 0.035, 0.2);
    ctx.fillStyle = 'rgba(210, 228, 240, 0.6)';
    ctx.beginPath(); ctx.moveTo(0.15, -0.1); ctx.lineTo(0.175, -0.04); ctx.lineTo(0.15, 0.02); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillStyle = lit > 0.05 ? `rgba(255, 255, ${Math.round(220 + 35 * lit)}, ${0.5 + 0.5 * lit})` : 'rgba(190, 212, 226, 0.75)';
    ctx.fillRect(0.14, -0.1, 0.035, 0.2);
  }
  ctx.restore();
}

/* ---------------------------------- the volt meter --------------------------------- */

export class VoltMeter extends Device {
  constructor(sb, x, y) {
    super(sb, 'voltmeter', 'Volt meter', 0.2, 0.28, 0.6, x, y);
    this.reading = 0;
  }

  update(dt, sb) {
    super.update(dt, sb);
    const want = this.volts ? this.volts + Math.sin(sb.time * 3.1) * 1.5 + rand(-0.6, 0.6) : 0;
    this.reading = lerp(this.reading, want, 1 - Math.exp(-dt * 10));
  }

  tap() { return `The volt meter reads ${Math.round(this.reading)} V.`; }

  draw(ctx) {
    const b = this.body;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(b.rot);
    drawMeterShape(ctx, this.reading);
    ctx.restore();
  }
}

// which of the seven segments each digit lights: a top, b top right, c bottom right, d bottom, e bottom left, f top left, g middle
const SEGS = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];

/** A digit in seven segments, its bottom left corner at (x, y), w by h. */
function digit(ctx, x, y, w, h, n, on) {
  const t = w * 0.2;
  const seg = {
    a: [x + t, y + h - t, w - 2 * t, t], d: [x + t, y, w - 2 * t, t], g: [x + t, y + h / 2 - t / 2, w - 2 * t, t],
    f: [x, y + h / 2, t, h / 2 - t / 2], b: [x + w - t, y + h / 2, t, h / 2 - t / 2],
    e: [x, y + t / 2, t, h / 2 - t / 2], c: [x + w - t, y + t / 2, t, h / 2 - t / 2],
  };
  for (const k of 'abcdefg') {
    ctx.fillStyle = SEGS[n].includes(k) ? on : 'rgba(40, 60, 40, 0.35)';
    const r = seg[k];
    ctx.fillRect(r[0], r[1], r[2], r[3]);
  }
}

/** A volt meter, centred on the origin: a yellow case, its reading in red digits, and its two sockets. */
export function drawMeterShape(ctx, reading = 0) {
  ctx.fillStyle = '#f0c52e';
  ctx.strokeStyle = '#6a5612';
  ctx.lineWidth = 0.008;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(-0.1, -0.14, 0.2, 0.28, 0.025) : ctx.rect(-0.1, -0.14, 0.2, 0.28);
  ctx.fill();
  ctx.stroke();
  // the display
  ctx.fillStyle = '#1d2a1f';
  ctx.fillRect(-0.082, 0.03, 0.164, 0.085);
  const v = clamp(Math.round(reading), 0, 999);
  const ds = [Math.floor(v / 100), Math.floor(v / 10) % 10, v % 10];
  for (let i = 0; i < 3; i++) digit(ctx, -0.074 + i * 0.044, 0.042, 0.034, 0.062, ds[i], '#ff4a3a');
  // a V under it, and the dial
  ctx.strokeStyle = '#2b2b2b';
  ctx.lineWidth = 0.008;
  ctx.beginPath(); ctx.moveTo(-0.02, 0.0); ctx.lineTo(0, -0.03); ctx.lineTo(0.02, 0.0); ctx.stroke();
  ctx.fillStyle = '#2b2b2b';
  ctx.beginPath(); ctx.arc(0, -0.065, 0.025, 0, TAU); ctx.fill();
  // the sockets
  ctx.fillStyle = '#d83a2e';
  ctx.beginPath(); ctx.arc(-0.05, -0.115, 0.012, 0, TAU); ctx.fill();
  ctx.fillStyle = '#1b1b1b';
  ctx.beginPath(); ctx.arc(0.05, -0.115, 0.012, 0, TAU); ctx.fill();
}

/* --------------------------------- being electrocuted --------------------------------- */

/**
 * Everybody live this step: the current through them. Every muscle locked,
 * shaking (taser.js zap), burned where it goes in, the heart giving out.
 * (Once a step, whichever device gets there first.)
 */
function shockPeople(sb, dt) {
  const net = network(sb);
  if (net.shocked === sb.time) return;
  net.shocked = sb.time;
  for (const p of sb.people) {
    if (p.removed || !net.volts(p)) { if (p.volts) p.volts = 0; continue; }
    p.volts = VOLTS;
    p.voltsT = sb.time;
    const at = net.contact.get(p) || p.wj.chest;
    if (p.dead) continue;
    zap(p, null, 0.4);
    if (p.tased) p.tased.electric = true;
    const n = p.nearestPart(at.x, at.y), h = p.health;
    h.hit(n ? n.part : 'torso', dt * 6, { burn: true, cutBy: 'Electric', cause: 'electrocution' });
    h.organHurt('heart', dt * 0.11);
    if (h.organs.heart <= 0) h.arrestCause = 'electrocution';
    if (h.dead && p.alive) p.die('electrocution', null);
    if (Math.random() < dt * 25) sb.fx.sparks(at.x, at.y, 2);
    if (!p.zapT || sb.time - p.zapT > 0.22) { p.zapT = sb.time; sb.emit('electrocute', { who: p, x: at.x, y: at.y }); }
  }
}

/* ---------------------------------- the light ---------------------------------- */

/**
 * The light of everything lit, and the current through whoever is live -
 * drawn over the world, after everybody in it (an effect in sb.effects, put
 * there by the first device that needs it).
 */
class Lights {
  constructor(sb) { this.sb = sb; this.mod = null; }
  update() { return this.sb.items.some((it) => it instanceof Device); }
  draw(ctx) {
    const sb = this.sb;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const it of sb.items) {
      if (!(it instanceof Glass) || it.lit < 0.02) continue;
      const q = it.glow(), k = it.lit;
      if (it.kind === 'floodlight') {
        // a cone of hard white light, the way it points
        const d = it.beamDir(), L = 10, half = 0.22;
        const a0 = Math.atan2(d.y, d.x);
        const g = ctx.createRadialGradient(q.x, q.y, 0.05, q.x, q.y, L);
        g.addColorStop(0, `rgba(255, 255, 235, ${0.42 * k})`);
        g.addColorStop(0.35, `rgba(255, 252, 220, ${0.16 * k})`);
        g.addColorStop(1, 'rgba(255, 250, 210, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.arc(q.x, q.y, L, a0 - half, a0 + half);
        ctx.closePath();
        ctx.fill();
        halo(ctx, q, 0.7, `rgba(255, 255, 240, ${0.7 * k})`);
      } else {
        halo(ctx, q, 2.4, `rgba(255, 214, 140, ${0.32 * k})`);
        halo(ctx, q, 0.35, `rgba(255, 245, 210, ${0.8 * k})`);
      }
    }
    // the current through whoever is live: arcs of it over them
    ctx.lineCap = 'round';
    for (const p of sb.people) {
      if (!p.volts || p.removed || p.dead) continue;
      const j = p.wj, ks = ['head', 'chest', 'hip', 'handA', 'handB', 'footA', 'footB', 'kneeA', 'kneeB'];
      for (let n = 0; n < 3; n++) {
        const a = j[ks[Math.floor(arcRand() * ks.length)]], b = j[ks[Math.floor(arcRand() * ks.length)]];
        if (a === b) continue;
        ctx.strokeStyle = 'rgba(150, 205, 255, 0.85)';
        ctx.lineWidth = 0.014;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        for (let i = 1; i < 6; i++) {
          const t = i / 6;
          ctx.lineTo(a.x + (b.x - a.x) * t + arc(-0.06, 0.06), a.y + (b.y - a.y) * t + arc(-0.06, 0.06));
        }
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      halo(ctx, j.chest, 0.6, 'rgba(140, 190, 255, 0.25)');
    }
    ctx.restore();
  }
}

function halo(ctx, q, r, col) {
  const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
  g.addColorStop(0, col);
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(q.x, q.y, r, 0, TAU);
  ctx.fill();
}

/** The light effect, in the world if it is not already. */
function lights(sb) {
  if (!sb.lights || !sb.effects.includes(sb.lights)) {
    sb.lights = sb.lights || new Lights(sb);
    if (!sb.effects.includes(sb.lights)) sb.effects.push(sb.lights);
  }
}

/* ---------------------------------- spawning ---------------------------------- */

/** For the spawn menu (gear.js): how to make each, and its picture (w by h metres). */
export const POWER_KINDS = {
  generator: { make: (sb, x, y) => new Generator(sb, x, Math.max(y, 0.31)), draw: (ctx) => drawGeneratorShape(ctx), w: 0.92, h: 0.64 },
  lightbulb: { make: (sb, x, y) => new Lightbulb(sb, x, Math.max(y, 0.09)), draw: (ctx) => drawBulbShape(ctx), w: 0.13, h: 0.2 },
  floodlight: { make: (sb, x, y) => new Floodlight(sb, x, Math.max(y, 0.21), x > 0 ? -1 : 1), draw: (ctx) => drawFloodShape(ctx), w: 0.5, h: 0.44 },
  voltmeter: { make: (sb, x, y) => new VoltMeter(sb, x, Math.max(y, 0.14)), draw: (ctx) => drawMeterShape(ctx, 230), w: 0.22, h: 0.3 },
};
export const isDevice = (t) => t instanceof Device;
