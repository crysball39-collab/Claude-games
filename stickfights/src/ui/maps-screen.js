/* =============================================================================
   The MAPS screen: every map there is, a picture of it, a few words, and a
   button to load it. The one the sandbox is on is marked.
   ========================================================================== */
import { MAPS, loadMap } from '../game/maps.js';

export class MapsScreen {
  /** `loaded(map)` is called once a map has been loaded. */
  constructor({ sb, loaded }) {
    this.sb = sb;
    this.loaded = loaded;
    this.$ = (id) => document.getElementById(id);
    this.items = new Map();
    this.$('maps-close').addEventListener('click', () => this.close());
    this.$('maps').addEventListener('click', (e) => { if (e.target.id === 'maps') this.close(); });
    this.build();
  }

  get isOpen() { return !this.$('maps').classList.contains('hidden'); }

  show() {
    this.$('maps').classList.remove('hidden');
    this.refresh();
    this.$('maps-close').focus({ preventScroll: true });
  }

  close() { this.$('maps').classList.add('hidden'); }

  build() {
    const list = this.$('maps-list');
    list.textContent = '';
    for (const m of MAPS) {
      const el = document.createElement('div');
      el.className = 'mod-item map-item';
      el.dataset.map = m.id;
      const pic = document.createElement('canvas');
      pic.className = 'mod-icon map-icon';
      pic.width = 256;
      pic.height = 144;
      const main = document.createElement('div');
      main.className = 'mod-main';
      const top = document.createElement('div');
      top.className = 'mod-top';
      const name = document.createElement('b');
      name.className = 'mod-name';
      name.textContent = m.name;
      const state = document.createElement('span');
      state.className = 'mod-state';
      state.textContent = 'LOADED';
      top.append(name, state);
      const about = document.createElement('div');
      about.className = 'mod-about';
      about.textContent = m.about;
      const row = document.createElement('div');
      row.className = 'mod-row';
      const act = document.createElement('div');
      act.className = 'mod-act';
      const btn = document.createElement('button');
      btn.className = 'mod-btn map-btn';
      btn.addEventListener('click', () => this.pressed(m));
      act.append(btn);
      row.append(document.createElement('span'), act);
      main.append(top, about, row);
      el.append(pic, main);
      list.appendChild(el);
      drawMapPicture(pic.getContext('2d'), pic.width, pic.height, m.id);
      this.items.set(m.id, { el, btn });
    }
  }

  refresh() {
    for (const m of MAPS) {
      const it = this.items.get(m.id), on = this.sb.map === m.id;
      it.el.classList.toggle('current', on);
      it.btn.textContent = on ? 'RELOAD' : 'LOAD';
    }
  }

  pressed(m) {
    loadMap(this.sb, m.id);
    this.refresh();
    this.close();
    if (this.loaded) this.loaded(m);
  }
}

/** A little picture of a map, for its card. */
export function drawMapPicture(ctx, w, h, id) {
  ctx.fillStyle = '#9b9b9b';
  ctx.fillRect(0, 0, w, h);
  const ground = h * 0.8;
  if (id === 'city') {
    // the skyline, far off, and the street in front
    ctx.fillStyle = '#8a8a8a';
    for (let x = 0, k = 0; x < w; k++) { const bw = 18 + ((k * 37) % 23), bh = 40 + ((k * 53) % 50); ctx.fillRect(x, ground - bh, bw, bh); x += bw + 3; }
    const row = [['#8f4c39', 30, 62], ['#9ea6ad', 40, 96], ['#d2cabb', 30, 30], ['#c4b79f', 40, 74], ['#d2cabb', 28, 26], ['#8f4c39', 32, 58], ['#9ea6ad', 38, 84]];
    let x = 4;
    for (const [c, bw, bh] of row) {
      ctx.fillStyle = c;
      ctx.fillRect(x, ground - bh, bw, bh);
      ctx.fillStyle = 'rgba(60, 76, 88, 0.85)';
      for (let yy = ground - bh + 6; yy < ground - 12; yy += 12) for (let xx = x + 4; xx < x + bw - 6; xx += 9) ctx.fillRect(xx, yy, 5, 7);
      ctx.strokeStyle = 'rgba(25, 25, 25, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, ground - bh + 0.75, bw - 1.5, bh - 1.5);
      x += bw + 5;
    }
    ctx.fillStyle = '#3f8f3f';
    for (const tx of [40, 112, 190]) { ctx.beginPath(); ctx.arc(tx, ground - 20, 11, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#5a3a20'; ctx.fillRect(tx - 2, ground - 12, 4, 12); ctx.fillStyle = '#3f8f3f'; }
  }
  ctx.fillStyle = '#000';
  ctx.fillRect(0, ground, w, h - ground);
  // a stickman or two, for the size of it
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  for (const sx of id === 'city' ? [70, 150] : [96, 160]) {
    ctx.beginPath();
    ctx.arc(sx, ground - 25, 4, 0, Math.PI * 2);
    ctx.moveTo(sx, ground - 21); ctx.lineTo(sx, ground - 10);
    ctx.moveTo(sx, ground - 10); ctx.lineTo(sx - 4, ground);
    ctx.moveTo(sx, ground - 10); ctx.lineTo(sx + 4, ground);
    ctx.moveTo(sx, ground - 18); ctx.lineTo(sx - 5, ground - 12);
    ctx.moveTo(sx, ground - 18); ctx.lineTo(sx + 5, ground - 12);
    ctx.stroke();
  }
}
