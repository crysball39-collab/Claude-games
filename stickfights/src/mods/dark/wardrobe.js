/* =============================================================================
   THINGS IN THE DARK - the wardrobe: somewhere to hide.

   A tall old wardrobe, room in it for two. Whoever is inside with the doors
   shut is out of sight and out of reach: the Grasp and the Rattle go past it
   (it rattles on its feet), and the Listener cannot see in - but it can hear,
   and right up against the doors it can hear somebody breathing too hard.

   People get into one when something is coming through (if they know what
   the lights going means, or are frightened enough without knowing), or
   when the Listener is about and the wardrobe is nearer than it is - and
   they come out when it is quiet again. Whoever has seen the Rattle come
   back waits a good deal longer.
   ========================================================================== */
import { Behaviour, addBehaviour } from '../../game/behaviours.js';
import { addConsider } from '../../game/brain.js';
import { isInstalled } from '../registry.js';
import { MOD } from './common.js';
import { rushers } from './rush.js';
import { drawWardrobe } from './look.js';
import { clamp01, rand } from '../../core/util.js';

export class Wardrobe {
  constructor(sb, x) {
    this.mod = MOD;
    this.kind = 'wardrobe';
    this.name = 'Wardrobe';
    this.sandbox = sb;
    this.removed = false;
    this.behind = true;
    this.grabbable = false;
    this.pos = { x, y: 0 };
    this.w = 1.0;
    this.h = 2.1;
    this.cap = 2;
    this.inside = [];
    this.open = 0;
    this.openT = 0;
    this.shake = 0;
    this.broken = false;
    this.t = rand(0, 10);
  }
  get loose() { return false; }
  contains(x, y, r = 0) {
    const p = this.pos;
    return x > p.x - this.w / 2 - r && x < p.x + this.w / 2 + r && y > p.y - r && y < p.y + this.h + r;
  }
  /** No room left in it (or no doors left on it). */
  get full() { return this.broken || this.inside.length >= this.cap; }
  /** Where what is said inside it comes out. */
  bubbleAt() { return { x: this.pos.x, y: this.pos.y + this.h + 0.12 }; }

  /** Somebody stepping in: the doors open for them, and shut behind them. */
  enter(p) {
    if (this.full || p.hiddenIn || p.removed || p.state !== 'stand') return false;
    p.stop();
    p.crouching = false;
    p.setPosture(null);
    p.hiddenIn = this;
    this.inside.push(p);
    this.openT = 0.4;
    this.sandbox.emit('wardrobeIn', { who: p, what: this, x: this.pos.x, y: 1.2, mod: MOD });
    return true;
  }
  /** Somebody stepping out again. */
  letOut(p) {
    if (p.hiddenIn !== this) return;
    p.hiddenIn = null;
    this.inside = this.inside.filter((q) => q !== p);
    this.openT = 0.4;
    if (!p.removed) this.sandbox.emit('wardrobeOut', { who: p, what: this, x: this.pos.x, y: 1.2, mod: MOD });
  }
  /** Taken out of the world: whoever was in it is out. */
  leave() {
    for (const p of this.inside) if (p.hiddenIn === this) p.hiddenIn = null;
    this.inside = [];
  }
  /** Something going past: it shakes on its feet. */
  rattle(k) {
    if (k > this.shake + 0.2 && this.inside.length) this.sandbox.emit('wardrobeRattle', { what: this, x: this.pos.x, y: 1.2, mod: MOD });
    this.shake = Math.max(this.shake, k);
  }
  /** The doors torn off it (the Listener): nobody is hidden in it any more. */
  tearOpen(by) {
    if (this.broken) return;
    this.broken = true;
    this.open = 1;
    const out = [...this.inside];
    for (const p of out) this.letOut(p);
    this.sandbox.emit('wardrobeTorn', { what: this, by, who: out[0] || null, x: this.pos.x, y: 1.2, loud: true, mod: MOD });
    return out;
  }

  update(dt) {
    this.t += dt;
    this.openT -= dt;
    const goal = this.broken || this.openT > 0 ? 1 : 0;
    this.open += (goal - this.open) * Math.min(1, dt * 10);
    this.shake = Math.max(0, this.shake - dt * 1.4);
    for (const p of [...this.inside]) {
      // gone, killed, knocked off their feet in there (a blast): out of it
      if (p.removed || p.hiddenIn !== this) { this.inside = this.inside.filter((q) => q !== p); continue; }
      if (p.dead || p.state !== 'stand') { this.letOut(p); continue; }
      p.stop();
    }
  }

  draw(ctx) { drawWardrobe(ctx, this); }
}

export function spawnWardrobe(sb, x) {
  x = Math.max(sb.left + 0.7, Math.min(sb.right - 0.7, x));
  return sb.addItem(new Wardrobe(sb, x));
}

/* ------------------------------ what people make of it ------------------------------ */

/** What somebody knows about all this: that the lights going means hide, and that the Rattle comes back. */
export const knows = (B) => B.dark || (B.dark = { rush: false, rebound: false, listener: false });

/** The Listener nearest x, within d of it. */
export function listenerNear(sb, x, d) {
  let best = null, bd = d;
  for (const p of sb.people) {
    if (p.removed || p.dead || !p.species || p.species.mod !== MOD || !p.species.blind) continue;
    const dd = Math.abs(p.pos.x - x);
    if (dd < bd) { bd = dd; best = p; }
  }
  return best;
}

/** What there is to hide from right now, for somebody: something coming through, or the Listener close. */
export function danger(B) {
  const me = B.man, sb = me.sandbox, K = knows(B);
  for (const r of rushers(sb)) {
    if (r.coming) return { kind: 'rush', r };
    // (between its passes it is quiet - which only means something to whoever has seen it come back)
    if (r.phase === 'gap' && K.rebound) return { kind: 'rush', r };
  }
  const L = listenerNear(sb, me.pos.x, 9);
  if (L) return { kind: 'listener', L };
  return null;
}

/** The nearest wardrobe with room that they can get into before `eta` runs out (and how far it is). */
function wardrobeFor(me, eta = Infinity, away = null) {
  const sb = me.sandbox;
  let best = null, bd = Infinity;
  for (const it of sb.items) {
    if (!(it instanceof Wardrobe) || it.removed || it.full) continue;
    const d = Math.abs(it.pos.x - me.pos.x);
    // (not past whatever they are getting away from)
    if (away && Math.sign(it.pos.x - me.pos.x) === Math.sign(away.pos.x - me.pos.x) && Math.abs(away.pos.x - me.pos.x) < d + 1.5) continue;
    if (d / 3.6 + 0.5 > eta) continue;
    if (d < bd) { bd = d; best = it; }
  }
  return best ? { w: best, d: bd } : null;
}

function arrive(me, x, speed, tol = 0.15) {
  if (Math.abs(me.pos.x - x) <= tol) { me.stop(); return true; }
  me.goTo(x, speed);
  return false;
}

/** Into a wardrobe, and staying in it - quiet - until it is over. */
export class HideIn extends Behaviour {
  get kind() { return 'hideIn'; }
  get label() { return this.me.hiddenIn ? 'Hiding in a wardrobe' : 'Making for a wardrobe'; }
  get icon() { return 'crate'; }
  start() {
    this.why = this.o.why || 'rush';
    this.quiet = 0;
    if (!this.me.hiddenIn) this.brain.speak(this.why === 'rush' ? 'hideInNow' : 'hideInQuiet', {}, 0.8, null, this.why === 'rush');
  }
  update(dt) {
    this.t += dt;
    const me = this.me, w = this.target, B = this.brain;
    if (!w || w.removed) return false;
    if (me.hiddenIn !== w) {
      if (me.hiddenIn || w.full || this.t > 12) return false;
      // (from the Listener: creeping, unless it is already coming)
      const L = this.why === 'listener' ? listenerNear(this.sb, me.pos.x, 12) : null;
      const sneak = L && !(L.species.hunting && L.species.hunting(L) === me);
      if (!arrive(me, w.pos.x, sneak ? 'sneak' : 'flee')) return true;
      return w.enter(me);
    }
    // inside: still, and quiet, until whatever it was is over (longer, for whoever knows it comes back)
    me.stop();
    const d = danger(B);
    this.quiet = d ? 0 : this.quiet + dt;
    const wait = (knows(B).rebound ? 3.5 : 1.4) + B.emo.fear * 1.5;
    if (this.quiet > wait) { w.letOut(me); return false; }
    return this.t < 120;
  }
  end() {
    const w = this.target;
    if (w && this.me.hiddenIn === w) w.letOut(this.me);
  }
}
addBehaviour('hideIn', HideIn);

/**
 * What everybody considers, while the mod is in: into a wardrobe when
 * something is coming through, or when the Listener is close and a wardrobe
 * is closer; and, inside one, staying there.
 */
addConsider((B, add) => {
  const me = B.man, sb = me.sandbox;
  if (!isInstalled(MOD) || (me.species && me.species.mod === MOD)) return;
  const E = B.emo, T = B.traits, K = knows(B), brave = B.brave;
  const d = danger(B);
  // already in one: staying there, while there is anything at all to hide from
  if (me.hiddenIn && me.hiddenIn.mod === MOD) {
    add('hideIn', me.hiddenIn, d ? 5 : 0.9, d ? 'Stay in here. Stay quiet.' : 'Is it over?', { why: d ? d.kind : 'rush' }, !!d);
    return;
  }
  if (!d || me.state !== 'stand') return;
  if (d.kind === 'rush') {
    const r = d.r, eta = r.etaAt(me.pos.x);
    if (eta === Infinity) return;
    // whoever knows what the lights mean; and the frightened, the timid, the careful, without knowing -
    // more of them the louder it gets
    const louder = r.phase === 'warn' ? clamp01(r.t / r.warnFor) : 1;
    const instinct = K.rush ? 1 : clamp01((E.fear - 0.2) * 2 + (0.55 - T.bravery) * 1.2 + louder * 0.25);
    if (instinct < 0.15) return;
    const spot = wardrobeFor(me, eta);
    if (spot) add('hideIn', spot.w, (K.rush ? 4 : 1.2) * instinct, K.rush ? `${r.name} is coming. Get in the wardrobe!` : "I don't like this. In there - now.", { why: 'rush' }, true);
    // nowhere to go: hands over the head, and hope
    else if (K.rush && eta < 2.5) add('cower', null, 1.4, "There's nowhere to hide...", { cover: 'head', dur: 3 }, true);
    return;
  }
  // the Listener: a wardrobe nearer than it is, and not past it
  const L = d.L, dl = Math.abs(L.pos.x - me.pos.x);
  if (B.sees(L) || dl < 4) {
    const spot = wardrobeFor(me, Infinity, L);
    if (spot && spot.d < Math.min(6, dl + 1)) {
      const coming = L.species.hunting && L.species.hunting(L) === me;
      add('hideIn', spot.w, (0.9 + E.fear * 0.9) * (1.3 - brave * 0.6) * (coming ? 1.3 : 1), coming ? 'In the wardrobe - NOW!' : 'The wardrobe. Quietly.', { why: 'listener' }, true);
    }
  }
});
