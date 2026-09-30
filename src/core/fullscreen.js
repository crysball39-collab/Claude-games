/* =============================================================================
   Full screen.

   Worth its own file because no two browsers agree. Chrome and Firefox have
   the standard API, older Safari and a lot of Android webviews only have the
   webkit- prefixed one, and iPhone Safari has neither: there, nothing but a
   <video> can go full screen, so the honest thing is to say so rather than
   leave a button that does nothing.
   ========================================================================== */

const EL = typeof document !== 'undefined' ? document.documentElement : null;

/** True when this browser can put the page full screen at all. */
export function canFullscreen() {
  if (!EL) return false;
  if (document.fullscreenEnabled === false && !EL.webkitRequestFullscreen) return false;
  return !!(EL.requestFullscreen || EL.webkitRequestFullscreen || EL.msRequestFullscreen);
}

/** The element currently filling the screen, or null. */
export function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement
    || document.msFullscreenElement || null;
}

export function isFullscreen() { return !!fullscreenElement(); }

/**
 * Goes full screen, and locks to landscape on the phones that allow it.
 * Must be called from a tap or a click: browsers refuse it otherwise.
 * @returns {Promise<boolean>} whether we ended up full screen.
 */
export async function enterFullscreen() {
  if (!EL || isFullscreen()) return isFullscreen();
  const go = EL.requestFullscreen || EL.webkitRequestFullscreen || EL.msRequestFullscreen;
  if (!go) return false;
  try {
    await go.call(EL, { navigationUI: 'hide' });
  } catch {
    try { await go.call(EL); } catch { return false; }
  }
  /* A rejected orientation lock is normal - desktop has nothing to lock, and
     iOS refuses outright - so it must never take the full screen down with it. */
  try { await screen.orientation?.lock?.('landscape'); } catch { /* not allowed here */ }
  return isFullscreen();
}

export async function exitFullscreen() {
  if (!isFullscreen()) return false;
  try { screen.orientation?.unlock?.(); } catch { /* nothing to unlock */ }
  const out = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
  if (!out) return false;
  try { await out.call(document); } catch { return false; }
  return true;
}

export function toggleFullscreen() {
  return isFullscreen() ? exitFullscreen() : enterFullscreen();
}

/** Calls back with true/false whenever the browser enters or leaves. */
export function onFullscreenChange(fn) {
  const h = () => fn(isFullscreen());
  document.addEventListener('fullscreenchange', h);
  document.addEventListener('webkitfullscreenchange', h);
  document.addEventListener('MSFullscreenChange', h);
  return h;
}
