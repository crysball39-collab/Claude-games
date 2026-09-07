/* The original Pac-Man maze: 28 x 31 tiles of playfield inside a 28 x 36 screen.
   Legend:  # wall   . dot   o energizer   - ghost-house door   (space) empty path
   The layout below yields exactly 240 dots + 4 energizers = 244, which is the
   arcade's documented total and acts as a checksum on the transcription. */
(function (global) {
  'use strict';

  var LAYOUT = [
    '############################',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#o####.#####.##.#####.####o#',
    '#.####.#####.##.#####.####.#',
    '#..........................#',
    '#.####.##.########.##.####.#',
    '#.####.##.########.##.####.#',
    '#......##....##....##......#',
    '######.##### ## #####.######',
    '######.##### ## #####.######',
    '######.##          ##.######',
    '######.## ###--### ##.######',
    '######.## #      # ##.######',
    '      .   #      #   .      ',
    '######.## #      # ##.######',
    '######.## ######## ##.######',
    '######.##          ##.######',
    '######.## ######## ##.######',
    '######.## ######## ##.######',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#.####.#####.##.#####.####.#',
    '#o..##.......  .......##..o#',
    '###.##.##.########.##.##.###',
    '###.##.##.########.##.##.###',
    '#......##....##....##......#',
    '#.##########.##.##########.#',
    '#.##########.##.##########.#',
    '#..........................#',
    '############################'
  ];

  var COLS = 28;
  var ROWS = 31;
  var TILE = 8;

  /* The maze sits below a 3-tile score header inside the 36-tile-tall screen. */
  var MAZE_TOP = 3 * TILE;
  var SCREEN_W = COLS * TILE;            // 224
  var SCREEN_H = 36 * TILE;              // 288

  var WALL = 1, DOOR = 2, EMPTY = 0;

  var WALL_COLOR = '#2121ff';
  var DOOR_COLOR = '#ffb8ae';
  var DOT_COLOR = '#ffb8ae';

  /* Tunnel row, and the four tiles where ghosts may not choose to turn upward. */
  var TUNNEL_ROW = 14;
  var NO_UP_TILES = [[12, 11], [15, 11], [12, 23], [15, 23]];

  var grid = [];      // WALL / DOOR / EMPTY
  var dots = [];      // 0 none, 1 dot, 2 energizer
  var totalDots = 0;

  for (var r = 0; r < ROWS; r++) {
    grid[r] = [];
    dots[r] = [];
    for (var c = 0; c < COLS; c++) {
      var ch = LAYOUT[r][c];
      grid[r][c] = ch === '#' ? WALL : (ch === '-' ? DOOR : EMPTY);
      dots[r][c] = ch === '.' ? 1 : (ch === 'o' ? 2 : 0);
      if (dots[r][c]) totalDots++;
    }
  }

  function inBounds(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }

  /** Wall test for movement. Out-of-bounds columns are open (the tunnel). */
  function isWall(c, r) {
    if (r < 0 || r >= ROWS) return true;
    if (c < 0 || c >= COLS) return false;
    return grid[r][c] === WALL;
  }

  function isDoor(c, r) { return inBounds(c, r) && grid[r][c] === DOOR; }

  /** Walkable for Pac-Man: walls and the ghost-house door both block him. */
  function isWalkable(c, r) { return !isWall(c, r) && !isDoor(c, r); }

  /** Walkable for a ghost: the door is passable while entering or leaving. */
  function isWalkableGhost(c, r, allowDoor) {
    if (isWall(c, r)) return false;
    if (isDoor(c, r)) return !!allowDoor;
    return true;
  }

  function isNoUpTile(c, r) {
    for (var i = 0; i < NO_UP_TILES.length; i++) {
      if (NO_UP_TILES[i][0] === c && NO_UP_TILES[i][1] === r) return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------------- */
  /* Wall rendering                                                          */
  /*                                                                          */
  /* The walls come from MazeTiles: 8x8 glyphs traced from a pixel-perfect     */
  /* capture of the arcade screen, so the outlines sit exactly where the       */
  /* original puts them (along the centre lines of the boundary wall tiles,    */
  /* with the doubled line around the outer frame). Each colour is rasterised  */
  /* once into an offscreen buffer and blitted from then on.                   */
  /* ---------------------------------------------------------------------- */

  var wallCache = {};

  function wallLayer(color) {
    if (wallCache[color]) return wallCache[color];
    var off = document.createElement('canvas');
    off.width = COLS * TILE;
    off.height = ROWS * TILE;
    var octx = off.getContext('2d');
    global.MazeTiles.paint(octx, color);
    wallCache[color] = off;
    return off;
  }

  /**
   * Render the maze walls. `color` lets the level-complete animation flash
   * the maze white.
   */
  function drawWalls(ctx, color) {
    var c = color || WALL_COLOR;
    var prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(wallLayer(c), 0, 0);
    ctx.imageSmoothingEnabled = prev;
  }

  /* The ghost-house door is a two-pixel bar in the same peach as the dots. */
  function drawDoor(ctx) {
    ctx.save();
    ctx.fillStyle = DOOR_COLOR;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (grid[r][c] === DOOR) ctx.fillRect(c * TILE, r * TILE + 5, TILE, 2);
      }
    }
    ctx.restore();
  }

  /** Dots are 2x2 px; energizers are 8px discs that blink with the global timer. */
  function drawDots(ctx, state, energizerVisible) {
    ctx.save();
    ctx.fillStyle = DOT_COLOR;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var d = state[r][c];
        if (d === 1) {
          ctx.fillRect(c * TILE + 3, r * TILE + 3, 2, 2);
        } else if (d === 2 && energizerVisible) {
          ctx.beginPath();
          ctx.arc(c * TILE + 4, r * TILE + 4, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  function freshDots() {
    return dots.map(function (row) { return row.slice(); });
  }

  global.Maze = {
    LAYOUT: LAYOUT,
    COLS: COLS, ROWS: ROWS, TILE: TILE,
    MAZE_TOP: MAZE_TOP, SCREEN_W: SCREEN_W, SCREEN_H: SCREEN_H,
    TUNNEL_ROW: TUNNEL_ROW,
    WALL_COLOR: WALL_COLOR, DOT_COLOR: DOT_COLOR, DOOR_COLOR: DOOR_COLOR,
    totalDots: totalDots,
    isWall: isWall,
    isDoor: isDoor,
    isWalkable: isWalkable,
    isWalkableGhost: isWalkableGhost,
    isNoUpTile: isNoUpTile,
    drawWalls: drawWalls,
    drawDoor: drawDoor,
    drawDots: drawDots,
    freshDots: freshDots
  };
})(window);
