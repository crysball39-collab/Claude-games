/* =============================================================================
   Who a new stickman is: a name, a build, a haircut, a voice, and the eight
   traits their brain runs on. Every trait is 0..1 and drawn as the average of
   two random numbers, so most people are middling and a few are extreme.
   ========================================================================== */
import { rand, pick } from '../core/util.js';

const NAMES = [
  'Alex', 'Sam', 'Jo', 'Kai', 'Robin', 'Charlie', 'Jamie', 'Riley', 'Morgan', 'Casey', 'Taylor', 'Jordan',
  'Avery', 'Quinn', 'Drew', 'Rowan', 'Sky', 'Reese', 'Toby', 'Milo', 'Leo', 'Zoe', 'Ivy', 'Nina', 'Otto',
  'Gus', 'Pip', 'Bo', 'Eli', 'Max', 'Rex', 'Ada', 'Lou', 'Ray', 'Kit', 'Ash', 'Dot', 'Ned', 'Flo', 'Hal',
  'Iris', 'Jude', 'Lars', 'Mae', 'Noor', 'Oz', 'Pat', 'Rue', 'Sid', 'Tess', 'Uma', 'Vic', 'Wes', 'Yuki',
  'Zed', 'Bea', 'Cal', 'Dee', 'Fin', 'Gil', 'Hugo', 'Ines', 'Jun', 'Kobi', 'Lena', 'Mo', 'Nico', 'Ola',
  'Pia', 'Ravi', 'Saul', 'Tam', 'Vera', 'Wren', 'Yara', 'Arlo', 'Bram', 'Cleo', 'Dax', 'Enzo', 'Fay',
];

export const HAIR = ['none', 'tuft', 'spiky', 'flat', 'ponytail', 'bun', 'mohawk', 'curly'];

export const TRAITS = ['bravery', 'aggression', 'temper', 'empathy', 'sociability', 'curiosity', 'toughness', 'skill'];

const middling = () => (Math.random() + Math.random()) / 2;

/** A new person. `taken` is the names already in use, so nobody shares one. */
export function makePerson(o = {}, taken = []) {
  const traits = {};
  for (const k of TRAITS) traits[k] = o.traits && o.traits[k] !== undefined ? o.traits[k] : middling();
  const free = NAMES.filter((n) => !taken.includes(n));
  const name = o.name || (free.length ? pick(free) : pick(NAMES) + ' ' + (taken.length + 1));
  return {
    name,
    scale: o.scale || rand(0.92, 1.08),
    hair: o.hair || pick(HAIR),
    voice: o.voice || rand(0.8, 1.3),
    strength: 0.85 + traits.toughness * 0.15 + rand(0, 0.12),
    toughness: traits.toughness,
    traits,
  };
}

/** A few words for the inspector: what is unusual about this person. */
export function describeTraits(t) {
  const out = [];
  const say = (k, hi, lo) => {
    if (t[k] > 0.66) out.push(hi);
    else if (t[k] < 0.34 && lo) out.push(lo);
  };
  say('bravery', 'Brave', 'Timid');
  say('aggression', 'Aggressive', 'Peaceful');
  say('temper', 'Hot-headed', 'Even-tempered');
  say('empathy', 'Kind', 'Cold');
  say('sociability', 'Chatty', 'Loner');
  say('curiosity', 'Curious', null);
  say('toughness', 'Tough', 'Fragile');
  say('skill', 'Good fighter', 'Clumsy');
  if (!out.length) out.push('Ordinary');
  return out;
}
