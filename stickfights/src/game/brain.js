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
   ========================================================================== */
import { Emotions } from './emotions.js';
import { line } from './lines.js';
import { PART_NAMES } from './health.js';
import { G } from './stickman.js';
import * as B from './behaviours.js';
import { clamp, clamp01, rand, chance, pick, sign } from '../core/util.js';

const SIGHT = 14;
const BEHIND = 2.2;
// how far away each kind of event can be heard, in metres
const HEAR = {
  hit: 9, death: 12, speech: 9, thud: 8, clatter: 7, knock: 5, swing: 3, knockdown: 10, ko: 10, break: 9,
  spawn: 12, vanish: 12, grabbed: 14, thrown: 14, pickup: 6, throw: 8, land: 4, jump: 3, getup: 6, wake: 6,
};
const HELP_CALLS = new Set(['fear', 'flee', 'beg', 'pinned', 'crawl', 'panic', 'hurtBig', 'broken']);

const standing = (o) => o && !o.removed && o.alive && o.conscious && (o.state === 'stand' || o.state === 'air');

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
    this.begging = false;
    this.stayDown = false;
    this.calledHelp = -99;
    this.spokeT = -99;
    this.lastLine = '';
    this.iconT = -99;
    this.expressT = rand(1, 3);
    this.dodged = new Map();
    this.heard = null;
    this.saidDying = false;
    this.grabbedCount = 0;
    this.downTalk = rand(1, 3);
    // a quirk rather than a trait: some people just like throwing things
    this.throwy = Math.random();
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
      case 'thrown': return 'Flying through the air';
      case 'crawl': return 'Crawling';
      case 'down': return this.stayDown ? 'Staying down' : me.pinnedBy ? 'Pinned under a crate' : 'On the floor';
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
    vars.me = me.name;
    let text = line(kind, vars);
    if (text === this.lastLine) text = line(kind, vars);
    if (!text) return false;
    this.spokeT = now;
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
    const st = me.state;
    if (st === 'down' || st === 'crawl' || st === 'held') { this.whileDown(dt); return; }
    if (st !== 'stand' && st !== 'air' && st !== 'climb') return;
    this.stayDown = false;
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

  canSee(x, y) {
    const me = this.man;
    if (!me.conscious) return false;
    const eye = me.wj.head;
    const dx = x - eye.x, d = Math.abs(dx);
    if (d > SIGHT || Math.abs(y - eye.y) > 9) return false;
    if (d > BEHIND && sign(dx) !== me.facing && !me.lying) return false;
    return this.sb.lineOfSight(eye.x, eye.y, x, y);
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
      r.met = true;
      r.lastSeen = now;
      if (first) this.firstSight(o, r);
      if (o.dead && !this.griefs.has(o)) this.foundBody(o, r);
      if (o.weapon && !r.sawArmed) {
        r.sawArmed = true;
        if (this.isHostile(o) || r.like < -0.2 || r.violent > 0.5) {
          r.fear = clamp01(r.fear + 0.2 * (1.1 - this.traits.bravery));
          this.speak('weaponFear', { other: o.name }, 0.7, o);
        }
      } else if (!o.weapon) r.sawArmed = false;
    }
    for (const k of sb.knuckles) {
      if (k.wornBy) this.things.delete(k);
      else if (this.canSee(k.pos.x, k.pos.y + 0.1)) this.things.set(k, now);
    }
    for (const c of sb.crates) if (this.canSee(c.pos.x, c.pos.y)) this.things.set(c, now);
    for (const t of this.things.keys()) if (t.removed) this.things.delete(t);
    this.updateMood();
  }

  firstSight(o, r) {
    if (o.dead) return;
    this.emo.bump('surprise', 0.12);
    this.note(`There's someone: ${o.name}.`);
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
      if (o.weapon && this.isHostile(o)) E.bump('fear', dt * 0.03 * (1 - T.bravery * 0.6));
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
    const seen = this.canSee(x, y);
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
        if (!seen) this.heard = { x, y, t: now };
        break;
      case 'knockdown':
      case 'ko':
        if (ev.by === me) {
          // putting them down takes the edge off; out cold takes most of it
          E.bump('joy', 0.06 * (0.3 + T.aggression));
          this.victory = Math.min(1, this.victory + 0.3 * T.aggression);
          const r = this.rel(ev.who);
          r.anger *= ev.type === 'ko' ? 0.45 : 0.8;
        } else E.bump('surprise', 0.15);
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
      default:
        break;
    }
  }

  sawHit(ev, seen, x, y) {
    const me = this.man, E = this.emo, T = this.traits, now = this.sb.time;
    const A = ev.by, V = ev.who;
    E.bump('surprise', seen ? 0.12 : 0.06);
    if (!seen) { this.heard = { x, y, t: now }; return; }
    if (!A || A === me || A.removed || !V) return;
    const ra = this.rel(A), rv = this.rel(V);
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
      E.bump('fear', ev.power * 0.035 * (1.2 - T.bravery) * (A.weapon ? 1.5 : 1));
      if (!this.fighting && !this.fleeing) this.speak('witnessHit', {}, 0.15);
    }
    ra.fear = clamp01(ra.fear + ev.power * 0.025 * (1 - T.bravery) * (A.weapon ? 1.6 : 1));
  }

  sawDeath(ev, seen, x, y) {
    const me = this.man, E = this.emo, T = this.traits, now = this.sb.time;
    const V = ev.who, K = ev.by && !ev.by.removed ? ev.by : null;
    if (!V) return;
    if (!seen && Math.abs(V.pos.x - me.pos.x) > 6) { E.bump('surprise', 0.15); this.heard = { x, y, t: now }; return; }
    const rv = this.rel(V);
    const care = Math.max(0, rv.like) + rv.fam * 0.35;
    this.griefs.set(V, { t: now, care, mourned: 0 });
    E.bump('surprise', 0.75);
    E.bump('fear', (0.25 + (K ? 0.15 : 0)) * (1.25 - T.bravery));
    E.bump('sadness', 0.1 + care * 0.75 * (0.5 + T.empathy));
    this.react = 0.35 + rand(0, 0.3);
    this.thinkT = 0;
    if (K === me) {
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
      this.note(`${K.name} killed ${V.name}!`);
    } else {
      this.note(`${V.name} died.`);
    }
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
      case 'armed':
        E.bump('fear', -0.2);
        E.bump('joy', 0.12);
        this.speak('weaponGet', {}, 0.8);
        this.note('Got the brass knuckles. Nobody messes with me now.');
        me.setEmote('sparkle', 1.2);
        break;
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
      r.fear = clamp01(r.fear + sev * 0.28 * (1.15 - T.bravery) * (by.weapon ? 1.6 : 1));
      if (friend) {
        this.speak('betrayed', { other: by.name }, 0.9, by, true);
        this.note(`${by.name} hit me! I thought we were friends.`);
      } else {
        this.note(`${by.name} hit me${d.part === 'head' ? ' in the head' : ''}.`);
      }
    } else if (d.kind === 'impact') {
      this.speak('crateHit', {}, 0.6, null, true);
      this.note('Something hit me out of nowhere!');
      this.blame();
    } else if (d.kind === 'fall' && sev > 0.4) {
      this.note('I hit the ground hard.');
    }
    if (d.res && d.res.broke) this.speak('broken', { part: PART_NAMES[d.part], partKey: d.part }, 1, null, true);
    else if (sev > 0.7) this.speak('hurtBig', {}, 0.8, null, true);
    else if (sev > 0.2) this.speak(chance(0.3) ? 'hurtPart' : 'hurtSmall', { partKey: d.part }, 0.5, null, true);
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
  spokenTo(from, kind) {
    const me = this.man, E = this.emo, T = this.traits, now = this.sb.time;
    if (!me.alive || !me.conscious) return;
    const r = this.rel(from);
    r.met = true;
    r.fam = clamp01(r.fam + 0.06);
    let reply = 'reply';
    if (kind === 'insult' || kind === 'grumpy') {
      const sting = kind === 'insult' ? 1.4 : 0.6;
      r.like = clamp(r.like - 0.1 * sting, -1, 1);
      r.anger = clamp01(r.anger + (0.1 + T.temper * 0.22) * sting);
      E.bump('anger', 0.08 * sting * (0.4 + T.temper));
      E.bump('sadness', 0.04 * (1 - T.temper));
      reply = r.anger > 0.3 && T.aggression > 0.4 ? 'insulted' : 'insultedMeek';
      if (kind === 'insult') this.note(`${from.name} insulted me.`);
    } else if (kind === 'compliment') {
      r.like = clamp(r.like + 0.12, -1, 1);
      E.bump('joy', 0.12);
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
        if (fl > threatScore) { threatScore = fl; threat = o; }
        add('flee', o, fl, `${o.name} scares me. I have to get away!`, null, hostile && d < 4);
      }

      // somebody else's fight
      const ft = o.brain && o.brain.fightTarget;
      if (ft && ft !== me && !ft.removed) {
        const rv = this.rel(ft);
        if (rv.like > 0.3 && T.bravery > 0.35) {
          add('confront', o, rv.like * (0.3 + T.bravery * 0.5) * (1 - E.fear * 0.7) * near, `${o.name} is hurting ${ft.name}!`, { victim: ft });
        } else if (T.curiosity > 0.3 && E.fear < 0.55) {
          add('watch', o, (0.1 + T.curiosity * 0.22) * (1 - E.fear) * near * calm, `A fight! ${o.name} and ${ft.name}.`);
        }
      }

      // talk to them
      if (standing(o) && !hostile && r.anger < 0.3 && r.fear < 0.35 && !(o.brain && (o.brain.fighting || o.brain.fleeing))) {
        const fresh = now - r.chatT > 25 ? 1 : 0.08;
        const s = (0.1 + T.sociability * 0.5) * (0.75 + r.like * 0.8) * (1 - E.anger * 0.6) * (1 - E.fear) *
          (0.7 + this.boredom * 0.6 + this.lonely * 0.5) * (r.greeted ? 1 : 1.4) * fresh / (1 + d / 10);
        add('chat', o, s * calm, r.greeted ? `I'll go talk to ${o.name}.` : `Who's that? I'll say hi to ${o.name}.`);
      }

      // help them
      const pinned = o.pinnedBy && now - o.pinT < 0.5;
      const needs = o.lying || o.state === 'crawl' || pinned || !o.conscious;
      if (needs && !hostile && r.like > -0.2) {
        const cried = now - (r.cried || -99) < 8 ? 1.4 : 1;
        add('help', o, T.empathy * (0.3 + Math.max(0, r.like) * 0.7) * (1 - E.fear * 0.7) * near * cried,
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

    // brass knuckles - grabbed first if they are on the way to someone worth hitting
    if (!me.weapon && me.health.canUse('armA')) {
      const grudge = this.maxAnger();
      const expecting = Math.min(1, threatScore + grudge * 0.6);
      let foeD = Infinity;
      for (const [o, r] of this.rels) if (r.anger > 0.45 && o.alive && !o.removed) foeD = Math.min(foeD, Math.abs(o.pos.x - me.pos.x));
      for (const [k] of this.things) {
        if (k.kind !== 'knuckles' || k.wornBy || k.removed) continue;
        const d = Math.abs(k.pos.x - me.pos.x);
        const onTheWay = d < foeD ? grudge * 0.5 * (0.5 + T.aggression) : 0;
        const s = (0.08 + E.anger * 0.4 * (0.4 + T.aggression) + expecting * 0.35 * (0.3 + T.bravery) +
          T.curiosity * 0.12 + T.aggression * 0.12 + onTheWay) / (1 + d / 7);
        add('arm', k, s, d < 4 ? 'Brass knuckles, right there. Mine.' : 'Those brass knuckles could come in handy.');
      }
    }

    // crates: have a look, climb about
    for (const [c] of this.things) {
      if (c.kind !== 'crate' || c.removed || c.carriedBy) continue;
      const d = Math.abs(c.pos.x - me.pos.x);
      if (!this.inspected.has(c)) add('inspect', c, (0.08 + T.curiosity * 0.3) * (1 - E.fear) * calm / (1 + d / 8), 'A crate. What is that doing here?');
      else if (E.joy > 0.4 && E.fear < 0.3 && me.health.mobility > 0.8) {
        add('play', c, T.curiosity * E.joy * 0.32 * (0.5 + this.boredom) * calm / (1 + d / 5), 'I bet I can climb that crate.');
      }
    }

    // on their own
    add('idle', null, (0.14 + E.sadness * 0.12 + (1 - me.health.mobility) * 0.1) * calm, null);
    add('wander', null, (0.06 + T.curiosity * 0.08 + this.boredom * 0.12) * calm, "Bored. I'll have a look around.");
    if (me.health.pain > 30 && E.fear < 0.5) add('rest', null, (me.health.pain / 100) * 0.7 * (1 - E.fear) * calm, 'I need to sit down for a bit.');
    if (this.victory > 0.2) add('celebrate', null, this.victory * (0.35 + T.aggression * 0.4), 'Ha! I won!');
    if (E.fear > 0.8 && E.surprise > 0.35 && T.bravery < 0.4 && !threat) add('panic', null, 0.55, "I don't know what's happening!");
    if (threat && E.fear > 0.6 && (health < 0.35 || this.cornered(threat))) {
      add('cower', threat, E.fear * (1.1 - T.bravery) * 0.9, "Please don't hurt me...", null, true);
    }
    if (this.heard && now - this.heard.t < 6 && E.fear < 0.45) {
      add('investigate', null, T.curiosity * 0.35 * (1 - E.fear) * calm, 'What was that noise?', { x: this.heard.x });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  /** Squaring up to me, swinging at me, or just hit me. */
  isHostile(o) {
    if (!o || o.removed || o.dead || !o.conscious) return false;
    if (o.brain && o.brain.fightTarget === this.man) return true;
    const r = this.rels.get(o);
    if (r && this.sb.time - r.hurtT < 6) return true;
    const a = o.attacking;
    return !!(a && a.target === this.man);
  }

  power(p) {
    const skill = p.traits ? p.traits.skill : 0.5;
    return p.health.overall * (p.weapon ? 1.45 : 1) * p.strength * (0.7 + skill * 0.5) * (p.carrying ? 0.7 : 1) + 0.02;
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
    for (const k of this.sb.knuckles) if (!k.wornBy && !k.removed) check(k, k.body);
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
    this.stayDown = scared && me.state === 'down';
    this.begging = scared;
    if (this.downTalk <= 0) {
      this.downTalk = rand(2.5, 4.5);
      const pinned = me.pinnedBy && now - me.pinT < 0.5;
      if (pinned) { this.speak('pinned', {}, 0.9, null, true); this.calledHelp = now; }
      else if (scared) this.speak('beg', { other: threat.name }, 0.8, threat, true);
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
