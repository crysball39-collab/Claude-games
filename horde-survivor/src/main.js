'use strict';
/* =============================================================================
   Boot and the frame loop.
   ========================================================================== */

const Game = { mode: 'menu', speed: 1, booted: false };

function startGame() {
  if (Game.mode === 'run') return;
  startRun();
  Game.mode = 'run';
  Input.reset();
  UI.enterRun();
  measureHud();
}

function backToMenu() {
  Game.mode = 'menu';
  run = null;
  Input.reset();
  UI.exitRun();
}

let lastFrame = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastFrame) / 1000;
  lastFrame = now;
  if (!(dt > 0)) dt = 0;
  dt = Math.min(dt, 0.05);
  try {
    if (Game.mode === 'run' && run) {
      const steps = Math.max(1, Math.ceil(Game.speed));
      const sdt = dt * Game.speed / steps;
      for (let i = 0; i < steps && run; i++) updateRun(sdt);
      if (run) { renderRun(); UI.hud(); }
    } else {
      renderMenu(dt);
    }
  } catch (err) {
    console.error(err);
  }
}

function boot(hot) {
  if (Game.booted) return;
  Game.booted = true;
  loadSave(hot && hot.save);
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');
  UI.init();
  resize();
  UI.renderAll();
  UI.showTab('main');
  Input.attach(canvas, () => Sfx.unlock());
  document.addEventListener('pointerdown', () => Sfx.unlock(), { passive: true });
  let rt = 0;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { resize(); if (Game.mode === 'menu') UI.renderMain(); }, 120); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) UI.pauseGame(); });
  // Stop the page itself from scrolling or zooming under a finger.
  document.addEventListener('touchmove', e => { if (!e.target.closest('.tab, .overlay')) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());
  requestAnimationFrame(t => { lastFrame = t; requestAnimationFrame(frame); });
}

/* Hooks for testing from the console. */
window.__hs = {
  get run() { return run; },
  get save() { return SAVE; },
  start: () => startGame(),
  speed: x => { Game.speed = x; },
  god: (on = true) => { if (run) run.god = on; },
  grant(id, lv = 5, evo = false) {
    if (!run) return;
    if (ABILITIES[id]) {
      if (!run.ab[id]) { run.ab[id] = { lv: 1, evo: false }; run.abOrder.push(id); }
      run.ab[id].lv = lv; run.ab[id].evo = evo;
    } else if (BUFFS[id]) {
      if (!run.bf[id]) run.bfOrder.push(id);
      run.bf[id] = lv; recalc();
    }
  },
  skipTo(t) { if (run) { run.t = t; } },
  boss(id) { if (run && !run.boss && !run.intro) beginBoss(id); },
  exp(v) { if (run) gainExp(v); },
};

/* Keep the save across live page updates when the viewer supports it. */
(function start() {
  const hot = window.claude && window.claude.hot;
  try { if (hot && typeof hot.snapshot === 'function') hot.snapshot(() => ({ save: SAVE })); } catch (e) { /* optional */ }
  const go = data => boot(data || {});
  if (hot && typeof hot.ready === 'function') hot.ready(go);
  else go(hot && hot.data ? hot.data : {});
})();
