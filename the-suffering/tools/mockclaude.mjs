/*
 * A stand-in for claude.ai's `window.claude.use(name)`, for tests: the live
 * room (presence through BroadcastChannels, so pages of one browser see each
 * other), the shared store (documents in localStorage, with the owner-only
 * rules the game declares), and who is viewing. Installed into a page before
 * it loads with page.addInitScript(installMockClaude, { uid, owner }).
 */
export function installMockClaude({ uid, owner = false }) {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const user = Object.freeze({
    isOwner: async () => owner, canEdit: async () => owner, can: async () => true, id: async () => uid,
    me: async () => ({ id: uid, name: '', avatarUrl: '', color: '#888888', email: null, isOwner: owner, canEdit: owner }),
    profiles: async (ids) => Object.fromEntries([].concat(ids).map((i) => [i, { id: i, name: '', avatarUrl: '', color: '#888888', email: null, isMe: i === uid, guest: false }])),
    name: async () => '', avatarUrl: async () => null, search: async () => [], email: async () => null,
  });

  /* ---- the store ---- */
  const KEY = 'mockdb:';
  const bus = new BroadcastChannel('mockdb');
  const listeners = new Set();
  const notify = () => { for (const l of listeners) l(); };
  bus.onmessage = notify;
  const read = (path) => { const v = localStorage.getItem(KEY + path); return v ? JSON.parse(v) : null; };
  const mayRead = (path) => !path.startsWith('data/users/') || path.startsWith('data/users/' + uid + '/');
  const mayWrite = (path) => (path.startsWith('config/') || path.startsWith('bans/') ? owner : mayRead(path));
  const meta = { fromCache: false, hasPendingWrites: false };
  const docSnap = (path) => {
    const d = mayRead(path) ? read(path) : null;
    return { id: path.split('/').pop(), exists: !!d, data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined), metadata: meta };
  };
  const inCollection = (path) => {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k.startsWith(KEY + path + '/')) continue;
      const rest = k.slice(KEY.length + path.length + 1);
      if (!rest.includes('/') && mayRead(path + '/' + rest)) out.push(docSnap(path + '/' + rest));
    }
    out.sort((a, b) => (a.id < b.id ? -1 : 1));
    return { docs: out, size: out.length, empty: !out.length, docChanges: () => out.map((d, i) => ({ type: 'added', doc: d, oldIndex: -1, newIndex: i })), metadata: meta };
  };
  const write = async (path, fn) => {
    await tick();
    if (!mayWrite(path)) throw { code: 'invalid_argument', message: 'not allowed at ' + path };
    fn();
    bus.postMessage(path); notify();
  };
  const watch = (snap, next) => {
    let last;
    const fire = () => { const s = snap(); const j = JSON.stringify(s.docs ? s.docs.map((d) => [d.id, d.data()]) : s.exists ? s.data() : null); if (j !== last) { last = j; next(s); } };
    listeners.add(fire); setTimeout(fire, 0);
    return () => listeners.delete(fire);
  };
  const doc = (path) => ({
    id: path.split('/').pop(), path,
    get: async () => { await tick(); return docSnap(path); },
    set: (data) => write(path, () => localStorage.setItem(KEY + path, JSON.stringify(data))),
    update: (data) => write(path, () => { const cur = read(path); if (!cur) throw { code: 'invalid_argument', message: 'no such document' }; localStorage.setItem(KEY + path, JSON.stringify({ ...cur, ...data })); }),
    delete: () => write(path, () => localStorage.removeItem(KEY + path)),
    onSnapshot: (next) => watch(() => docSnap(path), next),
    collection: (sub) => col(path + '/' + sub),
  });
  const col = (path) => {
    const q = {
      path,
      doc: (id) => doc(path + '/' + (id || Math.random().toString(36).slice(2, 12))),
      get: async () => { await tick(); return inCollection(path); },
      onSnapshot: (next) => watch(() => inCollection(path), next),
      where: () => q, orderBy: () => q, limit: () => q,
      add: async (data) => { const r = q.doc(); await r.set(data); return r; },
    };
    return q;
  };
  const db = Object.freeze({ doc, collection: col });

  /* ---- the room ---- */
  const myPeer = 'k' + Math.random().toString(36).slice(2, 12);
  const rooms = [];
  function makeRoom(name) {
    const ch = new BroadcastChannel('mockroom:' + name);
    const others = new Map();
    let mine = {}, snap = [], gone = false;
    const handlers = new Set();
    const me = () => Object.freeze({ peer: myPeer, by: uid, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze(mine), updatedAt: Date.now() });
    let meObj = me();
    const rebuild = () => { snap = Object.freeze([meObj, ...others.values()]); for (const h of handlers) h({ peers: snap, joined: [], left: [], updated: [] }); };
    const send = (m) => { if (!gone) ch.postMessage({ ...m, peer: myPeer, by: uid }); };
    ch.onmessage = (e) => {
      const m = e.data;
      if (!m || m.peer === myPeer || gone) return;
      if (m.t === 'bye') { others.delete(m.peer); rebuild(); return; }
      if (m.t === 'hello') send({ t: 'p', presence: mine });
      if (m.t === 'p' || m.t === 'hello') {
        const prev = others.get(m.peer);
        const pres = m.t === 'p' ? m.presence : prev ? prev.presence : {};
        others.set(m.peer, Object.freeze({ peer: m.peer, by: m.by, isMe: m.by === uid, sameTab: false, kind: 'viewer', guest: false, presence: Object.freeze(pres), updatedAt: Date.now() }));
        rebuild();
      }
    };
    const r = {
      name,
      emit: async () => {},
      on: () => () => {},
      presence: async (patch) => {
        await tick();
        const next = { ...mine };
        for (const k of Object.keys(patch)) { if (patch[k] === null) delete next[k]; else next[k] = patch[k]; }
        if (new TextEncoder().encode(JSON.stringify(next)).length > 4096) throw { code: 'invalid_argument', message: 'presence over 4 KiB' };
        mine = next; meObj = me(); rebuild(); send({ t: 'p', presence: mine });
      },
      peers: () => snap,
      onPeers: (fn) => { handlers.add(fn); setTimeout(() => fn({ peers: snap, joined: snap, left: [], updated: [] }), 0); return () => handlers.delete(fn); },
      connected: () => !gone,
      onConnection: (fn) => { setTimeout(() => fn(!gone), 0); return () => {}; },
      leave: async () => { send({ t: 'bye' }); gone = true; ch.close(); },
    };
    rebuild();
    send({ t: 'hello' });
    rooms.push(r);
    return r;
  }
  const lobby = makeRoom('lobby');
  const named = new Map();
  const room = Object.freeze({
    ...lobby,
    join: async (name) => { await tick(); let r = named.get(name); if (!r || !r.connected()) { r = makeRoom('n:' + name); named.set(name, r); } return r; },
    sendToClaudeSession: async () => { throw { code: 'claude_unavailable' }; },
    canSendToClaudeSession: async () => 'off',
  });
  addEventListener('pagehide', () => { for (const r of rooms) if (r.connected()) r.leave(); });

  const caps = { user, db, room };
  window.claude = Object.freeze({ use: async (name) => { await tick(); return caps[name] || null; } });
  window.__mockClaude = { uid, owner, peer: myPeer };
}
