/* =============================================================================
   Sound, synthesised on the spot with WebAudio: there are no sound files.
   A pickaxe is a ringing click over a thud, a breaking rock is a burst of
   filtered noise, the anvil is three bells struck at once, and so on.

   Browsers will not make a sound until the page has been touched, so the
   context is only made on the first tap.
   ========================================================================== */

class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.noise = null;
    this._last = Object.create(null);
  }

  /** Call from a tap or a click. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.55;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch { /* no sound, then */ }
  }

  _ok(name, gap = 0.03) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return false;
    const now = this.ctx.currentTime;
    if (this._last[name] && now - this._last[name] < gap) return false;
    this._last[name] = now;
    return true;
  }

  _tone(freq, dur, { type = 'sine', gain = 0.3, at = 0, slide = 0, attack = 0.004 } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _noise(dur, { type = 'bandpass', freq = 1000, q = 1, gain = 0.3, at = 0, sweep = 0, attack = 0.003 } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(name, opt = {}) {
    if (!this._ok(name, opt.gap ?? 0.03)) return;
    const r = 1 + (Math.random() - 0.5) * 0.08;
    switch (name) {
      case 'pick':
        this._noise(0.07, { freq: 2600 * r, q: 6, gain: 0.35 });
        this._tone(1750 * r, 0.12, { type: 'triangle', gain: 0.12 });
        this._tone(140, 0.08, { gain: 0.3, slide: 0.6 });
        break;
      case 'tough':
        this._tone(3100 * r, 0.25, { type: 'triangle', gain: 0.14 });
        this._noise(0.05, { freq: 4200, q: 8, gain: 0.25 });
        break;
      case 'break':
        this._noise(0.42, { type: 'lowpass', freq: 1400, sweep: 0.25, gain: 0.55 });
        this._tone(85, 0.25, { gain: 0.45, slide: 0.5 });
        for (let i = 0; i < 5; i++) this._noise(0.04, { freq: 2000 + Math.random() * 2000, q: 5, gain: 0.15, at: 0.05 + i * 0.05 });
        break;
      case 'swing':
        this._noise(0.18, { freq: 500 * r, sweep: 3.5, q: 1.2, gain: 0.18, attack: 0.05 });
        break;
      case 'heavy':
        this._noise(0.32, { freq: 260 * r, sweep: 3, q: 1, gain: 0.25, attack: 0.09 });
        break;
      case 'hit':
        this._noise(0.08, { freq: 1300 * r, q: 2, gain: 0.35 });
        this._tone(190 * r, 0.1, { gain: 0.3, slide: 0.55 });
        break;
      case 'bones':
        for (let i = 0; i < 9; i++) this._noise(0.035, { freq: 1800 + Math.random() * 2600, q: 7, gain: 0.22, at: i * 0.045 + Math.random() * 0.02 });
        this._tone(120, 0.3, { gain: 0.2, slide: 0.5 });
        break;
      case 'hurt':
        this._tone(110, 0.22, { type: 'sawtooth', gain: 0.12, slide: 0.6 });
        this._noise(0.12, { type: 'lowpass', freq: 600, gain: 0.35 });
        break;
      case 'dodge':
        this._noise(0.14, { freq: 1600, sweep: 0.4, q: 2, gain: 0.15 });
        break;
      case 'dash':
        this._noise(0.2, { freq: 700, sweep: 2.4, q: 1.4, gain: 0.2, attack: 0.02 });
        break;
      case 'clang':
        for (const [f, g] of [[820, 0.22], [1395, 0.14], [2215, 0.09], [3340, 0.05]]) this._tone(f * r, 0.75, { type: 'sine', gain: g });
        this._noise(0.04, { freq: 3500, q: 3, gain: 0.3 });
        break;
      case 'pour':
        this._noise(0.95, { type: 'lowpass', freq: 380, gain: 0.35, attack: 0.15 });
        this._noise(0.9, { freq: 1500, q: 0.8, gain: 0.05, attack: 0.2 });
        break;
      case 'chain':
        for (let i = 0; i < 4; i++) this._noise(0.03, { freq: 3600 + Math.random() * 2000, q: 9, gain: 0.14, at: i * 0.05 + Math.random() * 0.02 });
        this._tone(2300 * r, 0.08, { type: 'triangle', gain: 0.05, at: 0.06 });
        break;
      case 'thud':
        this._tone(96 * r, 0.2, { gain: 0.4, slide: 0.6 });
        this._noise(0.1, { type: 'lowpass', freq: 520, gain: 0.35 });
        break;
      case 'perfect':
        [1, 1.5, 2].forEach((m, i) => this._tone(1046 * m, 0.24, { type: 'triangle', gain: 0.1, at: i * 0.045 }));
        break;
      case 'hiss':
        this._noise(1.0, { type: 'highpass', freq: 2800, gain: 0.32, attack: 0.02 });
        break;
      case 'coin':
        this._tone(988, 0.09, { type: 'square', gain: 0.07 });
        this._tone(1319, 0.22, { type: 'square', gain: 0.07, at: 0.08 });
        break;
      case 'pickup': {
        const f = 620 * (1 + (opt.rank || 0) * 0.18);
        this._tone(f, 0.08, { type: 'triangle', gain: 0.16, slide: 1.4 });
        break;
      }
      case 'rare': {
        const base = 523 * (1 + (opt.rank || 2) * 0.06);
        [1, 1.26, 1.5, 2].forEach((m, i) => this._tone(base * m, 0.3, { type: 'triangle', gain: 0.13, at: i * 0.07 }));
        break;
      }
      case 'legendary':
        [1, 1.26, 1.5, 2, 2.52, 3].forEach((m, i) => this._tone(440 * m, 0.5, { type: 'triangle', gain: 0.13, at: i * 0.08 }));
        this._noise(1.2, { type: 'highpass', freq: 6000, gain: 0.08, attack: 0.3 });
        break;
      case 'level':
        [1, 1.25, 1.5, 2, 1.5, 2].forEach((m, i) => this._tone(392 * m, 0.34, { type: 'square', gain: 0.06, at: i * 0.09 }));
        break;
      case 'quest':
        [1, 1.5, 2].forEach((m, i) => this._tone(660 * m, 0.25, { type: 'triangle', gain: 0.12, at: i * 0.1 }));
        break;
      case 'rise':
        this._noise(0.9, { type: 'lowpass', freq: 220, gain: 0.35, attack: 0.2 });
        break;
      case 'death':
        this._tone(330, 1.0, { type: 'sawtooth', gain: 0.08, slide: 0.35 });
        break;
      case 'ui':
        this._tone(1250, 0.04, { type: 'triangle', gain: 0.08 });
        break;
      case 'nope':
        this._tone(220, 0.12, { type: 'square', gain: 0.06 });
        this._tone(180, 0.14, { type: 'square', gain: 0.06, at: 0.1 });
        break;
      default: break;
    }
  }
}

export const sfx = new Sfx();
