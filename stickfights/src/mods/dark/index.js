/* =============================================================================
   THINGS IN THE DARK - a mod for STICKFIGHTS.

   Three things that should not be there, and somewhere to hide from them:

     the Grasp     the lights go, on and off, and there is a moaning far off,
                   coming nearer - then a tide of pale arms comes through from
                   one end of the world to the other, faster than anybody can
                   run, and takes whoever is out in the open. It has no legs:
                   it floats, a little above the floor, and is gone.
     the Rattle    the same - the lights, then chain rattling, nearer - and a
                   spinning knot of rusted chain and hooks with fire at its
                   middle tears through. Then it comes back. Two to six more
                   times, faster each time, from whichever end it went out of.
     the Listener  tall, thin, grey, no eyes at all and two great ears. It
                   cannot see. It hears everything - footsteps, voices,
                   breathing, a gun going off anywhere - and whoever it gets
                   its hands on, it crushes. Keep still and quiet, crouch and
                   creep, and it can walk right past.
     a wardrobe    room for two. Whoever is in it is passed by - unless the
                   Listener is right outside, and can hear them breathing.

   Everybody learns: the first time the lights go nobody knows what it means;
   after that, they hide. Around the Listener they whisper, creep about
   crouched, and freeze when it is close.

   Nothing of it is in the game until it is installed from the MODS screen.

     index.js      this: the mod, as the game's mod registry sees it
     rush.js       the Grasp and the Rattle: the warning, the passes, whoever
                   they take, the Rattle coming back
     listener.js   the Listener: its hearing, its hunting, its hands
     wardrobe.js   the wardrobe, getting into it and out, and when people do
     reactions.js  what everybody makes of all of it, and learns
     look.js       how it is all drawn
     lines.js      what everybody says
     sounds.js     its noises
     common.js     what the rest share
   ========================================================================== */
import { registerMod } from '../registry.js';
import { MOD, isDarkThing } from './common.js';
import { startRush } from './rush.js';
import { spawnListener, setupListening } from './listener.js';
import { spawnWardrobe } from './wardrobe.js';
import { setupReactions } from './reactions.js';
import { setupSounds } from './sounds.js';
import './lines.js';
import { drawIcon, drawModIcon } from './look.js';

const thing = (kind, name, short, plural, limit, blurb, spawn, more = {}) => ({
  kind: 'dk-' + kind, name, short, plural, limit, blurb, spawn,
  icon: (ctx, w, h, card) => drawIcon(ctx, w, h, card, kind),
  ...more,
});

registerMod({
  id: MOD,
  name: 'Things in the Dark',
  version: '1.0',
  about: 'Three things that should not be there. The Grasp: the lights flicker, a moan rises - and a tide of pale arms comes through from one end of the world to the other and takes whoever is out in the open. The Rattle: the same, a spinning knot of rusted chain - and then it comes back, again and again. The Listener: blind, all ears, and it hears everything. And a wardrobe to hide in.',
  adds: ['The Grasp', 'The Rattle', 'The Listener', 'Wardrobe'],
  icon: (ctx, w, h) => drawModIcon(ctx, w, h),
  spawnables: [
    thing('grasp', 'The Grasp', 'GRASP', 'things from mods', 'items',
      'Tap anywhere: the lights start to go - and it comes through from the nearer end of the world to the other, and takes whoever is out in the open. Hide in a wardrobe.',
      (sb, x) => startRush(sb, 'grasp', x), { said: () => 'The lights are flickering...', living: false }),
    thing('rattle', 'The Rattle', 'RATTLE', 'things from mods', 'items',
      'Like the Grasp - the lights, then it comes through - but when it has gone out at the far end, it comes back. Two to six more times, faster each time.',
      (sb, x) => startRush(sb, 'rattle', x), { said: () => 'Something is rattling, far off...', living: false }),
    thing('listener', 'The Listener', 'LISTENER', 'people', 'people',
      'Blind. Hears everything: footsteps, voices, breathing, gunshots. Whoever it gets its hands on, it crushes. Keep still, keep quiet, crouch and creep - and it may walk right past.',
      (sb, x) => spawnListener(sb, x), { living: true, proper: true, said: () => 'The Listener. It is listening.' }),
    thing('wardrobe', 'Wardrobe', 'WARDROBE', 'things from mods', 'items',
      'A tall old wardrobe with room for two. Whoever is shut inside is passed by - unless the Listener is right outside and hears them breathe.',
      (sb, x) => spawnWardrobe(sb, x), { said: () => 'A wardrobe' }),
  ],
  options: {
    hideIn: () => 'Hide in a wardrobe',
  },
  owns: (t) => isDarkThing(t),
  cleanup: (sb) => {
    // anybody hidden in one of its wardrobes is out of it
    if (sb) for (const p of sb.people) if (p.hiddenIn && p.hiddenIn.mod === MOD) p.hiddenIn = null;
  },
  setup: ({ sb, sound, cam }) => {
    setupListening(sb);
    setupReactions(sb);
    setupSounds(sb, sound, cam);
  },
});
