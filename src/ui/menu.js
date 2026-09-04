/* =============================================================================
   Main menu. MAPS lists the maps; picking one reveals PLAY.
   ========================================================================== */
import { $, $$ } from '../core/util.js';
import { MAPS } from '../game/map.js';

export class Menu {
  constructor(settings) {
    this.screen = $('#menu-screen');
    this.settings = settings;
    this.selectedMap = null;
    this.onPlay = null;

    $('#btn-maps').addEventListener('click', () => this.showPanel('panel-maps'));
    $('#btn-controls').addEventListener('click', () => this.showPanel('panel-controls'));
    $('#btn-settings').addEventListener('click', () => this.showPanel('panel-settings'));
    for (const b of $$('.backbtn')) {
      b.addEventListener('click', () => this.showPanel(b.dataset.back));
    }
    $('#btn-play').addEventListener('click', () => {
      if (this.selectedMap) this.onPlay?.(this.selectedMap.id);
    });

    this._buildMapList();
    this._wireSettings();
  }

  _buildMapList() {
    const list = $('#map-list');
    list.innerHTML = '';
    for (const map of MAPS) {
      const card = document.createElement('button');
      card.className = 'map-card';
      card.dataset.id = map.id;
      card.innerHTML =
        `<span class="map-thumb"></span>` +
        `<span><span class="mc-name">${map.name}</span>` +
        `<span class="mc-sub">${map.subtitle}</span></span>`;
      card.addEventListener('click', () => this.selectMap(map));
      list.appendChild(card);
    }
  }

  selectMap(map) {
    this.selectedMap = map;
    for (const c of $$('.map-card')) c.classList.toggle('selected', c.dataset.id === map.id);
    $('#md-empty').classList.add('hidden');
    $('#md-body').classList.remove('hidden');
    $('#md-title').textContent = map.name;
    $('#md-desc').innerHTML = map.description;
  }

  _wireSettings() {
    const s = this.settings;
    const q = $('#set-quality'), sh = $('#set-shadows'), go = $('#set-gore');
    const sens = $('#set-sens'), fov = $('#set-fov'), inv = $('#set-inverty');
    q.value = s.quality; sh.checked = s.shadows; go.checked = s.gore;
    sens.value = String(Math.round(s.sensitivity * 1000));
    fov.value = String(s.fov);
    inv.checked = s.invertY;

    q.addEventListener('change', () => { s.quality = q.value; s.save(); });
    sh.addEventListener('change', () => { s.shadows = sh.checked; s.save(); });
    go.addEventListener('change', () => { s.gore = go.checked; s.save(); s.emit('gore'); });
    sens.addEventListener('input', () => { s.sensitivity = Number(sens.value) / 1000; s.save(); s.emit('sensitivity'); });
    fov.addEventListener('input', () => { s.fov = Number(fov.value); s.save(); s.emit('fov'); });
    inv.addEventListener('change', () => { s.invertY = inv.checked; s.save(); s.emit('invertY'); });
  }

  showPanel(id) {
    for (const p of $$('.menu-panel')) p.classList.toggle('hidden', p.id !== id);
  }

  show() {
    this.screen.classList.add('active');
    this.showPanel('panel-main');
  }

  hide() { this.screen.classList.remove('active'); }
}
