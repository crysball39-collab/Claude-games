/* =============================================================================
   EXPLOSIONS - what the EXPLODE tool sets off, wherever it is tapped: a
   grenade, a stick of dynamite, a block of C4 or a bomb.

   Everyone within reach is hurt by how close they were - close in, burned
   as well, sometimes set alight, and with a big enough bang torn apart -
   and thrown away from it, less so from behind a wall. Crates and anything
   loose are flung, walls, buildings, trees and bushes are blown out cell by
   cell, and a grenade throws the bits of its case a good way further than
   the blast itself goes.

   Then there is the look of it: a flash, a ball of fire that rolls up into
   smoke, a ring of air going out, dirt and sparks thrown up and a scorch on
   the ground - and for a bomb, a cloud that climbs and spreads at the top.
   ========================================================================== */
import { defineArm } from './props.js';
import { BONES, HEAD_BONE } from './skeleton.js';
import { ignite } from './vitals.js';
import { clamp, rand, chance, sign, segDist, TAU } from '../core/util.js';

/**
 * The bangs there are. r how far it reaches (m), power how hard it hits,
 * frag how many bits of casing a grenade throws, fire how readily it sets
 * people alight, smoke how much there is after, dirt how much ground it
 * throws up, sever how readily it takes limbs off, life how long it hangs
 * about, size how big it sounds (0..1).
 */
export const BLASTS = {
  grenade: { name: 'Grenade', r: 2.6, power: 1.1, frag: 34, fire: 0.12, smoke: 0.8, dirt: 0.8, sever: 0.35, life: 3.2, size: 0.25, shake: 0.45 },
  dynamite: { name: 'Dynamite', r: 3.4, power: 1.7, frag: 0, fire: 0.3, smoke: 1.25, dirt: 1.5, sever: 0.6, life: 4.2, size: 0.45, shake: 0.65 },
  c4: { name: 'C4', r: 4.6, power: 2.5, frag: 0, fire: 0.45, smoke: 1.1, dirt: 1.1, sever: 1, life: 4.6, size: 0.7, shake: 0.85 },
  bomb: { name: 'Bomb', r: 7.5, power: 3.8, frag: 0, fire: 0.9, smoke: 2.2, dirt: 2.3, sever: 1.3, life: 9, size: 1, shake: 1, cloud: true },
  // (not on the tool: what a mod's beam leaves where it meets the ground)
  flare: { name: 'Blast', r: 2.4, power: 1.2, frag: 0, fire: 0.7, smoke: 0.5, dirt: 0.9, sever: 0.4, life: 2.6, size: 0.3, shake: 0.2 },
};

// what it does to whoever it catches (props.js ARMS)
defineArm('explosion', {
  name: 'Explosion', noun: 'explosion', wound: 'Blast', cause: 'an explosion', shove: 2.2, spray: 0.9, nasty: 3,
  memory: 'hurtMe', hurt: 'blastHurt', verb: 'blew me up', power: 3,
});
defineArm('shrapnel', {
  name: 'Shrapnel', noun: 'piece of shrapnel', wound: 'Shrapnel', cause: 'shrapnel', shot: true, instakill: false,
  shove: 0.35, spray: 0.7, nasty: 2.6, memory: 'hurtMe', hurt: 'shrapnelHit', verb: 'hit me with shrapnel',
});

// the long bones, from the end in: what a blast tears off first (and the part each is)
const LIMBS = [
  ['forearmA', 1, 'armA'], ['forearmB', 1, 'armB'], ['tibiaA', 0.8, 'legA'], ['tibiaB', 0.8, 'legB'],
  ['humerusA', 0.5, 'armA'], ['humerusB', 0.5, 'armB'], ['femurA', 0.35, 'legA'], ['femurB', 0.35, 'legB'],
];
const PARTS = ['head', 'torso', 'armA', 'armB', 'legA', 'legB'];
// how hard each part takes it (the body is what kills; a head is not blown off by being near one)
const PART_K = { head: 0.7, torso: 1, armA: 0.8, armB: 0.8, legA: 0.8, legB: 0.8 };
/** How hard a blast hits something k of the way in to it (0 at the edge, 1 in the middle), for a bang of `power`. */
const dose = (k, power) => 0.4 + 30 * Math.pow(Math.max(0, k), 1.5) * Math.sqrt(power);
// where bits of casing land on a body, and how often: the bones, by how much of a target each is
const FRAG_BONES = [[0, 3], [1, 3], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 2], [8, 2], [10, 2], [11, 2]];
const FRAG_TOTAL = FRAG_BONES.reduce((s, b) => s + b[1], 0);
const DIRT = ['#5b4a3a', '#3e3328', '#77654f', '#2f2a26'];
const SCORCH = ['#2b2621', '#1a1612'];

/**
 * A bang of `kind` (BLASTS) at (x, y), set off by `by` (nobody, from the
 * tool). Returns the effect it left, for whatever wants to watch it.
 */
export function explode(sb, x, y, kind = 'grenade', by = null) {
  const spec = BLASTS[kind] || BLASTS.grenade;
  const R = spec.r, power = spec.power;
  y = Math.max(0.05, y);
  const fx = sb.fx;
  const fx0 = new Blast(x, y, spec);

  /* --------------------------------- people --------------------------------- */
  for (const p of [...sb.people]) {
    if (p.removed) continue;
    const n = p.nearestPart(x, y);
    if (!n || n.d > R) continue;
    // a wall in the way takes most of it
    const shield = sb.lineOfSight(x, y, n.x, n.y) ? 1 : 0.35;
    const k = 1 - n.d / R;
    const cx = (p.wj.hip.x + p.wj.chest.x) / 2, cy = (p.wj.hip.y + p.wj.chest.y) / 2;
    const dir = sign(cx - x) || 1;
    // (a blast is all over a body: it is taken on the body, not the head)
    const part = n.part === 'head' ? 'torso' : n.part;
    const bone = part === n.part ? p.boneName(n.bone, n.t) : 'ribs';
    // something the size of a building is not thrown about or torn up by any of this - the
    // more of it there is in the blast, the more it takes, and that is all
    if (p.species && (p.species.giant || p.species.sturdy || p.species.shape)) {
      const hurt = (0.5 + 4.4 * Math.pow(k, 1.3) * power) * shield * caught(p, x, y, R);
      p.takeHit({ by, part, x: n.x, y: n.y, dir, power: hurt, kind: 'impact', weapon: 'explosion', bone });
      continue;
    }
    // every part of them takes it, by how close that part was - the nearest the blow that throws them
    const ks = reach(p, x, y, R);
    const wasDead = p.dead;
    p.takeHit({ by, part, x: n.x, y: n.y, dir, power: dose(Math.max(k, ks[part]), power) * shield, kind: 'impact', weapon: 'explosion', bone });
    if (p.removed) continue;
    for (const pt of PARTS) {
      if (pt === part || ks[pt] <= 0) continue;
      p.health.hit(pt, 9 * dose(ks[pt], power) * PART_K[pt] * shield * rand(0.85, 1.15), { cause: 'an explosion', strike: 'blast' });
    }
    if (shield === 1) {
      // close in, the heat: burned where it was nearest, and the flames may catch
      let marks = 0;
      for (const pt of PARTS) {
        if (ks[pt] < 0.5) continue;
        p.health.hit(pt, 6 * ks[pt] * power, { burn: true, cutBy: 'Blast', cause: 'an explosion' });
        if (marks++ < 3) scorchOn(p, pt);
      }
      // and the lungs and the gut: it does damage inside that only shows later
      if (k > 0.3) p.health.internal += 0.0012 * k * power;
    }
    if (p.health.dead && !wasDead && p.alive) p.die('an explosion', by, dir, power * 2);
    if (p.removed) continue;
    if (shield === 1 && k > 0.55 && chance(spec.fire * (0.3 + k))) ignite(p, { part: n.part, power: 0.35 + spec.fire * 0.4, by });
    // big enough and close enough, it tears them apart
    if (shield === 1 && spec.sever) {
      for (const [b, w, pt] of LIMBS) {
        if (p.removed) break;
        if (ks[pt] > 0.5 && chance((ks[pt] - 0.45) * spec.sever * w * 0.6)) p.sever(b, dir, power);
      }
    }
    if (p.removed) continue;
    // and thrown, away from it
    if (k > 0.12 && p.state !== 'held') {
      const ux = cx - x, uy = cy - y, d = Math.hypot(ux, uy) || 1;
      const sp = Math.min(18, (1.5 + 9 * k * k) * Math.pow(power, 0.6)) * shield;
      const vx = (ux / d) * sp, vy = Math.max(uy / d, 0.35) * sp + 2 * k;
      if (p.rag) p.rag.kick(vx * 0.85, vy * 0.85);
      else p.launch(vx, vy);
    }
  }

  /* ---------------------------- bits of the casing ---------------------------- */
  if (spec.frag) frag(sb, x, y, spec, by, fx0);

  /* ---------------------------------- things ---------------------------------- */
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
    const b = t.body, dx = b.pos.x - x, dy = b.pos.y - y, d = Math.hypot(dx, dy);
    if (d > R * 1.2) continue;
    const k = (1 - d / (R * 1.2)) * Math.sqrt(power);
    b.applyImpulse((dx / (d || 1)) * 7 * k * b.mass, (Math.max(0.3, dy / (d || 1)) * 7 + 2) * k * b.mass, b.pos.x, b.pos.y);
    // (a loose wall or a log turns over; something small spins)
    b.angVel += rand(-12, 12) * k / Math.max(1, b.mass / 4);
  }
  // walls, buildings, trees, bushes: blown out, cell by cell, everything out from the middle of it
  for (const w of [...sb.slabs]) {
    if (w.removed) continue;
    const b = w.body.aabb();
    if (x < b.minX - R || x > b.maxX + R || y < b.minY - R || y > b.maxY + R) continue;
    w.damage(x, y, R * 0.6, power * 2.6, 'blast', { out: { x, y }, speed: 2 + power * 1.5, bulk: power > 1.5 });
  }
  for (const t of [...sb.plants, ...sb.logs]) if (!t.removed) t.blast(x, y, R, power);

  /* ------------------------------------ the look ------------------------------------ */
  const ground = y < R * 0.45;
  fx.sparks(x, y, Math.round(10 + power * 6));
  fx.embers(x, y, Math.round(6 + power * 6));
  fx.dust(x, Math.max(0, y), Math.round(8 + power * 4), 1 + power * 0.5);
  if (ground) {
    // the ground it went off on, thrown up
    const n = Math.round(10 * spec.dirt * (0.6 + power * 0.4));
    for (let i = 0; i < n; i++) {
      const a = rand(0.15, Math.PI - 0.15), s = rand(3, 7 + power * 2);
      fx.bits(x + rand(-0.3, 0.3), Math.max(0.05, y), 1, DIRT[i % DIRT.length], Math.cos(a) * s, Math.sin(a) * s, { size: rand(0.03, 0.07) * (0.8 + power * 0.25) });
    }
    scorch(fx, x, R * 0.42);
  }
  sb.effects.push(fx0);
  sb.emit('explode', { who: by, x, y, kind, r: R, power, size: spec.size, shake: spec.shake, loud: true });
  return fx0;
}

/** How far into a blast out to R (0 at the edge, 1 in the middle of it) each part of a body is. */
function reach(p, x, y, R) {
  const ks = { head: 0, torso: 0, armA: 0, armB: 0, legA: 0, legB: 0 }, w = p.wj;
  for (let b = 0; b < BONES.length; b++) {
    const B = BONES[b], a = w[B[0]], z = w[B[1]];
    if (!a || !z) continue;
    let d = segDist(x, y, a.x, a.y, z.x, z.y).d;
    // (the skull is the round of the head, round the top of the neck)
    if (b === HEAD_BONE) d = Math.min(d, Math.hypot(x - z.x, y - z.y) - 0.11 * p.scale);
    const k = 1 - Math.max(0, d) / R;
    if (k > ks[B[2]]) ks[B[2]] = k;
  }
  return ks;
}

/** A black scorch on a part of them, somewhere along it. */
function scorchOn(p, part) {
  const w = p.wj;
  if (part === 'head') { p.headMark(w.head.x, w.head.y, 0.7, true); return; }
  const bones = [];
  for (let b = 0; b < BONES.length; b++) if (BONES[b][2] === part && b !== HEAD_BONE) bones.push(b);
  if (bones.length) p.addWound({ bone: bones[Math.floor(Math.random() * bones.length)], t: rand(0.2, 0.8), r: 0.7, burn: true });
}

/** How much of a body made of pieces (a mod's giant) a blast out to R takes in: 1 for a person, more for something huge. */
function caught(p, x, y, R) {
  const caps = p.species && p.species.shape ? p.species.shape(p) : null;
  if (!caps) return 1;
  let n = 0;
  for (const c of caps) {
    const vx = c.x1 - c.x0, vy = c.y1 - c.y0, L = vx * vx + vy * vy;
    const t = L > 0 ? clamp(((x - c.x0) * vx + (y - c.y0) * vy) / L, 0, 1) : 0;
    const d = Math.hypot(x - (c.x0 + vx * t), y - (c.y0 + vy * t)) - c.r;
    if (d < R) n += 1 - Math.max(0, d) / R;
  }
  return Math.max(1, n * 0.8);
}

/**
 * A grenade's casing, in pieces: they go out every way, much further than the
 * blast, and whoever is in the way - and in sight of it - catches some.
 */
function frag(sb, x, y, spec, by, fx0) {
  const FR = spec.r * 3;
  for (const p of [...sb.people]) {
    if (p.removed) continue;
    const n = p.nearestPart(x, y);
    if (!n || n.d > FR || !sb.lineOfSight(x, y, n.x, n.y)) continue;
    // (how many of them come their way: how much of what is round it they fill)
    const expect = spec.frag * Math.min(0.3, 0.24 / Math.max(0.35, n.d));
    const hits = Math.min(5, Math.floor(expect + Math.random()));
    for (let i = 0; i < hits && !p.removed; i++) {
      let at = n, part = n.part, bone = p.boneName(n.bone, n.t);
      // (a body of bones: anywhere on it; one of pieces: where it is nearest)
      if (!(p.species && p.species.shape)) {
        let r = rand(0, FRAG_TOTAL), b = 0;
        for (const [i2, w] of FRAG_BONES) { r -= w; if (r <= 0) { b = i2; break; } }
        const B = BONES[b], a = p.wj[B[0]], z = p.wj[B[1]], t = rand(0.1, 0.9);
        at = { x: a.x + (z.x - a.x) * t, y: a.y + (z.y - a.y) * t };
        part = B[2];
        bone = p.boneName(b, t);
      }
      const fall = 1 - n.d / FR;
      p.takeHit({ by, part, x: at.x, y: at.y, dir: sign(at.x - x) || 1, power: rand(0.45, 1) * (0.35 + 0.65 * fall), kind: 'shot', weapon: 'shrapnel', bone });
      fx0.streak(at.x, at.y);
    }
  }
  // and the ones that hit nothing
  for (let i = 0; i < 14; i++) {
    const a = rand(0, TAU), d = rand(spec.r * 0.8, FR);
    fx0.streak(x + Math.cos(a) * d, Math.max(0.02, y + Math.sin(a) * d));
  }
}

/** A scorch on the ground, w across (or, where there is one already, a bigger one). */
function scorch(fx, x, w) {
  for (const s of fx.splats) {
    if (s.tint === SCORCH && Math.abs(s.x - x) < s.w * 0.5) { s.w = Math.min(Math.max(s.w, w) * 1.08, 4); return; }
  }
  if (fx.splats.length >= 420) {
    const i = fx.splats.findIndex((s) => !s.pool);
    if (i >= 0) fx.splats.splice(i, 1);
  }
  fx.splats.push({ x, w, h: 0.04, dark: true, pool: false, tint: SCORCH });
}

/* ----------------------------------- the look ----------------------------------- */

// the colour of fire as it cools: white, yellow, orange, red, and down to soot
const HEAT = [
  [1, [255, 251, 232]], [0.82, [255, 226, 110]], [0.6, [255, 160, 40]], [0.4, [232, 82, 26]], [0.22, [128, 38, 18]], [0, [48, 40, 38]],
];
function heatColour(h) {
  for (let i = 1; i < HEAT.length; i++) {
    const [h1, c1] = HEAT[i];
    if (h >= h1) {
      const [h0, c0] = HEAT[i - 1], u = (h - h1) / (h0 - h1);
      return `rgb(${Math.round(c1[0] + (c0[0] - c1[0]) * u)},${Math.round(c1[1] + (c0[1] - c1[1]) * u)},${Math.round(c1[2] + (c0[2] - c1[2]) * u)})`;
    }
  }
  return 'rgb(48,40,38)';
}

/**
 * What an explosion looks like while it lasts: puffs that start as fire and
 * end as smoke, a flash and a glow, the ring of air going out, the streaks
 * of a grenade's casing - and, a bomb's, the cloud.
 */
export class Blast {
  constructor(x, y, spec) {
    this.x = x;
    this.y = y;
    this.R = spec.r;
    this.spec = spec;
    this.age = 0;
    this.life = spec.life;
    this.streaks = [];
    this.puffs = [];
    const R = spec.r, P = spec.power, ground = y < R * 0.45;
    // A puff: { x, y, vx, vy } going out and slowing (drag) until it is only rising (rise);
    // r its size, grow how much it swells at first, spread how much it goes on spreading
    // a second; from t0 it burns for `burn` seconds, then is smoke for `smoke` more.
    const puff = (o) => this.puffs.push({ vx: 0, vy: 0, drag: 2, rise: 0, grow: 0, spread: 0, t0: 0, burn: 0, smoke: 2, a: 0.4, grey: grey(), ...o });
    // the fireball: puffs of fire, thrown out and rolling up, going to smoke
    const nf = Math.round(9 + P * 6);
    for (let i = 0; i < nf; i++) {
      const a = ground ? rand(0.1, Math.PI - 0.1) : rand(0, TAU), s = rand(0.5, 1) * R * 1.4;
      puff({
        x: x + rand(-0.08, 0.08) * R, y: y + rand(-0.04, 0.08) * R, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.8 + R * 0.3,
        r: R * rand(0.06, 0.1), grow: R * rand(0.08, 0.14), spread: R * rand(0.02, 0.04), drag: rand(5, 8), rise: R * rand(0.14, 0.26),
        t0: rand(0, 0.06), burn: rand(0.35, 0.7) * (0.8 + P * 0.1), smoke: rand(1.3, 2.4) * spec.smoke, a: rand(0.35, 0.55),
      });
    }
    // smoke after it, billowing up from where it was
    const ns = Math.round(8 * spec.smoke);
    for (let i = 0; i < ns; i++) {
      puff({
        x: x + rand(-0.25, 0.25) * R, y: y + rand(0, 0.25) * R, vx: rand(-0.3, 0.3) * R, vy: 0,
        r: R * rand(0.08, 0.13), grow: R * rand(0.05, 0.1), spread: R * rand(0.03, 0.05), drag: 2, rise: R * rand(0.1, 0.2),
        t0: rand(0.15, 0.6), smoke: rand(1.8, 3) * spec.smoke, a: rand(0.25, 0.4),
      });
    }
    // the dust thrown out along the ground
    if (ground) {
      const nd = Math.round(6 + 5 * spec.dirt);
      for (let i = 0; i < nd; i++) {
        const side = i % 2 ? 1 : -1;
        puff({
          x: x + side * rand(0, 0.15) * R, y: R * rand(0.04, 0.08), vx: side * rand(1.4, 3) * R, vy: 0,
          r: R * rand(0.05, 0.08), grow: R * rand(0.06, 0.1), spread: R * 0.03, drag: rand(2.5, 4), rise: R * rand(0.02, 0.05),
          t0: rand(0.02, 0.1), smoke: rand(1.1, 1.8) * Math.max(0.7, spec.dirt * 0.6), grey: `rgb(${Math.round(rand(118, 140))},${Math.round(rand(104, 120))},${Math.round(rand(88, 100))})`, a: rand(0.25, 0.4),
        });
      }
    }
    // a bomb's cloud: a column of fire and smoke going up out of it, and the cap spreading at the top
    if (spec.cloud) {
      const H = R * 1.25;
      for (let i = 0; i < 16; i++) {
        const u = i / 15;
        puff({
          x, y: y + R * 0.1, tx: x + rand(-0.04, 0.04) * R, ty: y + H * u * 0.9, rate: rand(0.5, 0.8), drift: 0,
          r: R * rand(0.06, 0.09) * (1 - u * 0.3), grow: R * rand(0.03, 0.06), spread: R * 0.01,
          t0: 0.1 + u * 0.3, burn: u < 0.5 ? rand(0.5, 0.9) : rand(0.25, 0.5), smoke: rand(4.5, 6.5), a: rand(0.35, 0.5),
        });
      }
      for (let i = 0; i < 24; i++) {
        const a = rand(0, TAU), w = rand(0.1, 0.55) * R;
        puff({
          x, y: y + R * 0.2, tx: x + Math.cos(a) * w, ty: y + H + Math.sin(a) * w * 0.3, rate: rand(0.6, 1), drift: Math.cos(a) * R * 0.025,
          r: R * rand(0.09, 0.13), grow: R * rand(0.04, 0.07), spread: R * 0.012,
          t0: rand(0.05, 0.3), burn: rand(0.7, 1.3), smoke: rand(5, 7), a: rand(0.4, 0.55),
        });
      }
    }
    // (the ones further back first)
    this.puffs.sort((a, b) => a.t0 - b.t0);
  }

  /** A bit of casing going out from the middle to (x1, y1). */
  streak(x1, y1) { this.streaks.push({ x1, y1, d: Math.hypot(x1 - this.x, y1 - this.y) }); }

  update(dt) {
    this.age += dt;
    for (const q of this.puffs) {
      const t = this.age - q.t0;
      if (t < 0) continue;
      if (q.tx !== undefined) {
        // (a puff of a bomb's cloud makes for its place in it)
        const k = 1 - Math.exp(-dt * q.rate * 2);
        q.x += (q.tx - q.x) * k;
        q.y += (q.ty - q.y) * k;
        q.tx += q.drift * dt;
      } else {
        const k = Math.exp(-dt * q.drag);
        q.vx *= k;
        q.vy = q.vy * k + q.rise * (1 - k);
        q.x += q.vx * dt;
        q.y += q.vy * dt;
      }
      q.r += q.grow * 3 * dt * Math.exp(-t * 3) + q.spread * dt;
      if (q.y < q.r * 0.6) q.y = q.r * 0.6;
    }
    return this.age < this.life;
  }

  draw(ctx) {
    const age = this.age, R = this.R, x = this.x, y = this.y;
    // the glow it throws over everything round it, for a moment
    if (age < 0.4) {
      const f = 1 - age / 0.4, g = ctx.createRadialGradient(x, y, 0, x, y, R * 2.2);
      g.addColorStop(0, `rgba(255,236,190,${0.75 * f})`);
      g.addColorStop(0.35, `rgba(255,160,70,${0.32 * f})`);
      g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.fillRect(x - R * 2.2, y - R * 2.2, R * 4.4, R * 4.4);
      ctx.globalCompositeOperation = 'source-over';
    }
    // smoke behind, fire in front
    for (const q of this.puffs) {
      const t = age - q.t0;
      if (t < 0 || t < q.burn) continue;
      const s = (t - q.burn) / q.smoke;
      if (s >= 1) continue;
      ctx.globalAlpha = q.a * (1 - s) * (1 - s) * (s < 0.06 ? 0.5 + s / 0.06 * 0.5 : 1);
      ctx.fillStyle = q.grey;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r, 0, TAU);
      ctx.fill();
    }
    for (const q of this.puffs) {
      const t = age - q.t0;
      if (t < 0 || t >= q.burn) continue;
      const h = 1 - t / q.burn;
      ctx.globalAlpha = Math.min(1, 0.35 + h * 1.4);
      ctx.fillStyle = heatColour(h);
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r, 0, TAU);
      ctx.fill();
      // (the middle of it hotter still, for a moment)
      if (h > 0.55) {
        ctx.fillStyle = heatColour(Math.min(1, h + 0.18));
        ctx.beginPath();
        ctx.arc(q.x - q.r * 0.1, q.y + q.r * 0.12, q.r * 0.5, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // the flash
    if (age < 0.09) {
      const f = 1 - age / 0.09;
      ctx.fillStyle = `rgba(255,255,240,${f})`;
      ctx.beginPath();
      ctx.arc(x, y, R * (0.25 + 0.35 * (1 - f)), 0, TAU);
      ctx.fill();
    }
    // the ring of air going out
    if (age < 0.32) {
      const f = age / 0.32;
      ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - f)})`;
      ctx.lineWidth = Math.max(0.02, R * 0.05 * (1 - f));
      ctx.beginPath();
      ctx.arc(x, y, R * 1.8 * Math.pow(f, 0.6), 0, TAU);
      ctx.stroke();
    }
    // a grenade's casing, flying
    if (age < 0.16 && this.streaks.length) {
      ctx.strokeStyle = `rgba(255,226,150,${0.9 * (1 - age / 0.16)})`;
      ctx.lineWidth = 0.022;
      ctx.beginPath();
      for (const s of this.streaks) {
        const head = Math.min(s.d, age * 90), tail = Math.max(0, head - 1.3);
        if (tail >= s.d) continue;
        const ux = (s.x1 - x) / (s.d || 1), uy = (s.y1 - y) / (s.d || 1);
        ctx.moveTo(x + ux * tail, y + uy * tail);
        ctx.lineTo(x + ux * head, y + uy * head);
      }
      ctx.stroke();
    }
  }
}

/** A grey for a puff of smoke: none of them quite the same. */
function grey() {
  const v = Math.round(rand(58, 104));
  return `rgb(${v},${v - 3},${v - 5})`;
}
