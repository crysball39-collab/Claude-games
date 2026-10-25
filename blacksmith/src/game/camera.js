/* =============================================================================
   The third person camera. It orbits a point just above your shoulders: drag
   to swing it round, and when you run sideways it drifts round behind you by
   itself. It will not go through walls - it slides in toward you instead.

   It can also be lent out: the anvil borrows it for a close-up, and it eases
   there and back.
   ========================================================================== */
import { Vector3 } from 'three';
import { clamp, damp, dampAngle, angleDelta, easeInOutCubic } from '../core/util.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;              // the camera sits at +Z of you when this is 0
    this.pitch = 0.34;
    this.dist = 5.4;
    this.minDist = 2.4;
    this.maxDist = 8.5;
    this.target = new Vector3();
    this.effDist = this.dist;
    this.sinceLook = 99;
    this.shakeT = 0;
    this.shakeAmp = 0;
    // borrowed shots
    this.focus = null;         // { pos, look }
    this.blend = 0;            // 0 = following you, 1 = on the borrowed shot
    this._follow = { pos: new Vector3(), look: new Vector3() };
    this._v = new Vector3();
    this._blendSpeed = 1.6;
  }

  /** Puts the camera straight behind you, no easing. */
  snapBehind(pos, yaw) {
    this.yaw = yaw + Math.PI;
    this.pitch = 0.34;
    this.target.set(pos.x, pos.y + 1.45, pos.z);
    this.effDist = this.dist;
  }

  shake(amount = 0.08, time = 0.18) {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
    this.shakeT = Math.max(this.shakeT, time);
  }

  /** Takes the camera to a fixed shot; `seconds` to get there. */
  lend(pos, look, seconds = 0.7) {
    this.focus = { pos: pos.clone(), look: look.clone() };
    this._blendSpeed = 1 / seconds;
  }

  /** Moves the borrowed shot without easing in again (the anvil reframing). */
  reframe(pos, look) {
    if (!this.focus) return;
    this.focus.pos.copy(pos);
    this.focus.look.copy(look);
  }

  giveBack(seconds = 0.6) {
    this.focus = null;
    this._blendSpeed = 1 / seconds;
  }

  /**
   * look: { x, y, zoom } from the input this frame
   * player: { pos, yaw, moving, vel }
   * area: { cameraAllowed(x, y, z), collider, clampCamera(from, to) }
   */
  update(dt, look, player, area) {
    // orbit
    if (look && (look.x || look.y)) this.sinceLook = 0; else this.sinceLook += dt;
    if (look) {
      this.yaw -= look.x;
      this.pitch = clamp(this.pitch + look.y, -0.12, 1.12);
      this.dist = clamp(this.dist + (look.zoom || 0), this.minDist, this.maxDist);
    }
    // running across the screen, it comes round behind you
    if (player.moving && this.sinceLook > 1.2 && !this.focus) {
      const behind = player.yaw + Math.PI;
      const off = angleDelta(this.yaw, behind);
      const side = Math.abs(Math.sin(off));
      if (Math.abs(off) < 2.4) this.yaw = dampAngle(this.yaw, behind, 1.1 * side, dt);
    }
    this.target.x = damp(this.target.x, player.pos.x, 14, dt);
    this.target.y = damp(this.target.y, player.pos.y + 1.45, 10, dt);
    this.target.z = damp(this.target.z, player.pos.z, 14, dt);

    // where it would like to be, and how far back the walls let it
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dx = Math.sin(this.yaw) * cp, dy = sp, dz = Math.cos(this.yaw) * cp;
    let allowed = this.dist;
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const d = (this.dist * i) / steps;
      const x = this.target.x + dx * d, y = this.target.y + dy * d, z = this.target.z + dz * d;
      const ok = (!area.cameraAllowed || area.cameraAllowed(x, y, z)) && !area.collider.blocksCamera(x, y, z);
      if (!ok) { allowed = Math.max(0.9, d - this.dist / steps - 0.15); break; }
    }
    // in fast, out slowly, so a post going past does not make it jump
    this.effDist = allowed < this.effDist ? damp(this.effDist, allowed, 30, dt) : damp(this.effDist, allowed, 3, dt);
    const F = this._follow;
    F.pos.set(this.target.x + dx * this.effDist, this.target.y + dy * this.effDist, this.target.z + dz * this.effDist);
    if (area.clampCamera) area.clampCamera(this.target, F.pos);
    F.pos.y = Math.max(F.pos.y, 0.35);
    F.look.copy(this.target);

    // blending to and from a borrowed shot
    const want = this.focus ? 1 : 0;
    if (this.blend !== want) {
      this.blend = clamp(this.blend + Math.sign(want - this.blend) * dt * this._blendSpeed, 0, 1);
    }
    const cam = this.camera;
    if (this.blend <= 0) {
      cam.position.copy(F.pos);
      this._lookNow = F.look;
    } else {
      const k = easeInOutCubic(this.blend);
      const shot = this.focus || this._lastFocus;
      if (this.focus) this._lastFocus = this.focus;
      cam.position.lerpVectors(F.pos, shot.pos, k);
      this._lookNow = this._v.lerpVectors(F.look, shot.look, k);
    }
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeT) * 6;
      cam.position.x += (Math.random() - 0.5) * a;
      cam.position.y += (Math.random() - 0.5) * a;
    } else {
      this.shakeAmp = 0;
    }
    cam.lookAt(this._lookNow);
  }
}
