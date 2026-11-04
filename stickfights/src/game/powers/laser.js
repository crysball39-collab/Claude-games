/* =============================================================================
   LASER VISION - a beam of heat out of the eyes. Their eyes glow a little all
   the time, and blaze when they use it. Whatever the beam touches it burns:
   skin scorches and clothes catch, a crate blackens and smokes, a wall is cut
   through, a tree comes down, glass shatters, and a grenade or a block of C4
   goes off. Anything thrown at them, they can burn out of the air; a gun
   pointed at them, they can melt in the hand that holds it.

   (The eyes: man.face.glow, drawn by draw.js. Where the beam comes out of is
   the front eye, worked out from the head the way draw.js draws it.)

   The moves:
     Laser Beam    a steady beam on them: burned, and often set alight
     Sweep         low across everybody in front: legs burned out from under
     Rapid Fire    a burst of short bolts, one after another
     Overcharge    eyes blazing brighter and brighter, then one huge beam
                   that goes through everything in a line, and a blast where
                   it ends
     Melt Gun      the gun in their hand glows red, and drips: dropped, and
                   gone
     Cut           a wall, a beam or a tree in the way, cut clean through
     Sever         a thin, precise beam: an arm (or a leg) off
     Detonate      a grenade, C4 or TNT near whoever they are after: set off
                   from across the room
     Thaw          a gentle warmth on a friend frozen solid, or freezing
     Flash         a blinding flash: everybody looking at them, blind for a
                   few seconds
   ========================================================================== */
import { alive, awake, now, setPhase, besideX, say, clamp, sign, rand, chance } from './common.js';
import { Ring, Slag, Scorch, EyeFlash } from './fx.js';
import { armOf, isFirearm, defineArm } from '../props.js';
import { ignite, thaw, warm } from '../vitals.js';
import { explode } from '../explode.js';
import { DIM } from '../skeleton.js';

// the beam, as far as wounds, causes of death, memories and witnesses go
defineArm('eyeBeam', {
  name: 'A beam from the eyes', noun: 'beam', cause: "a beam of heat from somebody's eyes", burn: true, scary: 0.7,
  memory: 'shotMe', hurt: 'burned', seen: 'sawLaser', verb: 'burned me with their eyes', power: 3, shove: 0.3, nasty: 2.6,
});
defineArm('eyeBlast', {
  name: 'A blast of heat', noun: 'blast', cause: "a blast of heat from somebody's eyes", burn: true, scary: 0.8,
  memory: 'shotMe', hurt: 'burned', seen: 'sawOvercharge', verb: 'blasted me with their eyes', power: 3.5, shove: 1.6, nasty: 3,
});

const act = (man, clip, o = {}) => man.anim.act(clip, { fadeIn: 0.05, fadeOut: 0.15, ...o });
const RANGE = 22;

/** Where the beam comes out: the front eye, in the world (draw.js turns the head the same way). */
export function eyeOf(man) {
  const w = man.wj, r = DIM.headR * man.scale, ha = w.headAngle || 0, f = man.rag ? man.rag.facing : man.facing;
  const lx = r * 0.6, ly = r * 0.12;
  return { x: w.head.x + f * (lx * Math.cos(ha) + ly * Math.sin(ha)), y: w.head.y + (-lx * Math.sin(ha) + ly * Math.cos(ha)) };
}

function rayBox(b, px, py, dx, dy, max) {
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  const rx = px - b.pos.x, ry = py - b.pos.y;
  const ox = rx * c + ry * s, oy = -rx * s + ry * c;
  const vx = dx * c + dy * s, vy = -dx * s + dy * c;
  let t0 = -Infinity, t1 = Infinity;
  for (const [o, v, h] of [[ox, vx, b.w / 2], [oy, vy, b.h / 2]]) {
    if (Math.abs(v) < 1e-9) { if (o < -h || o > h) return null; continue; }
    let a = (-h - o) / v, z = (h - o) / v;
    if (a > z) [a, z] = [z, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, z);
    if (t0 > t1) return null;
  }
  if (t1 < 1e-4 || t0 > max) return null;
  return { t: Math.max(t0, 0), out: t1 - Math.max(t0, 0) };
}

/**
 * Along a beam from (x, y), going (dx, dy): what it meets, out to max. With
 * `pierce`, the people (and the crates, the trees) it goes through on the way
 * as well - it stops only at the floor, the edge of the world or, unless
 * `walls` too, a wall. Returns { t, x, y, what, ..., through: [...] }.
 */
export function beamRay(sb, x, y, dx, dy, max, skip = null, { pierce = false, walls = false } = {}) {
  const hits = [];
  let end = { t: max, what: null };
  const solid = (t, o) => { if (t > 1e-4 && t < end.t) end = { t, ...o }; };
  if (dy < -1e-6) solid(-y / dy, { what: 'floor' });
  const tw = dx > 0 ? (sb.right - x) / dx : dx < 0 ? (sb.left - x) / dx : Infinity;
  solid(tw, { what: 'edge' });
  for (const w of sb.slabs) {
    if (w.removed || w.background) continue;
    const bh = rayBox(w.body, x, y, dx, dy, end.t);
    if (!bh) continue;
    const p = w.firstSolid(x + dx * bh.t, y + dy * bh.t, dx, dy, bh.out);
    if (!p) continue;
    const t = Math.hypot(p.x - x, p.y - y);
    if (walls) hits.push({ t, what: 'slab', slab: w, out: bh.out });
    else solid(t, { what: 'slab', slab: w });
  }
  const add = (t, o) => { if (t > 1e-4 && t < end.t) { if (pierce) hits.push({ t, ...o }); else solid(t, o); } };
  for (const c of sb.crates) { if (c.removed) continue; const h = rayBox(c.body, x, y, dx, dy, end.t); if (h) add(h.t, { what: 'crate', crate: c }); }
  for (const list of [sb.plants, sb.logs]) for (const w of list) { if (w.removed) continue; const h = w.rayHit(x, y, dx, dy, end.t); if (h) add(h.t, { what: 'wood', wood: w }); }
  for (const q of sb.people) { if (q === skip || q.removed) continue; const h = q.rayHit(x, y, dx, dy, end.t); if (h) add(h.t, { what: 'person', who: q, hit: h }); }
  for (const t of sb.items) {
    if (t.removed || !t.body || !((t.shatter && !t.broken) || t.chain)) continue;
    const h = rayBox(t.body, x, y, dx, dy, end.t);
    if (h) add(h.t, { what: 'item', item: t });
  }
  end.x = x + dx * end.t; end.y = y + dy * end.t;
  end.through = hits.filter((h) => h.t < end.t).sort((a, b) => a.t - b.t);
  for (const h of end.through) { h.x = x + dx * h.t; h.y = y + dy * h.t; }
  return end;
}

/**
 * What a beam does to whatever it is on, once a tick: `power` of heat. A
 * person is burned (and may catch), wood and crates scorch, a wall chips (or
 * is cut, with `cut`), glass breaks and an explosive goes off.
 */
function burnAt(man, h, dx, dy, power, { igniteP = 0.05, cut = 0, cutR = 0.06, weapon = 'eyeBeam', shove = 0 } = {}) {
  const sb = man.sandbox;
  if (!h || !h.what) return;
  switch (h.what) {
    case 'person': {
      const q = h.who, hit = h.hit;
      if (q.removed) return;
      q.takeHit({ by: man, part: hit.part, x: hit.x, y: hit.y, dir: sign(dx) || 1, power, kind: 'laser', weapon, bone: q.boneName(hit.bone, hit.tb) });
      if (!q.removed && q.alive && chance(igniteP * (q.toughSkin ? 0.3 : 1))) ignite(q, { part: hit.part, power: 0.4, by: man });
      if (!q.removed && shove) {
        if (q.rag) q.rag.shove(hit.x, hit.y, dx * shove, dy * shove + shove * 0.3, 0.5);
        else if (q.alive && q.state !== 'held') q.launch(dx * shove, Math.max(1, dy * shove + 2));
      }
      sb.fx.sparks(hit.x, hit.y, 2);
      break;
    }
    case 'crate':
      h.crate.stain(h.x, h.y, 0.03 + power * 0.01, ['rgba(30, 22, 16, 0.85)', 'rgba(20, 14, 10, 0.9)']);
      if (power > 1.2) h.crate.hole(h.x, h.y);
      h.crate.body.applyImpulse(dx * (1.5 + shove * 6), dy * (1.5 + shove * 6) + shove * 3, h.x, h.y);
      sb.fx.dust(h.x, h.y, 1, 0.3);
      break;
    case 'slab': {
      const w = h.slab;
      if (cut) w.carve(h.x - dx * 0.02, h.y - dy * 0.02, h.x + dx * cut, h.y + dy * cut, cutR, { dx, dy, speed: 0.6 });
      else w.damage(h.x, h.y, 0.08, power * 0.5, 'bullet', { dx: -dx, dy: -dy });
      if (w.mat && w.mat.name === 'metal') sb.fx.sparks(h.x, h.y, 3);
      else sb.fx.dust(h.x, h.y, 1, 0.3);
      break;
    }
    case 'wood':
      h.wood.damage(h.x, h.y, cut ? 0.14 : 0.07, cut ? 14 : power * 2, 'blade', { dx, dy });
      sb.fx.dust(h.x, h.y, 1, 0.3);
      break;
    case 'item': {
      const t = h.item;
      if (t.shatter && !t.broken) t.shatter(sb);
      else if (t.chain) { t.chain(); t.by = t.by || man; }
      break;
    }
    case 'floor':
      sb.fx.sparks(h.x, 0.01, 2);
      Scorch.of(sb).mark(h.x, 0.18 + power * 0.04);
      break;
    default:
      sb.fx.sparks(h.x, h.y, 1);
  }
}

/**
 * A beam out of their eyes, for `life` seconds: where it is pointed comes
 * from `aim(age)` (an angle), and every `tick` it does `hit` to whatever it is
 * on. Drawn from the eye to wherever it stops.
 */
class EyeBeam {
  constructor(man, { life = 1, aim, tick = 0.06, hit, width = 1, pierce = false, walls = false, color = 'red', range = RANGE }) {
    this.man = man; this.sb = man.sandbox;
    this.life = life; this.aim = aim; this.tick = tick; this.hitFn = hit;
    this.width = width; this.pierce = pierce; this.walls = walls; this.color = color; this.range = range;
    this.age = 0; this.tickT = 0; this.start = null; this.end = null; this.done = false;
  }
  stop() { this.done = true; }
  update(dt) {
    const m = this.man;
    this.age += dt;
    if (this.done || this.age > this.life || m.removed || m.dead || !m.conscious || m.rag) return false;
    const st = m.powers && m.powers.get('laser');
    if (!st) return false;
    st.glow = Math.max(st.glow, 1.2);
    const e = eyeOf(m), a = this.aim(this.age);
    const dx = Math.cos(a), dy = Math.sin(a);
    const h = beamRay(this.sb, e.x, e.y, dx, dy, this.range, m, { pierce: this.pierce, walls: this.walls });
    this.start = e; this.end = h; this.dx = dx; this.dy = dy;
    if ((this.tickT -= dt) <= 0) {
      this.tickT = this.tick;
      for (const t of h.through || []) this.hitFn(t, dx, dy, true);
      this.hitFn(h, dx, dy, false);
    }
    return true;
  }
  draw(ctx) {
    if (!this.start || !this.end) return;
    const k = clamp(Math.min(this.age / 0.05, (this.life - this.age) / 0.1), 0, 1);
    const fl = 0.85 + Math.sin(this.age * 95) * 0.15, w = this.width;
    const [r, g, b] = this.color === 'warm' ? [255, 170, 70] : [255, 40, 30];
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.28 * k * fl})`;
    ctx.lineWidth = 0.13 * w;
    ctx.beginPath(); ctx.moveTo(this.start.x, this.start.y); ctx.lineTo(this.end.x, this.end.y); ctx.stroke();
    ctx.strokeStyle = `rgba(${r}, ${Math.min(255, g + 90)}, ${Math.min(255, b + 60)}, ${0.7 * k})`;
    ctx.lineWidth = 0.05 * w;
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 245, 225, ${0.95 * k})`;
    ctx.lineWidth = 0.016 * w;
    ctx.stroke();
    // where it lands: a white-hot spot
    ctx.fillStyle = `rgba(255, 230, 200, ${0.85 * k * fl})`;
    ctx.beginPath(); ctx.arc(this.end.x, this.end.y, (0.05 + 0.03 * w) * fl, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

/** Fires a beam: kept on the move's data, so its end stops it. */
function fire(man, m, o) {
  const b = new EyeBeam(man, o);
  man.sandbox.effects.push(b);
  (m.data.beams || (m.data.beams = [])).push(b);
  return b;
}
const stopBeams = (m) => { for (const b of m.data.beams || []) b.stop(); };

/** The angle from their eye to a point. */
function angleTo(man, x, y) { const e = eyeOf(man); return Math.atan2(y - e.y, x - e.x); }
/** A point on somebody worth aiming at: the chest standing, the hips lying down. */
const aimPoint = (o) => (o.lying ? { x: o.wj.hip.x, y: o.wj.hip.y + 0.05 } : o.wj.chest);
/** Turning toward an angle by at most `rate` a second (a beam that follows, a little behind). */
function turnToward(a, want, rate, dt) {
  let d = want - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + clamp(d, -rate * dt, rate * dt);
}
/** Can they see a point (nothing solid in the way, and not behind them)? */
const inSight = (man, x, y) => !man.brain || man.brain.canSee(x, y);

/** People standing in front of them within r. */
function inFront(me, r) {
  const out = [];
  for (const p of me.sandbox.people) {
    if (p === me || !awake(p) || p.lying) continue;
    const d = (p.pos.x - me.pos.x) * me.facing;
    if (d > 0.5 && d < r && Math.abs(p.pos.y - me.pos.y) < 1.5) out.push(p);
  }
  return out;
}
/** A wall, a metal beam or a tree between them and `o` (or, with no `o`, in front within 10 m). */
function obstacle(me, o) {
  const sb = me.sandbox, dir = o ? sign(o.pos.x - me.pos.x) || me.facing : me.facing;
  const far = o ? Math.abs(o.pos.x - me.pos.x) : 10;
  let best = null, bd = far;
  for (const w of sb.slabs) {
    if (w.removed || w.background) continue;
    const bb = w.body.aabb(), cx = (bb.minX + bb.maxX) / 2, d = (cx - me.pos.x) * dir;
    if (d > 0.3 && d < bd && bb.minY < me.pos.y + 1.5 && bb.maxY > me.pos.y + 0.6) { bd = d; best = { what: 'slab', slab: w, x: cx, top: bb.maxY, bottom: bb.minY }; }
  }
  for (const t of sb.plants) {
    if (t.removed) continue;
    const d = (t.pos.x - me.pos.x) * dir;
    if (d > 0.3 && d < bd) { bd = d; best = { what: 'wood', wood: t, x: t.pos.x, top: 2, bottom: 0 }; }
  }
  return best;
}
/** An explosive near somebody they are after (and well away from them): { item, n } or null. */
function bombNear(me, r = 14) {
  const sb = me.sandbox;
  let best = null;
  for (const t of sb.items) {
    if (t.removed || !t.chain || !t.body || !t.loose || t.kind === 'missile') continue;
    const d = Math.hypot(t.pos.x - me.pos.x, t.pos.y - me.pos.y);
    if (d > r || d < 4.5) continue;
    let foes = 0, friends = 0;
    for (const p of sb.people) {
      if (p === me || !alive(p) || Math.hypot(p.pos.x - t.pos.x, p.pos.y - t.pos.y) > 3.2) continue;
      const like = me.brain ? me.brain.rel(p).like : 0;
      if (like > 0.3) friends++;
      else if (!me.brain || me.brain.isHostile(p) || me.brain.rel(p).anger > 0.4) foes++;
    }
    if (foes && !friends && (!best || foes > best.n)) best = { item: t, n: foes };
  }
  return best;
}

const MOVES = {
  beam: {
    label: 'Laser Beam', say: 'pwLaserBeam', cool: 6, max: 3, clips: ['laserStare'],
    want: (me, o, c) => (c.d > 1 && c.d < 15 && inSight(me, o.wj.chest.x, o.wj.chest.y) ? 1.3 : 0),
    step(man, m, dt) {
      const o = m.o;
      if (!alive(o) && m.phase !== 'fire') return false;
      switch (m.phase) {
        case 'start':
          man.stop(); man.faceTo(o.pos.x);
          act(man, 'laserStare', { fadeOut: 0.2 });
          setPhase(m, 'charge');
          return true;
        case 'charge':
          man.lookAt = o.wj.head;
          if (m.pt < 0.22) return true;
          m.data.a = angleTo(man, aimPoint(o).x, aimPoint(o).y);
          fire(man, m, {
            life: 1.3, tick: 0.1,
            aim: () => m.data.a,
            hit: (h, dx, dy) => burnAt(man, h, dx, dy, 0.7, { igniteP: 0.1 }),
          });
          man.sandbox.emit('laserFire', { who: man, target: o, x: man.wj.head.x, y: man.wj.head.y, dur: 1.3, loud: true });
          setPhase(m, 'fire');
          return true;
        case 'fire':
          // the beam follows them, a little behind
          if (alive(o)) { const p = aimPoint(o); m.data.a = turnToward(m.data.a, angleTo(man, p.x, p.y), 1.6, dt); man.lookAt = o.wj.head; }
          return m.pt < 1.35;
      }
      return false;
    },
    end(man, m) { stopBeams(m); },
  },

  sweep: {
    label: 'Sweep', say: 'pwSweep', cool: 9, max: 2.8, clips: ['laserSweep'],
    want: (me) => { const n = inFront(me, 10).length; return n >= 2 ? 0.8 + n * 0.3 : 0; },
    step(man, m, dt) {
      switch (m.phase) {
        case 'start':
          man.stop();
          if (m.o && alive(m.o)) man.faceTo(m.o.pos.x);
          act(man, 'laserSweep', { fadeOut: 0.2 });
          setPhase(m, 'charge');
          return true;
        case 'charge': {
          if (m.pt < 0.18) return true;
          const f = man.facing;
          // low across the floor in front, out and away: through every pair of legs in the way
          const a0 = f > 0 ? -0.62 : Math.PI + 0.62, a1 = f > 0 ? -0.07 : Math.PI + 0.07;
          const hitT = new Map();
          fire(man, m, {
            life: 1.3, pierce: true,
            aim: (t) => a0 + (a1 - a0) * clamp(t / 1.3, 0, 1),
            hit: (h, dx, dy) => {
              burnAt(man, h, dx, dy, 0.85, { igniteP: 0.06 });
              if (h.what === 'person') {
                const q = h.who, n = (hitT.get(q) || 0) + 1;
                hitT.set(q, n);
                // (legs burned out from under them)
                if (n === 2 && q.alive && !q.lying && q.state !== 'held') q.knockDown(sign(q.pos.x - man.pos.x) || f, 0.8);
              }
            },
          });
          man.sandbox.emit('laserFire', { who: man, target: m.o, x: man.wj.head.x, y: man.wj.head.y, dur: 1.3, loud: true });
          setPhase(m, 'fire');
          return true;
        }
        case 'fire': return m.pt < 1.35;
      }
      return false;
    },
    end(man, m) { stopBeams(m); },
  },

  rapidFire: {
    label: 'Rapid Fire', say: 'pwRapidFire', cool: 7, max: 2.5, clips: ['laserBlink'],
    want: (me, o, c) => (c.d > 1 && c.d < 12 && inSight(me, o.wj.chest.x, o.wj.chest.y) ? 1 : 0),
    step(man, m) {
      const o = m.o;
      switch (m.phase) {
        case 'start':
          if (!alive(o)) return false;
          man.stop(); man.faceTo(o.pos.x);
          act(man, 'laserBlink', { fadeOut: 0.2 });
          m.data.n = 0;
          setPhase(m, 'bolts');
          return true;
        case 'bolts': {
          if (m.data.n >= 6) return m.pt < 0.3;
          if (m.pt < 0.14) return true;
          m.pt = 0;
          m.data.n++;
          // at them, or at whoever else is in front if they are down
          const t = alive(o) && !o.lying ? o : inFront(man, 12)[0] || o;
          if (!t || !alive(t)) return true;
          const p = aimPoint(t), a = angleTo(man, p.x, p.y) + rand(-0.04, 0.04);
          man.lookAt = t.wj.head;
          fire(man, m, { life: 0.07, tick: 1, aim: () => a, hit: (h, dx, dy) => {
            burnAt(man, h, dx, dy, 0.9, { igniteP: 0.05, shove: 0.6 });
            if (h.what === 'person' && h.who.alive && h.who.state === 'stand' && chance(0.3)) h.who.staggerFrom(sign(dx) || 1, 1.2);
          } });
          man.sandbox.emit('laserBolt', { who: man, target: t, x: man.wj.head.x, y: man.wj.head.y, loud: true });
          return true;
        }
      }
      return false;
    },
    end(man, m) { stopBeams(m); },
  },

  overcharge: {
    label: 'Overcharge', say: 'pwOvercharge', cool: 16, max: 4, clips: ['laserCharge', 'laserRelease'],
    want: (me, o, c) => (c.d > 3 && c.d < 16 && (inFront(me, 14).length >= 2 || me.health.overall < 0.6 || c.r.anger > 0.7) ? 0.6 : 0),
    step(man, m, dt, st) {
      const o = m.o, sb = man.sandbox;
      switch (m.phase) {
        case 'start':
          man.stop();
          if (alive(o)) man.faceTo(o.pos.x);
          act(man, 'laserCharge', { fadeOut: 0.05 });
          sb.emit('laserCharge', { who: man, x: man.wj.head.x, y: man.wj.head.y, loud: true });
          setPhase(m, 'charge');
          return true;
        case 'charge':
          // brighter and brighter, sparks round the eyes
          st.glow = 1 + m.pt * 1.5;
          if (alive(o)) man.lookAt = o.wj.head;
          if (chance(dt * 30)) { const e = eyeOf(man); sb.fx.sparks(e.x, e.y, 1); }
          if (m.pt < 1.2) return true;
          {
            const p = alive(o) ? aimPoint(o) : { x: man.pos.x + man.facing * 8, y: man.pos.y + 1 };
            m.data.a = angleTo(man, p.x, p.y);
          }
          act(man, 'laserRelease', { fadeIn: 0.03, fadeOut: 0.3 });
          m.data.hit = new Map();
          fire(man, m, {
            life: 0.75, width: 3.2, pierce: true, walls: true, range: 26, tick: 0.08,
            aim: () => m.data.a,
            hit: (h, dx, dy, through) => {
              if (h.what === 'person') {
                const q = h.who, n = (m.data.hit.get(q) || 0) + 1;
                m.data.hit.set(q, n);
                burnAt(man, h, dx, dy, 1.4, { igniteP: 0.35, weapon: 'eyeBlast', shove: n === 1 ? 9 : 0 });
              } else if (h.what === 'slab') burnAt(man, h, dx, dy, 2, { cut: Math.min(h.out ?? 0.4, 1.2) + 0.1, cutR: 0.16 });
              else if (h.what === 'wood') burnAt(man, h, dx, dy, 3, { cut: 1 });
              else burnAt(man, h, dx, dy, 2, { shove: 1.5, igniteP: 0.3 });
              // where it ends: the ground (or the wall of the world) blows up, once
              if (!through && !m.data.boom && (h.what === 'floor' || h.what === 'edge')) {
                m.data.boom = true;
                explode(sb, h.x, Math.max(0.05, h.y), 'flare', man);
              }
            },
          });
          sb.emit('overcharge', { who: man, target: o, x: man.wj.head.x, y: man.wj.head.y, loud: true });
          setPhase(m, 'fire');
          return true;
        case 'fire':
          st.glow = 2;
          return m.pt < 0.8;
      }
      return false;
    },
    end(man, m) { stopBeams(m); },
  },

  meltGun: {
    label: 'Melt Gun', say: 'pwMeltGun', cool: 8, max: 3, clips: ['laserStare'],
    want: (me, o, c) => (o.weapon && isFirearm(o.armedWith) && c.d < 15 ? 2.2 : 0),
    step(man, m, dt) {
      const o = m.o, sb = man.sandbox;
      if (!alive(o)) return false;
      const g = o.weapon;
      if (!g || !isFirearm(o.armedWith)) return m.phase === 'start' ? false : m.pt < 0.2;
      switch (m.phase) {
        case 'start':
          man.stop(); man.faceTo(o.pos.x);
          act(man, 'laserStare', { fadeOut: 0.2 });
          m.data.gun = g;
          setPhase(m, 'heat');
          return true;
        case 'heat': {
          if (m.pt < 0.15) return true;
          if (!m.data.beam) {
            m.data.beam = fire(man, m, { life: 0.9, width: 0.6, aim: () => { const h = o.wj.handA; return angleTo(man, h.x, h.y + 0.04); }, hit: () => {} });
            sb.emit('laserFire', { who: man, target: o, x: man.wj.head.x, y: man.wj.head.y, dur: 0.9, loud: true });
          }
          g.heat = clamp(m.pt / 0.75, 0, 1);
          man.lookAt = o.wj.handA;
          if (m.pt < 0.75) return true;
          // too hot to hold, and then not a gun any more
          const h = o.wj.handA;
          o.takeHit({ by: man, part: 'armA', x: h.x, y: h.y, dir: sign(h.x - man.pos.x) || 1, power: 0.6, kind: 'laser', weapon: 'eyeBeam', bone: 'forearmA' });
          if (o.weapon === g) o.dropWeapon(0.3);
          sb.remove(g, { quiet: true });
          sb.effects.push(new Slag(h.x, Math.max(0, Math.min(h.y, 0.02))));
          sb.fx.sparks(h.x, h.y, 10);
          sb.emit('gunMelted', { who: man, target: o, x: h.x, y: h.y, loud: true });
          if (o.brain) o.brain.speak('pwGunMelted', { other: man.name }, 0.9, man, true);
          setPhase(m, 'after');
          return true;
        }
        case 'after': return m.pt < 0.3;
      }
      return false;
    },
    end(man, m) { stopBeams(m); if (m.data.gun && !m.data.gun.removed) m.data.gun.heat = 0; },
  },

  cut: {
    label: 'Cut', say: 'pwCut', cool: 9, max: 3.5, needs: 'none', clips: ['laserStare'],
    want: (me, o) => (obstacle(me, o) ? 1.4 : 0),
    start(man, m) {
      // in the way of whoever they are after - or, failing that, the nearest in front (or behind)
      let ob = (m.o && alive(m.o) ? obstacle(man, m.o) : null) || obstacle(man, null);
      if (!ob) { man.facing = -man.facing; ob = obstacle(man, null); if (!ob) man.facing = -man.facing; }
      if (!ob) return false;
      m.data.ob = ob;
      return true;
    },
    step(man, m) {
      const ob = m.data.ob, sb = man.sandbox;
      switch (m.phase) {
        case 'start':
          man.stop(); man.faceTo(ob.x);
          act(man, 'laserStare', { fadeOut: 0.2 });
          setPhase(m, 'charge');
          return true;
        case 'charge': {
          if (m.pt < 0.2) return true;
          // held at chest height, and burning its way through: a line clean across it, and
          // whatever is above that line comes away
          const y = clamp(man.pos.y + 1.15, ob.bottom + 0.2, ob.top - 0.2);
          m.data.a = angleTo(man, ob.x, y);
          fire(man, m, {
            life: 1.3,
            aim: () => m.data.a,
            hit: (h, dx, dy) => {
              if (h.what === 'slab') burnAt(man, h, dx, dy, 2, { cut: 0.16, cutR: 0.08 });
              else if (h.what === 'wood') burnAt(man, h, dx, dy, 3, { cut: 1 });
              else burnAt(man, h, dx, dy, 0.6);
            },
          });
          sb.emit('laserCut', { who: man, what: ob.slab || ob.wood, x: ob.x, y, loud: true });
          setPhase(m, 'fire');
          return true;
        }
        case 'fire': return m.pt < 1.35;
      }
      return false;
    },
    end(man, m) { stopBeams(m); },
  },

  sever: {
    label: 'Sever', say: 'pwSever', cool: 12, max: 2.5, clips: ['laserStare'],
    want: (me, o, c) => (c.d < 12 && !o.toughSkin && me.brain && c.r.anger > 0.6 && me.brain.traits.aggression > 0.55 ? (o.weapon ? 0.7 : 0.35) : 0),
    step(man, m) {
      const o = m.o, sb = man.sandbox;
      if (!alive(o)) return false;
      switch (m.phase) {
        case 'start': {
          man.stop(); man.faceTo(o.pos.x);
          act(man, 'laserStare', { fadeOut: 0.2 });
          // the arm with something in it, else whichever arm or leg is there
          const opts = (o.weapon ? ['humerusA'] : []).concat(['humerusA', 'humerusB', 'femurA', 'femurB']).filter((b) => !o.health.severed[b] && !o.cut[b.startsWith('humerus') ? 'arm' + b.slice(-1) : 'leg' + b.slice(-1)]);
          if (!opts.length) return false;
          m.data.bone = opts[0];
          setPhase(m, 'aim');
          return true;
        }
        case 'aim': {
          if (m.pt < 0.18) return true;
          const joint = m.data.bone.startsWith('humerus') ? 'elbow' + m.data.bone.slice(-1) : 'knee' + m.data.bone.slice(-1);
          if (!m.data.beam) {
            m.data.beam = fire(man, m, { life: 0.6, width: 0.5, aim: () => { const j = o.wj[joint]; return angleTo(man, j.x, j.y); }, hit: (h, dx, dy) => { if (h.what === 'person' && h.who === o) sb.fx.sparks(h.x, h.y, 2); } });
            sb.emit('laserFire', { who: man, target: o, x: man.wj.head.x, y: man.wj.head.y, dur: 0.6, loud: true });
          }
          man.lookAt = o.wj[joint];
          if (m.pt < 0.6) return true;
          const j = o.wj[joint];
          o.takeHit({ by: man, part: m.data.bone.startsWith('humerus') ? 'arm' + m.data.bone.slice(-1) : 'leg' + m.data.bone.slice(-1), x: j.x, y: j.y, dir: sign(j.x - man.pos.x) || 1, power: 1.2, kind: 'laser', weapon: 'eyeBeam', bone: m.data.bone });
          if (!o.removed && o.sever(m.data.bone, sign(j.x - man.pos.x) || 1, 1)) {
            // (the heat sears what it cuts: the stump bleeds far less than it would)
            const limb = m.data.bone.startsWith('humerus') ? 'arm' + m.data.bone.slice(-1) : 'leg' + m.data.bone.slice(-1);
            if (o.health.stumps && o.health.stumps[limb]) o.health.stumps[limb] *= 0.3;
            sb.emit('laserSever', { who: man, target: o, x: j.x, y: j.y, loud: true });
          }
          setPhase(m, 'after');
          return true;
        }
        case 'after': return m.pt < 0.3;
      }
      return false;
    },
    end(man, m) { stopBeams(m); },
  },

  detonate: {
    label: 'Detonate', say: 'pwDetonate', cool: 10, max: 1.5, needs: 'none', clips: ['laserBlink'],
    want: (me) => (bombNear(me) ? 1.8 : 0),
    start(man, m) {
      const b = bombNear(man) || nearestBomb(man);
      if (!b) return false;
      m.data.item = b.item || b;
      return true;
    },
    step(man, m) {
      const t = m.data.item, sb = man.sandbox;
      if (!t || t.removed) return m.phase === 'after' && m.pt < 0.3;
      switch (m.phase) {
        case 'start':
          man.stop(); man.faceTo(t.pos.x);
          act(man, 'laserBlink', { fadeOut: 0.2 });
          setPhase(m, 'zap');
          return true;
        case 'zap':
          if (m.pt < 0.15) return true;
          fire(man, m, { life: 0.25, tick: 0.1, aim: () => angleTo(man, t.pos.x, t.pos.y), hit: (h, dx, dy) => burnAt(man, h, dx, dy, 1) });
          t.chain();
          t.by = man;
          sb.emit('laserDetonate', { who: man, what: t, x: t.pos.x, y: t.pos.y, loud: true });
          setPhase(m, 'after');
          return true;
        case 'after': return m.pt < 0.3;
      }
      return false;
    },
    end(man, m) { stopBeams(m); },
  },

  thaw: {
    label: 'Thaw', say: 'pwThaw', cool: 8, max: 5, needs: 'friend', clips: ['laserStare'],
    want: (me, o) => (o && !o.removed && (o.health.frozen || (alive(o) && (o.health.temp ?? 37) < 35.5)) ? 1 : 0),
    step(man, m) {
      const o = m.o, sb = man.sandbox;
      if (!o || o.removed) return false;
      switch (m.phase) {
        case 'start': setPhase(m, 'go'); return true;
        case 'go': {
          const d = Math.abs(o.pos.x - man.pos.x);
          if (d > 5) { man.goTo(besideX(man, o, 3.5), 'run'); return m.pt < 5; }
          man.stop(); man.faceTo(o.pos.x);
          act(man, 'laserStare', { fadeOut: 0.2 });
          fire(man, m, { life: 2.2, width: 1.8, color: 'warm', tick: 0.1, aim: () => { const c = o.wj.chest; return angleTo(man, c.x, c.y); }, hit: () => {} });
          sb.emit('laserThaw', { who: man, target: o, x: o.wj.chest.x, y: o.wj.chest.y, loud: false });
          setPhase(m, 'warm');
          return true;
        }
        case 'warm':
          // gentle: warmth, not a burn
          warm(o, 3.5);
          if (o.health.frozen && m.pt > 1.3) thaw(o);
          if (o.flames) return false;
          return m.pt < 2.2 && (o.health.frozen || (o.health.temp ?? 37) < 36.2);
      }
      return false;
    },
    end(man, m) { stopBeams(m); },
  },

  flash: {
    label: 'Flash', say: 'pwFlash', cool: 12, max: 1.5, needs: 'none', clips: ['eyeFlash'],
    want: (me) => { const n = inFront(me, 8).length; return n >= 1 && (n >= 2 || me.health.overall < 0.55) ? 0.7 : 0; },
    start(man) { return man.state === 'stand' || man.state === 'air'; },
    step(man, m) {
      const sb = man.sandbox;
      switch (m.phase) {
        case 'start':
          man.stop();
          if (m.o && alive(m.o)) man.faceTo(m.o.pos.x);
          act(man, 'eyeFlash', { fadeIn: 0.03, fadeOut: 0.2 });
          setPhase(m, 'flash');
          return true;
        case 'flash': {
          if (m.pt < 0.12 || m.data.done) return m.pt < 0.7;
          m.data.done = true;
          const e = eyeOf(man);
          sb.effects.push(new EyeFlash(e.x, e.y, man.facing));
          const st = man.powers.get('laser');
          if (st) st.glow = 2.5;
          // everybody in front, looking this way: white, then nothing for a few seconds
          for (const p of sb.people) {
            if (p === man || !awake(p) || !p.brain) continue;
            const d = (p.pos.x - man.pos.x) * man.facing;
            if (d < 0.3 || d > 9 || Math.abs(p.pos.y - man.pos.y) > 3) continue;
            const looking = (sign(man.pos.x - p.pos.x) || 1) === p.facing || p.lying;
            if (!looking) continue;
            p.brain.blindT = now(man) + 2.6 - d * 0.12;
            p.brain.clearBehaviour();
            p.health.dizzy = Math.max(p.health.dizzy || 0, 0.8);
            if (p.ready) p.perform('shieldEyes', { fadeIn: 0.03 });
            if (p.state === 'stand' && chance(0.35)) p.staggerFrom(sign(p.pos.x - man.pos.x) || 1, 1);
            p.brain.speak('pwDazzled', { other: man.name }, 0.8, man, true);
          }
          sb.emit('eyeFlash', { who: man, x: e.x, y: e.y, loud: true });
          return true;
        }
      }
      return false;
    },
  },
};

/** The nearest explosive at all (for the inspector: Detonate with nobody near one). */
function nearestBomb(me) {
  let best = null, bd = 16;
  for (const t of me.sandbox.items) {
    if (t.removed || !t.chain || !t.body || !t.loose) continue;
    const d = Math.hypot(t.pos.x - me.pos.x, t.pos.y - me.pos.y);
    if (d < bd && d > 2.5) { bd = d; best = t; }
  }
  return best;
}

/** Something flying at them (a crate, a knife, a gun) about to hit within half a second, or null. */
function incoming(me) {
  const cx = me.pos.x, cy = me.pos.y + 1.05 * me.scale;
  const check = (thing, b) => {
    if (!b || thing.wornBy || thing.carriedBy) return false;
    const vx = b.vel.x, vy = b.vel.y, v2 = vx * vx + vy * vy;
    if (v2 < 36) return false;
    const rx = b.pos.x - cx, ry = b.pos.y - cy, t = -(rx * vx + ry * vy) / v2;
    if (t < 0.05 || t > 0.5) return false;
    return Math.hypot(rx + vx * t, ry + vy * t) < 0.9;
  };
  for (const c of me.sandbox.crates) if (!c.removed && check(c, c.body)) return c;
  for (const k of me.sandbox.loose()) if (!k.removed && check(k, k.body)) return k;
  return null;
}

export const LASER = {
  key: 'Laser', name: 'Laser Vision', chip: 'Laser eyes',
  felt: 'My eyes are burning. Not hurting. Burning.',
  moves: MOVES,
  gain(man, st) { st.glow = 0.6; },
  lose(man) { if (man.face) man.face.glow = 0; },
  /** The glow in their eyes: a faint red all the time, blazing when they use it. */
  update(man, st, dt) {
    st.glow = Math.max(0.16, (st.glow ?? 0.16) - dt * 2.2);
    if (man.face) man.face.glow = man.dead ? 0 : Math.min(2.5, st.glow);
  },
  /** Out of the fist-fight: a gun pointed at them melted, something thrown at them burned out of the air, a frozen friend thawed. */
  reflex(me, st, brain, start) {
    if (me.pmove) return;
    const t = now(me), sb = me.sandbox;
    if (me.state !== 'stand' && me.state !== 'air') return;
    // something flying at them: a quick bolt, and it is not coming any more
    const it = incoming(me);
    if (it && t - (st.zapT ?? -9) > 0.8) {
      st.zapT = t;
      st.glow = 1.5;
      const e = eyeOf(me), b = it.body;
      me.faceTo(b.pos.x);
      const a = Math.atan2(b.pos.y - e.y, b.pos.x - e.x);
      sb.effects.push(new EyeBeam(me, { life: 0.08, tick: 1, aim: () => a, hit: () => {} }));
      if (it.kind === 'crate') {
        b.vel.x *= -0.25; b.vel.y = Math.abs(b.vel.y) * 0.3 + 2;
        it.stain(b.pos.x, b.pos.y, 0.06, ['rgba(30, 22, 16, 0.85)', 'rgba(20, 14, 10, 0.9)']);
      } else {
        sb.remove(it, { quiet: true });
        sb.effects.push(new Slag(b.pos.x, 0));
      }
      sb.fx.sparks(b.pos.x, b.pos.y, 8);
      sb.emit('laserZap', { who: me, what: it, x: b.pos.x, y: b.pos.y, loud: true });
      return;
    }
    // a gun on them
    const ab = brain.aimedBy;
    if (ab && t - (brain.aimedT ?? -9) < 0.8 && alive(ab) && ab.weapon && isFirearm(ab.armedWith) && t - (st.cool.meltGun ?? -99) > 8 &&
      Math.abs(ab.pos.x - me.pos.x) < 15 && chance(0.5) && start(me, 'laser', 'meltGun', ab)) return;
    // a friend frozen solid, or freezing
    if (t - (st.cool.thaw ?? -99) > 8) {
      for (const p of sb.people) {
        if (p === me || p.removed || Math.abs(p.pos.x - me.pos.x) > 12 || brain.rel(p).like < 0.3) continue;
        if ((p.health.frozen || (p.alive && (p.health.temp ?? 37) < 35)) && chance(0.5) && start(me, 'laser', 'thaw', p)) return;
      }
    }
  },
};
