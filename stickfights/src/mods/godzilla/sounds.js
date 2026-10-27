/* =============================================================================
   GODZILLA - what he sounds like, made on the spot with WebAudio like every
   other sound in the game: no sound files.

   The roar is the one everybody knows, more or less: a screech that climbs
   and grinds - the rasp of something rough dragged along a string - then
   drops away into a groan, with a rumble under all of it and the city
   giving it back a moment later. His steps are booms you feel more than
   hear; a stomp is a bigger one, with the ground cracking. His breath
   builds as a crackling hum, and comes out as a roaring hiss.
   ========================================================================== */
import { soundRand as rand } from '../../core/audio.js';

/** An echo: what goes into it comes back, softer and duller, again and again. */
function echo(sound, time = 0.34, back = 0.38) {
  const c = sound.ctx;
  const d = c.createDelay(1), fb = c.createGain(), lp = c.createBiquadFilter(), out = c.createGain();
  d.delayTime.value = time;
  fb.gain.value = back;
  lp.type = 'lowpass';
  lp.frequency.value = 1400;
  out.gain.value = 0.55;
  d.connect(lp); lp.connect(fb); fb.connect(d);
  lp.connect(out); out.connect(sound.master);
  return d;
}

/**
 * The roar. `k` how loud, `pitch` how high (lower for an older, weaker one),
 * `dur` how long.
 */
function roar(sound, v, pitch = 1, dur = 2.6, weak = false) {
  const c = sound.ctx, t = c.currentTime;
  const out = c.createGain();
  const bp = c.createBiquadFilter(), peak = c.createBiquadFilter(), lp = c.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 1150 * pitch; bp.Q.value = 0.9;
  peak.type = 'peaking'; peak.frequency.value = 2500 * pitch; peak.Q.value = 2.2; peak.gain.value = 9;
  lp.type = 'lowpass'; lp.frequency.value = 4200;
  bp.connect(peak); peak.connect(lp); lp.connect(out);
  out.connect(sound.master);
  out.connect(echo(sound));
  // loud quickly, held, and the groan at the end trailing off
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.12);
  out.gain.setValueAtTime(0.5 * v, t + dur * 0.62);
  out.gain.exponentialRampToValueAtTime(0.18 * v, t + dur * 0.8);
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  // the rasp: the whole voice beating, fast
  const rasp = c.createGain();
  rasp.gain.value = 1;
  const lfo = c.createOscillator(), lg = c.createGain();
  lfo.type = 'sawtooth';
  lfo.frequency.setValueAtTime(38, t);
  lfo.frequency.linearRampToValueAtTime(52, t + dur * 0.5);
  lfo.frequency.linearRampToValueAtTime(30, t + dur);
  lg.gain.value = 0.55;
  lfo.connect(lg); lg.connect(rasp.gain);
  rasp.connect(bp);
  lfo.start(t); lfo.stop(t + dur + 0.05);
  // the voice: up into the screech, held with a wobble, and down into the groan
  const f0 = 170 * pitch, f1 = (weak ? 330 : 430) * pitch, f2 = (weak ? 120 : 210) * pitch;
  const vib = c.createOscillator(), vg = c.createGain();
  vib.frequency.value = 6.5;
  vg.gain.value = 14 * pitch;
  vib.connect(vg);
  vib.start(t); vib.stop(t + dur + 0.05);
  for (const [k, type, g] of [[1, 'sawtooth', 0.5], [1.505, 'sawtooth', 0.28], [0.497, 'square', 0.18], [2.01, 'triangle', 0.12]]) {
    const o = c.createOscillator(), og = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0 * k, t);
    o.frequency.exponentialRampToValueAtTime(f1 * k, t + dur * 0.2);
    o.frequency.setValueAtTime(f1 * k, t + dur * 0.55);
    o.frequency.exponentialRampToValueAtTime(f2 * k, t + dur * 0.95);
    vg.connect(o.frequency);
    og.gain.value = g;
    o.connect(og); og.connect(rasp);
    o.start(t); o.stop(t + dur + 0.05);
  }
  // breath through it
  const s = c.createBufferSource(), nf = c.createBiquadFilter(), ng = c.createGain();
  s.buffer = sound.noise;
  s.loop = true;
  nf.type = 'bandpass'; nf.frequency.value = 1900 * pitch; nf.Q.value = 0.8;
  ng.gain.value = 0.22;
  s.connect(nf); nf.connect(ng); ng.connect(rasp);
  s.start(t); s.stop(t + dur + 0.05);
  // and the rumble under it all
  sound.tone('sine', 62, 38, dur * 0.9, 0.5 * v);
  sound.hiss(dur * 0.8, 160, 0.7, 0.3 * v, 'lowpass');
}

/** A boom underfoot: k 1 a stomp, less a step. */
function boom(sound, v, k) {
  sound.tone('sine', 58 + k * 10, 26, 0.45 + k * 0.5, (0.45 + k * 0.6) * v);
  sound.tone('triangle', 110, 40, 0.25 + k * 0.2, 0.18 * v);
  sound.hiss(0.25 + k * 0.45, 380, 0.6, (0.25 + k * 0.4) * v, 'lowpass');
  if (k > 0.5) for (let i = 0; i < 6; i++) sound.hiss(0.03, 1400 + rand(0, 2400), 2, 0.2 * v, 'bandpass', 0.06 + i * rand(0.03, 0.07));
}

export function setupSounds(sb, sound, cam) {
  const ok = () => sound.ready;
  const near = (x) => Math.max(0.25, sound.near(x));
  // (he is too big to be quiet anywhere: what he does shakes the view wherever it is)
  const shake = (x, k) => cam.shake(Math.min(0.9, k / (1 + Math.abs(x - cam.x) / 14)));

  sb.on('gzSpawn', (e) => {
    shake(e.x, 0.6);
    // (the view backs off until all of him is in it)
    // (tall enough for him rearing up to roar)
    const tall = 19.5;
    if (cam.h / cam.ppm < tall) {
      const ppm = Math.max(cam.minPpm, cam.h / tall);
      cam.glideTo(e.x, (cam.h / 2 / ppm) * (1 - 2 * (cam.portrait ? 0.25 : 0.04)), ppm);
    }
    if (!ok()) return;
    boom(sound, near(e.x), 1);
  });
  sb.on('gzRoar', (e) => {
    shake(e.x, 0.35);
    if (!ok()) return;
    roar(sound, near(e.x), 1, 2.6);
  });
  sb.on('gzDeathRoar', (e) => {
    if (!ok()) return;
    roar(sound, near(e.x) * 0.85, 0.82, 2.4, true);
  });
  sb.on('gzStep', (e) => {
    shake(e.x, 0.12 + e.k * 0.55);
    if (!ok()) return;
    boom(sound, near(e.x), e.k);
  });
  sb.on('gzFall', (e) => {
    shake(e.x, 1);
    if (!ok()) return;
    const v = near(e.x);
    boom(sound, v, 1.4);
    sound.rubble(e.x, true);
  });
  sb.on('gzTailSwing', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    sound.sweep('bandpass', 180, 900, 0.7, 0.45 * v, 0.9);
    sound.hiss(0.6, 220, 0.7, 0.25 * v, 'lowpass');
  });
  sb.on('gzClawSwing', (e) => { if (ok()) sound.sweep('bandpass', 300, 1500, 0.35, 0.35 * near(e.x), 1.1); });
  const thump = (e) => {
    shake(e.x, 0.25);
    if (!ok()) return;
    const v = near(e.x);
    sound.tone('sine', 120, 45, 0.3, 0.7 * v);
    sound.hiss(0.18, 700, 0.8, 0.5 * v, 'lowpass');
  };
  sb.on('gzTailHit', thump);
  sb.on('gzKickHit', thump);
  sb.on('gzClawHit', (e) => { thump(e); if (ok()) sound.slash(e.x); });
  sb.on('gzGouge', (e) => { if (ok()) sound.rubble(e.x, false); });
  sb.on('gzChomp', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    sound.tone('square', 160, 60, 0.09, 0.3 * v);
    sound.hiss(0.08, 1800, 1.2, 0.45 * v, 'bandpass');
    if (e.n > 0) sound.hiss(0.14, 900, 0.8, 0.35 * v, 'lowpass', 0.03);
  });
  sb.on('gzBiteWall', (e) => { if (ok()) sound.rubble(e.x, false); });
  sb.on('gzEat', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    // the gulp
    sound.tone('sine', 140, 50, 0.4, 0.45 * v, 0.2);
    sound.hiss(0.3, 300, 0.8, 0.25 * v, 'lowpass', 0.2);
  });
  sb.on('gzCrush', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    sound.hiss(0.12, 900, 1, 0.5 * v, 'bandpass');
    sound.crack(e.x);
  });
  sb.on('gzSmash', (e) => { if (ok()) sound.splinter(e.x, true); });
  sb.on('gzGrab', (e) => { if (ok()) sound.whoosh(e.x, true); });
  sb.on('gzThrow', (e) => { if (ok()) { sound.whoosh(e.x, true); sound.sweep('bandpass', 400, 1800, 0.3, 0.3 * near(e.x), 1); } });
  sb.on('gzCharge', (e) => {
    if (!ok()) return;
    const v = near(e.x), c = sound.ctx, t = c.currentTime;
    // a hum climbing, and crackling as it does
    const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(55, t);
    o.frequency.exponentialRampToValueAtTime(220, t + 1.75);
    f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 1.5;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * v, t + 1.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    o.connect(f); f.connect(g); g.connect(sound.master);
    o.start(t); o.stop(t + 1.85);
    for (let i = 0; i < 14; i++) {
      const d = 0.15 + i * 0.11 + rand(0, 0.05);
      sound.tone('square', 2000 + rand(-600, 1400), 1500, 0.01, 0.12 * v * (0.4 + i / 14), d);
    }
  });
  sb.on('gzBreath', (e) => {
    shake(e.x, 0.3);
    if (!ok()) return;
    const v = near(e.x);
    sound.sweep('bandpass', 2600, 900, 2.5, 0.5 * v, 0.7);
    sound.hiss(2.4, 420, 0.6, 0.45 * v, 'lowpass');
    sound.tone('sawtooth', 90, 70, 2.3, 0.08 * v);
    roar(sound, v * 0.55, 1.08, 2.4);
  });
  sb.on('gzWreck', (e) => { shake(e.x, 0.4); });
}
