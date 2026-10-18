/* =============================================================================
   Officers, and the people they deal with.

   An officer is a stickman in uniform - a cap, a navy shirt, a duty belt -
   with a police vest on, an M1911 in the holster and a taser on the other
   hip. Brave, steady, patient, kind. Crimes reach them three ways (law.js):
   they see one, they hear shots, or somebody who saw one comes and tells
   them. Then they go and deal with it:

     commands   "Police! Stop!", "Drop it!", "On the ground!" - and a moment
                to do as they are told. Plenty do: hands up, weapon dropped,
                down on their knees with their hands on their head
     the taser  for anyone who runs or fights instead: two probes, five
                seconds, down they go. If it misses, or the cartridges run
                out, it is hands-on
     the M1911  only for a deadly threat: a gun pointed at somebody or fired,
                a blade out and going at somebody. "Drop the weapon!" - and
                if they do not, they are shot. Never through somebody else
     the cuffs  whoever has given up, or is down, gets them: knelt over,
                hands behind the back, cuffed. Whatever they had is taken off
                them and put down out of reach, and that is that crime
                answered. Then a word into the radio, and back to it

   The people they deal with decide for themselves what to do about it, by
   who they are: the frightened and the sensible give up, the bold run, and
   the angry and the reckless fight - harder to do with a gun pointed at
   them. Everyone else is relieved to see an officer arrive, except whoever
   has just done something.
   ========================================================================== */
import { Behaviour, Fight, KINDS } from './behaviours.js';
import { CRIMES } from './law.js';
import { isBlade, isFirearm, armOf } from './props.js';
import { clamp, rand, chance, pick, sign } from '../core/util.js';

const SURNAMES = [
  'Reyes', 'Novak', 'Brooks', 'Okafor', 'Lindqvist', 'Patel', 'Moreau', 'Kowalski', 'Haddad', 'Tanaka', 'Ibarra', 'Holt',
  'Vance', 'Mercer', 'Dubois', 'Nakamura', 'Ferreira', 'Kaur', 'Osei', 'Larsen', 'Costa', 'Byrne', 'Sato', 'Mendes',
];

/** What an officer says instead, most of the time (the rest, they say what anyone would). */
const COP_LINES = {
  greet: ['Afternoon.', 'Evening, {other}. Everything alright?', "Hi, I'm {me}. Anything I should know about?", 'Morning. Keeping out of trouble?', 'Hello there. Quiet today?'],
  greetFriend: ['{other}! Staying out of trouble, I hope.', 'Good to see you, {other}. All quiet your end?'],
  farewell: ['Stay safe out there.', 'Keep out of trouble, {other}.', 'Be good.', "Call if you need me. Well, shout."],
  smalltalk: [
    "Quiet shift so far. Let's keep it that way.", 'You see anything strange, you come and tell me.', "Twelve years on the job and I've never seen a sky this grey.",
    'Somebody keeps leaving knives on the floor. Not on my watch.', 'Some days it is all crates and paperwork.', 'This vest is warmer than it looks.',
    'Most of the job is standing about. The rest is running.', 'If anyone starts a fight, I want to know about it.', 'People wave at me. I wave back. It is nice.',
  ],
  reply: ['Noted.', 'Is that so.', 'Huh. I will keep an eye out.', 'Good to know.', 'Copy that.'],
  bored: ['Quiet. Too quiet.', 'Dispatch, still nothing here.', 'Hmm hm hm.', 'Could do with a coffee.'],
  newcomer: ['Hello. Just arrived?', 'New face. Welcome. Behave.', 'Where did you come from? Never mind.'],
  fightStart: ['That is assault on an officer!', "You're making a big mistake, {other}.", "Alright, {other}. The hard way, then."],
  angryAt: ["That's it, {other}!", 'You just assaulted a police officer!'],
  getUp: ['Still on duty.', 'Okay. Okay. Back to it.', 'I am fine. Stand back.'],
  wake: ['Ugh... dispatch? Dispatch?', 'What hit me...', 'Officer down... no, officer up. Mostly.'],
  witnessHit: ['Hey! None of that!', 'Break it up!', 'I saw that!'],
  exercise: ['Got to pass the fitness test.', 'Twenty more. Regulation.'],
  gunGet: ['Making that safe.', 'I will hold on to this.'],
};

/** What an officer is like: brave, steady, patient - with a little give either way. */
function officerTraits() {
  const v = (x) => clamp(x + rand(-0.08, 0.08), 0, 1);
  return { bravery: v(0.82), aggression: v(0.3), temper: v(0.22), empathy: v(0.66), sociability: v(0.55), curiosity: v(0.5), toughness: v(0.72), skill: v(0.76) };
}

/** An officer, in uniform, kitted out: a police vest on, an M1911 holstered, a taser on the duty belt. */
export function spawnOfficer(sb, x, o = {}) {
  const taken = new Set(sb.people.map((p) => p.name));
  const free = SURNAMES.filter((n) => !taken.has('Officer ' + n));
  const name = o.name || 'Officer ' + (free.length ? pick(free) : pick(SURNAMES) + ' ' + (sb.people.length + 1));
  const man = sb.spawnStickman(x, null, { name, role: 'officer', hair: 'none', lines: COP_LINES, traits: { ...officerTraits(), ...(o.traits || {}) } });
  if (!man) return null;
  const v = sb.spawnVest(man.pos.x, 0.3, { police: true });
  if (v) { v.wear(man); man.vest = v; }
  const g = sb.spawnGun(man.pos.x, 0.3, 0, 'm1911');
  if (g) man.equip(g, 'holster');
  const t = sb.spawnTaser(man.pos.x, 0.3);
  if (t) man.equip(t, 'duty');
  return man;
}

/* --------------------------------- reading people -------------------------------- */

/** Somebody who is about to kill somebody: a gun on them, just fired, or a blade going at them. */
export function lethal(o) {
  if (!o || o.removed || !o.alive || !o.conscious || o.cuffed || o.tased) return false;
  const now = o.sandbox.time;
  const w = o.armedWith, spec = armOf(w);
  const gun = o.gunReady && (isFirearm(w) || !!(spec && spec.shot)) && (!o.weapon || o.weapon.ammo > 0);
  if (gun && ((o.aiming && o.aimTarget && o.aimTarget.kind === 'stickman') || now - (o.weapon ? o.weapon.lastShot : o.lastShotT ?? -99) < 4)) return true;
  const blade = isBlade(w) || !!(spec && spec.blade);
  if (blade && o.attacking) return true;
  const t = o.brain && o.brain.fightTarget;
  return blade && !!t && !t.removed && t.alive && Math.abs(t.pos.x - o.pos.x) < 3;
}

/** Nobody standing between them: a shot (or the probes) would only find who it is meant for. */
function clearShot(me, o) {
  const lo = Math.min(me.pos.x, o.pos.x) + 0.25, hi = Math.max(me.pos.x, o.pos.x) - 0.25;
  for (const q of me.sandbox.people) {
    if (q === me || q === o || q.removed || q.dead || q.lying) continue;
    if (q.pos.x > lo && q.pos.x < hi && Math.abs(q.pos.y - me.pos.y) < 1.2) return false;
  }
  return true;
}

/** Which slot of theirs holds something that passes `ok`. */
function slotWith(me, ok) {
  for (const [k, it] of Object.entries(me.stowed)) if (it && ok(it)) return k;
  return null;
}

/**
 * Gets what the job needs into their hand: the gun, the taser, or nothing
 * (both hands free, for the cuffs). True once it is there; otherwise it is on
 * the way - a holster, a draw - and they are busy.
 */
function inHand(me, want) {
  const w = me.weapon;
  const fits = (it) => (want === 'gun' ? isFirearm(it.kind) : want === 'taser' ? it.kind === 'taser' : false);
  if (want === 'hands' ? !w : !!w && fits(w)) return true;
  if (me.stowing || me.drawing || !me.ready) return false;
  if (w) {
    if (!me.stow()) me.dropWeapon(0.2);
    return false;
  }
  const k = slotWith(me, fits);
  if (k) me.drawFrom(k);
  return !k;
}

const fleeing = (o) => !!(o.brain && o.brain.fleeing);
const GUARD = 4.5;          // seconds stood over somebody once they are cuffed
const RELEASE = 75;         // ...and how long before somebody cuffed for something small is let go
const givingUp = (o, me) => {
  const b = o.brain && o.brain.behaviour;
  return !!b && b.kind === 'comply' && b.target === me;
};

/* --------------------------------- the officer's mind -------------------------------- */

/** A crime, seen or heard (or told): a case on whoever did it, and a word into the radio. */
export function learn(b, c, seen) {
  if (!b.cop || !c.by || c.by.removed || c.by.dead || c.by.cuffed || c.by === b.man) return;
  const cases = b.cop.cases, now = b.sb.time;
  let k = cases.get(c.by);
  const fresh = !k;
  // (where they were when it happened: a shot is heard from where it was fired, not where it landed)
  const at = c.by.pos ? c.by.pos.x : c.x;
  if (!k) { k = { suspect: c.by, sev: 0, kinds: new Set(), t: now, x: at, seen: false, victims: new Set() }; cases.set(c.by, k); }
  k.sev = Math.max(k.sev, c.sev);
  k.kinds.add(c.kind);
  k.t = now;
  k.x = at;
  k.seen = k.seen || seen;
  if (c.against) k.victims.add(c.against);
  if (fresh) {
    b.note(seen ? `${c.by.name}: ${CRIMES[c.kind].label.toLowerCase()}. I saw it.` : `Reported: ${c.by.name}, ${CRIMES[c.kind].label.toLowerCase()}.`);
    if (seen) b.speak(c.sev >= 2.5 ? 'copShotsFired' : 'copSees', { other: c.by.name, victim: c.against ? c.against.name : 'someone' }, 0.9, c.by, true);
    b.thinkT = 0;
    b.react = Math.min(b.react, 0.12);
  }
}

/** What an officer weighs up, besides everything anyone would: every open case, the worst first. */
export function considerOfficer(b, add) {
  const me = b.man, now = b.sb.time;
  for (const [o, k] of b.cop.cases) {
    const cur = b.behaviour && b.behaviour.kind === 'respond' && b.behaviour.target === o ? b.behaviour : null;
    if (o.cuffed && !o.removed) {
      // the cuffs on: a word to them, one into the radio, and that is the case closed
      if (cur && (cur.cuffedT === null || now - cur.cuffedT < GUARD)) add('respond', o, 1.6, `${o.name} is in cuffs. Book them.`, null, true);
      else b.cop.cases.delete(o);
      continue;
    }
    if (o.removed || now - k.t > 240) { b.cop.cases.delete(o); continue; }
    if (o.dead) { if (now - k.t > 2) b.cop.cases.delete(o); continue; }
    const ongoing = lethal(o) || (o.brain && !!o.brain.fightTarget) || now - k.t < 4;
    const d = Math.abs(o.pos.x - me.pos.x);
    const s = (0.75 + k.sev * 0.35 + (ongoing ? 0.6 : 0)) / (1 + Math.max(0, d - 10) / 15);
    add('respond', o, s, ongoing ? `${o.name}. Stop them, now.` : `${o.name} has to answer for that.`, null, ongoing || k.sev >= 2);
  }
  // somebody they cuffed a while ago for something small: let go with a warning (a shooting or a killing, never)
  for (const o of b.sb.people) {
    const cf = o.cuffed;
    if (!cf || cf.by !== me || o.dead || o.removed || now - cf.t < RELEASE) continue;
    const worst = b.sb.law.crimes.reduce((m, c) => (c.by === o ? Math.max(m, c.sev) : m), 0);
    if (worst >= 2.5) continue;
    add('release', o, 0.32 + Math.min(0.3, (now - cf.t - RELEASE) / 100), `${o.name} has sat there long enough.`);
  }
}

/** What someone an officer has told to stop weighs up: give up, run, or fight it out. */
export function considerSuspect(b, add) {
  const p = b.police, me = b.man, now = b.sb.time, T = b.traits, E = b.emo;
  if (!p) return;
  const o = p.by;
  if (now - p.t > 7 || !o || o.removed || !o.alive || !o.conscious || me.cuffed) { b.police = null; return; }
  const d = Math.abs(o.pos.x - me.pos.x);
  const r = b.rel(o);
  const aimed = o.aiming && o.aimTarget === me;
  const shoot = aimed && isFirearm(o.armedWith);
  const health = me.health.overall;
  const comply = 0.3 + p.mood + E.fear * 0.5 + (1 - T.bravery) * 0.35 + (1 - T.aggression) * 0.3 + (aimed ? 0.2 : 0) + (shoot ? 0.4 : 0) +
    (1 - health) * 0.35 + (p.count - 1) * 0.12 + b.guilt * 0.25 + (1 - me.stamina) * 0.15 - r.anger * 0.45 - (me.gunReady && isFirearm(me.armedWith) ? 0.2 : 0);
  const run = (0.1 + T.bravery * 0.3 + (1 - T.empathy) * 0.15 + T.aggression * 0.12 - p.mood) * (health > 0.5 ? 1 : 0.4) *
    (me.stamina > 0.3 ? 1 : 0.35) * (d > 3 ? 1 : 0.55) * (shoot ? 0.4 : 1) * (me.health.mobility > 0.7 ? 1 : 0.3);
  const fight = (T.aggression * 0.55 + r.anger * 0.6 + E.anger * 0.3 - p.mood * 0.5) * (me.strikes().length ? 1 : 0.2) * (me.gunReady ? 1.35 : 1) * (shoot ? 0.5 : 1) - 0.32;
  // having given up, they stay given up - it takes a lot to start again
  const giving = b.behaviour && b.behaviour.kind === 'comply' && b.behaviour.target === o;
  add('comply', o, (comply + (giving ? 0.9 : 0)) * 1.5, `${o.name} says to stop. I'd better do as I'm told.`, null, true);
  add('flee', o, run * 1.25, `The police! Run!`, null, true);
  if (fight > 0.05) add('fight', o, fight * 1.4, `I'm not going quietly.`, null, true);
}

/** Someone's first sight of an officer: relief, mostly - unless they have just done something. */
export function metOfficer(b, o, r) {
  const me = b.man, T = b.traits;
  if (me.officer) { r.like = Math.max(r.like, 0.5); r.fam = Math.max(r.fam, 0.5); r.greeted = true; return; }
  const wanted = b.sb.law.wanted(me);
  if (wanted) {
    r.fear = Math.max(r.fear, 0.45 * (1.2 - T.bravery));
    b.emo.bump('fear', 0.2 * (1.2 - T.bravery));
    b.speak('seeCopGuilty', { other: o.name }, 0.8, o);
  } else {
    r.like = Math.max(r.like, 0.25);
    const trouble = b.gunThreat && b.sb.time - b.gunThreat.t < 20;
    b.speak(trouble ? 'seeCopRelief' : 'seeCop', { other: o.name }, trouble ? 0.9 : 0.45, o, trouble);
  }
}

/** Someone who saw a crime, with an officer in sight: they go and tell them. */
export function maybeReport(b) {
  const now = b.sb.time, me = b.man;
  if (now - (b.reportT ?? -99) < 3 || !me.conscious || me.cuffed) return;
  b.crimesSeen = b.crimesSeen.filter((w) => now - w.t < 150 && !w.c.done && !w.c.by.removed && !w.c.by.cuffed && w.c.by.alive);
  if (!b.crimesSeen.length) return;
  for (const o of b.visible) {
    if (!o.officer || !o.alive || !o.conscious || !o.brain || o.cuffed || Math.abs(o.pos.x - me.pos.x) > 9) continue;
    const w = b.crimesSeen.filter((x) => !x.told.has(o) && x.c.by !== o).sort((x, y) => y.c.sev - x.c.sev)[0];
    if (!w) continue;
    w.told.add(o);
    b.reportT = now;
    const c = w.c, whom = c.against === me ? 'me' : c.against ? c.against.name : 'somebody';
    if (me.ready) { me.faceTo(c.by.pos.x); me.perform('point'); }
    b.speak(c.against === me ? 'reportMe' : 'reportCrime', { other: o.name, victim: c.by.name, what: CRIMES[c.kind].said + ' ' + whom }, 1, o, true);
    b.note(`I told ${o.name} what ${c.by.name} did.`);
    const had = o.brain.cop && o.brain.cop.cases.has(c.by);
    o.brain.learnCrime(c, false);
    if (!had) o.brain.speak('copThanks', { other: me.name, victim: c.by.name }, 0.9, me);
    return;
  }
}

/**
 * What somebody who saw a crime weighs up: going to find an officer they
 * know is about, to tell them - more so if it was done to them.
 */
export function considerWitness(b, add) {
  const me = b.man, now = b.sb.time;
  if (me.officer || !b.crimesSeen.length || me.cuffed || b.sb.law.wanted(me)) return;
  let cop = null, best = Infinity;
  for (const [o, r] of b.rels) {
    if (!o.officer || o.removed || !o.alive || !o.conscious || o.cuffed || now - r.lastSeen > 60) continue;
    const d = Math.abs(o.pos.x - me.pos.x);
    if (d < best) { best = d; cop = o; }
  }
  if (!cop) return;
  const w = b.crimesSeen.filter((x) => !x.told.has(cop) && !x.c.done && x.c.by !== cop && !x.c.by.removed && x.c.by.alive && !x.c.by.cuffed)
    .sort((x, y) => y.c.sev - x.c.sev)[0];
  // (nothing to tell an officer who is already after them)
  if (!w || (cop.brain && cop.brain.cop && cop.brain.cop.cases.has(w.c.by))) return;
  const mine = w.c.against === me, T = b.traits;
  const s = (0.18 + w.c.sev * 0.1 + (mine ? 0.2 : 0)) * (0.6 + T.empathy * 0.3 + T.bravery * 0.2) / (1 + best / 25);
  add('report', cop, s, mine ? `I'm telling ${cop.name} what ${w.c.by.name} did to me.` : `${cop.name} needs to know what ${w.c.by.name} did.`);
}

/* -------------------------------- the officer's behaviour -------------------------------- */

/**
 * Dealing with a suspect, from the first "Police!" to the cuffs: closing in,
 * telling them, giving them the chance - and then whatever it takes, and no
 * more. What it takes is decided again every step, by what they are doing.
 */
export class Respond extends Behaviour {
  get kind() { return 'respond'; }
  get label() {
    const o = this.target;
    if (o.cuffed) return `Arresting ${o.name}`;
    return { arrest: `Cuffing ${o.name}`, deadly: `Holding ${o.name} at gunpoint`, taser: `Tasing ${o.name}`, hands: `Wrestling ${o.name} down`, chase: `Chasing ${o.name}` }[this.mode] || `Dealing with ${o.name}`;
  }
  get icon() { return 'badge'; }
  start() {
    this.cmds = 0;
    this.cmdT = -99;
    this.lost = 0;
    this.mode = 'approach';
    this.cool = 0.4;
    this.zaps = 0;
    this.cuffedT = null;
    this.melee = null;
  }

  update(dt) {
    this.t += dt;
    const o = this.target, me = this.me, b = this.brain, now = this.now;
    if (!o || o.removed) return false;
    const k = b.cop.cases.get(o);
    if (o.cuffed) return this.guard(dt, o);
    if (o.dead) {
      b.cop.cases.delete(o);
      b.speak('copSuspectDown', { other: o.name }, 0.9, null, true);
      if (me.ready) me.perform('radio');
      return false;
    }
    const seen = b.sees(o);
    const d = Math.abs(o.pos.x - me.pos.x), dir = Math.sign(o.pos.x - me.pos.x) || me.facing;
    if (!seen) {
      // out of sight: over to where they were, the gun out if there has been shooting, and a look round
      this.lost += dt;
      me.lowerGun();
      if (k && k.sev >= 2.5) inHand(me, 'gun');
      const x = k ? k.x : o.pos.x;
      const heard = b.heard && now - b.heard.t < 1.5 ? b.heard : null;
      if (heard && Math.abs(heard.x - me.pos.x) > 0.5 && Math.sign(heard.x - me.pos.x) !== me.facing) me.faceTo(heard.x);
      else if (Math.abs(x - me.pos.x) > 1) me.goTo(x, 'run');
      else {
        me.stop();
        if ((this.lookT = (this.lookT || 0) - dt) <= 0) { this.lookT = rand(0.8, 1.4); me.faceTo(me.pos.x - me.facing); }
      }
      return this.lost < 14;
    }
    this.lost = 0;
    if (k) k.x = o.pos.x;
    me.lookAt = o.wj.head;
    if (lethal(o)) return this.deadly(dt, o, d, dir);
    this.deadlyT = 0;
    const down = o.lying || !o.conscious || o.state === 'down' || o.state === 'ko' || o.state === 'crawl';
    if (o.tased || down || (givingUp(o, me) && o.posture === 'kneelHands')) return this.arrest(dt, o, d, dir);
    // still up: the taser if there is one with anything left in it, otherwise hands
    const tz = me.weapon && me.weapon.kind === 'taser' ? me.weapon : Object.values(me.stowed).find((it) => it && it.kind === 'taser');
    const tool = tz && !this.noTaser && (tz.ammo > 0 || tz.hooked) ? 'taser' : 'hands';
    if (!inHand(me, tool)) { me.stop(); me.faceTo(o.pos.x); return true; }
    // telling them, first - and again if they do not listen
    if (d < 9 && (this.cmds === 0 || (now - this.cmdT > 2.8 && this.cmds < 3 && !givingUp(o, me)))) this.command(o);
    if (givingUp(o, me)) {
      // doing as they are told: keep it on them, close in for the cuffs once they are down
      this.mode = 'approach';
      if (d > 2.6) me.goTo(o.pos.x - dir * 2.2, 'walk', { face: o.pos.x });
      else { me.stop(); me.faceTo(o.pos.x); }
      if (me.weapon && me.weapon.kind === 'taser') me.aimAt(o);
      return true;
    }
    if (d > 7.5) {
      this.mode = fleeing(o) ? 'chase' : 'approach';
      me.lowerGun();
      me.goTo(o.pos.x - dir * 4.5, (k && k.sev >= 2) || fleeing(o) || d > 12 ? 'run' : 'walk', { face: o.pos.x });
      if (fleeing(o) && chance(dt * 0.3)) b.speak('copChase', { other: o.name }, 0.7, o, true);
      return true;
    }
    // a moment to do as they are told
    if (now - this.cmdT < 1.6 && !fleeing(o) && !o.attacking) {
      me.stop();
      me.faceTo(o.pos.x);
      if (me.weapon && me.weapon.kind === 'taser') me.aimAt(o);
      return true;
    }
    return tool === 'taser' ? this.tase(dt, o, d, dir) : this.handsOn(dt, o, d, dir);
  }

  /** "Police! Stop!" - and whoever it was said to has to decide what to do about it. */
  command(o) {
    const me = this.me, b = this.brain, now = this.now;
    this.cmds++;
    this.cmdT = now;
    const armed = !!o.weapon || !!o.innate;
    const kind = armed ? 'copDrop' : o.lying ? 'copStayDown' : this.cmds > 1 ? 'copGetDown' : 'copStop';
    b.speak(kind, { other: o.name }, 1, o, true);
    if (me.ready && !me.weapon) me.perform(armed || this.cmds > 1 ? 'pointDown' : 'commandStop');
    if (o.brain) {
      const p = o.brain.police;
      const again = p && p.by === me;
      o.brain.police = { by: me, t: now, kind, count: (again ? p.count : 0) + 1, mood: again ? p.mood : rand(-0.3, 0.3) };
      o.brain.thinkT = 0;
      o.brain.react = 0;
    }
    this.sb.emit('command', { who: me, to: o, kind, x: me.wj.head.x, y: me.wj.head.y });
  }

  /** The taser: out to the right distance, on them, fired - and again, down the same wires, if they get up fighting. */
  tase(dt, o, d, dir) {
    const me = this.me, b = this.brain, now = this.now, g = me.weapon;
    this.mode = 'taser';
    if (!g || g.kind !== 'taser') return true;
    // the probes still in the air: hold it on them and wait
    if (g.flying) { me.aimAt(o); me.stop(); return true; }
    if (g.hooked && g.shot.target === o) {
      me.aimAt(o);
      me.stop();
      if (!o.tased && !o.lying && now - g.lastShot > 0.9) { me.fire(); b.speak('copStopResisting', { other: o.name }, 0.9, o, true); }
      return true;
    }
    if (!g.cart) {
      if (g.spare > 0) { if (!me.reloading) { me.lowerGun(); me.reload(); } }
      else this.noTaser = true;
      return true;
    }
    if (d > 6) me.goTo(o.pos.x - dir * 4.5, 'run', { face: o.pos.x });
    else if (d < 1.8) me.goTo(me.pos.x - dir * 1.5, 'walk', { backpedal: true, face: o.pos.x });
    else { me.stop(); me.faceTo(o.pos.x); }
    me.aimAt(o);
    if (!this.warnT) { this.warnT = now; b.speak('copTaserWarn', { other: o.name }, 1, o, true); }
    if (d < 6.5 && me.steady > 0.5 && now - this.warnT > 0.4 && clearShot(me, o) && (this.cool -= dt) <= 0) {
      if (me.fire()) {
        this.zaps++;
        this.cool = 1.2;
        if (this.zaps > 3) this.noTaser = true;
      }
    }
    return true;
  }

  /** Hands on: the way anyone fights, until they are on the floor. */
  handsOn(dt, o, d, dir) {
    this.mode = 'hands';
    if (!this.melee) this.melee = new Fight(this.brain, o, {});
    if (this.melee.cool === undefined) { this.melee.cool = 0.3; this.melee.reacted = new Set(); this.melee.blockT = 0; this.melee.downT = 0; this.melee.lost = 0; }
    this.melee.update(dt);
    return true;
  }

  /** A deadly threat: the gun out, "Drop the weapon!", and if they do not - fired, while it lasts. */
  deadly(dt, o, d, dir) {
    const me = this.me, b = this.brain, now = this.now;
    this.mode = 'deadly';
    if (!inHand(me, 'gun')) { me.stop(); me.faceTo(o.pos.x); return true; }
    const g = me.weapon;
    if (g.mag <= 0) { me.lowerGun(); if (!me.reloading) me.reload(); return true; }
    if (!this.gunWarnT || now - this.gunWarnT > 5) { this.gunWarnT = now; b.speak('copDropGun', { other: o.name }, 1, o, true); this.command(o); }
    if (d < 3) me.goTo(me.pos.x - dir * 2.5, 'walk', { backpedal: true, face: o.pos.x });
    else if (d > 9) me.goTo(o.pos.x - dir * 6, 'walk', { face: o.pos.x });
    else { me.stop(); me.faceTo(o.pos.x); }
    me.aimAt(o);
    if (now - this.gunWarnT > 0.75 && me.steady > 0.45 && clearShot(me, o) && (this.cool -= dt) <= 0) {
      if (me.fire()) this.cool = rand(0.3, 0.55);
    }
    return true;
  }

  /** Down, or given up: both hands free, knelt beside them, and the cuffs on. */
  arrest(dt, o, d, dir) {
    const me = this.me, b = this.brain;
    this.mode = 'arrest';
    if (me.cuffing === o && me.acting) return true;
    // the current still going through them: the taser kept on them, closing in, until they have ridden it out
    const g = me.weapon;
    const riding = o.tased && g && g.kind === 'taser' && g.hooked && g.shot.target === o && o.tased.dur - o.tased.t > 0.5;
    if (!riding && !inHand(me, 'hands')) { me.stop(); return true; }
    const spot = o.wj.hip.x - dir * 0.62;
    if (Math.abs(me.pos.x - spot) > 0.16) {
      me.goTo(spot, d > 3 ? 'run' : 'walk', { jump: false, face: o.pos.x });
      if (riding) me.aimAt(o);
      return this.t < 60;
    }
    me.stop();
    me.faceTo(o.wj.hip.x);
    if (riding) { me.aimAt(o); return true; }
    if (me.ready) {
      me.cuffing = o;
      me.perform('cuffing');
      b.speak(o.tased ? 'copCuffTased' : 'copCuffing', { other: o.name }, 1, o, true);
    }
    return true;
  }

  /** Cuffed: the case is closed. A word into the radio, a word to them, and done. */
  guard(dt, o) {
    const me = this.me, b = this.brain, now = this.now;
    this.mode = 'arrest';
    if (this.cuffedT === null) {
      this.cuffedT = now;
      b.speak('copArrest', { other: o.name }, 1, o, true);
      b.note(`${o.name} is in cuffs.`);
    }
    me.stop();
    me.faceTo(o.pos.x);
    if (me.weapon && me.ready) me.stow();
    // (and again a moment later, if something else was being said just then)
    if (now - this.cuffedT > 2.2 && !this.radioed && me.ready && b.speak('copRadioCustody', { other: o.name }, 1, null, true)) {
      this.radioed = true;
      me.perform('radio');
    }
    return now - this.cuffedT < GUARD;
  }

  end() {
    this.me.lowerGun();
    this.me.cuffing = null;
    if (this.melee) this.melee.end();
    if (this.target && this.target.cuffed) this.brain.cop.cases.delete(this.target);
  }
}

/** Told to stop by an officer, and doing it: the weapon dropped, hands up, down on the knees. */
export class Comply extends Behaviour {
  get kind() { return 'comply'; }
  get label() { return 'Giving up to ' + this.target.name; }
  get icon() { return 'exclaim'; }
  start() {
    this.brain.begging = true;
    this.brain.speak('comply', { other: this.target.name }, 1, this.target, true);
    this.dropped = false;
    this.calm = 0;
  }
  update(dt) {
    this.t += dt;
    const o = this.target, me = this.me;
    if (!o || o.removed || me.cuffed) return false;
    me.stop();
    me.faceTo(o.pos.x);
    me.lookAt = o.wj.head;
    if (me.weapon && !this.dropped) {
      if (me.ready && me.perform('dropIt')) this.dropped = true;
      return true;
    }
    if (me.acting) return true;
    const want = this.t > 1.3 ? 'kneelHands' : 'handsUp';
    if (me.ready && me.posture !== want) me.setPosture(want);
    const still = o.alive && o.conscious && o.brain && o.brain.behaviour && o.brain.behaviour.kind === 'respond' && o.brain.behaviour.target === me;
    this.calm = still ? 0 : this.calm + dt;
    return this.calm < 4 && this.t < 60;
  }
  end() {
    this.brain.begging = false;
    if (this.me.posture === 'kneelHands' || this.me.posture === 'handsUp') this.me.setPosture(null);
  }
}

/** In cuffs: sat on the floor, hands behind them, complaining now and then. */
export class Detained extends Behaviour {
  get kind() { return 'detained'; }
  get label() { return 'In handcuffs'; }
  get icon() { return null; }
  start() { this.next = rand(3, 6); }
  update(dt) {
    this.t += dt;
    const me = this.me;
    if (!me.cuffed) return false;
    me.stop();
    if (this.t > 1.2 && me.ready && me.posture !== 'sitCuffed') me.setPosture('sitCuffed');
    if ((this.next -= dt) <= 0) { this.next = rand(7, 14); this.brain.speak('cuffedTalk', {}, 0.6); }
    return true;
  }
  end() { if (this.me.posture === 'sitCuffed') this.me.setPosture(null); }
}

/** Off to find an officer, to tell them what they saw: close enough, and the telling happens (maybeReport). */
export class Report extends Behaviour {
  get kind() { return 'report'; }
  get label() { return 'Going to tell ' + this.target.name; }
  get icon() { return 'exclaim'; }
  update(dt) {
    this.t += dt;
    const o = this.target, me = this.me, b = this.brain;
    if (!o || o.removed || !o.alive || !o.conscious) return false;
    if (!b.crimesSeen.some((w) => !w.told.has(o) && !w.c.done)) return false;
    const d = Math.abs(o.pos.x - me.pos.x);
    if (d > 3.5) me.goTo(o.pos.x - (Math.sign(o.pos.x - me.pos.x) || 1) * 2.5, d > 8 ? 'run' : 'walk', { face: o.pos.x });
    else { me.stop(); me.faceTo(o.pos.x); }
    return this.t < 25;
  }
}

/** On duty with nothing going on: a walk along the beat, a stop to look about, and on again. */
export class Patrol extends Behaviour {
  get kind() { return 'patrol'; }
  get label() { return this.pause > 0 ? 'Keeping an eye on things' : 'Walking the beat'; }
  start() {
    const me = this.me, sb = this.sb;
    const dir = me.pos.x > sb.right - 4 ? -1 : me.pos.x < sb.left + 4 ? 1 : chance(0.5) ? 1 : -1;
    this.x = clamp(me.pos.x + dir * rand(6, 12), sb.left + 1, sb.right - 1);
    this.pause = 0;
    this.legs = 0;
  }
  update(dt) {
    this.t += dt;
    const me = this.me, sb = this.sb;
    if (this.pause > 0) {
      this.pause -= dt;
      me.stop();
      if (this.pause <= 0) {
        if (++this.legs >= 2) return false;
        this.x = clamp(me.pos.x + (chance(0.6) ? -1 : 1) * me.facing * rand(5, 10), sb.left + 1, sb.right - 1);
      }
      return true;
    }
    if (Math.abs(me.pos.x - this.x) <= 0.25) {
      // there: a look back the way they came, and sometimes a word into the radio
      this.pause = rand(1.5, 3);
      me.stop();
      me.faceTo(me.pos.x - me.facing);
      if (me.ready && chance(0.35)) { me.perform('radio'); this.brain.speak('copIdle', {}, 0.5); }
      return true;
    }
    me.goTo(this.x, 'walk');
    return this.t < 40;
  }
}

KINDS.respond = Respond;
KINDS.comply = Comply;
KINDS.detained = Detained;
/** Back over to somebody they cuffed: a word of warning, and the cuffs off. */
export class Release extends Behaviour {
  get kind() { return 'release'; }
  get label() { return 'Letting ' + this.target.name + ' go'; }
  get icon() { return 'badge'; }
  start() { this.at = null; }
  update(dt) {
    this.t += dt;
    const o = this.target, me = this.me, b = this.brain;
    if (!o || o.removed || o.dead || !o.cuffed) return false;
    const d = Math.abs(o.pos.x - me.pos.x);
    if (this.at === null) {
      if (d > 1.1) { me.goTo(o.pos.x - (Math.sign(o.pos.x - me.pos.x) || 1) * 0.8, 'walk'); return this.t < 30; }
      me.stop();
      me.faceTo(o.pos.x);
      this.at = this.now;
      b.speak('copRelease', { other: o.name }, 1, o, true);
      if (me.ready) me.perform('pointDown');
      return true;
    }
    if (this.now - this.at > 1.4) {
      o.uncuff();
      b.note(`Let ${o.name} go with a warning.`);
      return false;
    }
    return true;
  }
}

KINDS.report = Report;
KINDS.patrol = Patrol;
KINDS.release = Release;
