# GOREBOX

A 3D, first person, mobile-first physics sandbox that runs in a browser. Landscape
orientation, touch controls, no install, no build step, no assets on disk — every
texture in the game is drawn procedurally onto a canvas at load time.

## Getting it onto a phone

**`dist/gorebox.html` is the whole game in one file.** Download it, open it, play —
no server, no install, no network. Markup, styles, every module and three.js itself
are all inlined, so nothing is ever fetched.

| Phone | What to do |
| ----- | ---------- |
| **Android** | Download `dist/gorebox.html`, then open **Files → Downloads** and tap it. It opens in Chrome and runs. |
| **iPhone / iPad** | Download it, then **Files → Downloads → tap `gorebox.html`**. Safari opens it and runs it. |

Turn the phone **landscape** — the game asks you to if you are holding it upright.
For a full-screen game with no browser bars, use **Add to Home Screen** from the
share menu and launch it from the icon.

### Running the source instead

```
./serve.sh            # then open http://localhost:8080 on a phone or a desktop
```

The unbundled source needs to be served over http, because ES modules do not load
from `file://`. Any static server works; `serve.sh` just wraps `python3 -m
http.server`. To rebuild the single file after changing anything:

```
npm install -D esbuild
npm run build          # -> dist/gorebox.html
```

---

## Playing it

**Main menu → MAPS → pick a map → PLAY.** There is one map for now, the *Test
Baseplate*: a flat grass plate, 80 × 80 metres, with nothing on it until you put
something there.

You spawn holding two things:

| Slot | What it is | What appears on the HUD |
| ---- | ---------- | ----------------------- |
| 1 | **Fists** | `PUNCH` — alternates a left jab and a right jab |
| 2 | **RCV2** (Reality Crusher Version 2) | `SHOOT`, `+` (spawn) and a delete button |
| 3 | **Machete** — only once you are carrying one | `SLASH` — alternates a forehand and a backhand |

`JUMP` and `CROUCH` sit above the right thumb at all times. The left half of the
screen is a virtual stick; drag anywhere on the right half to look around.

**To spawn something:** tap the three lines in the top left. The drawer has two side
sections — **Objects** (Crate, Boulder, Machete) and **Humans** (Citizen). Pick one,
close the drawer, equip the **RCV2**, and press **+**.

**To move something:** with the RCV2 equipped, tap `SHOOT` while aiming at anything
that can move — a crate, a boulder, a machete, or a citizen. It is held in the beam
until you tap `SHOOT` again. The delete button removes whatever you are holding, or
whatever is under the crosshair.

**To pick something up:** spawn a **Machete**, walk over to it, and a `USE` button
appears. Tap it to take the machete into your right hand; slot 3 lights up and the
primary button becomes `SLASH`. `USE` turns into `DROP` while you are carrying it.

Keyboard and mouse work too: `WASD`, mouse look (click to lock the pointer), `Space`
jump, `C` crouch, `1`/`2`/`3` weapons, left click punch, slash or grab, `E` use,
`G` spawn, `X` delete, `Tab` spawn menu, `Esc` pause.

---

## What is actually simulated

### Bodies are boxes, and every part is separate

Every body part on the player and on every citizen is a six sided box:

```
head, neck, upper torso, middle torso, lower torso, pelvis,
upper arms, lower arms, hands,
fingers  - five per hand, two segments each, both segments turn independently,
upper legs, lower legs,
feet     - plus a tip, which is welded on and never turns
```

The three torso segments taper the way the design calls for: the middle torso is
slimmer than the upper torso, and the lower torso is slimmer than the middle.

Faces are painted onto the head's texture: rectangular eyes with a coloured iris and
a pupil, a flat two dimensional nose, and a flat mouth that turns down when its owner
is having a bad time.

Citizens are randomised — skin (white, light brown, brown, dark brown), hair colour
and style, shirt, trousers, shoes, eye colour, build, and a temperament that decides
whether they swing back or run.

### One number decides whether you are watching an animation or a ragdoll

Characters are always animated by forward kinematics *and* always simulated as a
particle ragdoll. A per-character **muscle strength** decides which one you see:

| Strength | State | What it looks like |
| -------- | ----- | ------------------ |
| `1.00` | in control | the ragdoll is pinned to the animation |
| `~0.34` | **stumbling** | physics leads, muscles fight to stay upright, and you can still steer |
| `~0.07` | **ragdolling** | limp — but a living body still writhes and shoves |
| `0.01` | dead | nothing left |

So a stumble is a real ragdoll that happens to be trying to stand up, and it can
either recover or fall. Getting up ramps the number back to one over the length of a
multi-frame get-up animation, so the ragdoll melts into the animation instead of
snapping to it. There are two get-ups, one from the front and one from the back.

Animation is keyframed and layered: a locomotion layer (idle, walk, run, crouch
idle, crouch walk, jump, fall, stagger) crossfaded underneath an upper-body layer
(holding, fist guard) and a one-shot action layer (the two jabs), all sampled with a
cubic so the motion is smooth rather than stepped.

### Attacks have no hitboxes

A jab only lands if the **fist geometry genuinely overlaps a body part**. The nine
sample points of the hand box are tested against every damageable box on every other
character; nothing else is consulted. Damage and knock-back come from the hand's
actual velocity at the moment of contact, so spacing matters — reach out at full
extension and it hurts, crowd in and you land a weak, early tap. Punch a crate and
you shove the crate.

The machete works the same way, only the geometry is the blade: its cutting edge is
sampled from the guard to the tip and tested against real body parts, so its reach
and timing are the weapon's own. Unlike a fist it cuts, so it opens wounds and tears
clothing rather than just bruising — and the blood stays on the blade.

### Gore

Every body part, every garment, every crate and the floor itself owns a canvas that
damage is painted onto, at the exact spot it landed.

- **Bruising** — what blunt force leaves behind. Purple heart, jaundiced halo, no
  broken skin. Painted on the skin even under clothing.
- **Blood** — never from a weak punch. Heavy impacts open a wound, and the droplets
  that spray out of it are simulated for real: they arc, they land, and they paint
  themselves onto whatever they hit, which is how blood ends up on other citizens,
  on you, on map parts, on the floor and on objects.
- **Cloth tears** — the garment's alpha is genuinely punched through and the edge
  frayed, so the skin shows underneath. Rare from blunt force, common from anything
  worse.

### Citizen AI

A* over a 0.7 metre grid that is rebuilt from the live positions of every object, so
citizens path around crates and boulders as you move them. Straight lines are taken
directly, corners are string-pulled out of the path, and neighbours separate from one
another without shoving a fight partner away.

They judge threats — being loomed over by someone swinging, being aimed at with the
RCV2, being hurt, or watching it happen to someone nearby — and then either **fight
back** or **run**, based on nerve, aggression and how badly hurt they already are.
They **jump** only when something short is genuinely in the way, and **crouch** only
when something heavy is flying at head height or when they are cornered and
terrified. Knocked down, they crawl away from whatever hurt them, then get up.

### Physics

- Verlet particles with distance constraints for the ragdolls, plus joint limits so
  elbows and knees do not invert, and a braced torso so bodies do not concertina.
- Impulse-based rigid bodies with Coulomb friction for crates and boulders. The
  boulder's collider is a true sphere, so it rolls because rolling is what the
  friction impulses at the contact point produce — not because anything fakes it.
- Two-way coupling: bodies shove people, people shove bodies.

---

## Layout

```
dist/gorebox.html     the whole game in one downloadable file
index.html            markup for every screen
styles/main.css       mobile-first UI, safe-area aware
vendor/three.module.js  three.js r169, vendored so the game runs offline
src/
  main.js             boot, app state machine, the frame loop
  core/               util, loading screens, input (stick + drag + keyboard)
  physics/
    rigid.js          rigid bodies, contact generation, sequential impulses
    world.js          particles, constraints, coupling, queries
  game/
    skeleton.js       the rig: bone definitions, atlas UVs, world-space queries
    animations.js     keyframe data for every clip
    animator.js       layered playback and blending
    body.js           the visible body: boxes, garments, hair, face, damage paint
    character.js      the controller and the stumble/ragdoll/get-up state machine
    ai.js             nav grid, A*, and the citizen brain
    gore.js           droplets, decals and which ink goes where
    paint.js          paintable surfaces and the gore/face drawing itself
    textures.js       procedural grass, wood, rock and sky
    objects.js        crate, boulder and machete
    citizen.js        citizen spawner
    rcv2.js           the Reality Crusher V2
    map.js            maps, currently the Test Baseplate
    game.js           scene, camera, player, spawning, damage routing
  ui/                 menu, HUD, spawn drawer
tools/build-single-file.mjs  folds the whole game into dist/gorebox.html
tools/verify.mjs      functional smoke test, driven in a real browser
```

## Verifying it

`tools/verify.mjs` boots the real game in Chromium and asserts that the systems
this project is actually about still work:

- jumping lifts you, and crouching lowers your eyeline
- a citizen paths around a wall of crates instead of walking into it
- the RCV2 grabs and lifts a crate, picks a citizen up into a ragdoll, and its
  delete button removes the target
- the player can die, see the death screen, and respawn intact
- you cannot walk through another person
- jabs land at walking-in range and can eventually kill, leaving a corpse
- an angry citizen fights back and can hurt you
- the joystick moves you the moment you land in the map
- a hard hit and a rolling boulder stagger a ragdoll without launching it
- the machete can be picked up with USE, swung both ways, and put back down
- a boulder rolls rather than slides

```
npm install -D playwright && npx playwright install chromium
node tools/verify.mjs
```

It exits non-zero if anything fails. Set `CHROMIUM_PATH` if you already have a
Chromium build you would rather it used.

## Settings

Graphics quality (auto-detected on first run), shadows, gore on/off, look
sensitivity, field of view and invert-Y all live under **SETTINGS** and persist in
`localStorage`.

## Licence

`vendor/three.module.js` is three.js, MIT licensed — see `vendor/THREE-LICENSE.txt`.
