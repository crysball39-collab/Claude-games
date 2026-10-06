// Door 50: the Library (DOORS). The "Door 50 Library" item builds the room in front of you:
// a hotel corridor, door 50, and the two-storey library behind it, with bookshelves all
// around, the librarian's desk on the left, two staircases up to the balcony and door 51,
// padlocked, at the top. Walk in and the Figure is waiting.
//
// Ten books are hidden on the bookshelves; each shows a shape and the digit it stands for.
// The solution paper on the desk shows which five shapes make the padlock's code, in order.
// Enter the five digits on door 51's padlock and escape. The Figure is blind but hears
// footsteps; crouch to move silently.
import { world } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { build, candles, Frame, isLoaded, fitsHeight, joined, lantern, pillar, Plan, slab, stairs } from "./doors_build.js";
import * as Doors from "./doors_common.js";
import * as Fig from "./figure.js";
import { isValid, particle } from "./util.js";

/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("./doors_common.js").Run} Run */
/** @typedef {{ r: number, u: number, f: number, lv?: number }} Local */

export const ITEM = "zt:door_50";
export const SHAPES = ["triangle", "square", "circle", "star", "diamond", "hexagon", "pentagon", "cross", "heart", "crescent"];
const NAME = Object.fromEntries(SHAPES.map((s) => [s, s[0].toUpperCase() + s.slice(1)]));

// ---- the layout, in frame cells (r: right, u: up, f: forward from the player) ----------------
const HALL = { r0: -15, r1: 14, f0: 9, f1: 48, u1: 12 };
const BAL_U = 7;                      // walking height on the balcony (its floor blocks are at u 6)
const BAL_F0 = 41;
const STAIR_F0 = 34;
const STAIR_F1 = 40;
const STAIRS = [{ r0: -15, r1: -13 }, { r0: 12, r1: 14 }];
const ANTE = { r0: -3, r1: 2, f0: 0, f1: 7, u1: 4 };
const EXIT = { r0: -2, r1: 1, f0: 50, f1: 55 };
const DOOR50 = { r: -1, u: 0, f: 8 };
const DOOR51 = { r: -1, u: 7, f: 49 };
export const BOUNDS = [-16, -1, -1, 15, 13, 56];
const ROWS_F = [[15, 16], [20, 21], [25, 26], [30, 31]];
const ROWS_R = [[-13, -4], [3, 12]];
const UNDER_ROWS = { f: [45, 46], r: [[-11, -4], [3, 10]] };
const LAMP = { r: -5.5, f: 11.5 };
const FIGURE_START = { r: 9.5, u: 0, f: 18.5 };

const B = {
  air: "minecraft:air",
  floor: "zt:hotel_floor",
  ceiling: "zt:hotel_ceiling",
  wallpaper: "zt:hotel_wallpaper",
  wainscot: "zt:hotel_wainscot",
  trim: "zt:hotel_trim",
  shelf: "zt:library_shelf",
  planks: "minecraft:dark_oak_planks",
  slab: "minecraft:dark_oak_slab",
  carpet: "minecraft:red_carpet",
  log: "minecraft:stripped_dark_oak_log",
  light: "minecraft:light_block_6",
  glow: "minecraft:sea_lantern",
};

function key(r, f) {
  return r + "," + f;
}

/** A tiny seeded random generator so a run's layout can be rebuilt the same. */
export function rngFrom(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** A hotel room's shell: floor, ceiling, wainscoted and papered walls, emptied inside. */
function hotelShell(plan, r0, r1, f0, f1, u0, u1, paper = B.wallpaper) {
  plan.box(r0 - 1, u0 - 1, f0 - 1, r1 + 1, u1 + 1, f1 + 1, B.wainscot);
  plan.box(r0 - 1, u0 + 2, f0 - 1, r1 + 1, u1 - 1, f1 + 1, paper);
  plan.box(r0 - 1, u1, f0 - 1, r1 + 1, u1, f1 + 1, B.trim);
  plan.box(r0 - 1, u0 - 1, f0 - 1, r1 + 1, u0 - 1, f1 + 1, B.floor);
  plan.box(r0 - 1, u1 + 1, f0 - 1, r1 + 1, u1 + 1, f1 + 1, B.ceiling);
  plan.box(r0, u0, f0, r1, u1, f1, B.air);
}

/** A 2-wide, 3-tall doorway in a wall at row f, framed in dark wood. @param {Frame} fr */
function doorway(plan, fr, r, u, f) {
  plan.box(r - 1, u, f, r + 2, u + 3, f, B.log);
  plan.set(r - 1, u + 3, f, pillar(fr, B.log, "r"));
  plan.set(r + 2, u + 3, f, pillar(fr, B.log, "r"));
  plan.box(r, u + 3, f, r + 1, u + 3, f, pillar(fr, B.log, "r"));
  plan.box(r, u, f, r + 1, u + 2, f, B.air);
}

/**
 * Everything about the room that the build, the Figure and the puzzle need.
 * @param {Frame} fr @param {() => number} rng
 */
export function layout(fr, rng, floor = false) {
  const plan = new Plan();
  const ground = new Set();       // cells (r,f) the Figure can't walk on the floor
  const balcony = new Set();      // cells it can't walk on the balcony
  /** @type {number[][]} */
  const shelves = [];             // [r, u, f] library-shelf blocks that can hold a book
  const block = (set, r0, f0, r1, f1) => {
    for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) {
      for (let f = Math.min(f0, f1); f <= Math.max(f0, f1); f++) set.add(key(r, f));
    }
  };

  // ---- shells: the corridor before door 50, the hall, the little room after door 51
  hotelShell(plan, ANTE.r0, ANTE.r1, ANTE.f0, ANTE.f1, 0, ANTE.u1);
  // the hall's walls are bookshelves up to the balcony, paper above
  plan.box(HALL.r0 - 1, -1, HALL.f0 - 1, HALL.r1 + 1, HALL.u1 + 1, HALL.f1 + 1, B.shelf);
  plan.box(HALL.r0 - 1, 5, HALL.f0 - 1, HALL.r1 + 1, HALL.u1 - 1, HALL.f1 + 1, B.wallpaper);
  plan.box(HALL.r0 - 1, BAL_U, HALL.f1 + 1, HALL.r1 + 1, BAL_U + 3, HALL.f1 + 1, B.shelf);
  plan.box(HALL.r0 - 1, HALL.u1, HALL.f0 - 1, HALL.r1 + 1, HALL.u1, HALL.f1 + 1, B.trim);
  plan.box(HALL.r0 - 1, -1, HALL.f0 - 1, HALL.r1 + 1, -1, HALL.f1 + 1, B.floor);
  plan.box(HALL.r0 - 1, HALL.u1 + 1, HALL.f0 - 1, HALL.r1 + 1, HALL.u1 + 1, HALL.f1 + 1, B.ceiling);
  plan.box(HALL.r0, 0, HALL.f0, HALL.r1, HALL.u1, HALL.f1, B.air);
  hotelShell(plan, EXIT.r0, EXIT.r1, EXIT.f0, EXIT.f1, BAL_U, BAL_U + 3, "zt:hotel_wallpaper_green");
  // the way in: an open doorway at the back of the corridor (in the hotel, door 49's doorway)
  if (floor) doorway(plan, fr, -1, 0, ANTE.f0 - 1);
  else plan.box(-1, 0, ANTE.f0 - 1, 0, 2, ANTE.f0 - 1, B.air);
  // door 50 and door 51
  doorway(plan, fr, DOOR50.r, DOOR50.u, DOOR50.f);
  doorway(plan, fr, DOOR51.r, DOOR51.u, DOOR51.f);
  // wall shelves facing into the hall can hold books (not around the doors)
  for (let u = 0; u <= 2; u++) {
    for (let f = HALL.f0 + 2; f <= HALL.f1; f++) {
      shelves.push([HALL.r0 - 1, u, f], [HALL.r1 + 1, u, f]);
    }
    for (let r = HALL.r0; r <= HALL.r1; r++) if (r < -3 || r > 2) shelves.push([r, u, HALL.f1 + 1]);
  }
  for (let u = BAL_U; u <= BAL_U + 2; u++) {
    for (let r = HALL.r0; r <= HALL.r1; r++) if (r < -3 || r > 2) shelves.push([r, u, HALL.f1 + 1]);
  }

  // ---- the corridor (room 49)
  plan.box(-1, 0, ANTE.f0, 0, 0, ANTE.f1, B.carpet);
  plan.set(ANTE.r1, 0, 3, slab(B.slab, true));
  plan.set(ANTE.r1, 1, 3, lantern(false));
  plan.set(ANTE.r0, 0, 5, slab(B.slab, true));
  plan.set(ANTE.r0, 1, 5, candles(3));
  plan.set(-1, ANTE.u1, 2, pillar(fr, "minecraft:iron_chain", "u"));
  plan.set(-1, ANTE.u1 - 1, 2, lantern(true));

  // ---- the hall's floor: a red runner up the middle and a rug at the back
  plan.box(-1, 0, HALL.f0, 0, 0, 32, B.carpet);
  plan.box(-3, 0, 34, 2, 0, 39, B.carpet);

  // the librarian's desk, on the left as you come in, with the solution paper on it
  plan.box(-13, 0, 12, -8, 0, 12, B.planks);
  plan.box(-8, 0, 10, -8, 0, 11, B.planks);
  block(ground, -13, 12, -8, 12);
  block(ground, -8, 10, -8, 11);
  plan.set(-12, 1, 12, candles(3));
  plan.set(-8, 1, 10, lantern(false));
  plan.set(-10, 0, 13, stairs(fr, "minecraft:dark_oak_stairs", "f"));
  block(ground, -10, 13, -10, 13);
  const paper = { r: -10.4, u: 1.0, f: 12.45 };

  // reading tables on the right
  for (const [r0, r1] of [[5, 7], [10, 12]]) {
    plan.box(r0, 0, 11, r1, 0, 11, slab(B.slab, true));
    plan.set(r0 + 1, 1, 11, candles(2));
    plan.set(r0, 0, 10, stairs(fr, "minecraft:dark_oak_stairs", "b"));
    plan.set(r1, 0, 12, stairs(fr, "minecraft:dark_oak_stairs", "f"));
    block(ground, r0, 10, r1, 12);
  }

  // ---- the stacks: double-sided shelves four high, with gaps to cut through
  const cuts = [new Set([1, 3]), new Set([0, 2])];
  ROWS_R.forEach(([r0, r1], side) => {
    ROWS_F.forEach(([f0, f1], i) => {
      const gap = cuts[side].has(i) ? (side === 0 ? [-9, -8] : [7, 8]) : null;
      for (let r = r0; r <= r1; r++) {
        if (gap && r >= gap[0] && r <= gap[1]) continue;
        plan.box(r, 0, f0, r, 3, f1, B.shelf);
        block(ground, r, f0, r, f1);
        for (let u = 0; u <= 2; u++) shelves.push([r, u, f0], [r, u, f1]);
      }
      for (const end of [r0, r1]) for (let u = 0; u <= 2; u++) shelves.push([end, u, f0], [end, u, f1]);
    });
  });

  // ---- the staircases up to the balcony (one may be blocked by a heap of fallen shelves)
  const blocked = rng() < 0.5 ? (rng() < 0.5 ? 0 : 1) : -1;
  STAIRS.forEach((s, i) => {
    for (let k = 0; k <= STAIR_F1 - STAIR_F0; k++) {
      const f = STAIR_F0 + k;
      if (k > 0) plan.box(s.r0, 0, f, s.r1, k - 1, f, B.planks);
      plan.box(s.r0, k, f, s.r1, k, f, stairs(fr, "minecraft:dark_oak_stairs", "f"));
    }
    block(ground, s.r0, STAIR_F0, s.r1, STAIR_F1);
    // a banister along the open side
    const rail = i === 0 ? s.r1 + 1 : s.r0 - 1;
    for (let k = 1; k <= STAIR_F1 - STAIR_F0; k++) {
      plan.set(rail, k, STAIR_F0 + k, joined(fr, "minecraft:dark_oak_fence", ["f", "b"]));
      block(ground, rail, STAIR_F0 + k, rail, STAIR_F0 + k);
    }
    if (i === blocked) {
      for (const f of [37, 38]) {
        const k = f - STAIR_F0;
        plan.box(s.r0, k + 1, f, s.r1, k + 2, f, B.shelf);
        plan.set(s.r0 + 1, k + 3, f, "minecraft:barrel");
      }
    }
  });

  // ---- the balcony across the back, its railing and pillars, and shelves underneath
  plan.box(HALL.r0, BAL_U - 1, BAL_F0, HALL.r1, BAL_U - 1, HALL.f1, B.planks);
  for (let r = STAIRS[0].r1 + 1; r <= STAIRS[1].r0 - 1; r++) {
    const dirs = [];
    if (r > STAIRS[0].r1 + 1) dirs.push("l");
    if (r < STAIRS[1].r0 - 1) dirs.push("r");
    plan.set(r, BAL_U, BAL_F0, joined(fr, "minecraft:dark_oak_fence", dirs));
    balcony.add(key(r, BAL_F0));
  }
  for (const r of [-8, -3, 2, 7]) {
    plan.box(r, 0, BAL_F0, r, BAL_U - 2, BAL_F0, pillar(fr, B.log, "u"));
    block(ground, r, BAL_F0, r, BAL_F0);
  }
  for (const [r0, r1] of UNDER_ROWS.r) {
    plan.box(r0, 0, UNDER_ROWS.f[0], r1, 3, UNDER_ROWS.f[1], B.shelf);
    block(ground, r0, UNDER_ROWS.f[0], r1, UNDER_ROWS.f[1]);
    for (let r = r0; r <= r1; r++) for (let u = 0; u <= 2; u++) shelves.push([r, u, UNDER_ROWS.f[0]], [r, u, UNDER_ROWS.f[1]]);
  }
  // short stacks on the balcony
  for (const [r0, r1] of [[-12, -6], [5, 11]]) {
    plan.box(r0, BAL_U, 45, r1, BAL_U + 2, 45, B.shelf);
    block(balcony, r0, 45, r1, 45);
    for (let r = r0; r <= r1; r++) for (let u = BAL_U; u <= BAL_U + 1; u++) shelves.push([r, u, 45]);
  }
  // a reading table at the back of the floor
  plan.box(-2, 0, 36, 1, 0, 37, slab(B.slab, true));
  plan.set(-1, 1, 36, candles(3));
  plan.set(0, 1, 37, candles(2));
  block(ground, -2, 36, 1, 37);

  // ---- light: lanterns on chains, and hidden light so nothing spawns in the dark
  for (const r of [-10, 0, 9]) {
    for (const f of [14, 23, 32]) {
      plan.set(r, HALL.u1, f, pillar(fr, "minecraft:iron_chain", "u"));
      plan.set(r, HALL.u1 - 1, f, lantern(true));
    }
    plan.set(r, HALL.u1, 45, pillar(fr, "minecraft:iron_chain", "u"));
    plan.set(r, HALL.u1 - 1, 45, lantern(true));
  }
  for (let r = HALL.r0 + 1; r <= HALL.r1; r += 4) {
    for (let f = HALL.f0 + 1; f <= HALL.f1; f += 4) {
      if (!ground.has(key(r, f))) plan.set(r, 1, f, B.light);
      if (f >= BAL_F0 && !balcony.has(key(r, f))) plan.set(r, BAL_U + 1, f, B.light);
    }
  }
  // the little room past door 51: lit like the way out (in the hotel, door 52 is there)
  if (floor) {
    doorway(plan, fr, -1, BAL_U, EXIT.f1 + 1);
    plan.set(-2, BAL_U + 2, EXIT.f0 + 2, B.light);
  } else plan.box(-1, BAL_U, EXIT.f1 + 1, 0, BAL_U + 2, EXIT.f1 + 1, B.glow);
  plan.box(-2, BAL_U, EXIT.f0, 1, BAL_U, EXIT.f1, "minecraft:green_carpet");

  // the floor in front of door 51 must stay clear; the doorway cells too
  for (let r = HALL.r0; r <= HALL.r1; r++) balcony.add(key(r, HALL.f1 + 1));

  return { plan, nav: new LibraryNav(ground, balcony, blocked), shelves, paper, blocked };
}

// ---- the Figure's map of the room -------------------------------------------------------------
/** A small binary min-heap of ids by priority. */
class Heap {
  constructor() {
    /** @type {[number, number][]} */
    this.a = [];
  }

  get size() {
    return this.a.length;
  }

  push(id, pri) {
    const a = this.a;
    a.push([pri, id]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }

  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top[1];
  }
}

class LibraryNav {
  constructor(ground, balcony, blocked) {
    this.ground = ground;
    this.balcony = balcony;
    this.stairsOpen = STAIRS.map((_, i) => i !== blocked);
    /** @type {Local[]} */
    this.spots = [];
    for (let r = HALL.r0; r <= HALL.r1; r++) {
      for (let f = HALL.f0; f <= HALL.f1; f++) {
        if (this.walk(0, r, f)) this.spots.push({ r: r + 0.5, u: 0, f: f + 0.5 });
        if (this.walk(1, r, f)) this.spots.push({ r: r + 0.5, u: BAL_U, f: f + 0.5 });
      }
    }
  }

  stairOf(r) {
    return STAIRS.findIndex((s) => r >= s.r0 && r <= s.r1);
  }

  /** level 0: the floor, 1: the balcony, 2: a staircase */
  walk(level, r, f) {
    if (r < HALL.r0 || r > HALL.r1 || f < HALL.f0 || f > HALL.f1) return false;
    if (level === 0) return !this.ground.has(key(r, f));
    if (level === 1) return f >= BAL_F0 && !this.balcony.has(key(r, f));
    const s = this.stairOf(r);
    return s >= 0 && this.stairsOpen[s] && f >= STAIR_F0 && f <= STAIR_F1;
  }

  heightOf(level, f) {
    if (level === 0) return 0;
    if (level === 1) return BAL_U;
    return 0.5 + (f - STAIR_F0);
  }

  /** Which level a frame point is on. @param {Local} l */
  levelAt(l) {
    const r = Math.floor(l.r);
    const f = Math.floor(l.f);
    if (this.stairOf(r) >= 0 && f >= STAIR_F0 && f <= STAIR_F1 && l.u > 0.25 && l.u < BAL_U - 0.25) return 2;
    if (l.u > (BAL_U - 1) && f >= BAL_F0) return 1;
    return 0;
  }

  /** The walkable cell nearest a point, as a node. @param {Local} l @returns {Local | undefined} */
  node(l) {
    const level = this.levelAt(l);
    const r0 = Math.floor(l.r);
    const f0 = Math.floor(l.f);
    for (let rad = 0; rad <= 4; rad++) {
      let best;
      let bestD = Infinity;
      for (let dr = -rad; dr <= rad; dr++) {
        for (let df = -rad; df <= rad; df++) {
          if (Math.max(Math.abs(dr), Math.abs(df)) !== rad) continue;
          for (const lv of level === 2 ? [2, 0, 1] : [level, 2]) {
            if (!this.walk(lv, r0 + dr, f0 + df)) continue;
            const d = Math.hypot(dr, df) + (lv === level ? 0 : 0.5);
            if (d < bestD) {
              bestD = d;
              best = { r: r0 + dr + 0.5, u: this.heightOf(lv, f0 + df), f: f0 + df + 0.5, lv };
            }
          }
        }
      }
      if (best) return best;
    }
    return undefined;
  }

  random() {
    return this.spots[Math.floor(Math.random() * this.spots.length)];
  }

  /** A* over the cells (8 directions on a level, the stairs joining the floor and the balcony). */
  path(from, to) {
    const a = this.node(from);
    const b = this.node(to);
    if (!a || !b) return undefined;
    const id = (lv, r, f) => lv * 10000 + (r + 50) * 100 + f;
    const start = { lv: a.lv, r: Math.floor(a.r), f: Math.floor(a.f) };
    const goal = { lv: b.lv, r: Math.floor(b.r), f: Math.floor(b.f) };
    const gid = id(goal.lv, goal.r, goal.f);
    const h = (n) => {
      const dr = Math.abs(n.r - goal.r);
      const df = Math.abs(n.f - goal.f);
      return Math.max(dr, df) + 0.414 * Math.min(dr, df) + Math.abs(this.heightOf(n.lv, n.f) - this.heightOf(goal.lv, goal.f)) * 0.5;
    };
    /** @type {Map<number, { n: any, g: number, f: number, prev: number | null, closed: boolean }>} */
    const nodes = new Map();
    const sid = id(start.lv, start.r, start.f);
    nodes.set(sid, { n: start, g: 0, f: h(start), prev: null, closed: false });
    const open = new Heap();
    open.push(sid, h(start));
    let found = false;
    let guard = 0;
    while (open.size && guard++ < 8000) {
      const cid = open.pop();
      const cur = nodes.get(cid);
      if (cur.closed) continue;
      cur.closed = true;
      if (cid === gid) {
        found = true;
        break;
      }
      for (const [nb, cost] of this.neighbours(cur.n)) {
        const nid = id(nb.lv, nb.r, nb.f);
        const g = cur.g + cost;
        const old = nodes.get(nid);
        if (old && (old.closed || old.g <= g)) continue;
        nodes.set(nid, { n: nb, g, f: g + h(nb), prev: cid, closed: false });
        open.push(nid, g + h(nb));
      }
    }
    if (!found) return undefined;
    const cells = [];
    for (let k = gid; k !== null; k = nodes.get(k).prev) cells.push(nodes.get(k).n);
    cells.reverse();
    const pts = cells.map((c) => ({ r: c.r + 0.5, u: this.heightOf(c.lv, c.f), f: c.f + 0.5, lv: c.lv }));
    return this.smooth(pts);
  }

  /** @returns {Generator<[{ lv: number, r: number, f: number }, number]>} */
  *neighbours(n) {
    const { lv, r, f } = n;
    if (lv === 0 || lv === 1) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let df = -1; df <= 1; df++) {
          if (!dr && !df) continue;
          if (!this.walk(lv, r + dr, f + df)) continue;
          if (dr && df && (!this.walk(lv, r + dr, f) || !this.walk(lv, r, f + df))) continue;
          yield [{ lv, r: r + dr, f: f + df }, dr && df ? 1.414 : 1];
        }
      }
      // onto a staircase: from the floor at its foot, or from the balcony at its top
      if (lv === 0 && f === STAIR_F0 - 1 && this.walk(2, r, STAIR_F0)) yield [{ lv: 2, r, f: STAIR_F0 }, 1.4];
      if (lv === 1 && f === BAL_F0 && this.walk(2, r, STAIR_F1)) yield [{ lv: 2, r, f: STAIR_F1 }, 1.4];
    } else {
      for (const [dr, df] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (this.walk(2, r + dr, f + df)) yield [{ lv: 2, r: r + dr, f: f + df }, 1.4];
      }
      if (f === STAIR_F0 && this.walk(0, r, STAIR_F0 - 1)) yield [{ lv: 0, r, f: STAIR_F0 - 1 }, 1.4];
      if (f === STAIR_F1 && this.walk(1, r, BAL_F0)) yield [{ lv: 1, r, f: BAL_F0 }, 1.4];
    }
  }

  /** Straighten a path: skip points while the straight line between stays on walkable cells. */
  smooth(pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !(pts[j].lv === pts[i].lv && pts[i].lv !== 2 && this.clear(pts[i], pts[j]))) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  clear(a, b) {
    const n = Math.ceil(Math.hypot(b.r - a.r, b.f - a.f) * 3);
    for (let k = 1; k < n; k++) {
      const r = a.r + ((b.r - a.r) * k) / n;
      const f = a.f + ((b.f - a.f) * k) / n;
      // keep half a block from anything solid
      for (const [or, of] of [[0.35, 0.35], [-0.35, 0.35], [0.35, -0.35], [-0.35, -0.35]]) {
        if (!this.walk(a.lv, Math.floor(r + or), Math.floor(f + of))) return false;
      }
    }
    return true;
  }
}

// ---- books --------------------------------------------------------------------------------------
/** Pick ten shelf faces, spread out, that look onto a walkable spot. */
function bookSpots(lay, rng) {
  const nav = lay.nav;
  /** @type {any[]} */
  const cand = [];
  for (const [r, u, f] of lay.shelves) {
    const lv = u >= BAL_U ? 1 : 0;
    /** @type {[number, number, string][]} */
    const sides = [[1, 0, "r"], [-1, 0, "l"], [0, 1, "f"], [0, -1, "b"]];
    for (const [dr, df, dir] of sides) {
      if (!nav.walk(lv, r + dr, f + df)) continue;
      // not right beside a door or the stairs
      if (Math.abs(r + 0.5) < 4 && (f <= HALL.f0 + 1 || f >= HALL.f1)) continue;
      cand.push({ r, u, f, dir, lv, at: { r: r + 0.5 + dr * 0.52, u: u + 0.18, f: f + 0.5 + df * 0.52 } });
    }
  }
  for (let i = cand.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cand[i], cand[j]] = [cand[j], cand[i]];
  }
  /** @type {any[]} */
  const chosen = [];
  for (const minGap of [6, 4, 2, 0]) {
    for (const c of cand) {
      if (chosen.length >= 10) break;
      if (chosen.includes(c)) continue;
      if (c.lv === 1 && chosen.filter((x) => x.lv === 1).length >= 3) continue;
      if (chosen.some((x) => Math.hypot(x.at.r - c.at.r, x.at.f - c.at.f) < minGap && Math.abs(x.u - c.u) < 4)) continue;
      chosen.push(c);
    }
    if (chosen.length >= 10) break;
  }
  return chosen;
}

// ---- the run ----------------------------------------------------------------------------------
/**
 * A Library's state, laid out in frame `fr`. Standing alone (the Door 50 item) it is its run's
 * data; in the hotel it is part of the Floor 1 run's.
 * @typedef {{
 *   seed: number, nav: LibraryNav, spots: any[], paper: Local, digits: Record<string, number>,
 *   code: string[], found: Set<string>, paperTaken: boolean, books: Map<string, string>,
 *   paperId?: string, lampId?: string, figureId?: string, door50?: any, door51?: any,
 *   introAt: number, unlocked: boolean, escaped: Set<string>, endAt: number, glintAt: number, tipAt: number,
 *   fr: Frame, floor: boolean, phase: string, plan?: Plan, built: boolean, building: boolean,
 * }} LibraryData
 */

/** Use of the Door 50 item: ask, then build in front of the player. @param {Player} p */
export function onUse(p) {
  if (Doors.runOf(p) || Doors.pendingRunOf(p)) {
    p.sendMessage("§7You are already in a level. Finish it first.");
    return;
  }
  const fr = frameFor(p);
  if (!fitsHeight(fr, BOUNDS)) {
    p.sendMessage("§cThere is no room for the Library here (too close to the top or bottom of the world).");
    return;
  }
  confirm(p, "Door 50: The Library", "Build the Library in front of you?\\n\\nIt fills a 32 x 58 block area ahead of you (15 high) and replaces anything there.\\n\\nWalk through door 50 when you are ready... and stay quiet.", () => start(p));
}

/** @param {Player} p */
function frameFor(p) {
  const yaw = p.getRotation().y;
  const fr0 = new Frame(p.dimension, { x: 0, y: 0, z: 0 }, yaw);
  // the corridor's doorway 2.5 blocks in front of the player, lined up with them
  const loc = p.location;
  const o = { x: Math.round(loc.x + fr0.F.x * 2.5), y: Math.floor(loc.y + 0.01), z: Math.round(loc.z + fr0.F.z * 2.5) };
  return new Frame(p.dimension, o, yaw);
}

/** @param {Player} p */
export function confirm(p, heading, body, yes, button = "§2Build it here") {
  const form = new ActionFormData().title(heading).body(body).button(button).button("Cancel");
  form.show(p).then((res) => {
    if (res.canceled || res.selection !== 0) return;
    if (Doors.runOf(p) || Doors.pendingRunOf(p)) return;
    yes();
  }).catch(() => {
    /* the player was busy */
  });
}

/**
 * A Library laid out in frame `fr` (its corridor's doorway at the frame's origin), not built yet.
 * @param {Frame} fr @returns {LibraryData}
 */
export function newLibrary(fr, seed, floor = false) {
  const rng = rngFrom(seed);
  const lay = layout(fr, rng, floor);
  /** @type {Record<string, number>} */
  const digits = {};
  const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (const s of SHAPES) digits[s] = pool.splice(Math.floor(rng() * pool.length), 1)[0];
  const shuffled = [...SHAPES].sort(() => rng() - 0.5);
  return {
    seed, nav: lay.nav, spots: bookSpots(lay, rng), paper: lay.paper, digits, code: shuffled.slice(0, 5),
    found: new Set(), paperTaken: false, books: new Map(), introAt: 0, unlocked: false, escaped: new Set(), endAt: 0,
    glintAt: 0, tipAt: 0, fr, floor, phase: "building", plan: lay.plan, built: false, building: false,
  };
}

/** @param {Player} p */
function start(p) {
  const fr = frameFor(p);
  if (!isLoaded(fr, BOUNDS)) {
    p.sendMessage("§cPart of that area isn't loaded. Move closer to an open space and try again.");
    return;
  }
  const seed = Math.floor(Math.random() * 1e9);
  const data = newLibrary(fr, seed);
  const run = Doors.newRun("library", p, fr, BOUNDS, data);
  p.sendMessage("§7Building the Library...");
  Doors.sound(p.dimension, "zt.doors.close", p.location, 0.6, 0.7);
  buildLibrary(run, data, (ok, failed) => {
    if (!ok) {
      p.sendMessage("§cPart of the Library's area stopped being loaded while it was being built. Stay close until it's done, and use Door 50 again.");
      Doors.endRun(run, "build failed");
      return;
    }
    if (failed) p.sendMessage(`§7(${failed} decoration${failed === 1 ? "" : "s"} couldn't be placed in this version of Minecraft.)`);
    data.phase = run.phase = "ready";
    p.sendMessage("§6Door 50 §7is ready. Walk up to the door...");
  });
}

/**
 * Build a Library's rooms, then its doors, lamp, paper and books. `done(ok, failed)` as for build().
 * @param {Run} run @param {LibraryData} d
 */
export function buildLibrary(run, d, done) {
  if (d.built || d.building || !d.plan) return;
  d.building = true;
  build(d.fr, d.plan, (ok, failed) => {
    d.building = false;
    if (ok) {
      d.built = true;
      d.plan = undefined;
      furnish(run, d);
      if (d.phase === "building") d.phase = "ready";
    }
    done(ok, failed);
  }, () => run.phase === "over");
}

/** The frame-space box the Library takes up in its own frame. */
export function libraryBounds() {
  return [...BOUNDS];
}

/** Where the Library's last little room has its far door (door 52 in the hotel), in its own frame. */
export const LIBRARY_EXIT = { r: -1, u: BAL_U, f: EXIT.f1 + 1 };

/** The doors, the lamp, the paper and the books. @param {Run} run @param {LibraryData} d */
function furnish(run, d) {
  const fr = d.fr;
  d.door50 = Doors.spawnDoor(run, DOOR50.r, DOOR50.u, DOOR50.f, 50, { frame: fr, keep: !d.floor });
  d.door51 = Doors.spawnDoor(run, DOOR51.r, DOOR51.u, DOOR51.f, 51, { frame: fr, keep: !d.floor, locked: true });
  const lamp = Doors.spawnFor(run, "zt:library_lamp", fr.at(LAMP.r, 0, LAMP.f), { keep: !d.floor, yaw: fr.yawOf("l") });
  d.lampId = lamp.id;
  const paper = Doors.spawnFor(run, "zt:library_paper", fr.at(d.paper.r, d.paper.u, d.paper.f), { yaw: fr.yawOf("b") });
  d.paperId = paper.id;
  d.spots.forEach((spot, i) => {
    const shape = SHAPES[i];
    const e = Doors.spawnFor(run, "zt:library_book", fr.at(spot.at.r, spot.at.u, spot.at.f), { yaw: fr.yawOf(spot.dir) });
    d.books.set(e.id, shape);
  });
}

// ---- per tick ------------------------------------------------------------------------------------
/** The Door 50 item's run: the Library and nothing else. @param {Run} run */
function tick(run, now) {
  /** @type {LibraryData} */
  const d = run.data;
  if (d.phase === "building") return;
  const near = d.phase === "ready" ? run.dim.getPlayers({ location: d.fr.at(0, 0, 4), maxDistance: 24 }) : [];
  libraryTick(run, d, now, near);
  run.phase = d.phase === "escaped" ? "ending" : d.phase;
  if (d.phase === "ending" && now >= d.endAt) {
    for (const id of d.escaped) {
      const p = world.getEntity(id);
      if (isValid(p)) Doors.sendHome(run, /** @type {Player} */ (p));
    }
    Doors.endRun(run, "escaped");
  }
}

/**
 * One tick of a built Library: door 50 opening for `near` players and the scene starting when
 * one steps in, the intro, the hunt, and the escape through door 51 (in the hotel, `d.phase`
 * ends up "escaped").
 * @param {Run} run @param {LibraryData} d @param {Player[]} near
 */
export function libraryTick(run, d, now, near) {
  const fr = d.fr;
  if (d.phase === "ready") {
    // door 50 opens for anyone who walks up; stepping through starts it all
    Doors.autoOpenDoors(run, near, 2.6, (door) => door === d.door50);
    for (const p of near) {
      const l = fr.local(p.location);
      if (l.f > DOOR50.f + 1.3 && l.f < HALL.f0 + 6 && Math.abs(l.r) < 8 && l.u > -1 && l.u < 4) {
        intro(run, d, now);
        break;
      }
    }
    return;
  }
  if (d.phase === "intro") {
    introTick(run, d, now);
    return;
  }
  if (d.phase === "live") liveTick(run, d, now);
}

/** Everyone in the corridor or the hall plays; door 50 slams behind them; the Figure appears. @param {Run} run @param {LibraryData} d */
function intro(run, d, now) {
  const fr = d.fr;
  d.phase = "intro";
  d.introAt = now;
  // in the hotel everyone plays, wherever they had got to
  const players = d.floor ? Doors.livePlayers(run)
    : run.dim.getPlayers({ location: fr.at(0, 0, 10), maxDistance: 40 }).filter((p) => Doors.inside(run, p.location, 1));
  players.forEach((p, i) => {
    Doors.join(run, p);
    // everyone just inside the door, facing into the library
    const spot = fr.at(-0.5 + (i % 3) - 1, 0, 10.5 + Math.floor(i / 3) * 0.8);
    try {
      p.teleport(spot, { facingLocation: fr.at(1, 1.6, 20) });
    } catch {
      /* ignore */
    }
    Doors.lockInput(p, true);
    Doors.camera(p, fr.at(-0.5, 2.6, 9.4), fr.at(6, 1.6, 18.5), 0.6);
  });
  Doors.closeDoor(run, d.door50, true);
  const fig = Doors.spawnFor(run, Fig.FIGURE, fr.at(FIGURE_START.r, FIGURE_START.u, FIGURE_START.f),
    { spawnEvent: "zt:as_level", yaw: fr.yawOf("l") });
  d.figureId = fig.id;
  Fig.attachLevel(fig, run, d.nav, fr);
  Fig.scriptAct(fig, "stumble", 60);
  // it lurches out from behind the shelves into the aisle
  Fig.scriptMove(fig, { r: 1.5, u: 0, f: 18.5 }, 1.8, 1);
}

/** The opening scene: it roars, stumbles toward you, then a lamp crashes and it runs at the sound. @param {Run} run @param {LibraryData} d */
function introTick(run, d, now) {
  const fr = d.fr;
  const t = now - d.introAt;
  const fig = d.figureId ? world.getEntity(d.figureId) : undefined;
  const players = Doors.livePlayers(run);
  if (!isValid(fig)) {
    finishIntro(run, d, players, fig);
    return;
  }
  if (t === 40) {
    Fig.scriptAct(fig, "roar", 40);
    Doors.sound(run.dim, "zt.figure.roar", fig.location, 3.0, 0.9);
    for (const p of players) {
      try {
        p.runCommand("camerashake add @s 0.35 1.5 positional");
      } catch {
        /* ignore */
      }
    }
  }
  if (t === 82) {
    Fig.scriptAct(fig, "stumble", 40);
    Fig.scriptMove(fig, { r: 0.5, u: 0, f: 15.5 }, 1.6, 1);
  }
  if (t === 108) {
    const lamp = d.lampId ? world.getEntity(d.lampId) : undefined;
    if (isValid(lamp)) lamp.setProperty("zt:fallen", true);
    for (const p of players) Doors.camera(p, fr.at(-0.5, 2.6, 9.4), fr.at(LAMP.r, 0.5, LAMP.f - 0.6), 0.5);
  }
  if (t === 118) {
    // the Guiding Light knocked the lamp over: the crash draws the Figure away
    const at = fr.at(LAMP.r - 1.6, 0.5, LAMP.f);
    Doors.sound(run.dim, "zt.doors.lamp", at, 2.0, 1.0);
    particle(run.dim, "zt:glass_burst", at);
    Fig.makeNoise(run.dim, at, 64);
    Fig.scriptAct(fig, "none", 0);
    Fig.scriptMove(fig, { r: LAMP.r + 0.5, u: 0, f: LAMP.f + 2.3 }, 5.5, 2);
    for (const p of players) Doors.camera(p, fr.at(-0.5, 2.6, 9.4), fig, 0.4);
  }
  if (t === 150) Fig.scriptAct(fig, "listen", 60);
  if (t >= 165) finishIntro(run, d, players, fig);
}

/** @param {Run} run @param {LibraryData} d */
function finishIntro(run, d, players, fig) {
  d.phase = "live";
  for (const p of players) {
    Doors.lockInput(p, false);
    Doors.cameraClear(p);
    Doors.title(p, "§6Door 50", "§7Find the books. Open the padlock. Keep quiet.", 60);
    p.sendMessage("§7Crouch to move silently: §cThe Figure §7is blind, but it hears every step.");
    p.sendMessage("§7Books on the shelves show a shape and a digit. The paper on the desk shows the code's shapes, in order.");
  }
  if (isValid(fig)) Fig.release(fig, "search", { r: LAMP.r + 0.5, u: 0, f: LAMP.f + 2.3 });
}

/** @param {Run} run @param {LibraryData} d */
function liveTick(run, d, now) {
  const fr = d.fr;
  const players = Doors.livePlayers(run);
  // the books shimmer faintly
  if (now >= d.glintAt) {
    d.glintAt = now + 25;
    for (const id of d.books.keys()) {
      const e = world.getEntity(id);
      if (!isValid(e)) continue;
      particle(run.dim, "zt:book_glint", { x: e.location.x, y: e.location.y + 0.35, z: e.location.z });
      if (Math.random() < 0.25) Doors.sound(run.dim, "zt.doors.shimmer", e.location, 0.5, 1.0 + Math.random() * 0.3);
    }
  }
  // what you know about the code, while holding the paper or a book
  if (now % 20 === 0) {
    for (const p of players) {
      const held = heldId(p);
      if (held === Doors.PAPER || held?.startsWith(Doors.BOOK_PREFIX)) Doors.actionbar(p, hintLine(d));
    }
  }
  // escaping through door 51
  if (d.unlocked) {
    for (const p of players) {
      const l = fr.local(p.location);
      if (l.f > DOOR51.f + 1.2 && l.u > BAL_U - 1.5) d.escaped.add(p.id);
    }
    const inHall = players.filter((p) => !d.escaped.has(p.id));
    if (d.escaped.size && !inHall.length) escape(run, d, now);
  }
}

/** @param {Player} p */
function heldId(p) {
  try {
    return p.getComponent("minecraft:equippable")?.getEquipment(/** @type {any} */ ("Mainhand"))?.typeId;
  } catch {
    return undefined;
  }
}

/** @param {LibraryData} d */
export function hintLine(d) {
  if (d.paperTaken) {
    return "§fCode: " + d.code.map((s) => (d.found.has(s) ? "§e" + NAME[s] + " " + d.digits[s] : "§7" + NAME[s] + " ?")).join("§8 | ");
  }
  if (!d.found.size) return "§7No books yet. Look for glowing books on the shelves.";
  return "§fBooks: §e" + [...d.found].map((s) => NAME[s] + " = " + d.digits[s]).join(", ") + "§7  (the paper is on the desk)";
}

/** Door 51 slams behind the last one out. @param {Run} run @param {LibraryData} d */
function escape(run, d, now) {
  d.phase = d.floor ? "escaped" : "ending";
  d.endAt = now + 70;
  Doors.closeDoor(run, d.door51, true);
  const fig = d.figureId ? world.getEntity(d.figureId) : undefined;
  if (isValid(fig)) Doors.sound(run.dim, "zt.figure.roar", fig.location, 2.5, 0.8);
  for (const id of d.escaped) {
    const p = world.getEntity(id);
    if (!isValid(p)) continue;
    Doors.clearMeter(/** @type {Player} */ (p), "figure");
    Doors.title(/** @type {Player} */ (p), "§aYou escaped the Library!", "§7Door 51", 60);
    try {
      /** @type {Player} */ (p).playSound("zt.doors.escape", { volume: 1.0 });
    } catch {
      /* ignore */
    }
  }
}

/** The Library's Figure is let go (its run ends, or the hotel moves on). @param {LibraryData} d */
export function libraryEnd(d) {
  if (d.figureId) {
    Fig.detach(d.figureId);
    const fig = world.getEntity(d.figureId);
    if (isValid(fig)) fig.remove();
  }
}

// ---- interactions ----------------------------------------------------------------------------
/** The Library a player is playing: a Door 50 run, or the hotel's while it is on. @param {Player} p */
function libraryOf(p) {
  const run = Doors.runOf(p);
  if (!run) return undefined;
  /** @type {LibraryData | undefined} */
  const d = run.kind === "library" ? run.data : run.data?.lib;
  return d && d.built ? { run, d } : undefined;
}

/**
 * A player tapped one of the Library's things. Returns true when it was the Library's.
 * @param {Player} p @param {Entity} target
 */
export function onInteract(p, target) {
  const found = libraryOf(p);
  if (!found) return false;
  const { run, d } = found;
  const mine = d.books.has(target.id) || target.id === d.paperId || (d.door51 && target.id === d.door51.id) ||
    (d.door50 && target.id === d.door50.id);
  if (!mine) return false;
  if (d.phase !== "live") {
    if (target.typeId === "zt:hotel_door") p.sendMessage("§7Not yet...");
    return true;
  }
  if (target.typeId === "zt:library_book" && d.books.has(target.id)) takeBook(run, d, p, target);
  else if (target.typeId === "zt:library_paper" && target.id === d.paperId) takePaper(run, d, p, target);
  else if (target.typeId === "zt:hotel_door" && d.door51 && target.id === d.door51.id) padlock(run, d, p);
  return true;
}

/** @param {Run} run @param {LibraryData} d @param {Player} p @param {Entity} book */
function takeBook(run, d, p, book) {
  const shape = d.books.get(book.id);
  d.books.delete(book.id);
  book.remove();
  d.found.add(shape);
  const digit = d.digits[shape];
  Doors.sound(run.dim, "zt.doors.book", p.location, 1.0, 1.0);
  Fig.makeNoise(run.dim, p.location, 6, p);
  const fig = d.figureId ? world.getEntity(d.figureId) : undefined;
  if (isValid(fig)) Fig.addBonus(fig, 0.1);
  Doors.giveRunItem(p, Doors.BOOK_PREFIX + shape, "§9" + NAME[shape] + " = " + digit, ["§7A library book.", "§7The " + NAME[shape].toLowerCase() + " on its page means §e" + digit + "§7."]);
  for (const q of Doors.livePlayers(run)) {
    Doors.title(q, "§9" + NAME[shape] + " = " + digit, "§7Book " + d.found.size + " of 10", 50);
    if (q.id !== p.id) q.sendMessage("§7" + p.name + " found a book: §9" + NAME[shape] + " = " + digit);
  }
  p.sendMessage("§7You found a book: §9" + NAME[shape] + " = " + digit + " §8(" + d.found.size + "/10)");
}

/** @param {Run} run @param {LibraryData} d @param {Player} p @param {Entity} paper */
function takePaper(run, d, p, paper) {
  d.paperTaken = true;
  paper.remove();
  d.paperId = undefined;
  Doors.sound(run.dim, "zt.doors.book", p.location, 1.0, 1.3);
  Fig.makeNoise(run.dim, p.location, 5, p);
  Doors.giveRunItem(p, Doors.PAPER, undefined, ["§7The padlock's code, as shapes:", "§e" + d.code.map((s) => NAME[s]).join(", ")]);
  for (const q of Doors.livePlayers(run)) if (q.id !== p.id) q.sendMessage("§7" + p.name + " took the solution paper.");
  showPaper(d, p);
}

/** The solution paper: the five shapes in order, with the digits you know. @param {LibraryData} d @param {Player} p */
export function showPaper(d, p) {
  const form = new ActionFormData()
    .title("Solution Paper")
    .body("The padlock on door 51 takes five digits. These are the shapes that make the code, in this order. Each book you find tells you which digit a shape stands for.");
  d.code.forEach((s, i) => {
    form.button((i + 1) + ".  " + NAME[s] + (d.found.has(s) ? "  =  " + d.digits[s] : "  =  ?"), "textures/items/zt_book_" + s);
  });
  form.show(p).catch(() => {
    /* busy */
  });
}

/** The padlock: making noise while you fiddle with it. @param {Run} run @param {LibraryData} d @param {Player} p */
function padlock(run, d, p) {
  if (d.unlocked) return;
  const door = Doors.doorEntity(d.door51);
  Doors.sound(run.dim, "zt.doors.padlock", door?.location ?? p.location, 1.0, 1.0);
  Fig.makeNoise(run.dim, p.location, 16, p);
  const known = d.paperTaken
    ? "§fThe paper: " + d.code.map((s) => (d.found.has(s) ? NAME[s] + " = " + d.digits[s] : NAME[s] + " = ?")).join(", ")
    : "§7You haven't found the solution paper (it's on the librarian's desk).";
  const books = d.found.size ? "§fYour books: " + [...d.found].map((s) => NAME[s] + " = " + d.digits[s]).join(", ") : "§7You haven't found any books yet.";
  const form = new ModalFormData()
    .title("Padlock")
    .label(known)
    .label(books)
    .textField("Enter the 5-digit code", "00000");
  form.show(p).then((res) => {
    if (res.canceled || !res.formValues) return;
    if (d.phase !== "live" || d.unlocked) return;
    const entered = String(res.formValues[res.formValues.length - 1] ?? "").replace(/\D/g, "");
    const code = d.code.map((s) => d.digits[s]).join("");
    if (entered === code) unlock(run, d, p);
    else {
      Doors.sound(run.dim, "zt.doors.wrong", door?.location ?? p.location, 1.0, 1.0);
      Fig.makeNoise(run.dim, p.location, 16, p);
      p.sendMessage(entered.length === 5 ? "§cThe padlock doesn't open." : "§cThe code has 5 digits.");
    }
  }).catch(() => {
    /* busy */
  });
}

/** @param {Run} run @param {LibraryData} d @param {Player} p */
function unlock(run, d, p) {
  d.unlocked = true;
  Doors.unlockDoor(d.door51);
  Doors.openDoor(run, d.door51);
  const door = Doors.doorEntity(d.door51);
  Doors.sound(run.dim, "zt.doors.unlock", door?.location ?? p.location, 1.5, 1.0);
  for (const q of Doors.livePlayers(run)) {
    Doors.title(q, "§aUnlocked!", "§cRUN!", 40);
    q.sendMessage("§aThe padlock clicks open. §cGet out before the Figure gets you!");
  }
  const fig = d.figureId ? world.getEntity(d.figureId) : undefined;
  if (isValid(fig)) Fig.enrage(fig);
}

/** Using a book or the paper from the inventory. @param {Player} p */
export function onItemUse(p, typeId) {
  const found = libraryOf(p);
  if (!found) {
    p.sendMessage("§7It's just paper now.");
    return;
  }
  const { d } = found;
  if (typeId === Doors.PAPER) showPaper(d, p);
  else {
    const shape = typeId.slice(Doors.BOOK_PREFIX.length);
    Doors.title(p, "§9" + NAME[shape] + " = " + d.digits[shape], "", 40);
  }
}

/** @param {Run} run */
function end(run) {
  libraryEnd(run.data);
}

Doors.registerKind("library", { tick, end });
