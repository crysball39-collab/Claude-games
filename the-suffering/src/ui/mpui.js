/* =============================================================================
   Multiplayer on the screen: the server list and hosting a server; on a
   server, who else is on it (with a score and a ping each), a name over
   every bot, and the feed of who joined, who said what, and who killed whom.
   ========================================================================== */
import { P } from '../human/rig.js';
import { BOT_MODEL_NAME } from '../mind/botminds.js';
import { MAX_PLAYERS } from '../net/multiplayer.js';
import { $, el, clamp } from '../core/util.js';

const _s = [0, 0, 0];
const CROWN = '♛ ';
const DOING = { wander: 'wandering', move_to: 'on the move', follow: 'following someone', flee: 'running away', attack: 'fighting', pick_up: 'picking something up', equip: 'drawing a weapon', holster: 'holstering', reload: 'reloading', drop: 'dropping something', enter_car: 'taking a car', exit_car: 'getting out', crouch: 'crouching', jump: 'jumping', wait: 'standing about', spawn: 'spawning things', tempest_kick: 'Tempest Kick' };

export class MPUI {
  constructor(game, ui, mp, botMinds) {
    this.g = game; this.ui = ui; this.mp = mp; this.bm = botMinds;
    this.tags = new Map();          // bot -> { el, bar, seen, occT }
    this.feedEls = [];
    this.slow = 0;
    mp.onFeed = (e) => this._feed(e);
    mp.onChange = () => this.changed();
    botMinds.onChange = () => this._brain();
    this._wire();
    this.changed();
  }

  _wire() {
    const tap = (id, fn) => { const b = $(id); if (!b) return; b.addEventListener('pointerdown', (e) => e.stopPropagation()); b.addEventListener('click', (e) => { e.preventDefault(); this.ui.sound.unlock(); fn(e); b.blur(); }); };
    tap('#btn-mp', () => this.open());
    tap('#mp-back', () => this.close());
    tap('#mp-refresh', () => { this.mp.refresh(); this._servers(); this.ui.toast('Server list refreshed'); });
    tap('#mp-host', () => this._host());
    tap('#mp-chip', () => this.toggleList());
    tap('#pl-close', () => this.toggleList(false));
    tap('#pl-leave', () => { this.toggleList(false); this.mp.leave(); });
    const name = $('#mp-name');
    name.addEventListener('change', () => { name.value = this.mp.setName(name.value); this._hostDefault(); });
    name.addEventListener('keydown', (e) => e.stopPropagation());
    $('#mp-host-name').addEventListener('keydown', (e) => e.stopPropagation());
    const ai = $('#mp-claude');
    ai.addEventListener('change', () => { this.ui.settings.botAi = ai.checked; this.ui.save(); this.bm.reset(); this._brain(); });
    const max = $('#mp-max'), bots = $('#mp-bots');
    const fit = () => { const m = Number(max.value); bots.max = String(m - 1); if (Number(bots.value) > m - 1) bots.value = String(m - 1); $('#mp-bots-n').textContent = bots.value; };
    max.addEventListener('change', fit); bots.addEventListener('input', fit);
    fit();
  }

  /* ------------------------------ the server list ------------------------------ */

  open() {
    $('#mp').hidden = false;
    $('#mp-name').value = this.mp.you.name;
    $('#mp-claude').checked = this.ui.settings.botAi !== false;
    this._hostDefault();
    this.mp.refresh();
    this._servers();
    this._brain();
  }
  close() { $('#mp').hidden = true; }

  _hostDefault() { const h = $('#mp-host-name'); if (!h.dataset.edited) h.value = `${this.mp.you.name}'s server`; h.oninput = () => { h.dataset.edited = '1'; }; }

  _servers() {
    const box = $('#mp-servers');
    box.textContent = '';
    for (const s of this.mp.servers) {
      const row = el('div', 'srv');
      const name = el('div', 'srv-name');
      name.appendChild(el('b', '', s.name));
      name.appendChild(el('small', '', `${s.mode} · ${s.region} · host ${s.host}`));
      row.appendChild(name);
      row.appendChild(el('span', 'srv-n' + (s.players >= s.max ? ' full' : ''), `${s.players}/${s.max}`));
      row.appendChild(el('span', 'srv-ping ' + (s.ping < 70 ? 'good' : s.ping < 140 ? 'mid' : 'bad'), `${s.ping} ms`));
      const full = s.players >= s.max;
      const b = el('button', 'chip join', full ? 'FULL' : 'JOIN');
      b.disabled = full;
      b.addEventListener('click', (e) => { e.preventDefault(); this.ui.sound.unlock(); this._join(s); });
      row.appendChild(b);
      box.appendChild(row);
    }
  }

  _brain() {
    const st = this.bm.status();
    for (const id of ['#mp-brain', '#pl-brain']) { const e = $(id); if (e) { e.textContent = st.text; e.className = 'status ' + st.tone; } }
  }

  _start() {
    this.close();
    this.ui.play();
  }
  _join(s) {
    this.mp.setName($('#mp-name').value);
    this._start();
    if (!this.mp.join(s)) { this.ui.showMenu(); this.open(); }
  }
  _host() {
    this.mp.setName($('#mp-name').value);
    const max = Number($('#mp-max').value) || 8, bots = Number($('#mp-bots').value) || 1;
    this._start();
    this.mp.host({ name: $('#mp-host-name').value, max: clamp(max, 2, MAX_PLAYERS), bots });
  }

  /* --------------------------------- on a server --------------------------------- */

  /** Who is on the server, or whether there is one, changed: the chip, the list, the locks. */
  changed() {
    const mp = this.mp, on = mp.on;
    $('#mp-chip').hidden = !on;
    // on somebody else's server the sandbox and the abilities are the host's
    const lock = mp.guest;
    for (const id of ['#btn-menu', '#btn-abilities']) { const b = $(id); b.classList.toggle('locked', lock); b.title = lock ? `Only the host (${mp.hostName}) can` : ''; }
    if (lock) { if (!$('#sandbox').hidden) this.ui.toggleSandbox(false); if (!$('#abilities').hidden) this.ui.toggleAbilities(false); }
    if (!on) { this.toggleList(false); for (const t of this.tags.values()) t.el.remove(); this.tags.clear(); }
    this._chip();
    if (!$('#players').hidden) this._list();
    this.ui._power?.();
  }

  _chip() {
    const mp = this.mp;
    if (!mp.on) return;
    $('#mp-chip-name').textContent = mp.server.name;
    $('#mp-chip-n').textContent = `${mp.players.length}/${mp.server.max}`;
    $('#mp-chip-ping').textContent = mp.isHost ? 'HOST' : `${mp.you.ping} ms`;
  }

  toggleList(on) {
    const p = $('#players');
    const show = on === undefined ? p.hidden && this.mp.on : on && this.mp.on;
    if (show) { this.ui.toggleDoctor(false); this.ui.toggleSandbox(false); this.ui.toggleAbilities(false); this.ui.input.exitLock(); }
    p.hidden = !show;
    $('#mp-chip').classList.toggle('on', show);
    if (show) { this._list(); this._brain(); }
    this.ui._layout();
  }

  _list() {
    const mp = this.mp, g = this.g;
    if (!mp.on) return;
    $('#pl-server').textContent = mp.server.name;
    $('#pl-sub').textContent = `${mp.server.mode} · ${mp.server.region} · ${mp.players.length}/${mp.server.max} players · host ${mp.hostName}`;
    const box = $('#pl-rows');
    box.textContent = '';
    const head = el('div', 'pl head');
    for (const t of ['PLAYER', 'K', 'D', 'PING', '']) head.appendChild(el('span', '', t));
    box.appendChild(head);
    const row = (p) => {
      const r = el('div', 'pl' + (p.isYou ? ' you' : ''));
      const who = el('div', 'pl-who');
      const host = p.isYou ? mp.isHost : p.host;
      who.appendChild(el('b', '', (host ? CROWN : '') + p.name + (p.isYou ? ' (you)' : '')));
      if (!p.isYou) {
        const h = p.human, d = p.lastDecision;
        const state = !h || h.removed ? 'respawning' : !h.h.alive ? 'dead' : !h.h.conscious ? 'knocked out' : h.car ? 'driving' : DOING[p.brain ? p.brain.plan.action : ''] || 'playing';
        const brain = p.asking ? 'thinking' : d ? (d.from === 'claude' ? BOT_MODEL_NAME.replace('Claude ', '') : 'built-in') : mp.minds.usable ? BOT_MODEL_NAME.replace('Claude ', '') : 'built-in';
        who.appendChild(el('small', '', `${p.persona.id} · ${state} · ${brain}`));
      } else who.appendChild(el('small', '', mp.isHost ? 'host: spawning and abilities are yours' : 'guest: only the host spawns and uses abilities'));
      r.appendChild(who);
      r.appendChild(el('span', '', String(p.kills)));
      r.appendChild(el('span', '', String(p.deaths)));
      r.appendChild(el('span', 'ping', p.isYou && mp.isHost ? '-' : `${p.ping}`));
      const k = el('span', '');
      if (mp.isHost && !p.isYou) {
        const b = el('button', 'chip kick', 'KICK');
        b.addEventListener('click', (e) => { e.preventDefault(); mp.kick(p); });
        k.appendChild(b);
      }
      r.appendChild(k);
      box.appendChild(r);
    };
    const all = mp.players.slice().sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    for (const p of all) row(p);
    const s = mp.minds.stats;
    $('#pl-stats').textContent = mp.minds.usable || s.asked
      ? `${BOT_MODEL_NAME} decisions so far: ${s.answered} of ${s.asked} asked${s.refused ? `, ${s.refused} declined` : ''}${s.failed ? `, ${s.failed} failed` : ''}; about $${mp.minds.cost.toFixed(4)} by the API's token counts.`
      : `Built-in bot decisions so far: ${mp.stats.self}.`;
  }

  /* ------------------------------------ the feed ------------------------------------ */

  _feed(e) {
    const box = $('#feed');
    if (!box) return;
    const d = el('div', 'fe ' + e.kind + (e.mine ? ' mine' : ''));
    if (e.kind === 'kill' && !e.a) {
      // nobody did it: they simply died
      d.appendChild(el('b', '', e.v));
      d.appendChild(el('i', '', e.w ? `died [${e.w}]` : 'died'));
    } else if (e.kind === 'kill') {
      d.appendChild(el('b', '', e.a));
      d.appendChild(el('i', '', e.w ? `[${e.w}]` : '☠'));
      d.appendChild(el('b', '', e.v));
    } else if (e.kind === 'chat') {
      d.appendChild(el('b', e.host ? 'host' : '', (e.host ? CROWN : '') + e.a + ':'));
      d.appendChild(document.createTextNode(' ' + e.v));
    } else d.textContent = e.a;
    box.appendChild(d);
    this.feedEls.push({ el: d, t: e.kind === 'chat' ? 11 : 8 });
    while (this.feedEls.length > 7) this.feedEls.shift().el.remove();
  }

  /* -------------------------------------- frame -------------------------------------- */

  update(dt) {
    const mp = this.mp;
    for (let i = this.feedEls.length - 1; i >= 0; i--) {
      const f = this.feedEls[i];
      f.t -= dt;
      if (f.t < 1) f.el.style.opacity = String(Math.max(0, f.t));
      if (f.t <= 0) { f.el.remove(); this.feedEls.splice(i, 1); }
    }
    if (!mp.on) return;
    this._tags(dt);
    this.slow += dt;
    if (this.slow > 0.5) { this.slow = 0; this._chip(); if (!$('#players').hidden) this._list(); }
  }

  /** A name over every bot's head: over the car, if it is in one; not through walls. */
  _tags(dt) {
    const g = this.g, mp = this.mp, box = $('#tags'), cam = g.camera.position;
    const live = new Set();
    for (const b of mp.bots) {
      const h = b.human;
      if (!h || h.removed || !h.h.alive) continue;
      live.add(b);
      let t = this.tags.get(b);
      if (!t) {
        const e = el('div', 'tag' + (b.host ? ' host' : ''));
        const n = el('span', '', (b.host ? CROWN : '') + b.name);
        const bar = el('i'); const fill = el('u'); bar.appendChild(fill);
        e.appendChild(n); e.appendChild(bar);
        box.appendChild(e);
        t = { el: e, fill, seen: true, occT: 0, h: null };
        this.tags.set(b, t);
      }
      if (t.h !== h) { t.h = h; t.occT = 0; }
      const hd = h.bodies[P.HEAD];
      const x = h.car ? h.car.x : hd.px, y = h.car ? h.car.y + 2.1 : hd.py + 0.36 * h.scale, z = h.car ? h.car.z : hd.pz;
      const d = Math.hypot(x - cam.x, y - cam.y, z - cam.z);
      g.toScreen(x, y, z, _s);
      // through a wall, the name goes too (looked again a few times a second)
      if ((t.occT -= dt) <= 0) { t.occT = 0.25; t.seen = d < 6 || g.world.lineClear(cam.x, cam.y, cam.z, x, y, z); }
      const on = t.seen && _s[2] < 1 && _s[2] > -1 && d < 48 && _s[0] > -60 && _s[0] < g.width + 60 && _s[1] > -30 && _s[1] < g.height + 30;
      t.el.style.display = on ? '' : 'none';
      if (!on) continue;
      const k = clamp(1.15 - d / 55, 0.62, 1);
      t.el.style.transform = `translate(${_s[0].toFixed(1)}px, ${_s[1].toFixed(1)}px) translate(-50%, -100%) scale(${k.toFixed(3)})`;
      t.el.style.opacity = String(clamp((50 - d) / 14, 0.25, 1).toFixed(2));
      const c = h.h.condition;
      t.fill.style.width = Math.round(c.pct) + '%';
      t.fill.style.background = c.tone === 'good' ? 'var(--ok)' : c.tone === 'warn' ? 'var(--warn)' : 'var(--bad)';
      t.el.classList.toggle('out', !h.h.conscious);
    }
    for (const [b, t] of this.tags) if (!live.has(b)) { t.el.remove(); this.tags.delete(b); }
  }
}
