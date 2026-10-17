/* =============================================================================
   MURDER DRONES - a mod for STICKFIGHTS.

   Three drones from a cold, dark, snowed-in planet, each with a mind, a look
   and skills of their own:

     Uzi  a worker drone, who arrives with the railgun she built
     N    a disassembly drone - wings, a tail with an acid needle, hands that
          become a chainsaw, a gun, a sword, claws, a laser or missiles - who
          comes down out of the sky and crash-lands, and would much rather be
          friends
     V    another one, the same, who would much rather not

   Nothing of it is in the game until it is installed from the MODS screen.

     index.js       this: the mod, as the game's mod registry sees it
     characters.js  who they are and how they arrive
     lines.js       what they say, and what everybody says about them
     species.js     what a drone is to the game: its hooks on a stickman
     ai.js          how a disassembly drone fights
     look.js        how they are drawn
     railgun.js     Uzi's railgun
     effects.js     beams, missiles, blasts, acid, cracked floors
     clips.js       their own animations
     sounds.js      their noises
   ========================================================================== */
import { registerMod } from '../registry.js';
import './clips.js';
import './ai.js';
import { CHARACTERS, LOOKS, spawnDrone, isDrone } from './characters.js';
import { drawDroneIcon, drawModIcon } from './look.js';
import { drawHeldRailgun } from './railgun.js';
import { setupSounds } from './sounds.js';

const living = (kind, blurb, said) => ({
  kind: 'md-' + kind,
  name: CHARACTERS[kind].name,
  short: CHARACTERS[kind].name.toUpperCase(),
  plural: 'people',
  limit: 'people',
  living: true,
  proper: true,
  blurb,
  said,
  icon: (ctx, w, h, card) => drawDroneIcon(ctx, w, h, card, kind, LOOKS, drawHeldRailgun),
  spawn: (sb, x) => spawnDrone(sb, kind, x),
});
const falling = (man) => `${man.name} is coming down out of the sky!`;

registerMod({
  id: 'murder-drones',
  name: 'Murder Drones',
  version: '1.0',
  about: 'Three drones from a cold, dark planet, each with a mind, a look and skills of their own. Worker drone Uzi brings the railgun she built; disassembly drones N and V crash-land out of the sky, wings out, with acid-tipped tails and hands that turn into weapons.',
  adds: ['Uzi', 'N', 'V'],
  icon: (ctx, w, h) => drawModIcon(ctx, w, h, LOOKS),
  spawnables: [
    living('uzi', 'Worker drone. Brave, sarcastic, and carrying the railgun she built: it charges, then goes through everything in a line.',
      (man) => `${man.name} appeared, railgun in hand`),
    living('n', 'Disassembly drone. Crash-lands, wings out. Chainsaw, gun, sword, claw, laser and missile hands; a nanite acid tail. Kind, and would rather be friends.', falling),
    living('v', 'Disassembly drone. Crash-lands, wings out. Every one of N\'s abilities, and none of his manners: she hunts.', falling),
  ],
  options: {
    showoff: () => 'Show off what their hands can do',
  },
  owns: (t) => isDrone(t) || t.kind === 'railgun' || (t.kind === 'limb' && isDrone(t.from)),
  setup: ({ sb, sound, cam }) => setupSounds(sb, sound, cam),
});
