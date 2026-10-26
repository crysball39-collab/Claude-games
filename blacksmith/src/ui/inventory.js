/* =============================================================================
   The bag. What you are wearing down the left, everything you own on the
   right in four sections - Weapons, Armor, Pickaxes, Ores - and whatever you
   last tapped along the bottom, with the button to put it on or take it off.
   ========================================================================== */
import { $, money } from '../core/util.js';
import {
  ORES, ORE_ORDER, RARITIES, PART_NAMES, EQUIP_SLOTS, itemName, itemStats, itemRarity, partsOf,
  oddsLabel, slotOf, rankOf, WEAPONS, ARMOR,
} from '../game/data.js';
import { itemIcon, oreIcon, ghostIcon } from './icons.js';

const SLOT_LABEL = { weapon: 'WEAPON', pickaxe: 'PICKAXE', helmet: 'HELMET', chest: 'CHEST', legs: 'LEGS', boots: 'BOOTS' };
const TAB_KIND = { weapons: 'weapon', armor: 'armor', pickaxes: 'pickaxe' };

/** "Masterwork 94%", in its colour; nothing for gear forged before there were ranks. */
export function rankTag(item, upper = false) {
  const r = rankOf(item.rank);
  return r ? `<span class="rank" style="color:${r.color}">${upper ? r.name.toUpperCase() : r.name} ${item.rank}%</span>` : '';
}

/** What a rank does to the gear's damage or defense: "+45%", "-25%", "no change". */
export function rankEffect(r) {
  return r.mult === 1 ? 'no change' : `${r.mult > 1 ? '+' : '&minus;'}${Math.round(Math.abs(r.mult - 1) * 100)}%`;
}

/** A few words on what an item does. */
export function describeItem(item) {
  const s = itemStats(item);
  if (item.kind === 'pickaxe') {
    return `Mining <b>${s.mining}</b> per hit &middot; ${s.tier >= 1 ? 'breaks <b>boulders</b>' : 'pebbles and rocks'} &middot; fights for <b>${s.damage}</b>`;
  }
  const parts = partsOf(item.mix);
  const names = PART_NAMES[item.kind];
  const partText = names.map((n, i) => `${n} <b>${ORES[parts[i]].name}</b>`).join(' &middot; ');
  const extra = s.bonus > 1.005 ? ` (+${Math.round((s.bonus - 1) * 100)}% for extra ore)` : '';
  const forged = s.rank ? ` &middot; ${s.rank.name} forging ${rankEffect(s.rank)}` : '';
  const mix = item.mix.map(([o, n]) => `${n} ${ORES[o].name}`).join(', ') + extra + forged;
  if (item.kind === 'weapon') {
    const w = WEAPONS[item.type];
    return `<b>${w.weight}</b> weapon &middot; Damage <b>${s.damage}</b> &middot; ${(1 / w.cooldown).toFixed(1)} swings/s<br>${partText}<br><small>Forged from ${mix}</small>`;
  }
  const a = ARMOR[item.type];
  return `<b>${a.weight}</b> armor &middot; Defense <b>${s.defense}</b><br>${partText}<br><small>Forged from ${mix}</small>`;
}

export class InventoryUI {
  constructor(profile, { onEquip, onUnequip, onScrap, onClose }) {
    this.profile = profile;
    this.cb = { onEquip, onUnequip, onScrap, onClose };
    this.root = $('#inventory');
    this.grid = $('#inv-grid');
    this.detail = $('#inv-detail');
    this.equipGrid = $('#equip-grid');
    this.stats = $('#inv-stats');
    this.cash = $('#inv-cash');
    this.tab = 'weapons';
    this.sel = null;          // { uid } or { ore }
    this.scrapArmed = null;
    this.isOpen = false;

    $('#btn-close-inv').addEventListener('click', () => this.cb.onClose?.());
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.cb.onClose?.(); });
    for (const t of document.querySelectorAll('#inv-tabs .tab')) {
      t.addEventListener('click', () => { this.tab = t.dataset.tab; this.sel = null; this.render(); });
    }
    this.setProfile(profile);
  }

  /** A new game is a new smith. */
  setProfile(profile) {
    this._unsub?.();
    this.profile = profile;
    this.sel = null;
    this._unsub = profile.onChange(() => { if (this.isOpen) this.render(); });
  }

  open(tab = null) {
    if (tab) this.tab = tab;
    this.isOpen = true;
    this.root.classList.remove('hidden');
    this.render();
  }

  close() {
    this.isOpen = false;
    this.scrapArmed = null;
    this.root.classList.add('hidden');
  }

  render() {
    const p = this.profile;
    this.cash.textContent = money(p.cash);
    for (const t of document.querySelectorAll('#inv-tabs .tab')) t.classList.toggle('active', t.dataset.tab === this.tab);

    // what you have on
    this.equipGrid.innerHTML = '';
    for (const slot of EQUIP_SLOTS) {
      const it = p.equippedItem(slot);
      const el = document.createElement('button');
      el.className = 'eslot ' + (it ? 'filled r-' + itemRarity(it) : 'empty');
      if (it && this.sel?.uid === it.uid) el.classList.add('sel');
      el.innerHTML = (it ? `<img alt="" src="${itemIcon(it)}">` : `<img class="ghost" alt="" src="${ghostIcon(slot)}">`) +
        `<span class="elbl">${SLOT_LABEL[slot]}</span>`;
      el.addEventListener('click', () => {
        if (!it) { this.tab = slot === 'weapon' ? 'weapons' : slot === 'pickaxe' ? 'pickaxes' : 'armor'; this.sel = null; }
        else { this.sel = { uid: it.uid }; this.tab = it.kind === 'weapon' ? 'weapons' : it.kind === 'pickaxe' ? 'pickaxes' : 'armor'; }
        this.render();
      });
      this.equipGrid.appendChild(el);
    }
    const w = p.weapon(), pk = p.pickaxe();
    const info = p.levelInfo();
    this.stats.innerHTML =
      `Level <b>${info.level}</b> &middot; ${info.into}/${info.need} EXP<br>` +
      `Max HP <b>${p.maxHp()}</b> &middot; Defense <b>${p.defense()}</b><br>` +
      `Damage <b>${w ? w.damage : pk.damage}</b> &middot; Mining <b>${pk.mining}</b><br>` +
      `Skeletons <b>${p.stats.kills}</b> &middot; Rocks <b>${p.stats.mined}</b>`;

    // the section's contents
    this.grid.innerHTML = '';
    if (this.tab === 'ores') this._renderOres(); else this._renderItems();
    this._renderDetail();
  }

  _renderItems() {
    const p = this.profile;
    const kind = TAB_KIND[this.tab];
    const items = p.itemsOf(kind).slice().sort((a, b) => (p.isEquipped(b.uid) - p.isEquipped(a.uid)) || b.uid - a.uid);
    if (!items.length) {
      const hint = kind === 'weapon'
        ? 'No weapons yet. Take ore to the anvil in the Forge: three ores make a Dagger.'
        : 'No armor yet. The anvil makes a Light Helmet from just two ores.';
      this.grid.innerHTML = `<div class="inv-empty">${hint}</div>`;
      return;
    }
    for (const it of items) {
      const el = document.createElement('button');
      el.className = 'icard r-' + itemRarity(it);
      if (this.sel?.uid === it.uid) el.classList.add('sel');
      const rank = rankOf(it.rank);
      el.innerHTML = `<img alt="" src="${itemIcon(it)}">` + (p.isEquipped(it.uid) ? '<span class="eq">ON</span>' : '') +
        (rank ? `<span class="rk" style="background:${rank.color}" title="${rank.name}"></span>` : '');
      el.addEventListener('click', () => { this.sel = { uid: it.uid }; this.scrapArmed = null; this.render(); });
      this.grid.appendChild(el);
    }
  }

  _renderOres() {
    const p = this.profile;
    for (const id of ORE_ORDER) {
      const n = p.ores[id];
      const el = document.createElement('button');
      el.className = 'icard r-' + ORES[id].rarity + (n ? '' : ' zero');
      if (this.sel?.ore === id) el.classList.add('sel');
      el.innerHTML = `<img alt="" src="${oreIcon(id)}"><span class="cnt">${n}</span>`;
      el.addEventListener('click', () => { this.sel = { ore: id }; this.render(); });
      this.grid.appendChild(el);
    }
  }

  _renderDetail() {
    const p = this.profile;
    const d = this.detail;
    if (this.sel?.ore) {
      const o = ORES[this.sel.ore];
      const r = RARITIES[o.rarity];
      const where = o.fromSkeletons ? `${oddsLabel(this.sel.ore)} from a skeleton` : `${oddsLabel(this.sel.ore)} from a rock`;
      d.innerHTML = `<div class="dicon r-${o.rarity}"><img alt="" src="${oreIcon(this.sel.ore)}"></div>` +
        `<div class="dtext r-${o.rarity}"><div class="dname">${o.name} <small>&times;${p.ores[this.sel.ore]}</small></div>` +
        `<div class="drar">${r.name.toUpperCase()}</div>` +
        `<div class="dstats">${where} &middot; forges at <b>&times;${o.power}</b> strength</div></div>`;
      return;
    }
    const it = this.sel?.uid != null ? p.item(this.sel.uid) : null;
    if (!it) {
      d.innerHTML = `<div class="inv-hint">Tap something to see what it does, and to equip it.</div>`;
      return;
    }
    const rar = itemRarity(it);
    const on = p.isEquipped(it.uid);
    const slot = slotOf(it);
    const canOff = on && slot !== 'pickaxe';
    d.innerHTML = `<div class="dicon r-${rar}"><img alt="" src="${itemIcon(it)}"></div>` +
      `<div class="dtext r-${rar}"><div class="dname">${itemName(it)}</div>` +
      `<div class="drar">${[RARITIES[rar].name.toUpperCase(), rankTag(it, true)].filter(Boolean).join(' &middot; ')}</div>` +
      `<div class="dstats">${describeItem(it)}</div></div>` +
      `<div class="dbtns"></div>`;
    const btns = d.querySelector('.dbtns');
    const mk = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'mbtn ' + cls;
      b.textContent = label;
      b.addEventListener('click', fn);
      btns.appendChild(b);
      return b;
    };
    if (!on) mk('EQUIP', 'primary', () => this.cb.onEquip?.(it.uid));
    else if (canOff) mk('UNEQUIP', '', () => this.cb.onUnequip?.(slot));
    else mk('IN HAND', '', () => {}).disabled = true;
    if (!on && !(it.kind === 'pickaxe' && p.itemsOf('pickaxe').length <= 1)) {
      const armed = this.scrapArmed === it.uid;
      mk(armed ? 'SURE?' : 'SCRAP', 'danger', () => {
        if (!armed) { this.scrapArmed = it.uid; this.render(); return; }
        this.scrapArmed = null;
        this.sel = null;
        this.cb.onScrap?.(it.uid);
      });
    }
  }
}
