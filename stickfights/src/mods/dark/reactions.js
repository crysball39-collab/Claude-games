/* =============================================================================
   THINGS IN THE DARK - what everybody makes of it, and what they learn.

   The first time the lights go, nobody knows what it means - the nervous
   get into a wardrobe anyway, the rest stand about asking. Once something
   has come through (and they have lived), they know: the lights go, they
   hide. Once they have seen the Rattle come back, they know that too, and
   stay hidden until it is really over. And the Listener: whoever sees it
   kill knows it found them by ear.
   ========================================================================== */
import { addMemoryKind } from '../../game/brain.js';
import { MOD } from './common.js';
import { knows } from './wardrobe.js';
import { chance } from '../../core/util.js';

// [weight, how bad, how they think of it, how they tell it]
addMemoryKind('sawRushTake', [1, -1,
  (m) => `${m.who.name} was out in the open when the lights went. Something came through, and ${m.who.name} was gone`,
  (m) => `was taken by something that came through when the lights went`]);
addMemoryKind('sawListenerKill', [1, -1,
  (m) => `${m.who.name} heard ${m.about ? m.about.name : 'somebody'}, and crushed them`,
  (m) => `crushed ${m.about ? m.about.name : 'somebody'}`]);

/** Everybody awake with a mind, who is not one of the mod's own. */
function everyone(sb, fn) {
  for (const p of sb.people) {
    if (!p.brain || p.removed || !p.alive || !p.conscious || (p.species && p.species.mod === MOD)) continue;
    fn(p.brain, p);
  }
}

/** Whoever could see where it happened. */
function witnesses(sb, e, fn) {
  everyone(sb, (B, p) => {
    if (p === e.who || p.hiddenIn) return;
    if (B.canSee(e.x, e.y) || (e.who && !e.who.removed && B.sees(e.who))) fn(B, p);
  });
}

export function setupReactions(sb) {
  // the lights going: a fright, and - for whoever knows - the word to hide
  sb.on('rushWarn', (e) => everyone(sb, (B, p) => {
    const K = knows(B), T = B.traits;
    // it came through before and it is coming again: it comes back
    if (e.pass > 0 && K.sawPass) K.rebound = true;
    B.emo.bump('surprise', 0.5);
    B.emo.bump('fear', (K.rush ? 0.55 : 0.25) * (1.25 - T.bravery));
    B.thinkT = Math.min(B.thinkT, 0.05);
    // (somewhere to hide, for whoever knows to: a wardrobe with room in it)
    const room = sb.items.some((it) => it.mod === MOD && it.kind === 'wardrobe' && !it.removed && !it.full);
    if (p.hiddenIn) B.speak('inWardrobe', {}, 0.7);
    else if (e.pass > 0 && K.rebound) B.speak(room ? 'rushBack' : 'rushNowhere', {}, 0.85, null, true);
    else if (K.rush) B.speak(room ? 'rushKnow' : 'rushNowhere', {}, 0.85, null, true);
    else B.speak('rushLights', {}, 0.6);
    B.note(K.rush ? 'The lights are going. It is coming.' : 'Something is wrong with the lights.');
  }));
  // whoever lived through a pass knows what the lights mean now
  sb.on('rushPassed', (e) => everyone(sb, (B, p) => {
    const K = knows(B);
    K.rush = true;
    K.sawPass = true;
    if (!e.more && !p.hiddenIn && chance(0.5)) B.speak('rushAfter', {}, 0.7);
  }));
  sb.on('rushGone', () => everyone(sb, (B) => { const K = knows(B); K.sawPass = false; }));
  // somebody taken
  sb.on('rushHit', (e) => {
    if (e.survived) return;
    witnesses(sb, e, (B) => {
      const K = knows(B), T = B.traits;
      K.rush = true;
      B.emo.bump('fear', 0.45 * (1.25 - T.bravery));
      B.emo.bump('surprise', 0.8);
      B.shaken(0.5);
      if (e.who && !e.who.removed) B.remember('sawRushTake', e.who);
      B.speak('sawRushKill', { victim: e.who ? e.who.name : 'them' }, 0.75, null, true);
    });
  });
  // in and out of the wardrobes
  sb.on('wardrobeIn', (e) => {
    const B = e.who && e.who.brain;
    if (B && chance(0.5)) B.speak('inWardrobe', {}, 0.8);
  });
  sb.on('wardrobeOut', (e) => {
    const B = e.who && e.who.brain;
    if (B && chance(0.6)) B.speak('outWardrobe', {}, 0.7);
  });
  sb.on('wardrobeTorn', (e) => witnesses(sb, e, (B) => {
    B.emo.bump('fear', 0.4 * (1.25 - B.traits.bravery));
    B.speak('sawWardrobeTorn', { victim: e.who ? e.who.name : 'somebody' }, 0.8, null, true);
  }));
  // the Listener
  sb.on('lsCharge', (e) => witnesses(sb, e, (B, p) => {
    if (p === e.who) return;
    const r = e.who ? B.rel(e.who) : null;
    if (e.who && (r.like > 0.2 || chance(0.4))) B.speak('sawListenerHunt', { victim: e.who.name }, 0.7, null, true);
  }));
  sb.on('lsKill', (e) => witnesses(sb, e, (B) => {
    const K = knows(B), T = B.traits;
    K.listener = true;
    B.emo.bump('fear', 0.5 * (1.25 - T.bravery));
    B.emo.bump('surprise', 0.7);
    B.shaken(0.55);
    if (e.by && !e.by.removed) B.remember('sawListenerKill', e.by, e.who);
    B.speak('sawListenerKill', { victim: e.who ? e.who.name : 'them' }, 0.75);
  }));
  sb.on('lsClick', (e) => everyone(sb, (B, p) => {
    const d = Math.abs(p.pos.x - e.x);
    if (d > 7) return;
    // a clicking close behind them: they turn round to see what is making it
    if (e.who && !B.sees(e.who) && !p.hiddenIn) B.hearLoud(e.x);
    else if (chance(0.04)) B.speak('listenerClicks', {}, 0.6);
  }));
}
