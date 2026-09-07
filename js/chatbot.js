/* The stand-in opponent's chat.
 *
 * This is a rule-based conversationalist, not a language model: it scores the
 * message against an intent table, then answers from a bank of variants that
 * can splice in live game state. It knows the arcade properly - dot counts,
 * ghost behaviour, fruit values, timings - so questions about the game get
 * real answers rather than filler. It will not follow you anywhere you like,
 * but it holds a game conversation and reacts to what is happening on screen.
 */
(function (global) {
  'use strict';

  var HANDLES = [
    'pelletgoblin', 'wakawaka_99', 'inkyhater', 'blinkydodger', 'quarterpusher',
    'mazerat', 'turn3', 'ghostbait', 'cherrypicked', 'kill_screen', 'nine_lives',
    'splitscreen', 'coinop_kid', 'fruitloop', 'patternless'
  ];

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function chance(p) { return Math.random() < p; }

  function create() {
    return {
      handle: pick(HANDLES) + (chance(0.4) ? String(Math.floor(Math.random() * 90) + 10) : ''),
      warmth: 0.5 + Math.random() * 0.5,     // how friendly the replies skew
      chatty: 0.4 + Math.random() * 0.5,     // how often it speaks unprompted
      knownName: null,
      said: {},                              // avoids repeating the same line
      lastEvent: 0
    };
  }

  /* ---- what it knows about the game ---------------------------------- */

  var FACTS = {
    dots: 'the maze has 240 dots and 4 energisers, 244 total. clear them all and the level flips.',
    blinky: 'blinky just beelines at your tile. he also speeds up as the maze empties - cruise elroy.',
    pinky: 'pinky aims 4 tiles ahead of you, so she cuts corners. if you face up her target overshoots up AND left, thats the old bug.',
    inky: 'inky is the weird one. he doubles the line from blinky to two tiles in front of you. he gets nasty when blinky is close.',
    clyde: 'clyde chases you until hes within 8 tiles then bails to his corner. hes basically shy.',
    lumo: 'lumo runs the corridor in front of you, round corners and all. hard to shake.',
    vexa: 'vexa comes in from the side, and she picks whichever side nobodys covering.',
    grimm: 'grimm goes to the junction youre heading for and just waits there. i hate that one.',
    nox: 'nox backs off when you get close then comes back in. feels like hes toying with you.',
    fruit: 'cherry 100, strawberry 300, orange 500, apple 700, melon 1000, galaxian 2000, bell 3000, key 5000. it shows up at 70 and 170 dots.',
    ghosts: 'eating ghosts on one energiser goes 200, 400, 800, 1600. all four is 3000.',
    extra: 'extra life at 10000 points.',
    tunnel: 'use the tunnel, ghosts crawl through it. thats your free escape.',
    scatter: 'they alternate scatter and chase. first scatter is 7 seconds, then 20 chasing, and the scatters get shorter each time.',
    energiser: 'dont pop an energiser early, wait until two or three of them are near you.',
    speed: 'youre slightly slower than the ghosts on level 1 but you dont slow down in the tunnel. thats the whole trick.',
    corner: 'you cut corners tighter than they do. thats where you actually gain ground.'
  };

  /* ---- intents -------------------------------------------------------- */

  function has(text, words) {
    for (var i = 0; i < words.length; i++) if (text.indexOf(words[i]) >= 0) return true;
    return false;
  }

  var INTENTS = [
    { id: 'greet', words: ['hi', 'hey', 'hello', 'yo', 'sup', 'howdy', 'hiya'],
      lines: ['hey', 'yo', 'hey hey', 'sup', 'hi :)', 'oh hey, didnt see you join'] },

    { id: 'howareyou', words: ['how are you', 'how r u', 'you good', 'you ok', 'hows it going', 'how you doing'],
      lines: ['not bad, bit rusty', 'good! havent played this in ages', 'fine, losing though',
              'alright. you?', 'ive been better, that last life was embarrassing'] },

    { id: 'bot', words: ['are you a bot', 'you a bot', 'r u a bot', 'are you real', 'are you human', 'youre a bot', 'ai?'],
      lines: ['ha. why does everyone ask that', 'if i was a bot id be winning',
              'no but ill take that as a compliment', 'im as real as this maze is',
              'people keep asking me that. is my typing weird'] },

    { id: 'name', words: ['your name', 'whats your name', 'who are you', 'what do i call you'],
      lines: ['im $HANDLE', '$HANDLE. or just call me whatever', '$HANDLE, been using it for years'] },

    { id: 'myname', words: ['my name is', 'im called', 'call me', 'name\'s'], capture: true,
      lines: ['nice to meet you $NAME', 'alright $NAME, lets go', 'got it, $NAME'] },

    { id: 'where', words: ['where are you', 'where you from', 'what country', 'timezone'],
      lines: ['nowhere interesting', 'somewhere with bad wifi', 'far enough that this is 2am for me',
              'does it matter? we both got the same maze'] },

    { id: 'age', words: ['how old', 'your age'],
      lines: ['old enough to have fed a real cabinet quarters', 'older than this game? no. close though',
              'rude', 'old enough to know 244 dots by heart'] },

    { id: 'help', words: ['help', 'tip', 'advice', 'how do i', 'how to', 'any tips', 'stuck', 'strategy'],
      facts: ['energiser', 'tunnel', 'corner', 'speed'],
      lines: ['ok listen. $FACT', 'honestly? $FACT', '$FACT thats the main thing', 'easy. $FACT'] },

    { id: 'ghostq', words: ['blinky', 'pinky', 'inky', 'clyde', 'lumo', 'vexa', 'grimm', 'nox', 'red one', 'pink one'],
      lines: ['$FACT', 'oh $FACT', '$FACT hes the worst', '$FACT you get used to it'] },

    { id: 'gameq', words: ['dot', 'pellet', 'fruit', 'cherry', 'score', 'points', 'energiser', 'energizer',
                           'power pellet', 'extra life', 'scatter', 'chase', 'tunnel', 'how many'],
      lines: ['$FACT', 'pretty sure $FACT', '$FACT. i looked it up once and never forgot'] },

    { id: 'trash', words: ['easy', 'you suck', 'youre bad', 'ez', 'get good', 'trash', 'noob', 'im better'],
      lines: ['bold for someone on $LIVES lives', 'ok, scoreboard says $SCORES',
              'talk after this level', 'we will see', 'thats the confidence of a man about to walk into pinky'] },

    { id: 'praise', words: ['nice', 'good one', 'gg', 'well played', 'wp', 'sick', 'clean', 'impressive'],
      lines: ['ty', 'thanks!', 'got lucky', 'i had that planned. obviously', 'gg', ':)'] },

    { id: 'sorry', words: ['sorry', 'my bad', 'oops'],
      lines: ['youre fine', 'no worries', 'happens', 'dont apologise to me, apologise to the ghosts'] },

    { id: 'thanks', words: ['thanks', 'thank you', 'ty', 'cheers'],
      lines: ['np', 'anytime', 'no problem', 'sure'] },

    { id: 'laugh', words: ['lol', 'haha', 'lmao', 'rofl', 'xd', 'hah'],
      lines: ['haha', 'lol', 'right?', 'glad someone finds it funny', 'ha'] },

    { id: 'yes', words: ['yes', 'yeah', 'yep', 'sure', 'true', 'agreed', 'exactly'],
      lines: ['right', 'yeah', 'exactly', 'thats what im saying'] },

    { id: 'no', words: ['no ', 'nope', 'nah', 'wrong', 'disagree'],
      lines: ['fair', 'hm, ok', 'suit yourself', 'agree to disagree then'] },

    { id: 'bye', words: ['bye', 'gtg', 'gotta go', 'later', 'cya', 'see ya', 'leaving'],
      lines: ['later!', 'gg, take care', 'cya. one more?', 'aw. gg'] },

    { id: 'favourite', words: ['favourite', 'favorite', 'best game', 'like this game', 'do you like'],
      lines: ['this one, obviously', 'ms pac is better but dont tell anyone',
              'i go through phases. right now its this', 'anything with a maze honestly'] },

    { id: 'mods', words: ['mod', 'mods', 'cheat', 'hack', 'shotgun', 'rampage'],
      lines: ['mods? in pac man?', 'never used any. feels wrong',
              'i just play it straight', 'i wouldnt know, i play vanilla'] },

    { id: 'level', words: ['what level', 'which level', 'how far'],
      lines: ['level $LEVEL right now', 'were on $LEVEL', '$LEVEL. it gets mean around 5'] },

    { id: 'question', words: ['?', 'what', 'why', 'when', 'who', 'how'],
      lines: ['hm. no idea honestly', 'good question', 'couldnt tell you',
              'ask me something about the maze, thats all i actually know',
              'no clue, im just here for the dots'] }
  ];

  /* ---- reactions to the game itself ----------------------------------- */

  var EVENTS = {
    playerDied: ['oof', 'brutal', 'ouch', 'i saw that coming tbh', 'that one was avoidable',
                 'rip', 'the tunnel was RIGHT there'],
    botDied: ['no no no', 'ugh', 'i walked straight into that', 'my fault',
              'thats on me', 'i had it', 'clyde got me. CLYDE'],
    botAte: ['got one', 'thats 200', 'chain time', 'come here'],
    playerAte: ['nice one', 'ok that was clean', 'save some for me'],
    energiser: ['here we go', 'popping it', 'blue time'],
    levelDone: ['gg', 'good level', 'that ones done', 'next'],
    leading: ['im ahead btw', 'scoreboard :)', 'catching up yet?'],
    trailing: ['ok youre actually good', 'im behind, give me a minute',
               'youre pulling away', 'let me cook'],
    idle: ['this maze never changes and i still get lost', 'you going for the fruit?',
           'watch the top left, they bunch up there', 'how long have you played this',
           'i keep taking the same route every time', 'my record is not impressive']
  };

  /* ---- reply construction --------------------------------------------- */

  function factFor(text) {
    var keys = Object.keys(FACTS);
    for (var i = 0; i < keys.length; i++) {
      if (text.indexOf(keys[i]) >= 0) return FACTS[keys[i]];
    }
    if (text.indexOf('red one') >= 0) return FACTS.blinky;
    if (text.indexOf('pink one') >= 0) return FACTS.pinky;
    if (text.indexOf('power pellet') >= 0 || text.indexOf('energizer') >= 0) return FACTS.energiser;
    if (text.indexOf('point') >= 0 || text.indexOf('score') >= 0) return FACTS.ghosts;
    if (text.indexOf('how many') >= 0 || text.indexOf('dot') >= 0 || text.indexOf('pellet') >= 0) return FACTS.dots;
    return null;
  }

  function fill(bot, line, game, text) {
    var out = line;
    if (out.indexOf('$HANDLE') >= 0) out = out.replace('$HANDLE', bot.handle);
    if (out.indexOf('$NAME') >= 0) out = out.replace('$NAME', bot.knownName || 'you');
    if (out.indexOf('$FACT') >= 0) {
      out = out.replace('$FACT', factFor(text) || pick(Object.keys(FACTS).map(function (k) { return FACTS[k]; })));
    }
    if (game) {
      if (out.indexOf('$LEVEL') >= 0) out = out.replace('$LEVEL', String(game.level));
      if (out.indexOf('$LIVES') >= 0) {
        var p1 = game.players && game.players[0];
        out = out.replace('$LIVES', String(p1 ? Math.max(0, p1.lives - 1) : 2));
      }
      if (out.indexOf('$SCORES') >= 0) {
        var a = game.players && game.players[0] ? game.players[0].score : 0;
        var b = game.players && game.players[1] ? game.players[1].score : 0;
        out = out.replace('$SCORES', a + ' to ' + b);
      }
    }
    return out;
  }

  function classify(text) {
    var best = null, bestHits = 0;
    for (var i = 0; i < INTENTS.length; i++) {
      var it = INTENTS[i], hits = 0;
      for (var w = 0; w < it.words.length; w++) {
        if (text.indexOf(it.words[w]) >= 0) hits += it.words[w].length;   // longer = more specific
      }
      if (hits > bestHits) { bestHits = hits; best = it; }
    }
    return best;
  }

  /** Something to say when the player has not spoken but the game moved on. */
  function idleLine(bot, game) {
    if (!game || !game.players || game.players.length < 2) return pick(EVENTS.idle);
    var me = game.players[1], you = game.players[0];
    if (me.score > you.score + 400 && chance(0.5)) return pick(EVENTS.leading);
    if (you.score > me.score + 400 && chance(0.5)) return pick(EVENTS.trailing);
    return pick(EVENTS.idle);
  }

  /**
   * @return {{text: string, delay: number}} delay is a human-ish typing pause
   */
  function reply(bot, raw, game) {
    var text = String(raw || '').toLowerCase().trim();
    var intent = classify(text);

    if (intent && intent.capture) {
      var m = text.match(/(?:my name is|im called|call me|name's)\s+([a-z0-9_]{2,16})/);
      if (m) bot.knownName = m[1];
    }

    var line;
    if (intent) {
      // Prefer a variant it has not used yet this session.
      var fresh = intent.lines.filter(function (l) { return !bot.said[l]; });
      line = pick(fresh.length ? fresh : intent.lines);
      bot.said[line] = true;
    } else {
      line = chance(0.45) ? idleLine(bot, game)
                          : pick(['hm', 'yeah', 'true', 'ok', 'fair enough', 'huh',
                                  'say more', 'i mean, maybe']);
    }

    var out = fill(bot, line, game, text);
    return { text: out, delay: 0.4 + Math.min(2.2, out.length * 0.035) + Math.random() * 0.5 };
  }

  /** A reaction to something that just happened on screen, or null. */
  function react(bot, kind, game) {
    var bank = EVENTS[kind];
    if (!bank) return null;
    if (!chance(bot.chatty)) return null;
    var line = pick(bank);
    return { text: fill(bot, line, game, ''), delay: 0.3 + Math.random() * 0.9 };
  }

  global.Chatbot = { create: create, reply: reply, react: react, idleLine: idleLine, FACTS: FACTS };
})(window);
