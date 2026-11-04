/* =============================================================================
   SUPERPOWERS - the animations: keyed the same way as everything else (see
   game/clips.js and game/skeleton.js for what the numbers mean).

   flight     flyHover, flyForward, flyRise, flyReach, flyCarry, flyPin,
              flyPunch, flyKick, flySlam, flyThrowDown, flyTackle, spinThrow,
              diveBomb, flyLand, heroLand, launchKick, launchUppercut
   strength   megaWind, megaPunch, groundPound, heaveLift, heaveThrow,
              liftOverhead, slamDown, bearHug, thunderClap, quakeStomp,
              shoulderCharge
   speed      speedDash, blitzFlurry, kickStorm, gustPunch, dropkick
   telekinesis  tkLift, tkThrow, tkPush, tkPull, tkChoke, tkShield, tkSlam, tkFloat
   durability   braceSelf, toughWalk, shoveHard, headbutt, slamTuck, slamLand,
              shieldArms, smotherDive, ramCharge, bladeCatch, tauntWide,
              shrugBurst
   laser      laserStare, laserSweep, laserBlink, laserCharge, laserRelease, eyeFlash
   ========================================================================== */
import { defineClip } from '../clips.js';
import { P } from '../skeleton.js';

const STAND = P({ t: 2, aA: [6, 12], aB: [-5, 12], lA: [4, -3], lB: [-4, -3] });
const GUARD = P({ t: 6, h: 2, aA: [44, 104], aB: [56, 96], lA: [18, -20], lB: [-16, -16] });

/* ----------------------------------- flight ----------------------------------- */

defineClip('flyHover', { loop: true, frames: [
  [0.55, P({ t: 4, h: 2, aA: [24, 18], aB: [18, 22], lA: [12, -18], lB: [-6, -10] })],
  [0.55, P({ t: 3, h: 1, aA: [30, 24], aB: [22, 28], lA: [17, -24], lB: [-2, -15] })],
] });
// the way you would fly if you could: flat out, a fist out in front, the other arm back
defineClip('flyForward', { loop: true, frames: [
  [0.22, P({ rot: 70, t: 2, h: -48, aA: [172, 4], aB: [-24, 12], lA: [-6, -8], lB: [-14, -4] })],
  [0.22, P({ rot: 68, t: 3, h: -46, aA: [168, 6], aB: [-20, 14], lA: [-10, -4], lB: [-10, -9] })],
] });
defineClip('flyRise', { loop: true, frames: [
  [0.2, P({ t: 2, h: -14, aA: [176, 4], aB: [10, 14], lA: [8, -10], lB: [-8, -18] })],
  [0.2, P({ t: 2, h: -12, aA: [174, 6], aB: [14, 16], lA: [6, -14], lB: [-10, -14] })],
] });
defineClip('flyReach', { loop: true, frames: [
  [0.3, P({ rot: 12, t: 10, h: 4, aA: [88, 12], aB: [80, 18], lA: [20, -26], lB: [-4, -16] })],
  [0.3, P({ rot: 10, t: 9, h: 3, aA: [92, 10], aB: [84, 16], lA: [24, -30], lB: [-2, -18] })],
] });
defineClip('flyCarry', { loop: true, frames: [
  [0.4, P({ rot: 4, t: 6, h: 8, aA: [64, 30], aB: [58, 36], lA: [14, -22], lB: [-8, -12] })],
  [0.4, P({ rot: 3, t: 5, h: 7, aA: [66, 28], aB: [60, 34], lA: [18, -26], lB: [-6, -14] })],
] });
// one arm out straight, holding them against the wall; the other drawn back
defineClip('flyPin', { loop: true, frames: [
  [0.3, P({ rot: 6, t: 12, h: 4, aA: [40, 120], aB: [86, 4], lA: [18, -24], lB: [-6, -16] })],
  [0.3, P({ rot: 6, t: 13, h: 5, aA: [42, 124], aB: [87, 4], lA: [20, -26], lB: [-6, -18] })],
] });
defineClip('flyPunch', { frames: [
  [0.06, P({ rot: 8, t: 18, h: 6, aA: [92, 2], aB: [84, 8], lA: [20, -22], lB: [-8, -14] })],
  [0.08, P({ rot: 8, t: 18, h: 6, aA: [94, 0], aB: [84, 8], lA: [20, -22], lB: [-8, -14] })],
  [0.16, P({ rot: 6, t: 12, h: 4, aA: [40, 120], aB: [86, 4], lA: [18, -24], lB: [-6, -16] })],
] });
defineClip('flyKick', { frames: [
  [0.07, P({ rot: -10, t: -16, h: 4, aA: [60, 90], aB: [40, 100], lA: [96, -2], lB: [-20, -30] })],
  [0.1, P({ rot: -10, t: -16, h: 4, aA: [60, 90], aB: [40, 100], lA: [98, 0], lB: [-20, -30] })],
  [0.22, P({ rot: -4, t: -6, h: 2, aA: [50, 60], aB: [36, 70], lA: [40, -40], lB: [-10, -20] })],
] });
// both fists together, up over the head, and down
defineClip('flySlam', { frames: [
  [0.08, P({ t: -16, h: -12, aA: [200, 30], aB: [196, 34], lA: [24, -40], lB: [-6, -30] })],
  [0.07, P({ t: 34, h: 22, aA: [74, 8], aB: [70, 12], lA: [28, -30], lB: [-8, -18] })],
  [0.3, P({ t: 20, h: 14, aA: [50, 16], aB: [46, 20], lA: [20, -24], lB: [-6, -14] })],
] });
defineClip('flyThrowDown', { frames: [
  [0.14, P({ t: -14, h: -10, aA: [196, 20], aB: [190, 26], lA: [8, -30], lB: [-10, -20] })],
  [0.14, P({ t: -16, h: -12, aA: [200, 18], aB: [194, 24], lA: [8, -32], lB: [-10, -22] })],
  [0.1, P({ t: 26, h: 18, aA: [60, 6], aB: [54, 10], lA: [24, -16], lB: [-14, -6] })],
  [0.4, P({ t: 12, h: 10, aA: [40, 20], aB: [34, 24], lA: [14, -18], lB: [-6, -10] })],
] });
defineClip('flyTackle', { loop: true, frames: [
  [0.15, P({ rot: 72, t: 10, h: -44, aA: [150, 30], aB: [128, 40], lA: [-10, -14], lB: [-18, -8] })],
  [0.15, P({ rot: 70, t: 11, h: -42, aA: [146, 34], aB: [124, 44], lA: [-14, -10], lB: [-14, -12] })],
] });
defineClip('spinThrow', { loop: true, frames: [
  [0.12, P({ t: -10, h: -6, aA: [110, 4], aB: [100, 10], lA: [24, -30], lB: [-14, -20] })],
  [0.12, P({ t: -12, h: -8, aA: [118, 2], aB: [106, 8], lA: [20, -26], lB: [-16, -24] })],
] });
// coming down out of the sky feet first, arms straight up over the head
defineClip('diveBomb', { loop: true, frames: [
  [0.1, P({ t: -4, h: -20, aA: [178, 4], aB: [172, 6], lA: [2, -2], lB: [-2, -4] })],
  [0.1, P({ t: -3, h: -18, aA: [176, 6], aB: [174, 4], lA: [3, -3], lB: [-3, -3] })],
] });
defineClip('flyLand', { frames: [
  [0.08, P({ t: 26, h: 12, aA: [30, 40], aB: [46, 46], lA: [80, -104], lB: [34, -84] })],
  [0.16, P({ t: 20, h: 10, aA: [26, 30], aB: [40, 40], lA: [66, -90], lB: [26, -72] })],
  [0.2, STAND],
] });
// down on one knee, a fist in the floor, and up again
defineClip('heroLand', { frames: [
  [0.05, P({ t: 42, s: 8, h: 26, x: 0.06, aA: [22, 6], aB: [64, 70], lA: [100, -128], lB: [-26, -104] })],
  [0.55, P({ t: 40, s: 8, h: 22, x: 0.06, aA: [24, 6], aB: [62, 72], lA: [98, -126], lB: [-24, -102] })],
  [0.24, P({ t: 20, h: 6, aA: [18, 24], aB: [12, 34], lA: [56, -78], lB: [-8, -62] })],
  [0.22, STAND],
] });
// a kick straight up, from the floor: the foot goes right over the head
defineClip('launchKick', { frames: [
  [0.12, P({ t: -6, h: 2, aA: [40, 110], aB: [60, 100], lA: [70, -100], lB: [-4, -10] })],
  [0.07, P({ t: -18, h: -8, aA: [30, 80], aB: [70, 60], lA: [152, -8], lB: [-2, -6] })],
  [0.14, P({ t: -10, h: -4, aA: [36, 90], aB: [64, 70], lA: [112, -50], lB: [-4, -8] })],
  [0.15, GUARD],
] });
defineClip('launchUppercut', { frames: [
  [0.1, P({ t: 26, h: 10, aA: [10, 120], aB: [55, 112], lA: [40, -70], lB: [-20, -50] })],
  [0.06, P({ t: -14, h: -12, aA: [176, 6], aB: [60, 100], lA: [16, -10], lB: [-10, -6] })],
  [0.25, P({ t: -6, h: -8, aA: [150, 30], aB: [50, 90], lA: [10, -8], lB: [-8, -6] })],
  [0.18, GUARD],
] });

/* ---------------------------------- strength ---------------------------------- */

// wound right back: the fist behind them, the weight on the back foot
defineClip('megaWind', { frames: [
  [0.3, P({ t: -14, s: -10, h: 4, aA: [-40, 120], aB: [70, 60], lA: [40, -30], lB: [-30, -20] })],
  [0.6, P({ t: -16, s: -12, h: 5, aA: [-46, 124], aB: [72, 58], lA: [42, -32], lB: [-32, -22] })],
] });
defineClip('megaPunch', { frames: [
  [0.06, P({ t: 26, s: 10, h: 8, x: 0.12, aA: [94, 0], aB: [20, 60], lA: [50, -40], lB: [-40, -10] })],
  [0.3, P({ t: 26, s: 10, h: 8, x: 0.12, aA: [95, 0], aB: [20, 60], lA: [50, -40], lB: [-40, -10] })],
  [0.25, P({ t: 6, aA: [50, 90], aB: [40, 100], lA: [20, -20], lB: [-16, -14] })],
] });
// both fists up, and down into the floor
defineClip('groundPound', { frames: [
  [0.2, P({ t: -6, h: -8, aA: [196, 30], aB: [190, 34], lA: [30, -60], lB: [-20, -50] })],
  [0.2, P({ t: -10, h: -10, aA: [200, 20], aB: [196, 24], lA: [20, -30], lB: [-16, -26] })],
  [0.07, P({ t: 52, h: 30, aA: [86, 4], aB: [82, 8], lA: [84, -114], lB: [30, -96] })],
  [0.5, P({ t: 50, h: 28, aA: [84, 4], aB: [80, 8], lA: [82, -112], lB: [30, -94] })],
  [0.3, STAND],
] });
defineClip('heaveLift', { frames: [
  [0.25, P({ t: 40, h: 10, aA: [80, 20], aB: [70, 30], lA: [62, -110], lB: [40, -100] })],
  [0.3, P({ t: 2, h: -6, aA: [176, 10], aB: [170, 14], lA: [8, -10], lB: [-6, -8] })],
  [1.6, P({ t: -2, h: -8, aA: [178, 8], aB: [172, 12], lA: [10, -12], lB: [-8, -10] })],
] });
defineClip('heaveThrow', { frames: [
  [0.08, P({ t: -16, h: -12, aA: [205, 30], aB: [198, 36], lA: [24, -12], lB: [-22, -20] })],
  [0.1, P({ t: 26, h: 8, x: 0.08, aA: [110, 4], aB: [100, 8], lA: [34, -14], lB: [-30, -10] })],
  [0.3, STAND],
] });
defineClip('liftOverhead', { frames: [
  [0.2, P({ t: 30, h: 8, aA: [86, 24], aB: [80, 30], lA: [50, -90], lB: [30, -80] })],
  [0.35, P({ t: -6, h: -10, aA: [178, 6], aB: [172, 10], lA: [10, -14], lB: [-10, -10] })],
  [1.6, P({ t: -8, h: -12, aA: [180, 4], aB: [174, 8], lA: [12, -16], lB: [-10, -12] })],
] });
defineClip('slamDown', { frames: [
  [0.1, P({ t: 40, h: 20, x: 0.1, aA: [100, 10], aB: [96, 14], lA: [60, -70], lB: [-30, -20] })],
  [0.4, P({ t: 38, h: 18, x: 0.1, aA: [96, 12], aB: [92, 16], lA: [58, -68], lB: [-30, -20] })],
  [0.3, STAND],
] });
defineClip('bearHug', { frames: [
  [0.15, P({ t: 10, h: 6, aA: [80, 100], aB: [74, 108], lA: [20, -20], lB: [-16, -12] })],
  [0.2, P({ t: -6, h: -4, aA: [84, 110], aB: [80, 116], lA: [16, -16], lB: [-14, -10] })],
  [1.7, P({ t: -8, h: -6, aA: [86, 114], aB: [82, 120], lA: [16, -16], lB: [-14, -10] })],
  [0.2, STAND],
] });
// arms out, and together in front hard enough to make thunder
defineClip('thunderClap', { frames: [
  [0.22, P({ t: -8, h: -4, aA: [140, 20], aB: [-50, 20], lA: [16, -16], lB: [-14, -12] })],
  [0.08, P({ t: 14, h: 6, aA: [94, 4], aB: [90, 8], lA: [24, -24], lB: [-18, -12] })],
  [0.4, P({ t: 12, h: 5, aA: [92, 6], aB: [88, 10], lA: [22, -22], lB: [-16, -12] })],
  [0.2, STAND],
] });
defineClip('quakeStomp', { frames: [
  [0.2, P({ t: 4, h: 4, aA: [50, 70], aB: [40, 80], lA: [110, -110], lB: [-4, -6] })],
  [0.12, P({ t: 10, h: 10, aA: [40, 50], aB: [30, 60], lA: [118, -122], lB: [-6, -8] })],
  [0.05, P({ t: 18, h: 14, aA: [30, 40], aB: [26, 50], lA: [30, -20], lB: [-16, -22] })],
  [0.35, P({ t: 16, h: 12, aA: [28, 40], aB: [24, 48], lA: [30, -22], lB: [-16, -22] })],
  [0.2, STAND],
] });
// head down, shoulder first, running
defineClip('shoulderCharge', { loop: true, frames: [
  [0.12, P({ t: 34, s: 14, h: -6, aA: [30, 60], aB: [-20, 40], lA: [50, -60], lB: [-40, -30] })],
  [0.12, P({ t: 34, s: 14, h: -6, aA: [30, 60], aB: [-20, 40], lA: [-40, -30], lB: [50, -60] })],
] });

/* ----------------------------------- speed ----------------------------------- */

defineClip('speedDash', { loop: true, frames: [
  [0.07, P({ t: 40, s: 10, h: -14, aA: [-50, 10], aB: [-60, 14], lA: [60, -70], lB: [-50, -40] })],
  [0.07, P({ t: 40, s: 10, h: -14, aA: [-56, 12], aB: [-52, 12], lA: [-50, -40], lB: [60, -70] })],
] });
const JAB_A = P({ t: 12, h: 4, aA: [92, 2], aB: [50, 110], lA: [26, -24], lB: [-20, -14] });
const JAB_B = P({ t: 12, h: 4, aA: [50, 110], aB: [90, 4], lA: [26, -24], lB: [-20, -14] });
const JAB_C = P({ t: 14, h: 8, aA: [96, 4], aB: [52, 106], lA: [26, -24], lB: [-20, -14] });
defineClip('blitzFlurry', { frames: [
  ...Array.from({ length: 10 }, (_, i) => [0.05, [JAB_A, JAB_B, JAB_C][i % 3]]),
  [0.2, GUARD],
] });
const KICK_LOW = P({ t: -8, h: 2, aA: [40, 100], aB: [56, 96], lA: [74, -10], lB: [-6, -10] });
const KICK_MID = P({ t: -12, h: 0, aA: [36, 96], aB: [60, 92], lA: [100, -4], lB: [-6, -10] });
const KICK_BACK = P({ t: 2, h: 2, aA: [40, 100], aB: [56, 96], lA: [30, -60], lB: [-6, -10] });
defineClip('kickStorm', { frames: [
  ...Array.from({ length: 10 }, (_, i) => [0.045, [KICK_LOW, KICK_BACK, KICK_MID, KICK_BACK][i % 4]]),
  [0.2, GUARD],
] });
defineClip('gustPunch', { frames: [
  [0.04, P({ t: 18, s: 8, x: 0.08, aA: [92, 0], aB: [30, 100], lA: [40, -30], lB: [-34, -10] })],
  [0.25, P({ t: 18, s: 8, x: 0.08, aA: [93, 0], aB: [30, 100], lA: [40, -30], lB: [-34, -10] })],
  [0.16, STAND],
] });
// both feet into them, lying back on the air
defineClip('dropkick', { frames: [
  [0.08, P({ rot: -50, t: -10, h: 10, aA: [20, 40], aB: [10, 50], lA: [96, -4], lB: [90, -8] })],
  [0.25, P({ rot: -52, t: -10, h: 12, aA: [18, 40], aB: [8, 50], lA: [98, -2], lB: [92, -6] })],
  [0.3, P({ t: 30, aA: [60, 60], aB: [50, 70], lA: [80, -110], lB: [40, -90] })],
  [0.2, STAND],
] });

/* -------------------------------- telekinesis -------------------------------- */

// a hand up and out, palm up: and something else goes up with it
defineClip('tkLift', { frames: [
  [0.3, P({ t: -4, h: -6, aA: [140, 10], aB: [20, 20], lA: [12, -10], lB: [-10, -8] })],
  [2.6, P({ t: -6, h: -8, aA: [150, 6], aB: [22, 18], lA: [12, -10], lB: [-10, -8] })],
] });
defineClip('tkThrow', { frames: [
  [0.1, P({ t: 16, h: 6, aA: [70, 6], aB: [10, 30], lA: [24, -20], lB: [-18, -10] })],
  [0.35, P({ t: 16, h: 6, aA: [68, 8], aB: [10, 30], lA: [24, -20], lB: [-18, -10] })],
  [0.2, STAND],
] });
defineClip('tkPush', { frames: [
  [0.18, P({ t: -8, h: 0, aA: [70, 100], aB: [66, 104], lA: [18, -16], lB: [-14, -10] })],
  [0.05, P({ t: 16, h: 6, x: 0.06, aA: [92, 2], aB: [88, 4], lA: [30, -20], lB: [-24, -8] })],
  [0.35, P({ t: 15, h: 5, x: 0.06, aA: [92, 2], aB: [88, 4], lA: [30, -20], lB: [-24, -8] })],
  [0.2, STAND],
] });
defineClip('tkPull', { frames: [
  [0.18, P({ t: 8, h: 4, aA: [94, 4], aB: [20, 30], lA: [18, -16], lB: [-14, -10] })],
  [0.1, P({ t: -14, h: -6, aA: [40, 130], aB: [10, 30], lA: [10, -10], lB: [-24, -14] })],
  [0.4, P({ t: -12, h: -5, aA: [42, 128], aB: [10, 30], lA: [10, -10], lB: [-24, -14] })],
  [0.2, STAND],
] });
// a fist held up in front, squeezing
defineClip('tkChoke', { frames: [
  [0.3, P({ t: -2, h: -6, aA: [130, 30], aB: [10, 20], lA: [12, -10], lB: [-10, -8] })],
  [3.6, P({ t: -4, h: -8, aA: [136, 26], aB: [10, 20], lA: [12, -10], lB: [-10, -8] })],
] });
defineClip('tkShield', { frames: [
  [0.2, P({ t: -4, h: 0, aA: [96, 6], aB: [30, 60], lA: [24, -20], lB: [-22, -10] })],
  [6, P({ t: -5, h: 0, aA: [97, 6], aB: [30, 60], lA: [24, -20], lB: [-22, -10] })],
] });
defineClip('tkSlam', { loop: true, frames: [
  [0.38, P({ t: -6, h: -8, aA: [156, 8], aB: [20, 20], lA: [14, -12], lB: [-10, -8] })],
  [0.16, P({ t: 14, h: 10, aA: [66, 14], aB: [20, 20], lA: [22, -20], lB: [-14, -10] })],
] });
// hanging in the air, knees up, hands out a little, glowing
defineClip('tkFloat', { loop: true, frames: [
  [0.8, P({ t: 0, h: -4, aA: [40, 10], aB: [34, 14], lA: [70, -110], lB: [60, -120] })],
  [0.8, P({ t: 1, h: -3, aA: [44, 12], aB: [38, 16], lA: [72, -114], lB: [62, -122] })],
] });

/* --------------------------------- durability --------------------------------- */

// feet planted wide, forearms up in front of the face, chin down: let it come
defineClip('braceSelf', { frames: [
  [0.15, P({ t: 10, h: 12, aA: [70, 120], aB: [64, 128], lA: [26, -26], lB: [-26, -20] })],
  [3.5, P({ t: 12, h: 14, aA: [74, 126], aB: [68, 132], lA: [28, -30], lB: [-28, -22] })],
  [0.25, STAND],
] });
// walking into it: chin down, chest out, hands a little forward
defineClip('toughWalk', { mask: 'upper', loop: true, frames: [
  [0.4, P({ t: 6, h: 6, aA: [34, 40], aB: [26, 46] })],
  [0.4, P({ t: 7, h: 7, aA: [30, 44], aB: [30, 42] })],
] });
// both hands into the chest, hard
defineClip('shoveHard', { frames: [
  [0.08, P({ t: -4, h: 2, aA: [70, 110], aB: [64, 116], lA: [16, -16], lB: [-14, -12] })],
  [0.06, P({ t: 18, h: 8, x: 0.1, aA: [92, 6], aB: [88, 10], lA: [30, -22], lB: [-22, -10] })],
  [0.3, P({ t: 16, h: 7, x: 0.1, aA: [90, 8], aB: [86, 12], lA: [28, -20], lB: [-22, -10] })],
  [0.25, STAND],
] });
// back, and the forehead into theirs
defineClip('headbutt', { frames: [
  [0.14, P({ t: -14, s: -6, h: -16, aA: [60, 90], aB: [54, 96], lA: [14, -14], lB: [-12, -10] })],
  [0.06, P({ t: 26, s: 10, h: 24, x: 0.12, aA: [70, 80], aB: [64, 86], lA: [30, -26], lB: [-22, -10] })],
  [0.25, P({ t: 22, s: 8, h: 20, x: 0.1, aA: [66, 84], aB: [60, 90], lA: [28, -24], lB: [-20, -10] })],
  [0.25, STAND],
] });
// curled up in the air, elbows out, coming down on them
defineClip('slamTuck', { loop: true, frames: [
  [0.3, P({ t: 30, h: 16, aA: [100, 120], aB: [94, 126], lA: [70, -100], lB: [60, -96] })],
  [0.3, P({ t: 32, h: 18, aA: [104, 118], aB: [96, 124], lA: [74, -104], lB: [62, -98] })],
] });
// down: a crouch, a fist on the floor
defineClip('slamLand', { frames: [
  [0.06, P({ t: 42, h: 22, aA: [72, 10], aB: [30, 60], lA: [84, -118], lB: [30, -104] })],
  [0.5, P({ t: 40, h: 20, aA: [74, 12], aB: [30, 60], lA: [82, -116], lB: [30, -102] })],
  [0.3, STAND],
] });
// arms spread, chest out, between the gun and whoever it is pointed at
defineClip('shieldArms', { loop: true, frames: [
  [0.5, P({ t: -4, h: -4, aA: [124, 8], aB: [-58, 10], lA: [20, -12], lB: [-20, -10] })],
  [0.5, P({ t: -5, h: -5, aA: [120, 10], aB: [-62, 12], lA: [20, -12], lB: [-20, -10] })],
] });
// flat out, onto it
defineClip('smotherDive', { frames: [
  [0.12, P({ t: 30, h: 10, aA: [120, 10], aB: [110, 14], lA: [40, -60], lB: [-10, -30] })],
  [0.2, P({ rot: 40, t: 20, h: -10, aA: [160, 6], aB: [150, 10], lA: [-10, -10], lB: [-20, -6] })],
] });
// head down, shoulder first: running straight through them
defineClip('ramCharge', { mask: 'upper', loop: true, frames: [
  [0.2, P({ t: 30, s: 12, h: -4, aA: [40, 100], aB: [20, 110] })],
  [0.2, P({ t: 31, s: 12, h: -4, aA: [36, 104], aB: [24, 106] })],
] });
// a bare hand out, closing on the blade, and the blade wrenched away
defineClip('bladeCatch', { frames: [
  [0.12, P({ t: 6, h: 4, aA: [100, 30], aB: [30, 60], lA: [20, -18], lB: [-16, -12] })],
  [0.1, P({ t: 8, h: 6, x: 0.05, aA: [104, 10], aB: [30, 60], lA: [24, -20], lB: [-16, -12] })],
  [0.35, P({ t: -4, h: 0, aA: [60, 120], aB: [30, 60], lA: [16, -14], lB: [-14, -10] })],
  [0.25, STAND],
] });
// arms wide, chest out, chin up: come on, then
defineClip('tauntWide', { frames: [
  [0.25, P({ t: -10, s: -6, h: -12, aA: [116, 20], aB: [-70, 20], lA: [22, -10], lB: [-22, -8] })],
  [3.7, P({ t: -12, s: -8, h: -14, aA: [120, 24], aB: [-74, 24], lA: [22, -10], lB: [-22, -8] })],
  [0.3, STAND],
] });
// everything off them at once: a crouch, and up and out
defineClip('shrugBurst', { frames: [
  [0.08, P({ t: 20, h: 10, aA: [40, 120], aB: [30, 126], lA: [40, -60], lB: [-20, -40] })],
  [0.1, P({ t: -14, s: -6, h: -12, aA: [150, 20], aB: [-80, 20], lA: [20, -10], lB: [-20, -8] })],
  [0.35, P({ t: -10, h: -8, aA: [140, 30], aB: [-70, 30], lA: [18, -10], lB: [-18, -8] })],
  [0.3, STAND],
] });

/* -------------------------------- laser vision -------------------------------- */

// a hard stare: chin down, shoulders set, fists clenched
defineClip('laserStare', { loop: true, frames: [
  [0.12, P({ t: 8, h: 6, aA: [-8, 34], aB: [-4, 38], lA: [18, -12], lB: [-18, -10] })],
  [0.12, P({ t: 9, h: 7, aA: [-9, 36], aB: [-5, 40], lA: [18, -12], lB: [-18, -10] })],
] });
// looking down at the floor in front, and up and out across it
defineClip('laserSweep', { frames: [
  [0.15, P({ t: 12, h: 28, aA: [-10, 30], aB: [-6, 34], lA: [20, -14], lB: [-20, -12] })],
  [1.25, P({ t: 5, h: 0, aA: [-12, 32], aB: [-8, 36], lA: [20, -14], lB: [-20, -12] })],
  [0.25, STAND],
] });
// a bolt, and another, and another: the head jerks with each one
defineClip('laserBlink', { loop: true, frames: [
  [0.07, P({ t: 6, h: 4, aA: [-8, 30], aB: [-4, 34], lA: [16, -12], lB: [-16, -10] })],
  [0.07, P({ t: 3, h: -2, aA: [-10, 32], aB: [-6, 36], lA: [16, -12], lB: [-16, -10] })],
] });
// knees bent, fists clenched at the sides, head down: something building up behind the eyes
defineClip('laserCharge', { frames: [
  [0.3, P({ t: 14, h: 22, aA: [-20, 60], aB: [-16, 64], lA: [30, -40], lB: [-26, -30] })],
  [1.2, P({ t: 16, h: 26, aA: [-22, 64], aB: [-18, 68], lA: [32, -44], lB: [-28, -32] })],
] });
// and out: the head up, the body thrown back by it
defineClip('laserRelease', { frames: [
  [0.06, P({ t: -14, s: -6, h: -2, aA: [-40, 24], aB: [-36, 28], lA: [12, -10], lB: [-32, -22] })],
  [0.7, P({ t: -12, s: -5, h: 0, aA: [-38, 22], aB: [-34, 26], lA: [12, -10], lB: [-30, -20] })],
  [0.3, STAND],
] });
// a flash: head down, then up wide-eyed, arms flung back
defineClip('eyeFlash', { frames: [
  [0.1, P({ t: 12, h: 20, aA: [20, 60], aB: [16, 64], lA: [20, -20], lB: [-18, -14] })],
  [0.08, P({ t: -10, h: -8, aA: [-50, 20], aB: [-46, 24], lA: [16, -10], lB: [-20, -12] })],
  [0.35, P({ t: -8, h: -6, aA: [-46, 22], aB: [-42, 26], lA: [16, -10], lB: [-20, -12] })],
  [0.25, STAND],
] });
