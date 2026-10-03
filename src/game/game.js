/* =============================================================================
   The game: scene, camera, the player, everything that has been spawned, and
   the tick that keeps it all moving.
   ========================================================================== */
import {
  Scene, PerspectiveCamera, WebGLRenderer, Vector3, Quaternion, Euler, Matrix4,
  PCFSoftShadowMap, PCFShadowMap, SRGBColorSpace, ACESFilmicToneMapping,
} from 'three';
import { PhysicsWorld } from '../physics/world.js';
import { getMap, inPool } from './map.js';
import { Character, STATE } from './character.js';
import { playerAppearance } from './appearance.js';
import { spawnCitizen } from './citizen.js';
import {
  spawnCrate, spawnBoulder, spawnMachete, spawnSledge, spawnCrowbar, createMacheteModel,
  syncBodyMesh, disposeBody, prewarmObjectArt, MACHETE, SLEDGE, CROWBAR, crowbarClaw,
} from './objects.js';
import { gripWorld } from './grip.js';
import {
  GLOCK, AK47, M16, FLAMER, MOSSBERG, spawnGlock, spawnAk, spawnM16, spawnFlamer, spawnMossberg,
  MuzzleFlash, CaseEjector,
} from './guns.js';
import { GoreSystem, nearestBone } from './gore.js';
import { WoundSystem } from './wounds.js';
import { spawnOfficer, setOfficerGunSpec } from './officer.js';
import { spawnZombie } from './zombie.js';
import { Armour, ARMOUR, spawnArmour } from './armour.js';
import { Fx } from './fx.js';
import { FireSystem } from './fire.js';
import { SilvaEncounter } from './encounter.js';
import { ShadowEncounter } from './shadow.js';
import { isUnlocked } from './progress.js';
import { NavGrid } from './ai.js';
import { RCV2 } from './rcv2.js';
import { boneCorners, pointInBone, boneBoxCenter, rayBone, HIP_HEIGHT } from './skeleton.js';
import { clamp, clamp01, damp, makeRng, yieldToPaint } from '../core/util.js';

const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3(), _v4 = new Vector3();
/* Firing borrows nothing: the trace it runs writes over every other scratch
   vector in this file, and the muzzle is still needed afterwards. */
const _gunPos = new Vector3(), _gunAim = new Vector3(), _gunTmp = new Vector3();
const _aimAt = new Vector3();
const _pelletDir = new Vector3(), _pelletSide = new Vector3(), _pelletUp = new Vector3();
const _gunQuat = new Quaternion();
const _q1 = new Quaternion(), _q2 = new Quaternion();
const _e = new Euler(0, 0, 0, 'YXZ');
const _m4 = new Matrix4();
const UP = new Vector3(0, 1, 0);

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
    /* Held the way a machete is held: the handle through the fist, the blade
       coming out over the knuckles. `at` is how far up the handle the hand
       closes - a hand is 90 mm across and the handle is 115 mm long, so the
       fist sits just under the guard. */
    grip: { rake: 0.45, roll: 0, hold: [0, 0.062, 0] },
    center: new Vector3(0, MACHETE.length / 2, 0),
    type: 'impact',
    wound: 'gash',
    dmg: { mul: 3.6, min: 3, max: 42 },
    sev: { div: 6, min: 0.55 },
    push: { mul: 6, min: 8, max: 90, lift: 4 },
    crush: 0,                           // blades cut, they do not shatter bone
    shake: 0.22,
    /** Nine points down the cutting edge, guard to tip. */
    contacts(out, origin, quat, v) {
      for (let i = 0; i <= 8; i++) {
        const y = MACHETE.grip + 0.03 + (MACHETE.blade - 0.03) * (i / 8);
        out.push(v.set(MACHETE.width * 0.42, y, 0).applyQuaternion(quat).add(origin).clone());
      }
    },
  },
  sledge: {
    label: 'Sledgehammer',
    spawn: spawnSledge,
    // The right hand takes the bound end of the haft; the left rides up it.
    grip: { rake: 0.42, roll: 0, hold: [0, 0.105, 0] },
    leftAt: 0.40,
    center: new Vector3(0, SLEDGE.length / 2, 0),
    type: 'blunt',
    wound: 'split',
    dmg: { mul: 5.0, min: 6, max: 58 },
    sev: { div: 5, min: 0.7 },
    push: { mul: 15, min: 20, max: 230, lift: 8 },
    crush: 0.85,                        // this is what breaks bones
    shake: 0.5,
    /** The striking block across the top of the haft. */
    contacts(out, origin, quat, v) {
      const y = SLEDGE.haft + SLEDGE.headH / 2;
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
  crowbar: {
    label: 'Crowbar',
    spawn: spawnCrowbar,
    /* One hand, low down the shaft, so the gooseneck swings out at the end of
       a long lever. That is what a crowbar is for and what makes it hurt. */
    grip: { rake: 0.45, roll: 0, hold: [0, 0.155, 0] },
    center: CROWBAR.mid,
    type: 'blunt',
    wound: 'split',
    /* Between the two: it has the machete's speed and a lot more of the
       sledgehammer's weight behind a much smaller face, so it concentrates
       everything it carries into one place. */
    dmg: { mul: 4.4, min: 5, max: 50 },
    sev: { div: 5.5, min: 0.62 },
    push: { mul: 10, min: 14, max: 150, lift: 6 },
    crush: 0.62,                        // a steel bar breaks what it lands on
    shake: 0.34,
    /** The claw, the neck behind it, and the top of the shaft. */
    contacts(out, origin, quat, v) {
      const tip = crowbarClaw();
      const top = 0.06 + CROWBAR.shaft;
      for (let i = 0; i <= 5; i++) {
        const a = (CROWBAR.sweep * i) / 5;
        out.push(v.set(0,
          top + CROWBAR.bend * Math.sin(a),
          -CROWBAR.bend + CROWBAR.bend * Math.cos(a)).applyQuaternion(quat).add(origin).clone());
      }
      for (const sx of [-1, 1]) {
        out.push(v.set(sx * 0.010, tip.y, tip.z).applyQuaternion(quat).add(origin).clone());
      }
      // and the last stretch of the shaft, so a short swing still connects
      for (const fy of [0.62, 0.82]) {
        out.push(v.set(0, 0.06 + CROWBAR.shaft * fy, 0).applyQuaternion(quat).add(origin).clone());
      }
    },
  },
};

/**
 * The two firearms. A gun is carried exactly like a blade - the grip through
 * the fist - and everything that makes it a gun rather than a club is here:
 * how fast it can be fired, how hard it hits, how much it kicks, and which
 * pair of reloads it plays depending on whether it ran dry.
 */
export const GUNS = {
  glock: {
    label: 'Glock-19',
    spawn: spawnGlock,
    gun: GLOCK,
    grip: { rake: 0.34, roll: -Math.PI / 2, hold: [0, -0.034, 0.012] },
    center: new Vector3(0, -0.034, -0.030),
    hold: 'glockHold',
    /** Semi automatic: one press, one round. */
    auto: false,
    interval: 0.135,
    capacity: 15,
    damage: 30,
    push: 210,
    range: 130,
    /* 9 mm out of a short barrel: a sharp, quick kick that comes straight
       back down, so a fast string of shots stays roughly on target. */
    recoil: { pitch: 0.052, yaw: 0.013, recover: 11, arm: 0.30, shake: 0.26 },
    flash: 0.55,
    reload: { normal: 'reloadPistol', empty: 'reloadPistolEmpty' },
    /* Where the magazine is gone, and where the slide is back, as fractions
       of each reload clip. */
    parts: {
      reloadPistol: { magOut: [0.20, 0.80] },
      reloadPistolEmpty: { magOut: [0.20, 0.80], slide: [1.28, 1.58] },
    },
  },
  ak47: {
    label: 'AK-47',
    spawn: spawnAk,
    gun: AK47,
    grip: { rake: 0.30, roll: -Math.PI / 2, hold: [0, -0.050, 0.026] },
    center: new Vector3(0, -0.030, -0.120),
    hold: 'akHold',
    /** Full automatic: it fires for as long as the button is held. */
    auto: true,
    interval: 0.10,                 // 600 rounds a minute
    capacity: 30,
    damage: 42,
    push: 340,
    range: 300,
    // 7.62 climbs, and keeps climbing while you hold it down
    recoil: { pitch: 0.070, yaw: 0.022, recover: 7.5, arm: 0.42, shake: 0.42 },
    flash: 0.85,
    reload: { normal: 'reloadRifle', empty: 'reloadRifleEmpty' },
    parts: {
      reloadRifle: { magOut: [0.62, 1.62], rock: [0.30, 1.95] },
      reloadRifleEmpty: { magOut: [0.62, 1.62], rock: [0.30, 1.95], bolt: [1.92, 2.28] },
    },
  },
  m16: {
    label: 'M16',
    spawn: spawnM16,
    gun: M16,
    grip: { rake: 0.30, roll: -Math.PI / 2, hold: [0, -0.050, 0.030] },
    center: new Vector3(0, -0.020, -0.130),
    hold: 'm16Hold',
    /** Full automatic, and faster than the AK: this is the M16A1. */
    auto: true,
    interval: 0.075,                // 800 rounds a minute
    capacity: 30,
    damage: 36,
    push: 260,
    range: 320,
    /* 5.56 out of a stock that is in line with the bore: the recoil goes
       straight back into the shoulder instead of levering the muzzle up, so
       it climbs about half as much as the AK and settles faster. */
    recoil: { pitch: 0.036, yaw: 0.011, recover: 12, arm: 0.24, shake: 0.26 },
    flash: 0.7,
    reload: { normal: 'reloadM16', empty: 'reloadM16Empty' },
    parts: {
      reloadM16: { magOut: [0.30, 1.30] },
      reloadM16Empty: { magOut: [0.30, 1.30], bolt: [1.70, 1.86] },
    },
  },
  flamethrower: {
    label: 'Flamethrower',
    spawn: spawnFlamer,
    gun: FLAMER,
    // laid out like an AK on purpose, so it is held exactly like one
    grip: { rake: 0.30, roll: -Math.PI / 2, hold: [0, -0.050, 0.026] },
    center: new Vector3(0, -0.030, -0.120),
    hold: 'flamerHold',
    /* Not rounds: the tank holds a hundred units of fuel, and holding the
       trigger lets one go every twentieth of a second as a puff of burning
       gas. Five seconds of fire, give or take. */
    auto: true,
    flame: true,
    interval: 0.045,
    capacity: 100,
    damage: 1.6,
    push: 0,
    range: 9,
    recoil: { pitch: 0.003, yaw: 0.004, recover: 10, arm: 0.03, shake: 0.03 },
    flash: 0,
    // a tank is a tank whether or not the last one was empty
    reload: { normal: 'reloadFlamer', empty: 'reloadFlamer' },
    parts: { reloadFlamer: { magOut: [1.05, 1.80] } },
  },
  mossberg: {
    label: 'Mossberg 500',
    spawn: spawnMossberg,
    gun: MOSSBERG,
    // shouldered like the AK, the left hand round the forend
    grip: { rake: 0.30, roll: -Math.PI / 2, hold: [0, -0.050, 0.026] },
    center: new Vector3(0, -0.010, -0.140),
    hold: 'mossbergHold',
    /* Pump action: one press, one shot, and then the forend has to be
       racked before there is another. Each shell is nine pellets of 00
       buckshot spreading out of the barrel: brutal close up, a scattering
       of hits further off, and nothing much past forty metres. */
    auto: false,
    pump: 'pumpMossberg',
    pumpDelay: 0.10,
    interval: 0.12,
    capacity: 6,
    pellets: 9,
    spread: 0.045,
    damage: 15,
    push: 110,
    range: 60,
    recoil: { pitch: 0.115, yaw: 0.030, recover: 6.5, arm: 0.65, shake: 0.62 },
    flash: 1.15,
    // loaded a shell at a time, and racked at the end if it ran dry
    shells: true,
    reload: { normal: 'loadShell', empty: 'loadShell' },
    parts: {
      pumpMossberg: { pump: [0.04, 0.16, 0.26, 0.40] },
      loadShell: { shell: [0.20, 0.40] },
    },
  },
};

setOfficerGunSpec(GUNS.glock);

/** How long you can hold your breath, and what the water does after that. */
export const AIR = { seconds: 15, drownDps: 10 };

/** Everything that can be picked up and held, however it is used. */
export const CARRY = { ...MELEE, ...GUNS };

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
    { id: 'crowbar', name: 'Crowbar', icon: 'crowbar', hint: 'Fast, and it still breaks bones.' },
    { id: 'vest', name: 'Light Vest', icon: 'vest', hint: 'Wear it with USE. Stops a few hits.' },
    { id: 'mvest', name: 'Medium Vest', icon: 'mvest', hint: 'The whole torso and the hips. Twice the light vest.' },
    { id: 'neckguard', name: 'Light Neck Armour', icon: 'neckguard', hint: 'A collar for the throat.' },
    { id: 'helmet', name: 'Light Helmet', icon: 'helmet', hint: 'Covers the head, not the face.' },
    { id: 'glock', name: 'Glock-19', icon: 'glock', hint: '15 rounds. Semi automatic.' },
    { id: 'ak47', name: 'AK-47', icon: 'ak47', hint: '30 rounds. Full automatic.' },
    { id: 'm16', name: 'M16', icon: 'm16', hint: '30 rounds. Faster, flatter.' },
    { id: 'flamethrower', name: 'Flamethrower', icon: 'flamer', hint: 'Sets anything it reaches on fire.' },
    { id: 'mossberg', name: 'Mossberg 500', icon: 'mossberg', hint: 'Pump shotgun. Six shells, nine pellets each.' },
  ],
  humans: [
    { id: 'citizen', name: 'Citizen', icon: 'citizen', hint: 'An ordinary person' },
    { id: 'officer', name: 'Officer', icon: 'officer', hint: 'Armed. Shoots you if you hurt anyone in sight.' },
    { id: 'zombie', name: 'Mutant', icon: 'zombie', hint: 'Blood-covered. Walks at the nearest living thing and claws.' },
  ],
};

export class Game {
  constructor(container, settings) {
    /** Interactables an encounter adds while it runs (the map has its own). */
    this.interactables = [];
    this.cutscene = null;
    this.travelling = false;
    this.onTravel = null;
    /** Fireballs and people on fire; and, on Red Plains, the fight. */
    this.fire = null;
    this.encounter = null;
    /* The Fire Fist: how long until it can throw again, and a throw that has
       been started but whose fist has not come forward yet. */
    this.fireFistCooldown = 0;
    this._pendingFireball = null;
    this.container = container;
    this.settings = settings;
    this.quality = QUALITY[settings.quality] || QUALITY.medium;
    if (!settings.shadows) this.quality = { ...this.quality, shadows: false };

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(settings.fov, 1, 0.045, 900);
    this.renderer = new WebGLRenderer({ antialias: settings.quality === 'high', powerPreference: 'high-performance' });
    /* The resolution the device asks for is where we start; if frames start
       taking too long it comes down (to just over half), and goes back up
       when there is time to spare. Fill rate is what a phone runs out of. */
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio);
    this.pixelRatio = this.basePixelRatio;
    this.renderer.setPixelRatio(this.pixelRatio);
    this._frameAvg = 1 / 60;
    this._slowFor = 0;
    this._fastFor = 0;
    this._lowPower = false;
    this._frameN = 0;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    if (this.quality.shadows) {
      this.renderer.shadowMap.enabled = true;
      // soft shadows cost several times the samples; only high quality pays for them
      this.renderer.shadowMap.type = settings.quality === 'high' ? PCFSoftShadowMap : PCFShadowMap;
      // redrawn every frame normally, every other frame when struggling
      this.renderer.shadowMap.autoUpdate = false;
    }
    container.appendChild(this.renderer.domElement);

    this.world = new PhysicsWorld();
    this.characters = [];
    this.spawnedBodies = [];
    this.rng = makeRng(0xbeef);

    this.map = null;
    this.player = null;
    this.gore = null;
    this.wounds = null;
    this.nav = new NavGrid(40, 0.7);
    this.navTimer = 0;

    this.selected = { id: 'crate', name: 'Crate' };
    this.carried = null;         // { kind, model, ammo } while something is held
    /* Firearms: how long until the next round can go off, how far through a
       reload we are, and the kick that is still working its way out of the
       camera and the arms. */
    this.gunCooldown = 0;
    this.reloadTimer = 0;
    this._pump = null;
    this._shells = null;
    this._reloadAfterPump = false;
    this.gunKick = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.flash = null;
    this.cases = null;
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
        this.fx = new Fx(this.scene);
        this.fire = new FireSystem(this);
        this.wounds = new WoundSystem(this);
      }],
      ['Assembling a body', async () => { this._createPlayer(); }],
      ['Mapping the ground', async () => {
        // the citizens' map is as big as the map they are on
        if (this.nav.half !== this.map.half) this.nav = new NavGrid(this.map.half, 0.7);
        this.nav.rebuild(this.world, { groundY: 0 });
      }],
      ['Populating', async () => {
        /* A couple of citizens so the map is not empty on arrival - in a ring
           round where you arrive, and only where there is ground to stand on,
           so nobody starts the game at the bottom of a pit. A map with
           something else in mind (an encounter) can ask for none. */
        if (this.map.citizens === 0) return;
        const sp = this.map.spawnPoint;
        let placed = 0;
        for (let i = 0; i < 24 && placed < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + 0.4 + i * 0.37;
          const r = 6.5 + (i % 3) * 1.5;
          const x = sp.x + Math.cos(a) * r, z = sp.z - 15 + Math.sin(a) * r;
          if (!this.world.hasGroundAt(x, z)) continue;
          if (Math.abs(x) > this.map.half - 3 || Math.abs(z) > this.map.half - 3) continue;
          spawnCitizen(this, _v1.set(x, 0, z));
          placed++;
        }
        // and whatever loose things the map wants lying about
        for (const prop of this.map.props || []) {
          if (prop.kind === 'crate') spawnCrate(this, prop.pos.clone());
        }
      }],
      ['Waking something up', async () => {
        // only Red Plains has anything waiting on it
        if (this.map.encounter === 'silva') this.encounter = new SilvaEncounter(this);
        if (this.map.encounter === 'shadow') this.encounter = new ShadowEncounter(this);
      }],
      ['Compiling shaders', async () => {
        this.updateCamera(0);
        this.encounter?.showForCompile(true);
        this.renderer.compile(this.scene, this.camera);
        this.encounter?.showForCompile(false);
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
    this.player.onGib = (info) => this.gore?.throwPart(info.mesh, info.vel);
    this.player.onArmourLost = (info) => { this.dropWorn(info.character, info.armour, info.dir); this._showArmour(); };
    this.player.onStrike = (a, s, v) => this.resolveStrike(a, s, v);
    this.player.onSlash = (a, s, v) => this.resolveSlash(a, s, v);
    this.registerCharacter(this.player);
    this.camYaw = this.player.yaw;

    this.rcv2 = new RCV2(this, this.player);
    this.flash = new MuzzleFlash(this.scene);
    this.cases = new CaseEjector(this.scene);
    // red plastic shotgun hulls, with their brass heads
    this.hulls = new CaseEjector(this.scene, { size: [0.020, 0.020, 0.062], color: 0xa8231a });
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
    // a cutscene camera is somewhere else, looking at you: all of you
    const firstPerson = !this.player.isRagdolling && !this.cutscene?.cam;
    for (const name of this._hiddenSelf) {
      const e = b.entries.get(name);
      // A head that has come off is nobody's first person problem any more:
      // it is out in the world and has to stay visible.
      if (!e || e.detached) continue;
      e.skin.mesh.visible = !firstPerson;
      if (e.cloth) e.cloth.mesh.visible = !firstPerson;
    }
    b.hairSelfHidden = firstPerson;
    b._applyHair();
    // a helmet or a collar would sit right in front of the camera
    for (const a of this.player.armourPieces) {
      if (a.slot === 'head' || a.slot === 'neck') a.model.visible = !firstPerson;
    }
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
    // Their pieces go with them: the materials those meshes draw with belong
    // to the body that is about to dispose of them.
    this.gore?.dropPartsOf(c);
    c.dispose();
    this.wounds?.prune();
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
      this.reloadTimer = 0;
      this._pump = null;
      this._shells = null;
      this._reloadAfterPump = false;
      this.hud?.setCarrying(null);
      this.setEquipped('fists');
    }
    this.cases?.clear();
    this.hulls?.clear();
    this.gore?.clearDebris();
    this.fire?.clear();
    for (const b of [...this.spawnedBodies]) this.removeBody(b);
    for (const c of [...this.characters]) if (c !== this.player) this.removeCharacter(c);
    this.nav.dirty = true;
  }

  washGore() {
    this.gore?.wash();
    for (const c of this.characters) c.body.washClean();
    this.wounds?.clearAll();
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
    if (id === 'citizen' || id === 'officer' || id === 'zombie') {
      if (this.characters.length - 1 >= this.quality.maxCitizens) {
        const oldest = this.characters.find((c) => c !== this.player);
        if (oldest) this.removeCharacter(oldest);
      }
      _v2.y = groundAt;
      const spawn = { officer: spawnOfficer, zombie: spawnZombie }[id] || spawnCitizen;
      const c = spawn(this, _v2, { yaw: this.camYaw + Math.PI });
      const name = { officer: 'Officer', zombie: 'Mutant' }[id] || 'Citizen';
      return { type: 'citizen', name, entity: c };
    }
    if (id === 'boulder') {
      _v2.y = Math.max(_v2.y, groundAt + 0.9);
      const b = spawnBoulder(this, _v2);
      return { type: 'body', name: 'Boulder', entity: b };
    }
    if (CARRY[id]) {
      _v2.y = Math.max(_v2.y, groundAt + 0.6);
      const b = CARRY[id].spawn(this, _v2);
      return { type: 'body', name: CARRY[id].label, entity: b };
    }
    if (ARMOUR[id]) {
      _v2.y = Math.max(_v2.y, groundAt + 0.6);
      const b = spawnArmour(this, id, _v2);
      return { type: 'body', name: ARMOUR[id].label, entity: b };
    }
    _v2.y = Math.max(_v2.y, groundAt + 0.7);
    const b = spawnCrate(this, _v2);
    return { type: 'body', name: 'Crate', entity: b };
  }

  /** Height of whatever a thing dropped here would land on. */
  _surfaceHeight(x, z) {
    let best = this.world.hasGroundAt(x, z) ? this.world.groundY : -Infinity;
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
      if (!b.userData.pickup && !b.userData.wear) continue;
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

  /**
   * Things in the world that do something when you USE them - a red RCV2 in
   * the corner of a pit, a fire burning over a pillar. The map hands some
   * over, an encounter can add more; each says where it is, how close you
   * have to be, and what happens.
   */
  allInteractables() {
    const out = this._interactScratch || (this._interactScratch = []);
    out.length = 0;
    if (this.map?.interactables) for (const it of this.map.interactables) out.push(it);
    for (const it of this.interactables) out.push(it);
    return out;
  }

  /** The nearest interactable you are close enough to and facing. */
  interactInReach() {
    const p = this.player;
    if (!p || p.state !== STATE.CONTROLLED || this.cutscene) return null;
    this.camera.getWorldDirection(_v1);
    let best = null, bestD = Infinity;
    for (const it of this.allInteractables()) {
      if (it.enabled === false) continue;
      const pos = it.position;
      const dx = pos.x - p.pos.x, dz = pos.z - p.pos.z;
      const flat = Math.hypot(dx, dz);
      const dy = pos.y - (p.pos.y - HIP_HEIGHT);
      if (flat > it.radius || dy < -1.2 || dy > 2.6) continue;
      // within a step, it counts whichever way you face; further off, look at it
      if (flat > 0.9) {
        _v2.set(dx, pos.y - this.camera.position.y, dz).normalize();
        if (_v2.dot(_v1) < 0.35) continue;
      }
      if (flat < bestD) { bestD = flat; best = it; }
    }
    return best;
  }

  /** The USE button: take what is in reach, or put down what is in hand. */
  useAction() {
    if (this.cutscene || this.travelling) return;
    if (this.carried) { this.dropCarried(); return; }
    const thing = this.interactInReach();
    if (thing) { thing.use(this); return; }
    const body = this.pickupInReach();
    if (!body) {
      // Nothing in reach, so USE takes off what is being worn instead.
      if (this.player?.armourPieces.length) { this.dropArmour(); return; }
      this.hud?.toast('Nothing to pick up');
      return;
    }
    if (body.userData.wear) this.wearItem(body);
    else this.pickUp(body);
  }

  /* ---------------------------------------------------------------- travel */

  /**
   * Leaves this map for another. The game cannot tear itself down from the
   * middle of its own frame, so it asks whoever is running it to.
   */
  travel(mapId, message = '') {
    if (this.travelling) return;
    this.travelling = true;
    this.hud?.flashDamage(0.9);
    this.hud?.toast(message || 'Travelling', 2200);
    // a beat, so the flash and the words land before the loading screen does
    setTimeout(() => this.onTravel?.(mapId, message), 380);
  }

  /* ----------------------------------------------------------------- water */

  /**
   * Pond water. Shin deep: it halves your speed, drags at anything moving
   * through it, and throws up a splash when something comes in fast.
   */
  _updateWater(dt) {
    const pools = this.map?.water;
    for (const c of this.characters) { c.speedScale = 1; c.water = null; }
    if (pools && pools.length) {
      for (const pool of pools) {
        for (const c of this.characters) {
          if (!inPool(pool, c.pos.x, c.pos.z)) continue;
          const feet = c.pos.y - HIP_HEIGHT;
          if (feet > pool.y || feet < pool.floor - 0.5) continue;
          c.water = { surface: pool.y, floor: pool.floor };
          c.speedScale = Math.min(c.speedScale, c.swimming ? 0.6 : 0.5);
          if (c.isRagdolling || c.state === STATE.DEAD) {
            /* A body in water stops sliding about, and floats: the water holds
               up a little more than it weighs, so it drifts up to the surface
               and lies there. */
            const k = Math.exp(-2.4 * dt);
            const h = this.world.substepDt;
            const lift = 9.81 * 1.12 * dt * h;
            for (const pt of c.particleList) {
              if (pt.y > pool.y + 0.1) continue;
              pt.px = pt.x - (pt.x - pt.px) * k;
              pt.pz = pt.z - (pt.z - pt.pz) * k;
              pt.py = pt.y - (pt.y - pt.py) * Math.exp(-4 * dt);
              if (pt.y < pool.y - 0.05) pt.py -= lift;
            }
          }
          const vy = c.vel.y;
          if (vy < -5 && !c._splashed) {
            c._splashed = true;
            this.fx?.splash(_v1.set(c.pos.x, pool.y, c.pos.z), -vy);
          }
          if (vy > -1) c._splashed = false;
        }
      }
    }
    this._updateBreath(dt);
  }

  /**
   * Breath. With your head under water the air runs out over fifteen seconds,
   * and after that the water does damage until you get your head up. It comes
   * back three times as fast as it went.
   */
  _updateBreath(dt) {
    for (const c of this.characters) {
      if (c.dead || c.body?.destroyed) continue;
      let under = false;
      if (c.water && !c.gone?.has('head')) {
        const head = c.rig.byName.head;
        under = head.worldPos.y + 0.16 < c.water.surface;
      }
      c.underwater = under;
      if (under) {
        c.air = Math.max(0, c.air - dt / AIR.seconds);
        if (c.air <= 0) {
          c._drownAcc = (c._drownAcc || 0) + dt * AIR.drownDps;
          if (c._drownAcc >= 5) {
            const head = c.rig.byName.head;
            c.applyDamage(c._drownAcc, { boneName: 'head', point: head.worldPos.clone(), type: 'drown',
              severity: 0 });
            c._drownAcc = 0;
            if (c === this.player) this.hud?.flashDamage(0.25);
          }
          // and it comes out of them as bubbles
          if (this.rng() < dt * 8) this.fx?.bubbles(c.rig.byName.head.worldPos, { count: 2 });
        } else if (this.rng() < dt * 1.5) {
          this.fx?.bubbles(c.rig.byName.head.worldPos, { count: 1 });
        }
      } else {
        c.air = Math.min(1, c.air + (dt * 3) / AIR.seconds);
        c._drownAcc = 0;
      }
    }
    const p = this.player;
    if (p) this.hud?.setAir(p.underwater || p.air < 0.999 ? p.air : null);
  }

  /* ---------------------------------------------------------------- armour */

  /**
   * Takes a piece of armour off the ground and puts it on. Whatever was in
   * that slot already comes off and is dropped, so wearing a medium vest over
   * a light one swaps them.
   */
  wearItem(body) {
    const p = this.player;
    if (!p) return;
    const kind = body.userData.wear;
    const spec = ARMOUR[kind];
    if (!spec) return;
    if (p.worn[spec.slot]) this.dropArmour(spec.slot);
    const model = body.mesh;
    const hp = body.userData.armourHp ?? spec.hp;
    const i = this.spawnedBodies.indexOf(body);
    if (i >= 0) this.spawnedBodies.splice(i, 1);
    if (this.rcv2?.grab?.body === body) this.rcv2.grab = null;
    this.world.removeBody(body);
    this.stats.objects = this.spawnedBodies.length;
    this.nav.dirty = true;
    body.mesh = null;                  // it belongs to the wearer now

    model.userData.bodyOffset = null;
    p.wearArmour(new Armour(model, hp, kind), this.scene);
    this._showArmour();
    this.hud?.toast('Wearing the ' + spec.label);
  }

  /** Takes a piece off - that slot's, or the last one put on - and drops it. */
  dropArmour(slot = null) {
    const p = this.player;
    const a = p?.stripArmour(slot);
    if (!a) return;
    this.dropWorn(p, a, this.camera.getWorldDirection(_v2));
    this._showArmour();
    this.hud?.toast('Took off the ' + a.label);
  }

  /**
   * Puts a piece that has come off someone back in the world as a loose item,
   * thrown a little the way `dir` points. Used for taking it off, for what
   * the dead leave behind, and for a helmet whose head has gone.
   */
  dropWorn(c, a, dir = null) {
    const boneName = a.spec.bone || 'upperTorso';
    const bone = c.rig.byName[boneName];
    _v1.copy(bone.worldPos);
    if (dir) _v1.addScaledVector(dir, 0.55);
    _v1.y = Math.max(c.pos.y - HIP_HEIGHT + 0.25, _v1.y - 0.15);
    const body = spawnArmour(this, a.kind, _v1, { quat: bone.worldQuat, reuse: { model: a.model, hp: a.hp } });
    if (dir) body.vel.set(dir.x * 1.4, 1.2, dir.z * 1.4);
    body.angVel.set((this.rng() - 0.5) * 4, (this.rng() - 0.5) * 4, (this.rng() - 0.5) * 4);
    body.wake();
    return body;
  }

  /** The armour bar: everything being worn, added together. */
  _showArmour() {
    const pieces = this.player?.armourPieces || [];
    if (!pieces.length) { this.hud?.setArmour(null); return; }
    let hp = 0, max = 0;
    for (const a of pieces) { hp += a.hp; max += a.maxHp; }
    this.hud?.setArmour(hp, max);
  }

  pickUp(body) {
    const kind = body.userData.pickup;
    const spec = CARRY[kind];
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
      // a gun remembers what is left in it, and whether one is up the spout
      ammo: body.userData.ammo ?? 0,
      chambered: (body.userData.ammo ?? 0) > 0,
    };
    this.reloadTimer = 0;
    this._pump = null;
    this._shells = null;
    this._reloadAfterPump = false;
    this.gunCooldown = 0;
    this.hud?.setCarrying(kind);
    this.setEquipped(kind);
    this.hud?.toast('Picked up the ' + spec.label);
  }

  dropCarried() {
    const c = this.carried;
    if (!c) return;
    const spec = CARRY[c.kind];
    this.carried = null;
    this.reloadTimer = 0;
    this._pump = null;
    this._shells = null;
    this._reloadAfterPump = false;
    this.player.animator.cancelAction();
    this.hud?.setCarrying(null);

    // Put it back into the world where the weapon actually is, moving the way
    // the hand was moving.
    const hand = this.player.rig.byName.handR;
    gripWorld(hand, spec.grip, _q1, _v1);
    _v2.copy(spec.center).applyQuaternion(_q1).add(_v1);
    const body = spec.spawn(this, _v2, {
      quat: _q1,
      reuse: { model: c.model, material: c.material, surface: c.surface, ammo: c.ammo },
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
    const spec = CARRY[c.kind];
    const hand = this.player.rig.byName.handR;
    gripWorld(hand, spec.grip, _q1, _v1);
    c.model.quaternion.copy(_q1);
    c.model.position.copy(_v1);
    c.model.updateMatrix();
    c.model.visible = this.equipped === c.kind;
    if (spec.gun) this._syncGunParts(c, spec);
  }

  /**
   * The moving parts of a gun: the magazine that leaves it during a reload,
   * the slide that goes back on an empty one, the bolt that gets pulled. All
   * of it is driven off where the reload animation has got to, so the hands
   * and the hardware are never out of step.
   */
  _syncGunParts(c, spec) {
    const u = c.model.userData;
    const a = this.player.animator;
    const clip = a.actionName;
    const win = clip ? spec.parts?.[clip] : null;
    const t = clip ? a.actionTime : 0;
    const inside = (w) => w && t >= w[0] && t <= w[1];
    if (u.magazine) {
      u.magazine.visible = !inside(win?.magOut);
      // an AK magazine rocks in and out rather than dropping straight
      if (u.magazine.visible && inside(win?.rock)) {
        const k = inside(win?.magOut) ? 0 : 1;
        u.magazine.rotation.x = -0.34 * k;
      } else {
        u.magazine.rotation.x = 0;
      }
    }
    if (u.pump) {
      // the forend rides back along the tube and forward again
      const w = win?.pump;
      let k = 0;
      if (w && t > w[0] && t < w[3]) {
        k = t < w[1] ? (t - w[0]) / (w[1] - w[0]) : t < w[2] ? 1 : 1 - (t - w[2]) / (w[3] - w[2]);
      }
      u.pump.position.z = Math.max(0, Math.min(1, k)) * (spec.gun.pumpTravel || 0.07);
    }
    if (u.shell) {
      const w = win?.shell;
      u.shell.visible = !!(w && t >= w[0] && t <= w[1]);
      // pushed up into the loading port and forward into the tube
      if (u.shell.visible) u.shell.position.z = -0.026 - ((t - w[0]) / (w[1] - w[0])) * 0.04;
    }
    const back = inside(win?.slide) || inside(win?.bolt);
    if (u.slide) u.slide.position.z = back ? 0.030 : 0;
    if (u.dustCover) u.dustCover.position.z = back ? 0.020 : 0;
    // and the kick of firing, which moves the same parts
    const k = this.gunKick || 0;
    if (k > 0.01 && u.slide) u.slide.position.z = Math.max(u.slide.position.z, k * 0.028);
    // the pilot light never goes out, it just will not sit still
    if (u.pilot) u.pilot.scale.setScalar(0.8 + this.rng() * 0.45);
  }

  /* ----------------------------------------------------------------- weapons */

  setEquipped(name) {
    if (CARRY[name] && this.carried?.kind !== name) name = 'fists';
    // the Fire Fist is earned, not found
    if (name === 'firefist' && !isUnlocked('firefist')) name = 'fists';
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
    } else if (this.equipped === 'firefist') {
      // the same jab, with the fist on fire
      this.player.punch(true);
    } else if (GUNS[this.equipped]) {
      this.fireGun();
    } else if (MELEE[this.equipped]) {
      // Every carried blade swings; the guns and the RCV2 shoot.
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

  /* ------------------------------------------------------------- fire fist */

  /**
   * FIREBALL: with the Fire Fist on, a jab thrown at nothing lets go of what
   * is burning in the fist. The ball leaves from the hand at the moment the
   * jab is at full reach, and goes where you are looking.
   */
  fireballAction() {
    if (this.equipped !== 'firefist') return;
    const p = this.player;
    if (!p || p.dead || p.state !== STATE.CONTROLLED) return;
    if (this.fireFistCooldown > 0 || this._pendingFireball) return;
    if (!p.punch(true)) return;
    this.fireFistCooldown = 0.55;
    this._pendingFireball = { side: p.punchSide, t: 0.11 };
  }

  _updateFireFist(dt) {
    this.fireFistCooldown = Math.max(0, this.fireFistCooldown - dt);
    const p = this.player;
    if (!p) return;
    const pf = this._pendingFireball;
    if (pf) {
      pf.t -= dt;
      if (pf.t <= 0) {
        this._pendingFireball = null;
        // knocked down mid-throw: it goes nowhere
        if (p.state === STATE.CONTROLLED && !p.dead && this.equipped === 'firefist') this._throwFireball(pf.side);
      }
    }
    if (this.equipped !== 'firefist' || p.dead || !this.fx) return;
    /* Both fists alight while it is on: small, tight flames off the
       knuckles. They are a hand's width from the camera, so anything bigger
       or longer lived drifts across half the screen. */
    for (const S of ['R', 'L']) {
      if (p.gone.has('hand' + S)) continue;
      const hand = p.rig.byName['hand' + S];
      boneBoxCenter(hand, _v1).lerp(hand.worldEnd, 0.45);
      this.fx.fire(_v1, { count: 1, spread: 0.018, up: 0.26, size: 0.055, life: 0.2 });
      if (this.rng() < 0.3) this.fx.fire(_v1, { count: 1, spread: 0.03, up: 0.38, size: 0.085, life: 0.26 });
      if (this.rng() < dt * 1.2) this.fx.embers(_v1, { count: 1, spread: 0.02, up: 0.3, life: 0.45 });
    }
  }

  _throwFireball(side) {
    const p = this.player;
    this.camera.getWorldDirection(_gunAim);
    this._aimPoint(this.camera.position, _gunAim, 140, _aimAt);
    boneBoxCenter(p.rig.byName['hand' + side], _gunPos);
    _gunTmp.copy(_aimAt).sub(_gunPos);
    if (_gunTmp.lengthSq() < 1e-6) _gunTmp.copy(_gunAim);
    _gunTmp.normalize();
    this.fire.shoot({
      from: _gunPos, dir: _gunTmp, speed: 24, radius: 0.18, damage: 22, splash: 1.6,
      ignite: 4, owner: p, hitsBoss: true, scale: 0.85, life: 3, color: 0xff7a24,
    });
    this.fx?.fire(_gunPos, { count: 6, spread: 0.05, size: 0.18, up: 0.3, life: 0.22,
      vel: _v2.copy(_gunTmp).multiplyScalar(4) });
    this.shake = Math.min(0.6, this.shake + 0.1);
    p.combatReady = true;
    p.combatTimer = 3.5;
    this.alertNearby(1.8);
  }

  /* ------------------------------------------------------------------ guns */

  /**
   * One round. The shot leaves the muzzle where the muzzle actually is, and
   * goes where the crosshair is looking - the same rule the fists and the
   * blades follow, which is that the weapon's own geometry decides.
   */
  fireGun() {
    const c = this.carried;
    if (!c) return false;
    const spec = GUNS[c.kind];
    if (!spec) return false;
    // a shotgun part way through loading stops after the shell in hand
    if (this.reloadTimer > 0 && this._shells) this._shells.stop = true;
    if (this.reloadTimer > 0 || this.gunCooldown > 0 || this._pump) return false;
    if (this.player.state !== STATE.CONTROLLED || this.player.dead) return false;
    if (this.player.armBroken('R')) return false;
    if (c.ammo <= 0) {
      // the dead click of an empty chamber
      this.gunCooldown = 0.28;
      this.hud?.toast(spec.flame ? 'Out of fuel - press RELOAD' : 'Empty - press RELOAD');
      return false;
    }
    c.ammo--;
    c.chambered = c.ammo > 0;
    this.gunCooldown = spec.interval;

    if (spec.flame) { this._sprayFlame(c, spec); return true; }

    const hand = this.player.rig.byName.handR;
    gripWorld(hand, spec.grip, _gunQuat, _gunPos);
    const muzzle = _gunTmp.copy(spec.gun.muzzle).applyQuaternion(_gunQuat).add(_gunPos);
    /* The round leaves the muzzle, but it goes where you are AIMING: find
       what the crosshair is on first, then shoot from the barrel at that.
       Firing parallel to the sight line instead would put every shot a hand's
       width low, because that is where the gun is held. */
    this.camera.getWorldDirection(_gunAim);
    this._aimPoint(this.camera.position, _gunAim, spec.range, _aimAt);
    _gunAim.copy(_aimAt).sub(muzzle);
    if (_gunAim.lengthSq() < 1e-8) return false;
    _gunAim.normalize();
    if (spec.pellets) {
      /* A cloud of pellets round the point of aim, each its own round, so
         the closer the target the more of them land on it. */
      for (let i = 0; i < spec.pellets; i++) {
        const a = this.rng() * Math.PI * 2, r = Math.sqrt(this.rng()) * spec.spread;
        _pelletSide.set(-_gunAim.z, 0, _gunAim.x);
        if (_pelletSide.lengthSq() < 1e-6) _pelletSide.set(1, 0, 0);
        _pelletSide.normalize();
        _pelletUp.crossVectors(_pelletSide, _gunAim).normalize();
        _pelletDir.copy(_gunAim).addScaledVector(_pelletSide, Math.cos(a) * r)
          .addScaledVector(_pelletUp, Math.sin(a) * r).normalize();
        this._traceShot(muzzle, _pelletDir, spec);
      }
    } else {
      this._traceShot(muzzle, _gunAim, spec);
    }

    this.flash.fire(muzzle, _gunQuat, spec.flash);
    if (spec.pump) {
      // the empty hull stays in the chamber until the forend is racked
      c.spent = true;
      if (c.ammo > 0) this._pump = { wait: spec.pumpDelay, t: -1, ejected: false };
    } else {
      // the case comes out of the port, up and to the right of the gun
      const at = _gunTmp.copy(spec.gun.ejectAt).applyQuaternion(_gunQuat).add(_gunPos);
      this.cases.eject(at, _gunAim.set(0.92, 0.36, 0.14).applyQuaternion(_gunQuat).normalize());
    }

    // recoil: some of it moves your aim for good, the rest settles back
    const r = spec.recoil;
    const spread = (this.rng() - 0.5) * 2;
    this.camPitch = clamp(this.camPitch + r.pitch * 0.38, -1.42, 1.42);
    this.recoilPitch += r.pitch * 0.62;
    this.recoilYaw += r.yaw * spread;
    this.gunKick = 1;
    this.player.kick(r.arm);
    this.shake = Math.min(1, this.shake + r.shake);
    this.player.squareTimer = 0.8;
    this.player.combatReady = true;
    this.player.combatTimer = 3.5;
    this.alertNearby(2.4);
    this.hud?.setAmmo(c.ammo, spec.capacity);
    return true;
  }

  /**
   * One puff of the flamethrower's stream. It leaves the nozzle where the
   * nozzle is and heads for whatever the crosshair is on, like a round does,
   * but it is gas: it slows, lifts and spreads on the way, and the fire
   * system decides what it reaches.
   */
  _sprayFlame(c, spec) {
    const p = this.player;
    gripWorld(p.rig.byName.handR, spec.grip, _gunQuat, _gunPos);
    const nozzle = _gunTmp.copy(spec.gun.muzzle).applyQuaternion(_gunQuat).add(_gunPos);
    this.camera.getWorldDirection(_gunAim);
    this._aimPoint(this.camera.position, _gunAim, spec.range, _aimAt);
    _v2.copy(_aimAt).sub(nozzle);
    if (_v2.lengthSq() < 0.04) _v2.copy(_gunAim);
    _v2.normalize();
    // gas leaves a hair upward of the line, and the rise does the rest
    this.fire.spray({
      from: nozzle, dir: _v2, owner: p, damage: spec.damage, hitsBoss: true,
      carry: p.vel,
    });
    // at the nozzle itself: the blue root of the flame and a hot tongue
    if (this.fx) {
      this.fx.fire(nozzle, { count: 1, spread: 0.01, up: 0.1, size: 0.07, life: 0.08,
        vel: _v3.copy(_v2).multiplyScalar(6) });
    }
    if (this.rng() < 0.25) this.fx?.light(_v4.copy(nozzle).addScaledVector(_v2, 1.2),
      { color: 0xff7a30, intensity: 14, life: 0.12, distance: 7 });

    const r = spec.recoil;
    this.recoilPitch += r.pitch * (0.5 + this.rng() * 0.5);
    this.recoilYaw += r.yaw * (this.rng() - 0.5) * 2;
    this.shake = Math.min(0.25, this.shake + r.shake * 0.3);
    p.kick(r.arm);
    p.squareTimer = 0.8;
    p.combatReady = true;
    p.combatTimer = 3.5;
    this.alertNearby(2.2);
    this.hud?.setAmmo(c.ammo, spec.capacity);
  }

  /**
   * What the crosshair is on: the nearest thing down the sight line, or a
   * point out at the weapon's range if there is nothing there at all.
   */
  _aimPoint(origin, dir, range, out) {
    let best = range;
    const hit = this.world.raycastBodies(origin, dir, range);
    if (hit) best = hit.distance;
    const wall = this.world.raycastStatic(origin, dir, best);
    if (wall) best = wall.distance;
    const boss = this.encounter?.boss?.raycast(origin, dir, best);
    if (boss) best = boss.distance;
    for (const c of this.characters) {
      if (c === this.player || c.body.destroyed) continue;
      _v1.copy(c.center).sub(origin);
      const along = _v1.dot(dir);
      if (along < 0 || along > best + 2) continue;
      if (_v1.addScaledVector(dir, -along).lengthSq() > 2.6) continue;
      for (const bone of c.rig.bones) {
        if (bone.def.finger) continue;
        const t = rayBone(origin, dir, bone);
        if (t != null && t > 0 && t < best) best = t;
      }
    }
    // and the ground, so shooting at your own feet lands where you pointed
    if (dir.y < -1e-4 && this.world.hasGround) {
      const t = (this.world.groundY - origin.y) / dir.y;
      if (t > 0 && t < best &&
          this.world.hasGroundAt(origin.x + dir.x * t, origin.z + dir.z * t)) best = t;
    }
    return out.copy(dir).multiplyScalar(best).add(origin);
  }

  /**
   * Where the round goes, and what it does when it gets there. `shooter` is
   * whoever pulled the trigger - the player unless an officer did - and is
   * the one person the round can never hit.
   */
  _traceShot(origin, dir, spec, shooter = this.player, mult = 1) {
    let best = null;
    const bodyHit = this.world.raycastBodies(origin, dir, spec.range);
    if (bodyHit) best = { type: 'body', body: bodyHit.body, distance: bodyHit.distance };
    // a wall stops a round; it used to go straight through the map
    const wall = this.world.raycastStatic(origin, dir, best ? best.distance : spec.range);
    if (wall) best = { type: 'wall', distance: wall.distance };
    const boss = this.encounter?.boss;
    const bossHit = boss?.raycast(origin, dir, best ? best.distance : spec.range);
    if (bossHit) best = { type: 'boss', part: bossHit.part, distance: bossHit.distance };

    for (const c of this.characters) {
      if (c === shooter || c.body.destroyed) continue;
      _v1.copy(c.center).sub(origin);
      const along = _v1.dot(dir);
      if (along < -1.5 || along > spec.range + 2) continue;
      if (_v1.addScaledVector(dir, -along).lengthSq() > 2.6) continue;
      for (const bone of c.rig.bones) {
        if (bone.def.finger) continue;
        const t = rayBone(origin, dir, bone);
        if (t == null || t < 0 || t > spec.range) continue;
        if (!best || t < best.distance) best = { type: 'character', character: c, bone, distance: t };
      }
    }
    if (!best) return null;
    const point = _v1.copy(dir).multiplyScalar(best.distance).add(origin).clone();

    if (best.type === 'wall') {
      this.fx?.sparks(point, _v2.copy(dir).negate(), { count: 5, speed: 3.5, life: 0.3 });
      this.fx?.smoke(point, { count: 1, size: 0.22, up: 0.25, life: 0.8, dark: 0.1 });
      return best;
    }
    if (best.type === 'boss') {
      boss.takeDamage(spec.damage * mult * (best.part.mult || 1), point, 'bullet');
      return best;
    }

    if (best.type === 'body') {
      best.body.wake();
      _v4.copy(dir).multiplyScalar(spec.push * 0.5);
      best.body.applyImpulse(_v4, point);
      return best;
    }

    /* A bullet is a small thing moving very fast: it does a lot of damage to
       one part and shoves the person about far less than a sledgehammer does.
       The head is the head. */
    const bone = best.bone;
    const head = bone.name === 'head' || bone.name === 'neck';
    const dmg = spec.damage * mult * (head ? 2.6 : 1) * (bone.def.finger ? 0.3 : 1);
    _v4.copy(dir).multiplyScalar(spec.push * mult);
    _v4.y += spec.push * mult * 0.06;
    best.character.applyImpact(point, _v4, {
      boneName: bone.name, damage: dmg, type: 'impact', attacker: shooter,
      severity: head ? 1 : 0.85, crush: 0.35 * mult, wound: 'hole',
    });
    best.character.ai?.onHurt({ amount: dmg * 1.6, attacker: shooter });
    this.gore?.burst(point, _v2.copy(dir).negate(), head ? 26 : 14,
      { speed: 3.4, spread: 0.8, size: 0.028 });
    this.gore?.impactSplatter(point, _v2.copy(dir).negate(), 14);
    return best;
  }

  /** RELOAD: a fresh magazine, and a longer one if the gun ran dry. */
  reloadAction() {
    const c = this.carried;
    const spec = c ? GUNS[c.kind] : null;
    if (!spec) { this.hud?.toast('Nothing to reload'); return; }
    if (this.reloadTimer > 0) return;
    if (c.ammo >= spec.capacity) { this.hud?.toast('Already full'); return; }
    if (this.player.armBroken('L')) { this.hud?.toast('Your left arm is broken'); return; }
    /* The magazine is in by the time reloadTimer runs out, but the animation
       still has a tail on it. Without this, a reload asked for during that tail
       is swallowed: the arms are busy with work that is already finished. */
    if (this.player.reloading) this.player.animator.cancelAction();
    if (this._pump) { this._reloadAfterPump = true; return; }   // after the rack
    if (spec.shells) { this._loadShell(true); return; }
    /* An empty gun needs the action worked as well as a magazine, which is a
       different job and a slower one. */
    const empty = !c.chambered;
    const clip = empty ? spec.reload.empty : spec.reload.normal;
    if (!this.player.playReload(clip)) return;
    this.reloadTimer = this.player.animator.action.clip.duration;
    this._reloadInto = spec.capacity;
    this.hud?.toast(empty ? 'Reloading (empty)' : 'Reloading');
  }

  /**
   * One shell into a shotgun's tube. The reload carries on a shell at a time
   * until it is full or the trigger is pulled; a gun that ran dry is racked
   * at the end to chamber one.
   */
  _loadShell(first = false) {
    const c = this.carried, spec = c && GUNS[c.kind];
    if (!spec) { this._shells = null; return false; }
    if (first) this._shells = { stop: false, rack: c.ammo === 0 || !!c.spent };
    if (!this.player.playReload(spec.reload.normal)) { this._shells = null; return false; }
    this.reloadTimer = this.player.animator.action.clip.duration;
    this._reloadInto = Math.min(spec.capacity, c.ammo + 1);
    if (first) this.hud?.toast('Loading shells');
    return true;
  }

  /** Racks a pump gun: forend back (the hull flies out), forend forward. */
  _rack() {
    const spec = this.carried && GUNS[this.carried.kind];
    if (!spec?.pump) return false;
    if (this.player.animator.actionActive) this.player.animator.cancelAction();
    if (!this.player.playReload(spec.pump)) return false;
    this._pump = { wait: 0, t: 0, ejected: false, dur: this.player.animator.action.clip.duration };
    return true;
  }

  _updatePump(dt) {
    const p = this._pump;
    if (!p) return;
    const c = this.carried, spec = c && GUNS[c.kind];
    if (!spec?.pump || this.player.state !== STATE.CONTROLLED) { this._pump = null; return; }
    if (p.t < 0) {
      p.wait -= dt;
      if (p.wait > 0) return;
      if (!this._rack()) { this._pump = null; }
      return;
    }
    p.t += dt;
    if (!p.ejected && p.t >= 0.16) {
      p.ejected = true;
      if (c.spent) {
        // the spent hull, out of the port on the right
        gripWorld(this.player.rig.byName.handR, spec.grip, _gunQuat, _gunPos);
        const at = _gunTmp.copy(spec.gun.ejectAt).applyQuaternion(_gunQuat).add(_gunPos);
        this.hulls.eject(at, _gunAim.set(0.95, 0.30, 0.10).applyQuaternion(_gunQuat).normalize());
      }
      c.spent = false;
    }
    if (p.t >= (p.dur || 0.55)) {
      this._pump = null;
      c.chambered = c.ammo > 0;
      if (this._reloadAfterPump) { this._reloadAfterPump = false; this.reloadAction(); }
    }
  }

  _updateGuns(dt, input) {
    this._updatePump(dt);
    this.gunCooldown = Math.max(0, this.gunCooldown - dt);
    this.gunKick = Math.max(0, this.gunKick - dt * 9);
    const rec = GUNS[this.equipped]?.recoil;
    const back = rec ? rec.recover : 9;
    this.recoilPitch = damp(this.recoilPitch, 0, back, dt);
    this.recoilYaw = damp(this.recoilYaw, 0, back, dt);
    this.flash?.update(dt);
    this.cases?.update(dt, this.world);
    this.hulls?.update(dt, this.world);

    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0 && this.carried) {
        const spec = GUNS[this.carried.kind];
        this.carried.ammo = this._reloadInto;
        this.hud?.setAmmo(this.carried.ammo, spec?.capacity || 0);
        if (spec?.shells && this._shells) {
          // another shell, unless it is full or the trigger was pulled
          const sh = this._shells;
          if (this.carried.ammo < spec.capacity && !sh.stop && this._loadShell()) return;
          this._shells = null;
          if (sh.rack) this._rack();
          else this.carried.chambered = true;
        } else {
          this.carried.chambered = true;
        }
      }
      return;
    }
    // Held down, a full automatic keeps going; a pistol needs a press a shot.
    const spec = GUNS[this.equipped];
    if (spec?.auto && input?.down?.primary && this.player.state === STATE.CONTROLLED) {
      this.fireGun();
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
        const part = BREAK_NAME[boneName];
        // "ribs are", "arm is"
        this.hud?.toast(part ? 'Your ' + part + (/s$/.test(part) ? ' are' : ' is') + ' broken' : 'Broken bone');
        // you cannot hold a sledgehammer with a broken arm
        if (this.carried && character.armBroken('R')) this.dropCarried();
      }
    } else if (kind === 'gib') {
      /* A part coming off is the biggest thing that happens to a body, so it
         gets the biggest mark: a burst out of the wound, a spray the way the
         hit was going, and blood over whatever is left of the stump. */
      const at = point || character.center;
      const dir = info.dir || _v2.set(0, 1, 0);
      this.gore?.burst(at, dir, 30, { speed: 6.5, spread: 1.5, size: 0.042 });
      this.gore?.burst(at, _v3.copy(dir).negate(), 14, { speed: 3.2, spread: 1.6, size: 0.034 });
      const stump = character.rig.byName[boneName]?.parent;
      if (stump && !character.gone.has(stump.name)) {
        character.body.paintHit(stump.name, at, { kind: 'impact', severity: 1, allowTear: true });
      }
      /* You feel one of these if it happens near you. A citizen coming apart
         on the far side of the map is not the camera's business. */
      const away = this.camera.position.distanceTo(at);
      this.shake = Math.min(1.4, this.shake + 0.55 * clamp01(1 - away / 9));
      if (character === this.player) {
        this.hud?.toast(BREAK_NAME[boneName]
          ? 'Your ' + BREAK_NAME[boneName] + ' came off' : 'You lost a limb');
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
    /* The police see it. Whoever hurts somebody where an officer can see it
       - or hurts an officer - is going to be shot at. */
    const atk = info.attacker;
    if (atk && atk === this.player && info.character !== atk) {
      for (const o of this.characters) if (o.ai?.isOfficer) o.ai.witness(info.character, atk);
    }
    /* The hits that go deeper than paint leave a wound you can see the shape
       of. Only what actually got through: a round the vest stopped does not
       open anybody up. */
    if (info.wound && info.point && info.boneName && (info.amount > 0) && this.gore?.enabled) {
      this.wounds?.add(info.character, info.boneName, info.point, info.wound, {
        severity: info.severity, dir: info.force ? _v1.copy(info.force).normalize() : null,
      });
    }
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
    /* The cutscene throws you into a wall at twenty metres a second. It
       decides for itself what that costs you; the physics does not get a
       say, or the fight would start with you dead. */
    if (this.cutscene && info.character === this.player) return;
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
    gripWorld(hand, spec.grip, _q1, _v1);

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
        // a blade always opens the skin; a hammer has to land properly to
        wound: spec.wound === 'split' && sev < 0.55 ? null : spec.wound,
      });
      if (target.ai) target.ai.onHurt({ amount: dmg * 1.4, attacker });
      this.carried.painter?.(hitPoint, Math.max(0.4, sev), { x: _v3.x, y: _v3.y, z: _v3.z });
      if (!this.carried.surface) this.carried.surface = this.carried.bodyRef?.userData.paintSurface || null;
      this.shake = Math.min(0.9, this.shake + spec.shake);
    }

    // and on Silva, by the same rule: only where the steel actually went
    const boss = this.encounter?.boss;
    if (boss && !attacker.struck.has('boss')) {
      for (let i = 0; i < samples.length; i++) {
        const part = boss.hitTest(samples[i], 0.02);
        if (!part) continue;
        attacker.struck.add('boss');
        const dmg = clamp((speed - 1.0) * spec.dmg.mul, spec.dmg.min, spec.dmg.max);
        boss.takeDamage(dmg * (part.mult || 1), samples[i], spec.type);
        this.shake = Math.min(0.9, this.shake + spec.shake);
        break;
      }
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
    // a jab thrown with the Fire Fist sets alight whatever it lands on
    const fiery = attacker === this.player && this.equipped === 'firefist';

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
      if (fiery && !target.body.destroyed) {
        target.applyDamage(6, { boneName: hitBone.name, point: hitPoint.clone(), type: 'burn',
          attacker, severity: 0.55, wound: 'burn' });
        this.fire?.ignite(target, 4, attacker);
        this.fx?.fire(hitPoint, { count: 8, spread: 0.08, size: 0.24, up: 0.9, life: 0.4 });
      }
      if (target.ai) target.ai.onHurt({ amount: dmg, attacker });
      if (attacker === this.player) this.shake = Math.min(0.7, this.shake + 0.18);
    }

    const boss = attacker === this.player ? this.encounter?.boss : null;
    if (boss && !attacker.struck.has('boss')) {
      for (let i = 0; i < samples.length; i++) {
        const part = boss.hitTest(samples[i], 0.03);
        if (!part) continue;
        attacker.struck.add('boss');
        const dmg = clamp((speed - 0.9) * 3.0, 1.5, 24) * (fiery ? 1.6 : 1);
        boss.takeDamage(dmg * (part.mult || 1), samples[i], fiery ? 'fire' : 'blunt');
        if (fiery) this.fx?.fire(samples[i], { count: 8, spread: 0.08, size: 0.24, up: 0.9, life: 0.4 });
        this.shake = Math.min(0.7, this.shake + 0.18);
        break;
      }
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
    this._adaptPerformance(dt);
    this.navBudget = 4;            // path searches allowed this frame, between everyone
    this.time += dt;
    dt = Math.min(dt, 1 / 24);

    this._readInput(dt, input);

    // --- characters think and pose ---
    for (let i = 0; i < this.characters.length; i++) {
      const c = this.characters[i];
      if (c.ai) c.ai.update(dt);
      c.update(dt);
    }

    // --- whatever the map has waiting (Silva), before physics: a cutscene
    // carries the player's body, and the step has to start from there ---
    this.encounter?.update(dt);

    // --- physics ---
    this._updateWater(dt);
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
    this._updateGuns(dt, input);
    this._syncCarried();
    // what the officers are holding, wearing and firing follows them too
    for (let i = 0; i < this.characters.length; i++) this.characters[i].ai?.lateUpdate?.(dt);

    // --- fire: fireballs in the air, people alight, the Fire Fist ---
    this.fire?.update(dt);
    this._updateFireFist(dt);

    // --- gore ---
    if (this.gore) {
      this.gore.update(dt, this.characters);
      for (const c of this.characters) this.gore.bleedTick(c, dt);
    }

    // --- the map's own moving parts, and whatever it has started ---
    this.map?.tick?.(dt, this);
    this.fx?.update(dt, this.camera, this.renderer.domElement.height);

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

    /* A cutscene has the controls. Looking about is thrown away, nothing
       moves you, and the only thing a button does is skip it. */
    if (this.cutscene) {
      input.consumeLook();
      p.moveInput.set(0, 0, 0);
      p.wantRun = false;
      if (input.pressed.skip || input.pressed.jump) this.cutscene.skip?.();
      return;
    }

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
    // in deep water, JUMP held swims up and CROUCH held dives
    p.swimUp = !!input.down?.jump;
    p.swimDown = !!input.down?.crouch || (p.swimming && p.crouchWant);
    if (input.pressed.primary) this.primaryAction();
    if (input.pressed.reload) this.reloadAction();
    if (input.pressed.spawn) this.spawnAction();
    if (input.pressed.delete) this.deleteAction();
    if (input.pressed.use) this.useAction();
    if (input.pressed.fireball) this.fireballAction();
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

    if (this.cutscene?.cam) {
      // the cutscene says where the camera is and what it is looking at
      const c = this.cutscene.cam;
      this.camPos.copy(c.pos);
      _m4.lookAt(c.pos, c.look, UP);
      this.camQuat.setFromRotationMatrix(_m4);
    } else if (p.state === STATE.CONTROLLED && !p.dead) {
      this.camPos.copy(_v1);
      // Recoil rides on top of where you are looking, and settles back out.
      _e.set(clamp(this.camPitch + this.recoilPitch, -1.5, 1.5),
        this.camYaw + this.recoilYaw, 0, 'YXZ');
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
    // under the water, everything goes blue-green and close
    let under = false;
    const cp = this.camera.position;
    for (const pool of this.map?.water || []) {
      if (cp.y < pool.y && cp.y > pool.floor - 0.5 && inPool(pool, cp.x, cp.z)) { under = true; break; }
    }
    this.hud?.setUnderwater(under);
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
    this.hud.setBurning?.(this.fire ? this.fire.playerBurn() : 0);
    const gun = GUNS[this.equipped];
    if (gun && this.carried) {
      this.hud.setAmmo(this.carried.ammo, gun.capacity, this.reloadTimer > 0);
    } else {
      this.hud.setAmmo(null);
    }
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
      const reach = this.pickupInReach();
      const thing = this.carried ? null : this.interactInReach();
      /* USE says what it would actually do: put down what is in hand, touch
         whatever strange thing is in front of you, take off what is being
         worn, wear what is in reach, or pick it up. */
      let label = 'USE';
      if (this.carried) label = 'DROP';
      else if (thing) label = thing.label || 'USE';
      else if (reach?.userData.wear) label = 'WEAR';
      else if (!reach && this.player?.armourPieces.length) label = 'TAKE OFF';
      this.hud.setUseAvailable(
        !this.cutscene && (!!this.carried || !!thing || !!reach || !!this.player?.armourPieces.length), label);
      if (thing && thing !== this._promptedThing && thing.prompt) this.hud.toast(thing.prompt, 1800);
      this._promptedThing = thing;
      this._showArmour();
    }
  }

  render() {
    this._frameN++;
    const sm = this.renderer.shadowMap;
    if (sm.enabled) sm.needsUpdate = !this._lowPower || (this._frameN & 1) === 0;
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Keeps the frame rate up on a device that cannot hold it: resolution
   * comes down a step at a time while frames run long, then the shadows go
   * to every other frame; both come back once there is headroom.
   */
  _adaptPerformance(dt) {
    if (!(dt > 0) || dt > 0.5) return;
    this._frameAvg += (dt - this._frameAvg) * 0.05;
    if (this._frameAvg > 1 / 45) { this._slowFor += dt; this._fastFor = 0; }
    else if (this._frameAvg < 1 / 57) { this._fastFor += dt; this._slowFor = 0; }
    else { this._slowFor = 0; this._fastFor = 0; }
    const min = Math.max(0.6, this.basePixelRatio * 0.55);
    if (this._slowFor > 1.5) {
      this._slowFor = 0;
      if (this.pixelRatio > min + 0.01) {
        this.pixelRatio = Math.max(min, this.pixelRatio * 0.85);
        this.renderer.setPixelRatio(this.pixelRatio);
      } else {
        this._lowPower = true;
      }
    } else if (this._fastFor > 5) {
      this._fastFor = 0;
      if (this._lowPower) this._lowPower = false;
      else if (this.pixelRatio < this.basePixelRatio - 0.01) {
        this.pixelRatio = Math.min(this.basePixelRatio, this.pixelRatio * 1.12);
        this.renderer.setPixelRatio(this.pixelRatio);
      }
    }
  }

  respawnPlayer() {
    const p = this.player;
    // Bringing the player back to life is what clears the death screen. It
    // covers the whole HUD and swallows every touch, so leaving it to the
    // caller means one missed call silently kills all input.
    this.hud?.hideDeath();
    p.heal();
    p.body.washClean();
    this.wounds?.clear(p);
    for (const c of this.characters) if (c.ai?.isOfficer) c.ai.standDown();
    this.hud?.setBlindness(0);
    this.fire?.extinguish(p);
    // in the middle of a fight you come back somewhere out of the way
    const fight = this.encounter?.active;
    const sp = fight ? this.encounter.respawnPoint : this.map.spawnPoint;
    const yaw = fight ? this.encounter.respawnYaw : this.map.spawnYaw;
    p.teleport(sp.x, sp.z, yaw);
    this.camYaw = yaw;
    this.camPitch = 0;
    this.shake = 0;
    this.encounter?.onRespawn();
  }

  setFov(fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }

  dispose() {
    this.running = false;
    window.removeEventListener('resize', this._onResize);
    this.encounter?.dispose();
    this.encounter = null;
    this.fire?.dispose();
    for (const c of [...this.characters]) { c.dispose(); }
    this.characters.length = 0;
    for (const b of [...this.spawnedBodies]) disposeBody(this, b);
    this.spawnedBodies.length = 0;
    this.rcv2?.dispose();
    this.flash?.dispose();
    this.cases?.dispose();
    this.hulls?.dispose();
    this.gore?.dispose();
    this.fx?.dispose();
    this.map?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

