/* =============================================================================
   The admin panel, for one account: Chibble's.

   Logged in as Chibble, a crown appears beside the bag (and ADMIN PANEL in
   the pause menu). It opens switches and sliders that change the game for
   that account, saved with it like everything else: God mode, infinite
   coins, your most health and stamina, how fast you move - and the morphs.
   ========================================================================== */
import { $, $$ } from '../core/util.js';
import { ADMIN_LIMITS } from '../data/profile.js';
import { MORPHS } from '../game/morph.js';

/** The admin's account name (any capitals). */
export const ADMIN_NAME = 'Chibble';
export const isAdmin = (account) => !!account && account.name.toLowerCase() === ADMIN_NAME.toLowerCase();

const SWITCHES = [
  { k: 'god', name: 'God mode', note: 'Nothing can hurt you or knock you down' },
  { k: 'infinite', name: 'Infinite coins', note: 'Everything at the Stall is free' },
];
const SLIDERS = [
  { k: 'maxHp', name: 'Max HP', step: 50, show: (v) => v.toLocaleString('en-US') },
  { k: 'maxStamina', name: 'Max stamina', step: 50, show: (v) => v.toLocaleString('en-US') },
  { k: 'speed', name: 'Speed', step: 0.1, show: (v) => `${v.toFixed(1)}x` },
];

export class AdminUI {
  /** profile(): the current Profile; onChange(key): a setting changed; onClose() */
  constructor({ profile, onChange, onClose, sound }) {
    this.cb = { profile, onChange, onClose };
    this.sound = sound;
    this.el = $('#admin');
    $('#admin-close').addEventListener('click', () => this.close());
    this.el.addEventListener('pointerdown', (e) => { if (e.target === this.el) this.close(); });
  }

  get open() { return !this.el.classList.contains('hidden'); }

  show() {
    this.el.classList.remove('hidden');
    this.render();
  }

  close() {
    if (!this.open) return;
    this.el.classList.add('hidden');
    this.cb.onClose?.();
  }

  set(k, v) {
    this.cb.profile().setAdmin(k, v);
    this.cb.onChange?.(k);
  }

  render() {
    const a = this.cb.profile().d.admin;

    const sw = $('#admin-switches');
    sw.innerHTML = '';
    for (const r of SWITCHES) {
      const row = document.createElement('div');
      row.className = 'setting';
      row.innerHTML = `<span>${r.name}<small>${r.note}</small></span>`;
      const seg = document.createElement('div');
      seg.className = 'seg';
      seg.dataset.admin = r.k;
      for (const [v, text] of [[true, 'ON'], [false, 'OFF']]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.dataset.value = String(v);
        b.classList.toggle('on', a[r.k] === v);
        b.addEventListener('click', () => {
          this.sound?.click();
          this.set(r.k, v);
          for (const o of seg.children) o.classList.toggle('on', o === b);
        });
        seg.appendChild(b);
      }
      row.appendChild(seg);
      sw.appendChild(row);
    }

    const sl = $('#admin-sliders');
    sl.innerHTML = '';
    for (const r of SLIDERS) {
      const [lo, hi] = ADMIN_LIMITS[r.k];
      const row = document.createElement('div');
      row.className = 'setting';
      row.innerHTML = `<span>${r.name}</span>`;
      const box = document.createElement('div');
      box.className = 'range';
      const input = document.createElement('input');
      input.type = 'range';
      input.id = `adm-${r.k}`;
      input.min = String(lo); input.max = String(hi); input.step = String(r.step);
      input.value = String(a[r.k]);
      input.setAttribute('aria-label', r.name);
      const out = document.createElement('output');
      out.textContent = r.show(a[r.k]);
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        out.textContent = r.show(v);
        this.set(r.k, v);
      });
      // and quick ones
      const quick = document.createElement('div');
      quick.className = 'quick';
      const presets = r.k === 'speed' ? [1, 2, 3] : [100, 1000, 10000];
      for (const v of presets) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = r.show(v);
        b.addEventListener('click', () => { this.sound?.click(); input.value = String(v); out.textContent = r.show(v); this.set(r.k, v); });
        quick.appendChild(b);
      }
      box.append(input, out, quick);
      row.appendChild(box);
      sl.appendChild(row);
    }

    const mo = $('#admin-morphs');
    mo.innerHTML = '';
    for (const M of Object.values(MORPHS)) {
      const on = a.morph === M.id;
      const card = document.createElement('article');
      card.className = 'morph' + (on ? ' on' : '');
      card.dataset.morph = M.id;
      card.innerHTML = `
        <div class="morph-head"><h3>${M.name.toUpperCase()}</h3><span class="pill">${M.health.toLocaleString('en-US')} max HP</span></div>
        <p>${M.blurb}</p>
        <ul>${M.abilities.map((ab) => `<li><b>${ab.name}</b> <span class="pill">${ab.key}</span> ${ab.text}</li>`).join('')}</ul>
        <button class="btn ${on ? '' : 'primary'}" type="button" data-morph="${M.id}">${on ? 'TURN BACK' : 'MORPH'}</button>`;
      mo.appendChild(card);
    }
    for (const b of $$('button[data-morph]', mo)) {
      b.addEventListener('click', () => {
        this.sound?.click();
        const id = b.dataset.morph;
        this.set('morph', this.cb.profile().d.admin.morph === id ? null : id);
        this.render();
      });
    }
  }
}
