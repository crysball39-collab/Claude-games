/* =============================================================================
   The HUD: health, stamina and EXP top left, cash top right, Rob's bounty top
   middle, the bag on the right edge, the stick bottom left and the buttons
   under the right thumb. Ore you pick up runs down a feed on the left; rare
   finds and level-ups get the middle of the screen to themselves.
   ========================================================================== */
import { $, money } from '../core/util.js';
import { ORES, RARITIES } from '../game/data.js';
import { oreIcon } from './icons.js';

export class Hud {
  constructor(input) {
    this.input = input;
    this.root = $('#hud');
    this.hpFill = $('#hp-fill');
    this.hpText = $('#hp-text');
    this.stFill = $('#st-fill');
    this.xpFill = $('#xp-fill');
    this.xpText = $('#xp-text');
    this.levelEl = $('#hud-level');
    this.cashEl = $('#cash');
    this.cashText = $('#cash-text');
    this.questEl = $('#quest-track');
    this.interactBtn = $('#btn-interact');
    this.sprintBtn = $('#btn-sprint');
    this.atkIcon = $('#atk-icon');
    this.toastEl = $('#toast');
    this.feed = $('#pickup-feed');
    this.announceEl = $('#announce');
    this.announceBig = $('#announce-big');
    this.announceSmall = $('#announce-small');
    this.bannerEl = $('#area-banner');
    this.vignette = $('#damage-vignette');
    this.saveTag = $('#save-tag');
    this.death = $('#death-overlay');
    this.bagBtn = $('#btn-inventory');

    input.bindButton($('#btn-attack'), 'attack');
    input.bindButton($('#btn-dash'), 'dash');
    input.bindButton(this.interactBtn, 'interact');
    input.bindToggle(this.sprintBtn);
    input.onSprintChange = (on) => this.sprintBtn.classList.toggle('on', on);

    this._k = {};
    this._timers = {};
  }

  /** Only touches the page when a value actually changed. */
  _changed(key, value) {
    if (this._k[key] === value) return false;
    this._k[key] = value;
    return true;
  }

  setVitals(hp, maxHp, stamina, maxSt, exhausted) {
    const h = Math.ceil(hp);
    if (this._changed('hp', h + '/' + maxHp)) {
      this.hpFill.style.width = (Math.max(0, hp / maxHp) * 100).toFixed(1) + '%';
      this.hpText.textContent = `${Math.max(0, h)} / ${maxHp}`;
      this.hpFill.classList.toggle('low', hp / maxHp < 0.3);
    }
    const s = Math.round(stamina);
    if (this._changed('st', s + (exhausted ? 'x' : ''))) {
      this.stFill.style.width = (stamina / maxSt * 100).toFixed(1) + '%';
      this.stFill.classList.toggle('spent', !!exhausted);
    }
  }

  setLevel(level, into, need) {
    if (this._changed('lv', `${level}:${into}:${need}`)) {
      if (this.levelEl.textContent !== String(level) && this._k.lvShown) {
        this.levelEl.parentElement.classList.remove('pop');
        void this.levelEl.offsetWidth;
        this.levelEl.parentElement.classList.add('pop');
      }
      this._k.lvShown = true;
      this.levelEl.textContent = String(level);
      this.xpFill.style.width = (into / need * 100).toFixed(1) + '%';
      this.xpText.textContent = `${into} / ${need} EXP`;
    }
  }

  setCash(n) {
    if (!this._changed('cash', n)) return;
    const had = this._k.cashShown;
    this._k.cashShown = true;
    this.cashText.textContent = money(n);
    if (had) {
      this.cashEl.classList.remove('bump');
      void this.cashEl.offsetWidth;
      this.cashEl.classList.add('bump');
    }
  }

  /** Rob's bounty: null when there is none running. */
  setQuest(q) {
    const key = q ? `${q.kills}/${q.need}` : '';
    if (!this._changed('quest', key)) return;
    if (!q) { this.questEl.classList.add('hidden'); return; }
    this.questEl.classList.remove('hidden');
    const done = q.kills >= q.need;
    this.questEl.classList.toggle('done', done);
    this.questEl.innerHTML = done
      ? 'Rob\'s bounty: <b>done</b> &mdash; go and get paid'
      : `Rob's bounty: skeletons <b>${q.kills} / ${q.need}</b>`;
  }

  /** The context button: TALK beside Rob, ANVIL at the anvil, nothing elsewhere. */
  setInteract(label) {
    if (!this._changed('int', label || '')) return;
    this.interactBtn.classList.toggle('show', !!label);
    this.interactBtn.classList.toggle('long', !!label && label.length > 6);
    if (label) this.interactBtn.textContent = label;
  }

  setAttackIcon(url) {
    if (!this._changed('atk', url || '')) return;
    this.atkIcon.style.backgroundImage = url ? `url(${url})` : '';
  }

  setSprint(on) { this.sprintBtn.classList.toggle('on', !!on); }

  toast(msg, ms = 1800) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this._timers.toast);
    this._timers.toast = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  /** "+1 Iron" running down the left. Repeats of the same ore stack up. */
  pickup(oreId, n = 1) {
    const ore = ORES[oreId];
    const color = RARITIES[ore.rarity].color;
    const last = this.feed.lastElementChild;
    if (last && last.dataset.ore === oreId && Date.now() - (+last.dataset.t) < 1500) {
      last.dataset.n = String(+last.dataset.n + n);
      last.querySelector('b').textContent = `+${last.dataset.n} ${ore.name}`;
      last.dataset.t = String(Date.now());
      clearTimeout(last._t);
      last._t = setTimeout(() => this._fade(last), 2600);
      return;
    }
    const el = document.createElement('div');
    el.className = 'pick';
    el.style.setProperty('--c', color);
    el.dataset.ore = oreId;
    el.dataset.n = String(n);
    el.dataset.t = String(Date.now());
    el.innerHTML = `<img alt="" src="${oreIcon(oreId)}"><b>+${n} ${ore.name}</b><em>${RARITIES[ore.rarity].name.toUpperCase()}</em>`;
    this.feed.appendChild(el);
    while (this.feed.children.length > 5) this.feed.firstElementChild.remove();
    el._t = setTimeout(() => this._fade(el), 2600);
  }

  _fade(el) {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 450);
  }

  /** The middle of the screen: a rare ore, a level, a bounty paid. */
  announce(big, small = '', color = '#ffffff', ms = 2200) {
    // one thing in the middle of the screen at a time
    this.bannerEl.classList.remove('show');
    this.announceBig.textContent = big;
    this.announceSmall.textContent = small;
    this.announceEl.style.setProperty('--c', color);
    this.announceEl.classList.add('show');
    clearTimeout(this._timers.ann);
    this._timers.ann = setTimeout(() => this.announceEl.classList.remove('show'), ms);
  }

  areaBanner(name, sub = '') {
    $('#area-name').textContent = name.toUpperCase();
    $('#area-sub').textContent = sub.toUpperCase();
    this.bannerEl.classList.add('show');
    clearTimeout(this._timers.banner);
    this._timers.banner = setTimeout(() => this.bannerEl.classList.remove('show'), 2400);
  }

  flashDamage(k = 0.6) {
    this.vignette.style.opacity = String(Math.min(0.95, k));
    clearTimeout(this._timers.vig);
    this._timers.vig = setTimeout(() => { this.vignette.style.opacity = '0'; }, 160);
  }

  saved() {
    this.saveTag.classList.add('show');
    clearTimeout(this._timers.save);
    this._timers.save = setTimeout(() => this.saveTag.classList.remove('show'), 1100);
  }

  bumpBag() {
    this.bagBtn.classList.remove('bump');
    void this.bagBtn.offsetWidth;
    this.bagBtn.classList.add('bump');
  }

  showDeath() { this.death.classList.remove('hidden'); }
  hideDeath() { this.death.classList.add('hidden'); }

  setVisible(v) { this.root.style.display = v ? '' : 'none'; }

  /** Everything but the death screen goes while the anvil or Rob has the screen. */
  setBusy(on) { this.root.classList.toggle('hidden-ui', !!on); }
}
