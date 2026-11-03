/* =============================================================================
   SUPERPOWERS - what every power's moves share: getting hold of somebody and
   letting them go, a blow that lands, a shockwave, a thing gripped and moved
   about from a distance, and the bookkeeping of a move as it runs.

   A move is a few phases in a row (m.phase, and m.pt: how long it has been in
   this one), stepped once a frame until it says it is done. While one runs,
   it has the body: the brain waits, and the move says where they go, what
   they do with their arms and what that does to whoever is on the end of it.
   ========================================================================== */
import { GrabJoint } from '../../physics/rigid.js';
import { defineArm } from '../props.js';
import { clamp, sign, rand, chance } from '../../core/util.js';

export const alive = (p) => !!p && !p.removed && !p.dead;
export const awake = (p) => alive(p) && p.conscious;
export const now = (man) => man.sandbox.time;

// the weapons of the powers, as far as wounds, causes of death, memories and witnesses go
const ARM = (kind, o) => defineArm(kind, { memory: 'hurtMe', hurt: 'hurtBig', scary: 0.6, power: 3, ...o });
ARM('superBlow', { name: 'A superhuman blow', noun: 'blow', cause: 'a blow no person should be able to throw', shove: 2.4, nasty: 2.8, breaks: 0.35, verb: 'hit me harder than anybody should be able to', seen: 'sawSuperBlow' });
ARM('skyFall', { name: 'A fall from the sky', noun: 'fall', cause: 'a fall from a great height', shove: 1.5, nasty: 3, breaks: 0.5, verb: 'threw me out of the sky' });
ARM('slam', { name: 'Being slammed down', noun: 'slam', cause: 'being slammed into the ground', shove: 1.4, nasty: 2.8, breaks: 0.45, verb: 'slammed me into the ground', seen: 'sawSlam' });
ARM('shockwave', { name: 'A shockwave', noun: 'shockwave', cause: 'a shockwave', shove: 2, nasty: 2, breaks: 0.15, verb: 'knocked me flat without touching me' });
ARM('speedBlow', { name: 'Blows too fast to see', noun: 'blur', cause: 'a beating too fast to see', shove: 1.2, nasty: 2.6, breaks: 0.2, verb: 'hit me so fast I never saw it', seen: 'sawSpeedBlow' });
ARM('crush', { name: 'A crushing grip', noun: 'grip', cause: 'being crushed', shove: 0.2, nasty: 3, breaks: 0.6, verb: 'nearly crushed me', seen: 'sawCrush' });
ARM('mind', { name: 'Something unseen', noun: 'force', cause: 'something nobody could see', shove: 1.6, nasty: 2.8, breaks: 0.3, verb: 'threw me around without laying a finger on me', seen: 'sawTelekinesis' });
ARM('hurled', { name: 'Something thrown', noun: 'throw', cause: 'something hurled at them', shove: 1.8, nasty: 2.2, breaks: 0.3, verb: 'threw half the room at me' });

/* ------------------------------ getting hold ------------------------------- */

/** Takes hold of somebody (the hand in the sky lets go of them first). */
export function seize(man, o, x, y) {
  if (!alive(o) || o === man || o.steadfast) return false;
  const sb = man.sandbox;
  if (sb.hand && sb.hand.holding === o) sb.hand.release();
  if (o.heldBy && o.heldBy !== man && o.state === 'held') o.release();
  o.grab(x, y, man);
  return o.heldBy === man;
}

export const holding = (man, o) => !!o && !o.removed && o.heldBy === man && o.state === 'held';

/** Where they are held from, and how fast that point is going (for when they are let go). */
export function holdAt(man, o, x, y, vx = 0, vy = 0) {
  if (!holding(man, o)) return false;
  o.holdAt(x, y);
  if (o.held) { o.held.vx = clamp(vx, -26, 26); o.held.vy = clamp(vy, -26, 26); }
  return true;
}

/** Let go of them: thrown at the speed given, and whatever they hit now, `man` threw them into. */
export function letGo(man, o, vx = 0, vy = 0, weapon = vy < -8 ? 'skyFall' : 'hurled') {
  if (!holding(man, o)) return false;
  if (o.held) { o.held.vx = clamp(vx, -26, 26); o.held.vy = clamp(vy, -26, 26); }
  o.release();
  o.thrownBy = man;
  o.thrownAt = man.sandbox.time;
  // thrown hard, or from high up: whatever they come down on, or fly into, hurts as much as it should
  if (Math.hypot(vx, vy) > 7 || o.wj.chest.y > 3) watchImpact(man, o, weapon);
  return true;
}

/**
 * A body sent flying by a power, watched until it hits something: the speed
 * it loses all at once (the floor, a wall) is what it takes, on top of what
 * the fall itself does - which, for a fall like this, is not nearly enough.
 */
class ImpactWatch {
  constructor(by, o, weapon, min) { this.by = by; this.o = o; this.weapon = weapon; this.min = min; this.t = 0; this.top = 0; }
  update(dt) {
    const o = this.o;
    this.t += dt;
    if (o.removed || this.t > 5) return false;
    if (o.state === 'held') { this.top = 0; return true; }
    let vx, vy;
    if (o.rag) { const c = o.rag.p[o.rag.byName.chest]; vx = (c.x - c.px) / dt; vy = (c.y - c.py) / dt; } else { vx = o.vel.x; vy = o.vel.y; }
    const sp = Math.hypot(vx, vy);
    if (sp > this.top) { this.top = sp; this.dir = sign(vx); }
    if (this.top >= this.min && sp < this.top * 0.4) {
      const k = this.top - sp - 7;
      if (k > 0) {
        const w = o.wj;
        o.takeHit({ by: this.by, part: 'torso', x: w.chest.x, y: w.chest.y, dir: 0, power: k * 0.32, kind: 'impact', weapon: this.weapon, bone: k > 6 ? 'ribs' : null });
        if (!o.removed) o.takeHit({ by: this.by, part: 'head', x: w.head.x, y: w.head.y, dir: 0, power: k * 0.2, kind: 'impact', weapon: this.weapon, bone: k > 9 ? 'skull' : null });
        const sb = this.by.sandbox;
        sb.fx.dust(w.chest.x, Math.max(0, w.chest.y - 0.2), Math.round(6 + k), 0.8 + k * 0.05);
        sb.emit('powerImpact', { who: o, by: this.by, speed: this.top, x: w.chest.x, y: w.chest.y, loud: true });
      }
      return false;
    }
    return true;
  }
}
export function watchImpact(man, o, weapon = 'hurled', min = 9) { man.sandbox.effects.push(new ImpactWatch(man, o, weapon, min)); }

/** A blow from a power. `launch` sends them off afterwards ({ x, y } in m/s). */
export function strike(man, o, { part = 'torso', power = 2, kind = 'impact', weapon = 'superBlow', at = null, dir = null, launch = null } = {}) {
  if (!alive(o) && !o) return null;
  const w = o.wj, p = at || (part === 'head' ? w.head : part === 'legA' ? w.kneeA : w.chest);
  const d = dir ?? (sign(o.pos.x - man.pos.x) || man.facing);
  const res = o.takeHit({ by: man, part, x: p.x, y: p.y, dir: d, power, kind, weapon, bone: null });
  if (launch && !o.removed && res !== null) {
    fling(o, launch.x, launch.y);
    // whatever they are sent into, `man` sent them (and they fly past `man`, not into them)
    o.thrownBy = man;
    o.thrownAt = man.sandbox.time;
    if (Math.hypot(launch.x, launch.y) > 9) watchImpact(man, o, launch.y < -8 ? 'slam' : 'hurled');
  }
  man.sandbox.fx.burst(p.x, p.y, power);
  return res;
}

/** Sends a body off at a speed, whatever state it is in (thrown, limp, or already flying). */
export function fling(o, vx, vy) {
  if (o.removed) return;
  if (o.state === 'held') return;
  if (o.rag) { o.rag.fling(vx, vy, 0.9); o.vel.x = vx; o.vel.y = vy; return; }
  if (o.dead || !o.conscious) { o.vel.x = vx; o.vel.y = vy; o.onGround = false; return; }
  o.launch(vx, Math.max(0, vy));
  // (gone limp with it: the whole body goes, not only the part that was hit)
  if (o.rag) o.rag.fling(vx, vy, 0.9);
  else if (vy < 0) o.vel.y = vy;
}

/**
 * A shockwave out from (x, y): whoever is standing within r goes over (the
 * nearer, the harder), loose things are thrown off the ground, glass near it
 * cracks. `cone` (a direction, -1 or 1) keeps it to one side, in front.
 */
export function shockwave(man, x, y, r, power, { cone = 0, lift = 1, weapon = 'shockwave', spare = null } = {}) {
  const sb = man.sandbox;
  const hits = [];
  for (const p of sb.people) {
    if (p === man || p === spare || p.removed || (p.species && p.species.giant)) continue;
    const dx = p.pos.x - x, dy = p.pos.y - y, d = Math.hypot(dx, dy * 0.7);
    if (d > r) continue;
    if (cone && sign(dx) !== cone && Math.abs(dx) > 0.25) continue;
    const k = 1 - d / r, dir = sign(dx) || cone || man.facing;
    hits.push(p);
    if (!p.dead && (p.state === 'stand' || p.state === 'stagger' || p.state === 'stumble' || p.state === 'air')) {
      p.takeHit({ by: man, part: 'torso', x: p.wj.chest.x, y: p.wj.chest.y, dir, power: power * (0.25 + k * 0.6), kind: 'impact', weapon, bone: null });
      if (!p.removed && !p.dead && p.state !== 'held') {
        if (k > 0.25 || power > 2) p.launch(dir * (3 + 9 * k) * (power / 2.5), (2 + 5 * k) * lift);
        else p.knockDown(dir, 1 + power * k);
      }
    } else if (p.rag) p.rag.shove(p.wj.chest.x, p.wj.chest.y, dir * (2 + 8 * k) * power / 2.5, (1 + 4 * k) * lift, 0.6);
  }
  for (const t of sb.loose()) {
    const b = t.body;
    if (!b || b.invMass <= 0 || t.frozenInPlace) continue;
    const dx = b.pos.x - x, dy = b.pos.y - y, d = Math.hypot(dx, dy);
    if (d > r * 1.2 || (cone && sign(dx) !== cone)) continue;
    const k = 1 - d / (r * 1.2), dir = sign(dx) || cone || 1;
    b.applyImpulse(dir * (4 + 8 * k) * power * b.mass * 0.35, (2 + 6 * k) * lift * power * b.mass * 0.3, b.pos.x, b.pos.y + 0.05);
  }
  for (const c of sb.crates) {
    if (c.removed || c.carriedBy || c.frozenInPlace) continue;
    const b = c.body, dx = b.pos.x - x, d = Math.abs(dx);
    if (d > r * 1.2 || (cone && sign(dx) !== cone)) continue;
    const k = 1 - d / (r * 1.2), dir = sign(dx) || cone || 1;
    b.applyImpulse(dir * (4 + 7 * k) * power * b.mass * 0.3, (3 + 6 * k) * lift * power * b.mass * 0.3, b.pos.x, b.pos.y - 0.2);
  }
  sb.fx.dust(x, Math.max(0, y), Math.round(10 + power * 6), 1.2 + power * 0.4);
  sb.emit('shockwave', { who: man, x, y, r, power, loud: true });
  return hits;
}

/**
 * Straight into their hand (no reaching down for it): a weapon snatched or
 * pulled across the room. Hands full, it goes in a pocket or the holster if
 * there is room - else it is left at their feet.
 */
export function takeInHand(man, item) {
  if (!item || item.removed || item.wornBy || !alive(man) || man.cuffed) return false;
  const sb = man.sandbox;
  if (item.stuckIn && item.unstick) item.unstick();
  if (man.weapon) {
    const k = man.slotFor(item);
    if (!k) return false;
    item.wear(man);
    man.stowed[k] = item;
    sb.emit('pickup', { who: man, item, slot: k });
    return true;
  }
  item.wear(man);
  man.weapon = item;
  sb.emit('pickup', { who: man, item });
  man.notify('armed', { item });
  return true;
}

/* --------------------------- things held at a distance --------------------------- */

/**
 * Hold of a loose thing - a crate, a gun on the floor, a piece of wall - by
 * its body, the way the hand in the sky holds one: a spring to a point that
 * can be moved about, and let go of with a throw.
 */
export class Grip {
  constructor(sb, thing, x, y, { hz = 4.5, damping = 0.85, by = null } = {}) {
    this.sb = sb;
    this.thing = thing;
    this.by = by;
    thing.gripBy = by;
    this.joint = null;
    this.self = false;
    if (thing.kind === 'crate' && thing.carriedBy) thing.carriedBy.dropCarried();
    const own = thing.handGrab ? thing.handGrab(x, y) : 'body';
    if (own === false) { this.dead = true; return; }
    if (own !== 'body') { this.self = true; return; }
    const b = thing.body;
    this.joint = sb.phys.addJoint(new GrabJoint(b, x, y, { hz, damping, maxForce: 4000 * b.mass }));
  }
  get ok() { return !this.dead && !this.thing.removed && !this.thing.wornBy; }
  to(x, y, dt) {
    if (!this.ok) return;
    if (this.joint) { this.joint.target.x = x; this.joint.target.y = y; }
    else if (this.self && this.thing.handHold) this.thing.handHold(x, y, dt);
  }
  /** Let go: thrown at (vx, vy) if given, spinning a little. */
  release(vx = null, vy = null, by = null) {
    if (this.joint) { this.sb.phys.removeJoint(this.joint); this.joint = null; }
    else if (this.self && this.thing.handRelease) this.thing.handRelease();
    this.self = false;
    if (this.thing.gripBy === this.by) this.thing.gripBy = null;
    const b = this.thing.body;
    if (b && vx !== null && b.invMass > 0) { b.vel.x = vx; b.vel.y = vy; b.angVel = rand(-6, 6); }
    this.thing.thrownBy = by;
    this.thing.thrownAt = this.sb.time;
    this.dead = true;
  }
}

/** The loose things within r of (x, y) that could be picked up and moved about, nearest first. */
export function looseNear(sb, x, y, r, { max = 8, heavy = true } = {}) {
  const out = [];
  const add = (t) => {
    const b = t.body;
    if (!b || t.removed || t.frozenInPlace || t.wornBy || t.carriedBy || b.invMass <= 0 && !t.handGrab) return;
    if (!heavy && b.mass > 60) return;
    const d = Math.hypot(b.pos.x - x, b.pos.y - y);
    if (d <= r) out.push({ t, d });
  };
  for (const t of sb.loose()) if (t.kind !== 'log' || heavy) add(t);
  for (const c of sb.crates) add(c);
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, max).map((e) => e.t);
}

/* ---------------------------------- moves ---------------------------------- */

export function setPhase(m, name) { m.phase = name; m.pt = 0; }

/** Where to go for somebody: beside them, `gap` off, on the side the mover is already on. */
export function besideX(man, o, gap) { return o.pos.x - (sign(o.pos.x - man.pos.x) || -man.facing) * gap; }

/** The nearest wall face beside x, within `max`, on side `dir` (a standing slab, a stack of crates, or the edge of the world). */
export function wallBeside(sb, x, y, dir, max = 12) {
  let best = null;
  for (const w of sb.slabs) {
    if (w.removed || w.background || w.loose) continue;
    const bb = w.body.aabb();
    if (bb.minY > y + 0.2 || bb.maxY < y - 0.2) continue;
    const face = dir > 0 ? bb.minX : bb.maxX;
    const d = (face - x) * dir;
    if (d < 0.2 || d > max) continue;
    if (!best || d < best.d) best = { d, x: face, wall: w };
  }
  const edge = dir > 0 ? sb.right : sb.left;
  const de = (edge - x) * dir;
  if (de > 0.2 && de <= max && (!best || de < best.d)) best = { d: de, x: edge, wall: null };
  return best;
}

/** A line they say as they do it, now and then (not every time: nobody narrates every punch). */
export function say(man, kind, o = null, p = 0.6, loud = true) {
  if (!man.brain) return false;
  return man.brain.speak(kind, o ? { other: o.name } : {}, p, o, loud);
}

export { clamp, sign, rand, chance };
