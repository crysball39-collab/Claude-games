/* =============================================================================
   A person.

   Seventeen rigid bodies, always. What changes is who is moving them:

     ANIM     the animation places every part; physics only watches
     STUMBLE  physics moves them, muscles fight to hold a staggering pose and
              a sense of balance decides whether the fight is being won
     RAGDOLL  physics moves them; a conscious person braces, writhes or
              crawls, an unconscious one does nothing at all
     GETUP    the animation takes the body back from wherever it was lying

   Parts can stop belonging to the body. A severed forearm takes its hand
   with it and becomes a small ragdoll of its own; a part that has taken
   enough is simply gone, and what hung from it falls.
   ========================================================================== */
import {
  P, PARTS, PART_COUNT, CH, CHANNELS, SUBTREE, CHILDREN, channelsToLocal, solvePose, solveArm, buildRagdoll, rescaleRagdoll, MUSCLE_TORQUE, PELVIS_HEIGHT,
} from './rig.js';
import { Animator, CLIPS } from './anim.js';
import { Health } from './health.js';
import { VESTS, HELMETS, vestBoxes, helmetBoxes, vestCover, helmetCover, throughArmour } from './armour.js';
import { Island, newGroup, GRAVITY, rayBody } from '../physics/world.js';
import { groundHeight, LIMIT } from '../world/city.js';
import { rgb } from '../render/boxes.js';
import { restingFace, faceKey, FACE_COLS, FACE_ROWS } from '../render/textures.js';
import { clamp, clamp01, lerp, damp, smooth, turnToward, wrapAngle, dampAngle, rand, chance } from '../core/util.js';

export const ST = { ANIM: 0, STUMBLE: 1, RAGDOLL: 2, GETUP: 3 };
export const RADIUS = 0.27;
/** Half the room a person takes up among other people: shoulder, arm and a little air. */
const SPACE = 0.335;
/** The parts of someone lying down that cannot be walked through. */
const TRUNK = [P.PELVIS, P.ABDOMEN, P.CHEST, P.HEAD];
const WALK = 1.5, RUN = 5.0, CROUCH = 1.2, JUMP_V = 4.5;

/** Skin of colour (r,g,b) with a burn of `b` (0..100) on it. */
function burnt(r, g, b, amt) {
  if (amt < 3) return [r, g, b];
  if (amt < 30) { const k = (amt - 3) / 27 * 0.6; return [lerp(r, 0.62, k), lerp(g, 0.16, k), lerp(b, 0.12, k)]; }
  if (amt < 65) { const k = (amt - 30) / 35; return [lerp(0.6, 0.55, k), lerp(0.2, 0.36, k), lerp(0.15, 0.28, k)]; }
  const k = clamp01((amt - 65) / 35);
  return [lerp(0.5, 0.06, k), lerp(0.34, 0.045, k), lerp(0.27, 0.04, k)];
}
const GETUP_TIME = 1.55;

const _a = [0, 0, 0], _b = [0, 0, 0], _q = [0, 0, 0, 1], _near = [];
const _ch0 = new Float32Array(CHANNELS);
let _id = 1;

const ARM_L = [P.UARM_L, P.FARM_L, P.HAND_L], ARM_R = [P.UARM_R, P.FARM_R, P.HAND_R];
const LEG_L = [P.THIGH_L, P.SHIN_L, P.FOOT_L], LEG_R = [P.THIGH_R, P.SHIN_R, P.FOOT_R];

function hairBoxes(style) {
  const top = [0, 0.127, -0.004, 0.222, 0.05, 0.232];
  switch (style) {
    case 'bald': return [];
    case 'short': return [top, [0, 0.055, -0.108, 0.22, 0.13, 0.03]];
    case 'medium': return [top, [0, 0.02, -0.112, 0.226, 0.2, 0.04], [0.108, 0.05, -0.02, 0.02, 0.12, 0.16], [-0.108, 0.05, -0.02, 0.02, 0.12, 0.16]];
    case 'long': return [top, [0, -0.05, -0.116, 0.23, 0.34, 0.05], [0.11, 0, -0.03, 0.022, 0.22, 0.15], [-0.11, 0, -0.03, 0.022, 0.22, 0.15]];
    case 'ponytail': return [top, [0, 0.05, -0.11, 0.22, 0.14, 0.035], [0, -0.03, -0.16, 0.06, 0.2, 0.06]];
    case 'bun': return [top, [0, 0.05, -0.11, 0.22, 0.14, 0.035], [0, 0.11, -0.15, 0.09, 0.09, 0.09]];
    case 'beanie': return [[0, 0.105, 0, 0.226, 0.1, 0.236, 1], [0, 0.03, -0.11, 0.21, 0.07, 0.03]];
    case 'cap': return [[0, 0.125, 0, 0.222, 0.055, 0.232, 1], [0, 0.103, 0.15, 0.2, 0.016, 0.1, 1], [0, 0.04, -0.108, 0.21, 0.1, 0.03]];
    default: return [top];
  }
}

export class Human {
  constructor(game, look, x, z, yaw = 0, { player = false } = {}) {
    this.game = game;
    this.id = _id++;
    this.isPlayer = player;
    this.look = look;
    this.name = look.name;
    this.scale = look.scale;
    this.h = new Health({ mass: look.mass, scale: look.scale, tough: player ? 1.35 : rand(0.9, 1.1), pulse: rand(62, 82), temp: rand(36.5, 37.1) });
    this.h.god = !!(player && game.settings && game.settings.cheatHp);
    this.mind = null;                      // feelings and senses, for those who have them
    this.brain = null;

    const r = buildRagdoll(game.world, this, this.scale, look.build || 1);
    for (const b of r.bodies) b.yields = true;
    this.bodies = r.bodies; this.joints = r.joints; this.island = r.island; this.group = r.group;
    this.island.mover = true;
    this.attached = new Array(PART_COUNT).fill(true);
    this.gone = new Array(PART_COUNT).fill(false);
    this.pieces = [];
    this.tone = new Float32Array(PART_COUNT).fill(1);
    this.orients = this.bodies.map((_, i) => ({ x: 0, y: 0, z: 0, w: 1, s: 0, t: MUSCLE_TORQUE[i] }));
    this.partCool = new Float32Array(PART_COUNT);

    this.x = x; this.z = z; this.y = groundHeight(x, z); this.yaw = yaw;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.grounded = true; this.crouching = false;
    this.intent = { mx: 0, mz: 0, run: false, crouch: false, jump: false, face: null };
    this.state = ST.ANIM;
    this.anim = new Animator();
    this.local = new Float32Array(PART_COUNT * 4);
    this.pos = new Float32Array(PART_COUNT * 3);
    this.quat = new Float32Array(PART_COUNT * 4);
    this.snapPos = new Float32Array(PART_COUNT * 3);
    this.snapQuat = new Float32Array(PART_COUNT * 4);
    this.armFix = [new Float32Array(4), new Float32Array(4)];   // what has had to be added to each arm's pose to keep it out of the body
    this.reachT = [null, null];            // somewhere a hand has been sent: { x, y, z, w } in the world, w how much (see _reach)
    this.reachD = [new Float32Array(4), new Float32Array(4)];   // what has been added to each arm's pose to get the hand there
    this.reachW = [0, 0];                  // how far into that each arm is, 0..1
    this.grasp = [-1, -1];                 // a hand taking hold of something: -1 not, 0 open for it .. 1 closed round it
    this.stoop = 0;                        // bent down to get at something low, 0..1
    this.dragMax = Infinity;               // the fastest they can go with whatever they are hauling
    this.grabFace = null;                  // a way to face while reaching for something
    this.grabStep = null;                  // { x, z, d }: a spot to step up to within d of, to reach it
    this.holdBody = null;                  // what they have hold of, which they do not walk into
    this.speedMul = 1;                     // faster than a person can run: a leopard
    this.leap = null;                      // { vx, vy, vz, t }: in the air on a leap
    this.point = [0, 0];                   // an index finger held out straight, each hand, 0..1
    this.claws = false;                    // claws at the ends of the fingers
    this.hidden = false;                   // not drawn at all: something else is being drawn in their place
    this.bulk = 1;                         // drawn this much broader than they are
    this.fur = null;                       // fur all over instead of skin and clothes, as a colour
    this.beast = false;                    // an animal's head on them instead of a face and hair
    this.powerMul = 1; this.reachMul = 1;  // blows land harder, and reach further
    this.sturdy = 1;                       // this much harder to knock off their feet
    this.boost = 1; this.knock = 1;        // what the admin has set: speed, and how hard they are to knock down
    this.puppet = false;                   // a stand-in for another player, moved by what their game sends
    this.remote = null;                    // ...and which player
    this.lastWeapon = null;                // what the last blow to land was dealt with
    this.coat = null;                      // a colour for each part, over whatever they wear: a suit, fur
    this.footLift = [0, 0];                // how far each foot is standing up on something that is not the floor: a body
    this.gait = 0;                         // how fast the feet are actually covering ground
    this.gvx = 0; this.gvz = 0;            // and which way
    this.snapRelQ = new Float32Array(PART_COUNT * 4);   // the snapshot's joint angles: each part relative to its parent
    this.blend = 0; this.blendDur = 0;
    this.balance = 1; this.stumbleT = 0; this.ragT = 0; this.stillT = 0; this.getT = 0;
    this.speed = 0;
    this.pose = { cower: 0, handsUp: 0, hurt: 0, talk: 0, stagger: 0, writhe: 0, crawl: 0, brace: 0, phone: 0, kneel: 0, cuffed: 0, cuffing: 0, call: 0, scan: 0 };
    this.prints = null;                    // Map: who has touched this person with bare hands, and when
    this.phoneIdx = -1;
    this.hold = 'none';
    this.aimPitch = 0; this.lookYaw = 0; this.lookPitch = 0; this.lowAim = 0;
    this.weapon = null;                    // what is in the right hand, if anything
    this.handFull = 0;                     // 0..1: something small held in the left hand
    this.kit = null;                       // everything carried, in the hand or put away (the player's is kept by Weapons)
    this.swap = null;                      // a weapon on its way between hand and holster
    this.reload = null;                    // a magazine change in progress
    this.aimYaw = null; this.gunLow = 0;   // where a gun in this hand points, and how far it is lowered
    this.vest = null; this.helmet = null;
    this.car = null; this.seat = -1;      // a car they are sitting in, and which seat
    this.tased = 0; this.dazeT = 0;        // seconds of a taser's cycle left; seconds of being no use to anyone after it
    this.cuffed = null;                    // { item, by, joint } while in handcuffs
    this.cuffing = null;                   // { target, item, t, dur } while putting them on somebody
    this.custody = null;                   // { by } when it was the police who did it
    this.handled = null;                   // { by, u, t, yaw, ... } while somebody turns them over to cuff them
    this.guardT = 0;
    this.tripCool = 0; this.jumpCool = 0;
    this.lunge = 0;                        // metres an attack in progress steps forward
    this.crawlDir = null;
    this._hAcc = Math.random() * 0.1; this._faceT = Math.random() * 0.2; this._faceKey = '';
    this.blinkT = rand(2, 5); this.blink = 0;
    this.talkT = 0; this.scream = 0;
    this.removed = false;
    this.deadFor = 0;
    this.bloodied = 0;
    this.lastAttacker = null;

    this._buildVisuals();
    this._solve(0);
    for (let i = 0; i < PART_COUNT; i++) {
      const b = this.bodies[i];
      b.setKinematic(true);
      b.setPose(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2], this.quat[i * 4], this.quat[i * 4 + 1], this.quat[i * 4 + 2], this.quat[i * 4 + 3], 0);
    }
    this.island.constrain = (h) => this._substep(h);
  }

  /* -------------------------------- visuals ------------------------------- */

  _buildVisuals() {
    const g = this.game, L = this.look, s = this.scale;
    this.inst = [];
    this.sizes = [];
    this.skinParts = [];
    this.cloth = [];                       // each part's cloth colour, or -1 where it is skin
    this.soak = new Float32Array(PART_COUNT);   // how much blood each part's clothing has taken up, 0..1
    this._soakQ = new Int8Array(PART_COUNT);
    for (let i = 0; i < PART_COUNT; i++) {
      const p = PARTS[i];
      const wide = i === P.HEAD || i === P.HAND_L || i === P.HAND_R || i === P.FOOT_L || i === P.FOOT_R || i === P.NECK ? 1 : L.build;
      this.sizes.push([p.size[0] * s * wide, p.size[1] * s, p.size[2] * s * wide]);
      const idx = g.boxes.alloc();
      this.inst.push(idx);
      let hex = L.skin, skin = true;
      if (p.cover === 'shirt') { hex = L.top; skin = false; }
      else if (p.cover === 'pants') { hex = L.pants; skin = false; }
      else if (p.cover === 'shoes') { hex = L.shoes; skin = false; }
      if ((i === P.FARM_L || i === P.FARM_R) && L.longSleeve) { hex = L.top; skin = false; }
      if ((i === P.SHIN_L || i === P.SHIN_R) && L.shorts) { hex = L.skin; skin = true; }
      if (skin) this.skinParts.push(i);
      g.boxes.colorHex(idx, hex);
      this.cloth[i] = skin ? -1 : hex;
    }
    this.clothed = PARTS.map((_, i) => !this.skinParts.includes(i));
    this.hair = hairBoxes(L.style).map((h) => {
      const idx = g.boxes.alloc();
      g.boxes.colorHex(idx, h[6] ? L.hat : L.hair);
      return { idx, l: [h[0] * s, h[1] * s, h[2] * s], s: [h[3] * s, h[4] * s, h[5] * s] };
    });
    // ten boxes a hand: four fingers and a thumb, two segments each
    this.fingers = [[], []];
    for (let hnd = 0; hnd < 2; hnd++) for (let k = 0; k < 10; k++) { const idx = g.boxes.alloc(); g.boxes.colorHex(idx, L.skin); this.fingers[hnd].push(idx); }
    this.curl = [0.3, 0.3];               // how closed each hand is: left, right
    this.trigger = 0.3;                   // the right index finger, which has a job of its own
    this.splay = [0, 0];
    this.faceCell = g.faces.alloc();
    this.faceQuad = g.faceQuads.alloc();
    if (this.faceCell >= 0 && this.faceQuad >= 0) {
      const cx = this.faceCell % FACE_COLS, cy = (this.faceCell / FACE_COLS) | 0;
      g.faceQuads.uvRect(this.faceQuad, cx / FACE_COLS, 1 - (cy + 1) / FACE_ROWS, (cx + 1) / FACE_COLS, 1 - cy / FACE_ROWS);
      g.faceQuads.tint(this.faceQuad, 1, 1, 1, 1);
    }
    this.face = restingFace();
    this._pallor = -1;
  }

  _reloadState() {
    const r = this.reload;
    if (!r) return null;
    const o = this._rl || (this._rl = { kind: '', u: 0 });
    o.kind = r.kind; o.u = r.t / r.dur;
    return o;
  }

  /* ---- armour: a vest, a helmet (see armour.js for what each kind covers and stops) ---- */

  /** Puts a vest on: 'light', 'medium' or 'swat'. `police` adds white patches to a light one. */
  wearVest(kind = 'light', police = false) {
    if (this.vest) return;
    if (kind === true) { kind = 'light'; police = true; }
    const def = VESTS[kind] || VESTS.light, g = this.game, s = this.scale;
    const boxes = vestBoxes(def.kind, this.sizes, s, police).map(([part, l, z, hex]) => {
      const idx = g.boxes.alloc(); g.boxes.colorHex(idx, hex);
      return { idx, part, l, z };
    });
    this.vest = { kind: def.kind, def, boxes, hits: 0, police, lift: def.lift * s };
  }
  removeVest() {
    if (!this.vest) return;
    for (const b of this.vest.boxes) this.game.boxes.release(b.idx);
    this.vest = null;
  }

  /** Puts a helmet on: 'light', 'medium' or 'swat' (with a visor). */
  wearHelmet(kind = 'light') {
    if (this.helmet) return;
    const def = HELMETS[kind] || HELMETS.light, g = this.game, s = this.scale;
    const boxes = [];
    for (const [l, z, hex, glass] of helmetBoxes(def.kind)) {
      const set = glass ? g.glass : g.boxes;
      const idx = set.alloc(); set.colorHex(idx, hex);
      boxes.push({ idx, glass: !!glass, part: P.HEAD, l: [l[0] * s, l[1] * s, l[2] * s], z: [z[0] * s, z[1] * s, z[2] * s] });
    }
    this.helmet = { kind: def.kind, def, hits: 0, visor: def.kind === 'swat' ? 0 : -1, lift: def.lift * s, boxes };
  }
  removeHelmet() {
    if (!this.helmet) return;
    for (const b of this.helmet.boxes) (b.glass ? this.game.glass : this.game.boxes).release(b.idx);
    this.helmet = null;
  }
  /** A visor still in one piece: it holds three rounds, give or take, and then it is crazed glass. */
  get visorUp() { return !!this.helmet && this.helmet.visor >= 0 && this.helmet.visor < 3; }

  /** What armour, if any, is between a blow and the body at a point on a part (in the part's own space): a material, or null. */
  armourAt(part, lp, ln) {
    if (!this.attached[part]) return null;
    if (part === P.HEAD) return this.helmet ? helmetCover(this.helmet.kind, lp, ln, this.scale, this.visorUp) : null;
    return this.vest ? vestCover(this.vest.kind, part, lp, ln, this.scale) : null;
  }

  /* ---- a taser ---- */

  /**
   * Current through the muscles for `secs`: every one of them contracts at
   * once, which is not something anybody stays standing through.
   */
  tase(secs, by = null, how = 'taser') {
    if (this.puppet) { this.game.mp?.taseRemote(this, secs, by, how); return; }
    if (this.removed || !this.h.alive) return;
    const fresh = this.tased <= 0;
    this.tased = Math.max(this.tased, secs);
    this.dazeT = 1.6;
    if (by) this.lastAttacker = by;
    if (fresh) {
      const g = this.game;
      if (this.state !== ST.RAGDOLL) this.toRagdoll();
      // the pose they were in when it hit is the pose they are stuck in
      const pel = this.bodies[P.PELVIS];
      this._stiff = this.bodies.map((b) => {
        const ax = -pel.qx, ay = -pel.qy, az = -pel.qz, aw = pel.qw;
        return [aw * b.qx + ax * b.qw + ay * b.qz - az * b.qy, aw * b.qy - ax * b.qz + ay * b.qw + az * b.qx, aw * b.qz + ax * b.qy - ay * b.qx + az * b.qw, aw * b.qw - ax * b.qx - ay * b.qy - az * b.qz];
      });
      // nobody balances like that: over they go, stiff as a board, on to their face or their back
      const way = chance(0.5) ? 1 : -1, fx = Math.sin(this.yaw) * way, fz = Math.cos(this.yaw) * way;
      for (const i of [P.CHEST, P.HEAD, P.ABDOMEN]) { const b = this.bodies[i]; if (this.attached[i]) b.applyImpulse(fx * b.mass * 1.9, 0, fz * b.mass * 1.9); }
      g.weapons?.dropFrom(this);
      this.scream = Math.max(this.scream, 0.9);
      if (this.mind) {
        const m = this.mind, seen = by && typeof by === 'object' && (m.canSeeHuman(by) > 0 || (m.known.get(by.id) && g.time - m.known.get(by.id).last < 1.6));
        m.note('felt', 'tased', how === 'shock' ? 'electricity: every muscle locked at once and I could not let go' : `every muscle locked at once: a taser${seen ? ', fired by ' + m.name(by) : ''}`, 1, { attacker: by });
        m.stir('fear', 40); m.stir('surprise', 60); m.stir('anger', 12); m.stir('joy', -40);
        if (by && typeof by === 'object') { const k = m._know(by); k.hurtMe = true; k.hostile = 1; k.armed = how === 'shock' ? 'wire' : 'taser'; if (!by.officer) { k.crime = Math.max(k.crime, Math.min(2.4, k.crime + 1.2)); k.crimeT = g.time; } if (seen) m._threaten(by, 78); }
        m.ask('tased', 96);
      }
      if (this.isPlayer) g.shake = Math.max(g.shake, 1.1);
    }
  }

  /** Blood loss shows in the skin. */
  _tintSkin() {
    // the colour goes with the blood, and then, slowly, with everything else
    const pale = clamp01((92 - this.h.bloodPct) / 50 + (this.h.alive ? 0 : this.deadFor / 150));
    const q = Math.round(pale * 10);
    // and where it is burnt: red, then blistered and raw, then charred
    const B = this.h.burns;
    let bk = 0;
    for (const i of this.skinParts) bk = bk * 7 + Math.round(B[i] / 15);
    if (q === this._pallor && bk === this._burnKey) return;
    this._pallor = q; this._burnKey = bk;
    const base = rgb(this.fur ?? this.look.skin), grey = rgb(0xb9bdb6), k = this.fur != null ? 0 : q / 10 * 0.72;
    const cr = lerp(base[0], grey[0], k), cg = lerp(base[1], grey[1], k), cb = lerp(base[2], grey[2], k);
    const coat = this.coat, cc = (i) => { if (!coat) return [cr, cg, cb]; const v = rgb(coat[i]); return v; };
    for (const i of this.skinParts) {
      const b0 = cc(i), c = burnt(b0[0], b0[1], b0[2], B[i]);
      this.game.boxes.color(this.inst[i], c[0], c[1], c[2]);
    }
    this.fingers.forEach((hand, n) => { const part = n ? P.HAND_R : P.HAND_L, b0 = cc(part), c = burnt(b0[0], b0[1], b0[2], B[part]); for (const i of hand) this.game.boxes.color(i, c[0], c[1], c[2]); });
  }

  _expression(dt) {
    const e = this.face, h = this.h, t = this.game.time;
    const emo = this.mind ? this.mind.emo : null;
    const F = emo ? emo.fear / 100 : 0, A = emo ? emo.anger / 100 : 0, S = emo ? emo.sadness / 100 : 0;
    const J = emo ? emo.joy / 100 : 0.3, U = emo ? emo.surprise / 100 : 0, B = emo ? emo.boredom / 100 : 0;
    const pn = h.pain / 100;
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blink = 0.13; this.blinkT = rand(2.2, 5.5); }
    this.blink = Math.max(0, this.blink - dt);
    e.eyeL = h.organs.eyeL > 20; e.eyeR = h.organs.eyeR > 20;
    e.pale = h.bloodPct < 72 || !h.alive;
    let nose = 0, mouth = 0, bruise = 0;
    for (const w of h.wounds) if (w.part === P.HEAD) { if (w.nose) nose = Math.max(nose, clamp01(0.4 + w.age / 12)); if (w.type === 'bruise' || w.type === 'crush') bruise += 0.3; }
    if (h.organs.lungL < 70 || h.organs.lungR < 70 || h.organs.stomach < 60 || h.bones.jaw < 67) mouth = clamp01(0.5 + (100 - Math.min(h.organs.lungL, h.organs.lungR)) / 100);
    e.noseBleed = nose; e.mouthBleed = h.organs.lungL < 0 ? 0 : mouth; e.bruise = Math.min(1, bruise);
    e.red = clamp01(h.concussion / 120);
    if (!h.alive) {
      e.eyeOpen = 0.42; e.browTilt = 0; e.browRaise = 0.2; e.mouthCurve = -0.1; e.mouthOpen = 0.3; e.teeth = false; e.tears = 0; e.gazeX = 0.4; e.gazeY = -0.5; e.pupil = 2.4;
    } else if (!h.conscious) {
      e.eyeOpen = 0; e.browTilt = 0; e.browRaise = 0; e.mouthCurve = -0.05; e.mouthOpen = 0.12; e.teeth = false; e.tears = 0;
    } else {
      const agony = pn > 0.55 ? (pn - 0.55) / 0.45 : 0;
      e.eyeOpen = this.blink > 0 ? 0 : clamp(1 + 0.4 * Math.max(F, U) - 0.5 * B - agony * 0.75 - (h.dazed ? 0.3 : 0), 0.12, 1.4);
      e.browTilt = clamp(A * 1.0 - S * 0.8 - F * 0.45 + agony * 0.3, -1, 1);
      e.browRaise = clamp01(Math.max(U, F * 0.7));
      e.mouthCurve = clamp(J * 0.9 - S * 0.75 - A * 0.5 - pn * 0.6 - F * 0.3, -1, 1);
      const talking = this.talkT > 0;
      e.mouthOpen = this.scream > 0 ? 0.95 : talking ? 0.2 + 0.4 * Math.abs(Math.sin(t * 13 + this.id)) : clamp01(U * 0.6 + agony * 0.55 + (F > 0.75 ? 0.3 : 0));
      e.mouthWide = this.scream > 0 ? 1 : 0;
      e.teeth = A > 0.6 || agony > 0.3 || this.scream > 0;
      e.tears = clamp01(Math.max(S - 0.45, agony * 0.8, F - 0.75) * 2);
      e.gazeX = clamp(-this.lookYaw * 0.8, -1, 1); e.gazeY = 0;
      e.pupil = 1.3 + F * 0.7;
    }
    const key = faceKey(e);
    if (key !== this._faceKey) { this._faceKey = key; this.game.faces.draw(this.faceCell, this.look, e); }
  }

  /* --------------------------------- poses -------------------------------- */

  /** Runs the animator and the forward kinematics for where we stand now. */
  _solve(dt, x = this.x, y = this.y, z = this.z, yaw = this.yaw) {
    // on their feet, the legs step the way the body is actually going, as fast as it is actually going:
    // somebody walking into a wall of people, or being shoved sideways, does not stride on regardless
    const anim = this.state === ST.ANIM;
    const vx = anim ? this.gvx : this.vx, vz = anim ? this.gvz : this.vz, sp0 = anim ? this.gait : this.speed;
    const sp = sp0 / this.scale;
    let mx = 0, mz = 1;
    if (sp0 > 0.05) {
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      mz = (vx * s + vz * c) / sp0;
      mx = (vx * c - vz * s) / sp0;
    }
    const lm = Math.max(this.h.legLimp(1), this.h.legLimp(-1));
    const ch = this.anim.update(dt, {
      speed: sp, mx, mz, crouch: this.crouching ? 1 : 0, grounded: this.grounded || this.state !== ST.ANIM, vy: this.vy,
      hold: this.hold, aimPitch: this.aimPitch, lookYaw: this.lookYaw, lookPitch: this.lookPitch, pose: this.pose,
      limp: lm, limpSide: this.h.legLimp(1) >= this.h.legLimp(-1) ? 1 : -1, lowAim: this.lowAim,
      leanZ: this._leanZ || 0, leanX: this._leanX || 0,
      reach: this.swap ? this.swap.reach : null, reachW: this.swap ? this.swap.w : 0, reload: this._reloadState(), stoop: this.stoop,
      liftL: this.footLift[0] / this.scale, liftR: this.footLift[1] / this.scale,
    });
    this._ch = ch;
    channelsToLocal(ch, this.local);
    solvePose(x, y, z, yaw, this.scale, ch, this.local, this.pos, this.quat);
  }

  /**
   * How far one arm is inside the rest of the body, as the pose now stands:
   * the sum, over its three parts and everything they could be in, of how far
   * each would have to move to be clear.
   */
  _armCost(side, crowdOnly = false) {
    const pos = this.pos, quat = this.quat, sz = this.sizes, at = this.attached;
    const first = side ? P.UARM_R : P.UARM_L, other = side ? P.UARM_L : P.UARM_R;
    let cost = 0;
    for (let k = 0; k < 3; k++) {
      const m = first + k;
      if (!at[m]) break;
      if (!crowdOnly) {
        for (let j = 0; j < ARM_BLOCK.length; j++) {
          const o = ARM_BLOCK[j];
          if (!at[o] || (k === 0 && o === P.CHEST)) continue;
          cost += boxDepth(pos, quat, m, sz[m], o, sz[o]);
        }
        for (let j = 0; j < 3; j++) { const o = other + j; if (at[o]) cost += boxDepth(pos, quat, m, sz[m], o, sz[o]); }
      }
      // and whoever is standing close enough to be in the way
      for (let n = 0; n < _crowdN; n++) {
        const h = _crowd[n], bs = h.bodies, hz = h.sizes;
        for (let j = 0; j < CROWD_BLOCK.length; j++) { const o = CROWD_BLOCK[j]; if (!h.gone[o]) cost += boxDepthBody(pos, quat, m, sz[m], bs[o], hz[o]); }
      }
    }
    return cost;
  }

  /**
   * An arm that the animation has put inside the body is moved out of it: the
   * shoulder and the elbow are turned, a little at a time, whichever way gets
   * it clear soonest, and let go again as soon as they can be.
   */
  _clearArms() {
    const ch = this._ch, pos = this.pos, quat = this.quat, s = this.scale, act = this.anim.action;
    // who is near enough for an arm to reach? (Not while putting handcuffs on them: the hands are meant to get there.)
    _crowdN = 0;
    if (!this.cuffing) {
      const cx = pos[P.CHEST * 3], cy = pos[P.CHEST * 3 + 1], cz = pos[P.CHEST * 3 + 2];
      for (const o of this.game.humans) {
        if (o === this || o.removed || _crowdN >= 4) continue;
        const b = o.bodies[P.CHEST], dx = b.px - cx, dy = b.py - cy, dz = b.pz - cz;
        if (dx * dx + dy * dy + dz * dz < 1.25) _crowd[_crowdN++] = o;
      }
    }
    // the arm a blow is thrown with stops where it meets somebody, by bending at the elbow: it does not go round them
    const strike = act && act.def ? (act.clip.limb === 'handL' ? 0 : act.clip.limb === 'footR' ? -1 : 1) : -1;
    for (let side = 0; side < 2; side++) {
      if (!this.attached[side ? P.UARM_R : P.UARM_L]) continue;
      const fix = this.armFix[side];
      const live = fix[0] !== 0 || fix[1] !== 0 || fix[2] !== 0 || fix[3] !== 0;
      if (live) solveArm(side, s, ch, fix, pos, quat);
      if (side === strike && _crowdN > 0) {
        // (no further than the fist would fold back into the arm)
        const el = ch[side ? CH.elR : CH.elL];
        for (let it = 0; it < 8 && el + fix[3] < 1.85 && this._armCost(side, true) > 0; it++) { fix[3] = Math.min(fix[3] + 0.12, 1.85 - el); solveArm(side, s, ch, fix, pos, quat); }
      }
      let cost = this._armCost(side);
      if (cost > 0) {
        let step = 0.09;
        for (let it = 0; it < 3 && cost > 0; it++) {
          let best = cost, bi = -1;
          for (let c = 0; c < 8; c++) {
            const i = ARM_TRY[c] >> 1, d = ARM_TRY[c] & 1 ? -step : step;
            const was = fix[i];
            fix[i] = clamp(was + d, -1.5, 1.5);
            solveArm(side, s, ch, fix, pos, quat);
            const v = this._armCost(side);
            if (v < best - 1e-5) { best = v; bi = c; }
            fix[i] = was;
          }
          if (bi < 0) { step *= 0.5; continue; }
          const i = ARM_TRY[bi] >> 1;
          fix[i] = clamp(fix[i] + (ARM_TRY[bi] & 1 ? -step : step), -1.5, 1.5);
          cost = best;
        }
        solveArm(side, s, ch, fix, pos, quat);
      } else if (live) {
        // clear: ease back toward what the animation asked for, for as long as that stays clear
        for (let i = 0; i < 4; i++) { _fx[i] = fix[i]; fix[i] = Math.abs(fix[i]) < 0.012 ? 0 : fix[i] * 0.84; }
        solveArm(side, s, ch, fix, pos, quat);
        if (this._armCost(side) > 0) { for (let i = 0; i < 4; i++) fix[i] = _fx[i]; solveArm(side, s, ch, fix, pos, quat); }
      }
    }
  }

  /**
   * A long gun with a forestock to hold (def.fore): the left hand goes out
   * along the stock to it, wherever the gun is pointing, rather than staying
   * by the right. Worked out from the pose's right hand the way the gun
   * itself is placed after the physics (Weapons.late).
   */
  _fore() {
    const it = this.weapon, d = it && it.def, F = this._foreT || (this._foreT = { x: 0, y: 0, z: 0, w: 0, rate: 7, fore: true });
    if (this.reachT[0] && !this.reachT[0].fore) return;
    const w = d && d.fore && this.hold === 'rifle' && !this.swap && !this.handFull && this.grasp[0] < 0 && this.attached[P.HAND_R] && this.h.armOk(1)
      ? this.anim.w.rifle * (1 - (this.anim.reloadW || 0)) : 0;
    if (w < 0.02) { if (this.reachT[0] === F) this.reachT[0] = null; return; }
    const g = this.game, low = this.isPlayer ? 0 : this.gunLow || 0;
    const yaw = this.isPlayer ? g.camYaw : this.aimYaw ?? this.yaw;
    const pitch = (this.isPlayer ? g.camPitch : this.aimPitch || 0) * (1 - low) + this.anim.recoil * 0.12 - low * 0.9;
    const sy = Math.sin(yaw / 2), cy = Math.cos(yaw / 2), sx = Math.sin(-pitch / 2), cx = Math.cos(-pitch / 2);
    const qx = cy * sx, qy = sy * cx, qz = -sy * sx, qw = cy * cx;
    const s = this.scale, o = P.HAND_R * 4, q = this.quat;
    qrot(q[o], q[o + 1], q[o + 2], q[o + 3], 0.016 * s, -0.03 * s, 0.01, _ra);
    const gx = this.pos[P.HAND_R * 3] + _ra[0], gy = this.pos[P.HAND_R * 3 + 1] + _ra[1], gz = this.pos[P.HAND_R * 3 + 2] + _ra[2];
    qrot(qx, qy, qz, qw, d.fore[0] - d.grip[0], d.fore[1] - d.grip[1], d.fore[2] - d.grip[2], _rb);
    F.x = gx + _rb[0]; F.y = gy + _rb[1]; F.z = gz + _rb[2]; F.w = w;
    this.reachT[0] = F;
  }

  /** Where the palm of one hand is in the pose as it stands (side 0 left, 1 right). */
  palmAt(side, out) {
    const i = side ? P.HAND_R : P.HAND_L, s = this.scale, q = this.quat, o = i * 4;
    qrot(q[o], q[o + 1], q[o + 2], q[o + 3], (side ? 0.015 : -0.015) * s, -0.045 * s, 0.01 * s, out);
    out[0] += this.pos[i * 3]; out[1] += this.pos[i * 3 + 1]; out[2] += this.pos[i * 3 + 2];
    return out;
  }

  /**
   * A hand sent to a point in the world (reachT), whatever the rest of the
   * body is doing: the shoulder's three angles and the elbow are turned toward
   * it a little at a time, by damped least squares, starting each frame from
   * where they ended the last, and the result is blended in by how much the
   * reach is wanted. What it adds is written into the pose's channels, so the
   * arm is then kept out of the body like any other.
   */
  _reach(dt) {
    const ch = this._ch, pos = this.pos, quat = this.quat, s = this.scale;
    if (!ch) return;
    this._fore();
    for (let side = 0; side < 2; side++) {
      const T = this.reachT[side], d = this.reachD[side];
      const hand = side ? P.HAND_R : P.HAND_L;
      const goal = T && this.attached[side ? P.UARM_R : P.UARM_L] && this.attached[hand] ? clamp01(T.w ?? 1) : 0;
      const was = this.reachW[side];
      const w = this.reachW[side] = was + clamp(goal - was, -dt * 4, dt * (T && T.rate ? T.rate : 4.5));
      if (w <= 0.001) { if (!T) d.fill(0); continue; }
      const base = side ? CH.shR : CH.shL;
      if (goal > 0) {
        // drift back toward the pose the animation wanted, and correct from there
        for (let k = 0; k < 4; k++) d[k] *= 0.985;
        for (let it = 0; it < 3; it++) {
          solveArm(side, s, ch, d, pos, quat);
          this.palmAt(side, _ra);
          const ex = T.x - _ra[0], ey = T.y - _ra[1], ez = T.z - _ra[2];
          if (ex * ex + ey * ey + ez * ez < 1.6e-5) break;
          // how the palm moves for a small turn of each of the four
          for (let k = 0; k < 4; k++) {
            const v = d[k];
            d[k] = v + 0.02;
            solveArm(side, s, ch, d, pos, quat);
            this.palmAt(side, _rb);
            _rj[k * 3] = (_rb[0] - _ra[0]) / 0.02; _rj[k * 3 + 1] = (_rb[1] - _ra[1]) / 0.02; _rj[k * 3 + 2] = (_rb[2] - _ra[2]) / 0.02;
            d[k] = v;
          }
          // (J Jt + l^2 I) y = e, then the step is Jt y
          const L2 = 0.006;
          let a00 = L2, a01 = 0, a02 = 0, a11 = L2, a12 = 0, a22 = L2;
          for (let k = 0; k < 4; k++) {
            const jx = _rj[k * 3], jy = _rj[k * 3 + 1], jz = _rj[k * 3 + 2];
            a00 += jx * jx; a01 += jx * jy; a02 += jx * jz; a11 += jy * jy; a12 += jy * jz; a22 += jz * jz;
          }
          const c00 = a11 * a22 - a12 * a12, c01 = a02 * a12 - a01 * a22, c02 = a01 * a12 - a02 * a11;
          const det = a00 * c00 + a01 * c01 + a02 * c02;
          if (Math.abs(det) < 1e-12) break;
          const c11 = a00 * a22 - a02 * a02, c12 = a01 * a02 - a00 * a12, c22 = a00 * a11 - a01 * a01;
          const yx = (c00 * ex + c01 * ey + c02 * ez) / det, yy = (c01 * ex + c11 * ey + c12 * ez) / det, yz = (c02 * ex + c12 * ey + c22 * ez) / det;
          for (let k = 0; k < 4; k++) {
            const step = clamp(_rj[k * 3] * yx + _rj[k * 3 + 1] * yy + _rj[k * 3 + 2] * yz, -0.3, 0.3);
            // within what a shoulder and an elbow will do
            d[k] = clamp(d[k] + step, REACH_LO[k] - ch[base + k], REACH_HI[k] - ch[base + k]);
          }
        }
      }
      for (let k = 0; k < 4; k++) ch[base + k] += d[k] * w;
      solveArm(side, s, ch, _r0, pos, quat);
    }
  }

  _snapshot() {
    const sp = this.snapPos, sq = this.snapQuat, sl = this.snapRelQ;
    for (let i = 0; i < PART_COUNT; i++) {
      const b = this.bodies[i];
      sp[i * 3] = b.px; sp[i * 3 + 1] = b.py; sp[i * 3 + 2] = b.pz;
      sq[i * 4] = b.qx; sq[i * 4 + 1] = b.qy; sq[i * 4 + 2] = b.qz; sq[i * 4 + 3] = b.qw;
    }
    // and the shape the body is in: each part's turn at its joint, relative to the part it hangs from
    for (let i = 1; i < PART_COUNT; i++) {
      const k = i * 4, pk = PARTS[i].parent * 4;
      const ax = -sq[pk], ay = -sq[pk + 1], az = -sq[pk + 2], aw = sq[pk + 3];
      const bx = sq[k], by = sq[k + 1], bz = sq[k + 2], bw = sq[k + 3];
      sl[k] = aw * bx + ax * bw + ay * bz - az * by; sl[k + 1] = aw * by - ax * bz + ay * bw + az * bx;
      sl[k + 2] = aw * bz + ax * by - ay * bx + az * bw; sl[k + 3] = aw * bw - ax * bx - ay * by - az * bz;
    }
  }

  /** Puts the attached parts where the solved pose says, blending out of a snapshot if one is fading. */
  _apply(dt, w = 1) {
    const pos = this.pos, quat = this.quat, sp = this.snapPos, sq = this.snapQuat;
    if (w >= 1) {
      for (let i = 0; i < PART_COUNT; i++) {
        if (!this.attached[i]) continue;
        const o = i * 3, k = i * 4;
        this.bodies[i].setPose(pos[o], pos[o + 1], pos[o + 2], quat[k], quat[k + 1], quat[k + 2], quat[k + 3], dt);
      }
      return;
    }
    // The pelvis goes from where it lay to where it should be, turning as it goes,
    // and every joint turns from the angle it was at to the angle it should be at,
    // with the limbs hanging from the joints as they turn. Blending where each part
    // is instead, along a straight line, would fold the body through itself.
    const BP = _blendP, BQ = _blendQ;
    let rx = sq[0], ry = sq[1], rz = sq[2], rw = sq[3];
    if (rx * quat[0] + ry * quat[1] + rz * quat[2] + rw * quat[3] < 0) { rx = -rx; ry = -ry; rz = -rz; rw = -rw; }
    rx += (quat[0] - rx) * w; ry += (quat[1] - ry) * w; rz += (quat[2] - rz) * w; rw += (quat[3] - rw) * w;
    const n = 1 / Math.hypot(rx, ry, rz, rw);
    BQ[0] = rx * n; BQ[1] = ry * n; BQ[2] = rz * n; BQ[3] = rw * n;
    BP[0] = sp[0] + (pos[0] - sp[0]) * w; BP[1] = sp[1] + (pos[1] - sp[1]) * w; BP[2] = sp[2] + (pos[2] - sp[2]) * w;
    for (let i = 1; i < PART_COUNT; i++) if (this.attached[i]) this._blendPart(i, w);
    // Even turning at the joints, an arm that lay under the body can come up through it: such an arm
    // goes on ahead to where it is going (which is clear of the body), as far ahead as it takes.
    const sz = this.sizes;
    for (let side = 0; side < 2; side++) {
      const first = side ? P.UARM_R : P.UARM_L;
      for (let step = 1; step <= 3; step++) {
        let inside = false;
        for (let k = 0; k < 3 && !inside; k++) {
          const m = first + k;
          if (!this.attached[m]) break;
          for (let j = 0; j < ARM_BLOCK.length; j++) {
            const o = ARM_BLOCK[j];
            if (!this.attached[o] || (k === 0 && o === P.CHEST)) continue;
            if (boxDepth(BP, BQ, m, sz[m], o, sz[o]) > 0.006) { inside = true; break; }
          }
        }
        if (!inside) break;
        const wa = w + (1 - w) * step / 3;
        for (let k = 0; k < 3; k++) if (this.attached[first + k]) this._blendPart(first + k, wa);
      }
    }
    for (let i = 0; i < PART_COUNT; i++) {
      if (!this.attached[i]) continue;
      const o = i * 3, k = i * 4;
      this.bodies[i].setPose(BP[o], BP[o + 1], BP[o + 2], BQ[k], BQ[k + 1], BQ[k + 2], BQ[k + 3], dt);
    }
  }

  /** One part of a blend between the snapshot and the pose, hung from its parent as the blend already has it. */
  _blendPart(i, w) {
    const quat = this.quat, sl = this.snapRelQ, s = this.scale, BP = _blendP, BQ = _blendQ;
    const p = PARTS[i], k = i * 4, pk = p.parent * 4;
    // the joint as the pose has it: conj(parent) * part
    const ax = -quat[pk], ay = -quat[pk + 1], az = -quat[pk + 2], aw = quat[pk + 3];
    const bx = quat[k], by = quat[k + 1], bz = quat[k + 2], bw = quat[k + 3];
    const gx = aw * bx + ax * bw + ay * bz - az * by, gy = aw * by - ax * bz + ay * bw + az * bx;
    const gz = aw * bz + ax * by - ay * bx + az * bw, gw = aw * bw - ax * bx - ay * by - az * bz;
    let jx = sl[k], jy = sl[k + 1], jz = sl[k + 2], jw = sl[k + 3];
    if (jx * gx + jy * gy + jz * gz + jw * gw < 0) { jx = -jx; jy = -jy; jz = -jz; jw = -jw; }
    jx += (gx - jx) * w; jy += (gy - jy) * w; jz += (gz - jz) * w; jw += (gw - jw) * w;
    const n = 1 / Math.hypot(jx, jy, jz, jw);
    jx *= n; jy *= n; jz *= n; jw *= n;
    const px = BQ[pk], py = BQ[pk + 1], pz = BQ[pk + 2], pw = BQ[pk + 3];
    const qx = pw * jx + px * jw + py * jz - pz * jy, qy = pw * jy - px * jz + py * jw + pz * jx;
    const qz = pw * jz + px * jy - py * jx + pz * jw, qw = pw * jw - px * jx - py * jy - pz * jz;
    BQ[k] = qx; BQ[k + 1] = qy; BQ[k + 2] = qz; BQ[k + 3] = qw;
    qrot(px, py, pz, pw, p.la[0] * s, p.la[1] * s, p.la[2] * s, _a);
    qrot(qx, qy, qz, qw, p.lb[0] * s, p.lb[1] * s, p.lb[2] * s, _b);
    const o = i * 3, po = p.parent * 3;
    BP[o] = BP[po] + _a[0] - _b[0]; BP[o + 1] = BP[po + 1] + _a[1] - _b[1]; BP[o + 2] = BP[po + 2] + _a[2] - _b[2];
  }

  /** How hard each part can pull right now. */
  _tone() {
    const h = this.h, t = this.tone;
    const base = h.alive && h.conscious ? (h.dazed ? 0.6 : 1) : 0;
    t.fill(base);
    if (base === 0) return;
    const set = (list, v) => { for (const i of list) t[i] = Math.min(t[i], v); };
    if (!h.armOk(1)) set(ARM_L, h.paralysedArms ? 0 : 0.06);
    if (!h.armOk(-1)) set(ARM_R, h.paralysedArms ? 0 : 0.06);
    if (!h.legOk(1)) set(LEG_L, 0.06);
    if (!h.legOk(-1)) set(LEG_R, 0.06);
    if (h.paralysedLegs) { set(LEG_L, 0); set(LEG_R, 0); }
    if (h.bones.lspine < 34) t[P.ABDOMEN] *= 0.4;
  }

  /**
   * Hands every attached part a rotation to hold. With `rel` the pose is
   * taken relative to the pelvis as it actually lies; without, in the world.
   */
  _muscles(strength, rel) {
    const quat = this.quat, pel = this.bodies[P.PELVIS];
    for (let i = 0; i < PART_COUNT; i++) {
      const b = this.bodies[i];
      if (!this.attached[i]) continue;
      const o = this.orients[i], k = i * 4;
      const s = strength * this.tone[i];
      if (s <= 0.002 || (rel && i === 0)) { b.orient = null; continue; }
      if (rel) {
        // conj(pose pelvis) * pose part, then onto the real pelvis
        const ax = -quat[0], ay = -quat[1], az = -quat[2], aw = quat[3];
        const bx = quat[k], by = quat[k + 1], bz = quat[k + 2], bw = quat[k + 3];
        const rx = aw * bx + ax * bw + ay * bz - az * by, ry = aw * by - ax * bz + ay * bw + az * bx;
        const rz = aw * bz + ax * by - ay * bx + az * bw, rw = aw * bw - ax * bx - ay * by - az * bz;
        o.x = pel.qw * rx + pel.qx * rw + pel.qy * rz - pel.qz * ry;
        o.y = pel.qw * ry - pel.qx * rz + pel.qy * rw + pel.qz * rx;
        o.z = pel.qw * rz + pel.qx * ry - pel.qy * rx + pel.qz * rw;
        o.w = pel.qw * rw - pel.qx * rx - pel.qy * ry - pel.qz * rz;
      } else { o.x = quat[k]; o.y = quat[k + 1]; o.z = quat[k + 2]; o.w = quat[k + 3]; }
      o.s = s;
      b.orient = o;
    }
  }
  _relax() { for (const b of this.bodies) b.orient = null; }

  /* ------------------------------- the frame ------------------------------ */

  /** Before physics: decide where the body should be, or what it should try for. */
  update(dt) {
    if (this.removed) return;
    // another player: their own game moves them; nothing here decides anything about them
    if (this.puppet) { this.talkT = Math.max(0, this.talkT - dt); this.pose.talk = this.talkT > 0 ? 1 : 0; if (!this.h.alive) this.deadFor += dt; return; }
    this._hAcc += dt;
    if (this._hAcc >= 0.1) { this._hAcc -= 0.1; this._healthTick(0.1); }
    this.talkT = Math.max(0, this.talkT - dt); this.scream = Math.max(0, this.scream - dt);
    this.guardT = Math.max(0, this.guardT - dt);
    this.tripCool = Math.max(0, this.tripCool - dt); this.jumpCool = Math.max(0, this.jumpCool - dt);
    for (let i = 0; i < PART_COUNT; i++) if (this.partCool[i] > 0) this.partCool[i] -= dt;
    if (!this.h.alive) this.deadFor += dt;
    this.pose.talk = this.talkT > 0 && this.h.conscious ? 1 : 0;

    if (this.car) this._seated(dt);
    else if (this.state === ST.ANIM) this._animated(dt);
    else if (this.state === ST.STUMBLE) this._stumbling(dt);
    else if (this.state === ST.RAGDOLL) this._ragdolling(dt);
    else this._gettingUp(dt);
  }

  _healthTick(dt) {
    const h = this.h, emo = this.mind ? this.mind.emo : null;
    const moving = this.state === ST.ANIM ? clamp01(this.speed / RUN) : 0;
    const running = this.state === ST.ANIM && this.grounded && this.speed > 3.3 ? 1 : 0;
    // what happened since the last tick (a blow that kills outright lands between ticks), then this tick's own
    const between = h.events.length ? h.events.slice() : null;
    h.tick(dt, { fear: emo ? emo.fear : 0, anger: emo ? emo.anger : 0, moving, running });
    this._tone();
    for (const ev of between ? between.concat(h.events) : h.events) {
      if (ev === 'death') this._died();
      else if (ev === 'out' || ev === 'faint') { if (this.state !== ST.RAGDOLL) this.toRagdoll(); this.mind?.note('felt', 'blackout', 'everything went dark', 1); }
      else if (ev === 'vomit') this.game.gore.vomit(this);
      else if (ev === 'wake') this.mind?.note('felt', 'wake', 'came round on the ground', 0.8);
    }
    if (this.state === ST.ANIM && !h.canStand) this.toRagdoll();
    this.pose.hurt = h.conscious ? clamp01((h.pain - 28) / 50) * (this.state === ST.ANIM ? 1 : 0) : 0;
    this._tintSkin();
    this._tintCloth();
  }

  /** Clothing that has soaked up a lot of blood goes dark with it, all over. */
  _tintCloth() {
    for (let i = 0; i < PART_COUNT; i++) {
      const hex = this.cloth[i] < 0 ? -1 : this.coat ? this.coat[i] : this.fur ?? this.cloth[i];
      if (hex < 0 || this.gone[i]) continue;
      const fb = Math.round(this.h.burns[i] / 10);
      const q = Math.round(this.soak[i] * 10) + fb * 16;
      if (q === this._soakQ[i]) continue;
      this._soakQ[i] = q;
      const sq = Math.round(this.soak[i] * 10);
      const c = rgb(hex), k = Math.max(0, sq / 10 - 0.25) * 0.55;
      // cloth that has been in a fire is scorched brown, then black
      const ch = clamp01(fb / 7);
      this.game.boxes.color(this.inst[i], lerp(lerp(c[0], 0.27, k), 0.045, ch), lerp(lerp(c[1], 0.03, k), 0.035, ch), lerp(lerp(c[2], 0.025, k), 0.03, ch));
    }
  }

  _died() {
    if (this.state !== ST.RAGDOLL) this.toRagdoll();
    this._relax();
    this.island.canSleep = true;
    this.talkT = 0; this.scream = 0;
    this.game.onDeath?.(this);
  }

  /* ---- in a car ---- */

  /** Into a seat: whoever is driving takes the wheel, anyone else sits back. */
  enterCar(car, seat, instant = false) {
    if (this.state !== ST.ANIM) this.recover();
    this.car = car; this.seat = seat;
    this.vx = 0; this.vz = 0; this.vy = 0; this.grounded = true; this.crouching = false;
    this.anim.action = null; this.cuffing = null; this.lunge = 0;
    const it = this.intent; it.mx = 0; it.mz = 0; it.face = null; it.run = false; it.jump = false;
    this.pose.sit = 1; this.pose.drive = seat === 0 ? 1 : 0; this.pose.slump = 0;
    if (instant) { this.anim.w.sit = 1; this.anim.w.drive = seat === 0 ? 1 : 0; this.blendDur = 0; this._seated(0); }
    else { this._snapshot(); this.blend = 0; this.blendDur = 0.55; }
    // a gun is no use to somebody with both hands on the wheel
    const W = this.game.weapons;
    if (W && seat === 0) { if (this.isPlayer) { if (W.current >= 0) W.select(-1); } else if (this.weapon && W.putAway) W.putAway(this); }
  }

  /** Out of the seat, standing at (x, z). `raw`: thrown out, not climbing out. */
  leaveCar(x, z, yaw, car = null, raw = false) {
    this.car = null; this.seat = -1;
    this.x = x; this.z = z; this.y = groundHeight(x, z); this.yaw = yaw;
    this.vx = 0; this.vz = 0; this.vy = 0; this.grounded = true;
    this.pose.sit = 0; this.pose.drive = 0; this.pose.slump = 0;
    this.anim.w.sit = 0; this.anim.w.drive = 0; this.anim.w.slump = 0;
    if (this.state !== ST.ANIM) this.recover();
    const fit = this.h.alive && this.h.conscious && this.h.canStand;
    if (raw || !fit) {
      // straight to where they now are; whoever cannot stand falls there
      this.blendDur = 0;
      this._solve(0); this._apply(0);
      if (!fit) this.toRagdoll();
    } else { this._snapshot(); this.blend = 0; this.blendDur = 0.42; this._fromCar = car; }
  }

  /** Sitting: carried along by the car, the pose the seat gives them. */
  _seated(dt) {
    const car = this.car, h = this.h, sp = car.seatAt[this.seat];
    car.toWorld(sp[0], sp[1], sp[2], _a);
    this.x = _a[0]; this.z = _a[2]; this.y = _a[1] - PELVIS_HEIGHT * this.scale;
    this.yaw = car.yaw;
    this.vx = car.vx; this.vz = car.vz; this.vy = 0; this.speed = 0; this.gait = 0; this.gvx = this.gvz = 0;
    this.grounded = true; this.crouching = false;
    const awake = h.alive && h.conscious;
    this.pose.sit = 1;
    this.pose.drive = awake && this.seat === 0 && car.drivable ? 1 : 0;
    this.pose.slump = awake ? 0 : 1;
    this.pose.hurt = awake ? clamp01((h.pain - 28) / 50) : 0;
    this.pose.cower = awake && this.seat > 0 && this.mind && this.mind.emo.fear > 70 ? 0.6 : 0;
    this.hold = 'none';
    this.footLift[0] = this.footLift[1] = 0;
    this._dt = dt || 1 / 60;
    this._solve(dt, this.x, this.y, this.z, this.yaw);
    if (this.blendDur > 0) {
      this.blend += dt;
      const w = smooth(this.blend / this.blendDur);
      this._apply(this._dt, w);
      if (w >= 1) this.blendDur = 0;
    } else this._apply(this._dt);
  }

  /* ---- on their feet, under the animation's control ---- */

  _animated(dt) {
    const it = this.intent, h = this.h, g = this.game;
    this._dt = dt;
    const mob = this.isPlayer ? Math.max(0.55, h.mobility) : h.mobility;
    const mag = Math.min(1, Math.hypot(it.mx, it.mz));
    this.crouching = !!it.crouch && this.grounded;
    let top;
    if (this.crouching) top = CROUCH * mag;
    else if (it.run) top = mag < 0.55 ? WALK * (mag / 0.55) : lerp(WALK, RUN, (mag - 0.55) / 0.45);
    else top = WALK * mag;
    top *= (this.scale / 0.93) * lerp(0.4, 1, mob) * (this.anim.busy ? 0.3 : 1) * (this.cuffed ? 0.72 : 1) * (this.cuffing ? 0 : 1);
    if (this.cuffing) { this.crouching = !!this.cuffing.low && this.grounded; this.pose.cuffing = 1; } else this.pose.cuffing = 0;
    if (h.legLimp(1) > 0.3 || h.legLimp(-1) > 0.3) top = Math.min(top, 2.2);
    if (this.dragMax < top) top = this.dragMax;                 // hauling something heavy
    top *= this.speedMul * this.boost;
    // nothing left in the legs: a run is a jog, then a walk
    if (it.run && h.stamina < 35) top = lerp(Math.min(top, WALK * 1.25 * (this.scale / 0.93)), top, h.stamina / 35);
    let tvx = 0, tvz = 0;
    if (mag > 0.01) { tvx = it.mx / mag * top; tvz = it.mz / mag * top; }
    // being pushed: whatever they meant to do, they go back the way they are pushed
    const pv = this.pushV, pushed = !!pv && g.time - pv.t < 0.12;
    if (pushed) {
      tvx = tvx * 0.25 + pv.x; tvz = tvz * 0.25 + pv.z;
      // shoved along long enough, or hard enough, and their feet go from under them
      const hard = Math.hypot(pv.x, pv.z);
      if (this.tripCool <= 0 && this.grounded && ((g.time - pv.since > 3 && chance(dt * 0.4)) || (hard > 2.6 && chance(dt * 1.5)))) {
        this.tripCool = 2.5;
        this.mind?.note('felt', 'pushed', 'was pushed off my feet', 0.7, { by: pv.by });
        this.toStumble(30 + hard * 6, pv.x * 0.5, pv.z * 0.5);
        return;
      }
    }
    if (this.cuffing) {
      const ct = this.cuffing.target, cdx = ct.x - this.x, cdz = ct.z - this.z, cd = Math.hypot(cdx, cdz);
      if (cd > 0.95) { tvx = cdx / cd * 1.7; tvz = cdz / cd * 1.7; }
    }
    if (this.leap) {
      // off the ground in one bound, and nothing to be done about the way until it comes down again
      const L = this.leap;
      if (L.t === 0) { this.vy = L.vy; this.grounded = false; this.vx = L.vx; this.vz = L.vz; this.jumpCool = 0.6; }
      L.t += dt;
      tvx = L.vx; tvz = L.vz;
      if ((this.grounded && L.t > 0.12) || L.t > 2.5) this.leap = null;
    }
    if (this.grabStep) {
      // up to whatever the hands are going for, or back a little from something underfoot
      const gs = this.grabStep, gx = gs.x - this.x, gz = gs.z - this.z, gd = Math.hypot(gx, gz) || 1;
      const v = gd > gs.d ? Math.min(1.5, (gd - gs.d) * 5 + 0.25) : gd < gs.d * 0.55 ? -0.7 : 0;
      tvx = gx / gd * v; tvz = gz / gd * v;
    }
    const acc = this.leap ? 30 : this.grounded ? 11 : 4;
    this.vx = damp(this.vx, tvx, acc, dt); this.vz = damp(this.vz, tvz, acc, dt);

    // an attack carries the body a little way forward
    // the step in happens before the blow, so that it lands at the right distance
    const act = this.anim.action;
    let lx = 0, lz = 0;
    if (act && this.grounded && this.lunge > 0) {
      const c = act.clip, u = act.t / c.dur, u1 = c.hit[0] + 0.06;
      if (u > 0.04 && u < u1) { const v = this.lunge / (c.dur * (u1 - 0.04)); lx = Math.sin(this.yaw) * v; lz = Math.cos(this.yaw) * v; }
    }
    this.speed = Math.hypot(this.vx, this.vz);

    // which way to face (somebody being pushed, or just pushed, keeps their eyes on whoever did it)
    const wary = !!pv && !!pv.by && g.time - pv.t < 1.5 && !pv.by.removed;
    let face = wary ? Math.atan2(pv.by.x - this.x, pv.by.z - this.z) : it.face;
    if (this.cuffing) { const ct = this.cuffing.target; face = Math.atan2(ct.x - this.x, ct.z - this.z); }
    if (this.grabFace != null) face = this.grabFace;
    if (face == null && this.speed > 0.25) face = Math.atan2(this.vx, this.vz);
    if (face != null) this.yaw = turnToward(this.yaw, face, (it.face != null ? 13 : 9) * dt);

    // up and down
    if (it.jump && this.grounded && this.jumpCool <= 0 && h.legOk(1) && h.legOk(-1) && !this.anim.busy && !this.cuffing && this.dragMax > 2.5) {
      this.vy = JUMP_V * lerp(0.6, 1, mob) * (h.stamina < 15 ? 0.75 : 1); this.grounded = false; this.jumpCool = 0.35; h.spend(7);
      g.audio?.at('step', this.x, this.y, this.z, 0.5);
    }
    it.jump = false;
    if (!this.grounded) this.vy += GRAVITY * dt;

    let nx = this.x + (this.vx + lx) * dt, nz = this.z + (this.vz + lz) * dt, ny = this.y + this.vy * dt;
    const res = this._collide(nx, nz, ny);
    if (this.state !== ST.ANIM) return;                 // something knocked us down on the way
    nx = res[0]; nz = res[1];
    const floor = this._floor(nx, nz, ny);
    if (this.grounded) {
      if (floor < ny - 0.42) { this.grounded = false; }           // walked off something
      else ny = damp(ny, floor, 22, dt);
    } else if (ny <= floor) {
      const fall = -this.vy;
      ny = floor; this.vy = 0; this.grounded = true;
      this.anim.land = clamp01(fall / 7);
      g.audio?.at('land', nx, ny, nz, clamp01(fall / 8));
      if (fall > 8.5) { this.x = nx; this.z = nz; this.y = ny; this._hardLanding(fall); if (this.state !== ST.ANIM) return; }
    }
    if (dt > 0) {
      this.gvx = damp(this.gvx, (nx - this.x) / dt, 16, dt); this.gvz = damp(this.gvz, (nz - this.z) / dt, 16, dt);
      this.gait = Math.hypot(this.gvx, this.gvz);
    }
    // the ground tilting under someone very dizzy
    const dz = h.dizziness;
    if (dz > 55 && this.speed > 0.8 && this.grounded && this.tripCool <= 0 && chance(dt * (dz - 55) / 90)) {
      this.tripCool = 4; this.x = nx; this.z = nz; this.y = ny;
      this.mind?.note('felt', 'reel', 'lost my balance, the street tilting', 0.5);
      this.toStumble(20 + dz * 0.25, this.vx * 0.3, this.vz * 0.3);
      return;
    }
    this.x = nx; this.z = nz; this.y = ny;

    // hands come up for a while after a fight starts
    this.hold = this.weaponHold();
    this._footing(dt);
    this._solve(dt);
    this._reach(dt);
    this._clearArms();
    if (this.blendDur > 0) {
      this.blend += dt;
      const w = smooth(this.blend / this.blendDur);
      this._apply(dt, w);
      if (w >= 1) this.blendDur = 0;
    } else this._apply(dt);
    this._trip();
  }

  /**
   * A foot that comes down where somebody is lying comes down on top of them,
   * not into them: each foot is lifted to the top of whatever part of a body
   * is under it (an arm, a leg, the edge of a back), and the knee takes it.
   */
  _footing(dt) {
    const fl = this.footLift, g = this.game;
    let w0 = 0, w1 = 0;
    if (this.grounded) {
      const top = this.y + 0.7;
      for (const o of g.humans) {
        if (o === this || o.removed || o.state !== ST.RAGDOLL) continue;
        const dx = o.x - this.x, dz = o.z - this.z;
        if (dx * dx + dz * dz > 3.3) continue;
        for (let side = 0; side < 2; side++) {
          const f = this.bodies[side ? P.FOOT_R : P.FOOT_L];
          if (!this.attached[f.part]) continue;
          // heel, middle and toe
          for (let k = -1; k <= 1; k++) {
            f.toWorld(0, 0, k * f.hz * 0.75, _a);
            const px = _a[0], pz = _a[2];
            for (let i = 0; i < PART_COUNT; i++) {
              if (o.gone[i]) continue;
              const b = o.bodies[i], ex = b.px - px, ez = b.pz - pz, r = b.boundR + 0.06;
              if (ex * ex + ez * ez > r * r || b.py - b.boundR > top) continue;
              const t = rayBody(b, px, top, pz, 0, -1, 0, 0.75, null, 0.03);
              if (t < 0) continue;
              const h = top - t - this.y;
              if (side) { if (h > w1) w1 = h; } else if (h > w0) w0 = h;
            }
          }
        }
      }
    }
    // a step up on to a body, not a climb: anything higher than that is walked round
    const cap = 0.3 * this.scale;
    w0 = Math.min(w0, cap); w1 = Math.min(w1, cap);
    fl[0] = damp(fl[0], w0, w0 > fl[0] ? 32 : 12, dt);
    fl[1] = damp(fl[1], w1, w1 > fl[1] ? 32 : 12, dt);
  }

  /** Works the pose out again for this instant, for when something has just changed what it should be. */
  repose() {
    if (this.state !== ST.ANIM || this.blendDur > 0) return;
    this._solve(0);
    this._reach(0);
    this._clearArms();
    this._apply(this._dt || 1 / 60);
  }

  /** What the arms are doing by default, given what is being carried. */
  weaponHold() {
    const w = this.weapon;
    if (!w) return this.guardT > 0 ? 'guard' : 'none';
    if (!this.h.armOk(-1)) return 'none';
    return w.def.hold;
  }

  _hardLanding(fall) {
    const power = (fall - 6.5) / 4;
    for (const part of [P.SHIN_L, P.SHIN_R]) this.h.hit({ part, type: 'blunt', power: power * 1.3, lp: [0, -0.2, 0], ln: [0, -1, 0], ld: [0, 1, 0] });
    this.mind?.note('felt', 'fall', 'landed hard from a fall', 0.7);
    if (fall > 11 || !this.h.canStand) this.toRagdoll(); else this.toStumble(30 + fall * 3);
  }

  /** Running over a body, or into something low, takes the legs away. */
  _trip() {
    if (this.speed < 3.3 || this.tripCool > 0 || !this.grounded) return;
    for (const o of this.game.humans) {
      if (o === this || o.state !== ST.RAGDOLL) continue;
      const dx = o.x - this.x, dz = o.z - this.z;
      if (dx * dx + dz * dz > 2.2) continue;
      for (let i = 0; i < PART_COUNT; i++) {
        if (o.gone[i]) continue;
        const b = o.bodies[i];
        if (b.py - this.y > 0.42) continue;
        const ex = b.px - this.x, ez = b.pz - this.z;
        if (ex * ex + ez * ez < 0.09 && (ex * this.vx + ez * this.vz) > 0) {
          this.tripCool = 2.5;
          if (chance(this.isPlayer ? 0.45 : 0.7)) { this.mind?.note('felt', 'trip', 'tripped over a body', 0.6); this.toStumble(46); }
          return;
        }
      }
    }
  }

  /** Keeps the capsule out of walls, crates, cars and other people. */
  _collide(nx, nz, ny) {
    const g = this.game, R = RADIUS * this.scale / 0.93;
    const lo = ny + 0.42, hi = ny + (this.crouching ? 1.05 : 1.72) * this.scale;
    g.world.queryStatics(nx - R, nz - R, nx + R, nz + R, _near);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < _near.length; i++) {
        const s = _near[i];
        if (s.maxy < lo || s.miny > hi) continue;
        const cx = clamp(nx, s.minx, s.maxx), cz = clamp(nz, s.minz, s.maxz);
        let dx = nx - cx, dz = nz - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= R * R) continue;
        if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = cx + dx / d * R; nz = cz + dz / d * R; }
        else {
          // inside: leave by the nearest wall
          const l = nx - s.minx, r = s.maxx - nx, n = nz - s.minz, f = s.maxz - nz, m = Math.min(l, r, n, f);
          if (m === l) nx = s.minx - R; else if (m === r) nx = s.maxx + R; else if (m === n) nz = s.minz - R; else nz = s.maxz + R;
        }
      }
    }
    // crates and the like: shove them, and be stopped by them
    for (const o of g.props) {
      const b = o.body;
      if (b === this.holdBody) continue;           // what they are dragging along behind them
      if (b.py + b.boundR < lo || b.py - b.boundR > hi) continue;
      // anything whose top is below the knee is stepped on to, not walked into
      const up = Math.abs(1 - 2 * (b.qx * b.qx + b.qz * b.qz));
      if (up > 0.9 && b.py + b.hy < lo) continue;
      const dx = nx - b.px, dz = nz - b.pz;
      const reach = R + b.boundR;
      if (dx * dx + dz * dz > reach * reach) continue;
      b.toLocal(nx, (lo + hi) * 0.5, nz, _a);
      const cx = clamp(_a[0], -b.hx, b.hx), cy = clamp(_a[1], -b.hy, b.hy), cz = clamp(_a[2], -b.hz, b.hz);
      b.toWorld(cx, cy, cz, _b);
      let ex = nx - _b[0], ez = nz - _b[2];
      const d2 = ex * ex + ez * ez;
      if (d2 >= R * R) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-4) { ex = dx; ez = dz; d = Math.hypot(ex, ez) || 1; }
      ex /= d; ez /= d;
      const pen = R - d;
      nx += ex * pen; nz += ez * pen;
      if (!b.kinematic) {
        const into = -(this.vx * ex + this.vz * ez);
        // a steady shove, not a kick: a crate leant on at a walk creeps, run at it and it slides
        const push = into * b.mass * 6 * this._dt;
        if (into > 0.1) b.applyImpulse(-ex * push, 0, -ez * push, _b[0], b.py, _b[2]);
      }
    }
    // cars
    for (const car of g.traffic ? g.traffic.cars : []) {
      const b = car.body;
      const dx = nx - b.px, dz = nz - b.pz;
      if (dx * dx + dz * dz > 9) continue;
      if (ny > b.py + b.hy) continue;
      b.toLocal(nx, b.py, nz, _a);
      const cx = clamp(_a[0], -b.hx, b.hx), cz = clamp(_a[2], -b.hz, b.hz);
      b.toWorld(cx, 0, cz, _b);
      let ex = nx - _b[0], ez = nz - _b[2];
      const d2 = ex * ex + ez * ez;
      if (d2 >= R * R) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-4) { ex = dx; ez = dz; d = Math.hypot(ex, ez) || 1; }
      ex /= d; ez /= d;
      nx += ex * (R - d); nz += ez * (R - d);
      // how fast is the car coming at us along that line?
      const closing = (b.vx - this.vx) * ex + (b.vz - this.vz) * ez;
      if (closing > 2.2 && b.vx * ex + b.vz * ez > 1.8) { this.x = nx; this.z = nz; this.struckByCar(car, closing); return [nx, nz]; }
    }
    // somebody lying in the way, or in the middle of getting up: their trunk and their head are gone round, not walked through
    for (const o of g.humans) {
      if (o === this || o.removed || (o.state !== ST.RAGDOLL && o.state !== ST.GETUP)) continue;
      const ox = nx - o.x, oz = nz - o.z;
      if (ox * ox + oz * oz > 2.6) continue;
      for (let t = 0; t < TRUNK.length; t++) {
        const i = TRUNK[t];
        if (o.gone[i]) continue;
        const b = o.bodies[i];
        if (b.py - b.boundR > hi || b.py + b.boundR < ny + 0.04) continue;
        b.toLocal(nx, clamp(b.py, ny + 0.06, hi), nz, _a);
        const cx = clamp(_a[0], -b.hx, b.hx), cy = clamp(_a[1], -b.hy, b.hy), cz = clamp(_a[2], -b.hz, b.hz);
        b.toWorld(cx, cy, cz, _b);
        if (_b[1] < ny + 0.04 || _b[1] > hi) continue;
        let ex = nx - _b[0], ez = nz - _b[2];
        const d2 = ex * ex + ez * ez;
        if (d2 >= 0.81) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-4) { ex = ox; ez = oz; d = Math.hypot(ex, ez) || 1; }
        ex /= d; ez /= d;
        // clear of it by a body's width, and by however far a foot is reaching toward it: arms and legs
        // can be stepped on, but nobody puts a foot down on a back or a head
        const reach = Math.max(R * 0.92, this._toe(-ex, -ez) + 0.03);
        if (d >= reach) continue;
        nx += ex * (reach - d); nz += ez * (reach - d);
        // walked into hard enough, a body is shoved along a little
        if (!b.kinematic && b.im > 0) { const into = -(this.vx * ex + this.vz * ez); if (into > 0.3) { const k = into * b.mass * 2.2 * this._dt; b.applyImpulse(-ex * k, 0, -ez * k, _b[0], b.py, _b[2]); } }
      }
    }
    // other people on their feet: nobody stands inside anybody else
    // (someone staggering is in the way too: walk on into them and they are squeezed against whoever is behind)
    for (const o of g.humans) {
      if (o === this || o.removed || o.state === ST.RAGDOLL || o.car) continue;
      let dx = nx - o.x, dz = nz - o.z;
      // shoulder to shoulder with a hand's width to spare; a blow in progress, or a pair of handcuffs, comes in closer than that
      const close = this.anim.action || o.anim.action || this.cuffing || o.cuffing ? 0.82 : 1;
      let rr = (this.scale + o.scale) * (SPACE / 0.93) * close;
      const d2 = dx * dx + dz * dz;
      if (d2 >= 1.8 * 1.8 || Math.abs(ny - o.y) > 1.5) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-3) { dx = this.id < o.id ? 1 : -1; dz = 0.3; d = Math.hypot(dx, dz); }
      // and feet: a foot put out toward somebody needs that much more room, theirs too
      // (but not a kick, or the step into a blow: those are meant to arrive)
      if (o.state !== ST.STUMBLE && close === 1) rr = Math.max(rr, this._toe(-dx / d, -dz / d) + o._toe(dx / d, dz / d));
      if (d >= rr) continue;
      // each gives way by a share: someone getting up gives none, and the player gives least
      const share = o.state !== ST.ANIM ? 1 : this.isPlayer ? 0.3 : o.isPlayer ? 0.7 : 0.5;
      let push = (rr - d) * share;
      // two people who find themselves on the same spot ease apart; they do not jump
      if (rr - d > 0.22) push = Math.min(push, 3.5 * this._dt);
      nx += dx / d * push; nz += dz / d * push;
      // how fast this one is coming at them (measured before anything is done about it)
      const into = -(this.vx * dx + this.vz * dz) / d;
      // you barging into someone at a run knocks them about, harder the faster
      // (people on their own business swerve round each other instead)
      if (this.isPlayer && o.state === ST.ANIM && this.speed > 3.2 && into > 2.6 && o.tripCool <= 0) {
        o.tripCool = 1.5;
        o.shove(-dx / d * into * 0.6, -dz / d * into * 0.6, 28 + into * 4.5, this);
      } else if (into > 0) {
        if (this.isPlayer && o.state === ST.ANIM && into > 0.2 && !o.cuffing && !this.cuffing && !this.cuffed && !this.anim.action) {
          // you, leaning on them: they are pushed back as fast as you walk into them, and you go with them
          // (the room each keeps from the other is what holds you to their pace)
          o.pushedBy(this, -dx / d * into * 0.95, -dz / d * into * 0.95);
        } else {
          // anybody else walking into somebody stops walking into them, and slides along instead of pressing on
          this.vx += dx / d * into; this.vz += dz / d * into;
        }
      }
    }
    const lim = LIMIT - R;
    nx = clamp(nx, -lim, lim); nz = clamp(nz, -lim, lim);
    _a[0] = nx; _a[1] = nz;
    return _a;
  }

  /** How far out from where they stand, in the direction (ux, uz), this person's feet reach as they are now. */
  _toe(ux, uz) {
    let far = 0;
    for (let k = 0; k < 2; k++) {
      const i = k ? P.FOOT_R : P.FOOT_L;
      if (!this.attached[i]) continue;
      const f = this.bodies[i];
      // the foot's length and width, as they lie along that direction
      f.dirToWorld(0, 0, 1, _b);
      const ext = Math.abs(_b[0] * ux + _b[2] * uz) * f.hz + Math.sqrt(Math.max(0, 1 - (_b[0] * ux + _b[2] * uz) ** 2)) * f.hx;
      const v = (f.px - this.x) * ux + (f.pz - this.z) * uz + ext;
      if (v > far) far = v;
    }
    return far + 0.012;
  }

  /** The highest thing under the feet that can be stood on. */
  _floor(x, z, y) {
    let top = groundHeight(x, z);
    const g = this.game, step = y + 0.45, R = 0.16;
    g.world.queryStatics(x - R, z - R, x + R, z + R, _near);
    for (let i = 0; i < _near.length; i++) {
      const s = _near[i];
      if (s.maxy > top && s.maxy <= step && x > s.minx - R && x < s.maxx + R && z > s.minz - R && z < s.maxz + R) top = s.maxy;
    }
    for (const o of g.props) {
      const b = o.body;
      const dx = x - b.px, dz = z - b.pz;
      if (dx * dx + dz * dz > b.boundR * b.boundR) continue;
      b.toLocal(x, b.py, z, _b);
      if (Math.abs(_b[0]) > b.hx + R || Math.abs(_b[2]) > b.hz + R) continue;
      // only a box that is sitting more or less flat is a floor
      const t = b.py + Math.max(b.hy * Math.abs(1 - 2 * (b.qx * b.qx + b.qz * b.qz)), 0.05);
      if (t > top && t <= step) top = t;
    }
    return top;
  }

  /* ---- staggering ---- */

  toStumble(force = 40, vx = 0, vz = 0) {
    if (this.state === ST.RAGDOLL || this.removed || this.puppet) return;
    if (this.car) { this.anim.kick(0, -1, Math.min(1.2, force / 50)); return; }
    if (!this.h.canStand) { this.toRagdoll(); return; }
    const was = this.state;
    this.state = ST.STUMBLE;
    this.balance = Math.min(this.balance, clamp(1 - force / 78, 0.12, 0.9));
    if (was !== ST.STUMBLE) { this.stumbleT = 0; this.balance = clamp(1 - force / 78, 0.12, 0.9); }
    this._release();
    this.island.canSleep = false;
    for (const b of this.bodies) if (this.attached[b.part]) { b.vx += vx; b.vz += vz; }
    this.blendDur = 0;
  }

  _release() {
    // still on the way out of a car: finish getting out first, or the physics finds them inside its body
    if (this._fromCar && this.blendDur > 0) { this.blendDur = 0; this._solve(0); this._apply(0); }
    this._fromCar = null;
    for (let i = 0; i < PART_COUNT; i++) if (this.attached[i]) this.bodies[i].setKinematic(false);
    this.island.mover = false;
    this.island.wake();
    this.reachT[0] = this.reachT[1] = null; this.reachW[0] = this.reachW[1] = 0; this.reachD[0].fill(0); this.reachD[1].fill(0);
    this.grasp[0] = this.grasp[1] = -1; this.stoop = 0; this.grabFace = null; this.grabStep = null; this.dragMax = Infinity;
    this.leap = null; this.point[0] = this.point[1] = 0;
  }

  _stumbling(dt) {
    const pel = this.bodies[P.PELVIS], chest = this.bodies[P.CHEST], h = this.h;
    this.stumbleT += dt;
    this.x = pel.px; this.z = pel.pz; this.y = groundHeight(this.x, this.z);
    const vx = (pel.vx + chest.vx) * 0.5, vz = (pel.vz + chest.vz) * 0.5;
    this.vx = vx; this.vz = vz; this.speed = Math.hypot(vx, vz);
    // which way is the chest facing, and how far over is it?
    chest.dirToWorld(0, 0, 1, _a);
    if (_a[0] * _a[0] + _a[2] * _a[2] > 0.1) this.yaw = dampAngle(this.yaw, Math.atan2(_a[0], _a[2]), 5, dt);
    chest.dirToWorld(0, 1, 0, _b);
    const tilt = Math.acos(clamp(_b[1], -1, 1));
    const height = (pel.py - this.y) / (PELVIS_HEIGHT * this.scale);

    const drain = clamp((this.speed - 1.3) * 0.3, 0, 1.5) + clamp((tilt - 0.3) * 2.4, 0, 2.5) + (1 - h.mobility) * 0.7;
    this.balance = clamp(this.balance + dt * (0.6 - drain), -0.2, 1);
    if (!h.canStand || this.balance <= 0 || tilt > 1.05 || height < 0.52 || this.stumbleT > 7) { this.toRagdoll(); return; }
    if (this.stumbleT > 0.4 && this.speed < 1.0 && tilt < 0.32 && this.balance > 0.5 && height > 0.8) { this.recover(); return; }

    // the pose to fight for: a quick, braking gait in the direction of travel, leaning into it
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const fz = vx * s + vz * c, fx = vx * c - vz * s;
    this._leanZ = clamp(fz * 0.085, -0.4, 0.45) + (1 - this.balance) * 0.18 * Math.sign(fz || 1);
    this._leanX = clamp(-fx * 0.085, -0.4, 0.4);
    this.pose.stagger = 1;
    const keep = this.speed;
    this.speed = Math.max(0, keep - 0.5) * 0.82;         // feet a little slower than the body: that is the braking
    this.grounded = true; this.crouching = false; this.hold = this.weaponHold();
    this._solve(dt);
    this.speed = keep;
    this._muscles(clamp(0.3 + 0.7 * this.balance, 0.25, 1) * (0.5 + 0.5 * h.mobility), false);
  }

  /** Per substep: the legs hold the hips up for as long as balance lasts. */
  _substep(h) {
    if (this.state !== ST.STUMBLE) return;
    const pel = this.bodies[P.PELVIS];
    if (pel.im === 0) return;
    const fl = this.bodies[P.FOOT_L], fr = this.bodies[P.FOOT_R];
    const g = groundHeight(pel.px, pel.pz);
    const lDown = this.attached[P.FOOT_L] && fl.py - g < 0.3, rDown = this.attached[P.FOOT_R] && fr.py - g < 0.3;
    if (!lDown && !rDown) return;
    const want = g + (PELVIS_HEIGHT + this.anim.ch[CH.rootY]) * this.scale;
    const d = want - pel.py;
    if (d <= 0) return;
    const k = 0.05 * clamp01(this.balance + 0.15);
    pel.py += Math.min(d * k, 0.004);
  }

  recover() {
    this._snapshot();
    this.state = ST.ANIM;
    for (let i = 0; i < PART_COUNT; i++) if (this.attached[i]) { this.bodies[i].setKinematic(true); this.bodies[i].orient = null; }
    this.island.mover = true; this.island.canSleep = false;
    this.pose.stagger = 0;
    this.blend = 0; this.blendDur = 0.28;
    this.grounded = true; this.vy = 0;
    this.gvx = this.vx; this.gvz = this.vz; this.gait = Math.hypot(this.vx, this.vz);
    this.y = groundHeight(this.x, this.z);
    this.balance = 1;
  }

  /* ---- down ---- */

  toRagdoll() {
    if (this.state === ST.RAGDOLL || this.removed || this.puppet) return;
    // somebody in a seat slumps in it: they are not going anywhere until somebody gets them out
    if (this.car) { this.anim.action = null; return; }
    this.state = ST.RAGDOLL;
    this.ragT = 0; this.stillT = 0;
    this._release();
    this._relax();
    this.pose.stagger = 0; this.pose.cower = 0; this.pose.handsUp = 0;
    this.island.canSleep = !(this.h.alive && this.h.conscious);
    this.blendDur = 0;
    this.anim.action = null;
    this.game.onFall?.(this);
  }

  _ragdolling(dt) {
    const pel = this.bodies[P.PELVIS], chest = this.bodies[P.CHEST], h = this.h;
    this.ragT += dt;
    this.x = pel.px; this.z = pel.pz; this.y = groundHeight(this.x, this.z);
    this.vx = pel.vx; this.vz = pel.vz;
    this.speed = Math.hypot(pel.vx, pel.vy, pel.vz);
    this.grounded = true;
    // being flung about is disorienting
    const spin = Math.hypot(chest.wx, chest.wy, chest.wz);
    if (spin > 4) h.dizzy = Math.min(45, h.dizzy + (spin - 4) * dt * 6);
    // somebody is putting handcuffs on them where they lie: they go where they are put
    if (this.handled) {
      if (this.game.time - this.handled.t < 0.15 && h.alive) { this._beHandled(dt); return; }
      this.handled = null;
    }
    if (!h.alive || !h.conscious) { this._relax(); this.island.canSleep = true; this.pose.writhe = 0; this.pose.crawl = 0; this.pose.brace = 0; this.tased = 0; return; }

    if (this.tased > 0) {
      this.tased -= dt;
      this.pose.writhe = 0; this.pose.crawl = 0; this.pose.brace = 0;
      this.island.canSleep = false; this.island.wake();
      // every muscle pulling at once: the body is a plank, and it shakes
      const st = this._stiff;
      for (let i = 1; i < PART_COUNT; i++) {
        if (!this.attached[i] || !st) continue;
        const b = this.bodies[i], o = this.orients[i], r = st[i];
        o.x = pel.qw * r[0] + pel.qx * r[3] + pel.qy * r[2] - pel.qz * r[1];
        o.y = pel.qw * r[1] - pel.qx * r[2] + pel.qy * r[3] + pel.qz * r[0];
        o.z = pel.qw * r[2] + pel.qx * r[1] - pel.qy * r[0] + pel.qz * r[3];
        o.w = pel.qw * r[3] - pel.qx * r[0] - pel.qy * r[1] - pel.qz * r[2];
        o.s = 0.55;
        b.orient = o;
        const tw = i >= P.UARM_L ? 9 : 4;
        b.wx += rand(-tw, tw) * dt * 22; b.wz += rand(-tw, tw) * dt * 22;
      }
      this.stillT = 0;
      h.pain = Math.max(h.pain, 56);
      if (this.tased <= 0) { this.tased = 0; this._relax(); if (this.mind) this.mind.ask('afterTase', 58, null, rand(0.8, 1.8)); }
      return;
    }
    if (this.dazeT > 0) { this.dazeT -= dt; this._relax(); this.stillT = 0; return; }

    const low = pel.py - this.y < 0.45 * this.scale;
    const still = this.speed < 0.55;
    this.stillT = still && low ? this.stillT + dt : 0;
    if (this.stillT > 0.7 && this.ragT > 1.4 && h.canStand && !this.stayDown) {
      // not everyone springs back up
      // not into somebody else who is getting up right here: one at a time
      if ((this.isPlayer || h.pain < 70 || this.stillT > 4) && (this.stillT > 5 || !this._crowdedUp())) { this.startGetUp(); return; }
    }
    // what a conscious body does while it is down
    const falling = !low || this.speed > 2.5;
    this.pose.brace = falling ? 1 : 0;
    const crawl = !falling && !!this.crawlDir && !h.paralysedArms && (h.armOk(1) || h.armOk(-1)) && !this.cuffed;
    this.pose.crawl = crawl ? 1 : 0;
    this.pose.writhe = !falling && !crawl && h.pain > 30 ? 1 : 0;
    const active = falling || crawl || this.pose.writhe > 0;
    this.island.canSleep = !active;
    if (active) this.island.wake();
    this.speed = 0;
    this._solve(dt, 0, 0, 0, 0);
    this.speed = Math.hypot(pel.vx, pel.vy, pel.vz);
    this._muscles(falling ? 0.22 : crawl ? 0.3 : this.pose.writhe ? 0.13 + h.pain * 0.0012 : 0.05, true);
    if (this.cuffed) for (const i of ARM_L.concat(ARM_R)) { const b = this.bodies[i]; if (this.attached[i] && this.tone[i] > 0.1) { b.orient = this.orients[i]; b.orient.s = Math.max(b.orient.s || 0, 0.3); } }
    if (crawl && this.anim.crawlPull > 0.25 && chest.grounded > 0) {
      // roll onto the front, then haul
      chest.dirToWorld(0, 0, 1, _a);
      if (_a[1] > -0.3) { chest.orient = this.orients[P.CHEST]; const o = chest.orient; const yq = Math.atan2(this.crawlDir[0], this.crawlDir[1]); faceDown(yq, o); o.s = 0.25; }
      const pull = this.anim.crawlPull * 30 * dt * (h.armOk(1) && h.armOk(-1) ? 1 : 0.55);
      chest.applyImpulse(this.crawlDir[0] * pull * chest.mass, 0, this.crawlDir[1] * pull * chest.mass);
      pel.applyImpulse(this.crawlDir[0] * pull * pel.mass * 0.5, 0, this.crawlDir[1] * pull * pel.mass * 0.5);
    }
  }

  /**
   * Called every frame by whoever is handcuffing this person on the ground,
   * with how far through it they are (0..1).
   */
  handle(by, u) {
    const hd = this.handled || (this.handled = { by: null, u: 0, t: -9, yaw: 0, side: 1, turn: 1, k: 0, raised: false, raiseT: 0 });
    const now = this.game.time;
    if (hd.by !== by || now - hd.t > 0.3) {
      // turned over about the line they lie along: the head stays where it is
      hd.by = by; hd.k = 0; hd.raised = false; hd.raiseT = 0;
      this.bodies[P.CHEST].dirToWorld(0, 1, 0, _a);
      hd.yaw = _a[0] * _a[0] + _a[2] * _a[2] > 0.02 ? Math.atan2(_a[0], _a[2]) : this.yaw;
      // which side of them is the one doing it on? They are rolled away from that side,
      // and their face is turned away from it too
      const lat = Math.cos(hd.yaw) * (by.x - this.x) - Math.sin(hd.yaw) * (by.z - this.z);
      hd.side = lat > 0 ? -1 : 1;
      hd.turn = lat > 0 ? -1 : 1;
    }
    hd.u = u; hd.t = now;
  }

  /** How far apart the two places the cuffs go are, in metres. */
  wristGap() {
    const a = this.bodies[P.FARM_L], b = this.bodies[P.FARM_R], s = this.scale;
    a.toWorld(-(a.hx + 0.012 * s), -0.115 * s, 0, _a);
    b.toWorld(b.hx + 0.012 * s, -0.115 * s, 0, _b);
    return Math.hypot(_a[0] - _b[0], _a[1] - _b[1], _a[2] - _b[2]);
  }

  /**
   * Prone handcuffing, as it is taught: rolled on to the front, away from
   * whoever is doing it, with the arms up past the head so that neither is
   * trapped underneath; the arms then brought round along the ground to the
   * sides, and up behind the back; and only then the cuffs, which draw the
   * wrists the last little way together. Cuffs closed across a body as it
   * happens to lie would pull the wrists straight through it.
   */
  _beHandled(dt) {
    const hd = this.handled, pel = this.bodies[P.PELVIS], chest = this.bodies[P.CHEST];
    this.island.canSleep = false; this.island.wake();
    this.stillT = 0;
    this.pose.writhe = 0; this.pose.crawl = 0; this.pose.brace = 0;
    if (this.tased > 0) { this.tased = Math.max(0, this.tased - dt); if (this.tased === 0) this.mind?.ask('afterTase', 58, null, rand(0.8, 1.8)); }
    // how far over are they? 0 is face down, a half turn either way face up
    const lx = Math.cos(hd.yaw), lz = -Math.sin(hd.yaw);
    chest.dirToWorld(0, 0, 1, _a);
    const roll = Math.atan2(_a[0] * lx + _a[2] * lz, -_a[1]);
    // Not over before both arms are up past the head, or one of them is rolled on to and trapped
    // underneath. (Already face down, it is too late for that: they are worked out from where they are.)
    if (!hd.raised) {
      hd.raiseT += dt;
      let up = 0;
      for (let k = 0; k < 2; k++) { const b = this.bodies[k ? P.HAND_R : P.HAND_L]; chest.toLocal(b.px, b.py, b.pz, _b); if (_b[1] > 0.33 * this.scale) up++; }
      if (Math.abs(roll) < 0.6 || up === 2 || hd.raiseT > 1.6) hd.raised = true;
    }
    // from on their back, over on to the side facing away first; from there, on to the front
    const want = Math.abs(roll) > 1.75 ? hd.side * Math.PI / 2 : 0;
    if (hd.raised && Math.abs(roll) < 0.55) hd.k = Math.min(1, hd.k + dt / 1.35);
    const k = hd.k, ch = _hch;
    ch.fill(0);
    let out, back, inn, el;
    if (k < 0.58) { const v = smooth(k / 0.58); out = lerp(2.75, 0.12, v); back = 0; inn = 0; el = 0.25; }
    else { const v = smooth((k - 0.58) / 0.42); out = lerp(0.12, -0.3, v); back = lerp(0, -0.71, v); inn = lerp(0, -0.12, v); el = lerp(0.25, 0.36, v); }
    ch[CH.shLOut] = out; ch[CH.shROut] = out; ch[CH.shL] = back; ch[CH.shR] = back; ch[CH.shLIn] = inn; ch[CH.shRIn] = inn; ch[CH.elL] = el; ch[CH.elR] = el;
    ch[CH.headTwist] = 1.15 * hd.turn; ch[CH.neckTwist] = 0.35 * hd.turn;
    channelsToLocal(ch, _hloc);
    solvePose(0, 0, 0, 0, this.scale, ch, _hloc, _hpos, _hquat);
    // the trunk is turned over; the limbs are placed relative to the hips as they actually lie
    lying(hd.yaw, want, _hfd);
    _hpel.x = pel.qx; _hpel.y = pel.qy; _hpel.z = pel.qz; _hpel.w = pel.qw;
    for (let i = 0; i < PART_COUNT; i++) {
      if (!this.attached[i]) continue;
      const b = this.bodies[i], o = this.orients[i], q = i * 4;
      const trunk = i <= P.HEAD, base = trunk ? _hfd : _hpel;
      if (trunk && !hd.raised) { b.orient = null; continue; }
      const rx = _hquat[q], ry = _hquat[q + 1], rz = _hquat[q + 2], rw = _hquat[q + 3];
      o.x = base.w * rx + base.x * rw + base.y * rz - base.z * ry;
      o.y = base.w * ry - base.x * rz + base.y * rw + base.z * rx;
      o.z = base.w * rz + base.x * ry - base.y * rx + base.z * rw;
      o.w = base.w * rw - base.x * rx - base.y * ry - base.z * rz;
      o.s = i <= P.CHEST ? 0.3 : trunk ? 0.35 : i <= P.HAND_R ? 0.45 : 0.14;
      b.orient = o;
    }
  }

  /**
   * Is somebody else getting up, or standing, where this person would get up?
   * (Someone getting up sweeps through everything between where they lay and
   * where they will stand, and so does anyone getting up beside them.)
   */
  _crowdedUp() {
    const pel = this.bodies[P.PELVIS];
    for (const o of this.game.humans) {
      if (o === this || o.removed) continue;
      if (o.state === ST.GETUP) {
        const b = o.bodies[P.PELVIS], dx = b.px - pel.px, dz = b.pz - pel.pz, ex = o.x - pel.px, ez = o.z - pel.pz;
        if (dx * dx + dz * dz < 1.69 || ex * ex + ez * ez < 1.69) return true;
      } else if (o.state === ST.ANIM) {
        // nobody gets up into somebody standing over them, or next to any part of them
        const dx = o.x - pel.px, dz = o.z - pel.pz;
        if (dx * dx + dz * dz < 0.81) return true;
        for (let i = 1; i < PART_COUNT; i++) {
          if (!this.attached[i]) continue;
          const b = this.bodies[i], ex = o.x - b.px, ez = o.z - b.pz;
          if (ex * ex + ez * ez < 0.36) return true;
        }
      }
    }
    return false;
  }

  startGetUp() {
    const chest = this.bodies[P.CHEST], pel = this.bodies[P.PELVIS];
    chest.dirToWorld(0, 0, 1, _a);        // which way the chest faces
    chest.dirToWorld(0, 1, 0, _b);        // which way the head lies
    let dx, dz;
    if (Math.abs(_a[1]) > 0.55) { const k = _a[1] < 0 ? 1 : -1; dx = _b[0] * k; dz = _b[2] * k; } else { dx = _a[0]; dz = _a[2]; }
    if (dx * dx + dz * dz > 0.01) this.yaw = Math.atan2(dx, dz);
    this.x = pel.px; this.z = pel.pz; this.y = this._floor(this.x, this.z, pel.py);
    this._snapshot();
    this.state = ST.GETUP; this.getT = 0;
    for (let i = 0; i < PART_COUNT; i++) if (this.attached[i]) { this.bodies[i].setKinematic(true); this.bodies[i].orient = null; }
    this.island.mover = true; this.island.canSleep = false;
    this.vx = this.vz = this.vy = 0; this.speed = 0; this.gvx = this.gvz = 0; this.gait = 0;
    this.pose.writhe = 0; this.pose.crawl = 0; this.pose.brace = 0;
    this.crawlDir = null;
  }

  _gettingUp(dt) {
    this.getT += dt;
    const u = this.getT / GETUP_TIME;
    if (!this.h.canStand) { this.toRagdoll(); return; }
    this.grounded = true; this.speed = 0;
    this.crouching = false;
    this.pose.kneel = u < 0.45 ? 1 : 1 - smooth((u - 0.45) / 0.5);
    this.hold = 'none';
    // not through a wall, not through whoever else is here: the same rules as for anyone on their feet
    this._dt = dt; this.vx = 0; this.vz = 0;
    const at = this._collide(this.x, this.z, this.y);
    if (this.state !== ST.GETUP) return;
    this.x = at[0]; this.z = at[1];
    this._solve(dt);
    this._clearArms();
    this._apply(dt, smooth(u / 0.5));
    if (u >= 1) { this.state = ST.ANIM; this.pose.kneel = 0; this.blendDur = 0; this.balance = 1; }
  }

  /* ----------------------------- after physics ---------------------------- */

  late(dt) {
    if (this.removed) return;
    const g = this.game;
    // knocks taken from the world: the ground, a crate, a bumper (another player's are theirs to take)
    for (let i = 0; i < PART_COUNT && !this.puppet; i++) {
      if (this.gone[i]) continue;
      const b = this.bodies[i];
      if (b.hit < 3.2 || this.partCool[i] > 0) continue;
      const other = b.hitOther;
      if (other && other.owner === this) continue;
      const car = other && other.kind === 'car';
      // someone on their feet is only hurt by a thing that was already flying at them, not by a crate they walked into
      if (b.kinematic && !(other && other.im > 0 && other.mass > 4 && other.preSpeed > 4)) continue;
      const speed = b.hit;
      const heavy = car ? 1.9 : other && other.mass > 15 ? 1.25 : 1;
      const power = clamp((speed - 3.6) / 5.2, 0, 3.4) * heavy * (i === P.HEAD ? (this.helmet ? this.helmet.def.fall : 1.25) : 1);
      this.partCool[i] = 0.35;
      if (power < 0.25 || !this.attached[i]) { if (speed > 4) g.audio?.at('thud', b.px, b.py, b.pz, clamp01(speed / 10)); continue; }
      b.toLocal(b.hitX, b.hitY, b.hitZ, _a);
      b.dirToLocal(b.hitNx, b.hitNy, b.hitNz, _b);
      const rep = this.h.hit({ part: i, type: car && power > 1.6 ? 'crush' : 'blunt', power, lp: [_a[0], _a[1], _a[2]], ln: faceOf(_b), ld: [-_b[0], -_b[1], -_b[2]] });
      g.audio?.at(rep.bones.length ? 'crack' : 'thud', b.px, b.py, b.pz, clamp01(speed / 9));
      if (rep.wound) g.gore.wound(this, rep.wound);
      if (power > 0.9 && i === P.HEAD) g.gore.burst(b.hitX, b.hitY, b.hitZ, b.hitNx, 0.6, b.hitNz, 10 + power * 8, 2.2);
      if (b.kinematic && this.state === ST.ANIM) {
        // something thrown hit someone who was standing
        const m = other ? other.mass : 10;
        this.react(clamp(m * speed * 0.55, 0, 140), -b.hitNx, -b.hitNz, rep);
      }
      if (this.mind && power > 0.4) this.mind.feel(i, 'blunt', rep, other && other.kind === 'car' ? 'a car' : other ? 'something heavy' : 'the ground');
      if (rep.burst) this.burst(i, [b.vx, b.vy, b.vz]);
    }
    // bare hands on somebody else leave prints on them
    if (this.isPlayer && g.police) for (let k = 0; k < 2; k++) {
      const hand = k ? P.HAND_R : P.HAND_L;
      if (this.gone[hand]) continue;
      const o = this.bodies[hand].touchOther, who = o && o.owner;
      if (who && who !== this && who.h && who.prints !== undefined) g.police.touched(who, this);
    }
    this._faceT += dt;
    if (this._faceT > 0.12) { this._expression(this._faceT); this._faceT = 0; }
    this._hands(dt);
    this._draw();
    // pieces that have lain about long enough are cleared away by the game
    for (const p of this.pieces) p.age += dt;
  }

  _draw() {
    const g = this.game, bx = g.boxes;
    if (this.hidden) { this._hideAll(); return; }
    const bk = this.bulk;
    for (let i = 0; i < PART_COUNT; i++) {
      if (this.gone[i]) continue;
      if (i === P.HAND_L || i === P.HAND_R) continue;
      const b = this.bodies[i], s = this.sizes[i];
      bx.set(this.inst[i], b.px, b.py, b.pz, b.qx, b.qy, b.qz, b.qw, s[0] * bk, s[1] * (1 + (bk - 1) * 0.3), s[2] * bk);
    }
    this._drawHand(P.HAND_L, 0, -1);
    this._drawHand(P.HAND_R, 1, 1);
    // a phone in the right hand, to look at or held to the ear
    const ph = Math.max(this.pose.phone, this.pose.call);
    if (ph > 0.5 && !this.gone[P.HAND_R] && this.attached[P.HAND_R] && !this.weapon) {
      if (this.phoneIdx < 0) { this.phoneIdx = bx.alloc(); bx.colorHex(this.phoneIdx, 0x15171b); }
      const b = this.bodies[P.HAND_R], s = this.scale;
      bx.setOn(this.phoneIdx, b.px, b.py, b.pz, b.qx, b.qy, b.qz, b.qw, 0.03 * s, -0.035 * s, 0.012 * s, 0.012 * s, 0.13 * s, 0.065 * s);
    } else if (this.phoneIdx >= 0) bx.hide(this.phoneIdx);
    if (this.caps) for (const c of this.caps) {
      if (this.gone[c.part]) { bx.hide(c.idx); continue; }
      const b = this.bodies[c.part];
      bx.setOn(c.idx, b.px, b.py, b.pz, b.qx, b.qy, b.qz, b.qw, c.l[0], c.l[1], c.l[2], c.z[0], c.z[1], c.z[2]);
    }
    if (this.vest) for (const v of this.vest.boxes) {
      if (this.gone[v.part]) { bx.hide(v.idx); continue; }
      const b = this.bodies[v.part];
      bx.setOn(v.idx, b.px, b.py, b.pz, b.qx, b.qy, b.qz, b.qw, v.l[0], v.l[1], v.l[2], v.z[0], v.z[1], v.z[2]);
    }
    const hide = this.gone[P.HEAD] || (this.isPlayer && g.firstPerson && this.attached[P.HEAD]);
    const hd = this.bodies[P.HEAD];
    // an animal's head (drawn by whatever gave them it): no hair, no face
    if (this.beast) { for (const h of this.hair) bx.hide(h.idx); if (this.faceQuad >= 0) g.faceQuads.hide(this.faceQuad); if (this.helmet) for (const v of this.helmet.boxes) (v.glass ? g.glass : bx).hide(v.idx); return; }
    const lid = this.helmet ? 0.085 * this.scale : 9;
    if (this.helmet) for (const v of this.helmet.boxes) {
      const set = v.glass ? g.glass : bx;
      if (hide) { set.hide(v.idx); continue; }
      set.setOn(v.idx, hd.px, hd.py, hd.pz, hd.qx, hd.qy, hd.qz, hd.qw, v.l[0], v.l[1], v.l[2], v.z[0], v.z[1], v.z[2]);
    }
    for (const h of this.hair) {
      if (hide || h.l[1] > lid) bx.hide(h.idx);
      else bx.setOn(h.idx, hd.px, hd.py, hd.pz, hd.qx, hd.qy, hd.qz, hd.qw, h.l[0], h.l[1], h.l[2], h.s[0], h.s[1], h.s[2]);
    }
    if (this.isPlayer && g.firstPerson && this.attached[P.HEAD]) { bx.hide(this.inst[P.HEAD]); bx.hide(this.inst[P.NECK]); }
    if (this.faceQuad >= 0) {
      if (hide) g.faceQuads.hide(this.faceQuad);
      else {
        const hx = this.sizes[P.HEAD][0] * 0.5, hy = this.sizes[P.HEAD][1] * 0.5, hz = this.sizes[P.HEAD][2] * 0.5 + 0.003;
        hd.toWorld(-hx, -hy, hz, _a); const ax = _a[0], ay = _a[1], az = _a[2];
        hd.toWorld(hx, -hy, hz, _a); const cx = _a[0], cy = _a[1], cz = _a[2];
        hd.toWorld(hx, hy, hz, _a); const dx = _a[0], dy = _a[1], dz = _a[2];
        hd.toWorld(-hx, hy, hz, _a);
        g.faceQuads.corners(this.faceQuad, ax, ay, az, cx, cy, cz, dx, dy, dz, _a[0], _a[1], _a[2]);
      }
    }
  }

  /** Nothing of them drawn: hidden away while something else stands in for them. */
  _hideAll() {
    const g = this.game, bx = g.boxes;
    for (const i of this.inst) bx.hide(i);
    for (const hand of this.fingers) for (const i of hand) bx.hide(i);
    if (this.clawIdx) for (const hand of this.clawIdx) for (const i of hand) bx.hide(i);
    for (const h of this.hair) bx.hide(h.idx);
    if (this.faceQuad >= 0) g.faceQuads.hide(this.faceQuad);
    if (this.phoneIdx >= 0) bx.hide(this.phoneIdx);
    if (this.caps) for (const c of this.caps) bx.hide(c.idx);
    if (this.vest) for (const v of this.vest.boxes) bx.hide(v.idx);
    if (this.helmet) for (const v of this.helmet.boxes) (v.glass ? g.glass : bx).hide(v.idx);
  }

  /**
   * Makes them `s` (the scale they were made at being 1 for an ordinary
   * adult) where they stand: the body that collides and the body that is
   * drawn, and everything that rides on it.
   */
  setScale(s) {
    const k = s / this.scale;
    if (Math.abs(k - 1) < 1e-4) return;
    rescaleRagdoll(this.bodies, this.joints, k);
    const mul = (a) => { for (let i = 0; i < a.length; i++) a[i] *= k; };
    for (const z of this.sizes) mul(z);
    for (const h of this.hair) { mul(h.l); mul(h.s); }
    if (this.vest) { for (const v of this.vest.boxes) { mul(v.l); mul(v.z); } this.vest.lift *= k; }
    if (this.helmet) { for (const v of this.helmet.boxes) { mul(v.l); mul(v.z); } this.helmet.lift *= k; }
    if (this.caps) for (const c of this.caps) { mul(c.l); mul(c.z); }
    this.scale = s; this.h.scale = s;
    this.repose();
  }

  /** A colour for every part over whatever they wear (a suit, fur), or null for their own again. */
  setCoat(coat) {
    this.coat = coat;
    this._pallor = -1; this._burnKey = -1; this._soakQ.fill(-1);
    for (let i = 0; i < PART_COUNT; i++) if (!this.gone[i]) this.game.boxes.colorHex(this.inst[i], coat ? coat[i] : this.cloth[i] >= 0 ? this.cloth[i] : this.look.skin);
    this._tintSkin(); this._tintCloth();
  }

  /** Claws grown out of the ends of the fingers (on), or gone again (off). */
  setClaws(on) {
    const bx = this.game.boxes;
    this.claws = on;
    if (on && !this.clawIdx) { this.clawIdx = [[], []]; for (let h = 0; h < 2; h++) for (let f = 0; f < 4; f++) { const i = bx.alloc(); bx.colorHex(i, 0xf1ead8); this.clawIdx[h].push(i); } }
    else if (!on && this.clawIdx) { for (const hand of this.clawIdx) for (const i of hand) bx.release(i); this.clawIdx = null; }
  }

  /** Fur all over, of colour `hex`, in place of skin and clothes; null for their own again. */
  setFur(hex) {
    this.fur = hex;
    this._pallor = -1; this._burnKey = -1; this._soakQ.fill(-1);
    for (let i = 0; i < PART_COUNT; i++) if (this.cloth[i] >= 0 && !this.gone[i]) this.game.boxes.colorHex(this.inst[i], hex ?? this.cloth[i]);
    this._tintSkin(); this._tintCloth();
  }

  /**
   * A hand: a palm, four fingers and a thumb. Each finger is two segments that
   * turn at the knuckle and at the middle joint, toward the palm; `palm` is
   * which way that is in the hand's own space (+X for the right hand).
   */
  _drawHand(part, hnd, palm) {
    const bx = this.game.boxes, idx = this.fingers[hnd];
    if (this.gone[part]) { for (const i of idx) bx.hide(i); return; }
    const b = this.bodies[part], s = this.scale, sz = this.sizes[part];
    const px = b.px, py = b.py, pz = b.pz, qx = b.qx, qy = b.qy, qz = b.qz, qw = b.qw;
    // the palm is the top six tenths of what used to be the whole hand
    const top = sz[1] * 0.5, knuckle = -0.012 * s;
    bx.setOn(this.inst[part], px, py, pz, qx, qy, qz, qw, 0, (top + knuckle) * 0.5, 0, sz[0], top - knuckle, sz[2]);
    const c = this.curl[hnd], sp = this.splay[hnd];
    for (let f = 0; f < 4; f++) {
      const fl = FINGERS[f];
      // the index finger of a hand on a gun lies along it until it is wanted
      const cf = hnd === 1 && f === 0 ? this.trigger : hnd === 0 && f === 0 && this.point[0] > 0.5 ? 0 : c * fl[3];
      const a1 = palm * cf * 1.38, a2 = a1 + palm * cf * 1.5;
      const l1 = fl[1] * s, l2 = fl[2] * s, z0 = fl[0] * s, w = 0.0195 * s, fan = sp * FAN[f];
      const s1 = Math.sin(a1), c1 = Math.cos(a1), s2 = Math.sin(a2), c2 = Math.cos(a2);
      // a little fan when the hand is spread: each finger leans away from the middle one
      _fq[0] = 0; _fq[1] = 0; _fq[2] = Math.sin(a1 / 2); _fq[3] = Math.cos(a1 / 2);
      bx.setOn(idx[f * 2], px, py, pz, qx, qy, qz, qw, s1 * l1 * 0.5, knuckle - c1 * l1 * 0.5, z0 + fan * l1 * 0.5, 0.021 * s, l1, w, _fq);
      const ex = s1 * l1, ey = knuckle - c1 * l1, ez = z0 + fan * l1;
      _fq[2] = Math.sin(a2 / 2); _fq[3] = Math.cos(a2 / 2);
      bx.setOn(idx[f * 2 + 1], px, py, pz, qx, qy, qz, qw, ex + s2 * l2 * 0.5, ey - c2 * l2 * 0.5, ez + fan * l2 * 0.5, 0.019 * s, l2, w * 0.92, _fq);
      // a claw out of the end of each finger, curving on the way the finger does
      if (this.clawIdx) {
        const cl = 0.032 * s, a3 = a2 + palm * 0.5;
        _fq[2] = Math.sin(a3 / 2); _fq[3] = Math.cos(a3 / 2);
        const tx = ex + s2 * l2, ty = ey - c2 * l2, tz = ez + fan * l2;
        bx.setOn(this.clawIdx[hnd][f], px, py, pz, qx, qy, qz, qw, tx + Math.sin(a3) * cl * 0.5, ty - Math.cos(a3) * cl * 0.5, tz, 0.012 * s, cl, 0.01 * s, _fq);
      }
    }
    // the thumb leaves the front edge of the palm, pointing down and forward, and closes across it
    const ct = c;
    const th = -0.75 + ct * 0.25, a1 = palm * (0.12 + ct * 0.95), a2 = a1 + palm * (0.1 + ct * 0.9);
    const l1 = 0.036 * s, l2 = 0.03 * s;
    const bxp = palm * 0.006 * s, byp = top - 0.04 * s, bzp = sz[2] * 0.5 - 0.004 * s;
    const sh = Math.sin(th / 2), chh = Math.cos(th / 2), cth = Math.cos(th), sth = Math.sin(th);
    // turn about Z (toward the palm), then about X (forward): q = qX * qZ
    let sa = Math.sin(a1 / 2), ca = Math.cos(a1 / 2);
    _fq[0] = sh * ca; _fq[1] = -sh * sa; _fq[2] = chh * sa; _fq[3] = chh * ca;
    let dx = Math.sin(a1), dy = -Math.cos(a1) * cth, dz = -Math.cos(a1) * sth;
    bx.setOn(idx[8], px, py, pz, qx, qy, qz, qw, bxp + dx * l1 * 0.5, byp + dy * l1 * 0.5, bzp + dz * l1 * 0.5, 0.023 * s, l1, 0.023 * s, _fq);
    const ex = bxp + dx * l1, ey = byp + dy * l1, ez = bzp + dz * l1;
    sa = Math.sin(a2 / 2); ca = Math.cos(a2 / 2);
    _fq[0] = sh * ca; _fq[1] = -sh * sa; _fq[2] = chh * sa; _fq[3] = chh * ca;
    dx = Math.sin(a2); dy = -Math.cos(a2) * cth; dz = -Math.cos(a2) * sth;
    bx.setOn(idx[9], px, py, pz, qx, qy, qz, qw, ex + dx * l2 * 0.5, ey + dy * l2 * 0.5, ez + dz * l2 * 0.5, 0.021 * s, l2, 0.021 * s, _fq);
  }

  /** How closed each hand wants to be, given what it is doing. */
  _hands(dt) {
    const w = this.anim.w, alive = this.h.alive && this.h.conscious, anim = this.state === ST.ANIM || this.state === ST.GETUP;
    let l = 0.28, r = 0.28, sl = 0, sr = 0, trig = -1;
    if (!alive) { l = r = 0.36; }
    else if (!anim) { l = r = this.state === ST.STUMBLE ? 0.12 : 0.3; sl = sr = this.state === ST.STUMBLE ? 0.6 : 0.15; }
    else {
      const fist = Math.max(w.guard, this.anim.action && this.anim.action.clip.kind === 'blunt' ? 1 : 0);
      const open = Math.max(w.handsUp, w.brace);
      l = r = lerp(0.28 + clamp01(this.speed / 5) * 0.3, 1, fist);
      l = lerp(l, 0.04, open); r = lerp(r, 0.04, open); sl = sr = open;
      l = lerp(l, 0.55, w.cower); r = lerp(r, 0.55, w.cower);
      r = lerp(r, 0.8, w.phone);
      l = lerp(l, 0.75, Math.max(w.pistol, w.rifle));      // the hand that steadies the gun
      if (this.handFull > 0) l = lerp(l, 0.9, this.handFull);   // a magazine in the left hand
      // a finger held out straight (the rest in a fist), and a leopard's half-closed claw
      if (this.claws) { if (!this.point[0] && this.grasp[0] < 0) l = Math.min(l, 0.55); if (!this.point[1] && this.grasp[1] < 0) r = Math.min(r, 0.55); }
      if (this.point[0] > 0) l = lerp(l, 1, this.point[0]);
      if (this.point[1] > 0 && !this.weapon) { r = lerp(r, 1, this.point[1]); trig = 0; }
      // a hand taking hold of something opens for it, then closes round it
      if (this.grasp[0] >= 0) { l = lerp(0.03, 0.97, this.grasp[0]); sl = (1 - this.grasp[0]) * 0.6; }
      if (this.grasp[1] >= 0 && !this.weapon) { r = lerp(0.03, 0.97, this.grasp[1]); sr = (1 - this.grasp[1]) * 0.6; }
      if (this.cuffed) { l = r = 0.5; sl = sr = 0; }
      if (this.cuffing) { l = r = 0.7; }
    }
    const item = this.weapon;
    if (item && this.attached[P.HAND_R] && !this.gone[P.HAND_R]) {
      r = 1; sr = 0;
      if (item.def.gun) trig = alive && anim ? 0.42 + this.anim.recoil * 0.5 : 0.6;
    }
    const k = 1 - Math.exp(-dt * 14);
    this.curl[0] += (l - this.curl[0]) * k; this.curl[1] += (r - this.curl[1]) * k;
    this.splay[0] += (sl - this.splay[0]) * k; this.splay[1] += (sr - this.splay[1]) * k;
    const tt = trig >= 0 ? trig : this.curl[1] * FINGERS[0][3];
    this.trigger += (tt - this.trigger) * (1 - Math.exp(-dt * 22));
  }

  /* ---------------------------------- hits -------------------------------- */

  /**
   * A weapon landed.
   *   part, type, power    as Health.hit
   *   point, dir           world space; dir is the way the blow was travelling
   *   impulse              newton seconds of shove
   *   through              for a bullet, metres travelled inside the part
   * Returns the health report, with what became of the body added.
   */
  hit(info) {
    // another player: the hit is theirs to take, on their own screen
    if (this.puppet) return this.game.mp ? this.game.mp.hitRemote(this, info) : null;
    const { part } = info, g = this.game;
    let type = info.type, power = info.power, hp = info.hp, stopped = false;
    const b = this.bodies[part];
    if (this.gone[part]) return null;
    let armour = '', mat = null;
    if ((this.vest || this.helmet) && this.attached[part] && type !== 'needle' && type !== 'burn') {
      b.toLocal(info.point[0], info.point[1], info.point[2], _a);
      const n0 = info.normal || faceOf([_a[0] / b.hx, _a[1] / b.hy, _a[2] / b.hz]);
      mat = this.armourAt(part, _a, n0);
      if (mat) {
        const was = type, r = throughArmour(mat, type, info.shot ? 'shot' : info.ball ? 'ball' : info.rifle ? 'rifle' : 'pistol', power, hp);
        type = r.type; power = r.power; hp = r.hp; stopped = r.stopped;
        if (part === P.HEAD) {
          this.helmet.hits++;
          if (mat === 'visor' && was === 'bullet') {
            // every round that lands on the visor stars it; enough of them and there is no seeing through it, or trusting it
            this.helmet.visor++;
            const vb = this.helmet.boxes.find((v) => v.glass);
            if (vb) g.glass.colorHex(vb.idx, this.helmet.visor >= 3 ? 0xe4e8ea : 0xc3cfd6);
            if (this.helmet.visor >= 3) g.audio?.at('glass', info.point[0], info.point[1], info.point[2], 0.5);
          }
          if (stopped) armour = 'helmet';
        } else {
          this.vest.hits++;
          this.vestHit = { was, stopped, t: g.time, mat };
          if (stopped) armour = 'vest';
        }
      }
    }
    b.toLocal(info.point[0], info.point[1], info.point[2], _a);
    const lp = [_a[0], _a[1], _a[2]];
    b.dirToLocal(info.dir[0], info.dir[1], info.dir[2], _b);
    const ld = [_b[0], _b[1], _b[2]];
    const ln = info.normal ? info.normal : faceOf([lp[0] / b.hx, lp[1] / b.hy, lp[2] / b.hz]);
    const J = info.impulse || 0;
    if (!this.attached[part]) {
      // a piece lying on the ground: it marks and it moves, nothing more
      g.gore.mark(this, part, type === 'bullet' ? 'entry' : type === 'blunt' ? 'bruise' : 'slash', lp, ln, 0.06);
      b.applyImpulse(info.dir[0] * J * 0.4, info.dir[1] * J * 0.4 + 1, info.dir[2] * J * 0.4, info.point[0], info.point[1], info.point[2]);
      g.gore.burst(info.point[0], info.point[1], info.point[2], -info.dir[0], 0.4, -info.dir[2], 6, 2);
      return null;
    }
    const wasAlive = this.h.alive;
    const rep = this.h.hit({ part, type, power, lp, ln, ld, through: info.through, chop: info.chop, hp, weapon: info.weapon, shot: !!info.shot && type === 'bullet' });
    rep.wasAlive = wasAlive;
    rep.stopped = stopped;
    if (stopped) {
      // what the vest took shows on the vest
      g.gore.mark(this, part, info.type === 'bullet' ? (mat === 'visor' ? 'crack' : 'entry') : 'slash', lp, ln, info.type === 'bullet' ? (mat === 'visor' ? 0.07 : 0.045) : 0.09, armour === 'helmet' ? (mat === 'visor' ? 0.036 * this.scale : this.helmet.lift) : mat === 'plate' ? this.vest.lift + 0.012 * this.scale : this.vest.lift);
      g.gore.puff('smoke', info.point[0], info.point[1], info.point[2], 0.16, 0.35, 0.3, 0.3, 0.3);
    }
    this.lastAttacker = info.attacker || this.lastAttacker;
    if (info.weapon) this.lastWeapon = info.weapon;
    if (rep.wound) g.gore.wound(this, rep.wound);
    if (rep.exit) {
      g.gore.wound(this, rep.exit);
      b.toWorld(rep.exit.x, rep.exit.y, rep.exit.z, _a);
      g.gore.burst(_a[0], _a[1], _a[2], info.dir[0], info.dir[1] + 0.15, info.dir[2], 16, 5.5, 0.35);
      g.gore.mist(_a[0], _a[1], _a[2], info.dir[0], info.dir[1] + 0.1, info.dir[2], 34, 7.5, 0.5);
    }
    // what comes out of the wound, back the way the blow came
    const spray = this.h.god ? 0 : type === 'bullet' ? (info.shot ? 3 : info.ball ? 13 : 9) : type === 'blunt' ? (power > 0.9 && part === P.HEAD ? 6 : 0) : type === 'stab' ? 10 : 12 + power * 5;
    if (spray > 0) g.gore.burst(info.point[0], info.point[1], info.point[2], -info.dir[0] * 0.6, 0.5, -info.dir[2] * 0.6, spray, type === 'cut' ? 3.4 : 2.6, 0.7);
    if (this.h.god) { /* not a mark on them */ }
    else if (type === 'bullet') g.gore.mist(info.point[0], info.point[1], info.point[2], -info.dir[0], 0.25, -info.dir[2], info.shot ? 4 : 12, 3.2, 0.8);
    else if (type === 'cut' && power > 1.2) g.gore.mist(info.point[0], info.point[1], info.point[2], info.dir[0], 0.4, info.dir[2], 14, 4.2, 0.9);
    if (rep.arterial) g.gore.burst(info.point[0], info.point[1], info.point[2], -info.dir[0], 0.8, -info.dir[2], 26, 4.5, 0.5);
    if (!this.h.god) this.bloodied = Math.min(1, this.bloodied + (type === 'blunt' ? 0.02 : 0.12));

    if (this.mind) this.mind.feel(part, type, rep, info.attacker, info.weapon, stopped ? info.type : null, armour || 'vest');
    let limbGone = false;
    if (rep.burst) { this.burst(part, [info.dir[0] * 3, 2, info.dir[2] * 3]); limbGone = true; }
    else if (rep.severed >= 0) { this.sever(rep.severed, [info.dir[0] * 1.5, 1.2, info.dir[2] * 1.5]); limbGone = true; }

    if (this.h.alive && this.h.conscious && rep.pain > 16 && !this.isPlayer) this.scream = Math.max(this.scream, 0.5);
    if (wasAlive) this.react(J + rep.pain * 0.35 + rep.bones.length * 16 + (limbGone ? 30 : 0), info.dir[0], info.dir[2], rep, part);
    // and the shove itself
    if (!b.kinematic && !this.gone[part]) {
      b.applyImpulse(info.dir[0] * J, info.dir[1] * J + (info.lift || 0), info.dir[2] * J, info.point[0], info.point[1], info.point[2]);
      const core = this.bodies[P.CHEST];
      if (core !== b && !core.kinematic) core.applyImpulse(info.dir[0] * J * 0.5, 0, info.dir[2] * J * 0.5);
      this.balance -= J / 110;
    }
    g.onHit?.(this, info, rep);
    return rep;
  }

  /** Decides whether a blow is shrugged off, staggers, or drops them. */
  react(force, dx, dz, rep, part = P.CHEST) {
    if (this.state !== ST.ANIM && this.state !== ST.GETUP) { if (this.state === ST.STUMBLE) this.balance -= force / 120; return; }
    const h = this.h;
    let firm = (this.crouching ? 1.35 : 1) * (0.55 + 0.45 * h.mobility) * (this.isPlayer ? 1.25 : 1) * (this.speed > 3.5 ? 0.8 : 1) * this.sturdy * this.knock;
    if (this.state === ST.GETUP) firm *= 0.5;
    if (part === P.HEAD) force *= 1.2;
    if (part >= P.THIGH_L) force *= 1.15;
    if (!h.alive || !h.conscious || !h.canStand || (rep && rep.ko) || force > 66 * firm) { this.toRagdoll(); return; }
    if (force > 25 * firm) { this.toStumble(force / firm, dx * force * 0.012, dz * force * 0.012); return; }
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.anim.kick(dx * c - dz * s, dx * s + dz * c, force / 36);
    this.guardT = 4;
  }

  /**
   * Somebody leaning into them at (vx, vz): they give way and are pushed
   * along, facing whoever is doing it. Kept up long enough, it takes their
   * feet from under them.
   */
  pushedBy(by, vx, vz) {
    const now = this.game.time;
    const p = this.pushV || (this.pushV = { x: 0, z: 0, t: -9, since: 0, by: null });
    if (now - p.t > 0.5) {
      // a new push: they notice, and they mind
      p.since = now;
      const m = this.mind;
      if (m) {
        m.note('felt', 'pushed', `was pushed by ${by.isPlayer ? 'the stranger' : 'someone'}`, 0.5, { by });
        m.stir('surprise', 28); m.stir('anger', 10 + m.p.temper * 14);
        m.ask('bump', 48, null, rand(0.1, 0.4));
      }
    }
    p.x = vx; p.z = vz; p.t = now; p.by = by;
  }

  /** A push with no wound: being barged, or shoved. */
  shove(vx, vz, force, by) {
    if (this.puppet) { this.game.mp?.shoveRemote(this, vx, vz, force, by); return; }
    if (this.state !== ST.ANIM) return;
    this.mind?.note('felt', 'shove', by ? 'was barged into by ' + (by.isPlayer ? 'the stranger' : 'someone') : 'was shoved', 0.5, { by });
    this.toStumble(force, vx, vz);
  }

  struckByCar(car, closing) {
    if (this.puppet) { this.game.mp?.carRemote(this, car, closing); return; }
    const b = car.body, g = this.game;
    this.toRagdoll();
    const up = clamp(closing * 0.28, 0.8, 4);
    for (let i = 0; i < PART_COUNT; i++) {
      if (!this.attached[i]) continue;
      const p = this.bodies[i];
      p.vx = b.vx * 1.05 + rand(-0.6, 0.6); p.vz = b.vz * 1.05 + rand(-0.6, 0.6); p.vy = up * (i <= P.HEAD ? 1 : 0.6);
      p.wx = rand(-3, 3); p.wz = rand(-3, 3);
    }
    const power = closing / 4.2;
    const dir = [b.vx / (Math.hypot(b.vx, b.vz) || 1), 0, b.vz / (Math.hypot(b.vx, b.vz) || 1)];
    for (const part of [chance(0.5) ? P.SHIN_L : P.SHIN_R, P.PELVIS, chance(0.5) ? P.THIGH_L : P.THIGH_R]) {
      const rep = this.h.hit({ part, type: power > 1.7 ? 'crush' : 'blunt', power: power * rand(0.7, 1.1), lp: [0, 0, 0.05], ln: [0, 0, 1], ld: [0, 0, -1] });
      if (rep.wound) g.gore.wound(this, rep.wound);
      if (this.mind) this.mind.feel(part, 'blunt', rep, 'a car');
    }
    g.audio?.at('carhit', this.x, this.y + 1, this.z, clamp01(closing / 9));
    g.traffic?.struck?.(car, this, closing);
    g.onCarHit?.(this, car, closing, dir);
  }

  /* ------------------------------ coming apart ---------------------------- */

  /**
   * Cuts the body at the joint above `part`. Everything from there down is
   * now a separate thing lying in the world.
   */
  sever(part, vel = null, quiet = false) {
    if (this.h.god) return;
    if (this.cuffed && part >= P.UARM_L && part <= P.HAND_R) this.game.weapons?.uncuff(this, null);
    if (part <= 0 || !this.attached[part] || this.removed) return null;
    const g = this.game, world = g.world;
    const j = this.joints[part - 1];
    const ids = SUBTREE[part].filter((i) => this.attached[i]);
    if (j.enabled) { j.enabled = false; world.removeJoint(j); }
    const isl = new Island(this);
    const grp = newGroup();
    for (const i of ids) {
      const b = this.bodies[i];
      this.island.remove(b); isl.add(b);
      b.group = grp; b.orient = null; b.setKinematic(false);
      this.attached[i] = false;
      if (vel) { b.vx += vel[0] + rand(-0.5, 0.5); b.vy += vel[1]; b.vz += vel[2] + rand(-0.5, 0.5); b.wx += rand(-4, 4); b.wz += rand(-4, 4); }
    }
    isl.wake();
    world.addIsland(isl);
    this.pieces.push({ island: isl, parts: ids, age: 0, root: part });
    g.pieces.push({ human: this, island: isl, parts: ids, born: g.time });
    const lost = this.h.lose(part, ids, false);
    // raw ends on both sides of the cut
    const parent = PARTS[part].parent, pj = PARTS[part];
    g.gore.stump(this, parent, pj.la, part, lost.stump);
    g.gore.stump(this, part, pj.lb, -1, null);
    const pb = this.bodies[part];
    pb.toWorld(pj.lb[0] * this.scale, pj.lb[1] * this.scale, pj.lb[2] * this.scale, _a);
    g.gore.burst(_a[0], _a[1], _a[2], 0, 1, 0, part === P.HEAD || part === P.NECK ? 60 : 34, 4.5, 1);
    if (!quiet) {
      g.audio?.at('sever', _a[0], _a[1], _a[2], 1);
      if (this.mind) this.mind.lost(part, false);
      g.onDismember?.(this, part, false);
      if (this.weapon && (ids.includes(P.HAND_R))) g.weapons?.dropFrom(this);
      if (!this.h.alive) this._died();
      else if (this.state === ST.ANIM || this.state === ST.GETUP) {
        if (part >= P.THIGH_L) this.toRagdoll(); else this.toStumble(55);
      }
    }
    return isl;
  }

  /**
   * The raw end where a part came away: a ring of torn muscle standing a
   * little proud of the cut, and the bone in the middle of it standing
   * further. (lp, ln: the joint on the part's face, and which face; w, d:
   * the size of the cut across that face.)
   */
  capStump(part, lp, ln, w, d, lost = -1) {
    const g = this.game, s = this.scale;
    if (!this.caps) this.caps = [];
    const hx = this.bodies[part].hx, hy = this.bodies[part].hy, hz = this.bodies[part].hz;
    const side = Math.abs(ln[0]) > 0.5;
    const sg = side ? Math.sign(ln[0]) : Math.sign(ln[1]);
    // on the face, not out where the joint was
    const cx = side ? sg * hx : clamp(lp[0], -hx * 0.6, hx * 0.6), cy = side ? clamp(lp[1], -hy * 0.6, hy * 0.6) : sg * hy, cz = clamp(lp[2], -hz * 0.5, hz * 0.5);
    const along = (k) => (side ? [cx + sg * k, cy, cz] : [cx, cy + sg * k, cz]);
    const across = (a, b, t) => (side ? [t, b, a] : [a, t, b]);
    const thin = 0.02 * s;
    const meat = g.boxes.alloc(), bone = g.boxes.alloc(), fat = g.boxes.alloc();
    g.boxes.colorHex(meat, 0x741010); g.boxes.colorHex(bone, 0xe8dfca); g.boxes.colorHex(fat, 0xd9b48a);
    const bw = clamp(Math.min(w, d) * 0.3, 0.022 * s, 0.05 * s);
    // the head gone: what is left at the top of the neck is the spine and the windpipe
    const neck = part === P.NECK;
    this.caps.push({ idx: fat, part, l: along(thin * 0.3), z: across(w * 0.92, d * 0.92, thin * 0.6) });
    this.caps.push({ idx: meat, part, l: along(thin * 0.7), z: across(w * 0.78, d * 0.78, thin * 1.1) });
    this.caps.push({ idx: bone, part, l: neck ? along(thin * 1.4).map((v, k) => (k === 2 ? v - 0.025 * s : v)) : along(thin * 1.8), z: across(bw, bw, thin * 2.6) });
  }

  /** The part is destroyed outright; whatever hung from it drops. */
  burst(part, vel = [0, 2, 0]) {
    if (this.h.god) return;
    if (this.cuffed && part >= P.UARM_L && part <= P.HAND_R) this.game.weapons?.uncuff(this, null);
    if (part <= 0 || this.gone[part] || this.removed) return;
    const g = this.game, world = g.world, b = this.bodies[part];
    const wasAttached = this.attached[part];
    for (const c of CHILDREN[part]) if (this.attached[c] === wasAttached && !this.gone[c] && this.bodies[c].island === b.island) {
      if (wasAttached) this.sever(c, [vel[0] * 0.5, vel[1] * 0.5, vel[2] * 0.5], true);
      else this._splitPiece(c);
    }
    const j = this.joints[part - 1];
    if (j.enabled) { j.enabled = false; world.removeJoint(j); }
    for (const c of CHILDREN[part]) { const cj = this.joints[c - 1]; if (cj.enabled) { cj.enabled = false; world.removeJoint(cj); } }
    const home = b.island;
    if (home) {
      home.remove(b);
      if (home !== this.island && home.bodies.length === 0) {
        world.removeIsland(home);
        const k = this.pieces.findIndex((p) => p.island === home);
        if (k >= 0) this.pieces.splice(k, 1);
        const n = g.pieces.findIndex((p) => p.island === home);
        if (n >= 0) g.pieces.splice(n, 1);
      }
    }
    this.attached[part] = false; this.gone[part] = true;
    g.boxes.hide(this.inst[part]);
    g.gore.clearPart(this, part);
    let stump = null;
    if (wasAttached) stump = this.h.lose(part, [part], true).stump;
    const parent = PARTS[part].parent;
    if (!this.gone[parent]) g.gore.stump(this, parent, PARTS[part].la, part, stump);
    g.gore.gibs(b.px, b.py, b.pz, vel, this.sizes[part], this.look.skin, this.clothed[part] ? partCloth(this.look, part) : this.look.skin, part);
    for (const c of this.caps || []) if (c.part === part) g.boxes.hide(c.idx);
    g.gore.burst(b.px, b.py, b.pz, 0, 1, 0, part === P.HEAD ? 90 : 55, 6, 1.4);
    g.audio?.at('burst', b.px, b.py, b.pz, 1);
    if (wasAttached) {
      if (this.mind) this.mind.lost(part, true);
      g.onDismember?.(this, part, true);
      if (this.weapon && (part === P.HAND_R || part === P.FARM_R || part === P.UARM_R)) g.weapons?.dropFrom(this);
      if (!this.h.alive) this._died();
      else if (this.state === ST.ANIM || this.state === ST.GETUP) { if (part >= P.THIGH_L) this.toRagdoll(); else this.toStumble(60); }
    }
  }

  /** A loose piece loses a part from its middle: what was below goes its own way. */
  _splitPiece(c) {
    const world = this.game.world, old = this.bodies[c].island;
    const j = this.joints[c - 1];
    if (j.enabled) { j.enabled = false; world.removeJoint(j); }
    const ids = SUBTREE[c].filter((i) => !this.gone[i] && this.bodies[i].island === old);
    const isl = new Island(this), grp = newGroup();
    for (const i of ids) { const b = this.bodies[i]; old.remove(b); isl.add(b); b.group = grp; }
    world.addIsland(isl);
    this.pieces.push({ island: isl, parts: ids, age: 0, root: c });
    this.game.pieces.push({ human: this, island: isl, parts: ids, born: this.game.time });
  }

  /** Clears one loose piece out of the world for good. */
  dropPiece(isl) {
    const g = this.game;
    const i = this.pieces.findIndex((p) => p.island === isl);
    if (i < 0) return;
    for (const part of this.pieces[i].parts) {
      if (this.gone[part]) continue;
      this.gone[part] = true;
      g.boxes.hide(this.inst[part]);
      g.gore.clearPart(this, part);
      const j = this.joints[part - 1];
      if (j && j.enabled) { j.enabled = false; g.world.removeJoint(j); }
      if (part === P.HEAD) { for (const h of this.hair) g.boxes.hide(h.idx); if (this.faceQuad >= 0) g.faceQuads.hide(this.faceQuad); }
    }
    g.world.removeIsland(isl);
    this.pieces.splice(i, 1);
  }

  /* --------------------------------- queries ------------------------------ */

  part(i) { return this.bodies[i]; }
  get standing() { return this.state === ST.ANIM || this.state === ST.STUMBLE || this.state === ST.GETUP; }
  get down() { return this.state === ST.RAGDOLL; }
  eye(out) {
    const hd = this.bodies[this.attached[P.HEAD] ? P.HEAD : P.CHEST];
    return hd.toWorld(0, 0.03 * this.scale, 0.1 * this.scale, out);
  }
  chest(out) { const c = this.bodies[P.CHEST]; out[0] = c.px; out[1] = c.py; out[2] = c.pz; return out; }
  /** Unit vector of where the head is pointing. */
  gaze(out) {
    const hd = this.bodies[this.attached[P.HEAD] ? P.HEAD : P.CHEST];
    return hd.dirToWorld(0, 0, 1, out);
  }
  /** One line a witness could say about how this person looks. */
  appearance() {
    const h = this.h, bits = [];
    if (this.gone[P.HEAD] || !this.attached[P.HEAD]) bits.push('headless');
    for (const [i, n] of [[P.UARM_L, 'left arm'], [P.UARM_R, 'right arm'], [P.THIGH_L, 'left leg'], [P.THIGH_R, 'right leg']]) {
      if (!this.attached[i]) bits.push('missing a ' + n);
      else if (!this.attached[i + 1]) bits.push('missing half a ' + n);
      else if (!this.attached[i + 2]) bits.push('missing a ' + (i < P.THIGH_L ? 'hand' : 'foot'));
    }
    if (h.bleedOut > 12) bits.push('pouring blood'); else if (h.bleedOut > 1.5) bits.push('bleeding');
    else if (this.bloodied > 0.3) bits.push('bloodied');
    if (!h.alive) bits.push(this.down ? 'lying dead' : 'dead');
    else if (!h.conscious) bits.push('lying unconscious');
    else if (this.state === ST.RAGDOLL) bits.push(this.pose.crawl ? 'crawling' : 'on the ground');
    else if (this.state === ST.STUMBLE) bits.push('staggering');
    else if (this.pose.cower > 0.5) bits.push('cowering');
    else if (this.pose.handsUp > 0.5) bits.push('hands up');
    else if (this.speed > 3) bits.push('running');
    return bits;
  }

  /** Stands a living, whole person back on their feet at once. */
  reset(x, z, yaw) {
    this.x = x; this.z = z; this.y = groundHeight(x, z); this.yaw = yaw;
    this.vx = this.vz = this.vy = 0; this.speed = 0; this.grounded = true;
    this.gvx = this.gvz = 0; this.gait = 0;
    this.state = ST.ANIM; this.balance = 1; this.blendDur = 0;
    for (const k in this.pose) this.pose[k] = 0;
    for (let i = 0; i < PART_COUNT; i++) if (this.attached[i]) { this.bodies[i].setKinematic(true); this.bodies[i].orient = null; }
    this.island.mover = true;
    this._solve(0); this._apply(0);
  }

  remove() {
    if (this.removed) return;
    const g = this.game;
    if (this.car) { const c = this.car; if (c.seats[this.seat] === this) c.seats[this.seat] = null; this.car = null; this.seat = -1; }
    this.removed = true;
    if (this.isPlayer) g.weapons?.dropFrom(this); else g.weapons?.forget(this);
    this.removeVest(); this.removeHelmet();
    for (const p of this.pieces.slice()) this.dropPiece(p.island);
    for (const j of this.joints) if (j.enabled) { j.enabled = false; g.world.removeJoint(j); }
    g.world.removeIsland(this.island);
    for (const i of this.inst) g.boxes.release(i);
    for (const h of this.hair) g.boxes.release(h.idx);
    if (this.caps) { for (const c of this.caps) g.boxes.release(c.idx); this.caps = null; }
    for (const hand of this.fingers) for (const i of hand) g.boxes.release(i);
    if (this.phoneIdx >= 0) { g.boxes.release(this.phoneIdx); this.phoneIdx = -1; }
    g.faceQuads.release(this.faceQuad); g.faces.release(this.faceCell);
    g.gore.clearHuman(this);
  }
}

/** What an arm can be inside: the trunk, the head, the thighs. (The other arm is looked at separately.) */
const ARM_BLOCK = [P.PELVIS, P.ABDOMEN, P.CHEST, P.HEAD, P.THIGH_L, P.THIGH_R];
/** Which channel to try turning, and which way, in the order to prefer them: out, less in, up, elbow straighter... (index * 2 + sign) */
const ARM_TRY = [2, 5, 0, 6, 7, 1, 4, 3];
/** The parts of somebody else an arm is kept out of. */
const CROWD_BLOCK = [P.PELVIS, P.ABDOMEN, P.CHEST, P.HEAD, P.UARM_L, P.FARM_L, P.HAND_L, P.UARM_R, P.FARM_R, P.HAND_R, P.THIGH_L, P.THIGH_R];
const _crowd = [null, null, null, null]; let _crowdN = 0;
const _blendP = new Float32Array(PART_COUNT * 3), _blendQ = new Float32Array(PART_COUNT * 4);
const _hch = new Float32Array(CHANNELS), _hloc = new Float32Array(PART_COUNT * 4), _hpos = new Float32Array(PART_COUNT * 3), _hquat = new Float32Array(PART_COUNT * 4);
const _hfd = { x: 0, y: 0, z: 0, w: 1 }, _hpel = { x: 0, y: 0, z: 0, w: 1 };
const _bq = [0, 0, 0, 1];
const _fx = [0, 0, 0, 0];
const _ra = [0, 0, 0], _rb = [0, 0, 0], _rj = new Float64Array(12), _r0 = [0, 0, 0, 0];
/** How far the shoulder (raised, out to the side, turned in) and the elbow can go, in all, while reaching. */
const REACH_LO = [-1.0, -0.35, -1.3, 0.02], REACH_HI = [3.0, 1.7, 1.5, 2.45];
const _ma = new Float64Array(9), _mb = new Float64Array(9);
function axesOf(q, k, o) {
  const x = q[k], y = q[k + 1], z = q[k + 2], w = q[k + 3];
  o[0] = 1 - 2 * (y * y + z * z); o[1] = 2 * (x * y + w * z); o[2] = 2 * (x * z - w * y);
  o[3] = 2 * (x * y - w * z); o[4] = 1 - 2 * (x * x + z * z); o[5] = 2 * (y * z + w * x);
  o[6] = 2 * (x * z + w * y); o[7] = 2 * (y * z - w * x); o[8] = 1 - 2 * (x * x + y * y);
}
/**
 * How far two parts of a pose are inside each other: the least distance one
 * of their boxes would have to move for them to be clear, or 0 if they are.
 */
function boxDepth(pos, quat, a, sa, b, sb) {
  const tx = pos[b * 3] - pos[a * 3], ty = pos[b * 3 + 1] - pos[a * 3 + 1], tz = pos[b * 3 + 2] - pos[a * 3 + 2];
  const ax = sa[0] * 0.5 - 0.003, ay = sa[1] * 0.5 - 0.003, az = sa[2] * 0.5 - 0.003, bx = sb[0] * 0.5 - 0.003, by = sb[1] * 0.5 - 0.003, bz = sb[2] * 0.5 - 0.003;
  const reach = Math.sqrt(ax * ax + ay * ay + az * az) + Math.sqrt(bx * bx + by * by + bz * bz);
  if (tx * tx + ty * ty + tz * tz > reach * reach) return 0;
  axesOf(quat, a * 4, _ma); axesOf(quat, b * 4, _mb);
  return satDepth(tx, ty, tz, ax, ay, az, bx, by, bz);
}
/** Fifteen axes: three faces of each box and the nine pairs of their edges. Reads the two sets of axes from _ma and _mb. */
function satDepth(tx, ty, tz, ax, ay, az, bx, by, bz) {
  let best = Infinity;
  for (let n = 0; n < 15; n++) {
    let lx, ly, lz;
    if (n < 3) { lx = _ma[n * 3]; ly = _ma[n * 3 + 1]; lz = _ma[n * 3 + 2]; }
    else if (n < 6) { lx = _mb[n * 3 - 9]; ly = _mb[n * 3 - 8]; lz = _mb[n * 3 - 7]; }
    else {
      const i = ((n - 6) / 3) | 0, j = (n - 6) % 3;
      const ux = _ma[i * 3], uy = _ma[i * 3 + 1], uz = _ma[i * 3 + 2], vx = _mb[j * 3], vy = _mb[j * 3 + 1], vz = _mb[j * 3 + 2];
      lx = uy * vz - uz * vy; ly = uz * vx - ux * vz; lz = ux * vy - uy * vx;
      const l = Math.sqrt(lx * lx + ly * ly + lz * lz);
      if (l < 1e-5) continue;
      lx /= l; ly /= l; lz /= l;
    }
    const pa = ax * Math.abs(_ma[0] * lx + _ma[1] * ly + _ma[2] * lz) + ay * Math.abs(_ma[3] * lx + _ma[4] * ly + _ma[5] * lz) + az * Math.abs(_ma[6] * lx + _ma[7] * ly + _ma[8] * lz);
    const pb = bx * Math.abs(_mb[0] * lx + _mb[1] * ly + _mb[2] * lz) + by * Math.abs(_mb[3] * lx + _mb[4] * ly + _mb[5] * lz) + bz * Math.abs(_mb[6] * lx + _mb[7] * ly + _mb[8] * lz);
    const d = pa + pb - Math.abs(tx * lx + ty * ly + tz * lz);
    if (d <= 0) return 0;
    if (d < best) best = d;
  }
  return best;
}

/** The same, between a part of a pose and a body that is somewhere already. */
function boxDepthBody(pos, quat, a, sa, B, sb) {
  const tx = B.px - pos[a * 3], ty = B.py - pos[a * 3 + 1], tz = B.pz - pos[a * 3 + 2];
  const ax = sa[0] * 0.5 - 0.003, ay = sa[1] * 0.5 - 0.003, az = sa[2] * 0.5 - 0.003, bx = sb[0] * 0.5 - 0.003, by = sb[1] * 0.5 - 0.003, bz = sb[2] * 0.5 - 0.003;
  const reach = Math.sqrt(ax * ax + ay * ay + az * az) + Math.sqrt(bx * bx + by * by + bz * bz);
  if (tx * tx + ty * ty + tz * tz > reach * reach) return 0;
  axesOf(quat, a * 4, _ma);
  _bq[0] = B.qx; _bq[1] = B.qy; _bq[2] = B.qz; _bq[3] = B.qw;
  axesOf(_bq, 0, _mb);
  return satDepth(tx, ty, tz, ax, ay, az, bx, by, bz);
}

/** Turns a vector by a quaternion. */
function qrot(qx, qy, qz, qw, x, y, z, out) {
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  out[0] = x + qw * tx + (qy * tz - qz * ty); out[1] = y + qw * ty + (qz * tx - qx * tz); out[2] = z + qw * tz + (qx * ty - qy * tx);
  return out;
}

/** Fingers, index to little: where along the knuckles, the two segment lengths, how readily it closes. */
const FINGERS = [[0.033, 0.04, 0.031, 0.96], [0.011, 0.044, 0.034, 1], [-0.011, 0.04, 0.031, 1.03], [-0.033, 0.032, 0.026, 1.06]];
const FAN = [0.3, 0.1, -0.1, -0.32];
const _fq = [0, 0, 0, 1];

/** The face of a box a local point or direction belongs to. */
function faceOf(v) {
  const ax = Math.abs(v[0]), ay = Math.abs(v[1]), az = Math.abs(v[2]);
  if (ax >= ay && ax >= az) return [v[0] < 0 ? -1 : 1, 0, 0];
  if (ay >= az) return [0, v[1] < 0 ? -1 : 1, 0];
  return [0, 0, v[2] < 0 ? -1 : 1];
}

function partCloth(look, part) {
  const c = PARTS[part].cover;
  return c === 'shirt' ? look.top : c === 'pants' ? look.pants : c === 'shoes' ? look.shoes : look.skin;
}

/**
 * A rotation that lays a body down with its head toward `yaw`, rolled `roll`
 * about its length: 0 is on the front, a quarter turn either way on a side.
 */
function lying(yaw, roll, o) {
  const sx = Math.SQRT1_2, cx = Math.SQRT1_2, sz = Math.sin(roll * 0.5), cz = Math.cos(roll * 0.5), sy = Math.sin(yaw * 0.5), cy = Math.cos(yaw * 0.5);
  const ax = cz * sx, ay = sz * sx, az = sz * cx, aw = cz * cx;
  o.x = cy * ax + sy * az; o.y = cy * ay + sy * aw; o.z = cy * az - sy * ax; o.w = cy * aw - sy * ay;
}

/** A rotation that lays a body on its front, head toward `yaw`. */
function faceDown(yaw, o) {
  // pitch forward a quarter turn about X, then turn to face
  const sx = Math.SQRT1_2, cx = Math.SQRT1_2, sy = Math.sin(yaw * 0.5), cy = Math.cos(yaw * 0.5);
  o.x = cy * sx; o.y = sy * cx; o.z = -sy * sx; o.w = cy * cx;
}
