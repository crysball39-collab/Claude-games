/* =============================================================================
   The freeze tool: whatever is tapped stays exactly where it is, just as it
   is - in mid-air, mid-fall, mid-stride - until it is tapped again.

   A crate, a weapon, a limb, a piece of wall: it stops dead, and nothing
   moves it - not gravity, not a blow, not something landing on it - though
   it is still there to land on, and the hand can still pick it up and put
   it somewhere else, where it stays frozen. A stickman stops in whatever
   pose they were in, limp or standing; they can still see, think, feel and
   talk - they just cannot move a muscle. A wall or a tree, which
   stands where it is anyway, stays where the hand puts it rather than
   coming down onto whatever is under it.

   (Nothing to do with the cold: that is vitals.js.)
   ========================================================================== */

/** Whether the freeze tool can do anything with it. */
export function freezable(t) {
  if (!t || t.removed) return false;
  if (t.wornBy || (t.stuckIn && t.stuckIn.person)) return false;
  return t.kind === 'stickman' || !!t.body || !!t.rag || typeof t.frozenInPlace === 'boolean';
}

/** Frozen in place (on) or let go (off). Returns whether anything changed. */
export function setFrozen(sb, t, on) {
  if (!freezable(t) || !!t.frozenInPlace === on) return false;
  if (sb.hand && sb.hand.holding === t) sb.hand.release();
  t.frozenInPlace = on;
  if (t.kind === 'stickman') {
    if (on) {
      if (t.state === 'held') t.release();
      t.dropCarried();
    }
    if (t.rag) { t.rag.pinned = on; if (!on) t.rag.wake(); }
    if (!on) t.vel.x = t.vel.y = 0;
    t.notify(on ? 'frozenInPlace' : 'unfrozen', {});
    sb.emit(on ? 'freezeInPlace' : 'unfreeze', { what: t, who: t, x: t.pos.x, y: t.pos.y });
    return true;
  }
  if (t.kind === 'crate' && t.carriedBy) t.carriedBy.dropCarried();
  if (t.kind === 'wall' || t.kind === 'piece') {
    // standing, nothing moves it anyway: frozen, it stays where it is put; loose, it stops dead
    t.fit();
    if (!on) t.settle();
  } else if (t.body) {
    const b = t.body;
    if (on) {
      b.vel.x = b.vel.y = 0;
      b.angVel = 0;
      b.setKinematic(true, b.mass);
    } else if (!t.carriedBy) {
      b.setKinematic(false, b.mass);
    }
  } else if (t.rag) {
    t.rag.pinned = on;
    if (!on) t.rag.wake();
  }
  if (!on && t.settle) t.settle();
  sb.emit(on ? 'freezeInPlace' : 'unfreeze', { what: t, x: t.pos.x, y: t.pos.y });
  return true;
}

/** What the freeze tool says it did. */
export function frozenSaid(t, on) {
  const what = t.kind === 'stickman' ? t.name : `The ${(t.name || 'thing').toLowerCase()}`;
  if (on) return `${what} is frozen in place`;
  return t.kind === 'stickman' ? `${what} can move again` : `${what} is free to move again`;
}
