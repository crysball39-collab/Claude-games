/* =============================================================================
   The things you make and carry, in 3D. Every part is built from the ore it
   was forged from: a sword's blade, cross-guard and pommel, a helmet's
   plating, body and trim, each in its own ore's material.

   Held things are built along +Y from the grip, which is the origin, so the
   rig's grip joint decides how they are held.
   ========================================================================== */
import {
  Group, Mesh, BoxGeometry, CylinderGeometry, ConeGeometry, OctahedronGeometry,
  SphereGeometry, ExtrudeGeometry, Shape, MeshLambertMaterial,
} from 'three';
import { partsOf } from './data.js';
import { oreMaterial } from './materials.js';
import { BODY } from './character.js';

const B = BODY;
const leather = new MeshLambertMaterial({ color: 0x5a3519 });
const wrap = new MeshLambertMaterial({ color: 0x2e1a0b });
const woodMat = new MeshLambertMaterial({ color: 0x9a6a3a });
const lightWood = new MeshLambertMaterial({ color: 0xc08a50 });
const rope = new MeshLambertMaterial({ color: 0xbfa070 });
const ironMat = () => oreMaterial('iron');

const add = (group, geo, mat, x = 0, y = 0, z = 0) => {
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  group.add(m);
  return m;
};

/** A blade: a flat bar with a point, a little bevel on the edges. */
function bladeGeometry(len, width, thick, tip) {
  const s = new Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(width / 2, len - tip);
  s.lineTo(0, len);
  s.lineTo(-width / 2, len - tip);
  s.closePath();
  const g = new ExtrudeGeometry(s, {
    depth: thick, bevelEnabled: true, bevelThickness: thick * 0.45,
    bevelSize: Math.min(width * 0.2, 0.012), bevelSegments: 1, steps: 1,
  });
  g.translate(0, 0, -thick / 2);
  return g;
}

/* -------------------------------- weapons ---------------------------------- */

const WEAPON_SHAPES = {
  dagger: { blade: [0.3, 0.05, 0.012, 0.075], guard: [0.13, 0.025, 0.04], grip: 0.1, pommel: 0.026 },
  sword: { blade: [0.8, 0.066, 0.014, 0.1], guard: [0.27, 0.035, 0.05], grip: 0.17, pommel: 0.034 },
  broadsword: { blade: [1.08, 0.125, 0.02, 0.15], guard: [0.4, 0.05, 0.07], grip: 0.3, pommel: 0.048 },
};

/** A weapon, its parts each in their ore. `parts` = [blade, guard, pommel]. */
export function buildWeapon(type, parts) {
  const S = WEAPON_SHAPES[type];
  const [bladeOre, guardOre, pommelOre] = parts;
  const g = new Group();
  // the grip is wrapped leather: it is the one part no ore goes into
  const gl = S.grip;
  add(g, new CylinderGeometry(0.021, 0.023, gl, 8), leather, 0, gl * 0.2, 0);
  for (let i = 1; i < 4; i++) add(g, new CylinderGeometry(0.025, 0.025, 0.012, 8), wrap, 0, gl * 0.2 - gl / 2 + (gl * i) / 4, 0);
  const guardY = gl * 0.2 + gl / 2;
  // cross-guard, with its ends turned up on the big ones
  const [gw, gh, gd] = S.guard;
  add(g, new BoxGeometry(gw, gh, gd), oreMaterial(guardOre), 0, guardY + gh / 2, 0);
  if (type !== 'dagger') {
    for (const sx of [-1, 1]) {
      add(g, new BoxGeometry(gh * 1.1, gh * 1.6, gd * 1.1), oreMaterial(guardOre), sx * (gw / 2 - gh * 0.3), guardY + gh * 1.05, 0);
    }
  }
  // the blade itself
  const [bl, bw, bt, tip] = S.blade;
  const blade = add(g, bladeGeometry(bl, bw, bt, tip), oreMaterial(bladeOre), 0, guardY + gh, 0);
  blade.userData.part = 'blade';
  // a ricasso block where blade meets guard on the heavier swords
  if (type !== 'dagger') add(g, new BoxGeometry(bw * 1.05, gh * 0.9, bt * 2.2), oreMaterial(guardOre), 0, guardY + gh * 1.3, 0);
  // the pommel caps the grip
  const pr = S.pommel;
  const pommel = type === 'dagger' ? new SphereGeometry(pr, 8, 6) : new OctahedronGeometry(pr * 1.2, 0);
  add(g, pommel, oreMaterial(pommelOre), 0, gl * 0.2 - gl / 2 - pr * 0.6, 0);
  g.userData.tip = guardY + gh + bl;
  return g;
}

/** What the skeletons carry: a dagger whittled out of wood. */
export function buildWoodenDagger() {
  const S = WEAPON_SHAPES.dagger;
  const g = new Group();
  const gl = S.grip;
  add(g, new CylinderGeometry(0.02, 0.022, gl, 6), woodMat, 0, gl * 0.2, 0);
  const guardY = gl * 0.2 + gl / 2;
  add(g, new BoxGeometry(0.12, 0.03, 0.045), woodMat, 0, guardY + 0.015, 0);
  const [bl, bw, bt, tip] = S.blade;
  add(g, bladeGeometry(bl * 1.05, bw * 1.15, bt * 1.6, tip), lightWood, 0, guardY + 0.03, 0);
  return g;
}

/* -------------------------------- pickaxes --------------------------------- */

export function buildPickaxe(type) {
  const g = new Group();
  const len = 0.78;
  add(g, new CylinderGeometry(0.022, 0.026, len, 7), woodMat, 0, len / 2 - 0.14, 0);
  const top = len - 0.14;
  const headMat = type === 'stone' ? oreMaterial('stone') : lightWood;
  add(g, new BoxGeometry(0.085, 0.09, 0.075), headMat, 0, top, 0);
  // two picks, curving down a touch
  for (const sx of [-1, 1]) {
    const spike = add(g, new ConeGeometry(0.04, 0.24, 4), headMat, sx * 0.15, top - 0.02, 0);
    spike.rotation.z = -sx * (Math.PI / 2 + 0.28);
    spike.rotation.y = Math.PI / 4;
  }
  if (type === 'stone') {
    // lashed on
    add(g, new BoxGeometry(0.095, 0.03, 0.085), rope, 0, top - 0.055, 0);
    add(g, new BoxGeometry(0.095, 0.03, 0.085), rope, 0, top + 0.05, 0);
  }
  g.userData.tip = top;
  return g;
}

/** The smith's hammer, out only while something is on the anvil. */
export function buildHammer() {
  const g = new Group();
  add(g, new CylinderGeometry(0.02, 0.024, 0.42, 7), woodMat, 0, 0.12, 0);
  add(g, new BoxGeometry(0.17, 0.085, 0.085), ironMat(), 0, 0.34, 0);
  add(g, new BoxGeometry(0.04, 0.095, 0.095), ironMat(), 0.085, 0.34, 0);
  return g;
}

/** Whatever item this is, as something to hold. */
export function buildHeld(item) {
  if (!item) return null;
  if (item.kind === 'pickaxe') return buildPickaxe(item.type);
  if (item.kind === 'weapon') return buildWeapon(item.type, partsOf(item.mix));
  return null;
}

/* --------------------------------- armour ---------------------------------- */

/**
 * Builds one piece of armour onto a rig. Returns the meshes it added, so
 * taking it off again is just removing them. `parts` = [plating, body, trim].
 */
export function buildArmor(rig, type, parts) {
  const [plateOre, bodyOre, trimOre] = parts;
  const P = oreMaterial(plateOre), Bd = oreMaterial(bodyOre), T = oreMaterial(trimOre);
  const out = [];
  const put = (jointName, w, h, d, mat, x, y, z) => {
    const m = new Mesh(new BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    rig.joints[jointName].add(m);
    out.push(m);
    return m;
  };
  const h = B.head;
  const [tw, th, td] = B.torso;

  if (type === 'helmet') {
    // an open-faced cap: plated crown, a shell round the sides and back,
    // and a trim band at the brow with a nose guard and a crest
    put('head', h + 0.05, 0.08, h + 0.05, P, 0, h + 0.02, 0);
    put('head', h - 0.05, 0.05, h - 0.05, P, 0, h + 0.075, 0);
    for (const sx of [-1, 1]) put('head', 0.03, h * 0.6, h + 0.04, Bd, sx * (h / 2 + 0.02), h * 0.64, -0.005);
    put('head', h + 0.05, h * 0.62, 0.03, Bd, 0, h * 0.64, -(h / 2 + 0.02));
    put('head', h + 0.07, 0.045, h + 0.07, T, 0, h * 0.8, 0);
    put('head', 0.035, 0.13, 0.03, T, 0, h * 0.62, h / 2 + 0.035);
    put('head', 0.035, 0.05, h * 0.82, T, 0, h + 0.12, 0);
  } else if (type === 'chestplate') {
    // breast- and backplate, a body of side plates, faulds and pauldrons,
    // and trim along the collar and the lower edge
    put('torso', tw * 0.94, th * 0.6, 0.04, P, 0, th * 0.64, td / 2 + 0.02);
    put('torso', tw * 0.94, th * 0.6, 0.04, P, 0, th * 0.64, -(td / 2 + 0.02));
    put('torso', tw * 0.82, th * 0.28, 0.035, Bd, 0, th * 0.2, td / 2 + 0.018);
    put('torso', tw * 0.82, th * 0.28, 0.035, Bd, 0, th * 0.2, -(td / 2 + 0.018));
    for (const sx of [-1, 1]) put('torso', 0.035, th * 0.78, td * 0.92, Bd, sx * (tw / 2 + 0.018), th * 0.5, 0);
    put('torso', tw * 0.66, 0.05, td + 0.08, T, 0, th - 0.005, 0);
    put('torso', tw * 0.96, 0.035, 0.05, T, 0, th * 0.34, td / 2 + 0.03);
    put('torso', tw * 0.96, 0.035, 0.05, T, 0, th * 0.34, -(td / 2 + 0.03));
    for (const side of ['L', 'R']) {
      put('sh' + side, B.arm + 0.07, 0.1, B.arm + 0.08, Bd, 0, 0.005, 0);
      put('sh' + side, B.arm + 0.08, 0.028, B.arm + 0.09, T, 0, -0.055, 0);
    }
  } else if (type === 'leggings') {
    // plated faulds and thigh plates over a body of wraps, a trim belt and knee cops
    put('hips', B.pelvis[0] + 0.05, 0.03, B.pelvis[2] + 0.05, T, 0, 0.06, 0);
    put('hips', B.pelvis[0] + 0.03, 0.15, 0.04, P, 0, -0.06, B.pelvis[2] / 2 + 0.02);
    put('hips', B.pelvis[0] + 0.03, 0.15, 0.04, Bd, 0, -0.06, -(B.pelvis[2] / 2 + 0.02));
    for (const side of ['L', 'R']) {
      put('hip' + side, B.leg + 0.03, B.thigh * 0.82, B.leg + 0.03, Bd, 0, -B.thigh * 0.48, 0);
      put('hip' + side, B.leg + 0.035, B.thigh * 0.62, 0.035, P, 0, -B.thigh * 0.45, B.leg / 2 + 0.03);
      put('knee' + side, B.leg + 0.05, 0.1, 0.06, T, 0, 0.0, B.leg / 2 + 0.02);
      put('knee' + side, B.leg + 0.025, B.shin * 0.55, B.leg + 0.025, Bd, 0, -B.shin * 0.33, 0);
    }
  } else if (type === 'boots') {
    // a boot body, plated toe caps and shins, trimmed at the cuff and sole
    for (const side of ['L', 'R']) {
      put('knee' + side, B.leg + 0.035, 0.17, B.leg + 0.035, Bd, 0, -B.shin + 0.085, 0);
      put('knee' + side, B.leg * 0.82, 0.15, 0.03, P, 0, -B.shin + 0.1, B.leg / 2 + 0.035);
      put('knee' + side, B.leg + 0.055, 0.035, B.leg + 0.055, T, 0, -B.shin + 0.17, 0);
      put('ankle' + side, B.foot[0] + 0.03, B.foot[1] + 0.025, B.foot[2] + 0.02, Bd, 0, -B.foot[1] / 2 + 0.01, 0.05);
      put('ankle' + side, B.foot[0] + 0.04, 0.055, 0.09, P, 0, -0.012, 0.05 + B.foot[2] / 2 - 0.035);
      put('ankle' + side, B.foot[0] + 0.045, 0.022, B.foot[2] + 0.045, T, 0, -B.foot[1] + 0.006, 0.05);
    }
  }
  return out;
}

/* --------------------------------- outfit ---------------------------------- */

/**
 * What a rig is wearing and carrying, kept in step with the profile: one
 * thing in the hand, one on the back, up to four pieces of armour.
 */
export class Outfit {
  constructor(rig) {
    this.rig = rig;
    this.armor = {};       // slot -> { uid, meshes }
    this.held = null;      // { key, group }
    this.back = null;
  }

  setArmor(slot, type, item) {
    const cur = this.armor[slot];
    if (cur && item && cur.uid === item.uid) return;
    if (cur) {
      for (const m of cur.meshes) { m.removeFromParent(); m.geometry.dispose(); }
      delete this.armor[slot];
    }
    if (item) this.armor[slot] = { uid: item.uid, meshes: buildArmor(this.rig, type, partsOf(item.mix)) };
  }

  /** Puts `item` in the right hand (or `special` - 'hammer'), or empties it. */
  setHeld(item, special = null) {
    const key = special || (item ? 'i' + item.uid : null);
    if (this.held?.key === key) return;
    if (this.held) this._drop(this.held.group);
    this.held = null;
    if (!key) return;
    const g = special === 'hammer' ? buildHammer() : buildHeld(item);
    if (!g) return;
    this.rig.joints.grip.add(g);
    this.held = { key, group: g };
    this.rig.twoHanded = item?.type === 'broadsword';
  }

  /** Slung across the back: whatever is not in the hand. */
  setBack(item) {
    const key = item ? 'i' + item.uid : null;
    if (this.back?.key === key) return;
    if (this.back) this._drop(this.back.group);
    this.back = null;
    if (!item) return;
    const g = buildHeld(item);
    // a pickaxe rides head up over the right shoulder; a blade hangs point
    // down from a hilt over the right shoulder
    if (item.kind === 'pickaxe') { g.rotation.set(0, 0, 0.6); g.position.set(0.14, -0.3, 0); }
    else { g.rotation.set(0, 0, -2.55); g.position.set(-0.14, 0.12, 0); }
    this.rig.joints.back.add(g);
    this.back = { key, group: g };
  }

  _drop(group) {
    group.removeFromParent();
    group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  }
}
