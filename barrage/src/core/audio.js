/* =============================================================================
   Sound, made on the spot with WebAudio. There are no sound files, so the
   single-file build stays a single file.

   Blows are a knock of filtered noise over a low thump - heavier for a kick,
   woody for the wooden sword, a hiss and a ring for steel. A shot is a crack
   and a boom. The portcullises rattle and grind; the oak doors creak. The
   crowd murmurs all the time and roars when someone goes down. Coins chink.
   Between rounds it is quiet; during a round, war drums.

   Everything in the world is quieter the further it is from the camera.
   ========================================================================== */

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = { sfx: true, music: true };
    this.recent = [];
    this.listener = { x: 0, y: 0, z: 0 };
    this.drums = { on: false, step: 0, next: 0, timer: 0, tempo: 118 };
  }

  /** Browsers only allow audio after a tap; call this from one. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(c.destination);
    this.master = c.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(comp);
    this.sfx = c.createGain();
    this.sfx.gain.value = this.enabled.sfx ? 1 : 0;
    this.sfx.connect(this.master);
    this.music = c.createGain();
    this.music.gain.value = this.enabled.music ? 0.5 : 0;
    this.music.connect(this.master);
    // three seconds of white noise to cut sounds from
    const n = c.sampleRate * 3;
    this.noise = c.createBuffer(1, n, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.startCrowd();
  }

  setSfx(on) {
    this.enabled.sfx = on;
    if (this.sfx) this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
  }

  setMusic(on) {
    this.enabled.music = on;
    if (this.music) this.music.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.1);
  }

  suspend(off) {
    if (!this.ctx) return;
    if (off) this.ctx.suspend(); else this.ctx.resume();
  }

  /** Volume for something at p, and whether there is room for another sound right now. */
  level(p, max = 6) {
    if (!this.ctx || !this.enabled.sfx) return 0;
    const now = this.ctx.currentTime;
    this.recent = this.recent.filter((t) => now - t < 0.08);
    if (this.recent.length > max) return 0;
    this.recent.push(now);
    const l = this.listener;
    const d = p ? Math.hypot(p.x - l.x, p.y - l.y, p.z - l.z) : 0;
    return 1 / (1 + d / 8);
  }

  /* ------------------------------ building blocks ------------------------- */

  burst({ at = 0, dur = 0.08, gain = 0.5, type = 'lowpass', freq = 1500, q = 1, rate = 1, out = this.sfx, sweep = 0 }) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const t = c.currentTime + at;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }

  tone({ at = 0, dur = 0.12, gain = 0.5, from = 120, to = 50, type = 'sine', out = this.sfx, attack = 0.005 }) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    const g = c.createGain();
    const t = c.currentTime + at;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /* --------------------------------- combat -------------------------------- */

  /** A blow landing. kind: fist | kick | wood | blade | bullet | impact. */
  hit(kind, speed, p, blocked = false) {
    const v = this.level(p);
    if (!v) return;
    const k = Math.min(1.3, 0.45 + speed / 12) * v * (blocked ? 0.6 : 1);
    if (kind === 'blade') {
      this.burst({ dur: 0.18, gain: 0.32 * k, type: 'highpass', freq: 2600, q: 0.7 });
      this.burst({ dur: 0.08, gain: 0.55 * k, type: 'bandpass', freq: 900, q: 1.2 });
      this.tone({ dur: 0.1, gain: 0.32 * k, from: 170, to: 70 });
      this.tone({ dur: 0.35, gain: 0.05 * k, from: 2350, to: 2300, type: 'triangle' });
    } else if (kind === 'wood') {
      this.burst({ dur: 0.07, gain: 0.6 * k, type: 'bandpass', freq: 1100, q: 2 });
      this.tone({ dur: 0.12, gain: 0.55 * k, from: 210, to: 90, type: 'triangle' });
      this.tone({ dur: 0.14, gain: 0.45 * k, from: 120, to: 50 });
    } else if (kind === 'bullet') {
      this.burst({ dur: 0.09, gain: 0.6 * k, type: 'lowpass', freq: 900, q: 1 });
      this.tone({ dur: 0.09, gain: 0.5 * k, from: 160, to: 60 });
    } else if (kind === 'kick') {
      this.burst({ dur: 0.08, gain: 0.6 * k, type: 'lowpass', freq: 1300, q: 0.9 });
      this.tone({ dur: 0.16, gain: 0.75 * k, from: 95, to: 40 });
    } else {
      this.burst({ dur: 0.06, gain: 0.55 * k, type: 'lowpass', freq: 1800 + Math.random() * 900, q: 0.9 });
      this.tone({ dur: 0.1, gain: 0.55 * k, from: 115 + Math.random() * 30, to: 50 });
    }
  }

  /** A blow on a raised guard: the dull thump of forearms, or the knock of oak. */
  block(shield, p) {
    const v = this.level(p);
    if (!v) return;
    if (shield) {
      this.burst({ dur: 0.1, gain: 0.7 * v, type: 'bandpass', freq: 700, q: 3 });
      this.tone({ dur: 0.18, gain: 0.6 * v, from: 180, to: 110, type: 'triangle' });
      this.tone({ dur: 0.05, gain: 0.25 * v, from: 1400, to: 1100, type: 'square' });
    } else {
      this.burst({ dur: 0.05, gain: 0.4 * v, type: 'lowpass', freq: 900, q: 0.8 });
      this.tone({ dur: 0.08, gain: 0.35 * v, from: 140, to: 80 });
    }
  }

  /** Something cutting the air: a short huff for a fist, longer for a blade or a foot. */
  whoosh(p, kind = 'jab') {
    const v = this.level(p, 8);
    if (!v) return;
    const c = this.ctx;
    const long = kind !== 'jab';
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 2.5;
    const g = c.createGain();
    const t = c.currentTime;
    const dur = long ? 0.3 : 0.16;
    f.frequency.setValueAtTime(long ? 450 : 700, t);
    f.frequency.exponentialRampToValueAtTime(long ? 1800 : 2200, t + dur * 0.5);
    f.frequency.exponentialRampToValueAtTime(600, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime((long ? 0.24 : 0.12) * v, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }

  /** A body hitting the ground. */
  thud(speed, p) {
    const v = this.level(p);
    if (!v) return;
    const k = Math.min(1, speed / 9) * v;
    this.tone({ dur: 0.2, gain: 0.6 * k, from: 85, to: 35 });
    this.burst({ dur: 0.14, gain: 0.35 * k, type: 'lowpass', freq: 500, q: 0.7 });
  }

  /** A pistol: the crack, the boom, the slap off the walls. */
  shot(p) {
    const v = this.level(p, 10);
    if (!v) return;
    this.burst({ dur: 0.05, gain: 0.9 * v, type: 'highpass', freq: 1800, q: 0.6 });
    this.burst({ dur: 0.22, gain: 0.7 * v, type: 'lowpass', freq: 1400, q: 0.7, sweep: 0.3 });
    this.tone({ dur: 0.18, gain: 0.8 * v, from: 140, to: 40 });
    this.burst({ at: 0.09, dur: 0.3, gain: 0.18 * v, type: 'bandpass', freq: 800, q: 0.8 });
  }

  ricochet(p, kind) {
    const v = this.level(p);
    if (!v) return;
    if (kind === 'stone') this.tone({ dur: 0.22, gain: 0.18 * v, from: 3200, to: 1400, type: 'triangle' });
    else if (kind === 'wood') this.block(true, p);
    else this.burst({ dur: 0.12, gain: 0.3 * v, type: 'lowpass', freq: 700, q: 0.6 });
  }

  step(p, sand = true) {
    const v = this.level(p, 10);
    if (!v) return;
    if (sand) this.burst({ dur: 0.07, gain: 0.07 * v, type: 'lowpass', freq: 650 + Math.random() * 300, q: 0.6 });
    else this.burst({ dur: 0.04, gain: 0.07 * v, type: 'bandpass', freq: 1800, q: 1.4 });
  }

  /** A grunt, roughly: a buzz through the shape of a vowel. */
  grunt(p, pitch = 1) {
    const v = this.level(p);
    if (!v) return;
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    const t = c.currentTime;
    o.frequency.setValueAtTime(150 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(95 * pitch, t + 0.22);
    const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 650; f1.Q.value = 4;
    const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1150; f2.Q.value = 5;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22 * v, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(this.sfx);
    o.start(t); o.stop(t + 0.26);
  }

  /* --------------------------------- arena --------------------------------- */

  /** A portcullis rattling up or down, or the oak doors swinging. */
  gate(player, p) {
    const v = this.level(p, 12);
    if (!v) return;
    if (player) {
      // a creak, then the thump of the doors
      const c = this.ctx;
      const o = c.createOscillator();
      o.type = 'sawtooth';
      const t = c.currentTime;
      o.frequency.setValueAtTime(70, t);
      for (let i = 1; i < 8; i++) o.frequency.linearRampToValueAtTime(60 + Math.random() * 50, t + i * 0.12);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 6;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18 * v, t + 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
      o.connect(f); f.connect(g); g.connect(this.sfx);
      o.start(t); o.stop(t + 1.05);
      this.tone({ at: 1.0, dur: 0.3, gain: 0.5 * v, from: 70, to: 35 });
      return;
    }
    for (let i = 0; i < 12; i++) {
      this.burst({ at: i * 0.09, dur: 0.05, gain: 0.25 * v, type: 'bandpass', freq: 2200 + Math.random() * 1600, q: 5 });
    }
    this.burst({ dur: 1.2, gain: 0.3 * v, type: 'lowpass', freq: 260, q: 0.8 });
    this.tone({ at: 1.1, dur: 0.25, gain: 0.4 * v, from: 90, to: 50 });
  }

  /** The crowd: a murmur that never stops. */
  startCrowd() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 0.7;
    const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 1400;
    this.crowdGain = c.createGain();
    this.crowdGain.gain.value = 0.0;
    src.connect(f); f.connect(f2); f2.connect(this.crowdGain); this.crowdGain.connect(this.sfx);
    src.start();
    // slow swells, as a crowd does
    const lfo = c.createOscillator(); lfo.frequency.value = 0.13;
    const lg = c.createGain(); lg.gain.value = 0.015;
    lfo.connect(lg); lg.connect(this.crowdGain.gain);
    lfo.start();
  }

  /** How loud the murmur is: louder in the arena than out in the plaza. */
  crowdLevel(k) {
    if (!this.crowdGain) return;
    this.crowdGain.gain.setTargetAtTime(0.05 * k, this.ctx.currentTime, 0.4);
  }

  /** The crowd roars. */
  cheer(k = 1) {
    const v = this.level(null, 12);
    if (!v) return;
    const dur = 1.4 + k;
    for (const [freq, q, g] of [[420, 1.5, 0.16], [900, 2, 0.12], [1900, 2.5, 0.06]]) {
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = this.noise;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const gn = c.createGain();
      const t = c.currentTime;
      gn.gain.setValueAtTime(0, t);
      gn.gain.linearRampToValueAtTime(g * k * v, t + 0.25);
      gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f); f.connect(gn); gn.connect(this.sfx);
      src.start(t, Math.random()); src.stop(t + dur + 0.05);
    }
    // a few whistles
    for (let i = 0; i < Math.round(2 * k); i++) {
      const at = Math.random() * 0.6;
      const f0 = 1600 + Math.random() * 900;
      this.tone({ at, dur: 0.5, gain: 0.04 * v, from: f0, to: f0 * 1.35, type: 'sine', attack: 0.05 });
    }
  }

  horn() {
    if (!this.ctx || !this.enabled.sfx) return;
    for (const [at, f, dur] of [[0, 196, 0.5], [0.55, 294, 0.9]]) {
      for (const det of [1, 1.006, 0.497]) {
        const c = this.ctx;
        const o = c.createOscillator(); o.type = 'sawtooth';
        const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 1400; flt.Q.value = 2;
        const g = c.createGain();
        const t = c.currentTime + at;
        o.frequency.setValueAtTime(f * det, t);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.09, t + 0.06);
        g.gain.setValueAtTime(0.09, t + dur - 0.1);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(flt); flt.connect(g); g.connect(this.sfx);
        o.start(t); o.stop(t + dur + 0.02);
      }
    }
  }

  /* ---------------------------------- coins --------------------------------- */

  coin() {
    if (!this.ctx || !this.enabled.sfx) return;
    this.tone({ dur: 0.12, gain: 0.16, from: 1318, to: 1318, type: 'triangle' });
    this.tone({ at: 0.07, dur: 0.3, gain: 0.16, from: 1760, to: 1760, type: 'triangle' });
  }

  buy() {
    if (!this.ctx || !this.enabled.sfx) return;
    this.burst({ dur: 0.04, gain: 0.3, type: 'highpass', freq: 3000, q: 0.7 });
    this.tone({ at: 0.03, dur: 0.5, gain: 0.14, from: 2093, to: 2093, type: 'triangle' });
    this.tone({ at: 0.03, dur: 0.6, gain: 0.08, from: 3136, to: 3136, type: 'sine' });
    this.tone({ at: 0.12, dur: 0.5, gain: 0.12, from: 2637, to: 2637, type: 'triangle' });
  }

  sell() {
    if (!this.ctx || !this.enabled.sfx) return;
    this.tone({ dur: 0.12, gain: 0.15, from: 1760, to: 1760, type: 'triangle' });
    this.tone({ at: 0.08, dur: 0.25, gain: 0.15, from: 1318, to: 1318, type: 'triangle' });
    this.tone({ at: 0.16, dur: 0.3, gain: 0.12, from: 1046, to: 1046, type: 'triangle' });
  }

  click() {
    if (!this.ctx || !this.enabled.sfx) return;
    this.burst({ dur: 0.03, gain: 0.18, type: 'bandpass', freq: 2400, q: 2 });
  }

  deny() {
    if (!this.ctx || !this.enabled.sfx) return;
    this.tone({ dur: 0.16, gain: 0.12, from: 140, to: 120, type: 'square' });
  }

  equip() {
    if (!this.ctx || !this.enabled.sfx) return;
    this.burst({ dur: 0.08, gain: 0.25, type: 'bandpass', freq: 1500, q: 1.5 });
    this.tone({ at: 0.02, dur: 0.15, gain: 0.08, from: 900, to: 700, type: 'triangle' });
  }

  victory() {
    if (!this.ctx || !this.enabled.sfx) return;
    [523, 659, 784, 1046].forEach((f, i) => this.tone({ at: i * 0.12, dur: 0.45, gain: 0.12, from: f, to: f, type: 'triangle' }));
  }

  defeat() {
    if (!this.ctx || !this.enabled.sfx) return;
    [392, 330, 262, 196].forEach((f, i) => this.tone({ at: i * 0.22, dur: 0.6, gain: 0.12, from: f, to: f * 0.98, type: 'triangle' }));
    this.tone({ at: 0.8, dur: 1.4, gain: 0.25, from: 80, to: 45 });
  }

  /* ---------------------------------- music --------------------------------- */

  /** War drums while a round is on, nothing between rounds. */
  setDrums(on) {
    if (!this.ctx) return;
    const d = this.drums;
    if (on === d.on) return;
    d.on = on;
    clearInterval(d.timer);
    if (!on) return;
    d.step = 0;
    d.next = this.ctx.currentTime + 0.1;
    d.timer = setInterval(() => this.schedule(), 60);
  }

  schedule() {
    const d = this.drums, c = this.ctx;
    if (!c || c.state !== 'running') return;
    const beat = 60 / d.tempo / 2;
    // low tom, mid tom, rim
    const pattern = [
      [1, 0, 0], [0, 0, 1], [0, 1, 0], [0, 0, 1], [1, 0, 0], [1, 0, 1], [0, 1, 0], [0, 0, 1],
      [1, 0, 0], [0, 0, 1], [0, 1, 0], [0, 0, 1], [1, 0, 0], [0, 1, 1], [1, 1, 0], [0, 1, 1],
    ];
    while (d.next < c.currentTime + 0.25) {
      const at = d.next - c.currentTime;
      const [lo, mid, rim] = pattern[d.step % pattern.length];
      if (lo) this.tone({ at, dur: 0.35, gain: 0.5, from: 92, to: 48, out: this.music });
      if (mid) this.tone({ at, dur: 0.22, gain: 0.32, from: 160, to: 95, out: this.music });
      if (rim) this.burst({ at, dur: 0.04, gain: 0.12, type: 'bandpass', freq: 2600, q: 3, out: this.music });
      // a low drone under every bar
      if (d.step % 16 === 0) this.tone({ at, dur: beat * 16, gain: 0.09, from: 55, to: 55, type: 'triangle', out: this.music, attack: 0.6 });
      d.step++;
      d.next += beat;
    }
  }
}
