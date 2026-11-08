/* =============================================================================
   THINGS IN THE DARK - the two that come through.

   Neither walks: neither has legs to walk on. They come in at one end of the
   world, a little above the floor, and go out at the other, faster than
   anybody can run - and before they come the lights go, on and off, more off
   than on, and there is a sound getting louder. Whoever is out in the open
   when one goes past does not get up again. Whoever is shut away inside
   something (a wardrobe) is passed by.

     the Grasp    a tide of pale arms, hundreds of them, reaching ahead of it
                  and trailing behind it like hair in water. It takes whoever
                  it reaches, and drops them further on. It comes through once.
     the Rattle   a knot of rusted chain and hooks with something burning at
                  the middle of it, spinning, shedding sparks. It tears
                  through whoever it hits. And when it has gone out at the
                  far end, it comes back - two to six more times, faster each
                  time - and whoever came out too soon is caught in the open.
   ========================================================================== */
import { defineArm } from '../../game/props.js';
import { MOD, drawDark } from './common.js';
import { drawGrasp, drawRattle } from './look.js';
import { clamp01, rand, randInt, pick } from '../../core/util.js';

export const RUSH = {
  grasp: { title: 'the Grasp', cause: 'taken by the Grasp', speed: 24, len: 4.8, h: 2.75, warn: 3.4, passes: [1, 1], fling: 15, faster: 0 },
  rattle: { title: 'the Rattle', cause: 'torn apart by the Rattle', speed: 21, len: 3.3, h: 2.55, warn: 3, passes: [3, 7], fling: 12, faster: 3.5 },
};

// what it is to whoever it hurts, and to whoever saw (props.js ARMS)
defineArm('darkGrasp', { name: 'The Grasp', noun: 'grasp', wound: 'Taken', cause: RUSH.grasp.cause, shove: 3, nasty: 3, power: 10, memory: 'hurtMe', verb: 'went straight through me' });
defineArm('darkRattle', { name: 'The Rattle', noun: 'chains', wound: 'Torn', cause: RUSH.rattle.cause, shove: 3, nasty: 3, power: 10, memory: 'hurtMe', verb: 'tore into me' });

/** On, off, on: a stutter that is mostly dark (0.1 .. 1). */
function flicker(t, seed) {
  const a = Math.sin(t * 23 + seed) + Math.sin(t * 37.3 + seed * 1.7) * 0.8 + Math.sin(t * 7.1 + seed * 0.3) * 0.6;
  return a > 0.2 ? 1 : a > -0.4 ? 0.55 : 0.1;
}

export class Rusher {
  constructor(sb, kind, x) {
    this.mod = MOD;
    this.kind = kind;
    this.spec = RUSH[kind];
    this.sandbox = sb;
    this.removed = false;
    // in at the end of the world nearest where it was called up, and out at the other
    this.dir = x > (sb.left + sb.right) / 2 ? -1 : 1;
    this.passes = randInt(this.spec.passes[0], this.spec.passes[1]);
    this.pass = 0;
    this.speed = this.spec.speed;
    this.phase = 'warn';
    this.t = 0;
    this.warnFor = this.spec.warn;
    this.x = this.edge();
    this.dark = 0;
    this.spin = 0;
    this.seed = rand(0, 1000);
    this.hits = new Set();
    this.taken = 0;
    this.warned();
  }

  get name() { return this.spec.title; }
  /** Where it comes in from on this pass: past the end of the world. */
  edge() { const sb = this.sandbox; return this.dir > 0 ? sb.left - 4 : sb.right + 4; }
  /** How long a pass takes, from one end to the other. */
  crossTime() { const sb = this.sandbox; return (sb.right - sb.left + 8 + this.spec.len) / this.speed; }
  /** Still to come through, or coming through now. */
  get coming() { return this.phase === 'warn' || this.phase === 'pass'; }
  /** How long before it reaches somebody standing at x (Infinity: it has been, this time). */
  etaAt(x) {
    if (this.phase === 'pass') { const d = (x - this.x) * this.dir; return d < -this.spec.len ? Infinity : Math.max(0, d) / this.speed; }
    if (this.phase === 'warn') return Math.max(0, this.warnFor - this.t) + Math.abs(x - this.edge()) / this.speed;
    return Infinity;
  }

  warned() {
    const sb = this.sandbox;
    sb.emit('rushWarn', { what: this, kind: this.kind, dir: this.dir, pass: this.pass, dur: this.warnFor, eta: this.warnFor + this.crossTime() / 2, x: this.dir > 0 ? sb.left : sb.right, y: 1.5, mod: MOD });
  }

  update(dt) {
    if (this.removed) return false;
    const sb = this.sandbox;
    this.t += dt;
    this.spin += dt * (this.phase === 'pass' ? 10 : 2);
    if (this.phase === 'warn') {
      // the lights going: worse and worse until it is here
      this.dark = flicker(this.t, this.seed) * (0.3 + 0.55 * clamp01(this.t / this.warnFor));
      if (this.t >= this.warnFor) {
        this.phase = 'pass';
        this.t = 0;
        this.hits.clear();
        sb.emit('rushPass', { what: this, kind: this.kind, dir: this.dir, pass: this.pass, dur: this.crossTime(), x: this.x, y: 1.4, mod: MOD });
      }
    } else if (this.phase === 'pass') {
      this.x += this.dir * this.speed * dt;
      this.dark = 0.5 + 0.35 * flicker(this.t * 1.6, this.seed + 7);
      this.sweep();
      const gone = this.dir > 0 ? this.x - this.spec.len > sb.right + 2 : this.x + this.spec.len < sb.left - 2;
      if (gone) {
        this.pass++;
        const more = this.pass < this.passes;
        sb.emit('rushPassed', { what: this, kind: this.kind, pass: this.pass, more, taken: this.taken, x: this.x, y: 1.4, mod: MOD });
        this.phase = more ? 'gap' : 'gone';
        this.t = 0;
        this.gapFor = rand(1.6, 3.6);
      }
    } else if (this.phase === 'gap') {
      // quiet - the lights come back, and it feels as though it is over
      this.dark = Math.max(0, this.dark - dt * 1.6);
      if (this.t >= this.gapFor) {
        this.dir = -this.dir;
        this.speed += this.spec.faster;
        this.x = this.edge();
        this.phase = 'warn';
        this.t = 0;
        this.warnFor = rand(1.3, 2.2);
        this.warned();
      }
    } else {
      this.dark = Math.max(0, this.dark - dt * 1.4);
      if (this.dark <= 0) {
        this.removed = true;
        sb.emit('rushGone', { what: this, kind: this.kind, passes: this.pass, taken: this.taken, mod: MOD });
        return false;
      }
    }
    return true;
  }

  /** Whatever it is passing through, this step. */
  sweep() {
    const sb = this.sandbox, s = this.spec;
    const back = this.x - this.dir * s.len, lo = Math.min(this.x, back), hi = Math.max(this.x, back);
    for (const p of [...sb.people]) {
      if (p.removed || p.hiddenIn || this.hits.has(p)) continue;
      if (p.box.maxX < lo || p.box.minX > hi || p.box.minY > s.h) continue;
      // (something the size of a building, or another thing out of the dark: straight through it, nothing happens)
      if (p.species && (p.species.giant || p.species.mod === MOD)) continue;
      this.hits.add(p);
      this.take(p);
    }
    // crates and anything else loose: thrown along ahead of it
    const shove = (b) => { b.vel.x += this.dir * rand(5, 9); b.vel.y += rand(1.5, 4); b.angVel += rand(-7, 7); };
    for (const c of sb.crates) {
      if (c.removed || c.carriedBy || !c.body || this.hits.has(c) || c.pos.x < lo || c.pos.x > hi || c.pos.y > s.h) continue;
      this.hits.add(c);
      shove(c.body);
    }
    for (const it of sb.loose()) {
      const b = it.body;
      if (!b || this.hits.has(it) || it.pos.x < lo || it.pos.x > hi || it.pos.y > s.h) continue;
      this.hits.add(it);
      shove(b);
    }
    // a wardrobe it goes past rattles on its feet
    for (const it of sb.items) if (it.rattle && !it.removed && Math.abs(it.pos.x - (lo + hi) / 2) < 1.6) it.rattle(0.6);
  }

  /** Somebody out in the open, as it goes through them. */
  take(p) {
    const sb = this.sandbox, s = this.spec, dir = this.dir;
    const at = { x: p.wj.chest.x, y: p.wj.chest.y };
    const weapon = this.kind === 'grasp' ? 'darkGrasp' : 'darkRattle';
    if (sb.hand && sb.hand.holding === p) sb.hand.release();
    if (p.state === 'held' && p.heldBy) p.release();
    // the dead are only thrown along
    if (p.dead) {
      if (p.rag) p.rag.kick(dir * s.fling * 0.5, 2);
      return;
    }
    this.taken++;
    // somebody nothing gets into (super durability): thrown down the room, and up again in a while
    if (p.toughSkin) {
      p.takeHit({ by: null, part: 'torso', x: at.x, y: at.y, dir, power: 2.5, kind: 'impact', weapon, bone: 'ribs' });
      if (p.rag) p.rag.kick(dir * s.fling * 0.6, 4);
      sb.emit('rushHit', { who: p, what: this, kind: this.kind, x: at.x, y: at.y, survived: true, mod: MOD });
      return;
    }
    if (this.kind === 'rattle') {
      // torn open, all down them, as it goes through
      for (let i = 0; i < 5; i++) p.addWound({ bone: pick([0, 1, 1, 2, 3, 4, 5, 6]), t: rand(0.15, 0.85), r: rand(0.5, 1), gash: rand(0.2, 0.45) });
      sb.fx.blood(at.x, at.y, dir * 7, 2.5, 34, 1.5, p);
    }
    p.die(s.cause, null, dir, 3, at);
    if (p.rag) p.rag.kick(dir * s.fling, 3.5);
    sb.emit('rushHit', { who: p, what: this, kind: this.kind, x: at.x, y: at.y, mod: MOD });
  }

  draw(ctx) {
    drawDark(ctx, this.sandbox, this.dark);
    if (this.phase === 'pass') (this.kind === 'grasp' ? drawGrasp : drawRattle)(ctx, this);
  }
}

/** One of them called up: from the end of the world nearest x. Only one at a time of each. */
export function startRush(sb, kind, x) {
  if (sb.effects.some((e) => e instanceof Rusher && e.kind === kind && !e.removed)) return null;
  const r = new Rusher(sb, kind, x);
  sb.effects.push(r);
  return r;
}

/** Whatever is coming through, or about to (for everybody deciding where to be). */
export const rushers = (sb) => sb.effects.filter((e) => e instanceof Rusher && !e.removed);
