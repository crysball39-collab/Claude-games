/* =============================================================================
   What has happened to a stickman's body, and what it means for them.

   Six parts take damage separately: head, torso, both arms, both legs. On top
   of the hit points there is:

     blood       a full body's worth is 1. Cuts bleed, bleeding clots, and
                 below 0.38 the heart has nothing left to pump
     pain        what they feel right now, 0 to about 100. It spikes with every
                 hit and settles back to what their injuries still ache
     conscious   1 is wide awake. Blows to the head knock it down; under
                 KO_LEVEL they are out cold until it climbs back
     broken      a limb can break: an arm that no longer punches or carries, a
                 leg that no longer stands
     dizzy       seconds of seeing stars after a knock to the head

   Death comes from the head (a skull can only take so much), the torso
   (internal injuries) or running out of blood.
   ========================================================================== */
import { clamp } from '../core/util.js';

export const PARTS = ['head', 'torso', 'armA', 'armB', 'legA', 'legB'];
export const PART_NAMES = {
  head: 'head', torso: 'body', armA: 'right arm', armB: 'left arm', legA: 'right leg', legB: 'left leg',
};
export const KO_LEVEL = 0.22;

const MAX = { head: 100, torso: 150, armA: 80, armB: 80, legA: 90, legB: 90 };
const PAIN = { head: 1, torso: 0.85, armA: 0.7, armB: 0.7, legA: 0.75, legB: 0.75 };

export class Health {
  constructor(toughness = 0.5) {
    this.toughness = toughness;
    this.parts = {};
    for (const k of PARTS) {
      this.parts[k] = { hp: MAX[k], max: MAX[k], bleed: 0, broken: false, bruise: 0, cuts: 0, lastHit: -99 };
    }
    this.blood = 1;
    this.pain = 0;
    this.conscious = 1;
    this.dizzy = 0;
    this.dead = false;
    this.cause = '';
    this.time = 0;
    this.headT = -99;
  }

  /**
   * A blow to one part. Returns what it did: { damage, broke, wound, fatal, ko }.
   *
   * @param {number} amount  hit points
   * @param {object} o
   *   sharp        0..1, how much it splits skin (brass knuckles do)
   *   breakChance  extra chance of a break on top of what the force gives
   */
  hit(part, amount, { sharp = 0, breakChance = 0 } = {}) {
    const p = this.parts[part];
    if (!p) return { damage: 0 };
    const dmg = Math.max(0, amount);
    p.hp = Math.max(0, p.hp - dmg);
    p.bruise = Math.min(1, p.bruise + dmg / 35);
    p.lastHit = this.time;

    // Cuts: anything sharp, or a hard enough blow to the face
    let wound = false;
    const cutChance = sharp * (dmg / 12) + (part === 'head' ? dmg / 28 : dmg / 70);
    if (dmg > 5 && Math.random() < cutChance) {
      p.bleed += dmg * (0.00032 + sharp * 0.00045);
      p.cuts++;
      wound = true;
    }

    let broke = false;
    if (!p.broken && part !== 'head' && part !== 'torso') {
      const worn = 1 - p.hp / p.max;
      const chance = breakChance + (Math.max(0, dmg - 15) / 28) * (0.25 + worn) + (p.hp <= 0 ? 0.6 : 0);
      if (Math.random() < chance) {
        p.broken = true;
        broke = true;
        p.bleed += 0.0012;
      }
    }

    this.pain = Math.min(130, this.pain + dmg * PAIN[part] * (1.3 - this.toughness * 0.55));

    // A few clean shots to the head put anyone down long before they could
    // kill: a fistfight ends in a knockout, not a body - unless somebody keeps
    // going after the knockout.
    let ko = false;
    if (part === 'head') {
      this.conscious -= dmg * 0.021 * (1.25 - this.toughness * 0.45);
      this.dizzy = Math.max(this.dizzy, dmg * 0.16);
      this.headT = this.time;
      if (this.conscious < KO_LEVEL) ko = true;
    }
    const fatal = this.checkDeath();
    return { damage: dmg, broke, wound, fatal, ko };
  }

  checkDeath() {
    if (this.dead) return true;
    if (this.parts.head.hp <= 0) return this.kill('a blow to the head');
    if (this.parts.torso.hp <= 0) return this.kill('internal injuries');
    if (this.blood <= 0.38) return this.kill('blood loss');
    return false;
  }

  kill(cause) {
    this.dead = true;
    this.cause = cause;
    this.conscious = 0;
    return true;
  }

  /** Advances bleeding, clotting, healing and pain. True if it just killed them. */
  update(dt) {
    this.time += dt;
    let bleed = 0;
    for (const k of PARTS) {
      const p = this.parts[k];
      if (p.bleed > 0) {
        bleed += p.bleed;
        // clotting: the dead stop bleeding faster, there being no pressure
        p.bleed *= Math.exp(-dt * (this.dead ? 0.12 : 0.035));
        if (p.bleed < 0.00004) p.bleed = 0;
      }
      if (!this.dead) {
        if (!p.broken && this.time - p.lastHit > 6) p.hp = Math.min(p.max, p.hp + dt * 0.22);
        p.bruise = Math.max(0, p.bruise - dt * 0.003);
      }
    }
    this.blood = Math.max(0, this.blood - bleed * dt);
    if (this.dead) return false;
    if (bleed === 0 && this.blood < 1) this.blood = Math.min(1, this.blood + dt * 0.0015);

    const ache = this.ache();
    if (this.pain > ache) this.pain = Math.max(ache, this.pain - dt * (2.5 + this.toughness * 3));
    else this.pain = ache;

    // there has to be blood for the brain to stay awake on, and a knock to
    // the head takes a few seconds to start clearing
    const cap = this.blood < 0.56 ? clamp((this.blood - 0.38) / 0.18, 0, 1) : 1;
    const clearing = this.time - this.headT > 2.5 ? 0.03 + this.toughness * 0.02 : 0;
    this.conscious = Math.min(cap, this.conscious + dt * clearing);
    this.dizzy = Math.max(0, this.dizzy - dt);
    return this.checkDeath();
  }

  /** What the injuries go on hurting once the fresh pain has worn off. */
  ache() {
    let a = 0;
    for (const k of PARTS) {
      const p = this.parts[k];
      a += (1 - p.hp / p.max) * 20 + (p.broken ? 16 : 0);
    }
    if (this.blood < 0.8) a += (0.8 - this.blood) * 40;
    return Math.min(85, a);
  }

  get bleeding() {
    let b = 0;
    for (const k of PARTS) b += this.parts[k].bleed;
    return b;
  }

  /** 0..1, the short answer to "how are they doing". */
  get overall() {
    if (this.dead) return 0;
    const f = (k) => this.parts[k].hp / this.parts[k].max;
    const v = f('head') * 0.32 + f('torso') * 0.32 + (f('armA') + f('armB') + f('legA') + f('legB')) * 0.09;
    return clamp(v * clamp((this.blood - 0.38) / 0.5, 0, 1) ** 0.5, 0, 1);
  }

  canUse(part) {
    const p = this.parts[part];
    return !p.broken && p.hp > p.max * 0.1;
  }

  get legsBroken() {
    return (this.parts.legA.broken ? 1 : 0) + (this.parts.legB.broken ? 1 : 0);
  }

  /** How well they can walk: 1 is fine, lower is a limp, 0 is not at all. */
  get mobility() {
    if (this.legsBroken) return 0;
    const l = Math.min(this.parts.legA.hp / this.parts.legA.max, this.parts.legB.hp / this.parts.legB.max);
    const pain = clamp(1 - (this.pain - 40) / 120, 0.6, 1);
    const blood = clamp((this.blood - 0.38) / 0.4, 0.45, 1);
    return clamp((0.45 + l * 0.55) * pain * blood, 0.25, 1);
  }

  /** The worse leg, if one is bad enough to limp on: 'A', 'B' or null. */
  get limp() {
    const a = this.parts.legA, b = this.parts.legB;
    const fa = a.hp / a.max, fb = b.hp / b.max;
    if (Math.min(fa, fb) > 0.62) return null;
    return fa < fb ? 'A' : 'B';
  }

  /** Everything back as it was. The sandbox's heal button. */
  heal() {
    for (const k of PARTS) {
      const p = this.parts[k];
      p.hp = p.max; p.bleed = 0; p.broken = false; p.bruise = 0; p.cuts = 0;
    }
    this.blood = 1; this.pain = 0; this.conscious = 1; this.dizzy = 0;
  }

  /** The conditions worth listing, worst first. */
  conditions() {
    const out = [];
    if (this.dead) { out.push('Dead (' + this.cause + ')'); return out; }
    if (this.conscious < KO_LEVEL) out.push('Unconscious');
    for (const k of PARTS) if (this.parts[k].broken) out.push('Broken ' + PART_NAMES[k]);
    const b = this.bleeding;
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
