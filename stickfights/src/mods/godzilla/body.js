/* =============================================================================
   GODZILLA - his body: where every part of him is, step by step.

   He is drawn and hit as what he is, not as a stickman: two thick legs, a
   heavy body leaning forward over them, short arms held up in front, a
   neck, a head - and a tail as long as the rest of him, lying along the
   ground behind. All of it is worked out in his own frame (x the way he
   faces, y up, from the ground between his feet) and put into the world at
   the end, so the same numbers draw him (look.js) and say what a bullet
   hit (the shape: round-ended pieces, for stickman.js).

   What moves him is a handful of numbers his moves set goals for, and this
   eases toward: how far he bends over, how low he crouches, how he holds
   his neck and his head, how wide his jaw is, where each hand is reaching,
   how high his tail is held - and his turn, which is how he faces about (a
   flat thing turning on the spot, the way a cut-out on a stage would).

   His feet are planted in the world and stay there until they step: a step
   is one foot lifted, carried forward and put down again, heavily.
   ========================================================================== */
import { clamp, lerp, smooth } from '../../core/util.js';
import { HEAD_BONE } from '../../game/skeleton.js';

/** How much bigger than the suit this is all drawn: the suit's numbers are below. */
const K = 1.15;
export const D = {
  hipY: 5.3 * K, hipX: -0.3 * K, thigh: 2.75 * K, shin: 2.65 * K, ankle: 0.8 * K,
  torso: 4.3 * K, neck: 2.2 * K, upper: 1.8 * K, fore: 1.7 * K,
  tailN: 16, tailSeg: 0.8 * K,
  // round each part, for what hits it
  belly: 2.05 * K, chestR: 1.65 * K, neckR: 1.3 * K, skull: 0.86 * K, snoutR: 0.65 * K, jawR: 0.42 * K,
  thighR: 1.25 * K, shinR: 0.92 * K, footR: 0.55 * K, upperR: 0.68 * K, foreR: 0.56 * K,
};
/** How big his head is, against the rest of him: small, the 1954 way. */
const HK = 0.9;
/** Where his feet stand, standing still: the near one a little in front, the far one behind. */
const STANCE = { A: 0.65 * K, B: -0.55 * K };

/** How thick his tail is, at point i of it. */
export const tailR = (i) => K * (1.3 * Math.pow(Math.max(0, 1 - i / D.tailN), 1.15) + 0.1);

const POSTURE = ['bend', 'crouch', 'rear', 'neck', 'head', 'jaw', 'tailLift', 'tailHover', 'lean'];

export function newBody(man) {
  const f = man.facing, x = man.pos.x;
  const g = {
    goal: {}, rate: 3.5,
    hands: { A: null, B: null },
    hand: { A: null, B: null },
    feet: { A: { x: x + f * STANCE.A, lx: STANCE.A, lift: 0, tilt: 0 }, B: { x: x + f * STANCE.B, lx: STANCE.B, lift: 0, tilt: 0 } },
    swing: null, lastLand: -9, lastFoot: 'B', walkV: 0,
    raised: null,
    yaw: 0, sx: f, bob: 0, t: 0,
    tail: [], tailV: [],
    sk: null, caps: [], lastX: x,
  };
  for (const k of POSTURE) g[k] = g.goal[k] = 0;
  g.jaw = g.goal.jaw = 0.06;
  // the tail laid out where it would rest
  const sk = solve(g);
  for (const p of tailTargets(g, sk, 0)) { g.tail.push({ x: p.x, y: p.y }); g.tailV.push({ x: 0, y: 0 }); }
  g.sk = solve(g);
  return g;
}

/* --------------------------------- the frame --------------------------------- */

/** A point of his, in the world. */
export function toWorld(g, man, p) { return { x: man.pos.x + g.sx * p.x, y: man.pos.y + p.y }; }
/** A point in the world, in his frame. */
export function toLocal(g, man, x, y) { return { x: (x - man.pos.x) / g.sx, y: y - man.pos.y }; }

const add = (p, x, y) => ({ x: p.x + x, y: p.y + y });

/** Two bones from `a` toward `t`, lengths l1 and l2, the joint between them bent to `side` (+1 counter-clockwise). */
function ik(a, t, l1, l2, side) {
  let dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy) || 1e-6;
  const max = (l1 + l2) * 0.998, min = Math.abs(l1 - l2) + 0.05;
  if (d > max) { dx *= max / d; dy *= max / d; d = max; }
  if (d < min) { dx *= min / d; dy *= min / d; d = min; }
  const ang = Math.atan2(dy, dx);
  const b = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const m = ang + side * b;
  return { mid: { x: a.x + Math.cos(m) * l1, y: a.y + Math.sin(m) * l1 }, end: { x: a.x + dx, y: a.y + dy } };
}

/**
 * The skeleton, in his frame, from the posture and where his feet and hands
 * are. Every point the drawing and the shape need.
 */
export function solve(g) {
  const sk = {};
  // the body: bent over from the hips, the hips going back and down as it does
  const a = 0.22 + g.bend * 1.05 - g.rear * 0.32 + g.lean;
  const u = { x: Math.sin(a), y: Math.cos(a) }, n = { x: Math.cos(a), y: -Math.sin(a) };
  const hip = { x: D.hipX - g.bend * 0.65 * K + g.rear * 0.25 * K, y: D.hipY - g.crouch * 1.4 * K - g.bend * 0.45 * K - g.bob };
  const along = (t, o) => ({ x: hip.x + u.x * D.torso * t + n.x * o, y: hip.y + u.y * D.torso * t + n.y * o });
  sk.a = a; sk.u = u; sk.n = n;
  sk.hip = hip;
  sk.belly = along(0.42, 0.45 * K);
  sk.chest = along(1, 0);
  sk.shoulder = along(0.9, 0.5 * K);
  sk.shoulderB = along(0.92, 0.3 * K);
  // the neck and head: the neck forward of the body, the head on the end of it
  const an = a + 0.45 + g.neck - g.rear * 0.55;
  sk.an = an;
  sk.neckTop = { x: sk.chest.x + Math.sin(an) * D.neck, y: sk.chest.y + Math.cos(an) * D.neck };
  const phi = clamp(-(an - 0.67) * 0.75 + g.head + g.rear * 0.7, -1.5, 1.1);
  sk.phi = phi;
  const F = { x: Math.cos(phi), y: Math.sin(phi) }, U = { x: -Math.sin(phi), y: Math.cos(phi) };
  const hd = (f, v) => ({ x: sk.neckTop.x + (F.x * f + U.x * v) * K * HK, y: sk.neckTop.y + (F.y * f + U.y * v) * K * HK });
  sk.F = F; sk.U = U; sk.hd = hd;
  sk.head = hd(0.55, 0.38);
  sk.snout = hd(2.3, 0.02);
  sk.hinge = hd(0.25, -0.3);
  const ja = g.jaw * 0.8;
  sk.jawA = ja;
  const J = { x: Math.cos(phi - ja), y: Math.sin(phi - ja) };
  sk.jawTip = { x: sk.hinge.x + J.x * 1.95 * K * HK, y: sk.hinge.y + J.y * 1.95 * K * HK };
  sk.jawDir = J;
  // where a thing in his mouth is: between the jaws, toward the front
  sk.mouth = { x: (sk.snout.x * 0.55 + sk.jawTip.x * 0.45) * 0.8 + sk.hinge.x * 0.2, y: (sk.snout.y * 0.55 + sk.jawTip.y * 0.45) * 0.8 + sk.hinge.y * 0.2 - 0.1 * K };
  sk.eye = hd(1.13, 0.64);
  // the legs: each hip joint to its ankle, the knee forward
  sk.legs = {};
  for (const s of ['A', 'B']) {
    const ft = g.feet[s];
    const hj = add(hip, s === 'A' ? 0.12 * K : -0.25 * K, s === 'A' ? -0.2 * K : -0.05 * K);
    const ankle = { x: ft.lx, y: D.ankle + ft.lift };
    const r = ik(hj, ankle, D.thigh, D.shin, 1);
    const tl = ft.tilt;
    const c = Math.cos(tl), sn = Math.sin(tl);
    const rot = (x, y) => ({ x: r.end.x + x * c - y * sn, y: r.end.y + x * sn + y * c });
    sk.legs[s] = { hip: hj, knee: r.mid, ankle: r.end, heel: rot(-0.75 * K, -D.ankle), toe: rot(1.6 * K, -D.ankle), tilt: tl };
  }
  // the arms: held up in front, unless they are reaching for something
  sk.arms = {};
  for (const s of ['A', 'B']) {
    const sh = s === 'A' ? sk.shoulder : sk.shoulderB;
    const rest = s === 'A' ? add(sh, 2.1 * K, -0.45 * K) : add(sh, 1.85 * K, -0.3 * K);
    const t = g.hand[s] || rest;
    const r = ik(sh, t, D.upper, D.fore, -1);
    sk.arms[s] = { shoulder: sh, elbow: r.mid, hand: r.end };
  }
  sk.tail = g.tail;
  sk.tailBase = add(hip, -n.x * 1.05 * K - u.x * 0.75 * K, -n.y * 1.05 * K - u.y * 0.75 * K);
  return sk;
}

/** Where the tail would be, at rest, held as the posture holds it: point by point from where it joins him. */
export function tailTargets(g, sk, t) {
  const out = [];
  let p = { x: sk.tailBase.x, y: sk.tailBase.y };
  const N = D.tailN, L = D.tailSeg;
  const hover = g.tailHover || 0;
  for (let i = 0; i <= N; i++) {
    out.push(p);
    if (i === N) break;
    const k = i / N;
    let psi = 1.0 - i * 0.06 - g.tailLift * (0.95 + 0.3 * k);
    // the end of it turned up a little
    if (i > 11) psi -= (i - 11) * 0.11;
    // and a slow sway, more toward the end of it
    psi += Math.sin(t * 1.7 - i * 0.45) * 0.035 * k;
    const q = { x: p.x - Math.cos(psi) * L, y: p.y - Math.sin(psi) * L };
    const floor = tailR(i + 1) * 0.92 + hover;
    if (q.y < floor) q.y = floor;
    p = q;
  }
  return out;
}

/* ----------------------------------- a step ---------------------------------- */

/**
 * The posture eased toward its goal, the feet stepping (or not), the hands
 * reaching, the tail following - and the skeleton and the shape worked out
 * from all of it. `dt` 0 just works the skeleton out again.
 */
export function stepBody(man, dt) {
  const g = man.gz.body;
  g.t += dt;
  // (each at the pace set for it, or the posture's pace)
  for (const key of POSTURE) {
    if (g.goal[key] === undefined) continue;
    const r = (g.rates && g.rates[key]) || g.rate;
    g[key] = lerp(g[key], g.goal[key], 1 - Math.exp(-dt * r));
  }
  g.sx = man.facing * Math.max(0.2, Math.abs(Math.cos(g.yaw)));
  // the feet, in his frame
  for (const s of ['A', 'B']) {
    const ft = g.feet[s];
    ft.lx = (ft.x - man.pos.x) / g.sx;
  }
  // a foot held up by a move goes where the move puts it, in his frame
  if (g.raised) {
    const ft = g.feet[g.raised.foot], r = g.raised;
    const kk = 1 - Math.exp(-dt * (r.rate || 7));
    ft.lift = lerp(ft.lift, r.lift, kk);
    ft.tilt = lerp(ft.tilt, r.tilt || 0, kk);
    if (r.x !== undefined) { ft.lx = lerp(ft.lx, r.x, kk); ft.x = man.pos.x + g.sx * ft.lx; }
  }
  // the hands: toward where they are reaching, at the speed a hand that size moves
  const sk0 = g.sk || solve(g);
  for (const s of ['A', 'B']) {
    const want = g.hands[s];
    const arm = sk0.arms[s];
    const cur = g.hand[s] || { x: arm.hand.x, y: arm.hand.y };
    if (!want && !g.hand[s]) continue;
    const goal = want || (s === 'A' ? add(arm.shoulder, 2.1 * K, -0.45 * K) : add(arm.shoulder, 1.85 * K, -0.3 * K));
    const kk = 1 - Math.exp(-dt * (want && want.rate ? want.rate : 6));
    const nx = lerp(cur.x, goal.x, kk), ny = lerp(cur.y, goal.y, kk);
    g.hand[s] = !want && Math.hypot(nx - goal.x, ny - goal.y) < 0.05 ? null : { x: nx, y: ny };
  }
  let sk = solve(g);
  // the tail: it lags behind as he goes, and swings into place
  if (dt > 0) {
    const moved = (man.pos.x - g.lastX) / (g.sx || 1);
    g.lastX = man.pos.x;
    const tgt = tailTargets(g, sk, g.t);
    const T = g.tail, V = g.tailV, N = D.tailN;
    for (let i = 0; i <= N; i++) {
      const q = T[i], kk = i / N;
      if (i === 0) { q.x = tgt[0].x; q.y = tgt[0].y; continue; }
      // (points along it stay where they were in the world a moment, the further out the longer)
      q.x -= moved * clamp(kk * 1.2, 0, 0.85);
      // a spring to where it would be: stiff near him, looser - and swinging further - toward the end
      const w = lerp(15, 4.2, kk), z = lerp(0.95, 0.5, kk);
      V[i].x += (w * w * (tgt[i].x - q.x) - 2 * z * w * V[i].x) * dt;
      V[i].y += (w * w * (tgt[i].y - q.y) - 2 * z * w * V[i].y) * dt;
      q.x += V[i].x * dt;
      q.y += V[i].y * dt;
    }
    // each piece of it as long as it is
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i <= N; i++) {
        const p = T[i - 1], q = T[i];
        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1e-6;
        const e = (d - D.tailSeg) / d;
        q.x -= dx * e;
        q.y -= dy * e;
        const floor = tailR(i) * 0.9;
        if (q.y < floor) q.y = floor;
      }
    }
    // and never through the walls at the ends of the world
    const sb = man.sandbox;
    for (let i = 1; i <= N; i++) {
      const q = T[i], wx = man.pos.x + g.sx * q.x, r = tailR(i);
      const cx = clamp(wx, sb.left + r, sb.right - r);
      if (cx !== wx) q.x = (cx - man.pos.x) / g.sx;
    }
    sk = solve(g);
  }
  g.sk = sk;
  g.caps = shape(man, g, sk);
  setJoints(man, g, sk);
  return sk;
}

/* --------------------------------- his shape --------------------------------- */

/** The round-ended pieces he is made of, in the world, for whatever touches, grabs or shoots him. */
function shape(man, g, sk) {
  const out = [];
  const W = (p) => toWorld(g, man, p);
  const cap = (p, q, r, part, bone) => {
    const a = W(p), b = W(q);
    out.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y, r, part, bone });
  };
  for (let i = 0; i < D.tailN; i++) cap(sk.tail[i], sk.tail[i + 1], (tailR(i) + tailR(i + 1)) / 2, 'torso', 0);
  for (const s of ['B', 'A']) {
    const L = sk.legs[s], bones = s === 'A' ? [7, 8, 9] : [10, 11, 12], part = 'leg' + s;
    cap(L.hip, L.knee, D.thighR, part, bones[0]);
    cap(L.knee, L.ankle, D.shinR, part, bones[1]);
    cap({ x: L.heel.x + 0.4 * K, y: L.heel.y + D.footR }, { x: L.toe.x - 0.45 * K, y: L.toe.y + D.footR }, D.footR, part, bones[2]);
  }
  cap(sk.hip, sk.belly, D.belly, 'torso', 0);
  cap(sk.belly, sk.chest, D.chestR, 'torso', 1);
  cap(sk.chest, sk.neckTop, D.neckR, 'torso', 1);
  cap(sk.head, sk.snout, D.snoutR, 'head', HEAD_BONE);
  cap(sk.head, sk.head, D.skull, 'head', HEAD_BONE);
  cap(sk.hinge, sk.jawTip, D.jawR, 'head', HEAD_BONE);
  for (const s of ['B', 'A']) {
    const A = sk.arms[s], bones = s === 'A' ? [3, 4] : [5, 6], part = 'arm' + s;
    cap(A.shoulder, A.elbow, D.upperR, part, bones[0]);
    cap(A.elbow, A.hand, D.foreR, part, bones[1]);
  }
  return out;
}

/** The stickman's joints put where his parts are, so the rest of the game knows where to look. */
function setJoints(man, g, sk) {
  const j = man.wj;
  const set = (k, p) => { const w = toWorld(g, man, p); j[k].x = w.x; j[k].y = w.y; };
  set('hip', sk.hip);
  set('chest', sk.belly);
  set('neck', sk.chest);
  set('shoulder', sk.shoulder);
  set('head', sk.head);
  for (const s of ['A', 'B']) {
    const A = sk.arms[s], L = sk.legs[s];
    set('elbow' + s, A.elbow);
    set('hand' + s, A.hand);
    set('knee' + s, L.knee);
    set('foot' + s, L.ankle);
    set('toe' + s, L.toe);
    set('midHum' + s, { x: (A.shoulder.x + A.elbow.x) / 2, y: (A.shoulder.y + A.elbow.y) / 2 });
    set('midFore' + s, { x: (A.elbow.x + A.hand.x) / 2, y: (A.elbow.y + A.hand.y) / 2 });
    set('midFem' + s, { x: (L.hip.x + L.knee.x) / 2, y: (L.hip.y + L.knee.y) / 2 });
    set('midTib' + s, { x: (L.knee.x + L.ankle.x) / 2, y: (L.knee.y + L.ankle.y) / 2 });
  }
  j.headAngle = 0;
}

/** The box round all of him (the tail and all). */
export function boundsOf(g, box) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const c of g.caps) {
    x0 = Math.min(x0, c.x0 - c.r, c.x1 - c.r); x1 = Math.max(x1, c.x0 + c.r, c.x1 + c.r);
    y0 = Math.min(y0, c.y0 - c.r, c.y1 - c.r); y1 = Math.max(y1, c.y0 + c.r, c.y1 + c.r);
  }
  if (x0 === Infinity) return;
  box.minX = x0; box.maxX = x1; box.minY = Math.max(0, y0); box.maxY = y1;
}

/* ----------------------------------- walking ---------------------------------- */

const SWING = 0.85;   // how long a foot is in the air, for a step
const STAND = 0.38;   // and how long both are down between steps

/**
 * His walk: the body goes along at `v` (m/s, signed), and the feet keep up
 * with it, one heavy step at a time; standing still, they come back under
 * him. Calls `landed(foot, x)` when a foot comes down.
 */
export function walk(man, dt, v, landed) {
  const g = man.gz.body, now = man.sandbox.time;
  g.walkV = v;
  const sw = g.swing;
  if (sw) {
    sw.t += dt;
    const u = clamp(sw.t / sw.dur, 0, 1), ft = g.feet[sw.foot];
    ft.x = lerp(sw.x0, sw.x1, smooth(u));
    ft.lift = Math.sin(Math.PI * Math.min(1, u * 1.08)) * sw.h;
    ft.tilt = Math.sin(Math.PI * u) * 0.22 * Math.sign(sw.x1 - sw.x0) * Math.sign(g.sx) * (u < 0.5 ? -0.6 : 1);
    // the body dips as the weight comes down on the other leg
    g.bob = Math.sin(Math.PI * u) * 0.16 * K;
    if (u >= 1) {
      ft.lift = 0; ft.tilt = 0; g.bob = 0;
      g.swing = null;
      g.lastLand = now;
      g.lastFoot = sw.foot;
      if (landed) landed(sw.foot, ft.x, sw);
    }
    return;
  }
  if (g.raised) return;
  const f = man.facing;
  const dir = Math.sign(v);
  if (Math.abs(v) > 0.05) {
    if (now - g.lastLand < STAND) return;
    // the foot further behind goes next
    const behind = (s) => (g.feet[s].x - man.pos.x) * dir;
    const foot = behind('A') < behind('B') ? 'A' : 'B';
    const s = Math.abs(v) * (SWING + STAND);
    const land = man.pos.x + v * SWING;
    const x1 = land + dir * s * 0.5 + (foot === 'A' ? 0.12 : -0.12) * f * K;
    if (Math.abs(x1 - g.feet[foot].x) < 0.25) return;
    g.swing = { foot, x0: g.feet[foot].x, x1, t: 0, dur: SWING, h: clamp(Math.abs(x1 - g.feet[foot].x) * 0.32, 0.45, 1.25) * K };
    return;
  }
  // standing: a foot that is not where it stands goes back there
  for (const foot of ['A', 'B']) {
    const want = man.pos.x + f * STANCE[foot];
    if (Math.abs(g.feet[foot].x - want) > 0.55 * K && now - g.lastLand > 0.25) {
      g.swing = { foot, x0: g.feet[foot].x, x1: want, t: 0, dur: SWING * 0.85, h: 0.6 * K, settle: true };
      return;
    }
  }
}

/* ------------------------------ aiming his mouth ------------------------------ */

let table = null;

/** The posture that puts his mouth nearest a point in his frame: { bend, crouch, neck, head, at }. */
export function aimMouth(target) {
  if (!table) {
    table = [];
    const g = { bend: 0, crouch: 0, rear: 0, neck: 0, head: 0, jaw: 0.5, tailLift: 0, lean: 0, bob: 0, feet: { A: { lx: 0.6, lift: 0, tilt: 0 }, B: { lx: -0.6, lift: 0, tilt: 0 } }, hand: {}, tail: [] };
    for (let b = -0.3; b <= 1.001; b += 0.1) {
      for (let nk = -0.5; nk <= 0.7; nk += 0.1) {
        for (const hd of [-0.6, -0.2, 0.2]) {
          g.bend = Math.max(0, b);
          g.rear = Math.max(0, -b);
          g.crouch = Math.max(0, b) * 0.7;
          g.neck = nk;
          g.head = hd;
          const sk = solve(g);
          table.push({ bend: g.bend, rear: g.rear, crouch: g.crouch, neck: nk, head: hd, at: sk.mouth });
        }
      }
    }
  }
  let best = null, bd = Infinity;
  for (const e of table) {
    const d = Math.hypot(e.at.x - target.x, e.at.y - target.y) + Math.abs(e.neck) * 0.15 + e.bend * 0.1;
    if (d < bd) { bd = d; best = e; }
  }
  return { ...best, d: Math.hypot(best.at.x - target.x, best.at.y - target.y) };
}

/** How far in front of his feet, and how high, his mouth can reach: for the moves to know when to walk closer. */
export const REACH = { mouthNear: 3.4 * K, mouthFar: 6.6 * K, hand: 4.0 * K, foot: 3.6 * K, tail: 13 * K };
export { K };
