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

/** Is o coming in to hug me, high five me or shake my hand? */
const leading = (o, me) => {
  const b = o.brain && o.brain.behaviour;
  return !!(b && b.kind === 'chat' && b.target === me && b.gesture);
};

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
    // hurting, they hold whatever hurts - and holding a wound slows the bleeding a little
    const h = me.health;
    const stump = Object.keys(me.cut).length > 0 && h.bleeding > 0.001;
    const sore = h.shock > 0.55 ? 'shock' : stump ? 'clutchStump' : !h.canUse('armA') || !h.canUse('armB') ? 'clutchArm'
      : h.blood < 0.62 ? 'shiver' : h.bones.ribs.broken || h.internal > 0.001 || h.parts.torso.hp < 70 ? 'clutchStomach' : null;
    if (sore && me.ready && !this.pose) {
      me.setPosture(sore); this.pose = sore; this.poseT = rand(3, 6);
      this.what = sore === 'shiver' ? 'Shivering' : sore === 'shock' ? 'In shock' : sore === 'clutchStump' ? 'Holding the stump' : 'Holding where it hurts';
    }
    if (me.posture === 'clutchStump' || me.posture === 'clutchArm' || me.posture === 'clutchStomach') h.selfPress = Math.max(h.selfPress, 0.3);
    if (this.next <= 0 && me.ready && !this.pose) {
      this.next = rand(2.5, 5);
      const E = b.emo, T = b.traits, opts = ['lookAround', 'scratchHead', 'stretch', 'armsCrossed', 'handsOnHips'];
      if (E.sadness > 0.4) opts.push('sigh', 'sigh');
      if (E.joy > 0.55) opts.push('whistle', 'whistle', 'thumbsUp');
      if (E.joy > 0.78) opts.push('dance');
      if (b.boredom > 0.5) opts.push('bored', 'bored', 'yawn', 'tapFoot', 'kickDirt');
      if (T.aggression > 0.6 && E.fear < 0.3) opts.push('shadowbox');
      if (T.aggression > 0.5 && E.joy > 0.5) opts.push('flex');
      if (b.sawSky && this.now - b.sawSky < 30) opts.push('lookUp', 'lookUp');
      const a = pick(opts);
      if (a === 'lookAround') { me.facing = -me.facing; this.what = 'Looking around'; }
      else if (a === 'whistle') { me.setEmote('music', 2.2); this.what = 'Whistling'; }
      else if (a === 'bored') { b.speak('bored', {}, 0.7); this.what = 'Bored'; }
      else if (a === 'dance') { me.setPosture('dance'); this.pose = 'dance'; this.poseT = rand(2, 4); this.what = 'Dancing'; }
      else if (a === 'armsCrossed' || a === 'handsOnHips' || a === 'shadowbox') {
        me.setPosture(a); this.pose = a; this.poseT = rand(2.5, 5);
        this.what = a === 'shadowbox' ? 'Shadowboxing' : 'Standing around';
      } else if (a === 'lookUp') { me.perform('lookUp'); b.speak('lookUp', {}, 0.5); this.what = 'Looking up at the sky'; }
      else me.perform(a);
    }
    if (this.pose && (this.poseT -= dt) <= 0) { if (this.me.posture === this.pose) me.setPosture(null); this.pose = null; }
    return this.t < this.dur;
  }
  end() { if (this.pose && this.me.posture === this.pose) this.me.setPosture(null); }
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
    me.perform(pick(['cheer', 'laugh', 'cheer', 'flex', 'flex']));
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
    // a hug or a high five gets them closer than talking does
    if (this.gesture) return this.doGesture(dt);
    // ...and when the other one comes in for one, they stay put for it
    if (leading(o, me)) {
      me.stop();
      me.faceTo(o.pos.x);
      me.lookAt = o.wj.head;
      this.quiet = 0;
      return true;
    }
    // they said goodbye first
    if (this.bye) return false;
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
      // friends part with a high five, good friends with a hug - and only
      // then is the talk over
      const back = o.brain ? o.brain.rel(me).like : 0;
      if (r.like > 0.62 && back > 0.5 && chance(0.6)) this.gesture = { kind: 'hug', gap: 0.4, t: 0 };
      else if (r.like > 0.38 && back > 0.25 && chance(r.like > 0.62 ? 0.75 : 0.5)) this.gesture = { kind: 'highFive', gap: 0.72, t: 0 };
      if (this.gesture) return true;
      this.part();
      return false;
    }
    let kind, vars = null, mem = null, mine = null;
    if (!r.greeted) {
      kind = r.like > 0.4 ? 'greetFriend' : r.like < -0.25 ? 'greetCold' : 'greet';
      r.greeted = true;
      // a stranger gets a handshake from the polite, a wave from everyone else
      if (kind === 'greet' && r.fam < 0.1 && b.traits.sociability > 0.45 && chance(0.6)) this.gesture = { kind: 'handshake', gap: 0.78, t: 0, then: true };
      else me.perform('wave');
    } else if (b.emo.anger > 0.45 || r.like < -0.25) {
      kind = chance(0.35 + b.traits.aggression * 0.4) ? 'insult' : 'grumpy';
    } else if (b.traits.aggression > 0.6 && b.traits.temper > 0.55 && chance(0.18)) {
      // teasing that is not taken as teasing
      kind = 'insult';
    } else if ((mem = b.gossipFor(o)) && chance(0.45)) {
      // passing on what they know about someone else
      kind = mem.v < 0 ? 'gossipBad' : 'gossipGood';
      vars = { victim: mem.who.name, what: b.memoryPhrase(mem) };
      mem.told.add(o);
    } else if (!this.reminded && (mine = b.strongestAbout(o)) && mine.w > 0.4 && b.memoryPhrase(mine) && chance(0.35)) {
      // something between the two of them
      this.reminded = true;
      kind = mine.v < 0 ? 'remindBad' : 'remindGood';
      vars = { what: b.memoryPhrase(mine) };
    } else if (b.emo.sadness > 0.45) {
      kind = 'sadTalk';
    } else if (r.like > 0.3 && chance(0.35)) {
      kind = 'compliment';
    } else {
      kind = 'smalltalk';
    }
    this.talk(kind, kind === 'insult', vars);
    if (o.brain) o.brain.spokenTo(me, kind, mem ? { mem } : null);
    b.chatted(o, kind);
    this.said++;
    this.wait = rand(2.6, 3.6);
    return true;
  }
  /** Two people doing something together: they get to the right distance, then both do it. */
  doGesture(dt) {
    const g = this.gesture, me = this.me, o = this.target;
    g.t += dt;
    const dir = side(me, o), d = Math.abs(o.pos.x - me.pos.x);
    if (g.t > 4.5 || !o.ready && !g.done && g.t > 2.5) {
      this.gesture = null;
      me.hugging = o.hugging = null;
      if (g.then) return true;
      this.part();
      return false;
    }
    if (!g.done) {
      if (Math.abs(d - g.gap) > 0.06) { me.hugging = g.kind === 'hug' ? o : null; o.hugging = me.hugging ? me : null; me.goTo(o.pos.x - dir * g.gap, 'walk', { face: o.pos.x }); return true; }
      me.stop();
      me.faceTo(o.pos.x);
      if (!me.ready || !o.ready) return true;
      o.faceTo(me.pos.x);
      me.perform(g.kind);
      o.perform(g.kind);
      if (g.kind === 'hug') { this.brain.remember('hugged', o); if (o.brain) o.brain.remember('hugged', me); }
      g.done = true;
      g.until = g.t + CLIP_TIME[g.kind];
      this.brain.speak(g.kind, { other: o.name }, 0.8, o);
      this.brain.emo.bump('joy', 0.12);
      if (o.brain) { o.brain.emo.bump('joy', 0.1); o.brain.rel(me).like = clamp(o.brain.rel(me).like + 0.06, -1, 1); }
      return true;
    }
    if (g.t < g.until) return true;
    me.hugging = null;
    o.hugging = null;
    this.gesture = null;
    // a handshake is a hello: the talking comes after it
    if (g.then) return true;
    this.part();
    return false;
  }

  /** The talk is over: neither of them wants another one for a while. */
  part() {
    const o = this.target, me = this.me;
    this.brain.rel(o).chatT = this.now;
    if (o.brain) { o.brain.rel(me).chatT = this.now; o.brain.spokenTo(me, 'farewell'); }
  }

  talk(kind, loud = false, vars = null) {
    const o = this.target;
    this.brain.speak(kind, { other: o.name, absent: this.brain.missing(), ...(vars || {}) }, 1, o, loud);
    if (this.me.ready) this.me.setPosture('talk');
    this.talkT = 1.5;
  }
  end() {
    if (this.me.posture === 'talk') this.me.setPosture(null);
    if (this.me.hugging) { this.me.hugging.hugging = null; this.me.hugging = null; }
  }
}

const CLIP_TIME = { hug: 1.8, highFive: 0.85, handshake: 0.9 };

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
    const gun = me.gunReady && !!me.weapon && me.weapon.ammo > 0;

    // they are on the floor: stand over them, maybe finish it
    if (o.lying || !o.conscious || o.state === 'thrown' || o.state === 'held') {
      this.downT += dt;
      if (gun) {
        // a gun kept on them, from out of reach
        me.setPosture(null);
        me.aimAt(o);
        if (d < 2) me.goTo(o.pos.x - dir * 3, 'walk', { backpedal: true, face: o.pos.x });
        else { me.stop(); me.faceTo(o.pos.x); }
        if (this.downT > 1.2 && this.downT - dt <= 1.2) b.speak('taunt', { other: o.name }, 0.7, o);
        if (this.downT > 4.5) { r.anger *= 0.55; b.won(o); return false; }
        return true;
      }
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

    // a mod's species fights its own way: hands that change, a tail, wings. It
    // says whether it took care of things this step (true or false), or leaves it (undefined)
    if (me.species && me.species.fight) {
      const own = me.species.fight(this, dt, o, d, dir, r);
      if (own !== undefined) return own;
    }

    // they ran off: chase if angry enough
    if (d > 5 && o.brain && o.brain.fleeing) {
      if (r.anger < 0.55 || this.t > 25) { b.won(o); return false; }
      me.setPosture(null);
      me.goTo(o.pos.x, 'run');
      return true;
    }
    if (d > 14) return false;
    if (gun) return this.shoot(dt, o, d, dir, r);

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

    const knife = me.armedWith === 'knife', machete = me.armedWith === 'machete';
    const reach = (machete ? 1.1 : knife ? 0.98 : 0.86) * me.scale;
    // a gun pointed at them: standing off is the worst thing to do, so they rush it
    const gunOnMe = o.aiming && o.aimTarget === me;
    if (gunOnMe && !this.rushed) { this.rushed = true; b.speak('rushGun', { other: o.name }, 0.8, o, true); }
    if (gunOnMe) this.cool = Math.min(this.cool, 0.15);
    // (stepping in starts inside the distance a blow can land from, so there is
    // no gap between the two where they would just stand and look at each other)
    if (d > reach + 0.12) {
      me.goTo(o.pos.x - dir * reach, d > 3 || gunOnMe ? 'run' : 'walk', { face: o.pos.x });
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
      // with brass knuckles on the near hand, that is the hand they lead with;
      // with a knife in it, they mostly use the knife
      const armed = me.weapon ? 1 : 0;
      if (can.includes('jab')) choices.push(['jab', knife || machete ? 0.8 : armed ? 1.5 : 4]);
      if (can.includes('cross')) choices.push(['cross', armed ? 6 : 3]);
      if (can.includes('stab')) choices.push(['stab', 5.5]);
      if (can.includes('slash')) choices.push(['slash', 3]);
      if (can.includes('chop')) choices.push(['chop', 5]);
      if (can.includes('hack')) choices.push(['hack', 3.5]);
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
  /**
   * Fighting with a pistol: out of reach, brought up, and fired - a few at a
   * time, waiting for the aim to settle in between. The ones who would rather
   * not start by pointing it and shouting, and someone who puts their hands
   * up may be left at that. Empty, it gets reloaded, at a distance.
   */
  shoot(dt, o, d, dir, r) {
    const me = this.me, b = this.brain, T = b.traits, g = me.weapon;
    if (r.anger < 0.12 && !b.isHostile(o) && this.t > 3 && !(b.ordered && b.ordered.target === o)) return false;
    if (me.posture === 'guard') me.setPosture(null);
    me.lookAt = o.wj.head;
    if (g.mag <= 0) {
      me.lowerGun();
      if (d < 3.5) me.goTo(me.pos.x - dir * 3, 'run');
      else { me.stop(); me.faceTo(o.pos.x); }
      if (!me.reloading && me.reload()) b.speak('reload', {}, 0.7, null, true);
      return true;
    }
    const want = 3.5 + T.skill * 2.5;
    const seen = b.sees(o);
    if (d < 1.6) me.goTo(me.pos.x - dir * 2, 'walk', { backpedal: true, face: o.pos.x });
    else if (d > 10 || !seen) me.goTo(o.pos.x - dir * want, 'walk', { face: o.pos.x });
    else { me.stop(); me.faceTo(o.pos.x); }
    if (!seen) { me.lowerGun(); return true; }
    me.aimAt(o);
    // the warning: not everyone shoots first
    if (this.warn === undefined) {
      const go = b.isHostile(o) || (b.ordered && b.ordered.target === o);
      this.warn = go ? 0 : Math.max(0, (0.6 + T.empathy * 2.5 - T.aggression * 1.2) * rand(0.7, 1.3));
      if (this.warn > 0.3) b.speak('aimAt', { other: o.name }, 1, o, true);
      else b.speak('shootStart', { other: o.name }, 0.7, o, true);
    }
    if (this.warn > 0) {
      this.warn -= dt;
      const gaveUp = o.posture === 'handsUp' || (o.brain && o.brain.begging);
      if (gaveUp && r.anger < 0.75 && !(b.ordered && b.ordered.target === o)) {
        // keep it on them while their hands stay up; calm down enough, and leave it there
        r.anger = Math.max(0, r.anger - dt * 0.12);
        this.warn = Math.max(this.warn, 0.5);
        if (r.anger < 0.3) { b.speak('backDown', { other: o.name }, 0.9, o, true); b.won(o); return false; }
        return true;
      }
      if (!b.isHostile(o) && !(o.brain && o.brain.fleeing)) return true;
      this.warn = 0;
    }
    if (!me.acting) this.cool -= dt;
    if (this.cool <= 0 && me.steady > 0.4 + (1 - T.skill) * 0.35) {
      if (me.fire()) {
        this.shots = (this.shots || 0) + 1;
        const burst = 1 + Math.round(T.aggression * 2 + b.emo.anger);
        this.cool = this.shots % burst ? rand(0.16, 0.35) : rand(0.6, 1.3);
      }
    }
    return true;
  }

  end() {
    this.me.block(false);
    this.me.lowerGun();
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
      // backed up to the edge by someone who is not actually coming for them: they stay put and watch
      if (!b.isHostile(o)) {
        me.stop();
        me.faceTo(o.pos.x);
        me.lookAt = o.wj.head;
        this.safe += dt;
        return this.safe < 5;
      }
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
    if (this.brain.isHostile(this.target)) this.brain.speak('beg', { other: this.target.name }, 1, this.target, true);
    else this.brain.speak('fear', {}, 0.6);
    this.next = rand(2.5, 4);
    this.calm = 0;
  }
  update(dt) {
    this.t += dt;
    const o = this.target, me = this.me, b = this.brain;
    if (!o || o.removed) return false;
    if (me.ready && me.posture !== 'cower' && me.posture !== 'beg' && me.posture !== 'handsUp' && me.posture !== 'coverHead') {
      const gun = o.gunReady, shooting = b.gunThreat && this.now - b.gunThreat.t < 3;
      me.setPosture(gun ? (shooting && chance(0.6) ? 'coverHead' : 'handsUp')
        : o.armedWith === 'knife' && chance(0.7) ? 'handsUp' : Math.abs(o.pos.x - me.pos.x) < 2 && chance(0.5) ? 'beg' : 'cower');
      if (me.posture === 'handsUp') b.speak(gun ? 'surrenderGun' : 'surrender', { other: o.name }, 0.9, o, true);
    }
    me.stop();
    me.facing = sign(o.pos.x - me.pos.x) || me.facing;
    const near = Math.abs(o.pos.x - me.pos.x) < 4 && o.alive && o.conscious && b.isHostile(o);
    if (near && (this.next -= dt) <= 0) { this.next = rand(3, 5); b.speak('beg', { other: o.name }, 0.8, o, true); }
    this.calm = near ? 0 : this.calm + dt;
    return this.calm < 3 && this.t < 30;
  }
  end() {
    this.brain.begging = false;
    const p = this.me.posture;
    if (p === 'cower' || p === 'beg' || p === 'handsUp' || p === 'coverHead') this.me.setPosture(null);
  }
}

/** A gun on them: still, hands up, facing it, until it is pointed somewhere else. */
export class Surrender extends Behaviour {
  get kind() { return 'surrender'; }
  get label() { return 'Hands up to ' + this.target.name; }
  get icon() { return 'exclaim'; }
  start() {
    this.brain.begging = true;
    this.brain.speak('surrenderGun', { other: this.target.name }, 1, this.target, true);
    this.calm = 0;
    this.next = rand(3, 5);
  }
  update(dt) {
    this.t += dt;
    const o = this.target, me = this.me, b = this.brain;
    if (!o || o.removed || !o.alive || !o.conscious) return false;
    me.stop();
    me.faceTo(o.pos.x);
    me.lookAt = o.wj.head;
    if (me.ready && me.posture !== 'handsUp') me.setPosture('handsUp');
    const pointed = o.aimTarget === me && o.aiming;
    this.calm = pointed ? 0 : this.calm + dt;
    if (pointed && (this.next -= dt) <= 0) { this.next = rand(3, 5); b.speak('surrenderGun', { other: o.name }, 0.8, o, true); }
    if (this.calm > 2.5) b.speak('relief', {}, 0.6);
    return this.calm < 2.5 && this.t < 25;
  }
  end() {
    this.brain.begging = false;
    if (this.me.posture === 'handsUp') this.me.setPosture(null);
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
      if (ra.like > 0.3 && rf && rf.like < 0.1) { b.speak('cheerFriend', { other: a.name }, 0.7, a, true); if (chance(0.4)) me.perform('clap'); }
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
  start() { this.there = 0; this.next = 0; this.said = 0; }
  update(dt) {
    this.t += dt;
    const o = this.target, me = this.me, b = this.brain;
    if (!o || o.removed || o.dead) return false;
    const pinned = o.pinnedBy && this.now - o.pinT < 0.5;
    const bleeding = o.health.bleeding > 0.002;
    const needs = o.lying || o.state === 'crawl' || pinned || o.health.overall < 0.45 || o.stuck.length > 0 || bleeding ||
      o.health.needsTourniquet.length > 0 || !!outJoint(o);
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
    } else if (o.health.needsTourniquet.length && this.there > 0.5 && me.health.canUse('armA') && me.health.canUse('armB')) {
      // a stump or an artery: tie it off, hard, above the wound
      if (me.posture === 'kneel') me.setPosture(null);
      if (me.ready && !me.tying) {
        me.tying = { who: o, part: o.health.needsTourniquet[0] };
        me.perform('tourniquet');
        b.speak('tourniquet', { other: o.name }, 0.9, o);
      }
    } else if (outJoint(o) && this.there > 0.6 && me.health.canUse('armA') && me.health.canUse('armB')) {
      // a joint out: a grip, a brace, and a pull
      if (me.posture === 'kneel') me.setPosture(null);
      if (me.ready && !me.popping) {
        me.popping = { who: o, joint: outJoint(o) };
        me.perform('popJoint');
        b.speak('popBack', { other: o.name }, 0.9, o);
      }
    } else if (o.stuck.length && this.there > 0.6 && me.health.canUse('armA')) {
      // the knife comes out - carefully, and pressed on straight after
      if (me.posture === 'kneel') me.setPosture(null);
      if (me.ready) {
        me.perform('pickup');
        o.pullKnife(o.stuck[0], null);
        b.speak('pullKnifeHelp', { other: o.name }, 0.9, o);
        o.health.pressure = Math.max(o.health.pressure, 3);
      }
    } else if ((o.lying || bleeding) && me.ready && me.posture !== 'kneel') {
      me.setPosture('kneel');
    }
    // pressing on the wounds
    if (bleeding && this.there > 0.8) o.health.pressure = Math.max(o.health.pressure, 0.5);
    if ((this.next -= dt) <= 0) {
      // a few words to begin with; after that, mostly just being there
      this.next = this.said++ < 2 ? rand(3.5, 5.5) : rand(9, 15);
      b.speak(pinned ? 'pinned' : 'comfort', { other: o.name }, 0.9, o);
    }
    if (this.there > 1.2) {
      if (o.state === 'down' && !bleeding) o.downT = Math.min(o.downT, 0.3);
      if (o.state === 'ko') o.health.conscious += dt * 0.15;
      if (o.brain && !this.thanked && o.state === 'getup') { this.thanked = true; o.brain.helpedBy(me); }
    }
    return this.t < 14 && this.there < 9;
  }
  end() {
    if (this.me.posture === 'kneel') this.me.setPosture(null);
    this.me.tying = null;
    this.me.popping = null;
    if (this.there > 1 && this.target) this.brain.rel(this.target).helpedT = this.now;
  }
}

/** The first joint someone has out of its socket, if any. */
function outJoint(o) {
  for (const [j, on] of Object.entries(o.health.dislocated)) if (on) return j;
  return null;
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
  get label() { return 'Going for the ' + ({ knife: 'knife', machete: 'machete', glock: 'gun' }[this.target.kind] || 'brass knuckles'); }
  get icon() { return { knife: 'knife', machete: 'machete', glock: 'gun' }[this.target.kind] || 'knuckles'; }
  start() { this.tries = 0; }
  update(dt) {
    this.t += dt;
    const k = this.target, me = this.me, b = this.brain;
    if (me.weapon) return false;
    if (k.removed || k.wornBy || (k.stuckIn && k.stuckIn.person)) {
      if (k.wornBy && k.wornBy !== me) b.note(`${k.wornBy.name} got the ${({ knife: 'knife', machete: 'machete', glock: 'gun' }[k.kind] || 'brass knuckles')} first.`);
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
    if (th.removed || ((th.kind === 'knuckles' || th.kind === 'knife') && th.wornBy) || (th.kind === 'crate' && th.carriedBy)) return false;
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
      else if (th.kind === 'knife') { me.perform('inspect'); b.speak('knifeSee', {}, 0.7); }
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

/* ---------------------------------- knives ---------------------------------- */

export class PullOut extends Behaviour {
  get kind() { return 'pullout'; }
  get label() { return 'Pulling the knife out'; }
  get icon() { return 'knife'; }
  start() { this.tries = 0; this.me.stop(); this.brain.speak('pullOut', {}, 0.9, null, true); }
  update(dt) {
    this.t += dt;
    const me = this.me;
    if (!me.stuck.length) return false;
    if (me.acting) return true;
    if (me.ready && this.tries < 3 && me.pullOutKnife()) this.tries++;
    return this.t < 6 && this.tries < 3;
  }
}

export class ThrowKnife extends Behaviour {
  get kind() { return 'throwKnife'; }
  get label() { return 'Throwing the knife at ' + this.target.name; }
  get icon() { return 'knife'; }
  start() { this.thrown = false; }
  update(dt) {
    this.t += dt;
    const o = this.target, me = this.me, b = this.brain;
    if (!o || o.removed || o.dead || (!this.thrown && me.armedWith !== 'knife')) return false;
    if (this.thrown) return me.acting && this.t < 6;
    const d = Math.abs(o.pos.x - me.pos.x);
    if (d > 9) { me.goTo(o.pos.x, 'run'); return this.t < 10; }
    me.stop();
    me.faceTo(o.pos.x);
    if (me.ready && me.throwKnifeAt(o.wj.chest.x + o.vel.x * 0.25, o.wj.chest.y)) {
      this.thrown = true;
      b.speak('throwKnife', { other: o.name }, 0.8, o, true);
    }
    return this.t < 8;
  }
}

/* --------------------------------- exercise --------------------------------- */

export class Exercise extends Behaviour {
  get kind() { return 'exercise'; }
  get label() { return { pushups: 'Doing press-ups', squats: 'Doing squats', jacks: 'Doing star jumps' }[this.what]; }
  get icon() { return 'sparkle'; }
  start() {
    this.what = pick(['pushups', 'squats', 'jacks']);
    this.dur = rand(6, 10);
    this.count = 0;
    this.next = 1.2;
    this.brain.speak('exercise', {}, 0.7);
  }
  update(dt) {
    this.t += dt;
    const me = this.me, b = this.brain;
    if (me.ready && me.posture !== this.what) me.setPosture(this.what);
    if ((this.next -= dt) <= 0 && me.posture === this.what) {
      this.next = rand(1.6, 2.4);
      this.count += randInt(2, 3);
      b.speak('exerciseCount', { n: String(this.count) }, 0.6);
    }
    return this.t < this.dur;
  }
  end() {
    if (this.me.posture === this.what) this.me.setPosture(null);
    this.brain.exercisedT = this.now;
    this.brain.boredom = Math.max(0, this.brain.boredom - 0.4);
    if (this.t > 4) { this.brain.speak('exerciseDone', {}, 0.6); this.me.perform('wipeBrow'); }
  }
}

/** For a quick look-up of what a behaviour is called, by kind. */
export const KINDS = {
  idle: Idle, wander: Wander, rest: Rest, celebrate: Celebrate, panic: Panic, chat: Chat,
  fight: Fight, flee: Flee, hide: Hide, cower: Cower, confront: Confront, watch: Watch,
  help: Help, mourn: Mourn, arm: Arm, inspect: Inspect, play: Play, throw: ThrowCrate,
  investigate: Investigate, pullout: PullOut, throwKnife: ThrowKnife, exercise: Exercise,
  surrender: Surrender,
};

