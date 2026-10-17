/* =============================================================================
   MURDER DRONES - Uzi, N and V: who each of them is, what they look like,
   and how they arrive (what they say is in lines.js).

   UZI  A worker drone with a chip on her shoulder and a railgun she built
        herself. Brave, sharp-tongued, quick to anger, not one for company.
        Murder drones she keeps an eye on - N she has a soft spot for, V she
        does not trust an inch - but she does not start it with them.
   N    A disassembly drone who would really rather be friends. Kind, keen,
        nervous, apologetic - and, when he has to be, very dangerous.
   V    A disassembly drone who enjoys her work far too much. Fearless,
        vicious and playful about it; anyone who is not one of hers is
        something to take apart.

   N and V come down out of the sky and crash-land, wings out. Uzi walks in
   with her railgun already in her hands.
   ========================================================================== */
import { clamp } from '../../core/util.js';
import { WORKER, DISASSEMBLY } from './species.js';
import { Railgun } from './railgun.js';
import { UZI_LINES, N_LINES, V_LINES } from './lines.js';
import { UZI_PURPLE, DRONE_YELLOW } from './look.js';

export const LOOKS = {
  uzi: { key: 'uzi', type: 'worker', eye: UZI_PURPLE, hat: 'beanie', hair: 'uzi' },
  n: {
    key: 'n', type: 'disassembly', eye: DRONE_YELLOW, hat: 'cap', hair: 'n', collar: true, wings: true, tail: true,
    prefs: { melee: ['claw', 'sword', 'chainsaw'], ranged: ['gunArm', 'laser', 'missile'], swoop: 0.35 },
  },
  v: {
    key: 'v', type: 'disassembly', eye: '#ffc93a', hair: 'v', apron: true, collar: true, wings: true, tail: true, hunter: true,
    prefs: { melee: ['chainsaw', 'claw', 'sword'], ranged: ['missile', 'laser', 'gunArm'], swoop: 0.7 },
  },
};

export const CHARACTERS = {
  uzi: {
    name: 'Uzi', species: WORKER, scale: 0.84, voice: 1.28, strength: 0.9, lines: UZI_LINES, look: LOOKS.uzi,
    traits: { bravery: 0.85, aggression: 0.6, temper: 0.8, empathy: 0.45, sociability: 0.22, curiosity: 0.8, toughness: 0.4, skill: 0.72 },
  },
  n: {
    name: 'N', species: DISASSEMBLY, scale: 1.04, voice: 0.98, strength: 1.5, lines: N_LINES, look: LOOKS.n,
    traits: { bravery: 0.5, aggression: 0.15, temper: 0.1, empathy: 0.95, sociability: 0.95, curiosity: 0.6, toughness: 0.95, skill: 0.85 },
  },
  v: {
    name: 'V', species: DISASSEMBLY, scale: 1.0, voice: 1.15, strength: 1.55, lines: V_LINES, look: LOOKS.v,
    traits: { bravery: 0.95, aggression: 0.95, temper: 0.75, empathy: 0.08, sociability: 0.5, curiosity: 0.55, toughness: 0.95, skill: 0.92 },
  },
};

/** "N", or "N 2" if there is an N already. */
function uniqueName(sb, base) {
  const taken = new Set(sb.people.map((p) => p.name));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`;
}

/** One of the three, into the sandbox at x: down out of the sky, or walking in with a railgun. */
export function spawnDrone(sb, who, x) {
  const c = CHARACTERS[who];
  const o = {
    name: uniqueName(sb, c.name), species: c.species, look: c.look, lines: c.lines,
    scale: c.scale, voice: c.voice, strength: c.strength, traits: c.traits, hair: 'none',
  };
  if (c.species === DISASSEMBLY) {
    const facing = x > 0 ? -1 : 1;
    const from = clamp(x - facing * 1.7, sb.left + 0.6, sb.right - 0.6);
    const man = sb.spawnStickman(from, 11, { ...o, airborne: true });
    if (!man) return null;
    man.facing = facing;
    man.vel.x = facing * 2.6;
    man.vel.y = -14;
    man.md.flight = { mode: 'crash', t: 0, x };
    man.md.wing.open = 1;
    man.md.wing.target = 1;
    sb.emit('droneIncoming', { who: man, x, y: 11 });
    return man;
  }
  const man = sb.spawnStickman(x, null, o);
  if (!man) return null;
  // she never goes anywhere without it
  const rg = new Railgun(sb, man.pos.x, 1);
  rg.owner = man;
  sb.guns.push(rg);
  rg.wear(man);
  man.weapon = rg;
  return man;
}

export const isDrone = (t) => !!(t && t.species && t.species.mod === 'murder-drones');
