/* =============================================================================
   In-game HUD. Buttons appear and disappear with the equipped item: the RCV2
   brings its own spawn, shoot and delete controls with it.
   ========================================================================== */
import { $ } from '../core/util.js';

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

    this.onWeaponSelect = null;
    this.slots.forEach((el, i) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        this.onWeaponSelect?.(i === 0 ? 'fists' : 'rcv2');
      }, { passive: false });
    });
  }

  setWeapon(name) {
    this.primary.textContent = name === 'rcv2' ? 'SHOOT' : 'PUNCH';
    this.extra.classList.toggle('show', name === 'rcv2');
    this.slots.forEach((el) => el.classList.toggle('active', el.dataset.weapon === name));
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
