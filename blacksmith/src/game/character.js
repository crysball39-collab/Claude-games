/* =============================================================================
   People and skeletons: one jointed rig, posed by hand every frame.

       root (on the ground, turned to face where it is going)
       └── hips
           ├── torso ─┬── neck ── head
           │          ├── shoulder L ── elbow L ── hand L
           │          ├── shoulder R ── elbow R ── hand R ── grip   (what you hold)
           │          └── back                                    (what you carry)
           ├── hip L ── knee L ── ankle L
           └── hip R ── knee R ── ankle R

   It faces +Z, so its right hand is on the -X side. Limbs hang down their
   joint's -Y; a negative turn about X swings a limb forward. Knees and
   elbows bend by a "flex" amount, and which way that turns is settled here
   and nowhere else.
   ========================================================================== */
import {
  Group, Mesh, BoxGeometry, MeshLambertMaterial, Color, Vector3, Matrix3, BufferGeometry, Float32BufferAttribute,
} from 'three';
import { clamp, clamp01, lerp, smoothstep, damp } from '../core/util.js';
import { faceTexture } from './textures.js';

/** Body proportions, in metres. */
export const BODY = {
  hipY: 0.915,
  pelvis: [0.4, 0.2, 0.25],
  waist: 0.04,
  torso: [0.46, 0.52, 0.26],
  neck: 0.05,
  head: 0.31,
  shoulderX: 0.3,
  shoulderDrop: 0.06,
  upperArm: 0.3, foreArm: 0.27, arm: 0.13,
  hipX: 0.11,
  thigh: 0.43, shin: 0.41, leg: 0.165,
  foot: [0.15, 0.075, 0.27],
};

const B = BODY;

/* ------------------------------- swing poses ------------------------------- */

/**
 * Upper-body key poses for each kind of swing, over t = 0..1. `shR`/`shL`
 * are shoulder turns [x, y, z], `elR`/`elL` elbow flex, `torso` the spine's
 * [lean forward, twist, tilt], `grip` the wrist's turn on what is held.
 * `hit` is the moment it lands.
 */
const REST = { shR: [-0.25, 0, -0.08], elR: 0.55, shL: [0.05, 0, 0.08], elL: 0.25, torso: [0, 0, 0], grip: 1.57 };
export const SWINGS = {
  // overhead and down: pickaxes, the smith's hammer
  chop: {
    hit: 0.52,
    keys: [
      [0, REST],
      [0.38, { shR: [-2.75, 0.1, -0.12], elR: 1.05, shL: [-2.4, 0, 0.35], elL: 1.0, torso: [-0.14, -0.18, 0], grip: 1.7 }],
      [0.55, { shR: [-0.85, 0, 0.05], elR: 0.15, shL: [-0.8, 0, 0.4], elL: 0.2, torso: [0.3, 0.06, 0], grip: 1.45 }],
      [1, REST],
    ],
  },
  // a diagonal cut from up on the right to down on the left
  slash: {
    hit: 0.5,
    keys: [
      [0, REST],
      [0.32, { shR: [-2.15, 0, -1.0], elR: 0.8, shL: [-0.2, 0, 0.25], elL: 0.4, torso: [-0.05, -0.55, 0.05], grip: 1.9 }],
      [0.58, { shR: [-0.95, 0, 0.75], elR: 0.15, shL: [0.25, 0, 0.1], elL: 0.3, torso: [0.18, 0.6, -0.05], grip: 1.2 }],
      [1, REST],
    ],
  },
  // a short, quick thrust
  stab: {
    hit: 0.45,
    keys: [
      [0, REST],
      [0.28, { shR: [-0.55, 0, -0.15], elR: 1.7, shL: [-0.3, 0, 0.2], elL: 0.6, torso: [0, -0.35, 0], grip: 2.6 }],
      [0.5, { shR: [-1.55, 0, 0.05], elR: 0.05, shL: [0.25, 0, 0.15], elL: 0.3, torso: [0.15, 0.3, 0], grip: 3.1 }],
      [1, REST],
    ],
  },
  // two hands, all the way over, and through
  heavy: {
    hit: 0.55,
    keys: [
      [0, REST],
      [0.42, { shR: [-2.9, 0, -0.35], elR: 1.1, shL: [-2.7, 0, 0.55], elL: 1.0, torso: [-0.2, -0.3, 0], grip: 1.75 }],
      [0.6, { shR: [-0.6, 0, 0.35], elR: 0.1, shL: [-0.55, 0, 0.6], elL: 0.15, torso: [0.42, 0.25, 0], grip: 1.35 }],
      [1, REST],
    ],
  },
  // the skeletons' overhand stab
  skel: {
    hit: 0.6,
    keys: [
      [0, REST],
      [0.5, { shR: [-2.6, 0, -0.3], elR: 1.2, shL: [0.3, 0, 0.3], elL: 0.4, torso: [-0.12, -0.3, 0], grip: 2.9 }],
      [0.68, { shR: [-1.1, 0, 0.1], elR: 0.2, shL: [0.3, 0, 0.2], elL: 0.3, torso: [0.32, 0.2, 0], grip: 3.0 }],
      [1, REST],
    ],
  },
  // a friendly wave
  wave: {
    hit: 1,
    keys: [
      [0, REST],
      [0.2, { shR: [-0.2, 0, -2.5], elR: 0.9, shL: REST.shL, elL: REST.elL, torso: [0, 0, 0.05], grip: 1.57 }],
      [0.4, { shR: [-0.2, 0, -2.5], elR: 0.3, shL: REST.shL, elL: REST.elL, torso: [0, 0, 0.05], grip: 1.57 }],
      [0.6, { shR: [-0.2, 0, -2.5], elR: 0.9, shL: REST.shL, elL: REST.elL, torso: [0, 0, 0.05], grip: 1.57 }],
      [0.8, { shR: [-0.2, 0, -2.5], elR: 0.3, shL: REST.shL, elL: REST.elL, torso: [0, 0, 0.05], grip: 1.57 }],
      [1, REST],
    ],
  },
};

function sampleSwing(kind, t, out) {
  const keys = SWINGS[kind].keys;
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const [ta, a] = keys[i], [tb, b] = keys[i + 1];
  const s = smoothstep((t - ta) / Math.max(1e-6, tb - ta));
  for (const k of ['shR', 'shL', 'torso']) {
    out[k][0] = lerp(a[k][0], b[k][0], s);
    out[k][1] = lerp(a[k][1], b[k][1], s);
    out[k][2] = lerp(a[k][2], b[k][2], s);
  }
  out.elR = lerp(a.elR, b.elR, s);
  out.elL = lerp(a.elL, b.elL, s);
  out.grip = lerp(a.grip, b.grip, s);
  return out;
}

/* ----------------------------------- rig ----------------------------------- */

const joint = (parent, x, y, z) => {
  const g = new Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
};

export class Rig {
  constructor() {
    this.root = new Group();
    const j = this.joints = {};
    j.hips = joint(this.root, 0, B.hipY, 0);
    j.torso = joint(j.hips, 0, B.waist, 0);
    const th = B.torso[1];
    j.neck = joint(j.torso, 0, th, 0);
    j.head = joint(j.neck, 0, B.neck, 0);
    j.shL = joint(j.torso, B.shoulderX, th - B.shoulderDrop, 0);
    j.elL = joint(j.shL, 0, -B.upperArm, 0);
    j.handL = joint(j.elL, 0, -B.foreArm, 0);
    j.shR = joint(j.torso, -B.shoulderX, th - B.shoulderDrop, 0);
    j.elR = joint(j.shR, 0, -B.upperArm, 0);
    j.handR = joint(j.elR, 0, -B.foreArm, 0);
    j.grip = joint(j.handR, 0, -0.06, 0.0);
    j.grip.rotation.x = REST.grip;
    j.back = joint(j.torso, 0, th * 0.62, -B.torso[2] / 2 - 0.05);
    j.hipL = joint(j.hips, B.hipX, 0, 0);
    j.kneeL = joint(j.hipL, 0, -B.thigh, 0);
    j.ankleL = joint(j.kneeL, 0, -B.shin, 0);
    j.hipR = joint(j.hips, -B.hipX, 0, 0);
    j.kneeR = joint(j.hipR, 0, -B.thigh, 0);
    j.ankleR = joint(j.kneeR, 0, -B.shin, 0);

    this.materials = [];         // the rig's own, for flashing when hit
    this.phase = 0;
    this.time = Math.random() * 10;
    this._swing = { shR: [0, 0, 0], shL: [0, 0, 0], torso: [0, 0, 0], elR: 0, elL: 0, grip: 0 };
    this._upper = 0;             // how much the swing owns the upper body
    this._flash = 0;
    this._flashColor = new Color(1, 0.15, 0.1);
    this.twoHanded = false;
  }

  /** A box on a joint, hung below it unless told otherwise. */
  box(jointName, w, h, d, mat, { x = 0, y = -h / 2, z = 0, shadow = true } = {}) {
    const m = new Mesh(new BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    this.joints[jointName].add(m);
    return m;
  }

  mat(color, opts = {}) {
    const m = new MeshLambertMaterial({ color, ...opts });
    this.materials.push(m);
    return m;
  }

  /** A red flash over the whole body. */
  flash(seconds = 0.14) { this._flash = Math.max(this._flash, seconds); }

  /**
   * Folds each joint's plain boxes into one mesh coloured per vertex, so a
   * body costs a draw call a joint rather than one a box. Textured, glowing
   * and multi-material parts stay as they are, and so does anything added
   * later - armour and whatever is in the hands.
   */
  bake() {
    let shared = null;
    const v = new Vector3(), nm = new Matrix3();
    for (const j of Object.values(this.joints)) {
      const list = j.children.filter((m) => m.isMesh && !Array.isArray(m.material) && this.materials.includes(m.material) &&
        !m.material.map && m.material.emissive.getHex() === 0);
      if (list.length < 2) continue;
      shared = shared || this.mat(0xffffff, { vertexColors: true });
      const pos = [], nor = [], col = [];
      for (const m of list) {
        m.updateMatrix();
        nm.getNormalMatrix(m.matrix);
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
        const p = g.attributes.position, n = g.attributes.normal, c = m.material.color;
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i).applyMatrix4(m.matrix);
          pos.push(v.x, v.y, v.z);
          v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
          nor.push(v.x, v.y, v.z);
          col.push(c.r, c.g, c.b);
        }
        if (g !== m.geometry) g.dispose();
        m.geometry.dispose();
        m.removeFromParent();
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new Float32BufferAttribute(nor, 3));
      geo.setAttribute('color', new Float32BufferAttribute(col, 3));
      const mesh = new Mesh(geo, shared);
      mesh.castShadow = true;
      j.add(mesh);
    }
    // let go of the materials nothing is drawn with any more
    const used = new Set();
    this.root.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) used.add(m); });
    this.materials = this.materials.filter((m) => used.has(m) || (m.dispose(), false));
    return this;
  }

  /**
   * Poses the rig for this frame.
   *  speed   metres a second over the ground
   *  swing   { kind, t } while swinging
   *  dash    0..1 through a dash, or 0
   *  hurt    0..1 recoil, fading
   *  dead    0..1 fallen
   *  look    head turn, radians
   */
  update(dt, { speed = 0, swing = null, dash = 0, hurt = 0, dead = 0, look = 0, lookUp = 0 } = {}) {
    const j = this.joints;
    this.time += dt;

    const walk = clamp01(speed / 1.4);
    const run = clamp01((speed - 4.8) / 2.2);
    const stride = lerp(1.55, 2.5, run);
    this.phase = (this.phase + dt * speed / stride * Math.PI * 2) % (Math.PI * 200);
    const ph = this.phase;
    const s = Math.sin(ph), c = Math.cos(ph);

    // legs
    const legA = walk * lerp(0.48, 0.82, run);
    const kneeA = walk * lerp(0.75, 1.45, run);
    const hipLx = -s * legA, hipRx = s * legA;
    const kneeL = Math.max(0, c) * kneeA + walk * 0.08;
    const kneeR = Math.max(0, -c) * kneeA + walk * 0.08;
    j.hipL.rotation.set(hipLx, 0, 0.02);
    j.hipR.rotation.set(hipRx, 0, -0.02);
    j.kneeL.rotation.x = kneeL;
    j.kneeR.rotation.x = kneeR;
    j.ankleL.rotation.x = -(hipLx + kneeL) * 0.6;
    j.ankleR.rotation.x = -(hipRx + kneeR) * 0.6;

    // the body rides up and down on them, and leans into a run
    const bob = walk * lerp(0.035, 0.075, run);
    const breathe = Math.sin(this.time * 1.7) * 0.012 * (1 - walk);
    j.hips.position.y = B.hipY - Math.abs(s) * bob + bob * 0.4 - (1 - Math.cos(legA * Math.abs(s))) * 0.25;
    j.hips.rotation.y = s * 0.1 * walk;
    let tx = run * 0.2 + walk * 0.04 + breathe;
    let ty = -s * 0.14 * walk;
    let tz = 0;

    // arms swing against the legs
    const armA = walk * lerp(0.42, 0.95, run);
    const elBase = 0.25 + run * 0.95;
    let shR = [-s * armA + REST.shR[0] * (1 - walk), 0, REST.shR[2]];
    let shL = [s * armA + REST.shL[0] * (1 - walk), 0, REST.shL[2]];
    let elR = lerp(REST.elR, elBase, walk), elL = lerp(REST.elL, elBase, walk);
    let grip = REST.grip;

    // a swing owns the upper body, eased in and out
    const want = swing ? 1 : 0;
    this._upper = damp(this._upper, want, swing ? 30 : 10, dt);
    if (swing) sampleSwing(swing.kind, clamp01(swing.t), this._swing);
    const w = this._upper;
    if (w > 0.001) {
      const p = this._swing;
      shR = [lerp(shR[0], p.shR[0], w), lerp(shR[1], p.shR[1], w), lerp(shR[2], p.shR[2], w)];
      elR = lerp(elR, p.elR, w);
      grip = lerp(grip, p.grip, w);
      // the left hand only joins in on two-handed swings; otherwise it keeps walking
      const lw = this.twoHanded || swing?.kind === 'chop' || swing?.kind === 'heavy' ? w : w * 0.4;
      shL = [lerp(shL[0], p.shL[0], lw), lerp(shL[1], p.shL[1], lw), lerp(shL[2], p.shL[2], lw)];
      elL = lerp(elL, p.elL, lw);
      tx = lerp(tx, p.torso[0] + run * 0.1, w);
      ty = lerp(ty, p.torso[1], w);
      tz = lerp(tz, p.torso[2], w);
    }

    // a dash is a low, fast lean with the arms thrown back
    if (dash > 0) {
      const d = Math.sin(clamp01(dash) * Math.PI);
      tx = lerp(tx, 0.55, d);
      shR[0] = lerp(shR[0], 0.9, d); shL[0] = lerp(shL[0], 0.9, d);
      j.hipL.rotation.x = lerp(j.hipL.rotation.x, -0.7, d);
      j.hipR.rotation.x = lerp(j.hipR.rotation.x, 0.5, d);
      j.kneeR.rotation.x = lerp(j.kneeR.rotation.x, 0.9, d);
    }
    if (hurt > 0) { tx -= 0.3 * hurt; shR[0] += 0.35 * hurt; shL[0] += 0.35 * hurt; }

    j.torso.rotation.set(tx, ty, tz);
    j.shR.rotation.set(shR[0], shR[1], shR[2]);
    j.shL.rotation.set(shL[0], shL[1], shL[2]);
    j.elR.rotation.x = -elR;
    j.elL.rotation.x = -elL;
    j.grip.rotation.x = grip;
    j.head.rotation.set(clamp(-tx * 0.6 - lookUp, -0.6, 0.5), clamp(look - ty, -1.1, 1.1), 0);

    // falling over: the whole body tips back about the feet
    if (dead > 0) {
      const f = smoothstep(dead);
      this.root.rotation.x = -f * Math.PI / 2;
      j.hips.position.y += f * 0.05;
      j.shR.rotation.z = lerp(j.shR.rotation.z, -1.3, f);
      j.shL.rotation.z = lerp(j.shL.rotation.z, 1.3, f);
      j.hipL.rotation.x = lerp(j.hipL.rotation.x, -0.2, f);
      j.hipR.rotation.x = lerp(j.hipR.rotation.x, 0.15, f);
    } else if (this.root.rotation.x !== 0) {
      this.root.rotation.x = 0;
    }

    if (this._flash > 0 || this._flashOn) {
      this._flash -= dt;
      const on = this._flash > 0;
      if (on !== this._flashOn) {
        this._flashOn = on;
        for (const m of this.materials) {
          if (!m.emissive) continue;
          if (on) { m.userData.em = m.userData.em || m.emissive.clone(); m.emissive.copy(this._flashColor); }
          else if (m.userData.em) m.emissive.copy(m.userData.em);
        }
      }
    }
  }

  dispose() {
    this.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    for (const m of this.materials) { m.map?.dispose(); m.dispose(); }
  }
}

/* -------------------------------- clothing --------------------------------- */

/**
 * Dresses a rig as a person. The head is a box with a face on the front;
 * everything else is a box of cloth or skin.
 */
export function dressHuman(rig, look = {}) {
  const {
    skin = '#e0ac7e', hair = '#3b2414', shirt = '#7b4a2e', sleeves = shirt, pants = '#4b3b2d',
    boots = '#2f241b', belt = '#2a1a0e', apron = null, face = 'smith', hat = null, beard = false,
  } = look;
  const skinM = rig.mat(skin);
  const shirtM = rig.mat(shirt);
  const sleeveM = sleeves === shirt ? shirtM : rig.mat(sleeves);
  const pantsM = rig.mat(pants);
  const bootM = rig.mat(boots);
  const hairM = rig.mat(hair);
  const faceM = rig.mat(0xffffff, { map: faceTexture(face, skin) });

  // pelvis and torso
  rig.box('hips', B.pelvis[0], B.pelvis[1], B.pelvis[2], pantsM, { y: -0.02 });
  rig.box('torso', B.torso[0], B.torso[1], B.torso[2], shirtM, { y: B.torso[1] / 2 });
  rig.box('torso', B.torso[0] + 0.02, 0.06, B.torso[2] + 0.02, rig.mat(belt), { y: 0.04 });
  if (apron) {
    const apM = rig.mat(apron);
    rig.box('torso', B.torso[0] * 0.8, B.torso[1] * 0.85, 0.03, apM, { y: B.torso[1] * 0.42, z: B.torso[2] / 2 + 0.016 });
    rig.box('hips', B.pelvis[0] * 0.75, 0.32, 0.03, apM, { y: -0.12, z: B.pelvis[2] / 2 + 0.02 });
  }
  // neck and head
  rig.box('neck', 0.13, B.neck + 0.04, 0.13, skinM, { y: B.neck / 2 });
  const h = B.head;
  const headMats = [skinM, skinM, hairM, skinM, faceM, hairM];
  const head = new Mesh(new BoxGeometry(h, h, h), headMats);
  head.position.y = h / 2;
  head.castShadow = true;
  rig.joints.head.add(head);
  rig.headMesh = head;
  // hair: a cap over the top and down the back
  rig.box('head', h + 0.03, 0.07, h + 0.03, hairM, { y: h + 0.01 });
  rig.box('head', h + 0.03, h * 0.6, 0.05, hairM, { y: h * 0.68, z: -h / 2 - 0.005 });
  if (beard) rig.box('head', h * 0.86, 0.12, 0.08, rig.mat('#a5582a'), { y: 0.03, z: h / 2 + 0.02 });
  if (hat === 'miner') {
    const hatM = rig.mat('#e3b23c');
    rig.box('head', h + 0.08, 0.1, h + 0.1, hatM, { y: h + 0.04 });
    rig.box('head', h + 0.16, 0.025, h + 0.2, hatM, { y: h + 0.005 });
    rig.box('head', 0.1, 0.08, 0.04, rig.mat('#ffffff', { emissive: '#fff2b0' }), { y: h + 0.05, z: h / 2 + 0.06 });
  }
  // arms
  for (const side of ['L', 'R']) {
    rig.box('sh' + side, B.arm, B.upperArm, B.arm, sleeveM);
    rig.box('el' + side, B.arm - 0.01, B.foreArm, B.arm - 0.01, skinM);
    rig.box('hand' + side, 0.11, 0.11, 0.11, skinM, { y: -0.05 });
  }
  // legs
  for (const side of ['L', 'R']) {
    rig.box('hip' + side, B.leg, B.thigh, B.leg + 0.01, pantsM);
    rig.box('knee' + side, B.leg - 0.01, B.shin, B.leg, pantsM);
    rig.box('knee' + side, B.leg + 0.01, 0.14, B.leg + 0.02, bootM, { y: -B.shin + 0.07 });
    rig.box('ankle' + side, B.foot[0], B.foot[1], B.foot[2], bootM, { y: -B.foot[1] / 2 + 0.005, z: 0.05 });
  }
  return rig;
}

/**
 * Dresses a rig as a skeleton: thin bones where a person has limbs, a
 * ribcage, a skull with something red living in its eyes.
 */
export function dressSkeleton(rig) {
  const bone = rig.mat('#e6dcc4');
  const dark = rig.mat('#b9ab8c');
  const skull = rig.mat(0xffffff, { map: faceTexture('skull') });
  // pelvis and spine
  rig.box('hips', 0.3, 0.12, 0.16, bone, { y: -0.02 });
  rig.box('torso', 0.07, B.torso[1], 0.07, dark, { y: B.torso[1] / 2, z: -0.06 });
  // ribs
  for (let i = 0; i < 4; i++) {
    const y = B.torso[1] * (0.38 + i * 0.15);
    const w = 0.36 - Math.abs(i - 1.5) * 0.04;
    rig.box('torso', w, 0.045, 0.2, bone, { y, z: 0.0 });
  }
  rig.box('torso', 0.06, B.torso[1] * 0.5, 0.04, bone, { y: B.torso[1] * 0.62, z: 0.1 });
  rig.box('torso', 0.42, 0.06, 0.12, bone, { y: B.torso[1] - 0.04 });
  rig.box('neck', 0.06, B.neck + 0.05, 0.06, dark, { y: B.neck / 2 });
  // the skull
  const h = B.head * 0.95;
  const head = new Mesh(new BoxGeometry(h, h, h), [bone, bone, bone, bone, skull, bone]);
  head.position.y = h / 2;
  head.castShadow = true;
  rig.joints.head.add(head);
  rig.headMesh = head;
  rig.box('head', h * 0.8, 0.07, h * 0.6, bone, { y: 0.02, z: 0.04 });
  // the eyes glow even when the torches do not reach
  const glow = rig.mat('#ff3a1a', { emissive: '#ff2a00' });
  for (const x of [-0.07, 0.07]) rig.box('head', 0.045, 0.035, 0.01, glow, { y: h * 0.57, z: h / 2 + 0.006, shadow: false });
  rig.eyeMat = glow;
  // limbs: bones with knobbly ends
  for (const side of ['L', 'R']) {
    rig.box('sh' + side, 0.06, B.upperArm, 0.06, bone);
    rig.box('sh' + side, 0.09, 0.07, 0.09, dark, { y: -0.02 });
    rig.box('el' + side, 0.055, B.foreArm, 0.055, bone);
    rig.box('hand' + side, 0.08, 0.09, 0.05, bone, { y: -0.04 });
    rig.box('hip' + side, 0.07, B.thigh, 0.07, bone);
    rig.box('knee' + side, 0.09, 0.08, 0.09, dark, { y: 0.0 });
    rig.box('knee' + side, 0.06, B.shin, 0.06, bone);
    rig.box('ankle' + side, 0.1, 0.05, 0.22, bone, { y: -0.03, z: 0.04 });
  }
  return rig;
}
