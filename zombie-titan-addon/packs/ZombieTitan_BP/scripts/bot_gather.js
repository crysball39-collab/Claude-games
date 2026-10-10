// How a Player gets what it needs, as a player would: `obtain` works out the way to any item
// (its chests at home, a recipe, and first whatever the recipe needs, a furnace, mining, hunting,
// shearing, filling a bucket) and does it, step by step. Ores are mined where it can see them
// (on a cave wall or in its tunnel), and when it sees none it strip-mines at the height the
// ore is commonest, down a staircase it digs.
import { ItemStack, system } from "@minecraft/server";
import * as B from "./bot_body.js";
import * as C from "./bot_combat.js";
import * as D from "./bot_data.js";
import * as Inv from "./bot_inv.js";
import * as S from "./bot_skills.js";
import * as Sense from "./bot_senses.js";
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {import("@minecraft/server").Entity} Entity */

const m = D.mc;
const list = (...names) => names.map(m);

/**
 * Where items come from in the world. blocks: what to mine; y: the height to strip-mine at when
 * none are in sight (undefined: look about on the surface); dim: only there.
 * depth: dig down this far for it when none is in sight.
 * @type {Record<string, {blocks: string[], y?: number, dim?: string, r?: number, depth?: number}>}
 */
export const SOURCES = {
  log: { blocks: D.GROUPS.log.filter((x) => !/crimson|warped/.test(x)), r: 24 },
  // stone is a few blocks under the grass: a staircase down finds it
  [m("cobblestone")]: { blocks: list("stone", "cobblestone", "mossy_cobblestone"), depth: 5 },
  [m("cobbled_deepslate")]: { blocks: list("deepslate"), y: -8 },
  [m("coal")]: { blocks: list("coal_ore", "deepslate_coal_ore"), y: 40 },
  [m("raw_iron")]: { blocks: list("iron_ore", "deepslate_iron_ore"), y: 16 },
  [m("raw_copper")]: { blocks: list("copper_ore", "deepslate_copper_ore"), y: 40 },
  [m("raw_gold")]: { blocks: list("gold_ore", "deepslate_gold_ore"), y: -16 },
  [m("diamond")]: { blocks: list("diamond_ore", "deepslate_diamond_ore"), y: -54 },
  [m("redstone")]: { blocks: list("redstone_ore", "lit_redstone_ore", "deepslate_redstone_ore", "lit_deepslate_redstone_ore"), y: -54 },
  [m("lapis_lazuli")]: { blocks: list("lapis_ore", "deepslate_lapis_ore"), y: 0 },
  [m("flint")]: { blocks: list("gravel") },
  [m("gravel")]: { blocks: list("gravel") },
  [m("sand")]: { blocks: list("sand") },
  [m("dirt")]: { blocks: list("dirt", "grass_block", "coarse_dirt") },
  [m("obsidian")]: { blocks: list("obsidian"), y: -54 },
  [m("sugar_cane")]: { blocks: list("reeds"), r: 32 },
  [m("clay_ball")]: { blocks: list("clay") },
  [m("netherrack")]: { blocks: list("netherrack"), dim: "minecraft:nether" },
  [m("quartz")]: { blocks: list("quartz_ore"), dim: "minecraft:nether" },
  [m("gold_nugget")]: { blocks: list("nether_gold_ore"), dim: "minecraft:nether" },
  [m("glowstone_dust")]: { blocks: list("glowstone"), dim: "minecraft:nether" },
  [m("nether_wart")]: { blocks: list("nether_wart"), dim: "minecraft:nether" },
  [m("ancient_debris")]: { blocks: list("ancient_debris"), y: 15, dim: "minecraft:nether" },
  [m("string")]: { blocks: list("web") },
  [m("end_stone")]: { blocks: list("end_stone"), dim: "minecraft:the_end" },
  [m("wheat_seeds")]: { blocks: list("short_grass", "tall_grass") },
};
/** Mobs that drop an item. */
export const HUNT = {
  [m("beef")]: list("cow", "mooshroom"), [m("leather")]: list("cow", "mooshroom"), [m("porkchop")]: list("pig"),
  [m("mutton")]: list("sheep"), [m("white_wool")]: list("sheep"), [m("chicken")]: list("chicken"), [m("feather")]: list("chicken"),
  [m("rabbit")]: list("rabbit"), [m("string")]: list("spider", "cave_spider"), [m("bone")]: list("skeleton", "stray"),
  [m("arrow")]: list("skeleton", "stray"), [m("gunpowder")]: list("creeper"), [m("ender_pearl")]: list("enderman"),
  [m("blaze_rod")]: list("blaze"), [m("slime_ball")]: list("slime"), [m("magma_cream")]: list("magma_cube"),
  [m("ghast_tear")]: list("ghast"), [m("rotten_flesh")]: list("zombie", "husk", "drowned"),
};
/** What smelting makes, the other way round: output -> inputs. */
const SMELT_FROM = {};
for (const [inp, out] of Object.entries(D.SMELT)) (SMELT_FROM[m(out)] ??= []).push(m(inp));
// raw before ores, never logs for charcoal while it has coal
for (const k of Object.keys(SMELT_FROM)) SMELT_FROM[k].sort((a, b) => Number(/_ore$/.test(a)) - Number(/_ore$/.test(b)));
/** Things a Player never crafts (its recipes are worse than finding them). */
const NO_CRAFT = new Set(list("iron_ingot", "gold_ingot"));
export const PICKS = { 1: m("wooden_pickaxe"), 2: m("stone_pickaxe"), 3: m("iron_pickaxe"), 4: m("diamond_pickaxe") };

/** Has it a tool or weapon at least as good as this one (a diamond pickaxe for a stone one)? @param {any} bot @param {string} id */
export function hasAsGood(bot, id) {
  const want = D.toolInfo(id);
  if (want.type === "hand" || !want.material) return false;
  return Inv.stacks(bot).some(({ item }) => {
    const t = D.toolInfo(item.typeId);
    return t.type === want.type && t.tier >= want.tier && t.material !== "golden";
  });
}

/** The best pickaxe tier it has. @param {any} bot */
export function pickTier(bot) {
  let t = 0;
  for (const { item } of Inv.stacks(bot)) {
    const i = D.toolInfo(item.typeId);
    if (i.type === "pickaxe") t = Math.max(t, i.material === "golden" ? 1 : i.tier);
  }
  return t;
}
/** @param {string[]} blocks */
function tierFor(blocks) {
  return Math.max(0, ...blocks.map((b) => D.blockInfo(b).tier ?? 0));
}
/** @param {any} o */
function timeUp(o) {
  return o?.deadline !== undefined && system.currentTick > o.deadline;
}
/** What it is busy getting (for its status and chat). @param {any} bot @param {string} what */
export function doing(bot, what) {
  bot.doing = what;
}
/** "minecraft:iron_ingot" -> "iron ingot" @param {string} id */
export const nice = (id) => D.bare(String(id)).replace(/_/g, " ");

// ---------------------------------------------------------------- obtain
/**
 * Get to having n of something (an item id or a group: "planks", "log", "food", "coal", "wool",
 * "stone_tool"), doing whatever it takes. True when it has them.
 * @param {any} bot @param {string} want @param {number} [n] @param {{depth?: number, deadline?: number}} [o]
 * @returns {Generator<undefined, boolean>}
 */
export function* obtain(bot, want, n = 1, o = {}) {
  const depth = o.depth ?? 0;
  const id = D.GROUPS[want] || want === "food" ? want : m(want);
  if (Inv.count(bot, id) >= n) return true;
  // a better one of the same tool will do
  if (n === 1 && hasAsGood(bot, id)) return true;
  if (depth > 9 || timeUp(o)) return false;
  const sub = { depth: depth + 1, deadline: o.deadline ?? system.currentTick + 36000 };
  if (depth === 0) doing(bot, "getting " + nice(id));
  if (yield* fromStash(bot, id, n)) return true;
  if (id === "planks") return yield* makePlanks(bot, n, sub);
  if (id === "food") return yield* getFood(bot, n, sub);
  if (id === "stone_tool") {
    const more = n - Inv.count(bot, "stone_tool");
    const kind = bot.entity.dimension.id === "minecraft:nether" ? m("blackstone") : m("cobblestone");
    if (kind === m("blackstone") && (yield* gatherBlocks(bot, kind, Inv.count(bot, kind) + more, { blocks: list("blackstone") }, sub))) return true;
    return yield* obtain(bot, m("cobblestone"), Inv.count(bot, m("cobblestone")) + more, sub);
  }
  if (id === "coal") {
    const more = n - Inv.count(bot, "coal");
    if (yield* gatherBlocks(bot, m("coal"), Inv.count(bot, m("coal")) + more, { ...SOURCES[m("coal")], noStrip: depth > 2 }, sub)) return true;
    return yield* obtain(bot, m("charcoal"), Inv.count(bot, m("charcoal")) + n - Inv.count(bot, "coal"), sub);
  }
  if (id === "wool" || id === m("white_wool")) {
    const more = n - Inv.count(bot, "wool");
    return yield* getWool(bot, Inv.count(bot, "wool") + more, sub);
  }
  if (id === "log") return yield* gatherBlocks(bot, "log", n, SOURCES.log, sub);
  if (id === m("water_bucket") || id === m("lava_bucket")) {
    if (!Inv.has(bot, m("bucket")) && !(yield* obtain(bot, m("bucket"), 1, sub))) return false;
    return yield* fillBucket(bot, id === m("water_bucket") ? "water" : "lava");
  }
  if (id === m("obsidian")) return yield* getObsidian(bot, n, sub);
  const rec = D.recipeFor(id);
  if (rec && !NO_CRAFT.has(id)) {
    if (yield* craftUp(bot, rec, n, sub)) return true;
  }
  if (SMELT_FROM[id]) {
    if (yield* smeltUp(bot, id, n, sub)) return true;
  }
  if (SOURCES[id] && (!SOURCES[id].dim || SOURCES[id].dim === bot.entity.dimension.id)) {
    if (yield* gatherBlocks(bot, id, n, SOURCES[id], sub)) return true;
  }
  if (HUNT[id]) return yield* hunt(bot, HUNT[id], id, n, sub);
  if (rec && NO_CRAFT.has(id)) return yield* craftUp(bot, rec, n, sub);
  return Inv.count(bot, id) >= n;
}

/** Planks from whatever logs it has (getting logs first). @param {any} bot @param {number} n @param {any} o */
function* makePlanks(bot, n, o) {
  for (let pass = 0; pass < 3; pass++) {
    const have = Inv.count(bot, "planks");
    if (have >= n) return true;
    const logs = Math.ceil((n - have) / 4);
    if (Inv.count(bot, "log") < logs && !(yield* gatherBlocks(bot, "log", logs, SOURCES.log, o))) {
      if (Inv.count(bot, "log") === 0) return false;
    }
    for (const log of Inv.idsOf(bot, "log")) {
      const rec = D.RECIPES.find((r) => r.out === D.planksOf(log));
      if (!rec) continue;
      const times = Math.min(Inv.count(bot, log), Math.ceil((n - Inv.count(bot, "planks")) / 4));
      if (times > 0) yield* S.craft(bot, rec, times);
      if (Inv.count(bot, "planks") >= n) return true;
    }
  }
  return Inv.count(bot, "planks") >= n;
}

/**
 * Craft until it has n: get each ingredient (crafting sub-parts first), a table if the recipe
 * needs one, then craft. A table it put down away from home it picks back up.
 * @param {any} bot @param {D.Recipe} rec @param {number} n @param {any} o
 */
function* craftUp(bot, rec, n, o) {
  const times = Math.ceil((n - Inv.count(bot, rec.out)) / rec.n);
  if (times <= 0) return true;
  for (let pass = 0; pass < 4; pass++) {
    const miss = S.missingFor(bot, rec, times);
    if (!miss.length) break;
    for (const [want, k] of miss) {
      if (!(yield* obtain(bot, want, Inv.count(bot, want) + k, o))) return false;
    }
  }
  if (S.missingFor(bot, rec, times).length) return false;
  if (rec.table && !nearStation(bot, "minecraft:crafting_table") && !Inv.has(bot, m("crafting_table"))) {
    // keep enough for the recipe when making the table
    if (!(yield* obtain(bot, m("crafting_table"), 1, o))) return false;
    if (S.missingFor(bot, rec, times).length) return yield* craftUp(bot, rec, n, o);
  }
  const before = bot.stats.placed;
  const ok = yield* S.craft(bot, rec, times);
  if (rec.table && bot.stats.placed > before) yield* pickBackUp(bot, ["minecraft:crafting_table"]);
  return ok && Inv.count(bot, rec.out) >= n;
}

/** Is there a station within reach (or close by)? @param {any} bot @param {string} id */
export function nearStation(bot, id) {
  return S.findBlocks(bot.entity.dimension, bot.entity.location, [id], 6, 3).length > 0;
}

/**
 * Pick up a table or furnace it put down here for the moment (not at its home).
 * @param {any} bot @param {string[]} ids
 */
export function* pickBackUp(bot, ids) {
  if (bot.home && bot.home.dim === bot.entity.dimension.id && B.dist(bot.home.pos, bot.entity.location) < 24) return;
  const dim = bot.entity.dimension;
  for (const p of S.findBlocks(dim, bot.entity.location, ids, 6, 3)) {
    if (!bot.placed.has(S.placedKey(dim, p))) continue;
    yield* S.mineBlock(bot, p);
  }
}

/**
 * Smelt until it has n of an output: the inputs, a furnace and fuel first.
 * @param {any} bot @param {string} out @param {number} n @param {any} o
 */
function* smeltUp(bot, out, n, o) {
  const need = n - Inv.count(bot, out);
  if (need <= 0) return true;
  let input = SMELT_FROM[out].find((i) => Inv.count(bot, i) >= need);
  if (!input && out === m("charcoal")) {
    if (!(yield* obtain(bot, "log", Inv.count(bot, "log") + need, o))) return false;
    input = Inv.idsOf(bot, "log")[0];
  }
  if (!input) {
    // the cheapest input it can get
    for (const i of SMELT_FROM[out]) {
      if (/_ore$/.test(i) || i === m("stone")) continue;
      if (yield* obtain(bot, i, Inv.count(bot, i) + need, o)) {
        input = i;
        break;
      }
    }
  }
  if (!input) return false;
  if (!nearStation(bot, "minecraft:furnace") && !nearStation(bot, "minecraft:lit_furnace") && !Inv.has(bot, m("furnace"))) {
    if (!(yield* obtain(bot, m("furnace"), 1, o))) return false;
  }
  // fuel: coal it has, or planks (a plank smelts one and a half items)
  const coal = Inv.count(bot, "coal");
  if (coal * 8 < need && Inv.count(bot, "planks") * 1.5 < need && Inv.count(bot, "log") * 1.5 < need) {
    if (!(yield* obtain(bot, "planks", Math.ceil(need / 1.5) + 1, o))) return false;
  }
  const before = bot.stats.placed;
  let left = need;
  for (let k = 0; k < 4 && left > 0; k++) {
    const batch = Math.min(left, 64, Inv.count(bot, input));
    if (batch <= 0) break;
    const had = Inv.count(bot, out);
    if (!(yield* S.smelt(bot, input, batch))) break;
    left -= Inv.count(bot, out) - had;
  }
  if (bot.stats.placed > before) yield* pickBackUp(bot, ["minecraft:furnace", "minecraft:lit_furnace"]);
  return Inv.count(bot, out) >= n;
}

// ---------------------------------------------------------------- its chests at home
/**
 * Take what it needs from its chests at home, if they hold some and home isn't far.
 * @param {any} bot @param {string} id @param {number} n
 */
function* fromStash(bot, id, n) {
  const h = bot.home;
  if (!h || !h.stash || h.dim !== bot.entity.dimension.id) return false;
  const have = Object.entries(h.stash).filter(([k, v]) => v > 0 && Inv.matches(k, id)).reduce((s, [, v]) => s + v, 0);
  if (!have || B.dist(h.pos, bot.entity.location) > 96) return false;
  const want = n - Inv.count(bot, id);
  doing(bot, "fetching " + nice(id) + " from its chest");
  for (const c of h.chests ?? []) {
    const got = yield* S.withdraw(bot, c, id, want);
    noteStash(bot, id, -got, true);
    if (Inv.count(bot, id) >= n) return true;
  }
  // the chests didn't hold what it thought: forget it
  for (const k of Object.keys(h.stash)) if (Inv.matches(k, id)) h.stash[k] = 0;
  return Inv.count(bot, id) >= n;
}
/** @param {any} bot @param {string} id @param {number} delta @param {boolean} [group] */
export function noteStash(bot, id, delta, group = false) {
  const h = bot.home;
  if (!h) return;
  h.stash ??= {};
  if (group) {
    let left = -delta;
    for (const k of Object.keys(h.stash)) {
      if (left <= 0) break;
      if (!Inv.matches(k, id)) continue;
      const take = Math.min(left, h.stash[k]);
      h.stash[k] -= take;
      left -= take;
    }
    return;
  }
  h.stash[id] = Math.max(0, (h.stash[id] ?? 0) + delta);
}

// ---------------------------------------------------------------- mining
const NEIGH = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
/** Can it see this block (a face open to air, water or lava, or right by it)? @param {any} bot @param {Vector3} p */
export function noticed(bot, p) {
  const dim = bot.entity.dimension;
  if (B.dist(B.eye(bot), { x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 }) < 2.5) return true;
  for (const [dx, dy, dz] of NEIGH) {
    const k = D.blockInfo(B.idAt(dim, { x: p.x + dx, y: p.y + dy, z: p.z + dz })).kind;
    if (k === "air" || k === "pass" || k === "liquid" || k === "lava" || k === "climb") return true;
  }
  return false;
}
/** Valuable ores a player always stops to mine when it sees them. */
const GOOD_ORES = list("diamond_ore", "deepslate_diamond_ore", "iron_ore", "deepslate_iron_ore", "gold_ore", "deepslate_gold_ore",
  "coal_ore", "deepslate_coal_ore", "lapis_ore", "deepslate_lapis_ore", "redstone_ore", "deepslate_redstone_ore", "emerald_ore",
  "deepslate_emerald_ore", "ancient_debris", "nether_gold_ore", "quartz_ore");

/**
 * The nearest block of these kinds it can see and may mine (not someone's build, not one it
 * failed at a moment ago).
 * @param {any} bot @param {string[]} ids @param {number} r @param {number} [rv]
 */
export function nextBlock(bot, ids, r, rv = Math.min(8, r)) {
  const dim = bot.entity.dimension;
  const protect = S.protector(bot);
  const now = system.currentTick;
  const f = B.feet(bot);
  bot.badBlocks ??= new Map();
  for (const p of S.findBlocks(dim, bot.entity.location, ids, r, rv)) {
    const k = B.key(p);
    if ((bot.badBlocks.get(k) ?? 0) > now) continue;
    // never the block it stands on (a player doesn't dig straight down under itself)
    if (p.x === f.x && p.z === f.z && p.y < f.y) continue;
    const id = B.idAt(dim, p);
    if (protect(p.x, p.y, p.z, id)) continue;
    if (!noticed(bot, p)) continue;
    // a bot can't harvest it: don't bother
    if (!Inv.canHarvestWith(bot, id) && D.blockInfo(id).tier) continue;
    return p;
  }
  return undefined;
}
/** Mark a block it couldn't get to, for a while. @param {any} bot @param {Vector3} p */
function bad(bot, p) {
  bot.badBlocks ??= new Map();
  bot.badBlocks.set(B.key(p), system.currentTick + 2400);
  if (bot.badBlocks.size > 200) bot.badBlocks.delete(bot.badBlocks.keys().next().value);
}

const G_TIER = (bot) => pickTier(bot);
/** Things a player gathers by the stack. */
const BULK = new Set(["log", m("cobblestone"), m("cobbled_deepslate"), m("dirt"), m("sand"), m("netherrack"), m("blackstone")]);

/** Make sure it has a pickaxe good enough for these blocks. @param {any} bot @param {string[]} blocks @param {any} o */
function* toolFor(bot, blocks, o) {
  const tier = tierFor(blocks);
  if (!tier || pickTier(bot) >= tier) return true;
  return yield* obtain(bot, PICKS[tier], 1, { ...o, depth: Math.min(o?.depth ?? 0, 4) });
}

/**
 * Mine blocks of a kind until it has n of the item they drop: ones in sight first, then the
 * rest of a tree, strip-mining at the ore's height, or wandering to find more.
 * @param {any} bot @param {string} item @param {number} n
 * @param {{blocks: string[], y?: number, dim?: string, r?: number, noStrip?: boolean, depth?: number}} spec @param {any} o
 */
export function* gatherBlocks(bot, item, n, spec, o) {
  if (!bot.world.build) return false;
  if (spec.dim && spec.dim !== bot.entity.dimension.id) return false;
  if (!(yield* toolFor(bot, spec.blocks, o))) return false;
  let misses = 0;
  let strips = 0;
  const r = spec.r ?? 16;
  // common blocks: a player takes plenty while it's at it
  const goal = BULK.has(item) ? Math.max(n, Inv.count(bot, item) + (item === "log" ? 6 : 16)) : n;
  while (Inv.count(bot, item) < goal) {
    if (timeUp(o) || bot.abort) return Inv.count(bot, item) >= n;
    if (Inv.freeSlots(bot) === 0) yield* S.tossJunk(bot);
    // its pickaxe broke: a new one first
    if (!(yield* toolFor(bot, spec.blocks, o))) return Inv.count(bot, item) >= n;
    const p = nextBlock(bot, spec.blocks, r);
    if (!p && Inv.count(bot, item) >= n) return true;
    if (p) {
      misses = 0;
      const before = Inv.count(bot, item);
      const ok = yield* S.mineBlock(bot, p);
      if (!ok) bad(bot, p);
      if (item === "log" && ok) yield* restOfTree(bot, p, spec.blocks);
      if (ok && Inv.count(bot, item) === before) yield* S.collect(bot, { x: p.x + 0.5, y: p.y, z: p.z + 0.5 }, 5, 40);
      continue;
    }
    // ores: dig down to where they are; stone: just under the ground
    if ((spec.y !== undefined || spec.depth) && !spec.noStrip && strips < 3) {
      strips++;
      const at = spec.y ?? B.feet(bot).y - (spec.depth ?? 5);
      if (yield* stripMine(bot, { ...spec, y: at }, item, n, o)) return true;
      continue;
    }
    if (++misses > 5) return false;
    if (underground(bot)) yield* toSurface(bot);
    if (!(yield* explore(bot, { far: 48 }))) misses++;
  }
  return true;
}

/** After the bottom log of a tree: the logs above it, standing on the stump if it must. @param {any} bot @param {Vector3} p @param {string[]} ids */
function* restOfTree(bot, p, ids) {
  const dim = bot.entity.dimension;
  for (let dy = 1; dy <= 6; dy++) {
    const q = { x: p.x, y: p.y + dy, z: p.z };
    const id = B.idAt(dim, q);
    if (!ids.includes(id)) {
      // a branch: logs touching the one below
      let found = false;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const s = { x: q.x + dx, y: q.y, z: q.z + dz };
        if (ids.includes(B.idAt(dim, s))) {
          yield* S.mineBlock(bot, s, { noCollect: true });
          found = true;
        }
      }
      if (!found) break;
      continue;
    }
    if (!(yield* S.mineBlock(bot, q, { noCollect: true }))) break;
  }
  yield* S.collect(bot, { x: p.x + 0.5, y: p.y, z: p.z + 0.5 }, 6, 80);
}

/** Mine every good ore it can see right now. True when it has n of item. @param {any} bot @param {any} spec @param {string} item @param {number} n */
function* mineSeen(bot, spec, item, n) {
  for (let k = 0; k < 12; k++) {
    if (Inv.count(bot, item) >= n) return true;
    const p = nextBlock(bot, [...new Set([...spec.blocks, ...GOOD_ORES])], 5, 4);
    if (!p) break;
    if (!(yield* S.mineBlock(bot, p))) bad(bot, p);
  }
  return Inv.count(bot, item) >= n;
}

const CARD = [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }, { x: 0, z: -1 }];
/**
 * Strip-mine: a staircase down to the ore's height, then a tunnel two blocks high, turning off
 * into branches, mining every ore that shows in the walls.
 * @param {any} bot @param {any} spec @param {string} item @param {number} n @param {any} o
 */
export function* stripMine(bot, spec, item, n, o) {
  doing(bot, "strip-mining for " + nice(item));
  bot.mineDir ??= Math.floor(Math.random() * 4);
  let fails = 0;
  const range = bot.entity.dimension.heightRange;
  const y = Math.max(range.min + 6, Math.min(range.max - 8, spec.y));
  // something to dig with (a broken pickaxe gets replaced on the spot)
  const tools = function* () {
    if (G_TIER(bot) >= Math.max(1, tierFor(spec.blocks))) return true;
    return yield* toolFor(bot, [...spec.blocks, m("stone")], o);
  };
  // down (or up) the staircase
  for (let leg = 0; leg < 20 && Math.abs(B.feet(bot).y - y) > 1; leg++) {
    if (timeUp(o) || bot.abort) return false;
    if (!(yield* tools())) return false;
    const f = B.feet(bot);
    const dir = CARD[bot.mineDir];
    const dy = Math.max(-10, Math.min(10, y - f.y));
    const goal = { x: f.x + dir.x * (Math.abs(dy) + 1), y: f.y + dy, z: f.z + dir.z * (Math.abs(dy) + 1), r: 1 };
    const ok = yield* S.goTo(bot, goal, { tries: 2, weight: 5, maxNodes: 2500 });
    if (yield* mineSeen(bot, spec, item, n)) return true;
    if (!ok && B.feet(bot).y === f.y) {
      bot.mineDir = (bot.mineDir + 1) % 4;
      if (++fails > 4) return false;
    }
  }
  // the tunnel
  for (let seg = 0; seg < 16; seg++) {
    if (timeUp(o) || bot.abort) return false;
    if (!(yield* tools())) return false;
    if (Inv.freeSlots(bot) <= 1) yield* S.tossJunk(bot, [...Inv.JUNK, [m("cobblestone"), 64], [m("cobbled_deepslate"), 32], [m("netherrack"), 32]]);
    const f = B.feet(bot);
    const dir = CARD[bot.mineDir];
    const ok = yield* S.goTo(bot, { x: f.x + dir.x * 6, y: f.y, z: f.z + dir.z * 6, r: 0.5 }, { tries: 2, maxNodes: 900 });
    if (yield* mineSeen(bot, spec, item, n)) return true;
    if (!ok) bot.mineDir = (bot.mineDir + (Math.random() < 0.5 ? 1 : 3)) % 4;
    else if (seg % 5 === 4) bot.mineDir = (bot.mineDir + (Math.random() < 0.5 ? 1 : 3)) % 4;
    // light the tunnel as it goes
    if (seg % 2 === 1 && Inv.has(bot, m("torch"))) yield* torchHere(bot);
  }
  return Inv.count(bot, item) >= n;
}

/** Put a torch on the floor beside it if it's dark here (no light within 7 blocks). @param {any} bot */
export function* torchHere(bot) {
  const dim = bot.entity.dimension;
  if (dim.id !== "minecraft:overworld") return false;
  if (S.findBlocks(dim, bot.entity.location, list("torch", "lantern", "glowstone", "lava", "shroomlight", "sea_lantern"), 6, 3).length) return false;
  const spot = S.spotNear(bot, 1);
  if (!spot) return false;
  return yield* S.placeBlock(bot, spot, m("torch"));
}

/** Is it down a mine or in a cave (no sky above, and below the ground around)? @param {any} bot */
export function underground(bot) {
  try {
    const dim = bot.entity.dimension;
    return dim.id === "minecraft:overworld" && B.roofed(dim, bot.entity.location);
  } catch {
    return false;
  }
}
/** Up to the open air (out of its mine, a staircase up if need be). @param {any} bot */
export function* toSurface(bot) {
  if (bot.entity.dimension.id !== "minecraft:overworld" || !underground(bot)) return true;
  doing(bot, "heading up to the surface");
  for (let leg = 0; leg < 12 && underground(bot); leg++) {
    const f = B.feet(bot);
    let top;
    try {
      top = bot.entity.dimension.getTopmostBlock({ x: f.x, z: f.z });
    } catch {
      top = undefined;
    }
    const ty = top && top.location.y < f.y + 60 ? top.location.y + 1 : f.y + 10;
    const dir = CARD[bot.mineDir ?? 0];
    const dy = Math.min(10, ty - f.y);
    const ok = yield* S.goTo(bot, { x: f.x + dir.x * (dy + 1), y: f.y + dy, z: f.z + dir.z * (dy + 1), r: 1.5 }, { tries: 2, weight: 4, maxNodes: 2500 });
    if (!ok) bot.mineDir = ((bot.mineDir ?? 0) + 1) % 4;
  }
  return !underground(bot);
}

// ---------------------------------------------------------------- exploring
/**
 * Go and look somewhere new: a walk of `far` blocks in a direction it hasn't been, onto
 * whatever height the land is.
 * @param {any} bot @param {{far?: number, from?: Vector3, maxNodes?: number}} [o]
 */
export function* explore(bot, o = {}) {
  const far = o.far ?? 40;
  const l = bot.entity.location;
  bot.visited ??= [];
  const seenNear = (x, z) => bot.visited.filter((v) => Math.hypot(v.x - x, v.z - z) < far * 0.7).length;
  let best;
  let bestScore = Infinity;
  for (let k = 0; k < 8; k++) {
    const yaw = (bot.exploreYaw ?? Math.random() * 360) + k * 45 + (Math.random() - 0.5) * 30;
    const f = B.forward(yaw);
    const x = l.x + f.x * far;
    const z = l.z + f.z * far;
    // keep near home (or where it started), a bit
    const anchor = bot.home && bot.home.dim === bot.entity.dimension.id ? bot.home.pos
      : bot.known.start && bot.known.start.dim === bot.entity.dimension.id ? bot.known.start.pos : undefined;
    const fromHome = anchor ? Math.hypot(x - anchor.x, z - anchor.z) / 80 : 0;
    const score = seenNear(x, z) + k * 0.15 + fromHome;
    if (score < bestScore) {
      bestScore = score;
      best = { yaw, x, z };
    }
  }
  if (!best) return false;
  bot.exploreYaw = best.yaw;
  doing(bot, bot.doing && !/^exploring/.test(bot.doing) ? bot.doing : "exploring");
  yield* S.goTo(bot, { x: Math.floor(best.x), z: Math.floor(best.z), r: 4 }, { tries: 2, maxNodes: o.maxNodes ?? 2500 });
  const moved = B.flat(bot.entity.location, l);
  bot.visited.push({ x: Math.floor(l.x), z: Math.floor(l.z) });
  if (bot.visited.length > 60) bot.visited.shift();
  if (moved < far * 0.4) bot.exploreYaw = best.yaw + 90 + Math.random() * 180;
  return moved > far * 0.4;
}

// ---------------------------------------------------------------- hunting and shearing
/** A mob of these kinds it can see (and that isn't a baby, or someone's pet). @param {any} bot @param {string[]} types @param {number} [r] */
export function findPrey(bot, types, r = 32) {
  const e = bot.entity;
  let near = [];
  try {
    near = e.dimension.getEntities({ location: e.location, maxDistance: r }).filter((x) => types.includes(x.typeId));
  } catch {
    return undefined;
  }
  near.sort((a, b) => B.dist(a.location, e.location) - B.dist(b.location, e.location));
  const now = system.currentTick;
  for (const t of near) {
    if ((bot.ignore?.get(t.id) ?? 0) > now) continue;
    try {
      if (t.getComponent("minecraft:is_baby") || t.getComponent("minecraft:is_tamed") || t.nameTag) continue;
    } catch {
      continue;
    }
    if (bot.seen.has(t.id) || Sense.clearSight(e.dimension, B.eye(bot), t.location)) return t;
  }
  return undefined;
}

/**
 * Kill mobs of a kind until it has n of what they drop.
 * @param {any} bot @param {string[]} types @param {string} item @param {number} n @param {any} o
 */
export function* hunt(bot, types, item, n, o) {
  const kind = nice(types[0]);
  const plural = /sheep|fish|cod|salmon/.test(kind) ? kind : /man$/.test(kind) ? kind.replace(/man$/, "men") : kind + "s";
  doing(bot, "hunting " + plural + " for " + nice(item));
  let fails = 0;
  while (Inv.count(bot, item) < n) {
    if (timeUp(o) || bot.abort) return false;
    const prey = findPrey(bot, types);
    if (!prey) {
      if (bot.entity.dimension.id === "minecraft:overworld" && underground(bot) && !types.some((t) => /spider|skeleton|zombie|creeper/.test(t))) {
        yield* toSurface(bot);
      }
      if (!(yield* explore(bot, { far: 48 }))) fails++;
      if (++fails > 8) return false;
      continue;
    }
    let at = { ...prey.location };
    const r = yield* C.fight(bot, prey, { giveUp: 40, ticks: 600 });
    if (bot.lastTargetPos) at = bot.lastTargetPos;
    if (r === "killed" || r === "gone") yield* S.collect(bot, at, 6, 60);
    else if (r === "flee") return false;
    else {
      // that one got away (or can't be reached): another
      (bot.ignore ??= new Map()).set(prey.id, system.currentTick + 2400);
      fails++;
    }
    if (fails > 8) return false;
  }
  return true;
}

/** "white", "orange"... for a sheep's colour number. @param {Entity} sheep */
function sheepColour(sheep) {
  try {
    return D.COLORS[sheep.getComponent("minecraft:color")?.value ?? 0] ?? "white";
  } catch {
    return "white";
  }
}
/**
 * Wool: shear sheep if it has shears (they grow it back), else kill them.
 * @param {any} bot @param {number} n @param {any} o
 */
function* getWool(bot, n, o) {
  if (!Inv.has(bot, m("shears"))) return yield* hunt(bot, list("sheep"), "wool", n, o);
  doing(bot, "shearing sheep");
  let fails = 0;
  while (Inv.count(bot, "wool") < n && fails < 8) {
    if (timeUp(o)) return false;
    const sheep = findPrey(bot, list("sheep"));
    let sheared = false;
    try {
      sheared = !!sheep?.getComponent("minecraft:is_sheared");
    } catch {
      sheared = true;
    }
    if (!sheep || sheared) {
      if (!(yield* explore(bot, { far: 40 }))) fails++;
      fails++;
      continue;
    }
    const ok = yield* S.goTo(bot, { ...B.blockPos(sheep.location), r: 2 }, { tries: 2, maxNodes: 1200 });
    if (!ok || !sheep.isValid) {
      fails++;
      continue;
    }
    Inv.holdId(bot, m("shears"));
    B.lookAt(bot, sheep.location, 10, 4);
    yield* S.wait(5);
    B.swing(bot);
    try {
      sheep.triggerEvent("minecraft:on_sheared");
      const k = 1 + Math.floor(Math.random() * 3);
      sheep.dimension.spawnItem(new ItemStack(m(sheepColour(sheep) + "_wool"), k), { ...sheep.location, y: sheep.location.y + 0.8 });
      sheep.dimension.playSound("mob.sheep.shear", sheep.location, { volume: 0.8, pitch: 1 });
    } catch {
      fails++;
      continue;
    }
    if (Inv.wearHeld(bot, 1) === "broke") S.onToolBroke(bot, m("shears"));
    yield* S.collect(bot, sheep.location, 5, 40);
  }
  return Inv.count(bot, "wool") >= n;
}

// ---------------------------------------------------------------- food
/**
 * Food: cook the raw meat it has, hunt animals for more, bake bread from wheat, pick
 * apples off the ground. n: how many pieces of food it wants.
 * @param {any} bot @param {number} n @param {any} o
 */
export function* getFood(bot, n, o) {
  o = { ...o, deadline: o?.deadline ?? system.currentTick + 9600 };
  const good = (id) => !!D.FOOD[D.bare(id)] && !D.BAD_FOOD.has(D.bare(id)) && !/^minecraft:(beef|porkchop|mutton|chicken|rabbit|cod|salmon|potato)$/.test(id);
  const count = () => Inv.count(bot, good);
  for (let round = 0; round < 6 && count() < n; round++) {
    if (timeUp(o)) break;
    // cook what it has
    const raw = Inv.idsOf(bot, (id) => /^minecraft:(beef|porkchop|mutton|chicken|rabbit|cod|salmon|potato)$/.test(id))[0];
    if (raw) {
      const out = m(D.SMELT[D.bare(raw)]);
      const ok = yield* obtain(bot, out, Inv.count(bot, out) + Inv.count(bot, raw), o);
      if (!ok) break;
      continue;
    }
    if (Inv.count(bot, m("wheat")) >= 3) {
      yield* obtain(bot, m("bread"), Inv.count(bot, m("bread")) + Math.floor(Inv.count(bot, m("wheat")) / 3), o);
      continue;
    }
    if (yield* harvestCrops(bot)) continue;
    const want = n - count();
    const prey = findPrey(bot, [...Sense.FOOD_ANIMALS], 40);
    if (prey) {
      const meat = { "minecraft:cow": m("beef"), "minecraft:mooshroom": m("beef"), "minecraft:pig": m("porkchop"), "minecraft:sheep": m("mutton"),
        "minecraft:chicken": m("chicken"), "minecraft:rabbit": m("rabbit") }[prey.typeId] ?? m("beef");
      yield* hunt(bot, [prey.typeId], meat, Inv.count(bot, meat) + Math.min(3, want), o);
      continue;
    }
    if (underground(bot)) yield* toSurface(bot);
    yield* explore(bot, { far: 48 });
  }
  return count() >= n || Inv.count(bot, "food") >= n;
}

/**
 * Ripe wheat, carrots or potatoes on a farm nearby: harvest them and plant again, as a good
 * neighbour does.
 * @param {any} bot
 */
function* harvestCrops(bot) {
  const dim = bot.entity.dimension;
  const crops = S.findBlocks(dim, bot.entity.location, list("wheat", "carrots", "potatoes", "beetroot"), 16, 4);
  let done = 0;
  for (const p of crops) {
    const b = B.blockAt(dim, p);
    let age = 0;
    try {
      age = Number(b?.permutation.getState("growth") ?? 0);
    } catch {
      age = 0;
    }
    if (age < 7) continue;
    const id = b.typeId;
    const ok = yield* S.goTo(bot, { ...p, r: 2.5 }, { tries: 1, maxNodes: 800, noBuild: true });
    if (!ok) continue;
    B.lookAt(bot, { x: p.x + 0.5, y: p.y + 0.3, z: p.z + 0.5 }, 10, 4);
    yield* S.wait(4);
    B.swing(bot);
    /** @type {Array<[string, number]>} */
    const drops = id === m("wheat") ? [[m("wheat"), 1], [m("wheat_seeds"), 1 + Math.floor(Math.random() * 3)]]
      : id === m("carrots") ? [[m("carrot"), 2 + Math.floor(Math.random() * 3)]]
      : id === m("potatoes") ? [[m("potato"), 2 + Math.floor(Math.random() * 3)]] : [[m("beetroot"), 1], [m("beetroot_seeds"), 1 + Math.floor(Math.random() * 2)]];
    try {
      // and plant it again
      b.setPermutation(b.permutation.withState("growth", 0));
      dim.playSound("dig.grass", p, { volume: 0.6, pitch: 1 });
      for (const [it, k] of drops) Inv.add(bot, new ItemStack(it, k));
    } catch {
      continue;
    }
    if (++done >= 6) break;
  }
  return done > 0;
}

// ---------------------------------------------------------------- buckets and obsidian
/** Is a liquid block a source? @param {any} b */
function isSource(b) {
  try {
    return Number(b.permutation.getState("liquid_depth") ?? 0) === 0;
  } catch {
    return true;
  }
}
/**
 * Fill its empty bucket at a water (or lava) source nearby.
 * @param {any} bot @param {"water" | "lava"} kind
 */
export function* fillBucket(bot, kind) {
  const dim = bot.entity.dimension;
  const ids = kind === "water" ? list("water") : list("lava");
  const spots = S.findBlocks(dim, bot.entity.location, ids, 24, 8).filter((p) => isSource(B.blockAt(dim, p)));
  for (const p of spots.slice(0, 6)) {
    const ok = yield* S.goTo(bot, { ...p, r: 3 }, { tries: 2, maxNodes: 1500 });
    if (!ok || B.dist(B.eye(bot), { x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 }) > 4.5) continue;
    if (!Inv.hold(bot, m("bucket"))) return false;
    B.lookAt(bot, { x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 }, 10, 4);
    yield* S.wait(5);
    B.swing(bot);
    try {
      // lava is used up; it leaves water (most water is a lake or river that fills back in)
      if (kind === "lava") dim.setBlockType(p, "minecraft:air");
      dim.playSound(kind === "water" ? "bucket.fill_water" : "bucket.fill_lava", p, { volume: 0.8, pitch: 1 });
    } catch {
      continue;
    }
    Inv.take(bot, m("bucket"), 1);
    Inv.add(bot, new ItemStack(m(kind + "_bucket"), 1));
    return true;
  }
  return false;
}

/**
 * Obsidian: mine what it can find (a ruined portal, a lava pool already turned), or pour its
 * water over still lava and mine the obsidian it makes. Needs a diamond pickaxe.
 * @param {any} bot @param {number} n @param {any} o
 */
function* getObsidian(bot, n, o) {
  if (!(yield* toolFor(bot, list("obsidian"), o))) return false;
  const dim = bot.entity.dimension;
  for (let round = 0; round < 12 && Inv.count(bot, m("obsidian")) < n; round++) {
    if (timeUp(o)) return false;
    doing(bot, "getting obsidian");
    // obsidian it can see, with something solid under it (nothing to fall into lava)
    const seen = nextBlock(bot, list("obsidian"), 24);
    if (seen && D.isFloor(B.idAt(dim, { ...seen, y: seen.y - 1 }))) {
      if (!(yield* S.mineBlock(bot, seen))) bad(bot, seen);
      continue;
    }
    // still lava: water over it
    const lava = S.findBlocks(dim, bot.entity.location, list("lava"), 24, 10).filter((p) => isSource(B.blockAt(dim, p)) &&
      ["air", "pass"].includes(D.blockInfo(B.idAt(dim, { ...p, y: p.y + 1 })).kind));
    if (lava.length && (Inv.has(bot, m("water_bucket")) || (yield* obtain(bot, m("water_bucket"), 1, o)))) {
      const p = lava[0];
      const ok = yield* S.goTo(bot, { x: p.x, z: p.z, r: 3, test: (x, y, z) => Math.hypot(x - p.x, z - p.z) <= 3.5 && y >= p.y && y <= p.y + 2 &&
        D.isFloor(B.idAt(dim, { x, y: y - 1, z })) && B.idAt(dim, { x, y: y - 1, z }) !== m("lava") }, { tries: 2, maxNodes: 2000 });
      if (!ok) {
        bad(bot, p);
        continue;
      }
      Inv.hold(bot, m("water_bucket"));
      B.lookAt(bot, { x: p.x + 0.5, y: p.y + 1, z: p.z + 0.5 }, 20, 4);
      yield* S.wait(6);
      B.swing(bot);
      // the water runs over the pool's top: every still lava block it reaches hardens
      let made = 0;
      for (const q of S.findBlocks(dim, p, list("lava"), 4, 1)) {
        if (q.y !== p.y || !isSource(B.blockAt(dim, q))) continue;
        try {
          dim.setBlockType(q, "minecraft:obsidian");
          made++;
        } catch {
          /* ignore */
        }
      }
      try {
        dim.playSound("random.fizz", p, { volume: 0.8, pitch: 1.2 });
        dim.playSound("bucket.empty_water", p, { volume: 0.6, pitch: 1 });
      } catch {
        /* ignore */
      }
      yield* S.wait(20);
      // and it scoops the water back up
      try {
        dim.playSound("bucket.fill_water", p, { volume: 0.6, pitch: 1 });
      } catch {
        /* ignore */
      }
      if (!made) bad(bot, p);
      continue;
    }
    // go looking: deep down, where lava pools are
    if (B.feet(bot).y > -40 && dim.id === "minecraft:overworld") {
      yield* stripMine(bot, { blocks: list("obsidian"), y: -54 }, m("obsidian"), n, o);
    } else yield* explore(bot, { far: 40 });
  }
  return Inv.count(bot, m("obsidian")) >= n;
}
