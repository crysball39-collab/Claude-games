/* =============================================================================
   Input. Touch first: a stick under the left thumb, drag anywhere else to
   look, buttons under the right thumb. Keyboard and mouse do the same jobs so
   the game plays on a desktop as well.
   ========================================================================== */
import { clamp } from './util.js';

const BUTTONS = ['jump', 'crouch', 'attack', 'alt', 'reload', 'use', 'drop', 'talk', 'holster'];

export class Input {
  constructor() {
    this.enabled = false;
    this.move = { x: 0, y: 0 };            // stick: x right, y forward, -1..1
    this.look = { x: 0, y: 0 };            // radians gathered since last read
    this.sensitivity = 0.0046;
    this.invertY = false;
    this.down = {}; this.pressed = {}; this.released = {};
    for (const b of BUTTONS) { this.down[b] = false; this.pressed[b] = false; this.released[b] = false; }
    this._qp = new Set(); this._qr = new Set();
    this._els = new Map();
    this.stick = { active: false, id: -1, ox: 0, oy: 0, radius: 52 };
    this._lookId = -1; this._lookLast = null; this._lookStart = null;
    this._keys = {};
    this.locked = false;
    /** Which of the four attacks a swipe on the attack button asked for, or -1. */
    this.attackChoice = -1;

    this.onTap = null;            // (clientX, clientY) a short tap on the world
    this.onSlot = null;           // (index) weapon slot keys
    this.onCycle = null;          // (+1 | -1) mouse wheel
    this.onKey = null;            // (name) menu, doctor, view, pause
  }

  attach({ viewport, stickZone, stickBase, stickKnob }) {
    this.viewport = viewport; this.stickZone = stickZone; this.stickBase = stickBase; this.stickKnob = stickKnob;
    viewport.style.touchAction = 'none';
    viewport.addEventListener('pointerdown', (e) => this._lookDown(e), { passive: false });
    window.addEventListener('pointermove', (e) => { this._lookMove(e); this._stickMove(e); }, { passive: false });
    window.addEventListener('pointerup', (e) => { this._lookUp(e); this._stickUp(e); });
    window.addEventListener('pointercancel', (e) => { this._lookUp(e, true); this._stickUp(e); });
    stickZone.addEventListener('pointerdown', (e) => this._stickDown(e), { passive: false });
    window.addEventListener('keydown', (e) => this._key(e, true));
    window.addEventListener('keyup', (e) => this._key(e, false));
    window.addEventListener('blur', () => this.reset());
    viewport.addEventListener('contextmenu', (e) => e.preventDefault());
    viewport.addEventListener('wheel', (e) => { if (this.enabled) this.onCycle?.(e.deltaY > 0 ? 1 : -1); }, { passive: true });

    // a mouse can be captured for proper mouse look; where the page is not
    // allowed to, dragging still works
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === viewport; });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || !this.locked) return;
      this.look.x += e.movementX * this.sensitivity * 0.5;
      this.look.y += e.movementY * this.sensitivity * 0.5 * (this.invertY ? -1 : 1);
    });
    window.addEventListener('mousedown', (e) => {
      if (!this.enabled || !this.locked) return;
      if (e.button === 0) this._press('attack'); else if (e.button === 2) this._press('alt');
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this._release('attack'); else if (e.button === 2) this._release('alt');
    });
  }

  requestLock() {
    if (this.locked || !this.viewport.requestPointerLock) return;
    try { const p = this.viewport.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* not allowed here */ }
  }
  exitLock() { if (this.locked && document.exitPointerLock) document.exitPointerLock(); }

  _press(name) { this._qp.add(name); this.down[name] = true; }
  _release(name) { if (this.down[name]) { this._qr.add(name); this.down[name] = false; } }

  /** Makes a HUD element behave as a held button. */
  bind(elm, name, opts = {}) {
    if (!elm) return;
    this._els.set(name, elm);
    let sx = 0, sy = 0, id = -1;
    const up = (e) => {
      if (e.pointerId !== id) return;
      id = -1;
      elm.classList.remove('down');
      this._release(name);
      opts.onUp?.();
    };
    elm.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (id !== -1) return;
      id = e.pointerId; sx = e.clientX; sy = e.clientY;
      try { elm.setPointerCapture(e.pointerId); } catch { /* fine */ }
      elm.classList.add('down');
      this._press(name);
      opts.onDown?.();
    }, { passive: false });
    elm.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id || !opts.onSwipe) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.hypot(dx, dy) < 30) return;
      // left, right, up, down -> 0, 1, 2, 3
      opts.onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 0 : 1) : (dy < 0 ? 2 : 3));
      sx = e.clientX; sy = e.clientY;
    });
    elm.addEventListener('pointerup', up);
    elm.addEventListener('pointercancel', up);
    elm.addEventListener('lostpointercapture', up);
    elm.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /* ------------------------------- looking ------------------------------- */

  _lookDown(e) {
    if (!this.enabled || this._lookId !== -1) return;
    if (e.pointerType === 'mouse' && this.locked) return;
    this._lookId = e.pointerId;
    this._lookLast = { x: e.clientX, y: e.clientY };
    this._lookStart = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
  }
  _lookMove(e) {
    if (!this.enabled || e.pointerId !== this._lookId) return;
    const dx = e.clientX - this._lookLast.x, dy = e.clientY - this._lookLast.y;
    this._lookLast.x = e.clientX; this._lookLast.y = e.clientY;
    this._lookStart.moved += Math.abs(dx) + Math.abs(dy);
    this.look.x += dx * this.sensitivity;
    this.look.y += dy * this.sensitivity * (this.invertY ? -1 : 1);
  }
  _lookUp(e, cancelled) {
    if (e.pointerId !== this._lookId) return;
    this._lookId = -1;
    const s = this._lookStart;
    if (!cancelled && s && s.moved < 12 && performance.now() - s.t < 350) this.onTap?.(e.clientX, e.clientY);
  }

  /* -------------------------------- stick -------------------------------- */

  _stickDown(e) {
    if (!this.enabled || this.stick.active) return;
    e.preventDefault();
    const r = this.stickBase.getBoundingClientRect();
    if (r.width > 8) this.stick.radius = r.width * 0.46;
    this.stick.active = true; this.stick.id = e.pointerId;
    // the ring comes to the thumb, but stays in its corner
    const z = this.stickZone.getBoundingClientRect();
    const cx = clamp(e.clientX, z.left + this.stick.radius * 0.9, z.right - 10);
    const cy = clamp(e.clientY, z.top + 10, z.bottom - this.stick.radius * 0.9);
    this.stick.ox = cx; this.stick.oy = cy;
    this.stickBase.style.left = (cx - z.left) + 'px';
    this.stickBase.style.bottom = (z.bottom - cy) + 'px';
    this.stickZone.classList.add('active');
    this._stickApply(e.clientX, e.clientY);
  }
  _stickMove(e) {
    if (!this.stick.active || e.pointerId !== this.stick.id) return;
    e.preventDefault();
    this._stickApply(e.clientX, e.clientY);
  }
  _stickApply(x, y) {
    let dx = x - this.stick.ox, dy = y - this.stick.oy;
    const r = this.stick.radius, len = Math.hypot(dx, dy);
    if (len > r) { dx = dx / len * r; dy = dy / len * r; }
    const dead = r * 0.13, m = Math.hypot(dx, dy);
    let nx = 0, ny = 0;
    if (m > dead) { const k = (m - dead) / (r - dead) / m; nx = dx * k; ny = dy * k; }
    this.move.x = clamp(nx, -1, 1); this.move.y = clamp(-ny, -1, 1);
    this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  _stickUp(e) {
    if (!this.stick.active || e.pointerId !== this.stick.id) return;
    this.stick.active = false; this.stick.id = -1;
    this.move.x = 0; this.move.y = 0;
    this.stickKnob.style.transform = '';
    this.stickBase.style.left = ''; this.stickBase.style.bottom = '';
    this.stickZone.classList.remove('active');
    this._keyMove();
  }

  /* ------------------------------- keyboard ------------------------------ */

  _key(e, isDown) {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const code = e.code;
    if (isDown && (code === 'Tab' || code === 'Space')) e.preventDefault();
    if (this._keys[code] === isDown) return;
    this._keys[code] = isDown;
    const set = (name) => (isDown ? this._press(name) : this._release(name));
    switch (code) {
      case 'Space': set('jump'); break;
      case 'KeyC': case 'ControlLeft': if (this.enabled) set('crouch'); break;
      case 'KeyF': case 'Enter': set('attack'); break;
      case 'KeyQ': set('alt'); break;
      case 'KeyR': set('reload'); break;
      case 'KeyE': set('use'); break;
      case 'KeyG': set('drop'); break;
      case 'KeyH': set('holster'); break;
      case 'KeyT': if (isDown && this.enabled) { e.preventDefault(); this.onKey?.('talk'); } break;
      case 'Tab': if (isDown) this.onKey?.('menu'); break;
      case 'KeyX': if (isDown) this.onKey?.('doctor'); break;
      case 'KeyV': if (isDown) this.onKey?.('view'); break;
      case 'Escape': case 'KeyP': if (isDown) this.onKey?.('pause'); break;
      default:
        if (isDown && /^Digit[1-9]$/.test(code)) this.onSlot?.(Number(code.slice(5)) - 1);
    }
    this._keyMove();
  }
  _keyMove() {
    if (this.stick.active) return;
    const k = this._keys;
    const x = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const y = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const len = Math.hypot(x, y) || 1;
    // shift walks; on a keyboard there is no half-pushed stick
    const s = k.ShiftLeft || k.ShiftRight ? 0.45 : 1;
    this.move.x = x / len * s; this.move.y = y / len * s;
  }

  /* --------------------------------- frame ------------------------------- */

  begin() {
    for (const b of BUTTONS) { this.pressed[b] = this._qp.has(b); this.released[b] = this._qr.has(b); }
    this._qp.clear(); this._qr.clear();
  }
  takeLook() {
    const x = this.look.x, y = this.look.y;
    this.look.x = 0; this.look.y = 0;
    return [x, y];
  }
  reset() {
    for (const b of BUTTONS) { this.down[b] = false; this.pressed[b] = false; this.released[b] = false; }
    this._qp.clear(); this._qr.clear();
    for (const e of this._els.values()) e.classList.remove('down');
    this.move.x = 0; this.move.y = 0; this.look.x = 0; this.look.y = 0;
    this.stick.active = false; this.stick.id = -1; this._lookId = -1;
    for (const k in this._keys) this._keys[k] = false;
    if (this.stickKnob) this.stickKnob.style.transform = '';
    if (this.stickBase) { this.stickBase.style.left = ''; this.stickBase.style.bottom = ''; }
    this.stickZone?.classList.remove('active');
  }
}

export const input = new Input();
