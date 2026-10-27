/* =============================================================================
   Every sound in the game, made on the spot with WebAudio: no sound files.

   Punches are a low thump with a slap of noise on top (and a ring of metal
   when they are brass knuckles), crates knock like wood, bodies land with a
   thud, bones crack, and people babble: a run of short tuned blips, one per
   syllable or so, pitched to the speaker's voice and raised when they shout.

   Sounds get quieter the further they are from the middle of the view.

   The little variations in every sound come from the sound's own random
   numbers, not the game's: whether a sound plays depends on the audio
   clock, and what is heard must never change what happens.
   ========================================================================== */
import { clamp, rng } from './util.js';

const own = rng(0x50f7);
/** A random number for a sound (the game's own Math.random is left alone). */
export const soundRand = (a = 0, b = 1) => a + own() * (b - a);
const rand = soundRand;

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.on = true;
    try { this.on = localStorage.getItem('sf.sound') !== '0'; } catch (_) { /* private mode */ }
    this.listenX = 0;
    this.span = 16;
    this.recent = 0;
  }

  /** Browsers only allow sound after a tap; call this from one. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = own() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setOn(v) {
    this.on = v;
    try { localStorage.setItem('sf.sound', v ? '1' : '0'); } catch (_) { /* fine */ }
  }

  get ready() { return this.on && this.ctx && this.ctx.state === 'running'; }

  /** How loud something at x is, from where the camera is looking. */
  near(x) {
    if (x === undefined) return 1;
    const d = Math.abs(x - this.listenX) / (this.span * 0.7);
    return 1 / (1 + d * d);
  }

  tone(type, f0, f1, dur, gain, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  hiss(dur, freq, q, gain, type = 'bandpass', delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise;
    s.playbackRate.value = rand(0.8, 1.2);
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    g.gain.setValueAtTime(Math.max(0.0002, gain), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.master);
    s.start(t, own() * 0.5);
    s.stop(t + dur + 0.02);
  }

  punch(power, armed, x, blocked = false) {
    if (!this.ready) return;
    const v = this.near(x) * clamp(0.35 + power * 0.3, 0.3, 1.2);
    if (blocked) {
      this.tone('sine', 180, 90, 0.08, 0.35 * v);
      this.hiss(0.05, 1400, 1.2, 0.2 * v);
      return;
    }
    this.tone('sine', 130 + rand(-15, 15), 55, 0.14, 0.6 * v);
    this.hiss(0.07, 900 + rand(-200, 200), 0.9, 0.45 * v);
    if (armed) {
      this.tone('triangle', 2300, 2100, 0.18, 0.08 * v);
      this.tone('sine', 3400, 3300, 0.12, 0.04 * v);
    }
  }

  whoosh(x, strong = false) {
    if (!this.ready) return;
    const v = this.near(x) * (strong ? 0.25 : 0.12);
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise;
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(2200, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, own() * 0.5);
    s.stop(t + 0.2);
  }

  wood(speed, x) {
    if (!this.ready) return;
    const v = this.near(x) * clamp(speed / 8, 0.12, 1);
    this.tone('triangle', 210 + rand(-30, 30), 120, 0.12, 0.45 * v);
    this.hiss(0.09, 600 + rand(-100, 150), 2.2, 0.5 * v);
  }

  clink(speed, x) {
    if (!this.ready) return;
    const v = this.near(x) * clamp(speed / 8, 0.1, 0.8);
    this.tone('sine', 1800 + rand(-200, 200), 1700, 0.16, 0.12 * v);
    this.tone('sine', 2900 + rand(-200, 200), 2800, 0.1, 0.07 * v);
  }

  thud(speed, x) {
    if (!this.ready) return;
    const v = this.near(x) * clamp(speed / 10, 0.15, 1);
    this.tone('sine', 95, 45, 0.18, 0.7 * v);
    this.hiss(0.12, 380, 0.8, 0.35 * v, 'lowpass');
  }

  crack(x) {
    if (!this.ready) return;
    const v = this.near(x);
    this.hiss(0.05, 3200, 3, 0.5 * v);
    this.tone('square', 700, 300, 0.04, 0.12 * v);
  }

  /** A blade going in: a short wet thunk under a hiss. */
  stab(power, x) {
    if (!this.ready) return;
    const v = this.near(x) * clamp(0.4 + power * 0.25, 0.3, 1);
    this.tone('sine', 160, 70, 0.1, 0.45 * v);
    this.hiss(0.09, 2400, 2.5, 0.35 * v);
    this.hiss(0.14, 700, 1.4, 0.3 * v, 'lowpass', 0.02);
  }

  /**
   * A 9 mm going off: a hard crack of noise over a low punch, and the slap
   * of it coming back off the walls a moment later, quieter each time. Loud
   * from anywhere; louder close to.
   */
  gunshot(x, heavy = false) {
    if (!this.ready) return;
    const v = 0.35 + this.near(x) * 0.75;
    if (heavy) {
      // a .45: lower, fatter, a longer roll off the walls
      this.hiss(0.12, 1900, 0.6, 1.25 * v);
      this.hiss(0.05, 5200, 0.6, 0.5 * v, 'highpass');
      this.tone('sine', 120, 30, 0.24, 1.3 * v);
      this.tone('triangle', 640, 90, 0.07, 0.3 * v);
      for (const [d, k] of [[0.12, 0.42], [0.27, 0.24], [0.45, 0.12], [0.66, 0.05]]) this.hiss(0.2, 700, 0.5, k * v, 'lowpass', d);
      return;
    }
    this.hiss(0.09, 2600, 0.7, 1.2 * v);
    this.hiss(0.05, 6000, 0.6, 0.6 * v, 'highpass');
    this.tone('sine', 150, 40, 0.16, 1.1 * v);
    this.tone('triangle', 900, 120, 0.05, 0.25 * v);
    for (const [d, k] of [[0.11, 0.35], [0.24, 0.18], [0.4, 0.08]]) this.hiss(0.16, 900, 0.5, k * v, 'lowpass', d);
  }

  /** An AK-47 round: a harder, sharper crack than a pistol, and a long roll back off the walls. */
  rifleShot(x) {
    if (!this.ready) return;
    const v = 0.4 + this.near(x) * 0.8;
    this.hiss(0.08, 3200, 0.6, 1.3 * v);
    this.hiss(0.04, 7000, 0.7, 0.75 * v, 'highpass');
    this.tone('sine', 170, 35, 0.2, 1.15 * v);
    this.tone('square', 1100, 160, 0.035, 0.18 * v);
    for (const [d, k] of [[0.1, 0.4], [0.22, 0.26], [0.38, 0.14], [0.58, 0.07]]) this.hiss(0.18, 1100, 0.5, k * v, 'lowpass', d);
  }

  /** A 12 gauge: a deep, wide boom - and a moment after, the pump racked back and forward. */
  shotgun(x, pump = true) {
    if (!this.ready) return;
    const v = 0.45 + this.near(x) * 0.8;
    this.hiss(0.16, 1500, 0.5, 1.4 * v);
    this.hiss(0.06, 4200, 0.6, 0.55 * v, 'highpass');
    this.tone('sine', 95, 28, 0.32, 1.5 * v);
    this.tone('triangle', 480, 70, 0.09, 0.35 * v);
    for (const [d, k] of [[0.13, 0.5], [0.3, 0.3], [0.5, 0.15], [0.74, 0.07]]) this.hiss(0.24, 600, 0.5, k * v, 'lowpass', d);
    if (!pump) return;
    const n = this.near(x);
    for (const d of [0.34, 0.5]) {
      this.hiss(0.04, 2400, 3, 0.35 * n, 'bandpass', d);
      this.tone('square', 900, 500, 0.03, 0.08 * n, d);
    }
  }

  /** Steel struck - a bullet, a blow, a sheet of it landing: a clang, ringing on. */
  clang(power, x) {
    if (!this.ready) return;
    const v = this.near(x) * clamp(0.25 + power * 0.25, 0.2, 1);
    const f = 520 + rand(-80, 120);
    this.tone('triangle', f, f * 0.97, 0.5, 0.22 * v);
    this.tone('sine', f * 2.76, f * 2.7, 0.35, 0.1 * v);
    this.tone('sine', f * 5.4, f * 5.3, 0.2, 0.05 * v);
    this.hiss(0.04, 3800, 1.5, 0.35 * v);
  }

  /** Glass knocked: a bright tink. */
  tink(x, power = 1) {
    if (!this.ready) return;
    const v = this.near(x) * clamp(0.3 + power * 0.3, 0.2, 0.9);
    this.tone('sine', 3200 + rand(-300, 500), 3100, 0.18, 0.1 * v);
    this.tone('sine', 5100 + rand(-300, 300), 5000, 0.12, 0.05 * v);
    this.hiss(0.03, 5000, 2, 0.2 * v);
  }

  /** Wood giving way: a splintering crack (a big piece, a deeper one). */
  splinter(x, big = false) {
    if (!this.ready) return;
    const v = this.near(x) * (big ? 0.9 : 0.55);
    for (let i = 0; i < (big ? 5 : 3); i++) this.hiss(0.04, 1800 + rand(-500, 1200), 2.5, 0.4 * v, 'bandpass', i * rand(0.015, 0.04));
    this.tone('triangle', big ? 160 : 260, 90, big ? 0.22 : 0.1, 0.4 * v);
  }

  /** A tree going over: a long, slow creak of wood. */
  creak(x) {
    if (!this.ready) return;
    const v = this.near(x) * 0.7;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t);
    o.frequency.linearRampToValueAtTime(48, t + 1.1);
    f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18 * v, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 1.25);
    this.splinter(x, true);
  }

  /** A building coming down, or a lump of one landing: a heavy crash, and gravel after it. */
  rubble(x, big = false) {
    if (!this.ready) return;
    const v = this.near(x) * (big ? 1 : 0.6);
    this.tone('sine', big ? 70 : 110, big ? 32 : 55, big ? 0.7 : 0.25, 0.85 * v);
    this.hiss(big ? 0.9 : 0.3, 520, 0.7, 0.55 * v, 'lowpass');
    for (let i = 0; i < (big ? 9 : 4); i++) this.hiss(0.03, 1200 + rand(0, 2600), 2, 0.22 * v, 'bandpass', 0.05 + i * rand(0.03, 0.08));
  }

  /** Concrete giving way under what it holds up: a deep groan, and a crack. */
  groan(x) {
    if (!this.ready) return;
    const v = this.near(x) * 0.8;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(58, t);
    o.frequency.linearRampToValueAtTime(38, t + 0.9);
    f.type = 'bandpass'; f.frequency.value = 220; f.Q.value = 2.5;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25 * v, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1);
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 1.05);
    this.hiss(0.08, 2600, 2, 0.5 * v, 'bandpass', 0.05);
  }

  /** Leaves: a soft rush of them. */
  rustle(x, hard = false) {
    if (!this.ready) return;
    const v = this.near(x) * (hard ? 0.3 : 0.14);
    this.hiss(hard ? 0.32 : 0.22, 4200, 0.7, v, 'highpass');
    this.hiss(0.12, 2600, 1.2, v * 0.6, 'bandpass', 0.06);
  }

  /** A wire going on: a rope pulled tight, a rod set, a pin tapped home. */
  tieOn(metal, pin, x) {
    if (!this.ready) return;
    const v = this.near(x);
    if (pin) {
      this.tone('sine', metal ? 900 : 300, metal ? 820 : 180, 0.08, 0.3 * v);
      this.hiss(0.03, metal ? 3400 : 1200, 2, 0.3 * v);
      return;
    }
    this.sweep('bandpass', 700, 2200, 0.16, 0.16 * v, 3);
    if (metal) this.tone('sine', 1500, 1450, 0.12, 0.05 * v, 0.1);
  }

  /** A wire parting: a hemp rope's snap, a steel one's twang. */
  snapWire(metal, x) {
    if (!this.ready) return;
    const v = this.near(x);
    this.hiss(0.05, metal ? 4200 : 2600, 2.2, 0.55 * v);
    if (metal) this.tone('sawtooth', 620, 140, 0.4, 0.12 * v);
    else this.tone('triangle', 340, 120, 0.08, 0.2 * v);
  }

  /** A trapdoor dropping open: the latch knocked out, and the door slamming down on its hinge - or, shut, a heavy knock. */
  trapdoor(x, open = true) {
    if (!this.ready) return;
    const v = this.near(x);
    this.tone('square', 1300, 900, 0.03, 0.12 * v);
    this.hiss(0.03, 3000, 2, 0.25 * v);
    if (!open) { this.wood(6, x); return; }
    this.tone('sine', 110, 45, 0.25, 0.8 * v, 0.12);
    this.hiss(0.16, 500, 0.9, 0.5 * v, 'lowpass', 0.12);
    this.tone('triangle', 230, 120, 0.12, 0.35 * v, 0.13);
  }

  /** A rope taking a weight: a short, dry creak. */
  ropeCreak(x) {
    if (!this.ready) return;
    this.sweep('bandpass', 420, 300, 0.35, this.near(x) * 0.12, 6);
  }

  /** The freeze tool: a crisp, glassy lock - or, letting go, the same the other way. */
  lockInPlace(on, x) {
    if (!this.ready) return;
    const v = this.near(x) * 0.45;
    if (on) {
      this.sweep('bandpass', 1800, 5200, 0.14, 0.18 * v, 4);
      this.tone('sine', 2640, 2600, 0.35, 0.08 * v, 0.1);
      this.tone('sine', 3960, 3900, 0.25, 0.04 * v, 0.12);
    } else {
      this.sweep('bandpass', 5200, 1500, 0.16, 0.16 * v, 4);
      this.tone('sine', 1760, 1700, 0.18, 0.05 * v, 0.06);
    }
  }

  /** A taser cartridge going off: a sharp pop of gas, and the hiss of the wires paying out. */
  taserFire(x) {
    if (!this.ready) return;
    const v = this.near(x);
    this.hiss(0.04, 3400, 1.2, 0.7 * v);
    this.tone('square', 700, 260, 0.03, 0.2 * v);
    this.hiss(0.22, 6500, 2.5, 0.12 * v, 'bandpass', 0.03);
  }

  /** Current going down the wires: a fast, dry ticking. `hard` for an arc in the open air. */
  crackle(x, hard = false) {
    if (!this.ready) return;
    const v = this.near(x) * (hard ? 0.5 : 0.32);
    for (let i = 0; i < 5; i++) {
      const d = i * 0.017 + rand(0, 0.006);
      this.tone('square', 2400 + rand(-500, 500), 1800, 0.008, 0.22 * v, d);
      this.hiss(0.01, 5200, 2, 0.35 * v, 'bandpass', d);
    }
  }

  /* -------------------------------- fire and ice -------------------------------- */

  /** A sweep of filtered noise: f0 to f1 over dur, peaking at gain. */
  sweep(type, f0, f1, dur, gain, q = 1, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise;
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + Math.min(0.1, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, own() * 0.4);
    s.stop(t + dur + 0.05);
  }

  /** Catching fire: air rushing up into it, and a low roar under that. */
  ignite(x) {
    if (!this.ready) return;
    const v = this.near(x);
    this.sweep('bandpass', 260, 1800, 0.55, 0.5 * v, 0.9);
    this.hiss(0.6, 180, 0.7, 0.35 * v, 'lowpass', 0.05);
  }

  /** A fire going: a soft roar, and pops and snaps, more of them the bigger it is. */
  fire(power, x) {
    if (!this.ready) return;
    const v = this.near(x) * (0.25 + power * 0.5);
    this.hiss(0.35, 320 + rand(-60, 60), 0.6, 0.16 * v, 'lowpass');
    const n = 1 + Math.floor(rand(0, 3) * power);
    for (let i = 0; i < n; i++) this.hiss(0.012, 2600 + rand(-900, 1400), 3, 0.32 * v, 'bandpass', rand(0, 0.3));
  }

  /** Put out with cold: steam, hissing away to nothing. */
  steamHiss(x, big = true) {
    if (!this.ready) return;
    this.sweep('highpass', 4200, 1500, big ? 0.8 : 0.45, this.near(x) * (big ? 0.22 : 0.12), 0.7);
  }

  /** Freezing solid: ice spreading - a run of high ticks and creaks - and a glassy ring. */
  freeze(x) {
    if (!this.ready) return;
    const v = this.near(x) * 0.5;
    for (let i = 0; i < 9; i++) {
      const d = i * rand(0.03, 0.07);
      this.hiss(0.02, 3500 + rand(-800, 2500), 6, 0.25 * v, 'bandpass', d);
      if (i % 3 === 0) this.tone('sine', 2400 + rand(-300, 900), 2200, 0.08, 0.05 * v, d);
    }
    this.tone('sine', 1320, 1300, 0.6, 0.06 * v, 0.3);
    this.tone('sine', 1980, 1960, 0.45, 0.04 * v, 0.32);
  }

  /** Ice cracking: a sharp snap and a ringing chip. */
  iceCrack(x, big = false) {
    if (!this.ready) return;
    const v = this.near(x) * (big ? 0.8 : 0.45);
    this.hiss(0.05, 3000, 1.5, 0.55 * v);
    this.tone('triangle', 1700 + rand(-200, 300), 900, 0.12, 0.18 * v);
    this.tone('sine', 3100 + rand(-300, 300), 3000, 0.25, 0.06 * v, 0.02);
  }

  /** A whole frozen body going to pieces: a crash like glass, and bits tinkling down after it. */
  shatter(x) {
    if (!this.ready) return;
    const v = this.near(x);
    this.hiss(0.35, 2600, 0.6, 0.6 * v, 'highpass');
    this.tone('sine', 120, 50, 0.25, 0.45 * v);
    for (let i = 0; i < 14; i++) this.tone('sine', 2000 + rand(0, 3500), 1800, 0.09, rand(0.03, 0.08) * v, 0.05 + i * rand(0.025, 0.06));
  }

  /** Air at last: a ragged gasp in, and a cough. */
  gasp(pitch, x) {
    if (!this.ready) return;
    const v = this.near(x);
    this.sweep('bandpass', 900 * pitch, 1600 * pitch, 0.5, 0.3 * v, 2);
    this.hiss(0.08, 500 * pitch, 1.5, 0.3 * v, 'bandpass', 0.6);
    this.tone('square', 160 * pitch, 110 * pitch, 0.06, 0.05 * v, 0.6);
  }

  /** A round stopped by a vest: a hard, dull smack, and the breath knocked out. */
  vestStop(x) {
    if (!this.ready) return;
    const v = this.near(x);
    this.tone('sine', 95, 40, 0.14, 0.75 * v);
    this.hiss(0.06, 700, 0.8, 0.5 * v, 'lowpass');
    this.hiss(0.03, 2200, 1.4, 0.3 * v);
  }

  /** Into a holster, or out of it: leather, and a snap. */
  holster(x, out = false) {
    if (!this.ready) return;
    const v = this.near(x);
    this.hiss(out ? 0.07 : 0.1, 1400, 1.1, 0.16 * v);
    this.tone('square', out ? 1500 : 1100, out ? 1300 : 900, 0.012, 0.06 * v, out ? 0.05 : 0.08);
  }

  /** Velcro and straps: a vest going on. */
  velcro(x) {
    if (!this.ready) return;
    const v = this.near(x);
    for (let i = 0; i < 3; i++) this.hiss(0.09, 2600 + i * 400, 1.6, 0.18 * v, 'bandpass', i * 0.1);
  }

  /** Handcuffs: the ratchet closing, a click a tooth, twice over. Off, one clack. */
  cuffs(x, off = false) {
    if (!this.ready) return;
    const v = this.near(x);
    const n = off ? 1 : 7;
    for (let i = 0; i < n; i++) {
      const d = (i % 4) * 0.035 + (i > 3 ? 0.25 : 0);
      this.tone('square', 3000 + rand(-300, 300), 2600, 0.01, 0.1 * v, d);
      this.hiss(0.012, 5000, 3, 0.14 * v, 'bandpass', d);
    }
  }

  /** A foot coming down hard to catch themselves: a scuff on the floor. */
  scuff(x, speed = 2) {
    if (!this.ready) return;
    const v = this.near(x) * clamp(speed / 3, 0.25, 1);
    this.hiss(0.06, 900, 0.8, 0.22 * v, 'lowpass');
    this.tone('sine', 90, 60, 0.05, 0.15 * v);
  }

  /** A radio: the squelch, a beep. */
  radio(x) {
    if (!this.ready) return;
    const v = this.near(x);
    this.hiss(0.12, 1900, 1.6, 0.22 * v);
    this.tone('sine', 1250, 1250, 0.06, 0.07 * v, 0.13);
    this.hiss(0.08, 1900, 1.6, 0.14 * v, 'bandpass', 0.6);
  }

  /** A handful of rounds out of a box: brass on brass. */
  rattle(x) {
    if (!this.ready) return;
    const v = this.near(x);
    for (let i = 0; i < 6; i++) this.tone('sine', 3400 + rand(-900, 900), 3000, 0.04, 0.05 * v, i * 0.05 + rand(0, 0.03));
  }

  /** Knuckles cracking: two small pops. */
  knuckleCrack(x) {
    if (!this.ready) return;
    const v = this.near(x);
    for (const d of [0, 0.07]) { this.tone('sine', 900, 400, 0.02, 0.12 * v, d); this.hiss(0.015, 3000, 2, 0.12 * v, 'bandpass', d); }
  }

  /** The hammer falling on nothing. */
  dryFire(x) {
    if (!this.ready) return;
    const v = this.near(x);
    this.tone('square', 2600, 2200, 0.012, 0.12 * v);
    this.hiss(0.02, 4000, 4, 0.12 * v);
  }

  /** The working of a pistol: a magazine out, one in, the slide racked. */
  gunClick(x, kind) {
    if (!this.ready) return;
    const v = this.near(x);
    if (kind === 'magOut') { this.tone('triangle', 900, 600, 0.03, 0.1 * v); this.hiss(0.04, 2500, 3, 0.12 * v); }
    else if (kind === 'magIn') { this.tone('square', 1300, 900, 0.02, 0.1 * v); this.hiss(0.03, 3500, 4, 0.18 * v); }
    else { this.hiss(0.05, 3000, 2, 0.22 * v); this.tone('square', 1800, 1200, 0.02, 0.1 * v, 0.06); this.hiss(0.03, 4000, 3, 0.18 * v, 'bandpass', 0.06); }
  }

  /** An empty case bouncing on the floor: a high tink. */
  casing(x, speed = 2) {
    if (!this.ready) return;
    const v = this.near(x) * clamp(speed / 4, 0.15, 0.6);
    this.tone('sine', 4200 + rand(-600, 600), 3900, 0.06, 0.06 * v);
    this.tone('sine', 6100 + rand(-500, 500), 6000, 0.04, 0.03 * v);
  }

  /** A bullet off the floor: the whine of it going away. */
  ricochet(x) {
    if (!this.ready) return;
    const v = this.near(x);
    this.tone('sine', 3400 + rand(-400, 400), 900, 0.32, 0.12 * v);
    this.hiss(0.05, 3000, 2, 0.2 * v);
  }

  /** Where a bullet ends up: wood splinters, flesh thumps, the floor cracks. */
  bulletHit(what, x) {
    if (!this.ready) return;
    const v = this.near(x);
    if (what === 'stickman') { this.tone('sine', 120, 50, 0.08, 0.5 * v); this.hiss(0.06, 900, 1, 0.35 * v, 'lowpass'); }
    else if (what === 'crate') { this.tone('triangle', 420, 160, 0.06, 0.3 * v); this.hiss(0.07, 1800, 1.6, 0.4 * v); }
    else this.hiss(0.05, 2600, 1.5, 0.3 * v);
  }

  /** A machete going in: heavier and wetter than a knife. */
  chop(power, x) {
    if (!this.ready) return;
    const v = this.near(x) * clamp(0.5 + power * 0.25, 0.4, 1.2);
    this.tone('sine', 110, 45, 0.14, 0.6 * v);
    this.hiss(0.1, 1900, 1.8, 0.45 * v);
    this.hiss(0.18, 500, 1.2, 0.35 * v, 'lowpass', 0.02);
  }

  /** Right through: a crunch of bone and something wet. */
  sever(x) {
    if (!this.ready) return;
    const v = this.near(x);
    this.hiss(0.06, 3200, 3, 0.55 * v);
    this.tone('square', 600, 200, 0.06, 0.15 * v);
    this.hiss(0.25, 450, 0.9, 0.45 * v, 'lowpass', 0.03);
  }

  /** A joint going out, or back in: a dull pop. */
  jointPop(x) {
    if (!this.ready) return;
    const v = this.near(x);
    this.tone('sine', 260, 90, 0.07, 0.4 * v);
    this.hiss(0.04, 1500, 2, 0.25 * v);
  }

  /** A blade drawn across: a thin swish and a hiss. */
  slash(x) {
    if (!this.ready) return;
    const v = this.near(x);
    this.hiss(0.08, 4200, 3, 0.3 * v);
    this.tone('triangle', 3100, 2400, 0.08, 0.04 * v);
  }

  /** Steel into wood. */
  thunk(x) {
    if (!this.ready) return;
    const v = this.near(x);
    this.tone('triangle', 260, 140, 0.09, 0.5 * v);
    this.tone('sine', 1900, 1500, 0.15, 0.06 * v, 0.01);
    this.hiss(0.05, 1500, 2, 0.3 * v);
  }

  clap(x, soft = false) {
    if (!this.ready) return;
    const v = this.near(x) * (soft ? 0.5 : 0.35);
    this.hiss(0.04, 1800, 1.2, v);
  }

  pop(x) {
    if (!this.ready) return;
    this.tone('sine', 420, 760, 0.1, 0.18 * this.near(x));
  }

  /** Babble: a blip or so per syllable, at the speaker's pitch. */
  voice(text, pitch, loud, x) {
    if (!this.ready) return;
    // keep a crowd from all talking at once at full volume
    const now = this.ctx.currentTime;
    if (now - this.recent < 0.05) return;
    this.recent = now;
    const v = this.near(x) * (loud ? 0.2 : 0.11);
    const n = clamp(Math.round(text.replace(/[^a-z]/gi, '').length / 3.2), 1, 9);
    const base = (loud ? 300 : 220) * pitch;
    for (let i = 0; i < n; i++) {
      const f = base * rand(0.85, 1.25);
      this.tone(loud ? 'sawtooth' : 'triangle', f, f * rand(0.8, 1.05), 0.065, v * (loud ? 0.6 : 1), i * 0.085);
    }
  }

  scream(pitch, x) {
    if (!this.ready) return;
    const v = this.near(x) * 0.12;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(520 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(330 * pitch, t + 0.6);
    lfo.frequency.value = 9;
    lg.gain.value = 18;
    lfo.connect(lg); lg.connect(o.frequency);
    f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(t); lfo.start(t);
    o.stop(t + 0.7); lfo.stop(t + 0.7);
  }

  death(pitch, x) {
    if (!this.ready) return;
    const v = this.near(x) * 0.18;
    this.tone('triangle', 330 * pitch, 90 * pitch, 0.9, v);
  }
}
