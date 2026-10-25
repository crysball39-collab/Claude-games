/* =============================================================================
   Talking. A box along the bottom with a face, a name, what they say - typed
   out a letter at a time, a tap shows it all - and what you can say back.
   ========================================================================== */
import { $ } from '../core/util.js';

export class DialogueUI {
  constructor() {
    this.root = $('#dialogue');
    this.portrait = $('#dlg-portrait');
    this.nameEl = $('#dlg-name');
    this.textEl = $('#dlg-text');
    this.choicesEl = $('#dlg-choices');
    this.isOpen = false;
    this._typing = null;
    this.textEl.addEventListener('pointerdown', () => this._finishTyping());
  }

  open(name, portraitUrl) {
    this.isOpen = true;
    this.nameEl.textContent = name.toUpperCase();
    this.portrait.innerHTML = portraitUrl ? `<img alt="" src="${portraitUrl}">` : '';
    this.root.classList.remove('hidden');
  }

  /** choices: [{ label, primary?, danger?, disabled?, pick() }] */
  say(text, choices = []) {
    this._finishTyping(true);
    this.textEl.textContent = '';
    this._full = text;
    let i = 0;
    const tick = () => {
      i = Math.min(text.length, i + 2);
      this.textEl.textContent = text.slice(0, i);
      if (i < text.length) this._typing = setTimeout(tick, 16);
      else this._typing = null;
    };
    tick();
    this.choicesEl.innerHTML = '';
    for (const c of choices) {
      const b = document.createElement('button');
      b.className = 'mbtn' + (c.primary ? ' primary' : '') + (c.danger ? ' danger' : '');
      b.textContent = c.label;
      b.disabled = !!c.disabled;
      b.addEventListener('click', () => { this._finishTyping(); c.pick(); });
      this.choicesEl.appendChild(b);
    }
  }

  _finishTyping(silent = false) {
    if (!this._typing) return;
    clearTimeout(this._typing);
    this._typing = null;
    if (!silent) this.textEl.textContent = this._full;
  }

  close() {
    this._finishTyping(true);
    this.isOpen = false;
    this.root.classList.add('hidden');
  }
}
