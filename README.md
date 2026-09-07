# Pac-Man

A faithful browser recreation of the 1980 Namco arcade original. No build step,
no dependencies — open `index.html` and play.

```
git clone https://github.com/crysball39-collab/Claude-games
cd Claude-games && open index.html      # or: python3 -m http.server
```

**`pacman.html` is a single self-contained file** — the whole game inlined into
one 69 KB HTML file with no external references. Download it, open it from your
phone's Files app or a browser, and it plays offline. Rebuild it after changing
anything under `js/` or `css/`:

```
node tools/build-single-file.js
```

## Controls

**Keyboard** — arrow keys or WASD to move, `SPACE` to start, `P` to pause,
`M` to mute.

**Touch** — an on-screen D-pad appears automatically on touch devices, with
START, PAUSE and SOUND beside it, plus SHOOT once a mod arms him. Keys are at least 54 px on the smallest
phone, and you can slide a thumb across the pad to re-latch direction without
lifting. Swiping anywhere on the maze works too. The layout moves the pad
alongside the maze in landscape, and the page never scrolls or zooms.

## How close is it to the arcade?

The maze is **pixel-identical**. Rather than eyeballing it, the wall art in
`js/maze-tiles.js` was traced tile-by-tile from a 224×288 pixel-perfect capture
of the arcade screen: 33 unique 8×8 glyphs over a 28×31 tilemap. A diff against
that capture matches on all 4,792 wall pixels, with zero pixels drawn that the
original does not draw.

The rest is measured off the same capture:

| | Value |
|---|---|
| Screen | 224 × 288 px, 28 × 36 tiles of 8 px |
| Playfield | 28 × 31 tiles, offset 3 tiles below the score header |
| Dots | 240 dots + 4 energizers = 244 |
| Walls | `#2121FF` · dots and ghost-house door `#FFB8AE` · ghost eyes `#DEDEFF` |
| Ghosts | Blinky `#FF0000` · Pinky `#FFB8FF` · Inky `#00FFFF` · Clyde `#FFB851` |
| Sprites | Pac-Man 13 px across; ghosts 14 × 14 with three-footed skirts |
| Level-1 cherry | traced pixel-for-pixel from the capture |

Nothing is anti-aliased. The whole screen is composed in a 224 × 288 buffer at
arcade resolution and blitted up with smoothing off, and the character artwork
is rasterised once at 1× with its alpha thresholded and its colours snapped to
the arcade palette — so every sprite pixel is a hard block, as on the original.

## Sound

Audio runs through an emulation of the **Namco WSG**, the custom three-voice
wave sound generator on the Pac-Man board. The hardware model and the
wavetables are the real thing:

- the 12 non-silent waveforms of 32 four-bit samples transcribed from the
  board's two 256-byte sound PROMs (`82s126.1m`, `82s126.3m`)
- clocked at CPU/32 = 3.072 MHz / 32 = 96 kHz
- each voice adds a 20-bit frequency to a 20-bit accumulator per clock; the
  top 5 bits index the waveform and the nibble is scaled by a 4-bit volume
- register value for a pitch is `V = f × 32 / 96000 × 2¹⁵ = 4096f/375`, which
  reproduces the documented 4806 for A440

Every effect is rendered offline through that model into a 96 kHz buffer, so
the stepped quantisation and aliasing of the original survive instead of being
approximated with clean oscillators. The **waveform choices and register
sequences per effect are reconstructed by ear** — the game ROM's sound tables
were not available — so the timbre is the hardware's but the note data is not
a dump.

## Start sequence

Pressing start reproduces the arcade order: the maze appears with `PLAYER ONE`
in cyan and `READY!` in yellow and no characters at all, the opening tune
plays, and part-way through the characters appear and `PLAYER ONE` clears.
`READY!` sits in the chamber below the ghost house — the same tile the fruit
spawns on — and Pac-Man waits there as a closed circle. Losing a life skips
the tune and shows the shorter `READY!` with the characters already in place.

## Timing

The game runs on a fixed timestep at the arcade's 60.606 Hz video rate, where
a character at 100 % speed advances exactly 1.25 pixels per frame — the
documented 75.76 px/s. This is decoupled from the display: at 60, 90, 120 and
144 Hz Pac-Man covers the same 60 px per second on level 1.

## Modes

The title screen offers **1 PLAYER**, **2 PLAYER**, **AI MODE** and **MODS**.

### AI mode

Hands the controls to a search agent. It is not replaying memorised patterns —
it re-plans continuously. Each decision floods the maze from Pac-Man's tile and
from every hunting ghost, then treats a tile as contested if a ghost can reach
it first, which is what lets it walk confidently past a ghost on the far side
of a wall and refuse a corridor that only *looks* open. The route search itself
is gated on that map, so it will not path *through* a contested tile, only to
one. On top sits a value pass — pellets, energisers, fruit and edible ghosts,
divided by distance.

Two details matter more than anything else in there. Ghosts cannot reverse, so
danger must not spread backwards through the tile behind them; without that the
map invents threat and the agent gives up safe ground for nothing. And when
nothing at all is reachable under the strict safety margin the standard drops a
step at a time, otherwise the last few pellets in a contested corner never get
taken and the level simply never ends.

Measured over eight full runs it averages **level 3.0 and 16,000 points**, with
its best runs reaching level 5. That is a strong agent, not a perfect one — a
genuinely unbeatable Pac-Man would need the arcade's exact frame-level
determinism, which this does not reproduce.

### 2 player and chat

**This build has no server.** It is one offline HTML file, so the lobby search
always comes back empty and you are seated with a CPU opponent every time. The
screen says so. The seam is deliberate: everything goes through a `transport`
object in `js/multiplayer.js`, so a real socket can replace it without touching
the rest.

Both players share one maze and race for the same dots. Player two wears a bow,
scores on the `2UP` counter and keeps their own lives on the right of the
status bar. Ghosts hunt whichever player is nearer, with hysteresis so they do
not flip between you every frame. A caught player drops out alone for a couple
of seconds and respawns at their own start — the round does not stop — and the
game ends when both have run out.

The opponent plays with the same agent as AI mode, dialled slightly below
perfect so it feels human, and talks in the chat panel (`T` to open, or the
CHAT button on touch). It answers questions about the game from a real
knowledge base — dot counts, each ghost's rule, fruit values, the 200/400/800/
1600 chain, scatter timings — and reacts to what is happening on screen.

**It is a rule-based conversationalist, not a language model.** It matches your
message against an intent table and answers from a bank of variants that splice
in live game state. It holds a game conversation and will surprise you more
often than you would expect, but it cannot follow you anywhere you like the way
a person would. Shipping something that could would mean a network call, and
this file works offline.

### Mods in 2 player

Mods are yours alone. Rampage Pac only ever arms the player who switched it on:
you get the brows and the shotgun, ghosts refuse to hunt you and cannot catch
you, while your opponent plays a completely ordinary game against the same four
ghosts. The opponent is never told any of it is happening and never mentions it.

## Mods

`MODS` on the title screen opens an arcade-styled browser with three sections:
**installed** mods you can enable and disable, **downloadable** ones that
install with a progress bar, and **show needed storage**, which breaks down
what the enabled set costs against the cartridge's 512K. Choices persist.

| Mod | Size | What it does |
|---|---|---|
| Rampage Pac | 128K | The story mod, below |
| Turbo Maze | 48K | Everything runs 25 % faster |
| Ghost Rush | 64K | All four ghosts start outside the house |
| Neon Night | 96K | The maze cycles through eight wall colours |

### Rampage Pac

Level 1 plays exactly as normal. On level 2 Pac-Man picks up a heavy brow. On
level 3, while `READY!` is still on screen, he stops waiting:

> **PAC-MAN:** I HAD ENOUGH!
> **BLINKY:** P-PACMAN? WHAT ARE YOU DOIN-

He racks a shotgun, and the round starts with the roles reversed — the ghosts
run from him instead of hunting him, and a `SHOOT` button appears (`X`, `Z` or
`SPACE` on a keyboard). Shooting is hit-scan down the corridor he faces and
takes the first ghost in it, scoring the usual 200/400/800/1600 chain. Clearing
that level ends the demo and drops you back in the mod menu.

### Choose Ghosts

The menu's second tab adds four ghosts alongside the original four. Any
combination works — none, one, all four, or any mix — and the choice persists.
Each waits in its own chamber until enough dots are eaten, then enters play.

| Ghost | Colour | Chase | Scatter |
|---|---|---|---|
| Lumo "The Ambusher" | Lime | Traces five tiles along the route Pac-Man is actually taking, following the corridor **around bends**, and drops to direct pursuit inside four tiles | Upper-left patrol |
| Vexa "The Flanker" | Purple | Aims four tiles off to Pac-Man's side, picking whichever flank the rest of the pack is not covering; commits directly when it is the nearest ghost | Upper-right patrol |
| Grimm "The Trapper" | Grey | Targets the next junction at least four tiles ahead of Pac-Man, or the far end of the corridor if there is none — it gets there first and waits | Lower-left patrol |
| Nox "The Stalker" | Dark blue | Hunts on a three-beat cycle (straight in / cut ahead / creep up behind), peels away inside four tiles and will not return until ten tiles of daylight open up, and weights against tiles it has just used | Lower-right patrol |

Each scatter route is a loop of five waypoints sampled from the maze itself, so
every one is a real corridor tile inside that ghost's own quarter, and the four
routes never overlap. A ghost steps to the next waypoint as it arrives, so it
circulates through its region rather than parking on a corner.

Frightened and eaten are handled by the core, unchanged: their own AI switches
off while blue, they take the same random walk as everyone else, and when eaten
they return to the ghost house, descend to a slot and re-enter play normally.

### Dev menu

Clicking Blinky ten times in the mod menu opens it. Set the starting level,
scale the game speed from 0.25× to 3×, and turn on godmode.

## Arcade rules that are actually implemented

Behaviour follows the original board as documented in *The Pac-Man Dossier*:

- **Ghost targeting.** Blinky chases Pac-Man's tile. Pinky aims four tiles
  ahead. Inky doubles the vector from Blinky to two tiles ahead of Pac-Man.
  Clyde chases beyond eight tiles and retreats to his corner inside that.
  Both of the original's targeting quirks are reproduced, including Pinky's
  overflow when Pac-Man faces up (four tiles up *and* four left).
- **Scatter / chase.** Level 1 runs 7 s / 20 s / 7 s / 20 s / 5 s / 20 s / 5 s
  then chases forever; levels 2–4 and 5+ use their own tables. Ghosts reverse
  on every phase change, and the clock freezes while they are frightened.
- **Ghost house.** Per-ghost dot counters (Inky 30 and Clyde 60 on level 1,
  Clyde 50 on level 2, 0 from level 3), the global counter that takes over
  after a life is lost, and the four-second no-dot release timer.
- **Movement.** Ghosts choose at tile centres by straight-line distance with
  up-left-down-right tie-breaking, may not reverse, and may not turn upward on
  the four restricted tiles. Frightened ghosts wander at random.
- **Speeds.** The full per-level table — Pac-Man 80/90/100 %, ghosts
  75/85/95 %, reduced tunnel speed, frightened speed, and Cruise Elroy, where
  Blinky speeds up as the maze empties and keeps hunting through scatter.
- **Scoring.** Dots 10, energizers 50, ghost chains 200/400/800/1600, the
  eight fruit values from cherry (100) to key (5000), and an extra life at
  10,000. Fruit appears at 70 and 170 dots eaten.

## Layout

```
index.html          markup and script order
pacman.html         generated single-file build - do not edit by hand
css/style.css       page chrome, touch controls, responsive layout
tools/build-single-file.js   inlines everything into pacman.html
js/maze-tiles.js    wall glyphs + tilemap traced from the arcade capture
js/maze.js          maze data, collision queries, dot and wall rendering
js/font.js          5x7 bitmap font
js/sprites.js       Pac-Man, ghosts and fruit
js/audio.js         Namco WSG emulation + the sound PROM wavetables
js/game.js          rules, ghost AI, level flow, input, HUD
js/autopilot.js     the search agent that plays for you
js/chatbot.js       the opponent's chat persona and game knowledge
js/multiplayer.js   two-player mode, matchmaking seam, chat panel
js/mods.js          mod browser, Rampage Pac, dev menu
js/ghosts-extra.js  the four extra ghosts and their AI
test/run-tests.js   behavioural tests
```

The canvas is 224 × 288 arcade pixels scaled 3×, so all game code works in the
original's coordinates.

## Tests

```
npm install playwright
node test/run-tests.js          # CHROMIUM_PATH=... to reuse a local browser
```

121 assertions covering the maze checksums (244 dots, left-right symmetry, every
dot reachable), ghost targeting including both quirks, phase timings, house
release limits, the tunnel, scoring, and the per-level speed table.
