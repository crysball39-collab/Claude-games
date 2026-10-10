// What a Player can do, one tick at a time: each skill is a generator that the brain steps
// once a tick (`yield` waits a tick) and that returns true when it worked.
//   goTo        find a way (bot_path.js) and follow it: walk, jump, swim, climb, open doors,
//               mine through, bridge and pillar
//   mineBlock   pick the right tool, look at the block, swing until it breaks (as long as a
//               player takes), drop what it drops, wear the tool
//   placeBlock  put a block down from its inventory, facing the right way
//   craft       at a crafting table (or in its hands for small recipes)
//   smelt       in a real furnace (or smoker, blast furnace): fuel and items in, wait, take out
//   deposit, withdraw, lootChest   chests and barrels
//   eat, sleep, toss, collect, openDoor, closeDoor, wait, think
import { BlockTypes, BlockVolume, ItemStack, system, world } from "@minecraft/server";
import * as B from "./bot_body.js";
import * as D from "./bot_data.js";
import * as Inv from "./bot_inv.js";
import * as P from "./bot_path.js";
import { perm } from "./doors_build.js";
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Block} Block */

// ---------------------------------------------------------------- small helpers
/** Wait a number of ticks. @param {number} ticks */
export function* wait(ticks) {
  for (let i = 0; i < ticks; i++) yield;
}
/** Wait until a test passes (true) or time runs out (false). @param {() => boolean} test @param {number} ticks */
export function* until(test, ticks) {
  for (let i = 0; i < ticks; i++) {
    if (test()) return true;
    yield;
  }
  return test();
}
/** Stop to think a moment: a hand to its chin, looking about. @param {any} bot @param {number} [ticks] */
export function* think(bot, ticks = 40) {
  B.stop(bot);
  B.setUse(bot, 6);
  const e = B.eye(bot);
  for (let i = 0; i < ticks; i++) {
    if (i % 20 === 0) {
      const yaw = bot.yaw + (Math.random() - 0.5) * 90;
      const f = B.forward(yaw);
      B.lookAt(bot, { x: e.x + f.x * 6, y: e.y + 1 + Math.random() * 2, z: e.z + f.z * 6 }, 20, 2);
    }
    yield;
  }
  B.setUse(bot, 0);
}
/** The block at p in its dimension. @param {any} bot @param {Vector3} p */
export function blockAt(bot, p) {
  return B.blockAt(bot.entity.dimension, p);
}
/** @param {any} bot @param {Vector3} p */
export function idAt(bot, p) {
  return B.idAt(bot.entity.dimension, p);
}
const vec = (a) => (Array.isArray(a) ? { x: a[0], y: a[1], z: a[2] } : a);
const mid = (p) => ({ x: Math.floor(p.x) + 0.5, y: Math.floor(p.y) + 0.5, z: Math.floor(p.z) + 0.5 });

/** Block ids this version of the game knows (a filter with an unknown one fails). */
const realTypes = new Map();
/** @param {string[]} types */
function known(types) {
  return types.filter((t) => {
    let ok = realTypes.get(t);
    if (ok === undefined) {
      try {
        ok = !!BlockTypes.get(t);
      } catch {
        ok = false;
      }
      realTypes.set(t, ok);
    }
    return ok;
  });
}

/**
 * Blocks of some kinds near a point, nearest first (only where the world is loaded).
 * @param {Dimension} dim @param {Vector3} at @param {string[]} types @param {number} r @param {number} [rv] vertical range
 */
export function findBlocks(dim, at, types, r, rv = r) {
  types = known(types);
  if (!types.length) return [];
  const c = B.blockPos(at);
  const lo = Math.max(dim.heightRange.min, c.y - rv);
  const hi = Math.min(dim.heightRange.max - 1, c.y + rv);
  /** @type {Vector3[]} */
  const out = [];
  try {
    const list = dim.getBlocks(new BlockVolume({ x: c.x - r, y: lo, z: c.z - r }, { x: c.x + r, y: hi, z: c.z + r }), { includeTypes: types }, true);
    for (const p of list.getBlockLocationIterator()) out.push({ x: p.x, y: p.y, z: p.z });
  } catch {
    return [];
  }
  out.sort((a, b) => B.dist(a, c) - B.dist(b, c));
  return out;
}

// ---------------------------------------------------------------- what may be broken
/** Blocks players placed (a Player won't break them: it only mines the world as it was made). */
export const playerPlaced = new Set();
/** @param {Dimension} dim @param {Vector3} p */
export const placedKey = (dim, p) => dim.id + "|" + B.key(p);

/** May this Player break the block at p? (natural blocks, and ones it placed itself) @param {any} bot */
export function protector(bot) {
  const dim = bot.entity.dimension;
  return (x, y, z, id) => {
    if (!bot.world.build) return true;
    const k = dim.id + "|" + x + "," + y + "," + z;
    if (bot.placed.has(k)) return false;
    if (playerPlaced.has(k)) return true;
    if (/_leaves$/.test(id)) return false;
    return !D.blockInfo(id).natural;
  };
}

/**
 * Inside a structure (a stronghold, a fortress, an end city) a player digs through whatever is
 * in the way, except what real players built, chests and spawners.
 * @param {any} bot
 */
export function structureProtector(bot) {
  const dim = bot.entity.dimension;
  return (x, y, z, id) => {
    if (!bot.world.build) return true;
    if (playerPlaced.has(dim.id + "|" + x + "," + y + "," + z)) return true;
    return /chest|barrel|shulker_box|mob_spawner|end_portal_frame|bed$/.test(id);
  };
}

/** How long it would take this Player to break a block, with its best tool (for the search). @param {any} bot */
export function mineTimer(bot) {
  const tools = Inv.stacks(bot).map((s) => s.item).filter((it) => D.toolInfo(it.typeId).type !== "hand");
  const cache = new Map();
  return (id) => {
    let t = cache.get(id);
    if (t !== undefined) return t;
    t = D.breakTicks(id, undefined, { inWater: false });
    for (const it of tools) t = Math.min(t, D.breakTicks(id, it.typeId, { efficiency: Inv.enchantLevel(it, "efficiency") }));
    cache.set(id, t);
    return t;
  };
}

/** Blocks a Player uses to bridge and pillar, cheapest first. */
export const SCAFFOLD = ["minecraft:dirt", "minecraft:cobblestone", "minecraft:netherrack", "minecraft:cobbled_deepslate", "minecraft:andesite",
  "minecraft:diorite", "minecraft:granite", "minecraft:tuff", "minecraft:blackstone", "minecraft:end_stone", "minecraft:stone"];
/** @param {any} bot */
export function scaffoldCount(bot) {
  let n = 0;
  for (const id of SCAFFOLD) n += Inv.count(bot, id);
  return n;
}

// ---------------------------------------------------------------- getting about
/**
 * Plan a way (a few hundred search steps a tick, so the game doesn't stall).
 * @param {any} bot @param {any} goal @param {any} [o]
 */
export function* plan(bot, goal, o = {}) {
  const dim = bot.entity.dimension;
  const build = bot.world.build && !o.noBuild;
  const gen = P.search(dim, B.feet(bot), goal, {
    mine: build ? mineTimer(bot) : undefined,
    blocks: build ? scaffoldCount(bot) : 0,
    protect: o.digAny ? structureProtector(bot) : protector(bot),
    maxNodes: o.maxNodes ?? 3000,
    weight: o.weight,
    maxDrop: B.health(bot) > 14 ? 3 : 2,
    avoidWater: o.avoidWater,
    portal: o.portal,
  });
  for (;;) {
    for (let k = 0; k < 3; k++) {
      const r = gen.next();
      if (r.done) return r.value;
    }
    yield;
  }
}

/** Is it at (or close enough to) a goal? @param {any} bot @param {any} goal */
export function atGoal(bot, goal) {
  const l = bot.entity.location;
  const f = B.feet(bot);
  if (goal.test) return goal.test(f.x, f.y, f.z);
  const dx = goal.x === undefined ? 0 : l.x - (goal.x + 0.5);
  const dy = goal.y === undefined ? 0 : f.y - goal.y;
  const dz = goal.z === undefined ? 0 : l.z - (goal.z + 0.5);
  return Math.sqrt(dx * dx + dy * dy + dz * dz) <= (goal.r ?? 0.5) + 0.6;
}

/**
 * Go somewhere: plan, follow, re-plan when the way is blocked or the plan only got part way.
 * goal: {x, y, z, r} in block coordinates (leave out y for any height), or {test}.
 * @param {any} bot @param {any} goal
 * @param {{tries?: number, speed?: string, maxNodes?: number, weight?: number, noBuild?: boolean, portal?: boolean, digAny?: boolean}} [o]
 */
export function* goTo(bot, goal, o = {}) {
  const tries = o.tries ?? 5;
  let fails = 0;
  for (let attempt = 0; attempt < tries * 3 && fails < tries; attempt++) {
    if (atGoal(bot, goal)) {
      B.stop(bot);
      return true;
    }
    const r = yield* plan(bot, goal, o);
    if (!r.path.length) {
      fails++;
      // nowhere to go from here: jump, step aside, try again
      B.jump(bot);
      yield* wait(10);
      continue;
    }
    const ok = yield* follow(bot, r.path, o);
    if (!ok) fails++;
    else if (!r.complete && r.path.length < 2) fails++;
  }
  B.stop(bot);
  return atGoal(bot, goal);
}

/**
 * Walk a planned way, step by step. False if a step can't be done (the caller plans again).
 * @param {any} bot @param {P.Step[]} path @param {any} [o]
 */
export function* follow(bot, path, o = {}) {
  /** a door it opened, to shut behind it once through */
  let shut;
  for (let i = 0; i < path.length; i++) {
    const s = path[i];
    if (s.door && !(yield* openDoor(bot, vec(s.door)))) return false;
    for (const m of s.mine ?? []) {
      if (!(yield* mineBlock(bot, vec(m), { pathing: true }))) return false;
    }
    let ok;
    if (s.how === "bridge") ok = yield* bridgeStep(bot, s);
    else if (s.how === "pillar") ok = yield* pillarStep(bot, s);
    else ok = yield* walkStep(bot, s, path.length - i, o);
    if (!ok) return false;
    if (shut && shut.step < i) {
      closeDoor(bot, shut.at);
      shut = undefined;
    }
    if (s.door && bot.openedDoor) shut = { at: vec(s.door), step: i };
    if (bot.abort) return false;
  }
  if (shut) {
    yield* wait(4);
    closeDoor(bot, shut.at);
  }
  B.stop(bot);
  return true;
}

/** Shut a door behind it (unless someone stands in the doorway). @param {any} bot @param {Vector3} p */
export function closeDoor(bot, p) {
  const dim = bot.entity.dimension;
  let b = blockAt(bot, p);
  if (!b || D.blockInfo(b.typeId).kind !== "door") return;
  try {
    if (b.permutation.getState("upper_block_bit")) b = b.below();
    if (!b || !b.permutation.getState("open_bit")) return;
    for (const e of dim.getEntities({ location: mid(p), maxDistance: 1.3 })) {
      if (e.typeId === "minecraft:item") continue;
      if (Math.floor(e.location.x) === Math.floor(p.x) && Math.floor(e.location.z) === Math.floor(p.z)) return;
    }
    B.lookAt(bot, mid(p), 6, 2);
    B.swing(bot);
    b.setPermutation(b.permutation.withState("open_bit", false));
    dim.playSound(/trapdoor/.test(b.typeId) ? "close.wooden_trapdoor" : /fence_gate/.test(b.typeId) ? "close.fence_gate" : "close.wooden_door",
      mid(p), { volume: 0.8, pitch: 1.0 });
  } catch {
    /* ignore */
  }
}

/** @param {any} bot @param {P.Step} s @param {number} left @param {any} o */
function* walkStep(bot, s, left, o) {
  const target = { x: s.x + 0.5, y: s.y, z: s.z + 0.5 };
  const e = bot.entity;
  const speed = o.speed ?? (left > 6 && bot.hunger > 6 && s.how === "walk" ? "sprint" : "walk");
  const far = B.dist(e.location, target);
  const limit = Math.ceil(far / 0.1) + 40;
  let best = far;
  let still = 0;
  for (let t = 0; t < limit; t++) {
    const l = e.location;
    const h = B.flat(l, target);
    const dy = l.y - s.y;
    if (h < 0.35 && Math.abs(dy) < (s.how === "down" ? 0.6 : 0.9) && (bot.onGround || bot.inWater || s.how === "climb" || s.how === "swim")) return true;
    B.moveTo(bot, target, { speed, tol: 0.15 });
    if (s.how === "up" && h < 1.3 && bot.onGround && dy < -0.3) B.jump(bot);
    if (s.how === "swim" && dy < -0.4) B.jump(bot);
    const d = B.dist(l, target);
    if (d < best - 0.05) {
      best = d;
      still = 0;
    } else if (++still > 30) {
      // stuck: one jump, then give up and re-plan
      if (still === 31) B.jump(bot);
      if (still > 50) return false;
    }
    yield;
  }
  return false;
}

/** Bridge: crouch at the edge, look down at its side, place a block, step onto it. @param {any} bot @param {P.Step} s */
function* bridgeStep(bot, s) {
  const place = vec(s.place);
  if (!D.isFloor(idAt(bot, place))) {
    bot.sneak = true;
    // stand at the edge of the block it's on, facing the gap
    const e = bot.entity;
    const here = B.feet(bot);
    const dx = s.x - here.x;
    const dz = s.z - here.z;
    const edge = { x: here.x + 0.5 + dx * 0.32, y: here.y, z: here.z + 0.5 + dz * 0.32 };
    for (let t = 0; t < 40 && B.flat(e.location, edge) > 0.12; t++) {
      B.moveTo(bot, edge, { speed: "sneak", tol: 0.05, noFall: true });
      yield;
    }
    B.stop(bot);
    const ok = yield* placeBlock(bot, place, SCAFFOLD);
    if (!ok) {
      bot.sneak = false;
      return false;
    }
  }
  const r = yield* walkStep(bot, s, 1, { speed: "sneak" });
  bot.sneak = false;
  return r;
}

/** Pillar: jump, and place a block where it stood. @param {any} bot @param {P.Step} s */
function* pillarStep(bot, s) {
  const place = vec(s.place);
  const e = bot.entity;
  B.stop(bot);
  // centre on the block first
  const c = { x: place.x + 0.5, y: place.y, z: place.z + 0.5 };
  for (let t = 0; t < 20 && B.flat(e.location, c) > 0.15; t++) {
    B.moveTo(bot, c, { speed: "sneak", tol: 0.05 });
    yield;
  }
  B.stop(bot);
  B.lookAt(bot, { x: c.x, y: place.y - 1, z: c.z }, 30, 3);
  if (!Inv.hold(bot, (id) => SCAFFOLD.includes(id))) return false;
  yield* until(() => bot.onGround, 10);
  B.jump(bot);
  // at the top of the jump its feet clear the block: place it under itself
  const ok = yield* until(() => e.location.y >= place.y + 1.0, 12);
  if (!ok) return false;
  if (!(yield* placeBlock(bot, place, SCAFFOLD, { under: true }))) return false;
  return yield* until(() => bot.onGround && e.location.y >= s.y - 0.1, 20);
}

/** Open a closed wooden door (or trapdoor, gate) in its way. @param {any} bot @param {Vector3} p */
export function* openDoor(bot, p) {
  const b = blockAt(bot, p);
  if (!b || D.blockInfo(b.typeId).kind !== "door") return true;
  let lower = b;
  try {
    if (b.permutation.getState("upper_block_bit")) lower = b.below();
  } catch {
    /* not a door with halves */
  }
  // walk up to it
  if (B.dist(bot.entity.location, mid(p)) > 3) {
    const ok = yield* goTo(bot, { x: p.x, y: p.y, z: p.z, r: 2.5 }, { noBuild: true, tries: 2 });
    if (!ok) return false;
  }
  B.lookAt(bot, mid(p), 15, 3);
  yield* wait(3);
  B.swing(bot);
  bot.openedDoor = false;
  try {
    if (!lower.permutation.getState("open_bit")) {
      lower.setPermutation(lower.permutation.withState("open_bit", true));
      bot.openedDoor = true;
      bot.entity.dimension.playSound(/fence_gate/.test(b.typeId) ? "open.fence_gate" : /trapdoor/.test(b.typeId) ? "open.wooden_trapdoor" : "open.wooden_door",
        mid(p), { volume: 0.8, pitch: 1.0 });
    }
  } catch {
    return false;
  }
  yield* wait(2);
  return true;
}

// ---------------------------------------------------------------- mining
/** What a block drops when this Player breaks it. @param {any} bot @param {Block} b @param {string} id @param {string | undefined} tool */
function dropsOf(bot, b, id, tool) {
  const info = D.blockInfo(id);
  if (!D.canHarvest(id, tool)) return [];
  const held = Inv.held(bot);
  const silk = Inv.enchantLevel(held, "silk_touch") > 0;
  const fortune = Inv.enchantLevel(held, "fortune");
  /** @type {Array<[string, number]>} */
  let out;
  if (silk && info.drop !== null && /ore|glass|grass_block|ice|leaves|bookshelf|glowstone/.test(id)) out = [[id, 1]];
  else if (typeof info.drop === "function") out = info.drop(Math.random, fortune);
  else if (info.drop === null) out = [];
  else if (typeof info.drop === "string") out = [[D.mc(info.drop), 1]];
  else {
    let it;
    try {
      it = b.getItemStack(1);
    } catch {
      it = undefined;
    }
    out = [[it?.typeId ?? id.replace("minecraft:lit_", "minecraft:"), 1]];
  }
  // a leaf only drops what shears or luck give
  return out.filter(([, n]) => n > 0);
}

/** "hit.stone", "dig.wood"... @param {string} id */
function material(id) {
  return /wool|carpet/.test(id) ? "cloth" : /planks|log|wood|door|chest|crafting|stem|bookshelf|barrel|ladder|fence|sign|table/.test(id) ? "wood"
    : /grass_block|dirt|podzol|mycelium|leaves|farmland|moss|_grass|fern|flower|sapling/.test(id) ? "grass" : /gravel|clay/.test(id) ? "gravel"
    : /sand|soul_s/.test(id) ? "sand" : /snow/.test(id) ? "snow" : "stone";
}

/**
 * Break a block: the right tool in hand, look at it, swing until it gives (as long as a player
 * would take), then it breaks with its sound and drops. Containers spill what they hold.
 * @param {any} bot @param {Vector3} p @param {{pathing?: boolean, noCollect?: boolean}} [o]
 */
export function* mineBlock(bot, p, o = {}) {
  const dim = bot.entity.dimension;
  const pos = B.blockPos(p);
  let b = blockAt(bot, pos);
  if (!b) return false;
  const id = b.typeId;
  const info = D.blockInfo(id);
  if (info.kind === "air" || info.kind === "liquid" || info.kind === "lava") return true;
  if (info.h < 0) return false;
  if (!bot.world.build) return false;
  // close enough to reach (4.5 blocks, as a player's reach)
  if (B.dist(B.eye(bot), mid(pos)) > 4.6) {
    if (o.pathing) return false;
    const ok = yield* goTo(bot, { ...pos, r: 3 }, { tries: 3 });
    if (!ok) return false;
  }
  const tool = Inv.bestTool(bot, id);
  if (tool) Inv.holdId(bot, tool);
  else if (D.toolInfo(Inv.held(bot)?.typeId).type !== "hand") Inv.hold(bot, "nothing");
  B.stop(bot);
  B.lookAt(bot, mid(pos), 400, 4);
  yield* until(() => B.facing(bot, mid(pos), 25), 8);
  const held = Inv.held(bot);
  const ticks = D.breakTicks(id, held?.typeId, { efficiency: Inv.enchantLevel(held, "efficiency"), inWater: bot.headInWater,
    onGround: bot.onGround || bot.inWater });
  const mat = material(id);
  for (let t = 0; t < ticks; t++) {
    b = blockAt(bot, pos);
    if (!b || b.typeId !== id) return true;     // someone else broke it
    if (t % 5 === 0) B.swing(bot);
    if (t % 4 === 0) {
      try {
        dim.playSound("hit." + mat, mid(pos), { volume: 0.25, pitch: 0.8 });
      } catch {
        /* ignore */
      }
    }
    if (B.dist(B.eye(bot), mid(pos)) > 5.5) return false;
    B.lookAt(bot, mid(pos), 10, 4);
    yield;
  }
  b = blockAt(bot, pos);
  if (!b || b.typeId !== id) return true;
  const drops = dropsOf(bot, b, id, held?.typeId);
  // a chest or furnace spills what it holds
  /** @type {ItemStack[]} */
  const spill = [];
  try {
    const c = b.getComponent("minecraft:inventory")?.container;
    if (c) for (let i = 0; i < c.size; i++) {
      const it = c.getItem(i);
      if (it) spill.push(it);
    }
  } catch {
    /* no inventory */
  }
  try {
    dim.setBlockType(pos, "minecraft:air");
  } catch {
    return false;
  }
  bot.placed.delete(placedKey(dim, pos));
  try {
    dim.playSound(/glass|ice/.test(id) ? "random.glass" : "dig." + mat, mid(pos), { volume: 0.8, pitch: 0.9 });
  } catch {
    /* ignore */
  }
  B.swing(bot);
  for (const [item, k] of drops) {
    try {
      let left = k;
      while (left > 0) {
        const s = new ItemStack(item, 1);
        const take = Math.min(left, s.maxAmount);
        dim.spawnItem(new ItemStack(item, take), mid(pos));
        left -= take;
      }
    } catch {
      /* not an item in this version */
    }
  }
  for (const it of spill) {
    try {
      dim.spawnItem(it, mid(pos));
    } catch {
      /* ignore */
    }
  }
  if (info.xp && D.canHarvest(id, held?.typeId)) B.addXp(bot, info.xp[0] + Math.floor(Math.random() * (info.xp[1] - info.xp[0] + 1)));
  bot.exhaust += 0.005;
  bot.stats.mined++;
  if (held && D.toolInfo(held.typeId).type !== "hand") {
    const w = Inv.wearHeld(bot, D.toolInfo(held.typeId).type === "sword" ? 2 : 1);
    if (w === "broke") onToolBroke(bot, held.typeId);
  }
  // pick up what fell (it may be out of reach if the block was high)
  if (!o.pathing && !o.noCollect && drops.length) yield* collect(bot, mid(pos), 4, 40);
  return true;
}

/** @param {any} bot @param {string} id */
export function onToolBroke(bot, id) {
  try {
    bot.entity.dimension.playSound("random.break", bot.entity.location, { volume: 0.8, pitch: 0.9 });
  } catch {
    /* ignore */
  }
  bot.events.push({ kind: "tool_broke", id, at: system.currentTick });
}

/** Walk over the items lying around a point to pick them up. @param {any} bot @param {Vector3} at @param {number} r @param {number} [ticks] */
export function* collect(bot, at, r = 6, ticks = 120) {
  const dim = bot.entity.dimension;
  for (let t = 0; t < ticks; t++) {
    let items = [];
    try {
      items = dim.getEntities({ type: "minecraft:item", location: at, maxDistance: r });
    } catch {
      return;
    }
    const now = system.currentTick;
    items = items.filter((i) => (bot.tossed.get(i.id) ?? 0) <= now);
    if (!items.length) {
      B.stop(bot);
      return;
    }
    items.sort((a, b) => B.dist(a.location, bot.entity.location) - B.dist(b.location, bot.entity.location));
    const it = items[0];
    const l = it.location;
    if (B.dist(l, bot.entity.location) > 6) {
      yield* goTo(bot, { ...B.blockPos(l), r: 1 }, { tries: 1, maxNodes: 600 });
    } else {
      B.moveTo(bot, l, { tol: 0.1 });
      if (l.y > bot.entity.location.y + 0.8 && bot.onGround) B.jump(bot);
    }
    yield;
  }
  B.stop(bot);
}

// ---------------------------------------------------------------- placing
const CARDS = ["south", "west", "north", "east"];
/** Compass name for a yaw. @param {number} yaw */
export function cardinalOf(yaw) {
  return CARDS[((Math.round(B.wrap(yaw) / 90) % 4) + 4) % 4];
}
/**
 * The block (with its states) an item puts down, facing back toward the Player.
 * @param {string} item @param {number} yaw @returns {{id: string, states?: Record<string, any>}}
 */
export function placedFor(item, yaw) {
  const facingMe = cardinalOf(yaw + 180);
  const id = D.bare(item);
  if (/^(furnace|blast_furnace|smoker|chest|trapped_chest|anvil|chipped_anvil|damaged_anvil|stonecutter_block|end_portal_frame)$/.test(id)) {
    return { id: item, states: { "minecraft:cardinal_direction": facingMe } };
  }
  if (/_log$|_stem$|_wood$|^purpur_block$/.test(id)) return { id: item, states: { pillar_axis: "y" } };
  if (id === "torch" || id === "soul_torch") return { id: item, states: { torch_facing_direction: "top" } };
  if (id === "grindstone") return { id: item, states: { attachment: "standing", direction: (CARDS.indexOf(facingMe) + 2) % 4 } };
  if (id === "loom") return { id: item, states: { direction: CARDS.indexOf(facingMe) } };
  if (id === "barrel") return { id: item, states: { facing_direction: 1, open_bit: false } };
  if (id === "sugar_cane") return { id: "minecraft:reeds" };
  if (id === "water_bucket") return { id: "minecraft:water" };
  if (id === "lava_bucket") return { id: "minecraft:lava" };
  return { id: item };
}

/**
 * Put a block down at p from its inventory (any of `want`): it looks at the spot, swings, and
 * the block appears with the right facing. Doors and beds take two blocks.
 * @param {any} bot @param {Vector3} p @param {string | string[] | ((id: string) => boolean)} want
 * @param {{under?: boolean, states?: Record<string, any>, yaw?: number}} [o]
 */
export function* placeBlock(bot, p, want, o = {}) {
  const dim = bot.entity.dimension;
  const pos = B.blockPos(p);
  if (!bot.world.build) return false;
  const test = Array.isArray(want) ? (id) => want.includes(id) : want;
  if (!Inv.hold(bot, /** @type {any} */ (test))) return false;
  const item = Inv.held(bot);
  if (!item) return false;
  const here = idAt(bot, pos);
  const k = D.blockInfo(here).kind;
  if (!(k === "air" || k === "pass" || k === "liquid" || k === "lava")) return D.isFloor(here);
  // not into anyone standing there (unless it's under its own feet, mid-jump)
  if (!o.under) {
    for (const e of dim.getEntities({ location: mid(pos), maxDistance: 1.2 })) {
      if (e.typeId === "minecraft:item" || e.typeId === "minecraft:xp_orb") continue;
      const l = e.location;
      if (Math.floor(l.x) === pos.x && Math.floor(l.z) === pos.z && l.y < pos.y + 1 && l.y + 1.8 > pos.y) return false;
    }
  }
  if (B.dist(B.eye(bot), mid(pos)) > 5) {
    const ok = yield* goTo(bot, { ...pos, r: 3 }, { tries: 2 });
    if (!ok) return false;
  }
  B.lookAt(bot, mid(pos), 12, 4);
  if (!o.under) yield* until(() => B.facing(bot, mid(pos), 30), 6);
  const spec = placedFor(item.typeId, o.yaw ?? bot.yaw);
  if (o.states) spec.states = { ...(spec.states ?? {}), ...o.states };
  const id = D.bare(item.typeId);
  try {
    if (id === "bed" || id.endsWith("_bed")) {
      // the head goes the way it faces
      const f = B.forward(o.yaw ?? bot.yaw);
      const head = { x: pos.x + Math.round(f.x), y: pos.y, z: pos.z + Math.round(f.z) };
      if (!B.blockAt(dim, head)?.isAir) return false;
      const dir = (CARDS.indexOf(cardinalOf(o.yaw ?? bot.yaw)));
      const foot = perm({ id: "minecraft:bed", states: { direction: dir, head_piece_bit: false } });
      const top = perm({ id: "minecraft:bed", states: { direction: dir, head_piece_bit: true } });
      if (!foot || !top) return false;
      dim.setBlockPermutation(pos, foot);
      dim.setBlockPermutation(head, top);
      bot.placed.add(placedKey(dim, head));
    } else if (/_door$|^wooden_door$/.test(id)) {
      const up = { x: pos.x, y: pos.y + 1, z: pos.z };
      if (!B.blockAt(dim, up)?.isAir) return false;
      const card = cardinalOf((o.yaw ?? bot.yaw));
      const low = perm({ id: item.typeId, states: { "minecraft:cardinal_direction": card, upper_block_bit: false, open_bit: false, door_hinge_bit: false } });
      const high = perm({ id: item.typeId, states: { "minecraft:cardinal_direction": card, upper_block_bit: true, open_bit: false, door_hinge_bit: false } });
      if (!low || !high) return false;
      dim.setBlockPermutation(pos, low);
      dim.setBlockPermutation(up, high);
      bot.placed.add(placedKey(dim, up));
    } else {
      const pm = perm(spec);
      if (!pm) return false;
      dim.setBlockPermutation(pos, pm);
    }
  } catch {
    return false;
  }
  if (id === "water_bucket" || id === "lava_bucket") {
    Inv.take(bot, item.typeId, 1);
    Inv.add(bot, new ItemStack("minecraft:bucket", 1));
    try {
      dim.playSound(id === "water_bucket" ? "bucket.empty_water" : "bucket.empty_lava", mid(pos), { volume: 0.8, pitch: 1 });
    } catch {
      /* ignore */
    }
  } else {
    Inv.take(bot, item.typeId, 1);
    try {
      dim.playSound("use." + material(item.typeId), mid(pos), { volume: 0.8, pitch: 0.9 });
    } catch {
      /* ignore */
    }
  }
  B.swing(bot);
  bot.placed.add(placedKey(dim, pos));
  bot.stats.placed++;
  yield;
  return true;
}

/**
 * A free spot to put something down near it: an empty block on solid ground, within reach,
 * not where it stands.
 * @param {any} bot @param {number} [r]
 */
export function spotNear(bot, r = 3) {
  const dim = bot.entity.dimension;
  const f = B.feet(bot);
  const fw = B.forward(bot.yaw);
  /** @type {Vector3[]} */
  const cands = [];
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        const p = { x: f.x + dx, y: f.y + dy, z: f.z + dz };
        if (dx === 0 && dz === 0) continue;
        if (Math.abs(dx) <= 0 && Math.abs(dz) <= 0) continue;
        const here = B.blockAt(dim, p);
        const below = B.blockAt(dim, { ...p, y: p.y - 1 });
        if (!here || !["air", "pass"].includes(D.blockInfo(here.typeId).kind) || !below || !D.isFloor(below.typeId)) continue;
        // not where it would block its own way out
        const above = B.blockAt(dim, { ...p, y: p.y + 1 });
        p.score = above?.isAir ? 0 : 1.5;
        cands.push(p);
      }
    }
  }
  // in front of it first
  cands.sort((a, b) => {
    const sa = Math.abs(a.x - f.x) + Math.abs(a.z - f.z) - ((a.x - f.x) * fw.x + (a.z - f.z) * fw.z) * 0.6 + a.score;
    const sb = Math.abs(b.x - f.x) + Math.abs(b.z - f.z) - ((b.x - f.x) * fw.x + (b.z - f.z) * fw.z) * 0.6 + b.score;
    return sa - sb;
  });
  const best = cands[0];
  if (best) delete best.score;
  return best;
}

// ---------------------------------------------------------------- crafting
/**
 * A crafting table (or another station) within reach: one it can see nearby, or one it places.
 * @param {any} bot @param {string} blockId @param {string} [item]
 * @returns {Generator<undefined, Vector3 | undefined>}
 */
export function* station(bot, blockId, item = blockId) {
  const dim = bot.entity.dimension;
  const ids = blockId === "minecraft:furnace" ? ["minecraft:furnace", "minecraft:lit_furnace"]
    : blockId === "minecraft:smoker" ? ["minecraft:smoker", "minecraft:lit_smoker"]
    : blockId === "minecraft:blast_furnace" ? ["minecraft:blast_furnace", "minecraft:lit_blast_furnace"]
    : blockId === "minecraft:anvil" ? ["minecraft:anvil", "minecraft:chipped_anvil", "minecraft:damaged_anvil"] : [blockId];
  const near = findBlocks(dim, bot.entity.location, ids, 12, 5);
  for (const p of near) {
    if (B.dist(bot.entity.location, mid(p)) <= 4) return p;
    const ok = yield* goTo(bot, { ...p, r: 2.5 }, { tries: 2, maxNodes: 1500 });
    if (ok) return p;
  }
  if (!Inv.has(bot, item)) return undefined;
  let spot = spotNear(bot);
  if (!spot) {
    // boxed in (a tunnel, a pit): dig a nook in the wall beside it for the table
    const f = B.feet(bot);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const p = { x: f.x + dx, y: f.y, z: f.z + dz };
      if (!D.isFloor(B.idAt(dim, { ...p, y: p.y - 1 }))) continue;
      if (yield* mineBlock(bot, p, { pathing: true })) {
        spot = p;
        break;
      }
    }
  }
  if (!spot) return undefined;
  const ok = yield* placeBlock(bot, spot, item);
  if (!ok) return undefined;
  if (bot.home && B.dist(spot, bot.home.pos) < 16) bot.home.stations[D.bare(blockId)] = spot;
  return spot;
}

/** Make sure it has the items a recipe needs, by id (groups resolved to what it has). @param {any} bot @param {D.Recipe} rec @param {number} times */
export function missingFor(bot, rec, times) {
  /** @type {Array<[string, number]>} */
  const miss = [];
  for (const [want, k] of Object.entries(rec.needs)) {
    const have = Inv.count(bot, want);
    if (have < k * times) miss.push([want, k * times - have]);
  }
  return miss;
}

/**
 * Craft something `times` times: at a crafting table for big recipes (finding or placing one),
 * in its hands for small ones. Takes the ingredients, gives the result.
 * @param {any} bot @param {D.Recipe} rec @param {number} [times]
 */
export function* craft(bot, rec, times = 1) {
  if (missingFor(bot, rec, times).length) return false;
  let at;
  if (rec.table) {
    at = yield* station(bot, "minecraft:crafting_table");
    if (!at) return false;
    B.lookAt(bot, mid(at), 40, 3);
  }
  B.stop(bot);
  B.setUse(bot, 4);
  yield* wait(10 + Math.min(30, 3 * times));
  if (missingFor(bot, rec, times).length) {
    B.setUse(bot, 0);
    return false;
  }
  for (const [want, k] of Object.entries(rec.needs)) Inv.take(bot, want, k * times);
  let total = rec.n * times;
  while (total > 0) {
    const s = new ItemStack(rec.out, 1);
    const n = Math.min(total, s.maxAmount);
    Inv.add(bot, new ItemStack(rec.out, n));
    total -= n;
  }
  try {
    bot.entity.dimension.playSound("random.pop", bot.entity.location, { volume: 0.4, pitch: 1.2 });
  } catch {
    /* ignore */
  }
  B.swing(bot);
  B.setUse(bot, 0);
  bot.stats.crafted++;
  bot.events.push({ kind: "crafted", id: rec.out, n: rec.n * times, at: system.currentTick });
  return true;
}

// ---------------------------------------------------------------- smelting
/**
 * Smelt items in a real furnace (a smoker for food, a blast furnace for ores, if it has one):
 * it walks up, puts the items and fuel in, waits beside it, and takes the results out.
 * @param {any} bot @param {string} input @param {number} n
 */
export function* smelt(bot, input, n) {
  const kind = D.smelterFor(input);
  let at;
  if (kind !== "furnace") at = yield* station(bot, "minecraft:" + kind);
  if (!at) at = yield* station(bot, "minecraft:furnace");
  if (!at) return false;
  const dim = bot.entity.dimension;
  const out = D.mc(D.SMELT[D.bare(input)]);
  const block = () => B.blockAt(dim, at);
  const cont = () => {
    try {
      return block()?.getComponent("minecraft:inventory")?.container;
    } catch {
      return undefined;
    }
  };
  let c = cont();
  if (!c) return false;
  B.lookAt(bot, mid(at), 40, 3);
  yield* wait(6);
  B.swing(bot);
  // clear out whatever someone left in it
  for (const i of [0, 2]) {
    const it = c.getItem(i);
    if (it && (i === 2 || it.typeId !== input)) {
      c.setItem(i, undefined);
      Inv.add(bot, it);
    }
  }
  const fast = !/^minecraft:(lit_)?furnace$/.test(block()?.typeId ?? "");
  const per = fast ? 100 : 200;
  let put = 0;
  const cur = c.getItem(0);
  const room = cur ? cur.maxAmount - cur.amount : new ItemStack(input).maxAmount;
  put = Math.min(n, room, Inv.count(bot, input));
  if (put <= 0) return false;
  Inv.take(bot, input, put);
  c.setItem(0, new ItemStack(input, put + (cur?.amount ?? 0)));
  const fuelNeed = put * per;
  if (!(yield* fuelUp(bot, c, fuelNeed))) {
    // no fuel: take the items back
    const back = c.getItem(0);
    if (back) {
      c.setItem(0, undefined);
      Inv.add(bot, back);
    }
    return false;
  }
  try {
    dim.playSound("random.chestclosed", mid(at), { volume: 0.3, pitch: 1.4 });
  } catch {
    /* ignore */
  }
  // wait by it, glancing at it now and then
  const limit = put * per + 200;
  for (let t = 0; t < limit; t++) {
    c = cont();
    if (!c) return false;
    const left = c.getItem(0);
    if (!left || left.typeId !== input) break;
    if (t % 60 === 0) B.lookAt(bot, mid(at), 20, 2);
    if (t % 200 === 199 && !c.getItem(1)) yield* fuelUp(bot, c, left.amount * per);
    yield;
  }
  c = cont();
  if (!c) return false;
  B.lookAt(bot, mid(at), 20, 3);
  yield* wait(5);
  const res = c.getItem(2);
  if (res) {
    c.setItem(2, undefined);
    Inv.add(bot, res);
    B.addXp(bot, Math.max(1, Math.round(res.amount * (/ingot/.test(res.typeId) ? 0.7 : 0.35))));
  }
  B.swing(bot);
  return Inv.count(bot, out) > 0;
}

/** Fuel a furnace for `ticks` of burning, with the cheapest fuel it has. @param {any} bot @param {any} c @param {number} ticks */
function* fuelUp(bot, c, ticks) {
  const have = c.getItem(1);
  if (have && D.fuelTicks(have.typeId) * have.amount >= ticks) return true;
  const order = ["minecraft:coal", "minecraft:charcoal", "planks", "log", "minecraft:stick", "minecraft:coal_block", "minecraft:blaze_rod",
    "minecraft:lava_bucket"];
  for (const f of order) {
    const ids = Inv.idsOf(bot, f);
    for (const id of ids) {
      if (have && have.typeId !== id) continue;
      const per = D.fuelTicks(id);
      if (!per) continue;
      const need = Math.ceil((ticks - (have ? per * have.amount : 0)) / per);
      const k = Math.min(need, Inv.count(bot, id), new ItemStack(id).maxAmount - (have?.amount ?? 0));
      if (k <= 0) continue;
      Inv.take(bot, id, k);
      c.setItem(1, new ItemStack(id, k + (have?.amount ?? 0)));
      return true;
    }
  }
  return !!have;
}

// ---------------------------------------------------------------- chests
/** @param {any} bot @param {Vector3} at */
function chestContainer(bot, at) {
  try {
    return blockAt(bot, at)?.getComponent("minecraft:inventory")?.container;
  } catch {
    return undefined;
  }
}
/** Walk up to a chest and open it (its lid sound). @param {any} bot @param {Vector3} at */
function* openChest(bot, at) {
  if (B.dist(bot.entity.location, mid(at)) > 4) {
    const ok = yield* goTo(bot, { ...B.blockPos(at), r: 2.5 }, { tries: 3 });
    if (!ok) return undefined;
  }
  B.stop(bot);
  B.lookAt(bot, mid(at), 60, 3);
  yield* wait(6);
  B.swing(bot);
  const c = chestContainer(bot, at);
  if (!c) return undefined;
  try {
    bot.entity.dimension.playSound(/barrel/.test(idAt(bot, at)) ? "block.barrel.open" : "random.chestopen", mid(at), { volume: 0.5, pitch: 1 });
  } catch {
    /* ignore */
  }
  yield* wait(4);
  return c;
}
/** @param {any} bot @param {Vector3} at */
function closeChest(bot, at) {
  try {
    bot.entity.dimension.playSound(/barrel/.test(idAt(bot, at)) ? "block.barrel.close" : "random.chestclosed", mid(at), { volume: 0.5, pitch: 1 });
  } catch {
    /* ignore */
  }
}
/**
 * Put things in a chest: everything `keep` says it doesn't need on it. Returns how many stacks.
 * @param {any} bot @param {Vector3} at @param {(id: string, amount: number) => boolean} keep
 */
export function* deposit(bot, at, keep) {
  const c = yield* openChest(bot, at);
  if (!c) return 0;
  let n = 0;
  const inv = Inv.container(bot);
  if (inv) {
    for (let i = 0; i < inv.size; i++) {
      const it = inv.getItem(i);
      if (!it || keep(it.typeId, it.amount)) continue;
      const left = c.addItem(it);
      inv.setItem(i, left);
      if (!left || left.amount < it.amount) n++;
      if (n % 3 === 0) yield;
    }
  }
  yield* wait(4);
  closeChest(bot, at);
  return n;
}
/**
 * Take things out of a chest: up to `n` of what it wants. Returns how many it took.
 * @param {any} bot @param {Vector3} at @param {string | ((id: string) => boolean)} want @param {number} n
 */
export function* withdraw(bot, at, want, n) {
  const c = yield* openChest(bot, at);
  if (!c) return 0;
  let got = 0;
  for (let i = 0; i < c.size && got < n; i++) {
    const it = c.getItem(i);
    if (!it || !Inv.matches(it.typeId, want)) continue;
    const k = Math.min(it.amount, n - got);
    const take = it.clone ? it.clone() : new ItemStack(it.typeId, k);
    take.amount = k;
    if (!Inv.add(bot, take)) break;
    if (k >= it.amount) c.setItem(i, undefined);
    else {
      it.amount -= k;
      c.setItem(i, it);
    }
    got += k;
  }
  yield* wait(4);
  closeChest(bot, at);
  return got;
}
/** Take everything useful out of a chest it found. @param {any} bot @param {Vector3} at */
export function* lootChest(bot, at) {
  const c = yield* openChest(bot, at);
  if (!c) return 0;
  let got = 0;
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    if (!it) continue;
    if (Inv.freeSlots(bot) === 0) break;
    c.setItem(i, undefined);
    Inv.add(bot, it);
    got += it.amount;
    bot.events.push({ kind: "looted", id: it.typeId, n: it.amount, at: system.currentTick });
    yield;
  }
  yield* wait(4);
  closeChest(bot, at);
  return got;
}

// ---------------------------------------------------------------- eating, drinking, sleeping
/**
 * Eat something (1.6 seconds, munching, as a player eats).
 * @param {any} bot @param {string} id
 */
export function* eat(bot, id) {
  if (!Inv.hold(bot, id)) return false;
  B.stop(bot);
  B.setUse(bot, 1);
  const dim = bot.entity.dimension;
  for (let t = 0; t < 32; t++) {
    if (t % 4 === 0) {
      try {
        dim.playSound("random.eat", bot.entity.location, { volume: 0.5, pitch: 0.8 + Math.random() * 0.4 });
      } catch {
        /* ignore */
      }
    }
    yield;
  }
  B.setUse(bot, 0);
  if (Inv.take(bot, id, 1) < 1) return false;
  B.nourish(bot, id);
  if (/stew|soup/.test(id)) Inv.add(bot, new ItemStack("minecraft:bowl", 1));
  try {
    dim.playSound("random.burp", bot.entity.location, { volume: 0.5, pitch: 1 });
  } catch {
    /* ignore */
  }
  bot.stats.ate++;
  return true;
}

/**
 * Sleep in a bed until morning (it can't skip the night as players can, but it rests, and the
 * bed is where it comes back if it dies).
 * @param {any} bot @param {Vector3} bedPos
 */
export function* sleep(bot, bedPos) {
  const ok = yield* goTo(bot, { ...B.blockPos(bedPos), r: 2 }, { tries: 3 });
  if (!ok) return false;
  const e = bot.entity;
  B.stop(bot);
  bot.spawn = { dim: e.dimension.id, pos: { x: bedPos.x, y: bedPos.y, z: bedPos.z } };
  try {
    e.teleport({ x: Math.floor(bedPos.x) + 0.5, y: Math.floor(bedPos.y) + 0.56, z: Math.floor(bedPos.z) + 0.5 }, { keepVelocity: false });
  } catch {
    return false;
  }
  B.setPose(bot, 3);
  bot.events.push({ kind: "sleep", at: system.currentTick });
  for (let t = 0; t < 12000; t++) {
    const time = world.getTimeOfDay();
    if (time < 12500 || time > 23400) break;
    if (bot.hurtAt && system.currentTick - bot.hurtAt < 5) break;
    if (!idAt(bot, bedPos).includes("bed")) break;
    yield;
  }
  B.setPose(bot, 0);
  try {
    e.teleport({ x: Math.floor(bedPos.x) + 0.5, y: Math.floor(bedPos.y) + 1, z: Math.floor(bedPos.z) + 0.5 });
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * Toss away what it doesn't want (a little at a time, as players drop items with Q).
 * @param {any} bot @param {Array<[string, number]>} [keep] items and how many of each to keep
 */
export function* tossJunk(bot, keep = Inv.JUNK) {
  let n = 0;
  for (const [id, k] of keep) {
    const have = Inv.count(bot, id);
    if (have <= k) continue;
    B.stop(bot);
    const yaw = bot.yaw + (Math.random() - 0.5) * 60;
    B.lookAt(bot, { ...B.eye(bot), x: B.eye(bot).x + B.forward(yaw).x * 3, y: B.eye(bot).y - 0.5, z: B.eye(bot).z + B.forward(yaw).z * 3 }, 20, 2);
    yield* wait(4);
    n += Inv.toss(bot, id, have - k);
    B.swing(bot);
    yield* wait(6);
  }
  return n;
}
