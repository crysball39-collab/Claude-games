// A tiny stand-in for @minecraft/server, just enough to run the add-on's
// scripts in Node and smoke-test them (flat stone world at y = 64).
import { readFileSync } from "node:fs";
import { join } from "node:path";
const listeners = () => {
  const subs = [];
  return {
    subs,
    subscribe(fn, opts) {
      subs.push({ fn, opts });
      return fn;
    },
    unsubscribe() {},
    fire(ev) {
      for (const { fn, opts } of subs) {
        if (opts?.entityTypes) {
          const e = ev.deadEntity ?? ev.hurtEntity ?? ev.entity;
          if (e && !opts.entityTypes.includes(e.typeId)) continue;
        }
        fn(ev);
      }
    },
  };
};

export const log = { sounds: [], particles: [], messages: [], commands: [], items: [], errors: [], explosions: [], animations: [], teleports: [] };

export const GameMode = { Survival: "Survival", Creative: "Creative", Adventure: "Adventure", Spectator: "Spectator" };
export const Difficulty = { Peaceful: "Peaceful", Easy: "Easy", Normal: "Normal", Hard: "Hard" };
export const EquipmentSlot = { Mainhand: "Mainhand", Offhand: "Offhand", Head: "Head", Chest: "Chest", Legs: "Legs", Feet: "Feet" };
export const ItemLockMode = { inventory: "inventory", none: "none", slot: "slot" };
export const EasingType = { InOutSine: "InOutSine", Linear: "Linear", OutQuad: "OutQuad" };
export const InputPermissionCategory = { Camera: 1, Movement: 2, LateralMovement: 4, Sneak: 5, Jump: 6 };

let nextId = 1;
let tickCounter = 0;
const intervals = [];
const timeouts = [];

export const system = {
  get currentTick() {
    return tickCounter;
  },
  runInterval(fn, n = 1) {
    intervals.push({ fn, n });
    return intervals.length;
  },
  runTimeout(fn, n = 1) {
    timeouts.push({ fn, at: tickCounter + n });
    return timeouts.length;
  },
  run(fn) {
    timeouts.push({ fn, at: tickCounter });
  },
  runJob(gen) {
    jobs.push(gen);
    return jobs.length;
  },
  afterEvents: { scriptEventReceive: listeners() },
  sendScriptEvent(id, message) {
    if (typeof id !== "string" || !/^[a-z0-9_]+:[a-z0-9_]+$/.test(id)) throw new Error("bad script event id " + id);
    if (String(message).length > 2048) throw new Error("script event message over 2048 characters");
    timeouts.push({ fn: () => system.afterEvents.scriptEventReceive.fire({ id, message: String(message), sourceType: "Server" }), at: tickCounter + 1 });
  },
  beforeEvents: { startup: listeners(), shutdown: listeners() },
};
const jobs = [];

export function runTicks(n, each) {
  for (let i = 0; i < n; i++) {
    tickCounter++;
    for (const d of dims.values()) d._physics();
    if (sim.machines) machinesTick();
    for (const t of [...timeouts]) {
      if (t.at <= tickCounter) {
        timeouts.splice(timeouts.indexOf(t), 1);
        t.fn();
      }
    }
    // jobs get a slice of each tick, like system.runJob
    for (const job of [...jobs]) {
      for (let k = 0; k < 40; k++) {
        if (job.next().done) {
          jobs.splice(jobs.indexOf(job), 1);
          break;
        }
      }
    }
    for (const iv of intervals) if (tickCounter % iv.n === 0) iv.fn();
    // a callback returning true stops early
    if (each && each(tickCounter) === true) return;
  }
}

export class MolangVariableMap {
  constructor() {
    this.vars = {};
  }
  setFloat(k, v) {
    this.vars[k] = v;
  }
  setVector3(k, v) {
    if (![v.x, v.y, v.z].every(Number.isFinite)) throw new Error("bad vector " + k);
    this.vars[k] = v;
  }
  setColorRGB(k, v) {
    this.vars[k] = v;
  }
  setColorRGBA(k, v) {
    this.vars[k] = v;
  }
}

export class BlockVolume {
  constructor(from, to) {
    this.from = from;
    this.to = to;
  }
}

// the pack's items (run.mjs writes them): stack sizes and durability
const ITEMS = (() => {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), "items.json"), "utf8"));
  } catch {
    return {};
  }
})();

// vanilla items the Players use: how many stack, how long tools last, what food gives
const NOT_STACKABLE = /(_sword|_pickaxe|_axe|_shovel|_hoe|_helmet|_chestplate|_leggings|_boots|^minecraft:bow$|crossbow|^minecraft:shield$|potion|_bucket$|_bed$|elytra|totem_of_undying|flint_and_steel|^minecraft:shears$|fishing_rod|trident|^minecraft:saddle$|_boat$|minecart|enchanted_book|writable_book|written_book|music_disc|^minecraft:cake$|_stew$|_soup$|_smithing_template$|^minecraft:mace$)/;
const STACK16 = /(ender_pearl|^minecraft:egg$|snowball|^minecraft:bucket$|_sign$|_banner$|honey_bottle|armor_stand)/;
const TIER_DURABILITY = { wooden: 59, stone: 131, iron: 250, golden: 32, diamond: 1561, netherite: 2031 };
const ARMOR_DURABILITY = { leather: [55, 80, 75, 65], chainmail: [165, 240, 225, 195], iron: [165, 240, 225, 195],
  golden: [77, 112, 105, 91], diamond: [363, 528, 495, 429], netherite: [407, 592, 555, 481] };
const OTHER_DURABILITY = { bow: 384, crossbow: 465, shield: 336, flint_and_steel: 64, shears: 238, fishing_rod: 384,
  trident: 250, elytra: 432, turtle_helmet: 275, mace: 500 };
function vanillaDurability(id) {
  const n = id.replace(/^minecraft:/, "");
  const tool = n.match(/^(wooden|stone|iron|golden|diamond|netherite)_(sword|pickaxe|axe|shovel|hoe)$/);
  if (tool) return TIER_DURABILITY[tool[1]];
  const armor = n.match(/^(leather|chainmail|iron|golden|diamond|netherite)_(helmet|chestplate|leggings|boots)$/);
  if (armor) return ARMOR_DURABILITY[armor[1]][["helmet", "chestplate", "leggings", "boots"].indexOf(armor[2])];
  return OTHER_DURABILITY[n];
}
const FOOD = { apple: [4, 0.3], bread: [5, 0.6], cooked_beef: [8, 0.8], beef: [3, 0.3], cooked_porkchop: [8, 0.8],
  porkchop: [3, 0.3], cooked_chicken: [6, 0.6], chicken: [2, 0.3], cooked_mutton: [6, 0.8], mutton: [2, 0.3],
  carrot: [3, 0.6], potato: [1, 0.3], baked_potato: [5, 0.6], golden_apple: [4, 1.2], enchanted_golden_apple: [4, 1.2],
  golden_carrot: [6, 1.2], rotten_flesh: [4, 0.1], cookie: [2, 0.1], melon_slice: [2, 0.3], sweet_berries: [2, 0.1],
  cooked_cod: [5, 0.6], cooked_salmon: [6, 0.8], cod: [2, 0.1], salmon: [2, 0.1], pumpkin_pie: [8, 0.3],
  beetroot: [1, 0.6], dried_kelp: [1, 0.3], cooked_rabbit: [5, 0.6], rabbit: [3, 0.3], mushroom_stew: [6, 0.6] };
export const EnchantmentTypes = {
  get(id) {
    const full = id.includes(":") ? id : "minecraft:" + id;
    return { id: full, maxLevel: 5 };
  },
  getAll() {
    return [];
  },
};
export class EnchantmentType {
  constructor(id) {
    this.id = id.includes(":") ? id : "minecraft:" + id;
    this.maxLevel = 5;
  }
}

export class ItemStack {
  constructor(typeId, amount = 1) {
    if (typeof typeId === "object" && typeId?.id) typeId = typeId.id;
    if (!typeId.includes(":")) typeId = "minecraft:" + typeId;
    if (amount < 1 || amount > 255) throw new Error("bad amount " + amount);
    const def = ITEMS[typeId];
    if (amount > this.constructor.maxOf(typeId)) {
      throw new Error(`${typeId} stacks to ${this.constructor.maxOf(typeId)}, not ${amount}`);
    }
    this.typeId = typeId;
    this.amount = amount;
    this.lore = [];
    this.lockMode = "none";
    this.keepOnDeath = false;
    this.nameTag = undefined;
    this.enchants = [];
    this.dyn = {};
    const maxDur = def?.durability ?? vanillaDurability(typeId);
    if (maxDur) {
      const self = this;
      this.durability = { damage: 0, get maxDurability() {
        return maxDur;
      }, set damageValue(v) {
        self.durability.damage = v;
      } };
    }
  }
  static maxOf(id) {
    const def = ITEMS[id];
    if (def) return def.maxStack;
    if (NOT_STACKABLE.test(id)) return 1;
    if (STACK16.test(id)) return 16;
    return 64;
  }
  get maxAmount() {
    return ItemStack.maxOf(this.typeId);
  }
  get isStackable() {
    return this.maxAmount > 1;
  }
  get type() {
    return { id: this.typeId };
  }
  isStackableWith(other) {
    return !!other && other.typeId === this.typeId && this.maxAmount > 1 && other.nameTag === this.nameTag &&
      JSON.stringify(other.lore) === JSON.stringify(this.lore) && !this.enchants.length && !other.enchants.length;
  }
  clone() {
    const c = new ItemStack(this.typeId, this.amount);
    c.lore = [...this.lore];
    c.lockMode = this.lockMode;
    c.keepOnDeath = this.keepOnDeath;
    c.nameTag = this.nameTag;
    c.enchants = this.enchants.map((e) => ({ ...e }));
    c.dyn = { ...this.dyn };
    if (this.durability) c.durability.damage = this.durability.damage;
    return c;
  }
  getComponent(id) {
    const name = id.replace(/^minecraft:/, "");
    if (name === "durability") return this.durability;
    if (name === "food") {
      const f = FOOD[this.typeId.replace(/^minecraft:/, "")];
      return f ? { nutrition: f[0], saturationModifier: f[1], canAlwaysEat: /golden_apple/.test(this.typeId), usingConvertsTo: "" } : undefined;
    }
    if (name === "enchantable") {
      const self = this;
      return {
        getEnchantments: () => self.enchants.map((e) => ({ type: { id: e.id, maxLevel: 5 }, level: e.level })),
        getEnchantment: (t) => {
          const id = typeof t === "string" ? t : t.id;
          const e = self.enchants.find((x) => x.id === id || x.id === "minecraft:" + id);
          return e ? { type: { id: e.id, maxLevel: 5 }, level: e.level } : undefined;
        },
        hasEnchantment: (t) => self.enchants.some((x) => x.id === (typeof t === "string" ? t : t.id) || x.id === "minecraft:" + (typeof t === "string" ? t : t.id)),
        addEnchantment: (e) => {
          const id = typeof e.type === "string" ? e.type : e.type.id;
          if (!Number.isInteger(e.level) || e.level < 1) throw new Error("bad enchantment level " + e.level);
          self.enchants = self.enchants.filter((x) => x.id !== id);
          self.enchants.push({ id, level: e.level });
        },
        addEnchantments: (list) => list.forEach((e) => self.getComponent("enchantable").addEnchantment(e)),
        removeEnchantment: (t) => {
          const id = typeof t === "string" ? t : t.id;
          self.enchants = self.enchants.filter((x) => x.id !== id);
        },
        removeAllEnchantments: () => {
          self.enchants = [];
        },
        canAddEnchantment: () => true,
      };
    }
    return undefined;
  }
  hasComponent(id) {
    return !!this.getComponent(id);
  }
  getLore() {
    return this.lore;
  }
  setLore(l) {
    this.lore = l ?? [];
  }
  getDynamicProperty(k) {
    return this.dyn[k];
  }
  setDynamicProperty(k, v) {
    if (this.maxAmount > 1) throw new Error("dynamic properties only on unstackable items");
    if (v === undefined) delete this.dyn[k];
    else this.dyn[k] = v;
  }
  getTags() {
    return [];
  }
  hasTag() {
    return false;
  }
}

// The blocks of one version of Minecraft (ZT_MC, default the newest in vanilla-blocks.json,
// which run.mjs puts in the working directory with custom-blocks.json for the pack's own):
// id -> { state: allowed values }. Without those files any well-formed id passes.
function loadBlocks() {
  let vanilla;
  let custom = {};
  try {
    vanilla = JSON.parse(readFileSync(join(process.cwd(), "vanilla-blocks.json"), "utf8"));
    custom = JSON.parse(readFileSync(join(process.cwd(), "custom-blocks.json"), "utf8"));
  } catch {
    return undefined;
  }
  const want = process.env.ZT_MC || vanilla.base;
  const base = vanilla.versions[vanilla.base];
  const v = vanilla.versions[want];
  if (!v) throw new Error("no block list for Minecraft " + want);
  const props = { ...base.props, ...v.props };
  const names = { ...base.blocks };
  if (want !== vanilla.base) {
    for (const id of v.removed) delete names[id];
    Object.assign(names, v.blocks);
  }
  const table = new Map();
  for (const [id, list] of Object.entries(names)) table.set(id, Object.fromEntries(list.map((k) => [k, props[k]])));
  for (const [id, states] of Object.entries(custom)) table.set(id, states);
  return { version: want, table };
}
export const blocks = loadBlocks();

function checkState(id, k, v) {
  const allowed = blocks?.table.get(id)?.[k];
  if (!blocks) {
    if (!["string", "number", "boolean"].includes(typeof v)) throw new Error("bad block state " + k);
    return;
  }
  if (!allowed) throw new Error(`block ${id} has no state ${k} in Minecraft ${blocks.version}`);
  if (!allowed.some((a) => a === v)) throw new Error(`${JSON.stringify(v)} is not a value of ${id} state ${k} in Minecraft ${blocks.version}`);
}

export const BlockTypes = {
  get(id) {
    if (blocks) return blocks.table.has(id) ? { id } : undefined;
    return id.startsWith("minecraft:") ? { id } : undefined;
  },
};

export class BlockPermutation {
  constructor(id, states) {
    this.type = { id };
    this.states = { ...(states ?? {}) };
  }
  static resolve(id, states) {
    if (typeof id !== "string" || !/^(minecraft|zt):[a-z0-9_]+$/.test(id)) throw new Error("bad block id " + id);
    if (blocks && !blocks.table.has(id)) throw new Error(`no block ${id} in Minecraft ${blocks.version}`);
    for (const [k, v] of Object.entries(states ?? {})) checkState(id, k, v);
    return new BlockPermutation(id, states);
  }
  withState(k, v) {
    checkState(this.type.id, k, v);
    return new BlockPermutation(this.type.id, { ...this.states, [k]: v });
  }
  getState(k) {
    return this.states[k];
  }
}

// Chunks a test marks as not loaded ("cx,cz"): placing or reading blocks there throws, as in the game.
export const unloadedChunks = new Set();
export class LocationInUnloadedChunkError extends Error {}
export class UnloadedChunksError extends Error {}
function chunkUnloaded(x, z) {
  return unloadedChunks.has(`${Math.floor(x / 16)},${Math.floor(z / 16)}`);
}
function areaUnloaded(a, b) {
  if (!unloadedChunks.size) return false;
  for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x) + 15; x += 16) {
    for (let z = Math.min(a.z, b.z); z <= Math.max(a.z, b.z) + 15; z += 16) {
      if (chunkUnloaded(Math.min(x, Math.max(a.x, b.x)), Math.min(z, Math.max(a.z, b.z)))) return true;
    }
  }
  return false;
}

const stoneTop = 64;
/**
 * Switches for the Player tests (all off by default, so the other tests keep the old flat world):
 *   terrain  (dimId, x, y, z) => block id or undefined: the world under what scripts place
 *   items    spawnItem makes item entities that fall and can be picked up
 *   mobs     hostile mobs chase and hit players (and Players), passive ones wander, the dragon flies
 *   portals  entities that stand in a portal go to the other dimension
 *   machines furnaces smelt, brewing stands brew, water poured on lava makes obsidian
 */
export const sim = { terrain: null, items: false, mobs: false, portals: false, machines: false };
const DIM_PREFIX = { "minecraft:overworld": "", "minecraft:nether": "n|", "minecraft:the_end": "e|" };
function dimIdOf(dim) {
  return typeof dim === "string" ? dim : (dim?.id ?? "minecraft:overworld");
}
function keyOf(dim, x, y, z) {
  return (DIM_PREFIX[dimIdOf(dim)] ?? "") + `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
}
export const blockOverrides = new Map();
/** every block a script placed: "x,y,z" -> permutation ("n|x,y,z" in the Nether, "e|x,y,z" in the End) */
export const placed = new Map();
function blockAt(dim, x, y, z) {
  const key = keyOf(dim, x, y, z);
  if (blockOverrides.has(key)) return blockOverrides.get(key);
  const p = placed.get(key);
  if (p) return p.type.id;
  const t = sim.terrain?.(dimIdOf(dim), Math.floor(x), Math.floor(y), Math.floor(z));
  if (t) return t;
  return y < stoneTop ? "minecraft:stone" : "minecraft:air";
}
export function blockPerm(x, y, z, dim) {
  return placed.get(keyOf(dim, x, y, z));
}
/** A block's id, for tests. */
export function blockId(dim, x, y, z) {
  return blockAt(dim, x, y, z);
}
/** Put a block, for tests (no checks). */
export function setBlock(dim, x, y, z, id, states) {
  placeBlock(dim, { x, y, z }, new BlockPermutation(id.includes(":") ? id : "minecraft:" + id, states));
}
const blockContainers = new Map();
const CONTAINER_SIZES = { chest: 27, trapped_chest: 27, barrel: 27, furnace: 3, lit_furnace: 3, blast_furnace: 3,
  lit_blast_furnace: 3, smoker: 3, lit_smoker: 3, brewing_stand: 5, hopper: 5, dispenser: 9, dropper: 9 };
function containerSizeOf(id) {
  const n = id.replace(/^minecraft:/, "");
  if (/shulker_box$/.test(n)) return 27;
  return CONTAINER_SIZES[n];
}
/** The container of a chest, furnace, brewing stand... (made on first use, as a block entity is). */
export function blockContainer(dim, loc) {
  const id = blockAt(dim, loc.x, loc.y, loc.z);
  const size = containerSizeOf(id);
  if (!size) return undefined;
  const key = keyOf(dim, loc.x, loc.y, loc.z);
  let c = blockContainers.get(key);
  if (!c || c.size !== size) {
    c = new Container(size);
    c.blockKey = key;
    c.blockId = id;
    c.dim = dimIdOf(dim);
    c.loc = { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) };
    blockContainers.set(key, c);
  }
  return c;
}
function placeBlock(dim, loc, perm) {
  const key = keyOf(dim, loc.x, loc.y, loc.z);
  blockOverrides.delete(key);
  const before = placed.get(key)?.type.id;
  placed.set(key, perm);
  // a block entity goes with its block (a lit furnace keeps its contents)
  if (blockContainers.has(key) && before !== perm.type.id) {
    const sameKind = (a, b) => a && b && a.replace("lit_", "") === b.replace("lit_", "");
    if (!sameKind(before, perm.type.id)) blockContainers.delete(key);
  }
  if (sim.machines) liquidsMeet(dim, loc, perm.type.id);
}
const LAVA = new Set(["minecraft:lava", "minecraft:flowing_lava"]);
const WATER = new Set(["minecraft:water", "minecraft:flowing_water"]);
/** Water poured next to (or onto) a lava source turns it to obsidian; lava next to water makes cobblestone. */
function liquidsMeet(dim, loc, id) {
  const near = [[0, -1, 0], [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  if (WATER.has(id)) {
    for (const [dx, dy, dz] of near) {
      const p = { x: Math.floor(loc.x) + dx, y: Math.floor(loc.y) + dy, z: Math.floor(loc.z) + dz };
      if (blockAt(dim, p.x, p.y, p.z) === "minecraft:lava") placed.set(keyOf(dim, p.x, p.y, p.z), new BlockPermutation("minecraft:obsidian", {}));
    }
  } else if (LAVA.has(id)) {
    for (const [dx, dy, dz] of near) {
      if (WATER.has(blockAt(dim, Math.floor(loc.x) + dx, Math.floor(loc.y) + dy, Math.floor(loc.z) + dz))) {
        placed.set(keyOf(dim, loc.x, loc.y, loc.z), new BlockPermutation("minecraft:cobblestone", {}));
        return;
      }
    }
  }
}

/** Blocks a body passes through (everything else is a full cube to the physics here). */
const PASSABLE = /^minecraft:(air|cave_air|void_air|light_block.*|water|flowing_water|lava|flowing_lava|short_grass|tall_grass|grass|fern|large_fern|deadbush|dead_bush|seagrass|kelp|vine|ladder|torch|wall_torch|soul_torch|redstone_torch|lantern|fire|soul_fire|portal|end_portal|end_gateway|snow_layer|.*_carpet|carpet|rail|.*_rail|redstone_wire|.*pressure_plate|.*_button|lever|.*_sign|.*standing_sign|.*wall_sign|.*_banner|standing_banner|wall_banner|.*_sapling|sapling|dandelion|poppy|.*_tulip|blue_orchid|allium|azure_bluet|oxeye_daisy|cornflower|lily_of_the_valley|sunflower|lilac|rose_bush|peony|.*_mushroom|wheat|carrots|potatoes|beetroot|sweet_berry_bush|web|cobweb|tripwire|string|nether_wart|crimson_roots|warped_roots|nether_sprouts|twisting_vines|weeping_vines|glow_lichen|hanging_roots|cave_vines.*|pink_petals|leaf_litter|wildflowers)$/;
const OPENABLE = /door|trapdoor|fence_gate/;
function collides(id, perm, dim, x, y, z) {
  if (PASSABLE.test(id)) return false;
  if (OPENABLE.test(id) && perm?.getState?.("open_bit")) return false;
  // a door's top half is open when its bottom half is (the game keeps the state below)
  if (/door/.test(id) && perm?.getState?.("upper_block_bit") && dim && blockPerm(x, y - 1, z, dim)?.getState?.("open_bit")) return false;
  return true;
}

class Block {
  constructor(dim, x, y, z) {
    this.dimension = dim;
    this.location = { x, y, z };
    this.x = x;
    this.y = y;
    this.z = z;
  }
  get typeId() {
    return blockAt(this.dimension, this.x, this.y, this.z);
  }
  get type() {
    return { id: this.typeId };
  }
  get permutation() {
    return blockPerm(this.x, this.y, this.z, this.dimension) ?? new BlockPermutation(this.typeId, {});
  }
  get isValid() {
    return true;
  }
  get isWaterlogged() {
    return false;
  }
  get isAir() {
    return /^minecraft:(air|cave_air|void_air)$/.test(this.typeId) || this.typeId.startsWith("minecraft:light_block");
  }
  get isLiquid() {
    return this.typeId.includes("water") || this.typeId.includes("lava");
  }
  get isSolid() {
    return !this.isAir && !/carpet|barrier|light_block|candle|lantern|chain/.test(this.typeId);
  }
  getComponent(id) {
    if (id === "minecraft:inventory" || id === "inventory") {
      const c = blockContainer(this.dimension, this.location);
      return c ? { container: c, isValid: true } : undefined;
    }
    return undefined;
  }
  above(n = 1) {
    return new Block(this.dimension, this.x, this.y + n, this.z);
  }
  below(n = 1) {
    return new Block(this.dimension, this.x, this.y - n, this.z);
  }
  north(n = 1) {
    return new Block(this.dimension, this.x, this.y, this.z - n);
  }
  south(n = 1) {
    return new Block(this.dimension, this.x, this.y, this.z + n);
  }
  east(n = 1) {
    return new Block(this.dimension, this.x + n, this.y, this.z);
  }
  west(n = 1) {
    return new Block(this.dimension, this.x - n, this.y, this.z);
  }
  center() {
    return { x: this.x + 0.5, y: this.y + 0.5, z: this.z + 0.5 };
  }
  bottomCenter() {
    return { x: this.x + 0.5, y: this.y, z: this.z + 0.5 };
  }
  setPermutation(perm) {
    this.dimension.setBlockPermutation(this.location, perm);
  }
  setType(id) {
    this.dimension.setBlockType(this.location, id);
  }
  getItemStack(amount = 1) {
    if (this.isAir || this.isLiquid) return undefined;
    return new ItemStack(this.typeId.replace(/^minecraft:lit_/, "minecraft:"), amount);
  }
  getTags() {
    return [];
  }
  hasTag() {
    return false;
  }
}

class Component {
  constructor(owner) {
    this.owner = owner;
  }
}

class Health extends Component {
  constructor(owner, max) {
    super(owner);
    this.max = max;
    this.value = max;
  }
  get currentValue() {
    return this.value;
  }
  get effectiveMax() {
    return this.max;
  }
  setCurrentValue(v) {
    if (!Number.isFinite(v)) throw new Error("bad health " + v);
    this.value = Math.max(0, Math.min(this.max, v));
    return true;
  }
  resetToMaxValue() {
    this.value = this.max;
  }
}

// In the real API `owner` is the shooter, which scripts may set, so the
// projectile entity itself is kept separately.
class Projectile {
  constructor(entity) {
    this.entity = entity;
    this.owner = undefined;
  }
  shoot(vel) {
    if (![vel.x, vel.y, vel.z].every(Number.isFinite)) throw new Error("bad shot");
    this.entity.velocity = { ...vel };
    this.entity.flying = true;
  }
}

class Equippable extends Component {
  constructor(owner) {
    super(owner);
    this.slots = { Mainhand: undefined };
  }
  getEquipment(slot) {
    if (!EquipmentSlot[slot]) throw new Error("bad equipment slot " + slot);
    const it = this.slots[slot];
    return it?.clone ? it.clone() : it;
  }
  setEquipment(slot, item) {
    if (!EquipmentSlot[slot]) throw new Error("bad equipment slot " + slot);
    this.slots[slot] = item?.clone ? item.clone() : item;
    return true;
  }
  getEquipmentSlot(slot) {
    const self = this;
    return {
      getItem: () => self.getEquipment(slot),
      setItem: (it) => self.setEquipment(slot, it),
    };
  }
}

const FAMILIES = {
  "zt:zombie_titan": ["zombie_titan", "titan", "zt_ally", "zombie", "undead", "monster", "mob"],
  "zt:zombie_minion": ["zombie_minion", "zt_ally", "zombie", "undead", "monster", "mob"],
  "zt:zombie_titan_corpse": ["zt_ally", "inanimate"],
  "zt:proto_ball": ["zt_ally", "projectile"],
  "zt:skeleton_titan": ["skeleton_titan", "titan", "zt_ally", "skeleton", "undead", "monster", "mob"],
  "zt:skeleton_minion": ["skeleton_minion", "zt_ally", "skeleton", "undead", "monster", "mob"],
  "zt:skeleton_titan_corpse": ["zt_ally", "inanimate"],
  "zt:titan_arrow": ["zt_ally", "projectile"],
  "zt:growth_serum": ["projectile"],
  "zt:creeper_titan": ["creeper_titan", "titan", "zt_ally", "creeper", "monster", "mob"],
  "zt:creeper_minion": ["creeper_minion", "zt_ally", "creeper", "monster", "mob"],
  "zt:creeper_titan_corpse": ["zt_ally", "inanimate"],
  "minecraft:creeper": ["creeper", "monster", "mob"],
  "minecraft:spider": ["spider", "arthropod", "monster", "mob"],
  "minecraft:cave_spider": ["cave_spider", "spider", "arthropod", "monster", "mob"],
  "minecraft:silverfish": ["silverfish", "arthropod", "monster", "mob"],
  "minecraft:player": ["player"],
  "minecraft:zombie": ["zombie", "monster", "mob"],
  "minecraft:skeleton": ["skeleton", "undead", "monster", "mob"],
  "minecraft:husk": ["zombie", "monster", "mob"],
  "minecraft:cow": ["cow", "mob"],
  "minecraft:villager_v2": ["villager", "mob"],
  "zt:figure": ["figure", "zt_figure", "monster", "mob"],
  "zt:seek": ["seek", "zt_seek", "monster", "mob"],
  "zt:figure_bar": ["zt_doors_bar", "zt_doors_prop", "inanimate"],
  "zt:seek_bar": ["zt_doors_bar", "zt_doors_prop", "inanimate"],
  "zt:figure_lure": ["zt_figure_lure", "zt_doors_prop", "inanimate"],
  "zt:hotel_door": ["zt_hotel_door", "zt_doors_prop", "inanimate"],
  "zt:library_book": ["zt_library_book", "zt_doors_prop", "inanimate"],
  "zt:library_paper": ["zt_library_paper", "zt_doors_prop", "inanimate"],
  "zt:library_lamp": ["zt_library_lamp", "zt_doors_prop", "inanimate"],
  "zt:chandelier": ["zt_chandelier", "zt_doors_prop", "inanimate"],
  "zt:seek_hand": ["zt_seek_hand", "zt_doors_prop", "inanimate"],
  "zt:seek_eye": ["zt_seek_eye", "zt_doors_prop", "inanimate"],
};
const DOORS_PROPS = new Set(["zt:figure_bar", "zt:seek_bar", "zt:figure_lure", "zt:hotel_door", "zt:library_book",
  "zt:library_paper", "zt:library_lamp", "zt:chandelier", "zt:seek_hand", "zt:seek_eye"]);
const HEALTH = {
  "zt:zombie_titan": 20000, "zt:zombie_minion": 30, "zt:zombie_titan_corpse": 1, "minecraft:player": 20, "minecraft:zombie": 20,
  "minecraft:villager_v2": 20, "zt:skeleton_titan": 20000, "zt:skeleton_minion": 30, "zt:skeleton_titan_corpse": 1,
  "minecraft:skeleton": 20, "minecraft:husk": 20, "minecraft:cow": 10,
  "zt:creeper_titan": 25000, "zt:creeper_minion": 30, "zt:creeper_titan_corpse": 1, "minecraft:creeper": 20,
  "minecraft:spider": 16, "minecraft:cave_spider": 12, "minecraft:silverfish": 8,
  "zt:figure": 50000, "zt:seek": 1000, "zt:figure_bar": 100, "zt:seek_bar": 100, "zt:figure_lure": 1, "zt:hotel_door": 1,
  "zt:library_book": 1, "zt:library_paper": 1, "zt:library_lamp": 1, "zt:chandelier": 1, "zt:seek_hand": 1, "zt:seek_eye": 1,
  // the rest of the vanilla mobs the Player tests meet
  "minecraft:pig": 10, "minecraft:sheep": 8, "minecraft:chicken": 4, "minecraft:mooshroom": 10, "minecraft:rabbit": 3,
  "minecraft:stray": 20, "minecraft:drowned": 20, "minecraft:enderman": 40, "minecraft:blaze": 20, "minecraft:ghast": 10,
  "minecraft:zombie_pigman": 20, "minecraft:zombified_piglin": 20, "minecraft:piglin": 16, "minecraft:wither_skeleton": 20,
  "minecraft:magma_cube": 16, "minecraft:slime": 16, "minecraft:witch": 26, "minecraft:warden": 500, "minecraft:iron_golem": 100,
  "minecraft:ender_dragon": 200, "minecraft:ender_crystal": 1, "minecraft:shulker": 30, "minecraft:endermite": 8,
};
const PROPS = {
  "zt:zombie_titan": { "zt:anim": 0, "zt:moving": false, "zt:armed": true, "zt:enraged": false, "zt:birth": false, "zt:grow": 1 },
  "zt:zombie_titan_corpse": { "zt:armed": false },
  "zt:zombie_minion": { "zt:casting": false },
  "zt:skeleton_titan": { "zt:anim": 0, "zt:moving": false, "zt:stunned": false, "zt:enraged": false, "zt:birth": false, "zt:grow": 1 },
  "zt:skeleton_minion": { "zt:casting": false },
  "zt:creeper_titan": { "zt:anim": 0, "zt:moving": false, "zt:stunned": false, "zt:enraged": false, "zt:birth": false, "zt:grow": 1 },
  "zt:creeper_titan_corpse": { "zt:fuse": 0, "zt:enraged": false },
  "zt:creeper_minion": { "zt:casting": false },
  "zt:figure": { "zt:gait": 0, "zt:act": 0 },
  "zt:seek": { "zt:anim": 0 },
  "zt:hotel_door": { "zt:open": false, "zt:locked": false, "zt:guided": false, "zt:plate": 0, "zt:yaw": 0 },
  "zt:library_lamp": { "zt:fallen": false, "zt:yaw": 0 },
  "zt:library_book": { "zt:yaw": 0 },
  "zt:library_paper": { "zt:yaw": 0 },
  "zt:chandelier": { "zt:state": 0 },
  "zt:seek_hand": { "zt:anim": 0, "zt:yaw": 0 },
  "zt:seek_eye": { "zt:pair": false, "zt:size": 1.0, "zt:yaw": 0 },
};
const PROP_RANGES = { "zt:gait": [0, 2], "zt:act": [0, 4], "zt:plate": [0, 13], "zt:state": [0, 2], "zt:size": [0.4, 2.0],
  "zt:yaw": [-180, 180] };
// The pack's own entities, read from its files by run.mjs: these win over the tables above.
const ENTITIES = (() => {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), "entities.json"), "utf8"));
  } catch {
    return {};
  }
})();
for (const [id, def] of Object.entries(ENTITIES)) {
  FAMILIES[id] = def.families;
  if (def.health !== undefined) HEALTH[id] = def.health;
  PROPS[id] = Object.fromEntries(Object.entries(def.props).map(([k, p]) => {
    const fallback = { bool: false, int: p.range?.[0] ?? 0, float: p.range?.[0] ?? 0, enum: p.values?.[0] }[p.type];
    return [k, typeof p.default === typeof fallback ? p.default : fallback];
  }));
}
/** Does a damage sensor filter pass? (the tests this pack uses; anything else is a mock gap) */
function sensorFilter(f, self, other) {
  if (!f) return true;
  if (Array.isArray(f)) return f.every((g) => sensorFilter(g, self, other));
  if (f.all_of) return f.all_of.every((g) => sensorFilter(g, self, other));
  if (f.any_of) return f.any_of.some((g) => sensorFilter(g, self, other));
  const subj = (f.subject ?? "self") === "other" ? other : self;
  let result;
  if (f.test === "is_family") result = !!subj && (FAMILIES[subj.typeId] ?? []).includes(f.value);
  else if (f.test === "bool_property") result = !!subj && subj.props?.[f.domain] === (f.value ?? true);
  else if (f.test === "has_equipment") result = !!subj && f.domain === "hand" && subj.held?.typeId === f.value;
  else throw new Error("mock damage sensor: no filter test " + f.test);
  return (f.operator ?? "==") === "!=" ? !result : result;
}
/**
 * An entity's damage sensor from its behaviour file: the first trigger whose cause and filters
 * match decides. Returns the damage dealt (0 when the trigger says it deals none).
 */
function sensed(self, amount, opts) {
  const cause = String(opts?.cause ?? "none").replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
  for (const t of ENTITIES[self.typeId]?.sensor ?? []) {
    if (t.cause && t.cause !== "all" && t.cause !== cause) continue;
    if (!sensorFilter(t.on_damage?.filters, self, opts?.damagingEntity)) continue;
    if (t.on_damage?.event) {
      self.events.push(t.on_damage.event);
      world.afterEvents.dataDrivenEntityTrigger.fire({ entity: self, eventId: t.on_damage.event, getModifiers: () => [] });
    }
    if (t.deals_damage === "no" || t.deals_damage === false) return 0;
    return amount * (t.damage_multiplier ?? 1);
  }
  return amount;
}

/** A property value the game would refuse, as an error message (or undefined). */
function badProperty(typeId, id, v) {
  const p = ENTITIES[typeId]?.props[id];
  if (!p) return undefined;
  if (p.type === "bool") return typeof v === "boolean" ? undefined : `${id} must be true or false`;
  if (p.type === "enum") return p.values.includes(v) ? undefined : `${id} has no value ${v}`;
  if (typeof v !== "number" || !Number.isFinite(v)) return `${id} must be a number`;
  if (p.type === "int" && !Number.isInteger(v)) return `${id} must be whole: ${v}`;
  if (p.range && (v < p.range[0] || v > p.range[1])) return `${id} out of range ${v}`;
  return undefined;
}

const PROJECTILES = new Set(["zt:proto_ball", "zt:titan_arrow", "zt:growth_serum", "minecraft:fireball", "minecraft:arrow", "minecraft:ender_pearl"]);
/** Arrows (the Player tests): they fly, drop, stick in blocks and hurt what they hit. */
function arrowTick(dim, e) {
  const v = e.velocity;
  const steps = Math.max(1, Math.ceil(Math.hypot(v.x, v.y, v.z) / 0.5));
  const owner = e.components["minecraft:projectile"]?.owner;
  for (let k = 0; k < steps; k++) {
    e.location = { x: e.location.x + v.x / steps, y: e.location.y + v.y / steps, z: e.location.z + v.z / steps };
    const id = blockAt(dim, e.location.x, e.location.y, e.location.z);
    if (collides(id, blockPerm(e.location.x, e.location.y, e.location.z, dim), dim, Math.floor(e.location.x), Math.floor(e.location.y), Math.floor(e.location.z))) {
      e.flying = false;
      world.afterEvents.projectileHitBlock.fire({ projectile: e, dimension: dim, location: { ...e.location }, hitVector: { ...v }, source: owner, getBlockHit: () => ({}) });
      e.valid = false;
      return;
    }
    for (const t of dim.entities) {
      if (!t.valid || t === e || t === owner || !t.components["minecraft:health"] || t.typeId === "minecraft:item") continue;
      const { w, h } = bodyBox(t);
      const l = t.location;
      if (Math.abs(e.location.x - l.x) <= w / 2 + 0.3 && Math.abs(e.location.z - l.z) <= w / 2 + 0.3 && e.location.y >= l.y - 0.3 && e.location.y <= l.y + h + 0.3) {
        e.flying = false;
        const dmg = Math.ceil(Math.hypot(v.x, v.y, v.z) * 2);
        t.applyDamage(dmg, { cause: "projectile", damagingEntity: owner });
        world.afterEvents.projectileHitEntity.fire({ projectile: e, dimension: dim, location: { ...e.location }, hitVector: { ...v }, source: owner, getEntityHit: () => ({ entity: t }) });
        e.valid = false;
        return;
      }
    }
  }
  v.x *= 0.99;
  v.z *= 0.99;
  v.y = v.y * 0.99 - 0.05;
  if (e.location.y < dim.heightRange.min) e.valid = false;
}

export class Entity {
  constructor(dim, typeId, loc) {
    this.id = String(nextId++);
    this.typeId = typeId;
    this.dimension = dim;
    this.location = { ...loc };
    this.rotation = { x: 0, y: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.valid = true;
    this.nameTag = "";
    this.props = { ...(PROPS[typeId] ?? {}) };
    this.dyn = {};
    this.effects = [];
    this.damageTaken = 0;
    this.events = [];
    this.components = {};
    if (HEALTH[typeId]) this.components["minecraft:health"] = new Health(this, HEALTH[typeId]);
    if (PROJECTILES.has(typeId)) this.components["minecraft:projectile"] = new Projectile(this);
    if (ENTITIES[typeId]?.inventory) {
      this.components["minecraft:inventory"] = { container: new Container(ENTITIES[typeId].inventory), inventorySize: ENTITIES[typeId].inventory };
    }
    if (HEALTH[typeId] && typeId !== "minecraft:player") this.components["minecraft:equippable"] = new Equippable(this);
    if (typeId === "minecraft:villager_v2" && !this.components["minecraft:variant"]) this.components["minecraft:variant"] = { value: 0 };
    this.tags = new Set();
    if (["zt:zombie_minion", "zt:skeleton_minion", "zt:creeper_minion", "zt:silverfish_minion"].includes(typeId)) {
      this.components["minecraft:variant"] = { value: 0 };
    }
    this.knockbacks = [];
    this.isInWater = false;
    this.isSwimming = false;
    this.effectInfo = {};
  }
  get isValid() {
    return this.valid;
  }
  get isOnGround() {
    if (this.physOnGround !== undefined) return this.physOnGround;
    const l = this.location;
    if (Math.abs(l.y - Math.round(l.y)) > 0.01) return false;
    return new Block(this.dimension, Math.floor(l.x), Math.round(l.y) - 1, Math.floor(l.z)).isSolid;
  }
  getRotation() {
    return { ...this.rotation };
  }
  lookAt(t) {
    if (![t.x, t.y, t.z].every(Number.isFinite)) throw new Error("bad lookAt");
    const head = this.getHeadLocation();
    const dx = t.x - head.x;
    const dz = t.z - head.z;
    this.rotation = { x: (-Math.atan2(t.y - head.y, Math.hypot(dx, dz)) * 180) / Math.PI, y: (Math.atan2(-dx, dz) * 180) / Math.PI };
  }
  getEffects() {
    return Object.entries(this.effectInfo).map(([typeId, e]) => ({ typeId, duration: e.duration, amplifier: e.amplifier }));
  }
  extinguishFire() {
    this.onFire = 0;
    return true;
  }
  tryTeleport(loc, opts) {
    this.teleport(loc, opts);
    return true;
  }
  addTag(t) {
    this.tags.add(t);
    return true;
  }
  removeTag(t) {
    return this.tags.delete(t);
  }
  hasTag(t) {
    return this.tags.has(t);
  }
  getTags() {
    return [...this.tags];
  }
  setRotation(r) {
    if (!Number.isFinite(r.y) || !Number.isFinite(r.x)) throw new Error("bad rotation");
    this.rotation = { ...r };
  }
  getProperty(id) {
    if (!(id in this.props)) throw new Error(`${this.typeId} has no property ${id}`);
    return this.props[id];
  }
  setProperty(id, v) {
    if (!(id in this.props)) throw new Error(`${this.typeId} has no property ${id}`);
    const bad = badProperty(this.typeId, id, v);
    if (bad) throw new Error(`${this.typeId}: ${bad}`);
    if (typeof v !== typeof this.props[id]) throw new Error(`property ${id} type ${typeof v}`);
    if (id === "zt:anim" && (v < 0 || v > 15 || !Number.isInteger(v))) throw new Error("anim out of range " + v);
    if (["zt:yaw", "zt:plate", "zt:gait", "zt:act", "zt:state"].includes(id) && !Number.isInteger(v)) throw new Error(id + " must be whole: " + v);
    if ((id === "zt:grow" || id === "zt:fuse") && (v < 0 || v > 1)) throw new Error(id + " out of range " + v);
    const range = PROP_RANGES[id];
    if (range && (v < range[0] || v > range[1])) throw new Error(id + " out of range " + v);
    if (this.typeId === "zt:seek" && id === "zt:anim" && v > 3) throw new Error("seek anim out of range " + v);
    if (this.typeId === "zt:seek_hand" && id === "zt:anim" && v > 2) throw new Error("hand anim out of range " + v);
    this.props[id] = v;
  }
  getDynamicProperty(k) {
    return this.dyn[k];
  }
  setDynamicProperty(k, v) {
    this.dyn[k] = v;
  }
  triggerEvent(id) {
    const def = ENTITIES[this.typeId];
    if (def && !def.events.includes(id)) throw new Error(`${this.typeId} has no event ${id}`);
    this.events.push(id);
    world.afterEvents.dataDrivenEntityTrigger.fire({ entity: this, eventId: id, getModifiers: () => [] });
  }
  getComponent(id) {
    return this.components[id];
  }
  applyDamage(amount, opts) {
    if (!Number.isFinite(amount) || amount < 0) throw new Error("bad damage " + amount);
    const hp = this.components["minecraft:health"];
    if (!hp) return false;
    // the pack's own entities: their damage sensors, read from their behaviour files
    if (ENTITIES[this.typeId]) {
      amount = sensed(this, amount, opts);
      if (amount <= 0) return false;
    }
    if (FAMILIES[this.typeId]?.includes("zt_ally") && opts?.damagingEntity && FAMILIES[opts.damagingEntity.typeId]?.includes("zt_ally")) return false;
    if (this.effectInfo?.fire_resistance && /fire|lava/.test(String(opts?.cause))) return false;
    // worn armour takes the edge off blows, arrows and blasts, as in the game
    if (/entityAttack|projectile|Explosion/.test(String(opts?.cause))) {
      const eq = this.components["minecraft:equippable"];
      let armor = 0;
      for (const slot of ["Head", "Chest", "Legs", "Feet"]) {
        const m = /^minecraft:(leather|chainmail|iron|golden|diamond|netherite)_(helmet|chestplate|leggings|boots)$/.exec(eq?.getEquipment(slot)?.typeId ?? "");
        if (m) armor += ({ leather: [1, 3, 2, 1], chainmail: [2, 5, 4, 1], iron: [2, 6, 5, 2], golden: [2, 5, 3, 1], diamond: [3, 8, 6, 3], netherite: [3, 8, 6, 3] })[m[1]][["helmet", "chestplate", "leggings", "boots"].indexOf(m[2])];
      }
      if (armor) amount *= 1 - Math.min(20, Math.max(armor / 5, armor - amount / 2)) / 25;
    }
    this.damageTaken += amount;
    if (opts?.damagingEntity && opts.damagingEntity !== this) this.angryAt = opts.damagingEntity;
    hp.setCurrentValue(hp.currentValue - amount);
    world.afterEvents.entityHurt.fire({ hurtEntity: this, damage: amount, damageSource: { cause: opts?.cause, damagingEntity: opts?.damagingEntity } });
    if (hp.currentValue <= 0 && this.valid && !this.dead) {
      this.dead = true;
      dropLoot(this, opts?.damagingEntity);
      if (this.typeId === "minecraft:ender_dragon") dragonDied(this.dimension);
      if (this.typeId === "minecraft:ender_crystal") this.dimension.createExplosion(this.location, 6, { source: this });
      world.afterEvents.entityDie.fire({ deadEntity: this, damageSource: { cause: opts?.cause, damagingEntity: opts?.damagingEntity } });
      if (this.typeId !== "minecraft:player") this.valid = false;
    }
    return true;
  }
  kill() {
    const hp = this.components["minecraft:health"];
    if (hp && hp.currentValue > 0) {
      hp.setCurrentValue(0);
      if (!this.dead) {
        this.dead = true;
        world.afterEvents.entityDie.fire({ deadEntity: this, damageSource: { cause: "override" } });
      }
    }
    if (this.typeId !== "minecraft:player") this.valid = false;
    return true;
  }
  teleport(loc, opts) {
    if (![loc.x, loc.y, loc.z].every(Number.isFinite)) throw new Error("bad teleport");
    if (!this.valid) throw new Error("teleport of removed entity");
    log.teleports.push({ id: this.id, typeId: this.typeId, tick: tickCounter, age: tickCounter - (this.spawnTick ?? 0),
      jump: Math.hypot(loc.x - this.location.x, loc.y - this.location.y, loc.z - this.location.z) });
    this.location = { x: loc.x, y: loc.y, z: loc.z };
    if (opts?.dimension && opts.dimension !== this.dimension) {
      this.dimension.entities = this.dimension.entities.filter((e) => e !== this);
      this.dimension = opts.dimension;
      opts.dimension.entities.push(this);
    }
    if (opts?.rotation) this.rotation = { ...opts.rotation };
    if (opts?.facingLocation) {
      const d = { x: opts.facingLocation.x - loc.x, z: opts.facingLocation.z - loc.z };
      this.rotation = { x: 0, y: (Math.atan2(-d.x, d.z) * 180) / Math.PI };
    }
  }
  getVelocity() {
    return { ...this.velocity };
  }
  setOnFire(seconds) {
    this.onFire = seconds;
    return true;
  }
  applyKnockback(h, v) {
    if (![h.x, h.z, v].every(Number.isFinite)) throw new Error("bad knockback");
    this.knockbacks.push({ x: h.x, z: h.z, y: v, tick: tickCounter });
    // with bodies simulated (the Player tests), a knock moves them
    if (sim.mobs && (MOB_AI[this.typeId] || BODIES.has(this.typeId))) {
      this.velocity.x += h.x;
      this.velocity.z += h.z;
      this.velocity.y = Math.max(this.velocity.y, v);
      if (this.typeId === "minecraft:creeper") this.fuse = Math.max(0, (this.fuse ?? 0) - 10);
    }
  }
  applyImpulse(v) {
    if (![v.x, v.y, v.z].every(Number.isFinite)) throw new Error("bad impulse");
    if (this.typeId === "minecraft:player") throw new Error("applyImpulse on player");
    this.velocity.x += v.x;
    this.velocity.y += v.y;
    this.velocity.z += v.z;
  }
  clearVelocity() {
    this.velocity = { x: 0, y: 0, z: 0 };
  }
  addEffect(id, dur, o) {
    if (!Number.isFinite(dur) || dur <= 0) throw new Error("bad effect duration " + dur);
    this.effects.push(id);
    this.effectInfo[id] = { duration: dur, amplifier: o?.amplifier ?? 0 };
  }
  removeEffect(id) {
    const had = id in this.effectInfo;
    delete this.effectInfo[id];
    this.effects = this.effects.filter((e) => e !== id);
    return had;
  }
  getEffect(id) {
    return this.effectInfo[id];
  }
  getBlockFromViewDirection(opts) {
    const from = this.getHeadLocation();
    const dir = this.getViewDirection();
    return this.dimension.getBlockFromRay(from, dir, opts);
  }
  remove() {
    this.valid = false;
  }
  matches(opts) {
    if (opts.families) return opts.families.every((f) => FAMILIES[this.typeId]?.includes(f));
    return true;
  }
  getHeadLocation() {
    return { x: this.location.x, y: this.location.y + 1.62, z: this.location.z };
  }
  getViewDirection() {
    const yaw = (this.rotation.y * Math.PI) / 180;
    return { x: -Math.sin(yaw), y: 0, z: Math.cos(yaw) };
  }
  runCommand(cmd) {
    log.commands.push(cmd);
    return { successCount: 1 };
  }
}

export class Player extends Entity {
  constructor(dim, loc) {
    super(dim, "minecraft:player", loc);
    this.name = "Steve";
    this.gameMode = GameMode.Survival;
    this.isSneaking = false;
    this.isSprinting = false;
    this.isJumping = false;
    this.music = null;
    this.permissions = {};
    this.cameraLog = [];
    const self = this;
    this.camera = {
      isValid: true,
      setCamera(preset, opts) {
        if (preset !== "minecraft:free") throw new Error("unknown camera preset " + preset);
        self.cameraLog.push(["set", opts?.facingEntity ? "entity" : "location"]);
        self.cameraOn = true;
      },
      clear() {
        self.cameraLog.push(["clear"]);
        self.cameraOn = false;
      },
      fade(o) {
        self.cameraLog.push(["fade"]);
      },
    };
    this.inputPermissions = {
      setPermissionCategory(cat, on) {
        self.permissions[cat] = on;
      },
      isPermissionCategoryEnabled(cat) {
        return self.permissions[cat] !== false;
      },
    };
    this.cooldowns = {};
    this.xp = 0;
    this.components["minecraft:equippable"] = new Equippable(this);
    this.components["minecraft:inventory"] = { container: new Container(36) };
    this.onScreenDisplay = {
      setActionBar: (t) => log.messages.push("[actionbar] " + t),
      setTitle: (t, o) => log.messages.push("[title] " + t + (o?.subtitle ? " / " + o.subtitle : "")),
    };
  }
  get held() {
    return this.components["minecraft:equippable"].slots.Mainhand;
  }
  getGameMode() {
    return this.gameMode;
  }
  setGameMode(m) {
    if (!Object.values(GameMode).includes(m)) throw new Error("bad game mode " + m);
    this.gameMode = m;
  }
  playMusic(id, o) {
    if (typeof id !== "string") throw new Error("bad music");
    this.music = id;
  }
  stopMusic() {
    this.music = null;
  }
  playSound(id, o) {
    log.sounds.push(id);
  }
  respawn(loc) {
    const hp = this.components["minecraft:health"];
    hp.resetToMaxValue();
    this.dead = false;
    this.damageTaken = 0;
    if (loc) this.location = { ...loc };
    world.afterEvents.playerSpawn.fire({ player: this, initialSpawn: false });
  }
  sendMessage(t) {
    log.messages.push(t);
  }
  startItemCooldown(c, t) {
    this.cooldowns[c] = t;
  }
  getItemCooldown(c) {
    return this.cooldowns[c] ?? 0;
  }
  playAnimation(a, o) {
    if (typeof a !== "string" || !a.startsWith("animation.")) throw new Error("bad animation " + a);
    log.commands.push("anim " + a);
    log.animations.push([this.id, a, tickCounter]);
  }
  addExperience(n) {
    this.xp += n;
    return this.xp;
  }
}

class Container {
  constructor(size) {
    this.size = size;
    this.slots = new Array(size).fill(undefined);
  }
  get isValid() {
    return true;
  }
  get emptySlotsCount() {
    return this.slots.filter((x) => !x).length;
  }
  _check(i) {
    if (!Number.isInteger(i) || i < 0 || i >= this.size) throw new Error("slot out of range " + i);
  }
  // as in the game, getItem hands out a copy: changes count only once set back
  getItem(i) {
    this._check(i);
    const it = this.slots[i];
    return it?.clone ? it.clone() : it;
  }
  setItem(i, item) {
    this._check(i);
    if (item && item.maxAmount !== undefined && item.amount > item.maxAmount) throw new Error(`${item.typeId} x${item.amount} is more than a stack`);
    this.slots[i] = item?.clone ? item.clone() : item;
  }
  /** Stacks onto matching stacks, then fills empty slots; returns what didn't fit. */
  addItem(item) {
    let left = item.amount;
    for (let i = 0; i < this.size && left > 0; i++) {
      const s = this.slots[i];
      if (s && s.isStackableWith?.(item)) {
        const n = Math.min(s.maxAmount - s.amount, left);
        if (n > 0) {
          s.amount += n;
          left -= n;
        }
      }
    }
    for (let i = 0; i < this.size && left > 0; i++) {
      if (this.slots[i]) continue;
      const n = Math.min(item.maxAmount ?? 64, left);
      const c = item.clone ? item.clone() : item;
      c.amount = n;
      this.slots[i] = c;
      left -= n;
    }
    if (left <= 0) return undefined;
    const rest = item.clone ? item.clone() : item;
    rest.amount = left;
    return rest;
  }
  getSlot(i) {
    this._check(i);
    const self = this;
    return {
      isValid: true,
      getItem: () => self.getItem(i),
      setItem: (it) => self.setItem(i, it),
      hasItem: () => !!self.slots[i],
      get typeId() {
        return self.slots[i]?.typeId;
      },
      get amount() {
        return self.slots[i]?.amount ?? 0;
      },
    };
  }
  transferItem(fromSlot, toContainer) {
    this._check(fromSlot);
    const it = this.slots[fromSlot];
    if (!it) return undefined;
    this.slots[fromSlot] = undefined;
    const left = toContainer.addItem(it);
    if (left) this.slots[fromSlot] = left;
    return left;
  }
  moveItem(fromSlot, toSlot, toContainer) {
    this._check(fromSlot);
    const it = this.slots[fromSlot];
    if (!it) return;
    const there = toContainer.slots[toSlot];
    if (there && !there.isStackableWith?.(it)) throw new Error("slot taken");
    if (there) {
      const n = Math.min(there.maxAmount - there.amount, it.amount);
      there.amount += n;
      it.amount -= n;
      if (it.amount <= 0) this.slots[fromSlot] = undefined;
    } else {
      toContainer.slots[toSlot] = it;
      this.slots[fromSlot] = undefined;
    }
  }
  swapItems(slot, otherSlot, otherContainer) {
    const a = this.slots[slot];
    this.slots[slot] = otherContainer.slots[otherSlot];
    otherContainer.slots[otherSlot] = a;
  }
  clearAll() {
    this.slots.fill(undefined);
  }
}

// ---------------------------------------------------------------- bodies (the Player tests)
const FLYERS = new Set(["minecraft:blaze", "minecraft:ender_dragon", "minecraft:ghast", "minecraft:phantom", "minecraft:ender_crystal",
  "minecraft:bat", "minecraft:allay", "minecraft:vex"]);
function bodyBox(e) {
  const c = ENTITIES[e.typeId]?.collision;
  if (c) return { w: c.width, h: c.height };
  if (e.typeId === "minecraft:item" || e.typeId === "minecraft:xp_orb") return { w: 0.25, h: 0.25 };
  if (e.typeId === "minecraft:player") return { w: 0.6, h: 1.8 };
  return { w: 0.6, h: MOB_HEIGHT[e.typeId] ?? 1.8 };
}
const MOB_HEIGHT = { "minecraft:spider": 0.9, "minecraft:cave_spider": 0.5, "minecraft:chicken": 0.8, "minecraft:cow": 1.4,
  "minecraft:pig": 0.9, "minecraft:sheep": 1.3, "minecraft:enderman": 2.9, "minecraft:creeper": 1.7, "minecraft:ender_crystal": 2 };
function cellsTouching(dim, e, test) {
  const { w, h } = bodyBox(e);
  const l = e.location;
  for (let x = Math.floor(l.x - w / 2 + 1e-6); x <= Math.floor(l.x + w / 2 - 1e-6); x++) {
    for (let y = Math.floor(l.y + 1e-6); y <= Math.floor(l.y + h - 1e-6); y++) {
      for (let z = Math.floor(l.z - w / 2 + 1e-6); z <= Math.floor(l.z + w / 2 - 1e-6); z++) {
        const id = blockAt(dim, x, y, z);
        if (test(id, x, y, z)) return true;
      }
    }
  }
  return false;
}
/** Moves a body along one axis, stopping at solid blocks; true if it hit one. */
function moveAxis(dim, e, axis, d) {
  if (!d) return false;
  const { w, h } = bodyBox(e);
  const p = { ...e.location };
  p[axis] += d;
  const x0 = Math.floor(p.x - w / 2 + 1e-7), x1 = Math.floor(p.x + w / 2 - 1e-7);
  const y0 = Math.floor(p.y + 1e-7), y1 = Math.floor(p.y + h - 1e-7);
  const z0 = Math.floor(p.z - w / 2 + 1e-7), z1 = Math.floor(p.z + w / 2 - 1e-7);
  let hit = false;
  let bound = d > 0 ? Infinity : -Infinity;
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        const id = blockAt(dim, x, y, z);
        if (!collides(id, blockPerm(x, y, z, dim), dim, x, y, z)) continue;
        hit = true;
        if (axis === "y") bound = d > 0 ? Math.min(bound, y - h) : Math.max(bound, y + 1);
        else if (axis === "x") bound = d > 0 ? Math.min(bound, x - w / 2) : Math.max(bound, x + 1 + w / 2);
        else bound = d > 0 ? Math.min(bound, z - w / 2) : Math.max(bound, z + 1 + w / 2);
      }
    }
  }
  if (hit) p[axis] = bound;
  e.location[axis] = p[axis];
  return hit;
}
function stepBody(dim, e) {
  const v = e.velocity;
  const inWater = cellsTouching(dim, e, (id) => WATER.has(id));
  const inLava = cellsTouching(dim, e, (id) => LAVA.has(id));
  const onLadder = cellsTouching(dim, e, (id) => /ladder|vine/.test(id));
  e.isInWater = inWater;
  e.isInLava = inLava;
  const flyer = FLYERS.has(e.typeId) || e.noGravity;
  if (onLadder && v.y < -0.15) v.y = -0.15;
  const y0 = e.location.y;
  // as the game does: move, then gravity (a jump of 0.42 rises 1.25 blocks)
  const hitY = moveAxis(dim, e, "y", v.y);
  const landed = hitY && v.y < 0;
  if (hitY) v.y = 0;
  if (!flyer) v.y -= inWater || inLava ? 0.02 : e.typeId === "minecraft:item" ? 0.04 : 0.08;
  const hitX = moveAxis(dim, e, "x", v.x);
  const hitZ = moveAxis(dim, e, "z", v.z);
  if (hitX) v.x = 0;
  if (hitZ) v.z = 0;
  e.blockedSideways = hitX || hitZ;
  // standing on something?
  const under = { ...e.location, y: e.location.y - 0.01 };
  const saved = e.location;
  e.location = under;
  const ground = cellsTouching(dim, e, (id, x, y, z) => y < saved.y && collides(id, blockPerm(x, y, z, dim), dim, x, y, z));
  e.location = saved;
  e.physOnGround = landed || ground;
  if (!e.physOnGround && !inWater && e.location.y < y0) e.fallDist = (e.fallDist ?? 0) + (y0 - e.location.y);
  if (e.physOnGround || inWater || onLadder) {
    if ((e.fallDist ?? 0) > 3 && e.physOnGround && !inWater && !flyer && e.typeId !== "minecraft:item") {
      e.applyDamage(Math.floor(e.fallDist - 3), { cause: "fall" });
    }
    e.fallDist = 0;
  }
  if (inWater || inLava) {
    v.x *= 0.8;
    v.y *= 0.8;
    v.z *= 0.8;
  } else if (flyer) {
    v.x *= 0.91;
    v.y *= 0.91;
    v.z *= 0.91;
  } else {
    v.y *= 0.98;
    const f = e.physOnGround ? 0.546 : 0.91;
    v.x *= f;
    v.z *= f;
  }
  if (inLava && e.typeId !== "minecraft:item") {
    e.onFire = 15;
    if (!e.effectInfo?.fire_resistance && tickCounter % 10 === 0) e.applyDamage(4, { cause: "lava" });
  }
  if (e.typeId !== "minecraft:item" && cellsTouching(dim, e, (id) => /^minecraft:(fire|soul_fire)$/.test(id))) e.onFire = Math.max(e.onFire ?? 0, 8);
  if ((e.onFire ?? 0) > 0) {
    if (inWater) e.onFire = 0;
    else if (tickCounter % 20 === 0) {
      e.onFire--;
      if (!e.effectInfo?.fire_resistance && e.typeId !== "minecraft:item" && !FIRE_PROOF.has(e.typeId)) e.applyDamage(1, { cause: "fireTick" });
    }
  }
  if (e.location.y < dim.heightRange.min - 64 && e.valid) e.applyDamage(1000, { cause: "void" });
}
const FIRE_PROOF = new Set(["minecraft:blaze", "minecraft:ender_dragon", "minecraft:magma_cube", "minecraft:wither_skeleton",
  "minecraft:zombie_pigman", "minecraft:zombified_piglin", "minecraft:ghast", "minecraft:strider"]);

// ---------------------------------------------------------------- mobs (sim.mobs)
const MOB_AI = {
  "minecraft:zombie": { kind: "melee", speed: 0.115, dmg: 3, reach: 1.7 },
  "minecraft:husk": { kind: "melee", speed: 0.115, dmg: 3, reach: 1.7 },
  "minecraft:spider": { kind: "melee", speed: 0.15, dmg: 2, reach: 1.7 },
  "minecraft:cave_spider": { kind: "melee", speed: 0.15, dmg: 2, reach: 1.5 },
  "minecraft:skeleton": { kind: "ranged", speed: 0.12, dmg: 3, range: 15, cooldown: 40 },
  "minecraft:stray": { kind: "ranged", speed: 0.12, dmg: 3, range: 15, cooldown: 40 },
  "minecraft:creeper": { kind: "creeper", speed: 0.1 },
  "minecraft:blaze": { kind: "ranged", speed: 0.08, dmg: 5, range: 16, cooldown: 60, fire: true, hover: 3 },
  "minecraft:enderman": { kind: "neutral", speed: 0.15, dmg: 7, reach: 2.2 },
  "minecraft:zombie_pigman": { kind: "neutral", speed: 0.12, dmg: 5, reach: 1.7 },
  "minecraft:zombified_piglin": { kind: "neutral", speed: 0.12, dmg: 5, reach: 1.7 },
  "minecraft:piglin": { kind: "neutral", speed: 0.1, dmg: 5, reach: 1.7 },
  "minecraft:wither_skeleton": { kind: "melee", speed: 0.12, dmg: 8, reach: 2 },
  "minecraft:cow": { kind: "passive" },
  "minecraft:pig": { kind: "passive" },
  "minecraft:sheep": { kind: "passive" },
  "minecraft:chicken": { kind: "passive" },
  "minecraft:villager_v2": { kind: "passive" },
  "minecraft:ender_dragon": { kind: "dragon" },
};
const MOB_LOOT = {
  "minecraft:cow": [["minecraft:beef", 1, 3], ["minecraft:leather", 0, 2]],
  "minecraft:pig": [["minecraft:porkchop", 1, 3]],
  "minecraft:sheep": [["minecraft:mutton", 1, 2], ["minecraft:white_wool", 1, 1]],
  "minecraft:chicken": [["minecraft:chicken", 1, 1], ["minecraft:feather", 0, 2]],
  "minecraft:zombie": [["minecraft:rotten_flesh", 0, 2]],
  "minecraft:husk": [["minecraft:rotten_flesh", 0, 2]],
  "minecraft:skeleton": [["minecraft:bone", 0, 2], ["minecraft:arrow", 0, 2]],
  "minecraft:spider": [["minecraft:string", 0, 2]],
  "minecraft:creeper": [["minecraft:gunpowder", 0, 2]],
  "minecraft:enderman": [["minecraft:ender_pearl", 0, 1]],
  "minecraft:wither_skeleton": [["minecraft:coal", 0, 1], ["minecraft:bone", 0, 2]],
};
function dropLoot(e, killer) {
  if (!sim.items) return;
  const table = MOB_LOOT[e.typeId] ?? [];
  // blaze rods only drop for a player (killed_by_player_or_pets)
  const rods = e.typeId === "minecraft:blaze" && killer?.typeId === "minecraft:player" ? [["minecraft:blaze_rod", 0, 1]] : [];
  for (const [id, lo, hi] of [...table, ...rods]) {
    const n = lo + Math.floor(Math.random() * (hi - lo + 1));
    if (n > 0) e.dimension.spawnItem(new ItemStack(id, n), { ...e.location, y: e.location.y + 0.5 });
  }
}
function playerTargets(dim, e, range) {
  let best;
  let bestD = range;
  for (const t of dim.entities) {
    if (!t.valid || t === e || !(FAMILIES[t.typeId] ?? []).includes("player")) continue;
    if (t.typeId === "minecraft:player" && (t.gameMode === "Creative" || t.gameMode === "Spectator" || t.dead)) continue;
    const d = Math.hypot(t.location.x - e.location.x, t.location.y - e.location.y, t.location.z - e.location.z);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}
function mobTick(dim, e) {
  const ai = MOB_AI[e.typeId];
  if (!ai || e.dead) return;
  e.cool = Math.max(0, (e.cool ?? 0) - 1);
  if (ai.kind === "dragon") return dragonTick(dim, e);
  if (ai.kind === "passive") {
    if (tickCounter % 60 === 0) e.wander = { x: (Math.random() - 0.5) * 0.08, z: (Math.random() - 0.5) * 0.08 };
    if (e.wander) {
      e.velocity.x = e.wander.x;
      e.velocity.z = e.wander.z;
    }
    return;
  }
  // a shooter doesn't fire the moment it appears
  if (e.cool === 0 && e.firstShot === undefined && ai.cooldown) {
    e.firstShot = true;
    e.cool = 10 + Math.floor(Math.random() * ai.cooldown);
  }
  let target;
  if (ai.kind === "neutral") {
    target = e.angryAt && e.angryAt.valid ? e.angryAt : undefined;
  } else target = playerTargets(dim, e, 16);
  if (!target) return;
  const dx = target.location.x - e.location.x;
  const dz = target.location.z - e.location.z;
  const dy = target.location.y - e.location.y;
  const d = Math.hypot(dx, dy, dz);
  const flat = Math.hypot(dx, dz) || 1;
  e.rotation = { x: 0, y: (Math.atan2(-dx, dz) * 180) / Math.PI };
  const keepAway = ai.kind === "ranged" && d < 8;
  const sp = keepAway ? -ai.speed : d > (ai.reach ?? 1.2) * 0.8 ? ai.speed : 0;
  e.velocity.x = (dx / flat) * sp;
  e.velocity.z = (dz / flat) * sp;
  if (ai.hover !== undefined) e.velocity.y = Math.max(-0.08, Math.min(0.08, (target.location.y + ai.hover - e.location.y) * 0.05));
  else if (e.blockedSideways && e.physOnGround) e.velocity.y = 0.42;
  if (ai.kind === "creeper") {
    if (d < 3) e.fuse = (e.fuse ?? 0) + 1;
    else if (d > 7) e.fuse = 0;
    if ((e.fuse ?? 0) >= 30) {
      dim.createExplosion(e.location, 3, { breaksBlocks: false, source: e });
      for (const v of [...dim.entities]) {
        if (!v.valid || v === e || !v.components["minecraft:health"]) continue;
        const r = Math.hypot(v.location.x - e.location.x, v.location.y - e.location.y, v.location.z - e.location.z);
        if (r < 6) v.applyDamage(Math.max(1, Math.round((1 - r / 6) * 22)), { cause: "entityExplosion", damagingEntity: e });
      }
      e.valid = false;
    }
    return;
  }
  if (e.cool > 0) return;
  if (ai.kind === "ranged" && d <= ai.range) {
    e.cool = ai.cooldown;
    // (a shot a shield stops sets nothing alight)
    const hurt = target.applyDamage(ai.dmg, { cause: "projectile", damagingEntity: e });
    if (ai.fire && hurt) target.onFire = Math.max(target.onFire ?? 0, 5);
  } else if (d <= (ai.reach ?? 1.7)) {
    e.cool = 20;
    target.applyDamage(ai.dmg, { cause: "entityAttack", damagingEntity: e });
  }
}
/** The dragon circles the island, now and then perches on the fountain, and the crystals heal it. */
function dragonTick(dim, e) {
  e.noGravity = true;
  e.phaseT = (e.phaseT ?? 0) + 1;
  if (!e.phase) e.phase = "circle";
  if (e.phase === "circle") {
    e.angle = (e.angle ?? 0) + 0.03;
    const want = { x: Math.cos(e.angle) * 30, y: 80, z: Math.sin(e.angle) * 30 };
    e.velocity = { x: (want.x - e.location.x) * 0.2, y: (want.y - e.location.y) * 0.2, z: (want.z - e.location.z) * 0.2 };
    if (e.phaseT > 500) {
      e.phase = "perch";
      e.phaseT = 0;
    }
  } else {
    const want = { x: 0, y: 64, z: 0 };
    e.velocity = { x: (want.x - e.location.x) * 0.1, y: (want.y - e.location.y) * 0.1, z: (want.z - e.location.z) * 0.1 };
    if (e.phaseT % 40 === 20) {
      for (const t of dim.entities) {
        if (!t.valid || !(FAMILIES[t.typeId] ?? []).includes("player")) continue;
        if (Math.hypot(t.location.x, t.location.z) < 7 && Math.abs(t.location.y - 64) < 6) t.applyDamage(6, { cause: "entityAttack", damagingEntity: e });
      }
    }
    if (e.phaseT > 260) {
      e.phase = "circle";
      e.phaseT = 0;
    }
  }
  if (tickCounter % 10 === 0) {
    const crystals = dim.entities.filter((c) => c.valid && c.typeId === "minecraft:ender_crystal");
    if (crystals.length) {
      const hp = e.components["minecraft:health"];
      hp.setCurrentValue(hp.currentValue + 1);
    }
  }
}
/** The dragon is dead: the exit portal lights up. */
function dragonDied(dim) {
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) placed.set(keyOf(dim, x, 63, z), new BlockPermutation("minecraft:end_portal", {}));
  placed.set(keyOf(dim, 0, 64, 0), new BlockPermutation("minecraft:bedrock", {}));
  placed.set(keyOf(dim, 96, 75, 0), new BlockPermutation("minecraft:end_gateway", {}));
}

// ---------------------------------------------------------------- portals (sim.portals)
function buildNetherPortal(dim, base) {
  const { x, y, z } = base;
  for (let dx = -1; dx <= 2; dx++) {
    for (let dy = -1; dy <= 3; dy++) {
      const frame = dx === -1 || dx === 2 || dy === -1 || dy === 3;
      placed.set(keyOf(dim, x + dx, y + dy, z), new BlockPermutation(frame ? "minecraft:obsidian" : "minecraft:portal", frame ? {} : { portal_axis: "x" }));
    }
  }
  for (let dx = -1; dx <= 2; dx++) for (let dz = -1; dz <= 1; dz++) {
    if (dz !== 0) placed.set(keyOf(dim, x + dx, y - 1, z + dz), new BlockPermutation("minecraft:obsidian", {}));
  }
}
function portalTick(dim, e) {
  if (e.typeId !== "zt:player" && e.typeId !== "minecraft:player") return;
  e.portalCool = Math.max(0, (e.portalCool ?? 0) - 1);
  const feet = blockAt(dim, e.location.x, e.location.y + 0.2, e.location.z);
  if (feet === "minecraft:portal") e.portalTicks = (e.portalTicks ?? 0) + 1;
  else e.portalTicks = 0;
  if (e.portalCool > 0) return;
  let to;
  let at;
  if (feet === "minecraft:portal" && e.portalTicks >= 80) {
    const toNether = dim.id === "minecraft:overworld";
    to = dims.get(toNether ? "nether" : "overworld");
    const k = toNether ? 1 / 8 : 8;
    const base = { x: Math.floor(e.location.x * k), y: toNether ? 40 : 70, z: Math.floor(e.location.z * k) };
    buildNetherPortal(to, base);
    at = { x: base.x + 0.5, y: base.y, z: base.z + 0.5 };
  } else if (feet === "minecraft:end_portal") {
    if (dim.id === "minecraft:the_end") {
      to = dims.get("overworld");
      at = { x: 0.5, y: 64, z: 0.5 };
    } else {
      to = dims.get("the_end");
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        placed.set(keyOf(to, 100 + dx, 48, dz), new BlockPermutation("minecraft:obsidian", {}));
        for (let dy = 49; dy <= 51; dy++) placed.set(keyOf(to, 100 + dx, dy, dz), new BlockPermutation("minecraft:air", {}));
      }
      at = { x: 100.5, y: 49, z: 0.5 };
    }
  } else if (feet === "minecraft:end_gateway" && dim.id === "minecraft:the_end") {
    to = dim;
    at = { x: 1000.5, y: 70, z: 0.5 };
  }
  if (!to) return;
  e.portalTicks = 0;
  e.portalCool = 200;
  e.velocity = { x: 0, y: 0, z: 0 };
  e.teleport(at, { dimension: to });
}

// ---------------------------------------------------------------- machines (sim.machines)
const SMELTS = {
  "minecraft:raw_iron": "minecraft:iron_ingot", "minecraft:raw_gold": "minecraft:gold_ingot", "minecraft:raw_copper": "minecraft:copper_ingot",
  "minecraft:iron_ore": "minecraft:iron_ingot", "minecraft:gold_ore": "minecraft:gold_ingot", "minecraft:sand": "minecraft:glass",
  "minecraft:cobblestone": "minecraft:stone", "minecraft:beef": "minecraft:cooked_beef", "minecraft:porkchop": "minecraft:cooked_porkchop",
  "minecraft:chicken": "minecraft:cooked_chicken", "minecraft:mutton": "minecraft:cooked_mutton", "minecraft:potato": "minecraft:baked_potato",
  "minecraft:cod": "minecraft:cooked_cod", "minecraft:salmon": "minecraft:cooked_salmon", "minecraft:oak_log": "minecraft:charcoal",
  "minecraft:birch_log": "minecraft:charcoal", "minecraft:spruce_log": "minecraft:charcoal", "minecraft:ancient_debris": "minecraft:netherite_scrap",
  "minecraft:kelp": "minecraft:dried_kelp", "minecraft:clay_ball": "minecraft:brick",
};
const FUEL = { "minecraft:coal": 1600, "minecraft:charcoal": 1600, "minecraft:coal_block": 16000, "minecraft:lava_bucket": 20000,
  "minecraft:blaze_rod": 2400, "minecraft:stick": 100, "minecraft:oak_planks": 300, "minecraft:birch_planks": 300,
  "minecraft:spruce_planks": 300, "minecraft:oak_log": 300, "minecraft:birch_log": 300, "minecraft:spruce_log": 300,
  "minecraft:dried_kelp_block": 4000 };
function machinesTick() {
  for (const c of blockContainers.values()) {
    const id = c.blockId.replace("minecraft:lit_", "minecraft:");
    if (/furnace|smoker/.test(id)) furnaceTick(c, id);
    else if (id === "minecraft:brewing_stand") brewTick(c);
  }
}
function furnaceTick(c, id) {
  const fast = id !== "minecraft:furnace";
  const input = c.slots[0];
  const out = SMELTS[input?.typeId];
  const okKind = !fast || (id === "minecraft:smoker" ? /beef|pork|chicken|mutton|potato|cod|salmon|kelp/.test(input?.typeId ?? "") :
    /raw_|_ore|debris/.test(input?.typeId ?? ""));
  const room = !c.slots[2] || (c.slots[2].typeId === out && c.slots[2].amount < 64);
  if ((c.burn ?? 0) <= 0) {
    if (out && okKind && room && c.slots[1] && FUEL[c.slots[1].typeId]) {
      const f = c.slots[1];
      c.burn = FUEL[f.typeId] / (fast ? 2 : 1);
      if (f.typeId === "minecraft:lava_bucket") c.slots[1] = new ItemStack("minecraft:bucket", 1);
      else if (--f.amount <= 0) c.slots[1] = undefined;
    } else {
      c.cook = 0;
      return;
    }
  }
  c.burn--;
  if (!out || !okKind || !room) {
    c.cook = 0;
    return;
  }
  c.cook = (c.cook ?? 0) + 1;
  if (c.cook >= (fast ? 100 : 200)) {
    c.cook = 0;
    if (--input.amount <= 0) c.slots[0] = undefined;
    if (c.slots[2]) c.slots[2].amount++;
    else c.slots[2] = new ItemStack(out, 1);
  }
}
const BREWS = { "minecraft:nether_wart": "awkward", "minecraft:magma_cream": "fire_resistance", "minecraft:glistering_melon_slice": "healing",
  "minecraft:sugar": "swiftness", "minecraft:blaze_powder": "strength", "minecraft:ghast_tear": "regeneration", "minecraft:golden_carrot": "night_vision" };
function brewTick(c) {
  const ing = c.slots[0];
  const bottles = [1, 2, 3].filter((i) => c.slots[i] && /potion/.test(c.slots[i].typeId));
  if (!ing || !BREWS[ing.typeId] || !bottles.length) {
    c.brew = 0;
    return;
  }
  if ((c.fuel ?? 0) <= 0) {
    if (c.slots[4]?.typeId !== "minecraft:blaze_powder") return;
    c.fuel = 20;
    if (--c.slots[4].amount <= 0) c.slots[4] = undefined;
  }
  c.brew = (c.brew ?? 0) + 1;
  if (c.brew < 400) return;
  c.brew = 0;
  c.fuel--;
  for (const i of bottles) c.slots[i].brewed = BREWS[ing.typeId];
  if (--ing.amount <= 0) c.slots[0] = undefined;
}

const BODIES = new Set(["zt:player"]);
class Dimension {
  constructor(id) {
    this.id = id;
    this.entities = [];
    this.heightRange = id === "minecraft:nether" ? { min: 0, max: 128 } : id === "minecraft:the_end" ? { min: 0, max: 256 } : { min: -64, max: 320 };
  }
  _physics() {
    for (const e of [...this.entities]) {
      if (!e.valid || e.dimension !== this) continue;
      if (sim.mobs && MOB_AI[e.typeId]) mobTick(this, e);
      if (sim.portals) portalTick(this, e);
      if (e.dimension !== this) continue;
      if (BODIES.has(e.typeId) || (sim.items && e.typeId === "minecraft:item") || (sim.mobs && MOB_AI[e.typeId])) {
        if (e.valid) stepBody(this, e);
        continue;
      }
      const arrow = e.flying && sim.mobs && (e.typeId === "minecraft:arrow" || e.typeId === "minecraft:ender_pearl");
      if (!arrow) {
        e.location.x += e.velocity.x;
        e.location.y += e.velocity.y;
        e.location.z += e.velocity.z;
      }
      if (arrow) {
        arrowTick(this, e);
      } else if (e.flying) {
        e.velocity.y -= 0.05;
        if (e.location.y <= stoneTop) {
          e.location.y = stoneTop;
          e.flying = false;
          world.afterEvents.projectileHitBlock.fire({ projectile: e, dimension: this, location: { ...e.location }, hitVector: e.velocity, source: undefined, getBlockHit: () => ({}) });
          e.valid = false;
        }
      } else if (e.typeId !== "zt:zombie_titan" && e.typeId !== "zt:zombie_titan_corpse") {
        e.velocity = { x: 0, y: 0, z: 0 };
      } else {
        e.velocity = { x: e.velocity.x * 0.91, y: e.velocity.y * 0.98, z: e.velocity.z * 0.91 };
      }
    }
    this.entities = this.entities.filter((e) => (e.valid || e.typeId === "minecraft:player") && e.dimension === this);
  }
  _query(opts = {}) {
    let list = this.entities.filter((e) => e.valid);
    if (opts.type) list = list.filter((e) => e.typeId === opts.type);
    if (opts.excludeFamilies) list = list.filter((e) => !opts.excludeFamilies.some((f) => FAMILIES[e.typeId]?.includes(f)));
    if (opts.families) list = list.filter((e) => opts.families.every((f) => FAMILIES[e.typeId]?.includes(f)));
    if (opts.location && opts.maxDistance !== undefined) {
      const l = opts.location;
      list = list.filter((e) => Math.hypot(e.location.x - l.x, e.location.y - l.y, e.location.z - l.z) <= opts.maxDistance);
    }
    if (opts.closest && opts.location) {
      const l = opts.location;
      list.sort((a, b) => Math.hypot(a.location.x - l.x, a.location.z - l.z) - Math.hypot(b.location.x - l.x, b.location.z - l.z));
      list = list.slice(0, opts.closest);
    }
    return list;
  }
  getEntities(opts) {
    return this._query(opts);
  }
  getPlayers(opts = {}) {
    return this._query({ ...opts, type: "minecraft:player" });
  }
  spawnEntity(id, loc, opts) {
    if (![loc.x, loc.y, loc.z].every(Number.isFinite)) throw new Error("bad spawn location");
    if (id.startsWith("zt:") && Object.keys(ENTITIES).length && !ENTITIES[id]) throw new Error("no entity " + id);
    if (opts?.spawnEvent && ENTITIES[id] && !ENTITIES[id].events.includes(opts.spawnEvent)) throw new Error(`${id} has no event ${opts.spawnEvent}`);
    const e = id === "minecraft:player" ? new Player(this, loc) : new Entity(this, id, loc);
    e.spawnEvent = opts?.spawnEvent;
    e.spawnTick = tickCounter;
    if (e.components["minecraft:variant"] && opts?.spawnEvent) {
      e.components["minecraft:variant"].value = { "zt:as_loyalist": 0, "zt:as_priest": 1, "zt:as_zealot": 2, "zt:as_templar": 3 }[opts.spawnEvent];
    }
    this.entities.push(e);
    timeouts.push({ fn: () => world.afterEvents.entitySpawn.fire({ entity: e, cause: "Spawned" }), at: tickCounter });
    return e;
  }
  spawnItem(item, loc) {
    if (![loc.x, loc.y, loc.z].every(Number.isFinite)) throw new Error("bad item location");
    log.items.push([item.typeId, item.amount]);
    const e = new Entity(this, "minecraft:item", loc);
    e.components["minecraft:item"] = { itemStack: item.clone ? item.clone() : item };
    if (sim.items) {
      e.spawnTick = tickCounter;
      this.entities.push(e);
    }
    return e;
  }
  spawnParticle(id, loc, vars) {
    if (![loc.x, loc.y, loc.z].every(Number.isFinite)) throw new Error("bad particle location " + id);
    log.particles.push(id);
  }
  playSound(id, loc, o) {
    if (![loc.x, loc.y, loc.z].every(Number.isFinite)) throw new Error("bad sound location " + id);
    log.sounds.push(id);
  }
  getBlock(l) {
    if (l.y < this.heightRange.min || l.y >= this.heightRange.max) throw new Error("LocationOutOfWorldBoundaries");
    if (chunkUnloaded(l.x, l.z)) throw new LocationInUnloadedChunkError("location is in an unloaded chunk");
    return new Block(this, Math.floor(l.x), Math.floor(l.y), Math.floor(l.z));
  }
  getTopmostBlock(xz, minHeight) {
    if (!sim.terrain) return new Block(this, Math.floor(xz.x), stoneTop - 1, Math.floor(xz.z));
    for (let y = this.heightRange.max - 1; y >= (minHeight ?? this.heightRange.min); y--) {
      const b = new Block(this, Math.floor(xz.x), y, Math.floor(xz.z));
      if (!b.isAir) return b;
    }
    return undefined;
  }
  getBlockBelow(l, opts) {
    const max = opts?.maxDistance ?? 64;
    for (let d = 1; d <= max; d++) {
      const b = this.getBlock({ x: l.x, y: Math.floor(l.y) - d, z: l.z });
      if (!b) return undefined;
      if (b.isAir || (b.isLiquid && !opts?.includeLiquidBlocks) || (!opts?.includePassableBlocks && !b.isLiquid && PASSABLE.test(b.typeId))) continue;
      return b;
    }
    return undefined;
  }
  getBlockAbove(l, opts) {
    const max = opts?.maxDistance ?? 64;
    for (let d = 1; d <= max; d++) {
      const y = Math.floor(l.y) + d;
      if (y >= this.heightRange.max) return undefined;
      const b = this.getBlock({ x: l.x, y, z: l.z });
      if (b.isAir || (b.isLiquid && !opts?.includeLiquidBlocks) || (!opts?.includePassableBlocks && !b.isLiquid && PASSABLE.test(b.typeId))) continue;
      return b;
    }
    return undefined;
  }
  /** Every block in a volume that passes the filter (the game's ListBlockVolume, as an iterator). */
  getBlocks(volume, filter, allowUnloaded) {
    const a = volume.from;
    const b = volume.to;
    if (!allowUnloaded && areaUnloaded(a, b)) throw new UnloadedChunksError("the area has unloaded chunks");
    const n = (Math.abs(b.x - a.x) + 1) * (Math.abs(b.y - a.y) + 1) * (Math.abs(b.z - a.z) + 1);
    if (n > 1000000) throw new Error("getBlocks volume too big: " + n);
    const inc = filter?.includeTypes ? new Set(filter.includeTypes.map((t) => (t.includes(":") ? t : "minecraft:" + t))) : undefined;
    const exc = filter?.excludeTypes ? new Set(filter.excludeTypes.map((t) => (t.includes(":") ? t : "minecraft:" + t))) : undefined;
    const found = [];
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) {
      for (let y = Math.max(this.heightRange.min, Math.min(a.y, b.y)); y <= Math.min(this.heightRange.max - 1, Math.max(a.y, b.y)); y++) {
        for (let z = Math.min(a.z, b.z); z <= Math.max(a.z, b.z); z++) {
          if (allowUnloaded && chunkUnloaded(x, z)) continue;
          const id = blockAt(this, x, y, z);
          if (inc && !inc.has(id)) continue;
          if (exc && exc.has(id)) continue;
          found.push({ x, y, z });
        }
      }
    }
    return {
      getBlockLocationIterator: () => found[Symbol.iterator](),
      getCapacity: () => found.length,
      isInside: (l) => found.some((f) => f.x === Math.floor(l.x) && f.y === Math.floor(l.y) && f.z === Math.floor(l.z)),
    };
  }
  getEntitiesAtBlockLocation(l) {
    return this.entities.filter((e) => e.valid && Math.floor(e.location.x) === Math.floor(l.x) &&
      Math.floor(e.location.y) === Math.floor(l.y) && Math.floor(e.location.z) === Math.floor(l.z));
  }
  getBlockFromRay(origin, dir, opts) {
    const l = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const u = { x: dir.x / l, y: dir.y / l, z: dir.z / l };
    for (let d = 0; d < (opts?.maxDistance ?? 64); d += 0.1) {
      const p = { x: origin.x + u.x * d, y: origin.y + u.y * d, z: origin.z + u.z * d };
      if (p.y < this.heightRange.min || p.y >= this.heightRange.max) return undefined;
      const b = this.getBlock(p);
      if (b.isAir) continue;
      if (b.isLiquid && !opts?.includeLiquidBlocks) continue;
      if (!b.isLiquid && !opts?.includePassableBlocks && PASSABLE.test(b.typeId)) continue;
      if (opts?.includeTypes && !opts.includeTypes.includes(b.typeId)) continue;
      if (opts?.excludeTypes && opts.excludeTypes.includes(b.typeId)) continue;
      return { block: b, face: "Up", faceLocation: { x: p.x - b.location.x, y: p.y - b.location.y, z: p.z - b.location.z } };
    }
    return undefined;
  }
  fillBlocks(vol, block, opts) {
    log.commands.push("fill");
    const a = vol.from;
    const b = vol.to;
    const n = (Math.abs(b.x - a.x) + 1) * (Math.abs(b.y - a.y) + 1) * (Math.abs(b.z - a.z) + 1);
    if (n > 32768) throw new Error("fill too large: " + n);
    if (typeof block === "string") BlockPermutation.resolve(block);
    else if (!(block instanceof BlockPermutation)) throw new Error("not a block");
    if (areaUnloaded(a, b)) throw new UnloadedChunksError("the area has unloaded chunks");
    if (block instanceof BlockPermutation) {
      for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) {
        for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) {
          for (let z = Math.min(a.z, b.z); z <= Math.max(a.z, b.z); z++) placeBlock(this, { x, y, z }, block);
        }
      }
    }
    return {};
  }
  setBlockPermutation(loc, perm) {
    if (!(perm instanceof BlockPermutation)) throw new Error("not a permutation");
    if (![loc.x, loc.y, loc.z].every(Number.isInteger)) throw new Error("block location not whole: " + JSON.stringify(loc));
    if (chunkUnloaded(loc.x, loc.z)) throw new LocationInUnloadedChunkError("location is in an unloaded chunk");
    placeBlock(this, loc, perm);
  }
  setBlockType(loc, id) {
    const perm = BlockPermutation.resolve(id);
    if (chunkUnloaded(loc.x, loc.z)) throw new LocationInUnloadedChunkError("location is in an unloaded chunk");
    placeBlock(this, loc, perm);
  }
  createExplosion(loc, r, o) {
    if (![loc.x, loc.y, loc.z, r].every(Number.isFinite)) throw new Error("bad explosion");
    log.commands.push("explosion");
    log.explosions.push({ ...loc, radius: r, breaksBlocks: !!o?.breaksBlocks, tick: tickCounter });
    return true;
  }
  runCommand(c) {
    log.commands.push(c);
    return { successCount: 1 };
  }
}

const dims = new Map([
  ["overworld", new Dimension("minecraft:overworld")],
  ["nether", new Dimension("minecraft:nether")],
  ["the_end", new Dimension("minecraft:the_end")],
]);

const worldDyn = {};
export const world = {
  timeOfDay: 14000,
  difficulty: Difficulty.Normal,
  gameRules: { mobGriefing: true, doMobLoot: true, pvp: true },
  afterEvents: {
    entitySpawn: listeners(),
    entityDie: listeners(),
    entityHurt: listeners(),
    entityHitEntity: listeners(),
    projectileHitBlock: listeners(),
    projectileHitEntity: listeners(),
    itemUse: listeners(),
    itemStartUse: listeners(),
    itemCompleteUse: listeners(),
    playerBreakBlock: listeners(),
    playerSpawn: listeners(),
    playerLeave: listeners(),
    playerInteractWithEntity: listeners(),
    playerInteractWithBlock: listeners(),
    playerPlaceBlock: listeners(),
    dataDrivenEntityTrigger: listeners(),
    explosion: listeners(),
  },
  getDefaultSpawnLocation() {
    // as in the game, the height isn't known until the spawn chunk loads
    return { x: 0, y: 32767, z: 0 };
  },
  getDimension(id) {
    const d = dims.get(id.replace("minecraft:", ""));
    if (!d) throw new Error("no dimension " + id);
    return d;
  },
  getAllPlayers() {
    return [...dims.values()].flatMap((d) => d.entities.filter((e) => e.typeId === "minecraft:player"));
  },
  getEntity(id) {
    for (const d of dims.values()) for (const e of d.entities) if (e.id === id && e.valid) return e;
    return undefined;
  },
  getTimeOfDay() {
    return this.timeOfDay;
  },
  getAbsoluteTime() {
    return tickCounter + 100000;
  },
  getDifficulty() {
    return this.difficulty;
  },
  getDynamicProperty(k) {
    return worldDyn[k];
  },
  setDynamicProperty(k, v) {
    worldDyn[k] = v;
  },
  sendMessage(t) {
    log.messages.push(t);
  },
};
