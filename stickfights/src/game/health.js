/* =============================================================================
   What has happened to a stickman's body, and what it means for them.

   Six parts take damage separately: head, torso, both arms, both legs. Inside
   them are the bones (skeleton.js), and any of them can break:

     skull       a fractured skull bleeds, and leaves the head easier to knock
                 out and to kill
     neck        a broken neck kills about half the time; otherwise it leaves
                 them paralysed from the neck down, awake on the floor
     ribs        cracked ribs hurt with every breath and slow them down; a bad
                 enough break punctures a lung, which bleeds inside
     spine       a broken back takes the legs: they drag themselves on their
                 arms
     pelvis      no standing on it
     humerus     an arm with either bone broken cannot punch, carry or block,
     forearm       and hangs, bent where it gave
     femur       a leg with either bone broken cannot take weight: down they
     tibia         go, and crawl

   On top of the hit points and the bones there is:

     blood       a full body's worth is 1. Cuts bleed, bleeding clots, and
                 below 0.38 the heart has nothing left to pump. A blade cuts
                 far deeper than a fist; a stab in the body bleeds inside,
                 where it clots slowly, and one in the neck is the worst of all
     pain        what they feel right now, 0 to about 100. It spikes with every
                 hit and settles back to what their injuries still ache
     conscious   1 is wide awake. Blows to the head knock it down; under
                 KO_LEVEL they are out cold until it climbs back
     dizzy       seconds of seeing stars after a knock to the head

   Death comes from the head (a skull can only take so much), the torso
   (internal injuries), a broken neck, or running out of blood.
   ========================================================================== */
import { clamp } from '../core/util.js';

export const PARTS = ['head', 'torso', 'armA', 'armB', 'legA', 'legB'];
export const PART_NAMES = {
  head: 'head', torso: 'body', armA: 'right arm', armB: 'left arm', legA: 'right leg', legB: 'left leg',
};
export const KO_LEVEL = 0.22;

export const BONE_LIST = ['skull', 'neck', 'ribs', 'spine', 'pelvis', 'humerusA', 'forearmA', 'humerusB', 'forearmB', 'femurA', 'tibiaA', 'femurB', 'tibiaB'];
export const BONE_PART = {
  skull: 'head', neck: 'head', ribs: 'torso', spine: 'torso', pelvis: 'torso',
  humerusA: 'armA', forearmA: 'armA', humerusB: 'armB', forearmB: 'armB',
  femurA: 'legA', tibiaA: 'legA', femurB: 'legB', tibiaB: 'legB',
};
/** What they are called, for the inspector. */
export const BONE_NAMES = {
  skull: 'skull', neck: 'neck', ribs: 'ribs', spine: 'spine', pelvis: 'pelvis',
  humerusA: 'right humerus', forearmA: 'right forearm', humerusB: 'left humerus', forearmB: 'left forearm',
  femurA: 'right femur', tibiaA: 'right tibia', femurB: 'left femur', tibiaB: 'left tibia',
};
/** And what they say about it, which is not the Latin. */
export const BONE_SAID = {
  skull: 'head', neck: 'neck', ribs: 'ribs', spine: 'back', pelvis: 'hip',
  humerusA: 'arm', forearmA: 'arm', humerusB: 'arm', forearmB: 'arm',
  femurA: 'leg', tibiaA: 'leg', femurB: 'leg', tibiaB: 'leg',
};
// how hard a single blow has to be to have any chance of breaking each one
const STRENGTH = { skull: 34, neck: 36, ribs: 17, spine: 40, pelvis: 37, humerus: 24, forearm: 19, femur: 33, tibia: 25 };
const strengthOf = (b) => STRENGTH[b.replace(/[AB]$/, '')];

const MAX = { head: 100, torso: 150, armA: 80, armB: 80, legA: 90, legB: 90 };
const PAIN = { head: 1, torso: 0.85, armA: 0.7, armB: 0.7, legA: 0.75, legB: 0.75 };

/** Which bone takes a blow to a part, when nothing more is known about where it landed. */
function someBone(part) {
  const r = Math.random();
  switch (part) {
    case 'head': return r < 0.85 ? 'skull' : 'neck';
    case 'torso': return r < 0.6 ? 'ribs' : r < 0.85 ? 'spine' : 'pelvis';
    case 'armA': case 'armB': return (r < 0.5 ? 'humerus' : 'forearm') + part.slice(-1);
    case 'legA': case 'legB': return (r < 0.5 ? 'femur' : 'tibia') + part.slice(-1);
    default: return null;
  }
}

export class Health {
  constructor(toughness = 0.5) {
    this.toughness = toughness;
    this.parts = {};
    for (const k of PARTS) {
      this.parts[k] = { hp: MAX[k], max: MAX[k], bleed: 0, broken: false, bruise: 0, cuts: 0, lastHit: -99 };
    }
    this.bones = {};
    for (const b of BONE_LIST) this.bones[b] = { broken: false, cracked: 0, t: -99 };
    this.internal = 0;        // bleeding inside: a stab in the body, a punctured lung
    this.pressure = 0;        // seconds of someone pressing on the wounds
    this.paralysed = 'none';  // 'legs' after a broken back, 'all' after a broken neck
    this.blood = 1;
    this.pain = 0;
    this.conscious = 1;
    this.dizzy = 0;
    this.dead = false;
    this.cause = '';
    this.time = 0;
    this.headT = -99;
    this.lastBreak = null;
  }

  /**
   * A blow to one part. Returns what it did:
   *   { damage, broke (the bone's name, or null), wound, fatal, ko }
   *
   * @param {number} amount  hit points
   * @param {object} o
   *   sharp        0..1, how much it splits skin (brass knuckles do; a blade does nothing else)
   *   deep         a stab rather than a cut: it goes in
   *   bone         which bone it landed on, if that is known (skeleton.js)
   *   breakChance  extra chance of a break on top of what the force gives
   */
  hit(part, amount, { sharp = 0, deep = false, bone = null, breakChance = 0 } = {}) {
    const p = this.parts[part];
    if (!p) return { damage: 0 };
    let dmg = Math.max(0, amount);
    // a cracked skull gives less protection
    if (part === 'head' && this.bones.skull.broken) dmg *= 1.3;
    p.hp = Math.max(0, p.hp - dmg);
    p.bruise = Math.min(1, p.bruise + dmg / 35 * (1 - sharp * 0.6));
    p.lastHit = this.time;
    const b = bone && BONE_PART[bone] === part ? bone : someBone(part);

    // Cuts. A blade opens one wherever it lands, and how much it bleeds is
    // down to the blade more than the force behind it; a blunt blow only
    // splits the skin, mostly over the face - knuckles more often than a fist
    let wound = false;
    const blade = sharp > 0.9;
    const cutChance = blade ? 1 : sharp * (dmg / 6) + (part === 'head' ? dmg / 40 : dmg / 80);
    if (dmg > (blade ? 1.5 : 3) && Math.random() < cutChance) {
      p.bleed += blade ? (0.0018 + dmg * 0.0002) * (deep ? 1.35 : 1) : dmg * 0.00013;
      p.cuts++;
      wound = true;
      if (blade) {
        // where the blade went in matters more than how hard
        if (deep && part === 'torso') this.internal += dmg * 0.00018;
        if (b === 'neck') p.bleed += dmg * 0.0011;
      }
    }

    // Bones: the blow has to be hard, and a bone that has had a few already goes easier
    let broke = null;
    const bn = b && this.bones[b];
    if (bn && !bn.broken) {
      const s = strengthOf(b);
      const worn = 1 - p.hp / p.max;
      const force = dmg * (1 - sharp * 0.5);
      bn.cracked = Math.min(1, bn.cracked + force / (s * 4));
      const over = Math.max(0, force - s * 0.7) / (s * 1.4);
      const chance = breakChance + over * (0.25 + worn * 0.6 + bn.cracked * 0.5) + (p.hp <= 0 ? 0.5 : 0);
      if (force > 4 && Math.random() < chance) broke = this.breakBone(b, force);
    }

    this.pain = Math.min(130, this.pain + dmg * PAIN[part] * (1.3 - this.toughness * 0.55) * (broke ? 1.4 : 1));

    // A few clean shots to the head put anyone down long before they could
    // kill: a fistfight ends in a knockout, not a body - unless somebody keeps
    // going after the knockout.
    let ko = false;
    if (part === 'head' && sharp < 0.9) {
      this.conscious -= dmg * 0.021 * (1.25 - this.toughness * 0.45) * (this.bones.skull.broken ? 1.25 : 1);
      this.dizzy = Math.max(this.dizzy, dmg * 0.16);
      this.headT = this.time;
      if (this.conscious < KO_LEVEL) ko = true;
    }
    const fatal = this.checkDeath();
    return { damage: dmg, broke, wound, fatal, ko };
  }

  /** Snaps a bone, with whatever that does. Returns its name. */
  breakBone(b, force = 30) {
    const bn = this.bones[b];
    if (!bn || bn.broken) return null;
    bn.broken = true;
    bn.t = this.time;
    this.lastBreak = b;
    const part = BONE_PART[b];
    const p = this.parts[part];
    if (part.startsWith('arm') || part.startsWith('leg')) p.broken = true;
    switch (b) {
      case 'skull':
        p.bleed += 0.0016;
        this.conscious -= 0.25;
        break;
      case 'neck':
        if (Math.random() < 0.5) this.kill('a broken neck');
        else this.paralysed = 'all';
        break;
      case 'spine':
        if (this.paralysed === 'none') this.paralysed = 'legs';
        break;
      case 'ribs':
        if (force > 24 && Math.random() < 0.35) this.internal += 0.0022;   // a punctured lung
        break;
      case 'pelvis':
        this.internal += 0.0008;
        break;
      default:
        // a break bad enough to come through the skin
        if (force > 30 && Math.random() < 0.4) { p.bleed += 0.0014; p.cuts++; }
        else p.bleed += 0.0004;
    }
    this.pain = Math.min(130, this.pain + 22);
    return b;
  }

  checkDeath() {
    if (this.dead) return true;
    if (this.parts.head.hp <= 0) return this.kill('a blow to the head');
    if (this.parts.torso.hp <= 0) return this.kill('internal injuries');
    if (this.blood <= 0.38) return this.kill('blood loss');
    return false;
  }

  kill(cause) {
    if (!this.dead) this.cause = cause;
    this.dead = true;
    this.conscious = 0;
    return true;
  }

  /** Advances bleeding, clotting, healing and pain. True if it just killed them. */
  update(dt) {
    this.time += dt;
    let bleed = 0;
    // someone pressing on the wounds stops them a good deal faster
    const press = this.pressure > 0 ? 4 : 1;
    this.pressure = Math.max(0, this.pressure - dt);
    for (const k of PARTS) {
      const p = this.parts[k];
      if (p.bleed > 0) {
        bleed += p.bleed;
        // clotting: the dead stop bleeding faster, there being no pressure
        p.bleed *= Math.exp(-dt * (this.dead ? 0.12 : 0.035 * press));
        if (p.bleed < 0.00004) p.bleed = 0;
      }
      if (!this.dead) {
        if (!p.broken && this.time - p.lastHit > 6) p.hp = Math.min(p.max, p.hp + dt * 0.22);
        p.bruise = Math.max(0, p.bruise - dt * 0.003);
      }
    }
    if (this.internal > 0) {
      bleed += this.internal;
      this.internal *= Math.exp(-dt * (this.dead ? 0.2 : 0.011 * (press > 1 ? 2 : 1)));
      if (this.internal < 0.00003) this.internal = 0;
    }
    this.blood = Math.max(0, this.blood - bleed * dt);
    if (this.dead) return false;
    if (bleed === 0 && this.blood < 1) this.blood = Math.min(1, this.blood + dt * 0.0015);

    const ache = this.ache();
    if (this.pain > ache) this.pain = Math.max(ache, this.pain - dt * (2.5 + this.toughness * 3));
    else this.pain = ache;

    // there has to be blood for the brain to stay awake on, and a knock to
    // the head takes a few seconds to start clearing
    // and a badly hurt head cannot be fully awake: it is knocked out again
    // by the next good hit, rather than killed by it
    const head = this.parts.head;
    const cap = Math.min(this.blood < 0.56 ? clamp((this.blood - 0.38) / 0.18, 0, 1) : 1,
      0.25 + 0.75 * clamp(head.hp / 70, 0, 1) - (this.bones.skull.broken ? 0.15 : 0));
    const clearing = this.time - this.headT > 2.5 ? 0.03 + this.toughness * 0.02 : 0;
    this.conscious = Math.min(cap, this.conscious + dt * clearing);
    this.dizzy = Math.max(0, this.dizzy - dt);
    return this.checkDeath();
  }

  /** What the injuries go on hurting once the fresh pain has worn off. */
  ache() {
    let a = 0;
    for (const k of PARTS) a += (1 - this.parts[k].hp / this.parts[k].max) * 20;
    for (const b of BONE_LIST) if (this.bones[b].broken) a += b === 'ribs' || b === 'pelvis' ? 20 : b === 'neck' ? 8 : 15;
    if (this.blood < 0.8) a += (0.8 - this.blood) * 40;
    return Math.min(85, a);
  }

  get bleeding() {
    let b = this.internal;
    for (const k of PARTS) b += this.parts[k].bleed;
    return b;
  }

  /** 0..1, the short answer to "how are they doing". */
  get overall() {
    if (this.dead) return 0;
    const f = (k) => this.parts[k].hp / this.parts[k].max;
    const v = f('head') * 0.32 + f('torso') * 0.32 + (f('armA') + f('armB') + f('legA') + f('legB')) * 0.09;
    return clamp(v * clamp((this.blood - 0.38) / 0.5, 0, 1) ** 0.5 * (this.paralysed === 'all' ? 0.5 : 1), 0, 1);
  }

  canUse(part) {
    const p = this.parts[part];
    if (!p || p.broken || p.hp <= p.max * 0.1 || this.paralysed === 'all') return false;
    if (part.startsWith('leg')) return this.paralysed === 'none' && !this.bones.pelvis.broken;
    return true;
  }

  /** How many legs will not hold them up: a broken back or pelvis counts as both. */
  get legsBroken() {
    if (this.paralysed !== 'none' || this.bones.pelvis.broken) return 2;
    return (this.parts.legA.broken ? 1 : 0) + (this.parts.legB.broken ? 1 : 0);
  }

  /** How well they can walk: 1 is fine, lower is a limp, 0 is not at all. */
  get mobility() {
    if (this.legsBroken) return 0;
    const l = Math.min(this.parts.legA.hp / this.parts.legA.max, this.parts.legB.hp / this.parts.legB.max);
    const pain = clamp(1 - (this.pain - 40) / 120, 0.6, 1);
    const blood = clamp((this.blood - 0.38) / 0.4, 0.45, 1);
    const ribs = this.bones.ribs.broken ? 0.82 : 1;
    return clamp((0.45 + l * 0.55) * pain * blood * ribs, 0.25, 1);
  }

  /** The worse leg, if one is bad enough to limp on: 'A', 'B' or null. */
  get limp() {
    const a = this.parts.legA, b = this.parts.legB;
    const fa = a.hp / a.max, fb = b.hp / b.max;
    if (Math.min(fa, fb) > 0.62) return null;
    return fa < fb ? 'A' : 'B';
  }

  /** The broken bones, by name. */
  get broken() {
    const out = {};
    for (const b of BONE_LIST) if (this.bones[b].broken) out[b] = true;
    return out;
  }

  /** Everything back as it was. The sandbox's heal button. */
  heal() {
    for (const k of PARTS) {
      const p = this.parts[k];
      p.hp = p.max; p.bleed = 0; p.broken = false; p.bruise = 0; p.cuts = 0;
    }
    for (const b of BONE_LIST) { this.bones[b].broken = false; this.bones[b].cracked = 0; }
    this.internal = 0;
    this.paralysed = 'none';
    this.blood = 1; this.pain = 0; this.conscious = 1; this.dizzy = 0;
  }

  /** The conditions worth listing, worst first. */
  conditions() {
    const out = [];
    if (this.dead) { out.push('Dead (' + this.cause + ')'); return out; }
    if (this.conscious < KO_LEVEL) out.push('Unconscious');
    if (this.paralysed === 'all') out.push('Paralysed from the neck down');
    else if (this.paralysed === 'legs') out.push('Legs paralysed');
    const bn = this.bones;
    if (bn.neck.broken) out.push('Broken neck');
    if (bn.skull.broken) out.push('Fractured skull');
    if (bn.spine.broken) out.push('Broken spine');
    if (bn.pelvis.broken) out.push('Broken pelvis');
    if (bn.ribs.broken) out.push('Broken ribs');
    for (const b of ['femurA', 'femurB', 'tibiaA', 'tibiaB', 'humerusA', 'humerusB', 'forearmA', 'forearmB']) {
      if (bn[b].broken) out.push('Broken ' + BONE_NAMES[b]);
    }
    const b = this.bleeding;
    if (this.internal > 0.0015) out.push('Bleeding inside');
    if (b > 0.004) out.push('Bleeding heavily');
    else if (b > 0.0003) out.push('Bleeding');
    if (this.blood < 0.6) out.push('Faint from blood loss');
    else if (this.blood < 0.85) out.push('Lost some blood');
    if (this.dizzy > 0.5) out.push('Dizzy');
    if (this.pain > 75) out.push('In agony');
    else if (this.pain > 40) out.push('In pain');
    if (this.parts.head.hp < 45) out.push('Head injury');
    if (this.parts.torso.hp < 60) out.push('Badly hurt');
    return out;
  }
}
