# BLACKSMITH

A 3D, third person mining and forging game for phones, played in landscape, that
runs in a browser. No install, no build step to play it, and no assets on disk:
every texture, icon and sound is made by the code when it loads.

You spawn on a stone circle in a meadow. One path runs left to the **Forge**; the
other runs straight ahead to a **Cave** with a wooden sign hung over its mouth, and
beside it the **pickaxe wall**, where pickaxes hang for sale. A hall in the cave's
far wall goes down to the **Deep Mine**, where elite skeletons in iron guard the
boulders and Jack pays well for them.
Mine ore, take it to the anvil, and forge weapons and armour whose every part is
made of the ore you put in: pour the lava, strike the metal on the beat and quench
it, and how well you strike it decides how good it comes out. Sign up for an
account and your smith is saved to the cloud, ready to pick up on another device.

## Getting it onto a phone

**The game's Claude page**, https://claude.ai/artifact/X9Shbngw1r2P6scuXDSaYP, is
the one with accounts: open it signed in to Claude and you can sign up, log in and
keep your smith in the cloud. Its content is `dist/blacksmith-page.html`; the page
is private until its owner shares it from its Share menu.

**`dist/blacksmith.html` is the whole game in one file.** Download it and open it:
no server, no network, and saves kept on the device. Turn the phone landscape.
For a full-screen game with no browser bars, use **Add to Home Screen** and
launch it from the icon.

To run the source instead, serve the repository root over http (ES modules do not
load from `file://`) and open `/blacksmith/`:

```
./serve.sh             # then http://localhost:8080/blacksmith/
npm run build:blacksmith   # rebuilds dist/blacksmith.html and dist/blacksmith-page.html (needs esbuild)
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
| **TALK** / **ANVIL** / **PICKAXES** when you are close, or tap Rob, Jack, the anvil or the wall | E | use |

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
10, breaks boulders, and costs $1,000 on the pickaxe wall.

### The hall, and the deep mine

Across the cave from the way in, a timbered hall goes through the north wall to
steps down into the dark, with **Deep Mine** over its mouth. At the bottom is one
wide cavern, its roof held up by pillars of rock and lit as much by its crystals
as by its torches. It is mostly boulders: **twelve** at a time to the cave's five,
against three pebbles and five rocks. Steps at its south end lead back up.

Its skeletons are **elites**: three at a time, each in an **Iron Chestplate** and
**Iron Boots**, with an **Iron Straight-Sword**. Their iron is worth what it would
be on you (12.6 defence), so each blow lands for a little over three quarters of
its damage, and they have 120 HP to a skeleton's 40. They hit for 16 to a dagger's
7, reach further, and their eyes burn blue. Like the skeletons above, they rise
again a few seconds after they fall, sometimes leaving their bones, and they never
come into Jack's camp or the steps.

### The pickaxe wall

A timber wall just left of the cave mouth, with every pickaxe hung on pegs and its
price on a tag underneath. Walk up and press **PICKAXES**, or tap the wall, and the
camera closes in. Pick one from the list (or tap it on the wall) and it comes down
off its pegs so you can look it over: what it costs, its mining damage, how many
swings each kind of rock takes with it, and what it is worth in a fight. **BUY** puts
it straight in your hand; one you already own can be put back in your hand with
**EQUIP**. Tags turn to OWNED as you buy.

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
100 EXP**, as often as you like. Elites in the deep mine count as skeletons too. There are always three skeletons in the cave, each
with a wooden dagger; a killed one falls to pieces and another climbs out of the
floor elsewhere a few seconds later. One in 25 leaves its **Bones** behind, which
forge like an ore. Skeletons never come into Rob's camp or the tunnel. Rob pays; he
does not sell. Pickaxes are bought on the wall outside.

Levels take 100 EXP times your level to climb, and each one adds 5 max HP.

### Jack and his bounty

Jack keeps a camp by the steps in the deep mine, with a fire and a rack of iron
swords he has taken off the elites. Kill **5 elite skeletons** for him and he pays
**$5,000 and 1,000 EXP**, as often as you like, but he only gives the work to a smith
of **level 5** or more. Until then he says so, and wears **LV 5** over his head where
Rob wears his **!**. Reaching level 5 takes ten of Rob's bounties, or fewer once you
have something better than a dagger.

### The anvil

Tap the anvil in the Forge and the camera zooms in on it. Choose what to make,
then put ore in up to **three slots**, any amount of each. Tap a slot's ore (or
its empty box) to choose the ore, and tap it again whenever you like to change it;
choosing an ore that is already in another slot swaps the two slots over. On a
tall screen the slots stand side by side; on a short one they are three rows, so
every name and button has room. Each thing takes at least this much ore:

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

Past the least it takes, there is no limit, and more ore makes it stronger: twice
the ore is +30%, four times +60%, and so on up to double strength at ten times the
ore. Better ore still counts for more than more ore: ten times the Stone does not
make Gold. **ALL** on a slot puts in every one of that ore you have. A tap on **+**
or **−** is exactly one; held, they count faster the longer you hold them, and stop
the moment you let go. A held **−** stops at one, and one more tap empties the slot.

The mould on the pedestal under the lava bucket is cut to whatever the anvil is
set to make: a dagger, a sword, a broadsword, a helmet, a chestplate, a pair of
leggings or a pair of boots. It changes the moment you choose.

### Forging

**FORGE** takes the ore, and then the thing has to be made, in three steps:

1. **Pour.** Drag the chain's handle, down the right of the screen, to tip the
   lava bucket. The lava runs into the mould and spreads out from where it lands.
   Keep pulling: when the mould is full the bucket swings back up by itself.
2. **Hammer.** The casting comes out of the mould onto the anvil, glowing, for
   five blows. For each one a white ring closes on the **TAP** button: tap when it
   is on the button's green ring for a **Perfect**. A little off is **Great**, a bit
   further **Good**, further still **Mid**, and far off - too early, too late, or
   not at all - **Bad**.
3. **Quench.** It is carried over to the water bucket. Drag it down into the
   water; it cools there, and comes back out by itself when it is done.

The five blows, averaged (Perfect 100, Great 85, Good 65, Mid 50, Bad 15), are the
gear's **rank**, and the rank changes what it does:

| Rank | Score | Damage or defence |
| ---- | ----- | ----------------- |
| Bad | below 25% | −25% |
| Okay | 25 to 44% | −10% |
| Mid | 45 to 54% | as the ore made it |
| Good | 55 to 74% | +10% |
| Great | 75 to 89% | +25% |
| Masterwork | 90 to 99% | +45% |
| Perfect | 100%: all five blows Perfect | +70% |

The rank is on the card when it is done, in the bag (a bar under each piece, in
the rank's colour), and kept in the save. Walking away part-way through still
leaves you with the thing, with any blows not struck counted as Mid. Gear forged
before there were ranks has none, and is as it always was.

### Dying and saving

Dying costs nothing: not an ore, not an item, not a dollar. You wake on the stone
circle. The game saves itself as you play (and when the tab is hidden); **SAVE
GAME** in the pause menu saves on demand, and **CONTINUE** on the main menu picks
up where you left off. NEW GAME asks before it erases a saved smith.

### Accounts and cloud saves

The button in the top corner of the main menu says who is playing. On the game's
Claude page, tap it to **SIGN UP** (a smith's name of 3 to 16 letters, numbers, `-`
or `_`, and a password of at least 4 characters) or to **LOG IN**. Signing up can
bring along the smith already saved on the device. From then on every save also
goes up to the cloud, a few seconds apart and straight away when you pause, quit or
log out. Come back later and you are still logged in; log in with the same name and
password on any device where the page is opened by the same Claude account, and
your smith is there. **LOG OUT** puts the device back on its own smith.

Accounts are kept in the page's private storage for your Claude account: nobody
else can read them, not even the page's owner. Passwords are never stored, only a
salted PBKDF2 hash of each one. A save made while the cloud could not be reached
stays on the device and goes up the next time it can.

Who can save to the cloud is up to the page's sharing: its owner; people invited
to it by email as Editors, as long as it is not also shared by a public link; and,
on a Team or Enterprise plan, members who can open it as Contributors or above.
Anyone else can still play, with saves on their device, and the account screen
tells them why. Opened anywhere other than its Claude page, the downloaded file
for one, the game says so and saves on the device as it always has.

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
      profile.js      your cash, EXP, ores, items, equipment, bounties
      cloud.js        accounts, and saving to the cloud
      save.js         storage, with an in-memory fallback
      overworld.js    the meadow, the paths, the Forge and its mould, the cave mouth, the pickaxe wall
      cave.js         the ring-shaped room, its torches, Rob's camp, the hall down
      deep.js         the deep mine: its pillars, crystals, boulders and Jack's camp
      rocks.js        mining, drops and regrowth
      skeletons.js    the skeletons and the elites, and how they fight
      rob.js          Rob and Jack
      player.js       you
      character.js    the jointed rig everyone is built on, and its animation
      gear.js         weapons, pickaxes and armour, part by part in their ores, and their moulds' outlines
      torch.js        the wall torches, bracket, handle, head and flame
      camera.js       the third person camera and its anvil close-up
      fx.js           sparks, chips, smoke, steam, flying ore, damage numbers
      sfx.js          synthesised sound
      game.js         ties it all together: travel, combat, the bounties, the forging game
    ui/               HUD, bag, anvil menu and the forging game's controls, pickaxe wall, talking, icons, main menu, accounts
  tools/
    build.mjs         folds the game into dist/blacksmith.html and its Claude page
    verify.mjs        drives the real game in Chromium and checks the rules
    mockcloud.mjs     a stand-in for the Claude page's database, for verify
```

three.js comes from `vendor/three.module.js` at the repository root, shared with
GOREBOX.

## Verifying it

`tools/verify.mjs` checks the ore table and forging rules directly - and the forging
game's: which tap is which grade, which score is which rank, and that each rank
up makes stronger gear - then boots the game in Chromium on a phone-sized touch
screen and plays it: the stone circle and the stick, the anvil (tapped, zoomed,
filled through its menu, its mould changing shape with it), the forging game
played by hand (the chain dragged down, the pour stopping by itself when the
mould is full, five taps on TAP landing a Perfect, a Great, a Good and a Mid with
one let go for a Bad, the rank they make, the gear dragged into the water and
coming back out by itself, and the parts that come out), the bag, the cave ring,
pebbles taking 4 hits for 2 ores and
rocks 10 for 3, boulders refusing the Wood Pickaxe, any amount of ore going into
the anvil and coming out stronger, changing a slot's ore and swapping two slots,
**+** and **−** counting one a tap and stopping when the finger lifts, the signpost's
arrows pointing where they say, the pickaxe's spikes standing out straight, no gaps
in the cliff round the cave mouth, every torch's fire on the tip of a handle that
leans out from its wall, Rob's bounty and its pay and
level, tapping the pickaxe wall and being refused with no money, Rob selling no
pickaxes, buying the Stone Pickaxe off the wall and breaking a boulder in 15 hits for
4 ores, walking down the hall into the deep mine and finding twelve boulders and
three elites there in iron chestplates, iron boots and iron swords, their armour
taking a share of every blow, Jack turning away a smith under level 5 and then
paying $5,000 and 1,000 EXP for five elites, the steps back up, dying
without losing anything, and a reload restoring the save. Last, it starts a new
smith and plays the first loop with nothing but the stick and the buttons: up the
path into the cave, mine with ATTACK held, back out and over to the anvil, forge a
dagger from what it found - five Perfect blows, so a Perfect dagger - and go back
down to kill a skeleton with it. Then it opens the game again on a 585 × 260
screen, a phone on its side with the game inside another app, and checks that the
anvil's slots and FORGE button, and the pickaxe wall's BUY button, all fit on it
without overlapping, that nothing on the anvil's card lands on anything else with
the phone's text made 130% bigger, and that at every step of the forging game its
words, meter, handle and TAP button are on screen and clear of each other, with
the card at the end, at both text sizes.
Last of all, accounts, with a stand-in for the Claude page's database: the
downloaded file saying its saves stay on the device, signing up and bringing the
phone's smith along, the password never stored, progress reaching the cloud,
still being logged in after a reload, LOG OUT and a wrong password, a name not
given out twice, logging in on a second phone to find the same smith, and a cloud
so slow to answer that PLAY is pressed first, which must leave the smith being
played alone.

```
npm run verify:blacksmith            # the source, over http
npm run build:blacksmith && npm run verify:blacksmith:file   # the single file, from disk
```
