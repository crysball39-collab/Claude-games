// Building, as a player builds: its first house (a little hut of planks or cobblestone with a
// door, a bed, a chest, a crafting table, a furnace and torches, put up block by block from
// inside), a Nether portal (an obsidian frame set into the ground, lit with flint and steel),
// and the End portal in a stronghold (an eye of ender in each frame).
import { system } from "@minecraft/server";
import * as B from "./bot_body.js";
import * as D from "./bot_data.js";
import * as G from "./bot_gather.js";
import * as Inv from "./bot_inv.js";
import * as S from "./bot_skills.js";
import * as W from "./bot_world.js";
import { perm } from "./doors_build.js";
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

const m = D.mc;
/** Blocks a hut takes (walls, roof and a few to fill the floor). */
export const HUT_BLOCKS = 75;
const mid = (p) => ({ x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 });
const add = (o, x, y, z) => ({ x: o.x + x, y: o.y + y, z: o.z + z });

/** What it builds with: planks or cobblestone, whichever it has more of. @param {any} bot */
export function wallMaterial(bot) {
  return Inv.count(bot, m("cobblestone")) > Inv.count(bot, "planks") ? m("cobblestone") : "planks";
}

/**
 * Somewhere for a 5 by 5 hut near a point: level ground, little to clear, no water, nobody's
 * build in the way. Its corner (at floor level), or undefined.
 * @param {any} bot @param {Vector3} around
 */
export function hutSite(bot, around) {
  const dim = bot.entity.dimension;
  const protect = S.protector(bot);
  let best;
  let bestScore = Infinity;
  for (let r = 0; r <= 15; r += 3) {
    for (let a = 0; a < (r ? 8 : 1); a++) {
      const cx = Math.floor(around.x + Math.cos((a * Math.PI) / 4) * r);
      const cz = Math.floor(around.z + Math.sin((a * Math.PI) / 4) * r);
      let top;
      try {
        top = dim.getTopmostBlock({ x: cx, z: cz });
      } catch {
        continue;
      }
      if (!top || /leaves|log|water|lava/.test(top.typeId)) continue;
      const y = top.location.y + 1;
      let score = r * 0.4;
      let bad = false;
      for (let dx = -1; dx <= 5 && !bad; dx++) {
        for (let dz = -1; dz <= 5 && !bad; dz++) {
          const x = cx - 2 + dx;
          const z = cz - 2 + dz;
          const inside = dx >= 0 && dx <= 4 && dz >= 0 && dz <= 4;
          const below = B.idAt(dim, { x, y: y - 1, z });
          if (/water|lava/.test(below)) bad = true;
          if (inside && !D.isFloor(below)) score += 2;
          for (let dy = 0; dy < (inside ? 4 : 2); dy++) {
            const id = B.idAt(dim, { x, y: y + dy, z });
            const k = D.blockInfo(id).kind;
            if (k === "liquid" || k === "lava" || k === "portal") bad = true;
            else if (k !== "air" && k !== "pass") {
              if (protect(x, y + dy, z, id)) bad = true;
              else score += inside ? 1 : 0.5;
            }
          }
        }
      }
      if (bad) continue;
      if (score < bestScore) {
        bestScore = score;
        best = { x: cx - 2, y, z: cz - 2 };
      }
    }
  }
  return bestScore < 30 ? best : undefined;
}

/**
 * Its first house: get the blocks and furniture together, find a spot, clear it, and build
 * from inside: walls three high with a door, a flat roof, then a bed, a chest, a crafting
 * table, a furnace and torches. The bed becomes where it respawns.
 * @param {any} bot
 */
export function* buildHome(bot) {
  if (!bot.world.build || bot.entity.dimension.id !== "minecraft:overworld") return false;
  G.doing(bot, "building a house");
  const mat = wallMaterial(bot);
  if (!(yield* G.obtain(bot, mat, HUT_BLOCKS))) return false;
  for (const [id, n] of /** @type {Array<[string, number]>} */ ([[m("wooden_door"), 1], [m("bed"), 1], [m("chest"), 1], [m("crafting_table"), 1],
    [m("furnace"), 1], [m("torch"), 3]])) {
    if (Inv.count(bot, id) < n && !(yield* G.obtain(bot, id, n))) {
      if (id === m("torch")) continue;
      return false;
    }
  }
  if (G.underground(bot)) yield* G.toSurface(bot);
  const o = hutSite(bot, bot.entity.location);
  if (!o) {
    yield* G.explore(bot, { far: 32 });
    return false;
  }
  G.doing(bot, "building a house");
  const centre = add(o, 2, 0, 2);
  if (!(yield* S.goTo(bot, { ...centre, r: 0.4 }, { tries: 3 }))) return false;
  const dim = bot.entity.dimension;
  const isWall = (x, z) => x === 0 || x === 4 || z === 0 || z === 4;
  const isDoor = (x, y, z) => x === 2 && z === 0 && y <= 1;
  // clear the inside, the doorway and the step in front of it; flowers and grass where walls go
  for (let y = 3; y >= 0; y--) {
    for (let x = 0; x <= 4; x++) {
      for (let z = -1; z <= 4; z++) {
        if (z === -1 && (x !== 2 || y > 1)) continue;
        const p = add(o, x, y, z);
        const k = D.blockInfo(B.idAt(dim, p)).kind;
        if (k === "air") continue;
        const mustClear = !isWall(x, z) || isDoor(x, y, z) || z === -1 || k === "pass" || k === "climb";
        if (y === 3 && k !== "pass") continue;
        if (mustClear && !(yield* S.mineBlock(bot, p, { noCollect: true }))) return false;
      }
    }
  }
  yield* S.collect(bot, centre, 4, 40);
  if (!(yield* S.goTo(bot, { ...centre, r: 0.4 }, { tries: 2 }))) return false;
  const test = mat === "planks" ? (id) => D.GROUPS.planks.includes(id) : (id) => id === mat;
  // a floor where the ground has holes
  for (let x = 1; x <= 3; x++) {
    for (let z = 1; z <= 3; z++) {
      const p = add(o, x, -1, z);
      if (!D.isFloor(B.idAt(dim, p))) yield* S.placeBlock(bot, p, test);
    }
  }
  // walls, bottom up, then the roof
  for (let y = 0; y <= 3; y++) {
    for (let x = 0; x <= 4; x++) {
      for (let z = 0; z <= 4; z++) {
        if (y < 3 && (!isWall(x, z) || isDoor(x, y, z))) continue;
        const p = add(o, x, y, z);
        if (D.isFloor(B.idAt(dim, p))) continue;
        if (!(yield* S.placeBlock(bot, p, test))) {
          if (!Inv.has(bot, test)) return false;
        }
      }
    }
    // keep standing in the middle
    if (B.flat(bot.entity.location, { x: centre.x + 0.5, z: centre.z + 0.5 }) > 0.6) yield* S.goTo(bot, { ...centre, r: 0.3 }, { tries: 1 });
  }
  // the door, facing out
  yield* S.placeBlock(bot, add(o, 2, 0, 0), m("wooden_door"), { yaw: 180 });
  // inside: the bed along the left wall, the chest, crafting table and furnace at the back
  const bed = add(o, 1, 0, 2);
  yield* S.placeBlock(bot, bed, (id) => id === m("bed") || /_bed$/.test(id), { yaw: 0 });
  const chest = add(o, 3, 0, 3);
  yield* S.placeBlock(bot, chest, m("chest"), { yaw: 180 });
  const table = add(o, 3, 0, 2);
  yield* S.placeBlock(bot, table, m("crafting_table"));
  const furnace = add(o, 2, 0, 3);
  yield* S.placeBlock(bot, furnace, m("furnace"), { yaw: 180 });
  yield* S.placeBlock(bot, add(o, 1, 0, 1), m("torch"));
  // torches either side of the door, outside
  for (const tx of [1, 3]) {
    const p = add(o, tx, 0, -1);
    if (D.isFloor(B.idAt(dim, { ...p, y: p.y - 1 })) && B.blockAt(dim, p)?.isAir) yield* S.placeBlock(bot, p, m("torch"));
  }
  bot.home = { dim: dim.id, pos: centre, corner: o, door: add(o, 2, 0, 0), bed, chests: [chest], stash: {},
    stations: { crafting_table: table, furnace } };
  if (B.idAt(dim, bed).includes("bed")) bot.spawn = { dim: dim.id, pos: bed };
  bot.events.push({ kind: "built_home", at: system.currentTick });
  return true;
}

// ---------------------------------------------------------------- the Nether portal
/**
 * A place for a portal near home: four blocks wide in a line, five high, set one block into
 * level ground, with room to walk up to it from either side.
 * @param {any} bot @param {Vector3} around
 */
export function portalSite(bot, around) {
  const dim = bot.entity.dimension;
  const protect = S.protector(bot);
  for (let r = 3; r <= 16; r += 2) {
    for (let a = 0; a < 12; a++) {
      const x0 = Math.floor(around.x + Math.cos((a * Math.PI) / 6) * r);
      const z0 = Math.floor(around.z + Math.sin((a * Math.PI) / 6) * r);
      let top;
      try {
        top = dim.getTopmostBlock({ x: x0, z: z0 });
      } catch {
        continue;
      }
      if (!top) continue;
      const y = top.location.y + 1;
      let ok = true;
      for (let dx = -1; dx <= 4 && ok; dx++) {
        for (let dz = -1; dz <= 1 && ok; dz++) {
          const ground = B.idAt(dim, { x: x0 + dx, y: y - 1, z: z0 + dz });
          if (!D.isFloor(ground) || (dz === 0 && dx >= 1 && dx <= 2 && protect(x0 + dx, y - 1, z0, ground))) ok = false;
          for (let dy = 0; dy <= (dz === 0 ? 3 : 2) && ok; dy++) {
            const k = D.blockInfo(B.idAt(dim, { x: x0 + dx, y: y + dy, z: z0 + dz })).kind;
            if (k !== "air" && k !== "pass") ok = false;
          }
        }
      }
      if (ok) return { x: x0, y, z: z0 };
    }
  }
  return undefined;
}

/**
 * Build a Nether portal and light it: ten obsidian (the corners left out), the bottom set
 * into the ground so it walks straight in, flint and steel to the inside.
 * @param {any} bot
 */
export function* buildPortal(bot) {
  const dim = bot.entity.dimension;
  if (dim.id !== "minecraft:overworld" || !bot.world.build) return false;
  if (!(yield* G.obtain(bot, m("obsidian"), 10))) return false;
  if (!(yield* G.obtain(bot, m("flint_and_steel"), 1))) return false;
  G.doing(bot, "building a Nether portal");
  const near = bot.home && bot.home.dim === dim.id ? bot.home.pos : bot.entity.location;
  if (G.underground(bot)) yield* G.toSurface(bot);
  const o = portalSite(bot, near) ?? portalSite(bot, bot.entity.location);
  if (!o) {
    yield* G.explore(bot, { far: 24 });
    return false;
  }
  const stand = { x: o.x + 1, y: o.y, z: o.z + 2 };
  if (!(yield* S.goTo(bot, { ...stand, r: 1.2 }, { tries: 3 }))) return false;
  const ob = (id) => id === m("obsidian");
  // the bottom, in the ground
  for (const x of [1, 2]) {
    const p = add(o, x, -1, 0);
    if (B.idAt(dim, p) !== m("obsidian")) {
      if (!(yield* S.mineBlock(bot, p, { noCollect: true }))) return false;
      if (!(yield* S.placeBlock(bot, p, ob))) return false;
    }
  }
  // the sides, bottom up, and the top
  for (const [x, y] of [[0, 0], [3, 0], [0, 1], [3, 1], [0, 2], [3, 2], [1, 3], [2, 3]]) {
    const p = add(o, x, y, 0);
    if (B.idAt(dim, p) === m("obsidian")) continue;
    if (!(yield* S.placeBlock(bot, p, ob))) return false;
  }
  // light it
  if (!Inv.hold(bot, m("flint_and_steel"))) return false;
  B.lookAt(bot, mid(add(o, 1, 0, 0)), 20, 4);
  yield* S.wait(8);
  B.swing(bot);
  const pm = perm({ id: "minecraft:portal", states: { portal_axis: "x" } });
  if (!pm) return false;
  try {
    dim.playSound("fire.ignite", mid(add(o, 1, 0, 0)), { volume: 1, pitch: 1 });
    for (const x of [1, 2]) for (let y = 0; y <= 2; y++) dim.setBlockPermutation(add(o, x, y, 0), pm);
    dim.playSound("portal.trigger", mid(add(o, 1, 1, 0)), { volume: 0.6, pitch: 1 });
  } catch {
    return false;
  }
  if (Inv.wearHeld(bot, 1) === "broke") S.onToolBroke(bot, m("flint_and_steel"));
  const at = add(o, 1, 0, 0);
  bot.known.portal = { dim: dim.id, pos: at };
  W.remember("portal", dim.id, at, { by: bot.name }, 8);
  bot.events.push({ kind: "built_portal", at: system.currentTick });
  return true;
}

// ---------------------------------------------------------------- the End portal
/** The frame blocks of a portal room near a point, and the hole in their middle. @param {any} dim @param {Vector3} near */
export function endFrame(dim, near) {
  const frames = S.findBlocks(dim, near, [m("end_portal_frame")], 12, 6);
  if (frames.length < 4) return undefined;
  const y = frames[0].y;
  const ring = frames.filter((f) => f.y === y);
  const xs = ring.map((f) => f.x);
  const zs = ring.map((f) => f.z);
  const box = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), y };
  const centre = { x: (box.x0 + box.x1) / 2, y, z: (box.z0 + box.z1) / 2 };
  return { frames: ring, box, centre };
}
/** @param {any} dim @param {Vector3} p */
function hasEye(dim, p) {
  try {
    return !!dim.getBlock(p)?.permutation.getState("end_portal_eye_bit");
  } catch {
    return false;
  }
}
/** How many eyes the frame still needs. @param {any} dim @param {Vector3} near */
export function eyesNeeded(dim, near) {
  const f = endFrame(dim, near);
  if (!f) return 12;
  return f.frames.filter((p) => !hasEye(dim, p)).length + Math.max(0, 12 - f.frames.length);
}
/** Is the portal open? @param {any} dim @param {Vector3} near */
export function endPortalOpen(dim, near) {
  return S.findBlocks(dim, near, [m("end_portal")], 8, 3).length > 0;
}

/**
 * Put an eye of ender in each empty frame; with all twelve in, the portal opens.
 * @param {any} bot @param {Vector3} near
 */
export function* lightEndPortal(bot, near) {
  const dim = bot.entity.dimension;
  const f = endFrame(dim, near);
  if (!f) return false;
  if (endPortalOpen(dim, f.centre)) return true;
  G.doing(bot, "putting eyes of ender in the portal");
  for (const p of f.frames) {
    if (hasEye(dim, p)) continue;
    if (!Inv.has(bot, m("ender_eye"))) return false;
    if (B.dist(B.eye(bot), mid(p)) > 4.2) {
      // stand on the room floor beside the frame, outside the ring
      const out = { x: Math.sign(p.x - f.centre.x), z: Math.sign(p.z - f.centre.z) };
      const ok = yield* S.goTo(bot, { x: p.x + out.x, y: p.y, z: p.z + out.z, r: 2 }, { tries: 2, maxNodes: 1500, digAny: true });
      if (!ok) return false;
    }
    Inv.hold(bot, m("ender_eye"));
    B.lookAt(bot, mid(p), 12, 4);
    yield* S.wait(6);
    B.swing(bot);
    try {
      const b = dim.getBlock(p);
      b.setPermutation(b.permutation.withState("end_portal_eye_bit", true));
      dim.playSound("block.end_portal_frame.fill", mid(p), { volume: 1, pitch: 1 });
    } catch {
      return false;
    }
    Inv.take(bot, m("ender_eye"), 1);
  }
  if (f.frames.length < 12 || f.frames.some((p) => !hasEye(dim, p))) return false;
  const pm = perm({ id: "minecraft:end_portal" });
  if (!pm) return false;
  try {
    for (let x = f.box.x0 + 1; x < f.box.x1; x++) for (let z = f.box.z0 + 1; z < f.box.z1; z++) dim.setBlockPermutation({ x, y: f.box.y, z }, pm);
    dim.playSound("block.end_portal.spawn", f.centre, { volume: 1, pitch: 1 });
  } catch {
    return false;
  }
  W.remember("stronghold", dim.id, f.centre, { room: f.centre, open: true }, 64);
  bot.events.push({ kind: "end_portal", at: system.currentTick });
  return true;
}
