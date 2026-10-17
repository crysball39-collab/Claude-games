/* =============================================================================
   MURDER DRONES - what the drones sound like, made on the spot with the
   game's own WebAudio helpers (core/audio.js): no sound files here either.

   A drone coming down out of the sky whistles, and lands with a boom. Hands
   change with a whirr and a run of clicks. A chainsaw revs and grinds, a
   laser hums, missiles hiss away and go off with a thump you feel, the tail
   cracks like a whip and the acid fizzes. The railgun whines as it charges
   and then goes off like the end of the world.
   ========================================================================== */
import { clamp, rand } from '../../core/util.js';
import { armOf } from '../../game/props.js';

function sweep(sound, type, f0, f1, dur, gain, delay = 0) {
  const c = sound.ctx, t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + Math.min(0.05, dur * 0.3));
  g.gain.setValueAtTime(Math.max(0.0002, gain), t + dur * 0.8);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(sound.master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** A buzzing engine note, rising, for a chainsaw going in. */
function rev(sound, dur, gain) {
  const c = sound.ctx, t = c.currentTime;
  const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain(), f = c.createBiquadFilter();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(70, t);
  o.frequency.exponentialRampToValueAtTime(150, t + dur * 0.4);
  lfo.frequency.value = 28;
  lg.gain.value = 18;
  lfo.connect(lg);
  lg.connect(o.frequency);
  f.type = 'lowpass';
  f.frequency.value = 1400;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.05);
  g.gain.setValueAtTime(gain, t + dur * 0.85);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); f.connect(g); g.connect(sound.master);
  o.start(t); lfo.start(t);
  o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
}

const OURS = new Set(['sword', 'claw', 'chainsaw', 'gunArm', 'laser', 'missile', 'blast', 'needle', 'rail']);

export function setupSounds(sb, sound, cam) {
  const ok = () => sound.ready;
  const near = (x) => sound.near(x);
  const shake = (x, k) => cam.shake(Math.min(0.7, k / (1 + Math.abs(x - cam.x) / 5)));

  sb.on('droneIncoming', (e) => {
    if (!ok()) return;
    sweep(sound, 'sine', 1900, 500, 0.6, 0.08 * near(e.x));
  });
  sb.on('crashLand', (e) => {
    shake(e.x, 0.55);
    if (!ok()) return;
    const v = near(e.x);
    sound.tone('sine', 80, 28, 0.7, 1.2 * v);
    sound.hiss(0.5, 300, 0.7, 0.9 * v, 'lowpass');
    sound.hiss(0.25, 2400, 1.2, 0.35 * v, 'bandpass', 0.03);
    for (let i = 0; i < 4; i++) sound.hiss(0.05, 3000 + i * 400, 3, 0.12 * v, 'bandpass', 0.08 + i * 0.05);
  });
  sb.on('takeoff', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    sound.hiss(0.45, 600, 0.6, 0.35 * v, 'lowpass');
    sweep(sound, 'triangle', 180, 420, 0.4, 0.05 * v);
  });
  sb.on('morph', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    sweep(sound, 'square', 300, 900, 0.18, 0.05 * v);
    for (let i = 0; i < 4; i++) sound.tone('square', 1500 + i * 220, 1100, 0.025, 0.06 * v, 0.05 + i * 0.045);
    sound.hiss(0.12, 4000, 2, 0.1 * v, 'bandpass', 0.02);
  });
  sb.on('swing', (e) => {
    if (e.kind === 'saw' && ok()) rev(sound, 1.0, 0.07 * near(e.who.pos.x));
  });
  sb.on('sawGrind', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    sound.hiss(0.1, 1900 + rand(-300, 300), 2.5, 0.35 * v);
    sound.tone('sawtooth', 220, 160, 0.08, 0.06 * v);
  });
  sb.on('hit', (e) => {
    // blades that are hands make blade noises (the game's own handler leaves them to us -
    // and another mod's weapons to that mod)
    const spec = armOf(e.weapon);
    if (!spec || !OURS.has(e.weapon) || !ok()) return;
    if (e.weapon === 'sword' || e.weapon === 'chainsaw') sound.chop(e.power, e.x);
    else if (e.weapon === 'claw') { sound.slash(e.x); sound.stab(e.power * 0.6, e.x); }
    else if (e.weapon === 'needle') sound.stab(1.4, e.x);
    else if (e.weapon === 'rail') sound.bulletHit('stickman', e.x);
    else if (e.weapon === 'blast' || e.weapon === 'laser') { /* their own noise covers it */ }
    else sound.punch(e.power, true, e.x, e.blocked);
  });
  sb.on('laser', (e) => {
    if (!ok()) return;
    const v = near(e.x), d = e.dur || 1;
    sweep(sound, 'sawtooth', 880, 960, d, 0.04 * v);
    sweep(sound, 'sine', 1760, 1700, d, 0.05 * v);
    sound.hiss(d, 5000, 1.5, 0.06 * v, 'bandpass');
  });
  sb.on('missile', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    sound.hiss(0.5, 1200, 0.8, 0.3 * v, 'bandpass');
    sweep(sound, 'sine', 300, 120, 0.3, 0.08 * v);
  });
  sb.on('explosion', (e) => {
    shake(e.x, 0.6);
    if (!ok()) return;
    const v = 0.4 + near(e.x) * 0.8;
    sound.tone('sine', 90, 25, 0.9, 1.3 * v);
    sound.hiss(0.7, 500, 0.5, 1.1 * v, 'lowpass');
    sound.hiss(0.18, 2600, 0.8, 0.5 * v);
    for (const [d, k] of [[0.18, 0.3], [0.38, 0.15]]) sound.hiss(0.3, 400, 0.5, k * v, 'lowpass', d);
  });
  sb.on('railCharge', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    sweep(sound, 'sine', 220, 1900, 0.9, 0.09 * v);
    sweep(sound, 'triangle', 440, 3800, 0.9, 0.03 * v);
  });
  sb.on('railShot', (e) => {
    shake(e.x, 0.7);
    if (!ok()) return;
    const v = 0.45 + near(e.x) * 0.8;
    sound.hiss(0.08, 5000, 0.5, 1.2 * v, 'highpass');
    sound.tone('square', 3200, 90, 0.22, 0.25 * v);
    sound.tone('sine', 120, 30, 0.8, 1.3 * v);
    sound.hiss(0.6, 700, 0.6, 0.8 * v, 'lowpass', 0.02);
    for (const [d, k] of [[0.15, 0.35], [0.32, 0.18], [0.55, 0.08]]) sound.hiss(0.2, 900, 0.5, k * v, 'lowpass', d);
  });
  sb.on('tailStrike', (e) => {
    if (ok()) sound.whoosh(e.x, true);
  });
  sb.on('tailHit', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    sound.hiss(0.05, 6000, 2, 0.3 * v, 'highpass');
    sound.hiss(0.35, 3500, 1.2, 0.15 * v, 'bandpass', 0.05);
  });
  sb.on('acidHiss', (e) => {
    if (!ok()) return;
    sound.hiss(clamp(rand(0.2, 0.4), 0.2, 0.4), 6500, 1.5, 0.08 * near(e.x), 'highpass');
  });
  sb.on('regrow', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    for (let i = 0; i < 6; i++) sound.tone('sine', 900 + i * 260, 1100 + i * 260, 0.1, 0.05 * v, i * 0.06);
  });
}
