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
import { P, PARTS } from '../human/rig.js';
import { ST } from '../human/human.js';
import { clamp, clamp01, rand, chance, wrapAngle } from '../core/util.js';

const _e = [0, 0, 0], _g = [0, 0, 0], _t = [0, 0, 0];
const WEAPON_WORD = { fists: 'fists', knife: 'knife', machete: 'machete', m1911: 'pistol', ak47: 'rifle' };
const WEAPON_FEAR = { fists: 22, knife: 60, machete: 76, m1911: 88, ak47: 94 };
export const EMOTIONS = ['fear', 'anger', 'sadness', 'joy', 'surprise', 'boredom'];

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
    if (d > 75) return 0;
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
      if (o.kind !== 'crate') continue;
      const b = o.body, ex = b.px - _e[0], ez = b.pz - _e[2];
      const along = ex * ix + ez * iz;
      if (along < 0.3 || along > d - 0.4) continue;
      if (rayBody(b, _e[0], _e[1], _e[2], ix, iy, iz, d - 0.35, null) >= 0) return 0;
    }
    if (g.traffic) for (const car of g.traffic.cars) {
      const b = car.body, ex = b.px - _e[0], ez = b.pz - _e[2];
      const along = ex * ix + ez * iz;
      if (along < 0.5 || along > d - 0.5) continue;
      if (rayBody(b, _e[0], _e[1], _e[2], ix, iy, iz, d - 0.4, null) >= 0) return 0;
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
      if (!k) { k = { first: now, last: now, state: 'ok', armed: null, hostile: 0, hurtMe: false, bits: '' }; this.known.set(o.id, k); }
      k.last = now; k.x = o.x; k.z = o.z;
      const detail = a > 0.5 && d < 32;
      const bits = detail ? o.appearance() : [];
      const armed = detail && o.weapon ? o.weapon.def.id : (detail ? null : k.armed);
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
        } else if ((state === 'hurt' || state === 'down' || state === 'out') && k.state === 'ok') {
          this.note('saw', 'hurt', `saw ${this.name(o)} ${state === 'hurt' ? 'bleeding' : state === 'out' ? 'lying unconscious' : 'on the ground'}`, 0.5, { o });
          this.stir('fear', 8); this.stir('sadness', 12);
          if (!this.threat || this.threat.level < 25) this.ask('sawHurt', 40);
        }
        k.state = state;
      }
      if (detail && armed !== k.armed) {
        k.armed = armed;
        if (armed && armed !== 'fists' && o.h.alive) {
          this.note('saw', 'armed', `saw ${this.name(o)} holding a ${WEAPON_WORD[armed]}`, 0.7, { o });
          this.stir('fear', WEAPON_FEAR[armed] * 0.45 * falloff(d)); this.stir('surprise', 30);
          this._threaten(o, WEAPON_FEAR[armed] * 0.5 * falloff(d));
          this.ask('sawWeapon', 62, { weapon: WEAPON_WORD[armed] });
        }
      }
      if (!nearest || d < nearest.d) nearest = { o, d };
    }
    this.sees.sort((a, b) => a.d - b.d);
    if (this.sees.length > 7) this.sees.length = 7;

    // is a gun pointing this way?
    const pl = g.player;
    let aimedNow = false;
    if (pl !== h && pl.weapon && pl.weapon.def.gun && pl.state === ST.ANIM && pl.h.alive) {
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
        const verb = ev.weapon === 'fists' ? 'hit' : ev.weapon === 'knife' ? (ev.rep && ev.rep.type === 'stab' ? 'stab' : 'slash') : ev.weapon === 'machete' ? 'hack at' : 'shoot';
        this.note('saw', 'attack', `saw ${this.name(A)} ${verb} ${this.name(V)}${ev.weapon === 'fists' ? '' : ' with a ' + word}`, 0.9, { o: A, v: V });
        this.stir('fear', sev * 0.6 * k); this.stir('sadness', 14 * k); this.stir('anger', (ev.weapon === 'fists' ? 16 : 8) * k); this.stir('surprise', 35 * k);
        const kn = this._know(A); kn.hostile = 1; kn.armed = ev.weapon;
        this._threaten(A, sev * (0.45 + 0.55 * k));
        this.ask(ev.weapon === 'fists' ? 'sawFist' : ev.weapon === 'm1911' || ev.weapon === 'ak47' ? 'sawShot' : 'sawAttack', ev.weapon === 'fists' ? 52 : 72);
        break;
      }
      case 'shot': {
        if (A === h) return;
        const kn = this._know(A); kn.hostile = Math.max(kn.hostile, 0.8); kn.armed = ev.weapon;
        this.note('saw', 'shot', `saw ${this.name(A)} fire a ${WEAPON_WORD[ev.weapon]}`, 0.8, { o: A });
        this._threaten(A, 86 * (0.4 + 0.6 * k));
        break;
      }
      case 'swing':
        if (A === h || ev.weapon === 'fists' || w.d > 12) return;
        this._know(A).armed = ev.weapon;
        this._threaten(A, WEAPON_FEAR[ev.weapon] * 0.6 * k);
        this.stir('fear', 14 * k);
        break;
      case 'death':
        if (V === h) return;
        this.note('saw', 'death', `saw ${this.name(V)} die`, 1, { v: V });
        this.stir('fear', 26 * k); this.stir('sadness', 38 * k); this.stir('surprise', 20 * k);
        h.h.disgust = Math.min(70, h.h.disgust + p.squeamish * 30 * k);
        this.ask('sawDeath', 80, null, 0.5);
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
      case 'carhit':
        if (V === h) return;
        this.note('saw', 'carhit', `saw a car hit ${this.name(V)}`, 0.9, { v: V });
        this.stir('fear', 24 * k); this.stir('surprise', 45 * k); this.stir('sadness', 12 * k);
        this.ask('sawCarHit', 70);
        break;
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

  _know(o) {
    let k = this.known.get(o.id);
    if (!k) { k = { first: this.game.time, last: this.game.time, state: 'ok', armed: null, hostile: 0, hurtMe: false }; this.known.set(o.id, k); }
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
        if (!knowSrc) this._threaten(null, clamp((level - 55) * 1.15, 25, 80), s.x, s.z);
        this.ask('gunshot', 64);
        if (level > 96) this.startle = Math.max(this.startle, 1);
        if (level > 126) {
          const add = clamp(level - 120, 6, 44);
          if (this.deaf < 12 && add > 14) { this.note('felt', 'ears', 'my ears are ringing from the shot', 0.6); this.ask('deaf', 50, null, 1.2); }
          this.deaf = Math.min(46, this.deaf + add);
        }
        break;
      }
      case 'scream': text = `heard someone scream ${w.text}`; sal = 0.5; this.stir('fear', 12 * falloff(w.d)); this.stir('surprise', 16); break;
      case 'blow': if (w.d > 9) return; text = `heard a blow land ${w.text}`; sal = 0.3; this.stir('surprise', 10); break;
      case 'crash': text = `heard something crash ${w.text}`; sal = 0.35; this.stir('surprise', 22 * falloff(w.d)); if (w.d < 5) this.ask('crate', 38); break;
      case 'horn': text = `heard a car horn ${w.text}`; sal = 0.3; this.stir('surprise', 16); if (w.d < 9) { this.ask('horn', 40); this.hurry = now + 3; } break;
      case 'screech': text = `heard tyres screech ${w.text}`; sal = 0.4; this.stir('surprise', 26); this.stir('fear', 8); break;
      case 'impact': if (w.d > 7) return; text = `a bullet struck something ${w.text}`; sal = 0.7; this.stir('fear', 24); this.startle = 1; break;
      case 'thud': if (w.d > 8) return; text = `heard something heavy hit the ground ${w.text}`; sal = 0.3; this.stir('surprise', 12); break;
      case 'vomit': if (w.d > 8) return; text = `heard someone being sick ${w.text}`; sal = 0.2; break;
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
  feel(part, type, rep, attacker, weapon) {
    const h = this.h, now = this.game.time;
    if (!h.h.conscious && !rep.ko) return;
    const where = PARTS[part].label;
    const isHuman = attacker && typeof attacker === 'object';
    let seen = false;
    if (isHuman) {
      const k = this.known.get(attacker.id);
      seen = (k && now - k.last < 1.6) || this.canSeeHuman(attacker) > 0;
    }
    const how = type === 'bullet' ? 'was shot in' : type === 'stab' ? 'was stabbed in' : type === 'cut' ? 'was cut across' : type === 'crush' ? 'was crushed in' : 'took a blow to';
    const by = isHuman ? (seen ? ' by ' + this.name(attacker) + (weapon && weapon !== 'fists' ? ' with a ' + WEAPON_WORD[weapon] : '') : ' by someone I did not see') : attacker ? ' by ' + attacker : '';
    this.note('felt', 'hit', `${how} the ${where}${by}`, clamp(0.4 + rep.pain / 50, 0.4, 1), { part, attacker: isHuman ? attacker : null });
    for (const b of rep.bones) if (b.state !== 'intact') this.note('felt', 'bone', `felt my ${boneWord(b.id)} ${b.state === 'broken' ? 'break' : 'crack'}`, 0.9);
    this.stir('fear', rep.pain * 0.8 + (type === 'blunt' ? 6 : 26));
    this.stir('anger', type === 'blunt' && seen ? 30 : 9);
    this.stir('surprise', seen ? 22 : 55);
    this.stir('joy', -40);
    if (isHuman) {
      const k = this._know(attacker);
      k.hurtMe = true; k.hostile = 1; if (weapon) k.armed = weapon;
      if (seen) this._threaten(attacker, type === 'blunt' ? 70 : 96);
      else { this._threaten(null, 72, h.x - Math.sin(h.yaw) * 2, h.z - Math.cos(h.yaw) * 2); this.lookAt = { x: attacker.x, y: attacker.y + 1.5, z: attacker.z, until: now + 2 }; }
    }
    const cat = attacker === 'a car' ? 'hitCar' : isHuman && !seen && chance(0.5) ? 'hitUnseen' : type === 'bullet' ? 'hitShot' : type === 'stab' ? 'hitStab' : type === 'cut' ? 'hitCut' : 'hitBlunt';
    this.ask(cat, 95, { part: where });
    if (rep.bones.some((b) => b.state === 'broken')) this.ask('boneBreak', 78, { part: where.replace('left ', '').replace('right ', '') }, 1.4);
  }

  lost(part, burst) {
    const where = part === P.HEAD || part === P.NECK ? 'head' : PARTS[part].label;
    this.note('felt', 'lost', `my ${where} was ${burst ? 'blown apart' : 'cut off'}`, 1, { part });
    this.stir('fear', 60); this.stir('sadness', 50); this.stir('surprise', 60); this.stir('joy', -60);
    this.ask('lostLimb', 97, { part: where.replace('left ', '').replace('right ', '').replace('upper ', '') }, 0.9);
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
    on('faint', h.bloodPct < 72, 'light-headed and weak', null, 0);
    on('dying', h.bloodPct < 60 || h.shock > 78, 'I am fading', 'dying', 82);
    on('cold', h.temp < 35.6, 'freezing cold', 'cold', 44);
    on('air', h.air < 80, 'I cannot get enough air', 'cantBreathe', 76);
    on('sick', h.nausea > 55, 'about to be sick', 'nausea', 46);
    on('blind', h.blind >= 2, 'I cannot see anything', 'blind', 84);
    on('oneEye', h.blind === 1, 'one eye is gone', null, 0);
    on('legs', h.paralysedLegs, 'I cannot feel my legs', 'paralysed', 80);
    on('pulse', h.pulse > 150, 'my heart is hammering', null, 0);
    on('dizzy', h.dizzy > 20 || h.concussion > 30, 'dizzy, head swimming', null, 0);
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
      let level = dB - 20 * Math.log10(d) - m.deaf;
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
