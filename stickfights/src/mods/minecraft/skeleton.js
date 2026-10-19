/* =============================================================================
   MINECRAFT - wither skeletons.

   The Wither calls them up out of soul fire once it is past its half. Tall,
   nearly black, a stone sword each, and every cut from one withers whoever
   it lands on. They have no fear, and nothing to say - just a dry rattle
   now and then. They go for anything alive that is not undead like
   themselves, and when one is killed it lies a moment, then is gone in a
   puff of smoke - sometimes leaving its skull behind.
   ========================================================================== */
import { defineArm } from '../../game/props.js';
import { rand, chance } from '../../core/util.js';
import { skeletonSkin } from './look.js';
import { MOD, wither, undead, puffs, soulFire } from './effects.js';
import { spawnSkull } from './blocks.js';

defineArm('stoneSword', {
  name: 'Stone sword', noun: 'stone sword', wound: 'Sword', cause: 'a stone sword', blade: true, sharp: 1, mult: 1.25, deep: ['stab', 'chop'],
  chop: true, gash: 1, sever: 0.45, shove: 0.85, spray: 1.1, scary: 0.5, fear: 'mcSwordFear', nasty: 2.6, memory: 'choppedMe',
  hurt: 'mcSwordHit', seen: 'mcSawSword', verb: 'cut me with a stone sword', power: 2, r: 0.05,
});

const STRIKES = ['slash', 'chop', 'stab'];

export const WITHER_SKELETON = {
  mod: MOD,
  kind: 'witherSkeleton',
  label: 'Wither Skeleton',
  skin: skeletonSkin,
  monster: true,
  undead: true,
  tireless: true,
  // (out of the Nether: fire does nothing to them)
  fireproof: true,
  mute: true,
  noPickup: true,
  power: 1.5,
  speed: 1.05,
  fall: 0.6,

  init(man) {
    man.tint = ['#4d4d4d', '#2e2e2e'];      // they spill bone dust, not blood
    man.innate = 'stoneSword';
    man.mc = { rattleT: rand(1, 4), huntT: 0, poofT: null };
    for (const p of Object.values(man.health.parts)) { p.max *= 1.1; p.hp = p.max; }
  },

  spawned(man) {
    // nothing frightens them, ever
    if (man.brain) { man.brain.emo.set('fear', 0); man.brain.lockEmotion('fear'); }
  },

  update(man, dt) {
    const mc = man.mc, sb = man.sandbox;
    if (!mc) return;
    if (man.dead) {
      // a moment on the floor, then smoke, and gone - maybe leaving the skull
      if (mc.poofT === null) mc.poofT = 2.5;
      if ((mc.poofT -= dt) <= 0) {
        const x = man.wj.chest.x, y = Math.max(0.3, man.wj.chest.y);
        puffs(sb, { x, y, n: 16, speed: 1.4, size: 0.2, grow: 0.5, life: 0.9, colors: ['#e6e6e6', '#bdbdbd', '#8f8f8f'], spread: 0.5 });
        sb.emit('mobPoof', { who: man, x, y });
        if (chance(0.25)) spawnSkull(sb, x, y);
        sb.effects.push({ mod: MOD, update: () => { sb.remove(man); return false; } });
        mc.poofT = Infinity;
      }
      return;
    }
    if ((mc.rattleT -= dt) <= 0) {
      mc.rattleT = rand(3, 7);
      sb.emit('skeletonRattle', { who: man, x: man.wj.head.x, y: man.wj.head.y });
    }
    // after anything alive that is not one of the undead
    if (man.brain && (mc.huntT -= dt) <= 0) {
      mc.huntT = 0.8;
      for (const o of man.brain.visible) {
        if (o.dead || o.removed || undead(o)) continue;
        const r = man.brain.rel(o);
        r.anger = Math.max(r.anger, 0.9);
        r.like = -1;
      }
    }
  },

  strikes(man, out) {
    if (!man.health.canUse('armA') || man.cut.armA || man.rag) return out.filter((k) => k === 'kick' || k === 'stomp');
    return [...STRIKES, ...out.filter((k) => k === 'kick')];
  },

  bladePoints(man) {
    const j = man.wj, e = j.elbowA, h = j.handA;
    const d = Math.hypot(h.x - e.x, h.y - e.y) || 1;
    const ux = (h.x - e.x) / d, uy = (h.y - e.y) / d;
    const L = 0.72 * man.scale;
    const at = (k) => ({ x: h.x + ux * k * L, y: h.y + uy * k * L });
    const pts = [at(1), at(0.6), at(0.25)];
    return { tip: pts[0], mid: pts[1], pts, ux, uy };
  },

  /** Every cut withers. */
  landed(man, o) { wither(o, 8, 1, man); },

  /** Their swords go past their own kind - the Wither included. */
  spares(man, o) { return undead(o); },

  /** And nothing of the undead's own hurts them. */
  armor(man, h) { return h.by && undead(h.by) && h.by !== man ? 0 : 1; },

  guardClip() { return 'macheteGuard'; },
  canPickUp() { return false; },

  meet(brain, o, r) {
    if (undead(o)) { r.like = Math.max(r.like, 0.5); r.anger = 0; }
    else { r.anger = Math.max(r.anger, 0.9); r.like = -1; }
  },

  metBy(me, brain, r) {
    if (undead(brain.man)) return;
    r.fear = Math.max(r.fear, 0.35 * (1.2 - brain.traits.bravery));
    brain.emo.bump('fear', 0.12 * (1.2 - brain.traits.bravery));
    brain.speak('seeWitherSkeleton', { other: me.name }, 0.6, me, true);
  },

  describeArms() { return 'Holding a stone sword'; },
};

/** One out of soul fire at x, standing up from a crouch. */
export function spawnSkeleton(sb, x, by = null) {
  // (a name nobody here has yet: the first is just "Wither Skeleton")
  const taken = new Set(sb.people.map((p) => p.name));
  let n = 1;
  while (taken.has(n > 1 ? `Wither Skeleton ${n}` : 'Wither Skeleton')) n++;
  const man = sb.spawnStickman(x, null, {
    name: n > 1 ? `Wither Skeleton ${n}` : 'Wither Skeleton', species: WITHER_SKELETON, scale: 1.24, voice: 0.6, strength: 1.3, hair: 'none',
    traits: { bravery: 1, aggression: 1, temper: 0.9, empathy: 0, sociability: 0.02, curiosity: 0.1, toughness: 0.85, skill: 0.6 },
    look: { key: 'witherSkeleton' },
  });
  if (!man) return null;
  man.anim.act('mcSummoned', { fadeIn: 0.01, fadeOut: 0.2 });
  soulFire(sb, x, 0.2, 18);
  sb.emit('skeletonSummoned', { who: man, by, x, y: 0 });
  return man;
}
