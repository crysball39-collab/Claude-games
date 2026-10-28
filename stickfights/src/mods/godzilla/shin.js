/* =============================================================================
   SHIN GODZILLA - what he is, what he does, and how he decides to: in each of
   his forms.

   He comes up out of the ground as the SECOND FORM: a thing like a huge eel
   that has grown legs, dragging its belly up the street, with round staring
   eyes and gills that pour out red. Whoever is under it as it crawls is
   crushed; it brings its head down on whatever is in front of it, thrashes
   its tail at whatever is behind, and roars - a wet, bubbling noise. Before
   long (sooner, the more it is hurt) it stops, and shudders, and the steam
   pours off it - and out of the steam it rises onto its back legs: the THIRD
   FORM, red, smaller than it will be, its little arms held up. It stomps,
   bites, brings its tail down and roars, until the steam comes again - and
   out of it the FOURTH: what he becomes. Slow, and nothing stops him.

     at his feet       a stomp
     at his head       a bite: the jaws shut on them, and they are dropped
     behind him        his tail comes down on them - or, further off, the
                       end of it opens and a beam comes out of it
     far off           the atomic breath: his head goes down, the plates on
                       his back light up purple from the tail up, and his
                       lower jaw splits in two. Black smog pours out over
                       the street; it catches, and is a flood of fire; the
                       fire draws in, thin and purple, the plates blazing -
                       and it is a beam that cuts through anything. He
                       sweeps it up and across, and whatever it crossed
                       comes down
     hurt, and badly   the plates on his back all fire at once, and the end
                       of his tail with them: beams sweeping round him,
                       cutting up everything there is
   And he roars. Out of health, he does not fall: he stays where he is, and
   freezes solid.

   His moves are run the way the 1954 one's are (moves.js), from a moveset
   that is his form's own - and the stomp is the same move.
   ========================================================================== */
import { clamp, lerp, rand, chance, sign } from '../../core/util.js';
import { toLocal, toWorld, walk, aimMouth, newBody, stepBody, kOf } from './body.js';
import { SHIN_BUILDS } from './shin-body.js';
import { shinSkin, makeCracks, shinFacingAt } from './shin-look.js';
import { MOVES, begin, endMove, ready, targetPoint, setPhase, aimAt, alive, giant, pickTarget, onHurt, rival } from './moves.js';
import { footDown, quake, roarAt, tailHits, crushIn, crush, smash, wreck, wreckable, nearestBuilding, buildingPoint } from './world.js';
import { Beam, Spew, EvolveCloud, Gush } from './shin-effects.js';
import { RoarRings } from './effects.js';
import { kaiju } from './species.js';

export const SHIN_HP = 50000;
/** How much of each kind of harm gets through his hide: less than through the 1954 one's. */
const HIDE = { bullet: 0.18, blade: 0.1, blunt: 0.06, impact: 0.15, blast: 0.75, burn: 0.08, rail: 0.9, beam: 0.8, kaiju: 0.75 };
const MENDS = 15;
const MEND_AFTER = 8;

const B = (man) => man.gz.body;
const S = (man) => man.gz.body.sk;
const L = (man, x, y) => toLocal(B(man), man, x, y);
const W = (man, p) => toWorld(B(man), man, p);
/** The form he is in now (FORMS, below). */
const form = (man) => FORMS[man.gz.form] || FORMS[4];

/* ---------------------------------- at rest ----------------------------------- */

/** The goals his posture goes back to between moves - and the looking at whatever he is after. */
function rest(man) {
  const g = B(man), G = g.goal, gz = man.gz, t = man.sandbox.time;
  G.bend = 0.03 + Math.min(0.08, Math.abs(gz.v) * 0.05);
  G.crouch = 0; G.rear = 0; G.neck = 0; G.lean = 0; G.split = 0;
  G.tailLift = 0; G.tailHover = 0;
  G.head = -0.12;
  G.jaw = 0.1 + Math.max(0, Math.sin(t * 0.5 + man.id)) * 0.06;
  if (gz.form === 2) {
    // (crawling: the front of it heaving up and down as it drags itself along, the mouth hanging open)
    G.bend = 0;
    G.rear = 0.1 + Math.sin(g.t * 2.4) * 0.07 * Math.min(1, Math.abs(gz.v) * 1.5);
    G.head = -0.05;
    G.jaw = 0.22 + Math.max(0, Math.sin(t * 0.8 + man.id)) * 0.12;
  } else if (gz.form === 3) {
    // (up on its back legs for the first time, and swaying)
    G.lean = Math.sin(g.t * 1.3) * 0.035;
    G.bend = 0.1 + Math.min(0.08, Math.abs(gz.v) * 0.05);
  }
  g.rate = 2.6;
  g.rates = null;
  g.hands.A = null;
  g.hands.B = null;
  if (!gz.move) {
    gz.glow = Math.max(0, gz.glow - 0.02);
    gz.tailGlow = Math.max(0, (gz.tailGlow || 0) - 0.02);
    gz.flare = Math.max(0, (gz.flare || 0) - 0.03);
  }
  // the gills, breathing: a little open, and shut
  if (!gz.move || !gz.move.gills) gz.gills = lerp(gz.gills || 0, form(man).gills ? 0.08 + Math.max(0, Math.sin(t * 1.2 + man.id)) * 0.22 : 0, 0.05);
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
  const gz = man.gz, f = man.facing, K = kOf(man);
  const d = x - f * gap - man.pos.x;
  if (Math.abs(d) < 0.6 * K) { gz.wantV = 0; return true; }
  if (sign(d) !== f && Math.abs(d) > 2 * K) { gz.wantV = 0; return false; }
  gz.wantV = sign(d) * form(man).pace * (sign(d) === f ? 1 : 0.5) * (0.85 + gz.rage * 0.3);
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

/** Out of the gills down the side of its neck: somewhere along them, out and down. */
const fromGills = (man) => () => {
  const sk = S(man);
  if (!sk) return null;
  const t = rand(0.2, 0.75);
  const p = W(man, { x: lerp(sk.chest.x, sk.neckTop.x, t), y: lerp(sk.chest.y, sk.neckTop.y, t) });
  return { x: p.x, y: p.y, vx: man.facing * rand(0.5, 2.2), vy: rand(-0.5, 1) };
};

/* ------------------------------- what he does to it ------------------------------ */

/** The way he aims his head at a point (his frame): the goal for `head` that points it there. */
function headAt(man, la) {
  const sk = S(man), g = B(man), n = sk.neckTop;
  const ang = Math.atan2(la.y - n.y, Math.max(0.5, la.x - n.x));
  return clamp(ang + (sk.an - 1.0) * 0.7 - g.rear * 0.75 + 0.12, -1.55, 1.0);
}

/**
 * The second form's head coming down on the street, or on whatever is there:
 * whoever it lands on is crushed, crates under it smashed, what it hits
 * broken in - and everyone near it thrown off their feet.
 */
function headSlam(man, m) {
  const sb = man.sandbox, sk = S(man);
  const a = W(man, sk.head), b = W(man, sk.snout), j = W(man, sk.jawTip);
  const x0 = Math.min(a.x, b.x, j.x) - 0.8, x1 = Math.max(a.x, b.x, j.x) + 0.8, cx = (x0 + x1) / 2;
  for (const p of [...sb.people]) {
    if (p === man || p.removed || p.state === 'held' || p.box.maxX < x0 || p.box.minX > x1) continue;
    if (rival(man, p)) {
      // (another of them: a blow on that scale)
      const q = p.nearestPart(cx, 1.5);
      if (q && q.d < 3 && !m.hitRival) {
        m.hitRival = true;
        p.takeHit({ by: man, part: q.part, x: q.x, y: q.y, dir: man.facing, power: 26, kind: 'impact', weapon: 'kaijuBlow', bone: p.boneName(q.bone, q.t) });
        sb.fx.dust(q.x, q.y, 10, 1.6);
        sb.emit('gzRivalHit', { who: p, by: man, x: q.x, y: q.y, how: 'lunge' });
      }
      continue;
    }
    if (giant(p) || p.box.minY > 2.6) continue;
    crush(man, p, cx);
  }
  for (const c of [...sb.crates]) {
    if (c.removed || c.carriedBy) continue;
    const bb = c.body.aabb();
    if (bb.maxX < x0 || bb.minX > x1 || bb.minY > 2.6) continue;
    smash(man, c);
  }
  if (wreck(man, cx, 1.4, 2.4, 30, { dx: man.facing, dy: -0.4 })) sb.emit('gzGouge', { who: man, x: cx, y: 1.4 });
  quake(man, cx, 0.85);
  sb.fx.dust(cx, 0.05, 30, 3);
  sb.emit('gzStep', { who: man, x: cx, k: 0.85, foot: 'head' });
}

/** The second form, crawling: whoever is under its belly as it drags itself over them is crushed. */
function crawl(man) {
  const sb = man.sandbox, sk = S(man);
  const a = W(man, sk.hip), b = W(man, sk.chest);
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), cx = (x0 + x1) / 2;
  for (const p of [...sb.people]) {
    if (p === man || p.removed || giant(p) || p.state === 'held' || p.gzFlat) continue;
    if (p.box.maxX < x0 || p.box.minX > x1 || p.box.minY > 1.2) continue;
    crush(man, p, cx);
  }
}

/* ------------------------------------ moves ------------------------------------ */

/** What each stage of the breath is called, for the inspector. */
const BREATH_STAGE = { charge: 'Lighting up', smog: 'Pouring out black smog', fire: 'Breathing fire', build: 'The beam coming', beam: 'Atomic beam', cool: 'Atomic breath' };

const SHIN_MOVES = {
  /** Facing about: a slow turn on the spot - slower than the 1954 one, and slower still crawling. */
  turn: {
    label: 'Turn around',
    start(man, m) { m.from = man.facing; return true; },
    update(man, m, dt) {
      const g = B(man);
      g.yaw += dt * Math.PI / (man.gz.form === 2 ? 2 : 1.5);
      if (g.yaw >= Math.PI / 2 && !m.flipped) { m.flipped = true; man.facing = -man.facing; g.yaw -= Math.PI; }
      if (m.flipped && g.yaw >= 0) { g.yaw = 0; return false; }
      return true;
    },
    stop(man) { B(man).yaw = 0; },
  },

  stomp: MOVES.stomp,

  /** The roar: head up, the jaws wide - long, and lower than the 1954 one's (the second form's, wet, and bubbling). */
  roar: {
    label: 'Roar',
    start(man, m) { setPhase(m, 'draw'); return true; },
    update(man, m, dt) {
      const g = B(man), G = g.goal, gz = man.gz, f = gz.form;
      m.pt += dt;
      if (m.phase === 'draw') {
        G.bend = f === 2 ? 0 : 0.12; G.head = -0.3; G.jaw = 0.3;
        if (m.pt > 0.6) { setPhase(m, 'roar'); roarAt(man); man.sandbox.effects.push(new RoarRings(man.sandbox, man, f === 4 ? 2.8 : f === 3 ? 2.3 : 1.8)); }
      } else if (m.phase === 'roar') {
        if (f === 2) { G.rear = 0.6; G.head = 0.35; G.neck = -0.1; G.jaw = 1.1; G.tailLift = 0.2; gz.gills = Math.min(1, (gz.gills || 0) + dt * 2); m.gills = true; } else { G.rear = 0.45; G.head = 0.55; G.neck = -0.25; G.jaw = 1.15; G.tailLift = 0.25; }
        g.rate = 3.5;
        gz.shake = 0.3;
        if (m.pt > (f === 4 ? 2.9 : 2.3)) { gz.shake = 0; setPhase(m, 'end'); }
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
      const g = B(man), G = g.goal, F = form(man), [up, down] = F.tail;
      m.pt += dt;
      if (m.phase === 'up') {
        G.tailLift = up; G.bend = 0.2; G.head = -0.2; g.rate = 2.6;
        if (m.pt > 0.9) { setPhase(m, 'down'); man.sandbox.emit('gzTailSwing', { who: man, x: man.pos.x }); }
      } else if (m.phase === 'down') {
        G.tailLift = down; G.tailHover = 0; G.bend = 0.02; g.rate = 12;
        if (m.pt > 0.1) tailHits(man, m, -man.facing, F.tailK);
        if (m.pt > 0.8) setPhase(m, 'settle');
      } else if (m.pt > 0.7) return false;
      return true;
    },
  },

  /** The second form's tail, lying out behind it: thrashed up and down - three times - on whatever is there. */
  thrash: {
    label: 'Tail thrash',
    start(man, m) {
      m.n = 0;
      m.hit = new Set();
      setPhase(m, 'up');
      man.sandbox.emit('gzTailUp', { who: man, x: man.pos.x, spin: false });
      return true;
    },
    update(man, m, dt) {
      const g = B(man), G = g.goal, [up, down] = form(man).tail;
      m.pt += dt;
      G.rear = 0.25; G.head = 0.15; G.jaw = 0.7;
      if (m.phase === 'up') {
        G.tailLift = up; g.rate = 6;
        if (m.pt > 0.4) { setPhase(m, 'down'); m.hit = new Set(); man.sandbox.emit('gzTailSwing', { who: man, x: man.pos.x }); }
      } else if (m.phase === 'down') {
        G.tailLift = down; g.rate = 13;
        if (m.pt > 0.08) tailHits(man, m, -man.facing, form(man).tailK);
        if (m.pt > 0.32) { m.n++; setPhase(m, m.n < 3 ? 'up' : 'settle'); }
      } else if (m.pt > 0.5) return false;
      return true;
    },
  },

  /** The second form's head: up, the front of it lifted off the street - and down, all the weight of it, on whatever is in front. */
  lunge: {
    label: 'Headbutt',
    start(man, m) { setPhase(m, 'rear'); return true; },
    update(man, m, dt) {
      const g = B(man), G = g.goal;
      m.pt += dt;
      if (m.phase === 'rear') {
        G.rear = 0.8; G.head = 0.3; G.neck = -0.2; G.jaw = 0.8; G.tailLift = 0.15; g.rate = 3;
        if (m.pt > 0.8) setPhase(m, 'slam');
      } else if (m.phase === 'slam') {
        G.rear = -0.15; G.bend = 0.5; G.head = -0.5; G.neck = 0.3; G.jaw = 0.25; G.tailLift = -0.2; g.rate = 11;
        m.v = man.facing * 2.6;
        if (m.pt > 0.22 && !m.done) { m.done = true; m.v = 0; headSlam(man, m); setPhase(m, 'back'); }
      } else {
        m.v = 0;
        G.rear = 0; G.bend = 0.3 * (1 - m.pt / 0.8); g.rate = 2.5;
        if (m.pt > 0.8) return false;
      }
      return true;
    },
  },

  /** Its gills, opened wide: red pouring out of them, down its neck and onto the street. */
  gills: {
    label: 'Gills',
    start(man, m) {
      m.gills = true;
      setPhase(m, 'open');
      m.gush = new Gush(man.sandbox, man, fromGills(man));
      man.sandbox.effects.push(m.gush);
      man.sandbox.emit('shinGills', { who: man, x: man.pos.x, y: 4 });
      return true;
    },
    update(man, m, dt) {
      const g = B(man), G = g.goal, gz = man.gz;
      m.pt += dt;
      G.rear = 0.35; G.head = 0.25; G.neck = -0.1; G.jaw = 0.55 + Math.sin(m.pt * 5) * 0.15;
      if (m.phase === 'open') {
        gz.gills = Math.min(1, (gz.gills || 0) + dt * 2.5);
        if (m.pt > 2.6) { m.gush.stop(); setPhase(m, 'shut'); }
      } else {
        gz.gills = Math.max(0.1, gz.gills - dt * 1.5);
        if (m.pt > 0.8) return false;
      }
      return true;
    },
    stop(man, m) { if (m.gush) m.gush.stop(); },
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
   * jaw split - black smog, poured out over the street; the smog catching,
   * and fire after it; the fire drawn in, thin and purple, as the beam comes
   * - and the beam, swept up through whatever is in front of him.
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
      const mo = () => W(man, sk.mouth);
      // (the head at the street in front of him: k of the way out to what it is aimed at, and no nearer than six metres)
      const street = (k) => headAt(man, { x: Math.max(6, la.x * k), y: 0 });
      if (m.phase === 'charge') {
        // the head down; the plates lighting up from the tail; the jaw splitting in two
        G.bend = 0.18; G.neck = 0.15; G.jaw = 0.35 + m.pt * 0.25; G.split = clamp(m.pt / 1.5, 0, 1); G.tailLift = 0.15;
        G.head = street(0.35);
        gz.glow = clamp(m.pt / 1.6, 0, 1);
        gz.shake = gz.glow * 0.1;
        if (m.pt > 1.6) {
          setPhase(m, 'smog');
          m.spew = new Spew(sb, man, fromMouth(man));
          sb.effects.push(m.spew);
          sb.emit('shinSmog', { who: man, x: mo().x, y: mo().y });
        }
      } else if (m.phase === 'smog') {
        // black smog, pouring down over the street and rolling along it
        G.bend = 0.2; G.jaw = 1; G.split = 1; g.rates = { head: 1.4 };
        G.head = street(0.3 + m.pt * 0.1);
        gz.glow = 1;
        gz.shake = 0.12;
        if (m.pt > 1.7) {
          setPhase(m, 'fire');
          m.spew.ignite();
          sb.emit('shinIgnite', { who: man, x: mo().x, y: mo().y });
        }
      } else if (m.phase === 'fire') {
        // it catches - and fire floods out after it, along the street
        G.bend = 0.2; G.jaw = 1.05; G.split = 1; g.rates = { head: 1.6 };
        G.head = street(0.45 + m.pt * 0.2);
        gz.glow = 1;
        gz.shake = 0.18;
        if (m.pt > 1.8) {
          setPhase(m, 'build');
          m.spew.mode = 'narrow';
          sb.emit('shinBuild', { who: man, x: mo().x, y: mo().y, dur: 1.2 });
        }
      } else if (m.phase === 'build') {
        // the fire drawn in to a thread, going purple; the plates blazing, the light in his throat building - and his head coming up onto it
        const k = clamp(m.pt / 1.2, 0, 1);
        G.jaw = 1.05; G.split = 1; G.bend = lerp(0.2, 0.12, k); g.rates = { head: 2.2 };
        G.head = lerp(street(0.81), headAt(man, la), k);
        m.spew.narrow = k;
        gz.glow = 1;
        gz.flare = k * (0.8 + 0.2 * Math.sin(m.pt * 31));
        gz.shake = 0.18 + k * 0.12;
        if (m.pt > 1.2) {
          m.spew.stop();
          setPhase(m, 'beam');
          m.beam = new Beam(sb, man, fromMouth(man), { width: 0.45 });
          sb.effects.push(m.beam);
          m.head0 = headAt(man, la);
          sb.emit('shinBeam', { who: man, x: mo().x, y: mo().y, dur: 3.8, to: aim });
        }
      } else if (m.phase === 'beam') {
        // on it - and then up, slowly, through whatever is behind it
        G.jaw = 1.05; G.split = 1; G.bend = 0.12;
        g.rates = { head: 3 };
        const up = m.pt < 0.8 ? 0 : Math.min(1, (m.pt - 0.8) / 2.8);
        G.head = clamp(m.head0 + up * 0.9 + Math.sin(m.pt * 1.3) * 0.06, -1.55, 1.0);
        gz.glow = 1;
        gz.flare = 0.55 + Math.sin(m.pt * 23) * 0.1;
        gz.shake = 0.25;
        if (m.pt > 3.8) { if (m.beam) m.beam.stop(); setPhase(m, 'cool'); sb.emit('shinBeamEnd', { who: man, x: man.pos.x }); }
      } else {
        gz.glow = Math.max(0, 1 - m.pt / 1.4);
        gz.flare = Math.max(0, gz.flare - dt * 2);
        gz.shake = 0;
        G.jaw = 0.45 * (1 - m.pt / 1.4); G.split = 0;
        if (Math.random() < dt * 8) sb.fx.smoke(mo().x, mo().y, 1, 2);
        if (m.pt > 1.4) { gz.glow = 0; return false; }
      }
      return true;
    },
    stop(man, m) {
      man.gz.glow = 0; man.gz.shake = 0; man.gz.flare = 0;
      if (m.spew) m.spew.stop();
      if (m.beam) m.beam.stop();
    },
  },

  /**
   * Every plate on his back at once - and the end of his tail with them:
   * beams fanned out across the sky, sweeping down through everything round him.
   */
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
        gz.tailGlow = clamp((m.pt - 0.6) / 0.8, 0, 1);
        gz.flare = clamp((m.pt - 0.8) / 0.6, 0, 1) * 0.6;
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
          // (the end of his tail, sweeping behind him)
          m.sweep = 0;
          const t = new Beam(sb, man, fromTail(man, m), { width: 0.28, tick: 0.09, k: 0.8 });
          m.beams.push(t);
          sb.effects.push(t);
          sb.emit('shinDorsal', { who: man, x: man.pos.x, y: 14, dur: 4.2 });
        }
      } else if (m.phase === 'fire') {
        G.bend = 0.3; G.crouch = 0.15; G.head = -0.55; G.neck = 0.3; G.jaw = 0.5; G.tailLift = -0.25;
        gz.glow = 1;
        gz.tailGlow = 1;
        gz.flare = 0.6 + Math.sin(m.pt * 19) * 0.15;
        gz.shake = 0.3;
        m.sweep = Math.sin(m.pt * 1.1) * 0.55;
        if (m.pt > 4.2) { for (const b of m.beams) b.stop(); setPhase(m, 'cool'); sb.emit('shinBeamEnd', { who: man, x: man.pos.x }); }
      } else {
        gz.glow = Math.max(0, 1 - m.pt / 1.2);
        gz.tailGlow = gz.glow;
        gz.flare = 0;
        gz.shake = 0;
        if (m.pt > 1.2) { gz.glow = 0; return false; }
      }
      return true;
    },
    stop(man, m) { man.gz.glow = 0; man.gz.tailGlow = 0; man.gz.flare = 0; man.gz.shake = 0; if (m.beams) for (const b of m.beams) b.stop(); },
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

  /**
   * Changing into the next form: he stops, and shudders, and the steam pours
   * off all of him - and in the thick of it he is something else, crouched
   * low, rising up out of it.
   */
  evolve: {
    label: 'Evolve',
    start(man, m) {
      if (!form(man).next) return false;
      m.gills = true;
      setPhase(m, 'shudder');
      m.cloud = new EvolveCloud(man.sandbox, man);
      man.sandbox.effects.push(m.cloud);
      man.sandbox.emit('shinChanging', { who: man, x: man.pos.x, y: 4, form: man.gz.form });
      return true;
    },
    update(man, m, dt) {
      const gz = man.gz, sb = man.sandbox;
      m.pt += dt;
      if (m.phase === 'shudder') {
        const g = B(man), G = g.goal;
        G.crouch = 0.25; G.bend = 0.2; G.rear = 0.1; g.rate = 5;
        G.head = -0.3 + Math.sin(m.pt * 9) * 0.15; G.jaw = 0.5 + Math.sin(m.pt * 13) * 0.35; G.tailLift = Math.sin(m.pt * 7) * 0.3;
        gz.shake = 0.35;
        gz.gills = Math.min(1, (gz.gills || 0) + dt * 2);
        if (m.pt > 1.7) setPhase(m, 'change');
      } else if (m.phase === 'change') {
        gz.shake = 0.15;
        if (!m.changed && m.pt > 0.4) {
          m.changed = true;
          setForm(man, gz.form + 1);
          // (what is in the steam now: crouched down low in it)
          const g = B(man);
          for (const [k, v] of [['crouch', 0.9], ['bend', 0.45], ['head', -0.5], ['jaw', 0.3]]) { g[k] = v; g.goal[k] = v; }
          stepBody(man, 0);
          sb.emit('shinEvolve', { who: man, x: man.pos.x, y: 6, form: gz.form, tall: form(man).tall, wide: form(man).wide });
        }
        if (m.changed) { const G = B(man).goal; G.crouch = 0.9; G.bend = 0.45; G.head = -0.5; G.jaw = 0.3; }
        if (m.pt > 1.1) setPhase(m, 'rise');
      } else {
        // rising up out of it
        const g = B(man), G = g.goal, u = clamp(m.pt / 1.8, 0, 1);
        G.crouch = 0.9 * (1 - u); G.bend = 0.45 * (1 - u); G.head = -0.5 + u * 0.4; g.rate = 2;
        gz.shake = 0;
        if (m.pt > 0.4 && m.cloud) { m.cloud.stop(); m.cloud = null; }
        // (and the first thing it does, a roar)
        if (m.pt > 2) { gz.roarT = 0; gz.cool.roar = -99; return false; }
      }
      return true;
    },
    stop(man, m) { man.gz.shake = 0; if (m.cloud) m.cloud.stop(); },
  },
};

const COOL = { turn: 0.8, stomp: 2.6, roar: 18, tail: 5, thrash: 4, lunge: 3.5, gills: 14, bite: 3, breath: 15, dorsal: 24, tailBeam: 11, evolve: 4 };

/**
 * His forms. Each: its name and build; how fast it goes, and how heavily
 * it steps; how high its tail goes up for a blow and how low it comes down
 * (tailLift), and how hard it lands (tailK); whether it has gills; how tall it gets, and how long it is,
 * for the view; its moves, and how it decides on them - and when it changes
 * into the next: after so many seconds in it, or sooner, for being hurt so
 * much in it.
 */
const FORMS = {
  2: {
    name: 'Second form', build: SHIN_BUILDS[2], pace: 1, step: 0.12, tail: [0.7, -0.5], tailK: 0.8, gills: true, tall: 9, wide: 30,
    moves: ['turn', 'thrash', 'lunge', 'gills', 'roar', 'evolve'], decide: decide2, next: 3, after: 24, hurt: 1500,
  },
  3: {
    name: 'Third form', build: SHIN_BUILDS[3], pace: 0.95, step: 0.2, tail: [0.5, -0.9], tailK: 1.25, gills: true, tall: 15,
    moves: ['turn', 'stomp', 'tail', 'bite', 'gills', 'roar', 'evolve'], decide, next: 4, after: 22, hurt: 2500,
  },
  4: {
    name: 'Fourth form', build: SHIN_BUILDS[4], pace: 1.05, step: 0.3, tail: [0.35, -1.25], tailK: 1.6, gills: false, tall: 24,
    moves: ['turn', 'stomp', 'tail', 'bite', 'roar', 'breath', 'dorsal', 'tailBeam', 'evolve'], decide, next: 0,
  },
};
for (const F of Object.values(FORMS)) {
  F.moveset = Object.fromEntries(F.moves.map((k) => [k, SHIN_MOVES[k]]));
  F.cool = Object.fromEntries(F.moves.map((k) => [k, COOL[k]]));
}

/** Into form n: its body (where he was, facing the way he was), its moves - and his time in it, from now. */
function setForm(man, n) {
  const gz = man.gz, F = FORMS[n];
  gz.form = n;
  gz.formT = 0;
  gz.formHp = man.health.bossHp;
  gz.moveset = F.moveset;
  gz.cooling = F.cool;
  gz.body = newBody(man, F.build);
  stepBody(man, 0);
}

/** Whether it is time he changed: long enough in this form - or hurt enough in it. */
function wantsChange(man) {
  const gz = man.gz, F = form(man);
  return !!F.next && (gz.formT > F.after || gz.formHp - man.health.bossHp > F.hurt);
}

/* ------------------------------------ the AI ---------------------------------- */

/** Every step: the move he is in the middle of, or what to do next - and his feet, either way. */
function think(man, dt) {
  const gz = man.gz, sb = man.sandbox, h = man.health;
  gz.cool = gz.cool || {};
  rest(man);
  gz.rage = Math.max(0.15, gz.rage - dt * 0.004);
  gz.formT += dt;
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
  } else if (gz.state === 'hunt' && !gz.auto0) form(man).decide(man, dt);
  walk(man, dt, gz.v, (foot) => footDown(man, foot, form(man).step));
  if (Math.abs(gz.v) > 0.2) {
    crushIn(man, dt);
    if (gz.form === 2) crawl(man);
  }
}

/** The third and fourth forms. */
function decide(man, dt) {
  const gz = man.gz, sb = man.sandbox;
  if (wantsChange(man) && ready(man, 'evolve')) { begin(man, 'evolve'); return; }
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
  if (ready(man, 'gills') && chance(dt * 0.04)) { begin(man, 'gills'); return; }
  const o = gz.target;
  if (o) { fight(man, o, dt); return; }
  rampage(man, dt);
}

/** Going after somebody. */
function fight(man, o, dt) {
  const gz = man.gz, K = kOf(man);
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
  const gz = man.gz, K = kOf(man);
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

/** Wandering, with nothing to go after and nothing to wreck. */
function wander(man) {
  const gz = man.gz, sb = man.sandbox;
  gz.aimAt = null;
  if (!gz.wander || Math.abs(gz.wander - man.pos.x) < 1) gz.wander = rand(sb.left + 8, sb.right - 8);
  const dir = sign(gz.wander - man.pos.x);
  if (dir !== man.facing) { begin(man, 'turn'); return; }
  gz.wantV = dir * form(man).pace * 0.6;
}

/** With nobody to go after: the buildings - cut down with the beam, bitten, smashed with his tail. */
function rampage(man, dt) {
  const gz = man.gz, K = kOf(man);
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
  if (!w) { wander(man); return; }
  if (!gz.buildingAt || !w.contains(gz.buildingAt.x, gz.buildingAt.y, 0.3)) gz.buildingAt = buildingPoint(man, w);
  const at = gz.buildingAt;
  gz.aimAt = at;
  if (!at) { (gz.skip = gz.skip || new Set()).add(w); gz.building = null; return; }
  const lp = L(man, at.x, at.y);
  const tried = () => { gz.buildingTries = (gz.buildingTries || 0) + 1; };
  if (lp.x < -1.5 * K) {
    gz.wantV = 0;
    if (lp.x > -11 * K && ready(man, 'tail') && chance(0.4)) { if (begin(man, 'tail', { at, w })) tried(); return; }
    if (lp.x < -6 * K && ready(man, 'tailBeam') && chance(0.3)) { if (begin(man, 'tailBeam', { at, w })) tried(); return; }
    begin(man, 'turn');
    return;
  }
  // the beam, from where he is: it reaches right across the city
  if (lp.x > 5 * K && ready(man, 'breath') && chance(dt * 0.5)) { if (begin(man, 'breath', { at, w })) tried(); return; }
  if (ready(man, 'dorsal') && chance(dt * 0.02)) { begin(man, 'dorsal'); return; }
  if (lp.x < 7.2 * K) {
    gz.wantV = 0;
    const opts = [['bite', lp.y > 9 * K / 1.5 ? 3 : 1], ['tail', 0.6], ['stomp', at.y < 3 ? 1 : 0]].filter(([n, wt]) => wt > 0 && ready(man, n));
    if (opts.length) {
      let total = 0;
      for (const e of opts) total += e[1];
      let r = rand(0, total);
      for (const [n, wt] of opts) { r -= wt; if (r <= 0) { if (begin(man, n, { at, w })) tried(); return; } }
    }
    return;
  }
  approach(man, at.x, 5 * K);
}

/* ----------------------------- the second form's AI ----------------------------- */

/** How far in front of where it stands the second form's head comes down: nearer than that is under it. */
const HEAD_NEAR = 6.5, HEAD_FAR = 11.5;

/** The second form: on up the street after whoever is nearest - its head down on them, its tail on whatever is behind. */
function decide2(man, dt) {
  const gz = man.gz;
  if (wantsChange(man) && ready(man, 'evolve')) { begin(man, 'evolve'); return; }
  if ((gz.thinkT -= dt) <= 0 || (gz.target && !alive(gz.target))) {
    gz.target = pickTarget(man);
    gz.thinkT = rand(1.8, 3);
  }
  gz.roarT -= dt;
  if (gz.roarT <= 0 && ready(man, 'roar')) { gz.roarT = rand(16, 26); begin(man, 'roar'); return; }
  if (ready(man, 'gills') && chance(dt * 0.08)) { begin(man, 'gills'); return; }
  const o = gz.target;
  if (o) { crawlAt(man, o); return; }
  rampage2(man, dt);
}

function crawlAt(man, o) {
  const gz = man.gz;
  const lf = L(man, o.pos.x, o.pos.y);
  gz.aimAt = null;
  if (lf.x < -1.5) {
    gz.wantV = 0;
    if (lf.x > -14 && ready(man, 'thrash') && chance(0.6)) { begin(man, 'thrash', { o }); return; }
    begin(man, 'turn');
    return;
  }
  if (lf.x > HEAD_NEAR && lf.x < HEAD_FAR && ready(man, 'lunge')) { begin(man, 'lunge', { o }); return; }
  // (on at them: its head over them - or the rest of it)
  approach(man, o.pos.x, rival(man, o) ? 9.5 : 8.5);
}

/** With nobody about: on through the city, bringing its head down on the buildings as it goes. */
function rampage2(man, dt) {
  const gz = man.gz, f = man.facing;
  let w = gz.building;
  if (!w || !wreckable(w) || (gz.skip && gz.skip.has(w)) || (gz.buildingT -= dt) <= 0) {
    w = gz.building = nearestBuilding(man);
    gz.buildingT = rand(12, 20);
  }
  if (!w) { wander(man); return; }
  const b = w.body.aabb();
  // (how far in front of it the near side of it is, and the far side)
  const ln = Math.min((b.minX - man.pos.x) * f, (b.maxX - man.pos.x) * f), lf = Math.max((b.minX - man.pos.x) * f, (b.maxX - man.pos.x) * f);
  gz.aimAt = { x: man.pos.x + f * clamp((HEAD_NEAR + HEAD_FAR) / 2, ln, lf), y: 2 };
  if (lf < -2) { begin(man, 'turn'); return; }
  // its head over some of it: down on it
  if (ln < HEAD_FAR - 1 && lf > HEAD_NEAR + 1) {
    gz.wantV = 0;
    if (ready(man, 'lunge')) begin(man, 'lunge', { at: { ...gz.aimAt, y: 1.5 }, w });
    return;
  }
  // all of it under it, nearer than its head comes down: back off it
  if (lf <= HEAD_NEAR + 1) { gz.wantV = -f * form(man).pace * 0.5; return; }
  approach(man, man.pos.x + f * ln, 9);
}

/* ------------------------------------ dying ------------------------------------ */

function startDeath(man) {
  const gz = man.gz, sb = man.sandbox;
  endMove(man);
  gz.state = 'dying';
  gz.t = 0;
  gz.glow = 0;
  gz.tailGlow = 0;
  gz.flare = 0;
  gz.wantV = 0;
  man.health.shield = 99;
  sb.emit('gzDying', { who: man, x: man.pos.x, y: 12 });
}

/** A last roar - and he does not fall: he stays there, head up, and freezes solid where he is. */
function updateDeath(man, dt) {
  const gz = man.gz, g = B(man), G = g.goal, sb = man.sandbox;
  gz.wantV = 0;
  walk(man, dt, 0, null);
  if (man.dead) return;
  G.rear = 0.35; G.head = 0.55; G.neck = -0.2; G.jaw = 0.8; G.split = 0; G.tailLift = gz.form === 4 ? -0.35 : 0; G.bend = 0;
  g.rate = 1.6;
  gz.gills = Math.max(0, (gz.gills || 0) - dt);
  if (gz.t < 2.4) {
    gz.shake = 0.2;
    if (!gz.cried && gz.t > 0.3) { gz.cried = true; sb.emit('gzDeathRoar', { who: man, x: man.pos.x, y: 16 }); }
  } else {
    gz.shake = 0;
    // the cold going through him, from his feet up
    gz.frost = Math.min(1, (gz.t - 2.4) / 2.6);
    if (Math.random() < dt * 14) sb.fx.steam(rand(man.box.minX, man.box.maxX), rand(1, Math.max(2, man.box.maxY)), 1);
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
  thrash: (o) => (o ? `Thrashing his tail at ${o.name}` : 'Thrashing his tail'),
  lunge: (o) => (o ? `Bringing his head down on ${o.name}` : 'Bringing his head down'),
  gills: () => 'Gills wide open, pouring red',
  roar: () => 'Roaring',
  bite: (o) => (o ? `Biting at ${o.name}` : 'Biting'),
  breath: (o, m) => `${BREATH_STAGE[m.phase] || 'Atomic breath'}${o ? `, at ${o.name}` : ''}`,
  dorsal: () => 'Firing beams from his back',
  tailBeam: (o) => (o ? `A beam from his tail, at ${o.name}` : 'A beam from his tail'),
  evolve: () => 'Changing into his next form',
};
const AT_BUILDING = { bite: 'Biting a building', tail: 'Smashing a building with his tail', lunge: 'Bringing his head down on a building', tailBeam: 'A beam from his tail, into a building' };

function doing(man) {
  const gz = man.gz;
  if (man.dead) return gz.form === 2 ? 'Frozen solid where he lay' : 'Frozen solid where he stood';
  if (gz.state === 'dying') return 'Freezing solid';
  if (gz.move) {
    const m = gz.move, o = m.o && !m.o.removed ? m.o : null;
    if (!o && m.w && !m.w.removed) {
      if (m.name === 'breath') return `${BREATH_STAGE[m.phase] || 'Atomic breath'}, at a building`;
      if (AT_BUILDING[m.name]) return AT_BUILDING[m.name];
    }
    return DOING[m.name](o, m);
  }
  if (gz.target && alive(gz.target)) return Math.abs(gz.v) > 0.2 ? `Going after ${gz.target.name}` : `Watching ${gz.target.name}`;
  if (gz.building && !gz.building.removed) return 'Heading for a building';
  return gz.form === 2 ? 'Crawling through the city' : 'Walking through the city';
}

/** The boss bar's note: what is coming, or what he is. */
function note(man) {
  const gz = man.gz, m = gz.move;
  if (m && m.name === 'evolve') return 'Evolving';
  if (gz.glow > 0.2) return m && m.name === 'dorsal' ? 'Dorsal beams' : 'Atomic breath';
  if (gz.tailGlow > 0.2) return 'Tail beam';
  if (gz.form < 4) return form(man).name;
  return gz.rage > 0.75 ? 'Enraged' : '';
}

const HIDE_LINES = {
  2: [{ text: 'Second form. Bullets and blades do next to nothing; explosions do a little', bad: true }, { text: 'It will change before long - sooner, the more it is hurt' }],
  3: [{ text: 'Third form. Bullets and blades do next to nothing; explosions do a little', bad: true }, { text: 'It will change again before long - sooner, the more it is hurt' }],
  4: [{ text: 'Bullets and blades do next to nothing; explosions do a little. Hurt him badly, and every plate on his back fires', bad: true }],
};

/** How near he is to changing: the further of how long he has been in this form, and how much he has been hurt in it. */
function bars(man) {
  const gz = man.gz, F = form(man);
  if (!F.next) return [];
  const k = clamp(Math.max(gz.formT / F.after, (gz.formHp - man.health.bossHp) / F.hurt), 0, 1);
  const now = gz.move && gz.move.name === 'evolve';
  return [{ label: 'Changing', frac: now ? 1 : k, color: '#e0702a', text: now ? 'Now' : `${Math.round(k * 100)}%` }];
}

/* ------------------------------- the abilities panel ---------------------------- */

const ABILITIES = [
  ['stomp', 'Stomp'], ['tail', 'Tail whip'], ['thrash', 'Tail thrash'], ['lunge', 'Headbutt'], ['roar', 'Roar'], ['bite', 'Bite'], ['gills', 'Gills'],
  ['breath', 'Atomic breath'], ['dorsal', 'Dorsal beams'], ['tailBeam', 'Tail beam'], ['evolve', 'Evolve'],
];
/** (The ones aimed at nobody.) */
const UNAIMED = new Set(['roar', 'gills', 'evolve']);

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
  const now = (name) => () => {
    if (on(name)) return true;
    if (gz.move) endMove(man);
    return begin(man, name);
  };
  const list = [{
    id: 'auto', label: 'Rampage', group: 'mind', on: !gz.auto0,
    pick: () => { gz.auto0 = !gz.auto0; gz.wantV = 0; return true; },
    say: () => (gz.auto0 ? `${man.name} stands where he is, and waits to be told` : `${man.name} goes on the rampage again`),
  }];
  for (const [id, label] of ABILITIES) {
    if (!gz.moveset[id] || (id === 'evolve' && !form(man).next)) continue;
    list.push({ id, label, group: 'do', on: on(id), pick: UNAIMED.has(id) ? now(id) : go(id) });
  }
  return list;
}

/* ------------------------------------ him ------------------------------------ */

export const SHIN = kaiju({
  kind: 'shin', build: (man) => form(man).build, maxHp: SHIN_HP, hide: HIDE, mends: MENDS, mendAfter: MEND_AFTER,
  skin: shinSkin, makeMarks: makeCracks, room: 3.4 * SHIN_BUILDS[4].K, power: 18,
  think, doing, abilities, startDeath, updateDeath, onHurt, note, bars,
  color: '#8a2be2', style: 'kaiju shin',
  seeLine: (man) => (man.gz.form === 2 ? 'seeShin2' : man.gz.form === 3 ? 'seeShin3' : 'seeShin'),
  gz: () => ({ form: 2, formT: 0, formHp: SHIN_HP, moveset: FORMS[2].moveset, cooling: FORMS[2].cool, tailGlow: 0, flare: 0, gills: 0, frost: 0, roarT: rand(14, 22) }),
  hideLines: (man) => HIDE_LINES[man.gz.form] || HIDE_LINES[4],
  tally: (gz) => ({ text: `Killed: ${gz.kills} · Buildings wrecked: ${gz.wrecked}`, bad: gz.kills > 0 }),
});

/**
 * Shin Godzilla, at x: out of the ground's shaking, with a roar - in his
 * second form (or form n, for a test).
 */
export function spawnShin(sb, x, n = 2) {
  const count = sb.people.filter((p) => p.species === SHIN).length;
  const man = sb.spawnStickman(x, 0, {
    name: count ? `Shin Godzilla ${count + 1}` : 'Shin Godzilla', species: SHIN, scale: 8, airborne: true, hair: 'none', voice: 0.15, strength: 10,
    traits: { bravery: 1, aggression: 1, temper: 1, empathy: 0, sociability: 0, curiosity: 0.1, toughness: 1, skill: 0.6 },
    look: { key: 'shin' },
  });
  if (!man) return null;
  man.facing = shinFacingAt(man.pos.x);
  setForm(man, FORMS[n] ? n : 2);
  const F = form(man);
  sb.emit('gzSpawn', { who: man, x: man.pos.x, y: 0, tall: F.tall, wide: F.wide });
  return man;
}

export const isShin = (p) => !!(p && p.species === SHIN);
/** Which form he is in: 2, 3 or 4. */
export const shinForm = (p) => (isShin(p) ? p.gz.form : 0);
