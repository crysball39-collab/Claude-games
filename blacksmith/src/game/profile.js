/* =============================================================================
   Everything about you that outlives a session: cash, EXP, ores, the things
   you have forged, what you are wearing, Rob's and Jack's bounties, and
   where you were. Nothing in here is ever taken away by dying.
   ========================================================================== */
import {
  ORES, ORE_ORDER, PLAYER, PICKAXES, WEAPONS, ARMOR, EQUIP_SLOTS, QUESTS,
  itemStats, slotOf, levelFromExp,
} from './data.js';

const PLACES = ['overworld', 'cave', 'deep'];
const bounty = (q) => ({
  active: !!q?.active,
  kills: Math.max(0, Math.floor(q?.kills || 0)),
  completed: Math.max(0, Math.floor(q?.completed || 0)),
});

const isItem = (it) => it && typeof it.uid === 'number' && (
  (it.kind === 'pickaxe' && PICKAXES[it.type]) ||
  (it.kind === 'weapon' && WEAPONS[it.type] && validMix(it.mix)) ||
  (it.kind === 'armor' && ARMOR[it.type] && validMix(it.mix)));

const validMix = (mix) => Array.isArray(mix) && mix.length > 0 && mix.length <= 3 &&
  mix.every((m) => Array.isArray(m) && ORES[m[0]] && m[1] > 0);

export class Profile {
  constructor(data = null) {
    const d = data || {};
    this.cash = Math.max(0, Math.floor(d.cash || 0));
    this.exp = Math.max(0, Math.floor(d.exp || 0));
    this.ores = {};
    for (const id of ORE_ORDER) this.ores[id] = Math.max(0, Math.floor(d.ores?.[id] || 0));
    this.items = (Array.isArray(d.items) ? d.items : []).filter(isItem).map((it) => ({
      uid: it.uid, kind: it.kind, type: it.type,
      ...(it.mix ? { mix: it.mix.map(([o, n]) => [o, Math.floor(n)]) } : {}),
      // how well it was forged, 0-100; gear from before the forging game has none
      ...(Number.isFinite(it.rank) ? { rank: Math.max(0, Math.min(100, Math.round(it.rank))) } : {}),
    }));
    this.nextUid = this.items.reduce((m, it) => Math.max(m, it.uid + 1), 1);

    this.equipped = {};
    for (const slot of EQUIP_SLOTS) {
      const it = this.item(d.equipped?.[slot]);
      this.equipped[slot] = it && slotOf(it) === slot ? it.uid : null;
    }
    // Everyone starts with a Wood Pickaxe in their hand.
    if (!this.items.some((it) => it.kind === 'pickaxe')) {
      const wood = this.addItem({ kind: 'pickaxe', type: 'wood' }, false);
      this.equipped.pickaxe = wood.uid;
    }
    if (this.equipped.pickaxe == null) {
      this.equipped.pickaxe = this.items.find((it) => it.kind === 'pickaxe').uid;
    }

    // one bounty per giver; a save from before Jack kept Rob's as `quest`
    this.quests = {};
    for (const id of Object.keys(QUESTS)) this.quests[id] = bounty(d.quests?.[id] ?? (id === 'rob' ? d.quest : null));
    this.where = PLACES.includes(d.where) ? d.where : 'overworld';
    this.pos = Array.isArray(d.pos) && d.pos.length === 2 && d.pos.every(Number.isFinite) ? d.pos : null;
    this.yaw = Number.isFinite(d.yaw) ? d.yaw : null;
    // who you have met and which hints you have already been given
    this.met = {};
    for (const [k, v] of Object.entries(d.met || {})) if (typeof v === 'boolean') this.met[k] = v;
    this.met.rob = !!this.met.rob;
    this.met.jack = !!this.met.jack;
    const s = d.stats || {};
    this.stats = {
      mined: s.mined | 0, kills: s.kills | 0, elites: s.elites | 0, crafted: s.crafted | 0,
      deaths: s.deaths | 0, ores: s.ores | 0, playTime: +s.playTime || 0,
    };
    this._listeners = new Set();
  }

  /** Rob's bounty, by its old name. */
  get quest() { return this.quests.rob; }

  /** `fn(what)` whenever something about you changes. */
  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit(what) { for (const fn of this._listeners) fn(what); }

  /* -------------------------------- money -------------------------------- */

  addCash(n) { this.cash += Math.floor(n); this._emit('cash'); }

  /** @returns {boolean} false, and nothing spent, when you cannot afford it. */
  spend(n) {
    if (this.cash < n) return false;
    this.cash -= n;
    this._emit('cash');
    return true;
  }

  /* ---------------------------------- EXP --------------------------------- */

  get level() { return levelFromExp(this.exp).level; }
  levelInfo() { return levelFromExp(this.exp); }

  /** @returns {number} how many levels that was worth. */
  addExp(n) {
    const before = this.level;
    this.exp += Math.floor(n);
    this._emit('exp');
    return this.level - before;
  }

  maxHp() { return PLAYER.baseHp + PLAYER.hpPerLevel * (this.level - 1); }

  /* --------------------------------- ores --------------------------------- */

  addOre(id, n = 1) {
    if (!ORES[id]) return;
    this.ores[id] += n;
    this.stats.ores += n;
    this._emit('ores');
  }

  hasOres(mix) { return mix.every(([id, n]) => (this.ores[id] || 0) >= n); }

  /** Takes what the anvil uses. All of it, or none. */
  takeOres(mix) {
    if (!this.hasOres(mix)) return false;
    for (const [id, n] of mix) this.ores[id] -= n;
    this._emit('ores');
    return true;
  }

  /* --------------------------------- items -------------------------------- */

  addItem(item, emit = true) {
    const it = { uid: this.nextUid++, kind: item.kind, type: item.type };
    if (item.mix) it.mix = item.mix.map(([o, n]) => [o, n]);
    if (Number.isFinite(item.rank)) it.rank = item.rank;
    this.items.push(it);
    if (emit) this._emit('items');
    return it;
  }

  item(uid) { return uid == null ? null : this.items.find((it) => it.uid === uid) || null; }

  itemsOf(kind) { return this.items.filter((it) => it.kind === kind); }

  hasPickaxe(type) { return this.items.some((it) => it.kind === 'pickaxe' && it.type === type); }

  isEquipped(uid) { return EQUIP_SLOTS.some((s) => this.equipped[s] === uid); }

  equip(uid) {
    const it = this.item(uid);
    if (!it) return false;
    this.equipped[slotOf(it)] = uid;
    this._emit('equip');
    return true;
  }

  /** You always keep a pickaxe in hand; everything else can come off. */
  unequip(slot) {
    if (slot === 'pickaxe' || this.equipped[slot] == null) return false;
    this.equipped[slot] = null;
    this._emit('equip');
    return true;
  }

  /** Throws something away for good. Not what you are wearing, and never your last pickaxe. */
  scrap(uid) {
    const it = this.item(uid);
    if (!it || this.isEquipped(uid)) return false;
    if (it.kind === 'pickaxe' && this.itemsOf('pickaxe').length <= 1) return false;
    this.items = this.items.filter((x) => x.uid !== uid);
    this._emit('items');
    return true;
  }

  equippedItem(slot) { return this.item(this.equipped[slot]); }

  /** The pickaxe in your hand, as numbers. */
  pickaxe() {
    const it = this.equippedItem('pickaxe');
    return it ? { item: it, ...itemStats(it) } : { item: null, mining: 5, tier: 0, damage: 4 };
  }

  /** The weapon you are carrying, or null for none. */
  weapon() {
    const it = this.equippedItem('weapon');
    return it ? { item: it, ...itemStats(it) } : null;
  }

  defense() {
    let d = 0;
    for (const slot of ['helmet', 'chest', 'legs', 'boots']) {
      const it = this.equippedItem(slot);
      if (it) d += itemStats(it).defense;
    }
    return Math.round(d * 10) / 10;
  }

  /* --------------------------------- save --------------------------------- */

  toJSON() {
    return {
      v: 2,
      cash: this.cash, exp: this.exp, ores: this.ores,
      items: this.items, equipped: this.equipped,
      quests: this.quests, where: this.where, pos: this.pos, yaw: this.yaw,
      met: this.met, stats: this.stats,
      savedAt: Date.now(),
    };
  }
}
