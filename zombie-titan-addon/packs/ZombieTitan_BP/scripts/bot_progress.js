// A Player's way through the game, the way players go: wood and a crafting table, stone tools,
// food, a furnace and torches, a bed and a house, iron tools, a shield, a bucket, iron armour,
// a bow and arrows, diamonds, a Nether portal, blaze rods from a fortress, ender pearls, eyes of
// ender, a stronghold, the dragon; then a better life (enchanting, potions, netherite).
// Each step says when it's needed; the brain runs the first one that is (a step that fails
// waits a while before it's tried again, so a Player stuck on one thing gets on with others).
import { system } from "@minecraft/server";
import * as B from "./bot_body.js";
import * as Build from "./bot_build.js";
import * as D from "./bot_data.js";
import * as End from "./bot_end.js";
import * as G from "./bot_gather.js";
import * as Inv from "./bot_inv.js";
import * as N from "./bot_nether.js";
import * as St from "./bot_stations.js";
import * as W from "./bot_world.js";

const m = D.mc;
const OW = "minecraft:overworld";

/** Its best sword's tier (0 none, 1 wood or gold, 2 stone, 3 iron, 4 diamond, 5 netherite). @param {any} bot */
export function swordTier(bot) {
  let t = 0;
  for (const { item } of Inv.stacks(bot)) {
    const i = D.toolInfo(item.typeId);
    if (i.type === "sword") t = Math.max(t, i.tier);
  }
  return t;
}
/** Has it this kind of tool (any tier)? @param {any} bot @param {string} type */
function hasTool(bot, type) {
  return Inv.stacks(bot).some(({ item }) => D.toolInfo(item.typeId).type === type);
}
/** Pieces of armour of iron or better it has (worn or carried), by slot. @param {any} bot */
function goodArmor(bot) {
  const have = new Set();
  for (const { item } of Inv.stacks(bot)) {
    const a = D.armorInfo(item.typeId);
    if (a && /iron|diamond|netherite/.test(a.material)) have.add(a.slot);
  }
  return have;
}
/** Food it'd eat (not rotten, not raw). @param {any} bot */
export function foodCount(bot) {
  return Inv.count(bot, (id) => !!D.FOOD[D.bare(id)] && !D.BAD_FOOD.has(D.bare(id)) && !/^minecraft:(beef|porkchop|mutton|rabbit|cod|salmon|potato)$/.test(id));
}
/** Does it have something at home, or carry one? @param {any} bot @param {string} id */
function hasOrHome(bot, id) {
  return Inv.has(bot, id) || !!bot.home?.stations?.[D.bare(id)];
}
/** Still on its way to the dragon (it's alive, and this one hasn't beaten it). @param {any} bot */
function toTheEnd(bot) {
  return !bot.progress.dragon && !End.dragonDead();
}
/** Eyes it could have: eyes, plus pearls with blaze powder (or rods) to make them. @param {any} bot */
function eyesPossible(bot) {
  const powder = Inv.count(bot, m("blaze_powder")) + Inv.count(bot, m("blaze_rod")) * 2;
  return Inv.count(bot, m("ender_eye")) + Math.min(Inv.count(bot, m("ender_pearl")), powder);
}
/** Eyes it needs for the portal (fewer if the frame it knows already has some). @param {any} bot */
function eyesWanted(bot) {
  return bot.known.eyesNeeded ?? 12;
}

/**
 * Pearls: buy them from a cleric if one's about, hunt endermen at night, or barter gold with
 * piglins in the Nether.
 * @param {any} bot @param {number} n
 */
function* getPearls(bot, n) {
  G.doing(bot, "getting ender pearls");
  if (St.villagersNear(bot).length) {
    yield* St.tradeFor(bot, [m("ender_pearl")]);
    if (Inv.count(bot, m("ender_pearl")) >= n) return true;
  }
  // endermen come out at night, and in the Nether's warped forests
  if (yield* G.hunt(bot, [m("enderman")], m("ender_pearl"), n, { deadline: system.currentTick + 6000 })) return true;
  if (Inv.count(bot, m("gold_ingot")) >= 8 && bot.known.portal) {
    return yield* N.netherTrip(bot, { [m("ender_pearl")]: n });
  }
  return Inv.count(bot, m("ender_pearl")) >= n;
}

/**
 * Get ready for the End: plenty of blocks to build with, food, arrows.
 * @param {any} bot
 */
function* prepare(bot) {
  G.doing(bot, "getting ready for the End");
  if (!(yield* G.obtain(bot, m("cobblestone"), 96))) return false;
  if (foodCount(bot) < 12 && !(yield* G.getFood(bot, 14, {}))) return false;
  if (Inv.count(bot, m("arrow")) < 32) yield* G.obtain(bot, m("arrow"), 48);
  return true;
}

/**
 * @typedef {{id: string, say: string, need: (bot: any) => boolean, go: (bot: any) => Generator<undefined, boolean>, cool?: number, nether?: boolean}} Step
 * @type {Step[]}
 */
export const STEPS = [
  { id: "wood", say: "getting wood", need: (b) => G.pickTier(b) < 1, go: (b) => G.obtain(b, m("wooden_pickaxe")) },
  { id: "table", say: "making a crafting table", need: (b) => !b.home && !Inv.has(b, m("crafting_table")), go: (b) => G.obtain(b, m("crafting_table")) },
  { id: "stone", say: "getting stone tools", need: (b) => G.pickTier(b) < 2, go: (b) => G.obtain(b, m("stone_pickaxe")) },
  { id: "sword", say: "making a sword", need: (b) => swordTier(b) < 2, go: (b) => G.obtain(b, m("stone_sword")) },
  { id: "axe", say: "making an axe", need: (b) => !hasTool(b, "axe"), go: (b) => G.obtain(b, m("stone_axe")), cool: 6000 },
  { id: "food", say: "getting food", need: (b) => foodCount(b) < 5, go: (b) => G.getFood(b, 10, {}) },
  { id: "furnace", say: "making a furnace", need: (b) => !hasOrHome(b, m("furnace")), go: (b) => G.obtain(b, m("furnace")) },
  { id: "torches", say: "making torches", need: (b) => Inv.count(b, m("torch")) < 8, go: (b) => G.obtain(b, m("torch"), 20), cool: 4800 },
  { id: "bed", say: "making a bed", need: (b) => !b.home && !Inv.has(b, (id) => /bed$/.test(id)), go: (b) => G.obtain(b, m("bed")), cool: 4800 },
  { id: "home", say: "building a house", need: (b) => !b.home && b.world.build, go: (b) => Build.buildHome(b), cool: 4800 },
  { id: "iron", say: "getting iron", need: (b) => G.pickTier(b) < 3, go: (b) => G.obtain(b, m("iron_pickaxe")) },
  { id: "iron_sword", say: "making an iron sword", need: (b) => swordTier(b) < 3, go: (b) => G.obtain(b, m("iron_sword")) },
  { id: "shield", say: "making a shield", need: (b) => !Inv.has(b, m("shield")), go: (b) => G.obtain(b, m("shield")) },
  { id: "bucket", say: "making a bucket", need: (b) => !Inv.has(b, m("water_bucket")) && !Inv.has(b, m("bucket")), go: (b) => G.obtain(b, m("water_bucket")) },
  {
    id: "armor", say: "making iron armour", need: (b) => goodArmor(b).size < 4,
    go: function* (b) {
      const have = goodArmor(b);
      for (const part of ["chestplate", "leggings", "helmet", "boots"]) {
        if (have.has(part)) continue;
        const ok = yield* G.obtain(b, m("iron_" + part));
        if (ok) Inv.equipArmor(b);
        return ok;
      }
      return true;
    },
  },
  { id: "bow", say: "making a bow", need: (b) => !Inv.has(b, m("bow")), go: (b) => G.obtain(b, m("bow")), cool: 6000 },
  { id: "arrows", say: "making arrows", need: (b) => Inv.has(b, m("bow")) && Inv.count(b, m("arrow")) < 24, go: (b) => G.obtain(b, m("arrow"), 48), cool: 6000 },
  { id: "diamonds", say: "mining for diamonds", need: (b) => G.pickTier(b) < 4, go: (b) => G.obtain(b, m("diamond_pickaxe")) },
  { id: "diamond_sword", say: "making a diamond sword", need: (b) => swordTier(b) < 4, go: (b) => G.obtain(b, m("diamond_sword")), cool: 6000 },
  {
    id: "portal", say: "building a Nether portal", need: (b) => !b.known.portal && !W.recall("portal", OW, b.entity.location).length,
    go: (b) => Build.buildPortal(b),
  },
  {
    id: "gold", say: "getting gold for the piglins", need: (b) => !Inv.has(b, (id) => /^minecraft:golden_(helmet|chestplate|leggings|boots)$/.test(id)),
    go: (b) => G.obtain(b, m("golden_boots")), cool: 12000,
  },
  {
    id: "blaze", say: "going to the Nether for blaze rods", nether: true,
    need: (b) => toTheEnd(b) && Inv.count(b, m("blaze_rod")) * 2 + Inv.count(b, m("blaze_powder")) + Inv.count(b, m("ender_eye")) < eyesWanted(b),
    go: (b) => N.netherTrip(b, { [m("blaze_rod")]: Math.ceil((eyesWanted(b) - Inv.count(b, m("ender_eye")) - Inv.count(b, m("blaze_powder"))) / 2) + 1,
      [m("nether_wart")]: 2 }),
  },
  {
    id: "pearls", say: "hunting for ender pearls",
    need: (b) => toTheEnd(b) && Inv.count(b, m("ender_pearl")) + Inv.count(b, m("ender_eye")) < eyesWanted(b),
    go: (b) => getPearls(b, eyesWanted(b) - Inv.count(b, m("ender_eye"))),
  },
  {
    id: "eyes", say: "making eyes of ender", need: (b) => toTheEnd(b) && Inv.count(b, m("ender_eye")) < eyesWanted(b) && eyesPossible(b) > Inv.count(b, m("ender_eye")),
    go: (b) => G.obtain(b, m("ender_eye"), Math.min(eyesWanted(b), eyesPossible(b))),
  },
  { id: "prepare", say: "getting ready for the End", need: (b) => !b.progress.dragon && Inv.count(b, m("cobblestone")) < 64, go: (b) => prepare(b), cool: 6000 },
  {
    id: "stronghold", say: "looking for a stronghold",
    need: (b) => !b.progress.dragon && !End.dragonDead() && !W.recall("stronghold", OW).some((s) => s.room),
    go: (b) => End.findStronghold(b),
  },
  {
    id: "end", say: "going to the End", need: (b) => !b.progress.dragon && !End.dragonDead() && Inv.count(b, m("ender_eye")) >= eyesWanted(b),
    go: (b) => End.toTheEnd(b),
  },
  // the dragon's dead (by its hand or another's): on with life
  { id: "enchant", say: "enchanting its gear", need: (b) => b.level >= 8 && Inv.has(b, m("lapis_lazuli")) && !!b.home?.stations?.enchanting_table, go: (b) => St.enchant(b), cool: 6000 },
  {
    id: "enchanting_table", say: "making an enchanting table", need: (b) => !!b.home && !b.home.stations?.enchanting_table && G.pickTier(b) >= 4 &&
      Inv.count(b, m("diamond")) >= 2 && Inv.count(b, m("obsidian")) >= 4,
    go: function* (b) {
      if (!(yield* G.obtain(b, m("enchanting_table")))) return false;
      return true;
    },
    cool: 12000,
  },
  { id: "netherite", say: "making netherite gear", need: (b) => Inv.has(b, m("netherite_upgrade_smithing_template")) && Inv.has(b, m("netherite_ingot")), go: (b) => St.smithNetherite(b), cool: 6000 },
];

/** The step it should be on (not one resting after a failure). @param {any} bot */
export function nextStep(bot) {
  const now = system.currentTick;
  bot.stepCool ??= {};
  for (const s of STEPS) {
    if ((bot.stepCool[s.id] ?? 0) > now) continue;
    try {
      if (s.need(bot)) return s;
    } catch {
      /* a check that can't be made now */
    }
  }
  return undefined;
}

/**
 * Get on with the game: whatever is next, in the right dimension.
 * @param {any} bot
 */
export function* progressTask(bot) {
  const dim = bot.entity.dimension.id;
  // the End: the dragon, then home (or the cities)
  if (dim === "minecraft:the_end") {
    if (!End.dragonDead()) return yield* End.dragonFight(bot);
    return yield* End.afterDragon(bot);
  }
  const step = nextStep(bot);
  if (dim === "minecraft:nether" && (!step || !step.nether)) return yield* N.goOut(bot);
  if (!step) return false;
  if (bot.progress.stage !== step.id) {
    bot.progress.stage = step.id;
    bot.events.push({ kind: "stage", id: step.id, say: step.say, at: system.currentTick });
  }
  G.doing(bot, step.say);
  let ok = false;
  try {
    ok = yield* step.go(bot);
  } finally {
    const now = system.currentTick;
    bot.stepFails ??= {};
    if (ok) {
      bot.stepFails[step.id] = 0;
      if (!bot.progress.done.includes(step.id)) bot.progress.done.push(step.id);
    } else if (!bot.abort) {
      const fails = (bot.stepFails[step.id] = (bot.stepFails[step.id] ?? 0) + 1);
      bot.stepCool[step.id] = now + Math.min(24000, (step.cool ?? 1200) * fails);
    }
  }
  return ok;
}
