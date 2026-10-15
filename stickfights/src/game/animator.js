/* =============================================================================
   Plays clips on one stickman, in three layers:

     base     what the whole body is doing: standing, walking, lying there
     overlay  an upper-body hold the legs carry on under: fists up while
              shuffling in, a crate overhead while walking
     action   one-shots on top: a punch, a wave, a flinch

   Changing the base clip crossfades from wherever the body was, and an action
   fades in and back out, so nothing pops. An action that interrupts another
   fades from the pose the first one had reached rather than snapping back.

   With the flipbook style on there are no fades at all: every key is held
   and then cut to the next, the way a hand-drawn animation runs.
   ========================================================================== */
import { CLIPS, sampleClip, eventsBetween, blendInto, MASKS } from './clips.js';
import { P, copyPose } from './skeleton.js';
import { smooth, moveToward } from '../core/util.js';

/** Global animation style, switched from the settings. */
export const STYLE = { flipbook: false };

export class Animator {
  constructor() {
    this.base = { clip: CLIPS.idle, t: Math.random() * 2, speed: 1 };
    this.from = P();          // where the base layer was when it last changed
    this.fade = 1;
    this.fadeDur = 0;
    this.overlay = null;      // { clip, t, mask, w, target }
    this.action = null;       // { name, clip, t, speed, mask, w, fadeIn, fadeOut, ending }
    this.ghost = null;        // { pose, w, rate }: an interrupted action fading away
    this.pose = P();
    this.basePose = P();
    this.events = [];
    this.freeze = 0;          // hit stop: a few hundredths of a second of nothing
    this._tmp = P();
    this._tmp2 = P();
  }

  get baseName() { return this.base.clip.name; }
  get acting() { return !!this.action && !this.action.ending; }
  get actionName() { return this.acting ? this.action.name : null; }
  /** Seconds into the current action, or -1. */
  get actionTime() { return this.acting ? this.action.t : -1; }
  /** The base clip has reached its end (for clips that do not loop). */
  get baseDone() { return !this.base.clip.loop && this.base.t >= this.base.clip.duration; }

  play(name, { blend = 0.15, speed = 1, restart = false, t = 0 } = {}) {
    const clip = CLIPS[name];
    if (!clip) throw new Error('no clip called ' + name);
    if (this.base.clip === clip && !restart) { this.base.speed = speed; return; }
    copyPose(this.basePose, this.from);
    this.fade = 0;
    this.fadeDur = STYLE.flipbook ? 0 : blend;
    this.base = { clip, t, speed };
  }

  act(name, { speed = 1, mask, fadeIn = 0.06, fadeOut = 0.14 } = {}) {
    const clip = CLIPS[name];
    if (!clip) throw new Error('no clip called ' + name);
    if (this.action && this.action.w > 0) {
      this.ghost = { pose: copyPose(this.pose), w: 1, rate: 1 / Math.max(0.05, fadeIn * 1.5), mask: this.action.mask };
    }
    this.action = {
      name, clip, t: 0, speed,
      mask: MASKS[mask || clip.mask || 'full'],
      w: 0, fadeIn, fadeOut, ending: false,
    };
    return this.action;
  }

  stopAction(fadeOut = 0.12) {
    if (this.action && !this.action.ending) {
      this.action.ending = true;
      this.action.fadeOut = fadeOut;
    }
  }

  setOverlay(name, mask = 'upper') {
    if (!name) { if (this.overlay) this.overlay.target = 0; return; }
    if (this.overlay && this.overlay.clip.name === name) { this.overlay.target = 1; return; }
    this.overlay = { clip: CLIPS[name], t: 0, mask: MASKS[mask], w: this.overlay ? this.overlay.w * 0.5 : 0, target: 1 };
  }

  get overlayName() { return this.overlay && this.overlay.target > 0 ? this.overlay.clip.name : null; }

  update(dt) {
    this.events.length = 0;
    if (this.freeze > 0) {
      this.freeze -= dt;
      return;
    }
    const snap = STYLE.flipbook;
    const b = this.base;
    const t0 = b.t;
    b.t += dt * b.speed;
    eventsBetween(b.clip, t0, b.t, this.events);
    if (!b.clip.loop && b.t > b.clip.duration) b.t = b.clip.duration;
    if (this.fade < 1) this.fade = this.fadeDur > 0 && !snap ? Math.min(1, this.fade + dt / this.fadeDur) : 1;

    const o = this.overlay;
    if (o) {
      o.t += dt;
      o.w = snap ? o.target : moveToward(o.w, o.target, dt / 0.15);
      if (o.w <= 0 && o.target === 0) this.overlay = null;
    }

    const a = this.action;
    if (a) {
      const a0 = a.t;
      a.t += dt * a.speed;
      if (!a.ending) {
        eventsBetween(a.clip, a0, a.t, this.events);
        a.w = snap ? 1 : Math.min(1, a.w + dt / Math.max(a.fadeIn, 1e-3));
        if (!a.clip.loop && a.t >= a.clip.duration) a.ending = true;
      } else {
        a.w = snap ? 0 : a.w - dt / Math.max(a.fadeOut, 1e-3);
        if (a.w <= 0) this.action = null;
      }
    }

    if (this.ghost) {
      this.ghost.w -= dt * this.ghost.rate;
      if (this.ghost.w <= 0 || snap) this.ghost = null;
    }
  }

  /** The pose, all layers composed. */
  sample() {
    const flip = STYLE.flipbook;
    const out = this.pose;
    sampleClip(this.base.clip, this.base.t, out, flip);
    if (this.fade < 1) {
      const from = copyPose(this.from, this._tmp);
      blendInto(from, out, smooth(this.fade));
      copyPose(from, out);
    }
    copyPose(out, this.basePose);

    if (this.overlay && this.overlay.w > 0) {
      sampleClip(this.overlay.clip, this.overlay.t, this._tmp2, flip);
      blendInto(out, this._tmp2, smooth(this.overlay.w), this.overlay.mask);
    }
    if (this.ghost) blendInto(out, this.ghost.pose, smooth(this.ghost.w), this.ghost.mask);
    const a = this.action;
    if (a && a.w > 0) {
      sampleClip(a.clip, a.t, this._tmp2, flip);
      blendInto(out, this._tmp2, smooth(a.w), a.mask);
    }
    return out;
  }
}
