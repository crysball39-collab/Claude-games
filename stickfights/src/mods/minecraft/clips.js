/* =============================================================================
   MINECRAFT - its own animations, keyed the same way as the game's (see
   game/clips.js and game/skeleton.js for what the numbers mean).

     mcEat         a golden apple to the mouth: four bites, and it is gone
     mcSwap        sword away, bow out (or the other way)
     mcSummoned    a wither skeleton standing up out of the soul fire
     witherFloat   the Wither, hanging in the air (its joints are moved to
                   where its parts really are: this is only roughly the shape)
   ========================================================================== */
import { defineClip } from '../../game/clips.js';
import { P } from '../../game/skeleton.js';

const STAND = P({ t: 2, aA: [6, 12], aB: [-5, 12], lA: [4, -3], lB: [-4, -3] });
const BITE = P({ t: 6, h: 8, aA: [58, 112], aB: [-4, 14] });
const CHEW = P({ t: 6, h: 2, aA: [52, 104], aB: [-4, 14] });

defineClip('mcEat', { mask: 'upper', frames: [
  [0.2, P({ t: 4, h: 4, aA: [40, 80], aB: [-4, 14] })],
  [0.2, BITE, 'crunch'], [0.2, CHEW],
  [0.2, BITE, 'crunch'], [0.2, CHEW],
  [0.2, BITE, 'crunch'], [0.2, CHEW],
  [0.2, BITE, 'crunch'],
  [0.3, P({ t: 2, h: -4, aA: [20, 30], aB: [-4, 14] }), 'ate'],
  [0.2, STAND],
] });

defineClip('mcSwap', { mask: 'upper', frames: [
  [0.1, P({ t: 4, aA: [-20, 30], aB: [-10, 20] })],
  [0.1, P({ t: 4, aA: [-28, 34], aB: [-10, 20] }), 'swap'],
  [0.14, P({ t: 4, aA: [40, 30], aB: [-6, 16] })],
  [0.12, STAND],
] });

defineClip('mcSummoned', { frames: [
  [0.05, P({ t: 50, s: 10, h: 30, aA: [30, 20], aB: [24, 30], lA: [96, -130], lB: [-10, -120] })],
  [0.5, P({ t: 46, s: 8, h: 26, aA: [34, 20], aB: [28, 30], lA: [94, -126], lB: [-8, -118] })],
  [0.3, P({ t: 18, h: 6, aA: [22, 30], aB: [16, 34], lA: [40, -60], lB: [-8, -40] })],
  [0.25, STAND],
] });

defineClip('witherFloat', { loop: true, frames: [
  [0.8, P({ t: 0, aA: [90, 0], aB: [90, 0], lA: [6, -8], lB: [-6, -8] })],
  [0.8, P({ t: 2, aA: [88, 2], aB: [92, -2], lA: [4, -10], lB: [-4, -10] })],
] });
