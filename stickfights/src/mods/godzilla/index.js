/* =============================================================================
   GODZILLA - a mod for STICKFIGHTS. Two of him.

   GODZILLA ('54) - the 1954 one: charcoal-grey, scarred, a heavy brow, three
   rows of plates down his back and a tail as long as the rest of him - and
   about fourteen metres tall here, which makes the people at his feet about
   the size of his toes. He stomps, kicks, swings his tail (behind him, or
   round in a spin), roars (and the windows go), grabs people and eats them
   or throws them, bites, claws, and breathes his white-hot breath at
   whatever is far off - and with nobody left, he starts on the buildings.

   SHIN GODZILLA - bigger, slower, worse - and he changes. He comes as his
   second form: a thing that drags its belly up the street, with round
   staring eyes and gills that pour out red. In a cloud of steam it rises
   onto two legs, red and unsteady (the third); and in the steam again it is
   him, the fourth: near black, cracked all over with red, with rows of
   jagged plates, a tiny blank eye and a tail held high that ends in a knot
   of bone. He stomps, brings his tail down, roars and bites - and his atomic
   breath is black smog that catches and becomes a flood of fire, which draws
   in, purple, to a beam that cuts clean through anything it crosses. Hurt
   him badly and every plate on his back fires at once, the end of his tail
   with them; the end of his tail fires on its own, too.

   Each has more health than anything else in the game, and a bar along the
   top of the screen to show it, and very little anyone can carry does them
   any harm. They are best in the City map.

     index.js        this: the mod, as the game's mod registry sees it
     species.js      what a kaiju is to the game: health, hide, stand-in -
                     and the 1954 one
     body.js         a kaiju's body: the skeleton, the walk, the tail, the
                     shape - and the 1954 one's build
     moves.js        what the 1954 one does, and how he decides to (and how
                     any of them runs a move)
     world.js        what each of those does to everything else
     effects.js      the 1954 one's breath, and the roar's rings
     look.js         how the 1954 one is drawn
     shin.js         Shin Godzilla: what he is, his forms, what he does, his AI
     shin-body.js    his builds, one for each form
     shin-effects.js his beams; the smog and fire before them; the steam he
                     changes in; what pours out of his gills
     shin-look.js    how he is drawn, in each form
     lines.js        what everybody says about them
     reactions.js    what everybody makes of them
     sounds.js       their noises
   ========================================================================== */
import { registerMod } from '../registry.js';
import './lines.js';
import { MOD } from './moves.js';
import { spawnGodzilla, isKaiju } from './species.js';
import { spawnShin } from './shin.js';
import { setupReactions } from './reactions.js';
import { setupSounds } from './sounds.js';
import { drawGodzillaIcon, drawModIcon, drawGodzillaGhost } from './look.js';
import { drawShinIcon, drawShinGhost, shinHalf } from './shin-look.js';

registerMod({
  id: MOD,
  name: 'Godzilla',
  version: '1.2',
  about: "Two of the King of the Monsters. Godzilla ('54), as he was in 1954: fourteen metres of charcoal-grey, scarred monster with 30,000 health - he stomps, kicks, swings his tail, roars the windows out, grabs people and eats them or throws them, bites and claws, and breathes his white-hot atomic breath. And Shin Godzilla, who changes: he comes up crawling, rises onto two legs in a cloud of steam, and then is himself - eighteen metres, near black and cracked with red, 50,000 health. His breath is black smog that catches into a flood of fire, which draws in to a purple beam that cuts clean through buildings; when he is hurt every plate on his back fires, and the end of his tail. With nobody left to go after, they start on the city. Best in the City map.",
  adds: ["Godzilla ('54)", 'Shin Godzilla'],
  icon: (ctx, w, h) => drawModIcon(ctx, w, h, shinHalf),
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
  }, {
    kind: 'gz-shin',
    name: 'Shin Godzilla',
    short: 'SHIN GODZILLA',
    plural: 'people',
    limit: 'people',
    living: true,
    proper: true,
    blurb: 'Bigger, slower and worse - and he changes. He comes up crawling (his second form), rises onto two legs in a cloud of steam (his third), and then is himself: eighteen metres of black hide cracked with red, 50,000 health. Black smog, then fire, then an atomic beam that cuts clean through buildings; beams from every plate on his back, and from the end of his tail.',
    said: (man) => `${man.name} rises out of the ground's shaking`,
    icon: (ctx, w, h, card) => drawShinIcon(ctx, w, h, card),
    ghost: (ctx, at) => drawShinGhost(ctx, at),
    spawn: (sb, x) => spawnShin(sb, x),
  }],
  options: {},
  owns: (t) => isKaiju(t) || t.mod === MOD,
  setup: ({ sb, sound, cam }) => {
    setupReactions(sb);
    setupSounds(sb, sound, cam);
  },
});
