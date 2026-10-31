/* =============================================================================
   Short-lived things to look at: a beam of light where a sword drops,
   coloured by its rarity - taller and longer for the rarer ones.
   ========================================================================== */
import { Mesh, MeshBasicMaterial, BoxGeometry, AdditiveBlending } from 'three';

export class Fx {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.unit = new BoxGeometry(1, 1, 1);
  }

  /** A column of light standing on the ground at `at`. */
  beam(at, color, tier = 0) {
    const h = 3 + tier * 0.6;
    const m = new Mesh(this.unit, new MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false }));
    const w = 0.1 + tier * 0.025;
    m.scale.set(w, h, w);
    m.position.set(at.x, h / 2, at.z);
    this.game.scene.add(m);
    this.items.push({ m, t: 0, life: 1.4 + tier * 0.25, spin: tier >= 5 ? 2 : 0 });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i];
      f.t += dt;
      const k = 1 - f.t / f.life;
      if (k <= 0) {
        this.game.scene.remove(f.m);
        f.m.material.dispose();
        this.items.splice(i, 1);
        continue;
      }
      f.m.material.opacity = 0.8 * Math.min(1, k * 2);
      f.m.rotation.y += f.spin * dt;
    }
  }

  clear() {
    for (const f of this.items) { this.game.scene.remove(f.m); f.m.material.dispose(); }
    this.items.length = 0;
  }
}
