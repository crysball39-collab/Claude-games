/* =============================================================================
   One city for everybody on a server.

   The host's game is the city: its people (the police and S.W.A.T. among
   them), its traffic and its helicopters, and everything spawned or lying
   about in it: guns and the rest of what gets dropped, crates, rocks, lamps
   and generators, walls and beams. It goes out in the host's presence, in
   whatever room is left there, fifteen times a second:

     the roster   the id of everything there is, every time: whatever is not
                  on it any more is gone
     intros       what each thing is (a person's looks, a car's make and
                  paint, the shape of a wall and the cubes left in it): a new
                  thing at once, a few times, and everything else in turn,
                  for whoever arrived late
     states       where each thing is and how it is: a whole body in a
                  compact pose (in a car's own frame, for somebody in a car),
                  what they hold and wear, how alive they are; a car's place,
                  its damage and its glass; the cubes knocked out of a wall.
                  What moves, and what is near the other players, goes most
                  often; what has not moved, once in a while

   Everybody else's game empties its own streets as it joins and shows the
   host's instead: stand-ins, moved by what the host sends, that nothing in
   their own game can move. What their player does to them goes to the host
   as an event: a blow, a round, a flame, a shove or a throw on somebody; a
   knock on a crate; cubes knocked out of a wall; a gun picked up. Their
   player keeps what they hold, drive or carry: a car they get into is theirs
   until they leave it, and then it goes back to the host's city, as does
   anything they drop, throw or put down.

   The host's people hurt the other players in the same way the players hurt
   each other: the blow is sent to whoever it landed on. The host's own sound
   and flashes of its people (a shot, a word, a wound) go out as events too.

   If the host leaves, whoever has been on longest is the host, and what
   they were being shown becomes their city.
   ========================================================================== */
import { Human, ST } from '../human/human.js';
import { P, PART_COUNT } from '../human/rig.js';
import { randomLook } from '../human/looks.js';
import { encodeLite, decodeLite } from './pose.js';
import { WEAPONS } from '../combat/weapons.js';
import { THINGS } from '../world/things.js';
import { VoxelThing } from '../world/voxels.js';
import { BODY } from '../world/car.js';
import { groundHeight } from '../world/city.js';
import { clamp, rand } from '../core/util.js';

const enc = new TextEncoder();
const bytes = (s) => enc.encode(s).length;
const b36 = (n) => n.toString(36);
const unb36 = (s) => (typeof s === 'string' && /^[0-9a-z]{1,9}$/.test(s) ? parseInt(s, 36) : -1);
const num = (v, a, b, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, a, b) : d);
const word = (s) => (typeof s === 'string' && /^[a-zA-Z0-9]{1,20}$/.test(s) ? s : null);
const unseen = (c) => c < 32 || (c >= 0x7f && c <= 0x9f) || c === 0xad || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2060 && c <= 0x206f) || c === 0xfeff;
const clean = (s, n) => { let o = ''; for (const ch of String(s || '')) if (!unseen(ch.codePointAt(0))) o += ch; return o.replace(/\s+/g, ' ').trim().slice(0, n); };
const vec = (a, lim) => (Array.isArray(a) && a.length === 3 && a.every((v) => typeof v === 'number' && Number.isFinite(v)) ? a.map((v) => clamp(v, -lim, lim)) : null);
const cm = (v) => Math.round(v * 100);
const k3 = (v) => Math.round(v * 1000);
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

/** How far behind the newest word of it a stand-in is drawn: always one place either side of it, and no further back than this. */
const LAG_MIN = 0.1, LAG_MAX = 0.6;
const CARS = new Set(['sedan', 'car', 'police', 'van', 'taxi', 'swatvan']);
const HELIS = new Set(['gunner', 'drop']);
const ARMOUR = new Set(['light', 'medium', 'swat']);
const MASK = (1 << PART_COUNT) - 1;
const TYPES = new Set(['blunt', 'cut', 'stab', 'bullet', 'crush', 'burn', 'needle']);
const _a = [0, 0, 0], _b = [0, 0, 0];
const _pa = new Float32Array(PART_COUNT * 7);

/** What sort of thing a prop is, to everybody else: a crate, a rock, a gun (or anything else carried), a lamp or a generator, a wall. */
function objKind(o) {
  if (o.puppetOf) return null;                  // what another player holds overhead goes with them
  if (o.kind === 'crate') return 'c';
  if (o.kind === 'rock' && o.lumps) return 'r';
  if (o.kind === 'weapon' && o.item) return 'w';
  if (o.thing) return 't';
  if (o.vox) return 'v';
  return null;
}

/** What a person looks like, without who they are inside: what a stand-in needs to look like them. */
function packLook(L) {
  const o = {};
  for (const k in L) {
    if (k === 'desc' || k === 'wears' || k === 'outfit' || k === 'persona') continue;
    const v = L[k];
    if (typeof v === 'number') o[k] = Math.round(v * 1000) / 1000;
    else if (typeof v === 'boolean') { if (v) o[k] = 1; }
    else if (typeof v === 'string' && v.length <= 24) o[k] = v;
  }
  return o;
}
function unpackLook(o) {
  if (!o || typeof o !== 'object') return null;
  const L = randomLook();          // anything they did not say, somebody's
  for (const k of Object.keys(o).slice(0, 60)) {
    if (!/^[a-zA-Z]{1,16}$/.test(k) || k === 'persona') continue;
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) L[k] = typeof L[k] === 'boolean' ? v !== 0 : v;
    else if (typeof v === 'string') L[k] = clean(v, 24);
  }
  for (const k of ['longSleeve', 'shorts', 'stubble']) L[k] = !!L[k];
  L.scale = num(L.scale, 0.6, 1.6, 0.92); L.build = num(L.build, 0.7, 1.5, 1);
  return L;
}

/** The cubes of a wall, as runs: how many there are, how many are gone, how many there are... from the first. */
function rle(cells) {
  const out = [];
  let v = 1, n = 0;
  for (let i = 0; i < cells.length; i++) { const c = cells[i] ? 1 : 0; if (c === v) n++; else { out.push(b36(n)); v = c; n = 1; } }
  out.push(b36(n));
  return out.join('.');
}
function unrle(s, N) {
  if (typeof s !== 'string' || s.length > 6000) return null;
  const cells = new Uint8Array(N);
  let i = 0, v = 1;
  for (const part of s.split('.')) {
    const n = unb36(part);
    if (n < 0 || i + n > N) return null;
    if (v) cells.fill(1, i, i + n);
    i += n; v ^= 1;
  }
  return cells;
}

/** Colours for a wall's cubes, shown from somebody else's city: boards with seams for wood, ribbed grey for steel. */
function voxColors(mat, nx, ny, nz) {
  const out = new Float32Array(nx * ny * nz * 3);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const o = (i + nx * (j + ny * k)) * 3;
    if (mat === 'wood') {
      const board = (j / 4) | 0, v = (0.84 + ((board * 37) % 11) / 34) * (j % 4 === 3 ? 0.62 : 1) * (0.93 + Math.random() * 0.12);
      out[o] = 0.55 * v; out[o + 1] = 0.36 * v; out[o + 2] = 0.2 * v;
    } else {
      const v = (0.5 + Math.random() * 0.05) * ((i % 6) < 2 ? 1.1 : 1);
      out[o] = v * 0.95; out[o + 1] = v; out[o + 2] = v * 1.08;
    }
  }
  return out;
}

/** Most of the way from one turn to the other, the short way round. */
function nlerp(ax, ay, az, aw, bx, by, bz, bw, k, out, o) {
  if (ax * bx + ay * by + az * bz + aw * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; }
  const x = ax + (bx - ax) * k, y = ay + (by - ay) * k, z = az + (bz - az) * k, w = aw + (bw - aw) * k, l = Math.hypot(x, y, z, w) || 1;
  out[o] = x / l; out[o + 1] = y / l; out[o + 2] = z / l; out[o + 3] = w / l;
}

/** Somebody alight in somebody else's game, as it looks here: flames off them (the fire itself, and what it does, are there). */
export function flames(g, h, dt) {
  if (!h.netFire || !g.fire || Math.random() > dt * 24) return;
  const i = (Math.random() * PART_COUNT) | 0;
  if (!h.attached[i] || h.gone[i]) return;
  const b = h.bodies[i];
  g.fire.flameAt(b.px + rand(-0.05, 0.05), b.py + 0.05, b.pz + rand(-0.05, 0.05), rand(0.22, 0.42) * h.scale);
}

export class Shared {
  constructor(game, mp) {
    this.g = game; this.mp = mp;
    /** 'host': this city is the one everybody sees; 'mirror': it shows the host's; 'off': not on a server. */
    this.mode = 'off';
    // the host's side: what has gone out about each thing, and when
    this.rec = new Map();
    this.rr = 0;
    this.nextId = 1;
    this.index = { h: new Map(), o: new Map(), c: new Map(), a: new Map() };
    // everybody else's: the host's things, as stand-ins
    this.ghosts = new Map();
    this.taken = new Map();          // key -> until: the host's things we have taken (a car, a gun), not to be shown again
    this.handing = [];               // what we have given the host, kept here till it shows it back: { nonce, kind, obj, until }
    this.pushes = new Map();         // key -> the knocks on a thing of theirs, summed, waiting to go
    this.lost = new Map();           // key -> cubes knocked out of a wall of theirs, waiting to go
    this.asked = new Map();          // key -> when we last asked the host again about something we have not heard enough of
    this.flushT = 0;
    this.hostPeer = null;
    this.stats = { packs: 0, bytes: 0, intros: 0, states: 0, ghosts: 0, made: 0, dropped: 0, promoted: 0, handed: 0, back: 0, events: 0, taken: 0 };
  }

  /* --------------------------------- which side --------------------------------- */

  /** Hosting (from the start, or now that the host has gone): this city is the server's. */
  host() {
    if (this.mode === 'host') return;
    const was = this.mode;
    this.mode = 'host';
    this.g.mirror = false;
    if (was === 'mirror') this._promote();
    this.rec.clear();
  }

  /** On somebody else's server: this city empties, and shows theirs. */
  mirror() {
    if (this.mode === 'mirror') return;
    this.mode = 'mirror';
    this.g.mirror = true;
    this._empty();
  }

  /** Off the server: a city of your own again. */
  off() {
    const was = this.mode;
    this.mode = 'off';
    this.rec.clear(); this.taken.clear(); this.pushes.clear(); this.lost.clear(); this.asked.clear();
    for (const H of this.handing) this._dropLocal(H);
    this.handing.length = 0;
    if (was === 'mirror') {
      this._clear();
      this.g.mirror = false;
      this.g.restoreCity?.();
    }
  }

  /** Everything of this city's own, gone: its people, its things, its cars and helicopters. */
  _empty() {
    const g = this.g;
    for (const h of g.humans.slice()) if (!h.isPlayer && !h.puppet) g.removeHuman(h);
    for (const o of g.props.slice()) g.removeProp(o);
    if (g.traffic) for (const c of g.traffic.cars.slice()) if (!c.seats.includes(g.player)) g.traffic.remove(c);
    g.air?.clear(); g.ropes?.clear(); g.police?.reset();
  }

  /* ------------------------------------ host ------------------------------------ */

  _nearest(x, z) {
    let d = Infinity;
    for (const r of this.mp.remotes.values()) if (r.h && !r.h.removed) d = Math.min(d, Math.hypot(r.h.x - x, r.h.z - z));
    return d;
  }

  /** The host's city, in as much of `room` (bytes of JSON) as it takes, for the host's presence; null if there is no room. */
  pack(room) {
    const g = this.g, now = g.time, I = this.index;
    for (const k in I) I[k].clear();
    const all = [];
    for (const h of g.humans) if (!h.isPlayer && !h.puppet && !h.removed) { I.h.set(h.id, h); all.push({ key: 'h' + h.id, ty: 'h', id: h.id, o: h }); }
    for (const o of g.props) {
      if (o.removed || !objKind(o)) continue;
      if (!o.nid) o.nid = this.nextId++;
      I.o.set(o.nid, o); all.push({ key: 'o' + o.nid, ty: 'o', id: o.nid, o });
    }
    if (g.traffic) for (const c of g.traffic.cars) {
      // the car the host is driving goes with the host, as anybody's does
      if (c.removed || c.mirror || c.seats[0] === g.player) continue;
      I.c.set(c.id, c); all.push({ key: 'c' + c.id, ty: 'c', id: c.id, o: c });
    }
    if (g.air) for (const hl of g.air.list) { if (hl.removed || hl.mirror) continue; I.a.set(hl.id, hl); all.push({ key: 'a' + hl.id, ty: 'a', id: hl.id, o: hl }); }
    const roster = (ty) => all.filter((e) => e.ty === ty).map((e) => b36(e.id)).join(',');
    const wd = { t: r2(now), h: roster('h'), o: roster('o'), c: roster('c'), a: roster('a'), i: [], s: [] };
    let used = bytes(JSON.stringify(wd)) + 4;
    if (used > room) return null;
    // forget whatever is gone
    const keys = new Set(all.map((e) => e.key));
    for (const k of this.rec.keys()) if (!keys.has(k)) this.rec.delete(k);
    const rec = (e) => { let r = this.rec.get(e.key); if (!r) { r = { t: -1e9, sig: '', qt: -1e9, qsig: '', intros: 0, it: -1e9, mt: -1e9, mv: -1 }; this.rec.set(e.key, r); } return r; };
    // intros: what is new (three times over, a send apart), then the rest in turn
    const add = (list, e, n) => { list.push(e); used += n + 1; };
    const introRoom = room * 0.42;
    const fresh = all.filter((e) => rec(e).intros < 3 && now - rec(e).it > 0.12);
    for (const e of fresh) {
      const x = this._intro(e), n = bytes(JSON.stringify(x));
      if (used + n > introRoom) break;
      add(wd.i, x, n); const r = rec(e); r.intros++; r.it = now; this.stats.intros++;
    }
    for (let k = 0; k < 2 && all.length; k++) {
      this.rr = (this.rr + 1) % all.length;
      const e = all[this.rr], r = rec(e);
      if (r.it === now || r.intros < 3) continue;
      const x = this._intro(e), n = bytes(JSON.stringify(x));
      if (used + n > introRoom) break;
      add(wd.i, x, n); r.it = now; this.stats.intros++;
    }
    // states: what has moved, and what is near the others, first; what has not, once in a while
    const cands = [];
    for (const e of all) {
      const r = rec(e), sig = this._sig(e), near = this._nearest(e.o.x ?? e.o.body?.px ?? 0, e.o.z ?? e.o.body?.pz ?? 0);
      const w = near < 30 ? 2 : near < 70 ? 1 : 0.35, age = now - r.t;
      const pri = r.t < -1e8 ? 1e6 : sig !== r.sig ? age * 6 * w : age > 3 ? age * 0.25 : -1;
      if (pri > 0) cands.push({ e, r, sig, pri });
      // how a person is (what they hold, what they wear, how alive): when it changes, and every few seconds
      if (e.ty === 'h') {
        const q = this._status(e.o), qs = JSON.stringify(q);
        if (qs !== r.qsig || now - r.qt > 4) cands.push({ e, r, q, qs, pri: qs !== r.qsig ? 5e5 : (now - r.qt) * 2 });
      }
      // what is left of a wall, when that changes
      if (e.ty === 'o' && e.o.vox) {
        // (and, for one that has lost any, every few seconds anyway: whoever missed it hears it again)
        const v = e.o.vox, ver = v.lost * 100000 + v.count;
        if ((ver !== r.mv && now - r.mt > 0.35) || (v.lost > 0 && now - r.mt > 5)) cands.push({ e, r, mask: ver, pri: ver !== r.mv ? 4e5 : 50 });
      }
    }
    cands.sort((a, b) => b.pri - a.pri);
    for (const c of cands) {
      let x;
      if (c.q) x = ['q', b36(c.e.id), ...c.q];
      else if (c.mask != null) { const m = rle(c.e.o.vox.cells); if (m.length > 2600) { c.r.mv = c.mask; continue; } x = ['m', b36(c.e.id), m]; }
      else x = this._state(c.e);
      if (!x) continue;
      const n = bytes(JSON.stringify(x));
      if (used + n > room) continue;
      add(wd.s, x, n);
      if (c.q) { c.r.qsig = c.qs; c.r.qt = now; }
      else if (c.mask != null) { c.r.mv = c.mask; c.r.mt = now; }
      else { c.r.sig = c.sig; c.r.t = now; }
      this.stats.states++;
    }
    this.stats.packs++; this.stats.bytes = used;
    return wd;
  }

  /** What a thing is, for whoever has not got it yet. */
  _intro(e) {
    const o = e.o, i = b36(e.id);
    switch (e.ty) {
      case 'h': return { y: 'h', i, L: packLook(o.look), f: (o.officer ? 1 : 0) | (o.swat ? 2 : 0) | (o.pilot ? 4 : 0) };
      case 'c': { const x = { y: 'c', i, k: o.kind, p: o.paint }; if (o.nonce) x.n = o.nonce; return x; }
      case 'a': return { y: 'a', i, k: o.kind };
      default: {
        const k = objKind(o), x = { y: 'o', i, k };
        if (k === 'r') x.r = r3(o.body.hx / 0.4);
        if (k === 'w') { x.w = o.item.type; x.a = o.item.ammo | 0; }
        if (k === 't') x.t = o.thing.type;
        if (k === 'v') {
          const v = o.vox, m = rle(v.cells);
          x.v = { kind: v.kind, mat: v.mat, n: [v.nx, v.ny, v.nz], cs: v.cs.map(r3), an: v.anchored ? 1 : 0, nm: v.name };
          if (m.length <= 1600) x.v.m = m;
        }
        if (o.nonce) x.n = o.nonce;
        return x;
      }
    }
  }

  /** A few numbers that change whenever the thing has moved enough to show. */
  _sig(e) {
    const o = e.o, q = (v) => Math.round(v * 40);
    if (e.ty === 'h') {
      const B = o.bodies, f = (i) => q(B[i].px) + ',' + q(B[i].py) + ',' + q(B[i].pz);
      return o.state + ':' + f(P.PELVIS) + ':' + f(P.HEAD) + ':' + f(P.HAND_L) + ':' + f(P.HAND_R) + ':' + f(P.FOOT_L) + ':' + f(P.FOOT_R) + (o.car ? ':' + o.car.id : '');
    }
    if (e.ty === 'c') return o.wreck ? 'w' + q(o.body.px) + ',' + q(o.body.py) + ',' + q(o.body.pz) + ',' + q(o.body.qx) + ',' + q(o.body.qy) + ',' + q(o.body.qz) + ',' + o.hp + ',' + o.fire
      : q(o.x) + ',' + q(o.z) + ',' + q(o.yaw) + ',' + q(o.steer || 0) + ',' + Math.round(o.hp) + ',' + (o.fire >= 0 ? 1 : 0) + (o.siren ? 's' : '') + this._glass(o);
    if (e.ty === 'a') return q(o.x) + ',' + q(o.y) + ',' + q(o.z) + ',' + q(o.yaw) + ',' + q(o.pitch) + ',' + q(o.roll) + (o.down ? 'd' : '');
    const b = o.body;
    return q(b.px) + ',' + q(b.py) + ',' + q(b.pz) + ',' + q(b.qx) + ',' + q(b.qy) + ',' + q(b.qz) + ':' + this._extra(o);
  }
  _glass(car) { let m = 0; (car.windows || []).forEach((w, i) => { if (w && w.broken) m |= 1 << i; }); return m; }
  _extra(o) {
    const t = o.thing;
    if (t) return (t.on ? 1 : 0) | (t.lit ? 2 : 0) | (t.running ? 4 : 0) | (t.broken ? 8 : 0);
    if (o.item) return o.item.ammo | 0;
    return 0;
  }

  /** Where a thing is now, and how. */
  _state(e) {
    const o = e.o, i = b36(e.id);
    switch (e.ty) {
      case 'h': {
        // somebody in a car or a helicopter: their pose in its frame, so that it is put back in the same seat
        const frame = o.car && (o.car.heli ? this.index.a.has(o.car.id) : this.index.c.has(o.car.id)) ? o.car : null;
        const x = ['p', i, o.state, encodeLite(o, frame ? frame.group : null)];
        if (frame) x.push((frame.heli ? 'a' : 'c') + b36(frame.id));
        return x;
      }
      case 'c': {
        const live = o.fire >= 0 ? 1 : 0, gl = this._glass(o);
        if (o.wreck) { const b = o.body; return ['c', i, 1, cm(b.px), cm(b.py), cm(b.pz), k3(b.qx), k3(b.qy), k3(b.qz), k3(b.qw), Math.round(o.hp), live, gl]; }
        return ['c', i, 0, cm(o.x), cm(o.y), cm(o.z), k3(o.yaw), k3(o.pitch), k3(o.roll), k3(o.steer || 0), k3(o.spin || 0) % 100000, Math.round(o.hp), live, gl, o.siren ? 1 : 0];
      }
      case 'a': return ['a', i, cm(o.x), cm(o.y), cm(o.z), k3(o.yaw), k3(o.pitch), k3(o.roll), o.down ? 1 : 0];
      default: {
        const b = o.body;
        return ['o', i, cm(b.px), cm(b.py), cm(b.pz), k3(b.qx), k3(b.qy), k3(b.qz), k3(b.qw), this._extra(o)];
      }
    }
  }

  /** What somebody holds and wears, and how they are. */
  _status(h) {
    const kit = (h.kit || []).filter((it) => it !== h.weapon).map((it) => it.type).slice(0, 6).join('.');
    const fl = (h.h.alive ? 1 : 0) | (h.h.conscious ? 2 : 0) | (h.cuffed ? 4 : 0) | (h.fire && h.burning > 0.1 ? 8 : 0);
    const out = [h.weapon ? h.weapon.type : '', kit, (h.vest ? h.vest.kind : '') + '|' + (h.helmet ? h.helmet.kind : ''),
      h.gone.reduce((m, v, i) => (v ? m | (1 << i) : m), 0), h.stripped || 0, fl, Math.round(h.h.condition.pct)];
    if (h.state === ST.RAGDOLL && h.downAim && h.downAim.up > 0.05) out.push(r3(h.downAim.yaw), r3(h.downAim.pitch));
    return out;
  }

  /* -------------------------------- everybody else -------------------------------- */

  /** The host's city, as their latest presence has it. */
  unpack(wd, hostPeer) {
    if (this.mode !== 'mirror' || !wd || typeof wd !== 'object') return;
    this.hostPeer = hostPeer;
    const g = this.g, now = g.time;
    const live = new Set();
    for (const ty of ['h', 'o', 'c', 'a']) {
      const s = wd[ty];
      if (typeof s !== 'string' || s.length > 8000) continue;
      if (s) for (const part of s.split(',')) { const id = unb36(part); if (id >= 0) live.add(ty + id); }
    }
    // whatever is not on the list any more is gone (and what we took is ours once the host has let it go)
    for (const G of [...this.ghosts.values()]) if (!live.has(G.key)) this._drop(G);
    for (const [k, until] of this.taken) if (!live.has(k) || now > until) this.taken.delete(k);
    if (Array.isArray(wd.i)) for (const e of wd.i.slice(0, 60)) this._takeIntro(e, live);
    if (Array.isArray(wd.s)) for (const e of wd.s.slice(0, 300)) this._takeState(e, live, now);
    // a word lost on the way (their presence moves on whether we read it or not): what we have not heard enough about, asked for again
    const ask = [];
    for (const key of live) {
      if (this.taken.has(key)) continue;
      const G = this.ghosts.get(key);
      if (G && G.obj && G.snaps.length && (G.ty !== 'h' || G.status)) { this.asked.delete(key); continue; }
      const t0 = this.asked.get(key);
      if (t0 == null) this.asked.set(key, now);
      else if (now - t0 > 0.5 && ask.length < 30) { ask.push(key); this.asked.set(key, now); }
    }
    for (const key of this.asked.keys()) if (!live.has(key)) this.asked.delete(key);
    if (ask.length) this.mp._emit('iq', ask.join(','));
  }

  _ghost(key, ty, id) {
    let G = this.ghosts.get(key);
    if (!G) { G = { key, ty, id, obj: null, kind: '', snaps: [], gap: 0.2, at: -1 }; this.ghosts.set(key, G); }
    return G;
  }

  _takeIntro(e, live) {
    if (!e || typeof e !== 'object' || typeof e.y !== 'string') return;
    const ty = e.y, id = unb36(e.i);
    if (id < 0 || !'hoca'.includes(ty) || ty.length !== 1) return;
    const key = ty + id;
    if (!live.has(key) || this.taken.has(key)) return;
    // something we handed over, back: ours goes, theirs is shown
    if (typeof e.n === 'string') this._back(e.n);
    const G = this._ghost(key, ty, id);
    const kind = ty === 'h' ? JSON.stringify(e.L) : ty === 'o' ? e.k + (e.w || e.t || '') + (e.v ? JSON.stringify(e.v.n) + e.v.mat : '') : ty === 'c' ? e.k + ':' + e.p : e.k;
    if (G.obj && G.kind === kind) {
      // nothing new about it but, perhaps, what is left of a wall
      if (ty === 'o' && e.v && typeof e.v.m === 'string') this._mask(G, e.v.m);
      if (ty === 'o' && G.obj.item && e.w) G.obj.item.ammo = num(e.a, 0, 999, G.obj.item.ammo);
      return;
    }
    if (G.obj) this._unmake(G);
    G.kind = kind; G.intro = e;
    G.obj = ty === 'h' ? this._makePerson(G, e) : ty === 'o' ? this._makeObject(G, e) : ty === 'c' ? this._makeCar(G, e) : this._makeHeli(G, e);
    if (G.obj) { this.stats.made++; if (ty === 'h' && G.status) this._applyStatus(G); }
  }

  _takeState(e, live, now) {
    if (!Array.isArray(e) || typeof e[0] !== 'string' || e[0].length !== 1) return;
    const t = e[0], id = unb36(e[1]);
    if (id < 0) return;
    const ty = t === 'p' || t === 'q' ? 'h' : t === 'm' ? 'o' : t;
    if (!'hoca'.includes(ty)) return;
    const key = ty + id;
    if (!live.has(key) || this.taken.has(key)) return;
    const G = this._ghost(key, ty, id);
    switch (t) {
      case 'p': {
        const pose = decodeLite(e[3]);
        if (!pose) return;
        const frame = typeof e[4] === 'string' && /^[ca][0-9a-z]{1,9}$/.test(e[4]) ? e[4][0] + unb36(e[4].slice(1)) : null;
        this._snap(G, { st: num(e[2], 0, 3) | 0, pose, frame }, now);
        return;
      }
      case 'q': G.status = e; if (G.obj) this._applyStatus(G); return;
      case 'm': if (typeof e[2] === 'string') { if (G.obj) this._mask(G, e[2]); else G.pendingMask = e[2]; } return;
      case 'o': {
        const p = [num(e[2], -1e5, 1e5) / 100, num(e[3], -1e4, 1e5) / 100, num(e[4], -1e5, 1e5) / 100];
        const q = [num(e[5], -1000, 1000) / 1000, num(e[6], -1000, 1000) / 1000, num(e[7], -1000, 1000) / 1000, num(e[8], -1000, 1000, 1000) / 1000];
        const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
        this._snap(G, { p, q: [q[0] / l, q[1] / l, q[2] / l, q[3] / l], ex: num(e[9], 0, 1e4) | 0 }, now);
        return;
      }
      case 'c': {
        const wreck = e[2] === 1, s = { wreck };
        if (wreck) {
          s.p = [num(e[3], -1e5, 1e5) / 100, num(e[4], -1e4, 1e5) / 100, num(e[5], -1e5, 1e5) / 100];
          const q = [num(e[6], -1000, 1000) / 1000, num(e[7], -1000, 1000) / 1000, num(e[8], -1000, 1000) / 1000, num(e[9], -1000, 1000, 1000) / 1000], l = Math.hypot(...q) || 1;
          s.q = q.map((v) => v / l); s.hp = num(e[10], 0, 100); s.fire = e[11] === 1; s.glass = num(e[12], 0, 255) | 0;
        } else {
          s.x = num(e[3], -1e5, 1e5) / 100; s.y = num(e[4], -1e4, 1e5) / 100; s.z = num(e[5], -1e5, 1e5) / 100;
          s.yaw = num(e[6], -1e5, 1e5) / 1000; s.pitch = num(e[7], -4000, 4000) / 1000; s.roll = num(e[8], -4000, 4000) / 1000;
          s.steer = num(e[9], -3000, 3000) / 1000; s.spin = num(e[10], -1e5, 1e5) / 1000; s.hp = num(e[11], 0, 100); s.fire = e[12] === 1; s.glass = num(e[13], 0, 255) | 0; s.siren = e[14] === 1;
        }
        this._snap(G, s, now);
        return;
      }
      case 'a': this._snap(G, { x: num(e[2], -1e5, 1e5) / 100, y: num(e[3], -1e4, 1e5) / 100, z: num(e[4], -1e5, 1e5) / 100, yaw: num(e[5], -1e5, 1e5) / 1000, pitch: num(e[6], -4000, 4000) / 1000, roll: num(e[7], -4000, 4000) / 1000, down: e[8] === 1 }, now); return;
      default:
    }
  }

  _snap(G, s, now) {
    if (G.at >= 0) { const d = now - G.at; if (d > 0.004) G.gap = G.gap * 0.7 + Math.min(1, d) * 0.3; }
    G.at = now; s.t = now;
    G.snaps.push(s);
    if (G.snaps.length > 6) G.snaps.shift();
  }

  /** The two places either side of the moment a stand-in is drawn at, and how far between them. */
  _between(G, now) {
    const S = G.snaps;
    if (!S.length) return null;
    const t = now - clamp(G.gap * 1.6 + 0.03, LAG_MIN, LAG_MAX);
    let a = S[0], b = S[0];
    for (let i = S.length - 1; i >= 0; i--) if (S[i].t <= t) { a = S[i]; b = S[i + 1] || S[i]; break; }
    const span = b.t - a.t;
    return { a, b, k: span > 1e-4 ? clamp((t - a.t) / span, 0, 1) : 1 };
  }

  /* -------------------------------- making stand-ins -------------------------------- */

  _makePerson(G, e) {
    const g = this.g, L = unpackLook(e.L);
    if (!L) return null;
    const s = G.snaps[G.snaps.length - 1], x = s && !s.frame ? s.pose[0] : 0, z = s && !s.frame ? s.pose[2] : 0;
    const h = new Human(g, L, x, z, 0);
    h.puppet = true; h.h.god = true;
    h.remote = { npc: G.id, ghost: G, name: L.name || '' };
    h.ghostOf = (e.f | 0);
    h.hidden = true;               // till they are first put where they are
    g.humans.push(h);
    G.kitKey = null; G.arKey = null; G.gone = 0; G.ts = 0;
    return h;
  }

  _makeObject(G, e) {
    const g = this.g, W = g.weapons, s = G.snaps[G.snaps.length - 1];
    const x = s ? s.p[0] : 0, y = s ? s.p[1] : -50, z = s ? s.p[2] : 0;
    let prop = null;
    switch (e.k) {
      case 'c': prop = g.spawnCrate(x, y, z); break;
      case 'r': prop = g.powers?._makeRock(x, y, z, num(e.r, 0.85, 1.2, 1)); break;
      case 'w': {
        const t = word(e.w);
        if (!W || !t || !WEAPONS[t] || t === 'fists') return null;
        const it = W._make(t);
        it.mirror = G;
        W._toGround(it, x, y, z, 0, null);
        it.ammo = num(e.a, 0, 999, it.ammo);
        prop = it.prop;
        break;
      }
      case 't': {
        const t = word(e.t);
        if (!t || !THINGS[t] || !g.things) return null;
        const th = g.things.spawn(t, x, z, 0);
        th.mirror = G;
        prop = th.prop;
        break;
      }
      case 'v': prop = this._makeVox(G, e.v, x, y, z); break;
      default: return null;
    }
    if (!prop) return null;
    prop.mirror = G;
    const b = prop.body;
    b.setKinematic(true);
    b.onPush = (ix, iy, iz, wx, wy, wz) => this._pushed(G, ix, iy, iz, wx, wy, wz);
    if (s) b.setPose(s.p[0], s.p[1], s.p[2], s.q[0], s.q[1], s.q[2], s.q[3], 0);
    return prop;
  }

  _makeVox(G, v, x, y, z) {
    const g = this.g;
    if (!v || typeof v !== 'object' || !Array.isArray(v.n) || !Array.isArray(v.cs) || !g.voxels) return null;
    const nx = num(v.n[0], 1, 128) | 0, ny = num(v.n[1], 1, 128) | 0, nz = num(v.n[2], 1, 16) | 0, N = nx * ny * nz;
    if (N > 16000) return null;
    const cs = [num(v.cs[0], 0.01, 0.5, 0.05), num(v.cs[1], 0.01, 0.5, 0.05), num(v.cs[2], 0.01, 0.5, 0.05)];
    const mat = v.mat === 'sheet' || v.mat === 'steel' ? v.mat : 'wood';
    const m = typeof v.m === 'string' ? unrle(v.m, N) : G.pendingMask ? unrle(G.pendingMask, N) : null;
    const cells = m || new Uint8Array(N).fill(1);
    if (!cells.some((c) => c)) return null;
    const t = new VoxelThing(g.voxels, { kind: word(v.kind) || 'wall', name: clean(v.nm, 30) || 'Wall', mat, n: [nx, ny, nz], cs, cells, colors: voxColors(mat, nx, ny, nz), x, y, z, q: [0, 0, 0, 1], anchored: true, groundJ: 0 });
    t.mirror = G;
    g.voxels.list.push(t);
    G.pendingMask = null;
    return t.prop;
  }

  _makeCar(G, e) {
    const g = this.g;
    if (!g.traffic) return null;
    const car = g.traffic._make(CARS.has(e.k) ? e.k : 'sedan', num(e.p, 0, 0xffffff, 0xb8312b) | 0);
    car.mirror = G; car.mode = 'mirror'; car.traffic = false; car.hand = 1;
    const s = G.snaps[G.snaps.length - 1];
    if (s && !s.wreck) { car.x = s.x; car.y = s.y; car.z = s.z; car.yaw = s.yaw; car.place(0); }
    return car;
  }

  _makeHeli(G, e) {
    const g = this.g;
    if (!g.air || !g.air.ghost) return null;
    const s = G.snaps[G.snaps.length - 1];
    const hl = g.air.ghost(HELIS.has(e.k) ? e.k : 'gunner', s ? s.x : 0, s ? s.y : 40, s ? s.z : 0, s ? s.yaw : 0);
    hl.mirror = G;
    return hl;
  }

  /** A stand-in taken away: it has gone from the host's city (or is being made again as something else). */
  _unmake(G) {
    const g = this.g, o = G.obj;
    G.obj = null;
    if (!o) return;
    if (G.ty === 'h') { if (!o.removed) { g.powers?.dress?.(o, null); g.removeHuman(o); } }
    else if (G.ty === 'o') { if (!o.removed) g.removeProp(o); }
    else if (G.ty === 'c') { if (!o.removed) g.traffic?.remove(o); }
    else if (G.ty === 'a') { if (!o.removed) g.air?.remove(o); }
  }
  _drop(G) { this._unmake(G); this.ghosts.delete(G.key); this.stats.dropped++; }
  _clear() { for (const G of [...this.ghosts.values()]) this._drop(G); }

  /* --------------------------------- how they are --------------------------------- */

  _applyStatus(G) {
    const h = G.obj, e = G.status, W = this.g.weapons;
    if (!h || h.removed || !Array.isArray(e)) return;
    const w = word(e[2]) || '', kit = typeof e[3] === 'string' && e[3] ? e[3].split('.').slice(0, 6).map(word).filter(Boolean) : [];
    const kitKey = w + '|' + kit.join('.');
    if (kitKey !== G.kitKey && W) {
      G.kitKey = kitKey;
      for (const it of (h.kit || []).slice()) W.remove(it);
      h.kit = []; h.weapon = null;
      const ok = (t) => t && WEAPONS[t] && !WEAPONS[t].wear && t !== 'fists';
      for (const t of kit) if (ok(t)) W.give(h, t, false);
      if (ok(w)) W.give(h, w, true);
    }
    const ar = typeof e[4] === 'string' ? e[4].split('|') : [];
    const arKey = (ARMOUR.has(ar[0]) ? ar[0] : '') + '|' + (ARMOUR.has(ar[1]) ? ar[1] : '');
    if (arKey !== G.arKey) {
      G.arKey = arKey;
      h.removeVest(); h.removeHelmet();
      if (ARMOUR.has(ar[0])) h.wearVest(ar[0]);
      if (ARMOUR.has(ar[1])) h.wearHelmet(ar[1]);
    }
    const gone = (e[5] | 0) & MASK;
    if (gone !== G.gone) {
      const g = this.g, bx = g.boxes;
      for (let i = 0; i < PART_COUNT; i++) {
        if (!(gone & (1 << i)) || h.gone[i]) continue;
        h.gone[i] = true; h.attached[i] = false;
        bx.hide(h.inst[i]);
        if (i === P.HAND_L || i === P.HAND_R) for (const f of h.fingers[i === P.HAND_L ? 0 : 1]) bx.hide(f);
        const b = h.bodies[i];
        g.gore.burst(b.px, b.py, b.pz, 0, 1, 0, 14, 2.4);
      }
      G.gone = gone;
    }
    const ts = (e[6] | 0) & MASK;
    if (ts !== G.ts) { for (let i = 0; i < PART_COUNT; i++) if ((ts & (1 << i)) && !(G.ts & (1 << i))) h.stripCloth(i); G.ts = ts; }
    const fl = e[7] | 0;
    h.h.alive = !!(fl & 1); h.h.conscious = h.h.alive && !!(fl & 2);
    h.netFire = !!(fl & 8);
    h.remoteHp = num(e[8], 0, 100);
    if (e.length > 10 && h.state === ST.RAGDOLL) {
      const A = h.downAim || (h.downAim = { yaw: 0, pitch: 0, two: true, up: 1 });
      A.yaw = num(e[9], -100, 100); A.pitch = num(e[10], -1.6, 1.6); h.aimYaw = A.yaw; h.aimPitch = A.pitch;
    } else if (h.downAim) { h.downAim = null; h.aimYaw = undefined; h.aimPitch = undefined; }
  }

  /** What is left of a wall, from the host: the cubes it has lost go here too. */
  _mask(G, m) {
    const v = G.obj && G.obj.vox;
    if (!v || v.removed) return;
    const cells = unrle(m, v.N);
    if (!cells) return;
    let n = 0;
    v.syncing = true;
    for (let c = 0; c < v.N; c++) if (v.cells[c] && !cells[c]) { v.remove(c, rand(-1, 1), rand(0, 1.5), rand(-1, 1), n < 40); n++; }
    v.syncing = false;
  }

  /* ------------------------------------ frame ------------------------------------ */

  update(dt) {
    if (this.mode !== 'mirror') return;
    const now = this.g.time;
    // cars and helicopters first: the people in them are put in them
    for (const G of this.ghosts.values()) if (G.obj && (G.ty === 'c' || G.ty === 'a')) G.ty === 'c' ? this._driveCar(G, now, dt) : this._driveHeli(G, now, dt);
    for (const G of this.ghosts.values()) if (G.obj && G.ty === 'h') this._drivePerson(G, now, dt);
    for (const G of this.ghosts.values()) if (G.obj && G.ty === 'o') this._driveObject(G, now, dt);
    // what we did to the host's things, a few times a second
    if ((this.flushT -= dt) <= 0) { this.flushT = 0.1; this._flush(); }
    // what we handed over, given up waiting for
    for (let i = this.handing.length - 1; i >= 0; i--) if (now > this.handing[i].until) { this._dropLocal(this.handing[i]); this.handing.splice(i, 1); }
  }

  _drivePerson(G, now, dt) {
    const h = G.obj, r = this._between(G, now);
    if (!r || h.removed) return;
    const { a, b, k } = r;
    // in a car or a helicopter: the pose is in its frame, and goes where it is now
    let F = null;
    if (b.frame) { const fr = this.ghosts.get(b.frame); F = fr && fr.obj && fr.obj.group; if (!F) return; }
    const A = (a.frame || '') === (b.frame || '') ? a.pose : b.pose, B = b.pose;
    for (let i = 0; i < PART_COUNT; i++) {
      const o = i * 7;
      _pa[o] = A[o] + (B[o] - A[o]) * k; _pa[o + 1] = A[o + 1] + (B[o + 1] - A[o + 1]) * k; _pa[o + 2] = A[o + 2] + (B[o + 2] - A[o + 2]) * k;
      nlerp(A[o + 3], A[o + 4], A[o + 5], A[o + 6], B[o + 3], B[o + 4], B[o + 5], B[o + 6], k, _pa, o + 3);
    }
    if (F) {
      const fp = F.position, fq = F.quaternion, qx = fq.x, qy = fq.y, qz = fq.z, qw = fq.w;
      for (let i = 0; i < PART_COUNT; i++) {
        const o = i * 7, x = _pa[o], y = _pa[o + 1], z = _pa[o + 2];
        const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
        _pa[o] = fp.x + x + qw * tx + (qy * tz - qz * ty); _pa[o + 1] = fp.y + y + qw * ty + (qz * tx - qx * tz); _pa[o + 2] = fp.z + z + qw * tz + (qx * ty - qy * tx);
        const bx = _pa[o + 3], by = _pa[o + 4], bz = _pa[o + 5], bw = _pa[o + 6];
        _pa[o + 3] = qw * bx + qx * bw + qy * bz - qz * by; _pa[o + 4] = qw * by - qx * bz + qy * bw + qz * bx;
        _pa[o + 5] = qw * bz + qx * by - qy * bx + qz * bw; _pa[o + 6] = qw * bw - qx * bx - qy * by - qz * bz;
      }
    }
    // a jump too far to have walked: they were put somewhere
    const jump = Math.hypot(B[0] - A[0], B[2] - A[2]) > 4;
    for (let i = 0; i < PART_COUNT; i++) {
      if (!h.attached[i] || h.gone[i]) continue;
      const o = i * 7, body = h.bodies[i];
      if (!body.kinematic) body.setKinematic(true);
      body.setPose(_pa[o], _pa[o + 1], _pa[o + 2], _pa[o + 3], _pa[o + 4], _pa[o + 5], _pa[o + 6], jump ? 0 : dt);
    }
    if (h.hidden && !(h.costume && h.costume.form)) h.hidden = false;
    const pel = h.bodies[P.PELVIS], ch = h.bodies[P.CHEST];
    h.x = pel.px; h.z = pel.pz; h.y = F ? pel.py - 0.9 * h.scale : groundHeight(h.x, h.z);
    h.vx = pel.vx; h.vz = pel.vz; h.speed = Math.hypot(pel.vx, pel.vz);
    h.yaw = Math.atan2(2 * (ch.qx * ch.qz + ch.qw * ch.qy), 1 - 2 * (ch.qx * ch.qx + ch.qy * ch.qy));
    h.state = b.st;
    flames(this.g, h, dt);
  }

  _driveObject(G, now, dt) {
    const o = G.obj, r = this._between(G, now);
    if (!r || o.removed) return;
    const { a, b, k } = r, body = o.body;
    if (!body) return;
    nlerp(a.q[0], a.q[1], a.q[2], a.q[3], b.q[0], b.q[1], b.q[2], b.q[3], k, _a, 0);
    const jump = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]) > 6;
    if (!body.kinematic) body.setKinematic(true);
    body.setPose(a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k, _a[0], _a[1], _a[2], _a[3], jump ? 0 : dt);
    const t = o.thing;
    if (t) { const x = b.ex; t.on = !!(x & 1); t.netLit = !!(x & 2); t.running = !!(x & 4); if ((x & 8) && !t.broken) this.g.things?.smash?.(t); }
    if (o.item) o.item.ammo = b.ex;
  }

  _driveCar(G, now, dt) {
    const car = G.obj, r = this._between(G, now);
    if (!r || car.removed) return;
    const { a, b, k } = r;
    if (b.wreck) {
      if (!car.wreck) {
        // a free body from now on, on the host: here, a body the size of the whole car, moved by what they send
        car.wreck = true; car.mode = 'mirror';
        car.wreckCy = car.van ? 0.82 : 0.76;
        car.body.setBox(BODY.hx, car.wreckCy, BODY.hz, car.spec.mass * 0.9, true);
        car.body.setKinematic(true);
      }
      const A = a.wreck ? a : b;
      nlerp(A.q[0], A.q[1], A.q[2], A.q[3], b.q[0], b.q[1], b.q[2], b.q[3], k, _a, 0);
      car.body.setPose(A.p[0] + (b.p[0] - A.p[0]) * k, A.p[1] + (b.p[1] - A.p[1]) * k, A.p[2] + (b.p[2] - A.p[2]) * k, _a[0], _a[1], _a[2], _a[3], dt);
      car.follow();
    } else {
      const A = a.wreck ? b : a, l = (u, v) => u + (v - u) * k;
      let dy = b.yaw - A.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      car.x = l(A.x, b.x); car.y = l(A.y, b.y); car.z = l(A.z, b.z); car.yaw = A.yaw + dy * k;
      car.pitch = l(A.pitch, b.pitch); car.roll = l(A.roll, b.roll); car.steer = b.steer; car.spin = l(A.spin, b.spin);
      const span = Math.max(0.05, b.t - A.t);
      car.vx = (b.x - A.x) / span; car.vz = (b.z - A.z) / span; car.speed = Math.hypot(car.vx, car.vz);
      car.siren = b.siren;
      car.place(dt);
    }
    car.hp = b.hp;
    if (b.fire && car.fire < 0) car.fire = 0; else if (!b.fire) car.fire = -1;
    if (b.glass) (car.windows || []).forEach((w, i) => { if (w && !w.broken && (b.glass & (1 << i))) car.breakGlass(i); });
    car.draw(dt);
  }

  _driveHeli(G, now, dt) {
    const hl = G.obj, r = this._between(G, now);
    if (!r || hl.removed) return;
    const { a, b, k } = r, l = (u, v) => u + (v - u) * k;
    let dy = b.yaw - a.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    hl.x = l(a.x, b.x); hl.y = l(a.y, b.y); hl.z = l(a.z, b.z); hl.yaw = a.yaw + dy * k; hl.pitch = l(a.pitch, b.pitch); hl.roll = l(a.roll, b.roll);
    hl.down = b.down;
    hl.place();
  }

  /* ----------------------------- what we do to theirs ----------------------------- */

  /** A knock on one of the host's things (a round, a blow, a blast): added up, and sent. */
  _pushed(G, ix, iy, iz, wx, wy, wz) {
    if (this.mode !== 'mirror') return;
    let p = this.pushes.get(G.key);
    if (!p) { p = { G, i: [0, 0, 0], at: null }; this.pushes.set(G.key, p); }
    p.i[0] += ix; p.i[1] += iy; p.i[2] += iz;
    if (wx !== undefined) p.at = [wx, wy, wz];
  }
  /** Cubes knocked out of one of the host's walls (not the ones the host has told us of). */
  voxLost(v, c) {
    const G = v.mirror;
    if (!G || this.mode !== 'mirror') return;
    let L = this.lost.get(G.key);
    if (!L) { L = { G, cells: [] }; this.lost.set(G.key, L); }
    if (L.cells.length < 300) L.cells.push(c);
  }
  _flush() {
    const mp = this.mp;
    for (const p of this.pushes.values()) {
      const at = p.at || [p.G.obj?.body?.px ?? 0, p.G.obj?.body?.py ?? 0, p.G.obj?.body?.pz ?? 0];
      if (Math.hypot(...p.i) > 0.05) mp._emit('pi', b36(p.G.id), p.i.map(r2), at.map(r2));
    }
    this.pushes.clear();
    for (const L of this.lost.values()) {
      // a lot at once goes as a few events
      for (let i = 0; i < L.cells.length; i += 120) mp._emit('vc', b36(L.G.id), L.cells.slice(i, i + 120));
    }
    this.lost.clear();
  }

  /** A gun (or anything) of theirs picked up: it is ours now, and gone from their city. */
  picked(item) {
    const G = item.mirror;
    if (!G || this.mode !== 'mirror') return;
    item.mirror = null;
    if (item.prop) item.prop.mirror = null;
    G.obj = null;
    this.ghosts.delete(G.key);
    this.taken.set(G.key, this.g.time + 5);
    this.mp._emit('pk', b36(G.id));
    this.stats.taken++;
  }

  /** One of their cars, to drive (or to lift): it is ours, till we leave it. Returns false if it cannot be had. */
  takeCar(car) {
    const G = car.mirror;
    if (!G || this.mode !== 'mirror') return true;
    car.mirror = null;
    car.mode = car.wreck ? 'wreck' : 'parked'; car.hand = 1;
    car.taken = true;
    if (car.wreck) car.body.setKinematic(false);
    G.obj = null;
    this.ghosts.delete(G.key);
    this.taken.set(G.key, this.g.time + 5);
    this.mp._emit('tk', b36(G.id));
    this.stats.taken++;
    return true;
  }

  /** Something of ours that belongs in the host's city now (a gun dropped, a rock or a car thrown or let go, a car got out of). */
  handOff(kind, obj) {
    if (this.mode !== 'mirror') return;
    const g = this.g, nonce = Math.random().toString(36).slice(2, 9);
    if (kind === 'item') {
      const it = obj, b = it.body;
      if (!b) return;
      this.mp._emit('dr', nonce, it.type, it.ammo | 0, [r2(b.px), r2(b.py), r2(b.pz)], [r2(b.vx), r2(b.vy), r2(b.vz)]);
    } else if (kind === 'rock') {
      const b = obj.body;
      this.mp._emit('rk', nonce, r3(b.hx / 0.4), [r2(b.px), r2(b.py), r2(b.pz)], [r3(b.qx), r3(b.qy), r3(b.qz), r3(b.qw)], [r2(b.vx), r2(b.vy), r2(b.vz)]);
    } else if (kind === 'car') {
      const car = obj, b = car.body;
      if (car.wreck) this.mp._emit('rc', nonce, car.kind, car.paint, 1, [r2(b.px), r2(b.py), r2(b.pz)], [r3(b.qx), r3(b.qy), r3(b.qz), r3(b.qw)], [r2(b.vx), r2(b.vy), r2(b.vz)], [r2(b.wx), r2(b.wy), r2(b.wz)], Math.round(car.hp));
      else this.mp._emit('rc', nonce, car.kind, car.paint, 0, [r2(car.x), r2(car.y), r2(car.z)], [r3(car.yaw), r3(car.pitch), r3(car.roll)], [0, 0, 0], [0, 0, 0], Math.round(car.hp));
      car.handed = true;
    } else return;
    this.handing.push({ nonce, kind, obj, until: g.time + 4 });
    this.stats.handed++;
  }
  /** The host has it: ours goes. */
  _back(nonce) {
    const i = this.handing.findIndex((H) => H.nonce === nonce);
    if (i < 0) return;
    this._dropLocal(this.handing[i]);
    this.handing.splice(i, 1);
    this.stats.back++;
  }
  _dropLocal(H) {
    const g = this.g, o = H.obj;
    if (H.kind === 'item') { if (!o.holder && g.weapons?.items.includes(o)) g.weapons.remove(o); }
    else if (H.kind === 'rock') { if (!o.removed && !o.carried) g.removeProp(o); }
    else if (H.kind === 'car') { if (!o.removed && !o.seats.some((h) => h && h.isPlayer) && !o.carried) g.traffic?.remove(o); }
  }

  /** Every frame: a car of ours, left standing with nobody in it, goes back to the host's city. */
  tidy(dt) {
    if (this.mode !== 'mirror' || !this.g.traffic) return;
    for (const car of this.g.traffic.cars) {
      if (car.mirror || car.handed || car.carried || car.seats.some((h) => h && h.isPlayer)) continue;
      const still = Math.hypot(car.body.vx, car.body.vy, car.body.vz) < 0.4 && Math.abs(car.speed || 0) < 0.4;
      car.idleT = still ? (car.idleT || 0) + dt : 0;
      if (car.idleT > 1.2) this.handOff('car', car);
    }
  }

  /* --------------------------- the host, hearing from them --------------------------- */

  /** Something another player did to this city (the host's). */
  hostEvent(r, e) {
    const g = this.g, kind = e[1];
    if (this.mode !== 'host') return false;
    const person = (s) => { const h = this.index.h.get(unb36(s)); return h && !h.removed ? h : null; };
    const thing = (s) => { const o = this.index.o.get(unb36(s)); return o && !o.removed ? o : null; };
    this.stats.events++;
    switch (kind) {
      case 'iq': {
        // somebody has missed hearing about something: it goes out again, all of it
        if (typeof e[2] !== 'string' || e[2].length > 600) return true;
        for (const key of e[2].split(',').slice(0, 40)) { const c = this.rec.get(key); if (c) { c.intros = Math.min(c.intros, 1); c.it = -1e9; c.t = -1e9; c.qsig = ''; c.mv = -1; } }
        return true;
      }
      case 'nh': { const h = person(e[2]); if (h && r.h) this.mp.applyHit(h, e[3], r.h); return true; }
      case 'nsv': { const h = person(e[2]); if (h && r.h) h.shove(num(e[3], -20, 20), num(e[4], -20, 20), num(e[5], 0, 160), r.h); return true; }
      case 'ntz': { const h = person(e[2]); if (h) h.tase(num(e[3], 0, 6), r.h, e[4] === 'shock' ? 'shock' : 'taser'); return true; }
      case 'nbr': { const h = person(e[2]); if (h) g.fire?.ignite(h, num(e[3], 0, PART_COUNT - 1) | 0, num(e[4], 0, 1), r.h, word(e[5]) || 'flamethrower'); return true; }
      case 'nfz': {
        const h = person(e[2]);
        if (h && Array.isArray(e[3])) for (let i = 0; i < Math.min(PART_COUNT, e[3].length); i++) { const n = num(e[3][i], 0, 1); if (n > 0.004) g.frost?.chill(h, i, n, r.h, word(e[4]) || 'frostthrower'); }
        return true;
      }
      case 'nfl': { const h = person(e[2]); if (h) g.powers?._fly(h, num(e[3], -30, 30), num(e[4], -30, 30), num(e[5], -30, 30), r.h); return true; }
      case 'ncr': { const h = person(e[2]); if (h && r.car) { r.car.vx = num(e[4], -60, 60); r.car.vz = num(e[5], -60, 60); h.struckByCar(r.car, num(e[3], 0, 60)); } return true; }
      case 'pi': {
        const o = thing(e[2]), i = vec(e[3], 5e4), at = vec(e[4], 1e5);
        if (o && i && !o.carried) { const b = o.body; if (at) b.applyImpulse(i[0], i[1], i[2], at[0], at[1], at[2]); else b.applyImpulse(i[0], i[1], i[2]); }
        return true;
      }
      case 'vc': {
        const o = thing(e[2]), v = o && o.vox;
        if (v && Array.isArray(e[3])) for (const c of e[3].slice(0, 300)) { const n = c | 0; if (n >= 0 && n < v.N && v.cells[n]) v.remove(n, rand(-1, 1), rand(0, 2), rand(-1, 1)); }
        return true;
      }
      case 'pk': { const o = thing(e[2]); if (o && o.item && g.weapons && !o.item.holder) g.weapons.remove(o.item); return true; }
      case 'nk': {
        // a gun (or the like) taken off one of the city's people, who was in no state to keep it
        const h = person(e[2]), t = word(e[3]), it = h && t && (h.kit || []).find((x) => x.type === t);
        if (it && g.weapons) g.weapons.remove(it);
        return true;
      }
      case 'dr': {
        const t = word(e[3]), p = vec(e[5], 1e4), v = vec(e[6], 60), W = g.weapons;
        if (!W || !t || !WEAPONS[t] || t === 'fists' || !p) return true;
        const it = W._make(t);
        W._toGround(it, p[0], p[1], p[2], 0, v || [0, 0, 0]);
        it.ammo = num(e[4], 0, 999, it.ammo);
        it.prop.nonce = typeof e[2] === 'string' ? e[2].slice(0, 12) : '';
        return true;
      }
      case 'rk': {
        const p = vec(e[4], 1e4), v = vec(e[6], 80);
        if (!p || !g.powers) return true;
        const rock = g.powers._makeRock(p[0], p[1], p[2], num(e[3], 0.85, 1.2, 1));
        const q = Array.isArray(e[5]) && e[5].length === 4 ? e[5].map((x) => num(x, -1, 1)) : [0, 0, 0, 1], l = Math.hypot(...q) || 1;
        const b = rock.body;
        b.qx = q[0] / l; b.qy = q[1] / l; b.qz = q[2] / l; b.qw = q[3] / l;
        if (v) { b.vx = v[0]; b.vy = v[1]; b.vz = v[2]; b.wx = rand(-3, 3); b.wz = rand(-3, 3); }
        rock.thrownBy = r.h; rock.nonce = typeof e[2] === 'string' ? e[2].slice(0, 12) : '';
        b.skipIsland = r.h ? r.h.island : null;
        g.powers?.later.push({ t: 0.5, fn: () => { b.skipIsland = null; } });
        return true;
      }
      case 'tk': {
        const car = this.index.c.get(unb36(e[2]));
        if (!car || car.removed || car.seats.some((h) => h && (h.isPlayer || h.puppet))) return true;
        // whoever was in it gets out, and the car is theirs
        for (const h of car.seats.slice()) if (h) { g.traffic.unseat(h); if (!h.h.conscious) h.toRagdoll(); }
        g.traffic.remove(car);
        return true;
      }
      case 'rc': {
        const p = vec(e[6], 1e4);
        if (!p || !g.traffic) return true;
        const car = g.traffic._make(CARS.has(e[3]) ? e[3] : 'sedan', num(e[4], 0, 0xffffff, 0xb8312b) | 0);
        car.nonce = typeof e[2] === 'string' ? e[2].slice(0, 12) : '';
        car.hp = num(e[10], 0, 100, 100);
        if (e[5] === 1) {
          const q = Array.isArray(e[7]) && e[7].length === 4 ? e[7].map((x) => num(x, -1, 1)) : [0, 0, 0, 1], l = Math.hypot(...q) || 1;
          car.x = p[0]; car.y = p[1] - (car.van ? 0.82 : 0.76); car.z = p[2]; car.place(0);
          const v = vec(e[8], 80) || [0, 0, 0], w = vec(e[9], 30) || [0, 0, 0];
          g.traffic.fling(car, v[0], v[1], v[2], 0, r.h);
          const b = car.body;
          b.teleport(p[0], p[1], p[2]); b.qx = q[0] / l; b.qy = q[1] / l; b.qz = q[2] / l; b.qw = q[3] / l;
          b.wx = w[0]; b.wy = w[1]; b.wz = w[2];
          car.follow();
        } else {
          const a = vec(e[7], 50) || [0, 0, 0];
          car.x = p[0]; car.y = p[1]; car.z = p[2]; car.yaw = a[0]; car.pitch = a[1]; car.roll = a[2];
          car.mode = 'parked'; car.hand = 1; car.traffic = false;
          car.place(0);
        }
        return true;
      }
      case 'kc': {
        const car = this.index.c.get(unb36(e[2])), v = vec(e[3], 40);
        if (car && v && !car.removed && !car.seats.some((h) => h && (h.isPlayer || h.puppet))) g.traffic.fling(car, v[0], v[1], v[2], num(e[4], 0, 4), r.h);
        return true;
      }
      default: return false;
    }
  }

  /* --------------------------- the host's people, heard --------------------------- */

  /** One of the host's people, as their stand-in here (by the id the host gave them). */
  person(id) { const G = this.ghosts.get('h' + id); return G && G.obj && !G.obj.removed ? G.obj : null; }

  /** What the host's people did that shows or sounds (a shot, a word, a wound, a tear, a blast). */
  fxEvent(e) {
    const g = this.g, kind = e[1];
    if (this.mode !== 'mirror') return false;
    switch (kind) {
      case 'ns': { const h = this.person(unb36(e[2])), text = clean(e[3], 140); if (h && text) g.speech?.say(h, text, { shout: e[4] === 1 }); return true; }
      case 'ng': {
        const h = this.person(unb36(e[2])), t = word(e[3]), m = vec(e[4], 1e4), d = vec(e[5], 1.01);
        if (h && t && m && d && WEAPONS[t] && WEAPONS[t].gun) g.weapons?.ghostShot(h, t, m, d);
        return true;
      }
      case 'nw': {
        const h = this.person(unb36(e[2])), part = num(e[3], 0, PART_COUNT - 1) | 0, lp = vec(e[5], 1), ln = vec(e[6], 1.01);
        if (!h || !lp || !ln || h.gone[part]) return true;
        g.gore.mark(h, part, e[4] === 'bullet' ? 'entry' : e[4] === 'blunt' ? 'bruise' : 'slash', lp, ln, e[4] === 'bullet' ? 0.05 : 0.07);
        h.bodies[part].toWorld(lp[0], lp[1], lp[2], _b);
        g.gore.burst(_b[0], _b[1], _b[2], 0, 0.5, 0, e[4] === 'blunt' ? 2 : 6, 1.6);
        return true;
      }
      case 'nt': {
        const h = this.person(unb36(e[2])), part = num(e[3], 0, PART_COUNT - 1) | 0, lp = vec(e[5], 1), ln = vec(e[6], 1.01);
        if (h && lp && ln) h.tearMark(part, e[4] === 'rip' ? 'rip' : 'tear', lp, ln, num(e[7], 0.01, 0.2, 0.05));
        return true;
      }
      case 'bm': {
        const p = vec(e[2], 1e4);
        if (p) this._boom(p[0], p[1], p[2], num(e[3], 0.2, 3, 1));
        return true;
      }
      default: return false;
    }
  }

  /** A blast in the host's city, as it looks and sounds from here (it has done its damage there). */
  _boom(x, y, z, k) {
    const g = this.g;
    g.audio?.at('explosion', x, y, z, 1);
    for (let i = 0; i < 6; i++) g.gore.puff('flash', x + rand(-1, 1) * k, y + rand(0, 1.2), z + rand(-1, 1) * k, rand(1.6, 2.6) * k, rand(0.12, 0.22), 1, 0.7, 0.3);
    for (let i = 0; i < 10; i++) g.gore.puff('smoke', x + rand(-1.4, 1.4), y + rand(0.4, 2.2), z + rand(-1.4, 1.4), rand(1.4, 2.4) * k, rand(2.4, 4), 0.14, 0.13, 0.12);
    g.lights?.ask('point', x, y + 1, z, 0xff9040, 40 * k, 18);
    const cam = Math.hypot(g.camX - x, g.camZ - z);
    g.shake = Math.max(g.shake, clamp(1.6 - cam / 18, 0, 1.6));
  }

  /* --------------------------------- becoming host --------------------------------- */

  /**
   * The host has gone and this game is the host now: what it was shown becomes its city. The people are made real
   * (with their looks, what they carry and wear), the things are let go, the cars are parked where they are.
   */
  _promote() {
    const g = this.g, W = g.weapons;
    for (const G of [...this.ghosts.values()]) {
      const o = G.obj;
      if (!o) continue;
      if (G.ty === 'h') {
        if (o.removed) continue;
        if (o.h.alive && !o.car) {
          const h = g.spawnHuman(o.x, o.z, o.yaw, o.look);
          if (h) {
            h.officer = !!(o.ghostOf & 1); h.swat = !!(o.ghostOf & 2);
            if (o.vest) h.wearVest(o.vest.kind); if (o.helmet) h.wearHelmet(o.helmet.kind);
            if (W) for (const it of o.kit || []) W.give(h, it.type, it === o.weapon);
          }
        }
        g.powers?.dress?.(o, null);
        g.removeHuman(o);
      } else if (G.ty === 'o') {
        o.mirror = null;
        if (o.body) { o.body.onPush = null; if (!(o.vox && o.vox.anchored)) o.body.setKinematic(false); o.island?.wake?.(); }
        if (o.item) o.item.mirror = null;
        if (o.thing) o.thing.mirror = null;
        if (o.vox) o.vox.mirror = null;
      } else if (G.ty === 'c') {
        o.mirror = null; o.mode = o.wreck ? 'wreck' : 'parked'; o.hand = 1;
        if (o.wreck) { o.body.setKinematic(false); o.island.mover = false; o.island.wake?.(); }
      } else if (G.ty === 'a') g.air?.remove(o);
    }
    this.ghosts.clear();
    this.stats.promoted++;
  }
}

export { packLook, unpackLook, rle, unrle };
