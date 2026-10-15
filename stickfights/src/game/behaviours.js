/* =============================================================================
   The things a stickman can set out to do. The brain (brain.js) scores every
   option it has and picks one; the one it picks runs here, a step at a time,
   until it finishes, fails, or the brain changes its mind.

   Each behaviour only uses the body's verbs (goTo, attack, pickUp, say...),
   so whatever a behaviour wants, the body still decides what is possible.
   ========================================================================== */
import { clamp, rand, randInt, pick, chance, sign } from '../core/util.js';

export class Behaviour {
  constructor(brain, target = null, o = {}) {
    this.brain = brain;
    this.me = brain.man;
    this.sb = brain.man.sandbox;
    this.target = target;
    this.o = o;
    this.t = 0;
  }
  get kind() { return 'idle'; }
  /** What the inspector says they are doing. */
  get label() { return 'Standing around'; }
  /** The thought bubble that goes up when they decide on this. */
  get icon() { return null; }
  start() {}
  /** Runs every step. Returns false when it is over. */
  update(dt) { this.t += dt; return true; }
  end() {}
  get now() { return this.sb.time; }
}

/** Is someone in a state to be talked to, helped, fought? */
const up = (o) => o && !o.removed && o.alive && o.conscious;
const standingUp = (o) => up(o) && (o.state === 'stand' || o.state === 'air' || o.state === 'climb');

/** Which way o is from me, never 0: two people on the same spot still pick opposite sides. */
const side = (me, o) => Math.sign(o.pos.x - me.pos.x) || (me.id < o.id ? 1 : -1);

/** Walks to x; true once there. */
function arrive(me, x, speed = 'walk', tol = 0.12, o = {}) {
  if (Math.abs(me.pos.x - x) <= tol) { me.stop(); return true; }
  me.goTo(x, speed, o);
  return false;
}

/* --------------------------------- just being ------------------------------- */

export class Idle extends Behaviour {
  get kind() { return 'idle'; }
  get label() { return this.what || 'Standing around'; }
  start() {
    this.me.stop();
    this.dur = rand(3, 7);
    this.next = rand(1, 2.5);
  }
  update(dt) {
    this.t += dt;
    const me = this.me, b = this.brain;
    const look = b.nearestVisible((o) => o.alive, 7);
    me.lookAt = look ? look.wj.head : null;
    if (look && chance(dt * 0.25)) me.faceTo(look.pos.x);
    this.next -= dt;
    if (this.next <= 0 && me.ready) {
      this.next = rand(2.5, 5);
      const E = b.emo, opts = ['lookAround', 'scratchHead', 'stretch'];
      if (E.sadness > 0.4) opts.push('sigh', 'sigh');
      if (E.joy > 0.55) opts.push('whistle', 'whistle');
      if (E.joy > 0.78) opts.push('dance');
      if (b.boredom > 0.5) opts.push('bored', 'bored');
      const a = pick(opts);
      if (a === 'lookAround') { me.facing = -me.facing; this.what = 'Looking around'; }
      else if (a === 'whistle') { me.setEmote('music', 2.2); this.what = 'Whistling'; }
      else if (a === 'bored') { b.speak('bored', {}, 0.7); this.what = 'Bored'; }
      else if (a === 'dance') { me.setPosture('dance'); this.danceT = rand(2, 4); this.what = 'Dancing'; }
      else me.perform(a);
    }
    if (this.danceT !== undefined && (this.danceT -= dt) <= 0) { me.setPosture(null); this.danceT = undefined; }
    return this.t < this.dur;
  }
  end() { if (this.me.posture === 'dance') this.me.setPosture(null); }
}

export class Wander extends Behaviour {
  get kind() { return 'wander'; }
  get label() { return 'Wandering about'; }
  start() {
    const me = this.me, sb = this.sb;
    let x = me.pos.x + rand(3, 9) * (chance(0.5) ? 1 : -1);
    const spot = this.brain.somethingToSee();
    if (spot && chance(0.45)) x = spot.x + rand(-1.5, 1.5);
    this.x = clamp(x, sb.left + 1, sb.right - 1);
    this.speed = this.brain.emo.joy > 0.7 && chance(0.3) ? 'run' : 'walk';
    this.stuck = 0;
  }
  update(dt) {
    this.t += dt;
    const me = this.me;
    if (arrive(me, this.x, this.speed, 0.2)) return false;
    this.stuck = Math.abs(me.vel.x) < 0.1 && me.state === 'stand' ? this.stuck + dt : 0;
    return this.t < 16 && this.stuck < 1.5;
  }
}

/**
 * Which edge of crate c is free for me to sit on: -1 or 1, the one nearer me
 * first, or 0 if it is no good for sitting (up on a stack, tipped, sliding,
 * something on it, both edges taken).
 */
export function seatSide(sb, me, c) {
  if (!c || c.removed || c.carriedBy || c.pos.y > c.size * 0.65) return 0;
  // (crateOnTop names a crate before any person, so a person here means no crate)
  const on = sb.crateOnTop(c);
  if (on && on.kind === 'crate') return 0;
  const q = Math.PI / 2, r = ((c.body.rot % q) + q) % q;
  // (someone else hopping up jogs it a little; only a crate on the move is no seat)
  if (Math.min(r, q - r) > 0.12 || Math.hypot(c.body.vel.x, c.body.vel.y) > 1.5) return 0;
  const taken = new Set();
  for (const p of sb.people) {
    if (p !== me && !p.removed && p.support === c.body) taken.add(Math.sign(p.pos.x - c.pos.x) || 1);
  }
  const near = Math.sign(me.pos.x - c.pos.x) || 1;
  return !taken.has(near) ? near : !taken.has(-near) ? -near : 0;
}

/** Sitting down for a while: on the floor, or up on the edge of a crate if one is handy. */
export class Rest extends Behaviour {
  get kind() { return 'rest'; }
  get label() { return this.crate ? 'Sitting on a crate' : 'Resting'; }
  start() {
    this.dur = rand(6, 11);
    const me = this.me, sb = this.sb;
    // a crate on the floor with nothing on it, close by, and legs good enough to get up there
    this.crate = null;
    if (me.health.mobility > 0.7 && me.health.canUse('armA') && me.health.canUse('armB')) {
      const t = this.target;
      this.crate = t && t.kind === 'crate' ? (seatSide(sb, me, t) ? t : null)
        : sb.crates.find((c) => Math.abs(c.pos.x - me.pos.x) < 3.5 && seatSide(sb, me, c)) || null;
    }
    if (!this.crate || me.health.pain > 30) this.brain.speak('rest', {}, 0.6);
    this.sat = 0;
  }
  update(dt) {
    this.t += dt;
    const me = this.me, c = this.crate;
    if (c && (c.removed || c.carriedBy)) return false;
    // knocked off their perch: that is the end of that
    if (this.perched && me.posture !== 'sitEdge') return false;
    if (me.posture === 'sitEdge') this.perched = true;
    if (c && me.posture !== 'sitEdge') {
      if (this.t > 10) { this.crate = null; return true; }
      if (!(me.onGround && me.support === c.body)) { me.goTo(c.pos.x, 'walk', { climb: true }); return true; }
      // up there: shuffle to a free edge, the one they came up by if they can, and sit on it, legs over the side
      const side = seatSide(this.sb, me, c);
      if (!side) {
        if ((this.noSeat = (this.noSeat || 0) + dt) > 1) this.crate = null;
        return true;
      }
      this.noSeat = 0;
      if (!arrive(me, c.pos.x + side * (c.size / 2 - 0.13), 'walk', 0.05)) return true;
      me.facing = side;
      if (me.ready) me.setPosture('sitEdge');
      return true;
    }
    if (!c && me.ready && me.posture !== 'sit') me.setPosture('sit');
    if (me.posture === 'sit' || me.posture === 'sitEdge') {
      this.sat += dt;
      me.health.pain = Math.max(0, me.health.pain - dt * 1.5);
    }
    return this.sat < this.dur;
  }
  end() {
    if (this.me.posture === 'sit' || this.me.posture === 'sitEdge') this.me.setPosture(null);
    if (this.sat > 2) this.brain.restedT = this.now;
  }
}

export class Celebrate extends Behaviour {
  get kind() { return 'celebrate'; }
  get label() { return 'Celebrating'; }
  get icon() { return 'sparkle'; }
  start() {
    const me = this.me;
    me.perform(pick(['cheer', 'laugh', 'cheer']));
    this.brain.speak('victory', {}, 1, null, true);
    me.setEmote('sparkle', 1.5);
    this.brain.victory = 0;
  }
  update(dt) { this.t += dt; return this.t < 2.4; }
}

export class Panic extends Behaviour {
  get kind() { return 'panic'; }
  get label() { return 'Panicking'; }
  get icon() { return 'exclaim'; }
  start() {
    this.brain.speak('panic', {}, 1, null, true);
    this.me.setEmote('sweat', 3);
    this.dur = rand(3, 5);
    this.turn = 0;
  }
  update(dt) {
    this.t += dt;
    if ((this.turn -= dt) <= 0) {
      this.turn = rand(0.8, 1.5);
      this.me.goTo(this.me.pos.x + rand(3, 6) * (chance(0.5) ? 1 : -1), 'flee');
      if (chance(0.4)) this.brain.speak('panic', {}, 0.5, null, true);
    }
    return this.t < this.dur;
  }
}

/* ---------------------------------- people ---------------------------------- */

export class Chat extends Behaviour {
  get kind() { return 'chat'; }
  get label() { return 'Talking to ' + this.target.name; }
  get icon() { return 'chat'; }
  start() {
    this.reply = !!this.o.reply;
    this.turns = randInt(2, 4);
    this.said = 0;
    this.wait = this.reply ? 0 : 0.2;
    this.quiet = 0;
    this.pending = null;
  }
  update(dt) {
    this.t += dt;
    const o = this.target, me = this.me, b = this.brain;
    if (!standingUp(o) || (o.brain && (o.brain.fighting || o.brain.fleeing))) return false;
    const dir = side(me, o), d = Math.abs(o.pos.x - me.pos.x);
    if (d > 1.55) { me.goTo(o.pos.x - dir * 1.1, 'walk'); return this.t < 14; }
    if (d < 0.55) { me.goTo(me.pos.x - dir * 0.5, 'walk', { backpedal: true, face: o.pos.x }); return true; }
    me.stop();
    me.faceTo(o.pos.x);
    me.lookAt = o.wj.head;
    if (this.talkT !== undefined && (this.talkT -= dt) <= 0) {
      if (me.posture === 'talk') me.setPosture(null);
      this.talkT = undefined;
    }
    if (this.reply) {
      if (this.pending && this.now >= this.pending.at) {
        if (this.pending.reply) this.talk(this.pending.reply, this.pending.reply === 'insulted');
        this.pending = null;
        this.quiet = 0;
      }
      this.quiet += dt;
      return this.quiet < 5 && this.t < 16;
    }
    if ((this.wait -= dt) > 0) return true;
    const r = b.rel(o);
    if (this.said >= this.turns) {
      this.talk('farewell');
      r.chatT = this.now;
      if (o.brain) o.brain.rel(me).chatT = this.now;
      if (o.brain) o.brain.spokenTo(me, 'farewell');
      return false;
    }
    let kind;
    if (!r.greeted) {
      kind = r.like > 0.4 ? 'greetFriend' : r.like < -0.25 ? 'greetCold' : 'greet';
      r.greeted = true;
      me.perform('wave');
    } else if (b.emo.anger > 0.45 || r.like < -0.25) {
      kind = chance(0.35 + b.traits.aggression * 0.4) ? 'insult' : 'grumpy';
    } else if (b.traits.aggression > 0.6 && b.traits.temper > 0.55 && chance(0.18)) {
      // teasing that is not taken as teasing
      kind = 'insult';
    } else if (b.emo.sadness > 0.45) {
      kind = 'sadTalk';
    } else if (r.like > 0.3 && chance(0.35)) {
      kind = 'compliment';
    } else {
      kind = 'smalltalk';
    }
    this.talk(kind, kind === 'insult');
    if (o.brain) o.brain.spokenTo(me, kind);
    b.chatted(o, kind);
    this.said++;
    this.wait = rand(2.6, 3.6);
    return true;
  }
  talk(kind, loud = false) {
    const o = this.target;
    this.brain.speak(kind, { other: o.name, absent: this.brain.missing() }, 1, o, loud);
    if (this.me.ready) this.me.setPosture('talk');
    this.talkT = 1.5;
  }
  end() { if (this.me.posture === 'talk') this.me.setPosture(null); }
}

export class Fight extends Behaviour {
  get kind() { return 'fight'; }
  get label() { return (this.brain.rel(this.target).killed ? 'Avenging ' + this.brain.rel(this.target).killed.name + ' on ' : 'Fighting ') + this.target.name; }
  get icon() { return 'fist'; }
  start() {
    const o = this.target, b = this.brain, r = b.rel(o);
    this.cool = rand(0.2, 0.6);
    this.reacted = new Set();
    this.blockT = 0;
    this.downT = 0;
    this.lost = 0;
    if (this.now - (r.foughtT || -99) > 20) {
      if (r.killed) b.speak('avenge', { victim: r.killed.name, other: o.name }, 1, o, true);
      else if (r.hurtMe > 0 && this.now - r.hurtT < 5) b.speak('angryAt', { other: o.name }, 0.8, o, true);
      else b.speak('fightStart', { other: o.name }, 0.8, o, true);
    }
    r.foughtT = this.now;
    this.me.setEmote('anger', 2);
  }
  update(dt) {
    this.t += dt;
    const o = this.target, me = this.me, b = this.brain, T = b.traits;
    if (!o || o.removed || o.dead) return false;
    const r = b.rel(o);
    if (!b.sees(o)) {
      this.lost += dt;
      if (this.lost > 3) return false;
    } else this.lost = 0;
    r.foughtT = this.now;
    me.lookAt = o.wj.head;
    const d = Math.abs(o.pos.x - me.pos.x), dir = side(me, o);

    // they are on the floor: stand over them, maybe finish it
    if (o.lying || !o.conscious || o.state === 'thrown' || o.state === 'held') {
      this.downT += dt;
      // only the truly furious keep going once someone is down, and every blow
      // that lands takes some of the fury out of them
      const merciless = T.aggression > 0.72 && r.anger > 0.82 && !(o.brain && o.brain.begging && T.empathy > 0.4);
      if (merciless && o.lying && me.strikes().includes('stomp')) {
        const spot = o.wj.hip.x - dir * 0.48 * me.scale;
        if (arrive(me, spot, 'walk', 0.1, { jump: false })) {
          me.faceTo(o.wj.hip.x);
          if (me.ready && (this.cool -= dt) <= 0) { me.attack('stomp', o); this.cool = rand(0.6, 1.2); }
        }
        return this.downT < 12;
      }
      me.setPosture('guard');
      if (d < 1.0) me.goTo(o.pos.x - dir * 1.4, 'walk', { backpedal: true, face: o.pos.x });
      else if (d > 2.2) me.goTo(o.pos.x - dir * 1.5, 'walk');
      else { me.stop(); me.faceTo(o.pos.x); }
      if (this.downT > 1 && this.downT - dt <= 1 && chance(0.6)) {
        if (o.brain && o.brain.begging && T.empathy > 0.35) b.speak('spare', { other: o.name }, 1, o);
        else { me.perform('beckon'); b.speak('taunt', { other: o.name }, 0.7, o); }
      }
      if (this.downT > 4.5) {
        r.anger *= 0.55;
        b.won(o);
        return false;
      }
      return true;
    }
    this.downT = 0;

    // they ran off: chase if angry enough
    if (d > 5 && o.brain && o.brain.fleeing) {
      if (r.anger < 0.55 || this.t > 25) { b.won(o); return false; }
      me.setPosture(null);
      me.goTo(o.pos.x, 'run');
      return true;
    }
    if (d > 14) return false;

    me.setPosture('guard');
    // see their punch coming and do something about it
    const inc = o.attacking;
    if (inc && !this.reacted.has(inc) && d < 1.5 && sign(me.pos.x - o.pos.x) === o.facing) {
      this.reacted.add(inc);
      const p = (0.18 + T.skill * 0.5) * (1 - me.health.dizzy * 0.2) * (me.facing === dir ? 1 : 0.3) * (1 - b.emo.anger * 0.3);
      if (me.ready && chance(p)) {
        if (chance(0.62)) { me.block(true); this.blockT = 0.45; }
        else if (me.perform('dodge')) me.vel.x -= dir * 2.4;
      }
    }
    if (this.blockT > 0) {
      this.blockT -= dt;
      me.stop();
      if (this.blockT <= 0) me.block(false);
      return true;
    }

    const reach = 0.86 * me.scale;
    if (d > reach + 0.2) {
      me.goTo(o.pos.x - dir * reach, d > 3 ? 'run' : 'walk', { face: o.pos.x });
    } else if (d < 0.6 * me.scale) {
      me.goTo(me.pos.x - dir * 0.4, 'shuffle', { backpedal: true, face: o.pos.x });
    } else {
      me.stop();
      me.faceTo(o.pos.x);
    }
    // the clock between strikes only runs while not already throwing one; being
    // hit is often the moment to hit back
    if (!me.acting) this.cool -= dt;
    if (me.canCounter && this.now - b.rel(o).hurtT < 0.35 && !this.countered) {
      this.countered = true;
      if (chance(0.25 + T.skill * 0.3 + b.emo.anger * 0.2)) this.cool = 0;
    }
    if (!me.canCounter) this.countered = false;
    if (this.cool <= 0 && (me.ready || me.canCounter) && d < reach + 0.18 && me.facing === dir) {
      const can = me.strikes();
      const choices = [];
      // with brass knuckles on the near hand, that is the hand they lead with
      const armed = me.weapon ? 1 : 0;
      if (can.includes('jab')) choices.push(['jab', armed ? 1.5 : 4]);
      if (can.includes('cross')) choices.push(['cross', armed ? 6 : 3]);
      if (can.includes('kick') && d > 0.75) choices.push(['kick', (1.6 + T.skill) * (armed ? 0.5 : 1)]);
      if (can.includes('uppercut') && d < 0.82) choices.push(['uppercut', armed ? 4 : 2.5]);
      if (choices.length) {
        let total = 0;
        for (const c of choices) total += c[1];
        let x = Math.random() * total, kind = choices[0][0];
        for (const c of choices) { x -= c[1]; if (x <= 0) { kind = c[0]; break; } }
        me.attack(kind, o);
        // quick pairs from the aggressive and the skilled
        const pace = 1.35 - T.aggression * 0.45 - b.emo.anger * 0.3 - T.skill * 0.15;
        this.cool = rand(0.4, 1.1) * Math.max(0.5, pace);
      } else {
        this.cool = 1;
      }
    }
    if (r.anger < 0.12 && !b.isHostile(o) && this.t > 3) return false;
    return true;
  }
  end() {
    this.me.block(false);
    if (this.me.posture === 'guard') this.me.setPosture(null);
    this.me.lookAt = null;
  }
}

/**
 * Getting away from someone. From someone who is after them it is a run,
 * screaming; from someone dangerous who is not (yet), it is a brisk walk to
 * a safer distance.
 */
export class Flee extends Behaviour {
  get kind() { return 'flee'; }
  get label() { return (this.calm ? 'Keeping away from ' : 'Running from ') + this.target.name; }
  get icon() { return this.calm ? 'eye' : 'run'; }
  start() {
    this.calm = !this.brain.isHostile(this.target);
    if (!this.calm) {
      this.brain.speak('flee', { other: this.target.name }, 0.8, null, true);
      this.me.setEmote('sweat', 2.5);
    }
    this.me.setPosture(null);
    this.safe = 0;
    this.yell = rand(2, 4);
  }
  update(dt) {
    this.t += dt;
    const o = this.target, me = this.me, b = this.brain, sb = this.sb;
    if (!o || o.removed) return false;
    const away = sign(me.pos.x - o.pos.x) || -me.facing;
    const gap = Math.abs(me.pos.x - o.pos.x);
    const room = away > 0 ? sb.right - me.pos.x : me.pos.x - sb.left;
    if (room < 1.4 && gap < 4) {
      // cornered: slip past them, or curl up
      if (b.traits.bravery > 0.45 && !o.attacking && chance(0.5)) { me.goTo(o.pos.x - away * 5, 'flee'); return true; }
      b.force(new Cower(b, o));
      return true;
    }
    // a crate to get behind?
    if (gap > 2.5 && this.t > 0.8 && !this.triedHide) {
      this.triedHide = true;
      const c = b.coverFrom(o);
      if (c) { b.force(new Hide(b, o, { crate: c })); return true; }
    }
    const hunted = b.isHostile(o) && b.sees(o);
    if (hunted) this.calm = false;
    if (this.calm) {
      if (gap > 7.5) { me.stop(); me.faceTo(o.pos.x); me.lookAt = o.wj.head; }
      else me.goTo(me.pos.x + away * 4, 'walk');
    } else {
      me.goTo(me.pos.x + away * 6, 'flee');
      if ((this.yell -= dt) <= 0) { this.yell = rand(3, 5); b.speak(chance(0.5) ? 'fear' : 'flee', { other: o.name }, 0.7, null, true); }
    }
    this.safe = gap > (this.calm ? 7 : 8) && !hunted ? this.safe + dt : 0;
    if (!o.alive || !o.conscious) this.safe += dt * 2;
    return this.safe < 2 && this.t < 30;
  }
}

export class Hide extends Behaviour {
  get kind() { return 'hide'; }
  get label() { return 'Hiding from ' + this.target.name; }
  get icon() { return 'crate'; }
  start() {
    this.crate = this.o.crate;
    this.brain.speak('hide', {}, 0.5);
    this.peek = rand(2.5, 4);
    this.unseen = 0;
  }
  update(dt) {
    this.t += dt;
    const o = this.target, me = this.me, b = this.brain, c = this.crate;
    if (!o || o.removed || c.removed || c.carriedBy) return false;
    const side = sign(c.pos.x - o.pos.x) || 1;
    const spot = c.pos.x + side * (c.size / 2 + 0.32);
    if (Math.abs(me.pos.x - o.pos.x) < 1.8) { b.force(new Flee(b, o)); return true; }
    if (!arrive(me, spot, 'flee', 0.15)) return true;
    me.facing = -side;
    this.peek -= dt;
    if (this.peek > 0) { if (me.ready && me.posture !== 'cower') me.setPosture('cower'); }
    else {
      if (me.posture === 'cower') me.setPosture(null);
      me.lookAt = o.wj.head;
      if (this.peek < -1.2) this.peek = rand(3, 5);
    }
    this.unseen = b.sees(o) && b.isHostile(o) ? 0 : this.unseen + dt;
    return this.unseen < 7 && this.t < 40;
  }
  end() { if (this.me.posture === 'cower') this.me.setPosture(null); }
}

export class Cower extends Behaviour {
  get kind() { return 'cower'; }
  get label() { return 'Cowering from ' + this.target.name; }
  get icon() { return 'sweat'; }
  start() {
    this.brain.begging = true;
    this.brain.speak('beg', { other: this.target.name }, 1, this.target, true);
    this.next = rand(2.5, 4);
    this.calm = 0;
  }
  update(dt) {
    this.t += dt;
    const o = this.target, me = this.me, b = this.brain;
    if (!o || o.removed) return false;
    if (me.ready && me.posture !== 'cower' && me.posture !== 'beg') me.setPosture(Math.abs(o.pos.x - me.pos.x) < 2 && chance(0.5) ? 'beg' : 'cower');
    me.stop();
    me.facing = sign(o.pos.x - me.pos.x) || me.facing;
    const near = Math.abs(o.pos.x - me.pos.x) < 4 && o.alive && o.conscious && b.isHostile(o);
    if (near && (this.next -= dt) <= 0) { this.next = rand(3, 5); b.speak('beg', { other: o.name }, 0.8, o, true); }
    this.calm = near ? 0 : this.calm + dt;
    return this.calm < 3 && this.t < 30;
  }
  end() {
    this.brain.begging = false;
    if (this.me.posture === 'cower' || this.me.posture === 'beg') this.me.setPosture(null);
  }
}

export class Confront extends Behaviour {
  get kind() { return 'confront'; }
  get label() { return 'Standing up to ' + this.target.name; }
  get icon() { return 'exclaim'; }
  start() { this.shouted = false; }
  update(dt) {
    this.t += dt;
    const a = this.target, v = this.o.victim, me = this.me, b = this.brain;
    if (!up(a) || !v || v.removed) return false;
    const still = a.brain && a.brain.fightTarget === v;
    if (!still && this.t > 1) return false;
    const dir = sign(a.pos.x - me.pos.x);
    if (!arrive(me, a.pos.x - dir * 1.6, 'run', 0.3)) return this.t < 10;
    me.faceTo(a.pos.x);
    me.lookAt = a.wj.head;
    if (!this.shouted && me.ready) {
      this.shouted = true;
      me.perform('point');
      b.speak(v.dead ? 'witnessDeath' : 'defendFriend', { victim: v.name, other: a.name }, 1, a, true);
    }
    // they keep at it: it gets personal
    if (this.t > 3) b.rel(a).anger = Math.min(1, b.rel(a).anger + dt * 0.12);
    return this.t < 8;
  }
}

export class Watch extends Behaviour {
  get kind() { return 'watch'; }
  get label() { return 'Watching ' + this.target.name + ' fight'; }
  get icon() { return 'eye'; }
  start() { this.dur = rand(6, 11); this.next = rand(1.5, 3); }
  update(dt) {
    this.t += dt;
    const a = this.target, me = this.me, b = this.brain;
    if (!up(a) || !a.brain || !a.brain.fighting) return false;
    const foe = a.brain.fightTarget;
    const cx = foe ? (a.pos.x + foe.pos.x) / 2 : a.pos.x;
    const side = sign(me.pos.x - cx) || 1;
    const want = cx + side * 3.4;
    if (Math.abs(me.pos.x - cx) < 2.4 || Math.abs(me.pos.x - cx) > 5) me.goTo(want, 'walk');
    else { me.stop(); me.faceTo(cx); }
    me.lookAt = a.wj.head;
    if ((this.next -= dt) <= 0) {
      this.next = rand(3, 5);
      const ra = b.rel(a), rf = foe ? b.rel(foe) : null;
      if (ra.like > 0.3 && rf && rf.like < 0.1) b.speak('cheerFriend', { other: a.name }, 0.7, a, true);
      else if (b.traits.empathy > 0.6) b.speak('stopFight', {}, 0.6, null, true);
      else b.speak('witnessHit', {}, 0.4);
    }
    return this.t < this.dur;
  }
}

export class Help extends Behaviour {
  get kind() { return 'help'; }
  get label() { return 'Helping ' + this.target.name; }
  get icon() { return 'cross'; }
  start() { this.there = 0; this.next = 0; }
  update(dt) {
    this.t += dt;
    const o = this.target, me = this.me, b = this.brain;
    if (!o || o.removed || o.dead) return false;
    const pinned = o.pinnedBy && this.now - o.pinT < 0.5;
    const needs = o.lying || o.state === 'crawl' || pinned || o.health.overall < 0.45;
    if (!needs && this.there > 0.5) return false;
    const side = sign(me.pos.x - o.wj.hip.x) || 1;
    if (!arrive(me, o.wj.hip.x + side * 0.62, 'run', 0.18)) return this.t < 15;
    this.there += dt;
    me.faceTo(o.wj.hip.x);
    me.lookAt = o.wj.head;
    if (pinned && o.pinnedBy && o.pinnedBy.body) {
      // shove the thing off them
      if (me.posture === 'kneel') me.setPosture(null);
      const c = o.pinnedBy.body;
      c.applyImpulse(-side * 55 * dt * 10, 70 * dt * 10, c.pos.x, c.pos.y);
    } else if (o.lying && me.ready && me.posture !== 'kneel') {
      me.setPosture('kneel');
    }
    if ((this.next -= dt) <= 0) {
      this.next = rand(2.5, 3.5);
      b.speak(pinned ? 'pinned' : 'comfort', { other: o.name }, 0.9, o);
    }
    if (this.there > 1.2) {
      if (o.state === 'down') o.downT = Math.min(o.downT, 0.3);
      if (o.state === 'ko') o.health.conscious += dt * 0.15;
      if (o.brain && !this.thanked && o.state === 'getup') { this.thanked = true; o.brain.helpedBy(me); }
    }
    return this.t < 14 && this.there < 9;
  }
  end() { if (this.me.posture === 'kneel') this.me.setPosture(null); }
}

export class Mourn extends Behaviour {
  get kind() { return 'mourn'; }
  get label() { return 'Mourning ' + this.target.name; }
  get icon() { return 'tear'; }
  start() { this.there = 0; this.next = 0.5; this.dur = rand(9, 15); }
  update(dt) {
    this.t += dt;
    const c = this.target, me = this.me, b = this.brain;
    if (!c || c.removed) return false;
    const side = sign(me.pos.x - c.wj.neck.x) || 1;
    if (!arrive(me, c.wj.neck.x + side * 0.7, 'walk', 0.2)) return this.t < 20;
    this.there += dt;
    me.faceTo(c.wj.neck.x);
    me.lookAt = c.wj.head;
    if (me.ready) me.setPosture(this.there < 2.5 ? 'kneel' : 'cry');
    b.emo.bump('sadness', dt * 0.015);
    if ((this.next -= dt) <= 0) { this.next = rand(4, 6); b.speak('grief', { victim: c.name }, 0.8); }
    const g = b.griefs.get(c);
    if (g) g.mourned += dt;
    return this.there < this.dur;
  }
  end() { if (this.me.posture === 'kneel' || this.me.posture === 'cry') this.me.setPosture(null); }
}

/* ---------------------------------- things ---------------------------------- */

export class Arm extends Behaviour {
  get kind() { return 'arm'; }
  get label() { return 'Going for the brass knuckles'; }
  get icon() { return 'knuckles'; }
  start() { this.tries = 0; }
  update(dt) {
    this.t += dt;
    const k = this.target, me = this.me, b = this.brain;
    if (me.weapon) return false;
    if (k.removed || k.wornBy) {
      if (k.wornBy && k.wornBy !== me) b.note(k.wornBy.name + ' got the brass knuckles first.');
      return false;
    }
    if (me.acting) return true;
    const dir = sign(k.pos.x - me.pos.x) || me.facing;
    const spot = k.pos.x - dir * 0.42 * me.scale;
    if (Math.abs(k.pos.y - me.pos.y) > 0.45) return this.t < 12 && arrive(me, k.pos.x, 'walk') === false;
    const hurry = b.emo.anger > 0.5 || b.emo.fear > 0.4;
    if (!arrive(me, spot, hurry ? 'run' : 'walk', 0.1)) return this.t < 15;
    me.facing = dir;
    if (me.ready && me.pickUp(k)) this.tries++;
    return this.tries < 4 && this.t < 15;
  }
}

export class Inspect extends Behaviour {
  get kind() { return 'inspect'; }
  get label() { return 'Looking at ' + (this.target.kind === 'stickman' ? this.target.name + "'s body" : 'the ' + this.target.name.toLowerCase()); }
  get icon() { return 'question'; }
  start() { this.done = false; }
  update(dt) {
    this.t += dt;
    const th = this.target, me = this.me, b = this.brain;
    if (th.removed || (th.kind === 'knuckles' && th.wornBy) || (th.kind === 'crate' && th.carriedBy)) return false;
    const x = th.kind === 'stickman' ? th.wj.hip.x : th.pos.x;
    const half = th.kind === 'crate' ? th.size / 2 : 0;
    const dir = sign(x - me.pos.x) || me.facing;
    if (!this.done && !arrive(me, x - dir * (half + 0.55), 'walk', 0.18, { jump: false, climb: false })) return this.t < 14;
    me.facing = dir;
    if (!this.done && me.ready) {
      this.done = true;
      b.inspected.add(th);
      if (th.kind === 'crate') { me.perform('knock'); b.speak('crate', {}, 0.7); }
      else if (th.kind === 'knuckles') { me.perform('inspect'); b.speak('weaponSee', {}, 0.7); }
      else { me.perform('inspect'); b.speak(b.rel(th).like > 0.2 ? 'grief' : 'scaredOfDead', { victim: th.name }, 0.8); }
      this.until = this.t + 1.8;
    }
    return !this.done || this.t < this.until;
  }
}

export class Play extends Behaviour {
  get kind() { return 'play'; }
  get label() { return 'Climbing on a crate'; }
  get icon() { return 'crate'; }
  start() { this.phase = 'go'; this.timer = 0; }
  update(dt) {
    this.t += dt;
    const c = this.target, me = this.me, b = this.brain;
    if (c.removed || c.carriedBy) return false;
    if (this.phase === 'go') {
      const onIt = me.onGround && me.support && me.pos.y > 0.5;
      if (onIt) { this.phase = 'top'; this.timer = rand(2, 4); me.stop(); b.speak('crateTop', {}, 0.8, null, true); if (chance(0.5)) me.perform('cheer'); return true; }
      me.goTo(c.pos.x, 'walk', { jump: true, climb: true });
      return this.t < 12;
    }
    if (this.phase === 'top') {
      me.stop();
      if ((this.timer -= dt) <= 0) {
        const dir = chance(0.5) ? 1 : -1;
        me.facing = dir;
        if (me.jump(dir * 2.6, 6.2)) { b.speak('jumpOff', {}, 0.9, null, true); this.phase = 'jump'; }
        else if (!me.acting) { me.goTo(me.pos.x + dir * 1.5, 'walk'); this.phase = 'jump'; }
      }
      return true;
    }
    return !(me.onGround && me.state === 'stand' && this.t > 0.5 && me.pos.y < 0.1);
  }
}

export class ThrowCrate extends Behaviour {
  get kind() { return 'throw'; }
  get label() { return 'Throwing a crate at ' + this.target.name; }
  get icon() { return 'crate'; }
  start() { this.crate = this.o.crate; this.tries = 0; this.thrown = false; }
  update(dt) {
    this.t += dt;
    const o = this.target, me = this.me, b = this.brain, c = this.crate;
    if (!o || o.removed || o.dead) { me.dropCarried(); return false; }
    if (this.thrown) return me.acting && this.t < 20;
    if (me.carrying !== c) {
      if (me.carrying || c.removed || c.carriedBy || this.tries > 3) return false;
      if (me.acting) return true;
      const dir = sign(c.pos.x - me.pos.x) || 1;
      if (!arrive(me, c.pos.x - dir * (c.size / 2 + 0.22), 'run', 0.08, { jump: false, climb: false })) return this.t < 12;
      if (me.ready) { if (me.lift(c)) this.tries++; else this.tries += 0.5; }
      return true;
    }
    const d = Math.abs(o.pos.x - me.pos.x), dir = sign(o.pos.x - me.pos.x);
    if (d > 6) { me.goTo(o.pos.x - dir * 4.5, 'walk'); return this.t < 25; }
    if (d < 1.6) { me.goTo(me.pos.x - dir * 1.5, 'walk', { backpedal: true, face: o.pos.x }); return this.t < 25; }
    me.stop();
    if (!me.acting && me.throwAt(o.pos.x, o.wj.hip.y + 0.25)) {
      this.thrown = true;
      b.speak('throwCrate', { other: o.name }, 0.8, o, true);
    }
    return this.t < 25;
  }
  end() { if (this.me.carrying === this.crate && !this.thrown) this.me.dropCarried(); }
}

export class Investigate extends Behaviour {
  get kind() { return 'investigate'; }
  get label() { return 'Checking out a noise'; }
  get icon() { return 'question'; }
  start() {
    this.x = clamp(this.o.x, this.sb.left + 0.5, this.sb.right - 0.5);
    this.brain.speak('investigate', {}, 0.6);
    this.looked = 0;
  }
  update(dt) {
    this.t += dt;
    const me = this.me;
    if (!arrive(me, this.x, 'walk', 0.8)) return this.t < 12;
    this.looked += dt;
    if (this.looked > 1.2 && this.looked - dt <= 1.2) me.facing = -me.facing;
    return this.looked < 2.6;
  }
}

/** For a quick look-up of what a behaviour is called, by kind. */
export const KINDS = {
  idle: Idle, wander: Wander, rest: Rest, celebrate: Celebrate, panic: Panic, chat: Chat,
  fight: Fight, flee: Flee, hide: Hide, cower: Cower, confront: Confront, watch: Watch,
  help: Help, mourn: Mourn, arm: Arm, inspect: Inspect, play: Play, throw: ThrowCrate,
  investigate: Investigate,
};

