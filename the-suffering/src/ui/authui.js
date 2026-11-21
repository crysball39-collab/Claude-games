/* =============================================================================
   Signing in and signing up, and who you are on the title screen.
   ========================================================================== */
import { $, $$, el } from '../core/util.js';

export class AuthUI {
  constructor(game, ui, auth) {
    this.g = game; this.ui = ui; this.auth = auth;
    this.tab = 'in'; this.busy = false;
    this._wire();
    this.changed();
  }

  _wire() {
    for (const b of $$('#auth-tabs button')) b.addEventListener('click', (e) => { e.preventDefault(); this._tab(b.dataset.atab); });
    $('#auth-form').addEventListener('submit', (e) => { e.preventDefault(); this._submit(); });
    for (const i of $$('#auth input')) i.addEventListener('keydown', (e) => e.stopPropagation());
    $('#auth-guest').addEventListener('click', (e) => { e.preventDefault(); this.close(); this.ui.toast('Playing as a guest. Abilities and cheats are for the admin account.', 3.5); });
    $('#btn-account').addEventListener('click', (e) => {
      e.preventDefault(); this.ui.sound.unlock();
      if (this.auth.signedIn) { this.auth.signOut(); this.ui.toast('Signed out.'); } else this.open('in');
    });
  }

  get isOpen() { return !$('#auth').hidden; }

  open(tab = 'in') {
    $('#auth').hidden = false;
    this._tab(tab);
    $('#auth-err').textContent = '';
    $('#auth-pass').value = ''; $('#auth-confirm').value = '';
    $('#auth-note').textContent = this.auth.usable
      ? `Your account is kept ${this.auth.where}, with the password only as a salted hash. Nothing here sends email, so a forgotten password cannot be reset: write it down.`
      : 'This browser cannot make accounts here (it has no Web Crypto). You can still play as a guest.';
    setTimeout(() => $('#auth-email').focus(), 30);
  }
  close() { $('#auth').hidden = true; }

  _tab(t) {
    this.tab = t === 'up' ? 'up' : 'in';
    for (const b of $$('#auth-tabs button')) b.classList.toggle('on', b.dataset.atab === this.tab);
    const up = this.tab === 'up';
    $('#auth-name-row').hidden = !up; $('#auth-confirm-row').hidden = !up;
    $('#auth-pass').autocomplete = up ? 'new-password' : 'current-password';
    $('#auth-go').textContent = up ? 'SIGN UP' : 'SIGN IN';
    $('#auth-err').textContent = '';
  }

  async _submit() {
    if (this.busy) return;
    this.busy = true;
    const go = $('#auth-go'), err = $('#auth-err');
    go.disabled = true; err.textContent = '';
    const email = $('#auth-email').value, password = $('#auth-pass').value;
    let r;
    try {
      r = this.tab === 'up'
        ? await this.auth.signUp({ email, password, confirm: $('#auth-confirm').value, name: $('#auth-name').value })
        : await this.auth.signIn({ email, password });
    } catch { r = { error: 'Something went wrong. Try again.' }; }
    this.busy = false; go.disabled = false;
    if (!r || r.error) { err.textContent = (r && r.error) || 'That did not work.'; return; }
    $('#auth-pass').value = ''; $('#auth-confirm').value = '';
    this.close();
    this.ui.toast(`Signed in as ${this.auth.name}.` + (this.auth.admin ? ' Admin: the abilities, the cheats and the ADMIN menu are yours.' : ''), 4);
  }

  /** Who is signed in, on the title screen. */
  changed() {
    const who = $('#menu-who'), b = $('#btn-account');
    if (!who) return;
    who.textContent = '';
    if (this.auth.signedIn) {
      who.append('Signed in as ', el('b', '', this.auth.name), ' (' + this.auth.hint + ')');
      if (this.auth.admin) who.append(el('span', 'badge', 'ADMIN'));
      b.textContent = 'SIGN OUT';
    } else {
      who.textContent = 'Playing as a guest';
      b.textContent = 'SIGN IN';
    }
  }
}
