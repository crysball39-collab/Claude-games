# BLACKSMITH

A 3D, third person mining and forging game for phones, played in landscape, that
runs in a browser. No install, no build step to play it, and no assets on disk:
every texture, icon and sound is made by the code when it loads.

You spawn on a stone circle in a meadow. One path runs left to the **Forge**; the
other runs straight ahead to a **Cave** with a wooden sign hung over its mouth.
Mine ore in the cave, take it to the anvil, and forge weapons and armour whose
every part is made of the ore you put in.

## Getting it onto a phone

**`dist/blacksmith.html` is the whole game in one file.** Download it and open it:
no server, no network. Turn the phone landscape. For a full-screen game with no
browser bars, use **Add to Home Screen** and launch it from the icon.

To run the source instead, serve the repository root over http (ES modules do not
load from `file://`) and open `/blacksmith/`:

```
./serve.sh             # then http://localhost:8080/blacksmith/
npm run build:blacksmith   # rebuilds dist/blacksmith.html (needs esbuild)
```

## Controls

| Touch | Keyboard and mouse | |
| ----- | ------------------ | - |
| Left thumb: joystick | WASD | move |
| Drag anywhere else | drag the mouse, wheel zooms | turn the camera |
| **ATTACK** (hold to keep swinging) | click, F | swing |
| **DASH** | Space | a quick dodge; nothing can hit you mid-dash |
| **SPRINT** (switches on and off) | hold Shift | run |
| The bag on the right edge | I or Tab | inventory |
| **TALK** / **ANVIL** when you are close, or tap Rob or the anvil | E | use |

ATTACK picks the right tool by itself: at a rock you swing your pickaxe, at a
skeleton your weapon. Dash and sprint use stamina, the yellow bar; HP is the red
one. Your level floats over your head.

## The game

### The cave

Inside is one round stone room with a round stone wall in the middle of it, so
the floor is a ring you can walk all the way round. Pebbles, rocks and boulders
grow out of the floor, and are replaced a few seconds after you break them.

| | HP | Ores when broken | Takes |
| - | -- | ---------------- | ----- |
| Pebble | 20 | 2 | any pickaxe |
| Rock | 50 | 3 | any pickaxe |
| Boulder | 150 | 4 | the Stone Pickaxe |

You start with a **Wood Pickaxe** (5 damage to rocks). The **Stone Pickaxe** does
10, breaks boulders, and costs $1,000 from Rob.

### Ores

Every ore out of a rock is rolled separately on this table:

| Ore | Rarity | Chance | Forges at |
| --- | ------ | ------ | --------- |
| Stone | Common | 1 in 2 | ×1.0 |
| Bronze | Uncommon | 1 in 5.6 | ×1.4 |
| Iron | Uncommon | 1 in 7 | ×1.8 |
| Bones | Uncommon | 1 in 25 per skeleton | ×2.0 |
| Gold | Rare | 1 in 12 | ×2.6 |
| Amethyst | Rare | 1 in 20 | ×3.2 |
| Emerald | Epic | 1 in 40 | ×4.2 |
| Diamond | Epic | 1 in 60 | ×5.2 |
| Irisite | Legendary | 1 in 300 | ×8.0 |

The design asked for Bronze 1 in 4 and Iron 1 in 5 as well, but taken literally the
eight chances add up to 113%, so they cannot all hold at once. Stone keeps its 1 in
2 and every Rare, Epic and Legendary ore keeps its exact chance; Bronze and Iron
share what is left, in the same 4 to 5 proportion, which makes them 1 in 5.6 and 1
in 7. The numbers live in `src/game/data.js`.

### Rob and his bounty

Rob is just inside the cave. Kill **3 skeletons** for him and he pays **$1,000 and
100 EXP**, as often as you like. There are always three skeletons in the cave, each
with a wooden dagger; a killed one falls to pieces and another climbs out of the
floor elsewhere a few seconds later. One in 25 leaves its **Bones** behind, which
forge like an ore. Skeletons never come into Rob's camp or the tunnel.

Levels take 100 EXP times your level to climb, and each one adds 5 max HP.

### The anvil

Tap the anvil in the Forge and the camera zooms in on it. Choose what to make,
then put ore in up to **three slots**, any amount of each, until the count is right:

| Weapon | Ore | | Armour (Light) | Ore |
| ------ | --- | - | -------------- | --- |
| Dagger (light) | 3 | | Helmet | 2 |
| Straight-Sword (medium) | 10 | | Chestplate | 5 |
| Broadsword (heavy) | 20 | | Leggings | 3 |
| | | | Boots | 2 |

The ore you put the **most** of becomes the sword's **blade** or the armour's
**plating**; the **second most**, the **cross-guard** or the **rest of the armour**;
the **least**, the **pommel** or the **trim**. A tie goes to the slot further left.
Each part is drawn in its ore, on you and in its icon. Damage and defence are the
base number times the ore's strength, weighted by how much of each went in.

Forging pours the lava bucket into the sword mould, hammers the casting on the
anvil, and quenches it in the water bucket before handing it over.

### Dying and saving

Dying costs nothing: not an ore, not an item, not a dollar. You wake on the stone
circle. The game saves itself as you play (and when the tab is hidden); **SAVE
GAME** in the pause menu saves on demand, and **CONTINUE** on the main menu picks
up where you left off. NEW GAME asks before it erases a saved smith.

## Layout

```
blacksmith/
  index.html          every screen's markup
  styles/main.css     the HUD and menus, safe-area aware
  src/
    main.js           start-up, menus, pause, the frame loop
    core/             helpers, loading screen, input, full screen
    game/
      data.js         every number the game is balanced on
      profile.js      your cash, EXP, ores, items, equipment, bounty
      save.js         storage, with an in-memory fallback
      overworld.js    the meadow, the paths, the Forge, the cave mouth
      cave.js         the ring-shaped room, its torches, Rob's camp
      rocks.js        mining, drops and regrowth
      skeletons.js    the skeletons and how they fight
      rob.js          Rob
      player.js       you
      character.js    the jointed rig everyone is built on, and its animation
      gear.js         weapons, pickaxes and armour, part by part in their ores
      camera.js       the third person camera and its anvil close-up
      fx.js           sparks, chips, smoke, steam, flying ore, damage numbers
      sfx.js          synthesised sound
      game.js         ties it all together: travel, combat, the bounty, forging
    ui/               HUD, bag, anvil menu, talking, icons, main menu
  tools/
    build.mjs         folds the game into dist/blacksmith.html
    verify.mjs        drives the real game in Chromium and checks the rules
```

three.js comes from `vendor/three.module.js` at the repository root, shared with
GOREBOX.

## Verifying it

`tools/verify.mjs` checks the ore table and forging rules directly, then boots the
game in Chromium on a phone-sized touch screen and plays it: the stone circle and
the stick, the anvil (tapped, zoomed, filled through its menu, the pour and the
parts that come out), the bag, the cave ring, pebbles taking 4 hits for 2 ores and
rocks 10 for 3, boulders refusing the Wood Pickaxe, Rob's bounty and its pay and
level, buying the Stone Pickaxe and breaking a boulder in 15 hits for 4 ores, dying
without losing anything, and a reload restoring the save.

```
npm run verify:blacksmith            # the source, over http
npm run build:blacksmith && npm run verify:blacksmith:file   # the single file, from disk
```
