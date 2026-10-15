/* =============================================================================
   Touch and mouse, turned into gestures on the play area:

     tap        a touch or click that barely moved and did not last
     drag       a touch that moved: the owner decides on the first move
                whether it grabs something or pans the view
     pinch      two fingers: zoom, and pan by the midpoint
     wheel      zoom on a desktop
     hover      where a mouse is, for the spawn preview

   A right or middle mouse drag always pans.
   ========================================================================== */

const TAP_SLOP = 9;       // px a tap may wander
const TAP_TIME = 450;     // ms a tap may last

export class Gestures {
  /**
   * @param {HTMLElement} el
   * @param {object} h  { tap(x, y), dragStart(x, y, button) -> 'grab' | 'pan' | null,
   *                    dragMove(x, y, dx, dy, mode), dragEnd(x, y, mode),
   *                    pinch(scale, cx, cy, dx, dy), wheel(dy, x, y), hover(x, y), leave() }
   */
  constructor(el, h) {
    this.el = el;
    this.h = h;
    this.pts = new Map();
    this.drag = null;       // { id, x0, y0, t0, x, y, mode, button }
    this.pinchState = null;
    this.enabled = true;
    const opt = { passive: false };
    el.addEventListener('pointerdown', (e) => this.down(e), opt);
    window.addEventListener('pointermove', (e) => this.move(e), opt);
    window.addEventListener('pointerup', (e) => this.up(e), opt);
    window.addEventListener('pointercancel', (e) => this.up(e, true), opt);
    el.addEventListener('wheel', (e) => { e.preventDefault(); if (this.enabled) h.wheel(e.deltaY, e.clientX, e.clientY); }, opt);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerleave', () => h.leave && h.leave());
  }

  down(e) {
    if (!this.enabled) return;
    e.preventDefault();
    try { this.el.setPointerCapture(e.pointerId); } catch (_) { /* not everywhere */ }
    this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pts.size === 2) {
      // a second finger: whatever the first was doing, this is a pinch now
      if (this.drag && this.drag.mode) this.h.dragEnd(this.drag.x, this.drag.y, this.drag.mode);
      this.drag = null;
      const [a, b] = [...this.pts.values()];
      this.pinchState = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      return;
    }
    if (this.pts.size > 2) return;
    this.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), mode: null, button: e.button };
  }

  move(e) {
    if (!this.enabled) return;
    if (this.pts.has(e.pointerId)) this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    else if (e.pointerType === 'mouse') { this.h.hover && this.h.hover(e.clientX, e.clientY); return; }
    if (this.pinchState && this.pts.size >= 2) {
      e.preventDefault();
      const [a, b] = [...this.pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const p = this.pinchState;
      this.h.pinch(d / p.d, cx, cy, cx - p.cx, cy - p.cy);
      p.d = d; p.cx = cx; p.cy = cy;
      return;
    }
    const g = this.drag;
    if (!g || g.id !== e.pointerId) return;
    e.preventDefault();
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    g.x = e.clientX;
    g.y = e.clientY;
    if (!g.mode) {
      if (Math.hypot(g.x - g.x0, g.y - g.y0) < TAP_SLOP) return;
      g.mode = this.h.dragStart(g.x0, g.y0, g.button) || 'none';
      // catch up with the distance the finger moved before the drag was recognised
      this.h.dragMove(g.x, g.y, g.x - g.x0, g.y - g.y0, g.mode);
      return;
    }
    this.h.dragMove(g.x, g.y, dx, dy, g.mode);
    if (e.pointerType === 'mouse') this.h.hover && this.h.hover(e.clientX, e.clientY);
  }

  up(e, cancelled = false) {
    if (!this.pts.has(e.pointerId)) return;
    this.pts.delete(e.pointerId);
    if (this.pinchState) {
      if (this.pts.size < 2) this.pinchState = null;
      return;
    }
    const g = this.drag;
    if (!g || g.id !== e.pointerId) return;
    this.drag = null;
    if (g.mode) { this.h.dragEnd(e.clientX, e.clientY, g.mode); return; }
    const quick = performance.now() - g.t0 < TAP_TIME;
    if (!cancelled && quick && g.button === 0 && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < TAP_SLOP) {
      this.h.tap(g.x0, g.y0);
    }
  }

  /** Forget any gesture under way (a menu opened over the top of it). */
  reset() {
    if (this.drag && this.drag.mode) this.h.dragEnd(this.drag.x, this.drag.y, this.drag.mode);
    this.drag = null;
    this.pinchState = null;
    this.pts.clear();
  }
}
