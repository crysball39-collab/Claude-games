// Procedural meshes for everything the player holds or picks up.
// No external assets — every model is boxes/cylinders so the game is one download.
import * as THREE from 'three';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + '|' + JSON.stringify(opts);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, ...opts });
    matCache.set(key, m);
  }
  return m;
}
export function matUnique(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

export function box(w, h, d, color, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.castShadow = opts.castShadow ?? true;
  m.receiveShadow = opts.receiveShadow ?? true;
  return m;
}
export function cyl(rt, rb, h, color, seg = 10, opts = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color, opts));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
export function sphere(r, color, seg = 10) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(4, seg >> 1)), mat(color));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
export function put(parent, mesh, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

export const RARITY = {
  common:    { name: 'Common',    color: 0x9aa3ad, glow: 0xb9c2cc, mult: 1.00, w: 44 },
  uncommon:  { name: 'Uncommon',  color: 0x4caf3f, glow: 0x7ee36a, mult: 1.10, w: 27 },
  rare:      { name: 'Rare',      color: 0x2f7fe0, glow: 0x62a8ff, mult: 1.22, w: 16 },
  epic:      { name: 'Epic',      color: 0x9a45d8, glow: 0xc07dff, mult: 1.36, w: 9 },
  legendary: { name: 'Legendary', color: 0xe89b28, glow: 0xffc65c, mult: 1.52, w: 4 },
};
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

// ---------------------------------------------------------------------------
// Guns.  Each returns a group whose origin sits in the shooter's right hand,
// with `userData.muzzle` (an Object3D) marking the barrel tip and `userData.mag`
// the magazine so the reload animation can detach it.
// ---------------------------------------------------------------------------
function gunSkeleton(tint) {
  const g = new THREE.Group();
  g.userData.tint = tint;
  return g;
}

export function makeM1911(rarityColor) {
  const g = gunSkeleton(rarityColor);
  const body = put(g, box(0.075, 0.13, 0.30, 0x2f3238), 0, 0.05, 0.05);
  put(g, box(0.07, 0.05, 0.34, 0xb0b6bd), 0, 0.115, 0.05);          // slide
  put(g, box(0.055, 0.16, 0.075, 0x3a3129), 0, -0.06, -0.06);        // grip
  const magz = put(g, box(0.04, 0.13, 0.06, 0x53575d), 0, -0.06, -0.055);
  put(g, box(0.03, 0.02, 0.05, 0x22252a), 0, -0.005, 0.02);          // trigger guard
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.09, 0.23); g.add(muzzle);
  g.userData.muzzle = muzzle; g.userData.mag = magz; g.userData.body = body;
  g.userData.gripOffset = new THREE.Vector3(0, -0.02, 0);
  return g;
}

export function makeMac10() {
  const g = gunSkeleton();
  const body = put(g, box(0.085, 0.13, 0.28, 0x33373d), 0, 0.06, 0.03);
  put(g, box(0.06, 0.06, 0.22, 0x1f2226), 0, 0.09, 0.24);            // barrel shroud
  put(g, cyl(0.016, 0.016, 0.10, 0x15171a, 8), 0, 0.09, 0.38, Math.PI / 2, 0, 0);
  put(g, box(0.05, 0.14, 0.07, 0x2a2d31), 0, -0.03, -0.03);          // grip
  const magz = put(g, box(0.045, 0.24, 0.06, 0x4a4e54), 0, -0.10, 0.07);
  const stock = put(g, box(0.035, 0.035, 0.24, 0x25282c), 0, 0.07, -0.19);
  put(g, box(0.10, 0.035, 0.03, 0x25282c), 0, 0.07, -0.30);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.09, 0.44); g.add(muzzle);
  g.userData.muzzle = muzzle; g.userData.mag = magz; g.userData.body = body; g.userData.stock = stock;
  g.userData.gripOffset = new THREE.Vector3(0, -0.02, 0.02);
  return g;
}

export function makeAK47() {
  const g = gunSkeleton();
  const body = put(g, box(0.075, 0.12, 0.44, 0x3b2a1c), 0, 0.06, 0.06);
  put(g, box(0.06, 0.07, 0.34, 0x2b2f34), 0, 0.115, 0.14);           // receiver
  put(g, cyl(0.018, 0.018, 0.36, 0x1a1c20, 8), 0, 0.115, 0.46, Math.PI / 2, 0, 0);
  put(g, box(0.05, 0.05, 0.16, 0x4a3620), 0, 0.05, 0.30);            // handguard
  put(g, box(0.05, 0.15, 0.075, 0x4a3620), 0, -0.02, -0.06);         // grip
  const magz = put(g, box(0.05, 0.26, 0.09, 0x5c4a2c), 0, -0.10, 0.10);
  magz.rotation.x = 0.25;
  const stock = put(g, box(0.05, 0.09, 0.30, 0x4a3620), 0, 0.03, -0.28);
  put(g, box(0.02, 0.05, 0.02, 0x1a1c20), 0, 0.17, 0.40);            // front sight
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.115, 0.66); g.add(muzzle);
  g.userData.muzzle = muzzle; g.userData.mag = magz; g.userData.body = body; g.userData.stock = stock;
  g.userData.gripOffset = new THREE.Vector3(0, -0.02, 0.02);
  return g;
}

export function makeGunMesh(weaponId) {
  if (weaponId === 'm1911') return makeM1911();
  if (weaponId === 'mac10') return makeMac10();
  return makeAK47();
}

// ---------------------------------------------------------------------------
export function makePickaxe(styleId = 'default') {
  const g = new THREE.Group();
  const shaftColor = styleId === 'frost' ? 0x8fd4e8 : 0x9b6b3f;
  const headColor = styleId === 'frost' ? 0xd8f3ff : 0xb9c2cc;
  put(g, cyl(0.035, 0.04, 0.95, shaftColor, 8), 0, 0.30, 0);
  const head = put(g, box(0.09, 0.10, 0.44, headColor), 0, 0.74, 0.02);
  head.rotation.x = 0.12;
  put(g, box(0.07, 0.07, 0.12, 0x6d7681), 0, 0.70, 0.24, 0.35, 0, 0);
  put(g, box(0.06, 0.05, 0.10, 0x6d7681), 0, 0.72, -0.20, -0.35, 0, 0);
  put(g, cyl(0.05, 0.05, 0.09, 0x3c3229, 8), 0, -0.12, 0);
  g.userData.tip = new THREE.Object3D();
  g.userData.tip.position.set(0, 0.74, 0.24);
  g.add(g.userData.tip);
  return g;
}

// ---------------------------------------------------------------------------
export function makeBandage() {
  const g = new THREE.Group();
  put(g, cyl(0.09, 0.09, 0.10, 0xf2ece0, 12), 0, 0, 0, 0, 0, Math.PI / 2);
  put(g, box(0.03, 0.10, 0.10, 0xd8402f), 0.055, 0, 0);
  put(g, box(0.10, 0.028, 0.028, 0xffffff), 0, 0, 0);
  return g;
}
export function makeShieldPotion() {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.085, 0.20, 10),
    new THREE.MeshLambertMaterial({ color: 0x4f8fe8, transparent: true, opacity: 0.85 })
  );
  glass.castShadow = true;
  g.add(glass);
  put(g, cyl(0.035, 0.035, 0.07, 0x2a4d80, 8), 0, 0.13, 0);
  put(g, cyl(0.05, 0.05, 0.03, 0xd8d8d8, 8), 0, 0.17, 0);
  return g;
}

export function makeItemMesh(item) {
  if (item.kind === 'weapon') { const g = makeGunMesh(item.id); g.scale.setScalar(1.15); return g; }
  if (item.id === 'bandage') return makeBandage();
  return makeShieldPotion();
}

// ---------------------------------------------------------------------------
export function makeChestMesh() {
  const g = new THREE.Group();
  const woodDark = 0x6b4526, woodLight = 0x8d5c33, gold = 0xd9a52b;
  const base = new THREE.Group();
  put(base, box(1.15, 0.62, 0.78, woodLight), 0, 0.31, 0);
  put(base, box(1.19, 0.10, 0.82, woodDark), 0, 0.10, 0);
  put(base, box(1.19, 0.10, 0.82, woodDark), 0, 0.50, 0);
  put(base, box(0.10, 0.64, 0.84, gold), 0, 0.31, 0);
  g.add(base);

  const lid = new THREE.Group();
  lid.position.set(0, 0.62, -0.39);
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.39, 0.39, 1.15, 12, 1, false, 0, Math.PI),
    mat(woodLight)
  );
  shell.castShadow = true; shell.receiveShadow = true;
  shell.rotation.z = Math.PI / 2;
  shell.position.set(0, 0, 0.39);
  lid.add(shell);
  put(lid, box(0.11, 0.40, 0.40, gold), 0, 0.20, 0.39);
  g.add(lid);
  g.userData.lid = lid;
  return g;
}

export function makeMuzzleFlash() {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: 0xffdd77, transparent: true, opacity: 0.95, depthWrite: false });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), m);
  core.scale.set(1, 1, 2.2);
  g.add(core);
  const petals = new THREE.Mesh(
    new THREE.ConeGeometry(0.13, 0.30, 5),
    new THREE.MeshBasicMaterial({ color: 0xffa53a, transparent: true, opacity: 0.8, depthWrite: false })
  );
  petals.rotation.x = Math.PI / 2;
  petals.position.z = 0.15;
  g.add(petals);
  g.visible = false;
  g.userData.mats = [m, petals.material];
  return g;
}
