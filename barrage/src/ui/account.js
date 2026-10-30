/* =============================================================================
   LOG IN and SIGN UP, off the title screen, and who is playing.

   On the game's Claude page these talk to the cloud: sign up with a
   fighter's name and a password, and your coins and gear are saved to your
   account from then on; log in on another device and they are there.
   Opened anywhere accounts cannot work - the downloaded file, or signed out
   of Claude - the panel says so, and where they do work instead.
   ========================================================================== */
import { $, $$ } from '../core/util.js';
import { cloud, nameProblem, PASSWORD_MIN } from '../data/cloud.js';
import { readGuestSave, clearGuestSave } from '../data/save.js';

/** The game's Claude page, for the note shown in the downloaded file. */
export const GAME_PAGE = 'https://claude.ai/artifact/6t2dxDPchKYNnJbMzAdkXQ';

export class AccountUI {
  /** showPanel(id); onChanged(note): whose save is current has changed */
  constructor({ showPanel, onChanged, sound }) {
    this.cb = { showPanel, onChanged };
    this.sound = sound;
    this.form = $('#panel-account');
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

    $('#btn-login').addEventListener('click', () => this.open('login'));
    $('#btn-signup').addEventListener('click', () => this.open('signup'));
    $('#btn-logout').addEventListener('click', () => this.logOut());
    for (const t of $$('.tab', this.form)) t.addEventListener('click', () => { this.setMode(t.dataset.mode); this.say(''); });
    this.form.addEventListener('submit', (e) => { e.preventDefault(); this.submit(); });
    // the on-screen keyboard can cover the field you are typing in
    for (const el of [this.nameIn, this.passIn, this.pass2In]) {
      el.addEventListener('focus', () => setTimeout(() => el.scrollIntoView({ block: 'nearest' }), 250));
    }
    cloud.onChange(() => this.paint());
    this.paint();
  }

  /** The title screen's account line and buttons. */
  paint() {
    const c = cloud;
    const who = $('#who');
    who.classList.toggle('in', !!c.account);
    $('#who-text').textContent = c.account ? `Logged in as ${c.account.name}` : c.state === 'connecting' ? 'Connecting...' : 'Playing as a guest';
    $('#row-auth').classList.toggle('hidden', !!c.account);
    $('#row-out').classList.toggle('hidden', !c.account);
    for (const id of ['#save-line', '#pause-save']) { const el = $(id); if (el) el.textContent = c.describe(); }
  }

  open(mode) {
    this.sound?.click();
    if (!cloud.ready) {
      const why = cloud.state === 'signed-out'
        ? 'Accounts work on the game\'s Claude page when you are signed in to Claude. Sign in, then open the page again to sign up or log in.'
        : cloud.state === 'connecting'
          ? 'Still connecting to the cloud. Try again in a moment.'
          : 'Accounts and cloud saves work on the game\'s Claude page. You opened Barrage some other way, so your coins and gear are saved on this device only.';
      $('#offline-why').textContent = why;
      $('#offline-link-row').classList.toggle('hidden', !GAME_PAGE || cloud.state === 'connecting');
      $('#offline-link').href = GAME_PAGE || '#';
      $('#offline-link').textContent = GAME_PAGE.replace(/^https:\/\//, '');
      this.cb.showPanel('panel-offline');
      return;
    }
    this.setMode(mode);
    this.say('');
    this.cb.showPanel('panel-account');
    this.paintMine();
    setTimeout(() => this.nameIn.focus(), 60);
  }

  setMode(mode) {
    this.mode = mode;
    this.form.dataset.mode = mode;
    for (const t of $$('.tab', this.form)) t.classList.toggle('on', t.dataset.mode === mode);
    this.submitBtn.textContent = mode === 'signup' ? 'SIGN UP' : 'LOG IN';
    this.passIn.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    // signing up can bring along what is saved on this device
    const guest = mode === 'signup' ? readGuestSave() : null;
    const worth = guest && ((guest.coins || 0) > 0 || (guest.bag || []).some(Boolean) || Object.values(guest.eq || {}).some(Boolean));
    this.bringRow.classList.toggle('hidden', !worth);
    if (worth) $('#acct-bring-text').textContent = `Bring the ${guest.coins} coins and gear saved on this device`;
    this.mine.classList.toggle('hidden', mode !== 'login' || !this.mineList?.length);
  }

  /** Your fighters, to tap rather than type, when logging in. */
  async paintMine() {
    const list = await cloud.list();
    this.mineList = list;
    this.mine.innerHTML = '';
    this.mine.classList.toggle('hidden', !list.length || this.mode !== 'login');
    for (const s of list.slice(0, 6)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = s.best ? `${s.name} · wave ${s.best}` : s.name;
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
      // what was on this device lives in the account now
      if (res.ok && guest) clearGuestSave();
    } else {
      res = await cloud.logIn(name, pass);
    }
    this.busy = false;
    this.submitBtn.disabled = false;
    if (!res.ok) { this.sound?.deny(); this.say(res.error); return; }
    this.sound?.coin();
    this.passIn.value = '';
    this.pass2In.value = '';
    this.say(this.mode === 'signup' ? `${cloud.account.name} is ready.` : `Welcome back, ${cloud.account.name}.`, true);
    this.cb.onChanged?.();
    setTimeout(() => this.cb.showPanel('panel-main'), 650);
  }

  async logOut() {
    const btn = $('#btn-logout');
    btn.disabled = true;
    $('#save-line').textContent = 'Saving to the cloud...';
    const safe = await cloud.logOut();
    btn.disabled = false;
    this.cb.onChanged?.(safe ? null : 'The cloud could not be reached, so the last of your progress is kept on this device. It goes up when you next log in.');
    this.paint();
  }
}
