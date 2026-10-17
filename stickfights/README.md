# STICKFIGHTS

A 2D sandbox of stickmen with minds of their own, on a grey background and a
black floor. You spawn **stickmen**, **brass knuckles**, **combat knives**,
**machetes**, **Glock-19 pistols** and **crates**, and the stickmen get on with
it: they look around, talk, make friends and enemies, shake hands and hug,
pick things up, climb on things, fight, run, hide, help each other up, get
hurt, break bones, lose limbs, and die - and the ones still standing feel it,
and remember it.

And you can get inside their heads: drag their feelings up and down, change
their personality, change who they count as a friend or an enemy, and send
them off to fight someone.

**Mods** add things that are not part of the game itself: the first,
**Murder Drones**, brings Uzi, N and V (see [Mods](#mods)).

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

The spawn menu (☰ **SPAWN**, top left) has six things in it, in three
sections:

| Section | Thing | What it is |
| ------- | ----- | ---------- |
| People | **Stickman** | A normal human. Thinks, feels, remembers, fights back. |
| Weapons | **Brass Knuckles** | Worn on the hand. Punches with them land about twice as hard, and cut. |
| Weapons | **Combat Knife** | Held in the hand. Stabs and slashes; deep cuts bleed fast. Thrown point first, it sticks in. |
| Weapons | **Machete** | Chops and hacks. Leaves gaping wounds, and a hard enough blow takes off a hand, an arm, a foot or a leg. |
| Weapons | **Glock-19** | A pistol: 15 rounds in the magazine and two spare. Bullets go through people and crates, and ricochet off the floor. |
| Objects | **Crate** | 22 kg of wood. Stack it, climb it, throw it - or let a stickman throw it. |

Pick one and the menu closes with the **spawn tool** armed: every tap on the
world places another. A stickman appears on whatever is under the tap;
anything else appears exactly where you tapped and falls.

The three tools along the bottom:

| Tool | What it does |
| ---- | ------------ |
| ✋ **HAND** | Drag anything to move it. Let go while moving to throw it. Tap a stickman to open their mind. Drag empty space to pan. Drag a blade stuck in someone to pull it out. Tap a pistol lying on the floor to fire it (empty, a tap puts a fresh magazine in). |
| **SPAWN** (shows what is picked) | Tap the world to place it. |
| ✖ **ERASE** | Tap something to remove it. |

Pinch (or the mouse wheel) zooms, two fingers pan. Along the top right: sound,
slow motion, pause, settings, and clear everything (tap twice).

**Tap a stickman** to open the inspector: their name and mood, what they are
doing, their personality, five emotions, pain and blood, an X-ray of their
body coloured by injury - every broken bone snapped and named, whatever has
been cut off missing, joints out of their sockets ringed in purple, bullets
still in them in gold - the options they are weighing up right now and how
much each appeals, what they remember, and their recent thoughts. **Follow**
keeps the camera on them, **Heal** mends them (not the dead), **Remove** takes
them away.

The inspector is also where you change their mind:

- **Feelings** - each of the five emotions is a bar: drag it to make them as
  happy, sad, angry, frightened or surprised as you like. Feelings settle back
  over time, as feelings do, but what they do in the meantime is up to how
  they feel.
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
its people and weapons, whatever was cut off them, and whatever of it is
still going on - a missile in the air, acid in somebody.

### Murder Drones

Three drones from a cold, dark planet, each with a personality, a look and
skills of their own.

| | Who they are | How they arrive | What they can do |
| - | ------------ | --------------- | ---------------- |
| **Uzi** | A worker drone: small, brave, sarcastic, quick to anger and not one for company. Murder drones are what she most wants to shoot. Purple visor eyes, a beanie, purple hair. | Walks in with the **railgun** she built already in her hands. | The railgun charges for nearly a second with a rising whine, then goes through everything in a line out to the wall - people, crates, drones - knocking people off their feet and often taking a limb with it. Then it needs a few seconds to charge again. It kicks, and she is light: sometimes it staggers her. Tapped where it lies, it charges and goes off by itself. |
| **N** | A disassembly drone who would really rather be friends: kind, keen, nervous, apologetic - and very dangerous when he has to be. Yellow eyes, a cap, a white collar. | Comes down out of the sky and **crash-lands** on one knee with his **wings out**, cracking the floor; whoever is right there goes over. | Hands that turn into a **chainsaw** (pushed in and held there, biting again and again), a **gun** (quick bursts), a **sword** (long reach, deep cuts, takes limbs off), **claws** (three cuts at once), a **laser** (a beam that burns whatever it stays on) or **missiles** (salvos of three that home in and explode). A **tail** with a needle full of **nanite acid**, that comes over the shoulder at whoever is close. **Wings**, to fly at someone. |
| **V** | Another disassembly drone, who enjoys the work far too much: fearless, vicious and playful about it. She hunts anyone who is not one of hers, worker drones above all. Blonde hair over one eye, an apron. | The same: out of the sky, a crash landing, wings out. | Every one of N's abilities. She likes the chainsaw, and flying at people. |

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
- **Who they know.** A worker drone fears and hates murder drones on sight;
  N likes everyone, and he and V go back a long way; people who have never
  seen a drone are frightened of the wings, the tail and the glowing eyes,
  and say so when a hand turns into a chainsaw.
- **What they say.** Each of the three has their own things to say - most of
  what they say is theirs - and everyone else has new things to say about
  them: being sawn, clawed, stung, burned or blown up, and watching it.
- **In the inspector** a chip says what they are (*Worker Drone* or
  *Disassembly Drone*), and what their hands are is listed under BODY. A
  disassembly drone has an **ABILITIES** section: **Hands** - *Auto* (they
  choose), *Hands*, *Chainsaw*, *Gun*, *Sword*, *Claws*, *Laser*, *Missiles*,
  which locks their hands to that until it is changed back - and **Do** -
  *Tail strike* and *Fly*.

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
  say, animations and behaviours

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
- **Blood** - cuts bleed, bleeding clots, and below about 38% the heart has
  nothing left to pump. Brass knuckles cut; a hard enough blow to the face
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
  for eyes, and keep bleeding into a pool for a while. Bleeding out is still
  somebody's doing: whoever opened the wound gets the blame.

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
| **Wander**, **stand around** | nothing better to do: arms crossed, hands on hips, tapping a foot, yawning, kicking the dirt, stretching, shadowboxing |

**React.** A punch they see coming may get a block or a step back. A crate, a
set of knuckles or a knife flying at them may get a duck or a jump. A blow
they take gets a flinch from the body straight away and, a beat later (longer
for the clumsy), a decision about it. On the floor they may stay down and beg
if someone dangerous is standing over them; trapped under a crate they shout
for help, and friends come.

They also talk - out loud, in speech bubbles, with a babbling voice pitched to
each of them - from 785 lines for 148 situations in `src/game/lines.js`, from
small talk to "My leg! It's bent the wrong way!", "Don't shoot!", "Did you
hear what Axl did?" and "My hand... it's gone. It's on the floor." - and
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

Blood is simulated drop by drop until it lands, and it stays where it lands:
on the floor as a splat (pools under the dead), on a crate as a stain that
turns with the crate, on someone's body or face, on the knuckles or the blade
that did it.

### Sound

Punches, the ring of brass knuckles, a blade going in and being drawn across,
a machete chop, gunshots (with the camera shaking), the click of an empty gun,
the magazine out and in and the slide racked, brass cases tinkling on the
floor, ricochets, a bullet going in, a limb coming off, a joint popping, steel
into wood, crates, bodies hitting the floor, bones breaking, claps, screams
and every stickman's babbling voice are synthesised with WebAudio on the
spot. There are no sound files.

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
      stickman.js     the body: controller, states, strikes, hits, ragdolls, death
      limp.js         a stickman as a ragdoll: masses, joint ranges, and back again
      health.js       parts, bones, blood, pain, consciousness, paralysis, stumps,
                      dislocations, gunshots, the face, shock
      brain.js        sense, feel, think, react, remember, gossip
      behaviours.js   what a brain can decide to do
      emotions.js     the five emotions
      lines.js        everything they can say
      people.js       names, looks and personalities
      props.js        crate, brass knuckles, knife, machete, pistol, severed limbs
      hand.js         dragging and throwing
      fx.js           blood, dust, hit bursts, muzzle flashes, tracers, splinters, casings
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
      murder-drones/  Uzi, N and V: characters, species, ai, looks, the railgun,
                      beams, missiles, acid, animations and sounds
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
- the spawn menu has exactly six things in it: a Stickman, Brass Knuckles, a
  Combat Knife, a Machete, a Glock-19 and a Crate
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
- there are over a hundred and ten clips and over seven hundred lines, and
  good friends part with a hug or a high five
- no mod is in the game until it is installed; the MODS screen lists
  Murder Drones with what it adds and the storage it needs, which is what
  its files really take up; INSTALL fills a bar and then puts Uzi, N and V in
  the spawn menu, and the device remembers it
- Uzi spawns from her card holding her railgun; N and V come down out of the
  sky and crash-land with their wings out, cracking the floor; every one of
  N's hands - chainsaw, gun, sword, claws, laser, missiles - does damage;
  V's tail puts nanite acid in someone, and it eats at them; the railgun
  charges, then goes through two people in a line
- tapping N shows a Disassembly Drone with a button for every ability, and
  tapping one locks his hands to it; REMOVE asks again, then takes the mod
  and everything of it out of the menu, the world and the device
- ten stickmen, six crates, knuckles, knives, machetes and a pistol for 45
  seconds: nothing turns into NaN, and they get up to many different things
- the console stays clean, and the single file fetches nothing

Set `CHROMIUM_PATH` to use a Chromium you already have.
