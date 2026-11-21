'use strict';
/* =============================================================================
   HORDE SURVIVOR - content and tuning.
   Chapters, enemies, bosses, abilities, buffs and gear all live here, so the
   numbers that decide how the game feels are in one place.
   ========================================================================== */

const TAU = Math.PI * 2;

/* The survivor with nothing equipped. Gear adds ATK and HP on top. */
const BASE = { atk: 10, hp: 100, speed: 118, pickup: 54 };

/* ------------------------------- chapters -------------------------------- */

const CHAPTERS = [{
  id: 'c1',
  num: 1,
  name: 'Abandoned City',
  duration: 900,                      // 15 minutes
  bigWaves: [240, 540, 840],          // the minute before each boss
  bosses: [
    { at: 300, id: 'dreadnought' },
    { at: 600, id: 'mothra' },
    { at: 900, id: 'titanus' },
  ],
  reward: { gold: 500, gems: 120 },   // paid every time the chapter is finished
}];

/* Spawn rate (enemies per second) and mix at chapter time t (seconds). */
function spawnPlan(t) {
  const L = (a, b, from, to) => a + (b - a) * Math.min(1, Math.max(0, (t - from) / (to - from)));
  if (t < 60)  return { rate: L(1.0, 1.7, 0, 60),     mix: { zombie: 1 } };
  if (t < 240) return { rate: L(1.7, 3.2, 60, 240),   mix: { zombie: 0.68, butterfly: 0.32 } };
  if (t < 300) return { rate: 6.5, big: true,         mix: { zombie: 0.8, butterfly: 0.2 } };
  if (t < 540) return { rate: L(2.8, 4.4, 300, 540),  mix: { zombie: 0.4, butterfly: 0.4, beetle: 0.2 } };
  if (t < 600) return { rate: 7.5, big: true,         mix: { zombie: 0.3, butterfly: 0.6, beetle: 0.1 } };
  if (t < 840) return { rate: L(3.8, 5.6, 600, 840),  mix: { zombie: 0.3, butterfly: 0.3, beetle: 0.4 } };
  return { rate: 8.5, big: true, mix: { zombie: 0.25, butterfly: 0.25, beetle: 0.5 } };
}

/* Enemies get tougher with time, and again after every boss that falls. */
function enemyHpMult(t, bossesDown) { return (1 + t / 60 * 0.26) * (1 + bossesDown * 0.22); }
function enemyDmgMult(t) { return 1 + t / 60 * 0.07; }

/* -------------------------------- enemies -------------------------------- */

const ENEMIES = {
  zombie:    { name: 'Zombie',           r: 13, hp: 16, speed: 40, dmg: 8,  exp: 1 },
  butterfly: { name: 'Zombie Butterfly', r: 11, hp: 10, speed: 64, dmg: 6,  exp: 1, flying: true },
  beetle:    { name: 'Beetle',           r: 14, hp: 32, speed: 50, dmg: 10, exp: 2 },
  minion:    { name: 'Lava Beetle',      r: 11, hp: 26, speed: 76, dmg: 9,  exp: 1 },
};
const ELITE = { size: 1.55, hp: 9, dmg: 1.6, exp: 10 };

/* --------------------------------- bosses -------------------------------- */

const BOSSES = {
  dreadnought: {
    name: 'Zombie Dreadnought', hp: 4200, r: 32, speed: 56, dmg: 16, gold: 30,
    attacks: ['charge', 'rocks', 'slam'],
    blurb: 'Charge · Rock Throw · Jump Slam',
  },
  mothra: {
    name: 'Mutated Butterfly', hp: 8800, r: 34, speed: 78, dmg: 14, gold: 30, flying: true,
    attacks: ['spin', 'poison', 'charge'],
    blurb: 'Spin Attack · Poison Balls · Charge',
  },
  titanus: {
    name: 'Titanus', hp: 16000, r: 40, speed: 50, dmg: 20, gold: 30,
    attacks: ['bullets', 'charge', 'spikes', 'summon', 'mines'],
    blurb: 'Lava Bullets · Charge · Spike Surge · Minions · Lava Mines',
  },
};

/* ------------------------------- abilities ------------------------------- */
/* lv[n-1] is what the card says when it offers level n. */

const ABILITIES = {
  guardian: {
    name: 'Guardian', evo: 'Crimson Guardian', needs: 'sharpener',
    lv: [
      '2 circular blades spin around you.',
      '+1 blade. 3 blades.',
      '+1 blade. 4 blades.',
      '+1 blade. 5 blades.',
      '+1 blade. 6 blades.',
    ],
    evoText: 'The blades turn red, hit much harder, and you get 1 more.',
  },
  forcefield: {
    name: 'Forcefield', evo: 'Crimson Field', needs: 'energy',
    lv: [
      'A green field around you damages enemies inside it.',
      'Bigger and stronger field.',
      'Bigger and stronger field.',
      'Bigger and stronger field.',
      'Bigger and stronger field.',
    ],
    evoText: 'The field turns red, grows, and slows every enemy inside it.',
  },
  durian: {
    name: 'Durian', evo: 'Thorn Durian', needs: 'fuel',
    lv: [
      'A green durian bounces off the edges of your screen, hurting all it touches.',
      'Bigger durian, more damage.',
      'Bigger durian, more damage.',
      'Bigger durian, more damage.',
      'Bigger durian, more damage.',
    ],
    evoText: 'Becomes a red and black spiked ball that shoots black spikes in all directions.',
  },
  missile: {
    name: 'Missile', evo: 'Void Missile', needs: 'fuel',
    lv: [
      'Fires a missile every 5 seconds that explodes on impact.',
      'More damage, bigger explosion.',
      'More damage, bigger explosion.',
      'More damage, bigger explosion.',
      'More damage, bigger explosion.',
    ],
    evoText: 'A black missile with a purple fire trail. Its huge purple blast sets enemies on fire for 10 seconds.',
  },
  molotov: {
    name: 'Molotov Cocktail', evo: 'Gas Canister', needs: 'goldband',
    lv: [
      'Every 5 seconds, throw a Molotov that leaves fire where it lands.',
      '+1 Molotov, bigger fire.',
      '+1 Molotov, bigger fire.',
      '+1 Molotov, bigger fire.',
      '+1 Molotov, bigger fire.',
    ],
    evoText: 'Throw 10 gas canisters all around you. Each leaves a giant blue fire.',
  },
};
const ABILITY_IDS = Object.keys(ABILITIES);

/* Numbers behind the abilities. Damage is a multiple of the run's ATK. */
const AB = {
  guardian:   { dmg: lv => 0.8 + 0.22 * lv, evoDmg: 2.4, orbit: lv => 56 + 3 * lv, evoOrbit: 74, spin: 2.9, evoSpin: 3.6, blade: 10, evoBlade: 13, hitCd: 0.33 },
  forcefield: { dmg: lv => 0.30 + 0.12 * lv, evoDmg: 1.35, radius: lv => 54 + 12 * lv, evoRadius: 138, tick: 0.5, slow: 0.5 },
  durian:     { dmg: lv => 0.8 + 0.35 * lv, evoDmg: 3.2, size: lv => 14 + 3 * lv, evoSize: 31, speed: 205, hitCd: 0.3, spikeEvery: 1.15, spikes: 12, spikeDmg: 1.0 },
  missile:    { every: 5, dmg: lv => 2.6 + 1.0 * lv, evoDmg: 11, radius: lv => 42 + 10 * lv, evoRadius: 128, speed: 270, burn: 0.9, burnTime: 10 },
  molotov:    { every: 5, count: lv => lv, radius: lv => 28 + 6 * lv, dmg: lv => 0.35 + 0.1 * lv, life: 3, evoCount: 10, evoRadius: 62, evoDmg: 1.3, evoLife: 4, tick: 0.4, range: 175 },
  shuriken:   { every: 1, dmg: 1.0, speed: 430, range: 420 },
};

/* --------------------------------- buffs --------------------------------- */

const BUFFS = {
  goldband: {
    name: 'Gold Band', evolves: ['molotov'],
    text: lv => `Gold from kills +${8 * lv}%.`,
  },
  fuel: {
    name: 'HE Fuel Canister', evolves: ['durian', 'missile'],
    text: lv => `Range, radius and speed +${10 * lv}%.`,
  },
  sharpener: {
    name: 'Blade Sharpener', evolves: ['guardian'],
    text: lv => `Damage +${2 * lv}%. Your effects last ${15 * lv}% longer.`,
  },
  energy: {
    name: 'Energy Drink', evolves: ['forcefield'],
    text: lv => `HP regen +${5 * lv}%: heal ${5 * lv}% of max HP every 10 seconds.`,
  },
  armor: {
    name: "Shotgun's Armor", evolves: [],
    text: lv => `All damage you take -${10 * lv}%.`,
  },
};
const BUFF_IDS = Object.keys(BUFFS);
const MAX_STARS = 5, MAX_HELD = 5;

/* Level n -> n+1 needs this much EXP. */
function expToNext(level) { return Math.round(4 + 3.3 * level + Math.pow(level, 1.35) * 0.35); }

/* --------------------------------- gear ---------------------------------- */

const SLOTS = [
  { id: 'weapon',    name: 'Weapon',     stat: 'atk' },
  { id: 'gloves',    name: 'Gloves',     stat: 'atk' },
  { id: 'accessory', name: 'Accessory',  stat: 'atk' },
  { id: 'chest',     name: 'Chestplate', stat: 'hp' },
  { id: 'helmet',    name: 'Helmet',     stat: 'hp' },
  { id: 'belt',      name: 'Belt',       stat: 'hp' },
];
const SLOT_BY_ID = Object.fromEntries(SLOTS.map(s => [s.id, s]));

const RARITIES = { common: { name: 'Common', max: 10 } };
const SETS = { torn: { name: 'Torn Leather' } };

const ITEMS = {
  wood_shuriken: { name: 'Wood Shuriken', slot: 'weapon', set: 'torn', rarity: 'common', base: 8, per: 2, weapon: 'shuriken',
    note: 'In battle, you throw a shuriken at the nearest enemy every second.' },
  torn_gloves:   { name: 'Torn Leather Gloves',     slot: 'gloves',    set: 'torn', rarity: 'common', base: 4,  per: 1 },
  torn_necklace: { name: 'Torn Leather Necklace',   slot: 'accessory', set: 'torn', rarity: 'common', base: 4,  per: 1 },
  torn_chest:    { name: 'Torn Leather Chestplate', slot: 'chest',     set: 'torn', rarity: 'common', base: 40, per: 8 },
  torn_helmet:   { name: 'Torn Leather Helmet',     slot: 'helmet',    set: 'torn', rarity: 'common', base: 24, per: 5 },
  torn_belt:     { name: 'Torn Leather Belt',       slot: 'belt',      set: 'torn', rarity: 'common', base: 24, per: 5 },
};

function itemStat(item) { const d = ITEMS[item.type]; return d.base + d.per * (item.level - 1); }
function itemMax(item) { return RARITIES[ITEMS[item.type].rarity].max; }
function upgradeCost(level) { return 50 + 50 * level; }
function salvageValue(item) {
  let spent = 0;
  for (let l = 1; l < item.level; l++) spent += upgradeCost(l);
  return 20 + Math.floor(spent * 0.6);
}

const CHESTS = {
  normal: { name: 'Normal Chest', cost: 80, rarity: 'common', pool: Object.keys(ITEMS),
    text: 'Drops one piece of Common gear from the Torn Leather set.' },
};

const START_SAVE = { gold: 0, gems: 80 };
