/* =============================================================================
   GODZILLA - a mod for STICKFIGHTS.

   The 1954 one: charcoal-grey, scarred, a heavy brow, three rows of plates
   down his back and a tail as long as the rest of him - and about fourteen
   metres tall here, which makes the people at his feet about the size of
   his toes. He has more health than anything else in the game, a bar along
   the top of the screen to show it, and very little that anyone can carry
   does him any harm.

   He stomps, kicks, swings his tail (behind him, or round in a spin), roars
   (and the windows go), grabs people and eats them or throws them, bites,
   claws, and breathes his white-hot breath at whatever is far off - and with
   nobody left, he starts on the buildings. He is best in the City map.

     index.js      this: the mod, as the game's mod registry sees it
     species.js    what he is to the game: his health, his hide, his stand-in
     body.js       his body: the skeleton, the walk, the tail, his shape
     moves.js      what he does, and how he decides to
     world.js      what each of those does to everything else
     effects.js    the breath, and the roar's rings
     look.js       how he is drawn
     lines.js      what everybody says about him
     reactions.js  what everybody makes of him
     sounds.js     his noises
   ========================================================================== */
import { registerMod } from '../registry.js';
import './lines.js';
import { MOD } from './moves.js';
import { spawnGodzilla, isGodzilla } from './species.js';
import { setupReactions } from './reactions.js';
import { setupSounds } from './sounds.js';
import { drawGodzillaIcon, drawModIcon, drawGodzillaGhost } from './look.js';

registerMod({
  id: MOD,
  name: "Godzilla ('54)",
  version: '1.0',
  about: "Gojira - Godzilla - as he was in 1954: fourteen metres of charcoal-grey, scarred monster, with three rows of plates down his back and 30,000 health. He stomps, kicks, swings his tail, roars the windows out, grabs people and eats them or throws them, bites and claws - and breathes his white-hot atomic breath. With nobody left to go after, he starts on the city. Best in the City map.",
  adds: ["Godzilla ('54)"],
  icon: (ctx, w, h) => drawModIcon(ctx, w, h),
  spawnables: [{
    kind: 'gz-godzilla',
    name: "Godzilla ('54)",
    short: "GODZILLA '54",
    plural: 'people',
    limit: 'people',
    living: true,
    proper: true,
    blurb: "The King of the Monsters, the 1954 one. Giant, nearly unhurt by anything a person can carry, with 30,000 health and a bar to show it. Stomps, kicks, tail whips, roars, grabs, eats, throws, bites, claws - and the atomic breath.",
    said: (man) => `${man.name} rises out of the ground's shaking`,
    icon: (ctx, w, h, card) => drawGodzillaIcon(ctx, w, h, card),
    ghost: (ctx, at) => drawGodzillaGhost(ctx, at),
    spawn: (sb, x) => spawnGodzilla(sb, x),
  }],
  options: {},
  owns: (t) => isGodzilla(t) || t.mod === MOD,
  setup: ({ sb, sound, cam }) => {
    setupReactions(sb);
    setupSounds(sb, sound, cam);
  },
});
