/* =============================================================================
   Every animation in the game, keyed by hand, frame by frame.

   A clip is a list of frames. Each frame is a pose and how long it lasts; in
   that time the body moves from that frame's pose to the next one's. The last
   frame of a clip that does not loop is a hold. Walking and running are
   sampled through a spline so a cycle never jerks at a key; everything else
   eases into each key, so a punch snaps out and settles. With Frames turned on
   in the settings, nothing is in-between at all: each key is held for its
   time and then swapped for the next, like a flipbook.

   A frame can carry an event - "grab" where the hand closes on something,
   "release" where a throw lets go, "thud" where a falling body lands - and a
   strike says which hand or foot is live, and when.

   See skeleton.js for what the numbers in a pose mean.
   ========================================================================== */
import { P, mirror, tweak, POSE_KEYS, copyPose } from './skeleton.js';
import { lerp, lerpAngle, smooth } from '../core/util.js';

export const CLIPS = {};

/** For a mod: an animation of its own, defined the same way as these. */
export function defineClip(name, def) { clip(name, def); }

/**
 * @param {string} name
 * @param {object} def  { frames: [[seconds, pose, event?], ...], loop, interp, strike, mask }
 */
function clip(name, def) {
  const frames = def.frames.map(([d, p, ev]) => ({ d, p, ev: ev || null, start: 0 }));
  let t = 0;
  for (const f of frames) { f.start = t; t += f.d; }
  CLIPS[name] = {
    name,
    loop: !!def.loop,
    frames,
    duration: t,
    interp: def.interp || (def.loop ? 'spline' : 'ease'),
    strike: def.strike || null,
    mask: def.mask || null,
  };
}

/* -------------------------------------------------------------------------- */
/*                               standing about                               */
/* -------------------------------------------------------------------------- */

export const STAND = P({ t: 2, aA: [6, 12], aB: [-5, 12], lA: [4, -3], lB: [-4, -3] });

clip('idle', { loop: true, frames: [
  [1.2, P({ t: 2, h: 0, aA: [9, 12], aB: [-8, 12], lA: [4, -2], lB: [-4, -2] })],
  [1.2, P({ t: 3.5, h: -2, aA: [11, 16], aB: [-6, 15], lA: [4, -3], lB: [-4, -3], lift: -0.006 })],
] });

clip('idleHappy', { loop: true, frames: [
  [0.38, P({ t: 0, h: -5, aA: [10, 18], aB: [-6, 18], lA: [5, -4], lB: [-5, -4] })],
  [0.38, P({ t: 2, h: -1, aA: [6, 26], aB: [-2, 26], lA: [5, -14], lB: [-5, -14] })],
] });

clip('idleSad', { loop: true, frames: [
  [1.6, P({ t: 12, h: 24, aA: [2, 4], aB: [-2, 6], lA: [3, -3], lB: [-3, -3] })],
  [1.6, P({ t: 14, h: 28, aA: [3, 5], aB: [-1, 7], lA: [3, -5], lB: [-3, -5] })],
] });

clip('idleAngry', { loop: true, frames: [
  [0.5, P({ t: -1, h: 6, aA: [14, 45], aB: [-8, 45], lA: [9, -5], lB: [-9, -5] })],
  [0.5, P({ t: 0, h: 8, aA: [16, 52], aB: [-6, 52], lA: [9, -7], lB: [-9, -7] })],
] });

// trembling: the two keys are close together and very quick
clip('idleScared', { loop: true, frames: [
  [0.09, P({ t: 12, h: 6, aA: [28, 118], aB: [22, 124], lA: [10, -24], lB: [-6, -24] })],
  [0.09, P({ t: 13, h: 8, aA: [30, 122], aB: [24, 120], lA: [10, -26], lB: [-6, -22] })],
] });

clip('idleHurt', { loop: true, frames: [
  [0.8, P({ t: 16, h: 12, aA: [28, 100], aB: [18, 96], lA: [7, -12], lB: [-6, -9] })],
  [0.8, P({ t: 18, h: 14, aA: [30, 104], aB: [20, 100], lA: [7, -14], lB: [-6, -11] })],
] });

// chatting: the hands talk
clip('talk', { loop: true, frames: [
  [0.4, P({ t: 2, h: -2, aA: [30, 70], aB: [-4, 14] })],
  [0.35, P({ t: 3, h: 2, aA: [44, 92], aB: [-4, 14] })],
  [0.4, P({ t: 2, h: -3, aA: [24, 60], aB: [10, 50] })],
  [0.35, P({ t: 3, h: 1, aA: [36, 84], aB: [-2, 20] })],
] });

/* -------------------------------------------------------------------------- */
/*                                  getting about                             */
/* -------------------------------------------------------------------------- */

const W0 = P({ t: 4, aA: [-20, 18], aB: [22, 22], lA: [26, -6], lB: [-20, -22] });
const W1 = P({ t: 3, h: 1, aA: [-2, 14], aB: [4, 16], lA: [2, -8], lB: [14, -58] });
clip('walk', { loop: true, frames: [[0.21, W0], [0.21, W1], [0.21, mirror(W0)], [0.21, mirror(W1)]] });

const R0 = P({ t: 14, h: -4, aA: [-50, 100], aB: [60, 95], lA: [38, -14], lB: [-30, -60] });
const R1 = P({ t: 12, h: -2, aA: [-10, 95], aB: [20, 95], lA: [-8, -20], lB: [52, -105], lift: 0.05 });
clip('run', { loop: true, frames: [[0.13, R0], [0.13, R1], [0.13, mirror(R0)], [0.13, mirror(R1)]] });

// running away: arms up, the way people in cartoons run from things
const F0 = P({ t: 16, h: -10, aA: [140, 30], aB: [100, 40], lA: [38, -14], lB: [-30, -60] });
const F1 = P({ t: 14, h: -8, aA: [110, 40], aB: [150, 30], lA: [-8, -20], lB: [52, -105], lift: 0.05 });
clip('runScared', { loop: true, frames: [[0.13, F0], [0.13, F1], [0.13, mirror(F0)], [0.13, mirror(F1)]] });

// shuffling forward or back with the fists up
const S0 = P({ t: 8, h: 4, aA: [40, 118], aB: [56, 108], lA: [30, -20], lB: [-16, -30] });
const S1 = P({ t: 8, h: 4, aA: [40, 118], aB: [56, 108], lA: [14, -26], lB: [-6, -40], lift: 0.02 });
clip('shuffle', { loop: true, frames: [[0.16, S0], [0.16, S1]] });

// both legs gone: dragging along on the elbows
clip('crawl', { loop: true, frames: [
  [0.45, P({ rot: 80, t: 0, h: -30, aA: [168, 30], aB: [100, 80], lA: [-4, -10], lB: [6, -25] })],
  [0.45, P({ rot: 80, t: 0, h: -30, aA: [100, 80], aB: [168, 30], lA: [6, -25], lB: [-4, -10] })],
] });

/* -------------------------------------------------------------------------- */
/*                                   in the air                               */
/* -------------------------------------------------------------------------- */

clip('jumpCrouch', { frames: [
  [0.09, P({ t: 18, h: 6, aA: [-30, 30], aB: [-24, 30], lA: [44, -86], lB: [32, -84] })],
] });

clip('rise', { loop: true, frames: [
  [0.3, P({ t: 4, h: -8, aA: [150, 20], aB: [128, 30], lA: [28, -44], lB: [-8, -28] })],
  [0.3, P({ t: 5, h: -6, aA: [140, 26], aB: [120, 36], lA: [30, -50], lB: [-6, -32] })],
] });

clip('fall', { loop: true, frames: [
  [0.2, P({ t: 2, h: 2, aA: [115, 20], aB: [80, 30], lA: [16, -34], lB: [-8, -22] })],
  [0.2, P({ t: 3, h: 0, aA: [100, 24], aB: [92, 26], lA: [12, -26], lB: [-4, -30] })],
] });

clip('land', { frames: [
  [0.1, P({ t: 22, h: 8, aA: [24, 40], aB: [14, 40], lA: [42, -76], lB: [30, -74] })],
  [0.16, STAND],
] });

// thrown, and awake enough to mind: windmilling
clip('flail', { loop: true, frames: [
  [0.1, P({ t: -10, h: -12, aA: [150, 30], aB: [40, 60], lA: [40, -52], lB: [-20, -30] })],
  [0.1, P({ t: -8, h: -10, aA: [60, 60], aB: [160, 20], lA: [-10, -20], lB: [50, -70] })],
] });

// thrown and not awake: limp, while the body turns over
clip('tumble', { loop: true, frames: [
  [0.5, P({ t: 0, h: 10, aA: [100, 20], aB: [70, 30], lA: [20, -24], lB: [-10, -16] })],
  [0.5, P({ t: 4, h: 14, aA: [92, 30], aB: [80, 20], lA: [14, -30], lB: [-6, -12] })],
] });

// held up by the hand: kicking and flailing...
clip('dangle', { loop: true, frames: [
  [0.13, P({ t: 0, h: -8, aA: [124, 40], aB: [64, 30], lA: [32, -64], lB: [-18, -12] })],
  [0.13, P({ t: 2, h: -6, aA: [72, 24], aB: [132, 50], lA: [-12, -22], lB: [40, -74] })],
] });

// ...or just hanging there
clip('dangleLimp', { loop: true, frames: [
  [1, P({ t: 0, h: 40, aA: [2, 4], aB: [-2, 6], lA: [2, -3], lB: [-2, -6] })],
  [1, P({ t: 1, h: 42, aA: [3, 6], aB: [-1, 8], lA: [2, -4], lB: [-2, -8] })],
] });

/* -------------------------------------------------------------------------- */
/*                                   fighting                                 */
/* -------------------------------------------------------------------------- */

export const GUARD = P({ t: 8, h: 4, aA: [40, 118], aB: [56, 108], lA: [22, -24], lB: [-20, -26] });

clip('guard', { loop: true, frames: [
  [0.32, GUARD],
  [0.32, P({ t: 9, h: 5, aA: [38, 122], aB: [54, 112], lA: [22, -34], lB: [-20, -36] })],
] });

// the lead hand, quick and light
const JAB = P({ t: 14, h: 2, x: 0.05, aA: [36, 124], aB: [92, 4], lA: [24, -20], lB: [-22, -20] });
clip('jab', {
  frames: [[0.06, GUARD], [0.07, JAB], [0.06, tweak(JAB, { aB: [90, 6] })], [0.12, GUARD]],
  strike: { limb: 'handB', from: 0.045, to: 0.17, power: 1, reach: 0.72 },
});

// the back hand, with the hips behind it
const CROSS = P({ t: 20, h: 4, x: 0.09, aA: [92, 2], aB: [40, 118], lA: [28, -16], lB: [-28, -8] });
clip('cross', {
  frames: [
    [0.08, P({ t: 5, h: 4, x: -0.02, aA: [36, 128], aB: [60, 104], lA: [22, -26], lB: [-20, -26] })],
    [0.07, CROSS], [0.07, tweak(CROSS, { aA: [90, 4] })], [0.18, GUARD],
  ],
  strike: { limb: 'handA', from: 0.11, to: 0.23, power: 1.45, reach: 0.8 },
});

// short: it only lands from close in, on the chin
const UPPER = P({ t: 6, h: -6, x: 0.08, lift: 0.03, aA: [112, 62], aB: [50, 112], lA: [20, -10], lB: [-24, -8] });
clip('uppercut', {
  frames: [
    [0.12, P({ t: 20, h: 6, aA: [10, 112], aB: [55, 112], lA: [28, -46], lB: [-18, -46] })],
    [0.08, UPPER], [0.06, tweak(UPPER, { aA: [116, 58] })], [0.2, GUARD],
  ],
  strike: { limb: 'handA', from: 0.13, to: 0.26, power: 1.7, reach: 0.55, rising: true },
});

const KICK = P({ t: -16, h: 4, aA: [30, 100], aB: [70, 90], lA: [88, -4], lB: [-8, -4] });
clip('kick', {
  frames: [
    [0.12, P({ t: -6, h: 2, aA: [40, 110], aB: [60, 100], lA: [86, -118], lB: [-4, -10] })],
    [0.08, KICK], [0.06, tweak(KICK, { lA: [88, -6] })],
    [0.12, P({ t: -6, h: 2, aA: [40, 110], aB: [60, 100], lA: [80, -110], lB: [-4, -10] })],
    [0.16, GUARD],
  ],
  strike: { limb: 'footA', from: 0.14, to: 0.27, power: 1.55, reach: 0.9 },
});

// for someone already on the floor
const STOMP = P({ t: 8, h: 24, aA: [20, 50], aB: [30, 60], lA: [34, -12], lB: [-10, -14] });
clip('stomp', {
  frames: [
    [0.16, P({ t: -2, h: 14, aA: [30, 60], aB: [50, 60], lA: [74, -104], lB: [-4, -8] })],
    [0.07, STOMP], [0.1, tweak(STOMP, { lA: [34, -14] })], [0.2, GUARD],
  ],
  strike: { limb: 'footA', from: 0.17, to: 0.3, power: 1.3, reach: 0.6, low: true },
});

clip('block', { loop: true, frames: [
  [0.3, P({ t: 12, h: 14, aA: [82, 132], aB: [74, 140], lA: [22, -30], lB: [-18, -32] })],
  [0.3, P({ t: 13, h: 15, aA: [84, 130], aB: [76, 138], lA: [22, -32], lB: [-18, -34] })],
] });

clip('dodge', { frames: [
  [0.1, P({ t: -14, h: -10, x: -0.08, aA: [50, 120], aB: [60, 112], lA: [10, -14], lB: [-30, -24] })],
  [0.2, GUARD],
] });

const DUCK = P({ t: 34, h: 24, aA: [72, 140], aB: [62, 146], lA: [64, -124], lB: [54, -124] });
clip('duck', { frames: [[0.08, DUCK], [0.3, DUCK], [0.15, STAND]] });

/* -------------------------------------------------------------------------- */
/*                                 taking a hit                               */
/* -------------------------------------------------------------------------- */

const HIT_HEAD = P({ t: -12, h: -30, x: -0.04, aA: [32, 60], aB: [44, 70], lA: [10, -10], lB: [-14, -12] });
clip('hitHead', { frames: [[0.05, HIT_HEAD], [0.12, HIT_HEAD]] });

const HIT_BODY = P({ t: 32, h: 16, x: -0.03, aA: [22, 102], aB: [12, 92], lA: [20, -30], lB: [-12, -24] });
clip('hitBody', { frames: [[0.06, HIT_BODY], [0.14, HIT_BODY]] });

const HIT_LOW = P({ t: 18, h: 10, aA: [30, 60], aB: [20, 70], lA: [30, -40], lB: [-10, -20] });
clip('hitLow', { frames: [[0.06, HIT_LOW], [0.12, HIT_LOW]] });

clip('stagger', { loop: true, frames: [
  [0.13, P({ t: -16, h: -14, aA: [100, 30], aB: [140, 20], lA: [-12, -14], lB: [26, -32] })],
  [0.13, P({ t: -10, h: -10, aA: [130, 40], aB: [92, 30], lA: [22, -32], lB: [-14, -12] })],
] });

// a startle: something went past, or went bang
clip('flinch', { frames: [
  [0.07, P({ t: -8, h: -10, aA: [60, 120], aB: [50, 126], lift: 0.02 })],
  [0.2, P({ t: -6, h: -8, aA: [56, 116], aB: [46, 120] })],
] });

/* -------------------------------------------------------------------------- */
/*                            going down, getting up                          */
/* -------------------------------------------------------------------------- */

// On the back, the head rests on the floor with the neck bent; the h of
// about 30 is what makes the back of the skull and the spine touch it together.
export const LIE_BACK = P({ rot: -90, t: 0, h: 32, aA: [168, 12], aB: [16, 24], lA: [40, -72], lB: [4, -6] });
export const LIE_FRONT = P({ rot: 90, t: 0, h: -32, aA: [174, 8], aB: [-8, 6], lA: [-3, -4], lB: [3, -22] });
export const DEAD_BACK = P({ rot: -90, t: 0, h: 26, aA: [172, 10], aB: [12, 18], lA: [6, -10], lB: [30, -60] });
export const DEAD_FRONT = P({ rot: 90, t: 0, h: -36, aA: [174, 6], aB: [-6, 4], lA: [-3, -4], lB: [3, -20] });

clip('fallBack', { frames: [
  [0.12, P({ rot: -18, t: -10, h: -16, aA: [80, 20], aB: [118, 30], lA: [22, -30], lB: [8, -18] })],
  [0.14, P({ rot: -52, t: -6, h: -10, aA: [120, 30], aB: [150, 20], lA: [42, -40], lB: [18, -20] })],
  [0.14, P({ rot: -90, t: 0, h: 20, aA: [160, 20], aB: [40, 30], lA: [32, -42], lB: [10, -12] }), 'thud'],
  [0.12, LIE_BACK],
] });

clip('fallFront', { frames: [
  [0.12, P({ rot: 20, t: 10, h: 10, aA: [60, 20], aB: [70, 30], lA: [-10, -20], lB: [0, -20] })],
  [0.14, P({ rot: 55, t: 5, h: -10, aA: [110, 10], aB: [100, 20], lA: [-10, -10], lB: [5, -10] })],
  [0.14, P({ rot: 90, t: 0, h: -26, aA: [160, 20], aB: [140, 30], lA: [-5, -8], lB: [6, -26] }), 'thud'],
  [0.12, LIE_FRONT],
] });

clip('lieBack', { loop: true, frames: [
  [1.4, LIE_BACK],
  [1.4, tweak(LIE_BACK, { t: 1, h: 30, aA: [166, 16], aB: [18, 28] })],
] });

clip('lieFront', { loop: true, frames: [
  [1.4, LIE_FRONT],
  [1.4, tweak(LIE_FRONT, { t: 1, h: -30, aA: [172, 12] })],
] });

// awake on the floor and hurting: curled up, holding something
clip('writheBack', { loop: true, frames: [
  [0.55, P({ rot: -90, t: 0, h: 36, aA: [60, 110], aB: [40, 100], lA: [50, -90], lB: [20, -30] })],
  [0.55, P({ rot: -90, t: 0, h: 32, aA: [64, 104], aB: [44, 96], lA: [30, -60], lB: [44, -84] })],
] });

clip('writheFront', { loop: true, frames: [
  [0.55, P({ rot: 90, t: 0, h: -30, aA: [176, 4], aB: [-20, 10], lA: [-6, -20], lB: [-4, -50] })],
  [0.55, P({ rot: 90, t: 0, h: -34, aA: [172, 8], aB: [-14, 6], lA: [-4, -46], lB: [-6, -18] })],
] });

// knocked out: breathing, nothing else
clip('koBack', { loop: true, frames: [
  [1.4, P({ rot: -90, t: 0, h: 26, aA: [170, 10], aB: [14, 16], lA: [8, -12], lB: [26, -52] })],
  [1.4, P({ rot: -90, t: 1, h: 27, aA: [170, 12], aB: [15, 18], lA: [8, -12], lB: [26, -52] })],
] });

clip('koFront', { loop: true, frames: [
  [1.4, DEAD_FRONT],
  [1.4, tweak(DEAD_FRONT, { t: 1 })],
] });

// trapped under something heavy, pushing at it
clip('pinned', { loop: true, frames: [
  [0.2, P({ rot: -90, h: 30, aA: [100, 20], aB: [80, 30], lA: [30, -50], lB: [6, -10] })],
  [0.2, P({ rot: -90, h: 34, aA: [110, 30], aB: [92, 20], lA: [10, -10], lB: [36, -60] })],
] });

clip('getUpBack', { frames: [
  [0.22, LIE_BACK],
  [0.24, P({ rot: -45, t: 0, h: 20, aA: [-20, 30], aB: [30, 40], lA: [80, -90], lB: [60, -60] })],
  [0.24, P({ rot: 0, t: 25, h: 10, aA: [-30, 10], aB: [40, 40], lA: [135, -95], lB: [120, -125] })],
  [0.24, P({ rot: 0, t: 40, h: 12, aA: [20, 30], aB: [10, 30], lA: [74, -132], lB: [64, -132] })],
  [0.2, STAND],
] });

clip('getUpFront', { frames: [
  [0.2, LIE_FRONT],
  [0.24, P({ rot: 70, t: 0, h: -20, aA: [80, 0], aB: [76, 4], lA: [0, -6], lB: [2, -8] })],
  [0.24, P({ rot: 40, t: 0, h: -10, aA: [72, 0], aB: [70, 4], lA: [60, -110], lB: [50, -110] })],
  [0.24, P({ rot: 0, t: 32, h: 10, aA: [30, 20], aB: [20, 20], lA: [80, -84], lB: [-8, -100] })],
  [0.2, STAND],
] });

/* -------------------------------------------------------------------------- */
/*                                    dying                                   */
/* -------------------------------------------------------------------------- */

// the knees go, then the rest of them
clip('dieCollapse', { frames: [
  [0.22, P({ t: 20, h: 30, aA: [5, 5], aB: [0, 5], lA: [40, -80], lB: [20, -80] })],
  [0.22, P({ t: 26, h: 40, aA: [4, 4], aB: [0, 4], lA: [2, -96], lB: [-2, -98] })],
  [0.26, P({ rot: 58, t: 8, h: 18, aA: [60, 10], aB: [40, 10], lA: [-6, -80], lB: [-4, -92] })],
  [0.24, DEAD_FRONT, 'thud'],
] });

clip('dieBack', { frames: [
  [0.1, P({ rot: -18, t: -12, h: -24, aA: [90, 20], aB: [124, 30], lA: [22, -30], lB: [8, -18] })],
  [0.14, P({ rot: -52, t: -6, h: -16, aA: [130, 30], aB: [156, 20], lA: [42, -40], lB: [18, -20] })],
  [0.14, P({ rot: -90, t: 0, h: 16, aA: [168, 20], aB: [40, 30], lA: [30, -40], lB: [10, -12] }), 'thud'],
  [0.2, DEAD_BACK],
] });

clip('deadBack', { loop: true, frames: [[1, DEAD_BACK], [1, DEAD_BACK]] });
clip('deadFront', { loop: true, frames: [[1, DEAD_FRONT], [1, DEAD_FRONT]] });

/* -------------------------------------------------------------------------- */
/*                                 using things                               */
/* -------------------------------------------------------------------------- */

clip('pickup', { frames: [
  [0.18, P({ t: 70, h: 20, aA: [-4, 4], aB: [4, 8], lA: [72, -122], lB: [40, -110] })],
  [0.12, P({ t: 72, h: 22, aA: [2, 6], aB: [6, 10], lA: [72, -124], lB: [40, -112] }), 'grab'],
  [0.22, STAND],
] });

export const CARRY = P({ t: -2, h: -6, aA: [168, 12], aB: [162, 18], lA: [4, -3], lB: [-4, -3] });

clip('lift', { frames: [
  [0.2, P({ t: 40, h: 10, aA: [80, 20], aB: [70, 30], lA: [62, -110], lB: [40, -100] })],
  [0.18, P({ t: 30, h: 6, aA: [86, 26], aB: [78, 32], lA: [60, -104], lB: [40, -96] }), 'grab'],
  [0.22, P({ t: 6, h: 0, aA: [100, 70], aB: [92, 78], lA: [10, -10], lB: [-6, -8] })],
  [0.18, CARRY, 'overhead'],
] });

clip('carry', { loop: true, frames: [[0.6, CARRY], [0.6, tweak(CARRY, { aA: [166, 14], aB: [160, 20] })]] });

clip('throw', { frames: [
  [0.2, P({ t: -18, h: -10, aA: [205, 30], aB: [198, 36], lA: [24, -12], lB: [-22, -20] })],
  [0.08, P({ t: 24, h: 6, x: 0.06, aA: [104, 4], aB: [96, 8], lA: [30, -14], lB: [-28, -10] }), 'release'],
  [0.3, STAND],
] });

clip('push', { loop: true, frames: [
  [0.5, P({ t: 28, h: 4, aA: [86, 30], aB: [80, 36] })],
  [0.5, P({ t: 30, h: 6, aA: [88, 28], aB: [82, 34] })],
] });

// up onto something about waist high; the climb state moves the body
clip('climb', { frames: [
  [0.12, P({ t: 6, h: -10, aA: [160, 20], aB: [150, 26], lA: [12, -24], lB: [-10, -20], lift: 0.06 })],
  [0.26, P({ t: 34, h: 10, aA: [100, 40], aB: [90, 50], lA: [80, -120], lB: [-6, -30] })],
  [0.2, P({ t: 36, h: 12, aA: [40, 40], aB: [30, 50], lA: [62, -112], lB: [52, -104] })],
  [0.18, STAND],
] });

// rapping on the lid of a crate, about waist high
clip('knock', { frames: [
  [0.14, P({ t: 20, h: 14, aA: [62, 34] })], [0.08, P({ t: 20, h: 14, aA: [48, 8] }), 'knock'],
  [0.12, P({ t: 20, h: 14, aA: [62, 34] })], [0.08, P({ t: 20, h: 14, aA: [48, 8] }), 'knock'],
  [0.2, STAND],
] });

// bent over something on the floor, having a look
clip('inspect', { frames: [
  [0.3, P({ t: 40, h: 22, aA: [30, 40], aB: [10, 50], lA: [40, -60], lB: [10, -40] })],
  [1.0, P({ t: 42, h: 26, aA: [34, 44], aB: [12, 54], lA: [40, -62], lB: [10, -42] })],
  [0.3, STAND],
] });

/* -------------------------------------------------------------------------- */
/*                                   feelings                                 */
/* -------------------------------------------------------------------------- */

export const KNEEL = P({ t: 18, h: 24, aA: [40, 60], aB: [28, 70], lA: [86, -86], lB: [-6, -94] });

clip('kneel', { loop: true, frames: [[1.2, KNEEL], [1.2, tweak(KNEEL, { t: 20, h: 26 })]] });

// sobbing into the hands
clip('cry', { loop: true, frames: [
  [0.25, tweak(KNEEL, { t: 22, h: 30, aA: [60, 100], aB: [52, 108] })],
  [0.25, tweak(KNEEL, { t: 25, h: 34, aA: [62, 104], aB: [54, 112] })],
] });

// on the knees, hands together
clip('beg', { loop: true, frames: [
  [0.3, tweak(KNEEL, { t: 10, h: -6, aA: [100, 80], aB: [96, 84] })],
  [0.3, tweak(KNEEL, { t: 12, h: -4, aA: [104, 84], aB: [100, 88] })],
] });

const COWER = P({ t: 36, h: 26, aA: [150, 136], aB: [140, 146], lA: [76, -146], lB: [62, -146] });
clip('cower', { loop: true, frames: [[0.08, COWER], [0.08, tweak(COWER, { t: 37, h: 27, aA: [152, 132] })]] });

clip('cheer', { frames: [
  [0.16, P({ t: -4, h: -10, aA: [168, 10], aB: [160, 16], lA: [6, -16], lB: [-6, -16] })],
  [0.14, P({ t: -6, h: -14, lift: 0.14, aA: [176, 4], aB: [170, 8], lA: [20, -60], lB: [-10, -50] })],
  [0.16, P({ t: -4, h: -10, aA: [168, 10], aB: [160, 16], lA: [6, -16], lB: [-6, -16] })],
  [0.14, P({ t: -6, h: -14, lift: 0.14, aA: [176, 4], aB: [170, 8], lA: [20, -60], lB: [-10, -50] })],
  [0.2, STAND],
] });

const D0 = P({ t: -6, h: -8, aA: [150, 30], aB: [-24, 20], lA: [12, -24], lB: [-10, -4] });
const D1 = P({ t: 2, h: 0, lift: 0.04, aA: [96, 70], aB: [24, 80], lA: [8, -10], lB: [-8, -10] });
clip('dance', { loop: true, frames: [[0.25, D0], [0.25, D1], [0.25, mirror(D0)], [0.25, mirror(D1)]] });

clip('laugh', { frames: [
  [0.12, P({ t: -4, h: -16, aA: [20, 100], aB: [10, 100] })], [0.12, P({ t: 2, h: -8, aA: [24, 104], aB: [12, 104] })],
  [0.12, P({ t: -4, h: -16, aA: [20, 100], aB: [10, 100] })], [0.12, P({ t: 2, h: -8, aA: [24, 104], aB: [12, 104] })],
  [0.12, P({ t: -4, h: -16, aA: [20, 100], aB: [10, 100] })], [0.2, STAND],
] });

clip('wave', { mask: 'upper', frames: [
  [0.18, P({ h: -4, aA: [150, 30] })], [0.16, P({ h: -4, aA: [150, 80] })],
  [0.16, P({ h: -4, aA: [150, 30] })], [0.16, P({ h: -4, aA: [150, 80] })],
  [0.16, P({ h: -4, aA: [150, 30] })], [0.2, STAND],
] });

// "come on, then"
clip('beckon', { mask: 'upper', frames: [
  [0.14, P({ t: -4, h: -6, aA: [84, 20] })], [0.16, P({ t: -4, h: -6, aA: [84, 110] })],
  [0.14, P({ t: -4, h: -6, aA: [84, 20] })], [0.16, P({ t: -4, h: -6, aA: [84, 110] })],
  [0.2, STAND],
] });

clip('point', { mask: 'upper', frames: [
  [0.12, P({ t: 4, aA: [96, 0] })], [0.7, P({ t: 4, aA: [96, 2] })], [0.2, STAND],
] });

clip('shout', { mask: 'upper', frames: [
  [0.1, P({ t: 14, h: -4, aA: [-20, 30], aB: [-24, 30] })], [0.6, P({ t: 15, h: -6, aA: [-22, 34], aB: [-26, 34] })],
  [0.2, STAND],
] });

clip('shrug', { mask: 'upper', frames: [
  [0.15, P({ t: 0, h: 14, aA: [36, 112], aB: [28, 118] })], [0.5, P({ t: 0, h: 16, aA: [36, 112], aB: [28, 118] })],
  [0.2, STAND],
] });

clip('facepalm', { mask: 'upper', frames: [
  [0.2, P({ t: 6, h: 18, aA: [56, 110] })], [0.8, P({ t: 6, h: 20, aA: [58, 108] })], [0.2, STAND],
] });

clip('scratchHead', { mask: 'upper', frames: [
  [0.24, P({ h: 8, aA: [150, 132] })], [0.12, P({ h: 8, aA: [146, 142] })],
  [0.12, P({ h: 8, aA: [150, 132] })], [0.12, P({ h: 8, aA: [146, 142] })],
  [0.22, STAND],
] });

clip('stretch', { frames: [
  [0.3, P({ t: -6, h: -14, aA: [172, 8], aB: [166, 12], lift: 0.02 })],
  [0.6, P({ t: -7, h: -16, aA: [174, 6], aB: [168, 10], lift: 0.02 })],
  [0.3, STAND],
] });

clip('sigh', { frames: [
  [0.4, P({ t: 10, h: 18, aA: [2, 6], aB: [-2, 6] })], [0.5, P({ t: 11, h: 20, aA: [2, 6], aB: [-2, 6] })],
  [0.4, STAND],
] });

clip('clutchHead', { loop: true, frames: [
  [0.4, P({ t: 8, h: 14, aA: [140, 140], aB: [130, 150] })],
  [0.4, P({ t: 9, h: 18, aA: [142, 138], aB: [132, 148] })],
] });

/* -------------------------------------------------------------------------- */
/*                                   sitting                                  */
/* -------------------------------------------------------------------------- */

const SIT = P({ t: -4, h: 4, aA: [-34, 10], aB: [44, 60], lA: [88, -8], lB: [82, -34] });
clip('sitDown', { frames: [
  [0.25, P({ t: 30, h: 10, aA: [30, 30], aB: [20, 30], lA: [74, -132], lB: [64, -132] })],
  [0.25, SIT],
] });
clip('sit', { loop: true, frames: [[1.5, SIT], [1.5, tweak(SIT, { t: -3, h: 6 })]] });
clip('sitHurt', { loop: true, frames: [
  [0.7, tweak(SIT, { t: 14, h: 18, aA: [60, 40], aB: [50, 50] })],
  [0.7, tweak(SIT, { t: 16, h: 20, aA: [62, 44], aB: [52, 54] })],
] });

// on the edge of a crate, legs over the side
const SIT_EDGE = P({ anchor: 'hip', hipY: 0.05, t: 4, h: 4, aA: [30, 50], aB: [20, 60], lA: [84, -78], lB: [80, -92] });
clip('sitEdge', { loop: true, frames: [[1.5, SIT_EDGE], [1.5, tweak(SIT_EDGE, { lA: [84, -70], lB: [80, -98] })]] });

/* -------------------------------------------------------------------------- */
/*                               with a knife                                 */
/* -------------------------------------------------------------------------- */

// knife low and forward in the near hand, the other hand up to fend off
export const KNIFE_GUARD = P({ t: 10, h: 4, aA: [52, 58], aB: [72, 112], lA: [22, -24], lB: [-20, -26] });
clip('knifeGuard', { loop: true, frames: [
  [0.34, KNIFE_GUARD],
  [0.34, tweak(KNIFE_GUARD, { t: 11, aA: [56, 52], aB: [70, 116], lA: [22, -32], lB: [-20, -34] })],
] });

// a thrust from the hip at the body, the weight going in behind it
const STAB = P({ t: 18, h: 4, x: 0.1, aA: [86, 4], aB: [42, 104], lA: [30, -16], lB: [-28, -8] });
clip('stab', {
  frames: [
    [0.1, P({ t: 4, h: 4, x: -0.03, aA: [14, 78], aB: [72, 112], lA: [22, -26], lB: [-20, -26] })],
    [0.07, STAB], [0.08, tweak(STAB, { aA: [84, 6] })], [0.2, KNIFE_GUARD],
  ],
  strike: { limb: 'handA', from: 0.09, to: 0.25, power: 1.25, reach: 0.95, blade: 'stab', body: true },
});

// a slash: up over the shoulder, then down and across
clip('slash', {
  frames: [
    [0.12, P({ t: -6, h: -4, aA: [162, 72], aB: [62, 104], lA: [20, -24], lB: [-20, -26] })],
    [0.06, P({ t: 14, h: 6, x: 0.06, aA: [100, 18], aB: [42, 92], lA: [28, -18], lB: [-26, -10] })],
    [0.07, P({ t: 18, h: 8, x: 0.06, aA: [44, 8], aB: [32, 82], lA: [28, -18], lB: [-26, -10] })],
    [0.22, KNIFE_GUARD],
  ],
  strike: { limb: 'handA', from: 0.11, to: 0.25, power: 1.0, reach: 0.9, blade: 'slash', sweep: true },
});

// overarm, letting go at the top of the swing
clip('knifeThrow', { frames: [
  [0.18, P({ t: -14, h: -8, aA: [212, 70], aB: [62, 30], lA: [24, -12], lB: [-22, -20] })],
  [0.07, P({ t: 22, h: 6, x: 0.05, aA: [112, 8], aB: [32, 20], lA: [30, -14], lB: [-28, -10] }), 'releaseKnife'],
  [0.3, STAND],
] });

// a knife in them: a hand to it, a breath, and out
clip('pullOut', { frames: [
  [0.25, P({ t: 20, s: 6, h: 24, aA: [18, 92], aB: [12, 88], lA: [12, -20], lB: [-10, -16] })],
  [0.35, P({ t: 24, s: 8, h: 28, aA: [20, 98], aB: [14, 92], lA: [12, -22], lB: [-10, -18] })],
  [0.08, P({ t: 10, h: 10, aA: [96, 8], aB: [14, 90] }), 'yank'],
  [0.35, STAND],
] });

/* -------------------------------------------------------------------------- */
/*                         limp, but trying (ragdoll muscles)                 */
/* -------------------------------------------------------------------------- */

// going down: arms out to catch themselves, knees giving
clip('brace', { loop: true, frames: [
  [0.2, P({ t: 12, h: -12, aA: [104, 16], aB: [84, 24], lA: [34, -44], lB: [12, -30], fA: -10, fB: -10 })],
  [0.2, P({ t: 14, h: -10, aA: [98, 20], aB: [90, 22], lA: [30, -40], lB: [16, -34], fA: -10, fB: -10 })],
] });

// tumbling over and over: arms round the head, knees up
clip('protectHead', { loop: true, frames: [
  [0.3, P({ t: 30, s: 12, h: 24, aA: [148, 142], aB: [138, 150], lA: [84, -104], lB: [72, -112] })],
  [0.3, P({ t: 32, s: 12, h: 26, aA: [150, 138], aB: [140, 146], lA: [80, -108], lB: [76, -110] })],
] });

/* -------------------------------------------------------------------------- */
/*                                standing about                              */
/* -------------------------------------------------------------------------- */

// don't shoot - or, here, don't stab
clip('handsUp', { loop: true, frames: [
  [0.1, P({ t: -3, h: 6, aA: [82, 96], aB: [72, 102], lA: [6, -6], lB: [-6, -6] })],
  [0.1, P({ t: -3, h: 7, aA: [84, 94], aB: [74, 100], lA: [6, -7], lB: [-6, -7] })],
] });

clip('armsCrossed', { loop: true, frames: [
  [1.4, P({ t: -1, h: -3, aA: [22, 92], aB: [28, 86], lA: [6, -2], lB: [-6, -2] })],
  [1.4, P({ t: 0, h: -1, aA: [23, 94], aB: [29, 88], lA: [6, -3], lB: [-6, -3] })],
] });

clip('handsOnHips', { loop: true, frames: [
  [1.3, P({ t: -2, h: -4, aA: [-28, 92], aB: [-34, 98], lA: [10, -2], lB: [-10, -2] })],
  [1.3, P({ t: -1, h: -2, aA: [-27, 94], aB: [-33, 100], lA: [10, -3], lB: [-10, -3] })],
] });

clip('tapFoot', { frames: [
  [0.16, P({ aA: [22, 92], aB: [28, 86], lA: [16, -6], fA: -30 })],
  [0.14, P({ aA: [22, 92], aB: [28, 86], lA: [6, -3] })],
  [0.16, P({ aA: [22, 92], aB: [28, 86], lA: [16, -6], fA: -30 })],
  [0.14, P({ aA: [22, 92], aB: [28, 86], lA: [6, -3] })],
  [0.16, P({ aA: [22, 92], aB: [28, 86], lA: [16, -6], fA: -30 })],
  [0.25, STAND],
] });

clip('yawn', { frames: [
  [0.4, P({ t: -4, h: -20, aA: [150, 52], aB: [140, 62] })],
  [0.7, P({ t: -6, h: -24, aA: [160, 40], aB: [150, 50], lift: 0.01 })],
  [0.4, STAND],
] });

clip('kickDirt', { frames: [
  [0.2, P({ t: 2, h: 22, lA: [28, -40], fA: -10 })],
  [0.08, P({ t: 0, h: 22, lA: [52, -8], fA: 25 })],
  [0.3, STAND],
] });

clip('lookUp', { mask: 'upper', frames: [
  [0.3, P({ t: -6, h: -42 })], [0.9, P({ t: -7, h: -44, aA: [10, 20] })], [0.3, STAND],
] });

clip('wipeBrow', { mask: 'upper', frames: [
  [0.22, P({ h: 6, aA: [150, 142] })], [0.26, P({ h: 6, aA: [144, 126] })], [0.2, STAND],
] });

// showing off
clip('flex', { frames: [
  [0.2, P({ t: -4, h: -6, aA: [90, 92], aB: [-28, 92], lA: [12, -4], lB: [-12, -4] })],
  [0.7, P({ t: -5, h: -10, aA: [92, 104], aB: [-28, 94], lA: [12, -4], lB: [-12, -4] })],
  [0.25, STAND],
] });

// fists in the air at nobody
const SB_JAB = P({ t: 12, h: 2, x: 0.04, aA: [38, 122], aB: [92, 6], lA: [24, -20], lB: [-22, -20] });
const SB_CROSS = P({ t: 18, h: 4, x: 0.07, aA: [92, 4], aB: [40, 118], lA: [28, -16], lB: [-28, -8] });
clip('shadowbox', { loop: true, frames: [
  [0.16, GUARD], [0.08, SB_JAB], [0.14, GUARD], [0.09, SB_CROSS], [0.2, GUARD], [0.08, SB_JAB], [0.08, GUARD], [0.08, SB_JAB], [0.22, GUARD],
] });

// pointing at someone, and laughing at them
clip('laughPoint', { frames: [
  [0.12, P({ t: -4, h: -14, aA: [92, 0], aB: [20, 100] })], [0.12, P({ t: 2, h: -6, aA: [90, 4], aB: [24, 104] })],
  [0.12, P({ t: -4, h: -14, aA: [92, 0], aB: [20, 100] })], [0.12, P({ t: 2, h: -6, aA: [90, 4], aB: [24, 104] })],
  [0.12, P({ t: -4, h: -14, aA: [92, 0], aB: [20, 100] })], [0.22, STAND],
] });

/* -------------------------------------------------------------------------- */
/*                                 with others                                */
/* -------------------------------------------------------------------------- */

clip('highFive', { frames: [
  [0.2, P({ t: -2, h: -10, aA: [138, 14] })],
  [0.1, P({ t: 3, h: -8, x: 0.03, aA: [140, 6] }), 'slap'],
  [0.28, P({ t: 0, h: -6, aA: [136, 22] })],
  [0.25, STAND],
] });

clip('hug', { frames: [
  [0.25, P({ t: 8, h: 4, x: 0.04, aA: [82, 58], aB: [86, 54] })],
  [0.35, P({ t: 10, h: 8, x: 0.05, aA: [80, 70], aB: [84, 62] })],
  [0.25, P({ t: 10, h: 8, x: 0.05, aA: [84, 64], aB: [84, 62] })],
  [0.35, P({ t: 10, h: 8, x: 0.05, aA: [80, 70], aB: [84, 62] })],
  [0.3, STAND],
] });

clip('handshake', { frames: [
  [0.18, P({ t: 6, h: 4, aA: [62, 30] })],
  [0.12, P({ t: 6, h: 4, aA: [67, 25] })], [0.12, P({ t: 6, h: 4, aA: [57, 35] })],
  [0.12, P({ t: 6, h: 4, aA: [67, 25] })], [0.12, P({ t: 6, h: 4, aA: [57, 35] })],
  [0.22, STAND],
] });

clip('clap', { mask: 'upper', frames: [
  [0.1, P({ h: -4, aA: [70, 58], aB: [76, 40] })],
  [0.08, P({ h: -4, aA: [70, 76], aB: [72, 70] }), 'clap'], [0.1, P({ h: -4, aA: [70, 58], aB: [76, 40] })],
  [0.08, P({ h: -4, aA: [70, 76], aB: [72, 70] }), 'clap'], [0.1, P({ h: -4, aA: [70, 58], aB: [76, 40] })],
  [0.08, P({ h: -4, aA: [70, 76], aB: [72, 70] }), 'clap'],
  [0.2, STAND],
] });

clip('thumbsUp', { mask: 'upper', frames: [
  [0.15, P({ h: -4, aA: [70, 92] })], [0.6, P({ h: -6, aA: [72, 94] })], [0.2, STAND],
] });

clip('nod', { mask: 'upper', frames: [
  [0.14, P({ h: 16 })], [0.14, P({ h: -2 })], [0.14, P({ h: 16 })], [0.2, STAND],
] });

clip('bow', { frames: [
  [0.3, P({ t: 50, s: 10, h: 20, aA: [10, 10], aB: [-5, 10] })],
  [0.5, P({ t: 52, s: 10, h: 22, aA: [10, 10], aB: [-5, 10] })],
  [0.35, STAND],
] });

/* -------------------------------------------------------------------------- */
/*                                  exercise                                  */
/* -------------------------------------------------------------------------- */

// press-ups: the body straight as a plank, arms locked out, then down
clip('pushups', { loop: true, frames: [
  [0.45, P({ rot: 64, t: 0, h: -16, aA: [64, 0], aB: [64, 2], lA: [0, 0], lB: [0, 0] })],
  [0.45, P({ rot: 76, t: 0, h: -18, aA: [20, 116], aB: [22, 114], lA: [0, 0], lB: [0, 0] })],
] });

clip('squats', { loop: true, frames: [
  [0.5, P({ t: 4, aA: [88, 2], aB: [86, 4], lA: [4, -3], lB: [-4, -3] })],
  [0.5, P({ t: 32, h: -8, aA: [92, 0], aB: [90, 2], lA: [96, -122], lB: [90, -122] })],
] });

clip('jumpingJacks', { loop: true, frames: [
  [0.22, P({ t: -2, h: -4, lift: 0.06, aA: [172, 8], aB: [166, 14], lA: [14, -4], lB: [-14, -4], fA: 20, fB: 20 })],
  [0.22, P({ t: 0, h: 0, aA: [8, 10], aB: [-6, 10], lA: [2, -2], lB: [-2, -2] })],
] });

/* -------------------------------------------------------------------------- */
/*                                   hurting                                  */
/* -------------------------------------------------------------------------- */

clip('clutchStomach', { loop: true, frames: [
  [0.6, P({ t: 24, s: 10, h: 20, aA: [12, 76], aB: [6, 82], lA: [16, -18], lB: [-8, -12] })],
  [0.6, P({ t: 27, s: 12, h: 23, aA: [13, 80], aB: [7, 84], lA: [16, -20], lB: [-8, -14] })],
] });

// cradling the bad arm with the good one
clip('clutchArm', { loop: true, frames: [
  [0.7, P({ t: 10, h: 22, aA: [6, 20], aB: [22, 64], lA: [6, -6], lB: [-6, -6] })],
  [0.7, P({ t: 12, h: 24, aA: [7, 22], aB: [24, 66], lA: [6, -7], lB: [-6, -7] })],
] });

// cold, from losing too much blood: arms wrapped round, shaking
clip('shiver', { loop: true, frames: [
  [0.06, P({ t: 12, s: 6, h: 14, aA: [10, 100], aB: [16, 96], lA: [8, -10], lB: [-8, -10] })],
  [0.06, P({ t: 13, s: 6, h: 15, aA: [11, 102], aB: [17, 98], lA: [8, -11], lB: [-8, -11] })],
] });

/* -------------------------------------------------------------------------- */
/*                               with a machete                               */
/* -------------------------------------------------------------------------- */

// the blade up by the head, ready to come down; the other hand out in front
export const MACHETE_GUARD = P({ t: 6, h: 2, aA: [128, 72], aB: [62, 100], lA: [22, -24], lB: [-20, -26] });
clip('macheteGuard', { loop: true, frames: [
  [0.36, MACHETE_GUARD],
  [0.36, tweak(MACHETE_GUARD, { t: 7, aA: [132, 68], lA: [22, -32], lB: [-20, -34] })],
] });

// up behind the head, and down with everything behind it
clip('chop', {
  frames: [
    [0.15, P({ t: -10, h: -6, aA: [205, 58], aB: [64, 92], lA: [20, -20], lB: [-24, -22] })],
    [0.07, P({ t: 16, h: 8, x: 0.06, aA: [100, 8], aB: [40, 86], lA: [30, -18], lB: [-28, -10] })],
    [0.08, P({ t: 26, s: 6, h: 12, x: 0.08, aA: [52, 4], aB: [30, 80], lA: [32, -22], lB: [-28, -10] })],
    [0.26, MACHETE_GUARD],
  ],
  strike: { limb: 'handA', from: 0.13, to: 0.29, power: 1.7, reach: 1.15, blade: 'chop', sweep: true },
});

// a flat swing from low behind them, across and up
clip('hack', {
  frames: [
    [0.13, P({ t: -4, h: 0, aA: [-38, 40], aB: [72, 100], lA: [20, -24], lB: [-22, -24] })],
    [0.06, P({ t: 14, h: 6, x: 0.05, aA: [86, 16], aB: [44, 90], lA: [28, -18], lB: [-26, -12] })],
    [0.08, P({ t: 18, h: 4, x: 0.06, aA: [126, 26], aB: [36, 84], lA: [28, -18], lB: [-26, -12] })],
    [0.22, MACHETE_GUARD],
  ],
  strike: { limb: 'handA', from: 0.1, to: 0.25, power: 1.25, reach: 1.1, blade: 'hack', sweep: true },
});

/* -------------------------------------------------------------------------- */
/*                               with a Glock                                 */
/* -------------------------------------------------------------------------- */

// two hands on it, arms out, sights on them (the body under it does whatever it
// is doing; the aim up or down is laid on top, in stickman.js)
clip('aimPistol', { loop: true, frames: [
  [0.55, P({ t: 4, h: -2, aA: [90, 4], aB: [82, 18] })],
  [0.55, P({ t: 5, h: -1, aA: [91, 3], aB: [83, 17] })],
] });

// carried low and forward, the muzzle at the floor
clip('gunLow', { loop: true, frames: [
  [0.8, P({ aA: [28, 22], aB: [-6, 14] })],
  [0.8, P({ aA: [30, 20], aB: [-5, 15] })],
] });

// the empty magazine out, a full one from the belt, in, slapped home, slide racked
clip('reload', { mask: 'upper', frames: [
  [0.16, P({ t: 6, h: 14, aA: [56, 74], aB: [40, 80] })],
  [0.12, P({ t: 6, h: 16, aA: [56, 76], aB: [46, 70] }), 'magOut'],
  [0.24, P({ t: 8, h: 18, aA: [56, 76], aB: [-10, 30] })],
  [0.22, P({ t: 8, h: 20, aA: [56, 76], aB: [-12, 36] })],
  [0.18, P({ t: 6, h: 16, aA: [56, 76], aB: [48, 72] }), 'magIn'],
  [0.1, P({ t: 6, h: 14, aA: [56, 76], aB: [56, 82] })],
  [0.14, P({ t: 4, h: 10, aA: [60, 72], aB: [70, 58] }), 'rack'],
  [0.16, P({ t: 4, h: 6, aA: [72, 40], aB: [66, 60] })],
] });

/* -------------------------------------------------------------------------- */
/*                          wounds, and tending them                          */
/* -------------------------------------------------------------------------- */

// down on one knee by someone, both hands at work on a limb: tying it off, and a last hard pull
const TIE_A = tweak(KNEEL, { t: 34, h: 30, aA: [56, 30], aB: [48, 40] });
const TIE_B = tweak(KNEEL, { t: 36, h: 32, aA: [62, 20], aB: [40, 52] });
clip('tourniquet', { frames: [
  [0.22, TIE_A], [0.22, TIE_B], [0.22, TIE_A], [0.22, TIE_B], [0.2, TIE_A],
  [0.14, tweak(KNEEL, { t: 26, h: 24, aA: [44, 40], aB: [30, 60] }), 'tie'],
  [0.3, KNEEL],
] });

// a grip on it, a brace, and a hard pull: the joint goes back in
clip('popJoint', { frames: [
  [0.3, tweak(KNEEL, { t: 30, h: 26, aA: [64, 20], aB: [58, 26] })],
  [0.3, tweak(KNEEL, { t: 32, h: 28, aA: [66, 18], aB: [60, 24] })],
  [0.1, tweak(KNEEL, { t: 12, h: 12, aA: [40, 30], aB: [34, 36] }), 'pop'],
  [0.4, KNEEL],
] });

// doubled over, a hand to the mouth, heaving
clip('retch', { frames: [
  [0.18, P({ t: 40, s: 10, h: 30, aA: [70, 120], aB: [20, 60], lA: [20, -24], lB: [-10, -18] })],
  [0.22, P({ t: 50, s: 14, h: 36, aA: [60, 110], aB: [24, 56], lA: [22, -28], lB: [-10, -20] })],
  [0.2, P({ t: 42, s: 10, h: 30, aA: [70, 120], aB: [20, 60], lA: [20, -24], lB: [-10, -18] })],
  [0.24, P({ t: 52, s: 14, h: 38, aA: [62, 112], aB: [24, 56], lA: [22, -28], lB: [-10, -20] })],
  [0.4, STAND],
] });

// a look down at where it hurts, a hand to it
clip('checkWound', { mask: 'upper', frames: [
  [0.2, P({ t: 16, h: 34, aA: [20, 70], aB: [10, 40] })],
  [0.5, P({ t: 18, h: 38, aA: [22, 74], aB: [12, 44] })],
  [0.3, STAND],
] });

// holding the stump of a lost limb against the body
clip('clutchStump', { loop: true, frames: [
  [0.2, P({ t: 26, s: 10, h: 24, aA: [24, 70], aB: [26, 74], lA: [14, -20], lB: [-8, -14] })],
  [0.2, P({ t: 28, s: 11, h: 26, aA: [25, 72], aB: [27, 76], lA: [14, -22], lB: [-8, -16] })],
] });

// staring, shaking, not taking anything in
clip('shock', { loop: true, frames: [
  [0.05, P({ t: 6, h: 10, aA: [8, 30], aB: [6, 34], lA: [4, -4], lB: [-4, -4] })],
  [0.05, P({ t: 7, h: 11, aA: [9, 32], aB: [7, 35], lA: [4, -5], lB: [-4, -5] })],
] });

// arms over the head, down low: under fire
clip('coverHead', { loop: true, frames: [
  [0.1, P({ t: 40, h: 30, aA: [168, 140], aB: [160, 146], lA: [80, -140], lB: [66, -140] })],
  [0.1, P({ t: 41, h: 31, aA: [170, 138], aB: [162, 144], lA: [80, -142], lB: [66, -142] })],
] });

/* -------------------------------------------------------------------------- */
/*                                out of breath                               */
/* -------------------------------------------------------------------------- */

// bent over, hands on the thighs, heaving
const KNEES = P({ t: 55, s: 8, h: -12, aA: [-8, 10], aB: [-6, 14], lA: [55, -80], lB: [40, -78] });
clip('handsOnKnees', { loop: true, frames: [
  [0.42, KNEES],
  [0.42, tweak(KNEES, { t: 58, h: -6, aA: [-7, 12], aB: [-5, 16] })],
] });

// upright again, a hand on the chest, a few deep breaths
clip('catchBreath', { frames: [
  [0.3, P({ t: 8, h: -8, aA: [24, 118], aB: [-4, 10] })],
  [0.5, P({ t: 4, h: -14, aA: [26, 122], aB: [-3, 12], lift: 0.008 })],
  [0.5, P({ t: 10, h: -4, aA: [24, 118], aB: [-4, 10] })],
  [0.5, P({ t: 4, h: -14, aA: [26, 122], aB: [-3, 12], lift: 0.008 })],
  [0.3, STAND],
] });

// caught their balance: arms out to the sides a moment, then down
clip('steady', { mask: 'upper', frames: [
  [0.1, P({ t: 4, h: -6, aA: [84, 10], aB: [76, 12] })],
  [0.35, P({ t: 2, h: -2, aA: [80, 14], aB: [72, 16] })],
  [0.3, STAND],
] });

// shaking it off: the head, then the shoulders
clip('shakeOff', { mask: 'upper', frames: [
  [0.08, P({ h: -14, aA: [12, 20], aB: [-8, 18] })], [0.08, P({ h: 12 })], [0.08, P({ h: -12 })], [0.08, P({ h: 10 })],
  [0.14, P({ t: -4, aA: [20, 30], aB: [16, 30] })], [0.2, STAND],
] });

// light on the toes, the way a boxer keeps warm
clip('bounce', { loop: true, frames: [
  [0.18, P({ t: 6, h: 2, aA: [40, 112], aB: [52, 104], lA: [14, -14], lB: [-12, -14], lift: 0.035, fA: 14, fB: 14 })],
  [0.18, P({ t: 7, h: 3, aA: [42, 116], aB: [54, 108], lA: [12, -22], lB: [-10, -22] })],
] });

clip('crackKnuckles', { mask: 'upper', frames: [
  [0.2, P({ t: 2, h: 10, aA: [60, 70], aB: [64, 66] })],
  [0.1, P({ t: 2, h: 12, aA: [62, 76], aB: [62, 72] }), 'crack'],
  [0.2, P({ t: 2, h: 10, aA: [60, 70], aB: [64, 66] })],
  [0.1, P({ t: 2, h: 12, aA: [62, 76], aB: [62, 72] }), 'crack'],
  [0.25, STAND],
] });

// a hand to the chin, mulling it over
clip('think', { loop: true, frames: [
  [1.1, P({ t: 4, h: 10, aA: [25, 155], aB: [12, 92] })],
  [1.1, P({ t: 5, h: 14, aA: [26, 152], aB: [13, 94] })],
] });

/* -------------------------------------------------------------------------- */
/*                         holsters, pockets and kit                          */
/* -------------------------------------------------------------------------- */

// the near hand down to the hip, the pistol pushed home, the hand away
clip('holster', { mask: 'armA', frames: [
  [0.12, P({ aA: [28, 24] })],
  [0.14, P({ aA: [-16, 40] }), 'stow'],
  [0.12, P({ aA: [-10, 20] })],
  [0.14, STAND],
] });

// and out again: down, a grip on it, up and forward
clip('drawGun', { mask: 'armA', frames: [
  [0.12, P({ aA: [-14, 36] })],
  [0.06, P({ aA: [-16, 40] }), 'draw'],
  [0.12, P({ aA: [6, 40] })],
  [0.12, P({ aA: [28, 22] })],
] });

// into the front pocket, and out of it
clip('pocket', { mask: 'armA', frames: [
  [0.14, P({ aA: [24, 40] })],
  [0.14, P({ aA: [8, 4] }), 'stow'],
  [0.14, P({ aA: [10, 18] })],
  [0.12, STAND],
] });
clip('unpocket', { mask: 'armA', frames: [
  [0.14, P({ aA: [8, 4] })],
  [0.06, P({ aA: [8, 6] }), 'draw'],
  [0.14, P({ aA: [26, 40] })],
  [0.12, P({ aA: [40, 60] })],
] });

// a vest on: over the head, pulled down, the straps tugged tight
clip('vestOn', { frames: [
  [0.24, P({ t: -4, h: -8, aA: [168, 22], aB: [162, 26] })],
  [0.26, P({ t: -2, h: 4, aA: [128, 110], aB: [124, 114] })],
  [0.14, P({ t: 4, h: 10, aA: [56, 110], aB: [52, 116] }), 'vestOn'],
  [0.16, P({ t: 6, h: 14, aA: [42, 100], aB: [38, 104] })],
  [0.12, P({ t: 6, h: 14, aA: [36, 86], aB: [34, 90] })],
  [0.22, STAND],
] });

// down by an ammo box: a handful of rounds, thumbed into the magazines
clip('ammoGrab', { frames: [
  [0.22, P({ t: 42, h: 22, aA: [52, 10], aB: [44, 14], lA: [82, -112], lB: [56, -120] })],
  [0.18, P({ t: 44, h: 24, aA: [56, 6], aB: [46, 12], lA: [82, -114], lB: [56, -122] }), 'ammo'],
  [0.3, P({ t: 22, h: 26, aA: [52, 78], aB: [46, 84], lA: [40, -60], lB: [20, -50] })],
  [0.25, P({ t: 10, h: 24, aA: [50, 80], aB: [44, 88] })],
  [0.25, STAND],
] });

// the spent cartridge off the front of the taser, a fresh one on
clip('reloadTaser', { mask: 'upper', frames: [
  [0.14, P({ t: 6, h: 14, aA: [56, 74], aB: [46, 86] })],
  [0.12, P({ t: 6, h: 16, aA: [56, 76], aB: [54, 92] }), 'cartOut'],
  [0.22, P({ t: 8, h: 16, aA: [56, 76], aB: [-8, 32] })],
  [0.2, P({ t: 6, h: 14, aA: [56, 76], aB: [56, 90] }), 'cartIn'],
  [0.16, P({ t: 4, h: 8, aA: [70, 44], aB: [64, 60] })],
] });

/* -------------------------------------------------------------------------- */
/*                                  the taser                                 */
/* -------------------------------------------------------------------------- */

// every muscle locked: straight as a board, fists tight to the chest, shaking
const RIGID = P({ t: -6, h: -22, aA: [22, 104], aB: [18, 112], lA: [2, -1], lB: [-2, -1], fA: 24, fB: 24 });
clip('tased', { loop: true, frames: [
  [0.035, RIGID],
  [0.035, tweak(RIGID, { t: -4, h: -18, aA: [26, 98], aB: [14, 116], lA: [3, -3] })],
] });
// on the floor while it goes on: jerking where they lie
clip('tasedFloor', { loop: true, frames: [
  [0.04, P({ rot: -90, t: -4, h: 18, aA: [40, 112], aB: [30, 120], lA: [8, -6], lB: [2, -4], fA: 20, fB: 20 })],
  [0.04, P({ rot: -88, t: -2, h: 22, aA: [44, 104], aB: [26, 126], lA: [10, -10], lB: [4, -2], fA: 22, fB: 18 })],
] });

// pressed against them, a crackle: a short shove of the arm
clip('taserZap', {
  frames: [
    [0.08, P({ t: 6, h: 4, aA: [40, 80], aB: [60, 100], lA: [22, -24], lB: [-20, -26] })],
    [0.07, P({ t: 16, h: 4, x: 0.08, aA: [84, 8], aB: [50, 96], lA: [28, -16], lB: [-26, -10] })],
    [0.12, P({ t: 16, h: 4, x: 0.08, aA: [82, 10], aB: [50, 96], lA: [28, -16], lB: [-26, -10] })],
    [0.18, GUARD],
  ],
  strike: { limb: 'handA', from: 0.07, to: 0.24, power: 1, reach: 0.82, body: true },
});

/* -------------------------------------------------------------------------- */
/*                               officers, arrests                            */
/* -------------------------------------------------------------------------- */

// "Stop!": the near hand out flat
clip('commandStop', { mask: 'upper', frames: [
  [0.1, P({ t: -2, h: -6, aA: [94, 22] })], [0.7, P({ t: -3, h: -8, aA: [96, 18] })], [0.2, STAND],
] });
// "Get down!": pointing at the floor in front of them
clip('pointDown', { mask: 'upper', frames: [
  [0.12, P({ t: 6, h: 10, aA: [52, 2] })], [0.6, P({ t: 7, h: 12, aA: [50, 0] })], [0.2, STAND],
] });
// talking into the radio clipped at the shoulder, head turned to it
clip('radio', { mask: 'upper', frames: [
  [0.16, P({ h: 14, aB: [64, 148] }), 'radio'], [1.1, P({ h: 16, aB: [66, 146] })], [0.2, STAND],
] });
// the other hand holding a weapon out, and letting it fall
clip('dropIt', { mask: 'upper', frames: [
  [0.2, P({ t: 6, h: 10, aA: [54, 12], aB: [70, 90] })],
  [0.12, P({ t: 8, h: 12, aA: [50, 6], aB: [72, 92] }), 'drop'],
  [0.25, P({ t: -2, h: 6, aA: [82, 96], aB: [72, 102] })],
] });
clip('salute', { mask: 'upper', frames: [
  [0.16, P({ h: -4, aA: [148, 150] })], [0.6, P({ h: -6, aA: [150, 150] })], [0.2, STAND],
] });

// on both knees, fingers laced on the head: the way to be arrested
clip('kneelHands', { loop: true, frames: [
  [1, P({ t: 2, h: 6, aA: [160, 142], aB: [154, 146], lA: [0, -90], lB: [-4, -92] })],
  [1, P({ t: 3, h: 8, aA: [161, 140], aB: [155, 144], lA: [0, -90], lB: [-4, -92] })],
] });
// down beside someone, knees on the floor, both hands at their wrists, the cuffs going on
const CUFF_A = tweak(KNEEL, { t: 42, h: 32, aA: [58, 30], aB: [52, 34] });
const CUFF_B = tweak(KNEEL, { t: 44, h: 34, aA: [64, 22], aB: [48, 42] });
clip('cuffing', { frames: [
  [0.3, CUFF_A], [0.24, CUFF_B], [0.24, CUFF_A], [0.2, CUFF_B, 'cuff'], [0.3, CUFF_A], [0.3, STAND],
] });
// cuffed and sat on the floor, hands behind
clip('sitCuffed', { loop: true, frames: [
  [1.4, tweak(SIT, { t: 6, h: 14, aA: [-34, 60], aB: [-38, 64] })],
  [1.4, tweak(SIT, { t: 8, h: 18, aA: [-34, 62], aB: [-38, 66] })],
] });
// limp with the hands cuffed behind: what the ragdoll's arms aim for
clip('cuffedDown', { loop: true, frames: [
  [0.4, P({ t: 10, h: 10, aA: [-40, 60], aB: [-44, 64], lA: [30, -40], lB: [10, -30] })],
  [0.4, P({ t: 12, h: 12, aA: [-40, 62], aB: [-44, 66], lA: [26, -44], lB: [14, -26] })],
] });

/* -------------------------------------------------------------------------- */
/*                                  sampling                                  */
/* -------------------------------------------------------------------------- */

const catmull = (p0, p1, p2, p3, u) => 0.5 * (2 * p1 + (-p0 + p2) * u +
  (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);

/** Which frame a clip is on at time t, and how far through it. */
export function frameAt(c, time) {
  let t = time;
  if (c.loop) t = ((t % c.duration) + c.duration) % c.duration;
  else t = Math.min(Math.max(t, 0), c.duration);
  const n = c.frames.length;
  for (let i = 0; i < n; i++) {
    const f = c.frames[i];
    if (t < f.start + f.d) return { i, u: f.d > 0 ? (t - f.start) / f.d : 1 };
  }
  return { i: n - 1, u: 1 };
}

/** The pose a clip is in at time t. */
export function sampleClip(c, time, out, flipbook = false) {
  const { i, u } = frameAt(c, time);
  const n = c.frames.length;
  const a = c.frames[i].p;
  let j = i + 1;
  if (j >= n) j = c.loop ? 0 : -1;
  if (flipbook || j < 0 || n === 1) return copyPose(a, out);
  const b = c.frames[j].p;
  if (c.interp === 'spline') {
    const p0 = c.frames[c.loop ? (i - 1 + n) % n : Math.max(0, i - 1)].p;
    const p3 = c.frames[c.loop ? (j + 1) % n : Math.min(n - 1, j + 1)].p;
    for (const k of POSE_KEYS) out[k] = catmull(p0[k], a[k], b[k], p3[k], u);
  } else {
    const e = c.interp === 'linear' ? u : smooth(u);
    for (const k of POSE_KEYS) out[k] = lerp(a[k], b[k], e);
  }
  out.anchor = u < 0.5 ? a.anchor : b.anchor;
  out.hipY = lerp(a.hipY, b.hipY, u);
  return out;
}

/**
 * Events on frames that start in [t0, t1) - so an event on the first frame
 * fires on the first update, and none fires twice. A loop counts every lap.
 */
export function eventsBetween(c, t0, t1, out) {
  if (t1 <= t0) return out;
  for (const f of c.frames) {
    if (!f.ev) continue;
    if (c.loop) {
      const d = c.duration;
      const laps = Math.ceil((t1 - f.start) / d) - Math.ceil((t0 - f.start) / d);
      for (let k = 0; k < laps; k++) out.push(f.ev);
    } else if (f.start >= t0 && f.start < t1) {
      out.push(f.ev);
    }
  }
  return out;
}

/** Blends pose b into a by weight w, only over the given keys. */
export function blendInto(a, b, w, keys = POSE_KEYS) {
  if (w <= 0) return a;
  for (const k of keys) a[k] = k === 'rot' ? lerpAngle(a[k], b[k], w) : lerp(a[k], b[k], w);
  if (w >= 0.5) { a.anchor = b.anchor; a.hipY = b.hipY; }
  return a;
}

export const MASKS = {
  full: POSE_KEYS,
  upper: ['t', 's', 'h', 'aAu', 'aAl', 'aBu', 'aBl'],
  arms: ['aAu', 'aAl', 'aBu', 'aBl'],
  armA: ['aAu', 'aAl'],
  armB: ['aBu', 'aBl'],
  legs: ['lAu', 'lAl', 'lBu', 'lBl', 'fA', 'fB', 'x', 'lift'],
};
