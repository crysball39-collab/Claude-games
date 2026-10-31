/* =============================================================================
   The inventory: sixty slots in the bag, and eight on the figure - helmet,
   chestplate, leggings and boots down the left, weapon, offhand and two
   accessories down the right.

   Tap an item to see what it is and to EQUIP it, take it off, or - standing
   at the Stall - SELL it. Or move things about directly: tap an item, then
   tap where it should go, or drag it there. A sword goes in the weapon slot,
   the shield in the offhand, each piece of armour in its own slot, and a
   bracelet or a charm in either accessory slot.
   ========================================================================== */
import { $, $$ } from '../core/util.js';
import { ITEMS, SLOTS, SLOT, SLOT_KIND, ARMOUR } from '../game/gear.js';
import { BAG } from '../data/profile.js';
import { itemIcon, slotIcon } from './icons.js';

const LEFT = ['helmet', 'chest', 'legs', 'boots'];
const RIGHT = ['weapon', 'offhand', 'acc1', 'acc2'];
const SLOT_NAME = { weapon: 'weapon', offhand: 'offhand' };

export class InventoryUI {
  /** profile(): the current Profile; atStall(): may things be sold here; onChange(why); onClose(); toast(text) */
  constructor({ profile, atStall, onChange, onClose, sound, toast }) {
    this.cb = { profile, atStall, onChange, onClose, toast };
    this.sound = sound;
    this.el = $('#inventory');
    this.grid = $('#inv-grid');
    this.detail = $('#inv-detail');
    this.sel = null;
    this.drag = null;
    this.build();
    $('#inv-close').addEventListener('click', () => this.close());
    this.el.addEventListener('pointerdown', (e) => { if (e.target === this.el) this.close(); });
  }

  get open() { return !this.el.classList.contains('hidden'); }

  build() {
    const make = (loc, cls) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'slot ' + cls;
      b.dataset.loc = loc;
      b.addEventListener('pointerdown', (e) => this.down(e, b));
      return b;
    };
    for (let i = 0; i < BAG; i++) this.grid.appendChild(make('b' + i, ''));
    for (const [col, ids] of [[$('#eq-left'), LEFT], [$('#eq-right'), RIGHT]]) {
      for (const id of ids) {
        const b = make('e:' + id, 'eq' + (SLOT[id].accepts ? '' : ' locked'));
        b.setAttribute('aria-label', SLOT[id].name);
        col.appendChild(b);
      }
    }
    window.addEventListener('pointermove', (e) => this.moveDrag(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', () => this.cancelDrag());
  }

  show() {
    this.el.classList.remove('hidden');
    this.sel = null;
    this.render();
  }

  close() {
    if (!this.open) return;
    this.cancelDrag();
    this.el.classList.add('hidden');
    this.cb.onClose?.();
  }

  render() {
    const p = this.cb.profile();
    $('#inv-coins').textContent = p.coins;
    $('#inv-count').textContent = `${p.countBag()} / ${BAG}`;
    for (const b of $$('.slot', this.el)) {
      const loc = b.dataset.loc;
      const it = p.get(loc);
      const eq = loc[0] === 'e';
      const id = eq ? loc.slice(2) : null;
      let html = '';
      if (it) html = `<img src="${itemIcon(it.kind)}" alt="${ITEMS[it.kind].name}">`;
      else if (eq) html = `<img class="ghost" src="${slotIcon(id.startsWith('acc') ? 'acc' : id)}" alt="">`;
      if (eq) html += `<span class="tag">${SLOT[id].name}</span>`;
      if (b._html !== html) { b.innerHTML = html; b._html = html; }
      b.classList.toggle('sel', loc === this.sel);
      b.title = it ? ITEMS[it.kind].name : eq ? SLOT[id].name : '';
    }
    this.renderDetail();
  }

  renderDetail() {
    const p = this.cb.profile();
    const d = this.detail;
    if (!this.sel) {
      d.innerHTML = '<p>Tap an item to see it, then tap a slot to move it there, or drag it.</p><p>Swords go in the <b>Weapon</b> slot, the shield in the <b>Offhand</b>, armour in its own slot, and a bracelet or a charm in either <b>Accessory</b> slot.</p>' + this.setLine(p);
      return;
    }
    const loc = this.sel;
    if (loc[0] === 'e' && !p.get(loc)) {
      const s = SLOT[loc.slice(2)];
      d.innerHTML = `<h3>${s.name.toUpperCase()}</h3><p>Empty. ${s.holds} Buy one at the Stall.</p>`;
      return;
    }
    const it = p.get(loc);
    if (!it) { this.sel = null; this.renderDetail(); return; }
    const T = ITEMS[it.kind];
    const worn = loc[0] === 'e';
    const stall = this.cb.atStall();
    d.innerHTML = `
      <h3>${T.name.toUpperCase()}</h3>
      <div><span class="pill">${SLOT_KIND[T.slot]}</span> <span class="pill">${T.marks}</span>${worn ? ' <span class="pill">Equipped</span>' : ''}</div>
      <p>${T.blurb}</p>${T.set ? this.setLine(p) : ''}
      <div class="acts">
        ${worn ? '<button class="btn" data-do="unequip" type="button">TAKE OFF</button>' : '<button class="btn primary" data-do="equip" type="button">EQUIP</button>'}
        ${stall ? `<button class="btn" data-do="sell" type="button">SELL +${T.sell}</button>` : ''}
      </div>
      ${stall ? '' : '<p>Sell it at the Stall, outside the arena.</p>'}`;
    for (const b of $$('[data-do]', d)) b.addEventListener('click', () => this.act(b.dataset.do));
  }

  /** How much of the wood set you have on, and what all four do. */
  setLine(p) {
    const on = ARMOUR.filter((s) => p.d.eq[s] && ITEMS[p.d.eq[s].kind].set === 'wood').length;
    if (!on) return '';
    return `<p class="set-line${on === 4 ? ' full' : ''}">Wood set: ${on} of 4 on. ${on === 4 ? 'You are harder to knock down.' : 'Wear all four to be harder to knock down.'}</p>`;
  }

  act(what) {
    const p = this.cb.profile();
    const loc = this.sel;
    if (!loc) return;
    let res;
    if (what === 'equip') res = p.equip(loc);
    else if (what === 'unequip') res = p.unequip(loc.slice(2));
    else if (what === 'sell') {
      res = p.sell(loc);
      if (res.ok) { this.sound?.sell(); this.cb.toast?.(`Sold ${ITEMS[res.item.kind].name} for ${res.coins} coins`); }
    }
    if (res && res.error) { this.sound?.deny(); this.cb.toast?.(res.error); return; }
    if (what !== 'sell') this.sound?.equip();
    this.sel = null;
    this.render();
    this.cb.onChange?.(what);
  }

  /* -------------------------- tapping and dragging -------------------------- */

  down(e, b) {
    e.preventDefault();
    const loc = b.dataset.loc;
    this.drag = { loc, el: b, x: e.clientX, y: e.clientY, moved: false, ghost: null, id: e.pointerId };
  }

  moveDrag(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const p = this.cb.profile();
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8 || !p.get(d.loc)) return;
      d.moved = true;
      d.ghost = document.createElement('img');
      d.ghost.className = 'drag-ghost';
      d.ghost.src = itemIcon(p.get(d.loc).kind);
      document.body.appendChild(d.ghost);
      d.el.classList.add('dragging');
    }
    d.ghost.style.left = e.clientX + 'px';
    d.ghost.style.top = e.clientY + 'px';
    const over = this.slotAt(e.clientX, e.clientY);
    for (const s of $$('.slot.target', this.el)) if (s !== over) s.classList.remove('target');
    if (over && over !== d.el) over.classList.add('target');
  }

  slotAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el && el.closest ? el.closest('.slot') : null;
  }

  up(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    if (d.moved) {
      const over = this.slotAt(e.clientX, e.clientY);
      this.cleanDrag(d);
      if (over && over.dataset.loc !== d.loc) this.place(d.loc, over.dataset.loc);
      return;
    }
    this.tap(d.loc);
  }

  cleanDrag(d) {
    if (d.ghost) d.ghost.remove();
    d.el.classList.remove('dragging');
    for (const s of $$('.slot.target', this.el)) s.classList.remove('target');
  }

  cancelDrag() {
    if (this.drag) { this.cleanDrag(this.drag); this.drag = null; }
  }

  tap(loc) {
    const p = this.cb.profile();
    this.sound?.click();
    if (this.sel && this.sel !== loc && p.get(this.sel)) {
      this.place(this.sel, loc);
      return;
    }
    // an empty bag slot with nothing in hand: nothing to pick up
    if (!p.get(loc) && loc[0] === 'b') { this.sel = null; this.render(); return; }
    this.sel = this.sel === loc ? null : loc;
    this.render();
  }

  place(from, to) {
    const p = this.cb.profile();
    const res = p.move(from, to);
    if (res.error) {
      this.sound?.deny();
      this.cb.toast?.(res.error);
      this.sel = p.get(to) ? to : this.sel;
      this.render();
      return;
    }
    this.sound?.equip();
    this.sel = null;
    this.render();
    this.cb.onChange?.('move');
  }
}

export { SLOT_NAME };
