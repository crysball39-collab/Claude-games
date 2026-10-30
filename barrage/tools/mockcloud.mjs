/* =============================================================================
   A stand-in for what the game's Claude page gives it: window.claude.use()
   answering 'db' and 'user'. The database is kept in localStorage, so a
   reload keeps it. `window.__mockFail = 'invalid_argument'` makes every
   write refused. (BLACKSMITH's verify uses the same stand-in.)
   ========================================================================== */
export function mockScript(seed = null, uid = 'u_test') {
  const fn = (seed, uid) => {
    const KEY = '__mockdb';
    let store = {};
    try { store = JSON.parse(localStorage.getItem(KEY) || 'null') || seed || {}; } catch { store = seed || {}; }
    const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {} };
    persist();
    const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
    const snap = (path) => ({ id: path.split('/').pop(), exists: path in store, data: () => clone(store[path]), metadata: { fromCache: false, hasPendingWrites: false } });
    const fail = () => { if (window.__mockFail) throw { code: window.__mockFail, message: 'mock refusal' }; };
    const db = {
      doc: (path) => ({
        id: path.split('/').pop(), path,
        get: async () => { await new Promise((r) => setTimeout(r, 5)); return snap(path); },
        set: async (data) => { fail(); store[path] = clone(data); persist(); window.__mockWrites = (window.__mockWrites || 0) + 1; },
        update: async (data) => { fail(); if (!(path in store)) throw { code: 'invalid_argument' }; Object.assign(store[path], clone(data)); persist(); },
        delete: async () => { delete store[path]; persist(); },
      }),
      collection: (path) => ({
        path,
        get: async () => {
          const n = path.split('/').length + 1;
          const docs = Object.keys(store).filter((p) => p.startsWith(path + '/') && p.split('/').length === n).map(snap);
          return { docs, size: docs.length, empty: !docs.length };
        },
      }),
    };
    const user = { id: async () => uid, me: async () => ({ id: uid }), isOwner: async () => true, canEdit: async () => true, can: async () => true };
    window.claude = { use: async (name) => (name === 'db' ? db : name === 'user' ? user : null) };
    window.__mockStore = () => clone(store);
  };
  return { content: `(${fn.toString()})(${JSON.stringify(seed)}, ${JSON.stringify(uid)});` };
}
