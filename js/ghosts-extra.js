/* Four extra ghosts, each with its own chase rule, its own scatter patrol and
 * its own quarter of the maze. They plug into the existing ghost pipeline:
 * frightened and eaten are handled by the core, so only the chase and scatter
 * targets are supplied here. The original four are not touched.
 */
(function (global) {
  'use strict';

  var STORE_KEY = 'pacman.ghosts.v1';
  var TILE = 8;
  var DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  /* Patrol routes were sampled from the maze itself, so every waypoint is a
     real corridor tile inside that ghost's quarter. */
  var ROSTER = [
    {
      id: 'lumo', name: 'LUMO', nick: 'THE AMBUSHER', role: 'AMBUSHER',
      colorName: 'LIME', color: '#7cff3c',
      blurb: 'CUTS IN FRONT OF YOU',
      region: 'UPPER LEFT',
      start: { x: 80, y: 11 * TILE + 4 },          // upper-left of the chamber
      home: { x: 96, y: 14 * TILE + 4 },
      waitDots: 12,
      patrol: [[1, 1], [6, 2], [12, 1], [5, 8], [13, 11]]
    },
    {
      id: 'vexa', name: 'VEXA', nick: 'THE FLANKER', role: 'FLANKER',
      colorName: 'PURPLE', color: '#b24bff',
      blurb: 'SWINGS ROUND YOUR SIDE',
      region: 'UPPER RIGHT',
      start: { x: 144, y: 11 * TILE + 4 },
      home: { x: 128, y: 14 * TILE + 4 },
      waitDots: 34,
      patrol: [[15, 1], [20, 5], [26, 3], [21, 13], [14, 11]]
    },
    {
      id: 'grimm', name: 'GRIMM', nick: 'THE TRAPPER', role: 'TRAPPER',
      colorName: 'GREY', color: '#9c9cac',
      blurb: 'WAITS AT YOUR JUNCTION',
      region: 'LOWER LEFT',
      start: { x: 80, y: 17 * TILE + 4 },          // lower chamber, left side
      home: { x: 112, y: 14 * TILE + 4 },
      waitDots: 58,
      patrol: [[1, 20], [8, 23], [13, 29], [3, 29], [13, 17]]
    },
    {
      id: 'nox', name: 'NOX', nick: 'THE STALKER', role: 'STALKER',
      colorName: 'DARK BLUE', color: '#2e5cc8',
      blurb: 'STALKS, THEN LUNGES',
      region: 'LOWER RIGHT',
      start: { x: 144, y: 17 * TILE + 4 },
      home: { x: 112, y: 14 * TILE + 4 },
      waitDots: 82,
      patrol: [[14, 17], [17, 23], [14, 29], [26, 29], [23, 20]]
    }
  ];

  var enabled = {};
  ROSTER.forEach(function (d) { enabled[d.id] = false; });

  function loadState() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      ROSTER.forEach(function (d) { if (d.id in raw) enabled[d.id] = !!raw[d.id]; });
    } catch (e) { /* first run, or storage blocked */ }
  }
  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(enabled)); }
    catch (e) { /* private mode */ }
  }

  function byId(id) {
    for (var i = 0; i < ROSTER.length; i++) if (ROSTER[i].id === id) return ROSTER[i];
    return null;
  }
  function isOn(id) { return !!enabled[id]; }
  function activeCount() {
    return ROSTER.filter(function (d) { return enabled[d.id]; }).length;
  }

  /* ---- shared helpers ------------------------------------------------ */

  var Maze = null;
  function maze() { return Maze || (Maze = global.Maze); }
  function wrapCol(c) { var n = maze().COLS; return ((c % n) + n) % n; }
  function tileOf(px) { return Math.floor(px / TILE); }
  function ghostTile(g) { return { c: wrapCol(tileOf(g.x)), r: tileOf(g.y) }; }
  function pacTile(game) {
    return { c: wrapCol(tileOf(game.pac.x)), r: tileOf(game.pac.y) };
  }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function walkable(c, r) { return maze().isWalkable(wrapCol(c), r); }

  /** Walkable neighbours; 3 or more means a junction Pac-Man can turn at. */
  function exits(c, r) {
    var n = 0;
    for (var k in DIRV) {
      var v = DIRV[k];
      if (walkable(c + v[0], r + v[1])) n++;
    }
    return n;
  }

  /** Straight-line projection down the corridor Pac-Man faces. */
  function project(game, limit) {
    var p = pacTile(game), v = DIRV[game.pac.dir] || [0, 0];
    var c = p.c, r = p.r, last = { c: c, r: r };
    for (var i = 0; i < limit; i++) {
      var nc = wrapCol(c + v[0]), nr = r + v[1];
      if (!walkable(nc, nr)) break;
      c = nc; r = nr;
      last = { c: c, r: r };
    }
    return last;
  }

  /**
   * Trace the route Pac-Man is most likely to take, following the corridor
   * around bends rather than stopping at the first wall. At a fork it keeps
   * going straight; only a dead end stops it. This is Lumo's lookahead - it
   * puts him on Pac-Man's path, not merely in his line of sight.
   */
  function projectFollowing(game, limit) {
    var p = pacTile(game), v = DIRV[game.pac.dir] || [1, 0];
    var c = p.c, r = p.r;
    var back = [-v[0], -v[1]];
    for (var i = 0; i < limit; i++) {
      if (walkable(c + v[0], r + v[1])) {
        back = [-v[0], -v[1]];
        c = wrapCol(c + v[0]); r = r + v[1];
        continue;
      }
      // Blocked ahead: take the single onward turn, if there is exactly one.
      var turns = [];
      for (var k in DIRV) {
        var t = DIRV[k];
        if (t[0] === back[0] && t[1] === back[1]) continue;
        if (walkable(c + t[0], r + t[1])) turns.push(t);
      }
      if (turns.length !== 1) break;
      v = turns[0];
      back = [-v[0], -v[1]];
      c = wrapCol(c + v[0]); r = r + v[1];
    }
    return { c: c, r: r };
  }

  /**
   * The junction Pac-Man is running towards, ignoring any that is right on
   * top of him - Grimm sets his trap further out than Lumo's lead.
   */
  function nextJunction(game, minAway, limit) {
    var p = pacTile(game), v = DIRV[game.pac.dir] || [0, 0];
    var c = p.c, r = p.r, last = { c: c, r: r };
    for (var i = 1; i <= limit; i++) {
      var nc = wrapCol(c + v[0]), nr = r + v[1];
      if (!walkable(nc, nr)) break;
      c = nc; r = nr;
      last = { c: c, r: r };
      if (i >= minAway && exits(c, r) >= 3) return { c: c, r: r, junction: true };
    }
    return last;                          // corridor with no junction: far end
  }

  function otherGhosts(game, self) {
    return game.ghosts.filter(function (o) {
      return o !== self && o.state === 'normal' && !o.frightened;
    });
  }

  function isClosestGhost(game, self) {
    var p = pacTile(game), me = ghostTile(self);
    var mine = dist2(me.c, me.r, p.c, p.r);
    var others = otherGhosts(game, self);
    for (var i = 0; i < others.length; i++) {
      var o = ghostTile(others[i]);
      if (dist2(o.c, o.r, p.c, p.r) < mine) return false;
    }
    return true;
  }

  /* ---- chase rules, one per ghost ------------------------------------ */

  var CHASE = {
    /* Lumo runs the corridor ahead of Pac-Man rather than adding a blind
       offset, so his target is always somewhere Pac-Man can actually be. */
    lumo: function (game, g) {
      var p = pacTile(game), me = ghostTile(g);
      if (dist2(me.c, me.r, p.c, p.r) <= 16) return p;   // within 4 tiles: close in
      // Five, not Pinky's four: in a straight corridor the two would otherwise
      // pick the same tile. Round a bend they diverge completely, because this
      // one follows the corridor and Pinky's lands in the wall.
      return projectFollowing(game, 5);
    },

    /* Vexa comes in off to one side, and picks the side the rest of the pack
       is not already covering. Nearest ghost drops the flank and commits. */
    vexa: function (game, g) {
      var p = pacTile(game);
      if (isClosestGhost(game, g)) return p;
      var v = DIRV[game.pac.dir] || [1, 0];
      var perp = [-v[1], v[0]];
      var pack = otherGhosts(game, g).map(ghostTile);
      var best = null, bestScore = -Infinity;
      for (var s = -1; s <= 1; s += 2) {
        var cand = { c: p.c + perp[0] * 4 * s + v[0] * 2, r: p.r + perp[1] * 4 * s + v[1] * 2 };
        // Prefer the flank furthest from every other hunting ghost.
        var score = Infinity;
        for (var i = 0; i < pack.length; i++) {
          score = Math.min(score, dist2(cand.c, cand.r, pack[i].c, pack[i].r));
        }
        if (!pack.length) score = 0;
        if (score > bestScore) { bestScore = score; best = cand; }
      }
      return best;
    },

    /* Grimm heads for the junction Pac-Man is running towards. In a corridor
       with no junction he takes the far end and waits there. */
    grimm: function (game, g) {
      return nextJunction(game, 4, 14);
    },

    /* Nox alternates: hunt until he is on top of Pac-Man, then peel away and
       reposition until there is room to come back in. */
    nox: function (game, g) {
      var p = pacTile(game), me = ghostTile(g);
      var d = dist2(me.c, me.r, p.c, p.r);
      if (g.stalk === 'back') {
        if (d >= 100) g.stalk = 'hunt';        // 10 tiles of daylight
      } else if (d <= 16) {
        g.stalk = 'back';                      // 4 tiles: too close, peel off
      }
      if (g.stalk === 'back') {
        return { c: maze().COLS - 1 - p.c, r: maze().ROWS - 1 - p.r };
      }
      // Hunting is a three-beat cycle, so he is only charging straight at
      // Pac-Man a third of the time - the rest he is cutting ahead or coming
      // up from behind. That, the hysteresis above and the route penalty are
      // what separate him from Blinky.
      var beat = Math.floor(game.globalTime / 2.5) % 3;
      if (beat === 0) return p;                       // straight at him
      if (beat === 1) return project(game, 3);        // cut in ahead
      var v = DIRV[game.pac.dir] || [0, 0];           // creep up behind
      return { c: p.c - v[0] * 2, r: p.r - v[1] * 2 };
    }
  };

  var SCATTER = {};
  ROSTER.forEach(function (def) {
    /* Every scatter rule is the same shape - walk this ghost's own loop of
       waypoints - but each ghost owns a different quarter of the maze. */
    SCATTER[def.id] = function (game, g) {
      if (g.patrolIndex === undefined) g.patrolIndex = 0;
      var me = ghostTile(g);
      var pt = def.patrol[g.patrolIndex % def.patrol.length];
      if (dist2(me.c, me.r, pt[0], pt[1]) <= 2) {
        g.patrolIndex = (g.patrolIndex + 1) % def.patrol.length;
        pt = def.patrol[g.patrolIndex];
      }
      return { c: pt[0], r: pt[1] };
    };
  });

  function chaseTarget(game, g) { return CHASE[g.ai](game, g); }
  function scatterTarget(game, g) { return SCATTER[g.ai](game, g); }

  /**
   * Extra cost a ghost puts on a candidate tile. Only Nox uses it, to keep
   * from wearing the same groove in the maze over and over.
   */
  function pathPenalty(g, c, r) {
    // Only while hunting. A ghost heading home after being eaten must take the
    // shortest way back, or it circles the house forever.
    if (g.ai !== 'nox' || g.state !== 'normal' || g.frightened || !g.recent) return 0;
    return g.recent.indexOf(wrapCol(c) + ',' + r) >= 0 ? 9 : 0;
  }

  function noteTile(g, c, r) {
    if (g.ai !== 'nox') return;
    if (!g.recent) g.recent = [];
    g.recent.push(wrapCol(c) + ',' + r);
    if (g.recent.length > 6) g.recent.shift();
  }

  /* ---- roster construction ------------------------------------------- */

  /** Ghost objects for every enabled extra, appended after the original four. */
  function build() {
    return ROSTER.filter(function (d) { return enabled[d.id]; }).map(function (d) {
      return {
        name: d.id, ai: d.id, extra: true,
        x: d.start.x, y: d.start.y,
        dir: 'left',
        scatter: { c: d.patrol[0][0], r: d.patrol[0][1] },
        home: { x: d.home.x, y: d.home.y },
        state: 'waiting',          // holds position until enough dots are eaten
        frightened: false, bob: 0,
        dotCounter: 0, dotLimit: 0,
        waitDots: d.waitDots,
        patrolIndex: 0, stalk: 'hunt', recent: [],
        waypoints: null
      };
    });
  }

  /** Release any waiting extras whose dot threshold has been passed. */
  function releaseWaiting(game, force) {
    for (var i = 0; i < game.ghosts.length; i++) {
      var g = game.ghosts[i];
      if (g.state !== 'waiting') continue;
      if (force || game.dotsEaten >= g.waitDots) {
        g.state = 'normal';
        g.dir = 'left';
      }
    }
  }

  global.ExtraGhosts = {
    ROSTER: ROSTER,
    isOn: isOn,
    setOn: function (id, on) { enabled[id] = !!on; saveState(); },
    toggle: function (id) { enabled[id] = !enabled[id]; saveState(); return enabled[id]; },
    activeCount: activeCount,
    byId: byId,
    build: build,
    releaseWaiting: releaseWaiting,
    chaseTarget: chaseTarget,
    scatterTarget: scatterTarget,
    pathPenalty: pathPenalty,
    noteTile: noteTile,
    load: loadState
  };

  loadState();
})(window);
