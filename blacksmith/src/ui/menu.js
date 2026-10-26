/* =============================================================================
   The main menu: CONTINUE when there is a smith saved, NEW GAME (which asks
   first, if there is one to lose), CONTROLS and SETTINGS - and, in the
   corner, who is playing, which opens the account screen.
   ========================================================================== */
import { $, $$, money } from '../core/util.js';
import { levelFromExp } from '../game/data.js';
import { cloud } from '../game/cloud.js';

export class Menu {
  constructor(settings, { onContinue, onNewGame }) {
    this.screen = $('#menu-screen');
    this.settings = settings;
    this.cb = { onContinue, onNewGame };
    this.save = null;

    $('#btn-continue').addEventListener('click', () => this.cb.onContinue?.());
    $('#btn-newgame').addEventListener('click', () => {
      if (this.save) $('#confirm-new').classList.remove('hidden');
      else this.cb.onNewGame?.();
    });
    $('#btn-confirm-new').addEventListener('click', () => { $('#confirm-new').classList.add('hidden'); this.cb.onNewGame?.(); });
    $('#btn-cancel-new').addEventListener('click', () => $('#confirm-new').classList.add('hidden'));
    $('#btn-controls').addEventListener('click', () => this.showPanel('panel-controls'));
    $('#btn-settings').addEventListener('click', () => this.showPanel('panel-settings'));
    for (const b of $$('.backbtn')) b.addEventListener('click', () => this.showPanel(b.dataset.back));
    this._wireSettings();
  }

  _wireSettings() {
    const s = this.settings;
    const q = $('#set-quality'), sh = $('#set-shadows'), so = $('#set-sound'), sens = $('#set-sens'), inv = $('#set-inverty');
    q.value = s.quality; sh.checked = s.shadows; so.checked = s.sound;
    sens.value = String(Math.round(s.sensitivity * 100)); inv.checked = s.invertY;
    q.addEventListener('change', () => { s.quality = q.value; s.save(); });
    sh.addEventListener('change', () => { s.shadows = sh.checked; s.save(); });
    so.addEventListener('change', () => { s.sound = so.checked; s.save(); s.emit('sound'); });
    sens.addEventListener('input', () => { s.sensitivity = Number(sens.value) / 100; s.save(); s.emit('sensitivity'); });
    inv.addEventListener('change', () => { s.invertY = inv.checked; s.save(); s.emit('invertY'); });
  }

  showPanel(id) {
    for (const p of $$('.menu-panel')) p.classList.toggle('hidden', p.id !== id);
    $('#btn-account').classList.toggle('hidden', id !== 'panel-main');
  }

  /** `save` is what is in storage for whoever is playing, or null; `note` a word for under the buttons. */
  show(save, note = null) {
    this.paint(save, note);
    this.screen.classList.add('active');
    this.showPanel('panel-main');
  }

  /** The buttons and the line about your smith, staying on whichever panel is open. */
  paint(save, note = null) {
    this.save = save;
    const who = cloud.account?.name;
    $('#confirm-new-text').textContent = who
      ? `${who}'s smith - ores, gear, cash and level - will be erased from your account.`
      : 'Your saved smith - ores, gear, cash and level - will be erased.';
    $('#menu-foot').textContent = who ? `landscape · ${who} is saved to the cloud` : 'landscape · your progress saves itself';
    $('#btn-continue').classList.toggle('hidden', !save);
    $('#btn-newgame').textContent = save ? 'NEW GAME' : 'PLAY';
    $('#btn-newgame').classList.toggle('primary', !save);
    if (save) {
      const lv = levelFromExp(save.exp || 0).level;
      const items = (save.items || []).length;
      const ores = Object.values(save.ores || {}).reduce((a, b) => a + b, 0);
      $('#menu-save').textContent = `${who || 'Saved smith'}: level ${lv} · ${money(save.cash || 0)} · ${items} item${items === 1 ? '' : 's'} · ${ores} ore`;
    } else {
      $('#menu-save').textContent = who ? `${who}: a new smith, ready to start` : '';
    }
    if (note) $('#menu-save').textContent = note;
  }

  hide() {
    this.screen.classList.remove('active');
    $('#confirm-new').classList.add('hidden');
  }
}
