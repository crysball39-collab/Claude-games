/* =============================================================================
   The 2D camera: a point it looks at, and how many pixels a metre takes.
   It pans with a drag, zooms with a pinch or the wheel, can follow one
   stickman around, and shakes a little when something heavy lands.

   It never shows more than a sliver below the floor, and never wanders off
   past the walls.
   ========================================================================== */
import { clamp, lerp, rand } from '../core/util.js';

export class Camera {
  constructor(sandbox) {
    this.sb = sandbox;
    this.x = 0;
    this.y = 3;
    this.ppm = 60;
    this.w = 800;
    this.h = 400;
    this.dpr = 1;
    this.follow = null;
    this.shakeAmt = 0;
    this.sx = 0;
    this.sy = 0;
    this.fitted = false;
  }

  get portrait() { return this.h > this.w * 1.1; }
  /** The default zoom: about sixteen metres across and six high, or seven and a half across held upright. */
  get homePpm() { return this.portrait ? clamp(this.w / 7.5, 28, 150) : clamp(Math.min(this.w / 16, this.h / 6.2), 28, 150); }
  /** The most of the screen the floor may take up; upright, there is room to spare for it. */
  get floorMax() { return this.portrait ? 0.62 : 0.25; }

  /** The camera height that puts the floor along the bottom `f` of the screen. */
  floorAt(f) { return (this.h / 2 / this.ppm) * (1 - 2 * f); }
  get minPpm() { return Math.max(12, this.w / (this.sb.right - this.sb.left + 4)); }
  get maxPpm() { return this.homePpm * 3.5; }

  resize(w, h, dpr) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    if (!this.fitted) { this.home(); this.fitted = true; }
    this.clamp();
  }

  /** Back to the default view: centred, the floor along the bottom fifth (a third, upright). */
  home() {
    this.ppm = this.homePpm;
    this.x = 0;
    this.y = this.floorAt(this.portrait ? 0.35 : 0.19);
    this.follow = null;
    this.glide = null;
    this.clamp();
  }

  /** Behind the title: a little further out, the floor low, room above for the title. */
  titleView() {
    this.ppm = this.homePpm * (this.portrait ? 0.9 : this.h < 520 ? 0.78 : 0.95);
    this.x = 0;
    this.y = this.floorAt(this.portrait ? 0.22 : 0.13);
    this.follow = null;
    this.glide = null;
    this.clamp();
  }

  toScreen(x, y) {
    return { x: (x - this.x) * this.ppm + this.w / 2 + this.sx, y: this.h / 2 - (y - this.y) * this.ppm + this.sy };
  }

  toWorld(sx, sy) {
    return { x: (sx - this.w / 2) / this.ppm + this.x, y: (this.h / 2 - sy) / this.ppm + this.y };
  }

  pan(dxPx, dyPx) {
    this.x -= dxPx / this.ppm;
    this.y += dyPx / this.ppm;
    this.follow = null;
    this.glide = null;
    this.clamp();
  }

  zoomAt(factor, sx, sy) {
    const before = this.toWorld(sx, sy);
    this.ppm = clamp(this.ppm * factor, this.minPpm, this.maxPpm);
    const after = this.toWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
  }

  clamp() {
    const halfW = this.w / 2 / this.ppm, halfH = this.h / 2 / this.ppm;
    const lo = this.sb.left - 1.5 + halfW, hi = this.sb.right + 1.5 - halfW;
    this.x = lo > hi ? (this.sb.left + this.sb.right) / 2 : clamp(this.x, lo, hi);
    // the floor only takes up so much of the screen, and the sky ends somewhere
    const lowest = halfH * (1 - 2 * this.floorMax);
    this.y = clamp(this.y, lowest, Math.max(lowest, 26 - halfH));
  }

  shake(amount) { this.shakeAmt = Math.min(1, this.shakeAmt + amount); }

  /** Slides over to look at (x, y) instead of jumping there. */
  glideTo(x, y) { this.glide = { x, y }; }

  update(dt) {
    if (this.glide) {
      const k = 1 - Math.exp(-dt * 6);
      this.x = lerp(this.x, this.glide.x, k);
      this.y = lerp(this.y, this.glide.y, k);
      if (Math.abs(this.x - this.glide.x) < 0.02 && Math.abs(this.y - this.glide.y) < 0.02) this.glide = null;
      this.clamp();
    }
    const f = this.follow;
    if (f && !f.removed) {
      const k = 1 - Math.exp(-dt * 4);
      this.x = lerp(this.x, f.pos.x, k);
      const base = this.floorAt(this.portrait ? 0.35 : 0.19);
      const want = f.pos.y + base - (f.pos.y > 0.5 ? 0.8 : 0);
      this.y = lerp(this.y, Math.max(want, base), k);
      this.clamp();
    } else if (f) {
      this.follow = null;
    }
    if (this.shakeAmt > 0.001) {
      const a = this.shakeAmt * 7;
      this.sx = rand(-a, a);
      this.sy = rand(-a, a);
      this.shakeAmt *= Math.exp(-dt * 9);
    } else {
      this.sx = this.sy = 0;
    }
  }

  /** Sets ctx up so world units draw directly, with y pointing up. */
  apply(ctx) {
    const d = this.dpr, p = this.ppm;
    ctx.setTransform(d * p, 0, 0, -d * p, d * (this.w / 2 - this.x * p + this.sx), d * (this.h / 2 + this.y * p + this.sy));
  }

  /** The world rectangle on screen, with some margin. */
  view(margin = 1) {
    const halfW = this.w / 2 / this.ppm, halfH = this.h / 2 / this.ppm;
    return { minX: this.x - halfW - margin, maxX: this.x + halfW + margin, minY: this.y - halfH - margin, maxY: this.y + halfH + margin };
  }
}
