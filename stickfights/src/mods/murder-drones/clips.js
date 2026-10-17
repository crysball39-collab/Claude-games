/* =============================================================================
   MURDER DRONES - the drones' own animations, keyed the same way as the
   game's (see game/clips.js and game/skeleton.js for what the numbers mean).

     dive         coming down out of the sky, wings out, knees up
     crashLand    hitting the ground: down on one knee, a fist in the floor,
                  a long moment like that, and up
     fly          swooping: tipped forward, arms swept back, legs trailing
     morph        hands up in front, and they change
     saw          a chainsaw shoved forward and held there, juddering
     tailStrike   the lean that goes with a stab of the tail over the shoulder
     droneGuard   a disassembly drone's stance with something sharp out
     showOff      looking at what their hand has just turned into
   ========================================================================== */
import { defineClip } from '../../game/clips.js';
import { P } from '../../game/skeleton.js';

const STAND = P({ t: 2, aA: [6, 12], aB: [-5, 12], lA: [4, -3], lB: [-4, -3] });

defineClip('dive', { loop: true, frames: [
  [0.14, P({ t: -6, h: -12, aA: [74, 18], aB: [58, 26], lA: [34, -64], lB: [12, -46] })],
  [0.14, P({ t: -4, h: -9, aA: [80, 14], aB: [64, 22], lA: [30, -58], lB: [14, -50] })],
] });

defineClip('crashLand', { frames: [
  [0.05, P({ t: 42, s: 8, h: 26, x: 0.06, aA: [22, 6], aB: [64, 70], lA: [100, -128], lB: [-26, -104] })],
  [0.6, P({ t: 40, s: 8, h: 22, x: 0.06, aA: [24, 6], aB: [62, 72], lA: [98, -126], lB: [-24, -102] })],
  [0.24, P({ t: 20, h: 6, aA: [18, 24], aB: [12, 34], lA: [56, -78], lB: [-8, -62] })],
  [0.22, STAND],
] });

defineClip('fly', { loop: true, frames: [
  [0.16, P({ rot: 58, t: 4, h: -46, aA: [-34, 12], aB: [-46, 10], lA: [-12, -14], lB: [-24, -8] })],
  [0.16, P({ rot: 56, t: 5, h: -44, aA: [-28, 18], aB: [-40, 14], lA: [-16, -10], lB: [-20, -12] })],
] });

defineClip('morph', { mask: 'upper', frames: [
  [0.12, P({ t: 6, h: 10, aA: [58, 92], aB: [50, 100] })],
  [0.12, P({ t: 6, h: 12, aA: [66, 100], aB: [56, 106] }), 'morph'],
  [0.14, P({ t: 4, h: 4, aA: [86, 22], aB: [72, 34] })],
  [0.16, P({ t: 3, aA: [44, 34], aB: [24, 36] })],
] });

const SAW_IN = P({ t: 13, h: 7, x: 0.07, aA: [86, 5], aB: [62, 44], lA: [30, -18], lB: [-26, -12] });
const SAW_JUDDER = P({ t: 12, h: 6, x: 0.065, aA: [89, 9], aB: [64, 42], lA: [30, -18], lB: [-26, -12] });
defineClip('saw', {
  frames: [
    [0.12, P({ t: -4, h: 0, aA: [38, 98], aB: [58, 82], lA: [22, -24], lB: [-22, -24] })],
    [0.06, SAW_IN],
    [0.12, SAW_JUDDER], [0.12, SAW_IN], [0.12, SAW_JUDDER], [0.12, SAW_IN], [0.12, SAW_JUDDER], [0.12, SAW_IN],
    [0.22, P({ t: 4, aA: [44, 58], aB: [34, 60], lA: [14, -12], lB: [-12, -12] })],
  ],
  strike: { limb: 'handA', from: 0.16, to: 0.9, power: 0.55, reach: 1.05, blade: 'saw', ticks: 0.11 },
});

defineClip('tailStrike', { frames: [
  [0.2, P({ t: -10, h: -8, aA: [34, 70], aB: [24, 66], lA: [16, -18], lB: [-16, -20] })],
  [0.1, P({ t: 20, h: 12, x: 0.05, aA: [54, 30], aB: [36, 44], lA: [26, -16], lB: [-24, -12] })],
  [0.3, P({ t: 14, h: 8, x: 0.04, aA: [40, 36], aB: [26, 44], lA: [22, -18], lB: [-20, -14] })],
  [0.2, STAND],
] });

defineClip('droneGuard', { loop: true, frames: [
  [0.4, P({ t: 9, h: 4, aA: [66, 36], aB: [50, 58], lA: [16, -18], lB: [-14, -16] })],
  [0.4, P({ t: 10, h: 5, aA: [62, 40], aB: [48, 62], lA: [16, -24], lB: [-14, -22] })],
] });

defineClip('showOff', { mask: 'upper', frames: [
  [0.3, P({ t: 2, h: 16, aA: [100, 64], aB: [12, 20] })],
  [0.7, P({ t: 2, h: 18, aA: [106, 58], aB: [12, 20] })],
  [0.3, P({ t: 2, h: 4, aA: [30, 30], aB: [6, 14] })],
] });
