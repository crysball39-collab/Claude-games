/* =============================================================================
   MINECRAFT - Steve.

   A blocky man from a blocky world: calm, brave, curious, a man of few
   words. He keeps his own kit and never needs anyone else's:

     a diamond sword   long, sharp, it hacks: his hand for anything close
     a bow             for anything far off, or up out of reach: he draws it
                       back, takes a moment to aim, and lets go. The arrows
                       drop as they fly, and stay in whatever they hit
     golden apples     three of them. Hurt, or withering, he eats one: it
                       mends him, and keeps mending him for a few seconds

   Monsters he fights on sight - the Wither most of all, with the bow while
   it is up in the air and the sword once it comes down in its armour (the
   armour sends arrows straight back off it). People he is friendly with.

   Everything of his lives in man.mc: { form: 'sword' | 'bow', draw,
   drawing, apples, eating, lock }.
   ========================================================================== */
import { defineArm } from '../../game/props.js';
import { Behaviour, KINDS } from '../../game/behaviours.js';
import { lerp, rand, DEG } from '../../core/util.js';
import { steveSkin } from './look.js';
import { MOD, Arrow, Regeneration, sparkles, puffs } from './effects.js';
import { STEVE_LINES } from './lines.js';
import './clips.js';

defineArm('diamondSword', {
  name: 'Diamond sword', noun: 'diamond sword', wound: 'Sword', cause: 'a diamond sword', blade: true, sharp: 1, mult: 1.55, deep: ['stab', 'chop'],
  chop: true, gash: 1, sever: 0.9, shove: 0.9, spray: 1.2, scary: 0.5, fear: 'mcSwordFear', nasty: 2.6, memory: 'choppedMe',
  hurt: 'mcSwordHit', seen: 'mcSawSword', verb: 'cut me with a diamond sword', power: 2.4, r: 0.05,
});
defineArm('bow', { name: 'Bow', noun: 'bow', scary: 0.4, fear: 'mcBowFear', power: 2.1 });
defineArm('arrow', {
  name: 'Arrow', noun: 'arrow', wound: 'Arrow', cause: 'an arrow', shot: true, instakill: false, sharp: 1, shove: 0.5, spray: 1, nasty: 2.6,
  memory: 'shotMe', hurt: 'mcArrowHit', seen: 'mcSawArrow', verb: 'shot me with an arrow', power: 2,
});

const SWORD = 'diamondSword';
const STRIKES = [['slash', 5], ['chop', 4], ['stab', 2]];
const REACH = 1.12;
const ARROW_G = 13;
const DRAW_TIME = 0.85;

/* ------------------------------- what he does ------------------------------- */

/** Sword away, bow out, or the other way. */
export function swap(man, form) {
  const mc = man.mc;
  if (!mc || mc.form === form || mc.swapping) return false;
  if (!man.ready) { mc.want = form; return false; }
  mc.swapping = form;
  mc.drawing = false;
  mc.draw = 0;
  man.anim.act('mcSwap', { fadeIn: 0.05, fadeOut: 0.1 });
  return true;
}

function finishSwap(man) {
  const mc = man.mc;
  if (!mc.swapping) return;
  mc.form = mc.swapping;
  mc.swapping = null;
  man.innate = mc.form === 'bow' ? 'bow' : SWORD;
  man.sandbox.emit('mcSwap', { who: man, form: mc.form, x: man.wj.handA.x, y: man.wj.handA.y });
  if (man.brain) man.brain.speak(mc.form === 'bow' ? 'bowSwap' : 'swordSwap', {}, 0.35);
}

/** A golden apple, eaten (if there is one, and he is not busy). */
export function eatApple(man) {
  const mc = man.mc;
  if (!mc || mc.apples <= 0 || mc.eating || !man.ready || man.dead) return false;
  mc.eating = { t: 0 };
  mc.drawing = false;
  man.lowerGun();
  man.stop();
  man.anim.act('mcEat', { fadeIn: 0.08, fadeOut: 0.15 });
  if (man.brain) man.brain.speak('eat', {}, 0.8, null, true);
  return true;
}

function ate(man) {
  const mc = man.mc;
  if (!mc.eating) return;
  mc.eating = null;
  mc.apples--;
  mc.appleT = man.sandbox.time;
  // a good part of it back at once, and the rest over the next few seconds
  const h = man.health;
  for (const p of Object.values(h.parts)) p.hp = Math.min(p.max, p.hp + p.max * 0.35);
  h.pain = Math.max(0, h.pain - 30);
  man.afflictions = man.afflictions.filter((a) => !(a instanceof Regeneration));
  man.afflictions.push(new Regeneration(7));
  sparkles(man.sandbox, man.wj.chest.x, man.wj.chest.y + 0.2, 8, 0.35);
  man.sandbox.emit('mcAte', { who: man, x: man.wj.head.x, y: man.wj.head.y });
  if (man.brain) man.brain.speak(mc.apples ? 'ate' : 'noApples', {}, 0.9, null, true);
}

/** Where to point the bow to hit (tx, ty) from (x, y), arrows going v: the flatter of the two arcs that get there. */
function lob(x, y, tx, ty, v) {
  const dx = Math.abs(tx - x), dy = ty - y, g = ARROW_G;
  const disc = v ** 4 - g * (g * dx * dx + 2 * dy * v * v);
  const a = disc < 0 ? 45 * DEG : Math.atan2(v * v - Math.sqrt(disc), g * dx);
  return { a, t: dx / Math.max(1, v * Math.cos(a)) };
}

/* --------------------------------- species ---------------------------------- */

export const STEVE = {
  mod: MOD,
  kind: 'steve',
  label: 'Minecraft Player',
  skin: steveSkin,
  power: 1.35,
  speed: 1.02,
  fall: 0.85,
  noPickup: true,

  init(man) {
    man.mc = { form: 'sword', draw: 0, drawing: false, apples: 3, appleT: -99, eating: null, lock: null, swapping: null, want: null, shotT: -99 };
    man.innate = SWORD;
    for (const p of Object.values(man.health.parts)) { p.max *= 1.15; p.hp = p.max; }
  },

  update(man, dt) {
    const mc = man.mc;
    if (!mc) return;
    if (mc.swapping && man.anim.actionName !== 'mcSwap') finishSwap(man);
    if (mc.eating) {
      mc.eating.t += dt;
      // knocked out of it, or it took too long: the apple is not eaten
      if (man.anim.actionName !== 'mcEat' && mc.eating.t > 0.2) mc.eating = null;
    }
    if (mc.want && man.ready && !mc.swapping) { const w = mc.want; mc.want = null; swap(man, w); }
    if (mc.lock && mc.lock !== mc.form && man.ready && !mc.swapping && !mc.eating) swap(man, mc.lock);
    // the bow: drawn back while it is held up at someone, let go of if they stop aiming
    if (mc.drawing) {
      if (!man.aiming || mc.form !== 'bow') { mc.drawing = false; mc.draw = 0; }
      else mc.draw = Math.min(1, mc.draw + dt / DRAW_TIME);
    }
    // nothing to shoot at for a while: the sword back out
    if (!mc.lock && mc.form === 'bow' && !man.aiming && man.sandbox.time - mc.shotT > 6 && man.ready && !(man.brain && man.brain.fighting)) swap(man, 'sword');
  },

  strikes(man, out) {
    const mc = man.mc;
    const legs = out.filter((k) => k === 'kick' || k === 'stomp');
    if (!mc || mc.form !== 'sword' || mc.swapping || !man.health.canUse('armA') || man.cut.armA || man.carrying || man.rag) return legs;
    return [...STRIKES.map((s) => s[0]), ...legs];
  },

  ranged(man) { const mc = man.mc; return !!mc && mc.form === 'bow' && !mc.swapping && !mc.eating; },
  canRange() { return true; },

  /** The bow: the first call starts drawing it, and once it is drawn the next one looses. */
  fire(man) {
    const mc = man.mc, sb = man.sandbox, now = sb.time;
    if (mc.form !== 'bow' || mc.swapping || now - mc.shotT < 0.35) return false;
    if (!mc.drawing) {
      mc.drawing = true;
      mc.draw = 0;
      sb.emit('bowDraw', { who: man, x: man.wj.handA.x, y: man.wj.handA.y });
      return false;
    }
    if (mc.draw < 1) return false;
    const h = man.wj.handA, tp = man.aimPoint();
    const v = 25;
    let a = man.gunAim || 0;
    let dir = man.facing;
    if (tp) {
      // lead them a little, and lob it enough to get there
      const t0 = man.aimTarget && man.aimTarget.vel ? man.aimTarget.vel : { x: 0 };
      const first = lob(h.x, h.y, tp.x, tp.y, v);
      const lead = (t0.x || 0) * first.t * 0.7;
      const shot = lob(h.x, h.y, tp.x + lead, tp.y, v);
      a = shot.a;
      dir = Math.sign(tp.x - h.x) || man.facing;
    }
    a += (Math.random() - 0.5) * man.spread() * 0.6;
    sb.effects.push(new Arrow(sb, man, h.x + dir * 0.12, h.y, dir * v * Math.cos(a), v * Math.sin(a), 1.4 + 1.2 * mc.draw));
    mc.drawing = false;
    mc.draw = 0;
    mc.shotT = now;
    man.lastShotT = now;
    man.recoil = 0.3;
    sb.emit('bowShoot', { who: man, x: h.x, y: h.y });
    return true;
  },

  bladePoints(man) {
    const j = man.wj, e = j.elbowA, h = j.handA;
    const d = Math.hypot(h.x - e.x, h.y - e.y) || 1;
    const ux = (h.x - e.x) / d, uy = (h.y - e.y) / d;
    const L = 0.8 * man.scale;
    const at = (k) => ({ x: h.x + ux * k * L, y: h.y + uy * k * L });
    const pts = [at(1), at(0.6), at(0.25)];
    return { tip: pts[0], mid: pts[1], pts, ux, uy };
  },

  /** The drawing hand comes back to the chest as the bow is drawn. */
  procedural(man, p) {
    const mc = man.mc;
    if (!mc || mc.form !== 'bow' || !man.aiming) return;
    const k = 0.25 + 0.75 * mc.draw;
    p.aBu = lerp(p.aBu, -40 * DEG + (man.gunAim || 0) * 0.6, k);
    p.aBl = lerp(p.aBl, 150 * DEG, k);
  },

  guardClip(man) { return man.mc && man.mc.form === 'sword' ? 'macheteGuard' : null; },

  animEvent(man, ev) {
    if (ev === 'swap') finishSwap(man);
    else if (ev === 'crunch') {
      man.sandbox.emit('mcCrunch', { who: man, x: man.wj.head.x, y: man.wj.head.y });
      puffs(man.sandbox, { x: man.wj.head.x + man.facing * 0.12, y: man.wj.head.y - 0.1, n: 3, speed: 0.6, size: 0.05, grow: -0.5, life: 0.4, colors: ['#fbe26a', '#e1b12c'] });
    } else if (ev === 'ate') ate(man);
  },

  canPickUp() { return false; },

  healed(man) { if (man.mc) { man.mc.apples = 3; man.mc.eating = null; } },

  /** Monsters he goes for; everyone else, he is pleased enough to meet. */
  meet(brain, o, r) {
    if (o.species && o.species.monster) {
      r.anger = Math.max(r.anger, o.species.kind === 'wither' ? 0.9 : 0.8);
      r.like = Math.min(r.like, -0.6);
      r.fear = Math.max(r.fear, 0.1);
      brain.speak(o.species.kind === 'wither' ? 'seeWither' : 'seeWitherSkeleton', { other: o.name }, 0.9, o, true);
    } else {
      r.like = Math.max(r.like, 0.1);
    }
  },

  /** Somebody else's first sight of him. */
  metBy(me, brain, r) {
    if (brain.man.species && brain.man.species.mod === MOD) return;
    brain.speak('seeSteve', { other: me.name }, 0.55, me);
  },

  consider(brain, add, ctx) {
    const me = brain.man, mc = me.mc;
    if (!mc) return;
    // a monster in sight: that is what the sword and the bow are for
    for (const o of brain.visible) {
      if (!o.species || !o.species.monster || o.dead || o.removed) continue;
      const d = Math.abs(o.pos.x - me.pos.x);
      add('fight', o, (0.75 + brain.traits.bravery * 0.4) * me.health.overall / (1 + Math.max(0, d - 10) / 8), `A ${o.species.label === 'Boss' ? 'boss' : 'monster'}. ${o.name}. Time to fight.`, null, d < 6);
    }
    if (mc.apples <= 0 || mc.eating || brain.sb.time - mc.appleT < 6) return;
    const h = me.health, withering = me.afflictions.some((a) => a.withering);
    // the worst of his head and body is what counts, not how he is on average
    const worst = Math.min(h.parts.torso.hp / h.parts.torso.max, h.parts.head.hp / h.parts.head.max);
    const need = (1 - Math.min(h.overall, worst + 0.1)) + (withering ? 0.25 : 0) + (h.bleeding > 0.003 ? 0.2 : 0);
    if (need < 0.35) return;
    add('eatApple', null, 0.4 + need * 1.2, 'I need a golden apple.', null, need > 0.5);
  },

  /** His fight: the sword up close, the bow for anything far off or up in the air. */
  fight(beh, dt, o, d, dir, r) {
    const me = beh.me, mc = me.mc, b = beh.brain;
    if (!mc || me.state !== 'stand') return undefined;
    if (mc.eating || mc.swapping) { me.stop(); me.faceTo(o.pos.x); return true; }
    const high = o.species && o.species.reachable ? !o.species.reachable(o, me) : o.pos.y - me.pos.y > 1.2;
    const armored = o.species && o.species.deflects && o.species.deflects(o, 'arrow');
    const want = mc.lock || (armored ? 'sword' : high || d > 5.5 ? 'bow' : d < 3 ? 'sword' : mc.form);
    if (want !== mc.form) { swap(me, want); me.stop(); me.faceTo(o.pos.x); return true; }
    if (mc.form === 'bow') {
      if (me.posture === 'guard') me.setPosture(null);
      me.lookAt = o.wj.head;
      const seen = b.sees(o);
      if (d < 3 && !high) me.goTo(me.pos.x - dir * 3, 'walk', { backpedal: true, face: o.pos.x });
      else if (d > 13 || !seen) me.goTo(o.pos.x - dir * 8, 'run', { face: o.pos.x });
      else { me.stop(); me.faceTo(o.pos.x); }
      if (!seen) { me.lowerGun(); return true; }
      me.aimAt(o);
      if (me.steady > 0.45) me.fire();
      return true;
    }
    // the sword: in close, and swing
    const reach = REACH * me.scale;
    me.setPosture('guard');
    if (d > reach + 0.1) me.goTo(o.pos.x - dir * reach * 0.9, d > 2.5 ? 'run' : 'walk', { face: o.pos.x });
    else if (d < 0.55) me.goTo(me.pos.x - dir * 0.45, 'shuffle', { backpedal: true, face: o.pos.x });
    else { me.stop(); me.faceTo(o.pos.x); }
    if (!me.acting) beh.cool -= dt;
    if (beh.cool <= 0 && (me.ready || me.canCounter) && d < reach + 0.2 && me.facing === dir) {
      const can = me.strikes();
      const choices = STRIKES.filter(([k]) => can.includes(k));
      if (choices.length) {
        let total = 0;
        for (const c of choices) total += c[1];
        let x = Math.random() * total, kind = choices[0][0];
        for (const c of choices) { x -= c[1]; if (x <= 0) { kind = c[0]; break; } }
        me.attack(kind, o);
        beh.cool = rand(0.35, 0.8) * Math.max(0.5, 1.2 - b.traits.aggression * 0.4 - b.traits.skill * 0.2);
      } else beh.cool = 0.6;
    }
    if (r.anger < 0.12 && !b.isHostile(o) && beh.t > 3) return false;
    return true;
  },

  abilities(man) {
    const mc = man.mc;
    if (!mc) return null;
    return [
      { id: 'auto', label: 'Auto', group: 'hands', on: !mc.lock, pick: () => { mc.lock = null; } },
      { id: 'sword', label: 'Diamond sword', group: 'hands', on: mc.lock === 'sword', pick: () => { mc.lock = 'sword'; swap(man, 'sword'); } },
      { id: 'bow', label: 'Bow', group: 'hands', on: mc.lock === 'bow', pick: () => { mc.lock = 'bow'; swap(man, 'bow'); } },
      { id: 'apple', label: `Eat a golden apple (${mc.apples})`, group: 'do', on: !!mc.eating, pick: () => eatApple(man) },
    ];
  },

  describeArms(man) {
    const mc = man.mc;
    if (!mc) return null;
    const hand = mc.eating ? 'Eating a golden apple' : mc.form === 'bow' ? (mc.drawing ? `Drawing his bow (${Math.round(mc.draw * 100)}%)` : 'Holding his bow') : 'Holding his diamond sword';
    return [hand, `Golden apples: ${mc.apples} left`];
  },
};

/* ------------------------------- eating, as a choice ------------------------------- */

class EatApple extends Behaviour {
  get kind() { return 'eatApple'; }
  get label() { return 'Eating a golden apple'; }
  get icon() { return 'exclaim'; }
  start() { this.ok = eatApple(this.me); }
  update(dt) {
    this.t += dt;
    const mc = this.me.mc;
    if (!this.ok) { this.ok = eatApple(this.me); return this.t < 1; }
    return !!(mc && mc.eating) && this.t < 3;
  }
}
KINDS.eatApple = EatApple;

/* ---------------------------------- who he is ---------------------------------- */

export const STEVE_LOOK = { key: 'steve' };

export const STEVE_TRAITS = { bravery: 0.85, aggression: 0.35, temper: 0.3, empathy: 0.6, sociability: 0.45, curiosity: 0.85, toughness: 0.75, skill: 0.82 };

export function spawnSteve(sb, x) {
  const taken = new Set(sb.people.map((p) => p.name));
  let name = 'Steve';
  for (let i = 2; taken.has(name); i++) name = `Steve ${i}`;
  return sb.spawnStickman(x, null, {
    name, species: STEVE, look: STEVE_LOOK, lines: STEVE_LINES, scale: 1, voice: 0.95, strength: 1.15, traits: STEVE_TRAITS, hair: 'none',
  });
}

export const isMinecraft = (t) => !!(t && t.species && t.species.mod === MOD);

