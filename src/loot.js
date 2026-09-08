// Loot pool, rarities, inventory, chests and ground pickups.
import * as THREE from 'three';
import { RARITY, RARITY_ORDER, makeItemMesh, makeChestMesh } from './models.js';
import { weighted, TAU } from './util.js';

export const WEAPONS = {
  m1911: {
    id: 'm1911', kind: 'weapon', name: 'M1911', short: 'Pistol',
    mag: 7, damage: 30, rps: 6.4, auto: false,
    reload: 1.55, reloadEmpty: 2.05, spread: 0.85, adsSpread: 0.35,
    recoil: 0.9, camKick: 0.9, range: 130, ammoPer: 21, moveMul: 0.98,
  },
  mac10: {
    id: 'mac10', kind: 'weapon', name: 'Mac-10', short: 'SMG',
    mag: 25, damage: 16, rps: 11.5, auto: true,
    reload: 1.95, reloadEmpty: 2.45, spread: 2.5, adsSpread: 1.35,
    recoil: 0.5, camKick: 0.55, range: 80, ammoPer: 60, moveMul: 0.95,
  },
  ak47: {
    id: 'ak47', kind: 'weapon', name: 'AK-47', short: 'Assault Rifle',
    mag: 30, damage: 33, rps: 5.6, auto: true,
    reload: 2.35, reloadEmpty: 2.95, spread: 1.45, adsSpread: 0.5,
    recoil: 1.35, camKick: 1.3, range: 165, ammoPer: 60, moveMul: 0.9,
  },
};

export const CONSUMABLES = {
  bandage: {
    id: 'bandage', kind: 'item', name: 'Bandages', short: 'Heal',
    useTime: 2.0, heal: 25, healCap: 100, maxStack: 15, rarity: 'common',
    verb: 'Bandaging',
  },
  shield: {
    id: 'shield', kind: 'item', name: 'Small Shield Potion', short: 'Shield',
    useTime: 2.2, shield: 25, shieldCap: 100, maxStack: 6, rarity: 'uncommon',
    verb: 'Drinking',
  },
};

export const ALL_WEAPON_IDS = Object.keys(WEAPONS);

let UID = 1;

export function rollRarity(rng, luck = 0) {
  const entries = RARITY_ORDER.map((k, i) => ({ k, w: RARITY[k].w * (1 + luck * i * 0.35) }));
  return weighted(rng, entries).k;
}

export function makeWeapon(id, rarity, rng) {
  const def = WEAPONS[id];
  const mult = RARITY[rarity].mult;
  return {
    uid: UID++, kind: 'weapon', id, def, rarity,
    name: def.name,
    damage: Math.round(def.damage * mult),
    reload: def.reload / (1 + (mult - 1) * 0.55),
    reloadEmpty: def.reloadEmpty / (1 + (mult - 1) * 0.55),
    spread: def.spread / (1 + (mult - 1) * 0.8),
    adsSpread: def.adsSpread / (1 + (mult - 1) * 0.8),
    mag: def.mag,
    ammo: def.mag,
    reserve: def.ammoPer + (rng ? Math.floor(rng() * def.ammoPer * 0.5) : 0),
  };
}

export function makeConsumable(id, count = 1) {
  const def = CONSUMABLES[id];
  return { uid: UID++, kind: 'item', id, def, rarity: def.rarity, name: def.name, count };
}

/** Score used by AI (and the "is this an upgrade?" check). */
export function itemScore(it) {
  if (!it) return 0;
  if (it.kind === 'weapon') {
    const r = RARITY_ORDER.indexOf(it.rarity);
    const dps = it.damage * it.def.rps * (it.def.auto ? 1 : 0.85);
    return 100 + dps * 0.6 + r * 22;
  }
  return 10;
}

export function chestLoot(rng, luck = 0) {
  const out = [];
  const nWeapons = rng() < 0.34 ? 2 : 1;
  for (let i = 0; i < nWeapons; i++) {
    const id = ALL_WEAPON_IDS[Math.floor(rng() * ALL_WEAPON_IDS.length)];
    out.push(makeWeapon(id, rollRarity(rng, luck), rng));
  }
  const nItems = 1 + (rng() < 0.5 ? 1 : 0);
  for (let i = 0; i < nItems; i++) {
    if (rng() < 0.52) out.push(makeConsumable('bandage', 3 + Math.floor(rng() * 3)));
    else out.push(makeConsumable('shield', 1 + Math.floor(rng() * 2)));
  }
  return out;
}

export function floorLoot(rng) {
  if (rng() < 0.6) {
    const id = ALL_WEAPON_IDS[Math.floor(rng() * ALL_WEAPON_IDS.length)];
    return makeWeapon(id, rollRarity(rng, -0.35), rng);
  }
  return rng() < 0.5 ? makeConsumable('bandage', 3) : makeConsumable('shield', 1);
}

// ---------------------------------------------------------------------------
export class Inventory {
  constructor(size = 5) {
    this.size = size;
    this.slots = new Array(size).fill(null);
    this.selected = 0;      // 0..size-1 = inventory, size = pickaxe
    this.wood = 0;
  }
  get pickaxeSlot() { return this.size; }
  get current() { return this.selected >= this.size ? null : this.slots[this.selected]; }
  get holdingPickaxe() { return this.selected >= this.size; }

  firstEmpty() { return this.slots.indexOf(null); }

  /** Returns { added:boolean, slot:number, leftover:item|null } */
  add(item) {
    if (item.kind === 'item') {
      for (let i = 0; i < this.size; i++) {
        const s = this.slots[i];
        if (s && s.kind === 'item' && s.id === item.id && s.count < s.def.maxStack) {
          const room = s.def.maxStack - s.count;
          const move = Math.min(room, item.count);
          s.count += move; item.count -= move;
          if (item.count <= 0) return { added: true, slot: i, leftover: null };
        }
      }
    }
    const e = this.firstEmpty();
    if (e >= 0) { this.slots[e] = item; return { added: true, slot: e, leftover: null }; }
    return { added: false, slot: -1, leftover: item };
  }

  remove(slot) { const it = this.slots[slot]; this.slots[slot] = null; return it; }

  consumeOne(slot) {
    const s = this.slots[slot];
    if (!s || s.kind !== 'item') return false;
    s.count--;
    if (s.count <= 0) this.slots[slot] = null;
    return true;
  }

  /** Index of the best weapon, or -1. */
  bestWeapon() {
    let best = -1, score = 0;
    for (let i = 0; i < this.size; i++) {
      const s = this.slots[i];
      if (s && s.kind === 'weapon') { const sc = itemScore(s); if (sc > score) { score = sc; best = i; } }
    }
    return best;
  }
  worstWeaponSlot() {
    let worst = -1, score = Infinity;
    for (let i = 0; i < this.size; i++) {
      const s = this.slots[i];
      if (s && s.kind === 'weapon') { const sc = itemScore(s); if (sc < score) { score = sc; worst = i; } }
    }
    return worst;
  }
  findItem(id) { return this.slots.findIndex(s => s && s.kind === 'item' && s.id === id); }
  countWeapons() { return this.slots.filter(s => s && s.kind === 'weapon').length; }
}

// ---------------------------------------------------------------------------
export class Pickup {
  constructor(item, x, y, z, scene) {
    this.item = item;
    this.kind = 'pickup';
    this.pos = new THREE.Vector3(x, y, z);
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    const rc = RARITY[item.rarity] || RARITY.common;
    const mesh = makeItemMesh(item);
    mesh.position.y = 0.55;
    this.group.add(mesh);
    this.spin = mesh;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 2.4, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: rc.glow, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false })
    );
    beam.position.y = 1.2;
    this.group.add(beam);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 14),
      new THREE.MeshBasicMaterial({ color: rc.glow, transparent: true, opacity: 0.55, depthWrite: false })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.04;
    this.group.add(disc);
    scene.add(this.group);
    this.t = Math.random() * 6;
    this.alive = true;
    this.vel = new THREE.Vector3();
    this.settled = false;
  }
  update(dt, physics) {
    this.t += dt;
    this.spin.rotation.y += dt * 1.5;
    this.spin.position.y = 0.55 + Math.sin(this.t * 2) * 0.07;
    if (!this.settled) {
      this.vel.y -= 22 * dt;
      this.pos.addScaledVector(this.vel, dt);
      const g = physics.floorAt(this.pos.x, this.pos.z, this.pos.y + 0.5, 0.3);
      if (this.pos.y <= g) { this.pos.y = g; this.vel.set(0, 0, 0); this.settled = true; }
      this.group.position.copy(this.pos);
    }
  }
  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.alive = false;
  }
}

export class Chest {
  constructor(x, y, z, rotY, scene, physics, tag = '') {
    this.kind = 'chest';
    this.tag = tag;
    this.pos = new THREE.Vector3(x, y, z);
    this.mesh = makeChestMesh();
    this.mesh.scale.setScalar(0.8);
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.y = rotY;
    scene.add(this.mesh);
    this.opened = false;
    this.lidT = 0;
    this.collider = physics.addBox(x - 0.56, y, z - 0.45, x + 0.56, y + 0.78, z + 0.45, { tag: 'chest' });
    this.collider.owner = this;
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd97a, transparent: true, opacity: 0.16, depthWrite: false });
    this.glow = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 2.2, 10, 1, true), glowMat);
    this.glow.position.set(x, y + 1.1, z);
    scene.add(this.glow);
  }
  open(rng, luck, spawnPickup) {
    if (this.opened) return [];
    this.opened = true;
    const loot = chestLoot(rng, luck);
    let i = 0;
    for (const item of loot) {
      const a = (i / loot.length) * TAU + rng() * 0.5;
      spawnPickup(item, this.pos.x + Math.cos(a) * 0.2, this.pos.y + 1.0, this.pos.z + Math.sin(a) * 0.2,
        Math.cos(a) * 2.2, 4.2, Math.sin(a) * 2.2);
      i++;
    }
    return loot;
  }
  update(dt) {
    if (this.opened && this.lidT < 1) {
      this.lidT = Math.min(1, this.lidT + dt * 2.4);
      this.mesh.userData.lid.rotation.x = -this.lidT * 1.9;
      this.glow.visible = false;
    } else if (!this.opened) {
      this.glow.material.opacity = 0.12 + Math.sin(performance.now() * 0.003) * 0.05;
    }
  }
}
