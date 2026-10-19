/* =============================================================================
   The hand from above: whatever you drag, it drags.

   A crate, a weapon or a severed limb is held by a soft spring joint at the
   exact point you grabbed it, so it swings from there and anything too heavy
   lags behind. A stickman hangs from wherever you took hold - by the scruff
   of the neck, or by an ankle, upside down - and swings like a pendulum when
   you move them (stickman.js). Letting go while moving throws it.
   ========================================================================== */
import { GrabJoint } from '../physics/rigid.js';
import { isBlade, isGun } from './props.js';
import { clamp } from '../core/util.js';

export class Hand {
  constructor(sandbox) {
    this.sb = sandbox;
    this.holding = null;
    this.joint = null;
    this.x = 0;
    this.y = 0;
  }

  get active() { return !!this.holding; }

  grab(thing, x, y) {
    this.release();
    const sb = this.sb;
    if (thing.grabbable === false) return false;
    if (thing.kind === 'stickman') {
      // some things will not be picked up (a mod's)
      if (thing.steadfast) return false;
      thing.grab(x, y);
    } else if (thing.handGrab) {
      // a mod's thing that is not one rigid body (a ragdoll of its own): it holds itself
      if (thing.handGrab(x, y) === false) return false;
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
    this.x = clamp(x, this.sb.left - 0.5, this.sb.right + 0.5);
    this.y = clamp(y, 0.02, 30);
  }

  step() {
    const t = this.holding;
    if (!t) return;
    if (t.removed) { this.release(); return; }
    if (t.kind === 'stickman') {
      if (t.state !== 'held') { this.holding = null; return; }
      t.holdAt(this.x, this.y);
    } else if (t.handGrab) {
      t.handHold(this.x, this.y);
    } else if (this.joint) {
      this.joint.target.x = this.x;
      this.joint.target.y = this.y;
    }
  }

  release() {
    const t = this.holding;
    if (!t) return;
    this.holding = null;
    if (t.kind === 'stickman') {
      if (t.state === 'held') t.release();
    } else if (t.handGrab) {
      if (t.handRelease) t.handRelease();
      t.thrownBy = null;
      t.thrownAt = this.sb.time;
    } else {
      if (this.joint) this.sb.phys.removeJoint(this.joint);
      this.joint = null;
      // anything it hits now was thrown by nobody they can see
      t.thrownBy = null;
      t.thrownAt = this.sb.time;
    }
  }
}
