/* =============================================================================
   The admin menu: choose anyone on your server (you are at the top), then
   APPLY a speed, max HP, toughness and wanted level, KICK them, or BAN them
   for a while with a note they are shown. Only the admin account has it.
   ========================================================================== */
import { $, el, clamp } from '../core/util.js';

const WANT = ['None', '★', '★★'];

export class AdminUI {
  constructor(game, ui, mp, auth) {
    this.g = game; this.ui = ui; this.mp = mp; this.auth = auth;
    this.target = 'me';
    this.set = new Map();          // what you last applied to each player: target -> values
    this.slow = 0;
    this._wire();
    this.changed();
  }

  _wire() {
    const tap = (id, fn) => { const b = $(id); b.addEventListener('pointerdown', (e) => e.stopPropagation()); b.addEventListener('click', (e) => { e.preventDefault(); this.ui.sound.unlock(); fn(); b.blur(); }); };
    tap('#btn-admin', () => this.toggle());
    tap('#ad-close', () => this.toggle(false));
    tap('#ad-apply', () => this.apply());
    tap('#ad-kick', () => this.kick());
    tap('#ad-ban', () => this.ban());
    const show = () => {
      $('#ad-speed-n').textContent = $('#ad-speed').value + 'x';
      $('#ad-hp-n').textContent = $('#ad-hp').value;
      $('#ad-tough-n').textContent = $('#ad-tough').value + 'x';
    };
    for (const id of ['#ad-speed', '#ad-hp', '#ad-tough']) $(id).addEventListener('input', show);
    $('#ad-note').addEventListener('keydown', (e) => e.stopPropagation());
    show();
  }

  get isOpen() { return !$('#admin').hidden; }

  /** Signed in or out: the ADMIN button is there only for the admin. */
  changed() {
    const admin = this.auth.admin;
    $('#btn-admin').hidden = !admin;
    if (!admin && this.isOpen) this.toggle(false);
  }

  toggle(on) {
    const p = $('#admin');
    const show = on === undefined ? p.hidden : on;
    if (show && !this.auth.admin) { this.ui.toast('The admin menu is only for the admin account.'); return; }
    if (show) {
      this.ui.toggleSandbox(false); this.ui.toggleAbilities(false); this.ui.toggleDoctor(false); this.ui.mpui?.toggleList(false);
      this.ui.input.exitLock();
    }
    p.hidden = !show;
    $('#btn-admin').classList.toggle('on', show);
    if (show) { this._select(this.target); this.render(); }
    this.ui._layout();
  }

  /** Everyone you could choose: you, then the others on your server. */
  _targets() {
    const out = [{ id: 'me', name: this.auth.name || 'You', sub: 'you', you: true }];
    for (const p of this.mp.players) if (!p.you) out.push({ id: p.peer, name: p.name, sub: (p.host ? 'host · ' : '') + (p.ping ? p.ping + ' ms' : '') + (p.by ? '' : ' · no id'), by: p.by });
    return out;
  }

  render() {
    if (!this.isOpen) return;
    const mp = this.mp, box = $('#ad-targets');
    const list = this._targets();
    if (!list.some((t) => t.id === this.target)) this._select('me');
    box.textContent = '';
    for (const t of list) {
      const b = el('button', 'tg' + (t.id === this.target ? ' on' : ''));
      b.appendChild(el('span', '', t.name + (t.you ? ' (you)' : '')));
      b.appendChild(el('small', '', t.sub));
      b.addEventListener('click', (e) => { e.preventDefault(); this._select(t.id); this.render(); });
      box.appendChild(b);
    }
    $('#ad-sub').textContent = mp.on
      ? `${mp.server.name} · ${mp.players.length} player${mp.players.length === 1 ? '' : 's'}` + (mp.adminVerified ? '' : ' · your commands to others are not recognised yet')
      : 'Single player: just you. On a server, everyone on it is here.';
    $('#ad-kick').disabled = !mp.on;
    $('#ad-ban').disabled = !mp.db;
    // the bans in force
    const ul = $('#ad-bans');
    ul.textContent = '';
    const bans = mp.banList;
    if (!mp.db) ul.appendChild(el('li', 'empty', 'Bans need the game open on claude.ai.'));
    else if (!bans.length) ul.appendChild(el('li', 'empty', 'Nobody is banned.'));
    for (const b of bans) {
      const li = el('li', '');
      li.appendChild(el('span', '', b.name + (b.note ? ' — ' + b.note : '')));
      const right = el('span', '', b.until ? 'until ' + new Date(b.until).toLocaleString() : 'for good');
      const u = el('button', 'chip unban', 'UNBAN');
      u.addEventListener('click', async (e) => { e.preventDefault(); const r = await mp.adminUnban(b.id); this._msg(r.error || 'Ban lifted for ' + b.name + '.'); this.render(); });
      right.appendChild(document.createTextNode(' ')); right.appendChild(u);
      li.appendChild(right);
      ul.appendChild(li);
    }
  }

  /** Choosing someone shows what they are set to now: yours as they are, others' as you last set them. */
  _select(id) {
    this.target = id;
    let v = this.set.get(id);
    if (id === 'me') {
      const p = this.g.player;
      v = { speed: p.boost, hp: Math.round(p.h.hpMul * 100), tough: p.knock, wanted: this.g.police ? this.g.police.wanted : 0 };
    }
    v = v || { speed: 1, hp: 100, tough: 1, wanted: 0 };
    $('#ad-speed').value = String(clamp(v.speed, 0.25, 4)); $('#ad-hp').value = String(clamp(v.hp, 25, 1000));
    $('#ad-tough').value = String(clamp(v.tough, 0.25, 10)); $('#ad-wanted').value = String(clamp(v.wanted | 0, 0, 2));
    $('#ad-speed').dispatchEvent(new Event('input'));
  }

  _values() { return { speed: Number($('#ad-speed').value), hp: Number($('#ad-hp').value), tough: Number($('#ad-tough').value), wanted: Number($('#ad-wanted').value) }; }
  _msg(t) { $('#ad-msg').textContent = t; }

  apply() {
    const v = this._values(), r = this.mp.adminApply(this.target, v);
    if (r.error) { this._msg(r.error); return; }
    this.set.set(this.target, v);
    this._msg(`${r.who === 'you' ? 'You' : r.who}: speed ${v.speed}x, max HP ${v.hp}, toughness ${v.tough}x, wanted ${WANT[v.wanted]}.`);
  }

  kick() {
    const r = this.mp.adminKick(this.target, $('#ad-note').value);
    this._msg(r.error || `${r.who === 'you' ? 'You left' : r.who + ' was kicked from'} the server.`);
    this.render();
  }

  async ban() {
    const ms = Number($('#ad-length').value), note = $('#ad-note').value;
    const r = await this.mp.adminBan(this.target, note, ms);
    if (r.error) { this._msg(r.error); return; }
    $('#ad-note').value = '';
    this._msg(`${r.who} is banned ${ms ? 'for ' + $('#ad-length').selectedOptions[0].textContent : 'for good'}.`);
    this.render();
  }

  update(dt) {
    if (!this.isOpen) return;
    this.slow += dt;
    if (this.slow > 0.75) { this.slow = 0; this.render(); }
  }
}
