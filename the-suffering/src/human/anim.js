/* =============================================================================
   Animation, all of it procedural.

   Walking and running are not keyframes: each foot follows a path over the
   ground and a two bone solver bends the leg to put it there, so the feet
   stay where they are planted at any speed and in any direction. On top of
   that go the ways of carrying things, the reflexes (cowering, hands up,
   doubling over), and the attack clips, which are short keyframed overrides
   of a handful of channels.

   The output is the forty channel pose from rig.js.
   ========================================================================== */
import { CH, CHANNELS, legIK, HIP_HEIGHT } from './rig.js';
import { SWINGS } from './swings.js';
import { clamp, clamp01, lerp, smooth, damp, TAU } from '../core/util.js';

const WALK = { stride: 0.82, stance: 0.62, lift: 0.085, bob: 0.02, lean: 0.035, arm: 0.36, elbow: 0.2, drop: 0.022, twist: 0.07, pitch: 1 };
const RUN = { stride: 1.1, stance: 0.38, lift: 0.27, bob: 0.05, lean: 0.25, arm: 0.95, elbow: 1.45, drop: 0.075, twist: 0.12, pitch: 0.5 };
const ANKLE = 0.08;

/* ------------------------------ attack clips ------------------------------ */

const GUARD = {
  shL: 0.62, shLOut: 0.24, shLIn: 0.34, elL: 2.0, shR: 0.56, shROut: 0.26, shRIn: 0.3, elR: 2.02,
  spineTwist: 0, waistTwist: 0, spineBend: 0.08, rootZ: 0, rootY: 0,
};
const k = (t, o) => ({ t, o });
/** How a blade is carried when nothing is happening. */
const CARRY = SWINGS.rest[0][1];
const swing = (name) => [k(0, CARRY), ...SWINGS[name].map(([t, o]) => k(t, o)), k(1, CARRY)];

/**
 * Each clip: how long it lasts, when during it the blow can land (as a
 * fraction), which part does the hitting, how far the attacker steps in,
 * and keyframes for the channels it takes over.
 */
export const CLIPS = {
  /* ---- unarmed ---- */
  jab: {
    label: 'JAB', dur: 0.34, hit: [0.2, 0.55], limb: 'handL', lunge: 0.1, reach: 0.8, power: 0.5, kind: 'blunt',
    keys: [k(0, GUARD), k(0.4, { ...GUARD, shL: 1.78, shLOut: 0.06, shLIn: -0.06, elL: 0.06, spineTwist: -0.3, waistTwist: -0.12, spineBend: 0.12, rootZ: 0.1 }), k(0.56, { ...GUARD, shL: 1.74, shLOut: 0.06, shLIn: -0.06, elL: 0.1, spineTwist: -0.28, waistTwist: -0.12, spineBend: 0.12, rootZ: 0.1 }), k(1, GUARD)],
  },
  cross: {
    label: 'CROSS', dur: 0.44, hit: [0.26, 0.58], limb: 'handR', lunge: 0.16, reach: 0.82, power: 0.95, kind: 'blunt',
    keys: [k(0, GUARD), k(0.2, { ...GUARD, shR: 0.4, elR: 2.1, spineTwist: -0.2 }), k(0.46, { ...GUARD, shR: 1.8, shROut: 0.1, shRIn: -0.22, elR: 0.05, spineTwist: 0.34, waistTwist: 0.14, spineBend: 0.16, rootZ: 0.14 }), k(0.6, { ...GUARD, shR: 1.76, shROut: 0.1, shRIn: -0.22, elR: 0.1, spineTwist: 0.32, waistTwist: 0.14, spineBend: 0.16, rootZ: 0.14 }), k(1, GUARD)],
  },
  uppercut: {
    label: 'UPPERCUT', dur: 0.52, hit: [0.3, 0.6], limb: 'handR', lunge: 0.2, reach: 0.66, power: 1.15, kind: 'blunt', up: true,
    keys: [k(0, GUARD), k(0.26, { ...GUARD, shR: 0.12, shROut: 0.12, shRIn: 0.1, elR: 1.75, spineTwist: -0.3, spineBend: 0.26, rootY: -0.13 }), k(0.5, { ...GUARD, shR: 1.2, shROut: 0.05, shRIn: 0.3, elR: 1.2, spineTwist: 0.38, spineBend: -0.1, rootY: 0.02, rootZ: 0.12 }), k(0.64, { ...GUARD, shR: 1.42, shROut: 0.05, shRIn: 0.3, elR: 1.25, spineTwist: 0.4, spineBend: -0.14, rootY: 0.03, rootZ: 0.12 }), k(1, GUARD)],
  },
  kick: {
    label: 'KICK', dur: 0.62, hit: [0.34, 0.62], limb: 'footR', lunge: 0.12, reach: 1.0, power: 1.25, kind: 'blunt', push: true,
    keys: [
      k(0, { ...GUARD, hipR: 0, kneeR: 0.05, ankleR: 0, hipL: 0, kneeL: 0.05, ankleL: 0, rootPitch: 0 }),
      k(0.3, { ...GUARD, shLOut: 0.7, shROut: 0.7, hipR: 1.3, kneeR: 1.9, ankleR: 0.3, hipL: -0.1, kneeL: 0.12, ankleL: 0, rootPitch: -0.1, rootZ: 0.04 }),
      k(0.48, { ...GUARD, shLOut: 0.9, shROut: 0.9, elL: 1.2, elR: 1.2, hipR: 1.36, kneeR: 0.06, ankleR: 0.2, hipL: -0.22, kneeL: 0.1, ankleL: -0.02, rootPitch: -0.22, spineBend: 0.3, rootZ: 0.12 }),
      k(0.62, { ...GUARD, shLOut: 0.9, shROut: 0.9, elL: 1.2, elR: 1.2, hipR: 1.32, kneeR: 0.1, ankleR: 0.2, hipL: -0.2, kneeL: 0.1, ankleL: -0.02, rootPitch: -0.2, spineBend: 0.3, rootZ: 0.12 }),
      k(0.8, { ...GUARD, hipR: 1.0, kneeR: 1.5, ankleR: 0, hipL: -0.06, kneeL: 0.1, ankleL: 0, rootPitch: -0.06 }),
      k(1, { ...GUARD, hipR: 0, kneeR: 0.05, ankleR: 0, hipL: 0, kneeL: 0.05, ankleL: 0, rootPitch: 0 }),
    ],
  },

  /* ---- knife. These, and the machete's, are solved from hand positions by
     tools/pose-solve.mjs: the carry, the swing, and back to the carry ---- */
  slash: { label: 'SLASH', dur: 0.4, hit: [0.22, 0.62], limb: 'blade', lunge: 0.14, reach: 0.9, power: 1.0, kind: 'cut', keys: swing('slash') },
  backslash: { label: 'BACKHAND', dur: 0.4, hit: [0.22, 0.62], limb: 'blade', lunge: 0.14, reach: 0.9, power: 1.0, kind: 'cut', keys: swing('backslash') },
  stab: { label: 'STAB', dur: 0.42, hit: [0.3, 0.6], limb: 'blade', lunge: 0.22, reach: 1.0, power: 1.15, kind: 'stab', keys: swing('stab') },
  overhand: { label: 'PLUNGE', dur: 0.5, hit: [0.34, 0.68], limb: 'blade', lunge: 0.2, reach: 0.86, power: 1.4, kind: 'stab', reverse: true, down: true, keys: swing('overhand') },

  /* ---- machete ---- */
  chop: { label: 'CHOP', dur: 0.5, hit: [0.3, 0.64], limb: 'blade', lunge: 0.18, reach: 1.12, power: 1.9, kind: 'cut', chop: 1, keys: swing('chop') },
  backhand: { label: 'BACKHAND', dur: 0.5, hit: [0.3, 0.64], limb: 'blade', lunge: 0.18, reach: 1.12, power: 1.8, kind: 'cut', chop: 1, keys: swing('backhand') },
  cleave: { label: 'CLEAVE', dur: 0.6, hit: [0.36, 0.7], limb: 'blade', lunge: 0.2, reach: 1.2, power: 2.3, kind: 'cut', chop: 1.15, down: true, keys: swing('cleave') },
  sweep: { label: 'SWEEP', dur: 0.56, hit: [0.26, 0.66], limb: 'blade', lunge: 0.16, reach: 1.18, power: 2.1, kind: 'cut', chop: 1.25, level: true, keys: swing('sweep') },
};

/** The four attacks each way of fighting has, in combo order. */
export const MOVES = {
  fists: ['jab', 'cross', 'uppercut', 'kick'],
  knife: ['slash', 'backslash', 'stab', 'overhand'],
  machete: ['chop', 'backhand', 'cleave', 'sweep'],
};

// keyframes are written with channel names; turn them into indices once
for (const name in CLIPS) {
  const c = CLIPS[name];
  const set = new Set();
  for (const key of c.keys) for (const n in key.o) set.add(n);
  c.channels = [...set].map((n) => CH[n]);
  c.names = [...set];
  for (const key of c.keys) key.v = c.names.map((n) => key.o[n] ?? 0);
}

const _leg = [0, 0, 0];

export class Animator {
  constructor() {
    this.ch = new Float32Array(CHANNELS);
    this.t = Math.random() * 10;
    this.phase = Math.random();
    this.run = 0; this.moving = 0; this.crouch = 0; this.air = 0; this.land = 0;
    this.w = { guard: 0, blade: 0, pistol: 0, rifle: 0, cower: 0, handsUp: 0, hurt: 0, talk: 0, stagger: 0, writhe: 0, crawl: 0, brace: 0, phone: 0, kneel: 0 };
    this.action = null;
    this.flinch = 0; this.flX = 0; this.flZ = 0;
    this.aim = 0; this.lookYaw = 0; this.lookPitch = 0;
    this.recoil = 0;
    this.limp = 0; this.limpSide = 1;
    this.lowAim = 0;
  }

  /** Starts an attack clip. Returns false if one is already in its swing. */
  play(name) {
    const clip = CLIPS[name];
    if (!clip) return false;
    this.action = { clip, name, t: 0, hitDone: false };
    return true;
  }
  get busy() { return !!this.action && this.action.t < this.action.clip.dur * 0.82; }
  /** Is the current attack in the part of the swing that can land? */
  get striking() {
    const a = this.action;
    if (!a) return false;
    const u = a.t / a.clip.dur;
    return u >= a.clip.hit[0] && u <= a.clip.hit[1];
  }
  kick(dx, dz, amount) { this.flinch = Math.min(1.4, this.flinch + amount); this.flX = dx; this.flZ = dz; }

  /**
   * @param {object} s
   *   speed        ground speed, metres a second, as if the person were full height
   *   mx, mz       which way they are moving relative to the way they face (unit)
   *   crouch       0 or 1
   *   grounded, vy
   *   hold         'none' | 'guard' | 'blade' | 'pistol' | 'rifle'
   *   aimPitch     radians, up positive
   *   lookYaw, lookPitch   where the head wants to turn, relative to the body
   *   pose         { cower, handsUp, hurt, talk, stagger, writhe, crawl, brace, phone, kneel } 0..1 each
   *   limp, limpSide
   */
  update(dt, s) {
    const ch = this.ch;
    ch.fill(0);
    this.t += dt;
    const t = this.t;
    const pose = s.pose || {};
    for (const n in this.w) {
      const target = n === s.hold ? 1 : (pose[n] || 0);
      this.w[n] = damp(this.w[n], target, n === 'cower' || n === 'handsUp' ? 9 : 11, dt);
    }
    const W = this.w;
    const crouchT = Math.max(s.crouch || 0, W.cower, W.kneel);
    this.crouch = damp(this.crouch, crouchT, 9, dt);
    this.run = damp(this.run, smooth((s.speed - 2.3) / 1.9), 8, dt);
    this.moving = damp(this.moving, s.speed > 0.12 ? 1 : 0, 10, dt);
    this.air = damp(this.air, s.grounded ? 0 : 1, s.grounded ? 16 : 8, dt);
    this.land = Math.max(0, this.land - dt * 4);
    this.flinch = Math.max(0, this.flinch - dt * 4.5);
    this.recoil = Math.max(0, this.recoil - dt * 9);
    this.limp = damp(this.limp, s.limp || 0, 4, dt);
    if (s.limp) this.limpSide = s.limpSide;
    this.lowAim = damp(this.lowAim, s.lowAim || 0, 12, dt);
    this.aim = damp(this.aim, s.aimPitch || 0, 14, dt);
    this.lookYaw = damp(this.lookYaw, clamp(s.lookYaw || 0, -1.25, 1.25), 7, dt);
    this.lookPitch = damp(this.lookPitch, clamp(s.lookPitch || 0, -0.7, 0.7), 7, dt);

    const g = this.run, m = this.moving, cr = this.crouch;
    const lim = this.limp;
    const stride = lerp(WALK.stride, RUN.stride, g) * (1 - 0.34 * cr) * (1 - 0.3 * lim);
    const stance = lerp(WALK.stance, RUN.stance, g);
    if (s.speed > 0.05) this.phase = (this.phase + (s.speed / (stride / stance)) * dt) % 1;
    const ph = this.phase;
    const swing = Math.cos(TAU * ph);
    const mx = s.mx || 0, mz = s.speed > 0.05 ? (s.mz ?? 1) : 1;

    /* ---- the pelvis ---- */
    const liftAmp = lerp(WALK.lift, RUN.lift, g);
    const bob = lerp(WALK.bob, RUN.bob, g) * m;
    const drop = lerp(WALK.drop, RUN.drop, g) * m + cr * 0.37 + this.land * 0.16 + this.lowAim * 0.2;
    let rootY = -drop + bob * Math.cos(2 * TAU * ph + 0.6);
    // an injured leg takes less weight: the hips dip toward it while it is down
    const limpDip = lim * m * Math.max(0, Math.sin(TAU * (ph + (this.limpSide > 0 ? 0 : 0.5)) + 0.6));
    rootY -= limpDip * 0.05;
    ch[CH.rootY] = rootY;
    ch[CH.rootX] = (0.016 * Math.sin(TAU * ph) * m + 0.008 * Math.sin(t * 0.6) * (1 - m));
    const tw = lerp(WALK.twist, RUN.twist, g) * m * mz;
    ch[CH.rootYaw] = -tw * swing;
    ch[CH.rootRoll] = 0.03 * Math.sin(TAU * ph) * m + limpDip * 0.12 * this.limpSide;

    /* ---- the legs ---- */
    const pitchAmt = lerp(WALK.pitch, RUN.pitch, g) * m * Math.max(0, mz);
    for (let side = 1; side >= -1; side -= 2) {
      const p = (ph + (side > 0 ? 0 : 0.5)) % 1;
      let f, lift, pitch;
      if (p < stance) { const u = p / stance; f = 0.5 - u; lift = 0; pitch = lerp(-0.24, 0.42, u * u); }
      else { const u = (p - stance) / (1 - stance); f = -0.5 + smooth(u); lift = Math.sin(Math.PI * u); pitch = lerp(0.42, -0.24, smooth(u)); }
      const reach = f * stride * m * (side === this.limpSide ? 1 - lim * 0.35 : 1);
      const fx = mx * reach, fz = mz * reach - ch[CH.rootZ];
      const down = HIP_HEIGHT + rootY - ANKLE - lift * liftAmp * m - (side > 0 ? 1 : -1) * ch[CH.rootRoll] * 0.1;
      legIK(_leg, fx * side + cr * 0.03, down, fz);
      const hip = side > 0 ? CH.hipL : CH.hipR;
      ch[hip] = _leg[0]; ch[hip + 1] = _leg[1]; ch[hip + 3] = _leg[2];
      ch[hip + 4] = clamp((_leg[2] - _leg[0]) - pitch * pitchAmt, -0.8, 0.5);
      ch[hip + 2] = cr * 0.12;
    }

    /* ---- the trunk and arms ---- */
    const lean = lerp(WALK.lean, RUN.lean, g) * m * mz;
    const breathe = Math.sin(t * 1.5);
    ch[CH.waistBend] = lean * 0.45 + cr * 0.2 + this.lowAim * 0.4;
    ch[CH.spineBend] = lean * 0.55 + cr * 0.16 + 0.012 * breathe + this.lowAim * 0.34;
    ch[CH.spineTwist] = tw * 1.7 * swing;
    ch[CH.neckBend] = -(lean * 0.5 + cr * 0.2 + this.lowAim * 0.2);
    ch[CH.headBend] = -(lean * 0.2 + cr * 0.1);
    const arm = lerp(WALK.arm, RUN.arm, g) * m * (0.4 + 0.6 * Math.abs(mz));
    const elbow = lerp(WALK.elbow, RUN.elbow, g) * m + 0.12 + cr * 0.5;
    ch[CH.shL] = -arm * swing + cr * 0.25; ch[CH.shR] = arm * swing + cr * 0.25;
    ch[CH.shLOut] = 0.07 + 0.05 * g + 0.012 * breathe; ch[CH.shROut] = 0.07 + 0.05 * g + 0.012 * breathe;
    ch[CH.elL] = elbow + Math.max(0, -swing) * 0.28 * m; ch[CH.elR] = elbow + Math.max(0, swing) * 0.28 * m;

    /* ---- off the ground ---- */
    if (this.air > 0.01) {
      const a = this.air, up = clamp01(0.5 + (s.vy || 0) * 0.2);
      this._to(CH.hipL, lerp(0.35, 0.75, up), a); this._to(CH.kneeL, lerp(0.7, 1.25, up), a); this._to(CH.ankleL, -0.35, a);
      this._to(CH.hipR, lerp(0.1, 0.4, up), a); this._to(CH.kneeR, lerp(0.5, 0.9, up), a); this._to(CH.ankleR, -0.35, a);
      this._to(CH.hipLOut, 0.08, a); this._to(CH.hipROut, 0.08, a);
      this._to(CH.shL, lerp(0.2, 0.9, up), a); this._to(CH.shR, lerp(0.2, 0.9, up), a);
      this._to(CH.shLOut, 0.6, a); this._to(CH.shROut, 0.6, a); this._to(CH.elL, 0.7, a); this._to(CH.elR, 0.7, a);
      this._to(CH.rootY, -0.02, a); this._to(CH.spineBend, 0.1, a);
    }

    /* ---- ways of holding things ---- */
    if (W.guard > 0.01) {
      const a = W.guard * (1 - g * 0.6);
      this._to(CH.shL, GUARD.shL, a); this._to(CH.shLOut, GUARD.shLOut, a); this._to(CH.shLIn, GUARD.shLIn, a); this._to(CH.elL, GUARD.elL, a);
      this._to(CH.shR, GUARD.shR, a); this._to(CH.shROut, GUARD.shROut, a); this._to(CH.shRIn, GUARD.shRIn, a); this._to(CH.elR, GUARD.elR, a);
    }
    if (W.blade > 0.01) {
      const a = W.blade * (1 - g * 0.5);
      this._to(CH.shR, CARRY.shR, a); this._to(CH.shROut, CARRY.shROut, a); this._to(CH.shRIn, CARRY.shRIn, a); this._to(CH.elR, CARRY.elR, a);
      this._to(CH.wrR, CARRY.wrR, a); this._to(CH.wrRSide, CARRY.wrRSide, a);
      this._to(CH.shL, 0.5, a * 0.7); this._to(CH.elL, 1.5, a * 0.7); this._to(CH.shLIn, 0.3, a * 0.7);
    }
    const up = this.aim;
    if (W.pistol > 0.01) {
      const a = W.pistol;
      this._to(CH.shR, 1.5 + up * 0.92, a); this._to(CH.shROut, 0.04, a); this._to(CH.shRIn, 0.2, a); this._to(CH.elR, 0.12 + this.recoil * 0.5, a); this._to(CH.wrR, this.recoil * 0.5, a);
      this._to(CH.shL, 1.36 + up * 0.9, a); this._to(CH.shLOut, 0.02, a); this._to(CH.shLIn, 0.52, a); this._to(CH.elL, 0.55, a);
      ch[CH.spineTwist] += 0.12 * a;
    }
    if (W.rifle > 0.01) {
      const a = W.rifle;
      this._to(CH.shR, 0.7 + up * 0.75, a); this._to(CH.shROut, 0.22, a); this._to(CH.shRIn, 0.2, a); this._to(CH.elR, 1.55 - up * 0.2, a);
      this._to(CH.shL, 1.12 + up * 0.85, a); this._to(CH.shLOut, 0.05, a); this._to(CH.shLIn, 0.78, a); this._to(CH.elL, 0.72, a);
      ch[CH.spineTwist] += -0.32 * a; ch[CH.neckTwist] += 0.22 * a; ch[CH.spineBend] += 0.06 * a;
    }
    if (W.pistol + W.rifle > 0.01) {
      const a = Math.min(1, W.pistol + W.rifle);
      ch[CH.spineBend] -= up * 0.2 * a; ch[CH.neckBend] -= up * 0.3 * a; ch[CH.headBend] -= up * 0.2 * a;
      ch[CH.spineBend] -= this.recoil * 0.05 * a;
    }

    /* ---- states of mind ---- */
    if (W.cower > 0.01) {
      const a = W.cower, sh = Math.sin(t * 31) * 0.025;
      this._to(CH.shL, 2.35 + sh, a); this._to(CH.shR, 2.35 - sh, a); this._to(CH.shLOut, 0.35, a); this._to(CH.shROut, 0.35, a);
      this._to(CH.shLIn, 0.3, a); this._to(CH.shRIn, 0.3, a); this._to(CH.elL, 2.15, a); this._to(CH.elR, 2.15, a);
      this._to(CH.spineBend, 0.55, a); this._to(CH.waistBend, 0.4, a); this._to(CH.headBend, 0.42, a); this._to(CH.neckBend, 0.2, a);
    }
    if (W.handsUp > 0.01) {
      const a = W.handsUp, sh = Math.sin(t * 27) * 0.02;
      this._to(CH.shL, 2.2 + sh, a); this._to(CH.shR, 2.2 - sh, a); this._to(CH.shLOut, 0.75, a); this._to(CH.shROut, 0.75, a);
      this._to(CH.elL, 1.05, a); this._to(CH.elR, 1.05, a); this._to(CH.shLIn, 0, a); this._to(CH.shRIn, 0, a);
    }
    if (W.hurt > 0.01) {
      // doubled over, one arm across the belly
      const a = W.hurt;
      ch[CH.spineBend] += 0.34 * a; ch[CH.waistBend] += 0.16 * a; ch[CH.headBend] += 0.16 * a;
      this._to(CH.shR, 0.55, a * 0.85); this._to(CH.shRIn, 0.85, a * 0.85); this._to(CH.elR, 1.75, a * 0.85); this._to(CH.shROut, 0.2, a * 0.85);
    }
    if (W.phone > 0.01) {
      const a = W.phone * (1 - m);
      this._to(CH.shR, 0.75, a); this._to(CH.shRIn, 0.5, a); this._to(CH.elR, 1.95, a); this._to(CH.headBend, 0.42, a); this._to(CH.neckBend, 0.14, a);
    }
    if (W.talk > 0.01) {
      const a = W.talk * (1 - Math.max(W.cower, W.handsUp));
      ch[CH.shR] += (0.35 + 0.25 * Math.sin(t * 5.1)) * a; ch[CH.elR] += (0.9 + 0.3 * Math.sin(t * 6.7)) * a; ch[CH.shROut] += 0.15 * a;
      ch[CH.shL] += (0.12 + 0.12 * Math.sin(t * 4.3 + 1)) * a; ch[CH.elL] += (0.5 + 0.2 * Math.sin(t * 5.9 + 2)) * a;
      ch[CH.headSide] += 0.06 * Math.sin(t * 3.3) * a; ch[CH.headBend] += 0.05 * Math.sin(t * 7.1) * a;
    }
    if (W.kneel > 0.01) {
      const a = W.kneel;
      ch[CH.spineBend] += 0.3 * a; this._to(CH.shL, 1.0, a); this._to(CH.elL, 0.7, a); this._to(CH.shR, 0.9, a); this._to(CH.elR, 0.8, a);
      ch[CH.headBend] += 0.3 * a;
    }
    if (W.stagger > 0.01) {
      const a = W.stagger, f = t * 9;
      this._to(CH.shL, 0.5 + 0.55 * Math.sin(f), a); this._to(CH.shR, 0.5 + 0.55 * Math.sin(f + 2.1), a);
      this._to(CH.shLOut, 1.0 + 0.35 * Math.sin(f * 0.7 + 1), a); this._to(CH.shROut, 1.0 + 0.35 * Math.sin(f * 0.8 + 3), a);
      this._to(CH.elL, 0.7 + 0.3 * Math.sin(f * 1.3), a); this._to(CH.elR, 0.7 + 0.3 * Math.sin(f * 1.1 + 1), a);
      ch[CH.spineBend] += (s.leanZ || 0) * a; ch[CH.spineSide] += (s.leanX || 0) * a; ch[CH.waistBend] += (s.leanZ || 0) * 0.6 * a;
      ch[CH.headBend] += 0.1 * Math.sin(f * 0.9) * a;
    }
    if (W.brace > 0.01) {
      const a = W.brace;
      this._to(CH.shL, 1.35, a); this._to(CH.shR, 1.35, a); this._to(CH.elL, 0.6, a); this._to(CH.elR, 0.6, a); this._to(CH.shLOut, 0.3, a); this._to(CH.shROut, 0.3, a);
      this._to(CH.hipL, 0.5, a); this._to(CH.kneeL, 0.8, a); this._to(CH.hipR, 0.3, a); this._to(CH.kneeR, 0.6, a); this._to(CH.headBend, -0.25, a);
    }
    if (W.writhe > 0.01) {
      const a = W.writhe, f = t * 2.2;
      this._to(CH.hipL, 0.75 + 0.5 * Math.sin(f), a); this._to(CH.kneeL, 1.25 + 0.5 * Math.sin(f + 0.8), a);
      this._to(CH.hipR, 0.6 + 0.5 * Math.sin(f + 2.4), a); this._to(CH.kneeR, 1.1 + 0.5 * Math.sin(f + 3.1), a);
      this._to(CH.shL, 0.7 + 0.4 * Math.sin(f * 1.3), a); this._to(CH.elL, 1.6 + 0.3 * Math.sin(f * 1.7), a); this._to(CH.shLIn, 0.6, a);
      this._to(CH.shR, 0.6 + 0.4 * Math.sin(f * 1.1 + 2), a); this._to(CH.elR, 1.7 + 0.3 * Math.sin(f * 1.5 + 1), a); this._to(CH.shRIn, 0.7, a);
      this._to(CH.spineBend, 0.3 + 0.2 * Math.sin(f * 0.8), a); this._to(CH.waistBend, 0.2, a); this._to(CH.spineSide, 0.2 * Math.sin(f * 0.6), a);
      this._to(CH.headSide, 0.3 * Math.sin(f * 0.9), a); this._to(CH.headTwist, 0.5 * Math.sin(f * 0.7 + 1), a);
    }
    if (W.crawl > 0.01) {
      // face down, dragging themselves along on their arms
      const a = W.crawl, f = t * 3.2, sl = Math.sin(f), sr = Math.sin(f + Math.PI);
      this._to(CH.shL, 2.4 + 0.55 * sl, a); this._to(CH.elL, 0.9 - 0.7 * sl, a); this._to(CH.shLOut, 0.35, a);
      this._to(CH.shR, 2.4 + 0.55 * sr, a); this._to(CH.elR, 0.9 - 0.7 * sr, a); this._to(CH.shROut, 0.35, a);
      this._to(CH.hipL, 0.25 + 0.25 * sr, a); this._to(CH.kneeL, 0.5 + 0.35 * sr, a); this._to(CH.hipR, 0.25 + 0.25 * sl, a); this._to(CH.kneeR, 0.5 + 0.35 * sl, a);
      this._to(CH.headBend, -0.5, a); this._to(CH.neckBend, -0.3, a); this._to(CH.spineBend, -0.12, a);
      this.crawlPull = Math.max(0, Math.cos(f)) * a;
    } else this.crawlPull = 0;

    /* ---- the head goes where the eyes want ---- */
    ch[CH.headTwist] += this.lookYaw * 0.55; ch[CH.neckTwist] += this.lookYaw * 0.3; ch[CH.spineTwist] += this.lookYaw * 0.12;
    ch[CH.headBend] -= this.lookPitch * 0.6; ch[CH.neckBend] -= this.lookPitch * 0.3;

    /* ---- an attack takes over the channels it names ---- */
    const act = this.action;
    if (act) {
      act.t += dt;
      const c = act.clip, u = act.t / c.dur;
      if (u >= 1) this.action = null;
      else {
        const keys = c.keys;
        let i = 0;
        while (i < keys.length - 2 && u > keys[i + 1].t) i++;
        const a = keys[i], b = keys[i + 1];
        const f = smooth((u - a.t) / (b.t - a.t));
        const wgt = Math.min(smooth(u / 0.1), smooth((1 - u) / 0.16));
        for (let n = 0; n < c.channels.length; n++) {
          const idx = c.channels[n];
          const v = lerp(a.v[n], b.v[n], f);
          // the pelvis offsets add to the gait; everything else replaces it
          if (idx === CH.rootY || idx === CH.rootZ) ch[idx] += v * wgt;
          else ch[idx] = lerp(ch[idx], v, wgt);
        }
        // reach down for something on the ground, up for something overhead
        if (this.lowAim > 0.02 && c.limb !== 'footR') { ch[CH.shR] -= this.lowAim * 0.5 * wgt; ch[CH.shL] -= this.lowAim * 0.4 * wgt; }
      }
    }

    /* ---- being hit ---- */
    if (this.flinch > 0.01) {
      const a = Math.min(1, this.flinch);
      ch[CH.spineBend] -= this.flZ * 0.42 * a; ch[CH.waistBend] -= this.flZ * 0.22 * a;
      ch[CH.spineSide] += this.flX * 0.36 * a; ch[CH.headBend] -= this.flZ * 0.4 * a; ch[CH.headSide] += this.flX * 0.3 * a;
      ch[CH.rootZ] -= this.flZ * 0.05 * a;
    }
    return ch;
  }

  _to(i, v, w) { this.ch[i] += (v - this.ch[i]) * w; }
}
