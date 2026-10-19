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
     shock       0..1, after something terrible: a limb gone, a bullet in
                 them, too much blood lost. They go pale, shake, and the mind
                 does not stay quite as awake
     adrenaline  0..1: fear, anger, a blow, being on fire. While it is up
                 they feel less of the pain and wake up sooner - and the
                 heart pumps out what they are bleeding faster
     oxygen      0..1 of what the blood can carry. Too little, they go dizzy,
                 then out; long enough near the bottom, it kills them
     temp        their temperature, in degrees C: 37 is right. Too hot or too
                 cold knocks them out, and kept up, kills them (heat, chill)
     frozen      frozen solid: nothing flows, nothing heals, nobody is home
   (vitals.js keeps those four going: breathing, the heat, fire and ice.)

   And the injuries that come from particular things:

     gunshot     a hole where it went in and, as often as not, out. In the
                 head it kills, most of the time; in the body it bleeds
                 inside, and now and then finds the heart or the spine; in a
                 limb it can break the bone or open an artery. A bullet that
                 did not come out stays in them
     gash        a machete opens the skin wide: a cut that bleeds harder than
                 a knife's
     severed     a hard enough chop goes right through an arm or a leg, at
                 the middle of the bone it hit. The stump bleeds from the
                 artery, and that does not clot on its own: someone has to
                 tie it off (a tourniquet), and pressing on it only slows it
     dislocated  a shoulder, elbow or knee knocked out of its socket: the limb
                 is no use, and hurts, until somebody pops it back in
     the face    black eyes, a bloody or broken nose, a split lip, a cut over
                 the eye, a swollen cheek, knocked-out teeth - from blows to
                 the head, mending slowly

   Death comes from the head (a skull can only take so much, and a bullet
   less), the torso (internal injuries), a broken neck, or running out of
   blood.
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
/** The joints that can come out of their sockets, and which part each one is in. */
export const JOINT_PART = { shoulderA: 'armA', elbowA: 'armA', shoulderB: 'armB', elbowB: 'armB', kneeA: 'legA', kneeB: 'legB' };
export const JOINT_NAMES = {
  shoulderA: 'right shoulder', elbowA: 'right elbow', shoulderB: 'left shoulder', elbowB: 'left elbow', kneeA: 'right knee', kneeB: 'left knee',
};
/** How fast the artery in each stump bleeds, and what was lost: by the bone it was cut through. */
const STUMP = {
  forearm: { bleed: 0.0055, lost: 'hand' }, humerus: { bleed: 0.0095, lost: 'arm' },
  tibia: { bleed: 0.0065, lost: 'foot' }, femur: { bleed: 0.014, lost: 'leg' },
};
export const SEVERABLE = ['forearmA', 'humerusA', 'forearmB', 'humerusB', 'tibiaA', 'femurA', 'tibiaB', 'femurB'];

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
    this.selfPress = 0;       // seconds of pressing on their own
    this.severed = {};        // bone -> true: cut off through the middle of it
    this.stumps = {};         // part -> how fast its stump bleeds
    this.tourniquet = {};     // part -> true: tied off
    this.dislocated = {};     // joint -> true
    this.bullets = [];        // the bones bullets are still in
    this.shots = {};          // part -> how many times shot there
    this.gashes = {};         // part -> how many machete wounds
    this.gashBy = {};         // part -> what made them, if it was not a machete
    this.shotBy = {};         // part -> what shot them there, if it was not a bullet
    this.burns = {};          // part -> what burned it, and how many times: { by, n }
    this.face = { blackEye: [0, 0], nose: 0, noseBroken: false, lip: 0, swell: 0, brow: 0, teeth: 0 };
    this.shock = 0;
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
    // what vitals.js keeps going
    this.adrenaline = 0;
    this.oxygen = 0.985;
    this.temp = 37;
    this.tempLock = null;     // a temperature it is held at, from the inspector
    this.heat = 0;            // 0..1: what too hot for too long has done (1 kills)
    this.chill = 0;           //       too cold for too long
    this.hypoxia = 0;         //       too little air for too long
    this.frozen = false;
    this.burning = false;
    this.lung = false;        // a punctured lung
  }

  /** How much of the pain they feel, with the adrenaline up. */
  get numbed() { return 1 - this.adrenaline * 0.4; }

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
  hit(part, amount, { sharp = 0, deep = false, bone = null, breakChance = 0, chop = false, shot = false, strike = null, burn = false, cutBy = null, cause = null, instakill = true } = {}) {
    const p = this.parts[part];
    if (!p) return { damage: 0 };
    let dmg = Math.max(0, amount);
    // a burn sears rather than cuts: no blood, but it hurts like nothing else
    if (burn) {
      const b0 = this.burns[part] || (this.burns[part] = { by: cutBy || 'Fire', n: 0 });
      b0.n++;
      p.hp = Math.max(0, p.hp - dmg);
      p.lastHit = this.time;
      this.pain = Math.min(130, this.pain + dmg * PAIN[part] * 1.6 * (1.3 - this.toughness * 0.55) * this.numbed);
      const what = cutBy ? cutBy.toLowerCase() : null;
      if (part === 'head' && p.hp <= 0) return { damage: dmg, fatal: !!this.kill(cause || (what ? `${what} to the head` : 'a burn to the head')), wound: false, broke: null, ko: false };
      if (part === 'torso' && p.hp <= 0) return { damage: dmg, fatal: !!this.kill(cause || what || 'burns'), wound: false, broke: null, ko: false };
      return { damage: dmg, wound: false, broke: null, ko: this.conscious < KO_LEVEL, fatal: this.dead };
    }
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
    const cutChance = blade || shot ? 1 : sharp * (dmg / 6) + (part === 'head' ? dmg / 40 : dmg / 80);
    if (dmg > (blade || shot ? 1.5 : 3) && Math.random() < cutChance) {
      p.bleed += shot ? 0.002 + dmg * 0.00008
        : chop ? (0.0022 + dmg * 0.00016) * 1.3
        : blade ? (0.0018 + dmg * 0.0002) * (deep ? 1.35 : 1) : dmg * 0.00013;
      p.cuts++;
      wound = true;
      if (blade) {
        // where the blade went in matters more than how hard
        if (deep && part === 'torso') this.internal += dmg * 0.00018;
        if (b === 'neck') p.bleed += dmg * (chop ? 0.0016 : 0.0011);
        if (chop) {
          this.gashes[part] = (this.gashes[part] || 0) + 1;
          if (cutBy) this.gashBy[part] = cutBy;
        }
      }
    }
    let killedBy = null;
    if (shot) {
      this.shots[part] = (this.shots[part] || 0) + 1;
      if (cutBy) this.shotBy[part] = cutBy;
      this.shock = Math.min(1, this.shock + 0.3);
      // what a bullet finds on its way through
      if (part === 'head') {
        if (instakill && dmg > 16 && Math.random() < 0.8) killedBy = cause ? `${cause} to the head` : cutBy ? `a ${cutBy.toLowerCase()} shot to the head` : 'a gunshot to the head';
        else this.conscious -= 0.5;
      } else if (part === 'torso') {
        this.internal += 0.0026 + Math.random() * 0.002;
        if (Math.random() < 0.08) { this.internal += 0.03; killedBy = null; this.heartShot = true; }
        if (b === 'spine' && Math.random() < 0.3 && this.paralysed === 'none') this.paralysed = 'legs';
        if (b === 'ribs' && Math.random() < 0.4) this.internal += 0.0018;
        if (b === 'neck') p.bleed += 0.012;
      } else if (Math.random() < 0.12) {
        // an artery: the limb bleeds hard until it is tied off
        p.bleed += 0.008;
        p.artery = true;
      }
    } else if (part === 'head' && !blade && dmg > 3) {
      this.faceHit(dmg, sharp, strike);
    }

    // Bones: the blow has to be hard, and a bone that has had a few already goes easier
    let broke = null;
    const bn = b && this.bones[b];
    if (bn && !bn.broken && !this.severed[b]) {
      const s = strengthOf(b);
      const worn = 1 - p.hp / p.max;
      // a bullet is small and sharp, but it goes through bone the way nothing else does
      const force = shot ? dmg * 1.4 : dmg * (1 - sharp * 0.5);
      bn.cracked = Math.min(1, bn.cracked + force / (s * 4));
      const over = Math.max(0, force - s * 0.7) / (s * 1.4);
      const chance = breakChance + over * (0.25 + worn * 0.6 + bn.cracked * 0.5) + (p.hp <= 0 ? 0.5 : 0);
      if (force > 4 && Math.random() < chance) broke = this.breakBone(b, force);
    }

    this.pain = Math.min(130, this.pain + dmg * PAIN[part] * (1.3 - this.toughness * 0.55) * (broke ? 1.4 : 1) * this.numbed);

    // A few clean shots to the head put anyone down long before they could
    // kill: a fistfight ends in a knockout, not a body - unless somebody keeps
    // going after the knockout.
    let ko = false;
    if (part === 'head' && sharp < 0.9 && !shot) {
      // (with the adrenaline up, it takes a little more to put them out)
      this.conscious -= dmg * 0.021 * (1.25 - this.toughness * 0.45) * (this.bones.skull.broken ? 1.25 : 1) * (1 - this.adrenaline * 0.18);
      this.dizzy = Math.max(this.dizzy, dmg * 0.16);
      this.headT = this.time;
      if (this.conscious < KO_LEVEL) ko = true;
    } else if (shot && part === 'head') {
      this.headT = this.time;
      if (this.conscious < KO_LEVEL) ko = true;
    }
    if (killedBy) this.kill(killedBy);
    // something with a name for what it does to a body (an explosion, say) says so if this was the end
    else if (cause && (this.parts.head.hp <= 0 || this.parts.torso.hp <= 0)) this.kill(cause);
    const fatal = this.checkDeath();
    return { damage: dmg, broke, wound, fatal, ko };
  }

  /**
   * What a blow to the face leaves: a black eye, a bloody (or broken) nose,
   * a split lip, a cut over the eye from knuckles, swelling, a tooth or two.
   */
  faceHit(dmg, sharp, strike) {
    const f = this.face;
    if (Math.random() < dmg / 26) { const i = Math.random() < 0.5 ? 0 : 1; f.blackEye[i] = Math.min(1, f.blackEye[i] + 0.35 + dmg / 40); }
    if (Math.random() < dmg / 34) {
      f.nose = Math.min(1, f.nose + 0.5 + dmg / 40);
      this.parts.head.bleed += 0.0005;
      if (dmg > 13 && Math.random() < 0.35) f.noseBroken = true;
    }
    if (Math.random() < dmg / 30) f.lip = 1;
    if (sharp > 0.4 && Math.random() < 0.5) { f.brow = 1; this.parts.head.bleed += 0.0004; }
    f.swell = Math.min(1, f.swell + dmg / 70);
    if ((strike === 'uppercut' || strike === 'kick' || strike === 'stomp' || sharp > 0.4) && dmg > 12 && Math.random() < 0.3) {
      f.teeth = Math.min(4, f.teeth + 1);
      this.lostTooth = true;
    }
  }

  /** Cut off through the middle of `bone`. The stump bleeds from the artery until tied off. */
  sever(bone) {
    if (this.severed[bone]) return false;
    const part = BONE_PART[bone];
    const p = this.parts[part];
    this.severed[bone] = true;
    p.broken = true;
    p.hp = Math.min(p.hp, p.max * 0.25);
    const kind = bone.replace(/[AB]$/, '');
    this.stumps[part] = Math.max(this.stumps[part] || 0, STUMP[kind].bleed);
    this.tourniquet[part] = false;
    // a dislocation further out does not matter any more
    for (const [j, jp] of Object.entries(JOINT_PART)) if (jp === part) this.dislocated[j] = false;
    this.pain = Math.min(130, this.pain + 65);
    this.shock = Math.min(1, this.shock + 0.65);
    return true;
  }

  /** What was lost, in words: 'hand', 'arm', 'foot', 'leg'. */
  lostAt(bone) { return STUMP[bone.replace(/[AB]$/, '')].lost; }

  /** Which limbs are gone, by part, with the bone they went through. */
  get missing() {
    const out = {};
    for (const b of SEVERABLE) if (this.severed[b]) { const part = BONE_PART[b]; if (!out[part] || b.startsWith('humerus') || b.startsWith('femur')) out[part] = b; }
    return out;
  }

  dislocate(joint) {
    if (this.dislocated[joint] || this.severedAbove(joint)) return false;
    this.dislocated[joint] = true;
    this.pain = Math.min(130, this.pain + 30);
    return true;
  }

  /** Back in its socket: a moment of agony, then relief. */
  relocate(joint) {
    if (!this.dislocated[joint]) return false;
    this.dislocated[joint] = false;
    this.pain = Math.min(130, this.pain + 25);
    return true;
  }

  /** Whether the limb a joint is on has already been cut off above it. */
  severedAbove(joint) {
    const side = joint.slice(-1);
    if (joint.startsWith('knee')) return !!this.severed['femur' + side];
    if (joint.startsWith('elbow')) return !!this.severed['humerus' + side];
    return false;
  }

  /** Tied off above the wound: a stump, or a limb bleeding from an artery, stops bleeding. */
  applyTourniquet(part) {
    const p = this.parts[part];
    if (!p || this.tourniquet[part]) return false;
    this.tourniquet[part] = true;
    if (this.stumps[part]) this.stumps[part] *= 0.03;
    p.bleed *= 0.12;
    p.artery = false;
    return true;
  }

  /** Which limbs need tying off: a stump still bleeding, or an opened artery. */
  get needsTourniquet() {
    const out = [];
    for (const k of ['armA', 'armB', 'legA', 'legB']) {
      if (this.tourniquet[k]) continue;
      if ((this.stumps[k] || 0) > 0.0008 || (this.parts[k].artery && this.parts[k].bleed > 0.003)) out.push(k);
    }
    return out;
  }

  /** A bullet that did not come out again. */
  lodge(bone) { if (bone && this.bullets.length < 12) this.bullets.push(bone); }

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
        if (force > 24 && Math.random() < 0.35) { this.internal += 0.0022; this.lung = true; }   // a punctured lung
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
    // frozen solid, nothing moves inside them: no bleeding, no clotting, no mending
    if (this.frozen) {
      this.dizzy = Math.max(0, this.dizzy - dt);
      this.conscious = Math.min(this.conscious, this.vitalCap());
      return this.checkDeath();
    }
    let bleed = 0;
    // someone pressing on the wounds stops them a good deal faster; pressing on your own, a bit
    const press = this.pressure > 0 ? 4 : this.selfPress > 0 ? 1.8 : 1;
    this.pressure = Math.max(0, this.pressure - dt);
    this.selfPress = Math.max(0, this.selfPress - dt);
    for (const k of PARTS) {
      const p = this.parts[k];
      if (p.bleed > 0) {
        bleed += p.bleed;
        // clotting: the dead stop bleeding faster, there being no pressure
        p.bleed *= Math.exp(-dt * (this.dead ? 0.12 : 0.035 * press * (p.artery ? 0.35 : 1)));
        if (p.bleed < 0.00004) { p.bleed = 0; p.artery = false; }
      }
      // a stump bleeds from the artery: hardly clotting, slowed by pressure, stopped by a tourniquet
      const st = this.stumps[k];
      if (st > 0) {
        bleed += st;
        this.stumps[k] = st * Math.exp(-dt * (this.dead ? 0.15 : 0.006 * press));
        if (this.stumps[k] < 0.00003) this.stumps[k] = 0;
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
    // a racing heart pumps it out faster
    this.blood = Math.max(0, this.blood - bleed * dt * (this.dead ? 1 : 1 + this.adrenaline * 0.3));
    if (this.dead) return false;
    if (bleed === 0 && this.blood < 1) this.blood = Math.min(1, this.blood + dt * 0.0015);
    // shock comes on with blood loss, and wears off slowly
    if (this.blood < 0.7) this.shock = Math.min(1, this.shock + dt * (0.7 - this.blood) * 0.2);
    this.shock = Math.max(0, this.shock - dt * 0.004);
    // a face mends: a cut lip in a minute or two, a black eye in a good deal longer
    const f = this.face;
    f.blackEye[0] = Math.max(0, f.blackEye[0] - dt * 0.0015);
    f.blackEye[1] = Math.max(0, f.blackEye[1] - dt * 0.0015);
    f.nose = Math.max(f.noseBroken ? 0.25 : 0, f.nose - dt * 0.008);
    f.lip = Math.max(0, f.lip - dt * 0.005);
    f.brow = Math.max(0, f.brow - dt * 0.004);
    f.swell = Math.max(0, f.swell - dt * 0.002);

    // (adrenaline keeps the ache down too, until it wears off)
    const ache = this.ache() * (1 - this.adrenaline * 0.35);
    if (this.pain > ache) this.pain = Math.max(ache, this.pain - dt * (2.5 + this.toughness * 3));
    else this.pain = ache;

    // there has to be blood for the brain to stay awake on, and a knock to
    // the head takes a few seconds to start clearing
    // and a badly hurt head cannot be fully awake: it is knocked out again
    // by the next good hit, rather than killed by it
    const head = this.parts.head;
    const cap = Math.min(this.blood < 0.56 ? clamp((this.blood - 0.38) / 0.18, 0, 1) : 1,
      0.25 + 0.75 * clamp(head.hp / 70, 0, 1) - (this.bones.skull.broken ? 0.15 : 0), this.vitalCap()) - this.shock * 0.12;
    const clearing = this.time - this.headT > 2.5 ? (0.03 + this.toughness * 0.02) * (1 + this.adrenaline * 0.8) : 0;
    this.conscious = Math.min(cap, this.conscious + dt * clearing);
    this.dizzy = Math.max(0, this.dizzy - dt);
    return this.checkDeath();
  }

  /**
   * How awake the air in them and their temperature let them be: dizzy
   * below three quarters of their oxygen and out cold near half; awake
   * between about 33 and 40 degrees, out cold below 28 or past 43 or so,
   * and nobody home at all frozen solid.
   */
  vitalCap() {
    if (this.frozen) return 0;
    const air = clamp((this.oxygen - 0.45) / 0.3, 0, 1);
    const t = this.temp;
    const cold = t >= 33 ? 1 : t >= 28 ? 0.3 + 0.7 * (t - 28) / 5 : clamp((t - 22) / 6, 0, 1) * 0.18;
    // (on fire, nobody passes out from the heat of it: they are far too busy screaming)
    const th = this.burning ? Math.min(t, 42.5) : t;
    const hot = th <= 40 ? 1 : th >= 44 ? 0.12 : 1 - 0.88 * (th - 40) / 4;
    return Math.min(air, cold, hot);
  }

  /** What the injuries go on hurting once the fresh pain has worn off. */
  ache() {
    let a = 0;
    for (const k of PARTS) a += (1 - this.parts[k].hp / this.parts[k].max) * 20;
    for (const b of BONE_LIST) if (this.bones[b].broken) a += b === 'ribs' || b === 'pelvis' ? 20 : b === 'neck' ? 8 : 15;
    if (this.blood < 0.8) a += (0.8 - this.blood) * 40;
    for (const b of SEVERABLE) if (this.severed[b]) a += 30;
    for (const j of Object.keys(JOINT_PART)) if (this.dislocated[j]) a += 22;
    a += this.bullets.length * 6;
    if (this.face.noseBroken) a += 6;
    return Math.min(90, a);
  }

  get bleeding() {
    let b = this.internal;
    for (const k of PARTS) b += this.parts[k].bleed + (this.stumps[k] || 0);
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
    for (const [j, jp] of Object.entries(JOINT_PART)) if (jp === part && this.dislocated[j]) return false;
    if (part.startsWith('leg')) return this.paralysed === 'none' && !this.bones.pelvis.broken;
    return true;
  }

  /** How many legs will not hold them up: a broken back or pelvis counts as both, a knee out of its socket as one. */
  get legsBroken() {
    if (this.paralysed !== 'none' || this.bones.pelvis.broken) return 2;
    return (this.parts.legA.broken || this.dislocated.kneeA ? 1 : 0) + (this.parts.legB.broken || this.dislocated.kneeB ? 1 : 0);
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

  /** Everything back as it was - even a limb. The sandbox's heal button. */
  heal() {
    for (const k of PARTS) {
      const p = this.parts[k];
      p.hp = p.max; p.bleed = 0; p.broken = false; p.bruise = 0; p.cuts = 0; p.artery = false;
    }
    for (const b of BONE_LIST) { this.bones[b].broken = false; this.bones[b].cracked = 0; }
    this.internal = 0;
    this.paralysed = 'none';
    this.severed = {};
    this.stumps = {};
    this.tourniquet = {};
    this.dislocated = {};
    this.bullets = [];
    this.shots = {};
    this.gashes = {};
    this.gashBy = {};
    this.shotBy = {};
    this.burns = {};
    this.face = { blackEye: [0, 0], nose: 0, noseBroken: false, lip: 0, swell: 0, brow: 0, teeth: 0 };
    this.shock = 0;
    this.heartShot = false;
    this.blood = 1; this.pain = 0; this.conscious = 1; this.dizzy = 0;
    this.adrenaline = 0; this.oxygen = 0.985; this.temp = 37; this.tempLock = null;
    this.heat = 0; this.chill = 0; this.hypoxia = 0; this.frozen = false; this.lung = false;
  }

  /** The conditions worth listing, worst first. */
  conditions() {
    const out = [];
    if (this.dead) { out.push('Dead (' + this.cause + ')'); return out; }
    if (this.conscious < KO_LEVEL && !this.frozen) out.push('Unconscious');
    // the air in them and how hot or cold they are (frozen solid says so for itself: vitals.js)
    if (!this.frozen) {
      if (this.oxygen < 0.55) out.push('Suffocating');
      else if (this.oxygen < 0.8) out.push('Short of breath');
      const t = this.temp;
      if (t >= 42) out.push('Heatstroke');
      else if (t >= 40) out.push('Overheating');
      else if (t >= 38.3) out.push('Running hot');
      else if (t <= 28) out.push('Severe hypothermia');
      else if (t <= 32) out.push('Hypothermia');
      else if (t <= 35) out.push('Cold');
    }
    if (this.adrenaline > 0.6 && this.conscious >= KO_LEVEL) out.push('Adrenaline rush');
    if (this.paralysed === 'all') out.push('Paralysed from the neck down');
    else if (this.paralysed === 'legs') out.push('Legs paralysed');
    for (const [part, b] of Object.entries(this.missing)) {
      const side = part.endsWith('A') ? 'Right' : 'Left';
      out.push(`${side} ${this.lostAt(b)} cut off` + (this.tourniquet[part] ? ' (tied off)' : ''));
    }
    for (const part of PARTS) {
      const n = this.shots[part];
      if (n) out.push((n > 1 ? `Shot ${n} times in the ` : `${this.shotBy[part] || 'Gunshot'} wound to the `) + PART_NAMES[part]);
    }
    if (this.bullets.length) out.push(this.bullets.length > 1 ? `${this.bullets.length} bullets still in them` : `A bullet lodged in the ${BONE_NAMES[this.bullets[0]]}`);
    for (const part of PARTS) if (this.gashes[part]) out.push(`${this.gashBy[part] || 'Machete'} wound to the ${PART_NAMES[part]}`);
    // burns: fire's and frostbite's are said in a word or two, and all over is all over
    const burnt = (by) => PARTS.filter((p) => this.burns[p] && this.burns[p].by === by);
    for (const [by, said] of [['Fire', 'Burns'], ['Frostbite', 'Frostbite']]) {
      const parts = burnt(by);
      if (parts.length >= 3) out.push(`${said} all over`);
      else for (const p of parts) out.push(`${said} on the ${PART_NAMES[p]}`);
    }
    for (const part of PARTS) {
      const b = this.burns[part];
      if (b && b.by !== 'Fire' && b.by !== 'Frostbite') out.push(`${b.by} burns on the ${PART_NAMES[part]}`);
    }
    if (this.lung) out.push('Punctured lung');
    for (const j of Object.keys(JOINT_PART)) if (this.dislocated[j]) out.push('Dislocated ' + JOINT_NAMES[j]);
    for (const part of ['armA', 'armB', 'legA', 'legB']) if (this.parts[part].artery && !this.tourniquet[part]) out.push(`Bleeding from an artery (${PART_NAMES[part]})`);
    if (this.shock > 0.45) out.push('In shock');
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
    const f = this.face;
    if (f.noseBroken) out.push('Broken nose');
    else if (f.nose > 0.3) out.push('Bloody nose');
    if (f.blackEye[0] > 0.25 || f.blackEye[1] > 0.25) out.push(f.blackEye[0] > 0.25 && f.blackEye[1] > 0.25 ? 'Two black eyes' : 'Black eye');
    if (f.lip > 0.3) out.push('Split lip');
    if (f.teeth) out.push(f.teeth > 1 ? `${f.teeth} teeth knocked out` : 'A tooth knocked out');
    return out;
  }
}
