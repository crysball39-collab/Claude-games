/* =============================================================================
   Sound, made on the spot with WebAudio - no files, so the single file build
   stays a single file. A punch is a short knock of filtered noise over a low
   thump, a bat is the same but heavier, a blade is a hiss, a body landing is
   a deep thud. Everything is quieter the further it is from the camera.
   ========================================================================== */

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.noise = null;
    this.recent = [];
    this.listener = { x: 0, y: 0, z: 0 };
  }

  /** Browsers only allow audio after a tap; call this from one. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    // one second of white noise to cut sounds from
    const n = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, n, n);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.8;
  }

  /** Volume for something at p, and whether there is room for another sound. */
  level(p) {
    if (!this.ctx || this.muted) return 0;
    const now = this.ctx.currentTime;
    this.recent = this.recent.filter((t) => now - t < 0.08);
    if (this.recent.length > 5) return 0;
    this.recent.push(now);
    const l = this.listener;
    const d = p ? Math.hypot(p.x - l.x, p.y - l.y, p.z - l.z) : 0;
    return 1 / (1 + d / 7);
  }

  burst({ at = 0, dur = 0.08, gain = 0.5, type = 'lowpass', freq = 1500, q = 1, rate = 1 }) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    const t = c.currentTime + at;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.8);
    src.stop(t + dur + 0.02);
  }

  tone({ at = 0, dur = 0.12, gain = 0.5, from = 120, to = 50, type = 'sine' }) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    const g = c.createGain();
    const t = c.currentTime + at;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /** A blow landing. kind: fist | bat | sword | impact. speed in m/s. */
  hit(kind, speed, p) {
    const v = this.level(p);
    if (!v) return;
    const k = Math.min(1.3, 0.4 + speed / 12) * v;
    if (kind === 'sword') {
      this.burst({ dur: 0.16, gain: 0.35 * k, type: 'highpass', freq: 2600, q: 0.7 });
      this.burst({ dur: 0.07, gain: 0.5 * k, type: 'bandpass', freq: 900, q: 1.2 });
      this.tone({ dur: 0.09, gain: 0.3 * k, from: 160, to: 70 });
    } else if (kind === 'bat') {
      this.burst({ dur: 0.1, gain: 0.7 * k, type: 'lowpass', freq: 1200, q: 0.8 });
      this.tone({ dur: 0.16, gain: 0.7 * k, from: 140, to: 45 });
      this.tone({ dur: 0.05, gain: 0.2 * k, from: 520, to: 380, type: 'triangle' });
    } else {
      this.burst({ dur: 0.06, gain: 0.55 * k, type: 'lowpass', freq: 1800 + Math.random() * 900, q: 0.9 });
      this.tone({ dur: 0.1, gain: 0.55 * k, from: 110 + Math.random() * 30, to: 50 });
    }
  }

  /** A weapon cutting the air. */
  whoosh(p) {
    const v = this.level(p);
    if (!v) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 2.5;
    const g = c.createGain();
    const t = c.currentTime;
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(1800, t + 0.14);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.26);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22 * v, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.6);
    src.stop(t + 0.3);
  }

  /** A body hitting the ground. */
  thud(speed, p) {
    const v = this.level(p);
    if (!v) return;
    const k = Math.min(1, speed / 9) * v;
    this.tone({ dur: 0.2, gain: 0.6 * k, from: 85, to: 35 });
    this.burst({ dur: 0.12, gain: 0.35 * k, type: 'lowpass', freq: 500, q: 0.7 });
  }
}
