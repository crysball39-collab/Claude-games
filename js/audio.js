/* Web Audio synthesis of the arcade's square-wave voice. Everything is
   generated on the fly - no samples, so the page stays self-contained. */
(function (global) {
  'use strict';

  var ctxA = null;
  var master = null;
  var muted = false;
  var loop = null;          // the currently-playing background voice
  var loopKind = null;

  function ensure() {
    if (ctxA) return ctxA;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ctxA = new AC();
    master = ctxA.createGain();
    master.gain.value = 0.28;
    master.connect(ctxA.destination);
    return ctxA;
  }

  function resume() {
    var a = ensure();
    if (a && a.state === 'suspended') a.resume();
  }

  function now() { return ctxA ? ctxA.currentTime : 0; }

  /** One square-wave note. */
  function note(freq, start, dur, gain, type) {
    if (!ensure() || muted) return;
    var osc = ctxA.createOscillator();
    var g = ctxA.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.008);
    g.gain.setValueAtTime(gain, start + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, start + dur);
    osc.connect(g); g.connect(master);
    osc.start(start); osc.stop(start + dur + 0.02);
  }

  /** A note that slides between two pitches - used for waka and sirens. */
  function sweep(f0, f1, start, dur, gain, type) {
    if (!ensure() || muted) return;
    var osc = ctxA.createOscillator();
    var g = ctxA.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(f0, start);
    osc.frequency.linearRampToValueAtTime(f1, start + dur);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.01);
    g.gain.linearRampToValueAtTime(0, start + dur);
    osc.connect(g); g.connect(master);
    osc.start(start); osc.stop(start + dur + 0.02);
  }

  var wakaHigh = false;
  function waka() {
    if (!ensure() || muted) return;
    wakaHigh = !wakaHigh;
    var t = now();
    if (wakaHigh) sweep(320, 540, t, 0.055, 0.16);
    else sweep(540, 320, t, 0.055, 0.16);
  }

  /* ---- background voices ------------------------------------------- */

  function stopLoop() {
    if (loop) {
      try { loop.osc.stop(); } catch (e) { /* already stopped */ }
      try { loop.lfo.stop(); } catch (e) { /* already stopped */ }
      loop = null;
    }
    loopKind = null;
  }

  /**
   * @param {string} kind siren|fright|eyes
   * @param {number} intensity 0..1, raises the siren pitch as dots run out
   */
  function setBackground(kind, intensity) {
    if (!ensure()) return;
    var key = kind + ':' + (kind === 'siren' ? Math.round((intensity || 0) * 4) : '');
    if (loopKind === key) return;
    stopLoop();
    loopKind = key;
    if (!kind || muted) return;

    var osc = ctxA.createOscillator();
    var g = ctxA.createGain();
    var lfo = ctxA.createOscillator();
    var lfoGain = ctxA.createGain();

    if (kind === 'siren') {
      var base = 200 + (intensity || 0) * 190;
      osc.type = 'sawtooth';
      osc.frequency.value = base;
      lfo.frequency.value = 5.5 + (intensity || 0) * 4;
      lfoGain.gain.value = base * 0.42;
      g.gain.value = 0.055;
    } else if (kind === 'fright') {
      osc.type = 'square';
      osc.frequency.value = 130;
      lfo.frequency.value = 15;
      lfoGain.gain.value = 55;
      g.gain.value = 0.06;
    } else { // eyes returning home
      osc.type = 'square';
      osc.frequency.value = 620;
      lfo.frequency.value = 22;
      lfoGain.gain.value = 260;
      g.gain.value = 0.045;
    }

    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(g); g.connect(master);
    osc.start(); lfo.start();
    loop = { osc: osc, lfo: lfo, gain: g };
  }

  /* ---- one-shot effects -------------------------------------------- */

  function eatGhost() {
    if (!ensure() || muted) return;
    var t = now();
    sweep(180, 1100, t, 0.42, 0.2, 'square');
  }

  function eatFruit() {
    if (!ensure() || muted) return;
    var t = now();
    sweep(1000, 1600, t, 0.1, 0.18);
    sweep(1600, 900, t + 0.1, 0.16, 0.18);
  }

  function extraLife() {
    if (!ensure() || muted) return;
    var t = now();
    for (var i = 0; i < 8; i++) note(880 + i * 90, t + i * 0.055, 0.05, 0.14);
  }

  function death() {
    if (!ensure() || muted) return;
    stopLoop();
    var t = now();
    // Descending warble, then the long fall.
    for (var i = 0; i < 10; i++) {
      sweep(680 - i * 46, 420 - i * 34, t + i * 0.1, 0.09, 0.18);
    }
    sweep(400, 60, t + 1.05, 0.55, 0.2);
  }

  /* The opening jingle: two bars of the arcade's start tune. */
  var INTRO = [
    [493.9, 0.14], [987.8, 0.14], [740.0, 0.14], [622.3, 0.14],
    [987.8, 0.07], [740.0, 0.14], [622.3, 0.26],
    [523.3, 0.14], [1046.5, 0.14], [784.0, 0.14], [659.3, 0.14],
    [1046.5, 0.07], [784.0, 0.14], [659.3, 0.26],
    [493.9, 0.14], [987.8, 0.14], [740.0, 0.14], [622.3, 0.14],
    [987.8, 0.07], [740.0, 0.14], [622.3, 0.26],
    [622.3, 0.09], [659.3, 0.09], [698.5, 0.16], [698.5, 0.09],
    [740.0, 0.09], [784.0, 0.16], [784.0, 0.09], [830.6, 0.09],
    [932.3, 0.16], [987.8, 0.36]
  ];

  function intro() {
    if (!ensure() || muted) return;
    stopLoop();
    var t = now() + 0.05;
    for (var i = 0; i < INTRO.length; i++) {
      note(INTRO[i][0], t, INTRO[i][1] * 0.92, 0.16);
      t += INTRO[i][1];
    }
  }

  function toggleMute() {
    muted = !muted;
    if (muted) stopLoop();
    if (master) master.gain.value = muted ? 0 : 0.28;
    return muted;
  }

  function isMuted() { return muted; }

  global.Sound = {
    resume: resume,
    waka: waka,
    setBackground: setBackground,
    stopBackground: stopLoop,
    eatGhost: eatGhost,
    eatFruit: eatFruit,
    extraLife: extraLife,
    death: death,
    intro: intro,
    toggleMute: toggleMute,
    isMuted: isMuted,
    INTRO_LENGTH: INTRO.reduce(function (s, n) { return s + n[1]; }, 0)
  };
})(window);
