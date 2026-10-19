/* =============================================================================
   SHALLOW - what it is to the game: a species for each body it has, with a
   hook into each part of a stickman's life it does its own way (see
   game/stickman.js and game/brain.js), and the mind of the thing itself.

   It is one thing in a succession of bodies. Everything it is lives in
   man.sh, which goes with it from body to body:

     form    'disguise' wearing somebody, 'creature' out, 'gone' dead
     phase   what it is doing (below), and t, how long it has been at it
     marked  everyone who has made it angry, to be dealt with in turn
     base    the height of the skin it wore; tall, the height it grows to
     ...and how its body looks just now: claws, mouth, blood, wisps

   In disguise (DISGUISE) it is a person in every way the game can tell -
   their name, height, hair, voice, uniform, friends and memories - with an
   ordinary person's brain. Until somebody makes it angry (hits it, insults
   it, points a gun at it; or anger goes up any other way, the inspector's
   included): then it cracks, and tears out of the skin, taller.

   Out (CREATURE), it thinks for itself (the mind hook), one phase at a time:

     rise      growing up out of the empty skin
     roar      a look round, the mouth open
     hunt      after whoever made it angry, the nearest first
     lunge     the claws out for them: in reach, it has them by the neck
     lift      held up in front of its face
     rip       the other hand on their hips - and it pulls them in half
     eat       three bites: the head, the body, the legs
     after     a moment, and the next one
     seek      nobody left that it is angry with: it wants a skin. The
               nearest person will do
     turn      held up with their back to it
     cut       the claws of the other hand down the back, neck to hips
     bones     a hand in, and the skeleton out, in one piece
     organs    heart, lungs, stomach, guts, over its shoulder
     drop      the empty skin let fall
     enter     smaller and smaller, and in through the split - and it gets
               up as them

   Two more bodies are the mod's, for the people it is done with: HALF (the
   top half, torn off at the waist) and HEADLESS (bitten), and HOLLOW for
   somebody being emptied out.
   ========================================================================== */
import { LIMITS } from '../../game/sandbox.js';
import { BONE_PART } from '../../game/health.js';
import { clamp, clamp01, lerp, rand, chance, sign, smooth, easeOut, moveToward, pick } from '../../core/util.js';
import { MOD, ICHOR, GROWTH, isShallow, gripAt, mouthAt, reachArm, lerpPt } from './common.js';
import { creatureSkin, disguiseSkin, halfSkin, headlessSkin, drawEmptySkin, makeCracks, tearPoint } from './look.js';
import { Husk, Legs, Skeleton, Organ, ORGAN_ORDER, boneless } from './remains.js';
import { SHALLOW_LINES } from './lines.js';

/* ---------------------------------- helpers ---------------------------------- */

const alive = (o) => !!o && !o.removed && !o.dead;
/** Somebody it can get its hands on: alive, not floating out of reach, not in somebody else's hand. */
const seizable = (o) => alive(o) && !o.steadfast && o.state !== 'held' && o.state !== 'climb' && !isShallow(o);
/** Where it takes hold of somebody: the neck, standing; the chest, lying down. */
const grabPoint = (o) => (o.lying || o.rag ? o.wj.chest : o.wj.neck);

/** Into the world, making room among its own things if the world is full. */
export function addThing(sb, item) {
  if (sb.items.length >= LIMITS.items) {
    const old = sb.items.find((i) => i.mod === MOD && !i.heldBy && !i.inHand);
    if (old) sb.remove(old, { quiet: true });
  }
  return sb.addItem(item);
}

function uniqueName(sb, base) {
  const taken = new Set(sb.people.map((p) => p.name));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`;
}

/** Says one of its own lines, when it is not still saying the last one. */
function sayLine(man, kind, vars = {}, loud = false, p = 1) {
  const sh = man.sh;
  if (!sh || (sh.sayT > 0 && !loud) || !chance(p)) return false;
  const list = SHALLOW_LINES[kind];
  if (!list) return false;
  let text = pick(list);
  for (const [k, v] of Object.entries({ ...vars, me: man.name })) text = text.split('{' + k + '}').join(v);
  if (!man.say(text, { loud })) return false;
  sh.sayT = 2.2;
  return true;
}

/** A point down somebody's back: k 0 at the neck to 1 at the hips, a little out from the spine on the back side. */
function backPoint(v, k) {
  const j = v.wj, f = v.rag ? v.rag.facing : v.facing, s = v.scale;
  const p = k < 0.5 ? lerpPt(j.neck, j.chest, k * 2) : lerpPt(j.chest, j.hip, k * 2 - 1);
  const dx = j.neck.x - j.hip.x, dy = j.neck.y - j.hip.y, d = Math.hypot(dx, dy) || 1;
  // the back: to the left of the spine, as they face
  return { x: p.x - (dy / d) * f * 0.07 * s, y: p.y + (dx / d) * f * 0.07 * s };
}

export function newState(base) {
  return {
    form: 'disguise', phase: 'calm', t: 0,
    base, tall: clamp(base * GROWTH, 1.45, 1.95),
    marked: new Set(), target: null, victim: null, skin: null, held: null, eating: null,
    purpose: 'kill', mode: null, next: null, from: null, tried: false, torn: false, bites: 0, scoops: 0, cutStarted: false, slumped: false,
    kills: 0, skins: 0, worn: [],
    // how it looks just now
    crack: 0, cracks: null, glitch: 0, claws: 0, mouth: 0, mouthGoal: 0, curlA: 0, curlB: 0, pin: false, blood: 0, fade: 1, wisps: [], bulge: null, pour: null,
    reachA: null, reachB: null,
    // when it next does each thing
    sayT: 0, missT: 0, think: 0, wispT: 0, twitchT: rand(16, 34), whisperT: rand(25, 55), knowT: 1, emergeT: 0.7, dyingT: 0,
  };
}

/* ------------------------------ remembering it ------------------------------ */

/** Whether somebody knows that this one is not who it looks like: they saw it go in, or were told. */
export function knows(brain, man) {
  const r = brain.rels.get(man);
  if (r && r.shallow) return true;
  return brain.memories.some((m) => m.kind === 'sawShallowTake' && m.about === man);
}

/* ================================ the disguise ================================ */

function startCrack(man) {
  const sh = man.sh, sb = man.sandbox, b = man.brain;
  sh.phase = 'crack';
  sh.t = 0;
  sh.crack = 0;
  sh.cracks = makeCracks();
  if (b) {
    b.clearBehaviour();
    b.speak('shallowSplitting', {}, 1, null, true);
  }
  man.stop();
  man.posture = null;
  man.dropCarried();
  if (man.state === 'stand' && !man.rag) man.anim.act('shallowSplit', { fadeIn: 0.05, fadeOut: 0.1 });
  sb.emit('shallowCrack', { who: man, x: man.pos.x, y: man.wj.chest.y });
}

/** Whether anything has made it angry enough - and who did. */
function angered(man) {
  const b = man.brain, sh = man.sh, now = man.sandbox.time;
  let hot = false;
  for (const [o, r] of b.rels) {
    if (o === man || o.removed || o.dead || isShallow(o)) continue;
    const hit = r.hurtMe > 0 && now - r.hurtT < 6;
    if (r.anger > 0.34 || r.enemy || (hit && r.hurtMe > 9)) {
      sh.marked.add(o);
      hot = true;
    }
  }
  if (b.emo.anger > 0.45) hot = true;
  // hurt badly, by anybody at all
  if (man.health.overall < 0.55) hot = true;
  return hot;
}

/** What gives it away, to anybody watching closely: a twitch, the face slipping for a blink, a mutter. */
function tells(man, dt) {
  const sh = man.sh, b = man.brain, sb = man.sandbox;
  const busy = b.fighting || (b.behaviour && (b.behaviour.kind === 'flee' || b.behaviour.kind === 'fight'));
  if ((sh.twitchT -= dt) <= 0 && man.ready && !busy) {
    sh.twitchT = rand(18, 42);
    man.anim.act('shallowTwitch', { fadeIn: 0.02, fadeOut: 0.12 });
    sh.glitch = 1;
    sb.emit('shallowTwitch', { who: man, x: man.pos.x, y: man.wj.head.y });
  }
  if ((sh.whisperT -= dt) <= 0) {
    sh.whisperT = rand(30, 70);
    if (!busy) b.speak('shallowWhisper', {}, 0.8);
  }
}

/** Anybody who knows what is wearing this face, and can see it: they keep away, and say so. */
function knowers(man, dt) {
  const sh = man.sh, sb = man.sandbox;
  if ((sh.knowT -= dt) > 0) return;
  sh.knowT = 1.3;
  for (const p of sb.people) {
    if (p === man || !p.brain || !alive(p) || isShallow(p) || !p.brain.sees(man) || !knows(p.brain, man)) continue;
    const B = p.brain, T = B.traits, r = B.rel(man);
    r.fear = Math.max(r.fear, 0.65 * (1.25 - T.bravery));
    r.violent = Math.max(r.violent, 2.5);
    r.like = Math.min(r.like, -0.7);
    // the brave ones want it gone
    if (T.bravery > 0.62 && T.aggression > 0.45) r.anger = Math.max(r.anger, 0.55);
    if (chance(0.3)) B.speak('knowsShallow', { other: man.name }, 1, man, true);
  }
}

function disguiseUpdate(man, dt) {
  const sh = man.sh, sb = man.sandbox;
  if (!sh || sh.form !== 'disguise') return;
  if (man.dead) {
    // shot, stabbed, beaten to death: that was only ever the skin
    if (sh.phase !== 'dead') { sh.phase = 'dead'; sh.t = 0; }
    sh.t += dt;
    if (sh.t > 0.15 && chance(dt * 8)) sb.fx.drip(man.wj.chest.x, man.wj.chest.y, null, ICHOR);
    if ((sh.emergeT -= dt) <= 0) emerge(man);
    return;
  }
  sh.glitch = Math.max(0, sh.glitch - dt * 4);
  if (sh.phase === 'crack') {
    sh.t += dt;
    sh.crack = clamp01(sh.t / 1.15);
    if (chance(dt * 14)) {
      const p = lerpPt(man.wj.hip, man.wj.neck, Math.random());
      sb.fx.drip(p.x, p.y, null, ICHOR);
    }
    if (man.state === 'stand') man.stop();
    if (sh.t >= 1.32) emerge(man);
    return;
  }
  const b = man.brain;
  if (!b) return;
  tells(man, dt);
  knowers(man, dt);
  if (!man.conscious || man.state === 'held' || man.tased) return;
  if (angered(man)) startCrack(man);
}

/** Makes it angry, from the inspector: whoever is nearest is the one who did it. */
function provoke(man) {
  const sh = man.sh;
  if (!sh || sh.form !== 'disguise' || sh.phase === 'crack' || !man.conscious) return false;
  let best = null, bd = 12;
  for (const o of man.sandbox.people) {
    if (o === man || !alive(o) || isShallow(o)) continue;
    const d = Math.abs(o.pos.x - man.pos.x);
    if (d < bd) { bd = d; best = o; }
  }
  if (best) sh.marked.add(best);
  startCrack(man);
  return true;
}

/**
 * Out of the skin. The skin stays where it was, empty and split, and what was
 * in it stands up out of it, growing.
 */
export function emerge(man) {
  const sh = man.sh, sb = man.sandbox;
  if (!sh || sh.form !== 'disguise' || man.removed) return null;
  const x = man.rag ? man.wj.hip.x : man.pos.x;
  const f = man.rag ? man.rag.facing : man.facing;
  const y = man.wj.chest.y;
  // whoever killed the skin is first
  const killer = man.lastHit && man.lastHit.by && alive(man.lastHit.by) && man.sandbox.time - man.lastHit.t < 10 ? man.lastHit.by : null;
  if (killer && !isShallow(killer)) sh.marked.add(killer);
  for (const o of [...sh.marked]) if (!alive(o)) sh.marked.delete(o);
  const husk = new Husk(sb, man, { black: true, open: 1, deflate: 0.1 });
  addThing(sb, husk);
  const wore = man.name;
  sh.worn.push(wore);
  sb.remove(man, { quiet: true });
  sh.form = 'creature';
  sh.phase = 'rise';
  sh.t = 0;
  sh.base = man.scale;
  sh.tall = clamp(man.scale * GROWTH, 1.45, 1.95);
  sh.crack = 0;
  sh.claws = 0;
  sh.fade = 1;
  sh.wore = wore;
  const c = sb.spawnStickman(x, null, {
    name: uniqueName(sb, 'Shallow'), species: CREATURE, scale: man.scale * 0.92, voice: 0.42, hair: 'none', lines: SHALLOW_LINES, airborne: true, sh,
    traits: { bravery: 1, aggression: 1, temper: 1, empathy: 0, sociability: 0, curiosity: 0.3, toughness: 1, skill: 0.9 },
  });
  if (!c) return null;
  c.facing = f;
  c.anim.act('shallowRise', { fadeIn: 0.01, fadeOut: 0.2 });
  sb.fx.blood(x, y, 0, 2, 26, 1.6, null, ICHOR);
  sb.emit('becomes', { from: man, to: c });
  sb.emit('shallowEmerge', { who: c, from: man, name: wore, x, y });
  return c;
}

/* ============================== the thing itself ============================== */

/** Whoever it is angry with that it can get at, the nearest first. */
function nextTarget(man) {
  const sh = man.sh;
  let best = null, bd = Infinity;
  for (const o of [...sh.marked]) {
    if (!alive(o) || isShallow(o)) { sh.marked.delete(o); continue; }
    if (o.steadfast) continue;
    const d = Math.abs(o.pos.x - man.pos.x) + Math.max(0, o.pos.y - man.pos.y - 1) * 3;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

/** The nearest person whose skin it could wear. */
function nearestSkin(man) {
  let best = null, bd = Infinity;
  for (const o of man.sandbox.people) {
    if (o === man || !alive(o) || !o.human || isShallow(o) || o.steadfast || o.removed) continue;
    const d = Math.abs(o.pos.x - man.pos.x) + Math.max(0, o.pos.y - man.pos.y - 1) * 3;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

function setPhase(man, phase) {
  const sh = man.sh;
  sh.phase = phase;
  sh.t = 0;
  sh.tried = false;
}

/** Whether it still has hold of who it took hold of. */
function holding(man) {
  const v = man.sh.victim;
  return !!v && !v.removed && v.heldBy === man && v.state === 'held';
}

/**
 * Somebody it had started emptying out and never finished: with their bones
 * out they are a skin and nothing else; before that, they have a long cut
 * down their back and a chance.
 */
function abandon(v, by) {
  if (!v || !v.hollow || v.removed) return;
  if (v.hollow.deflate > 0.3) {
    v.hollow.left = true;
    v.hollow.open = Math.max(v.hollow.open, 0.8);
    if (!v.dead) v.die('hollowed out', by);
  } else {
    v.species = v.hollowFrom || null;
    v.hollow = null;
    for (let i = 0; i < 3; i++) v.addWound({ bone: i < 2 ? 1 : 0, t: 0.25 + i * 0.25, r: 0.6, gash: 0.2 });
    v.health.parts.torso.bleed += 0.008;
  }
}

/** Lets go of everything: whoever it had, whatever was in its other hand. */
function dropAll(man) {
  const sh = man.sh;
  const v = sh.victim;
  if (v && v.heldBy === man && v.state === 'held') v.release();
  if (sh.held && !sh.held.removed && sh.held.heldBy && sh.held.heldBy.man === man) sh.held.letGo();
  sh.held = null;
  if (v && v.hollow) abandon(v, man);
  if (sh.skin && sh.skin !== v && sh.skin.hollow) abandon(sh.skin, man);
  sh.victim = null;
  sh.reachA = sh.reachB = null;
  sh.curlA = sh.curlB = 0;
  sh.mouthGoal = 0;
  sh.pour = null;
  sh.fade = 1;
  if (sh.phase === 'enter') man.scale = sh.tall;
}

/** Somebody whose neck (or chest) is too low to reach standing: on the floor, say. */
const low = (man, o) => grabPoint(o).y - man.pos.y < 0.52 * man.scale;
/** Running away from it, and fast. */
const fleeing = (man, o) => Math.abs(o.vel.x) > 1.2 && sign(o.vel.x) === sign(o.pos.x - man.pos.x);
/** How near it goes for them from: further, for somebody running. */
const lungeFrom = (man, o) => (fleeing(man, o) ? 1.25 : 0.8) * man.scale;

function startLunge(man, o, purpose) {
  const sh = man.sh;
  setPhase(man, 'lunge');
  sh.target = o;
  sh.purpose = purpose;
  sh.low = low(man, o);
  man.facing = sign(grabPoint(o).x - man.pos.x) || man.facing;
  if (sh.low) {
    man.stop();
    man.anim.act('shallowStoopGrab', { fadeIn: 0.06, fadeOut: 0.18 });
  } else {
    // a lurch at them, still running
    man.anim.act('shallowLunge', { fadeIn: 0.04, fadeOut: 0.15 });
    man.vel.x += man.facing * 2.2;
  }
  man.sandbox.emit('shallowLunge', { who: man, x: man.pos.x, y: man.wj.chest.y });
}

function seize(man, o) {
  const sh = man.sh, sb = man.sandbox;
  if (sb.hand && sb.hand.holding === o) sb.hand.release();
  if (o.weapon) o.dropWeapon(0.4);
  // to be emptied, they are taken from behind: their back to it
  if (sh.purpose === 'skin' && !o.rag) o.facing = man.facing;
  const gp = grabPoint(o);
  o.grab(gp.x, gp.y, man);
  sh.victim = o;
  sh.from = { x: gp.x, y: gp.y };
  sh.curlA = 1;
  setPhase(man, sh.purpose === 'skin' ? 'turn' : 'lift');
  if (sh.purpose === 'skin') sh.skin = o;
  sayLine(man, sh.purpose === 'skin' ? 'shallowPick' : 'shallowSeize', { other: o.name }, true);
  sb.emit('shallowSeize', { who: o, by: man, x: gp.x, y: gp.y, skin: sh.purpose === 'skin' });
}

/** In front of its face, at arm's length: where it holds somebody up to look at them. */
function faceHold(man, k = 0.5, dy = -0.12) {
  const j = man.wj, f = man.facing, S = man.scale;
  return { x: j.head.x + f * k * S, y: j.head.y + dy * S };
}

/**
 * Holds hand A (and whoever is in it) at `at`, moving there from where the
 * hold began - and never faster than a hand could, so what it holds swings
 * from it rather than being flung about.
 */
function holdA(man, at, ease = 1, dt = 1 / 120) {
  const sh = man.sh;
  const from = sh.from || at;
  let p = ease >= 1 ? at : lerpPt(from, at, smooth(ease));
  const cur = sh.reachA;
  if (cur && cur.k >= 1) {
    const dx = p.x - cur.x, dy = p.y - cur.y, d = Math.hypot(dx, dy), max = 2.6 * man.scale * dt;
    if (d > max) p = { x: cur.x + (dx / d) * max, y: cur.y + (dy / d) * max };
  }
  sh.reachA = { x: p.x, y: p.y, k: 1 };
}

/** The bottom half of somebody pulled toward hand B, the top half held in hand A. */
function pullHips(v, g, k) {
  const rag = v.rag;
  if (!rag) return;
  const n = rag.byName;
  for (const [name, w] of [['hip', k], ['kneeA', k * 0.25], ['kneeB', k * 0.25]]) {
    const q = rag.p[n[name]];
    q.x += (g.x - q.x) * w;
    q.y += (g.y - q.y) * w;
  }
  rag.wake();
}

/** A body torn in two at the waist: the top half stays theirs (and dies); the legs are a thing of their own. */
function tearInHalf(man, v) {
  const sb = man.sandbox, f = man.facing, s = v.scale;
  const T = tearPoint(v.wj);
  const legs = new Legs(sb, v);
  if (addThing(sb, legs)) {
    legs.takenBy(man, 'B');
    man.sh.held = legs;
  }
  v.health.severed.femurA = true;
  v.health.severed.femurB = true;
  v.cut.legA = 'midFemA';
  v.cut.legB = 'midFemB';
  v.wounds = v.wounds.filter((w) => w.bone < 7);
  for (const e of [...v.stuck]) v.pullKnife(e, null);
  v.species = HALF;
  if (!v.dead) v.die('torn in half', man, f, 2, T);
  // (dead already, from being held like that: this is what anyone will remember it as)
  v.health.cause = 'torn in half';
  if (v.rag) {
    v.rebuildRag();
    // the top half: the hips are not there any more, only a stub of back
    const n = v.rag.byName, q = v.rag.p[n.hip];
    q.im = 1 / (1.5 * s);
    q.r = 0.01 * s;
    for (const k of ['midFemA', 'midFemB']) if (n[k] !== undefined) { v.rag.p[n[k]].im = 1 / (0.05 * s); v.rag.p[n[k]].r = 0.004 * s; }
  }
  sb.fx.blood(T.x, T.y, f * 2.2, 2.4, 46, 1.6, v);
  sb.fx.blood(T.x, T.y, -f * 1.6, 0.8, 30, 1.3, v);
  sb.fx.pool(T.x, 0, 1.4, v.tint);
  sb.emit('shallowRip', { who: v, by: man, x: T.x, y: T.y });
  man.sh.kills++;
}

/* ----------------------------------- eating ----------------------------------- */

function bite(man, n) {
  const sh = man.sh, sb = man.sandbox, f = man.facing;
  const m = mouthAt(man);
  sh.mouth = 0;
  sh.bites = n;
  sh.blood = Math.min(1, sh.blood + 0.4);
  sb.fx.blood(m.x + f * 0.1, m.y, f * 1.6, 0.6, 22, 1.1);
  sb.fx.blood(m.x, m.y - 0.05, -f * 0.4, -0.5, 10, 0.6);
  sb.emit('shallowBite', { who: man, x: m.x, y: m.y, n });
  const v = sh.victim;
  if (n === 1 && v) {
    // the head first
    v.species = HEADLESS;
    v.headMarks.length = 0;
    v.face.blood = 0;
    sh.eating = v.name;
    if (!v.dead) v.die('eaten', man, f, 1.4);
    v.health.cause = 'eaten';
    sb.emit('shallowEat', { who: v, by: man, x: m.x, y: m.y });
    sh.kills++;
  } else if (n === 2 && v) {
    // the body, arms and all: what is left is a pair of legs in its hand
    const legs = new Legs(sb, v);
    if (addThing(sb, legs)) {
      legs.takenBy(man, 'A');
      sh.held = legs;
    }
    sh.victim = null;
    sb.remove(v, { quiet: true });
  } else if (n === 3) {
    // and the rest
    if (sh.held && !sh.held.removed) sb.remove(sh.held, { quiet: true });
    sh.held = null;
    sh.bulge = { t: 0, k: 0.9 };
    sb.emit('shallowGulp', { who: man, x: m.x, y: m.y });
  }
}

/* ---------------------------------- emptying ---------------------------------- */

function startHollow(man, v) {
  const sb = man.sandbox;
  if (v.hollow) return;
  // a vest in the way comes off first
  if (v.vest) { const vest = v.vest; v.vest = null; vest.drop(v.wj.chest.x, Math.max(0.2, v.wj.chest.y), -man.facing * 1.5, 1); }
  v.hollowFrom = v.species;
  v.species = HOLLOW;
  v.hollow = { open: 0, deflate: 0 };
  v.health.conscious = 0;
  sb.emit('shallowCut', { who: v, by: man, x: v.wj.chest.x, y: v.wj.chest.y });
  sb.emit('shallowHollow', { who: v, by: man, x: v.wj.chest.x, y: v.wj.chest.y });
}

/**
 * In. The thing is gone from the world, and the person it emptied gets up,
 * whole again, as far as anyone can tell: the same name, the same height,
 * the same hair and voice, the same uniform, the same friends - and it.
 */
export function possess(man, v) {
  const sh = man.sh, sb = man.sandbox;
  const at = { x: v.wj.chest.x, y: v.wj.chest.y };
  sb.remove(man, { quiet: true });
  v.hollow = null;
  v.hollowFrom = null;
  if (v.dead) { v.health.dead = false; v.health.cause = ''; }
  v.species = DISGUISE;
  v.sh = sh;
  // out of the empty, boneless way it lay and into lying there like anybody (rebuilt as a
  // ragdoll in a pose no body with bones could be in, it would snap itself back into shape)
  if (v.rag) v.recover('down');
  v.heal();
  v.health.conscious = 1;
  v.downT = 0.5;
  v.tint = null;
  sh.form = 'disguise';
  sh.phase = 'calm';
  sh.t = 0;
  sh.base = v.scale;
  sh.tall = clamp(v.scale * GROWTH, 1.45, 1.95);
  sh.fade = 1;
  sh.crack = 0;
  sh.claws = 0;
  sh.mouth = sh.mouthGoal = 0;
  sh.blood = 0;
  sh.pour = null;
  sh.bulge = null;
  sh.wisps.length = 0;
  sh.marked.clear();
  sh.target = sh.victim = sh.skin = sh.held = null;
  sh.reachA = sh.reachB = null;
  sh.skins++;
  sh.wearing = v.name;
  sh.twitchT = rand(20, 40);
  sh.emergeT = 0.7;
  // their memories and their friends - it passes for them - and none of their fear of it
  const b = v.brain;
  if (b) {
    b.clearBehaviour();
    b.rels.delete(man);
    for (const [, r] of b.rels) { r.anger = 0; r.fear = 0; r.hurtMe = 0; r.violent = 0; r.killed = null; r.enemy = false; }
    b.memories = b.memories.filter((m) => m.who !== man && m.about !== man);
    for (const e of ['joy', 'sadness', 'anger', 'fear', 'surprise']) b.emo[e] = b.emo.base[e];
    b.griefs.clear();
    b.note(`I am ${v.name}. I have always been ${v.name}.`);
  }
  sb.emit('becomes', { from: man, to: v });
  sb.emit('shallowTook', { who: v, by: man, x: at.x, y: at.y });
}

/* ------------------------------------ mind ------------------------------------ */

function creatureMind(brain, dt) {
  const man = brain.man, sh = man.sh, sb = man.sandbox;
  if (!sh || sh.form !== 'creature' || man.dead) return true;
  sh.t += dt;
  sh.think -= dt;
  // out of the skin, it is never anything but furious
  brain.emo.anger = Math.max(brain.emo.anger, 0.85);
  const S = man.scale, f = man.facing, j = man.wj;
  // knocked off its feet, picked up from above: it lets go of everything, and gets up
  if (man.rag || !['stand', 'air', 'climb'].includes(man.state)) {
    if (sh.phase !== 'down') {
      dropAll(man);
      if (sh.phase === 'rise' || sh.phase === 'enter') { man.scale = sh.tall; sh.claws = 1; }
      setPhase(man, 'down');
    }
    return true;
  }
  if (sh.phase === 'down') setPhase(man, nextTarget(man) ? 'hunt' : 'seek');
  // whoever hurts it goes on the list
  const lh = man.lastHit;
  if (lh && lh.by && lh.by !== man && sb.time - lh.t < 0.5 && alive(lh.by) && !isShallow(lh.by)) {
    if (!sh.marked.has(lh.by)) { sh.marked.add(lh.by); sayLine(man, 'shallowHurt', { other: lh.by.name }, false, 0.6); }
  }
  // hold on: anybody in its hand stays there until it is done
  const busy = ['lift', 'rip', 'eat', 'turn', 'cut', 'bones', 'organs'].includes(sh.phase);
  if (busy && sh.victim && !holding(man) && !(sh.phase === 'eat' && sh.bites >= 2)) {
    // taken off it (the hand from above), or gone
    const v = sh.victim;
    if (v && v.hollow) abandon(v, man);
    sh.victim = null;
    sh.reachA = sh.reachB = null;
    sh.curlA = sh.curlB = 0;
    if (sh.held && !sh.held.removed) sh.held.letGo();
    sh.held = null;
    setPhase(man, nextTarget(man) ? 'hunt' : 'seek');
    return true;
  }
  sh.mouthGoal = 0;
  switch (sh.phase) {
    case 'rise': {
      man.stop();
      if (sh.t >= 1.45) setPhase(man, 'roar');
      break;
    }
    case 'roar': {
      man.stop();
      if (!sh.tried) {
        sh.tried = true;
        man.anim.act('shallowRoar', { fadeIn: 0.08, fadeOut: 0.2 });
        sayLine(man, 'shallowRoar', { other: sh.wore || '' }, true);
        sb.emit('shallowRoar', { who: man, x: man.pos.x, y: j.head.y });
      }
      if (sh.t > 0.1 && sh.t < 0.85) sh.mouthGoal = 0.85;
      if (sh.t >= 1.05) setPhase(man, nextTarget(man) ? 'hunt' : 'seek');
      break;
    }
    case 'hunt': {
      const o = (sh.target = nextTarget(man));
      if (!o) { setPhase(man, 'seek'); break; }
      const ox = grabPoint(o).x, dx = ox - man.pos.x, d = Math.abs(dx);
      if (d < lungeFrom(man, o) && Math.abs(o.pos.y - man.pos.y) < 1.2 && sh.missT <= 0 && seizable(o)) { startLunge(man, o, 'kill'); break; }
      man.goTo(fleeing(man, o) ? ox + o.vel.x * 0.4 : ox - sign(dx) * (low(man, o) ? 0.62 : 0.42) * S, 'run', { face: ox });
      if (chance(dt * 0.35)) sayLine(man, 'shallowHunt', { other: o.name });
      break;
    }
    case 'seek': {
      if (nextTarget(man)) { setPhase(man, 'hunt'); break; }
      if (sh.think <= 0) { sh.think = 0.4; sh.skin = nearestSkin(man); }
      const o = sh.skin;
      if (!o || !alive(o)) {
        sh.skin = null;
        // nobody: it prowls
        if (man.intent.x === null && chance(dt * 0.4)) man.goTo(clamp(man.pos.x + rand(-5, 5), sb.left + 1, sb.right - 1), 'walk');
        if (chance(dt * 0.08)) sayLine(man, 'shallowSeek', {});
        break;
      }
      const ox = grabPoint(o).x, dx = ox - man.pos.x, d = Math.abs(dx);
      if (d < lungeFrom(man, o) && Math.abs(o.pos.y - man.pos.y) < 1.2 && sh.missT <= 0 && seizable(o)) { startLunge(man, o, 'skin'); break; }
      man.goTo(fleeing(man, o) ? ox + o.vel.x * 0.4 : ox - sign(dx) * (low(man, o) ? 0.62 : 0.42) * S, 'run', { face: ox });
      if (chance(dt * 0.25)) sayLine(man, d < 4 ? 'shallowPick' : 'shallowSeek', { other: o.name });
      break;
    }
    case 'lunge': {
      const o = sh.target;
      if (!o || o.removed || (!seizable(o) && !holding(man))) { sh.reachA = null; sh.missT = 0.5; setPhase(man, sh.purpose === 'skin' ? 'seek' : 'hunt'); break; }
      const gp = grabPoint(o);
      // (bent right down for somebody on the floor: that takes longer)
      const at = sh.low ? 0.34 : 0.2, end = sh.low ? 0.72 : 0.46;
      // the hand goes where they will be, and the legs keep after them
      const lead = Math.max(0, at - sh.t);
      sh.reachA = { x: gp.x + o.vel.x * lead, y: gp.y, k: smooth(sh.t / (at + 0.02)) };
      sh.curlA = 0.15;
      if (!sh.low) man.goTo(gp.x + o.vel.x * 0.3, 'run', { face: gp.x });
      if (sh.t >= at && !sh.tried) {
        sh.tried = true;
        const g = gripAt(man, 'A');
        if (Math.hypot(g.x - gp.x, g.y - gp.y) < 0.4 * S) { man.stop(); seize(man, o); break; }
        sh.missT = 0.3;
      }
      if (sh.t >= end) { sh.reachA = null; sh.curlA = 0; setPhase(man, sh.purpose === 'skin' ? 'seek' : 'hunt'); }
      break;
    }
    case 'lift': {
      man.stop();
      holdA(man, faceHold(man), sh.t / 0.55, dt);
      if (sh.t >= 0.7) {
        const v = sh.victim;
        sh.mode = sh.next || (chance(0.5) ? 'rip' : 'eat');
        sh.torn = false;
        sh.bites = 0;
        sh.eating = v ? v.name : null;
        sh.from = { x: sh.reachA.x, y: sh.reachA.y };
        setPhase(man, sh.mode);
        if (sh.mode === 'rip') man.anim.act('shallowRip', { fadeIn: 0.12, fadeOut: 0.2 });
        sayLine(man, sh.mode === 'rip' ? 'shallowRip' : 'shallowEat', { other: v ? v.name : '' }, true);
      }
      break;
    }
    case 'rip': {
      man.stop();
      const v = sh.victim, t = sh.t;
      const face = faceHold(man, 0.38, -0.1);
      if (!sh.torn) {
        if (t < 0.45) {
          holdA(man, face, t / 0.3, dt);
          if (v) sh.reachB = { x: v.wj.hip.x, y: v.wj.hip.y, k: smooth(t / 0.45) };
          sh.curlB = 0.3;
        } else {
          // feet set, and pull
          const w = smooth((t - 0.45) / 0.55);
          sh.reachA = { x: face.x - f * 0.12 * S * w, y: face.y + 0.42 * S * w, k: 1 };
          sh.reachB = { x: face.x + f * 0.28 * S * w, y: face.y - 0.7 * S * w, k: 1 };
          sh.curlB = 1;
          if (v) pullHips(v, gripAt(man, 'B'), 0.45);
          sh.mouthGoal = 0.5 * w;
          if (chance(dt * 6)) sb.emit('shallowStrain', { who: man, x: man.pos.x, y: j.chest.y });
          if (t >= 1.0 && v) { sh.torn = true; tearInHalf(man, v); }
        }
      } else {
        // held up apart, one half in each hand
        sh.reachA = { x: j.head.x + f * 0.1 * S, y: j.head.y + 0.42 * S, k: 1 };
        sh.reachB = { x: j.head.x + f * 0.72 * S, y: j.head.y - 0.62 * S, k: 1 };
        sh.mouthGoal = t < 1.5 ? 0.9 : 0;
        if (t >= 1.75) {
          if (v && v.heldBy === man && v.state === 'held') {
            v.release();
            if (v.rag) v.rag.fling(f * 3.2, 2.5, 0.75);
          }
          if (sh.held && !sh.held.removed) sh.held.letGo(-f * 2.6, 2.2);
          sh.held = null;
          sh.victim = null;
          sh.reachA = sh.reachB = null;
          sh.curlA = sh.curlB = 0;
          setPhase(man, 'after');
        }
      }
      break;
    }
    case 'eat': {
      man.stop();
      const t = sh.t, m = mouthAt(man), v = sh.victim;
      const vs = v ? v.scale : 1;
      // up to the mouth: the head first, then the chest, then what is left
      let at;
      if (sh.bites < 1) at = { x: m.x + f * 0.17 * S, y: m.y - 0.22 * vs };
      else if (sh.bites < 2) at = { x: m.x + f * 0.13 * S, y: m.y + (t > 0.75 ? 0.2 : 0.05) * vs };
      else at = { x: m.x + f * 0.12 * S, y: m.y - (t > 1.75 ? 0.02 : 0.25) * vs };
      holdA(man, at, sh.bites < 1 ? t / 0.32 : 1, dt);
      if (sh.bites < 1 && t > 0.12) sh.mouthGoal = 1;
      else if (sh.bites === 1 && t > 1.12) sh.mouthGoal = 1;
      else if (sh.bites === 2 && t > 2.05) sh.mouthGoal = 1;
      else sh.mouthGoal = 0.15 + 0.15 * Math.sin(t * 22);
      if (sh.bites === 0 && t >= 0.42) { man.anim.act('shallowBite', { fadeIn: 0.02, fadeOut: 0.12 }); bite(man, 1); }
      else if (sh.bites === 1 && t >= 1.45) { man.anim.act('shallowBite', { fadeIn: 0.02, fadeOut: 0.12 }); bite(man, 2); }
      else if (sh.bites === 2 && t >= 2.38) { man.anim.act('shallowBite', { fadeIn: 0.02, fadeOut: 0.12 }); bite(man, 3); }
      if (sh.bites >= 3) { sh.reachA = null; sh.curlA = 0; sh.mouthGoal = 0; }
      if (t >= 3.3) setPhase(man, 'after');
      break;
    }
    case 'after': {
      man.stop();
      sh.reachA = sh.reachB = null;
      sh.curlA = sh.curlB = 0;
      if (!sh.tried) {
        sh.tried = true;
        sayLine(man, 'shallowAfter', { other: sh.eating || '' }, true);
        if (chance(0.5)) { man.anim.act('shallowRoar', { fadeIn: 0.1, fadeOut: 0.2 }); sb.emit('shallowLaugh', { who: man, x: man.pos.x, y: j.head.y }); }
      }
      if (man.anim.actionName === 'shallowRoar' && sh.t < 0.8) sh.mouthGoal = 0.6;
      if (sh.t >= 1.1) setPhase(man, nextTarget(man) ? 'hunt' : 'seek');
      break;
    }
    case 'turn': {
      man.stop();
      holdA(man, faceHold(man, 0.34, -0.5), sh.t / 0.5, dt);
      if (sh.t >= 0.6) { sh.from = { x: sh.reachA.x, y: sh.reachA.y }; setPhase(man, 'cut'); }
      break;
    }
    case 'cut': {
      man.stop();
      const v = sh.victim;
      holdA(man, faceHold(man, 0.34, -0.5), 1, dt);
      const c = clamp01((sh.t - 0.12) / 0.45);
      const bp = backPoint(v, c);
      sh.reachB = { x: bp.x, y: bp.y, k: smooth(sh.t / 0.12) };
      sh.curlB = 0.1;
      if (sh.t >= 0.12 && !v.hollow) startHollow(man, v);
      if (v.hollow) {
        v.hollow.open = Math.max(v.hollow.open, c);
        if (c < 1 && chance(dt * 30)) sb.fx.blood(bp.x, bp.y, -f * 0.9, 0.4, 3, 0.5, v);
      }
      if (sh.t >= 0.8) setPhase(man, 'bones');
      break;
    }
    case 'bones': {
      man.stop();
      const v = sh.victim, t = sh.t;
      holdA(man, faceHold(man, 0.34, -0.5), 1, dt);
      const into = backPoint(v, 0.45);
      if (t < 0.3) sh.reachB = { x: into.x, y: into.y, k: 1 };
      else {
        if (!sh.held && !sh.tried) {
          sh.tried = true;
          const sk = new Skeleton(sb, v);
          if (addThing(sb, sk)) { sk.takenBy(man, 'B'); sh.held = sk; }
          if (v.rag) boneless(v.rag);
          if (v.hollow) v.hollow.deflate = 0.45;
          man.anim.act('shallowPull', { fadeIn: 0.05, fadeOut: 0.2 });
          sb.fx.blood(into.x, into.y, -f * 2, 1.5, 26, 1.2, v);
          sb.emit('shallowBones', { who: v, by: man, x: into.x, y: into.y });
        }
        const k = smooth((t - 0.3) / 0.45);
        sh.reachB = { x: lerp(into.x, j.shoulder.x - f * 0.55 * S, k), y: lerp(into.y, j.head.y + 0.28 * S, k), k: 1 };
        sh.curlB = 1;
      }
      if (t >= 0.95 && sh.held) { sh.held.letGo(-f * rand(2, 3), rand(2, 3.4)); sh.held = null; sh.curlB = 0; }
      if (t >= 1.2) { sh.scoops = 0; setPhase(man, 'organs'); }
      break;
    }
    case 'organs': {
      man.stop();
      const v = sh.victim, t = sh.t;
      holdA(man, faceHold(man, 0.34, -0.5), 1, dt);
      const i = Math.min(3, Math.floor(t / 0.32)), local = (t - i * 0.32) / 0.32;
      const inside = backPoint(v, 0.3 + 0.13 * i);
      const out = { x: j.shoulder.x - f * 0.35 * S, y: j.head.y + 0.08 * S };
      const k = local < 0.45 ? smooth(local / 0.45) : 1 - smooth((local - 0.45) / 0.55);
      sh.reachB = { x: lerp(out.x, inside.x, k), y: lerp(out.y, inside.y, k), k: 1 };
      sh.curlB = local > 0.45 ? 0.8 : 0.2;
      if (local >= 0.45 && sh.scoops === i && i < 4) {
        sh.scoops++;
        const what = ORGAN_ORDER[i];
        const o = new Organ(sb, what, v, inside.x, inside.y, -f * rand(2.4, 3.8), rand(3, 4.6));
        addThing(sb, o);
        if (v.hollow) v.hollow.deflate = Math.min(1, 0.45 + 0.14 * sh.scoops);
        sb.fx.blood(inside.x, inside.y, -f * 1.4, 1.2, 12, 0.9, v);
        sb.emit('shallowOrgan', { who: v, by: man, what, x: inside.x, y: inside.y });
      }
      if (t >= 1.32) setPhase(man, 'drop');
      break;
    }
    case 'drop': {
      man.stop();
      const v = sh.victim;
      sh.reachB = null;
      if (!sh.tried && v) {
        sh.tried = true;
        if (v.hollow) v.hollow.deflate = 1;
        v.release();
        sh.skin = v;
        sh.victim = null;
        sh.reachA = null;
        sh.curlA = 0;
        sayLine(man, 'shallowEnter', { other: v.name }, true, 0.8);
      }
      if (sh.t >= 0.55) { sh.slumped = false; setPhase(man, 'enter'); }
      break;
    }
    case 'enter': {
      const v = sh.skin;
      if (!v || v.removed || !v.hollow) { sh.fade = 1; man.scale = sh.tall; sh.pour = null; setPhase(man, 'seek'); break; }
      const t = sh.t;
      const at = backPoint(v, 0.5);
      if (t < 0.45) { man.goTo(at.x - f * 0.15 * S, 'walk'); break; }
      man.stop();
      if (!sh.slumped) {
        sh.slumped = true;
        man.facing = sign(at.x - man.pos.x) || f;
        man.anim.act('shallowSlump', { fadeIn: 0.15, fadeOut: 0.2 });
        sb.emit('shallowEnter', { who: man, into: v, x: at.x, y: at.y });
      }
      const k = clamp01((t - 0.5) / 1.3);
      sh.fade = 1 - smooth(k);
      man.scale = lerp(sh.tall, v.scale * 0.85, smooth(k));
      man.pos.x = lerp(man.pos.x, at.x, dt * 2.5 * k);
      sh.pour = { x: at.x, y: at.y, k: Math.sin(k * Math.PI) };
      v.hollow.deflate = 1 - smooth(clamp01((t - 1.0) / 0.8));
      v.hollow.open = 1 - smooth(clamp01((t - 1.35) / 0.55));
      if (t >= 2.0) possess(man, v);
      break;
    }
    default:
      setPhase(man, 'seek');
  }
  return true;
}

/* ------------------------------------ body ------------------------------------ */

const LIMB_BONES = { armA: ['humerusA', 'forearmA'], armB: ['humerusB', 'forearmB'], legA: ['femurA', 'tibiaA'], legB: ['femurB', 'tibiaB'] };

/** Something cut off it, back: it grows out of the stump. */
function regrow(man, limb) {
  const h = man.health;
  for (const b of LIMB_BONES[limb]) h.severed[b] = false;
  delete man.cut[limb];
  h.stumps[limb] = 0;
  h.tourniquet[limb] = false;
  const p = h.parts[limb];
  p.hp = Math.max(p.hp, p.max * 0.5);
  p.broken = false;
  if (man.rag) man.rebuildRag();
  const at = man.wj[limb.startsWith('arm') ? 'shoulder' : 'hip'];
  man.sandbox.emit('shallowRegrow', { who: man, limb, x: at.x, y: at.y });
}

/**
 * It does not stay hurt: wounds close, a broken bone knits (one every second
 * and a half), a joint goes back in, and what is cut off grows back.
 */
function mend(man, dt) {
  const h = man.health, sh = man.sh;
  for (const p of Object.values(h.parts)) {
    p.hp = Math.min(p.max, p.hp + p.max * 0.015 * dt);
    p.bleed *= Math.exp(-dt * 0.9);
  }
  h.internal *= Math.exp(-dt * 0.8);
  h.blood = Math.min(1, h.blood + dt * 0.01);
  h.pain = Math.max(0, h.pain - dt * 10);
  h.dizzy = Math.max(0, h.dizzy - dt);
  h.conscious = Math.min(1, h.conscious + dt * 0.4);
  sh.mendT = (sh.mendT || 0) + dt;
  if (sh.mendT > 1.5) {
    sh.mendT = 0;
    const out = Object.entries(h.dislocated).find(([, on]) => on);
    if (out) man.relocate(out[0], null);
    else {
      const b = Object.keys(h.bones).find((k) => h.bones[k].broken && !h.severed[k]);
      if (b) {
        h.bones[b].broken = false;
        h.bones[b].cracked = 0;
        const part = BONE_PART[b];
        if (part && part !== 'head' && part !== 'torso') h.parts[part].broken = false;
        if (b === 'spine' || b === 'neck') h.paralysed = 'none';
        if (man.rag) man.rebuildRag();
      } else if (h.paralysed !== 'none') h.paralysed = 'none';
    }
  }
  sh.regrow = sh.regrow || {};
  for (const limb of Object.keys(man.cut)) {
    sh.regrow[limb] = (sh.regrow[limb] || 0) + dt;
    if (sh.regrow[limb] > 7) { sh.regrow[limb] = 0; regrow(man, limb); }
  }
}

function creatureUpdate(man, dt) {
  const sh = man.sh, sb = man.sandbox;
  if (!sh) return;
  sh.sayT -= dt;
  sh.missT -= dt;
  if (man.dead) {
    // dead, it comes apart into black, and is gone
    if (sh.form !== 'gone') { sh.form = 'gone'; sh.dyingT = 0; }
    sh.dyingT += dt;
    sh.fade = 1 - smooth(clamp01((sh.dyingT - 0.8) / 2));
    sh.mouth = moveToward(sh.mouth, 0.5, dt);
    spawnWisps(man, dt, 22);
    stepWisps(sh, dt);
    if (sh.dyingT > 3) sb.remove(man, { quiet: true });
    return;
  }
  if (sh.phase === 'rise') {
    const g = clamp01(sh.t / 1.3);
    man.scale = lerp(sh.base * 0.92, sh.tall, easeOut(g));
    sh.claws = clamp01((sh.t - 0.55) / 0.6);
  } else if (sh.phase !== 'enter') sh.claws = moveToward(sh.claws, 1, dt * 2);
  sh.mouth = sh.mouthGoal > sh.mouth ? moveToward(sh.mouth, sh.mouthGoal, dt * 5) : moveToward(sh.mouth, sh.mouthGoal, dt * 9);
  sh.blood = Math.max(0, sh.blood - dt * 0.015);
  if (sh.bulge) { sh.bulge.t += dt / 0.9; sh.bulge.k *= Math.exp(-dt * 0.6); if (sh.bulge.t >= 1) sh.bulge = null; }
  sh.pin = sh.phase !== 'seek' && sh.phase !== 'roar';
  if (sh.phase !== 'enter') sh.pour = null;
  mend(man, dt);
  spawnWisps(man, dt, sh.phase === 'enter' ? 24 : 10);
  stepWisps(sh, dt);
  // the brain says nothing of its own: its body still drips what it bleeds
  if (sh.blood > 0.2 && chance(dt * 2)) {
    const m = mouthAt(man);
    sb.fx.drip(m.x, m.y - 0.05);
  }
}

function spawnWisps(man, dt, rate) {
  const sh = man.sh, j = man.wj, S = man.scale;
  sh.wispT -= dt * rate;
  while (sh.wispT <= 0) {
    sh.wispT += 1;
    if (sh.wisps.length > 60) break;
    const from = pick([j.head, j.neck, j.chest, j.shoulder, j.hip, j.elbowA, j.elbowB, j.handA, j.handB, j.kneeA, j.kneeB]);
    sh.wisps.push({ x: from.x + rand(-0.035, 0.035) * S, y: from.y + rand(-0.035, 0.035) * S, vx: rand(-0.12, 0.12), vy: rand(0.15, 0.4), r: rand(0.008, 0.02) * S, age: 0, life: rand(0.5, 1.1) });
  }
}

function stepWisps(sh, dt) {
  for (const w of sh.wisps) { w.age += dt; w.x += w.vx * dt; w.y += w.vy * dt; }
  sh.wisps = sh.wisps.filter((w) => w.age < w.life);
}

/** Its arms where its mind wants them, and whoever it holds where its hand is. */
function creaturePose(man) {
  const sh = man.sh;
  if (!sh || man.dead) return;
  if (sh.reachA) reachArm(man, 'A', sh.reachA, sh.reachA.k);
  if (sh.reachB) reachArm(man, 'B', sh.reachB, sh.reachB.k);
  const v = sh.victim;
  if (v && v.heldBy === man && v.state === 'held') {
    const g = gripAt(man, 'A');
    v.holdAt(g.x, g.y);
  }
}

/* ---------------------------------- species ---------------------------------- */

const NAME_PHASE = {
  rise: () => 'Tearing out of its skin',
  roar: () => 'Roaring',
  hunt: (sh) => (sh.target ? `Hunting ${sh.target.name}` : 'Hunting'),
  lunge: (sh) => (sh.target ? `Lunging at ${sh.target.name}` : 'Lunging'),
  lift: (sh) => (sh.victim ? `Holding ${sh.victim.name} up` : 'Holding someone up'),
  rip: (sh) => `Tearing ${sh.eating || 'someone'} in half`,
  eat: (sh) => `Eating ${sh.eating || 'someone'}`,
  after: () => 'Looking for the next one',
  seek: (sh) => (sh.skin ? `Going after ${sh.skin.name}'s skin` : 'Looking for a new skin'),
  turn: (sh) => `Cutting ${sh.victim ? sh.victim.name : 'someone'} open`,
  cut: (sh) => `Cutting ${sh.victim ? sh.victim.name : 'someone'} open`,
  bones: (sh) => `Pulling out ${sh.victim ? sh.victim.name + "'s" : 'a'} skeleton`,
  organs: (sh) => `Emptying ${sh.victim ? sh.victim.name : 'someone'} out`,
  drop: (sh) => `Climbing into ${sh.skin ? sh.skin.name : 'a skin'}`,
  enter: (sh) => `Climbing into ${sh.skin ? sh.skin.name : 'a skin'}`,
  down: () => 'Getting up',
};

export const DISGUISE = {
  mod: MOD,
  kind: 'shallowDisguise',
  label: 'Shallow, in disguise',
  // a person, as far as holsters, pockets and vests are concerned - as far as anybody can tell
  human: true,
  // (it only breathes because they do)
  breathes: false,
  skin: disguiseSkin,
  init(man) { man.sh = newState(man.scale); },
  spawned(man, o) { if (o.sh) man.sh = o.sh; },
  update: disguiseUpdate,
  mind(brain) { const sh = brain.man.sh; return !!sh && sh.phase === 'crack'; },
  doing(man) { return man.sh && man.sh.phase === 'crack' ? 'Splitting open' : null; },
  died(man) { if (man.sh) man.sh.emergeT = 0.7; },
  // it does not fight the way a person does: when it fights, it is not as a person
  fightScale() { return 0.15; },
  abilities(man) {
    const sh = man.sh;
    if (!sh) return null;
    return [{ id: 'shallowSnap', label: 'Tear out', group: 'do', on: sh.phase === 'crack', pick: () => provoke(man) }];
  },
  describeArms(man) { return man.sh && man.sh.worn.length ? `Wearing ${man.name}'s skin` : null; },
};

export const CREATURE = {
  mod: MOD,
  kind: 'shallow',
  label: 'Shallow',
  monster: true,
  tireless: true,
  sturdy: true,
  breathes: false,
  // it has words, but they are its own (lines.js), said when it wants
  mute: true,
  noPickup: true,
  skin: creatureSkin,
  power: 3.8,
  speed: 1.45,
  fall: 0.15,
  init(man) {
    man.sh = newState(man.scale);
    man.sh.form = 'creature';
    man.tint = ICHOR;
    for (const p of Object.values(man.health.parts)) { p.max *= 3.4; p.hp = p.max; }
    man.health.toughness = 1;
  },
  spawned(man, o) {
    if (o.sh) man.sh = o.sh;
    man.sh.form = 'creature';
    man.tint = ICHOR;
  },
  update: creatureUpdate,
  mind: creatureMind,
  pose: creaturePose,
  procedural(man, p) {
    if (man.state !== 'stand' || !man.sh) return;
    const t = man.sandbox.time + man.seed;
    // hunched, the head pushed out ahead of it and never quite still
    p.t += 0.26 + Math.sin(t * 0.9) * 0.03;
    p.h += 0.14 + Math.sin(t * 1.7) * 0.06 + Math.sin(t * 7.3) * 0.015;
    if (!man.anim.acting) { p.aAu += 0.14; p.aBu += 0.08; p.aAl += 0.12; p.aBl += 0.1; }
  },
  doing(man) {
    const sh = man.sh;
    if (!sh) return null;
    const f = NAME_PHASE[sh.phase];
    return f ? f(sh) : null;
  },
  died(man) {
    dropAll(man);
    man.sh.form = 'gone';
    man.sandbox.emit('shallowDied', { who: man, x: man.pos.x, y: man.wj.chest.y });
  },
  healed(man) { if (man.sh) man.sh.blood = 0; },
  armor(man, h, part, weapon) {
    if (!weapon) return 0.22;
    if (weapon === 'knuckles') return 0.3;
    if (weapon === 'bullet') return 0.36;
    return 0.5;
  },
  // a taser does nothing to it at all
  zap() { return false; },
  strikes() { return []; },
  canPickUp() { return false; },
  /** Who it is coming for, as far as anybody else can tell. */
  hostileTo(me, o) {
    const sh = me.sh;
    return !!sh && sh.form === 'creature' && (sh.marked.has(o) || sh.target === o || sh.victim === o || sh.skin === o);
  },
  /** Somebody's first sight of it. */
  metBy(me, brain, r) {
    const T = brain.traits;
    r.fear = Math.max(r.fear, 0.75 * (1.25 - T.bravery));
    r.violent = Math.max(r.violent, 2);
    r.like = -1;
    brain.emo.bump('fear', 0.45 * (1.2 - T.bravery));
    brain.emo.bump('surprise', 0.6);
    brain.speak('seeShallow', { other: me.name }, 0.9, me, true);
  },
  describeArms() { return 'Five long black claws on each hand'; },
  abilities(man) {
    const sh = man.sh;
    if (!sh) return null;
    return [
      { id: 'either', label: 'Either', group: 'Kills by', on: !sh.next, pick: () => { sh.next = null; } },
      { id: 'rip', label: 'Tearing in half', group: 'Kills by', on: sh.next === 'rip', pick: () => { sh.next = 'rip'; } },
      { id: 'eat', label: 'Eating', group: 'Kills by', on: sh.next === 'eat', pick: () => { sh.next = 'eat'; } },
      {
        id: 'skin', label: 'Take a skin', group: 'do', on: sh.phase === 'seek' || ['turn', 'cut', 'bones', 'organs', 'drop', 'enter'].includes(sh.phase),
        pick: () => {
          if (['turn', 'cut', 'bones', 'organs', 'drop', 'enter'].includes(sh.phase)) return true;
          if (sh.victim || sh.held) dropAll(man);
          sh.marked.clear();
          setPhase(man, 'seek');
          sh.think = 0;
          return true;
        },
      },
      { id: 'drop', label: 'Let go', group: 'do', on: false, pick: () => { if (!sh.victim && !sh.held) return false; dropAll(man); setPhase(man, nextTarget(man) ? 'hunt' : 'seek'); return true; } },
    ];
  },
};

/* ------------------------------- what it leaves ------------------------------- */

export const HALF = {
  mod: MOD,
  kind: 'shallowHalf',
  label: 'Torn in half',
  skin: halfSkin,
  update(man, dt) {
    // it goes on bleeding from where it came apart, for a while
    man.halfBleed = (man.halfBleed ?? 1) * Math.exp(-dt * 0.08);
    if (man.halfBleed > 0.06 && chance(dt * 9 * man.halfBleed)) {
      const T = tearPoint(man.wj);
      man.sandbox.fx.drip(T.x, T.y, man);
    }
  },
};

export const HEADLESS = {
  mod: MOD,
  kind: 'shallowEaten',
  label: 'Being eaten',
  skin: headlessSkin,
};

/** Somebody being emptied out: the split down their back, and less and less in them. */
export const HOLLOW = {
  mod: MOD,
  kind: 'shallowHollow',
  label: 'Being hollowed out',
  skin: {
    full(ctx, j, o) {
      const h = (o.man && o.man.hollow) || { open: 1, deflate: 1 };
      drawEmptySkin(ctx, j, o, { deflate: h.deflate, open: h.open, black: false, face: o.face, cut: o.cut, wounds: o.wounds, tint: o.tint });
    },
  },
  update(man) {
    const h = man.hollow;
    if (!h || h.left) return;
    // out, and staying out, while it works
    if (!man.dead) man.health.conscious = 0;
    if (!man.sandbox.people.some((p) => p.sh && p.sh.form === 'creature' && (p.sh.victim === man || p.sh.skin === man))) {
      // whatever was doing this is not any more
      abandon(man, null);
    }
  },
};
