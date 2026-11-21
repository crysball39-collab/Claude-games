/* =============================================================================
   Multiplayer, bot servers.

   A list of servers (each with its name, its ping and how many players it
   has), joining one of them, and hosting one of your own. For now every
   other player on a server is a bot: a person in the city played by Claude
   (botminds.js) or, without a key, by a brain of its own (botbrain.js), with
   a gamertag over its head, a score and a ping of its own.

   There is no network play yet. The servers are made up here, on this
   device, and so are their pings; everyone on them runs in this page.

   Only the host spawns things and uses abilities. Host a server and that is
   you, as it always is on your own; join somebody else's and it is their
   host, a bot, who can, and you cannot.
   ========================================================================== */
import { BotBrain, PERSONAS, SPAWNABLE } from '../mind/botbrain.js';
import { Brain } from '../mind/brain.js';
import { WEAPONS } from '../combat/weapons.js';
import { ABILITY } from '../combat/powers.js';
import { KERB, groundHeight } from '../world/city.js';
import { rand, randInt, pick, chance, clamp } from '../core/util.js';

/** Regions, and roughly where in the world each one is (degrees east). */
const REGIONS = [
  { id: 'US East', lon: -77 }, { id: 'US West', lon: -122 }, { id: 'EU West', lon: -1 }, { id: 'EU Central', lon: 10 },
  { id: 'Brazil', lon: -47 }, { id: 'Asia', lon: 121 }, { id: 'Australia', lon: 151 },
];
/** The servers there are to join: who plays on each, and how. */
const SERVERS = [
  { name: 'Suffering City 24/7', mode: 'Sandbox', mix: ['chaotic', 'aggressive', 'friendly', 'newbie', 'griefer', 'roleplayer'] },
  { name: 'Chaos Sandbox | no rules', mode: 'Sandbox', mix: ['chaotic', 'chaotic', 'griefer', 'aggressive'] },
  { name: 'Calm City RP (serious)', mode: 'Roleplay', mix: ['roleplayer', 'roleplayer', 'friendly', 'newbie'] },
  { name: 'Gun Range & Chill', mode: 'Deathmatch', mix: ['aggressive', 'camper', 'aggressive', 'friendly'] },
  { name: 'Newbies Welcome :)', mode: 'Free roam', mix: ['newbie', 'newbie', 'friendly', 'roleplayer'] },
  { name: 'Hardcore Downtown', mode: 'Deathmatch', mix: ['aggressive', 'camper', 'griefer'], tod: 'dusk' },
  { name: 'Ragdoll Olympics', mode: 'Free roam', mix: ['chaotic', 'friendly', 'newbie'] },
  { name: 'Late Night Traffic', mode: 'Free roam', mix: ['chaotic', 'roleplayer', 'friendly'], tod: 'night' },
  { name: 'The Quiet Park', mode: 'Roleplay', mix: ['roleplayer', 'friendly'] },
  { name: 'Leopard Gang HQ', mode: 'Sandbox', mix: ['aggressive', 'chaotic', 'griefer', 'friendly'] },
  { name: "Tony's Server", mode: 'Sandbox', mix: ['friendly', 'newbie', 'chaotic'] },
  { name: 'Car Crash Derby', mode: 'Free roam', mix: ['chaotic', 'chaotic', 'aggressive'] },
];
/** At most this many players on a server, you included: everybody is a whole person in this one page. */
export const MAX_PLAYERS = 12;
/** What a bot may start with, by playstyle (it does not always). */
const START = { aggressive: ['glock', 'm1911', 'knife'], camper: ['m1911', 'glock'], griefer: ['knife', 'crowbar'], chaotic: ['crowbar', 'machete'] };
/** What lies about the city when a server starts, to be found. */
const LOOT = ['m1911', 'glock', 'ak47', 'm4a1', 'musket', 'knife', 'machete', 'sword', 'crowbar', 'vest', 'helmet', 'vestM'];
const RESPAWN = 6;               // seconds dead before a bot is back
const TAG_A = ['tired', 'sneaky', 'quiet', 'salty', 'crispy', 'lazy', 'grumpy', 'lucky', 'feral', 'velvet', 'turbo', 'mild', 'spicy', 'soggy', 'cosmic', 'rusty', 'pocket', 'midnight', 'doctor', 'captain', 'lil', 'big', 'zero', 'neon'];
const TAG_B = ['otter', 'pigeon', 'toast', 'bean', 'crate', 'ragdoll', 'goblin', 'noodle', 'wizard', 'moth', 'brick', 'soup', 'gecko', 'badger', 'pickle', 'raven', 'tony', 'kevin', 'nugget', 'spoon', 'yeti', 'ferret', 'waffle', 'leopard'];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** A made-up gamertag nobody on the server has. */
export function gamertag(used = new Set()) {
  for (let k = 0; k < 40; k++) {
    const a = pick(TAG_A), b = pick(TAG_B), r = Math.random();
    const n = r < 0.25 ? a + '_' + b : r < 0.5 ? cap(a) + cap(b) : r < 0.7 ? a + b + randInt(1, 99) : r < 0.88 ? cap(b) + randInt(2, 2009) : 'xX' + cap(b) + 'Xx';
    if (n.length <= 16 && !used.has(n.toLowerCase())) return n;
  }
  return 'player' + randInt(100, 999);
}

/** Roughly where this device is, from its clock: a made-up ping wants a made-up distance. */
const HOME_LON = (() => { try { return clamp(-new Date().getTimezoneOffset() / 4, -180, 180); } catch { return 0; } })();
function pingFor(region) {
  let d = Math.abs(region.lon - HOME_LON) % 360;
  if (d > 180) d = 360 - d;
  return Math.round(14 + d * 0.95 + rand(0, 9));
}

/** One bot player: who it is on the server, and the person it is playing. */
class Bot {
  constructor(mp, name, persona, host = false) {
    this.mp = mp; this.name = name; this.persona = persona; this.host = host;
    this.human = null; this.brain = null;
    this.kills = 0; this.deaths = 0;
    this.ping = randInt(18, 140); this.skill = rand(0.45, 0.85);
    this.thinkT = rand(0.5, 2.5); this.asking = false; this.again = false; this.waitT = 0;
    this.hurtBy = new Map(); this.memT = 0; this.chatT = -99; this.eventT = -99; this.diedAt = null; this.outT = 0; this.cuffT = 0; this.goneT = 0;
    this.lastDecision = null; this.said = null; this.latency = 0; this.claude = 0; this.self = 0;
    this.lastObs = '';
  }
  /** Something happened: decide again within `secs`. */
  wantThink(secs) { this.thinkT = Math.min(this.thinkT, secs); if (this.asking) this.again = true; }
}

export class Multiplayer {
  constructor(game, botMinds, settings, save) {
    this.g = game; this.minds = botMinds; this.settings = settings; this.save = save;
    this.on = false;            // on a server
    this.server = null;
    this.bots = [];
    this.joinQ = []; this.joinT = 0; this.churnT = 0; this.pingT = 0;
    this.servers = [];
    this.uid = 0;
    if (!settings.mpName) { settings.mpName = gamertag(); save?.(); }
    this.you = { name: settings.mpName, kills: 0, deaths: 0, ping: 0, isYou: true };
    this.stats = { hosted: 0, joined: 0, left: 0, bots: 0, kills: 0, respawns: 0, kicked: 0, claude: 0, self: 0, spawned: 0, kicks: 0, refusedSpawn: 0 };
    this.onFeed = null;         // (entry) for the screen
    this.onChange = null;       // the server, or who is on it, changed
    this.refresh();
  }

  /* --------------------------------- asking --------------------------------- */

  /** You are the host: on your own server. */
  get isHost() { return this.on && !!this.server.mine; }
  /** You joined somebody else's server, and the sandbox is theirs. */
  get guest() { return this.on && !this.server.mine; }
  get hostName() { return !this.on ? '' : this.server.mine ? this.you.name : this.server.host; }
  get players() { return this.on ? [this.you, ...this.bots] : []; }
  /** Bots that are in the city right now (some may be waiting to join). */
  get present() { return this.bots.filter((b) => b.human && !b.human.removed); }
  human() { return this.g.player; }
  nextUid() { return ++this.uid; }
  setName(n) {
    n = String(n || '').replace(/[^\w .-]/g, '').trim().slice(0, 16);
    if (!n) return this.you.name;
    this.you.name = this.settings.mpName = n; this.save?.();
    return n;
  }

  /** How somebody is known on the server. `full` adds what they are: a player or one of the city's people. */
  label(o, full = false) {
    if (!o) return 'someone';
    if (o.isPlayer) return this.you.name + (full ? (this.isHost ? ' (player, human, the host)' : ' (player, human)') : '');
    if (o.bot) return o.bot.name + (full ? (o.bot.host ? ' (player, the host)' : ' (player)') : '');
    if (o.officer) return full ? 'a police officer (not a player)' : 'a police officer';
    return o.look.desc + (full ? ' (a resident, not a player)' : '');
  }

  /* ------------------------------- the server list ------------------------------- */

  /** The list, made again: players come and go, and pings move about. */
  refresh() {
    if (!this.servers.length) {
      const used = new Set();
      this.servers = SERVERS.map((s, i) => {
        const region = REGIONS[(i * 3 + randInt(0, 2)) % REGIONS.length];
        const max = pick([6, 8, 10, 12]);
        const host = gamertag(used); used.add(host.toLowerCase());
        return { id: i, name: s.name, mode: s.mode, mix: s.mix, tod: s.tod, region: region.id, lon: region.lon, max, players: clamp(randInt(2, max), 2, max), host, ping: 0 };
      });
    } else {
      for (const s of this.servers) s.players = clamp(s.players + randInt(-1, 1), 1, s.max);
    }
    for (const s of this.servers) s.ping = pingFor(s);
    return this.servers;
  }

  /* -------------------------------- on a server -------------------------------- */

  /** Your own server: the city as it is, and bots joining it over the next few seconds. You are the host. */
  host({ name = '', max = 8, bots = 5 } = {}) {
    if (this.on) this.leave(true);
    const g = this.g;
    max = clamp(Math.round(max) || 8, 2, MAX_PLAYERS);
    bots = clamp(Math.round(bots), 1, max - 1);
    this.server = { name: String(name || '').trim().slice(0, 40) || `${this.you.name}'s server`, mode: 'Sandbox', region: 'This device', max, mine: true, host: this.you.name, ping: 0, mix: PERSONAS.map((p) => p.id), born: g.time };
    this._begin();
    const used = new Set([this.you.name.toLowerCase()]);
    for (let i = 0; i < bots; i++) { const n = gamertag(used); used.add(n.toLowerCase()); this.joinQ.push(new Bot(this, n, this._persona())); }
    this.joinT = 1.2;
    this.stats.hosted++;
    g.ui?.toast(`Your server "${this.server.name}" is up. Bots are joining. You are the host: only you can spawn things and use abilities.`, 4.5);
    this._feed('sys', `${this.you.name} started the server`);
    this.onChange?.();
    return this.server;
  }

  /** Somebody else's server: their city, fresh, with their players already in it. One of them is the host. */
  join(s) {
    if (typeof s === 'number') s = this.servers.find((x) => x.id === s);
    if (!s) return false;
    if (s.players >= s.max) { this.g.ui?.toast(`${s.name} is full.`); return false; }
    if (this.on) this.leave(true);
    const g = this.g;
    this.server = { name: s.name, mode: s.mode, region: s.region, lon: s.lon, max: s.max, mine: false, host: s.host, ping: s.ping, mix: s.mix, tod: s.tod, born: g.time, id: s.id };
    this._freshWorld();
    if (s.tod && g.daylight.mode !== s.tod) g.daylight.set(s.tod);
    this._begin();
    // everybody already playing is there when you arrive; the host first
    const used = new Set([this.you.name.toLowerCase(), s.host.toLowerCase()]);
    const hostBot = new Bot(this, s.host, this._persona(), true);
    this._add(hostBot);
    for (let i = 1; i < s.players; i++) { const n = gamertag(used); used.add(n.toLowerCase()); this._add(new Bot(this, n, this._persona())); }
    s.players++;
    this.churnT = rand(35, 70);
    this.stats.joined++;
    g.ui?.toast(`Joined ${s.name}. ${s.host} is the host: only the host can spawn things and use abilities here.`, 4.5);
    this._feed('sys', `${this.you.name} joined`);
    this.onChange?.();
    return true;
  }

  /** Off the server: everyone on it goes; if it was somebody else's, you are back in your own city. */
  leave(quiet = false) {
    if (!this.on) return;
    const g = this.g, wasGuest = this.guest, name = this.server.name, s = this.servers.find((x) => x.id === this.server.id);
    for (const b of this.bots) this._drop(b);
    this.bots = []; this.joinQ = [];
    if (s && wasGuest) s.players = Math.max(1, s.players - 1);
    this.on = false; this.server = null;
    if (wasGuest) { this._freshWorld(); const tod = this.settings.tod || 'day'; if (g.daylight.mode !== tod) g.daylight.set(tod); }
    this.stats.left++;
    if (!quiet) g.ui?.toast(`Left ${name}.`);
    this.onChange?.();
  }

  _begin() {
    const g = this.g;
    this.on = true; this.bots = []; this.joinQ = [];
    this.you.kills = 0; this.you.deaths = 0; this.you.ping = this.server.ping;
    this.minds.system = null;
    // whatever you had on as the leopard comes off: a guest has no abilities
    if (this.guest) { g.powers?.revert(true); }
    this._scatter();
  }

  /** The city as it is at the start, for somebody else's server: nobody and nothing of yours in it. */
  _freshWorld() {
    const g = this.g, s = this.settings;
    g.grab?.clear();
    g.powers?.revert(true); g.powers?.clear();
    g.respawn(true);
    g.cleanUp('all');
    for (const c of g.city.crateSpots) g.spawnCrate(c[0], KERB + 0.41 + (c[2] ? 0.82 : 0), c[1]);
    g.traffic?.setCount(s.cars);
    for (let i = 0; i < (s.people ?? 12); i++) {
      const p = g.city.randomPavement();
      if (Math.hypot(p.x - g.player.x, p.z - g.player.z) > 11 && g.city.isClear(p.x, p.z, 0.5)) g.spawnHuman(p.x, p.z);
    }
    g.staffStation(true);
  }

  /** Weapons and armour left about the city, for whoever finds them first. */
  _scatter() {
    const g = this.g;
    for (const id of LOOT) {
      for (let k = 0; k < 8; k++) {
        const p = g.city.randomPavement();
        if (Math.hypot(p.x - g.player.x, p.z - g.player.z) < 6 || !g.city.isClear(p.x, p.z, 0.4)) continue;
        g.weapons.spawn(id, p.x, groundHeight(p.x, p.z) + 0.5, p.z);
        break;
      }
    }
  }

  _persona() {
    const mix = this.server && this.server.mix && this.server.mix.length ? this.server.mix : PERSONAS.map((p) => p.id);
    const id = pick(mix);
    return PERSONAS.find((p) => p.id === id) || PERSONAS[0];
  }

  /** A bot arrives on the server, and in the city. */
  _add(b) {
    this.bots.push(b);
    this._body(b);
    this.stats.bots++;
    return b;
  }

  /** A person in the city, played by this bot, somewhere out of the way. */
  _body(b) {
    const g = this.g, p = g.player;
    let at = null;
    for (let k = 0; k < 24 && !at; k++) {
      const s = g.city.randomPavement();
      if (Math.hypot(s.x - p.x, s.z - p.z) < 14 || !g.city.isClear(s.x, s.z, 0.5)) continue;
      if (this.bots.some((o) => o.human && !o.human.removed && Math.hypot(o.human.x - s.x, o.human.z - s.z) < 6)) continue;
      at = s;
    }
    at = at || g.city.randomPavement();
    const h = g.spawnHuman(at.x, at.z);
    h.bot = b; b.human = h;
    h.brain = b.brain = new BotBrain(h, g, b);
    if (h.mind) { h.mind.p.errand = 'playing on the server'; h.mind.note('felt', 'arrive', 'spawned into the city', 0.5); }
    const kit = START[b.persona.id];
    if (kit && chance(0.7)) g.weapons.give(h, pick(kit));
    b.diedAt = null; b.outT = 0; b.cuffT = 0; b.goneT = 0; b.memT = g.time; b.hurtBy.clear();
    b.thinkT = rand(0.3, 1.5); b.waitT = 0;
    return h;
  }

  /** Back again, somewhere else, with a new body; the old one stays where it fell. */
  _respawn(b, why = 'dead') {
    const g = this.g, old = b.human;
    if (old && !old.removed) {
      old.bot = null;
      if (old.h.alive) old.brain = new Brain(old, g);     // left behind, they are just one of the city's people now
      else g.weapons.dropFrom(old, true);                 // what they carried lies beside the body, for anyone
    }
    b.human = null; b.brain = null;
    if (!this.bots.includes(b)) return;
    this._body(b);
    this.stats.respawns++;
    if (why !== 'dead' && why !== 'gone') this._feed('sys', `${b.name} respawned`);
  }

  /** Off the server, and out of the city. */
  _drop(b) {
    const h = b.human;
    if (h && !h.removed) this.g.removeHuman(h);
    b.human = null;
  }

  /** The host sends a bot away. */
  kick(b) {
    if (!this.isHost || !this.bots.includes(b)) return false;
    this._drop(b);
    this.bots.splice(this.bots.indexOf(b), 1);
    this.stats.kicked++;
    this._feed('sys', `${b.name} was kicked`);
    this.onChange?.();
    return true;
  }

  /* ------------------------------ things that happen ------------------------------ */

  /** Somebody was hurt: who did it, and with what, is remembered for the scoreboard; a bot that was hurt thinks again. */
  onHit(h, info) {
    if (!this.on) return;
    const by = info && info.attacker && typeof info.attacker === 'object' ? info.attacker : null;
    h.mpHit = { by, weapon: (info && info.weapon) || null, t: this.g.time };
    if (h.bot && by && by !== h) { h.bot.hurtBy.set(by.id, this.g.time); h.bot.wantThink(0.25); }
  }

  /** Somebody died. A player's death, or a death at a player's hands, goes on the board. */
  onDeath(h) {
    if (!this.on) return;
    const g = this.g;
    const by = h.lastAttacker && typeof h.lastAttacker === 'object' ? h.lastAttacker : null;
    const victim = h.isPlayer ? this.you : h.bot || null;
    const killer = by && by !== h ? (by.isPlayer ? this.you : by.bot || null) : null;
    if (h.bot) h.bot.diedAt = g.time;
    if (!victim && !killer) return;
    if (victim) victim.deaths++;
    if (killer) { killer.kills++; this.stats.kills++; }
    const w = h.mpHit && g.time - h.mpHit.t < 60 && h.mpHit.by === by ? h.mpHit.weapon : null;
    this._feed('kill', killer ? killer.name : by ? this.label(by) : '', weaponName(w), victim ? victim.name : this.label(h), { mine: killer === this.you || victim === this.you });
    // whoever is close and saw it has something to say about it
    for (const b of this.bots) if (b.human && b !== victim && b.human.h.conscious && Math.hypot(b.human.x - h.x, b.human.z - h.z) < 30) b.wantThink(rand(0.4, 1.4));
    this.onChange?.();
  }

  /** Somebody said something: in the feed, as a line of chat, if a player said it. */
  onSpeech(h, text) {
    if (!this.on) return;
    if (h.isPlayer) this._feed('chat', this.you.name, '', text, { mine: true });
    else if (h.bot) this._feed('chat', h.bot.name, '', text, { host: h.bot.host });
  }

  /** The host bot makes something appear in front of it. Returns what came of it, in words. */
  spawnFor(h, what) {
    const g = this.g, b = h.bot;
    if (!b || !b.host || !this.guest) { this.stats.refusedSpawn++; return 'tried to spawn something, but only the host can'; }
    if (!SPAWNABLE.includes(what)) return 'tried to spawn something that is not on the list';
    const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
    const spot = (d) => {
      for (let k = 0; k < 6; k++) { const x = h.x + fx * (d + k * 0.5), z = h.z + fz * (d + k * 0.5); if (g.city.isClear(x, z, 0.45)) return [x, z]; }
      return [h.x + fx * 1.2, h.z + fz * 1.2];
    };
    let x, z, word;
    if (what === 'crate') { [x, z] = spot(2.2); g.spawnCrate(x, groundHeight(x, z) + 1.3, z); word = 'a crate'; }
    else if (what === 'human') {
      [x, z] = spot(2.6);
      const o = g.spawnHuman(x, z, Math.atan2(h.x - x, h.z - z));
      if (o.mind) { o.mind.note('felt', 'arrive', 'found myself standing in the street with no idea how I got here', 0.6); o.mind.stir('surprise', 50); o.mind.ask('sawSpawn', 40, null, rand(0.6, 2)); }
      word = 'a person';
    } else if (what === 'officer') { [x, z] = spot(2.8); g.spawnOfficer(x, z, Math.atan2(h.x - x, h.z - z)); word = 'a police officer'; }
    else if (what === 'car') { [x, z] = spot(5); g.traffic.spawnParked('sedan', x, z, h.yaw + Math.PI / 2); word = 'a car'; }
    else { [x, z] = spot(1.4); g.weapons.spawn(what, x, groundHeight(x, z) + 1.1, z); word = (/^[aeiou]/i.test(WEAPONS[what].name) ? 'an ' : 'a ') + WEAPONS[what].name; }
    g.minds.witness({ kind: 'spawn', what: word, x, y: 1, z });
    this.stats.spawned++;
    this._feed('sys', `${b.name} spawned ${word}`);
    return `spawned ${word} in front of you`;
  }

  _feed(kind, a, w = '', v = '', o = {}) { this.onFeed?.({ kind, a, w, v, t: this.g.time, ...o }); }

  /* ------------------------------------ frame ------------------------------------ */

  update(dt) {
    if (!this.on) return;
    const g = this.g;
    // arriving, one at a time
    if (this.joinQ.length && (this.joinT -= dt) <= 0) {
      const b = this.joinQ.shift();
      if (this.players.length < this.server.max) { this._add(b); this._feed('sys', `${b.name} joined`); this.onChange?.(); }
      this.joinT = rand(0.7, 2.2);
    }
    // on somebody else's server, people come and go
    if (this.guest && (this.churnT -= dt) <= 0) {
      this.churnT = rand(40, 90);
      const others = this.bots.filter((b) => !b.host);
      if (others.length > 1 && chance(0.5)) { const b = pick(others); this._drop(b); this.bots.splice(this.bots.indexOf(b), 1); this._feed('sys', `${b.name} left`); this.onChange?.(); }
      else if (this.players.length < this.server.max) { const used = new Set(this.players.map((p) => p.name.toLowerCase())); const b = this._add(new Bot(this, gamertag(used), this._persona())); this._feed('sys', `${b.name} joined`); this.onChange?.(); }
    }
    for (const b of this.bots) this._tick(b, dt);
    this._think(dt);
    // pings wander a little
    if ((this.pingT -= dt) <= 0) {
      this.pingT = 1.5;
      if (this.guest) this.you.ping = Math.max(8, Math.round(this.server.ping + rand(-6, 9)));
      for (const b of this.bots) b.ping = clamp(Math.round(b.ping + rand(-5, 5)), 12, 220);
    }
  }

  _tick(b, dt) {
    const g = this.g, h = b.human;
    b.thinkT -= dt;
    if (!h || h.removed) {
      // cleaned away by the sandbox, or lost somehow: back in a moment
      b.goneT += dt;
      if (b.goneT > 3) this._respawn(b, 'gone');
      return;
    }
    if (!h.h.alive) {
      if (b.diedAt == null) b.diedAt = g.time;
      if (g.time - b.diedAt > RESPAWN) this._respawn(b, 'dead');
      return;
    }
    // out cold for too long, or in cuffs for too long: back in the game elsewhere
    if (!h.h.conscious) { b.outT += dt; if (b.outT > 30) this._respawn(b, 'out'); return; }
    b.outT = 0;
    if (h.cuffed) { b.cuffT += dt; if (b.cuffT > 45) { this._respawn(b, 'cuffed'); return; } } else b.cuffT = 0;
    // something it saw, heard or felt just now that it should think about: you talking to it, at once;
    // another bot talking, now and then (or they would only ever talk to each other); anything that matters, soon
    const m = h.mind, now = g.time;
    if (m && m.memory.length) {
      const last = m.memory[m.memory.length - 1];
      if (last.t > b.memT) {
        for (const x of m.memory) {
          if (x.t <= b.memT) continue;
          const src = x.kind === 'speech' && x.data ? x.data.src : null;
          if (src && src.isPlayer) { b.wantThink(0.3); break; }
          if (src && src.bot) { if (now - b.chatT > 8 && chance(0.35)) { b.chatT = now; b.wantThink(0.8); } continue; }
          if (x.sal >= 0.6 && now - b.eventT > 2) { b.eventT = now; b.wantThink(0.6); break; }
        }
        b.memT = last.t;
      }
    }
  }

  /** Whoever is due to decide, decides: by Claude where it can, by itself where it cannot. */
  _think(dt) {
    const M = this.minds;
    let due = null;
    for (const b of this.bots) {
      const h = b.human;
      if (!h || h.removed || b.asking || b.thinkT > 0 || !h.h.alive || !h.h.conscious) { if (!b.asking) b.waitT = 0; continue; }
      b.waitT += dt;
      if (!M.usable || M.cooling) { this._self(b); continue; }
      if (!due || b.thinkT < due.thinkT) due = b;
      // waiting its turn for Claude with nothing to do: something of its own in the meantime
      if (b.waitT > 5 && b.brain.plan.idle) { const d = b.brain.decideHere(); if (d) { b.brain.setPlan(d, 'self'); this.stats.self++; b.self++; } b.waitT = 0; }
    }
    if (due && M.ready()) this._ask(due);
  }

  _self(b) {
    const d = b.brain.decideHere();
    if (d) { b.brain.setPlan(d, 'self'); this.stats.self++; b.self++; }
    b.thinkT = rand(3, 6); b.waitT = 0;
  }

  async _ask(b) {
    b.thinkT = 99; b.again = false;
    const d = await this.minds.decide(b);
    if (!this.bots.includes(b) || !b.human || b.human.removed || !b.brain) return;
    if (d) { b.brain.setPlan(d, 'claude'); this.stats.claude++; b.claude++; }
    else { const e = b.brain.decideHere(); if (e) { b.brain.setPlan(e, 'self'); this.stats.self++; b.self++; } }
    b.thinkT = b.again ? 1 : rand(4, 7); b.again = false; b.waitT = 0;
  }
}

/** What a weapon (or a power) is called on the scoreboard. */
const POWER_WORD = { tempest: 'Tempest Kick', slash: 'Tempest Kick', finger: 'Finger Pistol', fireball: "Leo's Flame", flame: "Leo's Flame", swirl: 'Swirling Kick', burst: 'Swirling Kick', maul: 'Full Leopard', bite: 'Full Leopard', claw: 'Hybrid claws', leap: 'Leopard Leap', carjack: 'Carjack', car: 'Car', fall: 'Fall', fire: 'Fire' };
function weaponName(id) {
  if (!id) return '';
  if (WEAPONS[id]) return WEAPONS[id].name;
  if (ABILITY[id]) return ABILITY[id].name;
  return POWER_WORD[id] || cap(String(id));
}
