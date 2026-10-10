// Getting about: long journeys a leg at a time (the way is planned forty-odd blocks ahead, then
// planned again), and going through portals. Players walk into Nether and End portals and the
// game takes them through, as it does any mob; if it doesn't, the Player is taken where a player
// would arrive (a Nether portal is built at the other end if there is none, the End's obsidian
// platform is made), so a Player never gets stuck at a portal.
import { system, world } from "@minecraft/server";
import * as B from "./bot_body.js";
import * as D from "./bot_data.js";
import * as S from "./bot_skills.js";
import * as W from "./bot_world.js";
import { perm } from "./doors_build.js";
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

const m = D.mc;

/**
 * Travel to a far place (x, z, and y if it matters), a leg at a time. Calls `onLeg` after each
 * leg (to look about on the way). True when it gets there.
 * @param {any} bot @param {{x: number, y?: number, z: number}} to
 * @param {{r?: number, legs?: number, digAny?: boolean, onLeg?: () => Generator<undefined, any>, maxNodes?: number}} [o]
 */
export function* travel(bot, to, o = {}) {
  const r = o.r ?? 3;
  let best = Infinity;
  let stuck = 0;
  for (let leg = 0; leg < (o.legs ?? 80); leg++) {
    if (bot.abort) return false;
    const l = bot.entity.location;
    const d = B.flat(l, to);
    if (d <= r && (to.y === undefined || Math.abs(l.y - to.y) < 3)) return true;
    const k = Math.min(1, 44 / Math.max(d, 1));
    /** @type {any} */
    let goal;
    if (stuck >= 3) {
      // round whatever is in the way: off to one side for a leg
      const side = stuck % 2 ? 1 : -1;
      goal = { x: Math.floor(l.x + ((to.z - l.z) / d) * 24 * side + ((to.x - l.x) / d) * 8), z: Math.floor(l.z - ((to.x - l.x) / d) * 24 * side + ((to.z - l.z) / d) * 8), r: 6 };
    } else {
      goal = { x: Math.floor(l.x + (to.x - l.x) * k), z: Math.floor(l.z + (to.z - l.z) * k), r: k < 1 ? 6 : r };
      if (k >= 1 && to.y !== undefined) goal.y = Math.floor(to.y);
    }
    yield* S.goTo(bot, goal, { tries: 1, maxNodes: o.maxNodes ?? 2500, digAny: o.digAny });
    if (o.onLeg && (yield* o.onLeg())) return true;
    const nd = B.flat(bot.entity.location, to);
    if (nd < best - 3) {
      best = nd;
      stuck = 0;
    } else if (++stuck > 9) return false;
  }
  return false;
}

/** Is it still in the dimension it set out from? @param {any} bot @param {string} from */
function stillIn(bot, from) {
  try {
    return bot.entity.isValid && bot.entity.dimension.id === from;
  } catch {
    return false;
  }
}

/** Wait to be taken through (true), up to a number of ticks. @param {any} bot @param {string} from @param {number} ticks */
function* waitAway(bot, from, ticks) {
  for (let t = 0; t < ticks; t++) {
    if (!stillIn(bot, from)) return true;
    yield;
  }
  return !stillIn(bot, from);
}

// ---------------------------------------------------------------- Nether portals
/**
 * Go through a Nether portal: walk into it and stand there until it's taken across.
 * @param {any} bot @param {Vector3} at a block of the portal
 */
export function* usePortal(bot, at) {
  const from = bot.entity.dimension.id;
  const dim = bot.entity.dimension;
  // the bottom block of the portal there
  let cell = { x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z) };
  for (let k = 0; k < 4 && B.idAt(dim, { ...cell, y: cell.y - 1 }) === m("portal"); k++) cell = { ...cell, y: cell.y - 1 };
  if (B.idAt(dim, cell) !== m("portal")) return false;
  const ok = yield* S.goTo(bot, { ...cell, r: 0.4 }, { tries: 3, portal: true, maxNodes: 2000 });
  if (!ok) return false;
  B.stop(bot);
  bot.saveNow = true;
  if (yield* waitAway(bot, from, 200)) return true;
  return yield* emulatePortal(bot, cell);
}

/** A Nether portal near a spot in another dimension (the world there must be loaded). @param {any} dim @param {Vector3} p */
function portalNear(dim, p) {
  return S.findBlocks(dim, p, [m("portal")], 16, dim.id === "minecraft:nether" ? 40 : 24)[0];
}
/** Wait for the world at a spot to load (a ticking area brings it in). @param {any} dim @param {Vector3} p @param {string} name */
export function* loadAt(dim, p, name) {
  try {
    dim.runCommand(`tickingarea add circle ${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)} 2 ${name}`);
  } catch {
    /* ignore */
  }
  for (let t = 0; t < 300; t++) {
    try {
      if (dim.getBlock({ x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) })) return true;
    } catch {
      /* not yet */
    }
    yield;
  }
  return false;
}
/** @param {any} dim @param {string} name */
export function unload(dim, name) {
  try {
    dim.runCommand(`tickingarea remove ${name}`);
  } catch {
    /* ignore */
  }
}

/**
 * Somewhere to stand near a spot: air for a body on solid ground (not lava), searched from
 * the spot outward; or a pocket hollowed out of the rock with an obsidian floor (the game does
 * this for a portal in solid ground).
 * @param {any} dim @param {Vector3} p
 */
function safeSpot(dim, p) {
  const lo = dim.id === "minecraft:nether" ? 32 : Math.max(dim.heightRange.min + 4, p.y - 40);
  const hi = dim.id === "minecraft:nether" ? 110 : Math.min(dim.heightRange.max - 4, p.y + 40);
  for (let r = 0; r <= 12; r += 2) {
    for (let a = 0; a < (r ? 8 : 1); a++) {
      const x = Math.floor(p.x + Math.cos((a * Math.PI) / 4) * r);
      const z = Math.floor(p.z + Math.sin((a * Math.PI) / 4) * r);
      for (let y = lo; y <= hi; y++) {
        const below = B.idAt(dim, { x, y: y - 1, z });
        if (!D.isFloor(below) || /lava|magma/.test(below)) continue;
        let room = true;
        for (let dx = -1; dx <= 2 && room; dx++) {
          for (let dy = 0; dy <= 3 && room; dy++) {
            if (D.blockInfo(B.idAt(dim, { x: x + dx, y: y + dy, z })).kind !== "air") room = false;
          }
        }
        if (room) return { x, y, z };
      }
    }
  }
  // hollow one out
  const y = dim.id === "minecraft:nether" ? 70 : Math.floor(p.y);
  const x = Math.floor(p.x);
  const z = Math.floor(p.z);
  try {
    for (let dx = -2; dx <= 3; dx++) for (let dz = -2; dz <= 2; dz++) {
      dim.setBlockType({ x: x + dx, y: y - 1, z: z + dz }, "minecraft:obsidian");
      for (let dy = 0; dy <= 3; dy++) dim.setBlockType({ x: x + dx, y: y + dy, z: z + dz }, "minecraft:air");
    }
  } catch {
    return undefined;
  }
  return { x, y, z };
}
/** Build a lit portal with its bottom-left inside block at p (along x). @param {any} dim @param {Vector3} p */
function makePortal(dim, p) {
  const ob = perm({ id: "minecraft:obsidian" });
  const portal = perm({ id: "minecraft:portal", states: { portal_axis: "x" } });
  if (!ob || !portal) return false;
  try {
    for (let dx = -1; dx <= 2; dx++) {
      for (let dy = -1; dy <= 3; dy++) {
        const frame = dx === -1 || dx === 2 || dy === -1 || dy === 3;
        dim.setBlockPermutation({ x: p.x + dx, y: p.y + dy, z: p.z }, frame ? ob : portal);
      }
    }
    // somewhere to step out onto
    for (let dx = 0; dx <= 1; dx++) for (const dz of [-1, 1]) {
      const f = { x: p.x + dx, y: p.y - 1, z: p.z + dz };
      if (!D.isFloor(B.idAt(dim, f))) dim.setBlockPermutation(f, ob);
    }
  } catch {
    return false;
  }
  return true;
}

/**
 * The game didn't take it through: take it to where a player would come out (an eighth of the
 * distance in the Nether, eight times as far in the Overworld), at the portal there or a new one.
 * @param {any} bot @param {Vector3} at
 */
function* emulatePortal(bot, at) {
  const from = bot.entity.dimension;
  const toNether = from.id === "minecraft:overworld";
  if (!toNether && from.id !== "minecraft:nether") return false;
  const to = world.getDimension(toNether ? "nether" : "overworld");
  const k = toNether ? 1 / 8 : 8;
  const guess = { x: Math.floor(at.x * k), y: toNether ? 64 : Math.max(64, at.y), z: Math.floor(at.z * k) };
  const name = "zt_portal_" + bot.uid.slice(0, 5);
  if (!(yield* loadAt(to, guess, name))) {
    unload(to, name);
    return false;
  }
  let cell = portalNear(to, guess);
  if (cell) {
    while (B.idAt(to, { ...cell, y: cell.y - 1 }) === m("portal")) cell = { ...cell, y: cell.y - 1 };
  } else {
    const spot = safeSpot(to, guess);
    if (!spot || !makePortal(to, spot)) {
      unload(to, name);
      return false;
    }
    cell = spot;
    W.remember("portal", to.id, spot, { made: true }, 8);
  }
  try {
    bot.entity.teleport({ x: cell.x + 0.5, y: cell.y, z: cell.z + 1.5 }, { dimension: to });
    to.playSound("portal.travel", { x: cell.x + 0.5, y: cell.y + 1, z: cell.z + 0.5 }, { volume: 0.3, pitch: 1 });
  } catch {
    unload(to, name);
    return false;
  }
  yield* S.wait(20);
  unload(to, name);
  return true;
}

/** Where it came out of a Nether portal (the portal nearest it). @param {any} bot */
export function portalHere(bot) {
  const p = S.findBlocks(bot.entity.dimension, bot.entity.location, [m("portal")], 6, 4)[0];
  return p;
}

// ---------------------------------------------------------------- the End
/** Make the obsidian platform players arrive on in the End, if it isn't there. @param {any} dim */
export function endPlatform(dim) {
  const ob = perm({ id: "minecraft:obsidian" });
  if (!ob) return;
  try {
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      dim.setBlockPermutation({ x: 100 + dx, y: 48, z: dz }, ob);
      for (let dy = 49; dy <= 51; dy++) dim.setBlockType({ x: 100 + dx, y: dy, z: dz }, "minecraft:air");
    }
  } catch {
    /* ignore */
  }
}

/**
 * Jump into an open End portal (from the frame ring beside it).
 * @param {any} bot @param {{box: any, centre: Vector3}} frame
 */
export function* enterEndPortal(bot, frame) {
  const from = bot.entity.dimension.id;
  const dim = bot.entity.dimension;
  const c = { x: frame.centre.x + 0.5, y: frame.box.y, z: frame.centre.z + 0.5 };
  // up onto the frame
  const edge = { x: frame.box.x0 - 1, y: frame.box.y, z: Math.floor(frame.centre.z) };
  yield* S.goTo(bot, { ...edge, r: 1.5 }, { tries: 2, maxNodes: 1500, digAny: true });
  bot.saveNow = true;
  for (let t = 0; t < 80; t++) {
    if (!stillIn(bot, from)) return true;
    B.moveTo(bot, c, { tol: 0.1 });
    if (bot.onGround && bot.entity.location.y < c.y + 0.7) B.jump(bot);
    yield;
  }
  if (yield* waitAway(bot, from, 100)) return true;
  // not taken: to the platform, as a player arrives
  if (B.idAt(dim, bot.entity.location) !== m("end_portal") && B.flat(bot.entity.location, c) > 2) return false;
  const end = world.getDimension("the_end");
  const name = "zt_end_" + bot.uid.slice(0, 5);
  if (!(yield* loadAt(end, { x: 100, y: 49, z: 0 }, name))) {
    unload(end, name);
    return false;
  }
  endPlatform(end);
  try {
    bot.entity.teleport({ x: 100.5, y: 49, z: 0.5 }, { dimension: end });
  } catch {
    unload(end, name);
    return false;
  }
  yield* S.wait(20);
  unload(end, name);
  return true;
}

/**
 * Back home from the End: into the exit portal (or an End portal) and out where it respawns.
 * @param {any} bot @param {Vector3} at a portal block
 * @param {() => {dim: any, pos: Vector3}} home where it would come out
 */
export function* exitEnd(bot, at, home) {
  const from = bot.entity.dimension.id;
  yield* S.goTo(bot, { x: Math.floor(at.x), y: Math.floor(at.y) + 1, z: Math.floor(at.z), r: 2.5 }, { tries: 2, maxNodes: 1500 });
  bot.saveNow = true;
  for (let t = 0; t < 60; t++) {
    if (!stillIn(bot, from)) return true;
    B.moveTo(bot, { x: at.x + 0.5, y: at.y, z: at.z + 0.5 }, { tol: 0.1 });
    yield;
  }
  if (yield* waitAway(bot, from, 100)) return true;
  if (B.flat(bot.entity.location, at) > 2.5) return false;
  const h = home();
  try {
    bot.entity.teleport(h.pos, { dimension: h.dim });
  } catch {
    return false;
  }
  return true;
}
