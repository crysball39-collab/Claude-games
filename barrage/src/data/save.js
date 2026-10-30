/* =============================================================================
   The save file.

   One JSON record in the browser's storage for the fighter played on this
   device without an account, and one for each account that has logged in
   here: a copy of its cloud save, so it loads at once and survives a lost
   connection. The game is often opened straight from a downloaded file on a
   phone, where storage can be refused outright, so every access is guarded
   and an in-memory copy at least lasts the session.

   Every write also goes to `saveHooks.onWrite`, which is how the cloud hears
   about it. (The same arrangement as BLACKSMITH's.)
   ========================================================================== */

const GUEST = 'barrage.save.v1';
const memory = new Map();
let current = GUEST;

export const saveHooks = { onWrite: null };

const keyFor = (account) => (account ? 'barrage.acct.' + account.toLowerCase() + '.v1' : GUEST);

/** Which save the game reads and writes from now on: an account's, or (null) this device's own. */
export function useAccount(name) { current = keyFor(name); }

export function readSave(key = current) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch { /* refused or corrupt: fall through to memory */ }
  const m = memory.get(key);
  return m ? JSON.parse(m) : null;
}

/** @returns {boolean} whether it reached real storage, not just memory. */
export function writeSave(data, { key = current, notify = true } = {}) {
  const raw = JSON.stringify(data);
  memory.set(key, raw);
  if (notify) saveHooks.onWrite?.(data, key);
  try {
    window.localStorage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}

export function clearSave(key = current) {
  memory.delete(key);
  try { window.localStorage.removeItem(key); } catch { /* nothing to clear */ }
}

/** The fighter played on this device without an account. */
export const readGuestSave = () => readSave(GUEST);
export const clearGuestSave = () => clearSave(GUEST);
export const forgetAccountCopy = (name) => clearSave(keyFor(name));
