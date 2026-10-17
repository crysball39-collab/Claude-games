/* =============================================================================
   The sandbox: the floor, the two walls, everyone and everything in it, and
   the fixed-step loop that moves them all.

   It is also the event bus. Everything that happens - a punch landing, a
   scream, a crate hitting the floor, someone dying - is emitted here, and
   every brain gets to decide whether it saw or heard it (brain.js). Sound
   and the HUD listen on the same bus.

   Each step: the brains think, the bodies move (animated ones by their
   controllers), the hand drags whatever it holds, the ragdolls fall and
   tumble, the crates and props move, and then what ran into what is sorted
   out - bodies bowling into people, knives going in point first.
   ========================================================================== */
import { World, Body } from '../physics/rigid.js';
import { Stickman, G } from './stickman.js';
import { Crate, Knuckles, Knife, CRATE_SIZE } from './props.js';
import { KNIFE_W } from './draw.js';
import { FX } from './fx.js';
import { makePerson } from './people.js';
import { clamp } from '../core/util.js';

export const STEP = 1 / 120;
export const HALF_WIDTH = 20;
export const LIMITS = { people: 24, crates: 40, knuckles: 16, knives: 16 };

// bodies piling on bodies: how big each heavy point is to another ragdoll
const PILE_R = { head: 0.17, neck: 0.08, chest: 0.09, hip: 0.09, kneeA: 0.06, kneeB: 0.06 };

export class Sandbox {
  constructor() {
    this.phys = new World({ gravity: -G, iterations: 10 });
    this.left = -HALF_WIDTH;
    this.right = HALF_WIDTH;
    this.ground = this.phys.add(new Body(HALF_WIDTH * 2 + 40, 40, Infinity, { y: -20, friction: 0.8 }));
    this.phys.add(new Body(4, 120, Infinity, { x: this.left - 2, y: 50, friction: 0.3 }));
    this.phys.add(new Body(4, 120, Infinity, { x: this.right + 2, y: 50, friction: 0.3 }));
    this.phys.filter = (a, b) => this.collides(a, b);

    this.people = [];
    this.crates = [];
    this.knuckles = [];
    this.knives = [];
    this.fx = new FX(this);
    this.time = 0;
    this.acc = 0;
    this.timeScale = 1;
    this.paused = false;
    this.settings = { blood: true, ragdoll: true };
    this.listeners = new Map();
    this.hand = null;
    /** Builds a brain for a new stickman; set by whoever owns the game. */
    this.makeBrain = null;
  }

  /* --------------------------------- events --------------------------------- */

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  emit(type, data = {}) {
    data.type = type;
    data.t = this.time;
    const l = this.listeners.get(type);
    if (l) for (const fn of l) fn(data);
    const all = this.listeners.get('*');
    if (all) for (const fn of all) fn(data);
    for (const p of this.people) if (p.brain && !p.removed) p.brain.perceive(data);
  }

  /* -------------------------------- spawning -------------------------------- */

  get count() { return { people: this.people.length, crates: this.crates.length, knuckles: this.knuckles.length, knives: this.knives.length }; }

  /** Every weapon in the sandbox, wherever it is. */
  get weapons() { return [...this.knuckles, ...this.knives]; }

  /** The props lying about loose, as bodies of their own. */
  loose() {
    const out = [];
    for (const k of this.knuckles) if (k.loose) out.push(k);
    for (const k of this.knives) if (k.loose) out.push(k);
    return out;
  }

  spawnStickman(x, y = null, o = {}) {
    if (this.people.length >= LIMITS.people) return null;
    x = clamp(x, this.left + 0.4, this.right - 0.4);
    const person = makePerson(o, this.people.map((p) => p.name));
    const sy = y ?? this.surfaceBelow(x, 0.15, 100).y;
    const man = new Stickman(this, x, sy + 0.01, person);
    man.traits = person.traits;
    man.proxy = this.phys.add(new Body(0.28, 1.6, Infinity, { kinematic: true, pushMass: 160, owner: man, friction: 0.5 }));
    man.brain = this.makeBrain ? this.makeBrain(man, person.traits) : null;
    this.people.push(man);
    // one step, so the body has a pose and a place before anyone looks at it
    man.update(STEP);
    man.syncProxy();
    this.fx.dust(x, sy, 10, 0.8);
    this.emit('spawn', { what: man, x, y: sy });
    return man;
  }

  spawnCrate(x, y) {
    if (this.crates.length >= LIMITS.crates) return null;
    x = clamp(x, this.left + CRATE_SIZE / 2 + 0.05, this.right - CRATE_SIZE / 2 - 0.05);
    const c = new Crate(this, x, Math.max(y, CRATE_SIZE / 2 + 0.01));
    this.crates.push(c);
    this.emit('spawn', { what: c, x, y });
    return c;
  }

  spawnKnuckles(x, y) {
    if (this.knuckles.length >= LIMITS.knuckles) return null;
    x = clamp(x, this.left + 0.2, this.right - 0.2);
    const k = new Knuckles(this, x, Math.max(y, 0.06));
    this.knuckles.push(k);
    this.emit('spawn', { what: k, x, y });
    return k;
  }

  spawnKnife(x, y, rot = 0) {
    if (this.knives.length >= LIMITS.knives) return null;
    x = clamp(x, this.left + 0.25, this.right - 0.25);
    const k = new Knife(this, x, Math.max(y, 0.04), rot);
    this.knives.push(k);
    this.emit('spawn', { what: k, x, y });
    return k;
  }

  remove(thing) {
    if (!thing || thing.removed) return;
    if (this.hand && this.hand.holding === thing) this.hand.release();
    if (thing.kind === 'stickman') {
      thing.dropCarried();
      if (thing.weapon) thing.dropWeapon(0);
      for (const e of [...thing.stuck]) thing.pullKnife(e, null);
      thing.removed = true;
      this.phys.remove(thing.proxy);
      this.people.splice(this.people.indexOf(thing), 1);
      this.emit('vanish', { who: thing, x: thing.pos.x, y: thing.pos.y });
    } else if (thing.kind === 'crate') {
      thing.removed = true;
      if (thing.carriedBy) thing.carriedBy.carrying = null;
      this.phys.remove(thing.body);
      this.crates.splice(this.crates.indexOf(thing), 1);
      // anything stuck in it falls out
      for (const k of this.knives) if (k.stuckIn && k.stuckIn.crate === thing) k.drop(k.body.pos.x, k.body.pos.y, 0, 0);
      this.emit('vanish', { what: thing, x: thing.pos.x, y: thing.pos.y });
    } else if (thing.kind === 'knuckles' || thing.kind === 'knife') {
      const at = { x: thing.pos.x, y: thing.pos.y };
      if (thing.wornBy) thing.wornBy.weapon = null;
      if (thing.stuckIn && thing.stuckIn.person) {
        const p = thing.stuckIn.person;
        p.stuck = p.stuck.filter((e) => e.knife !== thing);
      }
      thing.removed = true;
      if (thing.kind === 'knife') { thing.leaveWorld(); this.knives.splice(this.knives.indexOf(thing), 1); }
      else { if (!thing.wornBy) this.phys.remove(thing.body); this.knuckles.splice(this.knuckles.indexOf(thing), 1); }
      thing.wornBy = null;
      this.emit('vanish', { what: thing, x: at.x, y: at.y });
    }
  }

  clear() {
    if (this.hand) this.hand.release();
    for (const p of [...this.people]) this.remove(p);
    for (const k of [...this.knuckles]) this.remove(k);
    for (const k of [...this.knives]) this.remove(k);
    for (const c of [...this.crates]) this.remove(c);
    this.fx.clear();
  }

  /* ---------------------------------- time ---------------------------------- */

  /** Runs as many fixed steps as the frame time calls for. */
  update(frameDt) {
    if (this.paused) return 0;
    this.acc += Math.min(frameDt, 0.1) * this.timeScale;
    let n = 0;
    while (this.acc >= STEP && n < 12) {
      this.step(STEP);
      this.acc -= STEP;
      n++;
    }
    if (n >= 12) this.acc = 0;
    return n;
  }

  step(dt) {
    this.time += dt;
    for (const p of this.people) if (p.brain) p.brain.update(dt);
    for (const p of this.people) p.update(dt);
    this.separate(dt);
    this.bodiesCollide();
    for (const p of this.people) p.syncProxy();
    if (this.hand) this.hand.step(dt);
    this.stepRagdolls(dt);
    this.limbsCollide();
    this.knivesFly(dt);
    this.phys.step(dt);
    this.contacts();
    for (const k of this.knives) if (k.stuckIn && k.stuckIn.crate) k.follow();
    this.fx.update(dt);
    // anything knocked clean out of the world comes back down inside it
    for (const c of this.crates) this.keepInside(c.body);
    for (const k of this.loose()) this.keepInside(k.body);
  }

  keepInside(b) {
    if (b.pos.y < -2) { b.pos.y = 1; b.vel.x = b.vel.y = 0; }
    if (b.pos.x < this.left - 1 || b.pos.x > this.right + 1) { b.pos.x = clamp(b.pos.x, this.left + 1, this.right - 1); b.vel.x = 0; }
  }

  /**
   * People standing still do not stand inside each other; people walking
   * past each other are allowed to, the way they pass in a side view.
   */
  separate(dt) {
    const ps = this.people;
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i];
      if (a.state !== 'stand' || !a.onGround || a.rag) continue;
      for (let j = i + 1; j < ps.length; j++) {
        const b = ps[j];
        if (b.state !== 'stand' || !b.onGround || b.rag || Math.abs(a.pos.y - b.pos.y) > 0.4) continue;
        if (a.intent.x !== null && b.intent.x !== null) continue;
        const dx = b.pos.x - a.pos.x;
        const gap = 0.34 * (a.scale + b.scale) / 2 * (a.hugging === b ? 0.4 : 1);
        if (Math.abs(dx) >= gap) continue;
        const push = (gap - Math.abs(dx)) * 3 * dt;
        const s = dx === 0 ? (a.id < b.id ? -1 : 1) : Math.sign(dx);
        if (a.intent.x === null) a.pos.x -= s * push;
        if (b.intent.x === null) b.pos.x += s * push;
      }
    }
  }

  /* -------------------------------- ragdolls -------------------------------- */

  stepRagdolls(dt) {
    const rags = [];
    for (const p of this.people) if (p.rag) rags.push(p);
    if (!rags.length) return;
    const boxes = [];
    for (const c of this.crates) if (!c.carriedBy && !c.removed) boxes.push(c.body);
    const world = { floor: 0, left: this.left, right: this.right, boxes, friction: 0.55 };
    // something moving near a body at rest wakes it up
    for (const p of rags) {
      if (!p.rag.asleep) continue;
      const bb = p.rag.aabb(0.15);
      for (const b of boxes) {
        if (Math.hypot(b.vel.x, b.vel.y) < 0.3) continue;
        const a = b.aabb();
        if (a.maxX > bb.minX && a.minX < bb.maxX && a.maxY > bb.minY && a.minY < bb.maxY) { p.rag.wake(); break; }
      }
    }
    for (const p of rags) p.rag.step(dt, world);
    this.pile(rags);
    for (const p of rags) p.afterRag(dt);
  }

  /** Limp bodies land on each other instead of through each other. */
  pile(rags) {
    for (let i = 0; i < rags.length; i++) {
      const A = rags[i].rag;
      const ba = A.aabb(0.1);
      for (let j = i + 1; j < rags.length; j++) {
        const B = rags[j].rag;
        if (A.asleep && B.asleep) continue;
        const bb = B.aabb(0.1);
        if (ba.maxX < bb.minX || bb.maxX < ba.minX || ba.maxY < bb.minY || bb.maxY < ba.minY) continue;
        let touched = false;
        for (const pa of A.p) {
          const ra = PILE_R[pa.name];
          if (!ra) continue;
          for (const pb of B.p) {
            const rb = PILE_R[pb.name];
            if (!rb) continue;
            const dx = pb.x - pa.x, dy = pb.y - pa.y;
            const d = Math.hypot(dx, dy), min = ra + rb;
            if (d >= min || d < 1e-6) continue;
            const w = pa.im + pb.im;
            const k = (min - d) / (d * w) * 0.8;
            pa.x -= dx * k * pa.im; pa.y -= dy * k * pa.im;
            pb.x += dx * k * pb.im; pb.y += dy * k * pb.im;
            touched = true;
          }
        }
        if (touched) { A.wake(); B.wake(); }
      }
    }
  }

  /**
   * Someone flung through the air, or swung by the hand, knocks into whoever
   * is in the way: both of them get hurt, and the one hit may go flying too.
   * (For ragdolls this is limbsCollide; this is for bodies thrown animated.)
   */
  bodiesCollide() {
    for (const p of this.people) {
      if (p.rag) continue;
      if (p.state !== 'thrown' && p.state !== 'held' && !(p.dead && p.thrownDead)) continue;
      const sp = Math.hypot(p.vel.x, p.vel.y);
      if (sp < 5) continue;
      const c = p.wj.neck, h = p.wj.hip;
      const cx = (c.x + h.x) / 2, cy = (c.y + h.y) / 2;
      for (const q of this.people) {
        if (q === p || q.removed || q.state === 'held' || q.lying || q.rag) continue;
        if (cx < q.box.minX - 0.25 || cx > q.box.maxX + 0.25 || cy < q.box.minY - 0.2 || cy > q.box.maxY + 0.2) continue;
        if (!this.cooled(p, q)) continue;
        const hit = q.nearestPart(cx, cy);
        // a body is softer than a crate: it bowls them over more than it breaks them
        const power = Math.min(3, (sp - 4) * 0.32);
        const dir = Math.sign(p.vel.x) || 1;
        q.takeHit({ by: null, part: hit.part, x: cx, y: cy, dir, power, kind: 'impact', object: p, bone: q.boneName(hit.bone, hit.t) });
        if (power > 1.6 && (q.state === 'stand' || q.state === 'stagger')) q.launch(p.vel.x * 0.45, 2 + power);
        if (p.alive) p.takeHit({ by: null, part: 'torso', x: cx, y: cy, dir: -dir, power: power * 0.5, kind: 'impact', object: q });
        p.vel.x *= 0.45;
        this.emit('collide', { who: q, what: p, x: cx, y: cy, speed: sp });
      }
    }
  }

  /** The same for a ragdoll: whichever part of it is moving fastest into someone does the hitting. */
  limbsCollide() {
    for (const p of this.people) {
      const rag = p.rag;
      if (!rag || rag.asleep || rag.maxSpeed < 5) continue;
      const bb = rag.aabb(0.05);
      for (const q of this.people) {
        if (q === p || q.removed || q.rag || q.lying || q.state === 'held') continue;
        if (bb.maxX < q.box.minX || bb.minX > q.box.maxX || bb.maxY < q.box.minY || bb.minY > q.box.maxY) continue;
        let best = null;
        for (let i = 0; i < rag.p.length; i++) {
          const pt = rag.p[i];
          const vx = (pt.x - pt.px) / STEP, vy = (pt.y - pt.py) / STEP;
          const v = Math.hypot(vx, vy);
          if (v < 5 || (best && v <= best.v)) continue;
          const hit = q.touch(pt.x, pt.y, pt.r);
          if (hit) best = { pt, v, vx, vy, hit };
        }
        if (!best || !this.cooled(p, q)) continue;
        const { pt, v, vx, hit } = best;
        // how much body is behind it: a flying hand stings, a flying torso flattens
        const weight = clamp(Math.sqrt((1 / pt.im) / 10), 0.45, 1.25);
        const power = Math.min(3, (v - 4) * 0.32 * weight);
        const dir = Math.sign(vx) || 1;
        q.takeHit({ by: null, part: hit.part, x: hit.x, y: hit.y, dir, power, kind: 'impact', object: p, bone: q.boneName(hit.bone, hit.t) });
        if (power > 1.4 && (q.state === 'stand' || q.state === 'stagger') && !q.rag) q.launch(vx * 0.4, 1.5 + power);
        if (p.alive) p.takeHit({ by: null, part: 'torso', x: hit.x, y: hit.y, dir: -dir, power: power * 0.45, kind: 'impact', object: q });
        if (p.rag) p.rag.shove(pt.x, pt.y, -vx * 0.45, -best.vy * 0.25, 0.7);
        this.emit('collide', { who: q, what: p, x: hit.x, y: hit.y, speed: v });
      }
    }
  }

  /** At most one knock between the same two people every 0.6 s. */
  cooled(p, q) {
    const last = p.impactCool.get(q) || -99;
    if (this.time - last < 0.6) return false;
    p.impactCool.set(q, this.time);
    q.impactCool.set(p, this.time);
    return true;
  }

  /* --------------------------------- knives --------------------------------- */

  /**
   * A knife going fast enough, point first, goes into whatever is in front of
   * its point: a person (a stab, and it stays in), a crate or the floor (it
   * sticks there). Going in any other way, it just bounces off.
   */
  knivesFly(dt) {
    for (const k of this.knives) {
      if (!k.loose) continue;
      const b = k.body;
      const sp = Math.hypot(b.vel.x, b.vel.y);
      if (sp < 5.5) continue;
      const ux = Math.cos(b.rot), uy = Math.sin(b.rot);
      const along = (b.vel.x * ux + b.vel.y * uy) / sp;
      const tip = k.tip;
      const nx = tip.x + b.vel.x * dt, ny = tip.y + b.vel.y * dt;
      const pointFirst = along > 0.72 && sp > 6.5;
      const by = k.thrownBy && this.time - k.thrownAt < 3 ? k.thrownBy : null;

      // people
      let done = false;
      for (const q of this.people) {
        if (q.removed || q === k.thrownBy && this.time - k.thrownAt < 0.25) continue;
        const hit = q.touch(nx, ny, 0.02) || q.touch((tip.x + nx) / 2, (tip.y + ny) / 2, 0.02);
        if (!hit) continue;
        // flat-on, an animated body's stand-in takes the knock; a ragdoll has none
        if (!pointFirst && !q.rag) continue;
        if (!this.cooled(k, q)) { done = true; break; }
        q.impactCool.set(b, this.time);
        const dir = Math.sign(b.vel.x) || 1;
        if (pointFirst) {
          const power = clamp((sp - 5) * 0.2 + 0.75, 0.75, 2.3);
          q.takeHit({ by, part: hit.part, x: hit.x, y: hit.y, dir, power, kind: 'stab', weapon: 'knife', deep: true, object: k, bone: q.boneName(hit.bone, hit.t) });
          if (!q.removed) {
            q.stickKnife(k, hit, ux, uy, 0.07 + Math.min(0.05, (sp - 6) * 0.006));
            k.blood = Math.min(1, k.blood + 0.4);
            if (this.hand && this.hand.holding === k) this.hand.release();
            this.emit('stuck', { what: k, into: q, x: hit.x, y: hit.y, speed: sp });
          }
        } else {
          q.takeHit({ by, part: hit.part, x: hit.x, y: hit.y, dir, power: clamp((sp - 4) * 0.12, 0.2, 1), kind: 'impact', object: k, bone: q.boneName(hit.bone, hit.t) });
          b.vel.x *= -0.3; b.vel.y *= 0.3;
          b.angVel += (Math.random() - 0.5) * 18;
        }
        done = true;
        break;
      }
      if (done || !pointFirst) continue;

      // crates
      for (const c of this.crates) {
        if (c.carriedBy || c.removed || !c.body.contains(nx, ny)) continue;
        this.stickInCrate(k, c, ux, uy);
        done = true;
        break;
      }
      if (done) continue;

      // the floor, point down
      if (ny < 0 && uy < -0.45) {
        const depth = 0.05 + Math.min(0.05, (sp - 6) * 0.005);
        // where the line of the knife meets the floor, and the point that far in
        const t = tip.y / Math.max(0.01, -uy);
        const ex = tip.x + ux * t;
        b.pos.x = ex + ux * (depth - KNIFE_W / 2);
        b.pos.y = uy * (depth - KNIFE_W / 2);
        k.stickInto({ floor: true });
        if (this.hand && this.hand.holding === k) this.hand.release();
        this.emit('stuck', { what: k, into: null, x: ex, y: 0, speed: sp });
      }
    }
  }

  stickInCrate(k, c, ux, uy) {
    const b = k.body, cb = c.body;
    const tip = k.tip;
    // where the point met the crate, along the way it was going, and a little in
    let t0 = 0, t1 = 0.4;
    for (let i = 0; i < 14; i++) {
      const m = (t0 + t1) / 2;
      if (cb.contains(tip.x + ux * m, tip.y + uy * m)) t1 = m; else t0 = m;
    }
    const depth = 0.06;
    const ex = tip.x + ux * (t1 + depth), ey = tip.y + uy * (t1 + depth);
    b.pos.x = ex - ux * KNIFE_W / 2;
    b.pos.y = ey - uy * KNIFE_W / 2;
    const l = cb.toLocal(b.pos.x, b.pos.y);
    k.stickInto({ crate: c, lx: l.x, ly: l.y, lr: b.rot - cb.rot });
    if (this.hand && this.hand.holding === k) this.hand.release();
    cb.applyImpulse(b.vel.x * 0.35 + ux * 2, b.vel.y * 0.35 + uy * 2, ex, ey);
    this.emit('stuck', { what: k, into: c, x: ex, y: ey, speed: 8 });
  }

  /* ------------------------------ rigid contacts ---------------------------- */

  /** Which body pairs are allowed to touch. */
  collides(a, b) {
    // a crate up in someone's hands is held clear of everything
    if ((a.owner && a.owner.carriedBy) || (b.owner && b.owner.carriedBy)) return false;
    const ma = a.owner && a.owner.kind === 'stickman' ? a.owner : null;
    const mb = b.owner && b.owner.kind === 'stickman' ? b.owner : null;
    if (!ma && !mb) return true;
    const man = ma || mb, other = ma ? b : a;
    // limp, the ragdoll touches things itself
    if (man.rag) return false;
    const thing = other.owner;
    if (!thing) return true;
    // The stand-in is there for things that come at someone, or come to rest
    // on them. Anything slow beside them is the character controller's to
    // deal with: a stand-in has infinite mass, and a crate squeezed between
    // two of them, or a set of knuckles between one and the floor, would be
    // crushed with impossible force.
    const speed = Math.hypot(other.vel.x, other.vel.y);
    if (thing.kind === 'knuckles' || thing.kind === 'knife') return speed > 3 && !man.lying;
    if (thing.kind === 'crate') {
      if (other === man.support) return false;
      if (man.climbing && man.climbing.crate === thing) return false;
      if (man.lying) return other.aabb().minY > man.proxy.pos.y || speed > 2.5;
      return speed > 2.5 || this.touching(a, b);
    }
    return true;
  }

  touching(a, b) {
    const b1 = a.id < b.id ? a : b, b2 = b1 === a ? b : a;
    return this.phys.arbiters.has(b1.id * 65536 + b2.id);
  }

  /** Impacts on people, and things clattering, from this step's contacts. */
  contacts() {
    for (const arb of this.phys.arbiters.values()) {
      const oa = arb.b1.owner, ob = arb.b2.owner;
      const man = oa && oa.kind === 'stickman' ? oa : ob && ob.kind === 'stickman' ? ob : null;
      if (man) {
        const body = man === oa ? arb.b2 : arb.b1;
        if (!body.owner || man.removed || man.rag) continue;
        // only the thing's own speed at them counts: walking into a crate is not being hit by one
        const o = arb.other(man.proxy);
        const into = man === oa ? arb.into2 : arb.into1;
        if (into > 2.2 && into < 30) man.impactFrom(body, into, arb.point(), { x: o.nx, y: o.ny });
        // a body swung or flung into a crate shoves it - hard, but not into orbit,
        // the way a stand-in of infinite mass otherwise would
        if ((man.state === 'held' || man.state === 'thrown') && body.invMass > 0) {
          const sp = Math.hypot(body.vel.x, body.vel.y);
          if (sp > 6) { body.vel.x *= 6 / sp; body.vel.y *= 6 / sp; }
        }
        if (man.lying && body.invMass > 0 && body.pos.y > man.proxy.pos.y + 0.05 && body.mass > 5) {
          man.pinnedBy = body.owner;
          man.pinT = this.time;
        }
        continue;
      }
      if (arb.approach > 1.4) {
        const thing = oa && oa.kind ? oa : ob && ob.kind ? ob : null;
        if (!thing || this.time - thing.lastSound < 0.08) continue;
        thing.lastSound = this.time;
        const p = arb.point();
        if (thing.kind === 'crate' && arb.approach > 3) this.fx.dust(p.x, p.y, 3, arb.approach / 8);
        this.emit('clatter', { what: thing, speed: arb.approach, x: p.x, y: p.y });
      }
    }
  }

  /* --------------------------------- queries -------------------------------- */

  /** The highest thing to stand on under x (+/- hw) that is no higher than maxY. */
  surfaceBelow(x, hw, maxY) {
    let best = { y: 0, body: null };
    for (const c of this.crates) {
      if (c.removed || c.carriedBy) continue;
      const bb = c.body.aabb();
      if (bb.maxX < x - hw || bb.minX > x + hw || bb.minY > maxY) continue;
      const top = Math.max(c.body.topAt(x), c.body.topAt(x - hw), c.body.topAt(x + hw));
      if (top > maxY + 1e-6 || top <= best.y) continue;
      best = { y: top, body: c.body };
    }
    return best;
  }

  /** The top of the pile a crate is part of: itself, or whatever is stacked on it. */
  stackTop(c) {
    const bb = c.body.aabb();
    let top = bb.maxY, grew = true, guard = 0;
    while (grew && guard++ < 20) {
      grew = false;
      for (const o of this.crates) {
        if (o === c || o.carriedBy || o.removed) continue;
        const ob = o.body.aabb();
        if (ob.maxX < bb.minX + 0.15 || ob.minX > bb.maxX - 0.15) continue;
        if (ob.minY < top + 0.06 && ob.maxY > top + 0.01) { top = ob.maxY; grew = true; }
      }
    }
    return top;
  }

  /** Something sitting on top of a crate: another crate, or a person. */
  crateOnTop(c) {
    const bb = c.body.aabb();
    for (const o of this.crates) {
      if (o === c || o.carriedBy || o.removed) continue;
      const ob = o.body.aabb();
      if (Math.abs(ob.minY - bb.maxY) < 0.1 && ob.maxX > bb.minX + 0.1 && ob.minX < bb.maxX - 0.1) return o;
    }
    for (const p of this.people) if (p.support === c.body) return p;
    return null;
  }

  crateAt(x, y) {
    for (const c of this.crates) if (!c.removed && c.body.contains(x, y)) return c;
    return null;
  }

  crateNear(x, y, r) {
    for (const c of this.crates) if (!c.removed && c.body.contains(x, y, r)) return c;
    return null;
  }

  /** Whether one point can see another past the crates. */
  lineOfSight(ax, ay, bx, by, ignore = null) {
    const hit = this.phys.raycast(ax, ay, bx, by,
      (b) => b !== ignore && b.owner && b.owner.kind === 'crate' && !b.owner.carriedBy);
    return !hit;
  }

  /** The person whose body is nearest a point, within r. */
  personAt(x, y, r) {
    let best = null;
    for (const p of this.people) {
      if (x < p.box.minX - r || x > p.box.maxX + r || y < p.box.minY - r || y > p.box.maxY + r) continue;
      const n = p.nearestPart(x, y);
      if (n.d <= r && (!best || n.d < best.d)) best = { who: p, d: n.d, part: n.part };
    }
    return best;
  }

  /**
   * Anything under a point: a knife stuck in someone (by its handle) first,
   * then people, then knives and knuckles, then crates.
   */
  thingAt(x, y, r) {
    for (const p of this.people) {
      for (const e of p.stuck) {
        const q = p.knifePose(e);
        // the handle end is the half away from the point
        const hx = q.x - q.ux * KNIFE_W * 0.25, hy = q.y - q.uy * KNIFE_W * 0.25;
        if (Math.hypot(x - hx, y - hy) < Math.max(0.09, r * 0.6)) return e.knife;
      }
    }
    const p = this.personAt(x, y, r);
    if (p) return p.who;
    for (let i = this.knives.length - 1; i >= 0; i--) {
      const k = this.knives[i];
      if (!k.wornBy && !(k.stuckIn && k.stuckIn.person) && k.body.contains(x, y, r * 0.6 + 0.04)) return k;
    }
    for (let i = this.knuckles.length - 1; i >= 0; i--) {
      const k = this.knuckles[i];
      if (!k.wornBy && k.body.contains(x, y, r + 0.06)) return k;
    }
    for (let i = this.crates.length - 1; i >= 0; i--) {
      const c = this.crates[i];
      if (c.body.contains(x, y, r * 0.5)) return c;
    }
    return null;
  }
}
