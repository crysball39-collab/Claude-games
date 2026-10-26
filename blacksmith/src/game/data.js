/* =============================================================================
   Every number the game is balanced on, in one file: ores and how often they
   turn up, what rocks take to break, what the anvil can make and how strong
   it comes out, and what the player and the skeletons can do.
   ========================================================================== */

/* -------------------------------- rarity --------------------------------- */

export const RARITIES = {
  common: { name: 'Common', color: '#c4c4bd', rank: 0 },
  uncommon: { name: 'Uncommon', color: '#62d662', rank: 1 },
  rare: { name: 'Rare', color: '#4fa9ff', rank: 2 },
  epic: { name: 'Epic', color: '#bf6bff', rank: 3 },
  legendary: { name: 'Legendary', color: '#ffb02e', rank: 4 },
};

/* --------------------------------- ores ---------------------------------- */

/**
 * `oneIn` is the chance the design gives each ore: a 1 in N roll. `power` is
 * what it is worth on the anvil - every damage and defence number in the game
 * is a base number times the power of the ore it was forged from.
 *
 * `look` drives both the icons and the 3D materials, so a blade on screen and
 * the same blade in the inventory are the same colour.
 */
export const ORES = {
  stone: {
    name: 'Stone', rarity: 'common', oneIn: 2, power: 1.0,
    look: { kind: 'rock', base: '#8e8b84', light: '#c8c4ba', dark: '#4f4c47', shine: 6 },
  },
  bronze: {
    name: 'Bronze', rarity: 'uncommon', oneIn: 4, power: 1.4,
    look: { kind: 'metal', base: '#c27a3a', light: '#f0b071', dark: '#6a3b14', shine: 60 },
  },
  iron: {
    name: 'Iron', rarity: 'uncommon', oneIn: 5, power: 1.8,
    look: { kind: 'metal', base: '#9aa3ad', light: '#e2e8ee', dark: '#4b525a', shine: 70 },
  },
  bones: {
    name: 'Bones', rarity: 'uncommon', oneIn: 25, power: 2.0, fromSkeletons: true,
    look: { kind: 'bone', base: '#e4dac2', light: '#fffaf0', dark: '#9c8f72', shine: 14 },
  },
  gold: {
    name: 'Gold', rarity: 'rare', oneIn: 12, power: 2.6,
    look: { kind: 'metal', base: '#f0bd34', light: '#fff0a6', dark: '#946510', shine: 90 },
  },
  amethyst: {
    name: 'Amethyst', rarity: 'rare', oneIn: 20, power: 3.2,
    look: { kind: 'gem', base: '#9b56d8', light: '#e3c4ff', dark: '#4a1f75', shine: 110, glow: '#2c0b48' },
  },
  emerald: {
    name: 'Emerald', rarity: 'epic', oneIn: 40, power: 4.2,
    look: { kind: 'gem', base: '#2ec46f', light: '#b8ffd6', dark: '#0d5a2d', shine: 110, glow: '#05361a' },
  },
  diamond: {
    name: 'Diamond', rarity: 'epic', oneIn: 60, power: 5.2,
    look: { kind: 'gem', base: '#a8ecff', light: '#ffffff', dark: '#3d8fae', shine: 130, glow: '#1a4a5c' },
  },
  irisite: {
    name: 'Irisite', rarity: 'legendary', oneIn: 300, power: 8.0,
    look: { kind: 'iris', base: '#ff6ad5', light: '#ffffff', dark: '#3a2a8a', shine: 130, glow: '#5a2a7a' },
  },
};

/** The order ores are listed in: worst to best. */
export const ORE_ORDER = ['stone', 'bronze', 'iron', 'bones', 'gold', 'amethyst', 'emerald', 'diamond', 'irisite'];

/**
 * What a broken rock gives, one ore at a time.
 *
 * Taken literally the design's eight chances add up to 113%, so they cannot
 * all hold at once. Stone keeps its 1 in 2, and every Rare, Epic and
 * Legendary ore keeps its exact chance - Irisite really is 1 in 300. Bronze
 * and Iron share what is left between them, in the 4 to 5 the design gives
 * them, which makes them 1 in 5.6 and 1 in 7.
 */
const EXACT = ['stone', 'gold', 'amethyst', 'emerald', 'diamond', 'irisite'];
const SHARED = ['bronze', 'iron'];
const MINED_ODDS = (() => {
  const odds = {};
  let left = 1;
  for (const id of EXACT) { odds[id] = 1 / ORES[id].oneIn; left -= odds[id]; }
  const weight = SHARED.reduce((s, id) => s + 1 / ORES[id].oneIn, 0);
  for (const id of SHARED) odds[id] = left * (1 / ORES[id].oneIn) / weight;
  return odds;
})();
/** Rarest first, so a glance down the table reads like the chances. */
const MINED_TABLE = Object.entries(MINED_ODDS).sort((a, b) => a[1] - b[1]);

export function rollMinedOre(rng = Math.random) {
  let r = rng();
  for (const [id, p] of MINED_TABLE) {
    if (r < p) return id;
    r -= p;
  }
  return 'stone';
}

/** The real share of each mined ore, 0..1. */
export function minedOreOdds() { return { ...MINED_ODDS }; }

/** "1 in 300", the way the inventory shows it. */
export function oddsLabel(id) {
  const p = ORES[id].fromSkeletons ? 1 / ORES[id].oneIn : MINED_ODDS[id];
  const n = 1 / p;
  return '1 in ' + (Math.abs(n - Math.round(n)) < 0.05 ? Math.round(n) : n.toFixed(1));
}

/* --------------------------------- rocks --------------------------------- */

/** `tier` is the pickaxe it takes: boulders need the Stone Pickaxe. */
export const ROCKS = {
  pebble: { name: 'Pebble', hp: 20, drops: 2, tier: 0, radius: 0.46 },
  rock: { name: 'Rock', hp: 50, drops: 3, tier: 0, radius: 0.78 },
  boulder: { name: 'Boulder', hp: 150, drops: 4, tier: 1, radius: 1.2 },
};

/** How many of each are in the cave at once, and how soon a broken one is replaced. */
export const ROCK_COUNTS = { pebble: 10, rock: 7, boulder: 5 };
/** The deep mine below it is mostly boulders. */
export const DEEP_ROCK_COUNTS = { pebble: 3, rock: 5, boulder: 12 };
export const ROCK_RESPAWN = [8, 15];

/* ------------------------------- pickaxes -------------------------------- */

/**
 * Every pickaxe there is, in the order they hang on the pickaxe wall by the
 * cave mouth, which is where they are bought. `blurb` is what the wall says
 * about each one when you inspect it.
 */
export const PICKAXES = {
  wood: {
    name: 'Wood Pickaxe', damage: 5, tier: 0, price: 0, fight: 4, rarity: 'common',
    blurb: 'Every smith starts with one. Fine for pebbles and rocks; it just bounces off a boulder.',
  },
  stone: {
    name: 'Stone Pickaxe', damage: 10, tier: 1, price: 1000, fight: 6, rarity: 'uncommon',
    blurb: 'A stone head lashed to a good handle. Twice the bite of wood, and the only pickaxe that breaks a boulder.',
  },
};

/** How many swings of this pickaxe each kind of rock takes, or null if it cannot break it. */
export function hitsToBreak(type) {
  const p = PICKAXES[type];
  const out = {};
  for (const [kind, r] of Object.entries(ROCKS)) out[kind] = p.tier >= r.tier ? Math.ceil(r.hp / p.damage) : null;
  return out;
}

/* ----------------------------- the anvil --------------------------------- */

/**
 * `damage` is with every part forged from Stone; better ore multiplies it.
 * `cooldown` is seconds between swings, `reach` metres from your middle,
 * `arc` the degrees in front of you a swing covers, `hits` how many
 * skeletons one swing can catch.
 */
export const WEAPONS = {
  dagger: { name: 'Dagger', weight: 'Light', ores: 3, damage: 6, cooldown: 0.42, reach: 1.95, arc: 80, hits: 1 },
  sword: { name: 'Straight-Sword', weight: 'Medium', ores: 10, damage: 12, cooldown: 0.62, reach: 2.35, arc: 95, hits: 2 },
  broadsword: { name: 'Broadsword', weight: 'Heavy', ores: 20, damage: 22, cooldown: 0.95, reach: 2.75, arc: 120, hits: 9 },
};

/** `defense` is with Stone, multiplied by the ore like damage is. */
export const ARMOR = {
  helmet: { name: 'Helmet', weight: 'Light', slot: 'helmet', ores: 2, defense: 2 },
  chestplate: { name: 'Chestplate', weight: 'Light', slot: 'chest', ores: 5, defense: 5 },
  leggings: { name: 'Leggings', weight: 'Light', slot: 'legs', ores: 3, defense: 3 },
  boots: { name: 'Boots', weight: 'Light', slot: 'boots', ores: 2, defense: 2 },
};

/** The order the anvil offers them in. */
export const RECIPES = ['dagger', 'sword', 'broadsword', 'helmet', 'chestplate', 'leggings', 'boots'];

/** What the most, the second most and the least of the ore become. */
export const PART_NAMES = {
  weapon: ['Blade', 'Cross-Guard', 'Pommel'],
  armor: ['Plating', 'Body', 'Trim'],
};

export const EQUIP_SLOTS = ['weapon', 'pickaxe', 'helmet', 'chest', 'legs', 'boots'];

export function recipe(type) {
  if (WEAPONS[type]) return { kind: 'weapon', type, ...WEAPONS[type] };
  if (ARMOR[type]) return { kind: 'armor', type, ...ARMOR[type] };
  return null;
}

/**
 * The anvil's three slots, ranked: most ore first. A tie goes to the slot
 * further left, so what you see is what you get.
 */
export function rankSlots(slots) {
  return slots
    .map((s, i) => ({ ore: s?.ore, amount: s?.amount || 0, i }))
    .filter((s) => s.ore && s.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.i - b.i);
}

/**
 * Which ore each part is made of: [blade or plating, guard or body, pommel
 * or trim]. With two ores the second-most and the least are the same one;
 * with one ore, everything is.
 */
export function partsOf(mix) {
  const ranked = rankSlots(mix.map(([ore, amount]) => ({ ore, amount })));
  if (!ranked.length) return null;
  const n = ranked.length;
  return [ranked[0].ore, ranked[Math.min(1, n - 1)].ore, ranked[n - 1].ore];
}

/** How good the ore going in is, weighted by how much of each. */
export function qualityOf(mix) {
  let sum = 0, n = 0;
  for (const [ore, amount] of mix) { sum += (ORES[ore]?.power || 1) * amount; n += amount; }
  return n ? sum / n : 1;
}

export const oreCount = (mix) => mix.reduce((n, [, amount]) => n + amount, 0);

/**
 * The ore a recipe asks for is the least it takes; the anvil takes as much
 * more as you like. Twice the ore makes it 30% stronger, four times 60%,
 * and so on, up to double strength at ten times the ore. Better ore always
 * counts for more than more ore: ten times the Stone does not make Gold.
 */
export const EXTRA_ORE = { per: 0.3, max: 2 };

export function oreBonus(total, need) {
  return Math.min(EXTRA_ORE.max, 1 + EXTRA_ORE.per * Math.log2(Math.max(1, total / need)));
}

/* --------------------------- the forging game ---------------------------- */

/**
 * Forging is played: pull the chain until the mould is full, strike the
 * metal five times on the beat, then quench it. Each strike is a white ring
 * closing on the TAP button; tap while it is on the button's green ring.
 * Sizes are in button radii, times in seconds.
 */
export const HAMMER = {
  strikes: 5,
  from: 2.6, to: 0.2,    // the white ring's radius as it starts, and where it gives up
  shrink: 1.15,          // how long it takes from one to the other
  ring: 1.12,            // the green ring's radius
  gap: 0.55,             // after one strike, before the next ring starts
};

/**
 * How a strike went, by how far the white ring was from the green one. A
 * Perfect is inside the green ring's width, which is drawn to match.
 */
export const GRADES = [
  { id: 'perfect', name: 'Perfect', within: 0.13, score: 100, color: '#ffd34a' },
  { id: 'great', name: 'Great', within: 0.32, score: 85, color: '#5fd0ff' },
  { id: 'good', name: 'Good', within: 0.55, score: 65, color: '#8ee07a' },
  { id: 'mid', name: 'Mid', within: 0.85, score: 50, color: '#d8cfc4' },
  { id: 'bad', name: 'Bad', within: Infinity, score: 15, color: '#ff6b5b' },
];

/** The grade for a tap with the white ring at radius `r`; null is no tap at all. */
export function strikeGrade(r) {
  if (r == null) return GRADES[GRADES.length - 1];
  const off = Math.abs(r - HAMMER.ring);
  return GRADES.find((g) => off <= g.within);
}

/** The gear's score, 0-100: its strikes' scores, averaged. A strike never made counts as Mid. */
export function forgeScore(grades, strikes = HAMMER.strikes) {
  let sum = 0;
  for (let i = 0; i < strikes; i++) sum += (GRADES.find((g) => g.id === grades[i]) || GRADES[3]).score;
  return Math.round(sum / strikes);
}

/** What the score makes the gear, and what that does to its damage or defense. */
export const RANKS = [
  { id: 'bad', name: 'Bad', min: 0, mult: 0.75, color: '#ff6b5b' },
  { id: 'okay', name: 'Okay', min: 25, mult: 0.9, color: '#ffa65b' },
  { id: 'mid', name: 'Mid', min: 45, mult: 1, color: '#d8cfc4' },
  { id: 'good', name: 'Good', min: 55, mult: 1.1, color: '#8ee07a' },
  { id: 'great', name: 'Great', min: 75, mult: 1.25, color: '#5fd0ff' },
  { id: 'masterwork', name: 'Masterwork', min: 90, mult: 1.45, color: '#d68bff' },
  { id: 'perfect', name: 'Perfect', min: 100, mult: 1.7, color: '#ffd34a' },
];

/** The rank a score earns; null for gear forged before there were ranks. */
export function rankOf(score) {
  if (!Number.isFinite(score)) return null;
  let r = RANKS[0];
  for (const x of RANKS) if (score >= x.min) r = x;
  return r;
}

/* -------------------------------- items ---------------------------------- */

/** Damage, defence, mining power: everything an item does, from what it is. */
export function itemStats(item) {
  if (item.kind === 'pickaxe') {
    const p = PICKAXES[item.type];
    return { mining: p.damage, tier: p.tier, damage: p.fight };
  }
  const q = qualityOf(item.mix);
  const total = oreCount(item.mix);
  const rank = rankOf(item.rank);
  const m = rank ? rank.mult : 1;
  if (item.kind === 'weapon') {
    const w = WEAPONS[item.type];
    const bonus = oreBonus(total, w.ores);
    return { damage: Math.round(w.damage * q * bonus * m), cooldown: w.cooldown, reach: w.reach, arc: w.arc, hits: w.hits, bonus, ores: total, rank };
  }
  const a = ARMOR[item.type];
  const bonus = oreBonus(total, a.ores);
  return { defense: Math.round(a.defense * q * bonus * m * 10) / 10, bonus, ores: total, rank };
}

export function itemRarity(item) {
  if (item.kind === 'pickaxe') return PICKAXES[item.type].rarity;
  const parts = partsOf(item.mix);
  return parts ? ORES[parts[0]].rarity : 'common';
}

export function itemName(item) {
  if (item.kind === 'pickaxe') return PICKAXES[item.type].name;
  const parts = partsOf(item.mix);
  const ore = parts ? ORES[parts[0]].name : '';
  if (item.kind === 'weapon') return `${ore} ${WEAPONS[item.type].name}`;
  return `Light ${ore} ${ARMOR[item.type].name}`;
}

/** Which equip slot an item goes in. */
export function slotOf(item) {
  if (item.kind === 'weapon') return 'weapon';
  if (item.kind === 'pickaxe') return 'pickaxe';
  return ARMOR[item.type].slot;
}

/* -------------------------------- people --------------------------------- */

export const PLAYER = {
  baseHp: 100, hpPerLevel: 5,
  regenDelay: 5, regenRate: 4,
  stamina: 100, staminaRegen: 26, staminaDelay: 0.75,
  walk: 4.4, sprint: 7.4, sprintCost: 15,
  dashCost: 24, dashSpeed: 15.5, dashTime: 0.22, dashCooldown: 0.4,
  radius: 0.38,
};

export const SKELETON = {
  count: 3, hp: 40, damage: 7, speed: 2.75, wander: 1.1,
  aggro: 9, leash: 16, reach: 1.45, windup: 0.5, recover: 0.6, cooldown: 0.75,
  respawn: [6, 10], radius: 0.36, defense: 0,
  attack: { kind: 'skel', time: 0.95, hit: 0.62 },
};

/**
 * The deep mine's skeletons: an Iron Chestplate, Iron Boots and an Iron
 * Straight-Sword each. The armour is worth what it would be on you, so your
 * blows land for a little over three quarters of their damage; the sword
 * reaches further and cuts harder than a wooden dagger.
 */
export const ELITE_GEAR = {
  weapon: { kind: 'weapon', type: 'sword', mix: [['iron', 10]] },
  chest: { kind: 'armor', type: 'chestplate', mix: [['iron', 5]] },
  boots: { kind: 'armor', type: 'boots', mix: [['iron', 2]] },
};
export const ELITE = {
  ...SKELETON,
  count: 3, hp: 120, damage: 16, speed: 3.0, wander: 1.2,
  aggro: 10, leash: 18, reach: 1.85, cooldown: 0.95,
  respawn: [8, 13], radius: 0.4,
  attack: { kind: 'slash', time: 1.05, hit: 0.5 },
  elite: true,
};

/**
 * The bounties. Rob pays for any three skeletons; Jack, in the deep mine,
 * for five elites, and only gives the work to a smith of level 5 or more.
 */
export const QUESTS = {
  rob: { giver: 'Rob', kills: 3, cash: 1000, exp: 100, level: 1, elite: false },
  jack: { giver: 'Jack', kills: 5, cash: 5000, exp: 1000, level: 5, elite: true },
};
export const QUEST = QUESTS.rob;

/** EXP it takes to climb from `level` to the next one. */
export const expToNext = (level) => 100 * level;

export function levelFromExp(exp) {
  let level = 1, need = expToNext(1);
  while (exp >= need) { exp -= need; level++; need = expToNext(level); }
  return { level, into: exp, need };
}

/** Armour takes a share of every hit: 40 defence halves it. */
export const afterArmor = (raw, defense) => raw * 40 / (40 + Math.max(0, defense));

/** What an elite's iron is worth against your blows. */
ELITE.defense = Math.round((itemStats(ELITE_GEAR.chest).defense + itemStats(ELITE_GEAR.boots).defense) * 10) / 10;
