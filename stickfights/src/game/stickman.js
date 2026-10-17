/* =============================================================================
   A stickman's body: where it is, what state it is in, which clip it plays,
   and what happens to it - blows, falls, blood, broken bones, death.

   The brain (brain.js) decides what to do and asks the body through a few
   verbs: go there, face that way, punch, stab, pick that up, say this. The
   body does what it physically can. Nobody punches with a broken arm, stands
   on two broken legs, or gets up with a crate on their chest.

   States:
     stand    on their feet: idle, walking, running, fighting, emoting
     air      jumped or walked off something, and coming down feet first
     stagger  rocked by a blow, trying to stay up
     down     on the floor and awake: falls there, lies there, gets up
     ko       out cold
     getup    the get-up animation
     crawl    awake on the floor with legs that will not stand
     held     picked up by the hand from above
     thrown   off their feet with no say in it: knocked flying, flung, falling
     climb    pulling themselves up onto a crate
     dead

   Two ways to move. While they are in charge of themselves - standing,
   walking, fighting, getting up - the body is animated, frame by frame (the
   clips in clips.js), and moved by a small character controller: the ground,
   the walls and the crates as boxes to stand on and bump into. Every
   stickman has a kinematic stand-in among the crates, so a crate can still
   land on someone, rest on a body or knock a head.

   The moment they are not in charge - knocked off their feet, knocked out,
   dead, picked up by the hand, thrown - they go limp, and a ragdoll takes over
   (limp.js, physics/ragdoll.js): real joints that bend only the ways joints
   bend, falling however the blow and the floor make them fall. Anyone still
   awake in there tries: their muscles pull toward flailing, bracing, kicking.
   Once they come to rest and can, they pick themselves up, and the animation
   takes back over from wherever the ragdoll left them. With ragdolls turned
   off in the settings, falls are animated instead, the way they used to be.
   ========================================================================== */
import { Animator } from './animator.js';
import { CLIPS, MASKS } from './clips.js';
import { solve, makeJoints, bounds, JOINTS, BONES, DIM, HEAD_BONE, BELOW_BREAK, boneSegments, pointOnBone, angleOf } from './skeleton.js';
import { Health, KO_LEVEL } from './health.js';
import { makeRagdoll, aimMuscles, toJoints, refNear, lyingSide } from './limp.js';
import { KNIFE_W, KNIFE_GRIP } from './draw.js';
import { clamp, clamp01, lerp, lerpAngle, rand, chance, moveToward, segDist, sign, smooth, wrapAngle, wobble, DEG } from '../core/util.js';

export const G = 18;
export const MASS = 70;
const HALF_W = 0.17;
const STEP_UP = 0.24;
export const SPEEDS = { walk: 1.45, run: 4.0, flee: 4.5, sneak: 0.8, shuffle: 1.0 };
const CRAWL_SPEED = 0.35;

/** The speed at which a cycle's planted foot does not slide, for playback rate. */
function strideSpeed(name) {
  const c = CLIPS[name];
  const a = solve(c.frames[0].p, 1, makeJoints());
  const b = solve(c.frames[2].p, 1, makeJoints());
  return Math.abs(a.footA.x - b.footA.x) / (c.frames[0].d + c.frames[1].d);
}
const NOMINAL = { walk: strideSpeed('walk'), run: strideSpeed('run'), runScared: strideSpeed('runScared'), shuffle: 1.1 };

const LYING = new Set(['down', 'ko', 'crawl', 'dead']);
const HIT_REACTIONS = new Set(['hitHead', 'hitBody', 'hitLow', 'flinch']);
export const STILL_POSTURES = new Set(['sit', 'sitEdge', 'kneel', 'cry', 'beg', 'cower', 'handsUp', 'pushups', 'squats', 'jacks', 'armsCrossed', 'handsOnHips', 'clutchStomach', 'clutchArm', 'shiver']);
/** Which part a ragdoll point belongs to, and which bone takes it when that point hits something. */
const POINT_PART = {
  head: ['head', 'skull'], neck: ['torso', 'ribs'], chest: ['torso', 'ribs'], hip: ['torso', 'pelvis'],
  elbowA: ['armA', 'humerusA'], handA: ['armA', 'forearmA'], elbowB: ['armB', 'humerusB'], handB: ['armB', 'forearmB'],
  kneeA: ['legA', 'femurA'], footA: ['legA', 'tibiaA'], toeA: ['legA', 'tibiaA'],
  kneeB: ['legB', 'femurB'], footB: ['legB', 'tibiaB'], toeB: ['legB', 'tibiaB'],
  midHumA: ['armA', 'humerusA'], midForeA: ['armA', 'forearmA'], midHumB: ['armB', 'humerusB'], midForeB: ['armB', 'forearmB'],
  midFemA: ['legA', 'femurA'], midTibA: ['legA', 'tibiaA'], midFemB: ['legB', 'femurB'], midTibB: ['legB', 'tibiaB'],
};
const BREAK_OF = {
  humerusA: 'midHumA', forearmA: 'midForeA', humerusB: 'midHumB', forearmB: 'midForeB',
  femurA: 'midFemA', tibiaA: 'midTibA', femurB: 'midFemB', tibiaB: 'midTibB',
};

const HELD_MIX = { arms: 1, legs: 0.35, core: 0.15 };
const HELD_BY_LEG = { arms: 1, legs: 0.04, core: 0.04 };
const HELD_BY_ARM = { arms: 0.25, legs: 0.5, core: 0.15 };

let nextId = 1;

export class Stickman {
  constructor(sandbox, x, y, o = {}) {
    this.id = nextId++;
    this.kind = 'stickman';
    this.sandbox = sandbox;
    this.name = o.name || 'Stickman';
    this.scale = o.scale || 1;
    this.hair = o.hair || 'none';
    this.voice = o.voice || 1;
    this.strength = o.strength || 1;
    this.seed = Math.random() * 100;

    this.pos = { x, y };
    this.vel = { x: 0, y: 0 };
    this.facing = o.facing || (chance(0.5) ? 1 : -1);
    this.onGround = false;
    this.support = null;

    this.state = 'air';
    this.stateT = 0;
    this.anim = new Animator();
    this.anim.play('fall', { blend: 0 });
    this.joints = makeJoints();
    this.wj = makeJoints();
    this.prevWj = makeJoints();
    this.box = { minX: 0, maxX: 0, minY: 0, maxY: 0 };   // world bounds of the body

    this.health = new Health(o.toughness ?? 0.5);
    this.brain = null;

    this.intent = { x: null, speed: 'walk', face: null, backpedal: false, jump: true, climb: true };
    this.posture = null;
    this.mood = 'calm';
    this.weapon = null;
    this.carrying = null;
    this.strike = null;
    this.blocking = false;
    this.balance = 1;
    this.lieSide = 'back';
    this.downT = 0;
    this.pinnedBy = null;
    this.pinT = -99;
    this.held = null;
    this.spin = 0;
    this.spinV = 0;
    this.climbing = null;
    this.jumpPending = null;
    this.pushing = null;
    this.lookAt = null;
    this.aim = 0;
    this.lastHit = null;
    this.hurtT = -99;
    this.impactCool = new Map();

    // the ragdoll, while there is one, and the blend back out of it
    this.rag = null;
    this.limpT = 0;
    this.restT = 0;
    this.toneLeft = 1;
    this.blend = null;
    this.afterLimp = null;
    this.stuck = [];      // knives stuck in them: { knife, bone, t, ang, depth }

    this.bubble = null;   // { text, t, dur, loud }
    this.thought = null;  // { icon, t, dur }
    this.emote = null;    // { kind, t, dur }
    this.face = { eyes: 'normal', brow: 0, browLift: 0, mouth: 0.15, open: 0, teeth: false, tears: 0, blood: 0 };
    this.blinkT = rand(1, 4);
    this.wounds = [];
    this.headMarks = [];
    this.dripAcc = 0;
    this.removed = false;
    this.proxy = null;
    this.selected = false;
  }

  /* -------------------------------------------------------------------------- */
  /*                                   status                                   */
  /* -------------------------------------------------------------------------- */

  get alive() { return !this.health.dead; }
  get dead() { return this.health.dead; }
  get conscious() { return this.alive && this.health.conscious >= KO_LEVEL && this.state !== 'ko'; }
  get lying() { return LYING.has(this.state) || (this.state === 'getup' && this.stateT < 0.45) || (this.rag && this.state === 'thrown' && this.onGround); }
  get standing() { return this.state === 'stand'; }
  get acting() { return this.anim.acting; }
  get actionName() { return this.anim.actionName; }
  /** Free to start something new: on their feet, nothing playing. */
  get ready() { return this.state === 'stand' && this.onGround && !this.anim.acting && !this.jumpPending && this.conscious && !this.rag; }
  /** Rocked by a blow, but far enough through the flinch to hit back. */
  get canCounter() {
    const a = this.anim.action;
    return this.state === 'stand' && this.onGround && this.conscious && !this.jumpPending && !this.rag &&
      !!a && !a.ending && HIT_REACTIONS.has(a.name) && a.t > 0.09;
  }
  get headPos() { return this.wj.head; }
  get height() { return this.box.maxY - this.box.minY; }
  /** The strike being thrown right now, if any: what other brains can see coming. */
  get attacking() { return this.strike && !this.strike.done ? this.strike : null; }
  get armedWith() { return this.weapon ? this.weapon.kind : null; }
  /** Physics has them: flopping, flying, dangling. */
  get limp() { return !!this.rag; }
  get ragdolls() { return this.sandbox.settings.ragdoll !== false; }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateT = 0;
    if (s !== 'stand') { this.blocking = false; this.pushing = null; }
  }

  notify(type, data) {
    if (this.brain) this.brain.onBody(type, data || {});
  }

  /* -------------------------------------------------------------------------- */
  /*                              the brain's verbs                             */
  /* -------------------------------------------------------------------------- */

  goTo(x, speed = 'walk', o = {}) {
    const it = this.intent;
    it.x = clamp(x, this.sandbox.left + 0.3, this.sandbox.right - 0.3);
    it.speed = speed;
    it.backpedal = !!o.backpedal;
    it.face = o.face ?? null;
    it.jump = o.jump ?? true;
    it.climb = o.climb ?? true;
    if (STILL_POSTURES.has(this.posture)) this.posture = null;
  }

  stop() { this.intent.x = null; this.intent.backpedal = false; }

  faceTo(x) {
    if (this.state !== 'stand' || this.anim.acting || this.rag) return;
    const d = x - this.pos.x;
    if (Math.abs(d) > 0.04) this.facing = Math.sign(d);
  }

  setPosture(p) {
    if (this.posture === p) return;
    if (p === 'sit' && this.ready) this.anim.act('sitDown', { fadeIn: 0.1, fadeOut: 0.3 });
    this.posture = p;
    if (p && STILL_POSTURES.has(p)) this.stop();
  }

  /** Which strikes their arms and legs can still throw. */
  strikes() {
    const h = this.health, out = [];
    if (this.carrying || this.rag) return out;
    const knife = this.armedWith === 'knife';
    if (h.canUse('armB')) out.push('jab');
    if (h.canUse('armA')) { if (knife) out.push('stab', 'slash'); else out.push('cross', 'uppercut'); }
    if (h.canUse('legA') && h.canUse('legB')) out.push('kick', 'stomp');
    return out;
  }

  /**
   * Throws a punch, a kick or a knife at someone. `target` is who it is aimed
   * at: a punch is angled up or down at their head (a stab at their middle),
   * so a short opponent or one on a crate still gets hit where it was meant.
   */
  attack(kind, target = null) {
    if (!(this.ready || this.canCounter) || !this.strikes().includes(kind)) return false;
    const clip = CLIPS[kind];
    this.posture = this.posture === 'block' ? 'guard' : this.posture;
    this.blocking = false;
    this.anim.act(kind, { fadeIn: 0.035, fadeOut: 0.12 });
    this.strike = { kind, def: clip.strike, hit: new Set(), landed: false, done: false, target };
    this.aim = 0;
    if (target && clip.strike.limb.startsWith('hand') && !clip.strike.rising && !clip.strike.sweep) {
      const sh = this.wj.shoulder;
      const aimY = target.lying ? target.wj.hip.y : clip.strike.body ? target.wj.chest.y : target.wj.head.y - 0.06 * target.scale;
      const dx = Math.max(0.3, Math.abs(target.pos.x - this.pos.x));
      this.aim = clamp(Math.atan2(aimY - sh.y, dx), -38 * DEG, 32 * DEG);
    }
    this.vel.x *= 0.3;
    if (kind === 'cross' || kind === 'stab') this.vel.x += this.facing * 0.6;
    this.sandbox.emit('swing', { who: this, kind, target });
    return true;
  }

  block(on) {
    if (on && this.state === 'stand' && !this.anim.acting) { this.blocking = true; this.posture = 'block'; }
    else if (!on && this.blocking) { this.blocking = false; if (this.posture === 'block') this.posture = 'guard'; }
  }

  /** Any one-off from clips.js that is not a strike: wave, cheer, shrug... */
  perform(name, o = {}) {
    if (!this.ready || !CLIPS[name]) return false;
    this.anim.act(name, { fadeIn: o.fadeIn ?? 0.1, fadeOut: o.fadeOut ?? 0.2, speed: o.speed ?? 1 });
    if (CLIPS[name].mask !== 'upper') this.vel.x *= 0.2;
    return true;
  }

  jump(vx, vy = 5.6) {
    if (!this.ready || this.health.legsBroken || this.carrying) return false;
    this.anim.act('jumpCrouch', { fadeIn: 0.03, fadeOut: 0.04 });
    this.jumpPending = { t: 0.085, vx, vy: vy * (0.75 + this.health.mobility * 0.25) };
    return true;
  }

  /** Bends down for something on the floor in front of them: knuckles, a knife. */
  pickUp(item) {
    if (!this.ready || this.weapon || item.wornBy || this.carrying) return false;
    if (item.stuckIn && item.stuckIn.person) return false;
    if (!this.health.canUse('armA')) return false;
    const reach = this.handReachOf(item.pos.x);
    if (Math.abs(reach) > 0.45 || item.pos.y - this.pos.y > 0.6) return false;
    this.anim.act('pickup', { fadeIn: 0.08, fadeOut: 0.18 });
    this.wantItem = item;
    this.vel.x = 0;
    return true;
  }

  /** How far in front of where a reaching hand lands x is. */
  handReachOf(x) { return (x - this.pos.x) * this.facing - 0.42 * this.scale; }

  dropWeapon(fling = 0) {
    const w = this.weapon;
    if (!w) return;
    this.weapon = null;
    const h = this.wj.handA;
    w.drop(h.x, Math.max(h.y, 0.1), this.vel.x + rand(-1, 1) * fling, this.vel.y + rand(0.5, 2) * fling);
    this.sandbox.emit('drop', { who: this, item: w });
  }

  /** Lifts a crate over their head. It has to be free to lift. */
  lift(crate) {
    if (!this.ready || this.carrying || !this.health.canUse('armA') || !this.health.canUse('armB')) return false;
    if (crate.carriedBy || crate.removed || this.sandbox.crateOnTop(crate)) return false;
    const near = Math.abs(crate.pos.x - this.pos.x) - crate.size / 2 - 0.2;
    if (near > 0.35 || Math.abs(crate.pos.y - crate.size / 2 - this.pos.y) > 0.3) return false;
    this.facing = sign(crate.pos.x - this.pos.x);
    this.anim.act('lift', { fadeIn: 0.1, fadeOut: 0.2 });
    this.wantCrate = crate;
    this.vel.x = 0;
    return true;
  }

  /** Throws the crate they are carrying at a point. */
  throwAt(tx, ty) {
    if (!this.carrying || this.state !== 'stand' || this.anim.acting) return false;
    this.facing = sign(tx - this.pos.x);
    this.anim.act('throw', { fadeIn: 0.08, fadeOut: 0.2 });
    this.throwTarget = { x: tx, y: ty };
    this.vel.x = 0;
    return true;
  }

  /** Throws the knife in their hand at a point, overarm. */
  throwKnifeAt(tx, ty) {
    if (this.armedWith !== 'knife' || !this.ready) return false;
    this.facing = sign(tx - this.pos.x);
    this.anim.act('knifeThrow', { fadeIn: 0.06, fadeOut: 0.2 });
    this.throwTarget = { x: tx, y: ty };
    this.vel.x = 0;
    return true;
  }

  dropCarried() {
    const c = this.carrying;
    if (!c) return;
    this.carrying = null;
    c.release(this.vel.x * 0.6, 0.4, rand(-1, 1));
    this.sandbox.emit('dropCrate', { who: this, crate: c });
  }

  /** Reaches for a knife stuck in their own body and pulls it out. */
  pullOutKnife() {
    if (!this.stuck.length || !this.ready) return false;
    if (!this.health.canUse('armA') && !this.health.canUse('armB')) return false;
    this.anim.act('pullOut', { fadeIn: 0.1, fadeOut: 0.2 });
    return true;
  }

  /** Puts words in a speech bubble over their head. */
  say(text, { dur = 0, loud = false, to = null, kind = null } = {}) {
    if (!this.alive || !this.conscious || !text) return false;
    this.bubble = { text, t: 0, dur: dur || clamp(1.3 + text.length * 0.055, 1.6, 4), loud };
    this.sandbox.emit('speech', { who: this, text, loud, to, kind });
    return true;
  }

  think(icon, dur = 1.8) { this.thought = { icon, t: 0, dur }; }
  setEmote(kind, dur = 1.6) { this.emote = kind ? { kind, t: 0, dur } : null; }

  /* -------------------------------------------------------------------------- */
  /*                                 being hurt                                 */
  /* -------------------------------------------------------------------------- */

  /**
   * Whether a point touches this body, within r: the closest part and where.
   * Fists, feet and blades use it to find out what they hit.
   */
  touch(x, y, r) {
    const j = this.wj, s = this.scale, half = (DIM.line / 2) * s;
    if (x < this.box.minX - r || x > this.box.maxX + r || y < this.box.minY - r || y > this.box.maxY + r) return null;
    let best = null;
    const dh = Math.hypot(x - j.head.x, y - j.head.y) - DIM.headR * s - half;
    if (dh <= r) best = { part: 'head', d: dh, x: j.head.x + (x - j.head.x) * 0.7, y: j.head.y + (y - j.head.y) * 0.7, bone: HEAD_BONE, t: 1 };
    for (let b = 0; b < BONES.length; b++) {
      for (const g of boneSegments(j, b)) {
        const sd = segDist(x, y, g[0], g[1], g[2], g[3]);
        const d = sd.d - half;
        if (d <= r && (!best || d < best.d)) best = { part: BONES[b][2], d, x: sd.x, y: sd.y, bone: b, t: g[4] + (g[5] - g[4]) * sd.t };
      }
    }
    return best;
  }

  /** Which of the bones health.js tracks a point on bone b, t of the way along, belongs to. */
  boneName(b, t) {
    if (b === 0) return t < 0.3 ? 'pelvis' : 'spine';
    if (b === HEAD_BONE) return t < 0.25 ? 'neck' : 'skull';
    return BONES[b][3];
  }

  /**
   * A blow from anything: a fist, a foot, a blade, a thrown crate, the floor.
   *   h = { by, part, x, y, dir, power, kind, armed, weapon, deep, bone, low }
   * power 1 is a decent jab; it comes out at about 9 damage before the part's
   * own multiplier. `weapon` is 'knuckles' or 'knife' when there was one in
   * the hand, `bone` which bone it landed on, `deep` a stab rather than a cut.
   */
  takeHit(h) {
    if (this.removed) return null;
    const wasDead = this.dead;
    let part = h.part;
    let blocked = false;
    const fromFront = h.by ? sign(h.by.pos.x - this.pos.x) === this.facing : false;
    if (!wasDead && this.blocking && this.state === 'stand' && fromFront && (part === 'head' || part === 'torso') && h.kind !== 'impact') {
      blocked = true;
      part = chance(0.5) ? 'armA' : 'armB';
    }
    const weapon = h.weapon || (h.armed ? 'knuckles' : null);
    const sharp = weapon === 'knife' ? 1 : weapon === 'knuckles' ? 0.6 : 0;
    const MUL = { head: 1.25, torso: 1, armA: 0.7, armB: 0.7, legA: 0.75, legB: 0.75 };
    const dmg = 9 * h.power * MUL[part] * (blocked ? 0.3 : 1) * rand(0.85, 1.15);
    const res = this.health.hit(part, dmg, {
      sharp: blocked ? sharp * 0.5 : sharp, deep: !!h.deep && !blocked,
      bone: blocked ? null : h.bone || null, breakChance: h.kind === 'stomp' ? 0.06 : 0,
    });

    // blood, if the skin went or the face took it
    const spray = res.wound || (part === 'head' && dmg > 10) || (weapon && dmg > 6);
    if (spray && !blocked) {
      const n = Math.round(clamp(dmg * (sharp > 0.9 ? 0.9 : 0.6), 3, 26));
      this.sandbox.fx.blood(h.x, h.y, h.dir * (1 + h.power), 1 + h.power * 0.5, n, 1, this);
      if (h.x !== undefined) this.markAt(h.x, h.y, 0.7 + dmg * 0.02);
      if (part === 'head') this.face.blood = Math.min(1, this.face.blood + dmg / 35);
    }
    if (dmg > 3) this.sandbox.fx.burst(h.x, h.y, h.power);
    this.hurtT = this.sandbox.time;
    this.sandbox.emit('hit', { who: this, by: h.by, part, power: h.power, blocked, armed: !!weapon, weapon,
      kind: h.kind, x: h.x, y: h.y, damage: dmg, fatal: res.fatal && !wasDead, object: h.object || null, deep: !!h.deep });
    if (wasDead) {
      this.vel.x += h.dir * h.power * 0.4;
      if (this.rag) this.rag.shove(h.x, h.y, h.dir * h.power * 1.4, h.power * 0.4);
      return res;
    }
    this.lastHit = { by: h.by, t: this.sandbox.time, part, power: h.power, kind: h.kind, blocked, object: h.object || null, weapon };

    // a blade cuts more than it shoves
    const shove = h.power * (blocked ? 0.25 : 1) * (weapon === 'knife' ? 0.55 : 1);
    this.balance -= shove * (part === 'head' ? 0.36 : 0.27) * (1.2 - this.health.toughness * 0.35);
    this.notify('hurt', { ...h, part, damage: dmg, blocked, res, weapon });

    if (res.broke) this.sandbox.emit('break', { who: this, part, bone: res.broke, by: h.by });
    if (this.rag) {
      // already limp: the blow just moves them
      this.rag.shove(h.x, h.y, h.dir * (1 + shove * 1.5), shove * 0.6);
      if (res.fatal) this.die(this.health.cause, h.by, h.dir, h.power);
      else if (res.ko && this.state !== 'held') this.knockOut(h.dir, h.power);
      return res;
    }
    if (res.fatal) { this.die(this.health.cause, h.by, h.dir, h.power, h); return res; }
    if (res.ko && this.state !== 'held') { this.knockOut(h.dir, h.power, h); return res; }
    if (this.health.paralysed === 'all') { this.collapse(h.dir, shove, h); return res; }

    switch (this.state) {
      case 'stand':
      case 'stagger':
      case 'getup':
        if (this.carrying && shove > 0.8) this.dropCarried();
        if (res.broke && this.health.legsBroken) this.knockDown(h.dir, shove, h);
        else if (this.balance < 0) this.knockDown(h.dir, shove, h);
        else if (this.balance < 0.32 || shove > 1.7) this.staggerFrom(h.dir, shove);
        else this.flinch(part, h.dir, shove, blocked);
        break;
      case 'air':
        if (shove > 1.2) this.launch(h.dir * (1.5 + shove), 1 + shove * 0.6);
        break;
      case 'down':
      case 'crawl':
        // a heavy enough thing landing on someone on the floor moves the whole body
        if (h.kind === 'impact' && shove > 1.4 && this.ragdolls) this.goLimp({ state: 'thrown', tone: 0.15, at: h, shove: shove * 0.6 });
        else this.vel.x += h.dir * shove * 0.35;
        break;
      default:
        this.vel.x += h.dir * shove * 0.35;
    }
    return res;
  }

  flinch(part, dir, shove, blocked) {
    const name = blocked ? 'block' : part === 'head' ? 'hitHead' : part === 'torso' || part.startsWith('arm') ? 'hitBody' : 'hitLow';
    if (!blocked) {
      this.anim.act(name, { fadeIn: 0.03, fadeOut: 0.2 });
      this.strike = null;
    }
    this.vel.x += dir * shove * (blocked ? 0.5 : 0.8);
  }

  staggerFrom(dir, shove) {
    this.setState('stagger');
    this.staggerT = 0.35 + shove * 0.15;
    this.vel.x += dir * (1 + shove * 0.7);
    this.strike = null;
    this.anim.stopAction(0.05);
    this.anim.play('stagger', { blend: 0.08 });
    this.dropCarried();
  }

  /**
   * Off their feet. With ragdolls they go down however the blow sends them,
   * arms out to catch themselves; without, shoved backwards they land on
   * their back, from behind on their front.
   */
  knockDown(dir = 0, shove = 1, at = null) {
    if (!this.alive || this.state === 'held') return;
    this.strike = null;
    this.dropCarried();
    if (this.weapon && chance(this.armedWith === 'knife' ? 0.35 : 0.25)) this.dropWeapon(1);
    this.downT = 1.4 + shove * 0.5 + rand(0, 0.8);
    if (this.goLimp({ state: 'thrown', tone: 0.35, at, dir, shove, after: 'down' })) {
      this.sandbox.emit('knockdown', { who: this, by: this.lastHit ? this.lastHit.by : null });
      this.notify('down', {});
      return;
    }
    const back = dir === 0 ? chance(0.5) : dir === -this.facing;
    this.lieSide = back ? 'back' : 'front';
    this.setState('down');
    this.anim.stopAction(0.05);
    this.anim.play(back ? 'fallBack' : 'fallFront', { blend: 0.08, restart: true });
    this.vel.x += dir * (0.8 + shove * 0.5);
    this.sandbox.emit('knockdown', { who: this, by: this.lastHit ? this.lastHit.by : null });
    this.notify('down', {});
  }

  knockOut(dir = 0, shove = 1, at = null) {
    if (!this.alive) return;
    this.strike = null;
    this.dropCarried();
    if (this.weapon && chance(0.4)) this.dropWeapon(1);
    this.health.conscious = Math.min(this.health.conscious, KO_LEVEL - 0.05);
    if (this.rag) {
      if (this.state !== 'held') this.setState('ko');
    } else if (!this.goLimp({ state: 'ko', tone: 0, at, dir, shove })) {
      if (!LYING.has(this.state)) {
        const back = dir === 0 ? chance(0.5) : dir === -this.facing;
        this.lieSide = back ? 'back' : 'front';
        this.anim.stopAction(0.05);
        this.anim.play(back ? 'fallBack' : 'fallFront', { blend: 0.08, restart: true });
        this.vel.x += dir * (0.6 + shove * 0.4);
      }
      this.setState('ko');
    }
    this.sandbox.emit('ko', { who: this, by: this.lastHit ? this.lastHit.by : null });
    this.notify('ko', {});
  }

  /** The body stops answering - a broken neck that did not kill - and down it goes. */
  collapse(dir = 0, shove = 0.5, at = null) {
    this.strike = null;
    this.dropCarried();
    if (this.weapon) this.dropWeapon(0.5);
    if (this.rag) return;
    this.downT = 1;
    if (!this.goLimp({ state: 'thrown', tone: 0, at, dir, shove, after: 'down' })) {
      this.lieSide = chance(0.5) ? 'back' : 'front';
      this.setState('down');
      this.anim.play(this.lieSide === 'back' ? 'fallBack' : 'fallFront', { blend: 0.08, restart: true });
    }
    this.notify('down', {});
  }

  /** Something hard flying into them: a thrown crate, brass knuckles, a knife flat-on. */
  impactFrom(body, speed, point, n) {
    const now = this.sandbox.time;
    const last = this.impactCool.get(body) || -99;
    if (now - last < 0.35) return;
    this.impactCool.set(body, now);
    const thing = body.owner;
    const heavy = body.mass > 5;
    const min = heavy ? 2.6 : 4;
    if (speed < min) return;
    const power = heavy ? (speed - min) * 0.55 * Math.sqrt(body.mass / 22) : (speed - min) * 0.24;
    const hit = this.touch(point.x, point.y, 0.25) || { part: 'torso', x: point.x, y: point.y, bone: 1, t: 0.5 };
    const thrower = thing && thing.thrownBy && now - thing.thrownAt < 3 ? thing.thrownBy : null;
    const dir = body.vel.x !== 0 ? sign(body.vel.x) : -sign(n.x);
    this.takeHit({ by: thrower, part: hit.part, x: hit.x, y: hit.y, dir, power, kind: 'impact', object: thing, bone: this.boneName(hit.bone, hit.t) });
    if (heavy && power > 2.2 && this.state === 'stand') this.knockDown(dir, power, { x: hit.x, y: hit.y });
  }

  die(cause, killer = null, dir = 0, power = 1, at = null) {
    if (this.state === 'dead') return;
    if (!this.health.dead) this.health.kill(cause);
    const wasLying = LYING.has(this.state) || this.state === 'thrown';
    const wasHeld = this.state === 'held';
    this.strike = null;
    this.dropCarried();
    if (this.weapon) this.dropWeapon(0.5);
    this.anim.stopAction(0.1);
    if (wasHeld) {
      this.setState('held');
      if (!this.rag) this.anim.play('dangleLimp', { blend: 0.4 });
    } else if (this.rag) {
      this.setState('dead');
      this.toneLeft = 0.6;
    } else if (this.goLimp({ state: 'dead', tone: 0.45, at, dir, shove: power * 0.8 })) {
      // the knees go, then everything else: a little tone that drains away
      this.toneLeft = 1;
    } else {
      this.setState('dead');
      if (wasLying) {
        this.anim.play(this.lieSide === 'back' ? 'deadBack' : 'deadFront', { blend: 0.6 });
      } else if (dir !== 0 && dir === -this.facing) {
        this.lieSide = 'back';
        this.anim.play('dieBack', { blend: 0.08, restart: true });
        this.vel.x += dir * (0.8 + power * 0.6);
      } else {
        this.lieSide = 'front';
        this.anim.play('dieCollapse', { blend: 0.1, restart: true });
      }
    }
    this.bubble = null;
    this.thought = null;
    this.emote = null;
    this.sandbox.emit('death', { who: this, by: killer, cause });
    this.notify('dead', {});
  }

  /** Back to full health: the sandbox's heal button. Only for the living. */
  heal() {
    if (this.dead) return false;
    this.health.heal();
    this.wounds.length = 0;
    this.headMarks.length = 0;
    this.face.blood = 0;
    for (const e of [...this.stuck]) this.pullKnife(e, null);
    if (this.rag) {
      // a broken bone the ragdoll was built with has mended: rebuild it whole
      const st = this.state;
      this.rag = null;
      this.goLimp({ state: st === 'ko' ? 'thrown' : st, tone: 0.3 });
    }
    if (this.state === 'ko') { this.setState(this.rag ? 'thrown' : 'down'); this.downT = 0.6; }
    this.notify('healed', {});
    return true;
  }

  /* -------------------------------------------------------------------------- */
  /*                                   ragdoll                                  */
  /* -------------------------------------------------------------------------- */

  /**
   * Hands the body over to physics. o = { state, tone, at: {x, y} where they
   * were hit, dir, shove, after: the state to come round into }. False when
   * ragdolls are turned off, so the caller can animate it instead.
   */
  goLimp(o = {}) {
    if (!this.ragdolls) return false;
    if (!this.rag) {
      this.rag = makeRagdoll(this);
      this.limpT = 0;
      this.restT = 0;
    }
    const rag = this.rag;
    this.blend = null;
    this.strike = null;
    this.climbing = null;
    this.jumpPending = null;
    this.posture = null;
    this.stop();
    this.anim.stopAction(0.05);
    this.toneLeft = 1;
    this.baseTone = o.tone ?? 0.3;
    this.afterLimp = o.after || this.afterLimp || 'down';
    if (o.state) this.setState(o.state);
    // the blow that did it, at the point it landed
    if (o.at && o.at.x !== undefined && o.shove) {
      const dir = o.dir || 0;
      rag.shove(o.at.x, o.at.y, dir * (1.2 + o.shove * 1.3), 0.3 + o.shove * 0.25, 0.5);
    } else if (o.dir && o.shove) {
      rag.kick(o.dir * (0.6 + o.shove * 0.6), 0);
    }
    rag.wake();
    this.onGround = false;
    return true;
  }

  /** The way out of the ragdoll: the animation takes over from wherever the body is. */
  recover(state, clip, o = {}) {
    const rag = this.rag;
    if (!rag) return;
    toJoints(rag, this);
    const from = {};
    for (const k of JOINTS) from[k] = { x: this.wj[k].x, y: this.wj[k].y };
    from.headAngle = this.wj.headAngle;
    this.lieSide = lyingSide(rag);
    this.facing = rag.facing;
    const hip = this.wj.hip;
    this.pos.x = hip.x;
    const sup = this.sandbox.surfaceBelow(hip.x, 0.12, Math.max(0, Math.min(hip.y, this.wj.footA.y, this.wj.footB.y) + 0.08));
    if (state === 'air') {
      this.pos.y = Math.max(sup.y, Math.min(this.wj.footA.y, this.wj.footB.y, this.wj.toeA.y, this.wj.toeB.y) - (DIM.line / 2) * this.scale);
      this.support = null;
    } else {
      this.pos.y = sup.y;
      this.support = sup.body;
    }
    this.onGround = state !== 'air';
    this.vel.x = clamp(this.vel.x, state === 'air' ? -6 : -1.5, state === 'air' ? 6 : 1.5);
    if (state !== 'air') this.vel.y = 0;
    this.rag = null;
    this.spin = 0;
    this.spinV = 0;
    this.setState(state);
    this.anim.play(clip || (this.lieSide === 'back' ? 'lieBack' : 'lieFront'), { blend: 0, restart: true });
    this.blend = { from, t: 0, dur: o.dur || 0.38 };
  }

  /** While physics has them: who is pulling which way, and whether they can get up yet. */
  updateLimp(dt) {
    const rag = this.rag, h = this.health, st = this.state;
    this.limpT += dt;
    const awake = this.conscious && h.paralysed !== 'all';
    const lowest = this.lowestPoint();
    const airborne = !this.onGround;
    const pinned = this.pinnedBy && this.sandbox.time - this.pinT < 0.3;
    let clip = 'tumble', tone = 0;
    switch (st) {
      case 'held': {
        clip = awake ? 'dangle' : 'dangleLimp';
        tone = awake ? 0.5 : 0;
        const h = this.held;
        if (h) {
          const k = 1 - Math.exp(-dt * 25);
          h.vx = lerp(h.vx, (h.target.x - h.prev.x) / dt, k);
          h.vy = lerp(h.vy, (h.target.y - h.prev.y) / dt, k);
          h.prev.x = h.target.x; h.prev.y = h.target.y;
        }
        break;
      }
      case 'thrown': {
        if (awake) {
          // flailing in the air; arms out for the ground as it comes up; then tucked up on it
          const falling = this.vel.y < -1.5 && lowest < 1.2;
          clip = airborne ? (falling ? 'brace' : 'flail') : 'brace';
          tone = this.baseTone * (airborne ? 1 : 0.5) * clamp(1.4 - this.limpT * 0.5, 0.4, 1);
        }
        break;
      }
      case 'dead':
        clip = 'dieCollapse';
        // the last of the tone drains away over half a second
        this.toneLeft = Math.max(0, this.toneLeft - dt * 1.8);
        tone = this.baseTone * this.toneLeft;
        break;
      case 'ko':
        clip = 'koBack';
        break;
      case 'down':
        clip = this.lieSide === 'back' ? 'pinned' : 'lieFront';
        tone = awake ? 0.12 : 0;
        break;
      default:
        break;
    }
    this.anim.play(clip, { blend: 0.2 });
    this.limpToneNow = tone;
    rag.friction = st === 'dead' || st === 'ko' || !awake ? 0.06 : 0.03;

    // coming to rest
    const settled = this.onGround && rag.maxSpeed < 0.9;
    this.restT = settled ? this.restT + dt : 0;
    const rested = this.restT > 0.35 || rag.asleep;
    if (st === 'held') return;
    // nobody limp stays sitting up: a slumped body goes over the way it leans
    if (!awake && this.restT > 0.15 && this.limpT - (this.slumpT || -9) > 0.5) {
      const w = this.wj;
      const lean = wrapAngle(angleOf(w.hip, w.neck));
      if (Math.abs(lean) < 1.0 && w.head.y - this.pos.y > 0.5) {
        this.slumpT = this.limpT;
        const dir = (Math.sign(lean) || (chance(0.5) ? 1 : -1));
        rag.shove(w.chest.x, w.chest.y, dir * 1.6, 0, 0.45);
      }
    }

    if (st === 'thrown') {
      if (awake && this.canLandStanding()) { this.landFromLimp(); return; }
      if (!rested) return;
      if (!this.alive) { this.setState('dead'); return; }
      if (!this.conscious) { this.setState('ko'); return; }
      if (pinned || h.paralysed === 'all') { this.setState('down'); this.downT = 1; return; }
      if (this.limpT < 0.5) return;
      this.recover('down');
      this.downT = Math.max(this.downT || 0, 0.6);
      return;
    }
    if (st === 'ko') {
      if (h.conscious > 0.5) {
        this.sandbox.emit('wake', { who: this });
        this.notify('wake', {});
        this.downT = rand(1, 2.2);
        if (rested && !pinned && h.paralysed !== 'all') this.recover('down');
        else this.setState('down');
      }
      return;
    }
    if (st === 'down') {
      if (awake && !pinned && rested) this.recover('down');
    }
  }

  /** How high the lowest point of the body is off whatever is under it. */
  lowestPoint() {
    let low = Infinity;
    for (const k of ['footA', 'footB', 'toeA', 'toeB', 'kneeA', 'kneeB', 'hip', 'head']) low = Math.min(low, this.wj[k].y);
    return Math.max(0, low - this.sandbox.surfaceBelow(this.wj.hip.x, 0.2, this.wj.hip.y).y);
  }

  /** Coming down feet first and the right way up, slowly enough to stay up. */
  canLandStanding() {
    if (!this.health.canUse('legA') || !this.health.canUse('legB') || this.limpT < 0.12) return false;
    const w = this.wj;
    const up = Math.abs(wrapAngle(angleOf(w.hip, w.neck)));
    if (up > 0.5) return false;
    const feetY = Math.min(w.footA.y, w.footB.y);
    if (feetY > w.hip.y - 0.55 * this.scale) return false;
    const rag = this.rag;
    const touching = rag.p[rag.byName.footA].ground || rag.p[rag.byName.footB].ground || rag.p[rag.byName.toeA].ground || rag.p[rag.byName.toeB].ground;
    if (!touching) return false;
    return Math.abs(this.vel.x) < 4.5 && this.vel.y > -7;
  }

  landFromLimp() {
    const v = -this.vel.y;
    this.recover('stand', 'idle', { dur: 0.22 });
    this.anim.act('land', { fadeIn: 0.03, fadeOut: 0.15, speed: v > 6 ? 0.8 : 1.3 });
    this.sandbox.emit('land', { who: this, speed: v });
    if (v > 9.5) this.landHard(v, 'legs');
    this.notify('up', {});
  }

  /** After the physics step: the ragdoll back onto the skeleton, and what it ran into. */
  afterRag(dt) {
    const rag = this.rag;
    if (!rag) return;
    toJoints(rag, this);
    const w = this.wj;
    this.pos.x = w.hip.x;
    // what they are lying on, if anything, and how fast they are going
    let ground = false, body = null;
    let mx = 0, my = 0, m = 0;
    for (const q of rag.p) {
      if (q.ground) { ground = true; if (q.body) body = q.body; }
      const mass = 1 / q.im;
      mx += (q.x - q.px) * mass; my += (q.y - q.py) * mass; m += mass;
    }
    this.vel.x = mx / m / dt;
    this.vel.y = my / m / dt;
    this.onGround = ground;
    this.support = body;
    // where they are, as far as anyone else is concerned: the lowest of them
    let low = Infinity;
    for (const q of rag.p) low = Math.min(low, q.y - q.r);
    this.pos.y = Math.max(0, low);
    this.boundsFromJoints();
    // a heavy crate sitting on them pins them down
    for (const ct of rag.contacts) {
      if (ct.ny < -0.5 && ct.b.mass > 5 && ct.b.owner) { this.pinnedBy = ct.b.owner; this.pinT = this.sandbox.time; }
    }
    if (rag.impacts.length) this.limpImpacts(rag.impacts);
  }

  /**
   * Hitting the floor, a wall or a crate as a ragdoll. The fastest point says
   * how hard; every point that hit takes its share by how much of the body's
   * weight it was carrying in and how fast - so a body that lands on its head
   * hurts its head, and one that lands flat spreads it out.
   */
  limpImpacts(list) {
    const sb = this.sandbox, now = sb.time;
    let top = 0;
    for (const im of list) {
      // a crate flying at them is a hit, not a fall
      if (im.what && im.what.owner && im.what.owner.kind === 'crate') {
        const b = im.what;
        if (Math.hypot(b.vel.x, b.vel.y) > 3) {
          const q = this.rag.p[im.i];
          this.impactFrom(b, im.speed, { x: q.x, y: q.y }, { x: 0, y: 1 });
          continue;
        }
      }
      if (im.speed > top) top = im.speed;
    }
    if (top < 4) return;
    if (now - (this.thudT || -99) > 0.12) {
      this.thudT = now;
      sb.emit('thud', { who: this, speed: top, x: this.wj.hip.x, y: this.pos.y });
      if (top > 5) sb.fx.dust(this.wj.hip.x, this.pos.y, Math.round(clamp(top, 4, 10)), Math.min(2, top / 6));
    }
    // a body toppling over hits the floor with its head at nearly 10 m/s, the
    // way a falling pole does: that is a knock, not an injury. Thrown, it is.
    if (top < 8 || now - (this.slamT || -99) < 0.25) return;
    this.slamT = now;
    const e = top - 8;
    const total = e * e * 1.5 + e * 3.5;
    const share = new Map();
    let sum = 0;
    for (const im of list) {
      const q = this.rag.p[im.i];
      const key = POINT_PART[q.name];
      if (!key) continue;
      const wgt = (1 / q.im) * im.speed * im.speed * (q.name === 'head' ? 1.6 : 1);
      const k = key.join('/');
      share.set(k, (share.get(k) || 0) + wgt);
      sum += wgt;
    }
    if (sum <= 0) return;
    const was = this.alive;
    let headHit = false;
    for (const [k, wgt] of share) {
      const [part, bone] = k.split('/');
      const dmg = total * (wgt / sum) * rand(0.8, 1.2);
      if (dmg < 0.5) continue;
      if (part === 'head') headHit = true;
      const res = this.health.hit(part, dmg, { bone, breakChance: top > 13 ? 0.12 : 0 });
      if (res.broke) sb.emit('break', { who: this, part, bone: res.broke, by: null });
    }
    if (total > 12) {
      const j = this.wj;
      sb.fx.blood(j.hip.x, j.hip.y + 0.1, 0, 1.5, Math.round(clamp(total / 4, 2, 18)), 1.6, this);
      if (headHit) this.face.blood = Math.min(1, this.face.blood + total / 60);
    }
    this.hurtT = now;
    this.lastHit = { by: null, t: now, part: headHit ? 'head' : 'torso', power: total / 9, kind: 'fall', blocked: false, object: null };
    if (was) this.notify('hurt', { kind: 'fall', damage: total, by: null, part: headHit ? 'head' : 'torso', power: total / 9, res: {} });
    if (was && this.health.dead) this.die(this.health.cause, null);
    else if (was && this.health.conscious < KO_LEVEL && this.state !== 'held') this.knockOut(0, 1);
  }

  boundsFromJoints() {
    const w = this.wj;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const k of JOINTS) {
      const p = w[k];
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const r = (DIM.headR + DIM.line / 2) * this.scale;
    this.box.minX = Math.min(minX, w.head.x - r);
    this.box.maxX = Math.max(maxX, w.head.x + r);
    this.box.minY = Math.min(minY, w.head.y - r);
    this.box.maxY = Math.max(maxY, w.head.y + r);
  }

  /* -------------------------------------------------------------------------- */
  /*                              the hand from above                           */
  /* -------------------------------------------------------------------------- */

  /** Which bone is nearest a world point, for grabbing and blood. */
  nearestPart(x, y) {
    let best = null;
    for (let b = 0; b < BONES.length; b++) {
      for (const g of boneSegments(this.wj, b)) {
        const sd = segDist(x, y, g[0], g[1], g[2], g[3]);
        if (!best || sd.d < best.d) best = { part: BONES[b][2], d: sd.d, bone: b, t: g[4] + (g[5] - g[4]) * sd.t, x: sd.x, y: sd.y };
      }
    }
    const dh = Math.hypot(x - this.wj.head.x, y - this.wj.head.y) - DIM.headR * this.scale;
    if (dh < best.d) best = { part: 'head', d: Math.max(0, dh), bone: HEAD_BONE, t: 1, x: this.wj.head.x, y: this.wj.head.y };
    return best;
  }

  grab(x, y) {
    const was = this.state;
    this.dropCarried();
    this.strike = null;
    this.blocking = false;
    this.anim.stopAction(0.05);
    if (this.goLimp({ state: 'held', tone: 0.5 })) {
      this.rag.grab(refNear(this.rag, this, x, y), x, y);
      const part = this.nearestPart(x, y).part;
      this.held = { target: { x, y }, rag: true, vx: 0, vy: 0, prev: { x, y }, part };
    } else {
      const near = this.nearestPart(x, y);
      const byLeg = near.part === 'legA' || near.part === 'legB';
      this.setState('held');
      this.onGround = false;
      this.support = null;
      this.jumpPending = null;
      this.climbing = null;
      this.posture = null;
      this.stop();
      const start = LYING.has(was) ? (this.lieSide === 'back' ? -1.2 : 1.2) : 0;
      this.held = {
        inverted: byLeg, joint: byLeg ? (near.part === 'legA' ? 'footA' : 'footB') : 'neck',
        target: { x, y }, prev: { x, y }, vx: 0, vy: 0, ax: 0,
        swing: byLeg ? 0 : start, swingV: 0,
      };
      this.anim.play(this.conscious ? 'dangle' : 'dangleLimp', { blend: 0.2 });
    }
    this.sandbox.emit('grabbed', { who: this });
    this.notify('grabbed', {});
  }

  holdAt(x, y) {
    const h = this.held;
    if (!h) return;
    h.target.x = x; h.target.y = y;
    if (this.rag) { this.rag.grabAt.x = x; this.rag.grabAt.y = y; }
  }

  /** Let go by the hand: dropped, or thrown if the hand was moving. */
  release() {
    const h = this.held;
    if (!h) return;
    this.held = null;
    if (this.rag) {
      this.rag.release();
      // let go mid-swing, the whole body carries on the way the hand was going
      const hv = { x: clamp(h.vx, -22, 22), y: clamp(h.vy, -22, 22) };
      this.rag.fling(hv.x, hv.y, 0.65);
      this.vel.x = lerp(this.vel.x, hv.x, 0.65);
      this.vel.y = lerp(this.vel.y, hv.y, 0.65);
      const sp = Math.hypot(this.vel.x, this.vel.y);
      this.thrownAt = this.sandbox.time;
      this.thrownBy = null;
      if (this.dead) this.setState('dead');
      else if (!this.conscious) this.setState('ko');
      else {
        this.setState('thrown');
        this.baseTone = 0.4;
        this.limpT = 0;
        // let go gently, the right way up: they drop onto their feet
        const w = this.wj;
        const upright = Math.abs(wrapAngle(angleOf(w.hip, w.neck))) < 0.45 && Math.min(w.footA.y, w.footB.y) < w.hip.y - 0.5;
        if (sp < 3.5 && upright && this.health.canUse('legA') && this.health.canUse('legB')) {
          this.recover('air', 'fall', { dur: 0.2 });
        }
      }
      this.sandbox.emit('thrown', { who: this, speed: sp });
      this.notify('thrown', { speed: sp });
      return;
    }
    const vx = clamp(h.vx, -22, 22), vy = clamp(h.vy, -22, 22);
    const sp = Math.hypot(vx, vy);
    this.spin = h.inverted ? Math.PI + h.swing : h.swing;
    this.spinV = h.swingV - vx * 0.9;
    this.vel.x = vx;
    this.vel.y = vy;
    if (this.dead) {
      this.state = 'dead';
      this.stateT = 0;
      this.thrownDead = true;
    } else {
      this.setState('thrown');
      if (this.conscious && sp < 3.5 && !h.inverted && Math.abs(h.swing) < 0.5) {
        this.setState('air');
        this.spin = 0;
        this.spinV = 0;
      }
    }
    this.sandbox.emit('thrown', { who: this, speed: sp });
    this.notify('thrown', { speed: sp });
  }

  /** Knocked into the air by something: no control until they land. */
  launch(vx, vy) {
    if (this.state === 'held') return;
    this.dropCarried();
    this.anim.stopAction(0.05);
    if (this.goLimp({ state: 'thrown', tone: 0.35, after: 'down' })) {
      this.rag.kick(vx - this.vel.x * 0.5, Math.max(0, vy - Math.max(0, this.vel.y)));
      this.downT = Math.max(this.downT, 1.2);
      return;
    }
    this.setState('thrown');
    this.vel.x = vx;
    this.vel.y = Math.max(this.vel.y, vy);
    this.onGround = false;
    this.support = null;
    this.spin = 0;
    this.spinV = -vx * 1.2;
  }

  /* -------------------------------------------------------------------------- */
  /*                                  knives                                    */
  /* -------------------------------------------------------------------------- */

  /**
   * A knife that went in point first stays in. It is held to the bone it hit,
   * at the angle it went in, `depth` of the blade inside.
   */
  stickKnife(knife, hit, ux, uy, depth = 0.07) {
    const bdir = this.boneAngle(hit.bone, hit.t);
    const a = Math.atan2(ux, uy);
    const e = { knife, bone: hit.bone, t: hit.t, ang: wrapAngle(a - bdir) * this.facing, depth };
    this.stuck.push(e);
    knife.stickInto({ person: this, entry: e });
    return e;
  }

  /** The direction bone b runs at a point t along it (clockwise from up). */
  boneAngle(b, t) {
    if (b === HEAD_BONE && t > 0.5) return angleOf(this.wj.neck, this.wj.head);
    const segs = boneSegments(this.wj, b);
    const g = segs.length > 1 && t >= 0.5 ? segs[1] : segs[0];
    return Math.atan2(g[2] - g[0], g[3] - g[1]);
  }

  /** Where a stuck knife is: its middle, and its angle on the canvas (counter-clockwise from +x). */
  knifePose(e) {
    const p = pointOnBone(this.wj, e.bone, e.t);
    if (e.bone === HEAD_BONE && e.t > 0.5) { p.x = this.wj.head.x; p.y = this.wj.head.y; }
    const a = this.boneAngle(e.bone, e.t) + e.ang * this.facing;
    const ux = Math.sin(a), uy = Math.cos(a);
    const s = this.scale;
    // the point is depth past the bone; the middle of the knife half its length back from the point
    const tipX = p.x + ux * e.depth * s, tipY = p.y + uy * e.depth * s;
    return { x: tipX - ux * (KNIFE_W / 2) * s, y: tipY - uy * (KNIFE_W / 2) * s, a: Math.atan2(uy, ux), tipX, tipY, ux, uy };
  }

  /** Out it comes - into `by`'s hand if someone pulled it, or onto the floor. */
  pullKnife(e, by = null) {
    const i = this.stuck.indexOf(e);
    if (i < 0) return null;
    this.stuck.splice(i, 1);
    const k = e.knife;
    const pose = this.knifePose(e);
    k.unstick();
    const part = BONES[e.bone][2];
    if (this.alive) {
      // the knife was holding the wound shut
      this.health.parts[part].bleed += 0.0018;
      this.health.pain = Math.min(130, this.health.pain + 14);
      this.sandbox.fx.blood(pose.tipX, pose.tipY, -pose.ux * 2.5, -pose.uy * 2 + 1, 14, 0.8, this);
    }
    this.markAt(pose.tipX, pose.tipY, 0.9);
    this.sandbox.emit('pullout', { who: this, by: by === 'hand' ? null : by, knife: k, x: pose.tipX, y: pose.tipY });
    if (by === 'hand') {
      k.drop(pose.x, pose.y, 0, 0);
      k.body.rot = pose.a;
      k.body.angVel = 0;
      return k;
    }
    if (by && by.kind === 'stickman' && !by.weapon && by.health.canUse('armA')) {
      k.wear(by);
      by.weapon = k;
      return k;
    }
    k.drop(pose.x, Math.max(pose.y, 0.1), -pose.ux * 1.5 + rand(-0.5, 0.5), 1 + rand(0, 1.5));
    return k;
  }

  /** The point of the knife in their hand, and the middle of its blade. */
  bladePoints() {
    const s = this.scale;
    const a = this.wj.midForeA, h = this.wj.handA;
    const d = Math.hypot(h.x - a.x, h.y - a.y) || 1;
    const ux = (h.x - a.x) / d, uy = (h.y - a.y) / d;
    const tip = (KNIFE_GRIP + KNIFE_W / 2) * s, mid = (KNIFE_GRIP + KNIFE_W * 0.22) * s;
    return { tip: { x: h.x + ux * tip, y: h.y + uy * tip }, mid: { x: h.x + ux * mid, y: h.y + uy * mid }, ux, uy };
  }

  /* -------------------------------------------------------------------------- */
  /*                                   update                                   */
  /* -------------------------------------------------------------------------- */

  update(dt) {
    for (const k of JOINTS) { this.prevWj[k].x = this.wj[k].x; this.prevWj[k].y = this.wj[k].y; }
    this.prevWj.headAngle = this.wj.headAngle;
    this.stateT += dt;
    const h = this.health;
    const wasAlive = !h.dead;
    if (h.update(dt) && wasAlive) this.die(h.cause, this.lastHit && this.sandbox.time - this.lastHit.t < 8 ? this.lastHit.by : null);
    if (h.dead && this.state !== 'dead' && this.state !== 'held') this.die(h.cause);
    if (!h.dead && h.conscious < KO_LEVEL && this.state !== 'ko' && this.state !== 'held' && this.state !== 'thrown') this.knockOut(0, 0.5);
    if (!h.dead && h.paralysed === 'all' && !this.rag && !LYING.has(this.state) && this.state !== 'held') this.collapse(0, 0.3);
    this.balance = Math.min(1, this.balance + dt * (0.2 + this.health.toughness * 0.15));
    if (this.stuck.length && this.alive) h.pain = Math.min(130, h.pain + dt * 2.5 * this.stuck.length);

    if (this.rag) {
      this.updateLimp(dt);
      if (this.rag) {
        // the animation still runs, for the muscles to aim at
        this.anim.update(dt);
        this.anim.events.length = 0;
        const pose = this.anim.sample();
        solve(pose, this.scale, this.joints);
        // dangling from the hand, they kick and flail, but their weight hangs straight down -
        // and whatever is being held by does not do much kicking
        const hp = this.state === 'held' && this.held ? this.held.part : null;
        const mix = !hp ? null : hp.startsWith('leg') ? HELD_BY_LEG : hp.startsWith('arm') ? HELD_BY_ARM : HELD_MIX;
        aimMuscles(this.rag, this.joints, this.health, this.limpToneNow || 0, mix);
        this.updateFace(dt);
        this.updateBleeding(dt);
        this.tickBubbles(dt);
        return;
      }
    }

    if (this.jumpPending) {
      this.jumpPending.t -= dt;
      if (this.jumpPending.t <= 0) {
        this.vel.x = this.jumpPending.vx;
        this.vel.y = this.jumpPending.vy;
        this.onGround = false;
        this.support = null;
        this.jumpPending = null;
        this.setState('air');
        this.sandbox.emit('jump', { who: this });
      }
    }

    switch (this.state) {
      case 'stand': this.updateStand(dt); break;
      case 'air': this.updateAir(dt); break;
      case 'stagger': this.updateStagger(dt); break;
      case 'down': this.updateDown(dt); break;
      case 'ko': this.updateKO(dt); break;
      case 'getup': this.updateGetUp(dt); break;
      case 'crawl': this.updateCrawl(dt); break;
      case 'held': this.updateHeld(dt); break;
      case 'thrown': this.updateThrown(dt); break;
      case 'climb': this.updateClimb(dt); break;
      case 'dead': this.updateDead(dt); break;
    }
    if (this.rag) {
      // something in the state update just sent them limp
      this.updateFace(dt);
      this.tickBubbles(dt);
      return;
    }
    if (this.state !== 'held' && this.state !== 'climb') this.physics(dt);

    this.anim.update(dt);
    for (const ev of this.anim.events) this.animEvent(ev);
    if (this.rag) { this.tickBubbles(dt); return; }
    const pose = this.anim.sample();
    this.procedural(pose, dt);
    solve(pose, this.scale, this.joints);
    this.bendBreaks(this.joints);
    if (this.state === 'held') this.placeHeld();
    this.toWorld(dt);
    this.updateStrike(dt);
    this.updateCarried(dt);
    this.updateFace(dt);
    this.updateBleeding(dt);
    this.tickBubbles(dt);
  }

  tickBubbles(dt) {
    if (this.bubble && (this.bubble.t += dt) > this.bubble.dur) this.bubble = null;
    if (this.thought && (this.thought.t += dt) > this.thought.dur) this.thought = null;
    if (this.emote && (this.emote.t += dt) > this.emote.dur) this.emote = null;
  }

  maxSpeed(kind) {
    let s = SPEEDS[kind] || SPEEDS.walk;
    s *= this.health.mobility;
    if (this.carrying) s = Math.min(s, SPEEDS.walk * 0.8);
    if (this.posture === 'guard' && kind !== 'run' && kind !== 'flee') s = Math.min(s, SPEEDS.shuffle);
    return s;
  }

  updateStand(dt) {
    // sitting on the edge of something needs something under them
    if (this.posture === 'sitEdge' && !(this.onGround && this.support)) this.posture = null;
    if (!this.onGround) { this.setState('air'); return; }
    if (this.health.legsBroken >= 1 && !this.held) { this.knockDown(0, 0.5); return; }
    const it = this.intent;
    const act = this.anim.action;
    const rooted = act && !act.ending && act.mask === MASKS.full;
    let want = 0;
    this.pushing = null;
    if (it.x !== null && !rooted && !STILL_POSTURES.has(this.posture)) {
      const dx = it.x - this.pos.x;
      if (Math.abs(dx) < 0.05) {
        it.x = null;
      } else {
        const dir = Math.sign(dx);
        const top = this.maxSpeed(it.speed);
        want = dir * Math.min(top, Math.abs(dx) * 3.5 + 0.25);
        if (it.backpedal && it.face !== null) this.facing = sign(it.face - this.pos.x);
        else this.facing = dir;
        const ob = this.obstacleAhead(dir);
        if (ob) {
          if (ob.rise <= 0.95 && it.jump && ob.dist < 0.3 && !this.carrying) {
            this.jump(dir * Math.max(1.6, Math.abs(this.vel.x)), 5.6 + ob.rise * 0.4);
          } else if (ob.rise <= 1.7 && it.climb && ob.dist < 0.14 && !this.carrying && this.health.canUse('armA') && this.health.canUse('armB')) {
            this.startClimb(ob, dir);
            return;
          } else if (ob.dist < 0.03) {
            this.pushing = ob.crate;
          }
        }
      }
    } else if (it.face !== null && !rooted) {
      this.faceTo(it.face);
    }
    const accel = Math.abs(want) > Math.abs(this.vel.x) ? 14 : 18;
    this.vel.x = moveToward(this.vel.x, want, accel * dt);
    if (rooted) this.vel.x = moveToward(this.vel.x, 0, 10 * dt);

    // the base clip: on the move, or standing in some posture or mood
    const sp = Math.abs(this.vel.x);
    const back = sign(this.vel.x) !== this.facing;
    let name, speed = 1;
    if (sp > 2.6 && !back) {
      name = it.speed === 'flee' ? 'runScared' : 'run';
      speed = sp / NOMINAL[name];
    } else if (sp > 0.1) {
      if (this.posture === 'guard' || back) { name = 'shuffle'; speed = clamp(sp / NOMINAL.shuffle, 0.6, 1.6); }
      else { name = 'walk'; speed = sp / NOMINAL.walk; }
    } else {
      name = this.idleClip();
    }
    this.anim.play(name, { blend: name === 'walk' || name === 'run' ? 0.18 : 0.25, speed });
    let overlay = null;
    if (this.carrying) overlay = 'carry';
    else if (this.pushing) overlay = 'push';
    else if ((this.posture === 'guard' || this.posture === 'block') && sp > 0.1) overlay = this.posture === 'block' ? 'block' : this.armedWith === 'knife' ? 'knifeGuard' : 'guard';
    this.anim.setOverlay(overlay);
  }

  idleClip() {
    switch (this.posture) {
      case 'guard': return this.armedWith === 'knife' ? 'knifeGuard' : 'guard';
      case 'block': return 'block';
      case 'cower': return 'cower';
      case 'kneel': return 'kneel';
      case 'cry': return 'cry';
      case 'beg': return 'beg';
      case 'sit': return this.health.pain > 40 ? 'sitHurt' : 'sit';
      case 'sitEdge': return 'sitEdge';
      case 'dance': return 'dance';
      case 'talk': return 'talk';
      case 'clutch': return 'clutchHead';
      case 'handsUp': return 'handsUp';
      case 'pushups': return 'pushups';
      case 'squats': return 'squats';
      case 'jacks': return 'jumpingJacks';
      case 'armsCrossed': return 'armsCrossed';
      case 'handsOnHips': return 'handsOnHips';
      case 'clutchStomach': return 'clutchStomach';
      case 'clutchArm': return 'clutchArm';
      case 'shiver': return 'shiver';
      case 'shadowbox': return 'shadowbox';
      default: break;
    }
    switch (this.mood) {
      case 'happy': return 'idleHappy';
      case 'sad': return 'idleSad';
      case 'angry': return 'idleAngry';
      case 'scared': return 'idleScared';
      case 'hurt': return 'idleHurt';
      default: return 'idle';
    }
  }

  /** A crate in the way within the next stride, if it is too tall to just walk up. */
  obstacleAhead(dir) {
    const x0 = this.pos.x + dir * HALF_W * this.scale;
    const x1 = x0 + dir * 0.4;
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    let best = null;
    for (const c of this.sandbox.crates) {
      if (c.carriedBy || c.removed) continue;
      const bb = c.body.aabb();
      if (bb.maxX < lo || bb.minX > hi) continue;
      if (bb.minY > this.pos.y + 1.4 || bb.maxY <= this.pos.y + STEP_UP) continue;
      const top = this.sandbox.stackTop(c, this.pos.y);
      const rise = top - this.pos.y;
      const dist = dir > 0 ? bb.minX - x0 : x0 - bb.maxX;
      if (!best || dist < best.dist) best = { crate: c, rise, dist: Math.max(0, dist), edge: dir > 0 ? bb.minX : bb.maxX, top };
    }
    return best;
  }

  startClimb(ob, dir) {
    this.setState('climb');
    this.climbing = {
      from: { x: this.pos.x, y: this.pos.y },
      to: { x: ob.edge + dir * 0.28, y: ob.top },
      crate: ob.crate, t: 0, dur: 0.76 + ob.rise * 0.15,
    };
    this.vel.x = 0;
    this.vel.y = 0;
    this.anim.stopAction(0.05);
    this.anim.play('climb', { blend: 0.08, restart: true, speed: 0.76 / this.climbing.dur });
    this.sandbox.emit('climb', { who: this, crate: ob.crate });
  }

  updateClimb(dt) {
    const c = this.climbing;
    c.t += dt;
    const u = c.t / c.dur;
    // if the crate went from under them, they are falling
    if (c.crate.removed || c.crate.carriedBy || Math.abs(this.sandbox.stackTop(c.crate, c.from.y) - c.to.y) > 0.3) {
      this.climbing = null;
      this.setState('air');
      return;
    }
    this.pos.x = lerp(c.from.x, c.to.x, smooth((u - 0.3) / 0.6));
    this.pos.y = lerp(c.from.y, c.to.y, smooth(u / 0.62));
    if (u >= 1) {
      this.climbing = null;
      this.onGround = true;
      this.setState('stand');
    }
  }

  updateAir(dt) {
    this.anim.play(this.vel.y > 0.8 ? 'rise' : 'fall', { blend: 0.15 });
    this.anim.setOverlay(this.carrying ? 'carry' : null);
    if (this.intent.x !== null) {
      const dir = sign(this.intent.x - this.pos.x);
      this.vel.x = moveToward(this.vel.x, dir * this.maxSpeed(this.intent.speed), 2.5 * dt);
    }
  }

  updateStagger(dt) {
    this.staggerT -= dt;
    if (this.staggerT <= 0) {
      if (this.balance > 0.12) { this.setState('stand'); this.anim.play('idle', { blend: 0.25 }); }
      else this.knockDown(sign(this.vel.x) || -this.facing, 0.6);
    }
  }

  updateDown(dt) {
    this.downT -= dt;
    const pinned = this.pinnedBy && this.sandbox.time - this.pinT < 0.25;
    if (!pinned) this.pinnedBy = null;
    const falling = this.anim.baseName === 'fallBack' || this.anim.baseName === 'fallFront';
    if (!falling || this.anim.baseDone) {
      let name;
      if (pinned) { name = 'pinned'; this.lieSide = 'back'; }
      else if (this.health.paralysed === 'all') name = this.lieSide === 'back' ? 'koBack' : 'koFront';
      else if (this.health.pain > 45) name = this.lieSide === 'back' ? 'writheBack' : 'writheFront';
      else name = this.lieSide === 'back' ? 'lieBack' : 'lieFront';
      this.anim.play(name, { blend: 0.35 });
    }
    if (pinned) { this.downT = Math.max(this.downT, 0.4); return; }
    if (this.health.paralysed === 'all') return;
    if (this.downT > 0 || (this.brain && this.brain.stayDown)) return;
    if (this.health.legsBroken) {
      this.setState('crawl');
      this.lieSide = 'front';
      this.anim.play('crawl', { blend: 0.5 });
      return;
    }
    this.getUp();
  }

  getUp() {
    this.setState('getup');
    this.anim.play(this.lieSide === 'back' ? 'getUpBack' : 'getUpFront', { blend: 0.15, restart: true, speed: 0.8 + this.health.mobility * 0.3 });
    this.sandbox.emit('getup', { who: this });
  }

  updateGetUp(dt) {
    if (this.health.legsBroken) { this.setState('down'); this.downT = 0.5; return; }
    if (this.anim.baseDone) {
      this.setState('stand');
      this.balance = Math.max(this.balance, 0.65);
      this.anim.play(this.idleClip(), { blend: 0.2 });
      this.notify('up', {});
    }
  }

  updateKO(dt) {
    const falling = this.anim.baseName === 'fallBack' || this.anim.baseName === 'fallFront';
    if (!falling || this.anim.baseDone) this.anim.play(this.lieSide === 'back' ? 'koBack' : 'koFront', { blend: 0.4 });
    if (this.health.conscious > 0.5) {
      this.setState('down');
      this.downT = rand(1, 2.2);
      this.sandbox.emit('wake', { who: this });
      this.notify('wake', {});
    }
  }

  updateCrawl(dt) {
    const it = this.intent;
    let want = 0;
    if (this.health.paralysed === 'all') { this.setState('down'); return; }
    if (it.x !== null && this.conscious) {
      const dx = it.x - this.pos.x;
      if (Math.abs(dx) < 0.1) it.x = null;
      else { want = sign(dx) * CRAWL_SPEED * (this.health.canUse('armA') || this.health.canUse('armB') ? 1 : 0.3); this.facing = sign(dx); }
    }
    this.vel.x = moveToward(this.vel.x, want, 3 * dt);
    this.anim.play('crawl', { blend: 0.3, speed: want ? 1 : 0.15 });
  }

  updateDead(dt) {
    if (this.thrownDead && this.onGround) this.thrownDead = false;
    if (this.thrownDead) {
      this.spin += this.spinV * dt;
      this.anim.play('dangleLimp', { blend: 0.3 });
      return;
    }
    const n = this.anim.baseName;
    if ((n === 'dieBack' || n === 'dieCollapse') && !this.anim.baseDone) return;
    this.anim.play(this.lieSide === 'back' ? 'deadBack' : 'deadFront', { blend: 0.5 });
  }

  updateThrown(dt) {
    const awake = this.conscious;
    this.anim.play(awake ? 'flail' : 'tumble', { blend: 0.15 });
    this.spin += this.spinV * dt;
    if (awake) {
      // trying to get the right way up
      this.spinV += -wrapAngle(this.spin) * 6 * dt;
      this.spinV *= 1 - dt * 1.5;
    }
  }

  updateHeld(dt) {
    const h = this.held;
    if (!h) { this.setState('air'); return; }
    const vx = (h.target.x - h.prev.x) / dt, vy = (h.target.y - h.prev.y) / dt;
    const k = 1 - Math.exp(-dt * 25);
    const nvx = lerp(h.vx, vx, k), nvy = lerp(h.vy, vy, k);
    h.ax = lerp(h.ax, (nvx - h.vx) / dt, 1 - Math.exp(-dt * 12));
    h.vx = nvx; h.vy = nvy;
    h.prev.x = h.target.x; h.prev.y = h.target.y;
    this.vel.x = h.vx;
    this.vel.y = h.vy;
    // a pendulum hanging from the hand: dragging it sideways swings the body
    const L = 0.9 * this.scale;
    const s = h.swing;
    const acc = -(G / L) * Math.sin(s) - (clamp(h.ax, -60, 60) / L) * Math.cos(s) - 2.4 * h.swingV;
    h.swingV += acc * dt;
    h.swing = clamp(s + h.swingV * dt, -1.6, 1.6);
    const awake = this.conscious;
    this.anim.play(awake ? 'dangle' : 'dangleLimp', { blend: 0.25 });
  }

  /** While held, the body hangs from the grabbed joint, wherever the pose puts it. */
  placeHeld() {
    const h = this.held;
    if (!h) return;
    const j = this.joints[h.joint];
    this.pos.x = h.target.x - this.facing * j.x;
    this.pos.y = h.target.y - j.y;
    // never through the floor: the lowest point of them stays on top of it
    let low = Infinity;
    const half = (DIM.line / 2) * this.scale;
    for (const k of JOINTS) low = Math.min(low, this.joints[k].y - (k === 'head' ? DIM.headR * this.scale : 0) - half);
    const floor = this.sandbox.surfaceBelow(this.pos.x, 0.1, this.pos.y + 3, this).y;
    if (this.pos.y + low < floor) {
      const hard = -this.vel.y;
      this.pos.y = floor - low;
      if (hard > 7 && this.sandbox.time - (this.slamT || 0) > 0.4) {
        this.slamT = this.sandbox.time;
        this.landHard(hard, h.inverted ? 'head' : 'legs');
      }
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                                  physics                                   */
  /* -------------------------------------------------------------------------- */

  physics(dt) {
    const sb = this.sandbox;
    const lying = this.lying || this.state === 'thrown' && !this.conscious;
    const hw = (lying ? 0.12 : HALF_W) * this.scale;
    const walking = this.state === 'stand' || this.state === 'crawl';

    this.vel.y -= G * dt;
    if (this.onGround && !walking) this.vel.x = moveToward(this.vel.x, 0, (lying ? 9 : 6) * dt);

    let nx = this.pos.x + this.vel.x * dt;
    if (nx < sb.left + hw || nx > sb.right - hw) {
      const sp = Math.abs(this.vel.x);
      nx = clamp(nx, sb.left + hw, sb.right - hw);
      if (this.state === 'thrown' && sp > 7) this.landHard(sp * 0.8, 'side');
      this.vel.x = this.state === 'thrown' ? -this.vel.x * 0.25 : 0;
    }
    if (!lying || this.state === 'crawl') nx = this.bumpCrates(nx, hw, dt);
    this.pos.x = nx;

    const reach = this.onGround ? STEP_UP : 0.04;
    const sup = sb.surfaceBelow(this.pos.x, hw * 0.8, this.pos.y + reach, this);
    const ny = this.pos.y + this.vel.y * dt;
    if (ny <= sup.y) {
      const v = -this.vel.y;
      this.pos.y = sup.y;
      const was = this.onGround;
      this.onGround = true;
      this.support = sup.body;
      this.vel.y = 0;
      if (!was) this.touchDown(v);
    } else if (this.onGround && walking && this.pos.y - sup.y <= STEP_UP && this.vel.y <= 0.5) {
      this.pos.y = sup.y;       // stepping down a little, not falling
      this.vel.y = 0;
      this.support = sup.body;
    } else {
      this.pos.y = ny;
      this.onGround = false;
      this.support = null;
    }

    // standing on a crate: ride along with it, and weigh it down
    const s = this.support;
    if (this.onGround && s && s.invMass > 0 && !this.rag) {
      const v = s.velAt(this.pos.x, this.pos.y);
      this.pos.x += v.x * dt;
      s.applyForce(0, -MASS * this.scale * G, this.pos.x, this.pos.y);
    }
  }

  /** Crates beside them stop them; walking into one shoves it. */
  bumpCrates(nx, hw, dt) {
    const top = this.pos.y + Math.max(0.5, this.height);
    for (const c of this.sandbox.crates) {
      if (c.carriedBy || c.removed || c.body === this.support) continue;
      // something flying at them, or coming down on their head, is the
      // physics' business - that is a hit, not a wall to step back from
      const cv = c.body.vel;
      if (Math.hypot(cv.x - this.vel.x, cv.y - this.vel.y) > 2.5) continue;
      const bb = c.body.aabb();
      if (bb.minY > this.pos.y + Math.max(0.5, this.height) * 0.55) continue;
      if (bb.maxY <= this.pos.y + STEP_UP + 0.01 || bb.minY >= top) continue;
      if (nx + hw <= bb.minX || nx - hw >= bb.maxX) continue;
      const fromLeft = this.pos.x < c.body.pos.x;
      const edge = fromLeft ? bb.minX - hw : bb.maxX + hw;
      const into = fromLeft ? this.vel.x : -this.vel.x;
      if (into > 0) {
        if (this.state === 'thrown' && into > 4) {
          c.body.applyImpulse(this.vel.x * MASS * 0.35, 0, nx, this.pos.y + 0.8);
          this.landHard(into * 0.9, 'side');
          this.vel.x *= -0.3;
        } else {
          // a shove: as hard as a person leaning on something, no harder
          const rel = this.vel.x - c.body.vel.x;
          const imp = clamp(rel * c.body.mass * 0.5, -480 * dt, 480 * dt);
          c.body.applyImpulse(imp, 0, fromLeft ? bb.minX : bb.maxX, this.pos.y + 0.55);
          this.vel.x = fromLeft ? Math.min(this.vel.x, Math.max(0, c.body.vel.x)) : Math.max(this.vel.x, Math.min(0, c.body.vel.x));
        }
      }
      if (fromLeft ? nx > edge : nx < edge) nx = edge;
    }
    return nx;
  }

  /** Feet (or whatever) meeting the ground after being in the air. */
  touchDown(v) {
    const sb = this.sandbox;
    if (this.state === 'air') {
      if (v > 9.5) {
        this.landHard(v, 'legs');
        if (!this.alive || this.rag) return;
        if (v > 12.5 || this.health.legsBroken) { this.knockDown(0, 1); return; }
      }
      this.setState('stand');
      if (v > 2.5 && !this.carrying) this.anim.act('land', { fadeIn: 0.03, fadeOut: 0.15, speed: v > 6 ? 0.8 : 1.3 });
      if (v > 4) sb.fx.dust(this.pos.x, this.pos.y, 4, v / 8);
      sb.emit('land', { who: this, speed: v });
    } else if (this.state === 'thrown') {
      const sp = Math.hypot(this.vel.x, v);
      const r = wrapAngle(this.spin);
      const upright = Math.abs(r) < 0.55;
      if (this.conscious && upright && sp < 8.5) {
        this.spin = 0;
        this.spinV = 0;
        this.setState('stand');
        this.anim.act('land', { fadeIn: 0.03, fadeOut: 0.15 });
        sb.emit('land', { who: this, speed: v });
      } else {
        // which side they come to rest on has to be known before the impact,
        // in case the impact is what kills them
        this.lieSide = r < 0 ? 'back' : 'front';
        this.spin = 0;
        this.spinV = 0;
        this.landHard(sp, upright ? 'legs' : Math.abs(r) > 2.4 ? 'head' : 'flat');
        if (!this.alive) return;
        if (this.state === 'thrown') {
          this.setState(this.conscious ? 'down' : 'ko');
          this.downT = 1.2 + sp * 0.12;
          this.anim.play(this.lieSide === 'back' ? 'lieBack' : 'lieFront', { blend: 0.12 });
        }
        this.vel.x *= 0.5;
      }
      sb.fx.dust(this.pos.x, this.pos.y, 8, Math.min(2, sp / 6));
    } else if (this.state === 'dead') {
      if (v > 3) sb.fx.dust(this.pos.x, this.pos.y, 6, Math.min(2, v / 6));
      if (v > 4) sb.emit('thud', { who: this, speed: v, x: this.pos.x, y: this.pos.y });
      if (this.thrownDead) {
        this.thrownDead = false;
        this.lieSide = wrapAngle(this.spin) < 0 ? 'back' : 'front';
        this.spin = 0;
        this.anim.play(this.lieSide === 'back' ? 'deadBack' : 'deadFront', { blend: 0.15 });
      }
    } else if (v > 3) {
      sb.fx.dust(this.pos.x, this.pos.y, 4, v / 8);
    }
  }

  /**
   * Hitting the floor, a wall or a crate hard, while animated. What gets hurt
   * depends on what met it first: feet, head, or the whole flat of the body.
   * (A ragdoll works it out from which of its points hit: limpImpacts.)
   */
  landHard(v, how) {
    const sb = this.sandbox;
    sb.emit('thud', { who: this, speed: v, x: this.pos.x, y: this.pos.y });
    if (v < 6.5) return;
    const e = v - 6.5;
    const dmg = e * e * 1.25 + e * 3;
    const spread = how === 'legs' ? [['legA', 0.38, 'tibiaA'], ['legB', 0.38, 'tibiaB'], ['torso', 0.24, 'pelvis']]
      : how === 'head' ? [['head', 0.55, 'skull'], ['torso', 0.3, null], ['armA', 0.15, null]]
      : how === 'side' ? [['torso', 0.4, 'ribs'], ['head', 0.3, 'skull'], ['armA', 0.15, null], ['legA', 0.15, null]]
      : [['torso', 0.5, null], ['head', 0.22, 'skull'], ['armA', 0.1, null], ['armB', 0.08, null], ['legB', 0.1, null]];
    const was = this.alive;
    for (const [part, f, bone] of spread) {
      const res = this.health.hit(part, dmg * f * rand(0.8, 1.2), { bone, breakChance: v > 13 ? 0.15 : 0 });
      if (res.broke) sb.emit('break', { who: this, part, bone: res.broke, by: null });
    }
    if (dmg > 12) {
      const j = this.wj;
      sb.fx.blood(j.hip.x, j.hip.y + 0.1, 0, 1.5, Math.round(clamp(dmg / 4, 2, 18)), 1.6, this);
      if (how === 'head' || how === 'flat') this.face.blood = Math.min(1, this.face.blood + dmg / 60);
    }
    this.hurtT = sb.time;
    this.lastHit = { by: null, t: sb.time, part: how === 'head' ? 'head' : 'torso', power: dmg / 9, kind: 'fall', blocked: false, object: null };
    this.notify('hurt', { kind: 'fall', damage: dmg, by: null, part: how === 'head' ? 'head' : 'torso', power: dmg / 9, res: {} });
    if (was && this.health.dead) this.die(this.health.cause, null);
    else if (was && this.health.conscious < KO_LEVEL && this.state !== 'held') this.knockOut(0, 1);
  }

  /* -------------------------------------------------------------------------- */
  /*                                the strike                                  */
  /* -------------------------------------------------------------------------- */

  updateStrike(dt) {
    const s = this.strike;
    if (!s) return;
    const a = this.anim.action;
    if (!a || a.name !== s.kind || a.ending) { this.strike = null; return; }
    const d = s.def;
    if (a.t > d.to) { s.done = true; return; }
    if (a.t < d.from) return;
    const sb = this.sandbox;
    const blade = d.blade && this.armedWith === 'knife';
    // what is doing the hitting: the fist or foot, or the point and edge of a knife
    const pts = [];
    if (blade) {
      const bp = this.bladePoints();
      pts.push(bp.tip, bp.mid);
    } else {
      pts.push(this.wj[d.limb]);
    }
    const prev = this.prevWj[d.limb], limb = this.wj[d.limb];
    const speed = Math.hypot(limb.x - prev.x, limb.y - prev.y) / dt;
    const armed = !!this.weapon && d.limb === 'handA';
    const r = (d.limb.startsWith('foot') ? 0.065 : blade ? 0.035 : armed ? 0.075 : 0.06) * this.scale;
    for (const o of sb.people) {
      if (o === this || o.removed || s.hit.has(o) || o.state === 'held') continue;
      if (Math.abs(o.pos.x - limb.x) > 2.4) continue;
      let hit = null;
      for (const p of pts) { hit = o.touch(p.x, p.y, r); if (hit) break; }
      if (!hit) continue;
      s.hit.add(o);
      this.landHit(o, hit, speed, s, armed ? this.armedWith : null);
    }
    for (const c of sb.crates) {
      if (s.hit.has(c) || c.carriedBy || c.removed) continue;
      const p = pts[0];
      if (!c.body.contains(p.x, p.y, r)) continue;
      s.hit.add(c);
      if (blade) {
        // a blade into wood: a thunk, and a nick in the crate
        sb.emit('knock', { who: this, crate: c, loud: false, blade: true });
        c.body.applyImpulse(this.facing * 6, 0, p.x, p.y);
        this.anim.freeze = 0.03;
        continue;
      }
      const imp = this.facing * d.power * 26 * this.strength;
      c.body.applyImpulse(imp, d.limb.startsWith('foot') ? 4 : 2, p.x, p.y);
      sb.emit('knock', { who: this, crate: c, loud: true });
      sb.fx.dust(p.x, p.y, 3, 0.4);
      this.anim.freeze = 0.04;
    }
    for (const k of sb.loose()) {
      if (s.hit.has(k)) continue;
      const p = pts[0];
      if (!k.body.contains(p.x, p.y, r + 0.03)) continue;
      s.hit.add(k);
      k.body.applyImpulse(this.facing * 2.2 * k.body.mass / 0.4, 1.2 * k.body.mass / 0.4, p.x, p.y);
    }
  }

  landHit(o, hit, speed, s, weapon) {
    const d = s.def;
    const nominal = d.limb.startsWith('foot') ? 5 : 6;
    const sp = clamp(speed / nominal, 0.55, 1.35);
    const limbPart = { handA: 'armA', handB: 'armB', footA: 'legA', footB: 'legB' }[d.limb];
    const lp = this.health.parts[limbPart];
    const limbOK = clamp(lp.hp / lp.max, 0.4, 1);
    const fury = 1 + (this.brain ? this.brain.emo.anger * 0.15 : 0);
    const mult = weapon === 'knuckles' ? 1.9 : 1;
    const power = d.power * sp * limbOK * this.strength * fury * mult * clamp(this.health.mobility + 0.2, 0.6, 1);
    s.landed = true;
    o.takeHit({
      by: this, part: hit.part, x: hit.x, y: hit.y, dir: this.facing, power, kind: s.kind,
      armed: !!weapon, weapon: d.blade && weapon === 'knife' ? 'knife' : weapon === 'knife' ? null : weapon,
      deep: d.blade === 'stab' && weapon === 'knife', low: d.low, bone: o.boneName(hit.bone, hit.t),
    });
    this.anim.freeze = o.anim.freeze = 0.04 + Math.min(0.05, power * 0.012);
    if (weapon && this.weapon) this.weapon.blood = Math.min(1, this.weapon.blood + (weapon === 'knife' ? 0.25 : 0.12) * power);
    this.notify('landed', { target: o, power, part: hit.part });
  }

  /* -------------------------------------------------------------------------- */
  /*                          animation events and the rest                     */
  /* -------------------------------------------------------------------------- */

  animEvent(ev) {
    const sb = this.sandbox;
    if (ev === 'grab') {
      const item = this.wantItem;
      this.wantItem = null;
      if (item && !item.wornBy && !item.removed && !(item.stuckIn && item.stuckIn.person)) {
        const h = this.wj.handA;
        if (Math.hypot(item.pos.x - h.x, item.pos.y - h.y) < 0.55) {
          if (item.stuckIn) item.unstick();
          item.wear(this);
          this.weapon = item;
          sb.emit('pickup', { who: this, item });
          this.notify('armed', { item });
          return;
        }
      }
      const c = this.wantCrate;
      this.wantCrate = null;
      if (c && !c.carriedBy && !c.removed && !sb.crateOnTop(c)) {
        c.carry(this);
        this.carrying = c;
        sb.emit('lift', { who: this, crate: c });
      }
      if (item && !this.weapon) this.notify('missed', { item });
    } else if (ev === 'release') {
      const c = this.carrying;
      if (!c) return;
      this.carrying = null;
      const t = this.throwTarget || { x: this.pos.x + this.facing * 4, y: 1 };
      const dx = t.x - c.pos.x, dy = t.y - c.pos.y;
      // a flat, hard throw up close, a higher one further away
      const flight = clamp(Math.abs(dx) / 9, 0.22, 0.7);
      const vx = clamp(dx / flight, -14, 14) * this.strength;
      const vy = clamp(dy / flight + 0.5 * G * flight, -2, 9);
      c.release(vx, vy, -sign(vx) * rand(2, 6));
      c.thrownBy = this;
      c.thrownAt = sb.time;
      sb.emit('throw', { who: this, crate: c });
    } else if (ev === 'releaseKnife') {
      const k = this.weapon;
      if (!k || k.kind !== 'knife') return;
      this.weapon = null;
      const t = this.throwTarget || { x: this.pos.x + this.facing * 5, y: 1.2 };
      const h = this.wj.handA;
      const dx = t.x - h.x, dy = t.y - h.y;
      const flight = clamp(Math.abs(dx) / 16, 0.12, 0.45);
      const vx = clamp(dx / flight, -18, 18) * this.strength;
      const vy = clamp(dy / flight + 0.5 * G * flight, -4, 9);
      k.throwFrom(h.x, h.y, vx, vy, this);
      sb.emit('throw', { who: this, knife: k });
    } else if (ev === 'yank') {
      const e = this.stuck[0];
      if (e) {
        const keep = this.brain ? this.brain.wantsToKeep(e.knife) : false;
        this.pullKnife(e, keep ? this : null);
        if (keep && this.weapon) this.notify('armed', { item: this.weapon });
      }
    } else if (ev === 'thud') {
      sb.fx.dust(this.wj.hip.x, this.pos.y, 6, 0.8);
      sb.emit('thud', { who: this, speed: 4, x: this.pos.x, y: this.pos.y });
    } else if (ev === 'knock') {
      sb.emit('knock', { who: this, crate: sb.crateNear(this.wj.handA.x, this.wj.handA.y, 0.3), loud: false });
    } else if (ev === 'clap') {
      sb.emit('clap', { who: this, x: this.wj.handA.x, y: this.wj.handA.y });
    } else if (ev === 'slap') {
      sb.emit('clap', { who: this, x: this.wj.handA.x, y: this.wj.handA.y, soft: true });
    }
  }

  /**
   * The crate overhead goes where the hands go - easing there from wherever
   * it was picked up, rather than jumping, and moving no faster than hands do.
   */
  updateCarried(dt) {
    const c = this.carrying;
    if (!c) return;
    const a = this.wj.handA, b = this.wj.handB;
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2 + c.size / 2 - 0.03;
    const k = 1 - Math.exp(-dt * 22);
    const nx = lerp(c.body.pos.x, x, k), ny = lerp(c.body.pos.y, y, k);
    c.body.vel.x = clamp((nx - c.body.pos.x) / dt, -8, 8);
    c.body.vel.y = clamp((ny - c.body.pos.y) / dt, -8, 8);
    c.body.pos.x = nx;
    c.body.pos.y = ny;
    c.body.rot = 0;
  }

  /** Layered over the clip: breathing, trembling, limping, broken limbs, aim. */
  procedural(p, dt) {
    const t = this.sandbox.time;
    const h = this.health;
    const st = this.state;
    const brain = this.brain;
    const fear = brain ? brain.emo.fear : 0;

    if (st === 'stand' && !this.anim.acting) {
      p.t += Math.sin(t * 1.9 + this.seed) * 0.6 * DEG;
      if (fear > 0.55 && this.conscious) {
        const k = (fear - 0.55) * 4 * DEG;
        p.h += wobble(t * 9, this.seed) * k;
        p.aAu += wobble(t * 11, this.seed + 3) * k;
        p.aBu += wobble(t * 10, this.seed + 7) * k;
      }
      // the head follows whatever they are looking at
      if (this.lookAt) {
        const hx = this.wj.head.x, hy = this.wj.head.y;
        const dx = Math.abs(this.lookAt.x - hx) + 0.3, dy = this.lookAt.y - hy;
        p.h += clamp(-Math.atan2(dy, dx), -0.45, 0.45) * 0.8;
      }
      // cracked ribs: hunched over them
      if (h.bones.ribs.broken) { p.s += 8 * DEG; p.t += 4 * DEG; }
    }

    // limping: the bad leg stays stiff and the body dips onto it
    const limp = h.limp;
    if (limp && st === 'stand' && this.anim.baseName === 'walk') {
      const c = this.anim.base.clip;
      const phase = ((this.anim.base.t % c.duration) + c.duration) % c.duration / c.duration;
      const onBad = limp === 'A' ? phase < 0.5 : phase >= 0.5;
      const amt = 1 - Math.min(h.parts['leg' + limp].hp / h.parts['leg' + limp].max, 0.62) / 0.62 * 0.6;
      if (onBad) { p.lift -= 0.035 * amt; p.t += 7 * DEG * amt; }
      p['l' + limp + 'l'] *= 1 - 0.65 * amt;
    }

    // dizzy: the head will not keep still
    if (h.dizzy > 0 && this.conscious && (st === 'stand' || st === 'stagger')) {
      const k = Math.min(1, h.dizzy / 3);
      p.h += Math.sin(t * 6.5) * 7 * DEG * k;
      p.t += Math.sin(t * 2.7) * 3.5 * DEG * k;
    }

    // a punch angled at its target, on the striking arm only
    if (this.strike && this.aim && this.anim.action) {
      const w = smooth(this.anim.action.w);
      if (this.strike.def.limb === 'handA') p.aAu += this.aim * w;
      else if (this.strike.def.limb === 'handB') p.aBu += this.aim * w;
    }

    // held up by the hand, or turning over in the air (without ragdolls)
    if (st === 'held' && this.held && !this.held.rag) {
      const hd = this.held;
      p.rot = (hd.inverted ? Math.PI : 0) + hd.swing;
      if (hd.inverted) {
        const leg = hd.joint === 'footA' ? 'lA' : 'lB';
        p[leg + 'u'] = 0; p[leg + 'l'] = 0;
      }
      if (!this.conscious) {
        // limp: everything hangs toward the floor, whichever way up they are
        const down = -p.rot;
        for (const k of ['aAu', 'aBu']) p[k] = lerp(p[k], down, 0.85);
        if (hd.inverted) { p.aAu = Math.PI + hd.swing * -0.6; p.aBu = Math.PI + hd.swing * -0.4; }
      }
    } else if (st === 'thrown' || (st === 'dead' && this.thrownDead)) {
      p.rot += this.spin;
    }

    // a useless arm hangs; legs that do not work drag
    for (const side of ['A', 'B']) {
      if (!h.canUse('arm' + side) && h.parts['arm' + side].broken && st !== 'dead' && !LYING.has(st)) {
        p['a' + side + 'u'] = lerp(p['a' + side + 'u'], -p.rot + Math.sin(t * 2 + this.seed) * 0.08, 0.85);
        p['a' + side + 'l'] = lerp(p['a' + side + 'l'], 0.1, 0.8);
      }
    }
    if (h.paralysed !== 'none' && st === 'crawl') {
      p.lAu = lerp(p.lAu, 0, 0.9); p.lAl = 0; p.lBu = lerp(p.lBu, 0, 0.9); p.lBl = 0;
    }
  }

  /**
   * A broken long bone bends where it gave: an arm or a shin hangs from the
   * break, a thigh kinks. Everything below the break turns with it.
   */
  bendBreaks(j) {
    const h = this.health;
    if (this.dead && this.state !== 'held') return;
    const t = this.sandbox.time;
    for (const bone of Object.keys(BREAK_OF)) {
      if (!h.bones[bone].broken) continue;
      const mid = BREAK_OF[bone];
      const m = j[mid];
      const below = BELOW_BREAK[mid];
      const tip = j[below[0]];
      let turn;
      if (bone.startsWith('femur') || bone.startsWith('tibia')) {
        // a leg: kinked at the break, the wrong way for a knee
        turn = (bone.startsWith('femur') ? 0.55 : -0.6) + Math.sin(t * 1.3 + this.seed) * 0.03;
      } else {
        // an arm: the far half swings down the way gravity takes it, with a kink at the break
        const a = Math.atan2(tip.x - m.x, tip.y - m.y);
        turn = clamp(wrapAngle(Math.PI - a), -1.3, 1.3) * 0.6 + (bone.startsWith('humerus') ? 0.35 : 0.45) + Math.sin(t * 2.1 + this.seed) * 0.05;
      }
      const c = Math.cos(turn), s = Math.sin(turn);
      for (const k of below) {
        const q = j[k];
        const dx = q.x - m.x, dy = q.y - m.y;
        q.x = m.x + dx * c + dy * s;
        q.y = m.y - dx * s + dy * c;
      }
    }
  }

  toWorld(dt = 0) {
    const f = this.facing, j = this.joints, w = this.wj;
    for (const k of JOINTS) {
      w[k].x = this.pos.x + f * j[k].x;
      w[k].y = this.pos.y + j[k].y;
    }
    w.headAngle = j.headAngle;
    // coming out of a ragdoll: from where it left them to where the animation has them
    const b = this.blend;
    if (b) {
      b.t += dt;
      const u = smooth(b.t / b.dur);
      for (const k of JOINTS) {
        w[k].x = lerp(b.from[k].x, w[k].x, u);
        w[k].y = lerp(b.from[k].y, w[k].y, u);
      }
      w.headAngle = lerpAngle(b.from.headAngle, w.headAngle, u);
      if (b.t >= b.dur) this.blend = null;
    }
    this.boundsFromJoints();
  }

  /** The kinematic stand-in among the crates: the body without its arms. */
  syncProxy() {
    const b = this.proxy;
    if (!b) return;
    if (this.rag) {
      // limp, the ragdoll touches things itself; the stand-in waits under the floor
      b.setSize(0.12, 0.12);
      b.pos.x = this.pos.x;
      b.pos.y = -3;
      b.vel.x = b.vel.y = 0;
      return;
    }
    const lb = bounds(this.joints, this.scale, false);
    const f = this.facing;
    const x0 = this.pos.x + (f > 0 ? lb.minX : -lb.maxX), x1 = this.pos.x + (f > 0 ? lb.maxX : -lb.minX);
    let w = x1 - x0, cx = (x0 + x1) / 2;
    if (!this.lying && this.state !== 'thrown' && this.state !== 'held') {
      w = Math.min(w, HALF_W * 2 * this.scale - 0.06);
      cx = this.pos.x + f * (this.joints.hip.x * 0.5);
    }
    // from just above the soles up: a stand-in that reached under the feet
    // would sit inside whatever they stand on
    const lo = Math.max(lb.minY, 0) + 0.03;
    b.setSize(Math.max(0.12, w - 0.04), Math.max(0.12, lb.maxY - lo));
    b.pos.x = cx;
    b.pos.y = this.pos.y + (lo + lb.maxY) / 2;
    b.rot = 0;
    b.vel.x = this.vel.x;
    b.vel.y = this.state === 'stand' ? 0 : this.vel.y;
  }

  /* -------------------------------------------------------------------------- */
  /*                                face and blood                              */
  /* -------------------------------------------------------------------------- */

  updateFace(dt) {
    const f = this.face;
    const k = 1 - Math.exp(-dt * 8);
    if (this.dead) {
      f.eyes = 'x'; f.open = lerp(f.open, 0.25, k); f.mouth = lerp(f.mouth, -0.2, k); f.teeth = false; f.tears = 0;
      return;
    }
    if (!this.conscious) {
      f.eyes = 'spiral'; f.open = lerp(f.open, 0.2, k); f.mouth = lerp(f.mouth, -0.3, k); f.brow = 0; f.teeth = false;
      return;
    }
    const e = this.brain ? this.brain.emo : { joy: 0.3, sadness: 0, anger: 0, fear: 0, surprise: 0 };
    const pain = clamp01(this.health.pain / 90);
    const crying = this.posture === 'cry' || e.sadness > 0.78;
    const shouting = this.bubble && this.bubble.loud && this.bubble.t < this.bubble.dur * 0.8;

    let eyes = 'normal';
    if (pain > 0.62 || crying || this.anim.actionName === 'hitHead') eyes = 'squint';
    else if (e.surprise > 0.45 || e.fear > 0.62) eyes = 'wide';
    else if (e.joy > 0.72 && pain < 0.3) eyes = 'happy';
    else if (e.sadness > 0.45) eyes = 'sad';
    this.blinkT -= dt;
    if (this.blinkT < 0) {
      if (eyes === 'normal' || eyes === 'sad') eyes = 'closed';
      if (this.blinkT < -0.12) this.blinkT = rand(1.8, 5);
    }
    f.eyes = eyes;
    f.brow = lerp(f.brow, clamp(-e.anger * 1.1 + Math.max(e.fear, e.sadness, pain * 0.8) * 0.9, -1, 1), k);
    f.browLift = lerp(f.browLift, Math.max(e.surprise, e.fear * 0.5), k);
    f.mouth = lerp(f.mouth, clamp(e.joy * 1.1 - e.sadness - e.fear * 0.5 - pain * 0.7 - e.anger * 0.25, -1, 1), k);
    const open = Math.max(shouting ? 0.9 : 0, e.surprise > 0.4 ? e.surprise * 0.8 : 0, e.fear > 0.7 ? (e.fear - 0.5) * 1.4 : 0, pain > 0.8 ? 0.5 : 0);
    f.open = lerp(f.open, open, k * 1.5);
    f.teeth = e.anger > 0.55 && f.open < 0.2 || (pain > 0.5 && pain < 0.8 && f.open < 0.2);
    f.tears = crying ? (f.tears + dt * 1.3) % 1 || 0.001 : 0;
    f.blood = Math.max(0, f.blood - dt * 0.004);
  }

  /** A mark of blood on a bone: from a wound, or from blood landing on them. */
  mark(bone, t, r, dark = false) {
    for (const w of this.wounds) {
      if (w.bone === bone && Math.abs(w.t - t) < 0.14) { w.r = Math.min(0.95, w.r + r * 0.1); return; }
    }
    if (this.wounds.length > 18) this.wounds.shift();
    this.wounds.push({ bone, t, r: clamp(r, 0.3, 0.8), dark });
  }

  markAt(x, y, r) {
    const n = this.nearestPart(x, y);
    if (n.part === 'head' && (n.bone !== HEAD_BONE || n.t > 0.25)) this.headMark(x, y, r);
    else this.mark(n.bone, n.t, r, chance(0.3));
  }

  /** Blood on the head, kept in the head's own frame so it turns with it. */
  headMark(x, y, size) {
    const j = this.wj, r = DIM.headR * this.scale;
    const ux = (x - j.head.x) * this.facing, uy = y - j.head.y;
    const c = Math.cos(j.headAngle), s = Math.sin(j.headAngle);
    let lx = (ux * c - uy * s) / r, ly = (ux * s + uy * c) / r;
    const d = Math.hypot(lx, ly);
    if (d > 0.8) { lx *= 0.8 / d; ly *= 0.8 / d; }
    if (this.headMarks.length > 14) this.headMarks.shift();
    this.headMarks.push({ x: lx, y: ly, r: clamp(size * 0.22, 0.12, 0.32), dark: chance(0.3) });
  }

  updateBleeding(dt) {
    const b = this.health.bleeding;
    if (b <= 0) return;
    this.dripAcc += b * 1500 * dt;
    if (this.dead && this.onGround) {
      this.sandbox.fx.pool(this.wj.hip.x * 0.5 + this.wj.neck.x * 0.5, this.pos.y, b * dt);
    }
    while (this.dripAcc >= 1) {
      this.dripAcc -= 1;
      let x, y;
      if (this.stuck.length && chance(0.5)) {
        const pose = this.knifePose(this.stuck[Math.floor(Math.random() * this.stuck.length)]);
        x = pose.tipX; y = pose.tipY;
      } else if (this.wounds.length && chance(0.75)) {
        const w = this.wounds[Math.floor(Math.random() * this.wounds.length)];
        const q = pointOnBone(this.wj, w.bone, w.t);
        x = q.x;
        y = q.y;
      } else {
        x = this.wj.head.x; y = this.wj.head.y - DIM.headR * this.scale;
      }
      this.sandbox.fx.drip(x, y, this);
    }
  }
}
