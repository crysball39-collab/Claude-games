/* =============================================================================
   Every sound in the game, made on the spot with WebAudio: no sound files.

   Punches are a low thump with a slap of noise on top (and a ring of metal
   when they are brass knuckles), crates knock like wood, bodies land with a
   thud, bones crack, and people babble: a run of short tuned blips, one per
   syllable or so, pitched to the speaker's voice and raised when they shout.

   Sounds get quieter the further they are from the middle of the view.
   ========================================================================== */
import { clamp, rand } from './util.js';

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
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
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
    s.start(t, Math.random() * 0.5);
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
    s.start(t, Math.random() * 0.5);
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
