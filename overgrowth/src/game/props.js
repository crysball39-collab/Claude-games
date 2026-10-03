/* =============================================================================
   Objects: a crate to shove about, and two things to hit people with.

   Each is a single rigid box with its own paint canvas, so blood lands on the
   blade or the barrel exactly where it touched. A weapon in a hand is a
   kinematic body welded to the fist at its grip; dropped, it is an ordinary
   dynamic body again and keeps the speed the hand gave it.
   ========================================================================== */
import { Vector3, Quaternion, Mesh, MeshLambertMaterial, BoxGeometry } from 'three';
import { Body } from '../physics/world.js';
import { packBoxes, buildBoxGeometry, PaintCanvas, FACE } from './paint.js';
import { P, NP, forwardKinematics } from './rig.js';
import { makePose, makeQuats, poseQuats, SWING_R } from './anim.js';
import { shade } from '../core/util.js';

const D = Math.PI / 180;

export const PROP_TYPES = {
  crate: {
    name: 'Crate', size: [0.6, 0.6, 0.6], mass: 14, density: 110, friction: 0.7,
  },
  bat: {
    name: 'Bat', size: [0.065, 0.065, 0.86], mass: 1.0, density: 260, friction: 0.5,
    weapon: true, sharp: false, strikeMass: 3.4, damageBase: 5, damage: 1.5, grip: 0.1,
  },
  sword: {
    name: 'Sword', size: [0.07, 0.018, 1.0], mass: 1.3, density: 260, friction: 0.4,
    weapon: true, sharp: true, strikeMass: 2.8, damageBase: 6, damage: 1.9, grip: 0.12,
  },
};

/** The weapon leaves the fist between pointing out of the thumb and down the arm. */
const GRIP_Q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 45 * D);

function paintCrate(ctx, tiles) {
  for (const t of tiles) {
    ctx.fillStyle = '#a8773f';
    ctx.fillRect(t.x - 1, t.y - 1, t.w + 2, t.h + 2);
    const planks = 5;
    for (let i = 0; i < planks; i++) {
      const y = t.y + (i * t.h) / planks;
      ctx.fillStyle = shade('#a8773f', 0.9 + Math.random() * 0.2);
      ctx.fillRect(t.x, y + 1, t.w, t.h / planks - 2);
      ctx.fillStyle = '#5d3d1c';
      ctx.fillRect(t.x, y, t.w, 1);
      for (let k = 0; k < 18; k++) {
        ctx.fillStyle = 'rgba(80, 50, 20, 0.25)';
        ctx.fillRect(t.x + Math.random() * t.w, y + Math.random() * (t.h / planks), 6 + Math.random() * 14, 1);
      }
    }
    // frame and the cross brace
    const b = Math.max(3, t.w * 0.09);
    ctx.fillStyle = '#7b5226';
    ctx.fillRect(t.x, t.y, t.w, b); ctx.fillRect(t.x, t.y + t.h - b, t.w, b);
    ctx.fillRect(t.x, t.y, b, t.h); ctx.fillRect(t.x + t.w - b, t.y, b, t.h);
    ctx.save();
    ctx.beginPath(); ctx.rect(t.x, t.y, t.w, t.h); ctx.clip();
    ctx.strokeStyle = '#7b5226'; ctx.lineWidth = b;
    ctx.beginPath(); ctx.moveTo(t.x, t.y + t.h); ctx.lineTo(t.x + t.w, t.y); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#3a3a3a';
    for (const [cx, cy] of [[0.5, 0.5], [t.w - 0.5 - 2, 0.5], [0.5, t.h - 2.5], [t.w - 2.5, t.h - 2.5]]) {
      ctx.fillRect(t.x + cx + b * 0.3, t.y + cy + b * 0.3, 2, 2);
    }
  }
}

/** Long faces run along Z; the grip end is -Z. */
function paintBat(ctx, tiles, size, grip) {
  for (let fi = 0; fi < 6; fi++) {
    const t = tiles[fi];
    ctx.fillStyle = fi === FACE.pz ? '#d8b88a' : '#c99b62';
    ctx.fillRect(t.x - 1, t.y - 1, t.w + 2, t.h + 2);
    if (fi === FACE.pz || fi === FACE.nz) continue;
    // grain
    for (let k = 0; k < 30; k++) {
      ctx.fillStyle = 'rgba(110, 70, 30, 0.25)';
      ctx.fillRect(t.x + Math.random() * t.w, t.y + Math.random() * t.h, 1, 4 + Math.random() * 10);
    }
    // tape on the handle: the -Z end. On the side faces Z runs along u or v.
    const f = fi;
    ctx.fillStyle = '#1d1d22';
    const frac = (grip + 0.12) / size.z;
    if (f === FACE.px) ctx.fillRect(t.x + t.w * (1 - frac), t.y, t.w * frac, t.h);        // u = -Z
    else if (f === FACE.nx) ctx.fillRect(t.x, t.y, t.w * frac, t.h);                      // u = +Z
    else if (f === FACE.py) ctx.fillRect(t.x, t.y + t.h * (1 - frac), t.w, t.h * frac);    // v = +Z
    else if (f === FACE.ny) ctx.fillRect(t.x, t.y + t.h * (1 - frac), t.w, t.h * frac);
  }
}

function paintSword(ctx, tiles, size, grip) {
  const hilt = (grip + 0.1) / size.z;
  for (let fi = 0; fi < 6; fi++) {
    const t = tiles[fi];
    ctx.fillStyle = fi === FACE.py || fi === FACE.ny ? '#c9ced6' : '#9aa1ab';
    ctx.fillRect(t.x - 1, t.y - 1, t.w + 2, t.h + 2);
    if (fi === FACE.py || fi === FACE.ny) {
      // fuller down the middle of the flat
      ctx.fillStyle = '#aeb4bd';
      ctx.fillRect(t.x + t.w * 0.42, t.y, t.w * 0.16, t.h * (1 - hilt));
      ctx.fillStyle = '#3b2a1c';
      ctx.fillRect(t.x - 1, t.y + t.h * (1 - hilt), t.w + 2, t.h * hilt + 1);
      for (let k = 0; k < 6; k++) {
        ctx.fillStyle = '#5a4430';
        ctx.fillRect(t.x, t.y + t.h * (1 - hilt) + (k + 0.5) * (t.h * hilt / 6), t.w, 1);
      }
    } else if (fi === FACE.px) {
      ctx.fillStyle = '#3b2a1c'; ctx.fillRect(t.x + t.w * (1 - hilt), t.y, t.w * hilt + 1, t.h);
    } else if (fi === FACE.nx) {
      ctx.fillStyle = '#3b2a1c'; ctx.fillRect(t.x - 1, t.y, t.w * hilt + 1, t.h);
    } else if (fi === FACE.nz) {
      ctx.fillStyle = '#3b2a1c'; ctx.fillRect(t.x - 1, t.y - 1, t.w + 2, t.h + 2);
    }
  }
}

const _v = new Vector3(), _q = new Quaternion();

export class Prop {
  constructor(game, kind, pos, quat = new Quaternion()) {
    const T = PROP_TYPES[kind];
    this.game = game;
    this.kind = kind;
    this.type = T;
    this.weapon = !!T.weapon;
    this.sharp = !!T.sharp;
    this.strikeMass = T.strikeMass || 0;
    this.damage = T.damage || 0;
    this.damageBase = T.damageBase || 0;
    this.size = new Vector3(...T.size);
    this.removed = false;
    this.holder = null;
    this.claimedBy = null;

    this.layout = packBoxes([{ size: this.size, density: T.density }], kind === 'crate' ? 256 : 512);
    this.paint = new PaintCanvas(this.layout.width, this.layout.height);
    const tiles = this.layout.tiles[0];
    if (kind === 'crate') paintCrate(this.paint.ctx, tiles);
    else if (kind === 'bat') paintBat(this.paint.ctx, tiles, this.size, T.grip);
    else paintSword(this.paint.ctx, tiles, this.size, T.grip);
    this.paint.dirty = true;

    const geo = buildBoxGeometry([{ size: this.size }], this.layout);
    this.mesh = new Mesh(geo, new MeshLambertMaterial({ map: this.paint.texture }));
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    if (kind === 'sword') {
      // crossguard at the top of the hilt
      const guard = new Mesh(new BoxGeometry(0.2, 0.035, 0.03), new MeshLambertMaterial({ color: '#6b5a3a' }));
      guard.position.z = -this.size.z / 2 + T.grip + 0.1;
      guard.castShadow = true;
      this.mesh.add(guard);
    }
    game.scene.add(this.mesh);

    this.body = new Body({
      half: new Vector3(this.size.x / 2, this.size.y / 2, this.size.z / 2),
      mass: T.mass, friction: T.friction, restitution: 0.1,
    });
    this.body.owner = this;
    this.body.angDamp = 0.3;
    this.body.setPose(pos, quat);
    game.world.add(this.body);
    this.prevX = new Vector3().copy(pos);
    this.prevQ = new Quaternion().copy(quat);

    // where the weapon's centre sits in the hand's frame
    if (this.weapon) {
      this.gripPos = new Vector3(0, 0, this.size.z / 2 - T.grip).applyQuaternion(GRIP_Q);
      this.gripPos.y -= 0.01;
      this.range = weaponRange(this);
    }
  }

  get name() { return this.type.name; }

  beginStep() {
    this.prevX.copy(this.body.x);
    this.prevQ.copy(this.body.q);
  }

  /** Held: welded to the right hand. */
  handPose(outX, outQ) {
    const hand = this.holder.bodies[P.handR];
    const src = hand.kinematic ? hand.kTo : hand;
    outQ.copy(src.q).multiply(GRIP_Q);
    outX.copy(this.gripPos).applyQuaternion(src.q).add(src.x);
  }

  follow(dt) {
    if (!this.holder) return;
    this.handPose(_v, _q);
    this.body.setTarget(_v, _q, dt);
  }

  attach(h) {
    if (this.holder || h.holding) return false;
    this.holder = h;
    this.claimedBy = null;
    h.holding = this;
    this.body.setKinematic(true);
    this.handPose(_v, _q);
    this.body.setTarget(_v, _q, 1 / 60, true);
    this.body.setPose(_v, _q);
    this.prevX.copy(_v); this.prevQ.copy(_q);
    return true;
  }

  drop() {
    const h = this.holder;
    if (!h) return;
    this.holder = null;
    h.holding = null;
    this.body.ghost = false;
    this.body.setKinematic(false);
    // let go of, not thrown
    const b = this.body;
    const v = b.v.length(), w = b.w.length();
    if (v > 4) b.v.multiplyScalar(4 / v);
    if (w > 10) b.w.multiplyScalar(10 / w);
  }

  /** Paints blood at a world point on this object. */
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
    if (this.holder) this.drop();
    this.removed = true;
    this.game.world.remove(this.body);
    this.game.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.paint.dispose();
  }
}

/** Root-to-root distance at which the middle of the weapon meets a body mid-swing. */
function weaponRange(prop) {
  const pose = makePose(), q = makeQuats();
  const pos = [], quat = [];
  for (let i = 0; i < NP; i++) { pos.push(new Vector3()); quat.push(new Quaternion()); }
  SWING_R.sample(0.33, pose);
  poseQuats(pose, q);
  forwardKinematics(new Vector3(), new Quaternion(), pose.off, q, pos, quat);
  const centre = new Vector3().copy(prop.gripPos).applyQuaternion(quat[P.handR]).add(pos[P.handR]);
  return Math.max(0.8, Math.min(1.35, centre.z + 0.12));
}
