/* =============================================================================
   The Stall: swords, a bow and arrows for it, a shield, a set of wood armour
   and trinkets on the counter, and a man who will buy back what you have
   outgrown for half what he sold it for (not arrows: those you keep).
   ========================================================================== */
import { $, $$, pick } from '../core/util.js';
import { ITEMS, SHELVES, SLOT_KIND, RARITY, ARROWS } from '../game/gear.js';
import { itemIcon, mysteryIcon } from './icons.js';

/** 25000 as 25,000. */
export const coinsText = (n) => n.toLocaleString('en-US');

/** A rarity's pill, coloured. */
export const rarityPill = (T) => (T.rarity ? `<span class="pill rarity r-${T.rarity}">${RARITY[T.rarity].name}</span>` : '');

const LINES = [
  'Wood for the brave. Steel for the rich.',
  'Bring it back bloody, I don\'t mind. I\'ll still buy it.',
  'The shield stops arrows. Mostly.',
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
    $('#shop-coins').textContent = p.infinite ? '∞' : coinsText(p.coins);
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
    if (kind === 'arrows') { this.renderArrows(box, p); return; }
    const T = ITEMS[kind];
    const owned = p.owns(kind);
    const card = document.createElement('article');
    card.className = 'ware' + (owned ? ' owned' : '') + (T.rarity ? ` r-${T.rarity}` : '');
    card.dataset.kind = kind;
    // the Secret one is not on the counter: until you have one, it is only a shape under a cloth
    if (T.secret && !owned) {
      card.classList.add('mystery');
      card.innerHTML = `
        <div class="pic"><img src="${mysteryIcon()}" alt=""></div>
        <div class="head"><h3>???</h3><div>${rarityPill(T)}</div></div>
        <p>Something long under a cloth. "Not for sale. Not to you, not to anyone. A champion might be carrying one, if you are lucky."</p>
        <div class="buy"><div class="price">NOT FOR SALE</div></div>`;
      box.appendChild(card);
      return;
    }
    const pips = T.slot === 'weapon' ? 10 : 5;
    const stats = T.stats.map(([n, v]) => `<div class="stat"><span>${n}</span><span class="pips">${Array.from({ length: pips }, (_, i) => `<i class="${i < v ? 'on' : ''}"></i>`).join('')}</span></div>`).join('');
    const free = p.infinite;
    const can = T.price != null && (free || p.coins >= T.price);
    card.innerHTML = `
      <div class="pic"><img src="${itemIcon(kind)}" alt=""></div>
      <div class="head">
        <h3 class="name">${T.name.toUpperCase()}</h3>
        <div>${rarityPill(T)} <span class="pill">${SLOT_KIND[T.slot]} slot</span>${owned ? ' <span class="pill">Owned</span>' : ''}</div>
      </div>
      <p>${T.blurb}</p>
      <div class="stats">${stats}</div>
      <div class="buy">
        ${T.price == null ? '<div class="price">NOT FOR SALE</div>' : `<div class="price"><span class="coin-icon"></span>${coinsText(T.price)}</div>
        <button class="btn ${can ? 'primary' : ''}" type="button" data-buy="${kind}">${can ? 'BUY' : `NEED ${coinsText(T.price - p.coins)} MORE`}</button>`}
      </div>`;
    box.appendChild(card);
  }

  /** Arrows: a bundle at a time, and how many you have. */
  renderArrows(box, p) {
    const can = p.infinite || p.coins >= ARROWS.price;
    const card = document.createElement('article');
    card.className = 'ware';
    card.dataset.kind = 'arrows';
    card.innerHTML = `
      <div class="pic"><img src="${itemIcon('arrows')}" alt=""></div>
      <div class="head">
        <h3 class="name">ARROWS ×${ARROWS.bundle}</h3>
        <div><span class="pill">For the bow</span> <span class="pill" id="arrow-have">You have ${p.d.arrows}</span></div>
      </div>
      <p>Ash shafts, iron heads, goose-feather flights. Each one you loose is gone for good.</p>
      <div class="buy">
        <div class="price"><span class="coin-icon"></span>${ARROWS.price}</div>
        <button class="btn ${can ? 'primary' : ''}" type="button" data-buy="arrows">${can ? `BUY ${ARROWS.bundle}` : `NEED ${ARROWS.price - p.coins} MORE`}</button>
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
      row.className = 'sell-row' + (T.rarity ? ` r-${T.rarity}` : '');
      row.innerHTML = `
        <img src="${itemIcon(item.kind)}" alt="">
        <div class="name">${T.name}<small>${T.rarity ? RARITY[T.rarity].name + ' · ' : ''}${loc[0] === 'e' ? 'Equipped' : 'In your bag'}</small></div>
        <div class="price"><span class="coin-icon"></span>${coinsText(T.sell)}</div>
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
    if (kind === 'arrows') {
      this.cb.toast?.(`${ARROWS.bundle} more arrows: you have ${res.arrows}.`, 2.6);
    } else {
      const T = ITEMS[kind];
      const where = T.slot === 'accessory' ? 'an accessory slot' : `your ${SLOT_KIND[T.slot].toLowerCase()} slot`;
      this.cb.toast?.(`${T.name} is in your bag. Open the bag to put it in ${where}.`, 3.6);
    }
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
