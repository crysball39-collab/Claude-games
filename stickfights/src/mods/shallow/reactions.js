/* =============================================================================
   SHALLOW - what everybody makes of it: what they feel when they see each
   thing it does, what they say, and what they remember (and tell each
   other) about it afterwards.

   Above all they remember who it went into. Whoever saw it climb inside
   somebody - or was told about it by somebody they believe - knows that
   person is not that person any more, and keeps away (species.js, knowers).
   ========================================================================== */
import { addMemoryKind } from '../../game/brain.js';
import { clamp01 } from '../../core/util.js';
import { isShallow } from './common.js';

// [weight, how bad, how they think of it, how they tell it]
addMemoryKind('sawShallowOut', [0.95, -0.9,
  (m) => `Something tore its way out of ${m.about ? m.about.name : 'somebody'}. It was never them`,
  (m) => `came out of ${m.about ? m.about.name : 'somebody'}`]);
addMemoryKind('sawShallowKill', [1, -1,
  (m) => `${m.who.name} ${m.what || 'killed'} ${m.about ? m.about.name : 'somebody'}`,
  (m) => `${m.what || 'killed'} ${m.about ? m.about.name : 'somebody'}`]);
addMemoryKind('sawShallowTake', [1, -1,
  (m) => `${m.who.name} emptied ${m.about.name} out and climbed inside. That is not ${m.about.name} any more`,
  (m) => `is wearing ${m.about.name}`]);

/** Everybody awake who could see it happen, but the one it happened to and whoever did it. */
function witnesses(sb, e, fn) {
  for (const p of sb.people) {
    if (!p.brain || p.removed || !p.alive || !p.conscious || isShallow(p) || p === e.who || p === e.by) continue;
    const B = p.brain;
    const seen = B.canSee(e.x, e.y) || (e.who && !e.who.removed && B.sees(e.who));
    if (seen) fn(B, p);
  }
}

/** Afraid of it, as much as anybody can be of anything. */
function terror(B, it, k = 1) {
  const T = B.traits, E = B.emo;
  E.bump('surprise', 0.8 * k);
  E.bump('fear', 0.55 * k * (1.25 - T.bravery));
  B.shaken(0.6 * k);
  if (it && !it.removed) {
    const r = B.rel(it);
    r.met = true;
    r.fear = Math.max(r.fear, clamp01(0.95 * k * (1.3 - T.bravery)));
    r.violent = Math.max(r.violent, 3);
    r.like = -1;
  }
  B.react = Math.max(B.react, 0.25);
}

export function setupReactions(sb) {
  sb.on('shallowTwitch', (e) => witnesses(sb, e, (B) => {
    if (Math.abs(B.man.pos.x - e.x) > 6 || Math.random() > 0.35 + B.traits.curiosity * 0.4) return;
    B.emo.bump('surprise', 0.25);
    B.speak('sawShallowTwitch', { other: e.who.name }, 0.5, e.who);
  }));
  sb.on('shallowCrack', (e) => witnesses(sb, e, (B) => {
    B.emo.bump('surprise', 0.6);
    B.emo.bump('fear', 0.3 * (1.2 - B.traits.bravery));
    const r = B.rel(e.who);
    r.fear = Math.max(r.fear, 0.35);
    B.speak('sawShallowCrack', { other: e.who.name }, 0.9, null, true);
    B.note(`Something is wrong with ${e.who.name}.`);
  }));
  sb.on('shallowEmerge', (e) => witnesses(sb, e, (B) => {
    terror(B, e.who, 1);
    B.speak('sawShallowOut', { victim: e.name, other: e.who.name }, 1, null, true);
    B.remember('sawShallowOut', e.who, e.from);
    B.note(`It came out of ${e.name}. ${e.name} was never real.`);
  }));
  const killed = (verb, say) => (e) => witnesses(sb, e, (B) => {
    const it = e.by, v = e.who;
    terror(B, it, 1.1);
    const rv = B.rels.get(v);
    if (rv && rv.like > 0.35) B.emo.bump('sadness', 0.5 * (0.5 + B.traits.empathy));
    B.speak(say, { victim: v.name, other: it.name }, 1, null, true);
    B.remember('sawShallowKill', it, v, verb);
    B.note(`It ${verb} ${v.name}.`);
    // somebody they cared about: the brave ones will not let that go
    if (rv && rv.like > 0.3 && B.traits.bravery > 0.55) {
      const r = B.rel(it);
      r.killed = v;
      r.anger = Math.max(r.anger, 0.5 + B.traits.aggression * 0.4);
    }
  });
  sb.on('shallowRip', killed('tore apart', 'sawShallowRip'));
  sb.on('shallowEat', killed('ate', 'sawShallowEat'));
  sb.on('shallowHollow', (e) => witnesses(sb, e, (B) => {
    terror(B, e.by, 1);
    B.speak('sawShallowHollow', { victim: e.who.name, other: e.by.name }, 1, null, true);
    B.note(`It is cutting ${e.who.name} open.`);
  }));
  sb.on('shallowTook', (e) => witnesses(sb, e, (B) => {
    const v = e.who;
    // they know: whatever it looks like, whatever it says
    const r = B.rel(v);
    r.shallow = true;
    r.fear = Math.max(r.fear, clamp01(0.95 * (1.3 - B.traits.bravery)));
    r.like = -1;
    r.violent = Math.max(r.violent, 3);
    B.emo.bump('fear', 0.5 * (1.25 - B.traits.bravery));
    B.emo.bump('surprise', 0.7);
    B.shaken(0.5);
    B.speak('sawShallowTake', { victim: v.name, other: e.by.name }, 1, null, true);
    B.remember('sawShallowTake', e.by, v);
    B.note(`It climbed inside ${v.name}. That is not ${v.name} any more.`);
  }));
  sb.on('shallowRegrow', (e) => witnesses(sb, e, (B) => {
    B.emo.bump('fear', 0.25 * (1.2 - B.traits.bravery));
    B.emo.bump('surprise', 0.5);
    B.speak('sawShallowRegrow', { other: e.who.name }, 0.8, null, true);
  }));
  sb.on('shallowDied', (e) => witnesses(sb, e, (B) => {
    B.emo.bump('fear', -0.3);
    B.emo.bump('surprise', 0.4);
    B.speak('shallowDead', {}, 0.7, null, true);
  }));
}
