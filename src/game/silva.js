/* =============================================================================
   Silva.

   What was burning over the pillar on Red Plains: the top half of a man, with
   no legs of his own, carried on four legs that are not a man's. His skin is
   charred through to something glowing, his mouth opens further than a mouth
   should, and there is a fire in his chest.

   He is not a Character. Nothing about him is ragdoll physics: the upper body
   is posed by springs chasing target angles that each state sets, and the
   legs are planted by two-bone IK and step when they fall too far behind the
   body, two at a time on the diagonals, the way spiders walk.

   Three attacks, each with a tell long enough to react to:
     Fireball Burst  the head goes back and the jaw drops, then three
                     fireballs, one after another, at where you are
     Jump            he crouches, a ring marks where you are standing, and he
                     comes down on it
     Chest Beam      the fire in his chest gathers, his aim locks, and a beam
                     sweeps slowly after you
   ========================================================================== */
import {
  Group, Mesh, BoxGeometry, SphereGeometry, CylinderGeometry, ConeGeometry,
  MeshLambertMaterial, MeshBasicMaterial, AdditiveBlending, Vector3,
  RingGeometry, DoubleSide, PointLight,
} from 'three';
import { boneBoxCenter } from './skeleton.js';
import { softGlowMaterial } from './fx.js';
import { makeRng, clamp, clamp01, damp, lerp } from '../core/util.js';

const Y = new Vector3(0, 1, 0);
const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3(), _v4 = new Vector3();
const _d = new Vector3(), _dir = new Vector3(), _bend = new Vector3(), _seg = new Vector3();

export const SILVA = {
  hp: 2500,
  /** standing height of the body he walks on */
  rideHeight: 1.18,
  femur: 1.35,
  tibia: 1.55,
  walkSpeed: 3.3,
  turnRate: 3.2,
};

/* -------------------------------------------------------------------------- */
/*                                 the model                                  */
/* -------------------------------------------------------------------------- */

function buildModel() {
  const mats = {
    skin: new MeshLambertMaterial({ color: 0x3e1610, emissive: 0x240602 }),
    dark: new MeshLambertMaterial({ color: 0x240a08, emissive: 0x120200 }),
    chitin: new MeshLambertMaterial({ color: 0x2c0e0a, emissive: 0x140300 }),
    bone: new MeshLambertMaterial({ color: 0x8c7a62, emissive: 0x1a0c04 }),
    crack: new MeshBasicMaterial({ color: 0xff5a14 }),
    eye: new MeshBasicMaterial({ color: 0xffd040 }),
    throat: new MeshBasicMaterial({ color: 0xff3a08 }),
    core: new MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.95,
      blending: AdditiveBlending, depthWrite: false }),
    coreGlow: softGlowMaterial(0xff5a14, 0.7, 1.8),
  };
  const geos = [];
  const box = (parent, w, h, d, x, y, z, mat, rx = 0, ry = 0, rz = 0) => {
    const g = new BoxGeometry(w, h, d);
    geos.push(g);
    const m = new Mesh(g, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const ball = (parent, r, sx, sy, sz, x, y, z, mat) => {
    const g = new SphereGeometry(r, 14, 10);
    geos.push(g);
    const m = new Mesh(g, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  /** a glowing seam across a surface */
  const seam = (parent, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) =>
    box(parent, w, h, d, x, y, z, mats.crack, rx, ry, rz);

  const root = new Group();           // on the ground, turned to face
  const hub = new Group();            // the body he rides on
  root.add(hub);

  /* -------------------------------- the hub ------------------------------- */
  ball(hub, 1, 0.58, 0.40, 0.66, 0, 0, 0, mats.chitin);
  const abdomen = ball(hub, 1, 0.52, 0.44, 0.70, 0, 0.06, 0.62, mats.chitin);
  seam(hub, 0.04, 0.02, 0.9, 0.18, 0.31, 0.25, 0.22, 0, 0.3);
  seam(hub, 0.04, 0.02, 0.8, -0.2, 0.33, 0.35, 0.18, 0, -0.25);
  seam(hub, 0.5, 0.02, 0.04, 0, 0.36, 0.7, 0, 0.3, 0);
  // the joints the legs come out of
  for (const [x, z] of [[-0.42, -0.32], [0.42, -0.32], [-0.42, 0.36], [0.42, 0.36]]) {
    ball(hub, 0.16, 1, 1, 1, x, 0.02, z, mats.dark);
  }

  /* -------------------------------- the man ------------------------------- */
  const waist = new Group();
  waist.position.set(0, 0.28, -0.22);
  hub.add(waist);
  box(waist, 0.46, 0.40, 0.33, 0, 0.18, 0, mats.skin);
  seam(waist, 0.3, 0.02, 0.02, 0, 0.22, -0.17, 0, 0, 0.2);

  const chest = new Group();
  chest.position.set(0, 0.38, 0);
  waist.add(chest);
  box(chest, 0.64, 0.52, 0.42, 0, 0.26, 0, mats.skin);
  box(chest, 0.7, 0.14, 0.44, 0, 0.47, 0, mats.dark);          // the shoulders' ridge
  // the cracked plate over the fire in his chest
  seam(chest, 0.02, 0.36, 0.02, -0.1, 0.27, -0.212, 0, 0, 0.35);
  seam(chest, 0.02, 0.3, 0.02, 0.12, 0.25, -0.212, 0, 0, -0.4);
  seam(chest, 0.28, 0.02, 0.02, 0, 0.12, -0.212, 0, 0, 0.1);
  seam(chest, 0.02, 0.24, 0.02, 0.24, 0.32, -0.212, 0, 0, 0.6);
  const core = ball(chest, 0.1, 1, 1, 1, 0, 0.26, -0.2, mats.core);
  const coreGlow = ball(chest, 0.2, 1, 1, 1, 0, 0.26, -0.2, mats.coreGlow);
  core.castShadow = false; coreGlow.castShadow = false;

  const neck = new Group();
  neck.position.set(0, 0.54, -0.02);
  chest.add(neck);
  box(neck, 0.18, 0.16, 0.18, 0, 0.06, 0, mats.skin);

  const head = new Group();
  head.position.set(0, 0.12, 0);
  neck.add(head);
  box(head, 0.30, 0.30, 0.32, 0, 0.19, 0, mats.skin);            // skull
  box(head, 0.32, 0.06, 0.12, 0, 0.27, -0.12, mats.dark);        // brow
  box(head, 0.06, 0.035, 0.02, -0.07, 0.225, -0.165, mats.eye);
  box(head, 0.06, 0.035, 0.02, 0.07, 0.225, -0.165, mats.eye);
  // horns, swept back
  const hornGeo = new ConeGeometry(0.035, 0.24, 6);
  geos.push(hornGeo);
  for (const sx of [-1, 1]) {
    const h = new Mesh(hornGeo, mats.bone);
    h.position.set(sx * 0.11, 0.38, 0.04);
    h.rotation.set(-0.9, 0, sx * -0.35);
    h.castShadow = true;
    head.add(h);
  }
  // inside the mouth: a throat full of fire
  box(head, 0.2, 0.1, 0.16, 0, 0.07, -0.08, mats.throat);
  // upper teeth
  for (let i = -2; i <= 2; i++) box(head, 0.025, 0.04, 0.02, i * 0.05, 0.065, -0.15, mats.bone);
  // the jaw, hinged at the back of the head
  const jaw = new Group();
  jaw.position.set(0, 0.07, 0.07);
  head.add(jaw);
  box(jaw, 0.27, 0.07, 0.27, 0, -0.035, -0.12, mats.skin);
  for (let i = -2; i <= 2; i++) box(jaw, 0.025, 0.04, 0.02, i * 0.05, 0.01, -0.235, mats.bone);
  // where the mouth tears open up the cheeks
  const tears = [];
  for (const sx of [-1, 1]) {
    const t = seam(head, 0.04, 0.2, 0.025, sx * 0.13, 0.12, -0.158, 0, 0, sx * 0.55);
    t.scale.y = 0.001;
    tears.push(t);
  }

  /* -------------------------------- the arms ------------------------------ */
  const makeArm = (sx) => {
    const shoulder = new Group();
    shoulder.position.set(sx * 0.40, 0.44, 0);
    chest.add(shoulder);
    ball(shoulder, 0.12, 1, 1, 1, 0, 0, 0, mats.dark);
    box(shoulder, 0.17, 0.46, 0.17, 0, -0.23, 0, mats.skin);
    seam(shoulder, 0.02, 0.3, 0.02, sx * 0.086, -0.24, 0, 0, 0, 0.1);
    const elbow = new Group();
    elbow.position.set(0, -0.46, 0);
    shoulder.add(elbow);
    box(elbow, 0.15, 0.42, 0.15, 0, -0.21, 0, mats.skin);
    const hand = new Group();
    hand.position.set(0, -0.42, 0);
    elbow.add(hand);
    box(hand, 0.17, 0.16, 0.09, 0, -0.08, 0, mats.dark);
    const clawGeo = new ConeGeometry(0.022, 0.13, 5);
    geos.push(clawGeo);
    for (let i = -1; i <= 1; i++) {
      const c = new Mesh(clawGeo, mats.bone);
      c.position.set(i * 0.05, -0.2, -0.02);
      c.rotation.x = Math.PI;
      hand.add(c);
    }
    return { shoulder, elbow, hand };
  };
  const armL = makeArm(-1), armR = makeArm(1);

  /* -------------------------------- the legs ------------------------------ */
  // Legs live in world space: their joints are wherever the IK puts them.
  const legGroup = new Group();
  const femurGeo = new CylinderGeometry(0.07, 0.12, 1, 7);
  femurGeo.translate(0, 0.5, 0);
  const tibiaGeo = new CylinderGeometry(0.035, 0.085, 1, 7);
  tibiaGeo.translate(0, 0.5, 0);
  const kneeGeo = new SphereGeometry(0.1, 10, 8);
  const footGeo = new ConeGeometry(0.05, 0.22, 6);
  footGeo.translate(0, -0.11, 0);
  geos.push(femurGeo, tibiaGeo, kneeGeo, footGeo);
  const legs = [];
  const LEG_DEF = [
    // anchor on the hub, and where the foot rests relative to the body
    { anchor: [-0.42, 0.02, -0.32], home: [-1.55, -1.32], diag: 0 },
    { anchor: [0.42, 0.02, -0.32], home: [1.55, -1.32], diag: 1 },
    { anchor: [-0.42, 0.02, 0.36], home: [-1.50, 1.42], diag: 1 },
    { anchor: [0.42, 0.02, 0.36], home: [1.50, 1.42], diag: 0 },
  ];
  for (const def of LEG_DEF) {
    const femur = new Mesh(femurGeo, mats.chitin);
    const tibia = new Mesh(tibiaGeo, mats.chitin);
    const knee = new Mesh(kneeGeo, mats.dark);
    const footMesh = new Mesh(footGeo, mats.dark);
    // a seam of fire running down each leg
    const glow = new Mesh(tibiaGeo, mats.crack);
    for (const m of [femur, tibia, knee, footMesh]) { m.castShadow = true; legGroup.add(m); }
    glow.scale.set(0.25, 1, 0.25);
    legGroup.add(glow);
    legs.push({
      def, femur, tibia, knee, footMesh, glow,
      anchor: new Vector3().fromArray(def.anchor),
      hip: new Vector3(), kneePos: new Vector3(),
      foot: new Vector3(), from: new Vector3(), to: new Vector3(),
      stepping: false, stepT: 0,
    });
  }

  return {
    root, hub, abdomen, waist, chest, neck, head, jaw, tears, core, coreGlow,
    armL, armR, legGroup, legs, mats, geos,
  };
}

/** Orients a unit-length +Y mesh from `a` to `b`. */
function placeSegment(mesh, a, b) {
  _seg.subVectors(b, a);
  const len = Math.max(1e-4, _seg.length());
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(Y, _seg.multiplyScalar(1 / len));
  mesh.scale.y = len;
}

/**
 * Where the knee goes for a leg from `hip` to `foot`. A spider's knees ride
 * high and out to the side, so the bend is up and away from the body.
 */
function solveKnee(hip, foot, a, b, outward, out) {
  _d.subVectors(foot, hip);
  let d = _d.length();
  _dir.copy(_d).multiplyScalar(1 / Math.max(d, 1e-5));
  d = clamp(d, Math.abs(a - b) + 1e-3, a + b - 1e-3);
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _bend.set(0, 0.85, 0).addScaledVector(outward, 0.6);
  _bend.addScaledVector(_dir, -_bend.dot(_dir));
  if (_bend.lengthSq() < 1e-6) _bend.set(0, 1, 0);
  _bend.normalize();
  out.copy(hip).addScaledVector(_dir, cosA * a).addScaledVector(_bend, sinA * a);
  return out;
}

/* -------------------------------------------------------------------------- */
/*                                   Silva                                    */
/* -------------------------------------------------------------------------- */

export class Silva {
  constructor(game, at) {
    this.game = game;
    this.rng = makeRng(0x51a);
    this.m = buildModel();
    game.scene.add(this.m.root);
    game.scene.add(this.m.legGroup);
    this.light = new PointLight(0xff5a1a, 0, 9, 1.6);
    game.scene.add(this.light);

    this.home = at.clone();
    this.pos = at.clone();
    this.vel = new Vector3();
    this.yaw = 0;
    this.hp = SILVA.hp;
    this.maxHp = SILVA.hp;
    this.state = 'dormant';
    this.t = 0;
    this.scale = 0.001;
    this.visible = false;
    this.center = new Vector3();
    this.hubY = SILVA.rideHeight;
    this.airborne = false;
    this.flash = 0;
    this.cooldown = { fireball: 1.5, jump: 4, beam: 6 };
    this.thrownHit = new WeakMap();
    this.volumes = [];
    this.beam = null;
    this.marker = null;

    // the pose the springs are chasing, and where they have got to
    this.target = this._restPose();
    this.cur = this._restPose();

    this._buildEffects();
    this.setVisible(false);
    this._plantFeet();
  }

  _restPose() {
    return {
      hubDrop: 0, hubPitch: 0, waistX: 0.08, chestX: 0, chestY: 0, neckX: 0, headX: 0,
      jaw: 0, tear: 0,
      rSX: 0.1, rSZ: 0.25, rEX: -0.45, lSX: 0.1, lSZ: -0.25, lEX: -0.45, glow: 1, core: 0.35,
    };
  }

  /* ------------------------------ telegraphs ------------------------------ */

  _buildEffects() {
    const scene = this.game.scene;
    /* The ring that shows where he is going to land. Amber, not red: on Red
       Plains a red ring on red grass is a ring nobody sees. */
    const ringGeo = new RingGeometry(0.84, 1, 48);
    ringGeo.rotateX(-Math.PI / 2);
    this.markerMat = new MeshBasicMaterial({
      color: 0xffc040, transparent: true, opacity: 0, blending: AdditiveBlending,
      depthWrite: false, side: DoubleSide,
    });
    this.marker = new Mesh(ringGeo, this.markerMat);
    this.marker.visible = false;
    this.marker.renderOrder = 7;
    scene.add(this.marker);
    this.markerFillMat = new MeshBasicMaterial({
      color: 0xff9a30, transparent: true, opacity: 0, blending: AdditiveBlending,
      depthWrite: false, side: DoubleSide,
    });
    const fillGeo = new RingGeometry(0, 1, 48);
    fillGeo.rotateX(-Math.PI / 2);
    this.markerFill = new Mesh(fillGeo, this.markerFillMat);
    this.markerFill.visible = false;
    this.markerFill.renderOrder = 7;
    scene.add(this.markerFill);

    // the beam: a hot core inside a wider glow, both a unit long down -Z
    const beamGeo = new CylinderGeometry(1, 1, 1, 12, 1, true);
    beamGeo.translate(0, 0.5, 0);
    beamGeo.rotateX(-Math.PI / 2);
    this.beamCoreMat = new MeshBasicMaterial({
      color: 0xfff0c0, transparent: true, opacity: 0, blending: AdditiveBlending,
      depthWrite: false, side: DoubleSide,
    });
    this.beamGlowMat = new MeshBasicMaterial({
      color: 0xff4a10, transparent: true, opacity: 0, blending: AdditiveBlending,
      depthWrite: false, side: DoubleSide,
    });
    this.beamCore = new Mesh(beamGeo, this.beamCoreMat);
    this.beamGlow = new Mesh(beamGeo, this.beamGlowMat);
    for (const b of [this.beamCore, this.beamGlow]) {
      b.visible = false; b.frustumCulled = false; b.renderOrder = 9; scene.add(b);
    }
    this.extraGeos = [ringGeo, fillGeo, beamGeo];
    this.beamDir = new Vector3(0, 0, -1);
    this.beamFrom = new Vector3();
    this.beamTo = new Vector3();
    this.beamLen = 0;
  }

  setVisible(v) {
    this.visible = v;
    this.m.root.visible = v;
    this.m.legGroup.visible = v;
  }

  /* ------------------------------- the frame ------------------------------ */

  update(dt) {
    if (this.state === 'gone') return;
    this.t += dt;
    for (const k of Object.keys(this.cooldown)) this.cooldown[k] = Math.max(0, this.cooldown[k] - dt);
    this.flash = Math.max(0, this.flash - dt * 4);

    switch (this.state) {
      case 'dormant': break;
      case 'forming': this._forming(dt); break;
      case 'roar': this._roar(dt); break;
      case 'idle': this._idle(dt); break;
      case 'chase': this._chase(dt); break;
      case 'fireball': this._fireball(dt); break;
      case 'jump': this._jump(dt); break;
      case 'beam': this._beamAttack(dt); break;
      case 'recover': this._recover(dt); break;
      case 'dying': this._dying(dt); break;
      default: break;
    }
    if (this.visible) {
      this._animate(dt);
      this._ambientFire(dt);
      this._shove(dt);
      if (this.state !== 'dying' && this.state !== 'forming') this._thrownObjects();
    }
  }

  _setState(s) {
    this.state = s;
    this.t = 0;
  }

  /** The player, if they are someone he can still go after. */
  get player() { return this.game.player; }

  _toPlayer(out) {
    const p = this.player;
    return out.set(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z);
  }

  _faceToward(x, z, dt, rate = SILVA.turnRate) {
    const want = Math.atan2(-(x - this.pos.x), -(z - this.pos.z));
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += clamp(d, -rate * dt, rate * dt);
    return Math.abs(d);
  }

  /* ------------------------------ the intro ------------------------------- */

  /** Called by the cutscene: the embers come together into him. */
  startForming() {
    this.setVisible(true);
    this.scale = 0.05;
    this.pos.copy(this.home);
    this.yaw = Math.atan2(-(this.player.pos.x - this.pos.x), -(this.player.pos.z - this.pos.z));
    this._plantFeet();
    this._setState('forming');
  }

  _forming(dt) {
    const k = clamp01(this.t / 2.6);
    // grows, uncurls, and the glow settles from white heat to a burn
    this.scale = 0.05 + (1 - (1 - k) ** 3) * 0.95;
    this.target = this._restPose();
    this.target.hubDrop = (1 - k) * 0.6;
    this.target.waistX = lerp(1.1, 0.08, k);
    this.target.headX = lerp(0.9, 0, k);
    this.target.rSZ = lerp(1.2, 0.25, k); this.target.lSZ = -this.target.rSZ;
    this.target.glow = 1 + (1 - k) * 2.5;
    this.target.core = 0.3 + (1 - k) * 0.7;
    const fx = this.game.fx;
    if (fx && this.rng() < 0.9) {
      // the fire pulling inwards, into the shape of him
      const a = this.rng() * Math.PI * 2, r = 1.5 + this.rng() * 1.5;
      _v1.set(this.pos.x + Math.cos(a) * r, this.pos.y + 0.6 + this.rng() * 2.2, this.pos.z + Math.sin(a) * r);
      _v2.set(this.center.x - _v1.x, this.center.y - _v1.y, this.center.z - _v1.z).multiplyScalar(1.4);
      fx.fire(_v1, { count: 2, size: 0.3, life: 0.6, up: 0.2, vel: _v2 });
    }
    if (k >= 1) this.target.hubDrop = 0;
  }

  /** Called by the cutscene: the mouth tears open, and he roars. */
  startRoar() { this._setState('roar'); }

  _roar(dt) {
    const t = this.t;
    this.target = this._restPose();
    // rears back, then throws the roar forward
    const rear = clamp01(t / 0.5), forward = clamp01((t - 0.55) / 0.25);
    this.target.waistX = lerp(0.08, -0.35, rear) + forward * 0.5;
    this.target.chestX = -0.2 * rear + forward * 0.25;
    this.target.headX = -0.6 * rear + forward * 0.75;
    this.target.jaw = clamp01((t - 0.2) / 0.5) * 1.15;
    this.target.tear = clamp01((t - 0.35) / 0.4);
    this.target.rSZ = 0.25 + rear * 1.1; this.target.lSZ = -this.target.rSZ;
    this.target.rEX = -0.45 - rear * 0.8; this.target.lEX = this.target.rEX;
    this.target.glow = 1.5 + forward * 1.5;
    // the moment the cheeks give: a gout of fire out of the tear
    if (t > 0.62 && !this._tore) {
      this._tore = true;
      const mouth = this.mouthPos(_v1);
      this.game.fx?.fire(mouth, { count: 12, spread: 0.06, size: 0.22, up: 0.4, life: 0.32,
        vel: this.forward(_v2).multiplyScalar(2.4) });
      this.game.fx?.embers(mouth, { count: 10, spread: 0.08, up: 0.8, life: 0.9 });
      this.game.shake = Math.min(1.2, this.game.shake + 0.35);
    }
    if (t > 0.8 && !this._roared) {
      this._roared = true;
      this.game.fx?.ring(this.pos, { radius: 9, life: 0.9, color: 0xff3a10, y: this.floorY() });
      this.game.fx?.light(this.mouthPos(_v1), { color: 0xff5a14, intensity: 60, life: 1.2, distance: 16 });
      this.game.shake = Math.min(1.6, this.game.shake + 1.2);
    }
    if (t > 0.8 && t < 2.2) {
      // the roar comes out of him as fire, straight ahead
      const mouth = this.mouthPos(_v1);
      this.game.fx?.fire(mouth, { count: 2, size: 0.24, up: 0.25, life: 0.36,
        vel: this.forward(_v2).multiplyScalar(5.5).add(_v3.set(0, 0.3, 0)) });
    }
  }

  /** The cutscene is over (or was skipped): he is yours to fight. */
  wake() {
    this._roared = true;
    if (this.scale < 0.999) {
      this.scale = 1;
      this._plantFeet();
    }
    this.setVisible(true);
    this._setState('idle');
  }

  /* ------------------------------- thinking ------------------------------- */

  _idle(dt) {
    this.target = this._restPose();
    this._settle(dt);
    if (this.t > 0.6) this._setState('chase');
  }

  _recover(dt) {
    this.target = this._restPose();
    this._settle(dt);
    this._faceToward(this.player.pos.x, this.player.pos.z, dt, SILVA.turnRate * 0.6);
    if (this.t > this.recoverFor) this._setState('chase');
  }

  _settle(dt) {
    this.vel.multiplyScalar(Math.exp(-6 * dt));
    this._move(dt);
  }

  _chase(dt) {
    const p = this.player;
    this.target = this._restPose();
    const to = this._toPlayer(_v1);
    const dist = to.length();
    this._faceToward(p.pos.x, p.pos.z, dt);
    // keep to a range he can use; close in from far, back off from too close
    let want = 0;
    if (dist > 12) want = 1;
    else if (dist < 5.5) want = -0.55;
    if (dist > 1e-3) to.multiplyScalar(1 / dist);
    _v2.set(to.x * want, 0, to.z * want).multiplyScalar(SILVA.walkSpeed);
    // a slow drift sideways, so he is never quite standing still
    const side = Math.sin(this.game.time * 0.7) * 0.9;
    _v2.x += -to.z * side; _v2.z += to.x * side;
    this.vel.x = damp(this.vel.x, _v2.x, 3, dt);
    this.vel.z = damp(this.vel.z, _v2.z, 3, dt);
    this._move(dt);
    // walking: arms swing with the body
    const sw = Math.sin(this.game.time * 5.2) * clamp01(this.vel.length() / 2) * 0.35;
    this.target.rSX = 0.1 + sw; this.target.lSX = 0.1 - sw;

    if (p.dead || this.t < 0.7) return;
    const pick = this._pickAttack(dist);
    if (pick) this._startAttack(pick);
  }

  _pickAttack(dist) {
    const c = this.cooldown;
    const options = [];
    if (c.fireball <= 0 && dist > 4 && dist < 24) options.push(['fireball', 3]);
    if (c.jump <= 0 && dist > 3 && dist < 19) options.push(['jump', dist < 6 ? 4 : 2]);
    if (c.beam <= 0 && dist > 5 && dist < 26) options.push(['beam', 2]);
    if (c.jump <= 0 && dist <= 3) options.push(['jump', 6]);
    if (!options.length) return null;
    let total = 0;
    for (const o of options) total += o[1];
    let r = this.rng() * total;
    for (const o of options) { r -= o[1]; if (r <= 0) return o[0]; }
    return options[0][0];
  }

  _startAttack(name) {
    this._setState(name);
    this.vel.set(0, 0, 0);
    this.shots = 0;
    if (name === 'jump') {
      // where you are standing now is where he is coming down
      this.jumpTo = this.player.pos.clone();
      this.jumpTo.y = this.game.world.floorAt(this.jumpTo.x, this.jumpTo.z, this.player.pos.y);
      const half = this.game.map.half - 3;
      this.jumpTo.x = clamp(this.jumpTo.x, -half, half);
      this.jumpTo.z = clamp(this.jumpTo.z, -half, half);
      this.jumpFrom = this.pos.clone();
    }
    if (name === 'beam') this.beamLocked = false;
  }

  _endAttack(name, recover) {
    this.cooldown[name] = { fireball: 4.2, jump: 6.5, beam: 8.5 }[name];
    // nothing back to back: there is always a breath between attacks
    for (const k of Object.keys(this.cooldown)) this.cooldown[k] = Math.max(this.cooldown[k], 1.2);
    this.recoverFor = recover;
    this._setState('recover');
  }

  /* ---------------------------- Fireball Burst ---------------------------- */

  _fireball(dt) {
    const t = this.t;
    const p = this.player;
    this.target = this._restPose();
    this._settle(dt);
    this._faceToward(p.pos.x, p.pos.z, dt, SILVA.turnRate * 1.2);
    // the tell: head back, jaw dropping, fire filling the mouth
    const wind = clamp01(t / 0.8);
    this.target.headX = -0.5 * wind;
    this.target.chestX = -0.12 * wind;
    this.target.jaw = wind * 0.9;
    this.target.tear = wind * 0.4;
    this.target.rSZ = 0.25 + wind * 0.4; this.target.lSZ = -this.target.rSZ;
    const mouth = this.mouthPos(_v1);
    if (t < 0.8) {
      this.game.fx?.fire(mouth, { count: 2, size: 0.18 + wind * 0.2, up: 0.4, life: 0.3 });
    }
    // three, one after another, each at where you are when it leaves
    const times = [0.8, 1.06, 1.32];
    while (this.shots < 3 && t >= times[this.shots]) {
      const i = this.shots++;
      const aim = this._aimAt(_v2, p, i === 0 ? 0 : (i === 1 ? -0.1 : 0.1));
      this.game.fire.shoot({
        from: mouth.clone(), dir: aim, speed: 15, radius: 0.26, damage: 16, splash: 1.9,
        ignite: 3, owner: 'boss', hitsBoss: false, scale: 1.2,
      });
      this.game.fx?.fire(mouth, { count: 8, size: 0.35, up: 0.5, life: 0.25,
        vel: _v3.copy(aim).multiplyScalar(5) });
      this.target.headX = 0.35;           // the head snaps forward with each one
      this.game.shake = Math.min(1.5, this.game.shake + 0.15);
    }
    if (t > 1.32) this.target.headX = 0.2;
    if (t > 1.9) this._endAttack('fireball', 0.7);
  }

  /** Straight at someone's chest, turned a little to one side. */
  _aimAt(out, p, turn = 0) {
    const mouth = this.mouthPos(_v3);
    out.set(p.pos.x, p.pos.y + 0.3, p.pos.z).sub(mouth);
    if (turn) out.applyAxisAngle(Y, turn);
    return out.normalize();
  }

  /* --------------------------------- Jump --------------------------------- */

  _jump(dt) {
    const t = this.t;
    this.target = this._restPose();
    const CROUCH = 0.6, FLIGHT = 1.05;
    if (t < CROUCH) {
      // the tell: down on his legs, and the ring where he means to land
      this._settle(dt);
      this._faceToward(this.jumpTo.x, this.jumpTo.z, dt, SILVA.turnRate * 1.5);
      const k = t / CROUCH;
      this.target.hubDrop = 0.55 * k;
      this.target.waistX = 0.08 + 0.35 * k;
      this.target.rSZ = 0.25 + 0.9 * k; this.target.lSZ = -this.target.rSZ;
      this.target.rEX = -0.45 - 0.9 * k; this.target.lEX = this.target.rEX;
      this._showMarker(this.jumpTo, 4.0, k);
      return;
    }
    if (t < CROUCH + FLIGHT) {
      // up and over, on a parabola that lands exactly on the ring
      this.airborne = true;
      const k = (t - CROUCH) / FLIGHT;
      this.pos.x = lerp(this.jumpFrom.x, this.jumpTo.x, k);
      this.pos.z = lerp(this.jumpFrom.z, this.jumpTo.z, k);
      const base = lerp(this.jumpFrom.y, this.jumpTo.y, k);
      this.pos.y = base + 4 * 6.0 * k * (1 - k);
      this.target.hubDrop = -0.15;
      this.target.waistX = -0.2 + k * 0.6;
      this.target.rSZ = 1.3 - k * 0.4; this.target.lSZ = -this.target.rSZ;
      this.target.rSX = -1.2 + k * 2.2; this.target.lSX = this.target.rSX;
      this._showMarker(this.jumpTo, 4.0, 1);
      if (this.rng() < 0.7) this.game.fx?.fire(this.center, { count: 2, size: 0.4, up: -0.5, life: 0.35 });
      return;
    }
    if (this.airborne) {
      this.airborne = false;
      this.pos.copy(this.jumpTo);
      this._plantFeet();
      this._slam();
      this._hideMarker();
    }
    this.target.hubDrop = 0.45 * clamp01(1 - (t - CROUCH - FLIGHT) / 0.5);
    this.target.waistX = 0.5;
    this._settle(dt);
    if (t > CROUCH + FLIGHT + 0.9) this._endAttack('jump', 0.6);
  }

  /** Coming down: a shockwave that throws whoever is near. */
  _slam() {
    const g = this.game, at = this.pos;
    const y = this.floorY();
    g.fx?.ring(at, { radius: 5.5, life: 0.7, color: 0xff4a14, y });
    g.fx?.explosion(_v1.set(at.x, y + 0.3, at.z), { scale: 1.6 });
    g.fx?.smoke(_v1, { count: 14, spread: 1.8, size: 1.4, up: 1.4 });
    g.shake = Math.min(1.8, g.shake + 1.1);
    g.fire?.scorchFloor(_v1, 1.6);
    const R = 3.9;
    for (const c of g.characters) {
      const d = Math.hypot(c.pos.x - at.x, c.pos.z - at.z);
      if (d > R || c.body?.destroyed) continue;
      if (c.pos.y - 0.945 > y + 1.6) continue;      // jumped clear of it
      const k = 1 - d / R;
      boneBoxCenter(c.rig.byName.midTorso, _v2);
      _v3.set(c.pos.x - at.x, 0, c.pos.z - at.z);
      if (_v3.lengthSq() < 1e-4) _v3.set(1, 0, 0);
      _v3.normalize().multiplyScalar(150 + 220 * k);
      _v3.y = 90 + 130 * k;
      c.applyImpact(_v2, _v3, { boneName: 'midTorso', damage: 8 + 22 * k, type: 'blunt',
        severity: 0.5 + 0.4 * k });
      if (c !== g.player) c.balance = 0;
    }
  }

  _showMarker(at, radius, k) {
    const y = this.game.world.floorAt(at.x, at.z, at.y + 0.5) + 0.04;
    this.marker.visible = true;
    this.markerFill.visible = true;
    this.marker.position.set(at.x, y, at.z);
    this.markerFill.position.set(at.x, y - 0.005, at.z);
    this.marker.scale.set(radius, 1, radius);
    this.markerFill.scale.set(radius * k, 1, radius * k);
    const pulse = 0.5 + Math.sin(this.game.time * 14) * 0.25;
    this.markerMat.opacity = 0.55 + pulse * 0.4;
    this.markerFillMat.opacity = 0.18 + 0.12 * k;
  }

  _hideMarker() {
    this.marker.visible = false;
    this.markerFill.visible = false;
  }

  /* ------------------------------ Chest Beam ------------------------------ */

  _beamAttack(dt) {
    const t = this.t;
    const p = this.player;
    const CHARGE = 1.5, LOCK = 1.2, FIRE = 1.35;
    this.target = this._restPose();
    this._settle(dt);
    const core = this.corePos(_v1);
    if (t < CHARGE) {
      // the tell: the chest opens, arms spread, and the fire gathers in
      const k = t / CHARGE;
      if (t < LOCK) this._faceToward(p.pos.x, p.pos.z, dt, SILVA.turnRate);
      this.target.chestX = -0.25 * k;
      this.target.waistX = -0.1 * k;
      this.target.rSZ = 0.25 + 1.3 * k; this.target.lSZ = -this.target.rSZ;
      this.target.rSX = 0.1 - 0.5 * k; this.target.lSX = this.target.rSX;
      this.target.core = 0.4 + 1.6 * k;
      this.target.glow = 1 + k;
      const fx = this.game.fx;
      if (fx) {
        for (let i = 0; i < 2; i++) {
          const a = this.rng() * Math.PI * 2, r = 1.2 + this.rng() * 0.8;
          _v2.set(core.x + Math.cos(a) * r, core.y + (this.rng() - 0.5) * 1.4, core.z + Math.sin(a) * r);
          _v3.copy(core).sub(_v2).multiplyScalar(2.6);
          fx.fire(_v2, { count: 1, size: 0.16, life: 0.38, up: 0, vel: _v3 });
        }
      }
      if (t >= LOCK && !this.beamLocked) {
        // the aim stops following you here - this is the moment to move
        this.beamLocked = true;
        this.beamDir.set(p.pos.x, p.pos.y + 0.2, p.pos.z).sub(core).normalize();
        this.game.fx?.light(core, { color: 0xffa040, intensity: 25, life: 0.3, distance: 6 });
      }
      if (this.beamLocked) this._drawBeam(core, 0.25 + Math.sin(t * 60) * 0.1, 0.04);
      return;
    }
    if (t < CHARGE + FIRE) {
      // a slow sweep after you: standing still is the one thing you cannot do
      _v2.set(p.pos.x, p.pos.y + 0.2, p.pos.z).sub(core).normalize();
      const sweep = 0.32 * dt;
      this.beamDir.lerp(_v2, clamp01(sweep * 3)).normalize();
      const flat = Math.atan2(-this.beamDir.x, -this.beamDir.z);
      this._faceToward(this.pos.x - Math.sin(flat), this.pos.z - Math.cos(flat), dt, 2);
      this.target.chestX = -0.3;
      this.target.rSZ = 1.5; this.target.lSZ = -1.5;
      this.target.core = 2.2;
      this.target.glow = 2;
      this._drawBeam(core, 1, 0.32);
      this._beamDamage(dt, core);
      this.game.shake = Math.min(0.6, this.game.shake + dt * 2);
      return;
    }
    this._hideBeam();
    if (t > CHARGE + FIRE + 0.8) this._endAttack('beam', 0.5);
  }

  /** Lays the beam from the core to the first thing in its way. */
  _drawBeam(from, intensity, width) {
    const len = this._beamReach(from, this.beamDir);
    this.beamFrom.copy(from);
    this.beamTo.copy(from).addScaledVector(this.beamDir, len);
    this.beamLen = len;
    for (const [m, mat, w, op] of [
      [this.beamCore, this.beamCoreMat, width * 0.4, 0.95],
      [this.beamGlow, this.beamGlowMat, width, 0.5],
    ]) {
      m.visible = true;
      m.position.copy(from);
      m.quaternion.setFromUnitVectors(_v4.set(0, 0, -1), this.beamDir);
      m.scale.set(w + (this.rng() - 0.5) * w * 0.15, w, len);
      mat.opacity = op * intensity;
    }
    if (width > 0.1) {
      this.game.fx?.sparks(this.beamTo, null, { count: 3, speed: 6, life: 0.4 });
      this.game.fx?.fire(this.beamTo, { count: 2, size: 0.4, life: 0.3, up: 1 });
      if (this.rng() < 0.5) this.game.fire?.scorchFloor(this.beamTo, 0.45);
    }
  }

  _hideBeam() {
    this.beamCore.visible = false;
    this.beamGlow.visible = false;
  }

  /** How far the beam gets before something solid stops it. */
  _beamReach(from, dir) {
    const w = this.game.world;
    let best = 45;
    if (dir.y < -1e-3) {
      const t = (w.groundY - from.y) / dir.y;
      if (t > 0 && t < best && w.hasGroundAt(from.x + dir.x * t, from.z + dir.z * t)) best = t;
    }
    const wall = w.raycastStatic(from, dir, best);
    if (wall && wall.distance < best) best = wall.distance;
    return best;
  }

  _beamDamage(dt, from) {
    this.beamTick = (this.beamTick || 0) - dt;
    if (this.beamTick > 0) return;
    this.beamTick = 0.1;
    const g = this.game;
    for (const c of g.characters) {
      if (c.body?.destroyed) continue;
      // closest approach between the beam and the middle of the person
      boneBoxCenter(c.rig.byName.midTorso, _v2);
      _v3.copy(_v2).sub(from);
      const along = clamp(_v3.dot(this.beamDir), 0, this.beamLen);
      _v4.copy(from).addScaledVector(this.beamDir, along);
      const miss = _v4.distanceTo(_v2);
      if (miss > 0.55) continue;
      c.applyImpact(_v4, _v3.copy(this.beamDir).multiplyScalar(40).add(_v1.set(0, 10, 0)), {
        boneName: 'midTorso', damage: 3.6, type: 'burn', severity: 0.4,
      });
      g.fire?.ignite(c, 1.5, null);
    }
  }

  /* -------------------------------- moving -------------------------------- */

  _move(dt) {
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const half = this.game.map.half - 2.6;
    this.pos.x = clamp(this.pos.x, -half, half);
    this.pos.z = clamp(this.pos.z, -half, half);
    if (!this.airborne) {
      const floor = this.floorY();
      this.pos.y = damp(this.pos.y, floor, 10, dt);
    }
  }

  floorY() {
    return this.game.world.floorAt(this.pos.x, this.pos.z, this.pos.y + 1.2);
  }

  /** Bodies are solid to him too: walk into one of his legs and you stop. */
  _shove() {
    const p = this.player;
    if (!p || p.isRagdolling || this.state === 'dormant') return;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const R = 1.25 * this.scale;
    if (d >= R || d < 1e-4) return;
    if (p.pos.y - 0.945 > this.pos.y + this.hubY + 0.4) return;   // over the top of him
    p.pos.x += (dx / d) * (R - d);
    p.pos.z += (dz / d) * (R - d);
  }

  /** Crates and boulders thrown at him hurt him, and bounce off. */
  _thrownObjects() {
    for (const b of this.game.world.bodies) {
      const speed = b.vel.length();
      if (speed < 6) continue;
      const last = this.thrownHit.get(b) || 0;
      if (this.game.time - last < 0.6) continue;
      const r = b.shape === 'sphere' ? b.radius : b.half.length();
      const part = this.hitTest(b.pos, r * 0.8);
      if (!part) continue;
      this.thrownHit.set(b, this.game.time);
      const dmg = clamp(b.mass * speed * 0.32, 8, 180);
      this.takeDamage(dmg, b.pos, 'blunt');
      _v1.copy(b.pos).sub(this.center).normalize();
      b.vel.copy(_v1).multiplyScalar(speed * 0.45);
      b.vel.y = Math.abs(b.vel.y) + 2;
      b.wake?.();
    }
  }

  /* ------------------------------ being hurt ------------------------------ */

  takeDamage(amount, point = null, kind = 'blunt') {
    if (this.state === 'dying' || this.state === 'gone' || this.state === 'dormant' ||
        this.state === 'forming' || this.state === 'roar') return;
    this.hp = Math.max(0, this.hp - amount);
    this.flash = Math.min(1, this.flash + 0.25 + amount / 60);
    if (point) {
      this.game.fx?.sparks(point, null, { count: Math.min(16, 4 + amount / 4), speed: 5, life: 0.4 });
      this.game.fx?.embers(point, { count: 3 });
    }
    // a big enough hit makes him flinch; it does not interrupt what he is doing
    if (amount > 24) this.cur.chestX += 0.18;
    this.game.hud?.setBoss('SILVA', this.hp, this.maxHp);
    if (this.hp <= 0) this._die();
    void kind;
  }

  _die() {
    this._hideBeam();
    this._hideMarker();
    this.airborne = false;
    this.pos.y = this.floorY();
    this._setState('dying');
  }

  _dying(dt) {
    const t = this.t;
    this.target = this._restPose();
    // rears up, arms thrown wide, burning white-hot from the inside
    this.target.waistX = -0.45 + Math.sin(t * 20) * 0.08;
    this.target.headX = -0.7;
    this.target.jaw = 1.2;
    this.target.tear = 1;
    this.target.rSZ = 1.6 + Math.sin(t * 17) * 0.2; this.target.lSZ = -this.target.rSZ;
    this.target.glow = 2 + t * 3;
    this.target.core = 2 + t * 2;
    this.target.hubDrop = Math.sin(t * 23) * 0.06;
    const fx = this.game.fx;
    if (fx) {
      for (let i = 0; i < 3; i++) {
        _v1.set(this.center.x + (this.rng() - 0.5) * 1.6, this.center.y + (this.rng() - 0.4) * 2,
          this.center.z + (this.rng() - 0.5) * 1.6);
        fx.fire(_v1, { count: 2, size: 0.45, life: 0.5, up: 1.6 });
      }
    }
    this.game.shake = Math.min(0.8, this.game.shake + dt * 1.5);
    if (t > 1.4) this._explode();
  }

  /** The end of him: a blast, and the pieces thrown across the field. */
  _explode() {
    const g = this.game;
    const at = this.center.clone();
    g.fx?.explosion(at, { scale: 3.2 });
    g.fx?.explosion(_v1.set(at.x, at.y + 1, at.z), { scale: 2 });
    g.fx?.ring(this.pos, { radius: 12, life: 1.1, color: 0xff5a14, y: this.floorY() });
    g.fx?.flash(at, { radius: 3.5, life: 0.45 });
    g.fx?.smoke(at, { count: 24, spread: 2.2, size: 1.8, up: 2 });
    g.shake = Math.min(2, g.shake + 1.6);
    g.fire?.scorchFloor(_v1.set(this.pos.x, this.floorY(), this.pos.z), 3.2);
    // the blast throws whoever is close
    for (const c of g.characters) {
      const d = c.center.distanceTo(at);
      if (d > 6 || c.body?.destroyed) continue;
      const k = 1 - d / 6;
      _v2.copy(c.center).sub(at).normalize().multiplyScalar(120 * k);
      _v2.y += 60 * k;
      c.applyImpact(c.center.clone(), _v2, { boneName: 'midTorso', damage: 0, type: 'blunt', severity: 0.4 * k });
      if (c !== g.player) g.fire?.ignite(c, 3 * k, null);
    }
    // what is left of him comes apart
    this.m.root.updateMatrixWorld(true);
    const pieces = [];
    this.m.root.traverse((o) => { if (o.isMesh && o.geometry && o !== this.m.core && o !== this.m.coreGlow) pieces.push(o); });
    for (const leg of this.m.legs) pieces.push(leg.femur, leg.tibia, leg.footMesh);
    let thrown = 0;
    for (const m of pieces) {
      if (thrown > 26) break;
      if (m.geometry.boundingSphere == null) m.geometry.computeBoundingSphere();
      m.updateMatrixWorld(true);
      m.matrixWorld.decompose(m.position, m.quaternion, m.scale);
      if (m.geometry.boundingSphere.radius * Math.max(m.scale.x, m.scale.y, m.scale.z) < 0.05) continue;
      m.removeFromParent();
      // his materials, so his pieces go when he does
      m.userData.owner = this;
      _v2.copy(m.position).sub(at);
      _v2.y = Math.abs(_v2.y) + 0.5;
      _v2.normalize().multiplyScalar(5 + this.rng() * 8);
      _v2.y += 3 + this.rng() * 5;
      g.gore?.throwPart(m, _v2, { bleed: 0 });
      thrown++;
    }
    this.setVisible(false);
    this.light.intensity = 0;
    this._setState('gone');
    this.onDeath?.(this.pos.clone());
  }

  /* ------------------------------ hit testing ----------------------------- */

  /**
   * His body as a set of spheres and capsules in the world. Bullets, blades,
   * fists, fireballs and thrown crates all ask these the same question.
   */
  _updateVolumes() {
    const m = this.m, V = this.volumes;
    V.length = 0;
    const wp = (o, x, y, z) => o.localToWorld(new Vector3(x, y, z));
    V.push({ type: 's', name: 'hub', a: wp(m.hub, 0, 0, 0), r: 0.62 * this.scale, mult: 1 });
    V.push({ type: 's', name: 'abdomen', a: wp(m.hub, 0, 0.06, 0.62), r: 0.56 * this.scale, mult: 1 });
    V.push({ type: 'c', name: 'torso', a: wp(m.waist, 0, 0, 0), b: wp(m.chest, 0, 0.5, 0), r: 0.34 * this.scale, mult: 1 });
    V.push({ type: 's', name: 'head', a: wp(m.head, 0, 0.18, 0), r: 0.21 * this.scale, mult: 1.6 });
    for (const arm of [m.armL, m.armR]) {
      V.push({ type: 'c', name: 'arm', a: wp(arm.shoulder, 0, 0, 0), b: wp(arm.elbow, 0, 0, 0), r: 0.12 * this.scale, mult: 0.9 });
      V.push({ type: 'c', name: 'arm', a: wp(arm.elbow, 0, 0, 0), b: wp(arm.hand, 0, -0.15, 0), r: 0.11 * this.scale, mult: 0.9 });
    }
    for (const leg of m.legs) {
      V.push({ type: 'c', name: 'leg', a: leg.hip.clone(), b: leg.kneePos.clone(), r: 0.13 * this.scale, mult: 0.8 });
      V.push({ type: 'c', name: 'leg', a: leg.kneePos.clone(), b: leg.foot.clone(), r: 0.09 * this.scale, mult: 0.8 });
    }
  }

  /** The part a point (with some thickness of its own) is touching, if any. */
  hitTest(p, radius = 0) {
    if (!this.visible || this.state === 'gone') return null;
    if (this.center.distanceToSquared(p) > 16) return null;
    let best = null, bestD = Infinity;
    for (const v of this.volumes) {
      let d;
      if (v.type === 's') d = v.a.distanceTo(p) - v.r;
      else {
        _v1.subVectors(v.b, v.a);
        const L2 = _v1.lengthSq();
        const t = L2 > 0 ? clamp(_v2.subVectors(p, v.a).dot(_v1) / L2, 0, 1) : 0;
        d = _v3.copy(v.a).addScaledVector(_v1, t).distanceTo(p) - v.r;
      }
      if (d <= radius && d < bestD) { bestD = d; best = v; }
    }
    return best;
  }

  /** The nearest part a ray hits, and how far along it. */
  raycast(origin, dir, maxDist = 300) {
    if (!this.visible || this.state === 'gone') return null;
    let best = null;
    for (const v of this.volumes) {
      let t = null;
      if (v.type === 's') {
        _v1.subVectors(origin, v.a);
        const b = _v1.dot(dir), c = _v1.lengthSq() - v.r * v.r;
        const disc = b * b - c;
        if (disc >= 0) t = -b - Math.sqrt(disc);
      } else {
        // closest approach between the ray and the capsule's spine
        _v1.subVectors(v.b, v.a);
        _v2.subVectors(origin, v.a);
        const a = dir.dot(dir), bb = dir.dot(_v1), c = _v1.dot(_v1), d = dir.dot(_v2), e = _v1.dot(_v2);
        const den = a * c - bb * bb;
        let s = den > 1e-8 ? (bb * e - c * d) / den : 0;
        let u = den > 1e-8 ? (a * e - bb * d) / den : 0;
        u = clamp(u, 0, 1);
        s = Math.max(0, (u * bb - d) / a);
        _v3.copy(origin).addScaledVector(dir, s);
        _v4.copy(v.a).addScaledVector(_v1, u);
        const miss = _v3.distanceTo(_v4);
        if (miss <= v.r) t = s - Math.sqrt(Math.max(0, v.r * v.r - miss * miss));
      }
      if (t != null && t > 0 && t < maxDist && (!best || t < best.distance)) {
        best = { distance: t, part: v, point: origin.clone().addScaledVector(dir, t) };
      }
    }
    return best;
  }

  /* ------------------------------- animation ------------------------------ */

  forward(out) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  mouthPos(out) {
    return this.m.head.localToWorld(out.set(0, 0.06, -0.22));
  }

  corePos(out) {
    return this.m.chest.localToWorld(out.set(0, 0.26, -0.24));
  }

  _animate(dt) {
    const m = this.m, cur = this.cur, tgt = this.target;
    for (const k of Object.keys(tgt)) cur[k] = damp(cur[k], tgt[k], k === 'jaw' ? 16 : 9, dt);

    // the body rides above the feet, breathing, and dips with each step
    const breathe = Math.sin(this.game.time * 1.7) * 0.03;
    let footY = 0;
    for (const leg of m.legs) footY += leg.foot.y;
    footY /= m.legs.length;
    const rideOver = this.airborne ? this.pos.y : Math.max(this.pos.y, footY);
    this.hubY = SILVA.rideHeight - cur.hubDrop + breathe;
    m.root.position.set(this.pos.x, rideOver, this.pos.z);
    m.root.rotation.set(0, this.yaw, 0);
    m.root.scale.setScalar(this.scale);
    m.hub.position.set(0, this.hubY, 0);
    m.hub.rotation.x = cur.hubPitch;
    m.waist.rotation.set(-cur.waistX, 0, 0);
    m.chest.rotation.set(-cur.chestX, cur.chestY, 0);
    m.neck.rotation.set(-cur.neckX * 0.5, 0, 0);
    m.head.rotation.set(-cur.headX, 0, 0);
    m.jaw.rotation.set(cur.jaw, 0, 0);
    for (const t of m.tears) t.scale.y = Math.max(0.001, cur.tear);
    m.armR.shoulder.rotation.set(-cur.rSX, 0, cur.rSZ);
    m.armR.elbow.rotation.set(cur.rEX, 0, 0);
    m.armL.shoulder.rotation.set(-cur.lSX, 0, cur.lSZ);
    m.armL.elbow.rotation.set(cur.lEX, 0, 0);

    // the fire in him: seams brighter as he is hurt or angry, the core with it
    const glow = cur.glow + this.flash * 2;
    const flick = 0.85 + Math.sin(this.game.time * 13) * 0.08 + Math.sin(this.game.time * 7.3) * 0.07;
    m.mats.crack.color.setRGB(Math.min(1, 1.0 * flick), clamp01(0.32 * glow * flick), clamp01(0.08 * glow * 0.6));
    m.mats.eye.color.setRGB(1, clamp01(0.7 + this.flash * 0.3), clamp01(0.25 + this.flash * 0.7));
    m.mats.throat.color.setRGB(1, clamp01(0.25 + cur.jaw * 0.3), 0.04);
    m.core.scale.setScalar(0.6 + cur.core * 0.35);
    m.coreGlow.scale.setScalar(0.7 + cur.core * 0.6 * flick);
    m.mats.coreGlow.uniforms.opacity.value = clamp01(0.45 + cur.core * 0.3);
    if (this.flash > 0) m.mats.skin.emissive.setRGB(0.14 + this.flash * 0.5, 0.02 + this.flash * 0.18, 0);
    else m.mats.skin.emissive.setRGB(0.14, 0.024, 0.008);

    m.root.updateMatrixWorld(true);
    this.center.copy(m.hub.localToWorld(_v1.set(0, 0.4, -0.1)));
    this.light.position.copy(this.center);
    this.light.intensity = (2.2 + cur.core * 2.5) * flick * (this.state === 'gone' ? 0 : 1);
    this._updateLegs(dt);
    this._updateVolumes();
  }

  /** Feet straight under where they belong: used when he arrives or lands. */
  _plantFeet() {
    for (const leg of this.m.legs) {
      this._homeFoot(leg, leg.foot);
      leg.stepping = false;
    }
  }

  _homeFoot(leg, out) {
    const h = leg.def.home;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const sc = this.scale;
    out.set(this.pos.x + (h[0] * c + h[1] * s) * sc, 0, this.pos.z + (-h[0] * s + h[1] * c) * sc);
    out.y = this.game.world.floorAt(out.x, out.z, this.pos.y + 1.5);
    if (!Number.isFinite(out.y)) out.y = this.pos.y;
    return out;
  }

  _updateLegs(dt) {
    const m = this.m;
    const tuck = this.airborne || this.state === 'forming';
    const moving = this.vel.length();
    for (let i = 0; i < m.legs.length; i++) {
      const leg = m.legs[i];
      m.hub.localToWorld(leg.hip.copy(leg.anchor));
      if (tuck) {
        // drawn in under the body, mid-air or still forming
        const k = this.state === 'forming' ? 1 - clamp01(this.t / 2.2) : 0.6;
        this._homeFoot(leg, _v2);
        _v2.y = this.pos.y;
        _v3.copy(leg.hip).lerp(_v2, 1 - k * 0.7);
        _v3.y = lerp(_v2.y, leg.hip.y - 0.6, k);
        leg.foot.lerp(_v3, clamp01(dt * 14));
        leg.stepping = false;
      } else {
        const home = this._homeFoot(leg, _v2);
        // lead the step in the direction he is going
        home.x += this.vel.x * 0.28; home.z += this.vel.z * 0.28;
        if (leg.stepping) {
          leg.stepT += dt / 0.24;
          const k = Math.min(1, leg.stepT);
          leg.foot.lerpVectors(leg.from, leg.to, k);
          leg.foot.y += Math.sin(k * Math.PI) * 0.38 * this.scale;
          if (k >= 1) {
            leg.stepping = false;
            if (moving > 0.5) this.game.fx?.smoke(leg.foot, { count: 1, size: 0.35, up: 0.3, life: 0.8, dark: 0.08 });
          }
        } else {
          const far = Math.hypot(leg.foot.x - home.x, leg.foot.z - home.z);
          const partnerUp = m.legs.some((o) => o !== leg && o.def.diag !== leg.def.diag && o.stepping);
          if (far > 0.75 * this.scale && !partnerUp) {
            leg.stepping = true;
            leg.stepT = 0;
            leg.from.copy(leg.foot);
            leg.to.copy(home);
          }
        }
      }
      // out from the body, for the knees to splay towards
      _v4.set(leg.hip.x - this.center.x, 0, leg.hip.z - this.center.z).normalize();
      solveKnee(leg.hip, leg.foot, SILVA.femur * this.scale, SILVA.tibia * this.scale, _v4, leg.kneePos);
      placeSegment(leg.femur, leg.hip, leg.kneePos);
      placeSegment(leg.tibia, leg.kneePos, leg.foot);
      placeSegment(leg.glow, leg.kneePos, leg.foot);
      leg.femur.scale.x = leg.femur.scale.z = this.scale;
      leg.tibia.scale.x = leg.tibia.scale.z = this.scale;
      leg.glow.scale.x = leg.glow.scale.z = 0.25 * this.scale;
      leg.knee.position.copy(leg.kneePos);
      leg.knee.scale.setScalar(this.scale);
      // the spike at the end, carrying on the line of the shin into the ground
      _seg.subVectors(leg.foot, leg.kneePos).normalize();
      leg.footMesh.position.copy(leg.foot);
      leg.footMesh.quaternion.setFromUnitVectors(Y, _seg.negate());
      leg.footMesh.scale.setScalar(this.scale);
    }
  }

  /** Small flames always coming off him, worse as he is hurt. */
  _ambientFire(dt) {
    const fx = this.game.fx;
    if (!fx || this.state === 'gone') return;
    const hurt = 1 - this.hp / this.maxHp;
    if (this.rng() < dt * (10 + hurt * 20)) {
      const s = this.rng() < 0.5 ? this.m.armL.shoulder : this.m.armR.shoulder;
      fx.fire(s.localToWorld(_v1.set(0, 0.06, 0)), { count: 1, size: 0.22 * this.scale, life: 0.5, up: 1.2 });
    }
    if (this.rng() < dt * 6) fx.fire(this.m.head.localToWorld(_v1.set(0, 0.36, 0.02)),
      { count: 1, size: 0.2 * this.scale, life: 0.45, up: 1.4 });
    if (this.rng() < dt * 8) fx.embers(this.center, { count: 1, spread: 0.6 });
  }

  /* -------------------------------- reset --------------------------------- */

  /** You died: he goes back where he started, healed, and waits a moment. */
  reset() {
    this._hideBeam();
    this._hideMarker();
    this.hp = this.maxHp;
    this.airborne = false;
    this.pos.copy(this.home);
    this.vel.set(0, 0, 0);
    this._plantFeet();
    this.cooldown = { fireball: 2.5, jump: 5, beam: 7 };
    this.recoverFor = 3;
    this._setState('recover');
    this.game.hud?.setBoss('SILVA', this.hp, this.maxHp);
  }

  dispose() {
    this.game.gore?.dropPartsOf(this);
    for (const o of [this.m.root, this.m.legGroup, this.light, this.marker, this.markerFill,
      this.beamCore, this.beamGlow]) o.removeFromParent();
    for (const g of [...this.m.geos, ...this.extraGeos]) g.dispose();
    for (const mat of Object.values(this.m.mats)) mat.dispose();
    for (const mat of [this.markerMat, this.markerFillMat, this.beamCoreMat, this.beamGlowMat]) mat.dispose();
  }
}
