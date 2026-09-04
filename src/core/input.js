/* =============================================================================
   Unified input. Touch is the primary path (virtual stick + drag to look +
   HUD buttons); keyboard and mouse are supported so the game is playable and
   testable on a desktop too.
   ========================================================================== */
import { clamp, IS_TOUCH } from './util.js';

const BUTTONS = ['jump', 'crouch', 'primary', 'spawn', 'delete', 'use'];

export class InputManager {
  constructor() {
    this.enabled = false;
    this.move = { x: 0, y: 0 };          // -1..1, y = forward
    this.lookDelta = { x: 0, y: 0 };     // radians accumulated this frame
    this.sensitivity = 0.0022;           // radians per css pixel at 100%
    this.invertY = false;

    this.down = Object.create(null);
    this.pressed = Object.create(null);  // edge: true for exactly one frame
    this.released = Object.create(null);
    for (const b of BUTTONS) { this.down[b] = false; this.pressed[b] = false; this.released[b] = false; }

    this._queuedPress = new Set();
    this._queuedRelease = new Set();
    this._buttonEls = new Map();

    this.stick = { active: false, id: -1, ox: 0, oy: 0, radius: 54 };
    this.lookPointer = -1;
    this._keys = Object.create(null);
    this.pointerLocked = false;

    this.onWeaponSelect = null;  // (index) => void
    this.onToggleDrawer = null;
    this.onPause = null;
  }

  /* ------------------------------ wiring -------------------------------- */

  attach({ viewport, stickZone, stickBase, stickKnob }) {
    this.viewport = viewport;
    this.stickZone = stickZone;
    this.stickBase = stickBase;
    this.stickKnob = stickKnob;

    this._baseHome = { x: 0, y: 0 };
    this._readStickHome();
    window.addEventListener('resize', () => this._readStickHome());

    // --- look / camera drag (anything on the viewport that is not the HUD) --
    const vp = viewport;
    vp.style.touchAction = 'none';
    vp.addEventListener('pointerdown', (e) => this._lookDown(e), { passive: false });
    window.addEventListener('pointermove', (e) => this._lookMove(e), { passive: false });
    window.addEventListener('pointerup', (e) => this._lookUp(e));
    window.addEventListener('pointercancel', (e) => this._lookUp(e));

    // --- virtual stick ------------------------------------------------------
    stickZone.addEventListener('pointerdown', (e) => this._stickDown(e), { passive: false });
    window.addEventListener('pointermove', (e) => this._stickMove(e), { passive: false });
    window.addEventListener('pointerup', (e) => this._stickUp(e));
    window.addEventListener('pointercancel', (e) => this._stickUp(e));

    // --- keyboard -----------------------------------------------------------
    window.addEventListener('keydown', (e) => this._key(e, true));
    window.addEventListener('keyup', (e) => this._key(e, false));

    // --- desktop mouse look via pointer lock --------------------------------
    if (!IS_TOUCH) {
      vp.addEventListener('click', () => {
        if (this.enabled && !this.pointerLocked && vp.requestPointerLock) vp.requestPointerLock();
      });
      document.addEventListener('pointerlockchange', () => {
        this.pointerLocked = document.pointerLockElement === vp;
      });
      window.addEventListener('mousemove', (e) => {
        if (!this.enabled || !this.pointerLocked) return;
        this.lookDelta.x += e.movementX * this.sensitivity;
        this.lookDelta.y += e.movementY * this.sensitivity * (this.invertY ? -1 : 1);
      });
      window.addEventListener('mousedown', (e) => {
        if (!this.enabled || !this.pointerLocked) return;
        if (e.button === 0) this._queuedPress.add('primary');
      });
      window.addEventListener('mouseup', (e) => {
        if (e.button === 0) this._queuedRelease.add('primary');
      });
    }
  }

  /**
   * The throw of the stick, measured from the element itself.
   *
   * This has to be read when the stick is pressed, not when the input system
   * is wired up: at that point the game screen is still display:none, every
   * rectangle measures zero, and a zero radius silently pins the stick to the
   * centre so the player cannot move at all.
   */
  _readStickHome() {
    if (!this.stickBase) return 0;
    const r = this.stickBase.getBoundingClientRect();
    if (r.width > 8) {
      this.stick.radius = r.width * 0.46;
    } else {
      const zone = this.stickZone ? this.stickZone.getBoundingClientRect().width : 0;
      this.stick.radius = clamp(zone * 0.24, 36, 58);
    }
    return this.stick.radius;
  }

  /** Registers a HUD element as a virtual button. */
  bindButton(el, name, { repeat = false } = {}) {
    if (!el) return;
    this._buttonEls.set(name, el);
    const press = (e) => {
      e.preventDefault(); e.stopPropagation();
      el.setPointerCapture?.(e.pointerId);
      el.classList.add('down');
      this._queuedPress.add(name);
      this.down[name] = true;
    };
    const release = (e) => {
      e.stopPropagation();
      el.classList.remove('down');
      this._queuedRelease.add(name);
      this.down[name] = false;
    };
    el.addEventListener('pointerdown', press, { passive: false });
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    // Pointer capture means pointerleave may never arrive, so listen for the
    // capture ending too - otherwise a thumb sliding off leaves a button stuck.
    el.addEventListener('lostpointercapture', (e) => { if (this.down[name]) release(e); });
    el.addEventListener('pointerleave', (e) => { if (!repeat && this.down[name]) release(e); });
  }

  /* ------------------------------ handlers ------------------------------- */

  _lookDown(e) {
    if (!this.enabled) return;
    if (this.lookPointer !== -1) return;
    this.lookPointer = e.pointerId;
    this._lookLast = { x: e.clientX, y: e.clientY };
  }

  _lookMove(e) {
    if (!this.enabled || e.pointerId !== this.lookPointer) return;
    const dx = e.clientX - this._lookLast.x;
    const dy = e.clientY - this._lookLast.y;
    this._lookLast.x = e.clientX; this._lookLast.y = e.clientY;
    this.lookDelta.x += dx * this.sensitivity;
    this.lookDelta.y += dy * this.sensitivity * (this.invertY ? -1 : 1);
  }

  _lookUp(e) {
    if (e.pointerId === this.lookPointer) this.lookPointer = -1;
  }

  _stickDown(e) {
    if (!this.enabled) return;
    e.preventDefault();
    if (this.stick.active) return;
    this._readStickHome();
    this.stick.active = true;
    this.stick.id = e.pointerId;
    // The stick re-centres under the thumb, but never leaves its corner.
    const r = this.stickZone.getBoundingClientRect();
    const cx = clamp(e.clientX, r.left + 60, r.right - 20);
    const cy = clamp(e.clientY, r.top + 20, r.bottom - 60);
    this.stick.ox = cx; this.stick.oy = cy;
    this._placeStickBase(cx, cy);
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
    // Dead-zone keeps the character from twitching while the thumb rests.
    const dead = r * 0.14;
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

  /**
   * Moves the ring under the thumb. Same left/bottom pair the stylesheet uses,
   * so the ring is anchored the same way whether it has been touched or not -
   * mixing the two shifted it a full height down the screen on release, and
   * after one drag it sat below the viewport where nothing could reach it.
   */
  _placeStickBase(cx, cy) {
    if (!this.stickBase) return;
    const parent = this.stickZone.getBoundingClientRect();
    this.stickBase.style.left = (cx - parent.left) + 'px';
    this.stickBase.style.bottom = (parent.bottom - cy) + 'px';
  }

  /** Puts the ring back in its corner. */
  _homeStickBase() {
    if (!this.stickBase) return;
    this.stickBase.style.left = '';
    this.stickBase.style.bottom = '';
  }

  _stickUp(e) {
    if (!this.stick.active || e.pointerId !== this.stick.id) return;
    this.stick.active = false;
    this.stick.id = -1;
    this.move.x = 0; this.move.y = 0;
    if (this.stickKnob) this.stickKnob.style.transform = '';
    this._homeStickBase();
    this.stickZone.classList.remove('active');
  }

  _key(e, isDown) {
    const code = e.code;
    if (isDown && (code === 'Tab' || code === 'Escape')) e.preventDefault();
    if (this._keys[code] === isDown) return;
    this._keys[code] = isDown;

    const set = (name) => {
      if (isDown) { this._queuedPress.add(name); this.down[name] = true; }
      else { this._queuedRelease.add(name); this.down[name] = false; }
    };
    switch (code) {
      case 'Space': set('jump'); break;
      case 'KeyC': case 'ControlLeft': case 'ControlRight': set('crouch'); break;
      case 'KeyF': case 'Enter': set('primary'); break;
      case 'KeyE': set('use'); break;
      case 'KeyG': set('spawn'); break;
      case 'KeyX': set('delete'); break;
      case 'Digit1': if (isDown) this.onWeaponSelect?.(0); break;
      case 'Digit2': if (isDown) this.onWeaponSelect?.(1); break;
      case 'Digit3': if (isDown) this.onWeaponSelect?.(2); break;
      case 'Tab': if (isDown) this.onToggleDrawer?.(); break;
      case 'Escape': if (isDown) this.onPause?.(); break;
      default: break;
    }
    this._updateKeyboardMove();
  }

  _updateKeyboardMove() {
    if (this.stick.active) return;
    const k = this._keys;
    const x = (k['KeyD'] || k['ArrowRight'] ? 1 : 0) - (k['KeyA'] || k['ArrowLeft'] ? 1 : 0);
    const y = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0);
    const len = Math.hypot(x, y) || 1;
    this.move.x = x / len; this.move.y = y / len;
  }

  /* ------------------------------- frame --------------------------------- */

  beginFrame() {
    for (const b of BUTTONS) {
      this.pressed[b] = this._queuedPress.has(b);
      this.released[b] = this._queuedRelease.has(b);
    }
    this._queuedPress.clear();
    this._queuedRelease.clear();
  }

  consumeLook() {
    const d = { x: this.lookDelta.x, y: this.lookDelta.y };
    this.lookDelta.x = 0; this.lookDelta.y = 0;
    return d;
  }

  /** Called when the game is suspended so nothing sticks down. */
  reset() {
    for (const b of BUTTONS) { this.down[b] = false; this.pressed[b] = false; this.released[b] = false; }
    this._queuedPress.clear(); this._queuedRelease.clear();
    for (const el of this._buttonEls.values()) el.classList.remove('down');
    this.move.x = 0; this.move.y = 0;
    this.lookDelta.x = 0; this.lookDelta.y = 0;
    this.stick.active = false; this.stick.id = -1; this.lookPointer = -1;
    for (const k in this._keys) this._keys[k] = false;
    if (this.stickKnob) this.stickKnob.style.transform = '';
    this._homeStickBase();
    this.stickZone?.classList.remove('active');
  }

  setButtonVisible(name, visible) {
    const el = this._buttonEls.get(name);
    if (el) el.style.display = visible ? '' : 'none';
  }
}

export const input = new InputManager();
