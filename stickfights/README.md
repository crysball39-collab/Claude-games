# STICKFIGHTS

A 2D sandbox of stickmen with minds of their own, on a grey background and a
black floor. You spawn **stickmen**, **brass knuckles** and **crates**, and the
stickmen get on with it: they look around, talk, make friends and enemies,
pick things up, climb on things, fight, run, hide, help each other up, get
hurt, and die - and the ones still standing feel it.

The stickmen are not ragdolls. Every move they make is a hand-keyed
animation, played frame by frame.

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

The spawn menu (☰ **SPAWN**, top left) has three things in it, in three
sections, so there is room for more later:

| Section | Thing | What it is |
| ------- | ----- | ---------- |
| People | **Stickman** | A normal human. Thinks, feels, fights back. |
| Weapons | **Brass Knuckles** | Worn on the hand. Punches with them land about twice as hard, and cut. |
| Objects | **Crate** | 22 kg of wood. Stack it, climb it, throw it - or let a stickman throw it. |

Pick one and the menu closes with the **spawn tool** armed: every tap on the
world places another. A stickman appears on whatever is under the tap; a crate
or a set of knuckles appears exactly where you tapped and falls.

The three tools along the bottom:

| Tool | What it does |
| ---- | ------------ |
| ✋ **HAND** | Drag anything to move it. Let go while moving to throw it. Tap a stickman to open their mind. Drag empty space to pan. |
| **SPAWN** (shows what is picked) | Tap the world to place it. |
| ✖ **ERASE** | Tap something to remove it. |

Pinch (or the mouse wheel) zooms, two fingers pan. Along the top right: sound,
slow motion, pause, settings, and clear everything (tap twice).

**Tap a stickman** to open the inspector: their name and mood, what they are
doing, their personality, five emotions, pain and blood, a body diagram
coloured by injury, the options they are weighing up right now and how much
each appeals, their recent thoughts, and how they feel about everyone they
have met. **Follow** keeps the camera on them, **Heal** mends them (not the
dead), **Remove** takes them away.

**Settings** turn names, speech bubbles, thought bubbles and blood on and off,
and switch on **flipbook** animation (below).

Keyboard: `1` `2` `3` pick a stickman, knuckles or a crate to spawn, `H` hand,
`X` erase, `Space` pause, `S` slow motion, `F` follow, `Tab` spawn menu, `+`
`-` zoom, `0` reset the camera, `M` sound, `Delete` removes whoever is
selected, `Esc` closes things.

---

## What is simulated

### Animated, not ragdolled

A stickman is a skeleton of twelve joints - hips, neck, head, the shoulders,
and both elbows, hands, knees and feet - posed by angles. Every pose in the game comes
from **hand-keyed clips** in `src/game/clips.js`: about eighty of them, from
idling and walking to a front kick, falling on your back, getting up off your
front, cowering, sobbing into your hands and dying. Each clip is a list of
frames, and each frame is a pose and how long it is held.

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
```

Clips play in three layers - a base (standing, walking, lying), an upper-body
hold the legs carry on under (fists up, a crate overhead) and one-shots on top
(a punch, a wave, a flinch) - and crossfade into each other, so nothing pops.
Walking and running play at whatever speed keeps the planted foot from
sliding. With **flipbook** on, nothing is in-between at all: each key is held
for its time and then cut to the next.

On top of the clip go a few things a clip cannot know: breathing, trembling
with fear, a head that tilts to look at whoever it is watching, a punch angled
at the head it is aimed at, a limp onto the bad leg, a dizzy wobble, a broken
arm that hangs, and a broken knee that bends the wrong way.

Whatever the pose, its lowest point rests on the floor, so a crouch sinks, a
kneel kneels, and a fall ends lying down without any clip having to say how
high the hips are.

Moving about is a small character controller, not physics: walking, running,
jumping, falling, stepping onto anything shin-high, jumping up onto a crate,
pulling themselves up onto a stack, pushing a crate they lean on, and riding
along on one that is moving.

### Bodies get hurt

Six parts take damage separately: head, torso, both arms, both legs (see
`src/game/health.js`). On top of that:

- **Blood** - cuts bleed, bleeding clots, and below about 40% the heart has
  nothing left to pump. Brass knuckles cut; a hard enough blow to the face
  splits it anyway.
- **Pain** - spikes with every hit and settles back to what the injuries
  still ache. It slows people down, makes them sit down, and frightens them.
- **Consciousness** - a few clean shots to the head knock anyone out, long
  before they would kill, and a head that has already taken a beating cannot
  be fully awake, so the next good hit puts it out again. Lose too much blood
  and you pass out too. Coming round after a knockout is frightening: most
  people want nothing more to do with whoever did it.
- **Broken bones** - a broken arm cannot punch, carry or block; a broken leg
  cannot stand, so they crawl.
- **Dizziness** - stars go round the head, and the head will not keep still.
- **Death** - from the head, from the torso (internal injuries), or from
  bleeding out. The dead lie where they fall, with crosses for eyes, and keep
  bleeding into a pool for a while.

Damage comes from fists and feet, thrown crates and knuckles, crates dropped
on people, falls, being thrown into the floor, a wall or a crate, and other
people being thrown into them. A blow
lands on whichever part it touches, knocks the body back, and drains its
balance: a small hit is a flinch, a bigger one a stagger, and running out of
balance puts them on the floor, on their back if hit from the front.

### Brains

Every stickman has a brain (`src/game/brain.js`), and a personality to run it
on - eight traits, each from 0 to 1: **bravery, aggression, temper, empathy,
sociability, curiosity, toughness, skill**. Most people are middling; a few
are extreme.

**Sense.** About five times a second they look around. They see what is in
front of them, within fourteen metres, and not hidden behind a crate - so
hiding behind one works - and notice things right behind them only when they
are close. They remember who they have seen and where.

**Feel.** Everything that happens - a punch, a scream, a crate going past, a
death, someone vanishing into thin air - reaches every brain, and each decides
whether it saw it or heard it. It then changes five **emotions** (joy,
sadness, anger, fear, surprise) and how they feel about **each person**: how
much they like them, fear them, are angry with them, and know them. A few
examples:

- hit by someone: hurt, surprised, frightened, and angry with whoever did it -
  doubly so if they were friends
- hit by a crate from nowhere: "Who threw that?!" - and a hot head may blame
  whoever is standing nearest
- bowled over by someone flying through the air: "Watch it!" - while the one
  doing the flying says sorry
- watching a friend get hit: angry with the attacker; watching a stranger get
  hit by someone who started it: wary of them
- watching someone die: shocked and afraid; heartbroken and out for revenge
  if it was a friend
- killing someone: guilt if they are kind, pride if they are not
- picked up into the sky: terrified

Feelings settle back over time, each at its own pace (surprise in a second or
two, sadness slowest), and the face shows them all: eyebrows, eyes, mouth,
tears, plus a symbol over the head now and then - an anger mark, a sweat
drop, a heart, a tear.

**Think.** A few times a second they score everything they could do and pick
the best. What they are already doing gets a bonus so they do not dither -
but not against something urgent, like someone coming at them. The options:

| Behaviour | When |
| --------- | ---- |
| **Fight** someone | angry with them, aggressive, and fancying their chances (their health, weapons and friends counted) |
| **Flee** / keep away | afraid of them, or of what they just watched them do |
| **Hide** | fleeing with a crate to get behind |
| **Cower** and beg | terrified, hurt and cornered |
| **Get the brass knuckles** | angry or expecting trouble - first, if they are on the way to the fight |
| **Throw a crate** at someone | angry, with one to hand and the target out of reach |
| **Talk** to someone | sociable and bored; greetings, small talk, compliments, insults |
| **Help** someone | kind, and someone is down, crawling, pinned or out cold - shoves crates off them, kneels by them, helps them up |
| **Mourn** someone | a friend has died: kneels by the body and cries |
| **Stand up to** someone | they are hurting a friend |
| **Watch** a fight | curious, from a safe distance, cheering or telling them to stop |
| **Look at** a crate or a body | curious |
| **Climb** a crate | happy and curious: up, look around, jump off |
| **Investigate** a noise | curious, not scared |
| **Rest** | in pain: sits down - up on the edge of a crate, legs over the side, if one is handy |
| **Sit on a crate** | calm, bored, and not one for wandering: climbs up and sits on the edge for a while (two can share, one on each side) |
| **Celebrate** | just won |
| **Panic** | terrified and has no idea why |
| **Wander**, **stand around** | nothing better to do |

**React.** A punch they see coming may get a block or a step back. A crate or
a set of knuckles flying at them may get a duck or a jump. A blow they take
gets a flinch from the body straight away and, a beat later (longer for the
clumsy), a decision about it. On the floor they may stay down and beg if
someone dangerous is standing over them; trapped under a crate they shout for
help, and friends come.

They also talk - out loud, in speech bubbles, with a babbling voice pitched to
each of them - and think in pictures, in thought bubbles: a fist, a crate,
the knuckles, a tear, a question mark.

### Fighting

There are no hit boxes. A punch or a kick lands only if the **fist or foot
actually touches a bone** of someone else while the strike is live, and what
it does depends on how fast it was moving, which part it met, the
attacker's strength and anger, how hurt the striking limb is, and whether
brass knuckles were on that hand. Fighters close to the distance their own
reach allows, circle in and out, throw jabs, crosses, uppercuts (from close)
and kicks, block what they see coming, counter out of a flinch, stand over
whoever they put down, and - only the truly furious - keep going.

### Crates and brass knuckles

`src/physics/rigid.js` is a 2D rigid body engine: Box2D-lite (Erin Catto's
teaching version of Box2D) carried over to JavaScript, with restitution, a
soft grab joint for the hand, and kinematic bodies. Crates stack, topple,
slide and tumble; knuckles bounce and clatter. Every stickman has a stand-in
among them - moved by the game, but as heavy as a person to anything it
meets - so a crate can land on someone, rest on a body (pinning them) or
bounce off a head. What hurts is how fast the crate was going at them, not
how fast they walked into it.

### The hand

Dragging grabs whatever is under your finger. A crate swings from the exact
point you took hold of it. A stickman hangs from wherever you grabbed them -
by the scruff of the neck, or upside down by an ankle - kicking and shouting,
and swings like a pendulum as you move them; the dead and the knocked-out
just hang. Let go while moving and it is a throw: stickmen tumble through the
air and land hurt. Fling one at a crowd and they bowl into whoever is in the
way: both get hurt, and a hard enough hit sends the one they hit flying too,
into the next.

### Blood

Blood is simulated drop by drop until it lands, and it stays where it lands:
on the floor as a splat (pools under the dead), on a crate as a stain that
turns with the crate, on someone's body or face, on the knuckles that did it.

### Sound

Punches, the ring of brass knuckles, wood, bodies hitting the floor, bones
breaking, screams and every stickman's babbling voice are synthesised with
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
    game/
      skeleton.js     bones, poses, forward kinematics, the lowest point down
      clips.js        every animation, key by key
      animator.js     layers, crossfades, events, flipbook
      stickman.js     the body: controller, states, strikes, hits, death
      health.js       parts, blood, pain, consciousness, breaks
      brain.js        sense, feel, think, react
      behaviours.js   what a brain can decide to do
      emotions.js     the five emotions
      lines.js        everything they can say
      people.js       names, looks and personalities
      props.js        crate and brass knuckles
      hand.js         dragging and throwing
      fx.js           blood, dust, hit bursts
      draw.js         drawing a stickman, a crate, knuckles
      render.js       the world, bubbles, symbols
      camera.js       pan, zoom, follow
      sandbox.js      the world, the fixed step, the event bus
    ui/ui.js          HUD, spawn menu, tools, inspector, settings
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
- the spawn menu has exactly three things in it: a Stickman, Brass Knuckles
  and a Crate
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
- ten stickmen, six crates and three knuckles for 45 seconds: nothing turns
  into NaN, and they get up to many different things
- the console stays clean, and the single file fetches nothing

Set `CHROMIUM_PATH` to use a Chromium you already have.
