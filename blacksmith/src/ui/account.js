/* =============================================================================
   The account screen, off the main menu: LOG IN or SIGN UP, or - once you are
   in - who you are, whether the cloud has your smith, and LOG OUT. Opened
   anywhere accounts cannot work (the downloaded file, or signed out of
   Claude), it says where they do instead.

   The button in the corner of the menu says who is playing: LOG IN for a
   smith kept only on this device, or your smith's name.
   ========================================================================== */
import { $, $$ } from '../core/util.js';
import { cloud, nameProblem, PASSWORD_MIN } from '../game/cloud.js';
import { readGuestSave, clearGuestSave } from '../game/save.js';
import { levelFromExp } from '../game/data.js';

/** Where the game's Claude page is, for the note in the downloaded file. */
export const GAME_PAGE = 'https://claude.ai/artifact/X9Shbngw1r2P6scuXDSaYP';

export class AccountUI {
  /** showPanel(id): the menu's; onChanged(): whose save the menu shows has changed */
  constructor({ showPanel, onChanged }) {
    this.cb = { showPanel, onChanged };
    this.chip = $('#btn-account');
    this.label = $('#ma-label');
    this.form = $('#acct-form');
    this.views = { in: $('#acct-in'), off: $('#acct-off'), form: this.form };
    this.msg = $('#acct-msg');
    this.submitBtn = $('#acct-submit');
    this.nameIn = $('#acct-name');
    this.passIn = $('#acct-pass');
    this.pass2In = $('#acct-pass2');
    this.bringRow = $('#acct-bring-row');
    this.bring = $('#acct-bring');
    this.mine = $('#acct-mine');
    this.mode = 'login';
    this.busy = false;

    this.chip.addEventListener('click', () => this.open());
    for (const t of $$('.acct-tab')) t.addEventListener('click', () => { this.setMode(t.dataset.mode); this.say(''); });
    this.form.addEventListener('submit', (e) => { e.preventDefault(); this.submit(); });
    $('#btn-logout').addEventListener('click', () => this.logOut());
    // the on-screen keyboard can cover the field you are typing in
    for (const el of [this.nameIn, this.passIn, this.pass2In]) {
      el.addEventListener('focus', () => setTimeout(() => el.scrollIntoView({ block: 'nearest' }), 250));
    }
    cloud.onChange(() => this.paint());
    this.paint();
  }

  /** The button in the menu's corner, and the logged-in view's status line. */
  paint() {
    const c = cloud;
    let label, cls = '';
    if (c.account) { label = c.account.name; cls = 'in'; }
    else if (c.state === 'connecting') label = '...';
    else if (c.ready) label = 'LOG IN';
    else { label = 'SAVED HERE'; cls = 'off'; }
    this.label.textContent = label;
    this.chip.className = 'menu-account' + (cls ? ' ' + cls : '');
    $('#acct-who-name').textContent = c.account?.name || '';
    $('#acct-status').textContent = c.describe();
  }

  open() {
    const c = cloud;
    const view = c.account ? 'in' : c.ready ? 'form' : 'off';
    for (const [k, el] of Object.entries(this.views)) el.classList.toggle('hidden', k !== view);
    $('#acct-tabs').classList.toggle('hidden', view !== 'form');
    this.say('');
    if (view === 'off') this._paintOff();
    if (view === 'form') {
      this.setMode(this.mode);
      this._paintMine();
    }
    this.paint();
    this.cb.showPanel('panel-account');
  }

  _paintOff() {
    const why = cloud.state === 'signed-out'
      ? 'Accounts work on the game\'s Claude page when you are signed in to Claude. Sign in, then open the page again to sign up or log in.'
      : cloud.state === 'connecting'
        ? 'Still connecting to the cloud. Try again in a moment.'
        : 'You opened the game as a file, so your smith is saved on this device only. On the game\'s Claude page you can sign up, log in, and keep your smith in the cloud.';
    $('#acct-off-why').textContent = why;
    const row = $('#acct-link-row');
    row.classList.toggle('hidden', cloud.state === 'connecting' || !GAME_PAGE);
    $('#acct-link').href = GAME_PAGE;
    $('#acct-link').textContent = GAME_PAGE.replace(/^https:\/\//, '');
  }

  setMode(mode) {
    this.mode = mode;
    this.form.dataset.mode = mode;
    for (const t of $$('.acct-tab')) t.classList.toggle('on', t.dataset.mode === mode);
    this.submitBtn.textContent = mode === 'signup' ? 'SIGN UP' : 'LOG IN';
    this.passIn.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    // signing up can bring along the smith that is saved on this device
    const guest = mode === 'signup' ? readGuestSave() : null;
    this.bringRow.classList.toggle('hidden', !guest);
    if (guest) {
      const lv = levelFromExp(guest.exp || 0).level;
      $('#acct-bring-text').textContent = `Bring my level ${lv} smith from this device`;
    }
  }

  /** Your smiths, to tap rather than type, when logging in. */
  async _paintMine() {
    const list = await cloud.list();
    this.mine.innerHTML = '';
    this.mine.classList.toggle('hidden', !list.length || this.mode !== 'login');
    for (const s of list.slice(0, 6)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `${s.name} · Lv ${s.level}`;
      b.addEventListener('click', () => { this.nameIn.value = s.name; this.passIn.focus(); });
      this.mine.appendChild(b);
    }
  }

  say(text, ok = false) {
    this.msg.textContent = text;
    this.msg.classList.toggle('ok', ok);
  }

  async submit() {
    if (this.busy) return;
    const name = this.nameIn.value.trim();
    const pass = this.passIn.value;
    if (this.mode === 'signup') {
      const bad = nameProblem(name);
      if (bad) { this.say(bad); this.nameIn.focus(); return; }
      if (pass.length < PASSWORD_MIN) { this.say(`A password needs at least ${PASSWORD_MIN} characters.`); this.passIn.focus(); return; }
      if (pass !== this.pass2In.value) { this.say('The two passwords are not the same.'); this.pass2In.focus(); return; }
    }
    this.busy = true;
    this.submitBtn.disabled = true;
    this.say(this.mode === 'signup' ? 'Making your account...' : 'Logging in...', true);
    let res;
    if (this.mode === 'signup') {
      const bring = !this.bringRow.classList.contains('hidden') && this.bring.checked;
      const guest = bring ? readGuestSave() : null;
      res = await cloud.signUp(name, pass, guest);
      // the smith from this device lives in the account now
      if (res.ok && guest) clearGuestSave();
    } else {
      res = await cloud.logIn(name, pass);
    }
    this.busy = false;
    this.submitBtn.disabled = false;
    if (!res.ok) { this.say(res.error); return; }
    this.passIn.value = '';
    this.pass2In.value = '';
    this.say(this.mode === 'signup' ? `${cloud.account.name} is ready.` : `Welcome back, ${cloud.account.name}.`, true);
    this.cb.onChanged?.();
    setTimeout(() => this.cb.showPanel('panel-main'), 650);
  }

  async logOut() {
    const btn = $('#btn-logout');
    btn.disabled = true;
    $('#acct-status').textContent = 'Saving to the cloud...';
    const safe = await cloud.logOut();
    btn.disabled = false;
    this.cb.onChanged?.();
    this.cb.showPanel('panel-main');
    if (!safe) this.cb.onChanged?.('The cloud could not be reached, so the last of your progress is kept on this device. It goes up when you next log in.');
  }
}
