/* =============================================================================
   THINGS IN THE DARK - the Listener.

   Tall, thin and the grey of ash, stooped, with no eyes at all - a smooth
   blank face - and two great fans of ears that turn after every sound. It
   cannot see a thing. It hears everything: footsteps (a run from a long way
   off, a walk from a good way, somebody creeping along crouched only right
   beside it), voices (a whisper only at arm's length), gunshots from
   anywhere, a crash, a fall, a door. It clicks its tongue as it goes, and
   listens to what comes back.

   It walks slowly, stopping to listen. Something heard nearby, it goes for,
   fast; something far off, it goes to have a look. Whoever it gets its
   hands on, it lifts up to its face and crushes. Somebody keeping perfectly
   still and quiet can have it walk right past them - unless they are so
   frightened it can hear them breathe. It can hear them breathing in a
   wardrobe too, right up against the doors: and then it tears the doors
   off.

   It can be killed - it takes a great deal of it - and every shot fired at
   it tells it exactly where the shooter is.
   ========================================================================== */
import { MOD, armTo, lerpPt } from './common.js';
import { listenerSkin } from './look.js';
import { clamp, clamp01, rand, chance, sign, smooth } from '../../core/util.js';

// how much further off it hears anything than anybody else would
const KEEN = 1.45;
// how far off it hears each kind of thing, in metres (before KEEN)
const HEARS = { speech: 10, shot: 60, explode: 60, hit: 9, thud: 9, land: 5, clatter: 7, collide: 8, glassShatter: 16, break: 8, death: 8, vomit: 7, retch: 5, wardrobeIn: 4, wardrobeOut: 4, reload: 5, rack: 6, crush: 6, slabBreak: 8 };

/** The Listener itself (any body of the mod's that is blind). */
export const isListener = (p) => !!(p && p.species && p.species.mod === MOD && p.species.blind && p.ls);

function newState() {
  return {
    phase: 'listen', t: 0, heard: null, acted: -1, target: null, victim: null, spot: null,
    goal: null, walkFor: rand(3, 6), listenFor: rand(2, 3.5),
    ear: 0, earGoal: 0, tilt: 0, clickT: rand(0.4, 1.2), clicks: [], mouth: 0, reachA: null, reachB: null, from: null,
  };
}

function setPhase(man, phase) {
  const L = man.ls;
  L.phase = phase;
  L.t = 0;
  L.done = false;
}

const alive = (p) => !!p && !p.removed && p.alive && !p.dead;
/** Whether somebody counts as prey to it: anybody living who is not one of the mod's own. */
const prey = (man, p) => alive(p) && p !== man && !(p.species && (p.species.mod === MOD || p.species.giant));

/** Something heard, at x: from somebody (who), how strongly (k), how (steps, a voice, a shot...). */
export function hear(man, x, who, k, how) {
  const L = man.ls, now = man.sandbox.time;
  if (!L || man.dead) return;
  // (a louder thing just now drowns out a quieter one)
  if (L.heard && now - L.heard.t < 0.5 && L.heard.k > k + 0.05) return;
  L.heard = { x, who: who && prey(man, who) ? who : null, k, t: now, how };
  L.earGoal = sign(x - man.pos.x) === man.facing ? 1 : -1;
}

/** Everything it can hear going on, every so often: footsteps, breathing, somebody bumping into it. */
function listenRound(man, dt) {
  const sb = man.sandbox, L = man.ls;
  for (const p of sb.people) {
    if (!prey(man, p)) continue;
    const d = Math.abs(p.pos.x - man.pos.x);
    if (p.hiddenIn) continue;
    const n = p.footNoise() * KEEN;
    if (n > 0 && d < n) hear(man, p.pos.x, p, 0.4 + 0.6 * (1 - d / n), 'steps');
    // right up against it, and frightened enough that it can hear them breathe
    const f = p.brain ? p.brain.emo.fear : 0.4;
    if (d < 1.35 && f > 0.5 && chance(dt * (f - 0.4) * 0.9)) hear(man, p.pos.x, p, 0.95, 'breath');
    // walked into
    if (d < 0.5 * man.scale && Math.abs(p.wj.chest.y - man.wj.chest.y) < 1.2 && L.phase !== 'lift' && L.phase !== 'crush') hear(man, p.pos.x, p, 1, 'touch');
  }
  // a wardrobe it is right up against: somebody in there breathing too hard
  for (const it of sb.items) {
    if (it.removed || it.mod !== MOD || !it.inside || !it.inside.length || it.broken) continue;
    if (Math.abs(it.pos.x - man.pos.x) > 1.5) continue;
    for (const p of it.inside) {
      const f = p.brain ? p.brain.emo.fear : 0.5, b = p.brain ? p.brain.traits.bravery : 0.5;
      if (chance(dt * Math.max(0, f - 0.3) * 0.6 * (1.25 - b))) {
        L.spot = it;
        hear(man, it.pos.x, p, 1, 'inside');
        sb.emit('lsHearsInside', { who: p, by: man, what: it, x: it.pos.x, y: 1.2, mod: MOD });
        return;
      }
    }
  }
}

/** The things everybody hears happen (the sandbox's events) - which it hears from a good deal further off. */
export function setupListening(sb) {
  const on = (type) => sb.on(type, (e) => {
    const ls = sb.people.filter((p) => isListener(p) && !p.dead);
    if (!ls.length) return;
    const src = e.who || e.what || e.by;
    const x = e.x ?? (src && src.pos ? src.pos.x : null);
    if (x === null || x === undefined) return;
    for (const man of ls) {
      if (src === man) continue;
      let r = (HEARS[type] || 6) * KEEN;
      if (type === 'speech') r = e.whisper ? 1.6 * KEEN : e.loud ? 17 * KEEN : r;
      // (whoever is inside something is muffled)
      if (e.who && e.who.hiddenIn) r *= 0.35;
      const d = Math.abs(x - man.pos.x);
      if (d > r) continue;
      // who made it, where that is clear (somebody talking, somebody shooting, somebody falling)
      const who = type === 'shot' || type === 'speech' || type === 'land' || type === 'vomit' || type === 'retch' || type === 'reload' || type === 'rack' ? e.who : type === 'hit' ? (e.by || e.who) : null;
      hear(man, x, who, type === 'shot' || type === 'explode' ? 1 : 0.5 + 0.5 * (1 - d / r), type);
    }
  });
  for (const type of Object.keys(HEARS)) on(type);
}

/* --------------------------------------- mind --------------------------------------- */

/** Where its hand holds somebody: a little way out past the fingers. */
function gripAt(man) {
  const j = man.wj, e = j.elbowA, h = j.handA;
  const d = Math.hypot(h.x - e.x, h.y - e.y) || 1, k = 0.12 * man.scale;
  return { x: h.x + ((h.x - e.x) / d) * k, y: h.y + ((h.y - e.y) / d) * k };
}

const reachFrom = (man) => 0.75 * man.scale + 0.15;

function seize(man, v) {
  const sb = man.sandbox, L = man.ls;
  if (sb.hand && sb.hand.holding === v) sb.hand.release();
  if (v.weapon) v.dropWeapon(0.4);
  if (v.hiddenIn && v.hiddenIn.letOut) v.hiddenIn.letOut(v);
  const at = { x: v.wj.chest.x, y: v.wj.chest.y };
  v.grab(at.x, at.y, man);
  L.victim = v;
  L.from = at;
  setPhase(man, 'lift');
  sb.emit('lsGrab', { who: v, by: man, x: at.x, y: at.y, loud: true, mod: MOD });
}

function dropVictim(man) {
  const L = man.ls, v = L.victim;
  if (v && v.heldBy === man && v.state === 'held') v.release();
  L.victim = null;
  L.reachA = L.reachB = null;
}

function mind(brain, dt) {
  const man = brain.man, L = man.ls, sb = man.sandbox;
  if (!L || man.dead) return true;
  L.t += dt;
  // knocked off its feet: everything let go, and up again
  if (man.rag || !['stand', 'air', 'climb'].includes(man.state)) {
    if (L.phase !== 'down') { dropVictim(man); setPhase(man, 'down'); }
    return true;
  }
  if (L.phase === 'down') setPhase(man, 'listen');
  // whoever hurts it, it hears: exactly where they are
  const lh = man.lastHit;
  if (lh && lh.by && lh.by !== man && sb.time - lh.t < 0.2 && prey(man, lh.by)) hear(man, lh.by.pos.x, lh.by, 1, 'hurt');
  if ((L.listenT = (L.listenT || 0) - dt) <= 0) { L.listenT = 0.1; listenRound(man, 0.1); }
  // the clicking: now and then as it walks, all the time as it listens
  if ((L.clickT -= dt) <= 0) {
    L.clickT = L.phase === 'listen' || L.phase === 'search' ? rand(0.5, 0.9) : rand(1.2, 2.4);
    if (L.phase !== 'lift' && L.phase !== 'crush') { L.clicks.push({ t: 0 }); sb.emit('lsClick', { who: man, x: man.pos.x, y: man.wj.head.y, mod: MOD }); }
  }
  const h = L.heard, fresh = h && h.t > L.acted;
  const busy = L.phase === 'grab' || L.phase === 'lift' || L.phase === 'crush' || L.phase === 'tear';
  if (fresh && !busy) {
    L.acted = h.t;
    if (h.how === 'touch' && h.who) {
      // walked into somebody: it has them
      L.target = h.who;
      L.goal = h.x;
      setPhase(man, 'grab');
      man.faceTo(h.x);
    } else if (L.phase === 'alert') {
      // (still listening to the same thing: where it is now, and who)
      L.goal = h.x;
      if (h.who) L.target = h.who;
      L.loud = Math.max(L.loud || 0, h.k);
    } else if (L.phase === 'charge') {
      if (h.who && h.who !== L.target && h.k > 0.85) { L.target = h.who; L.goal = h.x; L.loud = h.k; setPhase(man, 'alert'); }
      else if (h.who === L.target || !h.who) L.goal = h.x;
    } else if (L.phase === 'stalk' && (!h.who || h.who === L.target) && h.k < 0.55) {
      L.goal = h.x;
    } else {
      setPhase(man, 'alert');
      L.target = h.who;
      L.goal = h.x;
      L.loud = h.k;
    }
  }
  const S = man.scale;
  switch (L.phase) {
    case 'listen': case 'search': {
      man.stop();
      // head over on one side, an ear turned up
      L.tilt = Math.sin(L.t * 1.3) * 0.6;
      if (L.t > (L.phase === 'search' ? 3.2 : L.listenFor)) {
        L.listenFor = rand(2, 3.6);
        L.goal = clamp(man.pos.x + rand(-7, 7), sb.left + 1, sb.right - 1);
        L.walkFor = rand(3, 6);
        setPhase(man, 'prowl');
      }
      break;
    }
    case 'prowl': {
      L.tilt *= 0.95;
      if (L.goal === null || Math.abs(L.goal - man.pos.x) < 0.3 || L.t > L.walkFor) { setPhase(man, 'listen'); break; }
      man.goTo(L.goal, 'walk');
      break;
    }
    case 'alert': {
      // stock still, head snapped round to it
      man.stop();
      if (L.goal !== null) man.faceTo(L.goal);
      L.tilt = 0;
      if (L.t > 0.32) {
        const d = Math.abs((L.goal ?? man.pos.x) - man.pos.x);
        if (L.spot && !L.spot.removed && !L.spot.broken && Math.abs(L.spot.pos.x - man.pos.x) < 2) setPhase(man, 'tear');
        else if (L.target && (L.loud > 0.55 || d < 7)) { setPhase(man, 'charge'); sb.emit('lsCharge', { who: L.target, by: man, x: man.pos.x, y: man.wj.head.y, loud: true, mod: MOD }); }
        else setPhase(man, 'stalk');
      }
      break;
    }
    case 'stalk': {
      if (L.goal === null || Math.abs(L.goal - man.pos.x) < 0.4) { setPhase(man, 'search'); break; }
      man.goTo(L.goal, 'walk');
      if (L.t > 10) setPhase(man, 'search');
      break;
    }
    case 'charge': {
      const o = L.target;
      if (!o || !alive(o)) { L.target = null; setPhase(man, 'search'); break; }
      // where they were last heard - and if they are still making a noise, where they are now
      const recent = L.heard && L.heard.who === o && sb.time - L.heard.t < 1.2;
      const x = recent ? o.pos.x : L.goal ?? o.pos.x;
      const d = Math.abs(o.pos.x - man.pos.x);
      if (d < reachFrom(man) && !o.hiddenIn && Math.abs(o.pos.y - man.pos.y) < 1.4) { setPhase(man, 'grab'); man.faceTo(o.pos.x); break; }
      if (o.hiddenIn && Math.abs(o.hiddenIn.pos.x - man.pos.x) < 1.2) { L.spot = o.hiddenIn; setPhase(man, 'tear'); break; }
      // got there, and nothing: listen
      if (!recent && Math.abs(x - man.pos.x) < 0.4) { L.target = null; setPhase(man, 'search'); break; }
      man.goTo(x, 'run', { face: x });
      if (L.t > 9) setPhase(man, 'search');
      break;
    }
    case 'tear': {
      const w = L.spot;
      man.stop();
      if (!w || w.removed || w.broken) { L.spot = null; setPhase(man, 'search'); break; }
      man.faceTo(w.pos.x);
      // both hands at the doors - and they come off
      L.reachA = { x: w.pos.x - man.facing * 0.1, y: 1.3 * S, k: smooth(L.t / 0.4) };
      L.reachB = { x: w.pos.x - man.facing * 0.25, y: 1.0 * S, k: smooth(L.t / 0.4) };
      if (L.t > 0.55 && !L.done) {
        L.done = true;
        const out = w.tearOpen(man) || [];
        L.spot = null;
        const v = out.find((p) => prey(man, p));
        if (v) { L.target = v; setPhase(man, 'grab'); man.faceTo(v.pos.x); }
        else { L.reachA = L.reachB = null; setPhase(man, 'search'); }
      }
      break;
    }
    case 'grab': {
      const o = L.target;
      man.stop();
      if (!o || !alive(o) || o.hiddenIn) { L.reachA = L.reachB = null; setPhase(man, 'search'); break; }
      const c = o.wj.chest;
      L.reachA = { x: c.x, y: c.y, k: smooth(L.t / 0.22) };
      L.reachB = { x: c.x - man.facing * 0.12, y: c.y - 0.1, k: smooth(L.t / 0.22) };
      if (L.t > 0.22) {
        const g = gripAt(man);
        if (Math.hypot(g.x - c.x, g.y - c.y) < 0.55 * S && o.state !== 'held') seize(man, o);
        else { L.reachA = L.reachB = null; setPhase(man, 'charge'); }
      }
      break;
    }
    case 'lift': {
      man.stop();
      const v = L.victim;
      if (!v || v.removed || v.heldBy !== man) { dropVictim(man); setPhase(man, 'search'); break; }
      // up to its face, to listen to them
      const j = man.wj, at = { x: j.head.x + man.facing * 0.55 * S, y: j.head.y - 0.15 * S };
      L.reachA = { x: lerpPt(L.from, at, smooth(L.t / 0.6)).x, y: lerpPt(L.from, at, smooth(L.t / 0.6)).y, k: 1 };
      L.reachB = { x: L.reachA.x - man.facing * 0.1, y: L.reachA.y - 0.15, k: smooth(L.t / 0.3) };
      L.mouth = Math.min(1, L.t / 0.8);
      L.tilt = 0.4;
      if (L.t > 1.0) { setPhase(man, 'crush'); sb.emit('lsCrush', { who: v, by: man, x: at.x, y: at.y, loud: true, mod: MOD }); }
      break;
    }
    case 'crush': {
      man.stop();
      const v = L.victim;
      if (!v || v.removed) { dropVictim(man); setPhase(man, 'search'); break; }
      if (!L.done && L.t > 0.18) {
        L.done = true;
        const c = v.wj.chest;
        for (let i = 0; i < 3; i++) v.addWound({ bone: i ? 1 : 0, t: rand(0.3, 0.7), r: rand(0.6, 1), gash: rand(0.15, 0.3) });
        if (v.health.breakBone) v.health.breakBone('ribs', 80);
        sb.fx.blood(c.x, c.y, man.facing * 1.5, 1.5, 26, 1.2, v);
        if (!v.dead) v.die('crushed by the Listener', man, man.facing, 0.5, { x: c.x, y: c.y });
        sb.emit('lsKill', { who: v, by: man, x: c.x, y: c.y, loud: true, mod: MOD });
      }
      if (L.t > 0.9) { dropVictim(man); L.mouth = 0; L.target = null; setPhase(man, 'listen'); }
      break;
    }
    default: setPhase(man, 'listen');
  }
  return true;
}

/* -------------------------------------- the body -------------------------------------- */

function update(man, dt) {
  const L = man.ls;
  if (!L) return;
  L.ear += (L.earGoal - L.ear) * Math.min(1, dt * 6);
  L.earGoal *= Math.exp(-dt * 0.6);
  if (!['lift', 'crush'].includes(L.phase)) L.mouth = Math.max(0, L.mouth - dt * 2);
  for (const c of L.clicks) c.t += dt;
  L.clicks = L.clicks.filter((c) => c.t < 0.6);
}

function pose(man) {
  const L = man.ls;
  if (!L || man.dead || man.rag) return;
  if (L.reachA) armTo(man, 'A', L.reachA, L.reachA.k);
  if (L.reachB) armTo(man, 'B', L.reachB, L.reachB.k);
  else if (L.phase === 'listen' || L.phase === 'search') {
    // a hand up beside its head, the long fingers spread, as if to catch something
    const j = man.wj, S = man.scale;
    armTo(man, 'B', { x: j.head.x - man.facing * 0.05 * S, y: j.head.y - 0.12 * S }, 0.55 + Math.sin(man.sandbox.time * 0.9) * 0.1);
  }
  const v = L.victim;
  if (v && v.heldBy === man && v.state === 'held') { const g = gripAt(man); v.holdAt(g.x, g.y); }
}

const PHASE_SAYS = {
  listen: 'Listening', search: 'Listening for whoever it heard', prowl: 'Prowling', alert: 'Heard something',
  stalk: 'Going to where it heard something', charge: (L) => (L.target ? `Going for ${L.target.name}` : 'Going for something it heard'),
  tear: 'Tearing a wardrobe open', grab: (L) => `Reaching for ${L.target ? L.target.name : 'someone'}`,
  lift: (L) => `Holding ${L.victim ? L.victim.name : 'someone'} up to its face`, crush: (L) => `Crushing ${L.victim ? L.victim.name : 'someone'}`,
  down: 'Getting up',
};

export const LISTENER = {
  mod: MOD,
  kind: 'listener',
  label: 'The Listener',
  monster: true,
  // (blind: everybody who sees it knows to keep quiet - brain.js)
  blind: true,
  tireless: true,
  sturdy: true,
  breathes: false,
  mute: true,
  noPickup: true,
  noPowers: true,
  noCrouch: true,
  skin: listenerSkin,
  power: 3.2,
  speed: 1.08,
  fall: 0.2,
  init(man) {
    man.ls = newState();
    man.scale = 1.42;
  },
  update,
  mind,
  pose,
  procedural(man, p) {
    if (man.state !== 'stand' || !man.ls) return;
    const L = man.ls, t = man.sandbox.time + man.seed;
    // stooped, the head pushed out ahead of it, turning after every sound
    p.t += 0.32 + Math.sin(t * 0.7) * 0.03;
    p.h += 0.1 + L.tilt * 0.35 + Math.sin(t * 2.3) * 0.02;
  },
  doing(man) {
    const L = man.ls;
    if (!L) return null;
    const s = PHASE_SAYS[L.phase];
    return typeof s === 'function' ? s(L) : s || 'Listening';
  },
  hunting(man) {
    const L = man.ls;
    return L && !man.dead && ['charge', 'grab', 'lift', 'crush', 'tear'].includes(L.phase) ? L.target : null;
  },
  hostileTo(man, other) { return !man.dead && !!other && other !== man && !(other.species && other.species.mod === MOD); },
  metBy(me, brain, r) {
    const T = brain.traits;
    r.fear = Math.max(r.fear, 0.8 * (1.25 - T.bravery));
    r.violent = Math.max(r.violent, 2);
    r.like = -1;
    brain.emo.bump('fear', 0.5 * (1.2 - T.bravery));
    brain.emo.bump('surprise', 0.6);
    brain.speak('seeListener', { other: me.name }, 0.9, me);
  },
  // a hide like old leather: it takes a great deal to put it down
  armor(man, h, part) { return part === 'head' ? 0.4 : 0.28; },
  fightScale() { return 0.4; },
  strikes() { return []; },
  canPickUp() { return false; },
  zap() { return false; },
  describeArms() { return 'Long grey fingers'; },
  bossbar(man) {
    if (man.dead) return null;
    const h = man.health;
    return { name: 'THE LISTENER', frac: clamp01(h.overall), color: '#a7a39a', note: LISTENER.doing(man) || '', text: `${Math.round(h.overall * 100)}%` };
  },
};

/** It comes into the world where it is put, and stands there, listening. */
export function spawnListener(sb, x) {
  const man = sb.spawnStickman(x, null, {
    name: 'The Listener',
    species: LISTENER,
    traits: { bravery: 1, aggression: 1, temper: 0.5, empathy: 0, sociability: 0, curiosity: 0.6, toughness: 1, skill: 0.6 },
  });
  return man;
}
