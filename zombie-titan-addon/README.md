# Titans: Zombie, Skeleton, Creeper and Spider Titans, the Omegafish, Dark Fists, Obsidian gear, Gum Gum Fruit, Doors, Players

**Version 1.7.0**

A Minecraft Bedrock (Pocket Edition) add-on that brings the **Zombie Titan**, the
**Skeleton Titan**, the **Creeper Titan**, the **Spider Titan** and the **Omegafish**
(the silverfish titan) from the Java *Titans Mod* to Bedrock, each with its own boss
bar. It also adds:

- the **Dark Fists** weapon
- a full set of **Obsidian** tools and armor, made from **Compact Obsidian**
- the **Growth Serum**, which turns zombies, skeletons, creepers, spiders and silverfish into titans
- the **Gum Gum Fruit**: eat it to get rubber powers (and lose the ability to swim)
- the Roblox horror game **DOORS**: the **Lobby** and all of **Floor 1** (the Hotel,
  doors 0 to 100, with Rush, Screech, Hide, Seek, the Figure and Jeff's shop), and
  **Door 50** (the Library) and **Door 30** (the Seek chase) on their own
- **Players**: mobs that play Minecraft like a person, from punching a tree to the
  Ender Dragon, and the **Player API** item to manage them (and to let them chat
  through an AI)

Made for Minecraft Bedrock **1.26.50** on Android. It works on 1.21.90 and newer and
needs **no experimental toggles**. The Compact Obsidian block needs 1.26.20 or newer.

## Installing on Android

1. Download **[`dist/ZombieTitan.mcaddon`](dist/ZombieTitan.mcaddon)**.
2. Open **Files → Downloads** and tap `ZombieTitan.mcaddon`. Minecraft opens and
   imports two packs: *Zombie Titan BP* and *Zombie Titan RP*. Their descriptions
   start with the version number (*Version 1.7.0*).
3. Create a world, or edit one. Under **Behavior Packs**, activate
   **Zombie Titan BP**. Minecraft adds the resource pack with it.
4. Play. Here is where everything is in the creative inventory:
   - **Spawn eggs** (the five titans and their minions): with the other spawn eggs.
   - **Dark Fists** and the **Obsidian** tools and armor: in the Equipment tab.
   - **Compact Obsidian**: in the Construction tab.
   - **Growth Serum**: in the Items tab.
   - **Gum Gum Fruit**: in the Nature tab.
   - **Spawn The Lobby+Floor 1**, **Door 50 Library** and **Door 30 Seek Chase**: in
     the Items tab.
   - **The Figure** and **Seek** spawn eggs: with the other spawn eggs.
   - The **hotel blocks** (wallpaper, wainscoting, floor, crates...): in the Construction
     tab. Lamps, paintings and signs: in the Items tab.
   - **Spawn Player**: with the other spawn eggs. The **Player API**: in the Items tab.

If tapping the file does nothing, long-press it, choose **Open with**, and pick
**Minecraft**.

**Updating.** Import the new file the same way, then reopen your world.
- If Minecraft says the packs are already installed, go to **Settings →
  Storage**, delete the old *Zombie Titan BP* and *Zombie Titan RP*, and import
  again.
- If the world still acts like the old version, check under **Behavior Packs**
  that Zombie Titan BP is active and that its description says *Version 1.7.0*.

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
  - It is a Zombie, Skeleton, Creeper or Spider Titan, or an Omegafish, with even odds.
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

## The Spider Titan

| | |
|---|---|
| Size | 16 blocks tall at the knees and about 32 across its legs (16× a spider) |
| Health | 10,000 HP |
| Damage | 90 per hit; its Force Smash deals 5×, its Frontal Clap and lightning 2× |
| XP | 12,000 to the player who kills it |
| Boss bar | Custom bar with a black frame, red eyes at the ends, cobwebs in the corners and a spider hanging over it |

### Spawning

- **Spawn egg.** It rises out of the ground at spider size, hissing, and grows to
  full size over 10 seconds. While it is rising it can't be hurt.
- **Naturally.** At night, like the Zombie Titan.
- **Growth Serum.** Throw one at a spider or a cave spider.

### Attacks

| Attack | What it does |
|---|---|
| **Force Smash** | Rears up high on its back legs, then crashes down: everything within 26 blocks takes 5× damage and is flung into the air. When it rears up, run! |
| **Sweep** | Swings a front leg across, hitting you and everything near you. |
| **Frontal Clap** | Spreads its front legs wide and claps them shut in front of it: 2× damage. |
| **Anti-titan strike** | Stabs upward at players who fly or stand 10 or more blocks up, and at other giants: 4× damage. |
| **Web Shot** | When you are far away: it curls its abdomen up over its back and shoots a strand of web at you. It hits, slows you down, and cobwebs bloom all around you. |
| **Lightning Shot** | When you are far away: it rears up with its front legs raised to the sky, then whips them down. Lightning and blasts strike you and everything within 6 blocks of you. |
| **Leap** | Now and then it jumps at players who are far away. |
| **Webs** | While it hunts you, it spins cobwebs where you stand (with `mobGriefing` on). All its cobwebs melt away after 30 seconds. |

### How to beat it

1. **Hit its legs.** Explosions and lightning never hurt it, and attacks from players
   do nothing while it stands. But **8 hits on its legs** knock it off balance:
   - Hit a leg with a weapon: walk up beside it, or aim at the legs to either side of
     its head, not at its head. The action bar counts your hits: *Leg hit! 3/8*.
   - Or shoot its legs with arrows. Its hitbox takes in its legs (knees and all),
     so an arrow that hits it anywhere beside its head and body counts.
   - It keeps turning to face you, so get beside it while it is busy with an
     attack.
2. **Hit it hard while it is down.** On the 8th hit its legs give way and it drops
   flat on the ground for 21 seconds. Now it can be hurt. It can't heal while it is
   down, and the **Dark Fists** deal **5×** damage to it. Gum Gum moves count as
   hits too.
3. **Fury.** Below 1/4 of its health it flashes red: it moves and attacks faster
   and takes half damage.

### Minions

Spider minions climb walls and leap at you like spiders. They come in the same four
types as the other minions: Loyalist (brown), Priest (pale, heals the titan),
Zealot (red, fast and strong) and Templar (steel blue, calls down lightning). There
is a spawn egg for them too.

### Death and loot

When it dies, it rears up one last time and its legs give way. It crashes to the
ground, rolls over onto its back and curls its legs up, the way dead spiders do.
Then the loot falls:

- 256–511 string
- 64–127 spider eyes and 24–47 fermented spider eyes
- 24–47 cobwebs and 24–47 mossy cobblestone
- 36–71 leather, 48–95 iron ingots and 32–63 coal
- 8–15 emeralds and 8–15 diamonds
- up to 3 netherite scrap
- 12,000 XP for the player who killed it

## The Omegafish

The silverfish titan. It is the smallest and weakest of the titans, but still no
pushover.

| | |
|---|---|
| Size | About 19 blocks long and 8 tall at its armour plates (16× a silverfish) |
| Health | 8,000 HP |
| Damage | Head Butt 50, Tail Swipe 50–200, Lightning Shot 50 (and sets you on fire), Tail Smash 400, Body Slam 500 |
| XP | 1,000 to the player who kills it |
| Boss bar | Custom bar framed in grey, segmented armour plates with spikes along the top, its head at one end and its tail prongs at the other |

### Spawning

- **Spawn egg.** It wriggles out of the ground at silverfish size and grows to full
  size over 10 seconds. While it is rising it can't be hurt.
- **Naturally.** At night, like the Zombie Titan.
- **Growth Serum.** Throw one at a silverfish.

### Attacks

Its head attacks hit what is in front of it. Its tail lashes at whatever is beside
or behind it.

| Attack | What it does |
|---|---|
| **Head Butt** | Lunges and rams whatever is in front of its head: 50 damage, and you are knocked back. |
| **Body Slam** | Rears the front of its body up high, then crashes it down in front of it: 500 damage. When it rears up, get out of the way! |
| **Tail Swipe** | Lashes its tail across everything beside and behind it: 50 to 200 damage. |
| **Tail Smash** | Curls its tail up over its back and slams it down behind it: 400 damage, and you are thrown into the air. |
| **Lightning Shot** | Rears up with sparks crackling around its jaws, then thrusts its head at you: lightning strikes you for 50 damage and sets you on fire. It mostly uses it on players who are far away or high above it. |
| **Burrow** | When you are far away, it noses down into the ground and tunnels toward you, much faster than it walks. All you see is a rumbling trail of dust, and the tips of its tail prongs cutting through the ground like a fin. It bursts out right under you: everything there is hurt and thrown into the air. Nothing can hurt it while it is underground. |
| **Explosions** | Below 1/4 of its health it glows white. Now and then the ground under your feet crackles white, and a second later it explodes, so keep moving! The explosions break no blocks. |

### How to beat it

1. **Shoot it with arrows.** Its armour plates turn blades and fists, so attacks
   from players do nothing while it is upright, and explosions and lightning never
   hurt it. But **6 arrows** (or thrown tridents) flip it over. The action bar counts
   them: *Arrow hit! 2/6*.
   - An arrow that hits it anywhere counts. A multishot volley counts once.
   - Snowballs, eggs and other thrown things don't count.
   - Arrows can't reach it while it is underground.
2. **Hit it while it is on its back.** It lies there with its legs kicking for about
   19 seconds. Now it can be hurt. It can't heal while it is down, and the **Dark
   Fists** deal **5×** damage to it. Gum Gum moves count as hits too.
3. **Low on health** it glows white and takes half damage. Explosions go off at your
   feet (see above), and it summons minions faster.

### Minions

Silverfish minions swarm around it. They come in the same four types as the other
minions: Loyalist (silver), Priest (pale with gold trim, heals the Omegafish), Zealot
(dark red, fast and strong) and Templar (dark purple with gold trim, calls down
lightning). There is a spawn egg for them too.

### Death and loot

When it dies, it rears up and writhes, curls up, and flops over onto its back with its
legs twitching. Its experience bursts out of it. Then the loot falls:

- 16–48 stone and 32–63 cobblestone
- 16–31 stone bricks, 8–23 mossy stone bricks and 8–23 cracked stone bricks
- 16–64 paper
- 16–31 iron ingots and 8–15 gold ingots
- 4–15 emeralds and 4–15 diamonds
- up to 2 netherite scrap
- 1,000 XP for the player who killed it

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
| Spider, Cave Spider, Spider Minion | **Spider Titan** |
| Silverfish, Silverfish Minion | **Omegafish** |

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

## Doors

Three items rebuild **DOORS** in front of you, with its monsters. Each one first asks
if you want to build there, because the rooms replace whatever is in the way.

While you play a door, you are in **Adventure mode** so the walls can't be broken.
When you escape, die or leave, you get your own game mode back. If you die, the
**Guiding Light** tells you what killed you and how to survive it, like in the game.

### Door 50: the Library

Use **Door 50 Library** and a hotel corridor appears in front of you, ending at
door 50. Behind it is the **Library** (32 × 58 blocks, 15 high):
- bookshelves along every wall and in rows, with an aisle up the middle
- the librarian's desk on the left, with the **solution paper** on it
- reading tables, hanging lanterns, a red runner and a rug
- two staircases up to a balcony, where **door 51** is locked with a **padlock**.
  Sometimes one staircase is blocked by a heap of fallen shelves.

Walk through door 50. It slams shut behind you. **The Figure** walks out from behind
the shelves and roars, then a lamp crashes to the floor and it runs at the noise.

**The puzzle.**
- **10 books** glow on the bottom three shelves of the bookshelves. Tap one to take
  it. Each shows a **shape** and the **digit** it stands for, for example
  *Triangle = 4*. (The shapes: triangle, square, circle, star, diamond, hexagon,
  pentagon, cross, heart and crescent.)
- The **solution paper** on the desk shows the **five shapes** of the code, **in
  order**. Tap it to take it; use it from your hotbar to look again.
- Tap the **padlock** on door 51 and type the five digits. It shows the shapes and
  digits you know.
- When it opens, the Figure goes mad and runs at you. Get through door 51: it slams
  shut behind you and you escape.

Holding a book or the paper shows what you know of the code at the bottom of the screen.

### The Figure

| | |
|---|---|
| Health | 50,000 HP |
| Touch | Instantly kills **any living thing** it touches, except **Seek** and the **titans** |
| Senses | **Blind**, but hears footsteps: walking is heard 14 blocks away, sprinting 24, landing a jump 16. Taking a book, the paper or working the padlock makes noise too |
| Boss bar | Not its health: **how safe you are** (below) |

**Crouch to be silent.** Standing still is silent too. When the Figure hears you, it
runs to where the sound came from, then stops and listens. It gets a little faster
with every book you take.

**Its boss bar** is a fleshy, toothed bar that shows how much danger you are in:

| Bar | What it means |
|---|---|
| **Low** (green) | It isn't close, and it can't hear you. |
| **Middle** (yellow) | It's close, but it can't hear you. Stay quiet. |
| **High** (orange) | It isn't close, but it heard you and it's coming. |
| **Full** (red) | It hears you, it's close, and it's coming. Run or hide! |

You also hear your heartbeat when it's close.

A Figure from a **spawn egg** roams the world the same way. It follows the sounds of
players, and of creatures moving close to it, and kills what it touches.

### Door 30: the Seek chase

Use **Door 30 Seek Chase** and a hotel corridor appears, with **eyes** on the walls.
Go through door 30 into the long hallway. More and more eyes watch you. At the end
of the hallway the view turns around: **Seek** rises out of a puddle of black slime.

**Run.** The chase is **10 rooms** long, and **Seek's boss bar** shows how much of
it is left. The rooms are built ahead of you as you run:
- **Crawl spaces**: fallen bookshelves block the room. **Crouch** under the gap.
- **Rooms with three doors**: only one opens. The others are locked.
- A corridor that turns, and a room full of overturned furniture.
- **The last hall**: black **hands** burst through the windows and drag you out if
  you get close, and **chandeliers** crash down and burn on the floor (9 damage).

The **Guiding Light** shows the way: the right door glows **blue**, and blue lights
mark where to crouch and the safe way around the fire. Reach the last door and the
Guiding Light slams it shut in Seek's face.

Seek is a little **slower than walking**, but it catches up fast when it falls
behind. Keep moving, follow the light and don't stop. Sprinting gives you room for
mistakes. Original chase music plays while it's after you.

A Seek from a **spawn egg** chases the nearest player and kills whoever it catches.
Nothing can hurt it.

### The Lobby and Floor 1: the Hotel

Use **Spawn The Lobby+Floor 1** and the **Lobby** is built in front of you: a grand
hall with **eight elevators**, four down each side, couches, plants and chandeliers.
It is 36 × 39 blocks and 11 high. The hotel's rooms are built on beyond its far end as
you play, up to about 2,500 blocks ahead and 40 to each side. The Lobby stays where it is, and its elevators keep working after you
close and reopen the world (up to six lobbies per world).

**Riding down.** Step into an elevator and it asks where you're going: pick **The
Hotel** (Floor 1). *The Mines* (Floor 2) isn't open yet. Everyone standing in the car
when its doors shut comes along. The doors close, and the car
goes down for **15 seconds** while elevator music plays. Then it opens onto the
Hotel's **reception**.

**The rooms.** Every run is a different hotel. Rooms are built ahead of you as you
go, and each one ends in a numbered door:
- **Door 1** is locked. Its key hangs on the rack **behind the reception desk**.
- About **one room in five** has a **locked door**. Its **key** is somewhere in that
  room: on a desk or a bed, or **inside a drawer**. Tap a locked door with the key.
- **Drawers** (dressers, nightstands, desks and filing cabinets): tap one to open
  it. You can find **gold**, a **lighter**, a **flashlight**, rarely a
  **crucifix**, or nothing.
- **Closets** to hide in, and **beds** to hide under (tap them). Crouch again to
  come out.
- About one room in twenty, from door 4 on, is **dark**: without a light you can
  barely see your hand. Screech lives there.
- Behind you, the rooms you have left are taken down as you go.

**Where things are:**

| Doors | What's there |
|---|---|
| 0 | The reception, with door 1's key behind the desk |
| 27 to 30 | **Seek's eyes** on the walls, more and more of them. At **30**, Seek rises and chases you through the next rooms (follow the blue Guiding Light) |
| 50 | **The Library**, with the Figure and the padlock puzzle (as in Door 50) |
| 52 | **Jeff's shop** |
| 53 and on | The **abandoned hotel**: torn, scratched wallpaper, piles of flesh, knocked-over furniture, broken lights |
| 57 to 70 | Seek's eyes come back from 57, and Seek chases you again between 60 and 70 |
| 80 | **The Infirmary**: beds behind curtains, and a side room with a **skull lock** that only a skeleton key opens. Inside is the **Herb of Viridis** |
| 89 | An iron **gate**, out into the **Courtyard**: grass, graves, an angel statue and stairs along its sides |
| 90 to 99 | **The Greenhouse**: dark rooms of plants under a glass roof, behind gates with white numbers. Lightning, not flickering lights, warns of Rush here |
| 100 | **The Electrical Room** (below) |

**Gold and Jeff's shop.** Gold from drawers is counted for each player (shown when
you pick it up). At door 52, **Jeff** (a dark-blue, tentacled shopkeeper with glowing
blue eyes) sells, with **El Goblino** at the counter and **Bob** the skeleton in his
chair. Tap Jeff, El Goblino or the goods to shop:

| Item | Price | What it does |
|---|---|---|
| **Lighter** | 100 | Hold it and it lights: a warm light follows you, and in dark rooms you can see about 13 blocks. Use it to close it. About a minute of fuel |
| **Flashlight** | 200 | Hold it and it shines where you look, and in dark rooms you can see about 22 blocks. Use it to switch it off. Two minutes of battery |
| **Skeleton Key** | 400 | Opens any lock, even skull locks. Two uses |
| **Crucifix** | 500 | Hold it up (in your hand) against Rush or Screech, and the Guiding Light's chains drag them into the floor. Seek and the Figure are only held back for **5 seconds**. One use |

Lighters (15% of drawers), flashlights (5%) and crucifixes (1%) can also be found.

**Rush.** When a door opens there is a 1-in-10 chance (1-in-4 in the Greenhouse) that
Rush comes. The lights **flicker** (or lightning flashes in the Greenhouse), and for
about **7 seconds** a roar grows louder. **Hide** in a closet or under a bed before it
arrives! Rush tears through the rooms, smashing their lights, and kills anyone not
hiding.

**Screech.** In a **dark room**, you may hear *"psst"*. Screech is hiding nearby.
**Turn and look at it** within 3 seconds and it shrieks and goes away. Otherwise it
bites (8 damage).

**Hide.** Don't stay hidden too long. After **10 seconds**, eyes appear around you,
you hear whispers and the screen flashes red: **get out**. Five seconds later, Hide
throws you out and hurts you (8 damage).

**Seek and the Figure** are as in their own levels: run from Seek and follow the
Guiding Light; stay quiet around the Figure.

**Dying.** You're sent back to the Lobby, and the **Guiding Light** tells you what
killed you and how to survive it. Anyone still alive keeps going. Keys you were
carrying are left where you died.

### Door 100: the Electrical Room

Through the greenhouse's last gate, a corridor of flickering lights leads into a big
grey electrical room: halls around two great square blocks, with shelves and
closets, open side rooms full of shelves, and a locked door marked **WARNING: HIGH
VOLTAGE**. Beside a wide grey gate is a **lever**.

1. **Pull the lever.** The gate slides open, and **the Figure** comes down the stairs
   and starts hunting the halls (it won't leave them). Keep quiet.
2. Go through the gate and up the stairs to a gated room with the **broken-down
   elevator**. On one of the wooden crates is a grey **Electrical Room Key**.
3. The key opens the **High Voltage** room. Its **breaker box** has ten empty slots
   and a black screen. Find the **10 Breaker Switches**: two or three are upstairs,
   the rest are on the shelves in the Figure's halls. A bar shows how many you have.
   Tap the box to put them in.
4. When all ten are in, the Figure steps on a sparking **live wire**. The oil under it
   catches fire, and it runs, crashing into two walls and out through a window.
5. **The breaker puzzle.** The screen shows a switch number with a **full square**
   (switch it **on**) or an **empty square** (**off**). Set the switches to match:
   tap a switch to flip it, or tap the box to set them all at once. There are three
   rounds, each faster. In the last, the final number shows as **??**: it's the one
   that wasn't shown.
6. The power comes back... and the Figure slams into the door behind you, twice, and
   bursts through on the third time. Get past it and **run** up to the elevator. Its
   gate shuts in the Figure's face, and down you go.
7. Ten seconds of elevator music. Then the Figure lands on the roof, the cable snaps,
   and the elevator **falls**. The crash ends Floor 1, and you're back in the Lobby.

### Hotel blocks

The rooms are built from new blocks, which you can also build with: **Hotel
Wallpaper** (red, green, blue and torn), **Hotel Wainscoting**, **Hotel Floor**,
**Hotel Molding**, **Hotel Ceiling**, the **Library Bookshelf**, **Hotel Windows**,
**Wooden Crates**, **Infirmary Tiles** and **Floor**, **Elevator Panelling**, **Hazard
Stripes** and **Metal Shelves**, and (in the Items tab) **Ceiling Lamps**, **Wall
Lamps**, **Paintings**, **Hospital Curtains** and **Exit Signs**.

The Library and the Seek chase stay in your world after you play, with their doors
left open so you can walk around them. Floor 1's rooms are taken down behind you as
you go; the Lobby stays.

## Players

A **Player** is a mob that plays Minecraft the way a person does. It looks like a
player (one of 16 skins, with its name over its head) and has what a player has: 20
health, a hunger bar, a 36-slot inventory, armor and an off-hand slot. It starts with
nothing. It punches a tree, makes a crafting table, and works its way up to the Ender
Dragon.

Players are mobs, not real player accounts: an add-on can't add real players (only
the GameTest framework can, and it needs Beta APIs). Monsters still treat a Player
as a player, so zombies, skeletons and creepers go after it.

### Getting Players

- **Spawn Player** (with the other spawn eggs). The Player "joins the game" with a
  chat message, as a player does.
- At most **4 Players** at once by default. Change it with the Player API.
- The **Player API** item opens the control panel: the Players in your world, and
  the settings. It's in the Items tab, or craft it:

  | | | |
  |---|---|---|
  | | Glass Pane | |
  | Redstone | Book | Redstone |
  | | Redstone | |

### What a Player does

- **Moves like a player.** It walks, sprints, jumps, swims, climbs ladders, and opens
  doors and gates (and closes them behind it). It finds its way around, digs through
  what's in the way, bridges gaps (sneaking at the edge) and pillars up. It looks
  around as it goes.
- **Sees and hears.** It sees clearly within about 60° of where it's looking. Out to
  about 110° (its peripheral vision) it only notices things that move, and then turns
  to look. It sees nothing behind it, or through blocks.
  - By day it sees 48 blocks; at night 20; in a dark cave 10. A torch helps.
  - It hears footsteps (not if you sneak), fights, blocks breaking, doors, chests and
    explosions, even out of sight.
- **Survives.** It gets wood, then wooden and stone tools, then food (it hunts animals
  and cooks the meat in a furnace), coal and torches. Then it gets wool for a bed and
  builds a small house with a door and a chest, and sleeps at night. Then it mines for
  iron, makes iron tools and armor, a shield, a bucket and a bow, and digs for
  diamonds.
  - It eats when it's hungry, and when it's hurt so it heals.
  - It swims up for air, gets out of lava, and can land a fall with a water bucket.
- **Fights.** It jumps for critical hits with its sword. It shoots its bow at what it
  can't reach, aiming ahead of moving targets. It raises its shield against arrows,
  blasts and the fireballs it sees coming. It hits a creeper and backs off, runs when
  it's losing, and helps its friends.
- **Uses blocks properly.** Crafting tables, furnaces, smokers and blast furnaces;
  chests (it stores things and takes them back out); the enchanting table (power from
  the bookshelves around it, levels and lapis); the anvil (repairs, combining, naming);
  the smithing table (diamond to netherite); the brewing stand (it brews real
  potions); the grindstone, stonecutter, composter, cauldron, bell and beds.
- **Trades.** With villagers, by their job and level, for emeralds and what it
  needs. It barters gold with piglins.
- **Handles its things.** You see what it's holding in its hand. It drinks potions
  (healing, fire resistance...) when it needs them, picks up what it wants, and drops
  junk when its inventory gets full.
- **Stops to think** now and then, like a player deciding what to do next.
- **Goes to the End**, one step at a time:
  1. It builds a Nether portal (it makes obsidian from lava and water if it must) and
     lights it.
  2. In the Nether it finds a fortress. It fights blazes at their spawner: it blocks
     their fireballs with its shield and shoots back between them. It comes home
     with blaze rods.
  3. It gets ender pearls from endermen, clerics or piglins, and makes eyes of ender.
  4. It throws eyes of ender and follows them to the stronghold, and digs down to
     the portal room.
  5. It fills the frame and jumps in. It shoots or climbs to the End crystals,
     then fights the dragon, and says "gg" when it dies.
  6. Then it either goes home through the exit portal, or (if it's the curious type)
     throws a pearl through an End gateway to look for end cities. There it loots the
     chests and takes the elytra from the ship.
- **Dies and respawns.** You get the death message, and its things drop. It respawns
  3 seconds later at its bed (or at the world spawn), and goes back for its things.
  It remembers everything: its home, its friends, where it's been, how far it got.
- **Keeps going when you're away.** A Player far from everyone keeps a small ticking
  area around itself, so its part of the world keeps running. You can turn this off.

### Talking to a Player

Tap a Player for its menu. It shows its health, hunger, armor, level and what it's
doing. The buttons:

| Button | What it does |
|---|---|
| Talk | Say something to it. It answers in the chat. |
| Befriend | Ask to be friends. It thinks about it. |
| Follow me / Stop following me | It follows you around, or stops. |
| Wait here / You can go | It stays put, or goes back to what it was doing. |
| Give it what you're holding | It takes the item (and likes you more for it). |
| Ask it for something | Pick something it has. A friend gives you some; a stranger may not. |
| Its inventory | See everything it carries and wears. |
| Ask it to... | Come here, go home, build a house, sleep, trade with villagers, enchant its gear, fix its gear, or drop its junk. |

- **Friends.** Gifts, kind words and befriending make a Player like you more.
  Friends share their things, do what you ask, and fight for you. Insults make it
  like you less.
- **It chats by itself** about what happens: diamonds, creepers, dying, the Nether,
  the dragon. How much it talks is a setting.
- An add-on can't read the normal chat box without Beta APIs, so talk to a Player with
  **Talk** in its menu.

### Letting a Player talk through an AI

By itself, a Player answers with lines of its own. It can answer through an AI
instead. Use the **Player API** → **Settings and AI key**:

1. Pick the AI: **Claude (Anthropic)**, **OpenAI**, **Gemini (Google)**, or **Other**
   (any server that speaks OpenAI's chat completions, such as a local one).
2. Paste your API key. If you like, type a model name and, for Other, the server's
   URL.

Minecraft can't send web requests from a phone or a normal world. The requests go
through a second pack, the **Player AI Bridge**, which needs a **Bedrock Dedicated
Server (BDS)**:

1. Download **[`dist/PlayerAI_Bridge.mcpack`](dist/PlayerAI_Bridge.mcpack)**.
2. Add it to the server's world with the two Zombie Titan packs, and turn on **Beta
   APIs** in the world's experiments.
3. In the server's `config/default/permissions.json`, add `"@minecraft/server-net"`
   to `allowed_modules`.
4. Restart the server. Save the key in the Player API again: it tells you **"The AI
   bridge is running"** when it finds the bridge.

Notes:

- Without the bridge, Players answer by themselves. Nothing breaks.
- The default models are `claude-opus-5-5` for Claude, `gpt-5-mini` for OpenAI and
  `gemini-3.6-flash` for Gemini. To use another model, type its name.
- The AI knows who the Player is, what it's doing, what it has and what's been said,
  and can make it follow you, stay, come over, go home, build, sleep, trade, drop
  its junk or give you something.
- Your key is saved in the world. **Anyone with the world file can read it.** Each
  answer uses your API account.

### Limits

- **Finding a stronghold takes time.** An add-on can't look up where structures are,
  so a Player throws eyes of ender and follows them, as a player does. Strongholds
  are hundreds of blocks out, so the trip can be long.
- **Lag.** Every Player thinks every tick. On a phone, 2 to 4 Players is plenty.
- **Ticking areas.** Minecraft allows 10 per world. Each Player far from everyone
  uses one, so you can run out if you also use your own.

## Building from source

The models, textures, animations, particles, sound definitions and the obsidian
items are all generated by scripts in `tools/`. To build:

```
pip install numpy pillow
python3 tools/build.py        # regenerates everything, writes dist/ZombieTitan.mcaddon
                              # and dist/PlayerAI_Bridge.mcpack
```

The Seek chase's music is synthesized by `tools/gen_doors_audio.py`, and the elevator
music, door 100's chase, Screech's whisper and Rush's roar by `tools/gen_floor1_audio.py`. They are
encoded with `ffmpeg` (libvorbis). Without ffmpeg, the build keeps the existing files.

Development checks:

- **Schema validation.** Checks the packs against Mojang's JSON schemas from
  [bedrock-samples](https://github.com/Mojang/bedrock-samples):
  `python3 tools/validate.py <bedrock-samples>/metadata/json_schemas`
  (needs `pip install jsonschema`).
- **Simulation.** Runs the behaviour pack scripts against a mock of the
  `@minecraft/server`, `@minecraft/server-ui` and `@minecraft/server-net` APIs:
  `node tools/sim/run.mjs`. The Player tests play whole games: `botcraft` from
  nothing to an iron pickaxe, `botend` from a Nether portal to the dragon and the end
  cities, and `botai` runs the AI bridge against fake AI services.
  Random numbers are seeded so runs repeat; set `ZT_SEED=<number>` to try others.
  The mock refuses blocks and block states the game would refuse, using Mojang's
  block lists in `tools/sim/vanilla-blocks.json` (made by
  `tools/sim/gen_vanilla_blocks.py`). It also reads the pack's entity files for their
  properties, events and damage sensors. `node tools/sim/run.mjs seek@1.21.90` runs
  a test with an older version's blocks.
- **Preview.** `tools/preview.py` renders the model, textures and animation
  poses to PNG.

## Version history

- **1.7.0**
  - New: **Players**, mobs that play Minecraft like a person. They gather, craft,
    smelt, build, mine, fight, trade, brew, enchant and use chests, and work their way
    to the Nether, the End, the dragon and the end cities. They see with peripheral
    vision and hear what's going on.
  - New: the **Spawn Player** egg, and the **Player API** item (Players, settings, and
    an AI key).
  - New: the **Player AI Bridge** pack, for dedicated servers. It lets Players chat
    through Claude, OpenAI, Gemini or any OpenAI-compatible server.
- **1.6.0**
  - New: the **Omegafish**, the silverfish titan, with its own boss bar, silverfish
    minions, burrowing, lightning, explosions at your feet and its arrow weak spot.
  - The Growth Serum now also works on silverfish, and natural spawns can be any of
    the five titans.
  - Fixed: door 1's key hung inside the reception's back wall, out of reach. It now
    hangs on the front of the key rack, where you can tap it.
  - Fixed: doors, gates, closets, drawers, the elevator doors and the breaker box
    swung shut again right after they opened. They stay open now.
  - Fixed: Rush didn't get louder as it came. Its roar now grows from a far-off rumble
    to a scream over the 7 seconds before it arrives, and it roars past you once.
  - Fixed: dark rooms weren't dark, and lighters and flashlights gave no light. Dark
    rooms are now black a few blocks away. A lighter lets you see about 13 blocks and
    lights up the blocks around you; a flashlight lets you see about 22 blocks and
    lights up where you point it. A light in your hand is lit by itself: use it to put
    it out.
- **1.5.0**
  - New: **Spawn The Lobby+Floor 1**: the DOORS Lobby with eight working elevators,
    and the whole of Floor 1, the Hotel, from the reception to door 100. Every run is
    a new hotel.
  - New: locked rooms and keys, drawers with gold and items, closets and beds to hide
    in, dark rooms, the abandoned hotel, the Infirmary, the Courtyard and the
    Greenhouse.
  - New monsters: **Rush**, **Screech** and **Hide**. Seek chases you at door 30 and
    again later, and the Library is at door 50.
  - New: **Jeff's shop** at door 52 (Jeff, El Goblino and Bob), with the **Lighter**,
    **Flashlight**, **Skeleton Key** and **Crucifix**, and the **Herb of Viridis**.
  - New: **door 100**: the lever, the Figure, the ten breaker switches, the fire, the
    breaker puzzle, and the escape in the elevator.
  - New hotel blocks, lamps, paintings and signs, and original elevator and chase
    music.
- **1.4.1**
  - Fixed: in the Seek chase's rooms with three doors, the doors could be blocked:
    the room's angled corners stood in front of the two side doors, and the next
    room's wall was built over the wrong doors. All three doors are clear now.
  - Fixed: you couldn't crouch under the fallen bookshelves. The carpet lifted you
    1/16 of a block too high, so there is no carpet under or beside them now.
  - Fixed: the Figure teleported around the Library. On long straight paths it
    jumped to the end instead of walking. It always walks now.
  - Fixed: the Spider Titan's legs couldn't be hit, and arrows went through them.
    Its hitbox now takes in its legs.
- **1.4.0**
  - New: the **Spider Titan**, with its own boss bar, spider minions, web shots,
    lightning, cobwebs and its leg-hit weak spot.
  - The Growth Serum now also works on spiders and cave spiders, and natural spawns
    can be any of the four titans.
  - Fixed: **Door 50** said part of the area wasn't loaded and left the Library
    empty, and **Door 30** stopped at "Building the hotel..." after one room with no
    doors. Both placed a slab state on a block that has none, and the builder gave
    up at the first block Minecraft refused.
    - The builder now adapts each block to your version of Minecraft. It skips a
      block it can't place and keeps going.
    - It only stops when the area really is unloaded, and then it says so.
  - Fixed: a level that can't finish building gives up after a minute, so you can
    start another one.
- **1.3.0**
  - New: **Door 50 Library**: the Library from DOORS, with the Figure, ten shape
    books, the solution paper and door 51's padlock.
  - New: **Door 30 Seek Chase**: Seek's 10-room chase from DOORS, ending in the hall
    of hands and burning chandeliers.
  - New: **The Figure** and **Seek** spawn eggs, and the hotel blocks.
  - New: the Figure's "how safe are you" boss bar and Seek's chase-progress bar.
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

The Doors levels, the Figure and Seek are a fan tribute to *DOORS* by LSPLASH on
Roblox. The rooms, models, textures and code are all new, and the chase music is an
original piece synthesized for this add-on.

The titans' stats, attacks and timings are based on
[The Titans Mod](https://modrinth.com/mod/the-titans-mod) for Minecraft Java
Edition. The models, textures, animations and code here are all new. The sounds
reuse Minecraft's own sound files, pitched down.
