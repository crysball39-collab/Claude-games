/* =============================================================================
   The Suffering - start here.
   Builds the city and everyone in it, wires the pieces together, runs the loop.
   ========================================================================== */
import { Game } from './game.js';
import { input } from './core/input.js';
import { Sound } from './core/audio.js';
import { Weapons } from './combat/weapons.js';
import { Traffic } from './world/traffic.js';
import { Minds } from './mind/mind.js';
import { Brain, populate } from './mind/brain.js';
import { Voices } from './mind/voices.js';
import { Speech } from './mind/speech.js';
import { Doctor } from './ui/doctor.js';
import { UI } from './ui/hud.js';
import { ST } from './human/human.js';
import { P } from './human/rig.js';
import { $, store, IS_TOUCH, clamp } from './core/util.js';

const DEFAULTS = {
  quality: IS_TOUCH ? 'medium' : 'high', shadows: !IS_TOUCH, gore: true, sens: 110, fov: 64, invert: false, volumePct: 70,
  people: IS_TOUCH ? 10 : 13, cars: 6, aiKey: '', aiModel: 'claude-opus-5-5', aiLive: true, aiPace: 4, tts: false,
};
const settings = Object.assign({}, DEFAULTS, store.get('settings', {}));
const save = () => store.set('settings', settings);

const stage = (text, pct) => new Promise((done) => {
  $('#boot-status').textContent = text;
  $('#boot-bar').style.width = pct + '%';
  // let the bar actually paint before the next slab of work
  requestAnimationFrame(() => setTimeout(done, 0));
});

async function boot() {
  await stage('Pouring concrete', 10);
  let game;
  try {
    game = new Game($('#viewport'), settings, input);
  } catch (err) {
    console.error(err);
    $('#boot-status').textContent = 'This browser could not start 3D graphics, so the game cannot run here. Try another browser or device.';
    return;
  }

  await stage('Starting engines', 45);
  const sound = new Sound();
  const voices = new Voices(settings);
  game.audio = sound;
  game.minds = new Minds(game, (human, g) => new Brain(human, g));
  game.traffic = new Traffic(game, settings.cars);
  game.weapons = new Weapons(game);
  game.speech = new Speech(game, voices);
  const doctor = new Doctor(game);

  const apply = () => {
    input.sensitivity = 0.0046 * settings.sens / 110;
    input.invertY = !!settings.invert;
    settings.volume = settings.volumePct / 100;
    sound.setVolume(settings.volume);
    game.gore.enabled = settings.gore !== false;
    game.traffic.setCount(settings.cars);
    game.resize();
  };
  const ui = new UI(game, { input, weapons: game.weapons, speech: game.speech, voices, doctor, sound, settings, save, apply });
  game.ui = ui;
  apply();

  /* what the rest of the city gets to know about */
  const minds = game.minds;
  game.onDeath = (h) => {
    const c = h.bodies[P.CHEST];
    minds.witness({ kind: 'death', victim: h, actor: h.lastAttacker, x: c.px, y: c.py + 0.2, z: c.pz });
  };
  game.onDismember = (h, part, burst) => {
    const b = h.bodies[part];
    minds.witness({ kind: 'dismember', victim: h, part, burst, x: b.px, y: b.py + 0.2, z: b.pz });
    minds.noise(b.px, b.py, b.pz, 70, 'thud', h);
  };
  game.onCarHit = (h, car, closing) => {
    minds.witness({ kind: 'carhit', victim: h, x: h.x, y: h.y + 1, z: h.z });
    minds.noise(h.x, h.y + 1, h.z, 92, 'crash', h);
    if (h.isPlayer) game.shake = 1.2;
  };
  game.onFall = (h) => {
    minds.witness({ kind: 'fall', victim: h, x: h.x, y: h.y + 0.8, z: h.z });
  };
  game.onVomit = (h) => {
    minds.witness({ kind: 'vomit', victim: h, x: h.x, y: h.y + 1.2, z: h.z });
    minds.noise(h.x, h.y + 1.2, h.z, 64, 'vomit', h);
    if (h.mind) h.mind.ask('afterVomit', 40, null, 1.6);
  };
  game.onHit = (h, info, rep) => { if (h.isPlayer) game.shake = Math.max(game.shake, 0.5 + rep.pain * 0.02); };

  await stage('Filling the streets', 70);
  input.attach({ viewport: $('#viewport'), stickZone: $('#stick-zone'), stickBase: $('#stick-base'), stickKnob: $('#stick-knob') });
  for (let i = 0; i < settings.people; i++) {
    const s = game.city.randomPavement();
    if (Math.hypot(s.x - game.player.x, s.z - game.player.z) > 11 && game.city.isClear(s.x, s.z, 0.5)) game.spawnHuman(s.x, s.z);
  }

  await stage('Almost there', 90);
  try { game.renderer.compile(game.scene, game.camera); } catch { /* it will compile as it goes */ }
  game.frame(1 / 60);

  window.addEventListener('resize', () => { game.resize(); ui._layout(); });
  window.addEventListener('orientationchange', () => setTimeout(() => { game.resize(); ui._layout(); }, 200));

  let last = performance.now(), popT = 0, stepT = 0;
  function loop(now) {
    const dt = clamp((now - last) / 1000, 0, 0.1);
    last = now;
    game.frame(dt);
    if (!game.paused) {
      // the streets refill, a face at a time, out of sight
      popT += dt;
      if (popT > 1.3) { popT = 0; populate(game, settings.people); }
      // running feet are heard, and so is the nearest engine
      const p = game.player;
      if (p.state === ST.ANIM && p.speed > 3.2 && p.grounded) {
        stepT += dt;
        if (stepT > 0.3) { stepT = 0; minds.noise(p.x, p.y + 0.1, p.z, 57, 'steps', p); sound.play('step', 0.35); }
      } else if (p.state === ST.ANIM && p.speed > 0.6 && p.grounded) {
        stepT += dt;
        if (stepT > 0.5) { stepT = 0; sound.play('step', 0.18); }
      }
      let near = 99, sp = 0;
      for (const c of game.traffic.cars) { const d = Math.hypot(c.x - game.camX, c.z - game.camZ); if (d < near) { near = d; sp = c.speed; } }
      sound.engine(near, sp);
    }
    requestAnimationFrame(loop);
  }

  await stage('Ready', 100);
  $('#boot').hidden = true;
  ui.showMenu();
  requestAnimationFrame(loop);

  // for the test scripts, and for the curious
  window.__game = game;
  window.__ts = { game, ui, input, sound, voices, doctor, settings };
}

boot();
