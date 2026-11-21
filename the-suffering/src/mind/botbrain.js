/* =============================================================================
   A bot player's hands and feet, eyes and ears.

   A bot is a person in the city played by something other than you. It does
   what a player can: walks and runs, jumps and crouches, picks things up and
   puts armour on, draws, reloads, holsters and drops, fights with fists or
   whatever it is holding, gets into cars and out of them, and talks. It cannot
   spawn anything or use abilities unless it is the host.

   Every few seconds it decides what to do next. With a Claude API key that
   decision is Claude's (botminds.js), from a plain account of what the bot can
   see, hear and feel, written here by observe(); without one, a simple brain
   of its own (decideHere) chooses by its playstyle. Either way the decision is
   one action and some words, and this carries the action out, frame by frame,
   with the moves the city's own people use.
   ========================================================================== */
import { Brain } from './brain.js';
import { ST } from '../human/human.js';
import { P } from '../human/rig.js';
import { WEAPONS } from '../combat/weapons.js';
import { clamp, rand, chance, pick, wrapAngle } from '../core/util.js';

/** The actions a bot can take. The last two only the host may. */
export const ACTIONS = ['wander', 'move_to', 'follow', 'flee', 'attack', 'pick_up', 'equip', 'holster', 'reload', 'drop', 'enter_car', 'exit_car', 'crouch', 'jump', 'wait', 'spawn', 'tempest_kick'];
/** What a host may spawn. */
export const SPAWNABLE = ['crate', 'human', 'officer', 'car', 'm1911', 'glock', 'ak47', 'm4a1', 'musket', 'blunderbuss', 'knife', 'machete', 'sword', 'crowbar', 'vest', 'helmet'];

const NOKIT = [];
const _d1 = [0, 0, 0], _d2 = [0, 0, 0];
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
/** Things a bot fights with (not the taser's wires or the tools). */
const FIGHTS = (it) => !!it && !it.def.tool && !it.def.rope && !it.def.syringe && !it.def.flame && !it.def.wear;

export class BotBrain extends Brain {
  constructor(human, game, bot) {
    super(human, game);
    this.bot = bot;
    this.plan = { action: 'wander', t: 0, target: null, x: 0, z: 0, run: false };
    this.combo = 0; this.swingT = 0; this.aimT = 0; this.sayCool = 0;
    this.result = 'just joined the server';
  }

  /* -------------------------------- deciding ------------------------------- */

  /** Takes a decision ({ action, target, x, z, run, weapon, spawn, say }) and starts on it. */
  setPlan(d, from = 'claude') {
    const h = this.h, g = this.g, mp = this.bot.mp;
    if (!d || h.removed || !h.h.alive) return;
    const action = ACTIONS.includes(d.action) ? d.action : 'wander';
    const plan = { action, t: 0, target: this._resolve(d.target), x: +d.x || 0, z: +d.z || 0, run: !!d.run, weapon: d.weapon || '', spawn: d.spawn || '', from };
    this.plan = plan; this.combo = 0; this.aimT = 0;
    this.bot.lastDecision = { ...d, from, t: g.time };
    // anything that needs its feet gets it out of the car first (at speed, that is a fall)
    if (h.car && action !== 'exit_car' && action !== 'wait' && action !== 'spawn') g.traffic.exit(h);
    if (d.say && this.sayCool <= 0) this.say(d.say);
    // the one-shot ones happen now
    const W = g.weapons, kit = h.kit || NOKIT;
    if (action === 'equip') {
      const it = kit.find((x) => x.type === plan.weapon || x.def.name.toLowerCase() === String(plan.weapon).toLowerCase()) || kit.find(FIGHTS);
      this._done(it ? (W.draw(h, it) ? `took out the ${it.def.name}` : `could not take out the ${it.def.name} right now`) : 'had nothing like that to take out');
    } else if (action === 'holster') this._done(h.weapon ? (W.putAway(h) ? `put away the ${h.weapon.def.name}` : 'could not put it away right now') : 'had nothing in hand');
    else if (action === 'reload') this._done(h.weapon && h.weapon.def.gun ? (W.reloadFor(h) ? `reloading the ${h.weapon.def.name}` : 'could not reload right now') : 'had no gun to reload');
    else if (action === 'drop') { const it = h.weapon; if (it) { W.dropFrom(h); this._done(`dropped the ${it.def.name}`); } else this._done('had nothing to drop'); }
    else if (action === 'exit_car') { if (h.car) { g.traffic.exit(h); this._done('got out of the car'); } else this._done('was not in a car'); }
    else if (action === 'jump') { this.jumpNow = true; this._done('jumped'); }
    else if (action === 'spawn') this._done(this.bot.host ? mp.spawnFor(h, plan.spawn) : 'tried to spawn something, but only the host can');
    else if (action === 'tempest_kick') this._done(this.bot.host ? (g.powers?.botKick(h, plan.target) ? 'did a Tempest Kick' : 'could not kick right now') : 'tried an ability, but only the host can');
  }

  /** An id from an account of the scene ("p12", "w5", "c3") back to the thing. */
  _resolve(id) {
    const g = this.g, s = String(id || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!s) return null;
    const n = Number(s.slice(1));
    if (s[0] === 'p') return g.humans.find((o) => o.id === n && !o.removed) || null;
    if (s[0] === 'w') return g.weapons.items.find((i) => i.uid === n) || null;
    if (s[0] === 'c') return g.traffic?.cars.find((c) => c.uid === n) || null;
    return null;
  }

  _done(result) { this.result = result; this.plan = { action: 'wait', t: 0, target: null, x: 0, z: 0, run: false, idle: true }; this.bot.wantThink?.(0.6); return result; }

  say(text) {
    const h = this.h, g = this.g;
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!text || !h.h.alive || !h.h.conscious) return;
    g.speech?.say(h, text, { shout: /!$/.test(text) || text === text.toUpperCase() && text.length > 3, ai: this.plan.from === 'claude' });
    this.bot.said = { text, t: g.time };
    this.bot.mp.onSpeech(h, text);
    this.sayCool = 1.5;
  }

  /* --------------------------------- frame --------------------------------- */

  update(dt) {
    const h = this.h, it = h.intent, g = this.g, m = this.m;
    it.mx = 0; it.mz = 0; it.run = false; it.crouch = false; it.face = null;
    h.pose.cower = 0; h.pose.handsUp = 0; h.pose.phone = 0; h.pose.call = 0; h.pose.scan = 0;
    this.swingT -= dt; this.sayCool -= dt; this.sayT -= dt;
    if (h.state !== ST.ANIM) h.aimYaw = null;
    if (!h.h.alive || !h.h.conscious) { if (m) m.doing = h.h.alive ? 'unconscious' : 'dead'; return; }
    if (h.car) { this._inCar(dt); return; }
    if (h.state === ST.RAGDOLL) { h.crawlDir = null; h.stayDown = false; return; }
    if (h.state !== ST.ANIM || h.cuffed) return;
    if (this.jumpNow) { it.jump = true; this.jumpNow = false; }
    const pl = this.plan;
    pl.t += dt;
    if (pl.action !== 'attack') { h.aimYaw = null; h.aimPitch = h.weapon && h.weapon.def.gun ? -0.85 : 0; }
    this._act(dt, pl);
    this._traffic(dt);
    this._unstick(dt);
    this._look();
  }

  _act(dt, pl) {
    const h = this.h, g = this.g, T = pl.target;
    if (this.m) this.m.doing = pl.action;
    switch (pl.action) {
      case 'move_to': { if (this._walkTo(pl.x, pl.z, pl.run) < 1.4) this._done(`got to (${Math.round(pl.x)}, ${Math.round(pl.z)})`); break; }
      case 'follow': {
        if (!T || T.removed) { this._done('lost who it was following'); break; }
        const d = Math.hypot(T.x - h.x, T.z - h.z);
        if (d > 2.4) this._walkTo(T.x, T.z, d > 6 || pl.run); else h.intent.face = Math.atan2(T.x - h.x, T.z - h.z);
        if (pl.t > 25) this._done(`followed ${this.bot.mp.label(T)} for a while`);
        break;
      }
      case 'flee': {
        if (!T || T.removed) { this._done('nothing to run from'); break; }
        const dx = h.x - T.x, dz = h.z - T.z, d = Math.hypot(dx, dz) || 1;
        if (d > 32 || pl.t > 14) { this._done(`got away from ${this.bot.mp.label(T)}`); break; }
        this._go(h.x + dx / d * 6, h.z + dz / d * 6, true, 1);
        break;
      }
      case 'attack': this._attack(dt, T); break;
      case 'pick_up': this._pickUp(T); break;
      case 'enter_car': this._car(T); break;
      case 'crouch': h.intent.crouch = true; if (pl.t > 4) this._done('crouched'); break;
      case 'wait': if (T && !T.removed) h.intent.face = Math.atan2(T.x - h.x, T.z - h.z); if (pl.t > 8 && !pl.idle) this._done('waited'); break;
      default: this._wander(dt);
    }
  }

  /** The best thing it has to fight with at this distance. */
  _best(d) {
    const kit = (this.h.kit || NOKIT).filter(FIGHTS);
    const gun = kit.find((x) => x.def.gun && !x.def.taser && (x.ammo > 0 || x.def.mag)) || null;
    const blade = kit.find((x) => x.def.melee) || null;
    if (d > 3 && gun) return gun;
    return blade || gun || null;
  }

  _attack(dt, T) {
    const h = this.h, g = this.g, W = g.weapons, mp = this.bot.mp;
    if (!T || T.removed || T === h) { this._done('nobody there to attack'); return; }
    if (!T.h.alive && this.plan.t > 1.5) { this._done(`${mp.label(T)} is dead`); return; }
    if (T.car && this.plan.t > 6) { this._done(`${mp.label(T)} is in a car`); return; }
    if (this.plan.t > 40) { this._done(`gave up on ${mp.label(T)}`); return; }
    const c = T.bodies[T.gone[P.CHEST] ? P.PELVIS : P.CHEST];
    const dx = T.x - h.x, dz = T.z - h.z, d = Math.hypot(dx, dz) || 1, yaw = Math.atan2(dx, dz);
    // something in the hand to do it with
    const want = this._best(d);
    if (want && h.weapon !== want && !h.swap && !h.reload && !h.anim.busy) W.draw(h, want);
    if (!want && h.weapon && !FIGHTS(h.weapon) && !h.swap) W.putAway(h);
    const w = h.weapon, gun = !!(w && w.def.gun && !w.def.flame);
    const seen = this.m ? this.m.canSeeHuman(T) > 0 || d < 3 : true;
    if (gun) {
      if (!seen && d > 2) this._walkTo(T.x, T.z, true);
      else if (d > 16) this._walkTo(T.x, T.z, true);
      else if (d < 3) this._go(h.x - dx / d * 3, h.z - dz / d * 3, false, 0.8);
      h.intent.face = yaw;
      const eye = h.y + 1.42 * h.scale;
      if (seen && !h.reload && !h.swap) { h.aimYaw = yaw; h.aimPitch = Math.atan2(c.py - eye, d); this.aimT += dt; } else { h.aimYaw = null; h.aimPitch = -0.85; this.aimT = 0; }
      if (!seen || this.aimT < 0.45 || d > 42 || h.reload || h.swap) return;
      if (w.ammo <= 0 && !w.def.taser) { W.reloadFor(h); return; }
      W.npcFire(h, [c.px + T.vx * 0.08, c.py + rand(-0.12, 0.1), c.pz + T.vz * 0.08], this.bot.skill);
      return;
    }
    // close in, and hit them with whatever is in the hand
    h.aimYaw = null;
    const def = w && w.def.melee ? w.def : WEAPONS.fists;
    const reach = (def === WEAPONS.fists ? 0.95 : def.long ? 1.5 : 1.15) * h.scale;
    h.intent.face = yaw; h.guardT = 2;
    if (d > reach) this._walkTo(T.x, T.z, d > 3);
    if (d < reach + 0.4 && !h.anim.busy && this.swingT <= 0) {
      if (def === WEAPONS.fists) W.npcAttack(h, T); else W._swing(h, def.moves[this.combo++ % def.moves.length], def, T);
      this.swingT = rand(0.2, 0.55);
    }
  }

  _pickUp(item) {
    const h = this.h, g = this.g;
    if (!item || !g.weapons.items.includes(item)) { this._done('it was gone'); return; }
    if (!item.body) { this._done(item.holder === h ? 'already had it' : 'somebody else had it'); return; }
    const b = item.body, d = Math.hypot(b.px - h.x, b.pz - h.z);
    if (d > 1.1) { this._walkTo(b.px, b.pz, d > 5); if (this.plan.t > 30) this._done('could not get to it'); return; }
    this._done(g.weapons.takeFor(h, item) ? (item.def.wear ? `put on the ${item.def.name}` : `picked up the ${item.def.name}`) : `could not pick up the ${item.def.name} (hands full, or already wearing one)`);
  }

  _car(car) {
    const h = this.h, g = this.g, T = g.traffic;
    if (!car || !T || !T.cars.includes(car) || !car.drivable) { this._done('there was no car to get into'); return; }
    // whichever front door is on this side of it (from the far one, it climbs across)
    const sp = car.seatAt[0];
    car.toWorld(sp[0] + 0.85, 0, sp[2] + 0.1, _d1);
    car.toWorld(-sp[0] - 0.85, 0, sp[2] + 0.1, _d2);
    const door = Math.hypot(_d2[0] - h.x, _d2[2] - h.z) < Math.hypot(_d1[0] - h.x, _d1[2] - h.z) ? _d2 : _d1;
    const d = Math.hypot(door[0] - h.x, door[2] - h.z);
    if (d > 0.9) {
      if (d > 8) this._walkTo(door[0], door[2], true); else this._go(door[0], door[2], d > 2.5, 1);
      if (this.plan.t > 30) this._done('could not get to the car');
      return;
    }
    if (T.enter(h, car)) { car.ai = { state: 'rejoin', t: 0, stuck: 0 }; this._done('got into the car and drove off'); } else this._done('could not get into the car');
  }

  /* ------------------------------- perceiving ------------------------------ */

  /** Everything this bot can see, hear and feel right now, in plain words, for whoever is deciding. */
  observe() {
    const h = this.h, g = this.g, mp = this.bot.mp, me = this.bot, hh = h.h, W = g.weapons;
    const out = [];
    out.push(`You are ${me.name}${me.host ? ', the host of this server (you alone may spawn things and use Tempest Kick)' : ''}. Your playstyle: ${me.persona.text}`);
    out.push(`Server "${mp.server.name}", ${mp.players.length} players. It is ${g.daylight.mode === 'day' ? 'daytime' : g.daylight.mode}.`);
    const c = hh.condition;
    const kit = (h.kit || NOKIT).map((x) => x.def.name + (x.def.gun && !x.def.flame ? ` (${x.ammo}/${x.def.mag})` : '')).join(', ') || 'nothing';
    const hurt = hh.wounds.filter((w) => w.type !== 'bruise').length;
    out.push(`You: ${c.label.toLowerCase()} (${Math.round(c.pct)}%), blood ${Math.round(hh.bloodPct)}%, stamina ${Math.round(hh.stamina)}%${hurt ? `, ${hurt} wounds` : ''}${hh.pain > 40 ? ', in a lot of pain' : ''}${h.fire && h.burning > 0.1 ? ', ON FIRE' : ''}.`);
    out.push(`Holding: ${h.weapon ? h.weapon.def.name + (h.weapon.def.gun && !h.weapon.def.flame ? ` with ${h.weapon.ammo} rounds` : '') : 'nothing (fists)'}. Carrying: ${kit}. Armour: ${[h.vest && h.vest.def.name, h.helmet && h.helmet.def.name].filter(Boolean).join(', ') || 'none'}.`);
    out.push(`You are at (${Math.round(h.x)}, ${Math.round(h.z)}), facing ${COMPASS[((Math.round(-wrapAngle(h.yaw - Math.PI) / (Math.PI / 4)) % 8) + 8) % 8]}${h.car ? ', in a car' : ''}${h.state !== ST.ANIM ? ', down on the ground' : ''}.`);
    // people in sight
    const seen = [];
    for (const o of g.humans) {
      if (o === h || o.removed) continue;
      const d = Math.hypot(o.x - h.x, o.z - h.z);
      if (d > 45) continue;
      if (d > 2.5 && this.m && this.m.canSeeHuman(o) <= 0) continue;
      seen.push([d, o]);
    }
    seen.sort((a, b) => a[0] - b[0]);
    out.push(seen.length ? 'People you can see:' : 'Nobody in sight.');
    for (const [d, o] of seen.slice(0, 10)) {
      const state = !o.h.alive ? 'dead' : !o.h.conscious ? 'unconscious' : o.car ? 'in a car' : o.state === ST.RAGDOLL ? 'on the ground' : o.state === ST.STUMBLE ? 'staggering' : o.speed > 3 ? 'running' : o.speed > 0.4 ? 'walking' : 'standing';
      const hurtMe = me.hurtBy.get(o.id);
      out.push(`- [p${o.id}] ${mp.label(o, true)}: ${Math.round(d)} m ${this._bearing(o.x, o.z)}, ${state}${o.weapon ? `, holding a ${o.weapon.def.name}` : ''}${o.fire && o.burning > 0.1 ? ', on fire' : ''}${hurtMe && g.time - hurtMe < 30 ? `, hurt you ${Math.round(g.time - hurtMe)} s ago` : ''}.`);
    }
    // things on the ground
    const things = [];
    for (const it of W.items) {
      if (!it.body) continue;
      const d = Math.hypot(it.body.px - h.x, it.body.pz - h.z);
      if (d < 30) things.push([d, it]);
    }
    things.sort((a, b) => a[0] - b[0]);
    if (things.length) {
      out.push('On the ground nearby:');
      for (const [d, it] of things.slice(0, 6)) { if (it.uid == null) it.uid = mp.nextUid(); out.push(`- [w${it.uid}] ${it.def.name}: ${Math.round(d)} m ${this._bearing(it.body.px, it.body.pz)}.`); }
    }
    const cars = [];
    for (const car of g.traffic ? g.traffic.cars : NOKIT) {
      const d = Math.hypot(car.x - h.x, car.z - h.z);
      if (d < 26) cars.push([d, car]);
    }
    cars.sort((a, b) => a[0] - b[0]);
    if (cars.length) {
      out.push('Cars nearby:');
      for (const [d, car] of cars.slice(0, 4)) { if (car.uid == null) car.uid = mp.nextUid(); out.push(`- [c${car.uid}] ${car.van ? 'van' : car.police ? 'police car' : 'car'}, ${!car.drivable ? 'wrecked' : car.seats[0] ? 'with a driver' : 'empty'}: ${Math.round(d)} m ${this._bearing(car.x, car.z)}.`); }
    }
    // what it has seen, heard and felt lately (in its own words)
    const now = g.time, mem = this.m ? this.m.memory.filter((x) => now - x.t < 25 && x.sal >= 0.2).slice(-8) : [];
    if (mem.length) { out.push('Lately you:'); for (const x of mem) out.push(`- ${Math.round(now - x.t)} s ago: ${x.text}`); }
    out.push(`Your last action: ${me.lastDecision ? me.lastDecision.action : 'none'}. What came of it: ${this.result}.`);
    if (me.said && now - me.said.t < 30) out.push(`You last said: "${me.said.text}"`);
    out.push(`You have ${me.kills} kills and ${me.deaths} deaths.`);
    return out.join('\n');
  }

  _bearing(x, z) {
    const h = this.h, dx = x - h.x, dz = z - h.z;
    const a = wrapAngle(Math.atan2(dx, dz) - h.yaw);
    return Math.abs(a) < 0.5 ? 'ahead' : Math.abs(a) > 2.4 ? 'behind you' : a > 0 ? (Math.abs(a) < 1.3 ? 'ahead to your left' : 'to your left') : (Math.abs(a) < 1.3 ? 'ahead to your right' : 'to your right');
  }

  /* ------------------------------ its own brain ---------------------------- */

  /** Without Claude: a decision from the playstyle and what is around, in the same shape as Claude's; null to carry on as it is. */
  decideHere() {
    const h = this.h, g = this.g, me = this.bot, mp = me.mp, P0 = me.persona.id, now = g.time;
    const d0 = { action: 'wander', target: '', x: 0, z: 0, run: false, weapon: '', spawn: '', say: '' };
    const near = (pred, r = 30) => { let best = null, bd = r; for (const o of g.humans) { if (o === h || o.removed || !pred(o)) continue; const d = Math.hypot(o.x - h.x, o.z - h.z); if (d < bd) { bd = d; best = o; } } return best; };
    const able = (o) => o.h.alive && o.h.conscious && !o.car;
    // somebody hurt it just now
    let foe = null;
    for (const [id, t] of me.hurtBy) if (now - t < 12) { const o = g.humans.find((x) => x.id === id && !x.removed); if (o && able(o)) foe = o; }
    const kit = h.kit || NOKIT, armed = kit.some(FIGHTS);
    const lines = LINES[P0] || LINES.newbie;
    if (chance(0.16)) d0.say = pick(lines);
    // at the wheel: mostly, keep driving
    if (h.car) return chance(0.3) ? { ...d0, action: 'exit_car' } : { ...d0, action: 'wait' };
    // you said something to it just now
    const you = mp.human();
    const spoke = you && you.h.alive && this.m && this.m.memory.some((x) => x.kind === 'speech' && x.data && x.data.src === you && now - x.t < 4);
    if (spoke && !foe) {
      const say = pick(REPLY[P0] || REPLY.newbie);
      if (P0 === 'friendly') return { ...d0, action: 'follow', target: 'p' + you.id, say };
      if (P0 === 'griefer' || P0 === 'aggressive') return { ...d0, action: 'attack', target: 'p' + you.id, run: true, say };
      return { ...d0, action: 'wait', target: 'p' + you.id, say };
    }
    if (foe) {
      if (h.h.condition.pct < 35 && P0 !== 'aggressive' && P0 !== 'griefer') return { ...d0, action: 'flee', target: 'p' + foe.id, say: chance(0.6) ? pick(['STOP!', 'bro stop', 'ok ok i give up', 'leave me alone!']) : '' };
      return { ...d0, action: 'attack', target: 'p' + foe.id, run: true, say: chance(0.5) ? pick(['oh you want to fight?', 'BIG mistake', 'come here!', 'you shot me??']) : '' };
    }
    // nothing new: it carries on with what it was doing
    if (!foe && !this.plan.idle && this.plan.from && this.plan.t < 12) return null;
    // the host, now and then, makes something
    if (me.host && chance(0.18)) return { ...d0, action: 'spawn', spawn: pick(['crate', 'human', 'm1911', 'ak47', 'sword', 'crowbar', 'car', 'knife']), say: chance(0.5) ? pick(['spawning some stuff', 'free guns', 'who wants a car']) : '' };
    // unarmed: something to fight with, if there is one about
    if (!armed && P0 !== 'newbie' && P0 !== 'friendly') {
      let best = null, bd = 28;
      for (const it of g.weapons.items) { if (!it.body || !FIGHTS(it)) continue; const d = Math.hypot(it.body.px - h.x, it.body.pz - h.z); if (d < bd) { bd = d; best = it; } }
      if (best) { if (best.uid == null) best.uid = mp.nextUid(); return { ...d0, action: 'pick_up', target: 'w' + best.uid, run: true }; }
    }
    if (P0 === 'griefer') { const t = mp.human(); if (t && able(t)) return { ...d0, action: 'attack', target: 'p' + t.id, run: true }; }
    if (P0 === 'aggressive' || (P0 === 'camper' && armed)) {
      const t = near((o) => able(o) && (o.bot || o.isPlayer || chance(0.5)), P0 === 'camper' ? 22 : 30);
      if (t) return { ...d0, action: 'attack', target: 'p' + t.id, run: true };
    }
    if (P0 === 'friendly') { const t = mp.human(); if (t && able(t)) return { ...d0, action: 'follow', target: 'p' + t.id }; }
    if (P0 === 'chaotic') {
      const r = Math.random();
      if (r < 0.3 && g.traffic) { let best = null, bd = 22; for (const car of g.traffic.cars) { if (!car.drivable) continue; const d = Math.hypot(car.x - h.x, car.z - h.z); if (d < bd) { bd = d; best = car; } } if (best) { if (best.uid == null) best.uid = mp.nextUid(); return { ...d0, action: 'enter_car', target: 'c' + best.uid, run: true }; } }
      if (r < 0.6) { const t = near((o) => able(o), 18); if (t) return { ...d0, action: 'attack', target: 'p' + t.id, run: true }; }
      if (r < 0.75) return { ...d0, action: 'jump' };
    }
    const s = g.city.randomPavement();
    return chance(0.5) ? { ...d0, action: 'move_to', x: s.x, z: s.z, run: chance(0.4) } : d0;
  }
}

/** What a bot says when there is nobody to put words in its mouth, by playstyle. */
const LINES = {
  aggressive: ['1v1 me', 'who wants it', 'get over here', 'too easy', 'ez', "you're next", 'run.'],
  friendly: ['hey!', 'wanna team up?', "i've got your back", 'gg', 'nice one', 'need help?', "what's up"],
  chaotic: ['LOL', 'watch this', 'yeet', 'chaos time', 'i stole a car lmao', 'wheeee'],
  roleplayer: ['Evening, citizen.', 'Stay safe out there.', 'Anyone seen my dog?', 'Lovely day for it.', 'I work at the hospital, actually.'],
  newbie: ['how do i shoot', 'wait what button', 'where is everyone', 'is this game fun', 'how do you get a gun', 'lol i fell over'],
  griefer: ['found you', 'lol', 'cry about it', 'get rekt', 'stop running'],
  camper: ['...', 'shh', 'i see you', 'nice spot'],
};

/** What a bot says back when you talk to it, by playstyle, when it has no Claude to answer with. */
const REPLY = {
  aggressive: ['talk is cheap', 'you wanna go?', 'nah', 'fight me'],
  friendly: ['sure!', 'yeah lets go', 'hi!! :)', 'ok follow me', 'deal'],
  chaotic: ['lmao what', 'sure why not', 'only if we steal a car', 'yes. chaos.'],
  roleplayer: ['Good day to you.', 'Can I help you, citizen?', 'Sorry, I am late for my shift.', 'Do I know you?'],
  newbie: ['hi! how do i get a gun', 'ok but how do i jump', 'hello?', 'wait are you a real person'],
  griefer: ['no lol', 'found you', 'cry about it', 'who asked'],
  camper: ['shh', 'go away, you will give away my spot', '...'],
};

/** Playstyles: an id, and how it is put to Claude. */
export const PERSONAS = [
  { id: 'aggressive', text: 'aggressive. You like fighting other players and win most fights; you grab weapons fast.' },
  { id: 'friendly', text: 'friendly. You like teaming up with the other players, especially the human one, and helping out; you only fight back.' },
  { id: 'chaotic', text: 'chaotic. You do whatever is funniest: steal cars, start fights with strangers, jump around, cause mayhem.' },
  { id: 'roleplayer', text: 'a roleplayer. You act out being an ordinary resident of the city with a job and a life, and stay in character.' },
  { id: 'newbie', text: 'new to the game. You are still working out the controls, ask questions, and wander about.' },
  { id: 'griefer', text: 'a griefer. You like annoying the other players, the human one most of all: following them, attacking them, stealing their stuff.' },
  { id: 'camper', text: 'a camper. You find a gun, pick a spot with a view, and wait for people to come to you.' },
];
