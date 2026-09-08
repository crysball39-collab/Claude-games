// Procedural, boned-by-hand character rig.  Everything is animated with
// trig curves — walk, run, crouch, jump, aim, reload, heal and pickaxe swing.
import * as THREE from 'three';
import { box, cyl, put } from './models.js';
import { clamp, lerp, damp } from './util.js';

export const SKINS = [
  { id: 'recruit',  name: 'Recruit',        desc: 'Default outfit',
    skin: 0xd8a07a, shirt: 0x2e5aa8, pants: 0x2b2f3a, shoes: 0x1d2027, hair: 0x3a2a1c, hat: null },
  { id: 'commando', name: 'Commando',       desc: 'Default outfit',
    skin: 0xc98d63, shirt: 0x4b5b3a, pants: 0x3a4130, shoes: 0x24261f, hair: 0x1e1a16, hat: 0x4b5b3a },
  { id: 'aviator',  name: 'Aviator',        desc: 'Default outfit',
    skin: 0xe8b48c, shirt: 0x8a5a32, pants: 0x4a4f58, shoes: 0x2b2018, hair: 0x6d4a25, hat: null },
  { id: 'renegade', name: 'Renegade',       desc: 'Default outfit',
    skin: 0x8d6247, shirt: 0xb03a3a, pants: 0x2f3138, shoes: 0x191b1f, hair: 0x14100c, hat: null },
  { id: 'sentinel', name: 'Sentinel',       desc: 'Default outfit',
    skin: 0xf0c6a0, shirt: 0x35424f, pants: 0x232a33, shoes: 0x14171b, hair: 0xa8853f, hat: 0x35424f },
];

export const BACKBLINGS = [
  { id: 'none',    name: 'No Back Bling', desc: 'Nothing equipped', build: null },
  { id: 'pack',    name: 'Standard Pack', desc: 'Default back bling', build: (c) => {
      const g = new THREE.Group();
      put(g, box(0.42, 0.50, 0.22, c.shirt), 0, 0, 0);
      put(g, box(0.44, 0.12, 0.24, 0x2a2d33), 0, -0.14, 0);
      put(g, box(0.20, 0.16, 0.06, 0x9aa3ad), 0, 0.10, 0.13);
      return g;
    } },
  { id: 'roll',    name: 'Bed Roll', desc: 'Default back bling', build: (c) => {
      const g = new THREE.Group();
      const r = cyl(0.14, 0.14, 0.52, 0x8d7a5a, 8); r.rotation.z = Math.PI / 2; g.add(r);
      put(g, box(0.06, 0.30, 0.30, 0x5a4c38), 0.14, 0, 0);
      return g;
    } },
];

export const PICKAXES = [
  { id: 'default', name: 'Default Pickaxe', desc: 'Standard issue harvesting tool' },
  { id: 'frost',   name: 'Frost Axe',       desc: 'Default variant' },
];

export function cosmeticDefaults() {
  return { skin: 'recruit', backbling: 'none', pickaxe: 'default' };
}

function limb(len, w, color, dz = 0) {
  const pivot = new THREE.Group();
  const m = box(w, len, w * 0.92, color);
  m.position.set(0, -len / 2, dz);
  pivot.add(m);
  pivot.userData.len = len;
  return pivot;
}

export class CharacterRig {
  constructor(cosmetics = cosmeticDefaults(), opts = {}) {
    this.cos = { ...cosmeticDefaults(), ...cosmetics };
    const sk = SKINS.find(s => s.id === this.cos.skin) || SKINS[0];
    this.skinDef = sk;
    this.root = new THREE.Group();
    this.tint = opts.tint || null;

    const shirt = this.tint ?? sk.shirt;

    // hips -> torso -> head, arms hang off the torso
    this.hips = new THREE.Group();
    this.hips.position.y = 0.92;
    this.root.add(this.hips);

    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    put(this.torso, box(0.52, 0.62, 0.30, shirt), 0, 0.31, 0);
    put(this.torso, box(0.54, 0.14, 0.32, 0x2a2d33), 0, 0.05, 0);   // belt

    this.neck = new THREE.Group();
    this.neck.position.y = 0.66;
    this.torso.add(this.neck);
    const head = put(this.neck, box(0.30, 0.32, 0.30, sk.skin), 0, 0.17, 0);
    put(this.neck, box(0.31, 0.10, 0.31, sk.hair), 0, 0.31, -0.005);
    put(this.neck, box(0.05, 0.05, 0.02, 0x18120c), -0.075, 0.19, 0.152);
    put(this.neck, box(0.05, 0.05, 0.02, 0x18120c), 0.075, 0.19, 0.152);
    if (sk.hat) {
      put(this.neck, box(0.34, 0.09, 0.34, sk.hat), 0, 0.36, 0);
      put(this.neck, box(0.30, 0.04, 0.14, sk.hat), 0, 0.32, 0.20);
    }
    this.head = head;

    this.armL = limb(0.34, 0.15, shirt); this.armL.position.set(-0.33, 0.58, 0);
    this.armR = limb(0.34, 0.15, shirt); this.armR.position.set(0.33, 0.58, 0);
    this.torso.add(this.armL, this.armR);
    this.foreL = limb(0.32, 0.135, sk.skin); this.foreL.position.set(0, -0.34, 0); this.armL.add(this.foreL);
    this.foreR = limb(0.32, 0.135, sk.skin); this.foreR.position.set(0, -0.34, 0); this.armR.add(this.foreR);

    this.handR = new THREE.Group(); this.handR.position.set(0, -0.32, 0); this.foreR.add(this.handR);
    this.handL = new THREE.Group(); this.handL.position.set(0, -0.32, 0); this.foreL.add(this.handL);

    this.legL = limb(0.44, 0.18, sk.pants); this.legL.position.set(-0.14, 0, 0);
    this.legR = limb(0.44, 0.18, sk.pants); this.legR.position.set(0.14, 0, 0);
    this.hips.add(this.legL, this.legR);
    this.shinL = limb(0.42, 0.16, sk.pants); this.shinL.position.set(0, -0.44, 0); this.legL.add(this.shinL);
    this.shinR = limb(0.42, 0.16, sk.pants); this.shinR.position.set(0, -0.44, 0); this.legR.add(this.shinR);
    put(this.shinL, box(0.19, 0.10, 0.28, sk.shoes), 0, -0.40, 0.04);
    put(this.shinR, box(0.19, 0.10, 0.28, sk.shoes), 0, -0.40, 0.04);

    // back bling anchor
    this.backAnchor = new THREE.Group();
    this.backAnchor.position.set(0, 0.36, -0.20);
    this.torso.add(this.backAnchor);
    this.setBackbling(this.cos.backbling);

    // held item anchors
    this.heldGroup = new THREE.Group();
    this.handR.add(this.heldGroup);

    this.stowGroup = new THREE.Group();      // pickaxe on the hip when not held
    this.stowGroup.position.set(-0.24, 0.16, -0.16);
    this.stowGroup.rotation.set(0.2, 0, 0.9);
    this.hips.add(this.stowGroup);

    this.phase = 0;
    this.aimBlend = 0;
    this.crouchBlend = 0;
    this.recoil = 0;
    this.leanX = 0;
    this.lookPitch = 0;
    this.actionT = 0;
    this.action = null;     // 'reload' | 'reloadEmpty' | 'use' | 'swing'
    this.actionDur = 1;
    this.held = null;
    this._nameSprite = null;
  }

  setBackbling(id) {
    this.cos.backbling = id;
    while (this.backAnchor.children.length) this.backAnchor.remove(this.backAnchor.children[0]);
    const def = BACKBLINGS.find(b => b.id === id);
    if (def && def.build) this.backAnchor.add(def.build(this.skinDef));
  }

  setSkinTint(color) {
    this.tint = color;
  }

  /** Put a mesh in the right hand; pass null to empty it. */
  setHeld(mesh) {
    while (this.heldGroup.children.length) this.heldGroup.remove(this.heldGroup.children[0]);
    this.held = mesh || null;
    if (mesh) {
      mesh.position.set(0, -0.06, 0.06);
      mesh.rotation.set(0, 0, 0);
      this.heldGroup.add(mesh);
    }
  }
  setStowed(mesh) {
    while (this.stowGroup.children.length) this.stowGroup.remove(this.stowGroup.children[0]);
    if (mesh) { mesh.scale.setScalar(0.75); this.stowGroup.add(mesh); }
  }

  playAction(name, duration) {
    this.action = name; this.actionT = 0; this.actionDur = duration;
  }
  clearAction() { this.action = null; this.actionT = 0; }

  /**
   * state: { speed, sprinting, crouching, grounded, aiming, hasGun, hasTool,
   *          yaw, pitch, dead }
   */
  update(dt, s) {
    const moving = s.speed > 0.3;
    const cadence = s.sprinting ? 13.5 : 9.0;
    this.phase += dt * (moving ? cadence * clamp(s.speed / (s.sprinting ? 8.4 : 5.0), 0.45, 1.35) : 0);

    this.aimBlend = damp(this.aimBlend, s.aiming ? 1 : 0, 14, dt);
    this.crouchBlend = damp(this.crouchBlend, s.crouching ? 1 : 0, 13, dt);
    this.recoil = damp(this.recoil, 0, 11, dt);
    this.lookPitch = damp(this.lookPitch, clamp(s.pitch || 0, -0.7, 0.7), 12, dt);

    if (s.dead) { this.updateDead(dt); return; }

    const sw = moving ? Math.sin(this.phase) : 0;
    const sw2 = moving ? Math.sin(this.phase * 2) : 0;
    const amp = (s.sprinting ? 0.95 : 0.62) * clamp(s.speed / 4.4, 0, 1.25);

    // legs
    this.legL.rotation.x = sw * amp - this.crouchBlend * 0.75;
    this.legR.rotation.x = -sw * amp - this.crouchBlend * 0.75;
    this.shinL.rotation.x = Math.max(0, -sw * amp * 0.9) + this.crouchBlend * 1.35;
    this.shinR.rotation.x = Math.max(0, sw * amp * 0.9) + this.crouchBlend * 1.35;
    if (!s.grounded) {
      this.legL.rotation.x = -0.5; this.legR.rotation.x = 0.35;
      this.shinL.rotation.x = 0.8; this.shinR.rotation.x = 0.25;
    }

    // hips bob + crouch drop
    const bob = moving ? Math.abs(sw2) * 0.035 * amp : 0;
    this.hips.position.y = 0.92 - this.crouchBlend * 0.34 - bob;
    this.hips.rotation.z = moving ? sw * 0.035 : 0;
    this.torso.rotation.x = this.crouchBlend * 0.28 + (s.sprinting ? 0.20 : 0.05) * clamp(s.speed / 6, 0, 1);
    this.torso.rotation.y = 0;
    this.neck.rotation.x = -this.torso.rotation.x + this.lookPitch * 0.55;

    const aim = this.aimBlend;
    const holdGun = s.hasGun ? 1 : 0;
    const holdTool = s.hasTool ? 1 : 0;

    // default arm swing
    let aLx = -sw * amp * 0.85, aRx = sw * amp * 0.85;
    let aLz = 0.09, aRz = -0.09;
    let fLx = -0.35 - Math.max(0, sw) * 0.3, fRx = -0.35 - Math.max(0, -sw) * 0.3;
    let aLy = 0, aRy = 0;

    if (holdGun) {
      // both hands to the gun, right arm forward, left crossing to support
      const readyX = lerp(-1.05, -1.42, aim);
      aRx = lerp(aRx, readyX + this.recoil * 0.55, holdGun);
      aRz = lerp(aRz, -0.14 - aim * 0.10, holdGun);
      aRy = lerp(aRy, -0.10 - aim * 0.16, holdGun);
      fRx = lerp(fRx, -0.34 + aim * 0.16, holdGun);
      aLx = lerp(aLx, -1.10 - aim * 0.22, holdGun);
      aLz = lerp(aLz, 0.62 - aim * 0.14, holdGun);
      fLx = lerp(fLx, -0.72 + aim * 0.12, holdGun);
      this.torso.rotation.y = lerp(this.torso.rotation.y, -0.22 - aim * 0.12, holdGun);
      this.neck.rotation.y = 0.16 * holdGun;
    } else if (holdTool) {
      aRx = lerp(aRx, -0.55, 1); aRz = lerp(aRz, -0.20, 1);
      fRx = lerp(fRx, -0.55, 1);
    }

    // --- scripted actions -------------------------------------------------
    if (this.action) {
      this.actionT += dt;
      const p = clamp(this.actionT / this.actionDur, 0, 1);
      if (this.action === 'reload' || this.action === 'reloadEmpty') {
        const empty = this.action === 'reloadEmpty';
        // 0-.30 tilt gun in + drop mag, .30-.65 fetch and seat mag,
        // .65-.85 (empty only) rack the slide, then back to ready.
        const tilt = Math.sin(clamp(p / 0.85, 0, 1) * Math.PI) ;
        aRx += tilt * 0.55;
        aRz += tilt * 0.30;
        this.heldGroup.rotation.z = tilt * 0.85;
        this.heldGroup.rotation.x = tilt * 0.35;
        const magPhase = p < 0.32 ? p / 0.32 : p < 0.62 ? 1 - (p - 0.32) / 0.30 : 0;
        aLx = lerp(aLx, -0.15, magPhase);
        aLz = lerp(aLz, 0.30, magPhase);
        fLx = lerp(fLx, -1.5, magPhase);
        if (this.held && this.held.userData.mag) {
          const mg = this.held.userData.mag;
          const drop = p < 0.30 ? p / 0.30 : p < 0.60 ? 1 - (p - 0.30) / 0.30 : 0;
          mg.position.y = mg.userData.baseY ?? (mg.userData.baseY = mg.position.y);
          mg.position.y -= drop * 0.30;
          mg.visible = !(p > 0.12 && p < 0.42);
        }
        if (empty && p > 0.66 && p < 0.90) {
          const q = (p - 0.66) / 0.24;
          const pull = Math.sin(q * Math.PI);
          aLx = lerp(aLx, -1.35, pull);
          aLz = lerp(aLz, 0.42, pull);
          fLx = lerp(fLx, -0.55, pull);
          if (this.held && this.held.userData.body) this.held.userData.body.position.z = (this.held.userData.body.userData.baseZ ?? (this.held.userData.body.userData.baseZ = this.held.userData.body.position.z)) - pull * 0.06;
        }
        if (p >= 1) {
          if (this.held && this.held.userData.mag) { this.held.userData.mag.visible = true; this.held.userData.mag.position.y = this.held.userData.mag.userData.baseY; }
          this.heldGroup.rotation.set(0, 0, 0);
          this.clearAction();
        }
      } else if (this.action === 'use') {
        // raise the item to the face and hold, then lower
        const raise = p < 0.25 ? p / 0.25 : p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
        aRx = lerp(aRx, -2.05, raise);
        aRz = lerp(aRz, -0.35, raise);
        fRx = lerp(fRx, -0.95, raise);
        aLx = lerp(aLx, -0.9, raise * 0.6);
        this.neck.rotation.x += raise * 0.12;
        this.heldGroup.rotation.x = raise * 0.4 + Math.sin(this.actionT * 22) * 0.05 * raise;
        if (p >= 1) { this.heldGroup.rotation.set(0, 0, 0); this.clearAction(); }
      } else if (this.action === 'swing') {
        const q = p < 0.35 ? (p / 0.35) : 1 - (p - 0.35) / 0.65;
        const wind = Math.sin(clamp(p, 0, 1) * Math.PI);
        aRx = lerp(-2.4, 0.35, clamp((p - 0.18) / 0.30, 0, 1));
        aRz = -0.35 - wind * 0.25;
        aRy = -0.5 * wind;
        fRx = -0.5 + wind * 0.4;
        this.torso.rotation.y = lerp(this.torso.rotation.y, -0.45 + q * 0.9, 0.9);
        if (p >= 1) this.clearAction();
      }
    } else {
      this.heldGroup.rotation.set(0, 0, 0);
    }

    this.armL.rotation.set(aLx, aLy, aLz);
    this.armR.rotation.set(aRx + this.recoil * 0.5, aRy, aRz);
    this.foreL.rotation.x = fLx;
    this.foreR.rotation.x = fRx;

    if (this.held) {
      this.held.rotation.x = this.recoil * -1.1;
      this.held.position.z = 0.06 - this.recoil * 0.10;
    }
  }

  updateDead(dt) {
    this.deadT = (this.deadT || 0) + dt;
    const p = clamp(this.deadT * 2.4, 0, 1);
    this.root.rotation.x = lerp(0, -Math.PI / 2 * 0.92, p * p);
    this.hips.position.y = lerp(0.92, 0.35, p);
    this.armL.rotation.set(-0.4, 0, 1.2);
    this.armR.rotation.set(-0.4, 0, -1.2);
    this.legL.rotation.x = 0.15; this.legR.rotation.x = -0.15;
  }

  kick(amount) { this.recoil = Math.min(1.2, this.recoil + amount); }

  dispose() {
    this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}

/** Small floating name/health plate used above AI players. */
export function makeNamePlate(text, color = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(text, 128, 32);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 2;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
  spr.scale.set(1.7, 0.42, 1);
  return spr;
}
