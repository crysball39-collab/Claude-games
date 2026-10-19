/* =============================================================================
   SHALLOW - a mod for STICKFIGHTS.

   Something that looks like a stickman, and is not. It walks about as one -
   a name, a haircut, a voice, friends - and nobody can tell. Make it angry
   and it splits open and tears its way out of the skin: tall, thin and
   black, with two white pupils, a grin full of sharp teeth from one side of
   its head to the other, and five long black claws on each hand.

   Then it goes after whoever made it angry. It picks them up by the neck,
   and tears them in half or eats them. And when there is nobody left it is
   angry with, it takes the nearest person, cuts their back open, pulls out
   their skeleton and everything else, and climbs inside - and gets up as
   them: their name, their height, their hair and voice, their uniform,
   their friends. Only the people who saw it happen know.

   Nothing of it is in the game until it is installed from the MODS screen.

     index.js      this: the mod, as the game's mod registry sees it
     species.js    what it is to the game, in each body - and its mind
     common.js     what the rest share: where its hands and mouth are
     look.js       how it is drawn, and what it leaves behind
     remains.js    what it leaves lying about: skins, legs, skeletons, insides
     reactions.js  what everybody makes of it, and remembers
     lines.js      what it says, and what everybody says about it
     clips.js      its own animations
     sounds.js     its noises
   ========================================================================== */
import { registerMod } from '../registry.js';
import { rand } from '../../core/util.js';
import './clips.js';
import { MOD, isShallowThing } from './common.js';
import { DISGUISE } from './species.js';
import { setupReactions } from './reactions.js';
import { setupSounds } from './sounds.js';
import { drawShallowIcon, drawModIcon } from './look.js';

/** It arrives as somebody: nobody in particular, with a short temper. */
export function spawnShallow(sb, x) {
  return sb.spawnStickman(x, null, {
    species: DISGUISE,
    traits: {
      temper: rand(0.72, 0.95), aggression: rand(0.25, 0.5), bravery: rand(0.6, 0.9), empathy: rand(0.2, 0.5),
      sociability: rand(0.45, 0.85), curiosity: rand(0.3, 0.7), toughness: rand(0.45, 0.7), skill: rand(0.4, 0.7),
    },
  });
}

registerMod({
  id: MOD,
  name: 'Shallow',
  version: '1.0',
  about: 'Something disguised as a stickman. Make it angry and it tears out of the skin - tall and black, with white pupils, a grin of sharp teeth and five long claws on each hand - grabs whoever did it, and tears them in half or eats them. Then it empties out the nearest person, climbs inside, and becomes them.',
  adds: ['Shallow'],
  icon: (ctx, w, h) => drawModIcon(ctx, w, h),
  spawnables: [{
    kind: 'sh-shallow',
    name: 'Shallow',
    short: 'SHALLOW',
    plural: 'people',
    limit: 'people',
    living: true,
    proper: true,
    blurb: 'Looks like anybody. Is not. Make it angry and it tears out of its skin: it kills whoever did it, then takes the nearest person apart and becomes them.',
    said: (man) => `${man.name} wandered in. Nobody looks twice.`,
    icon: (ctx, w, h, card) => drawShallowIcon(ctx, w, h, card),
    spawn: (sb, x) => spawnShallow(sb, x),
  }],
  options: {},
  owns: (t) => isShallowThing(t) || (t.kind === 'limb' && isShallowThing(t.from)),
  setup: ({ sb, sound, cam }) => {
    setupReactions(sb);
    setupSounds(sb, sound, cam);
  },
});
