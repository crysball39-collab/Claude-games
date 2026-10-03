# OVERGROWTH

A 3D mobile ragdoll brawler that runs in a browser. You spawn people from six
teams onto a floating green platform and watch them fight. Every body part is a
separate rigid box held to its neighbours by real joints. Every hit has to
actually touch someone, and every drop of blood is simulated until it lands on
something.

## Getting it onto a phone

**`dist/overgrowth.html` is the whole game in one file.** Download it and open
it: no server, no install, no network. Markup, styles, every module and three.js
are all inlined.

| Phone | What to do |
| ----- | ---------- |
| **Android** | Download `dist/overgrowth.html`, open **Files → Downloads**, tap it. It runs in Chrome. |
| **iPhone / iPad** | Download it, then **Files → Downloads → tap `overgrowth.html`**. Safari runs it. |

It plays in either orientation; landscape gives the widest view. **Add to Home
Screen** gives you a full-screen game with no browser bars.

### Running the source instead

```
./serve.sh            # from the repository root
# then open http://localhost:8080/overgrowth/ on a phone or a desktop
```

ES modules do not load from `file://`, so the unbundled source has to be served.
To rebuild the single file after changing anything:

```
npm install -D esbuild
npm run build:overgrowth     # -> dist/overgrowth.html
```

---

## Playing it

**PLAY** opens the spawn menu.

1. Pick a team, **Red, Blue, Yellow, Purple, Black or Orange**. The card you pick
   gets a **green outline**.
2. Tap **SPAWN**. They appear on the green ring in the middle of the view.
   **×1 / ×3 / ×5** spawns a squad.
3. Pick another team and spawn them too. Different teams go for each other on
   sight.

The **OBJECTS** tab has a **Crate** to shove about, plus a **Bat** and a
**Sword**. Fighters walk over and pick weapons up. The menu opens and closes
from the ☰ button. With it closed, the **SPAWN** button in the corner keeps
spawning whatever is selected.

| Control | What it does |
| ------- | ------------ |
| **Joystick** (bottom left) | Moves the camera across the map, in the direction it faces |
| **Drag** anywhere else | Turns the camera |
| **Pinch** | Moves the camera closer or further |
| **▲ ▼** | Raises and lowers the camera |
| **Tap** a fighter | Shows their team, health and what they are doing |
| 🔊 | Sound on and off (remembered) |
| ⏱ | Slow motion |
| ⏸ | Pause |
| 🗑 (tap twice) | Clear everything |

Keyboard: `WASD` / arrows move, `Q` `E` down and up, `Shift` faster, drag with
the mouse to look, wheel to zoom, `Tab` spawn menu, `1`–`6` pick a team, `F`
spawn, `P` pause, `T` slow motion.

---

## What is simulated

### Bodies

Every person is eighteen boxes, each with its own mass. Together they weigh
about 70 kg.

```
head, neck, upper torso, middle torso, lower torso, pelvis,
upper arms, lower arms, hands, upper legs, lower legs, feet
```

Each part hangs from the one it touches:

```
pelvis
├── lower torso → middle torso → upper torso
│                                ├── neck → head
│                                ├── upper arm L → lower arm L → hand L
│                                └── upper arm R → lower arm R → hand R
├── upper leg L → lower leg L → foot L
└── upper leg R → lower leg R → foot R
```

Shirts are the team colour and trousers a darker shade of it. Skin tone, hair,
hairstyle, eye colour and shoes are random. The face is painted onto the front
of the head.

### Physics

`src/physics/` is a rigid body engine written for this game. It uses extended
position based dynamics (Müller et al., *Detailed Rigid Body Simulation with
Extended Position Based Dynamics*, 2020), with 8 substeps per 60 Hz step.

- **Joints** sit where two parts meet. Knees and elbows are hinges that fold one
  way only. Ankles are hinges with a range. Hips, shoulders, the spine, the neck
  and the wrists are ball joints with a swing cone and a twist limit. All the
  numbers are in `src/game/rig.js`. Each joint carries a little friction, so a
  loose limb swings and settles instead of swinging forever.
- **Collision is box against box.** All fifteen separating axes are tested, and
  every corner of one box inside the other becomes its own contact point. A
  forearm lying across a chest therefore rests on two corners, and an edge
  crossing an edge meets at the closest points of the two edges. Bodies collide
  with each other, with crates and weapons, with the platforms, and with
  themselves (a hand cannot pass through its own chest). Friction is Coulomb,
  static and dynamic.
- A body that lies still settles. Its joints stiffen a little, and once it is
  quiet it sleeps until something touches it. That keeps a pile of bodies cheap.

### Muscles: animation, stumble, ragdoll, getting up

A person is always an animated skeleton *and* eighteen simulated bodies. The
state decides which one wins:

| State | What happens |
| ----- | ------------ |
| **active** | The bodies follow the animation exactly: idle, walk, run, guard, the left and right jabs, weapon swings, picking things up. They shove whatever they walk into. |
| **stumble** | After a solid hit the bodies are simulated, and muscles (springs toward a staggering animation) pull them at reduced strength. The hit carries through the body, the legs step in the direction it was pushed, the arms fly out. They recover, or they fall. |
| **ragdoll** | No muscle. Every part swings on its own joint. |
| **getup** | Once the ragdoll is still, a get up animation plays: from the back (sit up, tuck, rock onto the feet) or from the front (hands under the shoulders, push up, knees in, stand). It is blended in from wherever the body came to rest. |
| **dead** | A ragdoll that does not get up. |

Walking and running are generated from the gait phase, so the stride stretches
with speed. The legs turn toward the direction of travel while the chest stays
on the target, so fighters strafe and back off without moonwalking. Clips are
keyframed and sampled with a Catmull-Rom spline.

### Damage needs contact

A punch only lands if the **fist box actually overlaps a body part** of someone
on another team. The weapon box does the same, and so does the fist holding the
weapon when it is too close for the blade. The test runs on every physics
substep. Nothing else counts: jabbing the air a step short does nothing.

What the blow does comes from the real closing speed at the moment of contact:

- **damage**, scaled by the part hit (head ×1.6, neck ×1.4, torso ×1, limbs
  ×0.6, hands and feet ×0.4)
- **knock**, the impulse. It is applied to the part that was hit, at the point
  it was hit, and it drains **balance**. A small knock is a flinch. A bigger one
  is a **stumble**. Running out of balance, or one huge blow, is a
  **knockdown** into a ragdoll.

Landing hard as a ragdoll hurts too.

### Blood

- Blows to the face, heavy blunt hits and anything sharp open **wounds**. Drops
  spray out at the speed of the blow. They are simulated under gravity and
  paint themselves onto the first thing they reach: **the grass, the grey
  platform, other fighters, crates, and weapons, whether held or lying down**.
- Whatever landed the blow gets bloody too: the knuckles, the bat, the blade.
- Open wounds keep dripping and run down the body. The dead **pool**.
- Blunt hits leave **bruises**.

Every body, every object and the grey platform owns a canvas, and blood is
drawn onto it at the exact spot it hit. The grass is covered in transparent
tiles that are only made where blood lands.

### Sound

Punches, bats, blades, swings and bodies hitting the ground are synthesised on
the spot with WebAudio, so there are no sound files. Sounds get quieter with
distance from the camera.

### The fighters' heads

Each fighter picks the nearest enemy still on their feet. It favours whoever
hit it last and avoids anyone already being mobbed. It closes in, squares up at
the distance its jab actually reaches (measured from the animation, not
guessed), circles, and throws lefts and rights, sometimes in quick pairs. It
aims the punch at the head or the body. A weapon lying closer than the fight
gets picked up first. Fighters stay away from the edge and give their own team
room. A badly hurt fighter with little nerve sometimes backs off.

---

## Layout

```
overgrowth/
  index.html          every screen
  style.css           mobile first, safe-area aware
  src/
    main.js           boot, frame loop, quality step-down for slow phones (fewer
                      pixels, then no shadows and 6 physics substeps)
    core/             input (joystick, drag, pinch, keyboard), sound, helpers
    physics/
      collide.js      box-box SAT and contact manifolds, box-plane, rays
      world.js        bodies, joints, contacts, muscles, broad phase, sleeping
    game/
      rig.js          the eighteen parts, joint limits, forward kinematics
      anim.js         poses, clips, walk/run cycles
      human.js        a person: states, strikes, damage, get up
      ai.js           the fighters' decisions
      props.js        crate, bat, sword
      blood.js        drops, wounds, pools
      paint.js        canvases on boxes, blood on the floor
      appearance.js   teams, looks, faces
      map.js          the platforms, sky and light
      camera.js       the free camera
      game.js         scene, spawning, the fixed step loop
    ui/ui.js          HUD and the spawn menu
```

three.js is shared with GOREBOX from `../vendor/three.module.js`.

## Verifying it

```
npm install -D playwright esbuild && npx playwright install chromium
npm run verify:overgrowth          # the source
npm run build:overgrowth && npm run verify:overgrowth:file   # the single file
```

`tools/verify-overgrowth.mjs` drives the real game on a phone-sized touch screen
and checks:

- the spawn menu opens and closes, lists all six teams, outlines the selection
  in green, and SPAWN puts that team (or a crate, bat or sword) on the platform
- the joystick moves the camera and dragging turns it, and tapping a fighter
  shows their team and health
- jabbing the air short of someone does no damage, and the same jabs at arm's
  length connect and hurt
- idle breathes, the left and right jabs throw the right fist, and walking and
  running move at their own pace with the feet trading places
- a solid hit makes someone stumble, and they recover or fall
- a ragdoll falls, its limbs move independently at their joints, and it gets
  up again
- a sword lands by contact, and blood ends up on the victim, on the sword in
  the attacker's hand, on a crate, and on the ground
- six teams fight each other, every joint holds through it, and nothing turns
  into NaN
- the console stays clean, and the single file fetches nothing

Set `CHROMIUM_PATH` to use a Chromium you already have.
