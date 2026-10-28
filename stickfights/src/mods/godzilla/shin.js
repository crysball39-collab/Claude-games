/* =============================================================================
   SHIN GODZILLA - what he is, what he does, and how he decides to.

   Slow, and nothing stops him. He goes after whoever is nearest - whoever
   hurt him first - and with nobody about, the city. He has no use for his
   arms: everything he does, he does with his weight, his jaws, his tail -
   and the light inside him.

     at his feet       a stomp
     at his head       a bite: the jaws shut on them, and they are dropped
     behind him        his tail comes down on them - or, further off, the
                       end of it opens and a beam comes out of it
     far off           the atomic breath: he lowers his head, the plates on
                       his back light up purple from the tail up and his
                       lower jaw splits in two; black smoke and fire pour
                       out over the street, and narrow to a beam that cuts
                       through anything - he sweeps it up and across, and
                       whatever it crossed comes down
     hurt, and badly   the plates on his back all fire at once: a dozen
                       beams, sweeping round him, cutting up everything
                       there is
   And he roars. Out of health, he does not fall: he stands where he is, and
   freezes solid.

   His moves are run the way the 1954 one's are (moves.js), from a moveset of
   his own - and the turn and the stomp are the same moves.
   ========================================================================== */
import { clamp, lerp, rand, chance, sign } from '../../core/util.js';
import { toLocal, toWorld, walk, aimMouth, newBody, stepBody } from './body.js';
import { SHIN_BUILD } from './shin-body.js';
import { shinSkin, makeCracks, shinFacingAt } from './shin-look.js';
import { MOVES, begin, endMove, ready, targetPoint, setPhase, aimAt, alive, pickTarget, onHurt, rival, MOD } from './moves.js';
import { footDown, roarAt, tailHits, crushIn, wreckable, nearestBuilding, buildingPoint } from './world.js';
import { Beam, Spew } from './shin-effects.js';
import { RoarRings } from './effects.js';
import { kaiju } from './species.js';

const K = SHIN_BUILD.K;
const PACE = 1.05;
export const SHIN_HP = 50000;
/** How much of each kind of harm gets through his hide: less than through the 1954 one's. */
const HIDE = { bullet: 0.18, blade: 0.1, blunt: 0.06, impact: 0.15, blast: 0.75, burn: 0.08, rail: 0.9, beam: 0.8, kaiju: 0.75 };
const MENDS = 15;
const MEND_AFTER = 8;

const B = (man) => man.gz.body;
const S = (man) => man.gz.body.sk;
const L = (man, x, y) => toLocal(B(man), man, x, y);
const W = (man, p) => toWorld(B(man), man, p);

/* ---------------------------------- at rest ----------------------------------- */

/** The goals his posture goes back to between moves: upright, the head out and down, looking at whatever he is after. */
function rest(man) {
  const g = B(man), G = g.goal, gz = man.gz;
  G.bend = 0.03 + Math.min(0.08, Math.abs(gz.v) * 0.05);
  G.crouch = 0; G.rear = 0; G.neck = 0; G.lean = 0; G.split = 0;
  G.tailLift = 0; G.tailHover = 0;
  G.head = -0.12;
  G.jaw = 0.1 + Math.max(0, Math.sin(man.sandbox.time * 0.5 + man.id)) * 0.06;
  g.rate = 2.6;
  g.rates = null;
  g.hands.A = null;
  g.hands.B = null;
  if (!gz.move) { gz.glow = Math.max(0, gz.glow - 0.02); gz.tailGlow = Math.max(0, (gz.tailGlow || 0) - 0.02); }
  const o = gz.target;
  const at = alive(o) ? aimAt(o) : gz.aimAt;
  if (at && g.sk) {
    const p = L(man, at.x, at.y), n = g.sk.neckTop;
    if (p.x > n.x - 1) {
      const a = Math.atan2(p.y - n.y, p.x - n.x);
      G.head = clamp(a * 0.45, -0.6, 0.35);
      G.neck = clamp(-a * 0.2, -0.15, 0.25);
    }
  }
}

/** Walking to stand so that x is `gap` in front of him; true once he is there. */
function approach(man, x, gap) {
  const gz = man.gz, f = man.facing;
  const d = x - f * gap - man.pos.x;
  if (Math.abs(d) < 0.6 * K) { gz.wantV = 0; return true; }
  if (sign(d) !== f && Math.abs(d) > 2 * K) { gz.wantV = 0; return false; }
  gz.wantV = sign(d) * PACE * (sign(d) === f ? 1 : 0.5) * (0.85 + gz.rage * 0.3);
  return false;
}

/* ------------------------------- where it comes from ----------------------------- */

/** Out of his mouth, the way his head points. */
const fromMouth = (man) => () => {
  const g = B(man), sk = g.sk;
  if (!sk) return null;
  let dx = g.sx * sk.F.x, dy = sk.F.y;
  const l = Math.hypot(dx, dy) || 1;
  dx /= l; dy /= l;
  const m = W(man, sk.mouth);
  return { x: m.x + dx * 0.5, y: m.y + dy * 0.5, dx, dy };
};

/** Out of the end of his tail, at m.aim if it has one (it turns to it), swept by m.sweep. */
const fromTail = (man, m) => () => {
  const g = B(man), T = g.sk && g.sk.tail;
  if (!T) return null;
  const e = W(man, T[T.length - 1]), q = W(man, T[T.length - 3]);
  let a = m.aim ? Math.atan2(m.aim.y - e.y, m.aim.x - e.x) : Math.atan2(e.y - q.y, e.x - q.x);
  a += m.sweep || 0;
  const dx = Math.cos(a), dy = Math.sin(a);
  return { x: e.x + dx * 0.6, y: e.y + dy * 0.6, dx, dy };
};

/**
 * Out of the plates on his back: the i-th of n beams, from a point along his
 * neck, back and tail (k of the way from his head), fanned out across the
 * sky and sweeping.
 */
const fromPlate = (man, m, i, n) => () => {
  const g = B(man), sk = g.sk;
  if (!sk) return null;
  const pts = [sk.neckMid, sk.chest, sk.hump, { x: sk.hip.x - sk.n.x * 1.4, y: sk.hip.y - sk.n.y * 1.4 }, ...[2, 4, 6, 8, 10, 12].map((j) => sk.tail[j])];
  const k = (i + 0.5) / n;
  const f = k * (pts.length - 1), j = Math.min(pts.length - 2, Math.floor(f)), u = f - j;
  const p = { x: lerp(pts[j].x, pts[j + 1].x, u), y: lerp(pts[j].y, pts[j + 1].y, u) + 1.4 };
  const w = W(man, p);
  // fanned out from in front of him (the ones on his neck), through straight up, to behind (his tail's) - each sweeping its own way
  const fan = lerp(0.7, 2.45, k) + Math.sin(m.pt * 0.85 + i * 1.7) * 0.42 + (m.phase === 'fire' ? Math.min(1, m.pt / 2.5) * (i % 2 ? 0.35 : -0.35) : 0);
  const dx = Math.cos(fan) * g.sx / Math.abs(g.sx || 1), dy = Math.sin(fan);
  return { x: w.x, y: w.y, dx, dy };
};

/* ------------------------------------ moves ------------------------------------ */

/** The way he aims his head at a point (his frame): the goal for `head` that points it there. */
function headAt(man, la) {
  const sk = S(man), g = B(man), n = sk.neckTop;
  const ang = Math.atan2(la.y - n.y, Math.max(0.5, la.x - n.x));
  return clamp(ang + (sk.an - 1.0) * 0.7 - g.rear * 0.75 + 0.12, -1.55, 1.0);
}

const SHIN_MOVES = {
  /** Facing about: a slow turn on the spot, slower than the 1954 one. */
  turn: {
    label: 'Turn around',
    start(man, m) { m.from = man.facing; return true; },
    update(man, m, dt) {
      const g = B(man);
      g.yaw += dt * Math.PI / 1.5;
      if (g.yaw >= Math.PI / 2 && !m.flipped) { m.flipped = true; man.facing = -man.facing; g.yaw -= Math.PI; }
      if (m.flipped && g.yaw >= 0) { g.yaw = 0; return false; }
      return true;
    },
    stop(man) { B(man).yaw = 0; },
  },

  stomp: MOVES.stomp,

  /** The roar: head up, the jaws wide - long, and lower than the 1954 one's. */
  roar: {
    label: 'Roar',
    start(man, m) { setPhase(m, 'draw'); return true; },
    update(man, m, dt) {
      const g = B(man), G = g.goal, gz = man.gz;
      m.pt += dt;
      if (m.phase === 'draw') {
        G.bend = 0.12; G.head = -0.3; G.jaw = 0.3;
        if (m.pt > 0.6) { setPhase(m, 'roar'); roarAt(man); man.sandbox.effects.push(new RoarRings(man.sandbox, man, 2.8)); }
      } else if (m.phase === 'roar') {
        G.rear = 0.45; G.head = 0.55; G.neck = -0.25; G.jaw = 1.15; G.tailLift = 0.25; g.rate = 3.5;
        gz.shake = 0.3;
        if (m.pt > 2.9) { gz.shake = 0; setPhase(m, 'end'); }
      } else if (m.pt > 0.7) return false;
      return true;
    },
    stop(man) { man.gz.shake = 0; },
  },

  /** His tail: up, high - and down on whatever is behind him. */
  tail: {
    label: 'Tail whip',
    start(man, m) {
      m.hit = new Set();
      setPhase(m, 'up');
      man.sandbox.emit('gzTailUp', { who: man, x: man.pos.x, spin: false });
      return true;
    },
    update(man, m, dt) {
      const g = B(man), G = g.goal;
      m.pt += dt;
      if (m.phase === 'up') {
        G.tailLift = -0.55; G.bend = 0.2; G.head = -0.2; g.rate = 2.6;
        if (m.pt > 0.9) { setPhase(m, 'down'); man.sandbox.emit('gzTailSwing', { who: man, x: man.pos.x }); }
      } else if (m.phase === 'down') {
        G.tailLift = 0.75; G.tailHover = 0; G.bend = 0.02; g.rate = 12;
        if (m.pt > 0.12) tailHits(man, m, -man.facing, 1.1);
        if (m.pt > 0.45) setPhase(m, 'settle');
      } else if (m.pt > 0.6) return false;
      return true;
    },
  },

  /** The jaws: a lunge, and shut - and whoever is in them dropped. */
  bite: {
    label: 'Bite',
    start(man, m) { m.noEat = true; return MOVES.bite.start(man, m); },
    update: (man, m, dt) => MOVES.bite.update(man, m, dt),
    stop: (man, m) => MOVES.bite.stop(man, m),
  },

  /**
   * The atomic breath: the head down, the plates lit from the tail up, the
   * jaw split - smoke and fire - and the beam, swept up through whatever is
   * in front of him.
   */
  breath: {
    label: 'Atomic breath',
    start(man, m) {
      setPhase(m, 'charge');
      man.sandbox.emit('shinCharge', { who: man, x: man.pos.x, y: 12 });
      return true;
    },
    update(man, m, dt) {
      const g = B(man), G = g.goal, gz = man.gz, sb = man.sandbox, sk = S(man);
      m.pt += dt;
      const p = targetPoint(m);
      if (p && m.phase !== 'beam') m.aim = { x: p.x, y: p.y };
      const aim = m.aim || W(man, { x: 18, y: 0 });
      const la = L(man, aim.x, aim.y);
      if (m.phase === 'charge') {
        // (the head down, at the street in front of him: the fire goes there first)
        G.bend = 0.18; G.neck = 0.15; G.jaw = 0.35 + m.pt * 0.25; G.split = clamp(m.pt / 1.6, 0, 1); G.tailLift = 0.15;
        G.head = headAt(man, { x: Math.max(6, la.x * 0.4), y: 0 });
        gz.glow = clamp(m.pt / 1.8, 0, 1);
        gz.shake = gz.glow * 0.1;
        if (m.pt > 1.9) {
          setPhase(m, 'spew');
          m.spew = new Spew(sb, man, fromMouth(man));
          sb.effects.push(m.spew);
          sb.emit('shinSpew', { who: man, x: W(man, sk.mouth).x, y: W(man, sk.mouth).y });
        }
      } else if (m.phase === 'spew') {
        // (down at the street in front of him, and along it)
        G.bend = 0.2; G.jaw = 1; G.split = 1; g.rates = { head: 1.6 };
        G.head = headAt(man, { x: Math.max(6, la.x * (0.4 + m.pt * 0.3)), y: 0 });
        gz.glow = 1;
        gz.shake = 0.15;
        if (m.pt > 1.5) {
          if (m.spew) m.spew.stop();
          setPhase(m, 'beam');
          m.beam = new Beam(sb, man, fromMouth(man), { width: 0.45 });
          sb.effects.push(m.beam);
          m.head0 = headAt(man, la);
          sb.emit('shinBeam', { who: man, x: W(man, sk.mouth).x, y: W(man, sk.mouth).y, dur: 3.8, to: aim });
        }
      } else if (m.phase === 'beam') {
        // on it - and then up, slowly, through whatever is behind it
        G.jaw = 1.05; G.split = 1; G.bend = 0.12;
        g.rates = { head: 3 };
        const up = m.pt < 0.8 ? 0 : Math.min(1, (m.pt - 0.8) / 2.8);
        G.head = clamp(m.head0 + up * 0.9 + Math.sin(m.pt * 1.3) * 0.06, -1.55, 1.0);
        gz.glow = 1;
        gz.shake = 0.25;
        if (m.pt > 3.8) { if (m.beam) m.beam.stop(); setPhase(m, 'cool'); sb.emit('shinBeamEnd', { who: man, x: man.pos.x }); }
      } else {
        gz.glow = Math.max(0, 1 - m.pt / 1.4);
        gz.shake = 0;
        G.jaw = 0.45 * (1 - m.pt / 1.4); G.split = 0;
        if (Math.random() < dt * 8) sb.fx.smoke(W(man, sk.mouth).x, W(man, sk.mouth).y, 1, 2);
        if (m.pt > 1.4) { gz.glow = 0; return false; }
      }
      return true;
    },
    stop(man, m) {
      man.gz.glow = 0; man.gz.shake = 0;
      if (m.spew) m.spew.stop();
      if (m.beam) m.beam.stop();
    },
  },

  /** Every plate on his back at once: beams fanned out across the sky, sweeping down through everything round him. */
  dorsal: {
    label: 'Dorsal beams',
    start(man, m) {
      setPhase(m, 'charge');
      man.sandbox.emit('shinCharge', { who: man, x: man.pos.x, y: 12, dorsal: true });
      return true;
    },
    update(man, m, dt) {
      const g = B(man), G = g.goal, gz = man.gz, sb = man.sandbox;
      m.pt += dt;
      if (m.phase === 'charge') {
        G.bend = 0.3; G.crouch = 0.15; G.head = -0.5; G.neck = 0.3; G.jaw = 0.3; G.tailLift = -0.2;
        gz.glow = clamp(m.pt / 1.3, 0, 1);
        gz.shake = gz.glow * 0.15;
        if (m.pt > 1.4) {
          setPhase(m, 'fire');
          const n = 9;
          m.beams = [];
          for (let i = 0; i < n; i++) {
            const b = new Beam(sb, man, fromPlate(man, m, i, n), { width: 0.24, tick: 0.09, ground: i % 3 === 0, k: 0.8 });
            m.beams.push(b);
            sb.effects.push(b);
          }
          sb.emit('shinDorsal', { who: man, x: man.pos.x, y: 14, dur: 4.2 });
        }
      } else if (m.phase === 'fire') {
        G.bend = 0.3; G.crouch = 0.15; G.head = -0.55; G.neck = 0.3; G.jaw = 0.5; G.tailLift = -0.25;
        gz.glow = 1;
        gz.shake = 0.3;
        if (m.pt > 4.2) { for (const b of m.beams) b.stop(); setPhase(m, 'cool'); sb.emit('shinBeamEnd', { who: man, x: man.pos.x }); }
      } else {
        gz.glow = Math.max(0, 1 - m.pt / 1.2);
        gz.shake = 0;
        if (m.pt > 1.2) { gz.glow = 0; return false; }
      }
      return true;
    },
    stop(man, m) { man.gz.glow = 0; man.gz.shake = 0; if (m.beams) for (const b of m.beams) b.stop(); },
  },

  /** The end of his tail: it opens - and a beam out of it, at whatever is behind him. */
  tailBeam: {
    label: 'Tail beam',
    start(man, m) {
      setPhase(m, 'charge');
      man.sandbox.emit('shinCharge', { who: man, x: man.pos.x, y: 10, tail: true });
      return true;
    },
    update(man, m, dt) {
      const g = B(man), G = g.goal, gz = man.gz, sb = man.sandbox;
      m.pt += dt;
      const p = targetPoint(m);
      if (p) m.aim = { x: p.x, y: p.y };
      if (m.phase === 'charge') {
        G.tailLift = -0.3; G.head = -0.25;
        gz.tailGlow = clamp(m.pt / 1.0, 0, 1);
        if (m.pt > 1.05) {
          setPhase(m, 'fire');
          m.sweep = 0;
          m.beam = new Beam(sb, man, fromTail(man, m), { width: 0.32 });
          sb.effects.push(m.beam);
          const e = W(man, S(man).tail[S(man).tail.length - 1]);
          sb.emit('shinTailBeam', { who: man, x: e.x, y: e.y, dur: 2.6 });
        }
      } else if (m.phase === 'fire') {
        G.tailLift = -0.3;
        gz.tailGlow = 1;
        // (swept a little either side of what it is aimed at)
        m.sweep = Math.sin(m.pt * 1.6) * 0.3;
        if (m.pt > 2.6) { if (m.beam) m.beam.stop(); setPhase(m, 'cool'); sb.emit('shinBeamEnd', { who: man, x: man.pos.x }); }
      } else {
        gz.tailGlow = Math.max(0, 1 - m.pt / 0.8);
        if (m.pt > 0.8) { gz.tailGlow = 0; return false; }
      }
      return true;
    },
    stop(man, m) { man.gz.tailGlow = 0; if (m.beam) m.beam.stop(); },
  },
};

const COOL = { turn: 0.8, stomp: 2.6, roar: 18, tail: 5, bite: 3, breath: 15, dorsal: 24, tailBeam: 11 };

/* ------------------------------------ the AI ---------------------------------- */

/** Every step: the move he is in the middle of, or what to do next - and his feet, either way. */
function think(man, dt) {
  const gz = man.gz, sb = man.sandbox, h = man.health;
  gz.cool = gz.cool || {};
  rest(man);
  gz.rage = Math.max(0.15, gz.rage - dt * 0.004);
  // how much he has been hurt lately
  if ((gz.hurtWinT -= dt) <= 0 || gz.hurtWin === undefined) { gz.lost = (gz.hurtWin ?? h.bossHp) - h.bossHp; gz.hurtWin = h.bossHp; gz.hurtWinT = 4; }
  if (gz.state === 'arrive') {
    gz.wantV = 0;
    if (gz.t > 1.1 && !gz.move && !gz.arrived) { gz.arrived = true; begin(man, 'roar'); }
    if (gz.arrived && !gz.move) gz.state = 'hunt';
  }
  if (!gz.move && gz.queued) {
    const q = gz.queued;
    if (sb.time - q.t > 2.5) gz.queued = null;
    else if (begin(man, q.name, q.opts)) gz.queued = null;
  }
  if (gz.move) {
    gz.move.t += dt;
    if (!SHIN_MOVES[gz.move.name].update(man, gz.move, dt)) endMove(man);
    if (gz.move && gz.move.name !== 'turn') gz.wantV = gz.move.v || 0;
  } else if (gz.state === 'hunt' && !gz.auto0) decide(man, dt);
  walk(man, dt, gz.v, (foot) => footDown(man, foot, 0.3));
  if (Math.abs(gz.v) > 0.2) crushIn(man, dt);
}

function decide(man, dt) {
  const gz = man.gz, sb = man.sandbox;
  if ((gz.thinkT -= dt) <= 0 || (gz.target && !alive(gz.target))) {
    gz.target = pickTarget(man);
    gz.thinkT = rand(1.4, 2.4);
  }
  gz.roarT -= dt;
  if (gz.roarT <= 0 && ready(man, 'roar')) { gz.roarT = rand(24, 38); begin(man, 'roar'); return; }
  // hurt, and badly: everything at once
  if ((gz.lost || 0) > 2200 && ready(man, 'dorsal')) { gz.lost = 0; begin(man, 'dorsal'); return; }
  // a crowd round him, now and then: the same
  const crowd = sb.people.filter((p) => p !== man && alive(p) && Math.abs(p.pos.x - man.pos.x) < 22).length;
  if (crowd >= 5 && ready(man, 'dorsal') && chance(dt * 0.15)) { begin(man, 'dorsal'); return; }
  const o = gz.target;
  if (o) { fight(man, o, dt); return; }
  rampage(man, dt);
}

/** Going after somebody. */
function fight(man, o, dt) {
  const gz = man.gz;
  const p = aimAt(o), lp = L(man, p.x, p.y), lf = L(man, o.pos.x, o.pos.y);
  gz.aimAt = null;
  if (rival(man, o)) { fightRival(man, o, lf); return; }
  if (lf.x < -1.2 * K) {
    gz.wantV = 0;
    if (lf.x > -12 * K && ready(man, 'tail') && chance(0.5)) { begin(man, 'tail', { o }); return; }
    if (lf.x < -6 * K && ready(man, 'tailBeam') && chance(0.5)) { begin(man, 'tailBeam', { o }); return; }
    begin(man, 'turn');
    return;
  }
  const x = lf.x;
  const pick = (opts) => {
    const list = opts.filter(([n, w]) => w > 0 && ready(man, n));
    if (!list.length) return false;
    let total = 0;
    for (const e of list) total += e[1];
    let r = rand(0, total);
    for (const [n, w] of list) { r -= w; if (r <= 0) return begin(man, n, { o }); }
    return begin(man, list[0][0], { o });
  };
  if (x < 3.4 * K && lp.y < 3.5 && o.pos.y < 1.5) {
    if (pick([['stomp', 5]])) return;
  } else if (x < 7.2 * K) {
    const reach = aimMouth(B(man).b, { x: lp.x + clamp(o.vel.x * man.facing, -4, 4) * 0.4, y: lp.y }).d;
    if (pick([['bite', reach < 1 * K ? 3 : 0], ['stomp', x < 4.4 * K && lp.y < 3.5 ? 2 : 0]])) return;
  } else if (x < 40 && ready(man, 'breath') && chance(0.02 + gz.rage * 0.02)) {
    begin(man, 'breath', { o });
    return;
  }
  approach(man, o.pos.x, (lp.y > 5 ? 6 : 4.6) * K);
}

/** Another of them: the beam from far off; up close, his jaws and his tail. */
function fightRival(man, o, lf) {
  const gz = man.gz;
  if (lf.x < -2 * K) {
    gz.wantV = 0;
    if (lf.x > -12 * K && ready(man, 'tail')) { begin(man, 'tail', { o }); return; }
    if (ready(man, 'tailBeam') && chance(0.5)) { begin(man, 'tailBeam', { o }); return; }
    begin(man, 'turn');
    return;
  }
  if (ready(man, 'breath') && lf.x > 7 * K && chance(0.04)) { begin(man, 'breath', { o }); return; }
  if (lf.x < 7.5 * K) {
    gz.wantV = 0;
    if (ready(man, 'bite') && chance(0.6)) { begin(man, 'bite', { o }); return; }
    if (ready(man, 'breath') && chance(0.02)) { begin(man, 'breath', { o }); return; }
    if (lf.x < 5 * K) gz.wantV = -man.facing * 0.5;
    return;
  }
  approach(man, o.pos.x, 6.5 * K);
}

/** With nobody to go after: the buildings - cut down with the beam, bitten, smashed with his tail. */
function rampage(man, dt) {
  const gz = man.gz, sb = man.sandbox;
  let w = gz.building;
  if (w && gz.buildingCells !== undefined && gz.buildingTries >= 4) {
    if (gz.buildingCells - w.cellCount < 40) (gz.skip = gz.skip || new Set()).add(w);
    gz.buildingTries = 0;
    gz.buildingCells = w.cellCount;
  }
  if (!w || !wreckable(w) || (gz.skip && gz.skip.has(w)) || (gz.buildingT -= dt) <= 0) {
    w = gz.building = nearestBuilding(man);
    gz.buildingT = rand(16, 26);
    gz.buildingAt = null;
    gz.buildingTries = 0;
    gz.buildingCells = w ? w.cellCount : undefined;
  }
  if (!w) {
    gz.aimAt = null;
    if (!gz.wander || Math.abs(gz.wander - man.pos.x) < 1) gz.wander = rand(sb.left + 8, sb.right - 8);
    const dir = sign(gz.wander - man.pos.x);
    if (dir !== man.facing) { begin(man, 'turn'); return; }
    gz.wantV = dir * PACE * 0.6;
    return;
  }
  if (!gz.buildingAt || !w.contains(gz.buildingAt.x, gz.buildingAt.y, 0.3)) gz.buildingAt = buildingPoint(man, w);
  const at = gz.buildingAt;
  gz.aimAt = at;
  if (!at) { (gz.skip = gz.skip || new Set()).add(w); gz.building = null; return; }
  const lp = L(man, at.x, at.y);
  if (lp.x < -1.5 * K) {
    gz.wantV = 0;
    if (lp.x > -11 * K && ready(man, 'tail') && chance(0.4)) { if (begin(man, 'tail', { at, w })) gz.buildingTries = (gz.buildingTries || 0) + 1; return; }
    begin(man, 'turn');
    return;
  }
  // the beam, from where he is: it reaches right across the city
  if (lp.x > 5 * K && ready(man, 'breath') && chance(dt * 0.5)) { if (begin(man, 'breath', { at, w })) gz.buildingTries = (gz.buildingTries || 0) + 1; return; }
  if (ready(man, 'dorsal') && chance(dt * 0.02)) { begin(man, 'dorsal'); return; }
  if (lp.x < 7.2 * K) {
    gz.wantV = 0;
    const opts = [['bite', lp.y > 9 ? 3 : 1], ['tail', 0.6], ['stomp', at.y < 3 ? 1 : 0]].filter(([n, wt]) => wt > 0 && ready(man, n));
    if (opts.length) {
      let total = 0;
      for (const e of opts) total += e[1];
      let r = rand(0, total);
      for (const [n, wt] of opts) { r -= wt; if (r <= 0) { if (begin(man, n, { at, w })) gz.buildingTries = (gz.buildingTries || 0) + 1; return; } }
    }
    return;
  }
  approach(man, at.x, 5 * K);
}

/* ------------------------------------ dying ------------------------------------ */

function startDeath(man) {
  const gz = man.gz, sb = man.sandbox;
  endMove(man);
  gz.state = 'dying';
  gz.t = 0;
  gz.glow = 0;
  gz.tailGlow = 0;
  gz.wantV = 0;
  man.health.shield = 99;
  sb.emit('gzDying', { who: man, x: man.pos.x, y: 12 });
}

/** A last roar - and he does not fall: he stands there, head up, and freezes solid where he stands. */
function updateDeath(man, dt) {
  const gz = man.gz, g = B(man), G = g.goal, sb = man.sandbox;
  gz.wantV = 0;
  walk(man, dt, 0, null);
  if (man.dead) return;
  G.rear = 0.35; G.head = 0.55; G.neck = -0.2; G.jaw = 0.8; G.split = 0; G.tailLift = -0.35; G.bend = 0;
  g.rate = 1.6;
  if (gz.t < 2.4) {
    gz.shake = 0.2;
    if (!gz.cried && gz.t > 0.3) { gz.cried = true; sb.emit('gzDeathRoar', { who: man, x: man.pos.x, y: 16 }); }
  } else {
    gz.shake = 0;
    // the cold going through him, from his feet up
    gz.frost = Math.min(1, (gz.t - 2.4) / 2.6);
    if (Math.random() < dt * 14) sb.fx.steam(man.pos.x + rand(-4, 4), rand(1, 16), 1);
    if (gz.t > 5.2) {
      gz.dead = true;
      gz.frost = 1;
      const by = gz.lastBy && !gz.lastBy.removed ? gz.lastBy : null;
      man.health.shield = 0;
      man.die('frozen solid', by);
      sb.emit('gzDeath', { who: man, by, x: man.pos.x, y: 6, frozen: true });
    }
  }
}

/* ------------------------------- for the inspector ---------------------------- */

const DOING = {
  turn: () => 'Turning around',
  stomp: (o) => (o ? `Stomping on ${o.name}` : 'Stomping'),
  tail: (o) => (o ? `Bringing his tail down on ${o.name}` : 'Bringing his tail down'),
  roar: () => 'Roaring',
  bite: (o) => (o ? `Biting at ${o.name}` : 'Biting'),
  breath: (o) => (o ? `Atomic breath, at ${o.name}` : 'Atomic breath'),
  dorsal: () => 'Firing beams from his back',
  tailBeam: (o) => (o ? `A beam from his tail, at ${o.name}` : 'A beam from his tail'),
};

function doing(man) {
  const gz = man.gz;
  if (man.dead) return 'Frozen solid where he stood';
  if (gz.state === 'dying') return 'Freezing solid';
  if (gz.move) {
    const m = gz.move, o = m.o && !m.o.removed ? m.o : null;
    if (!o && m.w && !m.w.removed) return { bite: 'Biting a building', tail: 'Smashing a building with his tail', breath: 'Cutting a building down with his beam' }[m.name] || DOING[m.name](null);
    return DOING[m.name](o);
  }
  if (gz.target && alive(gz.target)) return Math.abs(gz.v) > 0.2 ? `Going after ${gz.target.name}` : `Watching ${gz.target.name}`;
  if (gz.building && !gz.building.removed) return 'Heading for a building';
  return 'Walking through the city';
}

/* ------------------------------- the abilities panel ---------------------------- */

function abilities(man) {
  const gz = man.gz;
  if (!gz || man.dead || gz.state === 'dying') return null;
  const target = () => (alive(gz.target) ? gz.target : (gz.target = pickTarget(man)));
  const on = (n) => !!gz.move && gz.move.name === n;
  const go = (name) => () => {
    const o = target();
    if (gz.move) endMove(man);
    const at = o ? null : gz.building && wreckable(gz.building) ? buildingPoint(man, gz.building) : null;
    const opts = { o, at, w: at ? gz.building : null };
    if (begin(man, name, opts)) return true;
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
    { id: 'tail', label: 'Tail whip', group: 'do', on: on('tail'), pick: go('tail') },
    { id: 'roar', label: 'Roar', group: 'do', on: on('roar'), pick: () => { if (gz.move) endMove(man); return begin(man, 'roar'); } },
    { id: 'bite', label: 'Bite', group: 'do', on: on('bite'), pick: go('bite') },
    { id: 'breath', label: 'Atomic breath', group: 'do', on: on('breath'), pick: go('breath') },
    { id: 'dorsal', label: 'Dorsal beams', group: 'do', on: on('dorsal'), pick: go('dorsal') },
    { id: 'tailBeam', label: 'Tail beam', group: 'do', on: on('tailBeam'), pick: go('tailBeam') },
  ];
}

/* ------------------------------------ him ------------------------------------ */

export const SHIN = kaiju({
  kind: 'shin', build: SHIN_BUILD, maxHp: SHIN_HP, hide: HIDE, mends: MENDS, mendAfter: MEND_AFTER,
  skin: shinSkin, makeMarks: makeCracks, room: 3.4 * K, power: 18,
  think, doing, abilities, startDeath, updateDeath, onHurt,
  color: '#8a2be2', style: 'kaiju shin', seeLine: 'seeShin',
  gz: () => ({ moveset: SHIN_MOVES, cooling: COOL, tailGlow: 0, frost: 0, roarT: rand(14, 22) }),
  note: (man) => (man.gz.glow > 0.2 ? (man.gz.move && man.gz.move.name === 'dorsal' ? 'Dorsal beams' : 'Atomic breath') : man.gz.tailGlow > 0.2 ? 'Tail beam' : man.gz.rage > 0.75 ? 'Enraged' : ''),
  hideLines: [{ text: 'Bullets and blades do next to nothing; explosions do a little. Hurt him badly, and every plate on his back fires', bad: true }],
  tally: (gz) => ({ text: `Killed: ${gz.kills} · Buildings wrecked: ${gz.wrecked}`, bad: gz.kills > 0 }),
});

/** Shin Godzilla, at x: out of the ground's shaking, with a roar. */
export function spawnShin(sb, x) {
  const n = sb.people.filter((p) => p.species === SHIN).length;
  const man = sb.spawnStickman(x, 0, {
    name: n ? `Shin Godzilla ${n + 1}` : 'Shin Godzilla', species: SHIN, scale: 8, airborne: true, hair: 'none', voice: 0.15, strength: 10,
    traits: { bravery: 1, aggression: 1, temper: 1, empathy: 0, sociability: 0, curiosity: 0.1, toughness: 1, skill: 0.6 },
    look: { key: 'shin' },
  });
  if (!man) return null;
  if (man.facing !== shinFacingAt(man.pos.x)) {
    man.facing = shinFacingAt(man.pos.x);
    man.gz.body = newBody(man, SHIN_BUILD);
    stepBody(man, 0);
  }
  sb.emit('gzSpawn', { who: man, x: man.pos.x, y: 0, tall: 24 });
  return man;
}

export const isShin = (p) => !!(p && p.species === SHIN);
