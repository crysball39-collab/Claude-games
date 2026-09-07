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
START, PAUSE and SOUND beside it. Keys are at least 54 px on the smallest
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
test/run-tests.js   behavioural tests
```

The canvas is 224 × 288 arcade pixels scaled 3×, so all game code works in the
original's coordinates.

## Tests

```
npm install playwright
node test/run-tests.js          # CHROMIUM_PATH=... to reuse a local browser
```

37 assertions covering the maze checksums (244 dots, left-right symmetry, every
dot reachable), ghost targeting including both quirks, phase timings, house
release limits, the tunnel, scoring, and the per-level speed table.
