/* =============================================================================
   Lamps and fires that light what is round them.

   A real light costs something for every pixel drawn, and adding one to the
   scene makes three.js rebuild its shaders, so there is a fixed handful of
   them, made the first time anything asks for light and kept from then on.
   Every frame, whatever wants light (a lit bulb, a floodlight, a burning
   person, a flamethrower) says so, and the pool goes to the ones nearest the
   camera. The rest still glow; they just do not light the street.
   ========================================================================== */
import * as THREE from 'three';

const POINTS = 4, SPOTS = 2;

export class Lights {
  constructor(game) {
    this.g = game;
    this.made = false;
    this.points = []; this.spots = [];
    this.want = [];        // this frame's requests
    this.stats = { assigned: 0, asked: 0 };
  }

  _make() {
    this.made = true;
    const scene = this.g.scene;
    for (let i = 0; i < POINTS; i++) {
      const l = new THREE.PointLight(0xffd9a0, 0, 10, 1.7);
      l.visible = true;
      scene.add(l);
      this.points.push(l);
    }
    for (let i = 0; i < SPOTS; i++) {
      const l = new THREE.SpotLight(0xfff2dd, 0, 40, 0.42, 0.45, 1.25);
      scene.add(l, l.target);
      this.spots.push(l);
    }
  }

  /**
   * Somebody wants light this frame. kind: 'point' or 'spot'; (x,y,z) where
   * from; colour as a hex; intensity; how far it reaches; for a spot, the
   * way it points.
   */
  ask(kind, x, y, z, color, intensity, dist, dx = 0, dy = -1, dz = 0) {
    this.want.push({ kind, x, y, z, color, intensity, dist, dx, dy, dz });
  }

  /** Hands the pool out to the requests nearest the camera. */
  commit() {
    const w = this.want;
    this.stats.asked = w.length;
    if (!w.length && !this.made) return;
    if (!this.made) this._make();
    const cx = this.g.camera.position.x, cy = this.g.camera.position.y, cz = this.g.camera.position.z;
    for (const r of w) r.d = (r.x - cx) ** 2 + (r.y - cy) ** 2 + (r.z - cz) ** 2 - r.intensity * 2;
    w.sort((a, b) => a.d - b.d);
    let p = 0, s = 0;
    for (const r of w) {
      if (r.kind === 'spot' && s < SPOTS) {
        const l = this.spots[s++];
        l.position.set(r.x, r.y, r.z);
        l.target.position.set(r.x + r.dx * 10, r.y + r.dy * 10, r.z + r.dz * 10);
        l.target.updateMatrixWorld();
        l.color.setHex(r.color); l.intensity = r.intensity; l.distance = r.dist;
      } else if (r.kind === 'point' && p < POINTS) {
        const l = this.points[p++];
        l.position.set(r.x, r.y, r.z);
        l.color.setHex(r.color); l.intensity = r.intensity; l.distance = r.dist;
      }
    }
    this.stats.assigned = p + s;
    for (; p < POINTS; p++) this.points[p].intensity = 0;
    for (; s < SPOTS; s++) this.spots[s].intensity = 0;
    w.length = 0;
  }
}
