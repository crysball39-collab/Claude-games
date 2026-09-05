/* =============================================================================
   In-game HUD. Buttons appear and disappear with the equipped item: the RCV2
   brings its own spawn, shoot and delete controls with it.
   ========================================================================== */
import { $ } from '../core/util.js';

/** What the big button says for each thing you can hold. */
const PRIMARY_LABEL = {
  rcv2: 'SHOOT', machete: 'SLASH', sledge: 'SWING', fists: 'PUNCH',
};

export class Hud {
  constructor(input) {
    this.input = input;
    this.root = $('#hud');
    this.healthFill = $('#health-fill');
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
    this.useBtn = $('#btn-use');
    // the slots that only exist while something is being carried
    this.carrySlots = this.slots.filter((el) => el.id === 'slot-machete' || el.id === 'slot-sledge');

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
    this.slots.forEach((el) => el.classList.toggle('active', el.dataset.weapon === name));
  }

  /** A weapon slot is only there while that weapon is actually in hand. */
  setCarrying(kind) {
    for (const el of this.carrySlots) {
      el.classList.toggle('hidden', el.dataset.weapon !== kind);
    }
  }

  /** USE only appears when it would do something. */
  setUseAvailable(available, carrying) {
    this.useBtn.classList.toggle('show', !!available);
    this.useBtn.textContent = carrying ? 'DROP' : 'USE';
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

  showDeath() { this.death.classList.remove('hidden'); }
  hideDeath() { this.death.classList.add('hidden'); }

  setVisible(v) { this.root.style.display = v ? '' : 'none'; }
}
