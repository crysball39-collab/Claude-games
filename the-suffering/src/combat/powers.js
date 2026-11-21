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

   They are chosen in the ABILITIES menu, beside SPAWN; POWER uses whichever
   was chosen, and each has a key. Nobody watching is unmoved.
   ========================================================================== */
import * as THREE from 'three';
import { Boxes } from '../render/boxes.js';
import { ST } from '../human/human.js';
import { P, PART_COUNT } from '../human/rig.js';
import { rayBody } from '../physics/world.js';
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
];
export const ABILITY = Object.fromEntries(ABILITIES.map((a) => [a.id, a]));

/** How the rest of the game sees the techniques that are swung like weapons. */
const DEF = {
  tempest: { id: 'tempest', name: 'Tempest Kick', melee: true, moves: [] },
  swirl: { id: 'swirl', name: 'Swirling Kick', melee: true, moves: [] },
  finger: { id: 'fingerpistol', name: 'Finger Pistol', melee: true, pierce: true, moves: [] },
};
/** What the slash and the burst are, to a car they hit. */
const SLASH_HIT = { def: { blade: true, blunt: true, hitSound: 'clang' }, clip: { power: 2.4, limb: 'blade' } };

const FUR = 0xc98f2e, FUR_D = 0x9c6a1c, SPOT = 0x2a1c0e, CREAM = 0xeedcb4, NOSE = 0x2b1a14, EYE = 0xd8d84a, WHITE = 0xf3eee0;
const SUIT = 0x17181c, LAPEL = 0x25272d, SHOE = 0x0b0b0d, HAT = 0x111114, BAND = 0xb3121a, TIE = 0x0c0c0e;
/** The hybrid's colours, part by part: a black suit and shoes, and leopard where it shows (the head, the neck, the hands). */
const HYBRID_COAT = Array.from({ length: PART_COUNT }, (_, i) => (i === P.HEAD || i === P.NECK || i === P.HAND_L || i === P.HAND_R ? FUR : i === P.FOOT_L || i === P.FOOT_R ? SHOE : SUIT));
/** How much bigger the hybrid stands, and how much more it takes. */
const HYBRID_SIZE = 1.3, HYBRID_TOUGH = 2.6, HYBRID_STURDY = 2.8;
const _a = [0, 0, 0], _b = [0, 0, 0], _q = [0, 0, 0, 1];
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
    this.kickers = new Set();      // people other than you in the middle of a Tempest Kick (a bot server's host)
    // things that glow: drawn unlit and added on to whatever is behind them
    this.glow = new Boxes(game.scene, 360, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }), { shadows: false });
    this.leo = null;               // the leopard's boxes
    this.hyb = null;               // the hybrid's: spots, head, tail
    this.phase = 0;                // the leopard's stride
    this.stats = { tempest: 0, slashHits: 0, finger: 0, fireballs: 0, fireHits: 0, swirls: 0, bursts: 0, mauls: 0, bites: 0, leaps: 0, leapHits: 0, transforms: 0, eaten: 0 };
  }

  /* ---------------------------------- asking ---------------------------------- */

  has(id) { const a = ABILITY[id]; return !!a && (!a.fruit || this.fruit); }
  ready(id) { return (this.cool[id] || 0) <= 0; }
  /** 0 when it can be used, up to 1 just after it was. */
  coolFrac(id) { const a = ABILITY[id]; return a ? clamp01((this.cool[id] || 0) / (a.cool * (this.form === 'hybrid' ? 0.65 : 1))) : 0; }
  get big() { return this.form === 'hybrid' ? 1.5 : 1; }

  choose(id) {
    if (!this.has(id)) return false;
    this.selected = id;
    this.g.ui?.abilitiesChanged();
    return true;
  }

  /** POWER, or an ability's own key. */
  use(id = this.selected) {
    const g = this.g, p = g.player, a = ABILITY[id];
    if (!a) return false;
    // on somebody else's server only its host has abilities
    if (g.mp?.guest) { g.ui?.toast(`Only the host (${g.mp.hostName}) can use abilities on this server.`); return false; }
    if (!this.has(id)) { g.ui?.toast('That comes from the Cat-Cat Fruit. Eat it first (ABILITIES).'); return false; }
    if (p.state !== ST.ANIM || p.car || p.cuffed || !p.h.alive || !p.h.conscious || this.eating || this.maul || g.doctor != null) return false;
    // a form is put on, and taken off again, with the same button
    if (a.form && this.form === id) { this.revert(); this.cool[id] = 0.6; return true; }
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
    }
    if (ok) { this.cool[id] = a.cool * (this.form === 'hybrid' ? 0.65 : 1); g.ui?.showMove?.(a.name.toUpperCase()); }
    return ok;
  }

  /**
   * Somebody other than you does the Tempest Kick: on somebody else's server,
   * its host. Aimed at `target` if there is one. True if the kick has begun.
   */
  botKick(h, target = null) {
    const g = this.g;
    if (!h || h.isPlayer || h.removed || h.state !== ST.ANIM || h.car || h.cuffed || !h.h.alive || !h.h.conscious) return false;
    if (h.anim.busy || h.swap || h.reload || !h.h.legOk(1) || !h.h.legOk(-1) || !h.grounded) return false;
    if ((h.kickReady || 0) > g.time) return false;
    const t = target && !target.removed && target !== h ? target : null;
    if (t) h.intent.face = Math.atan2(t.x - h.x, t.z - h.z);
    g.weapons._swing(h, 'tempestKick', DEF.tempest, t);
    const act = h.anim.action;
    if (!act) return false;
    act.power = 'tempestKick';
    h.kickReady = g.time + ABILITY.tempest.cool;
    this.kickers.add(h);
    return true;
  }

  /* ---------------------------------- eating ---------------------------------- */

  /** The fruit: brought to the mouth three times, and then you are not quite what you were. */
  eat() {
    const g = this.g, p = g.player;
    if (g.mp?.guest) { g.ui?.toast(`Only the host (${g.mp.hostName}) can use abilities on this server.`); return false; }
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
    const o = { kind: 'slash', x, y, z, dx, dy, dz, v: 30, t: 0, life: 1.05, w: 1.7 * big * s, power: 2.0 * big, by: h, hits: new Set(), stuck: new Set(), tilt: rand(-0.3, 0.3), inst: [] };
    for (let i = 0; i < 18; i++) { const k = this.glow.alloc(); this.glow.color(k, i < 9 ? 0.5 : 0.14, i < 9 ? 1.0 : 0.55, i < 9 ? 0.55 : 0.2); o.inst.push(k); }
    this.shots.push(o);
    this.stats.tempest++;
    g.audio?.at('tempest', x, y, z, 1);
    g.minds?.noise(x, y, z, 92, 'blow', h);
    g.minds?.witness({ kind: 'power', actor: h, power: 'tempest', x, y, z });
  }

  /** SWIRLING KICK: the ring of air leaves the foot as it comes round. */
  _ring(h) {
    const g = this.g, s = h.scale, big = h.isPlayer ? this.big : 1, [dx, dy, dz] = this._dir(h);
    const x = h.x + dx * 0.6, y = h.y + 1.05 * s, z = h.z + dz * 0.6;
    const o = { kind: 'ring', x, y, z, dx, dy, dz, v: 17, t: 0, life: 1.15, R: 0.5 * big * s, power: 1.3 * big, by: h, spin: 0, inst: [] };
    for (let i = 0; i < 20; i++) { const k = this.glow.alloc(); this.glow.color(k, 0.62, 0.66, 0.72); o.inst.push(k); }
    this.shots.push(o);
    this.stats.swirls++;
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
    const o = { kind: 'fire', x, y, z, dx: dx / l, dy: dy / l, dz: dz / l, v: 21, t: 0, life: 2.4, r: 0.15 * big, power: 1.2 * big, by: h, target, inst: [] };
    for (let i = 0; i < 3; i++) { const k = this.glow.alloc(); this.glow.color(k, [1, 1, 0.9][i], [0.9, 0.55, 0.2][i], [0.55, 0.12, 0.04][i]); o.inst.push(k); }
    this.shots.push(o);
    this.stats.fireballs++;
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
      if (!quiet) {
        for (let i = 0; i < 6; i++) g.gore.puff('smoke', p.x + rand(-0.4, 0.4), p.y + rand(0.3, 1.5), p.z + rand(-0.4, 0.4), rand(0.4, 0.8), rand(0.5, 0.9), 0.8, 0.72, 0.5);
        g.audio?.at('whump', p.x, p.y + 1, p.z, 0.4);
      }
    }
    if (this.leo) for (const i of this.leo.all) g.boxes.hide(i);
    if (this.hyb) for (const i of this.hyb.all) g.boxes.hide(i);
    this.maul = null;
    g.ui?.abilitiesChanged();
  }

  /* ---------------------------------- frame ----------------------------------- */

  /** Before the people move. */
  update(dt) {
    const g = this.g, p = g.player, inp = g.input;
    for (const k in this.cool) if (this.cool[k] > 0) this.cool[k] -= dt;
    // the keys and the button
    if (g.doctor == null && !g.paused) {
      if (inp.pressed.power) this.use();
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
    }
    // a host bot's Tempest Kick lets go of its slash the same way
    for (const h of this.kickers) {
      const a = h.anim.action;
      if (h.removed || !a || a.power !== 'tempestKick' || h.state !== ST.ANIM) { this.kickers.delete(h); continue; }
      if (!a.fired && a.t / a.clip.dur >= 0.42) { a.fired = true; this.kickers.delete(h); this._slash(h); }
    }
    // a pointing finger goes back into the fist when the thrust is over
    if (!act || (act.name !== 'fingerPistol' && act.name !== 'fingerPistolL' && act.name !== 'doubleFinger')) { if (!this.later.length) p.point[0] = p.point[1] = 0; }
    if (this.leapT > 0) this._leapCheck();
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
        if (alive && o.kind === 'ring') this._burst(o.x, o.y, o.z, o.power * 0.8, o.by);
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
      this._fireHit(o, ph.human, ph.part, hx, hy, hz, ph.ln);
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
  _splash(x, y, z, k, by) {
    const g = this.g;
    if (g.fire) for (let i = 0; i < 14; i++) g.fire._add(1, x, y, z, rand(-2.5, 2.5) * k, rand(0.5, 3) * k, rand(-2.5, 2.5) * k, rand(0.3, 0.7), rand(0.25, 0.5) * k, 1.6, by);
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
      if (ph) { o.x = sx + o.dx * ph.t; o.y += o.dy * ph.t; o.z = sz + o.dz * ph.t; this._burst(o.x, o.y, o.z, o.power, o.by); return false; }
    }
    for (const pr of g.props) {
      const tt = pr.vox ? pr.vox.ray(o.x, o.y, o.z, o.dx, o.dy, o.dz, far) : rayBody(pr.body, o.x, o.y, o.z, o.dx, o.dy, o.dz, far, null, R * 0.5);
      if (tt >= 0) { o.x += o.dx * tt; o.y += o.dy * tt; o.z += o.dz * tt; this._burst(o.x, o.y, o.z, o.power, o.by); return false; }
    }
    if (g.traffic) for (const car of g.traffic.cars) {
      if (Math.hypot(car.x - o.x, car.z - o.z) > 5) continue;
      const tt = car.ray(o.x, o.y, o.z, o.dx, o.dy, o.dz, far, _ch);
      if (tt >= 0) { o.x += o.dx * tt; o.y += o.dy * tt; o.z += o.dz * tt; this._burst(o.x, o.y, o.z, o.power, o.by); return false; }
    }
    if (tw >= 0) { o.x += o.dx * tw; o.y += o.dy * tw; o.z += o.dz * tw; this._burst(o.x, o.y, o.z, o.power, o.by); return false; }
    o.x += o.dx * step; o.y += o.dy * step; o.z += o.dz * step;
    const gy = groundHeight(o.x, o.z);
    if (o.y < gy + 0.2) { this._burst(o.x, gy + 0.2, o.z, o.power, o.by); return false; }
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
  _burst(x, y, z, power, by) {
    const g = this.g, R = 2.7 * power;
    this.stats.bursts++;
    g.audio?.at('whump', x, y, z, 1);
    g.audio?.at('explosion', x, y, z, 0.45);
    g.minds?.noise(x, y, z, 125, 'explosion', by);
    g.minds?.witness({ kind: 'explosion', x, y, z, by });
    const cam = Math.hypot(g.camX - x, g.camZ - z);
    g.shake = Math.max(g.shake, clamp(1.4 - cam / 12, 0.15, 1.4));
    if (g.fire) for (let k = 0; k < 46; k++) {
      const a = rand(TAU), u = rand(0.1, 0.7), sp = rand(1.5, 5) * power;
      g.fire._add(1, x + Math.cos(a) * u, y + rand(-0.3, 0.5), z + Math.sin(a) * u, Math.cos(a) * sp, rand(1, 4.5) * power, Math.sin(a) * sp, rand(0.45, 0.95), rand(0.4, 0.8) * power, rand(1.6, 2.3), by);
    }
    for (let k = 0; k < 4; k++) g.gore.puff('flash', x + rand(-0.6, 0.6), y + rand(-0.3, 0.6), z + rand(-0.6, 0.6), rand(1.4, 2.2) * power, rand(0.1, 0.18), 1, 0.72, 0.35);
    for (let k = 0; k < 8; k++) g.gore.puff('smoke', x + rand(-1, 1), y + rand(0.2, 1.6), z + rand(-1, 1), rand(1, 2) * power, rand(1.8, 3), 0.16, 0.15, 0.14);
    for (let k = 0; k < 6; k++) g.gore.puff('smoke', x + rand(-0.6, 0.6), y + rand(-0.2, 0.6), z + rand(-0.6, 0.6), rand(0.8, 1.3) * power, rand(0.5, 0.9), 0.95, 0.95, 0.97);
    this.glows.push({ x, y, z, c: 0xff9040, i: 34 * power, d: 14, t: 0, life: 0.45 });
    const gy = groundHeight(x, z);
    if (g.fire && y - gy < 1.5) g.fire.patch(x, gy, z, 0.55 * power, rand(3, 5), by);
    // people
    for (const h of g.humans) {
      if (h.removed || h === by || h.car) continue;
      const c = h.bodies[P.CHEST];
      const dx = c.px - x, dy = c.py - y, dz = c.pz - z, d = Math.hypot(dx, dy, dz);
      if (d > R) continue;
      const f = (1 - d / R) ** 1.5;
      const ux = dx / (d || 1), uy = dy / (d || 1), uz = dz / (d || 1);
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
    for (const pr of g.props) {
      const b = pr.body;
      const dx = b.px - x, dy = b.py - y, dz = b.pz - z, d = Math.hypot(dx, dy, dz);
      if (d > R + 0.5) continue;
      const f = (1 - clamp01(d / (R + 0.5))) ** 1.5, ux = dx / (d || 1), uz = dz / (d || 1);
      if (!b.kinematic) { const J = b.mass * 7 * f; b.applyImpulse(ux * J, J * 0.6, uz * J); }
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

  /* --------------------------------- drawing ---------------------------------- */

  /** A leopard: built once from boxes, and posed every frame where the player is. */
  _drawLeopard(dt) {
    const g = this.g, p = g.player, bx = g.boxes;
    if (this.form !== 'leopard' || p.removed) return;
    if (!this.leo) this.leo = this._buildLeopard();
    const L = this.leo, s = p.scale * 1.05;
    const sp = Math.hypot(p.vx, p.vz);
    this.phase = (this.phase + dt * sp / 1.9) % 1;
    const run = clamp01(sp / 4), ph = this.phase * TAU;
    const m = this.maul, mt = m ? m.t : 0;
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
    const fp = g.firstPerson;
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
      const sw = Math.sin(this.formT * 3 + i * 0.7) * 0.18 + Math.sin(ph) * 0.1 * run;
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
  _drawHybrid() {
    const g = this.g, p = g.player, bx = g.boxes;
    if (this.form !== 'hybrid' || p.removed) return;
    if (!this.hyb) this.hyb = this._buildHybrid(p);
    const H = this.hyb, s = p.scale;
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
    const hd = p.bodies[P.HEAD], hz = p.sizes[P.HEAD], show = !p.gone[P.HEAD] && !(g.firstPerson);
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
      const sw = Math.sin(this.formT * 2.6 + i * 0.6) * 0.06 * (i + 1);
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

  /** Back to the start: everything in flight gone, any form undone. */
  clear() {
    for (const o of this.shots) for (const k of o.inst) this.glow.release(k);
    this.shots.length = 0; this.later.length = 0; this.glows.length = 0;
    if (this.eating) this._stopEating(false);
    if (this.form) this.revert(true);
    this.cast = null; this.maul = null; this.leapT = 0;
    this.kickers.clear();
  }
  /** The player has been put back together: a form does not survive it, the fruit does. */
  onRespawn() {
    this.form = null; this.maul = null; this.cast = null; this.eating = null; this.leapT = 0; this.was = null;
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
