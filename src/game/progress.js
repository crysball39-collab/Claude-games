/* =============================================================================
   What you have earned, kept between visits.

   Stored in the browser. The game is often opened straight from a file on a
   phone, where storage can be refused outright, so every access is guarded and
   there is an in-memory copy that at least lasts for the session.
   ========================================================================== */

const KEY = 'gorebox.progress.v1';
let memory = null;

function read() {
  if (memory) return memory;
  try {
    memory = JSON.parse(window.localStorage.getItem(KEY) || '{}') || {};
  } catch {
    memory = {};
  }
  return memory;
}

function write() {
  try { window.localStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* kept in memory */ }
}

export function isUnlocked(name) { return !!read()[name]; }

/** @returns {boolean} true if this was the first time. */
export function unlock(name) {
  const p = read();
  if (p[name]) return false;
  p[name] = true;
  write();
  return true;
}
