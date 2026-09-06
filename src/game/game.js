/* =============================================================================
   The game: scene, camera, the player, everything that has been spawned, and
   the tick that keeps it all moving.
   ========================================================================== */
import {
  Scene, PerspectiveCamera, WebGLRenderer, Vector3, Quaternion, Euler,
  PCFSoftShadowMap, SRGBColorSpace, ACESFilmicToneMapping,
} from 'three';
import { PhysicsWorld } from '../physics/world.js';
import { getMap } from './map.js';
import { Character, STATE } from './character.js';
import { playerAppearance } from './appearance.js';
import { spawnCitizen } from './citizen.js';
import {
  spawnCrate, spawnBoulder, spawnMachete, spawnSledge, createMacheteModel,
  syncBodyMesh, disposeBody, prewarmObjectArt, MACHETE, SLEDGE,
} from './objects.js';
import { GoreSystem, nearestBone } from './gore.js';
import { NavGrid } from './ai.js';
import { RCV2 } from './rcv2.js';
import { boneCorners, pointInBone, boneBoxCenter, HIP_HEIGHT } from './skeleton.js';
import { clamp, clamp01, makeRng, yieldToPaint } from '../core/util.js';

const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3(), _v4 = new Vector3();
const _q1 = new Quaternion(), _q2 = new Quaternion();
const _e = new Euler(0, 0, 0, 'YXZ');
const UP = new Vector3(0, 1, 0);
/* A machete continues the line of the fist, canted out a little so the blade
   sits in view rather than straight down the forearm. */
const _tilt = (x) => new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), x);

/**
 * Everything that differs between one carried weapon and the next. The blade
 * cuts along an edge and the hammer lands on a block, so each one says where
 * its own damage comes from and what kind of damage it is.
 */
/** Plain words for the bones people care about hearing named. */
const BREAK_NAME = {
  upperArmR: 'right arm', lowerArmR: 'right forearm', handR: 'right hand',
  upperArmL: 'left arm', lowerArmL: 'left forearm', handL: 'left hand',
  upperLegR: 'right leg', lowerLegR: 'right shin', footR: 'right foot',
  upperLegL: 'left leg', lowerLegL: 'left shin', footL: 'left foot',
  lowerTorso: 'back', midTorso: 'ribs', upperTorso: 'ribs',
  neck: 'neck', head: 'skull',
};

export const MELEE = {
  machete: {
    label: 'Machete',
    spawn: spawnMachete,
    tilt: _tilt(-0.30),
    lift: 0.035,                        // how far up the grip sits in the hand
    dropAt: MACHETE.length / 2 + 0.04,
    type: 'impact',
    dmg: { mul: 3.6, min: 3, max: 42 },
    sev: { div: 6, min: 0.55 },
    push: { mul: 6, min: 8, max: 90, lift: 4 },
    crush: 0,                           // blades cut, they do not shatter bone
    shake: 0.22,
    /** Nine points down the cutting edge, guard to tip. */
    contacts(out, origin, quat, v) {
      for (let i = 0; i <= 8; i++) {
        const y = MACHETE.grip + 0.03 + (MACHETE.blade - 0.03) * (i / 8);
        out.push(v.set(MACHETE.width * 0.42, y + 0.035, 0).applyQuaternion(quat).add(origin).clone());
      }
    },
  },
  sledge: {
    label: 'Sledgehammer',
    spawn: spawnSledge,
    tilt: _tilt(-0.38),
    lift: 0.05,
    dropAt: SLEDGE.length / 2 + 0.05,
    type: 'blunt',
    dmg: { mul: 5.0, min: 6, max: 58 },
    sev: { div: 5, min: 0.7 },
    push: { mul: 15, min: 20, max: 230, lift: 8 },
    crush: 0.85,                        // this is what breaks bones
    shake: 0.5,
    /** The striking block across the top of the haft. */
    contacts(out, origin, quat, v) {
      const y = SLEDGE.haft + SLEDGE.headH / 2 + 0.05;
      for (const fx of [-0.5, -0.25, 0, 0.25, 0.5]) {
        out.push(v.set(fx * SLEDGE.headW, y, 0).applyQuaternion(quat).add(origin).clone());
      }
      for (const fz of [-0.42, 0.42]) {
        for (const fx of [-0.35, 0.35]) {
          out.push(v.set(fx * SLEDGE.headW, y, fz * SLEDGE.headD)
            .applyQuaternion(quat).add(origin).clone());
        }
      }
      // the top of the haft, so a swing that lands short still connects
      for (const fy of [0.72, 0.9]) {
        out.push(v.set(0, SLEDGE.haft * fy, 0).applyQuaternion(quat).add(origin).clone());
      }
    },
  },
};

export const QUALITY = {
  low: { shadows: false, shadowMap: 512, pixelRatio: 1.0, grassSize: 256, maxObjects: 40, maxCitizens: 10 },
  medium: { shadows: true, shadowMap: 1024, pixelRatio: 1.35, grassSize: 512, maxObjects: 70, maxCitizens: 16 },
  high: { shadows: true, shadowMap: 2048, pixelRatio: 2.0, grassSize: 512, maxObjects: 110, maxCitizens: 24 },
};

export const SPAWNABLES = {
  objects: [
    { id: 'crate', name: 'Crate', icon: 'crate', hint: 'Wooden crate' },
    { id: 'boulder', name: 'Boulder', icon: 'boulder', hint: 'Rock boulder' },
    { id: 'machete', name: 'Machete', icon: 'machete', hint: 'Pick it up with USE' },
    { id: 'sledge', name: 'Sledgehammer', icon: 'sledge', hint: 'Heavy. Breaks bones.' },
  ],
  humans: [
    { id: 'citizen', name: 'Citizen', icon: 'citizen', hint: 'An ordinary person' },
  ],
};

export class Game {
  constructor(container, settings) {
    this.container = container;
    this.settings = settings;
    this.quality = QUALITY[settings.quality] || QUALITY.medium;
    if (!settings.shadows) this.quality = { ...this.quality, shadows: false };

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(settings.fov, 1, 0.045, 900);
    this.renderer = new WebGLRenderer({ antialias: settings.quality === 'high', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    if (this.quality.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = PCFSoftShadowMap;
    }
    container.appendChild(this.renderer.domElement);

    this.world = new PhysicsWorld();
    this.characters = [];
    this.spawnedBodies = [];
    this.rng = makeRng(0xbeef);

    this.map = null;
    this.player = null;
    this.gore = null;
    this.nav = new NavGrid(40, 0.7);
    this.navTimer = 0;

    this.selected = { id: 'crate', name: 'Crate' };
    this.carried = null;         // { kind, model } while something is in hand
    this.paused = false;
    this.running = false;
    this.time = 0;
    this.camYaw = 0;
    this.camPitch = 0;
    this.camPos = new Vector3();
    this.camQuat = new Quaternion();
    this.shake = 0;
    this.debugCam = null;        // {x,y,z,yaw,pitch} - dev tool, unused in play
    this.hud = null;             // wired by main.js
    this.stats = { fps: 0, objects: 0, citizens: 0 };
    this._fpsAcc = 0; this._fpsCount = 0;

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /* ------------------------------------------------------------------ load */

  async load(mapId, onProgress = () => {}) {
    const steps = [
      ['Warming up the renderer', async () => { this.renderer.compile(this.scene, this.camera); }],
      ['Carving the terrain', async () => {
        const def = getMap(mapId);
        this.mapDef = def;
        this.map = def.build({ scene: this.scene, world: this.world, quality: this.quality });
      }],
      ['Mixing the paint', async () => { prewarmObjectArt(); }],
      ['Priming the gore', async () => {
        this.gore = new GoreSystem(this.scene, this.world, {
          enabled: this.settings.gore,
          decalSize: this.quality.shadowMap >= 2048 ? 2048 : 1024,
          bounds: this.map.half,
        });
        this.map.attachDecalTexture(this.gore.sheet.texture);
      }],
      ['Assembling a body', async () => { this._createPlayer(); }],
      ['Mapping the ground', async () => { this.nav.rebuild(this.world, { groundY: 0 }); }],
      ['Populating', async () => {
        // A couple of citizens so the plate is not empty on arrival.
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + 0.4;
          const p = _v1.set(Math.cos(a) * 6.5, 0, Math.sin(a) * 6.5 - 3);
          spawnCitizen(this, p);
        }
      }],
      ['Compiling shaders', async () => {
        this.updateCamera(0);
        this.renderer.compile(this.scene, this.camera);
        this.renderer.render(this.scene, this.camera);
      }],
    ];

    for (let i = 0; i < steps.length; i++) {
      onProgress(i / steps.length, steps[i][0]);
      await yieldToPaint();
      await steps[i][1]();
    }
    onProgress(1, 'Ready');
    this.running = true;
  }

  _createPlayer() {
    const look = playerAppearance();
    const p = this.map.spawnPoint;
    this.player = new Character(this.world, look, {
      x: p.x, z: p.z, yaw: this.map.spawnYaw, isPlayer: true, seed: 4242,
      castShadow: this.quality.shadows, name: 'You',
    });
    this.scene.add(this.player.body.group);
    this.player.onDamage = (info) => this.handleDamage(info);
    this.player.onInjury = (info) => this.handleInjury(info);
    this.player.onStrike = (a, s, v) => this.resolveStrike(a, s, v);
    this.player.onSlash = (a, s, v) => this.resolveSlash(a, s, v);
    this.registerCharacter(this.player);
    this.camYaw = this.player.yaw;

    this.rcv2 = new RCV2(this, this.player);
    this.player.setEquipped('fists');
    this.setEquipped('fists');

    // Hide the parts that would be inside the camera.
    this._hiddenSelf = ['head', 'neck'];
    this._applySelfVisibility();

    this.world.onImpact = (info) => this.onWorldImpact(info);
    this.world.onKillPlane = (info) => this.onKillPlane(info);
  }

  _applySelfVisibility() {
    const b = this.player.body;
    const firstPerson = !this.player.isRagdolling;
    for (const name of this._hiddenSelf) {
      const e = b.entries.get(name);
      if (!e) continue;
      e.skin.mesh.visible = !firstPerson;
      if (e.cloth) e.cloth.mesh.visible = !firstPerson;
    }
    if (b.hairMeshes) for (const m of b.hairMeshes) m.visible = !firstPerson;
  }

  /* --------------------------------------------------------------- registry */

  registerCharacter(c) {
    this.characters.push(c);
    this.stats.citizens = this.characters.length - 1;
  }

  removeCharacter(c) {
    if (c === this.player) return;
    const i = this.characters.indexOf(c);
    if (i >= 0) this.characters.splice(i, 1);
    if (this.rcv2?.grab?.character === c) this.rcv2.grab = null;
    c.dispose();
    this.stats.citizens = this.characters.length - 1;
  }

  trackSpawn(body) {
    this.spawnedBodies.push(body);
    this.stats.objects = this.spawnedBodies.length;
    if (this.spawnedBodies.length > this.quality.maxObjects) {
      this.removeBody(this.spawnedBodies[0]);
    }
    this.nav.dirty = true;
  }

  removeBody(body) {
    const i = this.spawnedBodies.indexOf(body);
    if (i >= 0) this.spawnedBodies.splice(i, 1);
    if (this.rcv2?.grab?.body === body) this.rcv2.grab = null;
    body.dead = true;
    disposeBody(this, body);
    this.stats.objects = this.spawnedBodies.length;
    this.nav.dirty = true;
  }

  clearSpawns() {
    if (this.carried) {
      this.scene.remove(this.carried.model);
      this.carried = null;
      this.hud?.setCarrying(null);
      this.setEquipped('fists');
    }
    for (const b of [...this.spawnedBodies]) this.removeBody(b);
    for (const c of [...this.characters]) if (c !== this.player) this.removeCharacter(c);
    this.nav.dirty = true;
  }

  washGore() {
    this.gore?.wash();
    for (const c of this.characters) c.body.washClean();
    for (const b of this.spawnedBodies) {
      const s = b.userData.paintSurface;
      if (s) {
        const base = b.tag === 'boulder' ? prewarmObjectArt().rockBase : prewarmObjectArt().woodBase;
        s.ctx.clearRect(0, 0, s.canvas.width, s.canvas.height);
        s.ctx.drawImage(base, 0, 0);
        s.texture.needsUpdate = true;
      }
    }
  }

  /* --------------------------------------------------------------- spawning */

  setSelected(id) {
    const all = [...SPAWNABLES.objects, ...SPAWNABLES.humans];
    const item = all.find((i) => i.id === id);
    if (item) this.selected = item;
    return this.selected;
  }

  /** The + button. Drops the selected thing in front of the player. */
  spawnSelected() {
    if (!this.player) return null;
    this.camera.getWorldDirection(_v1);
    _v2.copy(this.camera.position).addScaledVector(_v1, 2.9);
    const half = this.map.half - 2;
    _v2.x = clamp(_v2.x, -half, half);
    _v2.z = clamp(_v2.z, -half, half);

    // Do not drop things inside each other: walk the spawn point further out
    // along the aim, then spiral, until there is genuinely room.
    for (let attempt = 0; attempt < 14; attempt++) {
      let clash = false;
      // The map itself is in the way too: nothing is spawned inside a wall or
      // buried in the platform.
      for (const b of this.world.staticBodies) {
        if (_v2.x > b.aabbMin.x - 0.4 && _v2.x < b.aabbMax.x + 0.4 &&
            _v2.y > b.aabbMin.y - 0.4 && _v2.y < b.aabbMax.y + 0.4 &&
            _v2.z > b.aabbMin.z - 0.4 && _v2.z < b.aabbMax.z + 0.4) { clash = true; break; }
      }
      if (!clash) {
        for (const b of this.spawnedBodies) {
          const r = (b.shape === 'sphere' ? b.radius : b.half.length()) + 0.85;
          if (b.pos.distanceToSquared(_v2) < r * r) { clash = true; break; }
        }
      }
      if (!clash) {
        for (const c of this.characters) {
          const dx = c.pos.x - _v2.x, dz = c.pos.z - _v2.z;
          if (dx * dx + dz * dz < 0.9 * 0.9) { clash = true; break; }
        }
      }
      if (!clash) break;
      if (attempt < 5) {
        _v2.addScaledVector(_v1, 1.0);                 // further down the aim
      } else {
        const a = (attempt - 5) * 1.05;
        _v2.x += Math.cos(a) * 1.3;
        _v2.z += Math.sin(a) * 1.3;
      }
      _v2.x = clamp(_v2.x, -half, half);
      _v2.z = clamp(_v2.z, -half, half);
    }

    /* Whatever it is, it belongs on top of what is underneath it - the grass,
       or the platform if that is what is being aimed at. */
    const groundAt = this._surfaceHeight(_v2.x, _v2.z);
    const id = this.selected.id;
    if (id === 'citizen') {
      if (this.characters.length - 1 >= this.quality.maxCitizens) {
        const oldest = this.characters.find((c) => c !== this.player);
        if (oldest) this.removeCharacter(oldest);
      }
      _v2.y = groundAt;
      const c = spawnCitizen(this, _v2, { yaw: this.camYaw + Math.PI });
      return { type: 'citizen', name: 'Citizen', entity: c };
    }
    if (id === 'boulder') {
      _v2.y = Math.max(_v2.y, groundAt + 0.9);
      const b = spawnBoulder(this, _v2);
      return { type: 'body', name: 'Boulder', entity: b };
    }
    if (MELEE[id]) {
      _v2.y = Math.max(_v2.y, groundAt + 0.6);
      const b = MELEE[id].spawn(this, _v2);
      return { type: 'body', name: MELEE[id].label, entity: b };
    }
    _v2.y = Math.max(_v2.y, groundAt + 0.7);
    const b = spawnCrate(this, _v2);
    return { type: 'body', name: 'Crate', entity: b };
  }

  /** Height of whatever a thing dropped here would land on. */
  _surfaceHeight(x, z) {
    let best = this.world.hasGround ? this.world.groundY : 0;
    for (const b of this.world.staticBodies) {
      if (x < b.aabbMin.x || x > b.aabbMax.x || z < b.aabbMin.z || z > b.aabbMax.z) continue;
      if (b.aabbMax.y > best) best = b.aabbMax.y;
    }
    return best;
  }

  /* ---------------------------------------------------------------- carrying */

  /** The nearest thing in front of the player that can be picked up. */
  pickupInReach() {
    if (!this.player || this.player.state !== STATE.CONTROLLED) return null;
    this.camera.getWorldDirection(_v1);
    _v1.y = 0;
    if (_v1.lengthSq() < 1e-6) return null;
    _v1.normalize();
    const feet = this.player.pos.y - HIP_HEIGHT;
    let best = null, bestScore = -Infinity;
    for (const b of this.spawnedBodies) {
      if (!b.userData.pickup) continue;
      // Measured flat, so something lying at your feet is in reach without
      // having to stare at the ground first.
      const dx = b.pos.x - this.player.pos.x, dz = b.pos.z - this.player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.4) continue;
      if (b.pos.y < feet - 0.6 || b.pos.y > feet + 2.0) continue;
      const facing = d < 0.35 ? 1 : (dx * _v1.x + dz * _v1.z) / d;
      if (facing < 0.1) continue;
      const score = facing * 2 - d;
      if (score > bestScore) { bestScore = score; best = b; }
    }
    return best;
  }

  /** The USE button: take what is in reach, or put down what is in hand. */
  useAction() {
    if (this.carried) { this.dropCarried(); return; }
    const body = this.pickupInReach();
    if (!body) { this.hud?.toast('Nothing to pick up'); return; }
    this.pickUp(body);
  }

  pickUp(body) {
    const kind = body.userData.pickup;
    const spec = MELEE[kind];
    if (!spec) return;
    if (this.player.armBroken('R')) { this.hud?.toast('Your right arm is broken'); return; }
    // The loose item becomes a held one: same model, no longer simulated.
    const model = body.mesh;
    model.userData.bodyOffset = null;
    model.matrixAutoUpdate = false;
    const i = this.spawnedBodies.indexOf(body);
    if (i >= 0) this.spawnedBodies.splice(i, 1);
    if (this.rcv2?.grab?.body === body) this.rcv2.grab = null;
    this.world.removeBody(body);
    this.stats.objects = this.spawnedBodies.length;
    this.nav.dirty = true;

    // bodyRef is kept only so the lazily created blade canvas can be found
    // again; the body itself is no longer simulated.
    this.carried = {
      kind, model, bodyRef: body,
      painter: body.userData.paintBlood,
      surface: body.userData.paintSurface || null,
      material: body.userData.material,
    };
    this.hud?.setCarrying(kind);
    this.setEquipped(kind);
    this.hud?.toast('Picked up the ' + spec.label);
  }

  dropCarried() {
    const c = this.carried;
    if (!c) return;
    const spec = MELEE[c.kind];
    this.carried = null;
    this.hud?.setCarrying(null);

    // Put it back into the world where the weapon actually is, moving the way
    // the hand was moving.
    const hand = this.player.rig.byName.handR;
    boneBoxCenter(hand, _v1);
    _q1.copy(hand.worldQuat).multiply(spec.tilt);
    _v2.set(0, spec.dropAt, 0).applyQuaternion(_q1).add(_v1);
    const body = spec.spawn(this, _v2, {
      quat: _q1,
      reuse: { model: c.model, material: c.material, surface: c.surface },
    });
    _v3.copy(this.player.handVel.R).clampLength(0, 9);
    body.vel.copy(_v3).addScaledVector(_v1.set(0, 1, 0), 0.6);
    body.angVel.set((this.rng() - 0.5) * 5, (this.rng() - 0.5) * 3, (this.rng() - 0.5) * 5);
    body.wake();

    this.setEquipped('fists');
    this.hud?.toast('Dropped the ' + spec.label);
  }

  /** Keeps a carried item in the hand that is holding it. */
  _syncCarried() {
    const c = this.carried;
    if (!c) return;
    const spec = MELEE[c.kind];
    const hand = this.player.rig.byName.handR;
    boneBoxCenter(hand, _v1);
    _q1.copy(hand.worldQuat).multiply(spec.tilt);
    c.model.quaternion.copy(_q1);
    c.model.position.copy(_v2.set(0, spec.lift, 0).applyQuaternion(_q1)).add(_v1);
    c.model.updateMatrix();
    c.model.visible = this.equipped === c.kind;
  }

  /* ----------------------------------------------------------------- weapons */

  setEquipped(name) {
    if (MELEE[name] && this.carried?.kind !== name) name = 'fists';
    this.equipped = name;
    this.player.setEquipped(name);
    if (this.rcv2) this.rcv2.setVisible(name === 'rcv2');
    if (this.carried) this.carried.model.visible = name === this.carried.kind;
    this.hud?.setWeapon(name);
  }

  primaryAction() {
    if (!this.player || this.player.dead) return;
    if (this.player.state !== STATE.CONTROLLED) return;
    if (this.equipped === 'fists') {
      this.player.punch();
    } else if (MELEE[this.equipped]) {
      // Every carried weapon swings; only the RCV2 shoots.
      this.player.slash();
    } else {
      this.camera.getWorldDirection(_v1);
      const res = this.rcv2.shoot(this.camera.position, _v1);
      if (res === 'grabbed') this.hud?.setGrabbing(true);
      else if (res === 'released') this.hud?.setGrabbing(false);
      else this.hud?.toast('Nothing there');
      this.alertNearby(2.0);
    }
  }

  deleteAction() {
    if (this.equipped !== 'rcv2') { this.hud?.toast('Equip the RCV2 first'); return; }
    this.camera.getWorldDirection(_v1);
    const what = this.rcv2.deleteTarget(this.camera.position, _v1);
    this.hud?.setGrabbing(false);
    if (what) this.hud?.toast('Deleted ' + what);
    else this.hud?.toast('Nothing to delete');
  }

  spawnAction() {
    if (this.equipped !== 'rcv2') { this.hud?.toast('Equip the RCV2 to spawn'); return; }
    const r = this.spawnSelected();
    if (r) this.hud?.toast('Spawned ' + r.name);
  }

  /* -------------------------------------------------------------------- AI */

  threatCandidates() {
    const out = [this.player];
    for (const c of this.characters) {
      if (c === this.player) continue;
      if (c.combatReady) out.push(c);
    }
    return out;
  }

  isAimingAt(source, target) {
    if (source === this.player) {
      this.camera.getWorldDirection(_v1);
      _v2.copy(target.center).sub(this.camera.position);
    } else {
      _v1.set(-Math.sin(source.yaw), 0, -Math.cos(source.yaw));
      _v2.copy(target.center).sub(source.pos);
    }
    const d = _v2.length();
    if (d > 12 || d < 0.001) return false;
    return _v2.multiplyScalar(1 / d).dot(_v1) > 0.93;
  }

  alertNearby(intensity) {
    for (const c of this.characters) {
      if (c === this.player || !c.ai) continue;
      const d = c.pos.distanceTo(this.player.pos);
      if (d < 9) c.ai.onThreatened(this.player, intensity * (1 - d / 9));
    }
  }

  /* --------------------------------------------------------------- damage */

  /**
   * The visible consequences of an injury: blood where it happened, a word to
   * the player about their own body, and a weapon on the floor if the arm
   * holding it has just stopped working.
   */
  handleInjury(info) {
    const { character, kind, boneName, point } = info;
    if (kind === 'break') {
      const bone = character.rig.byName[boneName];
      if (bone) {
        boneBoxCenter(bone, _v1);
        const at = point || _v1;
        character.body.paintHit(boneName, at, { kind: 'impact', severity: 1, allowTear: true });
        this.gore?.burst(at, _v2.set(0, 1, 0), 14, { speed: 2.4, spread: 0.9, size: 0.03 });
      }
      if (character === this.player) {
        this.hud?.toast(BREAK_NAME[boneName] ? 'Your ' + BREAK_NAME[boneName] + ' is broken' : 'Broken bone');
        // you cannot hold a sledgehammer with a broken arm
        if (this.carried && character.armBroken('R')) this.dropCarried();
      }
    } else if (kind === 'face') {
      if (point) this.gore?.burst(point, _v2.set(0, 0.4, -1), 6, { speed: 1.6, spread: 0.9, size: 0.024 });
      if (character === this.player) {
        const inj = character.injuries;
        if (inj.eyeR === 'gone' || inj.eyeL === 'gone') this.hud?.toast('You lost an eye');
        else if (inj.eyeR === 'hanging' || inj.eyeL === 'hanging') this.hud?.toast('Your eye is hanging out');
      }
    }
  }

  handleDamage(info) {
    this.gore?.onCharacterDamage(info);
    const victim = info.character;
    if (victim.ai) victim.ai.onHurt(info);
    if (victim === this.player) {
      this.hud?.flashDamage(clamp01(info.amount / 22));
      this.shake = Math.min(1, this.shake + info.amount / 30);
      if (info.fatal) this.hud?.showDeath();
    }
    for (const c of this.characters) {
      if (c !== victim && c.ai) c.ai.onWitness(victim);
    }
  }

  onWorldImpact(info) {
    // Somebody or something hit hard enough to matter.
    if (info.character) {
      const c = info.character;
      const speed = info.speed;
      if (speed < 6.5) return;
      const bone = nearestBone(c, info.point, 0.12);
      const dmg = (speed - 6) * 1.5;
      if (dmg > 0.6) {
        c.applyDamage(dmg, {
          boneName: bone ? bone.name : 'midTorso',
          point: info.point,
          type: speed > 11 ? 'impact' : 'blunt',
          severity: clamp01((speed - 6) / 14),
        });
        if (speed > 11) this.gore?.impactSplatter(info.point, info.normal, speed);
      }
      return;
    }
    // Two objects colliding: only interesting if a person is in between, which
    // the particle path above already covers.
  }

  onKillPlane(info) {
    if (info.body) { this.removeBody(info.body); return; }
    const c = info.character;
    if (c === this.player) {
      this.player.teleport(this.map.spawnPoint.x, this.map.spawnPoint.z, this.map.spawnYaw);
      this.camYaw = this.map.spawnYaw;
      this.camPitch = 0;
      this.player.health = Math.max(1, this.player.health - 35);
      this.hud?.flashDamage(0.7);
    } else {
      this.removeCharacter(c);
    }
  }

  /* -------------------------------------------------------- realistic hits */

  /**
   * A slash only lands where the blade actually is. Same rule as the fists:
   * the edge of the machete is sampled along its length and tested against
   * real body parts, so reach and timing are the weapon's own geometry.
   */
  resolveSlash(attacker, side, handVel) {
    if (attacker !== this.player || !this.carried) return;
    const spec = MELEE[this.carried.kind];
    const hand = attacker.rig.byName.handR;
    boneBoxCenter(hand, _v1);
    _q1.copy(hand.worldQuat).multiply(spec.tilt);

    // where this particular weapon does its damage: an edge, or a block
    const contacts = [];
    spec.contacts(contacts, _v1, _q1, _v3);
    const far = contacts[contacts.length - 1];

    // speed of the business end, which is what a swing actually delivers
    if (!this._prevTip) { this._prevTip = far.clone(); return; }
    const speed = Math.max(handVel.length(), far.distanceTo(this._prevTip) * 60);

    /* A hammer head on the end of a metre of haft covers most of a body
       between one frame and the next, so testing where it IS would let it pass
       clean through somebody. Test where it HAS BEEN instead: every contact
       point is swept from its last position to this one. That is still real
       contact - it is the path the steel actually took - and it is the only
       way a fast weapon connects honestly. */
    const prev = this._prevContacts;
    const samples = contacts.slice();
    if (prev && prev.length === contacts.length) {
      for (let i = 0; i < contacts.length; i++) {
        const gap = contacts[i].distanceTo(prev[i]);
        // A jump this big is a new swing starting, not a swing travelling.
        if (gap > 1.6 || gap < 0.02) continue;
        const steps = Math.min(6, Math.ceil(gap / 0.09));
        for (let k = 1; k < steps; k++) {
          samples.push(prev[i].clone().lerp(contacts[i], k / steps));
        }
      }
    }
    this._prevContacts = contacts.map((p) => p.clone());

    for (const target of this.characters) {
      if (target === attacker || target.body.destroyed) continue;
      if (attacker.struck.has(target.id)) continue;
      if (Math.abs(target.center.x - _v1.x) > 2.4 ||
          Math.abs(target.center.z - _v1.z) > 2.4 ||
          Math.abs(target.center.y - _v1.y) > 2.6) continue;

      let hitBone = null, hitPoint = null;
      for (const bone of target.rig.bones) {
        if (bone.def.finger) continue;
        for (let i = 0; i < samples.length; i++) {
          if (pointInBone(bone, samples[i], 0.01)) { hitBone = bone; hitPoint = samples[i]; break; }
        }
        if (hitBone) break;
      }
      if (!hitBone) continue;
      attacker.struck.add(target.id);

      const dmg = clamp((speed - 1.0) * spec.dmg.mul, spec.dmg.min, spec.dmg.max);
      const sev = clamp01((speed - 1.0) / spec.sev.div);
      _v3.copy(handVel).normalize();
      _v4.copy(_v3).multiplyScalar(clamp(speed * spec.push.mul, spec.push.min, spec.push.max));
      _v4.y += spec.push.lift;

      // A blade opens people up and a hammer caves them in; neither merely
      // bruises, and only the hammer breaks what is under the skin.
      target.applyImpact(hitPoint, _v4, {
        boneName: hitBone.name, damage: dmg, type: spec.type, attacker,
        severity: Math.max(spec.sev.min, sev), crush: spec.crush * clamp01(0.35 + sev),
      });
      if (target.ai) target.ai.onHurt({ amount: dmg * 1.4, attacker });
      this.carried.painter?.(hitPoint, Math.max(0.4, sev), { x: _v3.x, y: _v3.y, z: _v3.z });
      if (!this.carried.surface) this.carried.surface = this.carried.bodyRef?.userData.paintSurface || null;
      this.shake = Math.min(0.9, this.shake + spec.shake);
    }
    this._prevTip.copy(far);
  }

  /**
   * A jab only lands if the fist geometry genuinely overlaps a body part.
   * There is no separate attack hitbox anywhere in the game.
   */
  resolveStrike(attacker, side, handVel) {
    const handBone = attacker.rig.byName['hand' + side];
    const speed = handVel.length();
    if (speed < 2.0) return;

    const corners = boneCorners(handBone);
    const samples = [_v1.copy(handBone.worldEnd)];
    for (let i = 0; i < 8; i++) samples.push(corners[i]);

    for (const target of this.characters) {
      if (target === attacker) continue;
      if (attacker.struck.has(target.id)) continue;
      if (target.body.destroyed) continue;
      if (Math.abs(target.center.x - handBone.worldPos.x) > 1.6 ||
          Math.abs(target.center.z - handBone.worldPos.z) > 1.6 ||
          Math.abs(target.center.y - handBone.worldPos.y) > 1.9) continue;

      let hitBone = null, hitPoint = null;
      for (const bone of target.rig.bones) {
        if (bone.def.finger) continue;
        for (let i = 0; i < samples.length; i++) {
          if (pointInBone(bone, samples[i], 0.012)) { hitBone = bone; hitPoint = samples[i]; break; }
        }
        if (hitBone) break;
      }
      if (!hitBone) continue;

      attacker.struck.add(target.id);

      const dmg = clamp((speed - 0.9) * 3.0, 1.5, 24);
      _v3.copy(handVel).normalize();
      _v4.copy(_v3).multiplyScalar(clamp(speed * 9, 10, 130));
      _v4.y += 7;

      target.applyImpact(hitPoint, _v4, {
        boneName: hitBone.name,
        damage: dmg,
        type: 'blunt',
        attacker,
        severity: clamp01((speed - 0.9) / 5.5),
      });
      if (target.ai) target.ai.onHurt({ amount: dmg, attacker });
      if (attacker === this.player) this.shake = Math.min(0.7, this.shake + 0.18);
    }

    // Fists work on crates and boulders too.
    for (const b of this.world.bodies) {
      if (attacker.struck.has('b' + b.id)) continue;
      let inside = false;
      for (let i = 0; i < samples.length; i++) {
        if (b.containsPoint(samples[i])) { inside = true; _v2.copy(samples[i]); break; }
      }
      if (!inside) continue;
      attacker.struck.add('b' + b.id);
      _v4.copy(handVel).normalize().multiplyScalar(clamp(speed * 9, 10, 190));
      b.applyImpulse(_v4, _v2);
      b.wake();
    }
  }

  /* ---------------------------------------------------------------- update */

  update(dt, input) {
    if (!this.running || this.paused) return;
    this.time += dt;
    dt = Math.min(dt, 1 / 24);

    this._readInput(dt, input);

    // --- characters think and pose ---
    for (let i = 0; i < this.characters.length; i++) {
      const c = this.characters[i];
      if (c.ai) c.ai.update(dt);
      c.update(dt);
    }

    // --- physics ---
    this.world.step(dt);

    // --- resolve visuals ---
    for (let i = 0; i < this.characters.length; i++) {
      const c = this.characters[i];
      c.lateUpdate(dt);
      c.body.setLod(c === this.player ? 0 : c.center.distanceTo(this.camPos));
    }
    for (let i = 0; i < this.spawnedBodies.length; i++) syncBodyMesh(this.spawnedBodies[i]);

    // --- weapon ---
    if (this.equipped === 'rcv2') {
      this.rcv2.attachToHand(this.player);
      this.rcv2.update(dt, this.camera);
    }
    this._syncCarried();

    // --- gore ---
    if (this.gore) {
      this.gore.update(dt, this.characters);
      for (const c of this.characters) this.gore.bleedTick(c, dt);
    }

    // --- navigation ---
    this.navTimer -= dt;
    if (this.navTimer <= 0) {
      this.navTimer = this.nav.dirty ? 0.15 : 0.6;
      this.nav.rebuild(this.world, { groundY: 0 });
    }

    this._applySelfVisibility();
    this.updateCamera(dt);
    this._followSun();
    this._updateHud(dt);
  }

  _readInput(dt, input) {
    const p = this.player;
    if (!p) return;

    // ---- look ----
    const look = input.consumeLook();
    if (p.state === STATE.CONTROLLED && !p.dead) {
      this.camYaw -= look.x;
      this.camPitch = clamp(this.camPitch - look.y, -1.42, 1.42);
      /* The camera is the gaze, not the hips. The body turns its head first
         and brings the shoulders and then the hips round after it, which the
         character does for itself. */
      p.gazeYaw = this.camYaw;
      p.pitch = this.camPitch;
    }

    // ---- move ----
    if (p.state === STATE.CONTROLLED || p.state === STATE.STUMBLE) {
      const s = Math.sin(this.camYaw), c = Math.cos(this.camYaw);
      const fx = -s, fz = -c;      // forward
      const rx = c, rz = -s;       // right
      p.moveInput.set(
        fx * input.move.y + rx * input.move.x,
        0,
        fz * input.move.y + rz * input.move.x,
      );
      const mag = Math.hypot(input.move.x, input.move.y);
      p.wantRun = mag > 0.78;
    } else {
      const s = Math.sin(this.camYaw), c = Math.cos(this.camYaw);
      p.moveInput.set(-s * input.move.y + c * input.move.x, 0, -c * input.move.y - s * input.move.x);
    }

    // ---- buttons ----
    if (input.pressed.jump) p.wantJump = true;
    if (input.pressed.crouch) p.crouchWant = !p.crouchWant;
    if (input.pressed.primary) this.primaryAction();
    if (input.pressed.spawn) this.spawnAction();
    if (input.pressed.delete) this.deleteAction();
    if (input.pressed.use) this.useAction();
    void dt;
  }

  updateCamera(dt) {
    const p = this.player;
    if (!p) return;
    if (this.debugCam) {
      const d = this.debugCam;
      this.camera.position.set(d.x, d.y, d.z);
      _e.set(d.pitch || 0, d.yaw || 0, 0, 'YXZ');
      this.camera.quaternion.setFromEuler(_e);
      this.camera.updateMatrixWorld();
      return;
    }
    p.eyePosition(_v1);

    if (p.state === STATE.CONTROLLED && !p.dead) {
      this.camPos.copy(_v1);
      _e.set(this.camPitch, this.camYaw, 0, 'YXZ');
      this.camQuat.setFromEuler(_e);
    } else {
      // Ragdolled: ride the head, but keep the roll gentle enough to watch.
      const head = p.rig.byName.head;
      this.camPos.lerp(_v1, clamp01(dt * 16));
      _q1.copy(head.worldQuat);
      _q2.setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2 + 0.1);
      _q1.multiply(_q2);
      this.camQuat.slerp(_q1, clamp01(dt * 7));
    }

    this.shake = Math.max(0, this.shake - dt * 2.4);
    this.camera.position.copy(this.camPos);
    this.camera.quaternion.copy(this.camQuat);
    if (this.shake > 0.001) {
      const s = this.shake * 0.045;
      this.camera.position.x += (this.rng() - 0.5) * s;
      this.camera.position.y += (this.rng() - 0.5) * s;
      _q1.setFromAxisAngle(_v2.set(0, 0, 1), (this.rng() - 0.5) * this.shake * 0.05);
      this.camera.quaternion.multiply(_q1);
    }
    this.camera.updateMatrixWorld();
  }

  _followSun() {
    if (!this.map?.sun || !this.quality.shadows) return;
    const s = this.map.sun;
    const p = this.player.pos;
    s.position.set(p.x + 26, p.y + 42, p.z + 16);
    s.target.position.set(p.x, p.y - 1, p.z);
    s.target.updateMatrixWorld();
  }

  _updateHud(dt) {
    if (!this.hud) return;
    this._fpsAcc += dt; this._fpsCount++;
    if (this._fpsAcc > 0.5) {
      this.stats.fps = Math.round(this._fpsCount / this._fpsAcc);
      this._fpsAcc = 0; this._fpsCount = 0;
    }
    this.hud.setHealth(this.player.health / this.player.maxHealth);
    this.hud.setBlindness(this.player.blind);
    if (this.equipped === 'rcv2') {
      this._pickTimer = (this._pickTimer || 0) - dt;
      if (this.rcv2.holding) {
        this._crosshairHit = true;
      } else if (this._pickTimer <= 0) {
        this._pickTimer = 0.1;
        this.camera.getWorldDirection(_v1);
        this._crosshairHit = !!this.rcv2.pick(this.camera.position, _v1, 30);
      }
      this.hud.setCrosshairActive(this._crosshairHit);
      this.hud.setGrabbing(this.rcv2.holding);
    } else {
      this.hud.setCrosshairActive(false);
      this.hud.setGrabbing(false);
    }
    this._useTimer = (this._useTimer || 0) - dt;
    if (this._useTimer <= 0) {
      this._useTimer = 0.12;
      this.hud.setUseAvailable(!!this.carried || !!this.pickupInReach(), !!this.carried);
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  respawnPlayer() {
    const p = this.player;
    // Bringing the player back to life is what clears the death screen. It
    // covers the whole HUD and swallows every touch, so leaving it to the
    // caller means one missed call silently kills all input.
    this.hud?.hideDeath();
    p.heal();
    p.body.washClean();
    this.hud?.setBlindness(0);
    p.teleport(this.map.spawnPoint.x, this.map.spawnPoint.z, this.map.spawnYaw);
    this.camYaw = this.map.spawnYaw;
    this.camPitch = 0;
    this.shake = 0;
  }

  setFov(fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }

  dispose() {
    this.running = false;
    window.removeEventListener('resize', this._onResize);
    for (const c of [...this.characters]) { c.dispose(); }
    this.characters.length = 0;
    for (const b of [...this.spawnedBodies]) disposeBody(this, b);
    this.spawnedBodies.length = 0;
    this.rcv2?.dispose();
    this.gore?.dispose();
    this.map?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

