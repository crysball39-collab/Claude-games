/* Pac-Man. Timings, speeds, targeting and release rules follow the original
   1980 Namco arcade board as documented in The Pac-Man Dossier. */
(function (global) {
  'use strict';

  var Maze = global.Maze, Font = global.Font,
      Sprites = global.Sprites, Sound = global.Sound, Mods = global.Mods,
      Extra = global.ExtraGhosts, Auto = global.Autopilot, MP = global.Multiplayer;

  var TILE = Maze.TILE;
  var COLS = Maze.COLS;
  // The arcade's video refresh. At 100% speed a character advances exactly
  // 1.25 pixels per frame, i.e. the documented 75.7575 pixels per second.
  var TICK = 1 / 60.606060;
  var BASE_SPEED = 1.25;

  var DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  var OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
  var TURN_ORDER = ['up', 'left', 'down', 'right'];

  /* Start positions, in pixels. Tile t has its centre at t * 8 + 4, so the
     half-tile column the characters sit in is x = 13.5 * 8 + 4 = 112. */
  var PAC_START = { x: 112, y: 23 * TILE + 4 };
  var PAC2_START = { x: 112, y: 29 * TILE + 4 };   // bottom corridor, same column
  var HOUSE_MID = { x: 112, y: 14 * TILE + 4 };
  var HOUSE_EXIT = { x: 112, y: 11 * TILE + 4 };
  var FRUIT_POS = { x: 112, y: 17 * TILE + 4 };

  var TITLE_ITEMS = ['1 PLAYER', '2 PLAYER', 'AI MODE', 'MODS'];

  var GHOST_DEFS = [
    { name: 'blinky', home: { x: 112, y: 11 * TILE + 4 }, scatter: { c: 25, r: -4 }, startDir: 'left', inHouse: false },
    { name: 'pinky', home: { x: 112, y: 14 * TILE + 4 }, scatter: { c: 2, r: -4 }, startDir: 'down', inHouse: true },
    { name: 'inky', home: { x: 96, y: 14 * TILE + 4 }, scatter: { c: 27, r: 32 }, startDir: 'up', inHouse: true },
    { name: 'clyde', home: { x: 128, y: 14 * TILE + 4 }, scatter: { c: 0, r: 32 }, startDir: 'up', inHouse: true }
  ];

  /* Per-level tuning. Speeds are percentages of BASE_SPEED. */
  var FRUITS = ['cherry', 'strawberry', 'orange', 'orange', 'apple', 'apple',
                'melon', 'melon', 'galaxian', 'galaxian', 'bell', 'bell',
                'key', 'key', 'key', 'key', 'key', 'key', 'key', 'key'];
  var FRUIT_POINTS = { cherry: 100, strawberry: 300, orange: 500, apple: 700,
                       melon: 1000, galaxian: 2000, bell: 3000, key: 5000 };

  function levelSpec(level) {
    var L = level;
    function pick(table, dflt) {
      for (var i = 0; i < table.length; i++) if (L <= table[i][0]) return table[i][1];
      return dflt;
    }
    return {
      pacSpeed:    pick([[1, 0.80], [4, 0.90], [20, 1.00]], 0.90),
      pacDotSpeed: pick([[1, 0.71], [4, 0.79], [20, 0.87]], 0.79),
      pacFright:   pick([[1, 0.90], [4, 0.95], [20, 1.00]], 1.00),
      ghostSpeed:  pick([[1, 0.75], [4, 0.85]], 0.95),
      tunnelSpeed: pick([[1, 0.40], [4, 0.45]], 0.50),
      frightSpeed: pick([[1, 0.50], [4, 0.55]], 0.60),
      frightTime:  pick([[1, 6], [2, 5], [3, 4], [4, 3], [5, 2], [6, 5], [7, 2],
                         [8, 2], [9, 1], [10, 5], [11, 2], [12, 1], [13, 1],
                         [14, 3], [16, 1], [17, 0], [18, 1]], 0),
      frightFlashes: pick([[8, 5], [9, 3], [11, 5], [13, 3], [14, 5], [16, 3],
                           [17, 0], [18, 5]], 0),
      elroy1Dots: pick([[1, 20], [2, 30], [4, 40], [6, 50], [8, 60], [11, 60],
                        [12, 80], [15, 100], [19, 120]], 120),
      elroy1Speed: pick([[1, 0.80], [4, 0.90], [20, 1.00]], 1.00),
      elroy2Speed: pick([[1, 0.85], [4, 0.95], [20, 1.05]], 1.05),
      fruit: FRUITS[Math.min(L, FRUITS.length) - 1]
    };
  }

  /* Scatter / chase phase lengths in seconds. */
  function phaseTable(level) {
    if (level === 1) return [7, 20, 7, 20, 5, 20, 5, Infinity];
    if (level <= 4) return [7, 20, 7, 20, 5, 1033, 1 / 60, Infinity];
    return [5, 20, 5, 20, 5, 1037, 1 / 60, Infinity];
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  function tileOf(px) { return Math.floor(px / TILE); }
  function centerOf(tile) { return tile * TILE + 4; }
  function wrapCol(c) { return ((c % COLS) + COLS) % COLS; }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

  function wrapActor(a) {
    var w = COLS * TILE;
    if (a.x < 0) a.x += w;
    else if (a.x >= w) a.x -= w;
  }

  /* ------------------------------------------------------------------ */
  /* Game                                                                */
  /* ------------------------------------------------------------------ */

  function Game(canvas) {
    this.canvas = canvas;
    this.out = canvas.getContext('2d');
    // Everything is drawn into a 224x288 buffer at arcade resolution, then
    // blitted up with smoothing off so the result is honest pixel art.
    this.frame = document.createElement('canvas');
    this.frame.width = Maze.SCREEN_W;
    this.frame.height = Maze.SCREEN_H;
    this.ctx = this.frame.getContext('2d');
    this.accumulator = 0;
    this.titleIndex = 0;
    this.speedScale = 1;
    this.playerCount = 1;
    this.autoPlay = false;
    this.botSkill = 0.82;
    this.highScore = Number(load('pacman.highscore') || 0);
    this.state = 'title';
    this.stateTime = 0;
    this.globalTime = 0;
    this.reset(1, true);
    this.bindInput();
  }

  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }

  Game.prototype.reset = function (level, fullGame) {
    this.level = level || 1;
    this.spec = levelSpec(this.level);
    this.phases = phaseTable(this.level);
    if (fullGame) {
      this.score = 0;
      this.lives = 3;
      this.score2 = 0;
      this.lives2 = 3;
      this.extraAwarded2 = false;
      this.extraAwarded = false;
      this.globalDotCounter = -1;   // -1 = inactive, personal counters in use
    }
    this.dots = Maze.freshDots();
    this.dotsRemaining = Maze.totalDots;
    this.dotsEaten = 0;
    this.phaseIndex = 0;
    this.phaseTimer = 0;
    this.mode = 'scatter';
    this.frightTimer = 0;
    this.ghostsEaten = 0;
    this.fruit = null;
    this.fruitTimer = 0;
    this.popup = null;
    this.elroyStage = 0;
    this.forceExitTimer = 0;
    this.freezeTimer = 0;
    this.animTime = 0;
    this.placeActors();
    Mods.onLevelStart(this);
  };

  /** A player. Player 0 is always the local human unless AI mode is on. */
  function makePlayer(id, start, opts) {
    return {
      id: id,
      x: start.x, y: start.y, dir: 'left', want: 'left',
      mouth: 0, moving: false, dead: false, deadTimer: 0, out: false,
      auto: !!(opts && opts.auto), skill: (opts && opts.skill) || 1,
      bow: id === 1,
      armedOwner: false
    };
  }

  Game.prototype.placeActors = function () {
    var two = this.playerCount === 2;
    this.players = [makePlayer(0, PAC_START, { auto: this.autoPlay, skill: 1 })];
    if (two) this.players.push(makePlayer(1, PAC2_START, { auto: true, skill: this.botSkill }));
    this.pac = this.players[0];
    this.ghosts = GHOST_DEFS.map(function (def, i) {
      return {
        name: def.name, index: i,
        x: def.home.x, y: def.home.y,
        dir: def.startDir, scatter: def.scatter,
        home: { x: def.home.x, y: def.home.y },
        state: def.inHouse ? 'house' : 'normal',
        frightened: false, bob: 0, dotCounter: 0,
        waypoints: null
      };
    });
    this.ghosts[0].dotLimit = 0;
    this.ghosts[1].dotLimit = 0;
    this.ghosts[2].dotLimit = this.level === 1 ? 30 : 0;
    this.ghosts[3].dotLimit = this.level === 1 ? 60 : (this.level === 2 ? 50 : 0);
    // Extras come after the original four so ghosts[0] stays Blinky, which is
    // what Inky's targeting reads.
    this.ghosts = this.ghosts.concat(Extra.build());
    this.ghosts.forEach(function (g, i) { g.index = i; });
  };

  /* ---- input ------------------------------------------------------- */

  Game.prototype.bindInput = function () {
    var self = this;
    var KEYMAP = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right'
    };
    global.addEventListener('keydown', function (e) {
      var dir = KEYMAP[e.code];
      Sound.resume();
      if (dir) {
        e.preventDefault();
        if (!self.menuAction(dir) && !self.autoPlay) self.pac.want = dir;
      } else if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (self.menuAction('select')) return;
        if (self.tryShoot()) return;
        self.onStartKey();
      } else if (e.code === 'KeyX' || e.code === 'KeyZ') {
        e.preventDefault();
        self.tryShoot();
      } else if (e.code === 'KeyP' || e.code === 'Escape') {
        if (self.menuAction('back')) return;
        if (self.state === 'playing') self.state = 'paused';
        else if (self.state === 'paused') self.state = 'playing';
      } else if (e.code === 'KeyM') {
        self.syncMuteButton(Sound.toggleMute());
      } else if (e.code === 'KeyT' && self.playerCount === 2) {
        e.preventDefault();
        MP.setOpen(true);
      }
    });

    this.bindTouch();
  };

  /* ------------------------------------------------------------------ */
  /* Touch controls                                                      */
  /*                                                                      */
  /* Pac-Man only ever needs a latched direction, so a tap is enough - no */
  /* press-and-hold. Dragging across the pad re-latches as you cross each */
  /* key, and a swipe anywhere on the maze works as well.                 */
  /* ------------------------------------------------------------------ */

  Game.prototype.bindTouch = function () {
    var self = this;
    var pad = document.getElementById('pad');

    function revealPad() {
      if (!document.body.classList.contains('touch')) {
        document.body.classList.add('touch');
      }
    }
    if (navigator.maxTouchPoints > 0 || 'ontouchstart' in global) revealPad();
    global.addEventListener('touchstart', revealPad, { once: true, passive: true });

    function press(dir) {
      Sound.resume();
      if (self.menuAction(dir)) return;
      if (self.state === 'gameover') { self.onStartKey(); return; }
      if (!self.autoPlay) self.pac.want = dir;
    }

    function togglePause() {
      if (self.state === 'playing') self.state = 'paused';
      else if (self.state === 'paused') self.state = 'playing';
    }

    function act(name) {
      Sound.resume();
      if (name === 'shoot') { self.tryShoot(); return; }
      if (name === 'chat') { MP.toggle(); return; }
      if (name === 'start') {
        if (self.menuAction('select')) return;
        self.onStartKey();
      } else if (name === 'pause') {
        if (self.menuAction('back')) return;
        togglePause();
      } else if (name === 'mute') {
        self.syncMuteButton(Sound.toggleMute());
      }
    }

    if (pad) {
      var held = null;

      // Which key is under this point? Lets a drag slide between directions.
      function keyAt(x, y) {
        var el = document.elementFromPoint(x, y);
        return el && el.dataset && el.dataset.dir ? el : null;
      }
      function highlight(el) {
        if (held === el) return;
        if (held) held.classList.remove('is-down');
        held = el;
        if (held) held.classList.add('is-down');
      }

      pad.addEventListener('pointerdown', function (e) {
        var t = e.target.closest ? e.target.closest('[data-dir],[data-act]') : null;
        if (!t) return;
        e.preventDefault();          // no scrolling, no synthetic mouse events
        if (t.dataset.dir) {
          highlight(t);
          press(t.dataset.dir);
        } else {
          t.classList.add('is-down');
          act(t.dataset.act);
        }
      });

      pad.addEventListener('pointermove', function (e) {
        if (e.buttons === 0 && e.pointerType === 'mouse') return;
        if (!held) return;
        e.preventDefault();
        var k = keyAt(e.clientX, e.clientY);
        if (k && k !== held) { highlight(k); press(k.dataset.dir); }
      });

      function release() {
        highlight(null);
        var down = pad.querySelectorAll('.is-down');
        for (var i = 0; i < down.length; i++) down[i].classList.remove('is-down');
      }
      pad.addEventListener('pointerup', release);
      pad.addEventListener('pointercancel', release);
      pad.addEventListener('pointerleave', release);
      pad.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }

    // Swipe anywhere on the maze, as an alternative to the pad.
    var sx = 0, sy = 0, swiping = false;
    this.canvas.addEventListener('pointerdown', function (e) {
      sx = e.clientX; sy = e.clientY; swiping = true;
      Sound.resume();
      var tile = self.tileAt(e.clientX, e.clientY);
      if (Mods.handleTap(self, tile.col, tile.row)) return;
      if (self.state === 'title') {
        // Tapping a title entry picks it directly.
        var slot = Math.round((tile.row - 27) / 2);
        if (slot >= 0 && slot < 4 && Math.abs(tile.row - (27 + slot * 2)) <= 1) {
          self.titleIndex = slot;
        }
        self.menuAction('select');
        return;
      }
      if (self.state === 'gameover' || self.state === 'moddemoend') {
        self.menuAction('select');
        self.onStartKey();
        return;
      }
      if (self.pacArmed && self.state === 'playing') self.tryShoot();
    });
    this.canvas.addEventListener('pointermove', function (e) {
      if (!swiping) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
      self.pac.want = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? 'right' : 'left')
        : (dy > 0 ? 'down' : 'up');
      sx = e.clientX; sy = e.clientY;
    });
    function endSwipe() { swiping = false; }
    this.canvas.addEventListener('pointerup', endSwipe);
    this.canvas.addEventListener('pointercancel', endSwipe);
  };

  /** Map a client point onto the 28 x 36 tile grid of the arcade screen. */
  Game.prototype.tileAt = function (clientX, clientY) {
    var r = this.canvas.getBoundingClientRect();
    return {
      col: Math.floor((clientX - r.left) / r.width * Maze.COLS),
      row: Math.floor((clientY - r.top) / r.height * 36)
    };
  };

  /** Grey out the SOUND button while muted. */
  Game.prototype.syncMuteButton = function (muted) {
    var b = document.querySelector('[data-act="mute"]');
    if (b) b.classList.toggle('is-off', !!muted);
  };

  /**
   * Route a direction / select / back to whichever menu is open.
   * @return {boolean} true when a menu consumed the input.
   */
  Game.prototype.menuAction = function (action) {
    if (Mods.handleInput(this, action)) return true;
    if (this.state !== 'title') return false;
    if (action === 'up' || action === 'down') {
      var n = TITLE_ITEMS.length;
      this.titleIndex = (this.titleIndex + (action === 'down' ? 1 : n - 1)) % n;
      Sound.blip();
      return true;
    }
    if (action === 'select') {
      Sound.accept();
      if (this.titleIndex === 0) this.startOnePlayer();
      else if (this.titleIndex === 1) MP.startTwoPlayer(this);
      else if (this.titleIndex === 2) this.startAiGame();
      else Mods.openMenu(this);
      return true;
    }
    return false;
  };

  Game.prototype.tryShoot = function () {
    if (!this.pacArmed || this.state !== 'playing') return false;
    Mods.shoot(this);
    return true;
  };

  Game.prototype.onStartKey = function () {
    if (this.state === 'gameover') {
      this.reset(1, true);
      this.startReady(true);
    } else if (this.state === 'title') {
      this.menuAction('select');
    }
  };

  /* The arcade start: the maze appears with PLAYER ONE and READY! but no
     characters, and only once the opening tune is part-way through do the
     characters appear and PLAYER ONE clear. Restarting after a life lost
     skips straight to the shorter READY! with the characters in place. */
  var PLAYER_ONE_TIME = 2.2;

  Game.prototype.startOnePlayer = function () {
    this.playerCount = 1; this.autoPlay = false;
    if (MP) MP.stop(this);
    this.reset(1, true);
    this.startReady(true);
  };

  /** Hands the controls to the search agent and lets it play the whole run. */
  Game.prototype.startAiGame = function () {
    this.playerCount = 1; this.autoPlay = true;
    if (MP) MP.stop(this);
    this.reset(1, true);
    this.startReady(true);
  };

  Game.prototype.startTwoPlayerGame = function () {
    this.playerCount = 2; this.autoPlay = false;
    this.reset(1, true);
    this.startReady(true);
  };

  /** Used by the dev menu: begin a fresh game already at `level`. */
  Game.prototype.startModdedGame = function (level) {
    this.reset(1, true);
    if (level > 1) this.reset(level, false);
    this.startReady(true);
  };

  Game.prototype.startReady = function (withTune) {
    this.state = 'ready';
    this.stateTime = 0;
    this.accumulator = 0;
    this.readyDuration = withTune ? Sound.INTRO_LENGTH + 0.2 : 1.9;
    this.showPlayerOne = !!withTune;
    Sound.stopBackground();
    if (withTune) Sound.intro();
  };

  /** Characters are hidden during the first half of a fresh game's start. */
  Game.prototype.charactersVisible = function () {
    if (this.state === 'gameover') return false;
    return !(this.state === 'ready' && this.showPlayerOne &&
             this.stateTime < PLAYER_ONE_TIME);
  };

  /* ---- main loop --------------------------------------------------- */

  Game.prototype.update = function (dt) {
    this.globalTime += dt;
    this.stateTime += dt;
    this.animTime += dt;

    switch (this.state) {
      case 'ready':
        // A mod cutscene can hold READY! open past its normal length.
        if (Mods.updateCutscene(this, dt)) break;
        if (this.stateTime >= this.readyDuration) {
          this.state = 'playing';
          this.stateTime = 0;
        }
        break;
      case 'playing':
        this.step(dt);
        break;
      case 'dying':
        if (this.stateTime >= 2.4) this.afterDeath();
        break;
      case 'levelclear':
        if (this.stateTime >= 3.1) {
          if (Mods.onLevelCleared(this)) break;
          this.reset(this.level + 1, false);
          this.startReady(false);
        }
        break;
      case 'mods':
        Mods.updateMenu(this, dt);
        break;
      case 'matching':
        break;
      case 'gameover':
      case 'title':
      case 'dev':
      case 'moddemoend':
      case 'paused':
        break;
    }
    Mods.onFrame(this, dt);
    if (MP) MP.update(this, dt);

    if (this.armedClass !== !!this.pacArmed) {
      this.armedClass = !!this.pacArmed;
      document.body.classList.toggle('armed', this.armedClass);
    }
  };

  Game.prototype.step = function (dt) {
    // Eating a ghost freezes the board for a moment while the score shows.
    if (this.freezeTimer > 0) {
      this.freezeTimer -= dt;
      if (this.freezeTimer <= 0) { this.freezeTimer = 0; this.popup = null; }
      return;
    }
    // A fixed timestep, so the game runs at arcade pace on any display -
    // a 120 Hz phone would otherwise play at double speed.
    this.accumulator += dt * (this.speedScale || 1);
    if (this.accumulator > 0.25) this.accumulator = 0.25;   // no spiral after a stall
    while (this.accumulator >= TICK) {
      this.tick();
      this.accumulator -= TICK;
      if (this.state !== 'playing') break;   // a death or level clear ends the burst
    }
    this.updateSound();
  };

  Game.prototype.tick = function () {
    this.updateModeTimers();
    for (var pi = 0; pi < this.players.length; pi++) {
      var pl = this.players[pi];
      if (pl.deadTimer > 0) {
        pl.deadTimer -= TICK;
        if (pl.deadTimer <= 0) this.respawn(pl);
        continue;
      }
      if (pl.out) continue;
      if (pl.auto && Auto) Auto.drive(this, pl, pl.skill);
      this.movePacman(pl);
      this.eatCheck(pl);
    }
    for (var i = 0; i < this.ghosts.length; i++) this.moveGhost(this.ghosts[i]);
    this.collisionCheck();
    if (this.fruit) {
      this.fruitTimer -= TICK;
      if (this.fruitTimer <= 0) this.fruit = null;
    }
    if (this.popup) {
      this.popup.t -= TICK;
      if (this.popup.t <= 0) this.popup = null;
    }
    this.forceExitTimer += TICK;
    var forceLimit = this.level < 5 ? 4 : 3;
    if (this.forceExitTimer >= forceLimit) {
      this.forceExitTimer = 0;
      this.releaseNextGhost();
    }
  };

  Game.prototype.updateModeTimers = function () {
    if (this.frightTimer > 0) {
      this.frightTimer -= TICK;
      if (this.frightTimer <= 0) {
        this.frightTimer = 0;
        this.ghosts.forEach(function (g) { g.frightened = false; });
        this.ghostsEaten = 0;
      }
      return;   // the scatter/chase clock is frozen while ghosts are blue
    }
    this.phaseTimer += TICK;
    var len = this.phases[this.phaseIndex];
    if (this.phaseTimer >= len) {
      this.phaseTimer = 0;
      this.phaseIndex = Math.min(this.phaseIndex + 1, this.phases.length - 1);
      this.mode = this.phaseIndex % 2 === 0 ? 'scatter' : 'chase';
      this.reverseGhosts();
    } else {
      this.mode = this.phaseIndex % 2 === 0 ? 'scatter' : 'chase';
    }
  };

  Game.prototype.reverseGhosts = function () {
    this.ghosts.forEach(function (g) {
      if (g.state === 'normal') g.pendingReverse = true;
    });
  };

  /* ---- Pac-Man ----------------------------------------------------- */

  Game.prototype.pacSpeed = function (pac) {
    pac = pac || this.pac;
    var c = tileOf(pac.x), r = tileOf(pac.y);
    var onDot = this.dots[r] && this.dots[r][wrapCol(c)] > 0;
    var pct = this.frightTimer > 0 ? this.spec.pacFright
            : (onDot ? this.spec.pacDotSpeed : this.spec.pacSpeed);
    return pct * BASE_SPEED;
  };

  Game.prototype.movePacman = function (pac) {
    pac = pac || this.pac;
    var dist = this.pacSpeed(pac);
    var steps = Math.ceil(dist);
    var per = dist / steps;
    var movedAny = false;
    for (var i = 0; i < steps; i++) movedAny = this.pacSubStep(per, pac) || movedAny;
    pac.moving = movedAny;
    if (movedAny) pac.mouth = (Math.sin(this.animTime * 22) + 1) / 2;
  };

  Game.prototype.pacSubStep = function (d, pac) {
    pac = pac || this.pac;
    var c = tileOf(pac.x), r = tileOf(pac.y);
    var cx = centerOf(c), cy = centerOf(r);

    if (pac.want && pac.want !== pac.dir) {
      var wv = DIRV[pac.want];
      if (pac.want === OPPOSITE[pac.dir]) {
        pac.dir = pac.want;
      } else if (Maze.isWalkable(wrapCol(c + wv[0]), r + wv[1])) {
        // Cornering: allow the turn once within a pixel of the tile centre.
        if (wv[0] !== 0 && Math.abs(pac.y - cy) <= 1.0) { pac.y = cy; pac.dir = pac.want; }
        else if (wv[1] !== 0 && Math.abs(pac.x - cx) <= 1.0) { pac.x = cx; pac.dir = pac.want; }
      }
    }

    var v = DIRV[pac.dir];
    var nx = pac.x + v[0] * d, ny = pac.y + v[1] * d;
    var blocked = !Maze.isWalkable(wrapCol(c + v[0]), r + v[1]);
    if (blocked) {
      if (v[0] > 0 && nx > cx) nx = cx;
      else if (v[0] < 0 && nx < cx) nx = cx;
      else if (v[1] > 0 && ny > cy) ny = cy;
      else if (v[1] < 0 && ny < cy) ny = cy;
    }
    var moved = (nx !== pac.x || ny !== pac.y);
    pac.x = nx; pac.y = ny;
    wrapActor(pac);
    return moved;
  };

  Game.prototype.eatCheck = function (pac) {
    pac = pac || this.pac;
    var c = wrapCol(tileOf(pac.x)), r = tileOf(pac.y);
    if (r < 0 || r >= Maze.ROWS) return;
    var d = this.dots[r][c];
    if (!d) return;
    this.dots[r][c] = 0;
    this.dotsRemaining--;
    this.dotsEaten++;
    this.forceExitTimer = 0;
    this.addScore(d === 2 ? 50 : 10, pac.id);
    if (pac.id === 0) Sound.waka();
    this.countDotForHouse();

    if (d === 2) {
      this.ghostsEaten = 0;
      var t = this.spec.frightTime;
      if (t > 0) {
        this.frightTimer = t;
        var self = this;
        this.ghosts.forEach(function (g) {
          if (g.state === 'normal' || g.state === 'house' || g.state === 'leaving') {
            g.frightened = true;
            if (g.state === 'normal') g.pendingReverse = true;
          }
        });
      } else {
        this.reverseGhosts();
      }
      if (MP) MP.notify(pac.id === 0 ? 'energiser' : 'energiser');
    }

    Extra.releaseWaiting(this, false);

    // Cruise Elroy: Blinky speeds up as the maze empties.
    if (this.dotsRemaining <= Math.floor(this.spec.elroy1Dots / 2)) this.elroyStage = 2;
    else if (this.dotsRemaining <= this.spec.elroy1Dots) this.elroyStage = 1;

    if (this.dotsEaten === 70 || this.dotsEaten === 170) {
      this.fruit = this.spec.fruit;
      this.fruitTimer = 9 + Math.random();
    }

    if (this.dotsRemaining === 0) {
      this.state = 'levelclear';
      this.stateTime = 0;
      Sound.stopBackground();
    }
  };

  Game.prototype.addScore = function (n, id) {
    if (id === 1) {
      this.score2 += n;
      if (!this.extraAwarded2 && this.score2 >= 10000) {
        this.extraAwarded2 = true;
        this.lives2++;
      }
      return;
    }
    this.score += n;
    if (!this.extraAwarded && this.score >= 10000) {
      this.extraAwarded = true;
      this.lives++;
      Sound.extraLife();
    }
    if (this.score > this.highScore) {
      this.highScore = this.score;
      save('pacman.highscore', String(this.highScore));
    }
  };

  /* ---- ghost house ------------------------------------------------- */

  Game.prototype.countDotForHouse = function () {
    if (this.globalDotCounter >= 0) {
      this.globalDotCounter++;
      var limits = { pinky: 7, inky: 17, clyde: 32 };
      for (var i = 1; i < this.ghosts.length; i++) {
        var g = this.ghosts[i];
        if (g.state === 'house' && this.globalDotCounter >= limits[g.name]) {
          this.leaveHouse(g);
          if (g.name === 'clyde') this.globalDotCounter = -1;
          break;
        }
      }
      return;
    }
    for (var j = 1; j < this.ghosts.length; j++) {
      var gh = this.ghosts[j];
      if (gh.state === 'house') { gh.dotCounter++; break; }
    }
    for (var k = 1; k < this.ghosts.length; k++) {
      var g2 = this.ghosts[k];
      if (g2.state === 'house' && g2.dotCounter >= g2.dotLimit) { this.leaveHouse(g2); break; }
    }
  };

  Game.prototype.releaseNextGhost = function () {
    for (var i = 1; i < this.ghosts.length; i++) {
      if (this.ghosts[i].state === 'house') { this.leaveHouse(this.ghosts[i]); return; }
    }
  };

  Game.prototype.leaveHouse = function (g) {
    g.state = 'leaving';
    g.waypoints = [{ x: HOUSE_EXIT.x, y: g.y }, { x: HOUSE_EXIT.x, y: HOUSE_EXIT.y }];
  };

  /* ---- ghosts ------------------------------------------------------ */

  Game.prototype.ghostSpeed = function (g) {
    var pct;
    var c = wrapCol(tileOf(g.x)), r = tileOf(g.y);
    var inTunnel = r === Maze.TUNNEL_ROW && (c <= 5 || c >= 22);
    if (g.state === 'eaten') pct = 1.6;
    else if (g.state === 'entering' || g.state === 'house' || g.state === 'leaving') pct = 0.5;
    else if (g.frightened) pct = this.spec.frightSpeed;
    else if (inTunnel) pct = this.spec.tunnelSpeed;
    else if (g.name === 'blinky' && this.elroyStage === 2) pct = this.spec.elroy2Speed;
    else if (g.name === 'blinky' && this.elroyStage === 1) pct = this.spec.elroy1Speed;
    else pct = this.spec.ghostSpeed;
    return pct * BASE_SPEED;
  };

  Game.prototype.moveGhost = function (g) {
    // Extras wait in their own chamber before entering play.
    if (g.state === 'waiting') { this.bobInHouse(g); return; }
    if (g.state === 'house') { this.bobInHouse(g); return; }
    var dist = this.ghostSpeed(g);

    if (g.state === 'leaving' || g.state === 'entering') {
      this.followWaypoints(g, dist);
      return;
    }

    if (g.pendingReverse) {
      g.pendingReverse = false;
      g.dir = OPPOSITE[g.dir];
    }

    var remaining = dist, guard = 0;
    while (remaining > 1e-9 && guard++ < 200) {
      var v = DIRV[g.dir];
      var c = tileOf(g.x), r = tileOf(g.y);
      var cx = centerOf(c), cy = centerOf(r);
      var toC = v[0] !== 0 ? (cx - g.x) * v[0] : (cy - g.y) * v[1];

      if (Math.abs(toC) < 1e-6) {
        g.x = cx; g.y = cy;
        this.decideGhost(g);
        v = DIRV[g.dir];
        toC = TILE;
      } else if (toC < 0) {
        toC += TILE;
      }

      var d = Math.min(remaining, toC);
      g.x += v[0] * d; g.y += v[1] * d;
      remaining -= d;
      wrapActor(g);

      // Arriving anywhere on the two tiles above the door hands over to the
      // scripted descent. Matching the exact pixel was fragile - a ghost whose
      // route was perturbed could step straight past it.
      if (g.state === 'eaten' && tileOf(g.y) === 11) {
        var hc = wrapCol(tileOf(g.x));
        if (hc === 13 || hc === 14) {
          g.x = HOUSE_EXIT.x; g.y = HOUSE_EXIT.y;
          g.state = 'entering';
          g.frightened = false;
          g.waypoints = [{ x: HOUSE_EXIT.x, y: HOUSE_MID.y }, { x: g.home.x, y: g.home.y }];
          return;
        }
      }
    }
  };

  Game.prototype.bobInHouse = function (g) {
    if (g.anchorY === undefined) g.anchorY = g.state === 'waiting' ? g.y : g.home.y;
    g.bob += TICK * 3.2;
    g.y = (g.state === 'waiting' ? g.anchorY : g.home.y) + Math.sin(g.bob) * 3.5;
    g.dir = Math.cos(g.bob) > 0 ? 'down' : 'up';
  };

  Game.prototype.followWaypoints = function (g, dist) {
    var remaining = dist, guard = 0;
    while (remaining > 1e-9 && guard++ < 100) {
      if (!g.waypoints || !g.waypoints.length) {
        if (g.state === 'leaving') {
          g.state = 'normal';
          g.dir = 'left';
          g.pendingReverse = false;
        } else {                       // finished re-entering the house
          g.state = 'house';
          g.bob = 0;
          g.dotCounter = g.dotLimit;   // eligible to leave straight away
          this.leaveHouse(g);
        }
        return;
      }
      var wp = g.waypoints[0];
      var dx = wp.x - g.x, dy = wp.y - g.y;
      var len = Math.hypot(dx, dy);
      if (len < 1e-6) { g.waypoints.shift(); continue; }
      var d = Math.min(remaining, len);
      g.x += dx / len * d;
      g.y += dy / len * d;
      remaining -= d;
      g.dir = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? 'right' : 'left')
        : (dy > 0 ? 'down' : 'up');
      if (d >= len - 1e-6) { g.x = wp.x; g.y = wp.y; g.waypoints.shift(); }
    }
  };

  /**
   * Which player this ghost is hunting. With one player it is always him;
   * with two it is the nearer, with hysteresis so ghosts do not flip between
   * them every frame. A player under Rampage Pac is never hunted.
   */
  Game.prototype.focusPac = function (g) {
    var live = this.players.filter(function (p) { return !p.out && !p.dead; });
    if (!live.length) return this.pac;
    if (this.ghostsFlee) {
      var others = live.filter(function (p) { return !p.armedOwner; });
      if (others.length) live = others;
    }
    if (live.length === 1) return live[0];
    var best = live[0], bestD = Infinity;
    for (var i = 0; i < live.length; i++) {
      var d = dist2(g.x, g.y, live[i].x, live[i].y);
      if (live[i].id === g.focusId) d *= 0.6;      // stick with the current mark
      if (d < bestD) { bestD = d; best = live[i]; }
    }
    g.focusId = best.id;
    return best;
  };

  Game.prototype.ghostTarget = function (g) {
    var focus = this.focusPac(g);
    var pc = wrapCol(tileOf(focus.x)), pr = tileOf(focus.y);
    var pv = DIRV[focus.dir];

    if (g.state === 'eaten') return { c: 13, r: 11 };

    // Blinky keeps hunting through scatter once he turns Cruise Elroy.
    var scattering = this.mode === 'scatter' &&
                     !(g.name === 'blinky' && this.elroyStage > 0);
    // Extras bring their own chase rule and their own scatter patrol.
    if (g.ai) {
      return scattering ? Extra.scatterTarget(this, g, focus)
                        : Extra.chaseTarget(this, g, focus);
    }
    if (scattering) return { c: g.scatter.c, r: g.scatter.r };

    switch (g.name) {
      case 'blinky':
        return { c: pc, r: pr };
      case 'pinky': {
        // Four tiles ahead - reproducing the original's up-direction overflow.
        var tc = pc + pv[0] * 4, tr = pr + pv[1] * 4;
        if (focus.dir === 'up') tc -= 4;
        return { c: tc, r: tr };
      }
      case 'inky': {
        var ic = pc + pv[0] * 2, ir = pr + pv[1] * 2;
        if (focus.dir === 'up') ic -= 2;
        var b = this.ghosts[0];
        var bc = wrapCol(tileOf(b.x)), br = tileOf(b.y);
        return { c: ic * 2 - bc, r: ir * 2 - br };
      }
      default: {   // clyde
        var gc = wrapCol(tileOf(g.x)), gr = tileOf(g.y);
        var far = dist2(gc, gr, pc, pr) >= 64;
        return far ? { c: pc, r: pr } : { c: g.scatter.c, r: g.scatter.r };
      }
    }
  };

  Game.prototype.decideGhost = function (g) {
    var c = tileOf(g.x), r = tileOf(g.y);
    var opposite = OPPOSITE[g.dir];
    var allowDoor = g.state === 'eaten';
    var options = [];

    for (var i = 0; i < TURN_ORDER.length; i++) {
      var d = TURN_ORDER[i];
      if (d === opposite) continue;
      var v = DIRV[d];
      var nc = wrapCol(c + v[0]), nr = r + v[1];
      if (!Maze.isWalkableGhost(nc, nr, allowDoor)) continue;
      if (d === 'up' && !allowDoor && Maze.isNoUpTile(wrapCol(c), r)) continue;
      options.push(d);
    }
    if (!options.length) { g.dir = opposite; return; }

    if (g.frightened && g.state !== 'eaten') {
      g.dir = options[Math.floor(Math.random() * options.length)];
      return;
    }

    // Fleeing ghosts run for whichever exit puts the most distance between
    // them and Pac-Man, rather than closing on a target.
    var flee = this.ghostsFlee && g.state === 'normal';
    var fleeFrom = this.focusPac(g);
    var target = flee ? { c: wrapCol(tileOf(fleeFrom.x)), r: tileOf(fleeFrom.y) }
                      : this.ghostTarget(g);
    Extra.noteTile(g, c, r);
    var best = options[0], bestDist = flee ? -Infinity : Infinity;
    for (var j = 0; j < options.length; j++) {
      var vv = DIRV[options[j]];
      var dd = dist2(c + vv[0], r + vv[1], target.c, target.r) +
               Extra.pathPenalty(g, c + vv[0], r + vv[1]);
      if (flee ? dd > bestDist : dd < bestDist) { bestDist = dd; best = options[j]; }
    }
    g.dir = best;
  };

  /* ---- collisions -------------------------------------------------- */

  Game.prototype.collisionCheck = function () {
    for (var q = 0; q < this.players.length; q++) this.playerCollisions(this.players[q]);
  };

  Game.prototype.playerCollisions = function (pac) {
    if (pac.out || pac.deadTimer > 0) return;
    if (this.fruit && Math.abs(pac.x - FRUIT_POS.x) < 7 &&
        Math.abs(pac.y - FRUIT_POS.y) < 7) {
      var pts = FRUIT_POINTS[this.fruit];
      this.addScore(pts, pac.id);
      this.popup = { x: FRUIT_POS.x, y: FRUIT_POS.y, text: String(pts), t: 2, color: '#ffb8ff' };
      this.fruit = null;
      Sound.eatFruit();
    }

    for (var i = 0; i < this.ghosts.length; i++) {
      var g = this.ghosts[i];
      if (g.state === 'eaten' || g.state === 'entering' || g.state === 'waiting') continue;
      if (Math.abs(pac.x - g.x) > 6 || Math.abs(pac.y - g.y) > 6) continue;
      if (g.frightened) {
        this.ghostsEaten++;
        var pts = 200 * Math.pow(2, Math.min(this.ghostsEaten, 4) - 1);
        this.addScore(pts, pac.id);
        this.popup = { x: g.x, y: g.y, text: String(pts), t: 0.9, color: '#00ffff' };
        g.frightened = false;
        g.state = 'eaten';
        this.freezeTimer = 0.9;
        Sound.eatGhost();
        if (MP) MP.notify(pac.id === 0 ? 'playerAte' : 'botAte');
      } else if (!this.godmode && !(this.ghostsFlee && pac.armedOwner)) {
        this.die(pac);
        return;
      }
    }
  };

  Game.prototype.die = function (pac) {
    pac = pac || this.pac;
    if (MP) MP.notify(pac.id === 0 ? 'playerDied' : 'botDied');

    if (this.players.length < 2) {
      this.state = 'dying';
      this.stateTime = 0;
      this.pac.dead = true;
      this.lives--;
      Sound.death();
      return;
    }

    // Two players: only the one caught drops out, the round carries on.
    pac.dead = true;
    pac.deadTimer = 2.2;
    if (pac.id === 1) this.lives2--; else this.lives--;
    Sound.death();
  };

  /** Put a player back at their start, or bench them if they are out. */
  Game.prototype.respawn = function (pac) {
    pac.dead = false;
    pac.deadTimer = 0;
    var lives = pac.id === 1 ? this.lives2 : this.lives;
    if (lives <= 0) {
      pac.out = true;
      if (this.players.every(function (p) { return p.out; })) {
        this.state = 'gameover';
        this.stateTime = 0;
        Sound.stopBackground();
      }
      return;
    }
    var start = pac.id === 1 ? PAC2_START : PAC_START;
    pac.x = start.x; pac.y = start.y;
    pac.dir = 'left'; pac.want = 'left';
    pac.autoTile = null;
  };

  Game.prototype.afterDeath = function () {
    if (this.lives <= 0) {
      this.state = 'gameover';
      this.stateTime = 0;
      Sound.stopBackground();
      return;
    }
    this.globalDotCounter = 0;   // a lost life switches to the global counter
    this.placeActors();
    this.phaseIndex = 0;
    this.phaseTimer = 0;
    this.mode = 'scatter';
    this.frightTimer = 0;
    this.forceExitTimer = 0;
    this.startReady(false);
  };

  /* ---- sound ------------------------------------------------------- */

  Game.prototype.updateSound = function () {
    var anyEaten = this.ghosts.some(function (g) {
      return g.state === 'eaten' || g.state === 'entering';
    });
    if (anyEaten) Sound.setBackground('eyes');
    else if (this.frightTimer > 0) Sound.setBackground('fright');
    else Sound.setBackground('siren', 1 - this.dotsRemaining / Maze.totalDots);
  };

  /* ------------------------------------------------------------------ */
  /* Rendering                                                           */
  /* ------------------------------------------------------------------ */

  Game.prototype.render = function () {
    var ctx = this.ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, Maze.SCREEN_W, Maze.SCREEN_H);

    this.drawHud();

    ctx.save();
    ctx.translate(0, Maze.MAZE_TOP);
    if (this.state === 'levelclear' && this.stateTime > 1.0) {
      // Four white flashes over roughly two seconds.
      var phase = Math.floor((this.stateTime - 1.0) / 0.24);
      Maze.drawWalls(ctx, phase < 8 && phase % 2 === 0 ? '#ffffff' : Maze.WALL_COLOR);
    } else {
      Maze.drawWalls(ctx, this.wallColor || undefined);
      Maze.drawDoor(ctx);
    }

    if (this.state !== 'levelclear') {
      Maze.drawDots(ctx, this.dots, Math.floor(this.globalTime * 5.5) % 2 === 0);
      this.drawFruit(ctx);
      this.drawGhosts(ctx);
      this.drawPac(ctx);
      this.drawOverlayText(ctx);
      Mods.drawCutscene(this, ctx);
    }
    ctx.restore();

    this.drawBottomBar();

    if (this.state === 'title') this.drawTitle();
    if (this.state === 'paused') this.drawPaused();
    if (this.state === 'mods' || this.state === 'dev') {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, Maze.SCREEN_W, Maze.SCREEN_H);
      this.drawHud();
      if (this.state === 'mods') Mods.drawMenu(this, ctx);
      else Mods.drawDev(this, ctx);
    }
    if (this.state === 'moddemoend') Mods.drawDemoEnd(this, ctx);
    if (this.state === 'matching') {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, Maze.SCREEN_W, Maze.SCREEN_H);
      this.drawHud();
      MP.drawMatching(this, ctx);
    }

    this.out.imageSmoothingEnabled = false;
    this.out.drawImage(this.frame, 0, 0, this.canvas.width, this.canvas.height);
  };

  Game.prototype.drawHud = function () {
    var ctx = this.ctx;
    var blinkOn = this.state === 'title' || this.state === 'gameover' ||
                  Math.floor(this.globalTime * 3.7) % 2 === 0;
    if (blinkOn) Font.draw(ctx, '1UP', 3, 0, '#ffffff');
    Font.draw(ctx, 'HIGH SCORE', 9, 0, '#ffffff');
    // The arcade seats the score values one pixel lower than the labels.
    var s = this.score === 0 ? '00' : String(this.score);
    Font.drawRight(ctx, s, 6, 1, '#ffffff', 1);
    var hs = this.highScore === 0 ? '' : String(this.highScore);
    Font.drawRight(ctx, hs, 16, 1, '#ffffff', 1);
    if (this.playerCount === 2) {
      if (blinkOn) Font.draw(ctx, '2UP', 22, 0, '#ffffff');
      Font.drawRight(ctx, this.score2 === 0 ? '00' : String(this.score2), 25, 1, '#ffffff', 1);
    }
    if (this.autoPlay) Font.draw(ctx, 'AI', 25, 0, '#7cff3c');
  };

  Game.prototype.drawBottomBar = function () {
    var ctx = this.ctx, P = Sprites.Pixel, y = 278;
    // Reserve lives only - the one in play is not shown - and they face left.
    var reserves = Math.max(0, Math.min(this.lives - 1, 5));
    for (var i = 0; i < reserves; i++) P.blit(ctx, P.lifeIcon(), 23 + i * 16, y);
    if (this.playerCount === 2) {
      // The fruit strip gives way to player two's lives.
      var r2 = Math.max(0, Math.min(this.lives2 - 1, 5));
      for (var j = 0; j < r2; j++) {
        P.blit(ctx, P.pacman('left', 0.75, { bow: true }), 200 - j * 16, y);
      }
      return;
    }
    // The last seven levels' fruit, newest at the right edge.
    var first = Math.max(1, this.level - 6);
    for (var lv = first; lv <= this.level; lv++) {
      P.blit(ctx, P.fruit(FRUITS[Math.min(lv, FRUITS.length) - 1]),
             200 - (this.level - lv) * 16, y);
    }
  };

  Game.prototype.drawFruit = function (ctx) {
    if (!this.fruit) return;
    Sprites.Pixel.blit(ctx, Sprites.Pixel.fruit(this.fruit), FRUIT_POS.x, FRUIT_POS.y);
  };

  Game.prototype.drawPac = function (ctx) {
    for (var i = 0; i < this.players.length; i++) this.drawPlayer(ctx, this.players[i]);
  };

  Game.prototype.drawPlayer = function (ctx, pac) {
    var P = Sprites.Pixel;
    if (pac.out) return;

    // Two-player death is per player; the round does not stop for it.
    if (pac.deadTimer > 0) {
      var pt = 1 - pac.deadTimer / 2.2;
      var self = this;
      this.withWrap(ctx, pac.x, pac.y, function (x, y) {
        if (pt < 0.25) P.blit(ctx, P.pacman(pac.dir, 0.8, { bow: pac.bow }), x, y);
        else if (pt < 0.95) P.blit(ctx, P.death(Math.floor((pt - 0.25) / 0.7 * 11)), x, y);
      });
      return;
    }

    if (this.state === 'dying' && pac.id === 0) {
      if (this.stateTime < 0.55) {
        this.withWrap(ctx, pac.x, pac.y, function (x, y) {
          P.blit(ctx, P.pacman(pac.dir, 0.8), x, y);
        });
      } else if (this.stateTime < 2.1) {
        var step = Math.floor((this.stateTime - 0.55) / 1.55 * 11);
        this.withWrap(ctx, pac.x, pac.y, function (x, y) {
          P.blit(ctx, P.death(step), x, y);
        });
      }
      return;
    }
    if (!this.charactersVisible()) return;
    if (this.freezeTimer > 0) return;      // hidden while a ghost score shows
    // He waits as a closed circle during READY!, as on the arcade.
    var mouth = this.state === 'ready' ? 0 : pac.mouth;
    // Rampage only ever dresses the player who switched the mod on.
    var opts = { angry: this.pacAngry && pac.armedOwner,
                 armed: this.pacArmed && pac.armedOwner,
                 bow: pac.bow };
    var muzzle = this.muzzle;
    this.withWrap(ctx, pac.x, pac.y, function (x, y) {
      P.blit(ctx, P.pacman(pac.dir, mouth, opts), x, y);
      if (muzzle > 0) P.blit(ctx, P.muzzleFlash(pac.dir, 1 - muzzle / 0.18), x, y);
    });
  };

  Game.prototype.drawGhosts = function (ctx) {
    if (this.state === 'dying' || !this.charactersVisible()) return;
    var P = Sprites.Pixel;
    var frame = Math.floor(this.animTime * 9) % 2;
    var flashing = false;
    if (this.frightTimer > 0) {
      var flashes = this.spec.frightFlashes;
      var flashWindow = flashes * 0.26;
      flashing = this.frightTimer < flashWindow &&
                 Math.floor(this.frightTimer / 0.13) % 2 === 1;
    }
    for (var i = this.ghosts.length - 1; i >= 0; i--) {
      var g = this.ghosts[i];
      var mode = g.state === 'eaten' || g.state === 'entering' ? 'eaten'
               : (g.frightened ? 'frightened' : 'normal');
      if (this.freezeTimer > 0 && g.state === 'eaten' &&
          Math.abs(this.popup.x - g.x) < 1) continue;
      (function (gg, m) {
        this.withWrap(ctx, gg.x, gg.y, function (x, y) {
          P.blit(ctx, P.ghost(gg.name, gg.dir, frame, m, flashing), x, y);
        });
      }).call(this, g, mode);
    }
    if (this.popup) {
      Font.draw(ctx, this.popup.text,
        (this.popup.x - this.popup.text.length * 4) / TILE,
        (this.popup.y - 4) / TILE, this.popup.color);
    }
  };

  /** Draw a sprite, repeating it across the tunnel seam when near an edge. */
  Game.prototype.withWrap = function (ctx, x, y, fn) {
    var w = COLS * TILE;
    fn(x, y);
    if (x < 12) fn(x + w, y);
    else if (x > w - 12) fn(x - w, y);
  };

  /* READY! sits in the chamber below the ghost house - the same tile the
     fruit spawns on - and PLAYER ONE in the chamber above it. */
  Game.prototype.drawOverlayText = function (ctx) {
    if (this.state === 'ready') {
      Font.draw(ctx, 'READY!', 11, 17, '#ffff00');
      if (this.showPlayerOne && this.stateTime < PLAYER_ONE_TIME) {
        Font.draw(ctx, 'PLAYER ONE', 9, 11, '#00ffff');
      }
    } else if (this.state === 'gameover') {
      Font.draw(ctx, 'GAME  OVER', 9, 17, '#ff0000');
      if (Math.floor(this.stateTime * 1.6) % 2 === 0) {
        Font.draw(ctx, 'PRESS SPACE', 8, 23, '#ffffff');
      }
    }
  };

  Game.prototype.drawTitle = function () {
    var ctx = this.ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, Maze.SCREEN_W, Maze.SCREEN_H);
    this.drawHud();

    Font.draw(ctx, 'PAC-MAN', 10, 6, '#ffff00');
    Font.draw(ctx, 'CHARACTER / NICKNAME', 4, 10, '#ffffff');

    var rows = [
      ['blinky', '-SHADOW', '"BLINKY"', '#ff0000'],
      ['pinky', '-SPEEDY', '"PINKY"', '#ffb8ff'],
      ['inky', '-BASHFUL', '"INKY"', '#00ffff'],
      ['clyde', '-POKEY', '"CLYDE"', '#ffb851']
    ];
    var frame = Math.floor(this.animTime * 9) % 2;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i], y = 13 + i * 3;
      Sprites.Pixel.blit(ctx, Sprites.Pixel.ghost(row[0], 'right', frame, 'normal', false),
                         4 * TILE + 4, y * TILE + 4);
      Font.draw(ctx, row[1], 6, y, row[3]);
      Font.draw(ctx, row[2], 17, y, row[3]);
    }

    Maze.drawEnergizerAt(ctx, 10 * TILE, 25 * TILE);
    Font.draw(ctx, '50 PTS', 12, 25, '#ffffff');

    var items = TITLE_ITEMS;
    for (var t = 0; t < items.length; t++) {
      var ty = 27 + t * 2, on = this.titleIndex === t;
      if (on) {
        var bite = (Math.sin(this.animTime * 12) + 1) / 2;
        var cx = (14 - items[t].length / 2) * TILE - 10;
        Sprites.Pixel.blit(ctx, Sprites.Pixel.pacman('right', bite), cx, ty * TILE + 3);
      }
      Font.drawCentered(ctx, items[t], ty, on ? '#ffff00' : '#8080a0');
    }
    if (Mods.isOn('rampage') || Mods.storageUsed() > 0) {
      Font.drawCentered(ctx, 'MODS ACTIVE', 35, '#00ff00');
    } else {
      Font.draw(ctx, '© 1980 NAMCO', 8, 35, '#ffb8ae');
    }
  };

  Game.prototype.drawPaused = function () {
    var ctx = this.ctx;
    ctx.save();
    ctx.translate(0, Maze.MAZE_TOP);
    Font.draw(ctx, 'PAUSED', 11, 20, '#ffff00');
    ctx.restore();
  };

  /* ------------------------------------------------------------------ */

  function boot() {
    var canvas = document.getElementById('screen');
    var game = new Game(canvas);
    if (global.Multiplayer) global.Multiplayer.bindPanel();
    global.pacmanGame = game;      // handy for tests and screenshots

    var last = performance.now();
    function frame(now) {
      var dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      game.update(dt);
      game.render();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.PacmanGame = Game;
})(window);
