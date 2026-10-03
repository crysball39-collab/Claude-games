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
    game.lowPower = true;
  }
}

/* Behind the title screen: two teams going at it while the camera circles. */
const demo = { angle: Math.random() * Math.PI * 2, over: 0 };
function startDemo() {
  game.clearAll();
  const ids = ['red', 'blue', 'yellow', 'purple', 'black', 'orange'];
  const a = ids.splice(Math.floor(Math.random() * ids.length), 1)[0];
  const b = ids[Math.floor(Math.random() * ids.length)];
  for (let k = 0; k < 3; k++) {
    game.spawnHuman(a, -2.6, (k - 1) * 1.3, Math.PI / 2);
    game.spawnHuman(b, 2.6, (k - 1) * 1.3, -Math.PI / 2);
  }
  if (Math.random() < 0.6) game.spawnProp(Math.random() < 0.5 ? 'bat' : 'sword', 0, 2.2);
}
function runDemo(dt) {
  game.frame(dt, null);
  demo.angle += dt * 0.12;
  const c = game.cam;
  c.pos.set(Math.sin(demo.angle) * 9, 3.4, Math.cos(demo.angle) * 9);
  c.yaw = demo.angle;
  c.pitch = -0.28;
  c.apply();
  // once one side is down to nobody, start another
  const teams = new Set(game.humans.filter((h) => h.alive).map((h) => h.team));
  demo.over = teams.size < 2 ? demo.over + dt : 0;
  if (demo.over > 4) { demo.over = 0; startDemo(); }
}
startDemo();

let last = performance.now();
let started = false;
function loop(now) {
  const dt = (now - last) / 1000;
  last = now;
  if (!started) runDemo(dt);
  if (started) {
    game.frame(dt, input);
    adapt(dt);
    const c = game.camera.position;
    sound.listener.x = c.x; sound.listener.y = c.y; sound.listener.z = c.z;
    // a tap on someone says who they are and how they are doing
    for (const t of input.consumeTaps()) {
      const hit = game.pick((t.x / window.innerWidth) * 2 - 1, -(t.y / window.innerHeight) * 2 + 1);
      if (hit && hit.bodies) ui.describe(hit);
      else if (hit && hit.type) ui.toast(hit.holder ? `${hit.name}, in ${hit.holder.team}'s hand` : hit.name);
    }
  }
  renderer.render(game.scene, game.camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

document.getElementById('loading').textContent = '';
document.getElementById('btn-play').addEventListener('click', () => {
  document.getElementById('title').classList.remove('active');
  document.getElementById('hud').classList.remove('hidden');
  game.clearAll();
  game.cam.reset();
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
