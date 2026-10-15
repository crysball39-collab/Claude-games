/* =============================================================================
   The hand from above: whatever you drag, it drags.

   A crate or a set of brass knuckles is held by a soft spring joint at the
   exact point you grabbed it, so it swings from there and anything too heavy
   lags behind. A stickman hangs from wherever you took hold - by the scruff
   of the neck, or by an ankle, upside down - and swings like a pendulum when
   you move them (stickman.js). Letting go while moving throws it.
   ========================================================================== */
import { GrabJoint } from '../physics/rigid.js';
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
    if (thing.kind === 'stickman') {
      thing.grab(x, y);
    } else {
      if (thing.kind === 'crate' && thing.carriedBy) thing.carriedBy.dropCarried();
      if (thing.kind === 'knuckles' && thing.wornBy) return false;
      const b = thing.body;
      this.joint = sb.phys.addJoint(new GrabJoint(b, x, y, { hz: 5, damping: 0.8, maxForce: 2500 * b.mass }));
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
    } else {
      if (this.joint) this.sb.phys.removeJoint(this.joint);
      this.joint = null;
      // anything it hits now was thrown by nobody they can see
      t.thrownBy = null;
      t.thrownAt = this.sb.time;
    }
  }
}
