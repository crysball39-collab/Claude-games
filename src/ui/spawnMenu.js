/* =============================================================================
   The spawn menu behind the three lines in the top left. Two side sections:
   Objects and Humans.
   ========================================================================== */
import { $ } from '../core/util.js';
import { SPAWNABLES } from '../game/game.js';

export class SpawnMenu {
  constructor() {
    this.root = $('#spawn-drawer');
    this.gridObjects = $('#grid-objects');
    this.gridHumans = $('#grid-humans');
    this.onSelect = null;
    this.onToggle = null;
    this.open = false;
    this.selectedId = 'crate';

    this._fill(this.gridObjects, SPAWNABLES.objects);
    this._fill(this.gridHumans, SPAWNABLES.humans);

    $('#btn-close-drawer').addEventListener('click', () => this.close());
    $('#drawer-scrim').addEventListener('pointerdown', (e) => { e.preventDefault(); this.close(); });
    $('#btn-hamburger').addEventListener('click', (e) => { e.preventDefault(); this.toggle(); });

    this._select('crate');
  }

  _fill(grid, items) {
    grid.innerHTML = '';
    for (const item of items) {
      const el = document.createElement('button');
      el.className = 'item';
      el.dataset.id = item.id;
      el.innerHTML = `<span class="ico ${item.icon}"></span><span>${item.name}</span>`;
      el.title = item.hint;
      el.addEventListener('click', () => this._select(item.id));
      grid.appendChild(el);
    }
  }

  _select(id) {
    this.selectedId = id;
    for (const el of this.root.querySelectorAll('.item')) {
      el.classList.toggle('selected', el.dataset.id === id);
    }
    this.onSelect?.(id);
  }

  toggle() { this.open ? this.close() : this.show(); }

  show() {
    this.open = true;
    this.root.classList.remove('hidden');
    this.onToggle?.(true);
  }

  close() {
    this.open = false;
    this.root.classList.add('hidden');
    this.onToggle?.(false);
  }
}
