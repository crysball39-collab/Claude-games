/* =============================================================================
   The anvil's menu. Pick what to make, then fill up to three slots with ore,
   any amount of each: the recipe's count is the least it takes, and more ore
   makes it stronger. The slots say live which
   part each ore is going to become: the most of an ore is the blade (or the
   plating), the next the cross-guard (or the body), the least the pommel
   (or the trim). The preview shows it, painted in those ores, with what it
   will do.

   The chips and slots are built once and only repainted after that, so a
   finger held on a +/- is still on the same button when it lifts.
   ========================================================================== */
import { $ } from '../core/util.js';
import {
  ORES, ORE_ORDER, RARITIES, RECIPES, PART_NAMES, recipe, rankSlots, partsOf, itemStats, itemName, itemRarity,
} from '../game/data.js';
import { oreIcon, recipeIcon, itemIcon } from './icons.js';
import { describeItem } from './inventory.js';

const SHORT = { dagger: 'Dagger', sword: 'Straight-Sword', broadsword: 'Broadsword', helmet: 'Helmet', chestplate: 'Chestplate', leggings: 'Leggings', boots: 'Boots' };
const empty = () => ({ ore: null, amount: 0 });

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
    this.pickerTitle = $('#op-title');
    this.pickerGrid = $('#op-grid');
    this.working = $('#forge-working');
    this.result = $('#forged');
    this.type = 'dagger';
    this.slots = [empty(), empty(), empty()];
    this.slotEls = null;
    this.pickingSlot = -1;
    this.isOpen = false;
    this.lastItem = null;
    this.held = null;          // the +/- a finger is on: { timer, ticker, n }
    this.freeFrac = 0.5;       // how much of the screen, from the left, the card leaves clear

    $('#btn-close-forge').addEventListener('click', () => this.cb.onClose?.());
    $('#btn-close-picker').addEventListener('click', () => this._closePicker());
    this.forgeBtn.addEventListener('click', () => this._forge());
    this.working.addEventListener('pointerdown', () => this.cb.onSkip?.());
    $('#btn-forged-ok').addEventListener('click', () => this.hideResult());
    $('#btn-forged-equip').addEventListener('click', () => {
      if (this.lastItem) this.cb.onEquip?.(this.lastItem.uid);
      this.hideResult();
    });
    // a held +/- stops the moment any finger lifts, wherever it lifts, or the page goes away
    const stop = () => this._stopHold();
    for (const ev of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(ev, stop);
    document.addEventListener('visibilitychange', stop);
    window.addEventListener('resize', () => this._measure());
    this.setProfile(profile);
  }

  /** A new game is a new smith, with nothing in the slots. */
  setProfile(profile) {
    this._unsub?.();
    this.profile = profile;
    this.slots = [empty(), empty(), empty()];
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
    this._measure();
    // on a short screen the recipes are one row that scrolls: bring the chosen one into it
    const rc = this.recipesEl, chip = rc.querySelector('.sel');
    if (chip && rc.scrollWidth > rc.clientWidth) {
      const a = rc.getBoundingClientRect(), b = chip.getBoundingClientRect();
      rc.scrollLeft += (b.left + b.width / 2) - (a.left + a.width / 2);
    }
  }

  close() {
    this.isOpen = false;
    this._stopHold();
    this._closePicker();
    this.root.classList.add('hidden');
  }

  get need() { return recipe(this.type).ores; }
  get total() { return this.slots.reduce((s, x) => s + (x.ore ? x.amount : 0), 0); }

  /** The slots as the anvil reads them: [[ore, amount], ...] in slot order. */
  mix() { return this.slots.filter((s) => s.ore && s.amount > 0).map((s) => [s.ore, s.amount]); }

  /** Where the card starts, so the camera can put the anvil in the space left of it. */
  _measure() {
    const w = this.root.clientWidth;
    if (this.isOpen && w > 0 && this.card.offsetWidth > 0) this.freeFrac = this.card.offsetLeft / w;
  }

  /** Never more of an ore in a slot than you have of it. */
  _clampToOwned() {
    this.slots.forEach((s, i) => {
      if (!s.ore) return;
      const have = this.profile.ores[s.ore] || 0;
      this.slots[i] = have ? { ore: s.ore, amount: Math.min(s.amount, have) } : empty();
    });
  }

  /* --------------------------------- built once --------------------------------- */

  _build() {
    this.recipesEl.innerHTML = '';
    for (const type of RECIPES) {
      const r = recipe(type);
      const el = document.createElement('button');
      el.className = 'rchip';
      el.dataset.type = type;
      el.innerHTML = `<img alt="" src="${recipeIcon(type)}"><span>${SHORT[type]}<small>${r.weight} &middot; ${r.ores}+ ore</small></span>`;
      el.addEventListener('click', () => { this.type = type; this._clampToOwned(); this.render(); });
      this.recipesEl.appendChild(el);
    }
    this.slotsEl.innerHTML = '';
    this.slotEls = this.slots.map((_, i) => {
      const el = document.createElement('div');
      el.className = 'slot';
      // the top of a slot - its number, ore and name - is one big button for choosing the ore
      el.innerHTML =
        `<button class="spick"><span class="snum">SLOT ${i + 1}</span><span class="sicon"></span><span class="sname"></span></button>` +
        `<button class="sall hidden" title="Put in all you have">ALL</button>` +
        `<span class="samt"><button data-d="-1" aria-label="Less">&minus;</button><b></b><button data-d="1" aria-label="More">+</button></span>` +
        `<span class="spart"></span>`;
      const v = {
        el, ore: undefined,
        icon: el.querySelector('.sicon'), name: el.querySelector('.sname'), all: el.querySelector('.sall'),
        amt: el.querySelector('.samt b'), part: el.querySelector('.spart'),
        minus: el.querySelector('[data-d="-1"]'), plus: el.querySelector('[data-d="1"]'),
      };
      el.querySelector('.spick').addEventListener('click', () => this._openPicker(i));
      v.all.addEventListener('click', () => {
        const s = this.slots[i];
        if (s.ore) { s.amount = this.profile.ores[s.ore] || 0; this.render(); }
      });
      this._holdable(v.minus, i, -1);
      this._holdable(v.plus, i, 1);
      this.slotsEl.appendChild(el);
      return v;
    });
  }

  /* --------------------------------- repainting --------------------------------- */

  render() {
    if (!this.slotEls) this._build();
    const R = recipe(this.type);
    for (const el of this.recipesEl.children) el.classList.toggle('sel', el.dataset.type === this.type);
    // the count
    const need = this.need, total = this.total;
    this.needEl.textContent = `${total} ORE · NEEDS ${need}`;
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

    this.slots.forEach((s, i) => {
      const v = this.slotEls[i];
      const ore = s.ore ? ORES[s.ore] : null;
      v.el.className = 'slot' + (ore ? ' filled r-' + ore.rarity : '');
      if (v.ore !== s.ore) {
        v.ore = s.ore;
        v.icon.innerHTML = ore ? `<img alt="" src="${oreIcon(s.ore)}">` : '+';
        v.name.textContent = ore ? ore.name : 'Add ore';
        v.all.classList.toggle('hidden', !ore);
      }
      const have = ore ? this.profile.ores[s.ore] || 0 : 0;
      v.amt.textContent = ore ? s.amount : 0;
      v.minus.classList.toggle('off', !ore);
      v.plus.classList.toggle('off', !!ore && s.amount >= have);
      v.part.textContent = roles.get(i) || ' ';
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
        `<div class="ptext"><b class="pname">${itemName(item)}</b>${stat} &middot; <span style="color:${RARITIES[rar].color}">${RARITIES[rar].name}</span>` +
        (total < need ? `<br>${need - total} more ore` : extra) + '</div>';
    } else {
      this.previewEl.innerHTML = `<div class="picon"><img alt="" src="${recipeIcon(this.type)}"></div>` +
        `<div class="ptext"><b class="pname">${R.weight} ${SHORT[this.type]}</b>Put ${need} ore in the slots</div>`;
    }
    this.forgeBtn.disabled = total < need || !this.profile.hasOres(mix);
  }

  /* ------------------------------------ +/- ------------------------------------- */

  /**
   * One more or one less, never more than you have. A slot counted down to
   * nothing is emptied, but only by a tap of its own: a held - stops at one.
   * Says whether anything changed.
   */
  _bump(i, d, held = false) {
    const s = this.slots[i];
    if (!s.ore) { if (d > 0 && !held) this._openPicker(i); return false; }
    const have = this.profile.ores[s.ore] || 0;
    const next = Math.max(held ? 1 : 0, Math.min(have, s.amount + d));
    if (next === s.amount) return false;
    this.slots[i] = next > 0 ? { ore: s.ore, amount: next } : empty();
    this.render();
    return true;
  }

  /**
   * A tap is exactly one. Held, it keeps counting, faster the longer it is
   * held: ones, then fives, then twenty-fives. Only one button counts at a
   * time, and it stops when the finger lifts (anywhere), the touch is
   * cancelled, or the count can go no further.
   */
  _holdable(btn, i, dir) {
    btn.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      this._stopHold();
      try { btn.setPointerCapture(e.pointerId); } catch { /* not every pointer can be captured */ }
      if (!this._bump(i, dir)) return;
      const h = { n: 0, timer: 0, ticker: 0 };
      h.timer = setTimeout(() => {
        h.ticker = setInterval(() => {
          h.n++;
          if (!this.isOpen || this.pickingSlot >= 0 || !this._bump(i, dir * (h.n > 30 ? 25 : h.n > 12 ? 5 : 1), true)) this._stopHold();
        }, 80);
      }, 450);
      this.held = h;
    });
    btn.addEventListener('lostpointercapture', () => this._stopHold());
  }

  _stopHold() {
    const h = this.held;
    if (!h) return;
    clearTimeout(h.timer);
    clearInterval(h.ticker);
    this.held = null;
  }

  /* ---------------------------------- the ores ---------------------------------- */

  _openPicker(i) {
    this._stopHold();
    this.pickingSlot = i;
    const cur = this.slots[i];
    this.pickerTitle.textContent = cur.ore ? `SLOT ${i + 1}: CHANGE THE ${ORES[cur.ore].name.toUpperCase()}` : `SLOT ${i + 1}: CHOOSE AN ORE`;
    this.pickerGrid.innerHTML = '';
    const clear = document.createElement('button');
    clear.className = 'opt clear';
    clear.textContent = 'EMPTY SLOT';
    clear.addEventListener('click', () => { this.slots[i] = empty(); this._closePicker(); this.render(); });
    this.pickerGrid.appendChild(clear);
    let any = false;
    for (const id of ORE_ORDER) {
      const n = this.profile.ores[id];
      if (!n) continue;
      any = true;
      const o = ORES[id];
      const j = this.slots.findIndex((s, k) => k !== i && s.ore === id);
      const el = document.createElement('button');
      el.className = `opt r-${o.rarity}` + (cur.ore === id ? ' cur' : j >= 0 ? ' used' : '');
      el.innerHTML = `<img alt="" src="${oreIcon(id)}"><span class="on">${o.name}</span><span class="oc">&times;${n} &middot; ${RARITIES[o.rarity].name}</span>` +
        (cur.ore === id ? '<span class="otag">IN HERE</span>' : j >= 0 ? `<span class="otag">SWAP WITH ${j + 1}</span>` : '');
      el.addEventListener('click', () => this._choose(i, id));
      this.pickerGrid.appendChild(el);
    }
    if (!any) {
      const note = document.createElement('div');
      note.className = 'inv-empty';
      note.textContent = 'You have no ore. Mine some in the Cave - pebbles break into two ores each.';
      this.pickerGrid.appendChild(note);
    }
    this.picker.classList.remove('hidden');
    this.pickerGrid.scrollTop = 0;
  }

  /** An ore picked for slot i. One already in another slot trades places with whatever is in this one. */
  _choose(i, id) {
    const s = this.slots[i];
    const j = this.slots.findIndex((x, k) => k !== i && x.ore === id);
    if (j >= 0) {
      this.slots[i] = this.slots[j];
      this.slots[j] = s;
    } else if (s.ore !== id) {
      // keep the amount the slot had, or start with what is still needed; as far as you have it, and at least one
      const others = this.total - (s.ore ? s.amount : 0);
      const want = Math.max(1, this.need - others, s.ore ? s.amount : 0);
      this.slots[i] = { ore: id, amount: Math.min(this.profile.ores[id] || 0, want) };
    }
    this._closePicker();
    this.render();
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
    if (on) this._stopHold();
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
