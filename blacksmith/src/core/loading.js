/* =============================================================================
   The loading screen. One of them, used twice: once while the engine warms up
   and once while the world is built. It runs a list of real steps, so the bar
   only moves when something has actually been done.
   ========================================================================== */
import { $, yieldToPaint, clamp01 } from './util.js';

const TIPS = [
  'The ore you put the most of becomes the blade.',
  'An anvil takes as much ore as you give it. Extra ore makes it stronger.',
  'Boulders need a Stone Pickaxe: $1,000 on the pickaxe wall by the cave.',
  'Rob pays $1,000 and 100 EXP for every three skeletons.',
  'Irisite turns up once in three hundred ores. Keep swinging.',
  'Dash through a skeleton\'s stab and it cannot touch you.',
  'Dying costs nothing. Not an ore, not a dollar.',
  'Skeletons sometimes leave their bones behind. Bones forge, too.',
  'A pebble breaks into two ores, a rock three, a boulder four.',
];

class LoadingScreen {
  constructor() {
    this.root = $('#load-screen');
    this.bar = $('#load-bar');
    this.status = $('#load-status');
    this.sub = $('#load-sub');
    this.tipEl = $('#load-tip');
    this._interval = null;
  }

  show(sub, statusText = '') {
    this.root.classList.add('active');
    if (sub) this.sub.textContent = sub;
    this.setProgress(0, statusText);
    this._tip();
    clearInterval(this._interval);
    this._interval = setInterval(() => this._tip(), 3400);
  }

  _tip() {
    const t = TIPS[Math.floor(Math.random() * TIPS.length)];
    this.tipEl.style.opacity = '0';
    setTimeout(() => { this.tipEl.textContent = t; this.tipEl.style.opacity = '1'; }, 180);
  }

  setProgress(p, statusText) {
    this.bar.style.width = (clamp01(p) * 100).toFixed(1) + '%';
    if (statusText != null) this.status.textContent = statusText;
  }

  hide() {
    clearInterval(this._interval);
    this._interval = null;
    this.root.classList.remove('active');
  }

  /** Runs [label, fn] steps in order, painting between each one. */
  async run(steps) {
    for (let i = 0; i < steps.length; i++) {
      const [label, fn] = steps[i];
      this.setProgress(i / steps.length, label);
      await yieldToPaint();
      await fn();
    }
    this.setProgress(1, 'Ready');
    await yieldToPaint();
  }
}

export const loading = new LoadingScreen();
