/* =============================================================================
   SHIN GODZILLA - how he is built (body.js does the rest: the posture, the
   steps, the tail's swing, his shape).

   Bigger than the 1954 one - about eighteen metres - and built nothing like
   him: legs like towers, huge in the thigh; a body standing nearly straight
   up, the belly low and heavy and the top of the back hunched; a long neck
   going up and out of it, and on the end of it a small head held level or
   down, a long lower jaw that juts past the upper one - and splits in two
   down the middle when the beam is coming. Two tiny arms hang limp from his
   chest. His tail is longer than all the rest of him and does not lie on
   the ground: it is held up behind him in a long rising curve, and it ends
   in a knot of bone.
   ========================================================================== */
import { clamp } from '../../core/util.js';
import { ik, add } from './body.js';

/** For the moves: how big he is against the suit numbers they are written in. */
const K = 1.5;
export const SD = {
  hipY: 8.1, hipX: -0.5, thigh: 4.2, shin: 3.9, ankle: 1.15,
  torso: 6.4, neck: 5.0, upper: 1.15, fore: 1.25,
  tailN: 18, tailSeg: 1.0,
  // round each part, for what hits it
  belly: 2.85, chestR: 2.1, neckR: 1.35, skull: 0.85, snoutR: 0.5, jawR: 0.55,
  thighR: 1.95, shinR: 1.3, footR: 0.75, upperR: 0.42, foreR: 0.36,
};
/** His head, against the rest of him: small. (A unit of the head's own frame, in metres.) */
export const SHK = 0.95;
const STANCE = { A: 0.95, B: -0.85 };

/** How thick his tail is, at point i of it. */
export const shinTailR = (i) => 1.75 * Math.pow(Math.max(0, 1 - i / SD.tailN), 1.1) + 0.16;

const POSTURE = ['bend', 'crouch', 'rear', 'neck', 'head', 'jaw', 'split', 'tailLift', 'tailHover', 'lean'];

function solveShin(g) {
  const sk = {};
  // the body: nearly upright, leaning over more as he bends
  const a = 0.08 + g.bend * 0.95 - g.rear * 0.3 + g.lean;
  const u = { x: Math.sin(a), y: Math.cos(a) }, n = { x: Math.cos(a), y: -Math.sin(a) };
  const hip = { x: SD.hipX - g.bend * 0.9 + g.rear * 0.3, y: SD.hipY - g.crouch * 2.2 - g.bend * 0.6 - g.bob };
  const along = (t, o) => ({ x: hip.x + u.x * SD.torso * t + n.x * o, y: hip.y + u.y * SD.torso * t + n.y * o });
  sk.a = a; sk.u = u; sk.n = n;
  sk.hip = hip;
  sk.belly = along(0.36, 0.7);
  sk.chest = along(1, -0.1);
  // the hunch: the top of his back, bulging out behind the chest - the biggest plates stand on it
  sk.hump = along(0.8, -1.5);
  // the arms come out of the front of his chest, low
  sk.shoulder = along(0.86, 1.45);
  sk.shoulderB = along(0.88, 1.15);
  // the neck: long, up and forward out of the top of him, bowed back a little in the middle
  const an = a + 0.72 + g.neck - g.rear * 0.55;
  sk.an = an;
  sk.neckMid = { x: sk.chest.x + Math.sin(an - 0.22) * SD.neck * 0.5, y: sk.chest.y + Math.cos(an - 0.22) * SD.neck * 0.5 };
  sk.neckTop = { x: sk.chest.x + Math.sin(an) * SD.neck, y: sk.chest.y + Math.cos(an) * SD.neck };
  // the head, held out level - or lower - on the end of it
  const phi = clamp(-(an - 1.0) * 0.7 + g.head + g.rear * 0.75 - 0.12, -1.6, 1.1);
  sk.phi = phi;
  const F = { x: Math.cos(phi), y: Math.sin(phi) }, U = { x: -Math.sin(phi), y: Math.cos(phi) };
  const hd = (f, v) => ({ x: sk.neckTop.x + (F.x * f + U.x * v) * SHK, y: sk.neckTop.y + (F.y * f + U.y * v) * SHK });
  sk.F = F; sk.U = U; sk.hd = hd;
  sk.head = hd(0.7, 0.12);
  sk.snout = hd(2.55, -0.05);
  sk.hinge = hd(0.15, -0.38);
  // the lower jaw: open by `jaw` - and split by `split`, the two halves of it parting and dropping far further
  const ja = g.jaw * 0.85 + g.split * 0.5;
  sk.jawA = ja;
  sk.splitA = g.split * 0.4;
  const J = { x: Math.cos(phi - ja), y: Math.sin(phi - ja) };
  sk.jawTip = { x: sk.hinge.x + J.x * 2.65 * SHK, y: sk.hinge.y + J.y * 2.65 * SHK };
  sk.jawDir = J;
  sk.mouth = { x: (sk.snout.x * 0.5 + sk.jawTip.x * 0.5) * 0.8 + sk.hinge.x * 0.2, y: (sk.snout.y * 0.5 + sk.jawTip.y * 0.5) * 0.8 + sk.hinge.y * 0.2 };
  // (where the beam comes out: the back of his throat, between the jaws)
  sk.throat = hd(1.1, -0.45);
  sk.eye = hd(1.05, 0.14);
  // the legs: each hip joint to its ankle, the knee forward
  sk.legs = {};
  for (const s of ['A', 'B']) {
    const ft = g.feet[s];
    const hj = add(hip, s === 'A' ? 0.2 : -0.35, s === 'A' ? -0.3 : -0.1);
    const ankle = { x: ft.lx, y: SD.ankle + ft.lift };
    const r = ik(hj, ankle, SD.thigh, SD.shin, 1);
    const tl = ft.tilt;
    const c = Math.cos(tl), sn = Math.sin(tl);
    const rot = (x, y) => ({ x: r.end.x + x * c - y * sn, y: r.end.y + x * sn + y * c });
    sk.legs[s] = { hip: hj, knee: r.mid, ankle: r.end, heel: rot(-0.95, -SD.ankle), toe: rot(2.15, -SD.ankle), tilt: tl };
  }
  // the arms: tiny, hanging limp in front of him
  sk.arms = {};
  for (const s of ['A', 'B']) {
    const sh = s === 'A' ? sk.shoulder : sk.shoulderB;
    const t = g.hand[s] || armRest(sh, s);
    const r = ik(sh, t, SD.upper, SD.fore, -1);
    sk.arms[s] = { shoulder: sh, elbow: r.mid, hand: r.end };
  }
  sk.tail = g.tail;
  sk.tailBase = add(hip, -n.x * 1.7 - u.x * 0.45, -n.y * 1.7 - u.y * 0.45);
  return sk;
}

/** Where a hand of his hangs, from its shoulder: down and a little forward. */
const armRest = (sh, s) => (s === 'A' ? add(sh, 0.7, -2.1) : add(sh, 0.5, -2.05));

/**
 * Where the tail would be, held as the posture holds it: out from his hips,
 * then rising in a long curve behind him, the end of it lifted - with a slow
 * sway along it.
 */
function tailTargets(g, sk, t) {
  const out = [];
  let p = { x: sk.tailBase.x, y: sk.tailBase.y };
  const N = SD.tailN, L = SD.tailSeg;
  const hover = g.tailHover || 0;
  for (let i = 0; i <= N; i++) {
    out.push(p);
    if (i === N) break;
    const k = i / N;
    let psi = 0.02 - i * 0.042 - g.tailLift * (0.8 + 0.4 * k);
    // the end of it curled up
    if (i > 11) psi -= (i - 11) * 0.09;
    psi += Math.sin(t * 1.1 - i * 0.38) * 0.05 * k;
    const q = { x: p.x - Math.cos(psi) * L, y: p.y - Math.sin(psi) * L };
    const floor = shinTailR(i + 1) * 0.92 + hover;
    if (q.y < floor) q.y = floor;
    p = q;
  }
  return out;
}

export const SHIN_BUILD = {
  key: 'shin', K, D: SD, HK: SHK, STANCE,
  tailN: SD.tailN, tailSeg: SD.tailSeg, tailR: shinTailR,
  posture: POSTURE, jaw0: 0.1, tailInside: false,
  solve: solveShin, tailTargets, armRest,
  // (a tail held up is a stiffer thing than one lying on the ground: it sways less, and slower)
  spring: { w0: 14, w1: 3.4, z0: 0.95, z1: 0.62 },
  gait: { SWING: 1.15, STAND: 0.55, bob: 0.22, lift: 1.1 },
  REACH: { mouthNear: 3.4 * K, mouthFar: 6.6 * K, hand: 2 * K, foot: 3.6 * K, tail: 12 * K },
};
