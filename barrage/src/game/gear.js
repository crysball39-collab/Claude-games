/* =============================================================================
   Gear: what the Stall sells, and the things people hold.

   ITEMS is the catalogue. Every item has a slot it goes in: swords in the
   WEAPON slot, the shield in the OFFHAND, the four pieces of wood armour in
   the HELMET, CHESTPLATE, LEGGINGS and BOOTS slots, and the bead bracelet
   and the oak charm in either of the two ACCESSORY slots. What armour and
   accessories look like on you, and what they do, is in outfit.js.

   Every sword has a rarity, from Common to Godly - the bronze sword and the
   rusty one share Uncommon, the rest have one each. The Stall sells all but
   the Secret one, dearer the rarer; and any box ragdoll
   you put down may drop one - a champion always does - rarer ones less often,
   less rarely the further you get.

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
import { Vector3, Quaternion, Mesh, MeshLambertMaterial, BoxGeometry, Group, Color } from 'three';
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

/** The rarities, commonest first, each with its colour. */
export const RARITIES = [
  { id: 'common', name: 'Common', color: '#c9c2b2' },
  { id: 'uncommon', name: 'Uncommon', color: '#6fd06f' },
  { id: 'rare', name: 'Rare', color: '#4f9dff' },
  { id: 'epic', name: 'Epic', color: '#b673ff' },
  { id: 'super_epic', name: 'Super Epic', color: '#ff62d4' },
  { id: 'legendary', name: 'Legendary', color: '#ffb22e' },
  { id: 'mythic', name: 'Mythic', color: '#ff4d4d' },
  { id: 'transcendent', name: 'Transcendent', color: '#7ff3ff' },
  { id: 'secret', name: 'Secret', color: '#a98bff' },
  { id: 'godly', name: 'Godly', color: '#fff07a' },
];
export const RARITY = Object.fromEntries(RARITIES.map((r, i) => [r.id, { ...r, tier: i }]));

export const ITEMS = {
  // swords, one of each rarity. stats are out of 10
  wooden_sword: {
    id: 'wooden_sword', name: 'Wooden Sword', slot: 'weapon', rarity: 'common', price: 10, sell: 5,
    blurb: 'Hard oak, shaped like a sword. It bruises, and splits the skin when it lands hard.',
    hit: 'wood', strikeMass: 2.4, damageBase: 6, damage: 1.6, rate: 1.15, cost: 8,
    size: [0.07, 0.034, 0.9], grip: 0.11,
    stats: [['Damage', 2], ['Speed', 7], ['Reach', 5]], marks: 'Bruises, splits',
  },
  rusty_sword: {
    id: 'rusty_sword', name: 'Rusty Steel Sword', slot: 'weapon', rarity: 'uncommon', price: 50, sell: 25,
    blurb: 'Pitted and notched, but it is steel. It cuts, and a full swing opens a slash.',
    hit: 'blade', strikeMass: 2.9, damageBase: 9, damage: 2.2, rate: 1.0, cost: 10,
    size: [0.062, 0.018, 1.0], grip: 0.12,
    stats: [['Damage', 3], ['Speed', 6], ['Reach', 6]], marks: 'Cuts, slashes',
  },
  bronze_sword: {
    id: 'bronze_sword', name: 'Bronze Sword', slot: 'weapon', rarity: 'uncommon', price: 80, sell: 40,
    blurb: 'An old leaf-bladed sword of bronze, green at the edges with age. Quicker in the hand than the rusty one, and not as good as iron.',
    hit: 'blade', strikeMass: 2.95, damageBase: 10, damage: 2.35, rate: 1.08, cost: 9,
    size: [0.07, 0.02, 0.92], grip: 0.11,
    look: { flat: '#b07a3a', edge: '#d8a45e', fuller: '#8a5a26', patina: true, guard: '#6a4520', pommel: '#8a5a26', grip: '#2e1d10', wrap: '#4a3018' },
    stats: [['Damage', 3], ['Speed', 7], ['Reach', 5]], marks: 'Cuts, slashes',
  },
  iron_sword: {
    id: 'iron_sword', name: 'Iron Sword', slot: 'weapon', rarity: 'rare', price: 120, sell: 60,
    blurb: 'Plain, true iron, kept sharp. It cuts deeper than the rusty one and swings as quick.',
    hit: 'blade', strikeMass: 3.0, damageBase: 11, damage: 2.5, rate: 1.05, cost: 9,
    size: [0.064, 0.018, 1.0], grip: 0.12,
    look: { flat: '#c3c8cc', edge: '#eef2f4', fuller: '#959ca1', guard: '#6f7478', pommel: '#858b90', grip: '#3a2a1c', wrap: '#6a5038' },
    stats: [['Damage', 4], ['Speed', 6], ['Reach', 6]], marks: 'Cuts, slashes',
  },
  bronze_gladius: {
    id: 'bronze_gladius', name: 'Bronze Gladius', slot: 'weapon', rarity: 'epic', price: 250, sell: 125,
    blurb: 'A short, broad arena blade of bronze. Quick in the hand: it cuts and cuts again.',
    hit: 'blade', strikeMass: 3.0, damageBase: 13, damage: 2.8, rate: 1.25, cost: 8,
    size: [0.086, 0.02, 0.82], grip: 0.11,
    look: { flat: '#c98a3c', edge: '#f2c67e', fuller: '#9c6526', guard: '#7a4e1e', pommel: '#b07a34', grip: '#2e1d10', wrap: '#5a3a1e' },
    stats: [['Damage', 5], ['Speed', 8], ['Reach', 4]], marks: 'Cuts, slashes',
  },
  crimson_falchion: {
    id: 'crimson_falchion', name: 'Crimson Falchion', slot: 'weapon', rarity: 'super_epic', price: 500, sell: 250,
    blurb: 'A broad, heavy blade stained red to the hilt. It hits hard and opens long slashes.',
    hit: 'blade', strikeMass: 3.3, damageBase: 15, damage: 3.1, rate: 1.05, cost: 10,
    size: [0.1, 0.02, 1.0], grip: 0.12,
    look: { flat: '#a3262a', edge: '#ec6464', fuller: '#6e1418', guard: '#2a2a2e', pommel: '#a3262a', grip: '#1e1416', wrap: '#4a1a1c' },
    stats: [['Damage', 6], ['Speed', 6], ['Reach', 6]], marks: 'Cuts, slashes',
  },
  golden_spatha: {
    id: 'golden_spatha', name: 'Golden Spatha', slot: 'weapon', rarity: 'legendary', price: 1000, sell: 500,
    blurb: 'A long cavalry sword, gilded and balanced. It reaches far, cuts deep and gleams in the sun.',
    hit: 'blade', strikeMass: 3.4, damageBase: 18, damage: 3.4, rate: 1.1, cost: 10,
    size: [0.07, 0.02, 1.15], grip: 0.12,
    look: { flat: '#e3b23c', edge: '#fff0a8', fuller: '#b8861e', guard: '#8a5a12', pommel: '#ffd76a', grip: '#3a2410', wrap: '#7a4a14', glow: '#ffb020', glowI: 0.22 },
    stats: [['Damage', 7], ['Speed', 7], ['Reach', 8]], marks: 'Cuts, slashes',
  },
  dragonbone_blade: {
    id: 'dragonbone_blade', name: 'Dragonbone Blade', slot: 'weapon', rarity: 'mythic', price: 2500, sell: 1250,
    blurb: 'Carved from the jaw of something enormous: bone-white, veined with embers. It bites through anything.',
    hit: 'blade', strikeMass: 3.7, damageBase: 21, damage: 3.8, rate: 1.1, cost: 11,
    size: [0.11, 0.03, 1.15], grip: 0.13,
    look: { flat: '#efe6d2', edge: '#fffaee', fuller: '#c9b89a', vein: '#ff5a1e', guard: '#5a1a10', pommel: '#efe6d2', grip: '#2a1410', wrap: '#6a2a18', glow: '#ff8a4a', glowI: 0.08 },
    stats: [['Damage', 8], ['Speed', 7], ['Reach', 8]], marks: 'Cuts, slashes',
  },
  starsteel_edge: {
    id: 'starsteel_edge', name: 'Starsteel Edge', slot: 'weapon', rarity: 'transcendent', price: 5000, sell: 2500,
    blurb: 'Forged from a fallen star. It weighs nothing, swings like a thought and leaves a cold blue light behind it.',
    hit: 'blade', strikeMass: 3.6, damageBase: 25, damage: 4.2, rate: 1.3, cost: 8,
    size: [0.07, 0.02, 1.2], grip: 0.12,
    look: { flat: '#a6ecff', edge: '#ffffff', fuller: '#4fb9e8', stars: true, guard: '#e0f8ff', pommel: '#7ff3ff', grip: '#1a2a3a', wrap: '#3a6a8a', glow: '#7ff3ff', glowI: 0.5 },
    stats: [['Damage', 9], ['Speed', 9], ['Reach', 8]], marks: 'Cuts, slashes',
  },
  shadow_fang: {
    id: 'shadow_fang', name: 'Shadow Fang', slot: 'weapon', rarity: 'secret', price: null, sell: 5000, secret: true,
    blurb: 'Nobody sells this. A blade of black glass that drinks the light around it, carried by a champion now and then.',
    hit: 'blade', strikeMass: 3.8, damageBase: 30, damage: 4.6, rate: 1.3, cost: 9,
    size: [0.08, 0.022, 1.15], grip: 0.12,
    look: { flat: '#141118', edge: '#7a4cc0', fuller: '#2a1a3a', guard: '#1a1a1a', pommel: '#7a4cc0', grip: '#0a0a0a', wrap: '#3a2050', glow: '#6a3acc', glowI: 0.12 },
    stats: [['Damage', 10], ['Speed', 9], ['Reach', 8]], marks: 'Cuts, slashes',
  },
  sunforged_greatsword: {
    id: 'sunforged_greatsword', name: 'Sunforged Greatsword', slot: 'weapon', rarity: 'godly', price: 25000, sell: 12500,
    blurb: 'A greatsword hammered out of sunlight. Nothing it touches stays standing.',
    hit: 'blade', strikeMass: 4.6, damageBase: 40, damage: 5.4, rate: 1.15, cost: 10,
    size: [0.13, 0.03, 1.45], grip: 0.16,
    look: { flat: '#fff3c0', edge: '#ffffff', fuller: '#ffd34a', rays: true, guard: '#ffb800', pommel: '#ffffff', grip: '#7a4a10', wrap: '#ffcf40', glow: '#ffe680', glowI: 0.75 },
    stats: [['Damage', 10], ['Speed', 8], ['Reach', 10]], marks: 'Cuts, slashes',
  },

  wood_shield: {
    id: 'wood_shield', name: 'Wood Shield', slot: 'offhand', price: 10, sell: 5,
    blurb: 'Oak planks, an iron rim and boss. Hold BLOCK to raise it: it stops fists, blades and bullets that come from the front.',
    block: 0.92, size: [0.5, 0.58, 0.045],
    stats: [['Block', 4], ['Weight', 2]], marks: 'Stops bullets',
  },

  // wood armour: each piece takes `guard` off a blow that lands on the wood
  // (half that off a bullet), and all four together make you harder to knock down.
  // `covers` names the parts it is strapped to; outfit.js has the shapes
  wood_helmet: {
    id: 'wood_helmet', name: 'Wooden Helmet', slot: 'helmet', price: 12, sell: 6, set: 'wood',
    blurb: 'An oak cap with a guard down the back and one over the nose. Blows that land on the wood do a third less; your face below the brim is still bare.',
    guard: 0.34, covers: ['head'],
    stats: [['Guard', 2], ['Covers', 1]], marks: 'Head',
  },
  wood_chestplate: {
    id: 'wood_chestplate', name: 'Wooden Chestplate', slot: 'chest', price: 20, sell: 10, set: 'wood',
    blurb: 'Oak slats strapped over the chest and belly, with pads on the shoulders. Blows that land on the wood do a third less.',
    guard: 0.34, covers: ['upperTorso', 'middleTorso', 'lowerTorso', 'upperArmL', 'upperArmR'],
    stats: [['Guard', 2], ['Covers', 4]], marks: 'Body, shoulders',
  },
  wood_leggings: {
    id: 'wood_leggings', name: 'Wooden Leggings', slot: 'legs', price: 15, sell: 7, set: 'wood',
    blurb: 'A girdle of oak over the hips, plates down the thighs and caps on the knees. Blows that land on the wood do a third less.',
    guard: 0.34, covers: ['pelvis', 'upperLegL', 'upperLegR'],
    stats: [['Guard', 2], ['Covers', 3]], marks: 'Hips, thighs',
  },
  wood_boots: {
    id: 'wood_boots', name: 'Wooden Boots', slot: 'boots', price: 8, sell: 4, set: 'wood',
    blurb: 'Oak clogs and shin guards. Blows that land on the wood do a third less.',
    guard: 0.34, covers: ['lowerLegL', 'lowerLegR', 'footL', 'footR'],
    stats: [['Guard', 2], ['Covers', 2]], marks: 'Shins, feet',
  },

  // accessories: either goes in either accessory slot, and two of a kind add up
  bead_bracelet: {
    id: 'bead_bracelet', name: 'Bead Bracelet', slot: 'accessory', price: 15, sell: 7,
    blurb: 'Carved oak beads on a cord, worn at the wrist. Your stamina comes back a third faster.',
    wind: 0.35,
    stats: [['Stamina', 3]], marks: 'Faster stamina',
  },
  oak_charm: {
    id: 'oak_charm', name: 'Oak Charm', slot: 'accessory', price: 15, sell: 7,
    blurb: 'A lucky knot of oak on a cord round your neck. You can take 20 more health of punishment before you fall.',
    health: 20,
    stats: [['Health', 3]], marks: '+20 health',
  },
};

/**
 * A sword dropped by someone you put down, or null. A champion always drops
 * one, anyone else now and then; the further you get, the better the odds
 * of a rare one.
 */
const DROP_WEIGHTS = {
  //            anyone, a champion
  common: [46, 8],
  uncommon: [26, 16],
  rare: [14, 24],
  epic: [7, 20],
  super_epic: [3.6, 13],
  legendary: [2, 9],
  mythic: [0.9, 5],
  transcendent: [0.35, 2.6],
  secret: [0.1, 1.6],
  godly: [0.05, 0.8],
};
export function rollDrop(champion, wave, random = Math.random) {
  if (!champion && random() > 0.05 + wave * 0.0025) return null;
  const luck = 1 + wave * 0.02;
  // swords that share a rarity share its odds
  const share = {};
  for (const id of SWORDS) share[ITEMS[id].rarity] = (share[ITEMS[id].rarity] || 0) + 1;
  const pool = SWORDS.map((id) => {
    const r = RARITY[ITEMS[id].rarity];
    return { id, w: DROP_WEIGHTS[r.id][champion ? 1 : 0] * Math.pow(luck, r.tier) / share[r.id] };
  });
  let x = random() * pool.reduce((a, p) => a + p.w, 0);
  for (const p of pool) { x -= p.w; if (x <= 0) return p.id; }
  return pool[pool.length - 1].id;
}

/** Every sword, commonest first. */
export const SWORDS = Object.values(ITEMS).filter((T) => T.slot === 'weapon').sort((a, b) => RARITY[a.rarity].tier - RARITY[b.rarity].tier).map((T) => T.id);
/** The order the Stall shows them in, and how it groups them. */
export const STOCK = [
  ...SWORDS, 'wood_shield',
  'wood_helmet', 'wood_chestplate', 'wood_leggings', 'wood_boots',
  'bead_bracelet', 'oak_charm',
];
export const SHELVES = [
  { name: 'Swords', kinds: SWORDS, note: 'Common to Godly. Box ragdolls drop them too, and a champion always does.' },
  { name: 'Shields', kinds: ['wood_shield'] },
  { name: 'Wood armour', kinds: ['wood_helmet', 'wood_chestplate', 'wood_leggings', 'wood_boots'], note: 'Wear all four and you are harder to knock down.' },
  { name: 'Accessories', kinds: ['bead_bracelet', 'oak_charm'], note: 'Two accessory slots: wear one of each, or two of a kind.' },
];

/** Equipment slots, in the order the inventory lays them out. */
export const SLOTS = [
  { id: 'helmet', name: 'Helmet', accepts: 'helmet', holds: 'A helmet goes here.' },
  { id: 'chest', name: 'Chestplate', accepts: 'chest', holds: 'A chestplate goes here.' },
  { id: 'legs', name: 'Leggings', accepts: 'legs', holds: 'Leggings go here.' },
  { id: 'boots', name: 'Boots', accepts: 'boots', holds: 'Boots go here.' },
  { id: 'weapon', name: 'Weapon', accepts: 'weapon', holds: 'A sword goes here.' },
  { id: 'offhand', name: 'Offhand', accepts: 'offhand', holds: 'A shield goes here.' },
  { id: 'acc1', name: 'Accessory', accepts: 'accessory', holds: 'A bracelet or a charm goes here.' },
  { id: 'acc2', name: 'Accessory', accepts: 'accessory', holds: 'A bracelet or a charm goes here.' },
];
export const SLOT = Object.fromEntries(SLOTS.map((s) => [s.id, s]));
/** What each kind of item is called by the slot it goes in. */
export const SLOT_KIND = { weapon: 'Weapon', offhand: 'Offhand', helmet: 'Helmet', chest: 'Chestplate', legs: 'Leggings', boots: 'Boots', accessory: 'Accessory' };
/** The slots that are worn rather than held. */
export const ARMOUR = ['helmet', 'chest', 'legs', 'boots'];
export const ACCESSORIES = ['acc1', 'acc2'];

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

/**
 * Any other sword, from its look: the flat and the edge, a fuller down the
 * middle, a wrapped grip, and whatever makes it what it is - embers in
 * dragonbone, stars in starsteel, rays of light in the Godly one.
 */
function paintBlade(ctx, tiles, size, grip, L, seed) {
  const r = rng(seed);
  const hilt = (grip + 0.06) / size.z;
  for (let fi = 0; fi < 6; fi++) {
    const t = tiles[fi];
    const flat = fi === FACE.py || fi === FACE.ny;
    ctx.fillStyle = flat ? L.flat : L.edge;
    ctx.fillRect(t.x - 1, t.y - 1, t.w + 2, t.h + 2);
    if (flat) {
      const len = t.h * (1 - hilt);
      ctx.fillStyle = L.fuller;
      ctx.fillRect(t.x + t.w * 0.42, t.y + len * 0.06, t.w * 0.16, len * 0.94);
      ctx.fillStyle = L.edge;
      const e = Math.max(1, t.w * 0.12);
      ctx.fillRect(t.x, t.y, e, len);
      ctx.fillRect(t.x + t.w - e, t.y, e, len);
      if (L.vein) {
        // embers in the bone: a crooked glowing seam either side of the fuller
        ctx.strokeStyle = L.vein;
        ctx.lineWidth = Math.max(1, t.w * 0.06);
        for (const side of [0.26, 0.74]) {
          ctx.beginPath();
          ctx.moveTo(t.x + t.w * side, t.y + 2);
          for (let y = 0; y < len; y += 6) ctx.lineTo(t.x + t.w * (side + (r() - 0.5) * 0.12), t.y + y);
          ctx.stroke();
        }
      }
      if (L.stars) {
        for (let k = 0; k < 40; k++) {
          ctx.fillStyle = r() < 0.3 ? '#ffffff' : 'rgba(255, 255, 255, 0.55)';
          ctx.fillRect(t.x + r() * t.w, t.y + r() * len, 1, 1 + (r() < 0.2 ? 1 : 0));
        }
      }
      if (L.patina) {
        // verdigris: green specks of age, thickest along the edges
        for (let k = 0; k < 40; k++) {
          ctx.fillStyle = r() < 0.5 ? 'rgba(74, 150, 120, 0.6)' : 'rgba(52, 116, 92, 0.5)';
          const x = r() < 0.6 ? (r() < 0.5 ? r() * t.w * 0.2 : t.w - r() * t.w * 0.2) : r() * t.w;
          const sz = 1 + r() * 2.5;
          ctx.fillRect(t.x + x, t.y + r() * len, sz, sz);
        }
      }
      if (L.rays) {
        for (let k = 0; k < 14; k++) {
          ctx.fillStyle = `rgba(255, 255, 255, ${0.25 + r() * 0.4})`;
          ctx.fillRect(t.x + r() * t.w, t.y + r() * len * 0.9, 1, 4 + r() * 14);
        }
      }
    }
    bandAtGripEnd(ctx, t, fi, hilt, L.grip);
    if (flat) {
      for (let k = 0; k < 6; k++) {
        ctx.fillStyle = L.wrap;
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
    else if (T.look) paintBlade(this.paint.ctx, tiles, this.size, T.grip, T.look, kind.length * 7);
    else if (this.isShield) paintShield(this.paint.ctx, tiles);
    else paintPistol(this.paint.ctx, tiles);
    this.paint.dirty = true;

    const geo = buildBoxGeometry([{ size: this.size }], this.layout);
    this.material = new MeshLambertMaterial({ map: this.paint.texture });
    // the rarest blades give off a light of their own
    if (T.look && T.look.glow) {
      this.material.emissive = new Color(T.look.glow);
      this.material.emissiveIntensity = T.look.glowI;
    }
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
    const glow = T.look && T.look.glowI >= 0.4 ? T.look.glow : null;
    const add = (size, pos, color) => {
      const m = new Mesh(new BoxGeometry(...size), new MeshLambertMaterial({ color, emissive: glow || '#000000', emissiveIntensity: glow ? 0.35 : 0 }));
      m.position.set(...pos);
      m.castShadow = true;
      this.mesh.add(m);
      return m;
    };
    const z0 = -this.size.z / 2;
    if (T.look) {
      const big = this.size.x > 0.1;
      add([this.size.x * 2.4 + 0.05, this.size.y + 0.018, big ? 0.05 : 0.034], [0, 0, z0 + T.grip + 0.06], T.look.guard);
      add([big ? 0.065 : 0.05, big ? 0.065 : 0.05, 0.045], [0, 0, z0 + 0.016], T.look.pommel);
    } else if (this.kind === 'wooden_sword') {
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
