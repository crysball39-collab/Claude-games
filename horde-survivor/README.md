# HORDE SURVIVOR

A top-down survivor game for phones and desktops: you walk, your weapons fire on their
own, and you try to last 15 minutes in the Abandoned City while the horde gets bigger.
Everything is drawn in code, so the whole game is one HTML file with no images or sounds
to download.

## Playing it

**`dist/horde-survivor.html` is the whole game in one file.** Download it and open it in a
browser. It works offline on Android (Files → Downloads → tap it) and on iPhone (Files →
Downloads → tap it), and on any desktop browser.

To run the source instead, serve the repo root and open `/horde-survivor/`:

```
./serve.sh              # then open http://localhost:8080/horde-survivor/
npm run build:survivor  # rebuilds dist/horde-survivor.html from horde-survivor/
```

**Controls.** Touch and drag anywhere to move; the stick appears under your finger. On a
keyboard use WASD or the arrow keys, and Esc or P to pause. You never aim: the shuriken
and every ability fire by themselves.

## The menu

Three buttons along the bottom:

| Section | What it's for |
| ------- | ------------- |
| **Main** | Chapter 1, Abandoned City: your best time, the three bosses and when they arrive, and PLAY. |
| **Equipment** | Six gear slots around your survivor. Weapon, Gloves and Accessory add ATK. Chestplate, Helmet and Belt add HP. Tap any item to equip it, upgrade it with gold, or salvage it for gold. |
| **Shop** | The blue **Normal Chest**: 80 gems, drops one piece of Common gear. |

You start with a **Wood Shuriken** equipped and **80 gems**, enough for your first chest.

## A run

**Abandoned City lasts 15:00.** Zombies come first, then Zombie Butterflies (fast, flutter
from side to side), then Beetles (tough). Now and then a bigger, red-ringed elite version
of one shows up. It is tougher and drops a big EXP gem.

| Time | What happens |
| ---- | ------------ |
| 4:00 | **Big wave**: the minute before the boss is a flood of enemies |
| 5:00 | **Zombie Dreadnought** |
| 9:00 | Big wave |
| 10:00 | **Mutated Butterfly** |
| 14:00 | Big wave |
| 15:00 | **Titanus**: beat it to finish the chapter |

When a boss arrives the street clears, a cage drops around you and the clock stops until
the boss is dead. Every boss attack is telegraphed: a red lane before a charge, a red circle
where a slam or mine will land, glowing cracks before lava spikes burst.

| Boss | Attacks |
| ---- | ------- |
| **Zombie Dreadnought** | Charge · Rock Throw (three rocks at where you stand) · Jump and Slam on the spot you were standing on |
| **Mutated Butterfly** | Spin Attack (spins and sprays a spiral of wing dust) · 3 Poison Balls (each hit poisons you for 10 seconds) · Charge |
| **Titanus** | Lava Bullets · Charge · Lava Spike Surge · Summon Minions (lava beetles) · Plant Lava Mines (they go off when you get close) |

Below half health a boss glows and attacks more often.

**Gold and EXP.** Every enemy you defeat gives **1 gold** and drops a **green EXP gem**.
Walk near a gem to pull it in. Each boss also pays 30 gold and drops a shower of gems. You
keep the gold whether you win or die. Finishing the chapter adds **500 gold and 120 gems**.

### Level ups

Each level up offers **3 choices** of abilities or buffs. You can hold **5 abilities and
5 buffs**. Each goes up to **5 stars**. An ability at 5 stars evolves once you also own its
buff, and the evolution then shows up as a glowing card.

| Ability | Levels 1 to 5 | Evolution | Needs |
| ------- | ------------- | --------- | ----- |
| **Guardian** | 2 blades orbit you, +1 blade per level | **Crimson Guardian**: red blades, harder hits, 7 blades | Blade Sharpener |
| **Forcefield** | A green field that damages enemies inside it, bigger and stronger each level | **Crimson Field**: red, bigger, slows enemies inside | Energy Drink |
| **Durian** | A green durian bouncing off the edges of your screen, bigger and stronger each level | **Thorn Durian**: a red and black spiked ball that shoots black spikes in all directions | HE Fuel Canister |
| **Missile** | A red and white missile every 5 seconds that explodes on impact, more damage and a bigger blast each level | **Void Missile**: black with a purple fire trail; a big purple blast that sets enemies on purple fire for 10 seconds | HE Fuel Canister |
| **Molotov Cocktail** | Every 5 seconds, throw Molotovs that leave fire where they land, +1 Molotov and a bigger fire each level | **Gas Canister**: 10 canisters thrown all around you, each leaving a giant blue fire | Gold Band |

| Buff | Per level | Evolves |
| ---- | --------- | ------- |
| **Gold Band** | +8% gold from kills | Molotov Cocktail |
| **HE Fuel Canister** | +10% range, radius and speed | Durian and Missile |
| **Blade Sharpener** | +2% damage, your effects last 15% longer (not poison) | Guardian |
| **Energy Drink** | +5% HP regen: heal 5% of max HP every 10 seconds | Forcefield |
| **Shogun's Armor** | −10% damage taken | Nothing |

If you already hold everything at max, the cards offer a heal or a bag of gold instead.

## Gear

There is one set so far, **Torn Leather** (Common): Wood Shuriken (weapon), Gloves,
Necklace (accessory), Chestplate, Helmet and Belt. ATK raises the damage of the shuriken and
every ability; HP is your health bar. Gear levels up to 10. Each level costs 100 gold times
the current level, so a run's gold goes into upgrades. Salvaging an item you aren't wearing
returns gold. You can swap your weapon but never take it off.

## Files

```
horde-survivor/
  index.html        markup for the menus, HUD and overlays
  style.css         all styling
  src/data.js       chapters, enemies, bosses, abilities, buffs, gear and every number
  src/core.js       helpers, the save file, synthesized sound, touch and keyboard input
  src/sprites.js    characters, bosses and effects, drawn with canvas paths
  src/icons.js      icons, the chest, the chapter banner
  src/ground.js     the city streets, generated in chunks
  src/run.js        a run: spawning, enemies, the shuriken, the five abilities, gems, level ups
  src/boss.js       the cage, the three bosses and their attacks
  src/render.js     drawing a run and the menu background
  src/ui.js         menus, HUD, level up cards, pause, results, chests
  src/main.js       boot and the frame loop
  build.mjs         folds everything into dist/horde-survivor.html
  tools/playtest.mjs  a bot that plays a full chapter and prints a timeline (balance checks)
```

Progress (gold, gems, gear, best time) is saved in the browser's local storage on that
device. Settings has sound and damage-number toggles and a reset.
