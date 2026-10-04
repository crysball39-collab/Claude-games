# Zombie Titan + Dark Fists

A Minecraft Bedrock (Pocket Edition) add-on that brings the **Zombie Titan** from
the Java *Titans Mod* to Bedrock, with its own boss bar, and adds the **Dark Fists**
weapon.

Made for Minecraft Bedrock **1.26.50** on Android. It works on 1.21.90 and newer and
needs **no experimental toggles**.

## Installing on Android

1. Download **[`dist/ZombieTitan.mcaddon`](dist/ZombieTitan.mcaddon)**.
2. Open **Files → Downloads** and tap `ZombieTitan.mcaddon`. Minecraft opens and
   imports two packs: *Zombie Titan BP* and *Zombie Titan RP*.
3. Create a world, or edit one. Under **Behavior Packs**, activate
   **Zombie Titan BP**. Minecraft adds the resource pack with it.
4. Play. The Spawn Zombie Titan egg is in the creative inventory with the other
   spawn eggs, and the Dark Fists are with the swords.

If tapping the file does nothing, long-press it, choose **Open with**, and pick
**Minecraft**.

## The Zombie Titan

| | |
|---|---|
| Size | 32 blocks tall (16× a zombie) |
| Health | 20,000 HP |
| Damage | 120 per hit, or 240 with its sword. Some attacks multiply this. |
| XP | 10,000 to the player who kills it |
| Boss bar | Custom rotting, vine-covered bar showing the HP left. It also says whether the titan still holds its sword. |

### Spawning

- **Spawn egg.** The titan claws its way out of the ground at zombie size. It grows
  to full size over 10 seconds, then roars. While it is rising it can't be hurt.
- **Naturally.** At night, there is a small chance that a titan rises 48–72 blocks
  from a player. The rise takes 43 seconds and the player gets a warning.
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

## Building from source

The textures, animations, particles and sound definitions are all generated by
scripts in `tools/`. To build:

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

## Credits

The Zombie Titan's stats, attacks and timings are based on
[The Titans Mod](https://modrinth.com/mod/the-titans-mod) for Minecraft Java
Edition. The models, textures, animations and code here are all new. The sounds
reuse Minecraft's own sound files, pitched down.
