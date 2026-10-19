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
     stagger  rocked by a blow, trying to stay up (with ragdolls off)
     stumble  knocked off balance and stepping to catch it (stumble.js): no
              clip, just the pendulum - they catch it, or go over
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

   Under all of it, vitals.js keeps their adrenaline, their oxygen and their
   temperature going - and sets them on fire, or freezes them solid. Frozen,
   the ragdoll is locked stiff: a statue that stands, topples, and snaps.

   And blood.js says where their blood comes out: from each wound that is
   bleeding, in streams from the worst of them, and - slammed into the floor
   or a wall - from the part of them that hit it. Bled dry, none at all.
   ========================================================================== */
import { Animator } from './animator.js';
import { CLIPS, MASKS } from './clips.js';
import { solve, makeJoints, bounds, JOINTS, BONES, DIM, HEAD_BONE, BELOW_BREAK, boneSegments, pointOnBone, angleOf } from './skeleton.js';
import { Health, KO_LEVEL, SEVERABLE } from './health.js';
import { makeRagdoll, aimMuscles, toJoints, refNear, lyingSide } from './limp.js';
import { heldGunFrame, gunPoint, goneAt } from './draw.js';
import { isBlade, isGun, armOf, Gun, GUN_MODELS } from './props.js';
import { startStumble, updateStumble, stumblePose } from './stumble.js';
import { updateTased } from './taser.js';
import { updateVitals, healVitals, iceBlow, ignite } from './vitals.js';
import { bleedSources, pickSource, feedStreams, splatter, contactOf, woundId, bloodK } from './blood.js';
import { tiedUp } from './wires.js';
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
export const STILL_POSTURES = new Set(['sit', 'sitEdge', 'kneel', 'cry', 'beg', 'cower', 'handsUp', 'pushups', 'squats', 'jacks', 'armsCrossed', 'handsOnHips', 'clutchStomach', 'clutchArm', 'shiver', 'shock', 'clutchStump', 'coverHead', 'handsOnKnees', 'kneelHands', 'sitCuffed', 'think']);
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
const LIMB_OF = { humerusA: 'armA', forearmA: 'armA', humerusB: 'armB', forearmB: 'armB', femurA: 'legA', tibiaA: 'legA', femurB: 'legB', tibiaB: 'legB' };
// the joint before each break point: the way out of the stump a cut there leaves
const BEFORE_CUT = { midHumA: 'shoulder', midForeA: 'elbowA', midHumB: 'shoulder', midForeB: 'elbowB', midFemA: 'hip', midTibA: 'kneeA', midFemB: 'hip', midTibB: 'kneeB' };
// how hard a machete has to come down on each bone to have a chance of going right through
const SEVER_FORCE = { forearm: 9, humerus: 13, tibia: 12, femur: 17 };
// how far out along its limb each break point is, so a cut further in wins
const CHAIN_AT = { midHumA: 1, midForeA: 3, midHumB: 1, midForeB: 3, midFemA: 1, midTibA: 3, midFemB: 1, midTibB: 3 };

// how much breath each strike takes
const STRIKE_COST = { jab: 0.04, cross: 0.062, uppercut: 0.08, kick: 0.1, stomp: 0.08, stab: 0.055, slash: 0.055, chop: 0.105, hack: 0.08, taserZap: 0.045 };
// where each thing they carry can go when it is not in their hand: a holster
// (or the waistband) for a pistol, a pocket for anything small, and on an
// officer's duty belt, a holster of its own for the taser
const SLOTS = { holster: new Set(['glock', 'm1911', 'taser']), duty: new Set(['taser']), pocket: new Set(['knife', 'knuckles', 'taser']), back: new Set(['ak47', 'mossberg']) };

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
    this.heldBy = null;
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
    this.stuck = [];      // blades stuck in them: { knife, bone, t, ang, depth }
    this.cut = {};        // limbs cut off: { armA: 'midForeA', ... }, the point each now ends at
    // a pistol in the hand: who it is pointed at, how long it has been, the kick of the last shot
    this.aimTarget = null;
    this.aimT = 0;
    this.gunAim = 0;
    this.recoil = 0;
    this.reloading = false;

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

    // what a mod made of them: a species with a body and skills of its own,
    // a look, and lines of their own to say (all null for an ordinary stickman)
    this.species = o.species || null;
    this.look = o.look || null;
    this.lines = o.lines || null;
    this.tint = null;         // what they bleed, if it is not blood: [colour, darker colour]
    this.innate = null;       // a weapon that is part of them, while they have it out (props.js ARMS)
    this.gravity = 1;         // how much of their weight they fall with: a flier holds itself up
    this.afflictions = [];    // things at work on them over time: { update(man, dt), draw(ctx, man), label }

    // breath: 1 fresh .. 0 spent. Running, fighting, jumping use it; standing about gets it back
    this.stamina = 1;
    this.exertT = -99;
    this.breath = rand(0, 6);
    // what they carry besides what is in their hand: a pistol in a holster (or the
    // waistband), something small in a pocket - and on an officer, a taser on the duty belt
    this.stowed = { holster: null, pocket: null, duty: null, back: null };
    this.stowing = null;      // { item, slot }: on the way in
    this.drawing = null;      // a slot: on the way out
    this.vest = null;
    this.donning = null;      // a vest going on
    this.role = o.role || null;
    this.cuffed = null;       // { by, t }: hands cuffed behind them
    this.tased = null;        // { by, t, dur }: current going through them (taser.js)
    this.stumble = null;      // the pendulum while they stumble (stumble.js)
    this.knock = 0;           // seconds of being shoved back, the legs going with it
    // fire and ice (vitals.js): the flames on them, the ice they are in, how burned they look
    this.flames = null;
    this.ice = null;
    this.char = 0;
    this.charHead = 0;
    this.smoulder = 0;
    this.rolling = 0;         // seconds left of rolling on the floor to put a fire out
    this.vit = null;
    if (this.species && this.species.init) this.species.init(this, o);
  }

  /* -------------------------------------------------------------------------- */
  /*                                   status                                   */
  /* -------------------------------------------------------------------------- */

  get alive() { return !this.health.dead; }
  /** Tied to something with a rope, a rod or a pin (wires.js). */
  get tied() { return !!this.wires && tiedUp(this); }
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
  get armedWith() { return this.weapon ? this.weapon.kind : this.innate; }
  /** Not to be knocked down, sent flying, ragdolled or picked up: a mod's (a boss that floats). */
  get steadfast() { return !!(this.species && this.species.steadfast); }
  get officer() { return this.role === 'officer'; }
  /** A person in every way the game cares about - holsters, pockets, vests: anybody, or a mod's that passes for one. */
  get human() { return !this.species || !!this.species.human; }
  /** How much of their usual pace, punch and speed of hand their breath leaves them. */
  get effort() { return 0.74 + 0.26 * clamp01(this.stamina / 0.35); }
  /** Something they carry, wherever it is: in the hand, or put away. */
  carries(kind) { return (this.weapon && this.weapon.kind === kind) || Object.values(this.stowed).some((it) => it && it.kind === kind); }
  /** Everything put away on them. */
  get kit() { return Object.entries(this.stowed).filter(([, it]) => it); }
  /** Physics has them: flopping, flying, dangling. */
  get limp() { return !!this.rag; }
  get ragdolls() { return this.sandbox.settings.ragdoll !== false; }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateT = 0;
    if (s !== 'stand') { this.blocking = false; this.pushing = null; }
    if (s !== 'stumble') this.stumble = null;
  }

  /** Breath used. */
  tire(amount) {
    // (some of what a mod makes never runs out of breath: a machine, the undead)
    if (this.species && this.species.tireless) return;
    // (with the adrenaline up, it hardly seems to cost anything)
    this.stamina = Math.max(0, this.stamina - amount * (1.15 - this.health.toughness * 0.3) * (1 - (this.health.adrenaline || 0) * 0.3));
    this.exertT = this.sandbox.time;
  }

  /** A point t of the way along bone b, in the world. */
  bonePoint(b, t) { return pointOnBone(this.wj, b, t); }

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
    if (this.carrying || this.rag || this.reloading || this.cuffed) return out;
    const w = this.armedWith;
    if (h.canUse('armB')) out.push('jab');
    if (h.canUse('armA')) {
      if (w === 'knife') out.push('stab', 'slash');
      else if (w === 'machete' || w === 'crowbar') out.push('chop', 'hack');
      // a taser up close is pressed against them: a drive stun
      else if (w === 'taser') out.push('taserZap');
      // a pistol up close is a lump of steel: a pistol-whip, no uppercuts
      else if (isGun(w)) out.push('cross');
      else out.push('cross', 'uppercut');
    }
    if (h.canUse('legA') && h.canUse('legB')) out.push('kick', 'stomp');
    return this.species && this.species.strikes ? this.species.strikes(this, out) : out;
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
    // out of breath, a punch comes slower
    this.anim.act(kind, { fadeIn: 0.035, fadeOut: 0.12, speed: this.effort });
    this.tire(STRIKE_COST[kind] || 0.03);
    this.strike = { kind, def: clip.strike, hit: new Set(), landed: false, done: false, target };
    this.aim = 0;
    if (target && clip.strike.limb.startsWith('hand') && !clip.strike.rising && !clip.strike.sweep) {
      const sh = this.wj.shoulder;
      const aimY = target.lying ? target.wj.hip.y : clip.strike.body ? target.wj.chest.y : target.wj.head.y - 0.06 * target.scale;
      const dx = Math.max(0.3, Math.abs(target.pos.x - this.pos.x));
      this.aim = clamp(Math.atan2(aimY - sh.y, dx), -38 * DEG, 32 * DEG);
    }
    this.vel.x *= 0.3;
    if (kind === 'cross' || kind === 'stab' || kind === 'chop') this.vel.x += this.facing * 0.6;
    this.sandbox.emit('swing', { who: this, kind, target, weapon: this.armedWith });
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
    if (CLIPS[name].mask !== 'upper' && CLIPS[name].mask !== 'arms' && CLIPS[name].mask !== 'armA') this.vel.x *= 0.2;
    if (name === 'dodge') this.tire(0.05);
    return true;
  }

  jump(vx, vy = 5.6) {
    if (!this.ready || this.health.legsBroken || this.carrying || this.cuffed || this.stamina < 0.05) return false;
    this.tire(0.045);
    this.anim.act('jumpCrouch', { fadeIn: 0.03, fadeOut: 0.04 });
    this.jumpPending = { t: 0.085, vx, vy: vy * (0.75 + this.health.mobility * 0.25) };
    return true;
  }

  /** Bends down for something on the floor in front of them: knuckles, a knife. */
  pickUp(item) {
    if (!this.ready || item.wornBy || this.carrying || this.cuffed || item.frozenInPlace) return false;
    // hands full: only if one of the two can go in a pocket or a holster first
    if (this.weapon && item.kind !== 'vest' && !this.slotFor(item) && !this.slotFor(this.weapon)) return false;
    if (item.kind === 'vest' && (this.vest || this.donning)) return false;
    if (this.species && this.species.canPickUp && !this.species.canPickUp(this, item)) return false;
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

  /* --------------------------- holsters and pockets --------------------------- */

  /** Where something could be put away on them right now: a free slot it fits, or null. */
  slotFor(item) {
    if (!item || !this.human) return null;
    const order = item.kind === 'taser' ? (this.officer ? ['duty', 'holster', 'pocket'] : ['holster', 'pocket']) : ['holster', 'pocket', 'back'];
    for (const k of order) if (SLOTS[k].has(item.kind) && !this.stowed[k] && (k !== 'duty' || this.officer)) return k;
    return null;
  }

  /** Puts what is in their hand away: into its holster, or a pocket. Takes a moment. */
  stow() {
    const w = this.weapon;
    if (!w || !this.ready || this.cuffed || this.reloading || this.stowing || this.drawing) return false;
    const slot = this.slotFor(w);
    if (!slot) return false;
    this.lowerGun();
    this.stowing = { item: w, slot };
    this.anim.act(slot === 'pocket' ? 'pocket' : 'holster', { fadeIn: 0.06, fadeOut: 0.12 });
    return true;
  }

  /** Gets something out of a holster or a pocket into the hand, if the hand is free. */
  drawFrom(slot) {
    const it = this.stowed[slot];
    if (!it || this.weapon || !this.ready || this.cuffed || this.stowing || this.drawing || !this.health.canUse('armA') || this.cut.armA) return false;
    this.drawing = slot;
    this.anim.act(slot === 'pocket' ? 'unpocket' : 'drawGun', { fadeIn: 0.05, fadeOut: 0.12, speed: 0.85 + (this.brain ? this.brain.traits.skill : 0.5) * 0.4 });
    return true;
  }

  /** Into a slot straight away, no hands needed (an officer's kit, at the start). */
  equip(item, slot = null) {
    const k = slot || this.slotFor(item);
    if (!k || this.stowed[k]) return false;
    item.wear(this);
    this.stowed[k] = item;
    return true;
  }

  /** Whatever slot something is in, it is not there any more (it was removed, or taken). */
  unequip(item) {
    for (const k of Object.keys(this.stowed)) if (this.stowed[k] === item) this.stowed[k] = null;
    if (this.weapon === item) { this.weapon = null; this.aimTarget = null; this.reloading = false; }
    if (this.stowing && this.stowing.item === item) this.stowing = null;
  }

  /** Everything put away falls out (they died): onto the floor by their hips. */
  dropStowed(fling = 0.5) {
    const h = this.wj.hip;
    for (const k of Object.keys(this.stowed)) {
      const it = this.stowed[k];
      if (!it) continue;
      this.stowed[k] = null;
      it.drop(h.x + rand(-0.15, 0.15), Math.max(h.y, 0.15), this.vel.x + rand(-1, 1) * fling, rand(0.3, 1.5) * fling);
      this.sandbox.emit('drop', { who: this, item: it });
    }
    this.stowing = null;
    this.drawing = null;
  }

  /** A vest, picked up off the floor, going on over the head. */
  wearVest(v) {
    if (this.vest || this.cuffed) return false;
    this.donning = v;
    v.wear(this);
    this.anim.act('vestOn', { fadeIn: 0.08, fadeOut: 0.18 });
    return true;
  }

  /** Down to the ammo box beside them, for a handful of rounds. */
  takeAmmo(box) {
    if (!this.ready || this.cuffed || !box || box.removed || box.empty) return false;
    if (Math.abs(box.pos.x - this.pos.x) > 0.95) return false;
    this.facing = sign(box.pos.x - this.pos.x);
    this.ammoBox = box;
    this.anim.act('ammoGrab', { fadeIn: 0.08, fadeOut: 0.18 });
    this.vel.x = 0;
    return true;
  }

  /** The guns they carry, in the hand or put away. */
  get guns() { return [this.weapon, ...Object.values(this.stowed)].filter((g) => g && (g instanceof Gun || g.kind === 'taser')); }

  /** Handcuffed, by an officer: whatever they had is taken off them first. */
  cuff(by) {
    if (this.cuffed || this.dead) return false;
    this.cuffed = { by, t: this.sandbox.time };
    this.strike = null;
    this.blocking = false;
    this.lowerGun();
    this.dropCarried();
    const where = by ? by.pos.x - sign(this.pos.x - by.pos.x) * 0.6 : this.pos.x;
    const taken = [this.weapon, ...Object.values(this.stowed)].filter(Boolean);
    this.weapon = null;
    for (const k of Object.keys(this.stowed)) this.stowed[k] = null;
    this.stowing = this.drawing = null;
    // put down behind the officer, out of their reach
    for (const it of taken) it.drop(where + rand(-0.2, 0.2), 0.2, 0, 0.5);
    if (this.posture === 'handsUp' || this.posture === 'beg' || this.posture === 'cower') this.posture = null;
    if (this.rag) this.rebuildRag();
    this.sandbox.emit('cuffed', { who: this, by, x: this.wj.handA.x, y: this.wj.handA.y, taken });
    this.notify('cuffed', { by });
    return true;
  }

  uncuff() {
    if (!this.cuffed) return false;
    const by = this.cuffed.by;
    this.cuffed = null;
    if (this.posture === 'sitCuffed') this.posture = null;
    if (this.rag) this.rebuildRag();
    this.sandbox.emit('uncuffed', { who: this, by, x: this.wj.handA.x, y: this.wj.handA.y });
    this.notify('uncuffed', { by });
    return true;
  }

  dropWeapon(fling = 0) {
    const w = this.weapon;
    if (!w) return;
    this.weapon = null;
    this.aimTarget = null;
    this.reloading = false;
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

  /* ------------------------------ the pistol ------------------------------ */

  /** A pistol in a hand that can still hold it. */
  get gunReady() {
    // a gun in the hand - or, from a mod, a hand that is one
    const gun = (isGun(this.armedWith) && !!this.weapon) || (!!this.species && !!this.species.ranged && this.species.ranged(this));
    return gun && !this.cut.armA && this.health.canUse('armA');
  }

  /** Points the pistol at someone (or at a spot, { x, y }). It takes a moment to settle on them. */
  aimAt(target) {
    if (!this.gunReady || !target) return false;
    if (!this.aimTarget) this.aimT = 0;
    this.aimTarget = target;
    return true;
  }

  lowerGun() { this.aimTarget = null; }

  get aiming() { return !!this.aimTarget && this.gunReady && this.state === 'stand' && !this.reloading && !this.rag; }

  /** 0 just brought up .. 1 settled on whatever it is pointed at. */
  get steady() { return clamp01(this.aimT / 0.55); }

  /** What they are aiming at, as a point: the middle of the body, lower if they are on the floor. */
  aimPoint() {
    const t = this.aimTarget;
    if (!t) return null;
    if (t.kind !== 'stickman') return t;
    const w = t.wj;
    return t.lying ? { x: (w.hip.x + w.chest.x) / 2, y: (w.hip.y + w.chest.y) / 2 } : { x: w.chest.x, y: w.chest.y + 0.08 * t.scale };
  }

  /**
   * Pulls the trigger: a bullet out of the muzzle toward what they are aiming
   * at, give or take - how far off depends on how good a shot they are, how
   * scared, hurt, dizzy and out of breath, how long they have had it on the
   * target, and how soon after the last one it is. An empty gun just clicks.
   */
  fire() {
    const g = this.weapon, sb = this.sandbox;
    if (!this.aiming || this.anim.acting) return false;
    // a hand that is a gun, or a gun that works its own way
    if (!g) return this.species && this.species.fire ? this.species.fire(this) : false;
    if (g.fire) return g.fire(this);
    const now = sb.time;
    const spec = g.spec || GUN_MODELS.glock;
    if (now - g.lastShot < spec.cadence) return false;
    const frame = heldGunFrame(this.wj, this.scale, this.facing, spec.grip);
    const m = gunPoint(frame, spec.muzzle.x, spec.muzzle.y);
    if (g.mag <= 0) {
      if (now - (this.dryT || -9) > 0.4) { this.dryT = now; sb.emit('dryFire', { who: this, x: m.x, y: m.y }); }
      return false;
    }
    const tp = this.aimPoint();
    let a = frame.a;
    if (tp && this.steady > 0.3) a = Math.atan2(tp.y - m.y, tp.x - m.x);
    a += gauss() * this.spread();
    g.mag--;
    g.lastShot = now;
    this.recoil = spec.kick;
    sb.fx.flash(m.x, m.y, a, spec.kick > 1.2 ? 1.3 : 1);
    const port = gunPoint(frame, spec.port.x, spec.port.y);
    // (a shotgun's shell comes out when it is pumped: a moment later)
    if (spec.pump) sb.later(0.32, () => sb.fx.casing(port.x, port.y, -this.facing * rand(1, 2), rand(2, 3.2), { shell: true }));
    else sb.fx.casing(port.x, port.y, -this.facing * rand(1.2, 2.4), rand(2.4, 4), spec.long ? { long: true } : undefined);
    const target = this.aimTarget && this.aimTarget.kind === 'stickman' ? this.aimTarget : null;
    sb.emit('shot', { who: this, gun: g, x: m.x, y: m.y, target, loud: true, heavy: spec.energy > 1.1 || !!spec.pellets, kind: g.kind });
    // a shotgun: a handful of pellets, spreading
    if (spec.pellets) for (let i = 0; i < spec.pellets; i++) sb.shoot(this, m.x, m.y, a + gauss() * spec.spread * DEG, { target, energy: spec.energy, pellet: true });
    else sb.shoot(this, m.x, m.y, a, { target, energy: spec.energy });
    return true;
  }

  /** How far a shot might go off the line they are aiming along, in radians (about one standard deviation). */
  spread() {
    const T = this.brain ? this.brain.traits : null, E = this.brain ? this.brain.emo : null;
    let s = 1 + (1 - (T ? T.skill : 0.5)) * 4.5;
    if (E) s += E.fear * 4 + E.anger * 1.5;
    s += Math.min(1, this.health.pain / 100) * 3 + Math.min(1, this.health.dizzy / 2) * 3;
    s += Math.min(1, Math.abs(this.vel.x) / 2) * 3;
    s += (1 - this.steady) * 4;
    // out of breath, the sights will not keep still; nor with the adrenaline up, or shivering
    s += (1 - clamp01(this.stamina / 0.5)) * 2.5;
    s += (this.health.adrenaline || 0) * 3 + Math.max(0, 35 - (this.health.temp ?? 37)) * 0.8;
    // and a heavy pistol takes longer to come back down after each shot
    const kick = this.weapon && this.weapon.spec ? this.weapon.spec.kick : 1, back = 0.35 * Math.max(1, kick);
    const since = this.sandbox.time - (this.weapon ? this.weapon.lastShot : this.lastShotT ?? -99);
    if (since < back) s += 3 * kick * (1 - since / back);
    if (!this.health.canUse('armB') || this.cut.armB) s *= 1.35;
    return s * DEG;
  }

  /** The empty magazine out and a full one in, if there is one: it takes a second or so, less for the practised. */
  reload() {
    const g = this.weapon;
    if (!g || !g.canReload || !g.canReload() || this.reloading || this.cuffed) return false;
    if (!(this.state === 'stand' && this.onGround && !this.anim.acting && !this.rag)) return false;
    if (!this.health.canUse('armA') || this.cut.armA) return false;
    const skill = this.brain ? this.brain.traits.skill : 0.5;
    this.anim.act(g.kind === 'taser' ? 'reloadTaser' : 'reload', { fadeIn: 0.1, fadeOut: 0.15, speed: 0.75 + skill * 0.55 });
    this.reloading = true;
    this.sandbox.emit('reload', { who: this });
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
        if (goneAt(this.cut, b, (g[4] + g[5]) / 2)) continue;
        const sd = segDist(x, y, g[0], g[1], g[2], g[3]);
        const d = sd.d - half;
        if (d <= r && (!best || d < best.d)) best = { part: BONES[b][2], d, x: sd.x, y: sd.y, bone: b, t: g[4] + (g[5] - g[4]) * sd.t };
      }
    }
    return best;
  }

  /**
   * Where a ray from (px, py) along the unit (dx, dy) first meets this body,
   * within max: { t, part, bone, tb, x, y }, or null. The bones are taken a
   * little fatter than they are drawn, so a bullet does not slip between two.
   */
  rayHit(px, py, dx, dy, max) {
    const bb = this.box, s = this.scale, R = (DIM.line / 2) * s + 0.015;
    if (!rayAabb(px, py, dx, dy, max, bb.minX - R, bb.maxX + R, bb.minY - R, bb.maxY + R)) return null;
    const j = this.wj;
    let best = null;
    const hr = DIM.headR * s + R * 0.6;
    const ox = px - j.head.x, oy = py - j.head.y;
    const pb = ox * dx + oy * dy, c = ox * ox + oy * oy - hr * hr;
    const disc = pb * pb - c;
    if (disc >= 0) {
      const t = -pb - Math.sqrt(disc);
      if (t > 1e-4 && t < max) best = { t, part: 'head', bone: HEAD_BONE, tb: 1 };
    }
    const ex = px + dx * max, ey = py + dy * max;
    for (let k = 0; k < BONES.length; k++) {
      for (const g of boneSegments(j, k)) {
        if (goneAt(this.cut, k, (g[4] + g[5]) / 2)) continue;
        const r = segSeg(px, py, ex, ey, g[0], g[1], g[2], g[3]);
        if (r.d > R) continue;
        const t = r.s * max - Math.sqrt(Math.max(0, R * R - r.d * r.d));
        if (t > 1e-4 && (!best || t < best.t)) best = { t, part: BONES[k][2], bone: k, tb: g[4] + (g[5] - g[4]) * r.u };
      }
    }
    if (best) { best.x = px + dx * best.t; best.y = py + dy * best.t; }
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
    const weapon = h.weapon || (h.armed ? 'knuckles' : null);
    const bullet = weapon === 'bullet';
    // a weapon from a mod says for itself what it does (props.js ARMS)
    const spec = armOf(weapon);
    const burn = !!(spec && spec.burn);
    // (a raised arm does nothing against a bullet, or a beam)
    if (!wasDead && this.blocking && this.state === 'stand' && fromFront && (part === 'head' || part === 'torso') && h.kind !== 'impact' && !bullet && !burn) {
      blocked = true;
      part = this.cut.armA ? 'armB' : this.cut.armB ? 'armA' : chance(0.5) ? 'armA' : 'armB';
    }
    const blade = isBlade(weapon) || !!(spec && spec.blade);
    const sharp = blade ? (spec && spec.sharp !== undefined ? spec.sharp : 1) : weapon === 'knuckles' ? 0.6 : 0;
    const chops = weapon === 'machete' || !!(spec && spec.chop);
    const MUL = { head: 1.25, torso: 1, armA: 0.7, armB: 0.7, legA: 0.75, legB: 0.75 };
    // an arm up against a fist or a knife takes the sting out of it; against a
    // machete it just puts the forearm where the blade comes down
    const parried = blocked && (weapon === 'machete' || !!(spec && spec.sever));
    if (parried) { blocked = false; h = { ...h, bone: 'forearm' + part.slice(-1) }; }
    // some bodies are harder to hurt than others (a mod's)
    const armor = this.species && this.species.armor ? this.species.armor(this, h, part, weapon) : 1;
    // a vest takes the worst out of what lands on the body (a bullet's is in shot())
    const vestK = part === 'torso' && this.vest && !blocked && !bullet && !burn && weapon !== 'vestRound' && h.kind !== 'fall'
      ? (blade ? this.vest.bladeThrough(h.kind) : 0.85) : 1;
    const dmg = 9 * h.power * MUL[part] * (blocked ? 0.3 : parried ? 0.85 : 1) * rand(0.85, 1.15) * armor * vestK;
    const res = this.health.hit(part, dmg, {
      sharp: (blocked ? sharp * 0.5 : sharp) * vestK, deep: !!h.deep && !blocked && vestK > 0.7, chop: chops && !blocked && vestK > 0.7, shot: bullet || !!(spec && spec.shot),
      bone: blocked ? null : h.bone || null, breakChance: h.kind === 'stomp' ? 0.06 : spec && spec.breaks ? spec.breaks : 0, strike: h.kind,
      burn, cutBy: spec ? spec.wound || null : null, cause: spec ? spec.cause || null : null,
      // (an arrow is not a bullet: one to the head does not have to be the end of them)
      instakill: !(spec && spec.instakill === false),
    });

    if (h.by && h.by !== this && !blocked && (res.wound || bullet || (blade && dmg > 4))) this.woundedBy = { by: h.by, t: this.sandbox.time };
    // blood, if the skin went or the face took it (a bullet's is its own: see shot())
    const spray = !bullet && !burn && !this.health.frozen && (res.wound || (part === 'head' && dmg > 10) || (weapon && dmg > 6));
    if (spray && !blocked) {
      const n = Math.round(clamp(dmg * (weapon === 'machete' ? 1.3 : spec && spec.spray ? spec.spray : sharp > 0.9 ? 0.9 : 0.6), 3, 30));
      this.sandbox.fx.blood(h.x, h.y, h.dir * (1 + h.power), 1 + h.power * 0.5, n, 1, this);
      // a blade going in hard lets out a squirt of it, back the way the blow came
      if (blade && dmg > 14 && h.x !== undefined) {
        this.sandbox.fx.gush(h.x, h.y, -(h.dir || 1) * rand(0.6, 1.6), rand(0.8, 1.8), clamp(dmg / 40, 0.3, 0.9) * bloodK(this), 0.18, this);
      }
      if (h.x !== undefined) {
        this.markAt(h.x, h.y, 0.7 + dmg * 0.02, -(h.dir || 0));
        // a machete leaves it open (and a set of claws, three times over)
        const gashes = weapon === 'machete' ? 1 : spec && spec.gash ? spec.gash : 0;
        if (gashes && res.wound) {
          const n2 = this.nearestPart(h.x, h.y);
          if (n2.part !== 'head') {
            const tilt = rand(-0.5, 0.5);
            for (let i = 0; i < gashes; i++) this.addWound({ bone: n2.bone, t: clamp(n2.t + (i - (gashes - 1) / 2) * 0.09, 0.05, 0.95), r: 0.6, gash: tilt, side: -(h.dir || 0) });
          }
        }
      }
      if (part === 'head') this.face.blood = Math.min(1, this.face.blood + dmg / 35);
    }
    // a burn: a black scorch where it touched, and a wisp of smoke - and now and then, it catches
    if (burn && h.x !== undefined && !blocked) {
      const n2 = this.nearestPart(h.x, h.y);
      if (n2.part === 'head') this.headMark(h.x, h.y, 0.9, true);
      else this.addWound({ bone: n2.bone, t: n2.t, r: 0.5, burn: true });
      this.sandbox.fx.dust(h.x, h.y, 2, 0.3);
      if (!(spec && spec.ignite === false) && chance(clamp(dmg / 40, 0, 0.3) * 0.4)) ignite(this, { part, power: 0.35, by: h.by || null });
    }
    // hard enough, a machete goes right through; a kick to the knee can put it out
    if ((weapon === 'machete' || (spec && spec.sever)) && !blocked && !this.removed) this.trySever(h, dmg, spec ? spec.sever : 1);
    if ((h.kind === 'kick' || h.kind === 'stomp') && !blocked && (h.bone === 'tibiaA' || h.bone === 'tibiaB' || h.bone === 'femurA' || h.bone === 'femurB') &&
      h.power > 1.3 && chance(0.07 * h.power)) this.dislocate('knee' + h.bone.slice(-1));
    if (dmg > 3) this.sandbox.fx.burst(h.x, h.y, h.power);
    // a taser pressed against them: it does not put them down, but nothing hurts like it
    if (weapon === 'taserZap' && !blocked && !wasDead) {
      this.health.pain = Math.min(130, this.health.pain + 32);
      this.tire(0.3);
      this.sandbox.fx.sparks(h.x, h.y, 4);
      this.sandbox.emit('driveStun', { who: this, by: h.by, x: h.x, y: h.y });
    }
    this.hurtT = this.sandbox.time;
    this.sandbox.emit('hit', { who: this, by: h.by, part, power: h.power, blocked, armed: !!weapon, weapon,
      kind: h.kind, x: h.x, y: h.y, damage: dmg, fatal: res.fatal && !wasDead, object: h.object || null, deep: !!h.deep });
    // frozen solid: the ice cracks, a limb may snap off, the whole of them may shatter
    if (this.health.frozen && !blocked) {
      iceBlow(this, { part, bone: h.bone, power: h.power, x: h.x, y: h.y, dir: h.dir, by: h.by, bullet });
      if (this.removed) return res;
    }
    if (wasDead) {
      this.vel.x += h.dir * h.power * 0.4;
      if (this.rag) this.rag.shove(h.x, h.y, h.dir * h.power * 1.4, h.power * 0.4);
      return res;
    }
    this.lastHit = { by: h.by, t: this.sandbox.time, part, power: h.power, kind: h.kind, blocked, object: h.object || null, weapon };

    // a blade cuts more than it shoves, and a bullet more still
    const shove = h.power * (blocked ? 0.25 : 1) * (weapon === 'knife' ? 0.55 : weapon === 'machete' ? 0.8 : bullet ? 0.35 : spec && spec.shove !== undefined ? spec.shove : 1);
    this.balance -= shove * (part === 'head' ? 0.36 : 0.27) * (1.2 - this.health.toughness * 0.35);
    // taking one knocks the wind out of them a little
    if (!blocked) this.tire(0.015 + dmg * 0.003);
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

    // how far the blow sends them: a jab rocks them back, a hard one puts them back a step or two
    const kb = this.knockback(h, shove, part, blocked);
    // something too big to be knocked about (a mod's): it flinches, and that is all
    if (this.species && this.species.sturdy && this.state === 'stand') {
      // (and not even that, in the middle of something)
      if (!this.anim.acting) this.flinch(part, h.dir, shove, blocked);
      this.shoveBack(h.dir * kb * 0.15);
      return res;
    }
    switch (this.state) {
      case 'stand':
      case 'stagger':
      case 'getup': {
        if (this.carrying && shove > 0.8) this.dropCarried();
        // shot, people go down: a leg that will not hold, or the body just giving way
        if (bullet && this.weapon && part === 'armA' && chance(0.6)) this.dropWeapon(1);
        // how much it takes to put them off balance: less for the tired, the battered, the half-up
        // (a jab never does it; a cross or a kick often does, an uppercut more often still)
        const steady = (0.45 + this.balance * 0.6 + this.health.toughness * 0.3) * (0.55 + 0.45 * clamp01(this.stamina / 0.4)) * (this.state === 'getup' ? 0.6 : 1) * rand(0.85, 1.2);
        if ((res.broke || this.cut.legA || this.cut.legB) && this.health.legsBroken) this.knockDown(h.dir, shove, h);
        else if (bullet && chance((part.startsWith('leg') ? 0.55 : part === 'torso' ? 0.35 : 0.1) + Math.max(0, this.health.shots - 1) * 0.18)) this.knockDown(h.dir, shove + 0.5, h);
        else if (this.balance < -0.25) this.knockDown(h.dir, shove, h);
        else if (this.state === 'stand' && this.canStumble && (this.balance < 0.32 || kb > steady)) {
          this.flinchFace(part);
          startStumble(this, h.dir * kb, { high: part === 'head' || part === 'torso', by: h.by });
        } else if (this.balance < 0.32 || shove > 1.7) this.staggerFrom(h.dir, shove);
        else { this.flinch(part, h.dir, shove, blocked); this.shoveBack(h.dir * kb * (blocked ? 0.5 : 1)); }
        break;
      }
      case 'stumble':
        // already reeling: another one on top is usually the end of it
        startStumble(this, h.dir * kb, { high: part === 'head' || part === 'torso', by: h.by });
        if (this.balance < 0) this.knockDown(h.dir, shove, h);
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
    if (blocked) this.tire(0.03);
  }

  /** Just the face of it, for a blow that sends them stumbling (the stumble does the rest). */
  flinchFace() { this.strike = null; this.anim.freeze = Math.max(this.anim.freeze, 0.03); }

  /** Can a blow put them off balance, rather than straight down or not at all? */
  get canStumble() {
    return !this.steadfast && !(this.species && this.species.sturdy) && !this.carrying && !this.rag && this.health.canUse('legA') && this.health.canUse('legB') && !this.cuffed && this.onGround;
  }

  /**
   * How fast a blow sends them back, in m/s: by how hard it was and what it
   * was - a fist, a boot, a round - and against how much body (a light one
   * goes further; a tough one gives less).
   */
  knockback(h, shove, part, blocked) {
    const k = h.kind === 'shot' ? 1.15 : h.kind === 'impact' ? 0.95 : 1.1;
    const kb = shove * k * (blocked ? 0.45 : 1) * (part === 'legA' || part === 'legB' ? 0.6 : 1) * (1.12 - this.health.toughness * 0.25) / Math.sqrt(this.scale);
    return clamp(kb, 0, 6);
  }

  /** Shoved back by a blow, the legs going with it rather than fighting it, for a moment. */
  shoveBack(vx) {
    if (this.steadfast || Math.abs(vx) < 0.05) return;
    this.vel.x += vx;
    this.knock = Math.max(this.knock, 0.16 + Math.abs(vx) * 0.12);
  }

  staggerFrom(dir, shove) {
    if (this.steadfast) return;
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
    if (!this.alive || this.state === 'held' || this.steadfast) return;
    this.strike = null;
    this.dropCarried();
    if (this.weapon && chance(this.armedWith === 'knuckles' ? 0.25 : isGun(this.armedWith) ? 0.45 : 0.35)) this.dropWeapon(1);
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
    if (!this.alive || this.steadfast) return;
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
    if (this.steadfast) return;
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

  /**
   * A wound to keep: a gash, a bullet hole, a mark of blood. Old ones give
   * way to new - blood that only landed on them first, then marks, and the
   * holes and gashes last.
   */
  addWound(w) {
    if (w.id === undefined) w.id = woundId();
    if (this.wounds.length > 22) {
      let i = this.wounds.findIndex((x) => x.stain);
      if (i < 0) i = this.wounds.findIndex((x) => !x.hole && !x.gash);
      this.wounds.splice(Math.max(0, i), 1);
    }
    this.wounds.push(w);
  }

  /** A machete coming down on an arm or a leg, hard enough, goes right through it. */
  trySever(h, dmg, k = 1) {
    const bone = h.bone;
    if (!bone || !SEVERABLE.includes(bone) || this.steadfast) return false;
    const thr = SEVER_FORCE[bone.replace(/[AB]$/, '')];
    if (dmg < thr) return false;
    if (!chance(((h.kind === 'chop' ? 0.1 : 0.03) + (dmg - thr) * 0.025) * k)) return false;
    return this.sever(bone, h.dir, h.power);
  }

  /**
   * Cut off through the middle of `bone`: everything further out than that
   * comes away as a piece of its own (a Limb), going the way it was going.
   */
  sever(bone, dir = 0, power = 1, o = {}) {
    const h = this.health, limb = LIMB_OF[bone], mid = BREAK_OF[bone];
    if (!limb || h.severed[bone] || this.steadfast) return false;
    // nothing to cut if it is already gone from further in
    if (this.cut[limb] && CHAIN_AT[this.cut[limb]] <= CHAIN_AT[mid]) return false;
    const w = this.wj, pw = this.prevWj, sb = this.sandbox;
    const below = BELOW_BREAK[mid];
    const pts = [mid, ...below].map((k) => ({ x: w[k].x, y: w[k].y }));
    const end = below[below.length - 1];
    const vx = clamp((w[end].x - pw[end].x) * 120, -12, 12), vy = clamp((w[end].y - pw[end].y) * 120, -12, 12);
    const piece = sb.addLimb(pts, bone, this.name, vx + dir * (1 + power), vy + 1.2, rand(-6, 6), this.scale);
    // (as much as there was in them to bleed)
    if (piece) { piece.tint = this.tint; piece.from = this; piece.bleed = bloodK(this); }
    // frozen solid, it comes off like an icicle: no blood (yet), just ice
    const frozen = h.frozen;
    if (piece && frozen) { piece.iced = true; piece.bleed = 0; }
    h.sever(bone);
    this.cut[limb] = mid;
    if (limb === 'armA') { if (this.weapon) this.dropWeapon(0.5); this.aimTarget = null; }
    if (limb.startsWith('arm')) this.dropCarried();
    const m = w[mid];
    if (frozen) sb.fx.shards(m.x, m.y, 14, dir * 2, 1.4);
    else {
      sb.fx.blood(m.x, m.y, dir * 2.5, 2, 32, 1.4, this);
      this.markAt(m.x, m.y, 0.9);
      // out of the end of what is left, the moment it comes off (and then for as long as it bleeds: blood.js)
      const a = w[BEFORE_CUT[mid]] || w.hip, d = Math.hypot(m.x - a.x, m.y - a.y) || 1;
      const k = bloodK(this);
      sb.fx.gush(m.x, m.y, (m.x - a.x) / d * 2.8 + dir, (m.y - a.y) / d * 2.8 + 0.8, k, 0.35, this, null,
        (st) => { const p = this.wj[mid]; if (p) { st.x = p.x; st.y = p.y; } });
    }
    // a blade stuck in what came off goes with it, onto the floor
    for (const e of [...this.stuck]) if (goneAt(this.cut, e.bone, e.t)) this.pullKnife(e, null);
    this.wounds = this.wounds.filter((x) => !goneAt(this.cut, x.bone, x.t));
    if (this.rag) this.rebuildRag();
    // (o.quiet: something else says what happened - a frozen body coming apart)
    if (!o.quiet) sb.emit('sever', { who: this, bone, lost: h.lostAt(bone), x: m.x, y: m.y, by: this.lastHit ? this.lastHit.by : null });
    this.notify('severed', { bone, lost: h.lostAt(bone) });
    return true;
  }

  /** A joint knocked out of its socket. */
  dislocate(joint) {
    if (this.dead || !this.health.dislocate(joint)) return false;
    if ((joint === 'shoulderA' || joint === 'elbowA') && this.weapon) this.dropWeapon(0.4);
    if (joint.startsWith('shoulder') || joint.startsWith('elbow')) this.dropCarried();
    if (this.rag) this.rebuildRag();
    const at = this.wj[joint.startsWith('shoulder') ? 'shoulder' : joint];
    this.sandbox.emit('dislocate', { who: this, joint, x: at.x, y: at.y });
    this.notify('dislocated', { joint });
    return true;
  }

  /** Back in: someone took hold and pulled. */
  relocate(joint, by = null) {
    if (!this.health.relocate(joint)) return false;
    if (this.rag) this.rebuildRag();
    const at = this.wj[joint.startsWith('shoulder') ? 'shoulder' : joint];
    this.sandbox.emit('relocate', { who: this, joint, by, x: at.x, y: at.y });
    this.notify('relocated', { joint, by });
    return true;
  }

  /** The ragdoll made again, for a body that has changed under it: a limb gone, a joint out or back in. */
  rebuildRag() {
    const st = this.state, tone = this.baseTone;
    this.rag = null;
    this.goLimp({ state: st === 'ko' ? 'ko' : st, tone });
    // held up while it happened: still held, by the same place
    const h = this.held;
    if (this.rag && h && h.rag) this.rag.grab(refNear(this.rag, this, h.target.x, h.target.y), h.target.x, h.target.y);
  }

  /**
   * A bullet hitting them where rayHit said, going along (dx, dy) with
   * `energy` left (1 out of the muzzle). It makes a hole, takes what it takes
   * - and comes out of the far side with what it has left, or stays in.
   * Returns the energy it comes out with (0 if it stayed in).
   */
  shot(by, hit, dx, dy, energy) {
    const bone = this.boneName(hit.bone, hit.tb);
    const part = hit.part;
    const sb0 = this.sandbox;
    // in the body, with a vest on: it may stop there - and still land like a hammer
    if (part === 'torso' && this.vest && energy > 0.2) {
      const t = hit.bone === 0 ? hit.tb * 0.5 : 0.5 + hit.tb * 0.5;
      const front = sign(dx) !== this.facing;
      if (this.vest.stopsRound(energy, t, front ? 1 : -1)) {
        sb0.fx.dust(hit.x, hit.y, 3, 0.35);
        this.takeHit({ by, part, x: hit.x, y: hit.y, dir: sign(dx) || 1, power: 1.15 * energy, kind: 'shot', weapon: 'vestRound', bone: 'ribs' });
        sb0.emit('vestStop', { who: this, by, x: hit.x, y: hit.y, energy });
        return 0;
      }
    }
    const stop = (part === 'torso' ? 0.64 : part === 'head' ? 0.68 : 0.4) * rand(0.8, 1.2);
    const left = energy - stop;
    const through = left > 0.15;
    const sb = this.sandbox;
    if (part === 'head') this.headMark(hit.x, hit.y, 1.2);
    else this.addWound({ bone: hit.bone, t: hit.tb, r: 0.5, hole: true, side: -sign(dx) });
    if (this.health.frozen) sb.fx.shards(hit.x, hit.y, 6, dx * 2, 0.8);
    else {
      sb.fx.blood(hit.x, hit.y, -dx * 1.2, -dy * 1.2 + 0.5, 4, 0.5, this);
      if (through) {
        sb.fx.blood(hit.x + dx * 0.05, hit.y + dy * 0.05, dx * 5, dy * 5 + 0.5, 16, 1.3, this);
        sb.fx.gush(hit.x + dx * 0.05, hit.y + dy * 0.05, dx * 3.4, dy * 3.4 + 0.4, 0.8 * bloodK(this), 0.12, this);
      }
    }
    this.takeHit({ by, part, x: hit.x, y: hit.y, dir: sign(dx) || 1, power: 2.7 * energy, kind: 'shot', weapon: 'bullet', bone, through });
    if (!through && !this.removed) this.health.lodge(bone);
    sb.emit('bulletHit', { what: this, x: hit.x, y: hit.y, energy });
    return through ? left : 0;
  }

  die(cause, killer = null, dir = 0, power = 1, at = null) {
    if (this.state === 'dead') return;
    if (!this.health.dead) this.health.kill(cause);
    // frozen solid, nothing moves: the statue just stops being alive (and keeps hold of whatever it had)
    if (this.health.frozen) {
      this.strike = null;
      this.tased = null;
      this.dropCarried();
      if (this.state !== 'held') this.setState('dead');
      this.bubble = null;
      this.thought = null;
      this.emote = null;
      if (this.species && this.species.died) this.species.died(this, killer);
      this.sandbox.emit('death', { who: this, by: killer, cause });
      this.notify('dead', {});
      return;
    }
    const wasLying = LYING.has(this.state) || this.state === 'thrown';
    const wasHeld = this.state === 'held';
    this.strike = null;
    this.dropCarried();
    if (this.weapon) this.dropWeapon(0.5);
    this.dropStowed(0.4);
    if (this.donning) this.finishVest();
    this.tased = null;
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
    if (this.species && this.species.died) this.species.died(this, killer);
    this.sandbox.emit('death', { who: this, by: killer, cause });
    this.notify('dead', {});
  }

  /** Out like a light: the sight of something, or the shock of it. No blow, so nobody to blame. */
  faint() {
    if (!this.alive || this.state === 'ko' || this.state === 'held') return false;
    this.health.conscious = Math.min(this.health.conscious, KO_LEVEL - 0.04);
    const lh = this.lastHit;
    this.lastHit = null;
    this.knockOut(0, 0.2);
    this.lastHit = lh;
    this.sandbox.emit('faint', { who: this });
    return true;
  }

  /**
   * On fire: down on the floor and rolling, over and over, to smother it.
   * `dur` seconds of it. False if they are in no state to.
   */
  dropAndRoll(dur = 3) {
    if (!this.alive || !this.conscious || this.state === 'held' || this.state === 'thrown' || this.health.frozen) return false;
    this.rolling = Math.max(this.rolling, dur);
    this.rollT = 0.2;
    this.rollDir = sign(this.sandbox.right - this.pos.x > this.pos.x - this.sandbox.left ? 1 : -1) * (chance(0.7) ? 1 : -1);
    if (this.rag) return true;
    if (this.state === 'down' || this.state === 'crawl') { this.setState('down'); this.downT = Math.max(this.downT, dur + 0.4); return true; }
    // down they go, deliberately: no ragdoll, they are in charge of it
    this.strike = null;
    this.blocking = false;
    this.dropCarried();
    if (this.weapon && chance(0.6)) this.dropWeapon(0.5);
    this.anim.stopAction(0.05);
    this.posture = null;
    this.stop();
    this.lieSide = 'back';
    this.setState('down');
    this.anim.play('fallBack', { blend: 0.08, restart: true });
    this.downT = dur + 0.5;
    this.sandbox.emit('dropRoll', { who: this });
    return true;
  }

  /** Back to full health: the sandbox's heal button. Only for the living. */
  heal() {
    if (this.dead) return false;
    healVitals(this);
    this.health.heal();
    this.stamina = 1;
    this.tased = null;
    this.wounds.length = 0;
    this.headMarks.length = 0;
    this.face.blood = 0;
    this.cut = {};
    this.woundedBy = null;
    this.afflictions.length = 0;
    if (this.species && this.species.healed) this.species.healed(this);
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
    if (!this.ragdolls || this.steadfast) return false;
    if (!this.rag) {
      this.rag = makeRagdoll(this);
      // frozen in place, it goes limp right where it is, and stays there
      if (this.frozenInPlace) this.rag.pinned = true;
      this.limpT = 0;
      this.restT = 0;
      // (frozen solid, it comes out stiff)
      if (this.health.frozen) this.rag.lock();
    }
    const rag = this.rag;
    this.blend = null;
    this.strike = null;
    this.climbing = null;
    this.jumpPending = null;
    this.posture = null;
    this.knock = 0;
    this.stowing = null;
    this.drawing = null;
    if (this.donning) this.finishVest();
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
    // (tied to something, nobody gets up: a crate on them is as good as a rope)
    const pinned = (this.pinnedBy && this.sandbox.time - this.pinT < 0.3) || this.tied;
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
          // yanked about by one arm, a shoulder gives
          if (h.part && h.part.startsWith('arm') && Math.hypot(h.vx, h.vy) > 9 && chance(dt * 1.2)) this.dislocate('shoulder' + h.part.slice(-1));
        }
        break;
      }
      case 'thrown': {
        if (this.tased) { clip = 'tased'; tone = 0.92; break; }
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
        clip = this.tased ? 'tased' : this.lieSide === 'back' ? 'pinned' : 'lieFront';
        tone = this.tased ? 0.85 : awake ? 0.12 : 0;
        break;
      default:
        break;
    }
    // cuffed, the arms stay behind them whatever else the body does
    if (this.cuffed && (clip === 'brace' || clip === 'flail' || clip === 'pinned' || clip === 'lieFront')) clip = 'cuffedDown';
    this.anim.play(clip, { blend: 0.2 });
    this.limpToneNow = tone;
    rag.friction = st === 'dead' || st === 'ko' || !awake ? 0.06 : 0.03;

    // coming to rest
    const settled = this.onGround && rag.maxSpeed < 0.9;
    this.restT = settled ? this.restT + dt : 0;
    const rested = this.restT > 0.35 || rag.asleep;
    if (st === 'held') return;
    // nobody limp stays sitting up: a slumped body goes over the way it leans
    if (!awake && !this.health.frozen && this.restT > 0.15 && this.limpT - (this.slumpT || -9) > 0.5) {
      const w = this.wj;
      const lean = wrapAngle(angleOf(w.hip, w.neck));
      if (Math.abs(lean) < 1.0 && w.head.y - this.pos.y > 0.5) {
        this.slumpT = this.limpT;
        const dir = (Math.sign(lean) || (chance(0.5) ? 1 : -1));
        rag.shove(w.chest.x, w.chest.y, dir * 1.6, 0, 0.45);
      }
    }

    if (st === 'thrown') {
      if (awake && !this.tased && !this.tied && this.canLandStanding()) { this.landFromLimp(); return; }
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
      // a wall or a piece of one: it takes what they hit it with (and glass gives, if it is hard enough)
      const wl = im.what && im.what.owner;
      if (wl && (wl.kind === 'wall' || wl.kind === 'piece') && im.speed > 3) {
        const q = this.rag.p[im.i];
        wl.impact(q.x - (im.nx ?? 0) * q.r, q.y - (im.ny ?? 0) * q.r, im.speed, 1 / q.im * 1.6, -(im.nx ?? 0), -(im.ny ?? 0));
      }
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
      // the dust goes up where they hit hardest
      let at = null;
      for (const im of list) if (im.speed >= top && (!im.what || !im.what.owner || im.what.owner.kind !== 'crate')) at = this.rag.p[im.i];
      if (top > 5) sb.fx.dust(at ? at.x : this.wj.hip.x, at ? Math.max(this.pos.y, at.y - at.r) : this.pos.y, Math.round(clamp(top, 4, 10)), Math.min(2, top / 6));
    }
    // frozen solid, there is nothing soft to take it (vitals.js works out what snaps)
    if (this.health.frozen) return;
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
    const took = [];
    for (const [k, wgt] of share) {
      const [part, bone] = k.split('/');
      const dmg = total * (wgt / sum) * rand(0.8, 1.2);
      if (dmg < 0.5) continue;
      if (part === 'head') headHit = true;
      const res = this.health.hit(part, dmg, { bone, breakChance: top > 13 ? 0.12 : 0 });
      if (res.broke) sb.emit('break', { who: this, part, bone: res.broke, by: null });
      took.push({ part, dmg, broke: !!res.broke });
    }
    // landing hard on a hand or a knee can put the joint out
    for (const im of list) {
      if (im.speed < 10) continue;
      const n = this.rag && this.rag.p[im.i] ? this.rag.p[im.i].name : '', side = n.slice(-1);
      if ((n === 'handA' || n === 'handB' || n === 'elbowA' || n === 'elbowB') && chance(0.08)) this.dislocate((n.startsWith('hand') ? 'elbow' : 'shoulder') + side);
      else if ((n === 'kneeA' || n === 'kneeB') && im.speed > 11 && chance(0.08)) this.dislocate('knee' + side);
    }
    if (total > 12) {
      // it comes out of each part where that part hit: the fastest of its points to hit, on the face of what it hit
      for (const tk of took) {
        if (!bleedsFrom(tk)) continue;
        let best = null;
        for (const im of list) {
          const q = this.rag.p[im.i], key = POINT_PART[q.name];
          if (key && key[0] === tk.part && (!best || im.speed > best.speed)) best = im;
        }
        if (!best) continue;
        const q = this.rag.p[best.i], nx = best.nx ?? 0, ny = best.ny ?? 1;
        splatter(this, q.x - nx * q.r, q.y - ny * q.r, nx, ny, tk.dmg, tk.part);
      }
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

  /**
   * Moved straight by (dx, dy), body and all, just as they are: picked up
   * with the world paused, or frozen in place.
   */
  shift(dx, dy) {
    this.pos.x += dx;
    this.pos.y += dy;
    for (const k of JOINTS) {
      this.wj[k].x += dx; this.wj[k].y += dy;
      this.prevWj[k].x += dx; this.prevWj[k].y += dy;
    }
    const b = this.box;
    b.minX += dx; b.maxX += dx; b.minY += dy; b.maxY += dy;
    if (this.rag) for (const q of this.rag.p) { q.x += dx; q.y += dy; q.px += dx; q.py += dy; }
    if (this.proxy) { this.proxy.pos.x += dx; this.proxy.pos.y += dy; }
    if (this.carrying && this.carrying.body) { this.carrying.body.pos.x += dx; this.carrying.body.pos.y += dy; }
    // wherever they have been put, they have to find their feet again
    this.support = null;
    if (Math.abs(dy) > 1e-6 && !this.rag) this.onGround = false;
  }

  /** Which bone is nearest a world point, for grabbing and blood. */
  nearestPart(x, y) {
    let best = null;
    for (let b = 0; b < BONES.length; b++) {
      for (const g of boneSegments(this.wj, b)) {
        if (goneAt(this.cut, b, (g[4] + g[5]) / 2)) continue;
        const sd = segDist(x, y, g[0], g[1], g[2], g[3]);
        if (!best || sd.d < best.d) best = { part: BONES[b][2], d: sd.d, bone: b, t: g[4] + (g[5] - g[4]) * sd.t, x: sd.x, y: sd.y };
      }
    }
    const dh = Math.hypot(x - this.wj.head.x, y - this.wj.head.y) - DIM.headR * this.scale;
    if (dh < best.d) best = { part: 'head', d: Math.max(0, dh), bone: HEAD_BONE, t: 1, x: this.wj.head.x, y: this.wj.head.y };
    return best;
  }

  grab(x, y, by = null) {
    const was = this.state;
    // (by somebody, not the hand in the sky: a mod's monster, say)
    this.heldBy = by;
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
        part: near.part,
        inverted: byLeg, joint: byLeg ? (near.part === 'legA' ? 'footA' : 'footB') : 'neck',
        target: { x, y }, prev: { x, y }, vx: 0, vy: 0, ax: 0,
        swing: byLeg ? 0 : start, swingV: 0,
      };
      this.anim.play(this.conscious ? 'dangle' : 'dangleLimp', { blend: 0.2 });
    }
    this.sandbox.emit('grabbed', { who: this, by });
    this.notify('grabbed', { by });
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
    this.heldBy = null;
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
    if (this.state === 'held' || this.steadfast) return;
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
    const half = e.knife.w / 2;
    return { x: tipX - ux * half * s, y: tipY - uy * half * s, a: Math.atan2(uy, ux), tipX, tipY, ux, uy };
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
    // where it went in: the hole it leaves
    const hole = pointOnBone(this.wj, e.bone, e.t);
    if (this.alive) {
      // the knife was holding the wound shut
      if (!this.health.dry) this.health.parts[part].bleed += 0.0018;
      this.health.pain = Math.min(130, this.health.pain + 14);
      this.sandbox.fx.blood(hole.x, hole.y, -pose.ux * 2.5, -pose.uy * 2 + 1, 14, 0.8, this);
      this.sandbox.fx.gush(hole.x, hole.y, -pose.ux * 1.6, -pose.uy * 1.6 + 0.6, 0.6 * bloodK(this), 0.16, this);
    }
    this.markAt(hole.x, hole.y, 0.9, -sign(pose.ux));
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

  /**
   * Points along the blade in their hand, the point first: what a stab, a
   * slash or a chop lands with. A machete is long enough to need three.
   */
  bladePoints() {
    // a blade that is part of them: their species knows where its edge is
    if (!this.weapon && this.species && this.species.bladePoints) return this.species.bladePoints(this);
    const s = this.scale, w = this.weapon;
    const a = this.wj.midForeA, h = this.wj.handA;
    const d = Math.hypot(h.x - a.x, h.y - a.y) || 1;
    const ux = (h.x - a.x) / d, uy = (h.y - a.y) / d;
    const at = (k) => ({ x: h.x + ux * k * s, y: h.y + uy * k * s });
    const tip = at(w.grip + w.w / 2);
    const pts = w.kind === 'machete' ? [tip, at(w.grip + w.w * 0.18), at(w.grip - w.w * 0.12)] : [tip, at(w.grip + w.w * 0.22)];
    return { tip, mid: pts[1], pts, ux, uy };
  }

  /* -------------------------------------------------------------------------- */
  /*                                   update                                   */
  /* -------------------------------------------------------------------------- */

  update(dt) {
    for (const k of JOINTS) { this.prevWj[k].x = this.wj[k].x; this.prevWj[k].y = this.wj[k].y; }
    this.prevWj.headAngle = this.wj.headAngle;
    this.stateT += dt;
    // a mod's species has its own business every step, and so does whatever is eating at them
    if (this.species && this.species.update) this.species.update(this, dt);
    if (this.afflictions.length) this.afflictions = this.afflictions.filter((a) => a.update(this, dt) !== false);
    // adrenaline, air and heat; fire and ice
    updateVitals(this, dt);
    if (this.removed) return;
    // breath, used and got back; and current going through them, if a taser has them
    this.updateStamina(dt);
    if (this.tased) updateTased(this, dt);
    const h = this.health;
    const wasAlive = !h.dead;
    if (h.update(dt) && wasAlive) {
      // bled out, it was whoever opened them up, a while ago or not
      const now = this.sandbox.time, w = this.woundedBy;
      const killer = this.lastHit && now - this.lastHit.t < 8 ? this.lastHit.by
        : h.cause === 'blood loss' && w && now - w.t < 180 && !w.by.removed ? w.by : null;
      this.die(h.cause, killer);
    }
    if (h.dead && this.state !== 'dead' && this.state !== 'held') this.die(h.cause);
    if (!h.dead && h.conscious < KO_LEVEL && this.state !== 'ko' && this.state !== 'held' && this.state !== 'thrown') this.knockOut(0, 0.5);
    if (!h.dead && h.paralysed === 'all' && !this.rag && !LYING.has(this.state) && this.state !== 'held') this.collapse(0, 0.3);
    this.balance = Math.min(1, this.balance + dt * (0.2 + this.health.toughness * 0.15));
    if (this.stuck.length && this.alive) h.pain = Math.min(130, h.pain + dt * 2.5 * this.stuck.length);
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt / 0.13);
    if (this.aimTarget && (this.aimTarget.removed || !this.gunReady)) this.aimTarget = null;
    this.aimT = this.aiming ? this.aimT + dt : 0;
    // frozen in place (the freeze tool): not a muscle moves - but they still feel, bleed, burn and talk
    if (this.frozenInPlace) {
      this.strike = null;
      this.vel.x = this.vel.y = 0;
      this.updateFace(dt);
      this.updateBleeding(dt);
      this.tickBubbles(dt);
      return;
    }
    // frozen solid with ragdolls off: the pose stays exactly as it was, and the body only falls
    if (h.frozen && !this.rag && this.state !== 'held') {
      this.physics(dt);
      this.toWorld(dt);
      this.tickBubbles(dt);
      return;
    }

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
      case 'stumble': updateStumble(this, dt); break;
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
    const an = this.anim.actionName;
    if (this.reloading && an !== 'reload' && an !== 'reloadTaser') this.reloading = false;
    // whatever was being put away, got out or put on, interrupted before it got there
    if (this.stowing && an !== 'holster' && an !== 'pocket') this.stowing = null;
    if (this.drawing && an !== 'drawGun' && an !== 'unpocket') this.drawing = null;
    if (this.donning && an !== 'vestOn') this.finishVest();
    if (this.rag) { this.tickBubbles(dt); return; }
    const pose = this.anim.sample();
    // stumbling, no clip: the pendulum says where everything is
    if (this.state === 'stumble' && this.stumble) stumblePose(this, pose, dt);
    this.procedural(pose, dt);
    solve(pose, this.scale, this.joints);
    this.bendBreaks(this.joints);
    if (this.state === 'held') this.placeHeld();
    this.toWorld(dt);
    // a body that is not a stickman's shape puts its joints where its own parts are (a mod's)
    if (this.species && this.species.pose) { this.species.pose(this, dt); this.boundsFromJoints(); }
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
    s *= this.health.mobility * (this.species && this.species.speed ? this.species.speed : 1);
    // out of breath, a run is a jog, and then not much more than a walk
    if (kind === 'run' || kind === 'flee') s *= 0.58 + 0.42 * smooth(this.stamina / 0.45);
    // adrenaline puts a little more in the legs; too hot or too cold takes it out of them
    const h = this.health, t = h.temp ?? 37;
    s *= 1 + (h.adrenaline || 0) * (kind === 'run' || kind === 'flee' ? 0.12 : 0.04);
    if (t < 35) s *= clamp(1 - (35 - t) * 0.06, 0.45, 1);
    else if (t > 39) s *= clamp(1 - (t - 39) * 0.08, 0.55, 1);
    if (this.cuffed) s = Math.min(s, SPEEDS.walk * 0.9);
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
    if (this.knock > 0) {
      // shoved back by a blow: the feet slide and step with it, and only then take charge again
      this.knock -= dt;
      this.vel.x = moveToward(this.vel.x, 0, 4.5 * dt);
    } else {
      this.vel.x = moveToward(this.vel.x, want, accel * dt);
      if (rooted) this.vel.x = moveToward(this.vel.x, 0, 10 * dt);
    }

    // the base clip: on the move, or standing in some posture or mood
    const sp = Math.abs(this.vel.x);
    // running takes breath, and so does carrying something heavy
    if (sp > 2.6) this.tire(dt * (0.04 + 0.03 * (sp - 2.6)));
    else if (this.carrying) this.tire(dt * 0.018);
    const back = sign(this.vel.x) !== this.facing;
    let name, speed = 1;
    if (sp > 2.6 && !back) {
      name = it.speed === 'flee' ? 'runScared' : 'run';
      speed = sp / (NOMINAL[name] * this.scale);
    } else if (sp > 0.1) {
      // (a bigger body covers more ground with every stride)
      if (this.posture === 'guard' || back) { name = 'shuffle'; speed = clamp(sp / (NOMINAL.shuffle * this.scale), 0.6, 1.6); }
      else { name = 'walk'; speed = sp / (NOMINAL.walk * this.scale); }
    } else {
      name = this.idleClip();
    }
    this.anim.play(name, { blend: name === 'walk' || name === 'run' ? 0.18 : 0.25, speed });
    let overlay = null;
    if (this.carrying) overlay = 'carry';
    else if (this.pushing) overlay = 'push';
    // a pistol is held up at someone, or carried low
    else if (this.gunReady && !STILL_POSTURES.has(this.posture)) overlay = this.aiming ? 'aimPistol' : 'gunLow';
    else if ((this.posture === 'guard' || this.posture === 'block') && sp > 0.1) overlay = this.posture === 'block' ? 'block' : this.guardClip();
    this.anim.setOverlay(overlay, overlay === 'gunLow' ? 'arms' : 'upper');
  }

  /** Fists up, or the weapon held ready. */
  guardClip() {
    const own = this.species && this.species.guardClip ? this.species.guardClip(this) : null;
    if (own) return own;
    return this.armedWith === 'knife' ? 'knifeGuard' : this.armedWith === 'machete' ? 'macheteGuard' : 'guard';
  }

  idleClip() {
    switch (this.posture) {
      case 'guard': return this.guardClip();
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
      case 'shock': return 'shock';
      case 'clutchStump': return 'clutchStump';
      case 'coverHead': return 'coverHead';
      case 'handsOnKnees': return 'handsOnKnees';
      case 'kneelHands': return 'kneelHands';
      case 'sitCuffed': return 'sitCuffed';
      case 'bounce': return 'bounce';
      case 'think': return 'think';
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
    // a flier flies (a mod's species)
    if (this.species && this.species.air && this.species.air(this, dt)) return;
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
    // rolling a fire out: over onto the front, over onto the back, along the floor - the head
    // staying where it is while the body turns under it
    if (this.rolling > 0 && !pinned && this.conscious && this.health.paralysed === 'none') {
      this.rolling -= dt;
      const falling = this.anim.baseName === 'fallBack' || this.anim.baseName === 'fallFront';
      if (!falling || this.anim.baseDone) {
        if ((this.rollT -= dt) <= 0) {
          this.rollT = 0.34;
          this.lieSide = this.lieSide === 'back' ? 'front' : 'back';
          this.facing = -this.facing;
          const room = this.rollDir > 0 ? this.sandbox.right - this.pos.x : this.pos.x - this.sandbox.left;
          if (room < 0.8) this.rollDir = -this.rollDir;
          this.vel.x = this.rollDir * 0.6 * this.scale;
          this.anim.play(this.lieSide === 'back' ? 'rollBack' : 'rollFront', { blend: 0.1, restart: true });
          this.sandbox.emit('rollOver', { who: this, x: this.pos.x });
        }
      }
      this.downT = Math.max(this.downT, 0.6);
      return;
    }
    const falling = this.anim.baseName === 'fallBack' || this.anim.baseName === 'fallFront';
    if (!falling || this.anim.baseDone) {
      let name;
      if (this.tased) name = 'tasedFloor';
      else if (pinned) { name = 'pinned'; this.lieSide = 'back'; }
      else if (this.health.paralysed === 'all') name = this.lieSide === 'back' ? 'koBack' : 'koFront';
      else if (this.health.pain > 45) name = this.lieSide === 'back' ? 'writheBack' : 'writheFront';
      else name = this.lieSide === 'back' ? 'lieBack' : 'lieFront';
      this.anim.play(name, { blend: 0.35 });
    }
    if (pinned) { this.downT = Math.max(this.downT, 0.4); return; }
    if (this.health.paralysed === 'all' || this.tased) return;
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
    this.tire(0.04);
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
    if (this.conscious) this.tire(dt * 0.025);
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
    const walking = this.state === 'stand' || this.state === 'crawl' || this.state === 'stumble';

    this.vel.y -= G * this.gravity * dt;
    if (this.onGround && !walking) this.vel.x = moveToward(this.vel.x, 0, (lying ? 9 : 6) * dt);

    let nx = this.pos.x + this.vel.x * dt;
    if (nx < sb.left + hw || nx > sb.right - hw) {
      const sp = Math.abs(this.vel.x);
      nx = clamp(nx, sb.left + hw, sb.right - hw);
      if (this.state === 'thrown' && sp > 7) this.landHard(sp * 0.8, 'side', { x: this.pos.x < 0 ? 1 : -1, y: 0 });
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

  /** Crates and walls beside them stop them; walking into a crate (or a loose piece of wall) shoves it. */
  bumpCrates(nx, hw, dt) {
    const top = this.pos.y + Math.max(0.5, this.height);
    const sb = this.sandbox;
    for (const c of sb.slabs.length || sb.logs.length ? [...sb.crates, ...sb.slabs, ...sb.logs] : sb.crates) {
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
          // (a wall takes it too: through glass, if it is hard enough)
          if (c.impact) c.impact(fromLeft ? bb.minX : bb.maxX, this.pos.y + 0.9, into, MASS * this.scale, Math.sign(this.vel.x), 0);
          this.landHard(into * 0.9, 'side', { x: fromLeft ? -1 : 1, y: 0 });
          if (c.removed || (c.cols && !c.contains(fromLeft ? bb.minX + 0.02 : bb.maxX - 0.02, this.pos.y + 0.9, 0.05))) continue;
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
    if (this.species && this.species.touchDown && this.species.touchDown(this, v)) return;
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
  landHard(v, how, n = UP) {
    const sb = this.sandbox;
    sb.emit('thud', { who: this, speed: v, x: this.pos.x, y: this.pos.y });
    if (v < 6.5) return;
    const e = v - 6.5;
    // (a body built of metal takes a fall better: a mod's species says how much)
    const dmg = (e * e * 1.25 + e * 3) * (this.species && this.species.fall !== undefined ? this.species.fall : 1);
    const spread = how === 'legs' ? [['legA', 0.38, 'tibiaA'], ['legB', 0.38, 'tibiaB'], ['torso', 0.24, 'pelvis']]
      : how === 'head' ? [['head', 0.55, 'skull'], ['torso', 0.3, null], ['armA', 0.15, null]]
      : how === 'side' ? [['torso', 0.4, 'ribs'], ['head', 0.3, 'skull'], ['armA', 0.15, null], ['legA', 0.15, null]]
      : [['torso', 0.5, null], ['head', 0.22, 'skull'], ['armA', 0.1, null], ['armB', 0.08, null], ['legB', 0.1, null]];
    const was = this.alive;
    const took = [];
    for (const [part, f, bone] of spread) {
      const d = dmg * f * rand(0.8, 1.2);
      const res = this.health.hit(part, d, { bone, breakChance: v > 13 ? 0.15 : 0 });
      if (res.broke) sb.emit('break', { who: this, part, bone: res.broke, by: null });
      took.push({ part, dmg: d, broke: !!res.broke });
    }
    if (dmg > 12) {
      // out of whatever met the floor (or the wall): the head, landing on it - the feet only if a bone came through
      for (const tk of took) {
        if (how === 'head' && tk.part !== 'head') continue;
        if (how === 'legs' && !tk.part.startsWith('leg')) continue;
        if (!bleedsFrom(tk)) continue;
        const c = contactOf(this, tk.part, n.x, n.y);
        splatter(this, c.x, c.y, n.x, n.y, tk.dmg, tk.part);
      }
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
    const spec = this.weapon ? null : armOf(this.innate);
    const blade = d.blade && (isBlade(this.armedWith) || !!(spec && spec.blade));
    // what is doing the hitting: the fist or foot, or the point and edge of a blade
    const pts = blade ? this.bladePoints().pts : [this.wj[d.limb]];
    const prev = this.prevWj[d.limb], limb = this.wj[d.limb];
    const speed = Math.hypot(limb.x - prev.x, limb.y - prev.y) / dt;
    const armed = (!!this.weapon || !!this.innate) && d.limb === 'handA';
    const r = (d.limb.startsWith('foot') ? 0.065 : blade ? (spec && spec.r ? spec.r : this.armedWith === 'machete' ? 0.045 : 0.035) : armed ? 0.075 : 0.06) * this.scale;
    // something that keeps on biting for as long as it touches - a chainsaw - hits again every so often
    if (d.ticks && (s.tickT = (s.tickT || 0) + dt) >= d.ticks) {
      s.tickT = 0;
      for (const o of [...s.hit]) if (o.kind === 'stickman') s.hit.delete(o);
    }
    const spares = this.species && this.species.spares;
    for (const o of sb.people) {
      if (o === this || o.removed || s.hit.has(o) || o.state === 'held') continue;
      if (Math.abs(o.pos.x - limb.x) > 2.4) continue;
      // (some of a mod's would never cut one of their own, even by mistake)
      if (spares && spares(this, o)) continue;
      let hit = null;
      for (const p of pts) { hit = o.touch(p.x, p.y, r); if (hit) break; }
      if (!hit) continue;
      s.hit.add(o);
      this.landHit(o, hit, speed, s, armed ? (s.kind === 'taserZap' ? 'taserZap' : this.armedWith) : null);
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
    // a wall, a log - or a tree, but only with a blade or a crowbar, and only a blow that hit nobody
    const struck = [...s.hit].some((o) => o.kind === 'stickman');
    for (const w of sb.slabs.length || sb.logs.length || sb.plants.length ? [...sb.slabs, ...sb.logs, ...sb.plants] : []) {
      if (s.hit.has(w) || w.removed) continue;
      if (w.kind === 'tree' || w.kind === 'bush') {
        if (struck || !(blade || (armed && armOf(this.armedWith) && armOf(this.armedWith).wrecks))) continue;
      }
      // (into whatever is left of it: a notch gets deeper, blow by blow)
      const p = pts[0];
      const q = w.firstSolid(p.x - this.facing * 0.06, p.y, this.facing, 0, 0.2);
      if (!q) continue;
      s.hit.add(w);
      this.strikeThing(w, q, s, blade, armed);
    }
    for (const k of sb.loose()) {
      if (s.hit.has(k) || k.kind === 'log' || k.kind === 'piece') continue;
      const p = pts[0];
      if (!k.body.contains(p.x, p.y, r + 0.03)) continue;
      s.hit.add(k);
      k.body.applyImpulse(this.facing * 2.2 * k.body.mass / 0.4, 1.2 * k.body.mass / 0.4, p.x, p.y);
    }
  }

  /**
   * A blow landing on a wall, a log or a tree: it takes what it cannot stand -
   * splinters, a dent, a crack - and whatever did it stops dead against it.
   */
  strikeThing(w, p, s, blade, armed) {
    const sb = this.sandbox, d = s.def;
    const spec = armed ? armOf(this.armedWith) : null;
    // a crowbar is made for this; a fist is not
    const wreck = spec && spec.wrecks ? spec.wrecks : 1;
    const power = d.power * this.strength * this.effort * (armed ? (spec && spec.mult ? spec.mult : 1.4) : 1) * wreck;
    const kind = blade ? 'blade' : 'blunt';
    w.damage(p.x, p.y, blade ? 0.045 : 0.06, power * (blade ? 0.5 : 0.2), kind, { dx: this.facing, dy: 0, speed: 1 });
    // a loose one is knocked along as well
    if (w.body && w.body.invMass > 0) w.body.applyImpulse(this.facing * 2 * power, 0.6 * power, p.x, p.y);
    const material = w.mat ? w.mat.name : 'wood';
    sb.emit('knock', { who: this, wall: w, loud: !blade, blade, material, x: p.x, y: p.y });
    if (material === 'metal' && !blade && armed) sb.fx.sparks(p.x, p.y, 3);
    this.anim.freeze = 0.05;
  }

  landHit(o, hit, speed, s, weapon) {
    const d = s.def;
    const nominal = d.limb.startsWith('foot') ? 5 : 6;
    const sp = clamp(speed / nominal, 0.55, 1.35);
    const limbPart = { handA: 'armA', handB: 'armB', footA: 'legA', footB: 'legB' }[d.limb];
    const lp = this.health.parts[limbPart];
    const limbOK = clamp(lp.hp / lp.max, 0.4, 1);
    const fury = (1 + (this.brain ? this.brain.emo.anger * 0.15 : 0)) * (1 + (this.health.adrenaline || 0) * 0.15);
    // brass on the fist nearly doubles a punch; so does a pistol butt
    const spec = armOf(weapon);
    const mult = weapon === 'knuckles' ? 1.9 : isGun(weapon) ? 1.5 : spec && spec.mult ? spec.mult : 1;
    const power = d.power * sp * limbOK * this.strength * fury * mult * clamp(this.health.mobility + 0.2, 0.6, 1) * this.effort;
    s.landed = true;
    const bladed = isBlade(weapon) || !!(spec && spec.blade);
    o.takeHit({
      by: this, part: hit.part, x: hit.x, y: hit.y, dir: this.facing, power, kind: s.kind,
      armed: !!weapon, weapon: bladed ? (d.blade ? weapon : null) : weapon,
      deep: (d.blade === 'stab' && weapon === 'knife') || (d.blade === 'chop' && weapon === 'machete') || !!(spec && spec.deep && spec.deep.includes(d.blade)),
      low: d.low, bone: o.boneName(hit.bone, hit.t),
    });
    if (this.species && this.species.landed) this.species.landed(this, o, hit, power, s);
    this.anim.freeze = o.anim.freeze = 0.04 + Math.min(0.05, power * 0.012);
    if (weapon && this.weapon) this.weapon.blood = Math.min(1, this.weapon.blood + (bladed ? 0.25 : 0.12) * power);
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
        if (Math.hypot(item.pos.x - h.x, item.pos.y - h.y) < 0.6) {
          if (item.stuckIn) item.unstick();
          // a vest goes on, over the head
          if (item.kind === 'vest') {
            this.wearVest(item);
            sb.emit('pickup', { who: this, item });
            return;
          }
          // hands full: the new thing straight into a pocket - or the old one into its holster
          if (this.weapon) {
            const k = this.slotFor(item);
            if (k) {
              item.wear(this);
              this.stowed[k] = item;
              sb.emit('pickup', { who: this, item, slot: k });
              this.notify('pocketed', { item });
              return;
            }
            const k2 = this.slotFor(this.weapon);
            if (!k2) return;
            this.stowed[k2] = this.weapon;
            this.weapon = null;
            this.aimTarget = null;
          }
          item.wear(this);
          this.weapon = item;
          sb.emit('pickup', { who: this, item });
          this.notify('armed', { item });
          return;
        }
      }
      const c = this.wantCrate;
      this.wantCrate = null;
      if (c && !c.carriedBy && !c.removed && !c.frozenInPlace && !sb.crateOnTop(c)) {
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
    } else if (ev === 'magOut' || ev === 'rack') {
      sb.emit(ev, { who: this, x: this.wj.handA.x, y: this.wj.handA.y });
    } else if (ev === 'magIn') {
      if (this.weapon instanceof Gun) this.weapon.reload();
      sb.emit('magIn', { who: this, x: this.wj.handA.x, y: this.wj.handA.y });
    } else if (ev === 'cartOut') {
      const g = this.weapon;
      if (g && g.kind === 'taser' && g.shot) g.shot.cut();
      sb.emit('cartOut', { who: this, x: this.wj.handA.x, y: this.wj.handA.y });
    } else if (ev === 'cartIn') {
      if (this.weapon && this.weapon.kind === 'taser') this.weapon.reload();
      sb.emit('cartIn', { who: this, x: this.wj.handA.x, y: this.wj.handA.y });
    } else if (ev === 'stow') {
      const st = this.stowing;
      this.stowing = null;
      if (st && this.weapon === st.item && !this.stowed[st.slot]) {
        this.weapon = null;
        this.aimTarget = null;
        // a taser put away pulls its wires off
        if (st.item.kind === 'taser' && st.item.shot) st.item.shot.cut();
        this.stowed[st.slot] = st.item;
        sb.emit('stow', { who: this, item: st.item, slot: st.slot, x: this.wj.hip.x, y: this.wj.hip.y });
      }
    } else if (ev === 'draw') {
      const k = this.drawing;
      this.drawing = null;
      const it = k ? this.stowed[k] : null;
      if (it && !this.weapon) {
        this.stowed[k] = null;
        this.weapon = it;
        sb.emit('drawWeapon', { who: this, item: it, slot: k, x: this.wj.hip.x, y: this.wj.hip.y });
        this.notify('drew', { item: it });
      }
    } else if (ev === 'vestOn') {
      this.finishVest();
    } else if (ev === 'ammo') {
      const box = this.ammoBox;
      this.ammoBox = null;
      if (box && !box.removed && Math.abs(box.pos.x - this.pos.x) < 1.2) {
        let got = 0;
        for (const g of this.guns) if (g instanceof Gun && (!box.fits || box.fits(g))) got += g.topUp(box.take(g.short));
        sb.emit('ammoTaken', { who: this, box, n: got, x: box.pos.x, y: box.pos.y });
        this.notify('ammo', { n: got, box });
      }
    } else if (ev === 'cuff') {
      const o = this.cuffing;
      this.cuffing = null;
      if (o && !o.removed && !o.cuffed && Math.abs(o.wj.hip.x - this.pos.x) < 1.4) o.cuff(this);
    } else if (ev === 'drop') {
      if (this.weapon) this.dropWeapon(0.3);
    } else if (ev === 'crack' || ev === 'radio') {
      sb.emit(ev === 'crack' ? 'knuckleCrack' : 'radio', { who: this, x: this.wj.handA.x, y: this.wj.handA.y });
    } else if (ev === 'pop') {
      if (this.popping) { this.popping.who.relocate(this.popping.joint, this); this.popping = null; }
    } else if (ev === 'tie') {
      const t = this.tying;
      this.tying = null;
      if (t && !t.who.removed && t.who.health.applyTourniquet(t.part)) {
        sb.emit('tourniquet', { who: t.who, by: this, part: t.part, x: this.wj.handA.x, y: this.wj.handA.y });
        t.who.notify('tied', { by: this, part: t.part });
      }
    } else if (ev === 'clap') {
      sb.emit('clap', { who: this, x: this.wj.handA.x, y: this.wj.handA.y });
    } else if (ev === 'slap') {
      sb.emit('clap', { who: this, x: this.wj.handA.x, y: this.wj.handA.y, soft: true });
    } else if (this.species && this.species.animEvent) {
      this.species.animEvent(this, ev);
    }
  }

  /** The vest that was going on is on (or, if there is one already, back on the floor). */
  finishVest() {
    const v = this.donning;
    if (!v) return;
    this.donning = null;
    if (this.vest || v.removed) { if (!v.removed && v.wornBy === this) v.drop(this.pos.x + this.facing * 0.3, 0.3); return; }
    this.vest = v;
    this.sandbox.emit('vestOn', { who: this, vest: v, x: this.wj.chest.x, y: this.wj.chest.y });
    this.notify('vest', { vest: v });
  }

  /**
   * Breath comes back while they are not using it: fastest lying or sitting,
   * slower standing, slower still walking, not at all running - and slower
   * for the hurt, the bleeding and the soft.
   */
  updateStamina(dt) {
    if (this.dead) return;
    const h = this.health;
    this.breath += dt * (1.5 + 3.8 * (1 - this.stamina));
    if (this.sandbox.time - this.exertT < 0.9) return;
    const st = this.state, sp = Math.abs(this.vel.x);
    let rate;
    if (LYING.has(st) || st === 'getup') rate = 0.16;
    else if (st === 'stand') rate = STILL_POSTURES.has(this.posture) ? 0.17 : sp > 2.6 ? 0 : sp > 0.2 ? 0.07 : 0.12;
    else rate = 0.03;
    rate *= (0.55 + h.toughness * 0.65) * clamp(h.overall + 0.25, 0.35, 1) * (h.pain > 60 ? 0.7 : 1) * (h.blood < 0.65 ? 0.55 : 1);
    this.stamina = Math.min(1, this.stamina + rate * dt);
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

    // out of breath: the chest heaves, and the shoulders with it
    const tired = 1 - clamp01(this.stamina / 0.5);
    if (tired > 0 && (st === 'stand' || st === 'stumble') && this.conscious) {
      const b = Math.sin(this.breath * 2);
      p.t += b * 2.4 * DEG * tired;
      p.h -= b * 2.6 * DEG * tired;
      p.aAu += b * 2.2 * DEG * tired;
      p.aBu += b * 2.2 * DEG * tired;
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

    // a pistol held up at someone: both arms along the line to them, and the kick of each shot
    const ov = this.anim.overlay;
    if (ov && ov.clip.name === 'aimPistol' && ov.w > 0) {
      const tp = this.aimPoint();
      if (tp) {
        const sh = this.wj.shoulder;
        const want = clamp(Math.atan2(tp.y - sh.y - 0.07 * this.scale, Math.max(0.3, Math.abs(tp.x - sh.x))), -75 * DEG, 70 * DEG);
        const skill = brain ? brain.traits.skill : 0.5;
        this.gunAim = lerp(this.gunAim, want, 1 - Math.exp(-dt * (5 + skill * 9)));
      }
      const w = smooth(ov.w), kick = this.recoil * 13 * DEG;
      p.aAu += (this.gunAim + kick) * w;
      p.aBu += (this.gunAim + kick * 0.85) * w;
      p.aAl -= kick * 0.4 * w;
      p.h -= this.gunAim * 0.4 * w;
    }

    // a joint out of its socket: an arm hanging from a shoulder that is not where it
    // should be, a forearm bent the wrong way at the elbow
    if (st !== 'dead' && !LYING.has(st)) {
      for (const side of ['A', 'B']) {
        if (h.dislocated['shoulder' + side]) {
          p['a' + side + 'u'] = lerp(p['a' + side + 'u'], -p.rot - 0.22 + Math.sin(t * 1.7 + this.seed) * 0.05, 0.9);
          p['a' + side + 'l'] = lerp(p['a' + side + 'l'], 0.08, 0.8);
        }
        if (h.dislocated['elbow' + side]) p['a' + side + 'l'] = -0.5;
      }
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
    // cuffed: both hands held together behind the back, whatever the rest of them does
    if (this.cuffed && st !== 'dead') {
      p.aAu = -0.56 - p.t * 0.25; p.aAl = 1.02;
      p.aBu = -0.63 - p.t * 0.25; p.aBl = 1.1;
    }
    if (this.species && this.species.procedural) this.species.procedural(this, p, dt);
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
    // a body of some other shape (a mod's) says for itself where it is
    const own = this.species && this.species.proxy ? this.species.proxy(this) : null;
    if (own) {
      b.setSize(own.w, own.h);
      b.pos.x = own.x;
      b.pos.y = own.y;
      b.rot = 0;
      b.vel.x = this.vel.x;
      b.vel.y = this.vel.y;
      return;
    }
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
    // frozen solid, the face stays as it froze
    if (this.health.frozen) return;
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

    // on fire, or fighting for air: nothing else on the face matters
    const burning = !!this.flames, choking = !!(this.vit && this.vit.air === 'choke') && this.health.oxygen < 0.9;
    let eyes = 'normal';
    if (burning || pain > 0.62 || crying || this.anim.actionName === 'hitHead') eyes = 'squint';
    else if (choking) eyes = 'wide';
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
    const panting = this.stamina < 0.35 && (this.state === 'stand' || this.state === 'stumble') ? 0.2 + 0.14 * Math.sin(this.breath * 2) : 0;
    const gasping = choking ? 0.45 + 0.25 * Math.sin(this.breath * 5) : 0;
    const open = Math.max(shouting ? 0.9 : 0, e.surprise > 0.4 ? e.surprise * 0.8 : 0, e.fear > 0.7 ? (e.fear - 0.5) * 1.4 : 0, pain > 0.8 ? 0.5 : 0, panting, this.tased ? 0.6 : 0,
      burning ? 0.85 : 0, gasping);
    f.open = lerp(f.open, open, k * 1.5);
    f.teeth = e.anger > 0.55 && f.open < 0.2 || (pain > 0.5 && pain < 0.8 && f.open < 0.2);
    f.tears = crying ? (f.tears + dt * 1.3) % 1 || 0.001 : 0;
    f.blood = Math.max(0, f.blood - dt * 0.004);
  }

  /**
   * A mark of blood on a bone: a wound of theirs (it bleeds from there,
   * blood.js), or - `stain` - blood that landed on them, theirs or anyone's.
   * `side` is the way the wound opens (-1 or 1, x), when it is known.
   */
  mark(bone, t, r, dark = false, tint = undefined, stain = false, side = 0) {
    const own = tint === undefined ? this.tint : tint;
    for (const w of this.wounds) {
      if (w.bone === bone && !w.hole && !w.gash && !w.burn && !!w.stain === stain && Math.abs(w.t - t) < 0.14 && w.tint === own) {
        w.r = Math.min(0.95, w.r + r * 0.1);
        return;
      }
    }
    this.addWound({ bone, t, r: clamp(r, 0.3, 0.8), dark, tint: own, stain, side });
  }

  /** A wound where (x, y) is on them: on the head, or on whichever bone is nearest. */
  markAt(x, y, r, side = 0) {
    const n = this.nearestPart(x, y);
    if (n.part === 'head' && (n.bone !== HEAD_BONE || n.t > 0.25)) this.headMark(x, y, r);
    else this.mark(n.bone, n.t, r, chance(0.3), undefined, false, side);
  }

  /**
   * Blood on the head, kept in the head's own frame so it turns with it: a
   * wound (or a burn), or - `stain` - blood that landed there, `tint` its colour.
   */
  headMark(x, y, size, burn = false, stain = false, tint = undefined) {
    const j = this.wj, r = DIM.headR * this.scale, f = this.rag ? this.rag.facing : this.facing;
    const ux = (x - j.head.x) * f, uy = y - j.head.y;
    const c = Math.cos(j.headAngle), s = Math.sin(j.headAngle);
    let lx = (ux * c - uy * s) / r, ly = (ux * s + uy * c) / r;
    const d = Math.hypot(lx, ly);
    if (d > 0.8) { lx *= 0.8 / d; ly *= 0.8 / d; }
    const col = tint === undefined ? this.tint : tint;
    const rr = clamp(size * 0.22, 0.12, 0.32);
    if (stain) {
      // landing in blood already there spreads it
      for (const m of this.headMarks) {
        if (m.stain && m.tint === col && Math.hypot(m.x - lx, m.y - ly) < m.r) { m.r = Math.min(0.36, m.r + rr * 0.15); return; }
      }
    }
    if (this.headMarks.length > 14) {
      const i = this.headMarks.findIndex((m) => m.stain);
      this.headMarks.splice(Math.max(0, i), 1);
    }
    this.headMarks.push({ id: woundId(), x: lx, y: ly, r: rr, dark: chance(0.3), burn, stain, tint: col });
  }

  /**
   * Blood coming out of them (blood.js says from where, and how fast): it
   * drips off each wound that is bleeding, pours out of the worst in
   * streams, and spreads in a pool under them where they lie in it. None
   * frozen solid, and none bled dry.
   */
  updateBleeding(dt) {
    const h = this.health;
    if (h.frozen || h.dry || h.bleeding <= 0) { this.dripAcc = 0; return; }
    const src = bleedSources(this);
    if (!src.list.length) return;
    const fx = this.sandbox.fx;
    this.dripAcc += src.drip * 1500 * dt;
    while (this.dripAcc >= 1) {
      this.dripAcc -= 1;
      const s = pickSource(src);
      fx.drip(s.x + rand(-0.01, 0.01), s.y, this);
    }
    if (this.onGround && (this.dead || this.lying)) {
      for (const s of src.list) if (s.y - this.pos.y < 0.3) fx.pool(s.x, this.pos.y, s.rate * dt, this.tint);
    }
    feedStreams(this, src, dt);
  }
}

const UP = { x: 0, y: 1 };

/**
 * Whether a part that hit something hard bleeds from where it hit: a head
 * splits open, a body takes a good deal more, and an arm or a leg only when
 * a bone came through - or the blow was savage.
 */
function bleedsFrom(tk) {
  if (tk.part === 'head') return tk.dmg >= 4;
  if (tk.part === 'torso') return tk.dmg >= 7;
  return tk.broke || tk.dmg >= 14;
}

/** About normally distributed, mean 0, standard deviation 1. */
function gauss() { return (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 1.73; }

/** Whether the ray from (px, py) along (dx, dy), out to max, touches an axis-aligned box. */
function rayAabb(px, py, dx, dy, max, x0, x1, y0, y1) {
  let t0 = 0, t1 = max;
  for (const [p, d, lo, hi] of [[px, dx, x0, x1], [py, dy, y0, y1]]) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
    let a = (lo - p) / d, b = (hi - p) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * The closest the segments p0-p1 and q0-q1 come: { s, u, d } - how far along
 * each (0..1) the closest points are, and how far apart.
 */
function segSeg(p0x, p0y, p1x, p1y, q0x, q0y, q1x, q1y) {
  const d1x = p1x - p0x, d1y = p1y - p0y, d2x = q1x - q0x, d2y = q1y - q0y;
  const rx = p0x - q0x, ry = p0y - q0y;
  const a = d1x * d1x + d1y * d1y, e = d2x * d2x + d2y * d2y, f = d2x * rx + d2y * ry;
  let s = 0, u = 0;
  if (a <= 1e-12 && e <= 1e-12) { s = 0; u = 0; }
  else if (a <= 1e-12) { s = 0; u = clamp(f / e, 0, 1); }
  else {
    const c = d1x * rx + d1y * ry;
    if (e <= 1e-12) { u = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = d1x * d2x + d1y * d2y, den = a * e - b * b;
      s = den > 1e-12 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      u = (b * s + f) / e;
      if (u < 0) { u = 0; s = clamp(-c / a, 0, 1); }
      else if (u > 1) { u = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const cx = p0x + d1x * s - (q0x + d2x * u), cy = p0y + d1y * s - (q0y + d2y * u);
  return { s, u, d: Math.hypot(cx, cy) };
}
