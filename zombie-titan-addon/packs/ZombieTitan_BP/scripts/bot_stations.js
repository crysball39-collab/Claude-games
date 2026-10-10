// The blocks a player works at besides the crafting table and furnace (bot_skills.js does
// those), used the way the game's screens work: an enchanting table (its power from the
// bookshelves around it, levels and lapis spent, enchantments rolled as the game rolls them),
// an anvil (repairing with material, combining two of a thing, naming, getting too expensive,
// wearing out), a smithing table (diamond to netherite), a grindstone, a stonecutter, a
// brewing stand (it really brews: bottles, nether wart and blaze powder go in), a composter,
// a cauldron and a bell. Also trading with villagers (by their profession and level),
// bartering gold with piglins, and drinking potions.
import { EnchantmentTypes, ItemStack, system, world } from "@minecraft/server";
import * as B from "./bot_body.js";
import * as D from "./bot_data.js";
import * as G from "./bot_gather.js";
import * as Inv from "./bot_inv.js";
import * as S from "./bot_skills.js";
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {import("@minecraft/server").Entity} Entity */

const m = D.mc;
const mid = (p) => ({ x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 });
const rand = (n) => Math.floor(Math.random() * n);
/** @param {any} bot @param {string} id @param {Vector3} at @param {number} [pitch] */
function sound(bot, id, at, pitch = 1) {
  try {
    bot.entity.dimension.playSound(id, at, { volume: 0.8, pitch });
  } catch {
    /* ignore */
  }
}

/**
 * Stand at a station: find one near (or put one down from its inventory, or make one), walk
 * up, look at it. Its position, or undefined.
 * @param {any} bot @param {string} block @param {{make?: boolean}} [o]
 */
export function* atStation(bot, block, o = {}) {
  let at = yield* S.station(bot, block);
  if (!at && o.make) {
    if (yield* G.obtain(bot, block, 1)) at = yield* S.station(bot, block);
  }
  if (!at) return undefined;
  if (B.dist(bot.entity.location, mid(at)) > 3.5) {
    if (!(yield* S.goTo(bot, { ...at, r: 2.5 }, { tries: 2, maxNodes: 1200 }))) return undefined;
  }
  B.stop(bot);
  B.lookAt(bot, mid(at), 60, 3);
  yield* S.wait(8);
  return at;
}

/** The inventory slot holding a stack that passes a test. @param {any} bot @param {(it: ItemStack) => boolean} test */
function slotOf(bot, test) {
  const c = Inv.container(bot);
  if (!c) return -1;
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    if (it && test(it)) return i;
  }
  return -1;
}
/** Every stack (inventory and worn), with where it is. @param {any} bot @param {(it: ItemStack) => boolean} test */
function where(bot, test) {
  return Inv.stacks(bot).filter((s) => test(s.item));
}
/** Put a changed stack back where it was. @param {any} bot @param {number | string} slot @param {ItemStack | undefined} it */
function putBack(bot, slot, it) {
  if (typeof slot === "number") Inv.container(bot)?.setItem(slot, it);
  else Inv.setEquip(bot, slot, it);
}

// ---------------------------------------------------------------- enchanting
const ENCHANTABILITY = { wooden: 15, stone: 5, iron: 14, golden: 22, diamond: 10, netherite: 15, leather: 15, chainmail: 12,
  turtle: 9, bow: 1 };
const EXCLUSIVE = [["sharpness", "smite", "bane_of_arthropods"], ["protection", "fire_protection", "blast_protection", "projectile_protection"],
  ["silk_touch", "fortune"], ["infinity", "mending"], ["depth_strider", "frost_walker"]];
/** @param {string} a @param {string} b */
function clash(a, b) {
  return a === b || EXCLUSIVE.some((g) => g.includes(a) && g.includes(b));
}
/** @param {string} name */
function enchType(name) {
  try {
    return EnchantmentTypes.get(name) ?? EnchantmentTypes.get("minecraft:" + name);
  } catch {
    return undefined;
  }
}
/** @param {ItemStack} it */
function enchants(it) {
  try {
    return it.getComponent("minecraft:enchantable")?.getEnchantments() ?? [];
  } catch {
    return [];
  }
}
/** "sharpness" from an enchantment. @param {any} e */
const enchName = (e) => String(e.type?.id ?? e.type).replace(/^minecraft:/, "");

/** Bookshelves around an enchanting table (up to 15), with the gap between them clear. @param {any} dim @param {Vector3} t */
export function bookshelves(dim, t) {
  let n = 0;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== 2) continue;
      for (let dy = 0; dy <= 1; dy++) {
        if (B.idAt(dim, { x: t.x + dx, y: t.y + dy, z: t.z + dz }) !== "minecraft:bookshelf") continue;
        const gap = { x: t.x + Math.round(dx / 2), y: t.y + dy, z: t.z + Math.round(dz / 2) };
        if (D.blockInfo(B.idAt(dim, gap)).kind === "air") n++;
      }
    }
  }
  return Math.min(15, n);
}
/** The three offers' level costs for a number of bookshelves (as the table rolls them). @param {number} shelves */
export function enchantCosts(shelves) {
  const base = 1 + rand(8) + Math.floor(shelves / 2) + rand(shelves + 1);
  return [Math.max(Math.floor(base / 3), 1), Math.floor((base * 2) / 3) + 1, Math.max(base, shelves * 2)];
}
/**
 * Roll the enchantments an item gets at a level, the way the table does: its enchantability
 * nudges the power up, the first pick is weighted, more come with a falling chance.
 * @param {string} id @param {number} level @returns {Array<[string, number]>}
 */
export function rollEnchants(id, level) {
  const kind = D.enchantKind(id);
  const pool = kind ? D.ENCHANTS[kind] : undefined;
  if (!pool) return [];
  const mat = /^minecraft:(wooden|stone|iron|golden|diamond|netherite|leather|chainmail|turtle)_/.exec(id)?.[1] ?? (kind === "bow" ? "bow" : "iron");
  const e = ENCHANTABILITY[mat] ?? 1;
  let power = level + 1 + rand(Math.floor(e / 4) + 1) + rand(Math.floor(e / 4) + 1);
  power = Math.max(1, Math.round(power * (1 + (Math.random() + Math.random() - 1) * 0.15)));
  /** @type {Array<[string, number]>} */
  const out = [];
  let chance = power;
  for (let k = 0; k < 4; k++) {
    const options = pool.filter(([name]) => !out.some(([o]) => clash(o, name)));
    if (!options.length) break;
    let total = options.reduce((s, o) => s + o[2], 0);
    let r = Math.random() * total;
    let pick = options[0];
    for (const o of options) {
      r -= o[2];
      if (r <= 0) {
        pick = o;
        break;
      }
    }
    const lv = Math.max(1, Math.min(pick[1], Math.floor((chance * pick[1]) / 50) + 1));
    out.push([pick[0], lv]);
    if (Math.random() > (power + 1) / 50) break;
    power = Math.floor(power / 2);
    chance = power;
  }
  return out;
}
/** Write enchantments onto a stack (those it can take). @param {ItemStack} it @param {Array<[string, number]>} list */
function applyEnchants(it, list) {
  let comp;
  try {
    comp = it.getComponent("minecraft:enchantable");
  } catch {
    comp = undefined;
  }
  if (!comp) return 0;
  let n = 0;
  for (const [name, level] of list) {
    const type = enchType(name);
    if (!type) continue;
    const en = { type, level: Math.min(level, type.maxLevel ?? level) };
    try {
      if (comp.canAddEnchantment(en)) {
        comp.addEnchantment(en);
        n++;
      }
    } catch {
      /* not for this item */
    }
  }
  return n;
}

/** What it would most like enchanted (its best weapon, pickaxe, armour, bow, unenchanted first). @param {any} bot */
function enchantTarget(bot) {
  const order = ["sword", "pickaxe", "chestplate", "leggings", "helmet", "boots", "bow", "axe", "shovel"];
  let best;
  let bestScore = -1;
  for (const s of Inv.stacks(bot)) {
    const kind = D.enchantKind(s.item.typeId);
    if (!kind || enchants(s.item).length) continue;
    const t = D.toolInfo(s.item.typeId).tier || D.armorInfo(s.item.typeId)?.points || 1;
    const score = (order.length - order.indexOf(kind)) * 2 + t;
    if (order.includes(kind) && score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

/**
 * Enchant its best unenchanted gear at an enchanting table: it picks the best offer its levels
 * and lapis allow, spends them, and the item gets what the table rolls.
 * @param {any} bot
 */
export function* enchant(bot) {
  const target = enchantTarget(bot);
  if (!target || bot.level < 1 || !Inv.has(bot, m("lapis_lazuli"))) return false;
  const at = yield* atStation(bot, m("enchanting_table"));
  if (!at) return false;
  G.doing(bot, "enchanting its " + G.nice(target.item.typeId));
  B.setUse(bot, 4);
  sound(bot, "block.enchanting_table.use", mid(at));
  yield* S.wait(30);
  const costs = enchantCosts(bookshelves(bot.entity.dimension, at));
  let slot = -1;
  for (let i = 2; i >= 0; i--) {
    if (bot.level >= costs[i] && Inv.count(bot, m("lapis_lazuli")) >= i + 1) {
      slot = i;
      break;
    }
  }
  B.setUse(bot, 0);
  if (slot < 0) return false;
  // the item may have moved in its pockets while it walked
  const now = where(bot, (it) => it.typeId === target.item.typeId && !enchants(it).length)[0];
  if (!now) return false;
  const it = now.item;
  const list = rollEnchants(it.typeId, costs[slot]);
  if (!applyEnchants(it, list)) return false;
  putBack(bot, now.slot, it);
  Inv.take(bot, m("lapis_lazuli"), slot + 1);
  B.spendLevels(bot, slot + 1);
  B.swing(bot);
  sound(bot, "random.levelup", mid(at), 1.6);
  try {
    bot.entity.dimension.spawnParticle("minecraft:enchanting_table_particle", { x: at.x + 0.5, y: at.y + 1.2, z: at.z + 0.5 });
  } catch {
    /* ignore */
  }
  bot.stats.enchants++;
  bot.events.push({ kind: "enchanted", id: it.typeId, list, at: system.currentTick });
  return true;
}

// ---------------------------------------------------------------- the anvil
/** How many times a stack has been worked at an anvil (its cost goes up each time). @param {ItemStack} it */
function workCount(it) {
  try {
    return Number(it.getDynamicProperty("zt:work") ?? 0);
  } catch {
    return 0;
  }
}
/** @param {ItemStack} it @param {number} n */
function setWork(it, n) {
  try {
    it.setDynamicProperty("zt:work", n);
  } catch {
    /* stackable: no work count */
  }
}
const penalty = (n) => 2 ** n - 1;
/** @param {ItemStack} it */
function durability(it) {
  try {
    return it.getComponent("minecraft:durability");
  } catch {
    return undefined;
  }
}

/** The anvil wears with use, 12% of the time: undamaged, chipped, damaged, gone. @param {any} bot @param {Vector3} at */
function wearAnvil(bot, at) {
  if (Math.random() >= 0.12) return sound(bot, "random.anvil_use", mid(at));
  const dim = bot.entity.dimension;
  const id = B.idAt(dim, at);
  const next = { "minecraft:anvil": "minecraft:chipped_anvil", "minecraft:chipped_anvil": "minecraft:damaged_anvil" }[id];
  try {
    const b = dim.getBlock(at);
    if (!b) return;
    if (!next) {
      // older worlds keep the damage in a state
      const state = /** @type {any} */ (b.permutation.getState("damage"));
      const order = ["undamaged", "slightly_damaged", "very_damaged", "broken"];
      if (state !== undefined && order.indexOf(String(state)) < 2) {
        b.setPermutation(b.permutation.withState("damage", order[order.indexOf(String(state)) + 1]));
        return sound(bot, "random.anvil_use", mid(at));
      }
      dim.setBlockType(at, "minecraft:air");
      return sound(bot, "random.anvil_break", mid(at));
    }
    const card = b.permutation.getState("minecraft:cardinal_direction");
    b.setType(next);
    if (card !== undefined) b.setPermutation(b.permutation.withState("minecraft:cardinal_direction", card));
  } catch {
    /* ignore */
  }
  sound(bot, "random.anvil_use", mid(at));
}

/**
 * Repair something at an anvil: with the material it's made of (a quarter of its durability
 * each), or another of the same (their durability together, plus a bit, enchantments merged).
 * Costs levels, more each time a thing is worked; 40 or more is "Too Expensive!".
 * @param {any} bot @param {(it: ItemStack) => boolean} [which]
 */
export function* anvilRepair(bot, which) {
  const worn = where(bot, (it) => {
    const d = durability(it);
    return !!d && d.damage > d.maxDurability * 0.4 && (!which || which(it));
  }).sort((a, b) => enchants(b.item).length - enchants(a.item).length);
  for (const w of worn) {
    const id = w.item.typeId;
    const mat = D.repairMaterial(id);
    const same = () => where(bot, (x) => x.typeId === id && !!durability(x)).sort((a, b) => durability(b.item).damage - durability(a.item).damage);
    const pair = same();
    const d = durability(pair[0].item);
    const units = mat ? Math.min(Inv.count(bot, mat), Math.ceil(d.damage / (d.maxDurability * 0.25))) : 0;
    const twin = pair[1];
    if (!units && !twin) continue;
    const cost = (units || 2 + enchants(twin.item).reduce((s, e) => s + e.level, 0)) + penalty(workCount(pair[0].item)) +
      (units ? 0 : penalty(workCount(twin.item)));
    if (cost >= 40 || bot.level < cost) continue;
    const at = yield* atStation(bot, m("anvil"));
    if (!at) return false;
    G.doing(bot, "fixing its " + G.nice(id) + " at an anvil");
    B.setUse(bot, 4);
    yield* S.wait(30);
    B.setUse(bot, 0);
    const now = same();
    if (!now.length || (!units && now.length < 2)) return false;
    const here = now[0];
    const fix = here.item;
    const fd = durability(fix);
    if (units) {
      if (Inv.count(bot, mat) < units) return false;
      fd.damage = Math.max(0, fd.damage - Math.floor(fd.maxDurability * 0.25) * units);
      Inv.take(bot, mat, units);
    } else {
      const other = now[1];
      const od = durability(other.item);
      const left = fd.maxDurability - fd.damage + (od.maxDurability - od.damage) + Math.floor(fd.maxDurability * 0.12);
      fd.damage = Math.max(0, fd.maxDurability - left);
      // enchantments merge: the higher level, or one more when they match
      const mine = new Map(enchants(fix).map((e) => [enchName(e), e.level]));
      /** @type {Array<[string, number]>} */
      const add = [];
      for (const e of enchants(other.item)) {
        const name = enchName(e);
        if ([...mine.keys()].some((k) => k !== name && clash(k, name))) continue;
        const have = mine.get(name) ?? 0;
        add.push([name, have === e.level ? e.level + 1 : Math.max(have, e.level)]);
      }
      applyEnchants(fix, add);
      putBack(bot, other.slot, undefined);
    }
    setWork(fix, workCount(fix) + 1);
    putBack(bot, here.slot, fix);
    B.spendLevels(bot, cost);
    B.swing(bot);
    wearAnvil(bot, at);
    return true;
  }
  return false;
}

/** Name its best sword at an anvil (one level), as players like to. @param {any} bot @param {string} name */
export function* anvilName(bot, name) {
  const s = where(bot, (it) => D.toolInfo(it.typeId).type === "sword" && !it.nameTag)[0];
  if (!s || bot.level < 1) return false;
  const at = yield* atStation(bot, m("anvil"));
  if (!at) return false;
  B.setUse(bot, 4);
  yield* S.wait(40);
  B.setUse(bot, 0);
  const now = where(bot, (it) => it.typeId === s.item.typeId && !it.nameTag)[0];
  if (!now) return false;
  now.item.nameTag = name;
  setWork(now.item, workCount(now.item) + 1);
  putBack(bot, now.slot, now.item);
  B.spendLevels(bot, 1);
  wearAnvil(bot, at);
  return true;
}

// ---------------------------------------------------------------- smithing, grinding, cutting stone
/** A copy of a stack as another item, keeping its enchantments, wear and name. @param {ItemStack} from @param {string} id */
function remake(from, id) {
  const out = new ItemStack(id, 1);
  const list = enchants(from).map((e) => /** @type {[string, number]} */ ([enchName(e), e.level]));
  applyEnchants(out, list);
  const a = durability(from);
  const b = durability(out);
  if (a && b) b.damage = Math.min(b.maxDurability - 1, a.damage);
  if (from.nameTag) out.nameTag = from.nameTag;
  return out;
}

/**
 * Upgrade diamond gear to netherite at a smithing table: the gear, a netherite ingot and a
 * netherite upgrade template (it keeps its enchantments and wear).
 * @param {any} bot
 */
export function* smithNetherite(bot) {
  const tpl = m("netherite_upgrade_smithing_template");
  if (!Inv.has(bot, tpl) || !Inv.has(bot, m("netherite_ingot"))) return false;
  const order = ["sword", "pickaxe", "chestplate", "leggings", "helmet", "boots", "axe", "shovel", "hoe"];
  const gear = where(bot, (it) => !!D.NETHERITE_UPGRADES[it.typeId])
    .sort((a, b) => order.indexOf(D.enchantKind(a.item.typeId) ?? "") - order.indexOf(D.enchantKind(b.item.typeId) ?? ""))[0];
  if (!gear) return false;
  const at = yield* atStation(bot, m("smithing_table"), { make: true });
  if (!at) return false;
  G.doing(bot, "upgrading its " + G.nice(gear.item.typeId) + " to netherite");
  B.setUse(bot, 4);
  yield* S.wait(40);
  B.setUse(bot, 0);
  const now = where(bot, (it) => it.typeId === gear.item.typeId)[0];
  if (!now || !Inv.has(bot, tpl) || !Inv.has(bot, m("netherite_ingot"))) return false;
  const out = remake(now.item, D.NETHERITE_UPGRADES[now.item.typeId]);
  putBack(bot, now.slot, out);
  Inv.take(bot, tpl, 1);
  Inv.take(bot, m("netherite_ingot"), 1);
  sound(bot, "smithing_table.use", mid(at));
  B.swing(bot);
  bot.events.push({ kind: "netherite", id: out.typeId, at: system.currentTick });
  return true;
}

/**
 * At a grindstone: two worn tools of a kind become one (their durability together, plus 5%),
 * or enchantments it doesn't want come off for a little experience.
 * @param {any} bot
 */
export function* grind(bot) {
  /** @type {any} */
  let pair;
  const tools = where(bot, (it) => !!durability(it) && !enchants(it).length && D.toolInfo(it.typeId).type !== "hand");
  for (const a of tools) {
    const b = tools.find((x) => x !== a && x.item.typeId === a.item.typeId);
    if (!b) continue;
    const da = durability(a.item);
    const db = durability(b.item);
    if (da.damage + db.damage > da.maxDurability * 0.9) {
      pair = [a, b];
      break;
    }
  }
  if (!pair) return false;
  const at = yield* atStation(bot, m("grindstone"));
  if (!at) return false;
  G.doing(bot, "grinding two old " + G.nice(pair[0].item.typeId) + "s into one");
  B.setUse(bot, 4);
  sound(bot, "block.grindstone.use", mid(at));
  yield* S.wait(30);
  B.setUse(bot, 0);
  const [a, b] = pair;
  const da = durability(a.item);
  const db = durability(b.item);
  const left = da.maxDurability - da.damage + (db.maxDurability - db.damage) + Math.floor(da.maxDurability * 0.05);
  const out = new ItemStack(a.item.typeId, 1);
  durability(out).damage = Math.max(0, da.maxDurability - left);
  putBack(bot, b.slot, undefined);
  putBack(bot, a.slot, out);
  B.swing(bot);
  return true;
}

/** What a stonecutter makes from a block (output -> how many per block). */
export const STONECUT = {
  "minecraft:stone": { "minecraft:stone_bricks": 1, "minecraft:stone_brick_stairs": 1, "minecraft:chiseled_stone_bricks": 1, "minecraft:normal_stone_stairs": 1 },
  "minecraft:cobblestone": { "minecraft:stone_stairs": 1, "minecraft:cobblestone_wall": 1 },
  "minecraft:stone_bricks": { "minecraft:stone_brick_stairs": 1, "minecraft:chiseled_stone_bricks": 1 },
  "minecraft:sandstone": { "minecraft:cut_sandstone": 1, "minecraft:chiseled_sandstone": 1 },
  "minecraft:deepslate": {},
  "minecraft:cobbled_deepslate": { "minecraft:polished_deepslate": 1, "minecraft:deepslate_bricks": 1, "minecraft:deepslate_tiles": 1 },
};
/**
 * Cut stone into other shapes at a stonecutter (one for one, cheaper than crafting).
 * @param {any} bot @param {string} from @param {string} to @param {number} n
 */
export function* stonecut(bot, from, to, n) {
  const per = STONECUT[from]?.[to];
  if (!per) return false;
  try {
    new ItemStack(to, 1);
  } catch {
    return false;
  }
  const blocks = Math.min(Inv.count(bot, from), Math.ceil(n / per));
  if (!blocks) return false;
  const at = yield* atStation(bot, m("stonecutter_block"));
  if (!at) return false;
  B.setUse(bot, 4);
  for (let i = 0; i < Math.min(blocks, 8); i++) {
    sound(bot, "block.stonecutter.use", mid(at), 0.9 + Math.random() * 0.2);
    yield* S.wait(6);
  }
  B.setUse(bot, 0);
  const k = Inv.take(bot, from, blocks);
  let total = k * per;
  while (total > 0) {
    const s = Math.min(64, total);
    Inv.add(bot, new ItemStack(to, s));
    total -= s;
  }
  return true;
}

// ---------------------------------------------------------------- potions
/** What kind a potion stack is (it remembers what it brewed). @param {ItemStack} it */
export function potionKind(it) {
  if (it.typeId !== m("potion")) return undefined;
  try {
    return String(it.getDynamicProperty("zt:potion") ?? "") || undefined;
  } catch {
    return undefined;
  }
}
/** Potions it carries, by kind. @param {any} bot */
export function potions(bot) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const { item } of Inv.stacks(bot)) {
    const k = potionKind(item);
    if (k) out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
/** @param {any} bot @param {string} kind */
export function hasPotion(bot, kind) {
  return (potions(bot)[kind] ?? 0) > 0;
}

/**
 * Drink a potion it knows (1.6 seconds, as players drink): the effect, and the empty bottle back.
 * @param {any} bot @param {string} kind a key of D.POTIONS
 */
export function* drink(bot, kind) {
  const p = D.POTIONS[kind];
  if (!p) return false;
  const slot = slotOf(bot, (it) => potionKind(it) === kind);
  if (slot < 0) return false;
  const c = Inv.container(bot);
  const cur = Inv.held(bot);
  const bottle = c.getItem(slot);
  c.setItem(slot, cur);
  Inv.setEquip(bot, "Mainhand", bottle);
  B.stop(bot);
  B.setUse(bot, 1);
  const dim = bot.entity.dimension;
  for (let t = 0; t < 32; t++) {
    if (t % 6 === 0) sound(bot, "random.drink", bot.entity.location, 0.9 + Math.random() * 0.2);
    yield;
  }
  B.setUse(bot, 0);
  const now = Inv.held(bot);
  if (!now || potionKind(now) !== kind) return false;
  Inv.setEquip(bot, "Mainhand", new ItemStack(m("glass_bottle"), 1));
  try {
    if (p.effect === "instant_health") B.heal(bot, 4);
    else bot.entity.addEffect(p.effect, p.ticks, { amplifier: p.amp, showParticles: true });
  } catch {
    /* ignore */
  }
  try {
    dim.spawnParticle("minecraft:splash_spell_emitter", bot.entity.location);
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * Fill glass bottles with water at a water source (or a cauldron).
 * @param {any} bot @param {number} n
 */
export function* fillBottles(bot, n) {
  const dim = bot.entity.dimension;
  const have = () => Inv.count(bot, (id) => id === m("potion"));
  const water = S.findBlocks(dim, bot.entity.location, ["minecraft:water", "minecraft:cauldron"], 24, 8).filter((p) => {
    const b = B.blockAt(dim, p);
    if (b?.typeId !== "minecraft:cauldron") return true;
    try {
      return Number(b.permutation.getState("fill_level") ?? 0) > 0 && String(b.permutation.getState("cauldron_liquid") ?? "water") === "water";
    } catch {
      return false;
    }
  });
  for (const p of water.slice(0, 4)) {
    if (!(yield* S.goTo(bot, { ...p, r: 3 }, { tries: 2, maxNodes: 1500 }))) continue;
    B.lookAt(bot, mid(p), 20, 4);
    yield* S.wait(5);
    let filled = 0;
    while (filled < n && Inv.has(bot, m("glass_bottle"))) {
      Inv.take(bot, m("glass_bottle"), 1);
      const pot = new ItemStack(m("potion"), 1);
      try {
        pot.setDynamicProperty("zt:potion", "water");
      } catch {
        /* ignore */
      }
      Inv.add(bot, pot);
      sound(bot, "bottle.fill", mid(p));
      B.swing(bot);
      filled++;
      yield* S.wait(4);
    }
    if (have() >= n || !Inv.has(bot, m("glass_bottle"))) return have() > 0;
  }
  return have() > 0;
}

/**
 * Brew potions at a real brewing stand: water bottles in, nether wart for an awkward potion,
 * then the ingredient; blaze powder is the fuel. It waits by the stand while it brews.
 * @param {any} bot @param {string} kind a key of D.POTIONS @param {number} [n] bottles (1-3)
 */
export function* brew(bot, kind, n = 3) {
  const p = D.POTIONS[kind];
  if (!p) return false;
  G.doing(bot, "brewing " + p.name.toLowerCase() + "s");
  const isWater = (it) => potionKind(it) === "water";
  const waters = () => where(bot, isWater).length;
  if (waters() < n) {
    if (Inv.count(bot, m("glass_bottle")) < n - waters() && !(yield* G.obtain(bot, m("glass_bottle"), n - waters()))) return false;
    if (!(yield* fillBottles(bot, n - waters()))) return false;
  }
  for (const [id, k] of /** @type {Array<[string, number]>} */ ([[m("nether_wart"), 1], [m(p.ingredient), 1], [m("blaze_powder"), 1]])) {
    if (!Inv.has(bot, id, k) && !(yield* G.obtain(bot, id, k))) return false;
  }
  const at = yield* atStation(bot, m("brewing_stand"), { make: true });
  if (!at) return false;
  const dim = bot.entity.dimension;
  const stand = () => {
    try {
      return dim.getBlock(at)?.getComponent("minecraft:inventory")?.container;
    } catch {
      return undefined;
    }
  };
  let c = stand();
  if (!c) return false;
  // empty it of anything left in it
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    if (it && !(i === 4 && it.typeId === m("blaze_powder"))) {
      c.setItem(i, undefined);
      Inv.add(bot, it);
    }
  }
  B.setUse(bot, 4);
  if (!c.getItem(4)) {
    Inv.take(bot, m("blaze_powder"), 1);
    c.setItem(4, new ItemStack(m("blaze_powder"), 1));
  }
  let put = 0;
  for (let i = 1; i <= 3 && put < n; i++) {
    const s = slotOf(bot, isWater);
    if (s < 0) break;
    const it = Inv.container(bot).getItem(s);
    Inv.container(bot).setItem(s, undefined);
    c.setItem(i, it);
    put++;
  }
  /** Put an ingredient in and wait for the stand to use it up. @param {string} id */
  const step = function* (id) {
    Inv.take(bot, id, 1);
    c.setItem(0, new ItemStack(id, 1));
    sound(bot, "random.pop", mid(at), 0.8);
    for (let t = 0; t < 520; t++) {
      c = stand();
      if (!c) return false;
      if (!c.getItem(0)) return true;
      if (t % 80 === 0) B.lookAt(bot, mid(at), 30, 2);
      yield;
    }
    return false;
  };
  B.setUse(bot, 0);
  const ok = (yield* step(m("nether_wart"))) && (yield* step(m(p.ingredient)));
  c = stand();
  if (!c) return false;
  B.lookAt(bot, mid(at), 20, 3);
  yield* S.wait(6);
  let got = 0;
  for (let i = 1; i <= 3; i++) {
    const it = c.getItem(i);
    if (!it) continue;
    c.setItem(i, undefined);
    try {
      it.setDynamicProperty("zt:potion", ok ? kind : "water");
    } catch {
      /* ignore */
    }
    Inv.add(bot, it);
    if (ok) got++;
  }
  B.swing(bot);
  if (got) bot.events.push({ kind: "brewed", potion: kind, n: got, at: system.currentTick });
  return got > 0;
}

// ---------------------------------------------------------------- composter, bell
/** Things that go in a composter, and their chance to raise its level. */
const COMPOST = { "minecraft:wheat_seeds": 0.3, "minecraft:beetroot_seeds": 0.3, "minecraft:short_grass": 0.3, "minecraft:kelp": 0.3,
  "minecraft:sweet_berries": 0.3, "minecraft:oak_sapling": 0.3, "minecraft:spruce_sapling": 0.3, "minecraft:birch_sapling": 0.3,
  "minecraft:oak_leaves": 0.3, "minecraft:dandelion": 0.65, "minecraft:poppy": 0.65, "minecraft:apple": 0.65, "minecraft:carrot": 0.65,
  "minecraft:potato": 0.65, "minecraft:melon_slice": 0.5, "minecraft:sugar_cane": 0.5, "minecraft:bread": 0.85, "minecraft:cactus": 0.5 };
/** @param {string} id */
function compostChance(id) {
  try {
    const c = new ItemStack(id, 1).getComponent("minecraft:compostable");
    if (c) return c.compostingChance;
  } catch {
    /* use the table */
  }
  return COMPOST[id] ?? 0;
}
/**
 * Put spare seeds and saplings in a composter (one at a village farm, or its own), and take
 * the bone meal when it's full.
 * @param {any} bot
 */
export function* compost(bot) {
  const junk = Inv.idsOf(bot, (id) => compostChance(id) > 0 && /seeds|sapling|short_grass|kelp|leaves|dandelion|poppy/.test(id));
  if (!junk.length) return false;
  const at = yield* atStation(bot, m("composter"));
  if (!at) return false;
  G.doing(bot, "composting");
  const dim = bot.entity.dimension;
  const block = () => dim.getBlock(at);
  for (const id of junk) {
    while (Inv.has(bot, id)) {
      const b = block();
      if (!b || b.typeId !== m("composter")) return false;
      let lvl = Number(b.permutation.getState("composter_fill_level") ?? 0);
      if (lvl >= 7) break;
      Inv.take(bot, id, 1);
      B.swing(bot);
      if (Math.random() < compostChance(id)) {
        lvl++;
        b.setPermutation(b.permutation.withState("composter_fill_level", lvl));
        sound(bot, "block.composter.fill_success", mid(at));
      } else sound(bot, "block.composter.fill", mid(at));
      yield* S.wait(5);
    }
  }
  const b = block();
  if (b && Number(b.permutation.getState("composter_fill_level") ?? 0) >= 7) {
    yield* S.wait(20);
    sound(bot, "block.composter.ready", mid(at));
    yield* S.wait(10);
    b.setPermutation(b.permutation.withState("composter_fill_level", 0));
    Inv.add(bot, new ItemStack(m("bone_meal"), 1));
    sound(bot, "block.composter.empty", mid(at));
  }
  return true;
}

/** Ring a village bell it walks past (once in a while). @param {any} bot */
export function* ringBell(bot) {
  const p = S.findBlocks(bot.entity.dimension, bot.entity.location, [m("bell")], 8, 4)[0];
  if (!p) return false;
  if (!(yield* S.goTo(bot, { ...p, r: 2.5 }, { tries: 1, maxNodes: 600, noBuild: true }))) return false;
  B.lookAt(bot, mid(p), 20, 3);
  yield* S.wait(6);
  B.swing(bot);
  sound(bot, "block.bell.hit", mid(p));
  return true;
}

// ---------------------------------------------------------------- villagers
/** villager id -> {trades, uses: {i: n}, day} */
const villagerMemory = new Map();
/** Its profession ("farmer", "cleric"...). @param {Entity} v */
export function profession(v) {
  try {
    return D.PROFESSIONS[v.getComponent("minecraft:variant")?.value ?? 0] ?? "unskilled";
  } catch {
    return "unskilled";
  }
}
/** @param {Entity} v */
function memoryOf(v) {
  const day = Math.floor(world.getAbsoluteTime() / 24000);
  let mem = villagerMemory.get(v.id);
  if (!mem) {
    // how much it has traded stays with the villager (its level)
    let trades = 0;
    try {
      trades = Number(v.getDynamicProperty("zt:trades") ?? 0);
    } catch {
      trades = 0;
    }
    mem = { trades, uses: {}, day };
    villagerMemory.set(v.id, mem);
  }
  // villagers restock at their job sites during the day
  if (mem.day !== day) {
    mem.uses = {};
    mem.day = day;
  }
  return mem;
}
/** The villager's level (0 novice .. 4 master), from how much it has traded. @param {Entity} v */
export function villagerLevel(v) {
  return Math.min(4, Math.floor(memoryOf(v).trades / 5));
}
/**
 * Offers a villager has open right now (its level unlocks them; each sells out after 12 uses
 * until it restocks), with their index.
 * @param {Entity} v
 */
export function offers(v) {
  const list = D.TRADES[profession(v)] ?? [];
  const lvl = villagerLevel(v);
  const mem = memoryOf(v);
  return list.map((o, i) => ({ ...o, i })).filter((o) => o.t <= lvl && (mem.uses[o.i] ?? 0) < 12);
}
/** Villagers about (adults with a trade). @param {any} bot @param {number} [r] */
export function villagersNear(bot, r = 48) {
  try {
    return bot.entity.dimension.getEntities({ type: "minecraft:villager_v2", location: bot.entity.location, maxDistance: r })
      .filter((v) => {
        try {
          return !v.getComponent("minecraft:is_baby") && D.TRADES[profession(v)];
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

/**
 * Trade with a villager: walk up, open its trades (it haggles), hand over what the offer wants,
 * get what it gives, as many times as asked and it has stock. Experience for each trade.
 * @param {any} bot @param {Entity} v @param {number} index the offer's index in D.TRADES @param {number} [times]
 */
export function* trade(bot, v, index, times = 1) {
  const o = (D.TRADES[profession(v)] ?? [])[index];
  if (!o) return 0;
  if (!(yield* S.goTo(bot, { ...B.blockPos(v.location), r: 2 }, { tries: 2, maxNodes: 1200, noBuild: true }))) return 0;
  if (!v.isValid) return 0;
  B.stop(bot);
  B.lookAtEntity(bot, v, 80, 4);
  sound(bot, "mob.villager.haggle", v.location);
  yield* S.wait(20);
  const mem = memoryOf(v);
  let done = 0;
  for (; done < times; done++) {
    if ((mem.uses[index] ?? 0) >= 12 || villagerLevel(v) < o.t) {
      sound(bot, "mob.villager.no", v.location);
      break;
    }
    const [gid, gn] = o.give;
    if (Inv.count(bot, gid) < gn) break;
    Inv.take(bot, gid, gn);
    const [rid, rn] = o.get;
    Inv.add(bot, new ItemStack(m(rid), rn));
    mem.uses[index] = (mem.uses[index] ?? 0) + 1;
    mem.trades++;
    try {
      v.setDynamicProperty("zt:trades", mem.trades);
    } catch {
      /* ignore */
    }
    B.addXp(bot, 3 + rand(4));
    bot.stats.trades++;
    sound(bot, "mob.villager.yes", v.location);
    yield* S.wait(8);
  }
  if (done) bot.events.push({ kind: "traded", villager: profession(v), give: o.give, get: o.get, n: done, at: system.currentTick });
  return done;
}

/** Things it would happily sell (it has plenty and doesn't need them). */
const SELLABLE = { rotten_flesh: 8, coal: 24, stick: 16, wheat: 0, potato: 8, carrot: 8, string: 8, paper: 0, flint: 4, feather: 8,
  leather: 6, white_wool: 4, clay_ball: 0, stone: 64, gold_ingot: 12, chicken: 0, porkchop: 4, beef: 4, mutton: 4, glass_bottle: 3,
  nether_wart: 4, iron_ingot: 30, diamond: 12, glass_pane: 0, book: 4, pumpkin: 0, melon_block: 0, beetroot: 0, cod: 0 };
/**
 * Trade with the villagers about for what it wants: sell spare things for emeralds, then buy.
 * wants: item ids it would like, most wanted first. Returns what it bought.
 * @param {any} bot @param {string[]} wants
 */
export function* tradeFor(bot, wants) {
  const vs = villagersNear(bot);
  if (!vs.length) return [];
  G.doing(bot, "trading with villagers");
  const bought = [];
  for (const want of wants) {
    const id = D.bare(m(want));
    const seller = vs.map((v) => ({ v, o: offers(v).find((o) => o.get[0] === id && o.give[0] === "emerald") })).find((x) => x.o);
    if (!seller) continue;
    const price = seller.o.give[1];
    // emeralds first: sell what it can spare to anyone who buys it
    for (const v of vs) {
      if (Inv.count(bot, m("emerald")) >= price) break;
      for (const o of offers(v)) {
        if (o.get[0] !== "emerald") continue;
        const spare = Inv.count(bot, m(o.give[0])) - (SELLABLE[o.give[0]] ?? Infinity);
        if (spare < o.give[1]) continue;
        yield* trade(bot, v, o.i, Math.min(Math.floor(spare / o.give[1]), price - Inv.count(bot, m("emerald")) + 1));
        if (Inv.count(bot, m("emerald")) >= price) break;
      }
    }
    if (Inv.count(bot, m("emerald")) < price) continue;
    const k = yield* trade(bot, seller.v, seller.o.i, Math.floor(Inv.count(bot, m("emerald")) / price));
    if (k) bought.push([m(id), k * seller.o.get[1]]);
  }
  return bought;
}

// ---------------------------------------------------------------- piglins
/**
 * Barter with piglins: toss them gold ingots and pick up what they throw back (ender pearls,
 * string, obsidian, fire resistance potions...). It wears gold so they stay calm.
 * @param {any} bot @param {number} ingots
 */
export function* barter(bot, ingots) {
  const e = bot.entity;
  if (e.dimension.id !== "minecraft:nether" || !Inv.has(bot, m("gold_ingot"))) return 0;
  let piglins = [];
  try {
    piglins = e.dimension.getEntities({ type: "minecraft:piglin", location: e.location, maxDistance: 32 })
      .filter((p) => !p.getComponent("minecraft:is_baby"));
  } catch {
    return 0;
  }
  if (!piglins.length) return 0;
  G.doing(bot, "bartering with piglins");
  const p = piglins[0];
  if (!(yield* S.goTo(bot, { ...B.blockPos(p.location), r: 3 }, { tries: 2, maxNodes: 1200, noBuild: true }))) return 0;
  let given = 0;
  for (; given < ingots && Inv.has(bot, m("gold_ingot")) && p.isValid; given++) {
    B.lookAtEntity(bot, p, 20, 4);
    yield* S.wait(6);
    Inv.take(bot, m("gold_ingot"), 1);
    // tossed straight to it: piglins pick gold up off the ground
    try {
      const ent = e.dimension.spawnItem(new ItemStack(m("gold_ingot"), 1), { ...p.location, y: p.location.y + 0.5 });
      if (ent?.id) bot.tossed.set(ent.id, system.currentTick + 2400);
    } catch {
      break;
    }
    B.swing(bot);
    // each one takes it six seconds to look at
    yield* S.wait(130);
    yield* S.collect(bot, p.isValid ? p.location : e.location, 6, 50);
  }
  // potions from a barter are fire resistance
  for (const { item, slot } of Inv.stacks(bot)) {
    if (item.typeId === m("potion") && !potionKind(item)) {
      try {
        item.setDynamicProperty("zt:potion", "fire_resistance");
        putBack(bot, slot, item);
      } catch {
        /* ignore */
      }
    }
  }
  return given;
}
