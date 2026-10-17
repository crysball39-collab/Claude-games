/* =============================================================================
   Five emotions, each 0..1: joy, sadness, anger, fear and surprise.

   Events push them up (see brain.js for what does what). Left alone, each one
   drifts back to a resting level that depends on who you are: a hot-headed
   person rests a little angrier, a timid one a little more afraid, a chatty
   one a little happier. They also settle at different speeds: surprise is
   gone in a second or two, fear in half a minute, anger slower if you hold
   grudges, and sadness slowest of all.

   Pushes get smaller as an emotion gets stronger, so nobody is pinned at the
   top by a run of small things - but a big enough thing still gets there.

   Any of them can be locked (from the inspector): then nothing moves it, up
   or down, until it is unlocked - only set() does, which is how dragging a
   locked bar changes where it is locked.
   ========================================================================== */
import { clamp01, approach } from '../core/util.js';

export const EMOTIONS = ['joy', 'sadness', 'anger', 'fear', 'surprise'];

export class Emotions {
  constructor(t) {
    this.v = {};
    this.locked = {};
    this.retune(t);
    for (const e of EMOTIONS) this.v[e] = this.base[e];
  }

  /** Holds a feeling where it is (or lets it go again). */
  lock(e, on = true) {
    if (!(e in this.base)) return;
    if (on) this.locked[e] = true;
    else delete this.locked[e];
  }

  isLocked(e) { return !!this.locked[e]; }

  /** Puts a feeling at v, locked or not. */
  set(e, v) { if (e in this.base) this.v[e] = clamp01(v); }

  /** Where each emotion rests and how fast it gets back there, from who they are. */
  retune(t) {
    this.base = {
      joy: 0.22 + t.sociability * 0.12 + (1 - t.temper) * 0.06,
      sadness: 0.04,
      anger: 0.02 + t.temper * 0.07,
      fear: 0.02 + (1 - t.bravery) * 0.05,
      surprise: 0,
    };
    this.rate = {
      joy: 0.05,
      sadness: 0.016,
      anger: 0.05 - t.temper * 0.025,
      fear: 0.09 - (1 - t.bravery) * 0.04,
      surprise: 1.1,
    };
  }

  bump(e, amount) {
    if (amount > 0) this[e] = clamp01(this[e] + amount * (1 - this[e] * 0.45));
    else this[e] = clamp01(this[e] + amount);
  }

  update(dt) {
    for (const e of EMOTIONS) this[e] += (this.base[e] - this[e]) * approach(this.rate[e], dt);
  }

  /** Good minus bad, roughly -1..1. */
  get valence() { return this.joy - this.sadness - this.fear * 0.6 - this.anger * 0.35; }

  /** The strongest feeling worth naming, or 'calm'. */
  get dominant() {
    let best = 'calm', v = 0.32;
    for (const e of EMOTIONS) {
      const k = e === 'surprise' ? this[e] * 0.9 : e === 'joy' ? this[e] * 0.75 : this[e];
      if (k > v) { v = k; best = e; }
    }
    return best;
  }

  /** A word for how they feel, for the inspector. */
  get label() {
    const d = this.dominant, v = this[d] || 0;
    switch (d) {
      case 'joy': return v > 0.8 ? 'Overjoyed' : 'Happy';
      case 'sadness': return v > 0.75 ? 'Heartbroken' : 'Sad';
      case 'anger': return v > 0.75 ? 'Furious' : 'Angry';
      case 'fear': return v > 0.75 ? 'Terrified' : 'Scared';
      case 'surprise': return v > 0.7 ? 'Shocked' : 'Surprised';
      default: return 'Calm';
    }
  }
}

// joy, sadness, anger, fear and surprise read like plain numbers; writing one
// that is locked does nothing
for (const e of EMOTIONS) {
  Object.defineProperty(Emotions.prototype, e, {
    get() { return this.v[e]; },
    set(x) { if (!this.locked[e]) this.v[e] = x; },
  });
}
