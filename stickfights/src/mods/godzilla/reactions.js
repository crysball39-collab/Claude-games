/* =============================================================================
   GODZILLA - what everybody makes of him: the terror of the first sight of
   him and of every roar, what they say about each thing he does, and what
   they remember of it.
   ========================================================================== */
import { addMemoryKind } from '../../game/brain.js';
import { clamp01, chance } from '../../core/util.js';
import { noteWrecked } from './world.js';

// [weight, how bad, how they think of it, how they tell it]
addMemoryKind('sawGzKill', [1, -1,
  (m) => `${m.who.name} ${m.what || 'killed'} ${m.about ? m.about.name : 'somebody'}`,
  (m) => `${m.what || 'killed'} ${m.about ? m.about.name : 'somebody'}`]);

const giant = (p) => !!(p && p.species && p.species.giant);

/** Everybody awake who could see it happen, but the one it happened to and whoever did it. */
function witnesses(sb, e, fn, r = 40) {
  for (const p of sb.people) {
    if (!p.brain || p.removed || !p.alive || !p.conscious || giant(p) || p === e.who || p === e.by) continue;
    if (Math.abs(p.pos.x - e.x) > r) continue;
    const B = p.brain;
    // (he is hard to miss: anyone looking his way sees what he does)
    const seen = B.canSee(e.x, e.y) || (e.by && !e.by.removed && B.sees(e.by)) || (e.who && !e.who.removed && B.sees(e.who));
    if (seen) fn(B, p);
  }
}

/** Everybody near enough to hear it, looking or not. */
function hearers(sb, e, r, fn) {
  for (const p of sb.people) {
    if (!p.brain || p.removed || !p.alive || giant(p) || p === e.who) continue;
    const d = Math.abs(p.pos.x - e.x);
    if (d <= r) fn(p.brain, p, d);
  }
}

/** As afraid of him as anybody has been of anything. */
function terror(B, it, k = 1) {
  const T = B.traits, E = B.emo;
  E.bump('surprise', 0.7 * k);
  E.bump('fear', 0.6 * k * (1.3 - T.bravery * 0.6));
  B.shaken(0.6 * k);
  if (it && !it.removed) {
    const r = B.rel(it);
    r.met = true;
    r.fear = Math.max(r.fear, clamp01(0.95 * k * (1.35 - T.bravery * 0.5)));
    r.violent = Math.max(r.violent, 3);
    r.like = -1;
  }
  B.react = Math.max(B.react, 0.25);
}

export function setupReactions(sb) {
  // a building he has been at, giving way: that is one he has wrecked
  sb.on('slabGive', (e) => {
    const w = e.what, by = w && w.thrownBy;
    if (w && w.background && by && by.gz && !by.removed && sb.time - w.thrownAt < 6) noteWrecked(by, w);
  });
  // who he has killed, however he did it
  sb.on('death', (e) => {
    const v = e.who;
    const by = e.by && e.by.gz ? e.by : v.gzHitBy && sb.time - v.gzHitT < 8 && !v.gzHitBy.removed ? v.gzHitBy : null;
    if (by && by !== v && by.gz) by.gz.kills++;
  });
  sb.on('gzSpawn', (e) => hearers(sb, e, 40, (B) => { B.emo.bump('surprise', 0.6); B.heard = { x: e.x, y: 4, t: sb.time }; }));
  sb.on('gzRoar', (e) => hearers(sb, { ...e, who: e.who }, 34, (B, p, d) => {
    terror(B, e.who, 0.8 + (1 - d / 34) * 0.5);
    B.heard = { x: e.x, y: e.y, t: sb.time };
    B.speak('gzRoarHeard', { other: e.who.name }, 0.7, null, true);
    // right under it, the faint-hearted go down
    if (d < 7 && B.traits.bravery < 0.3 && chance(0.3)) p.faint();
  }));
  const killed = (verb, say, k = 1.1) => (e) => witnesses(sb, e, (B) => {
    const it = e.by, v = e.who;
    terror(B, it, k);
    const rv = B.rels.get(v);
    if (rv && rv.like > 0.35) B.emo.bump('sadness', 0.5 * (0.5 + B.traits.empathy));
    B.speak(say, { victim: v.name, other: it.name }, 0.9, null, true);
    B.remember('sawGzKill', it, v, verb);
    B.note(`It ${verb} ${v.name}.`);
    if (rv && rv.like > 0.3 && B.traits.bravery > 0.6) {
      const r = B.rel(it);
      r.killed = v;
      r.anger = Math.max(r.anger, 0.5 + B.traits.aggression * 0.4);
    }
  });
  sb.on('gzCrush', (e) => { if (e.alive) killed('stepped on', 'sawGzCrush')(e); });
  sb.on('gzEat', killed('ate', 'sawGzEat', 1.2));
  sb.on('gzBite', (e) => { if (e.alive) killed('bit', 'sawGzBite')(e); });
  sb.on('gzThrow', killed('threw', 'sawGzThrow', 0.9));
  const struck = (e) => witnesses(sb, e, (B) => {
    terror(B, e.by, 0.8);
    B.speak('sawGzHit', { victim: e.who.name, other: e.by.name }, 0.6, null, true);
  });
  sb.on('gzTailHit', struck);
  sb.on('gzKickHit', struck);
  sb.on('gzClawHit', struck);
  sb.on('gzGrab', (e) => {
    const v = e.who;
    if (v.brain && v.alive && v.conscious) {
      v.brain.emo.bump('fear', 1);
      v.brain.speak('gzGrabbed', {}, 1, null, true);
    }
    witnesses(sb, e, (B) => {
      terror(B, e.by, 0.9);
      B.speak('sawGzGrab', { victim: v.name, other: e.by.name }, 0.9, null, true);
    });
  });
  sb.on('gzCharge', (e) => witnesses(sb, e, (B) => {
    terror(B, e.who, 0.7);
    B.speak('sawGzBreath', { other: e.who.name }, 0.6, null, true);
  }));
  sb.on('gzBurn', (e) => witnesses(sb, e, (B) => {
    terror(B, e.by, 0.6);
    B.speak('sawGzBurn', { victim: e.who.name, other: e.by.name }, 0.6, null, true);
  }));
  sb.on('gzWreck', (e) => witnesses(sb, e, (B) => {
    terror(B, e.who, 0.6);
    B.speak('sawGzWreck', { other: e.who.name }, 0.7, null, true);
  }));
  sb.on('gzStep', (e) => {
    if (e.k < 0.5) return;
    hearers(sb, e, 9, (B, p, d) => { if (d > 2) B.speak('gzStomped', {}, 0.35, null, true); });
  });
  sb.on('gzDeath', (e) => hearers(sb, e, 40, (B) => {
    B.emo.bump('fear', -0.5);
    B.emo.bump('surprise', 0.5);
    B.emo.bump('joy', 0.3);
    B.speak(e.frozen ? 'shinFrozen' : 'gzDown', {}, 0.6, null, true);
  }));
  // Shin Godzilla's light: the plates going purple, the beams, whoever they go through
  sb.on('shinCharge', (e) => witnesses(sb, e, (B) => {
    terror(B, e.who, 0.7);
    B.speak(e.dorsal ? 'sawShinDorsal' : e.tail ? 'sawShinTail' : 'sawShinGlow', { other: e.who.name }, 0.6, null, true);
  }));
  sb.on('shinBeam', (e) => witnesses(sb, e, (B) => {
    terror(B, e.who, 1);
    B.speak('sawShinBeam', { other: e.who.name }, 0.7, null, true);
  }));
  sb.on('shinDorsal', (e) => witnesses(sb, e, (B) => {
    terror(B, e.who, 1.1);
    B.speak('sawShinDorsal', { other: e.who.name }, 0.8, null, true);
  }));
  sb.on('shinBeamHit', (e) => witnesses(sb, e, (B) => {
    terror(B, e.by, 0.8);
    B.speak('sawShinBurn', { victim: e.who.name, other: e.by.name }, 0.5, null, true);
  }));
  // the breath, coming: the smog, the fire, the light drawn in
  const breath = (say, k, p) => (e) => witnesses(sb, e, (B) => {
    terror(B, e.who, k);
    B.speak(say, { other: e.who.name }, p, null, true);
  });
  sb.on('shinSmog', breath('sawShinSmog', 0.6, 0.6));
  sb.on('shinIgnite', breath('sawShinFire', 0.9, 0.7));
  sb.on('shinBuild', breath('sawShinBuild', 0.9, 0.6));
  // his gills; his changing - and what he changes into
  sb.on('shinGills', breath('sawShinGills', 0.4, 0.5));
  sb.on('shinChanging', breath('sawShinChange', 0.5, 0.7));
  sb.on('shinEvolve', (e) => {
    hearers(sb, e, 40, (B) => { B.emo.bump('surprise', 0.5); B.heard = { x: e.x, y: 4, t: sb.time }; });
    witnesses(sb, e, (B) => {
      terror(B, e.who, 1);
      B.speak(e.form === 3 ? 'sawShinStand' : 'sawShinGrown', { other: e.who.name }, 0.8, null, true);
    });
  });
}
