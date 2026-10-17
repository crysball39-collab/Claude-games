/* =============================================================================
   MURDER DRONES - how a disassembly drone fights.

   It picks its hands for the distance: up close, a sword, claws or a
   chainsaw (which, depends on who it is - V likes the chainsaw, N the
   claws); further off, a gun, a laser or the missiles - unless it would
   rather just fly at them, which V usually would. Close in, it slashes and
   chops and saws, and now and then the tail comes over the shoulder. At a
   distance it holds its ground and shoots. The inspector can lock its hands
   to one thing, and then that is what it uses.

   Its brain is a stickman's brain (game/brain.js), with this as its
   species' fight hook; worker drones fight like anybody (Uzi with her
   railgun, which is a gun like any other to the game).

   And when there is nothing to fight, a drone with nothing to do may change
   a hand into something, just to look at it.
   ========================================================================== */
import { Behaviour, KINDS } from '../../game/behaviours.js';
import { rand, chance, pick, clamp } from '../../core/util.js';
import { DISASSEMBLY, FORMS, MELEE, RANGED, REACH, STRIKES, morph, swoop, tailStab } from './species.js';

/** The hands for this fight, at this distance. */
function pickForm(beh, me, d) {
  const md = me.md, prefs = me.look.prefs || { melee: ['claw', 'sword', 'chainsaw'], ranged: ['gunArm', 'laser', 'missile'], swoop: 0.5 };
  const now = me.sandbox.time;
  const cur = md.form;
  // changing too often looks silly: once a form is out it stays a few seconds
  if (cur && now - md.lastMorph < 4) return cur;
  // how they mean to go about it: fly at them, or stand off and shoot - and
  // every so often, a change of plan (and of hands)
  if (beh.dstyle === undefined || (now - (beh.styleT ?? -99) > 6 && chance(0.35))) {
    beh.dstyle = chance(prefs.swoop) ? 'swoop' : 'ranged';
    beh.styleT = now;
    beh.fresh = true;
  }
  const fav = (list) => (chance(0.6) ? list[0] : pick(list));
  const fresh = beh.fresh;
  beh.fresh = false;
  if (d > 3.2 && beh.dstyle === 'ranged') return RANGED.has(cur) && !fresh ? cur : fav(prefs.ranged);
  return MELEE.has(cur) && !fresh ? cur : fav(prefs.melee);
}

function meleeFight(beh, dt, o, d, dir, r) {
  const me = beh.me, b = beh.brain, T = b.traits, md = me.md, now = beh.now;
  const reach = REACH[md.form] * me.scale;
  // too far to walk: fly at them
  if (d > 5.5 && me.ready && me.look.wings && now - md.swoopT > 2.5 && b.sees(o)) {
    swoop(me, o);
    return true;
  }
  me.setPosture('guard');
  if (d > reach + 0.1) me.goTo(o.pos.x - dir * reach * 0.92, d > 2.5 ? 'run' : 'walk', { face: o.pos.x });
  else if (d < 0.55 * me.scale) me.goTo(me.pos.x - dir * 0.45, 'shuffle', { backpedal: true, face: o.pos.x });
  else { me.stop(); me.faceTo(o.pos.x); }
  if (!me.acting) beh.cool -= dt;
  if (beh.cool <= 0 && (me.ready || me.canCounter) && d < reach + 0.2 && me.facing === dir) {
    const can = me.strikes();
    const choices = STRIKES[md.form].filter(([k]) => can.includes(k));
    if (can.includes('kick')) choices.push(['kick', 1]);
    if (choices.length) {
      let total = 0;
      for (const c of choices) total += c[1];
      let x = Math.random() * total, kind = choices[0][0];
      for (const c of choices) { x -= c[1]; if (x <= 0) { kind = c[0]; break; } }
      me.attack(kind, o);
      const pace = 1.25 - T.aggression * 0.45 - b.emo.anger * 0.25 - T.skill * 0.15;
      beh.cool = rand(0.35, 0.9) * Math.max(0.45, pace);
    } else beh.cool = 0.6;
  }
  return null;
}

function rangedFight(beh, dt, o, d, dir, r) {
  const me = beh.me, b = beh.brain, md = me.md;
  if (me.posture === 'guard') me.setPosture(null);
  me.lookAt = o.wj.head;
  const want = md.form === 'missile' ? 6.5 : 5;
  const seen = b.sees(o);
  if (d < 2.4) me.goTo(me.pos.x - dir * 2.6, 'walk', { backpedal: true, face: o.pos.x });
  else if (d > 11 || !seen) me.goTo(o.pos.x - dir * want, 'run', { face: o.pos.x });
  else { me.stop(); me.faceTo(o.pos.x); }
  if (!seen) { me.lowerGun(); return null; }
  me.aimAt(o);
  if (!me.acting) beh.cool -= dt;
  if (beh.cool <= 0 && me.steady > 0.45) {
    if (me.fire()) {
      beh.shots = (beh.shots || 0) + 1;
      beh.cool = md.form === 'gunArm' ? (beh.shots % 5 ? 0.09 : rand(0.6, 1.1)) : rand(0.5, 0.9);
    }
  }
  return null;
}

/**
 * The species' fight hook. Returns true or false (it handled this step: go on,
 * or stop), or undefined to leave the fight to the ordinary code.
 */
DISASSEMBLY.fight = function fight(beh, dt, o, d, dir, r) {
  const me = beh.me, md = me.md, b = beh.brain;
  if (!md) return undefined;
  if (me.state === 'air') { me.lookAt = o.wj.head; return true; }
  if (me.state !== 'stand') return true;
  const lock = md.formLock;
  const want = lock === 'hands' ? null : lock || pickForm(beh, me, d);
  if (want !== md.form && !md.morphing) morph(me, want);
  if (md.morphing) { me.stop(); me.faceTo(o.pos.x); me.lookAt = o.wj.head; return true; }
  if (!md.form) return undefined;
  // up close, now and then, the tail
  if (d < 1.55 * me.scale && me.look.tail && md.tail && md.tail.phase === 'idle' && beh.now - md.tailCool > 3.2 && chance(dt * 1.1)) tailStab(me, o);
  if (md.tail && md.tail.phase !== 'idle') { me.stop(); me.faceTo(o.pos.x); return true; }
  const res = RANGED.has(md.form) ? rangedFight(beh, dt, o, d, dir, r) : meleeFight(beh, dt, o, d, dir, r);
  if (res !== null) return res;
  // calmed down, and they are not coming at us: that will do
  if (r.anger < 0.12 && !b.isHostile(o) && beh.t > 3 && !(b.ordered && b.ordered.target === o)) return false;
  return true;
};

/* ----------------------------- with nothing to do --------------------------- */

/** Turns a hand into something and has a look at it, then lets it go back. */
class ShowOff extends Behaviour {
  get kind() { return 'showoff'; }
  get label() { return 'Showing off ' + (this.form ? 'a new pair of hands' : 'their hands'); }
  get icon() { return 'exclaim'; }
  start() {
    const me = this.me;
    this.form = pick(FORMS.filter((f) => f !== me.md.form));
    this.looked = false;
    me.stop();
    morph(me, this.form);
  }
  update(dt) {
    this.t += dt;
    const me = this.me, md = me.md;
    if (!md || this.t > 6) return false;
    if (md.form === this.form && !md.morphing && md.formT >= 1 && !this.looked && me.ready) {
      this.looked = true;
      me.perform('showOff');
      this.brain.speak('morph', { what: this.form === 'gunArm' ? 'gun' : this.form }, 0.7);
    }
    return !(this.looked && me.ready && this.t > 2.6);
  }
}
KINDS.showoff = ShowOff;

DISASSEMBLY.consider = function consider(brain, add, ctx) {
  const me = brain.man, md = me.md, E = brain.emo, T = brain.traits;
  if (!md || md.formLock || ctx.threat || ctx.calm < 0.8 || E.fear > 0.3) return;
  const fresh = clamp((brain.sb.time - md.lastMorph - 15) / 30, 0, 1);
  add('showoff', null, (0.03 + brain.boredom * 0.12) * (0.5 + T.curiosity * 0.6) * fresh * ctx.calm, 'I wonder what my hands can turn into today.');
};
