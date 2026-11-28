/* =============================================================================
   Special abilities.

   One technique anybody can do: TEMPEST KICK, a kick so high and so fast that
   the air it cuts goes on without it, a green crescent that flies on and cuts
   through whatever it meets until a building stops it.

   The rest come from eating the Cat-Cat Fruit, Model: Leopard (it tastes
   terrible):
     FINGER PISTOL     one finger, held straight and driven into somebody like
                       a round; it goes in like one
     LEO'S FLAME       five fireballs, one after another, at whoever is nearest:
                       they catch fire where they are hit
     SWIRLING KICK     a spinning kick that sends a white ring of air spinning
                       forward; where it lands it bursts into flame
     FULL LEOPARD      a leopard, on all fours, more than twice as fast as a
                       person; the first person it runs into it pounces on,
                       bites and mauls, and then it is a person again
     LEOPARD LEAP      a leopard's bound; whoever it lands on takes a finger
                       from each hand, the Finger Pistol twice
     HYBRID TRANSFORM  half leopard, half person, upright, with claws on every
                       finger: every attack bigger, harder and faster, and
                       punches become claws

   And one that needs nothing eaten: HULK TRANSFORM, half as big again, green
   and very hard to hurt (the shirt and the shoes burst off, the trousers
   split), with three moves of its own:
     HULK PUNCH        one enormous punch: whoever it lands on is sent flying,
                       and so is a car
     HULK SMASH        both fists into the ground, and everyone near is thrown
                       off their feet; held, a leap at the nearest person and
                       the smash on top of them
     ROCK THROW        a rock torn out of the ground and held overhead, thrown
                       with the same button; next to a car, or what is left of
                       one, the car instead

   They are chosen in the ABILITIES menu, beside SPAWN; POWER uses whichever
   was chosen, and each has a key. Nobody watching is unmoved.
   ========================================================================== */
import * as THREE from 'three';
import { Boxes } from '../render/boxes.js';
import { ST } from '../human/human.js';
import { P, PART_COUNT } from '../human/rig.js';
import { Body, Island, rayBody } from '../physics/world.js';
import { groundHeight } from '../world/city.js';
import { clamp, clamp01, lerp, smooth, rand, chance, pick, wrapAngle, TAU } from '../core/util.js';

export const ABILITIES = [
  { id: 'tempest', name: 'Tempest Kick', short: 'TEMPEST', key: 'J', fruit: false, cool: 1.3, desc: 'A kick so fast the air it cuts flies on: a green slash that cuts through what it meets.' },
  { id: 'finger', name: 'Finger Pistol', short: 'FINGER', key: 'K', fruit: true, cool: 0.45, desc: 'One finger, held straight and driven in like a round.' },
  { id: 'flame', name: "Leo's Flame", short: 'FLAME', key: 'L', fruit: true, cool: 3.2, desc: 'Five fireballs, one after another, at whoever is nearest.' },
  { id: 'swirl', name: 'Swirling Kick', short: 'SWIRL', key: 'U', fruit: true, cool: 2.4, desc: 'A spinning kick: a white ring of air spins forward and bursts into flame where it lands.' },
  { id: 'leopard', name: 'Full Leopard', short: 'LEOPARD', key: 'I', fruit: true, cool: 1.5, form: true, desc: 'A leopard on all fours, very fast. Run into somebody to pounce, bite and maul them; then you turn back.' },
  { id: 'leap', name: 'Leopard Leap', short: 'LEAP', key: 'O', fruit: true, cool: 1.8, desc: 'A leopard’s bound. Whoever you land on takes a Finger Pistol from each hand.' },
  { id: 'hybrid', name: 'Hybrid Transform', short: 'HYBRID', key: 'Y', fruit: true, cool: 1.5, form: true, desc: 'Half leopard, standing, with claws: every attack bigger, stronger and faster.' },
  { id: 'hulk', name: 'Hulk Transform', short: 'HULK', key: '6', fruit: false, group: 'hulk', cool: 1.5, form: true, desc: 'Half as big again, green and very hard to hurt; far stronger than anything else here. The shirt does not survive it.' },
  { id: 'hulkPunch', name: 'Hulk Punch', short: 'H.PUNCH', key: '7', fruit: false, group: 'hulk', hulk: true, cool: 0.9, desc: 'One enormous punch. Whoever it lands on goes flying, and so does a car.' },
  { id: 'hulkSmash', name: 'Hulk Smash', short: 'SMASH', key: '8', fruit: false, group: 'hulk', hulk: true, cool: 2.2, desc: 'Both fists into the ground: everyone near is thrown off their feet. Hold it to leap at the nearest person and smash down on them.' },
  { id: 'rock', name: 'Rock Throw', short: 'ROCK', key: '9', fruit: false, group: 'hulk', hulk: true, cool: 0.6, desc: 'Tear a rock out of the ground; the same button throws it. Next to a car, or a wreck, you pick that up instead.' },
];
export const ABILITY = Object.fromEntries(ABILITIES.map((a) => [a.id, a]));

/** How the rest of the game sees the techniques that are swung like weapons. */
const DEF = {
  tempest: { id: 'tempest', name: 'Tempest Kick', melee: true, moves: [] },
  swirl: { id: 'swirl', name: 'Swirling Kick', melee: true, moves: [] },
  finger: { id: 'fingerpistol', name: 'Finger Pistol', melee: true, pierce: true, moves: [] },
  hulkPunch: { id: 'hulkpunch', name: 'Hulk Punch', melee: true, smash: true, moves: [] },
};
/** What the slash and the burst are, to a car they hit. */
const SLASH_HIT = { def: { blade: true, blunt: true, hitSound: 'clang' }, clip: { power: 2.4, limb: 'blade' } };

const FUR = 0xc98f2e, FUR_D = 0x9c6a1c, SPOT = 0x2a1c0e, CREAM = 0xeedcb4, NOSE = 0x2b1a14, EYE = 0xd8d84a, WHITE = 0xf3eee0;
const SUIT = 0x17181c, LAPEL = 0x25272d, SHOE = 0x0b0b0d, HAT = 0x111114, BAND = 0xb3121a, TIE = 0x0c0c0e;
/** The hybrid's colours, part by part: a black suit and shoes, and leopard where it shows (the head, the neck, the hands). */
const HYBRID_COAT = Array.from({ length: PART_COUNT }, (_, i) => (i === P.HEAD || i === P.NECK || i === P.HAND_L || i === P.HAND_R ? FUR : i === P.FOOT_L || i === P.FOOT_R ? SHOE : SUIT));
/** How much bigger the hybrid stands, and how much more it takes. */
const HYBRID_SIZE = 1.3, HYBRID_TOUGH = 2.6, HYBRID_STURDY = 2.8;
/** The Hulk: green skin, and what is left of whatever trousers they had on (dark ones, if they had none). */
const HULK_SKIN = 0x5d9b3b, TROUSERS = 0x2f3644;
const LEGS = new Set([P.PELVIS, P.THIGH_L, P.THIGH_R, P.SHIN_L, P.SHIN_R]);
const hulkCoat = (h) => Array.from({ length: PART_COUNT }, (_, i) => (LEGS.has(i) && h.cloth[i] >= 0 ? h.cloth[i] : i === P.PELVIS ? TROUSERS : HULK_SKIN));
/** How much bigger the Hulk stands, how much more it takes, how much harder it is to knock down. */
const HULK_SIZE = 1.45, HULK_TOUGH = 5, HULK_STURDY = 6;
/** And how much broader than that, part by part: a huge chest, shoulders and arms, thick legs, a head no bigger than it was. */
const HULK_BRAWN = Array.from({ length: PART_COUNT }, (_, i) => ({ [P.PELVIS]: 1.3, [P.ABDOMEN]: 1.32, [P.CHEST]: 1.42, [P.NECK]: 1.55, [P.HEAD]: 1.02,
  [P.UARM_L]: 1.55, [P.UARM_R]: 1.55, [P.FARM_L]: 1.5, [P.FARM_R]: 1.5, [P.THIGH_L]: 1.45, [P.THIGH_R]: 1.45, [P.SHIN_L]: 1.4, [P.SHIN_R]: 1.4, [P.FOOT_L]: 1.18, [P.FOOT_R]: 1.18 })[i] || 1);
/** Its face over the green: darker lids and lips, heavy black brows. */
const HULK_FACE = { skinShade: 'rgb(61,104,38)', lip: 'rgb(48,86,30)', brow: 'rgb(20,26,14)', browW: 3.6 };
const STONE = [0x7f7b74, 0x6f6c66, 0x8b8780, 0x77736c], DIRT = 0x5a4531, DIRT_D = 0x463424;
const RUBBLE = new Float32Array([0.42, 0.4, 0.37, 0.33, 0.27, 0.2]);
const _a = [0, 0, 0], _b = [0, 0, 0], _q = [0, 0, 0, 1], _q2 = [0, 0, 0, 1];
const _ch = { lp: [0, 0, 0], ln: [0, 0, 0], xn: [0, 0, 0], tag: '', piece: 0, exit: 0, glass: -1 };

export class Powers {
  constructor(game) {
    this.g = game;
    this.fruit = false;            // the fruit has been eaten
    this.selected = 'tempest';     // what POWER does
    this.cool = {};                // seconds before each can be used again
    this.form = null;              // null, 'leopard' or 'hybrid'
    this.formT = 0;
    this.shots = [];               // slashes, fireballs and rings of air in flight
    this.later = [];               // things that happen a moment from now
    this.glows = [];               // flashes of light that fade
    this.eating = null;
    this.cast = null;              // fireballs still to come
    this.maul = null;
    this.leapT = 0;
    this.carry = null;             // the Hulk's rock or car, overhead
    this.smash = null;             // HULK SMASH: winding up, or in the air
    // things that glow: drawn unlit and added on to whatever is behind them
    this.glow = new Boxes(game.scene, 360, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }), { shadows: false });
    this.leo = null;               // the leopard's boxes
    this.hyb = null;               // the hybrid's: spots, head, tail
    this.phase = 0;                // the leopard's stride
    this.stats = { tempest: 0, slashHits: 0, finger: 0, fireballs: 0, fireHits: 0, swirls: 0, bursts: 0, mauls: 0, bites: 0, leaps: 0, leapHits: 0, transforms: 0, eaten: 0,
      hulkPunches: 0, flung: 0, smashes: 0, smashLeaps: 0, smashHits: 0, rocks: 0, lifts: 0, throws: 0, carsThrown: 0, holes: 0 };
  }

  /* ---------------------------------- asking ---------------------------------- */

  has(id) { const a = ABILITY[id]; return !!a && (!a.fruit || this.fruit); }
  ready(id) { return (this.cool[id] || 0) <= 0; }
  /** 0 when it can be used, up to 1 just after it was. */
  coolFrac(id) { const a = ABILITY[id]; return a ? clamp01((this.cool[id] || 0) / (a.cool * (this.form === 'hybrid' ? 0.65 : 1))) : 0; }
  get big() { return this.form === 'hybrid' ? 1.5 : 1; }

  choose(id) {
    if (!this.has(id) || !this.g.auth || !this.g.auth.admin) return false;
    this.selected = id;
    this.g.ui?.abilitiesChanged();
    return true;
  }

  /**
   * POWER, or an ability's own key. `via` says which ('power', 'key'), so that HULK SMASH can tell a tap from a hold;
   * 'hold' holds it whatever the keys say (for tests).
   */
  use(id = this.selected, via = '') {
    const g = this.g, p = g.player, a = ABILITY[id];
    if (!a) return false;
    // abilities are the admin's, and nobody else's, single player or not
    if (!g.auth || !g.auth.admin) { g.ui?.toast('Abilities are only for the admin account.'); return false; }
    if (!this.has(id)) { g.ui?.toast('That comes from the Cat-Cat Fruit. Eat it first (ABILITIES).'); return false; }
    // the Hulk's moves are the Hulk's
    if (a.hulk && this.form !== 'hulk') { g.ui?.toast(a.name + ' is the Hulk\u2019s. HULK TRANSFORM (6) first.'); return false; }
    if (p.state !== ST.ANIM || p.car || p.cuffed || !p.h.alive || !p.h.conscious || this.eating || this.maul || g.doctor != null) return false;
    // a form is put on, and taken off again, with the same button
    if (a.form && this.form === id) { this.revert(); this.cool[id] = 0.6; return true; }
    // a rock (or a car) held overhead: the button that picked it up throws it
    if (id === 'rock' && this.carry) return this._throwCarry();
    if (this.carry && !a.form) { g.ui?.toast('Your hands are full. ROCK THROW (9) throws it.'); return false; }
    if (!this.ready(id)) return false;
    if (this.form === 'leopard' && id !== 'leopard') { g.ui?.toast('Not as a leopard. FULL LEOPARD again turns you back.'); return false; }
    if (g.grab?.hold) g.grab.release('let go');
    let ok = false;
    switch (id) {
      case 'tempest': ok = this._kick('tempestKick', DEF.tempest); break;
      case 'swirl': ok = this._kick('swirlKick', DEF.swirl); break;
      case 'finger': ok = this._finger(); break;
      case 'flame': ok = this._flame(); break;
      case 'leap': ok = this._leap(); break;
      case 'leopard': ok = this._become('leopard'); break;
      case 'hybrid': ok = this._become('hybrid'); break;
      case 'hulk': ok = this._become('hulk'); break;
      case 'hulkPunch': ok = this._hulkPunch(); break;
      case 'hulkSmash': ok = this._smashStart(via); break;
      case 'rock': ok = this._pickUp(); break;
    }
    if (ok) { this.cool[id] = a.cool * (this.form === 'hybrid' ? 0.65 : 1); g.ui?.showMove?.(a.name.toUpperCase()); }
    return ok;
  }

  /* ---------------------------------- eating ---------------------------------- */

  /** The fruit: brought to the mouth three times, and then you are not quite what you were. */
  eat() {
    const g = this.g, p = g.player;
    if (!g.auth || !g.auth.admin) { g.ui?.toast('Abilities are only for the admin account.'); return false; }
    if (this.fruit) { g.ui?.toast('You have already eaten it. Its power is yours.'); return false; }
    if (p.state !== ST.ANIM || p.car || p.cuffed || !p.h.alive || this.eating) return false;
    if (!p.attached[P.HAND_L] || !p.h.armOk(1)) { g.ui?.toast('You need a hand to eat it with.'); return false; }
    if (g.grab?.hold) g.grab.release('let go');
    const bx = g.boxes, idx = [];
    // a round, swirled, ugly-coloured fruit with a curled stalk
    for (const c of [0xd88a2a, 0x7a3e9a, 0x7a3e9a, 0x7a3e9a, 0x4f7a2a]) { const i = bx.alloc(); bx.colorHex(i, c); idx.push(i); }
    this.eating = { t: 0, bites: 0, idx };
    p.grasp[0] = 1;
    return true;
  }

  _eat(dt) {
    const g = this.g, p = g.player, e = this.eating, bx = g.boxes, s = p.scale;
    e.t += dt;
    if (p.state !== ST.ANIM || !p.attached[P.HAND_L]) { this._stopEating(false); return; }
    const BITES = [0.55, 1.15, 1.75], DUR = 2.5;
    // the hand to the mouth for each bite, and a little way down between
    const hd = p.bodies[P.HEAD];
    hd.toWorld(0, -0.06 * s, 0.17 * s, _a);
    let w = 0;
    for (const b of BITES) w = Math.max(w, smooth(clamp01(1 - Math.abs(e.t - b) / 0.32)));
    p.reachT[0] = { x: _a[0], y: _a[1] - (1 - w) * 0.28 * s, z: _a[2], w: e.t < DUR - 0.25 ? 1 : 0, rate: 8, eat: true };
    if (e.bites < BITES.length && e.t >= BITES[e.bites]) {
      e.bites++;
      g.audio?.at('chomp', _a[0], _a[1], _a[2], 0.8);
      g.gore.puff('flash', _a[0], _a[1], _a[2], 0.05, 0.08, 0.8, 0.5, 0.9);
    }
    // the fruit in the hand, smaller after each bite
    const hand = p.bodies[P.HAND_L], k = 1 - e.bites * 0.28, r = 0.05 * s * k;
    if (k > 0.1) {
      bx.setOn(e.idx[0], hand.px, hand.py, hand.pz, hand.qx, hand.qy, hand.qz, hand.qw, -0.04 * s, -0.06 * s, 0.01 * s, r * 2, r * 1.9, r * 2);
      for (let i = 0; i < 3; i++) bx.setOn(e.idx[1 + i], hand.px, hand.py, hand.pz, hand.qx, hand.qy, hand.qz, hand.qw, -0.04 * s, -0.06 * s + (i - 1) * r * 0.6, 0.01 * s, r * 2.06, r * 0.18, r * 2.06);
      bx.setOn(e.idx[4], hand.px, hand.py, hand.pz, hand.qx, hand.qy, hand.qz, hand.qw, -0.04 * s, -0.06 * s - r * 1.05, 0.01 * s, 0.008 * s, 0.03 * s, 0.008 * s);
    } else for (const i of e.idx) bx.hide(i);
    if (e.t >= DUR) this._stopEating(true);
  }

  _stopEating(done) {
    const g = this.g, p = g.player, e = this.eating;
    for (const i of e.idx) g.boxes.release(i);
    this.eating = null;
    if (p.reachT[0] && p.reachT[0].eat) p.reachT[0] = null;
    p.grasp[0] = -1;
    if (!done) return;
    this.fruit = true; this.stats.eaten++;
    if (this.selected === 'tempest') this.selected = 'finger';
    g.audio?.at('roar', p.x, p.y + 1.5, p.z, 0.6);
    g.ui?.toast('You ate the Cat-Cat Fruit, Model: Leopard. It tasted terrible. Something in you has changed.', 4.5);
    g.ui?.abilitiesChanged();
    g.minds?.witness({ kind: 'power', actor: p, power: 'eat', x: p.x, y: p.y + 1.5, z: p.z });
  }

  /** Lose what the fruit gave (the sandbox's way of starting again). */
  forget() {
    if (this.form) this.revert(true);
    this.fruit = false;
    if (ABILITY[this.selected].fruit) this.selected = 'tempest';
    this.g.ui?.abilitiesChanged();
  }

  /* ----------------------------------- kicks ---------------------------------- */

  _kick(name, def) {
    const g = this.g, p = g.player;
    if (p.anim.busy || p.swap || p.reload || !p.h.legOk(1) || !p.h.legOk(-1) || !p.grounded) return false;
    g.weapons._swing(p, name, def);
    const act = p.anim.action;
    if (act) act.power = name;
    return true;
  }

  /** Where a slash or a ring goes: the way the player is looking, more along the ground than up or down. */
  _dir(h) {
    const a = this.g.aim;
    let dx = a.dx, dy = clamp(a.dy, -0.3, 0.3), dz = a.dz;
    if (!h.isPlayer) { dx = Math.sin(h.yaw); dy = 0; dz = Math.cos(h.yaw); }
    const l = Math.hypot(dx, dy, dz) || 1;
    return [dx / l, dy / l, dz / l];
  }

  /** TEMPEST KICK: the green crescent comes off the foot at the top of the kick. */
  _slash(h) {
    const g = this.g, s = h.scale, big = h.isPlayer ? this.big : 1, [dx, dy, dz] = this._dir(h);
    const foot = h.bodies[P.FOOT_R];
    const x = h.x + dx * 0.55, y = clamp(foot.py, h.y + 0.75 * s, h.y + 1.55 * s), z = h.z + dz * 0.55;
    this._addSlash(h, x, y, z, dx, dy, dz, big, false);
    if (h.isPlayer) g.mp?.powerFx('slash', [x, y, z], [dx, dy, dz], big);
  }
  _addSlash(h, x, y, z, dx, dy, dz, big, ghost) {
    const g = this.g, s = h.scale;
    const o = { kind: 'slash', x, y, z, dx, dy, dz, v: 30, t: 0, life: 1.05, w: 1.7 * big * s, power: 2.0 * big, by: h, hits: new Set(), stuck: new Set(), tilt: rand(-0.3, 0.3), inst: [], ghost };
    for (let i = 0; i < 18; i++) { const k = this.glow.alloc(); this.glow.color(k, i < 9 ? 0.5 : 0.14, i < 9 ? 1.0 : 0.55, i < 9 ? 0.55 : 0.2); o.inst.push(k); }
    this.shots.push(o);
    if (!ghost) this.stats.tempest++;
    g.audio?.at('tempest', x, y, z, 1);
    g.minds?.noise(x, y, z, 92, 'blow', h);
    g.minds?.witness({ kind: 'power', actor: h, power: 'tempest', x, y, z });
  }

  /** SWIRLING KICK: the ring of air leaves the foot as it comes round. */
  _ring(h) {
    const g = this.g, s = h.scale, big = h.isPlayer ? this.big : 1, [dx, dy, dz] = this._dir(h);
    const x = h.x + dx * 0.6, y = h.y + 1.05 * s, z = h.z + dz * 0.6;
    this._addRing(h, x, y, z, dx, dy, dz, big, false);
    if (h.isPlayer) g.mp?.powerFx('ring', [x, y, z], [dx, dy, dz], big);
  }
  _addRing(h, x, y, z, dx, dy, dz, big, ghost) {
    const g = this.g, s = h.scale;
    const o = { kind: 'ring', x, y, z, dx, dy, dz, v: 17, t: 0, life: 1.15, R: 0.5 * big * s, power: 1.3 * big, by: h, spin: 0, inst: [], ghost };
    for (let i = 0; i < 20; i++) { const k = this.glow.alloc(); this.glow.color(k, 0.62, 0.66, 0.72); o.inst.push(k); }
    this.shots.push(o);
    if (!ghost) this.stats.swirls++;
    g.audio?.at('swirl', x, y, z, 1);
    g.minds?.witness({ kind: 'power', actor: h, power: 'swirl', x, y, z });
  }

  /* ---------------------------------- finger ---------------------------------- */

  _finger() {
    const g = this.g, p = g.player;
    if (p.anim.busy || p.swap || p.reload) return false;
    // the right hand, unless it has something in it
    const right = !p.weapon && p.h.armOk(-1) && p.attached[P.HAND_R];
    const left = p.h.armOk(1) && p.attached[P.HAND_L];
    if (!right && !left) { g.ui?.toast('You need a hand for that.'); return false; }
    g.weapons._swing(p, right ? 'fingerPistol' : 'fingerPistolL', DEF.finger);
    p.point[right ? 1 : 0] = 1;
    this.stats.finger++;
    g.audio?.at('whoosh', p.x, p.y + 1.3, p.z, 0.4);
    return true;
  }

  /** A finger driven into one part of somebody, from `by`, as hard as a round. */
  _pierce(by, t, part, side) {
    const g = this.g;
    if (!t || t.removed || t.gone[part]) return;
    const b = t.bodies[part], s = t.scale, big = this.big;
    // in through the side of the part that faces whoever is doing it
    let dx = b.px - by.x, dz = b.pz - by.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    b.dirToLocal(-dx, 0, -dz, _a);
    const ax = Math.abs(_a[0]), az = Math.abs(_a[2]);
    const n = ax > az ? [Math.sign(_a[0]), 0, 0] : [0, 0, Math.sign(_a[2]) || 1];
    const lx = n[0] ? n[0] * b.hx : side * b.hx * 0.45, lz = n[2] ? n[2] * b.hz : side * b.hz * 0.45;
    b.toWorld(lx, rand(-0.25, 0.25) * b.hy, lz, _b);
    const rep = t.hit({ part, type: 'bullet', power: 1.35 * big * by.powerMul, point: [_b[0], _b[1], _b[2]], dir: [dx, 0, dz], normal: n, impulse: 24 * big, through: 0.26 * s, hp: 34 * big, attacker: by, weapon: 'fingerpistol' });
    g.audio?.at('stab', _b[0], _b[1], _b[2], 0.9);
    g.minds?.witness({ kind: 'attack', actor: by, victim: t, weapon: 'fingerpistol', part, x: _b[0], y: _b[1], z: _b[2], rep });
    g.police?.touched(t, by);
    if (by.isPlayer) { g.ui?.hitMark(); g.shake = Math.max(g.shake, 0.5); }
    return rep;
  }

  /* ---------------------------------- flames ---------------------------------- */

  /** Who "the nearest opponent" is: the nearest living person, in front if anybody is. */
  _nearest(h, range = 40) {
    const g = this.g, fx = Math.sin(g.camYaw), fz = Math.cos(g.camYaw);
    let best = null, bs = Infinity;
    for (const o of g.humans) {
      if (o === h || o.removed || !o.h.alive || o.car) continue;
      const dx = o.x - h.x, dz = o.z - h.z, d = Math.hypot(dx, dz);
      if (d > range) continue;
      const front = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      const score = d * (front > 0.3 ? 1 : 2.5) + (o.state === ST.RAGDOLL ? 4 : 0);
      if (score < bs) { bs = score; best = o; }
    }
    return best;
  }

  _flame() {
    const g = this.g, p = g.player;
    if (p.anim.busy || p.swap || p.reload) return false;
    if (!p.h.armOk(1) && !p.h.armOk(-1)) return false;
    const target = this._nearest(p);
    if (target) {
      const yaw = Math.atan2(target.x - p.x, target.z - p.z);
      g.camYaw += clamp(wrapAngle(yaw - g.camYaw), -0.6, 0.6) * 0.7; p.intent.face = yaw;
    }
    p.anim.play('flameCast');
    this.cast = { target, n: 0, t: 0 };
    g.audio?.at('roar', p.x, p.y + 1.5, p.z, 0.4);
    return true;
  }

  _castFire(dt) {
    const g = this.g, p = g.player, c = this.cast;
    const act = p.anim.action;
    if (!act || act.name !== 'flameCast' || p.state !== ST.ANIM) { this.cast = null; return; }
    const u = act.t / act.clip.dur, WHEN = [0.1, 0.25, 0.4, 0.55, 0.7];
    if (c.n < 5 && u >= WHEN[c.n]) {
      // the right hand, the left, the right...; a hand that is holding something does not throw
      let side = c.n % 2 === 0 ? 1 : 0;
      if ((side === 1 && (p.weapon || !p.h.armOk(-1))) || !p.attached[side ? P.HAND_R : P.HAND_L]) side = 1 - side;
      const hand = p.bodies[side ? P.HAND_R : P.HAND_L];
      hand.toWorld(0, -0.06 * p.scale, 0.03, _a);
      let t = c.target;
      if (!t || t.removed || !t.h.alive) t = c.target = this._nearest(p);
      this._fireball(p, _a[0], _a[1], _a[2], t);
      c.n++;
    }
    if (c.n >= 5) this.cast = null;
  }

  _fireball(h, x, y, z, target) {
    const g = this.g, big = this.big;
    let dx, dy, dz;
    if (target) { const b = target.bodies[P.CHEST]; dx = b.px - x; dy = b.py - y; dz = b.pz - z; }
    else { const a = g.aim; dx = a.dx; dy = a.dy; dz = a.dz; }
    const l = Math.hypot(dx, dy, dz) || 1;
    this._addFire(h, x, y, z, dx / l, dy / l, dz / l, big, target, false);
    if (h.isPlayer) g.mp?.powerFx('fire', [x, y, z], [dx / l, dy / l, dz / l], big);
  }
  _addFire(h, x, y, z, dx, dy, dz, big, target, ghost) {
    const g = this.g;
    const o = { kind: 'fire', x, y, z, dx, dy, dz, v: 21, t: 0, life: 2.4, r: 0.15 * big, power: 1.2 * big, by: h, target, inst: [], ghost };
    for (let i = 0; i < 3; i++) { const k = this.glow.alloc(); this.glow.color(k, [1, 1, 0.9][i], [0.9, 0.55, 0.2][i], [0.55, 0.12, 0.04][i]); o.inst.push(k); }
    this.shots.push(o);
    if (!ghost) this.stats.fireballs++;
    g.audio?.at('fireball', x, y, z, 0.7);
    g.minds?.witness({ kind: 'power', actor: h, power: 'flame', x, y, z });
  }

  /* ----------------------------------- leap ----------------------------------- */

  _leap() {
    const g = this.g, p = g.player;
    if (!p.grounded || p.anim.busy || p.swap || p.reload || !p.h.legOk(1) || !p.h.legOk(-1)) return false;
    const yaw = g.camYaw, sp = 9.4 * (this.form === 'hybrid' ? 1.2 : 1);
    p.yaw = yaw; p.intent.face = yaw;
    p.leap = { vx: Math.sin(yaw) * sp, vy: 3.7, vz: Math.cos(yaw) * sp, t: 0 };
    p.anim.play('leap');
    this.leapT = 0.01;
    this.stats.leaps++;
    g.audio?.at('roar', p.x, p.y + 1.4, p.z, 0.35);
    g.audio?.at('whoosh', p.x, p.y + 1, p.z, 0.6);
    g.minds?.witness({ kind: 'power', actor: p, power: 'leap', x: p.x, y: p.y + 1, z: p.z });
    return true;
  }

  /** In the air: whoever the leap comes down on. */
  _leapCheck() {
    const g = this.g, p = g.player;
    if (!p.leap) { this.leapT = 0; return; }
    const c = p.bodies[P.CHEST], fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    for (const o of g.humans) {
      if (o === p || o.removed || !o.attached[P.CHEST]) continue;
      const b = o.bodies[P.CHEST], hd = o.attached[P.HEAD] ? o.bodies[P.HEAD].py : b.py + 0.3;
      // close across the ground (a little ahead counts: the arms are out in front), and not sailing over their head
      const dx = b.px - c.px, dz = b.pz - c.pz, ahead = dx * fx + dz * fz;
      if (Math.hypot(dx, dz) > 0.95 * p.scale || ahead < -0.4) continue;
      if (p.y > hd + 0.25) continue;
      // caught: the leap stops on them, and a finger from each hand goes in
      p.leap = null; p.vx *= 0.1; p.vz *= 0.1; this.leapT = 0;
      p.anim.play('doubleFinger');
      p.point[0] = p.point[1] = 1;
      this.stats.leapHits++;
      this.later.push({ t: 0.16, fn: () => { this._pierce(p, o, P.CHEST, -1); this._pierce(p, o, o.attached[P.ABDOMEN] ? P.ABDOMEN : P.CHEST, 1); if (o.state !== ST.RAGDOLL) o.toRagdoll(); } });
      this.later.push({ t: 0.5, fn: () => { p.point[0] = p.point[1] = 0; } });
      g.ui?.showMove?.('DOUBLE FINGER PISTOL');
      return;
    }
  }

  /* ---------------------------------- forms ----------------------------------- */

  _become(form) {
    const g = this.g, p = g.player;
    if (this.form) this.revert(true);
    if (p.anim.busy || p.swap || p.reload) return false;
    this.form = form; this.formT = 0;
    this.stats.transforms++;
    // a puff of something, and a roar
    for (let i = 0; i < 8; i++) g.gore.puff('smoke', p.x + rand(-0.5, 0.5), p.y + rand(0.3, 1.6), p.z + rand(-0.5, 0.5), rand(0.5, 0.9), rand(0.6, 1.1), 0.82, 0.7, 0.45);
    g.audio?.at('roar', p.x, p.y + 1.4, p.z, 1);
    g.minds?.noise(p.x, p.y + 1.4, p.z, 100, 'scream', p);
    g.minds?.witness({ kind: 'power', actor: p, power: form, x: p.x, y: p.y + 1.4, z: p.z });
    if (form === 'leopard') {
      if (p.weapon && !p.weapon.def.wear) g.weapons.holster?.();
      p.hidden = true; p.speedMul = 2.35;
      g.ui?.toast('Full Leopard. Run into somebody to pounce on them. FULL LEOPARD again turns you back.', 3.5);
    } else if (form === 'hulk') {
      this._hulkOn(p);
    } else {
      // a leopard in a black suit and a black top hat with a red band: bigger, and very hard to put down
      this.was = { scale: p.scale, tough: p.h.tough };
      p.setScale(p.scale * HYBRID_SIZE);
      p.h.tough = this.was.tough * HYBRID_TOUGH; p.sturdy = HYBRID_STURDY;
      p.setCoat(HYBRID_COAT); p.setClaws(true); p.beast = true; p.bulk = 1.06;
      p.powerMul = 1.75; p.reachMul = 1.35; p.anim.speedUp = 1.45; p.speedMul = 1.15;
      g.ui?.toast('Hybrid. Bigger and far tougher; your attacks are bigger, stronger and faster; your hands are claws.', 3.5);
    }
    g.ui?.abilitiesChanged();
    return true;
  }

  /** Back to a person. */
  revert(quiet = false) {
    const g = this.g, p = g.player, was = this.form;
    if (!was) return;
    this.form = null;
    if (!p.removed) {
      p.hidden = false; p.speedMul = 1; p.stoop = 0;
      if (was === 'hybrid') {
        p.setCoat(null); p.setClaws(false); p.beast = false; p.bulk = 1; p.powerMul = 1; p.reachMul = 1; p.anim.speedUp = 1; p.sturdy = 1;
        if (this.was) { p.setScale(this.was.scale); p.h.tough = this.was.tough; this.was = null; }
      }
      if (was === 'hulk') this._hulkOff(p, quiet);
      if (!quiet) {
        for (let i = 0; i < 6; i++) g.gore.puff('smoke', p.x + rand(-0.4, 0.4), p.y + rand(0.3, 1.5), p.z + rand(-0.4, 0.4), rand(0.4, 0.8), rand(0.5, 0.9), 0.8, 0.72, 0.5);
        g.audio?.at('whump', p.x, p.y + 1, p.z, 0.4);
      }
    }
    if (this.leo) for (const i of this.leo.all) g.boxes.hide(i);
    if (this.hyb) for (const i of this.hyb.all) g.boxes.hide(i);
    this.maul = null; this.smash = null;
    if (this.carry) this._release(false);
    g.ui?.abilitiesChanged();
  }

  /* ---------------------------------- frame ----------------------------------- */

  /** Before the people move. */
  update(dt) {
    const g = this.g, p = g.player, inp = g.input;
    for (const k in this.cool) if (this.cool[k] > 0) this.cool[k] -= dt;
    // the keys and the button
    if (g.doctor == null && !g.paused) {
      if (inp.pressed.power) this.use(this.selected, 'power');
    }
    // things that were to happen a moment later
    for (let i = this.later.length - 1; i >= 0; i--) { const e = this.later[i]; if ((e.t -= dt) <= 0) { this.later.splice(i, 1); e.fn(); } }
    if (this.eating) this._eat(dt);
    if (this.cast) this._castFire(dt);
    // a kick at the top of its arc lets go of what it carries
    const act = p.anim.action;
    if (act && act.power && !act.fired && p.state === ST.ANIM) {
      const u = act.t / act.clip.dur;
      if (act.power === 'tempestKick' && u >= 0.42) { act.fired = true; this._slash(p); }
      if (act.power === 'swirlKick' && u >= 0.5) { act.fired = true; this._ring(p); }
      if (act.power === 'hulkPunch' && (u >= 0.52 || act.hitThing)) { act.fired = true; this._hulkImpact(p); }
      if (act.power === 'hulkSmash' && u >= 0.58 && this.smash && !this.smash.leap) { act.fired = true; this._groundSmash(p); }
      if (act.power === 'hulkThrow' && u >= 0.48) { act.fired = true; this._release(true); }
    }
    // whoever a Hulk Punch lands on goes flying
    if (act && act.power === 'hulkPunch' && act.hits) for (const o of act.hits) if (!act.flung.has(o)) { act.flung.add(o); this._hurl(p, o); }
    // a pointing finger goes back into the fist when the thrust is over
    if (!act || (act.name !== 'fingerPistol' && act.name !== 'fingerPistolL' && act.name !== 'doubleFinger')) { if (!this.later.length) p.point[0] = p.point[1] = 0; }
    if (this.leapT > 0) this._leapCheck();
    if (this.smash) this._smashing(dt);
    if (this.carry) this._carrying(dt);
    // the forms
    if (this.form) {
      this.formT += dt;
      if (p.removed || !p.h.alive || p.car || (this.form === 'leopard' && p.state !== ST.ANIM && !this.maul)) this.revert(true);
      else if (this.form === 'leopard') this._prowl(dt);
    }
  }

  /** After the physics: everything in flight, and everything drawn. */
  late(dt) {
    const g = this.g;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const o = this.shots[i];
      o.t += dt;
      const alive = o.kind === 'slash' ? this._flySlash(o, dt) : o.kind === 'fire' ? this._flyFire(o, dt) : this._flyRing(o, dt);
      if (!alive || o.t > o.life) {
        if (alive && o.kind === 'ring') this._burst(o.x, o.y, o.z, o.power * 0.8, o.by, o.ghost);
        if (alive && o.kind === 'fire') this._fizz(o);
        for (const k of o.inst) this.glow.release(k);
        this.shots.splice(i, 1);
      }
    }
    for (let i = this.glows.length - 1; i >= 0; i--) {
      const L = this.glows[i];
      L.t += dt;
      if (L.t > L.life) { this.glows.splice(i, 1); continue; }
      g.lights?.ask('point', L.x, L.y, L.z, L.c, L.i * (1 - L.t / L.life), L.d);
    }
    this._drawLeopard(dt);
    this._drawHybrid(dt);
    if (this.carry) this._hold(dt);
    this._drawRocks();
    // other players in a form
    for (const h of g.humans) {
      const c = h.costume;
      if (!c || !c.form || h.removed) continue;
      c.formT += dt;
      if (c.form === 'leopard') this._drawLeopard(dt, c, h); else if (c.form === 'hybrid') this._drawHybrid(dt, c, h);
    }
    this.glow.commit();
  }

  /* --------------------------------- the slash -------------------------------- */

  _flySlash(o, dt) {
    const g = this.g;
    const step = o.v * dt;
    // across it: level, tilted a little one way or the other
    const ax = -o.dz, az = o.dx, ct = Math.cos(o.tilt), st = Math.sin(o.tilt);
    const ux = ax * ct, uy = st, uz = az * ct;
    // a building ends it
    let stop = step;
    const tw = g.world.rayWorld(o.x, o.y, o.z, o.dx, o.dy, o.dz, step + 0.02);
    if (tw >= 0) stop = tw;
    const fade = o.hits.size > 4 ? 0.55 : 1;
    for (let k = -3; k <= 3; k++) {
      const f = (k / 3) * o.w * 0.5, bow = (1 - (k / 3) ** 2) * 0.28 * o.w;
      const sx = o.x + ux * f + o.dx * bow, sy = o.y + uy * f, sz = o.z + uz * f + o.dz * bow;
      // people: cut, and it goes on through
      const ph = g.rayPeople(sx, sy, sz, o.dx, o.dy, o.dz, stop, o.by, 0.03);
      if (ph && !o.hits.has(ph.human) && o.ghost) { o.hits.add(ph.human); g.gore.puff('flash', sx + o.dx * ph.t, sy + o.dy * ph.t, sz + o.dz * ph.t, 0.3, 0.08, 0.4, 1, 0.5); }
      if (ph && !o.hits.has(ph.human)) {
        o.hits.add(ph.human);
        const t = ph.human, hx = sx + o.dx * ph.t, hy = sy + o.dy * ph.t, hz = sz + o.dz * ph.t;
        const rep = t.hit({ part: ph.part, type: 'cut', power: o.power * fade, point: [hx, hy, hz], dir: [o.dx, o.dy, o.dz], normal: ph.ln, impulse: 20 * o.power, chop: 1.25, attacker: o.by, weapon: 'tempest', through: 0.15 });
        g.audio?.at('slash', hx, hy, hz, 0.9);
        g.gore.puff('flash', hx, hy, hz, 0.3, 0.08, 0.4, 1, 0.5);
        if (rep) g.minds?.witness({ kind: 'attack', actor: o.by, victim: t, weapon: 'tempest', part: ph.part, x: hx, y: hy, z: hz, rep });
        if (o.by.isPlayer) g.ui?.hitMark();
        this.stats.slashHits++;
      }
      // rope parts where it passes
      if (g.ropes && g.ropes.list.length) g.ropes.cutBy(sx, sy, sz, sx + o.dx * stop, sy + o.dy * stop, sz + o.dz * stop);
      // walls and beams: cut into; crates and lamps: knocked away; cars: glass and panels
      for (const pr of g.props) {
        if (o.stuck.has(pr)) continue;
        if (pr.vox) {
          const v = pr.vox, t = v.ray(sx, sy, sz, o.dx, o.dy, o.dz, stop);
          if (t < 0) continue;
          o.stuck.add(pr);
          const lost = v.chop(v.hit.c, 2.2 * o.power, o.dx, o.dy, o.dz);
          g.weapons.stats.chops += lost;
          g.audio?.at(v.mat === 'wood' ? 'splinter' : 'clang', sx + o.dx * t, sy + o.dy * t, sz + o.dz * t, 0.8);
          if (v.mat !== 'wood') { o.life = Math.min(o.life, o.t + 0.02); }
          continue;
        }
        const t = rayBody(pr.body, sx, sy, sz, o.dx, o.dy, o.dz, stop, null, 0.02);
        if (t < 0) continue;
        o.stuck.add(pr);
        const J = 60 * o.power;
        pr.body.applyImpulse(o.dx * J, J * 0.25, o.dz * J, sx + o.dx * t, sy + o.dy * t, sz + o.dz * t);
        if (pr.thing) g.things?.hurt(pr.thing, 2 * o.power, [0, 0, 0], 'blow');
        g.audio?.at(pr.kind === 'crate' ? 'splinter' : 'clang', pr.body.px, pr.body.py, pr.body.pz, 0.7);
      }
      if (g.traffic) for (const car of g.traffic.cars) {
        if (o.stuck.has(car) || Math.hypot(car.x - sx, car.z - sz) > 5) continue;
        const t = car.ray(sx, sy, sz, o.dx, o.dy, o.dz, stop, _ch);
        if (t < 0) continue;
        o.stuck.add(car);
        g.traffic.blow(car, _ch, o.by, SLASH_HIT.def, SLASH_HIT.clip, sx + o.dx * t, sy + o.dy * t, sz + o.dz * t, o.dx, o.dy, o.dz);
      }
    }
    o.x += o.dx * stop; o.y += o.dy * stop; o.z += o.dz * stop;
    // it does not go into the ground
    const gy = groundHeight(o.x, o.z) + 0.25;
    if (o.y < gy) o.y = gy;
    this._drawSlash(o);
    if (tw >= 0) {
      for (let i = 0; i < 6; i++) g.gore.puff('flash', o.x + rand(-0.5, 0.5), o.y + rand(-0.2, 0.2), o.z + rand(-0.5, 0.5), 0.3, 0.12, 0.4, 1, 0.5);
      g.audio?.at('crack', o.x, o.y, o.z, 0.6);
      return false;
    }
    return true;
  }

  _drawSlash(o) {
    const bx = this.glow, N = 9;
    const ax = -o.dz, az = o.dx, ct = Math.cos(o.tilt), st = Math.sin(o.tilt);
    const ux = ax * ct, uy = st, uz = az * ct;
    const fade = clamp01((o.life - o.t) / 0.25);
    for (let layer = 0; layer < 2; layer++) {
      const th = (layer ? 0.22 : 0.085) * o.w / 1.7, grow = layer ? 1.08 : 1;
      for (let i = 0; i < N; i++) {
        const p0 = this._arc(o, i / N, ux, uy, uz, grow), p1 = this._arc(o, (i + 1) / N, ux, uy, uz, grow);
        const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2], len = Math.hypot(dx, dy, dz) || 1e-4;
        // the turn that takes +X along the arc
        quatX(dx / len, dy / len, dz / len, _q);
        const thick = th * (1 - Math.abs(i / (N - 1) - 0.5) * 1.2) * fade;
        bx.set(o.inst[layer * N + i], (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2, _q[0], _q[1], _q[2], _q[3], len * 1.05, Math.max(0.005, thick), Math.max(0.01, thick * 0.6));
      }
    }
    const g = this.g;
    g.lights?.ask('point', o.x, o.y, o.z, 0x6cff80, 7 * fade, 7);
    if (chance(0.6)) g.gore.puff('flash', o.x + rand(-0.3, 0.3) * o.w, o.y + rand(-0.1, 0.1), o.z + rand(-0.3, 0.3) * o.w, 0.18, 0.12, 0.35, 1, 0.45);
  }
  _arc(o, f, ux, uy, uz, grow) {
    const k = (f - 0.5) * 2, off = k * o.w * 0.5 * grow, bow = (1 - k * k) * 0.28 * o.w * grow;
    return [o.x + ux * off + o.dx * bow, o.y + uy * off, o.z + uz * off + o.dz * bow];
  }

  /* -------------------------------- the fireballs ----------------------------- */

  _flyFire(o, dt) {
    const g = this.g;
    // they bend toward whoever they were thrown at
    const t = o.target;
    if (t && !t.removed && t.attached[P.CHEST]) {
      const b = t.bodies[P.CHEST];
      let dx = b.px - o.x, dy = b.py - o.y, dz = b.pz - o.z; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      const k = Math.min(1, dt * 3.2);
      o.dx += (dx - o.dx) * k; o.dy += (dy - o.dy) * k; o.dz += (dz - o.dz) * k;
      const m = Math.hypot(o.dx, o.dy, o.dz) || 1; o.dx /= m; o.dy /= m; o.dz /= m;
    }
    const step = o.v * dt;
    let far = step + o.r;
    const tw = g.world.rayWorld(o.x, o.y, o.z, o.dx, o.dy, o.dz, far);
    const ph = g.rayPeople(o.x, o.y, o.z, o.dx, o.dy, o.dz, tw >= 0 ? tw : far, o.by, o.r);
    if (ph) {
      const hx = o.x + o.dx * ph.t, hy = o.y + o.dy * ph.t, hz = o.z + o.dz * ph.t;
      if (o.ghost) this._splash(hx, hy, hz, 0.8 * o.power, o.by, true);
      else this._fireHit(o, ph.human, ph.part, hx, hy, hz, ph.ln);
      return false;
    }
    for (const pr of g.props) {
      const tt = pr.vox ? pr.vox.ray(o.x, o.y, o.z, o.dx, o.dy, o.dz, far) : rayBody(pr.body, o.x, o.y, o.z, o.dx, o.dy, o.dz, far, null, o.r);
      if (tt < 0) continue;
      const hx = o.x + o.dx * tt, hy = o.y + o.dy * tt, hz = o.z + o.dz * tt;
      if (pr.kind === 'crate') g.fire?.igniteCrate(pr, 0.6 * o.power);
      if (!pr.vox || !pr.vox.anchored) pr.body.applyImpulse(o.dx * 30 * o.power, 6, o.dz * 30 * o.power, hx, hy, hz);
      if (pr.vox && pr.vox.mat === 'wood') g.fire?.patch(hx, hy, hz, 0.25, rand(3, 5), o.by);
      this._splash(hx, hy, hz, 0.7 * o.power, o.by);
      return false;
    }
    if (g.traffic) for (const car of g.traffic.cars) {
      if (Math.hypot(car.x - o.x, car.z - o.z) > 5) continue;
      const tt = car.ray(o.x, o.y, o.z, o.dx, o.dy, o.dz, far, _ch);
      if (tt < 0) continue;
      g.traffic.heat(car, 6 * o.power, o.by); car.damage(1.5 * o.power, o.by);
      this._splash(o.x + o.dx * tt, o.y + o.dy * tt, o.z + o.dz * tt, 0.7 * o.power, o.by);
      return false;
    }
    if (tw >= 0) { this._splash(o.x + o.dx * tw, o.y + o.dy * tw, o.z + o.dz * tw, 0.7 * o.power, o.by); return false; }
    o.x += o.dx * step; o.y += o.dy * step; o.z += o.dz * step;
    const gy = groundHeight(o.x, o.z);
    if (o.y < gy + o.r) { this._splash(o.x, gy + 0.05, o.z, 0.7 * o.power, o.by); g.fire?.patch(o.x, gy, o.z, 0.3, rand(2.5, 4), o.by); return false; }
    // drawn: a white-hot core, orange round it, a red edge; flames streaming off behind
    const spin = o.t * 9;
    for (let i = 0; i < 3; i++) {
      const r = o.r * [0.55, 0.95, 1.35][i] * (1 + Math.sin(o.t * 30 + i) * 0.08);
      const a = spin * (i + 1) * 0.7, sq = Math.sin(a / 2), cq = Math.cos(a / 2);
      this.glow.set(o.inst[i], o.x, o.y, o.z, sq * 0.6, sq * 0.6, sq * 0.5, cq, r * 2, r * 2, r * 2);
    }
    g.fire?.flameAt(o.x - o.dx * o.r, o.y, o.z - o.dz * o.r, o.r * 2.2, null);
    g.lights?.ask('point', o.x, o.y, o.z, 0xff8a30, 10, 8);
    return true;
  }

  _fireHit(o, h, part, x, y, z, ln) {
    const g = this.g;
    this.stats.fireHits++;
    const rep = h.hit({ part, type: 'blunt', power: 0.9 * o.power, point: [x, y, z], dir: [o.dx, o.dy, o.dz], normal: ln, impulse: 26 * o.power, attacker: o.by, weapon: 'flame' });
    if (g.fire) { g.fire.ignite(h, part, 0.7 * o.power, o.by, 'flame'); const near = pick([P.CHEST, P.ABDOMEN, P.HEAD, P.UARM_L, P.UARM_R]); if (!h.gone[near]) g.fire.ignite(h, near, 0.4 * o.power, o.by, 'flame'); }
    if (rep) g.minds?.witness({ kind: 'attack', actor: o.by, victim: h, weapon: 'flame', part, x, y, z, rep });
    if (o.by.isPlayer) g.ui?.hitMark();
    this._splash(x, y, z, 0.8 * o.power, o.by);
  }

  /** A fireball going out where it lands: a splash of flame, a flash. */
  _splash(x, y, z, k, by, ghost = false) {
    const g = this.g;
    // a picture of somebody else's: flame that sets nothing alight here
    if (g.fire && !ghost) for (let i = 0; i < 14; i++) g.fire._add(1, x, y, z, rand(-2.5, 2.5) * k, rand(0.5, 3) * k, rand(-2.5, 2.5) * k, rand(0.3, 0.7), rand(0.25, 0.5) * k, 1.6, by);
    if (ghost) g.gore.puff('flash', x, y + 0.2, z, 0.7 * k, 0.3, 1, 0.55, 0.2);
    g.gore.puff('flash', x, y, z, 0.9 * k, 0.12, 1, 0.7, 0.3);
    g.gore.puff('smoke', x, y + 0.2, z, 0.7 * k, 1.2, 0.2, 0.18, 0.16);
    g.audio?.at('whump', x, y, z, 0.6);
    this.glows.push({ x, y, z, c: 0xff8a30, i: 14 * k, d: 8, t: 0, life: 0.3 });
  }
  _fizz(o) { this.g.gore.puff('smoke', o.x, o.y, o.z, 0.4, 0.8, 0.3, 0.28, 0.26); }

  /* --------------------------------- the ring --------------------------------- */

  _flyRing(o, dt) {
    const g = this.g, step = o.v * dt, R = o.R;
    o.spin += dt * 22;
    let far = step + R * 0.6;
    const tw = g.world.rayWorld(o.x, o.y, o.z, o.dx, o.dy, o.dz, far);
    // anybody it touches, anywhere across it
    for (let k = -1; k <= 1; k++) {
      const sx = o.x - o.dz * k * R * 0.7, sz = o.z + o.dx * k * R * 0.7;
      const ph = g.rayPeople(sx, o.y, sz, o.dx, o.dy, o.dz, tw >= 0 ? tw : far, o.by, R * 0.5);
      if (ph) { o.x = sx + o.dx * ph.t; o.y += o.dy * ph.t; o.z = sz + o.dz * ph.t; this._burst(o.x, o.y, o.z, o.power, o.by, o.ghost); return false; }
    }
    for (const pr of g.props) {
      const tt = pr.vox ? pr.vox.ray(o.x, o.y, o.z, o.dx, o.dy, o.dz, far) : rayBody(pr.body, o.x, o.y, o.z, o.dx, o.dy, o.dz, far, null, R * 0.5);
      if (tt >= 0) { o.x += o.dx * tt; o.y += o.dy * tt; o.z += o.dz * tt; this._burst(o.x, o.y, o.z, o.power, o.by, o.ghost); return false; }
    }
    if (g.traffic) for (const car of g.traffic.cars) {
      if (Math.hypot(car.x - o.x, car.z - o.z) > 5) continue;
      const tt = car.ray(o.x, o.y, o.z, o.dx, o.dy, o.dz, far, _ch);
      if (tt >= 0) { o.x += o.dx * tt; o.y += o.dy * tt; o.z += o.dz * tt; this._burst(o.x, o.y, o.z, o.power, o.by, o.ghost); return false; }
    }
    if (tw >= 0) { o.x += o.dx * tw; o.y += o.dy * tw; o.z += o.dz * tw; this._burst(o.x, o.y, o.z, o.power, o.by, o.ghost); return false; }
    o.x += o.dx * step; o.y += o.dy * step; o.z += o.dz * step;
    const gy = groundHeight(o.x, o.z);
    if (o.y < gy + 0.2) { this._burst(o.x, gy + 0.2, o.z, o.power, o.by, o.ghost); return false; }
    // drawn: a ring of white air, edge on to the way it goes, spinning; an inner swirl spinning the other way
    const fx = o.dx, fz = o.dz, sx = -fz, sz = fx;
    for (let i = 0; i < 20; i++) {
      const inner = i >= 14, n = inner ? 6 : 14, j = inner ? i - 14 : i;
      const a = (inner ? -o.spin * 1.6 : o.spin) + (j / n) * TAU, r = R * (inner ? 0.5 : 1);
      const ca = Math.cos(a), sa = Math.sin(a);
      // round the axis of travel: across, and up
      const px = o.x + sx * ca * r, py = o.y + sa * r, pz = o.z + sz * ca * r;
      // a tangent to the circle there
      const tx = -sx * sa, ty = ca, tz = -sz * sa;
      quatX(tx, ty, tz, _q);
      const seg = TAU * r / n;
      this.glow.set(o.inst[i], px, py, pz, _q[0], _q[1], _q[2], _q[3], seg * (inner ? 0.7 : 0.9), 0.04 * this.big, 0.07 * this.big);
    }
    if (chance(0.5)) g.gore.puff('smoke', o.x + rand(-0.2, 0.2), o.y + rand(-0.2, 0.2), o.z + rand(-0.2, 0.2), R * 0.9, 0.35, 0.95, 0.95, 0.97);
    g.lights?.ask('point', o.x, o.y, o.z, 0xdfe8ff, 4, 5);
    return true;
  }

  /** The ring bursting into flame: everyone close is thrown down and set alight. */
  _burst(x, y, z, power, by, ghost = false) {
    const g = this.g, R = 2.7 * power;
    this.stats.bursts++;
    g.audio?.at('whump', x, y, z, 1);
    g.audio?.at('explosion', x, y, z, 0.45);
    g.minds?.noise(x, y, z, 125, 'explosion', by);
    g.minds?.witness({ kind: 'explosion', x, y, z, by });
    const cam = Math.hypot(g.camX - x, g.camZ - z);
    g.shake = Math.max(g.shake, clamp(1.4 - cam / 12, 0.15, 1.4));
    if (g.fire && !ghost) for (let k = 0; k < 46; k++) {
      const a = rand(TAU), u = rand(0.1, 0.7), sp = rand(1.5, 5) * power;
      g.fire._add(1, x + Math.cos(a) * u, y + rand(-0.3, 0.5), z + Math.sin(a) * u, Math.cos(a) * sp, rand(1, 4.5) * power, Math.sin(a) * sp, rand(0.45, 0.95), rand(0.4, 0.8) * power, rand(1.6, 2.3), by);
    }
    for (let k = 0; k < 4; k++) g.gore.puff('flash', x + rand(-0.6, 0.6), y + rand(-0.3, 0.6), z + rand(-0.6, 0.6), rand(1.4, 2.2) * power, rand(0.1, 0.18), 1, 0.72, 0.35);
    for (let k = 0; k < 8; k++) g.gore.puff('smoke', x + rand(-1, 1), y + rand(0.2, 1.6), z + rand(-1, 1), rand(1, 2) * power, rand(1.8, 3), 0.16, 0.15, 0.14);
    for (let k = 0; k < 6; k++) g.gore.puff('smoke', x + rand(-0.6, 0.6), y + rand(-0.2, 0.6), z + rand(-0.6, 0.6), rand(0.8, 1.3) * power, rand(0.5, 0.9), 0.95, 0.95, 0.97);
    this.glows.push({ x, y, z, c: 0xff9040, i: 34 * power, d: 14, t: 0, life: 0.45 });
    const gy = groundHeight(x, z);
    if (g.fire && !ghost && y - gy < 1.5) g.fire.patch(x, gy, z, 0.55 * power, rand(3, 5), by);
    // people (a picture of somebody else's burst hurts nobody here: whoever it caught has been told by its owner)
    for (const h of ghost ? [] : g.humans) {
      if (h.removed || h === by || h.car) continue;
      const c = h.bodies[P.CHEST];
      const dx = c.px - x, dy = c.py - y, dz = c.pz - z, d = Math.hypot(dx, dy, dz);
      if (d > R) continue;
      const f = (1 - d / R) ** 1.5;
      const ux = dx / (d || 1), uy = dy / (d || 1), uz = dz / (d || 1);
      if (h.puppet) {
        // another player: thrown down and set alight on their own screen, by blows from you
        h.hit({ part: P.CHEST, type: 'blunt', power: f * 2.4, point: [c.px - ux * 0.1, c.py - uy * 0.1, c.pz - uz * 0.1], dir: [ux, uy, uz], impulse: f * 150, lift: f * 90, attacker: by, weapon: 'swirl' });
        if (g.fire) g.fire.ignite(h, P.CHEST, 0.35 + f * 0.6, by, 'swirl');
        continue;
      }
      if (h.h.god) continue;
      if (h.state !== ST.RAGDOLL && f > 0.22) h.toRagdoll();
      else if (h.state === ST.ANIM && f > 0.06) h.toStumble(40 + f * 60, ux * 4 * f, uz * 4 * f);
      if (h.state === ST.RAGDOLL) for (const b of h.bodies) { b.vx += ux * f * 8; b.vy += (0.4 + Math.max(0, uy)) * f * 6; b.vz += uz * f * 8; }
      const n = f > 0.5 ? 3 : f > 0.2 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const part = pick([P.CHEST, P.ABDOMEN, P.HEAD, P.UARM_L, P.UARM_R, P.THIGH_L, P.THIGH_R]);
        if (h.gone[part]) continue;
        const b = h.bodies[part];
        h.hit({ part, type: 'blunt', power: f * 2.4 * rand(0.8, 1.2), point: [b.px - ux * 0.1, b.py - uy * 0.1, b.pz - uz * 0.1], dir: [ux, uy, uz], impulse: 0, attacker: by, weapon: 'swirl' });
      }
      if (g.fire) for (let k = 0; k < 1 + ((f * 3) | 0); k++) g.fire.ignite(h, (Math.random() * PART_COUNT) | 0, 0.35 + f * 0.6, by, 'swirl');
      g.minds?.witness({ kind: 'attack', actor: by, victim: h, weapon: 'swirl', part: P.CHEST, x: c.px, y: c.py, z: c.pz, rep: { pain: 30, bones: [] } });
    }
    // things
    for (const pr of ghost ? [] : g.props) {
      const b = pr.body;
      const dx = b.px - x, dy = b.py - y, dz = b.pz - z, d = Math.hypot(dx, dy, dz);
      if (d > R + 0.5) continue;
      const f = (1 - clamp01(d / (R + 0.5))) ** 1.5, ux = dx / (d || 1), uz = dz / (d || 1);
      if (!b.kinematic || pr.mirror) { const J = b.mass * 7 * f; b.applyImpulse(ux * J, J * 0.6, uz * J); }
      if (pr.kind === 'crate') g.fire?.igniteCrate(pr, 1.2 * f);
      if (pr.vox && pr.vox.mat === 'wood' && f > 0.2) g.fire?.patch(b.px, b.py, b.pz, 0.3, rand(3, 5), by);
    }
    if (g.traffic) for (const car of g.traffic.cars) {
      const d = Math.hypot(car.x - x, car.z - z);
      if (d > R + 2) continue;
      const f = 1 - d / (R + 2);
      g.traffic.heat(car, 14 * f, by); car.damage(6 * f, by);
    }
  }

  /* ------------------------------- the leopard -------------------------------- */

  /** On all fours: low to the ground, very fast; the first person run into is pounced on. */
  _prowl(dt) {
    const g = this.g, p = g.player, s = p.scale;
    p.stoop = 1;
    if (this.maul) { this._mauling(dt); return; }
    if (this.formT > 25) { this.revert(); g.ui?.toast('You turn back.'); return; }
    if (p.speed < 2.2) return;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const hx = p.x + fx * 0.75 * s, hz = p.z + fz * 0.75 * s;
    for (const o of g.humans) {
      if (o === p || o.removed || !o.attached[P.CHEST] || o.car) continue;
      const c = o.bodies[P.CHEST];
      if (Math.abs(c.py - (p.y + 0.6)) > 1.4) continue;
      if (Math.hypot(c.px - hx, c.pz - hz) > 0.85 * s && Math.hypot(o.x - hx, o.z - hz) > 0.75 * s) continue;
      this._pounce(o);
      return;
    }
  }

  _pounce(o) {
    const g = this.g, p = g.player;
    this.maul = { target: o, t: 0, bites: 0 };
    this.stats.mauls++;
    p.dragMax = 0;
    // knocked flat, the weight of the animal on them
    if (o.state !== ST.RAGDOLL) o.toRagdoll();
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    for (const b of o.bodies) { b.vx += fx * 3.5; b.vz += fz * 3.5; b.vy -= 0.5; }
    g.audio?.at('roar', p.x, p.y + 0.8, p.z, 1);
    g.minds?.witness({ kind: 'attack', actor: p, victim: o, weapon: 'leopard', part: P.CHEST, x: o.x, y: o.y + 0.5, z: o.z, rep: { pain: 40, bones: [] } });
    g.ui?.showMove?.('MAUL');
  }

  _mauling(dt) {
    const g = this.g, p = g.player, m = this.maul, o = m.target;
    m.t += dt;
    p.dragMax = 0;
    if (!o || o.removed) { this._endMaul(); return; }
    const c = o.bodies[P.CHEST];
    // on top of them, facing them
    const yaw = Math.atan2(c.px - p.x, c.pz - p.z);
    p.intent.face = yaw;
    // a bite, a rake of the claws, a bite...
    const TIMES = [0.3, 0.55, 0.8, 1.05, 1.3, 1.55];
    if (m.bites < TIMES.length && m.t >= TIMES[m.bites]) {
      const bite = m.bites % 2 === 0;
      const parts = bite ? [P.NECK, P.CHEST, P.UARM_L, P.UARM_R, P.FARM_L, P.FARM_R, P.HEAD] : [P.CHEST, P.ABDOMEN, P.UARM_L, P.UARM_R, P.THIGH_L, P.THIGH_R];
      const live = parts.filter((q) => !o.gone[q]);
      const part = live.length ? pick(live) : P.CHEST;
      const b = o.bodies[part];
      const dir = [b.px - p.x, -0.4, b.pz - p.z], l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
      dir[0] /= l; dir[1] /= l; dir[2] /= l;
      const rep = o.hit({ part, type: bite ? 'stab' : 'cut', power: bite ? 1.6 : 1.7, point: [b.px - dir[0] * b.hx, b.py + b.hy * 0.3, b.pz - dir[2] * b.hz], dir, normal: [0, 1, 0], impulse: 10, chop: bite ? 0 : 0.45, attacker: p, weapon: 'leopard', through: 0.1 });
      g.audio?.at(bite ? 'chomp' : 'slash', b.px, b.py, b.pz, 0.9);
      if (chance(0.5)) g.audio?.at('growl', p.x, p.y + 0.8, p.z, 0.7);
      g.gore.burst(b.px, b.py + 0.1, b.pz, 0, 1, 0, 14, 2.6, 0.9);
      if (rep && rep.wound) g.gore.mist(b.px, b.py, b.pz, -dir[0], 0.6, -dir[2], 10, 2.5, 0.8);
      if (p.isPlayer) { g.ui?.hitMark(); g.shake = Math.max(g.shake, 0.45); }
      m.bites++; this.stats.bites++;
    }
    if (m.t > 1.85) this._endMaul();
  }

  _endMaul() {
    const g = this.g, p = g.player;
    this.maul = null; p.dragMax = Infinity;
    // and the leopard is a person again, standing over what it did
    this.revert();
    g.ui?.toast('You turn back.');
  }

  /* --------------------------------- the Hulk ---------------------------------- */

  /** Bigger, broader and green: the shirt and the shoes burst off in pieces, the trousers split down the legs. */
  _hulkOn(p) {
    const g = this.g, s0 = p.scale;
    if (p.weapon && !p.weapon.def.wear) g.weapons.holster?.();
    this.was = { scale: s0, tough: p.h.tough, look: p.look };
    const c = p.bodies[P.CHEST];
    for (const part of [P.CHEST, P.ABDOMEN, P.UARM_L, P.UARM_R, P.FARM_L, P.FARM_R, P.FOOT_L, P.FOOT_R]) {
      if (p.gone[part] || !p.clothed[part] || p.cloth[part] < 0) continue;
      const b = p.bodies[part];
      g.gore.scraps(b.px, b.py, b.pz, (b.px - c.px) * 5, 0.5, (b.pz - c.pz) * 5, p.cloth[part], 4);
    }
    g.gore.clearTears?.(p);
    p.setScale(s0 * HULK_SIZE);
    p.h.tough = this.was.tough * HULK_TOUGH; p.sturdy = HULK_STURDY;
    p.look = Object.assign({}, p.look, HULK_FACE); p._faceKey = null; p.snarl = true;
    if (p.vest) p.removeVest();
    for (const s of ['arms', 'legs', 'neck']) p.removeGuard(s);
    p.setCoat(hulkCoat(p)); p.bulk = 1.3; p.brawn = HULK_BRAWN; p.pose.brute = 1;
    p.powerMul = 2.6; p.reachMul = 1.4; p.anim.speedUp = 1.12; p.speedMul = 1.3; p.jumpMul = 1.7;
    this._shred(p);
    g.shake = Math.max(g.shake, 0.7);
    this.stats.hulks = (this.stats.hulks || 0) + 1;
    g.ui?.toast('Hulk. Half as big again, green, and very hard to hurt. HULK PUNCH (7), HULK SMASH (8: hold it to leap), ROCK THROW (9).', 4.5);
  }

  /** A person again, the size they were; what is left of their own clothes hangs in tatters. */
  _hulkOff(p, quiet) {
    const g = this.g;
    p.snarl = false; p.pose.lift = 0; p.pose.brute = 0; p.dragMax = Infinity; p.brawn = null;
    p.setCoat(null); p.bulk = 1; p.powerMul = 1; p.reachMul = 1; p.anim.speedUp = 1; p.sturdy = 1; p.jumpMul = 1;
    g.gore.clearTears?.(p);
    if (this.was) { p.look = this.was.look; p._faceKey = null; p.setScale(this.was.scale); p.h.tough = this.was.tough; this.was = null; }
    if (!quiet || !p.h.alive) this._tatters(p);
  }

  /** The trousers, split as the legs swell: long rips up the thighs and the shins, ragged at the bottom. */
  _shred(h) {
    const g = this.g, s = h.scale;
    for (const part of [P.THIGH_L, P.THIGH_R, P.SHIN_L, P.SHIN_R, P.PELVIS]) {
      if (h.gone[part] || !h.coat || h.coat[part] === HULK_SKIN) continue;
      const b = h.bodies[part], shin = part === P.SHIN_L || part === P.SHIN_R;
      const n = part === P.PELVIS ? 1 : shin ? 3 : 2;
      for (let k = 0; k < n; k++) {
        const out = part === P.THIGH_L || part === P.SHIN_L ? 1 : -1;
        const ln = [[0, 0, 1], [out, 0, 0], [0, 0, 1], [0, 0, -1]][k % 4];
        const lp = [ln[0] * b.hx, (shin ? rand(-0.95, -0.25) : rand(-0.6, 0.6)) * b.hy, ln[2] * b.hz];
        g.gore.tear(h, part, k % 2 ? 'tear' : 'rip', lp, ln, (shin ? 0.05 : 0.045) * s, Math.PI / 2 + rand(-0.35, 0.35));
      }
    }
  }

  /** What the Hulk leaves of somebody's clothes: split down the back and the sides, and maybe a sleeve gone. */
  _tatters(p) {
    const g = this.g, s = p.scale;
    for (const part of [P.CHEST, P.ABDOMEN, P.CHEST, P.UARM_L, P.UARM_R, P.THIGH_L, P.THIGH_R]) {
      if (p.gone[part] || !p.clothed[part] || p.cloth[part] < 0) continue;
      const b = p.bodies[part], ln = pick([[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]);
      g.gore.tear(p, part, chance(0.6) ? 'rip' : 'tear', [ln[0] * b.hx, rand(-0.7, 0.7) * b.hy, ln[2] * b.hz], ln, rand(0.04, 0.06) * s, Math.PI / 2 + rand(-0.5, 0.5));
    }
    for (const arm of [P.UARM_L, P.UARM_R]) if (p.clothed[arm] && !p.gone[arm] && p.cloth[arm] >= 0 && chance(0.5)) p.stripCloth(arm);
  }

  /** HULK PUNCH: a wind-up from the hip, and everything behind it. */
  _hulkPunch() {
    const g = this.g, p = g.player;
    if (p.anim.busy || p.swap || p.reload) return false;
    if (!p.h.armOk(-1) || !p.attached[P.HAND_R]) { g.ui?.toast('You need your right arm for that.'); return false; }
    g.weapons._swing(p, 'hulkPunch', DEF.hulkPunch);
    const act = p.anim.action;
    if (act) { act.power = 'hulkPunch'; act.flung = new Set(); }
    g.audio?.at('growl', p.x, p.y + 1.8 * p.scale, p.z, 0.8);
    this.stats.hulkPunches++;
    return true;
  }

  /** Somebody the Hulk Punch landed on: off their feet and through the air. */
  _hurl(p, o) {
    const g = this.g, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    this.stats.flung++;
    this._fly(o, fx * 12, 4.5, fz * 12, p);
    g.shake = Math.max(g.shake, 0.7);
    g.audio?.at('impact', o.x, o.y + 1, o.z, 1);
  }

  /** Somebody thrown: here, or (another player, or somebody in a city that is somebody else's) by whoever keeps them. */
  _fly(o, vx, vy, vz, by) {
    if (!o || o.removed) return;
    if (o.puppet) { this.g.mp?.flyRemote?.(o, vx, vy, vz, by); return; }
    if (o.h.god) return;
    if (o.state !== ST.RAGDOLL) o.toRagdoll();
    for (let i = 0; i < PART_COUNT; i++) {
      if (!o.attached[i]) continue;
      const b = o.bodies[i];
      b.vx = vx + rand(-0.8, 0.8); b.vy = vy + rand(-0.4, 0.6); b.vz = vz + rand(-0.8, 0.8);
      b.wx += rand(-5, 5); b.wy += rand(-2, 2); b.wz += rand(-5, 5);
    }
    o.island?.wake?.();
  }

  /** The Hulk Punch at full stretch: a blast of air off the fist, and whatever is in front of it goes. */
  _hulkImpact(p) {
    const g = this.g, s = p.scale, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), hand = p.bodies[P.HAND_R];
    const ox = p.x, oy = clamp(hand.py, p.y + 0.8 * s, p.y + 1.5 * s), oz = p.z, reach = 1.9 * s;
    g.audio?.at('whump', hand.px, hand.py, hand.pz, 0.9);
    g.shake = Math.max(g.shake, 0.5);
    for (let k = 1; k <= 4; k++) g.gore.puff('smoke', hand.px + fx * k * 0.28, hand.py, hand.pz + fz * k * 0.28, 0.22 + k * 0.08, 0.35, 0.93, 0.93, 0.95);
    // a car in front of it goes over (and is a wreck from then on)
    if (g.traffic) for (const car of g.traffic.cars) {
      if (car.carried || Math.hypot(car.x - p.x, car.z - p.z) > 6) continue;
      if (car.ray(ox, oy, oz, fx, 0, fz, reach, _ch) < 0 && car.ray(ox, p.y + 0.55 * s, oz, fx, 0, fz, reach, _ch) < 0) continue;
      this._knockCar(car, fx * 11, 4.5, fz * 11, 3, p);
      g.audio?.at('crash', car.x, car.y + 0.8, car.z, 1);
      g.shake = Math.max(g.shake, 0.8);
      break;
    }
    // crates, rocks, a generator: knocked flying
    for (const pr of g.props) {
      if (pr.carried || pr.vox || (pr.body.kinematic && !pr.mirror)) continue;
      const t = rayBody(pr.body, ox, oy, oz, fx, 0, fz, reach, null, 0.12);
      if (t < 0) continue;
      const J = pr.body.mass * 13;
      pr.body.applyImpulse(fx * J, J * 0.35, fz * J, ox + fx * t, oy, oz + fz * t);
      if (pr.thing) g.things?.hurt(pr.thing, 6, [0, 0, 0], 'blow');
      g.audio?.at(pr.kind === 'crate' ? 'splinter' : 'thud', pr.body.px, pr.body.py, pr.body.pz, 0.9);
    }
    // a wall: a hole through it the size of a fist and a forearm
    for (const pr of g.props) {
      if (!pr.vox) continue;
      const t = pr.vox.ray(ox, oy, oz, fx, 0, fz, reach);
      if (t >= 0) this._hole(pr.vox, ox + fx * (t + 0.08), oy, oz + fz * (t + 0.08), 0.3 * s, fx, 0, fz);
    }
  }

  /** Every cube of a wall within `r` of a point, knocked out the way the blow went. */
  _hole(v, x, y, z, r, dx, dy, dz) {
    let n = 0;
    for (let c = 0; c < v.cells.length; c++) {
      if (!v.cells[c]) continue;
      v.world(c, _a);
      const ex = _a[0] - x, ey = _a[1] - y, ez = _a[2] - z;
      if (ex * ex + ey * ey + ez * ez > r * r) continue;
      v.remove(c, dx * 6 + rand(-1, 1), dy * 6 + rand(0, 2), dz * 6 + rand(-1, 1));
      n++;
    }
    if (n) { this.g.audio?.at(v.mat === 'wood' ? 'splinter' : 'crack', x, y, z, 1); this.stats.holes += n; }
    return n;
  }

  /** A car knocked over or thrown: a wreck from now on. */
  _knockCar(car, vx, vy, vz, spin, by) {
    const g = this.g;
    if (car.mirror) { g.mp?.knockCar?.(car, vx, vy, vz, spin); return; }
    g.traffic.fling(car, vx, vy, vz, spin, by);
    this.stats.carsThrown++;
  }

  /** HULK SMASH: both fists go up. Let go (a tap) and they come down on the ground; hold on and the Hulk jumps. */
  _smashStart(via) {
    const g = this.g, p = g.player;
    if (p.anim.busy || p.swap || p.reload || !p.grounded || this.smash) return false;
    if (!p.h.legOk(1) || !p.h.legOk(-1)) { g.ui?.toast('Not on those legs.'); return false; }
    p.anim.play('hulkSmash');
    const act = p.anim.action;
    if (act) act.power = 'hulkSmash';
    // from a test, or the game itself, with no button held: a tap
    this.smash = { t: 0, via: via || 'tap', leap: false, ground: !(via === 'power' || via === 'key' || via === 'hold'), target: null, air: 0 };
    g.audio?.at('roar', p.x, p.y + 1.8 * p.scale, p.z, 0.7);
    return true;
  }

  _smashing(dt) {
    const g = this.g, p = g.player, S = this.smash, inp = g.input;
    S.t += dt;
    if (p.state !== ST.ANIM || !p.h.conscious || this.form !== 'hulk') { this.smash = null; p.pose.lift = 0; return; }
    if (!S.leap) {
      const held = S.via === 'hold' || (S.via === 'power' ? !!inp.down.power : S.via === 'key' ? !!inp.key?.('Digit8') : false);
      if (!held) S.ground = true;
      if (!S.ground && S.t >= 0.28) { this._smashLeap(); return; }
      const act = p.anim.action;
      if (!act || act.name !== 'hulkSmash') this.smash = null;        // something else cut it short
      return;
    }
    S.air += dt;
    if (p.leap) {
      p.pose.lift = 1;
      // in the air: steering for wherever they are now
      const t = S.target, L = p.leap;
      if (t && !t.removed) {
        const drop = Math.max(0, p.y - t.y), vy = p.vy;
        const rem = (vy + Math.sqrt(vy * vy + 2 * 9.81 * drop)) / 9.81;
        if (rem > 0.1) {
          const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz), want = Math.min(24, d / rem), k = Math.min(1, dt * 5);
          L.vx += (dx / (d || 1) * want - L.vx) * k; L.vz += (dz / (d || 1) * want - L.vz) * k;
          if (d > 0.3) p.intent.face = Math.atan2(dx, dz);
        }
      }
      return;
    }
    // down again: the smash, on top of them
    this._slam(p);
  }

  /** Held: up, a long way, at whoever is nearest (or the way you are looking, if nobody is). */
  _smashLeap() {
    const g = this.g, p = g.player, S = this.smash;
    const t = this._nearest(p, 45);
    S.leap = true; S.target = t; S.air = 0;
    let tx, tz, ty;
    if (t) { tx = t.x; tz = t.z; ty = t.y; } else { tx = p.x + Math.sin(g.camYaw) * 12; tz = p.z + Math.cos(g.camYaw) * 12; ty = p.y; }
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    const H = clamp(1.5 + d * 0.15, 2, 6), vy = Math.sqrt(2 * 9.81 * H);
    const T = vy / 9.81 + Math.sqrt(2 * Math.max(0.3, p.y + H - ty) / 9.81);
    const yaw = d > 0.2 ? Math.atan2(dx, dz) : p.yaw;
    p.yaw = yaw; p.intent.face = yaw;
    p.anim.action = null;
    p.leap = { vx: dx / T, vy, vz: dz / T, t: 0, max: T + 1.2 };
    p.pose.lift = 1;
    this.stats.smashLeaps++;
    g.audio?.at('roar', p.x, p.y + 1.8 * p.scale, p.z, 1);
    g.audio?.at('whump', p.x, p.y, p.z, 0.7);
    const gy = groundHeight(p.x, p.z);
    if (Math.abs(p.y - gy) < 0.35) g.gore.crater?.(p.x, gy, p.z, 0.55);
    for (let k = 0; k < 6; k++) g.gore.puff('smoke', p.x + rand(-0.6, 0.6), p.y + 0.1, p.z + rand(-0.6, 0.6), rand(0.5, 0.9), rand(0.8, 1.4), 0.55, 0.5, 0.44);
    g.minds?.witness({ kind: 'power', actor: p, power: 'smash', x: p.x, y: p.y + 1, z: p.z });
    g.ui?.showMove?.('HULK LEAP');
  }

  /** Coming down out of the leap: both fists into whoever is under them, and into the ground. */
  _slam(p) {
    const g = this.g, S = this.smash, s = p.scale;
    this.smash = null; p.pose.lift = 0;
    p.anim.play('hulkSmash');
    const act = p.anim.action;
    if (act) { act.t = act.clip.dur * 0.46; act.power = 'slam'; act.fired = true; }
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), x = p.x + fx * 0.7 * s, z = p.z + fz * 0.7 * s;
    const t = S.target;
    if (t && !t.removed && Math.hypot(t.x - x, t.z - z) < 2.6 * s && Math.abs(t.y - p.y) < 2) this._crush(t, p);
    this._quake(x, p.y, z, 7.5, 1.4, p);
    this.stats.smashes++;
    g.ui?.showMove?.('HULK SMASH');
  }

  /** Both fists, from above, on somebody. */
  _crush(t, by) {
    const g = this.g;
    this.stats.smashHits++;
    for (const part of [P.CHEST, P.ABDOMEN, P.HEAD, P.PELVIS]) {
      if (t.gone[part]) continue;
      const b = t.bodies[part];
      t.hit({ part, type: 'blunt', power: part === P.HEAD ? rand(2.2, 3) : rand(2.6, 3.6), point: [b.px, b.py + b.hy, b.pz], dir: [0, -1, 0], normal: [0, 1, 0], impulse: 0, attacker: by, weapon: 'hulksmash' });
    }
    if (t.puppet) { this._fly(t, 0, -4, 0, by); return; }
    if (t.h.god) return;
    if (t.state !== ST.RAGDOLL) t.toRagdoll();
    for (const b of t.bodies) { b.vy = Math.min(b.vy, -5); b.vx *= 0.3; b.vz *= 0.3; }
    g.minds?.witness({ kind: 'attack', actor: by, victim: t, weapon: 'hulksmash', part: P.CHEST, x: t.x, y: t.y + 1, z: t.z, rep: { pain: 60, bones: [] } });
  }

  /** A tap of HULK SMASH: the fists come down on the ground in front. */
  _groundSmash(p) {
    const s = p.scale, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    this.smash = null;
    this._quake(p.x + fx * 0.8 * s, p.y, p.z + fz * 0.8 * s, 6.5, 1.1, p);
    this.stats.smashes++;
  }

  /** Fists into the ground: it breaks and shakes, and everything standing near is thrown down. */
  _quake(x, y, z, R, power, by, ghost = false) {
    const g = this.g;
    if (!ghost && by && by.isPlayer) g.mp?.powerFx('quake', [x, y, z], [0, 1, 0], power);
    g.audio?.at('explosion', x, y, z, 0.5 * power);
    g.audio?.at('whump', x, y, z, 1);
    g.audio?.at('crack', x, y, z, 0.9);
    g.minds?.noise(x, y, z, 118, 'explosion', by);
    g.minds?.witness({ kind: 'power', actor: by, power: 'smash', x, y: y + 1, z });
    const cam = Math.hypot(g.camX - x, g.camZ - z);
    g.shake = Math.max(g.shake, clamp(1.8 - cam / 14, 0.25, 1.8));
    // the road breaks; dust and pieces of it are thrown up all round
    const gy = groundHeight(x, z);
    if (Math.abs(y - gy) < 0.4) g.gore.crater?.(x, gy, z, 1.1 * power);
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * TAU + rand(-0.15, 0.15), r = rand(0.5, 1.8) * power;
      g.gore.puff('smoke', x + Math.cos(a) * r, y + rand(0.05, 0.5), z + Math.sin(a) * r, rand(0.7, 1.3) * power, rand(1.2, 2.4), 0.56, 0.52, 0.46);
    }
    for (let k = 0; k < 4; k++) g.gore.puff('smoke', x + rand(-0.4, 0.4), y + 0.4, z + rand(-0.4, 0.4), 1.7 * power, 1.5, 0.62, 0.58, 0.52);
    if (g.voxels?.chip) for (let k = 0; k < 14 + 8 * power; k++) {
      const a = rand(TAU), sp = rand(1.5, 5) * power, sz = rand(0.05, 0.13);
      g.voxels.chip(x + Math.cos(a) * rand(0, 0.6), y + 0.06, z + Math.sin(a) * rand(0, 0.6), Math.cos(a) * sp, rand(2.5, 6.5) * power, Math.sin(a) * sp, [sz, sz * rand(0.6, 1), sz * rand(0.7, 1.2)], RUBBLE, chance(0.7) ? 0 : 3);
    }
    this.glows.push({ x, y: y + 0.5, z, c: 0xd8c8a8, i: 6 * power, d: 10, t: 0, life: 0.25 });
    if (ghost) return;
    this.stats.quakes = (this.stats.quakes || 0) + 1;
    for (const h of g.humans) {
      if (h.removed || h === by || h.car) continue;
      const dx = h.x - x, dz = h.z - z, d = Math.hypot(dx, dz);
      if (d > R || Math.abs(h.y - y) > 2.5) continue;
      const f = (1 - d / R) ** 1.2, ux = dx / (d || 1), uz = dz / (d || 1);
      // the ground comes up under them: the legs take it
      const n = f > 0.6 ? 3 : f > 0.3 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const part = pick([P.SHIN_L, P.SHIN_R, P.THIGH_L, P.THIGH_R, P.PELVIS, P.FOOT_L, P.FOOT_R]);
        if (h.gone[part]) continue;
        const b = h.bodies[part];
        h.hit({ part, type: 'blunt', power: f * 2 * power * rand(0.8, 1.2), point: [b.px, b.py - b.hy * 0.5, b.pz], dir: [ux * 0.3, 0.95, uz * 0.3], normal: [0, -1, 0], impulse: 0, attacker: by, weapon: 'hulksmash' });
      }
      if (h.puppet) { if (f > 0.1) this._fly(h, ux * 5 * f, 2.5 + 5 * f, uz * 5 * f, by); continue; }
      if (h.h.god) continue;
      if (f > 0.12 && h.state !== ST.RAGDOLL) h.toRagdoll();
      else if (h.state === ST.ANIM) h.toStumble(30 + f * 80, ux * 3 * f, uz * 3 * f);
      if (h.state === ST.RAGDOLL) for (const b of h.bodies) { b.vx += ux * 5 * f; b.vy += 2 + 5 * f * power; b.vz += uz * 5 * f; b.wx += rand(-3, 3) * f; b.wz += rand(-3, 3) * f; }
      g.minds?.witness({ kind: 'attack', actor: by, victim: h, weapon: 'hulksmash', part: P.PELVIS, x: h.x, y: h.y + 1, z: h.z, rep: { pain: 30, bones: [] } });
    }
    // things jump
    for (const pr of g.props) {
      if (pr.carried || (pr.vox && pr.vox.anchored)) continue;
      const b = pr.body;
      if (b.kinematic && !pr.mirror) continue;
      const dx = b.px - x, dz = b.pz - z, d = Math.hypot(dx, dz);
      if (d > R + 1 || Math.abs(b.py - y) > 3) continue;
      const f = 1 - d / (R + 1);
      b.applyImpulse(dx / (d || 1) * b.mass * 2.5 * f, b.mass * (2.5 + 4 * f) * power, dz / (d || 1) * b.mass * 2.5 * f);
      b.wx += rand(-4, 4) * f; b.wz += rand(-4, 4) * f;
    }
    // cars bounce on their springs; the nearest go over
    if (g.traffic) for (const car of g.traffic.cars.slice()) {
      if (car.carried) continue;
      const d = Math.hypot(car.x - x, car.z - z);
      if (d > R + 2) continue;
      const f = 1 - d / (R + 2), ux = (car.x - x) / (d || 1), uz = (car.z - z) / (d || 1);
      if (f > 0.5) this._knockCar(car, ux * 3.5 * f, (3 + 4 * f) * power, uz * 3.5 * f, 1.8 * f, by);
      else { car.damage?.(6 * f, by); car.bump = Math.max(car.bump || 0, 0.12 * f); }
    }
  }

  /** ROCK THROW: a car if one is within reach (a wreck will do), and otherwise a rock out of the ground. */
  _pickUp() {
    const g = this.g, p = g.player, s = p.scale;
    if (p.anim.busy || p.swap || p.reload || !p.grounded) return false;
    if (!p.h.armOk(1) || !p.h.armOk(-1) || !p.attached[P.HAND_L] || !p.attached[P.HAND_R]) { g.ui?.toast('You need both arms for that.'); return false; }
    if (p.weapon && !p.weapon.def.wear) { g.ui?.toast('Your hands are full. Put it away first (H).'); return false; }
    let car = null, best = 1.8 * s;
    if (g.traffic) for (const c of g.traffic.cars) {
      if (c.carried || c.kind === 'tank' || c.seats.some((h) => h && h.isPlayer)) continue;
      const b = c.body;
      if (Math.hypot(b.px - p.x, b.pz - p.z) > 8) continue;
      b.toLocal(p.x, b.py, p.z, _a);
      const e = Math.hypot(Math.max(0, Math.abs(_a[0]) - b.hx), Math.max(0, Math.abs(_a[2]) - b.hz));
      if (e < best) { best = e; car = c; }
    }
    if (!(car ? this._liftCar(p, car) : this._pullRock(p))) return false;
    p.anim.play('hulkPull');
    const act = p.anim.action;
    if (act) act.power = 'hulkPull';
    return true;
  }

  _liftCar(p, car) {
    const g = this.g;
    if (car.mirror && !g.mp?.takeCar?.(car)) return false;
    const yaw = Math.atan2(car.body.px - p.x, car.body.pz - p.z);
    p.yaw = yaw; p.intent.face = yaw;
    g.traffic.lift(car, p);
    const b = car.body;
    this.carry = { kind: 'car', car, body: b, t: 0, phase: 'pull', from: [b.px, b.py, b.pz], fromQ: [b.qx, b.qy, b.qz, b.qw], tilt: [0, 0, 0, 1], throwQ: false, half: car.wreckCy || 0.76 };
    this.stats.lifts++;
    g.audio?.at('creak', b.px, b.py, b.pz, 1);
    g.audio?.at('growl', p.x, p.y + 1.8 * p.scale, p.z, 0.9);
    g.minds?.witness({ kind: 'power', actor: p, power: 'lift', x: b.px, y: b.py, z: b.pz });
    g.ui?.showMove?.('CAR LIFT');
    return true;
  }

  _pullRock(p) {
    const g = this.g, s = p.scale, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const x = p.x + fx * 1.0 * s, z = p.z + fz * 1.0 * s, gy = groundHeight(x, z);
    if (Math.abs(p.y - gy) > 0.5) { g.ui?.toast('There is no ground here to pull a rock out of.'); return false; }
    const rock = this._makeRock(x, gy - 0.12, z);
    const b = rock.body;
    rock.carried = p;
    b.setKinematic(true);
    b.skipIsland = p.island;
    // held a little askew, as it came out
    const t1 = rand(-0.35, 0.35), t2 = rand(-0.35, 0.35), tilt = [Math.sin(t1 / 2), 0, Math.sin(t2 / 2), Math.cos(t1 / 2) * Math.cos(t2 / 2)];
    const tl = Math.hypot(tilt[0], tilt[1], tilt[2], tilt[3]); for (let i = 0; i < 4; i++) tilt[i] /= tl;
    this.carry = { kind: 'rock', prop: rock, body: b, t: 0, phase: 'pull', from: [x, gy - 0.12, z], fromQ: [b.qx, b.qy, b.qz, b.qw], tilt, throwQ: false, half: b.hy };
    // the ground breaks open where it comes out
    g.gore.crater?.(x, gy, z, 0.75);
    for (let k = 0; k < 8; k++) g.gore.puff('smoke', x + rand(-0.5, 0.5), gy + rand(0.05, 0.4), z + rand(-0.5, 0.5), rand(0.5, 0.9), rand(1, 1.8), 0.5, 0.45, 0.38);
    g.audio?.at('crack', x, gy, z, 1);
    g.audio?.at('whump', x, gy, z, 0.6);
    g.ui?.showMove?.('ROCK');
    return true;
  }

  /** A boulder: a box to the physics, and to look at a lump of stone with earth still on its underside. */
  _makeRock(x, y, z, k = rand(0.9, 1.12)) {
    const g = this.g, bx = g.boxes;
    const rocks = g.props.filter((o) => o.kind === 'rock' && !o.carried && !o.mirror && !o.puppetOf);
    if (rocks.length >= 8) g.removeProp(rocks[0]);
    const hx = 0.4 * k, hy = 0.3 * k, hz = 0.34 * k;
    const body = new Body({ hx, hy, hz, mass: 150 * k * k * k, x, y, z, shape: 1, dense: true, kind: 'rock', friction: 0.9, bounce: 0.04, angDamp: 0.7 });
    const a = rand(TAU); body.qy = Math.sin(a / 2); body.qw = Math.cos(a / 2);
    const island = new Island(null);
    island.add(body);
    g.world.addIsland(island);
    const lumps = [];
    const lump = (hex, lx, ly, lz, sx, sy, sz, ax, ay) => {
      const i = bx.alloc(); bx.colorHex(i, hex);
      const cx = Math.cos(ax / 2), sx2 = Math.sin(ax / 2), cy = Math.cos(ay / 2), sy2 = Math.sin(ay / 2);
      lumps.push({ i, l: [lx, ly, lz], s: [sx, sy, sz], q: [sx2 * cy, cx * sy2, -sx2 * sy2, cx * cy] });
    };
    // a core, and lumps set into it at angles round the corners, so that it is rounded and uneven and not a box
    lump(pick(STONE), 0, 0, 0, hx * 1.72, hy * 1.72, hz * 1.72, 0, 0);
    const corners = [[1, 1, 1], [-1, 1, -1], [1, 1, -1], [-1, 1, 1], [1, -1, 1], [-1, -1, -1], [0, 1, 0]];
    for (const [cx, cy, cz] of corners) {
      const f = rand(0.95, 1.2);
      lump(pick(STONE), cx * hx * 0.36, cy * hy * 0.32, cz * hz * 0.34, hx * 1.05 * f, hy * 1.02 * f, hz * 1.05 * f, rand(-0.6, 0.6), rand(-0.8, 0.8));
    }
    lump(DIRT, 0, -hy * 0.74, 0, hx * 1.6, hy * 0.5, hz * 1.5, 0, 0.2);
    lump(DIRT_D, hx * 0.3, -hy * 0.6, -hz * 0.35, hx * 0.8, hy * 0.5, hz * 0.7, 0.3, 0);
    const prop = { kind: 'rock', body, island, lumps, born: g.time, solid: true, stone: true, dispose: () => { for (const l of lumps) bx.release(l.i); } };
    body.owner = prop;
    g.props.push(prop);
    this.stats.rocks++;
    return prop;
  }

  /** Every frame something is held: what the hands are doing with it, how fast the Hulk can go with it. */
  _carrying(dt) {
    const g = this.g, p = g.player, C = this.carry;
    C.t += dt;
    if (C.kind === 'car' ? C.car.removed || !g.traffic.cars.includes(C.car) : C.prop.removed) { this.carry = null; p.pose.lift = 0; p.dragMax = Infinity; return; }
    // knocked down, out cold, turned back: it falls
    if (p.state !== ST.ANIM || !p.h.conscious || this.form !== 'hulk' || p.car) { this._release(false); return; }
    const act = p.anim.action;
    if (C.phase === 'pull' && (!act || act.name !== 'hulkPull' || act.t / act.clip.dur >= 0.97)) { C.phase = 'hold'; if (C.throwQ) { C.throwQ = false; this._throwCarry(); } }
    if (C.phase === 'throw' && (!act || act.name !== 'hulkThrow')) { this._release(true); return; }
    p.pose.lift = C.phase === 'hold' ? 1 : 0;
    p.dragMax = (C.kind === 'car' ? 1.9 : 2.7) * p.scale;
  }

  /** Where the held thing is: still in the ground, coming up out of it in the hands, or up overhead. */
  _hold(dt) {
    const g = this.g, p = g.player, C = this.carry, b = C.body;
    if (!b || p.removed) return;
    const s = p.scale, hl = p.bodies[P.HAND_L], hr = p.bodies[P.HAND_R];
    const top = [(hl.px + hr.px) / 2, Math.max(hl.py, hr.py) + C.half + 0.03 * s, (hl.pz + hr.pz) / 2];
    // a car is held across the shoulders, a rock any way up
    const yaw = p.yaw + (C.kind === 'car' ? Math.PI / 2 : 0);
    const want = mulq([0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], C.tilt, _q);
    let px = top[0], py = top[1], pz = top[2], q = want;
    if (C.phase === 'pull') {
      const act = p.anim.action, u = act && act.name === 'hulkPull' ? act.t / act.clip.dur : 1;
      const lift = C.kind === 'rock' ? C.half + 0.08 : 0;
      if (u < 0.42) {
        // the hands dig in under it; a rock comes up a little way out of the ground
        const k = smooth(clamp01((u - 0.12) / 0.3));
        px = C.from[0]; py = C.from[1] + lift * k; pz = C.from[2]; q = C.fromQ;
      } else {
        const k = smooth(clamp01((u - 0.42) / 0.5));
        px = lerp(C.from[0], top[0], k); py = lerp(C.from[1] + lift, top[1], k); pz = lerp(C.from[2], top[2], k);
        q = nlerp(C.fromQ, want, k, _q2);
      }
    }
    b.setPose(px, py, pz, q[0], q[1], q[2], q[3], dt);
    if (C.kind === 'car') C.car.follow();
  }

  /** ROCK THROW again, with something held: back over the head, and away the way you are looking. */
  _throwCarry() {
    const g = this.g, p = g.player, C = this.carry;
    if (C.phase === 'pull') { C.throwQ = true; return true; }
    if (C.phase !== 'hold' || p.anim.busy) return false;
    const yaw = g.camYaw;
    p.yaw += clamp(wrapAngle(yaw - p.yaw), -1.2, 1.2); p.intent.face = yaw;
    p.anim.play('hulkThrow');
    const act = p.anim.action;
    if (act) act.power = 'hulkThrow';
    C.phase = 'throw';
    g.audio?.at('growl', p.x, p.y + 1.8 * p.scale, p.z, 0.9);
    return true;
  }

  /** It leaves the hands: thrown (hard, the way you are looking), or let fall. */
  _release(thrown) {
    const g = this.g, p = g.player, C = this.carry;
    if (!C) return;
    this.carry = null;
    p.pose.lift = 0; p.dragMax = Infinity;
    const b = C.body;
    let vx = b.vx, vy = b.vy, vz = b.vz;
    if (thrown) {
      const v = this._throwAt(b.px, b.py, b.pz, C.kind === 'car' ? 16 : 24);
      vx = v[0] + p.vx * 0.3; vy = v[1]; vz = v[2] + p.vz * 0.3;
      this.stats.throws++;
      g.audio?.at('whoosh', b.px, b.py, b.pz, 1);
      g.audio?.at('roar', p.x, p.y + 1.8 * p.scale, p.z, 0.5);
      g.minds?.witness({ kind: 'power', actor: p, power: 'throw', x: b.px, y: b.py, z: b.pz });
      g.shake = Math.max(g.shake, 0.4);
    }
    if (C.kind === 'car') {
      if (!C.car.removed) g.traffic.drop(C.car, vx, vy, vz, thrown ? 0.45 : 0.3, p);
      if (thrown) this.stats.carsThrown++;
      // on somebody else's server it lands in their city
      if (g.mirror && !C.car.removed) g.mp?.shared?.handOff('car', C.car);
    } else {
      const pr = C.prop;
      pr.carried = null;
      if (!pr.removed) { b.setKinematic(false); b.vx = vx; b.vy = vy; b.vz = vz; b.wx = rand(-3, 3); b.wy = rand(-2, 2); b.wz = rand(-3, 3); b.island?.wake?.(); pr.thrownBy = p; }
      if (g.mirror && !pr.removed) g.mp?.shared?.handOff('rock', pr);
    }
    // it can hit the one who threw it once it is clear of them
    this.later.push({ t: 0.5, fn: () => { b.skipIsland = null; } });
  }

  /**
   * How to throw something from (x0, y0, z0) at speed `sp` so that it comes down on what the crosshair is on: somebody
   * close to the line of it if there is anybody, or whatever the line meets (a wall, the road), or a long way off.
   */
  _throwAt(x0, y0, z0, sp) {
    const g = this.g, a = g.aim, p = g.player;
    let tx, ty, tz, best = 0.13;
    for (const h of g.humans) {
      if (h === p || h.removed || !h.attached[P.CHEST]) continue;
      const c = h.bodies[P.CHEST], ex = c.px - a.ox, ey = c.py - a.oy, ez = c.pz - a.oz, d = Math.hypot(ex, ey, ez);
      if (d > 60 || d < 1.5) continue;
      const off = Math.acos(clamp((ex * a.dx + ey * a.dy + ez * a.dz) / d, -1, 1));
      if (off < best) { best = off; tx = c.px; ty = c.py - 0.2; tz = c.pz; }
    }
    if (tx === undefined) {
      let far = g.world.rayWorld(a.ox, a.oy, a.oz, a.dx, a.dy, a.dz, 60);
      if (far < 0) far = 45;
      if (a.dy < -0.01) far = Math.min(far, (a.oy - groundHeight(p.x, p.z)) / -a.dy);
      tx = a.ox + a.dx * far; ty = a.oy + a.dy * far; tz = a.oz + a.dz * far;
    }
    const dx = tx - x0, dz = tz - z0, d = Math.hypot(dx, dz) || 1e-3, h = ty - y0, G = 9.81, v2 = sp * sp;
    const disc = v2 * v2 - G * (G * d * d + 2 * h * v2);
    // the flatter of the two arcs that get there (as far as it will go, if it will not)
    const th = disc >= 0 ? Math.atan2(v2 - Math.sqrt(disc), G * d) : Math.PI / 4;
    return [dx / d * sp * Math.cos(th), sp * Math.sin(th), dz / d * sp * Math.cos(th)];
  }

  _drawRocks() {
    const g = this.g, bx = g.boxes;
    for (const pr of g.props) {
      if (pr.kind !== 'rock' || !pr.lumps) continue;
      const b = pr.body;
      for (const l of pr.lumps) bx.setOn(l.i, b.px, b.py, b.pz, b.qx, b.qy, b.qz, b.qw, l.l[0], l.l[1], l.l[2], l.s[0], l.s[1], l.s[2], l.q);
    }
  }

  /* --------------------------------- drawing ---------------------------------- */

  /** A leopard: built once from boxes, and posed every frame where the player is. */
  _drawLeopard(dt, c = this, p = this.g.player) {
    const g = this.g, bx = g.boxes;
    if (c.form !== 'leopard' || p.removed) return;
    if (!c.leo) c.leo = this._buildLeopard();
    const L = c.leo, s = p.scale * 1.05;
    const sp = Math.hypot(p.vx, p.vz);
    c.phase = (c.phase + dt * sp / 1.9) % 1;
    const run = clamp01(sp / 4), ph = c.phase * TAU;
    const m = c.maul, mt = m ? m.t : 0;
    // the whole body: crouched and reaching while mauling, bounding while running
    const pitch = m ? 0.28 + Math.sin(mt * 18) * 0.05 : Math.sin(ph * 2) * 0.07 * run;
    const lift = m ? -0.12 : Math.abs(Math.sin(ph)) * 0.08 * run;
    const yaw = p.yaw, cy = Math.cos(yaw / 2), syw = Math.sin(yaw / 2);
    const cp = Math.cos(pitch / 2), spt = Math.sin(pitch / 2);
    // body frame: pitch about X, then yaw about Y
    const bq = [cy * spt, syw * cp, -syw * spt, cy * cp];
    const ox = p.x, oy = p.y + lift * s, oz = p.z;
    const put = (i, lx, ly, lz, sx, sy, sz, rx = 0, ry = 0) => {
      // local point turned with the body, about the middle of the trunk
      const px = lx * s, py = (ly - 0.6) * s, pz = lz * s;
      rotate(bq, px, py, pz, _a);
      let q = bq;
      if (rx || ry) { const r = [Math.sin(rx / 2), 0, 0, Math.cos(rx / 2)]; if (ry) mulq(r, [0, Math.sin(ry / 2), 0, Math.cos(ry / 2)], r); q = mulq(bq, r, [0, 0, 0, 1]); }
      bx.set(i, ox + _a[0], oy + 0.6 * s + _a[1], oz + _a[2], q[0], q[1], q[2], q[3], sx * s, sy * s, sz * s);
    };
    const B = L.b;
    const fp = p.isPlayer && g.firstPerson;
    put(B.trunk, 0, 0.62, -0.02, 0.34, 0.34, 0.98);
    put(B.chest, 0, 0.6, 0.33, 0.37, 0.42, 0.4);
    put(B.belly, 0, 0.46, 0.02, 0.27, 0.1, 0.78);
    put(B.haunch, 0, 0.64, -0.36, 0.36, 0.38, 0.34);
    // the head: up and forward on the neck, dipping to bite
    const bite = m ? Math.max(0, Math.sin(mt * 12.5)) : 0;
    const hp = m ? 0.55 + bite * 0.25 : -0.15 + Math.sin(ph) * 0.04 * run;
    put(B.neck, 0, 0.76 - (m ? 0.1 : 0), 0.58, 0.2, 0.3, 0.24, 0.55 + hp * 0.4);
    const hy = m ? 0.62 - bite * 0.1 : 0.9, hz = m ? 0.82 : 0.78;
    put(B.head, 0, hy, hz, 0.25, 0.21, 0.27, hp);
    put(B.snout, 0, hy - 0.04, hz + 0.17, 0.15, 0.1, 0.12, hp);
    put(B.nose, 0, hy - 0.005, hz + 0.235, 0.06, 0.035, 0.03, hp);
    put(B.jaw, 0, hy - 0.1 - bite * 0.05, hz + 0.13, 0.13, 0.035, 0.14, hp + bite * 0.5);
    put(B.earL, 0.085, hy + 0.12, hz - 0.05, 0.07, 0.07, 0.03, hp);
    put(B.earR, -0.085, hy + 0.12, hz - 0.05, 0.07, 0.07, 0.03, hp);
    put(B.eyeL, 0.07, hy + 0.035, hz + 0.135, 0.045, 0.025, 0.02, hp);
    put(B.eyeR, -0.07, hy + 0.035, hz + 0.135, 0.045, 0.025, 0.02, hp);
    if (fp) for (const i of [B.neck, B.head, B.snout, B.nose, B.jaw, B.earL, B.earR, B.eyeL, B.eyeR]) bx.hide(i);
    // the legs: a bounding gallop, the front pair and the back pair in turn
    const legs = [[0.12, 0.52, 0.38, 0], [-0.12, 0.52, 0.38, 0.12], [0.12, 0.56, -0.4, 0.5], [-0.12, 0.56, -0.4, 0.62]];
    for (let k = 0; k < 4; k++) {
      const [lx, ly, lz, off] = legs[k], back = k >= 2;
      const a = m ? (back ? 0.5 : -0.9) : Math.sin(ph + off * TAU) * 0.75 * run;
      const kn = m ? (back ? 1.1 : 0.3) : (back ? 0.45 : -0.35) + Math.max(0, -Math.sin(ph + off * TAU)) * 0.6 * run * (back ? 1 : -1);
      const L1 = back ? 0.3 : 0.27, L2 = back ? 0.3 : 0.28;
      // hip, knee, foot
      const kx = lx, ky = ly - Math.cos(a) * L1, kz = lz + Math.sin(a) * L1;
      put(L.leg[k][0], lx, ly - Math.cos(a) * L1 * 0.5, lz + Math.sin(a) * L1 * 0.5, back ? 0.12 : 0.1, L1, back ? 0.15 : 0.11, -a);
      const a2 = a + kn;
      put(L.leg[k][1], kx, ky - Math.cos(a2) * L2 * 0.5, kz + Math.sin(a2) * L2 * 0.5, 0.08, L2, 0.08, -a2);
      put(L.leg[k][2], kx, ky - Math.cos(a2) * L2 - 0.01, kz + Math.sin(a2) * L2 + 0.04, 0.1, 0.05, 0.13);
    }
    // the tail: low, and curling up at the end, swinging with the stride
    let tx = 0, ty = 0.66, tz = -0.5, ta = 0.5;
    for (let i = 0; i < 6; i++) {
      const sw = Math.sin(c.formT * 3 + i * 0.7) * 0.18 + Math.sin(ph) * 0.1 * run;
      ta += i < 3 ? 0.12 : -0.18;
      const seg = 0.14, ny = ty - Math.cos(ta) * seg * 0.2 + (i > 3 ? 0.04 : -0.02), nz = tz - seg;
      const nx = tx + sw * 0.05 * (i + 1);
      put(L.tail[i], (tx + nx) / 2, (ty + ny) / 2, (tz + nz) / 2, 0.055 - i * 0.004, 0.055 - i * 0.004, seg, 0, sw * 0.5);
      tx = nx; ty = ny; tz = nz;
    }
    // the spots
    for (const d of L.spots) put(d.i, d.x, d.y, d.z, d.w, d.h, d.d);
  }

  _buildLeopard() {
    const bx = this.g.boxes, all = [];
    const box = (hex) => { const i = bx.alloc(); bx.colorHex(i, hex); all.push(i); return i; };
    const b = {
      trunk: box(FUR), chest: box(FUR), belly: box(CREAM), haunch: box(FUR), neck: box(FUR), head: box(FUR), snout: box(CREAM),
      nose: box(NOSE), jaw: box(CREAM), earL: box(FUR_D), earR: box(FUR_D), eyeL: box(EYE), eyeR: box(EYE),
    };
    const leg = [0, 1, 2, 3].map(() => [box(FUR), box(FUR), box(CREAM)]);
    const tail = [0, 1, 2, 3, 4, 5].map((i) => box(i === 5 ? SPOT : FUR));
    // rosettes over the back and the flanks, the same every time
    const spots = [];
    let r = 7;
    const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    for (let i = 0; i < 34; i++) {
      const side = i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : -1;
      const z = -0.48 + rnd() * 0.95;
      const x = side === 0 ? (rnd() - 0.5) * 0.28 : side * (0.175 + 0.004);
      const y = side === 0 ? 0.79 + 0.006 : 0.52 + rnd() * 0.24;
      spots.push({ i: box(SPOT), x, y, z, w: side === 0 ? 0.05 : 0.012, h: side === 0 ? 0.012 : 0.045, d: 0.05 + rnd() * 0.02 });
    }
    return { b, leg, tail, spots, all };
  }

  /** The hybrid: spots on the fur, a leopard's head over the face, a tail. */
  _drawHybrid(dt, c = this, p = this.g.player) {
    const g = this.g, bx = g.boxes;
    if (c.form !== 'hybrid' || p.removed) return;
    if (!c.hyb) c.hyb = this._buildHybrid(p);
    const H = c.hyb, s = p.scale;
    // the front of the jacket: a white shirt, a black tie, the lapels, a red square in the pocket
    const ch = p.bodies[P.CHEST], cz = p.sizes[P.CHEST], fz = cz[2] * 0.5 * p.bulk / s;
    const suit = (i, lx, ly, lz, sx, sy, sz) => { if (p.gone[P.CHEST]) bx.hide(i); else bx.setOn(i, ch.px, ch.py, ch.pz, ch.qx, ch.qy, ch.qz, ch.qw, lx * s, ly * s, lz * s, sx * s, sy * s, sz * s); };
    suit(H.suit.shirt, 0, 0.075, fz + 0.002, 0.075, 0.15, 0.005);
    suit(H.suit.tie, 0, 0.055, fz + 0.005, 0.026, 0.15, 0.005);
    suit(H.suit.knot, 0, 0.13, fz + 0.006, 0.034, 0.024, 0.008);
    suit(H.suit.lapelL, 0.055, 0.06, fz + 0.004, 0.03, 0.17, 0.006);
    suit(H.suit.lapelR, -0.055, 0.06, fz + 0.004, 0.03, 0.17, 0.006);
    suit(H.suit.pocket, 0.1, 0.07, fz + 0.004, 0.04, 0.018, 0.006);
    for (const sp of H.spots) {
      if (p.gone[sp.part]) { bx.hide(sp.i); continue; }
      const b = p.bodies[sp.part], z = p.sizes[sp.part], k = p.bulk;
      bx.setOn(sp.i, b.px, b.py, b.pz, b.qx, b.qy, b.qz, b.qw, sp.u * z[0] * 0.5 * k, sp.v * z[1] * 0.5, sp.w * z[2] * 0.5 * k, sp.sx * s, sp.sy * s, sp.sz * s);
    }
    const hd = p.bodies[P.HEAD], hz = p.sizes[P.HEAD], show = !p.gone[P.HEAD] && !(p.isPlayer && g.firstPerson);
    const on = (i, lx, ly, lz, sx, sy, sz) => { if (!show) bx.hide(i); else bx.setOn(i, hd.px, hd.py, hd.pz, hd.qx, hd.qy, hd.qz, hd.qw, lx * s, ly * s, lz * s, sx * s, sy * s, sz * s); };
    const f = hz[2] / s * 0.5;
    on(H.head.snout, 0, -0.045, f + 0.045, 0.12, 0.085, 0.09);
    on(H.head.nose, 0, -0.012, f + 0.09, 0.05, 0.03, 0.02);
    on(H.head.mouth, 0, -0.085, f + 0.07, 0.07, 0.012, 0.02);
    on(H.head.eyeL, 0.05, 0.03, f + 0.004, 0.04, 0.022, 0.01);
    on(H.head.eyeR, -0.05, 0.03, f + 0.004, 0.04, 0.022, 0.01);
    on(H.head.brow, 0, 0.06, f + 0.002, 0.17, 0.02, 0.008);
    // a black top hat with a red band, set square on the head; the ears are under it
    const top = hz[1] / s * 0.5;
    on(H.hat.brim, 0, top + 0.01, 0, 0.3, 0.018, 0.3);
    on(H.hat.crown, 0, top + 0.019 + 0.11, 0, 0.2, 0.22, 0.2);
    on(H.hat.band, 0, top + 0.019 + 0.026, 0, 0.206, 0.046, 0.206);
    // the tail, out of the small of the back, swinging
    const pel = p.bodies[P.PELVIS], pz = p.sizes[P.PELVIS];
    let tx = 0, ty = -0.02, tz = -pz[2] / s * 0.5, ang = 0.9;
    for (let i = 0; i < 6; i++) {
      const sw = Math.sin(c.formT * 2.6 + i * 0.6) * 0.06 * (i + 1);
      ang -= 0.17;
      const seg = 0.13, nx = sw, ny = ty - Math.cos(ang) * seg, nz = tz - Math.sin(ang) * seg;
      if (p.gone[P.PELVIS]) bx.hide(H.tail[i]);
      else {
        const dx = nx - tx, dy = ny - ty, dz = nz - tz, l = Math.hypot(dx, dy, dz) || 1;
        quatZ(dx / l, dy / l, dz / l, _q);
        bx.setOn(H.tail[i], pel.px, pel.py, pel.pz, pel.qx, pel.qy, pel.qz, pel.qw, (tx + nx) / 2 * s, (ty + ny) / 2 * s, (tz + nz) / 2 * s, (0.05 - i * 0.004) * s, (0.05 - i * 0.004) * s, seg * s, _q);
      }
      tx = nx; ty = ny; tz = nz;
    }
  }

  _buildHybrid(p) {
    const bx = this.g.boxes, all = [];
    const box = (hex) => { const i = bx.alloc(); bx.colorHex(i, hex); all.push(i); return i; };
    const spots = [];
    let r = 11;
    const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    // only where the fur shows: the head, the neck, the backs of the hands
    const parts = [P.HEAD, P.HEAD, P.HEAD, P.NECK, P.NECK, P.HAND_L, P.HAND_R];
    for (let k = 0; k < 2; k++) for (const part of parts) {
      // on one of the four sides of the part, somewhere along it (not over the face)
      let face = (rnd() * 4) | 0;
      if (part === P.HEAD && face === 2) face = 3;
      const u = face === 0 ? 1.03 : face === 1 ? -1.03 : (rnd() - 0.5) * 1.4;
      const w = face === 2 ? 1.03 : face === 3 ? -1.03 : (rnd() - 0.5) * 1.4;
      const v = (rnd() - 0.5) * 1.6;
      const thinX = face < 2;
      spots.push({ i: box(SPOT), part, u, v, w, sx: thinX ? 0.006 : 0.04, sy: 0.036, sz: thinX ? 0.04 : 0.006 });
    }
    const head = { snout: box(CREAM), nose: box(NOSE), mouth: box(NOSE), eyeL: box(EYE), eyeR: box(EYE), brow: box(FUR_D) };
    const hat = { brim: box(HAT), crown: box(HAT), band: box(BAND) };
    const suit = { shirt: box(WHITE), tie: box(TIE), knot: box(TIE), lapelL: box(LAPEL), lapelR: box(LAPEL), pocket: box(BAND) };
    const tail = [0, 1, 2, 3, 4, 5].map((i) => box(i === 5 ? SPOT : FUR));
    return { spots, head, hat, suit, tail, all };
  }

  /**
   * Another player in a form, as their own game says: the hybrid's suit,
   * claws and leopard's head on them, or the leopard drawn in their place.
   * null takes it off again.
   */
  dress(h, form) {
    const bx = this.g.boxes, c = h.costume || (h.costume = { form: null, leo: null, hyb: null, phase: 0, formT: 0, maul: null });
    if (c.form === form) return;
    if (c.form === 'hybrid') { h.setCoat(null); h.setClaws(false); h.beast = false; h.bulk = 1; }
    if (c.form === 'hulk') { h.setCoat(null); h.bulk = 1; h.brawn = null; h.snarl = false; this.g.gore.clearTears?.(h); if (c.look) { h.look = c.look; c.look = null; h._faceKey = null; } }
    if (c.form === 'leopard') h.hidden = false;
    for (const set of [c.leo, c.hyb]) if (set) for (const i of set.all) bx.release(i);
    c.leo = null; c.hyb = null; c.form = form; c.formT = 0;
    if (form === 'hybrid') { h.setCoat(HYBRID_COAT); h.setClaws(true); h.beast = true; h.bulk = 1.06; }
    if (form === 'hulk') { c.look = h.look; h.look = Object.assign({}, h.look, HULK_FACE); h._faceKey = null; h.snarl = true; this.g.gore.clearTears?.(h); h.setCoat(hulkCoat(h)); h.bulk = 1.3; h.brawn = HULK_BRAWN; this._shred(h); }
    if (form === 'leopard') h.hidden = true;
  }

  /** Another player's slash, ring or fireball, as it looks from here: it flies and bursts, and hurts nobody. */
  ghost(kind, by, m, d, big = 1) {
    if (kind === 'slash') this._addSlash(by, m[0], m[1], m[2], d[0], d[1], d[2], big, true);
    else if (kind === 'ring') this._addRing(by, m[0], m[1], m[2], d[0], d[1], d[2], big, true);
    else if (kind === 'fire') this._addFire(by, m[0], m[1], m[2], d[0], d[1], d[2], big, null, true);
    else if (kind === 'quake') this._quake(m[0], m[1], m[2], 6.5, big, by, true);
  }

  /** Back to the start: everything in flight gone, any form undone. */
  clear() {
    for (const o of this.shots) for (const k of o.inst) this.glow.release(k);
    this.shots.length = 0; this.later.length = 0; this.glows.length = 0;
    if (this.eating) this._stopEating(false);
    if (this.carry) this._release(false);
    if (this.form) this.revert(true);
    this.cast = null; this.maul = null; this.leapT = 0; this.smash = null;
  }
  /** The player has been put back together: a form does not survive it, the fruit does. */
  onRespawn() {
    if (this.carry) this._release(false);
    this.form = null; this.maul = null; this.cast = null; this.eating = null; this.leapT = 0; this.was = null; this.smash = null;
    if (this.leo) for (const i of this.leo.all) this.g.boxes.hide(i);
    if (this.hyb) for (const i of this.hyb.all) this.g.boxes.hide(i);
    this.g.ui?.abilitiesChanged();
  }
}

/* ------------------------------------ maths ------------------------------------- */

function rotate(q, x, y, z, out) {
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  out[0] = x + qw * tx + (qy * tz - qz * ty); out[1] = y + qw * ty + (qz * tx - qx * tz); out[2] = z + qw * tz + (qx * ty - qy * tx);
  return out;
}
function mulq(a, b, out) {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = b[3];
  out[0] = aw * bx + ax * bw + ay * bz - az * by; out[1] = aw * by - ax * bz + ay * bw + az * bx;
  out[2] = aw * bz + ax * by - ay * bx + az * bw; out[3] = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}
/** Most of the way from one turn to another (`k` of it), the short way round. */
function nlerp(a, b, k, out) {
  const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  let x = a[0] + (b[0] * s - a[0]) * k, y = a[1] + (b[1] * s - a[1]) * k, z = a[2] + (b[2] * s - a[2]) * k, w = a[3] + (b[3] * s - a[3]) * k;
  const l = Math.hypot(x, y, z, w) || 1;
  out[0] = x / l; out[1] = y / l; out[2] = z / l; out[3] = w / l;
  return out;
}
/** The shortest turn that takes +X to (x,y,z), a unit vector. */
function quatX(x, y, z, out) {
  let qx = 0, qy = -z, qz = y, qw = 1 + x;
  const l = Math.hypot(qx, qy, qz, qw);
  if (l < 1e-5) { out[0] = 0; out[1] = 1; out[2] = 0; out[3] = 0; return out; }
  out[0] = qx / l; out[1] = qy / l; out[2] = qz / l; out[3] = qw / l;
  return out;
}
/** The shortest turn that takes +Z to (x,y,z), a unit vector. */
function quatZ(x, y, z, out) {
  let qx = -y, qy = x, qz = 0, qw = 1 + z;
  const l = Math.hypot(qx, qy, qz, qw);
  if (l < 1e-5) { out[0] = 0; out[1] = 1; out[2] = 0; out[3] = 0; return out; }
  out[0] = qx / l; out[1] = qy / l; out[2] = qz / l; out[3] = qw / l;
  return out;
}
