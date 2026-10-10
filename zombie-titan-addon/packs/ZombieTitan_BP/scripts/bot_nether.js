// A trip to the Nether, as players make it: through its portal, out across the Nether to find
// a fortress (its dark brick shows from a distance), blazes at the fortress's spawner for
// their rods, nether wart from its stairwells, gold for the piglins, and home through the
// portal it came by before it runs low on food or health.
import { system } from "@minecraft/server";
import * as B from "./bot_body.js";
import * as D from "./bot_data.js";
import * as G from "./bot_gather.js";
import * as Inv from "./bot_inv.js";
import * as S from "./bot_skills.js";
import * as St from "./bot_stations.js";
import * as T from "./bot_travel.js";
import * as W from "./bot_world.js";
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

const m = D.mc;
const NETHER = "minecraft:nether";
const FORTRESS_BLOCKS = [m("nether_brick"), m("nether_brick_fence"), m("nether_brick_stairs"), m("red_nether_brick")];

/** Time to go home: hungry or badly hurt with nothing to eat. @param {any} bot */
export function shouldLeave(bot) {
  const food = Inv.count(bot, "food");
  if (bot.hunger < 8 && food === 0) return true;
  if (B.health(bot) < 8 && food === 0) return true;
  return false;
}

/** Look about for fortress brick, and remember it. @param {any} bot */
export function spotFortress(bot) {
  const dim = bot.entity.dimension;
  if (dim.id !== NETHER) return undefined;
  const p = S.findBlocks(dim, bot.entity.location, FORTRESS_BLOCKS, 24, 14)[0];
  if (!p) return undefined;
  const f = W.remember("fortress", NETHER, p, {}, 96);
  bot.events.push({ kind: "found_fortress", at: system.currentTick });
  return f;
}

/** Into the Nether by the portal it knows. @param {any} bot */
export function* goIn(bot) {
  if (bot.entity.dimension.id === NETHER) return true;
  if (bot.entity.dimension.id !== "minecraft:overworld") return false;
  const here = bot.entity.location;
  const portal = bot.known.portal?.dim === "minecraft:overworld" ? bot.known.portal.pos : W.recall("portal", "minecraft:overworld", here)[0]?.pos;
  if (!portal) return false;
  G.doing(bot, "going to the Nether");
  if (B.dist(here, portal) > 6 && !(yield* T.travel(bot, portal, { r: 4 }))) return false;
  if (!(yield* T.usePortal(bot, portal))) return false;
  // how to get back
  const back = T.portalHere(bot) ?? B.feet(bot);
  bot.known.netherPortal = { dim: NETHER, pos: back };
  W.remember("portal", NETHER, back, {}, 8);
  bot.events.push({ kind: "entered_nether", at: system.currentTick });
  return true;
}

/** Back to the Overworld through the portal it came in by (or the nearest it knows). @param {any} bot */
export function* goOut(bot) {
  if (bot.entity.dimension.id !== NETHER) return true;
  const here = bot.entity.location;
  const p = bot.known.netherPortal?.pos ?? W.recall("portal", NETHER, here)[0]?.pos;
  if (!p) return false;
  G.doing(bot, "heading back to the portal");
  if (B.dist(here, p) > 6 && !(yield* T.travel(bot, p, { r: 4 }))) return false;
  const ok = yield* T.usePortal(bot, p);
  if (ok) bot.events.push({ kind: "left_nether", at: system.currentTick });
  return ok;
}

/**
 * Wander the Nether in long straight legs (players cross it along one line, so they can find
 * their way back), watching for fortress brick.
 * @param {any} bot
 */
function* searchFortress(bot) {
  G.doing(bot, "looking for a Nether fortress");
  bot.netherDir ??= Math.floor(Math.random() * 4);
  const dirs = [{ x: 0, z: 1 }, { x: 0, z: -1 }, { x: 1, z: 0 }, { x: -1, z: 0 }];
  const start = bot.known.netherPortal?.pos ?? B.feet(bot);
  for (let leg = 0; leg < 8; leg++) {
    if (spotFortress(bot)) return true;
    const d = dirs[bot.netherDir];
    const l = bot.entity.location;
    // never more than about 400 blocks from the portal
    if (B.flat(l, start) > 400) bot.netherDir = (bot.netherDir + 2) % 4;
    const before = B.flat(l, start);
    yield* T.travel(bot, { x: l.x + d.x * 48, z: l.z + d.z * 48 }, { r: 8, legs: 4 });
    if (spotFortress(bot)) return true;
    if (Math.abs(B.flat(bot.entity.location, start) - before) < 8) bot.netherDir = (bot.netherDir + 1 + Math.floor(Math.random() * 3)) % 4;
  }
  return false;
}

/**
 * At a fortress: find its blaze spawner and wait near it, fighting the blazes that come (the
 * brain does the fighting) until it has its rods; nether wart on the way; loot its chests.
 * @param {any} bot @param {any} fort @param {Record<string, number>} goals
 */
function* atFortress(bot, fort, goals) {
  const dim = bot.entity.dimension;
  if (B.flat(bot.entity.location, fort.pos) > 20) {
    G.doing(bot, "heading to the Nether fortress");
    if (!(yield* T.travel(bot, fort.pos, { r: 8, digAny: true }))) return false;
  }
  // wart from the stairwells
  if (goals[m("nether_wart")] && Inv.count(bot, m("nether_wart")) < goals[m("nether_wart")]) {
    const wart = G.nextBlock(bot, [m("nether_wart")], 24, 8);
    if (wart) yield* S.mineBlock(bot, wart);
  }
  // its chests
  for (const c of S.findBlocks(dim, bot.entity.location, [m("chest")], 16, 6).slice(0, 2)) {
    if (W.looted(dim.id, c)) continue;
    if (yield* S.goTo(bot, { ...c, r: 2.5 }, { tries: 1, maxNodes: 1200, digAny: true })) {
      yield* S.lootChest(bot, c);
      W.markLooted(dim.id, c);
    }
  }
  if (!goals[m("blaze_rod")] || Inv.count(bot, m("blaze_rod")) >= goals[m("blaze_rod")]) return true;
  const spawner = S.findBlocks(dim, bot.entity.location, [m("mob_spawner")], 32, 16)[0] ??
    W.recall("spawner", NETHER, bot.entity.location).find((s) => B.dist(s.pos, bot.entity.location) < 96)?.pos;
  if (!spawner) {
    // walk the fortress's bridges to find it
    G.doing(bot, "searching the fortress for a blaze spawner");
    const bricks = S.findBlocks(dim, bot.entity.location, [m("nether_brick")], 32, 10);
    const far = bricks.filter((p) => B.flat(p, bot.entity.location) > 16);
    const pick = far[Math.floor(Math.random() * Math.min(6, far.length))];
    if (pick) yield* S.goTo(bot, { x: pick.x, y: pick.y + 1, z: pick.z, r: 3 }, { tries: 1, maxNodes: 2500, digAny: true });
    return false;
  }
  W.remember("spawner", NETHER, spawner, { mob: "blaze" }, 8);
  G.doing(bot, "fighting blazes for their rods");
  // a spot a few blocks from the spawner, on the fortress floor
  // back from the spawner, where it can see the blazes come and shoot them
  const ok = yield* S.goTo(bot, { x: spawner.x, z: spawner.z, r: 9, test: (x, y, z) => {
    const d = Math.hypot(x - spawner.x, z - spawner.z);
    return d >= 7 && d <= 12 && Math.abs(y - spawner.y) <= 3;
  } }, { tries: 2, maxNodes: 2500, digAny: true });
  if (!ok) return false;
  const start = system.currentTick;
  let lastRods = Inv.count(bot, m("blaze_rod"));
  while (Inv.count(bot, m("blaze_rod")) < goals[m("blaze_rod")]) {
    if (bot.abort || shouldLeave(bot)) return false;
    const rods = Inv.count(bot, m("blaze_rod"));
    if (rods > lastRods) lastRods = rods;
    // nothing for three minutes: this spawner isn't working for it
    if (system.currentTick - start > 3600 && rods === lastRods) return false;
    B.lookAt(bot, { x: spawner.x + 0.5, y: spawner.y + 1, z: spawner.z + 0.5 }, 20, 1);
    yield* S.collect(bot, { x: spawner.x + 0.5, y: spawner.y, z: spawner.z + 0.5 }, 12, 20);
    // waiting: shield up toward the spawner
    if (Inv.getEquip(bot, "Offhand")?.typeId === m("shield")) B.setUse(bot, 3);
    yield* S.wait(20);
    if (bot.use === 3) B.setUse(bot, 0);
  }
  return true;
}

/**
 * The trip: in through the portal, a fortress for blaze rods (and wart), piglins for pearls if
 * it has gold, home again.
 * @param {any} bot @param {Record<string, number>} goals item id -> how many it wants
 */
export function* netherTrip(bot, goals) {
  if (!(yield* goIn(bot))) return false;
  const done = () => Object.entries(goals).every(([id, n]) => Inv.count(bot, id) >= n);
  for (let round = 0; round < 30 && !done(); round++) {
    if (bot.abort) return false;
    if (shouldLeave(bot)) break;
    spotFortress(bot);
    const fort = W.recall("fortress", NETHER, bot.entity.location)[0];
    if (fort && (goals[m("blaze_rod")] || goals[m("nether_wart")])) {
      yield* atFortress(bot, fort, goals);
    } else if (goals[m("blaze_rod")] || goals[m("nether_wart")]) {
      yield* searchFortress(bot);
    }
    if (goals[m("ender_pearl")] && Inv.count(bot, m("ender_pearl")) < goals[m("ender_pearl")] && Inv.count(bot, m("gold_ingot")) >= 2) {
      yield* St.barter(bot, Math.min(16, Inv.count(bot, m("gold_ingot"))));
    }
    yield;
  }
  yield* goOut(bot);
  return done();
}
