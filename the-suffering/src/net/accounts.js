/* =============================================================================
   Accounts: sign up, and sign in, with an email address and a password.

   Neither is kept as typed. An account is filed under a SHA-256 hash of its
   address, written the way Gmail reads it (capitals, dots and anything after
   a plus make no difference to a gmail.com address), and its password only
   as a salted PBKDF2 hash, made by the browser's own Web Crypto.

   Where accounts are kept: inside claude.ai, in the viewer's own private
   part of this game's shared store (data/users/<id>/), which nobody else can
   read, the page's owner included; anywhere else, or for a viewer who may
   not write there, in this browser.

   One account is the admin's: the one whose address hashes to ADMIN_KEY.
   On claude.ai it is the admin only for the page's owner, and nobody else
   may make an account with that address there. In a copy of the game opened
   on its own there is nobody to check with: the admin account is whoever
   makes it on that device, for that device's game.
   ========================================================================== */
import { IN_CLAUDE, use } from './platform.js';
import { store } from '../core/util.js';

/** The admin's address, hashed as accountKey() hashes any address. */
const ADMIN_KEY = 'a37dcfbedd22dc89b9402dc219d085c37271e2d273d9813fbf0ee1307bd673f9';
/** Test pages can name another admin address (as a hash) before the page loads; nothing else can. */
const EXTRA = typeof window !== 'undefined' && Array.isArray(window.__TS_ADMIN_KEYS) ? window.__TS_ADMIN_KEYS.filter((k) => /^[0-9a-f]{64}$/.test(k)) : [];
const ADMIN_KEYS = Object.freeze([ADMIN_KEY, ...EXTRA]);
const ITERATIONS = 150000;
const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

/** An address the way its owner's mail server reads it, or null if it is not one. */
export function normalEmail(raw) {
  const e = String(raw || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1 || at === e.length - 1 || e.length > 254) return null;
  let local = e.slice(0, at), domain = e.slice(at + 1);
  if (/[\s@<>()[\],;:"]/.test(local) || !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(domain)) return null;
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.split('+')[0].replace(/\./g, '');
  return local ? local + '@' + domain : null;
}

/** The first letter and the domain, for showing which account this is without showing the address. */
function hintFor(email) {
  const at = email.lastIndexOf('@');
  return email[0] + '•••' + email.slice(at);
}

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Web Crypto, where the browser offers it (it does everywhere the game runs from https, localhost or a file). */
function subtle() { return typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null; }

export async function accountKey(email) {
  const n = normalEmail(email);
  if (!n) return null;
  return hex(await subtle().digest('SHA-256', enc.encode('the-suffering:' + n)));
}
async function passwordHash(password, salt, iterations = ITERATIONS) {
  const S = subtle();
  const key = await S.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return b64(await S.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}
/** Compares two strings in time that does not depend on where they first differ. */
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Accounts kept in this browser. */
class LocalStore {
  constructor() { this.where = 'browser'; }
  _all() { const a = store.get('accounts', {}); return a && typeof a === 'object' ? a : {}; }
  async get(key) { return this._all()[key] || null; }
  async put(rec) { const a = this._all(); a[rec.key] = rec; store.set('accounts', a); }
}

/** Accounts kept in the viewer's own private part of the shared store on claude.ai. */
class CloudStore {
  constructor(db, uid) { this.where = 'claude'; this.ref = db.doc('data/users/' + uid + '/accounts'); }
  async _all() { const s = await this.ref.get(); return s.exists ? { ...s.data() } : {}; }
  async get(key) { const a = await this._all(); return a[key] || null; }
  async put(rec) { const a = await this._all(); a[rec.key] = rec; await this.ref.set(a); }
}

export class Accounts {
  constructor() {
    this.account = null;           // the signed-in account's record, or null: a guest
    this.owner = false;            // this viewer owns the claude.ai page
    this.uid = null;               // their id on it
    this.local = new LocalStore();
    this.cloud = null;
    this.onChange = null;
    this.ready = this._init();
  }

  async _init() {
    const [user, db] = await Promise.all([use('user'), use('db')]);
    if (user) {
      try { this.owner = !!(await user.isOwner()); this.uid = await user.id(); } catch { /* reads never reject; nothing to do if one does */ }
    }
    if (db && this.uid) this.cloud = new CloudStore(db, this.uid);
    // signed in on this device before: still signed in
    const s = store.get('session', null);
    if (s && typeof s.key === 'string') {
      const rec = await this._find(s.key);
      if (rec) this._enter(rec, false);
    }
    this.onChange?.();
  }

  get signedIn() { return !!this.account; }
  get name() { return this.account ? this.account.name : ''; }
  get hint() { return this.account ? this.account.hint : ''; }
  get seed() { return this.account ? this.account.seed : 0; }
  /** The admin: signed in to the admin's account, and (on claude.ai) the page's owner. */
  get admin() { return !!this.account && ADMIN_KEYS.includes(this.account.key) && (!IN_CLAUDE || this.owner); }
  /** Where a new account would be kept, in a few words for the sign-up form. */
  get where() { return this.cloud ? 'with your Claude account, for this game' : 'in this browser'; }
  get usable() { return !!subtle() && !!enc; }

  async _find(key) {
    if (this.cloud) { try { const r = await this.cloud.get(key); if (r) return r; } catch { /* fall through to this browser's */ } }
    return this.local.get(key);
  }

  _enter(rec, remember = true) {
    this.account = rec;
    if (remember) store.set('session', { key: rec.key });
    this.onChange?.();
  }

  /** A new account. Resolves { ok } or { error: 'what is wrong, in words' }. */
  async signUp({ email, password, confirm, name }) {
    if (!this.usable) return { error: 'This browser cannot make accounts here (it has no Web Crypto).' };
    const n = normalEmail(email);
    if (!n) return { error: 'That is not an email address.' };
    if (String(password || '').length < 6) return { error: 'The password needs at least 6 characters.' };
    if (confirm !== undefined && confirm !== password) return { error: 'The two passwords are not the same.' };
    name = String(name || '').replace(/[^\w .'-]/g, '').trim().slice(0, 16);
    if (name.length < 2) return { error: 'Choose a name of at least 2 letters: it is what other players see.' };
    const key = await accountKey(n);
    if (ADMIN_KEYS.includes(key) && IN_CLAUDE && !this.owner) return { error: 'That address is reserved on this page.' };
    if (await this._find(key)) return { error: 'There is already an account with that address here. Sign in instead.' };
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const rec = { v: 1, key, name, hint: hintFor(n), salt: b64(salt), hash: await passwordHash(password, salt), iter: ITERATIONS, seed: (crypto.getRandomValues(new Uint32Array(1))[0] % 2147483646) + 1, created: Date.now() };
    let where = 'browser';
    if (this.cloud) { try { await this.cloud.put(rec); where = 'claude'; } catch { /* a viewer who may not write: keep it here instead */ } }
    if (where === 'browser') await this.local.put(rec);
    this._enter(rec);
    return { ok: true, where };
  }

  /** Resolves { ok } or { error }. */
  async signIn({ email, password }) {
    if (!this.usable) return { error: 'This browser cannot check passwords here (it has no Web Crypto).' };
    const n = normalEmail(email);
    if (!n) return { error: 'That is not an email address.' };
    const key = await accountKey(n);
    const rec = await this._find(key);
    if (!rec) return { error: 'There is no account with that address here. Sign up first.' };
    const h = await passwordHash(String(password || ''), unb64(rec.salt), rec.iter || ITERATIONS);
    if (!same(h, rec.hash)) return { error: 'That is not the password.' };
    this._enter(rec);
    return { ok: true };
  }

  signOut() {
    this.account = null;
    store.set('session', null);
    this.onChange?.();
  }
}
