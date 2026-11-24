/* =============================================================================
   Multiplayer on the screen: the servers people are hosting right now, and
   hosting one; on a server, who else is on it (with kills, deaths and a
   ping each), a name over every other player, and the feed of who arrived,
   who said what, and who killed whom.
   ========================================================================== */
import { P } from '../human/rig.js';
import { MAX_PLAYERS } from '../net/multiplayer.js';
import { $, el, clamp, put, putClass, keyed } from '../core/util.js';

const _s = [0, 0, 0];
const CROWN = '♛ ';

export class MPUI {
  constructor(game, ui, mp) {
    this.g = game; this.ui = ui; this.mp = mp;
    this.tags = new Map();          // a player's stand-in -> its name tag
    this.feedEls = [];
    this.slow = 0; this.listT = 0;
    mp.onFeed = (e) => this._feed(e);
    mp.onChange = () => this.changed();
    mp.onKicked = (how, note) => this._kicked(how, note);
    this._wire();
    this.changed();
  }

  _wire() {
    const tap = (id, fn) => { const b = $(id); if (!b) return; b.addEventListener('pointerdown', (e) => e.stopPropagation()); b.addEventListener('click', (e) => { e.preventDefault(); this.ui.sound.unlock(); fn(e); b.blur(); }); };
    tap('#btn-mp', () => this.open());
    tap('#mp-back', () => this.close());
    tap('#mp-refresh', () => { this._servers(); this.ui.toast('Server list refreshed'); });
    tap('#mp-host', () => this._host());
    tap('#mp-chip', () => this.toggleList());
    tap('#pl-close', () => this.toggleList(false));
    tap('#pl-leave', () => { this.toggleList(false); this.mp.leave(); });
    $('#mp-host-name').addEventListener('keydown', (e) => e.stopPropagation());
  }

  /* ------------------------------ the server list ------------------------------ */

  get isOpen() { return !$('#mp').hidden; }
  open() {
    $('#mp').hidden = false;
    const h = $('#mp-host-name');
    if (!h.dataset.edited) h.value = `${this.mp._name()}'s server`;
    h.oninput = () => { h.dataset.edited = '1'; };
    this._servers();
  }
  close() { $('#mp').hidden = true; }

  _status() {
    const mp = this.mp, e = $('#mp-status');
    let text, tone = '';
    if (!mp.available) { text = 'Multiplayer works when the game is open on claude.ai, with the people the page is shared with. A copy opened on its own has no server to play through: it is single player only.'; tone = 'err'; }
    else if (mp.banned) { text = mp.banText(); tone = 'err'; }
    else {
      const n = mp.room.peers().length;
      text = `You are ${mp._name()}${this.g.auth.admin ? ' (admin)' : ''}. ${n} ${n === 1 ? 'person has' : 'people have'} the game open right now.`; tone = 'live';
    }
    e.textContent = text; e.className = 'status ' + tone;
  }

  _servers() {
    this._status();
    const box = $('#mp-servers'), mp = this.mp, list = mp.servers;
    const items = list.length ? list : [{ note: mp.available ? 'Nobody is hosting a server right now. HOST one, and anyone else with the game open will see it here.' : 'No servers: there is nothing to connect through here.' }];
    // changed in place, not rebuilt: JOIN stays the same button from one refresh to the next
    keyed(box, items, (s) => (s.note ? 'note' : 'srv ' + s.id), (s) => (s.note ? el('p', 'note') : this._serverRow(s.id)), (r, s) => {
      if (s.note) { put(r, s.note); return; }
      const q = r.q, full = s.n >= s.max, here = mp.on && mp.server.id === s.id;
      put(q.name, s.name);
      put(q.host, `host ${s.host}${s.admin ? ' (admin)' : ''}`);
      put(q.n, `${s.n}/${s.max}`); putClass(q.n, 'srv-n' + (full ? ' full' : ''));
      put(q.ping, s.ping == null ? '…' : `${s.ping} ms`); putClass(q.ping, 'srv-ping ' + (s.ping == null ? '' : s.ping < 120 ? 'good' : s.ping < 250 ? 'mid' : 'bad'));
      put(q.join, here ? 'ON IT' : full ? 'FULL' : 'JOIN');
      const off = full || here || !!s.mine;
      if (q.join.disabled !== off) q.join.disabled = off;
    });
  }

  /** One server's row, for _servers to fill in. */
  _serverRow(id) {
    const row = el('div', 'srv'), name = el('div', 'srv-name');
    const q = { name: el('b'), host: el('small'), n: el('span', 'srv-n'), ping: el('span', 'srv-ping'), join: el('button', 'chip join') };
    name.append(q.name, q.host);
    row.append(name, q.n, q.ping, q.join);
    q.join.addEventListener('click', (e) => { e.preventDefault(); this.ui.sound.unlock(); this._join(id); });
    row.q = q;
    return row;
  }

  async _join(id) {
    const r = await this.mp.join(id);
    if (r.error) { this.ui.toast(r.error, 3.5); this._servers(); return; }
    this.close(); this.ui.play();
    this.ui.toast(`On ${this.mp.server.name}.` + (this.mp.isHost ? '' : ' Only the host spawns things here.'), 3.5);
  }
  async _host() {
    const max = clamp(Number($('#mp-max').value) || 8, 2, MAX_PLAYERS);
    const r = await this.mp.host({ name: $('#mp-host-name').value, max });
    if (r.error) { this.ui.toast(r.error, 3.5); this._status(); return; }
    this.close(); this.ui.play();
    this.ui.toast(`Your server "${this.mp.server.name}" is up. Anyone with the game open can join it.`, 4);
  }

  _kicked(how, note) {
    this.toggleList(false);
    const text = how === 'ban' ? this.mp.banText() || 'You were banned from multiplayer by the admin.' : 'You were kicked from the server by the admin.' + (note ? ` Note: "${note}"` : '');
    this.ui.toast(text, 6);
  }

  /* ---------------------------------- on a server ---------------------------------- */

  /** The server, or who is on it, changed. */
  changed() {
    const mp = this.mp, on = mp.on;
    $('#mp-chip').hidden = !on;
    // on a server, only its host spawns things
    const lock = on && !mp.isHost;
    const m = $('#btn-menu');
    m.classList.toggle('locked', lock);
    m.title = lock ? `Only the host (${mp.hostName || 'the host'}) spawns things on this server` : '';
    if (lock && !$('#sandbox').hidden) this.ui.toggleSandbox(false);
    $('#pl-leave').hidden = !on;
    if (!on) { this.toggleList(false); for (const t of this.tags.values()) t.el.remove(); this.tags.clear(); }
    this._chip();
    if (!$('#players').hidden) this._list();
    if (this.isOpen) this._servers();
    this.ui.adminui?.render();
  }

  _chip() {
    const mp = this.mp;
    if (!mp.on) return;
    $('#mp-chip-name').textContent = mp.server.name;
    $('#mp-chip-n').textContent = `${mp.count}/${mp.server.max}`;
    $('#mp-chip-ping').textContent = mp.isHost ? 'HOST' : mp.you.ping ? `${mp.you.ping} ms` : '…';
  }

  toggleList(on) {
    const p = $('#players');
    const show = on === undefined ? p.hidden && this.mp.on : on && this.mp.on;
    if (show) { this.ui.toggleDoctor(false); this.ui.toggleSandbox(false); this.ui.toggleAbilities(false); this.ui.adminui?.toggle(false); this.ui.input.exitLock(); }
    p.hidden = !show;
    $('#mp-chip').classList.toggle('on', show);
    if (show) this._list();
    this.ui._layout();
  }

  _list() {
    const mp = this.mp;
    if (!mp.on) return;
    put($('#pl-server'), mp.server.name);
    put($('#pl-sub'), `${mp.count}/${mp.server.max} players · host ${mp.hostName}`);
    const admin = this.g.auth.admin;
    const all = mp.players.slice().sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    // changed in place, not rebuilt, so that KICK stays the same button from one refresh to the next
    keyed($('#pl-rows'), [{ head: true }, ...all], (p) => (p.head ? 'head' : p.you ? 'you' : 'pl ' + p.peer), (p) => {
      if (p.head) {
        const head = el('div', 'pl head');
        for (const t of ['PLAYER', 'K', 'D', 'PING', '']) head.appendChild(el('span', '', t));
        return head;
      }
      const r = el('div', 'pl'), who = el('div', 'pl-who');
      r.q = { name: el('b'), state: el('small'), kills: el('span'), deaths: el('span'), ping: el('span', 'ping'), kick: el('span'), peer: p.peer };
      who.append(r.q.name, r.q.state);
      r.append(who, r.q.kills, r.q.deaths, r.q.ping, r.q.kick);
      return r;
    }, (r, p) => {
      if (p.head) return;
      const q = r.q;
      putClass(r, 'pl' + (p.you ? ' you' : ''));
      const name = (p.host ? CROWN : '') + p.name + (p.you ? ' (you)' : '');
      if (q.nameText !== name || q.badge !== !!p.admin) {
        q.nameText = name; q.badge = !!p.admin;
        q.name.textContent = name;
        if (p.admin) q.name.appendChild(el('span', 'badge', 'ADMIN'));
      }
      const h = p.h, state = !h || h.removed ? '' : !h.h.alive ? 'dead' : !h.h.conscious ? 'knocked out' : h.car ? 'driving' : 'playing';
      put(q.state, (p.host ? 'host · ' : '') + state);
      put(q.kills, String(p.kills));
      put(q.deaths, String(p.deaths));
      put(q.ping, p.host && p.you ? '-' : p.ping ? String(p.ping) : '…');
      const kick = admin && !p.you;
      if (kick && !q.kick.firstChild) {
        const kb = el('button', 'chip kick', 'KICK');
        kb.addEventListener('click', (e) => { e.preventDefault(); const res = mp.adminKick(q.peer); this.ui.toast(res.error || `${res.who} was kicked.`); });
        q.kick.appendChild(kb);
      } else if (!kick && q.kick.firstChild) q.kick.textContent = '';
    });
    put($('#pl-stats'), 'Everyone here is a real person. Fights between players count on both screens, and the city (its people, police, traffic and everything in it) is the host’s, the same for everybody.');
  }

  /* ------------------------------------ the feed ------------------------------------ */

  _feed(e) {
    const box = $('#feed');
    if (!box) return;
    const d = el('div', 'fe ' + e.kind + (e.mine ? ' mine' : ''));
    if (e.kind === 'kill' && !e.a) {
      d.appendChild(el('b', '', e.v));
      d.appendChild(el('i', '', e.w ? `died [${e.w}]` : 'died'));
    } else if (e.kind === 'kill') {
      d.appendChild(el('b', '', e.a));
      d.appendChild(el('i', '', e.w ? `[${e.w}]` : '☠'));
      d.appendChild(el('b', '', e.v));
    } else if (e.kind === 'chat') {
      d.appendChild(el('b', e.admin ? 'host' : '', e.a + ':'));
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
    this.listT += dt;
    if (this.isOpen && this.listT > 1) { this.listT = 0; this._servers(); }
    if (!mp.on) return;
    this._tags(dt);
    this.slow += dt;
    if (this.slow > 0.5) { this.slow = 0; this._chip(); if (!$('#players').hidden) this._list(); }
  }

  /** A name over every other player: over their car, if they are driving; not through walls. */
  _tags(dt) {
    const g = this.g, box = $('#tags'), cam = g.camera.position;
    const live = new Set();
    for (const r of this.mp.remotes.values()) {
      const h = r.h;
      if (!h || h.removed || !h.h.alive) continue;
      live.add(h);
      let t = this.tags.get(h);
      if (!t) {
        const e = el('div', 'tag');
        const n = el('span', '', '');
        const bar = el('i'); const fill = el('u'); bar.appendChild(fill);
        e.appendChild(n); e.appendChild(bar);
        box.appendChild(e);
        t = { el: e, n, fill, seen: true, occT: 0 };
        this.tags.set(h, t);
      }
      const label = r.name + (r.admin ? ' ★' : '');
      if (t.n.textContent !== label) t.n.textContent = label;
      t.el.classList.toggle('host', r.peer === this.mp.hostPeer);
      const hd = h.bodies[P.HEAD], car = r.car;
      const x = car ? car.x : hd.px, y = car ? car.y + 2.1 : hd.py + 0.36 * h.scale, z = car ? car.z : hd.pz;
      const d = Math.hypot(x - cam.x, y - cam.y, z - cam.z);
      g.toScreen(x, y, z, _s);
      if ((t.occT -= dt) <= 0) { t.occT = 0.25; t.seen = d < 6 || g.world.lineClear(cam.x, cam.y, cam.z, x, y, z); }
      const on = t.seen && _s[2] < 1 && _s[2] > -1 && d < 60 && _s[0] > -60 && _s[0] < g.width + 60 && _s[1] > -30 && _s[1] < g.height + 30;
      t.el.style.display = on ? '' : 'none';
      if (!on) continue;
      const k = clamp(1.15 - d / 70, 0.62, 1);
      t.el.style.transform = `translate(${_s[0].toFixed(1)}px, ${_s[1].toFixed(1)}px) translate(-50%, -100%) scale(${k.toFixed(3)})`;
      t.el.style.opacity = String(clamp((62 - d) / 14, 0.25, 1).toFixed(2));
      const pct = h.remoteHp ?? 100;
      t.fill.style.width = Math.round(pct) + '%';
      t.fill.style.background = pct > 66 ? 'var(--ok)' : pct > 33 ? 'var(--warn)' : 'var(--bad)';
      t.el.classList.toggle('out', !h.h.conscious);
    }
    for (const [h, t] of this.tags) if (!live.has(h)) { t.el.remove(); this.tags.delete(h); }
  }
}
