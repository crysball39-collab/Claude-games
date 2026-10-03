/* =============================================================================
   The HUD and the spawn menu.

   The menu slides in from the left. Tapping a card selects it - it gets a
   green outline - and SPAWN puts it on the platform at the green ring in the
   middle of the view. The selection stays, so after closing the menu the
   SPAWN button in the corner keeps spawning it.
   ========================================================================== */
import { TEAMS, TEAM } from '../game/appearance.js';
import { PROP_TYPES } from '../game/props.js';
import { shade } from '../core/util.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game, input, sound = null) {
    this.game = game;
    this.input = input;
    this.sound = sound;
    this.count = 1;
    this.selected = null;
    this.cards = [];

    this.drawer = $('spawn-menu');
    this.buildCards();

    $('btn-menu').addEventListener('click', () => this.toggle(true));
    $('btn-close').addEventListener('click', () => this.toggle(false));
    for (const tab of document.querySelectorAll('.tab')) {
      tab.addEventListener('click', () => this.showTab(tab.dataset.tab));
    }
    for (const b of $('count').querySelectorAll('button')) {
      b.addEventListener('click', () => {
        this.count = +b.dataset.n;
        for (const o of $('count').querySelectorAll('button')) o.classList.toggle('active', o === b);
        this.refreshSpawnButtons();
      });
    }
    $('btn-spawn').addEventListener('click', () => this.spawn());
    $('btn-quick').addEventListener('click', () => this.spawn());
    $('btn-slow').addEventListener('click', () => {
      game.timeScale = game.timeScale < 1 ? 1 : 0.3;
      $('btn-slow').classList.toggle('on', game.timeScale < 1);
      this.toast(game.timeScale < 1 ? 'Slow motion' : 'Normal speed');
    });
    $('btn-pause').addEventListener('click', () => {
      game.paused = !game.paused;
      $('btn-pause').classList.toggle('on', game.paused);
      this.toast(game.paused ? 'Paused' : 'Running');
    });
    let clearArmed = 0;
    $('btn-clear').addEventListener('click', () => {
      const now = performance.now();
      if (now - clearArmed < 2500) {
        game.clearAll();
        clearArmed = 0;
        this.toast('Cleared');
      } else {
        clearArmed = now;
        this.toast('Tap again to clear everything');
      }
    });
    const soundBtn = $('btn-sound');
    let muted = false;
    try { muted = localStorage.getItem('overgrowth.muted') === '1'; } catch (_) { /* private mode */ }
    const setMuted = (m) => {
      muted = m;
      if (this.sound) this.sound.setMuted(m);
      soundBtn.classList.toggle('off', m);
      try { localStorage.setItem('overgrowth.muted', m ? '1' : '0'); } catch (_) { /* private mode */ }
    };
    setMuted(muted);
    soundBtn.addEventListener('click', () => {
      if (this.sound) this.sound.unlock();
      setMuted(!muted);
      this.toast(muted ? 'Sound off' : 'Sound on');
    });
    $('btn-clear-dead').addEventListener('click', () => { game.clearDead(); this.toast('Removed the dead'); });
    $('btn-blood').addEventListener('click', () => {
      game.blood.enabled = !game.blood.enabled;
      $('btn-blood').textContent = 'Blood: ' + (game.blood.enabled ? 'on' : 'off');
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'KeyM') { e.preventDefault(); this.toggle(); }
      if (e.code === 'KeyF' || e.code === 'Enter') this.spawn();
      if (e.code === 'KeyP') $('btn-pause').click();
      if (e.code === 'KeyT') $('btn-slow').click();
      if (e.code === 'Escape') this.toggle(false);
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 6) this.select({ type: 'human', team: TEAMS[n - 1].id });
    });

    game.on('counts', (c) => this.renderCounts(c));
    game.on('death', (h, killer, cause) => this.onDeath(h, killer, cause));
    game.on('toast', (t) => this.toast(t));
    game.on('pickup', (h, p) => this.feed(`${tag(h.team)} picked up a ${p.name.toLowerCase()}`));
  }

  /* --------------------------------- cards -------------------------------- */

  buildCards() {
    const gh = $('grid-humans'), go = $('grid-objects');
    for (const t of TEAMS) {
      const card = this.card(gh, t.name, 'Human', (ctx, w) => drawHumanIcon(ctx, w, t));
      card.dataset.team = t.id;
      card.addEventListener('click', () => this.select({ type: 'human', team: t.id }));
      this.cards.push({ el: card, sel: { type: 'human', team: t.id } });
    }
    for (const kind of Object.keys(PROP_TYPES)) {
      const T = PROP_TYPES[kind];
      const card = this.card(go, T.name, T.weapon ? 'Weapon' : 'Object', (ctx, w) => drawPropIcon(ctx, w, kind));
      card.dataset.kind = kind;
      card.addEventListener('click', () => this.select({ type: 'prop', kind }));
      this.cards.push({ el: card, sel: { type: 'prop', kind } });
    }
  }

  card(parent, name, sub, draw) {
    const el = document.createElement('button');
    el.className = 'card';
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    draw(c.getContext('2d'), 96);
    const n = document.createElement('div'); n.className = 'name'; n.textContent = name;
    const s = document.createElement('div'); s.className = 'sub'; s.textContent = sub;
    el.append(c, n, s);
    parent.append(el);
    return el;
  }

  showTab(which) {
    for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t.dataset.tab === which);
    $('grid-humans').classList.toggle('hidden', which !== 'humans');
    $('grid-objects').classList.toggle('hidden', which !== 'objects');
  }

  select(sel) {
    const same = this.selected && sel && this.selected.type === sel.type &&
      this.selected.team === sel.team && this.selected.kind === sel.kind;
    this.selected = same ? null : sel;
    this.game.selection = this.selected;
    for (const c of this.cards) {
      const on = !!this.selected && c.sel.type === this.selected.type &&
        c.sel.team === this.selected.team && c.sel.kind === this.selected.kind;
      c.el.classList.toggle('selected', on);
    }
    this.refreshSpawnButtons();
  }

  selectionName() {
    const s = this.selected;
    if (!s) return '';
    return s.type === 'human' ? TEAM[s.team].name.toUpperCase() : PROP_TYPES[s.kind].name.toUpperCase();
  }

  refreshSpawnButtons() {
    const b = $('btn-spawn'), q = $('btn-quick');
    const s = this.selected;
    b.disabled = !s;
    b.textContent = s ? `SPAWN ${this.selectionName()}${this.count > 1 ? ' ×' + this.count : ''}` : 'SELECT SOMETHING';
    q.classList.toggle('hidden', !s);
    $('crosshair').classList.toggle('hidden', !s);
    if (s) {
      q.querySelector('.label').textContent = 'SPAWN';
      q.querySelector('.swatch').style.background = s.type === 'human' ? TEAM[s.team].color : '#b88a52';
    }
  }

  spawn() {
    if (!this.selected) { this.toast('Pick something in the spawn menu first'); this.toggle(true); return; }
    if (!this.game.markerPoint) { this.toast('Aim the ring at the platform'); return; }
    const n = this.game.spawnSelected(this.count);
    if (n === 0) this.toast('No room there');
  }

  toggle(open) {
    const want = open == null ? !this.drawer.classList.contains('open') : open;
    this.drawer.classList.toggle('open', want);
    document.body.classList.toggle('menu-open', want);
    this.drawer.setAttribute('aria-hidden', want ? 'false' : 'true');
  }

  get open() { return this.drawer.classList.contains('open'); }

  /* ---------------------------------- hud --------------------------------- */

  renderCounts(c) {
    const el = $('teams');
    let html = '';
    for (const t of TEAMS) {
      const k = c[t.id];
      if (!k.alive && !k.dead) continue;
      html += `<div class="team-pill${k.alive ? '' : ' out'}"><span class="sw" style="background:${t.color}"></span>${k.alive}` +
        (k.dead ? `<span class="dead">+${k.dead}†</span>` : '') + '</div>';
    }
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  onDeath(h, killer, cause) {
    if (cause === 'fell') this.feed(`${tag(h.team)} fell off the edge`);
    else if (killer) this.feed(`${tag(killer.team)} killed ${tag(h.team)}`);
    else this.feed(`${tag(h.team)} died`);
    // last team standing
    const alive = new Set(this.game.humans.filter((x) => x.alive).map((x) => x.team));
    const teamsEver = new Set(this.game.humans.map((x) => x.team));
    if (alive.size === 1 && teamsEver.size > 1) {
      const t = TEAM[[...alive][0]];
      this.toast(`${t.name} team wins!`);
    }
  }

  feed(html) {
    const f = $('feed');
    const d = document.createElement('div');
    d.className = 'feed-item';
    d.innerHTML = html;
    f.prepend(d);
    while (f.children.length > 4) f.lastChild.remove();
    setTimeout(() => d.classList.add('fade'), 3500);
    setTimeout(() => d.remove(), 4200);
  }

  toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => t.classList.remove('show'), 1800);
  }
}

function tag(team) {
  const t = TEAM[team];
  return `<span class="t" style="color:${t.id === 'black' ? '#b8b8c0' : t.color}">${t.name}</span>`;
}

/* --------------------------------- icons ---------------------------------- */

function drawHumanIcon(ctx, w, team) {
  const s = w / 96;
  ctx.clearRect(0, 0, w, w);
  const g = ctx.createRadialGradient(48 * s, 70 * s, 4, 48 * s, 60 * s, 50 * s);
  g.addColorStop(0, 'rgba(255,255,255,0.10)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, w);
  const box = (x, y, bw, bh, c) => { ctx.fillStyle = c; ctx.fillRect(x * s, y * s, bw * s, bh * s); };
  const skin = '#e0ac85';
  // legs and feet
  box(36, 60, 10, 22, team.pants); box(50, 60, 10, 22, team.pants);
  box(35, 82, 12, 5, '#1d1d1f'); box(49, 82, 12, 5, '#1d1d1f');
  // pelvis, torso
  box(34, 54, 28, 9, team.pants);
  box(36, 44, 24, 11, team.color); box(35, 36, 26, 9, team.color); box(33, 26, 30, 11, shade(team.color, 1.08));
  // arms up in a guard: upper arms down to the elbow, forearms up to the chin
  box(25, 27, 8, 14, team.color); box(63, 27, 8, 14, team.color);
  ctx.strokeStyle = skin; ctx.lineWidth = 7 * s; ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(29 * s, 40 * s); ctx.lineTo(34 * s, 24 * s);
  ctx.moveTo(67 * s, 40 * s); ctx.lineTo(62 * s, 24 * s);
  ctx.stroke();
  box(30, 16, 9, 9, skin); box(57, 16, 9, 9, skin);
  // neck, head
  box(44, 22, 8, 5, skin);
  box(39, 6, 18, 17, skin);
  box(39, 4, 18, 5, '#3b2414');
  box(42, 12, 4, 3, '#fff'); box(50, 12, 4, 3, '#fff');
  box(43, 12, 2, 3, '#111'); box(51, 12, 2, 3, '#111');
  box(45, 18, 6, 1.5, '#7a3030');
  // outline glow in the team colour
  ctx.strokeStyle = shade(team.color, 1.3);
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2 * s;
  ctx.strokeRect(2 * s, 2 * s, w - 4 * s, w - 4 * s);
  ctx.globalAlpha = 1;
}

function drawPropIcon(ctx, w, kind) {
  const s = w / 96;
  ctx.clearRect(0, 0, w, w);
  ctx.save();
  ctx.scale(s, s);
  if (kind === 'crate') {
    ctx.fillStyle = '#a8773f'; ctx.fillRect(18, 22, 60, 56);
    ctx.fillStyle = '#7b5226';
    ctx.fillRect(18, 22, 60, 6); ctx.fillRect(18, 72, 60, 6); ctx.fillRect(18, 22, 6, 56); ctx.fillRect(72, 22, 6, 56);
    ctx.strokeStyle = '#7b5226'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(22, 74); ctx.lineTo(74, 26); ctx.stroke();
    ctx.fillStyle = '#5d3d1c';
    for (let i = 1; i < 5; i++) ctx.fillRect(24, 22 + i * 11, 48, 1);
  } else if (kind === 'bat') {
    ctx.translate(48, 48); ctx.rotate(-0.8);
    ctx.fillStyle = '#c99b62';
    ctx.beginPath(); ctx.moveTo(-38, -3); ctx.lineTo(30, -7); ctx.quadraticCurveTo(40, 0, 30, 7); ctx.lineTo(-38, 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1d1d22'; ctx.fillRect(-40, -4, 18, 8);
    ctx.fillStyle = '#c99b62'; ctx.fillRect(-44, -5, 4, 10);
  } else if (kind === 'sword') {
    ctx.translate(48, 48); ctx.rotate(-0.8);
    ctx.fillStyle = '#c9ced6';
    ctx.beginPath(); ctx.moveTo(-14, -4); ctx.lineTo(36, -4); ctx.lineTo(44, 0); ctx.lineTo(36, 4); ctx.lineTo(-14, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#aeb4bd'; ctx.fillRect(-12, -1, 46, 2);
    ctx.fillStyle = '#6b5a3a'; ctx.fillRect(-18, -12, 5, 24);
    ctx.fillStyle = '#3b2a1c'; ctx.fillRect(-36, -3, 18, 6);
    ctx.fillStyle = '#6b5a3a'; ctx.fillRect(-40, -4, 5, 8);
  }
  ctx.restore();
}
