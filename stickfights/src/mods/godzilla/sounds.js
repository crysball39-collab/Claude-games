/* =============================================================================
   GODZILLA - what he sounds like, made on the spot with WebAudio like every
   other sound in the game: no sound files.

   The roar is the one everybody knows, more or less: a screech that climbs
   and grinds - the rasp of something rough dragged along a string - then
   drops away into a groan, with a rumble under all of it and the city
   giving it back a moment later. His steps are booms you feel more than
   hear; a stomp is a bigger one, with the ground cracking. His breath
   builds as a crackling hum, and comes out as a roaring hiss.

   Shin Godzilla's roar is lower, longer and harsher (in his second form,
   wet, and bubbling, as if through water); before the beam, the smog comes
   out with a rush, catches with a thump, and the fire draws in to a whine
   that climbs; the beam is a hum and a whine that hold as long as it does.
   He changes form in a hiss of steam, and his gills pour with a gush.
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

/** A beam's sound: a hum with a whine over it, wavering, for as long as it lasts. */
function beamHum(sound, v, dur, pitch = 1) {
  const c = sound.ctx, t = c.currentTime;
  const out = c.createGain(), bp = c.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 900 * pitch; bp.Q.value = 0.7;
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.3 * v, t + 0.08);
  out.gain.setValueAtTime(0.3 * v, t + Math.max(0.1, dur - 0.25));
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  bp.connect(out);
  out.connect(sound.master);
  const lfo = c.createOscillator(), lg = c.createGain();
  lfo.frequency.value = 11;
  lg.gain.value = 16 * pitch;
  lfo.connect(lg);
  for (const [f, type, g] of [[110, 'sawtooth', 0.5], [111.6, 'sawtooth', 0.4], [220, 'square', 0.14], [1650, 'sine', 0.13]]) {
    const o = c.createOscillator(), og = c.createGain();
    o.type = type;
    o.frequency.value = f * pitch;
    og.gain.value = g;
    lg.connect(o.frequency);
    o.connect(og);
    og.connect(bp);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  lfo.start(t);
  lfo.stop(t + dur + 0.05);
  sound.hiss(dur, 3200 * pitch, 1.2, 0.08 * v, 'bandpass');
}

/**
 * Shin Godzilla's roar: lower than the 1954 one's, longer, and harsher, with
 * a growl under it - in his second form a wet bubbling one, and in his third
 * something between.
 */
function shinRoar(sound, v, weak = false, form = 4) {
  if (form === 2) { gurgle(sound, v, weak ? 2 : 2.4); return; }
  const k = form === 3 ? 0.85 : 1;
  roar(sound, v, (weak ? 0.66 : 0.74) / k, (weak ? 2.8 : 3.3) * k, weak);
  sound.tone('sawtooth', 62, 44, (weak ? 2.4 : 3.1) * k, 0.12 * v);
  sound.hiss((weak ? 2.2 : 3) * k, 240, 0.6, 0.22 * v, 'lowpass');
  if (form === 3) bubbles(sound, v * 0.5, 2.2, 0.3);
}

/** A low noise gated on and off, fast and unevenly: bubbling, for `dur`. */
function bubbles(sound, v, dur, delay = 0) {
  const c = sound.ctx, t = c.currentTime + delay;
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), env = c.createGain();
  const lfo = c.createOscillator(), lg = c.createGain();
  s.buffer = sound.noise;
  s.loop = true;
  f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 2.5;
  g.gain.value = 0;
  lfo.type = 'square';
  lfo.frequency.setValueAtTime(14, t);
  lfo.frequency.linearRampToValueAtTime(8, t + dur);
  lg.gain.value = 0.35 * v;
  lfo.connect(lg); lg.connect(g.gain);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(1, t + 0.15);
  env.gain.setValueAtTime(1, t + dur * 0.7);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(env); env.connect(sound.master);
  s.start(t); s.stop(t + dur + 0.05);
  lfo.start(t); lfo.stop(t + dur + 0.05);
}

/** The second form's roar: low and wet, bubbling, as if through water. */
function gurgle(sound, v, dur) {
  roar(sound, v * 0.7, 0.55, dur, true);
  bubbles(sound, v, dur);
  sound.tone('sine', 70, 40, dur * 0.8, 0.3 * v);
}

const isShin = (who) => !!(who && who.gz && who.gz.kind === 'shin');
const formOf = (who) => (isShin(who) ? who.gz.form || 4 : 0);

export function setupSounds(sb, sound, cam) {
  const ok = () => sound.ready;
  const near = (x) => Math.max(0.25, sound.near(x));
  // (he is too big to be quiet anywhere: what he does shakes the view wherever it is)
  const shake = (x, k) => cam.shake(Math.min(0.9, k / (1 + Math.abs(x - cam.x) / 14)));

  // (the view backs off until all of him is in it: tall enough for him rearing up to roar - and, for one lying
  // along the ground, long enough for all of him)
  const fit = (e) => {
    const tall = e.tall || 19.5, wide = e.wide || 0;
    if (cam.h / cam.ppm >= tall && cam.w / cam.ppm >= wide) return;
    const ppm = Math.max(cam.minPpm, Math.min(cam.h / tall, wide ? cam.w / wide : Infinity, cam.ppm));
    cam.glideTo(e.x, (cam.h / 2 / ppm) * (1 - 2 * (cam.portrait ? 0.25 : 0.04)), ppm);
  };
  sb.on('gzSpawn', (e) => {
    shake(e.x, 0.6);
    fit(e);
    if (!ok()) return;
    boom(sound, near(e.x), 1);
  });
  sb.on('gzRoar', (e) => {
    shake(e.x, isShin(e.who) ? 0.45 : 0.35);
    if (!ok()) return;
    if (isShin(e.who)) shinRoar(sound, near(e.x), false, formOf(e.who));
    else roar(sound, near(e.x), 1, 2.6);
  });
  sb.on('gzDeathRoar', (e) => {
    if (!ok()) return;
    if (isShin(e.who)) shinRoar(sound, near(e.x) * 0.85, true, formOf(e.who));
    else roar(sound, near(e.x) * 0.85, 0.82, 2.4, true);
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

  // Shin Godzilla's: the light coming, the fire, the beams
  sb.on('shinCharge', (e) => {
    if (!ok()) return;
    const v = near(e.x), c = sound.ctx, t = c.currentTime, dur = e.tail ? 1.05 : e.dorsal ? 1.4 : 1.9;
    const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(e.tail ? 90 : 40, t);
    o.frequency.exponentialRampToValueAtTime(e.tail ? 360 : 180, t + dur);
    f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 1.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2 * v, t + dur * 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
    o.connect(f); f.connect(g); g.connect(sound.master);
    o.start(t); o.stop(t + dur + 0.15);
    for (let i = 0; i < 18; i++) sound.tone('square', 2400 + rand(-900, 1600), 1200, 0.012, 0.13 * v * (0.3 + i / 18), 0.1 + i * dur / 18 + rand(0, 0.04));
  });
  // the smog: a great rush of breath, low
  sb.on('shinSmog', (e) => {
    shake(e.x, 0.25);
    if (!ok()) return;
    const v = near(e.x);
    sound.hiss(1.8, 220, 0.5, 0.6 * v, 'lowpass');
    sound.sweep('bandpass', 160, 520, 1.7, 0.3 * v, 0.5);
    sound.tone('sawtooth', 48, 40, 1.7, 0.06 * v);
  });
  // it catching: a thump, and the roar of the fire after it
  sb.on('shinIgnite', (e) => {
    shake(e.x, 0.45);
    if (!ok()) return;
    const v = near(e.x);
    sound.tone('sine', 90, 34, 0.6, 0.7 * v);
    sound.hiss(0.5, 500, 0.6, 0.6 * v, 'lowpass');
    sound.hiss(1.8, 300, 0.5, 0.55 * v, 'lowpass', 0.15);
    sound.sweep('bandpass', 380, 1500, 1.6, 0.35 * v, 0.6, 0.1);
    for (let i = 0; i < 12; i++) sound.hiss(0.02, 1800 + rand(0, 2600), 2, 0.2 * v, 'bandpass', 0.15 + i * rand(0.08, 0.14));
  });
  // the fire drawn in: a whine climbing, crackling, as the beam comes
  sb.on('shinBuild', (e) => {
    shake(e.x, 0.3);
    if (!ok()) return;
    const v = near(e.x), dur = e.dur || 1.2;
    sound.sweep('bandpass', 300, 2200, dur, 0.3 * v, 4);
    sound.tone('sawtooth', 110, 440, dur, 0.1 * v);
    for (let i = 0; i < 16; i++) sound.tone('square', 2600 + rand(-800, 1600), 1400, 0.012, 0.14 * v * (0.3 + i / 16), i * dur / 16 + rand(0, 0.03));
  });
  // changing form: a long hiss of steam, and a groan inside it
  sb.on('shinChanging', (e) => {
    shake(e.x, 0.4);
    if (!ok()) return;
    const v = near(e.x);
    sound.hiss(3.4, 3800, 0.5, 0.35 * v, 'highpass');
    sound.hiss(3.2, 900, 0.6, 0.3 * v, 'bandpass', 0.2);
    sound.tone('sawtooth', 70, 46, 2.6, 0.1 * v, 0.3);
    if (formOf(e.who) <= 3) bubbles(sound, v * 0.6, 1.8, 0.2);
  });
  sb.on('shinEvolve', (e) => {
    shake(e.x, 0.7);
    fit(e);
    if (!ok()) return;
    boom(sound, near(e.x), 0.9);
  });
  // the gills: a wet gush, and the splashing
  sb.on('shinGills', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    sound.hiss(2.4, 600, 0.7, 0.4 * v, 'lowpass');
    bubbles(sound, v * 0.8, 2.4);
    for (let i = 0; i < 10; i++) sound.hiss(0.05, 1200 + rand(0, 1200), 1.5, 0.15 * v, 'bandpass', 0.3 + i * rand(0.15, 0.25));
  });
  sb.on('shinBeam', (e) => {
    shake(e.x, 0.5);
    if (!ok()) return;
    const v = near(e.x);
    sound.hiss(0.25, 2400, 0.6, 0.7 * v);
    beamHum(sound, v, e.dur || 3.8, 1);
  });
  sb.on('shinDorsal', (e) => {
    shake(e.x, 0.6);
    if (!ok()) return;
    const v = near(e.x);
    sound.hiss(0.3, 2600, 0.6, 0.6 * v);
    beamHum(sound, v * 0.8, e.dur || 4.2, 1.35);
    beamHum(sound, v * 0.6, e.dur || 4.2, 1.9);
  });
  sb.on('shinTailBeam', (e) => {
    shake(e.x, 0.3);
    if (!ok()) return;
    beamHum(sound, near(e.x) * 0.8, e.dur || 2.6, 1.6);
  });
  sb.on('shinBeamEnd', (e) => { if (ok()) sound.sweep('bandpass', 1800, 160, 0.7, 0.3 * near(e.x), 1); });
  sb.on('shinBeamHit', (e) => { if (ok()) sound.hiss(0.18, 3600, 1, 0.3 * near(e.x), 'highpass'); });
}
