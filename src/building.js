// Grid-snapped building: walls, floors, ramps and short pyramids.
// 25 wood a piece, gathered by breaking wooden props with the pickaxe.
import * as THREE from 'three';
import { clamp } from './util.js';

export const GRID = 3.2;
export const BUILD_COST = 25;
export const BUILD_TYPES = ['wall', 'floor', 'ramp', 'pyramid'];
export const PIECE_HP = 160;
// A ramp climbs one full cell; enough steps that each rise stays under the
// actor step-up height (0.62) so ramps are actually walkable.
export const RAMP_STEPS = 6;

const WOOD = 0xc19a6b;
const WOOD_DARK = 0x9c7a52;

function woodMat(opacity) {
  return new THREE.MeshLambertMaterial(
    opacity != null ? { color: WOOD, transparent: true, opacity, depthWrite: false } : { color: WOOD });
}

function plankGroup(w, h, d, ghost) {
  const g = new THREE.Group();
  const m = ghost ? woodMat(0.42) : new THREE.MeshLambertMaterial({ color: WOOD });
  const m2 = ghost ? m : new THREE.MeshLambertMaterial({ color: WOOD_DARK });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  body.castShadow = !ghost; body.receiveShadow = !ghost;
  g.add(body);
  if (!ghost) {
    // frame trim so pieces read clearly against the terrain
    const t = 0.14;
    if (h > w * 0.5) {
      for (const s of [-1, 1]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w * 1.01, t, d * 1.02), m2);
        bar.position.y = s * (h / 2 - t / 2);
        g.add(bar);
      }
    } else {
      for (const s of [-1, 1]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w * 1.01, h * 1.02, t), m2);
        bar.position.z = s * (d / 2 - t / 2);
        g.add(bar);
      }
    }
  }
  return g;
}

export class BuildPiece {
  constructor(type, key, group, colliders, system) {
    this.kind = 'build';
    this.type = type;
    this.key = key;
    this.group = group;
    this.colliders = colliders;
    this.hp = PIECE_HP;
    this.maxHp = PIECE_HP;
    this.alive = true;
    this.system = system;
    for (const c of colliders) { c.owner = this; c.tag = 'build'; }
  }
  damage(amount) {
    this.hp -= amount;
    const f = clamp(this.hp / this.maxHp, 0, 1);
    this.group.traverse(o => {
      if (o.isMesh && o.material && o.material.color) {
        if (!o.userData.base) o.userData.base = o.material.color.clone();
        o.material = o.material.userData?.cloned ? o.material : o.material.clone();
        o.material.userData = { cloned: true };
        o.material.color.copy(o.userData.base).multiplyScalar(0.55 + f * 0.45);
      }
    });
    if (this.hp <= 0) { this.system.destroy(this); return true; }
    return false;
  }
}

export class BuildSystem {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.pieces = new Map();      // key -> BuildPiece
    this.ghost = null;
    this.ghostValid = false;
    this.ghostPlan = null;
    this._makeGhost();
  }

  _makeGhost() {
    this.ghostRoot = new THREE.Group();
    this.ghostRoot.visible = false;
    this.scene.add(this.ghostRoot);
  }

  /** Work out what would be built and where, without building it. */
  plan(actor, type) {
    const G = GRID;
    const fx = Math.sin(actor.yaw), fz = Math.cos(actor.yaw);
    const px = actor.pos.x, py = actor.pos.y, pz = actor.pos.z;
    const j = Math.floor((py + 0.15) / G);
    const baseY = j * G;
    const ax = Math.abs(fx) > Math.abs(fz) ? 'x' : 'z';
    const sx = fx > 0 ? 1 : -1, sz = fz > 0 ? 1 : -1;

    if (type === 'wall') {
      // wall on the face of the player's own cell in the direction they face
      const i = Math.floor(px / G), k = Math.floor(pz / G);
      if (ax === 'x') {
        const wx = (i + (sx > 0 ? 1 : 0)) * G;
        return { type, key: `w|${Math.round(wx / G)}|${j}|${k}|x`,
          x: wx, y: baseY, z: (k + 0.5) * G, axis: 'x' };
      }
      const wz = (k + (sz > 0 ? 1 : 0)) * G;
      return { type, key: `w|${i}|${j}|${Math.round(wz / G)}|z`,
        x: (i + 0.5) * G, y: baseY, z: wz, axis: 'z' };
    }

    // floor / ramp / pyramid go in the cell in front of the player
    const tx = px + fx * G * 0.9, tz = pz + fz * G * 0.9;
    const i = Math.floor(tx / G), k = Math.floor(tz / G);
    const cx = (i + 0.5) * G, cz = (k + 0.5) * G;
    if (type === 'floor') return { type, key: `f|${i}|${j}|${k}`, x: cx, y: baseY, z: cz };
    if (type === 'pyramid') return { type, key: `p|${i}|${j}|${k}`, x: cx, y: baseY, z: cz };
    return { type, key: `r|${i}|${j}|${k}|${ax}${ax === 'x' ? sx : sz}`,
      x: cx, y: baseY, z: cz, axis: ax, dir: ax === 'x' ? sx : sz };
  }

  buildMesh(plan, ghost) {
    const G = GRID, T = 0.28;
    const g = new THREE.Group();
    if (plan.type === 'wall') {
      const w = plan.axis === 'x' ? T : G, d = plan.axis === 'x' ? G : T;
      const m = plankGroup(w, G, d, ghost);
      m.position.set(plan.x, plan.y + G / 2, plan.z);
      g.add(m);
    } else if (plan.type === 'floor') {
      const m = plankGroup(G, T, G, ghost);
      m.position.set(plan.x, plan.y + T / 2, plan.z);
      g.add(m);
    } else if (plan.type === 'ramp') {
      const steps = RAMP_STEPS;
      for (let s = 0; s < steps; s++) {
        const m = plankGroup(plan.axis === 'x' ? G / steps : G, T + 0.02, plan.axis === 'x' ? G : G / steps, ghost);
        const off = (s + 0.5) / steps * G - G / 2;
        m.position.set(
          plan.x + (plan.axis === 'x' ? off * plan.dir : 0),
          plan.y + (s + 1) * (G / steps) - T / 2,
          plan.z + (plan.axis === 'z' ? off * plan.dir : 0)
        );
        g.add(m);
      }
      // the visible slope sits on top of the steps; +dir must climb, so the
      // rotation signs differ per axis
      const slope = plankGroup(plan.axis === 'x' ? G * 1.42 : G, T, plan.axis === 'x' ? G : G * 1.42, ghost);
      slope.position.set(plan.x, plan.y + G / 2, plan.z);
      if (plan.axis === 'x') slope.rotation.z = plan.dir * Math.PI / 4;
      else slope.rotation.x = -plan.dir * Math.PI / 4;
      g.add(slope);
    } else {
      const steps = 3, hTot = G * 0.55;
      for (let s = 0; s < steps; s++) {
        const f = 1 - s / steps;
        const m = plankGroup(G * f, hTot / steps + 0.02, G * f, ghost);
        m.position.set(plan.x, plan.y + (s + 0.5) * (hTot / steps), plan.z);
        g.add(m);
      }
    }
    return g;
  }

  makeColliders(plan) {
    const G = GRID, T = 0.28, out = [];
    const P = this.physics;
    if (plan.type === 'wall') {
      const hw = plan.axis === 'x' ? T / 2 : G / 2, hd = plan.axis === 'x' ? G / 2 : T / 2;
      out.push(P.addBox(plan.x - hw, plan.y, plan.z - hd, plan.x + hw, plan.y + G, plan.z + hd));
    } else if (plan.type === 'floor') {
      out.push(P.addBox(plan.x - G / 2, plan.y, plan.z - G / 2, plan.x + G / 2, plan.y + T, plan.z + G / 2));
    } else if (plan.type === 'ramp') {
      const steps = RAMP_STEPS;
      for (let s = 0; s < steps; s++) {
        const off = (s + 0.5) / steps * G - G / 2;
        const cx = plan.x + (plan.axis === 'x' ? off * plan.dir : 0);
        const cz = plan.z + (plan.axis === 'z' ? off * plan.dir : 0);
        const hw = plan.axis === 'x' ? G / (2 * steps) : G / 2;
        const hd = plan.axis === 'x' ? G / 2 : G / (2 * steps);
        out.push(P.addBox(cx - hw, plan.y, cz - hd, cx + hw, plan.y + (s + 1) * (G / steps), cz + hd));
      }
    } else {
      const steps = 3, hTot = G * 0.55;
      for (let s = 0; s < steps; s++) {
        const f = (1 - s / steps) * G / 2;
        out.push(P.addBox(plan.x - f, plan.y, plan.z - f, plan.x + f, plan.y + (s + 1) * (hTot / steps), plan.z + f));
      }
    }
    return out;
  }

  canPlace(plan, actor) {
    if (this.pieces.has(plan.key)) return false;
    if (actor.inv.wood < BUILD_COST) return false;
    return true;
  }

  showGhost(actor, type) {
    const plan = this.plan(actor, type);
    if (!this.ghostPlan || this.ghostPlan.key !== plan.key) {
      this.ghostRoot.clear();
      this.ghostRoot.add(this.buildMesh(plan, true));
      this.ghostPlan = plan;
    }
    const ok = this.canPlace(plan, actor);
    this.ghostValid = ok;
    this.ghostRoot.visible = true;
    this.ghostRoot.traverse(o => {
      if (o.isMesh && o.material) o.material.color.setHex(ok ? 0x7fd8ff : 0xff6a5a);
    });
    return plan;
  }

  hideGhost() { this.ghostRoot.visible = false; this.ghostPlan = null; }

  place(actor, type) {
    const plan = this.plan(actor, type);
    if (!this.canPlace(plan, actor)) return false;
    actor.inv.wood -= BUILD_COST;
    const mesh = this.buildMesh(plan, false);
    this.scene.add(mesh);
    const cols = this.makeColliders(plan);
    const piece = new BuildPiece(plan.type, plan.key, mesh, cols, this);
    this.pieces.set(plan.key, piece);
    this.ghostPlan = null;
    return true;
  }

  destroy(piece) {
    if (!piece.alive) return;
    piece.alive = false;
    for (const c of piece.colliders) this.physics.remove(c);
    this.scene.remove(piece.group);
    piece.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.pieces.delete(piece.key);
  }
}
