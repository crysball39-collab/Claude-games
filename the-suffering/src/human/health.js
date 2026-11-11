/* =============================================================================
   What is wrong with someone.

   One of these belongs to every person. It keeps the anatomy - twenty three
   bones, fifteen organs, every wound they have taken - and from that it works
   out the things a doctor would read off them: how much blood is left and how
   fast it is leaving, whether air is reaching it, pulse, pain, shock, nausea,
   temperature, and whether there is anybody home.

   Nothing here knows about graphics or physics. A hit comes in as "this part,
   this kind of damage, this hard, here, travelling this way" and a report
   goes back saying what it did. Time is run a little fast: a wound that would
   take minutes to kill takes most of one.
   ========================================================================== */
import { P, PARTS } from './rig.js';
import { clamp, clamp01, lerp, rand, chance } from '../core/util.js';

/* -------------------------------- anatomy --------------------------------- */

export const BONES = [
  { id: 'skull', name: 'Skull', part: P.HEAD },
  { id: 'jaw', name: 'Jaw', part: P.HEAD },
  { id: 'cspine', name: 'Neck vertebrae', part: P.NECK },
  { id: 'clavL', name: 'Left collarbone', part: P.CHEST },
  { id: 'clavR', name: 'Right collarbone', part: P.CHEST },
  { id: 'ribsL', name: 'Left ribs', part: P.CHEST },
  { id: 'ribsR', name: 'Right ribs', part: P.CHEST },
  { id: 'sternum', name: 'Breastbone', part: P.CHEST },
  { id: 'tspine', name: 'Upper spine', part: P.CHEST },
  { id: 'lspine', name: 'Lower spine', part: P.ABDOMEN },
  { id: 'pelvis', name: 'Pelvis', part: P.PELVIS },
  { id: 'humerusL', name: 'Left humerus', part: P.UARM_L },
  { id: 'forearmL', name: 'Left radius and ulna', part: P.FARM_L },
  { id: 'handL', name: 'Left hand', part: P.HAND_L },
  { id: 'humerusR', name: 'Right humerus', part: P.UARM_R },
  { id: 'forearmR', name: 'Right radius and ulna', part: P.FARM_R },
  { id: 'handR', name: 'Right hand', part: P.HAND_R },
  { id: 'femurL', name: 'Left femur', part: P.THIGH_L },
  { id: 'tibiaL', name: 'Left tibia and fibula', part: P.SHIN_L },
  { id: 'footL', name: 'Left foot', part: P.FOOT_L },
  { id: 'femurR', name: 'Right femur', part: P.THIGH_R },
  { id: 'tibiaR', name: 'Right tibia and fibula', part: P.SHIN_R },
  { id: 'footR', name: 'Right foot', part: P.FOOT_R },
];

/** Where each organ sits inside its part (metres, part space) and how big it is. */
export const ORGANS = [
  { id: 'brain', name: 'Brain', part: P.HEAD, at: [0, 0.03, -0.005], r: 0.078 },
  { id: 'eyeL', name: 'Left eye', part: P.HEAD, at: [0.046, 0.022, 0.1], r: 0.022 },
  { id: 'eyeR', name: 'Right eye', part: P.HEAD, at: [-0.046, 0.022, 0.1], r: 0.022 },
  { id: 'airway', name: 'Windpipe', part: P.NECK, at: [0, 0, 0.028], r: 0.03 },
  { id: 'heart', name: 'Heart', part: P.CHEST, at: [0.025, -0.015, 0.03], r: 0.055 },
  { id: 'lungL', name: 'Left lung', part: P.CHEST, at: [0.098, 0.005, 0], r: 0.076 },
  { id: 'lungR', name: 'Right lung', part: P.CHEST, at: [-0.098, 0.005, 0], r: 0.076 },
  { id: 'liver', name: 'Liver', part: P.ABDOMEN, at: [-0.065, 0.035, 0.02], r: 0.068 },
  { id: 'stomach', name: 'Stomach', part: P.ABDOMEN, at: [0.055, 0.04, 0.03], r: 0.05 },
  { id: 'spleen', name: 'Spleen', part: P.ABDOMEN, at: [0.108, 0.03, -0.04], r: 0.034 },
  { id: 'kidneyL', name: 'Left kidney', part: P.ABDOMEN, at: [0.07, -0.03, -0.058], r: 0.034 },
  { id: 'kidneyR', name: 'Right kidney', part: P.ABDOMEN, at: [-0.07, -0.03, -0.058], r: 0.034 },
  { id: 'gut', name: 'Intestines', part: P.ABDOMEN, at: [0, -0.06, 0.02], r: 0.082, also: { part: P.PELVIS, at: [0, 0.035, 0.02], r: 0.08 } },
  { id: 'bladder', name: 'Bladder', part: P.PELVIS, at: [0, -0.03, 0.05], r: 0.04 },
];

/** How much a part can take before it comes apart. Torso parts never do. */
const PART_HP = [0, 0, 0, 85, 120, 110, 95, 45, 110, 95, 45, 165, 125, 55, 165, 125, 55];
/** Millilitres a second out of the stump when a part comes off there. */
const STUMP_BLEED = [0, 0, 0, 0, 160, 52, 36, 14, 52, 36, 14, 90, 56, 18, 90, 56, 18];
const BONE_OF_PART = {};
for (const b of BONES) (BONE_OF_PART[b.part] = BONE_OF_PART[b.part] || []).push(b.id);

const LIMB_BONE = {
  [P.UARM_L]: 'humerusL', [P.FARM_L]: 'forearmL', [P.HAND_L]: 'handL',
  [P.UARM_R]: 'humerusR', [P.FARM_R]: 'forearmR', [P.HAND_R]: 'handR',
  [P.THIGH_L]: 'femurL', [P.SHIN_L]: 'tibiaL', [P.FOOT_L]: 'footL',
  [P.THIGH_R]: 'femurR', [P.SHIN_R]: 'tibiaR', [P.FOOT_R]: 'footR',
};

export const AMBIENT_TEMP = 16;

const WOUND_NAMES = {
  bruise: 'Bruise', cut: 'Cut', slash: 'Deep slash', stab: 'Stab wound', gunshot: 'Gunshot wound',
  exit: 'Exit wound', stump: 'Amputation', scrape: 'Graze', crush: 'Crush injury', burst: 'Destroyed',
};

let _woundId = 1;

export class Health {
  /**
   * @param {object} o  mass (kg), age, base pulse, toughness 0.8..1.2
   */
  constructor(o = {}) {
    this.mass = o.mass ?? 72;
    this.tough = o.tough ?? 1;
    this.scale = o.scale ?? 1;         // how big they are next to the rig, for where things sit inside them
    this.bloodMax = Math.round(this.mass * 70);
    this.blood = this.bloodMax;
    this.air = 98;
    this.pain = 0;
    this.shock = 0;
    this.nausea = 0;
    this.baseTemp = o.temp ?? 36.8;
    this.temp = this.baseTemp;
    this.basePulse = o.pulse ?? 72;
    this.pulse = this.basePulse;
    this.breath = 15;                 // breaths a minute

    this.bones = {};
    for (const b of BONES) this.bones[b.id] = 100;
    this.organs = {};
    for (const g of ORGANS) this.organs[g.id] = 100;
    this.partHp = PART_HP.slice();
    this.sever = new Float32Array(PARTS.length);   // how far a blade has got through each joint
    this.missing = new Array(PARTS.length).fill(false);

    this.wounds = [];
    this.concussion = 0;              // 0..100, fades
    this.ko = 0;                      // seconds left of being knocked out
    this.faint = 0;
    this.trauma = 0;                  // sudden insult feeding shock, fades
    this.dizzy = 0;                   // from being spun about
    this.disgust = 0;                 // from what they have seen
    this.exertion = 0;                // 0..1
    this.adrenaline = 0;              // 0..1, set from fear and anger
    this.chestBlood = 0;              // ml pooled round the lungs
    this.vomitCooldown = 0;
    this.hypoxia = 0;

    this.alive = true;
    this.heartStopped = false;
    this.arrestTime = 0;
    this.timeDead = 0;
    this.conscious = true;
    this.dazed = false;
    this.cause = '';                  // what killed them, once something has
    this.mechanism = '';              // what is killing them
    this.bleedOut = 0;                // ml/s leaving the body right now
    this.bleedIn = 0;                 // ml/s lost inside
    this.spilled = 0;                 // total ml lost outside
    this.events = [];                 // things that happened this tick: 'vomit', 'faint', 'arrest', 'death', 'wake'
    this.god = false;
  }

  get bloodPct() { return (this.blood / this.bloodMax) * 100; }

  /* --------------------------------- state -------------------------------- */

  boneState(id) {
    const v = this.bones[id];
    return v < 0 ? 'missing' : v < 34 ? 'broken' : v < 67 ? 'fractured' : 'intact';
  }
  organState(id) {
    const v = this.organs[id];
    return v < 0 ? 'missing' : v <= 0 ? 'destroyed' : v < 35 ? 'failing' : v < 75 ? 'damaged' : v < 98 ? 'bruised' : 'healthy';
  }
  hasPart(i) { return !this.missing[i]; }

  get paralysedLegs() { return this.bones.lspine < 34 || this.bones.tspine < 34 || this.bones.cspine < 34; }
  get paralysedArms() { return this.bones.cspine < 34; }

  legOk(side) {
    const t = side > 0 ? P.THIGH_L : P.THIGH_R, f = side > 0 ? 'femurL' : 'femurR', s = side > 0 ? 'tibiaL' : 'tibiaR';
    return !this.missing[t] && !this.missing[t + 1] && !this.missing[t + 2] && this.bones[f] >= 34 && this.bones[s] >= 34;
  }
  legLimp(side) {
    const f = side > 0 ? 'femurL' : 'femurR', s = side > 0 ? 'tibiaL' : 'tibiaR', t = side > 0 ? P.THIGH_L : P.THIGH_R;
    let l = 0;
    if (this.bones[f] < 67 || this.bones[s] < 67) l = 0.7;
    for (const w of this.wounds) if (w.part >= t && w.part <= t + 2 && w.type !== 'bruise') l = Math.max(l, Math.min(0.8, w.pain / 40));
    return l;
  }
  armOk(side) {
    const u = side > 0 ? P.UARM_L : P.UARM_R, h = side > 0 ? 'humerusL' : 'humerusR', f = side > 0 ? 'forearmL' : 'forearmR';
    return !this.missing[u] && !this.missing[u + 1] && !this.missing[u + 2] && this.bones[h] >= 34 && this.bones[f] >= 34 && !this.paralysedArms;
  }
  get canStand() {
    return this.alive && this.conscious && !this.paralysedLegs && this.legOk(1) && this.legOk(-1) &&
      this.bloodPct > 56 && this.pain < 93 && this.shock < 86 && this.bones.pelvis >= 34;
  }
  /** 0..1: how well they can get about, for someone who is on their feet. */
  get mobility() {
    if (!this.canStand) return 0;
    let m = 1 - Math.max(this.legLimp(1), this.legLimp(-1)) * 0.6;
    m *= 1 - clamp01((this.pain - 35) / 90);
    m *= clamp(0.45 + (this.bloodPct - 56) / 40, 0.45, 1);
    if (this.dazed) m *= 0.7;
    return clamp(m, 0.2, 1);
  }
  get blind() { return (this.organs.eyeL <= 20 ? 1 : 0) + (this.organs.eyeR <= 20 ? 1 : 0); }

  /** One word for a doctor, and a number out of a hundred. */
  get condition() {
    if (!this.alive) return { label: 'DEAD', pct: 0, tone: 'dead' };
    const b = clamp01((this.bloodPct - 36) / 54), a = clamp01((this.air - 20) / 72);
    let worst = 100;
    for (const id of ['brain', 'heart', 'lungL', 'lungR', 'liver', 'airway']) worst = Math.min(worst, Math.max(0, this.organs[id]));
    const organs = id2(worst);
    let pct = 100 * Math.min(b, a, organs);
    let hurt = 0;
    for (const w of this.wounds) hurt += w.type === 'bruise' ? 1.2 : w.type === 'stump' ? 14 : 5;
    for (const k in this.bones) if (this.bones[k] >= 0 && this.bones[k] < 67) hurt += this.bones[k] < 34 ? 7 : 4;
    pct = clamp(pct - Math.min(45, hurt) - this.shock * 0.15, 1, 100);
    let label, tone;
    if (this.heartStopped) { label = 'DYING'; tone = 'dead'; pct = Math.min(pct, 4); }
    else if (pct < 22 || this.bloodPct < 55 || this.air < 50) { label = 'CRITICAL'; tone = 'bad'; }
    else if (pct < 48) { label = 'SERIOUS'; tone = 'bad'; }
    else if (pct < 75) { label = 'INJURED'; tone = 'warn'; }
    else if (pct < 96) { label = 'HURT'; tone = 'warn'; }
    else { label = 'HEALTHY'; tone = 'good'; }
    const aware = !this.conscious ? 'unconscious' : this.dazed ? 'dazed' : 'conscious';
    return { label, pct: Math.round(pct), tone, aware };
  }

  /* ---------------------------------- hits -------------------------------- */

  _wound(part, type, lp, ln, o = {}) {
    const w = {
      id: _woundId++, part, type, x: lp[0], y: lp[1], z: lp[2], nx: ln[0], ny: ln[1], nz: ln[2],
      size: o.size ?? 0.05, bleed: o.bleed ?? 0, base: o.bleed ?? 0, arterial: !!o.arterial,
      pain: o.pain ?? 0, pain0: o.pain ?? 0, age: 0, clotTime: o.clot ?? 40, angle: o.angle ?? 0,
      name: WOUND_NAMES[type] || type, drip: 0, decal: -1, run: -1,
    };
    this.wounds.push(w);
    // keep the list from growing without end: the oldest bruises go first
    if (this.wounds.length > 60) {
      const i = this.wounds.findIndex((q) => q.type === 'bruise');
      if (i >= 0) { this.wounds[i].dropped = true; this.wounds.splice(i, 1); }
    }
    return w;
  }

  _bone(id, amount, out) {
    if (this.bones[id] < 0) return;
    const before = this.boneState(id);
    this.bones[id] = Math.max(0, this.bones[id] - amount);
    const after = this.boneState(id);
    if (after !== before) {
      out.bones.push({ id, state: after });
      this.trauma += after === 'broken' ? 16 : 7;
    }
  }
  _organ(id, amount, out) {
    if (this.organs[id] < 0) return;
    const before = this.organs[id];
    this.organs[id] = Math.max(0, before - amount);
    if (amount > 1) out.organs.push({ id, lost: before - this.organs[id] });
  }

  /**
   * Something hit them.
   *   part     which of the seventeen parts
   *   type     'blunt' | 'cut' | 'stab' | 'bullet' | 'crush'
   *   power    1 is an ordinary full blow with that kind of weapon
   *   lp, ln   where on the part, and the face it landed on (part space)
   *   ld       which way it was travelling (part space, unit)
   *   through  for a bullet, how far it travels inside the part (metres)
   *   chop     for a blade, how much of a limb it takes off (0 for a knife)
   * Returns a report: { pain, wound, exit, bones[], organs[], severed, burst,
   * arterial, killed, ko }.
   */
  hit({ part, type, power = 1, lp, ln, ld = [0, 0, -1], through = 0.2, chop = 0, hp = null, weapon = '' }) {
    const out = { part, type, pain: 0, wound: null, exit: null, bones: [], organs: [], severed: -1, burst: false, arterial: false, killed: false, ko: false, bled: 0 };
    if (!this.alive && type === 'blunt') { this._structural(part, power * 4, out, false); return out; }
    if (this.missing[part] || this.god) return out;
    const p = power / this.tough;
    const head = part === P.HEAD, neck = part === P.NECK, chest = part === P.CHEST, belly = part === P.ABDOMEN, hips = part === P.PELVIS;
    const torso = chest || belly || hips;
    const limb = LIMB_BONE[part];
    const front = ln[2] > 0.5;

    if (type === 'blunt' || type === 'crush') {
      const crush = type === 'crush';
      const pain = clamp(7 + p * 9 + (head ? 4 : 0), 0, 55);
      out.wound = this._wound(part, crush ? 'crush' : 'bruise', lp, ln, { size: 0.05 + p * 0.03, pain, clot: 1 });
      out.pain = pain;
      if (head) {
        this.concussion = Math.min(100, this.concussion + p * (crush ? 34 : 17));
        if (front && p > 0.75 && chance(0.25 + p * 0.25)) { out.wound.nose = true; out.wound.bleed = out.wound.base = 0.35; out.wound.clotTime = 30; }
        if (p > 0.95 && chance((p - 0.8) * 0.35)) this._bone('jaw', 40 + p * 14, out);
        if (p > 1.7) { this._bone('skull', (p - 1.2) * 46, out); this._organ('brain', (p - 1.5) * 34, out); }
        if (front && p > 1.25 && chance(0.12)) this._organ(chance(0.5) ? 'eyeL' : 'eyeR', 40 + p * 20, out);
        // a clean one on the chin puts the lights out
        const koChance = (this.concussion - 22) / 70 + (p > 0.8 ? (p - 0.8) * 0.5 : 0);
        if (this.conscious && chance(koChance)) { this.ko = Math.max(this.ko, 4 + this.concussion * 0.14 + rand(4)); out.ko = true; }
      } else if (neck) {
        if (p > 1.3) this._organ('airway', (p - 1) * 30, out);
        if (p > 2.2) this._bone('cspine', (p - 1.6) * 50, out);
      } else if (chest) {
        if (p > 1.0 && chance((p - 0.85) * 0.45)) this._bone(lp[0] > 0 ? 'ribsL' : 'ribsR', 30 + p * 16, out);
        if (p > 1.9) { this._bone('sternum', (p - 1.4) * 40, out); this._organ(lp[0] > 0 ? 'lungL' : 'lungR', (p - 1.5) * 26, out); }
        if (p > 2.6) { this._organ('heart', (p - 2.2) * 30, out); this._bone('tspine', (p - 2.2) * 40, out); }
      } else if (belly) {
        if (p > 1.15) this._organ(lp[0] > 0 ? (chance(0.5) ? 'stomach' : 'spleen') : 'liver', (p - 0.95) * 20, out);
        if (p > 1.5) this._organ('gut', (p - 1.2) * 16, out);
        if (p > 2.4) this._bone('lspine', (p - 1.9) * 44, out);
        this.nausea = Math.min(100, this.nausea + p * 9);
      } else if (hips) {
        if (p > 1.9) this._bone('pelvis', (p - 1.4) * 38, out);
        if (p > 1.6) this._organ('bladder', (p - 1.3) * 22, out);
      } else if (limb) {
        if (p > 1.45) this._bone(limb, (p - 1.05) * 46, out);
      }
      this._structural(part, p * (crush ? 22 : 5), out, false);
    } else if (type === 'cut') {
      // a slash: deep is how far in it went, in centimetres
      const deep = p * 1.6;
      const big = deep > 2.1;
      let bleed = big ? 2.5 + deep * 1.6 : 0.8 + deep * 0.5;
      const pain = clamp(11 + deep * 6, 0, 60);
      let arterial = false;
      if (neck && deep > 1.1 && chance(0.35 + deep * 0.12)) { bleed += 95 + deep * 12; arterial = true; }
      else if ((part === P.THIGH_L || part === P.THIGH_R) && deep > 2 && chance(0.26)) { bleed += 55; arterial = true; }
      else if ((part === P.UARM_L || part === P.UARM_R) && deep > 1.6 && chance(0.22)) { bleed += 28; arterial = true; }
      else if ((part === P.FARM_L || part === P.FARM_R) && deep > 1.2 && chance(0.28)) { bleed += 12; arterial = true; }
      out.wound = this._wound(part, big ? 'slash' : 'cut', lp, ln, { size: 0.07 + deep * 0.03, bleed, pain, arterial, clot: big ? 75 : 26, angle: Math.atan2(ld[1], ld[0] || 1e-6) });
      out.pain = pain; out.arterial = arterial;
      if (neck && deep > 1.4) this._organ('airway', deep * 14, out);
      if (head && front && chance(0.2 + deep * 0.06)) this._organ(lp[0] > 0 ? 'eyeL' : 'eyeR', 60 + deep * 15, out);
      if (belly && deep > 2.6) this._organ('gut', (deep - 2) * 16, out);
      if (chest && deep > 2.8) this._bone(lp[0] > 0 ? 'ribsL' : 'ribsR', (deep - 2.2) * 26, out);
      if (limb && deep > 2.4) this._bone(limb, (deep - 1.8) * 30, out);
      if (head && deep > 2.6) { this._bone('skull', (deep - 2) * 34, out); if (deep > 3.4) this._organ('brain', (deep - 3) * 60, out); }
      this.trauma += deep * 2.5;
      // a heavy blade works its way through a joint
      if (chop > 0 && (limb || neck || head)) {
        const at = head ? P.HEAD : part;
        this.sever[at] += chop * p * (neck || head ? 0.62 : 0.5);
        if (this.sever[at] >= 1) out.severed = at;
      }
      this._structural(part, p * (chop > 0 ? 14 : 4), out, true);
    } else if (type === 'stab') {
      const depth = clamp(0.07 + p * 0.05, 0.05, 0.19);
      let bleed = 2 + p * 2.2;
      const pain = clamp(15 + p * 8, 0, 60);
      let arterial = false;
      if (neck && chance(0.55)) { bleed += 100; arterial = true; }
      else if ((part === P.THIGH_L || part === P.THIGH_R) && chance(0.3)) { bleed += 55; arterial = true; }
      else if ((part === P.UARM_L || part === P.UARM_R) && chance(0.2)) { bleed += 28; arterial = true; }
      out.wound = this._wound(part, 'stab', lp, ln, { size: 0.05, bleed, pain, arterial, clot: 65 });
      out.pain = pain; out.arterial = arterial;
      let reach = depth;
      if (chest && chance(0.28)) { this._bone(lp[0] > 0 ? 'ribsL' : 'ribsR', 14, out); reach *= 0.55; }
      this._path(part, lp, ld, reach, 38 + p * 20, out);
      if (neck) this._organ('airway', 30 + p * 20, out);
      this.trauma += 6 + p * 3;
      this._structural(part, p * 5, out, true);
    } else if (type === 'bullet') {
      const pain = clamp(24 + p * 10, 0, 70);
      let bleed = 3.2 + p * 2.4;
      let arterial = false;
      if (neck && chance(0.5)) { bleed += 105; arterial = true; }
      else if ((part === P.THIGH_L || part === P.THIGH_R) && chance(0.24)) { bleed += 55; arterial = true; }
      else if ((part === P.UARM_L || part === P.UARM_R) && chance(0.16)) { bleed += 28; arterial = true; }
      out.wound = this._wound(part, 'gunshot', lp, ln, { size: 0.035 + p * 0.008, bleed, pain, arterial, clot: 85 });
      out.pain = pain; out.arterial = arterial;
      const goesThrough = torso || head ? chance(p > 1.2 ? 0.88 : 0.5) : chance(0.85);
      out.through = goesThrough;
      if (goesThrough) {
        const ex = [lp[0] + ld[0] * through, lp[1] + ld[1] * through, lp[2] + ld[2] * through];
        out.exit = this._wound(part, 'exit', ex, [-ln[0], -ln[1], -ln[2]], { size: 0.06 + p * 0.02, bleed: bleed * 1.5, pain: pain * 0.4, clot: 95 });
      }
      this._path(part, lp, ld, goesThrough ? through : through * 0.6, 60 + p * 28, out);
      if (head) { this._bone('skull', 60 + p * 20, out); }
      else if (neck) { this._organ('airway', 30 + p * 25, out); if (Math.abs(lp[0]) < 0.03 && chance(0.4)) this._bone('cspine', 55 + p * 20, out); }
      else if (chest) {
        if (chance(0.45)) this._bone(lp[0] > 0 ? 'ribsL' : 'ribsR', 26 + p * 14, out);
        if (Math.abs(lp[0]) < 0.04 && chance(0.3)) this._bone('tspine', 50 + p * 22, out);
        if (lp[1] > 0.09 && chance(0.25)) this._bone(lp[0] > 0 ? 'clavL' : 'clavR', 50, out);
      } else if (belly) { if (Math.abs(lp[0]) < 0.04 && chance(0.3)) this._bone('lspine', 50 + p * 22, out); }
      else if (hips) { if (chance(0.5)) this._bone('pelvis', 28 + p * 16, out); }
      else if (limb && chance(0.55)) this._bone(limb, 46 + p * 22, out);
      this.trauma += 14 + p * 7;
      this._structural(part, hp ?? p * 30, out, false);
    }

    if (out.bones.length) out.pain += 12 * out.bones.length;
    // sudden agony can drop someone on the spot
    if (this.conscious && out.pain > 30 && chance((this.pain + out.pain - 105) / 140)) { this.faint = Math.max(this.faint, 5 + rand(7)); this.events.push('faint'); }
    this._checkDeath(type, weapon, out);
    return out;
  }

  /** Damage to whatever lies along a straight line through a part. */
  _path(part, lp, ld, len, amount, out) {
    for (const g of ORGANS) {
      const spots = g.part === part ? [g] : g.also && g.also.part === part ? [g.also] : null;
      if (!spots) continue;
      const s = spots[0], sc = this.scale, rad = s.r * sc;
      // closest approach of the segment to the organ's centre
      const cx = s.at[0] * sc - lp[0], cy = s.at[1] * sc - lp[1], cz = s.at[2] * sc - lp[2];
      const t = clamp(cx * ld[0] + cy * ld[1] + cz * ld[2], 0, len);
      const d = Math.hypot(cx - ld[0] * t, cy - ld[1] * t, cz - ld[2] * t);
      if (d > rad) continue;
      // a line through the middle does more than one that clips the edge
      const k = 0.45 + 0.55 * (1 - d / rad);
      let dmg = amount * k;
      if (g.id === 'brain') dmg *= 2.1;
      if (g.id === 'eyeL' || g.id === 'eyeR') dmg = 100;
      this._organ(g.id, dmg, out);
    }
  }

  /** Wear on the part as a whole. Enough of it and the part is gone. */
  _structural(part, amount, out, blade) {
    if (PART_HP[part] === 0 || this.missing[part]) return;
    this.partHp[part] -= amount;
    if (this.partHp[part] <= 0) {
      if (blade) { if (out.severed < 0) out.severed = part; }
      else out.burst = true;
    }
  }

  /**
   * A part has come off, or been destroyed, taking everything below it.
   * `burst` means it no longer exists; otherwise it is lying somewhere.
   */
  lose(part, parts, burst = false) {
    const out = { stump: null };
    for (const i of parts) {
      if (this.missing[i]) continue;
      this.missing[i] = true;
      for (const id of BONE_OF_PART[i] || []) this.bones[id] = -1;
      for (const g of ORGANS) if (g.part === i) this.organs[g.id] = -1;
      // wounds on what is gone no longer matter to this body
      for (const w of this.wounds) if (w.part === i) { w.bleed = 0; w.base = 0; w.pain = 0; w.pain0 = 0; w.gone = true; }
    }
    const parent = PARTS[part].parent;
    const rate = STUMP_BLEED[part] * (0.85 + Math.random() * 0.3);
    if (parent >= 0) {
      const a = PARTS[part].la, j = [a[0] * this.scale, a[1] * this.scale, a[2] * this.scale];
      const s = this._wound(parent, 'stump', j, [Math.sign(j[0]) * (Math.abs(j[0]) > 0.15 ? 1 : 0), j[1] > 0 ? 1 : -1, 0], {
        size: 0.1, bleed: rate, arterial: true, pain: part === P.HEAD ? 0 : 62, clot: part === P.HEAD ? 8 : 190,
      });
      s.stumpOf = part;
      out.stump = s;
    }
    this.trauma += 34;
    if (part === P.HEAD || part === P.NECK) {
      this._die(burst ? 'Head destroyed' : 'Decapitation');
    } else if (this.alive) {
      this.pain = Math.min(100, this.pain + 45);
    }
    return out;
  }

  _checkDeath(type, weapon, out) {
    if (!this.alive) return;
    const how = type === 'bullet' ? 'gunshot' : type === 'stab' ? 'stab wound' : type === 'cut' ? 'blade' : 'blunt trauma';
    if (this.organs.brain >= 0 && this.organs.brain <= 0) { this._die('Brain destroyed (' + how + ')'); out.killed = true; return; }
    if (this.organs.heart >= 0 && this.organs.heart < 25 && !this.heartStopped) {
      this.heartStopped = true; this.mechanism = 'Heart destroyed (' + how + ')'; this.events.push('arrest');
    }
    if (this.bones.cspine >= 0 && this.bones.cspine < 20 && !this.mechanism) this.mechanism = 'Broken neck';
  }

  _die(cause) {
    if (!this.alive) return;
    this.alive = false; this.conscious = false; this.dazed = false;
    this.heartStopped = true;
    this.cause = cause || this.mechanism || 'Unknown';
    this.pulse = 0; this.breath = 0;
    this.events.push('death');
  }

  kill(cause) { this._die(cause); }

  /** Puts everything back, limbs excepted: those are a matter for whoever owns the body. */
  heal() {
    this.blood = this.bloodMax; this.air = 98; this.pain = 0; this.shock = 0; this.nausea = 0; this.temp = this.baseTemp;
    for (const k in this.bones) if (this.bones[k] >= 0) this.bones[k] = 100;
    for (const k in this.organs) if (this.organs[k] >= 0) this.organs[k] = 100;
    for (let i = 0; i < this.partHp.length; i++) { this.partHp[i] = PART_HP[i]; this.sever[i] = 0; }
    for (const w of this.wounds) w.dropped = true;
    this.wounds = this.wounds.filter((w) => w.type === 'stump');
    for (const w of this.wounds) { w.bleed = 0; w.base = 0; w.pain = 0; w.pain0 = 0; w.dropped = false; }
    this.concussion = 0; this.ko = 0; this.faint = 0; this.trauma = 0; this.chestBlood = 0; this.hypoxia = 0;
    if (!this.missing[P.HEAD]) { this.alive = true; this.heartStopped = false; this.conscious = true; this.cause = ''; this.mechanism = ''; this.pulse = this.basePulse; this.arrestTime = 0; this.timeDead = 0; }
  }

  /* --------------------------------- time --------------------------------- */

  /**
   * Runs the body forward. `fear` and `anger` are 0..100 from whoever is
   * doing their feeling for them; `moving` is 0 (still) to 1 (flat out).
   */
  tick(dt, { fear = 0, anger = 0, moving = 0 } = {}) {
    this.events.length = 0;
    const O = this.organs, B = this.bones;
    this.exertion = lerp(this.exertion, moving, 1 - Math.exp(-dt / 6));
    this.adrenaline = clamp01(fear * 0.008 + anger * 0.005);
    const pct = this.bloodPct;

    /* ---- bleeding ---- */
    const beating = !this.heartStopped;
    // pressure falls with volume; a stopped heart leaves only what gravity drains
    const pressure = beating ? Math.pow(clamp(pct / 100, 0.25, 1), 1.4) * (0.75 + this.pulse / 300) : Math.max(0, 0.1 - this.arrestTime * 0.004);
    let out = 0;
    for (const w of this.wounds) {
      w.age += dt;
      if (w.base > 0) {
        // clotting: small wounds close, big ones slow to a seep, arteries barely notice
        const floor = w.arterial ? 0.55 : w.type === 'cut' ? 0 : w.type === 'bruise' ? 0 : 0.14;
        const target = w.base * floor;
        const k = 1 - Math.exp(-dt / w.clotTime);
        w.bleed += (target - w.bleed) * k;
        if (w.bleed < 0.02) w.bleed = 0;
        w.flow = w.bleed * pressure;
        out += w.flow;
      } else w.flow = 0;
      if (w.pain > w.pain0 * 0.32) w.pain -= (w.pain - w.pain0 * 0.32) * (1 - Math.exp(-dt / 45));
    }
    let inside = 0;
    if (O.heart >= 0) inside += (100 - O.heart) * 0.7;
    if (O.liver >= 0) inside += (100 - O.liver) * 0.22;
    if (O.spleen >= 0) inside += (100 - O.spleen) * 0.2;
    if (O.kidneyL >= 0) inside += (100 - O.kidneyL) * 0.1;
    if (O.kidneyR >= 0) inside += (100 - O.kidneyR) * 0.1;
    if (O.gut >= 0) inside += (100 - O.gut) * 0.035;
    if (O.stomach >= 0) inside += (100 - O.stomach) * 0.04;
    let lungBleed = 0;
    if (O.lungL >= 0) lungBleed += (100 - O.lungL) * 0.09;
    if (O.lungR >= 0) lungBleed += (100 - O.lungR) * 0.09;
    inside = (inside + lungBleed) * pressure;
    this.chestBlood = Math.min(1800, this.chestBlood + lungBleed * pressure * dt);
    this.bleedOut = out; this.bleedIn = inside;
    if (this.blood > 0) {
      const lost = Math.min(this.blood, (out + inside) * dt);
      this.blood -= lost;
      this.spilled += Math.min(lost, out * dt);
    }

    if (!this.alive) {
      this.timeDead += dt; this.arrestTime += dt;
      this.temp += (AMBIENT_TEMP - this.temp) * (1 - Math.exp(-dt / 280));
      this.pain = 0; this.air = Math.max(0, this.air - dt * 5); this.shock = Math.max(this.shock, 0);
      this.pulse = 0; this.breath = 0;
      return;
    }

    /* ---- breathing ---- */
    const lungs = ((O.lungL < 0 ? 0 : O.lungL) + (O.lungR < 0 ? 0 : O.lungR)) / 200;
    let vent = lungs * (1 - this.chestBlood / 2400);
    vent *= O.airway < 0 ? 0 : 0.25 + 0.75 * (O.airway / 100);
    if (B.ribsL < 67 || B.ribsR < 67) vent *= 0.86;
    const drive = (O.brain > 8 ? 1 : 0) * (B.cspine < 0 ? 0 : B.cspine < 34 ? 0.2 : 1);
    vent *= drive;
    // someone awake and frightened breathes harder and makes some of it back
    const effort = this.conscious ? 1.3 + this.exertion * 0.15 : 1.12;
    const airTarget = this.heartStopped ? 0 : clamp(vent * effort, 0, 1) * 98;
    if (airTarget < this.air) this.air -= Math.min(this.air - airTarget, (vent < 0.05 ? 4.2 : 1 + (this.air - airTarget) * 0.09) * dt);
    else this.air += (airTarget - this.air) * (1 - Math.exp(-dt / 5));
    this.breath = drive === 0 || this.heartStopped ? 0 :
      clamp(14 + fear * 0.12 + this.exertion * 16 + (98 - this.air) * 0.5 + this.pain * 0.06 + (100 - pct) * 0.2, 6, 44);

    /* ---- the heart ---- */
    if (beating) {
      let target = this.basePulse + fear * 0.55 + anger * 0.3 + this.pain * 0.3 + this.exertion * 62 + clamp((100 - pct) * 2.3, 0, 75);
      if (pct < 47) target -= (47 - pct) * 11;             // nothing left to pump
      if (this.air < 30) target -= (30 - this.air) * 4;
      if (O.heart < 60) target *= 0.5 + O.heart / 120;
      target = clamp(target, 0, 190);
      this.pulse += (target - this.pulse) * (1 - Math.exp(-dt / 2.2));
      if (this.pulse < 24) {
        this.heartStopped = true; this.pulse = 0;
        this.mechanism = this.mechanism || (pct < 47 ? 'Blood loss' : this.air < 30 ? 'Asphyxia' : 'Cardiac arrest');
        this.events.push('arrest');
      }
    } else {
      this.arrestTime += dt; this.pulse = 0;
    }

    /* ---- the brain: no oxygen, no brain ---- */
    const delivery = this.heartStopped ? 0 : clamp((pct - 32) / 34, 0, 1);
    const o2 = (this.air / 100) * delivery;
    if (o2 < 0.4 && O.brain > 0) {
      this.hypoxia += dt;
      O.brain = Math.max(0, O.brain - (0.4 - o2) * 16 * dt);
      if (O.brain <= 0) { this._die(this.mechanism || (pct < 56 ? 'Blood loss' : this.air < 50 ? 'Asphyxia' : 'Cardiac arrest')); return; }
    }

    /* ---- pain ---- */
    let keep = 1, bonePain = 0;
    for (const w of this.wounds) keep *= 1 - clamp01(w.pain / 100);
    for (const k in B) { const v = B[k]; if (v >= 0 && v < 67) bonePain += v < 34 ? 22 + moving * 14 : 10 + moving * 6; }
    let felt = 100 * (1 - keep * (1 - clamp01(bonePain / 100)));
    felt *= 1 - this.adrenaline * 0.45;
    if (this.shock > 60) felt *= 1 - (this.shock - 60) / 110;         // too far gone to feel it
    this.pain += (felt - this.pain) * (1 - Math.exp(-dt / (felt > this.pain ? 0.35 : 6)));

    /* ---- shock ---- */
    this.trauma = Math.max(0, this.trauma - dt * 1.3);
    const shockTarget = clamp(clamp((86 - pct) * 2.6, 0, 100) + this.pain * 0.22 + Math.min(40, this.trauma) + (98 - this.air) * 0.25, 0, 100);
    this.shock += (shockTarget - this.shock) * (1 - Math.exp(-dt / (shockTarget > this.shock ? 4 : 50)));

    /* ---- nausea ---- */
    this.concussion = Math.max(0, this.concussion - dt * 1.1);
    this.dizzy = Math.max(0, this.dizzy - dt * 5);
    this.disgust = Math.max(0, this.disgust - dt * 2.2);
    this.vomitCooldown = Math.max(0, this.vomitCooldown - dt);
    const nTarget = clamp((O.stomach < 0 ? 0 : 100 - O.stomach) * 0.75 + (O.gut < 0 ? 0 : 100 - O.gut) * 0.35 + this.concussion * 0.85 +
      Math.max(0, this.pain - 55) * 0.5 + this.shock * 0.32 + this.dizzy + this.disgust + (O.liver < 0 ? 0 : 100 - O.liver) * 0.2, 0, 100);
    this.nausea += (nTarget - this.nausea) * (1 - Math.exp(-dt / (nTarget > this.nausea ? 3.5 : 14)));
    if (this.nausea > 78 && this.conscious && this.vomitCooldown <= 0) {
      this.events.push('vomit');
      this.vomitBlood = O.stomach < 70 || O.lungL < 60 || O.lungR < 60;
      this.nausea -= 42; this.vomitCooldown = 11; this.disgust *= 0.3; this.dizzy *= 0.3;
    }

    /* ---- temperature ---- */
    const tTarget = this.baseTemp + this.exertion * 1.0 + fear * 0.002 - this.shock * 0.021 - Math.max(0, 82 - pct) * 0.04;
    this.temp += (tTarget - this.temp) * (1 - Math.exp(-dt / 22));

    /* ---- is anyone home ---- */
    const wasAwake = this.conscious;
    this.ko = Math.max(0, this.ko - dt); this.faint = Math.max(0, this.faint - dt);
    const out2 = O.brain < 30 || this.air < 46 || pct < 53 || this.shock > 91 || this.ko > 0 || this.faint > 0 || (this.heartStopped && this.arrestTime > 2.5);
    this.conscious = !out2;
    this.dazed = this.conscious && (this.air < 66 || pct < 64 || this.shock > 72 || this.concussion > 34 || this.pain > 86);
    if (wasAwake && !this.conscious) this.events.push('out');
    if (!wasAwake && this.conscious) this.events.push('wake');
  }

  /** A plain list of what is wrong, worst first, for the doctor's panel. */
  findings() {
    const list = [];
    for (const b of BONES) {
      const s = this.boneState(b.id);
      if (s !== 'intact') list.push({ kind: 'bone', id: b.id, name: b.name, state: s, sev: s === 'missing' ? 3 : s === 'broken' ? 2 : 1 });
    }
    for (const g of ORGANS) {
      const s = this.organState(g.id);
      if (s !== 'healthy') list.push({ kind: 'organ', id: g.id, name: g.name, state: s, pct: Math.max(0, Math.round(this.organs[g.id])), sev: s === 'bruised' ? 0 : s === 'damaged' ? 1 : s === 'failing' ? 2 : 3 });
    }
    return list.sort((a, b) => b.sev - a.sev);
  }
}

/** How much a failing vital organ drags the whole down. */
function id2(v) { return clamp01(0.25 + v / 100 * 0.75); }

export function partLabel(i) { return PARTS[i].label; }
