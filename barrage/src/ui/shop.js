/* =============================================================================
   The Stall: swords and a shield, a set of wood armour and two trinkets on
   the counter, and a man who will buy back what you have outgrown for half
   what he sold it for.
   ========================================================================== */
import { $, $$, pick } from '../core/util.js';
import { ITEMS, SHELVES, SLOT_KIND } from '../game/gear.js';
import { itemIcon } from './icons.js';

const LINES = [
  'Wood for the brave. Steel for the rich.',
  'Bring it back bloody, I don\'t mind. I\'ll still buy it.',
  'The shield stops bullets. Mostly.',
  'Half price for anything you\'ve outgrown. Fair\'s fair.',
  'They come out of those tunnels faster every round, you know.',
  'Ten coins for a sword. Fifty if you want it sharp.',
  'Oak armour. Turns a good punch into a sore set of knuckles.',
  'Two charms? Twice the luck. That\'s how luck works.',
];

export class ShopUI {
  constructor({ profile, onChange, onClose, sound, toast }) {
    this.cb = { profile, onChange, onClose, toast };
    this.sound = sound;
    this.el = $('#shop');
    this.tab = 'buy';
    for (const t of $$('.tab', this.el)) t.addEventListener('click', () => { this.tab = t.dataset.tab; this.sound?.click(); this.render(); });
    $('#shop-close').addEventListener('click', () => this.close());
    this.el.addEventListener('pointerdown', (e) => { if (e.target === this.el) this.close(); });
  }

  get open() { return !this.el.classList.contains('hidden'); }

  show() {
    this.el.classList.remove('hidden');
    $('#keeper-line').textContent = `"${pick(LINES)}"`;
    this.render();
  }

  close() {
    if (!this.open) return;
    this.el.classList.add('hidden');
    this.cb.onClose?.();
  }

  render() {
    const p = this.cb.profile();
    $('#shop-coins').textContent = p.coins;
    for (const t of $$('.tab', this.el)) t.classList.toggle('on', t.dataset.tab === this.tab);
    $('#shop-buy').classList.toggle('hidden', this.tab !== 'buy');
    $('#shop-sell').classList.toggle('hidden', this.tab !== 'sell');
    if (this.tab === 'buy') this.renderBuy(p); else this.renderSell(p);
  }

  renderBuy(p) {
    const box = $('#shop-buy');
    box.innerHTML = '';
    for (const shelf of SHELVES) {
      const head = document.createElement('div');
      head.className = 'shelf';
      head.innerHTML = `<h4>${shelf.name.toUpperCase()}</h4>${shelf.note ? `<span>${shelf.note}</span>` : ''}`;
      box.appendChild(head);
      for (const kind of shelf.kinds) this.renderWare(box, p, kind);
    }
    for (const b of $$('[data-buy]', box)) b.addEventListener('click', () => this.buy(b.dataset.buy));
  }

  renderWare(box, p, kind) {
    const T = ITEMS[kind];
    const owned = p.owns(kind);
    const card = document.createElement('article');
    card.className = 'ware' + (owned ? ' owned' : '');
    card.dataset.kind = kind;
    const stats = T.stats.map(([n, v]) => `<div class="stat"><span>${n}</span><span class="pips">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= v ? 'on' : ''}"></i>`).join('')}</span></div>`).join('');
    card.innerHTML = `
      <div class="pic"><img src="${itemIcon(kind)}" alt=""></div>
      <div class="head">
        <h3>${T.name.toUpperCase()}</h3>
        <div><span class="pill">${SLOT_KIND[T.slot]} slot</span>${owned ? ' <span class="pill">Owned</span>' : ''}</div>
      </div>
      <p>${T.blurb}</p>
      <div class="stats">${stats}</div>
      <div class="buy">
        <div class="price"><span class="coin-icon"></span>${T.price}</div>
        <button class="btn ${p.coins >= T.price ? 'primary' : ''}" type="button" data-buy="${kind}">${p.coins >= T.price ? 'BUY' : `NEED ${T.price - p.coins} MORE`}</button>
      </div>`;
    box.appendChild(card);
  }

  renderSell(p) {
    const box = $('#shop-sell');
    box.innerHTML = '';
    const all = p.all();
    if (!all.length) {
      box.innerHTML = '<div class="empty">You have nothing to sell. Whatever you buy here, I\'ll take back for half.</div>';
      return;
    }
    for (const { loc, item } of all) {
      const T = ITEMS[item.kind];
      const row = document.createElement('div');
      row.className = 'sell-row';
      row.innerHTML = `
        <img src="${itemIcon(item.kind)}" alt="">
        <div class="name">${T.name}<small>${loc[0] === 'e' ? 'Equipped' : 'In your bag'}</small></div>
        <div class="price"><span class="coin-icon"></span>${T.sell}</div>
        <button class="btn" type="button" data-sell="${loc}">SELL</button>`;
      box.appendChild(row);
    }
    for (const b of $$('[data-sell]', box)) b.addEventListener('click', () => this.sell(b.dataset.sell));
  }

  buy(kind) {
    const p = this.cb.profile();
    const res = p.buy(kind);
    if (res.error) { this.sound?.deny(); this.cb.toast?.(res.error); this.render(); return; }
    this.sound?.buy();
    const T = ITEMS[kind];
    const where = T.slot === 'accessory' ? 'an accessory slot' : `your ${SLOT_KIND[T.slot].toLowerCase()} slot`;
    this.cb.toast?.(`${T.name} is in your bag. Open the bag to put it in ${where}.`, 3.6);
    this.render();
    this.cb.onChange?.('buy', kind);
  }

  sell(loc) {
    const p = this.cb.profile();
    const res = p.sell(loc);
    if (res.error) { this.sound?.deny(); this.cb.toast?.(res.error); return; }
    this.sound?.sell();
    this.cb.toast?.(`Sold ${ITEMS[res.item.kind].name} for ${res.coins} coins`);
    this.render();
    this.cb.onChange?.('sell');
  }
}
