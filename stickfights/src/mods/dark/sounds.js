/* =============================================================================
   THINGS IN THE DARK - what it sounds like, made on the spot with the game's
   own WebAudio helpers (core/audio.js): no sound files.

   Before either of the two that come through: the lights buzzing and
   cutting out. The Grasp: a moan, low and far off, rising - then a rush of
   air full of voices going past, and a thump for whoever it takes. The
   Rattle: chain, rattling, far off and nearer - then iron screaming past,
   and the wet tearing of whoever it went through. The Listener: a dry click
   of the tongue, over and over; a hiss as it goes for somebody; a crunch.
   The wardrobe: a creak of the doors, a knocking as something goes past,
   and splintering wood when the doors come off.
   ========================================================================== */
import { soundRand as rand } from '../../core/audio.js';

export function setupSounds(sb, sound, cam) {
  const ok = () => sound.ready;
  const near = (x) => sound.near(x);
  const shake = (k) => cam.shake(Math.min(0.6, k));

  // the lights going: a buzz, and the hum dropping out
  const buzz = (dur, v) => {
    for (let t = 0; t < dur; t += rand(0.12, 0.3)) {
      sound.tone('square', 118, 112, rand(0.04, 0.1), 0.025 * v, t);
      if (Math.random() < 0.4) sound.hiss(0.03, 3000, 4, 0.03 * v, 'bandpass', t + 0.02);
    }
  };

  sb.on('rushWarn', (e) => {
    if (!ok()) return;
    const d = e.dur || 3;
    buzz(d, 1);
    if (e.kind === 'grasp') {
      // a moan from a long way off, coming nearer
      sound.sweep('sawtooth', 70, 140, d, 0.05, 1.2);
      sound.sweep('sawtooth', 104, 190, d, 0.035, 1.4);
      sound.sweep('triangle', 210, 330, d * 0.9, 0.03, 2, d * 0.1);
      sound.hiss(d, 300, 0.8, 0.07, 'lowpass');
    } else {
      // chain, rattling, faster and nearer
      for (let t = 0; t < d; t += Math.max(0.035, 0.16 * (1 - t / d))) {
        sound.hiss(0.025, rand(2500, 4800), 9, (0.03 + 0.08 * (t / d)), 'bandpass', t);
        if (Math.random() < 0.25) sound.tone('square', rand(900, 1500), rand(700, 1100), 0.03, 0.015 + 0.03 * (t / d), t);
      }
      sound.sweep('square', 300, 900, d, 0.02, 3);
    }
  });

  sb.on('rushPass', (e) => {
    if (!ok()) return;
    const d = Math.min(3, e.dur || 2);
    shake(0.45);
    if (e.kind === 'grasp') {
      // a rush of air, and voices in it
      sound.hiss(d, 700, 0.5, 0.32, 'bandpass');
      sound.hiss(d, 220, 0.7, 0.22, 'lowpass');
      for (let i = 0; i < 5; i++) sound.sweep('sawtooth', rand(90, 260), rand(60, 160), d * rand(0.6, 1), 0.035, 1.5, rand(0, 0.3));
    } else {
      // iron, screaming past
      sound.hiss(d, 1800, 1.2, 0.22, 'bandpass');
      for (let t = 0; t < d; t += rand(0.04, 0.09)) sound.clang(rand(0.3, 0.9), sb.left + (sb.right - sb.left) * (t / d));
      sound.sweep('square', 1400, 500, d, 0.05, 4);
    }
  });

  sb.on('rushHit', (e) => {
    if (!ok()) return;
    const v = 0.5 + near(e.x) * 0.6;
    sound.thud(9, e.x);
    if (e.kind === 'rattle') { sound.slash(e.x); sound.hiss(0.18, 900, 1.5, 0.18 * v, 'bandpass', 0.02); }
    else sound.tone('sine', 90, 38, 0.3, 0.25 * v);
  });

  sb.on('wardrobeIn', (e) => { if (ok()) { sound.creak(e.x); sound.thud(1.2, e.x); } });
  sb.on('wardrobeOut', (e) => { if (ok()) sound.creak(e.x); });
  sb.on('wardrobeRattle', (e) => {
    if (!ok()) return;
    for (let i = 0; i < 5; i++) sound.thud(0.8 + Math.random(), e.x + i * 0.001);
  });
  sb.on('wardrobeTorn', (e) => {
    shake(0.25);
    if (!ok()) return;
    sound.splinter(e.x, true);
    sound.splinter(e.x, false);
    sound.thud(4, e.x);
  });

  // the Listener
  sb.on('lsClick', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    sound.hiss(0.012, 3600, 10, 0.12 * v, 'bandpass');
    sound.tone('square', 1900, 1500, 0.012, 0.03 * v);
    if (Math.random() < 0.5) sound.hiss(0.012, 3300, 10, 0.09 * v, 'bandpass', 0.09);
  });
  sb.on('lsCharge', (e) => {
    if (!ok()) return;
    const v = 0.4 + near(e.x) * 0.7;
    sound.hiss(0.55, 2400, 1.2, 0.16 * v, 'highpass');
    sound.sweep('sawtooth', 380, 820, 0.4, 0.04 * v, 6);
  });
  sb.on('lsGrab', (e) => { if (ok()) { sound.thud(3, e.x); sound.gasp(1.2, e.x); } });
  sb.on('lsCrush', (e) => {
    if (!ok()) return;
    const v = 0.5 + near(e.x) * 0.6;
    sound.tone('sawtooth', 70, 45, 0.6, 0.06 * v);
  });
  sb.on('lsKill', (e) => {
    shake(0.15);
    if (!ok()) return;
    const v = 0.5 + near(e.x) * 0.6;
    sound.crack(e.x);
    sound.hiss(0.14, 650, 1.1, 0.24 * v, 'bandpass', 0.01);
    sound.tone('sine', 110, 40, 0.25, 0.2 * v, 0.02);
  });
}
