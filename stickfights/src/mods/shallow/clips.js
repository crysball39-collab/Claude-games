/* =============================================================================
   SHALLOW - its own animations, keyed the way the game's are (see
   game/clips.js and game/skeleton.js for what the numbers mean). Where it
   reaches for something, its arms are put there by hand (species.js, the
   pose hook): these are what the rest of the body does meanwhile.

   The disguise
     shallowSplit   something wrong inside: doubled over, the head snapping
                    back and forth, arched back, arms flung out - and it tears
     shallowTwitch  the head jerks, once or twice, at an angle a neck should
                    not go to
   The thing
     shallowRise    unfolding up out of the skin, a long stretch at the top
     shallowLunge   down and in, the arm going out for them (the legs keep running)
     shallowStoopGrab  bent right down, for somebody on the floor
     shallowRoar    head back, everything open
     shallowRip     feet set wide, leaning back into the pull - and the tear
     shallowBite    rearing back, then the head snapping forward
     shallowPull    something yanked out, the whole body going back with it
     shallowStoop   bent right over something on the floor
     shallowSlump   folding down small, to go in
   ========================================================================== */
import { defineClip } from '../../game/clips.js';
import { P } from '../../game/skeleton.js';

export const STOOP = P({ t: 62, h: -20, aA: [60, 20], aB: [50, 24], lA: [72, -96], lB: [52, -84] });

defineClip('shallowSplit', { frames: [
  [0.12, P({ t: 20, h: 28, aA: [34, 112], aB: [28, 118], lA: [14, -18], lB: [-10, -16] })],
  [0.07, P({ t: 12, h: -32, s: -8, aA: [42, 104], aB: [36, 110], lA: [12, -16], lB: [-10, -14] })],
  [0.1, P({ t: 24, h: 38, s: 12, aA: [26, 120], aB: [22, 124], lA: [18, -24], lB: [-8, -20] })],
  [0.07, P({ t: 8, h: -24, s: -14, aA: [50, 96], aB: [44, 100], lA: [12, -14], lB: [-12, -12] })],
  [0.18, P({ t: 28, h: 44, aA: [12, 34], aB: [6, 30], lA: [26, -32], lB: [-16, -26] })],
  [0.07, P({ t: 16, h: -46, s: -10, aA: [74, 12], aB: [64, 14], lA: [16, -18], lB: [-14, -16] })],
  [0.1, P({ t: 30, h: 40, s: 10, aA: [20, 60], aB: [14, 56], lA: [28, -36], lB: [-16, -28] })],
  [0.22, P({ t: -16, h: -58, s: -12, aA: [124, 18], aB: [114, 24], lA: [12, -14], lB: [-14, -10] }), 'burst'],
  [0.2, P({ t: -14, h: -54, s: -12, aA: [126, 16], aB: [116, 22], lA: [12, -14], lB: [-14, -10] })],
] });

defineClip('shallowTwitch', { mask: 'upper', frames: [
  [0.05, P({ t: 4, h: 28, s: 9, aA: [10, 14], aB: [-6, 12] })],
  [0.05, P({ t: 2, h: -16, s: -4, aA: [12, 12], aB: [-8, 14] })],
  [0.06, P({ t: 5, h: 38, s: 6, aA: [9, 16], aB: [-7, 12] })],
  [0.34, P({ t: 3, h: 4, aA: [9, 12], aB: [-8, 12] })],
] });

defineClip('shallowRise', { frames: [
  [0.01, P({ t: 74, h: 34, aA: [12, 44], aB: [2, 46], lA: [112, -142], lB: [102, -138] })],
  [0.34, P({ t: 58, h: 24, aA: [28, 34], aB: [18, 34], lA: [96, -122], lB: [86, -116] })],
  [0.38, P({ t: 32, h: -6, aA: [58, 32], aB: [48, 32], lA: [52, -72], lB: [40, -62] })],
  [0.36, P({ t: 2, h: -42, s: -8, aA: [138, 24], aB: [126, 28], lA: [10, -10], lB: [-6, -8] })],
  [0.32, P({ t: 16, h: 8, aA: [22, 18], aB: [10, 18], lA: [8, -8], lB: [-8, -8] })],
] });

defineClip('shallowLunge', { mask: 'upper', frames: [
  [0.12, P({ t: 28, h: -8, aA: [40, 30], aB: [20, 40], lA: [40, -56], lB: [-10, -34] })],
  [0.12, P({ t: 42, h: -18, x: 0.12, aA: [96, 6], aB: [30, 30], lA: [52, -46], lB: [-30, -10] }), 'seize'],
  [0.28, P({ t: 20, h: -4, aA: [70, 30], aB: [16, 24], lA: [14, -14], lB: [-12, -10] })],
] });

defineClip('shallowStoopGrab', { frames: [
  [0.24, P({ t: 58, h: -24, aA: [70, 10], aB: [40, 30], lA: [70, -92], lB: [44, -76] })],
  [0.16, P({ t: 64, h: -26, x: 0.06, aA: [80, 4], aB: [44, 30], lA: [76, -98], lB: [48, -80] }), 'seize'],
  [0.32, P({ t: 24, h: -4, aA: [70, 30], aB: [16, 24], lA: [16, -16], lB: [-12, -10] })],
] });

defineClip('shallowRoar', { mask: 'upper', frames: [
  [0.14, P({ t: -6, h: -34, s: -10, aA: [60, 40], aB: [52, 46] })],
  [0.7, P({ t: -10, h: -42, s: -12, aA: [70, 36], aB: [62, 40] })],
  [0.2, P({ t: 14, h: 8, aA: [24, 18], aB: [12, 18] })],
] });

defineClip('shallowRip', { frames: [
  [0.45, P({ t: 14, h: 0, aA: [60, 30], aB: [40, 40], lA: [22, -22], lB: [-20, -14] })],
  [0.35, P({ t: 4, h: -10, aA: [70, 30], aB: [50, 40], lA: [34, -26], lB: [-30, -14] })],
  [0.22, P({ t: -14, h: -30, s: -8, aA: [100, 20], aB: [30, 40], lA: [36, -24], lB: [-34, -10] }), 'tear'],
  [0.58, P({ t: -8, h: -36, s: -10, aA: [110, 20], aB: [20, 30], lA: [32, -22], lB: [-30, -12] })],
] });

defineClip('shallowBite', { mask: 'upper', frames: [
  [0.2, P({ t: -6, h: -24, s: -6, aA: [70, 40], aB: [30, 40] })],
  [0.09, P({ t: 16, h: 24, s: 6, aA: [74, 44], aB: [34, 40] }), 'chomp'],
  [0.31, P({ t: 8, h: 8, aA: [72, 42], aB: [32, 40] })],
] });

defineClip('shallowPull', { frames: [
  [0.2, P({ t: 18, h: 6, aA: [70, 30], aB: [60, 30], lA: [24, -24], lB: [-18, -14] })],
  [0.14, P({ t: -10, h: -16, aA: [74, 30], aB: [110, 20], lA: [30, -20], lB: [-28, -10] }), 'yank'],
  [0.5, P({ t: -4, h: -10, aA: [72, 30], aB: [100, 24], lA: [26, -20], lB: [-24, -12] })],
] });

defineClip('shallowStoop', { loop: true, frames: [
  [0.5, STOOP],
  [0.5, P({ t: 64, h: -22, aA: [62, 22], aB: [52, 26], lA: [74, -98], lB: [54, -86], lift: -0.01 })],
] });

defineClip('shallowSlump', { frames: [
  [0.3, P({ t: 70, h: 10, aA: [40, 40], aB: [30, 40], lA: [100, -128], lB: [88, -118] })],
  [1.4, P({ t: 80, h: 30, aA: [20, 50], aB: [10, 50], lA: [118, -146], lB: [108, -140] })],
] });
