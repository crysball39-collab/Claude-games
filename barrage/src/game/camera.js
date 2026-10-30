/* =============================================================================
   The camera: over your shoulder. Dragging on the right of the screen swings
   it round you and up and down; pinching (or the mouse wheel) brings it in
   or out. It is pulled in front of any wall that would come between it and
   you, and never goes into the stands or under the sand. On the title
   screen it circles the arena instead; when you fall it circles you.
   ========================================================================== */
import { Vector3 } from 'three';
import { clamp, approach } from '../core/util.js';
import { R, WALL_T, WALL_H } from './arena.js';

const _f = new Vector3(), _want = new Vector3(), _d = new Vector3();
const STANDS_GAP = 56 * Math.PI / 180;

export class FollowCamera {
  constructor(camera, game) {
    this.camera = camera;
    this.game = game;
    this.yaw = 0;               // the camera looks along (-sin yaw, -cos yaw): yaw 0 looks north
    this.pitch = -0.3;
    this.dist = 4.6;
    this.sens = 0.0055;
    this.invertY = false;
    this.target = new Vector3(0, 1.4, 0);
    this.pos = new Vector3(0, 3, 5);
    this.shakeT = 0;
    this.shakeK = 0;
    this.mode = 'follow';       // follow | orbit | watch
    this.orbitA = 0;
  }

  forward(out) {
    const c = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * c, Math.sin(this.pitch), -Math.cos(this.yaw) * c);
  }

  /** Behind someone facing `heading`, at once. */
  snapBehind(f) {
    this.yaw = f.heading + Math.PI;
    this.pitch = -0.3;
    this.target.copy(f.chest.x);
    this.target.y += 0.25;
    this.place(1);
  }

  shake(k) { this.shakeK = Math.max(this.shakeK, k); this.shakeT = 0.3; }

  update(dt, input, subject) {
    if (input) {
      const look = input.consumeLook();
      this.yaw -= look.dx * this.sens;
      this.pitch = clamp(this.pitch - look.dy * this.sens * (this.invertY ? -1 : 1), -1.15, 0.42);
      const z = input.consumeZoom();
      if (z) this.dist = clamp(this.dist - z * 0.5, 2.4, 7.5);
    }
    if (this.mode === 'orbit') { this.orbit(dt); return; }
    if (this.mode === 'fixed') return;
    if (!subject) return;
    // follow the chest of whoever we are watching
    const c = subject.chest.x;
    const k = approach(this.mode === 'watch' ? 3 : 12, dt);
    this.target.x += (c.x - this.target.x) * k;
    this.target.y += (Math.max(0.6, c.y + 0.25) - this.target.y) * k;
    this.target.z += (c.z - this.target.z) * k;
    if (this.mode === 'watch') this.yaw += dt * 0.25;
    this.place(dt);
  }

  place(dt) {
    this.forward(_f);
    let dist = this.dist;
    // a wall between us and the subject pulls the camera in
    _d.copy(_f).negate();
    const hit = this.game.arena.rayWalls(this.target, _d, dist + 0.3);
    if (hit < dist + 0.3) dist = Math.max(0.6, hit - 0.3);
    // and it stays out of the stands and the ground
    for (let i = 0; i < 8 && dist > 0.6; i++) {
      _want.copy(this.target).addScaledVector(_f, -dist);
      if (this.allowed(_want)) break;
      dist *= 0.82;
    }
    _want.copy(this.target).addScaledVector(_f, -dist);
    _want.y = Math.max(0.35, _want.y);
    this.pos.copy(_want);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const s = this.shakeK * Math.max(0, this.shakeT / 0.3);
      this.pos.x += (Math.random() - 0.5) * s;
      this.pos.y += (Math.random() - 0.5) * s;
      this.pos.z += (Math.random() - 0.5) * s;
      if (this.shakeT <= 0) this.shakeK = 0;
    }
    this.apply();
  }

  /** Not inside the stands: they rise behind the wall everywhere but the south. */
  allowed(p) {
    const r = Math.hypot(p.x, p.z);
    if (r < R - 0.35) return true;
    const a = Math.abs(Math.atan2(p.x, p.z));
    if (a > STANDS_GAP) return false;
    // the south: inside the wall itself only if above it
    if (r < R + WALL_T + 0.35) return p.y > WALL_H + 0.5 || Math.abs(p.x) < 1.1;
    return true;
  }

  apply() {
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.target);
  }

  /** Round the arena, slowly, for the title screen. */
  orbit(dt) {
    this.orbitA += dt * 0.08;
    const a = this.orbitA;
    this.pos.set(Math.sin(a) * 9.5, 4.2, Math.cos(a) * 9.5);
    this.target.set(Math.sin(a + 2.2) * 1.5, 1.1, Math.cos(a + 2.2) * 1.5);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.target);
  }

  /** Where the camera is looking, on the ground, for the sun's shadows. */
  focus(out) { return out.set(this.target.x, 0, this.target.z); }
}
