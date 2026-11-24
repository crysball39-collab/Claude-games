/* =============================================================================
   Minds.

   Everybody in the city except you has one. It takes in the world three ways:

     sight    a cone in front of the eyes, wide at the edges only for things
              that move, stopped by buildings, cars and crates, and by
              having no eyes left
     hearing  every sound has a loudness; it falls off with distance, more
              round a corner, and a gunshot at arm's length leaves the ears
              ringing for half a minute. Speech arrives as words, and the
              far end of earshot gets only some of them
     feeling  every blow, cut and break, with where it landed and - only if
              they saw it coming - who did it; and the body's own reports:
              blood, breath, cold, sickness

   What comes in is remembered as short plain sentences. Those sentences are
   the whole of what a person knows, they drive six emotions, and they are
   what gets handed to Claude when a person is given free rein to speak.
   ========================================================================== */
import { rayBody } from '../physics/world.js';
import { STARS } from './police.js';
import { P, PARTS } from '../human/rig.js';
import { ST } from '../human/human.js';
import { clamp, clamp01, rand, chance, wrapAngle } from '../core/util.js';

const _e = [0, 0, 0], _g = [0, 0, 0], _t = [0, 0, 0];
const WEAPON_WORD = { hulkpunch: 'enormous fist', hulksmash: 'fists, from above', tempest: 'flying slash', fingerpistol: 'bare finger', flame: 'fireball', swirl: 'ring of fire', leopard: 'leopard', claws: 'claws', fists: 'fists', knife: 'knife', machete: 'machete', sword: 'sword', crowbar: 'crowbar', m1911: 'pistol', glock: 'pistol', musket: 'musket', arquebus: 'matchlock', blunderbuss: 'blunderbuss', flamethrower: 'flamethrower', frostthrower: 'frost thrower', bow: 'bow', crossbow: 'crossbow', rope: 'rope', wire: 'live wire', ak47: 'rifle', m4a1: 'rifle', ar15: 'rifle', taser: 'taser', cuffs: 'pair of handcuffs', scanner: 'fingerprint scanner', syringe: 'syringe', car: 'car', carjack: 'bare hands', explosion: 'bomb', shrapnel: 'bomb' };
const WEAPON_FEAR = { tempest: 90, fingerpistol: 72, flame: 96, swirl: 96, leopard: 99, claws: 92, fists: 22, knife: 60, machete: 76, sword: 80, crowbar: 55, m1911: 88, glock: 87, musket: 85, arquebus: 82, blunderbuss: 88, flamethrower: 98, frostthrower: 94, bow: 84, crossbow: 86, rope: 8, wire: 30, ak47: 94, m4a1: 95, ar15: 93, taser: 44, cuffs: 0, scanner: 0, syringe: 52, car: 80, carjack: 30, explosion: 99, shrapnel: 99 };
/** Fires bullets. */
export const isGun = (id) => id === 'm1911' || id === 'glock' || id === 'ak47' || id === 'm4a1' || id === 'ar15' || id === 'musket' || id === 'arquebus' || id === 'blunderbuss';
/** Looses arrows (or bolts): a weapon from a distance, if not a gun. */
export const isBow = (id) => id === 'bow' || id === 'crossbow';
export const EMOTIONS = ['fear', 'anger', 'sadness', 'joy', 'surprise', 'boredom'];

const _sight = { lp: [0, 0, 0], ln: [0, 0, 0], xn: [0, 0, 0], tag: '', piece: 0, exit: 0, glass: -1 };
export class Mind {
  constructor(human, minds) {
    this.h = human; this.minds = minds; this.game = minds.game;
    const p = this.p = human.look.persona;
    this.emo = { fear: 0, anger: 0, sadness: rand(0, 8), joy: 22 + p.cheer * 34, surprise: 0, boredom: rand(0, 35) };
    this.memory = [];
    this.sees = []; this.heard = []; this.feels = [];
    this.known = new Map();
    this.threat = null;
    this.deaf = 0;
    this.want = [];
    this.quiet = rand(0, 10);
    this.flags = {};
    this.aimed = 0;                    // seconds of having a gun pointed at them
    this.startle = 0;
    this.lookAt = null;                // { x, y, z, until }
    this.said = ''; this.saidAt = -99; this.saidAi = false;
    this.speakCool = rand(1, 6);
    this.awaiting = false;
    this._scan = rand(0, 0.3); this._body = rand(0, 1);
    this.doing = 'walking';
    // the police: what they mean to ring about, and what they have already rung about
    this.toCall = null; this.callAt = 0; this.called = new Set(); this.callRolled = new Set();
    this.culprit = new Map();          // victim id -> whoever this person saw hurt them
  }

  /* -------------------------------- memory -------------------------------- */

  note(sense, kind, text, sal = 0.3, data = null) {
    const now = this.game.time;
    const last = this.memory[this.memory.length - 1];
    // the same thing again within a couple of seconds is the same memory
    if (last && last.kind === kind && last.text === text && now - last.t < 2.5) { last.t = now; return last; }
    const m = { t: now, sense, kind, text, sal, data };
    this.memory.push(m);
    if (this.memory.length > 26) this.memory.shift();
    if (sal >= 0.3) { this.quiet = 0; this.emo.boredom = Math.max(0, this.emo.boredom - 30 * sal - 8); }
    return m;
  }

  /** Changes a feeling by an amount, as much as this person's nature allows. */
  stir(name, amount) {
    const p = this.p;
    let k = 1;
    if (name === 'fear') k = 1.55 - p.bravery;
    else if (name === 'anger') k = 0.45 + p.temper;
    else if (name === 'sadness') k = 0.4 + p.empathy;
    else if (name === 'joy') k = 0.5 + p.cheer;
    else if (name === 'surprise') k = 0.6 + p.jumpy * 0.8;
    this.emo[name] = clamp(this.emo[name] + amount * (amount > 0 ? k : 1), 0, 100);
  }

  /** Something worth saying out loud, if nothing more urgent comes up. */
  ask(kind, pri, vars = null, delay = 0) {
    const now = this.game.time;
    for (const w of this.want) if (w.kind === kind) { w.pri = Math.max(w.pri, pri); return; }
    this.want.push({ kind, pri, vars, at: now + delay, until: now + delay + (pri >= 90 ? 3 : 7) });
    if (this.want.length > 5) { this.want.sort((a, b) => b.pri - a.pri); this.want.length = 5; }
  }

  /** How this person would refer to another. */
  name(o) {
    if (!o) return 'someone';
    if (o === this.h) return 'me';
    if (o.isPlayer) return 'the stranger';
    return o.look.desc;
  }

  /* --------------------------------- sight -------------------------------- */

  /** 0 if a point cannot be seen from here; otherwise how clearly (0..1). */
  canSee(x, y, z, moving = false, salient = false) {
    const h = this.h;
    if (!h.h.conscious) return 0;
    const blind = h.h.blind;
    if (blind >= 2 || h.gone[P.HEAD] || !h.attached[P.HEAD]) return 0;
    h.eye(_e); h.gaze(_g);
    const vx = x - _e[0], vy = y - _e[1], vz = z - _e[2];
    const d = Math.hypot(vx, vy, vz);
    // somebody barely taking anything in sees only what is close
    if (d > 75 * (0.3 + 0.7 * (this.aware ?? 1))) return 0;
    if (d < 0.7) return 1;
    const c = (vx * _g[0] + vy * _g[1] + vz * _g[2]) / d;
    const ang = Math.acos(clamp(c, -1, 1));
    // one eye gone narrows that side
    let limit = 1.75;
    if (blind === 1) {
      const left = _g[2] * vx - _g[0] * vz > 0;
      if ((left && h.h.organs.eyeL <= 20) || (!left && h.h.organs.eyeR <= 20)) limit = 0.9;
    }
    if (ang > limit) return 0;
    let acuity = d > 42 ? 0.6 : 1;
    if (ang > 1.05) { if (!(moving || salient) || d > 28) return 0; acuity = 0.4; }
    const g = this.game;
    if (!g.world.lineClear(_e[0], _e[1], _e[2], x, y, z)) return 0;
    // things that can be moved hide people just as well as walls do
    const ix = vx / d, iy = vy / d, iz = vz / d;
    for (const o of g.props) {
      if (!o.solid) continue;
      // a wall or a beam: only the cubes left in it hide anything (a hole is a hole)
      if (o.vox) { if (o.vox.ray(_e[0], _e[1], _e[2], ix, iy, iz, d - 0.3) >= 0) return 0; continue; }
      const b = o.body, ex = b.px - _e[0], ez = b.pz - _e[2];
      const along = ex * ix + ez * iz;
      if (along < 0.3 || along > d - 0.4) continue;
      if (rayBody(b, _e[0], _e[1], _e[2], ix, iy, iz, d - 0.35, null) >= 0) return 0;
    }
    // a car is in the way only where it is metal: through its windows, or where they were, is seen
    if (g.traffic) for (const car of g.traffic.cars) {
      const b = car.body, ex = b.px - _e[0], ez = b.pz - _e[2];
      const along = ex * ix + ez * iz;
      if (along < -2.5 || along > d + 2.5 || (ex - ix * along) ** 2 + (ez - iz * along) ** 2 > 9) continue;
      const t = car.ray ? car.ray(_e[0], _e[1], _e[2], ix, iy, iz, d - 0.3, _sight) : rayBody(b, _e[0], _e[1], _e[2], ix, iy, iz, d - 0.4, null);
      if (t >= 0 && (!car.ray || _sight.glass === -1)) return 0;
    }
    return acuity;
  }

  canSeeHuman(o) {
    const c = o.bodies[o.gone[P.CHEST] ? P.PELVIS : P.CHEST];
    let a = this.canSee(c.px, c.py, c.pz, o.speed > 1.2, o.state !== ST.ANIM);
    if (a === 0 && !o.gone[P.HEAD] && o.attached[P.HEAD]) {
      // the top of a head over a car bonnet is still a person
      const hd = o.bodies[P.HEAD];
      a = this.canSee(hd.px, hd.py, hd.pz, o.speed > 1.2, false) * 0.8;
    }
    return a;
  }

  /** Where something is, in the words of the person looking: "close, to the left". */
  where(x, z) {
    const h = this.h;
    const dx = x - h.x, dz = z - h.z, d = Math.hypot(dx, dz);
    h.gaze(_g);
    const a = wrapAngle(Math.atan2(dx, dz) - Math.atan2(_g[0], _g[2]));
    const dir = Math.abs(a) < 0.6 ? 'ahead' : Math.abs(a) > 2.0 ? 'behind me' : a > 0 ? 'to my left' : 'to my right';
    const far = d < 2 ? 'right beside me' : d < 6 ? 'close' : d < 15 ? 'nearby' : d < 35 ? 'down the street' : 'far off';
    return { d, dir, far, text: d < 2 ? far : far + ', ' + dir };
  }

  /** A sweep of the eyes: who is in view, and what has changed about them. */
  look() {
    const g = this.game, h = this.h, now = g.time;
    this.sees.length = 0;
    if (!h.h.conscious) return;
    let nearest = null;
    for (const o of g.humans) {
      if (o === h || o.removed) continue;
      const dx = o.x - h.x, dz = o.z - h.z, d2 = dx * dx + dz * dz;
      if (d2 > 60 * 60) continue;
      const a = this.canSeeHuman(o);
      if (a === 0) continue;
      const d = Math.sqrt(d2);
      let k = this.known.get(o.id);
      if (!k) { k = { first: now, last: now, state: 'ok', armed: null, hostile: 0, hurtMe: false, bits: '', crime: 0, crimeT: 0, o }; this.known.set(o.id, k); }
      k.last = now; k.x = o.x; k.z = o.z;
      const detail = a > 0.5 && d < 32;
      const bits = detail ? o.appearance() : [];
      const armed = detail && o.weapon && !o.weapon.def.tool ? o.weapon.def.id : (detail ? null : k.armed);
      const w = this.where(o.x, o.z);
      let text = this.name(o);
      if (armed) text += ' holding a ' + WEAPON_WORD[armed];
      if (bits.length) text += ', ' + bits.join(', ');
      this.sees.push({ o, d, text: text + ' (' + w.text + ')', armed });

      // noticing things for the first time
      const state = !o.h.alive ? 'dead' : !o.h.conscious ? 'out' : o.state === ST.RAGDOLL ? 'down' : o.h.bleedOut > 1.5 ? 'hurt' : 'ok';
      if (detail && state !== k.state) {
        if (state === 'dead' && k.state !== 'dead') {
          const headless = !o.attached[P.HEAD];
          this.note('saw', 'corpse', `saw ${this.name(o)} lying dead${headless ? ', headless' : ''}`, 0.8, { o });
          this.stir('fear', 22 * falloff(d)); this.stir('sadness', 30 * falloff(d));
          h.h.disgust = Math.min(60, h.h.disgust + this.p.squeamish * 34 * falloff(d));
          if (!this.threat || this.threat.level < 30) this.ask(headless ? 'sawHeadless' : 'sawCorpse', 58);
          this._wantCall({ kind: this.culprit.has(o.id) ? 'murder' : 'body', x: o.x, z: o.z, victim: o, suspect: this.culprit.get(o.id) || null });
        } else if ((state === 'hurt' || state === 'down' || state === 'out') && k.state === 'ok') {
          this.note('saw', 'hurt', `saw ${this.name(o)} ${state === 'hurt' ? 'bleeding' : state === 'out' ? 'lying unconscious' : 'on the ground'}`, 0.5, { o });
          this.stir('fear', 8); this.stir('sadness', 12);
          if (!this.threat || this.threat.level < 25) this.ask('sawHurt', 40);
          // somebody out cold, or bleeding badly, on the ground: that is a call too
          if (state === 'out' || (state === 'down' && o.h.bleedOut > 3)) this._wantCall({ kind: this.culprit.has(o.id) ? (o.h.bleedOut > 3 ? 'stabbing' : 'assault') : 'body', x: o.x, z: o.z, victim: o, suspect: this.culprit.get(o.id) || null });
        }
        k.state = state;
      }
      // a weapon out in the street is an offence for as long as it stays out (unless it is an officer's)
      if (detail && armed && armed !== 'fists' && !o.officer && o.h.alive && o.state === ST.ANIM) { k.crime = Math.max(k.crime, isGun(armed) || isBow(armed) ? 1.3 : 1); k.crimeT = now; }
      if (detail && armed !== k.armed) {
        k.armed = armed;
        if (armed && armed !== 'fists' && o.h.alive) {
          this.note('saw', 'armed', `saw ${this.name(o)} holding a ${WEAPON_WORD[armed]}`, 0.7, { o });
          if (o.officer && !h.officer) { this.stir('fear', 12 * falloff(d)); this.stir('surprise', 24); }
          else if (!h.officer) {
            this.stir('fear', WEAPON_FEAR[armed] * 0.45 * falloff(d)); this.stir('surprise', 30);
            this._threaten(o, WEAPON_FEAR[armed] * 0.5 * falloff(d));
            this.ask('sawWeapon', 62, { weapon: WEAPON_WORD[armed], sex: o.look.sex });
          } else if (!o.officer) this._threaten(o, 40);
        }
      }
      if (!nearest || d < nearest.d) nearest = { o, d };
    }
    this.sees.sort((a, b) => a.d - b.d);
    if (this.sees.length > 7) this.sees.length = 7;

    // is a gun pointing this way?
    const pl = g.player;
    let aimedNow = false;
    if (pl !== h && pl.weapon && pl.weapon.def.gun && !pl.weapon.def.taser && pl.state === ST.ANIM && pl.h.alive) {
      const k = this.known.get(pl.id);
      if (k && now - k.last < 0.6) {
        const c = h.bodies[P.CHEST], a = g.aim;
        const vx = c.px - a.ox, vy = c.py - a.oy, vz = c.pz - a.oz, d = Math.hypot(vx, vy, vz);
        if (d < 38 && (vx * a.dx + vy * a.dy + vz * a.dz) / d > Math.cos(0.085 + 0.9 / Math.max(3, d))) aimedNow = true;
      }
    }
    if (aimedNow) {
      if (this.aimed === 0) {
        this.note('saw', 'aimed', `the stranger is pointing a ${WEAPON_WORD[pl.weapon.def.id]} at me`, 1, { o: pl });
        this.stir('fear', 55); this.stir('surprise', 30);
        this.ask('aimedAt', 88);
      }
      this.aimed += 0.3;
      this.stir('fear', 6);
      this._threaten(pl, 92);
      const kp = this._know(pl); kp.crime = Math.max(kp.crime, this.aimed > 1.4 ? 2.6 : 1.5); kp.crimeT = now;
      if (h.officer && this.aimed > 1.4) g.police?.raise(STARS.officer, 'you pointed a gun at an officer', { x: pl.x, z: pl.z }, { kind: 'menace', key: 'aimedAt' + h.id });
      else if (!h.officer && this.aimed > 1.4) this._wantCall({ kind: 'menace', x: pl.x, z: pl.z, suspect: pl });
    } else this.aimed = Math.max(0, this.aimed - 0.6);

    // blood on the ground underfoot
    if (!this.flags.blood && h.state === ST.ANIM) {
      for (const p of g.gore.pools) {
        if (p.vol < 60) continue;
        const d = Math.hypot(p.x - h.x, p.z - h.z);
        if (d < 5 && this.canSee(p.x, p.y + 0.05, p.z, false, true)) {
          this.flags.blood = now;
          this.note('saw', 'blood', 'saw a pool of blood on the ground', 0.4);
          this.stir('fear', 8); h.h.disgust = Math.min(60, h.h.disgust + this.p.squeamish * 14);
          if (!this.threat) this.ask('sawBlood', 34);
          break;
        }
      }
    } else if (this.flags.blood && now - this.flags.blood > 40) this.flags.blood = 0;
  }

  /**
   * Something the police should hear about. Most people assume somebody else
   * will ring; some do. A caller can only say who did it if they saw it done.
   */
  _wantCall(info) {
    const h = this.h, g = this.game, now = g.time;
    if (h.officer || h.isPlayer || h.cuffed || !h.h.alive || !g.police) return;
    if ((info.victim === h && !info.self) || (info.suspect && (info.suspect === h || info.suspect.officer))) return;
    const key = info.victim ? 'v' + info.victim.id : 'p' + Math.round(info.x / 18) + ',' + Math.round(info.z / 18);
    if (this.called.has(key)) return;
    const roll = key + (info.suspect ? '+' : '');
    if (this.callRolled.has(roll)) return;
    this.callRolled.add(roll);
    const p = this.p, grave = info.kind === 'murder' || info.kind === 'shooting' || info.kind === 'stabbing';
    if (!chance(clamp(0.28 + p.empathy * 0.3 + (grave ? 0.28 : info.kind === 'body' ? 0.18 : 0) - (info.kind === 'shots' ? 0.12 : 0), 0.1, 0.92))) return;
    // the worst thing they know about is what they ring about
    const cur = this.toCall;
    if (cur && ((STARS[cur.kind] || 0) > (STARS[info.kind] || 0) || (cur.suspect && !info.suspect))) return;
    info.key = key;
    info.desc = info.suspect ? (info.suspect.isPlayer ? g.police.describe(info.suspect) : info.suspect.look.desc) : '';
    this.toCall = info;
    this.callAt = Math.max(this.callAt, now + rand(1.2, 3.5));
  }

  _threaten(src, level, x, z) {
    const now = this.game.time;
    const t = this.threat;
    if (t && t.level > level && (!src || t.src !== src)) { if (now - t.t > 4) t.level *= 0.9; else return; }
    this.threat = { src: src || null, x: src ? src.x : x, z: src ? src.z : z, level: Math.max(level, t && t.src === src ? t.level * 0.92 : 0), t: now };
  }

  /** Something happened in front of them. */
  saw(ev, clarity) {
    const h = this.h, p = this.p;
    const w = this.where(ev.x, ev.z), k = falloff(w.d) * clarity;
    const A = ev.actor, V = ev.victim;
    switch (ev.kind) {
      case 'attack': {
        if (V === h || A === h) return;
        const word = WEAPON_WORD[ev.weapon] || 'weapon', sev = WEAPON_FEAR[ev.weapon] || 30;
        const verb = ev.weapon === 'carjack' ? 'drag' : ev.weapon === 'car' ? 'run down' : ev.weapon === 'fists' ? 'hit' : ev.weapon === 'taser' ? 'fire a taser into' : ev.weapon === 'syringe' ? 'jab a needle into' : ev.weapon === 'flamethrower' ? 'set fire to' : ev.weapon === 'frostthrower' ? 'freeze' : ev.weapon === 'wire' ? 'electrocute' : ev.weapon === 'knife' ? (ev.rep && ev.rep.type === 'stab' ? 'stab' : 'slash') : ev.weapon === 'machete' ? 'hack at' : ev.weapon === 'sword' ? (ev.rep && ev.rep.type === 'stab' ? 'run through' : 'cut down') : ev.weapon === 'crowbar' ? 'beat' : ev.weapon === 'tempest' ? 'slice through' : ev.weapon === 'fingerpistol' ? 'drive a finger into' : ev.weapon === 'flame' ? 'hurl fireballs at' : ev.weapon === 'swirl' ? 'blast' : ev.weapon === 'leopard' ? 'maul' : ev.weapon === 'claws' ? 'claw at' : 'shoot';
        const soft = ev.weapon === 'fists' || ev.weapon === 'taser' || ev.weapon === 'carjack';
        this.note('saw', 'attack', `saw ${this.name(A)} ${verb} ${this.name(V)}${ev.weapon === 'carjack' ? ' out of their car' : soft || ev.weapon === 'syringe' || ev.weapon === 'wire' || ev.weapon === 'fingerpistol' || ev.weapon === 'leopard' || ev.weapon === 'claws' ? '' : ' with a ' + word}`, 0.9, { o: A, v: V });
        if (ev.weapon === 'car') this.ask('runOver', 84, null, rand(0.1, 0.5));
        if (ev.weapon === 'carjack' && V !== h) this.ask('sawAttack', 60, { sex: A.look && A.look.sex }, rand(0.3, 0.9));
        if (ev.weapon === 'flamethrower' || ev.weapon === 'frostthrower') { this.stir('fear', 40 * k); this.stir('surprise', 30 * k); }
        this.stir('fear', sev * 0.6 * k); this.stir('sadness', 14 * k); this.stir('anger', (ev.weapon === 'fists' ? 16 : 8) * k); this.stir('surprise', 35 * k);
        const kn = this._know(A); kn.armed = ev.weapon;
        // the law using force is not a crime, and neither is hitting back at someone who started it
        const vk = this.known.get(V.id), lawful = A.officer || (vk && vk.crime >= 1 && !V.officer);
        if (!lawful) { kn.hostile = 1; kn.crime = soft ? Math.max(kn.crime, Math.min(2.4, kn.crime + 1)) : Math.min(6, kn.crime + 3); kn.crimeT = this.game.time; }
        if (!lawful && !A.officer) {
          this.culprit.set(V.id, A);
          const kind = isGun(ev.weapon) || isBow(ev.weapon) ? 'shooting' : ev.weapon === 'frostthrower' ? 'freezing' : ev.weapon === 'knife' || ev.weapon === 'machete' || ev.weapon === 'sword' || ev.weapon === 'tempest' || ev.weapon === 'fingerpistol' || ev.weapon === 'claws' || ev.weapon === 'leopard' ? 'stabbing' : ev.weapon === 'flame' || ev.weapon === 'swirl' ? 'burning' : ev.weapon === 'flamethrower' ? 'burning' : ev.weapon === 'wire' ? 'electrocution' : 'assault';
          // an officer who sees it is the police; anyone else has to ring them
          if (h.officer) { if (A.isPlayer) this.game.police?.raise(STARS[kind] || 1, `an officer saw you ${kind === 'assault' ? 'attack someone' : kind === 'shooting' ? 'shoot someone' : kind === 'burning' ? 'set someone on fire' : kind === 'freezing' ? 'freeze someone' : kind === 'electrocution' ? 'electrocute someone' : 'cut someone'}`, { x: A.x, z: A.z }, { kind, victim: V }); }
          else this._wantCall({ kind, x: ev.x, z: ev.z, victim: V, suspect: A });
        }
        if (h.officer && A.officer) break;
        this._threaten(A, sev * (0.45 + 0.55 * k) * (A.officer ? 0.6 : 1));
        if (!h.officer) this.ask(ev.weapon === 'fists' ? 'sawFist' : isGun(ev.weapon) ? 'sawShot' : isBow(ev.weapon) ? 'sawArrow' : ev.weapon === 'flamethrower' ? 'sawBurn' : ev.weapon === 'frostthrower' ? 'sawFreeze' : ev.weapon === 'wire' ? 'sawZap' : 'sawAttack', ev.weapon === 'fists' ? 52 : 74, { sex: A.look && A.look.sex });
        break;
      }
      case 'shot': {
        if (A === h) return;
        const kn = this._know(A); kn.armed = ev.weapon;
        const sprays = ev.weapon === 'flamethrower' || ev.weapon === 'frostthrower';
        this.note('saw', 'shot', ev.weapon === 'flamethrower' ? `saw ${this.name(A)} spraying fire from a flamethrower` : ev.weapon === 'frostthrower' ? `saw ${this.name(A)} spraying freezing mist from a frost thrower` : ev.weapon === 'bow' ? `saw ${this.name(A)} loose an arrow` : `saw ${this.name(A)} fire a ${WEAPON_WORD[ev.weapon]}`, 0.8, { o: A });
        if (!A.officer) {
          kn.hostile = Math.max(kn.hostile, 0.8); kn.crime = Math.max(kn.crime, 2); kn.crimeT = this.game.time;
          if (h.officer) { if (A.isPlayer && ev.weapon !== 'taser') this.game.police?.raise(STARS.shots, sprays ? `an officer saw you use a ${WEAPON_WORD[ev.weapon]}` : isBow(ev.weapon) ? `an officer saw you shoot a ${WEAPON_WORD[ev.weapon]}` : 'an officer saw you fire a gun', { x: A.x, z: A.z }, { kind: sprays ? 'menace' : 'shots' }); }
          else if (ev.weapon !== 'taser') this._wantCall({ kind: sprays || isBow(ev.weapon) ? 'menace' : 'shots', x: ev.x, z: ev.z, suspect: A });
        }
        if (h.officer && A.officer) break;
        this._threaten(A, 86 * (0.4 + 0.6 * k) * (A.officer ? 0.6 : 1));
        break;
      }
      case 'fire': {
        // somebody burning: whoever did it, it is a horror, and a call
        if (V === h) return;
        this.note('saw', 'fire', `saw ${this.name(V)} on fire`, 1, { v: V });
        this.stir('fear', 50 * k); this.stir('surprise', 40 * k); this.stir('sadness', 14 * k);
        h.h.disgust = Math.min(70, h.h.disgust + p.squeamish * 20 * k);
        this._threaten(null, 55 * k, ev.x, ev.z);
        if (!h.officer && !this.culprit.has(V.id)) this._wantCall({ kind: 'burning', x: ev.x, z: ev.z, victim: V, suspect: null });
        this.ask('sawFire', 76, null, 0.3);
        break;
      }
      case 'zap': {
        // somebody locked rigid on a live wire: a horror, whoever did it
        if (V === h) return;
        this.note('saw', 'zap', `saw ${this.name(V)} being electrocuted`, 1, { v: V });
        this.stir('fear', 42 * k); this.stir('surprise', 40 * k);
        if (!h.officer && !this.culprit.has(V.id)) this._wantCall({ kind: 'electrocution', x: ev.x, z: ev.z, victim: V, suspect: null });
        this.ask('sawZap', 74, null, 0.4);
        break;
      }
      case 'tie': {
        if (V === h || A === h) return;
        this.note('saw', 'tie', `saw ${this.name(A)} ${ev.wire ? 'clip a wire to' : 'tie a rope to'} ${this.name(V)}`, 0.7, { o: A, v: V });
        this.stir('surprise', 30 * k); this.stir('fear', 18 * k);
        if (!h.officer) this.ask('sawTied', 40, null, 0.6);
        const kn = this._know(A);
        if (!A.officer) { kn.crime = Math.max(kn.crime, 1.2); kn.crimeT = this.game.time; }
        if (h.officer && A.isPlayer) this.game.police?.raise(STARS.assault, 'an officer saw you tie somebody up', { x: A.x, z: A.z }, { kind: 'assault', key: 'tied' + V.id });
        break;
      }
      case 'power': {
        // somebody doing something no person can do
        if (A === h || w.d > 40) return;
        const what = { tempest: 'kick so fast that a green blade of air flew off their foot', swirl: 'kick a spinning ring of air that burst into flames', flame: 'throw fireballs out of their bare hands', leap: 'leap through the air like an animal', leopard: 'turn into a leopard', hybrid: 'turn into some kind of leopard-man, with claws', eat: 'eat a strange swirled fruit',
          hulk: 'swell up into a huge green monster, tearing out of their clothes', smash: 'smash the street apart with their fists', lift: 'pick up a car over their head', throw: 'throw something enormous through the air' }[ev.power] || 'do something impossible';
        this.note('saw', 'power', `saw ${this.name(A)} ${what}`, ev.power === 'eat' ? 0.3 : 0.9, { o: A });
        if (ev.power === 'eat') break;
        const beast = ev.power === 'leopard' || ev.power === 'hybrid' || ev.power === 'hulk';
        this.stir('surprise', 75 * k); this.stir('fear', (beast ? 72 : 46) * k);
        if (!h.officer || beast) this.ask(beast ? 'sawTransform' : 'sawPower', 70, null, rand(0.3, 0.9));
        this._threaten(A, (beast ? 80 : 55) * k);
        break;
      }
      case 'drag': {
        if (V === h || A === h || w.d > 30) return;
        const dead = !V.h.alive;
        this.note('saw', 'drag', `saw ${this.name(A)} drag ${dead ? 'a dead body' : this.name(V) + ', out cold,'} along the ground`, 0.75, { o: A, v: V });
        this.stir('fear', (dead ? 34 : 24) * k); this.stir('surprise', 34 * k);
        if (!h.officer) this.ask('sawDrag', 52, null, rand(0.4, 1.1));
        const kn = this._know(A);
        if (!A.officer) { kn.crime = Math.max(kn.crime, dead ? 2 : 1.2); kn.crimeT = this.game.time; }
        if (h.officer && A.isPlayer && !A.officer) this.game.police?.raise(STARS.assault, 'an officer saw you dragging somebody', { x: A.x, z: A.z }, { kind: 'assault', key: 'dragged' + V.id });
        break;
      }
      case 'cuff':
        if (V === h || A === h) return;
        this.note('saw', 'cuff', `saw ${this.name(A)} put handcuffs on ${this.name(V)}`, 0.7, { o: A, v: V });
        this.stir('surprise', 30 * k); if (!A.officer) this.stir('fear', 16 * k);
        break;
      case 'swing':
        if (A === h || ev.weapon === 'fists' || w.d > 12) return;
        this._know(A).armed = ev.weapon;
        this._threaten(A, WEAPON_FEAR[ev.weapon] * 0.6 * k);
        this.stir('fear', 14 * k);
        break;
      case 'death':
        if (V === h) return;
        this.note('saw', 'death', `saw ${this.name(V)} die`, 1, { v: V });
        // whoever did it has killed someone, whatever they used
        if (A && typeof A === 'object' && A.h && A !== h && !A.officer && A !== V) {
          const ka = this._know(A);
          if (!(this.known.get(V.id) || {}).crime || V.officer) {
            ka.crime = Math.max(ka.crime, 3); ka.crimeT = this.game.time;
            // it was seen to be them only if this person saw them do it
            const did = this.culprit.get(V.id) === A;
            if (h.officer) { if (A.isPlayer && did) this.game.police?.raise(V.officer ? STARS.copKill : STARS.murder, V.officer ? 'an officer saw you kill an officer' : 'an officer saw you kill someone', { x: A.x, z: A.z }, { kind: V.officer ? 'copKill' : 'murder', victim: V }); }
            else this._wantCall({ kind: did ? 'murder' : 'body', x: ev.x, z: ev.z, victim: V, suspect: did ? A : null });
          }
        } else if (!h.officer) this._wantCall({ kind: 'body', x: ev.x, z: ev.z, victim: V, suspect: null });
        this.stir('fear', 26 * k); this.stir('sadness', 38 * k); this.stir('surprise', 20 * k);
        h.h.disgust = Math.min(70, h.h.disgust + p.squeamish * 30 * k);
        this.ask('sawDeath', 80, { sex: A && A.look ? A.look.sex : 'm' }, 0.5);
        this._know(V).state = 'dead';
        break;
      case 'dismember': {
        if (V === h) return;
        const what = ev.part === P.HEAD || ev.part === P.NECK ? 'head' : PARTS[ev.part].label.replace('left ', '').replace('right ', '');
        this.note('saw', 'dismember', `saw ${this.name(V)}'s ${what} ${ev.burst ? 'blown apart' : 'come off'}`, 1, { v: V });
        this.stir('fear', 42 * k); this.stir('sadness', 20 * k); this.stir('surprise', 45 * k);
        h.h.disgust = Math.min(80, h.h.disgust + p.squeamish * 48 * k);
        this.ask(what === 'head' ? 'sawHeadless' : 'sawDismember', 90, null, 0.3);
        break;
      }
      case 'crash':
        if (w.d > 30) return;
        this.note('saw', 'crash', `saw a car crash ${w.text}`, 0.8);
        this.stir('surprise', 50 * k); this.stir('fear', 14 * k);
        if (ev.car && ev.car.seats.includes(h)) { this.ask('crashed', 80, null, rand(0.5, 1.5)); break; }
        if (w.d < 20) this.ask('sawCrash', 62, null, rand(0.3, 1));
        break;
      case 'carFire':
        if (w.d > 35) return;
        this.note('saw', 'carFire', `saw a car catch fire ${w.text}`, 0.9);
        this.stir('fear', 30 * k); this.stir('surprise', 40 * k);
        if (w.d < 14) this._threaten(null, 52, ev.x, ev.z);
        this.ask(w.d < 10 ? 'carFire' : 'sawCarFire', 76, null, rand(0.2, 0.8));
        break;
      case 'explosion':
        this.note('saw', 'explosion', `saw a car blow up ${w.text}`, 1);
        this.stir('fear', 70 * k + 20); this.stir('surprise', 90);
        this._threaten(ev.by && ev.by.h ? ev.by : null, 85, ev.x, ev.z);
        this.startle = 1;
        this.ask('sawExplosion', 92, null, rand(0.4, 1.2));
        break;
      case 'carhit':
        if (V === h) return;
        this.note('saw', 'carhit', `saw a car hit ${this.name(V)}`, 0.9, { v: V });
        this.stir('fear', 24 * k); this.stir('surprise', 45 * k); this.stir('sadness', 12 * k);
        this.ask('sawCarHit', 70);
        break;
      case 'spawnWall': if (w.d > 25) return; this.note('saw', 'spawn', `saw a wall appear ${w.text}`, 0.6); this.stir('surprise', 50 * k); this.ask('sawWall', 46, null, rand(0.3, 1.2)); break;
      case 'spawn':
        if (w.d > 16) return;
        this.note('saw', 'spawn', `saw ${ev.what} appear out of thin air`, 0.6);
        this.stir('surprise', 62 * k); this.stir('fear', 10 * k);
        this.ask('sawSpawn', 56, null, 0.3);
        this.lookAt = { x: ev.x, y: ev.y, z: ev.z, until: this.game.time + 2.5 };
        break;
      case 'fall':
        if (V === h || w.d > 14) return;
        this.stir('surprise', 12 * k);
        break;
      case 'vomit':
        if (V === h || w.d > 10) return;
        h.h.disgust = Math.min(60, h.h.disgust + p.squeamish * 14);
        break;
      default: break;
    }
  }

  /** What this person knows about another, made if need be. `seen` is false when it is only being heard about, over the radio. */
  _know(o, seen = true) {
    let k = this.known.get(o.id);
    if (!k) { const now = this.game.time; k = { first: now, last: seen ? now : -99, state: 'ok', armed: null, hostile: 0, hurtMe: false, crime: 0, crimeT: 0, o }; this.known.set(o.id, k); }
    return k;
  }

  /* -------------------------------- hearing ------------------------------- */

  /**
   * A sound reached them at `level` decibels. For speech, `clear` says how
   * much of it survived the distance (0..1).
   */
  hear(s, level, clear) {
    const h = this.h, now = this.game.time;
    const w = this.where(s.x, s.z);
    const src = s.source;
    const knowSrc = src && this.known.has(src.id) && now - this.known.get(src.id).last < 2;
    let text = '', sal = 0.3;
    switch (s.kind) {
      case 'gunshot': {
        text = `heard a gunshot ${w.text}`; sal = 0.9;
        this.stir('fear', clamp((level - 62) * 1.0, 6, 55)); this.stir('surprise', 55);
        if (!knowSrc) { this._threaten(null, clamp((level - 55) * 1.15, 25, 80), s.x, s.z); this._wantCall({ kind: 'shots', x: s.x + rand(-6, 6), z: s.z + rand(-6, 6), suspect: null }); }
        this.ask('gunshot', 64);
        if (level > 96) this.startle = Math.max(this.startle, 1);
        if (level > 126) {
          const add = clamp(level - 120, 6, 44);
          if (this.deaf < 12 && add > 14) { this.note('felt', 'ears', 'my ears are ringing from the shot', 0.6); this.ask('deaf', 50, null, 1.2); }
          this.deaf = Math.min(46, this.deaf + add);
        }
        break;
      }
      case 'crackle': if (w.d > 30) return; text = `heard a sharp electric crackling ${w.text}`; sal = 0.45; this.stir('surprise', 18 * falloff(w.d)); break;
      case 'scream': text = `heard someone scream ${w.text}`; sal = 0.5; this.stir('fear', 12 * falloff(w.d)); this.stir('surprise', 16); break;
      case 'blow': if (w.d > 9) return; text = `heard a blow land ${w.text}`; sal = 0.3; this.stir('surprise', 10); break;
      case 'explosion':
        text = `heard an explosion ${w.text}`; sal = 1;
        this.stir('fear', clamp(70 - w.d * 0.6, 20, 70)); this.stir('surprise', 80); this.startle = 1;
        if (!knowSrc && w.d < 45) this._threaten(null, clamp(90 - w.d, 40, 85), s.x, s.z);
        if (w.d < 60) { this.ask('hearExplosion', 80, null, rand(0.3, 1)); this._wantCall({ kind: 'shots', x: s.x + rand(-5, 5), z: s.z + rand(-5, 5), suspect: null }); }
        break;
      case 'crash': text = `heard something crash ${w.text}`; sal = 0.35; this.stir('surprise', 22 * falloff(w.d)); if (w.d < 5) this.ask('crate', 38); break;
      case 'horn': text = `heard a car horn ${w.text}`; sal = 0.3; this.stir('surprise', 16); if (w.d < 9) { this.ask('horn', 40); this.hurry = now + 3; } break;
      case 'screech': text = `heard tyres screech ${w.text}`; sal = 0.4; this.stir('surprise', 26); this.stir('fear', 8); break;
      case 'impact': if (w.d > 7) return; text = `a bullet struck something ${w.text}`; sal = 0.7; this.stir('fear', 24); this.startle = 1; break;
      case 'thud': if (w.d > 8) return; text = `heard something heavy hit the ground ${w.text}`; sal = 0.3; this.stir('surprise', 12); break;
      case 'vomit': if (w.d > 8) return; text = `heard someone being sick ${w.text}`; sal = 0.2; break;
      case 'engine': if (w.d > 24) return; text = `heard a generator running ${w.text}`; sal = 0.12; if (w.d < 12 && chance(0.05) && !this.flags.engine) { this.flags.engine = now; this.ask('hearEngine', 24, null, rand(0.5, 2)); } break;
      case 'glass': if (w.d > 18) return; text = `heard glass break ${w.text}`; sal = 0.35; this.stir('surprise', 24 * falloff(w.d)); if (w.d < 8) this.ask('hearGlass', 34, null, 0.4); break;
      case 'flame': text = `heard the roar of fire ${w.text}`; sal = 0.8; this.stir('fear', 30 * falloff(w.d)); this.stir('surprise', 30); if (!knowSrc) this._threaten(null, 60, s.x, s.z); this.ask('hearFlame', 58, null, 0.3); break;
      case 'twang': if (w.d > 14) return; text = `heard the snap of a bowstring ${w.text}`; sal = 0.5; this.stir('fear', 16 * falloff(w.d)); this.stir('surprise', 30); break;
      case 'hiss': text = `heard a loud hiss of gas, and the air went cold ${w.text}`; sal = 0.6; this.stir('fear', 22 * falloff(w.d)); this.stir('surprise', 28); if (!knowSrc) this._threaten(null, 45, s.x, s.z); this.ask('hearFrost', 50, null, 0.3); break;
      case 'through': if (w.d > 8) return; text = `a round came through a wall ${w.text}`; sal = 0.8; this.stir('fear', 34); this.startle = 1; this.ask('shotThrough', 66, null, 0.2); break;
      case 'light': if (w.d > 12) return; text = `a light came on ${w.text}`; sal = 0.15; if (w.d < 8 && chance(0.4)) this.ask('lightsOn', 22, null, rand(0.4, 1.5)); break;
      case 'steps': if (w.d > 5 || w.dir !== 'behind me') return; text = 'heard running footsteps behind me'; sal = 0.3; this.stir('surprise', 10); break;
      case 'speech': {
        const who = src === h ? null : knowSrc ? this.name(src) : src && src.isPlayer ? 'someone (a voice ' + w.dir + ')' : 'someone ' + w.dir;
        if (!who) return;
        const said = clear >= 1 ? s.text : garble(s.text, clear);
        text = `${who} said: "${said}"`; sal = src && src.isPlayer ? 0.7 : 0.25;
        if (src && src.isPlayer && w.d < 14) {
          // the stranger is talking; if it could be to me, answer
          const facing = Math.abs(wrapAngle(Math.atan2(h.x - src.x, h.z - src.z) - this.game.camYaw)) < 0.9;
          if (w.d < 5 || facing) this.ask('reply', 86, { text: said, clear, d: w.d }, rand(0.5, 1.1));
        } else if (src && !src.isPlayer && w.d < 4.5 && s.chat && (!this.threat || this.threat.level < 20)) {
          this.ask('chatB', 30, null, rand(0.8, 1.6));
        }
        break;
      }
      default: return;
    }
    this.note('heard', s.kind, text, sal, { src });
    this.heard.push({ t: now, text });
    if (this.heard.length > 4) this.heard.shift();
    if (sal >= 0.4 && h.state === ST.ANIM) this.lookAt = { x: s.x, y: s.y, z: s.z, until: now + 1.6 };
  }

  /* -------------------------------- feeling ------------------------------- */

  /** A blow, as it is experienced by the one who took it. */
  feel(part, type, rep, attacker, weapon, vestTook = null, armour = 'vest') {
    const h = this.h, now = this.game.time;
    if (!h.h.conscious && !rep.ko) return;
    const where = PARTS[part].label;
    const isHuman = attacker && typeof attacker === 'object';
    let seen = false;
    if (isHuman) {
      const k = this.known.get(attacker.id);
      seen = (k && now - k.last < 1.6) || this.canSeeHuman(attacker) > 0;
    }
    // something the vest stopped still lands like a hammer
    const how = vestTook === 'bullet' ? `was shot, and the ${armour} stopped it, in` : vestTook === 'cut' ? `felt a blade drag across the ${armour} over` :
      type === 'bullet' ? 'was shot in' : type === 'stab' && weapon === 'bow' ? 'was shot with an arrow in' : type === 'stab' && weapon === 'crossbow' ? 'was hit by a crossbow bolt in' : type === 'stab' ? 'was stabbed in' : type === 'cold' ? 'was sprayed with freezing mist on' : type === 'cut' ? 'was cut across' : type === 'crush' ? 'was crushed in' : type === 'needle' ? 'had a needle jabbed into' : type === 'burn' ? 'was set on fire, flames on' : 'took a blow to';
    const by = isHuman ? (seen ? ' by ' + this.name(attacker) + (weapon && weapon !== 'fists' && type !== 'needle' ? ' with a ' + WEAPON_WORD[weapon] : '') : ' by someone I did not see') : attacker ? ' by ' + attacker : '';
    if (type === 'burn') { this.stir('fear', 90); this.stir('surprise', 40); h.h.adrenaline = Math.max(h.h.adrenaline, 0.8); }
    if (type === 'cold') { this.stir('fear', 70); this.stir('surprise', 55); h.h.adrenaline = Math.max(h.h.adrenaline, 0.6); }
    this.note('felt', 'hit', `${how} the ${where}${by}`, clamp(0.4 + rep.pain / 50, 0.4, 1), { part, attacker: isHuman ? attacker : null });
    for (const b of rep.bones) if (b.state !== 'intact') this.note('felt', 'bone', `felt my ${boneWord(b.id)} ${b.state === 'broken' ? 'break' : 'crack'}`, 0.9);
    this.stir('fear', rep.pain * 0.8 + (type === 'blunt' && !vestTook ? 6 : 26));
    this.stir('anger', type === 'blunt' && seen ? 45 : 10);
    this.stir('surprise', seen ? 22 : 55);
    this.stir('joy', -40);
    if (isHuman) {
      const k = this._know(attacker);
      k.hurtMe = true; k.hostile = 1; if (weapon) k.armed = weapon;
      if (!attacker.officer) { k.crime = type === 'blunt' && !vestTook ? Math.max(k.crime, Math.min(2.4, k.crime + 1.2)) : Math.min(6, k.crime + 3); k.crimeT = now; }
      if (seen) this._threaten(attacker, type === 'blunt' && !vestTook ? 70 : 96);
      else { this._threaten(null, 72, h.x - Math.sin(h.yaw) * 2, h.z - Math.cos(h.yaw) * 2); this.lookAt = { x: attacker.x, y: attacker.y + 1.5, z: attacker.z, until: now + 2 }; }
      if (!attacker.officer) {
        const kind = type === 'bullet' || isBow(weapon) ? 'shooting' : type === 'stab' || type === 'cut' ? 'stabbing' : type === 'burn' ? 'burning' : type === 'cold' ? 'freezing' : 'assault';
        // an officer attacked is the police finding out for themselves; anyone else may ring them, later, and say who it was if they saw
        if (h.officer) { if (attacker.isPlayer) this.game.police?.raise(type === 'blunt' && !weaponHurt(weapon) ? STARS.assault : STARS.officer, 'you attacked an officer', { x: attacker.x, z: attacker.z }, { kind: 'officer', victim: h }); }
        else this._wantCall({ kind, x: h.x, z: h.z, victim: h, suspect: seen ? attacker : null, self: true });
      }
    }
    const cat = attacker === 'a car' ? 'hitCar' : type === 'needle' ? 'injected' : type === 'burn' ? 'onFire' : type === 'cold' ? 'frozen' : vestTook === 'bullet' ? (armour === 'helmet' ? 'hitHelmet' : 'hitVest') : isHuman && !seen && chance(0.5) ? 'hitUnseen' : type === 'bullet' || isBow(weapon) ? 'hitShot' : type === 'stab' ? 'hitStab' : type === 'cut' ? 'hitCut' : 'hitBlunt';
    this.ask(cat, 95, { part: where, sex: isHuman && attacker.look ? attacker.look.sex : 'm' });
    if (rep.bones.some((b) => b.state === 'broken')) this.ask('boneBreak', 78, { part: where.replace('left ', '').replace('right ', '') }, 1.4);
  }

  lost(part, burst) {
    const where = part === P.HEAD || part === P.NECK ? 'head' : PARTS[part].label;
    this.note('felt', 'lost', `my ${where} was ${burst ? 'blown apart' : 'cut off'}`, 1, { part });
    this.stir('fear', 60); this.stir('sadness', 50); this.stir('surprise', 60); this.stir('joy', -60);
    // nobody says "my left forearm" at a time like this
    const word = part >= P.THIGH_L ? (part === P.FOOT_L || part === P.FOOT_R ? 'foot' : 'leg') : part === P.HAND_L || part === P.HAND_R ? 'hand' : 'arm';
    this.ask('lostLimb', 97, { part: word }, 0.9);
  }

  splashed(owner) {
    const now = this.game.time;
    if (this.flags.splash && now - this.flags.splash < 8) return;
    this.flags.splash = now;
    this.note('felt', 'splash', 'blood splashed on me', 0.5);
    this.stir('fear', 14); this.h.h.disgust = Math.min(60, this.h.h.disgust + this.p.squeamish * 22);
  }

  /** The body's own reports, once a second. */
  _interocept() {
    const h = this.h.h, f = this.flags, list = this.feels, now = this.game.time;
    list.length = 0;
    const on = (key, cond, text, say, pri, extra) => {
      if (cond) {
        list.push(text);
        if (!f[key]) { f[key] = now; this.note('felt', key, text, 0.6); if (say) this.ask(say, pri, extra, rand(0.4, 1.4)); }
      } else if (f[key] && now - f[key] > 6) f[key] = 0;
    };
    if (h.pain > 70) list.push('agony'); else if (h.pain > 40) list.push('a lot of pain'); else if (h.pain > 12) list.push('some pain');
    on('bleeding', h.bleedOut > 4, 'blood is pouring out of me', 'bleeding', 60);
    on('faint', h.bloodPct < 72, 'light-headed and weak', 'faint', 48);
    on('dying', h.bloodPct < 60 || h.shock > 78, 'I am fading', 'dying', 82);
    on('cold', h.temp < 35.6, 'freezing cold', 'cold', 44);
    on('air', h.air < 80, 'I cannot get enough air', 'cantBreathe', 76);
    on('sick', h.nausea > 55, 'about to be sick', 'nausea', 46);
    on('blind', h.blind >= 2, 'I cannot see anything', 'blind', 84);
    on('oneEye', h.blind === 1, 'one eye is gone', null, 0);
    on('legs', h.paralysedLegs, 'I cannot feel my legs', 'paralysed', 80);
    on('pulse', h.pulse > 150, 'my heart is hammering', null, 0);
    on('dizzy', h.dizziness > 30, 'dizzy, head swimming', null, 0);
    on('poison', h.poison > 22, 'something is badly wrong inside me: sick, weak, sweating', 'poisoned', 72);
    on('winded', h.stamina < 12 && this.h.state === ST.ANIM, 'completely out of breath', 'winded', 36);
    on('rush', h.adrenaline > 0.65, 'heart pounding, hands shaking', null, 0);
    if (this.h.fire && this.h.burning > 0.1) list.push('on fire, burning');
    else if (h.burnArea > 0.03) list.push(h.burnArea > 0.2 ? 'badly burnt, the skin raw and stinging' : 'burnt, and it stings');
    if (this.game.power && this.game.power.zaps.has(this.h)) list.push('electricity going through me, every muscle locked');
    this.aware = h.awareness / 100;
    if (this.deaf > 14) list.push('ears ringing');
    if (this.h.state === ST.RAGDOLL && h.conscious) list.push(h.canStand ? 'lying on the ground' : 'on the ground and cannot get up');
    if (!list.length) list.push('fine');
  }

  /* --------------------------------- time --------------------------------- */

  tick(dt) {
    const h = this.h, e = this.emo, p = this.p, hh = h.h;
    if (!hh.alive) { e.fear = e.anger = e.surprise = e.joy = e.boredom = e.sadness = 0; this.sees.length = 0; this.feels.length = 0; this.threat = null; return; }
    this.quiet += dt;
    this.speakCool = Math.max(0, this.speakCool - dt);
    this.deaf = Math.max(0, this.deaf - dt * 1.3);
    this.startle = Math.max(0, this.startle - dt * 1.5);

    this._scan -= dt;
    if (this._scan <= 0) { this._scan = 0.3; this.look(); }
    this._body -= dt;
    if (this._body <= 0) { this._body = 1; this._interocept(); }

    // a danger that has gone out of sight and earshot fades
    const t = this.threat;
    if (t) {
      const now = this.game.time;
      if (t.src) {
        const k = this.known.get(t.src.id);
        if (k && now - k.last < 0.5) { t.x = t.src.x; t.z = t.src.z; t.t = now; if (!t.src.h.alive || !t.src.h.conscious) t.level -= dt * 30; }
      }
      const age = now - t.t;
      if (age > 3) t.level -= dt * (4 + age * 0.8);
      if (t.level <= 4) this.threat = null;
    }

    // feelings settle toward where this person usually sits
    const danger = this.threat ? this.threat.level : 0;
    const pain = hh.conscious ? hh.pain : 0;
    const fearFloor = clamp(danger * 0.55 * (1.3 - p.bravery) + pain * 0.3, 0, 95);
    e.fear += (fearFloor - e.fear) * (1 - Math.exp(-dt / (fearFloor > e.fear ? 1.2 : 13)));
    e.anger += (clamp(pain * 0.12 * p.temper, 0, 30) - e.anger) * (1 - Math.exp(-dt / 20));
    const sadFloor = clamp((hh.missing.some((m) => m) ? 45 : 0) + (hh.bloodPct < 65 ? 30 : 0) + pain * 0.2, 0, 90);
    e.sadness += (sadFloor - e.sadness) * (1 - Math.exp(-dt / (sadFloor > e.sadness ? 6 : 65)));
    e.surprise += (0 - e.surprise) * (1 - Math.exp(-dt / 2.2));
    const joyBase = (22 + p.cheer * 34) * (1 - Math.max(e.fear, e.sadness, pain) / 100) - e.anger * 0.15;
    e.joy += (clamp(joyBase, 0, 100) - e.joy) * (1 - Math.exp(-dt / 9));
    // nothing happening is its own kind of feeling
    if (this.quiet > 5 && danger < 5 && pain < 10) e.boredom = Math.min(100, e.boredom + dt * (2.6 - p.patience * 2.1));
    else e.boredom = Math.max(0, e.boredom - dt * 9);
    for (const k of EMOTIONS) if (!hh.conscious && k !== 'sadness') e[k] *= Math.exp(-dt / 3);

    // old wants lapse
    const now = this.game.time;
    for (let i = this.want.length - 1; i >= 0; i--) if (this.want[i].until < now) this.want.splice(i, 1);
  }

  /** The strongest feeling, in a word. */
  get mood() {
    const e = this.emo;
    let best = 'calm', v = 28;
    for (const k of EMOTIONS) if (k !== 'joy' && e[k] > v) { v = e[k]; best = k; }
    if (best === 'calm' && e.joy > 55) best = 'joy';
    return best;
  }
}

/** Was it something worse than a bare fist, a boot or a taser? */
function weaponHurt(w) { return !!w && w !== 'fists' && w !== 'taser'; }

/** How much something matters with distance: all of it up close, a third at forty metres. */
function falloff(d) { return clamp(1.1 - d / 45, 0.3, 1); }

function boneWord(id) {
  return ({ skull: 'skull', jaw: 'jaw', cspine: 'neck', clavL: 'collarbone', clavR: 'collarbone', ribsL: 'ribs', ribsR: 'ribs', sternum: 'breastbone', tspine: 'back', lspine: 'lower back', pelvis: 'hip',
    humerusL: 'left arm', humerusR: 'right arm', forearmL: 'left forearm', forearmR: 'right forearm', handL: 'left hand', handR: 'right hand',
    femurL: 'left thigh', femurR: 'right thigh', tibiaL: 'left shin', tibiaR: 'right shin', footL: 'left foot', footR: 'right foot' })[id] || 'bone';
}

/** Speech at the edge of earshot: some of the words do not make it. */
export function garble(text, clear) {
  return text.split(/\s+/).map((w) => (Math.random() < clear ? w : '...')).join(' ').replace(/(\.\.\. ?){2,}/g, '... ');
}

/* -------------------------------------------------------------------------- */
/*                         everybody's minds, together                         */
/* -------------------------------------------------------------------------- */

export class Minds {
  constructor(game, makeBrain) {
    this.game = game;
    this.list = [];
    this.makeBrain = makeBrain;
    this.sounds = 0;
  }

  adopt(human) {
    if (human.isPlayer || human.mind) return;
    human.mind = new Mind(human, this);
    human.brain = this.makeBrain(human, this.game);
    this.list.push(human.mind);
  }
  forget(human) {
    const i = this.list.indexOf(human.mind);
    if (i >= 0) this.list.splice(i, 1);
    for (const m of this.list) { m.known.delete(human.id); if (m.threat && m.threat.src === human) m.threat.src = null; }
  }
  playerChanged(oldP, newP) {
    for (const m of this.list) {
      const k = m.known.get(oldP.id);
      if (k) { m.known.delete(oldP.id); m.known.set(newP.id, k); }
      if (m.threat && m.threat.src === oldP) m.threat = null;
    }
  }

  update(dt) {
    for (const m of this.list) { m.tick(dt); m.h.brain.update(dt); }
  }

  /**
   * A sound, at a place, of a loudness in decibels at one metre.
   * Everyone conscious and close enough hears it.
   */
  noise(x, y, z, dB, kind, source, text = null, chat = false) {
    const g = this.game;
    this.sounds++;
    const s = { x, y, z, kind, source, text, chat };
    if (kind === 'gunshot') g.traffic?.scare(x, z, 42);
    for (const m of this.list) {
      const h = m.h;
      if (h === source || !h.h.conscious || h.removed) continue;
      const hd = h.bodies[P.HEAD];
      const d = Math.max(1, Math.hypot(x - hd.px, y - hd.py, z - hd.pz));
      let level = dB - 20 * Math.log10(d) - m.deaf - (1 - (m.aware ?? 1)) * 14;
      if (level < 30) continue;
      // round a corner is quieter
      if (d > 4 && !g.world.lineClear(x, Math.max(y, 0.5), z, hd.px, hd.py, hd.pz)) level -= 9;
      const floor = kind === 'speech' ? 42 : kind === 'steps' ? 34 : 40;
      if (level < floor) continue;
      const clear = kind === 'speech' ? clamp01((level - 42) / 9) : 1;
      if (kind === 'speech' && clear < 0.25) continue;
      m.hear(s, level, clear);
    }
  }

  /** Something visible happened. Everyone who could see it does. */
  witness(ev) {
    for (const m of this.list) {
      const h = m.h;
      if (!h.h.conscious || h.removed) continue;
      const d = Math.hypot(ev.x - h.x, ev.z - h.z);
      if (d > 55) continue;
      const c = m.canSee(ev.x, ev.y, ev.z, true, true);
      if (c > 0) m.saw(ev, c);
    }
  }
}
