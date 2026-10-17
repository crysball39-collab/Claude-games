/* =============================================================================
   A stickman's brain.

   Four things happen in here, over and over:

     SENSE   About five times a second it looks around. It sees what is in
             front of it, within fourteen metres, and not hidden behind a
             crate; it notices things right behind it only if they are close.
             Whoever it sees, it remembers: where they were, and when.
     FEEL    Every event in the sandbox - a punch, a scream, a crate going
             past, a death - reaches every brain, and each one decides
             whether it saw it or heard it. What it noticed changes how it
             feels (five emotions, emotions.js) and how it feels about each
             person involved: liking, fear, anger, familiarity.
     THINK   A few times a second it scores everything it could do - fight
             someone, run from someone, talk to someone, help, mourn, grab
             the brass knuckles, climb a crate, rest, wander - from how it
             feels, who it is (its traits) and what it can see, and picks the
             best. What it is already doing gets a bonus, so it does not
             dither between two equal choices.
     ACT     The chosen behaviour (behaviours.js) drives the body.

   And it reacts. A crate flying at its head gets a duck, a punch it sees
   coming gets a block, a blow it takes gets a flinch from the body straight
   away and, a moment later - longer for the clumsy - a decision about what
   to do about it.

   Everything it decides goes into a short list of thoughts, which the
   inspector shows, along with the options it was weighing up.

   And it remembers. The things that matter - who hit them, who helped them
   up, who they saw kill whom, who shot at them - are kept as memories, each
   weighted by how much it mattered. The small ones fade in a minute; the
   terrible ones hardly at all. Seeing someone again brings back what they
   remember about them, and the feelings with it; a bad enough memory keeps
   a grudge alive after the anger would have worn off; and in a chat they
   pass on what they know, so a reputation gets around.
   ========================================================================== */
import { Emotions } from './emotions.js';
import { line } from './lines.js';
import { BONE_SAID } from './health.js';
import { G } from './stickman.js';
import * as B from './behaviours.js';
import { clamp, clamp01, rand, chance, pick, sign } from '../core/util.js';

const SIGHT = 14;
const BEHIND = 2.2;
// how far away each kind of event can be heard, in metres
const HEAR = {
  hit: 9, death: 12, speech: 9, thud: 8, clatter: 7, knock: 5, swing: 3, knockdown: 10, ko: 10, break: 9,
  spawn: 12, vanish: 12, grabbed: 14, thrown: 14, pickup: 6, throw: 8, land: 4, jump: 3, getup: 6, wake: 6,
  stuck: 7, pullout: 6, clap: 7, collide: 8,
  // a gunshot carries the whole width of the world
  shot: 60, ricochet: 14, dryFire: 4, reload: 5, magOut: 3, magIn: 3, rack: 5, sever: 12, dislocate: 7, relocate: 7, faint: 8,
};
// what counts as violence done to them, for fear and grudges
const VIOLENT = new Set(['koMe', 'cutMe', 'stabbedMe', 'choppedMe', 'severedMe', 'shotMe', 'shotAtMe', 'aimedAtMe', 'sawStab', 'sawShoot', 'sawSever', 'sawKill', 'sawThreat']);

/**
 * The things worth remembering: how much each one matters to begin with
 * (it fades from there, the small things fast and the big ones hardly at
 * all), whether it was good or bad, how they would put it to themselves, and
 * how they would put it to somebody else - "Axl ... shot me" - if at all.
 */
const MEMORY = {
  met: [0.12, 0.15, (m) => `Met ${m.who.name}`, null],
  hurtMe: [0.35, -0.6, (m) => `${m.who.name} hit me`, () => 'hit me'],
  koMe: [0.7, -0.7, (m) => `${m.who.name} knocked me out`, () => 'knocked me out cold'],
  cutMe: [0.6, -0.8, (m) => `${m.who.name} cut me with a knife`, () => 'cut me with a knife'],
  stabbedMe: [0.8, -0.9, (m) => `${m.who.name} stabbed me`, () => 'stabbed me'],
  choppedMe: [0.85, -0.95, (m) => `${m.who.name} went at me with a machete`, () => 'came at me with a machete'],
  severedMe: [1, -1, (m) => `${m.who.name} cut off my ${m.what}`, (m) => `cut off my ${m.what}`],
  shotMe: [1, -1, (m) => `${m.who.name} shot me`, () => 'shot me'],
  shotAtMe: [0.65, -0.85, (m) => `${m.who.name} shot at me`, () => 'shot at me'],
  aimedAtMe: [0.45, -0.6, (m) => `${m.who.name} pointed a gun at me`, () => 'pulled a gun on me'],
  threwAtMe: [0.4, -0.5, (m) => `${m.who.name} threw a crate at me`, () => 'threw a crate at me'],
  insultedMe: [0.25, -0.35, (m) => `${m.who.name} insulted me`, null],
  praisedMe: [0.2, 0.35, (m) => `${m.who.name} said something nice to me`, null],
  helpedMe: [0.6, 0.8, (m) => `${m.who.name} helped me when I was hurt`, () => 'helped me when I was hurt'],
  savedMe: [0.85, 0.95, (m) => `${m.who.name} ${m.what}`, (m) => m.what],
  hugged: [0.3, 0.55, (m) => `Hugged ${m.who.name}`, null],
  beatMe: [0.55, -0.6, (m) => `${m.who.name} beat me in a fight`, () => 'beat me up'],
  iBeat: [0.4, 0.2, (m) => `I beat ${m.who.name}`, null],
  iKilled: [1, -0.4, (m) => `I killed ${m.who.name}`, null],
  sawAttack: [0.3, -0.4, (m) => `Saw ${m.who.name} attack ${m.about.name}`, (m) => `attacked ${m.about.name}`],
  sawStab: [0.6, -0.75, (m) => `Saw ${m.who.name} stab ${m.about.name}`, (m) => `stabbed ${m.about.name}`],
  sawShoot: [0.8, -0.9, (m) => `Saw ${m.who.name} shoot ${m.about.name}`, (m) => `shot ${m.about.name}`],
  sawThreat: [0.4, -0.6, (m) => `Saw ${m.who.name} pull a gun on ${m.about.name}`, (m) => `pulled a gun on ${m.about.name}`],
  sawSever: [0.9, -1, (m) => `Saw ${m.who.name} cut off ${m.about.name}'s ${m.what}`, (m) => `cut off ${m.about.name}'s ${m.what}`],
  sawKill: [0.95, -1, (m) => `Saw ${m.who.name} kill ${m.about.name}`, (m) => `killed ${m.about.name}`],
  sawHelp: [0.35, 0.6, (m) => `${m.who.name} helped ${m.about.name}`, (m) => `helped ${m.about.name}`],
  lostFriend: [0.9, -0.8, (m) => (m.about ? `${m.about.name} killed ${m.who.name}` : `${m.who.name} died`), null],
};
// told "X shot me" by Y, what the listener remembers is "X shot Y"
const TOLD_AS = {
  hurtMe: 'sawAttack', koMe: 'sawAttack', cutMe: 'sawAttack', choppedMe: 'sawAttack', beatMe: 'sawAttack', threwAtMe: 'sawAttack',
  stabbedMe: 'sawStab', severedMe: 'sawSever', shotMe: 'sawShoot', shotAtMe: 'sawThreat', aimedAtMe: 'sawThreat',
  helpedMe: 'sawHelp', savedMe: 'sawHelp',
};

/** Which group someone is in, the way the inspector lists them. */
export function relCategory(r) {
  if (!r || !r.met) return 'stranger';
  if (r.enemy || r.like < -0.6) return 'enemy';
  if (r.like < -0.25) return 'dislikes';
  if (r.like > 0.4) return 'friend';
  return 'knows';
}
// the things people say over and over when it is going badly, and how long before they say each again
const REPEAT = {
  beg: 4, surrender: 4, surrenderGun: 4, comfort: 4.5, crawl: 5, flee: 3.5, pinned: 3, paralysed: 4, shot: 1.5,
  gunFear: 6, knifeFear: 6, macheteFear: 6, weaponFear: 6, gunshots: 3, sawShooting: 3, nearMiss: 2.5, hurtSmall: 2,
};
// ...and the ones that are really the same plea
const SAID_AS = { surrender: 'beg', surrenderGun: 'beg' };
const HELP_CALLS = new Set(['fear', 'flee', 'beg', 'pinned', 'crawl', 'panic', 'hurtBig', 'broken']);
// doing nothing much: free to turn round at a noise (the rest point themselves where they need to)
const GLANCE_FREE = new Set(['idle', 'rest', 'inspect']);

const standing = (o) => o && !o.removed && o.alive && o.conscious && (o.state === 'stand' || o.state === 'air');
const WEAPON_KINDS = new Set(['knuckles', 'knife', 'machete', 'glock']);
const capital = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** How one person feels about another. */
class Rel {
  constructor(o) {
    this.other = o;
    this.like = rand(-0.06, 0.14);
    this.fear = 0;
    this.anger = 0;
    this.fam = 0;
    this.met = false;
    this.greeted = false;
    this.lastSeen = -99;
    this.hurtMe = 0;
    this.hurtT = -99;
    this.chatT = -99;
    this.foughtT = -99;
    this.attackOn = null;   // who I last saw them attack
    this.attackT = -99;
    this.violent = 0;
    this.killed = null;     // someone I cared about that they killed
    this.sawArmed = false;
    this.enemy = false;     // set from the inspector: a grudge that does not wear off
    this.recalled = -99;
    this.aimedAtMe = -99;
  }
}

export class Brain {
  constructor(man, traits) {
    this.man = man;
    this.sb = man.sandbox;
    this.traits = traits;
    this.emo = new Emotions(traits);
    this.rels = new Map();
    this.things = new Map();
    this.inspected = new Set();
    this.griefs = new Map();
    this.thoughts = [];
    this.behaviour = null;
    this.options = [];
    this.visible = [];
    this.senseT = rand(0, 0.2);
    this.thinkT = rand(0.3, 0.8);
    this.react = 0;
    this.boredom = rand(0, 0.3);
    this.lonely = 0;
    this.victory = 0;
    this.guilt = 0;
    this.restedT = -99;       // when they last got up from a sit
    this.begging = false;
    this.stayDown = false;
    this.calledHelp = -99;
    this.spokeT = -99;
    this.saidT = {};          // when they last said each kind of thing
    this.lastLine = '';
    this.iconT = -99;
    this.expressT = rand(1, 3);
    this.dodged = new Map();
    this.heard = null;
    this.glance = null;       // a noise to turn round to: { x, at }
    this.saidDying = false;
    this.grabbedCount = 0;
    this.downTalk = rand(1, 3);
    // a quirk rather than a trait: some people just like throwing things
    this.throwy = Math.random();
    this.memories = [];
    this.ordered = null;      // told to do something from the inspector: { kind, target, t }
    this.gunThreat = null;    // the last shots they heard: { who, t, x }
    this.aimedBy = null;      // who has a gun on them right now
    this.aimedT = -99;
    this.horror = 0;          // how much gore they have just seen
    this.checkT = -99;        // when to have a look at a fresh wound
    this.seenLimbs = new Set();
    this.note('Where am I? Grey sky, black ground.');
  }

  rel(o) {
    let r = this.rels.get(o);
    if (!r) { r = new Rel(o); this.rels.set(o, r); }
    return r;
  }

  get fighting() { return !!this.behaviour && this.behaviour.kind === 'fight'; }
  get fightTarget() {
    const b = this.behaviour;
    return b && (b.kind === 'fight' || b.kind === 'throw') ? b.target : null;
  }
  get fleeing() {
    const k = this.behaviour && this.behaviour.kind;
    return k === 'flee' || k === 'hide' || k === 'panic' || k === 'cower';
  }

  /** What they are doing, in words, for the inspector. */
  get doing() {
    const me = this.man;
    if (me.dead) return 'Dead';
    if (!me.conscious) return 'Out cold';
    switch (me.state) {
      case 'held': return 'Being held up in the air';
      case 'thrown': return me.onGround ? 'Falling over' : 'Flying through the air';
      case 'crawl': return me.health.paralysed === 'legs' ? 'Dragging themselves along' : 'Crawling';
      case 'down': return me.health.paralysed === 'all' ? 'Lying paralysed' : this.stayDown ? 'Staying down' : me.pinnedBy ? 'Pinned under a crate' : 'On the floor';
      case 'getup': return 'Getting up';
      case 'stagger': return 'Staggering';
      default: return this.behaviour ? this.behaviour.label : 'Thinking';
    }
  }

  note(text) {
    if (!text || (this.thoughts.length && this.thoughts[this.thoughts.length - 1].text === text)) return;
    this.thoughts.push({ t: this.sb.time, text });
    if (this.thoughts.length > 8) this.thoughts.shift();
  }

  /** Says a line of some kind, if they are in a state to and not mid-sentence. */
  speak(kind, vars = {}, p = 1, to = null, loud = false) {
    const me = this.man;
    if (!me.alive || !me.conscious || !chance(p)) return false;
    const now = this.sb.time;
    if (now - this.spokeT < (loud ? 0.8 : 1.8)) return false;
    const said = SAID_AS[kind] || kind;
    if (REPEAT[said] && now - (this.saidT[said] ?? -99) < REPEAT[said]) return false;
    vars.me = me.name;
    let text = line(kind, vars);
    if (text === this.lastLine) text = line(kind, vars);
    if (!text) return false;
    this.spokeT = now;
    this.saidT[said] = now;
    this.lastLine = text;
    me.say(text, { loud, to, kind });
    return true;
  }

  /* -------------------------------------------------------------------------- */
  /*                                    loop                                    */
  /* -------------------------------------------------------------------------- */

  update(dt) {
    const me = this.man;
    if (me.removed || me.dead) return;
    this.emo.update(dt);
    this.feelings(dt);
    if ((this.senseT -= dt) <= 0) {
      this.senseT = 0.18 + rand(0, 0.06);
      this.sense();
    }
    if (!me.conscious) {
      if (this.behaviour) this.clearBehaviour();
      return;
    }
    this.react = Math.max(0, this.react - dt);
    this.reflexes();
    const g = this.glance;
    if (g && this.sb.time >= g.at) {
      // the noise behind them: they turn round, and see what made it
      this.glance = null;
      const free = !this.behaviour || GLANCE_FREE.has(this.behaviour.kind);
      if (free && me.ready && me.intent.x === null && sign(g.x - me.pos.x) !== me.facing) {
        me.faceTo(g.x);
        this.sense();
      }
    }
    const st = me.state;
    if (st === 'down' || st === 'crawl' || st === 'held') { this.whileDown(dt); return; }
    if (st !== 'stand' && st !== 'air' && st !== 'climb') return;
    this.stayDown = false;
    // a moment after a cut or a bullet, a look at the damage
    if (this.checkT > 0 && this.sb.time >= this.checkT) {
      this.checkT = -99;
      if (me.ready && !this.fighting && !(this.behaviour && this.behaviour.kind === 'flee') && me.perform('checkWound')) {
        this.speak(me.health.bleeding > 0.004 ? 'seeBlood' : 'checkWound', {}, 0.8, null, me.health.bleeding > 0.004);
      }
    }
    if ((this.thinkT -= dt) <= 0 && this.react <= 0) {
      this.thinkT = 0.35 + rand(0, 0.25);
      this.think();
    }
    const b = this.behaviour;
    if (b) {
      const ok = b.update(dt);
      if (!ok && this.behaviour === b) {
        b.end();
        this.behaviour = null;
        this.thinkT = Math.min(this.thinkT, 0.05);
      }
    }
    this.express(dt);
  }

  clearBehaviour() {
    if (this.behaviour) this.behaviour.end();
    this.behaviour = null;
    this.begging = false;
  }

  setBehaviour(b, why) {
    if (this.behaviour) this.behaviour.end();
    this.behaviour = b;
    b.start();
    if (why) this.note(why);
    if (b.icon && this.sb.time - this.iconT > 2.5) {
      this.iconT = this.sb.time;
      this.man.think(b.icon);
    }
  }

  /** A behaviour handing over to another one (a flight that becomes hiding). */
  force(b) { this.setBehaviour(b, null); }

  /* -------------------------------------------------------------------------- */
  /*                                    sense                                   */
  /* -------------------------------------------------------------------------- */

  /** Can they see a point? `own` is the body the point is on, which does not hide itself. */
  canSee(x, y, own = null) {
    const me = this.man;
    if (!me.conscious) return false;
    const eye = me.wj.head;
    const dx = x - eye.x, d = Math.abs(dx);
    if (d > SIGHT || Math.abs(y - eye.y) > 9) return false;
    if (d > BEHIND && sign(dx) !== me.facing && !me.lying) return false;
    return this.sb.lineOfSight(eye.x, eye.y, x, y, own);
  }

  sees(o) { return this.visible.includes(o); }

  sense() {
    const me = this.man, sb = this.sb, now = sb.time;
    this.visible.length = 0;
    if (!me.conscious) return;
    for (const o of sb.people) {
      if (o === me || o.removed) continue;
      if (!this.canSee(o.wj.head.x, o.wj.head.y) && !this.canSee(o.wj.hip.x, o.wj.hip.y + 0.15)) continue;
      this.visible.push(o);
      const r = this.rel(o);
      const first = !r.met;
      const absent = r.met && now - r.lastSeen > 25;
      r.met = true;
      r.lastSeen = now;
      if (first) this.firstSight(o, r);
      else if (absent) this.recall(o, r);
      if (o.dead && !this.griefs.has(o)) this.foundBody(o, r);
      if (o.weapon && r.sawArmed !== o.armedWith) {
        r.sawArmed = o.armedWith;
        const k = o.armedWith;
        // a blade or a gun frightens people even from someone who has not used it yet
        const scary = k === 'glock' ? 0.5 : k === 'machete' ? 0.42 : k === 'knife' ? 0.35 : 0;
        if (this.isHostile(o) || r.like < -0.2 || r.violent > 0.5 || (scary && r.like < 0.3)) {
          r.fear = clamp01(r.fear + (scary || 0.2) * (1.1 - this.traits.bravery));
          const say = k === 'glock' ? 'gunFear' : k === 'machete' ? 'macheteFear' : k === 'knife' ? 'knifeFear' : 'weaponFear';
          this.speak(say, { other: o.name }, 0.75, o, !!scary);
        }
      } else if (!o.weapon) r.sawArmed = false;
      // a gun pointed this way
      if (o.aimTarget === me && o.aiming) {
        if (now - this.aimedT > 2) {
          this.emo.bump('fear', 0.35 * (1.2 - this.traits.bravery));
          this.emo.bump('surprise', 0.4);
          r.fear = clamp01(r.fear + 0.3 * (1.1 - this.traits.bravery));
          this.remember('aimedAtMe', o);
          this.react = Math.max(this.react, 0.2);
          this.thinkT = 0;
        }
        this.aimedBy = o;
        this.aimedT = now;
        r.aimedAtMe = now;
      }
      // a limb gone: horrible to see
      if (o.alive && Object.keys(o.cut).length && !r.sawCut) {
        r.sawCut = true;
        this.speak('sawSevered', { victim: o.name }, 0.8, null, true);
        this.shaken(0.5);
      } else if (!Object.keys(o.cut).length) r.sawCut = false;
      if (o.stuck.length && !r.sawStuck && o.alive) {
        r.sawStuck = true;
        this.emo.bump('fear', 0.15 * (1.1 - this.traits.bravery));
        this.emo.bump('surprise', 0.3);
        this.speak('knifeStuckSee', { victim: o.name }, 0.8, null, true);
        this.note(`There's a knife sticking out of ${o.name}!`);
      } else if (!o.stuck.length) r.sawStuck = false;
    }
    for (const k of sb.weapons) {
      if (k.wornBy || (k.stuckIn && k.stuckIn.person)) this.things.delete(k);
      else if (this.canSee(k.pos.x, k.pos.y + 0.1)) this.things.set(k, now);
    }
    for (const c of sb.crates) if (this.canSee(c.pos.x, c.pos.y, c.body)) this.things.set(c, now);
    // a piece of somebody, lying on the floor
    for (const l of sb.limbs) {
      if (this.seenLimbs.has(l) || !this.canSee(l.pos.x, l.pos.y + 0.05)) continue;
      this.seenLimbs.add(l);
      this.things.set(l, now);
      this.speak('limbSee', { victim: l.of }, 0.8, null, true);
      this.note(`There's a ${l.name.toLowerCase()} on the floor. ${l.of}'s.`);
      this.shaken(0.35);
    }
    for (const t of this.things.keys()) if (t.removed) this.things.delete(t);
    this.grudges();
    this.updateMood();
  }

  /**
   * What they remember keeps old feelings going after they would have worn
   * off: a bad enough memory of someone is a grudge (and if it was violence,
   * a fear), and an enemy stays an enemy.
   */
  grudges() {
    const T = this.traits;
    for (const [o, r] of this.rels) {
      if (o.removed) continue;
      const m = this.worstAbout(o);
      let floor = r.enemy ? 0.45 : 0;
      if (m) floor = Math.max(floor, m.w * -m.v * (0.25 + T.temper * 0.4) * (1 - T.empathy * 0.5));
      if (r.anger < floor) r.anger = floor;
      if (r.enemy && r.like > -0.55) r.like = -0.55;
      if (m && VIOLENT.has(m.kind)) {
        const ff = m.w * 0.35 * (1 - T.bravery);
        if (r.fear < ff) r.fear = ff;
      }
    }
  }

  firstSight(o, r) {
    if (o.dead) return;
    this.emo.bump('surprise', 0.12);
    this.note(`There's someone: ${o.name}.`);
    this.remember('met', o);
    // someone they have only heard about
    const m = this.strongestAbout(o);
    if (m && m.from && m.w > 0.2) {
      this.note(`So that's ${o.name}. I've heard about them.`);
      if (m.v < 0) this.speak('heardOf', { other: o.name }, 0.6, null);
    } else if (m && m.w > 0.25) {
      // never had a proper look at them, but they know what they did
      this.recall(o, r);
    }
  }

  /** A body nobody saw fall. */
  foundBody(o, r) {
    const T = this.traits;
    const care = Math.max(0, r.like) + r.fam * 0.35;
    this.griefs.set(o, { t: this.sb.time, care, mourned: 0 });
    this.emo.bump('surprise', 0.5);
    this.emo.bump('fear', 0.22 * (1.2 - T.bravery));
    this.emo.bump('sadness', 0.08 + care * 0.6);
    this.speak(care > 0.2 ? 'witnessDeath' : 'scaredOfDead', { victim: o.name }, 0.8, null, care > 0.2);
    this.note(`${o.name} is lying there dead.`);
  }

  updateMood() {
    const me = this.man, E = this.emo;
    let m = 'calm';
    if (me.health.pain > 45) m = 'hurt';
    else if (E.fear > 0.5) m = 'scared';
    else if (E.anger > 0.5) m = 'angry';
    else if (E.sadness > 0.45) m = 'sad';
    else if (E.joy > 0.6) m = 'happy';
    me.mood = m;
  }

  /* -------------------------------------------------------------------------- */
  /*                                    feel                                    */
  /* -------------------------------------------------------------------------- */

  /** Things that go on weighing on them, every step. */
  feelings(dt) {
    const me = this.man, E = this.emo, T = this.traits, h = me.health, now = this.sb.time;
    const p = h.pain / 100;
    if (p > 0.2) {
      E.bump('fear', dt * 0.025 * p * (1.2 - T.toughness));
      E.bump('sadness', dt * 0.01 * p);
    }
    let friends = 0, anyone = 0;
    for (const o of this.visible) {
      if (o.dead) { E.bump('fear', dt * 0.003 * (1 - T.bravery)); continue; }
      anyone++;
      const r = this.rels.get(o);
      const trouble = o.lying || !o.conscious || (o.brain && o.brain.fleeing) || now - o.hurtT < 3;
      if (r && r.like > 0.35 && Math.abs(o.pos.x - me.pos.x) < 5) {
        if (trouble) { E.bump('fear', dt * 0.03 * (1 - T.bravery)); E.bump('sadness', dt * 0.02 * T.empathy); }
        else friends++;
      }
      if (o.weapon && this.isHostile(o)) E.bump('fear', dt * (o.armedWith === 'knife' ? 0.06 : 0.03) * (1 - T.bravery * 0.6));
    }
    if (friends) E.bump('joy', dt * 0.012 * friends * (0.4 + T.sociability));
    this.lonely = anyone ? Math.max(0, this.lonely - dt * 0.05) : Math.min(1, this.lonely + dt * 0.008 * T.sociability);
    if (this.lonely > 0.5) E.bump('sadness', dt * 0.004);
    const busy = this.behaviour && this.behaviour.kind !== 'idle' && this.behaviour.kind !== 'wander';
    this.boredom = clamp01(this.boredom + dt * (busy ? -0.05 : 0.012));
    for (const [, g] of this.griefs) if (g.care > 0.15 && now - g.t < 90) E.bump('sadness', dt * 0.006 * g.care);
    this.guilt = Math.max(0, this.guilt - dt * 0.008);
    if (this.guilt > 0.2) E.bump('sadness', dt * 0.008);
    this.victory = Math.max(0, this.victory - dt * 0.12);
    this.horror = Math.max(0, this.horror - dt * 0.02);
    // memories fade: the small things in a minute, the terrible ones over a quarter of an hour
    for (let i = this.memories.length - 1; i >= 0; i--) {
      const m = this.memories[i];
      m.w -= dt * 0.004 * (1.25 - m.w0);
      if (m.w <= 0.02) this.memories.splice(i, 1);
    }
    const foe = this.fightTarget;
    if (foe && this.rels.get(foe)) E.anger = Math.max(E.anger, this.rels.get(foe).anger * 0.8);
    const cool = 0.012 - T.temper * 0.006;
    for (const r of this.rels.values()) {
      r.anger = Math.max(0, r.anger - dt * cool);
      r.fear = Math.max(0, r.fear - dt * 0.012);
      r.violent = Math.max(0, r.violent - dt * 0.01);
    }
    if (me.state === 'held') {
      E.bump('fear', dt * 0.1 * (1.2 - T.bravery));
      E.bump('surprise', dt * 0.15);
    }
  }

  /** Every event in the sandbox comes through here. */
  perceive(ev) {
    const me = this.man;
    if (me.removed || me.dead || !me.conscious) return;
    if (ev.who === me) return;
    const src = ev.who || ev.what;
    const x = ev.x ?? (src && src.pos ? src.pos.x : me.pos.x);
    const y = ev.y ?? (src && src.pos ? src.pos.y + 1 : 1);
    const d = Math.abs(x - me.pos.x);
    const seen = this.canSee(x, y, src && src.kind === 'crate' ? src.body : null);
    const heard = d < (HEAR[ev.type] || 6) * (ev.loud ? 1.7 : 1);
    if (!seen && !heard) return;
    const E = this.emo, T = this.traits, now = this.sb.time;
    switch (ev.type) {
      case 'hit': this.sawHit(ev, seen, x, y); break;
      case 'death': this.sawDeath(ev, seen, x, y); break;
      case 'speech':
        if (ev.kind && HELP_CALLS.has(ev.kind) && ev.who && !ev.who.removed) {
          const r = this.rel(ev.who);
          if (r.like > 0.1 || T.empathy > 0.65) r.cried = now;
          E.bump('fear', 0.03 * (1 - T.bravery));
        }
        // a shout, or a voice right behind them, turns them round
        if (!seen) { this.heard = { x, y, t: now }; if (ev.loud || (d < 4 && chance(0.5))) this.hearLoud(x); }
        break;
      case 'knockdown':
      case 'ko':
        if (ev.by === me) {
          // putting them down takes the edge off; out cold takes most of it
          E.bump('joy', 0.06 * (0.3 + T.aggression));
          this.victory = Math.min(1, this.victory + 0.3 * T.aggression);
          const r = this.rel(ev.who);
          r.anger *= ev.type === 'ko' ? 0.45 : 0.8;
        } else {
          E.bump('surprise', 0.15);
          // someone they cannot stand going over: funny, to the unkind
          const r = ev.who ? this.rels.get(ev.who) : null;
          if (seen && r && r.like < -0.3 && T.aggression > 0.5 && T.empathy < 0.5 && me.ready && chance(0.5)) {
            me.faceTo(ev.who.pos.x);
            me.perform('laughPoint');
            this.speak('mock', { victim: ev.who.name }, 0.9, ev.who, true);
          }
        }
        break;
      case 'pickup':
        if (seen && ev.who) this.things.delete(ev.item);
        break;
      case 'grabbed':
        if (seen && ev.who) {
          E.bump('surprise', 0.55);
          E.bump('fear', 0.18 * (1.1 - T.bravery));
          this.speak('seeGrabbed', { victim: ev.who.name }, 0.5, null, true);
          this.note(`${ev.who.name} just floated up into the sky!`);
          this.sawSky = now;
          this.react = Math.max(this.react, 0.3);
        }
        break;
      case 'thud':
      case 'clatter':
        if ((ev.speed || 0) > 5) {
          E.bump('surprise', Math.min(0.4, ev.speed * 0.03));
          if (!seen && E.fear < 0.4) this.heard = { x, y, t: now };
          else if (seen && d < 3 && this.man.ready && chance(0.3)) this.man.perform('flinch');
        }
        break;
      case 'spawn':
        if (seen && ev.what && ev.what.kind === 'stickman' && d < 8) {
          E.bump('surprise', 0.3);
          this.speak('newcomer', { other: ev.what.name }, 0.4);
        } else if (seen) E.bump('surprise', 0.15);
        break;
      case 'vanish':
        if (seen && ev.who) {
          E.bump('surprise', 0.7);
          E.bump('fear', 0.15 * (1 - T.bravery));
          this.speak('sawVanish', { victim: ev.who.name }, 0.8, null, true);
          this.note(`${ev.who.name} just vanished into thin air.`);
        }
        break;
      case 'throw':
        if (seen && ev.who) this.rel(ev.who).violent += 0.6;
        break;
      case 'break':
        E.bump('surprise', 0.2);
        E.bump('fear', 0.05 * (1 - T.bravery));
        break;
      case 'shot': this.heardShot(ev, seen, x, y); break;
      case 'ricochet':
        E.bump('surprise', 0.3);
        if (d < 3) E.bump('fear', 0.15 * (1.2 - T.bravery));
        break;
      case 'sever':
        if (seen && ev.who) {
          const rv = this.rel(ev.who);
          const care = Math.max(0, rv.like) + rv.fam * 0.3;
          E.bump('sadness', 0.05 + care * 0.4 * T.empathy);
          if (ev.by && ev.by !== me && !ev.by.removed) {
            const ra = this.rel(ev.by);
            ra.violent += 2;
            ra.fear = clamp01(ra.fear + 0.35 * (1.15 - T.bravery));
            ra.like = clamp(ra.like - 0.25 - care * 0.3, -1, 1);
            if (care > 0.3) ra.anger = clamp01(ra.anger + 0.3 * care * (0.4 + T.temper));
            this.remember('sawSever', ev.by, ev.who, ev.lost);
          }
          this.speak('sawSevered', { victim: ev.who.name }, 0.85, null, true);
          this.note(`${ev.who.name}'s ${ev.lost} just came off!`);
          this.shaken(0.7);
        } else {
          this.heard = { x, y, t: now };
          this.hearLoud(x);
        }
        break;
      case 'dryFire':
        // a click instead of a bang: the brave see their chance
        if (seen && ev.who && this.isHostile(ev.who) && T.bravery > 0.55) {
          this.rel(ev.who).fear *= 0.6;
          this.speak('outOfAmmoSee', { other: ev.who.name }, 0.7, ev.who, true);
        }
        break;
      case 'faint':
        if (seen && ev.who) { E.bump('surprise', 0.35); this.speak('sawFaint', { victim: ev.who.name }, 0.5, null); }
        break;
      default:
        break;
    }
  }

  /**
   * A gunshot. Everyone hears it, from anywhere: they jump, and most of them
   * duck. Whoever fired it is now the most frightening person there - more
   * so if they were aiming at them.
   */
  heardShot(ev, seen, x, y) {
    const me = this.man, E = this.emo, T = this.traits, now = this.sb.time;
    const by = ev.who && !ev.who.removed ? ev.who : null;
    E.bump('surprise', 0.75);
    // the nearer it went off, the worse
    const d = Math.abs(x - me.pos.x);
    E.bump('fear', (seen ? 0.3 : 0.18) * (1.25 - T.bravery) * (d < 8 ? 1.4 : d < 20 ? 1 : 0.6));
    this.gunThreat = { who: by, t: now, x, y };
    if (by && by !== me) {
      const r = this.rel(by);
      r.violent += 1.2;
      r.fear = clamp01(r.fear + (ev.target === me ? 0.45 : 0.22) * (1.15 - T.bravery));
      if (ev.target === me) {
        this.remember('shotAtMe', by);
        r.anger = clamp01(r.anger + 0.2 * (0.3 + T.temper));
        r.like = clamp(r.like - 0.3, -1, 1);
      } else if (ev.target && ev.target !== me && seen) {
        this.remember('sawShoot', by, ev.target);
        const rv = this.rel(ev.target);
        if (rv.like > 0.3) r.anger = clamp01(r.anger + 0.25 * rv.like * (0.4 + T.temper));
      }
    }
    // the startle: a flinch, a duck, hands over the head
    if (me.ready && !this.fighting && now - (this.startleT || -9) > 1.2 && chance(0.75 - T.bravery * 0.4)) {
      this.startleT = now;
      me.perform(chance(0.6) ? 'duck' : 'flinch', { fadeIn: 0.03, fadeOut: 0.15 });
    }
    if (now - (this.shotSaidT || -9) > 4) {
      this.shotSaidT = now;
      if (!seen) this.speak('gunshots', {}, 0.7, null, true);
      else if (by && ev.target && ev.target !== me) this.speak('sawShooting', { other: by.name, victim: ev.target.name }, 0.6, null, true);
      else if (by) this.speak('takeCover', { other: by.name }, 0.6, null, true);
    }
    if (!seen) { this.heard = { x, y, t: now }; this.hearLoud(x); }
    this.react = Math.max(this.react, 0.15 + (1 - T.skill) * 0.15);
    this.thinkT = 0;
  }

  /**
   * Something horrible, seen: a limb coming off, a body full of holes. Some
   * people go pale and steady themselves; some are sick; a few faint.
   */
  shaken(amount) {
    const me = this.man, T = this.traits, E = this.emo;
    E.bump('fear', amount * 0.45 * (1.2 - T.bravery));
    E.bump('surprise', amount * 0.7);
    E.bump('sadness', amount * 0.2 * T.empathy);
    this.horror = Math.min(1.5, this.horror + amount);
    const weak = (1 - T.toughness) * (0.4 + T.empathy * 0.6) * (1.1 - T.bravery * 0.5);
    if (this.horror > 0.8 && me.state === 'stand' && chance(weak * 0.3)) {
      this.speak('faint', {}, 1);
      me.faint();
      this.note('Everything went white...');
      return;
    }
    if (this.horror > 0.45 && me.ready && chance(weak * 0.7)) {
      me.perform('retch');
      this.speak('retch', {}, 0.8);
    }
  }

  /** Something loud close by that they did not see: in a moment they turn round to look. */
  hearLoud(x) {
    const me = this.man;
    if (this.glance || Math.abs(x - me.pos.x) > 9) return;
    this.glance = { x, at: this.sb.time + rand(0.25, 0.6) * (1.3 - this.traits.skill * 0.5) };
  }

  sawHit(ev, seen, x, y) {
    const me = this.man, E = this.emo, T = this.traits, now = this.sb.time;
    const A = ev.by, V = ev.who;
    E.bump('surprise', seen ? 0.12 : 0.06);
    if (!seen) { this.heard = { x, y, t: now }; this.hearLoud(x); return; }
    if (!A || A === me || A.removed || !V) return;
    const ra = this.rel(A), rv = this.rel(V);
    // the worse the weapon, the more it is remembered
    if (ev.weapon === 'knife' && ev.deep) this.remember('sawStab', A, V);
    else if (ev.weapon === 'bullet') this.remember('sawShoot', A, V);
    else if (!ev.blocked && ev.power > 0.6) this.remember('sawAttack', A, V);
    if ((ev.weapon === 'bullet' || ev.weapon === 'machete') && !ev.blocked && V.alive) this.shaken(ev.weapon === 'bullet' ? 0.25 : 0.3);
    // was it self defence? only if V went for A first, as far as I saw
    const defending = rv.attackOn === A && now - rv.attackT < 12;
    ra.attackOn = V;
    ra.attackT = now;
    ra.violent += ev.power * (defending ? 0.05 : 0.15);
    if (rv.like > 0.25) {
      const k = rv.like * (0.5 + T.temper * 0.6) * (defending ? 0.4 : 1);
      ra.anger = clamp01(ra.anger + (0.12 + ev.power * 0.06) * k);
      ra.like = clamp(ra.like - 0.12 * rv.like, -1, 1);
      E.bump('anger', 0.08 * k);
      E.bump('fear', 0.04 * (1 - T.bravery));
      if (!this.fighting) this.speak('defendFriend', { victim: V.name, other: A.name }, 0.3, A, true);
    } else if (rv.like < -0.3) {
      E.bump('joy', 0.05 * T.aggression);
      ra.like = clamp(ra.like + 0.04, -1, 1);
    } else {
      if (!defending) ra.like = clamp(ra.like - 0.04 * (0.4 + T.empathy), -1, 1);
      const nasty = ev.weapon === 'bullet' ? 3 : ev.weapon === 'machete' ? 2.8 : ev.weapon === 'knife' ? 2.4 : A.weapon ? 1.5 : 1;
      E.bump('fear', ev.power * 0.035 * (1.2 - T.bravery) * nasty);
      if (ev.weapon === 'knife' && !this.fighting) this.speak('sawStab', { victim: V.name, other: A.name }, 0.5, null, true);
      else if (ev.weapon === 'machete' && !this.fighting) this.speak('sawChop', { victim: V.name, other: A.name }, 0.5, null, true);
      else if (ev.weapon === 'bullet' && !this.fighting) this.speak('sawShot', { victim: V.name, other: A.name }, 0.6, null, true);
      if (!this.fighting && !this.fleeing) this.speak('witnessHit', {}, 0.15);
    }
    const nasty = ev.weapon === 'bullet' ? 3 : ev.weapon === 'machete' ? 2.8 : ev.weapon === 'knife' ? 2.6 : A.weapon ? 1.6 : 1;
    ra.fear = clamp01(ra.fear + ev.power * 0.025 * (1 - T.bravery) * nasty);
    if (ev.weapon === 'knife' || ev.weapon === 'machete' || ev.weapon === 'bullet') ra.violent += 0.5;
  }

  sawDeath(ev, seen, x, y) {
    const me = this.man, E = this.emo, T = this.traits, now = this.sb.time;
    const V = ev.who, K = ev.by && !ev.by.removed ? ev.by : null;
    if (!V) return;
    if (!seen && Math.abs(V.pos.x - me.pos.x) > 6) { E.bump('surprise', 0.15); this.heard = { x, y, t: now }; this.hearLoud(x); return; }
    const rv = this.rel(V);
    const care = Math.max(0, rv.like) + rv.fam * 0.35;
    this.griefs.set(V, { t: now, care, mourned: 0 });
    E.bump('surprise', 0.75);
    E.bump('fear', (0.25 + (K ? 0.15 : 0)) * (1.25 - T.bravery));
    E.bump('sadness', 0.1 + care * 0.75 * (0.5 + T.empathy));
    this.react = 0.35 + rand(0, 0.3);
    this.thinkT = 0;
    if (K === me) {
      this.remember('iKilled', V);
      // a stray bullet, a crate meant for someone else: not who it was for
      const meant = rv.anger > 0.45 || rv.hurtMe > 0 || (this.ordered && this.ordered.target === V) || (this.behaviour && this.behaviour.target === V);
      if (!meant) {
        this.guilt = 1;
        E.bump('sadness', 0.45);
        E.bump('fear', 0.25);
        E.bump('surprise', 0.3);
        this.speak('killedAccident', { victim: V.name }, 1, null, true);
        this.note(`I killed ${V.name}. It was never meant for them.`);
        me.setEmote('exclaim', 1.4);
        return;
      }
      if (T.empathy > 0.55 || rv.like > 0.25) {
        this.guilt = 1;
        E.bump('sadness', 0.35);
        E.bump('fear', 0.1);
        this.speak('killedGuilt', { victim: V.name }, 1, null, true);
        this.note(`I killed ${V.name}. I didn't mean to...`);
      } else {
        this.victory = 1;
        E.bump('joy', 0.2 * T.aggression);
        this.speak('killedProud', { victim: V.name }, 0.9, null, true);
        this.note(`${V.name} is dead. They had it coming.`);
      }
      return;
    }
    if (K) {
      const rk = this.rel(K);
      rk.fear = clamp01(rk.fear + 0.35 * (1.15 - T.bravery));
      rk.anger = clamp01(rk.anger + care * 0.85 * (0.4 + T.temper * 0.8));
      rk.like = clamp(rk.like - 0.3 - care * 0.4, -1, 1);
      rk.violent += 2;
      if (care > 0.15) rk.killed = V;
      if (seen) this.remember('sawKill', K, V);
      this.note(`${K.name} killed ${V.name}!`);
    } else {
      this.note(`${V.name} died.`);
    }
    if (care > 0.3) this.remember('lostFriend', V, K);
    this.speak(care > 0.15 ? 'witnessDeath' : 'witnessDeathStranger', { victim: V.name }, 0.85, null, true);
    me.setEmote('exclaim', 1.2);
  }

  /** The body's own news: hurt, knocked down, picked up by the hand... */
  onBody(type, d) {
    const me = this.man, E = this.emo, T = this.traits;
    switch (type) {
      case 'hurt': this.hurt(d); break;
      case 'down':
        E.bump('fear', 0.12 * (1.2 - T.bravery));
        E.bump('anger', 0.06 * T.temper);
        this.clearBehaviour();
        break;
      case 'ko':
        this.note('Everything went black.');
        this.clearBehaviour();
        break;
      case 'wake': {
        // coming round after being knocked out is frightening, and humbling
        E.bump('surprise', 0.4);
        E.bump('fear', 0.18 + 0.3 * (1.2 - T.bravery));
        const by = me.lastHit && me.lastHit.by && !me.lastHit.by.removed ? me.lastHit.by : null;
        if (by) {
          const r = this.rel(by);
          r.fear = clamp01(r.fear + 0.4 * (1.2 - T.bravery));
          r.anger *= 0.5 + T.temper * 0.3;
          this.remember('koMe', by);
          this.note(`${by.name} knocked me out.`);
        } else {
          this.note('I woke up on the floor.');
        }
        this.speak('wake', {}, 0.8);
        break;
      }
      case 'up':
        this.thinkT = 0;
        this.speak('getUp', {}, 0.25);
        break;
      case 'grabbed':
        this.grabbedCount++;
        E.bump('surprise', 1);
        E.bump('fear', 0.45 * (1.2 - T.bravery));
        this.speak(this.grabbedCount > 1 ? 'grabbedAgain' : 'grabbed', {}, 0.9, null, true);
        this.note('Something grabbed me out of the sky!');
        this.clearBehaviour();
        break;
      case 'thrown':
        E.bump('fear', 0.12);
        break;
      case 'armed': {
        const k = d.item ? d.item.kind : 'knuckles';
        E.bump('fear', k === 'glock' ? -0.4 : k === 'knuckles' ? -0.2 : -0.28);
        E.bump('joy', 0.12);
        this.speak({ knife: 'knifeGet', machete: 'macheteGet', glock: 'gunGet' }[k] || 'weaponGet', {}, 0.8);
        this.note({
          knife: 'Got the knife. Now they have to listen.', machete: 'Got the machete. Stay back, everyone.',
          glock: 'Got the gun. Nobody move.',
        }[k] || 'Got the brass knuckles. Nobody messes with me now.');
        me.setEmote('sparkle', 1.2);
        break;
      }
      case 'landed': {
        const r = this.rel(d.target);
        r.anger = Math.max(0, r.anger - (d.target.lying || !d.target.conscious ? 0.09 : 0.025));
        E.bump('joy', 0.02 * T.aggression);
        break;
      }
      case 'healed':
        E.bump('surprise', 0.6);
        E.bump('joy', 0.3);
        E.bump('fear', -0.3);
        this.speak('healed', {}, 0.9);
        this.note("The pain's gone. How?");
        break;
      case 'nearMiss': {
        // a bullet going past close enough to hear it crack
        E.bump('fear', 0.3 * (1.2 - T.bravery));
        E.bump('surprise', 0.5);
        if (d.by && d.by !== me) { const r = this.rel(d.by); r.fear = clamp01(r.fear + 0.2 * (1.1 - T.bravery)); this.remember('shotAtMe', d.by); }
        if (me.ready && chance(0.6)) me.perform('duck', { fadeIn: 0.03, fadeOut: 0.15 });
        this.speak('nearMiss', {}, 0.7, null, true);
        this.note('A bullet went right past me!');
        break;
      }
      case 'severed': {
        E.bump('fear', 0.6);
        E.bump('surprise', 1);
        const by = me.lastHit && me.lastHit.by && !me.lastHit.by.removed ? me.lastHit.by : null;
        if (by) {
          const r = this.rel(by);
          r.fear = clamp01(r.fear + 0.5 * (1.2 - T.bravery));
          r.anger = clamp01(r.anger + 0.4 * (0.3 + T.temper));
          r.like = -1;
          this.remember('severedMe', by, null, d.lost);
        }
        this.speak('severedSelf', { part: d.lost }, 1, null, true);
        this.note(`My ${d.lost}... it's gone. It's on the floor.`);
        break;
      }
      case 'dislocated':
        this.speak('dislocatedSelf', { part: d.joint.replace(/[AB]$/, '') }, 0.9, null, true);
        this.note(`My ${d.joint.replace(/[AB]$/, '')} popped out.`);
        break;
      case 'relocated':
        this.speak('relocated', { other: d.by ? d.by.name : 'you' }, 0.9, d.by, true);
        if (d.by) { this.rel(d.by).like = clamp(this.rel(d.by).like + 0.3, -1, 1); this.remember('savedMe', d.by, null, `put my ${d.joint.replace(/[AB]$/, '')} back in`); }
        break;
      case 'tied':
        this.speak('tourniquetThanks', { other: d.by ? d.by.name : 'you' }, 0.8, d.by);
        if (d.by) { this.rel(d.by).like = clamp(this.rel(d.by).like + 0.35, -1, 1); this.remember('savedMe', d.by, null, 'tied off my wound and saved my life'); }
        break;
      case 'dead':
        this.clearBehaviour();
        this.note(`I died: ${me.health.cause}.`);
        break;
      default:
        break;
    }
  }

  hurt(d) {
    const me = this.man, E = this.emo, T = this.traits, now = this.sb.time;
    const by = d.by && d.by !== me && !d.by.removed ? d.by : null;
    const sev = clamp((d.damage || 0) / 22, 0, 1.6);
    E.bump('surprise', 0.3 + sev * 0.25);
    E.bump('fear', (0.07 + sev * 0.22) * (1.2 - T.bravery));
    E.bump('sadness', sev * 0.04);
    if (by) {
      const r = this.rel(by);
      const friend = r.like > 0.35 && r.hurtMe === 0;
      r.hurtMe += d.damage || 0;
      r.hurtT = now;
      r.attackOn = me;
      r.attackT = now;
      r.like = clamp(r.like - (0.16 + sev * 0.22), -1, 1);
      const anger = (0.2 + sev * 0.32) * (0.5 + T.temper * 0.85) * (0.6 + T.aggression * 0.55) * (d.blocked ? 0.5 : 1);
      r.anger = clamp01(r.anger + anger);
      E.bump('anger', anger * 0.8);
      const knife = d.weapon === 'knife', machete = d.weapon === 'machete', bullet = d.weapon === 'bullet';
      const nasty = bullet ? 3 : machete ? 2.6 : knife ? 2.4 : by.weapon ? 1.6 : 1;
      r.fear = clamp01(r.fear + sev * 0.28 * (1.15 - T.bravery) * nasty);
      if (bullet) {
        E.bump('fear', 0.35 * (1.2 - T.bravery));
        this.remember('shotMe', by);
        this.speak('shot', { other: by.name }, 1, by, true);
        this.note(`${by.name} shot me!`);
      } else if (machete) {
        E.bump('fear', 0.25 * (1.2 - T.bravery));
        this.remember('choppedMe', by);
        this.speak('chopped', { other: by.name }, 0.9, by, true);
        this.note(`${by.name} hit me with a machete!`);
      } else if (knife) {
        E.bump('fear', 0.2 * (1.2 - T.bravery));
        this.remember(d.deep ? 'stabbedMe' : 'cutMe', by);
        this.speak(d.deep ? 'stabbed' : 'cut', { other: by.name }, 0.9, by, true);
        this.note(d.deep ? `${by.name} stabbed me!` : `${by.name} cut me with a knife!`);
      } else if (friend) {
        this.remember('hurtMe', by);
        this.speak('betrayed', { other: by.name }, 0.9, by, true);
        this.note(`${by.name} hit me! I thought we were friends.`);
      } else {
        // blocked or not, being gone for is something they remember
        this.remember(d.kind === 'impact' && d.object && d.object.kind === 'crate' ? 'threwAtMe' : 'hurtMe', by);
        this.note(d.blocked ? `${by.name} went for me.` : `${by.name} hit me${d.part === 'head' ? ' in the head' : ''}.`);
      }
    } else if (d.weapon === 'bullet') {
      E.bump('fear', 0.4 * (1.2 - T.bravery));
      this.speak('shot', { other: 'someone' }, 1, null, true);
      this.note('I got shot! Where did that come from?');
    } else if (d.weapon === 'knife' || (d.object && (d.object.kind === 'knife' || d.object.kind === 'machete'))) {
      E.bump('fear', 0.25 * (1.2 - T.bravery));
      this.speak('stabbed', { other: 'someone' }, 0.9, null, true);
      this.note('A knife came out of nowhere and went into me!');
      this.blame();
    } else if (d.kind === 'impact' && d.object && d.object.kind === 'stickman') {
      const o = d.object;
      if (me.state === 'thrown' || me.state === 'held') this.speak('sorry', { other: o.name }, 0.7, o, true);
      else {
        this.speak('bodyHit', { other: o.name }, 0.8, o, true);
        this.note(`${o.name} came flying through the air and crashed into me.`);
      }
    } else if (d.kind === 'impact') {
      this.speak('crateHit', {}, 0.6, null, true);
      this.note('Something hit me out of nowhere!');
      this.blame();
    } else if (d.kind === 'fall' && sev > 0.4) {
      this.note('I hit the ground hard.');
    }
    const broke = d.res && d.res.broke;
    if (broke) {
      const kind = broke === 'neck' ? (me.health.paralysed === 'all' ? 'paralysed' : 'broken')
        : broke === 'spine' ? 'brokenSpine' : broke === 'ribs' ? 'brokenRibs' : broke === 'skull' ? 'brokenSkull' : broke === 'pelvis' ? 'brokenPelvis' : 'broken';
      this.speak(kind, { part: BONE_SAID[broke] }, 1, null, true);
      this.note(broke === 'neck' && me.health.paralysed === 'all' ? "I can't feel anything below my neck." : `My ${BONE_SAID[broke]} is broken.`);
    } else if (me.health.lostTooth) {
      me.health.lostTooth = false;
      this.speak('lostTooth', {}, 0.9, null, true);
    } else if (sev > 0.7) this.speak('hurtBig', {}, 0.8, null, true);
    else if (sev > 0.2) this.speak(chance(0.3) ? 'hurtPart' : 'hurtSmall', { partKey: d.part }, 0.5, null, true);
    // cut or shot: in a moment, a look at it
    if (d.res && d.res.wound && (d.weapon === 'bullet' || d.weapon === 'knife' || d.weapon === 'machete') && me.alive) this.checkT = this.sb.time + rand(0.7, 1.5);
    if (me.alive && me.health.blood < 0.5 && !this.saidDying) {
      this.saidDying = true;
      this.speak('dying', {}, 1);
      this.note("I'm losing a lot of blood...");
    }
    this.react = Math.max(this.react, 0.12 + (1 - T.skill) * 0.25 + rand(0, 0.1));
    this.thinkT = 0;
  }

  /** Hit by something from nowhere: a hot head blames whoever is nearest. */
  blame() {
    const T = this.traits;
    if (!chance(0.2 + T.temper * 0.5)) return;
    const o = this.nearestVisible((p) => p.alive && p.conscious, 5);
    if (!o) return;
    const r = this.rel(o);
    r.anger = clamp01(r.anger + 0.3 * (0.5 + T.temper));
    r.like = clamp(r.like - 0.15, -1, 1);
    this.speak('blame', { other: o.name }, 1, o, true);
    this.note(`I bet ${o.name} threw that.`);
  }

  /** Someone said something to them. They may answer, and it changes things. */
  spokenTo(from, kind, data = null) {
    const me = this.man, E = this.emo, T = this.traits, now = this.sb.time;
    if (!me.alive || !me.conscious) return;
    const r = this.rel(from);
    r.met = true;
    r.fam = clamp01(r.fam + 0.06);
    let reply = 'reply';
    if ((kind === 'gossipBad' || kind === 'gossipGood') && data && data.mem) {
      this.heardGossip(from, data.mem);
      reply = kind === 'gossipBad' ? 'gossipReplyBad' : 'gossipReplyGood';
    } else if (kind === 'insult' || kind === 'grumpy') {
      const sting = kind === 'insult' ? 1.4 : 0.6;
      r.like = clamp(r.like - 0.1 * sting, -1, 1);
      r.anger = clamp01(r.anger + (0.1 + T.temper * 0.22) * sting);
      E.bump('anger', 0.08 * sting * (0.4 + T.temper));
      E.bump('sadness', 0.04 * (1 - T.temper));
      reply = r.anger > 0.3 && T.aggression > 0.4 ? 'insulted' : 'insultedMeek';
      if (kind === 'insult') { this.note(`${from.name} insulted me.`); this.remember('insultedMe', from); }
    } else if (kind === 'compliment') {
      r.like = clamp(r.like + 0.12, -1, 1);
      E.bump('joy', 0.12);
      this.remember('praisedMe', from);
      reply = 'thanksCompliment';
    } else if (kind === 'sadTalk') {
      reply = T.empathy > 0.4 ? 'sadReply' : 'reply';
      r.like = clamp(r.like + 0.04, -1, 1);
    } else if (kind === 'greet' || kind === 'greetFriend' || kind === 'greetCold') {
      reply = r.like < -0.25 || kind === 'greetCold' ? 'greetCold' : 'greet';
      r.greeted = true;
    } else if (kind === 'farewell') {
      reply = null;
      r.chatT = now;
    } else {
      r.like = clamp(r.like + 0.03 + T.sociability * 0.03, -1, 1);
      E.bump('joy', 0.04);
    }
    const b = this.behaviour;
    if (b && b.kind === 'chat' && b.target === from) {
      if (b.reply) b.pending = { reply, at: now + rand(1, 1.5) };
      else if (kind === 'farewell') b.bye = true;
      return;
    }
    const free = !b || b.kind === 'idle' || b.kind === 'wander' || b.kind === 'inspect';
    if (reply && free && me.state === 'stand' && r.anger < 0.45) {
      const c = new B.Chat(this, from, { reply: true });
      this.setBehaviour(c, `${from.name} is talking to me.`);
      c.pending = { reply, at: now + rand(1, 1.5) };
    }
  }

  /** After a line of their own in a chat: they get to know the other person. */
  chatted(o, kind) {
    const r = this.rel(o), T = this.traits;
    r.fam = clamp01(r.fam + 0.06);
    if (kind === 'smalltalk' || kind === 'compliment' || kind === 'greet' || kind === 'greetFriend') {
      r.like = clamp(r.like + 0.04 + T.sociability * 0.04, -1, 1);
      this.emo.bump('joy', 0.05);
      this.boredom = Math.max(0, this.boredom - 0.2);
      this.lonely = 0;
    }
  }

  helpedBy(h) {
    const r = this.rel(h);
    r.like = clamp(r.like + 0.35, -1, 1);
    r.fam = clamp01(r.fam + 0.2);
    this.remember('helpedMe', h);
    this.emo.bump('joy', 0.2);
    this.emo.bump('fear', -0.2);
    this.speak('thanks', { other: h.name }, 0.9, h);
    this.note(`${h.name} helped me up.`);
  }

  /** A fight they did not lose. */
  won(o) {
    const T = this.traits;
    if (T.aggression > 0.45 || this.rel(o).anger > 0.6) this.victory = Math.min(1, this.victory + 0.7);
    this.emo.bump('fear', -0.15);
    this.note(`I beat ${o.name}.`);
    this.remember('iBeat', o);
    if (o.brain && o.conscious) o.brain.remember('beatMe', this.man);
    // told to fight them, and done it
    if (this.ordered && this.ordered.target === o) this.ordered = null;
  }

  /** A dead friend's name, for gloomy small talk. */
  missing() {
    let best = null, care = 0.15;
    for (const [c, g] of this.griefs) if (g.care > care) { care = g.care; best = c; }
    return best ? best.name : 'home';
  }

  /* -------------------------------------------------------------------------- */
  /*                                    think                                   */
  /* -------------------------------------------------------------------------- */

  think() {
    const me = this.man;
    const opts = this.consider();
    this.options = opts.slice(0, 5);
    const best = opts[0];
    if (!best) return;
    const cur = this.behaviour;
    if (cur) {
      const mine = opts.find((o) => o.kind === cur.kind && o.target === cur.target);
      // sticking with something gets a bonus, but not against something urgent
      const keep = mine ? (best.urgent && !mine.urgent ? mine.score : mine.score * 1.3 + 0.05) : 0;
      if (mine === best || keep >= best.score) return;
      if (!best.urgent && me.acting) return;
    }
    const Kind = B.KINDS[best.kind];
    this.setBehaviour(new Kind(this, best.target, best.extra || {}), best.why);
  }

  /** Everything they could do right now, scored, best first. */
  consider() {
    const me = this.man, T = this.traits, E = this.emo, now = this.sb.time;
    const out = [];
    const add = (kind, target, score, why, extra = null, urgent = false) => {
      if (score > 0.03) out.push({ kind, target, score, why, extra, urgent });
    };
    const health = me.health.overall;
    // hands full of crate count as armed: the crate is the weapon
    const canFight = me.strikes().length > 0 || !!me.carrying;
    // a cracked head and a battered body do not want another round
    const fit = clamp(me.health.parts.head.hp / 60, 0.15, 1) * clamp(health * 1.4, 0.25, 1);
    let threat = null, threatScore = 0;
    // someone coming for them right now crowds out everything casual
    let danger = 0;
    for (const o of this.visible) {
      if (this.isHostile(o)) danger = Math.max(danger, 1 / (1 + Math.max(0, Math.abs(o.pos.x - me.pos.x) - 1.5) / 3));
    }
    const calm = 1 - 0.9 * danger;

    for (const [o, r] of this.rels) {
      if (o.removed) continue;
      const seen = this.sees(o);
      if (!seen && now - r.lastSeen > 6) continue;
      const d = Math.abs(o.pos.x - me.pos.x);
      const near = 1 / (1 + Math.max(0, d - 2) / 5);

      if (o.dead) {
        const g = this.griefs.get(o);
        if (g && g.care > 0.15 && g.mourned < 8) {
          add('mourn', o, (0.25 + g.care * 0.7) * (0.5 + T.empathy * 0.6) * (1 - E.fear * 0.6) * near, `${o.name} is gone. I have to go to them.`);
        } else if (!this.inspected.has(o) && T.curiosity > 0.45 && E.fear < 0.5) {
          add('inspect', o, T.curiosity * 0.22 * near, `Is ${o.name} really dead?`);
        }
        continue;
      }

      const hostile = this.isHostile(o);
      const conf = this.confidence(o);

      // fight them
      let f = r.anger * (0.32 + T.aggression * 0.8) * (0.45 + conf) * (1 - E.fear * 0.5);
      if (hostile && o.conscious) f += 0.18 * T.bravery + 0.1 * T.aggression;
      if (r.killed) f += 0.25 * T.temper;
      if (!o.conscious || o.lying) f *= T.aggression > 0.72 && r.anger > 0.82 ? 0.75 : 0.12;
      if (o.brain && o.brain.begging) f *= 1 - T.empathy * 0.8;
      if (r.like > 0.4 && !hostile) f *= 0.35;
      if (!canFight) f *= 0.1;
      f *= fit;
      f *= 1 / (1 + Math.max(0, d - 3) / 4);
      add('fight', o, f,
        r.killed ? `${o.name} killed ${r.killed.name}. They'll pay.` : hostile ? `${o.name} is coming for me. I'll fight.` : `${o.name} has it coming.`,
        null, hostile && d < 3);

      // run from them
      if (o.conscious && !o.lying) {
        const danger = Math.max(r.fear, hostile ? E.fear * 0.8 : r.fear * 0.5);
        // someone who is after them, or who they just watched do something terrible
        const menace = hostile ? 1 : r.violent > 1 ? 0.65 : 0.3;
        let fl = danger * (1.15 - T.bravery * 0.65) * menace * near;
        if (hostile && health < 0.4) fl += 0.35 * (1.2 - T.bravery);
        if (hostile) fl += (1 - fit) * 0.4;
        if (hostile && !canFight) fl += 0.4;
        // nobody sensible squares up to a knife bare-handed
        if (o.armedWith === 'knife' && (hostile || r.violent > 0.5) && me.armedWith !== 'knife') fl += (0.25 + E.fear * 0.3) * (1.15 - T.bravery);
        if (fl > threatScore) { threatScore = fl; threat = o; }
        add('flee', o, fl, `${o.name} scares me. I have to get away!`, null, hostile && d < 4);
      }

      // somebody else's fight
      const ft = o.brain && o.brain.fightTarget;
      if (ft && ft !== me && !ft.removed) {
        const rv = this.rel(ft);
        const cares = Math.max(0, rv.like);
        // nobody who cares about someone stands about while they take a beating:
        // the brave go and stop it, the rest watch and shout
        const beating = cares > 0.3 && r.attackOn === ft && now - r.attackT < 3;
        // and a fight is seen, and run to, from across the floor
        const far = 0.5 + near * 0.5;
        if (rv.like > 0.3 && T.bravery > 0.35) {
          add('confront', o, rv.like * (0.3 + T.bravery * 0.5) * (1 - E.fear * 0.7) * far, `${o.name} is hurting ${ft.name}!`, { victim: ft }, beating);
        } else if ((T.curiosity > 0.3 || cares > 0.3) && E.fear < 0.55) {
          add('watch', o, (0.1 + T.curiosity * 0.22 + cares * 0.3) * (1 - E.fear) * far * calm, `A fight! ${o.name} and ${ft.name}.`, null, beating);
        }
      }

      // talk to them
      if (standing(o) && !hostile && !r.enemy && r.anger < 0.3 && r.fear < 0.35 && !(o.brain && (o.brain.fighting || o.brain.fleeing))) {
        const fresh = now - r.chatT > 25 ? 1 : 0.08;
        // someone already talking to somebody else is left to it
        const ob = o.brain && o.brain.behaviour;
        const busy = ob && ob.kind === 'chat' && ob.target !== me ? 0.25 : 1;
        const s = (0.1 + T.sociability * 0.5) * (0.75 + r.like * 0.8) * (1 - E.anger * 0.6) * (1 - E.fear) *
          (0.7 + this.boredom * 0.6 + this.lonely * 0.5) * (r.greeted ? 1 : 1.4) * fresh * busy / (1 + d / 10);
        add('chat', o, s * calm, r.greeted ? `I'll go talk to ${o.name}.` : `Who's that? I'll say hi to ${o.name}.`);
      }

      // help them
      const pinned = o.pinnedBy && now - o.pinT < 0.5;
      const urgent = o.health.needsTourniquet.length > 0;
      const jointOut = Object.values(o.health.dislocated).some(Boolean);
      const needs = o.lying || o.state === 'crawl' || pinned || !o.conscious || o.stuck.length > 0 || o.health.bleeding > 0.003 || urgent || jointOut;
      if (needs && !hostile && r.like > -0.2 && !o.dead) {
        const cried = (now - (r.cried || -99) < 8 ? 1.4 : 1) * (o.stuck.length || o.health.bleeding > 0.003 ? 1.3 : 1) * (urgent ? 1.6 : 1);
        // having done what they could, they let it be for a while - unless it is getting worse
        const helping = this.behaviour && this.behaviour.kind === 'help' && this.behaviour.target === o;
        const done = helping || urgent || o.health.bleeding > 0.004 || o.stuck.length || pinned || jointOut ? 1 : 0.15 + 0.85 * clamp01((now - (r.helpedT ?? -99) - 12) / 30);
        add('help', o, T.empathy * (0.3 + Math.max(0, r.like) * 0.7) * (1 - E.fear * 0.7) * near * cried * done,
          `${o.name} is hurt. I should help.`);
      }

      // throw something heavy at them: better than walking over, if they are
      // running away, up out of reach, or not someone to take on up close
      const throwing = this.behaviour && this.behaviour.kind === 'throw' && this.behaviour.target === o;
      if (me.carrying && throwing) {
        add('throw', o, 0.4 + r.anger * 0.6, `I'll throw this crate at ${o.name}!`, { crate: me.carrying });
      } else if (r.anger > 0.45 && d > 2.5 && d < 9 && !me.carrying && me.health.canUse('armA') && me.health.canUse('armB') && o.conscious) {
        const c = this.crateToThrow(o);
        if (c) {
          const cd = Math.abs(c.pos.x - me.pos.x);
          let t = r.anger * (0.35 + T.aggression * 0.5) * (1.25 - conf * 0.5) * (0.6 + this.throwy * 0.8) / (1 + cd / 3);
          if (o.brain && o.brain.fleeing) t += 0.3 * r.anger;
          if (o.pos.y > me.pos.y + 0.6) t += 0.3 * r.anger;
          add('throw', o, t * fit, `I'll throw a crate at ${o.name}!`, { crate: c });
        }
      }
    }

    // a blade in them comes out first, whatever else is going on
    if (me.stuck.length && (me.health.canUse('armA') || me.health.canUse('armB'))) {
      add('pullout', null, 0.75 + me.health.pain / 200, 'There is a blade in me. Get it out!', null, true);
    }

    // told to fight someone: that comes before nearly everything
    const ord = this.ordered;
    if (ord) {
      const o = ord.target;
      if (!o || o.removed || o.dead || now - ord.t > 120) this.ordered = null;
      else if (canFight) add('fight', o, 2.5, `I was told to fight ${o.name}.`, null, true);
    }

    // a gun pointed at them: hands up, unless they are brave enough (and armed enough) not to
    const ab = this.aimedBy;
    if (ab && now - this.aimedT < 0.8 && ab.alive && !ab.removed && ab.armedWith === 'glock') {
      const d = Math.abs(ab.pos.x - me.pos.x);
      const nerve = T.bravery * (me.gunReady ? 1.7 : 1) + (this.ordered && this.ordered.target === ab ? 1 : 0);
      add('surrender', ab, (0.55 + E.fear * 0.6) * Math.max(0, 1.25 - nerve) * (d < 10 ? 1 : 0.5), `${ab.name} is pointing a gun at me!`, null, true);
    }

    // shots: get behind something, or get away
    const gt = this.gunThreat;
    if (gt && now - gt.t < 7 && gt.who && !gt.who.removed && gt.who.alive && gt.who !== me && !(this.ordered && this.ordered.target === gt.who)) {
      const sh = gt.who;
      const scared = (0.45 + E.fear * 0.6) * (1.25 - T.bravery * (me.gunReady ? 1.6 : 1));
      const c = this.coverFrom(sh);
      if (c) add('hide', sh, scared * 1.15, 'Shots! Get behind that crate!', { crate: c }, true);
      const d = Math.abs(sh.pos.x - me.pos.x);
      add('flee', sh, scared * 0.9 / (1 + Math.max(0, d - 8) / 6), `${sh.name} is shooting! Run!`, null, d < 12);
    }
    // the knife, thrown, at someone getting away
    if (me.armedWith === 'knife') {
      for (const [o, r] of this.rels) {
        if (o.removed || !o.alive || !this.sees(o) || r.anger < 0.55) continue;
        const d = Math.abs(o.pos.x - me.pos.x);
        if (d < 3.5 || d > 10) continue;
        const running = o.brain && o.brain.fleeing;
        const t = r.anger * (0.15 + T.aggression * 0.35) * (running ? 1.3 : 0.6) * (0.5 + this.throwy * 0.6);
        add('throwKnife', o, t * fit, `${o.name} won't get away. I'll throw it.`);
      }
    }

    // weapons - grabbed first if they are on the way to someone worth hitting
    if (!me.weapon && me.health.canUse('armA')) {
      const grudge = this.maxAnger();
      const expecting = Math.min(1, threatScore + grudge * 0.6);
      let foeD = Infinity;
      for (const [o, r] of this.rels) if (r.anger > 0.45 && o.alive && !o.removed) foeD = Math.min(foeD, Math.abs(o.pos.x - me.pos.x));
      for (const [k] of this.things) {
        if (!WEAPON_KINDS.has(k.kind) || k.wornBy || k.removed || (k.stuckIn && k.stuckIn.person)) continue;
        if (k.pos.y - me.pos.y > 0.6) continue;
        if (k.kind === 'glock' && k.ammo <= 0) continue;
        const d = Math.abs(k.pos.x - me.pos.x);
        const onTheWay = d < foeD ? grudge * 0.5 * (0.5 + T.aggression) : 0;
        let s = (0.08 + E.anger * 0.4 * (0.4 + T.aggression) + expecting * 0.35 * (0.3 + T.bravery) +
          T.curiosity * 0.12 + T.aggression * 0.12 + onTheWay) / (1 + d / 7);
        if (k.kind === 'knife' || k.kind === 'machete') {
          // a blade is not for everyone: the kind and the timid leave it where it is
          s *= (0.55 + T.aggression * 0.9) * (1.25 - T.empathy * 0.8) * (k.kind === 'machete' ? 1.05 : 1);
          add('arm', k, s, k.kind === 'machete' ? (d < 4 ? 'A machete. Right.' : 'There is a machete over there.')
            : d < 4 ? 'A knife. Nobody will mess with me now.' : 'There is a knife over there.');
        } else if (k.kind === 'glock') {
          // a gun: the angry want it, and so do the brave who are frightened of someone else having it
          const guarded = this.gunThreat && now - this.gunThreat.t < 20 ? 0.35 * T.bravery : 0;
          s = (s + guarded) * (0.45 + T.aggression * 0.8 + T.bravery * 0.25) * (1.25 - T.empathy * 0.8);
          add('arm', k, s, d < 4 ? "A gun. Let's see them try something now." : 'There is a gun on the floor over there.');
        } else {
          add('arm', k, s, d < 4 ? 'Brass knuckles, right there. Mine.' : 'Those brass knuckles could come in handy.');
        }
      }
    }

    // crates: have a look, climb about (and anything worse lying about, for the curious)
    for (const [c] of this.things) {
      if (c.kind === 'limb' && !c.removed && !this.inspected.has(c) && T.curiosity > 0.5 && E.fear < 0.45) {
        add('inspect', c, (T.curiosity - 0.3) * 0.3 * (1 - this.horror) * calm / (1 + Math.abs(c.pos.x - me.pos.x) / 6), `Is that... ${c.of}'s?`);
        continue;
      }
      if (c.kind !== 'crate' || c.removed || c.carriedBy) continue;
      const d = Math.abs(c.pos.x - me.pos.x);
      if (!this.inspected.has(c)) add('inspect', c, (0.08 + T.curiosity * 0.3) * (1 - E.fear) * calm / (1 + d / 8), 'A crate. What is that doing here?');
      else if (E.joy > 0.4 && E.fear < 0.3 && me.health.mobility > 0.8) {
        add('play', c, T.curiosity * E.joy * 0.32 * (0.5 + this.boredom) * calm / (1 + d / 5), 'I bet I can climb that crate.');
      }
      // somewhere to sit, for the ones who would rather not wander
      if (this.inspected.has(c) && E.fear < 0.3 && E.anger < 0.4 && me.health.mobility > 0.7 && d < 6 && B.seatSide(this.sb, me, c)) {
        const rested = clamp01((now - this.restedT) / 40);
        add('rest', c, (0.08 + this.boredom * 0.14 + (1 - T.curiosity) * 0.06) * rested * calm / (1 + d / 6), 'I could sit on that crate for a bit.');
      }
    }

    // on their own
    add('idle', null, (0.14 + E.sadness * 0.12 + (1 - me.health.mobility) * 0.1) * calm, null);
    add('wander', null, (0.06 + T.curiosity * 0.08 + this.boredom * 0.12) * calm, "Bored. I'll have a look around.");
    if (me.health.pain < 20 && me.health.mobility > 0.85 && E.fear < 0.3 && E.sadness < 0.4) {
      const fresh = clamp01((now - (this.exercisedT ?? -99)) / 60);
      add('exercise', null, (0.03 + this.boredom * 0.1 + E.joy * 0.05) * (0.5 + T.toughness * 0.6 + T.aggression * 0.3) * fresh * calm, 'I should keep in shape.');
    }
    if (me.health.pain > 30 && E.fear < 0.5) add('rest', null, (me.health.pain / 100) * 0.7 * (1 - E.fear) * calm, 'I need to sit down for a bit.');
    if (this.victory > 0.2) add('celebrate', null, this.victory * (0.35 + T.aggression * 0.4), 'Ha! I won!');
    if (E.fear > 0.8 && E.surprise > 0.35 && T.bravery < 0.4 && !threat) add('panic', null, 0.55, "I don't know what's happening!");
    // (only from someone actually coming for them: someone they are just scared of gets kept at a distance)
    if (threat && E.fear > 0.6 && (health < 0.35 || this.cornered(threat)) && this.isHostile(threat)) {
      add('cower', threat, E.fear * (1.1 - T.bravery) * 0.9, "Please don't hurt me...", null, true);
    }
    if (this.heard && now - this.heard.t < 6 && E.fear < 0.45) {
      add('investigate', null, T.curiosity * 0.35 * (1 - E.fear) * calm, 'What was that noise?', { x: this.heard.x });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  /** Squaring up to me, swinging at me, pointing a gun at me, or just hit me. */
  isHostile(o) {
    if (!o || o.removed || o.dead || !o.conscious) return false;
    if (o.brain && o.brain.fightTarget === this.man) return true;
    if (o.aimTarget === this.man && o.aiming) return true;
    const r = this.rels.get(o);
    if (r && this.sb.time - r.hurtT < 6) return true;
    const a = o.attacking;
    return !!(a && a.target === this.man);
  }

  power(p) {
    const skill = p.traits ? p.traits.skill : 0.5;
    const w = p.armedWith;
    const armed = w === 'glock' ? (p.gunReady && p.weapon.ammo > 0 ? 3 : 1.2) : w === 'machete' ? 2 : w === 'knife' ? 1.8 : w ? 1.45 : 1;
    return p.health.overall * armed * p.strength * (0.7 + skill * 0.5) * (p.carrying ? 0.7 : 1) + 0.02;
  }

  /** How it would go, as they see it: 0 hopeless, 0.5 even, 1 easy. */
  confidence(o) {
    const me = this.man;
    let mine = this.power(me), theirs = this.power(o);
    for (const f of this.visible) {
      if (f === o || f.dead || !standing(f) || Math.abs(f.pos.x - me.pos.x) > 5) continue;
      const r = this.rels.get(f);
      if (r && r.like > 0.4) mine += 0.3 * this.power(f);
      if (f.brain && f.brain.rels.get(o) && f.brain.rels.get(o).like > 0.4) theirs += 0.2 * this.power(f);
    }
    return mine / (mine + theirs);
  }

  maxAnger() {
    let m = 0;
    for (const [o, r] of this.rels) if (!o.removed && o.alive && r.anger > m) m = r.anger;
    return m;
  }

  cornered(threat) {
    const me = this.man, sb = this.sb;
    const away = sign(me.pos.x - threat.pos.x) || 1;
    return (away > 0 ? sb.right - me.pos.x : me.pos.x - sb.left) < 1.6;
  }

  nearestVisible(filter, maxD = Infinity) {
    let best = null, bd = maxD;
    for (const o of this.visible) {
      const d = Math.abs(o.pos.x - this.man.pos.x);
      if (d < bd && filter(o)) { bd = d; best = o; }
    }
    return best;
  }

  mostDangerousNear(r) {
    let best = null, bs = 0;
    for (const o of this.visible) {
      if (!o.alive || !o.conscious || o.lying) continue;
      if (Math.abs(o.pos.x - this.man.pos.x) > r) continue;
      const rel = this.rels.get(o);
      const s = (this.isHostile(o) ? 1 : 0) + (rel ? rel.fear + rel.violent * 0.2 : 0);
      if (s > bs && s > 0.4) { bs = s; best = o; }
    }
    return best;
  }

  /** Somewhere interesting to wander toward. */
  somethingToSee() {
    const list = [];
    for (const [t] of this.things) if (!t.removed) list.push(t.pos);
    for (const o of this.visible) if (o.alive) list.push(o.pos);
    return list.length ? pick(list) : null;
  }

  /** A crate between them and the threat, or just ahead of them, to hide behind. */
  coverFrom(o) {
    const me = this.man;
    const away = sign(me.pos.x - o.pos.x) || 1;
    let best = null, bd = 5;
    for (const c of this.sb.crates) {
      if (c.removed || c.carriedBy) continue;
      const ahead = (c.pos.x - me.pos.x) * away;
      if (ahead < -0.3 || ahead > bd) continue;
      if (c.pos.y > 1) continue;
      bd = ahead;
      best = c;
    }
    return best;
  }

  /** A crate nearby that can be lifted: on the floor, nothing on top of it. */
  crateToThrow(o) {
    const me = this.man;
    let best = null, bd = 4;
    for (const c of this.sb.crates) {
      if (c.removed || c.carriedBy || c.pos.y > 0.6 || Math.abs(c.body.rot % (Math.PI / 2)) > 0.2) continue;
      const d = Math.abs(c.pos.x - me.pos.x);
      if (d > bd || this.sb.crateOnTop(c)) continue;
      // it has to be on my side of them, more or less
      if (Math.abs(c.pos.x - o.pos.x) < 1.5) continue;
      bd = d;
      best = c;
    }
    return best;
  }

  /* -------------------------------------------------------------------------- */
  /*                                   react                                    */
  /* -------------------------------------------------------------------------- */

  /** Ducks or jumps out of the way of things flying at them. */
  reflexes() {
    const me = this.man;
    if (me.state !== 'stand' || !me.onGround || me.acting || !me.conscious) return;
    const now = this.sb.time, T = this.traits;
    const check = (thing, b) => {
      const vx = b.vel.x, vy = b.vel.y, v2 = vx * vx + vy * vy;
      if (v2 < 36 || now - (this.dodged.get(thing) || -99) < 1.2) return;
      const cx = me.pos.x, cy = me.pos.y + 1.05 * me.scale;
      const rx = b.pos.x - cx, ry = b.pos.y - cy;
      const t = -(rx * vx + ry * vy) / v2;
      if (t < 0.02 || t > 0.5) return;
      const px = rx + vx * t, py = ry + vy * t - 0.5 * G * t * t;
      if (Math.hypot(px, py) > 0.8) return;
      this.dodged.set(thing, now);
      const aware = sign(rx) === me.facing || v2 > 100;
      const p = (0.2 + T.skill * 0.45 + T.bravery * 0.1) * (aware ? 1 : 0.35) *
        (1 - Math.min(0.6, me.health.pain / 150)) * (me.health.dizzy > 0.5 ? 0.5 : 1);
      this.emo.bump('surprise', 0.35);
      if (!chance(p)) return;
      if (py > -0.35) me.perform('duck', { fadeIn: 0.03, fadeOut: 0.15 });
      else me.jump(0, 6.4);
      this.speak('dodge', {}, 0.7, null, true);
      this.emo.bump('fear', 0.12);
      this.note('Something came flying at me. I got out of the way.');
    };
    for (const c of this.sb.crates) if (!c.carriedBy && !c.removed) check(c, c.body);
    for (const k of this.sb.loose()) check(k, k.body);
  }

  /** A knife they just pulled out of themselves: keep hold of it, or drop it? */
  wantsToKeep(knife) {
    const T = this.traits;
    if (this.man.weapon || !this.man.health.canUse('armA')) return false;
    const angry = this.maxAnger();
    return (T.aggression > 0.5 && angry > 0.35) || (T.bravery > 0.7 && !!this.mostDangerousNear(5)) || T.aggression > 0.8;
  }

  /** On the floor, crawling, or held up: no behaviour, but still a mind. */
  whileDown(dt) {
    const me = this.man, E = this.emo, T = this.traits, now = this.sb.time;
    if (this.behaviour) this.clearBehaviour();
    this.downTalk -= dt;
    if (me.state === 'held') {
      if (this.downTalk <= 0) {
        this.downTalk = rand(2.5, 4.5);
        this.speak(chance(0.5) ? 'grabbed' : 'fear', {}, 0.7, null, true);
      }
      return;
    }
    const threat = this.mostDangerousNear(3);
    const scared = !!threat && E.fear > 0.45 && T.bravery < 0.65;
    // playing dead only while they are still coming for them; left alone long enough, they chance it
    const tr = threat && this.rels.get(threat);
    this.stayDown = scared && me.state === 'down' && (this.isHostile(threat) || (tr && now - tr.hurtT < 12));
    this.begging = scared;
    if (this.downTalk <= 0) {
      this.downTalk = rand(2.5, 4.5);
      const pinned = me.pinnedBy && now - me.pinT < 0.5;
      if (pinned) { this.speak('pinned', {}, 0.9, null, true); this.calledHelp = now; }
      else if (me.health.paralysed === 'all') { this.speak('paralysed', {}, 0.8, null, true); this.calledHelp = now; }
      else if (scared) { this.speak('beg', { other: threat.name }, 0.8, threat, true); this.downTalk += this.stayDown ? 0 : 2; }
      else if (me.state === 'crawl') { this.speak('crawl', {}, 0.7); this.calledHelp = now; }
      else if (me.health.pain > 60) this.speak('hurtSmall', {}, 0.4);
    }
    if (me.state === 'crawl') {
      const friend = this.nearestVisible((o) => o.alive && o.conscious && this.rel(o).like > 0.35, 12);
      if (threat) me.goTo(me.pos.x + sign(me.pos.x - threat.pos.x) * 3, 'walk');
      else if (friend) me.goTo(friend.pos.x, 'walk');
      else me.stop();
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                                  remember                                  */
  /* -------------------------------------------------------------------------- */

  /**
   * Keeps something that happened, weighted by how much it matters. The same
   * thing again soon after adds to the memory rather than making another;
   * something they were only told (`from`) counts for half, less if they do
   * not trust whoever told them.
   */
  remember(kind, who, about = null, what = null, from = null) {
    const def = MEMORY[kind];
    if (!def || !who || (who === this.man && kind !== 'lostFriend')) return null;
    const now = this.sb.time;
    let w = def[0];
    if (from) w *= 0.5 * clamp(0.6 + this.rel(from).like, 0.2, 1.4);
    const same = this.memories.find((m) => m.kind === kind && m.who === who && m.about === about && now - m.t < 30);
    if (same) {
      same.w = Math.min(1, Math.max(same.w, w) + 0.06);
      same.t = now;
      return same;
    }
    const m = { kind, who, about, what, t: now, w, w0: w, v: def[1], from, told: new Set() };
    this.memories.push(m);
    if (this.memories.length > 40) {
      this.memories.sort((a, b) => b.w - a.w);
      this.memories.length = 36;
    }
    return m;
  }

  /** A memory in their own words, for the inspector. */
  memoryText(m) {
    if (m.from) {
      // second hand: what they were told, as they were told it
      const ph = this.memoryPhrase(m.about === m.from ? { ...m, about: { name: 'them' } } : m);
      if (ph) return `${m.from.name} told me ${m.who.name} ${ph}`;
    }
    const t = MEMORY[m.kind][2](m);
    return m.from ? `${m.from.name} told me: ${t.charAt(0).toLowerCase() + t.slice(1)}` : t;
  }

  /** The strongest memory of someone, good or bad. */
  strongestAbout(o) {
    let best = null, bs = 0;
    for (const m of this.memories) {
      if (m.who !== o || m.kind === 'lostFriend') continue;
      const s = m.w * Math.abs(m.v);
      if (s > bs) { bs = s; best = m; }
    }
    return best;
  }

  /** The worst thing they remember of someone. */
  worstAbout(o) {
    let best = null, bs = 0;
    for (const m of this.memories) {
      if (m.who !== o || m.v >= 0 || m.kind === 'lostFriend') continue;
      const s = m.w * -m.v;
      if (s > bs) { bs = s; best = m; }
    }
    return best;
  }

  /**
   * Seeing someone again after a while. What they remember of them comes
   * back, and with it the feelings: anger and fear for what they did, warmth
   * for the good turns - and for an enemy, a cold look.
   */
  recall(o, r) {
    if (o.dead) return;
    const E = this.emo, T = this.traits;
    const m = this.strongestAbout(o);
    if (r.enemy && (!m || m.v > -0.4)) {
      this.speak('enemySee', { other: o.name }, 0.8, o);
      this.note(`${o.name}. My enemy.`);
      E.bump('anger', 0.12 * (0.4 + T.temper));
      return;
    }
    if (!m || m.w < 0.25) return;
    r.recalled = this.sb.time;
    if (m.v < 0) {
      const violent = VIOLENT.has(m.kind);
      E.bump('anger', m.w * 0.3 * (0.4 + T.temper));
      if (violent) {
        E.bump('fear', m.w * 0.3 * (1.2 - T.bravery));
        r.fear = clamp01(Math.max(r.fear, m.w * 0.45 * (1.1 - T.bravery)));
      }
      r.anger = clamp01(Math.max(r.anger, m.w * 0.55 * (0.3 + T.temper) * (1 - T.empathy * 0.4)));
      const kind = m.kind === 'sawKill' ? 'recallKill' : m.kind === 'shotMe' || m.kind === 'shotAtMe' ? 'recallShot' : 'recallHurt';
      this.speak(kind, { other: o.name, victim: m.about ? m.about.name : 'them' }, 0.85, o, violent);
    } else {
      E.bump('joy', m.w * 0.15);
      r.like = clamp(r.like + 0.04, -1, 1);
      this.speak(m.kind === 'helpedMe' || m.kind === 'savedMe' ? 'recallHelp' : 'recallFriend', { other: o.name }, 0.6, o);
    }
    this.note(`I remember ${o.name}. ${this.memoryText(m)}.`);
  }

  /** Something worth passing on to `o`: about someone else, not already told them. */
  gossipFor(o) {
    let best = null, bs = 0.28;
    for (const m of this.memories) {
      if (m.w < 0.3 || m.told.has(o) || m.who === o || m.about === o || m.who === this.man || !MEMORY[m.kind][3]) continue;
      if (m.who.removed) continue;
      const s = m.w * Math.abs(m.v);
      if (s > bs) { bs = s; best = m; }
    }
    return best;
  }

  /** How they put a memory to someone else: "shot Bea", "helped me when I was hurt". */
  memoryPhrase(m) { const f = MEMORY[m.kind][3]; return f ? f(m) : null; }

  /**
   * Told something about somebody. It changes what they think of them - by
   * how much depends on how much they trust whoever told them - and they
   * remember it, second hand.
   */
  heardGossip(from, m) {
    const who = m.who;
    if (!who || who === this.man || who.removed) return;
    const trust = clamp(0.5 + this.rel(from).like, 0.1, 1.3);
    const r = this.rel(who);
    if (m.v < 0) {
      r.like = clamp(r.like - 0.18 * -m.v * trust, -1, 1);
      if (VIOLENT.has(m.kind) || VIOLENT.has(TOLD_AS[m.kind])) r.fear = clamp01(r.fear + 0.12 * trust * (1.1 - this.traits.bravery));
      // done to someone they care about, it is personal
      const victim = m.kind in TOLD_AS ? from : m.about;
      if (victim && victim !== this.man && this.rel(victim).like > 0.35) r.anger = clamp01(r.anger + 0.2 * trust * (0.3 + this.traits.temper));
    } else {
      r.like = clamp(r.like + 0.12 * m.v * trust, -1, 1);
    }
    // "X shot me", told by Y, is remembered as "X shot Y"
    if (TOLD_AS[m.kind]) this.remember(TOLD_AS[m.kind], who, from, m.what, from);
    else this.remember(m.kind, who, m.about, m.what, from);
    this.note(`${from.name} says ${who.name} ${this.memoryPhrase(m).replace(/\bme\b/g, 'them').replace(/\bmy\b/g, 'their')}.`);
  }

  /* -------------------------------------------------------------------------- */
  /*                         told, from the inspector                           */
  /* -------------------------------------------------------------------------- */

  /** Sent to fight someone. They go, and keep at it until that person is down. */
  order(kind, o) {
    if (kind !== 'fight' || !o || o === this.man || o.removed || o.dead) return false;
    const r = this.rel(o), now = this.sb.time;
    r.met = true;
    r.anger = Math.max(r.anger, 0.85);
    this.ordered = { kind, target: o, t: now };
    const friend = r.like > 0.4;
    this.speak(friend ? 'orderedFightFriend' : 'orderedFight', { other: o.name }, 1, o, true);
    this.note(friend ? `I have to fight ${o.name}. I don't want to.` : `I'm going after ${o.name}.`);
    if (this.man.conscious && this.man.state === 'stand') this.setBehaviour(new B.Fight(this, o, {}), null);
    this.thinkT = 0.2;
    return true;
  }

  /** Called off. */
  standDown() {
    if (this.ordered) this.rel(this.ordered.target).anger *= 0.3;
    this.ordered = null;
    if (this.fighting) this.clearBehaviour();
  }

  /** What they think of someone, set from the inspector. */
  setRelation(o, cat) {
    if (!o || o === this.man) return;
    const r = this.rel(o);
    r.met = true;
    r.greeted = true;
    r.enemy = cat === 'enemy';
    switch (cat) {
      case 'friend':
        r.like = Math.max(r.like, 0.7); r.anger = 0; r.fear = Math.min(r.fear, 0.1); r.fam = Math.max(r.fam, 0.5);
        this.note(`${o.name} is a friend.`);
        break;
      case 'knows':
        r.like = 0.15; r.anger = Math.min(r.anger, 0.1); r.fam = Math.max(r.fam, 0.3);
        this.note(`I know ${o.name}.`);
        break;
      case 'dislikes':
        r.like = -0.45; r.anger = Math.max(r.anger, 0.2); r.fam = Math.max(r.fam, 0.2);
        this.note(`I don't like ${o.name}.`);
        break;
      case 'enemy':
        r.like = -0.85; r.anger = Math.max(r.anger, 0.6); r.fam = Math.max(r.fam, 0.3);
        this.note(`${o.name} is my enemy.`);
        break;
      default:
        return;
    }
    // forgiven, the old grudges go too; made an enemy, there is no need for one
    if (cat === 'friend' || cat === 'knows') {
      for (const m of this.memories) if (m.who === o && m.v < 0) m.w *= 0.3;
    }
    this.thinkT = 0;
  }

  setEmotion(k, v) { if (k in this.emo.base) this.emo[k] = clamp01(v); }

  /** A trait set from the inspector: everything that grows from it follows. */
  setTrait(k, v) {
    if (!(k in this.traits)) return;
    const was = this.traits[k];
    this.traits[k] = clamp01(v);
    this.emo.retune(this.traits);
    if (k === 'toughness') {
      this.man.health.toughness = this.traits[k];
      this.man.strength += (this.traits[k] - was) * 0.15;
    }
  }

  /** A symbol over the head now and then, for whatever they feel most. */
  express(dt) {
    const me = this.man, E = this.emo;
    if ((this.expressT -= dt) > 0 || me.emote) return;
    this.expressT = rand(2, 4);
    if (E.anger > 0.65) me.setEmote('anger', 1.6);
    else if (E.fear > 0.6) me.setEmote('sweat', 1.6);
    else if (E.sadness > 0.65) me.setEmote('tear', 1.8);
    else if (E.surprise > 0.6) me.setEmote('exclaim', 1);
    else if (E.joy > 0.78 && chance(0.4)) me.setEmote(chance(0.5) ? 'music' : 'heart', 1.6);
  }
}
