/* =============================================================================
   The sandbox: the floor, the two walls, everyone and everything in it, and
   the fixed-step loop that moves them all.

   It is also the event bus. Everything that happens - a punch landing, a
   scream, a crate hitting the floor, someone dying - is emitted here, and
   every brain gets to decide whether it saw or heard it (brain.js). Sound
   and the HUD listen on the same bus.
   ========================================================================== */
import { World, Body } from '../physics/rigid.js';
import { Stickman, G } from './stickman.js';
import { Crate, Knuckles, CRATE_SIZE } from './props.js';
import { FX } from './fx.js';
import { makePerson } from './people.js';
import { clamp } from '../core/util.js';

export const STEP = 1 / 120;
export const HALF_WIDTH = 20;
export const LIMITS = { people: 24, crates: 40, knuckles: 16 };

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
    this.fx = new FX(this);
    this.time = 0;
    this.acc = 0;
    this.timeScale = 1;
    this.paused = false;
    this.settings = { blood: true };
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

  get count() { return { people: this.people.length, crates: this.crates.length, knuckles: this.knuckles.length }; }

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

  remove(thing) {
    if (!thing || thing.removed) return;
    if (this.hand && this.hand.holding === thing) this.hand.release();
    thing.removed = true;
    if (thing.kind === 'stickman') {
      thing.dropCarried();
      if (thing.weapon) thing.dropWeapon(0);
      this.phys.remove(thing.proxy);
      this.people.splice(this.people.indexOf(thing), 1);
      this.emit('vanish', { who: thing, x: thing.pos.x, y: thing.pos.y });
    } else if (thing.kind === 'crate') {
      if (thing.carriedBy) thing.carriedBy.carrying = null;
      this.phys.remove(thing.body);
      this.crates.splice(this.crates.indexOf(thing), 1);
      this.emit('vanish', { what: thing, x: thing.pos.x, y: thing.pos.y });
    } else if (thing.kind === 'knuckles') {
      if (thing.wornBy) thing.wornBy.weapon = null;
      else this.phys.remove(thing.body);
      this.knuckles.splice(this.knuckles.indexOf(thing), 1);
      this.emit('vanish', { what: thing, x: thing.pos.x, y: thing.pos.y });
    }
  }

  clear() {
    if (this.hand) this.hand.release();
    for (const p of [...this.people]) this.remove(p);
    for (const k of [...this.knuckles]) this.remove(k);
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
    this.phys.step(dt);
    this.contacts();
    this.fx.update(dt);
    // anything knocked clean out of the world comes back down inside it
    for (const c of this.crates) this.keepInside(c.body);
    for (const k of this.knuckles) if (!k.wornBy) this.keepInside(k.body);
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
      if (a.state !== 'stand' || !a.onGround) continue;
      for (let j = i + 1; j < ps.length; j++) {
        const b = ps[j];
        if (b.state !== 'stand' || !b.onGround || Math.abs(a.pos.y - b.pos.y) > 0.4) continue;
        if (a.intent.x !== null && b.intent.x !== null) continue;
        const dx = b.pos.x - a.pos.x;
        const gap = 0.34 * (a.scale + b.scale) / 2;
        if (Math.abs(dx) >= gap) continue;
        const push = (gap - Math.abs(dx)) * 3 * dt;
        const s = dx === 0 ? (a.id < b.id ? -1 : 1) : Math.sign(dx);
        if (a.intent.x === null) a.pos.x -= s * push;
        if (b.intent.x === null) b.pos.x += s * push;
      }
    }
  }

  /**
   * Someone flung through the air, or swung by the hand, knocks into whoever
   * is in the way: both of them get hurt, and the one hit may go flying too.
   */
  bodiesCollide() {
    for (const p of this.people) {
      if (p.state !== 'thrown' && p.state !== 'held' && !(p.dead && p.thrownDead)) continue;
      const sp = Math.hypot(p.vel.x, p.vel.y);
      if (sp < 5) continue;
      const c = p.wj.neck, h = p.wj.hip;
      const cx = (c.x + h.x) / 2, cy = (c.y + h.y) / 2;
      for (const q of this.people) {
        if (q === p || q.removed || q.state === 'held' || q.lying) continue;
        if (cx < q.box.minX - 0.25 || cx > q.box.maxX + 0.25 || cy < q.box.minY - 0.2 || cy > q.box.maxY + 0.2) continue;
        const last = p.impactCool.get(q) || -99;
        if (this.time - last < 0.6) continue;
        p.impactCool.set(q, this.time);
        q.impactCool.set(p, this.time);
        const hit = q.nearestPart(cx, cy);
        // a body is softer than a crate: it bowls them over more than it breaks them
        const power = Math.min(3, (sp - 4) * 0.32);
        const dir = Math.sign(p.vel.x) || 1;
        q.takeHit({ by: null, part: hit.part, x: cx, y: cy, dir, power, kind: 'impact', object: p });
        if (power > 1.6 && (q.state === 'stand' || q.state === 'stagger')) q.launch(p.vel.x * 0.45, 2 + power);
        if (p.alive) p.takeHit({ by: null, part: 'torso', x: cx, y: cy, dir: -dir, power: power * 0.5, kind: 'impact', object: q });
        p.vel.x *= 0.45;
        this.emit('collide', { who: q, what: p, x: cx, y: cy, speed: sp });
      }
    }
  }

  /** Which body pairs are allowed to touch. */
  collides(a, b) {
    // a crate up in someone's hands is held clear of everything
    if ((a.owner && a.owner.carriedBy) || (b.owner && b.owner.carriedBy)) return false;
    const ma = a.owner && a.owner.kind === 'stickman' ? a.owner : null;
    const mb = b.owner && b.owner.kind === 'stickman' ? b.owner : null;
    if (!ma && !mb) return true;
    const man = ma || mb, other = ma ? b : a;
    const thing = other.owner;
    if (!thing) return true;
    // The stand-in is there for things that come at someone, or come to rest
    // on them. Anything slow beside them is the character controller's to
    // deal with: a stand-in has infinite mass, and a crate squeezed between
    // two of them, or a set of knuckles between one and the floor, would be
    // crushed with impossible force.
    const speed = Math.hypot(other.vel.x, other.vel.y);
    if (thing.kind === 'knuckles') return speed > 3 && !man.lying;
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
        if (!body.owner || man.removed) continue;
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

  /** Anything under a point: people first, then knuckles, then crates. */
  thingAt(x, y, r) {
    const p = this.personAt(x, y, r);
    if (p) return p.who;
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
