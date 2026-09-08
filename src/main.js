// Entry point: boots the renderer, runs the lobby, then hands over to a match.
import * as THREE from 'three';
import { Lobby } from './lobby.js';
import { Game, TOTAL_PLAYERS } from './game.js';
import { HUD } from './ui.js';

const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');
const overlay = document.getElementById('overlay');

const renderer = new THREE.WebGLRenderer({
  canvas, antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const app = {
  mode: 'lobby',
  lobby: null,
  game: null,
  hud: null,
  last: performance.now(),
};

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  if (app.lobby) app.lobby.resize(w, h);
  if (app.game) app.game.resize(w, h);
}
window.addEventListener('resize', resize);

// ---------------------------------------------------------------- overlays
function showOverlay(html, cls = '') {
  overlay.className = 'overlay ' + cls;
  overlay.innerHTML = html;
  overlay.style.display = 'flex';
  return overlay;
}
function hideOverlay() { overlay.style.display = 'none'; overlay.innerHTML = ''; }

// ------------------------------------------------------------------- lobby
function enterLobby() {
  app.mode = 'lobby';
  hideOverlay();
  if (app.game) { app.game.dispose(); app.game = null; }
  if (app.hud) { uiRoot.innerHTML = ''; app.hud = null; }
  app.lobby = new Lobby(renderer, uiRoot);
  app.lobby.playBtn.addEventListener('click', () => startMatch());
  resize();
}

// ------------------------------------------------------------------- match
async function startMatch() {
  const cos = { ...app.lobby.cos };
  const name = app.lobby.name;
  app.lobby.dispose();
  app.lobby = null;
  uiRoot.innerHTML = '';
  app.mode = 'loading';

  const bar = showOverlay(`
    <div class="loadcard">
      <div class="logo">FORTNITE</div>
      <div class="loadlabel">Dropping in…</div>
      <div class="loadbar"><i></i></div>
      <div class="loadtips">Break wooden props with your pickaxe for wood &middot; 25 wood per build piece</div>
    </div>`, 'loading');
  const fill = bar.querySelector('.loadbar i');
  const label = bar.querySelector('.loadlabel');

  app.hud = new HUD({ state: 'loading', player: null }, uiRoot);
  const game = new Game(renderer, app.hud, {
    cosmetics: cos,
    playerName: name,
    seed: 20260908,
    onMatchEnd: (res) => showResults(res),
  });
  app.hud.game = game;
  await game.setup((text, p) => {
    label.textContent = text + '…';
    fill.style.width = Math.round(p * 100) + '%';
  });
  app.game = game;
  app.mode = 'match';
  hideOverlay();
  resize();
  showDropBanner();
}

function showDropBanner() {
  const b = document.createElement('div');
  b.className = 'dropbanner';
  b.innerHTML = `<b>${TOTAL_PLAYERS} PLAYERS</b><span>Last one standing wins</span>`;
  uiRoot.appendChild(b);
  setTimeout(() => b.classList.add('out'), 2600);
  setTimeout(() => b.remove(), 3600);
}

function showResults(res) {
  app.mode = 'results';
  const ov = showOverlay(`
    <div class="resultcard ${res.won ? 'win' : ''}">
      <h1>${res.won ? '#1 VICTORY ROYALE' : 'ELIMINATED'}</h1>
      <div class="rrow"><span>Placement</span><b>#${res.place}</b></div>
      <div class="rrow"><span>Eliminations</span><b>${res.kills}</b></div>
      <button class="playbtn" id="btn-lobby">RETURN TO LOBBY</button>
    </div>`, 'results');
  ov.querySelector('#btn-lobby').addEventListener('click', () => {
    if (document.pointerLockElement) document.exitPointerLock();
    enterLobby();
  });
}

// -------------------------------------------------------------------- loop
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - app.last) / 1000;
  app.last = now;
  if (dt > 0.1) dt = 0.1;

  if (app.mode === 'lobby' && app.lobby) {
    app.lobby.update(dt);
    app.lobby.render();
  } else if ((app.mode === 'match' || app.mode === 'results') && app.game) {
    app.game.update(dt);
    app.game.render();
  }
}

enterLobby();
resize();
requestAnimationFrame(frame);

// expose for debugging from the console
window.__fn = app;
