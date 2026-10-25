/* =============================================================================
   The pickaxe wall's menu. Along the top, every pickaxe on the wall with its
   price or OWNED; below, the one you are looking at: what it does to each
   kind of rock, what it is worth in a fight, and the button to buy it, or to
   take it in hand if it is already yours.
   ========================================================================== */
import { $, money } from '../core/util.js';
import { PICKAXES, ROCKS, RARITIES, QUEST, hitsToBreak } from '../game/data.js';
import { itemIcon } from './icons.js';

const ROCK_NAMES = { pebble: 'Pebble', rock: 'Rock', boulder: 'Boulder' };

export class ShopUI {
  constructor(profile, { onSelect, onBuy, onEquip, onClose }) {
    this.root = $('#shop');
    this.list = $('#shop-list');
    this.detail = $('#shop-detail');
    this.cash = $('#shop-cash');
    this.cb = { onSelect, onBuy, onEquip, onClose };
    this.sel = null;
    this.isOpen = false;
    $('#btn-close-shop').addEventListener('click', () => this.cb.onClose?.());
    this.setProfile(profile);
  }

  /** A new game is a new smith. */
  setProfile(profile) {
    this._unsub?.();
    this.profile = profile;
    this._unsub = profile.onChange(() => { if (this.isOpen) this.render(); });
  }

  /** Opens on `type`, or on the first pickaxe you do not have yet. */
  open(type = null) {
    this.isOpen = true;
    this.root.classList.remove('hidden');
    const types = Object.keys(PICKAXES);
    this.select(type || types.find((t) => !this.profile.hasPickaxe(t)) || types[types.length - 1]);
  }

  close() {
    this.isOpen = false;
    this.root.classList.add('hidden');
  }

  select(type) {
    this.sel = type;
    this.render();
    this.cb.onSelect?.(type);
  }

  /** Owned, in your hand, or neither. */
  _state(type) {
    const p = this.profile;
    if (!p.hasPickaxe(type)) return 'shop';
    return p.equippedItem('pickaxe')?.type === type ? 'hand' : 'owned';
  }

  render() {
    const p = this.profile;
    this.cash.textContent = money(p.cash);
    this.list.innerHTML = '';
    for (const [type, def] of Object.entries(PICKAXES)) {
      const state = this._state(type);
      const el = document.createElement('button');
      el.className = 'scard r-' + def.rarity + (type === this.sel ? ' sel' : '');
      const label = state === 'hand' ? 'IN HAND' : state === 'owned' ? 'OWNED' : def.price ? money(def.price) : 'FREE';
      el.innerHTML = `<img alt="" src="${itemIcon({ kind: 'pickaxe', type })}">` +
        `<span><b>${def.name}</b><small class="${state === 'shop' ? '' : 'own'}">${label}</small></span>`;
      el.addEventListener('click', () => this.select(type));
      this.list.appendChild(el);
    }
    this._renderDetail();
  }

  _renderDetail() {
    const type = this.sel;
    const def = PICKAXES[type];
    if (!def) { this.detail.innerHTML = ''; return; }
    const rar = RARITIES[def.rarity];
    const hits = hitsToBreak(type);
    const breaks = Object.keys(ROCKS).filter((k) => hits[k] != null).map((k) => ROCK_NAMES[k].toLowerCase() + 's');
    const swings = Object.keys(ROCKS).map((k) => hits[k] != null
      ? `${ROCK_NAMES[k]} <b>${hits[k]}</b>`
      : `${ROCK_NAMES[k]} <span class="no">too hard</span>`).join(' &middot; ');
    const state = this._state(type);
    const p = this.profile;
    this.detail.innerHTML =
      `<div class="sd-top r-${def.rarity}"><div class="sd-icon"><img alt="" src="${itemIcon({ kind: 'pickaxe', type })}"></div>` +
      `<div><div class="sd-name">${def.name}</div><div class="drar">${rar.name.toUpperCase()}</div></div></div>` +
      `<div class="sd-blurb">${def.blurb || ''}</div>` +
      `<div class="sd-stats">` +
      `<span>Mining</span><span><b>${def.damage}</b> damage a swing</span>` +
      `<span>Breaks</span><span><b>${breaks.join(', ')}</b></span>` +
      `<span>Swings</span><span>${swings}</span>` +
      `<span>Fighting</span><span><b>${def.fight}</b> damage, if it is all you have</span>` +
      `</div>` +
      `<div class="sd-buy"></div>`;
    const row = this.detail.querySelector('.sd-buy');
    const btn = document.createElement('button');
    btn.className = 'mbtn';
    const note = document.createElement('span');
    note.className = 'sd-note';
    if (state === 'hand') {
      btn.textContent = 'IN HAND';
      btn.disabled = true;
      note.textContent = 'This is the pickaxe you are swinging.';
    } else if (state === 'owned') {
      btn.textContent = 'EQUIP';
      btn.classList.add('primary');
      btn.addEventListener('click', () => this.cb.onEquip?.(type));
      note.textContent = 'You own this one already.';
    } else if (!def.price) {
      btn.textContent = 'TAKE ONE';
      btn.classList.add('primary');
      btn.addEventListener('click', () => this.cb.onBuy?.(type));
      note.textContent = 'Free to anyone who needs one.';
    } else {
      btn.textContent = 'BUY ' + money(def.price);
      const short = p.cash < def.price;
      if (short) {
        btn.disabled = true;
        note.textContent = `You have ${money(p.cash)}. Rob pays ${money(QUEST.cash)} for every ${QUEST.kills} skeletons in the cave.`;
      } else {
        btn.classList.add('primary');
        btn.addEventListener('click', () => this.cb.onBuy?.(type));
        note.textContent = `You have ${money(p.cash)}.`;
      }
    }
    row.append(btn, note);
  }
}
