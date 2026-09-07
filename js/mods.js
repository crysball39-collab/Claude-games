/* Mods: an in-game mod browser, the Rampage Pac demo, and a hidden dev menu.
 *
 * Everything here hangs off flags the game reads (ghostsFlee, speedScale,
 * wallColor, godmode, pacAngry, pacArmed) so the core rules stay untouched
 * when no mod is enabled.
 */
(function (global) {
  'use strict';

  var STORE_KEY = 'pacman.mods.v1';
  var DISK_FREE = 512;                   // kilobytes of pretend cartridge space

  var CATALOG = [
    { id: 'rampage', name: 'RAMPAGE PAC', size: 128, stock: true,
      blurb: 'PAC-MAN FINALLY SNAPS' },
    { id: 'turbo', name: 'TURBO MAZE', size: 48, stock: false,
      blurb: 'EVERYTHING RUNS 25% FASTER' },
    { id: 'rush', name: 'GHOST RUSH', size: 64, stock: false,
      blurb: 'ALL FOUR GHOSTS START OUTSIDE' },
    { id: 'neon', name: 'NEON NIGHT', size: 96, stock: false,
      blurb: 'THE MAZE CYCLES COLOUR' }
  ];

  var NEON = ['#2121ff', '#8021ff', '#ff21d0', '#ff2160',
              '#ff8021', '#c0ff21', '#21ff80', '#21d0ff'];

  var VERSION = '1.0';
  var TILE = 8;
  var DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  var state = { enabled: {}, installed: {}, showStorage: false };

  /* ---- persistence -------------------------------------------------- */

  function loadState() {
    CATALOG.forEach(function (m) {
      state.installed[m.id] = m.stock;
      state.enabled[m.id] = false;
    });
    try {
      var raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      CATALOG.forEach(function (m) {
        if (raw.installed && m.id in raw.installed) state.installed[m.id] = !!raw.installed[m.id];
        if (raw.enabled && m.id in raw.enabled) state.enabled[m.id] = !!raw.enabled[m.id];
      });
      if ('showStorage' in raw) state.showStorage = !!raw.showStorage;
      state.installed.rampage = true;      // the bundled mod is never removed
    } catch (e) { /* first run, or storage blocked */ }
  }

  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { /* private mode */ }
  }

  function byId(id) {
    for (var i = 0; i < CATALOG.length; i++) if (CATALOG[i].id === id) return CATALOG[i];
    return null;
  }

  function isOn(id) { return !!(state.installed[id] && state.enabled[id]); }

  function storageUsed() {
    var total = 0;
    CATALOG.forEach(function (m) { if (isOn(m.id)) total += m.size; });
    return total;
  }

  /* ---- menu model ---------------------------------------------------- */

  var TABS = ['MODS', 'CHOOSE GHOSTS'];
  var menu = { tab: 0, rows: [], index: 0, ghostIndex: 0,
               download: null, blinkyHits: 0, blinkyShake: 0 };
  var dev = { index: 0, level: 1, speed: 1, god: false, unlocked: false };

  var BLINKY_TILE = { c: 24, r: 34 };   // clear of the footer hint

  function layout() {
    var rows = [], y = 5;
    rows.push({ kind: 'head', text: 'INSTALLED', row: y }); y += 2;
    CATALOG.forEach(function (m) {
      if (state.installed[m.id]) { rows.push({ kind: 'mod', id: m.id, row: y }); y += 2; }
    });
    var pending = CATALOG.filter(function (m) { return !state.installed[m.id]; });
    if (pending.length) {
      y += 1;
      rows.push({ kind: 'head', text: 'DOWNLOADABLE', row: y }); y += 2;
      pending.forEach(function (m) { rows.push({ kind: 'dl', id: m.id, row: y }); y += 2; });
    }
    y += 1;
    rows.push({ kind: 'storage', row: y }); y += 2;
    rows.push({ kind: 'back', row: y }); y += 2;
    menu.rows = rows;
    menu.endRow = y;
    if (!selectable(menu.index)) menu.index = firstSelectable();
    return rows;
  }

  function selectable(i) { return menu.rows[i] && menu.rows[i].kind !== 'head'; }
  function firstSelectable() {
    for (var i = 0; i < menu.rows.length; i++) if (selectable(i)) return i;
    return 0;
  }

  function move(step) {
    var i = menu.index;
    for (var n = 0; n < menu.rows.length; n++) {
      i = (i + step + menu.rows.length) % menu.rows.length;
      if (selectable(i)) { menu.index = i; return; }
    }
  }

  function openMenu(game) {
    layout();
    menu.tab = 0;
    menu.index = firstSelectable();
    menu.blinkyHits = 0;
    menu.download = null;
    game.state = 'mods';
    game.stateTime = 0;
  }

  function activate(game) {
    var row = menu.rows[menu.index];
    if (!row) return;
    if (row.kind === 'mod') {
      state.enabled[row.id] = !state.enabled[row.id];
      saveState();
      global.Sound.accept();
    } else if (row.kind === 'dl') {
      if (menu.download) return;
      menu.download = { id: row.id, t: 0, dur: 1.6 };
      global.Sound.blip();
    } else if (row.kind === 'storage') {
      state.showStorage = !state.showStorage;
      saveState();
      global.Sound.blip();
    } else if (row.kind === 'back') {
      game.state = 'title';
      game.stateTime = 0;
      global.Sound.blip();
    }
  }

  function updateMenu(game, dt) {
    menu.blinkyShake = Math.max(0, menu.blinkyShake - dt * 4);
    if (menu.download) {
      menu.download.t += dt;
      if (menu.download.t >= menu.download.dur) {
        state.installed[menu.download.id] = true;
        state.enabled[menu.download.id] = true;
        saveState();
        menu.download = null;
        layout();
        global.Sound.accept();
      }
    }
  }

  /* ---- menu rendering ------------------------------------------------ */

  function drawBar(ctx, col, row, widthTiles, frac, color) {
    var x = col * TILE, y = row * TILE + 2, w = widthTiles * TILE;
    ctx.fillStyle = '#333355';
    ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, frac))), 4);
  }

  function drawTabs(ctx) {
    var F = global.Font;
    var cols = [4, 11];
    for (var i = 0; i < TABS.length; i++) {
      var on = menu.tab === i;
      F.draw(ctx, TABS[i], cols[i], 3, on ? '#ffff00' : '#606078');
      if (on) {
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(cols[i] * TILE, 3 * TILE + 8, TABS[i].length * TILE - 2, 1);
      }
    }
    F.draw(ctx, '<', 1, 3, '#404060');
    F.draw(ctx, '>', 26, 3, '#404060');
  }

  function drawMenu(game, ctx) {
    var F = global.Font, P = global.Sprites.Pixel;
    drawTabs(ctx);
    if (menu.tab === 1) { drawGhostTab(game, ctx); return; }

    for (var i = 0; i < menu.rows.length; i++) {
      var row = menu.rows[i], y = row.row, sel = i === menu.index;
      if (row.kind === 'head') { F.draw(ctx, row.text, 2, y, '#00ffff'); continue; }

      if (sel) {
        var bite = (Math.sin(game.animTime * 12) + 1) / 2;
        P.blit(ctx, P.pacman('right', bite), 2 * TILE + 4, y * TILE + 3);
      }

      if (row.kind === 'mod') {
        var m = byId(row.id), on = state.enabled[row.id];
        F.draw(ctx, m.name, 4, y, sel ? '#ffffff' : '#c0c0d0');
        F.drawRight(ctx, m.size + 'K', 21, y, '#8080a0');
        F.draw(ctx, on ? 'ON' : 'OFF', 23, y, on ? '#00ff00' : '#806060');
      } else if (row.kind === 'dl') {
        var d = byId(row.id);
        F.draw(ctx, d.name, 4, y, sel ? '#ffffff' : '#c0c0d0');
        F.drawRight(ctx, d.size + 'K', 21, y, '#8080a0');
        if (menu.download && menu.download.id === row.id) {
          drawBar(ctx, 23, y, 4, menu.download.t / menu.download.dur, '#00ffff');
        } else {
          F.draw(ctx, 'GET', 23, y, '#ffb851');
        }
      } else if (row.kind === 'storage') {
        F.draw(ctx, 'SHOW NEEDED STORAGE', 4, y, sel ? '#ffffff' : '#c0c0d0');
        F.draw(ctx, state.showStorage ? 'ON' : 'OFF', 24, y,
               state.showStorage ? '#00ff00' : '#806060');
      } else if (row.kind === 'back') {
        F.draw(ctx, 'BACK', 4, y, sel ? '#ffffff' : '#c0c0d0');
      }
    }

    var y2 = menu.endRow;

    var cur = menu.rows[menu.index];
    if (cur && (cur.kind === 'mod' || cur.kind === 'dl')) {
      F.drawCentered(ctx, byId(cur.id).blurb, y2, '#ffb8ae');
    }
    y2 += 2;

    if (state.showStorage) {
      F.draw(ctx, 'NEEDED STORAGE', 2, y2, '#00ffff');
      y2 += 2;
      var used = storageUsed();
      CATALOG.forEach(function (m) {
        if (!isOn(m.id)) return;
        F.draw(ctx, m.name, 4, y2, '#c0c0d0');
        F.drawRight(ctx, m.size + 'K', 24, y2, '#ffb851');
        y2 += 1;
      });
      if (used === 0) { F.draw(ctx, 'NOTHING ENABLED', 4, y2, '#806060'); y2 += 1; }
      y2 += 1;
      F.draw(ctx, 'TOTAL', 4, y2, '#ffffff');
      F.drawRight(ctx, used + 'K OF ' + DISK_FREE + 'K', 24, y2,
                  used > DISK_FREE ? '#ff0000' : '#ffffff');
      y2 += 1;
      drawBar(ctx, 4, y2, 20, used / DISK_FREE, used > DISK_FREE ? '#ff0000' : '#00ff00');
    }

    F.drawCentered(ctx, 'SPACE SELECT   P BACK', 33, '#6060a0');

    // Blinky loiters in the corner. He is also the way into the dev menu.
    var shake = menu.blinkyShake > 0 ? Math.sin(menu.blinkyShake * 40) * 2 : 0;
    var frame = Math.floor(game.animTime * 9) % 2;
    P.blit(ctx, P.ghost('blinky', 'left', frame, 'normal', false),
           BLINKY_TILE.c * TILE + 4 + shake, BLINKY_TILE.r * TILE + 4);
    if (menu.blinkyHits >= 7 && menu.blinkyHits < 10) {
      F.draw(ctx, '?', BLINKY_TILE.c - 2, BLINKY_TILE.r, '#ff0000');
    }
    F.draw(ctx, 'V' + VERSION, 1, 33, '#303050');
  }

  /* ---- CHOOSE GHOSTS tab --------------------------------------------- */

  var CARD_ROWS = [7, 12, 17, 22];
  var BACK_ROW = 29;

  function ghostRoster() { return global.ExtraGhosts.ROSTER; }
  function ghostRowCount() { return ghostRoster().length + 1; }   // + BACK

  function drawGhostTab(game, ctx) {
    var F = global.Font, P = global.Sprites.Pixel, E = global.ExtraGhosts;
    var roster = ghostRoster();
    var frame = Math.floor(game.animTime * 9) % 2;

    for (var i = 0; i < roster.length; i++) {
      var d = roster[i], y = CARD_ROWS[i], sel = menu.ghostIndex === i, on = E.isOn(d.id);

      if (sel) {
        var bite = (Math.sin(game.animTime * 12) + 1) / 2;
        P.blit(ctx, P.pacman('right', bite), 4, y * TILE + 7);
      }
      // Sprite, in its own colour, facing the reader.
      P.blit(ctx, P.ghost(d.id, 'right', frame, 'normal', false), 2 * TILE + 4, y * TILE + 7);

      F.draw(ctx, d.name + ' "' + d.nick + '"', 5, y, on ? d.color : '#707086');
      F.draw(ctx, on ? 'ON' : 'OFF', 25, y, on ? '#00ff00' : '#806060');
      F.draw(ctx, d.colorName + ' - ' + d.role, 5, y + 1, on ? '#c0c0d0' : '#606078');
      F.draw(ctx, d.blurb, 5, y + 2, on ? '#ffb8ae' : '#5a5a70');
    }

    var count = E.activeCount();
    F.drawCentered(ctx, count + ' EXTRA + 4 ORIGINAL = ' + (count + 4), 26, '#00ffff');

    var backSel = menu.ghostIndex === roster.length;
    if (backSel) {
      var b2 = (Math.sin(game.animTime * 12) + 1) / 2;
      P.blit(ctx, P.pacman('right', b2), 3 * TILE + 4, BACK_ROW * TILE + 3);
    }
    F.draw(ctx, 'BACK', 5, BACK_ROW, backSel ? '#ffffff' : '#c0c0d0');
    F.drawCentered(ctx, 'SPACE TOGGLE   P BACK', 33, '#6060a0');
  }

  function ghostActivate(game) {
    var roster = ghostRoster();
    if (menu.ghostIndex >= roster.length) {
      game.state = 'title'; game.stateTime = 0; global.Sound.blip();
      return;
    }
    global.ExtraGhosts.toggle(roster[menu.ghostIndex].id);
    global.Sound.accept();
  }

  /* ---- dev menu ------------------------------------------------------ */

  var DEV_ROWS = ['level', 'speed', 'god', 'start', 'back'];

  function openDev(game) {
    dev.index = 0;
    dev.unlocked = true;
    game.state = 'dev';
    game.stateTime = 0;
    global.Sound.accept();
  }

  function devAdjust(step) {
    var k = DEV_ROWS[dev.index];
    if (k === 'level') dev.level = Math.max(1, Math.min(21, dev.level + step));
    else if (k === 'speed') dev.speed = Math.max(0.25, Math.min(3, +(dev.speed + step * 0.25).toFixed(2)));
    else if (k === 'god') dev.god = !dev.god;
    else return false;
    global.Sound.blip();
    return true;
  }

  function devActivate(game) {
    var k = DEV_ROWS[dev.index];
    if (k === 'start') {
      global.Sound.accept();
      game.startModdedGame(dev.level);
    } else if (k === 'back') {
      global.Sound.blip();
      openMenu(game);
    } else {
      devAdjust(1);
    }
  }

  function drawDev(game, ctx) {
    var F = global.Font, P = global.Sprites.Pixel;
    F.drawCentered(ctx, 'DEV MENU', 4, '#ff0000');
    F.drawCentered(ctx, 'NOT FOR PLAYERS', 6, '#806060');

    var labels = {
      level: ['SET LEVEL', String(dev.level)],
      speed: ['SET SPEED', dev.speed.toFixed(2) + 'X'],
      god: ['GODMODE', dev.god ? 'ON' : 'OFF'],
      start: ['START GAME', ''],
      back: ['BACK', '']
    };
    for (var i = 0; i < DEV_ROWS.length; i++) {
      var k = DEV_ROWS[i], y = 10 + i * 3, sel = i === dev.index;
      if (sel) {
        var bite = (Math.sin(game.animTime * 12) + 1) / 2;
        P.blit(ctx, P.pacman('right', bite), 3 * TILE + 4, y * TILE + 3);
      }
      F.draw(ctx, labels[k][0], 5, y, sel ? '#ffffff' : '#c0c0d0');
      if (labels[k][1]) {
        F.draw(ctx, '<', 18, y, sel ? '#ffff00' : '#505070');
        F.draw(ctx, labels[k][1], 20, y, '#00ffff');
        F.draw(ctx, '>', 25, y, sel ? '#ffff00' : '#505070');
      }
    }
    F.drawCentered(ctx, 'LEFT/RIGHT CHANGE', 28, '#6060a0');
    F.drawCentered(ctx, 'SPACE SELECT   P BACK', 30, '#6060a0');
  }

  /* ---- Rampage Pac --------------------------------------------------- */

  /* Beats are [start time, speaker, lines]; the READY! phase is held open
     until the script finishes. */
  var SCRIPT = [
    { t: 0.9, who: 'PAC-MAN', color: '#ffff00', lines: ['I HAD ENOUGH!'] },
    { t: 3.1, who: 'BLINKY', color: '#ff0000', lines: ['P-PACMAN? WHAT ARE', 'YOU DOIN-'] },
    { t: 5.9, who: null, color: '#ffffff', lines: ['*CH-CHK*'], arm: true },
    { t: 7.4, who: null, lines: null, end: true }
  ];

  function beginCutscene(game) {
    game.cutscene = { t: 0, beat: -1 };
  }

  /** @return {boolean} true while the cutscene is still holding READY! */
  function updateCutscene(game, dt) {
    var cs = game.cutscene;
    if (!cs) return false;
    cs.t += dt;
    for (var i = SCRIPT.length - 1; i >= 0; i--) {
      if (cs.t >= SCRIPT[i].t) {
        if (cs.beat !== i) {
          cs.beat = i;
          if (SCRIPT[i].arm) { game.pacArmed = true; global.Sound.pump(); }
          if (SCRIPT[i].end) {
            game.cutscene = null;
            game.ghostsFlee = true;
            return false;
          }
        }
        break;
      }
    }
    return true;
  }

  function drawCutscene(game, ctx) {
    var cs = game.cutscene;
    if (!cs || cs.beat < 0) return;
    var beat = SCRIPT[cs.beat];
    if (!beat.lines) return;
    var F = global.Font;
    var top = 19, height = beat.lines.length + 2;

    ctx.fillStyle = '#000000';
    ctx.fillRect(1 * TILE, top * TILE, 26 * TILE, height * TILE);
    ctx.strokeStyle = beat.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(1 * TILE + 0.5, top * TILE + 0.5, 26 * TILE - 1, height * TILE - 1);

    if (beat.who) {
      // Seat the speaker on the frame, clearing the border behind it.
      var label = beat.who + ':';
      ctx.fillStyle = '#000000';
      ctx.fillRect(3 * TILE - 2, top * TILE, label.length * TILE + 4, TILE);
      F.draw(ctx, label, 3, top, beat.color);
    }
    for (var i = 0; i < beat.lines.length; i++) {
      F.drawCentered(ctx, beat.lines[i], top + 1 + i, beat.color);
    }
  }

  /** Hit-scan down the corridor Pac-Man faces; the first ghost in it drops. */
  function shoot(game) {
    if (!game.ghostsFlee || !game.pacArmed) return;
    if (game.shootCooldown > 0 || game.state !== 'playing') return;
    game.shootCooldown = 0.42;
    game.muzzle = 0.18;
    global.Sound.shotgun();

    var Maze = global.Maze;
    var v = DIRV[game.pac.dir];
    var c = Math.floor(game.pac.x / TILE), r = Math.floor(game.pac.y / TILE);
    for (var i = 1; i <= 24; i++) {
      var nc = ((c + v[0] * i) % Maze.COLS + Maze.COLS) % Maze.COLS;
      var nr = r + v[1] * i;
      if (Maze.isWall(nc, nr)) break;
      for (var g = 0; g < game.ghosts.length; g++) {
        var gh = game.ghosts[g];
        if (gh.state !== 'normal') continue;
        var gc = ((Math.floor(gh.x / TILE) % Maze.COLS) + Maze.COLS) % Maze.COLS;
        if (gc === nc && Math.floor(gh.y / TILE) === nr) {
          var down = game.ghosts.filter(function (o) { return o.state !== 'normal'; }).length;
          var pts = 200 * Math.pow(2, Math.min(down, 3));
          game.addScore(pts);
          game.popup = { x: gh.x, y: gh.y, text: String(pts), t: 0.9, color: '#00ffff' };
          gh.state = 'eaten';
          gh.frightened = false;
          return;
        }
      }
    }
  }

  /* ---- integration hooks --------------------------------------------- */

  /** Apply enabled mods to a level that is about to start. */
  function onLevelStart(game) {
    game.speedScale = (dev.unlocked ? dev.speed : 1) * (isOn('turbo') ? 1.25 : 1);
    game.godmode = dev.unlocked && dev.god;
    game.wallColor = null;
    game.pacAngry = false;
    game.pacArmed = false;
    game.ghostsFlee = false;
    game.cutscene = null;
    game.shootCooldown = 0;
    game.muzzle = 0;

    if (isOn('rush')) {
      game.ghosts.forEach(function (g) {
        g.dotLimit = 0;
        if (g.state === 'house') game.leaveHouse(g);
      });
      global.ExtraGhosts.releaseWaiting(game, true);
    }
    // Only the player who switched the mod on is affected by it. In two
    // player that is the local human; the opponent plays a normal game and is
    // never told any of this is happening.
    game.players.forEach(function (p) { p.armedOwner = false; });
    if (isOn('rampage')) {
      game.players[0].armedOwner = true;
      // Level 1 is untouched; the brows arrive on 2 and he snaps on 3.
      game.pacAngry = game.level >= 2;
      if (game.level === 3) beginCutscene(game);
    }
  }

  function onFrame(game, dt) {
    if (isOn('neon')) {
      game.wallColor = NEON[Math.floor(game.globalTime * 2) % NEON.length];
    }
    if (game.shootCooldown > 0) game.shootCooldown -= dt;
    if (game.muzzle > 0) game.muzzle -= dt;
  }

  /** @return {boolean} true if the mod handled the level ending. */
  function onLevelCleared(game) {
    if (isOn('rampage') && game.level === 3) {
      game.state = 'moddemoend';
      game.stateTime = 0;
      global.Sound.stopBackground();
      return true;
    }
    return false;
  }

  function drawDemoEnd(game, ctx) {
    var F = global.Font;
    F.drawCentered(ctx, 'MOD DEMO END', 14, '#ffff00');
    F.drawCentered(ctx, 'RAMPAGE PAC', 17, '#ff0000');
    F.drawCentered(ctx, 'THANKS FOR PLAYING', 20, '#ffffff');
    if (Math.floor(game.stateTime * 1.6) % 2 === 0) {
      F.drawCentered(ctx, 'SPACE FOR MENU', 24, '#00ffff');
    }
  }

  /* ---- input --------------------------------------------------------- */

  function handleInput(game, action) {
    if (game.state === 'mods') {
      if (action === 'left' || action === 'right') {
        menu.tab = (menu.tab + (action === 'right' ? 1 : TABS.length - 1)) % TABS.length;
        global.Sound.blip();
        return true;
      }
      if (menu.tab === 1) {
        var n = ghostRowCount();
        if (action === 'up') { menu.ghostIndex = (menu.ghostIndex + n - 1) % n; global.Sound.blip(); }
        else if (action === 'down') { menu.ghostIndex = (menu.ghostIndex + 1) % n; global.Sound.blip(); }
        else if (action === 'select') ghostActivate(game);
        else if (action === 'back') { game.state = 'title'; game.stateTime = 0; }
        return true;
      }
      if (action === 'up') { move(-1); global.Sound.blip(); }
      else if (action === 'down') { move(1); global.Sound.blip(); }
      else if (action === 'select') activate(game);
      else if (action === 'back') { game.state = 'title'; game.stateTime = 0; }
      return true;
    }
    if (game.state === 'dev') {
      if (action === 'up') { dev.index = (dev.index + DEV_ROWS.length - 1) % DEV_ROWS.length; global.Sound.blip(); }
      else if (action === 'down') { dev.index = (dev.index + 1) % DEV_ROWS.length; global.Sound.blip(); }
      else if (action === 'left') devAdjust(-1);
      else if (action === 'right') devAdjust(1);
      else if (action === 'select') devActivate(game);
      else if (action === 'back') openMenu(game);
      return true;
    }
    if (game.state === 'moddemoend') {
      if (action === 'select' || action === 'back') openMenu(game);
      return true;
    }
    return false;
  }

  /** Taps land on tile coordinates so menu rows and Blinky can be hit. */
  function handleTap(game, col, row) {
    if (game.state !== 'mods') return false;

    // The tab strip is tappable.
    if (row === 3) {
      menu.tab = col < 10 ? 0 : 1;
      global.Sound.blip();
      return true;
    }
    if (menu.tab === 1) {
      var roster = ghostRoster();
      for (var k = 0; k < roster.length; k++) {
        if (row >= CARD_ROWS[k] && row <= CARD_ROWS[k] + 2) {
          menu.ghostIndex = k; ghostActivate(game); return true;
        }
      }
      if (row >= BACK_ROW && row <= BACK_ROW + 1) {
        menu.ghostIndex = roster.length; ghostActivate(game); return true;
      }
      return false;
    }
    if (Math.abs(col - BLINKY_TILE.c) <= 1 && Math.abs(row - BLINKY_TILE.r) <= 1) {
      menu.blinkyHits++;
      menu.blinkyShake = 1;
      global.Sound.blip();
      if (menu.blinkyHits >= 10) { menu.blinkyHits = 0; openDev(game); }
      return true;
    }
    for (var i = 0; i < menu.rows.length; i++) {
      if (!selectable(i)) continue;
      if (Math.abs(row - menu.rows[i].row) <= 0) { menu.index = i; activate(game); return true; }
    }
    return false;
  }

  loadState();

  global.Mods = {
    CATALOG: CATALOG,
    BLINKY_TILE: BLINKY_TILE,
    state: state,
    dev: dev,
    menu: menu,
    isOn: isOn,
    storageUsed: storageUsed,
    openMenu: openMenu,
    TABS: TABS,
    CARD_ROWS: CARD_ROWS,
    openDev: openDev,
    updateMenu: updateMenu,
    drawMenu: drawMenu,
    drawDev: drawDev,
    updateCutscene: updateCutscene,
    drawCutscene: drawCutscene,
    drawDemoEnd: drawDemoEnd,
    onLevelStart: onLevelStart,
    onFrame: onFrame,
    onLevelCleared: onLevelCleared,
    shoot: shoot,
    handleInput: handleInput,
    handleTap: handleTap,
    layout: layout
  };
})(window);
