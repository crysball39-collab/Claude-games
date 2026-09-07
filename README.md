# Pac-Man

A faithful browser recreation of the 1980 Namco arcade original. No build step,
no dependencies — open `index.html` and play.

```
git clone https://github.com/crysball39-collab/Claude-games
cd Claude-games && open index.html      # or: python3 -m http.server
```

**Controls** — arrow keys or WASD to move, `SPACE` to start, `P` to pause,
`M` to mute. Touch devices can swipe.

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
css/style.css       page chrome; the canvas keeps the 7:9 arcade aspect
js/maze-tiles.js    wall glyphs + tilemap traced from the arcade capture
js/maze.js          maze data, collision queries, dot and wall rendering
js/font.js          5x7 bitmap font
js/sprites.js       Pac-Man, ghosts and fruit
js/audio.js         Web Audio synthesis - siren, waka, jingle, death
js/game.js          rules, ghost AI, level flow, HUD
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
