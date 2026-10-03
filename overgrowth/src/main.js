/* =============================================================================
   OVERGROWTH - boot and frame loop.
   ========================================================================== */
import { WebGLRenderer, PCFSoftShadowMap, SRGBColorSpace, ACESFilmicToneMapping } from 'three';
import { Game } from './game/game.js';
import { Input } from './core/input.js';
import { UI } from './ui/ui.js';
import * as anim from './game/anim.js';
import { Sound } from './core/audio.js';

const canvas = document.getElementById('view');
const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const small = Math.min(window.innerWidth, window.innerHeight) < 500;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 2 : 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const game = new Game(renderer);
const input = new Input(document.body);
const sound = new Sound();
const ui = new UI(game, input, sound);
game.on('hit', (v, h) => sound.hit(h.kind, h.speed, h.point));
game.on('swing', (p) => sound.whoosh(p));
game.on('thud', (p, sp) => sound.thud(sp, p));

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  game.resize(w, h);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

/* A phone that cannot keep up gets a lighter picture: first fewer pixels,
   then no shadows. Judged over a few seconds of play, at most twice. */
const quality = { t: 0, n: 0, sum: 0, level: 0 };
function adapt(dt) {
  if (quality.level >= 2 || game.paused || dt > 0.25) return;
  quality.t += dt; quality.sum += dt; quality.n++;
  if (quality.t < 4) return;
  const avg = quality.sum / quality.n;
  quality.t = 0; quality.sum = 0; quality.n = 0;
  if (avg < 0.026) return;
  quality.level++;
  if (quality.level === 1) {
    renderer.setPixelRatio(Math.min(1, window.devicePixelRatio || 1));
    resize();
  } else {
    game.map.sun.castShadow = false;
  }
}

let last = performance.now();
let started = false;
function loop(now) {
  const dt = (now - last) / 1000;
  last = now;
  if (started) {
    game.frame(dt, input);
    adapt(dt);
    const c = game.camera.position;
    sound.listener.x = c.x; sound.listener.y = c.y; sound.listener.z = c.z;
  }
  renderer.render(game.scene, game.camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

document.getElementById('loading').textContent = '';
document.getElementById('btn-play').addEventListener('click', () => {
  document.getElementById('title').classList.remove('active');
  document.getElementById('hud').classList.remove('hidden');
  started = true;
  last = performance.now();
  sound.unlock();
  ui.toggle(true);
  ui.toast('Pick a team, then tap SPAWN');
  // full screen and landscape where the browser allows it; harmless where not
  const el = document.documentElement;
  if (el.requestFullscreen && matchMedia('(pointer: coarse)').matches) {
    el.requestFullscreen().then(() => {
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    }).catch(() => {});
  }
});

// for tests and the curious
window.__og = { game, ui, input, renderer, anim, quality, sound };
