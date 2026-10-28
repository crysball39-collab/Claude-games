/* =============================================================================
   SHIN GODZILLA - how he is built, in each of his forms (body.js does the
   rest: the posture, the steps, the tail's swing, his shape).

   SECOND FORM  what comes ashore: something like a huge eel that has grown
                legs - long and low, dragging its belly, pushing itself along
                with its back legs; a big head with round, staring eyes, gills
                down the sides of its neck, and no arms to speak of. Its tail
                lies along the ground behind it.
   THIRD FORM   up on its back legs for the first time, unsteady, smaller than
                it will be: the head still big for it, the gills still there,
                two small arms held up in front.
   FOURTH FORM  what he becomes - about eighteen metres: legs like towers,
                huge in the thigh; a body standing nearly straight up, the
                belly low and heavy and the top of the back hunched; a long
                neck, and on the end of it a small head held level or down, a
                long lower jaw that juts past the upper one - and splits in
                two when the beam is coming. Two tiny arms hang limp from his
                chest. His tail is longer than all the rest of him and does
                not lie on the ground: it is held up behind him in a long
                rising curve, and ends in a knot of bone.

   Every form's numbers are its build's own (g.b): D, how big its head is
   (HK), how its tail goes.
   ========================================================================== */
import { clamp } from '../../core/util.js';
import { ik, add } from './body.js';

/* ------------------------------- standing up ------------------------------- */

/** The fourth form's numbers, in metres (the third's are these, smaller, with a bigger head). */
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

const POSTURE = ['bend', 'crouch', 'rear', 'neck', 'head', 'jaw', 'split', 'tailLift', 'tailHover', 'lean'];

/** A tail that tapers from r0 at its root to r1 at the end, over n points. */
const tailOf = (n, r0, r1) => (i) => r0 * Math.pow(Math.max(0, 1 - i / n), 1.1) + r1;

/** The skeleton of a form that stands up (the third and fourth), from its build's numbers. */
function solveUpright(g) {
  const sk = {}, B = g.b, D = B.D, HK = B.HK;
  // the body: nearly upright, leaning over more as he bends
  const a = B.lean0 + g.bend * 0.95 - g.rear * 0.3 + g.lean;
  const u = { x: Math.sin(a), y: Math.cos(a) }, n = { x: Math.cos(a), y: -Math.sin(a) };
  const s = B.s;
  const hip = { x: D.hipX - g.bend * 0.9 * s + g.rear * 0.3 * s, y: D.hipY - g.crouch * 2.2 * s - g.bend * 0.6 * s - g.bob };
  const along = (t, o) => ({ x: hip.x + u.x * D.torso * t + n.x * o, y: hip.y + u.y * D.torso * t + n.y * o });
  sk.a = a; sk.u = u; sk.n = n;
  sk.hip = hip;
  sk.belly = along(0.36, 0.7 * s);
  sk.chest = along(1, -0.1 * s);
  // the hunch: the top of his back, bulging out behind the chest - the biggest plates stand on it
  sk.hump = along(0.8, -1.5 * s);
  // the arms come out of the front of his chest
  sk.shoulder = along(0.86, 1.45 * s);
  sk.shoulderB = along(0.88, 1.15 * s);
  // the neck: up and forward out of the top of him, bowed back a little in the middle
  const an = a + B.neck0 + g.neck - g.rear * 0.55;
  sk.an = an;
  sk.neckMid = { x: sk.chest.x + Math.sin(an - 0.22) * D.neck * 0.5, y: sk.chest.y + Math.cos(an - 0.22) * D.neck * 0.5 };
  sk.neckTop = { x: sk.chest.x + Math.sin(an) * D.neck, y: sk.chest.y + Math.cos(an) * D.neck };
  // the head, held out level - or lower - on the end of it
  const phi = clamp(-(an - 1.0) * 0.7 + g.head + g.rear * 0.75 - 0.12, -1.6, 1.1);
  sk.phi = phi;
  const F = { x: Math.cos(phi), y: Math.sin(phi) }, U = { x: -Math.sin(phi), y: Math.cos(phi) };
  const hd = (f, v) => ({ x: sk.neckTop.x + (F.x * f + U.x * v) * HK, y: sk.neckTop.y + (F.y * f + U.y * v) * HK });
  sk.F = F; sk.U = U; sk.hd = hd;
  sk.head = hd(0.7, 0.12);
  sk.snout = hd(2.55, -0.05);
  sk.hinge = hd(0.15, -0.38);
  // the lower jaw: open by `jaw` - and split by `split`, the two halves of it parting and dropping far further
  const ja = g.jaw * 0.85 + g.split * 0.5;
  sk.jawA = ja;
  sk.splitA = g.split * 0.4;
  const J = { x: Math.cos(phi - ja), y: Math.sin(phi - ja) };
  sk.jawTip = { x: sk.hinge.x + J.x * 2.65 * HK, y: sk.hinge.y + J.y * 2.65 * HK };
  sk.jawDir = J;
  sk.mouth = { x: (sk.snout.x * 0.5 + sk.jawTip.x * 0.5) * 0.8 + sk.hinge.x * 0.2, y: (sk.snout.y * 0.5 + sk.jawTip.y * 0.5) * 0.8 + sk.hinge.y * 0.2 };
  // (where the beam comes out: the back of his throat, between the jaws)
  sk.throat = hd(1.1, -0.45);
  sk.eye = hd(1.05, 0.14);
  legsOf(g, sk, hip, [0.2 * s, -0.3 * s], [-0.35 * s, -0.1 * s]);
  armsOf(g, sk);
  sk.tail = g.tail;
  sk.tailBase = add(hip, -n.x * 1.7 * s - u.x * 0.45 * s, -n.y * 1.7 * s - u.y * 0.45 * s);
  return sk;
}

/** The legs: each hip joint to its ankle, the knee forward. */
function legsOf(g, sk, hip, offA, offB) {
  const D = g.b.D;
  sk.legs = {};
  for (const s of ['A', 'B']) {
    const ft = g.feet[s];
    const o = s === 'A' ? offA : offB;
    const hj = add(hip, o[0], o[1]);
    const ankle = { x: ft.lx, y: D.ankle + ft.lift };
    const r = ik(hj, ankle, D.thigh, D.shin, 1);
    const tl = ft.tilt;
    const c = Math.cos(tl), sn = Math.sin(tl);
    const rot = (x, y) => ({ x: r.end.x + x * c - y * sn, y: r.end.y + x * sn + y * c });
    sk.legs[s] = { hip: hj, knee: r.mid, ankle: r.end, heel: rot(g.b.heel, -D.ankle), toe: rot(g.b.toe, -D.ankle), tilt: tl };
  }
}

/** The arms: where they rest, unless something has a hand of his somewhere else. */
function armsOf(g, sk) {
  const D = g.b.D;
  sk.arms = {};
  for (const s of ['A', 'B']) {
    const sh = s === 'A' ? sk.shoulder : sk.shoulderB;
    const t = g.hand[s] || g.b.armRest(sh, s);
    const r = ik(sh, t, D.upper, D.fore, -1);
    sk.arms[s] = { shoulder: sh, elbow: r.mid, hand: r.end };
  }
}

/**
 * Where the tail would be, held as the posture holds it: out from his hips,
 * then - as high as the build holds it (rise) - up in a long curve behind him,
 * the end of it lifted; with a slow sway along it (and, crawling, a wriggle).
 */
function tailTargets(g, sk, t) {
  const out = [], B = g.b;
  let p = { x: sk.tailBase.x, y: sk.tailBase.y };
  const N = B.tailN, L = B.tailSeg;
  const hover = g.tailHover || 0;
  const wriggle = B.wriggle ? Math.min(1, Math.abs(g.walkV || 0) * 0.8) * B.wriggle : 0;
  for (let i = 0; i <= N; i++) {
    out.push(p);
    if (i === N) break;
    const k = i / N;
    let psi = B.tail0 - i * B.rise - g.tailLift * (0.8 + 0.4 * k);
    // the end of it curled up
    if (i > B.curlFrom) psi -= (i - B.curlFrom) * B.curl;
    psi += Math.sin(t * 1.1 - i * 0.38) * 0.05 * k + Math.sin(t * 5 - i * 0.7) * wriggle * k;
    const q = { x: p.x - Math.cos(psi) * L, y: p.y - Math.sin(psi) * L };
    const floor = B.tailR(i + 1) * 0.92 + hover;
    if (q.y < floor) q.y = floor;
    p = q;
  }
  return out;
}

export const SHIN_BUILD = {
  key: 'shin', K: 1.5, D: SD, HK: SHK, s: 1, STANCE: { A: 0.95, B: -0.85 },
  tailN: SD.tailN, tailSeg: SD.tailSeg, tailR: tailOf(SD.tailN, 1.75, 0.16),
  posture: POSTURE, jaw0: 0.1, tailInside: false,
  lean0: 0.08, neck0: 0.72, heel: -0.95, toe: 2.15,
  tail0: 0.02, rise: 0.042, curlFrom: 11, curl: 0.09,
  solve: solveUpright, tailTargets,
  /** Where a hand of his hangs, from its shoulder: down and a little forward. */
  armRest: (sh, s) => (s === 'A' ? add(sh, 0.7, -2.1) : add(sh, 0.5, -2.05)),
  // (a tail held up is a stiffer thing than one lying on the ground: it sways less, and slower)
  spring: { w0: 14, w1: 3.4, z0: 0.95, z1: 0.62 },
  gait: { SWING: 1.15, STAND: 0.55, bob: 0.22, lift: 1.1 },
  REACH: { mouthNear: 5.1, mouthFar: 9.9, hand: 3, foot: 5.4, tail: 18 },
};

/** The third form: the fourth's frame at six tenths the size, with a bigger head, a shorter neck - and a tail still dragged. */
const f3 = 0.62;
const TD = Object.fromEntries(Object.entries(SD).map(([k, v]) => [k, k === 'tailN' ? 16 : v * f3]));
Object.assign(TD, { neck: SD.neck * 0.5, skull: SD.skull * 0.85, snoutR: SD.snoutR * 0.85, jawR: SD.jawR * 0.85, upper: 0.85, fore: 0.85, upperR: 0.3, foreR: 0.26, tailSeg: 0.82 });
export const SHINAGAWA_BUILD = {
  key: 'shinagawa', K: 1.0, D: TD, HK: 0.78, s: f3, STANCE: { A: 0.6, B: -0.55 },
  tailN: 16, tailSeg: TD.tailSeg, tailR: tailOf(16, 1.2, 0.12),
  posture: POSTURE, jaw0: 0.12, tailInside: false,
  lean0: 0.22, neck0: 0.85, heel: -0.6, toe: 1.35,
  tail0: 0.22, rise: 0.012, curlFrom: 12, curl: 0.05,
  solve: solveUpright, tailTargets,
  // (its little arms held up in front of it, the hands hanging)
  armRest: (sh, s) => (s === 'A' ? add(sh, 1.15, -0.25) : add(sh, 0.95, -0.15)),
  spring: { w0: 14, w1: 4, z0: 0.95, z1: 0.55 },
  gait: { SWING: 0.95, STAND: 0.5, bob: 0.28, lift: 1.0 },
  REACH: { mouthNear: 3.4, mouthFar: 6.6, hand: 2.2, foot: 3.6, tail: 12 },
};

/* --------------------------------- crawling --------------------------------- */

/** The second form's numbers: long and low. */
export const KD = {
  hipY: 2.35, hipX: -0.4, thigh: 1.7, shin: 1.5, ankle: 0.45,
  torso: 6.2, neck: 1.9, upper: 0.32, fore: 0.28,
  tailN: 13, tailSeg: 0.95,
  belly: 2.2, chestR: 1.75, neckR: 1.45, skull: 1.2, snoutR: 0.75, jawR: 0.6,
  thighR: 0.95, shinR: 0.62, footR: 0.45, upperR: 0.24, foreR: 0.2,
};

/** The second form's skeleton: its body lying along the ground, the front of it lifted to look about. */
function solveKamata(g) {
  const sk = {}, D = KD, HK = g.b.HK;
  // the body: lying along the ground, the front a little up (rear: up on its elbows, looking about)
  const a = 1.4 - g.rear * 0.5 + g.bend * 0.25 + g.lean;
  const u = { x: Math.sin(a), y: Math.cos(a) }, n = { x: Math.cos(a), y: -Math.sin(a) };
  const hip = { x: D.hipX - g.bend * 0.3, y: D.hipY - g.crouch * 0.6 - g.bob };
  const along = (t, o) => ({ x: hip.x + u.x * D.torso * t + n.x * o, y: hip.y + u.y * D.torso * t + n.y * o });
  sk.a = a; sk.u = u; sk.n = n;
  sk.hip = hip;
  // (n is toward its belly: down)
  sk.belly = along(0.5, 0.35);
  sk.chest = along(1, 0.15);
  sk.hump = along(0.45, -1.1);
  sk.shoulder = along(0.86, 1.25);
  sk.shoulderB = along(0.88, 1.05);
  // the neck: short and thick, out of the front of it, the head held out on it
  const an = a - 0.3 + g.neck - g.rear * 0.35;
  sk.an = an;
  sk.neckMid = { x: sk.chest.x + Math.sin(an) * D.neck * 0.5, y: sk.chest.y + Math.cos(an) * D.neck * 0.5 };
  sk.neckTop = { x: sk.chest.x + Math.sin(an) * D.neck, y: sk.chest.y + Math.cos(an) * D.neck };
  const phi = clamp(-(an - 1.35) * 0.5 + g.head + g.rear * 0.45 - 0.06, -1.2, 1.0);
  sk.phi = phi;
  const F = { x: Math.cos(phi), y: Math.sin(phi) }, U = { x: -Math.sin(phi), y: Math.cos(phi) };
  const hd = (f, v) => ({ x: sk.neckTop.x + (F.x * f + U.x * v) * HK, y: sk.neckTop.y + (F.y * f + U.y * v) * HK });
  sk.F = F; sk.U = U; sk.hd = hd;
  sk.head = hd(0.8, 0.15);
  sk.snout = hd(2.6, -0.1);
  sk.hinge = hd(0.1, -0.42);
  const ja = g.jaw * 0.75;
  sk.jawA = ja;
  sk.splitA = 0;
  const J = { x: Math.cos(phi - ja), y: Math.sin(phi - ja) };
  sk.jawTip = { x: sk.hinge.x + J.x * 2.55 * HK, y: sk.hinge.y + J.y * 2.55 * HK };
  sk.jawDir = J;
  sk.mouth = { x: (sk.snout.x * 0.5 + sk.jawTip.x * 0.5) * 0.8 + sk.hinge.x * 0.2, y: (sk.snout.y * 0.5 + sk.jawTip.y * 0.5) * 0.8 + sk.hinge.y * 0.2 };
  sk.throat = hd(1.0, -0.45);
  // the eyes: big and round, high up on the head
  sk.eye = hd(1.2, 0.62);
  legsOf(g, sk, hip, [0.15, -0.35], [-0.3, -0.2]);
  armsOf(g, sk);
  sk.tail = g.tail;
  sk.tailBase = along(-0.12, 0.25);
  return sk;
}

export const KAMATA_BUILD = {
  key: 'kamata', K: 1.1, D: KD, HK: 1.1, s: 0.5, STANCE: { A: 0.45, B: -0.55 },
  tailN: KD.tailN, tailSeg: KD.tailSeg, tailR: tailOf(KD.tailN, 1.55, 0.14),
  posture: POSTURE, jaw0: 0.18, tailInside: true,
  heel: -0.55, toe: 1.25,
  // (the tail lies along the ground behind it - and wriggles as it goes)
  tail0: 0.22, rise: 0.0, curlFrom: 99, curl: 0, wriggle: 0.16,
  solve: solveKamata, tailTargets,
  // (no arms to speak of: two little stumps under the chest)
  armRest: (sh, s) => (s === 'A' ? add(sh, 0.3, -0.42) : add(sh, 0.22, -0.4)),
  spring: { w0: 13, w1: 4, z0: 0.95, z1: 0.5 },
  gait: { SWING: 0.8, STAND: 0.45, bob: 0.18, lift: 0.55 },
  // (its head is far out in front of its feet: it needs that much room at the end of the world)
  front: 11, back: 3,
  wideProxy: true,
  REACH: { mouthNear: 6, mouthFar: 11, hand: 0, foot: 2, tail: 12 },
};

/** The forms' builds, by number. */
export const SHIN_BUILDS = { 2: KAMATA_BUILD, 3: SHINAGAWA_BUILD, 4: SHIN_BUILD };
