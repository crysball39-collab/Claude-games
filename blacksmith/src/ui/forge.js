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

   FORGE starts the forging game, and this draws its controls: the handle to
   drag down (the chain that tips the lava, then the gear into the water),
   and the TAP button with a white ring closing on its green one. The game
   owns the state; this shows it every frame and passes on the fingers.
   ========================================================================== */
import { $, $$, clamp01 } from '../core/util.js';
import {
  ORES, ORE_ORDER, RARITIES, RECIPES, PART_NAMES, recipe, rankSlots, partsOf, itemStats, itemName, itemRarity, rankOf,
} from '../game/data.js';
import { oreIcon, recipeIcon, itemIcon } from './icons.js';
import { describeItem } from './inventory.js';

const SHORT = { dagger: 'Dagger', sword: 'Straight-Sword', broadsword: 'Broadsword', helmet: 'Helmet', chestplate: 'Chestplate', leggings: 'Leggings', boots: 'Boots' };
const empty = () => ({ ore: null, amount: 0 });

/** Which of the three steps each moment of the forging belongs to. */
const STEPS = ['pour', 'hammer', 'quench'];
const STEP_OF = { pour: 'pour', cast: 'pour', hammer: 'hammer', ranked: 'hammer', quench: 'quench', cool: 'quench', out: 'quench', reveal: 'quench', done: 'quench' };
/** The rings' drawing units to one radius of the TAP button. */
const RING_UNITS = 30;

function hintFor(c) {
  switch (c.phase) {
    case 'pour':
      if (c.full) return 'Full! The bucket swings back by itself';
      return c.fill > 0 ? 'Keep pulling until the mould is full' : 'Drag the chain down to tip the lava into the mould';
    case 'cast': return 'Out of the mould and onto the anvil';
    case 'hammer': return 'Tap TAP as the white ring meets the green one';
    case 'ranked': return '';
    case 'quench': return c.ready ? 'Drag it down into the water' : 'Over to the water';
    case 'cool': return 'Cooling in the water';
    default: return 'Out it comes';
  }
}

export class ForgeUI {
  constructor(profile, { onForge, onClose, onEquip, onType, onPull, onStrike }) {
    this.profile = profile;
    this.cb = { onForge, onClose, onEquip, onType, onPull, onStrike };
    this.root = $('#forge');
    this.card = $('#forge-card');
    this.recipesEl = $('#recipes');
    this.bodyEl = this.card.querySelector('.forge-body');
    this.slotsEl = $('#slots');
    this.needEl = $('#forge-need');
    this.previewEl = $('#forge-preview');
    this.forgeBtn = $('#btn-forge');
    this.picker = $('#ore-picker');
    this.pickerTitle = $('#op-title');
    this.pickerGrid = $('#op-grid');
    this.result = $('#forged');
    this.game = $('#fgame');
    this.g = {
      steps: $$('#fg-steps span'), hint: $('#fg-hint'),
      meter: $('#fg-meter'), meterLabel: $('#fg-meter-label'), meterFill: $('#fg-meter-fill'), meterPct: $('#fg-meter-pct'),
      dotsBox: $('#fg-dots'), dots: $$('#fg-dots i'),
      pull: $('#fg-pull'), chain: $('#fg-chain'), handle: $('#fg-handle'), handleLabel: $('#fg-handle-label'),
      zone: $('#fg-tapzone'), white: $('#fg-white'), tap: $('#fg-tap'), grade: $('#fg-grade'), rank: $('#fg-rank'),
    };
    this._phase = null;
    this._handleK = 0;
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
    this._wireGame();
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
    this.game.classList.add('hidden');
    this.result.classList.add('hidden');
    this._clampToOwned();
    this.render();
    this.cb.onType?.(this.type);
    this._measure();
    // on a short screen the recipes are one row that scrolls: bring the chosen one into it
    const rc = this.recipesEl, chip = rc.querySelector('.sel');
    if (chip && rc.scrollWidth > rc.clientWidth) {
      const a = rc.getBoundingClientRect(), b = chip.getBoundingClientRect();
      rc.scrollLeft += (b.left + b.width / 2) - (a.left + a.width / 2);
    }
    this._edges();
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
      el.innerHTML = `<img alt="" src="${recipeIcon(type)}"><span class="rt"><span class="rn">${SHORT[type]}</span>` +
        `<small><i>${r.weight} &middot; </i>${r.ores}+ ore</small></span>`;
      el.addEventListener('click', () => { this.type = type; this._clampToOwned(); this.render(); this.cb.onType?.(type); });
      this.recipesEl.appendChild(el);
    }
    // on a short screen the recipes are one row that scrolls sideways, and with big text the
    // slots may have to scroll too: each fades out at its edge while there is more to see
    this.recipesEl.addEventListener('scroll', () => this._edges(), { passive: true });
    this.bodyEl.addEventListener('scroll', () => this._edges(), { passive: true });
    this.slotsEl.innerHTML = '';
    this.slotEls = this.slots.map((_, i) => {
      const el = document.createElement('div');
      el.className = 'slot';
      // the ore, its name and the part it will make, all one big button for choosing the
      // ore; then the count, and ALL. Each sits in the flow beside or under the last (a
      // column on a tall screen, a row on a short one), so nothing can land on anything else.
      el.innerHTML =
        `<button class="spick"><span class="sicon"></span><span class="stext"><span class="sname"></span><span class="spart"></span></span></button>` +
        `<span class="samt"><button data-d="-1" aria-label="Less">&minus;</button><b></b><button data-d="1" aria-label="More">+</button></span>` +
        `<button class="sall off" title="Put in all you have">ALL</button>`;
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
        v.all.classList.toggle('off', !ore);
      }
      const have = ore ? this.profile.ores[s.ore] || 0 : 0;
      v.amt.textContent = ore ? s.amount : 0;
      v.amt.classList.toggle('long', s.amount >= 1000);
      v.minus.classList.toggle('off', !ore);
      v.plus.classList.toggle('off', !!ore && s.amount >= have);
      v.part.textContent = roles.get(i) || '';
    });

    // the preview: always two lines, each cut short rather than wrapped, so it can never grow
    // up into the slots
    const mix = this.mix();
    if (mix.length) {
      const item = { kind: R.kind, type: this.type, mix };
      const rar = itemRarity(item);
      const st = itemStats(item);
      const stat = R.kind === 'weapon' ? `Damage <b>${st.damage}</b>` : `Defense <b>${st.defense}</b>`;
      const extra = st.bonus > 1.005 ? ` &middot; <span class="pbonus">+${Math.round((st.bonus - 1) * 100)}% for extra ore</span>` : '';
      const line = total < need
        ? `<span class="pshort">${need - total} more ore</span> &middot; ${stat}`
        : `${stat} &middot; <span style="color:${RARITIES[rar].color}">${RARITIES[rar].name}</span>${extra}`;
      this.previewEl.innerHTML =
        `<div class="picon r-${rar}"><img alt="" src="${recipeIcon(this.type, partsOf(mix))}"></div>` +
        `<div class="ptext"><b class="pname">${itemName(item)}</b><span class="pline">${line}</span></div>`;
    } else {
      this.previewEl.innerHTML = `<div class="picon"><img alt="" src="${recipeIcon(this.type)}"></div>` +
        `<div class="ptext"><b class="pname">${R.weight} ${SHORT[this.type]}</b><span class="pline">Put ${need} or more ore in the slots</span></div>`;
    }
    this.forgeBtn.disabled = total < need || !this.profile.hasOres(mix);
    this._edges();
  }

  _edges() {
    const rc = this.recipesEl, fb = this.bodyEl;
    rc.classList.toggle('end', rc.scrollLeft + rc.clientWidth >= rc.scrollWidth - 2);
    fb.classList.toggle('more', fb.scrollTop + fb.clientHeight < fb.scrollHeight - 2);
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
    this.pickerTitle.textContent = cur.ore ? `CHANGE THE ${ORES[cur.ore].name.toUpperCase()}` : 'CHOOSE AN ORE';
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
        (cur.ore === id ? '<span class="otag">IN THIS SLOT</span>' : j >= 0 ? '<span class="otag">SWAPS SLOTS</span>' : '');
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

  /* ------------------------------ the forging game ------------------------------ */

  _wireGame() {
    const g = this.g;
    // the handle: a finger on it drags it from where it is; anywhere else on its track, it jumps to the finger
    let drag = null;
    const travel = () => Math.max(1, g.pull.clientHeight - g.handle.offsetHeight);
    const at = (e) => clamp01((e.clientY - drag.y0) / travel());
    g.pull.addEventListener('pointerdown', (e) => {
      if (g.pull.classList.contains('off') || (e.button ?? 0) > 0) return;
      e.preventDefault();
      try { g.pull.setPointerCapture(e.pointerId); } catch { /* not every pointer can be captured */ }
      const h = g.handle.getBoundingClientRect();
      const onHandle = e.clientY >= h.top && e.clientY <= h.bottom;
      drag = { id: e.pointerId, y0: onHandle ? e.clientY - this._handleK * travel() : g.pull.getBoundingClientRect().top + g.handle.offsetHeight / 2 };
      g.pull.classList.add('held');
      this.cb.onPull?.(at(e));
    });
    g.pull.addEventListener('pointermove', (e) => {
      if (drag && e.pointerId === drag.id) this.cb.onPull?.(at(e));
    });
    const release = (e) => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      drag = null;
      g.pull.classList.remove('held');
      this.cb.onPull?.(0);
    };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) g.pull.addEventListener(ev, release);
    this._releasePull = () => release();
    // TAP counts the moment the finger lands, not when it lifts
    g.tap.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!this.cb.onStrike?.()) return;
      g.tap.classList.add('hit');
      setTimeout(() => g.tap.classList.remove('hit'), 120);
    });
  }

  /** FORGE was pressed: the menu steps aside for the forging. */
  startGame() {
    this._stopHold();
    this._closePicker();
    this.card.classList.add('hidden');
    this.result.classList.add('hidden');
    this.game.classList.remove('hidden');
    this.g.rank.classList.add('hidden');
    this.g.grade.classList.remove('pop');
    for (const d of this.g.dots) { d.style.background = ''; d.style.borderColor = ''; }
    this._phase = null;
    this._handleK = 0;
  }

  /** Every frame of the forging: which step, what to do, the meter, the handle and the white ring. */
  updateGame(c) {
    const g = this.g;
    if (c.phase !== this._phase) {
      this._phase = c.phase;
      const now = STEPS.indexOf(STEP_OF[c.phase]);
      for (const s of g.steps) {
        const i = STEPS.indexOf(s.dataset.step);
        s.classList.toggle('on', i === now);
        s.classList.toggle('done', i < now);
      }
      g.dotsBox.classList.toggle('hidden', STEP_OF[c.phase] !== 'hammer');
      g.zone.classList.toggle('hidden', c.phase !== 'hammer');
      g.pull.classList.toggle('hidden', !['pour', 'quench', 'cool', 'out'].includes(c.phase));
      g.pull.classList.toggle('dip', c.phase !== 'pour');
      g.handleLabel.textContent = c.phase === 'pour' ? 'PULL' : 'DIP';
      if (c.phase !== 'ranked') g.rank.classList.add('hidden');
    }
    this._text(g.hint, hintFor(c));
    // the meter: the mould filling, then the metal cooling
    const m = c.phase === 'pour' ? ['MOULD', c.fill] : c.phase === 'cool' ? ['COOLING', c.cooled || 0] : c.phase === 'out' ? ['COOLING', 1] : null;
    g.meter.classList.toggle('hidden', !m);
    if (m) {
      g.meter.classList.toggle('cool', m[0] === 'COOLING');
      this._text(g.meterLabel, m[0]);
      g.meterFill.style.width = (m[1] * 100).toFixed(1) + '%';
      this._text(g.meterPct, Math.floor(m[1] * 100) + '%');
    }
    // the handle sits where the game has it: under the finger, until the game takes over
    if (!g.pull.classList.contains('hidden')) {
      const live = (c.phase === 'pour' && !c.full) || (c.phase === 'quench' && c.ready);
      g.pull.classList.toggle('off', !live);
      if (!live) this._releasePull();
      const k = c.phase === 'pour' ? c.pull : c.dip;
      this._handleK = k;
      const travel = g.pull.clientHeight - g.handle.offsetHeight;
      g.handle.style.transform = `translateY(${(k * travel).toFixed(1)}px)`;
      g.chain.style.height = (k * travel + g.handle.offsetHeight / 2).toFixed(1) + 'px';
    }
    // the white ring, closing on the button
    if (c.phase === 'hammer') {
      g.white.classList.toggle('off', c.r == null);
      if (c.r != null) g.white.setAttribute('r', (c.r * RING_UNITS).toFixed(2));
    }
  }

  _text(el, s) { if (el.textContent !== s) el.textContent = s; }

  /** How a blow went: the word, big, by the button, and its dot filled in. */
  showGrade(grade, n) {
    const g = this.g;
    g.grade.textContent = grade.name.toUpperCase() + (grade.id === 'perfect' ? '!' : '');
    g.grade.style.color = grade.color;
    g.grade.classList.remove('pop');
    void g.grade.offsetWidth;          // so the animation starts again
    g.grade.classList.add('pop');
    const d = g.dots[n - 1];
    if (d) { d.style.background = grade.color; d.style.borderColor = grade.color; }
  }

  /** The five blows done: what the gear's rank is. */
  showRank(rank, score) {
    const g = this.g;
    g.rank.style.setProperty('--c', rank.color);
    g.rank.innerHTML = `<small>RANK</small><b>${rank.name.toUpperCase()}</b><span>${score}%</span>`;
    g.rank.classList.remove('hidden');
  }

  endGame() {
    this._releasePull();
    this.game.classList.add('hidden');
    this.g.rank.classList.add('hidden');
  }

  showResult(item) {
    this.lastItem = item;
    this.game.classList.add('hidden');
    const rar = itemRarity(item);
    const rank = rankOf(item.rank);
    const card = this.result.querySelector('.forged-card');
    card.className = 'forged-card r-' + rar;
    $('#forged-title').innerHTML = rank ? `<span style="color:${rank.color}">${rank.name.toUpperCase()}</span> <small>${item.rank}%</small>` : 'FORGED!';
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
