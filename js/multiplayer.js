/* Two-player mode, the matchmaking stand-in, and the chat panel.
 *
 * There is no server behind this build - it is one offline HTML file - so the
 * lobby always comes back empty and you are seated with a CPU opponent. The
 * seam is deliberate: everything below talks to `transport`, so dropping in a
 * real socket later means replacing that object and nothing else.
 */
(function (global) {
  'use strict';

  var TILE = 8;

  var state = {
    active: false,
    phase: 'idle',            // searching | nobody | matched | playing
    phaseTime: 0,
    bot: null,
    log: [],                  // {who: 'you'|'them'|'system', text}
    pending: [],              // bot lines waiting out their typing delay
    typing: false,
    idleTimer: 0,
    unread: 0
  };

  /* ---- transport ------------------------------------------------------ */

  /* The only thing that knows a human is not on the other end. */
  var transport = {
    search: function (onResult) {
      // A real build would open a socket here; this one finds nobody.
      setTimeout(function () { onResult({ players: [] }); }, 1600);
    },
    send: function (text) {
      // Outbound chat. With no peer, the bot answers locally instead.
      if (state.bot) queueBotReply(text);
    }
  };

  /* ---- chat ----------------------------------------------------------- */

  function push(who, text) {
    state.log.push({ who: who, text: text });
    if (state.log.length > 60) state.log.shift();
    if (who === 'them' && !panelOpen()) state.unread++;
    render();
  }

  function queueBotReply(text) {
    var game = global.pacmanGame;
    var r = global.Chatbot.reply(state.bot, text, game);
    state.pending.push({ text: r.text, at: r.delay });
    state.typing = true;
    render();
  }

  function botReact(kind) {
    if (!state.bot || state.phase !== 'playing') return;
    var r = global.Chatbot.react(state.bot, kind, global.pacmanGame);
    if (!r) return;
    state.pending.push({ text: r.text, at: r.delay });
    state.typing = true;
  }

  function sendFromPlayer(text) {
    text = String(text || '').trim();
    if (!text) return;
    push('you', text);
    state.idleTimer = 0;
    transport.send(text);
  }

  /* ---- panel ---------------------------------------------------------- */

  var els = {};

  function panelOpen() {
    return els.panel && els.panel.classList.contains('open');
  }

  function setOpen(open) {
    if (!els.panel) return;
    els.panel.classList.toggle('open', open);
    document.body.classList.toggle('chat-open', open);
    if (open) { state.unread = 0; if (els.input) els.input.focus(); }
    render();
  }

  function bindPanel() {
    els.panel = document.getElementById('chat');
    els.logEl = document.getElementById('chatlog');
    els.input = document.getElementById('chatinput');
    els.send = document.getElementById('chatsend');
    els.close = document.getElementById('chatclose');
    els.badge = document.getElementById('chatbadge');
    if (!els.panel) return;

    els.send.addEventListener('click', function () {
      sendFromPlayer(els.input.value);
      els.input.value = '';
      els.input.focus();
    });
    els.input.addEventListener('keydown', function (e) {
      // Keep game keys out of the text box, and vice versa.
      e.stopPropagation();
      if (e.key === 'Enter') {
        sendFromPlayer(els.input.value);
        els.input.value = '';
      } else if (e.key === 'Escape') {
        els.input.blur();
      }
    });
    els.close.addEventListener('click', function () { setOpen(false); });
  }

  function render() {
    if (!els.logEl) return;
    var html = '';
    for (var i = 0; i < state.log.length; i++) {
      var m = state.log[i];
      var name = m.who === 'you' ? 'YOU'
               : m.who === 'them' ? (state.bot ? state.bot.handle : 'THEM')
               : '';
      html += '<div class="msg ' + m.who + '">' +
              (name ? '<b>' + escapeHtml(name) + '</b> ' : '') +
              escapeHtml(m.text) + '</div>';
    }
    if (state.typing) {
      html += '<div class="msg them typing"><b>' +
              escapeHtml(state.bot ? state.bot.handle : 'THEM') +
              '</b> <i>typing...</i></div>';
    }
    els.logEl.innerHTML = html;
    els.logEl.scrollTop = els.logEl.scrollHeight;
    if (els.badge) {
      els.badge.textContent = state.unread ? String(state.unread) : '';
      els.badge.style.display = state.unread ? 'inline-block' : 'none';
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /* ---- lifecycle ------------------------------------------------------ */

  function startTwoPlayer(game) {
    state.active = true;
    state.phase = 'searching';
    state.phaseTime = 0;
    state.log = [];
    state.pending = [];
    state.typing = false;
    state.unread = 0;
    state.bot = null;
    game.state = 'matching';
    game.stateTime = 0;
    document.body.classList.add('two-player');
    render();

    transport.search(function (result) {
      if (result.players.length) return;        // a real peer would connect here
      state.phase = 'nobody';
      state.phaseTime = 0;
      state.bot = global.Chatbot.create();
    });
  }

  function beginMatch(game) {
    state.phase = 'playing';
    game.startTwoPlayerGame();
    push('system', 'matched with ' + state.bot.handle + ' (cpu)');
    setTimeout(function () {
      if (state.phase === 'playing') {
        push('them', global.Chatbot.reply(state.bot, 'hi', global.pacmanGame).text);
      }
    }, 900);
  }

  function stop(game) {
    state.active = false;
    state.phase = 'idle';
    state.bot = null;
    document.body.classList.remove('two-player');
    setOpen(false);
  }

  /* ---- per-frame ------------------------------------------------------ */

  function update(game, dt) {
    if (!state.active) return;
    state.phaseTime += dt;

    if (game.state === 'matching') {
      if (state.phase === 'nobody' && state.phaseTime > 1.4) beginMatch(game);
      return;
    }

    // Release any bot lines whose typing delay has elapsed.
    for (var i = state.pending.length - 1; i >= 0; i--) {
      state.pending[i].at -= dt;
      if (state.pending[i].at <= 0) {
        var line = state.pending.splice(i, 1)[0];
        state.typing = state.pending.length > 0;
        push('them', line.text);
      }
    }
    if (state.typing !== (state.pending.length > 0)) {
      state.typing = state.pending.length > 0;
      render();
    }

    // Unprompted chatter when the room has gone quiet.
    if (state.phase === 'playing' && game.state === 'playing') {
      state.idleTimer += dt;
      if (state.idleTimer > 18 + Math.random() * 20) {
        state.idleTimer = 0;
        botReact('idle');
      }
    }
  }

  /** Called by the game when something worth commenting on happens. */
  function notify(kind) { botReact(kind); }

  function drawMatching(game, ctx) {
    var F = global.Font;
    var dots = '.'.repeat(1 + Math.floor(game.stateTime * 2) % 3);
    F.drawCentered(ctx, '2 PLAYER', 10, '#ffff00');
    if (state.phase === 'searching') {
      F.drawCentered(ctx, 'SEARCHING FOR PLAYERS' + dots, 15, '#ffffff');
      F.drawCentered(ctx, 'PLEASE WAIT', 18, '#6060a0');
    } else {
      F.drawCentered(ctx, 'NO PLAYERS ONLINE', 15, '#ff0000');
      F.drawCentered(ctx, 'MATCHING WITH CPU', 18, '#00ffff');
      if (state.bot) F.drawCentered(ctx, state.bot.handle, 21, '#7cff3c');
    }
  }

  global.Multiplayer = {
    state: state,
    transport: transport,
    startTwoPlayer: startTwoPlayer,
    stop: stop,
    update: update,
    notify: notify,
    drawMatching: drawMatching,
    bindPanel: bindPanel,
    setOpen: setOpen,
    toggle: function () { setOpen(!panelOpen()); },
    isOpen: panelOpen,
    send: sendFromPlayer,
    push: push
  };
})(window);
