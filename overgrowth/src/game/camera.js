/* =============================================================================
   The camera: a free flying spectator. The joystick slides it over the
   ground in the direction it faces, so pushing up always means "go where I am
   looking"; dragging turns it; it never goes into the ground.
   ========================================================================== */
import { Vector3 } from 'three';
import { clamp, approach } from '../core/util.js';

const _f = new Vector3(), _r = new Vector3();

export class FreeCamera {
  constructor(camera, game) {
    this.camera = camera;
    this.game = game;
    this.pos = new Vector3();
    this.vel = new Vector3();
    this.sens = 0.0052;
    this.reset();
  }

  /** Back to the starting view: the middle of the platform, from a little above. */
  reset() {
    this.pos.set(0, 6.5, 13);
    this.vel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = -0.42;
    this.apply();
  }

  forward(out) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  update(dt, input) {
    const look = input.consumeLook();
    this.yaw -= look.dx * this.sens;
    this.pitch = clamp(this.pitch - look.dy * this.sens, -1.5, 1.2);

    const a = input.axes();
    // faster the higher up it is, so crossing the map from altitude is quick
    const h = Math.max(0, this.pos.y);
    const speed = (6 + h * 0.6) * (a.fast ? 2.2 : 1);
    const fwd = _f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const want = new Vector3()
      .addScaledVector(fwd, a.y * speed)
      .addScaledVector(right, a.x * speed);
    want.y = a.z * (4 + h * 0.3);
    this.vel.lerp(want, approach(8, dt));
    this.pos.addScaledVector(this.vel, dt);

    const zoom = input.consumeZoom();
    if (zoom) this.pos.addScaledVector(this.forward(_f), zoom * (1 + h * 0.08));

    // stay out of the ground and inside a sensible box
    const g = this.game.groundAt(this.pos.x, this.pos.z);
    const floor = isFinite(g) ? g + 0.35 : -35;
    if (this.pos.y < floor) { this.pos.y = floor; if (this.vel.y < 0) this.vel.y = 0; }
    this.pos.x = clamp(this.pos.x, -75, 75);
    this.pos.z = clamp(this.pos.z, -75, 75);
    this.pos.y = Math.min(this.pos.y, 70);
    this.apply();
  }

  apply() {
    this.camera.position.copy(this.pos);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  /** Where the camera's gaze meets the ground, roughly, for the shadows. */
  focus(out) {
    const f = this.forward(_f);
    if (f.y < -0.05) {
      const t = Math.min(40, (this.pos.y - 0) / -f.y);
      return out.copy(this.pos).addScaledVector(f, t);
    }
    return out.copy(this.pos).addScaledVector(f.setY(0).normalize(), 12);
  }
}
