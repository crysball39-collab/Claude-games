# Fortnite — 3D Third-Person Battle Royale

A browser battle royale prototype built from scratch with [three.js](https://threejs.org/):
a giant three-biome island, three fully built points of interest, 99 AI opponents,
looting, gunplay, healing and Fortnite-style building.

No build step, no bundler, no external art — every model, texture and animation in
the game is generated procedurally at runtime.

---

## Run it

**Easiest — just open `fortnite.html`.** It is a single self-contained file
(three.js, every module and the stylesheet inlined, ~1.5 MB) that runs straight
off disk with no server and no network.

To work on the source instead, serve the folder — ES modules will not load from
`file://`:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

`three.js` is vendored at `vendor/three.module.js`, so either way the game runs
completely offline. After editing anything in `src/`, regenerate the single-file
build with:

```bash
node build.mjs
```

---

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | `W A S D` | Joystick, bottom left |
| Look | Mouse (click to lock the pointer) | Drag anywhere on the right |
| Sprint | `Shift` | **SPRINT** (toggle), or push the joystick to the edge (it turns gold) |
| Jump | `Space` | **JUMP** |
| Crouch | `C` (toggle) | **CROUCH** |
| Shoot / swing / drink | Left mouse | **Shoot** (big button) |
| Aim down sights | Right mouse | **AIM** |
| Reload | `R` | **RELOAD** |
| Use — doors, chests, pickups | `E` or `F` | **USE** |
| Build mode | `Q` | **BUILD** |
| Pick a build piece | `Z` wall, `V` floor, `B` ramp, `N` pyramid | Build bar |
| Slots 1–5 / pickaxe | `1`–`5`, `6` or `X` | Tap the slot |
| Cycle slots | Mouse wheel | — |
| Open the map | `M` or `Tab` | Tap the minimap |
| Close the map | `Esc`, `M` | **BACK** |

The 6th slot is permanently the pickaxe. Slots 1–5 hold weapons and items.

The joystick sits at the bottom left and is always on screen so you can see
where it is. Touching anywhere in the lower-left quarter picks it up — it hops
under your thumb so you always start centred, and drops back to its resting
spot when you let go.

---

## The storm

The circle holds for **two minutes**, then takes **one minute** to close onto a
smaller circle chosen inside it, and repeats through nine zones down to a final
20 m circle. Damage outside climbs with every zone, from 1/s at the start to
15/s at the end.

* The **safe circle for the next close-in** is drawn as a white dashed ring on
  both the minimap and the map, as soon as it is chosen.
* Standing outside, a **white line runs from you to the safe circle** on the
  minimap, the screen edges glow purple and an IN THE STORM warning appears.
* The readout under the minimap counts down to the next close-in and switches
  to a pulsing STORM CLOSING while it moves.
* Bots rotate too. Getting caught out is the most common way they die, which is
  what finally makes a 100-player match converge on a winner.

## Map and waypoints

The **minimap** sits top right — north-up, with POI names, the storm circles and
your heading. Tap it (or press `M`) to open the **full map**:

* Drag to pan, pinch or scroll to zoom, or use the +/− buttons.
* **Tap anywhere to drop a waypoint.** It shows as a pin on both maps and as a
  cyan beam in the world, so you can see where you were heading. CLEAR PIN
  removes it.
* BACK returns to the game. You cannot move or shoot while the map is open.

The map image is generated from the terrain's own vertex data at load, so it is
the actual island rather than an approximation of it.

---

## Lobby

Your character idles on a lit stage in the background. The two screens sit
behind tabs, so only one is on show at a time:

* **LOBBY** — match details and a few reminders.
* **LOCKER** — outfit, back bling and pickaxe (defaults only), each with its own
  sub-tab. Your picks and your name are remembered.

## The island

2,400 × 2,400 units of heightfield terrain with three biomes, hills of varying
shape, and harvestable nature: pine forest to the north, dunes and cacti through
the middle, snow-covered pines to the south.

### Summering Falls — forest, north edge of the map
* Five colour-coded apartment blocks, three floors each: living room on the
  ground floor, storage room on the second, another living room on the third,
  with staircases and roof access.
* Seven houses around them, each with a living room, kitchen and bathroom.
* A waterfall spilling off the plateau into the pond at the map edge.

### Pumped Palms — middle of the desert
* Oasis, palms, sandstone sheds and a fuel station on the surface.
* A concrete bunker leads down to an **underground lab**: a long hallway with
  **four observation rooms behind one-way glass** (mirrored from the hallway,
  see-through from inside), a **control room** full of monitors and server racks,
  and a **resting unit** with bunks.

### Snowy Snarks — west side of the snow biome
* A snow-caked castle: two floors, three towers, a bridge to the front gate.
* Repurposed as a field hospital — medical beds, IV stands, cabinets and
  monitors throughout, with snow drifts and ice blocking parts of it.
* Great hall with a dinner table and a throne, plus an armoury upstairs.

---

## Loot

Chests spawn at exactly the specified locations:

| POI | Chests |
| --- | --- |
| Summering Falls | 1 in one of the five apartment blocks; 3 in the bathrooms of 3 of the 7 houses |
| Pumped Palms | 1 on the chair in the lab's resting unit |
| Snowy Snarks | 5 — on the throne, in the armoury, on top of a tower, on the dinner table, and on the bridge by the front door |

Ground loot is also scattered through all three POIs so a 100-player lobby has
something to fight over.

### Weapons

| Weapon | Magazine | Fire | Notes |
| --- | --- | --- | --- |
| M1911 | 7 | Semi-auto | Fast, accurate, low DPS |
| Mac-10 | 25 | Full auto | High rate of fire, wide spread, short range |
| AK-47 | 30 | Full auto | Hardest hitting, heaviest recoil |

Every gun has a muzzle flash, recoil (weapon kick + camera kick), and two
distinct reload animations — a normal magazine swap and a longer one that racks
the slide when the chamber is empty.

### Items

* **Bandages** — 2.0 s use animation, +25 HP, stacks to 15.
* **Small Shield Potion** — 2.2 s drink animation, +25 shield, stacks to 6.

### Rarity

Common → Uncommon → Rare → Epic → Legendary. Rarer drops are less frequent from
chests and roll better damage, faster reloads and tighter spread. Slot borders
and pickup beams are colour-coded.

---

## Building

Walls, floors, ramps and short pyramids, snapped to a 3.2 m grid, **25 wood each**.
Wood comes from hitting wooden props — trees, cacti, bushes, furniture, crates and
barrels — with the pickaxe. Every piece is destructible and has its own collision.

---

## The AI

99 bots share the player's controller, so anything they do you can do:

* Path to chests and ground loot, open chests and pick items up.
* Compare what they find and upgrade — better weapons, healing when hurt.
* Fight: strafe, close or back off toward a preferred range, sprint, jump and
  crouch, reload at the right moment and burst-fire rather than beam.
* **Their aim is deliberately imperfect.** Each bot has a skill value that sets a
  reaction delay and the size of a wandering error cone that grows with distance
  and with how fast the target is moving, so they miss, lead badly and lose
  tracking — no aimbot.
* Open doors, steer around obstacles and unstick themselves.

---

## Code layout

```
fortnite.html         single-file build - open this one to play
build.mjs             bundles src/ + style.css + three.js into fortnite.html
index.html            importmap + canvas (the source version)
style.css             lobby, HUD and overlays
vendor/three.module.js
src/
  main.js             boot, lobby → match → results
  lobby.js            lobby scene, LOBBY/LOCKER tabs and the locker
  storm.js            closing circle, damage and the storm wall
  map.js              island image, minimap and full-screen map
  game.js             match runtime: world, actors, bullets, loot, loop
  world.js            heightfield, biomes, terrain mesh, harvestable nature
  physics.js          collider grid, capsule movement, analytic raycasts
  props.js            structure kit: walls, doors, stairs, furniture, merging
  poi_summering.js    Summering Falls
  poi_snowy.js        Snowy Snarks
  poi_pumped.js       Pumped Palms + underground lab
  actor.js            shared player/bot behaviour
  player.js           input handling + third-person camera
  ai.js               bot brain
  character.js        procedural character rig, skins, back blings, pickaxes
  models.js           guns, pickaxes, items, chests, muzzle flash
  loot.js             weapons, items, rarity, inventory, chests, pickups
  building.js         grid-snapped build pieces
  effects.js          pooled tracers, particles, damage numbers
  ui.js               HUD, joystick and buttons
  util.js             math, RNG, noise
```

### Performance notes

* Each POI merges its thousands of static boxes into one mesh per material after
  it is built — this alone cut the frame's draw calls from ~5,200 to ~500.
* Trees, cacti and rocks are `InstancedMesh` with per-instance hit points.
* Bots run full logic near the player, and further out are simulated at a third
  of the rate with their rigs skipped.
* Bullets, the pickaxe and line-of-sight all use analytic ray/collider maths
  against the same broadphase grid the movement uses, so nothing needs a
  scene-graph raycast.
