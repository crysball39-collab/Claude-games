/* =============================================================================
   Loading screens. Two of them: the boot screen (engine warm-up) and the map
   screen (world build). Both are driven by a small task runner so the bar
   moves for real work instead of on a timer.
   ========================================================================== */
import { $, yieldToPaint, clamp01 } from './util.js';

const BOOT_TIPS = [
  'Everything you spawn is simulated. Nothing here is decoration.',
  'The RCV2 pulls reality apart. Point it at anything that moves.',
  'Punches land where your fist actually is. Aim with your body.',
  'Citizens remember who hit them.',
  'Bruises come from fists. Blood needs something worse.',
  'A ragdoll is not a corpse. They can still crawl.',
];

const MAP_TIPS = [
  'Tap the three lines in the top left to open the spawn menu.',
  'Equip the RCV2, then press + to spawn the selected item.',
  'Shoot the RCV2 at a crate, a boulder or a citizen to carry it.',
  'Boulders roll. Push one down a slope and stay out of the way.',
  'Citizens with nerve will fight back. Cowards run.',
  'Knock someone down and they will try to stand up again.',
  'Clothes tear where the damage lands.',
];

class LoadingScreen {
  constructor(rootId, barId, statusId, tipId, tips) {
    this.root = $('#' + rootId);
    this.bar = $('#' + barId);
    this.status = $('#' + statusId);
    this.tipEl = $('#' + tipId);
    this.tips = tips;
    this.tipTimer = 0;
    this._interval = null;
  }

  show(statusText = '') {
    this.root.classList.add('active');
    this.setProgress(0, statusText);
    this._cycleTip();
    clearInterval(this._interval);
    this._interval = setInterval(() => this._cycleTip(), 3600);
  }

  _cycleTip() {
    if (!this.tipEl || !this.tips.length) return;
    const t = this.tips[Math.floor(Math.random() * this.tips.length)];
    this.tipEl.style.opacity = '0';
    setTimeout(() => { this.tipEl.textContent = t; this.tipEl.style.opacity = '1'; }, 180);
  }

  setProgress(p, statusText) {
    if (this.bar) this.bar.style.width = (clamp01(p) * 100).toFixed(1) + '%';
    if (statusText != null && this.status) this.status.textContent = statusText;
  }

  hide() {
    clearInterval(this._interval);
    this._interval = null;
    this.root.classList.remove('active');
  }

  /**
   * Runs an ordered list of [label, fn] steps, painting the progress bar
   * between each one so the screen is honest about what it is doing.
   */
  async run(steps) {
    const total = steps.length;
    this.setProgress(0, steps.length ? steps[0][0] : '');
    await yieldToPaint();
    const results = [];
    for (let i = 0; i < total; i++) {
      const [label, fn] = steps[i];
      this.setProgress(i / total, label);
      await yieldToPaint();
      results.push(await fn());
      this.setProgress((i + 1) / total, label);
    }
    this.setProgress(1, 'Ready');
    await yieldToPaint();
    return results;
  }
}

export const bootScreen = new LoadingScreen('boot-screen', 'boot-bar', 'boot-status', 'boot-tip', BOOT_TIPS);
export const mapScreen = new LoadingScreen('map-screen', 'map-bar', 'map-status', 'map-tip', MAP_TIPS);
