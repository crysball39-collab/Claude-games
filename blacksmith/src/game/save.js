/* =============================================================================
   The save file.

   One JSON record in the browser's storage. The game is often opened straight
   from a downloaded file on a phone, where storage can be refused outright, so
   every access is guarded and an in-memory copy at least lasts the session.
   ========================================================================== */

const KEY = 'blacksmith.save.v1';
let memory = null;

export function readSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* refused or corrupt: fall through to memory */ }
  return memory ? JSON.parse(memory) : null;
}

/** @returns {boolean} whether it reached real storage, not just memory. */
export function writeSave(data) {
  const raw = JSON.stringify(data);
  memory = raw;
  try {
    window.localStorage.setItem(KEY, raw);
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  memory = null;
  try { window.localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}

export function hasSave() { return !!readSave(); }
