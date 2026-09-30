/* =============================================================================
   Wearable protection.

   A vest is not a weapon and it is not a garment: it is a shell strapped over
   the torso that soaks damage until it has nothing left, and then stops. It
   lives here, apart from the body, because a body is built once from an
   appearance and a vest comes and goes.

   The same object does two jobs:
     - as a loose item lying on the ground, waiting to be picked up
     - as something a character is wearing, riding the chest
   and the model is the same one either way, so the vest you pick up is the
   vest you are wearing, wear and all.
   ========================================================================== */
import { Group, Mesh, MeshLambertMaterial, BoxGeometry, Vector3 } from 'three';
import { RigidBody } from '../physics/rigid.js';
import { clamp01 } from '../core/util.js';

const _v = new Vector3();

/** Which bones the vest covers, and how much of a hit it takes for each. */
export const VEST_COVER = { upperTorso: 1, midTorso: 1, lowerTorso: 0.45 };

export const VEST = {
  id: 'vest',
  label: 'Light Vest',
  /** Total damage it will absorb before it is no use. A sledgehammer gets
      through in two; fists take most of a minute. */
  hp: 90,
  /** How much of a covered hit it takes on itself while it still has hp. */
  soak: 0.9,
  mass: 3.4,
  half: new Vector3(0.205, 0.21, 0.15),
};

/* -------------------------------------------------------------------------- */
/*                                  the model                                 */
/* -------------------------------------------------------------------------- */

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

  const add = (mat, w, h, d, x, y, z) => {
    const m = new Mesh(new BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };

  /* Front and back panels, with an air gap between them: that is what makes
     it read as something strapped on rather than a thicker shirt. They have
     to clear the shirt underneath, which is why they are wider than a chest
     and stand off it in Z. */
  add(shell, 0.392, 0.310, 0.036, 0, 0, -0.122);     // chest
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

  g.matrixAutoUpdate = false;
  g.userData.materials = [shell, trim, strap, buckle];
  g.userData.shellMat = shell;
  g.userData.trimMat = trim;
  /* The colours it started life with. Wear dims the materials in place, and
     a vest can be taken off and put back on, so the clean values have to live
     with the model rather than with whoever happens to be wearing it - or
     every cycle would darken it again from wherever it had got to. */
  g.userData.baseShell = shell.color.clone();
  g.userData.baseTrim = trim.color.clone();
  return g;
}

/** Drops a vest on the ground, ready to be picked up. */
export function spawnVest(game, position, { quat = null, reuse = null } = {}) {
  const body = new RigidBody({
    shape: 'box',
    half: VEST.half.clone(),
    mass: VEST.mass,
    pos: position.clone(),
    friction: 0.9,
    restitution: 0.02,
    linDamp: 0.4,
    angDamp: 0.8,
    tag: 'vest',
  });
  if (quat) body.quat.copy(quat);
  body.updateDerived();

  const mesh = reuse?.model || createVestModel();
  mesh.userData.bodyOffset = null;
  mesh.matrixAutoUpdate = false;
  mesh.visible = true;
  body.mesh = mesh;
  body.userData.label = VEST.label;
  body.userData.grabbable = true;
  /* Not `pickup`: this one is worn, not carried, and the two go through
     different doors. */
  body.userData.wear = 'vest';
  body.userData.armourHp = reuse?.hp ?? VEST.hp;
  body.userData.material = mesh.userData.shellMat;
  if (!mesh.parent) game.scene.add(mesh);
  game.world.addBody(body);
  game.trackSpawn(body);
  return body;
}

/* -------------------------------------------------------------------------- */
/*                                being worn                                  */
/* -------------------------------------------------------------------------- */

export class Armour {
  /**
   * @param {Group} model  the vest's own mesh, reused from the loose item
   * @param {number} hp    how much it has left in it
   */
  constructor(model, hp = VEST.hp) {
    this.kind = 'vest';
    this.label = VEST.label;
    this.model = model;
    this.maxHp = VEST.hp;
    this.hp = hp;
    this.spent = hp <= 0;
    this.shellMat = model.userData.shellMat;
    this.trimMat = model.userData.trimMat;
    this._baseShell = model.userData.baseShell || this.shellMat.color.clone();
    this._baseTrim = model.userData.baseTrim || this.trimMat.color.clone();
    this._paint();
  }

  get fraction() { return clamp01(this.hp / this.maxHp); }

  /** True if this vest covers that bone at all. */
  covers(boneName) { return !!VEST_COVER[boneName]; }

  /**
   * Takes a hit meant for the wearer.
   * @returns {number} how much damage is left to get through to them.
   */
  absorb(amount, boneName) {
    const cover = VEST_COVER[boneName] || 0;
    if (!cover || this.spent || amount <= 0) return amount;
    /* Nothing is stopped completely: what the plate does not take, the body
       still feels. That is what the last tenth is for. */
    const offered = amount * cover * VEST.soak;
    const taken = Math.min(this.hp, offered);
    this.hp -= taken;
    if (this.hp <= 0.001) { this.hp = 0; this.spent = true; }
    this._paint();
    return amount - taken;
  }

  /** The vest darkens and goes dull as it is beaten in, then splits. */
  _paint() {
    const f = this.fraction;
    this.shellMat.color.copy(this._baseShell).multiplyScalar(0.55 + f * 0.45);
    this.trimMat.color.copy(this._baseTrim).multiplyScalar(0.5 + f * 0.5);
    // a spent vest hangs open: the front panel swings off its straps
    const front = this.model.children[0];
    front.rotation.x = this.spent ? -0.42 : 0;
    front.position.y = this.spent ? -0.055 : 0;
    front.updateMatrix?.();
  }

  repair() {
    this.hp = this.maxHp;
    this.spent = false;
    this._paint();
  }

  /**
   * Follows the chest. The vest is rigid, so it rides one bone rather than
   * being split between two - a real vest does not fold at the waist either.
   */
  sync(rig) {
    const bone = rig.byName.upperTorso;
    if (!bone) return;
    _v.set(0, 0.052, 0).applyQuaternion(bone.worldQuat).add(bone.worldPos);
    this.model.position.copy(_v);
    this.model.quaternion.copy(bone.worldQuat);
    this.model.updateMatrix();
  }

  dispose() {
    this.model.removeFromParent();
    for (const m of this.model.userData.materials || []) m.dispose();
  }
}
