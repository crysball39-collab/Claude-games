/* =============================================================================
   GODZILLA - what he is to the game.

   A stickman underneath, so that everything in the game can find him, hit
   him and be afraid of him - with no mind of his own (his species does his
   thinking, in moves.js) and a body that is nothing like one (body.js). Too
   big to knock down, cut, pick up or set on fire, and nothing a person
   carries does him much harm: bullets do a little, blades less, fists all
   but nothing. Explosions do. He has more health than anything else there
   is, a bar along the top of the screen to show it, and he mends while
   nothing is hurting him.
   ========================================================================== */
import { Health } from '../../game/health.js';
import { armOf, isBlade } from '../../game/props.js';
import { clamp, rand } from '../../core/util.js';
import { newBody, stepBody, boundsOf, D, K } from './body.js';
import { godzillaSkin, makeMarks, facingAt } from './look.js';
import { think, doing, abilities, startDeath, updateDeath, onHurt, MOD } from './moves.js';

export const MAX_HP = 30000;
/** How much of each kind of harm gets through his hide. */
const HIDE = { bullet: 0.4, blade: 0.25, blunt: 0.12, impact: 0.3, blast: 1, burn: 0.15, rail: 1.2, beam: 1 };
const MENDS = 8;          // health a second, once nothing has hurt him for a while
const MEND_AFTER = 6;

const NOTHING = { damage: 0, wound: false, broke: null, ko: false, fatal: false };

/**
 * His health: one pool, and a big one. Whatever hurts him takes from it -
 * nothing of him bleeds out, breaks or comes off - and he never dies of it
 * here: the species sees the pool empty, and does the dying itself.
 */
class KaijuHealth extends Health {
  constructor(max) {
    super(1);
    this.bossMax = max;
    this.bossHp = max;
    this.shield = 0;
  }
  hit(part, amount) {
    if (this.shield > 0 || this.bossHp <= 0) return NOTHING;
    const d = Math.max(0, amount);
    this.bossHp = Math.max(0, this.bossHp - d);
    return { damage: d, wound: false, broke: null, ko: false, fatal: false };
  }
  update(dt) {
    this.time += dt;
    if (this.shield > 0) this.shield -= dt;
    return false;
  }
  get overall() { return this.bossHp / this.bossMax; }
  heal() { super.heal(); this.bossHp = this.bossMax; }
  dislocate() { return false; }
  lodge() {}
  conditions() { return []; }
}

/** What kind of harm a blow is, to his hide. */
function harmOf(h, weapon) {
  if (weapon === 'rail' || weapon === 'laser') return 'rail';
  if (weapon === 'bullet' || weapon === 'vestRound' || weapon === 'arrow' || weapon === 'needle' || h.kind === 'shot') return 'bullet';
  if (weapon === 'blast' || weapon === 'mcBlast' || weapon === 'gzBlast') return 'blast';
  if (weapon === 'fire') return 'burn';
  const spec = armOf(weapon);
  if (spec && spec.burn) return 'burn';
  if (isBlade(weapon) || (spec && spec.blade)) return 'blade';
  if (h.kind === 'impact' || h.kind === 'fall') return 'impact';
  return 'blunt';
}

export const GODZILLA = {
  mod: MOD,
  kind: 'godzilla',
  label: 'Kaiju',
  skin: godzillaSkin,
  mindless: true,
  steadfast: true,
  sturdy: true,
  monster: true,
  tireless: true,
  fireproof: true,
  frostproof: true,
  mute: true,
  noPickup: true,
  giant: true,
  unmissable: true,
  stopsRounds: true,
  // (how much of a fight he looks to anyone sizing him up: none they could win)
  power: 14,
  speed: 1,
  fall: 0,

  init(man) {
    man.health = new KaijuHealth(MAX_HP);
    man.tint = ['#4a1210', '#2e0b0a'];
    man.gravity = 0;
    man.gz = {
      body: null, marks: makeMarks(Math.floor(rand(1, 1e6))),
      state: 'arrive', t: 0, move: null, target: null, lastBy: null, hurtBy: new Map(), rage: 0.2,
      glow: 0, shake: 0, openA: 0, openB: 0, holding: null, mouthful: null,
      thinkT: 1.5, roarT: rand(8, 14), breathT: rand(9, 14), walkTo: null, wantV: 0, v: 0,
      kills: 0, eaten: 0, wrecked: 0, hurtT: -99, dead: false,
    };
  },

  spawned(man) {
    man.setState('air');
    man.onGround = true;
    man.gz.body = newBody(man);
    stepBody(man, 0);
    man.health.shield = 1;
  },

  update(man, dt) {
    const gz = man.gz, h = man.health;
    if (!gz || !gz.body || man.removed) return;
    // (frozen in place by the freeze tool: not a thought, not a move)
    if (man.frozenInPlace) { gz.v = gz.wantV = 0; return; }
    gz.t += dt;
    if (man.state !== 'air' && !man.dead) man.setState('air');
    if (man.dead) { updateDeath(man, dt); return; }
    if (h.bossHp <= 0 && gz.state !== 'dying') startDeath(man);
    if (gz.state === 'dying') { updateDeath(man, dt); return; }
    think(man, dt);
    // he mends, once nothing has hurt him for a while
    if (man.sandbox.time - gz.hurtT > MEND_AFTER) h.bossHp = Math.min(h.bossMax, h.bossHp + MENDS * dt);
  },

  air() { return true; },
  touchDown() { return true; },

  /** Where he goes: along the ground at the pace his moves set, never off the edge of the world. */
  physics(man, dt) {
    const sb = man.sandbox, gz = man.gz;
    const k = 1 - Math.exp(-dt * 2.2);
    gz.v += ((gz.wantV || 0) - gz.v) * k;
    if (gz.dead || gz.state === 'dying') gz.v = 0;
    man.vel.x = gz.v;
    man.vel.y = 0;
    const room = 3.2 * K;
    man.pos.x = clamp(man.pos.x + man.vel.x * dt, sb.left + room, sb.right - room);
    if (man.pos.x <= sb.left + room + 1e-6 || man.pos.x >= sb.right - room - 1e-6) gz.v = 0;
    man.pos.y = 0;
    man.onGround = true;
    man.support = null;
    return true;
  },

  /** His parts, where they are: the whole body worked out again for this step. */
  pose(man, dt) {
    if (!man.gz || !man.gz.body) return;
    stepBody(man, dt || 0);
  },

  shape(man) { return man.gz && man.gz.body ? man.gz.body.caps : []; },
  bounds(man, box) { if (man.gz && man.gz.body) boundsOf(man.gz.body, box); },

  /** The stand-in among the crates: his legs and body, not his tail or his head. */
  proxy(man) {
    const g = man.gz && man.gz.body;
    const sk = g && g.sk;
    if (!sk) return { x: man.pos.x, y: 5, w: 3, h: 9 };
    const x = man.pos.x + g.sx * (sk.hip.x + 0.6 * K);
    const top = Math.max(sk.chest.y, sk.belly.y + D.belly);
    return { x, y: (0.5 + top) / 2, w: Math.max(1.2, 3.6 * K * Math.abs(g.sx)), h: Math.max(1, top - 0.5) };
  },

  /** What gets through his hide; and who it was. */
  armor(man, h, part, weapon) {
    const gz = man.gz;
    if (!gz || gz.dead) return 1;
    if (h.by === man) return 0;
    if (h.by && h.by !== man) onHurt(man, h.by);
    gz.hurtT = man.sandbox.time;
    return HIDE[harmOf(h, weapon)] ?? 0.2;
  },

  hostileTo(man, o) { return !man.dead && !!o && o !== man; },
  reachable() { return true; },

  bossbar(man) {
    const h = man.health, gz = man.gz;
    if (!h || !gz || man.dead || gz.state === 'dying' && h.bossHp <= 0 && gz.t > 99) return null;
    return {
      name: man.name, frac: h.bossHp / h.bossMax, color: '#d9481e', style: 'kaiju',
      hp: `${Math.ceil(h.bossHp).toLocaleString('en-US')} / ${h.bossMax.toLocaleString('en-US')}`,
      note: gz.glow > 0.2 ? 'Atomic breath' : gz.rage > 0.75 ? 'Enraged' : '',
      text: `${Math.ceil(h.bossHp)} / ${h.bossMax}`,
    };
  },

  inspect(man) {
    const h = man.health, gz = man.gz;
    const lines = [
      { text: 'Bullets do a little; blades and fists all but nothing. Explosions hurt him', bad: true },
      { text: `He mends ${MENDS} health a second, once nothing has hurt him for ${MEND_AFTER} seconds` },
      { text: `Killed: ${gz.kills} · Eaten: ${gz.eaten} · Buildings wrecked: ${gz.wrecked}`, bad: gz.kills + gz.eaten > 0 },
    ];
    return {
      mood: man.dead ? 'Dead' : gz.state === 'dying' ? 'Dying' : gz.rage > 0.75 ? 'Enraged' : gz.rage > 0.4 ? 'Angry' : 'Rampaging',
      doing: doing(man),
      dead: man.dead,
      bars: [{ label: 'Health', frac: h.bossHp / h.bossMax, color: '#d9481e', text: `${Math.ceil(h.bossHp).toLocaleString('en-US')} / ${h.bossMax.toLocaleString('en-US')}` },
        { label: 'Rage', frac: gz.rage, color: '#b0281a', text: `${Math.round(gz.rage * 100)}%` }],
      lines,
    };
  },

  abilities(man) { return abilities(man); },

  /** Everyone's first sight of him. */
  metBy(me, brain, r) {
    const T = brain.traits;
    r.fear = Math.max(r.fear, 0.85 * (1.3 - T.bravery * 0.5));
    r.violent = Math.max(r.violent, 3);
    r.like = Math.min(r.like, -0.6);
    brain.emo.bump('fear', 0.55 * (1.25 - T.bravery * 0.6));
    brain.emo.bump('surprise', 0.9);
    brain.speak('seeGodzilla', { other: me.name }, 1, me, true);
  },

  healed(man) {
    const gz = man.gz;
    if (!gz) return;
    gz.rage = 0.2;
  },
};

/** Godzilla, at x: out of the ground's shaking, with a roar. */
export function spawnGodzilla(sb, x) {
  const n = sb.people.filter((p) => p.species === GODZILLA).length;
  const man = sb.spawnStickman(x, 0, {
    name: n ? `Godzilla ('54) ${n + 1}` : "Godzilla ('54)", species: GODZILLA, scale: 6, airborne: true, hair: 'none', voice: 0.2, strength: 8,
    traits: { bravery: 1, aggression: 1, temper: 1, empathy: 0, sociability: 0, curiosity: 0.2, toughness: 1, skill: 0.6 },
    look: { key: 'godzilla' },
  });
  if (!man) return null;
  // facing along the street, toward the middle of it (as his ghost showed)
  if (man.facing !== facingAt(man.pos.x)) {
    man.facing = facingAt(man.pos.x);
    man.gz.body = newBody(man);
    stepBody(man, 0);
  }
  sb.emit('gzSpawn', { who: man, x: man.pos.x, y: 0 });
  return man;
}

export const isGodzilla = (p) => !!(p && p.species === GODZILLA);
