/* =============================================================================
   Touch, mouse and keyboard.

   The joystick moves the camera. Dragging anywhere else on the screen turns
   it, two fingers pinch it closer or further, the arrow buttons lift and
   lower it. On a desktop: WASD / arrows move, Q and E lower and raise,
   drag with the mouse to look, the wheel to zoom.
   ========================================================================== */

export class Input {
  constructor(root) {
    this.root = root;
    this.stick = { x: 0, y: 0, id: null, active: false };
    this.look = { dx: 0, dy: 0 };
    this.zoom = 0;
    this.vert = 0;
    this.keys = new Set();
    this.lookTouches = new Map();
    this.pinchDist = 0;
    this.taps = [];
    this.enabled = true;

    this.base = document.getElementById('stick-base');
    this.knob = document.getElementById('stick-knob');

    const opts = { passive: false };
    this.base.addEventListener('pointerdown', (e) => this.stickDown(e), opts);
    window.addEventListener('pointermove', (e) => this.pointerMove(e), opts);
    window.addEventListener('pointerup', (e) => this.pointerUp(e), opts);
    window.addEventListener('pointercancel', (e) => this.pointerUp(e), opts);

    const view = document.getElementById('view');
    this.view = view;
    view.addEventListener('pointerdown', (e) => this.viewDown(e), opts);
    view.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom -= e.deltaY * 0.01; }, opts);
    view.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.resetStick(); });

    for (const [id, dir] of [['btn-up', 1], ['btn-down', -1]]) {
      const b = document.getElementById(id);
      const on = (e) => { e.preventDefault(); this.vertHeld = dir; b.classList.add('held'); };
      const off = () => { if (this.vertHeld === dir) this.vertHeld = 0; b.classList.remove('held'); };
      b.addEventListener('pointerdown', on, opts);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointerleave', off);
      b.addEventListener('pointercancel', off);
    }
    this.vertHeld = 0;
  }

  /* -------------------------------- joystick ------------------------------ */

  stickDown(e) {
    e.preventDefault();
    if (this.stick.id !== null) return;
    this.stick.id = e.pointerId;
    this.stick.active = true;
    try { this.base.setPointerCapture(e.pointerId); } catch (_) { /* not all browsers */ }
    this.moveStick(e);
  }

  moveStick(e) {
    const r = this.base.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const max = r.width * 0.42;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
    this.stick.x = dx / max;
    this.stick.y = dy / max;
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  resetStick() {
    this.stick.id = null;
    this.stick.active = false;
    this.stick.x = 0; this.stick.y = 0;
    this.knob.style.transform = 'translate(0px, 0px)';
  }

  /* --------------------------------- looking ------------------------------ */

  viewDown(e) {
    if (!this.enabled) return;
    e.preventDefault();
    this.lookTouches.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    try { this.view.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
    if (this.lookTouches.size === 2) this.pinchDist = this.pinchSpan();
  }

  pinchSpan() {
    const pts = [...this.lookTouches.values()];
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  pointerMove(e) {
    if (e.pointerId === this.stick.id) { e.preventDefault(); this.moveStick(e); return; }
    const t = this.lookTouches.get(e.pointerId);
    if (!t) return;
    e.preventDefault();
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    t.x = e.clientX; t.y = e.clientY;
    if (this.lookTouches.size >= 2) {
      const span = this.pinchSpan();
      this.zoom += (span - this.pinchDist) * 0.03;
      this.pinchDist = span;
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
    const moved = Math.hypot(e.clientX - t.sx, e.clientY - t.sy);
    if (moved < 8 && performance.now() - t.t < 300 && this.lookTouches.size === 0) {
      this.taps.push({ x: e.clientX, y: e.clientY });
    }
    if (this.lookTouches.size === 2) this.pinchDist = this.pinchSpan();
  }

  /* ------------------------------- per frame ------------------------------ */

  /** Movement in camera space: x right, y forward, z up. */
  axes() {
    let x = this.stick.x, y = -this.stick.y, z = this.vertHeld;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyE') || k.has('Space')) z += 1;
    if (k.has('KeyQ') || k.has('KeyC')) z -= 1;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y, z: Math.max(-1, Math.min(1, z)), fast: k.has('ShiftLeft') || k.has('ShiftRight') };
  }

  consumeLook() {
    const l = { dx: this.look.dx, dy: this.look.dy };
    this.look.dx = 0; this.look.dy = 0;
    return l;
  }

  consumeZoom() { const z = this.zoom; this.zoom = 0; return z; }
  consumeTaps() { const t = this.taps; this.taps = []; return t; }
}
