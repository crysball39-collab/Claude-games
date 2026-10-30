# BARRAGE

A 3D arena brawler for phones that runs in a browser. You start in the middle of
the sand, the gates open, and box ragdolls come out to fight you. Every body is
made of boxes held together by real joints: they stumble, go down as ragdolls,
get back up, and carry every bruise, cut, slash and bullet hole you give them.
Clear a wave and the south doors open onto the plaza, where the Stall sells
gear for the coins you earned.

## Getting it onto a phone

**The game's Claude page**, https://claude.ai/artifact/6t2dxDPchKYNnJbMzAdkXQ, is
the one with accounts: open it signed in to Claude and you can sign up, log in and
keep your coins and gear in the cloud. Its content is `dist/barrage-page.html`; the
page is private until its owner shares it from its Share menu.

**`dist/barrage.html` is the whole game in one file.** Download it and open it:
no server, no network, saves kept on the device. Turn the phone landscape. For a
full-screen game with no browser bars, use **Add to Home Screen** and launch it
from the icon.

To run the source instead, serve the repository root over http (ES modules do not
load from `file://`) and open `/barrage/`:

```
./serve.sh             # then http://localhost:8080/barrage/
npm install -D esbuild
npm run build:barrage  # -> dist/barrage.html and dist/barrage-page.html
```

---

## Playing it

| Control | What it does |
| ------- | ------------ |
| **Joystick** (left thumb, anywhere in the lower left) | Walk, relative to the camera |
| **Drag** anywhere else on the right | Swing the camera round you; pinch to zoom |
| **PUNCH** | Left and right jabs in turn. With a sword in your weapon slot it becomes **SLASH**: forehand and backhand |
| **KICK** | A front kick: slower, longer reach, knocks people about |
| **BLOCK** (hold) | Forearms up in front of your face, or your shield raised if one is in your offhand |
| **SPRINT** | On and off. Turns off when you stop or run out of stamina |
| **CROUCH** | On and off. Lower, slower and harder to knock over |
| **JUMP** | A jump; you can kick in the air |
| Bag button | The inventory |
| **START WAVE** / **OPEN THE STALL** | Appears in the middle at the bottom when it applies |

Punches and kicks turn you onto the nearest box ragdoll in front of you, so you
do not have to aim on a phone. A press made while you are still finishing a move
is remembered for a moment, so quick double taps come out as combinations.

**HP** is the red bar. **Stamina** is the green one: punching, kicking, swinging,
jumping, sprinting and taking blows on your guard all cost it, and it comes back
when you stop. Run it dry and you are winded: no attacks and no sprinting until
you catch your breath. Get your guard broken that way and you stagger.

Keyboard and mouse: `WASD` move, drag to look, click to punch, right-click to
kick, wheel to zoom. `J` punch, `K` kick, `L`/`Q` block, `Space` jump, `C`
crouch, `Shift` sprint (held), `E` start the wave or open the Stall, `I`/`Tab`
inventory, `Esc` pause.

### Waves

The south doors shut, a horn sounds, the count reaches zero and the portcullises
on the north, east and west gates go up. Box ragdolls come out of the tunnels
behind them. Each wave has more of them, and new kinds join as the waves go on:

| From wave | Who | What they do |
| --------- | --- | ------------ |
| 1 | **Brawlers** | Bare chests and taped fists: jabs, combinations, kicks |
| 3 | **Swordsmen** | Wooden swords; rusty steel ones from wave 6 |
| 4 | **Shield bearers** | Walk in behind a wood shield and block a lot |
| 5 | **Gunners** | Keep their distance and fire a pistol. A red line runs from the barrel to where they are aiming before every burst |
| every 5th | **A champion** | Big health, hard to knock down, hits like a cart |

Only a few close in and attack at once; the rest circle at a distance, waiting
their turn and taunting you if you go down. Only so many are out at a time, and
more come through the gates as others fall.

Bullets hit whatever is in the way. A gunner who misses you can hit the brawler
standing between you, which is where the bullet holes on box ragdolls come from.
A raised shield stops a bullet from the front.

Fall and the run is over: you keep your coins and your gear, and start again
from wave 1. Between waves you get your breath back and your health with it.

### Coins and the Stall

| | Coins |
| - | ----- |
| Each kill | 2, plus 1 for every 3 waves, plus 1 for a gunner |
| A champion | 10 + the wave number |
| Clearing a wave | 5 + twice the wave number |

Between waves the south doors stay open. Walk out onto the plaza and up to the
Stall's counter and it opens:

| Item | Price | Sells back for | Goes in |
| ---- | ----- | -------------- | ------- |
| **Wooden Sword** | 10 | 5 | Weapon slot |
| **Rusty Steel Sword** | 50 | 25 | Weapon slot |
| **Wood Shield** | 10 | 5 | Offhand slot |

What you buy goes into your bag. **SELL** buys anything back for half what it
cost, equipped or not.

### The inventory

Sixty slots of bag, and eight on the figure: **Helmet**, **Chestplate**,
**Leggings** and **Boots** down the left, **Weapon**, **Offhand** and two
**Accessory** slots down the right. Tap an item to see it and **EQUIP** it, or
tap it and then tap a slot, or drag it there. Swords go in the weapon slot and
the shield in the offhand. The armour and accessory slots are there, but nothing
goes in them yet. Opening the bag pauses the fight.

### Accounts and cloud saves

The title screen has **LOG IN** and **SIGN UP**. On the game's Claude page,
**SIGN UP** takes a fighter's name (3 to 16 letters, numbers, `-` or `_`) and a
password of at least 4 characters, and can bring along the coins and gear already
saved on the device. From then on every change is saved to the cloud a few
seconds apart, and straight away when you pause, leave or log out. Come back
later and you are still logged in; **LOG IN** with the same name and password on
any device where the page is opened by the same Claude account, and everything is
there. **LOG OUT** puts the device back on its own guest save.

Accounts are kept in the page's private storage for your Claude account: nobody
else can read them, not even the page's owner. Passwords are never stored, only a
salted PBKDF2 hash. A save made while the cloud could not be reached stays on the
device and goes up the next time it can. Who can save to the cloud follows the
page's sharing: its owner, people invited to it as Editors, and on a Team or
Enterprise plan members who can open it as Contributors or above. Anyone else can
still play, with saves on their device. Opened anywhere else, the downloaded file
for one, the game says so and saves on the device.

---

## What is simulated

### Box ragdolls

Every person, you included, is eighteen boxes with their own masses: head, neck,
three torso segments, pelvis, upper and lower arms, hands, upper and lower legs,
feet. They are held together at real joints with real limits: knees and elbows
fold one way, hips and shoulders swing in cones and twist only so far.

A person is always an animated skeleton *and* eighteen simulated boxes. Their
state decides which wins:

| State | What happens |
| ----- | ------------ |
| **active** | The boxes follow the animation: idle, walk, run, sprint, crouch, jump, jabs, kicks, sword swings, guards, aiming, taunts |
| **stumble** | After a solid hit the boxes are simulated, and muscles pull them toward a staggering pose at reduced strength. They recover, or they fall |
| **ragdoll** | No muscle. Every part swings on its own joint |
| **getup** | Lying still again: a get-up from the back or the front, blended in from wherever the body came to rest |
| **dead** | A ragdoll that does not get up |

### Damage needs contact

A punch only lands if the fist box actually overlaps a body part, a kick the
foot, a swing the blade. A raised shield in the way stops it. How hard it lands
comes from the real closing speed at the moment of contact, so spacing matters.
Bullets are rays tested against the same boxes.

What it leaves is painted onto that body part's own canvas, at the exact spot:

- **Bruises** from fists, kicks and the wooden sword: a mottled plum heart and a
  yellow-green halo. On clothing, a scuff.
- **Cuts**: a short split with a pink margin. The wooden sword splits skin when it
  lands hard; the rusty sword cuts on a slow stroke.
- **Slashes**: a full swing of steel opens a long gash along the way the blade
  was travelling, tears the cloth over it, and runs with blood.
- **Bullet holes**: a small dark hole with a red-brown ring where the round went
  in and, through a limb or the body, a bigger torn one where it came out.

Blood is simulated drop by drop and paints whatever it lands on: the sand, the
cobbles, other fighters, shields, the blade that drew it. Open wounds drip and
run down the body; the dead pool.

### Sound

Synthesised on the spot with WebAudio, so there are no sound files: blows by
kind, swishes, blocks on arms and on oak, shots and ricochets, the portcullises
rattling and the oak doors creaking, a crowd that murmurs and roars, coins, the
horn, and war drums while a wave is on.

## Layout

```
barrage/
  index.html          every screen
  style.css           mobile first, safe-area aware
  fonts/              Bungee and Barlow Condensed (OFL), inlined by the build
  src/
    main.js           start-up, menus, pause, saving, the frame loop
    core/             helpers, input (stick, drag, buttons, keyboard), sound
    physics/          rigid boxes and joints (XPBD), box-box contact
    game/
      rig.js          the eighteen parts and their joints
      anim.js         poses and clips: walking, jabs, the kick, guards, the shield, aiming, get-ups
      fighter.js      a person: states, strikes, damage, stamina, gear
      player.js       you
      brain.js        the box ragdolls' fighting, the gunners, the shopkeeper
      waves.js        who comes out when, coins
      arena.js        the sand, the wall and gates, the stands and crowd, the plaza, the Stall
      gear.js         what the Stall sells, and things held in a hand
      guns.js         bullets, the aiming line, tracers
      blood.js        drops, wounds, and which mark each blow leaves
      paint.js        canvases on boxes; bruises, cuts, slashes, bullet holes
      appearance.js   what everyone wears
      camera.js       over your shoulder
      textures.js     sand, sandstone, cobbles, planks, the awning, banners, signs
    data/             the save file, the profile (coins, bag, slots), accounts and the cloud
    ui/               HUD, inventory, the Stall, accounts, settings, icons
  tools/
    build.mjs         folds the game into dist/barrage.html and its Claude page
    verify.mjs        drives the real game in Chromium and checks it
    mockcloud.mjs     a stand-in for the Claude page's database, for verify
```

The physics, the rig, the animation system and the blood come from OVERGROWTH,
and the account system follows BLACKSMITH's; both are other games in this
repository, each on its own branch. three.js comes from `vendor/three.module.js` at the repository
root, shared with GOREBOX.

## Verifying it

```
npm install -D playwright esbuild && npx playwright install chromium
npm run verify:barrage                              # the source
npm run build:barrage && npm run verify:barrage:file  # the single file
```

`tools/verify.mjs` drives the real game on a phone-sized touch screen and checks
that: the title has PLAY, LOG IN and SIGN UP; PLAY puts you in the middle with
wave 1 starting and the portcullises opening; the joystick moves you and dragging
turns the camera; PUNCH, KICK, JUMP, CROUCH, SPRINT and BLOCK each do what they
say and cost what they should; blows land by contact, bruise, stumble and knock
down, and the fallen get up; kills and clears pay coins and open the south doors;
the Stall sells the three items at 10, 50 and 10, refuses what you cannot afford
and buys back at half; the inventory has 60 slots and the eight equipment slots,
puts the shield in the offhand but not the weapon slot, takes nothing in the
armour slots, and equips by drag and drop; the sword and shield appear in your
hands; the rusty sword cuts and slashes; a raised shield stops blows; a gunner's
bullets hit whoever is in the way and leave bullet holes; you can fall and start
again with your coins; saves survive a reload; and, against a stand-in for the
Claude page's database, that sign up, cloud saving, log out, a wrong password and
log in all work and only a salted hash is stored. With `--file` it opens the
built file and fails if it fetches anything at all.

Fonts: Bungee and Barlow Condensed, SIL Open Font License (`fonts/OFL-*.txt`).
