/* =============================================================================
   Gore. Three flavours, exactly as specified:

     bruising    - what blunt force leaves behind, painted on the skin
     blood       - never from a weak punch; it splatters onto citizens, the
                   player, map parts, floors and objects
     cloth tears - torn where the damage landed, rare from blunt force

   Droplets are simulated for real and paint themselves onto whatever they land
   on, which is what spreads blood around the map.
   ========================================================================== */
import {
  InstancedMesh, PlaneGeometry, MeshBasicMaterial, Object3D, Vector3, Color,
  DoubleSide, DynamicDrawUsage,
} from 'three';
import { paintSplat, DecalSheet } from './paint.js';
import { makeRng, clamp01, clamp } from '../core/util.js';
import { boneBoxCenter } from './skeleton.js';

const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3();
const _obj = new Object3D();

const MAX_DROPS = 320;

export class GoreSystem {
  constructor(scene, world, { enabled = true, decalSize = 1024, bounds = 40 } = {}) {
    this.scene = scene;
    this.world = world;
    this.enabled = enabled;
    this.rng = makeRng(0x5eed1);

    this.sheet = new DecalSheet(decalSize, -bounds, bounds);

    const geo = new PlaneGeometry(1, 1);
    const mat = new MeshBasicMaterial({
      color: new Color(0x8e0c10), side: DoubleSide, transparent: true, opacity: 0.95, depthWrite: false,
    });
    this.mesh = new InstancedMesh(geo, mat, MAX_DROPS);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = MAX_DROPS;
    scene.add(this.mesh);

    this.drops = [];
    for (let i = 0; i < MAX_DROPS; i++) {
      this.drops.push({ alive: false, pos: new Vector3(), vel: new Vector3(), size: 0.03, life: 0, spin: 0 });
    }
    this.cursor = 0;
    this._hideAll();

    this.characters = [];     // filled in by the game each frame
    this.stats = { splats: 0, drops: 0 };
  }

  _hideAll() {
    _obj.position.set(0, -1000, 0);
    _obj.scale.set(0.0001, 0.0001, 0.0001);
    _obj.updateMatrix();
    for (let i = 0; i < MAX_DROPS; i++) this.mesh.setMatrixAt(i, _obj.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  setEnabled(v) {
    this.enabled = v;
    this.mesh.visible = v;
  }

  /* ------------------------------- droplets ------------------------------ */

  burst(point, dir, count, { speed = 4.5, spread = 0.75, size = 0.035 } = {}) {
    if (!this.enabled) return;
    const rng = this.rng;
    for (let i = 0; i < count; i++) {
      const d = this.drops[this.cursor];
      this.cursor = (this.cursor + 1) % MAX_DROPS;
      d.alive = true;
      d.pos.copy(point);
      d.pos.x += (rng() - 0.5) * 0.05;
      d.pos.y += (rng() - 0.5) * 0.05;
      d.pos.z += (rng() - 0.5) * 0.05;
      _v1.copy(dir);
      if (_v1.lengthSq() < 1e-6) _v1.set(0, 1, 0);
      _v1.normalize();
      _v1.x += (rng() - 0.5) * spread;
      _v1.y += (rng() - 0.5) * spread + 0.25;
      _v1.z += (rng() - 0.5) * spread;
      d.vel.copy(_v1).multiplyScalar(speed * (0.25 + rng() * 0.85));
      d.size = size * (0.45 + rng() * 0.95);
      d.life = 1.6 + rng() * 1.0;
      d.spin = rng() * Math.PI;
      this.stats.drops++;
    }
  }

  update(dt, characters) {
    if (!this.enabled) return;
    this.characters = characters;
    const g = this.world.gravity.y;
    let any = false;
    for (let i = 0; i < MAX_DROPS; i++) {
      const d = this.drops[i];
      if (!d.alive) continue;
      any = true;
      d.life -= dt;
      d.vel.y += g * dt * 0.92;
      _v1.copy(d.vel).multiplyScalar(dt);
      d.pos.add(_v1);

      if (d.life <= 0) { this._retire(i, d); continue; }
      if (this._tryLand(d)) { this._retire(i, d); continue; }

      // billboard-ish: stretch along the direction of travel
      const sp = d.vel.length();
      _obj.position.copy(d.pos);
      _obj.quaternion.setFromUnitVectors(_v2.set(0, 0, 1), _v3.copy(d.vel).normalize());
      _obj.scale.set(d.size, d.size * clamp(1 + sp * 0.09, 1, 3.2), d.size);
      _obj.updateMatrix();
      this.mesh.setMatrixAt(i, _obj.matrix);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
    this.sheet.flush();
  }

  _retire(index, d) {
    d.alive = false;
    _obj.position.set(0, -1000, 0);
    _obj.scale.set(0.0001, 0.0001, 0.0001);
    _obj.quaternion.identity();
    _obj.updateMatrix();
    this.mesh.setMatrixAt(index, _obj.matrix);
  }

  /** Returns true when the droplet has hit something and painted itself. */
  _tryLand(d) {
    const w = this.world;

    // ---- other people ----
    for (let i = 0; i < this.characters.length; i++) {
      const c = this.characters[i];
      if (!c || c.body?.destroyed) continue;
      if (Math.abs(c.center.x - d.pos.x) > 1.4 || Math.abs(c.center.z - d.pos.z) > 1.4 ||
          Math.abs(c.center.y - d.pos.y) > 1.6) continue;
      const hit = nearestBone(c, d.pos, 0.14);
      if (hit) {
        const sev = clamp01(d.size * 14);
        c.body.paintHit(hit.name, d.pos, { kind: 'blood', severity: sev, dir: { x: d.vel.x, y: -d.vel.y }, dark: 0.15 });
        this.stats.splats++;
        return true;
      }
    }

    // ---- objects and map parts ----
    for (let i = 0; i < w.bodies.length; i++) {
      const b = w.bodies[i];
      if (this._paintBody(b, d)) return true;
    }
    for (let i = 0; i < w.staticBodies.length; i++) {
      const b = w.staticBodies[i];
      if (this._paintBody(b, d)) return true;
    }

    // ---- the floor ----
    if (d.pos.y <= w.groundY + 0.02) {
      const rng = this.rng;
      const dx = d.vel.x, dz = d.vel.z;
      this.sheet.paint(d.pos.x, d.pos.z, (ctx, px, py, ppm) => {
        const r = Math.max(2.2, d.size * ppm * 3.4);
        paintSplat(ctx, px, py, r, dx, dz, rng, 0.1);
      });
      this.stats.splats++;
      return true;
    }
    return false;
  }

  _paintBody(b, d) {
    if (d.pos.x < b.aabbMin.x - 0.02 || d.pos.x > b.aabbMax.x + 0.02 ||
        d.pos.y < b.aabbMin.y - 0.02 || d.pos.y > b.aabbMax.y + 0.02 ||
        d.pos.z < b.aabbMin.z - 0.02 || d.pos.z > b.aabbMax.z + 0.02) return false;
    if (!b.containsPoint(d.pos)) {
      b.closestPoint(d.pos, _v1);
      if (_v1.distanceToSquared(d.pos) > 0.0036) return false;
    }
    const fn = b.userData && b.userData.paintBlood;
    if (!fn) return true;   // absorbed, just nothing to draw on
    fn(d.pos, clamp01(d.size * 16), { x: d.vel.x, y: d.vel.y, z: d.vel.z });
    this.stats.splats++;
    return true;
  }

  /* ------------------------------ from damage ---------------------------- */

  /**
   * Called whenever a character takes damage. Decides which inks are used and
   * whether anything sprays out of the wound.
   */
  onCharacterDamage(info) {
    if (!this.enabled) return;
    const { character, boneName, point, type, severity, force, fatal } = info;
    if (!boneName || !point) return;
    const sev = clamp01(severity != null ? severity : 0.4);

    const kind = type === 'impact' ? 'impact' : 'blunt';
    character.body.paintHit(boneName, point, { kind, severity: sev, allowTear: true });

    // Blood only leaves the body when the hit is more than a fist.
    const heavy = type === 'impact' || sev > 0.8 || fatal;
    if (heavy) {
      _v1.set(0, 1, 0);
      if (force) _v1.copy(force).normalize();
      const count = Math.round(3 + sev * 11 + (fatal ? 7 : 0));
      this.burst(point, _v1, Math.min(24, count), {
        speed: 1.5 + sev * 2.6,
        spread: 0.85,
        size: 0.024 + sev * 0.026,
      });
    }
  }

  /** A steady drip from someone who is bleeding out. */
  bleedTick(character, dt) {
    if (!this.enabled || character.bleeding <= 0) return;
    character._bleedAcc = (character._bleedAcc || 0) + dt * character.bleeding;
    while (character._bleedAcc > 0.5) {
      character._bleedAcc -= 0.5;
      const bone = character.rig.byName.midTorso;
      boneBoxCenter(bone, _v1);
      _v1.x += (this.rng() - 0.5) * 0.2;
      _v1.z += (this.rng() - 0.5) * 0.2;
      this.burst(_v1, _v2.set(0, -1, 0), 1, { speed: 0.6, spread: 0.4, size: 0.026 });
    }
  }

  /** Splatter arriving at a surface from a hard impact (falls, boulders). */
  impactSplatter(point, normal, speed) {
    if (!this.enabled || speed < 7) return;
    const sev = clamp01((speed - 7) / 16);
    _v1.copy(normal).multiplyScalar(1).add(_v2.set(
      (this.rng() - 0.5), Math.abs(this.rng()) * 0.4, (this.rng() - 0.5),
    ));
    this.burst(point, _v1, Math.round(2 + sev * 8), { speed: 1.4 + sev * 2.2, size: 0.028 });
  }

  wash() {
    this.sheet.clear();
    this.sheet.flush();
    for (let i = 0; i < MAX_DROPS; i++) if (this.drops[i].alive) this._retire(i, this.drops[i]);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.stats.splats = 0;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
    this.sheet.texture.dispose();
  }
}

/** Finds the body part nearest to a world point, within `pad`. */
export function nearestBone(character, point, pad = 0.05) {
  let best = null, bestD = Infinity;
  const bones = character.rig.bones;
  for (let i = 0; i < bones.length; i++) {
    const b = bones[i];
    if (b.def.finger) continue;
    boneBoxCenter(b, _v1);
    const d = _v1.distanceToSquared(point);
    if (d > 0.42) continue;
    const r = Math.max(b.boxHalf.x, b.boxHalf.y, b.boxHalf.z) + pad;
    if (d < r * r && d < bestD) { bestD = d; best = b; }
  }
  return best;
}
