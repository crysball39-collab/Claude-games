/* =============================================================================
   GODZILLA - what he does, and how he decides to.

   He goes after whatever is nearest and alive - whoever has hurt him first -
   and when there is nobody, the city: a building to tear into. Near enough,
   he has a move for wherever they are:

     at his feet       a stomp: the foot up, a pause, and down - whoever is
                       under it is gone, and everyone near is knocked flat
     just in front     a kick, or a hand down to grab them
     at his head       a bite: he lunges, and the jaws shut on whatever is
                       there (a person, the corner of a building)
     in reach          his claws: a hand up and down through it, three gouges
     behind him        his tail, up and down on them - or, in front, a spin
                       that brings the whole length of it round
     far off           his breath: the plates light up from the tail, and a
                       white-hot stream comes out of his mouth
   and whoever he has hold of he eats (two bites, and a gulp), or throws.
   Now and then, and after anything big, he roars: glass goes in every
   building near him, and everyone who hears it is terrified.

   Each move is a few phases in a row (`m.phase`), setting goals for his
   posture, his hands and his feet (body.js) and doing what it does to the
   world at the moment it does it (world.js).
   ========================================================================== */
import { clamp, lerp, rand, chance, sign } from '../../core/util.js';
import { defineArm } from '../../game/props.js';
import { toLocal, toWorld, walk, aimMouth, kOf } from './body.js';
import { footDown, roarAt, bite as biteAt, claw as clawAt, kickAt, tailHits, crushIn, wreckable, nearestBuilding, buildingPoint, struck } from './world.js';
import { Breath, RoarRings } from './effects.js';

export const MOD = 'godzilla';

defineArm('gzStomp', { name: "Godzilla's foot", noun: 'foot', cause: 'crushed', shove: 3, nasty: 3, memory: 'hurtMe', hurt: 'gzHurt', verb: 'stepped on me', power: 12 });
defineArm('gzKick', { name: "Godzilla's foot", noun: 'kick', cause: 'kicked by Godzilla', shove: 3, nasty: 2.5, memory: 'hurtMe', hurt: 'gzHurt', verb: 'kicked me', power: 12 });
defineArm('gzTail', { name: "Godzilla's tail", noun: 'tail', cause: 'struck by a tail', shove: 3, nasty: 2.5, memory: 'hurtMe', hurt: 'gzHurt', verb: 'hit me with his tail', power: 12 });
defineArm('gzClaw', {
  name: "Godzilla's claws", noun: 'claws', cause: 'clawed', blade: true, sharp: 1, gash: 3, spray: 1.8, shove: 2.4, nasty: 3,
  memory: 'hurtMe', hurt: 'gzHurt', verb: 'clawed me', power: 12, wound: 'claw marks',
});
defineArm('gzBite', {
  name: "Godzilla's teeth", noun: 'teeth', cause: 'bitten', blade: true, sharp: 1, gash: 2, spray: 2.2, shove: 1.2, nasty: 3,
  memory: 'hurtMe', hurt: 'gzHurt', verb: 'bit me', power: 12, wound: 'bite',
});
defineArm('gzBreath', { name: 'Atomic breath', noun: 'breath', cause: 'atomic breath', burn: true, shove: 0.8, nasty: 3, memory: 'hurtMe', hurt: 'gzBurned', verb: 'burned me', power: 12 });
defineArm('gzQuake', { name: 'The ground shaking', noun: 'quake', cause: 'the ground shaking', shove: 2, nasty: 1, memory: 'hurtMe', hurt: 'gzHurt', verb: 'knocked me flat', power: 3 });
// one of them, on another of them: a blow on that scale (a claw, a tail, a kick, the jaws), and a breath
defineArm('kaijuBlow', { name: "A kaiju's blow", noun: 'blow', cause: 'another kaiju', shove: 0, nasty: 3, memory: 'hurtMe', hurt: 'gzHurt', verb: 'hit me', power: 14 });
defineArm('kaijuBreath', { name: "A kaiju's breath", noun: 'breath', cause: 'another kaiju', burn: true, ignite: false, shove: 0, nasty: 3, memory: 'hurtMe', hurt: 'gzBurned', verb: 'burned me', power: 14 });

const alive = (p) => !!p && !p.removed && !p.dead;
const giant = (p) => !!(p && p.species && p.species.giant);
/** Another of them (a kaiju of this mod): something to fight, not to eat. */
export const rival = (man, p) => !!p && p !== man && giant(p) && p.species.mod === MOD && !!p.gz;
const B = (man) => man.gz.body;
const S = (man) => man.gz.body.sk;
const L = (man, x, y) => toLocal(B(man), man, x, y);
const W = (man, p) => toWorld(B(man), man, p);

/** Where to aim at someone: their chest standing, their hips lying. */
const aimAt = (o) => (o.lying || o.rag ? o.wj.hip : o.wj.chest);

/* --------------------------------- choosing ---------------------------------- */

/** Who he goes after: the nearest of the living - unless somebody has just hurt him. */
function pickTarget(man) {
  const K = kOf(man);
  const sb = man.sandbox, gz = man.gz, now = sb.time;
  let best = null, bs = -Infinity;
  for (const p of sb.people) {
    if (p === man || !alive(p) || (giant(p) && !rival(man, p)) || p.state === 'held' && p.heldBy === man) continue;
    // (another of them: only once he is close, or has hurt him)
    const d = Math.abs(p.pos.x - man.pos.x) + Math.max(0, p.pos.y - 4) * 0.5;
    if (d > 36 || (giant(p) && d > 26 && gz.hurtBy.get(p) === undefined)) continue;
    const hurt = gz.hurtBy.get(p);
    // (whoever is in front of him, rather than turning round for somebody no nearer behind)
    const behind = sign(p.pos.x - man.pos.x) !== man.facing && Math.abs(p.pos.x - man.pos.x) > 2 * K;
    const s = -d + (hurt !== undefined && now - hurt < 10 ? 14 : 0) + (p === gz.target ? 6 : 0) - (behind ? 7 : 0);
    if (s > bs) { bs = s; best = p; }
  }
  return best;
}

function onHurt(man, by) {
  const gz = man.gz;
  gz.lastBy = by;
  gz.hurtBy.set(by, man.sandbox.time);
  gz.rage = Math.min(1, gz.rage + 0.012);
}
export { onHurt };

/* ---------------------------------- moving ----------------------------------- */

const PACE = 1.55;

/** Walking to stand so that x is `gap` in front of him; true once he is there. */
function approach(man, x, gap, dt) {
  const K = kOf(man);
  const gz = man.gz;
  const f = man.facing;
  const want = x - f * gap;
  const d = want - man.pos.x;
  if (Math.abs(d) < 0.5 * K) { gz.wantV = 0; return true; }
  // (he walks forward, never backward: a step or two back, at the most)
  if (sign(d) !== f && Math.abs(d) > 2.2 * K) { gz.wantV = 0; return false; }
  gz.wantV = sign(d) * PACE * (sign(d) === f ? 1 : 0.5) * (0.85 + gz.rage * 0.3);
  return false;
}

/** The goals his posture goes back to between moves: upright, the mouth just open, looking at whatever he is after. */
function rest(man) {
  const K = kOf(man);
  const g = B(man), G = g.goal, gz = man.gz;
  G.bend = 0.04 + Math.min(0.1, Math.abs(gz.v) * 0.05);
  G.crouch = 0; G.rear = 0; G.neck = 0; G.head = 0; G.lean = 0;
  G.tailLift = 0; G.tailHover = 0;
  G.jaw = 0.06 + Math.max(0, Math.sin(man.sandbox.time * 0.7 + man.id)) * 0.08;
  g.rate = 3.2;
  g.rates = null;
  g.hands.A = null;
  g.hands.B = null;
  // whoever is in his hand, held up in front of his face
  if (gz.holding && g.sk) g.hands.A = { x: g.sk.neckTop.x + 2.2 * K, y: g.sk.neckTop.y - 1.6 * K, rate: 2.4 };
  gz.openA = lerp(gz.openA, 0, 0.1);
  gz.openB = lerp(gz.openB, 0, 0.1);
  // looking at it
  const o = gz.target;
  const at = alive(o) ? aimAt(o) : gz.aimAt;
  if (at && g.sk) {
    const p = L(man, at.x, at.y);
    const n = g.sk.neckTop;
    if (p.x > n.x - 1) {
      const a = Math.atan2(p.y - n.y, p.x - n.x);
      G.head = clamp(a * 0.5, -0.55, 0.45);
      G.neck = clamp(-a * 0.25, -0.2, 0.3);
    }
  }
}

/* ----------------------------------- moves ----------------------------------- */

function setPhase(m, name) { m.phase = name; m.pt = 0; }

/** The point a move is aimed at, now: the person it is after, or the place it picked. */
function targetPoint(m, lead = 0) {
  if (alive(m.o)) {
    const p = aimAt(m.o);
    return lead ? { x: p.x + clamp(m.o.vel.x, -6, 6) * lead, y: p.y } : p;
  }
  if (m.o && !m.o.removed && m.o.kind === 'stickman') return m.o.wj.hip;
  return m.at || null;
}

const MOVES = {
  /** Facing about: a slow turn on the spot. */
  turn: {
    label: 'Turn around',
    start(man, m) { m.from = man.facing; return true; },
    update(man, m, dt) {
      const g = B(man);
      g.yaw += dt * Math.PI / 1.05;
      if (g.yaw >= Math.PI / 2 && !m.flipped) { m.flipped = true; man.facing = -man.facing; g.yaw -= Math.PI; }
      if (m.flipped && g.yaw >= 0) { g.yaw = 0; return false; }
      return true;
    },
    stop(man) { B(man).yaw = 0; },
  },

  /** A foot up, high - a moment - and down on whatever is under it. */
  stomp: {
    label: 'Stomp',
    start(man, m) {
      const K = kOf(man);
      const g = B(man);
      const p = targetPoint(m);
      const lx = p ? L(man, p.x, 0).x : 2.2 * K;
      // the foot nearer it does it
      m.foot = Math.abs(lx - g.feet.A.lx) <= Math.abs(lx - g.feet.B.lx) ? 'A' : 'B';
      if (g.swing) return false;
      setPhase(m, 'lift');
      man.sandbox.emit('gzStompUp', { who: man, x: man.pos.x });
      return true;
    },
    update(man, m, dt) {
      const K = kOf(man);
      const g = B(man), G = g.goal;
      m.pt += dt;
      const p = targetPoint(m);
      const aim = p ? clamp(L(man, p.x, 0).x - 0.4 * K, -1.6 * K, 4.2 * K) : (m.aimX ?? 2.2 * K);
      if (m.phase === 'lift') {
        G.rear = 0.18; G.crouch = 0.05; G.head = -0.25;
        m.aimX = aim;
        g.raised = { foot: m.foot, lift: 3.0 * K, x: aim, tilt: 0.12, rate: 4.5 };
        if (m.pt > 0.75) setPhase(m, 'hold');
      } else if (m.phase === 'hold') {
        G.rear = 0.2; G.head = -0.3;
        if (m.pt < 0.15) m.aimX = aim;
        g.raised = { foot: m.foot, lift: 3.1 * K, x: m.aimX, tilt: 0.1, rate: 6 };
        if (m.pt > 0.22) setPhase(m, 'slam');
      } else if (m.phase === 'slam') {
        G.rear = -0.05; G.crouch = 0.3; G.bend = 0.18;
        g.raised = { foot: m.foot, lift: 0, x: m.aimX, tilt: 0, rate: 34 };
        if (m.pt > 0.11 && !m.down) {
          m.down = true;
          const ft = g.feet[m.foot];
          ft.lift = 0;
          ft.lx = m.aimX;
          ft.x = man.pos.x + g.sx * m.aimX;
          footDown(man, m.foot, 1);
          setPhase(m, 'recover');
        }
      } else {
        G.crouch = 0.2 * (1 - m.pt / 0.5);
        if (m.pt > 0.12) g.raised = null;
        if (m.pt > 0.55) return false;
      }
      return true;
    },
    stop(man, m) {
      const g = B(man);
      if (g.raised) {
        const ft = g.feet[g.raised.foot];
        ft.lift = 0;
        ft.x = man.pos.x + g.sx * ft.lx;
        g.raised = null;
      }
    },
  },

  /** A kick: the near foot back, and through whatever is in front of him. */
  kick: {
    label: 'Kick',
    start(man, m) {
      if (B(man).swing) return false;
      setPhase(m, 'back');
      return true;
    },
    update(man, m, dt) {
      const K = kOf(man);
      const g = B(man), G = g.goal;
      m.pt += dt;
      if (m.phase === 'back') {
        G.rear = 0.12; G.lean = -0.05;
        g.raised = { foot: 'A', lift: 1.1 * K, x: -1.2 * K, tilt: -0.3, rate: 8 };
        if (m.pt > 0.42) setPhase(m, 'kick');
      } else if (m.phase === 'kick') {
        G.rear = 0.28; G.bend = 0;
        g.raised = { foot: 'A', lift: 2.3 * K, x: 4.6 * K, tilt: 0.55, rate: 15 };
        // (whatever the foot goes through, as it goes)
        const sk = S(man), toe = W(man, sk.legs.A.toe), ank = W(man, sk.legs.A.ankle);
        kickAt(man, m, ank, toe);
        if (m.pt > 0.3) setPhase(m, 'back2');
      } else {
        G.rear = 0.1 * (1 - m.pt / 0.5);
        g.raised = { foot: 'A', lift: 0, x: 0.65 * K, tilt: 0, rate: 7 };
        if (m.pt > 0.45) {
          const ft = g.feet.A;
          ft.lift = 0;
          ft.x = man.pos.x + g.sx * ft.lx;
          g.raised = null;
          footDown(man, 'A', 0.35);
          return false;
        }
      }
      return true;
    },
    stop(man) { MOVES.stomp.stop(man); },
  },

  /** His tail: behind him, up and down on them; in front, a whole turn, and the length of it round through them. */
  tail: {
    label: 'Tail whip',
    start(man, m) {
      const K = kOf(man);
      const p = targetPoint(m);
      const behind = p ? L(man, p.x, p.y).x < -1.5 * K : false;
      m.spin = !behind || m.spinForce;
      m.f0 = man.facing;
      m.hit = new Set();
      setPhase(m, m.spin ? 'wind' : 'up');
      man.sandbox.emit('gzTailUp', { who: man, x: man.pos.x, spin: m.spin });
      return true;
    },
    update(man, m, dt) {
      const K = kOf(man);
      const g = B(man), G = g.goal;
      m.pt += dt;
      if (m.spin) {
        if (m.phase === 'wind') {
          // a lean the other way first
          G.crouch = 0.25; G.tailLift = 0.2; G.tailHover = 0.4 * K; G.lean = 0.05;
          g.yaw = -0.35 * Math.min(1, m.pt / 0.3);
          if (m.pt > 0.32) { setPhase(m, 'spin'); man.sandbox.emit('gzTailSwing', { who: man, x: man.pos.x }); }
        } else if (m.phase === 'spin') {
          G.crouch = 0.3; G.tailLift = 0.38; G.tailHover = 0.85 * K; g.rate = 8;
          const w = (Math.PI * 2 + 0.35) / 1.25;
          g.yaw += w * dt;
          const c = Math.cos(g.yaw);
          man.facing = m.f0 * (c >= 0 ? 1 : -1);
          // the far side of the turn: the tail comes round through everything in front
          if (g.yaw > Math.PI * 0.55 && g.yaw < Math.PI * 1.45) tailHits(man, m, m.f0, 1);
          if (g.yaw >= Math.PI * 2) { g.yaw = 0; man.facing = m.f0; setPhase(m, 'settle'); }
        } else {
          G.crouch = 0.15; G.tailHover = 0.3 * K * (1 - m.pt / 0.5);
          if (m.pt > 0.5) return false;
        }
      } else {
        if (m.phase === 'up') {
          G.tailLift = -0.75; G.bend = 0.25; G.head = -0.15; g.rate = 3;
          if (m.pt > 0.7) { setPhase(m, 'down'); man.sandbox.emit('gzTailSwing', { who: man, x: man.pos.x }); }
        } else if (m.phase === 'down') {
          G.tailLift = 0.08; G.bend = 0.05; g.rate = 14;
          if (m.pt > 0.12) tailHits(man, m, -man.facing, 0.9);
          if (m.pt > 0.35) setPhase(m, 'settle');
        } else if (m.pt > 0.5) return false;
      }
      return true;
    },
    stop(man, m) { const g = B(man); g.yaw = 0; if (m.f0) man.facing = m.f0; },
  },

  /** The roar: head back, mouth wide - and everything near shakes. */
  roar: {
    label: 'Roar',
    start(man, m) { setPhase(m, 'draw'); return true; },
    update(man, m, dt) {
      const K = kOf(man);
      const g = B(man), G = g.goal, gz = man.gz;
      m.pt += dt;
      if (m.phase === 'draw') {
        G.bend = 0.2; G.head = -0.35; G.jaw = 0.25; G.neck = 0.2;
        if (m.pt > 0.45) { setPhase(m, 'roar'); roarAt(man); man.sandbox.effects.push(new RoarRings(man.sandbox, man)); }
      } else if (m.phase === 'roar') {
        G.rear = 0.65; G.head = 0.35; G.jaw = 1; G.neck = -0.3; G.tailLift = 0.15; g.rate = 5;
        gz.openA = gz.openB = 0.8;
        g.hands.A = { x: S(man).shoulder.x + 1.6 * K, y: S(man).shoulder.y + 0.6 * K, rate: 4 };
        g.hands.B = { x: S(man).shoulderB.x + 1.3 * K, y: S(man).shoulderB.y + 0.4 * K, rate: 4 };
        gz.shake = 0.35;
        if (m.pt > 2.3) { gz.shake = 0; setPhase(m, 'end'); }
      } else if (m.pt > 0.6) return false;
      return true;
    },
    stop(man) { man.gz.shake = 0; },
  },

  /** A hand out to whoever it is - bent right over, if they are on the ground - and up with them. */
  grab: {
    label: 'Grab',
    start(man, m) {
      if (man.gz.holding) return false;
      if (!alive(m.o) && !(m.o && m.o.kind === 'stickman' && !m.o.removed)) return false;
      setPhase(m, 'reach');
      return true;
    },
    update(man, m, dt) {
      const K = kOf(man);
      const g = B(man), G = g.goal, gz = man.gz, sk = S(man);
      m.pt += dt;
      const o = m.o;
      if (m.phase === 'reach') {
        if (!o || o.removed || (o.heldBy && o.heldBy !== man)) return false;
        const p = o.lying || o.rag ? o.wj.hip : o.wj.chest;
        const lp = L(man, p.x, p.y);
        const low = clamp((7.2 * K - lp.y) / (6.4 * K), 0, 1);
        G.bend = 0.15 + low * 0.95; G.crouch = low * 0.95; G.neck = low * 0.3; G.head = -0.35;
        G.tailLift = low * 0.9; g.rate = 3.4;
        gz.openA = 1;
        g.hands.A = { x: lp.x, y: lp.y, rate: 5 };
        const hand = W(man, sk.arms.A.hand);
        const n = o.nearestPart(hand.x, hand.y);
        if (n && n.d < 0.75 * K && m.pt > 0.25) {
          if (man.sandbox.hand && man.sandbox.hand.holding === o) man.sandbox.hand.release();
          if (o.weapon) o.dropWeapon(0.4);
          o.grab(hand.x, hand.y, man);
          struck(man, o);
          gz.holding = o;
          gz.openA = 0;
          setPhase(m, 'lift');
          man.sandbox.emit('gzGrab', { who: o, by: man, x: hand.x, y: hand.y });
        } else if (m.pt > 1.6) setPhase(m, 'miss');
      } else if (m.phase === 'lift') {
        if (!holding(man)) { gz.holding = null; return false; }
        G.bend = 0.05; G.head = -0.3; G.neck = 0.1; g.rate = 2.6;
        g.hands.A = { x: sk.neckTop.x + 2.2 * K, y: sk.neckTop.y - 1.6 * K, rate: 2.4 };
        if (m.pt > 1.3) return false;
      } else {
        G.bend = 0.3 * (1 - m.pt / 0.6);
        if (m.pt > 0.6) return false;
      }
      return true;
    },
  },

  /** Whoever is in his hand, up to his mouth: two bites, and a gulp. */
  eat: {
    label: 'Eat',
    start(man, m) {
      if (!holding(man)) return false;
      m.o = man.gz.holding;
      setPhase(m, 'bring');
      return true;
    },
    update(man, m, dt) {
      const K = kOf(man);
      const g = B(man), G = g.goal, gz = man.gz, sk = S(man);
      m.pt += dt;
      const o = m.o;
      if (m.phase === 'bring') {
        if (!holding(man)) { gz.holding = null; return false; }
        G.head = -0.45; G.neck = 0.25; G.jaw = clamp(m.pt / 0.6, 0, 1); G.bend = 0.12;
        const mo = sk.mouth;
        g.hands.A = { x: mo.x + 0.25 * K, y: mo.y - 0.35 * K, rate: 3.5 };
        if (m.pt > 0.95) { setPhase(m, 'chomp'); m.n = 0; }
      } else if (m.phase === 'chomp') {
        if (o.removed) return false;
        const mo = sk.mouth;
        g.hands.A = { x: mo.x + 0.15 * K, y: mo.y - 0.25 * K, rate: 6 };
        const k = (m.pt % 0.34) / 0.34;
        G.jaw = k < 0.4 ? 0.05 : 0.9; g.rates = { jaw: 16, head: 10 };
        G.head = -0.4 + (k < 0.4 ? 0.08 : 0);
        if (k < 0.4 && !m.shut) {
          m.shut = true;
          m.n++;
          biteAt(man, W(man, mo), o, m.n);
          if (m.n >= 2) { setPhase(m, 'gulp'); return true; }
        } else if (k >= 0.4) m.shut = false;
      } else if (m.phase === 'gulp') {
        G.jaw = 0.05; G.head = 0.2; G.neck = -0.25; g.rate = 3;
        gz.gulp = clamp(m.pt / 0.9, 0, 1);
        if (m.pt > 1) { gz.gulp = 0; return false; }
      }
      return true;
    },
    stop(man) { man.gz.gulp = 0; },
  },

  /** Whoever is in his hand, back over his shoulder, and away. */
  throw: {
    label: 'Throw',
    start(man, m) {
      if (!holding(man)) return false;
      m.o = man.gz.holding;
      setPhase(m, 'wind');
      return true;
    },
    update(man, m, dt) {
      const K = kOf(man);
      const g = B(man), G = g.goal, gz = man.gz, sk = S(man);
      m.pt += dt;
      if (m.phase === 'wind') {
        if (!holding(man)) { gz.holding = null; return false; }
        G.rear = 0.35; G.lean = -0.08; g.rate = 4;
        g.hands.A = { x: sk.shoulder.x - 1.2 * K, y: sk.shoulder.y + 2.6 * K, rate: 5 };
        if (m.pt > 0.55) setPhase(m, 'fling');
      } else if (m.phase === 'fling') {
        G.rear = -0.1; G.bend = 0.3; g.rate = 10;
        g.hands.A = { x: sk.shoulder.x + 3.8 * K, y: sk.shoulder.y + 0.8 * K, rate: 18 };
        const hand = W(man, sk.arms.A.hand);
        if (!m.prev) m.prev = { x: hand.x, y: hand.y };
        const v = { x: (hand.x - m.prev.x) / dt, y: (hand.y - m.prev.y) / dt };
        m.prev = { x: hand.x, y: hand.y };
        const lh = sk.arms.A.hand;
        if (lh.x > sk.shoulder.x + 1.6 * K || m.pt > 0.25) {
          const o = gz.holding;
          if (o && holding(man)) {
            o.held.vx = clamp(v.x * 0.6 + man.facing * 19, -22, 22);
            o.held.vy = clamp(v.y * 0.4 + 9, -22, 22);
            o.release();
            o.thrownBy = man;
            o.thrownAt = man.sandbox.time;
            man.sandbox.emit('gzThrow', { who: o, by: man, x: hand.x, y: hand.y });
          }
          gz.holding = null;
          setPhase(m, 'after');
        }
      } else if (m.pt > 0.6) return false;
      return true;
    },
  },

  /** The jaws: a lunge, and shut on whatever is there. */
  bite: {
    label: 'Bite',
    start(man, m) {
      if (man.gz.holding && !m.o) return false;
      setPhase(m, 'reach');
      return true;
    },
    update(man, m, dt) {
      const K = kOf(man);
      const g = B(man), G = g.goal, gz = man.gz, sk = S(man);
      m.pt += dt;
      if (m.phase === 'reach') {
        const p = targetPoint(m, Math.max(0, 0.5 - m.pt));
        if (!p) return false;
        const lp = L(man, p.x, p.y);
        const a = aimMouth(B(man).b, { x: lp.x, y: lp.y });
        m.pose = a;
        G.bend = a.bend; G.rear = a.rear; G.crouch = a.crouch; G.neck = a.neck; G.head = a.head; G.jaw = 1;
        G.tailLift = a.bend * 0.8;
        g.rate = 6.5;
        m.aim = { x: p.x, y: p.y };
        // (a lunge at somebody getting away)
        m.v = lp.x > 5.2 * K ? man.facing * 2.6 : 0;
        // (shut as soon as the mouth is there, or as near as it is going to get)
        const mo = W(man, sk.mouth);
        if ((m.pt > 0.2 && Math.hypot(mo.x - p.x, mo.y - p.y) < 0.7 * K) || m.pt > 0.5) setPhase(m, 'snap');
      } else if (m.phase === 'snap') {
        // (the body stays where the lunge put it: only the jaw moves, fast)
        const a = m.pose;
        if (a) { G.bend = a.bend; G.rear = a.rear; G.crouch = a.crouch; G.neck = a.neck; G.head = a.head; G.tailLift = a.bend * 0.8; }
        G.jaw = 0;
        g.rates = { jaw: 24 };
        m.v = 0;
        if (m.pt > 0.09 && !m.done) {
          m.done = true;
          const mo = W(man, sk.mouth);
          const caught = biteAt(man, mo, m.o, 0, m);
          if (caught) { gz.mouthful = caught; setPhase(m, 'shake'); } else setPhase(m, 'back');
        }
      } else if (m.phase === 'shake') {
        const o = gz.mouthful;
        if (!o || o.removed || o.heldBy !== man) { gz.mouthful = null; setPhase(m, 'back'); return true; }
        G.jaw = 0.12; g.rate = 10;
        G.neck = Math.sin(m.pt * 22) * 0.18; G.head = Math.sin(m.pt * 22 + 1) * 0.2 - 0.1;
        o.holdAt(W(man, sk.mouth).x, W(man, sk.mouth).y);
        if (m.pt > 1.0) {
          // down it goes - or away, now and then
          if (!m.noEat && chance(0.7)) { biteAt(man, W(man, sk.mouth), o, 2); gz.mouthful = null; setPhase(m, 'gulp'); } else {
            o.held.vx = man.facing * 6;
            o.held.vy = 3;
            o.release();
            gz.mouthful = null;
            man.sandbox.emit('gzSpit', { who: o, by: man });
            setPhase(m, 'back');
          }
        }
      } else if (m.phase === 'gulp') {
        G.jaw = 0.05; G.head = 0.25; G.neck = -0.25; g.rate = 3;
        gz.gulp = clamp(m.pt / 0.9, 0, 1);
        if (m.pt > 1) { gz.gulp = 0; return false; }
      } else if (m.pt > 0.45) return false;
      return true;
    },
    stop(man) {
      const gz = man.gz, o = gz.mouthful;
      if (o && !o.removed && o.heldBy === man) o.release();
      gz.mouthful = null;
      gz.gulp = 0;
    },
  },

  /** His claws: the hand up, and down through it. */
  claw: {
    label: 'Claw',
    start(man, m) {
      setPhase(m, 'raise');
      m.hand = man.gz.holding ? 'B' : 'A';
      m.hit = new Set();
      return true;
    },
    update(man, m, dt) {
      const K = kOf(man);
      const g = B(man), G = g.goal, gz = man.gz, sk = S(man);
      m.pt += dt;
      const s = m.hand, sh = sk.arms[s].shoulder;
      const p = targetPoint(m);
      const pose = (lp) => {
        // as far over as it takes for the hand to get down to it
        const low = clamp((7.2 * K - lp.y) / (6.2 * K), 0, 1);
        G.bend = 0.12 + low * 0.95; G.crouch = low * 0.9; G.rear = 0.12 * (1 - low); G.head = -0.3; G.neck = low * 0.2;
        G.tailLift = low * 0.85;
        g.rate = 4.2;
      };
      if (m.phase === 'raise') {
        const tp = targetPoint(m, 0.35);
        const lp = tp ? L(man, tp.x, tp.y) : { x: sh.x + 3 * K, y: sh.y - 2 * K };
        pose(lp);
        gz['open' + s] = 1;
        g.hands[s] = { x: sh.x + 0.4 * K, y: sh.y + 2.2 * K, rate: 6 };
        m.lp = lp;
        if (m.pt > 0.5) { setPhase(m, 'swipe'); man.sandbox.emit('gzClawSwing', { who: man, x: W(man, sh).x }); }
      } else if (m.phase === 'swipe') {
        const lp = m.lp;
        pose(lp);
        g.rate = 5;
        // down through it, and on past it
        g.hands[s] = { x: lp.x + 0.9 * K, y: Math.max(0.35, lp.y - 1.6 * K), rate: 13 };
        const hand = W(man, sk.arms[s].hand);
        clawAt(man, m, hand, s);
        if (m.pt > 0.34) setPhase(m, 'back');
      } else {
        gz['open' + s] = 0.3;
        if (m.pt > 0.45) return false;
      }
      return true;
    },
  },

  /** The atomic breath: the plates light up from the tail, and then the stream - at whatever he is after. */
  breath: {
    label: 'Atomic breath',
    start(man, m) {
      setPhase(m, 'charge');
      man.sandbox.emit('gzCharge', { who: man, x: man.pos.x, y: 10 });
      return true;
    },
    update(man, m, dt) {
      const g = B(man), G = g.goal, gz = man.gz, sk = S(man), sb = man.sandbox;
      m.pt += dt;
      const p = targetPoint(m);
      if (p) m.aim = { x: p.x, y: p.y };
      const aim = m.aim || W(man, { x: 20, y: 3 });
      const la = L(man, aim.x, aim.y);
      const n = sk.neckTop;
      // the head pointed at it
      const ang = clamp(Math.atan2(la.y - n.y, Math.max(1, la.x - n.x)), -1.1, 0.6);
      if (m.phase === 'charge') {
        G.rear = 0.25; G.head = ang * 0.6; G.neck = -ang * 0.3; G.jaw = 0.15 + m.pt * 0.2; G.tailLift = 0.2;
        gz.glow = clamp(m.pt / 1.7, 0, 1);
        gz.shake = gz.glow * 0.12;
        if (m.pt > 1.75) {
          setPhase(m, 'fire');
          m.fx = new Breath(sb, man);
          m.fx.aimAt(aim, !alive(m.o));
          sb.effects.push(m.fx);
          sb.emit('gzBreath', { who: man, x: W(man, sk.mouth).x, y: W(man, sk.mouth).y, to: aim });
        }
      } else if (m.phase === 'fire') {
        G.rear = 0.12; G.jaw = 1; G.head = ang * 0.9 + Math.sin(m.pt * 2.2) * 0.05; G.neck = -ang * 0.2; g.rate = 5;
        gz.glow = 1;
        gz.shake = 0.2;
        if (m.fx) m.fx.aimAt(aim, !alive(m.o));
        if (m.pt > 2.4) { setPhase(m, 'cool'); if (m.fx) m.fx.stop(); }
      } else {
        gz.glow = Math.max(0, 1 - m.pt / 0.9);
        gz.shake = 0;
        G.jaw = 0.3;
        if (m.pt > 0.9) { gz.glow = 0; return false; }
      }
      return true;
    },
    stop(man, m) { man.gz.glow = 0; man.gz.shake = 0; if (m.fx) m.fx.stop(); },
  },
};
export const MOVE_NAMES = Object.keys(MOVES);

/** Whether he still has hold of whoever he took hold of. */
function holding(man) {
  const o = man.gz.holding;
  return !!o && !o.removed && o.heldBy === man && o.state === 'held';
}

/** The moves he has (another kind of him may have moves of its own: gz.moveset). */
const movesOf = (man) => man.gz.moveset || MOVES;

/** Starts a move (if he is not in the middle of one): false if it cannot start. */
export function begin(man, name, o = {}) {
  const gz = man.gz;
  if (gz.move || man.dead || gz.state === 'dying') return false;
  const def = movesOf(man)[name];
  if (!def) return false;
  const m = { name, t: 0, pt: 0, phase: '', ...o };
  if (!def.start(man, m)) return false;
  gz.move = m;
  gz.wantV = 0;
  man.sandbox.emit('gzMove', { who: man, move: name, x: man.pos.x });
  return true;
}

export function endMove(man) {
  const gz = man.gz, m = gz.move;
  if (!m) return;
  const def = movesOf(man)[m.name];
  if (def.stop) def.stop(man, m);
  gz.move = null;
  gz.cool[m.name] = man.sandbox.time;
}

/* ------------------------------------ the AI ---------------------------------- */

const COOL = { stomp: 2.2, kick: 3, tail: 5, roar: 16, grab: 3, bite: 2.5, claw: 2, breath: 13, eat: 0, throw: 0, turn: 0.5 };
export const ready = (man, name) => man.sandbox.time - (man.gz.cool[name] ?? -99) > (man.gz.cooling || COOL)[name] * (1.15 - man.gz.rage * 0.45);

/** Every step: the move he is in the middle of, or what to do next - and his feet, either way. */
export function think(man, dt) {
  const gz = man.gz, sb = man.sandbox;
  gz.cool = gz.cool || {};
  rest(man);
  gz.rage = Math.max(0.15, gz.rage - dt * 0.004);
  // whoever he had hold of, got away (or was taken off him)
  if (gz.holding && !holding(man)) gz.holding = null;
  if (gz.holding) {
    const sk = S(man), hand = W(man, sk.arms.A.hand);
    gz.holding.holdAt(hand.x, hand.y);
  }
  if (gz.state === 'arrive') {
    gz.wantV = 0;
    if (gz.t > 0.9 && !gz.move && !gz.arrived) { gz.arrived = true; begin(man, 'roar'); }
    if (gz.arrived && !gz.move) gz.state = 'hunt';
  }
  // a move asked for while he could not start it
  if (!gz.move && gz.queued) {
    const q = gz.queued;
    if (sb.time - q.t > 2.5) gz.queued = null;
    else if (begin(man, q.name, q.opts)) gz.queued = null;
  }
  if (gz.move) {
    gz.move.t += dt;
    if (!movesOf(man)[gz.move.name].update(man, gz.move, dt)) endMove(man);
    // (a move keeps his feet where they are - or takes him a step or two, if it says so)
    if (gz.move && gz.move.name !== 'turn') gz.wantV = gz.move.v || 0;
  } else if (gz.state === 'hunt' && !gz.auto0) decide(man, dt);
  // the feet keep up with him - unless one is up for a move
  walk(man, dt, gz.v, (foot, x) => footDown(man, foot, 0.22));
  // and whatever is under his feet as he goes
  if (Math.abs(gz.v) > 0.2) crushIn(man, dt);
}

/** What to do now, with nothing under way. */
function decide(man, dt) {
  const gz = man.gz, sb = man.sandbox;
  if ((gz.thinkT -= dt) <= 0 || (gz.target && !alive(gz.target))) {
    const was = gz.target;
    gz.target = pickTarget(man);
    gz.thinkT = rand(1.2, 2.2);
    if (was && !alive(was) && was !== gz.target && chance(0.35) && ready(man, 'roar')) { begin(man, 'roar'); return; }
  }
  gz.roarT -= dt;
  // something in his hand: it goes in his mouth, mostly
  if (gz.holding) {
    gz.holdT = (gz.holdT || 0) + dt;
    if (gz.holdT > 0.8) { gz.holdT = 0; begin(man, chance(0.72) ? 'eat' : 'throw'); }
    return;
  }
  if (gz.roarT <= 0 && ready(man, 'roar')) { gz.roarT = rand(18, 30); begin(man, 'roar'); return; }
  const o = gz.target;
  if (o) { fight(man, o, dt); return; }
  // nobody: the city
  rampage(man, dt);
}

/** Going after somebody. */
function fight(man, o, dt) {
  const K = kOf(man);
  const gz = man.gz;
  const p = aimAt(o);
  const lp = L(man, p.x, p.y);
  const lf = L(man, o.pos.x, o.pos.y);
  gz.aimAt = null;
  if (rival(man, o)) { fightRival(man, o, lf); return; }
  // behind him
  if (lf.x < -1.2 * K) {
    gz.wantV = 0;
    if (lf.x > -11 * K && lf.y < 4 && ready(man, 'tail') && chance(0.55)) { begin(man, 'tail', { o }); return; }
    if (lf.x > -2.6 * K && lp.y < 2.5 && ready(man, 'stomp')) { begin(man, 'stomp', { o }); return; }
    begin(man, 'turn');
    return;
  }
  const x = lf.x, high = lp.y;
  const pickOne = (opts) => {
    const list = opts.filter(([name, w]) => w > 0 && ready(man, name));
    if (!list.length) return false;
    let total = 0;
    for (const e of list) total += e[1];
    let r = rand(0, total);
    for (const [name, w] of list) { r -= w; if (r <= 0) return begin(man, name, { o }); }
    return begin(man, list[0][0], { o });
  };
  if (x < 3.3 * K && high < 3.5 && o.pos.y < 1.5) {
    if (pickOne([['stomp', 5], ['grab', 1.5]])) return;
  } else if (x < 5.4 * K && high < 4) {
    if (pickOne([['kick', 2], ['stomp', 2.5], ['grab', 2.2], ['claw', 1.5], ['bite', 1.2]])) return;
  } else if (x < 7.6 * K && high < 15) {
    const reach = aimMouth(B(man).b, { x: lp.x + clamp(o.vel.x * man.facing, -4, 4) * 0.4, y: lp.y }).d;
    if (pickOne([['bite', reach < 0.9 * K ? 2.6 : 0], ['claw', 2], ['grab', 1.6], ['tail', 0.6]])) return;
  } else if (x < 34 && ready(man, 'breath') && chance(0.012 + gz.rage * 0.02)) {
    begin(man, 'breath', { o });
    return;
  }
  // closer
  approach(man, o.pos.x, (high > 4 ? 5.6 : 4.4) * K, dt);
}

/**
 * Another of them: his hands, his jaws, his tail and his breath, close
 * enough to land them - nothing he could pick up or stand on.
 */
function fightRival(man, o, lf) {
  const K = kOf(man), gz = man.gz;
  if (lf.x < -2 * K) { gz.wantV = 0; if (ready(man, 'tail') && chance(0.4)) begin(man, 'tail', { o }); else begin(man, 'turn'); return; }
  const x = lf.x;
  if (x < 8 * K) {
    gz.wantV = 0;
    const opts = [['claw', 2.5], ['bite', 2], ['tail', 1.2], ['kick', 1.2], ['roar', 0.3]].filter(([n]) => ready(man, n));
    if (opts.length) {
      let total = 0;
      for (const e of opts) total += e[1];
      let r = rand(0, total);
      for (const [n, w] of opts) { r -= w; if (r <= 0) { begin(man, n, { o, spinForce: n === 'tail' }); return; } }
    }
    // (in too close: a step back)
    if (x < 6 * K) gz.wantV = -man.facing * 0.6;
    return;
  }
  if (x < 34 && ready(man, 'breath') && chance(0.03)) { begin(man, 'breath', { o }); return; }
  approach(man, o.pos.x, 6.2 * K, 0);
}

/** With nobody to go after: a building, torn into. */
function rampage(man, dt) {
  const K = kOf(man);
  const gz = man.gz, sb = man.sandbox;
  let w = gz.building;
  // (one he has been at a while without getting anywhere: leave it)
  if (w && gz.buildingCells !== undefined && gz.buildingTries >= 4) {
    if (gz.buildingCells - w.cellCount < 40) (gz.skip = gz.skip || new Set()).add(w);
    gz.buildingTries = 0;
    gz.buildingCells = w.cellCount;
  }
  if (!w || !wreckable(w) || (gz.skip && gz.skip.has(w)) || (gz.buildingT -= dt) <= 0) {
    w = gz.building = nearestBuilding(man);
    gz.buildingT = rand(14, 24);
    gz.buildingAt = null;
    gz.buildingTries = 0;
    gz.buildingCells = w ? w.cellCount : undefined;
  }
  if (!w) {
    // the empty street: a slow walk, and a roar now and then
    gz.aimAt = null;
    if (!gz.wander || Math.abs(gz.wander - man.pos.x) < 1) gz.wander = rand(sb.left + 8, sb.right - 8);
    const dir = sign(gz.wander - man.pos.x);
    if (dir !== man.facing) { begin(man, 'turn'); return; }
    gz.wantV = dir * PACE * 0.6;
    return;
  }
  // a point on it to go for: as high as he can reach, on his side of it
  if (!gz.buildingAt || !w.contains(gz.buildingAt.x, gz.buildingAt.y, 0.3)) gz.buildingAt = buildingPoint(man, w);
  const at = gz.buildingAt;
  gz.aimAt = at;
  // (nothing of it he can get at: another one)
  if (!at) { (gz.skip = gz.skip || new Set()).add(w); gz.building = null; return; }
  const lp = L(man, at.x, at.y);
  // behind him: round he goes
  if (lp.x < -1.5 * K) { gz.wantV = 0; begin(man, 'turn'); return; }
  if (lp.x > 8.5 * K && ready(man, 'breath') && chance(0.006)) { begin(man, 'breath', { at }); return; }
  if (lp.x < 7.2 * K) {
    gz.wantV = 0;
    // (right up against it, his hands, his jaws and his tail still reach; his foot does not)
    const close = lp.x < 1.5 * K;
    const opts = [['claw', 3], ['bite', lp.y > 7 ? 2.5 : 1], ['tail', 1.2], ['kick', at.y < 3 && !close ? 1.5 : 0]];
    const list = opts.filter(([n, wt]) => wt > 0 && ready(man, n));
    if (list.length) {
      let total = 0;
      for (const e of list) total += e[1];
      let r = rand(0, total);
      for (const [n, wt] of list) { r -= wt; if (r <= 0) { if (begin(man, n, { at, w, spinForce: n === 'tail' })) gz.buildingTries = (gz.buildingTries || 0) + 1; return; } }
    }
    return;
  }
  approach(man, at.x, 4.6 * K, dt);
}

/* ---------------------------------- dying ----------------------------------- */

export function startDeath(man) {
  const gz = man.gz, sb = man.sandbox;
  endMove(man);
  if (gz.holding && holding(man)) gz.holding.release();
  gz.holding = null;
  if (gz.mouthful && !gz.mouthful.removed && gz.mouthful.heldBy === man) gz.mouthful.release();
  gz.mouthful = null;
  gz.state = 'dying';
  gz.t = 0;
  gz.glow = 0;
  gz.wantV = 0;
  man.health.shield = 99;
  sb.emit('gzDying', { who: man, x: man.pos.x, y: 10 });
}

/** A last roar, weaker; he sways - and comes down, onto his front, and lies there. */
export function updateDeath(man, dt) {
  const K = kOf(man);
  const gz = man.gz, g = B(man), G = g.goal, sb = man.sandbox;
  gz.wantV = 0;
  walk(man, dt, 0, null);
  if (man.dead) return;
  if (gz.t < 2.2) {
    G.rear = 0.5; G.head = 0.3; G.jaw = 0.85; G.neck = -0.2; g.rate = 3;
    gz.shake = 0.25;
    if (!gz.cried && gz.t > 0.25) { gz.cried = true; sb.emit('gzDeathRoar', { who: man, x: man.pos.x, y: 12 }); }
  } else {
    gz.shake = 0;
    G.rear = 0; G.bend = 1.3; G.crouch = 1.6; G.neck = 0.55; G.head = -0.25; G.jaw = 0.3; G.tailLift = -0.15; G.lean = 0;
    g.hands.A = null; g.hands.B = null;
    g.rate = 1.5;
    if (!gz.fell && gz.t > 4) {
      gz.fell = true;
      sb.emit('gzFall', { who: man, x: man.pos.x + man.facing * 4 * K, y: 0 });
    }
    if (gz.t > 4.3) {
      gz.dead = true;
      const by = gz.lastBy && !gz.lastBy.removed ? gz.lastBy : null;
      man.health.shield = 0;
      man.die('slain', by);
      sb.emit('gzDeath', { who: man, by, x: man.pos.x, y: 4 });
    }
  }
}

/* ------------------------------- for the inspector ---------------------------- */

const DOING = {
  turn: () => 'Turning around',
  stomp: (o) => (o ? `Stomping on ${o.name}` : 'Stomping'),
  kick: (o) => (o ? `Kicking ${o.name}` : 'Kicking'),
  tail: (o) => (o ? `Swinging his tail at ${o.name}` : 'Swinging his tail'),
  roar: () => 'Roaring',
  grab: (o) => (o ? `Reaching for ${o.name}` : 'Reaching for someone'),
  eat: (o) => (o ? `Eating ${o.name}` : 'Eating'),
  throw: (o) => (o ? `Throwing ${o.name}` : 'Throwing'),
  bite: (o) => (o ? `Biting at ${o.name}` : 'Biting'),
  claw: (o) => (o ? `Clawing at ${o.name}` : 'Clawing'),
  breath: (o) => (o ? `Atomic breath, at ${o.name}` : 'Atomic breath'),
};

export function doing(man) {
  const gz = man.gz;
  if (man.dead) return 'Lying where he fell';
  if (gz.state === 'dying') return 'Going down';
  if (gz.move) {
    const m = gz.move, o = m.o && !m.o.removed ? m.o : null;
    if (!o && m.w && !m.w.removed) return { claw: 'Tearing into a building', bite: 'Biting a building', tail: 'Smashing a building with his tail', kick: 'Kicking a building in', breath: 'Burning a building' }[m.name] || DOING[m.name](null);
    return DOING[m.name](o);
  }
  if (gz.holding) return `Holding ${gz.holding.name}`;
  if (gz.target && alive(gz.target)) return Math.abs(gz.v) > 0.2 ? `Going after ${gz.target.name}` : `Watching ${gz.target.name}`;
  if (gz.building && !gz.building.removed) return 'Heading for a building';
  return 'Walking through the city';
}

/* ------------------------------- the abilities panel ---------------------------- */

export function abilities(man) {
  const gz = man.gz;
  if (!gz || man.dead || gz.state === 'dying') return null;
  const target = () => (alive(gz.target) ? gz.target : (gz.target = pickTarget(man)));
  const on = (n) => !!gz.move && gz.move.name === n;
  const go = (name, extra = {}) => () => {
    const o = target();
    if (gz.move) endMove(man);
    const at = o ? null : gz.building && wreckable(gz.building) ? buildingPoint(man, gz.building) : null;
    const opts = { o, at, w: at ? gz.building : null, ...extra };
    if (begin(man, name, opts)) return true;
    // (a foot in the air, say: as soon as it is down)
    if (B(man).swing) { gz.queued = { name, opts, t: man.sandbox.time }; return true; }
    return false;
  };
  return [
    {
      id: 'auto', label: 'Rampage', group: 'mind', on: !gz.auto0,
      pick: () => { gz.auto0 = !gz.auto0; gz.wantV = 0; return true; },
      say: () => (gz.auto0 ? `${man.name} stands where he is, and waits to be told` : `${man.name} goes on the rampage again`),
    },
    { id: 'stomp', label: 'Stomp', group: 'do', on: on('stomp'), pick: go('stomp') },
    { id: 'tail', label: 'Tail whip', group: 'do', on: on('tail'), pick: go('tail', { spinForce: true }) },
    { id: 'roar', label: 'Roar', group: 'do', on: on('roar'), pick: () => { if (gz.move) endMove(man); return begin(man, 'roar'); } },
    { id: 'grab', label: 'Grab', group: 'do', on: on('grab'), pick: go('grab') },
    {
      id: 'eat', label: 'Eat', group: 'do', on: on('eat'),
      pick: () => {
        if (gz.move) endMove(man);
        if (holding(man)) return begin(man, 'eat');
        // nobody in hand: whoever is nearest, then
        const o = target();
        return o ? begin(man, 'grab', { o }) && (gz.holdT = 0.5, true) : false;
      },
    },
    { id: 'throw', label: 'Throw', group: 'do', on: on('throw'), pick: () => { if (gz.move) endMove(man); return holding(man) ? begin(man, 'throw') : false; } },
    { id: 'bite', label: 'Bite', group: 'do', on: on('bite'), pick: go('bite') },
    { id: 'claw', label: 'Claw', group: 'do', on: on('claw'), pick: go('claw') },
    { id: 'kick', label: 'Kick', group: 'do', on: on('kick'), pick: go('kick') },
    { id: 'breath', label: 'Atomic breath', group: 'do', on: on('breath'), pick: go('breath') },
  ];
}

export { MOVES, pickTarget, holding, rest, approach, targetPoint, setPhase, aimAt, alive, giant, PACE };
