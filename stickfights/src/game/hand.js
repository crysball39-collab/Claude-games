/* =============================================================================
   The hand from above: whatever you drag, it drags.

   A crate, a weapon or a severed limb is held by a soft spring joint at the
   exact point you grabbed it, so it swings from there and anything too heavy
   lags behind. A stickman hangs from wherever you took hold - by the scruff
   of the neck, or by an ankle, upside down - and swings like a pendulum when
   you move them (stickman.js). Letting go while moving throws it. A wall
   goes where it is dragged, and stands on whatever is under it when it is
   let go.

   With the world paused - or the thing frozen in place with the freeze tool -
   nothing swings and nothing is thrown: it is simply picked up and put down
   where it is wanted, just as it was.
   ========================================================================== */
import { GrabJoint } from '../physics/rigid.js';
import { isBlade, isGun } from './props.js';
import { clamp } from '../core/util.js';

/** Something moved straight by (dx, dy) from where it is: nothing about it changes but where it is. */
export function moveBy(t, dx, dy) {
  if (!t || t.removed || (t.stuckIn && t.stuckIn.person) || t.wornBy) return;
  if (t.shift) { t.shift(dx, dy); return; }
  if (t.body) {
    t.body.pos.x += dx;
    t.body.pos.y += dy;
    if (!t.frozenInPlace) { t.body.vel.x = t.body.vel.y = 0; t.body.angVel = 0; }
    return;
  }
  if (t.rag) {
    for (const q of t.rag.p) { q.x += dx; q.y += dy; q.px += dx; q.py += dy; }
    return;
  }
  if (t.pos) {
    t.pos.x += dx;
    t.pos.y += dy;
    if (t.base) { t.base.x += dx; t.base.y += dy; }
  }
}

export class Hand {
  constructor(sandbox) {
    this.sb = sandbox;
    this.holding = null;
    this.joint = null;
    this.still = false;      // held still: picked up and put down, not swung (paused, or frozen in place)
    this.x = 0;
    this.y = 0;
  }

  get active() { return !!this.holding; }

  grab(thing, x, y) {
    this.release();
    const sb = this.sb;
    // with the world paused, or the thing frozen in place: it goes where it is put, and that is all
    if (sb.paused || thing.frozenInPlace) {
      if (thing.wornBy || (thing.stuckIn && thing.stuckIn.person)) return false;
      this.holding = thing;
      this.still = true;
      this.x = x;
      this.y = y;
      return true;
    }
    if (thing.grabbable === false) return false;
    // a thing that is not one rigid body (a ragdoll of its own), or a wall standing: it holds itself
    // (or says it is a body like any other after all: a piece of wall, lying loose)
    const own = thing.kind !== 'stickman' && thing.handGrab ? thing.handGrab(x, y) : 'body';
    if (own === false) return false;
    if (thing.kind === 'stickman') {
      // some things will not be picked up (a mod's)
      if (thing.steadfast) return false;
      thing.grab(x, y);
    } else if (own !== 'body') {
      // (holding itself)
    } else {
      if (thing.kind === 'crate' && thing.carriedBy) thing.carriedBy.dropCarried();
      // something in someone's hand stays there
      if (thing.wornBy) return false;
      if (isBlade(thing.kind) && thing.stuckIn) {
        // pulled out of whatever it was stuck in, by the handle, at the angle it was in at
        const st = thing.stuckIn;
        if (st.person) st.person.pullKnife(st.entry, 'hand');
        else {
          const b = thing.body, rot = b.rot;
          thing.drop(b.pos.x, b.pos.y, 0, 0);
          b.rot = rot;
          b.angVel = 0;
        }
      }
      const b = thing.body;
      // the light, long things are held a little stiffer, so they point where they are pulled
      const stiff = isBlade(thing.kind) || isGun(thing.kind);
      this.joint = sb.phys.addJoint(new GrabJoint(b, x, y, { hz: stiff ? 7 : 5, damping: 0.8, maxForce: 2500 * b.mass }));
    }
    this.holding = thing;
    this.x = x;
    this.y = y;
    return true;
  }

  move(x, y) {
    const nx = clamp(x, this.sb.left - 0.5, this.sb.right + 0.5);
    const ny = clamp(y, 0.02, 30);
    if (this.still && this.holding) moveBy(this.holding, nx - this.x, ny - this.y);
    this.x = nx;
    this.y = ny;
  }

  step(dt) {
    const t = this.holding;
    if (!t) return;
    if (t.removed) { this.release(); return; }
    if (this.still) return;
    if (t.kind === 'stickman') {
      if (t.state !== 'held') { this.holding = null; return; }
      t.holdAt(this.x, this.y);
    } else if (this.joint) {
      this.joint.target.x = this.x;
      this.joint.target.y = this.y;
    } else if (t.handGrab) {
      t.handHold(this.x, this.y, dt);
    }
  }

  release() {
    const t = this.holding;
    if (!t) return;
    this.holding = null;
    if (this.still) {
      this.still = false;
      // a wall put down stands on whatever is under it (unless it is frozen in place)
      if (t.settle) t.settle();
      return;
    }
    if (t.kind === 'stickman') {
      if (t.state === 'held') t.release();
    } else if (this.joint) {
      this.sb.phys.removeJoint(this.joint);
      this.joint = null;
      // anything it hits now was thrown by nobody they can see
      t.thrownBy = null;
      t.thrownAt = this.sb.time;
    } else if (t.handGrab) {
      if (t.handRelease) t.handRelease();
      t.thrownBy = null;
      t.thrownAt = this.sb.time;
    }
  }
}
