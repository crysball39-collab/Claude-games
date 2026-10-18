/* =============================================================================
   Stumbling: knocked off balance, but not off their feet - yet.

   No clip plays while they stumble. The body is an inverted pendulum - the
   hips carry most of the weight, balanced over the feet - and it moves the
   way one does: as long as the point it is falling toward (the capture
   point: where it is, plus how fast it is going over how quickly it falls)
   is over the feet, pressing down through the edge of the foot brings it to
   a stop. Once it is past the feet, nothing standing still will stop it, so
   they take a step: the trailing foot swings out and lands where the fall
   is heading, a little beyond it if they can reach. A few quick steps, and
   most people catch themselves. The arms windmill and the trunk is thrown
   against the fall, which buys a little more; the upper body sways on the
   hips, lagging behind as the legs stop and start.

   Some never catch it. Pushed too hard, or too tired, or hurt in the legs,
   or backing into something, the steps cannot keep up: the body goes past
   the point of no return and over they go, into the ragdoll, moving exactly
   the way they were.

   Everything is worked out from the pendulum, every step, and put into a
   pose by solving each leg for where its foot is: nothing is keyed.
   ========================================================================== */
import { DIM } from './skeleton.js';
import { clamp, clamp01, lerp, rand, chance, sign, smooth, DEG } from '../core/util.js';

const G = 18;                    // the sandbox's gravity (stickman.js)
const HEEL = 0.035, TOE = 0.13;  // how far the foot reaches behind and in front of the ankle

/** How high the hips stand on straight legs. */
const hipStand = (s) => (DIM.thigh + DIM.shin) * s * 0.99 + (DIM.line / 2) * s;

/** How well this body can keep its feet: legs, stamina, toughness, skill. 0..1. */
function steadiness(man) {
  const h = man.health, T = man.brain ? man.brain.traits : null;
  const legs = Math.min(h.parts.legA.hp / h.parts.legA.max, h.parts.legB.hp / h.parts.legB.max);
  return clamp((0.45 + legs * 0.55) * (0.5 + 0.5 * clamp01(man.stamina / 0.45)) * (0.8 + h.toughness * 0.25) *
    (0.85 + (T ? T.skill : 0.5) * 0.3) * (1 - clamp01(h.dizzy - 0.3) * 0.25), 0.15, 1.1);
}

/**
 * Sets them stumbling, `push` m/s the way the blow went (world x). `o.high`
 * when it landed high - the head, the chest - so the upper body snaps back
 * before the legs know about it.
 */
export function startStumble(man, push, o = {}) {
  const sb = man.sandbox, s = man.scale, w = man.wj;
  const old = man.stumble;
  if (old) {
    // already reeling: this just adds to it
    old.v += push;
    if (o.high) old.torV += push * 1.6;
    return true;
  }
  const from = {};
  for (const k of Object.keys(w)) if (typeof w[k] === 'object') from[k] = { x: w[k].x, y: w[k].y };
  from.headAngle = w.headAngle;
  const ground = man.pos.y;
  const planted = (k) => w[k].y - ground < 0.07 * s;
  man.stumble = {
    v: man.vel.x + push,
    prevV: man.vel.x + push,
    feet: { A: { x: w.footA.x, planted: planted('footA') }, B: { x: w.footB.x, planted: planted('footB') } },
    swing: null,
    tor: 0,
    torV: o.high ? push * 1.6 : push * 0.6,
    steps: 0,
    t: 0,
    calm: 0,
    arm: rand(0, 6),
    ground,
    trip: false,
    by: o.by || null,
  };
  // at least one foot on the floor to start from
  const S = man.stumble;
  if (!S.feet.A.planted && !S.feet.B.planted) S.feet.A.planted = S.feet.B.planted = true;
  man.setState('stumble');
  man.strike = null;
  man.blocking = false;
  man.anim.stopAction(0.05);
  man.posture = null;
  man.stop();
  // from wherever the clip had them to the first pose of the stumble, quickly
  man.blend = { from, t: 0, dur: 0.1 };
  sb.emit('stumble', { who: man, by: o.by || null, x: man.pos.x, y: man.pos.y + 1, speed: Math.abs(push) });
  man.notify('stumble', { speed: Math.abs(push), by: o.by || null });
  return true;
}

/** The pendulum, one step: the push, the feet, a step if one is needed - and either a recovery or a fall. */
export function updateStumble(man, dt) {
  const S = man.stumble;
  if (!S) { man.setState('stand'); return; }
  const sb = man.sandbox, s = man.scale, f = man.facing;
  S.t += dt;
  if (!man.onGround) { man.stumble = null; man.setState('air'); return; }
  const h = man.health;
  if (h.legsBroken || !man.conscious || man.tased || man.carrying || h.paralysed !== 'none') { fall(man, S); return; }
  const H0 = hipStand(s), w = Math.sqrt(G / H0);
  const fit = steadiness(man);
  const x = man.pos.x;
  let v = S.v;

  // what the feet cover, heel to toe
  let lo = Infinity, hi = -Infinity;
  for (const k of ['A', 'B']) {
    const ft = S.feet[k];
    if (!ft.planted) continue;
    const a = ft.x - f * HEEL * s, b = ft.x + f * TOE * s;
    lo = Math.min(lo, a, b);
    hi = Math.max(hi, a, b);
  }
  if (lo === Infinity) { lo = hi = x; }
  const xi = x + v / w;
  const z = clamp(xi, lo, hi);
  let a = w * w * (x - z);
  const dirV = sign(v);
  const past = (xi - (v >= 0 ? hi : lo)) * dirV;
  // arms and trunk thrown against it: a little more braking, while it is going over
  if (past > 0) a -= dirV * Math.min(Math.abs(v) * 6, 1.8 * fit);
  // the floor drags at the feet a little, too
  a -= v * 0.6;
  v += a * dt;
  S.prevV = S.v;
  S.v = v;
  man.vel.x = v;

  // the upper body on the hips: a spring, lagging the hips as they speed up and slow down
  const acc = (S.v - S.prevV) / dt;
  S.torV += (-55 * S.tor - 8 * S.torV - acc * 0.75) * dt;
  S.tor = clamp(S.tor + S.torV * dt, -0.95, 0.95);

  // a step in progress
  const sw = S.swing;
  if (sw) {
    sw.t += dt;
    const ft = S.feet[sw.leg];
    const u = clamp01(sw.t / sw.dur);
    ft.x = lerp(sw.from, sw.to, smooth(u));
    if (u >= 1) {
      ft.planted = true;
      ft.x = sw.to;
      S.swing = null;
      S.v *= 0.9;
      man.vel.x = S.v;
      sb.emit('stumbleStep', { who: man, x: ft.x, y: S.ground, speed: Math.abs(S.v) });
      if (sw.trip) S.trip = true;
    }
  } else if (past > 0.03 * s) {
    // the trailing foot swings through to where the fall is going
    const A = S.feet.A, B = S.feet.B;
    const lead = (k) => S.feet[k].x * dirV;
    let leg = !A.planted ? 'A' : !B.planted ? 'B' : lead('A') < lead('B') ? 'A' : 'B';
    const stance = S.feet[leg === 'A' ? 'B' : 'A'];
    const forward = dirV === f;
    const max = (forward ? 0.75 : 0.62) * s * fit;
    const ft = S.feet[leg];
    const dist0 = Math.abs(xi - ft.x);
    const T = clamp(0.15 + 0.12 * dist0 / (0.6 * s), 0.15, 0.3) * (1.2 - fit * 0.25) * (1 + 0.5 * (1 - clamp01(man.stamina / 0.4)));
    // where the fall will be by the time the foot is down, and a little past it
    const edge = stance.x + dirV * (dirV === f ? TOE : HEEL) * s;
    const xiT = edge + (xi - edge) * Math.exp(w * T);
    const want = xiT + dirV * 0.05 * s;
    const to = stance.planted ? clamp(want, stance.x - max, stance.x + max) : clamp(want, x - max, x + max);
    // something where the foot is going catches it
    const ob = sb.crates.some((c) => !c.removed && !c.carriedBy && c.body.contains(to, S.ground + 0.1, 0.02)) || to < sb.left + 0.1 || to > sb.right - 0.1;
    // and the tired and the hurt sometimes just get it wrong
    const fumble = chance((1 - fit) * 0.15);
    S.swing = { leg, from: ft.x, to, t: 0, dur: T, trip: ob || fumble };
    ft.planted = false;
    S.steps++;
    man.tire(0.025);
  }

  // past saving?
  const edgeNow = v >= 0 ? hi : lo;
  const over = (x - edgeNow) * dirV;
  const lean = Math.atan2(over, H0);
  const tooMany = S.steps > 5 + Math.round(fit * 4);
  // (a foot on its way to catch it gives them a little longer)
  if (S.trip || (lean > 0.5 && !S.swing) || over > (S.swing ? 0.85 : 0.55) * s || tooMany || S.t > 4.5) { fall(man, S); return; }

  // caught it: still, and balanced over the feet
  const settled = !S.swing && Math.abs(S.v) < 0.22 && xi > lo - 0.03 && xi < hi + 0.03 && S.t > 0.22;
  S.calm = settled ? S.calm + dt : 0;
  if (S.calm > 0.1) recover(man, S);
}

function fall(man, S) {
  man.stumble = null;
  man.setState('stand');
  const dir = sign(S.v) || -man.facing;
  man.sandbox.emit('stumbleFall', { who: man, x: man.pos.x, y: man.pos.y + 0.5, speed: Math.abs(S.v) });
  man.knockDown(dir, clamp(Math.abs(S.v) * 0.45, 0.3, 2.2));
}

function recover(man, S) {
  const w = man.wj;
  const from = {};
  for (const k of Object.keys(w)) if (typeof w[k] === 'object') from[k] = { x: w[k].x, y: w[k].y };
  from.headAngle = w.headAngle;
  man.stumble = null;
  man.setState('stand');
  man.vel.x = 0;
  man.balance = Math.max(man.balance, 0.55);
  man.anim.play(man.idleClip(), { blend: 0, restart: true });
  man.blend = { from, t: 0, dur: 0.3 };
  man.sandbox.emit('stumbleCaught', { who: man, x: man.pos.x, y: man.pos.y + 1, steps: S.steps });
  man.notify('caught', { steps: S.steps });
}

/** Two bones from the hip to a foot at (fx, fy) in the body's frame: [hip, knee] as the pose has them (radians). */
function legIK(fx, fy, s) {
  const L1 = DIM.thigh * s, L2 = DIM.shin * s;
  const d = clamp(Math.hypot(fx, fy), Math.abs(L1 - L2) + 0.02, (L1 + L2) * 0.999);
  const alpha = Math.atan2(fx, -fy);
  const beta = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const gamma = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
  return [alpha + beta, -(Math.PI - gamma)];
}

/** The stumble, as a pose: the legs solved for the feet, the trunk swaying, the arms going round. */
export function stumblePose(man, p, dt) {
  const S = man.stumble;
  if (!S) return;
  const s = man.scale, f = man.facing, x = man.pos.x;
  const half = (DIM.line / 2) * s, L = (DIM.thigh + DIM.shin) * s * 0.985;
  const H0 = hipStand(s);
  // the hips sink to whatever the planted feet can reach - and a little more mid-step
  let H = H0;
  for (const k of ['A', 'B']) {
    const ft = S.feet[k];
    if (!ft.planted) continue;
    const dx = ft.x - x;
    if (Math.abs(dx) > L * 0.97) {
      // too far behind to keep: it comes off the floor and is dragged after them
      ft.planted = false;
      ft.x = x + sign(dx) * L * 0.9;
      continue;
    }
    H = Math.min(H, Math.sqrt(L * L - dx * dx) + half);
  }
  const sw = S.swing;
  const u = sw ? clamp01(sw.t / sw.dur) : 0;
  if (sw) H -= 0.035 * s * Math.sin(Math.PI * u);
  H = Math.max(H, H0 * 0.66);
  for (const k of ['A', 'B']) {
    const ft = S.feet[k];
    const lift = sw && sw.leg === k ? 0.12 * s * Math.sin(Math.PI * u) : !ft.planted ? 0.06 * s : 0;
    const [hip, knee] = legIK((ft.x - x) * f, -(H - half) + lift, s);
    p['l' + k + 'u'] = hip;
    p['l' + k + 'l'] = knee;
    // a planted foot flat on the floor; one in the air, toes down
    p['f' + k] = -(hip + knee) + (lift > 0 ? 0.35 : 0);
  }
  // the trunk: the sway on the hips, and bent against the fall
  const back = sign(S.v) !== f;
  const urg = clamp01(Math.abs(S.v) / 2 + (S.steps ? 0.2 : 0));
  p.rot = 0;
  p.t = S.tor * f + (back ? 0.18 : -0.05) * urg;
  p.s = 0;
  p.h = -p.t * 0.55 + (back ? -0.2 : 0.22) * urg;
  // the arms going round to keep them up
  S.arm += (dt || 0) * (9 + 8 * urg);
  const base = (back ? 112 : 68) * DEG, amp = (25 + 65 * urg) * DEG;
  p.aAu = base + amp * Math.sin(S.arm);
  p.aBu = base + amp * Math.sin(S.arm + 2.3);
  p.aAl = (18 + 35 * urg) * DEG;
  p.aBl = (22 + 30 * urg) * DEG;
  p.x = 0;
  p.lift = 0;
  p.anchor = 'low';
  p.hipY = 0;
}
