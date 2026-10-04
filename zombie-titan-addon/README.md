# Titans: Zombie, Skeleton and Creeper Titans, Dark Fists, Obsidian gear, Gum Gum Fruit

**Version 1.2.0**

A Minecraft Bedrock (Pocket Edition) add-on that brings the **Zombie Titan**, the
**Skeleton Titan** and the **Creeper Titan** from the Java *Titans Mod* to Bedrock,
each with its own boss bar. It also adds:

- the **Dark Fists** weapon
- a full set of **Obsidian** tools and armor, made from **Compact Obsidian**
- the **Growth Serum**, which turns zombies, skeletons and creepers into titans
- the **Gum Gum Fruit**: eat it to get rubber powers (and lose the ability to swim)

Made for Minecraft Bedrock **1.26.50** on Android. It works on 1.21.90 and newer and
needs **no experimental toggles**. The Compact Obsidian block needs 1.26.20 or newer.

## Installing on Android

1. Download **[`dist/ZombieTitan.mcaddon`](dist/ZombieTitan.mcaddon)**.
2. Open **Files → Downloads** and tap `ZombieTitan.mcaddon`. Minecraft opens and
   imports two packs: *Zombie Titan BP* and *Zombie Titan RP*. Their descriptions
   start with the version number (*Version 1.2.0*).
3. Create a world, or edit one. Under **Behavior Packs**, activate
   **Zombie Titan BP**. Minecraft adds the resource pack with it.
4. Play. Here is where everything is in the creative inventory:
   - **Spawn eggs** (the three titans and their minions): with the other spawn eggs.
   - **Dark Fists** and the **Obsidian** tools and armor: in the Equipment tab.
   - **Compact Obsidian**: in the Construction tab.
   - **Growth Serum**: in the Items tab.
   - **Gum Gum Fruit**: in the Nature tab.

If tapping the file does nothing, long-press it, choose **Open with**, and pick
**Minecraft**.

**Updating.** Import the new file the same way, then reopen your world.
- If Minecraft says the packs are already installed, go to **Settings →
  Storage**, delete the old *Zombie Titan BP* and *Zombie Titan RP*, and import
  again.
- If the world still acts like the old version, check under **Behavior Packs**
  that Zombie Titan BP is active and that its description says *Version 1.2.0*.

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
  - It is a Zombie, Skeleton or Creeper Titan, with even odds.
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
- **Naturally.** At night, like the Zombie Titan (see above).
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

## The Creeper Titan

| | |
|---|---|
| Size | 26 blocks tall (16× a creeper), on four splayed, jointed legs |
| Health | 25,000 HP |
| Damage | 180 per hit; its slams deal double. Hits twice as hard once it is charged. |
| XP | 50,000 to the player who kills it |
| Boss bar | Custom bar with a grass-and-dirt frame, a creeper head at each end and a TNT block on top |

### Spawning

- **Spawn egg.** It rises out of the ground at creeper size, hissing, and grows to
  full size over 10 seconds. While it is rising it can't be hurt.
- **Naturally.** At night, like the Zombie Titan.
- **Growth Serum.** Throw one at a creeper.

### Attacks

| Attack | What it does |
|---|---|
| **Head Slam** | Rears its head back, then whips it into the ground about 11 blocks in front, and calls lightning down on you. |
| **Stomp** | Rears up on one side, then the other, sending a shockwave along the ground each time. Jump just as its feet land to dodge it. |
| **Body Slam** | Rears up on its back legs and crashes its whole body down in front of it, throwing everything nearby into the air. |
| **Kick** | Lashes out with a front leg. |
| **Anti-air strike** | Springs up at players who fly or stand 6 or more blocks up, and at other giants: 4× damage. |
| **TNT Rain** | When you are far away: primed TNT falls all around you, and fireballs fly from above its head. Run out from under it! |
| **Thunder Clap** | Rears up, claps its front legs together over its head, smashes its head down with lightning and a blast, then slams its body down. |
| **Lightning** | Every few seconds the air crackles with sparks where you stand. Move! A second later lightning and a blast strike there. |
| **Leap** | Now and then it jumps at players who are far away. |

### How to beat it

1. **Hit its head while it is down.** Explosions and lightning never hurt it, and
   attacks from players do nothing while it stands. Three attacks bring its head
   down to the ground in front of it: the **Head Slam**, the **Body Slam** and the
   **Thunder Clap**. Stay out of the blast, then run in **in front of it** and hit
   it before it gets up. It keels over onto its side for 23 seconds.
2. **Hit it hard while it is down.** It can't heal while it is down, and the
   **Dark Fists** deal **5×** damage to it. Gum Gum moves count as hits too.
3. **Charged.** Below 1/4 of its health it becomes charged: a blue swirl crackles
   around it, it moves and attacks faster, calls lightning far more often, drops
   twice as much TNT, takes half damage, and arrows bounce off.

### Minions

Creeper minions sneak up on you and explode like creepers. They come in the same
four types as the other minions: Loyalist, Priest, Zealot and Templar. Templars are
charged, so their blast is twice as big. There is a spawn egg for them too.

### Death: it slowly explodes

When it dies, it staggers and topples onto its side. Five seconds later **its fuse
lights**: everyone nearby sees **RUN!**.
- For 10 seconds it swells up and flashes white, faster and faster, while sparks
  and small blasts pop out of it and a countdown shows.
- Then five huge explosions run along its body, one after another. They leave a
  crater when `mobGriefing` is on.
- The blast throws and hurts everything within 48 blocks (72 if it died charged).
  The closer you are, the worse it is.

A second later the loot falls into the crater:

- 256–511 gunpowder and 64–127 TNT
- 32–63 coal
- 8–15 emeralds and 8–15 diamonds
- up to 3 netherite scrap
- 4–8 music discs and 1–2 creeper heads
- a 1 in 10 chance of a bedrock block
- 50,000 XP for the player who killed it

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
| Creeper, Creeper Minion | **Creeper Titan** |

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

## Gum Gum Fruit

Eat the swirly purple **Gum Gum Fruit** and your body turns to rubber.

### Getting it

Break leaf blocks of any tree. Each one has a **0.001%** chance (1 in 100,000) to
drop a Gum Gum Fruit, so it is very rare. In creative it is in the Nature tab.

### Eating it

Eat it like any food. You get six items: the five moves and **Gear 2**.
- They can't be dropped or put in chests.
- You keep them when you die.
- If one goes missing, it comes back when you respawn.

To use a move, hold it and press **Use**: right-click on PC, LT on a controller, or
press and hold on a touch screen. Your arms (and leg) really stretch, in first person
and third person, and other players see it too.

### Moves

| Move | What it does | Damage (Jet) |
|---|---|---|
| **Gum Gum Pistol** | Stretches your arm back, then punches whatever you look at, up to 16 blocks away, and snaps back. | 12 (20) |
| **Gum Gum Bazooka** | The same with both arms: a double palm strike that throws mobs far away. | 20 (32) |
| **Gum Gum Gatling** | 7 seconds of rapid stretching punches at everything in front of you (6 blocks, Jet 9). | 12 every half second (25) |
| **Gum Gum Stamp** | Stretches your leg straight up, then slams it down 3 blocks ahead: flying debris, a shockwave and an explosion. It breaks no blocks. | 16, half a bit further out (26) |
| **Gum Gum Rocket** | Stretches both arms out to grab the block or mob you look at (up to 22 blocks), then flings you to it. A grabbed mob gets slammed. No fall damage when you land. | 14 (24) |

Each move recharges for a moment after you use it; the item shows the cooldown.

### Gear 2

Use **Gear 2** and you press your fist to the ground.
- Your skin turns **pink** and steam pours off you for 60 seconds.
- You get **10 extra hearts** and Speed.
- Every move is replaced by its **Jet** version, which is faster and hits harder:
  Gum Gum Jet Pistol, Jet Bazooka, Jet Gatling, Jet Stamp and Jet Rocket.

Use Gear 2 again to end it early. Afterwards your body needs 30 seconds to recover.

### The catch: you can't swim

In water you **sink like a stone**, get Slowness and Weakness, and none of your
powers work. Stay out of deep water!

Gum Gum moves count as your own hits on the titans. They can't hurt a Zombie Titan
holding its sword, or a Skeleton or Creeper Titan that is standing. They **can**
knock the Creeper Titan out when its head is down.

**Note:** the pink skin and the stretching arms in first person come from a tweaked
copy of the vanilla player model file. Another add-on that also changes the player
model can clash with it.

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

- **1.2.0**
  - New: the Creeper Titan, with its own boss bar, creeper minions, TNT rain,
    lightning and a slow death explosion.
  - New: the Gum Gum Fruit, with five moves, Gear 2 and its Jet moves.
  - The Growth Serum now also works on creepers, and natural spawns can be any of
    the three titans.
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

The Gum Gum Fruit and its moves are a fan tribute to *One Piece* by Eiichiro Oda.

The titans' stats, attacks and timings are based on
[The Titans Mod](https://modrinth.com/mod/the-titans-mod) for Minecraft Java
Edition. The models, textures, animations and code here are all new. The sounds
reuse Minecraft's own sound files, pitched down.
