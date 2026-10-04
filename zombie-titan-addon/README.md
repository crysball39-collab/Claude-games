# Titans: Zombie Titan, Skeleton Titan, Dark Fists, Obsidian gear

**Version 1.1.0**

A Minecraft Bedrock (Pocket Edition) add-on that brings the **Zombie Titan** and the
**Skeleton Titan** from the Java *Titans Mod* to Bedrock, each with its own boss bar.
It also adds:

- the **Dark Fists** weapon
- a full set of **Obsidian** tools and armor, made from **Compact Obsidian**
- the **Growth Serum**, which turns zombies and skeletons into titans

Made for Minecraft Bedrock **1.26.50** on Android. It works on 1.21.90 and newer and
needs **no experimental toggles**. The Compact Obsidian block needs 1.26.20 or newer.

## Installing on Android

1. Download **[`dist/ZombieTitan.mcaddon`](dist/ZombieTitan.mcaddon)**.
2. Open **Files → Downloads** and tap `ZombieTitan.mcaddon`. Minecraft opens and
   imports two packs: *Zombie Titan BP* and *Zombie Titan RP*. Their descriptions
   start with the version number (*Version 1.1.0*).
3. Create a world, or edit one. Under **Behavior Packs**, activate
   **Zombie Titan BP**. Minecraft adds the resource pack with it.
4. Play. Here is where everything is in the creative inventory:
   - **Spawn eggs** (Zombie Titan, Skeleton Titan, and their minions): with the
     other spawn eggs.
   - **Dark Fists** and the **Obsidian** tools and armor: in the Equipment tab.
   - **Compact Obsidian**: in the Construction tab.
   - **Growth Serum**: in the Items tab.

If tapping the file does nothing, long-press it, choose **Open with**, and pick
**Minecraft**.

**Updating.** Import the new file the same way, then reopen your world.
- If Minecraft says the packs are already installed, go to **Settings →
  Storage**, delete the old *Zombie Titan BP* and *Zombie Titan RP*, and import
  again.
- If the world still acts like the old version, check under **Behavior Packs**
  that Zombie Titan BP is active and that its description says *Version 1.1.0*.

## The Zombie Titan

| | |
|---|---|
| Size | 32 blocks tall (16× a zombie) |
| Health | 20,000 HP |
| Damage | 120 per hit, or 240 with its sword. Some attacks multiply this. |
| XP | 10,000 to the player who kills it |
| Boss bar | Custom rotting, vine-covered bar that shows how much health it has left |

### Spawning

- **Spawn egg.** The titan claws its way out of the ground at zombie size. It grows
  to full size over 10 seconds, then roars. While it is rising it can't be hurt.
- **Growth Serum.** Throw one at a zombie and it grows into a Zombie Titan over
  8 seconds. See [Growth Serum](#growth-serum).
- **Naturally.** At night, there is a small chance that a titan rises 48–72 blocks
  from a player. The rise takes 43 seconds and the player gets a warning.
  - It is a Zombie Titan or a Skeleton Titan, with even odds.
  - At most one titan rises every two in-game days.
  - Natural spawns never happen on Peaceful.
  - To turn them off, run `/scriptevent zt:natural_spawns off`. Use `on` to turn
    them back on.

### Attacks

Each attack has a wind-up, so you can see it coming and dodge.

| Attack | What it does |
|---|---|
| **Stomp** | Stamps twice, sending a shockwave along the ground out to 28 blocks. Jump just as its foot comes down to dodge it. |
| **Downward Slash** | Lifts its sword overhead, aims, then brings it down on a strip 9 blocks wide for 10× damage. |
| **Sideways Slash** | A huge horizontal sweep with the sword. |
| **Smash** | Pounds the ground with both fists. |
| **Kick** | Kicks whatever is in front of it a long way. |
| **Swat** | Swats down players who fly or tower above it. |
| **Lightning** | Lightning crackles from its hands, then strikes you and everyone near you. |
| **Proto-zombie spit** | Spits a stream of slime balls. Each one splats and hatches minions. |
| **Roar** | A shockwave roar that knocks you back and calls up to 6 minions from the ground. |
| **Leap** | Below half health, it jumps at players who are far away. |
| **Sword Reform** | When it has lost its sword, it pounds the ground and forges a new one from the earth. |

It also crushes whatever it walks on, and pushes through trees and leaves (unless
`mobGriefing` is off). It regenerates health, faster at night.

### How to beat it

1. **Break the sword.** While the titan holds its sword, attacks from players do
   nothing. Place some **Obsidian** in the ground where you are standing. When it raises its sword
   for a **Downward Slash**, run sideways. When the blade hits the obsidian, the
   sword shatters and the titan is **stunned** for 7 seconds.
   Other blocks that break the sword:
   - Compact Obsidian
   - crying obsidian
   - netherite blocks
   - ancient debris
   - anvils
   - respawn anchors
   - enchanting tables
   - ender chests
   - reinforced deepslate
2. **Hit it hard.** Without its sword it takes damage. The **Dark Fists** deal
   **5×** damage to the titan. Arrows and other projectiles bounce off while it is
   armed, and again once it is enraged.
3. **Enraged phase.** Below 20% health its skin glows red. It moves faster,
   attacks faster, summons more minions, and takes half damage, so the Dark
   Fists' bonus drops to 2.5×.
4. **It forges a new sword** after a while (Sword Reform), so make the most of
   every opening.

Every hit from the titan kills a player in most armor, as in the Java mod. Keep
moving, and carry a Totem of Undying.

### Minions

Zombie minions fight for the titan. Each one is one of four types:

- **Loyalist**: a plain fighter.
- **Priest**: heals the titan and other minions.
- **Zealot**: fast, and leaps at you.
- **Templar**: calls lightning down on the titan's enemies.

There is also a spawn egg for minions.

### Death and loot

The titan staggers and falls face-first, shaking the ground. Then the loot rains
down:

- 128–255 rotten flesh
- 32–63 each of bones, coal and iron
- 8–15 emeralds and 8–15 diamonds
- up to 3 netherite scrap
- a stack of iron, carrots or potatoes
- a 1 in 10 chance of a bedrock block
- 16 sticks and 32 iron ingots if it died holding its sword
- 10,000 XP for the player who killed it

## The Skeleton Titan

| | |
|---|---|
| Size | 32 blocks tall (16× a skeleton), with a bow to match |
| Health | 20,000 HP |
| Damage | 120 per hit. Some attacks multiply this. Its giant arrows hit for 30 each. |
| XP | 20,000 to the player who kills it |
| Boss bar | Custom bone-white bar in a frame of bones, with two skulls on top |

### Spawning

- **Spawn egg.** It rises out of the ground at skeleton size, rattling, and grows to
  full size over 10 seconds. While it is rising it can't be hurt.
- **Naturally.** At night, like the Zombie Titan (see above). Each natural titan
  is a zombie or a skeleton, with even odds.
- **Growth Serum.** Throw one at a skeleton, stray or bogged.

### Attacks

| Attack | What it does |
|---|---|
| **Arrow Volley** | When you are more than 29 blocks away, it draws its bow and fires a stream of giant arrows at you for 11 seconds. Keep moving sideways, or get behind something solid. |
| **Bow Slam** | Raises its bow and smashes it down 12–32 blocks ahead, wherever you are standing. It deals 15× damage where the bow lands, and the shockwave hurts and throws everything within 14 blocks. Its aim locks 1.5 seconds before the bow comes down, so run sideways. |
| **Stomp** | Stamps twice, sending a shockwave along the ground. Jump just as its foot comes down to dodge it. |
| **Punch** | Punches the ground in front of it with an explosion and a shockwave. |
| **Swat** | Swats players near it and throws them a long way. |
| **Anti-air strike** | Hits players who fly or stand 6 or more blocks up, and other giants, for 4× damage. Anything next to them takes 2×. |
| **Leap** | Now and then it jumps at players who are far away. |

Like the Zombie Titan, it crushes what it walks on, regenerates health, and
summons minions.

### How to beat it

1. **Knock it down.** While it stands, attacks from players do nothing: its bones
   are too hard. Place some **Obsidian** in the ground where you are standing. When
   it lifts its bow for a **Bow Slam**, run sideways. When the bow smashes into the
   obsidian, the titan **collapses** onto its back for 22 seconds. The blocks that
   break the Zombie Titan's sword work here too.
2. **Hit it hard while it is down.** It can't heal while it is down, and the
   **Dark Fists** deal **5×** damage to it. Arrows hurt it too.
3. **Enraged phase.** Below 1/8 of its health its bones harden. It moves and
   attacks faster, arrows bounce off, and it takes half damage, so the Dark Fists'
   bonus drops to 2.5×.

### Minions

Skeleton minions shoot arrows for the titan. They come in the same four types as
zombie minions: Loyalist, Priest, Zealot and Templar. There is a spawn egg for
them too.

### Death and loot

It sinks to its knees and crashes down in a cloud of bone dust. Then the loot
rains down:

- 128–255 each of bones, arrows and coal
- 256–511 bone meal
- 48 sticks and 48 string (what is left of its bow), and a bow
- up to 15 emeralds and up to 15 diamonds
- up to 3 netherite scrap
- 1–3 skeleton skulls
- 20,000 XP for the player who killed it

## Dark Fists

| | |
|---|---|
| Damage | **9** per hit |
| Switch ability | **Crouch** while holding them |
| Use the ability | **Use**: right-click on PC, LT on a controller, or press and hold on a touch screen |

| Ability | What it does |
|---|---|
| **Barrage** | A storm of dark punches in front of you for **7 seconds**. Each punch hits for 9. Recharges 5 seconds after it ends. |
| **Dark Beam** | A short charge, then a giant dark beam fires where you look for **5 seconds**. It deals 20 damage twice a second up to 48 blocks away and withers the mobs it hits. You slow down while you fire it. Recharges 8 seconds after it ends. |

The fists can be enchanted like a sword. The selected ability shows above the
hotbar, and the item shows its cooldown.

### Crafting (crafting table)

```
 Obsidian         | Eye of Ender     | Obsidian
 Crying Obsidian  | Netherite Ingot  | Crying Obsidian
 Obsidian         | Eye of Ender     | Obsidian
```

## Obsidian gear

Obsidian tools and armor can't be made from normal Obsidian. You need
**Compact Obsidian** first.

### Compact Obsidian

A new block, crafted from **9 Obsidian** (fill the crafting grid). You can craft it
back into 9 Obsidian.

- It is 1.5× as hard to mine as obsidian. Only a diamond, netherite or obsidian
  pickaxe gets the block back.
- Explosions can't break it.
- It breaks the Zombie Titan's sword and knocks down the Skeleton Titan, like
  obsidian does.

### Tools

| Item | Damage | Durability |
|---|---|---|
| **Obsidian Sword** | **15** | 2,500 |
| Obsidian Pickaxe | 9 | 2,500 |
| Obsidian Axe | 12 | 2,500 |
| Obsidian Shovel | 8 | 2,500 |
| Obsidian Hoe | 7 | 2,500 |

The tools count as netherite tier, and they mine a little faster than netherite.

**Obsidian Sword dash.** Hold **Use** with the sword: right-click on PC, LT on a
controller, or press and hold on a touch screen. You launch about 20 blocks
forward, the way you are looking.
- Look up to dash higher. Look down to stay low.
- It recharges in 1.5 seconds. The sword shows the cooldown.
- You take no fall damage for 2.5 seconds after a dash.

### Armor

| Piece | Armor points | Durability |
|---|---|---|
| Obsidian Helmet | 3 | 510 |
| Obsidian Chestplate | 8 | 740 |
| Obsidian Leggings | 6 | 695 |
| Obsidian Boots | 3 | 600 |

That is as much armor as netherite, but it lasts longer. Wear **all four pieces**
and you get **Resistance I** as well.

All obsidian gear can be enchanted and survives lava and fire, like netherite.
To repair it, use Compact Obsidian at an anvil.

### Crafting (crafting table)

Tools and armor use the same shapes as vanilla ones. Use **Compact Obsidian** in
place of the material, and sticks for the handles. For example, the sword:

```
 Compact Obsidian
 Compact Obsidian
 Stick
```

## Growth Serum

Throw it at a mob that has a titan form, and the mob grows into that titan over
8 seconds.

| Mob | Becomes |
|---|---|
| Zombie, Husk, Drowned, Zombie Villager, Zombie Minion | **Zombie Titan** |
| Skeleton, Stray, Bogged, Skeleton Minion | **Skeleton Titan** |

- Throw it with **Use**, like a splash potion. A near miss still works if the
  bottle breaks within 2½ blocks of the mob.
- Other mobs have no titan form, so nothing happens to them.
- The new titan is hostile, so be ready to fight it.
- To keep phones running smoothly, the serum fizzles if there are already
  **3 titans within 128 blocks**. You get the bottle back when that happens.

### Crafting (crafting table)

```
 Glass | Glass                    | Glass
 Glass | Bottle of Dragon's Breath | Glass
 Glass | Glass                    | Glass
```

To get Dragon's Breath, use an empty glass bottle on the purple cloud from the
Ender Dragon's breath attack.

## Building from source

The models, textures, animations, particles, sound definitions and the obsidian
items are all generated by scripts in `tools/`. To build:

```
pip install numpy pillow
python3 tools/build.py        # regenerates everything, writes dist/ZombieTitan.mcaddon
```

Development checks:

- **Schema validation.** Checks the packs against Mojang's JSON schemas from
  [bedrock-samples](https://github.com/Mojang/bedrock-samples):
  `python3 tools/validate.py <bedrock-samples>/metadata/json_schemas`
  (needs `pip install jsonschema`).
- **Simulation.** Runs the behaviour pack scripts against a mock of the
  `@minecraft/server` API: `node tools/sim/run.mjs`.
- **Preview.** `tools/preview.py` renders the model, textures and animation
  poses to PNG.

## Version history

- **1.1.0**
  - New: the Skeleton Titan, with its own boss bar and skeleton minions.
  - New: Compact Obsidian, and Obsidian tools and armor. The sword has a dash.
  - New: the Growth Serum.
  - Natural spawns can now be either titan.
  - The version number is now in the pack descriptions.
- **1.0.1**
  - Fixed: the boss bar said "Unknown" and used the plain vanilla look. It now says
    "Zombie Titan" and uses the custom bar.
- **1.0.0**
  - First release: the Zombie Titan and the Dark Fists.

## Credits

The titans' stats, attacks and timings are based on
[The Titans Mod](https://modrinth.com/mod/the-titans-mod) for Minecraft Java
Edition. The models, textures, animations and code here are all new. The sounds
reuse Minecraft's own sound files, pitched down.
