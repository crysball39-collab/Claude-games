/* =============================================================================
   Layered animation playback.

     base   - locomotion (idle / walk / run / crouch / jump / fall), crossfaded
     upper  - a held pose for the equipped item, masked to the spine and arms
     action - a one shot upper body clip, currently the two jabs
     full   - a one shot whole body clip that beats everything, i.e. getting up
   ========================================================================== */
import { CLIPS, sampleTrack, sampleScalar, UPPER_MASK } from './animations.js';
import { clamp01 } from '../core/util.js';

const _s = { x: 0, y: 0, z: 0 };

function advance(state, dt) {
  if (!state.clip) return;
  state.time += dt * state.speed;
  const d = state.clip.duration;
  if (state.clip.loop) {
    state.time %= d;
    if (state.time < 0) state.time += d;
  } else if (state.time > d) {
    state.time = d;
    state.finished = true;
  }
}

export class Animator {
  constructor(rig) {
    this.rig = rig;
    this.pose = rig.bones.map(() => ({ x: 0, y: 0, z: 0 }));

    this.base = { clip: CLIPS.idle, time: 0, speed: 1, finished: false };
    this.prev = { clip: null, time: 0, speed: 1, finished: false };
    this.fade = 1; this.fadeDur = 0.2;

    this.upper = { clip: null, time: 0, speed: 1, finished: false };
    this.upperWeight = 0; this.upperTarget = 0;

    this.action = { clip: null, time: 0, speed: 1, finished: false };
    this.actionWeight = 0;
    this.onActionEnd = null;

    this.full = { clip: null, time: 0, speed: 1, finished: false };
    this.fullWeight = 0; this.fullTarget = 0;
    this.onFullEnd = null;

    this.rootYOffset = 0;
    this.rootYAbs = null;
    this.rootPitch = 0;
  }

  /* ------------------------------- control ------------------------------- */

  playBase(name, { fade = 0.22, speed = 1, restart = false } = {}) {
    const clip = CLIPS[name];
    if (!clip) return;
    if (this.base.clip === clip && !restart) { this.base.speed = speed; return; }
    this.prev.clip = this.base.clip;
    this.prev.time = this.base.time;
    this.prev.speed = this.base.speed;
    this.base = { clip, time: 0, speed, finished: false };
    this.fade = fade > 0 ? 0 : 1;
    this.fadeDur = Math.max(0.0001, fade);
  }

  setBaseSpeed(s) { this.base.speed = s; }

  setUpper(name, { fade = 0.2 } = {}) {
    const clip = name ? CLIPS[name] : null;
    if (this.upper.clip === clip) { this.upperTarget = clip ? 1 : 0; return; }
    if (clip) {
      this.upper = { clip, time: 0, speed: 1, finished: false };
      this.upperTarget = 1;
      if (this.upperWeight === 0) this.upperWeight = 0;
    } else {
      this.upperTarget = 0;
    }
    this.upperFade = fade;
  }

  playAction(name, onEnd = null) {
    const clip = CLIPS[name];
    if (!clip) return false;
    this.action = { clip, time: 0, speed: 1, finished: false };
    this.actionWeight = 0;
    this.onActionEnd = onEnd;
    return true;
  }

  get actionName() { return this.action.clip ? this.action.clip.name : null; }
  get actionTime() { return this.action.time; }
  get actionActive() { return !!this.action.clip; }

  cancelAction() { this.action.clip = null; this.actionWeight = 0; this.onActionEnd = null; }

  playFull(name, onEnd = null) {
    const clip = CLIPS[name];
    if (!clip) return false;
    this.full = { clip, time: 0, speed: 1, finished: false };
    this.fullTarget = 1;
    this.onFullEnd = onEnd;
    return true;
  }

  cancelFull() { this.full.clip = null; this.fullWeight = 0; this.fullTarget = 0; this.onFullEnd = null; }

  get fullActive() { return !!this.full.clip; }
  get fullTime() { return this.full.time; }
  get fullName() { return this.full.clip ? this.full.clip.name : null; }
  get fullDuration() { return this.full.clip ? this.full.clip.duration : 1; }

  /* -------------------------------- update ------------------------------- */

  update(dt) {
    advance(this.base, dt);
    if (this.prev.clip) advance(this.prev, dt);
    if (this.upper.clip) advance(this.upper, dt);
    if (this.action.clip) advance(this.action, dt);
    if (this.full.clip) advance(this.full, dt);

    if (this.fade < 1) {
      this.fade = clamp01(this.fade + dt / this.fadeDur);
      if (this.fade >= 1) this.prev.clip = null;
    }

    const uf = this.upperFade || 0.2;
    this.upperWeight += (this.upperTarget - this.upperWeight) * clamp01(dt / uf);
    if (this.upperTarget === 0 && this.upperWeight < 0.002) { this.upperWeight = 0; this.upper.clip = null; }

    if (this.action.clip) {
      const c = this.action.clip;
      // ease in fast, ease out over the tail of the clip
      const t = this.action.time;
      const inW = clamp01(t / 0.055);
      const outW = clamp01((c.duration - t) / 0.10);
      this.actionWeight = Math.min(inW, outW);
      if (this.action.finished) {
        const cb = this.onActionEnd;
        this.action.clip = null; this.actionWeight = 0; this.onActionEnd = null;
        cb?.();
      }
    }

    if (this.full.clip) {
      this.fullWeight += (this.fullTarget - this.fullWeight) * clamp01(dt / 0.16);
      if (this.full.finished && this.fullTarget === 1) {
        const cb = this.onFullEnd;
        this.fullTarget = 0;
        this.onFullEnd = null;
        cb?.();
      }
      if (this.fullTarget === 0 && this.fullWeight < 0.01) { this.full.clip = null; this.fullWeight = 0; }
    }

    this._applyPose();
  }

  _applyPose() {
    const bones = this.rig.bones;
    const pose = this.pose;
    const base = this.base, prev = this.prev;
    const fade = this.fade;

    let rootY = 0;

    for (let i = 0; i < bones.length; i++) {
      const name = bones[i].name;
      const p = pose[i];
      // base layer (+ crossfade)
      sampleClip(base, name, _s);
      p.x = _s.x; p.y = _s.y; p.z = _s.z;
      if (prev.clip && fade < 1) {
        sampleClip(prev, name, _s);
        const w = 1 - fade;
        p.x += (_s.x - p.x) * w;
        p.y += (_s.y - p.y) * w;
        p.z += (_s.z - p.z) * w;
      }
    }

    // base root height offset
    rootY = clipRootY(base) * fade + (prev.clip ? clipRootY(prev) * (1 - fade) : 0);

    // upper body layers
    if (this.upperWeight > 0.001 && this.upper.clip) {
      this._blendMasked(this.upper, this.upperWeight);
    }
    if (this.actionWeight > 0.001 && this.action.clip) {
      this._blendMasked(this.action, this.actionWeight);
    }

    // whole body override
    this.rootYAbs = null;
    this.rootPitch = 0;
    if (this.fullWeight > 0.001 && this.full.clip) {
      const w = this.fullWeight;
      for (let i = 0; i < bones.length; i++) {
        sampleClip(this.full, bones[i].name, _s);
        const p = pose[i];
        p.x += (_s.x - p.x) * w;
        p.y += (_s.y - p.y) * w;
        p.z += (_s.z - p.z) * w;
      }
      const c = this.full.clip;
      if (c.rootYAbs) this.rootYAbs = { value: sampleScalar(c.rootYAbs, this.full.time, c.duration, false), weight: w };
      if (c.rootPitch) this.rootPitch = sampleScalar(c.rootPitch, this.full.time, c.duration, false) * w;
      rootY *= (1 - w);
    }

    this.rootYOffset = rootY;

    // write into the rig
    for (let i = 0; i < bones.length; i++) {
      const b = bones[i];
      if (b.def.rigid) { b.anim.set(0, 0, 0); continue; }   // foot tips never turn
      const p = pose[i];
      b.anim.set(p.x, p.y, p.z);
    }
  }

  _blendMasked(state, weight) {
    const bones = this.rig.bones;
    for (let i = 0; i < bones.length; i++) {
      const name = bones[i].name;
      if (!UPPER_MASK.has(name)) continue;
      sampleClip(state, name, _s);
      const p = this.pose[i];
      p.x += (_s.x - p.x) * weight;
      p.y += (_s.y - p.y) * weight;
      p.z += (_s.z - p.z) * weight;
    }
  }
}

function sampleClip(state, boneName, out) {
  const clip = state.clip;
  if (!clip) { out.x = out.y = out.z = 0; return out; }
  const track = clip.tracks[boneName];
  if (!track) { out.x = out.y = out.z = 0; return out; }
  return sampleTrack(track, state.time, clip.duration, clip.loop, out);
}

function clipRootY(state) {
  const clip = state.clip;
  if (!clip || !clip.rootY) return 0;
  return sampleScalar(clip.rootY, state.time, clip.duration, clip.loop);
}
