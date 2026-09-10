/* The playing AI.
 *
 * It does not replay memorised patterns. Every few frames it rebuilds a
 * picture of the next couple of seconds and re-plans from scratch:
 *
 *   1. Ghost prediction. Each hunting ghost is cloned and rolled forward
 *      through the game's own decideGhost - the real targeting rule, the real
 *      no-reverse and no-turn-up restrictions - so the agent knows where each
 *      ghost is actually going, not merely where it could go. That prediction
 *      is blended with a reachability envelope so a ghost changing its mind
 *      still costs something rather than being a surprise.
 *   2. Contested tiles. A tile is only ours if we arrive first by a margin,
 *      measured in Pac-Man tile-steps, with each ghost's real speed folded in
 *      so Cruise Elroy reads as fast and a ghost in the tunnel reads as slow.
 *      The route search is gated on that map, so it never paths *through* a
 *      contested tile, only to one.
 *   3. Room. The same flood tallies how much of the maze stays reachable
 *      behind each opening, which is what stops it walking into a pocket that
 *      is about to be sealed.
 *   4. Value. Pellets, fruit and edible ghosts by distance - and energisers on
 *      their own policy, because spending one with nobody near is the single
 *      most expensive mistake available.
 */
(function (global) {
  'use strict';

  var DIRS = ['up', 'left', 'down', 'right'];
  var DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  var OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

  var COLS = 28, ROWS = 31, TILE = 8;
  var SIZE = COLS * ROWS;
  var INF = 1e9;

  /* How far ahead each ghost is simulated, in ghost tiles. Far enough to see a
     pincer forming, short enough that the prediction is still worth trusting. */
  var HORIZON = 16;
  /* Cost added to a tile a ghost can reach but is not currently heading for. */
  var DIVERGENCE = 4;

  function idx(c, r) { return r * COLS + c; }
  function wrapCol(c) { return ((c % COLS) + COLS) % COLS; }
  function tileOf(px) { return Math.floor(px / TILE); }
  function inBounds(r) { return r >= 0 && r < ROWS; }

  // Scratch buffers, reused so a decision allocates almost nothing.
  var pacDist = new Int32Array(SIZE);
  var pacStep = new Int8Array(SIZE);      // index into DIRS of the first move
  var ghostDist = new Int32Array(SIZE);
  var predicted = new Float64Array(SIZE);
  var threat = new Float64Array(SIZE);
  var queue = new Int32Array(SIZE);
  var room = [0, 0, 0, 0];

  /**
   * Flood the maze from one or more sources.
   * @param {function} passable (c, r) -> boolean
   * @param {Int32Array} dist filled with step counts, INF where unreachable
   * @param {Int8Array} [step] first-move direction index, for path recovery
   * @param {function} [gate] (tileIndex, dist) -> boolean, refuses a tile
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
      if (g.state !== 'normal' || g.frightened) return false;
      if (game.ghostsFlee && pac.armedOwner) return false;   // rampage: they run
      return true;
    });
  }

  function edible(game) {
    return game.ghosts.filter(function (g) {
      return g.state === 'normal' && g.frightened;
    });
  }

  /* ---- knowing the ghosts ------------------------------------------- */

  /* A stand-in ghost the game's own decideGhost can steer without any of it
     reaching the real one. Everything decideGhost writes - dir, focusId, the
     stalk and patrol state of the extra ghosts, the recent-tile list - lands
     on this copy. */
  function cloneGhost(g) {
    var c = wrapCol(tileOf(g.x)), r = tileOf(g.y);
    return {
      name: g.name, ai: g.ai, state: g.state, frightened: false,
      x: c * TILE + 4, y: r * TILE + 4, dir: g.dir,
      scatter: g.scatter, home: g.home,
      focusId: g.focusId, stalk: g.stalk, patrolIndex: g.patrolIndex,
      recent: g.recent ? g.recent.slice() : []
    };
  }

  /**
   * Roll a ghost forward through its real decision rule.
   * @param {Float64Array} out arrival step per tile, in ghost tiles
   */
  function predictGhost(game, g, out) {
    out.fill(INF);
    var sim = cloneGhost(g);
    for (var s = 1; s <= HORIZON; s++) {
      game.decideGhost(sim);
      var v = DIRV[sim.dir];
      if (!v) break;
      var nc = wrapCol(tileOf(sim.x) + v[0]);
      var nr = tileOf(sim.y) + v[1];
      if (!inBounds(nr) || !global.Maze.isWalkableGhost(nc, nr, false)) break;
      sim.x = nc * TILE + 4;
      sim.y = nr * TILE + 4;
      var i = idx(nc, nr);
      if (s < out[i]) out[i] = s;
    }
  }

  /* ---- the decision --------------------------------------------------- */

  /**
   * @param {number} [skill] 0..1; below 1 the agent sometimes takes the second
   *   best route, which is what makes the bot opponent feel human.
   * @return {string|null} a direction, or null to keep going
   */
  function choose(game, pac, skill) {
    var Maze = global.Maze;
    var c = wrapCol(tileOf(pac.x)), r = tileOf(pac.y);
    if (!inBounds(r)) return null;

    var hunt = hunters(game, pac);
    var pacSpd = game.pacSpeed ? game.pacSpeed(pac) : 1;

    // Energiser tiles, and how many hunters are loitering near each.
    var energisers = [], nearCount = [];
    for (var er = 0; er < ROWS; er++) {
      for (var ec = 0; ec < COLS; ec++) {
        if (game.dots[er][ec] === 2) { energisers.push(idx(ec, er)); nearCount.push(0); }
      }
    }

    threat.fill(INF);
    for (var h = 0; h < hunt.length; h++) {
      var g = hunt[h];
      var gc = wrapCol(tileOf(g.x)), gr = tileOf(g.y);
      if (!inBounds(gr)) continue;

      // Ghost tiles per Pac-Man tile. Elroy runs hot, the tunnel runs cold.
      var ratio = (game.ghostSpeed ? game.ghostSpeed(g) : pacSpd) / pacSpd;
      if (!(ratio > 0.05)) ratio = 0.05;

      // A ghost cannot turn round, so danger must not spread back through the
      // tile behind it - otherwise the map invents threat it can never deliver.
      var v = DIRV[g.dir] || [0, 0];
      var behind = idx(wrapCol(gc - v[0]),
                       Math.max(0, Math.min(ROWS - 1, gr - v[1])));
      var seeds = [[gc, gr]];
      if (Maze.isWalkableGhost(wrapCol(gc + v[0]), gr + v[1], false)) {
        seeds.push([wrapCol(gc + v[0]), gr + v[1]]);
      }
      flood(seeds, ghostPassable, ghostDist, null,
            (v[0] || v[1]) ? function (i) { return i !== behind; } : null);

      predictGhost(game, g, predicted);

      for (var i = 0; i < SIZE; i++) {
        if (ghostDist[i] === INF) continue;
        var env = ghostDist[i] / ratio;
        // On its predicted route it arrives when it arrives; anywhere else it
        // would first have to change its mind, which costs it.
        var t = predicted[i] === INF ? env + DIVERGENCE
                                     : Math.min(env, predicted[i] / ratio);
        if (t < threat[i]) threat[i] = t;
      }

      for (var k = 0; k < energisers.length; k++) {
        if (ghostDist[energisers[k]] <= 9) nearCount[k]++;
      }
    }

    var chase = edible(game);
    var dots = game.dots;
    var best = null, bestScore = -INF, second = null, secondScore = -INF;

    // How many hunters are actually leaning on us right now?
    var pressure = 0;
    for (var t2 = 0; t2 < hunt.length; t2++) {
      var hx = hunt[t2].x - pac.x, hy = hunt[t2].y - pac.y;
      if (Math.abs(hx) + Math.abs(hy) < 72) pressure++;
    }
    var urgency = game.dotsRemaining <= 12 ? 6 : 1;

    /* Two or more hunters converging is the trap that actually kills. Measured
       over live play that state holds about a tenth of the time yet accounts
       for the large majority of deaths, so it is treated as an emergency
       rather than as pellet collection at a tighter margin: stop valuing food
       and go wherever leaves the most daylight on arrival. A reachable
       energiser is the best exit there is, which is also exactly the moment
       spending one pays for itself. */
    if (pressure >= 2 && game.frightTimer <= 0.6) {
      flood([[c, r]], pacPassable, pacDist, pacStep,
            function (ti, d) { return threat[ti] - d > 0; });
      var eBest = null, eScore = -INF, eSecond = null, eSecondScore = -INF;
      for (var si = 0; si < SIZE; si++) {
        if (pacDist[si] === INF || pacStep[si] < 0) continue;
        var sc2 = si % COLS, sr2 = (si - sc2) / COLS;
        // Daylight on arrival, lightly discounted by how far off it is.
        var sc = (threat[si] - pacDist[si]) - pacDist[si] * 0.06;
        if (dots[sr2][sc2] === 2) sc += 14;             // the way out
        if (sc > eScore) {
          eSecond = eBest; eSecondScore = eScore;
          eBest = DIRS[pacStep[si]]; eScore = sc;
        } else if (sc > eSecondScore) {
          eSecond = DIRS[pacStep[si]]; eSecondScore = sc;
        }
      }
      if (eBest && stepIsSafe(c, r, eBest)) return eBest;
      if (eSecond && stepIsSafe(c, r, eSecond)) return eSecond;
      return escapeDirection(game, pac, c, r);
    }

    /* Energisers are the one resource worth hoarding. Spending one with nobody
       around throws away the only window in which the ghosts are worth points
       and the maze is safe to cross. */
    function energiserValue(k) {
      if (game.frightTimer > 0.6) return 1;            // already blue, save it
      if (nearCount[k] >= 2) return 420;               // a real chain is on
      if (nearCount[k] === 1 && pressure) return 240;  // buy an escape with it
      if (game.dotsRemaining <= 8) return 90;          // needed to finish up
      return 4;                                         // otherwise leave it
    }

    function offer(i, value, factor) {
      if (pacDist[i] === INF || pacStep[i] < 0) return;
      var score = value / (pacDist[i] + 1) * factor(pacStep[i]);
      if (score > bestScore) {
        second = best; secondScore = bestScore;
        best = DIRS[pacStep[i]]; bestScore = score;
      } else if (score > secondScore) {
        second = DIRS[pacStep[i]]; secondScore = score;
      }
    }

    /* If nothing at all is reachable under the strict margin the standard drops
       a step at a time - otherwise the last pellets in a contested corner never
       get taken and the level simply never ends. */
    var MARGINS = [4, 2, 1];
    for (var mi = 0; mi < MARGINS.length && best === null; mi++) {
      var margin = MARGINS[mi];
      flood([[c, r]], pacPassable, pacDist, pacStep,
            (function (m) {
              return function (ti, d) { return threat[ti] - d > m; };
            })(margin));

      // How much maze is still ours behind each opening? A move that leaves
      // almost nothing reachable is a pocket waiting to be sealed.
      room[0] = room[1] = room[2] = room[3] = 0;
      for (var ri = 0; ri < SIZE; ri++) {
        if (pacDist[ri] !== INF && pacStep[ri] >= 0) room[pacStep[ri]]++;
      }
      var roomFactor = function (stepIdx) {
        return Math.max(0.3, Math.min(1, room[stepIdx] / 22));
      };

      // Edible ghosts outrank everything while the timer runs.
      if (chase.length && game.frightTimer > 0.6) {
        for (var e = 0; e < chase.length; e++) {
          var eg = chase[e];
          var ei = idx(wrapCol(tileOf(eg.x)), tileOf(eg.y));
          if (pacDist[ei] !== INF && pacDist[ei] < game.frightTimer * 7) {
            offer(ei, 300, roomFactor);
          }
        }
      }

      for (var rr = 0; rr < ROWS; rr++) {
        var row = dots[rr];
        for (var cc = 0; cc < COLS; cc++) {
          var d2 = row[cc];
          if (!d2) continue;
          if (d2 === 2) continue;                       // handled below
          offer(idx(cc, rr), 10 * urgency, roomFactor);
        }
      }
      for (var k2 = 0; k2 < energisers.length; k2++) {
        offer(energisers[k2], energiserValue(k2), roomFactor);
      }

      if (game.fruit) offer(idx(13, 17), 120, roomFactor);
    }

    if (best === null) return escapeDirection(game, pac, c, r);

    // Whatever the plan says, never step onto a tile a ghost is about to stand
    // on. If the first move is contested, treat it as no plan at all.
    if (!stepIsSafe(c, r, best)) {
      if (second && stepIsSafe(c, r, second)) return second;
      return escapeDirection(game, pac, c, r);
    }

    // Last check: play the choice out against ghosts that react to it, and
    // override only if that gets him killed almost immediately.
    var HZ = 8;
    if (hunt.length && rollout(game, pac, best, hunt, HZ) < 4) {
      var safest = null, safestSteps = -1;
      for (var fi = 0; fi < DIRS.length; fi++) {
        var fv = DIRV[DIRS[fi]];
        if (!Maze.isWalkable(wrapCol(c + fv[0]), r + fv[1])) continue;
        var lived = rollout(game, pac, DIRS[fi], hunt, HZ);
        if (DIRS[fi] === best) lived += 0.5;               // tie goes to the plan
        if (lived > safestSteps) { safestSteps = lived; safest = DIRS[fi]; }
      }
      if (safest) return safest;
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

  /**
   * Play the next few tiles out for real and see whether it survives.
   *
   * The flood only asks who reaches a tile first. This asks the harder
   * question: if I commit this way, and the ghosts re-target me as I go -
   * through their own decideGhost, reading my simulated position - am I still
   * alive a few tiles later? That is the difference between a route that looks
   * open and one that is about to be closed behind me.
   *
   * Pac-Man is stood at each simulated tile while the ghosts decide, then put
   * back exactly where he was. Nothing else is touched.
   *
   * The stand-in Pac-Man used here is crude - straight on until blocked, then
   * the turn that keeps most room - so this is only trusted over a short
   * horizon. Letting it overrule the planner whenever it predicted any death
   * inside eight tiles measured far worse than not having it at all; as a veto
   * on imminent death it is worth about a tenth of a death per minute.
   *
   * @return {number} tiles survived, up to `steps`
   */
  function rollout(game, pac, dir, hunt, steps) {
    var Maze = global.Maze;
    var sx = pac.x, sy = pac.y, sdir = pac.dir;
    var sims = [];
    for (var i = 0; i < hunt.length; i++) sims.push(cloneGhost(hunt[i]));
    var pc = wrapCol(tileOf(pac.x)), pr = tileOf(pac.y);
    var cur = dir, survived = 0;
    try {
      for (var s = 1; s <= steps; s++) {
        var v = DIRV[cur];
        var nc = wrapCol(pc + v[0]), nr = pr + v[1];
        if (!inBounds(nr) || !Maze.isWalkable(nc, nr)) {
          var alt = null, altScore = -INF;
          for (var k = 0; k < DIRS.length; k++) {
            if (DIRS[k] === OPPOSITE[cur]) continue;
            var w = DIRV[DIRS[k]];
            var ac = wrapCol(pc + w[0]), ar = pr + w[1];
            if (!inBounds(ar) || !Maze.isWalkable(ac, ar)) continue;
            var near = INF;
            for (var q = 0; q < sims.length; q++) {
              var d0 = Math.abs(wrapCol(tileOf(sims[q].x)) - ac) +
                       Math.abs(tileOf(sims[q].y) - ar);
              if (d0 < near) near = d0;
            }
            if (near > altScore) { altScore = near; alt = DIRS[k]; }
          }
          if (!alt) break;                       // boxed in
          cur = alt; v = DIRV[cur];
          nc = wrapCol(pc + v[0]); nr = pr + v[1];
        }
        pc = nc; pr = nr;
        pac.x = pc * TILE + 4; pac.y = pr * TILE + 4; pac.dir = cur;

        for (var m = 0; m < sims.length; m++) {
          var sim = sims[m];
          game.decideGhost(sim);
          var gv = DIRV[sim.dir];
          if (!gv) continue;
          var gc = wrapCol(tileOf(sim.x) + gv[0]), gr = tileOf(sim.y) + gv[1];
          if (!inBounds(gr) || !Maze.isWalkableGhost(gc, gr, false)) continue;
          sim.x = gc * TILE + 4; sim.y = gr * TILE + 4;
          if (gc === pc && gr === pr) return survived;      // caught
        }
        survived = s;
      }
    } finally {
      pac.x = sx; pac.y = sy; pac.dir = sdir;
    }
    return survived;
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
      // Count how far we could still run this way before being boxed in.
      flood([[nc, nr]], pacPassable, pacDist, null,
            (function (t0) {
              return function (ti, d) { return threat[ti] - (d + 1) > 0; };
            })(margin));
      var space = 0;
      for (var si = 0; si < SIZE; si++) if (pacDist[si] !== INF) space++;
      var sc = margin * 5 + Math.min(space, 40);
      if (DIRS[k] === OPPOSITE[pac.dir]) sc -= 2;        // mild bias forward
      if (sc > escapeScore) { escapeScore = sc; escape = DIRS[k]; }
    }
    return escape;
  }

  /** Drive a player object; call once per tick. */
  function drive(game, pac, skill) {
    var c = wrapCol(tileOf(pac.x)), r = tileOf(pac.y);
    // Re-plan on every new tile, whenever the nearest hunter crosses into a
    // closer band, and every few ticks regardless - a stale plan is what gets
    // you cornered.
    var near = 99;
    for (var i = 0; i < game.ghosts.length; i++) {
      var gh = game.ghosts[i];
      if (gh.state !== 'normal' || gh.frightened) continue;
      var d = Math.abs(gh.x - pac.x) + Math.abs(gh.y - pac.y);
      if (d < near) near = d;
    }
    var band = Math.min(6, Math.floor(near / 16));
    var key = c + ',' + r + ':' + band;
    pac.autoAge = (pac.autoAge || 0) + 1;
    if (pac.autoTile === key && pac.autoAge < 4) return;
    pac.autoTile = key;
    pac.autoAge = 0;
    var dir = choose(game, pac, skill);
    if (dir) pac.want = dir;
  }

  global.Autopilot = { choose: choose, drive: drive };
})(window);
