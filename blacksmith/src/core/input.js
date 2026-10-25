/* =============================================================================
   Input. Touch first: a floating stick under the left thumb, drag anywhere
   else to swing the camera round, tap the world to use what is in it, and
   the HUD buttons under the right thumb. A mouse and keyboard do the same
   jobs, so the game plays on a desktop too.
   ========================================================================== */
import { clamp } from './util.js';

const BUTTONS = ['attack', 'dash', 'interact'];

/** How far a press can wander and how long it can last and still be a tap. */
const TAP_SLOP = 12;
const TAP_MS = 380;

export class InputManager {
  constructor() {
    this.enabled = false;
    this.move = { x: 0, y: 0 };          // -1..1, y is forward
    this.lookDelta = { x: 0, y: 0 };     // radians gathered this frame
    this.zoomDelta = 0;
    this.sensitivity = 0.0065;           // radians per css pixel
    this.invertY = false;
    this.sprintToggle = false;           // the touch SPRINT button latches

    this.down = Object.create(null);
    this.pressed = Object.create(null);  // true for exactly one frame
    for (const b of BUTTONS) { this.down[b] = false; this.pressed[b] = false; }
    this._queued = new Set();
    this._buttonEls = new Map();

    this.stick = { active: false, id: -1, ox: 0, oy: 0, radius: 54 };
    this.look = { id: -1, x: 0, y: 0, sx: 0, sy: 0, t: 0, moved: 0 };
    this._keys = Object.create(null);

    this.onTap = null;             // (clientX, clientY) => void
    this.onInventory = null;
    this.onPause = null;
    this.onSprintChange = null;    // (on) => void, so the button can light up
  }

  /** Sprinting is either latched on by the button or held on a keyboard. */
  get sprint() {
    return this.sprintToggle || !!this._keys.ShiftLeft || !!this._keys.ShiftRight;
  }

  setSprint(on) {
    if (this.sprintToggle === on) return;
    this.sprintToggle = on;
    this.onSprintChange?.(on);
  }

  /* ------------------------------ wiring -------------------------------- */

  attach({ viewport, stickZone, stickBase, stickKnob }) {
    this.viewport = viewport;
    this.stickZone = stickZone;
    this.stickBase = stickBase;
    this.stickKnob = stickKnob;

    viewport.style.touchAction = 'none';
    viewport.addEventListener('pointerdown', (e) => this._lookDown(e), { passive: false });
    stickZone.addEventListener('pointerdown', (e) => this._stickDown(e), { passive: false });
    window.addEventListener('pointermove', (e) => { this._lookMove(e); this._stickMove(e); }, { passive: false });
    window.addEventListener('pointerup', (e) => { this._lookUp(e, true); this._stickUp(e); });
    window.addEventListener('pointercancel', (e) => { this._lookUp(e, false); this._stickUp(e); });
    viewport.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.zoomDelta += Math.sign(e.deltaY) * 0.6;
    }, { passive: false });

    window.addEventListener('keydown', (e) => this._key(e, true));
    window.addEventListener('keyup', (e) => this._key(e, false));
    window.addEventListener('blur', () => this.reset());
  }

  /** Registers a HUD element as a button the game reads. */
  bindButton(el, name) {
    if (!el) return;
    this._buttonEls.set(name, el);
    const press = (e) => {
      e.preventDefault(); e.stopPropagation();
      el.setPointerCapture?.(e.pointerId);
      el.classList.add('down');
      this._queued.add(name);
      this.down[name] = true;
    };
    const release = (e) => {
      e.stopPropagation();
      el.classList.remove('down');
      this.down[name] = false;
    };
    el.addEventListener('pointerdown', press, { passive: false });
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    // Capture can end without a pointerup reaching us; a held button must not stick.
    el.addEventListener('lostpointercapture', (e) => { if (this.down[name]) release(e); });
  }

  /** The SPRINT button latches rather than holds: a thumb is busy enough. */
  bindToggle(el) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!this.enabled) return;
      this.setSprint(!this.sprintToggle);
    }, { passive: false });
  }

  /* ------------------------------ handlers ------------------------------- */

  _lookDown(e) {
    if (!this.enabled || this.look.id !== -1) return;
    e.preventDefault();
    this.look.id = e.pointerId;
    this.look.x = this.look.sx = e.clientX;
    this.look.y = this.look.sy = e.clientY;
    this.look.t = performance.now();
    this.look.moved = 0;
  }

  _lookMove(e) {
    if (e.pointerId !== this.look.id) return;
    const dx = e.clientX - this.look.x;
    const dy = e.clientY - this.look.y;
    this.look.x = e.clientX; this.look.y = e.clientY;
    this.look.moved = Math.max(this.look.moved,
      Math.hypot(e.clientX - this.look.sx, e.clientY - this.look.sy));
    if (!this.enabled) return;
    // Below the tap slop nothing turns, so a tap on the anvil never nudges the view.
    if (this.look.moved < TAP_SLOP * 0.5) return;
    this.lookDelta.x += dx * this.sensitivity;
    this.lookDelta.y += dy * this.sensitivity * (this.invertY ? -1 : 1);
  }

  _lookUp(e, finished) {
    if (e.pointerId !== this.look.id) return;
    const wasTap = finished && this.look.moved < TAP_SLOP && performance.now() - this.look.t < TAP_MS;
    this.look.id = -1;
    if (wasTap && this.enabled) this.onTap?.(e.clientX, e.clientY);
  }

  _stickDown(e) {
    if (!this.enabled) return;
    e.preventDefault();
    e.stopPropagation();
    if (this.stick.active) return;
    const base = this.stickBase.getBoundingClientRect();
    // Measured now rather than at start-up: a hidden screen measures zero.
    if (base.width > 8) this.stick.radius = base.width * 0.44;
    this.stick.active = true;
    this.stick.id = e.pointerId;
    // The ring jumps to the thumb, but never out of its corner.
    const r = this.stickZone.getBoundingClientRect();
    const cx = clamp(e.clientX, r.left + 56, r.right - 30);
    const cy = clamp(e.clientY, r.top + 30, r.bottom - 56);
    this.stick.ox = cx; this.stick.oy = cy;
    this.stickBase.style.left = (cx - r.left) + 'px';
    this.stickBase.style.bottom = (r.bottom - cy) + 'px';
    this.stickZone.classList.add('active');
    this._stickApply(e.clientX, e.clientY);
  }

  _stickMove(e) {
    if (!this.stick.active || e.pointerId !== this.stick.id) return;
    e.preventDefault();
    this._stickApply(e.clientX, e.clientY);
  }

  _stickApply(x, y) {
    let dx = x - this.stick.ox;
    let dy = y - this.stick.oy;
    const r = this.stick.radius;
    const len = Math.hypot(dx, dy);
    if (len > r) { dx = (dx / len) * r; dy = (dy / len) * r; }
    const dead = r * 0.12;
    const m = Math.hypot(dx, dy);
    let nx = 0, ny = 0;
    if (m > dead) {
      const k = (m - dead) / (r - dead) / m;
      nx = dx * k; ny = dy * k;
    }
    this.move.x = clamp(nx, -1, 1);
    this.move.y = clamp(-ny, -1, 1);
    if (this.stickKnob) this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  _stickUp(e) {
    if (!this.stick.active || e.pointerId !== this.stick.id) return;
    this._releaseStick();
  }

  _releaseStick() {
    this.stick.active = false;
    this.stick.id = -1;
    this.move.x = 0; this.move.y = 0;
    if (this.stickKnob) this.stickKnob.style.transform = '';
    if (this.stickBase) { this.stickBase.style.left = ''; this.stickBase.style.bottom = ''; }
    this.stickZone?.classList.remove('active');
  }

  _key(e, isDown) {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const code = e.code;
    if (isDown && (code === 'Tab' || code === 'Space')) e.preventDefault();
    if (this._keys[code] === isDown) return;
    this._keys[code] = isDown;
    const set = (name) => {
      if (isDown) this._queued.add(name);
      this.down[name] = isDown;
    };
    switch (code) {
      case 'Space': set('dash'); break;
      case 'KeyF': case 'Enter': case 'KeyJ': set('attack'); break;
      case 'KeyE': set('interact'); break;
      case 'KeyI': case 'Tab': case 'KeyB': if (isDown) this.onInventory?.(); break;
      case 'Escape': case 'KeyP': if (isDown) this.onPause?.(); break;
      default: break;
    }
    this._keyboardMove();
  }

  _keyboardMove() {
    if (this.stick.active) return;
    const k = this._keys;
    const x = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const y = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const len = Math.hypot(x, y) || 1;
    this.move.x = x / len; this.move.y = y / len;
  }

  /* ------------------------------- frame --------------------------------- */

  beginFrame() {
    for (const b of BUTTONS) this.pressed[b] = this._queued.has(b);
    this._queued.clear();
  }

  consumeLook() {
    const d = { x: this.lookDelta.x, y: this.lookDelta.y, zoom: this.zoomDelta };
    this.lookDelta.x = 0; this.lookDelta.y = 0; this.zoomDelta = 0;
    return d;
  }

  /** When the game stops listening, nothing may be left held down. */
  reset() {
    for (const b of BUTTONS) { this.down[b] = false; this.pressed[b] = false; }
    this._queued.clear();
    for (const el of this._buttonEls.values()) el.classList.remove('down');
    this.lookDelta.x = 0; this.lookDelta.y = 0; this.zoomDelta = 0;
    this.look.id = -1;
    for (const k in this._keys) this._keys[k] = false;
    this._releaseStick();
  }
}

export const input = new InputManager();
