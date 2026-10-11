// The Glowshroom Biome. World generation leaves a hidden heart deep in the overworld (about one
// chunk in forty, at y -36); when a player comes near, the cavern is grown round it a little at
// a time: carved out of the deepslate, floored with spore grass on maroon dirt, planted with spore
// grass plants and spore mushrooms, and shaded by giant spore trees, with a few Glowite ores in
// its roof. Shroom Zombies and Shroom Skeletons live there.
//
// Also the biome's blocks: spore grass spreading over maroon dirt, the spore crop growing, bone
// meal and hoes on them, and the Glowshroom door, trapdoor, fence gate, slab, button and pressure
// plate (custom components registered at startup).
import { GameMode, system, world } from "@minecraft/server";
import * as U from "./util.js";

/** @typedef {import("@minecraft/server").Block} Block */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

export const HEART = "zt:glowshroom_heart";
/** Where world generation puts the hearts (gen_glowite_data.py's HEART_Y). */
export const HEART_Y = -36;
export const GRASS = "zt:spore_grass";
export const DIRT = "zt:maroon_dirt";
export const PLANT = "zt:spore_grass_plant";
export const MUSHROOM = "zt:spore_mushroom";
export const LOG = "zt:glowshroom_log";
export const CAP = "zt:mushed_spore_cap";
export const CROP = "zt:spore_crop";
export const ORE = "zt:glowite_ore";
export const SLAB = "zt:glowshroom_slab";
export const DOOR = "zt:glowshroom_door";
export const TRAPDOOR = "zt:glowshroom_trapdoor";
export const GATE = "zt:glowshroom_fence_gate";
export const BUTTON = "zt:glowshroom_button";
export const PLATE = "zt:glowshroom_pressure_plate";
const AIR = "minecraft:air";
const MOBS = ["zt:shroom_zombie", "zt:shroom_zombie", "zt:shroom_zombie", "zt:shroom_skeleton", "zt:shroom_skeleton"];

// ---------------------------------------------------------------- small helpers
/** @param {Dimension} dim @param {number} x @param {number} y @param {number} z */
function blockAt(dim, x, y, z) {
  try {
    return dim.getBlock({ x, y, z });
  } catch {
    return undefined;
  }
}
/** @param {Dimension} dim @param {number} x @param {number} y @param {number} z */
function idAt(dim, x, y, z) {
  return blockAt(dim, x, y, z)?.typeId;
}
/** @param {Dimension} dim @param {number} x @param {number} y @param {number} z @param {string} id */
function setAt(dim, x, y, z, id) {
  try {
    dim.setBlockType({ x, y, z }, id);
    return true;
  } catch {
    return false;
  }
}
/** @param {Block} b @param {string} name */
function st(b, name) {
  try {
    return b.permutation.getState(/** @type {any} */ (name));
  } catch {
    return undefined;
  }
}
/** @param {Block} b @param {string} name @param {any} v */
function setState(b, name, v) {
  try {
    b.setPermutation(b.permutation.withState(/** @type {any} */ (name), v));
    return true;
  } catch {
    return false;
  }
}
/** @param {() => void} fn */
function safe(fn) {
  try {
    fn();
  } catch (err) {
    console.warn("[Titans] Glowshroom: " + err);
  }
}
/** @param {Player} p */
function creative(p) {
  try {
    return p.getGameMode() === GameMode.Creative;
  } catch {
    return false;
  }
}
/** One of what the player holds is used up (not in creative). @param {Player} p @param {string} id */
function takeOne(p, id) {
  if (creative(p)) return;
  try {
    const eq = p.getComponent("minecraft:equippable");
    const it = eq?.getEquipment(/** @type {any} */ ("Mainhand"));
    if (!eq || !it || it.typeId !== id) return;
    if (it.amount <= 1) eq.setEquipment(/** @type {any} */ ("Mainhand"), undefined);
    else {
      it.amount -= 1;
      eq.setEquipment(/** @type {any} */ ("Mainhand"), it);
    }
  } catch {
    /* ignore */
  }
}
/** The held tool takes a point of wear (Unbreaking spares it now and then). @param {Player} p */
function wearTool(p) {
  if (creative(p)) return;
  try {
    const eq = p.getComponent("minecraft:equippable");
    const it = eq?.getEquipment(/** @type {any} */ ("Mainhand"));
    const dur = it?.getComponent("minecraft:durability");
    if (!eq || !it || !dur) return;
    const unbreaking = it.getComponent("minecraft:enchantable")?.getEnchantment("unbreaking")?.level ?? 0;
    if (Math.random() >= 1 / (unbreaking + 1)) return;
    if (dur.damage + 1 >= dur.maxDurability) {
      eq.setEquipment(/** @type {any} */ ("Mainhand"), undefined);
      U.sound(p.dimension, "random.break", p.location);
    } else {
      dur.damage += 1;
      eq.setEquipment(/** @type {any} */ ("Mainhand"), it);
    }
  } catch {
    /* ignore */
  }
}

/** Blocks that don't smother grass or block a sapling's way: air and the little things. */
const OPEN = /^(minecraft:(air|.*torch|.*_carpet|carpet|snow_layer|.*_button|.*pressure_plate|.*_sign|ladder|vine|glow_lichen|short_grass|tall_grass|fern|large_fern|.*_flower|dandelion|poppy|.*_tulip|.*_sapling|.*_mushroom|rail|.*_rail|redstone_wire|lever|light_block.*)|zt:(spore_grass_plant|spore_mushroom|spore_crop|glowshroom_button|glowshroom_pressure_plate))$/;
/** @param {string | undefined} id */
const open = (id) => !!id && OPEN.test(id);

// ---------------------------------------------------------------- spore grass and the crop
/** Spore grass under a solid block turns back to maroon dirt; in the open it spreads to maroon dirt next to it. @param {Block} block */
export function sporeGrassTick(block) {
  const dim = block.dimension;
  const { x, y, z } = block.location;
  const above = idAt(dim, x, y + 1, z);
  if (above && !open(above) && above !== "minecraft:water") {
    block.setType(DIRT);
    return;
  }
  if (Math.random() < 0.5) return;
  const tx = x + U.randInt(-1, 1);
  const ty = y + U.randInt(-1, 1);
  const tz = z + U.randInt(-1, 1);
  if (idAt(dim, tx, ty, tz) !== DIRT || !open(idAt(dim, tx, ty + 1, tz))) return;
  setAt(dim, tx, ty, tz, GRASS);
}

const SOILS = new Set(["minecraft:farmland", DIRT, GRASS]);
/** A spore crop grows a stage now and then, on farmland or the biome's own soil. @param {Block} block */
export function cropTick(block) {
  const g = st(block, "zt:growth");
  if (typeof g !== "number" || g >= 3) return;
  const { x, y, z } = block.location;
  if (!SOILS.has(idAt(block.dimension, x, y - 1, z) ?? "")) return;
  if (Math.random() < 0.6) setState(block, "zt:growth", g + 1);
}

// ---------------------------------------------------------------- hoes and bone meal
/**
 * Before a player uses something on a block: a hoe tills maroon dirt and spore grass into
 * farmland; bone meal grows a spore crop, sprouts plants over spore grass, and may grow a spore
 * mushroom into a giant spore tree.
 * @param {import("@minecraft/server").PlayerInteractWithBlockBeforeEvent} ev
 */
export function beforeInteract(ev) {
  if (!ev.isFirstEvent || !ev.itemStack) return;
  const id = ev.block.typeId;
  const item = ev.itemStack;
  const p = ev.player;
  const dim = ev.block.dimension;
  const at = ev.block.location;
  let hoe = false;
  try {
    hoe = item.hasTag("minecraft:is_hoe");
  } catch {
    hoe = false;
  }
  if (hoe && (id === DIRT || id === GRASS)) {
    system.run(() => safe(() => till(p, dim, at)));
  } else if (item.typeId === "minecraft:bone_meal" && (id === CROP || id === GRASS || id === MUSHROOM)) {
    system.run(() => safe(() => boneMeal(p, dim, at, id)));
  }
}

/** @param {Player} p @param {Dimension} dim @param {Vector3} at */
export function till(p, dim, at) {
  const b = blockAt(dim, at.x, at.y, at.z);
  if (!b || (b.typeId !== DIRT && b.typeId !== GRASS)) return false;
  if (idAt(dim, at.x, at.y + 1, at.z) !== AIR) return false;
  b.setType("minecraft:farmland");
  U.sound(dim, "use.gravel", b.center());
  wearTool(p);
  return true;
}

/** @param {Player} p @param {Dimension} dim @param {Vector3} at @param {string} id */
export function boneMeal(p, dim, at, id) {
  const b = blockAt(dim, at.x, at.y, at.z);
  if (!b || b.typeId !== id) return false;
  let used = false;
  if (id === CROP) {
    const g = st(b, "zt:growth");
    if (typeof g === "number" && g < 3) {
      setState(b, "zt:growth", Math.min(3, g + U.randInt(1, 2)));
      used = true;
    }
  } else if (id === GRASS) {
    // like bone meal on grass: plants spring up on the open spore grass round about
    /** @type {Vector3[]} */
    const spots = [];
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        for (const dy of [0, 1, -1]) {
          const y = at.y + dy;
          if (idAt(dim, at.x + dx, y, at.z + dz) === GRASS && idAt(dim, at.x + dx, y + 1, at.z + dz) === AIR) {
            spots.push({ x: at.x + dx, y: y + 1, z: at.z + dz });
            break;
          }
        }
      }
    }
    let grew = 0;
    for (const c of spots) {
      if (Math.random() >= 0.45 && !(grew === 0 && c === spots[spots.length - 1])) continue;
      setAt(dim, c.x, c.y, c.z, Math.random() < 0.85 ? PLANT : MUSHROOM);
      U.particle(dim, "minecraft:crop_growth_emitter", { x: c.x + 0.5, y: c.y + 0.3, z: c.z + 0.5 });
      grew++;
    }
    used = grew > 0;
  } else if (id === MUSHROOM) {
    used = true;
    // like a vanilla mushroom: two times in five it grows into a giant one, if there's room
    const soil = idAt(dim, at.x, at.y - 1, at.z) ?? "";
    if ((SOILS.has(soil) || TREE_SOILS.has(soil)) && Math.random() < 0.4) growTree(dim, at.x, at.y, at.z, U.randInt(5, 7), Math.random, "strict");
  }
  if (used) {
    U.particle(dim, "minecraft:crop_growth_emitter", { x: at.x + 0.5, y: at.y + 0.5, z: at.z + 0.5 });
    takeOne(p, "minecraft:bone_meal");
  }
  return used;
}

/** Blocks a growing tree may take the place of. @param {string | undefined} id */
const roomy = (id) => id === AIR || id === PLANT || id === MUSHROOM || id === CAP;
/** What else a spore mushroom grows into a tree on. */
const TREE_SOILS = new Set(["minecraft:grass_block", "minecraft:dirt", "minecraft:mycelium", "minecraft:podzol", "minecraft:moss_block"]);

/**
 * A giant spore tree: a white-striped Glowshroom log trunk under a dome of Mushed Spore Cap
 * with a ragged skirt. "strict": nothing grows unless the space is clear; "soft" (a cavern's
 * trees): the trunk needs its room and most of the cap, which may run into the rock round it.
 * @param {Dimension} dim @param {number} x @param {number} y @param {number} z @param {number} h trunk height
 * @param {() => number} [rnd] @param {"strict" | "soft" | false} [check]
 */
export function growTree(dim, x, y, z, h, rnd = Math.random, check = false) {
  const r = h >= 7 ? 4 : 3;
  const top = y + h;
  /** @type {Array<[number, number, number, string]>} */
  const cells = [];
  for (let k = 0; k < h; k++) cells.push([x, y + k, z, LOG]);
  for (let dx = -r - 1; dx <= r + 1; dx++) {
    for (let dz = -r - 1; dz <= r + 1; dz++) {
      const d2 = dx * dx + dz * dz;
      if (d2 <= (r - 1.5) * (r - 1.5)) cells.push([x + dx, top + 1, z + dz, CAP]);
      if (d2 <= r * r + 0.5) cells.push([x + dx, top, z + dz, CAP]);
      if (d2 >= (r - 0.8) * (r - 0.8) && d2 <= r * r + 0.5) {
        cells.push([x + dx, top - 1, z + dz, CAP]);
        if (rnd() < 0.55) cells.push([x + dx, top - 2, z + dz, CAP]);
      }
    }
  }
  if (check) {
    let blocked = 0;
    for (const [cx, cy, cz, id] of cells) {
      if (cx === x && cy === y && cz === z) continue;
      if (roomy(idAt(dim, cx, cy, cz))) continue;
      if (check === "strict" || id === LOG) return false;
      blocked++;
    }
    if (blocked > cells.length * 0.3) return false;
  }
  for (const [cx, cy, cz, id] of cells) {
    const here = idAt(dim, cx, cy, cz);
    if (id === LOG || roomy(here)) setAt(dim, cx, cy, cz, id);
  }
  return true;
}

// ---------------------------------------------------------------- the slab
/**
 * A slab put onto a slab's open half makes it a double slab (the new one isn't placed).
 * @param {import("@minecraft/server").BlockComponentPlayerPlaceBeforeEvent} ev
 */
export function slabBeforePlace(ev) {
  const face = String(ev.face).toLowerCase();
  const b = ev.block;
  let target;
  try {
    target = face === "up" ? b.below() : face === "down" ? b.above() : undefined;
  } catch {
    return;
  }
  if (!target || target.typeId !== SLAB || st(target, "zt:double") === 1) return;
  const half = st(target, "minecraft:vertical_half");
  if ((face === "up" && half !== "bottom") || (face === "down" && half !== "top")) return;
  ev.cancel = true;
  const dim = b.dimension;
  const at = target.location;
  const p = ev.player;
  system.run(() =>
    safe(() => {
      const t = blockAt(dim, at.x, at.y, at.z);
      if (!t || t.typeId !== SLAB || st(t, "zt:double") === 1) return;
      setState(t, "zt:double", 1);
      U.sound(dim, "use.wood", t.center());
      if (p) takeOne(p, SLAB);
    }),
  );
}

// ---------------------------------------------------------------- doors, trapdoors, gates
const DIR = { north: { x: 0, z: -1 }, south: { x: 0, z: 1 }, east: { x: 1, z: 0 }, west: { x: -1, z: 0 } };
/** The way a player faces, as the placement trait reads it. @param {Player} p */
function facing(p) {
  let y = 0;
  try {
    y = p.getRotation().y;
  } catch {
    /* ignore */
  }
  const a = ((y % 360) + 360) % 360;
  if (a >= 45 && a < 135) return "west";
  if (a >= 135 && a < 225) return "north";
  if (a >= 225 && a < 315) return "east";
  return "south";
}
const LEFT = { north: "west", west: "south", south: "east", east: "north" };

/** Both halves of a Glowshroom door. @param {Block} b */
function doorParts(b) {
  const part = st(b, "minecraft:multi_block_part") ?? 0;
  let other;
  try {
    other = part === 0 ? b.above() : b.below();
  } catch {
    other = undefined;
  }
  return other && other.typeId === DOOR ? [b, other] : [b];
}

/** Opens (1) or closes (0) a door, trapdoor or gate. @param {Block} b @param {number} to */
export function setOpen(b, to) {
  if (st(b, "zt:open") === to) return false;
  const parts = b.typeId === DOOR ? doorParts(b) : [b];
  for (const part of parts) setState(part, "zt:open", to);
  U.sound(b.dimension, to ? "random.door_open" : "random.door_close", b.center(), 1, b.typeId === TRAPDOOR ? 1.1 : 0.95);
  return true;
}

/** A tap opens or shuts it; a gate swings away from whoever opens it. @param {Block} b @param {Player | undefined} p */
export function toggle(b, p) {
  const opening = st(b, "zt:open") !== 1;
  if (opening && b.typeId === GATE && p) {
    const d = DIR[/** @type {keyof typeof DIR} */ (st(b, "minecraft:cardinal_direction"))] ?? DIR.north;
    const c = b.center();
    const side = (p.location.x - c.x) * d.x + (p.location.z - c.z) * d.z;
    setState(b, "zt:swing", side > 0 ? 1 : 0);
  }
  setOpen(b, opening ? 1 : 0);
}

/** Doors, trapdoors and gates opened by redstone: closed again when the power goes. "dim|x,y,z" -> where */
const powered = new Map();
/** @param {Block} b @param {number} power */
export function onPower(b, power) {
  if (power <= 0) return;
  setOpen(b, 1);
  const l = b.location;
  powered.set(`${b.dimension.id}|${l.x},${l.y},${l.z}`, { dim: b.dimension.id, at: { x: l.x, y: l.y, z: l.z } });
}
function pollPowered() {
  for (const [k, w] of [...powered]) {
    const dim = world.getDimension(w.dim);
    const b = blockAt(dim, w.at.x, w.at.y, w.at.z);
    if (!b) continue;
    if (![DOOR, TRAPDOOR, GATE].includes(b.typeId)) {
      powered.delete(k);
      continue;
    }
    let power = 0;
    for (const part of b.typeId === DOOR ? doorParts(b) : [b]) {
      try {
        power = Math.max(power, part.getRedstonePower() ?? 0);
      } catch {
        /* ignore */
      }
    }
    if (power > 0) continue;
    setOpen(b, 0);
    powered.delete(k);
  }
}

/**
 * A door goes in hinged on its left, unless a door stands there already: then the two make a
 * double door (this one hinged on the right).
 * @param {import("@minecraft/server").BlockComponentPlayerPlaceBeforeEvent} ev
 */
export function doorBeforePlace(ev) {
  const p = ev.player;
  if (!p) return;
  const d = DIR[/** @type {keyof typeof DIR} */ (LEFT[/** @type {keyof typeof LEFT} */ (facing(p))])];
  const b = ev.block;
  const left = blockAt(b.dimension, b.x + d.x, b.y, b.z + d.z);
  if (!left || left.typeId !== DOOR || st(left, "zt:hinge_right") !== 0) return;
  try {
    ev.permutationToPlace = ev.permutationToPlace.withState(/** @type {any} */ ("zt:hinge_right"), 1);
  } catch {
    return;
  }
  const dim = b.dimension;
  const at = b.location;
  // (the upper half follows the lower)
  system.run(() =>
    safe(() => {
      const top = blockAt(dim, at.x, at.y + 1, at.z);
      if (top && top.typeId === DOOR && st(top, "zt:hinge_right") !== 1) setState(top, "zt:hinge_right", 1);
    }),
  );
}

// ---------------------------------------------------------------- the button and pressure plate
/** @param {Block} b */
export function pressButton(b) {
  if (st(b, "zt:pressed") === 1) return false;
  setState(b, "zt:pressed", 1);
  U.sound(b.dimension, "random.click", b.center(), 0.6, 0.6);
  const dim = b.dimension;
  const at = b.location;
  system.runTimeout(() => safe(() => releaseButton(dim, at)), 30);
  return true;
}
/** @param {Dimension} dim @param {Vector3} at */
export function releaseButton(dim, at) {
  const b = blockAt(dim, at.x, at.y, at.z);
  if (!b || b.typeId !== BUTTON || st(b, "zt:pressed") !== 1) return;
  setState(b, "zt:pressed", 0);
  U.sound(dim, "random.click", b.center(), 0.6, 0.5);
}
/** @param {Block} b */
export function stepOnPlate(b) {
  if (st(b, "zt:pressed") === 1) return;
  setState(b, "zt:pressed", 1);
  U.sound(b.dimension, "random.click", b.center(), 0.4, 0.8);
}
/** Lets a pressure plate up once nothing stands on it. @param {Dimension} dim @param {Vector3} at */
export function checkPlate(dim, at) {
  const b = blockAt(dim, at.x, at.y, at.z);
  if (!b || b.typeId !== PLATE || st(b, "zt:pressed") !== 1) return;
  let on = [];
  try {
    on = dim.getEntities({ location: { x: at.x + 0.5, y: at.y + 0.1, z: at.z + 0.5 }, maxDistance: 1.2 }).filter((e) => {
      const l = e.location;
      return Math.abs(l.x - (at.x + 0.5)) < 0.75 && Math.abs(l.z - (at.z + 0.5)) < 0.75 && l.y >= at.y - 0.1 && l.y < at.y + 0.6 &&
        e.typeId !== "minecraft:item" && e.typeId !== "minecraft:xp_orb";
    });
  } catch {
    on = [];
  }
  if (on.length) return;
  setState(b, "zt:pressed", 0);
  U.sound(dim, "random.click", b.center(), 0.4, 0.6);
}

// ---------------------------------------------------------------- custom components
/** The behaviour the blocks' custom components are bound to (by name, as in their JSON). */
export const COMPONENTS = {
  "zt:spore_grass": { onRandomTick: (/** @type {any} */ e) => safe(() => sporeGrassTick(e.block)) },
  "zt:spore_crop": { onRandomTick: (/** @type {any} */ e) => safe(() => cropTick(e.block)) },
  "zt:slab": { beforeOnPlayerPlace: (/** @type {any} */ e) => safe(() => slabBeforePlace(e)) },
  "zt:door": {
    onPlayerInteract: (/** @type {any} */ e) => safe(() => toggle(e.block, e.player)),
    onRedstoneUpdate: (/** @type {any} */ e) => safe(() => onPower(e.block, e.powerLevel)),
    beforeOnPlayerPlace: (/** @type {any} */ e) => safe(() => doorBeforePlace(e)),
  },
  "zt:trapdoor": {
    onPlayerInteract: (/** @type {any} */ e) => safe(() => toggle(e.block, e.player)),
    onRedstoneUpdate: (/** @type {any} */ e) => safe(() => onPower(e.block, e.powerLevel)),
  },
  "zt:fence_gate": {
    onPlayerInteract: (/** @type {any} */ e) => safe(() => toggle(e.block, e.player)),
    onRedstoneUpdate: (/** @type {any} */ e) => safe(() => onPower(e.block, e.powerLevel)),
  },
  "zt:button": {
    onPlayerInteract: (/** @type {any} */ e) => safe(() => pressButton(e.block)),
    onTick: (/** @type {any} */ e) => safe(() => releaseButton(e.block.dimension, e.block.location)),
  },
  "zt:pressure_plate": {
    onStepOn: (/** @type {any} */ e) => safe(() => stepOnPlate(e.block)),
    onStepOff: (/** @type {any} */ e) => {
      const dim = e.block.dimension;
      const at = e.block.location;
      system.runTimeout(() => safe(() => checkPlate(dim, at)), 10);
    },
    onTick: (/** @type {any} */ e) => safe(() => checkPlate(e.block.dimension, e.block.location)),
  },
  // (its tick, a random tick, or a player passing over its chunk: whichever comes first)
  "zt:glowshroom_heart": {
    onTick: (/** @type {any} */ e) => safe(() => request(e.block.dimension, e.block.location)),
    onRandomTick: (/** @type {any} */ e) => safe(() => request(e.block.dimension, e.block.location)),
  },
};

system.beforeEvents.startup.subscribe((ev) => {
  for (const [name, c] of Object.entries(COMPONENTS)) {
    try {
      ev.blockComponentRegistry.registerCustomComponent(name, c);
    } catch (err) {
      console.warn("[Titans] can't register " + name + ": " + err);
    }
  }
});

// ---------------------------------------------------------------- the caverns
/** Natural blocks a cavern is carved out of. */
const CARVE = /^minecraft:(stone|deepslate|tuff|granite|diorite|andesite|calcite|dirt|coarse_dirt|rooted_dirt|gravel|clay|smooth_basalt|basalt|dripstone_block|pointed_dripstone|amethyst_block|budding_amethyst|.*amethyst_bud|amethyst_cluster|glow_lichen|moss_block|moss_carpet|cave_vines.*|hanging_roots|azalea|flowering_azalea|big_dripleaf.*|small_dripleaf_block|spore_blossom|sculk|sculk_vein|.*_ore|infested_.*|obsidian|magma|lava|flowing_lava|water|flowing_water)$/;
/** Blocks something was built of (an ancient city, a mineshaft, a trial chamber, a dungeon): a cavern leaves those alone. */
const BUILT = /^minecraft:(.*planks|.*_fence|rail|.*_rail|web|cobweb|chest|mob_spawner|trial_spawner|vault|deepslate_bricks|deepslate_tiles|cracked_deepslate.*|chiseled_deepslate|polished_deepslate|reinforced_deepslate|tuff_bricks|polished_tuff|chiseled_tuff.*|.*copper.*|.*_wool|.*lantern|.*candle|stone_bricks|mossy_stone_bricks|cracked_stone_bricks|cobblestone|mossy_cobblestone|end_portal_frame|bookshelf|.*_door|iron_bars|sculk_shrieker|sculk_catalyst)$/;

/** A small seeded random number generator. @param {number} seed */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** @param {number} x @param {number} y @param {number} z @param {number} seed */
function hash3(x, y, z, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth noise in 0..1. @param {number} seed @param {number} x @param {number} y @param {number} z */
function noise3(seed, x, y, z) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;
  const s = (/** @type {number} */ t) => t * t * (3 - 2 * t);
  const sx = s(fx);
  const sy = s(fy);
  const sz = s(fz);
  const L = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ t) => a + (b - a) * t;
  const c = (/** @type {number} */ i, /** @type {number} */ j, /** @type {number} */ k) => hash3(x0 + i, y0 + j, z0 + k, seed);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), sx), L(c(0, 1, 0), c(1, 1, 0), sx), sy),
    L(L(c(0, 0, 1), c(1, 0, 1), sx), L(c(0, 1, 1), c(1, 1, 1), sx), sy), sz);
}

/** The shape of the cavern grown round a heart. @param {Vector3} c */
export function plan(c) {
  const seed = Math.floor(hash3(c.x, c.y, c.z, 977) * 2147483647);
  const rnd = rng(seed);
  return { cx: c.x, cy: c.y, cz: c.z, rx: 12 + rnd() * 5, rz: 12 + rnd() * 5, up: 7 + rnd() * 3, down: 5 + Math.floor(rnd() * 2), seed, rnd };
}
/** Inside the cavern: a dome over walls that narrow a little toward an uneven floor. @param {ReturnType<typeof plan>} P @param {number} x @param {number} y @param {number} z */
export function inside(P, x, y, z) {
  const n = noise3(P.seed, x / 5, y / 4, z / 5) * 0.36 - 0.18;
  const hx = (x - P.cx) / P.rx;
  const hz = (z - P.cz) / P.rz;
  if (y >= P.cy) {
    const hy = (y - P.cy) / P.up;
    return hx * hx + hz * hz + hy * hy <= 1 + n;
  }
  const floor = P.cy - P.down + Math.round(noise3(P.seed + 7, x / 6, 0, z / 6) * 2 - 1);
  if (y < floor) return false;
  const t = (P.cy - y) / (P.down + 1);
  return hx * hx + hz * hz <= (1 + n) * (1 - t * t * 0.35);
}

const CAVERNS_KEY = "zt:glowshroom_caverns";
/** @type {Array<{d: string, x: number, y: number, z: number, r: number}> | null} */
let caverns = null;
/** The caverns grown so far (kept in the world). */
export function cavernList() {
  if (caverns) return caverns;
  try {
    const raw = world.getDynamicProperty(CAVERNS_KEY);
    caverns = typeof raw === "string" ? JSON.parse(raw) : [];
  } catch {
    caverns = [];
  }
  return /** @type {any} */ (caverns);
}
/** @param {{d: string, x: number, y: number, z: number, r: number}} c */
function remember(c) {
  const list = cavernList();
  list.push(c);
  while (list.length > 150) list.shift();
  try {
    world.setDynamicProperty(CAVERNS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
/** The cavern a point is in. @param {string} dimId @param {Vector3} l */
export function cavernAt(dimId, l) {
  for (const c of cavernList()) {
    if (c.d === dimId && Math.hypot(l.x - c.x, l.z - c.z) <= c.r + 1 && l.y >= c.y - 9 && l.y <= c.y + 11) return c;
  }
  return undefined;
}

/** Hearts being built or waiting their turn ("dim|x,y,z"), and when a heart may be tried again. */
const pending = new Set();
const retryAt = new Map();
/** @type {Array<{dim: string, at: Vector3, key: string}>} */
const queue = [];
let building = false;
/** Builds finished (for tests): heart -> how it went. */
export const results = new Map();

/** A heart was found: its cavern is grown (in turn). @param {Dimension} dim @param {Vector3} at */
export function request(dim, at) {
  const key = `${dim.id}|${at.x},${at.y},${at.z}`;
  if (pending.has(key) || system.currentTick < (retryAt.get(key) ?? 0)) return;
  pending.add(key);
  queue.push({ dim: dim.id, at: { x: at.x, y: at.y, z: at.z }, key });
  next();
}
function next() {
  if (building || !queue.length) return;
  const job = /** @type {{dim: string, at: Vector3, key: string}} */ (queue.shift());
  building = true;
  system.runJob(build(job.dim, job.at, (/** @type {string} */ how) => {
    building = false;
    pending.delete(job.key);
    results.set(job.key, how);
    if (how === "unloaded") retryAt.set(job.key, system.currentTick + 200);
    next();
  }));
}

/**
 * Grows the cavern round a heart, a few hundred blocks a tick: surveys the space (it gives up
 * where something was built there or in an aquifer, and waits if part of it isn't loaded), carves it, floors it,
 * puts Glowite in its roof, grows giant spore trees where there's headroom, and plants it.
 * @param {string} dimId @param {Vector3} c @param {(how: string) => void} done
 */
function* build(dimId, c, done) {
  const dim = world.getDimension(dimId);
  const P = plan(c);
  const rx = Math.ceil(P.rx * 1.2);
  const rz = Math.ceil(P.rz * 1.2);
  const y0 = P.cy - P.down - 2;
  const y1 = P.cy + Math.ceil(P.up * 1.15) + 1;
  /** @type {number[]} */
  const cells = [];
  let built = 0;
  let wet = 0;
  let ops = 0;
  for (let x = P.cx - rx; x <= P.cx + rx; x++) {
    for (let z = P.cz - rz; z <= P.cz + rz; z++) {
      for (let y = y0; y <= y1; y++) {
        if (!inside(P, x, y, z)) continue;
        const id = idAt(dim, x, y, z);
        if (id === undefined) {
          done("unloaded");
          return;
        }
        if (BUILT.test(id)) built++;
        else if (id === "minecraft:water" || id === "minecraft:flowing_water") wet++;
        cells.push(x, y, z);
        if (++ops % 300 === 0) yield;
      }
    }
  }
  // (in an aquifer it would only flood)
  if (built > 3 || wet > 40) {
    if (idAt(dim, c.x, c.y, c.z) === HEART) setAt(dim, c.x, c.y, c.z, "minecraft:deepslate");
    done(built > 3 ? "built over" : "flooded");
    return;
  }
  // carve, and find each column's floor and roof
  /** @type {Map<string, {x: number, z: number, lo: number, hi: number}>} */
  const cols = new Map();
  for (let i = 0; i < cells.length; i += 3) {
    const x = cells[i];
    const y = cells[i + 1];
    const z = cells[i + 2];
    const id = idAt(dim, x, y, z);
    if (id && (CARVE.test(id) || id === HEART)) setAt(dim, x, y, z, AIR);
    const k = x + "," + z;
    const col = cols.get(k);
    if (!col) cols.set(k, { x, z, lo: y, hi: y });
    else {
      col.lo = Math.min(col.lo, y);
      col.hi = Math.max(col.hi, y);
    }
    if (++ops % 200 === 0) yield;
  }
  const rnd = P.rnd;
  const natural = (/** @type {string | undefined} */ id) => !!id && (CARVE.test(id) || id === DIRT || id === GRASS);
  // the floor: spore grass over maroon dirt; the roof: a few Glowite ores among glowing caps
  /** @type {Array<{x: number, y: number, z: number, head: number}>} */
  const floor = [];
  for (const col of cols.values()) {
    const { x, z, lo, hi } = col;
    if (idAt(dim, x, lo, z) !== AIR) continue;
    if (natural(idAt(dim, x, lo - 1, z))) {
      setAt(dim, x, lo - 1, z, GRASS);
      if (natural(idAt(dim, x, lo - 2, z))) setAt(dim, x, lo - 2, z, DIRT);
      if (rnd() < 0.5 && natural(idAt(dim, x, lo - 3, z))) setAt(dim, x, lo - 3, z, DIRT);
      floor.push({ x, y: lo, z, head: hi - lo + 1 });
    }
    if (++ops % 100 === 0) yield;
  }
  const roof = [...cols.values()].filter((col) => natural(idAt(dim, col.x, col.hi + 1, col.z)));
  const ores = 1 + Math.floor(rnd() * 3);
  for (let k = 0; k < ores && roof.length; k++) {
    const col = roof[Math.floor(rnd() * roof.length)];
    setAt(dim, col.x, col.hi + 1, col.z, ORE);
  }
  for (const col of roof) {
    const r = rnd();
    if (r < 0.06 && idAt(dim, col.x, col.hi, col.z) === AIR) setAt(dim, col.x, col.hi, col.z, CAP);
    else if (r < 0.14) setAt(dim, col.x, col.hi + 1, col.z, DIRT);
  }
  yield;
  // giant spore trees where the roof is high enough, well apart and clear of players
  const players = (() => {
    try {
      return dim.getPlayers({ location: { x: P.cx, y: P.cy, z: P.cz }, maxDistance: 40 }).map((p) => p.location);
    } catch {
      return [];
    }
  })();
  const trees = 2 + Math.floor(rnd() * 4);
  /** @type {Vector3[]} */
  const grown = [];
  const spots = floor.filter((f) => f.head >= 10).sort(() => rnd() - 0.5);
  for (const f of spots) {
    if (grown.length >= trees) break;
    if (grown.some((g) => Math.hypot(g.x - f.x, g.z - f.z) < 7)) continue;
    if (players.some((l) => Math.hypot(l.x - f.x, l.z - f.z) < 5 && Math.abs(l.y - f.y) < 10)) continue;
    const h = Math.max(4, Math.min(7, f.head - 5));
    if (growTree(dim, f.x, f.y, f.z, h, rnd, "soft")) grown.push({ x: f.x, y: f.y, z: f.z });
    yield;
  }
  // spore grass plants and spore mushrooms on the open floor
  for (const f of floor) {
    if (idAt(dim, f.x, f.y, f.z) !== AIR || idAt(dim, f.x, f.y - 1, f.z) !== GRASS) continue;
    const r = rnd();
    if (r < 0.28) setAt(dim, f.x, f.y, f.z, PLANT);
    else if (r < 0.33) setAt(dim, f.x, f.y, f.z, MUSHROOM);
    if (++ops % 150 === 0) yield;
  }
  if (idAt(dim, c.x, c.y, c.z) === HEART) setAt(dim, c.x, c.y, c.z, AIR);
  remember({ d: dimId, x: P.cx, y: P.cy, z: P.cz, r: Math.round(Math.max(P.rx, P.rz)) });
  done("built");
}

/** Chunks looked at for a heart ("cx,cz"), and where in a chunk a heart can be. */
const scanned = new Set();
const HEART_SPOTS = [[0, 0], [8, 8], [8, 0], [0, 8]];
const SCAN_RADIUS = 4;
/** A heart in this chunk: where, null if none, "unloaded" if it can't be looked at yet. @param {Dimension} dim @param {number} cx @param {number} cz */
function heartIn(dim, cx, cz) {
  for (const [ox, oz] of HEART_SPOTS) {
    let b;
    try {
      b = dim.getBlock({ x: cx * 16 + ox, y: HEART_Y, z: cz * 16 + oz });
    } catch {
      return "unloaded";
    }
    if (!b) return "unloaded";
    if (b.typeId === HEART) return b.location;
  }
  return null;
}
/** Looks through the chunks round each player in the overworld for hearts. */
function scan() {
  for (const p of world.getAllPlayers()) {
    let dim;
    try {
      dim = p.dimension;
      if (dim.id !== "minecraft:overworld") continue;
    } catch {
      continue;
    }
    const cx0 = Math.floor(p.location.x / 16);
    const cz0 = Math.floor(p.location.z / 16);
    for (let dx = -SCAN_RADIUS; dx <= SCAN_RADIUS; dx++) {
      for (let dz = -SCAN_RADIUS; dz <= SCAN_RADIUS; dz++) {
        const key = `${cx0 + dx},${cz0 + dz}`;
        if (scanned.has(key)) continue;
        const found = heartIn(dim, cx0 + dx, cz0 + dz);
        if (found === "unloaded") continue;
        scanned.add(key);
        if (found) request(dim, found);
      }
    }
  }
}

// ---------------------------------------------------------------- life in the caverns
/** The cavern each player is in (for the biome's title), and when they last saw it. */
const inCavern = new Map();
const titleAt = new Map();
/** Keeps a few Shroom Zombies and Shroom Skeletons about a player in a cavern, on its spore grass, out of arm's reach. @param {Player} p @param {{x: number, y: number, z: number, r: number}} c */
export function spawnShroomMob(p, c) {
  try {
    if (world.getDifficulty() === "Peaceful") return undefined;
  } catch {
    /* ignore */
  }
  const dim = p.dimension;
  let near = 0;
  try {
    near = dim.getEntities({ location: p.location, maxDistance: 40, families: ["shroom"] }).length;
  } catch {
    return undefined;
  }
  if (near >= 4) return undefined;
  for (let tries = 0; tries < 8; tries++) {
    const a = Math.random() * Math.PI * 2;
    const r = 9 + Math.random() * 10;
    const x = Math.floor(p.location.x + Math.cos(a) * r);
    const z = Math.floor(p.location.z + Math.sin(a) * r);
    if (Math.hypot(x - c.x, z - c.z) > c.r) continue;
    for (let y = c.y + 6; y >= c.y - 9; y--) {
      if (idAt(dim, x, y, z) !== GRASS) continue;
      if (!open(idAt(dim, x, y + 1, z)) || !open(idAt(dim, x, y + 2, z))) break;
      try {
        return dim.spawnEntity(MOBS[Math.floor(Math.random() * MOBS.length)], { x: x + 0.5, y: y + 1, z: z + 0.5 });
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** @param {number} tick */
export function glowshroomTick(tick) {
  if (tick % 40 === 0) scan();
  if (tick % 10 === 5 && powered.size) pollPowered();
  if (tick % 20 !== 10) return;
  for (const p of world.getAllPlayers()) {
    let c;
    try {
      c = cavernAt(p.dimension.id, p.location);
    } catch {
      continue;
    }
    const was = inCavern.get(p.id);
    const now = c ? `${c.x},${c.z}` : undefined;
    inCavern.set(p.id, now);
    if (!c) continue;
    if (now !== was && tick - (titleAt.get(p.id) ?? -9999) > 1200) {
      titleAt.set(p.id, tick);
      try {
        p.onScreenDisplay.setTitle("§bGlowshroom Biome", { fadeInDuration: 10, stayDuration: 50, fadeOutDuration: 20, subtitle: "§3spores glow in the dark" });
      } catch {
        /* ignore */
      }
    }
    if (tick % 40 === 10) U.particle(p.dimension, "zt:spore_dust", { x: p.location.x, y: p.location.y + 1.5, z: p.location.z });
    if (tick % 200 === 10) spawnShroomMob(p, c);
  }
}

/** @param {string} id */
export function forgetPlayer(id) {
  inCavern.delete(id);
  titleAt.delete(id);
}
