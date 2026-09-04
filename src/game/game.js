/* =============================================================================
   The game: scene, camera, the player, everything that has been spawned, and
   the tick that keeps it all moving.
   ========================================================================== */
import {
  Scene, PerspectiveCamera, WebGLRenderer, Vector3, Quaternion, Euler,
  PCFSoftShadowMap, SRGBColorSpace, ACESFilmicToneMapping, MathUtils,
} from 'three';
import { PhysicsWorld } from '../physics/world.js';
import { getMap } from './map.js';
import { Character, STATE } from './character.js';
import { playerAppearance } from './appearance.js';
import { spawnCitizen } from './citizen.js';
import { spawnCrate, spawnBoulder, syncBodyMesh, disposeBody, prewarmObjectArt } from './objects.js';
import { GoreSystem, nearestBone } from './gore.js';
import { NavGrid } from './ai.js';
import { RCV2 } from './rcv2.js';
import { boneBoxCenter, boneCorners, pointInBone, worldToBoxLocal, HIP_HEIGHT } from './skeleton.js';
import { clamp, clamp01, lerp, damp, makeRng, yieldToPaint } from '../core/util.js';

const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3(), _v4 = new Vector3();
const _q1 = new Quaternion(), _q2 = new Quaternion();
const _e = new Euler(0, 0, 0, 'YXZ');
const UP = new Vector3(0, 1, 0);

export const QUALITY = {
  low: { shadows: false, shadowMap: 512, pixelRatio: 1.0, grassSize: 256, maxObjects: 40, maxCitizens: 10 },
  medium: { shadows: true, shadowMap: 1024, pixelRatio: 1.35, grassSize: 512, maxObjects: 70, maxCitizens: 16 },
  high: { shadows: true, shadowMap: 2048, pixelRatio: 2.0, grassSize: 512, maxObjects: 110, maxCitizens: 24 },
};

export const SPAWNABLES = {
  objects: [
    { id: 'crate', name: 'Crate', icon: 'crate', hint: 'Wooden crate' },
    { id: 'boulder', name: 'Boulder', icon: 'boulder', hint: 'Rock boulder' },
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
    this.player.onStrike = (a, s, v) => this.resolveStrike(a, s, v);
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
      for (const b of this.spawnedBodies) {
        const r = (b.shape === 'sphere' ? b.radius : b.half.length()) + 0.85;
        if (b.pos.distanceToSquared(_v2) < r * r) { clash = true; break; }
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

    const id = this.selected.id;
    if (id === 'citizen') {
      if (this.characters.length - 1 >= this.quality.maxCitizens) {
        const oldest = this.characters.find((c) => c !== this.player);
        if (oldest) this.removeCharacter(oldest);
      }
      _v2.y = 0;
      const c = spawnCitizen(this, _v2, { yaw: this.camYaw + Math.PI });
      return { type: 'citizen', name: 'Citizen', entity: c };
    }
    if (id === 'boulder') {
      _v2.y = Math.max(_v2.y, 0.9);
      const b = spawnBoulder(this, _v2);
      return { type: 'body', name: 'Boulder', entity: b };
    }
    _v2.y = Math.max(_v2.y, 0.7);
    const b = spawnCrate(this, _v2);
    return { type: 'body', name: 'Crate', entity: b };
  }

  /* ----------------------------------------------------------------- weapons */

  setEquipped(name) {
    this.equipped = name;
    this.player.setEquipped(name);
    if (this.rcv2) this.rcv2.setVisible(name === 'rcv2');
    this.hud?.setWeapon(name);
  }

  primaryAction() {
    if (!this.player || this.player.dead) return;
    if (this.player.state !== STATE.CONTROLLED) return;
    if (this.equipped === 'fists') {
      this.player.punch();
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
      this.player.health = Math.max(1, this.player.health - 35);
      this.hud?.flashDamage(0.7);
    } else {
      this.removeCharacter(c);
    }
  }

  /* -------------------------------------------------------- realistic hits */

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
      p.yaw = this.camYaw;
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
    if (this.equipped === 'rcv2') {
      this.camera.getWorldDirection(_v1);
      const hit = this.rcv2.holding ? true : !!this.rcv2.pick(this.camera.position, _v1, 30);
      this.hud.setCrosshairActive(hit);
      this.hud.setGrabbing(this.rcv2.holding);
    } else {
      this.hud.setCrosshairActive(false);
      this.hud.setGrabbing(false);
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  respawnPlayer() {
    const p = this.player;
    p.dead = false;
    p.health = p.maxHealth;
    p.balance = 1;
    for (const k in p.partHealth) p.partHealth[k] = p.rig.byName[k].hp;
    p.body.washClean();
    p.body.setExpression('neutral');
    p.teleport(this.map.spawnPoint.x, this.map.spawnPoint.z, this.map.spawnYaw);
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

export { STATE, HIP_HEIGHT, boneBoxCenter, worldToBoxLocal, lerp, damp, MathUtils };
