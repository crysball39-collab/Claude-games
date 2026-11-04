/* =============================================================================
   SUPERPOWERS - flight, super strength, super speed, telekinesis, super
   durability and laser vision: given to anybody from the spawn menu (tap a
   power, then tap them), as many of them at once as you like, and taken away
   again the same way.

   Each power is a module (flight.js, strength.js, speed.js, telekinesis.js,
   durability.js, laser.js) with what it does all the time - how a flier stays
   up, how fast a speedster goes, what a bullet does to skin like stone - and
   ten moves. A move is started by their brain in a fight (or to
   get a friend out of one), or from the inspector, and while it runs it has
   their body (common.js says how a move is put together).

   The rest of the game asks this file: is anything holding them up in the
   air, how fast do they go, did that blow reach them at all (and how much of
   it got through), did a bullet stop short of them or ring off them - and the
   inspector, what can they do.
   ========================================================================== */
import { clamp, rand, chance, sign } from '../../core/util.js';
import { alive, setPhase, now } from './common.js';
import { FLIGHT } from './flight.js';
import { STRENGTH } from './strength.js';
import { SPEED } from './speed.js';
import { TELEKINESIS } from './telekinesis.js';
import { DURABILITY } from './durability.js';
import { LASER } from './laser.js';
import './clips.js';
import './lines.js';

export const POWERS = { flight: FLIGHT, strength: STRENGTH, speed: SPEED, tk: TELEKINESIS, durability: DURABILITY, laser: LASER };
export const POWER_IDS = Object.keys(POWERS);
export const isPower = (k) => !!POWERS[k];

export const hasPower = (man, id) => !!(man && man.powers && man.powers.has(id));
export const powerState = (man, id) => (man && man.powers ? man.powers.get(id) || null : null);

/** Who can be given one: anybody alive and their own size (not a mod's giant). */
export function canHavePowers(man) {
  return !!man && !man.removed && !(man.species && (man.species.giant || man.species.noPowers));
}

/** Gives them a power (true), or takes it away if they have it already (false). */
export function togglePower(man, id) {
  if (hasPower(man, id)) { takePower(man, id); return false; }
  return givePower(man, id);
}

export function givePower(man, id) {
  const P = POWERS[id];
  if (!P || !canHavePowers(man) || hasPower(man, id)) return false;
  if (!man.powers) man.powers = new Map();
  const st = { id, cool: {}, t: 0 };
  man.powers.set(id, st);
  if (P.gain) P.gain(man, st);
  man.sandbox.emit('powerGiven', { who: man, power: id, x: man.wj.chest.x, y: man.wj.chest.y });
  if (man.brain && man.alive && man.conscious) {
    man.brain.speak('got' + P.key, {}, 1, null, true);
    man.brain.note(P.felt);
    man.brain.emo.bump('surprise', 0.6);
  }
  return true;
}

export function takePower(man, id) {
  const st = powerState(man, id);
  if (!st) return false;
  if (man.pmove && man.pmove.power === id) endMove(man, 'lost');
  const P = POWERS[id];
  if (P.lose) P.lose(man, st);
  man.powers.delete(id);
  if (!man.powers.size) man.powers = null;
  man.sandbox.emit('powerTaken', { who: man, power: id, x: man.wj.chest.x, y: man.wj.chest.y });
  if (man.brain && man.alive && man.conscious) man.brain.speak('lost' + P.key, {}, 1, null, true);
  return true;
}

export function clearPowers(man) {
  if (!man.powers) return;
  for (const id of [...man.powers.keys()]) takePower(man, id);
}

/* ------------------------------ every step ------------------------------- */

/** What the powers do every step, and the move running, if there is one. */
export function updatePowers(man, dt) {
  if (!man.powers) return;
  for (const [id, st] of man.powers) { st.t += dt; if (POWERS[id].update) POWERS[id].update(man, st, dt); }
  const m = man.pmove;
  if (!m) return;
  if (!fit(man, m)) { endMove(man, 'stopped'); return; }
  m.t += dt;
  m.pt += dt;
  let go = false;
  try { go = m.def.step(man, m, dt, man.powers.get(m.power)); }
  catch (e) { go = false; console.error(e); }
  if (!go || m.t > (m.def.max || 9)) endMove(man, 'done');
}

/** Still able to carry on with a move: awake, their own, and not knocked about or held. */
function fit(man, m) {
  if (man.removed || man.dead || !man.conscious || man.rag || man.frozenInPlace || man.tied || man.noosed || man.cuffed) return false;
  if (!man.powers || !man.powers.has(m.power)) return false;
  const s = man.state;
  return s === 'stand' || s === 'air' || (m.def.allow && m.def.allow.includes(s));
}

/** Starts a move against (or for) `o`. False if they cannot do it now. */
export function startMove(man, powerId, moveId, o = null, opts = {}) {
  const P = POWERS[powerId], st = powerState(man, powerId);
  if (!P || !st) return false;
  const def = P.moves[moveId];
  if (!def || man.pmove || man.dead || !man.conscious || man.rag || man.frozenInPlace || man.cuffed) return false;
  // (a few start from the floor, or out of somebody's grip: def.allow)
  if (man.state !== 'stand' && man.state !== 'air' && !(def.allow && def.allow.includes(man.state))) return false;
  if (def.needs !== 'none' && !alive(o) && def.needs !== 'friend') return false;
  if (o === man) return false;
  const m = { power: powerId, id: moveId, def, o, t: 0, pt: 0, phase: 'start', data: {}, ...opts };
  if (def.start && def.start(man, m, st) === false) return false;
  man.pmove = m;
  man.dropCarried();
  man.strike = null;
  man.blocking = false;
  man.setPosture(null);
  st.cool[moveId] = now(man);
  st.usedT = now(man);
  man.sandbox.emit('powerMove', { who: man, power: powerId, move: moveId, target: o, x: man.wj.chest.x, y: man.wj.chest.y, loud: true });
  if (def.say && man.brain) man.brain.speak(def.say, o ? { other: o.name } : {}, def.sayP ?? 0.7, o, true);
  return true;
}

export function endMove(man, why = 'done') {
  const m = man.pmove;
  if (!m) return;
  man.pmove = null;
  try { if (m.def.end) m.def.end(man, m, why, powerState(man, m.power)); } catch (e) { console.error(e); }
  if (man.anim && man.anim.actionName && m.def.clips && m.def.clips.includes(man.anim.actionName)) man.anim.stopAction(0.12);
  man.sandbox.emit('powerMoveEnd', { who: man, power: m.power, move: m.id, why });
}

export const moving = (man) => !!(man && man.pmove);

/* ------------------------- what the rest asks of them ------------------------- */

/** In the air: a flier (or someone floating) keeps themselves up. True if a power took care of it. */
export function powersAir(man, dt) {
  if (!man.powers) return false;
  for (const [id, st] of man.powers) if (POWERS[id].air && POWERS[id].air(man, st, dt)) return true;
  return false;
}

/** Coming down: a flier lands as they mean to (or as hard as they mean to). True if taken care of. */
export function powersTouchDown(man, v) {
  if (!man.powers) return false;
  for (const [id, st] of man.powers) if (POWERS[id].touchDown && POWERS[id].touchDown(man, st, v)) return true;
  return false;
}

/** How much faster they go than they would (super speed). */
export function powerSpeed(man, kind) {
  if (!man.powers) return 1;
  let k = 1;
  for (const [id, st] of man.powers) if (POWERS[id].speed) k *= POWERS[id].speed(man, st, kind);
  return k;
}

/** How much faster everything they do plays (super speed: a punch is over before it is seen). */
export function powerTempo(man) {
  if (!man.powers) return 1;
  let k = 1;
  for (const [id, st] of man.powers) if (POWERS[id].tempo) k *= POWERS[id].tempo(man, st);
  return k;
}

/** A blow about to land on them: 'dodged' if a power got them out of the way. */
export function powersBeforeHit(man, h) {
  if (!man.powers) return null;
  for (const [id, st] of man.powers) {
    if (POWERS[id].beforeHit) { const r = POWERS[id].beforeHit(man, st, h); if (r) return r; }
  }
  return null;
}

/** A blow of theirs just landed on `o` (super strength: hard enough, it sends them flying). */
export function powersLanded(man, o, hit, power, s) {
  if (!man.powers) return;
  for (const [id, st] of man.powers) if (POWERS[id].landed) POWERS[id].landed(man, st, o, hit, power, s);
}

/** How much less a blow moves them (super strength: they barely rock). */
export function powerSteady(man) {
  if (!man.powers) return 1;
  let k = 1;
  for (const [id, st] of man.powers) if (POWERS[id].steady) k *= POWERS[id].steady(man, st);
  return k;
}

/** How much of a blow, a cut or a blast gets through to them (super durability: hardly any). */
export function powerArmor(man, h, part, weapon) {
  if (!man.powers) return 1;
  let k = 1;
  for (const [id, st] of man.powers) if (POWERS[id].armor) k *= POWERS[id].armor(man, st, h, part, weapon);
  return k;
}

/** A blow landing on them, before it does anything: a power may make whoever threw it regret it. */
export function powersStruck(man, h) {
  if (!man.powers) return;
  for (const [id, st] of man.powers) if (POWERS[id].struck) POWERS[id].struck(man, st, h);
}

/** A round reaching them: what a power does with it instead (it rings off them) - the energy it goes on with, or null for the usual. */
export function powersShot(man, by, hit, dx, dy, energy) {
  if (!man.powers) return null;
  for (const [id, st] of man.powers) {
    if (POWERS[id].shot) { const r = POWERS[id].shot(man, st, by, hit, dx, dy, energy); if (r !== null && r !== undefined) return r; }
  }
  return null;
}

/** A round on its way: how far along it something stops it (a telekinetic's shield), or null. */
export function stopsRound(man, px, py, dx, dy, range) {
  if (!man.powers) return null;
  for (const [id, st] of man.powers) if (POWERS[id].stopsRound) { const t = POWERS[id].stopsRound(man, st, px, py, dx, dy, range); if (t !== null) return t; }
  return null;
}

/** ...and it stopped there, at (x, y), going (dx, dy). */
export function roundStopped(man, x, y, dx, dy) {
  for (const [id, st] of man.powers || []) if (POWERS[id].roundStopped) { POWERS[id].roundStopped(man, st, x, y, dx, dy); return; }
}

/** How much more dangerous they look to somebody sizing them up. */
export function powerThreat(man) { return man && man.powers ? 1 + man.powers.size * 0.7 : 1; }

// how much of the fear anybody else would feel does not get to them: with one
// power, two thirds of it; with four or more, nine tenths (they are still people)
const COURAGE = [0, 0.65, 0.78, 0.85, 0.9];

/** How little frightens them, 0 (everybody) to 0.9: the brain takes that much off every fear. */
export function powerCourage(man) { return man && man.powers ? COURAGE[Math.min(4, man.powers.size)] : 0; }

/** Their power chips for the inspector. */
export function powerChips(man) { return man.powers ? [...man.powers.keys()].map((id) => POWERS[id].chip) : []; }

/* -------------------------------- the inspector -------------------------------- */

/**
 * A row of buttons for each power they have: its moves, done to whoever they
 * are fighting (or whoever is nearest), and for flight, Fly and Land.
 */
export function powerAbilities(man) {
  if (!man.powers) return [];
  const out = [];
  for (const [id, st] of man.powers) {
    const P = POWERS[id];
    if (P.toggles) for (const t of P.toggles(man, st)) out.push({ ...t, group: id });
    for (const [mid, def] of Object.entries(P.moves)) {
      out.push({
        id: id + ':' + mid, label: def.label, group: id, on: !!man.pmove && man.pmove.power === id && man.pmove.id === mid,
        pick: () => {
          if (man.pmove) endMove(man, 'told');
          const o = targetFor(man, def);
          return startMove(man, id, mid, o, { told: true });
        },
        say: (done) => (done === false ? whyNot(man, def) : `${man.name}: ${def.label}!`),
      });
    }
  }
  return out;
}

export const POWER_ROWS = { flight: 'Flight', strength: 'Strength', speed: 'Speed', tk: 'Telekinesis', durability: 'Durability', laser: 'Laser Vision' };

function whyNot(man, def) {
  if (man.pmove) return `${man.name} is in the middle of something`;
  if (def.needs === 'friend') return `${man.name} has nobody to help`;
  if (def.needs !== 'none' && !targetFor(man, def)) return `There's nobody near enough to ${def.label.toLowerCase()}`;
  return `${man.name} can't do that right now`;
}

/** Who a move is done to: whoever they are fighting, or failing that whoever is nearest (for a rescue, a friend). */
export function targetFor(man, def) {
  if (def.needs === 'none') return null;
  const b = man.brain, sb = man.sandbox;
  if (def.needs === 'friend') {
    let best = null, bd = 1e9;
    for (const p of sb.people) {
      if (p === man || !alive(p) || p.heldBy) continue;
      const d = Math.abs(p.pos.x - man.pos.x);
      const like = b ? b.rel(p).like : 0;
      const k = d - (like > 0.3 ? 4 : 0) - (p.lying ? 2 : 0);
      if (d < 25 && k < bd) { bd = k; best = p; }
    }
    return best;
  }
  const bh = b && b.behaviour;
  if (bh && bh.target && alive(bh.target) && bh.target !== man) return bh.target;
  let best = null, bd = 1e9;
  for (const p of sb.people) {
    if (p === man || !alive(p) || p.heldBy === man) continue;
    if (p.species && p.species.giant) continue;
    const d = Math.abs(p.pos.x - man.pos.x) + Math.abs(p.pos.y - man.pos.y) * 0.5;
    const dislike = b ? -b.rel(p).like : 0;
    const k = d - dislike * 3;
    if (d < 30 && k < bd) { bd = k; best = p; }
  }
  return best;
}

/* ---------------------------------- the brain ---------------------------------- */

/**
 * In a fight (behaviours.js Fight): now and then, one of their moves instead
 * of a punch. True while a move has them; undefined to fight the normal way.
 */
export function powerFight(fight, dt, o, d, dir, r) {
  const me = fight.me, b = fight.brain;
  if (!me.powers) return undefined;
  if (me.pmove) { me.lookAt = o.wj.head; return true; }
  // (a speedster's blows come quicker, too)
  const tempo = powerTempo(me);
  if (tempo > 1 && fight.cool !== undefined) fight.cool -= dt * (tempo - 1);
  fight.pwT = (fight.pwT ?? rand(0.3, 1)) - dt;
  if (fight.pwT > 0) return undefined;
  const T = b.traits;
  fight.pwT = rand(0.6, 1.4) * (1.3 - T.aggression * 0.5);
  // nobody uses everything they have all the time: a fist will often do
  const keen = 0.4 + T.aggression * 0.35 + r.anger * 0.25 + (b.emo.fear || 0) * 0.2;
  if (!chance(keen)) return undefined;
  const ctx = { d, dir, r, fight, dy: o.pos.y - me.pos.y, t: now(me) };
  const pick = chooseMove(me, o, ctx);
  if (!pick) return undefined;
  return startMove(me, pick.power, pick.id, pick.o || o) ? true : undefined;
}

/** A move worth doing to `o` now, by how much each one suits (their wants), or null. */
export function chooseMove(me, o, ctx, filter = null) {
  const cands = [];
  for (const [id, st] of me.powers) {
    const P = POWERS[id];
    for (const [mid, def] of Object.entries(P.moves)) {
      if (filter && !filter(def, id, mid)) continue;
      if (ctx.t - (st.cool[mid] ?? -99) < (def.cool ?? 8)) continue;
      if (def.needs === 'friend') continue;
      const w = def.want ? def.want(me, o, ctx, st) : 0;
      if (w > 0) cands.push({ power: id, id: mid, w });
    }
  }
  if (!cands.length) return null;
  let sum = 0;
  for (const c of cands) sum += c.w;
  let x = Math.random() * sum;
  for (const c of cands) { x -= c.w; if (x <= 0) return c; }
  return cands[cands.length - 1];
}

/**
 * Outside the fist-fight: what powers do for them by reflex - a flier gets
 * up out of reach of whatever they are running from, a telekinetic stops the
 * rounds coming at them, someone with a way to do it gets a friend out.
 */
export function powerReflexes(brain, dt) {
  const me = brain.man;
  if (!me.powers || me.pmove || !me.conscious) return;
  brain.pwReflexT = (brain.pwReflexT ?? 0) - dt;
  if (brain.pwReflexT > 0) return;
  brain.pwReflexT = rand(0.25, 0.45);
  for (const [id, st] of me.powers) if (POWERS[id].reflex && !me.pmove) POWERS[id].reflex(me, st, brain, startMove);
}

/** A friend in trouble nearby: the move that would get them out of it (an airlift, a dash away), or null. */
export function rescueFor(me, friend) {
  if (!me.powers || me.pmove) return null;
  for (const [id, st] of me.powers) {
    for (const [mid, def] of Object.entries(POWERS[id].moves)) {
      if (def.needs !== 'friend') continue;
      if (now(me) - (st.cool[mid] ?? -99) < (def.cool ?? 8)) continue;
      if (def.want && def.want(me, friend, { t: now(me) }, st) > 0) return { power: id, id: mid };
    }
  }
  return null;
}

export { setPhase, sign, clamp };
