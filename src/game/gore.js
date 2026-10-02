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
/** Loose body parts in the world at once. Each is a draw call, and one arm
    is a dozen of them, so this is about five people's worth. */
const MAX_DEBRIS = 72;

/** How freely each eye state runs. */
const EYE_DRIP = { ok: 0, bloodshot: 0, bleeding: 0.5, hanging: 0.8, gone: 0.7 };

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
    /* Pieces of people, in the air. Not particles: these are the real meshes
       torn off a body, so a forearm that comes off is the forearm that was
       there a moment ago, still wearing its sleeve and its bruises. */
    this.debris = [];
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
    for (const d of this.debris) d.mesh.visible = v;
  }

  /** Clears every loose piece. Used by CLEAR SPAWNS and when a map unloads. */
  clearDebris() {
    for (const d of this.debris) d.mesh.removeFromParent();
    this.debris.length = 0;
  }

  /** Drops the pieces that came off one particular person. Their materials
      belong to that body, so they cannot outlive it. */
  dropPartsOf(owner) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      if (this.debris[i].mesh.userData.owner === owner) this._dropDebris(i);
    }
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

  /**
   * Throws a piece of someone. The mesh is handed over entirely: it is
   * reparented into the scene and this owns it from here on.
   *
   * Pieces stay where they land. This is a sandbox: an arm you took off
   * someone ten minutes ago should still be lying there. The only thing that
   * removes one is the cap below, CLEAR SPAWNS, or its owner being deleted.
   *
   * @param {Mesh} mesh    already positioned and oriented where it came off
   * @param {Vector3} vel  how fast, and which way
   */
  throwPart(mesh, vel, { life = Infinity, bleed = 1 } = {}) {
    mesh.matrixAutoUpdate = true;
    this.scene.add(mesh);
    const rng = this.rng;
    this.debris.push({
      mesh,
      vel: vel.clone(),
      spin: new Vector3((rng() - 0.5) * 16, (rng() - 0.5) * 16, (rng() - 0.5) * 16),
      life,
      bleed,
      dripAt: 0,
      rest: false,
    });
    /* A hard cap, because a fight can produce a lot of these and each one is
       a draw call. The oldest piece goes first. */
    while (this.debris.length > MAX_DEBRIS) this._dropDebris(0);
  }

  _dropDebris(i) {
    const d = this.debris[i];
    d.mesh.removeFromParent();
    this.debris.splice(i, 1);
  }

  /** Everything in the air comes down, and bleeds on the way. */
  _updateDebris(dt) {
    const w = this.world;
    const g = w.gravity.y;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      if (d.life <= 0) { this._dropDebris(i); continue; }
      if (d.rest) continue;

      d.vel.y += g * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      _v1.copy(d.spin).multiplyScalar(dt);
      d.mesh.rotateX(_v1.x); d.mesh.rotateY(_v1.y); d.mesh.rotateZ(_v1.z);

      // a trail of blood while it is still moving
      d.dripAt -= dt;
      if (d.bleed > 0 && d.dripAt <= 0 && d.vel.lengthSq() > 4) {
        d.dripAt = 0.045;
        this.burst(d.mesh.position, _v2.copy(d.vel).multiplyScalar(-0.2), 1,
          { speed: 1.6, spread: 1.2, size: 0.026 });
      }

      const floor = w.floorAt(d.mesh.position.x, d.mesh.position.z, d.mesh.position.y + 0.1) + 0.055;
      if (d.mesh.position.y < w.killY) { this._dropDebris(i); continue; }
      if (d.mesh.position.y <= floor) {
        d.mesh.position.y = floor;
        const speed = d.vel.length();
        if (speed < 1.6) {
          // settled: lay it flat and leave a pool where it came to rest
          d.rest = true;
          d.spin.set(0, 0, 0);
          d.vel.set(0, 0, 0);
          if (d.bleed > 0) this._poolUnder(d.mesh.position, 0.12 + d.bleed * 0.1);
        } else {
          d.vel.y = Math.abs(d.vel.y) * 0.26;
          d.vel.x *= 0.62; d.vel.z *= 0.62;
          d.spin.multiplyScalar(0.55);
          if (d.bleed > 0) this._poolUnder(d.mesh.position, 0.08);
        }
      }
    }
  }

  /** True if what is under this point shows the floor sheet at about this
      height - the grass, a pit floor, a platform top - rather than, say, a
      bridge deck, whose footprint is shared with the pit floor below it. */
  _showsFloorSheet(x, y, z) {
    const w = this.world;
    if (w.hasGroundAt(x, z) && Math.abs(y - w.groundY) < 0.25) return true;
    const st = w.staticBodies;
    for (let i = 0; i < st.length; i++) {
      const b = st[i];
      if (!b.userData?.floorDecal) continue;
      if (x < b.aabbMin.x || x > b.aabbMax.x || z < b.aabbMin.z || z > b.aabbMax.z) continue;
      if (Math.abs(y - b.aabbMax.y) < 0.25) return true;
    }
    return false;
  }

  /** A spreading mark on the floor, for things that land wet. */
  _poolUnder(pos, radius) {
    if (!this._showsFloorSheet(pos.x, pos.y - 0.055, pos.z)) return;
    const rng = this.rng;
    this.sheet.paint(pos.x, pos.z, (ctx, px, py, ppm) => {
      paintSplat(ctx, px, py, Math.max(3, radius * ppm), 0, 0, rng, 0.2);
    });
    this.stats.splats++;
  }

  update(dt, characters) {
    if (!this.enabled) return;
    this.characters = characters;
    this._updateDebris(dt);
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
    if (d.pos.y <= w.groundY + 0.02 && w.hasGroundAt(d.pos.x, d.pos.z)) {
      this._splatFloor(d);
      return true;
    }
    // falling past everything, into nothing
    if (d.pos.y < w.killY) return true;
    return false;
  }

  _splatFloor(d) {
    const rng = this.rng;
    const dx = d.vel.x, dz = d.vel.z;
    this.sheet.paint(d.pos.x, d.pos.z, (ctx, px, py, ppm) => {
      const r = Math.max(2.2, d.size * ppm * 3.4);
      paintSplat(ctx, px, py, r, dx, dz, rng, 0.1);
    });
    this.stats.splats++;
  }

  _paintBody(b, d) {
    if (d.pos.x < b.aabbMin.x - 0.02 || d.pos.x > b.aabbMax.x + 0.02 ||
        d.pos.y < b.aabbMin.y - 0.02 || d.pos.y > b.aabbMax.y + 0.02 ||
        d.pos.z < b.aabbMin.z - 0.02 || d.pos.z > b.aabbMax.z + 0.02) return false;
    if (!b.containsPoint(d.pos)) {
      b.closestPoint(d.pos, _v1);
      if (_v1.distanceToSquared(d.pos) > 0.0036) return false;
    }
    /* A flat map top - a platform, the floor of a pit - shows the same
       floor sheet the grass does, drawn at its own height. Its footprint is
       its own, so painting the sheet where the drop came down puts the mark
       exactly there. */
    if (b.userData && b.userData.floorDecal) {
      this._splatFloor(d);
      return true;
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
    /* A round the vest stopped did not reach anybody. No bruise under it, and
       certainly no blood: the plate takes the mark instead, and shows it by
       going dull. */
    if (info.absorbed > 0 && !(info.amount > 0)) return;
    const sev = clamp01(severity != null ? severity : 0.4);

    if (type === 'drown') return;
    // Fire cauterises: a burn scorches what it touches and draws no blood.
    if (type === 'burn') {
      character.body.paintHit(boneName, point, { kind: 'burn', severity: sev, allowTear: true });
      return;
    }
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
    if (!this.enabled) return;
    if (character.bleeding > 0) {
      character._bleedAcc = (character._bleedAcc || 0) + dt * character.bleeding;
      while (character._bleedAcc > 0.5) {
        character._bleedAcc -= 0.5;
        // out of the worst of it: a break if there is one, the body otherwise
        const bone = character.rig.byName[this._bleedFrom(character)];
        boneBoxCenter(bone, _v1);
        _v1.x += (this.rng() - 0.5) * 0.2;
        _v1.z += (this.rng() - 0.5) * 0.2;
        this.burst(_v1, _v2.set(0, -1, 0), 1, { speed: 0.6, spread: 0.4, size: 0.026 });
      }
    }

    /* A face runs on its own account: down the nose, off the chin, out of
       whatever is left of an eye. */
    const inj = character.injuries;
    if (!inj) return;
    const face = inj.noseBleed + inj.mouthBleed
      + (EYE_DRIP[inj.eyeR] || 0) + (EYE_DRIP[inj.eyeL] || 0);
    if (face <= 0) return;
    character._faceBleedAcc = (character._faceBleedAcc || 0) + dt * face;
    while (character._faceBleedAcc > 0.8) {
      character._faceBleedAcc -= 0.8;
      const head = character.rig.byName.head;
      boneBoxCenter(head, _v1);
      // just off the front of the face, roughly where it is coming from
      _v3.set((this.rng() - 0.5) * 0.09, -0.02 - this.rng() * 0.05, -head.boxHalf.z - 0.01)
        .applyQuaternion(head.worldQuat);
      _v1.add(_v3);
      this.burst(_v1, _v2.set(0, -1, 0), 1, { speed: 0.5, spread: 0.35, size: 0.021 });
    }
  }

  /** The wound a drip should be coming from. */
  _bleedFrom(character) {
    if (character.broken && character.broken.size) {
      for (const name of character.broken) {
        if (character.rig.byName[name]) return name;
      }
    }
    return 'midTorso';
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
    this.sheet.flush(true);
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
