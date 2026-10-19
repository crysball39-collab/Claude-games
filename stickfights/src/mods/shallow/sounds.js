/* =============================================================================
   SHALLOW - what it sounds like, made on the spot with the game's own
   WebAudio helpers (core/audio.js): no sound files.

   A click in the neck when the face slips. Crackling as the skin splits, a
   wet tear when it comes out, and a growl that keeps going down. Its laugh
   is a few low barks. A grab lands with a thud; a body tearing is wet, and
   crunches; so does a bite, and a swallow goes down after it. A claw down a
   back is a slash; bones come out with a rattle; insides land with a slap.
   Going in, it is wet for a long time, and then a small click as the skin
   closes behind it.
   ========================================================================== */
import { soundRand as rand } from '../../core/audio.js';

function sweep(sound, type, f0, f1, dur, gain, delay = 0) {
  const c = sound.ctx, t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + Math.min(0.06, dur * 0.3));
  g.gain.setValueAtTime(Math.max(0.0002, gain), t + dur * 0.8);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(sound.master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** A growl: a few rough low voices, sliding, wobbling. */
function growl(sound, f0, f1, dur, gain, delay = 0) {
  const c = sound.ctx, t = c.currentTime + delay;
  const out = c.createGain(), f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 800;
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(gain, t + 0.06);
  out.gain.setValueAtTime(gain, t + dur * 0.75);
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  f.connect(out);
  out.connect(sound.master);
  const lfo = c.createOscillator(), lg = c.createGain();
  lfo.frequency.value = 13;
  lg.gain.value = 0.4;
  lfo.connect(lg);
  lg.connect(out.gain);
  lfo.start(t);
  lfo.stop(t + dur + 0.05);
  for (const [k, type] of [[1, 'sawtooth'], [1.49, 'square'], [0.51, 'sawtooth']]) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0 * k, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * k), t + dur);
    o.connect(f);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

/** Something wet: low, soft noise, with a little squelch in it. */
function wet(sound, dur, gain, delay = 0) {
  sound.hiss(dur, 520 + rand(-120, 120), 1.3, gain, 'lowpass', delay);
  sound.hiss(dur * 0.6, 1500 + rand(-300, 300), 3, gain * 0.35, 'bandpass', delay + 0.02);
}

/** Bone giving: a few sharp cracks close together. */
function crunch(sound, v, delay = 0) {
  for (let i = 0; i < 5; i++) sound.hiss(0.035, 2300 + rand(-700, 700), 5, 0.2 * v, 'bandpass', delay + i * rand(0.018, 0.045));
}

export function setupSounds(sb, sound, cam) {
  const ok = () => sound.ready;
  const near = (x) => sound.near(x);
  const shake = (x, k) => cam.shake(Math.min(0.75, k / (1 + Math.abs(x - cam.x) / 5)));

  sb.on('shallowTwitch', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    sound.hiss(0.04, 3200, 7, 0.08 * v, 'bandpass');
    sound.tone('square', 95, 60, 0.035, 0.03 * v);
  });
  sb.on('shallowCrack', (e) => {
    shake(e.x, 0.15);
    if (!ok()) return;
    const v = near(e.x);
    for (let i = 0; i < 10; i++) sound.hiss(0.03, 2600 + rand(-900, 900), 7, 0.14 * v, 'bandpass', i * rand(0.07, 0.13));
    growl(sound, 60, 105, 1.2, 0.07 * v, 0.2);
  });
  sb.on('shallowEmerge', (e) => {
    shake(e.x, 0.6);
    if (!ok()) return;
    const v = 0.5 + near(e.x) * 0.7;
    wet(sound, 0.7, 0.45 * v);
    crunch(sound, v * 0.8, 0.05);
    sound.tone('sine', 62, 28, 0.9, 0.55 * v);
    growl(sound, 125, 48, 1.8, 0.17 * v, 0.3);
  });
  sb.on('shallowRoar', (e) => {
    shake(e.x, 0.35);
    if (!ok()) return;
    const v = 0.5 + near(e.x) * 0.6;
    growl(sound, 150, 52, 1.3, 0.2 * v);
    sound.hiss(1.1, 420, 0.6, 0.16 * v, 'lowpass', 0.05);
  });
  sb.on('shallowLaugh', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    for (let i = 0; i < 4; i++) growl(sound, 118 - i * 7, 92 - i * 7, 0.13, 0.11 * v, i * 0.17);
  });
  sb.on('shallowLunge', (e) => { if (ok()) sound.whoosh(e.x, true); });
  sb.on('shallowSeize', (e) => {
    if (!ok()) return;
    sound.thud(3, e.x);
    sound.hiss(0.12, 900, 1, 0.2 * near(e.x), 'lowpass');
  });
  sb.on('shallowStrain', (e) => {
    if (!ok()) return;
    sound.hiss(0.14, 480 + rand(-100, 100), 2, 0.12 * near(e.x), 'bandpass');
  });
  sb.on('shallowRip', (e) => {
    shake(e.x, 0.5);
    if (!ok()) return;
    const v = 0.6 + near(e.x) * 0.6;
    wet(sound, 0.55, 0.5 * v);
    crunch(sound, v, 0.02);
    sound.sever(e.x);
    sound.tone('sine', 90, 38, 0.3, 0.4 * v);
  });
  sb.on('shallowBite', (e) => {
    shake(e.x, 0.12);
    if (!ok()) return;
    const v = near(e.x);
    crunch(sound, v * 1.2);
    wet(sound, 0.25, 0.3 * v, 0.02);
    sound.tone('square', 140, 70, 0.06, 0.08 * v);
  });
  sb.on('shallowGulp', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    sweep(sound, 'sine', 180, 60, 0.35, 0.25 * v);
    sweep(sound, 'triangle', 120, 48, 0.4, 0.1 * v, 0.3);
  });
  sb.on('shallowCut', (e) => {
    if (!ok()) return;
    sound.slash(e.x);
    wet(sound, 0.45, 0.25 * near(e.x), 0.05);
  });
  sb.on('shallowBones', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    crunch(sound, v);
    wet(sound, 0.6, 0.35 * v);
    sound.rattle(e.x);
  });
  sb.on('shallowOrgan', (e) => { if (ok()) wet(sound, 0.22, 0.3 * near(e.x)); });
  sb.on('shallowSplat', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    sound.hiss(0.1, 700, 1.2, 0.25 * v, 'lowpass');
    sound.tone('sine', 120, 60, 0.08, 0.15 * v);
  });
  sb.on('shallowEnter', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    wet(sound, 1.6, 0.25 * v);
    sweep(sound, 'sawtooth', 70, 140, 1.6, 0.03 * v);
  });
  sb.on('shallowTook', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    sound.tone('sine', 300, 180, 0.12, 0.08 * v, 0.05);
    sound.hiss(0.08, 2600, 4, 0.08 * v, 'bandpass', 0.05);
  });
  sb.on('shallowRegrow', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    wet(sound, 0.8, 0.22 * v);
    crunch(sound, v * 0.6, 0.3);
  });
  sb.on('shallowDied', (e) => {
    shake(e.x, 0.4);
    if (!ok()) return;
    const v = 0.5 + near(e.x) * 0.6;
    growl(sound, 160, 38, 2.4, 0.18 * v);
    sound.hiss(2.6, 500, 0.6, 0.16 * v, 'lowpass', 0.4);
  });
}
