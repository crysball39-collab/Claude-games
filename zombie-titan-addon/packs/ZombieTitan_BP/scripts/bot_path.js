// How a Player finds its way: an A* search over the blocks around it, a few hundred steps a
// tick. Besides walking, jumping up a block, dropping down (three blocks, or further into
// water), swimming, climbing ladders and going through doors, it can tunnel through blocks it
// can mine, dig a staircase down, bridge over a gap and pillar up, when it has blocks to place.
// It keeps away from lava and never digs into a block that holds lava back.
import * as D from "./bot_data.js";
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

/**
 * @typedef {{x: number, y: number, z: number, how: string, mine?: number[][], place?: number[], door?: number[]}} Step
 * how: walk, up, down, swim, climb, pillar, bridge, dig. mine: blocks to break first (top to
 * bottom); place: a block to put down (bridge: under the next step; pillar: where it stood);
 * door: a door to open on the way.
 */

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

class Heap {
  constructor() {
    this.a = [];
  }
  get size() {
    return this.a.length;
  }
  push(n) {
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= n.f) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = n;
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= a.length) break;
        const r = l + 1;
        const c = r < a.length && a[r].f < a[l].f ? r : l;
        if (a[c].f >= last.f) break;
        a[i] = a[c];
        i = c;
      }
      a[i] = last;
    }
    return top;
  }
}

/**
 * The world as the search sees it, one block at a time, remembered for the search.
 * @param {Dimension} dim
 */
export function blockView(dim) {
  const cache = new Map();
  return (x, y, z) => {
    const k = x + "," + y + "," + z;
    let v = cache.get(k);
    if (v !== undefined) return v;
    let b;
    try {
      b = dim.getBlock({ x, y, z });
    } catch {
      b = undefined;
    }
    if (!b) v = null;
    else {
      let open = false;
      const id = b.typeId;
      if (D.blockInfo(id).kind === "door") {
        try {
          open = !!b.permutation.getState("open_bit");
        } catch {
          open = false;
        }
      }
      v = { id, open, iron: /iron_(door|trapdoor)/.test(id) };
    }
    cache.set(k, v);
    return v;
  };
}

/**
 * Search for a way from start to the goal.
 * @param {Dimension} dim
 * @param {Vector3} start its feet block
 * @param {{x?: number, y?: number, z?: number, r?: number, test?: (x: number, y: number, z: number) => boolean}} goal
 *   reach within r of (x, y, z); leave out y for "any height"; or a test (with x, z and r saying
 *   roughly where the places that pass it are, if they're far)
 * @param {{mine?: (id: string) => number, blocks?: number, maxNodes?: number, protect?: (x: number, y: number, z: number, id: string) => boolean,
 *   maxDrop?: number, digDown?: boolean, avoidWater?: boolean, weight?: number, portal?: boolean}} o
 *   mine: ticks to break a block with its tools (Infinity: it can't); blocks: blocks it can place;
 *   weight: how much to trust the straight-line distance (above 1 is faster, a little less direct);
 *   portal: it may step into a portal (it means to go through)
 * @returns {Generator<undefined, {path: Step[], complete: boolean, expanded: number}>}
 */
export function* search(dim, start, goal, o = {}) {
  const at = blockView(dim);
  const range = dim.heightRange;
  const maxNodes = o.maxNodes ?? 4000;
  const maxDrop = o.maxDrop ?? 3;
  const r = goal.r ?? 0.5;
  const canPlace = (o.blocks ?? 0) > 0;
  const mineTicks = o.mine;
  const W = o.weight ?? 1.5;
  // what the way so far has already changed: blocks it will have mined ("air") or placed
  // ("solid"), so a second pillar step stands on the first block placed
  /** @type {Map<string, string> | null} */
  let curMods = null;
  const modAt = (x, y, z) => (curMods ? curMods.get(x + "," + y + "," + z) : undefined);

  const info = (x, y, z) => {
    if (y < range.min || y >= range.max) return null;
    return at(x, y, z);
  };
  const kindOf = (b) => (b ? D.blockInfo(b.id).kind : "unloaded");
  // a body passes it
  const free = (x, y, z) => {
    const m = modAt(x, y, z);
    if (m) return m === "air";
    const b = info(x, y, z);
    if (!b) return false;
    const k = kindOf(b);
    if (k === "air" || k === "pass") return true;
    // into a portal only when that's where it's going
    if (k === "portal") return !!o.portal;
    return k === "door" && b.open;
  };
  const water = (x, y, z) => !modAt(x, y, z) && kindOf(info(x, y, z)) === "liquid";
  const lava = (x, y, z) => !modAt(x, y, z) && kindOf(info(x, y, z)) === "lava";
  const climb = (x, y, z) => !modAt(x, y, z) && kindOf(info(x, y, z)) === "climb";
  const floor = (x, y, z) => {
    const m = modAt(x, y, z);
    if (m) return m === "solid";
    const b = info(x, y, z);
    return !!b && D.isFloor(b.id);
  };
  // a closed wooden door it can open on the way
  const door = (x, y, z) => {
    if (modAt(x, y, z)) return false;
    const b = info(x, y, z);
    return !!b && kindOf(b) === "door" && !b.open && !b.iron;
  };
  const room = (x, y, z) => free(x, y, z) || water(x, y, z) || climb(x, y, z);
  const nearLava = (x, y, z) => lava(x + 1, y, z) || lava(x - 1, y, z) || lava(x, y, z + 1) || lava(x, y, z - 1) || lava(x, y - 1, z);
  // ticks to mine a block out of the way (Infinity: it mustn't or can't)
  const breakable = (x, y, z) => {
    if (!mineTicks) return Infinity;
    const b = info(x, y, z);
    if (!b) return Infinity;
    const k = kindOf(b);
    if (k === "air" || k === "pass" || k === "liquid" || k === "lava" || k === "portal") return Infinity;
    if (o.protect?.(x, y, z, b.id)) return Infinity;
    // never let lava (or a lake) in
    if (lava(x, y + 1, z) || lava(x + 1, y, z) || lava(x - 1, y, z) || lava(x, y, z + 1) || lava(x, y, z - 1)) return Infinity;
    const t = mineTicks(b.id);
    if (!Number.isFinite(t) || t > 600) return Infinity;
    return t + (water(x, y + 1, z) ? 60 : 0) + (/sand|gravel/.test(info(x, y + 1, z)?.id ?? "") ? 20 : 0);
  };
  /** cells that must be clear: [cells], -> {cost, mine} or null */
  const clear = (cells) => {
    let cost = 0;
    const mine = [];
    for (const [x, y, z] of cells) {
      if (room(x, y, z) || door(x, y, z)) continue;
      const t = breakable(x, y, z);
      if (!Number.isFinite(t)) return null;
      cost += 1.5 + t / 8;
      mine.push([x, y, z]);
    }
    return { cost, mine };
  };
  const standable = (x, y, z) => floor(x, y - 1, z) || climb(x, y, z) || water(x, y, z) || water(x, y - 1, z);

  // a goal that's a test can still say roughly where it is (x, z): the search aims there
  const h = (x, y, z) => {
    if (goal.test && goal.x === undefined && goal.z === undefined) return 0;
    if (goal.test) return Math.max(0, Math.hypot(x - (goal.x ?? x), z - (goal.z ?? z)) - (goal.r ?? 0));
    const dx = x - (goal.x ?? x);
    const dy = goal.y === undefined ? 0 : y - goal.y;
    const dz = z - (goal.z ?? z);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  };
  const reached = (x, y, z) => {
    if (goal.test) return goal.test(x, y, z);
    return h(x, y, z) <= r;
  };

  const sx = Math.floor(start.x);
  const sy = Math.floor(start.y);
  const sz = Math.floor(start.z);
  const open = new Heap();
  const best = new Map();
  const first = { x: sx, y: sy, z: sz, g: 0, f: h(sx, sy, sz), prev: null, step: null, mods: null };
  open.push(first);
  best.set(sx + "," + sy + "," + sz, 0);
  let closest = first;
  let closestH = h(sx, sy, sz);
  let expanded = 0;
  let found = null;

  const consider = (cur, x, y, z, cost, step) => {
    if (y < range.min || y >= range.max - 1) return;
    let c = cost;
    if (nearLava(x, y, z)) c += 8;
    if (lava(x, y, z) || lava(x, y + 1, z)) return;
    if (o.avoidWater && water(x, y, z)) c += 4;
    const g = cur.g + c;
    const k = x + "," + y + "," + z;
    const old = best.get(k);
    if (old !== undefined && old <= g) return;
    best.set(k, g);
    const hh = h(x, y, z);
    let mods = cur.mods;
    if (step.mine?.length || step.place) {
      mods = new Map(cur.mods ?? []);
      for (const [mx, my, mz] of step.mine ?? []) mods.set(mx + "," + my + "," + mz, "air");
      if (step.place) mods.set(step.place.join(","), "solid");
    }
    open.push({ x, y, z, g, f: g + hh * W, prev: cur, step, mods });
  };

  while (open.size) {
    const cur = open.pop();
    const k = cur.x + "," + cur.y + "," + cur.z;
    if (best.get(k) < cur.g) continue;
    if (reached(cur.x, cur.y, cur.z)) {
      found = cur;
      break;
    }
    const hh = h(cur.x, cur.y, cur.z);
    if (hh < closestH) {
      closestH = hh;
      closest = cur;
    }
    if (++expanded > maxNodes) break;
    if (expanded % 250 === 0) yield;
    curMods = cur.mods;
    const { x, y, z } = cur;
    const inWater = water(x, y, z);

    for (const [dx, dz] of DIRS) {
      const nx = x + dx;
      const nz = z + dz;
      // walk across (through a door if there is one)
      if ((room(nx, y, nz) || door(nx, y, nz)) && (room(nx, y + 1, nz) || door(nx, y + 1, nz))) {
        const d = door(nx, y, nz) ? [nx, y, nz] : door(nx, y + 1, nz) ? [nx, y + 1, nz] : undefined;
        if (standable(nx, y, nz)) {
          consider(cur, nx, y, nz, (water(nx, y, nz) ? 2 : 1) + (d ? 1 : 0), { x: nx, y, z: nz, how: water(nx, y, nz) ? "swim" : "walk", door: d });
        } else if (!d) {
          // drop down
          let k2 = 1;
          for (; k2 <= 24; k2++) {
            if (!room(nx, y - k2, nz)) break;
            if (water(nx, y - k2, nz) || floor(nx, y - k2 - 1, nz)) break;
          }
          const landY = y - k2;
          const into = water(nx, landY, nz) || water(nx, landY - 1, nz);
          if (room(nx, landY, nz) && (k2 <= maxDrop || into) && (floor(nx, landY - 1, nz) || into)) {
            consider(cur, nx, landY, nz, 1 + k2 * 0.5, { x: nx, y: landY, z: nz, how: "down" });
          }
          // or bridge over the gap
          if (canPlace && floor(x, y - 1, z) && !lava(nx, y - 1, nz) && (room(nx, y - 1, nz) || water(nx, y - 1, nz))) {
            consider(cur, nx, y, nz, 4, { x: nx, y, z: nz, how: "bridge", place: [nx, y - 1, nz] });
          }
        }
      } else if (mineTicks && !inWater) {
        // tunnel through
        if (floor(nx, y - 1, nz)) {
          const c = clear([[nx, y + 1, nz], [nx, y, nz]]);
          if (c) consider(cur, nx, y, nz, 1 + c.cost, { x: nx, y, z: nz, how: "dig", mine: c.mine });
        }
      }
      // step up a block
      if (floor(nx, y, nz) && !inWater) {
        if (room(nx, y + 1, nz) && room(nx, y + 2, nz) && room(x, y + 2, z)) {
          consider(cur, nx, y + 1, nz, 2.2, { x: nx, y: y + 1, z: nz, how: "up" });
        } else if (mineTicks) {
          const c = clear([[x, y + 2, z], [nx, y + 2, nz], [nx, y + 1, nz]]);
          if (c && floor(nx, y, nz)) consider(cur, nx, y + 1, nz, 2.2 + c.cost, { x: nx, y: y + 1, z: nz, how: "up", mine: c.mine });
        }
      } else if (water(x, y, z) && room(nx, y + 1, nz) && floor(nx, y, nz)) {
        consider(cur, nx, y + 1, nz, 2.5, { x: nx, y: y + 1, z: nz, how: "up" });
      }
      // dig a staircase down
      if (mineTicks && !inWater && floor(nx, y - 2, nz) && !room(nx, y - 1, nz)) {
        const c = clear([[nx, y + 1, nz], [nx, y, nz], [nx, y - 1, nz]]);
        if (c) consider(cur, nx, y - 1, nz, 1.5 + c.cost, { x: nx, y: y - 1, z: nz, how: "down", mine: c.mine });
      }
    }
    // diagonals: walking only, no corner cutting
    for (const [dx, dz] of DIAG) {
      const nx = x + dx;
      const nz = z + dz;
      if (!free(nx, y, nz) || !free(nx, y + 1, nz) || !floor(nx, y - 1, nz)) continue;
      if (!free(x + dx, y, z) || !free(x + dx, y + 1, z) || !free(x, y, z + dz) || !free(x, y + 1, z + dz)) continue;
      consider(cur, nx, y, nz, 1.414, { x: nx, y, z: nz, how: "walk" });
    }
    // up and down: ladders, water, pillars, digging
    if (climb(x, y, z) || inWater) {
      if (room(x, y + 1, z) && room(x, y + 2, z)) consider(cur, x, y + 1, z, 1.5, { x, y: y + 1, z, how: inWater ? "swim" : "climb" });
      if (room(x, y - 1, z) && (climb(x, y - 1, z) || water(x, y - 1, z))) consider(cur, x, y - 1, z, 1.5, { x, y: y - 1, z, how: inWater ? "swim" : "climb" });
    } else if (canPlace && floor(x, y - 1, z)) {
      if (room(x, y + 2, z)) consider(cur, x, y + 1, z, 4, { x, y: y + 1, z, how: "pillar", place: [x, y, z] });
      else if (mineTicks) {
        const c = clear([[x, y + 2, z]]);
        if (c) consider(cur, x, y + 1, z, 4 + c.cost, { x, y: y + 1, z, how: "pillar", place: [x, y, z], mine: c.mine });
      }
    }
    if (o.digDown && mineTicks && !inWater && floor(x, y - 2, z)) {
      const c = clear([[x, y - 1, z]]);
      if (c && c.mine.length) consider(cur, x, y - 1, z, 3 + c.cost * 2, { x, y: y - 1, z, how: "dig", mine: c.mine });
    }
  }

  const end = found ?? closest;
  /** @type {Step[]} */
  const path = [];
  for (let n = end; n && n.step; n = n.prev) path.push(n.step);
  path.reverse();
  return { path, complete: !!found, expanded };
}

/** Run a search to the end at once (tests, short hops). @param {Generator<undefined, any>} gen */
export function runNow(gen) {
  for (;;) {
    const r = gen.next();
    if (r.done) return r.value;
  }
}
