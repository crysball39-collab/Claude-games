# STICKFIGHTS

A 2D sandbox of stickmen with minds of their own, on a grey background and a
black floor. You spawn **stickmen** and **police officers**, **brass
knuckles**, **combat knives**, **machetes**, **Glock-19** and **M1911**
pistols, **tasers**, **light vests**, **ammo boxes** and **crates**, and the
stickmen get on with it: they look around, talk, make friends and enemies,
shake hands and hug, pick things up and put them in their pockets, climb on
things, fight until they are out of breath, run, hide, help each other up, get
hurt, stumble, break bones, lose limbs, and die - and the ones still standing
feel it, and remember it. Whoever does something to somebody else has the
police to answer to.

Stickmen have **stamina**: running, fighting and jumping use it up, and out
of breath they slow down, hit softer and stop to catch it. Blows **knock them
back**, and a hard one sends them **stumbling** - nothing keyed, a body
balancing on its feet and stepping to catch itself, which it does, or does
not. A pistol or a blade they are not using goes back in the **holster** or
a **pocket**, and comes out again when there is trouble. **Officers** go
after whoever commits a crime: "Police! Stop!", the taser for anyone who will
not give up, the M1911 only for someone about to kill somebody, and the
cuffs.

And you can get inside their heads: drag their feelings up and down, change
their personality, change who they count as a friend or an enemy, and send
them off to fight someone.

**Mods** add things that are not part of the game itself: **Murder Drones**
brings Uzi, N and V, **Minecraft** brings Steve - and the Wither, a boss
with 600 health that you craft a totem to summon - and **Shallow** is
something disguised as a stickman that tears its way out of the skin when it
is angry, kills whoever did it, and climbs inside somebody else (see
[Mods](#mods)).

While a stickman is in charge of their own body, every move they make is a
hand-keyed animation, played frame by frame. The moment they are not -
knocked off their feet, knocked out, killed, picked up, thrown - physics takes
over and they go limp: a **ragdoll** with real joints, which bend only the
ways a person's do.

## Getting it onto a phone

**`dist/stickfights.html` is the whole game in one file.** Download it and
open it: no server, no install, no network. Markup, styles and every module
are inlined.

| Phone | What to do |
| ----- | ---------- |
| **Android** | Download `dist/stickfights.html`, open **Files → Downloads**, tap it. It runs in Chrome. |
| **iPhone / iPad** | Download it, then **Files → Downloads → tap `stickfights.html`**. Safari runs it. |

It plays in either orientation; landscape shows the most of the world. **Add
to Home Screen** gives a full-screen game with no browser bars.

### Running the source instead

```
./serve.sh            # from the repository root
# then open http://localhost:8080/stickfights/ on a phone or a desktop
```

ES modules do not load from `file://`, so the unbundled source has to be
served. To rebuild the single file after changing anything:

```
npm install -D esbuild
npm run build:stickfights     # -> dist/stickfights.html
```

---

## Playing it

The title screen has a few stickmen already going about their business behind
it, one of them nursing a grudge. **PLAY** clears them away and opens the
spawn menu.

The spawn menu (☰ **SPAWN**, top left) has thirteen things in it, in three
sections:

| Section | Thing | What it is |
| ------- | ----- | ---------- |
| People | **Stickman** | A normal human. Thinks, feels, remembers, fights back. |
| People | **Officer** | A police officer: cap, uniform, a police vest, an M1911 in the holster and a taser on the duty belt. Goes after whoever commits a crime. |
| Weapons | **Brass Knuckles** | Worn on the hand. Punches with them land about twice as hard, and cut. |
| Weapons | **Combat Knife** | Held in the hand. Stabs and slashes; deep cuts bleed fast. Thrown point first, it sticks in. |
| Weapons | **Machete** | Chops and hacks. Leaves gaping wounds, and a hard enough blow takes off a hand, an arm, a foot or a leg. |
| Weapons | **Glock-19** | A pistol: 15 rounds in the magazine and two spare. Bullets go through people and crates, and ricochet off the floor. |
| Weapons | **M1911** | A .45: seven rounds and two spare magazines. Each one hits harder and goes further through than a 9 mm, and it kicks. |
| Weapons | **Taser** | Two barbed probes on wires: both in, and five seconds of current lock every muscle - down they go, stiff as a board. A vest stops it. Out of cartridges, it still hurts pressed against somebody. |
| Objects | **Crate** | 22 kg of wood. Stack it, climb it, throw it - or let a stickman throw it. |
| Objects | **Light Vest** | Soft armour for the body. Stops most pistol rounds to the chest - they still land like a hammer - and takes the worst out of a blade. Wears down with every round. |
| Objects | **Small**, **Medium** and **Big Ammo Box** | 30, 80 and 200 pistol rounds: a cardboard box, a plastic case and a steel can. Anyone running low comes and fills up. |

Pick one and the menu closes with the **spawn tool** armed: every tap on the
world places another. A stickman appears on whatever is under the tap;
anything else appears exactly where you tapped and falls.

The three tools along the bottom:

| Tool | What it does |
| ---- | ------------ |
| ✋ **HAND** | Drag anything to move it. Let go while moving to throw it. Tap a stickman to open their mind. Drag empty space to pan. Drag a blade stuck in someone to pull it out. Tap a pistol or a taser lying on the floor to fire it (empty, a tap puts a fresh magazine or cartridge in). Tap an ammo box or a vest to see how much is left in it. |
| **SPAWN** (shows what is picked) | Tap the world to place it. |
| ✖ **ERASE** | Tap something to remove it. |

Pinch (or the mouse wheel) zooms, two fingers pan. Along the top right: sound,
slow motion, pause, settings, and clear everything (tap twice).

**Tap a stickman** to open the inspector: their name and mood, what they are
doing, their personality, five emotions, how conscious they are, their
adrenaline, oxygen and temperature, pain, blood and stamina, an X-ray
of their body coloured by injury - every broken bone snapped and named,
whatever has been cut off missing, joints out of their sockets ringed in
purple, bullets still in them in gold - what they are wearing and carrying
(a vest and how much is left of it, what is in the holster, a pocket and on
the duty belt), the options they are weighing up right now and how much each
appeals, what they remember, and their recent thoughts. **Follow** keeps the
camera on them, **Heal** mends them (not the dead), **Uncuff** lets somebody
in handcuffs go, **Put away** has them holster or pocket what is in their
hand (and **Get it out** draws it again), **Remove** takes them away.

The inspector is also where you change their mind:

- **Feelings** - each of the five emotions is a bar: drag it to make them as
  happy, sad, angry, frightened or surprised as you like. Feelings settle back
  over time, as feelings do, but what they do in the meantime is up to how
  they feel. The **padlock** at the end of a bar **locks** that feeling where
  it is: nothing that happens to them moves it up or down - not time, not a
  punch, not a hug - until it is tapped again. Dragging a locked bar still
  sets it, and it stays wherever it is put.
- **People** - everyone else in the sandbox, under what this one thinks of
  them: **Friends**, **Knows**, **Dislikes**, **Enemies**, and anyone they
  have not met yet. Each row has a menu to move that person to another group
  (an enemy stays an enemy - the grudge does not wear off; making someone a
  friend forgives the old grudges), and a **Fight** button that sends them
  after that person, friend or not, until that person is down (**Stop**, or
  **Call off** on the banner, calls them back).
- **Personality** - eight sliders, one for each trait. Everything that grows
  out of a trait follows it: a braver one stops running, a kinder one starts
  helping, a more hot-headed one rests angrier.
- **Temperature** - the box at the end of the Temp bar shows their body
  temperature, and anything typed into it (and Enter) becomes it: `40`,
  `-12.5`, `104F`, `300 K`, `37 °C` - or a word: `normal`, `hot`,
  `boiling`, `cold`, `freezing`. 60 °C or more and they catch fire; 0 °C or
  less and they freeze solid; in between, the heat or the cold does what it
  does (below). Their body brings it back toward 37 on its own, unless the
  **padlock** beside it is on: then it stays exactly where it was put.

**Settings** turn names, speech bubbles, thought bubbles and blood on and off,
switch on **flipbook** animation (below), and switch **ragdoll physics** off,
for the old animated falls.

Keyboard: `1` to `6` pick a stickman, knuckles, a crate, a knife, a machete
or a Glock-19 to spawn, `7` to `9` the first three things the installed mods
add, `H` hand, `X` erase, `Space` pause, `S` slow motion, `F` follow, `Tab`
spawn menu, `+` `-` zoom, `0` reset the camera, `M` sound, `Delete` removes
whoever is selected, `Esc` closes things.

---

## Mods

Mods are things made for STICKFIGHTS that are not part of the game itself,
and never will be. None of them is in the game until it is installed, and
the game is exactly the same without them.

**MODS** - under PLAY on the title screen, and at the top of the spawn menu -
lists every mod: what it is, what it adds, and the **storage it needs**,
which is what its files really take up (measured every time the game is
built). **INSTALL** fills a bar as it goes in, and then what it adds turns up
at the bottom of the spawn menu in a section of its own, tagged MOD. The
device remembers which mods are installed. **REMOVE** asks once more, then
takes the mod out of the spawn menu and everything of it out of the world:
its people, weapons and blocks, whatever was cut off them, and whatever of
it is still going on - a missile or a skull in the air, acid or withering in
somebody.

### Murder Drones

Three drones from a cold, dark planet, each with a personality, a look and
skills of their own.

| | Who they are | How they arrive | What they can do |
| - | ------------ | --------------- | ---------------- |
| **Uzi** | A worker drone: small, brave, sarcastic, quick to anger and not one for company. She does not trust murder drones - V least of all - and says so, but she does not start fights with N or V: the railgun only comes round on them if they come at her, or have just hurt her. Purple visor eyes, a beanie, purple hair. | Walks in with the **railgun** she built already in her hands. | The railgun charges for nearly a second with a rising whine, then goes through everything in a line out to the wall - people, crates, drones - knocking people off their feet and often taking a limb with it. Then it needs a few seconds to charge again. It kicks, and she is light: sometimes it staggers her. Tapped where it lies, it charges and goes off by itself. |
| **N** | A disassembly drone who would really rather be friends: kind, keen, nervous, apologetic - and very dangerous when he has to be. Yellow eyes, a cap, a white collar. | Comes down out of the sky and **crash-lands** on one knee with his **wings out**, cracking the floor; whoever is right there goes over. | Hands that turn into a **chainsaw** (pushed in and held there, biting again and again), a **gun** (quick bursts), a **sword** (long reach, deep cuts, takes limbs off), **claws** (three cuts at once), a **laser** (a beam that burns whatever it stays on) or **missiles** (salvos of three that home in and explode). A **tail** with a needle full of **nanite acid**, that comes over the shoulder at whoever is close. **Wings**, to fly at someone. |
| **V** | Another disassembly drone, who enjoys the work far too much: fearless, vicious and playful about it. She hunts anyone who is not a drone; Uzi she likes to remind that she *could*. Blonde hair over one eye, an apron. | The same: out of the sky, a crash landing, wings out. | Every one of N's abilities. She likes the chainsaw, and flying at people. |

What being a drone means:

- **Oil, not blood.** Drones bleed oil: their wounds, stumps, stains and
  severed limbs are oil-coloured.
- **Disassembly drones** are about twice as hard to hurt - armour plate, so
  fists barely dent them - quicker and stronger than anyone, fall from any
  height and land on one knee, and **mend**: wounds close, bones knit, joints
  go back in, and a limb that was cut off **grows back** in about half a
  minute. Nanite acid takes on them only half the time.
- **Nanite acid** eats at the part the needle went into for about ten
  seconds, more and more of it, spreading to the body. For a worker drone it
  is the end of them.
- **How they fight.** A disassembly drone picks its hands for the distance
  and the plan - fly at them with blades out, or stand off and shoot - and
  changes its mind, and its hands, as the fight goes on. Close in, the tail
  comes over the shoulder. N would mostly rather not fight at all: he chats,
  helps the hurt, ties off stumps, and puts his hands up when a gun is
  pointed at him. V hunts. Uzi fights like anyone with a gun - with that gun.
  With nothing to do, a disassembly drone may turn a hand into something
  just to have a look at it.
- **Who they know.** Uzi is wary of murder drones - N she half trusts, V
  not at all - but she keeps her railgun for whoever starts it, and the
  names V calls her are not enough to start it either; N likes everyone, and
  he and V go back a long way; people who have never seen a drone are
  frightened of the wings, the tail and the glowing eyes, and say so when a
  hand turns into a chainsaw.
- **What they say.** Each of the three has a great deal of their own to say -
  nearly everything they say is theirs - and much of it is said to one of
  the other two in particular: Uzi needling V, V teasing N, N trying to keep
  the peace. Everyone else has new things to say about them: being sawn,
  clawed, stung, burned or blown up, and watching it.
- **In the inspector** a chip says what they are (*Worker Drone* or
  *Disassembly Drone*), and what their hands are is listed under BODY. A
  disassembly drone has an **ABILITIES** section: **Hands** - *Auto* (they
  choose), *Hands*, *Chainsaw*, *Gun*, *Sword*, *Claws*, *Laser*, *Missiles*,
  which locks their hands to that until it is changed back - and **Do** -
  *Tail strike* and *Fly*.

### Minecraft

Things out of a world made of blocks.

| | What it is |
| - | ---------- |
| **Steve** | A blocky man with a cube for a head: calm, brave, curious, a man of few words. He keeps his own kit: a **diamond sword** (long, sharp, it hacks, and can take a limb off), a **bow**, and **three golden apples**. |
| **Crafting Table** | A block. Tap it to see its crafting grid. |
| **Soul Sand** | A block of dark sand full of faces. |
| **Wither Skull** | A wither skeleton's skull. |
| **Wither Totem** | Four Soul Sand in a T with three Wither Skulls on top - crafted, not spawned. The Wither comes out of it. |

The blocks are crates as far as the world is concerned: they fall, stack,
get climbed, sat on and thrown.

**Steve.** He fights monsters on sight and gets on with people. Close in, the
sword. For anything far off or up in the air, he swaps to the bow: he draws
it back, takes a moment to aim and lets go, and the arrow drops as it flies
(he lobs it to make up for that) and stays in whatever it hits - and it can
miss, and hit whoever is in the way. Hurt, or withering, he eats a golden
apple: a good part of it mended at once, and **Regeneration** for a few
seconds after. He says *oof* when he is hit. In the inspector his
**ABILITIES** are **Hands** - *Auto*, *Diamond sword*, *Bow* - and **Do** -
*Eat a golden apple*. Healed, he gets his three apples back.

**Crafting a Wither Totem.** Put **4 Soul Sand** and **3 Wither Skulls**
within 3 m of a **Crafting Table** (or on top of it) and tap the table: its
grid shows what it can see. **CRAFT** turns them into a Wither Totem, which
goes into the spawn menu. Its card says how many there are to place - until
one is crafted it says CRAFT and is locked, and tapping it says how.

**Summoning the Wither.** Placed from the spawn menu, the totem stands on
the floor with an **ACTIVATE** button over it. Press it, and the totem floats
up, glows whiter and whiter and shakes harder and harder - a bar fills along
the top as it does - then explodes. Out of the blast comes the Wither.

**The Wither** is a boss: three heads on a spine and a tail, with a **boss
bar** along the top and **600 health**, which mends by 1 a second. It has no
mind to look into - the inspector shows what it is doing, its health and its
phase - and nothing knocks it down, cuts anything off it or picks it up. Its
inspector has buttons to make it shoot either skull, charge, call up
skeletons, or go straight to its second phase.

- **Phase 1.** It hangs up in the air, out of reach of anyone without a gun
  or a bow. The middle head spits black **wither skulls** at whoever it is
  after (whoever is nearest, or whoever has just hurt it); the side heads at
  anyone else about; and every so often comes a slow **blue skull**, which
  goes off in a far bigger blast.
- **Withering.** Everything it does - skulls, blasts, charges - **withers**
  whoever it catches: they darken and their health drains away for some
  seconds (worse, *Withering II*, from a blue skull), and it can kill them.
  The inspector shows it under BODY, with the seconds left.
- **Half way** it stops, shakes, glows - and goes off like a bomb, coming out
  of it in **Wither Armour**, with **wither skeletons** standing up out of
  soul fire around it. The boss bar says so.
- **Phase 2.** Arrows, bullets and the railgun bounce off the armour. It
  comes down low, where swords and fists can reach it, **charges** at people
  and rams through them, and calls up more skeletons now and then.
- **Beaten**, it roars, shakes, glows white - and explodes. Where it was,
  there is a **Nether Star**.

**Wither skeletons** are tall and nearly black, with a **stone sword** each,
and every cut from one withers. Nothing frightens them (their fear is locked
at nothing), they never say a word - only rattle - and they go for anything
alive that is not undead. They and the Wither never hurt each other. Killed,
one lies a moment, then is gone in a puff of smoke, sometimes leaving its
skull: enough of those, and there is another totem.

**Everyone else** treats the Wither and its skeletons as what they are: they
fight them or run from them, but never make friends, chat, or mourn them -
and they have plenty to say about them, about withering, and about Steve's
head.

### Shallow

Something disguised as a stickman.

| | What it is |
| - | ---------- |
| **Shallow** | Looks like anybody: a name, a height, a haircut, a voice, friends. It is not. |

**The disguise.** Spawned, it is a stickman like any other, with a short
temper: it talks, makes friends and wanders about, and everyone takes it for
a person (in the inspector, and only there, a chip says *Shallow, in
disguise*). What gives it away, to anyone watching closely: now and then its
head twitches to an angle a neck should not go to, its face slips for a
blink, and it mutters things under its breath.

**Angry, it splits.** Hit it, insult it, point a gun at it, hurt somebody it
likes - or drag its anger up in the inspector, or press *Tear out* - and black
cracks spread over the body, the face goes dark with two white pupils
looking out of it, and it tears its way out of the skin. The skin is left
lying where it stood, empty and split down the back. Killed in disguise, it
comes out of the body.

**The thing itself** grows up out of the skin until it stands two thirds
taller than it did: thin, hunched and blacker than anyone's ink, with a long
head, two white pupils with nothing around them, a grin from the back of its
jaw to the front full of sharp white teeth, and five long black claws on each
hand. Black flakes come off it. It is very hard to hurt - fists hardly touch
it, bullets not much more - it does not stumble, a taser does nothing to it,
it never tires, and it mends: wounds close, bones knit, and anything cut off
grows back.

**It goes after whoever made it angry**, each of them in turn, the nearest
first, and anyone who hurts it goes on the list. It runs them down, takes
them by the neck, lifts them up in front of its face, and either:

- **tears them in half**: the other hand on their hips, and a pull. The top
  half dies in its hand; the legs are a thing of their own, dripping; or
- **eats them**: three bites - the head, the body, the legs - and something
  goes down its throat.

**Then it takes a skin.** With nobody left that it is angry with, it goes
for the nearest person, picks them up with their back to it, opens their
back from the neck to the hips with its claws, pulls out their skeleton in
one piece and throws it over its shoulder, then the heart, the lungs, the
stomach and the guts, and lets the empty skin drop. It crouches over it, gets
smaller and smaller, and pours itself in through the split. The skin fills,
the split closes, and **they get up**: the same name, height, hair, voice and
uniform, the same friends and memories - an officer is still an officer - and
it is Shallow, in disguise, until somebody makes it angry again.

**Only the people who saw it happen know.** They keep away from whoever it
is wearing now, tell other people (who believe it or not by how much they
trust them), and say so - *That's not Cy any more!* - and the brave ones go
for it, which is just what brings it out. Everyone who sees it out of its
skin is terrified of it.

The skins, the halves, the skeletons and the insides lie where they fall,
and the hand from above can pick them up and throw them. In the inspector
the thing has **ABILITIES**: **Kills by** - *Either*, *Tearing in half*,
*Eating* - and **Do** - *Take a skin* (straight to the nearest person) and
*Let go*.

### Making one

A mod is a folder under `src/mods/` whose `index.js` calls `registerMod()`
(`src/mods/registry.js`) with its id (the folder's name), name, version, a
few words about it, what it adds, a picture, the things it puts in the spawn
menu, how to tell its things in the world, and anything it needs hooked up
when the game starts; `src/mods/index.js` imports it. `tools/mod-sizes.mjs`
measures every mod folder into `src/mods/sizes.js`; the build runs it first.

The game has a few ways in that change nothing until a mod uses them:

- a **species** on a stickman, with a hook into each part of their life it
  does its own way: how they are made, drawn (wings, tails, heads, hands),
  move, fly and land, what their strikes are, how hard they are to hurt,
  what they think of people when they first meet them, what else they might
  decide to do and how they fight, what the inspector shows of them, and
  what its buttons do
- `man.innate`: a weapon that is part of the body
- `defineArm()` (`game/props.js`): how a weapon hurts - sharp, chops,
  gashes, takes limbs off, burns, shoots - what its wounds and the deaths it
  causes are called, and what people say and remember about it
- `GUN_KINDS`: a gun of the mod's own, which fires, draws and describes itself
- `sandbox.effects` and `man.afflictions`: things going on over time - a
  beam, a missile, acid in a wound - drawn by the renderer
- `addLines()` (`game/lines.js`) and a person's own `lines`, `defineClip()`
  (`game/clips.js`) and `KINDS` (`game/behaviours.js`) for new things to
  say, animations and behaviours; a line under `kind@key` is said in place
  of `kind` to someone whose look has that key
- for monsters and bosses: a species can be `mindless` (no brain - its own
  hooks do the thinking, and `inspect` says what the inspector shows),
  `steadfast` (nothing knocks it down or cuts anything off), a `monster`
  (fought or fled, never befriended, and nothing the law cares about),
  `tireless` (it never runs out of breath), `mute`; it can `zap` (how a
  taser takes it), `pose` its own joints,
  give a `proxy` box to bump into, say who it is `hostileTo`, whether it is
  `reachable`, what it `deflects` and whose blows it `spares`, draw its whole
  body itself (`skin.full`), and put up a `bossbar`; any species can weigh a
  fight against someone (`fightScale`) and hear what is said to it
  (`spokenTo`)
- `sandbox.items`: things that are neither a body nor a crate - a skull on
  the floor, a totem - with their own drawing and updating, and optionally a
  `panel` (tapped, like a crafting table's grid), a world `button` (ACTIVATE)
  or a `bossbar`; a crate with a `drawShape` draws itself
- a thing in the spawn menu can have a `badge` and be `locked`, with `why`
  it is; a mod's `cleanup` runs when it is removed
- `brain.lockEmotion()`: a feeling held where it is
- a species can be `human` (a person in every way the game cares about -
  holsters, pockets, vests - for something passing as one) or `sturdy` (too
  big to be knocked back, stumbled or bowled over by a flying body: it
  flinches, and that is all), can have a `mind` (its own thinking, whenever it
  wants, with the brain still seeing and hearing for it) and say what it is
  `doing` for the inspector
- `man.grab(x, y, by)`: somebody taken hold of by somebody else, not just the
  hand in the sky; `heldBy` says who, and they are let go if whoever has them
  is removed
- `sandbox.remove(thing, { quiet: true })`: out of the world without anybody
  noticing it go; the `becomes` event: somebody carries on in another body,
  and the inspector and the camera go with them
- `addMemoryKind()` (`game/brain.js`): a new kind of thing to remember, and
  to tell people about
- `drawHead()` (`game/draw.js`): an ordinary head, for a skin to draw its own
  way (squashed, say)
- something in `sandbox.items` that is not one rigid body - a ragdoll of its
  own - is picked up by the hand from above with `handGrab`, `handHold` and
  `handRelease`
- a species can say it `breathes: false` (a machine; the `undead` do not
  either), and be `fireproof` or `frostproof`; `game/vitals.js` has
  `ignite()`, `extinguish()`, `freezeSolid()`, `thaw()`, `setTemperature()`
  and `warm()` for anything of a mod's that sets people alight, freezes
  them or warms them up
- blood lands on a mod's things by themselves: on a rigid `body` in its
  frame, on a ragdoll of its own by its nearest point, on anything else by
  where it is (`contains` says what it covers) - or a thing can keep it its
  own way with `stain(x, y, r, tint)`, or refuse it with `stainable: false`;
  `sandbox.fx` has `gush()` (a squirt) and `feedStream()` (a stream kept
  going), and `game/blood.js` `splatter()` for a body hitting something

---

## What is simulated

### A skeleton with real bones

A stickman's skeleton (`src/game/skeleton.js`) has fifteen joints: the hips,
a spine in two parts (the lower back up to the chest, the upper back up to the
neck), the neck, the head, the shoulders - partway down the upper back, not
on top of it - and both elbows, hands, knees, ankles and toes. Between them
are thirteen named bones: the **skull**, the **neck**, the **ribs**, the
**spine**, the **pelvis**, and a **humerus**, **forearm**, **femur** and
**tibia** on each side. The long bones have a point halfway along, where they
break.

### Animated while they are in charge

Every pose they strike on their own comes from **hand-keyed clips** in
`src/game/clips.js`: 122 of them, from idling and walking to a front kick, a
knife thrust, a machete chop, aiming and reloading a pistol, tying off a
tourniquet, press-ups, a hug, falling on your back, getting up off your front,
sobbing into your hands and dying. Each clip is a list of frames, and
each frame is a pose and how long it is held.

```
idle  idleHappy  idleSad  idleAngry  idleScared  idleHurt  talk
walk  run  runScared  shuffle  crawl
jumpCrouch  rise  fall  land  flail  tumble  dangle  dangleLimp
guard  jab  cross  uppercut  kick  stomp  block  dodge  duck
hitHead  hitBody  hitLow  stagger  flinch
fallBack  fallFront  lieBack  lieFront  writheBack  writheFront  koBack  koFront  pinned
getUpBack  getUpFront  dieCollapse  dieBack  deadBack  deadFront
pickup  lift  carry  throw  push  climb  knock  inspect
kneel  cry  beg  cower  cheer  dance  laugh  wave  beckon  point  shout  shrug
facepalm  scratchHead  stretch  sigh  clutchHead  sitDown  sit  sitHurt  sitEdge
knifeGuard  stab  slash  knifeThrow  pullOut  brace  protectHead  handsUp
armsCrossed  handsOnHips  tapFoot  yawn  kickDirt  lookUp  wipeBrow  flex
shadowbox  laughPoint  highFive  hug  handshake  clap  thumbsUp  nod  bow
pushups  squats  jumpingJacks  clutchStomach  clutchArm  shiver
macheteGuard  chop  hack  aimPistol  gunLow  reload  tourniquet  popJoint
retch  checkWound  clutchStump  shock  coverHead
```

Clips play in three layers - a base (standing, walking, lying), an upper-body
hold the legs carry on under (fists up, a knife held low, a crate overhead)
and one-shots on top (a punch, a wave, a flinch) - and crossfade into each
other, so nothing pops. Walking and running play at whatever speed keeps the
planted foot from sliding. With **flipbook** on, nothing is in-between at all:
each key is held for its time and then cut to the next.

On top of the clip go a few things a clip cannot know: breathing, trembling
with fear, a head that tilts to look at whoever it is watching, a punch angled
at the head it is aimed at (a stab at the middle), a limp onto the bad leg, a
dizzy wobble, and a broken bone that bends where it broke.

Whatever the pose, its lowest point rests on the floor, so a crouch sinks, a
kneel kneels, and a lying pose lies down without any clip having to say how
high the hips are.

Moving about is a small character controller, not physics: walking, running,
jumping, falling, stepping onto anything shin-high, jumping up onto a crate,
pulling themselves up onto a stack, pushing a crate they lean on, and riding
along on one that is moving.

### Ragdolls when they are not

`src/physics/ragdoll.js` is a ragdoll engine: Verlet integration, the way
Thomas Jakobsen did the bodies in Hitman. Every joint is a point with a mass
(about 70 kg in all, most of it in the hips, chest and thighs), every bone a
stick between two points that keeps its length, and each step a few passes
make everything true at once: bones the right length, joints inside their
range, nothing through the floor, the walls or a crate. `src/game/limp.js`
turns a stickman into one and back, and holds the joint ranges, roughly a
person's:

| Joint | Bends through |
| ----- | ------------- |
| waist (upper back on lower) | -25° .. 55°, arched to hunched |
| neck | -50° .. 60°, head back to chin down |
| shoulder | -5° .. 240°, overhead to well behind |
| elbow | 150° forward, 5° back |
| hip | 45° .. 210°, knee to chest to leg behind |
| knee | 150° back, 3° forward |
| ankle | 60° .. 150° to the shin |
| a broken bone | flops ±75° at the break |

On top of the ranges, every joint has **muscles**, which pull toward the pose
an animation wants for as long as there is someone awake inside, and the give
of the tissue around it, which lets a limp body settle the way a limp body
settles instead of folding up. How hard the muscles pull depends on what is
going on:

- **knocked off their feet** - half-tense, trying to catch the fall; once the
  body comes to rest they get up, blended from wherever the ragdoll left them
  into a get-up clip
- **knocked out** - nothing pulls at all; out cold until they come round
- **dying** - the muscles give out as they go, and the body crumples
- **picked up** - an awake body kicks and flails; held by an ankle they hang
  upside down from it; the knocked-out and the dead just hang
- **thrown** - flailing in the air, then bracing with their arms as the
  ground comes up

The body keeps its facing: in 2D a tumbling body can turn over, but never into
its own mirror image, so the joints stay the right way round however it lands.
Broken limbs hang from the break, a paralysed body does not pull at all below
the injury, and a ragdoll knows which way it is lying, so it gets up off its
back or its front.

Ragdolls touch everything: they pile up on each other, drape over crates,
knock crates about, and stop a falling crate, which lands on the body and
pins it there. A body that hits the floor, a wall or a crate fast enough gets
hurt where it hit, and hard enough breaks bones.

### Bodies get hurt

Six parts take damage separately: head, torso, both arms, both legs, with the
bones inside them (see `src/game/health.js`). On top of that:

- **Broken bones** - a blow hard enough for the bone it lands on can break
  it, and so can a bad landing. Each one does what it would:
  - **skull** - bleeds, and leaves the head easier to knock out and to kill
  - **neck** - kills about half the time; otherwise paralyses them from the
    neck down, awake on the floor
  - **ribs** - hurt with every breath and slow them down; a bad enough break
    punctures a lung, which bleeds inside
  - **spine** - takes the legs: they drag themselves along on their arms
  - **pelvis** - no standing on it
  - **humerus**, **forearm** - the arm cannot punch, stab, carry or block,
    and hangs, bent where it broke
  - **femur**, **tibia** - the leg cannot take weight: down they go, and crawl
- **Blood** - cuts bleed and bleeding clots. The inspector's Blood bar is
  what they can still lose: at 0% (with about 38% of a body's blood still in
  them) the heart has nothing left to pump - they die of it, and they are
  bled dry: they stop bleeding, and nothing more comes out of them, whatever
  is done to them. Brass knuckles cut; a hard enough blow to the face
  splits it anyway; a blade cuts far deeper than a fist. A stab in the body
  bleeds inside, where it clots slowly, and one in the neck is the worst of
  all. Someone pressing on the wound slows it right down.
- **Pain** - spikes with every hit and settles back to what the injuries
  still ache. It slows people down, makes them sit down, and frightens them.
- **Consciousness** - a few clean shots to the head knock anyone out, long
  before they would kill, and a head that has already taken a beating cannot
  be fully awake, so the next good hit puts it out again. Lose too much blood
  and you pass out too. Coming round after a knockout is frightening: most
  people want nothing more to do with whoever did it.
- **Dizziness** - stars go round the head, and the head will not keep still.
- **Severed limbs** - a machete coming down hard enough cuts clean through
  the middle of a forearm, an upper arm, a shin or a thigh. Everything past
  the cut comes away as a piece of its own - a hand, an arm, a foot, a leg -
  that falls, bleeds onto the floor and can be picked up and thrown. The
  stump spurts and clots only slowly; a lost leg puts them on the floor, a
  lost hand drops whatever was in it. The ragdoll loses the piece too.
- **Tourniquets** - a stump or a cut artery needs tying off, and a friend
  kneels down and does it (a tie, a hard pull); it all but stops the bleeding.
- **Dislocations** - a kick to the knee, a bad landing, or being swung about
  by an arm can put a shoulder, an elbow or a knee out of its socket. The
  limb hangs useless at a wrong angle until someone grips it and pops it back
  in - with a horrible noise.
- **Gunshot wounds** - a bullet makes a hole going in and, if it has the
  energy, a bigger one coming out, and then goes on into whatever is behind.
  It can stay in instead, lodged in a bone. A limb shot can hit an artery; a
  body shot bleeds inside, and now and then hits the heart or the spine
  (the legs go); a head shot usually kills. Being shot usually puts people on
  the floor - each one more likely than the last - and a shot arm drops the
  gun.
- **Machete wounds** - gaping gashes that bleed harder than any knife cut.
- **The face** - punches leave black eyes, a bloody or broken nose, a split
  lip, a cut brow, a swollen face and knocked-out teeth (with gaps in the
  grin), all of which fade except the teeth.
- **Shock** - bad enough wounds and blood loss put them in shock: pale, cold,
  shaking and slow, and sometimes they just faint. Seeing something horrible
  done to someone else can make them faint too, or throw up.
- **Death** - from the head, from the torso (internal injuries), a broken
  neck, a bullet, or bleeding out. The dead lie where they fall, with crosses
  for eyes, and keep bleeding into a pool under the wounds for a while -
  until it clots, or there is none left. Bleeding out is still somebody's
  doing: whoever opened the wound gets the blame.

Damage comes from fists, feet and blades, bullets, thrown crates, knuckles and knives,
crates dropped on people, falls, being thrown into the floor, a wall or a
crate, and other people being thrown into them. A blow lands on whichever
bone it touches, knocks the body back, and drains its balance: a small hit is
a flinch, a bigger one a stagger, and running out of balance knocks them off
their feet - limp, on their back if hit from the front.

### Brains

Every stickman has a brain (`src/game/brain.js`), and a personality to run it
on - eight traits, each from 0 to 1: **bravery, aggression, temper, empathy,
sociability, curiosity, toughness, skill**. Most people are middling; a few
are extreme.

**Sense.** About five times a second they look around. They see what is in
front of them, within fourteen metres, and not hidden behind a crate - so
hiding behind one works - and notice things right behind them only when they
are close. A blow landing, a shout or a voice right behind them makes them
turn round to look. They remember who they have seen and where.

**Feel.** Everything that happens - a punch, a stab, a scream, a crate going
past, a death, someone vanishing into thin air - reaches every brain, and each
decides whether it saw it or heard it. It then changes five **emotions** (joy,
sadness, anger, fear, surprise) and how they feel about **each person**: how
much they like them, fear them, are angry with them, and know them. A few
examples:

- hit by someone: hurt, surprised, frightened, and angry with whoever did it -
  doubly so if they were friends
- stabbed: far more frightened than a punch would make them
- someone with a knife in their hand: frightening even before they use it
- hit by a crate from nowhere: "Who threw that?!" - and a hot head may blame
  whoever is standing nearest
- bowled over by someone flying through the air: "Watch it!" - while the one
  doing the flying says sorry
- watching a friend get hit: angry with the attacker; watching a stranger get
  hit by someone who started it: wary of them
- watching someone die: shocked and afraid; heartbroken and out for revenge
  if it was a friend
- killing someone: guilt if they are kind, pride if they are not - and horror
  if it was someone they never meant to hit, like a bystander behind the one
  they were shooting at
- someone they cannot stand going down: funny, to the unkind, who point and
  laugh
- picked up into the sky: terrified
- a gunshot, anywhere in the world: everyone jumps; the near and the timid
  run, dive behind a crate or cover their heads, and a bullet going past
  close enough to hear is terrifying
- a gun pointed at them: hands up, "Don't shoot!" - unless they are brave
  enough, and close enough, to rush it, which is the only sensible thing to
  do from arm's length
- a limb coming off, or one lying on the floor: some scream, some run, some
  are sick, and some faint

**Remember.** The things that matter are kept as memories, each weighted by
how much it mattered: who hit them, cut them, shot at them, cut their hand
off, knocked them out, beat them in a fight; who helped them up, tied off
their stump, put their shoulder back in; who they saw stab, shoot or kill
whom. Small things fade in a minute or two, terrible ones hardly at all.
Seeing someone again after a while brings back what they remember of them -
and the feelings with it, "You! You stabbed me!" - and a bad enough memory
keeps a grudge alive long after the anger would have worn off. In a chat they
pass on what they know, so a reputation gets around: told "Axl shot me" by a
friend, they remember that Axl shot their friend, like Axl less, and fear Axl
more - by how much depends on how much they trust whoever told them. The
inspector lists the memories that matter most.

Feelings settle back over time, each at its own pace (surprise in a second or
two, sadness slowest), and the face shows them all: eyebrows, eyes, mouth,
tears, plus a symbol over the head now and then - an anger mark, a sweat
drop, a heart, a tear.

**Think.** A few times a second they score everything they could do and pick
the best. What they are already doing gets a bonus so they do not dither -
but not against something urgent, like someone coming at them. The options:

| Behaviour | When |
| --------- | ---- |
| **Fight** someone | angry with them, aggressive, and fancying their chances (their health, weapons and friends counted) - or told to, from the inspector |
| **Shoot** someone | as for a fight, with a gun: from a distance, aimed, a few shots at a time. The kind point it and shout a warning first, and leave it there if hands go up; empty, it gets reloaded out of reach |
| **Flee** / keep away | afraid of them, or of what they just watched them do - and nobody sensible squares up to a knife bare-handed |
| **Hide** | fleeing with a crate to get behind, or shots going off |
| **Hands up** | a gun pointed at them |
| **Cower**, beg, cover their head | terrified, hurt and cornered by someone coming for them |
| **Get a weapon** | angry or expecting trouble - first, if one is on the way to the fight. The kind and the timid leave a blade where it is; the brave want the gun if somebody else might get it |
| **Throw the knife** | at someone getting away |
| **Pull a knife out** | there is one in them: it comes out first, whatever else is going on - then they keep it or drop it |
| **Throw a crate** at someone | angry, with one to hand and the target out of reach |
| **Talk** to someone | sociable and bored, and the other one is not busy talking to somebody else: greetings (a handshake from the polite), small talk, compliments, insults - and friends part with a high five, good friends with a hug |
| **Help** someone | kind, and someone is down, crawling, pinned, bleeding or out cold - shoves crates off them, ties off a stump, pops a joint back in, pulls the knife out and presses on the wound, kneels by them, helps them up |
| **Mourn** someone | a friend has died: kneels by the body and cries |
| **Stand up to** someone | they are hurting a friend |
| **Watch** a fight | curious, or a friend is in it: from a safe distance, cheering or telling them to stop |
| **Look at** a crate, a weapon or a body | curious |
| **Climb** a crate | happy and curious: up, look around, jump off |
| **Investigate** a noise | curious, not scared |
| **Exercise** | bored and full of beans: press-ups, squats or star jumps, counting them out loud |
| **Rest** | in pain: sits down - up on the edge of a crate, legs over the side, if one is handy |
| **Sit on a crate** | calm, bored, and not one for wandering: climbs up and sits on the edge for a while (two can share, one on each side) |
| **Celebrate** | just won |
| **Panic** | terrified and has no idea why |
| **Wander**, **stand around** | nothing better to do: arms crossed, hands on hips, tapping a foot, yawning, kicking the dirt, stretching, shadowboxing, cracking their knuckles, a hand to the chin, bouncing on their toes |
| **Catch their breath** | out of breath, and nobody coming for them: bent over, hands on their knees, until it comes back |
| **Put on a vest** | there is one lying about, and shots going off (or they are the careful sort): over it goes, the straps pulled tight |
| **Fill up** from an ammo box | a pistol running low, and a box in sight |
| **Tell an officer** | they saw a crime, or it was done to them: they go and find one, point, and tell them who did what |
| **Do as they are told** | an officer has told them to stop, and they are frightened, sensible or outgunned enough: the weapon dropped, hands up, down on their knees |
| **Run from the police**, or fight them | told to stop, and bold enough to run, or angry and reckless enough to fight |
| **Sit tight** | in handcuffs |

An officer has a few more of their own:

| Behaviour | When |
| --------- | ---- |
| **Deal with** someone | they saw them commit a crime, heard their shots, or were told about it: closes in, "Police! Stop!" - and a moment to do as they are told - then the taser for anyone who runs or fights, hands-on once it is empty, and the M1911 only for someone about to kill somebody, never through anybody else. Whoever is down or has given up is knelt over and cuffed, and it is called in on the radio |
| **Walk the beat** | nothing going on: along a bit, a look round, a word into the radio |
| **Let them go** | somebody they cuffed for something small has sat there long enough: a warning, and the cuffs off (never for a shooting or a killing) |

**React.** A punch they see coming may get a block or a step back. A crate, a
set of knuckles or a knife flying at them may get a duck or a jump. A blow
they take gets a flinch from the body straight away and, a beat later (longer
for the clumsy), a decision about it. On the floor they may stay down and beg
if someone dangerous is standing over them; trapped under a crate they shout
for help, and friends come.

They also talk - out loud, in speech bubbles, with a babbling voice pitched to
each of them - from 1,120 lines for 204 situations in `src/game/lines.js`,
from small talk to "My leg! It's bent the wrong way!", "Don't shoot!", "Did
you hear what Axl did?", "My hand... it's gone. It's on the floor.", "Can
we... take five?" and "I want a lawyer." (officers have a way of talking all
their own: "Police! Stop right there!", "Taser! Taser!", "Dispatch, one in
custody.") - and
think in pictures, in thought bubbles: a fist, a crate, the knuckles, the
knife, a tear, a question mark.

### Fighting

There are no hit boxes. A punch, a kick or a blade lands only if the **fist,
foot or knife actually touches a bone** of someone else while the strike is
live, and what it does depends on how fast it was moving, which bone it met,
the attacker's strength and anger, how hurt the striking limb is, and what
was in that hand. Fighters close to the distance their own reach allows,
circle in and out, throw jabs, crosses, uppercuts (from close) and kicks -
or, with a knife, thrust it into the body and slash, or with a machete chop
down and hack across - block what they see coming (an arm up against a
machete is how hands come off), counter out of a flinch, stand over whoever
they put down, and - only the truly furious - keep going.

A pistol is fought with from a distance. It comes up, settles on the target
(the longer it is held there, the steadier), and fires; where the bullet goes
depends on how good a shot they are, how frightened, angry, hurt or dizzy,
how fast they are moving, and how soon after the last shot it is. A bullet
is a ray: it goes through whatever it meets, losing energy, until it stops -
through people, through a crate (holes both sides), skipping off the floor at
a shallow angle. The world is a little deeper than the picture, so a bullet
crossing someone it was not aimed at goes past them as often as not.

### Crates, brass knuckles, the knife, the machete and the pistol

`src/physics/rigid.js` is a 2D rigid body engine: Box2D-lite (Erin Catto's
teaching version of Box2D) carried over to JavaScript, with restitution, a
soft grab joint for the hand, and kinematic bodies. Crates stack, topple,
slide and tumble; knuckles and knives bounce and clatter. Every stickman on
their feet has a stand-in among them - moved by the game, but as heavy as a
person to anything it meets - so a crate can land on someone or bounce off a
head; a ragdoll touches them itself. What hurts is how fast the thing was
going at them, not how fast they walked into it.

The **combat knife** is a 0.35 kg blade. Held, it points straight out of the
fist. Thrown point first and fast enough - by a stickman or by you -
it sticks: into a person, where it stays in the wound until someone pulls it
out (they do it themselves, a friend does it for them, or you drag it out),
into a crate, where it rides along with it, or into the floor. Thrown any
other way, it bounces off and clatters.

The **machete** is a 0.7 kg blade a little under three quarters of a metre
long, held by its black handle, with the edge underneath. It chops (overhead,
heavy) and hacks (a quicker sweep across), and sticks in like the knife when
thrown point first.

The **Glock-19** is a pistol: 15 rounds in the magazine and two spare
magazines. Each shot kicks the gun up, flashes at the muzzle, throws the
slide back and an empty case out of the side, which bounces and rolls on the
floor and stays there. Empty, the slide locks back, and a reload takes about
a second. Lying loose, a tap fires it, and it kicks itself across the floor.

The **M1911** is the Glock's heavier cousin: seven .45 rounds and two spare
magazines. Each round hits harder and keeps more of itself going through a
body or a crate; it kicks harder, so it takes longer to come back on target,
and it is louder.

### Stamina, knockback and stumbling

Everyone has **stamina** (`stickman.js`), from fresh to spent. Running uses
it, a punch, a kick or a chop uses some, a jump, a block, taking a blow and a
stumbling step use a little; it comes back when they stop - fastest lying or
sitting, slower standing, slower still walking, not at all running - and
slower for the hurt, the bleeding and the soft. Out of breath, a run is a
jog and then little more than a walk, blows land softer, the aim will not
keep still, they pant, and they are easier to knock off balance. In a fight
somebody spent steps back out of reach to get some breath; with nobody
coming for them they bend over, hands on their knees, until it is back.

A blow sends whoever it lands on **back the way it was going**: by how hard
it was and what it was - a jab rocks them, a cross or a kick moves them, a
crate or a round into a vest shoves them - and against how much body (a tough
one gives less). A hard enough one, or one on top of others, and they
**stumble** (`stumble.js`). Nothing plays while they stumble: the body is an
inverted pendulum balanced over its feet. As long as the point it is falling
toward is over the feet, pressing down through them brings it to a stop;
once it is past them, the trailing foot swings out to where the fall is
going, and the next, and every step is worked out from the pendulum, each
leg solved for where its foot has to be, the arms windmilling and the trunk
thrown against it. Most people catch themselves in a step or two; pushed too
hard, too tired, dizzy, hurt in the legs or backing into a crate, the steps
cannot keep up, and over they go - into the ragdoll, moving exactly the way
they were. Hit again while they are still stumbling, they usually go down.

### Adrenaline, air and temperature; fire and ice

Four more numbers keep everybody going (`src/game/vitals.js`), each with a
bar in the inspector:

- **Consciousness** - how awake they are (the knockouts above), and now also
  how much air is in them and how hot or cold they are.
- **Adrenaline** - fear, anger, a blow, a fall, being picked up, being on
  fire: it surges in a second or two and wears off over most of a minute.
  While it is up they feel less of the pain (it catches up with them once it
  wears off), run faster, hit harder, tire slower, take more to knock out
  and come round sooner - and they bleed faster, and their aim shakes.
- **Oxygen** - what their blood is carrying. Held up by the head, they
  cannot breathe: they choke, the oxygen goes, they go blue in the face and
  pass out, and held long enough they die of it; let go in time, they gasp
  and it comes back. Smoke, a punctured lung, lost blood and being out of
  breath keep it down a little. Low, they are dizzy; lower, out cold.
  Machines and the undead (a mod's) do not breathe at all.
- **Temperature** - 37 °C is right, and a living body steers back to it:
  sweating when it is hot, shivering when it is cold - fast from very hot,
  slowly from very cold, and not at all if it is locked.
  - **38** and up, flushed and sweating; **40**, overheating: dizzy, slow,
    out of breath sooner; **43** or so, heatstroke: out cold, and kept up it
    kills them - at 44 they come round as it comes down, at 50 it is the
    end of them.
  - **35** and down, shivering (they stand there hugging themselves) and
    slower; **32**, hypothermia: slow and clumsy, and a gun will not keep
    still; **28**, out cold; below **24** the cold starts to kill them,
    and the fingers and toes go (frostbite).
  - The dead, the frozen and the undead do nothing about it: they go,
    slowly, to the temperature of the air.

**Fire.** At 60 °C a body catches fire, all over, and fire spreads to anyone
it touches, part to part. It burns each part that has caught - no blood,
all pain, the skin scorching and the face blackening - while smoke and
embers go up and the heat climbs. The first thing anybody on fire does is
panic: a scream and a run in no particular direction, which only fans it.
Some know better and stop, drop and roll - over and over on the floor, which
puts it out in a few seconds; the rest remember when somebody shouts it at
them. The people around them run in to beat the flames out (kneeling over
them once they are down - and now and then catching it themselves) or keep
well clear. Left to burn, a body goes through what there is to burn in under
twenty seconds and is usually dead long before, charred black. It also goes
out swung through the air fast enough, or cooled (anything under 36 °C typed
in puts it out with a hiss). Afterwards they smoulder for a while, with
burns all over. A drone's laser and its missiles can set people alight too;
Minecraft's wither skeletons and the Wither do not burn.

**Ice.** At 0 °C a body freezes solid where it is: frost on them first as
they cool, then a shell of clear blue ice, icicles hanging off them, and the
body locked stiff in the pose it froze in - the ragdoll's joints all held
where they were, so a frozen statue stands there, or topples over all of a
piece, and can be picked up, carried and thrown. Breathing, bleeding and
thinking all stop, and within a quarter of a minute or so the cold kills
them. Warmed past 0 (type a temperature in; a fire close by helps, and so do
friends huddled round them) the ice melts and runs off them, and if they are
still alive they come round, shivering, with frostbite. A hard blow to a
frozen body cracks the ice and can snap a limb clean off, like an icicle (it
comes away still in its ice, and the stump bleeds once it thaws); a very
hard one, a bullet in the body, or a drop from high up shatters the whole
thing.

### Holsters and pockets

Besides what is in their hand, a stickman carries a pistol or a taser in a
**holster** on the near hip and something small - a knife, brass knuckles,
a taser - in a **pocket**; an officer has a taser on the far side of the duty
belt too, grip forward. Each is drawn on them where it is. With their hands
full, something small they pick up goes straight in a pocket. With nothing
to be armed for for a while (longer for the aggressive), what is in their
hand goes away, with a hand down to the hip; trouble - somebody coming at
them, somebody they are after, shots - and out comes the best thing they
have on them for it: a gun for someone far off and dangerous, a knife up
close, the taser or the knuckles for a scuffle - nobody pulls a gun over a
shove. Killed, it all falls out of them onto the floor.

### Vests, ammo boxes and the taser

A **light vest** goes on over the head and covers the body - the torso, front
and back, not the arms, the legs or the head. A pistol round that hits it is
usually stopped: it lands like a hammer blow instead - a bruise, the wind
knocked out of them, and a shove back that may send them stumbling - and
leaves a dent in the vest. Every round it stops wears it down, and a worn-out
one lets them through. Against a blade it takes the worst of it out, a stab
less than a slash. An officer's is a navy police vest with POLICE across the
chest.

An **ammo box** holds pistol rounds for either pistol - the boxes are mixed.
Anyone with a pistol running low, in the hand or the holster, goes over,
crouches by it and takes what their spare magazines and the one in the gun
will hold, until the box is empty.

The **taser** (`taser.js`) is aimed and fired like a pistol, but what comes
out is a pair of barbed probes on thin wires, spreading as they go and
dropping a little. If both land in somebody - and not in their vest - five
seconds of current go down the wires: every muscle locks at once, and they go
over stiff as a board, shaking and yelling, the current crackling between
the probes. Then they are dazed a little while longer, which is when an
officer gets the cuffs on. One cartridge in it, two spares; while the probes
are still in someone and the wires whole, another pull of the trigger gives
them another five seconds. Out of cartridges, pressed against somebody it is a
**drive stun**: it hurts like anything and takes the fight out of them, but
it does not put them down. Lying on the floor, a tap fires it.

### The law, and officers

Every blow, shot and death comes past the law (`law.js`), and most of what
people do to each other is a crime: **assault**, **assault with a weapon**,
**tasing someone**, **threatening someone with a gun** (holding one on
somebody who was doing nothing, more than a moment), **shots fired**,
**shooting someone** and **murder**. Not hitting back at someone who went
for you first - squaring up counts as going for somebody - and not stepping
in against someone in the middle of hurting somebody else, and nothing an
officer does in the line of duty. Monsters (a mod's) are not people to the
law, either way.

Whoever saw it remembers it. An **officer** who saw it - or heard the shots,
which carry the width of the world - goes after whoever did it; everybody
else tells the first officer they come across, or goes looking for one.
Then (`police.js`) the officer closes in and tells them to stop - and they
decide for themselves what to do about it, by who they are and what is
pointed at them: the frightened and the sensible give up (the weapon dropped,
hands up, down on their knees), the bold run, and the angry and the reckless
fight. Whoever runs or fights gets the taser; if it misses, or the
cartridges run out, it is hands-on. Somebody about to kill somebody - a gun
on them, just fired, a blade going at them - gets the M1911 instead: "Drop
the weapon!", and if they do not, they are shot, never through anybody else.
Whoever is down, tased or has given up is knelt over and **cuffed**,
whatever they had taken off them and put down out of their reach, and the
officer calls it in on the radio. Cuffed, they sit on the floor with their
hands behind their back, complaining; somebody cuffed for something small is
let go with a warning after a while. Everyone else is relieved to see an
officer turn up - except whoever has just done something.

### The hand

Dragging grabs whatever is under your finger. A crate swings from the exact
point you took hold of it. A stickman goes limp in your grip and hangs from
wherever you grabbed them - by the scruff of the neck, a hand, or upside down
by an ankle - kicking and shouting, swinging as you move them; the dead and
the knocked-out just hang. Let go while moving and it is a throw: they tumble
through the air and land hurt. Fling one at a crowd and they bowl into
whoever is in the way: both get hurt, and a hard enough hit sends the one
they hit flying too, into the next.

### Blood

**Where it comes out.** Every wound that is bleeding is somewhere it comes
from - a cut, a bullet hole, a gash, a stump, a knife still in them, a nose
- and each lets out as much as it is bleeding, so blood drips off the wound
that is bleeding and from nowhere else. Lying in it, a pool spreads under
the wounds. What bleeds inside stays inside, but for a little out of any
hole there is in the body, and a punctured lung brings it up out of the
mouth.

**Streams.** A stump, an opened artery or a cut throat does not drip: it
spurts, in a stream that never quite stops while the heart beats and surges
with every beat - harder the faster the heart goes (fear, blood lost) and
weaker as the blood runs out. Once the heart stops it only pours. A limb
pours out of its cut end as it comes off, a bad blow from a blade or a
bullet going right through lets out a squirt, and so does the Shallow
tearing somebody in half. A stream is drawn as one unbroken arc of blood
until it breaks up or lands.

**Where it hits.** A body slammed into the floor, a wall or a crate bleeds
from where it hit: a head driven into the floor splashes from the head, out
across the floor round it, and leaves a wound on the head; a hard landing
on the feet bleeds only if a bone came through. (Ragdoll or not, it is
worked out from the part that met the surface.)

**Where it lands.** Blood is simulated drop by drop until it lands, and it
stays on whatever it lands on: the floor (a splat that spreads), the walls
(a splash, running down), crates and blocks, knuckles, knives, machetes,
pistols, tasers, vests, ammo boxes, severed limbs and a mod's things - each
kept in the thing's own frame, so it goes where the thing goes and turns
with it - and people, as blood on them (it does not make them bleed).

**Bled dry**, a body gives no more: no drips, no streams, no pool, and no
spray when it is cut, shot or a limb comes off. Turn blood off in the
settings and none of it is drawn.

### Sound

Punches, the ring of brass knuckles, a blade going in and being drawn across,
a machete chop, gunshots (with the camera shaking, and the .45 deeper and
longer than the 9 mm), the click of an empty gun, the magazine out and in and
the slide racked, brass cases tinkling on the floor, ricochets, a bullet going
in, a round smacking into a vest, the pop of a taser cartridge and the dry
crackle of the current, a holster's leather, the velcro of a vest, the
ratchet of handcuffs, a radio's squelch, feet scuffing as somebody stumbles,
rounds rattling out of a box, knuckles cracking, a limb coming off, a joint
popping, steel into wood, crates, bodies hitting the floor, bones breaking,
claps, screams and every stickman's babbling voice are synthesised with
WebAudio on the spot. There are no sound files.

---

## Layout

```
stickfights/
  index.html          every screen
  style.css           mobile first, safe-area aware
  src/
    main.js           boot, the frame loop, the scene behind the title
    core/             helpers, gestures (tap, drag, pinch), sound
    physics/
      rigid.js        2D boxes: separating axes, clipping, sequential impulses
      ragdoll.js      points, sticks, joint limits and muscles: Verlet ragdolls
    game/
      skeleton.js     joints, bones, poses, forward kinematics, the lowest point down
      clips.js        every animation, key by key
      animator.js     layers, crossfades, events, flipbook
      stickman.js     the body: controller, states, strikes, hits, knockback, stamina,
                      holsters and pockets, vests, cuffs, ragdolls, death
      stumble.js      stumbling: the pendulum, the steps, catching it or going over
      taser.js        the taser, its probes and wires, and being tased
      law.js          what counts as a crime, and who saw it
      police.js       officers, the people they deal with, and what each of them does
      limp.js         a stickman as a ragdoll: masses, joint ranges, and back again
      health.js       parts, bones, blood, pain, consciousness, paralysis, stumps,
                      dislocations, gunshots, the face, shock
      blood.js        where blood comes out (wounds, streams, the heartbeat), where a
                      body that hit something bleeds from, and stains on anything
      vitals.js       adrenaline, oxygen and temperature; fire, frost and ice,
                      and how each of them is drawn
      brain.js        sense, feel, think, react, remember, gossip
      behaviours.js   what a brain can decide to do
      emotions.js     the five emotions
      lines.js        everything they can say
      people.js       names, looks and personalities
      props.js        crate, brass knuckles, knife, machete, the pistols, ammo boxes,
                      vests, severed limbs
      hand.js         dragging and throwing
      fx.js           blood (drops, streams, splats, the walls, landing on things),
                      dust, hit bursts, muzzle flashes, tracers, splinters, casings,
                      smoke, steam, embers, ice and meltwater
      draw.js         drawing a stickman, wounds and stumps, a crate, every weapon
      render.js       the world, bubbles, symbols
      camera.js       pan, zoom, follow
      sandbox.js      the world, the fixed step, ragdolls and knives in it, the event bus
    ui/ui.js          HUD, spawn menu, tools, inspector, settings
    ui/mods-screen.js the MODS screen
    mods/
      registry.js     what a mod is; installing, removing, the storage each needs
      sizes.js        written by tools/mod-sizes.mjs: each mod's size
      index.js        every mod there is
      murder-drones/  Uzi, N and V: characters, species, ai, looks, lines, the
                      railgun, beams, missiles, acid, animations and sounds
      minecraft/      Steve, the blocks, crafting, the totem, the Wither and its
                      skeletons: pixel art, skulls, arrows, explosions,
                      withering, lines, animations and sounds
      shallow/        Shallow: the disguise, the thing, its mind, its looks, the
                      skins, halves, skeletons and insides it leaves, what
                      everybody makes of it, lines, animations and sounds
```

## Verifying it

```
npm install -D playwright esbuild && npx playwright install chromium
npm run verify:stickfights                 # the source
npm run build:stickfights && npm run verify:stickfights:file   # the single file
npm run poses:stickfights                  # every clip as contact sheets in .shots/
```

`tools/verify-stickfights.mjs` drives the real game on a phone-sized touch
screen and checks:

- stickmen are already moving about behind the title, and PLAY opens an empty
  sandbox with the spawn menu
- the spawn menu has exactly thirteen things in it: a Stickman, an Officer,
  Brass Knuckles, a Combat Knife, a Machete, a Glock-19, an M1911, a Taser, a
  Crate, a Light Vest and three Ammo Boxes
- the background is grey and the ground is black (read off the canvas)
- tapping the world places a stickman, a crate and a set of knuckles where it
  was tapped, and the crate falls and settles
- walking plays the walk cycle, with the feet trading places
- in flipbook mode every pose on screen is one of the hand-keyed frames
  exactly, and in smooth mode they are eased into each other
- every stickman has eight traits and a stream of thoughts, and two friendly
  ones notice each other and talk
- a crate dropped on someone hurts the parts it hits, and they feel it (pain,
  fear, surprise) and think about it
- someone with a grudge goes for them, blows land, every blow lands where the
  fist or foot actually was, the other one fights back, someone goes down,
  and a friend watching reacts
- an angry stickman grabs brass knuckles on the way to a fight, and punches
  with them do about twice the damage
- crates stack and stay stacked, people bump into them, and a stickman
  walking at one jumps up onto it
- a stickman looking at a crate sees it, and a calm, bored one climbs onto it
  and sits on its edge
- a stickman thrown into another knocks into them, and both get hurt
- a broken arm cannot punch, a broken leg puts them on the floor crawling
- enough damage kills; the dead lie on the floor with crosses for eyes; a
  friend who saw it is saddened and goes to mourn
- dragging a stickman picks them up, letting go while moving throws them, and
  they come back down
- tapping a stickman opens the inspector; the erase tool removes things
- knocked out, they go limp and come to rest; no ragdoll joint ever bends the
  wrong way; picked up by an ankle they hang upside down from it; a crate
  dropped on a body lands on it and pins it; knocked off their feet they fall
  limp and get up again once they come to rest
- a broken bone has its name, stops the limb working and bends where it
  broke; a broken back paralyses the legs and they drag themselves along
- a stickman picks up the combat knife, and a stab bleeds far harder than a
  punch; a knife thrown point first sticks into a crate, and into a person,
  who pulls it out
- a stickman picks up the machete; its chops leave gashes that bleed, and a
  hard enough one takes a limb off - it falls to the floor, and the stump
  bleeds; a friend ties the stump off with a tourniquet; a dislocated joint
  stops the limb working, and a friend pops it back in
- punches to the face leave black eyes, a split lip, a bloody nose
- a stickman picks up the Glock-19 and aims it; each shot uses a round and
  drops a casing; bullets go through a crate and into the person behind it;
  empty, it reloads from the spares; tapping a loose one on the floor fires it
- with a gun pointed at them they put their hands up, and a gunshot sends
  people running or diving for cover
- they remember who hurt them, and when that person comes back it comes back
  to them; in a chat they pass on what they know, and it changes what the
  listener thinks of whoever it was about
- the inspector groups everyone under Friends, Knows, Dislikes and Enemies
  (in that order); picking Enemy in someone's row moves them there and makes
  it so; dragging a feeling's bar sets it; the personality sliders change the
  traits; the Fight button sends them after that person, and they can be
  called off
- the padlock on a feeling locks it - six seconds of being calmed down and
  cheered up do not move it, while the others move - and tapped again it is
  free to change
- there are over a hundred and forty clips and over a thousand lines, and
  good friends part with a hug or a high five
- an Officer spawns in uniform with a police vest on, an M1911 in the
  holster and a taser on the duty belt
- somebody who attacks somebody else gets "Police! Stop!" from an officer,
  then the taser or the cuffs: they end up cuffed, sat on the floor with
  their hands together behind them, the crime answered for and the arrest
  called in on the radio
- an officer who only heard shots from across the world knows who fired, and
  heads that way
- a taser's probes put five seconds of current through someone - rigid as a
  board, over they go - and tasing somebody who was doing nothing is a crime;
  out of cartridges it is a drive stun, which hurts but does not lock them up
- a light vest stops pistol rounds to the body: no hole, but a bruise and a
  shove back, and the vest worn down; somebody who sees one lying about with
  shots going off goes and puts it on
- a pistol nobody needs goes back in its holster, and comes out again when
  someone comes at them with a knife; with the hands full, brass knuckles go
  in a pocket
- the M1911 holds seven heavier rounds; the ammo boxes hold 30, 80 and 200,
  and somebody with a pistol running low goes and fills up from one
- running uses up stamina and slows them down, standing still gets it back,
  and spent they stop to catch their breath, hands on their knees
- a blow knocks them back, and a hard one sends them stumbling - some catch
  it, some go down
- the inspector shows an officer as one, everyone's stamina, the vest and
  what is in the holster, the pocket and on the duty belt; somebody in
  handcuffs says so, and Uncuff lets them go; Put away holsters a pistol,
  and Get it out draws it again
- the inspector has a Conscious, an Adrenaline, an Oxygen and a Temperature
  meter; a temperature typed in (in C, F or K) becomes theirs, and anything
  else is turned away; the padlock holds it, and let go, the body sweats it
  back toward 37
- a fright sends the adrenaline up, numbing the pain, and it wears off
- held up by the head they choke and pass out; let go in time, they gasp
  and come round
- at 44 °C they pass out and come round as it comes down, at 52 the
  heatstroke kills them; at 33 they are cold and slower, below 28 out cold
- at 100 °C they burst into flames and scream, drawn burning, and the
  inspector says so; the people around shout, run in or keep clear; rolling
  on the floor puts it out and leaves them burned but alive; cooled, it goes
  out; it spreads to anybody it touches; left alone, they burn to death,
  charred
- at -10 °C they freeze solid, still standing, drawn in ice; warmed in time
  they thaw and come round with frostbite, left alone the cold kills them; a
  hard kick snaps a frozen arm off and a drop from high up shatters the body;
  Heal thaws them out
- a head driven into the floor - ragdoll or not - bleeds from the head, out
  across the floor round it, and leaves a wound there, not blood from the
  middle of them; a cut on the thigh drips off the thigh and nowhere else
- a stump spurts a stream straight out of the end of it, never quite
  stopping and surging with every heartbeat, drawn as one unbroken arc, and
  the arm that came off pours out of its cut end for a moment
- bleeding out, they stop bleeding once their blood is gone: no drips, no
  streams, Blood 0% and "No blood left" in the inspector, and nothing comes
  out of them afterwards, cut or with a leg off - nor out of the leg
- blood lands and stays on a crate, knuckles, a knife, a machete, a pistol,
  a taser, a vest, an ammo box, a severed arm, both walls (running down
  them) and people (without making them bleed), and moves with the thing it
  is on; on the Minecraft mod's table and skull, and on the skin, legs,
  skeleton and organs the Shallow leaves lying about
- no mod is in the game until it is installed; the MODS screen lists
  Murder Drones with what it adds and the storage it needs, which is what
  its files really take up; INSTALL fills a bar and then puts Uzi, N and V in
  the spawn menu, and the device remembers it
- Uzi spawns from her card holding her railgun; N and V come down out of the
  sky and crash-land with their wings out, cracking the floor; every one of
  N's hands - chainsaw, gun, sword, claws, laser, missiles - does damage;
  V's tail puts nanite acid in someone, and it eats at them; the railgun
  charges, then goes through two people in a line
- Uzi, N and V together for forty seconds: Uzi never goes for V or N
- tapping N shows a Disassembly Drone with a button for every ability, and
  tapping one locks his hands to it; REMOVE asks again, then takes the mod
  and everything of it out of the menu, the world and the device
- the MODS screen lists Minecraft, with what it adds and the storage it
  needs; installed, it puts Steve, the three blocks and the Wither Totem in
  the spawn menu, the totem locked (and saying how to craft one) until one
  is crafted
- Steve spawns with his diamond sword and three golden apples; he swaps to
  his bow and his arrows hit; an apple mends him and leaves him regenerating
- tapping a Crafting Table with 4 Soul Sand and 3 Wither Skulls by it opens
  its grid; CRAFT uses them up and the totem card shows one to place
- the totem goes down where it is tapped with ACTIVATE over it; activated it
  floats up, glows white and shakes, then explodes into the Wither, which
  has a boss bar and 600 health
- in phase 1 it stays up out of reach and spits black and blue skulls that
  wither whoever they catch; half way its armour comes up and wither
  skeletons with stone swords appear; then it comes down low, and arrows and
  bullets bounce off it while a sword does not, and the boss bar says so
- beaten, it roars, glows white, explodes and leaves a Nether Star, and its
  boss bar goes
- a wither skeleton's cut withers whoever it lands on, and its fear is
  locked at nothing
- removing Minecraft takes all of it out of the world and the menu
- the MODS screen lists Shallow, with the storage it needs; installed, it is
  in the spawn menu, and it spawns looking like anybody, passing for a person
- made angry, it cracks open and tears its way out of the skin, taller -
  black, with white pupils, a grin of white teeth and five claws on each
  hand - and the skin lies where it stood; the inspector goes with it
- it takes whoever made it angry by the neck and tears them in half, or eats
  them: the head, the body, then the legs
- then it empties out the nearest person - the skeleton and the organs out -
  climbs inside and gets up as them, with the same name, height, hair and
  voice; whoever saw it knows that is not them any more, and is afraid
- removing Shallow takes it, in whatever skin it is wearing, and everything
  it left out of the world and the menu
- ten stickmen, six crates, knuckles, knives, machetes and a pistol for 45
  seconds: nothing turns into NaN, and they get up to many different things
- the console stays clean, and the single file fetches nothing

Every check starts from the same random numbers and the same clock, so what
the people in it decide comes out the same every run (only the few checks
that let the world run in real time can differ). Nothing outside the
simulation draws on those numbers: the camera's shake and the little
variations in every sound have random numbers of their own, so what is
heard - which depends on the audio clock - never changes what happens.

Set `CHROMIUM_PATH` to use a Chromium you already have.
