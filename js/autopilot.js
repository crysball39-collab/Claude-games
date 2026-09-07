/* The playing AI. It does not replay memorised patterns - it searches the
 * maze every time it reaches a tile.
 *
 * The core idea is contested tiles: it floods the maze from its own position
 * and from every hunting ghost, then treats a tile as unsafe when a ghost can
 * reach it first. That respects walls, so it will happily run past a ghost on
 * the far side of a hedge and will refuse a corridor that looks open but is
 * already cut off. On top of that sits a value pass - dots, energisers, fruit
 * and edible ghosts - divided by distance, so it always takes the best paying
 * route it can still survive.
 */
(function (global) {
  'use strict';

  var DIRS = ['up', 'left', 'down', 'right'];
  var DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  var OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

  var COLS = 28, ROWS = 31, TILE = 8;
  var SIZE = COLS * ROWS;
  var INF = 1e9;

  function idx(c, r) { return r * COLS + c; }
  function wrapCol(c) { return ((c % COLS) + COLS) % COLS; }
  function tileOf(px) { return Math.floor(px / TILE); }

  // Scratch buffers, reused so a decision allocates nothing.
  var pacDist = new Int32Array(SIZE);
  var pacStep = new Int8Array(SIZE);      // index into DIRS of the first move
  var ghostDist = new Int32Array(SIZE);
  var threat = new Int32Array(SIZE);
  var queue = new Int32Array(SIZE);

  function inBounds(r) { return r >= 0 && r < ROWS; }

  /**
   * Flood the maze from one or more sources.
   * @param {function} passable (c, r) -> boolean
   * @param {Int32Array} dist filled with step counts, INF where unreachable
   * @param {Int8Array} [step] first-move direction index, for path recovery
   */
  function flood(sources, passable, dist, step, gate) {
    dist.fill(INF);
    if (step) step.fill(-1);
    var head = 0, tail = 0;
    for (var s = 0; s < sources.length; s++) {
      var c = wrapCol(sources[s][0]), r = sources[s][1];
      if (!inBounds(r)) continue;
      var i = idx(c, r);
      if (dist[i] !== INF) continue;
      dist[i] = 0;
      queue[tail++] = i;
    }
    while (head < tail) {
      var cur = queue[head++];
      var cc = cur % COLS, cr = (cur - cc) / COLS;
      var d = dist[cur];
      for (var k = 0; k < DIRS.length; k++) {
        var v = DIRV[DIRS[k]];
        var nc = wrapCol(cc + v[0]), nr = cr + v[1];
        if (!inBounds(nr) || !passable(nc, nr)) continue;
        var ni = idx(nc, nr);
        if (dist[ni] !== INF) continue;
        if (gate && !gate(ni, d + 1)) continue;
        dist[ni] = d + 1;
        if (step) step[ni] = d === 0 ? k : step[cur];
        queue[tail++] = ni;
      }
    }
  }

  function pacPassable(c, r) { return global.Maze.isWalkable(c, r); }
  function ghostPassable(c, r) { return global.Maze.isWalkableGhost(c, r, false); }

  /** Ghosts that can currently kill this player. */
  function hunters(game, pac) {
    return game.ghosts.filter(function (g) {
      if (g.state !== 'normal') return false;
      if (g.frightened) return false;
      if (game.ghostsFlee && pac.armedOwner) return false;   // rampage: they run
      return true;
    });
  }

  function edible(game) {
    return game.ghosts.filter(function (g) {
      return g.state === 'normal' && g.frightened;
    });
  }

  /**
   * Decide which way this player should turn.
   * @param {number} [skill] 0..1; below 1 the agent sometimes takes the second
   *   best route, which is what makes the bot opponent feel human.
   * @return {string|null} a direction, or null to keep going
   */
  function choose(game, pac, skill) {
    var Maze = global.Maze;
    var c = wrapCol(tileOf(pac.x)), r = tileOf(pac.y);
    if (!inBounds(r)) return null;

    // Threat first, so the route search can refuse to walk through a tile a
    // ghost would reach at the same time. Checking only the destination is not
    // enough - that is how you get eaten halfway down a corridor.
    var hunt = hunters(game, pac);
    threat.fill(INF);
    for (var h = 0; h < hunt.length; h++) {
      var g = hunt[h];
      var gc = wrapCol(tileOf(g.x)), gr = tileOf(g.y);
      if (!inBounds(gr)) continue;
      // A ghost cannot turn round, so danger must not spread back through the
      // tile behind it. Without this the map invents threat in places the
      // ghost can never reach, and the agent gives up safe ground for nothing.
      var v = DIRV[g.dir] || [0, 0];
      var behind = idx(wrapCol(gc - v[0]), Math.max(0, Math.min(ROWS - 1, gr - v[1])));
      var seeds = [[gc, gr]];
      if (Maze.isWalkableGhost(wrapCol(gc + v[0]), gr + v[1], false)) {
        seeds.push([wrapCol(gc + v[0]), gr + v[1]]);
      }
      flood(seeds, ghostPassable, ghostDist, null,
            (v[0] || v[1]) ? function (i) { return i !== behind; } : null);
      for (var i = 0; i < SIZE; i++) {
        if (ghostDist[i] < threat[i]) threat[i] = ghostDist[i];
      }
    }

    // A tile is ours only if we clearly get there first, and the whole route
    // has to hold up, not just its end. If nothing at all is reachable under
    // the strict margin the standard drops a step at a time - otherwise the
    // last few pellets in a contested corner never get taken and the level
    // simply never ends.
    var chase = edible(game);
    var dots = game.dots;
    var best = null, bestScore = -INF, second = null, secondScore = -INF;

    function offer(i, value) {
      if (pacDist[i] === INF || pacStep[i] < 0) return;
      var score = value / (pacDist[i] + 1);
      if (score > bestScore) {
        second = best; secondScore = bestScore;
        best = DIRS[pacStep[i]]; bestScore = score;
      } else if (score > secondScore) {
        second = DIRS[pacStep[i]]; secondScore = score;
      }
    }

    // How hard is a hunter leaning on us right now?
    var pressure = 0;
    for (var t = 0; t < hunt.length; t++) {
      var hx = hunt[t].x - pac.x, hy = hunt[t].y - pac.y;
      if (Math.abs(hx) + Math.abs(hy) < 70) pressure++;
    }
    // Near the end of a maze the remaining pellets are worth pushing for.
    var urgency = game.dotsRemaining <= 12 ? 6 : 1;

    var MARGINS = [4, 2, 1, 0];
    for (var mi = 0; mi < MARGINS.length && best === null; mi++) {
      var margin = MARGINS[mi];
      flood([[c, r]], pacPassable, pacDist, pacStep,
            (function (m) {
              return function (i, d) { return threat[i] - d > m; };
            })(margin));

      // Edible ghosts outrank everything while the timer runs.
      if (chase.length && game.frightTimer > 0.6) {
        for (var e = 0; e < chase.length; e++) {
          var eg = chase[e];
          var ei = idx(wrapCol(tileOf(eg.x)), tileOf(eg.y));
          if (pacDist[ei] !== INF && pacDist[ei] < game.frightTimer * 7) offer(ei, 260);
        }
      }

      for (var rr = 0; rr < ROWS; rr++) {
        var row = dots[rr];
        for (var cc2 = 0; cc2 < COLS; cc2++) {
          var d2 = row[cc2];
          if (!d2) continue;
          offer(idx(cc2, rr), d2 === 2 ? (pressure ? 190 : 34) : 10 * urgency);
        }
      }

      if (game.fruit) offer(idx(13, 17), 120);
    }

    if (best === null) return escapeDirection(game, pac, c, r);

    // Whatever the plan says, never take a step onto a tile a ghost is about
    // to stand on. If the first move is contested, treat it as no plan at all.
    if (best && !stepIsSafe(c, r, best)) {
      if (second && stepIsSafe(c, r, second)) return second;
      return escapeDirection(game, pac, c, r);
    }

    // Deliberate imperfection for the bot opponent.
    if (skill !== undefined && skill < 1 && second && Math.random() > skill) return second;
    return best;
  }

  /** True if stepping this way does not walk straight into a ghost's next tile. */
  function stepIsSafe(c, r, dir) {
    var v = DIRV[dir];
    var nc = wrapCol(c + v[0]), nr = r + v[1];
    if (!inBounds(nr)) return false;
    return threat[idx(nc, nr)] > 1;
  }

  /** Run for the opening that buys the most time, avoiding dead ends. */
  function escapeDirection(game, pac, c, r) {
    var Maze = global.Maze;
    var escape = null, escapeScore = -INF;
    for (var k = 0; k < DIRS.length; k++) {
      var v = DIRV[DIRS[k]];
      var nc = wrapCol(c + v[0]), nr = r + v[1];
      if (!inBounds(nr) || !Maze.isWalkable(nc, nr)) continue;
      var ni = idx(nc, nr);
      var margin = threat[ni] === INF ? 99 : threat[ni] - 1;
      var ways = 0;
      for (var k2 = 0; k2 < DIRS.length; k2++) {
        var v2 = DIRV[DIRS[k2]];
        if (Maze.isWalkable(wrapCol(nc + v2[0]), nr + v2[1])) ways++;
      }
      var sc = margin * 4 + ways;                        // room to keep running
      if (DIRS[k] === OPPOSITE[pac.dir]) sc -= 1;        // mild bias forward
      if (sc > escapeScore) { escapeScore = sc; escape = DIRS[k]; }
    }
    return escape;
  }

  /** Drive a player object; call once per tick. */
  function drive(game, pac, skill) {
    var c = wrapCol(tileOf(pac.x)), r = tileOf(pac.y);
    // Re-plan on every new tile, and again whenever the nearest hunter crosses
    // into a closer band - waiting for the next tile can be one tile too late.
    var near = 99;
    for (var i = 0; i < game.ghosts.length; i++) {
      var gh = game.ghosts[i];
      if (gh.state !== 'normal' || gh.frightened) continue;
      var d = Math.abs(gh.x - pac.x) + Math.abs(gh.y - pac.y);
      if (d < near) near = d;
    }
    var band = Math.min(6, Math.floor(near / 16));
    var key = c + ',' + r + ':' + band;
    // Re-plan on a new tile, when the nearest hunter changes band, or every few
    // ticks regardless - a stale plan is what gets you cornered.
    pac.autoAge = (pac.autoAge || 0) + 1;
    if (pac.autoTile === key && pac.autoAge < 4) return;
    pac.autoTile = key;
    pac.autoAge = 0;
    var dir = choose(game, pac, skill);
    if (dir) pac.want = dir;
  }

  global.Autopilot = { choose: choose, drive: drive };
})(window);
