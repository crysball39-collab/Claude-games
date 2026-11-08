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

   And the body has its say. On fire, they panic and run - until they
   remember (or somebody shouts at them) to stop, drop and roll - and the
   people around them either run in to beat the flames out or keep well
   clear. They say when they are too hot or too cold, gasp after a grip on
   the throat, and stare at somebody frozen solid.
   ========================================================================== */
import { Emotions } from './emotions.js';
import { line } from './lines.js';
import { BONE_SAID } from './health.js';
import { G } from './stickman.js';
import { isGun, isFirearm, isLongGun, armOf } from './props.js';
import * as B from './behaviours.js';
import { learn as copLearn, considerOfficer, considerSuspect, considerWitness, metOfficer, maybeReport, lethal } from './police.js';
import { clamp, clamp01, rand, chance, pick, sign } from '../core/util.js';
import { IGNITE_AT, sicken } from './vitals.js';
import { powerReflexes, powerThreat, powerCourage } from './powers/index.js';

const SIGHT = 14;
const BEHIND = 2.2;
/**
 * What a mod adds to what everybody considers (alongside their own species'
 * consider): fn(brain, add, { threat, threatScore, calm, canFight, fit }),
 * calling add(kind, target, score, why, extra, urgent) for a behaviour the mod
 * has added with behaviours.js addBehaviour.
 */
const CONSIDER_HOOKS = [];
export function addConsider(fn) { if (!CONSIDER_HOOKS.includes(fn)) CONSIDER_HOOKS.push(fn); }

// how far away each kind of event can be heard, in metres
const HEAR = {
  hit: 9, death: 12, speech: 9, thud: 8, clatter: 7, knock: 5, swing: 3, knockdown: 10, ko: 10, break: 9,
  spawn: 12, vanish: 12, grabbed: 14, thrown: 14, pickup: 6, throw: 8, land: 4, jump: 3, getup: 6, wake: 6,
  stuck: 7, pullout: 6, clap: 7, collide: 8,
  // a gunshot carries the whole width of the world
  shot: 60, ricochet: 14, dryFire: 4, helmetStop: 9, helmetOn: 4, headBurst: 14, reload: 5, magOut: 3, magIn: 3, rack: 5, sever: 12, dislocate: 7, relocate: 7, faint: 8,
  pinPulled: 6, fuseLit: 8, c4Beep: 8, missileLaunch: 30, gasBurst: 12, electrocute: 10, vomit: 8, retch: 5,
  tased: 10, taserFire: 8, cuffed: 8, command: 16, vestStop: 9, stumble: 6, stumbleFall: 8, stumbleCaught: 5, driveStun: 6,
  // fire and ice
  ignite: 12, extinguish: 6, freeze: 7, thaw: 5, iceSnap: 9, shatter: 16, gasp: 6, dropRoll: 6,
  glassShatter: 14, slabFree: 12, slabBreak: 7, noosed: 9, trapdoor: 12, limbFall: 14, snapBough: 7, wireSnap: 8, freezeInPlace: 8, unfreeze: 6, wire: 6,
  // and something blowing up, further still
  explode: 60,
  // superpowers: somebody taking off, a move, a shockwave, a round stopped dead in the air
  powerGiven: 8, powerMove: 11, pwTakeoff: 9, pwLand: 5, shockwave: 16, skyToss: 14, skyDrop: 14, slamDown: 11, wallPin: 10,
  wallSmash: 14, bulletStopped: 10, diveImpact: 16, megaPunch: 11, thunderClap: 20, groundPound: 16, quakeStomp: 16, blitz: 9,
  blink: 9, lightningLine: 11, whirlwind: 11, speedDodge: 7, tkThrow: 10, tkSlam: 11, tkPush: 10, heave: 10, launched: 10,
  // super durability: rounds ringing off somebody, a body slam, a grenade smothered; laser vision: a beam, a gun melting
  bulletBounce: 14, headbutt: 9, bodySlam: 12, humanShield: 12, smother: 12, smotherBlast: 60, unstoppable: 12, ram: 10,
  bladeCatch: 8, bladeSnap: 9, hitMe: 14, shrugOff: 9, hardSkin: 7, bladeBounce: 7, gunTaken: 9, brace: 6,
  laserFire: 16, laserBolt: 14, laserCharge: 12, overcharge: 22, gunMelted: 12, laserCut: 14, laserSever: 12, laserDetonate: 14,
  eyeFlash: 14, laserZap: 10, laserThaw: 8,
};
// what counts as violence done to them, for fear and grudges
const VIOLENT = new Set(['koMe', 'cutMe', 'stabbedMe', 'choppedMe', 'severedMe', 'shotMe', 'shotAtMe', 'aimedAtMe', 'sawStab', 'sawShoot', 'sawSever', 'sawKill', 'sawThreat', 'tasedMe', 'burnedMe', 'sawBurn']);

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
  tasedMe: [0.6, -0.65, (m) => `${m.who.name} tased me`, () => 'tased me'],
  arrestedMe: [0.7, -0.45, (m) => `${m.who.name} arrested me`, () => 'arrested me'],
  sawArrest: [0.3, 0.15, (m) => `Saw ${m.who.name} arrest ${m.about.name}`, (m) => `arrested ${m.about.name}`],
  burnedMe: [0.95, -1, (m) => `${m.who.name} set me on fire`, () => 'set me on fire'],
  sawBurn: [0.85, -0.95, (m) => `Saw ${m.who.name} set ${m.about.name} on fire`, (m) => `set ${m.about.name} on fire`],
};
// told "X shot me" by Y, what the listener remembers is "X shot Y"
const TOLD_AS = {
  hurtMe: 'sawAttack', koMe: 'sawAttack', cutMe: 'sawAttack', choppedMe: 'sawAttack', beatMe: 'sawAttack', threwAtMe: 'sawAttack',
  stabbedMe: 'sawStab', severedMe: 'sawSever', shotMe: 'sawShoot', shotAtMe: 'sawThreat', aimedAtMe: 'sawThreat',
  helpedMe: 'sawHelp', savedMe: 'sawHelp', tasedMe: 'sawAttack', burnedMe: 'sawBurn',
};

/**
 * Something a mod adds for people to remember: [weight, how good or bad,
 * how they think of it, how they tell it] - and, told it by somebody else,
 * what the listener keeps (itself, by default).
 */
export function addMemoryKind(kind, def, toldAs = kind) {
  MEMORY[kind] = def;
  if (toldAs) TOLD_AS[kind] = toldAs;
}

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
  heardBlast: 3, sawBlast: 3, blastHurt: 1.5, shrapnelHit: 1.5, inGas: 2.5, bombRun: 2.5, sawLiveGrenade: 2, sawFuse: 2, sawC4: 3,
  // (seeing the impossible: said once, not every time it happens again)
  sawFlying: 25, sawSpeedster: 16, sawTelekinesis: 12, sawShockwave: 9, sawBulletStop: 14, sawWallSmash: 14, sawGotPower: 20, sawSkyToss: 9,
  sawSuperBlow: 7, sawSlam: 7, sawSpeedBlow: 8, sawCrush: 10, pwCarriedUp: 3, pwLifted: 3, pwDodged: 6, flyJoy: 30,
  sawBulletsBounce: 10, sawHeadbutt: 8, sawShield: 12, sawSmother: 10, sawSmotherBlast: 12, sawUnstoppable: 10, sawLaser: 10,
  sawGunMelt: 12, sawLaserCut: 12, sawOvercharge: 10, pwHandHurt: 3, pwBulletBounce: 6, pwDazzled: 3,
  // curled up, cowering, down flat: said as it happens, not every second of it
  ballUp: 2.5, hitDeck: 4, curlCold: 8, curlShock: 8, cowerShots: 4, cowerBlast: 6, coverUp: 3, sawBeatDown: 6,
  // (not scared, with a superpower: said now and then, not every time)
  pwUnafraidGun: 8, pwUnafraidArmed: 8, pwUnafraidAimed: 6, pwUnafraidShot: 5, pwUnafraidHeld: 4,
};
// ...and the ones that are really the same plea
const SAID_AS = { surrender: 'beg', surrenderGun: 'beg' };
const HELP_CALLS = new Set(['fear', 'flee', 'beg', 'pinned', 'crawl', 'panic', 'hurtBig', 'broken', 'onFire', 'choking', 'inGas']);
// doing nothing much: free to turn round at a noise (the rest point themselves where they need to)
const GLANCE_FREE = new Set(['idle', 'rest', 'inspect']);

const standing = (o) => o && !o.removed && o.alive && o.conscious && (o.state === 'stand' || o.state === 'air');
const WEAPON_KINDS = new Set(['knuckles', 'knife', 'machete', 'crowbar', 'glock', 'm1911', 'taser', 'ak47', 'mossberg', 'gasRifle', 'm4a1', 'ar15']);
// what they call something they are carrying
const ITEM_SAID = { knuckles: 'brass knuckles', knife: 'knife', machete: 'machete', crowbar: 'crowbar', glock: 'gun', m1911: 'gun', taser: 'taser', ak47: 'rifle', mossberg: 'shotgun', gasRifle: 'gas rifle', m4a1: 'rifle', ar15: 'rifle' };
const capital = (t) => t.charAt(0).toUpperCase() + t.slice(1);
// what a witness says about the way somebody died, when it was not just a death
const DEATH_SAID = { burns: 'sawBurnDeath', 'smoke inhalation': 'sawBurnDeath', 'frozen solid': 'sawFreezeDeath', hypothermia: 'sawFreezeDeath', suffocation: 'sawChokeDeath', heatstroke: 'sawHeatDeath', 'poison gas': 'sawGasDeath', electrocution: 'sawShockDeath' };
// busy with something that wants the hands as they are
const KIT_BUSY = new Set(['respond', 'comply', 'surrender', 'cower', 'arm', 'vest', 'ammo', 'help', 'pullout', 'detained', 'catchBreath', 'burning', 'douse']);

/** How one person feels about another. */
class Rel {
  constructor(o, owner = null) {
    this.other = o;
    this.owner = owner;     // whose feeling it is (their courage takes the edge off any new fear)
    this.like = rand(-0.06, 0.14);
    this._fear = 0;
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

  // fear of them: whatever adds to it (a gun, a monster, a memory) adds that
  // much less to somebody with a superpower - their courage comes off it
  get fear() { return this._fear; }
  set fear(v) {
    const c = this.owner ? this.owner.courage : 0;
    this._fear = c && v > this._fear ? this._fear + (v - this._fear) * (1 - c) : v;
  }
}

export class Brain {
  constructor(man, traits) {
    this.man = man;
    this.sb = man.sandbox;
    this.traits = traits;
    this.emo = new Emotions(traits);
    this.courage = 0;         // from their superpowers (powerCourage): how much less frightens them
    this.aware = 1;           // 0..1: how much of what is going on round them they take in (updateAwareness)
    this.beatenT = -99;       // when they were last hit, lying on the floor
    this.hitT = -99;          // when they were last hit at all, by somebody
    this.underFireT = -99;    // when they were last shot at (a round at them, or one going past)
    this.blastT = -99;        // when something last blew up near them, and how near (0..1)
    this.blastNear = 0;
    this.curlWhy = null;      // why they curled up on the floor: 'fire', 'blast', 'cold', 'shock' (or being beaten)
    this.curlT = -99;
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
    // an officer's open cases: suspect -> { sev, kinds, t, x, seen, victims } (police.js)
    this.cop = man.officer ? { cases: new Map() } : null;
    this.crimesSeen = [];     // crimes they saw, to tell an officer about: { c, t, told }
    this.police = null;       // an officer telling them to stop: { by, t, kind, count, mood }
    this.kitT = 0;            // when they may next put something away or get it out
    this.calmT = 0;           // when there was last anything to be armed for
    this.tiredT = -99;
    this.note(man.officer ? 'On duty. Keep the peace.' : 'Where am I? How did I get here?');
  }

  rel(o) {
    let r = this.rels.get(o);
    if (!r) { r = new Rel(o, this); this.rels.set(o, r); }
    return r;
  }

  /** How brave they act: their bravery, and a superpower's courage on top of it. */
  get brave() {
    const b = this.traits.bravery;
    return b + (1 - b) * this.courage;
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
    if (me.health.frozen) return 'Frozen solid';
    if (!me.conscious) return 'Out cold';
    if (me.tased) return 'Being tased';
    if (me.flames) return me.rolling > 0 ? 'Rolling on the floor to put the fire out' : 'On fire!';
    if (me.state === 'held' && me.vit && me.vit.air === 'choke') return 'Held up by the head, choking';
    if (me.vit && me.vit.air === 'choke' && (me.tied || me.noosed)) return 'Hanging by the neck, choking';
    if (me.frozenInPlace) return 'Frozen in place: cannot move';
    if (me.tied) return 'Tied up';
    if (me.noosed) return me.rag ? 'Hanging in a noose' : 'Standing with a noose round the neck';
    // (what a mod's is up to, in its own words)
    const own = me.species && me.species.doing ? me.species.doing(me) : null;
    if (own) return own;
    switch (me.state) {
      case 'held': return 'Being held up in the air';
      case 'stumble': return 'Stumbling';
      case 'thrown': return me.onGround ? 'Falling over' : 'Flying through the air';
      case 'crawl': return me.health.paralysed === 'legs' ? 'Dragging themselves along' : 'Crawling';
      case 'down': return me.health.paralysed === 'all' ? 'Lying paralysed' : me.cuffed ? 'Lying in handcuffs' : me.balled ? 'Curled up in a ball on the floor' : this.stayDown ? 'Staying down' : me.pinnedBy ? 'Pinned under a crate' : 'On the floor';
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
    // (some of what a mod adds does not talk at all)
    if (me.species && me.species.mute) return false;
    const now = this.sb.time;
    if (now - this.spokeT < (loud ? 0.8 : 1.8)) return false;
    const said = SAID_AS[kind] || kind;
    if (REPEAT[said] && now - (this.saidT[said] ?? -99) < REPEAT[said]) return false;
    vars.me = me.name;
    // keeping quiet (something close by hunting by ear, or hiding from something): it comes out as a whisper -
    // and with it right beside them, not even that (unless it is already coming for them)
    const hush = this.hushed;
    if (hush) loud = false;
    // (seen, or known to be about: they have only just turned their back on it)
    const bl = this.blindOne || (this.lastBlind && now - this.lastBlindT < 12 ? this.lastBlind : null);
    if (bl && !bl.removed && !bl.dead && Math.abs(bl.pos.x - me.pos.x) < 3.2 && !B.huntedBy(bl, me)) return false;
    // somebody a mod made may have their own way of saying it - and lines kept
    // for one person in particular, as kind@who (who: the key of that one's look)
    const aimed = to && to.look && to.look.key && me.lines ? kind + '@' + to.look.key : null;
    const which = () => (aimed && me.lines[aimed] && chance(0.6) ? aimed : kind);
    let text = line(which(), vars, me.lines);
    if (text === this.lastLine) text = line(which(), vars, me.lines);
    if (!text) return false;
    this.spokeT = now;
    this.saidT[said] = now;
    this.lastLine = text;
    me.say(text, { loud, to, kind, whisper: hush });
    return true;
  }

  /**
   * Keeping their voice down: something that hunts by ear is near (or was, a
   * moment ago, and has not gone far - they know it is about, even with their
   * back to it), or they are hiding inside something.
   */
  get hushed() {
    const now = this.sb.time, b = this.lastBlind;
    if (now < (this.hushT ?? -99) || this.man.hiddenIn) return true;
    return !!b && !b.removed && !b.dead && now - this.lastBlindT < 12 && Math.abs(b.pos.x - this.man.pos.x) < 16;
  }

  /* -------------------------------------------------------------------------- */
  /*                                    loop                                    */
  /* -------------------------------------------------------------------------- */

  update(dt) {
    const me = this.man;
    if (me.removed || me.dead) return;
    // a superpower takes the edge off fear, of anything
    this.courage = this.emo.courage = me.powers ? powerCourage(me) : 0;
    this.emo.update(dt);
    this.feelings(dt);
    this.updateAwareness(dt);
    if ((this.senseT -= dt) <= 0) {
      this.senseT = 0.18 + rand(0, 0.06);
      this.sense();
    }
    if (!me.conscious) {
      if (this.behaviour) this.clearBehaviour();
      return;
    }
    // something a mod makes may do its own thinking for a while: then that is all there is
    if (me.species && me.species.mind && me.species.mind(this, dt)) {
      if (this.behaviour) this.clearBehaviour();
      return;
    }
    // in the middle of a superpower's move: the move has the body; they still feel, and look
    if (me.pmove) { this.express(dt); return; }
    this.react = Math.max(0, this.react - dt);
    this.reflexes();
    if (me.powers) powerReflexes(this, dt);
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
    // frozen in place, tied up, or with a noose round the neck: nothing to be done but say so
    if (me.frozenInPlace || me.tied || me.noosed) { this.stuckFast(dt); return; }
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
      this.thinkT = (0.35 + rand(0, 0.25)) * (this.aware < 1 ? 1 + (1 - this.aware) * 1.2 : 1);
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
    // (dazzled - a flash out of somebody's eyes: laser vision - nothing, for a few seconds)
    if (this.blindT && this.sb.time < this.blindT) return false;
    const eye = me.wj.head;
    const dx = x - eye.x, d = Math.abs(dx);
    // (dazed, half-awake, in shock: they see less far, and notice less of what is behind them)
    if (d > SIGHT * this.awareK(0.45) || Math.abs(y - eye.y) > 9) return false;
    if (d > BEHIND * this.awareK(0.3) && sign(dx) !== me.facing && !me.lying) return false;
    return this.sb.lineOfSight(eye.x, eye.y, x, y, own);
  }

  sees(o) { return this.visible.includes(o); }

  sense() {
    const me = this.man, sb = this.sb, now = sb.time;
    this.visible.length = 0;
    this.blindOne = null;
    if (!me.conscious) return;
    for (const o of sb.people) {
      // (somebody shut away inside something - a wardrobe, say - is not there to be seen)
      if (o === me || o.removed || o.hiddenIn) continue;
      // (something the size of a building is seen, or felt, from anywhere near it: a mod's)
      const huge = o.species && o.species.unmissable && Math.abs(o.pos.x - me.pos.x) < 30;
      if (!huge && !this.canSee(o.wj.head.x, o.wj.head.y) && !this.canSee(o.wj.hip.x, o.wj.hip.y + 0.15)) continue;
      this.visible.push(o);
      // something blind that hunts by ear (a mod's): the nearest, and their voice kept down while it is about
      if (o.species && o.species.blind && o.alive && !o.dead) {
        const d = Math.abs(o.pos.x - me.pos.x);
        if (d < 14 && (!this.blindOne || d < Math.abs(this.blindOne.pos.x - me.pos.x))) this.blindOne = o;
        if (d < 14) { this.hushT = now + 2.5; this.lastBlind = o; this.lastBlindT = now; }
      }
      const r = this.rel(o);
      const first = !r.met;
      const absent = r.met && now - r.lastSeen > 25;
      r.met = true;
      r.lastSeen = now;
      if (first) this.firstSight(o, r);
      else if (absent) this.recall(o, r);
      if (o.dead && !this.griefs.has(o)) this.foundBody(o, r);
      if ((o.weapon || o.innate) && r.sawArmed !== o.armedWith) {
        r.sawArmed = o.armedWith;
        const k = o.armedWith, spec = armOf(k);
        // a blade or a gun frightens people even from someone who has not used it yet
        // (an officer's, a good deal less: they are meant to have one)
        const scary = (k === 'taser' ? 0.3 : isGun(k) ? 0.5 : k === 'machete' ? 0.42 : k === 'knife' ? 0.35 : spec ? spec.scary ?? 0.3 : 0) * (o.officer && !this.sb.law.wanted(me) ? 0.25 : 1);
        if (this.isHostile(o) || r.like < -0.2 || r.violent > 0.5 || (scary > 0.2 && r.like < 0.3)) {
          r.fear = clamp01(r.fear + (scary || 0.2) * (1.1 - this.traits.bravery));
          // (somebody with a superpower is more likely to tell them what they think of it)
          const unafraid = this.courage && chance(this.courage);
          const say = unafraid ? (isFirearm(k) ? 'pwUnafraidGun' : 'pwUnafraidArmed') : k === 'taser' ? 'taserFear' : isGun(k) ? 'gunFear' : k === 'machete' ? 'macheteFear' : k === 'knife' ? 'knifeFear' : spec && spec.fear ? spec.fear : 'weaponFear';
          this.speak(say, { other: o.name, what: spec ? spec.noun || (spec.name ? spec.name.toLowerCase() : 'that') : 'that' }, 0.75, o, !!scary);
        }
      } else if (!o.weapon && !o.innate) r.sawArmed = false;
      // a gun pointed this way
      if (o.aimTarget === me && o.aiming) {
        if (now - this.aimedT > 2) {
          this.emo.bump('fear', 0.35 * (1.2 - this.traits.bravery));
          this.emo.bump('surprise', 0.4);
          r.fear = clamp01(r.fear + 0.3 * (1.1 - this.traits.bravery));
          this.remember('aimedAtMe', o);
          this.react = Math.max(this.react, 0.2);
          this.thinkT = 0;
          // a superpower, and a gun is not what it was: they say so, to its face
          if (this.courage && chance(this.courage)) this.speak('pwUnafraidAimed', { other: o.name }, 0.8, o, true);
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
      // somebody on fire, or frozen solid: nobody walks past that
      if (o.flames && !r.sawFire && !me.flames) {
        r.sawFire = true;
        this.emo.bump('surprise', 0.55);
        this.emo.bump('fear', 0.22 * (1.2 - this.traits.bravery));
        this.speak(o.dead ? 'sawBurningBody' : 'sawOnFire', { victim: o.name }, 0.85, null, true);
        this.note(o.dead ? `${o.name}'s body is on fire.` : `${o.name} is on fire!`);
        this.thinkT = Math.min(this.thinkT, 0.1);
      } else if (!o.flames) r.sawFire = false;
      if (o.health.frozen && !r.sawIce) {
        r.sawIce = true;
        this.emo.bump('surprise', 0.6);
        this.emo.bump('fear', 0.1 * (1.2 - this.traits.bravery));
        this.speak('sawFrozen', { victim: o.name }, 0.75, null, true);
        this.note(`${o.name} is frozen solid. Like a statue.`);
      } else if (!o.health.frozen) r.sawIce = false;
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
    // vests and ammo boxes
    for (const g of sb.gear) {
      if (g.wornBy) this.things.delete(g);
      else if (this.canSee(g.pos.x, g.pos.y + 0.1)) this.things.set(g, now);
    }
    // a crime they saw, and an officer to tell
    if (!me.officer && this.crimesSeen.length) maybeReport(this);
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
        const ff = m.w * 0.35 * (1 - T.bravery) * (1 - this.courage);
        if (r.fear < ff) r.fear = ff;
      }
    }
  }

  firstSight(o, r) {
    if (o.dead) return;
    this.emo.bump('surprise', 0.12);
    this.note(`There's someone: ${o.name}.`);
    this.remember('met', o);
    // who they are can matter more than anything they have done yet (a mod's species)
    if (this.man.species && this.man.species.meet) this.man.species.meet(this, o, r);
    if (o.species && o.species.metBy) o.species.metBy(o, this, r);
    if (o.officer) metOfficer(this, o, r);
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
      if ((o.weapon || o.innate) && this.isHostile(o)) E.bump('fear', dt * (o.armedWith === 'knife' || o.innate ? 0.06 : 0.03) * (1 - T.bravery * 0.6));
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
    // (and with a superpower, being afraid of somebody wears off a good deal faster)
    const calmDown = 0.012 * (1 + this.courage * 3);
    for (const r of this.rels.values()) {
      r.anger = Math.max(0, r.anger - dt * cool);
      r.fear = Math.max(0, r.fear - dt * calmDown);
      r.violent = Math.max(0, r.violent - dt * 0.01);
    }
    if (me.state === 'held') {
      E.bump('fear', dt * 0.1 * (1.2 - T.bravery));
      E.bump('surprise', dt * 0.15);
    }
  }

  /**
   * How aware they are of what is going on around them, 0..1: wide awake and
   * taking it all in at 1. Knocked silly, in shock, in a lot of pain, short of
   * air, too hot or too cold, sick, dazzled, panicking or worn out, it
   * narrows: they see and hear less of what is round them, notice it later,
   * react more slowly, dodge less and shoot worse. It drops at once, and
   * comes back slowly. (Somebody fine and calm is at exactly 1: none of it
   * comes into anything.)
   */
  updateAwareness(dt) {
    const me = this.man, h = me.health, E = this.emo, now = this.sb.time;
    let a = me.dead || h.frozen || !me.conscious ? 0 : clamp01((h.conscious - 0.3) / 0.6);
    if (a > 0) {
      a *= 1 - Math.min(0.6, (h.dizzy || 0) * 0.15);
      a *= 1 - Math.max(0, (h.shock || 0) - 0.1) * 0.6;
      a *= 1 - Math.max(0, h.pain - 35) / 65 * 0.35;
      a *= clamp((h.oxygen ?? 1) - 0.5, 0.045, 0.3) / 0.3;
      const t = h.temp ?? 37;
      if (t < 35.5) a *= clamp(1 - (35.5 - t) * 0.15, 0.15, 1);
      else if (t > 39) a *= clamp(1 - (t - 39) * 0.2, 0.15, 1);
      a *= 1 - Math.max(0, (h.nausea || 0) - 0.3) * 0.5;
      if (this.blindT && now < this.blindT) a *= 0.15;
      a *= 1 - Math.max(0, E.fear - 0.75) * 1.4;
      a *= 0.8 + 0.2 * clamp01(me.stamina / 0.25);
      if (me.tased) a *= 0.2;
      // (adrenaline sharpens them up: it cannot undo a knock on the head, but it helps)
      a = clamp01(a + Math.max(0, (h.adrenaline || 0) - 0.2) * 0.25 * a);
    }
    this.aware += (a - this.aware) * (1 - Math.exp(-dt * (a < this.aware ? 6 : 1.2)));
    if (Math.abs(a - this.aware) < 1e-4) this.aware = a;
  }

  /** How much of the usual a sense reaches: all of it wide awake; `floor` of it with nobody home. */
  awareK(floor) { return this.aware < 1 ? floor + (1 - floor) * this.aware : 1; }

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
    const heard = d < (HEAR[ev.type] || 6) * (ev.loud ? 1.7 : ev.whisper ? 0.22 : 1) * this.awareK(0.45);
    if (!seen && !heard) return;
    const E = this.emo, T = this.traits, now = this.sb.time;
    switch (ev.type) {
      case 'hit': this.sawHit(ev, seen, x, y); break;
      case 'death': this.sawDeath(ev, seen, x, y); break;
      case 'speech':
        // "stop, drop and roll!" - and on fire, they remember they should
        if (ev.kind === 'rollAdvice' && me.flames) this.rollKnows = true;
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
        // (whoever did the grabbing knows all about it)
        if (ev.by === me) break;
        if (seen && ev.who && ev.by && !ev.by.removed) {
          // seized by somebody (a mod's thing): that one is the danger
          E.bump('surprise', 0.5);
          E.bump('fear', 0.3 * (1.2 - T.bravery));
          const rb = this.rel(ev.by);
          rb.fear = clamp01(rb.fear + 0.35 * (1.15 - T.bravery));
          rb.violent += 1;
          this.speak('seeSeized', { victim: ev.who.name, other: ev.by.name }, 0.6, null, true);
          this.note(`${ev.by.name} grabbed ${ev.who.name}!`);
          this.react = Math.max(this.react, 0.3);
        } else if (seen && ev.who) {
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
      case 'explode': this.heardBlast(ev, seen, x, y, d); break;
      // something about to go off: a grenade's pin out, a fuse lit, C4 starting to beep, a missile away
      case 'pinPulled':
      case 'fuseLit':
      case 'c4Beep':
      case 'missileLaunch':
        if (ev.type === 'c4Beep' && ev.k > 0) break;
        if (seen && d < 9 && ev.what) {
          E.bump('surprise', 0.5);
          E.bump('fear', (0.25 + (1 - d / 9) * 0.45) * (1.3 - T.bravery));
          if (ev.type !== 'missileLaunch') this.bomb = { what: ev.what, t: now };
          this.speak({ pinPulled: 'sawLiveGrenade', fuseLit: 'sawFuse', c4Beep: 'sawC4', missileLaunch: 'sawMissile' }[ev.type], {}, 0.85, null, true);
          this.thinkT = 0;
        }
        break;
      case 'gasBurst':
        if (seen && d < 12) {
          E.bump('surprise', 0.4);
          E.bump('fear', (0.2 + (1 - d / 12) * 0.4) * (1.25 - T.bravery));
          if (ev.who && ev.who !== me && !ev.who.removed) { const r = this.rel(ev.who); r.violent += 1; r.fear = clamp01(r.fear + 0.2 * (1.1 - T.bravery)); }
          if (now - (this.gasSaidT || -9) > 5) { this.gasSaidT = now; this.speak('sawGas', {}, 0.7, null, true); }
        }
        break;
      case 'vomit':
        // somebody being sick: nobody wants to see it, and seeing it does nothing for their own stomach
        if (seen && ev.who && ev.who !== me && d < 8) {
          E.bump('surprise', 0.25);
          if (now - (this.vomitSaidT || -9) > 6) { this.vomitSaidT = now; this.speak('sawVomit', { victim: ev.who.name }, 0.75, null, true); }
          sicken(me, (0.05 + (1 - T.toughness) * 0.12) * (1 - d / 10));
        }
        break;
      case 'electrocute':
        if (seen && ev.who && ev.who !== me && d < 12) {
          E.bump('surprise', 0.3);
          E.bump('fear', 0.08 * (1.2 - T.bravery));
          if (now - (this.zapSaidT || -9) > 5) { this.zapSaidT = now; this.speak('sawElectrocuted', { victim: ev.who.name }, 0.7, null, true); }
        }
        break;
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
          if (ev.head) this.spokeT = -99;
          this.speak(ev.head ? 'sawBeheaded' : 'sawSevered', { victim: ev.who.name }, 0.85, null, true);
          this.note(`${ev.who.name}'s ${ev.lost} just came off!`);
          this.shaken(ev.head ? 0.95 : 0.7);
          if (ev.head) E.bump('fear', 0.35 * (1.2 - T.bravery));
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
      case 'tased':
        if (seen && ev.who) this.sawTased(ev);
        else { this.heard = { x, y, t: now }; this.hearLoud(x); }
        break;
      case 'taserFire':
      case 'driveStun':
        E.bump('surprise', 0.2);
        if (!seen) { this.heard = { x, y, t: now }; this.hearLoud(x); }
        break;
      case 'cuffed':
        if (seen && ev.who) this.sawArrest(ev);
        break;
      case 'command':
        // "Police!" - everybody looks round, whoever it was meant for
        if (ev.to !== me) {
          E.bump('surprise', 0.2);
          if (!seen) this.hearLoud(x);
        }
        break;
      case 'powerGiven': case 'pwTakeoff': case 'powerMove': case 'shockwave': case 'skyToss': case 'skyDrop': case 'wallSmash':
      case 'bulletStopped': case 'blitz': case 'blink': case 'lightningLine': case 'whirlwind': case 'speedDodge': case 'diveImpact':
      case 'bulletBounce': case 'headbutt': case 'bodySlam': case 'humanShield': case 'smother': case 'smotherBlast': case 'unstoppable':
      case 'laserFire': case 'laserBolt': case 'overcharge': case 'gunMelted': case 'laserCut':
        this.sawPower(ev, seen, x, y, d);
        break;
      case 'vestStop':
        if (seen && ev.who && ev.who.alive) {
          E.bump('surprise', 0.3);
          this.speak('sawVestStop', { victim: ev.who.name }, 0.5, null, true);
        }
        break;
      case 'headBurst':
        // somebody's head opened by a rifle round, in front of them
        if (seen && ev.who && ev.who !== me && d < 14) {
          // (whatever they were in the middle of saying, they stop)
          this.spokeT = -99;
          this.speak('sawHeadBurst', { victim: ev.who.name }, 1, null, true);
          this.shaken(1.1);
          this.note(`${ev.who.name} was shot in the head. Right in front of me.`);
        }
        break;
      case 'helmetStop':
        if (seen && ev.who && ev.who.alive) {
          E.bump('surprise', 0.4);
          this.speak('sawHelmetStop', { victim: ev.who.name }, 0.55, null, true);
        }
        break;
      case 'stumbleFall':
        if (seen && ev.who) {
          E.bump('surprise', 0.12);
          // somebody they cannot stand going flat on their back: funny, to the unkind
          const r = this.rels.get(ev.who);
          if (r && r.like < -0.2 && T.empathy < 0.5 && me.ready && !this.fighting && chance(0.45)) {
            me.faceTo(ev.who.pos.x);
            me.perform('laughPoint');
            this.speak('mockFall', { victim: ev.who.name }, 0.9, ev.who, true);
          } else if (d < 6 && chance(0.4)) this.speak('sawFall', { victim: ev.who.name }, 0.4, null);
        }
        break;
      case 'stumbleCaught':
        if (seen && ev.who && d < 6 && (ev.steps || 0) >= 3 && chance(0.35)) this.speak('sawCaught', { victim: ev.who.name }, 0.4, null);
        break;
      case 'ignite':
        // (what they say about it, they say once they see it: sense())
        if (seen && ev.who) {
          E.bump('surprise', 0.5);
          if (ev.by && ev.by !== me && !ev.by.removed && ev.by !== ev.who) {
            const rb = this.rel(ev.by), care = Math.max(0, this.rel(ev.who).like);
            rb.violent += 2;
            rb.fear = clamp01(rb.fear + 0.3 * (1.15 - T.bravery));
            rb.like = clamp(rb.like - 0.35 - care * 0.3, -1, 1);
            if (care > 0.3) rb.anger = clamp01(rb.anger + 0.3 * care * (0.4 + T.temper));
            this.remember('sawBurn', ev.by, ev.who);
          }
          this.react = Math.max(this.react, 0.15);
        } else { this.heard = { x, y, t: now }; this.hearLoud(x); }
        break;
      case 'extinguish':
        if (seen && ev.who && ev.how !== 'healed' && ev.how !== 'frozen' && ev.who.alive && ev.who.conscious) {
          E.bump('fear', -0.08);
          if (Math.max(0, this.rel(ev.who).like) > 0.2 || chance(0.35)) this.speak('sawPutOut', { victim: ev.who.name }, 0.6, null);
        }
        break;
      case 'freeze':
        if (seen && ev.who) {
          E.bump('surprise', 0.65);
          E.bump('fear', 0.12 * (1.2 - T.bravery));
        }
        break;
      case 'thaw':
        if (seen && ev.who) { E.bump('surprise', 0.3); this.speak(ev.who.dead ? 'sawThawDead' : 'sawThaw', { victim: ev.who.name }, 0.6, null); }
        break;
      case 'iceSnap':
        if (seen && ev.who) {
          E.bump('surprise', 0.5);
          this.speak('sawIceSnap', { victim: ev.who.name }, 0.75, null, true);
          this.shaken(0.3);
        }
        break;
      case 'glassShatter':
        // a pane of glass coming down
        E.bump('surprise', seen ? 0.6 : 0.3);
        if (d < 5) E.bump('fear', 0.08 * (1.2 - T.bravery));
        if (seen && chance(0.5)) this.speak('glassBreak', {}, 0.7, null, true);
        else if (!seen) { this.heard = { x, y, t: now }; this.hearLoud(x); }
        break;
      case 'shatter':
        if (seen && ev.who) {
          E.bump('surprise', 1);
          E.bump('fear', 0.3 * (1.2 - T.bravery));
          if (ev.by && ev.by !== me && !ev.by.removed) {
            const rb = this.rel(ev.by);
            rb.violent += 2;
            rb.fear = clamp01(rb.fear + 0.3 * (1.15 - T.bravery));
          }
          this.speak('sawShatter', { victim: ev.who.name }, 0.95, null, true);
          this.note(`${ev.who.name} shattered into pieces!`);
          this.shaken(0.8);
        } else { this.heard = { x, y, t: now }; this.hearLoud(x); }
        break;
      case 'slabFree':
        // a wall going over
        E.bump('surprise', 0.5);
        if (seen && chance(0.6)) this.speak('wallDown', {}, 0.75, null, true);
        else if (!seen) this.heard = { x, y, t: now };
        break;
      case 'limbFall':
        if (ev.tree) {
          // a whole tree coming down: get out from under it
          E.bump('surprise', 0.8);
          if (d < 6) E.bump('fear', 0.25 * (1.2 - T.bravery));
          if (seen && chance(0.7)) this.speak('timber', {}, 0.9, null, true);
          if (seen && d < 5 && me.ready && !me.frozenInPlace && !me.tied) me.goTo(me.pos.x + (Math.sign(me.pos.x - x) || 1) * 4, 'run');
        } else if (seen && ev.big) E.bump('surprise', 0.25);
        break;
      case 'wireSnap':
        if (seen && ev.why === 'strain') { E.bump('surprise', 0.4); if (chance(0.5)) this.speak('wireSnap', {}, 0.7, null, true); }
        break;
      case 'noosed':
        // somebody with a noose put round their neck
        if (seen && ev.who && ev.who !== me) {
          const r = this.rel(ev.who);
          E.bump('fear', 0.3 * (1.2 - T.bravery));
          E.bump('sadness', 0.15 + Math.max(0, r.like) * 0.3);
          E.bump('surprise', 0.5);
          this.speak('sawNoosed', { victim: ev.who.name }, 0.85, null, true);
          this.note(`Somebody put a noose round ${ev.who.name}'s neck.`);
        }
        break;
      case 'trapdoor':
        // the trapdoor dropping - and whoever was on it, through it
        if (!ev.open) break;
        E.bump('surprise', 0.6);
        for (const v of ev.on || []) {
          if (!seen || v === me || v.removed) continue;
          const r = this.rel(v);
          E.bump('fear', 0.4 * (1.2 - T.bravery));
          E.bump('sadness', 0.3 + Math.max(0, r.like) * 0.5);
          if (v.noosed) {
            this.speak('sawHanged', { victim: v.name }, 1, null, true);
            this.note(`${v.name} dropped through the trapdoor, on the end of a rope.`);
            this.shaken(0.6);
          }
          break;
        }
        if (!seen) this.heard = { x, y, t: now };
        break;
      case 'freezeInPlace':
        // somebody stopped dead, in mid-air or mid-step
        if (seen && ev.who && ev.who !== me) {
          E.bump('surprise', 0.7);
          E.bump('fear', 0.12 * (1.2 - T.bravery));
          this.speak('sawFrozenInPlace', { victim: ev.who.name }, 0.7, null, true);
          this.note(`${ev.who.name} stopped dead. Didn't move. Couldn't.`);
        }
        break;
      case 'wire':
        // somebody tied up, by a rope out of nowhere
        for (const e of [ev.what && ev.what.a, ev.what && ev.what.b]) {
          if (!seen || !e || !e.t || e.t.kind !== 'stickman' || e.t === me) continue;
          E.bump('surprise', 0.4);
          if (chance(0.6)) this.speak('sawTied', { victim: e.t.name }, 0.6, null, true);
          break;
        }
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
    if (ev.target === me && by !== me) this.underFireT = now;
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
    // the startle: a flinch, a duck, hands over the head (a superpower takes most of that out of them)
    if (me.ready && !this.fighting && now - (this.startleT || -9) > 1.2 && chance((0.75 - T.bravery * 0.4) * (1 - this.courage))) {
      this.startleT = now;
      me.perform(chance(0.6) ? 'duck' : 'flinch', { fadeIn: 0.03, fadeOut: 0.15 });
    }
    if (now - (this.shotSaidT || -9) > 4) {
      this.shotSaidT = now;
      // (not every bang is a gun: a mod's may say what it sounded like)
      if (!seen) this.speak(ev.heardAs || (me.officer ? 'copShotsFired' : 'gunshots'), {}, 0.7, null, true);
      else if (by && ev.target && ev.target !== me) this.speak('sawShooting', { other: by.name, victim: ev.target.name }, 0.6, null, true);
      else if (by) {
        const bold = this.courage && chance(this.courage);
        this.speak(bold ? 'pwUnafraidShot' : 'takeCover', { other: by.name }, 0.6, bold ? by : null, true);
      }
    }
    if (!seen) { this.heard = { x, y, t: now }; this.hearLoud(x); }
    this.react = Math.max(this.react, 0.15 + (1 - T.skill) * 0.15);
    this.thinkT = 0;
  }

  /**
   * Something blowing up. It is heard from anywhere: everyone jumps, and the
   * nearer it was the more it frightens them - close enough, they throw
   * themselves down, or freeze where they are. Whoever set it off is now the
   * most frightening person there.
   */
  heardBlast(ev, seen, x, y, d) {
    const me = this.man, E = this.emo, T = this.traits, now = this.sb.time;
    const by = ev.who && !ev.who.removed && ev.who !== me ? ev.who : null;
    const near = clamp01(1 - d / ((ev.r || 3) * 3 + 6));
    E.bump('surprise', 0.9);
    this.blastT = now;
    this.blastNear = near;
    if (near > 0.25) me.health.shock = Math.min(1, me.health.shock + (near - 0.15) * 0.35 * (1.2 - T.toughness * 0.5) * (1 - this.courage * 0.5));
    E.bump('fear', (0.12 + near * 0.55) * (1.3 - T.bravery) * Math.min(1.4, 0.6 + (ev.power || 1) * 0.25));
    if (by) {
      const r = this.rel(by);
      r.violent += 2;
      r.fear = clamp01(r.fear + 0.4 * (1.15 - T.bravery));
    }
    // the startle: a flinch, a duck, hands over the head
    if (me.ready && !this.fighting && now - (this.startleT || -9) > 1.2 && chance((0.95 - T.bravery * 0.35) * (1 - this.courage))) {
      this.startleT = now;
      // (close: down; a little further off, the hands go over the ears - or just a flinch)
      me.perform(near > 0.3 ? 'duck' : near > 0.12 && chance(0.55) ? 'coverEars' : chance(0.6) ? 'duck' : 'flinch', { fadeIn: 0.03, fadeOut: 0.15 });
    }
    // (right on top of it, there is no time to say anything: what it does to them speaks for them)
    if (now - (this.blastSaidT || -9) > 4 && d > (ev.r || 3) * 0.5) {
      this.blastSaidT = now;
      this.speak(seen ? 'sawBlast' : 'heardBlast', {}, 0.8, null, true);
    }
    this.note(seen ? (near > 0.4 ? 'Something blew up right in front of me!' : 'Something blew up over there!') : 'An explosion! Somewhere close.');
    if (seen && near > 0.3) this.shaken(0.25 * near);
    if (!seen) { this.heard = { x, y, t: now }; this.hearLoud(x); }
    this.react = Math.max(this.react, 0.15 + (1 - T.skill) * 0.15);
    this.thinkT = 0;
  }

  /**
   * Something nobody can do, done in front of them: somebody flying, a round
   * stopping in the air, a person thrown across the room by a wave of a hand.
   * They cannot believe it - and whoever is doing it is the most frightening
   * thing they have ever seen, if it is being done to somebody.
   */
  sawPower(ev, seen, x, y, d) {
    const me = this.man, E = this.emo, T = this.traits, who = ev.who;
    if (!seen) {
      if (ev.loud) { this.heard = { x, y, t: this.sb.time }; this.hearLoud(x); }
      if (ev.type === 'shockwave' && d < 14) this.speak('sawShockwave', {}, 0.4, null, true);
      return;
    }
    if (!who || who.removed) return;
    E.bump('surprise', ev.type === 'powerMove' ? 0.35 : 0.45);
    const o = ev.target && !ev.target.removed ? ev.target : null;
    const r = this.rel(who);
    // done to somebody: whoever can do that is to be feared (the more, the more it was done to someone they like)
    if (o && o !== me && ev.type === 'powerMove') {
      r.fear = clamp01(r.fear + 0.12 * (1.2 - T.bravery));
      if (this.rel(o).like > 0.3) r.like = clamp(r.like - 0.15, -1, 1);
    }
    // (somebody putting themselves between everybody and the danger is not to be feared: quite the opposite)
    const saving = ev.type === 'humanShield' || ev.type === 'smother' || ev.type === 'smotherBlast';
    if (saving) { r.like = clamp(r.like + (o === me ? 0.45 : 0.2), -1, 1); r.fear *= 0.6; }
    else if (o === me) { r.fear = clamp01(r.fear + 0.3 * (1.2 - T.bravery)); E.bump('fear', 0.3 * (1.2 - T.bravery)); }
    const vars = { other: who.name, victim: o ? o.name : 'them' };
    switch (ev.type) {
      case 'powerGiven': this.speak('sawGotPower', vars, 0.6, null, false); break;
      case 'pwTakeoff': this.speak('sawFlying', vars, 0.6, null, true); this.note(`${who.name} just... flew. Up off the ground.`); break;
      case 'skyToss': case 'skyDrop': this.speak('sawSkyToss', vars, 0.8, null, true); this.shaken(0.5); break;
      case 'shockwave': this.speak('sawShockwave', vars, 0.5, null, true); break;
      case 'wallSmash': this.speak('sawWallSmash', vars, 0.7, null, true); break;
      case 'bulletStopped': this.speak('sawBulletStop', vars, 0.7, null, true); this.note(`The bullets stopped in the air in front of ${who.name}.`); break;
      case 'blitz': case 'blink': case 'lightningLine': case 'whirlwind': case 'speedDodge':
        this.speak('sawSpeedster', vars, 0.5, null, true); break;
      case 'diveImpact': this.speak('sawShockwave', vars, 0.5, null, true); break;
      // super durability
      case 'bulletBounce': {
        // (the shot itself has them talking first: a moment later, what it did - or did not do)
        const t = this.sb.time;
        if (t - (this.sawBounceT ?? -99) > 10) { this.sawBounceT = t; this.sb.later(0.9, () => this.speak('sawBulletsBounce', vars, 0.9, null, true)); }
        this.note(`The bullets are bouncing off ${who.name}.`);
        break;
      }
      case 'headbutt': this.speak('sawHeadbutt', vars, 0.5, null, true); break;
      case 'bodySlam': this.speak('sawSlam', vars, 0.6, null, true); break;
      case 'humanShield': this.speak('sawShield', vars, 0.7, null, true); this.note(`${who.name} is standing in front of ${vars.victim}, taking the bullets.`); break;
      case 'smother': this.speak('sawSmother', vars, 0.8, null, true); this.note(`${who.name} threw themselves on top of the bomb.`); break;
      case 'smotherBlast': if (who.alive) { this.speak('sawSmotherBlast', vars, 0.8, null, true); this.note(`${who.name} took the whole blast, and lived.`); } break;
      case 'unstoppable': this.speak('sawUnstoppable', vars, 0.5, null, true); break;
      // laser vision
      case 'laserFire': case 'laserBolt': {
        // (nobody sees that for the first time and says nothing)
        const t = this.sb.time, first = t - (this.sawLaserT ?? -99) > 12;
        this.sawLaserT = t;
        this.speak('sawLaser', vars, first ? 0.95 : 0.4, null, true);
        this.note(`${who.name} is shooting beams out of their eyes.`);
        break;
      }
      case 'overcharge': this.speak('sawOvercharge', vars, 0.8, null, true); this.shaken(0.3); break;
      case 'gunMelted': this.speak('sawGunMelt', vars, 0.7, null, true); this.note(`${who.name} melted the gun in ${vars.victim}'s hand just by looking at it.`); break;
      case 'laserCut': this.speak('sawLaserCut', vars, 0.6, null, true); break;
      case 'powerMove':
        if (ev.power === 'tk' && o) { this.speak('sawTelekinesis', vars, 0.5, null, true); this.note(`${who.name} is moving ${o.name} without touching them.`); }
        else if (ev.power === 'speed') this.speak('sawSpeedster', vars, 0.35, null, true);
        else if (ev.power === 'flight' && who.state === 'air') this.speak('sawFlying', vars, 0.35, null, true);
        break;
    }
    if (d < 9 && !this.fighting && me.ready && this.brave < 0.5 && ev.type !== 'powerGiven' && chance(0.3)) me.perform('flinch');
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
    // and something like that, seen, is a shock to the system as well as the stomach
    const h0 = me.health;
    h0.shock = Math.min(1, h0.shock + amount * 0.3 * (1.15 - T.toughness * 0.5) * (1 - this.courage * 0.5));
    // (a superpower steadies the stomach as well as the nerves - some)
    const weak = (1 - T.toughness) * (0.4 + T.empathy * 0.6) * (1.1 - T.bravery * 0.5) * (1 - this.courage * 0.5);
    // (and it turns the stomach)
    sicken(me, amount * (0.15 + weak * 0.45));
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
    this.glance = { x, at: this.sb.time + rand(0.25, 0.6) * (1.3 - this.traits.skill * 0.5) * (this.aware < 1 ? 2 - this.aware : 1) };
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
      const sp = armOf(ev.weapon);
      const nasty = ev.weapon === 'bullet' ? 3 : ev.weapon === 'machete' ? 2.8 : ev.weapon === 'knife' ? 2.4 : sp ? sp.nasty || 2.4 : A.weapon ? 1.5 : 1;
      E.bump('fear', ev.power * 0.035 * (1.2 - T.bravery) * nasty);
      if (ev.weapon === 'knife' && !this.fighting) this.speak('sawStab', { victim: V.name, other: A.name }, 0.5, null, true);
      else if (ev.weapon === 'machete' && !this.fighting) this.speak('sawChop', { victim: V.name, other: A.name }, 0.5, null, true);
      else if (ev.weapon === 'bullet' && !this.fighting) this.speak('sawShot', { victim: V.name, other: A.name }, 0.6, null, true);
      else if (sp && sp.seen && !this.fighting) this.speak(sp.seen, { victim: V.name, other: A.name, what: sp.noun || 'that' }, 0.5, null, true);
      if (!this.fighting && !this.fleeing) this.speak('witnessHit', {}, 0.15);
    }
    // somebody curled up on the floor, being kicked: nobody decent watches that and says nothing
    if (ev.curled && V !== me && rv.like > -0.3 && !this.fighting && T.empathy > 0.3) {
      ra.anger = clamp01(ra.anger + 0.12 * (0.4 + T.empathy));
      ra.like = clamp(ra.like - 0.08 * T.empathy, -1, 1);
      this.speak('sawBeatDown', { victim: V.name, other: A.name }, 0.7, A, true);
    }
    const sp2 = armOf(ev.weapon);
    const nasty = ev.weapon === 'bullet' ? 3 : ev.weapon === 'machete' ? 2.8 : ev.weapon === 'knife' ? 2.6 : sp2 ? sp2.nasty || 2.6 : A.weapon ? 1.6 : 1;
    ra.fear = clamp01(ra.fear + ev.power * 0.025 * (1 - T.bravery) * nasty);
    if (ev.weapon === 'knife' || ev.weapon === 'machete' || ev.weapon === 'bullet' || sp2) ra.violent += 0.5;
  }

  /** Somebody going over stiff as a board, with a taser's wires in them. */
  sawTased(ev) {
    const me = this.man, E = this.emo, T = this.traits;
    const V = ev.who, A = ev.by && !ev.by.removed ? ev.by : null;
    E.bump('surprise', 0.45);
    E.bump('fear', 0.06 * (1.2 - T.bravery));
    if (!A || A === me) return;
    const rv = this.rel(V), ra = this.rel(A);
    // an officer bringing in somebody who had it coming is doing the job
    const job = A.officer && !!this.sb.law.wanted(V);
    if (!job) {
      ra.violent += 0.7;
      ra.fear = clamp01(ra.fear + 0.12 * (1.1 - T.bravery));
      if (!A.officer) this.remember('sawAttack', A, V);
    }
    if (rv.like > 0.3) {
      ra.anger = clamp01(ra.anger + 0.18 * rv.like * (0.3 + T.temper) * (job ? 0.3 : 1));
      E.bump('sadness', 0.05);
    }
    this.speak(A.officer ? 'sawCopTase' : 'sawTased', { victim: V.name, other: A.name }, 0.65, null, true);
  }

  /** Somebody in handcuffs: a relief to whoever they hurt, and hard to watch for a friend. */
  sawArrest(ev) {
    const E = this.emo, T = this.traits;
    const V = ev.who, A = ev.by && !ev.by.removed ? ev.by : null;
    if (!A || A === this.man) return;
    const rv = this.rel(V), ra = this.rel(A);
    this.remember('sawArrest', A, V);
    if (rv.hurtMe > 0 || rv.fear > 0.3 || rv.like < -0.3) {
      rv.fear *= 0.4;
      ra.like = clamp(ra.like + 0.15, -1, 1);
      E.bump('fear', -0.2);
      E.bump('joy', 0.12);
      this.speak(rv.hurtMe > 0 ? 'sawArrestMine' : 'sawArrestRelief', { victim: V.name, other: A.name }, 0.8, A, true);
    } else if (rv.like > 0.35) {
      E.bump('sadness', 0.12 * (0.5 + T.empathy));
      this.speak('sawArrestFriend', { victim: V.name, other: A.name }, 0.8, null, true);
    } else this.speak('sawArrest', { victim: V.name, other: A.name }, 0.4, null);
  }

  sawDeath(ev, seen, x, y) {
    const me = this.man, E = this.emo, T = this.traits, now = this.sb.time;
    const V = ev.who, K = ev.by && !ev.by.removed ? ev.by : null;
    if (!V) return;
    if (V.species && V.species.monster && !(me.species && me.species.monster)) {
      // a monster down (a mod's): relief, and for whoever did it, pride
      E.bump('surprise', 0.35);
      E.bump('joy', K === me ? 0.4 : 0.2);
      E.bump('fear', -0.25);
      this.speak(K === me ? 'killedMonster' : 'monsterDown', { victim: V.name }, 0.8, null, true);
      if (K === me) this.victory = Math.max(this.victory, 0.6);
      return;
    }
    if (!seen && Math.abs(V.pos.x - me.pos.x) > 6) { E.bump('surprise', 0.15); this.heard = { x, y, t: now }; this.hearLoud(x); return; }
    const rv = this.rel(V);
    const care = Math.max(0, rv.like) + rv.fam * 0.35;
    this.griefs.set(V, { t: now, care, mourned: 0 });
    if (seen) me.health.shock = Math.min(1, me.health.shock + (0.08 + Math.min(1, care) * 0.3) * (1 - this.courage * 0.5));
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
        // (and nobody grieves for somebody they meant to kill and are glad of)
        this.griefs.delete(V);
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
    const how = seen && DEATH_SAID[ev.cause];
    this.speak(how && chance(0.75) ? how : care > 0.15 ? 'witnessDeath' : 'witnessDeathStranger', { victim: V.name }, 0.85, null, true);
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
        // coming round out of the ice: that is all there is to say for a while
        if (me.thawedT && this.sb.time - me.thawedT < 90) {
          E.bump('surprise', 0.7);
          E.bump('fear', 0.2 * (1.2 - T.bravery));
          this.speak('thawWake', {}, 0.9);
          this.note("I was frozen solid. Now I'm thawing out.");
          me.thawedT = null;
          break;
        }
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
        if (d && d.by && !d.by.removed) {
          // seized by somebody: by the throat, off the floor
          E.bump('surprise', 0.9);
          E.bump('fear', 0.6 * (1.2 - T.bravery));
          const r = this.rel(d.by);
          r.fear = clamp01(r.fear + 0.5 * (1.2 - T.bravery));
          r.like = -1;
          // (with a superpower: as likely a warning as a scream)
          this.speak(this.courage && chance(this.courage) ? 'pwUnafraidHeld' : 'seized', { other: d.by.name }, 1, d.by, true);
          this.note(`${d.by.name} grabbed me!`);
          this.clearBehaviour();
          break;
        }
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
      case 'frozenInPlace':
        // stopped dead by something they cannot see: not cold, not hurt - just not moving
        this.clearBehaviour();
        E.bump('surprise', 1);
        E.bump('fear', 0.4 * (1.2 - T.bravery));
        this.speak('cantMove', {}, 0.95, null, true);
        this.note("I can't move. Not a muscle. I can still see everything.");
        this.downTalk = rand(3, 5);
        break;
      case 'unfrozen':
        E.bump('surprise', 0.6);
        E.bump('fear', -0.1);
        this.thinkT = 0;
        this.speak('canMove', {}, 0.9, null, true);
        this.note('I could move again, all at once.');
        break;
      case 'roped':
        // tied to something: a rope, a rod or a pin through their clothes
        if (d && d.first) {
          this.clearBehaviour();
          E.bump('surprise', 0.8);
          E.bump('fear', 0.3 * (1.2 - T.bravery));
          this.speak('tiedUp', {}, 0.9, null, true);
          this.note(`Something tied me up by the ${String(d.part || 'arm').replace(/[AB]$/, '')}.`);
          this.downTalk = rand(2.5, 4.5);
        }
        break;
      case 'noosed':
        // a rope round the neck, and a trapdoor under the feet: they know what that is
        this.clearBehaviour();
        E.bump('fear', 0.8 * (1.25 - T.bravery));
        E.bump('surprise', 0.7);
        E.bump('sadness', 0.25);
        this.speak('noosed', {}, 1, null, true);
        this.note("There's a noose round my neck.");
        this.downTalk = rand(2, 3.5);
        break;
      case 'unroped':
        E.bump('joy', 0.2);
        this.thinkT = 0;
        this.speak('canMove', {}, 0.6);
        this.note("I'm not tied up any more.");
        break;
      case 'armed': {
        const k = d.item ? d.item.kind : 'knuckles';
        E.bump('fear', k === 'taser' ? -0.3 : isGun(k) ? -0.4 : k === 'knuckles' ? -0.2 : -0.28);
        E.bump('joy', 0.12);
        this.calmT = this.sb.time;
        this.speak({ knife: 'knifeGet', machete: 'macheteGet', taser: 'taserGet' }[k] || (isGun(k) ? 'gunGet' : 'weaponGet'), {}, 0.8);
        this.note({
          knife: "Got the knife. I hope I don't need it.", machete: 'Got the machete. Everyone had better stay back.',
          glock: "Got the gun. Is it loaded? It's loaded.", m1911: 'Got the .45. Heavy thing.', taser: "Got a taser. Better than a gun, I suppose.",
          crowbar: 'Got a crowbar. Heavy. Good.', ak47: "An AK. Nobody's going to argue with this.", mossberg: "A shotgun. Up close, nothing's going to stop it.",
          gasRifle: "A gas rifle. I'd better not breathe any of it myself.",
          m4a1: "Got the M4. Thirty rounds. That'll do.", ar15: 'Got the AR. One shot at a time.',
        }[k] || "Got the brass knuckles. Hope I don't have to use them.");
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
        this.underFireT = this.sb.time;
        E.bump('fear', 0.3 * (1.2 - T.bravery));
        E.bump('surprise', 0.5);
        if (d.by && d.by !== me) { const r = this.rel(d.by); r.fear = clamp01(r.fear + 0.2 * (1.1 - T.bravery)); this.remember('shotAtMe', d.by); }
        // (somebody with a superpower barely ducks - and is as likely to have something to say about it)
        if (me.ready && chance(0.6 * (1 - this.courage * 0.7))) me.perform('duck', { fadeIn: 0.03, fadeOut: 0.15 });
        const shooter = d.by && d.by !== me && !d.by.removed ? d.by : null;
        if (shooter && this.courage && chance(this.courage)) this.speak('pwUnafraidShot', { other: shooter.name }, 0.7, shooter, true);
        else this.speak('nearMiss', {}, 0.7, null, true);
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
      case 'tased': {
        // every muscle at once: there is nothing to do but yell
        this.clearBehaviour();
        E.bump('surprise', 1);
        E.bump('fear', 0.35 * (1.2 - T.bravery));
        const by = d.by && !d.by.removed ? d.by : null;
        if (by) {
          const r = this.rel(by);
          const fair = by.officer && !!this.sb.law.wanted(me);
          r.fear = clamp01(r.fear + 0.35 * (1.2 - T.bravery));
          r.anger = clamp01(r.anger + (fair ? 0.1 : 0.35) * (0.3 + T.temper));
          r.like = clamp(r.like - (fair ? 0.1 : 0.35), -1, 1);
          r.hurtT = this.sb.time;
          this.remember('tasedMe', by);
          this.note(`${by.name} tased me!`);
        } else this.note('Something hit me and everything locked up!');
        this.speak('tased', {}, 1, null, true);
        this.downTalk = rand(1, 1.8);
        break;
      }
      case 'tasedEnd':
        this.speak('tasedAfter', {}, 0.8);
        break;
      case 'stumble':
        E.bump('surprise', 0.2);
        this.speak('stumble', {}, 0.45, null, true);
        break;
      case 'caught':
        if (d.steps >= 2) this.speak('caught', {}, 0.4);
        break;
      case 'cuffed': {
        this.clearBehaviour();
        this.police = null;
        this.ordered = null;
        this.begging = false;
        E.bump('sadness', 0.2);
        E.bump('fear', 0.15 * (1.2 - T.bravery));
        const by = d.by && !d.by.removed ? d.by : null;
        if (by) { this.remember('arrestedMe', by); this.rel(by).anger *= 0.5; }
        if (!me.tased) this.speak('cuffed', { other: by ? by.name : 'them' }, 1, by, true);
        this.note(by ? `${by.name} put me in handcuffs.` : "I'm in handcuffs.");
        this.thinkT = 0;
        break;
      }
      case 'uncuffed':
        E.bump('joy', 0.25);
        E.bump('fear', -0.15);
        this.clearBehaviour();
        this.speak('uncuffed', {}, 0.9);
        this.note('The cuffs are off.');
        this.thinkT = 0;
        break;
      case 'vest':
        E.bump('fear', -0.12);
        if (!me.officer) this.speak('vestOn', {}, 0.7);
        this.note('Got a vest on. That should stop a bullet.');
        break;
      case 'helmet':
        E.bump('fear', -0.08);
        this.speak('helmetOn', {}, 0.7);
        this.note("Helmet's on. That should help.");
        break;
      case 'drew': {
        const k = d.item.kind;
        this.calmT = this.sb.time;
        if (!me.officer) this.speak(k === 'taser' ? 'drawTaser' : isFirearm(k) ? 'drawGun' : 'drawWeapon', { what: ITEM_SAID[k] || 'this' }, 0.6, null, true);
        break;
      }
      case 'pocketed':
        this.speak('pocketed', { what: ITEM_SAID[d.item.kind] || 'this' }, 0.6);
        this.note(`Put the ${ITEM_SAID[d.item.kind] || 'thing'} away for later.`);
        break;
      case 'ammo':
        this.speak(d.n > 0 ? 'ammoGot' : 'ammoNone', { n: String(d.n) }, 0.7);
        this.note(d.n > 0 ? `Took ${d.n} rounds from the ammo box.` : 'Nothing in there I could use.');
        break;
      case 'dead':
        this.clearBehaviour();
        this.note(`I died: ${me.health.cause}.`);
        break;
      case 'onFire': {
        this.clearBehaviour();
        E.bump('fear', 0.9);
        E.bump('surprise', 1);
        // some know what to do; the rest find out, or are told
        this.rollKnows = chance(0.3 + T.skill * 0.35 + T.bravery * 0.15 + T.curiosity * 0.1);
        const by = d.by && d.by !== me && !d.by.removed ? d.by : null;
        if (by) {
          const r = this.rel(by);
          r.fear = clamp01(r.fear + 0.5 * (1.2 - T.bravery));
          r.anger = clamp01(r.anger + 0.4 * (0.3 + T.temper));
          r.like = -1;
          r.hurtT = this.sb.time;
          this.remember('burnedMe', by);
        }
        this.speak('onFire', {}, 1, null, true);
        this.note(by ? `${by.name} set me on fire!` : "I'm on fire!");
        this.thinkT = 0;
        this.react = 0;
        break;
      }
      case 'putOut':
        if (d.how === 'healed' || d.how === 'frozen' || !me.conscious) break;
        E.bump('fear', -0.35);
        E.bump('joy', 0.15);
        this.speak(d.how === 'rolled' ? 'fireOutRolled' : 'fireOut', {}, 0.9, null, true);
        this.note(d.how === 'rolled' ? 'I rolled it out. I actually rolled it out.' : d.how === 'smothered' ? 'Somebody beat the flames out.' : "The fire's out.");
        break;
      case 'frozen':
        this.clearBehaviour();
        this.note("So cold... I can't move...");
        break;
      case 'gasp':
        E.bump('fear', 0.15);
        this.speak('gasp', {}, 1, null, true);
        this.note('Air. I can breathe again.');
        break;
      case 'tempShock': {
        // a temperature set from the sky: they feel it at once
        const t = d.temp;
        if (t >= IGNITE_AT || t <= 0 || !me.conscious) break;
        if (t > 39.5) { E.bump('surprise', 0.5); this.speak('suddenHot', {}, 0.9, null, true); this.note('Why is it suddenly so hot?'); }
        else if (t < 34.5) { E.bump('surprise', 0.5); this.speak('suddenCold', {}, 0.9, null, true); this.note('So cold, all of a sudden.'); }
        break;
      }
      default:
        break;
    }
  }

  hurt(d) {
    const me = this.man, E = this.emo, T = this.traits, now = this.sb.time;
    const by = d.by && d.by !== me && !d.by.removed ? d.by : null;
    const sev = clamp((d.damage || 0) / 22, 0, 1.6);
    if (by) { this.hitT = now; if (me.lying) this.beatenT = now; }
    if (d.weapon === 'bullet') this.underFireT = now;
    if ((d.damage || 0) > 16) me.health.shock = Math.min(1, me.health.shock + ((d.damage || 0) - 16) * 0.008);
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
      const spec = armOf(d.weapon);
      const nasty = bullet || d.weapon === 'vestRound' || d.weapon === 'helmetRound' ? 3 : machete ? 2.6 : knife ? 2.4 : spec ? spec.nasty || 2.4 : by.weapon ? 1.6 : 1;
      r.fear = clamp01(r.fear + sev * 0.28 * (1.15 - T.bravery) * nasty);
      if (spec) {
        E.bump('fear', 0.25 * (1.2 - T.bravery));
        this.remember(spec.memory || 'hurtMe', by);
        this.speak(spec.hurt || 'hurtBig', { other: by.name }, 0.9, by, true);
        this.note(`${by.name} ${spec.verb || 'hurt me'}!`);
      } else if (d.weapon === 'vestRound') {
        // shot - and the vest took it: a punch in the chest, and a lucky one
        E.bump('fear', 0.3 * (1.2 - T.bravery));
        this.remember('shotMe', by);
        this.speak('vestSaved', { other: by.name }, 1, by, true);
        this.note(`${by.name} shot me. The vest stopped it.`);
      } else if (d.weapon === 'helmetRound') {
        // shot in the head - and the helmet took it: the world ringing, and alive
        E.bump('fear', 0.45 * (1.2 - T.bravery));
        this.remember('shotMe', by);
        this.speak('helmetSaved', { other: by.name }, 1, by, true);
        this.note(`${by.name} shot me in the head. The helmet stopped it.`);
      } else if (bullet) {
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
    } else if (d.weapon === 'vestRound') {
      E.bump('fear', 0.35 * (1.2 - T.bravery));
      this.speak('vestSaved', { other: 'someone' }, 1, null, true);
      this.note('Something hit me in the chest. The vest stopped it.');
    } else if (d.weapon === 'helmetRound') {
      E.bump('fear', 0.5 * (1.2 - T.bravery));
      this.speak('helmetSaved', { other: 'someone' }, 1, null, true);
      this.note('Something hit me in the head. The helmet stopped it.');
    } else if (d.weapon === 'bullet') {
      E.bump('fear', 0.4 * (1.2 - T.bravery));
      this.speak('shot', { other: 'someone' }, 1, null, true);
      this.note('I got shot! Where did that come from?');
    } else if (d.weapon === 'knife' || (d.object && (d.object.kind === 'knife' || d.object.kind === 'machete'))) {
      E.bump('fear', 0.25 * (1.2 - T.bravery));
      this.speak('stabbed', { other: 'someone' }, 0.9, null, true);
      this.note('A knife came out of nowhere and went into me!');
      this.blame();
    } else if (d.weapon === 'explosion' || d.weapon === 'shrapnel') {
      // (nobody to blame: it just went off)
      E.bump('fear', 0.4 * (1.2 - T.bravery));
      this.speak(d.weapon === 'shrapnel' ? 'shrapnelHit' : 'blastHurt', {}, 1, null, true);
      this.note(d.weapon === 'shrapnel' ? 'Bits of it went into me.' : 'It went off right next to me!');
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
    if (d.res && d.res.wound && (d.weapon === 'bullet' || d.weapon === 'knife' || d.weapon === 'machete' || armOf(d.weapon)) && me.alive) this.checkT = this.sb.time + rand(0.7, 1.5);
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
    // what it means coming from them in particular (a mod's people have their own history)
    if (me.species && me.species.spokenTo) me.species.spokenTo(this, from, kind, r);
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
    // (somebody looking after them: the shock eases)
    this.man.health.shock = Math.max(0, this.man.health.shock - 0.15);
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
    const me = this.man, now = this.sb.time;
    this.manageKit();
    if (me.stamina < 0.22 && now - this.tiredT > 25) {
      this.tiredT = now;
      this.speak('tired', {}, 0.6);
      this.note("I'm out of breath.");
    }
    // too hot, too cold, short of air, the heart going: they say so, now and then
    const h = me.health;
    if (now - (this.bodySaidT ?? -99) > 14 && !me.flames) {
      const kind = h.temp >= 39.5 ? 'tooHot' : h.temp <= 34.5 ? 'cold' : h.oxygen < 0.8 ? 'breathless'
        : h.adrenaline > 0.72 && !this.fighting && !this.fleeing ? 'adrenaline' : null;
      if (kind && this.speak(kind, {}, 0.7)) {
        this.bodySaidT = now;
        this.note({ tooHot: "I'm burning up.", cold: "I'm freezing.", breathless: "I can't get my breath.", adrenaline: 'My heart is going like mad.' }[kind]);
      }
    }
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
    // a superpower: braver than they are, and far less given to running, hiding or giving up
    const courage = this.courage, brave = this.brave;
    const out = [];
    const add = (kind, target, score, why, extra = null, urgent = false) => {
      if (score > 0.03) out.push({ kind, target, score, why, extra, urgent });
    };
    // on fire, there is nothing else at all
    if (me.flames) {
      add('burning', null, 3, "I'm on fire!", null, true);
      return out;
    }
    // in handcuffs, there is nothing left to decide
    if (me.cuffed) {
      add('detained', null, 1, null);
      return out;
    }
    // breathing gas, or something about to go off close by: away from it, before nearly anything else
    const gas = me.gasAt;
    if (gas && now - gas.t < 0.5 && me.conscious) add('getClear', null, 2.2, "Gas! I can't breathe in here!", { gas: true, x: gas.x }, true);
    const bomb = this.bomb;
    if (bomb) {
      const w = bomb.what, d = w.removed ? 99 : Math.abs(w.pos.x - me.pos.x);
      if (w.removed || !w.lit || now - bomb.t > 8) this.bomb = null;
      else if (d < 6.5) add('getClear', null, (1.3 + E.fear * 0.8) * (1.25 - T.bravery * 0.4) * (1 - d / 8), `That ${w.name.toLowerCase()} is going to go off!`, { what: w, x: w.pos.x }, d < 4);
    }
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

      // a monster (a mod's): nobody chats with one, helps one up or grieves for one
      const monster = !!(o.species && o.species.monster) || !!(me.species && me.species.monster);
      if (o.dead) {
        if (monster) continue;
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
      if (hostile && o.conscious) f += 0.18 * brave + 0.1 * T.aggression;
      if (r.killed) f += 0.25 * T.temper;
      if (!o.conscious || o.lying) f *= T.aggression > 0.72 && r.anger > 0.82 ? 0.75 : 0.12;
      if (o.brain && o.brain.begging) f *= 1 - T.empathy * 0.8;
      if (r.like > 0.4 && !hostile) f *= 0.35;
      if (!canFight) f *= 0.1;
      f *= fit;
      // out of breath, a fight looks a lot less inviting
      f *= 0.55 + 0.45 * clamp01(me.stamina / 0.5);
      // somebody in handcuffs (or giving themselves up to an officer) is done with; and an officer deals with suspects their own way
      if (o.cuffed || (o.brain && o.brain.behaviour && o.brain.behaviour.kind === 'comply')) f *= 0.15;
      if (this.cop) f *= this.cop.cases.has(o) ? 0.05 : hostile ? 1 : 0.2;
      // an officer telling them to stop: whatever else they were up to can wait
      if (this.police && now - this.police.t < 7 && o !== this.police.by) f *= 0.3;
      f *= 1 / (1 + Math.max(0, d - 3) / 4);
      // some would never start it with some people, whatever has been said (a mod's)
      if (me.species && me.species.fightScale) f *= me.species.fightScale(this, o, r, hostile);
      // and nobody goes for something they cannot reach, unless they can shoot it (or fly up to it)
      if (o.species && o.species.reachable && !o.species.reachable(o, me) && !me.gunReady && !(me.species && me.species.canRange && me.species.canRange(me))) f *= 0.06;
      add('fight', o, f,
        r.killed ? `${o.name} killed ${r.killed.name}. They'll pay.` : hostile ? `${o.name} is coming for me. I'll fight.` : `${o.name} has it coming.`,
        null, hostile && d < 3);

      // something blind that hunts by ear (a mod's): not a sound - crouched and still if it is right there, creeping
      // away if it is not - and running flat out only once it has heard them, and is coming
      const blind = !!(o.species && o.species.blind) && o.conscious && !o.dead;
      if (blind && this.sees(o)) {
        const coming = B.huntedBy(o, me);
        const scared = (0.6 + E.fear * 0.6) * (1.25 - brave * 0.6);
        if (coming) add('flee', o, (1.3 + E.fear) * (1.15 - brave * 0.5), `${o.name} heard me. It's coming!`, null, true);
        else if (d < 3.4) add('freeze', o, scared * 1.45, `${o.name} is right there. Don't move. Don't breathe.`, null, true);
        else if (d < 11) add('flee', o, scared, `${o.name} can't see. Quietly...`, { quiet: true }, true);
        if (scared > threatScore) { threatScore = scared; threat = o; }
      }

      // run from them
      if (o.conscious && !o.lying && !blind) {
        const danger = Math.max(r.fear, hostile ? E.fear * 0.8 : r.fear * 0.5);
        // someone who is after them, or who they just watched do something terrible
        const menace = hostile ? 1 : r.violent > 1 ? 0.65 : 0.3;
        let fl = danger * (1.15 - T.bravery * 0.65) * menace * near;
        if (hostile && health < 0.4) fl += 0.35 * (1.2 - T.bravery);
        if (hostile) fl += (1 - fit) * 0.4;
        if (hostile && !canFight) fl += 0.4;
        // nobody sensible squares up to a knife bare-handed (nobody without a superpower, anyway)
        const blade = o.armedWith === 'knife' || !!(armOf(o.armedWith) && armOf(o.armedWith).blade);
        if (blade && (hostile || r.violent > 0.5) && me.armedWith !== 'knife') fl += (0.25 + E.fear * 0.3) * (1.15 - brave);
        // an officer stands their ground, until it is hopeless; somebody with a superpower,
        // nearly always (and even badly hurt, they would rather not run)
        if (me.officer && health > 0.3) fl *= 0.25;
        if (courage) fl *= 1 - courage * (health > 0.3 ? 0.85 : 0.55);
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
        if (rv.like > 0.3 && brave > 0.35) {
          add('confront', o, rv.like * (0.3 + brave * 0.5) * (1 - E.fear * 0.7) * far, `${o.name} is hurting ${ft.name}!`, { victim: ft }, beating);
        } else if ((T.curiosity > 0.3 || cares > 0.3) && E.fear < 0.55) {
          add('watch', o, (0.1 + T.curiosity * 0.22 + cares * 0.3) * (1 - E.fear) * far * calm, `A fight! ${o.name} and ${ft.name}.`, null, beating);
        }
      }

      // talk to them
      // (an officer has nothing to chat about with somebody they have just cuffed)
      // (nor somebody who has just done something with an officer)
      if (!monster && standing(o) && !hostile && !r.enemy && r.anger < 0.3 && r.fear < 0.35 && !(o.brain && (o.brain.fighting || o.brain.fleeing)) &&
        !(o.cuffed && me.officer) && !(o.officer && this.sb.law.wanted(me)) && !(me.officer && this.sb.law.wanted(o))) {
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
      // (down in handcuffs is not hurt, unless they are bleeding)
      const detained = o.cuffed && !urgent && o.health.bleeding < 0.003 && !pinned;
      if (needs && !monster && !hostile && r.like > -0.2 && !o.dead && !detained) {
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

    // somebody on fire: run over and beat it out - or keep well away from them
    for (const o of this.visible) {
      if (!o.flames || o.removed) continue;
      const r = this.rel(o);
      const d = Math.abs(o.pos.x - me.pos.x);
      const near = 1 / (1 + Math.max(0, d - 2) / 5);
      const monster = !!(o.species && o.species.monster) || !!(me.species && me.species.monster);
      if (!monster && !o.dead && r.like > -0.3 && !this.isHostile(o) && me.health.canUse('armA')) {
        const s = (0.35 + T.empathy * 0.6 + Math.max(0, r.like) * 0.5) * (0.45 + brave * 0.7) * (1 - E.fear * 0.45) * near;
        add('douse', o, s, `${o.name} is on fire! I have to put it out!`, null, d < 8);
      }
      if (o.conscious && !o.lying && d < 4) {
        add('flee', o, (0.3 + E.fear * 0.6) * (1.2 - T.bravery) * (1 - d / 4) * 1.2 * (1 - courage * 0.7), `${o.name} is on fire! Keep away from them!`, null, d < 2);
      }
    }

    // an officer's open cases (and, with none, the beat); an officer telling them to stop; a crime to report
    if (this.cop) {
      considerOfficer(this, add);
      add('patrol', null, (0.13 + this.boredom * 0.1) * calm, 'Time to walk the beat.');
    }
    if (this.police) considerSuspect(this, add);
    if (this.crimesSeen.length) considerWitness(this, add);

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
    if (ab && now - this.aimedT < 0.8 && ab.alive && !ab.removed && ab.gunReady && !(ab.officer && this.police && this.police.by === ab)) {
      const d = Math.abs(ab.pos.x - me.pos.x);
      // (a superpower: a gun is just not that frightening any more)
      const nerve = T.bravery * (me.gunReady ? 1.7 : 1) + (this.ordered && this.ordered.target === ab ? 1 : 0) + courage * 1.2;
      add('surrender', ab, (0.55 + E.fear * 0.6) * Math.max(0, 1.25 - nerve) * (d < 10 ? 1 : 0.5), `${ab.name} is pointing a gun at me!`, null, true);
    }

    // shots: get behind something, or get away
    const gt = this.gunThreat;
    if (gt && now - gt.t < 7 && gt.who && !gt.who.removed && gt.who.alive && gt.who !== me && !(this.ordered && this.ordered.target === gt.who)) {
      const sh = gt.who;
      const scared = (0.45 + E.fear * 0.6) * (1.25 - T.bravery * (me.gunReady ? 1.6 : 1)) * (1 - courage * 0.85);
      const c = this.coverFrom(sh);
      if (c) add('hide', sh, scared * 1.15, 'Shots! Get behind that crate!', { crate: c }, true);
      const d = Math.abs(sh.pos.x - me.pos.x);
      add('flee', sh, scared * 0.9 / (1 + Math.max(0, d - 8) / 6), `${sh.name} is shooting! Run!`, null, d < 12);
      // nowhere to get behind, and too close to outrun it: down where they are, hands over the head
      // (less so with the rounds cracking right past them: then it is flat on the floor, below)
      const shotAt = now - this.underFireT < 2;
      if (!c && d < 7 && !me.gunReady) add('cower', sh, scared * (shotAt ? 0.8 : 1.05), `${sh.name} is shooting! Don't shoot!`, { cover: 'head' }, true);
      // and shot at themselves, out in the open: flat on the floor
      if (!c && shotAt && !me.gunReady && !me.officer) {
        add('curlUp', null, (0.55 + E.fear * 0.6) * (1.15 - brave) * (1 - courage * 0.8), "They're shooting at me! Get down!", { dur: 3.5, why: 'fire' }, true);
      }
    }
    // something blowing up nearby: right next to them, flat on the floor; a little further, hands over the head for a moment
    if (now - this.blastT < 1.2 && this.blastNear > 0.4 && me.state === 'stand') {
      add('curlUp', null, (0.6 + E.fear * 0.5) * (1.2 - brave) * (1 - courage * 0.8), 'Get down!', { dur: 3, why: 'blast' }, true);
    } else if (now - this.blastT < 1.5 && this.blastNear > 0.12) {
      add('cower', null, (0.45 + E.fear * 0.5) * (1.15 - brave) * (1 - courage * 0.8), 'What was that?!', { cover: 'head', dur: 2.2 }, true);
    }
    // being hit, and no way to hit back - too tired, too hurt, nothing to fight with: covering up
    if (threat && this.isHostile(threat) && now - this.hitT < 1.5 && (me.stamina < 0.18 || !canFight || health < 0.4) && Math.abs(threat.pos.x - me.pos.x) < 2.2) {
      add('cower', threat, (0.6 + E.fear * 0.5) * (1.15 - brave), `${threat.name} won't stop hitting me!`, { cover: 'up' }, true);
    }
    // too cold to stand about: curled up on the floor, they keep what heat they have
    if ((me.health.temp ?? 37) < 34.5 && !me.flames && !(threat && this.isHostile(threat))) {
      add('curlUp', null, 0.45 + (34.5 - me.health.temp) * 0.35, 'So cold. I need to curl up.', { dur: 6, why: 'cold' });
    }
    // past coping: deep in shock, and frightened
    if (me.health.shock > 0.72 && E.fear > 0.45) {
      add('curlUp', null, (me.health.shock - 0.55) * 1.6 * (1.1 - brave), "I can't... I can't take any more.", { dur: 6, why: 'shock' });
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
    // (not by somebody whose hands are weapons already)
    // (with something in the hand already, only what can go in a pocket or a holster)
    if (!me.innate && !me.officer && me.health.canUse('armA') && !(me.species && me.species.noPickup)) {
      // (and nobody reaches for one with an officer telling them to drop it)
      const spare = (me.weapon ? 0.5 : 1) * (this.police && now - this.police.t < 9 ? 0.08 : 1);
      const grudge = this.maxAnger();
      const expecting = Math.min(1, threatScore + grudge * 0.6);
      let foeD = Infinity;
      for (const [o, r] of this.rels) if (r.anger > 0.45 && o.alive && !o.removed) foeD = Math.min(foeD, Math.abs(o.pos.x - me.pos.x));
      for (const [k] of this.things) {
        if ((!WEAPON_KINDS.has(k.kind) && !isGun(k.kind)) || k.wornBy || k.removed || (k.stuckIn && k.stuckIn.person)) continue;
        if (k.pos.y - me.pos.y > 0.6) continue;
        if (isGun(k.kind) && k.ammo <= 0) continue;
        if (me.carries(k.kind) || (me.weapon && !me.slotFor(k) && !me.slotFor(me.weapon))) continue;
        const d = Math.abs(k.pos.x - me.pos.x);
        const onTheWay = d < foeD ? grudge * 0.5 * (0.5 + T.aggression) : 0;
        let s = (0.08 + E.anger * 0.4 * (0.4 + T.aggression) + expecting * 0.35 * (0.3 + T.bravery) +
          T.curiosity * 0.12 + T.aggression * 0.12 + onTheWay) / (1 + d / 7);
        if (k.kind === 'knife' || k.kind === 'machete' || k.kind === 'crowbar') {
          // a blade (or a bar of steel) is not for everyone: the kind and the timid leave it where it is
          s *= (0.55 + T.aggression * 0.9) * (1.25 - T.empathy * 0.8) * (k.kind === 'machete' ? 1.05 : 1) * spare;
          add('arm', k, s, k.kind === 'machete' ? (d < 4 ? 'A machete. Right.' : 'There is a machete over there.')
            : k.kind === 'crowbar' ? (d < 4 ? 'A crowbar. That will do.' : 'There is a crowbar over there.')
              : d < 4 ? 'A knife. Nobody will mess with me now.' : 'There is a knife over there.');
        } else if (k.kind === 'taser') {
          // a taser: for the careful as much as the angry - it puts people down without killing them
          const guarded = this.gunThreat && now - this.gunThreat.t < 20 ? 0.2 * T.bravery : 0;
          s = (s + guarded) * (0.6 + T.aggression * 0.4 + T.bravery * 0.3) * spare;
          add('arm', k, s, d < 4 ? 'A taser. That will keep anybody off me.' : 'There is a taser on the floor over there.');
        } else if (isGun(k.kind)) {
          // a gun: the angry want it, and so do the brave who are frightened of someone else having it
          const guarded = this.gunThreat && now - this.gunThreat.t < 20 ? 0.35 * T.bravery : 0;
          s = (s + guarded) * (0.45 + T.aggression * 0.8 + T.bravery * 0.25) * (1.25 - T.empathy * 0.8) * spare;
          // (a rifle or a shotgun counts for more than a pistol)
          if (isLongGun(k.kind)) s *= 1.25;
          const close = { m1911: 'A .45. Big gun. Mine.', ak47: 'An AK-47. Oh, this changes things.', mossberg: 'A shotgun. Nobody comes near me now.', gasRifle: 'A gas rifle. One of those and the whole room is coughing.', m4a1: 'An M4. Right there.', ar15: 'An AR-15. I know how to use one of those.' }[k.kind] || "A gun. Let's see them try something now.";
          add('arm', k, s, d < 4 ? close : k.kind === 'ak47' || k.kind === 'm4a1' || k.kind === 'ar15' ? 'There is a rifle over there.' : k.kind === 'mossberg' ? 'There is a shotgun over there.' : k.kind === 'gasRifle' ? 'There is a gas rifle over there.' : 'There is a gun on the floor over there.');
        } else {
          s *= spare;
          add('arm', k, s, d < 4 ? 'Brass knuckles, right there. Mine.' : 'Those brass knuckles could come in handy.');
        }
      }
    }

    // a vest lying about: on it goes, for anybody expecting trouble - or just careful
    if (!me.vest && !me.donning && me.human && me.health.canUse('armA') && me.health.canUse('armB')) {
      const shots = this.gunThreat && now - this.gunThreat.t < 30 ? 0.45 : 0;
      for (const [g] of this.things) {
        if (g.kind !== 'vest' || g.wornBy || g.removed || g.pos.y - me.pos.y > 0.6) continue;
        const d = Math.abs(g.pos.x - me.pos.x);
        const s = (0.07 + E.fear * 0.25 + shots + (1 - T.bravery) * 0.06 + T.curiosity * 0.05 + this.maxAnger() * 0.12) * (1 - danger * 0.5) / (1 + d / 7);
        add('vest', g, s * (g.hp > 0 ? 1 : 0.2), shots ? 'Bullets flying. I need that vest.' : 'A vest. Better wear it, just in case.');
      }
    }
    // a helmet lying about: the same, for the head
    if (!me.helmet && !me.donning && me.human && !me.cut.head && me.health.canUse('armA') && me.health.canUse('armB')) {
      const shots = this.gunThreat && now - this.gunThreat.t < 30 ? 0.4 : 0;
      for (const [g] of this.things) {
        if (g.kind !== 'helmet' || g.wornBy || g.removed || g.pos.y - me.pos.y > 0.6) continue;
        const d = Math.abs(g.pos.x - me.pos.x);
        const s = (0.06 + E.fear * 0.22 + shots + (1 - T.bravery) * 0.05 + T.curiosity * 0.04 + this.maxAnger() * 0.1) * (1 - danger * 0.5) / (1 + d / 7);
        add('vest', g, s * (g.hp > 0 ? 1 : 0.2), shots ? 'They are shooting. I want that helmet on.' : 'A helmet. Might as well put it on.');
      }
    }
    // a gun running low, and a box of rounds in sight
    const low = !me.human ? [] : me.guns.filter((g) => g.kind !== 'taser' && g.short > 0);
    if (low.length) {
      for (const [bx] of this.things) {
        if (bx.kind !== 'ammo' || bx.removed || bx.empty || bx.pos.y - me.pos.y > 0.6) continue;
        // only rounds that go in a gun they have
        const fit = low.filter((g) => !bx.fits || bx.fits(g));
        if (!fit.length) continue;
        const need = fit.reduce((n, g) => n + g.short / (g.spec.mag + g.spec.spare), 0) / fit.length;
        const d = Math.abs(bx.pos.x - me.pos.x);
        add('ammo', bx, (0.08 + need * 0.55 + (this.maxAnger() > 0.4 ? 0.15 : 0)) * (1 - danger * 0.6) / (1 + d / 6),
          need > 0.6 ? 'Nearly out. There are rounds in that box.' : 'I could top up from that ammo box.');
      }
    }
    // out of breath: hands on the knees for a moment, if nobody is coming for them
    if (me.stamina < 0.22 && danger < 0.35) add('catchBreath', null, (0.35 + (0.22 - me.stamina) * 2) * (1 - danger), 'I need to get my breath back.');

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
    if (E.fear > 0.8 && E.surprise > 0.35 && brave < 0.4 && !threat) add('panic', null, 0.55, "I don't know what's happening!");
    // whatever else a mod's species has in mind - and whatever a mod has everybody consider
    if (me.species && me.species.consider) me.species.consider(this, add, { threat, threatScore, calm, canFight, fit });
    for (const fn of CONSIDER_HOOKS) fn(this, add, { threat, threatScore, calm, canFight, fit });
    // (only from someone actually coming for them: someone they are just scared of gets kept at a distance)
    if (threat && E.fear > 0.6 && (health < 0.35 || this.cornered(threat)) && this.isHostile(threat)) {
      add('cower', threat, E.fear * (1.1 - brave) * 0.9, "Please don't hurt me...", null, true);
    }
    if (this.heard && now - this.heard.t < 6 && E.fear < 0.45) {
      add('investigate', null, T.curiosity * 0.35 * (1 - E.fear) * calm, 'What was that noise?', { x: this.heard.x });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  /* ---------------------------- holsters, pockets, the law ---------------------------- */

  /**
   * What is in their hand and what is put away. Trouble - somebody after them,
   * somebody they are after, shots - and out comes the best thing they have on
   * them for it; a while after it has passed, it goes back in the holster or
   * the pocket. (An officer on a call gets out what the job needs: police.js.)
   */
  manageKit() {
    const me = this.man, now = this.sb.time;
    if (!me.human || me.cuffed || !me.ready || me.reloading || now < this.kitT) return;
    const b = this.behaviour, kind = b ? b.kind : null;
    if (kind && KIT_BUSY.has(kind)) return;
    // (somebody they are running from is trouble too, out of sight behind them or not)
    const foe = (kind === 'fight' || kind === 'confront' || kind === 'throwKnife' || kind === 'flee' || kind === 'hide') && b.target && !b.target.removed && b.target.kind === 'stickman' ? b.target : null;
    const threat = this.mostDangerousNear(8);
    const gt = this.gunThreat && now - this.gunThreat.t < 10 && this.gunThreat.who !== me;
    const trouble = !!foe || (!!threat && this.isHostile(threat)) || !!gt || this.maxAnger() > 0.55;
    if (trouble) this.calmT = now;
    const w = me.weapon;
    if (trouble) {
      if (!me.kit.length) return;
      const o = foe || threat;
      const d = o ? Math.abs(o.pos.x - me.pos.x) : 6;
      const best = this.bestFor(o, d);
      if (!best) return;
      if (!w) { if (me.drawFrom(best.slot)) this.kitT = now + 1.2; return; }
      // something a lot better put away than what is in the hand: away with this, out with that
      if (best.score > this.kitScore(w, o, d, this.serious(o)) + 0.8 && me.slotFor(w) && me.stow()) this.kitT = now + 0.6;
      return;
    }
    // nothing to be armed for, a while now: it goes away
    if (!w || !me.slotFor(w)) return;
    const wait = me.officer ? 2.5 : 5 + this.traits.aggression * 10;
    if (now - this.calmT > wait && me.stow()) {
      this.kitT = now + 2;
      if (!me.officer && chance(0.4)) this.speak('putAway', { what: ITEM_SAID[w.kind] || 'this' }, 0.5);
    }
  }

  /** Whether it is the kind of trouble that a gun or a blade is for. */
  serious(o) {
    if (!o) return true;
    const r = this.rel(o), now = this.sb.time;
    return r.anger > 0.55 || (this.ordered && this.ordered.target === o) || (this.gunThreat && this.gunThreat.who === o && now - this.gunThreat.t < 10) ||
      (this.isHostile(o) && (!!o.weapon || !!o.innate || this.man.health.overall < 0.5 || r.fear > 0.5 || r.hurtMe > 25));
  }

  /** How good something is to have in the hand against o, d away. */
  kitScore(it, o, d, serious) {
    const k = it.kind;
    if (this.man.officer) {
      // an officer: the taser, unless somebody is about to be killed
      if (isFirearm(k)) return lethal(o) ? 3.5 : 0.3;
      if (k === 'taser') return 2.5;
    }
    if (isFirearm(k)) return it.ammo > 0 ? (serious ? (d > 1.5 ? 3 : 2.4) : 0.4) : 0.2;
    if (k === 'taser') return it.ammo > 0 || it.hooked ? (d < 7 ? 2.2 : 1.2) : 1.1;
    if (k === 'knife') return serious ? (d < 3 ? 2.1 : 1.6) : 0.5;
    if (k === 'machete') return serious ? 2.2 : 0.5;
    if (k === 'knuckles') return 1.4;
    return 1;
  }

  /** The best thing they have put away for this, if anything is worth getting out. */
  bestFor(o, d) {
    const serious = this.serious(o);
    let best = null;
    for (const [slot, it] of this.man.kit) {
      const s = this.kitScore(it, o, d, serious);
      if (s > 0.9 && (!best || s > best.score)) best = { slot, score: s };
    }
    return best;
  }

  /** A crime, as the law tells an officer about it (law.js). */
  learnCrime(c, seen) { copLearn(this, c, seen); }

  /** A crime they saw, kept to tell the first officer they come across. */
  witnessed(c) {
    const w = this.crimesSeen.find((x) => x.c === c);
    if (w) { w.t = this.sb.time; return; }
    this.crimesSeen.push({ c, t: this.sb.time, told: new Set() });
    if (this.crimesSeen.length > 8) this.crimesSeen.shift();
  }

  /** Squaring up to me, swinging at me, pointing a gun at me, or just hit me. */
  isHostile(o) {
    if (!o || o.removed || o.dead || !o.conscious) return false;
    // something with no mind of its own to read: its species says (a boss is after everyone)
    if (o.species && o.species.hostileTo) return o.species.hostileTo(o, this.man);
    if (o.brain && o.brain.fightTarget === this.man) return true;
    if (o.aimTarget === this.man && o.aiming) return true;
    const r = this.rels.get(o);
    if (r && this.sb.time - r.hurtT < 6) return true;
    const a = o.attacking;
    return !!(a && a.target === this.man);
  }

  power(p) {
    const skill = p.traits ? p.traits.skill : 0.5;
    const w = p.armedWith, spec = armOf(w);
    const loaded = !!p.weapon && p.weapon.ammo > 0;
    let armed = w === 'taser' ? (p.gunReady && loaded ? 1.9 : 1.3) : isGun(w) ? (p.gunReady && loaded ? 3 : 1.2) : w === 'machete' ? 2 : w === 'knife' ? 1.8 : spec ? spec.power || 1.8 : w ? 1.45 : 1;
    // a loaded gun in the holster is nearly as good as one in the hand
    if (armed < 2.2 && p.guns && p.guns.some((g) => g !== p.weapon && isFirearm(g.kind) && g.ammo > 0)) armed = 2.2;
    // some of what a mod makes is just stronger than a person (and some weaker)
    const kind = p.species && p.species.power ? p.species.power : 1;
    return p.health.overall * armed * kind * p.strength * powerThreat(p) * (0.7 + skill * 0.5) * (p.carrying ? 0.7 : 1) + 0.02;
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
        (1 - Math.min(0.6, me.health.pain / 150)) * (me.health.dizzy > 0.5 ? 0.5 : 1) * this.awareK(0.25);
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
    return (T.aggression > 0.5 && angry > 0.35) || (this.brave > 0.7 && !!this.mostDangerousNear(5)) || T.aggression > 0.8;
  }

  /** Frozen in place, or tied up: they cannot do anything, but they can still say what they think of it. */
  stuckFast(dt) {
    const me = this.man;
    if (this.behaviour) this.clearBehaviour();
    me.stop();
    this.downTalk -= dt;
    if (this.downTalk > 0) return;
    const choking = me.vit && me.vit.air === 'choke' && me.health.oxygen < 0.94;
    this.downTalk = choking ? rand(1.4, 2.2) : rand(3.5, 6.5);
    if (me.flames) this.speak('onFire', {}, 0.85, null, true);
    else if (choking) this.speak('choking', {}, 0.95, null, true);
    else this.speak(me.frozenInPlace ? 'cantMove' : me.noosed && !me.tied ? 'noosed' : 'tiedUp', {}, 0.7, null, true);
  }

  /** On the floor, crawling, or held up: no behaviour, but still a mind. */
  whileDown(dt) {
    const me = this.man, E = this.emo, now = this.sb.time;
    if (this.behaviour) this.clearBehaviour();
    this.downTalk -= dt;
    if (me.state === 'held') {
      if (this.downTalk <= 0) {
        this.downTalk = rand(2.5, 4.5);
        const choking = me.vit && me.vit.air === 'choke' && me.health.oxygen < 0.94;
        if (choking) this.downTalk = rand(1.4, 2.2);
        // (held up by somebody, with a superpower: a warning, more likely than a scream)
        const bold = !me.flames && !choking && this.courage && chance(this.courage);
        this.speak(me.flames ? 'onFire' : choking ? 'choking' : bold ? 'pwUnafraidHeld' : chance(0.5) ? 'grabbed' : 'fear', {}, choking ? 0.95 : 0.8, null, true);
      }
      return;
    }
    // on fire on the floor: roll, and scream
    if (me.flames) {
      this.begging = false;
      if (me.rolling <= 0 && !me.health.frozen && (me.state === 'down' || me.state === 'crawl')) me.dropAndRoll(rand(2, 3));
      if (this.downTalk <= 0) { this.downTalk = rand(1.2, 2.2); this.speak(me.rolling > 0 && chance(0.4) ? 'stopDropRoll' : 'onFire', {}, 0.85, null, true); }
      return;
    }
    // current going through them: nothing but yelling
    if (me.tased) {
      this.begging = false;
      if (this.downTalk <= 0) { this.downTalk = rand(1.3, 2.4); this.speak('tased', {}, 0.9, null, true); }
      return;
    }
    // in handcuffs on the floor: nowhere to go
    if (me.cuffed) {
      if (this.downTalk <= 0) { this.downTalk = rand(6, 11); this.speak('cuffedTalk', {}, 0.6); }
      if (me.state === 'crawl') me.stop();
      return;
    }
    const threat = this.mostDangerousNear(3);
    const scared = !!threat && E.fear > 0.45 && this.brave < 0.65;
    // playing dead only while they are still coming for them; left alone long enough, they chance it
    const tr = threat && this.rels.get(threat);
    this.stayDown = scared && me.state === 'down' && (this.isHostile(threat) || (tr && now - tr.hurtT < 12));
    this.begging = scared;
    // curled up in a ball, and staying down while it lasts
    const curl = this.curlReason(threat);
    if (curl && !me.balled && !me.health.frozen && me.health.paralysed !== 'all') {
      if (me.rag) me.balled = true;
      else me.curlUp(1.5);
      if (me.balled) {
        this.curlT = now;
        if (!this.curlWhy) this.curlWhy = curl;
        const line = curl === 'beaten' || curl === 'loom' ? 'ballUp' : curl === 'cold' ? 'curlCold' : curl === 'shock' ? 'curlShock' : curl === 'agony' ? 'hurtBig' : 'hitDeck';
        if (this.speak(line, threat ? { other: threat.name } : {}, 0.85, threat, curl !== 'cold' && curl !== 'shock')) this.downTalk = Math.max(this.downTalk, 2.5);
        this.note(curl === 'cold' ? 'So cold. Curl up. Keep warm.' : curl === 'shock' ? "I can't. I just can't." : curl === 'beaten' || curl === 'loom' ? 'Cover up. Protect your head.' : 'Stay down. Stay down.');
      }
    } else if (me.balled && !curl && now - this.curlT > 2) {
      me.balled = false;
      this.curlWhy = null;
    }
    if (me.balled && curl) {
      this.stayDown = true;
      if (me.state === 'crawl') me.stop();
    }
    if (this.downTalk <= 0) {
      this.downTalk = rand(2.5, 4.5);
      const pinned = me.pinnedBy && now - me.pinT < 0.5;
      if (pinned) { this.speak('pinned', {}, 0.9, null, true); this.calledHelp = now; }
      else if (me.health.paralysed === 'all') { this.speak('paralysed', {}, 0.8, null, true); this.calledHelp = now; }
      else if (me.balled && curl === 'cold') this.speak('curlCold', {}, 0.6);
      else if (me.balled && curl === 'shock') this.speak('curlShock', {}, 0.5);
      else if (me.balled && (curl === 'beaten' || curl === 'loom')) { this.speak(chance(0.5) ? 'ballUp' : 'beg', threat ? { other: threat.name } : {}, 0.85, threat, true); }
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

  /**
   * On the floor: a reason to curl up in a ball (and stay curled up), or null.
   *   beaten   somebody is hitting them while they are down
   *   loom     somebody who means them harm standing right over them
   *   fire     being shot at, or something blowing up close by, a moment ago
   *   cold     too cold: curled up, they keep their heat
   *   agony    in too much pain to do anything else
   *   shock    past coping: deep in shock, and frightened
   * The brave (and anybody with a superpower) need more of a reason.
   */
  curlReason(threat) {
    const me = this.man, h = me.health, E = this.emo, now = this.sb.time, brave = this.brave;
    if (!me.conscious || me.flames || me.tased || me.cuffed || me.tied || me.state === 'held') return null;
    if (now - this.beatenT < 2.5 && 0.95 - brave * 0.75 > 0.35) return 'beaten';
    if (threat && this.isHostile(threat) && Math.abs(threat.pos.x - me.pos.x) < 1.8 && !threat.lying && (E.fear - 0.25) * (1.15 - brave) * 1.6 > 0.35) return 'loom';
    const why = this.curlWhy;
    if ((now - this.underFireT < 3 || (now - this.blastT < 3 && this.blastNear > 0.2)) && 0.85 - brave * 0.6 > 0.35) return 'fire';
    if ((h.temp ?? 37) < (why === 'cold' ? 35.8 : 35)) return 'cold';
    if (h.pain > (why === 'agony' ? 60 : 78) && brave < 0.85) return 'agony';
    if (h.shock > (why === 'shock' ? 0.5 : 0.7) && E.fear > 0.4 && brave < 0.8) return 'shock';
    return null;
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

  setEmotion(k, v) { this.emo.set(k, v); }

  /** Locks a feeling where it is: nothing that happens moves it until it is unlocked. */
  lockEmotion(k, on = true) { this.emo.lock(k, on); }

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
