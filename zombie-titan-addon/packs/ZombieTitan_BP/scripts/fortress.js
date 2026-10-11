// The Shroom Fortress: a fortress of Shroomed Brick built into the rock beside one Glowshroom
// cavern in two, its gate opening on the cavern between two towers. Past the gate, a hall where
// Shroomy Crab spawners stand; past the hall, the arena, forty-one blocks across and twenty-two
// high, with the Shroomed Altar on a dais in its middle and a shaft up into its roof, where
// Crabulon waits to be called down (crabulon.js).
//
// A fortress is planned in its own frame (u from the cavern into the rock, v across, h up from
// its floor) and built a slab at a time once all of it is loaded and nobody is standing where it
// goes. Also here: the spawners' behaviour (the zt:crab_spawner custom component) and the
// fortresses the world remembers, which Crabulon's fights look up.
import { BlockPermutation, BlockVolume, GameMode, ItemStack, system, world } from "@minecraft/server";
import * as Glow from "./glowshroom.js";
import * as U from "./util.js";

/** @typedef {import("@minecraft/server").Block} Block */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {import("./glowshroom.js").Cavern} Cavern */

export const BRICKS = "zt:shroomed_bricks";
export const WALL = "zt:shroomed_brick_wall";
export const ALTAR = "zt:shroomed_altar";
export const SPAWNER = "zt:shroomy_crab_spawner";
const AIR = "minecraft:air";
const LANTERN = "minecraft:soul_lantern";
const LIGHT = "minecraft:sea_lantern";

// ---------------------------------------------------------------- the plan, in the fortress's frame
/** The arena's inside (u, v, h ranges), the altar in its middle, and the shaft Crabulon comes down. */
export const ARENA = { u0: 21, u1: 61, v: 20, h: 21 };
export const ALTAR_AT = { u: 41, v: 0, h: 1 };
export const SHAFT = { u: 51, v: 0, half: 6, top: 33 };
/** Where the spawners stand in the hall (on pedestals). */
const SPAWNERS = [{ u: 9, v: -4, h: 1 }, { u: 9, v: 4, h: 1 }];
const CHEST = { u: 16, v: 5, h: 0 };
/** The whole of it, with a block's margin (surveyed before it's built). */
const BOUNDS = { u0: -3, u1: 64, v: 23, h0: -3, h1: 36 };

/**
 * The building steps: [what, u0, v0, h0, u1, v1, h1] (inclusive). First the shells of solid brick,
 * then the insides hollowed out of them.
 * @type {Array<[string, number, number, number, number, number, number]>}
 */
const SHELLS = [
  ["bricks", 0, -8, -2, 19, 8, 11],           // the hall
  ["bricks", 0, -12, -2, 1, 12, 13],          // the gate's wall
  ["bricks", -2, -13, -2, 3, -9, 16],         // its towers
  ["bricks", -2, 9, -2, 3, 13, 16],
  ["bricks", 19, -22, -2, 63, 22, 23],        // the arena
  ["bricks", 43, -8, 22, 59, 8, 35],          // the shaft over it
  ["air", 0, -2, 0, 1, 2, 6],                 // the gate
  ["air", 2, -6, 0, 17, 6, 9],                // the hall's inside
  ["air", 18, -3, 0, 20, 3, 8],               // the way through to the arena
  ["air", ARENA.u0, -ARENA.v, 0, ARENA.u1, ARENA.v, ARENA.h],
  ["air", SHAFT.u - SHAFT.half, -SHAFT.half, ARENA.h + 1, SHAFT.u + SHAFT.half, SHAFT.half, SHAFT.top],
];

/**
 * Where a fortress is: its frame (the gate's middle at u 0, v 0 on its floor), facing `dir`.
 * @typedef {{d: string, c: string, ok: boolean, o?: number[], dir?: number[], altar?: number[],
 *   arena?: number[], shaft?: number[], floor?: number, roof?: number, spawners?: number[][], why?: string}} Fortress
 */

/** A frame: from (u, v, h) to the world. @param {number[]} o @param {number[]} dir */
function frame(o, dir) {
  const [dx, dz] = dir;
  const px = -dz;
  const pz = dx;
  return {
    at: (/** @type {number} */ u, /** @type {number} */ v, /** @type {number} */ h) => ({ x: o[0] + u * dx + v * px, y: o[1] + h, z: o[2] + u * dz + v * pz }),
    /** a box in the frame, as the world's corners @returns {[Vector3, Vector3]} */
    box(/** @type {number} */ u0, /** @type {number} */ v0, /** @type {number} */ h0, /** @type {number} */ u1, /** @type {number} */ v1, /** @type {number} */ h1) {
      const a = this.at(u0, v0, h0);
      const b = this.at(u1, v1, h1);
      return [{ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) },
        { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) }];
    },
    /** the compass direction a block faces when it looks along +u (or -u, +v, -v) */
    facing(/** @type {number} */ du, /** @type {number} */ dv) {
      const x = du * dx + dv * px;
      const z = du * dz + dv * pz;
      return x > 0 ? "east" : x < 0 ? "west" : z > 0 ? "south" : "north";
    },
  };
}

// ---------------------------------------------------------------- the fortresses the world remembers
const KEY = "zt:shroom_fortresses";
/** @type {Fortress[] | null} */
let list = null;
export function fortressList() {
  if (list) return list;
  try {
    const raw = world.getDynamicProperty(KEY);
    list = typeof raw === "string" ? JSON.parse(raw) : [];
  } catch {
    list = [];
  }
  return /** @type {Fortress[]} */ (list);
}
function save() {
  try {
    world.setDynamicProperty(KEY, JSON.stringify(fortressList()));
  } catch {
    /* ignore */
  }
}
/** @param {Cavern} c */
const cavernKey = (c) => `${c.x},${c.y},${c.z}`;
/** The fortress (built) whose arena a point is in. @param {string} dimId @param {Vector3} l @param {number} [margin] */
export function arenaAt(dimId, l, margin = 0) {
  for (const f of fortressList()) {
    if (!f.ok || f.d !== dimId || !f.arena || f.floor === undefined || f.roof === undefined) continue;
    const [x0, z0, x1, z1] = f.arena;
    if (l.x >= x0 - margin && l.x < x1 + 1 + margin && l.z >= z0 - margin && l.z < z1 + 1 + margin &&
        l.y >= f.floor - 2 - margin && l.y <= f.roof + 12 + margin) return f;
  }
  return undefined;
}
/** The fortress an altar belongs to. @param {string} dimId @param {Vector3} at */
export function fortressOfAltar(dimId, at) {
  return fortressList().find((f) => f.ok && f.d === dimId && f.altar &&
    f.altar[0] === Math.floor(at.x) && f.altar[1] === Math.floor(at.y) && f.altar[2] === Math.floor(at.z));
}
/** Is a point anywhere in a fortress (its hall or its arena)? @param {string} dimId @param {Vector3} l */
export function fortressAt(dimId, l) {
  for (const f of fortressList()) {
    if (!f.ok || f.d !== dimId || !f.o || !f.dir) continue;
    const [dx, dz] = f.dir;
    const ru = (l.x - f.o[0]) * dx + (l.z - f.o[2]) * dz;
    const rv = (l.x - f.o[0]) * -dz + (l.z - f.o[2]) * dx;
    const h = l.y - f.o[1];
    if (ru >= -1 && ru <= 63 && Math.abs(rv) <= 22 && h >= -2 && h <= 34) return f;
  }
  return undefined;
}

// ---------------------------------------------------------------- deciding, surveying, building
/** One cavern in two gets a fortress (decided by where it is, so it's always the same one). @param {Cavern} c */
export function wantsFortress(c) {
  const h = Math.imul((c.x * 73856093) ^ (c.y * 19349663) ^ (c.z * 83492791), 2654435761) >>> 0;
  return (h >>> 7) % 2 === 0;
}

/** Things someone built (a fortress keeps clear of them, as a cavern does). */
const BUILT = /^(minecraft:(.*planks|.*_fence|.*_fence_gate|.*_door|.*_trapdoor|chest|barrel|mob_spawner|trial_spawner|vault|rail|.*_rail|cobweb|web|deepslate_bricks|deepslate_tiles|polished_deepslate|reinforced_deepslate|tuff_bricks|polished_tuff|stone_bricks|mossy_stone_bricks|cobblestone|mossy_cobblestone|bookshelf|.*_wool|.*_bed|crafting_table|furnace|torch|lantern|.*_carpet|glass|.*_glass|end_portal_frame|.*copper.*)|zt:(glowshroom_planks|glowshroom_stairs|glowshroom_slab|glowshroom_fence|glowshroom_fence_gate|glowshroom_door|glowshroom_trapdoor|shroomed_bricks|shroomed_brick_wall|shroomed_altar|shroomy_crab_spawner))$/;
const TREE = /^zt:(glowshroom_log|mushed_spore_cap)$/;

/** Fortresses waiting their turn, and when one may be tried again. */
const queue = [];
const pending = new Set();
const retryAt = new Map();
let building = false;
/** How each try went (for tests): cavern key -> "built" | "no room" | "loading" | "unloaded" | "occupied" | "not here". */
export const results = new Map();

/** A cavern is finished: if it's one with a fortress, the fortress is built (in turn). @param {Dimension} dim @param {Cavern} c */
export function consider(dim, c) {
  const key = cavernKey(c);
  if (fortressList().some((f) => f.d === c.d && f.c === key)) return;
  if (!wantsFortress(c)) {
    fortressList().push({ d: c.d, c: key, ok: false, why: "not here" });
    save();
    results.set(key, "not here");
    return;
  }
  if (pending.has(key) || system.currentTick < (retryAt.get(key) ?? 0)) return;
  pending.add(key);
  queue.push({ dim: dim.id, c, key });
  next();
}
function next() {
  if (building || !queue.length) return;
  const job = queue.shift();
  building = true;
  system.runJob(build(job.dim, job.c, (/** @type {string} */ how) => {
    building = false;
    pending.delete(job.key);
    results.set(job.key, how);
    if (how === "loading") {
      // (part of it was out of reach: the ticking area is loading it, so it's tried again soon)
      retryAt.set(job.key, system.currentTick + 40);
      system.runTimeout(() => consider(world.getDimension(job.dim), job.c), 60);
    } else if (how === "unloaded" || how === "occupied") retryAt.set(job.key, system.currentTick + 300);
    else unload(job.dim);
    next();
  }));
}

/** The ticking area that loads a fortress's ground while it's built (one fortress at a time). */
const AREA = "zt_fortress";
let loadingIn;
/** Loads the ground a fortress needs, which may be farther off than the game keeps loaded. @param {Dimension} dim @param {Vector3} lo @param {Vector3} hi */
function load(dim, lo, hi) {
  if (loadingIn) return true;
  try {
    dim.runCommand(`tickingarea add ${lo.x} ${lo.y} ${lo.z} ${hi.x} ${hi.y} ${hi.z} ${AREA}`);
    loadingIn = dim.id;
    return true;
  } catch {
    return false;
  }
}
/** @param {string} dimId */
function unload(dimId) {
  if (!loadingIn) return;
  try {
    world.getDimension(loadingIn ?? dimId).runCommand(`tickingarea remove ${AREA}`);
  } catch {
    /* ignore */
  }
  loadingIn = undefined;
}

/** @param {Dimension} dim @param {number} x @param {number} y @param {number} z */
function idAt(dim, x, y, z) {
  try {
    return dim.getBlock({ x, y, z })?.typeId;
  } catch {
    return undefined;
  }
}
/** @param {string} id */
const empty = (id) => id === AIR || id === "minecraft:cave_air" || /^zt:(spore_grass_plant|spore_mushroom)$/.test(id);

/**
 * Where a fortress could go off one side of a cavern: its gate against the cavern's wall, its
 * floor the cavern's floor there. @param {Dimension} dim @param {Cavern} c @param {number[]} dir
 * @returns {{o: number[]} | string} the frame's origin, or why not
 */
function site(dim, c, dir) {
  const [dx, dz] = dir;
  const y = c.y - 3;
  let edge = -1;
  for (let k = 3; k <= c.r + 8; k++) {
    const id = idAt(dim, c.x + dx * k, y, c.z + dz * k);
    if (id === undefined) return "unloaded";
    if (!empty(id) && !/water/.test(id) && !TREE.test(id)) {
      edge = k;
      break;
    }
  }
  if (edge < 0) return "no wall";
  const ox = c.x + dx * (edge - 1);
  const oz = c.z + dz * (edge - 1);
  for (let fy = y; fy >= c.y - 12; fy--) {
    const id = idAt(dim, ox, fy, oz);
    if (id === undefined) return "unloaded";
    if (empty(id)) continue;
    if (/water|lava/.test(id) || TREE.test(id)) return "wet";
    const floor = fy + 1;
    if (floor < c.y - 10 || floor > c.y - 2 || floor - 3 < dim.heightRange.min + 1) return "no floor";
    return { o: [ox, floor, oz] };
  }
  return "no floor";
}

/**
 * Looks over the ground a fortress would take: all of it loaded, nobody standing there, and
 * nothing built, no tree, pond or aquifer in the way.
 * @param {Dimension} dim @param {Cavern} c @param {ReturnType<typeof frame>} F
 * @returns {Generator<void, string, void>} "ok", or why not
 */
function* survey(dim, c, F) {
  const [lo, hi] = F.box(BOUNDS.u0, -BOUNDS.v, BOUNDS.h0, BOUNDS.u1, BOUNDS.v, BOUNDS.h1);
  try {
    if (dim.getPlayers().some((p) => p.location.x >= lo.x - 3 && p.location.x <= hi.x + 4 && p.location.z >= lo.z - 3 &&
        p.location.z <= hi.z + 4 && p.location.y >= lo.y - 3 && p.location.y <= hi.y + 3)) return "occupied";
  } catch {
    return "occupied";
  }
  // (the ponds are the cavern's; the gate keeps well clear of them)
  for (const q of c.p ?? []) {
    if (q[0] >= lo.x - 6 && q[0] <= hi.x + 6 && q[2] >= lo.z - 6 && q[2] <= hi.z + 6 && Math.abs(q[1] - lo.y) < 20) return "pond";
  }
  let built = 0;
  let wet = 0;
  let trees = 0;
  let ops = 0;
  for (let x = lo.x; x <= hi.x; x += 2) {
    for (let z = lo.z; z <= hi.z; z += 2) {
      for (let y = lo.y; y <= hi.y; y += 2) {
        const id = idAt(dim, x, y, z);
        if (id === undefined) return "unloaded";
        if (BUILT.test(id)) built++;
        else if (/water/.test(id)) wet++;
        else if (TREE.test(id)) trees++;
      }
      if (++ops % 30 === 0) yield;
    }
  }
  if (built > 3) return "built";
  if (wet > 30) return "wet";
  if (trees > 2) return "trees";
  return "ok";
}

/** @param {string} id @param {Record<string, any>} [states] */
function perm(id, states) {
  return BlockPermutation.resolve(id, states);
}
/** Fills a box a few thousand blocks at a time. @param {Dimension} dim @param {[Vector3, Vector3]} box @param {BlockPermutation} p */
function* fill(dim, box, p) {
  const [a, b] = box;
  const layer = (b.x - a.x + 1) * (b.z - a.z + 1);
  const step = Math.max(1, Math.floor(4096 / layer));
  for (let y = a.y; y <= b.y; y += step) {
    dim.fillBlocks(new BlockVolume({ x: a.x, y, z: a.z }, { x: b.x, y: Math.min(b.y, y + step - 1), z: b.z }), p);
    yield;
  }
}
/** @param {Dimension} dim @param {Vector3} at @param {string} id @param {Record<string, any>} [states] */
function put(dim, at, id, states) {
  try {
    dim.setBlockPermutation(at, perm(id, states));
    return true;
  } catch {
    // (a state an older game doesn't know: the block as it comes)
    try {
      if (states) dim.setBlockType(at, id);
      return !!states;
    } catch {
      return false;
    }
  }
}

/** What a fortress's chest holds: [item, least, most, chance]. */
const CHEST_LOOT = [
  ["zt:glowing_particles", 1, 3, 0.6], ["minecraft:diamond", 1, 3, 0.5], ["minecraft:iron_ingot", 2, 6, 0.8],
  ["zt:spore_seeds", 2, 5, 0.7], ["zt:shroom_berries", 1, 3, 0.6], ["zt:shroom_patch", 1, 3, 0.6],
  ["zt:shroomy_crab_claw", 1, 1, 0.4], ["zt:raw_glowite", 1, 1, 0.15], ["minecraft:golden_apple", 1, 1, 0.25],
];
/** @param {Dimension} dim @param {Vector3} at */
function stockChest(dim, at) {
  try {
    const c = dim.getBlock(at)?.getComponent("minecraft:inventory")?.container;
    if (!c) return false;
    let slot = 0;
    for (const [id, lo, hi, p] of CHEST_LOOT) {
      if (Math.random() >= /** @type {number} */ (p)) continue;
      c.setItem(slot, new ItemStack(/** @type {string} */ (id), U.randInt(/** @type {number} */ (lo), /** @type {number} */ (hi))));
      slot += 2 + Math.floor(Math.random() * 2);
      if (slot >= c.size) break;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds a cavern's fortress: tries each side of the cavern (in an order of its own) until one
 * has room, then raises it slab by slab and furnishes it.
 * @param {string} dimId @param {Cavern} c @param {(how: string) => void} done
 */
function* build(dimId, c, done) {
  const dim = world.getDimension(dimId);
  const key = cavernKey(c);
  const sides = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const h = (Math.imul(c.x * 31 + c.z, 2246822519) >>> 0) % 4;
  const order = [...sides.slice(h), ...sides.slice(0, h)];
  /** @type {any} */
  let chosen;
  for (const dir of order) {
    const s = site(dim, c, dir);
    if (s === "unloaded") {
      done("unloaded");
      return;
    }
    if (typeof s === "string") continue;
    const F = frame(s.o, dir);
    const how = yield* survey(dim, c, F);
    if (how === "unloaded") {
      const [lo, hi] = F.box(BOUNDS.u0, -BOUNDS.v, BOUNDS.h0, BOUNDS.u1, BOUNDS.v, BOUNDS.h1);
      done(load(dim, lo, hi) ? "loading" : "unloaded");
      return;
    }
    if (how === "occupied") {
      done(how);
      return;
    }
    if (how === "ok") {
      chosen = { o: s.o, dir, F };
      break;
    }
  }
  if (!chosen) {
    fortressList().push({ d: dimId, c: key, ok: false, why: "no room" });
    save();
    done("no room");
    return;
  }
  const { o, dir, F } = chosen;
  try {
    const bricks = perm(BRICKS);
    const air = perm(AIR);
    for (const [what, u0, v0, h0, u1, v1, h1] of SHELLS) yield* fill(dim, F.box(u0, v0, h0, u1, v1, h1), what === "air" ? air : bricks);
    yield* furnish(dim, F);
  } catch (err) {
    // (a chunk went away while it was being built: it's finished when it's back)
    console.warn("[Titans] Shroom Fortress: " + err);
    done("unloaded");
    return;
  }
  const a = F.at(ALTAR_AT.u, ALTAR_AT.v, ALTAR_AT.h);
  const [lo, hi] = F.box(ARENA.u0, -ARENA.v, 0, ARENA.u1, ARENA.v, 0);
  const sh = F.at(SHAFT.u, SHAFT.v, 0);
  fortressList().push({
    d: dimId, c: key, ok: true, o, dir, altar: [a.x, a.y, a.z], arena: [lo.x, lo.z, hi.x, hi.z], shaft: [sh.x, sh.z],
    floor: o[1], roof: o[1] + ARENA.h, spawners: SPAWNERS.map((s) => {
      const p = F.at(s.u, s.v, s.h);
      return [p.x, p.y, p.z];
    }),
  });
  save();
  done("built");
}

/**
 * The fortress's fittings: battlements, the gate's arch and lanterns, the hall's pillars, lights,
 * spawners and chest, and the arena's pillars, lights, dais and altar.
 * @param {Dimension} dim @param {ReturnType<typeof frame>} F
 */
function* furnish(dim, F) {
  const at = F.at;
  // battlements along the gate's wall and round the towers' tops
  for (let v = -12; v <= 12; v += 2) {
    put(dim, at(0, v, 14), BRICKS);
    put(dim, at(1, v, 14), BRICKS);
  }
  for (const side of [-1, 1]) {
    for (const [u, w] of [[-2, 9], [-2, 13], [3, 9], [3, 13], [-2, 11], [3, 11], [0, 13], [0, 9]]) put(dim, at(u, side * w, 17), BRICKS);
    // a slit window in each tower
    for (let hh = 6; hh <= 8; hh++) put(dim, at(-2, side * 11, hh), WALL);
  }
  // the gate: an arch over it, and lanterns on posts either side
  put(dim, at(0, -2, 6), BRICKS);
  put(dim, at(0, 2, 6), BRICKS);
  put(dim, at(1, -2, 6), BRICKS);
  put(dim, at(1, 2, 6), BRICKS);
  for (const v of [-4, 4]) {
    put(dim, at(-1, v, 0), WALL);
    put(dim, at(-1, v, 1), WALL);
    put(dim, at(-1, v, 2), LANTERN, { hanging: false });
  }
  yield;
  // the hall: pillars along its walls, lights in its ceiling, its spawners and a chest
  for (const u of [4, 8, 12, 16]) {
    for (let hh = 0; hh <= 9; hh++) {
      put(dim, at(u, -6, hh), BRICKS);
      put(dim, at(u, 6, hh), BRICKS);
    }
  }
  for (const u of [3, 7, 11, 15]) put(dim, at(u, 0, 10), LIGHT);
  for (const s of SPAWNERS) {
    put(dim, at(s.u, s.v, s.h - 1), BRICKS);
    put(dim, at(s.u, s.v, s.h), SPAWNER);
  }
  const chest = at(CHEST.u, CHEST.v, CHEST.h);
  put(dim, chest, "minecraft:chest", { "minecraft:cardinal_direction": F.facing(0, -1) });
  if (!stockChest(dim, chest)) system.runTimeout(() => stockChest(dim, chest), 2);
  // the way through to the arena, arched
  for (const v of [-3, 3]) for (const u of [18, 19, 20]) put(dim, at(u, v, 8), BRICKS);
  yield;
  // the arena: pillars round its walls, lights in its walls and in a ring on its floor
  for (const u of [25, 33, 49, 57]) {
    for (let hh = 0; hh <= ARENA.h; hh++) {
      for (const side of [-1, 1]) {
        put(dim, at(u, side * ARENA.v, hh), BRICKS);
        put(dim, at(u + 1, side * ARENA.v, hh), BRICKS);
      }
    }
    yield;
  }
  for (const v of [-14, -6, 6, 14]) {
    for (let hh = 0; hh <= ARENA.h; hh++) {
      put(dim, at(ARENA.u1, v, hh), BRICKS);
      if (Math.abs(v) > 4) put(dim, at(ARENA.u0, v, hh), BRICKS);
    }
  }
  yield;
  for (const hh of [6, 14]) {
    for (const u of [29, 37, 45, 53]) {
      put(dim, at(u, -ARENA.v - 1, hh), LIGHT);
      put(dim, at(u, ARENA.v + 1, hh), LIGHT);
    }
    for (const v of [-10, 0, 10]) put(dim, at(ARENA.u1 + 1, v, hh), LIGHT);
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    put(dim, at(ALTAR_AT.u + Math.round(Math.cos(a) * 13), Math.round(Math.sin(a) * 13), -1), LIGHT);
  }
  // the dais, lanterns at its corners, and the altar
  for (let u = ALTAR_AT.u - 3; u <= ALTAR_AT.u + 3; u++) for (let v = -3; v <= 3; v++) put(dim, at(u, v, 0), BRICKS);
  for (const u of [ALTAR_AT.u - 4, ALTAR_AT.u + 4]) {
    for (const v of [-4, 4]) {
      put(dim, at(u, v, 0), WALL);
      put(dim, at(u, v, 1), WALL);
      put(dim, at(u, v, 2), LANTERN, { hanging: false });
    }
  }
  put(dim, at(ALTAR_AT.u, ALTAR_AT.v, ALTAR_AT.h), ALTAR);
  yield;
}

// ---------------------------------------------------------------- the spawners
export const CRAB = "zt:shroomy_crab";
/** When each spawner (by where it is) next brings out crabs. */
const spawnerNext = new Map();
/** A spawner's tick: with a player within 16 blocks, its flames, and now and then a crab or three. @param {Block} block */
export function spawnerTick(block) {
  const dim = block.dimension;
  const l = block.location;
  const at = { x: l.x + 0.5, y: l.y + 0.5, z: l.z + 0.5 };
  let near;
  try {
    near = dim.getPlayers({ location: at, maxDistance: 16 });
  } catch {
    return [];
  }
  if (!near.some((p) => {
    try {
      return p.getGameMode() !== GameMode.Spectator;
    } catch {
      return false;
    }
  })) return [];
  U.particle(dim, "zt:spawner_flame", at);
  const key = `${dim.id}|${l.x},${l.y},${l.z}`;
  const now = system.currentTick;
  if (!spawnerNext.has(key)) spawnerNext.set(key, now + U.randInt(40, 200));
  if (now < spawnerNext.get(key)) return [];
  spawnerNext.set(key, now + U.randInt(200, 800));
  let crabs = 0;
  try {
    crabs = dim.getEntities({ location: at, maxDistance: 9, type: CRAB }).length;
  } catch {
    return [];
  }
  const out = [];
  for (let n = Math.min(6 - crabs, U.randInt(1, 3)), tries = 0; n > 0 && tries < 12; tries++) {
    const x = l.x + U.randInt(-4, 4);
    const z = l.z + U.randInt(-4, 4);
    for (let y = l.y + 1; y >= l.y - 1; y--) {
      const here = idAt(dim, x, y, z);
      const below = idAt(dim, x, y - 1, z);
      if (here !== AIR || !below || empty(below) || /water|lava/.test(below) || below === SPAWNER) continue;
      try {
        const crab = dim.spawnEntity(CRAB, { x: x + 0.5, y, z: z + 0.5 });
        out.push(crab);
        U.particle(dim, "zt:spore_pop", { x: x + 0.5, y: y + 0.4, z: z + 0.5 });
        n--;
      } catch {
        /* ignore */
      }
      break;
    }
  }
  if (out.length) U.sound(dim, "trial_spawner.spawn_mob", at, 0.8, 1.2);
  return out;
}
/** A player broke a spawner: experience, as a vanilla spawner gives. @param {Player | undefined} p */
export function spawnerBroken(p) {
  try {
    if (p && U.isVulnerablePlayer(p)) p.addExperience(U.randInt(15, 43));
  } catch {
    /* ignore */
  }
}

system.beforeEvents.startup.subscribe((ev) => {
  try {
    ev.blockComponentRegistry.registerCustomComponent("zt:crab_spawner", {
      onTick: (/** @type {any} */ e) => {
        try {
          spawnerTick(e.block);
        } catch (err) {
          console.warn("[Titans] crab spawner: " + err);
        }
      },
      onPlayerBreak: (/** @type {any} */ e) => spawnerBroken(e.player),
    });
  } catch (err) {
    console.warn("[Titans] can't register zt:crab_spawner: " + err);
  }
});

// ---------------------------------------------------------------- each tick
const titleAt = new Map();
const inside = new Map();
/** @param {number} tick */
export function fortressTick(tick) {
  if (tick % 20 !== 15) return;
  for (const p of world.getAllPlayers()) {
    let dimId;
    try {
      dimId = p.dimension.id;
    } catch {
      continue;
    }
    // a cavern whose fortress was never decided (grown before there were fortresses, or the world
    // closed before it was built): decided now
    if (tick % 100 === 15) {
      const c = Glow.cavernAt(dimId, p.location);
      if (c && c.v === 2) consider(p.dimension, c);
    }
    const f = fortressAt(dimId, p.location);
    const was = inside.get(p.id);
    inside.set(p.id, f?.c);
    if (f && f.c !== was && tick - (titleAt.get(p.id) ?? -99999) > 1200) {
      titleAt.set(p.id, tick);
      try {
        p.onScreenDisplay.setTitle("§bShroom Fortress", { fadeInDuration: 10, stayDuration: 50, fadeOutDuration: 20, subtitle: "§3where Crabulon sleeps" });
      } catch {
        /* ignore */
      }
    }
  }
}

/** @param {string} id */
export function forgetPlayer(id) {
  titleAt.delete(id);
  inside.delete(id);
}

Glow.cavernHooks.push((dim, c) => consider(dim, c));
