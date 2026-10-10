// The Players' knowledge of Minecraft: blocks (how hard they are, which tool mines them, what
// they drop, whether you can walk through them), tools, weapons and armour, food, fuel,
// smelting, crafting recipes, villager trades, enchantments, potions, death messages, and the
// names and personalities Players get.
//
// Numbers follow vanilla Bedrock: hardness and tool speeds give the same mining times a
// player sees, sword and axe damage are Bedrock's, armour points and food values are vanilla.

/** "minecraft:" + name. @param {string} n */
export const mc = (n) => (n.includes(":") ? n : "minecraft:" + n);
/** name without "minecraft:". @param {string} id */
export const bare = (id) => id.replace(/^minecraft:/, "");

// =============================================================================
// blocks
// =============================================================================
/**
 * @typedef {{h: number, tool?: string, tier?: number, drop?: string | null | ((rand: () => number, fortune: number) => Array<[string, number]>),
 *   xp?: [number, number], kind?: string, natural?: boolean}} BlockInfo
 * h: hardness (-1 can't be broken); tool: pickaxe/axe/shovel/hoe/shears/sword; tier: the pickaxe
 * tier needed for a drop (1 wood, 2 stone, 3 iron, 4 diamond); drop: the item it leaves (null
 * none; default the block itself); kind: how a body meets it (solid, pass, liquid, lava, climb,
 * door, danger, fence); natural: part of the world as generated (Players only mine those).
 */
const RULES = /** @type {Array<[RegExp, BlockInfo]>} */ ([]);
/** @param {string} pattern @param {BlockInfo} info */
function rule(pattern, info) {
  RULES.push([new RegExp("^minecraft:(" + pattern + ")$"), info]);
}
const n = (lo, hi) => (r) => lo + Math.floor(r() * (hi - lo + 1));
/**
 * A drop of `count` (a number or a roll) of item `id`, more with fortune.
 * @param {string} id @param {number} lo @param {number} hi @param {boolean} [fortuneMul]
 * @returns {(r: () => number, fortune: number) => Array<[string, number]>}
 */
function ore(id, lo, hi, fortuneMul = true) {
  return (r, fortune) => {
    let k = n(lo, hi)(r);
    if (fortune && fortuneMul) k *= 1 + Math.max(0, Math.floor(r() * (fortune + 2)) - 1);
    return [[mc(id), k]];
  };
}

// unbreakable
// portals: a body passes into them (and is taken elsewhere), so a Player only steps in on purpose
rule("portal|end_portal|end_gateway", { h: -1, kind: "portal", drop: null });
rule("bedrock|barrier|end_portal_frame|command_block|structure_block|light_block.*|invisible_bedrock|border_block|allow|deny", { h: -1, kind: "solid" });
// air and liquids
rule("air|cave_air|void_air", { h: 0, kind: "air", drop: null });
rule("water|flowing_water", { h: -1, kind: "liquid", drop: null });
rule("lava|flowing_lava", { h: -1, kind: "lava", drop: null });
// stone and the ores in it
rule("stone", { h: 1.5, tool: "pickaxe", tier: 1, drop: "cobblestone", natural: true });
// (cobblestone is what people build with: a Player leaves it alone)
rule("cobblestone|mossy_cobblestone", { h: 2, tool: "pickaxe", tier: 1 });
rule("granite|diorite|andesite|tuff|calcite|dripstone_block", { h: 1.5, tool: "pickaxe", tier: 1, natural: true });
rule("deepslate", { h: 3, tool: "pickaxe", tier: 1, drop: "cobbled_deepslate", natural: true });
rule("cobbled_deepslate", { h: 3.5, tool: "pickaxe", tier: 1 });
rule("coal_ore", { h: 3, tool: "pickaxe", tier: 1, drop: ore("coal", 1, 1), xp: [0, 2], natural: true });
rule("deepslate_coal_ore", { h: 4.5, tool: "pickaxe", tier: 1, drop: ore("coal", 1, 1), xp: [0, 2], natural: true });
rule("iron_ore", { h: 3, tool: "pickaxe", tier: 2, drop: ore("raw_iron", 1, 1), natural: true });
rule("deepslate_iron_ore", { h: 4.5, tool: "pickaxe", tier: 2, drop: ore("raw_iron", 1, 1), natural: true });
rule("copper_ore", { h: 3, tool: "pickaxe", tier: 2, drop: ore("raw_copper", 2, 5), natural: true });
rule("deepslate_copper_ore", { h: 4.5, tool: "pickaxe", tier: 2, drop: ore("raw_copper", 2, 5), natural: true });
rule("gold_ore", { h: 3, tool: "pickaxe", tier: 3, drop: ore("raw_gold", 1, 1), natural: true });
rule("deepslate_gold_ore", { h: 4.5, tool: "pickaxe", tier: 3, drop: ore("raw_gold", 1, 1), natural: true });
rule("redstone_ore|lit_redstone_ore", { h: 3, tool: "pickaxe", tier: 3, drop: ore("redstone", 4, 5), xp: [1, 5], natural: true });
rule("deepslate_redstone_ore|lit_deepslate_redstone_ore", { h: 4.5, tool: "pickaxe", tier: 3, drop: ore("redstone", 4, 5), xp: [1, 5], natural: true });
rule("lapis_ore", { h: 3, tool: "pickaxe", tier: 2, drop: ore("lapis_lazuli", 4, 9), xp: [2, 5], natural: true });
rule("deepslate_lapis_ore", { h: 4.5, tool: "pickaxe", tier: 2, drop: ore("lapis_lazuli", 4, 9), xp: [2, 5], natural: true });
rule("diamond_ore", { h: 3, tool: "pickaxe", tier: 3, drop: ore("diamond", 1, 1), xp: [3, 7], natural: true });
rule("deepslate_diamond_ore", { h: 4.5, tool: "pickaxe", tier: 3, drop: ore("diamond", 1, 1), xp: [3, 7], natural: true });
rule("emerald_ore", { h: 3, tool: "pickaxe", tier: 3, drop: ore("emerald", 1, 1), xp: [3, 7], natural: true });
rule("deepslate_emerald_ore", { h: 4.5, tool: "pickaxe", tier: 3, drop: ore("emerald", 1, 1), xp: [3, 7], natural: true });
rule("quartz_ore", { h: 3, tool: "pickaxe", tier: 1, drop: ore("quartz", 1, 1), xp: [2, 5], natural: true });
rule("nether_gold_ore", { h: 3, tool: "pickaxe", tier: 1, drop: ore("gold_nugget", 2, 6), xp: [0, 1], natural: true });
rule("ancient_debris", { h: 30, tool: "pickaxe", tier: 4, natural: true });
rule("obsidian|crying_obsidian", { h: 50, tool: "pickaxe", tier: 4, natural: true });
// earth
rule("dirt|coarse_dirt|rooted_dirt", { h: 0.5, tool: "shovel", drop: "dirt", natural: true });
rule("grass_block|grass|podzol|mycelium|dirt_path|grass_path|farmland", { h: 0.6, tool: "shovel", drop: "dirt", natural: true });
rule("sand|red_sand|soul_sand|soul_soil|mud|suspicious_sand", { h: 0.5, tool: "shovel", natural: true });
rule("gravel|suspicious_gravel", { h: 0.6, tool: "shovel", drop: (r) => [[mc(r() < 0.1 ? "flint" : "gravel"), 1]], natural: true });
rule("clay", { h: 0.6, tool: "shovel", drop: ore("clay_ball", 4, 4, false), natural: true });
rule("snow", { h: 0.2, tool: "shovel", drop: ore("snowball", 4, 4, false), natural: true });
rule("snow_layer", { h: 0.1, tool: "shovel", drop: ore("snowball", 1, 1, false), kind: "pass", natural: true });
rule("ice|packed_ice|blue_ice", { h: 0.5, tool: "pickaxe", drop: null, natural: true });
rule("netherrack|crimson_nylium|warped_nylium", { h: 0.4, tool: "pickaxe", tier: 1, drop: "netherrack", natural: true });
rule("basalt|smooth_basalt|blackstone", { h: 1.25, tool: "pickaxe", tier: 1, natural: true });
rule("magma", { h: 0.5, tool: "pickaxe", tier: 1, kind: "danger", natural: true });
rule("glowstone", { h: 0.3, drop: ore("glowstone_dust", 2, 4), natural: true });
rule("end_stone", { h: 3, tool: "pickaxe", tier: 1, natural: true });
rule("sandstone|red_sandstone", { h: 0.8, tool: "pickaxe", tier: 1, natural: true });
rule("terracotta|.*_terracotta", { h: 1.25, tool: "pickaxe", tier: 1, natural: true });
// trees and plants
rule(".*_log|.*_wood|crimson_stem|warped_stem|crimson_hyphae|warped_hyphae", { h: 2, tool: "axe", natural: true });
rule(".*_leaves|azalea_leaves.*", {
  h: 0.2, tool: "hoe", natural: true,
  drop: (r) => (r() < 0.05 ? [[mc("oak_sapling"), 1]] : r() < 0.03 ? [[mc("stick"), 1 + Math.floor(r() * 2)]] : r() < 0.01 ? [[mc("apple"), 1]] : []),
});
rule("short_grass|tall_grass|grass_tall|fern|large_fern|deadbush|dead_bush|seagrass", { h: 0, kind: "pass", drop: (r) => (r() < 0.125 ? [[mc("wheat_seeds"), 1]] : []), natural: true });
rule("dandelion|poppy|.*_tulip|blue_orchid|allium|azure_bluet|oxeye_daisy|cornflower|lily_of_the_valley|sunflower|lilac|rose_bush|peony|.*_sapling|sapling|pink_petals|wildflowers|leaf_litter|brown_mushroom|red_mushroom|crimson_fungus|warped_fungus|crimson_roots|warped_roots|nether_sprouts|glow_lichen|hanging_roots|kelp|.*_coral_fan|sweet_berry_bush", { h: 0, kind: "pass", natural: true });
rule("vine|twisting_vines|weeping_vines|cave_vines.*", { h: 0.2, kind: "climb", drop: null, natural: true });
rule("reeds|sugar_cane", { h: 0, kind: "pass", drop: "sugar_cane", natural: true });
rule("wheat", { h: 0, kind: "pass", drop: null });
rule("nether_wart", { h: 0, kind: "pass", drop: ore("nether_wart", 2, 4), natural: true });
rule("melon_block", { h: 1, tool: "axe", drop: ore("melon_slice", 3, 7), natural: true });
rule("pumpkin", { h: 1, tool: "axe", natural: true });
rule("cactus", { h: 0.4, kind: "danger", natural: true });
rule("web|cobweb", { h: 4, tool: "sword", drop: "string", kind: "pass", natural: true });
rule("wither_rose|fire|soul_fire|campfire|soul_campfire|sweet_berry_bush|powder_snow", { h: 0, kind: "danger", drop: null });
rule("bee_nest|beehive|mushroom_stem|brown_mushroom_block|red_mushroom_block|nether_wart_block|warped_wart_block|shroomlight", { h: 0.5, natural: true });
// what people make
const WD = "oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|pale_oak|crimson|warped|bamboo";
rule(`wooden_door|(${WD})_door`, { h: 3, tool: "axe", kind: "door" });
rule(`trapdoor|(${WD})_trapdoor`, { h: 3, tool: "axe", kind: "door" });
rule(`fence_gate|(${WD})_fence_gate`, { h: 2, tool: "axe", kind: "door" });
rule("iron_door|iron_trapdoor", { h: 5, tool: "pickaxe", tier: 1 });
rule("nether_brick_fence", { h: 2, tool: "pickaxe", tier: 1, kind: "fence" });
rule(`fence|(${WD})_fence`, { h: 2, tool: "axe", kind: "fence" });
rule(".*_wall|iron_bars", { h: 2, tool: "pickaxe", tier: 1, kind: "fence" });
rule("ladder", { h: 0.4, tool: "axe", kind: "climb" });
rule("scaffolding", { h: 0, kind: "climb" });
rule(`.*_sign|.*standing_sign|.*wall_sign|.*_hanging_sign|(${WD})_pressure_plate|(${WD})_button|wooden_pressure_plate|wooden_button`, { h: 1, tool: "axe", kind: "pass" });
rule(`(${WD})_(planks|slab|stairs|double_slab)|crafting_table|bookshelf|chest|trapped_chest|barrel|loom|cartography_table|fletching_table|smithing_table|composter|lectern|jukebox|note_block|noteblock`, { h: 2, tool: "axe" });
rule(".*_slab|.*_double_slab|.*_stairs", { h: 2, tool: "pickaxe", tier: 1 });
rule(".*_pressure_plate|.*_button", { h: 0.5, tool: "pickaxe", kind: "pass" });
rule("furnace|lit_furnace|blast_furnace|lit_blast_furnace|smoker|lit_smoker|stonecutter_block|grindstone|brewing_stand|cauldron|dispenser|dropper|observer|piston|sticky_piston|hopper", { h: 3.5, tool: "pickaxe", tier: 1 });
rule("anvil|chipped_anvil|damaged_anvil|enchanting_table|iron_block|diamond_block|gold_block|emerald_block|netherite_block", { h: 5, tool: "pickaxe", tier: 2 });
rule("bed", { h: 0.2, drop: "bed" });
rule("torch|redstone_torch|soul_torch|lantern|soul_lantern|redstone_wire|rail|.*_rail|lever|tripwire|tripWire|tripwire_hook|frame|glow_frame|.*_carpet|carpet|.*_banner|standing_banner|wall_banner|flower_pot|candle|.*_candle", { h: 0, kind: "pass" });
rule("glass|.*_glass|glass_pane|.*_glass_pane", { h: 0.3, drop: null });
rule(".*_wool|wool", { h: 0.8, tool: "shears" });
rule("stone_bricks|mossy_stone_bricks|cracked_stone_bricks|chiseled_stone_bricks|bricks|nether_brick|red_nether_brick|nether_bricks|purpur_block|purpur_pillar|end_bricks|prismarine|polished_.*", { h: 1.5, tool: "pickaxe", tier: 1 });
rule("mob_spawner|spawner", { h: 5, tool: "pickaxe", drop: null });
rule("dragon_egg", { h: 3, drop: null });

const INFO_CACHE = new Map();
/** What a Player knows about a block. @param {string} id @returns {BlockInfo} */
export function blockInfo(id) {
  let info = INFO_CACHE.get(id);
  if (info) return info;
  info = { h: 1.5, tool: "pickaxe", kind: "solid" };
  for (const [re, i] of RULES) {
    if (re.test(id)) {
      info = { kind: "solid", ...i };
      break;
    }
  }
  INFO_CACHE.set(id, info);
  return info;
}

/** Blocks a body passes through. @param {string} id @param {any} [perm] */
export function isPassable(id, perm) {
  const k = blockInfo(id).kind;
  if (k === "air" || k === "pass" || k === "portal") return true;
  if (k === "door") {
    try {
      return !!perm?.getState?.("open_bit");
    } catch {
      return false;
    }
  }
  return false;
}

/** A block you can stand on (solid, not a fence and not harmful). @param {string} id */
export function isFloor(id) {
  const k = blockInfo(id).kind;
  return k === "solid" || k === "door";
}

// =============================================================================
// tools, weapons, armour
// =============================================================================
const TIERS = { wooden: 1, golden: 1, stone: 2, iron: 3, diamond: 4, netherite: 5 };
const TIER_SPEED = { wooden: 2, stone: 4, iron: 6, diamond: 8, netherite: 9, golden: 12 };
// Bedrock attack damage
const SWORD_DMG = { wooden: 5, golden: 5, stone: 6, iron: 7, diamond: 8, netherite: 9 };
const AXE_DMG = { wooden: 4, golden: 4, stone: 4, iron: 5, diamond: 6, netherite: 7 };
const PICK_DMG = { wooden: 3, golden: 3, stone: 4, iron: 5, diamond: 6, netherite: 7 };
const SHOVEL_DMG = { wooden: 2, golden: 2, stone: 3, iron: 4, diamond: 5, netherite: 6 };

/**
 * What a held item is to a Player: a tool (type, tier, mining speed), a weapon (damage) or neither.
 * @param {string | undefined} id
 * @returns {{type: string, tier: number, speed: number, damage: number, material?: string}}
 */
export function toolInfo(id) {
  const m = id && /^minecraft:(wooden|stone|iron|golden|diamond|netherite)_(pickaxe|axe|shovel|hoe|sword)$/.exec(id);
  if (!m) {
    if (id === "minecraft:shears") return { type: "shears", tier: 0, speed: 15, damage: 1 };
    if (id === "minecraft:trident") return { type: "trident", tier: 0, speed: 1, damage: 9 };
    if (id === "minecraft:mace") return { type: "mace", tier: 0, speed: 1, damage: 6 };
    return { type: "hand", tier: 0, speed: 1, damage: 1 };
  }
  const [, mat, type] = m;
  const dmg = type === "sword" ? SWORD_DMG[mat] : type === "axe" ? AXE_DMG[mat] : type === "pickaxe" ? PICK_DMG[mat]
    : type === "shovel" ? SHOVEL_DMG[mat] : 1;
  return { type, tier: TIERS[mat], speed: TIER_SPEED[mat], damage: dmg, material: mat };
}

const ARMOR_POINTS = {
  leather: [1, 3, 2, 1], chainmail: [2, 5, 4, 1], iron: [2, 6, 5, 2], golden: [2, 5, 3, 1], diamond: [3, 8, 6, 3],
  netherite: [3, 8, 6, 3],
};
export const ARMOR_SLOTS = ["helmet", "chestplate", "leggings", "boots"];
export const ARMOR_EQUIP = { helmet: "Head", chestplate: "Chest", leggings: "Legs", boots: "Feet" };
/** Armour points and slot of an armour item. @param {string | undefined} id */
export function armorInfo(id) {
  if (id === "minecraft:turtle_helmet") return { slot: "helmet", points: 2, material: "turtle" };
  const m = id && /^minecraft:(leather|chainmail|iron|golden|diamond|netherite)_(helmet|chestplate|leggings|boots)$/.exec(id);
  if (!m) return undefined;
  return { slot: m[2], points: ARMOR_POINTS[m[1]][ARMOR_SLOTS.indexOf(m[2])] + (m[1] === "netherite" ? 1 : 0), material: m[1] };
}

/** The material that repairs a tool or armour piece at an anvil. @param {string} id */
export function repairMaterial(id) {
  const m = /^minecraft:(wooden|stone|iron|golden|diamond|netherite|leather|chainmail)_/.exec(id);
  if (!m) return id === "minecraft:shield" ? "planks" : id === "minecraft:elytra" ? "minecraft:phantom_membrane" : undefined;
  return { wooden: "planks", stone: "stone_tool", iron: "minecraft:iron_ingot", golden: "minecraft:gold_ingot",
    diamond: "minecraft:diamond", netherite: "minecraft:netherite_ingot", leather: "minecraft:leather",
    chainmail: "minecraft:iron_ingot" }[m[1]];
}

/**
 * Ticks to break a block, as for a player: the right tool of a high enough tier mines at its
 * speed (plus efficiency), anything else at hand speed and a third of the pace; under water or in
 * the air it is five times slower. Infinity for unbreakable blocks.
 * @param {string} blockId @param {string | undefined} toolId
 * @param {{efficiency?: number, inWater?: boolean, onGround?: boolean, haste?: number}} [o]
 */
export function breakTicks(blockId, toolId, o = {}) {
  const b = blockInfo(blockId);
  if (b.h < 0) return Infinity;
  if (b.h === 0) return 1;
  const t = toolInfo(toolId);
  const right = !!b.tool && (t.type === b.tool || (b.tool === "hoe" && t.type === "shears") || (blockId.includes("web") && t.type === "sword"));
  const canHarvest = !b.tier || (t.type === "pickaxe" && t.tier >= b.tier);
  let speed = right ? t.speed : 1;
  if (right && o.efficiency) speed += o.efficiency * o.efficiency + 1;
  if (o.haste) speed *= 1 + 0.2 * o.haste;
  if (o.inWater) speed /= 5;
  if (o.onGround === false) speed /= 5;
  const perTick = speed / b.h / (canHarvest ? 30 : 100);
  if (perTick >= 1) return 1;
  return Math.ceil(1 / perTick);
}

/** Does breaking it with this tool give its drop? @param {string} blockId @param {string | undefined} toolId */
export function canHarvest(blockId, toolId) {
  const b = blockInfo(blockId);
  if (!b.tier) return true;
  const t = toolInfo(toolId);
  return t.type === "pickaxe" && t.tier >= b.tier;
}

/** Which tool type is right for a block. @param {string} blockId */
export function toolFor(blockId) {
  return blockInfo(blockId).tool;
}

// =============================================================================
// food, fuel, smelting
// =============================================================================
/** nutrition, saturation modifier */
export const FOOD = {
  apple: [4, 0.3], bread: [5, 0.6], cooked_beef: [8, 0.8], beef: [3, 0.3], cooked_porkchop: [8, 0.8], porkchop: [3, 0.3],
  cooked_chicken: [6, 0.6], chicken: [2, 0.3], cooked_mutton: [6, 0.8], mutton: [2, 0.3], carrot: [3, 0.6], potato: [1, 0.3],
  baked_potato: [5, 0.6], golden_apple: [4, 1.2], enchanted_golden_apple: [4, 1.2], golden_carrot: [6, 1.2],
  rotten_flesh: [4, 0.1], cookie: [2, 0.1], melon_slice: [2, 0.3], sweet_berries: [2, 0.1], cooked_cod: [5, 0.6],
  cooked_salmon: [6, 0.8], cod: [2, 0.1], salmon: [2, 0.1], pumpkin_pie: [8, 0.3], beetroot: [1, 0.6], dried_kelp: [1, 0.3],
  cooked_rabbit: [5, 0.6], rabbit: [3, 0.3], mushroom_stew: [6, 0.6], beetroot_soup: [6, 0.6], rabbit_stew: [10, 0.6],
};
/** Foods a Player only eats when there's nothing else (they make you ill, or are too precious). */
export const BAD_FOOD = new Set(["rotten_flesh", "chicken", "golden_apple", "enchanted_golden_apple", "spider_eye", "pufferfish", "poisonous_potato"]);

/** Ticks of furnace fuel. */
export const FUEL = {
  coal: 1600, charcoal: 1600, coal_block: 16000, lava_bucket: 20000, blaze_rod: 2400, dried_kelp_block: 4000, stick: 100,
};
/** @param {string} id */
export function fuelTicks(id) {
  const b = bare(id);
  if (FUEL[b]) return FUEL[b];
  if (/_planks$|_log$|_wood$|_stem$|_hyphae$|_slab$|_stairs$|_fence|crafting_table|bookshelf|chest|ladder|bowl/.test(b)) return 300;
  if (/^wooden_/.test(b)) return 200;
  if (/_sapling$/.test(b)) return 100;
  return 0;
}

/** What smelting an item makes. */
export const SMELT = {
  raw_iron: "iron_ingot", raw_gold: "gold_ingot", raw_copper: "copper_ingot", iron_ore: "iron_ingot", gold_ore: "gold_ingot",
  deepslate_iron_ore: "iron_ingot", deepslate_gold_ore: "gold_ingot", ancient_debris: "netherite_scrap", sand: "glass",
  red_sand: "glass", cobblestone: "stone", stone: "smooth_stone", cobbled_deepslate: "deepslate", clay_ball: "brick",
  netherrack: "nether_brick", beef: "cooked_beef", porkchop: "cooked_porkchop", chicken: "cooked_chicken",
  mutton: "cooked_mutton", rabbit: "cooked_rabbit", cod: "cooked_cod", salmon: "cooked_salmon", potato: "baked_potato",
  kelp: "dried_kelp", cactus: "green_dye",
};
for (const w of ["oak", "spruce", "birch", "jungle", "acacia", "dark_oak", "mangrove", "cherry", "pale_oak"]) SMELT[w + "_log"] = "charcoal";
/** Smoker: food only. Blast furnace: ores and metal. @param {string} input */
export function smelterFor(input) {
  const b = bare(input);
  if (/beef|porkchop|chicken|mutton|rabbit|cod|salmon|potato|kelp/.test(b)) return "smoker";
  if (/raw_|_ore$|ancient_debris/.test(b)) return "blast_furnace";
  return "furnace";
}

// =============================================================================
// item groups and crafting
// =============================================================================
export const WOODS = ["oak", "spruce", "birch", "jungle", "acacia", "dark_oak", "mangrove", "cherry", "pale_oak", "crimson", "warped", "bamboo"];
export const COLORS = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray", "cyan", "purple",
  "blue", "brown", "green", "red", "black"];
/** Item groups a recipe can take any of (any planks make sticks). */
export const GROUPS = {
  planks: WOODS.map((w) => mc(w + "_planks")),
  log: [...WOODS.filter((w) => !["crimson", "warped", "bamboo"].includes(w)).map((w) => mc(w + "_log")), mc("crimson_stem"), mc("warped_stem")],
  wool: COLORS.map((c) => mc(c + "_wool")),
  stone_tool: [mc("cobblestone"), mc("cobbled_deepslate"), mc("blackstone")],
  coal: [mc("coal"), mc("charcoal")],
};
/** The planks a log makes. @param {string} logId */
export function planksOf(logId) {
  const b = bare(logId);
  if (b === "crimson_stem") return mc("crimson_planks");
  if (b === "warped_stem") return mc("warped_planks");
  return mc(b.replace(/_log$/, "_planks"));
}

/**
 * @typedef {{out: string, n: number, needs: Record<string, number>, table?: boolean, xp?: number}} Recipe
 * needs: item id or GROUPS name -> count. table: needs a crafting table (a 3 x 3 recipe).
 */
/** @type {Recipe[]} */
export const RECIPES = [];
/** @param {string} out @param {number} count @param {Record<string, number>} needs @param {boolean} [table] */
function recipe(out, count, needs, table = false) {
  RECIPES.push({ out: mc(out), n: count, needs: Object.fromEntries(Object.entries(needs).map(([k, v]) => [GROUPS[k] ? k : mc(k), v])), table });
}
for (const w of WOODS) {
  if (w === "bamboo") continue;
  const log = w === "crimson" ? "crimson_stem" : w === "warped" ? "warped_stem" : w + "_log";
  recipe(w + "_planks", 4, { [log]: 1 });
}
recipe("stick", 4, { planks: 2 });
recipe("crafting_table", 1, { planks: 4 });
recipe("chest", 1, { planks: 8 }, true);
recipe("barrel", 1, { planks: 6, oak_slab: 2 }, true);
recipe("furnace", 1, { stone_tool: 8 }, true);
recipe("smoker", 1, { furnace: 1, log: 4 }, true);
recipe("blast_furnace", 1, { furnace: 1, iron_ingot: 5, smooth_stone: 3 }, true);
recipe("torch", 4, { stick: 1, coal: 1 });
recipe("ladder", 3, { stick: 7 }, true);
recipe("wooden_door", 3, { planks: 6 }, true);
recipe("bed", 1, { wool: 3, planks: 3 }, true);
recipe("white_wool", 1, { string: 4 });
recipe("bucket", 1, { iron_ingot: 3 }, true);
recipe("flint_and_steel", 1, { iron_ingot: 1, flint: 1 });
recipe("shield", 1, { planks: 6, iron_ingot: 1 }, true);
recipe("bow", 1, { stick: 3, string: 3 }, true);
recipe("arrow", 4, { flint: 1, stick: 1, feather: 1 }, true);
recipe("blaze_powder", 2, { blaze_rod: 1 });
recipe("ender_eye", 1, { ender_pearl: 1, blaze_powder: 1 });
recipe("paper", 3, { sugar_cane: 3 }, true);
recipe("book", 1, { paper: 3, leather: 1 });
recipe("bookshelf", 1, { planks: 6, book: 3 }, true);
recipe("enchanting_table", 1, { book: 1, diamond: 2, obsidian: 4 }, true);
recipe("iron_block", 1, { iron_ingot: 9 }, true);
recipe("anvil", 1, { iron_block: 3, iron_ingot: 4 }, true);
recipe("smithing_table", 1, { iron_ingot: 2, planks: 4 }, true);
recipe("stonecutter_block", 1, { iron_ingot: 1, stone: 3 }, true);
recipe("grindstone", 1, { stick: 2, stone_slab: 1, planks: 2 }, true);
recipe("brewing_stand", 1, { blaze_rod: 1, stone_tool: 3 }, true);
recipe("glass_bottle", 3, { glass: 3 }, true);
recipe("cauldron", 1, { iron_ingot: 7 }, true);
recipe("golden_apple", 1, { gold_ingot: 8, apple: 1 }, true);
recipe("gold_ingot", 1, { gold_nugget: 9 }, true);
recipe("iron_ingot", 1, { iron_nugget: 9 }, true);
recipe("bread", 1, { wheat: 3 }, true);
recipe("netherite_ingot", 1, { netherite_scrap: 4, gold_ingot: 4 }, true);
recipe("magma_cream", 1, { slime_ball: 1, blaze_powder: 1 });
recipe("glistering_melon_slice", 1, { melon_slice: 1, gold_nugget: 8 }, true);
recipe("sugar", 1, { sugar_cane: 1 });
recipe("cobblestone_slab", 6, { cobblestone: 3 }, true);
recipe("stone_slab", 6, { stone: 3 }, true);
recipe("cobblestone_stairs", 4, { cobblestone: 6 }, true);
recipe("stone_bricks", 4, { stone: 4 });
for (const [mat, item] of [["wooden", "planks"], ["stone", "stone_tool"], ["iron", "iron_ingot"], ["golden", "gold_ingot"], ["diamond", "diamond"]]) {
  recipe(mat + "_pickaxe", 1, { [item]: 3, stick: 2 }, true);
  recipe(mat + "_axe", 1, { [item]: 3, stick: 2 }, true);
  recipe(mat + "_sword", 1, { [item]: 2, stick: 1 }, true);
  recipe(mat + "_shovel", 1, { [item]: 1, stick: 2 }, true);
  recipe(mat + "_hoe", 1, { [item]: 2, stick: 2 }, true);
}
for (const [mat, item] of [["leather", "leather"], ["iron", "iron_ingot"], ["golden", "gold_ingot"], ["diamond", "diamond"]]) {
  recipe(mat + "_helmet", 1, { [item]: 5 }, true);
  recipe(mat + "_chestplate", 1, { [item]: 8 }, true);
  recipe(mat + "_leggings", 1, { [item]: 7 }, true);
  recipe(mat + "_boots", 1, { [item]: 4 }, true);
}
/** The recipe that makes an item (the first, for planks the one for a log the Player has). @param {string} id */
export function recipeFor(id) {
  return RECIPES.find((r) => r.out === mc(id));
}
/** Items that are a stage of the game: made at a smithing table from a diamond item. */
export const NETHERITE_UPGRADES = Object.fromEntries(
  ["sword", "pickaxe", "axe", "shovel", "hoe", "helmet", "chestplate", "leggings", "boots"].map((t) => [mc("diamond_" + t), mc("netherite_" + t)]));

// =============================================================================
// villagers: what each profession buys and sells (Bedrock prices, first tiers)
// =============================================================================
/** Bedrock villager_v2 variant -> profession. */
export const PROFESSIONS = ["unskilled", "farmer", "fisherman", "shepherd", "fletcher", "librarian", "cartographer", "cleric",
  "armorer", "weaponsmith", "toolsmith", "butcher", "leatherworker", "mason", "nitwit"];
/**
 * A trade: unlocked at villager level t (0 novice to 4 master); the Player hands over gn of
 * give and receives n of get.
 * @param {number} t @param {string} give @param {number} gn @param {string} get @param {number} n
 * @returns {{t: number, give: [string, number], get: [string, number]}}
 */
const T = (t, give, gn, get, n) => ({ t, give: [give, gn], get: [get, n] });
/** What each profession trades (Bedrock's tables). */
export const TRADES = {
  farmer: [T(0, "wheat", 20, "emerald", 1), T(0, "potato", 26, "emerald", 1), T(0, "carrot", 22, "emerald", 1), T(0, "beetroot", 15, "emerald", 1),
    T(0, "emerald", 1, "bread", 6), T(1, "pumpkin", 6, "emerald", 1), T(1, "emerald", 1, "apple", 4), T(1, "emerald", 1, "pumpkin_pie", 4),
    T(2, "melon_block", 4, "emerald", 1), T(4, "emerald", 3, "golden_carrot", 3), T(4, "emerald", 4, "glistering_melon_slice", 3)],
  fisherman: [T(0, "string", 20, "emerald", 1), T(0, "coal", 10, "emerald", 1), T(1, "cod", 15, "emerald", 1), T(2, "emerald", 3, "fishing_rod", 1)],
  shepherd: [T(0, "white_wool", 18, "emerald", 1), T(0, "emerald", 2, "shears", 1), T(2, "emerald", 3, "bed", 1)],
  fletcher: [T(0, "stick", 32, "emerald", 1), T(0, "emerald", 1, "arrow", 16), T(1, "flint", 26, "emerald", 1), T(1, "emerald", 2, "bow", 1),
    T(2, "string", 14, "emerald", 1), T(3, "feather", 24, "emerald", 1)],
  librarian: [T(0, "paper", 24, "emerald", 1), T(0, "emerald", 9, "bookshelf", 1), T(1, "book", 4, "emerald", 1), T(1, "emerald", 1, "lantern", 1),
    T(3, "emerald", 5, "clock", 1), T(3, "emerald", 4, "compass", 1)],
  cartographer: [T(0, "paper", 24, "emerald", 1), T(0, "emerald", 7, "empty_map", 1), T(1, "glass_pane", 11, "emerald", 1)],
  cleric: [T(0, "rotten_flesh", 32, "emerald", 1), T(0, "emerald", 1, "redstone", 2), T(1, "gold_ingot", 3, "emerald", 1),
    T(1, "emerald", 1, "lapis_lazuli", 1), T(2, "emerald", 4, "glowstone", 1), T(3, "glass_bottle", 9, "emerald", 1),
    T(3, "emerald", 5, "ender_pearl", 1), T(4, "nether_wart", 22, "emerald", 1), T(4, "emerald", 3, "experience_bottle", 1)],
  armorer: [T(0, "coal", 15, "emerald", 1), T(0, "emerald", 5, "iron_helmet", 1), T(0, "emerald", 9, "iron_chestplate", 1),
    T(0, "emerald", 7, "iron_leggings", 1), T(0, "emerald", 4, "iron_boots", 1), T(1, "iron_ingot", 4, "emerald", 1),
    T(2, "diamond", 1, "emerald", 1), T(2, "emerald", 5, "shield", 1), T(3, "emerald", 14, "diamond_leggings", 1), T(3, "emerald", 8, "diamond_boots", 1),
    T(4, "emerald", 8, "diamond_helmet", 1), T(4, "emerald", 16, "diamond_chestplate", 1)],
  weaponsmith: [T(0, "coal", 15, "emerald", 1), T(0, "emerald", 3, "iron_axe", 1), T(0, "emerald", 2, "iron_sword", 1), T(1, "iron_ingot", 4, "emerald", 1),
    T(2, "flint", 24, "emerald", 1), T(3, "diamond", 1, "emerald", 1), T(3, "emerald", 12, "diamond_axe", 1), T(4, "emerald", 8, "diamond_sword", 1)],
  toolsmith: [T(0, "coal", 15, "emerald", 1), T(0, "emerald", 1, "stone_axe", 1), T(0, "emerald", 1, "stone_shovel", 1), T(0, "emerald", 1, "stone_pickaxe", 1),
    T(1, "iron_ingot", 4, "emerald", 1), T(2, "flint", 30, "emerald", 1), T(2, "emerald", 3, "iron_pickaxe", 1), T(3, "diamond", 1, "emerald", 1),
    T(4, "emerald", 13, "diamond_pickaxe", 1)],
  butcher: [T(0, "chicken", 14, "emerald", 1), T(0, "porkchop", 7, "emerald", 1), T(1, "coal", 15, "emerald", 1), T(1, "emerald", 1, "cooked_porkchop", 5),
    T(1, "emerald", 1, "cooked_chicken", 8), T(2, "beef", 10, "emerald", 1), T(2, "mutton", 7, "emerald", 1)],
  leatherworker: [T(0, "leather", 6, "emerald", 1), T(0, "emerald", 3, "leather_leggings", 1), T(0, "emerald", 7, "leather_chestplate", 1),
    T(1, "flint", 26, "emerald", 1)],
  mason: [T(0, "clay_ball", 10, "emerald", 1), T(0, "emerald", 1, "brick", 10), T(1, "stone", 20, "emerald", 1)],
};

// =============================================================================
// enchanting
// =============================================================================
/** What an enchanting table can put on each kind of item: [enchantment, max level, weight]. */
export const ENCHANTS = {
  sword: [["sharpness", 5, 10], ["smite", 5, 5], ["bane_of_arthropods", 5, 5], ["knockback", 2, 5], ["fire_aspect", 2, 2], ["looting", 3, 2], ["unbreaking", 3, 5]],
  axe: [["efficiency", 5, 10], ["sharpness", 5, 5], ["unbreaking", 3, 5], ["fortune", 3, 2], ["silk_touch", 1, 1]],
  pickaxe: [["efficiency", 5, 10], ["unbreaking", 3, 5], ["fortune", 3, 2], ["silk_touch", 1, 1]],
  shovel: [["efficiency", 5, 10], ["unbreaking", 3, 5], ["fortune", 3, 2], ["silk_touch", 1, 1]],
  hoe: [["efficiency", 5, 10], ["unbreaking", 3, 5]],
  bow: [["power", 5, 10], ["punch", 2, 2], ["flame", 1, 2], ["infinity", 1, 1], ["unbreaking", 3, 5]],
  helmet: [["protection", 4, 10], ["fire_protection", 4, 5], ["blast_protection", 4, 2], ["projectile_protection", 4, 5], ["respiration", 3, 2], ["aqua_affinity", 1, 2], ["unbreaking", 3, 5]],
  chestplate: [["protection", 4, 10], ["fire_protection", 4, 5], ["blast_protection", 4, 2], ["projectile_protection", 4, 5], ["unbreaking", 3, 5]],
  leggings: [["protection", 4, 10], ["fire_protection", 4, 5], ["blast_protection", 4, 2], ["projectile_protection", 4, 5], ["unbreaking", 3, 5]],
  boots: [["protection", 4, 10], ["feather_falling", 4, 5], ["fire_protection", 4, 5], ["depth_strider", 3, 2], ["unbreaking", 3, 5]],
};
/** The enchanting kind of an item ("sword", "pickaxe", "helmet"...), or undefined. @param {string} id */
export function enchantKind(id) {
  const b = bare(id);
  if (b === "bow") return "bow";
  const m = /_(sword|axe|pickaxe|shovel|hoe|helmet|chestplate|leggings|boots)$/.exec(b);
  return m ? m[1] : undefined;
}

// =============================================================================
// potions (brewed at a brewing stand: nether wart makes awkward potions, then an ingredient)
// =============================================================================
export const POTIONS = {
  fire_resistance: { ingredient: "magma_cream", effect: "fire_resistance", ticks: 3600, amp: 0, name: "Potion of Fire Resistance" },
  healing: { ingredient: "glistering_melon_slice", effect: "instant_health", ticks: 1, amp: 0, name: "Potion of Healing" },
  swiftness: { ingredient: "sugar", effect: "speed", ticks: 3600, amp: 0, name: "Potion of Swiftness" },
  strength: { ingredient: "blaze_powder", effect: "strength", ticks: 3600, amp: 0, name: "Potion of Strength" },
  regeneration: { ingredient: "ghast_tear", effect: "regeneration", ticks: 900, amp: 0, name: "Potion of Regeneration" },
  night_vision: { ingredient: "golden_carrot", effect: "night_vision", ticks: 3600, amp: 0, name: "Potion of Night Vision" },
};

// =============================================================================
// death messages (as the game words them)
// =============================================================================
/** @param {string} cause @param {string | undefined} by */
export function deathMessage(cause, by) {
  switch (cause) {
    case "entityAttack": return by ? `was slain by ${by}` : "was slain";
    case "projectile": return by ? `was shot by ${by}` : "was shot";
    case "fall": return "fell from a high place";
    case "lava": return "tried to swim in lava";
    case "fire": return "went up in flames";
    case "fireTick": return "burned to death";
    case "drowning": return "drowned";
    case "entityExplosion": return by ? `was blown up by ${by}` : "blew up";
    case "blockExplosion": return "blew up";
    case "suffocation": return "suffocated in a wall";
    case "void": return "fell out of the world";
    case "starve": return "starved to death";
    case "magic": return "was killed by magic";
    case "lightning": return "was struck by lightning";
    case "freezing": return "froze to death";
    case "contact": return "was pricked to death";
    case "anvil": return "was squashed by a falling anvil";
    case "fallingBlock": return "was squashed by a falling block";
    case "wither": return "withered away";
    case "magma": return "discovered the floor was lava";
    default: return by ? `was killed by ${by}` : "died";
  }
}
/** "minecraft:zombie_villager_v2" -> "Zombie Villager" @param {string} typeId */
export function mobName(typeId) {
  if (typeId === "minecraft:ender_dragon") return "Ender Dragon";
  return bare(typeId).replace(/^zt:/, "").replace(/_v\d+$/, "").split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// =============================================================================
// names and personalities
// =============================================================================
export const NAMES = ["BlockyDan", "PixelPip", "MinerMax", "CraftyKate", "LavaLeo", "PickaxePia", "RedstoneRob", "CobbleCass",
  "DiggyDee", "NoahPlays", "Mia_Crafts", "Jaxon_88", "Zoe1209", "OllieOof", "Ava_B", "TheRealSam", "Lily_Lime", "Finn_YT",
  "ElytraEli", "ChunkyChris", "Diamond_Dina", "BedrockBen", "NetherNora", "EndermanEd", "GG_Gabe", "HopperHal", "Quartz_Quinn",
  "TorchyTess", "SprintSpencer", "BuilderBea", "AxolotlAmy", "CreeperCarl", "Mossy_Mo", "Ruby_Rae", "Pebble_Pete", "Sky_Sasha",
  "Iggy_Iron", "Willow_W", "Kai_Kraft", "Juniper_J"];
export const STYLES = ["cheerful", "chill", "grumpy", "nerdy", "competitive"];
