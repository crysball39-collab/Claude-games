/* =============================================================================
   In-game HUD. Buttons appear and disappear with the equipped item: the RCV2
   brings its own spawn, shoot and delete controls with it.
   ========================================================================== */
import { $, IS_TOUCH } from '../core/util.js';

/** What the big button says for each thing you can hold. */
const PRIMARY_LABEL = {
  rcv2: 'SHOOT', machete: 'SLASH', sledge: 'SWING', crowbar: 'SWING', fists: 'PUNCH',
  glock: 'FIRE', ak47: 'FIRE', m16: 'FIRE', firefist: 'PUNCH', flamethrower: 'BURN', mossberg: 'FIRE',
};
/** Which slots only exist while that weapon is actually being carried. */
const CARRY_SLOTS = ['slot-machete', 'slot-sledge', 'slot-crowbar',
  'slot-glock', 'slot-ak47', 'slot-m16', 'slot-flamethrower', 'slot-mossberg'];
const GUN_SLOTS = new Set(['glock', 'ak47', 'm16', 'flamethrower', 'mossberg']);

export class Hud {
  constructor(input) {
    this.input = input;
    this.root = $('#hud');
    this.healthFill = $('#health-fill');
    this.armourWrap = $('#armour-wrap');
    this.armourFill = $('#armour-fill');
    this.airWrap = $('#air-wrap');
    this.airFill = $('#air-fill');
    this._air = -2;
    this._armour = -1;
    this.crosshair = $('#crosshair');
    this.grabTag = $('#grab-tag');
    this.primary = $('#btn-primary');
    this.extra = $('#rcv2-extra');
    this.toastEl = $('#toast');
    this.vignette = $('#damage-vignette');
    this.blindEl = $('#blind-overlay');
    this._blind = -1;
    this.death = $('#death-overlay');
    this.selectedWrap = $('#selected-spawn');
    this.selectedName = $('#selected-name');
    this.slots = Array.from(document.querySelectorAll('.wslot'));

    this._toastTimer = 0;
    this._vigTimer = 0;
    this._grabbing = false;

    input.bindButton($('#btn-jump'), 'jump');
    input.bindButton($('#btn-crouch'), 'crouch');
    input.bindButton(this.primary, 'primary');
    input.bindButton($('#btn-spawn'), 'spawn');
    input.bindButton($('#btn-delete'), 'delete');
    input.bindButton($('#btn-use'), 'use');
    input.bindButton($('#btn-reload'), 'reload');
    input.bindButton($('#btn-fireball'), 'fireball');
    input.bindButton($('#btn-skip'), 'skip');
    this.fireExtra = $('#firefist-extra');
    this.fireSlot = $('#slot-firefist');
    this.bossBar = $('#boss-bar');
    this.bossName = $('#boss-name');
    this.bossFill = $('#boss-fill');
    this.bossLag = $('#boss-lag');
    this._boss = -1;
    this.burnEl = $('#burn-overlay');
    this._burn = -1;
    this.cutsceneEl = $('#cutscene');
    this.csTitle = $('#cs-title');
    this.csName = $('#cs-name');
    this.csSub = $('#cs-sub');
    // on a keyboard the skip button cannot be clicked under pointer lock
    $('#btn-skip').textContent = IS_TOUCH ? 'SKIP' : 'SKIP  [SPACE]';
    this.useBtn = $('#btn-use');
    this.reloadBtn = $('#btn-reload');
    this.ammoEl = $('#ammo-readout');
    this.ammoNow = $('#ammo-now');
    this.ammoMax = $('#ammo-max');
    this._ammo = -1;
    // the slots that only exist while something is being carried
    this.carrySlots = this.slots.filter((el) => CARRY_SLOTS.includes(el.id));

    this.onWeaponSelect = null;
    this.slots.forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        this.onWeaponSelect?.(el.dataset.weapon);
      }, { passive: false });
    });
  }

  setWeapon(name) {
    this.primary.textContent = PRIMARY_LABEL[name] || 'PUNCH';
    this.extra.classList.toggle('show', name === 'rcv2');
    this.fireExtra.classList.toggle('show', name === 'firefist');
    this.reloadBtn.classList.toggle('show', GUN_SLOTS.has(name));
    this.slots.forEach((el) => el.classList.toggle('active', el.dataset.weapon === name));
  }

  /** Rounds left. Pass null when what is in hand does not take any. */
  setAmmo(now, max = 0, reloading = false) {
    const key = now == null ? -1 : now + max * 1000 + (reloading ? 1e7 : 0);
    if (key === this._ammo) return;
    this._ammo = key;
    if (now == null) { this.ammoEl.classList.add('hidden'); return; }
    this.ammoEl.classList.remove('hidden');
    this.ammoNow.textContent = String(now);
    this.ammoMax.textContent = '/' + max;
    this.ammoEl.classList.toggle('low', now > 0 && now <= Math.max(3, max * 0.25));
    this.ammoEl.classList.toggle('empty', now === 0);
    this.ammoEl.classList.toggle('reloading', reloading);
    this.reloadBtn.classList.toggle('busy', reloading);
  }

  /** A weapon slot is only there while that weapon is actually in hand. */
  setCarrying(kind) {
    for (const el of this.carrySlots) {
      el.classList.toggle('hidden', el.dataset.weapon !== kind);
    }
  }

  /** USE only appears when it would do something, and says what. */
  setUseAvailable(available, label = 'USE') {
    this.useBtn.classList.toggle('show', !!available);
    if (this.useBtn.textContent !== label) this.useBtn.textContent = label;
  }

  /** The camera is under water. */
  setUnderwater(on) {
    if (on === this._under) return;
    this._under = on;
    (this._uw || (this._uw = $('#underwater'))).classList.toggle('on', !!on);
  }

  /** Breath left, 0..1, or null to hide the bar. */
  setAir(now) {
    const key = now == null ? -1 : Math.round(now * 200);
    if (key === this._air) return;
    this._air = key;
    if (now == null) { this.airWrap.classList.add('hidden'); return; }
    this.airWrap.classList.remove('hidden');
    this.airFill.style.width = (Math.max(0, Math.min(1, now)) * 100).toFixed(1) + '%';
    this.airWrap.classList.toggle('low', now < 0.25);
  }

  /** The vest's integrity bar. Pass null when nothing is being worn. */
  setArmour(now, max = 0) {
    const key = now == null ? -1 : Math.round(now) + max * 1000;
    if (key === this._armour) return;
    this._armour = key;
    if (now == null) { this.armourWrap.classList.add('hidden'); return; }
    this.armourWrap.classList.remove('hidden');
    const f = max > 0 ? Math.max(0, Math.min(1, now / max)) : 0;
    this.armourFill.style.width = (f * 100).toFixed(1) + '%';
    this.armourWrap.classList.toggle('spent', now <= 0);
  }

  /** How much of the view your own eyes have stopped delivering. */
  setBlindness(v) {
    const b = Math.max(0, Math.min(1, v));
    if (Math.abs(b - this._blind) < 0.02) return;
    this._blind = b;
    // Half sight is a dimming; no sight is no picture at all.
    this.blindEl.style.opacity = b < 0.05 ? '0' : (0.25 + b * 0.75).toFixed(2);
  }

  setHealth(frac) {
    const pct = Math.max(0, Math.min(1, frac)) * 100;
    this.healthFill.style.width = pct.toFixed(1) + '%';
    this.healthFill.style.background = pct < 30
      ? 'linear-gradient(90deg,#7a0d0d,#c4161c)'
      : 'linear-gradient(90deg,#c4161c,#f0574c)';
  }

  setCrosshairActive(active) {
    this.crosshair.classList.toggle('grab', !!active);
  }

  setGrabbing(v) {
    if (v === this._grabbing) return;
    this._grabbing = v;
    this.grabTag.classList.toggle('hidden', !v);
  }

  setSelectedItem(name) {
    this.selectedName.textContent = name;
    this.selectedWrap.classList.remove('hidden');
  }

  toast(msg, ms = 1400) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  flashDamage(intensity = 0.5) {
    this.vignette.style.opacity = String(Math.min(0.95, intensity));
    clearTimeout(this._vigTimer);
    this._vigTimer = setTimeout(() => { this.vignette.style.opacity = '0'; }, 130);
  }

  /** The Fire Fist's slot is there once it has been earned. */
  setFireFist(unlocked) {
    this.fireSlot.classList.toggle('hidden', !unlocked);
  }

  /** A boss's name and what is left of him. */
  setBoss(name, hp, max) {
    this.bossBar.classList.remove('hidden');
    this.root.classList.add('boss');
    if (this.bossName.textContent !== name) this.bossName.textContent = name;
    const f = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
    const key = Math.round(f * 1000);
    if (key === this._boss) return;
    this._boss = key;
    const w = (f * 100).toFixed(1) + '%';
    this.bossFill.style.width = w;
    this.bossLag.style.width = w;
  }

  hideBoss() {
    this.bossBar.classList.add('hidden');
    this.root.classList.remove('boss');
    this._boss = -1;
  }

  /** Black bars, nothing else on screen, and a SKIP button. */
  setCutscene(on) {
    this.cutsceneEl.classList.toggle('on', !!on);
    this.root.classList.toggle('cutscene', !!on);
    if (on) {
      // whatever was being said before it started is not part of it
      clearTimeout(this._toastTimer);
      this.toastEl.classList.remove('show');
    } else {
      this.hideTitle();
    }
  }

  showTitle(name, sub = '') {
    this.csName.textContent = name;
    this.csSub.textContent = sub;
    this.csTitle.classList.add('show');
  }

  hideTitle() { this.csTitle.classList.remove('show'); }

  /** How much of you is on fire, 0..1. */
  setBurning(v) {
    const b = Math.max(0, Math.min(1, v));
    if (Math.abs(b - this._burn) < 0.03) return;
    this._burn = b;
    this.burnEl.style.opacity = b < 0.03 ? '0' : (0.35 + b * 0.65).toFixed(2);
  }

  showDeath() { this.death.classList.remove('hidden'); }
  hideDeath() { this.death.classList.add('hidden'); }

  setVisible(v) { this.root.style.display = v ? '' : 'none'; }
}
