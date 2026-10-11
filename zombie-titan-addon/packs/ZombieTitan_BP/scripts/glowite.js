// Glowite: what its ore drops, the plain furnace that can't take raw glowite, and the armor's
// toughness and knockback resistance (Bedrock armor items have neither, so they're done here).
import { GameMode, ItemStack, system, world } from "@minecraft/server";
import * as U from "./util.js";

/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Block} Block */
/** @typedef {import("@minecraft/server").Dimension} Dimension */

export const ORE = "zt:glowite_ore";
export const RAW = "zt:raw_glowite";
export const PARTICLES = "zt:glowing_particles";
export const ARMOR = ["zt:glowite_helmet", "zt:glowite_chestplate", "zt:glowite_leggings", "zt:glowite_boots"];
const ARMOR_SLOTS = ["Head", "Chest", "Legs", "Feet"];

/** Knockback each Glowite piece takes off (netherite's is 10%). */
export const KNOCKBACK_RESISTANCE = 0.15;
/** Hits of this much or more are cut by the armor's toughness... */
export const TOUGH_HIT = 4;
/** ...by this much per piece (and by BIG_CUT for hits of BIG_HIT or more). */
export const TOUGH_CUT = 0.05;
export const BIG_HIT = 10;
export const BIG_CUT = 0.075;
/** How hard a hit knocks a player back (blocks per tick, as vanilla's). */
const KNOCKBACK = 0.4;

// ---------------------------------------------------------------- the ore
/** @param {ItemStack | undefined} tool */
function goodPickaxe(tool) {
  if (!tool) return false;
  try {
    return tool.hasTag("minecraft:is_pickaxe") && (tool.hasTag("minecraft:diamond_tier") || tool.hasTag("minecraft:netherite_tier"));
  } catch {
    return false;
  }
}

/** @param {ItemStack} tool @param {string} id */
function enchantLevel(tool, id) {
  try {
    return tool.getComponent("minecraft:enchantable")?.getEnchantment(id)?.level ?? 0;
  } catch {
    return 0;
  }
}

/**
 * A player broke Glowite ore: Glowing Particles (one or two, more with Fortune) for a
 * diamond-tier pickaxe or better, the ore itself with Silk Touch, nothing for anything less.
 * @param {Player} player @param {import("@minecraft/server").Vector3} at @param {ItemStack | undefined} tool
 */
export function onOreBroken(player, at, tool) {
  try {
    if (player.getGameMode() === GameMode.Creative) return;
  } catch {
    return;
  }
  if (!goodPickaxe(tool)) return;
  const dim = player.dimension;
  const c = { x: Math.floor(at.x) + 0.5, y: Math.floor(at.y) + 0.5, z: Math.floor(at.z) + 0.5 };
  U.particle(dim, "zt:spore_pop", c);
  if (enchantLevel(/** @type {ItemStack} */ (tool), "silk_touch") > 0) {
    // the game may drop a silk-touched block itself: the ore is only dropped if it didn't
    system.runTimeout(() => {
      if (!droppedNear(dim, c, ORE)) spawn(dim, new ItemStack(ORE, 1), c);
    }, 2);
    return;
  }
  const fortune = enchantLevel(/** @type {ItemStack} */ (tool), "fortune");
  spawn(dim, new ItemStack(PARTICLES, 1 + U.randInt(0, 1) + (fortune > 0 ? U.randInt(0, fortune) : 0)), c);
}

/** @param {Dimension} dim @param {ItemStack} item @param {import("@minecraft/server").Vector3} at */
function spawn(dim, item, at) {
  try {
    dim.spawnItem(item, at);
  } catch {
    /* unloaded */
  }
}

/** Is an item of this kind lying by a point? @param {Dimension} dim @param {import("@minecraft/server").Vector3} at @param {string} id */
function droppedNear(dim, at, id) {
  try {
    return dim.getEntities({ location: at, maxDistance: 1.5, type: "minecraft:item" })
      .some((e) => e.getComponent("minecraft:item")?.itemStack?.typeId === id);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- the furnace
/** Plain furnaces players opened lately: "dim|x,y,z" -> where, and until when to keep an eye on them. */
const watched = new Map();
const FURNACE = /^minecraft:(lit_)?furnace$/;
/** How long a furnace is watched after it was last opened (a minute). */
const WATCH_TICKS = 1200;

/** @param {Dimension} dim @param {import("@minecraft/server").Vector3} l */
const keyOf = (dim, l) => `${dim.id}|${l.x},${l.y},${l.z}`;

/** A player opened a block: a plain furnace gets watched for raw glowite. @param {Block} block */
export function onInteract(block) {
  if (!FURNACE.test(block.typeId)) return;
  const l = block.location;
  watched.set(keyOf(block.dimension, l), { dim: block.dimension.id, at: { x: l.x, y: l.y, z: l.z }, until: system.currentTick + WATCH_TICKS, warned: false });
}

/** Furnaces watched (for tests). */
export function watchedCount() {
  return watched.size;
}

/** @param {number} tick */
export function furnaceTick(tick) {
  if (tick % 5 !== 0 || watched.size === 0) return;
  for (const [k, w] of [...watched]) {
    if (tick > w.until) {
      watched.delete(k);
      continue;
    }
    const dim = world.getDimension(w.dim);
    let block;
    try {
      block = dim.getBlock(w.at);
    } catch {
      continue;
    }
    if (!block) continue;
    if (!FURNACE.test(block.typeId)) {
      watched.delete(k);
      continue;
    }
    const c = block.getComponent("minecraft:inventory")?.container;
    let input;
    let fuel;
    try {
      input = c?.getItem(0);
      fuel = c?.getItem(1);
    } catch {
      continue;
    }
    if (input?.typeId !== RAW || !c) continue;
    // it goes up once it's burning (or has fuel to burn); until then it only rattles
    if (block.typeId === "minecraft:lit_furnace" || fuel) {
      blowUp(dim, block, c, input);
      watched.delete(k);
    } else if (!w.warned) {
      w.warned = true;
      for (const p of nearPlayers(dim, block.center(), 12)) U.actionbar(p, "§6The furnace rattles... §7raw glowite needs a §bBlast Furnace");
      U.sound(dim, "random.fizz", block.center(), 0.6, 0.6);
    }
  }
}

/** @param {Dimension} dim @param {import("@minecraft/server").Vector3} at @param {number} r */
function nearPlayers(dim, at, r) {
  try {
    return dim.getPlayers({ location: at, maxDistance: r });
  } catch {
    return [];
  }
}

/**
 * Raw glowite in a plain furnace: the furnace can't take the heat and blows up. The glowite is
 * thrown clear afterwards (it'll still smelt in a blast furnace).
 * @param {Dimension} dim @param {Block} block @param {import("@minecraft/server").Container} c @param {ItemStack} input
 */
function blowUp(dim, block, c, input) {
  const at = block.center();
  try {
    c.setItem(0, undefined);
  } catch {
    /* ignore */
  }
  for (const p of nearPlayers(dim, at, 12)) U.actionbar(p, "§cThe furnace couldn't take the heat of raw glowite! §7(use a §bBlast Furnace§7)");
  U.particle(dim, "zt:spore_pop", at);
  try {
    dim.createExplosion(at, 3, { breaksBlocks: true, causesFire: false });
  } catch {
    /* ignore */
  }
  system.runTimeout(() => {
    try {
      const item = dim.spawnItem(input, { x: at.x, y: at.y + 0.5, z: at.z });
      item.applyImpulse({ x: U.rand(-0.1, 0.1), y: 0.25, z: U.rand(-0.1, 0.1) });
    } catch {
      /* unloaded */
    }
  }, 4);
}

// ---------------------------------------------------------------- the armor
/** How many Glowite pieces a player wears. @param {Player} p */
export function piecesWorn(p) {
  let eq;
  try {
    eq = p.getComponent("minecraft:equippable");
  } catch {
    return 0;
  }
  if (!eq) return 0;
  let n = 0;
  for (let i = 0; i < 4; i++) {
    try {
      if (eq.getEquipment(/** @type {any} */ (ARMOR_SLOTS[i]))?.typeId === ARMOR[i]) n++;
    } catch {
      /* ignore */
    }
  }
  return n;
}

const PUSHED_BY = new Set(["entityAttack", "projectile", "entityExplosion", "blockExplosion", "ramAttack", "sonicBoom", "maceSmash"]);

/**
 * A player in Glowite armor was hurt. Toughness: a big hit is cut (5% a piece, 7.5% for a
 * hit of 10 or more), given back at once. Knockback resistance: 15% a piece of the push the
 * hit gave, pushed back the other way.
 * @param {Player} p @param {number} damage @param {import("@minecraft/server").EntityDamageSource} source
 */
export function onPlayerHurt(p, damage, source) {
  const pieces = piecesWorn(p);
  if (!pieces) return;
  let hp;
  try {
    hp = p.getComponent("minecraft:health");
  } catch {
    return;
  }
  if (!hp || hp.currentValue <= 0) return;
  if (damage >= TOUGH_HIT) {
    const back = damage * pieces * (damage >= BIG_HIT ? BIG_CUT : TOUGH_CUT);
    try {
      hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + back));
    } catch {
      /* ignore */
    }
  }
  const by = source.damagingEntity;
  if (!by || !PUSHED_BY.has(source.cause)) return;
  let from;
  try {
    from = by.location;
  } catch {
    return;
  }
  const dx = p.location.x - from.x;
  const dz = p.location.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.01) return;
  const back = KNOCKBACK * KNOCKBACK_RESISTANCE * pieces;
  try {
    p.applyKnockback({ x: (-dx / d) * back, z: (-dz / d) * back }, 0);
  } catch {
    /* ignore */
  }
}
