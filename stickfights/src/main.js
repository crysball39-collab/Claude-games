/* =============================================================================
   STICKFIGHTS - boot and frame loop.

   Behind the title screen a few stickmen are already getting on with their
   lives (and one of them has a grudge). PLAY clears them away and hands you
   an empty sandbox and the spawn menu.
   ========================================================================== */
import { Sandbox } from './game/sandbox.js';
import { Brain } from './game/brain.js';
import { Camera } from './game/camera.js';
import { Renderer } from './game/render.js';
import { Hand } from './game/hand.js';
import { STYLE } from './game/animator.js';
import { Sound } from './core/audio.js';
import { UI } from './ui/ui.js';

const canvas = document.getElementById('view');
const sb = new Sandbox();
sb.makeBrain = (man, traits) => new Brain(man, traits);
const cam = new Camera(sb);
const renderer = new Renderer(canvas, sb, cam);
const hand = new Hand(sb);
sb.hand = hand;
const sound = new Sound();
const ui = new UI({ sb, cam, renderer, hand, sound, canvas });
let started = false;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.resize(w, h, dpr);
  cam.resize(w, h, dpr);
  if (!started) cam.titleView();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

/* --------------------------------- sound ---------------------------------- */

const SCREAMS = new Set(['panic', 'hurtBig', 'flee', 'grabbed', 'grabbedAgain', 'broken']);
sb.on('hit', (e) => {
  if (e.kind === 'impact') {
    sound.wood(e.power * 3, e.x);
    sound.punch(e.power * 0.6, false, e.x);
  } else {
    sound.punch(e.power, e.armed, e.x, e.blocked);
  }
  if (!e.blocked && (e.power > 1.7 || e.fatal)) cam.shake(Math.min(0.6, 0.15 + e.power * 0.08));
});
sb.on('swing', (e) => sound.whoosh(e.who.pos.x, e.kind === 'cross' || e.kind === 'kick' || e.kind === 'uppercut'));
sb.on('throw', (e) => sound.whoosh(e.who.pos.x, true));
sb.on('clatter', (e) => {
  if (e.what.kind === 'crate') sound.wood(e.speed, e.x);
  else sound.clink(e.speed, e.x);
  if (e.what.kind === 'crate' && e.speed > 9) cam.shake(0.15);
});
sb.on('thud', (e) => sound.thud(e.speed, e.x));
sb.on('land', (e) => { if (e.speed > 5) sound.thud(e.speed * 0.5, e.who.pos.x); });
sb.on('knock', (e) => sound.wood(e.loud ? 5 : 2.5, e.who.pos.x));
sb.on('break', (e) => sound.crack(e.who.pos.x));
sb.on('death', (e) => sound.death(e.who.voice, e.who.pos.x));
sb.on('speech', (e) => {
  sound.voice(e.text, e.who.voice, e.loud, e.who.pos.x);
  if (e.loud && SCREAMS.has(e.kind)) sound.scream(e.who.voice, e.who.pos.x);
});

/* ------------------------------ behind the title -------------------------- */

function demo() {
  sb.clear();
  sb.spawnCrate(2.6, 0.4);
  sb.spawnCrate(2.65, 1.2);
  sb.spawnKnuckles(-2.6, 0.1);
  const a = sb.spawnStickman(-4.2, null, { traits: { aggression: 0.85, temper: 0.85, bravery: 0.8 } });
  const b = sb.spawnStickman(-0.8, null, { traits: { sociability: 0.8, empathy: 0.7 } });
  const c = sb.spawnStickman(1.2, null, { traits: { sociability: 0.7, aggression: 0.3 } });
  sb.spawnStickman(4.6, null, { traits: { curiosity: 0.8 } });
  // a grudge, so something happens while the title is up
  a.brain.rel(c).anger = 0.75;
  a.brain.rel(c).like = -0.5;
  b.brain.rel(c).like = 0.5;
  c.brain.rel(b).like = 0.5;
}
demo();
cam.titleView();

/* ---------------------------------- loop ---------------------------------- */

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  sb.update(dt);
  cam.update(dt);
  sound.listenX = cam.x;
  sound.span = cam.w / cam.ppm;
  if (started) ui.update(dt);
  renderer.draw(started ? ui.drawState() : {});
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function start() {
  if (started) return;
  started = true;
  ui.started = true;
  document.getElementById('title').classList.remove('active');
  document.getElementById('hud').classList.remove('hidden');
  sb.clear();
  sb.paused = false;
  cam.home();
  sound.unlock();
  ui.toggleDrawer(true);
  // full screen and landscape where the browser allows it; harmless where not
  const el = document.documentElement;
  if (el.requestFullscreen && matchMedia('(pointer: coarse)').matches) {
    el.requestFullscreen().then(() => {
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    }).catch(() => {});
  }
}
document.getElementById('btn-play').addEventListener('click', start);

// for tests and the curious
window.__sf = { sb, cam, ui, hand, sound, renderer, STYLE, start, demo };
