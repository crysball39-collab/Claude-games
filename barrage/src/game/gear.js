/* =============================================================================
   Gear: what the Stall sells, and the things people hold.

   ITEMS is the catalogue. Every item has a slot it goes in - the WEAPON slot
   or the OFFHAND slot for now. The helmet, chestplate, leggings, boots and
   the two accessory slots exist in the inventory but nothing fits them yet.

   A held thing is one rigid box welded to a hand: kinematic while it is
   held, so it shoves whatever it swings into, and an ordinary falling box
   once it is dropped. Each has its own paint canvas, so blood lands on the
   blade exactly where it touched. A sword sits in the right fist the way
   OVERGROWTH's did. A shield and a pistol are fitted to the hand by working
   out, once, where the hand is in the pose that matters - the shield raised
   to block, the pistol held out to aim - and fixing them there so that in
   that pose the shield faces straight ahead and the barrel points at the
   target.
   ========================================================================== */
import { Vector3, Quaternion, Mesh, MeshLambertMaterial, BoxGeometry, Group } from 'three';
import { Body } from '../physics/world.js';
import { packBoxes, buildBoxGeometry, PaintCanvas, FACE } from './paint.js';
import { P, NP, PARTS, forwardKinematics } from './rig.js';
import {
  makePose, makeQuats, poseQuats, copyPose, blendParts, SWING_R, IDLE, SHIELD_BLOCK, AIM, UPPER, AIM_PARTS,
} from './anim.js';
import { shade, rng } from '../core/util.js';

const D = Math.PI / 180;

/* -------------------------------------------------------------------------- */
/*                                 catalogue                                  */
/* -------------------------------------------------------------------------- */

export const ITEMS = {
  wooden_sword: {
    id: 'wooden_sword', name: 'Wooden Sword', slot: 'weapon', price: 10, sell: 5,
    blurb: 'Hard oak, shaped like a sword. It bruises, and splits the skin when it lands hard.',
    hit: 'wood', strikeMass: 2.4, damageBase: 6, damage: 1.6, rate: 1.15, cost: 8,
    size: [0.07, 0.034, 0.9], grip: 0.11,
    stats: [['Damage', 2], ['Speed', 4], ['Reach', 3]], marks: 'Bruises, splits',
  },
  rusty_sword: {
    id: 'rusty_sword', name: 'Rusty Steel Sword', slot: 'weapon', price: 50, sell: 25,
    blurb: 'Pitted and notched, but it is steel. It cuts, and a full swing opens a slash.',
    hit: 'blade', strikeMass: 2.9, damageBase: 9, damage: 2.2, rate: 1.0, cost: 10,
    size: [0.062, 0.018, 1.0], grip: 0.12,
    stats: [['Damage', 4], ['Speed', 3], ['Reach', 4]], marks: 'Cuts, slashes',
  },
  wood_shield: {
    id: 'wood_shield', name: 'Wood Shield', slot: 'offhand', price: 10, sell: 5,
    blurb: 'Oak planks, an iron rim and boss. Hold BLOCK to raise it: it stops fists, blades and bullets that come from the front.',
    block: 0.92, size: [0.5, 0.58, 0.045],
    stats: [['Block', 4], ['Weight', 2]], marks: 'Stops bullets',
  },
};

/** The order the Stall shows them in. */
export const STOCK = ['wooden_sword', 'rusty_sword', 'wood_shield'];

/** Equipment slots, in the order the inventory lays them out. */
export const SLOTS = [
  { id: 'helmet', name: 'Helmet', accepts: null },
  { id: 'chest', name: 'Chestplate', accepts: null },
  { id: 'legs', name: 'Leggings', accepts: null },
  { id: 'boots', name: 'Boots', accepts: null },
  { id: 'weapon', name: 'Weapon', accepts: 'weapon' },
  { id: 'offhand', name: 'Offhand', accepts: 'offhand' },
  { id: 'acc1', name: 'Accessory', accepts: null },
  { id: 'acc2', name: 'Accessory', accepts: null },
];
export const SLOT = Object.fromEntries(SLOTS.map((s) => [s.id, s]));

/** Not sold anywhere: what the gunners carry. */
const PISTOL = { id: 'pistol', name: 'Pistol', size: [0.034, 0.05, 0.2] };

/* -------------------------------------------------------------------------- */
/*                                  fitting                                   */
/* -------------------------------------------------------------------------- */

const _pos = PARTS.map(() => new Vector3()), _quat = PARTS.map(() => new Quaternion());

/** Where `part` is, in body space, when the body holds `pose`. */
function partIn(pose, part) {
  const q = makeQuats();
  poseQuats(pose, q);
  forwardKinematics(new Vector3(), new Quaternion(), pose.off, q, _pos, _quat);
  return { pos: _pos[part].clone(), quat: _quat[part].clone() };
}

/** The fixed offset from a part that puts a thing at wantPos/wantQuat when the body holds `pose`. */
function fitTo(pose, part, wantPos, wantQuat) {
  const at = partIn(pose, part);
  const inv = at.quat.clone().invert();
  return {
    pos: wantPos.clone().sub(at.pos).applyQuaternion(inv),
    quat: inv.multiply(wantQuat),
  };
}

function poseWith(over, parts) {
  const p = copyPose(makePose(), IDLE);
  return blendParts(p, over, 1, parts);
}

let FITS = null;
function fits() {
  if (FITS) return FITS;
  // the shield, raised: square to the front, just past the fist
  const block = poseWith(SHIELD_BLOCK, UPPER);
  const hand = partIn(block, P.handL);
  const shieldAt = hand.pos.clone().add(new Vector3(-0.07, 0.02, 0.07));
  // the pistol, held out: barrel straight ahead, sitting on top of the fist
  const aim = poseWith(AIM, AIM_PARTS);
  const gunHand = partIn(aim, P.handR);
  const gunAt = gunHand.pos.clone().add(new Vector3(0, 0.045, 0.02));
  FITS = {
    shield: fitTo(block, P.handL, shieldAt, new Quaternion()),
    pistol: fitTo(aim, P.handR, gunAt, new Quaternion()),
  };
  return FITS;
}

/** A sword leaves the fist between pointing out of the thumb and down the arm. */
const SWORD_Q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 45 * D);

/* -------------------------------------------------------------------------- */
/*                                  painting                                  */
/* -------------------------------------------------------------------------- */

function grain(ctx, t, color, r, n = 30) {
  for (let k = 0; k < n; k++) {
    ctx.fillStyle = color;
    ctx.fillRect(t.x + r() * t.w, t.y + r() * t.h, 1, 3 + r() * 10);
  }
}

/** Long faces run along Z; the grip end is -Z. On the side faces Z runs along u or v. */
function bandAtGripEnd(ctx, t, fi, frac, color) {
  ctx.fillStyle = color;
  if (fi === FACE.px) ctx.fillRect(t.x + t.w * (1 - frac), t.y, t.w * frac + 1, t.h);
  else if (fi === FACE.nx) ctx.fillRect(t.x - 1, t.y, t.w * frac + 1, t.h);
  else if (fi === FACE.py || fi === FACE.ny) ctx.fillRect(t.x, t.y + t.h * (1 - frac), t.w, t.h * frac + 1);
  else if (fi === FACE.nz) ctx.fillRect(t.x - 1, t.y - 1, t.w + 2, t.h + 2);
}

function paintWoodenSword(ctx, tiles, size, grip) {
  const r = rng(21);
  const hilt = (grip + 0.06) / size.z;
  for (let fi = 0; fi < 6; fi++) {
    const t = tiles[fi];
    ctx.fillStyle = fi === FACE.py ? '#c8955a' : fi === FACE.ny ? '#9c6c3a' : '#b4814a';
    ctx.fillRect(t.x - 1, t.y - 1, t.w + 2, t.h + 2);
    if (fi !== FACE.pz && fi !== FACE.nz) grain(ctx, t, 'rgba(96, 58, 26, 0.35)', r);
    bandAtGripEnd(ctx, t, fi, hilt, '#5a3a1e');
    if (fi === FACE.py || fi === FACE.ny) {
      // leather wrap across the grip
      for (let k = 0; k < 5; k++) {
        ctx.fillStyle = '#3e2712';
        ctx.fillRect(t.x, t.y + t.h * (1 - hilt) + (k + 0.5) * (t.h * hilt / 5), t.w, 1);
      }
    }
  }
}

function paintRustySword(ctx, tiles, size, grip) {
  const r = rng(77);
  const hilt = (grip + 0.06) / size.z;
  for (let fi = 0; fi < 6; fi++) {
    const t = tiles[fi];
    const flat = fi === FACE.py || fi === FACE.ny;
    ctx.fillStyle = flat ? '#a7aaa8' : '#8a8d8c';
    ctx.fillRect(t.x - 1, t.y - 1, t.w + 2, t.h + 2);
    // rust: blooms of orange-brown, thicker toward the hilt
    const n = flat ? 70 : 24;
    for (let k = 0; k < n; k++) {
      const y = t.y + Math.pow(r(), 0.7) * t.h;
      ctx.fillStyle = r() < 0.5 ? 'rgba(140, 70, 30, 0.55)' : 'rgba(96, 48, 22, 0.5)';
      const s = 1 + r() * 3;
      ctx.fillRect(t.x + r() * t.w, y, s, s);
    }
    if (flat) {
      // the fuller, and nicks along the edge
      ctx.fillStyle = 'rgba(70, 72, 72, 0.6)';
      ctx.fillRect(t.x + t.w * 0.44, t.y, t.w * 0.12, t.h * (1 - hilt));
      ctx.fillStyle = '#5e605f';
      for (let k = 0; k < 6; k++) ctx.fillRect(t.x + (r() < 0.5 ? 0 : t.w - 2), t.y + r() * t.h * (1 - hilt), 2, 2);
    }
    bandAtGripEnd(ctx, t, fi, hilt, '#3b2a1c');
    if (flat) {
      for (let k = 0; k < 6; k++) {
        ctx.fillStyle = '#5a4430';
        ctx.fillRect(t.x, t.y + t.h * (1 - hilt) + (k + 0.5) * (t.h * hilt / 6), t.w, 1);
      }
    }
  }
}

/** The face is +Z, planks run up and down it. */
function paintShield(ctx, tiles) {
  const r = rng(5);
  for (let fi = 0; fi < 6; fi++) {
    const t = tiles[fi];
    ctx.fillStyle = fi === FACE.nz ? '#8a5a30' : '#a06a38';
    ctx.fillRect(t.x - 1, t.y - 1, t.w + 2, t.h + 2);
    if (fi === FACE.pz || fi === FACE.nz) {
      const planks = 5;
      for (let i = 0; i < planks; i++) {
        const x = t.x + (i * t.w) / planks;
        ctx.fillStyle = shade('#a06a38', 0.88 + r() * 0.24);
        ctx.fillRect(x + 1, t.y, t.w / planks - 2, t.h);
        ctx.fillStyle = '#4a2e14';
        ctx.fillRect(x, t.y, 1, t.h);
        grain(ctx, { x: x + 2, y: t.y, w: t.w / planks - 4, h: t.h }, 'rgba(80, 48, 20, 0.3)', r, 12);
      }
      if (fi === FACE.pz) {
        // iron rim and studs
        const b = Math.max(2, t.w * 0.045);
        ctx.fillStyle = '#4c4f52';
        ctx.fillRect(t.x, t.y, t.w, b); ctx.fillRect(t.x, t.y + t.h - b, t.w, b);
        ctx.fillRect(t.x, t.y, b, t.h); ctx.fillRect(t.x + t.w - b, t.y, b, t.h);
        ctx.fillStyle = '#8d9194';
        for (const [u, v] of [[0.08, 0.08], [0.92, 0.08], [0.08, 0.92], [0.92, 0.92], [0.5, 0.08], [0.5, 0.92], [0.08, 0.5], [0.92, 0.5]]) {
          ctx.fillRect(t.x + t.w * u - 1.5, t.y + t.h * v - 1.5, 3, 3);
        }
      } else {
        // the strap behind
        ctx.fillStyle = '#3a2412';
        ctx.fillRect(t.x + t.w * 0.2, t.y + t.h * 0.44, t.w * 0.6, t.h * 0.12);
      }
    } else {
      ctx.fillStyle = '#4c4f52';
      ctx.fillRect(t.x - 1, t.y - 1, t.w + 2, t.h + 2);
    }
  }
}

function paintPistol(ctx, tiles) {
  for (let fi = 0; fi < 6; fi++) {
    const t = tiles[fi];
    ctx.fillStyle = fi === FACE.py ? '#3a3d42' : '#26282c';
    ctx.fillRect(t.x - 1, t.y - 1, t.w + 2, t.h + 2);
    if (fi === FACE.pz) { ctx.fillStyle = '#050505'; ctx.fillRect(t.x + t.w * 0.3, t.y + t.h * 0.3, t.w * 0.4, t.h * 0.4); }
  }
}

/* -------------------------------------------------------------------------- */
/*                                held things                                 */
/* -------------------------------------------------------------------------- */

const _v = new Vector3(), _q = new Quaternion();

export class Held {
  /** kind: an ITEMS id, or 'pistol'. display: just the model, for hanging on a wall. */
  constructor(game, kind, display = false) {
    const T = ITEMS[kind] || PISTOL;
    this.game = game;
    this.kind = kind;
    this.type = T;
    this.size = new Vector3(...T.size);
    this.removed = false;
    this.holder = null;
    this.isShield = kind === 'wood_shield';
    this.isGun = kind === 'pistol';
    this.isSword = !this.isShield && !this.isGun;
    this.hand = this.isShield ? P.handL : P.handR;

    this.layout = packBoxes([{ size: this.size, density: this.isShield ? 140 : 240 }], 256);
    this.paint = new PaintCanvas(this.layout.width, this.layout.height);
    const tiles = this.layout.tiles[0];
    if (kind === 'wooden_sword') paintWoodenSword(this.paint.ctx, tiles, this.size, T.grip);
    else if (kind === 'rusty_sword') paintRustySword(this.paint.ctx, tiles, this.size, T.grip);
    else if (this.isShield) paintShield(this.paint.ctx, tiles);
    else paintPistol(this.paint.ctx, tiles);
    this.paint.dirty = true;

    const geo = buildBoxGeometry([{ size: this.size }], this.layout);
    this.material = new MeshLambertMaterial({ map: this.paint.texture });
    const box = new Mesh(geo, this.material);
    box.castShadow = true;
    box.receiveShadow = true;
    this.mesh = new Group();
    this.mesh.add(box);
    this.extras(T);
    if (display) { this.body = null; return; }
    game.scene.add(this.mesh);

    this.body = new Body({
      half: new Vector3(this.size.x / 2, this.size.y / 2, this.size.z / 2),
      mass: this.isShield ? 3 : this.isGun ? 1 : 1.2, friction: 0.5, restitution: 0.1,
    });
    this.body.owner = this;
    this.body.angDamp = 0.3;
    // a pistol is too small to be worth colliding with anything
    if (this.isGun) this.body.ghost = true;
    game.world.add(this.body);
    this.prevX = new Vector3();
    this.prevQ = new Quaternion();

    // where it sits on the hand
    if (this.isSword) {
      this.gripPos = new Vector3(0, 0, this.size.z / 2 - T.grip).applyQuaternion(SWORD_Q);
      this.gripPos.y -= 0.01;
      this.gripQ = SWORD_Q;
      this.range = swordRange(this);
    } else {
      const f = fits()[this.isShield ? 'shield' : 'pistol'];
      this.gripPos = f.pos;
      this.gripQ = f.quat;
    }
  }

  get name() { return this.type.name; }

  /** The bits that are not the main box: crossguard, pommel, boss, sights. */
  extras(T) {
    const add = (size, pos, color) => {
      const m = new Mesh(new BoxGeometry(...size), new MeshLambertMaterial({ color }));
      m.position.set(...pos);
      m.castShadow = true;
      this.mesh.add(m);
      return m;
    };
    const z0 = -this.size.z / 2;
    if (this.kind === 'wooden_sword') {
      add([0.17, 0.05, 0.035], [0, 0, z0 + T.grip + 0.06], '#6b4220');
      add([0.05, 0.05, 0.04], [0, 0, z0 + 0.015], '#6b4220');
    } else if (this.kind === 'rusty_sword') {
      add([0.21, 0.032, 0.03], [0, 0, z0 + T.grip + 0.06], '#5e4a32');
      add([0.045, 0.045, 0.04], [0, 0, z0 + 0.012], '#6d5a3c');
    } else if (this.isShield) {
      add([0.13, 0.13, 0.04], [0, 0, this.size.z / 2 + 0.018], '#6d7175');
      add([0.06, 0.06, 0.02], [0, 0, this.size.z / 2 + 0.045], '#8d9194');
    } else {
      // grip below the slide, and the front sight
      const grip = add([0.03, 0.1, 0.045], [0, -0.06, -0.06], '#1b1c1f');
      grip.rotation.x = -14 * D;
      add([0.008, 0.012, 0.01], [0, 0.031, this.size.z / 2 - 0.015], '#0c0c0c');
    }
  }

  beginStep() {
    this.prevX.copy(this.body.x);
    this.prevQ.copy(this.body.q);
  }

  /** Held: welded to the hand. */
  handPose(outX, outQ) {
    const hand = this.holder.bodies[this.hand];
    const src = hand.kinematic ? hand.kTo : hand;
    outQ.copy(src.q).multiply(this.gripQ);
    outX.copy(this.gripPos).applyQuaternion(src.q).add(src.x);
  }

  follow(dt) {
    if (!this.holder) return;
    this.handPose(_v, _q);
    this.body.setTarget(_v, _q, dt);
  }

  attach(h) {
    this.holder = h;
    this.body.setKinematic(true);
    this.handPose(_v, _q);
    this.body.setTarget(_v, _q, 1 / 60, true);
    this.body.setPose(_v, _q);
    this.prevX.copy(_v); this.prevQ.copy(_q);
    return this;
  }

  drop() {
    if (!this.holder) return;
    this.holder = null;
    this.body.ghost = this.isGun;
    this.body.setKinematic(false);
    // let go of, not thrown
    const b = this.body;
    const v = b.v.length(), w = b.w.length();
    if (v > 4) b.v.multiplyScalar(4 / v);
    if (w > 10) b.w.multiplyScalar(10 / w);
  }

  /** The muzzle of a pistol, and the way it points. */
  muzzle(outPos, outDir) {
    outDir.set(0, 0, 1).applyQuaternion(this.body.q);
    outPos.set(0, 0.012, this.size.z / 2 + 0.01).applyQuaternion(this.body.q).add(this.body.x);
  }

  /** Paints blood at a world point on this. */
  splat(point, radius, opts) {
    const local = this.body.toLocal(point, _v);
    this.paint.splat(local, this.size, this.layout.tiles[0], radius, opts);
  }

  sync(alpha) {
    this.mesh.position.lerpVectors(this.prevX, this.body.x, alpha);
    this.mesh.quaternion.slerpQuaternions(this.prevQ, this.body.q, alpha);
  }

  remove() {
    if (this.removed) return;
    this.holder = null;
    this.removed = true;
    this.game.world.remove(this.body);
    this.game.scene.remove(this.mesh);
    this.mesh.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    this.paint.dispose();
  }
}

/** Root-to-root distance at which the middle of the blade meets a body mid-swing. */
function swordRange(item) {
  const pose = makePose(), q = makeQuats();
  const pos = [], quat = [];
  for (let i = 0; i < NP; i++) { pos.push(new Vector3()); quat.push(new Quaternion()); }
  SWING_R.sample(0.33, pose);
  poseQuats(pose, q);
  forwardKinematics(new Vector3(), new Quaternion(), pose.off, q, pos, quat);
  const centre = new Vector3().copy(item.gripPos).applyQuaternion(quat[P.handR]).add(pos[P.handR]);
  return Math.max(0.8, Math.min(1.35, centre.z + 0.12));
}
