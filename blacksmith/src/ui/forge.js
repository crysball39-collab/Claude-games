/* =============================================================================
   The anvil's menu. Pick what to make, then fill up to three slots with ore,
   any amount of each: the recipe's count is the least it takes, and more ore
   makes it stronger. The slots say live which
   part each ore is going to become: the most of an ore is the blade (or the
   plating), the next the cross-guard (or the body), the least the pommel
   (or the trim). The preview shows it, painted in those ores, with what it
   will do.
   ========================================================================== */
import { $ } from '../core/util.js';
import {
  ORES, ORE_ORDER, RARITIES, RECIPES, PART_NAMES, recipe, rankSlots, partsOf, itemStats, itemName, itemRarity,
} from '../game/data.js';
import { oreIcon, recipeIcon, itemIcon } from './icons.js';
import { describeItem } from './inventory.js';

const SHORT = { dagger: 'Dagger', sword: 'Straight-Sword', broadsword: 'Broadsword', helmet: 'Helmet', chestplate: 'Chestplate', leggings: 'Leggings', boots: 'Boots' };

export class ForgeUI {
  constructor(profile, { onForge, onClose, onEquip, onSkip }) {
    this.profile = profile;
    this.cb = { onForge, onClose, onEquip, onSkip };
    this.root = $('#forge');
    this.card = $('#forge-card');
    this.recipesEl = $('#recipes');
    this.slotsEl = $('#slots');
    this.needEl = $('#forge-need');
    this.previewEl = $('#forge-preview');
    this.forgeBtn = $('#btn-forge');
    this.picker = $('#ore-picker');
    this.pickerGrid = $('#op-grid');
    this.working = $('#forge-working');
    this.result = $('#forged');
    this.type = 'dagger';
    this.slots = [{ ore: null, amount: 0 }, { ore: null, amount: 0 }, { ore: null, amount: 0 }];
    this.pickingSlot = -1;
    this.isOpen = false;
    this.lastItem = null;

    $('#btn-close-forge').addEventListener('click', () => this.cb.onClose?.());
    $('#btn-close-picker').addEventListener('click', () => this._closePicker());
    this.forgeBtn.addEventListener('click', () => this._forge());
    this.working.addEventListener('pointerdown', () => this.cb.onSkip?.());
    $('#btn-forged-ok').addEventListener('click', () => this.hideResult());
    $('#btn-forged-equip').addEventListener('click', () => {
      if (this.lastItem) this.cb.onEquip?.(this.lastItem.uid);
      this.hideResult();
    });
    this.setProfile(profile);
  }

  /** A new game is a new smith, with nothing in the slots. */
  setProfile(profile) {
    this._unsub?.();
    this.profile = profile;
    this.slots = [{ ore: null, amount: 0 }, { ore: null, amount: 0 }, { ore: null, amount: 0 }];
    this._unsub = profile.onChange((what) => { if (this.isOpen && what === 'ores') this.render(); });
  }

  open() {
    this.isOpen = true;
    this.root.classList.remove('hidden');
    this.card.classList.remove('hidden');
    this.working.classList.add('hidden');
    this.result.classList.add('hidden');
    this._clampToOwned();
    this.render();
  }

  close() {
    this.isOpen = false;
    this._closePicker();
    this.root.classList.add('hidden');
  }

  get need() { return recipe(this.type).ores; }
  get total() { return this.slots.reduce((s, x) => s + (x.ore ? x.amount : 0), 0); }

  /** The slots as the anvil reads them: [[ore, amount], ...] in slot order. */
  mix() { return this.slots.filter((s) => s.ore && s.amount > 0).map((s) => [s.ore, s.amount]); }

  /** Never more of an ore in a slot than you have of it. */
  _clampToOwned() {
    for (const s of this.slots) {
      if (!s.ore) continue;
      s.amount = Math.min(s.amount, this.profile.ores[s.ore] || 0);
      if (!this.profile.ores[s.ore]) { s.ore = null; s.amount = 0; }
    }
  }

  render() {
    const R = recipe(this.type);
    // what to make
    this.recipesEl.innerHTML = '';
    for (const type of RECIPES) {
      const r = recipe(type);
      const el = document.createElement('button');
      el.className = 'rchip' + (type === this.type ? ' sel' : '');
      el.innerHTML = `<img alt="" src="${recipeIcon(type)}"><span>${SHORT[type]}<small>${r.weight} &middot; ${r.ores} ore</small></span>`;
      el.addEventListener('click', () => { this.type = type; this._clampToOwned(); this.render(); });
      this.recipesEl.appendChild(el);
    }
    // the count
    const need = this.need, total = this.total;
    this.needEl.textContent = `${total} ORE \u00b7 NEEDS ${need}`;
    this.needEl.classList.toggle('ok', total >= need);

    // which slot becomes which part
    const ranked = rankSlots(this.slots);
    const names = PART_NAMES[R.kind];
    const roles = new Map();
    ranked.forEach((s, rank) => {
      const r = [];
      if (rank === 0) r.push(names[0]);
      if (rank === Math.min(1, ranked.length - 1)) r.push(names[1]);
      if (rank === ranked.length - 1) r.push(names[2]);
      roles.set(s.i, ranked.length === 1 ? 'ALL PARTS' : r.join(' + ').toUpperCase());
    });

    this.slotsEl.innerHTML = '';
    this.slots.forEach((s, i) => {
      const el = document.createElement('div');
      const ore = s.ore ? ORES[s.ore] : null;
      el.className = 'slot' + (ore ? ' filled r-' + ore.rarity : '');
      el.innerHTML =
        `<span class="snum">SLOT ${i + 1}</span>` +
        (ore ? `<button class="sall" title="Put in all you have">ALL</button>` : '') +
        `<button class="sicon">${ore ? `<img alt="" src="${oreIcon(s.ore)}">` : '+'}</button>` +
        `<span class="sname">${ore ? ore.name : 'Add ore'}</span>` +
        `<span class="samt"><button data-d="-1">&minus;</button><b>${ore ? s.amount : 0}</b><button data-d="1">+</button></span>` +
        `<span class="spart">${roles.get(i) || '&nbsp;'}</span>`;
      el.querySelector('.sicon').addEventListener('click', () => this._openPicker(i));
      el.querySelector('.sall')?.addEventListener('click', () => { s.amount = this.profile.ores[s.ore] || 0; this.render(); });
      for (const b of el.querySelectorAll('.samt button')) this._repeat(b, (step) => this._bump(i, +b.dataset.d * step));
      this.slotsEl.appendChild(el);
    });

    // the preview
    const mix = this.mix();
    if (mix.length) {
      const item = { kind: R.kind, type: this.type, mix };
      const rar = itemRarity(item);
      const st = itemStats(item);
      const stat = R.kind === 'weapon' ? `Damage <b>${st.damage}</b>` : `Defense <b>${st.defense}</b>`;
      const extra = st.bonus > 1.005 ? `<br><span class="pbonus">+${Math.round((st.bonus - 1) * 100)}% for the extra ore</span>` : '';
      this.previewEl.innerHTML =
        `<div class="picon r-${rar}"><img alt="" src="${recipeIcon(this.type, partsOf(mix))}"></div>` +
        `<div class="ptext"><b>${itemName(item)}</b>${stat} &middot; <span style="color:${RARITIES[rar].color}">${RARITIES[rar].name}</span>` +
        (total < need ? `<br>${need - total} more ore` : extra) + '</div>';
    } else {
      this.previewEl.innerHTML = `<div class="picon"><img alt="" src="${recipeIcon(this.type)}"></div>` +
        `<div class="ptext"><b>${R.weight} ${SHORT[this.type]}</b>Put ${need} ore in the slots</div>`;
    }
    this.forgeBtn.disabled = total < need || !this.profile.hasOres(mix);
  }

  _bump(i, d) {
    const s = this.slots[i];
    if (!s.ore) { if (d > 0) this._openPicker(i); return; }
    const owned = this.profile.ores[s.ore] || 0;
    const next = Math.max(0, Math.min(owned, s.amount + d));
    if (next === s.amount) return;
    s.amount = next;
    this.render();
  }

  /** Hold a +/- to keep counting, faster the longer it is held: ones, then fives, then twenty-fives. */
  _repeat(btn, fn) {
    let t1 = 0, t2 = 0, n = 0;
    const stop = () => { clearTimeout(t1); clearInterval(t2); };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      n = 0;
      fn(1);
      t1 = setTimeout(() => { t2 = setInterval(() => { n++; fn(n > 30 ? 25 : n > 12 ? 5 : 1); }, 80); }, 380);
    });
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel', stop);
  }

  _openPicker(i) {
    this.pickingSlot = i;
    const used = new Set(this.slots.filter((s, k) => k !== i && s.ore).map((s) => s.ore));
    this.pickerGrid.innerHTML = '';
    const clear = document.createElement('button');
    clear.className = 'opt clear';
    clear.textContent = 'EMPTY SLOT';
    clear.addEventListener('click', () => { this.slots[i] = { ore: null, amount: 0 }; this._closePicker(); this.render(); });
    this.pickerGrid.appendChild(clear);
    let any = false;
    for (const id of ORE_ORDER) {
      const n = this.profile.ores[id];
      if (!n) continue;
      any = true;
      const o = ORES[id];
      const el = document.createElement('button');
      el.className = `opt r-${o.rarity}` + (used.has(id) ? ' used' : '');
      el.innerHTML = `<img alt="" src="${oreIcon(id)}"><span class="on">${o.name}</span><span class="oc">&times;${n} &middot; ${RARITIES[o.rarity].name}</span>`;
      el.addEventListener('click', () => {
        const s = this.slots[i];
        const others = this.total - (s.ore ? s.amount : 0);
        // start with what is still needed, as far as you have it; at least one
        this.slots[i] = { ore: id, amount: Math.min(n, Math.max(1, this.need - others)) };
        this._closePicker();
        this.render();
      });
      this.pickerGrid.appendChild(el);
    }
    if (!any) {
      const note = document.createElement('div');
      note.className = 'inv-empty';
      note.textContent = 'You have no ore. Mine some in the Cave - pebbles break into two ores each.';
      this.pickerGrid.appendChild(note);
    }
    this.picker.classList.remove('hidden');
  }

  _closePicker() {
    this.pickingSlot = -1;
    this.picker.classList.add('hidden');
  }

  _forge() {
    const mix = this.mix();
    if (this.total < this.need || !this.profile.hasOres(mix)) return;
    this.cb.onForge?.(this.type, mix);
  }

  /** While the hammer is going: the menu steps aside. */
  showWorking(on) {
    this.card.classList.toggle('hidden', on);
    this.working.classList.toggle('hidden', !on);
  }

  showResult(item) {
    this.lastItem = item;
    this.working.classList.add('hidden');
    const rar = itemRarity(item);
    const card = this.result.querySelector('.forged-card');
    card.className = 'forged-card r-' + rar;
    $('#forged-icon').innerHTML = `<img alt="" src="${itemIcon(item)}">`;
    $('#forged-name').innerHTML = `${itemName(item)} <small style="color:${RARITIES[rar].color}">${RARITIES[rar].name}</small>`;
    $('#forged-stats').innerHTML = describeItem(item);
    this.result.classList.remove('hidden');
    // the ore that went in is gone: keep the slots honest
    this._clampToOwned();
    this.render();
  }

  hideResult() {
    this.result.classList.add('hidden');
    this.card.classList.remove('hidden');
    this.render();
  }

  get showingResult() { return !this.result.classList.contains('hidden'); }
}
