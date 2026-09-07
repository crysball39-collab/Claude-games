/* Sound built on an emulation of the Namco WSG - the custom 3-voice wave
 * sound generator on the Pac-Man board.
 *
 * The hardware model and the wavetables are the real thing:
 *   - 12 non-silent waveforms of 32 four-bit samples, transcribed from the
 *     board's two 256-byte sound PROMs (82s126.1m and 82s126.3m)
 *   - clocked at the CPU rate / 32 = 3.072 MHz / 32 = 96 kHz
 *   - each voice adds its 20-bit frequency to a 20-bit accumulator per clock,
 *     the top 5 bits index the waveform, the nibble is scaled by a 4-bit volume
 *   - register value for a pitch f is V = f * 32 / 96000 * 2^15 = 4096f/375
 *
 * Every effect is rendered offline through that model into a 96 kHz buffer, so
 * the stepped quantisation and aliasing of the original are preserved rather
 * than approximated with clean oscillators.
 */
(function (global) {
  'use strict';

  var WAVE_HEX = [
    '79abcddeeeddcba97543211000112345',   // 0  sine
    '7ceedb9abba9643579ba854334531002',   // 1
    '7acdedca742101247bdedb7310137e70',   // 2
    '7db8bd96bec79a627c84572038513631',   // 3
    '08f718e728d738c748b758a768977887',   // 4
    '78695a4b3c2d1e0f0f1e2d3c4b5a6978',   // 5
    '0123456789abcdeffedcba9876543210',   // 6  triangle
    '0123456789abcdef0123456789abcdef',   // 7  sawtooth
    'fdfffdfffdfffdfffdfffdfffdfffdff',   // 8
    'fdfffdfffdfffdfffdfffdfffdfffdff',   // 9
    '7fedffedffedffedffedfffb7fedffed',   // 10
    'ffedffedfffb7fedffedffedffedfffb'    // 11
  ];

  var WAVES = WAVE_HEX.map(function (hex) {
    var w = new Int8Array(32);
    for (var i = 0; i < 32; i++) w[i] = parseInt(hex[i], 16);
    return w;
  });

  var WSG_RATE = 96000;
  var FREQ_SCALE = 4096 / 375;          // register value per Hz
  var ACC_MASK = 0xfffff;               // 20-bit accumulator

  var ctxA = null, master = null, muted = false;
  var loopNode = null, loopKey = null;
  var cache = {};

  function ensure() {
    if (ctxA) return ctxA;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ctxA = new AC();
    master = ctxA.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctxA.destination);
    return ctxA;
  }

  function resume() {
    var a = ensure();
    if (a && a.state === 'suspended') a.resume();
  }

  /* ------------------------------------------------------------------ */
  /* Offline WSG rendering                                               */
  /*                                                                      */
  /* A program is a list of voices; a voice is a list of steps.           */
  /* step = { d: seconds, w: waveform, f: Hz, f1: Hz to glide to, v: 0-15 }*/
  /* ------------------------------------------------------------------ */

  function programLength(program) {
    var longest = 0;
    for (var i = 0; i < program.length; i++) {
      var total = 0;
      for (var j = 0; j < program[i].length; j++) total += program[i][j].d;
      if (total > longest) longest = total;
    }
    return longest;
  }

  function renderProgram(program) {
    var frames = Math.max(1, Math.ceil(programLength(program) * WSG_RATE));
    var out = new Float32Array(frames);

    for (var v = 0; v < program.length; v++) {
      var steps = program[v];
      var acc = 0, cursor = 0;
      for (var s = 0; s < steps.length; s++) {
        var st = steps[s];
        var n = Math.round(st.d * WSG_RATE);
        var table = WAVES[st.w % WAVES.length];
        var vol = (st.v === undefined ? 15 : st.v) / 15;
        var f0 = st.f, f1 = st.f1 === undefined ? st.f : st.f1;
        for (var i = 0; i < n && cursor < frames; i++, cursor++) {
          var f = n > 1 ? f0 + (f1 - f0) * (i / (n - 1)) : f0;
          acc = (acc + Math.round(f * FREQ_SCALE)) & ACC_MASK;
          if (vol > 0) {
            // 4-bit sample, centred on the wavetable midpoint, scaled by volume
            out[cursor] += ((table[acc >>> 15] - 7.5) / 7.5) * vol;
          }
        }
        if (cursor >= frames) break;
      }
    }

    // Three voices can sum; keep headroom without clipping.
    for (var k = 0; k < frames; k++) out[k] /= 3;
    return out;
  }

  function toBuffer(data) {
    if (!ensure()) return null;
    var buf = ctxA.createBuffer(1, data.length, WSG_RATE);
    buf.copyToChannel ? buf.copyToChannel(data, 0)
                      : buf.getChannelData(0).set(data);
    return buf;
  }

  function bufferFor(key, build) {
    if (cache[key]) return cache[key];
    if (!ensure()) return null;
    cache[key] = toBuffer(renderProgram(build()));
    return cache[key];
  }

  function play(key, build, gain) {
    if (!ensure() || muted) return;
    var buf = bufferFor(key, build);
    if (!buf) return;
    var src = ctxA.createBufferSource();
    src.buffer = buf;
    var g = ctxA.createGain();
    g.gain.value = gain === undefined ? 1 : gain;
    src.connect(g); g.connect(master);
    src.start();
  }

  /* ------------------------------------------------------------------ */
  /* Effect definitions                                                   */
  /*                                                                      */
  /* The waveform choices and register sequences below are reconstructed  */
  /* by ear from the original; the game ROM's sound tables were not       */
  /* available. The synthesis path they run through is the real hardware. */
  /* ------------------------------------------------------------------ */

  var wakaUp = false;

  function wakaProgram(up) {
    // A single bite: a fast glide, alternating direction each dot.
    return [[
      { d: 0.052, w: 6, f: up ? 320 : 1120, f1: up ? 1120 : 320, v: 13 }
    ]];
  }

  function waka() {
    wakaUp = !wakaUp;
    play(wakaUp ? 'waka1' : 'waka0', function () { return wakaProgram(wakaUp); }, 0.75);
  }

  /* Background voices loop a single rendered cycle. */

  function sirenProgram(level) {
    // The siren climbs and snaps back; it tightens as the maze empties.
    var base = 260 + level * 55;
    var span = 130 + level * 30;
    var dur = 0.42 - level * 0.045;
    return [[
      { d: dur * 0.55, w: 0, f: base, f1: base + span, v: 10 },
      { d: dur * 0.45, w: 0, f: base + span, f1: base, v: 10 }
    ]];
  }

  function frightProgram() {
    return [[
      { d: 0.06, w: 5, f: 180, f1: 420, v: 11 },
      { d: 0.06, w: 5, f: 420, f1: 180, v: 11 }
    ]];
  }

  function eyesProgram() {
    return [[
      { d: 0.035, w: 4, f: 1000, f1: 1700, v: 9 },
      { d: 0.035, w: 4, f: 1700, f1: 1000, v: 9 }
    ]];
  }

  function stopBackground() {
    if (loopNode) {
      try { loopNode.stop(); } catch (e) { /* already stopped */ }
      loopNode = null;
    }
    loopKey = null;
  }

  /**
   * @param {string} kind siren|fright|eyes, or falsy for silence
   * @param {number} intensity 0..1 - raises the siren as dots run out
   */
  function setBackground(kind, intensity) {
    if (!ensure()) return;
    var level = kind === 'siren' ? Math.min(4, Math.round((intensity || 0) * 4)) : 0;
    var key = kind ? kind + level : '';
    if (loopKey === key) return;
    stopBackground();
    loopKey = key;
    if (!kind || muted) return;

    var buf = bufferFor('bg:' + key, function () {
      if (kind === 'siren') return sirenProgram(level);
      if (kind === 'fright') return frightProgram();
      return eyesProgram();
    });
    if (!buf) return;
    var src = ctxA.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    var g = ctxA.createGain();
    g.gain.value = 0.55;
    src.connect(g); g.connect(master);
    src.start();
    loopNode = src;
  }

  function eatGhost() {
    play('eatghost', function () {
      return [[{ d: 0.42, w: 7, f: 180, f1: 1500, v: 13 }]];
    }, 0.9);
  }

  function eatFruit() {
    play('eatfruit', function () {
      return [[
        { d: 0.09, w: 2, f: 900, f1: 1500, v: 13 },
        { d: 0.09, w: 2, f: 1500, f1: 700, v: 13 },
        { d: 0.09, w: 2, f: 700, f1: 1300, v: 12 }
      ]];
    }, 0.9);
  }

  function extraLife() {
    play('extralife', function () {
      var steps = [];
      for (var i = 0; i < 10; i++) steps.push({ d: 0.05, w: 6, f: 700 + i * 110, v: 12 });
      return [steps];
    }, 0.8);
  }

  function death() {
    stopBackground();
    play('death', function () {
      var steps = [];
      // Eight descending swoops, then the long fall.
      for (var i = 0; i < 8; i++) {
        var top = 760 - i * 62;
        steps.push({ d: 0.085, w: 3, f: top, f1: top * 0.55, v: 13 });
        steps.push({ d: 0.025, w: 3, f: top * 0.55, f1: top * 0.55, v: 0 });
      }
      steps.push({ d: 0.5, w: 3, f: 340, f1: 60, v: 13 });
      return [steps];
    }, 1);
  }

  /* The opening tune: melody over a bass line, two voices. */
  var Q = 0.13;                                     // one sixteenth
  var MELODY = [
    [493.9, 1], [987.8, 1], [740.0, 1], [622.3, 1], [987.8, 0.5], [740.0, 1], [622.3, 2],
    [523.3, 1], [1046.5, 1], [784.0, 1], [659.3, 1], [1046.5, 0.5], [784.0, 1], [659.3, 2],
    [493.9, 1], [987.8, 1], [740.0, 1], [622.3, 1], [987.8, 0.5], [740.0, 1], [622.3, 2],
    [622.3, 0.5], [659.3, 0.5], [698.5, 1], [698.5, 0.5], [740.0, 0.5], [784.0, 1],
    [784.0, 0.5], [830.6, 0.5], [932.3, 1], [987.8, 2.5]
  ];

  function introProgram() {
    var lead = [], bass = [];
    for (var i = 0; i < MELODY.length; i++) {
      var f = MELODY[i][0], beats = MELODY[i][1], d = beats * Q;
      lead.push({ d: d * 0.86, w: 2, f: f, v: 13 });
      lead.push({ d: d * 0.14, w: 2, f: f, v: 0 });
      bass.push({ d: d * 0.86, w: 6, f: f / 4, v: 8 });
      bass.push({ d: d * 0.14, w: 6, f: f / 4, v: 0 });
    }
    return [lead, bass];
  }

  var INTRO_LENGTH = MELODY.reduce(function (s, n) { return s + n[1] * Q; }, 0);

  function intro() {
    stopBackground();
    play('intro', introProgram, 1);
  }

  function toggleMute() {
    muted = !muted;
    if (muted) stopBackground();
    if (master) master.gain.value = muted ? 0 : 0.5;
    return muted;
  }

  global.Sound = {
    resume: resume,
    waka: waka,
    setBackground: setBackground,
    stopBackground: stopBackground,
    eatGhost: eatGhost,
    eatFruit: eatFruit,
    extraLife: extraLife,
    death: death,
    intro: intro,
    toggleMute: toggleMute,
    isMuted: function () { return muted; },
    INTRO_LENGTH: INTRO_LENGTH,
    WAVES: WAVES
  };
})(window);
