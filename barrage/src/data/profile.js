/* =============================================================================
   Everything that is yours and lasts: coins, the 60-slot bag, the eight
   equipment slots, how far you have got, and how many you have put down.

   A place an item can be is written as a string: 'b0' to 'b59' for the bag,
   'e:weapon', 'e:offhand', 'e:helmet' and so on for the equipment slots.
   Each slot takes its own kind of thing - swords in the weapon slot, the
   shield in the offhand, each piece of armour in its own slot - and either
   accessory slot takes a bracelet or a charm.
   ========================================================================== */
import { ITEMS, SLOT, SLOTS } from '../game/gear.js';

export const BAG = 60;

export function blankSave() {
  const eq = {};
  for (const s of SLOTS) eq[s.id] = null;
  return { v: 1, coins: 0, bag: new Array(BAG).fill(null), eq, wave: 1, best: 0, kills: 0, earned: 0, runs: 0, seq: 1, savedAt: 0 };
}

/** A save from anywhere - an old version, a corrupt one, another device - made safe to play. */
export function normalize(data) {
  const s = blankSave();
  if (!data || typeof data !== 'object') return s;
  const num = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
  s.coins = num(data.coins);
  s.wave = Math.max(1, num(data.wave, 1));
  s.best = num(data.best);
  s.kills = num(data.kills);
  s.earned = num(data.earned);
  s.runs = num(data.runs);
  s.savedAt = num(data.savedAt);
  let seq = Math.max(1, num(data.seq, 1));
  const item = (it) => (it && ITEMS[it.kind] ? { uid: num(it.uid) || seq++, kind: it.kind } : null);
  if (Array.isArray(data.bag)) for (let i = 0; i < BAG; i++) s.bag[i] = item(data.bag[i]);
  if (data.eq && typeof data.eq === 'object') {
    for (const sl of SLOTS) {
      const it = item(data.eq[sl.id]);
      if (it && sl.accepts === ITEMS[it.kind].slot) s.eq[sl.id] = it;
      else if (it) { const i = s.bag.indexOf(null); if (i >= 0) s.bag[i] = it; }
    }
  }
  s.seq = seq;
  return s;
}

export class Profile {
  constructor(data) {
    this.d = normalize(data);
    this.onChange = null;            // (why) after anything that should be saved
  }

  get coins() { return this.d.coins; }

  changed(why) {
    this.d.savedAt = Date.now();
    if (this.onChange) this.onChange(why);
  }

  /* ---------------------------------- coins --------------------------------- */

  addCoins(n) {
    if (n <= 0) return;
    this.d.coins += n;
    this.d.earned += n;
    this.changed('coins');
  }

  /* --------------------------------- places --------------------------------- */

  get(loc) {
    if (loc[0] === 'b') return this.d.bag[+loc.slice(1)] || null;
    return this.d.eq[loc.slice(2)] || null;
  }

  set(loc, item) {
    if (loc[0] === 'b') this.d.bag[+loc.slice(1)] = item;
    else this.d.eq[loc.slice(2)] = item;
  }

  /** Can this item go here? The bag takes anything; a slot only what fits it. */
  fits(item, loc) {
    if (!item || loc[0] === 'b') return true;
    const slot = SLOT[loc.slice(2)];
    return !!slot && slot.accepts === ITEMS[item.kind].slot;
  }

  freeBag() { return this.d.bag.indexOf(null); }
  countBag() { return this.d.bag.filter(Boolean).length; }

  /** Where everything is, bag first then the slots: [{ loc, item }]. */
  all() {
    const out = [];
    this.d.bag.forEach((it, i) => { if (it) out.push({ loc: 'b' + i, item: it }); });
    for (const s of SLOTS) if (this.d.eq[s.id]) out.push({ loc: 'e:' + s.id, item: this.d.eq[s.id] });
    return out;
  }

  owns(kind) { return this.all().some((x) => x.item.kind === kind); }

  /* ------------------------------ buying, selling --------------------------- */

  buy(kind) {
    const T = ITEMS[kind];
    if (!T) return { error: 'The Stall does not sell that.' };
    if (this.d.coins < T.price) return { error: `Not enough coins. ${T.name} costs ${T.price}.` };
    const i = this.freeBag();
    if (i < 0) return { error: 'Your bag is full. Sell something first.' };
    this.d.coins -= T.price;
    const item = { uid: this.d.seq++, kind };
    // it goes in the bag: you put it on from the inventory
    this.d.bag[i] = item;
    this.changed('buy');
    return { ok: true, item, loc: 'b' + i };
  }

  sell(loc) {
    const item = this.get(loc);
    if (!item) return { error: 'There is nothing there to sell.' };
    const T = ITEMS[item.kind];
    this.set(loc, null);
    this.d.coins += T.sell;
    this.changed('sell');
    return { ok: true, coins: T.sell, item };
  }

  /* -------------------------------- equipping ------------------------------- */

  /** Moves whatever is at `from` to `to`, swapping with whatever was there if it fits back. */
  move(from, to) {
    if (from === to) return { ok: true };
    const a = this.get(from), b = this.get(to);
    if (!a) return { error: 'Nothing to move.' };
    if (!this.fits(a, to)) return { error: `${ITEMS[a.kind].name} does not go in that slot.` };
    if (b && !this.fits(b, from)) {
      // the bag will take it somewhere else
      const i = this.freeBag();
      if (i < 0) return { error: 'Your bag is full.' };
      this.set('b' + i, b);
      this.set(to, a);
      this.set(from, null);
    } else {
      this.set(to, a);
      this.set(from, b);
    }
    this.changed('equip');
    return { ok: true };
  }

  /** Puts a bag item on, in the slot it belongs in: an empty one, if there is a choice. */
  equip(loc) {
    const item = this.get(loc);
    if (!item) return { error: 'Nothing there.' };
    const fits = SLOTS.filter((s) => s.accepts === ITEMS[item.kind].slot);
    const slot = fits.find((s) => !this.d.eq[s.id]) || fits[0];
    if (!slot) return { error: 'That cannot be equipped.' };
    return this.move(loc, 'e:' + slot.id);
  }

  unequip(slotId) {
    const item = this.d.eq[slotId];
    if (!item) return { error: 'That slot is empty.' };
    const i = this.freeBag();
    if (i < 0) return { error: 'Your bag is full.' };
    return this.move('e:' + slotId, 'b' + i);
  }

  /** What you are carrying and wearing into the arena: { weapon, offhand, helmet, ... } item ids or null. */
  gear() {
    const out = {};
    for (const s of SLOTS) out[s.id] = this.d.eq[s.id] ? this.d.eq[s.id].kind : null;
    return out;
  }

  /* ---------------------------------- runs ---------------------------------- */

  cleared(wave) {
    this.d.best = Math.max(this.d.best, wave);
    this.d.wave = wave + 1;
    this.changed('wave');
  }

  kill() { this.d.kills++; }

  fell() {
    this.d.wave = 1;
    this.d.runs++;
    this.changed('fell');
  }

  toJSON() { return JSON.parse(JSON.stringify(this.d)); }
}
