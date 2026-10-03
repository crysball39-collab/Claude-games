/* =============================================================================
   The AI chat: a strip across the top of the screen where the AI player
   talks while it plays. The newest line is at the bottom; older ones fade
   and go. Nothing here decides what to say - that is the autopilot's job.
   ========================================================================== */
import { $ } from '../core/util.js';

const KEEP = 4;          // lines on screen at once
const LIFE = 14000;      // how long a line stays before it fades out

export class AiChat {
  constructor() {
    this.root = $('#ai-chat');
    this.list = $('#ai-chat-lines');
    this.lines = [];
    /** Everything said, for anyone who wants to read it back. */
    this.log = [];
  }

  show(on) { this.root.classList.toggle('hidden', !on); }

  /** Online (Claude) or on instinct: a small badge says which. */
  setOnline(on, model = '') {
    const b = this._badge || (this._badge = $('#ai-chat-mode'));
    if (!b) return;
    b.textContent = on ? 'CLAUDE' + (model ? ' · ' + model : '') : 'OFFLINE';
    b.classList.toggle('on', !!on);
  }

  /**
   * kind: '' (it says), 'think' (a thought), 'you' (what you typed),
   * 'sys' (a problem worth knowing about), 'call' and 'win'.
   */
  push(text, kind = '') {
    const tag = kind === 'you' ? 'YOU' : kind === 'sys' ? '!' : kind === 'think' ? 'AI thinks' : 'AI';
    this.log.push(kind === 'you' ? 'Viewer: ' + text : kind === 'think' ? '(thought) ' + text : text);
    if (this.log.length > 200) this.log.shift();
    const el = document.createElement('div');
    el.className = 'ai-line' + (kind ? ' ' + kind : '');
    const who = document.createElement('b');
    who.textContent = tag;
    el.appendChild(who);
    el.appendChild(document.createTextNode(' ' + text));
    this.list.appendChild(el);
    const entry = { el, timer: 0 };
    entry.timer = setTimeout(() => this._drop(entry), LIFE);
    this.lines.push(entry);
    while (this.lines.length > KEEP) this._drop(this.lines[0]);
  }

  _drop(entry) {
    const i = this.lines.indexOf(entry);
    if (i < 0) return;
    this.lines.splice(i, 1);
    clearTimeout(entry.timer);
    entry.el.classList.add('out');
    setTimeout(() => entry.el.remove(), 400);
  }

  clear() {
    for (const e of [...this.lines]) this._drop(e);
  }
}
