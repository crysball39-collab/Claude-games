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
  P, PARTS, PART_COUNT, CH, CHANNELS, SUBTREE, CHILDREN, channelsToLocal, solvePose, buildRagdoll, MUSCLE_TORQUE, PELVIS_HEIGHT,
} from './rig.js';
import { Animator, CLIPS } from './anim.js';
import { Health } from './health.js';
import { Island, newGroup, GRAVITY } from '../physics/world.js';
import { groundHeight, LIMIT } from '../world/city.js';
import { rgb } from '../render/boxes.js';
import { restingFace, faceKey, FACE_COLS, FACE_ROWS } from '../render/textures.js';
import { clamp, clamp01, lerp, damp, smooth, turnToward, wrapAngle, dampAngle, rand, chance } from '../core/util.js';

export const ST = { ANIM: 0, STUMBLE: 1, RAGDOLL: 2, GETUP: 3 };
export const RADIUS = 0.27;
const WALK = 1.5, RUN = 5.0, CROUCH = 1.2, JUMP_V = 4.5;
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

    const r = buildRagdoll(game.world, this, this.scale);
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
    this.blend = 0; this.blendDur = 0;
    this.balance = 1; this.stumbleT = 0; this.ragT = 0; this.stillT = 0; this.getT = 0;
    this.speed = 0;
    this.pose = { cower: 0, handsUp: 0, hurt: 0, talk: 0, stagger: 0, writhe: 0, crawl: 0, brace: 0, phone: 0, kneel: 0, cuffed: 0, cuffing: 0 };
    this.hold = 'none';
    this.aimPitch = 0; this.lookYaw = 0; this.lookPitch = 0; this.lowAim = 0;
    this.weapon = null;                    // what is in the right hand, if anything
    this.handFull = 0;                     // 0..1: something small held in the left hand
    this.kit = null;                       // everything carried, in the hand or put away (the player's is kept by Weapons)
    this.swap = null;                      // a weapon on its way between hand and holster
    this.reload = null;                    // a magazine change in progress
    this.aimYaw = null; this.gunLow = 0;   // where a gun in this hand points, and how far it is lowered
    this.vest = null; this.helmet = null;
    this.tased = 0; this.dazeT = 0;        // seconds of a taser's cycle left; seconds of being no use to anyone after it
    this.cuffed = null;                    // { item, by, joint } while in handcuffs
    this.cuffing = null;                   // { target, item, t, dur } while putting them on somebody
    this.custody = null;                   // { by } when it was the police who did it
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

  /* ---- the vest: black, over the chest and the belly ---- */

  /** Puts a light vest on. `police` adds the white patches front and back. */
  wearVest(police = false) {
    if (this.vest) return;
    const g = this.game, s = this.scale, c = this.sizes[P.CHEST], a = this.sizes[P.ABDOMEN];
    const mk = (part, l, z, hex) => { const idx = g.boxes.alloc(); g.boxes.colorHex(idx, hex); return { idx, part, l, z }; };
    const BLACK = 0x121316, TRIM = 0x1d2024;
    const boxes = [
      mk(P.CHEST, [0, -0.012 * s, 0], [c[0] + 0.04 * s, c[1] * 0.94, c[2] + 0.055 * s], BLACK),
      mk(P.ABDOMEN, [0, 0.008 * s, 0], [a[0] + 0.045 * s, a[1] + 0.02 * s, a[2] + 0.055 * s], BLACK),
      mk(P.CHEST, [0.115 * s, c[1] * 0.5 + 0.004 * s, 0], [0.07 * s, 0.03 * s, c[2] + 0.03 * s], TRIM),
      mk(P.CHEST, [-0.115 * s, c[1] * 0.5 + 0.004 * s, 0], [0.07 * s, 0.03 * s, c[2] + 0.03 * s], TRIM),
      mk(P.CHEST, [0, -0.05 * s, c[2] * 0.5 + 0.034 * s], [0.2 * s, 0.11 * s, 0.022 * s], TRIM),
    ];
    if (police) {
      boxes.push(mk(P.CHEST, [0.07 * s, 0.07 * s, c[2] * 0.5 + 0.03 * s], [0.11 * s, 0.035 * s, 0.006 * s], 0xe9e9e4));
      boxes.push(mk(P.CHEST, [0, 0.04 * s, -(c[2] * 0.5 + 0.03 * s)], [0.24 * s, 0.06 * s, 0.006 * s], 0xe9e9e4));
    }
    this.vest = { boxes, hits: 0, police, lift: 0.03 * s };
  }
  removeVest() {
    if (!this.vest) return;
    for (const b of this.vest.boxes) this.game.boxes.release(b.idx);
    this.vest = null;
  }

  /* ---- the helmet: a black shell over the skull, open at the face ---- */

  wearHelmet() {
    if (this.helmet) return;
    const g = this.game, s = this.scale;
    const mk = (l, z, hex) => { const idx = g.boxes.alloc(); g.boxes.colorHex(idx, hex); return { idx, part: P.HEAD, l: [l[0] * s, l[1] * s, l[2] * s], z: [z[0] * s, z[1] * s, z[2] * s] }; };
    const BLACK = 0x121316, TRIM = 0x1d2024;
    this.helmet = {
      hits: 0, lift: 0.022 * s,
      boxes: [
        mk([0, 0.1, -0.006], [0.246, 0.085, 0.262], BLACK),            // crown
        mk([0, 0.03, -0.124], [0.246, 0.15, 0.03], BLACK),             // back, down to the nape
        mk([0.118, 0.035, -0.02], [0.022, 0.11, 0.2], BLACK), mk([-0.118, 0.035, -0.02], [0.022, 0.11, 0.2], BLACK),
        mk([0, 0.066, 0.138], [0.2, 0.02, 0.04], TRIM),                // a stub of a brim
        mk([0.112, -0.06, 0.03], [0.012, 0.1, 0.014], TRIM), mk([-0.112, -0.06, 0.03], [0.012, 0.1, 0.014], TRIM),
      ],
    };
  }
  removeHelmet() {
    if (!this.helmet) return;
    for (const b of this.helmet.boxes) this.game.boxes.release(b.idx);
    this.helmet = null;
  }

  /** Is a point on the head (in the head's own space) under the helmet? Everything but the face and the jaw. */
  _helmeted(lp, ln) {
    const s = this.scale;
    if (lp[1] < -0.035 * s) return false;
    return !(ln[2] > 0.5 && lp[1] < 0.05 * s);
  }

  /* ---- a taser ---- */

  /**
   * Current through the muscles for `secs`: every one of them contracts at
   * once, which is not something anybody stays standing through.
   */
  tase(secs, by = null) {
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
        m.note('felt', 'tased', `every muscle locked at once: a taser${seen ? ', fired by ' + m.name(by) : ''}`, 1, { attacker: by });
        m.stir('fear', 40); m.stir('surprise', 60); m.stir('anger', 12); m.stir('joy', -40);
        if (by && typeof by === 'object') { const k = m._know(by); k.hurtMe = true; k.hostile = 1; k.armed = 'taser'; if (!by.officer) { k.crime = Math.max(k.crime, Math.min(2.4, k.crime + 1.2)); k.crimeT = g.time; } if (seen) m._threaten(by, 78); }
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
    if (q === this._pallor) return;
    this._pallor = q;
    const base = rgb(this.look.skin), grey = rgb(0xb9bdb6), k = q / 10 * 0.72;
    const cr = lerp(base[0], grey[0], k), cg = lerp(base[1], grey[1], k), cb = lerp(base[2], grey[2], k);
    for (const i of this.skinParts) this.game.boxes.color(this.inst[i], cr, cg, cb);
    for (const hand of this.fingers) for (const i of hand) this.game.boxes.color(i, cr, cg, cb);
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
    const sp = this.speed / this.scale;
    let mx = 0, mz = 1;
    if (this.speed > 0.05) {
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      mz = (this.vx * s + this.vz * c) / this.speed;
      mx = (this.vx * c - this.vz * s) / this.speed;
    }
    const lm = Math.max(this.h.legLimp(1), this.h.legLimp(-1));
    const ch = this.anim.update(dt, {
      speed: sp, mx, mz, crouch: this.crouching ? 1 : 0, grounded: this.grounded || this.state !== ST.ANIM, vy: this.vy,
      hold: this.hold, aimPitch: this.aimPitch, lookYaw: this.lookYaw, lookPitch: this.lookPitch, pose: this.pose,
      limp: lm, limpSide: this.h.legLimp(1) >= this.h.legLimp(-1) ? 1 : -1, lowAim: this.lowAim,
      leanZ: this._leanZ || 0, leanX: this._leanX || 0,
      reach: this.swap ? this.swap.reach : null, reachW: this.swap ? this.swap.w : 0, reload: this._reloadState(),
    });
    channelsToLocal(ch, this.local);
    solvePose(x, y, z, yaw, this.scale, ch, this.local, this.pos, this.quat);
  }

  _snapshot() {
    for (let i = 0; i < PART_COUNT; i++) {
      const b = this.bodies[i];
      this.snapPos[i * 3] = b.px; this.snapPos[i * 3 + 1] = b.py; this.snapPos[i * 3 + 2] = b.pz;
      this.snapQuat[i * 4] = b.qx; this.snapQuat[i * 4 + 1] = b.qy; this.snapQuat[i * 4 + 2] = b.qz; this.snapQuat[i * 4 + 3] = b.qw;
    }
  }

  /** Puts the attached parts where the solved pose says, blending out of a snapshot if one is fading. */
  _apply(dt, w = 1) {
    const pos = this.pos, quat = this.quat, sp = this.snapPos, sq = this.snapQuat;
    for (let i = 0; i < PART_COUNT; i++) {
      if (!this.attached[i]) continue;
      const b = this.bodies[i], o = i * 3, k = i * 4;
      if (w >= 1) { b.setPose(pos[o], pos[o + 1], pos[o + 2], quat[k], quat[k + 1], quat[k + 2], quat[k + 3], dt); continue; }
      let ax = sq[k], ay = sq[k + 1], az = sq[k + 2], aw = sq[k + 3];
      if (ax * quat[k] + ay * quat[k + 1] + az * quat[k + 2] + aw * quat[k + 3] < 0) { ax = -ax; ay = -ay; az = -az; aw = -aw; }
      let qx = ax + (quat[k] - ax) * w, qy = ay + (quat[k + 1] - ay) * w, qz = az + (quat[k + 2] - az) * w, qw = aw + (quat[k + 3] - aw) * w;
      const n = 1 / Math.hypot(qx, qy, qz, qw);
      b.setPose(sp[o] + (pos[o] - sp[o]) * w, sp[o + 1] + (pos[o + 1] - sp[o + 1]) * w, sp[o + 2] + (pos[o + 2] - sp[o + 2]) * w, qx * n, qy * n, qz * n, qw * n, dt);
    }
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
    this._hAcc += dt;
    if (this._hAcc >= 0.1) { this._hAcc -= 0.1; this._healthTick(0.1); }
    this.talkT = Math.max(0, this.talkT - dt); this.scream = Math.max(0, this.scream - dt);
    this.guardT = Math.max(0, this.guardT - dt);
    this.tripCool = Math.max(0, this.tripCool - dt); this.jumpCool = Math.max(0, this.jumpCool - dt);
    for (let i = 0; i < PART_COUNT; i++) if (this.partCool[i] > 0) this.partCool[i] -= dt;
    if (!this.h.alive) this.deadFor += dt;
    this.pose.talk = this.talkT > 0 && this.h.conscious ? 1 : 0;

    if (this.state === ST.ANIM) this._animated(dt);
    else if (this.state === ST.STUMBLE) this._stumbling(dt);
    else if (this.state === ST.RAGDOLL) this._ragdolling(dt);
    else this._gettingUp(dt);
  }

  _healthTick(dt) {
    const h = this.h, emo = this.mind ? this.mind.emo : null;
    const moving = this.state === ST.ANIM ? clamp01(this.speed / RUN) : 0;
    h.tick(dt, { fear: emo ? emo.fear : 0, anger: emo ? emo.anger : 0, moving });
    this._tone();
    for (const ev of h.events) {
      if (ev === 'death') this._died();
      else if (ev === 'out' || ev === 'faint') { if (this.state !== ST.RAGDOLL) this.toRagdoll(); this.mind?.note('felt', 'blackout', 'everything went dark', 1); }
      else if (ev === 'vomit') this.game.gore.vomit(this);
      else if (ev === 'wake') this.mind?.note('felt', 'wake', 'came round on the ground', 0.8);
    }
    if (this.state === ST.ANIM && !h.canStand) this.toRagdoll();
    this.pose.hurt = h.conscious ? clamp01((h.pain - 28) / 50) * (this.state === ST.ANIM ? 1 : 0) : 0;
    this._tintSkin();
  }

  _died() {
    if (this.state !== ST.RAGDOLL) this.toRagdoll();
    this._relax();
    this.island.canSleep = true;
    this.talkT = 0; this.scream = 0;
    this.game.onDeath?.(this);
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
    let tvx = 0, tvz = 0;
    if (mag > 0.01) { tvx = it.mx / mag * top; tvz = it.mz / mag * top; }
    if (this.cuffing) {
      const ct = this.cuffing.target, cdx = ct.x - this.x, cdz = ct.z - this.z, cd = Math.hypot(cdx, cdz);
      if (cd > 0.95) { tvx = cdx / cd * 1.7; tvz = cdz / cd * 1.7; }
    }
    const acc = this.grounded ? 11 : 4;
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

    // which way to face
    let face = it.face;
    if (this.cuffing) { const ct = this.cuffing.target; face = Math.atan2(ct.x - this.x, ct.z - this.z); }
    if (face == null && this.speed > 0.25) face = Math.atan2(this.vx, this.vz);
    if (face != null) this.yaw = turnToward(this.yaw, face, (it.face != null ? 13 : 9) * dt);

    // up and down
    if (it.jump && this.grounded && this.jumpCool <= 0 && h.legOk(1) && h.legOk(-1) && !this.anim.busy && !this.cuffing) {
      this.vy = JUMP_V * lerp(0.6, 1, mob); this.grounded = false; this.jumpCool = 0.35;
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
    this.x = nx; this.z = nz; this.y = ny;

    // hands come up for a while after a fight starts
    this.hold = this.weaponHold();
    this._solve(dt);
    if (this.blendDur > 0) {
      this.blend += dt;
      const w = smooth(this.blend / this.blendDur);
      this._apply(dt, w);
      if (w >= 1) this.blendDur = 0;
    } else this._apply(dt);
    this._trip();
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
      if (closing > 2.2) { this.x = nx; this.z = nz; this.struckByCar(car, closing); return [nx, nz]; }
    }
    // other people on their feet
    for (const o of g.humans) {
      if (o === this || o.state !== ST.ANIM || o.removed) continue;
      const dx = nx - o.x, dz = nz - o.z;
      const rr = (R + RADIUS * o.scale / 0.93) * 0.92;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || Math.abs(ny - o.y) > 1.5) continue;
      const d = Math.sqrt(d2) || 0.001;
      const push = (rr - d) * (this.isPlayer ? 0.35 : o.isPlayer ? 0.9 : 0.5);
      nx += dx / d * push; nz += dz / d * push;
      // barging into someone at a run knocks them about
      if (this.speed > 3.6 && !o.isPlayer && (this.vx * -dx + this.vz * -dz) / d > 3 && o.tripCool <= 0) {
        o.tripCool = 1.5;
        o.shove(this.vx * 0.5, this.vz * 0.5, 34, this);
      }
    }
    const lim = LIMIT - R;
    nx = clamp(nx, -lim, lim); nz = clamp(nz, -lim, lim);
    _a[0] = nx; _a[1] = nz;
    return _a;
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
    if (this.state === ST.RAGDOLL || this.removed) return;
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
    for (let i = 0; i < PART_COUNT; i++) if (this.attached[i]) this.bodies[i].setKinematic(false);
    this.island.mover = false;
    this.island.wake();
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
    this.y = groundHeight(this.x, this.z);
    this.balance = 1;
  }

  /* ---- down ---- */

  toRagdoll() {
    if (this.state === ST.RAGDOLL || this.removed) return;
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
      if (this.isPlayer || h.pain < 70 || this.stillT > 4) { this.startGetUp(); return; }
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
    this.vx = this.vz = this.vy = 0; this.speed = 0;
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
    this._solve(dt);
    this._apply(dt, smooth(u / 0.5));
    if (u >= 1) { this.state = ST.ANIM; this.pose.kneel = 0; this.blendDur = 0; this.balance = 1; }
  }

  /* ----------------------------- after physics ---------------------------- */

  late(dt) {
    if (this.removed) return;
    const g = this.game;
    // knocks taken from the world: the ground, a crate, a bumper
    for (let i = 0; i < PART_COUNT; i++) {
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
      const power = clamp((speed - 3.6) / 5.2, 0, 3.4) * heavy * (i === P.HEAD ? (this.helmet ? 0.5 : 1.25) : 1);
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
    if (this.state === ST.ANIM || this.state === ST.GETUP) { /* root is ours */ }
    this._faceT += dt;
    if (this._faceT > 0.12) { this._expression(this._faceT); this._faceT = 0; }
    this._hands(dt);
    this._draw();
    // pieces that have lain about long enough are cleared away by the game
    for (const p of this.pieces) p.age += dt;
  }

  _draw() {
    const g = this.game, bx = g.boxes;
    for (let i = 0; i < PART_COUNT; i++) {
      if (this.gone[i]) continue;
      if (i === P.HAND_L || i === P.HAND_R) continue;
      const b = this.bodies[i], s = this.sizes[i];
      bx.set(this.inst[i], b.px, b.py, b.pz, b.qx, b.qy, b.qz, b.qw, s[0], s[1], s[2]);
    }
    this._drawHand(P.HAND_L, 0, -1);
    this._drawHand(P.HAND_R, 1, 1);
    if (this.vest) for (const v of this.vest.boxes) {
      if (this.gone[v.part]) { bx.hide(v.idx); continue; }
      const b = this.bodies[v.part];
      bx.setOn(v.idx, b.px, b.py, b.pz, b.qx, b.qy, b.qz, b.qw, v.l[0], v.l[1], v.l[2], v.z[0], v.z[1], v.z[2]);
    }
    const hide = this.gone[P.HEAD] || (this.isPlayer && g.firstPerson && this.attached[P.HEAD]);
    const hd = this.bodies[P.HEAD];
    const lid = this.helmet ? 0.085 * this.scale : 9;
    if (this.helmet) for (const v of this.helmet.boxes) {
      if (hide) { bx.hide(v.idx); continue; }
      bx.setOn(v.idx, hd.px, hd.py, hd.pz, hd.qx, hd.qy, hd.qz, hd.qw, v.l[0], v.l[1], v.l[2], v.z[0], v.z[1], v.z[2]);
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
      const cf = hnd === 1 && f === 0 ? this.trigger : c * fl[3];
      const a1 = palm * cf * 1.38, a2 = a1 + palm * cf * 1.5;
      const l1 = fl[1] * s, l2 = fl[2] * s, z0 = fl[0] * s, w = 0.0195 * s, fan = sp * FAN[f];
      const s1 = Math.sin(a1), c1 = Math.cos(a1), s2 = Math.sin(a2), c2 = Math.cos(a2);
      // a little fan when the hand is spread: each finger leans away from the middle one
      _fq[0] = 0; _fq[1] = 0; _fq[2] = Math.sin(a1 / 2); _fq[3] = Math.cos(a1 / 2);
      bx.setOn(idx[f * 2], px, py, pz, qx, qy, qz, qw, s1 * l1 * 0.5, knuckle - c1 * l1 * 0.5, z0 + fan * l1 * 0.5, 0.021 * s, l1, w, _fq);
      const ex = s1 * l1, ey = knuckle - c1 * l1, ez = z0 + fan * l1;
      _fq[2] = Math.sin(a2 / 2); _fq[3] = Math.cos(a2 / 2);
      bx.setOn(idx[f * 2 + 1], px, py, pz, qx, qy, qz, qw, ex + s2 * l2 * 0.5, ey - c2 * l2 * 0.5, ez + fan * l2 * 0.5, 0.019 * s, l2, w * 0.92, _fq);
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
    const { part } = info, g = this.game;
    let type = info.type, power = info.power, hp = info.hp, stopped = false;
    const b = this.bodies[part];
    if (this.gone[part]) return null;
    if (this.vest && this.attached[part] && (part === P.CHEST || part === P.ABDOMEN)) {
      // a light vest: stops a pistol round and a slash, slows a rifle round and a point
      const was = type;
      if (type === 'bullet') { if (info.weapon === 'ak47') { power *= 0.7; if (hp) hp *= 0.7; } else { type = 'blunt'; power *= 0.6; stopped = true; } }
      else if (type === 'cut') { type = 'blunt'; power *= 0.3; stopped = true; }
      else if (type === 'stab') power *= 0.45;
      else if (type === 'blunt') power *= 0.8;
      this.vest.hits++;
      this.vestHit = { was, stopped, t: g.time };
    }
    let armour = stopped ? 'vest' : '';
    if (this.helmet && part === P.HEAD && this.attached[part]) {
      b.toLocal(info.point[0], info.point[1], info.point[2], _a);
      const n0 = info.normal || faceOf([_a[0] / b.hx, _a[1] / b.hy, _a[2] / b.hz]);
      if (this._helmeted(_a, n0)) {
        // a light helmet: turns a blow and a slash, turns some pistol rounds, takes a little off a rifle round
        if (type === 'bullet') { if (info.weapon === 'ak47') { power *= 0.9; } else if (chance(0.6)) { type = 'blunt'; power *= 0.8; stopped = true; } else { power *= 0.8; if (hp) hp *= 0.8; } }
        else if (type === 'cut') { type = 'blunt'; power *= 0.35; stopped = true; }
        else if (type === 'stab') power *= 0.5;
        else power *= 0.4;
        this.helmet.hits++;
        if (stopped) armour = 'helmet';
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
    const rep = this.h.hit({ part, type, power, lp, ln, ld, through: info.through, chop: info.chop, hp, weapon: info.weapon });
    rep.wasAlive = wasAlive;
    rep.stopped = stopped;
    if (stopped) {
      // what the vest took shows on the vest
      g.gore.mark(this, part, info.type === 'bullet' ? 'entry' : 'slash', lp, ln, info.type === 'bullet' ? 0.045 : 0.09, armour === 'helmet' ? this.helmet.lift : this.vest.lift);
      g.gore.puff('smoke', info.point[0], info.point[1], info.point[2], 0.16, 0.35, 0.3, 0.3, 0.3);
    }
    this.lastAttacker = info.attacker || this.lastAttacker;
    if (rep.wound) g.gore.wound(this, rep.wound);
    if (rep.exit) {
      g.gore.wound(this, rep.exit);
      b.toWorld(rep.exit.x, rep.exit.y, rep.exit.z, _a);
      g.gore.burst(_a[0], _a[1], _a[2], info.dir[0], info.dir[1] + 0.15, info.dir[2], 16, 5.5, 0.35);
      g.gore.mist(_a[0], _a[1], _a[2], info.dir[0], info.dir[1] + 0.1, info.dir[2], 34, 7.5, 0.5);
    }
    // what comes out of the wound, back the way the blow came
    const spray = this.h.god ? 0 : type === 'bullet' ? 9 : type === 'blunt' ? (power > 0.9 && part === P.HEAD ? 6 : 0) : type === 'stab' ? 10 : 12 + power * 5;
    if (spray > 0) g.gore.burst(info.point[0], info.point[1], info.point[2], -info.dir[0] * 0.6, 0.5, -info.dir[2] * 0.6, spray, type === 'cut' ? 3.4 : 2.6, 0.7);
    if (this.h.god) { /* not a mark on them */ }
    else if (type === 'bullet') g.gore.mist(info.point[0], info.point[1], info.point[2], -info.dir[0], 0.25, -info.dir[2], 12, 3.2, 0.8);
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
    let firm = (this.crouching ? 1.35 : 1) * (0.55 + 0.45 * h.mobility) * (this.isPlayer ? 1.25 : 1) * (this.speed > 3.5 ? 0.8 : 1);
    if (this.state === ST.GETUP) firm *= 0.5;
    if (part === P.HEAD) force *= 1.2;
    if (part >= P.THIGH_L) force *= 1.15;
    if (!h.alive || !h.conscious || !h.canStand || (rep && rep.ko) || force > 66 * firm) { this.toRagdoll(); return; }
    if (force > 25 * firm) { this.toStumble(force / firm, dx * force * 0.012, dz * force * 0.012); return; }
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.anim.kick(dx * c - dz * s, dx * s + dz * c, force / 36);
    this.guardT = 4;
  }

  /** A push with no wound: being barged, or shoved. */
  shove(vx, vz, force, by) {
    if (this.state !== ST.ANIM) return;
    this.mind?.note('felt', 'shove', by ? 'was barged into by ' + (by.isPlayer ? 'the stranger' : 'someone') : 'was shoved', 0.5, { by });
    this.toStumble(force, vx, vz);
  }

  struckByCar(car, closing) {
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
    g.gore.gibs(b.px, b.py, b.pz, vel, this.sizes[part], this.look.skin, this.clothed[part] ? partCloth(this.look, part) : this.look.skin);
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
    this.state = ST.ANIM; this.balance = 1; this.blendDur = 0;
    for (const k in this.pose) this.pose[k] = 0;
    for (let i = 0; i < PART_COUNT; i++) if (this.attached[i]) { this.bodies[i].setKinematic(true); this.bodies[i].orient = null; }
    this.island.mover = true;
    this._solve(0); this._apply(0);
  }

  remove() {
    if (this.removed) return;
    this.removed = true;
    const g = this.game;
    if (this.isPlayer) g.weapons?.dropFrom(this); else g.weapons?.forget(this);
    this.removeVest(); this.removeHelmet();
    for (const p of this.pieces.slice()) this.dropPiece(p.island);
    for (const j of this.joints) if (j.enabled) { j.enabled = false; g.world.removeJoint(j); }
    g.world.removeIsland(this.island);
    for (const i of this.inst) g.boxes.release(i);
    for (const h of this.hair) g.boxes.release(h.idx);
    for (const hand of this.fingers) for (const i of hand) g.boxes.release(i);
    g.faceQuads.release(this.faceQuad); g.faces.release(this.faceCell);
    g.gore.clearHuman(this);
  }
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

/** A rotation that lays a body on its front, head toward `yaw`. */
function faceDown(yaw, o) {
  // pitch forward a quarter turn about X, then turn to face
  const sx = Math.SQRT1_2, cx = Math.SQRT1_2, sy = Math.sin(yaw * 0.5), cy = Math.cos(yaw * 0.5);
  o.x = cy * sx; o.y = sy * cx; o.z = -sy * sx; o.w = cy * cx;
}
