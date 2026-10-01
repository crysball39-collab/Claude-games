/* =============================================================================
   Wearable protection.

   Armour is not a weapon and it is not a garment: it is a shell strapped over
   part of the body that soaks damage until it has nothing left, and then
   stops. It lives here, apart from the body, because a body is built once
   from an appearance and armour comes and goes.

   Each piece fills one slot - the torso, the neck or the head - so a person
   can wear a vest, a collar and a helmet at once, and a second vest replaces
   the first rather than going on over it.

   The same object does two jobs:
     - as a loose item lying on the ground, waiting to be picked up
     - as something a character is wearing, riding the bones it covers
   and the model is the same one either way, so the vest you pick up is the
   vest you are wearing, wear and all.
   ========================================================================== */
import {
  Group, Mesh, MeshLambertMaterial, BoxGeometry, CylinderGeometry, TorusGeometry,
  Vector3, DoubleSide,
} from 'three';
import { RigidBody } from '../physics/rigid.js';
import { clamp01 } from '../core/util.js';

const _v = new Vector3();

/* -------------------------------------------------------------------------- */
/*                                 the pieces                                 */
/* -------------------------------------------------------------------------- */

/**
 * Everything that can be worn. `cover` is which bones a piece protects and
 * how much of a hit landing there it takes; `soak` is how much of a covered
 * hit it takes on itself while it still has hp - nothing stops all of it.
 * `half` is the size of the loose item's collider.
 */
export const ARMOUR = {
  vest: {
    id: 'vest', label: 'Light Vest', slot: 'torso',
    /** A sledgehammer gets through in two; fists take most of a minute. */
    hp: 90, soak: 0.9, mass: 3.4,
    cover: { upperTorso: 1, midTorso: 1, lowerTorso: 0.45 },
    half: new Vector3(0.205, 0.21, 0.15),
    bone: 'upperTorso', offset: [0, 0.052, 0],
    build: () => createVestModel(),
  },
  mvest: {
    id: 'mvest', label: 'Medium Vest', slot: 'torso',
    /* Twice the light vest, and all of the torso down to the hips: plates
       front and back, a cummerbund round the belly and a groin flap. */
    hp: 180, soak: 0.93, mass: 7.2,
    cover: { upperTorso: 1, midTorso: 1, lowerTorso: 1, pelvis: 1 },
    half: new Vector3(0.215, 0.32, 0.16),
    build: () => createMediumVestModel(),
  },
  neckguard: {
    id: 'neckguard', label: 'Light Neck Armour', slot: 'neck',
    hp: 40, soak: 0.85, mass: 0.9,
    cover: { neck: 1 },
    half: new Vector3(0.11, 0.05, 0.11),
    bone: 'neck', offset: [0, 0.040, 0],
    build: () => createNeckguardModel(),
  },
  helmet: {
    id: 'helmet', label: 'Light Helmet', slot: 'head',
    /* It covers the crown, the sides and the back of the skull. The face is
       open, which is why it only takes most of what lands on the head. */
    hp: 60, soak: 0.85, mass: 1.3,
    cover: { head: 0.8 },
    half: new Vector3(0.135, 0.09, 0.14),
    bone: 'head', offset: [0, 0.115, 0],
    hidesHair: true,
    build: () => createHelmetModel(),
  },
};

/** Kept for what was written before there was more than one vest. */
export const VEST = ARMOUR.vest;
export const VEST_COVER = VEST.cover;

/** The slots, in the order USE takes things off when nothing is in reach. */
export const SLOTS = ['head', 'neck', 'torso'];

/* -------------------------------------------------------------------------- */
/*                                 the models                                 */
/* -------------------------------------------------------------------------- */

function adder(g) {
  return (mat, w, h, d, x, y, z, rx = 0) => {
    const m = new Mesh(new BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.castShadow = true;
    g.add(m);
    return m;
  };
}

function finish(g, mats, shell, trim) {
  g.matrixAutoUpdate = false;
  g.userData.materials = mats;
  g.userData.shellMat = shell;
  g.userData.trimMat = trim;
  /* The colours it started life with. Wear dims the materials in place, and
     armour can be taken off and put back on, so the clean values have to live
     with the model rather than with whoever happens to be wearing it - or
     every cycle would darken it again from wherever it had got to. */
  g.userData.baseShell = shell.color.clone();
  g.userData.baseTrim = trim.color.clone();
  return g;
}

/**
 * Built in its own space: origin at the middle of the chest panel, +Y up,
 * -Z forward. Worn, that origin is pinned to the middle of the upper torso.
 */
export function createVestModel() {
  const g = new Group();
  /* Black, but not one black: a vest that is all one value over a dark shirt
     is a smudge, so the panels, the webbing and the hardware are each their
     own. */
  const shell = new MeshLambertMaterial({ color: 0x1d2025 });
  const trim = new MeshLambertMaterial({ color: 0x383e46 });
  const strap = new MeshLambertMaterial({ color: 0x0e1013 });
  const buckle = new MeshLambertMaterial({ color: 0x767d87 });
  const add = adder(g);

  /* Front and back panels, with an air gap between them: that is what makes
     it read as something strapped on rather than a thicker shirt. They have
     to clear the shirt underneath, which is why they are wider than a chest
     and stand off it in Z. */
  g.userData.front = add(shell, 0.392, 0.310, 0.036, 0, 0, -0.122);     // chest
  add(shell, 0.392, 0.310, 0.032, 0, 0, 0.119);      // back
  // the seam down the front, and the panel edges
  add(trim, 0.022, 0.310, 0.040, 0, 0, -0.126);
  for (const sx of [-1, 1]) {
    add(trim, 0.024, 0.314, 0.040, sx * 0.185, 0, -0.122);
    add(trim, 0.024, 0.314, 0.036, sx * 0.185, 0, 0.119);
  }
  // two rows of webbing across the front, the way a carrier is laid out
  for (const y of [0.070, -0.010, -0.090]) {
    add(strap, 0.330, 0.016, 0.014, 0, y, -0.142);
  }
  // shoulder straps over the top, joining the two panels
  for (const sx of [-1, 1]) {
    add(strap, 0.078, 0.030, 0.258, sx * 0.128, 0.158, -0.002);
    add(buckle, 0.058, 0.022, 0.032, sx * 0.128, 0.152, -0.112);
  }
  /* Side panels, pulled in under the arms. They have to reach nearly the
     full height of the vest or the shirt shows through the gap between the
     front and back plates, which is what you see when you look at someone
     from the side. */
  for (const sx of [-1, 1]) {
    add(strap, 0.028, 0.252, 0.234, sx * 0.196, -0.018, -0.002);
    add(buckle, 0.032, 0.038, 0.024, sx * 0.199, -0.060, -0.104);
    add(buckle, 0.032, 0.038, 0.024, sx * 0.199, 0.040, -0.104);
  }
  // a collar lip at the throat and a skirt at the waist
  add(trim, 0.214, 0.032, 0.036, 0, 0.169, -0.122);
  add(shell, 0.352, 0.078, 0.034, 0, -0.186, -0.116);
  add(shell, 0.352, 0.078, 0.030, 0, -0.186, 0.116);
  return finish(g, [shell, trim, strap, buckle], shell, trim);
}

/**
 * The medium vest is two rigid pieces, because it covers a body that bends
 * at the waist: a plate carrier riding the chest, and a cummerbund with a
 * groin flap riding the hips. Lying loose they sit one above the other, the
 * way it would hang off a hook; worn, each follows its own bone.
 */
export function createMediumVestModel() {
  const g = new Group();
  const shell = new MeshLambertMaterial({ color: 0x5b6644 });   // olive drab
  const trim = new MeshLambertMaterial({ color: 0x7c8762 });
  const strap = new MeshLambertMaterial({ color: 0x2e3426 });
  const pouch = new MeshLambertMaterial({ color: 0x6a7552 });
  const buckle = new MeshLambertMaterial({ color: 0x80868c });

  /* ---- the carrier: chest down over the stomach ---- */
  const top = new Group();
  const add = adder(top);
  top.userData.front = add(shell, 0.410, 0.400, 0.046, 0, -0.030, -0.128);   // front plate
  add(shell, 0.410, 0.400, 0.040, 0, -0.030, 0.126);                       // back plate
  add(trim, 0.024, 0.400, 0.050, 0, -0.030, -0.131);
  for (const sx of [-1, 1]) {
    add(trim, 0.026, 0.404, 0.050, sx * 0.193, -0.030, -0.128);
    add(trim, 0.026, 0.404, 0.044, sx * 0.193, -0.030, 0.126);
    // shoulder straps, wider and padded
    add(strap, 0.092, 0.040, 0.270, sx * 0.124, 0.168, -0.002);
    add(buckle, 0.062, 0.026, 0.036, sx * 0.124, 0.160, -0.118);
    // side plates, full height under the arms
    add(shell, 0.034, 0.330, 0.244, sx * 0.204, -0.055, -0.002);
  }
  // magazine pouches across the front, and a radio pouch high on one side
  for (const x of [-0.105, -0.035, 0.035, 0.105]) {
    add(pouch, 0.062, 0.088, 0.036, x, -0.090, -0.164);
    add(strap, 0.062, 0.014, 0.040, x, -0.052, -0.165);
  }
  add(pouch, 0.070, 0.070, 0.034, 0.110, 0.080, -0.162);
  // the high collar that meets the neck armour
  add(trim, 0.240, 0.040, 0.046, 0, 0.180, -0.128);
  add(trim, 0.300, 0.040, 0.040, 0, 0.180, 0.126);
  top.position.set(0, 0.12, 0);
  top.userData.mount = { bone: 'upperTorso', offset: [0, 0.046, 0] };

  /* ---- the cummerbund and the groin flap ---- */
  const low = new Group();
  const addL = adder(low);
  addL(shell, 0.380, 0.150, 0.040, 0, 0.140, -0.128);   // belly
  addL(shell, 0.380, 0.150, 0.036, 0, 0.140, 0.124);    // back
  for (const sx of [-1, 1]) addL(shell, 0.034, 0.150, 0.250, sx * 0.188, 0.140, -0.002);
  // a war belt round it, with its buckle
  addL(strap, 0.392, 0.040, 0.046, 0, 0.055, -0.131);
  addL(strap, 0.392, 0.040, 0.040, 0, 0.055, 0.127);
  for (const sx of [-1, 1]) addL(strap, 0.040, 0.040, 0.262, sx * 0.194, 0.055, -0.002);
  addL(buckle, 0.060, 0.034, 0.010, 0, 0.055, -0.156);
  // the flap hanging over the groin, tilted out a little the way it sits
  addL(shell, 0.180, 0.150, 0.030, 0, -0.035, -0.132, 0.10);
  addL(trim, 0.180, 0.020, 0.034, 0, 0.034, -0.138);
  low.position.set(0, -0.17, 0);
  low.userData.mount = { bone: 'pelvis', offset: [0, 0, 0] };

  for (const part of [top, low]) {
    part.userData.restPos = part.position.clone();
    part.userData.restQuat = part.quaternion.clone();
    g.add(part);
  }
  g.userData.parts = [top, low];
  g.userData.front = top.userData.front;
  return finish(g, [shell, trim, strap, pouch, buckle], shell, trim);
}

/**
 * A collar: a stiff ring round the throat, higher at the front where the
 * throat is, with a padded lip on top. Origin at the middle of the neck.
 */
export function createNeckguardModel() {
  const g = new Group();
  const shell = new MeshLambertMaterial({ color: 0x3a4049, side: DoubleSide });
  const trim = new MeshLambertMaterial({ color: 0x59616c });
  const ring = new Mesh(new CylinderGeometry(0.092, 0.104, 0.080, 16, 1, true), shell);
  ring.castShadow = true;
  g.add(ring);
  const lip = new Mesh(new TorusGeometry(0.093, 0.010, 6, 18), trim);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.040;
  g.add(lip);
  const base = new Mesh(new TorusGeometry(0.104, 0.008, 6, 18), trim);
  base.rotation.x = Math.PI / 2;
  base.position.y = -0.040;
  g.add(base);
  // the throat plate rides up the front, where it matters most
  const add = adder(g);
  add(shell, 0.110, 0.040, 0.016, 0, 0.056, -0.094, -0.12);
  // and the fastening down one side
  add(trim, 0.014, 0.070, 0.024, 0.100, 0, 0);
  return finish(g, [shell, trim], shell, trim);
}

/**
 * A light helmet over a head that is a box: a shell over the crown that
 * comes down the sides and further down the back, a short brim over the
 * eyes, rails along the sides and a chin strap. The face stays open.
 * Origin at the middle of the head.
 */
export function createHelmetModel() {
  const g = new Group();
  // coyote tan, so it reads as a helmet and not as hair
  const shell = new MeshLambertMaterial({ color: 0x8c7b57 });
  const trim = new MeshLambertMaterial({ color: 0x5e533b });
  const strap = new MeshLambertMaterial({ color: 0x1c1d1f });
  const add = adder(g);
  const W = 0.252, D = 0.264;            // stands well off the head box
  // the crown, stepped in three tiers so it reads as a dome
  add(shell, W, 0.050, D, 0, 0.128, 0.004);
  add(shell, W - 0.040, 0.026, D - 0.040, 0, 0.165, 0.004);
  add(shell, W - 0.100, 0.016, D - 0.100, 0, 0.184, 0.006);
  for (const sx of [-1, 1]) {
    add(shell, 0.026, 0.120, D, sx * (W / 2 - 0.013), 0.060, 0.004);   // sides, to the ears
    add(trim, 0.012, 0.026, D * 0.80, sx * (W / 2 + 0.005), 0.072, 0.010);  // rails
    // the chin strap down past the cheek and under the jaw
    add(strap, 0.010, 0.122, 0.016, sx * 0.110, -0.042, -0.010);
  }
  add(strap, 0.220, 0.010, 0.016, 0, -0.102, -0.030);
  add(shell, W, 0.150, 0.026, 0, 0.040, D / 2 - 0.009);     // back, down to the nape
  add(shell, W, 0.040, 0.026, 0, 0.100, -D / 2 + 0.008);    // front, over the brow
  add(trim, W * 0.92, 0.012, 0.040, 0, 0.082, -D / 2 - 0.004);  // the brim's edge
  // a mount plate on the front, the one detail that says "helmet" at a glance
  add(strap, 0.060, 0.038, 0.012, 0, 0.132, -D / 2 - 0.006);
  return finish(g, [shell, trim, strap], shell, trim);
}

/* -------------------------------------------------------------------------- */
/*                               lying on the ground                          */
/* -------------------------------------------------------------------------- */

/** Puts every part of a multi-part model back where it hangs when loose. */
function restParts(model) {
  for (const part of model.userData.parts || []) {
    part.position.copy(part.userData.restPos);
    part.quaternion.copy(part.userData.restQuat);
    part.updateMatrix();
  }
}

/** Drops a piece of armour on the ground, ready to be picked up. */
export function spawnArmour(game, kind, position, { quat = null, reuse = null } = {}) {
  const spec = ARMOUR[kind];
  const body = new RigidBody({
    shape: 'box',
    half: spec.half.clone(),
    mass: spec.mass,
    pos: position.clone(),
    friction: 0.9,
    restitution: 0.02,
    linDamp: 0.4,
    angDamp: 0.8,
    tag: kind,
  });
  if (quat) body.quat.copy(quat);
  body.updateDerived();

  const mesh = reuse?.model || spec.build();
  restParts(mesh);
  mesh.userData.bodyOffset = null;
  mesh.matrixAutoUpdate = false;
  mesh.visible = true;
  body.mesh = mesh;
  body.userData.label = spec.label;
  body.userData.grabbable = true;
  /* Not `pickup`: this one is worn, not carried, and the two go through
     different doors. */
  body.userData.wear = kind;
  body.userData.armourHp = reuse?.hp ?? spec.hp;
  body.userData.material = mesh.userData.shellMat;
  if (!mesh.parent) game.scene.add(mesh);
  game.world.addBody(body);
  game.trackSpawn(body);
  return body;
}

/** The light vest, as it always was. */
export function spawnVest(game, position, opts = {}) {
  return spawnArmour(game, 'vest', position, opts);
}

/* -------------------------------------------------------------------------- */
/*                                being worn                                  */
/* -------------------------------------------------------------------------- */

export class Armour {
  /**
   * @param {Group} model  the piece's own mesh, reused from the loose item
   * @param {number} hp    how much it has left in it
   * @param {string} kind  which piece it is
   */
  constructor(model, hp = null, kind = 'vest') {
    const spec = ARMOUR[kind];
    this.spec = spec;
    this.kind = kind;
    this.slot = spec.slot;
    this.label = spec.label;
    this.model = model;
    this.maxHp = spec.hp;
    this.hp = hp ?? spec.hp;
    this.spent = this.hp <= 0;
    this.shellMat = model.userData.shellMat;
    this.trimMat = model.userData.trimMat;
    this._baseShell = model.userData.baseShell || this.shellMat.color.clone();
    this._baseTrim = model.userData.baseTrim || this.trimMat.color.clone();
    this._paint();
  }

  get fraction() { return clamp01(this.hp / this.maxHp); }

  /** True if this piece covers that bone at all. */
  covers(boneName) { return !!this.spec.cover[boneName]; }

  /**
   * Takes a hit meant for the wearer.
   * @returns {number} how much damage is left to get through to them.
   */
  absorb(amount, boneName) {
    const cover = this.spec.cover[boneName] || 0;
    if (!cover || this.spent || amount <= 0) return amount;
    /* Nothing is stopped completely: what the plate does not take, the body
       still feels. That is what the last tenth is for. */
    const offered = amount * cover * this.spec.soak;
    const taken = Math.min(this.hp, offered);
    this.hp -= taken;
    if (this.hp <= 0.001) { this.hp = 0; this.spent = true; }
    this._paint();
    return amount - taken;
  }

  /** It darkens and goes dull as it is beaten in, then hangs open. */
  _paint() {
    const f = this.fraction;
    this.shellMat.color.copy(this._baseShell).multiplyScalar(0.55 + f * 0.45);
    this.trimMat.color.copy(this._baseTrim).multiplyScalar(0.5 + f * 0.5);
    // a spent vest's front panel swings off its straps
    const front = this.model.userData.front;
    if (front) {
      if (front.userData.y0 == null) front.userData.y0 = front.position.y;
      front.rotation.x = this.spent ? -0.42 : 0;
      front.position.y = front.userData.y0 + (this.spent ? -0.055 : 0);
    }
  }

  repair() {
    this.hp = this.maxHp;
    this.spent = false;
    this._paint();
  }

  /**
   * Follows the body. Each rigid piece rides one bone - a real plate does not
   * fold - and a piece that spans the waist is two pieces, one each side.
   */
  sync(rig) {
    const parts = this.model.userData.parts;
    if (parts) {
      // the model itself stays at the origin; the parts are placed in the world
      this.model.position.set(0, 0, 0);
      this.model.quaternion.identity();
      this.model.updateMatrix();
      for (const part of parts) {
        const m = part.userData.mount;
        const bone = rig.byName[m.bone];
        if (!bone) continue;
        part.position.fromArray(m.offset).applyQuaternion(bone.worldQuat).add(bone.worldPos);
        part.quaternion.copy(bone.worldQuat);
        part.updateMatrix();
      }
      return;
    }
    const bone = rig.byName[this.spec.bone];
    if (!bone) return;
    _v.fromArray(this.spec.offset).applyQuaternion(bone.worldQuat).add(bone.worldPos);
    this.model.position.copy(_v);
    this.model.quaternion.copy(bone.worldQuat);
    this.model.updateMatrix();
  }

  dispose() {
    this.model.removeFromParent();
    for (const m of this.model.userData.materials || []) m.dispose();
  }
}
