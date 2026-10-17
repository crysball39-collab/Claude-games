/* =============================================================================
   The MODS screen: every mod there is, what it adds, how much storage it
   needs, and a button to put it in the game or take it out again.

   Installing takes a moment - a bar fills as the mod's files go in, at the
   size they really are. Removing asks once more first, and then takes
   everything of the mod out of the sandbox along with it.

   It can be opened from the title as well as from the spawn menu, so it
   keeps its own time (requestAnimationFrame) rather than the game's.
   ========================================================================== */
import { MODS, isInstalled, install, uninstall, modSize, storageUsed, installedMods, formatSize, thingsOf } from '../mods/index.js';
import { clamp } from '../core/util.js';

const DISK = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 3.5h11l3 3V20a.5.5 0 0 1-.5.5h-13A.5.5 0 0 1 5 20z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="none"/><path d="M8 3.5v5h7v-5M8 20.5v-6h8v6" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="none"/></svg>';

/** "Uzi, N and V" */
function listOf(names) {
  if (names.length < 2) return names.join('');
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

export class ModsScreen {
  /** `changed(mod, installed)` is called whenever a mod goes in or comes out. */
  constructor({ sb, changed }) {
    this.sb = sb;
    this.changed = changed;
    this.$ = (id) => document.getElementById(id);
    this.items = new Map();
    this.busy = null;     // the install going on: { id, t0, dur }
    this.armed = null;    // a remove waiting to be tapped again: { id, until }
    this.said = '';
    this.$('mods-close').addEventListener('click', () => this.close());
    this.$('mods').addEventListener('click', (e) => { if (e.target.id === 'mods') this.close(); });
    this.build();
  }

  get isOpen() { return !this.$('mods').classList.contains('hidden'); }

  show() {
    this.said = '';
    this.armed = null;
    this.$('mods').classList.remove('hidden');
    this.refresh();
    this.$('mods-close').focus({ preventScroll: true });
  }

  close() {
    if (this.busy) return;   // not halfway through putting one in
    this.armed = null;
    this.$('mods').classList.add('hidden');
  }

  build() {
    const list = this.$('mods-list');
    list.textContent = '';
    for (const m of MODS) {
      const el = document.createElement('div');
      el.className = 'mod-item';
      el.dataset.mod = m.id;
      const icon = document.createElement('canvas');
      icon.className = 'mod-icon';
      icon.width = 144;
      icon.height = 144;
      const main = document.createElement('div');
      main.className = 'mod-main';

      const top = document.createElement('div');
      top.className = 'mod-top';
      const name = document.createElement('b');
      name.className = 'mod-name';
      name.textContent = m.name;
      const ver = document.createElement('span');
      ver.className = 'mod-ver';
      ver.textContent = 'v' + m.version;
      const state = document.createElement('span');
      state.className = 'mod-state';
      state.textContent = 'INSTALLED';
      top.append(name, ver, state);

      const about = document.createElement('div');
      about.className = 'mod-about';
      about.textContent = m.about;

      const adds = document.createElement('div');
      adds.className = 'mod-adds';
      const al = document.createElement('span');
      al.textContent = 'Adds';
      adds.appendChild(al);
      for (const a of m.adds || []) {
        const c = document.createElement('i');
        c.className = 'chip';
        c.textContent = a;
        adds.appendChild(c);
      }

      const row = document.createElement('div');
      row.className = 'mod-row';
      const size = document.createElement('div');
      size.className = 'mod-size';
      size.innerHTML = DISK;
      const sl = document.createElement('span');
      sl.append('Storage needed: ');
      const amount = document.createElement('b');
      amount.textContent = formatSize(modSize(m.id));
      sl.appendChild(amount);
      size.appendChild(sl);
      const act = document.createElement('div');
      act.className = 'mod-act';
      const btn = document.createElement('button');
      btn.className = 'mod-btn';
      btn.addEventListener('click', () => this.pressed(m));
      const prog = document.createElement('div');
      prog.className = 'mod-progress hidden';
      const fill = document.createElement('div');
      fill.className = 'fill';
      const pt = document.createElement('span');
      prog.append(fill, pt);
      act.append(btn, prog);
      row.append(size, act);

      main.append(top, about, adds, row);
      el.append(icon, main);
      list.appendChild(el);
      if (m.icon) m.icon(icon.getContext('2d'), icon.width, icon.height);
      this.items.set(m.id, { el, btn, prog, fill, pt });
    }
    if (!MODS.length) {
      const none = document.createElement('div');
      none.className = 'mods-none';
      none.textContent = 'No mods here yet.';
      list.appendChild(none);
    }
  }

  refresh() {
    const now = performance.now();
    if (this.armed && now > this.armed.until) this.armed = null;
    for (const m of MODS) {
      const it = this.items.get(m.id);
      const on = isInstalled(m.id);
      const busy = this.busy && this.busy.id === m.id;
      it.el.classList.toggle('installed', on);
      it.prog.classList.toggle('hidden', !busy);
      const armed = this.armed && this.armed.id === m.id;
      it.btn.className = 'mod-btn' + (on ? ' remove' : ' install') + (armed ? ' armed' : '') + (busy ? ' hidden' : '');
      it.btn.textContent = armed ? 'TAP TO REMOVE' : on ? 'REMOVE' : 'INSTALL';
      it.btn.disabled = !!this.busy && !busy;
      it.btn.setAttribute('aria-label', (on ? 'Remove ' : 'Install ') + m.name);
    }
    const n = installedMods().length;
    const used = n ? `${n} of ${MODS.length} installed, using ${formatSize(storageUsed())}` : 'No mods installed';
    this.$('mods-foot').textContent = this.said ? this.said : used;
  }

  pressed(m) {
    if (this.busy) return;
    if (!isInstalled(m.id)) { this.startInstall(m); return; }
    const now = performance.now();
    if (!this.armed || this.armed.id !== m.id || now > this.armed.until) {
      this.armed = { id: m.id, until: now + 3000 };
      const n = thingsOf(m.id, this.sb).length;
      this.said = `Tap again to remove ${m.name}.` + (n ? ` ${n === 1 ? 'The one thing' : `All ${n} things`} of it in the sandbox will go too.` : '');
      this.refresh();
      setTimeout(() => { if (this.armed && performance.now() > this.armed.until) { this.armed = null; this.said = ''; this.refresh(); } }, 3100);
      return;
    }
    this.armed = null;
    const n = thingsOf(m.id, this.sb).length;
    uninstall(m.id, this.sb);
    this.said = `${m.name} removed.` + (n ? ` ${n === 1 ? 'One thing' : n + ' things'} taken out of the sandbox.` : '');
    this.refresh();
    this.changed(m, false);
  }

  /** The bar, filling at the mod's real size, and then it is in. */
  startInstall(m) {
    const bytes = modSize(m.id);
    this.busy = { id: m.id, t0: performance.now(), dur: clamp(700 + bytes / 120, 900, 2400) };
    this.said = `Installing ${m.name}...`;
    this.refresh();
    const it = this.items.get(m.id);
    const tick = () => {
      const b = this.busy;
      if (!b) return;
      const k = clamp((performance.now() - b.t0) / b.dur, 0, 1);
      // not quite even: files of different sizes, and a moment at the end to settle
      const shown = k < 0.85 ? (k / 0.85) * 0.96 : 0.96 + ((k - 0.85) / 0.15) * 0.04;
      it.fill.style.width = (shown * 100).toFixed(1) + '%';
      it.pt.textContent = `${formatSize(bytes * shown)} of ${formatSize(bytes)}`;
      if (k < 1) { requestAnimationFrame(tick); return; }
      this.busy = null;
      install(m.id);
      this.said = `${m.name} installed. ${listOf(m.adds || [])} ${(m.adds || []).length === 1 ? 'is' : 'are'} in the spawn menu now.`;
      this.refresh();
      this.changed(m, true);
    };
    it.fill.style.width = '0%';
    requestAnimationFrame(tick);
  }
}
