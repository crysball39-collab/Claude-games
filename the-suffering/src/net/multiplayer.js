/* =============================================================================
   Multiplayer: real people, on servers that any of them can host.

   It runs over the claude.ai page's live room (the `room` capability): the
   lobby is everyone with the game open right now, and a server is a named
   room inside it. The city is built the same way on every screen; what moves
   in it is shared like this:

     players    each player's own game decides everything about them, and
                sends where every part of their body is, fifteen times a
                second, with what they hold and wear and how they are; on
                everyone else's screen a stand-in follows it exactly
     hits       a blow, a round, a flame or a power that lands on a stand-in
                is sent to the player it stands in for, and their own game
                takes it; what it does to them comes back with their body
     cars       a car somebody drives goes with them
     talk       what anybody says, and who killed whom

   Not shared, for now: the city's own people, the police, the traffic, and
   things spawned or lying about. Each player has their own.

   Everything goes out in each player's presence, which anyone in the room
   may set (sending events needs a sharing level that not every viewer has),
   so everyone can play. Nothing another page sends is trusted with any
   authority: an admin command counts only from the admin's own platform id,
   which the page's owner writes into the shared store and nobody else can,
   and bans live in the store where only the owner can write them.

   Opened anywhere but claude.ai there is no room to play in, and none of
   this does anything; single player is the whole game there.
   ========================================================================== */
import { use } from './platform.js';
import { encodePose, decodePose, poseBetween } from './pose.js';
import { Human, ST } from '../human/human.js';
import { P, PART_COUNT } from '../human/rig.js';
import { playerLook } from '../human/looks.js';
import { Car } from '../world/car.js';
import { WEAPONS } from '../combat/weapons.js';
import { ABILITY } from '../combat/powers.js';
import { groundHeight } from '../world/city.js';
import { clamp } from '../core/util.js';

const V = 1;                 // what a presence object means; changes when its shape does
const SEND = 1 / 15;         // seconds between sends of your state
const DELAY = 0.12;          // another player is drawn this far behind their newest pose, so there is always one either side
const LIFE = 3;              // seconds an event stays in your presence for others to see
export const MAX_PLAYERS = 16;
const ROOM = 'ts-';          // named rooms for servers start with this
const enc = new TextEncoder();
const bytes = (s) => enc.encode(s).length;
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
// other people's words: no control or invisible characters
const unseen = (c) => c < 32 || (c >= 0x7f && c <= 0x9f) || c === 0xad || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2060 && c <= 0x206f) || c === 0xfeff;
const strip = (s) => { let o = ''; for (const ch of String(s || '')) if (!unseen(ch.codePointAt(0))) o += ch; return o; };
export const cleanName = (s) => strip(s).trim().slice(0, 16) || 'Player';
const cleanText = (s, n) => strip(s).replace(/\s+/g, ' ').trim().slice(0, n);
const TYPES = new Set(['blunt', 'cut', 'stab', 'bullet', 'crush', 'burn', 'needle']);
const CARS = new Set(['sedan', 'car', 'police', 'van', 'taxi']);
const ARMOUR = new Set(['light', 'medium', 'swat']);
const word = (s) => (typeof s === 'string' && /^[a-zA-Z0-9]{1,20}$/.test(s) ? s : null);
const num = (v, a, b, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, a, b) : d);
const vec = (a, lim) => (Array.isArray(a) && a.length === 3 && a.every((v) => typeof v === 'number' && Number.isFinite(v)) ? a.map((v) => clamp(v, -lim, lim)) : null);
/** What the code that hit a stand-in gets back: something like a report, so it carries on as it would. */
const FAKE_REP = Object.freeze({ pain: 8, bones: Object.freeze([]), wound: null, through: false, stopped: false, severed: -1, burst: false });
const _a = [0, 0, 0], _b = [0, 0, 0];

export class Multiplayer {
  constructor(game, auth) {
    this.g = game; this.auth = auth;
    this.room = null; this.db = null; this.uid = null;
    this.server = null;            // the server you are on: { id, name, max, room, jt }
    this.remotes = new Map();      // peer -> another player on it
    this.out = []; this.seq = 0;   // your events, recent ones, in your presence
    this.sendT = 0; this.lobbyT = 0; this.lobbyJson = ''; this.pkJson = '';
    this.you = { kills: 0, deaths: 0, ping: 0 };
    this.respawns = 0; this._player = null;
    this.hostPeer = null; this.myPeer = null; this.count = 0;
    this.adminId = null;           // the admin's platform id, as the owner put it in the store
    this.bans = new Map();         // platform id -> { until, note, at, name }
    this.pings = new Map();        // a hosting peer -> your round trip to them, ms
    this.ping = { n: 0, at: -1e9, got: true };
    this.lping = { n: 0, at: -1e9, seen: new Set() };
    this.kickedFrom = new Map();   // server id -> until (ms): you were kicked, and may not come straight back
    this.adminSet = null;          // what the admin last set on you, kept through a respawn
    this.lastWound = 0;
    this.stats = { hitsOut: 0, hitsIn: 0, cmdsOut: 0, cmdsIn: 0, refused: 0, joins: 0, hosts: 0 };
    this.onFeed = null; this.onChange = null; this.onKicked = null;
    this.ready = this._init();
  }

  async _init() {
    const [room, db, user] = await Promise.all([use('room'), use('db'), use('user')]);
    this.room = room; this.db = db;
    if (user) { try { this.uid = await user.id(); } catch { this.uid = null; } }
    if (room) {
      room.onPeers(() => this.onChange?.(), () => { this.room = null; this.onChange?.(); });
    }
    if (db) {
      // who the admin is: written by the page's owner, and only they can write it
      db.doc('config/admin').onSnapshot((s) => {
        const d = s.exists ? s.data() : null;
        this.adminId = d && typeof d.id === 'string' ? d.id : null;
        this.claimAdmin();
        this.onChange?.();
      }, () => {});
      db.collection('bans').onSnapshot((q) => {
        this.bans.clear();
        for (const d of q.docs) { const v = d.data(); if (v && typeof v === 'object') this.bans.set(d.id, v); }
        this._bansChanged();
      }, () => {});
    }
    this.onChange?.();
  }

  /* ---------------------------------- asking ---------------------------------- */

  /** There is a room to play in: the game is open on claude.ai. */
  get available() { return !!this.room; }
  get on() { return !!this.server; }
  get isHost() { return !!this.server && this.hostPeer === this.myPeer; }
  get hostName() { if (!this.server) return ''; if (this.isHost) return this._name(); const r = this.remotes.get(this.hostPeer); return r ? r.name : ''; }
  /**
   * Is this peer the admin? The platform's own word for who sent it (the owner's id, written where only the owner can write),
   * and signed in to the admin's account on that page: the owner's other pages, under other accounts, are not.
   */
  isAdminPeer(p) { return !!(p && p.by && this.adminId && p.by === this.adminId && p.presence && p.presence.ad === 1); }
  /** The admin's commands from this page will be believed by everyone else's. */
  get adminVerified() { return !!(this.auth.admin && this.uid && this.adminId === this.uid); }
  _name() { return cleanName(this.auth.name || this.guestName || (this.guestName = 'Guest' + ((Math.random() * 9000) | 0) + 1000)); }
  _seed() { return this.auth.seed || this.guestSeed || (this.guestSeed = ((Math.random() * 2147483000) | 0) + 1); }
  _me(room) { const p = room.peers().find((x) => x.isMe && x.sameTab); return p ? p.peer : null; }
  _activeBan(id) { const b = id && this.bans.get(id); return b && (!b.until || b.until > Date.now()) ? b : null; }
  /** You are banned: the ban, or null. */
  get banned() { return this._activeBan(this.uid); }
  banText(b = this.banned) {
    if (!b) return '';
    return 'You are banned from multiplayer' + (b.until ? ' until ' + new Date(b.until).toLocaleString() : ', for good') + '.' + (b.note ? ' Note from the admin: "' + cleanText(b.note, 200) + '"' : '');
  }

  /** The servers being hosted right now, from the lobby. */
  get servers() {
    if (!this.room) return [];
    const out = [], ids = new Set();
    for (const p of this.room.peers()) {
      const pr = p.presence, s = pr && pr.srv;
      if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !/^[a-z0-9]{4,16}$/.test(s.id) || ids.has(s.id)) continue;
      if (this._activeBan(p.by)) continue;
      ids.add(s.id);
      out.push({ id: s.id, name: cleanText(s.name, 40) || 'Server', max: num(s.max, 2, MAX_PLAYERS, 8) | 0, n: num(s.n, 1, 99, 1) | 0, host: cleanName(pr.nm), hostPeer: p.peer, ping: p.sameTab ? 0 : this.pings.get(p.peer) ?? null, mine: p.sameTab, admin: this.isAdminPeer(p) });
    }
    return out.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }

  /** Everyone on your server, you first. */
  get players() {
    if (!this.server) return [];
    const me = { peer: this.myPeer, you: true, name: this._name(), kills: this.you.kills, deaths: this.you.deaths, ping: this.isHost ? 0 : this.you.ping, host: this.isHost, admin: this.auth.admin, by: this.uid, h: this.g.player };
    const others = [...this.remotes.values()].map((r) => ({ peer: r.peer, you: false, name: r.name, kills: r.kills, deaths: r.deaths, ping: r.ms, host: r.peer === this.hostPeer, admin: r.admin, by: r.by, h: r.h }));
    return [me, ...others];
  }

  /* ------------------------------- hosting, joining ------------------------------- */

  async host({ name = '', max = 8 } = {}) {
    if (!this.room) return { error: 'Multiplayer needs the game open on claude.ai.' };
    if (this.banned) return { error: this.banText() };
    const id = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
    this.stats.hosts++;
    return this._enter({ id, name: cleanText(name, 40) || this._name() + "'s server", max: clamp(Math.round(max) || 8, 2, MAX_PLAYERS) });
  }

  async join(id) {
    if (!this.room) return { error: 'Multiplayer needs the game open on claude.ai.' };
    if (this.banned) return { error: this.banText() };
    const s = this.servers.find((x) => x.id === id);
    if (!s) return { error: 'That server has closed.' };
    if (s.mine) return { error: 'That is your own server.' };
    if (s.n >= s.max) return { error: s.name + ' is full.' };
    const k = this.kickedFrom.get(id);
    if (k && k > Date.now()) return { error: 'You were kicked from ' + s.name + '. You can go back in a minute.' };
    this.stats.joins++;
    return this._enter({ id, name: s.name, max: s.max });
  }

  async _enter(s) {
    if (this.server) await this.leave(true);
    let room;
    try { room = await this.room.join(ROOM + s.id); } catch (e) { return { error: 'Could not get onto the server (' + ((e && e.code) || 'no answer') + ').' }; }
    this.server = { ...s, room, jt: Date.now() + Math.random() };
    this.remotes.clear(); this.out = []; this.you.kills = 0; this.you.deaths = 0; this.you.ping = 0;
    this.ping.at = -1e9; this.hostPeer = null; this.myPeer = null; this.count = 1;
    room.onPeers(() => this.onChange?.(), () => { if (this.server && this.server.room === room) { this.leave(true); this.g.ui?.toast('The connection to the server was lost.'); } });
    // a clean start: at the park, as yourself
    const g = this.g;
    g.lookSeed = this._seed(); g.playerName = this._name();
    g.respawn(true);
    this._player = g.player; this.reapply();
    this.sendT = 0; this.lobbyT = 0;
    this._feed('sys', `${this._name()} joined ${this.server.name}`);
    this.onChange?.();
    return { ok: true };
  }

  async leave(quiet = false) {
    const s = this.server;
    if (!s) return;
    this.server = null;
    for (const r of this.remotes.values()) this._drop(r);
    this.remotes.clear(); this.out = []; this.hostPeer = null;
    try { await s.room.leave(); } catch { /* gone already */ }
    this.lobbyT = 0;
    if (!quiet) this.g.ui?.toast('Left ' + s.name + '.');
    this.onChange?.();
  }

  /* ------------------------------------ frame ------------------------------------ */

  update(dt) {
    if (!this.room) return;
    if (this.server) this._serverTick(dt);
    this._lobbyTick(dt);
  }

  _lobbyTick(dt) {
    const room = this.room, now = performance.now(), me = this._me(room);
    // a ping out to every host every two seconds, and their answers
    if (now - this.lping.at > 2000) { this.lping.n = 1 + ((Math.random() * 1e9) | 0); this.lping.at = now; this.lping.seen.clear(); this.lobbyT = 0; }
    const peers = room.peers();
    for (const p of peers) {
      const pr = p.presence, pk = pr && pr.pk;
      if (!pr || !pr.srv || !pk || typeof pk !== 'object' || !me || this.lping.seen.has(p.peer)) continue;
      if (pk[me] === this.lping.n) { this.lping.seen.add(p.peer); this.pings.set(p.peer, Math.round(now - this.lping.at)); }
    }
    // your own presence in the lobby: who you are, the server you host, and answers to others' pings
    const host = this.server && this.isHost;
    const pres = { v: V, nm: this._name(), ad: this.auth.admin ? 1 : 0, pg: this.lping.n, srv: host ? { id: this.server.id, name: this.server.name, max: this.server.max, n: this.count } : null, pk: null };
    if (host) {
      const pk = {}; let n = 0;
      for (const p of peers) { const pg = p.presence && p.presence.pg; if (!p.sameTab && typeof pg === 'number' && n++ < 48) pk[p.peer] = pg; }
      pres.pk = pk;
    }
    this.lobbyT -= dt;
    const json = JSON.stringify(pres);
    if (json !== this.lobbyJson && this.lobbyT <= 0) { this.lobbyJson = json; this.lobbyT = host ? 0.06 : 0.2; room.presence(pres).catch(() => {}); }
  }

  _serverTick(dt) {
    const s = this.server, g = this.g, room = s.room;
    const peers = room.peers();
    this.myPeer = this._me(room);
    // the host is whoever has been on the server longest; the rest arrived after
    const order = [];
    for (const p of peers) {
      const jt = p.sameTab ? s.jt : p.presence && p.presence.v === V && typeof p.presence.jt === 'number' ? p.presence.jt : null;
      if (jt != null && !(p.by && !p.sameTab && this._activeBan(p.by))) order.push([jt, p.peer]);
    }
    order.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
    this.hostPeer = order.length ? order[0][1] : this.myPeer;
    this.count = order.length;
    // more than it holds: the last to arrive goes
    const rank = order.findIndex((o) => o[1] === this.myPeer);
    if (rank >= s.max) { this.leave(true); g.ui?.toast(s.name + ' is full.'); return; }
    // everybody else
    const here = new Set();
    for (const p of peers) {
      if (this.server !== s) return;            // kicked or banned just now, by what one of them sent
      if (p.sameTab) continue;
      here.add(p.peer);
      const pr = p.presence;
      if (!pr || pr.v !== V || typeof pr.po !== 'string' || !Array.isArray(pr.st)) continue;
      if (p.by && this._activeBan(p.by)) { if (this.remotes.has(p.peer)) this._remove(p.peer, ' was banned'); continue; }
      let r = this.remotes.get(p.peer);
      if (!r) { r = this._add(p, pr); if (!r) continue; this._feed('sys', `${r.name} joined`); this.onChange?.(); }
      r.by = p.by; r.admin = this.isAdminPeer(p);
      if (pr !== r.last) { r.last = pr; this._recv(r, p, pr); }
    }
    if (this.server !== s) return;
    for (const peer of [...this.remotes.keys()]) if (!here.has(peer)) this._remove(peer, ' left');
    for (const r of this.remotes.values()) this._drive(r, dt);
    // your round trip to the host
    if (this.isHost) this.you.ping = 0;
    else {
      const now = performance.now();
      if (now - this.ping.at > 2000) { this.ping.n = 1 + ((Math.random() * 1e9) | 0); this.ping.at = now; this.ping.got = false; this.sendT = 0; }
      const hp = peers.find((p) => p.peer === this.hostPeer), pk = hp && hp.presence && hp.presence.pk;
      if (!this.ping.got && pk && typeof pk === 'object' && this.myPeer && pk[this.myPeer] === this.ping.n) { this.ping.got = true; this.you.ping = Math.round(now - this.ping.at); }
    }
    // the host answers pings at once
    if (this.isHost) { const pk = JSON.stringify(this._pongs(peers)); if (pk !== this.pkJson) { this.pkJson = pk; this.sendT = 0; } }
    this._flushChill(dt);
    // a new body (you died and got up again): everyone is told, and what the admin set still holds
    if (g.player !== this._player) { this._player = g.player; this.respawns++; this.reapply(); }
    if ((this.sendT -= dt) <= 0 && this.server === s) { this.sendT = SEND; this._send(peers); }
  }

  _pongs(peers) {
    const pk = {};
    let n = 0;
    for (const p of peers) { const pg = p.presence && p.presence.pg; if (!p.sameTab && typeof pg === 'number' && n++ < 24) pk[p.peer] = pg; }
    return pk;
  }

  /** Your state, for everyone else on the server. */
  _send(peers = this.server.room.peers()) {
    const s = this.server, g = this.g, p = g.player, W = g.weapons, now = g.time;
    this.out = this.out.filter((e) => now - e.t < LIFE).slice(-14);
    const car = p.car;
    const pres = {
      v: V, nm: this._name(), sd: this._seed(), jt: s.jt, rs: this.respawns,
      st: [Math.round(p.x * 100), Math.round(p.y * 100), Math.round(p.z * 100), Math.round(p.yaw * 1000), p.state, Math.round((p.speed || 0) * 100)],
      po: encodePose(p),
      w: p.weapon ? p.weapon.type : null,
      kt: W.inventory.filter((it) => it !== p.weapon).map((it) => it.type).slice(0, 6),
      ar: [p.vest ? p.vest.kind : '', p.helmet ? p.helmet.kind : ''],
      sc: r3(p.scale), fm: g.powers && g.powers.form ? g.powers.form : '',
      gn: p.gone.reduce((m, v, i) => (v ? m | (1 << i) : m), 0),
      al: p.h.alive ? 1 : 0, cs: p.h.conscious ? 1 : 0, hp: Math.round(p.h.condition.pct), fi: p.fire && p.burning > 0.1 ? 1 : 0,
      car: car ? [car.kind, car.paint, r2(car.x), r2(car.y), r2(car.z), r3(car.yaw), r3(car.pitch), r3(car.roll), r2(car.steer || 0), r2(car.spin || 0)] : null,
      k: this.you.kills, d: this.you.deaths, ms: this.you.ping, ad: this.auth.admin ? 1 : 0,
      pg: this.isHost ? null : this.ping.n, pk: this.isHost ? this._pongs(peers) : null,
      ev: this.out.map((e) => e.e),
    };
    // within the platform's 4 KiB: the oldest events give way first
    let json = JSON.stringify(pres);
    while (bytes(json) > 3900 && pres.ev.length) { pres.ev.shift(); this.out.shift(); json = JSON.stringify(pres); }
    s.room.presence(pres).catch(() => {});
  }

  _emit(kind, ...args) {
    if (!this.server) return;
    this.out.push({ t: this.g.time, e: [++this.seq, kind, ...args] });
    this.sendT = 0;
  }

  _feed(kind, a, w = '', v = '', o = {}) { this.onFeed?.({ kind, a, w, v, ...o }); }

  /* ------------------------------- the other players ------------------------------- */

  _add(p, pr) {
    const r = { peer: p.peer, by: p.by, name: cleanName(pr.nm), seed: num(pr.sd, 1, 2147483647, 1) | 0, h: null, snaps: [], last: null,
      lastSeq: 0, kitKey: null, armKey: null, form: '', gone: 0, rs: pr.rs | 0, kills: 0, deaths: 0, ms: 0, admin: false, car: null, carSnaps: [] };
    // what they did before you arrived is not news
    if (Array.isArray(pr.ev)) for (const e of pr.ev) if (Array.isArray(e) && typeof e[0] === 'number') r.lastSeq = Math.max(r.lastSeq, e[0]);
    this._body(r, pr);
    this.remotes.set(p.peer, r);
    return r;
  }

  /** A stand-in for them: a person with their look, no mind of their own, moved by what they send. */
  _body(r, pr) {
    const g = this.g, st = pr.st;
    const x = num(st[0], -9000, 9000) / 100, z = num(st[2], -9000, 9000) / 100, yaw = num(st[3], -7000, 7000) / 1000;
    const h = new Human(g, playerLook(r.seed, r.name), x, z, yaw);
    h.puppet = true; h.remote = r; h.h.god = true;
    g.humans.push(h);
    r.h = h; r.snaps.length = 0; r.kitKey = null; r.armKey = null; r.form = ''; r.gone = 0;
    return h;
  }

  _drop(r) {
    const g = this.g;
    if (r.car) { r.car.dispose(); r.car = null; }
    if (r.h && !r.h.removed) { g.powers?.dress?.(r.h, null); g.removeHuman(r.h); }
    r.h = null;
  }

  _remove(peer, why) {
    const r = this.remotes.get(peer);
    if (!r) return;
    this._drop(r);
    this.remotes.delete(peer);
    if (why) this._feed('sys', r.name + why);
    this.onChange?.();
  }

  /** A fresh presence from them. */
  _recv(r, p, pr) {
    const g = this.g;
    r.name = cleanName(pr.nm); r.kills = num(pr.k, 0, 1e5) | 0; r.deaths = num(pr.d, 0, 1e5) | 0; r.ms = num(pr.ms, 0, 99999) | 0;
    // a new body: they died and came back
    if ((pr.rs | 0) !== r.rs) { r.rs = pr.rs | 0; this._drop(r); this._body(r, pr); }
    const h = r.h;
    const pose = decodePose(pr.po);
    if (pose) { r.snaps.push({ t: g.time, pose, st: pr.st }); if (r.snaps.length > 5) r.snaps.shift(); }
    // what they hold and carry, and what they wear
    const kitKey = String(word(pr.w) || '') + '|' + (Array.isArray(pr.kt) ? pr.kt.map(word).join(',') : '');
    if (kitKey !== r.kitKey) { r.kitKey = kitKey; this._kit(r, pr); }
    const ar = Array.isArray(pr.ar) ? pr.ar : [];
    const armKey = (ARMOUR.has(ar[0]) ? ar[0] : '') + '|' + (ARMOUR.has(ar[1]) ? ar[1] : '');
    if (armKey !== r.armKey) {
      r.armKey = armKey;
      h.removeVest(); h.removeHelmet();
      if (ARMOUR.has(ar[0])) h.wearVest(ar[0]);
      if (ARMOUR.has(ar[1])) h.wearHelmet(ar[1]);
    }
    // a form: the hybrid's size and suit, or the leopard
    const sc = num(pr.sc, 0.5, 2, h.scale);
    if (Math.abs(sc - h.scale) > 0.004) h.setScale(sc);
    const fm = pr.fm === 'hybrid' || pr.fm === 'leopard' ? pr.fm : '';
    if (fm !== r.form) { r.form = fm; g.powers?.dress?.(h, fm || null); }
    // parts they no longer have
    const gone = (pr.gn | 0) & ((1 << PART_COUNT) - 1);
    if (gone !== r.gone) this._gone(r, gone);
    h.h.alive = pr.al !== 0; h.h.conscious = h.h.alive && pr.cs !== 0;
    h.remoteHp = num(pr.hp, 0, 100);
    h.state = num(Array.isArray(pr.st) ? pr.st[4] : 0, 0, 3) | 0;
    this._carOf(r, pr.car);
    if (Array.isArray(pr.ev)) for (const e of pr.ev.slice(0, 16)) { if (!this.server) return; this._event(r, p, e); }
  }

  _kit(r, pr) {
    const W = this.g.weapons, h = r.h;
    for (const it of (h.kit || []).slice()) W.remove(it);
    h.kit = []; h.weapon = null;
    const ok = (t) => t && WEAPONS[t] && !WEAPONS[t].wear && t !== 'fists';
    if (Array.isArray(pr.kt)) for (const t of pr.kt.slice(0, 6).map(word)) if (ok(t)) W.give(h, t, false);
    const w = word(pr.w);
    if (ok(w)) W.give(h, w, true);
  }

  _gone(r, mask) {
    const g = this.g, h = r.h, bx = g.boxes;
    for (let i = 0; i < PART_COUNT; i++) {
      if (!(mask & (1 << i)) || h.gone[i]) continue;
      h.gone[i] = true; h.attached[i] = false;
      bx.hide(h.inst[i]);
      if (i === P.HAND_L || i === P.HAND_R) for (const f of h.fingers[i === P.HAND_L ? 0 : 1]) bx.hide(f);
      const b = h.bodies[i];
      g.gore.burst(b.px, b.py, b.pz, 0, 1, 0, 14, 2.4);
    }
    r.gone = mask;
  }

  _carOf(r, c) {
    const g = this.g;
    if (!Array.isArray(c) || c.length < 6) { if (r.car) { r.car.dispose(); r.car = null; } r.carSnaps.length = 0; return; }
    const kind = CARS.has(c[0]) ? c[0] : 'sedan';
    if (!r.car || r.car.kind !== kind) {
      if (r.car) r.car.dispose();
      r.car = new Car(g, kind, num(c[1], 0, 0xffffff, 0xb8312b) | 0);
      r.car.mode = 'remote';
      r.carSnaps.length = 0;
    }
    r.carSnaps.push({ t: g.time, x: num(c[2], -400, 400), y: num(c[3], -50, 50), z: num(c[4], -400, 400), yaw: num(c[5], -50, 50), pitch: num(c[6], -4, 4), roll: num(c[7], -4, 4), steer: num(c[8], -2, 2), spin: num(c[9], -1e4, 1e4) });
    if (r.carSnaps.length > 5) r.carSnaps.shift();
  }

  /** Puts their stand-in (and their car) where they were a moment ago, between the two poses either side. */
  _drive(r, dt) {
    const h = r.h, g = this.g;
    if (!h || h.removed || !r.snaps.length) return;
    const t = g.time - DELAY, S = r.snaps;
    let a = S[0], b = S[0];
    for (let i = S.length - 1; i >= 0; i--) if (S[i].t <= t) { a = S[i]; b = S[i + 1] || S[i]; break; }
    const span = b.t - a.t;
    let k = span > 1e-4 ? clamp((t - a.t) / span, 0, 1) : 1;
    // too far to have walked: they were put somewhere
    if (Math.hypot(b.pose[0] - a.pose[0], b.pose[2] - a.pose[2]) > 4) k = 1;
    poseBetween(h, a.pose, b.pose, k, dt);
    const pel = h.bodies[P.PELVIS];
    h.vx = pel.vx; h.vz = pel.vz; h.x = pel.px; h.z = pel.pz; h.y = groundHeight(h.x, h.z);
    const st = (k < 0.5 ? a : b).st;
    h.yaw = num(st[3], -7000, 7000) / 1000; h.speed = num(st[5], 0, 5000) / 100;
    if (r.car && r.carSnaps.length) {
      const C = r.carSnaps;
      let ca = C[0], cb = C[0];
      for (let i = C.length - 1; i >= 0; i--) if (C[i].t <= t) { ca = C[i]; cb = C[i + 1] || C[i]; break; }
      const cs = cb.t - ca.t, ck = cs > 1e-4 ? clamp((t - ca.t) / cs, 0, 1) : 1;
      const car = r.car, lerp = (u, v) => u + (v - u) * ck;
      let dy = cb.yaw - ca.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      car.x = lerp(ca.x, cb.x); car.y = lerp(ca.y, cb.y); car.z = lerp(ca.z, cb.z); car.yaw = ca.yaw + dy * ck;
      car.pitch = lerp(ca.pitch, cb.pitch); car.roll = lerp(ca.roll, cb.roll); car.steer = cb.steer; car.spin = lerp(ca.spin, cb.spin);
      car.vx = (cb.x - ca.x) / Math.max(cs, 0.05); car.vz = (cb.z - ca.z) / Math.max(cs, 0.05); car.speed = Math.hypot(car.vx, car.vz);
      car.seats[0] = h;
      car.place(dt); car.draw(dt);
    }
  }

  /** One thing they did. */
  _event(r, p, e) {
    if (!Array.isArray(e) || typeof e[0] !== 'number' || e[0] <= r.lastSeq) return;
    r.lastSeq = e[0];
    const g = this.g, kind = e[1], me = this.myPeer, pl = g.player;
    switch (kind) {
      case 'say': {
        const text = cleanText(e[2], 140);
        if (!text || !r.h) return;
        g.speech?.say(r.h, text, { shout: /!$/.test(text) });
        this._feed('chat', r.name, '', text, { admin: r.admin });
        return;
      }
      case 'die': {
        const killer = e[2] === me ? this._name() : (this.remotes.get(e[2]) || {}).name || '';
        if (e[2] === me && me) { this.you.kills++; this.sendT = 0; }
        this._feed('kill', killer, weaponName(word(e[3])), r.name, { mine: e[2] === me });
        return;
      }
      case 'hit': {
        if (e[2] !== me || !me || !pl.h) return;
        const d = e[3];
        if (!d || typeof d !== 'object') return;
        const part = num(d.p, 0, PART_COUNT - 1) | 0, type = TYPES.has(d.ty) ? d.ty : 'blunt';
        if (pl.gone[part]) return;
        const lp = vec(d.lp, 1), ld = vec(d.ld, 1.01) || [0, 0, 1], ln = vec(d.ln, 1.01);
        const b = pl.bodies[part];
        b.toWorld(lp ? lp[0] : 0, lp ? lp[1] : 0, lp ? lp[2] : 0, _a);
        b.dirToWorld(ld[0], ld[1], ld[2], _b);
        this.stats.hitsIn++;
        const arrow = d.ar === 2 ? 'bolt' : d.ar === 1 ? 'arrow' : null;
        const rep = pl.hit({ part, type, power: num(d.pw, 0, 6), hp: d.hp == null ? undefined : num(d.hp, 0, 200), impulse: num(d.im, 0, 160), through: num(d.th, 0, 1), chop: num(d.ch, 0, 3), lift: num(d.lf, 0, 200),
          weapon: word(d.w) || 'fists', rifle: !!d.rf, shot: !!d.sh, ball: !!d.bl, arrow, point: [_a[0], _a[1], _a[2]], dir: [_b[0], _b[1], _b[2]], normal: ln || undefined, attacker: r.h });
        // an arrow that went in stays in, here as on their screen
        if (arrow && rep && !rep.stopped && !pl.gone[part]) g.arrows?.stickAt(pl, part, [_a[0], _a[1], _a[2]], [_b[0], _b[1], _b[2]], arrow, 0.1);
        return;
      }
      case 'shv': if (e[2] === me && me) pl.shove(num(e[3], -20, 20), num(e[4], -20, 20), num(e[5], 0, 160), r.h); return;
      case 'tz': if (e[2] === me && me) pl.tase(num(e[3], 0, 6), r.h, e[4] === 'shock' ? 'shock' : 'taser'); return;
      case 'frz': {
        // frost on you, part by part, as their game saw it land
        if (e[2] !== me || !me || !Array.isArray(e[3])) return;
        const w = word(e[4]) || 'frostthrower';
        for (let i = 0; i < Math.min(PART_COUNT, e[3].length); i++) { const n = num(e[3][i], 0, 1); if (n > 0.004) g.frost?.chill(pl, i, n, r.h, w); }
        return;
      }
      case 'arw': {
        // somebody else's arrow, in the air: it flies and lands here as it did for them, and hurts nobody here (whoever it struck has been told)
        const m = vec(e[3], 500), v = vec(e[4], 200);
        if (!m || !v || !r.h) return;
        const bolt = e[2] === 'bolt', d = WEAPONS[bolt ? 'crossbow' : 'bow'];
        g.arrows?.loose(r.h, bolt ? 'bolt' : 'arrow', m[0], m[1], m[2], v[0], v[1], v[2], 0, word(e[5]) || d.id, true);
        // and the string is heard, here as there
        g.audio?.at(d.sound, m[0], m[1], m[2], 1);
        g.minds?.noise(m[0], m[1], m[2], d.loud, 'twang', r.h);
        return;
      }
      case 'brn': if (e[2] === me && me) g.fire?.ignite(pl, num(e[3], 0, PART_COUNT - 1) | 0, num(e[4], 0, 1), r.h, word(e[5]) || 'flamethrower'); return;
      case 'car': if (e[2] === me && me && r.car && !pl.car) { r.car.vx = num(e[4], -60, 60); r.car.vz = num(e[5], -60, 60); pl.struckByCar(r.car, num(e[3], 0, 60)); } return;
      case 'wd': {
        // a wound they took, so it shows on their stand-in too
        if (!r.h) return;
        const part = num(e[2], 0, PART_COUNT - 1) | 0, lp = vec(e[4], 1), ln = vec(e[5], 1.01);
        if (!lp || !ln || r.h.gone[part]) return;
        const kindW = e[3] === 'bullet' ? 'entry' : e[3] === 'blunt' ? 'bruise' : 'slash';
        g.gore.mark(r.h, part, kindW, lp, ln, e[3] === 'bullet' ? 0.05 : 0.07);
        const b = r.h.bodies[part]; b.toWorld(lp[0], lp[1], lp[2], _a);
        g.gore.burst(_a[0], _a[1], _a[2], 0, 0.5, 0, e[3] === 'blunt' ? 2 : 6, 1.6);
        return;
      }
      case 'gun': {
        // a shot: its flash and noise, and a round that marks what it hits (and hurts nobody: whoever it hit has been told already)
        const t = word(e[2]), m = vec(e[3], 500), d = vec(e[4], 1.01);
        if (!t || !WEAPONS[t] || !WEAPONS[t].gun || !m || !d || !r.h) return;
        g.weapons?.ghostShot?.(r.h, t, m, d);
        return;
      }
      case 'pw': {
        const k = word(e[2]), m = vec(e[3], 500), d = vec(e[4], 1.01);
        if (!k || !m || !d || !r.h) return;
        g.powers?.ghost?.(k, r.h, m, d, num(e[5], 0.5, 3, 1));
        return;
      }
      case 'adm': {
        // the admin's word, and nobody else's: the platform says who sent it, and the store says who the admin is
        if (!this.isAdminPeer(p)) { this.stats.refused++; return; }
        if (e[2] !== me || !me) return;
        const c = e[3];
        if (!c || typeof c !== 'object') return;
        this.stats.cmdsIn++;
        if (c.op === 'set') {
          this._applyAdmin({ sp: num(c.sp, 0.1, 5, 1), hp: num(c.hp, 1, 10000, 100), tg: num(c.tg, 0.1, 20, 1), wl: num(c.wl, 0, 2) | 0 });
          g.ui?.toast(`The admin set your speed to ${num(c.sp, 0.1, 5, 1)}x, max HP to ${num(c.hp, 1, 10000, 100) | 0} and toughness to ${num(c.tg, 0.1, 20, 1)}x.`, 4);
        } else if (c.op === 'kick') {
          const note = cleanText(c.note, 200);
          if (this.server) this.kickedFrom.set(this.server.id, Date.now() + 60000);
          this.leave(true);
          this.onKicked?.(c.ban ? 'ban' : 'kick', note);
        }
        return;
      }
      default:
    }
  }

  /* ---------------------------- what happens to you, sent ---------------------------- */

  /** A hit on another player's stand-in: the blood flies here; the hit itself goes to them (if it was yours to send). */
  hitRemote(h, info) {
    const g = this.g, r = h.remote;
    if (info.point) g.gore.burst(info.point[0], info.point[1], info.point[2], -(info.dir ? info.dir[0] : 0), 0.4, -(info.dir ? info.dir[2] : 0), info.type === 'blunt' ? 3 : 8, 2);
    if (!r || !this.server || info.attacker !== g.player || !TYPES.has(info.type)) return FAKE_REP;
    const b = h.bodies[info.part];
    if (!b || h.gone[info.part]) return null;
    b.toLocal(info.point[0], info.point[1], info.point[2], _a);
    b.dirToLocal(info.dir[0], info.dir[1], info.dir[2], _b);
    const d = { p: info.part, ty: info.type, pw: r3(info.power || 0), im: r2(info.impulse || 0), lp: [r3(_a[0]), r3(_a[1]), r3(_a[2])], ld: [r3(_b[0]), r3(_b[1]), r3(_b[2])], w: word(info.weapon) || 'fists' };
    if (info.hp != null) d.hp = r2(info.hp);
    if (info.through) d.th = r3(info.through);
    if (info.chop) d.ch = r2(info.chop);
    if (info.lift) d.lf = r2(info.lift);
    if (info.rifle) d.rf = 1; if (info.shot) d.sh = 1; if (info.ball) d.bl = 1;
    if (info.arrow) d.ar = info.arrow === 'bolt' ? 2 : 1;
    if (Array.isArray(info.normal)) d.ln = info.normal.map(r3);
    this._emit('hit', r.peer, d);
    this.stats.hitsOut++;
    return FAKE_REP;
  }
  shoveRemote(h, vx, vz, force, by) { if (h.remote && this.server && by === this.g.player) this._emit('shv', h.remote.peer, r2(vx), r2(vz), r2(force)); }
  taseRemote(h, secs, by, how) { if (h.remote && this.server && by === this.g.player) this._emit('tz', h.remote.peer, r2(secs), how); }
  /** Frost on another player's stand-in: added up, and sent four times a second (a spray is a great many small chills). */
  chillRemote(h, part, amount, who, weapon) {
    if (!h.remote || !this.server || who !== this.g.player) return;
    const A = this.chillAcc || (this.chillAcc = new Map()), peer = h.remote.peer;
    let a = A.get(peer);
    if (!a) A.set(peer, (a = { parts: new Float32Array(PART_COUNT), weapon: word(weapon) || 'frostthrower' }));
    a.parts[part] = Math.min(1, a.parts[part] + amount);
  }
  _flushChill(dt) {
    if (!this.chillAcc || !this.chillAcc.size || (this.chillT = (this.chillT || 0) - dt) > 0) return;
    this.chillT = 0.25;
    for (const [peer, a] of this.chillAcc) this._emit('frz', peer, Array.from(a.parts, r2), a.weapon);
    this.chillAcc.clear();
  }
  /** One of your arrows away: the others see it fly. */
  arrowFx(kind, m, v, weapon) { if (this.server) this._emit('arw', kind === 'bolt' ? 'bolt' : 'arrow', m.map(r2), v.map(r2), weapon); }
  burnRemote(h, part, amount, who, weapon) { if (h.remote && this.server && who === this.g.player) this._emit('brn', h.remote.peer, part, r2(amount), word(weapon) || 'flamethrower'); }
  carRemote(h, car, closing) { if (h.remote && this.server && car && car.seats[0] === this.g.player) this._emit('car', h.remote.peer, r2(closing), r2(car.vx), r2(car.vz)); }
  /** Your gun went off: everyone else sees the flash and hears it, and the round marks what it hits. */
  gunFx(type, m, d) { if (this.server) this._emit('gun', type, m.map(r2), d.map(r3)); }
  /** One of your powers went out: the others see it fly (it hurts nobody there). */
  powerFx(kind, m, d, big = 1) { if (this.server) this._emit('pw', kind, m.map(r2), d.map(r3), r2(big)); }

  /** You said something. */
  onSpeech(h, text) {
    if (!this.server || h !== this.g.player) return;
    text = cleanText(text, 140);
    if (!text) return;
    this._emit('say', text);
    this._feed('chat', this._name(), '', text, { mine: true, admin: this.auth.admin });
  }

  /** You were hurt: a mark of it for the others' screens. */
  onHit(h, info, rep) {
    const g = this.g;
    if (!this.server || h !== g.player || !rep || rep.stopped || !info || !info.point || g.time - this.lastWound < 0.2) return;
    const b = h.bodies[info.part];
    if (!b) return;
    this.lastWound = g.time;
    b.toLocal(info.point[0], info.point[1], info.point[2], _a);
    const ln = Array.isArray(info.normal) ? info.normal : [0, 0, 1];
    this._emit('wd', info.part, info.type, [r3(_a[0]), r3(_a[1]), r3(_a[2])], ln.map(r3));
  }

  /** Somebody died. If it was you, everybody hears who did it. */
  onDeath(h) {
    const g = this.g;
    if (!this.server || h !== g.player) return;
    this.you.deaths++;
    const by = h.lastAttacker && typeof h.lastAttacker === 'object' && h.lastAttacker.puppet ? h.lastAttacker.remote : null;
    const w = word(h.lastWeapon) || '';
    this._emit('die', by ? by.peer : '', w);
    this._feed('kill', by ? by.name : '', weaponName(w), this._name(), { mine: true });
  }

  /* ------------------------------------- the admin ------------------------------------- */

  /** The admin, on the owner's page, writes down their id, so everybody else's game knows whose word counts. */
  async claimAdmin() {
    if (!this.db || !this.uid || !this.auth.admin || this.adminId === this.uid || this._claiming) return;
    this._claiming = true;
    try { await this.db.doc('config/admin').set({ id: this.uid, at: Date.now() }); } catch { /* only the owner may: anyone else simply is not the admin */ }
    this._claiming = false;
  }

  /** Speed, max HP, toughness and wanted level for a player on the server ('me' for you). */
  adminApply(target, vals) {
    if (!this.auth.admin) return { error: 'Only the admin can do that.' };
    const v = { sp: num(+vals.speed, 0.1, 5, 1), hp: num(+vals.hp, 1, 10000, 100), tg: num(+vals.tough, 0.1, 20, 1), wl: num(+vals.wanted, 0, 2) | 0 };
    if (target === 'me' || (this.myPeer && target === this.myPeer)) { this._applyAdmin(v); return { ok: true, who: 'you' }; }
    const r = this.remotes.get(target);
    if (!r) return { error: 'They are not on this server any more.' };
    this._emit('adm', target, { op: 'set', ...v });
    this.stats.cmdsOut++;
    return { ok: true, who: r.name };
  }

  adminKick(target, note = '') {
    if (!this.auth.admin) return { error: 'Only the admin can do that.' };
    if (target === 'me' || (this.myPeer && target === this.myPeer)) { if (!this.server) return { error: 'You are not on a server.' }; this.leave(true); this.onKicked?.('kick', cleanText(note, 200)); return { ok: true, who: 'you' }; }
    const r = this.remotes.get(target);
    if (!r) return { error: 'They are not on this server any more.' };
    this._emit('adm', target, { op: 'kick', note: cleanText(note, 200) });
    this.stats.cmdsOut++;
    return { ok: true, who: r.name };
  }

  /** A ban: on their platform id, kept in the store, for `ms` milliseconds (0: for good), with a note they are shown. */
  async adminBan(target, note = '', ms = 0) {
    if (!this.auth.admin) return { error: 'Only the admin can do that.' };
    if (!this.db) return { error: 'Bans need the game open on claude.ai.' };
    const self = target === 'me' || (this.myPeer && target === this.myPeer);
    const r = self ? null : this.remotes.get(target);
    const id = self ? this.uid : r && r.by;
    if (!id) return { error: self ? 'You have no id on this page to ban.' : r ? 'The platform has not said who that player is, so they cannot be banned. Kick them instead.' : 'They are not on this server any more.' };
    const ban = { until: ms > 0 ? Date.now() + ms : 0, note: cleanText(note, 200), at: Date.now(), name: self ? this._name() : r.name };
    try { await this.db.doc('bans/' + id).set(ban); } catch (e) { return { error: 'The ban could not be saved (' + ((e && e.code) || 'refused') + ').' }; }
    if (!self) this._emit('adm', target, { op: 'kick', note: ban.note, ban: 1 });
    return { ok: true, who: ban.name };
  }

  async adminUnban(id) {
    if (!this.auth.admin || !this.db || typeof id !== 'string') return { error: 'Only the admin can do that.' };
    try { await this.db.doc('bans/' + id).delete(); } catch (e) { return { error: 'Could not lift the ban (' + ((e && e.code) || 'refused') + ').' }; }
    return { ok: true };
  }

  /** Bans in force, for the admin's list. */
  get banList() { return [...this.bans.entries()].filter(([, b]) => !b.until || b.until > Date.now()).map(([id, b]) => ({ id, name: cleanName(b.name), note: cleanText(b.note, 200), until: num(b.until, 0, 1e15) })); }

  _applyAdmin(v) {
    const g = this.g;
    this.adminSet = { sp: v.sp, hp: v.hp, tg: v.tg };
    this.reapply();
    g.police?.setWanted?.(v.wl, 'admin');
  }
  /** What the admin set on you, on whatever body you have now. */
  reapply() {
    const p = this.g.player, v = this.adminSet;
    if (!p || !v) return;
    p.boost = v.sp; p.knock = v.tg; p.h.hpMul = v.hp / 100;
  }

  _bansChanged() {
    const b = this.banned;
    if (b && this.server) { this.leave(true); this.onKicked?.('ban', cleanText(b.note, 200)); }
    for (const [peer, r] of [...this.remotes]) if (this._activeBan(r.by)) this._remove(peer, ' was banned');
    this.onChange?.();
  }
}

/** What a weapon (or a power) is called in the feed. */
const POWER_WORD = { tempest: 'Tempest Kick', fingerpistol: 'Finger Pistol', flame: "Leo's Flame", swirl: 'Swirling Kick', leopard: 'Full Leopard', claws: 'Claws', leap: 'Leopard Leap', crash: 'Car', car: 'Car', explosion: 'Explosion', shrapnel: 'Explosion', fists: 'Fists' };
export function weaponName(id) {
  if (!id) return '';
  if (POWER_WORD[id]) return POWER_WORD[id];
  if (WEAPONS[id]) return WEAPONS[id].name;
  if (ABILITY[id]) return ABILITY[id].name;
  return id[0].toUpperCase() + id.slice(1);
}
