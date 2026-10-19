/* =============================================================================
   MINECRAFT - what it all sounds like, made on the spot with the game's own
   WebAudio helpers (core/audio.js): no sound files here either.

   Steve says "oof" when he is hit. A bow creaks as it is drawn and twangs
   when it is let go; arrows thunk into things. Golden apples crunch, and
   there is a burp. The blocks clack. Skeletons rattle. The totem hums
   higher and higher as it rises, then the bang, and the Wither's roar; it
   spits its skulls with a dull puff, charges with a growl, its armour comes
   up with a shimmer, arrows ping off it - and when it dies it roars for a
   long time before it goes off.
   ========================================================================== */
import { armOf } from '../../game/props.js';
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

/** A growl: a few rough low voices, sliding down, wobbling. */
function growl(sound, f0, f1, dur, gain, delay = 0) {
  const c = sound.ctx, t = c.currentTime + delay;
  const out = c.createGain(), f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 900;
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(gain, t + 0.08);
  out.gain.setValueAtTime(gain, t + dur * 0.75);
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  f.connect(out);
  out.connect(sound.master);
  const lfo = c.createOscillator(), lg = c.createGain();
  lfo.frequency.value = 9;
  lg.gain.value = 0.35;
  lfo.connect(lg);
  lg.connect(out.gain);
  lfo.start(t);
  lfo.stop(t + dur + 0.05);
  for (const [k, type] of [[1, 'sawtooth'], [1.5, 'square'], [0.99, 'sawtooth']]) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0 * k, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * k), t + dur);
    o.connect(f);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

export function setupSounds(sb, sound, cam) {
  const ok = () => sound.ready;
  const near = (x) => sound.near(x);
  const shake = (x, k) => cam.shake(Math.min(0.75, k / (1 + Math.abs(x - cam.x) / 5)));

  sb.on('mcExplosion', (e) => {
    shake(e.x, 0.35 + e.power * 0.18);
    if (!ok()) return;
    const v = 0.4 + near(e.x) * 0.8, p = Math.min(2.4, e.power);
    sound.tone('sine', 70, 24, 0.5 + p * 0.25, (0.7 + p * 0.3) * v);
    sound.hiss(0.4 + p * 0.25, 420, 0.5, (0.7 + p * 0.25) * v, 'lowpass');
    // the crackle after
    for (let i = 0; i < 5; i++) sound.hiss(0.05, 1500 + rand(-400, 400), 2, 0.12 * v, 'bandpass', 0.12 + i * rand(0.05, 0.11));
  });
  sb.on('totemCharge', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    sweep(sound, 'sine', 70, 420, 3.6, 0.12 * v);
    sweep(sound, 'triangle', 140, 840, 3.6, 0.04 * v);
    sound.hiss(3.5, 3000, 4, 0.05 * v, 'bandpass', 0.1);
  });
  sb.on('witherSpawn', (e) => {
    shake(e.x, 0.8);
    if (!ok()) return;
    const v = 0.5 + near(e.x) * 0.7;
    growl(sound, 140, 55, 2.2, 0.16 * v, 0.1);
    sound.tone('sine', 55, 22, 1.4, 1.1 * v);
  });
  sb.on('witherShoot', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    sound.hiss(0.22, 600, 0.8, (e.blue ? 0.45 : 0.3) * v, 'lowpass');
    sound.tone('sine', e.blue ? 160 : 210, 70, 0.2, 0.25 * v);
  });
  sb.on('witherDashWind', (e) => {
    if (!ok()) return;
    growl(sound, 90, 150, 0.6, 0.12 * near(e.x));
  });
  sb.on('witherDash', (e) => {
    shake(e.x, 0.3);
    if (!ok()) return;
    sound.whoosh(e.x, true);
    sound.hiss(0.5, 900, 0.7, 0.35 * near(e.x), 'lowpass');
  });
  sb.on('witherRamHit', (e) => { if (ok()) sound.punch(2.4, false, e.x); });
  sb.on('witherArmor', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    for (let i = 0; i < 4; i++) sound.tone('sine', 520 + i * 260, 640 + i * 260, 0.5, 0.06 * v, i * 0.07);
    growl(sound, 120, 60, 1.2, 0.12 * v);
  });
  sb.on('witherRoar', (e) => {
    shake(e.x, 0.5);
    if (!ok()) return;
    const v = 0.5 + near(e.x) * 0.7;
    growl(sound, 170, 45, 2.6, 0.2 * v);
    sound.hiss(2.4, 300, 0.5, 0.25 * v, 'lowpass', 0.1);
  });
  sb.on('witherDeath', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    for (let i = 0; i < 5; i++) sound.tone('sine', 880 + i * 220, 900 + i * 220, 0.35, 0.05 * v, 0.6 + i * 0.08);
  });
  sb.on('armorDeflect', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    sound.tone('square', 2400 + rand(-200, 200), 1800, 0.06, 0.06 * v);
    sound.tone('sine', 3600, 3200, 0.12, 0.04 * v, 0.01);
  });
  sb.on('bowDraw', (e) => {
    if (!ok()) return;
    sound.hiss(0.7, 900, 6, 0.06 * near(e.x), 'bandpass');
    sweep(sound, 'triangle', 90, 140, 0.7, 0.03 * near(e.x));
  });
  sb.on('bowShoot', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    sound.tone('triangle', 330, 180, 0.18, 0.18 * v);
    sound.hiss(0.08, 3500, 1.5, 0.15 * v, 'highpass');
    sound.whoosh(e.x, false);
  });
  sb.on('arrowHit', (e) => {
    if (!ok()) return;
    if (e.who) sound.stab(0.9, e.x);
    else sound.thunk(e.x);
  });
  sb.on('mcCrunch', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    sound.hiss(0.07, 2200 + rand(-400, 400), 2, 0.25 * v, 'bandpass');
    sound.hiss(0.05, 900, 2, 0.15 * v, 'bandpass', 0.03);
  });
  sb.on('mcAte', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    sweep(sound, 'square', 120, 70, 0.32, 0.07 * v, 0.1);
    for (let i = 0; i < 3; i++) sound.tone('sine', 1300 + i * 330, 1500 + i * 330, 0.12, 0.05 * v, 0.3 + i * 0.06);
  });
  sb.on('mcSwap', (e) => { if (ok()) sound.tone('square', 900, 600, 0.04, 0.05 * near(e.x)); });
  sb.on('crafted', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    sound.wood(2, e.x);
    sound.tone('triangle', 520, 520, 0.08, 0.08 * v, 0.1);
    sound.tone('triangle', 780, 780, 0.12, 0.08 * v, 0.2);
  });
  sb.on('skeletonRattle', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    for (let i = 0; i < 4; i++) sound.hiss(0.03, 2600 + rand(-500, 500), 6, 0.12 * v, 'bandpass', i * rand(0.04, 0.08));
  });
  sb.on('skeletonSummoned', (e) => {
    if (!ok()) return;
    const v = near(e.x);
    sound.hiss(0.8, 700, 1, 0.25 * v, 'bandpass');
    sweep(sound, 'sine', 120, 260, 0.8, 0.06 * v);
  });
  sb.on('mobPoof', (e) => { if (ok()) sound.hiss(0.35, 800, 0.7, 0.2 * near(e.x), 'lowpass'); });
  sb.on('withered', (e) => {
    if (!ok()) return;
    sweep(sound, 'sawtooth', 300, 90, 0.5, 0.04 * near(e.x));
  });
  sb.on('hit', (e) => {
    if (!ok()) return;
    // Steve, hurt: "oof"
    if (e.who && e.who.species && e.who.species.kind === 'steve' && !e.blocked && e.power > 0.3) {
      const v = near(e.x);
      sweep(sound, 'triangle', 240, 140, 0.16, 0.16 * v);
      sound.hiss(0.12, 700, 3, 0.06 * v, 'bandpass');
    }
    const spec = armOf(e.weapon);
    if (!spec) return;
    if (e.weapon === 'diamondSword' || e.weapon === 'stoneSword') sound.chop(e.power, e.x);
    else if (e.weapon === 'arrow') { /* arrowHit covers it */ }
    else if (e.weapon === 'witherRam' || e.weapon === 'mcBlast') { /* their own noise covers it */ }
  });
}
