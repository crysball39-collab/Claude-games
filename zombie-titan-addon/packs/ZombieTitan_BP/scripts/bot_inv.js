// A Player's inventory: its 36 slots (0-8 the hotbar) and its equipment (hands and armour).
// Counting, taking, holding, the best tool for a block, the best weapon, food and armour,
// tool wear, and tossing away what it doesn't want. The game hands out copies of items, so
// every change is written back.
import { EquipmentSlot, ItemStack, system } from "@minecraft/server";
import * as D from "./bot_data.js";
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Container} Container */

const HAND = EquipmentSlot.Mainhand;
const OFFHAND = EquipmentSlot.Offhand;
export const EQUIP = [EquipmentSlot.Mainhand, EquipmentSlot.Offhand, EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet];

/** @param {any} bot @returns {Container | undefined} */
export function container(bot) {
  try {
    return bot.entity.getComponent("minecraft:inventory")?.container;
  } catch {
    return undefined;
  }
}
/** @param {any} bot */
export function equippable(bot) {
  try {
    return bot.entity.getComponent("minecraft:equippable");
  } catch {
    return undefined;
  }
}
/** @param {any} bot @param {string} slot */
export function getEquip(bot, slot) {
  try {
    return equippable(bot)?.getEquipment(/** @type {any} */ (slot));
  } catch {
    return undefined;
  }
}
/** @param {any} bot @param {string} slot @param {ItemStack | undefined} item */
export function setEquip(bot, slot, item) {
  try {
    equippable(bot)?.setEquipment(/** @type {any} */ (slot), item);
    return true;
  } catch {
    return false;
  }
}

/**
 * Does an item id match what's wanted: an id, a group (D.GROUPS: "planks", "log", "wool"...),
 * "food", or a test.
 * @param {string} id @param {string | ((id: string) => boolean)} want
 */
export function matches(id, want) {
  if (typeof want === "function") return want(id);
  if (want === "food") return !!D.FOOD[D.bare(id)];
  if (D.GROUPS[want]) return D.GROUPS[want].includes(id);
  return id === D.mc(want);
}

/** Every stack: in the inventory (slot 0-35) or a piece of equipment. @param {any} bot */
export function stacks(bot) {
  /** @type {Array<{slot: number | string, item: ItemStack}>} */
  const out = [];
  const c = container(bot);
  if (c) {
    for (let i = 0; i < c.size; i++) {
      const it = c.getItem(i);
      if (it) out.push({ slot: i, item: it });
    }
  }
  for (const s of EQUIP) {
    const it = getEquip(bot, s);
    if (it) out.push({ slot: s, item: it });
  }
  return out;
}

/** How many it has (armour it wears counts). @param {any} bot @param {string | ((id: string) => boolean)} want */
export function count(bot, want) {
  let n = 0;
  for (const { item } of stacks(bot)) if (matches(item.typeId, want)) n += item.amount;
  return n;
}
/** @param {any} bot @param {string | ((id: string) => boolean)} want @param {number} [n] */
export function has(bot, want, n = 1) {
  return count(bot, want) >= n;
}
/** Ids it has of a group, most first. @param {any} bot @param {string | ((id: string) => boolean)} want */
export function idsOf(bot, want) {
  const tally = new Map();
  for (const { item } of stacks(bot)) if (matches(item.typeId, want)) tally.set(item.typeId, (tally.get(item.typeId) ?? 0) + item.amount);
  return [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/**
 * Put an item in its inventory (stacking it as the game does). What doesn't fit goes into an
 * empty hand, or falls at its feet. Returns true when all of it was kept.
 * @param {any} bot @param {ItemStack} item
 */
export function add(bot, item) {
  const c = container(bot);
  let left = item;
  if (c) {
    try {
      left = c.addItem(item);
    } catch {
      left = item;
    }
  }
  if (!left) return true;
  if (!getEquip(bot, HAND)) {
    setEquip(bot, HAND, left);
    return true;
  }
  drop(bot, left, false);
  return false;
}

/**
 * Take up to n of something out of its inventory (its hands last). Returns how many it took.
 * @param {any} bot @param {string | ((id: string) => boolean)} want @param {number} n
 */
export function take(bot, want, n) {
  let left = n;
  const c = container(bot);
  if (c) {
    for (let i = 0; i < c.size && left > 0; i++) {
      const it = c.getItem(i);
      if (!it || !matches(it.typeId, want)) continue;
      const k = Math.min(it.amount, left);
      left -= k;
      if (k >= it.amount) c.setItem(i, undefined);
      else {
        it.amount -= k;
        c.setItem(i, it);
      }
    }
  }
  for (const s of [OFFHAND, HAND]) {
    if (left <= 0) break;
    const it = getEquip(bot, s);
    if (!it || !matches(it.typeId, want)) continue;
    const k = Math.min(it.amount, left);
    left -= k;
    if (k >= it.amount) setEquip(bot, s, undefined);
    else {
      it.amount -= k;
      setEquip(bot, s, it);
    }
  }
  return n - left;
}

/** Remove one particular stack (by slot) and hand it back. @param {any} bot @param {number | string} slot */
export function takeSlot(bot, slot) {
  if (typeof slot === "number") {
    const c = container(bot);
    const it = c?.getItem(slot);
    if (it) c.setItem(slot, undefined);
    return it;
  }
  const it = getEquip(bot, slot);
  if (it) setEquip(bot, slot, undefined);
  return it;
}

/** What it holds. @param {any} bot */
export function held(bot) {
  return getEquip(bot, HAND);
}

/**
 * Take something into its hand (as a player picks a hotbar slot): what it held goes back where
 * the new item was. True if it now holds one. "nothing" empties its hand.
 * @param {any} bot @param {string | ((id: string) => boolean)} want
 */
export function hold(bot, want) {
  const cur = getEquip(bot, HAND);
  if (want === "nothing") {
    if (!cur) return true;
    const c = container(bot);
    if (!c || c.emptySlotsCount === 0) return false;
    setEquip(bot, HAND, undefined);
    add(bot, cur);
    return true;
  }
  if (cur && matches(cur.typeId, want)) return true;
  const c = container(bot);
  if (!c) return false;
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    if (!it || !matches(it.typeId, want)) continue;
    c.setItem(i, cur);
    setEquip(bot, HAND, it);
    bot.heldChanged = system.currentTick;
    return true;
  }
  return false;
}

/** Hold a particular item stack (tool or weapon) by id, preferring the least worn. @param {any} bot @param {string} id */
export function holdId(bot, id) {
  return hold(bot, (x) => x === id);
}

// ---------------------------------------------------------------- choosing
/** Enchantment level on an item. @param {ItemStack | undefined} item @param {string} ench */
export function enchantLevel(item, ench) {
  try {
    const e = item?.getComponent("minecraft:enchantable");
    return e?.getEnchantment?.(ench)?.level ?? 0;
  } catch {
    return 0;
  }
}

/** The tool it should use on a block (its id; undefined for the hand). @param {any} bot @param {string} blockId */
export function bestTool(bot, blockId) {
  const info = D.blockInfo(blockId);
  let best;
  let bestTicks = D.breakTicks(blockId, undefined);
  let bestTier = 0;
  for (const { item } of stacks(bot)) {
    const t = D.toolInfo(item.typeId);
    if (t.type === "hand") continue;
    // never waste a pickaxe on dirt it digs as fast by hand, and keep the good sword for fighting
    if (t.type === "sword" && !blockId.includes("web")) continue;
    if (info.tier && t.type === "pickaxe" && t.tier < info.tier) continue;
    const ticks = D.breakTicks(blockId, item.typeId, { efficiency: enchantLevel(item, "efficiency") });
    if (ticks < bestTicks || (ticks === bestTicks && best && t.tier < bestTier)) {
      best = item.typeId;
      bestTicks = ticks;
      bestTier = t.tier;
    }
  }
  return best;
}
/** Can it get the block's drop with what it has? @param {any} bot @param {string} blockId */
export function canHarvestWith(bot, blockId) {
  const info = D.blockInfo(blockId);
  if (!info.tier) return true;
  return stacks(bot).some(({ item }) => D.canHarvest(blockId, item.typeId));
}
/** Its best weapon's id (undefined: fists). @param {any} bot */
export function bestWeapon(bot) {
  let best;
  let dmg = 1;
  for (const { item } of stacks(bot)) {
    const t = D.toolInfo(item.typeId);
    let d = t.damage + enchantLevel(item, "sharpness") * 1.25;
    if (t.type === "sword") d += 0.5;     // swords swing faster: prefer them
    if (t.type === "pickaxe" || t.type === "shovel" || t.type === "hoe") d -= 1;
    if (d > dmg) {
      dmg = d;
      best = item.typeId;
    }
  }
  return best;
}
/** Attack damage of what it holds. @param {any} bot */
export function heldDamage(bot) {
  const it = held(bot);
  const t = D.toolInfo(it?.typeId);
  return t.damage + enchantLevel(it, "sharpness") * 1.25;
}
/**
 * The food it should eat: the one that fills it best without wasting much, never rotten flesh or
 * raw chicken unless starving, golden apples only when hurt badly.
 * @param {any} bot @param {number} missing hunger points missing @param {boolean} [desperate]
 */
export function bestFood(bot, missing, desperate = false) {
  let best;
  let score = -Infinity;
  for (const { item } of stacks(bot)) {
    const b = D.bare(item.typeId);
    const f = D.FOOD[b];
    if (!f) continue;
    if (D.BAD_FOOD.has(b) && !desperate) continue;
    const s = f[0] + f[0] * f[1] * 2 - Math.max(0, f[0] - missing) * 1.5 - (/golden/.test(b) ? 20 : 0);
    if (s > score) {
      score = s;
      best = item.typeId;
    }
  }
  return best;
}
/** Total armour points it wears. @param {any} bot */
export function armorPoints(bot) {
  let p = 0;
  for (const slot of [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet]) {
    p += D.armorInfo(getEquip(bot, slot)?.typeId)?.points ?? 0;
  }
  return p;
}
/** Put on the best armour it has; true if it changed anything. @param {any} bot */
export function equipArmor(bot) {
  let changed = false;
  const c = container(bot);
  if (!c) return false;
  for (const part of D.ARMOR_SLOTS) {
    const slot = D.ARMOR_EQUIP[part];
    const worn = getEquip(bot, slot);
    let best = { i: -1, points: D.armorInfo(worn?.typeId)?.points ?? 0 };
    for (let i = 0; i < c.size; i++) {
      const it = c.getItem(i);
      const a = D.armorInfo(it?.typeId);
      if (!a || a.slot !== part) continue;
      // gold keeps piglins calm: a Player in the Nether keeps one gold piece on
      const p = a.points + enchantLevel(it, "protection") * 0.5;
      if (p > best.points) best = { i, points: p };
    }
    if (best.i < 0) continue;
    const it = c.getItem(best.i);
    c.setItem(best.i, worn);
    setEquip(bot, slot, it);
    changed = true;
  }
  // a shield goes in the off hand
  const off = getEquip(bot, OFFHAND);
  if (!off || off.typeId !== "minecraft:shield") {
    for (let i = 0; i < c.size; i++) {
      const it = c.getItem(i);
      if (it?.typeId !== "minecraft:shield") continue;
      c.setItem(i, off);
      setEquip(bot, OFFHAND, it);
      changed = true;
      break;
    }
  }
  return changed;
}

/**
 * Wear the held tool (unbreaking may spare it). Returns "broke" when it breaks (it's gone).
 * @param {any} bot @param {number} amount
 */
export function wearHeld(bot, amount = 1) {
  return wearSlot(bot, HAND, amount);
}
/** @param {any} bot @param {string} slot @param {number} amount */
export function wearSlot(bot, slot, amount = 1) {
  const it = getEquip(bot, slot);
  if (!it) return "none";
  let dur;
  try {
    dur = it.getComponent("minecraft:durability");
  } catch {
    dur = undefined;
  }
  if (!dur) return "none";
  const unb = enchantLevel(it, "unbreaking");
  let wear = 0;
  for (let k = 0; k < amount; k++) if (!unb || Math.random() < 1 / (unb + 1)) wear++;
  if (!wear) return "ok";
  if (dur.damage + wear >= dur.maxDurability) {
    setEquip(bot, slot, undefined);
    return "broke";
  }
  dur.damage += wear;
  setEquip(bot, slot, it);
  return dur.maxDurability - dur.damage < dur.maxDurability * 0.1 ? "low" : "ok";
}
/** Fraction of durability left on a stack (1 for items without durability). @param {ItemStack} it */
export function durabilityLeft(it) {
  try {
    const d = it.getComponent("minecraft:durability");
    return d ? 1 - d.damage / d.maxDurability : 1;
  } catch {
    return 1;
  }
}

/** Free slots. @param {any} bot */
export function freeSlots(bot) {
  return container(bot)?.emptySlotsCount ?? 0;
}

// ---------------------------------------------------------------- dropping
/**
 * Drop a stack in front of it (tossed, as a player throws one out), or at its feet. It won't
 * pick a tossed item back up for a minute.
 * @param {any} bot @param {ItemStack} item @param {boolean} [toss]
 */
export function drop(bot, item, toss = true) {
  const e = bot.entity;
  try {
    const head = e.getHeadLocation();
    const f = { x: -Math.sin((bot.yaw * Math.PI) / 180), z: Math.cos((bot.yaw * Math.PI) / 180) };
    const at = toss ? { x: head.x + f.x * 0.4, y: head.y - 0.3, z: head.z + f.z * 0.4 } : { ...e.location, y: e.location.y + 0.3 };
    const ent = e.dimension.spawnItem(item, at);
    if (toss) {
      try {
        ent.applyImpulse({ x: f.x * 0.3, y: 0.1, z: f.z * 0.3 });
      } catch {
        /* items can't always be pushed */
      }
    }
    if (ent?.id) bot.tossed.set(ent.id, system.currentTick + 1200);
    return ent;
  } catch {
    return undefined;
  }
}
/**
 * Toss n of something it doesn't want. Returns how many it tossed.
 * @param {any} bot @param {string | ((id: string) => boolean)} want @param {number} n
 */
export function toss(bot, want, n) {
  const ids = idsOf(bot, want);
  let done = 0;
  for (const id of ids) {
    while (done < n) {
      const k = take(bot, id, Math.min(n - done, new ItemStack(id).maxAmount));
      if (!k) break;
      drop(bot, new ItemStack(id, k));
      done += k;
    }
  }
  return done;
}

/** Junk: what a Player throws away when its pockets are full (keeping a little of each). @type {Array<[string, number]>} */
export const JUNK = [
  ["minecraft:rotten_flesh", 8], ["minecraft:poisonous_potato", 0], ["minecraft:wheat_seeds", 8], ["minecraft:dirt", 32],
  ["minecraft:cobblestone", 128], ["minecraft:cobbled_deepslate", 32], ["minecraft:netherrack", 64],
  ["minecraft:gravel", 16], ["minecraft:granite", 16], ["minecraft:diorite", 16], ["minecraft:andesite", 16], ["minecraft:tuff", 0],
  ["minecraft:calcite", 0], ["minecraft:netherrack", 48], ["minecraft:sand", 16], ["minecraft:oak_sapling", 4], ["minecraft:dandelion", 0],
  ["minecraft:poppy", 0], ["minecraft:spider_eye", 2], ["minecraft:bone", 8], ["minecraft:cobbled_deepslate", 64], ["minecraft:snowball", 0],
  ["minecraft:clay_ball", 0], ["minecraft:green_dye", 0], ["minecraft:feather", 32],
];

/** A short list of what it carries ("12 cobblestone, a stone pickaxe..."). @param {any} bot @param {number} [max] */
export function summary(bot, max = 12) {
  const tally = new Map();
  for (const { item } of stacks(bot)) tally.set(item.typeId, (tally.get(item.typeId) ?? 0) + item.amount);
  const parts = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([id, k]) => `${k} ${D.bare(id).replace(/_/g, " ")}`);
  return parts.join(", ") || "nothing";
}
