/* =============================================================================
   Settings: sound, music, picture quality, camera speed and blood. Kept in
   this browser's storage; they are about the device, not the fighter.
   ========================================================================== */
import { store, IS_TOUCH } from '../core/util.js';

const KEY = 'barrage.settings';

function weakDevice() {
  return (navigator.hardwareConcurrency || 4) <= 4 && (navigator.deviceMemory || 4) <= 4;
}

export const settings = {
  sfx: true,
  music: true,
  quality: 'auto',       // auto | low | high
  look: 1,               // camera speed
  blood: true,
  _fns: [],
  load() {
    const s = store.get(KEY, {});
    for (const k of ['sfx', 'music', 'quality', 'look', 'blood']) if (s && k in s) this[k] = s[k];
    return this;
  },
  save() { store.set(KEY, { sfx: this.sfx, music: this.music, quality: this.quality, look: this.look, blood: this.blood }); },
  set(k, v) { this[k] = v; this.save(); for (const fn of this._fns) fn(k, v); },
  onChange(fn) { this._fns.push(fn); },
  /** What 'auto' means on this device. */
  get effectiveQuality() { return this.quality !== 'auto' ? this.quality : weakDevice() ? 'low' : 'high'; },
};

const ROWS = [
  { k: 'sfx', name: 'Sound effects', opts: [[true, 'ON'], [false, 'OFF']] },
  { k: 'music', name: 'Drums', opts: [[true, 'ON'], [false, 'OFF']] },
  { k: 'quality', name: 'Picture', opts: [['auto', 'AUTO'], ['low', 'FAST'], ['high', 'SHARP']] },
  { k: 'blood', name: 'Blood', opts: [[true, 'ON'], [false, 'OFF']] },
  { k: 'look', name: IS_TOUCH ? 'Camera drag speed' : 'Mouse speed', range: [0.4, 2, 0.1] },
];

/** Fills a container with the settings rows. */
export function renderSettings(box, sound) {
  box.innerHTML = '';
  for (const r of ROWS) {
    const row = document.createElement('div');
    row.className = 'setting';
    const label = document.createElement('span');
    label.textContent = r.name;
    row.appendChild(label);
    if (r.range) {
      const input = document.createElement('input');
      input.type = 'range';
      input.id = `set-${r.k}-${box.id}`;
      [input.min, input.max, input.step] = r.range.map(String);
      input.value = String(settings[r.k]);
      input.setAttribute('aria-label', r.name);
      input.addEventListener('input', () => settings.set(r.k, parseFloat(input.value)));
      row.appendChild(input);
    } else {
      const seg = document.createElement('div');
      seg.className = 'seg';
      for (const [v, text] of r.opts) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.classList.toggle('on', settings[r.k] === v);
        b.addEventListener('click', () => {
          settings.set(r.k, v);
          sound?.click();
          for (const o of seg.children) o.classList.toggle('on', o === b);
        });
        seg.appendChild(b);
      }
      row.appendChild(seg);
    }
    box.appendChild(row);
  }
}
