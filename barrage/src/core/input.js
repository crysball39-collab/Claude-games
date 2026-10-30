/* =============================================================================
   Touch, mouse and keyboard.

   On a phone: put your left thumb down anywhere in the lower left and the
   joystick appears under it. Drag anywhere else that is not a button to
   swing the camera round; pinch to bring it in or out. Every on-screen
   button carries a data-act naming what it does, and is read here as held
   (BLOCK) or pressed once (everything else).

   On a desktop: WASD or the arrows move, drag the mouse to look, click to
   punch, right-click to kick, the wheel zooms. J punch, K kick, L or Q
   block, Space jump, C crouch, Shift sprint (held), E use, I or Tab the
   inventory, Esc pause.
   ========================================================================== */

const KEYS = {
  KeyJ: 'punch', KeyK: 'kick', KeyL: 'block', KeyQ: 'block', Space: 'jump', KeyC: 'crouch',
  KeyE: 'use', KeyI: 'inventory', Tab: 'inventory', Escape: 'pause', KeyP: 'pause',
};

export class Input {
  constructor() {
    this.stick = { x: 0, y: 0, id: null, cx: 0, cy: 0 };
    this.look = { dx: 0, dy: 0 };
    this.zoom = 0;
    this.keys = new Set();
    this.acts = {};                  // act -> { held, presses }
    this.lookTouches = new Map();
    this.pinch = 0;
    this.enabled = true;
    this.mouse = null;
  }

  /** Wires up the page. view: the canvas; zone: where the stick may appear; base/knob: its parts. */
  attach({ view, zone, base, knob, buttons }) {
    this.view = view; this.zone = zone; this.base = base; this.knob = knob;
    const opts = { passive: false };
    zone.addEventListener('pointerdown', (e) => this.stickDown(e), opts);
    view.addEventListener('pointerdown', (e) => this.viewDown(e), opts);
    window.addEventListener('pointermove', (e) => this.pointerMove(e), opts);
    window.addEventListener('pointerup', (e) => this.pointerUp(e), opts);
    window.addEventListener('pointercancel', (e) => this.pointerUp(e), opts);
    view.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom -= e.deltaY * 0.01; }, opts);
    view.addEventListener('contextmenu', (e) => e.preventDefault());
    zone.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      const act = KEYS[e.code];
      if (act) this.press(act);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const act = KEYS[e.code];
      if (act) this.release(act);
    });
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });

    for (const el of buttons) this.bindButton(el);
  }

  /** An on-screen button: pressed on touch-down (not on release), held until the finger lifts. */
  bindButton(el) {
    const act = el.dataset.act;
    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { el.setPointerCapture(e.pointerId); } catch { /* fine */ }
      el.classList.add('held');
      this.press(act);
    };
    const up = () => { el.classList.remove('held'); this.release(act); };
    el.addEventListener('pointerdown', down, { passive: false });
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  act(name) { return this.acts[name] || (this.acts[name] = { held: false, presses: 0 }); }
  press(name) { const a = this.act(name); a.held = true; a.presses++; }
  release(name) { this.act(name).held = false; }

  /** True once per press. */
  pressed(name) {
    const a = this.acts[name];
    if (!a || !a.presses || !this.enabled) return false;
    a.presses = 0;
    return true;
  }

  held(name) { return this.enabled && !!(this.acts[name] && this.acts[name].held); }

  releaseAll() {
    this.keys.clear();
    for (const a of Object.values(this.acts)) { a.held = false; a.presses = 0; }
    this.resetStick();
    this.lookTouches.clear();
  }

  /** Presses nobody read this frame are dropped, so a tap made in a menu does not fire later. */
  endFrame() {
    for (const a of Object.values(this.acts)) a.presses = 0;
  }

  /* -------------------------------- joystick ------------------------------ */

  stickDown(e) {
    if (!this.enabled || this.stick.id !== null) return;
    e.preventDefault();
    this.stick.id = e.pointerId;
    try { this.zone.setPointerCapture(e.pointerId); } catch { /* not all browsers */ }
    // the stick appears under the thumb
    const zr = this.zone.getBoundingClientRect();
    this.stick.cx = e.clientX;
    this.stick.cy = e.clientY;
    this.base.style.left = `${e.clientX - zr.left}px`;
    this.base.style.top = `${e.clientY - zr.top}px`;
    this.base.classList.add('active');
    this.moveStick(e);
  }

  moveStick(e) {
    const max = this.base.offsetWidth * 0.42 || 48;
    let dx = e.clientX - this.stick.cx, dy = e.clientY - this.stick.cy;
    const d = Math.hypot(dx, dy);
    if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
    this.stick.x = dx / max;
    this.stick.y = dy / max;
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  resetStick() {
    this.stick.id = null;
    this.stick.x = 0; this.stick.y = 0;
    if (this.knob) this.knob.style.transform = 'translate(0px, 0px)';
    if (this.base) { this.base.classList.remove('active'); this.base.style.left = ''; this.base.style.top = ''; }
  }

  /* --------------------------------- looking ------------------------------ */

  viewDown(e) {
    if (!this.enabled) return;
    e.preventDefault();
    const t = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, at: performance.now(), mouse: e.pointerType === 'mouse', button: e.button };
    this.lookTouches.set(e.pointerId, t);
    try { this.view.setPointerCapture(e.pointerId); } catch { /* fine */ }
    if (t.mouse && e.button === 2) this.press('kick');
    if (this.lookTouches.size === 2) this.pinch = this.span();
  }

  span() {
    const p = [...this.lookTouches.values()];
    return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  }

  pointerMove(e) {
    if (e.pointerId === this.stick.id) { e.preventDefault(); this.moveStick(e); return; }
    const t = this.lookTouches.get(e.pointerId);
    if (!t) return;
    e.preventDefault();
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    t.x = e.clientX; t.y = e.clientY;
    if (this.lookTouches.size >= 2) {
      const s = this.span();
      this.zoom += (s - this.pinch) * 0.02;
      this.pinch = s;
      return;
    }
    this.look.dx += dx;
    this.look.dy += dy;
  }

  pointerUp(e) {
    if (e.pointerId === this.stick.id) { this.resetStick(); return; }
    const t = this.lookTouches.get(e.pointerId);
    if (!t) return;
    this.lookTouches.delete(e.pointerId);
    // a mouse click that did not drag is a punch
    if (t.mouse && t.button === 0 && Math.hypot(e.clientX - t.sx, e.clientY - t.sy) < 6 && performance.now() - t.at < 350) {
      this.press('punch');
      this.release('punch');
    }
    if (this.lookTouches.size === 2) this.pinch = this.span();
  }

  /* ------------------------------- per frame ------------------------------ */

  /** Movement: x to the right, y forward, from the stick and the keys together. */
  moveAxes() {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = this.stick.x, y = -this.stick.y;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  /** Shift held on a keyboard sprints, as well as the on-screen switch. */
  get sprintKey() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }

  consumeLook() {
    const l = { dx: this.look.dx, dy: this.look.dy };
    this.look.dx = 0; this.look.dy = 0;
    return l;
  }

  consumeZoom() { const z = this.zoom; this.zoom = 0; return z; }
}
