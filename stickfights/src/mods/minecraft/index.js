/* =============================================================================
   MINECRAFT - a mod for STICKFIGHTS.

   Things out of a world made of blocks:

     Steve           a blocky man with a diamond sword, a bow and three golden
                     apples, who fights monsters and gets on with people
     three blocks    a Crafting Table, Soul Sand and Wither Skulls - which,
                     crafted together, make a Wither Totem
     the Wither      a boss, with a bar along the top and 600 health, that
                     comes out of the totem when it is activated: skulls,
                     blue skulls, withering, armour at half its health, a
                     charge, wither skeletons - and a Nether Star when it is
                     beaten
     wither skeletons  called up by the Wither, stone swords, every cut withers

   Nothing of it is in the game until it is installed from the MODS screen.

     index.js     this: the mod, as the game's mod registry sees it
     steve.js     Steve: who he is, his kit, how he fights
     wither.js    the Wither
     skeleton.js  wither skeletons
     blocks.js    the blocks, the items, crafting, the totem
     effects.js   explosions, withering, skulls, arrows, smoke and sparkle
     look.js      how all of it is drawn
     pixels.js    pixel art: sprites and textures
     lines.js     what Steve says, and what everybody says about all this
     clips.js     its own animations
     sounds.js    its noises
   ========================================================================== */
import { registerMod } from '../registry.js';
import './clips.js';
import { spawnSteve, isMinecraft } from './steve.js';
import { spawnWither } from './wither.js';
import { spawnBlock, spawnSkull, placeTotem, inventory } from './blocks.js';
import { drawIcon, drawModIcon } from './look.js';
import { MOD } from './effects.js';
import { setupSounds } from './sounds.js';

const thing = (kind, name, short, plural, limit, blurb, spawn, icon, more = {}) => ({
  kind: 'mc-' + kind, name, short, plural, limit, blurb, spawn,
  icon: (ctx, w, h, card) => drawIcon(ctx, w, h, card, icon),
  ...more,
});

registerMod({
  id: MOD,
  name: 'Minecraft',
  version: '1.0',
  about: 'Out of a world made of blocks: Steve, with his diamond sword, his bow and his golden apples - and the Wither. Craft a Wither Totem from soul sand and wither skulls at a crafting table, set it down, and press ACTIVATE: it rises, glows, shakes, and explodes into a three-headed boss with 600 health, a second phase, and an army of wither skeletons.',
  adds: ['Steve', 'Crafting Table', 'Soul Sand', 'Wither Skull', 'Wither Totem', 'The Wither', 'Wither Skeletons', 'Nether Star'],
  icon: (ctx, w, h) => drawModIcon(ctx, w, h),
  spawnables: [
    thing('steve', 'Steve', 'STEVE', 'people', 'people',
      'Blocky, calm and brave. A diamond sword, a bow for anything out of reach, and three golden apples. Fights monsters; gets on with people.',
      (sb, x) => spawnSteve(sb, x), 'steve', { living: true, proper: true, said: (m) => `${m.name} spawned in` }),
    thing('table', 'Crafting Table', 'TABLE', 'crates and blocks', 'crates',
      'A block. Tap it to craft: 4 Soul Sand and 3 Wither Skulls next to it make a Wither Totem.',
      (sb, x, y) => spawnBlock(sb, 'table', x, Math.max(y, 0.4)), 'table'),
    thing('soul', 'Soul Sand', 'SOUL SAND', 'crates and blocks', 'crates',
      'A block of dark sand full of faces. Four of them go into a Wither Totem.',
      (sb, x, y) => spawnBlock(sb, 'soul', x, Math.max(y, 0.4)), 'soul'),
    thing('skull', 'Wither Skull', 'SKULL', 'things from mods', 'items',
      'A wither skeleton\'s skull. Three of them go on top of a Wither Totem.',
      (sb, x, y) => spawnSkull(sb, x, Math.max(y, 0.2)), 'skull'),
    thing('totem', 'Wither Totem', 'TOTEM', 'things from mods', 'items',
      'Crafted at a crafting table, then placed from here. Press ACTIVATE on it to bring the Wither.',
      (sb, x) => placeTotem(sb, x, (s, cx, cy) => spawnWither(s, cx, cy)), 'totem', {
        badge: () => (inventory.totems ? `×${inventory.totems}` : 'CRAFT'),
        locked: () => inventory.totems <= 0,
        why: () => 'Craft one first: put 4 Soul Sand and 3 Wither Skulls next to a Crafting Table, then tap the table',
        said: () => 'A Wither Totem. Press ACTIVATE on it when you are ready',
        proper: false,
      }),
  ],
  options: {
    eatApple: () => 'Eat a golden apple',
  },
  owns: (t) => isMinecraft(t) || t.mod === MOD || (t.kind === 'limb' && isMinecraft(t.from)),
  cleanup: () => { inventory.totems = 0; },
  setup: ({ sb, sound, cam }) => setupSounds(sb, sound, cam),
});
