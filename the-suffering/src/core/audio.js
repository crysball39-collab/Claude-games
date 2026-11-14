/* =============================================================================
   Sound, all of it synthesised: there are no audio files.

   Each sound is a recipe of a few bursts of filtered noise and a few tones.
   Sounds in the world get quieter with distance and are panned by where they
   are relative to the camera. Voices are a run of pitched blips at the
   speaker's own pitch - a murmur rather than words - and a scream is a scream.
   ========================================================================== */
import { clamp, clamp01, rand } from './util.js';

export class Sound {
  constructor() {
    this.ctx = null; this.master = null; this.noiseBuf = null;
    this.volume = 0.7;
    this.lx = 0; this.ly = 0; this.lz = 0; this.yaw = 0;
    this.budget = 0; this.budgetT = 0;
    this.hum = null;
    this.played = 0;
  }

  /** Browsers only let sound start from a touch or a click. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = this.ctx = new AC();
        this.master = ctx.createGain();
        this.master.gain.value = this.volume;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
        this.master.connect(comp); comp.connect(ctx.destination);
        const n = ctx.sampleRate * 2, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        this.noiseBuf = buf;
        this._ambience();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch { this.ctx = null; }
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  suspend(on) { if (this.ctx) { try { on ? this.ctx.suspend() : this.ctx.resume(); } catch { /* fine */ } } }
  listen(x, y, z, yaw) { this.lx = x; this.ly = y; this.lz = z; this.yaw = yaw; }

  /* ------------------------------- primitives ----------------------------- */

  _out(vol, pan) {
    const ctx = this.ctx, g = ctx.createGain();
    g.gain.value = vol;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); p.connect(this.master); } else g.connect(this.master);
    return g;
  }
  /** A burst of noise through a filter that can sweep. */
  _n(dest, t, dur, peak, type, f0, f1 = f0, q = 0.8, attack = 0.002) {
    const ctx = this.ctx, src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random()); src.stop(t + dur + 0.02);
  }
  /** A tone that can glide. */
  _t(dest, t, dur, peak, wave, f0, f1 = f0, attack = 0.003) {
    const ctx = this.ctx, o = ctx.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
    return o;
  }

  /* --------------------------------- recipes ------------------------------ */

  _make(name, d, t) {
    switch (name) {
      case 'pistol': this._n(d, t, 0.2, 1.1, 'lowpass', 3200, 500, 0.6); this._t(d, t, 0.13, 0.9, 'sine', 170, 48); this._n(d, t, 0.03, 0.6, 'highpass', 3000); this._n(d, t + 0.04, 0.5, 0.16, 'bandpass', 900, 300, 0.4); break;
      case 'rifle': this._n(d, t, 0.24, 1.2, 'lowpass', 4200, 600, 0.5); this._t(d, t, 0.14, 1.0, 'sine', 130, 40); this._n(d, t, 0.025, 0.8, 'highpass', 4000); this._n(d, t + 0.05, 0.6, 0.2, 'bandpass', 700, 250, 0.4); break;
      case 'tasershot': this._n(d, t, 0.05, 0.8, 'highpass', 1800, 900, 1); this._t(d, t, 0.05, 0.3, 'square', 260, 90); this._n(d, t + 0.04, 0.2, 0.25, 'bandpass', 5200, 2600, 3); break;
      case 'taser': for (let i = 0; i < 9; i++) { this._n(d, t + i * 0.046 + rand(0, 0.006), 0.012, 0.8, 'highpass', 2600 + rand(0, 900)); this._t(d, t + i * 0.046, 0.014, 0.25, 'square', 1900, 700); } break;
      case 'cuff': for (let i = 0; i < 5; i++) this._n(d, t + i * 0.03, 0.012, 0.6, 'highpass', 3600 + i * 300); this._t(d, t + 0.17, 0.05, 0.3, 'triangle', 2300, 1500); break;
      case 'click': this._n(d, t, 0.02, 0.5, 'highpass', 2500); this._t(d, t, 0.02, 0.2, 'square', 1500); break;
      case 'reload': this._n(d, t, 0.04, 0.5, 'bandpass', 2600, 1800, 3); this._n(d, t + 0.28, 0.05, 0.5, 'bandpass', 1900, 1400, 3); this._n(d, t + 0.62, 0.035, 0.6, 'bandpass', 3200, 2200, 3); this._t(d, t + 0.62, 0.03, 0.2, 'square', 900); break;
      case 'pickup': this._n(d, t, 0.05, 0.4, 'bandpass', 1800, 1200, 2); this._t(d, t, 0.06, 0.15, 'triangle', 420, 520); break;
      case 'punch': this._n(d, t, 0.07, 0.9, 'lowpass', 900, 300); this._t(d, t, 0.1, 0.8, 'sine', 120, 55); break;
      case 'whoosh': this._n(d, t, 0.2, 0.3, 'bandpass', 500, 1500, 1.2, 0.06); break;
      case 'swish': this._n(d, t, 0.15, 0.35, 'bandpass', 2200, 5200, 2, 0.04); break;
      case 'slash': this._n(d, t, 0.12, 0.4, 'bandpass', 3000, 6000, 2, 0.02); this._n(d, t + 0.02, 0.1, 0.7, 'lowpass', 1500, 500); break;
      case 'chop': this._n(d, t, 0.11, 0.9, 'lowpass', 1100, 350); this._t(d, t, 0.1, 0.7, 'sine', 150, 65); this._n(d, t + 0.02, 0.12, 0.5, 'bandpass', 900, 400, 1); break;
      case 'stab': this._n(d, t, 0.13, 0.7, 'bandpass', 1000, 380, 1.4); this._t(d, t, 0.06, 0.3, 'sine', 180, 90); break;
      case 'flesh': this._n(d, t, 0.09, 0.8, 'lowpass', 1300, 400); this._n(d, t, 0.05, 0.3, 'bandpass', 2400, 1200, 2); break;
      case 'thud': this._t(d, t, 0.17, 0.9, 'sine', 95, 42); this._n(d, t, 0.1, 0.5, 'lowpass', 420, 180); break;
      case 'land': this._t(d, t, 0.12, 0.5, 'sine', 110, 55); this._n(d, t, 0.07, 0.3, 'lowpass', 600, 250); break;
      case 'step': this._n(d, t, 0.04, 0.2, 'lowpass', 700, 300); break;
      case 'crack': for (let i = 0; i < 3; i++) this._n(d, t + i * 0.022 + rand(0, 0.006), 0.014, 0.9, 'highpass', 1800 + i * 500); this._t(d, t, 0.05, 0.3, 'square', 240, 120); break;
      case 'crate': this._t(d, t, 0.09, 0.7, 'triangle', 190, 110); this._n(d, t, 0.06, 0.5, 'bandpass', 850, 500, 1.5); break;
      case 'impact': this._n(d, t, 0.06, 0.7, 'highpass', 1600); this._t(d, t, 0.05, 0.3, 'triangle', 900, 400); break;
      case 'ricochet': { const o = this._t(d, t, 0.34, 0.35, 'sine', 2600, 650, 0.01); const l = this.ctx.createOscillator(), lg = this.ctx.createGain(); l.frequency.value = 38; lg.gain.value = 120; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 0.36); this._n(d, t, 0.04, 0.5, 'highpass', 2500); break; }
      case 'sever': this._n(d, t, 0.14, 0.9, 'lowpass', 1600, 350); this._n(d, t + 0.01, 0.02, 0.8, 'highpass', 2200); this._t(d, t, 0.09, 0.5, 'sine', 140, 60); this._n(d, t + 0.06, 0.25, 0.4, 'bandpass', 700, 300, 1); break;
      case 'burst': this._n(d, t, 0.32, 1.1, 'lowpass', 1800, 260); this._t(d, t, 0.16, 0.9, 'sine', 110, 38); this._n(d, t + 0.05, 0.3, 0.5, 'bandpass', 600, 250, 0.8); for (let i = 0; i < 2; i++) this._n(d, t + i * 0.03, 0.015, 0.7, 'highpass', 2000); break;
      case 'vomit': for (let i = 0; i < 4; i++) this._n(d, t + i * 0.13, 0.16, 0.5, 'bandpass', 500 + rand(-120, 200), 280, 2.2, 0.03); this._t(d, t, 0.3, 0.25, 'sawtooth', 150, 90, 0.05); break;
      case 'carhit': this._t(d, t, 0.22, 1.1, 'sine', 85, 34); this._n(d, t, 0.26, 0.9, 'lowpass', 2200, 300); this._n(d, t + 0.02, 0.1, 0.5, 'highpass', 1800); break;
      case 'horn': this._t(d, t, 0.55, 0.3, 'sawtooth', 415, 415, 0.02); this._t(d, t, 0.55, 0.3, 'sawtooth', 523, 523, 0.02); break;
      case 'screech': this._n(d, t, 0.7, 0.45, 'bandpass', 3100, 2300, 9, 0.05); this._n(d, t, 0.7, 0.2, 'bandpass', 1500, 1200, 5, 0.05); break;
      default: return false;
    }
    return true;
  }

  _allowed() {
    const now = performance.now();
    if (now - this.budgetT > 250) { this.budgetT = now; this.budget = 0; }
    return this.ctx && this.ctx.state === 'running' && this.budget++ < 9;
  }

  /** A sound with no place: your own gun, a button. */
  play(name, vol = 1) {
    if (!this._allowed()) return;
    this.played++;
    this._make(name, this._out(vol * 0.6, 0), this.ctx.currentTime + 0.001);
  }

  /** A sound at a point in the city. */
  at(name, x, y, z, vol = 1) {
    if (!this.ctx) return;
    const dx = x - this.lx, dy = y - this.ly, dz = z - this.lz, d = Math.hypot(dx, dy, dz);
    if (d > 85) return;
    const gain = vol * 0.6 / (1 + Math.pow(d / 7, 1.7));
    if (gain < 0.004 || !this._allowed()) return;
    this.played++;
    // to the camera's right is positive
    const pan = d < 0.5 ? 0 : (dx * -Math.cos(this.yaw) + dz * Math.sin(this.yaw)) / d;
    this._make(name, this._out(gain, pan * 0.85), this.ctx.currentTime + 0.001);
  }

  /** Somebody's voice: a murmur, a shout or a scream, at their own pitch. */
  voice(human, kind, text, x, y, z) {
    if (!this.ctx) return;
    const dx = x - this.lx, dz = z - this.lz, d = Math.hypot(dx, y - this.ly, dz);
    if (d > 60) return;
    const loud = kind === 'talk' ? 0.22 : kind === 'shout' ? 0.42 : 0.5;
    const gain = human.isPlayer ? loud * 0.5 : loud / (1 + Math.pow(d / 6, 1.7));
    if (gain < 0.004 || !this._allowed()) return;
    const pan = d < 0.5 || human.isPlayer ? 0 : (dx * -Math.cos(this.yaw) + dz * Math.sin(this.yaw)) / d;
    const out = this._out(gain, pan * 0.85), ctx = this.ctx, t = ctx.currentTime + 0.005;
    const base = 128 * human.look.pitch;
    // the mouth: a band of the spectrum that the voice is pushed through
    const mouth = ctx.createBiquadFilter(); mouth.type = 'bandpass'; mouth.frequency.value = kind === 'talk' ? 900 : 1400; mouth.Q.value = 0.9;
    mouth.connect(out);
    if (kind === 'scream') {
      const dur = rand(0.45, 0.8);
      const o = ctx.createOscillator(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * 2.3, t); o.frequency.linearRampToValueAtTime(base * 3.2, t + dur * 0.25); o.frequency.exponentialRampToValueAtTime(base * 1.8, t + dur);
      l.frequency.value = 11; lg.gain.value = base * 0.14; l.connect(lg); lg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.03); g.gain.setValueAtTime(0.9, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(mouth);
      o.start(t); l.start(t); o.stop(t + dur + 0.02); l.stop(t + dur + 0.02);
      this._n(out, t, dur * 0.8, 0.25, 'bandpass', 2600, 2000, 1.5, 0.02);
      return;
    }
    const words = clamp(Math.round((text || '').length / 5), 2, kind === 'shout' ? 7 : 9);
    let at = t;
    for (let i = 0; i < words; i++) {
      const f = base * (kind === 'shout' ? 1.45 : 1) * (0.86 + Math.random() * 0.36);
      const dur = kind === 'shout' ? rand(0.09, 0.15) : rand(0.055, 0.1);
      this._t(mouth, at, dur, 0.9, i % 3 ? 'triangle' : 'sawtooth', f, f * (0.9 + Math.random() * 0.22), 0.012);
      at += dur + rand(0.025, 0.07);
    }
  }

  /** A steady bed of city under everything: distant traffic and wind. */
  _ambience() {
    const ctx = this.ctx, src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
    const g = ctx.createGain(); g.gain.value = 0.05;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    // and one engine, which is whichever car is nearest
    const o = ctx.createOscillator(), og = ctx.createGain(), of = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = 58; of.type = 'lowpass'; of.frequency.value = 220; og.gain.value = 0;
    o.connect(of); of.connect(og); og.connect(this.master); o.start();
    this.hum = { o, g: og };
  }
  engine(dist, speed) {
    if (!this.hum || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.hum.g.gain.setTargetAtTime(clamp01(1 - dist / 30) * 0.09, t, 0.15);
    this.hum.o.frequency.setTargetAtTime(48 + speed * 7, t, 0.2);
  }
}
