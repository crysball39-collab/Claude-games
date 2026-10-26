/* =============================================================================
   Accounts and cloud saves.

   Played on its Claude page, the game has a small database of its own, and in
   it a private corner for each person who opens the page: nobody else can
   read it, not even the page's owner. Accounts live there. Each is a smith's
   name, a salted hash of its password (never the password itself) and the
   smith's save. Sign up once, then log in on any device where the page is
   opened by the same Claude account, and the smith comes with you.

   Opened any other way - the downloaded file, say - there is no database:
   the game says so and keeps its saves on the device, as it always has.

   Saves go up one at a time, no more than one every few seconds, and the
   last one is pushed out on pausing, quitting and logging out. A save made
   while the cloud could not be reached waits on the device and goes up the
   next time it can.
   ========================================================================== */
import { readSave, writeSave, useAccount, forgetAccountCopy } from './save.js';
import { levelFromExp } from './data.js';

const ITERATIONS = 150000;
const MIN_GAP = 6000;                  // ms between writes to the cloud
const RETRY_GAP = 30000;               // ms before a write that failed is tried again by itself
const REMEMBER = 'blacksmith.account';
const NAME_RE = /^[A-Za-z0-9_-]{3,16}$/;

export const NAME_RULE = '3 to 16 letters, numbers, - or _';
export const PASSWORD_MIN = 4;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** PBKDF2-SHA256 of the password, as base64. */
async function derive(password, salt, iterations) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations }, key, 256);
  return b64(new Uint8Array(bits));
}

function remembered() { try { return localStorage.getItem(REMEMBER); } catch { return null; } }
function remember(name) { try { if (name) localStorage.setItem(REMEMBER, name); else localStorage.removeItem(REMEMBER); } catch { /* fine */ } }

/** Why a name will not do, or null. */
export function nameProblem(name) {
  if (!name) return 'Choose a name for your smith.';
  if (!NAME_RE.test(name)) return `A smith's name is ${NAME_RULE}.`;
  return null;
}

export class Cloud {
  constructor() {
    // connecting | ready | readonly (may read, not write) | signed-out (a Claude page, but no database
    // or name for you) | offline (not a Claude page at all: no database here)
    this.state = 'connecting';
    this.db = null;
    this.uid = null;
    this.account = null;               // { name, salt, hash, iter, created } once logged in
    this.pending = null;               // the newest save not yet sent
    this.syncing = false;
    this.lastWrite = 0;
    this.lastSynced = 0;
    this.error = null;
    this._timer = 0;
    this._listeners = new Set();
  }

  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit() { for (const fn of this._listeners) fn(this); }

  /** Whether accounts work here at all. */
  get ready() { return this.state === 'ready' || this.state === 'readonly'; }

  async connect() {
    const claude = typeof window !== 'undefined' ? window.claude : null;
    if (!claude?.use) { this.state = 'offline'; this._emit(); return this; }
    try {
      const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
      const uid = user ? await user.id() : null;
      // on a Claude page, but without its database or a name for you: most likely signed out of Claude
      if (!db || !uid) this.state = 'signed-out';
      else { this.db = db; this.uid = uid; this.state = 'ready'; }
    } catch {
      this.state = 'offline';
    }
    this._emit();
    return this;
  }

  _doc(name) { return this.db.doc(`data/users/${this.uid}/smith-${name.toLowerCase()}`); }

  /** A database call, tried once more after a short wait if the platform says it is busy. */
  async _call(fn) {
    try {
      return await fn();
    } catch (e) {
      if (e?.code !== 'unavailable') throw e;
      await wait(400 + Math.random() * 600);
      return fn();
    }
  }

  _problem(e) {
    const code = e?.code;
    if (code === 'invalid_argument') {
      this.state = 'readonly';
      this._emit();
      return 'This page will not let you save to the cloud. The page\'s owner can invite you as an Editor.';
    }
    if (code === 'quota_exceeded') return 'The cloud is full. Try again later.';
    if (code === 'resource_exhausted') return 'Too many tries at once. Wait a moment and try again.';
    return 'The cloud could not be reached. Check your connection and try again.';
  }

  /** The smiths this Claude account has made, newest save first. */
  async list() {
    if (!this.ready) return [];
    try {
      const snap = await this._call(() => this.db.collection(`data/users/${this.uid}`).get());
      return snap.docs.filter((d) => d.exists && d.id.startsWith('smith-')).map((d) => {
        const v = d.data();
        return { name: v.name, level: v.level || 1, savedAt: v.savedAt || 0 };
      }).sort((a, b) => b.savedAt - a.savedAt);
    } catch {
      return [];
    }
  }

  /** A new account, starting from `save` (or from nothing). */
  async signUp(name, password, save = null) {
    if (this.state !== 'ready') return { error: this.state === 'readonly' ? this._problem({ code: 'invalid_argument' }) : 'Accounts need the game\'s Claude page.' };
    const bad = nameProblem(name);
    if (bad) return { error: bad };
    if ((password || '').length < PASSWORD_MIN) return { error: `A password needs at least ${PASSWORD_MIN} characters.` };
    try {
      const ref = this._doc(name);
      const had = await this._call(() => ref.get());
      if (had.exists) return { error: `You already have a smith called ${had.data().name}. Log in instead, or pick another name.` };
      const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
      const hash = await derive(password, salt, ITERATIONS);
      const created = Date.now();
      const account = { name, salt, hash, iter: ITERATIONS, created };
      await this._call(() => ref.set(this._body(account, save)));
      this.lastSynced = Date.now();
      this._enter(account, save);
      return { ok: true, save };
    } catch (e) {
      return { error: this._problem(e) };
    }
  }

  /** Into an account: its save, or this device's copy of it if that is newer. */
  async logIn(name, password) {
    if (!this.ready) return { error: 'Accounts need the game\'s Claude page.' };
    if (!name) return { error: 'Type the name of your smith.' };
    if (!password) return { error: 'Type your password.' };
    try {
      const snap = await this._call(() => this._doc(name).get());
      if (!snap.exists) return { error: `There is no smith called ${name} on this Claude account. Check the spelling, or sign up.` };
      const d = snap.data();
      if (await derive(password, d.salt, d.iter || ITERATIONS) !== d.hash) return { error: 'That password is not right.' };
      const { save, newer } = this._pick(d);
      this._enter(this._account(d), save, newer);
      return { ok: true, save };
    } catch (e) {
      return { error: this._problem(e) };
    }
  }

  /**
   * On a later visit, back into the account this device was last in - no password, as with any game.
   * `wanted()` says whether that is still wanted when the cloud answers: not once a smith is being played.
   */
  async restore(wanted = () => true) {
    const name = remembered();
    if (!name || !this.ready) return false;
    try {
      const snap = await this._call(() => this._doc(name).get());
      // too late: a smith is already being played, or someone has logged in meanwhile
      if (!wanted() || this.account) return false;
      if (!snap.exists) { remember(null); return false; }
      const d = snap.data();
      const { save, newer } = this._pick(d);
      this._enter(this._account(d), save, newer);
      return true;
    } catch {
      return false;
    }
  }

  _account(d) { return { name: d.name, salt: d.salt, hash: d.hash, iter: d.iter || ITERATIONS, created: d.created || Date.now() }; }

  /** Whichever is newer: the cloud's save, or this device's copy of it (from playing while the cloud was out of reach). */
  _pick(d) {
    useAccount(d.name);
    const here = readSave();
    if (here && (here.savedAt || 0) > (d.savedAt || 0)) return { save: here, newer: true };
    return { save: d.save || null, newer: false };
  }

  /** `upload`: the save is newer than the cloud's copy, so it goes up. */
  _enter(account, save, upload = false) {
    this.account = account;
    this.pending = null;
    this.error = null;
    useAccount(account.name);
    remember(account.name);
    if (save) writeSave(save, { notify: false });
    this._emit();
    if (save && upload) this.queue(save);
  }

  /** Out of the account, back to this device's own smith; the account's last save goes up first. */
  async logOut() {
    const name = this.account?.name;
    await this.flush();
    const safe = !this.pending && !this.error;
    this.account = null;
    this.pending = null;
    useAccount(null);
    remember(null);
    // the copy on this device only stays if the cloud did not get the last of it
    if (name && safe) forgetAccountCopy(name);
    this._emit();
    return safe;
  }

  _body(account, save) {
    return {
      name: account.name, salt: account.salt, hash: account.hash, iter: account.iter, created: account.created,
      // a plain-JSON copy, as it is now: the game goes on changing the one it saved
      savedAt: save?.savedAt || 0, save: save ? JSON.parse(JSON.stringify(save)) : null,
      level: save ? levelFromExp(save.exp || 0).level : 1,
    };
  }

  /** A save to send up, when there is an account to send it to. */
  queue(save) {
    if (!this.account || this.state !== 'ready') return;
    this.pending = save;
    this._pump();
  }

  async _pump(now = false) {
    if (this.syncing || !this.pending || !this.account || this.state !== 'ready') return;
    const gap = now ? 0 : this.lastWrite + MIN_GAP - Date.now();
    if (gap > 0) {
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this._pump(), gap);
      return;
    }
    const save = this.pending;
    const account = this.account;
    this.pending = null;
    this.syncing = true;
    this._emit();
    try {
      await this._call(() => this._doc(account.name).set(this._body(account, save)));
      this.lastSynced = Date.now();
      this.error = null;
    } catch (e) {
      this.error = e?.code || 'unavailable';
      if (e?.code === 'invalid_argument') this._problem(e);
      else if (!this.pending) this.pending = save;      // it goes again on the next save
    } finally {
      this.lastWrite = Date.now();
      this.syncing = false;
      this._emit();
      // a newer save goes up after the usual gap; one that failed is tried again less
      // often, and into a full cloud only when the next save comes along
      if (this.pending && this.state === 'ready' && this.error !== 'quota_exceeded') {
        clearTimeout(this._timer);
        this._timer = setTimeout(() => this._pump(), this.error ? RETRY_GAP : MIN_GAP);
      }
    }
  }

  /** Everything still waiting goes up now: pausing, quitting, logging out. */
  async flush() {
    clearTimeout(this._timer);
    for (let i = 0; i < 100 && this.syncing; i++) await wait(50);
    if (this.pending) await this._pump(true);
  }

  /** A line for the menus: where your progress is kept. */
  describe() {
    if (this.account) {
      if (this.state === 'readonly') return 'Cloud saving is off for you on this page';
      if (this.syncing || this.pending) return `Saving ${this.account.name} to the cloud...`;
      if (this.error) return 'Saved on this device; the cloud will get it next time';
      return `${this.account.name} is saved to the cloud`;
    }
    return 'Saved on this device';
  }
}

export const cloud = new Cloud();
