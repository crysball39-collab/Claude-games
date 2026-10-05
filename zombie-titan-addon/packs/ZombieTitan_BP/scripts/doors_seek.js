// Door 30: the Seek chase (DOORS). The "Door 30 Seek Chase" item builds a hotel corridor in
// front of you. Eyes start to appear on the walls; go through door 30 into the long hallway,
// and at its far end Seek rises out of a puddle of black slime behind you. Run: ten rooms
// (the boss bar shows how many are left), crouching under fallen bookshelves, taking the
// door the Guiding Light shows in the rooms with three doors, until the last hall, where
// black hands burst through the windows and chandeliers crash down burning. Make it through
// the last door and the Guiding Light slams it in Seek's face.
//
// Rooms are built a couple ahead of you as you run, like the game makes them when you open
// a door. Seek follows the rooms' path; it is a little faster than walking and a little
// slower than sprinting, and it catches up when you fall behind.
import { system, world } from "@minecraft/server";
import { build, candles, Frame, fitsHeight, isLoaded, joined, lantern, pillar, Plan, slab, stairs } from "./doors_build.js";
import * as Doors from "./doors_common.js";
import { confirm, plateIndex, rngFrom } from "./doors_library.js";
import { bodySize, dist2D, isValid, len, livingAround, particle, sub, yawTo } from "./util.js";

/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("./doors_common.js").Run} Run */
/** @typedef {{ r: number, u: number, f: number }} Local */

export const ITEM = "zt:door_30";
export const SEEK = "zt:seek";
export const CHASE_ROOMS = 10;
// blocks per second; a player walks at 4.3, sprints at 5.6 and crouches at 1.3
// Seek runs a little slower than you walk, but catches up fast when it falls behind: keep moving,
// follow the light, and don't stop
export const SPEED = { start: 3.6, base: 4.2, catchUp: 0.2, ease: 10, max: 7.5, squeeze: 2.0 };
const KILL_REACH = 1.3;
const HAND_REACH = 2.0;
const FIRE_RADIUS = 1.2;
const FIRE_DAMAGE = 9;

const B = {
  air: "minecraft:air",
  floor: "zt:hotel_floor",
  ceiling: "zt:hotel_ceiling",
  wallpaper: "zt:hotel_wallpaper",
  green: "zt:hotel_wallpaper_green",
  wainscot: "zt:hotel_wainscot",
  trim: "zt:hotel_trim",
  shelf: "zt:library_shelf",
  planks: "minecraft:dark_oak_planks",
  log: "minecraft:stripped_dark_oak_log",
  carpet: "minecraft:red_carpet",
  light: "minecraft:light_block_5",
};

/**
 * @typedef {{
 *   index: number, kind: string, c: number, w: number, f0: number, f1: number, u1: number,
 *   boxes: number[][], exit?: { r: number, f: number, number: number }, fakes: { r: number, f: number }[],
 *   path: Local[], gaps: { r: number, f: number }[], windows: { side: number, f: number, hand: boolean }[],
 *   chandeliers: number[], shelves: { f: number, gap: number }[], paper: string,
 *   built?: boolean, building?: boolean, ents?: string[], door?: any, fakeDoors?: any[], entryC: number,
 *   turn?: { from: number, to: number, f: number },
 * }} Room
 */

/** The rooms of the chase, in frame cells (r: right, u: up, f: forward). */
export function chaseLayout(rng) {
  /** @type {Room[]} */
  const rooms = [];
  let c = 0;
  let f = 0;
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const room = (kind, w, len, extra = {}) => {
    const r = {
      index: rooms.length, kind, c, w, f0: f, f1: f + len - 1, u1: 4, boxes: [[c - w / 2, c + w / 2 - 1, f, f + len - 1]],
      fakes: [], path: [], gaps: [], windows: [], chandeliers: [], shelves: [], paper: pick([B.wallpaper, B.green]),
      turn: undefined, entryC: c, door: undefined, ...extra,
    };
    rooms.push(r);
    f += len + 1;
    return r;
  };
  const door = (r, number, next = r.c) => {
    r.exit = { r: next - 1, f: r.f1 + 1, number };
  };
  // the corridor before door 30 (room 29) and the long hallway (room 30, where Seek rises)
  const ante = room("ante", 6, 10, { paper: B.wallpaper });
  door(ante, 30);
  const hall = room("hall", 6, 32, { paper: B.wallpaper });
  door(hall, 31);
  let number = 32;
  for (const kind of ["crawl", "three", "jog", "crawl2", "three", "furniture", "crawl", "three"]) {
    if (kind === "crawl" || kind === "crawl2") {
      const r = room("crawl", 8, 14);
      const offsets = [-3, -1, 1];
      const g1 = pick(offsets);
      r.shelves.push({ f: r.f0 + (kind === "crawl2" ? 4 : 7), gap: g1 });
      if (kind === "crawl2") r.shelves.push({ f: r.f0 + 9, gap: pick(offsets.filter((o) => o !== g1)) });
      door(r, number++);
    } else if (kind === "three") {
      const r = room("three", 12, 12);
      const slots = [r.c - 4, r.c, r.c + 4];
      const right = pick(slots);
      for (const s of slots) if (s !== right) r.fakes.push({ r: s - 1, f: r.f1 + 1 });
      door(r, number++, right);
      c = right;
    } else if (kind === "jog") {
      const w = 4;
      const shift = c === 0 ? pick([-4, 4]) : -Math.sign(c) * 4;
      const r = room("jog", w, 16);
      r.boxes = [[c - 2, c + 1, r.f0, r.f0 + 7], [c + shift - 2, c + shift + 1, r.f0 + 4, r.f1]];
      r.turn = { from: c, to: c + shift, f: r.f0 + 5.5 };
      door(r, number++, c + shift);
      c += shift;
    } else if (kind === "furniture") {
      const r = room("furniture", 8, 16);
      door(r, number++);
    }
  }
  // the last hall: windows down both sides, chandeliers, one more fallen bookcase
  const fin = room("final", 10, 40, { u1: 6, paper: B.wallpaper });
  for (let wf = fin.f0 + 3; wf + 1 < fin.f1; wf += 5) {
    for (const side of [-1, 1]) fin.windows.push({ side, f: wf, hand: false });
  }
  // hands at about a third of the windows, never both sides at once
  fin.windows.forEach((w, i) => {
    const pair = Math.floor(i / 2);
    if (pair % 2 === 0 && (i % 2 === 0) === (pair % 4 === 0)) w.hand = true;
  });
  fin.chandeliers = [fin.f0 + 6, fin.f0 + 14, fin.f0 + 22, fin.f0 + 30];
  fin.shelves.push({ f: fin.f0 + 26, gap: pick([-3, -1, 1]) });
  door(fin, 40);
  room("exit", 6, 8, { paper: B.green });
  // Seek's way through: door to door, through the crawl gaps, around the jog
  for (const r of rooms) {
    const entryC = r.index === 0 ? r.c : rooms[r.index - 1].exit.r + 1;
    r.entryC = entryC;
    r.path.push({ r: entryC, u: 0, f: r.f0 - 0.5 });
    if (r.turn) {
      r.path.push({ r: r.turn.from, u: 0, f: r.turn.f });
      r.path.push({ r: r.turn.to, u: 0, f: r.turn.f + 1 });
    }
    if (r.kind === "three") r.path.push({ r: entryC, u: 0, f: (r.f0 + r.f1) / 2 + 2 });
    for (const s of r.shelves) {
      const gc = r.c + s.gap + 1;
      r.path.push({ r: gc, u: 0, f: s.f - 1 }, { r: gc, u: 0, f: s.f + 2 });
    }
    if (r.exit) r.path.push({ r: r.exit.r + 1, u: 0, f: r.exit.f + 0.5 });
    else r.path.push({ r: r.c, u: 0, f: r.f0 + 4 });
  }
  return rooms;
}

/** All of Seek's path as one polyline with distances. */
export function polyline(rooms) {
  const pts = [];
  for (const r of rooms) for (const p of r.path) if (!pts.length || Math.hypot(p.r - pts[pts.length - 1].r, p.f - pts[pts.length - 1].f) > 0.01) pts.push(p);
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i].r - pts[i - 1].r, pts[i].f - pts[i - 1].f));
  return { pts, s, total: s[s.length - 1] };
}

/** Point at distance `d` along the polyline. */
export function pointAt(line, d) {
  const { pts, s } = line;
  if (d <= 0) return { ...pts[0], dir: { r: pts[1].r - pts[0].r, f: pts[1].f - pts[0].f } };
  for (let i = 1; i < pts.length; i++) {
    if (d <= s[i]) {
      const k = (d - s[i - 1]) / (s[i] - s[i - 1] || 1);
      const a = pts[i - 1];
      const b = pts[i];
      return { r: a.r + (b.r - a.r) * k, u: 0, f: a.f + (b.f - a.f) * k, dir: { r: b.r - a.r, f: b.f - a.f } };
    }
  }
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  return { ...b, dir: { r: b.r - a.r, f: b.f - a.f } };
}

/** How far along the path a frame point is (its closest point on the path, near its own row). */
export function progressOf(line, l) {
  let best = 0;
  let bestD = Infinity;
  const { pts, s } = line;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (Math.min(a.f, b.f) > l.f + 12 || Math.max(a.f, b.f) < l.f - 12) continue;
    const dr = b.r - a.r;
    const df = b.f - a.f;
    const L2 = dr * dr + df * df || 1;
    const t = Math.max(0, Math.min(1, ((l.r - a.r) * dr + (l.f - a.f) * df) / L2));
    const d = Math.hypot(a.r + dr * t - l.r, a.f + df * t - l.f);
    if (d < bestD) {
      bestD = d;
      best = s[i - 1] + Math.sqrt(L2) * t;
    }
  }
  return best;
}

// ---- building the rooms --------------------------------------------------------------------
function hotelShell(plan, r0, r1, f0, f1, u1, paper) {
  plan.box(r0 - 1, -1, f0 - 1, r1 + 1, u1 + 1, f1 + 1, B.wainscot);
  plan.box(r0 - 1, 2, f0 - 1, r1 + 1, u1 - 1, f1 + 1, paper);
  plan.box(r0 - 1, u1, f0 - 1, r1 + 1, u1, f1 + 1, B.trim);
  plan.box(r0 - 1, -1, f0 - 1, r1 + 1, -1, f1 + 1, B.floor);
  plan.box(r0 - 1, u1 + 1, f0 - 1, r1 + 1, u1 + 1, f1 + 1, B.ceiling);
}

/** The frame box a room (with its walls) takes up. @param {Room} r */
function roomBox(r) {
  let r0 = Infinity;
  let r1 = -Infinity;
  for (const b of r.boxes) {
    r0 = Math.min(r0, b[0]);
    r1 = Math.max(r1, b[1]);
  }
  return [r0 - 1, -1, r.f0 - 1, r1 + 1, r.u1 + 1, r.f1 + 1];
}

/** @param {Frame} fr @param {Room} r @param {() => number} rng */
function roomPlan(fr, r, rng) {
  const plan = new Plan();
  for (const b of r.boxes) hotelShell(plan, b[0], b[1], b[2], b[3], r.u1, r.paper);
  for (const b of r.boxes) plan.box(b[0], 0, b[2], b[1], r.u1, b[3], B.air);
  const r0 = r.c - r.w / 2;
  const r1 = r.c + r.w / 2 - 1;
  // the way in: the doorway from the room before (for the first room, an open doorway)
  if (r.index === 0) plan.box(r.entryC - 1, 0, r.f0 - 1, r.entryC, 2, r.f0 - 1, B.air);
  else doorway(plan, fr, r.entryC - 1, r.f0 - 1);
  if (r.exit) doorway(plan, fr, r.exit.r, r.exit.f);
  for (const fake of r.fakes) doorway(plan, fr, fake.r, fake.f);
  // a red runner and lights down the middle
  if (r.kind !== "jog") plan.box(r.c - 1, 0, r.f0, r.c, 0, r.f1, B.carpet);
  const lampEvery = r.kind === "final" ? 8 : 6;
  for (let f = r.f0 + 2; f <= r.f1 - 1; f += lampEvery) {
    const lc = r.kind === "jog" ? (f < r.f0 + 6 ? r.turn.from : r.turn.to) : r.c;
    if (r.kind === "final") continue;
    plan.set(lc - 1, r.u1, f, pillar(fr, "minecraft:iron_chain", "u"));
    plan.set(lc - 1, r.u1 - 1, f, lantern(true));
  }
  for (const b of r.boxes) {
    for (let rr = b[0]; rr <= b[1]; rr += 3) for (let f = b[2] + 1; f <= b[3]; f += 4) plan.set(rr, 1, f, B.light);
  }
  // furniture along the walls (kept out of the middle)
  if (r.kind === "ante" || r.kind === "hall" || r.kind === "three") {
    for (let f = r.f0 + 2; f < r.f1 - 1; f += 7) {
      const side = rng() < 0.5 ? r0 : r1;
      plan.set(side, 0, f, slab(B.planks, true));
      plan.set(side, 1, f, rng() < 0.5 ? candles(2) : lantern(false));
    }
  }
  if (r.kind === "hall") {
    // windows behind curtains on the right
    for (let f = r.f0 + 4; f < r.f1 - 2; f += 7) {
      plan.box(r1 + 1, 1, f, r1 + 1, 2, f + 1, joined(fr, "minecraft:glass_pane", ["f", "b"]));
      plan.set(r1, 3, f - 1, "minecraft:red_wool");
      plan.set(r1, 3, f + 2, "minecraft:red_wool");
    }
  }
  // fallen bookshelves to crouch under: a 1.5-block gap below, only where the Guiding Light shows
  for (const s of r.shelves) {
    for (let rr = r0; rr <= r1; rr++) {
      const inGap = rr >= r.c + s.gap && rr <= r.c + s.gap + 1;
      if (inGap) {
        plan.set(rr, 1, s.f, slab(B.planks, true));
        plan.box(rr, 2, s.f, rr, r.u1, s.f, B.shelf);
      } else plan.box(rr, 0, s.f, rr, r.u1, s.f, B.shelf);
    }
    r.gaps.push({ r: r.c + s.gap + 1, f: s.f });
  }
  if (r.kind === "three") {
    // the corners cut off: an octagonal room
    for (let k = 0; k < 3; k++) {
      plan.box(r0, 0, r.f0 + k, r0 + 2 - k, r.u1, r.f0 + k, B.wainscot);
      plan.box(r1 - 2 + k, 0, r.f0 + k, r1, r.u1, r.f0 + k, B.wainscot);
      plan.box(r0, 0, r.f1 - k, r0 + 2 - k, r.u1, r.f1 - k, B.wainscot);
      plan.box(r1 - 2 + k, 0, r.f1 - k, r1, r.u1, r.f1 - k, B.wainscot);
    }
    plan.set(r.c - 1, r.u1, (r.f0 + r.f1) >> 1, pillar(fr, "minecraft:iron_chain", "u"));
  }
  if (r.kind === "furniture") {
    // overturned furniture to weave around
    plan.box(r0, 0, r.f0 + 4, r.c - 1, 1, r.f0 + 4, B.shelf);
    plan.box(r.c, 0, r.f0 + 9, r1, 1, r.f0 + 9, B.shelf);
    plan.set(r.c + 2, 0, r.f0 + 2, slab(B.planks, true));
    plan.set(r.c - 3, 0, r.f0 + 12, slab(B.planks, true));
    plan.set(r.c + 1, 0, r.f0 + 13, stairs(fr, "minecraft:dark_oak_stairs", "l"));
    plan.set(r.c - 2, 0, r.f0 + 7, stairs(fr, "minecraft:dark_oak_stairs", "r"));
  }
  if (r.kind === "final") {
    for (const w of r.windows) {
      const wr = w.side < 0 ? r0 - 1 : r1 + 1;
      plan.box(wr, 1, w.f, wr, 3, w.f + 1, joined(fr, "minecraft:glass_pane", ["f", "b"]));
      plan.set(w.side < 0 ? r0 : r1, 4, w.f - 1, "minecraft:red_wool");
      plan.set(w.side < 0 ? r0 : r1, 4, w.f + 2, "minecraft:red_wool");
    }
    // the chandeliers' chains in the ceiling and a long runner
    plan.box(r.c - 2, 0, r.f0, r.c + 1, 0, r.f1, B.carpet);
  }
  if (r.kind === "exit") {
    plan.box(r.c - 1, 1, r.f1 + 1, r.c, 2, r.f1 + 1, "minecraft:sea_lantern");
  }
  return plan;
}

/** @param {Frame} fr */
function doorway(plan, fr, r, f) {
  plan.box(r - 1, 0, f, r + 2, 3, f, B.log);
  plan.box(r - 1, 3, f, r + 2, 3, f, pillar(fr, B.log, "r"));
  plan.box(r, 0, f, r + 1, 2, f, B.air);
}

// ---- the run ---------------------------------------------------------------------------------
/**
 * @typedef {{
 *   rooms: Room[], line: any, seed: number, rng: () => number, seekId?: string, s: number, introAt: number,
 *   chaseAt: number, lastKill: number, stepAt: number, buildBusy: boolean, endAt: number, escaped: Set<string>,
 *   hands: { id: string, room: number, w: any, out: boolean, at: number, face: number }[],
 *   lights: { id: string, f: number, state: number, at: number, u: number }[],
 *   burnt: Map<string, number>, rattleAt: number, guidedRoom: number, finalOpen: boolean,
 * }} SeekData
 */

/** @param {Player} p */
export function onUse(p) {
  if (Doors.runOf(p) || Doors.pendingRunOf(p)) {
    p.sendMessage("§7You are already in a level. Finish it first.");
    return;
  }
  const fr = frameFor(p);
  if (!fitsHeight(fr, [-8, -1, -1, 8, 8, 10])) {
    p.sendMessage("§cThere is no room for the hotel here (too close to the top or bottom of the world).");
    return;
  }
  confirm(p, "Door 30: Seek", "Build the Seek chase in front of you?\n\nThe hotel's rooms are built ahead of you as you run, about 210 blocks straight ahead and up to 12 blocks to each side. They replace anything in the way.\n\nWhen the eyes appear on the walls... get ready to run.", () => start(p));
}

/** @param {Player} p */
function frameFor(p) {
  const yaw = p.getRotation().y;
  const fr0 = new Frame(p.dimension, { x: 0, y: 0, z: 0 }, yaw);
  const loc = p.location;
  return new Frame(p.dimension, { x: Math.round(loc.x + fr0.F.x * 2.5), y: Math.floor(loc.y + 0.01), z: Math.round(loc.z + fr0.F.z * 2.5) }, yaw);
}

/** @param {Player} p */
function start(p) {
  const fr = frameFor(p);
  const seed = Math.floor(Math.random() * 1e9);
  const rng = rngFrom(seed);
  const rooms = chaseLayout(rng);
  if (!isLoaded(fr, roomBox(rooms[0])) || !isLoaded(fr, roomBox(rooms[1]))) {
    p.sendMessage("§cPart of that area isn't loaded. Move to an open space and try again.");
    return;
  }
  /** @type {SeekData} */
  const data = {
    rooms, line: polyline(rooms), seed, rng, s: 0, introAt: 0, chaseAt: 0, lastKill: 0, stepAt: 0, buildBusy: false,
    endAt: 0, escaped: new Set(), hands: [], lights: [], burnt: new Map(), rattleAt: 0, guidedRoom: -1, finalOpen: false,
  };
  let r0 = Infinity;
  let r1 = -Infinity;
  for (const r of rooms) {
    const b = roomBox(r);
    r0 = Math.min(r0, b[0]);
    r1 = Math.max(r1, b[3]);
  }
  const last = rooms[rooms.length - 1];
  const run = Doors.newRun("seek", p, fr, [r0, -1, -1, r1, 7, last.f1 + 1], data);
  p.sendMessage("§7Building the hotel...");
  buildRoom(run, 0, () => buildRoom(run, 1, () => {
    run.phase = "ready";
    p.sendMessage("§6Door 30 §7is ready. Go in... and keep going.");
    buildRoom(run, 2);
  }));
}

/** @param {Run} run */
function buildRoom(run, i, then) {
  /** @type {SeekData} */
  const d = run.data;
  const r = d.rooms[i];
  if (!r || r.built || r.building) {
    then?.();
    return;
  }
  const fr = run.frame;
  if (!isLoaded(fr, roomBox(r))) return;
  r.building = true;
  d.buildBusy = true;
  build(fr, roomPlan(fr, r, rngFrom(d.seed + i * 7919)), (ok) => {
    r.building = false;
    d.buildBusy = false;
    if (!ok) return;
    r.built = true;
    // this room's walls share the doorway with the room before: keep its door shut
    const prev = d.rooms[i - 1];
    if (prev?.door) Doors.sealDoor(run, prev.door);
    furnish(run, r);
    then?.();
  });
}

/** Doors, eyes, hands and chandeliers of a freshly built room. @param {Run} run @param {Room} r */
function furnish(run, r) {
  /** @type {SeekData} */
  const d = run.data;
  const fr = run.frame;
  const rng = rngFrom(d.seed + r.index * 104729);
  r.ents = [];
  if (r.exit) r.door = Doors.spawnDoor(run, r.exit.r, 0, r.exit.f, plateIndex(r.exit.number), { number: r.exit.number });
  r.fakeDoors = r.fakes.map((fk) => Doors.spawnDoor(run, fk.r, 0, fk.f, plateIndex(r.exit.number), { number: r.exit.number, fake: true }));
  // eyes: a few in the first corridor, more and more after that
  const count = { ante: 4, hall: 16, final: 3, exit: 0 }[r.kind] ?? 9;
  for (let k = 0; k < count; k++) {
    const b = r.boxes[Math.floor(rng() * r.boxes.length)];
    const side = rng() < 0.5;
    // in the hallway they crowd toward the far end
    const t = r.kind === "hall" ? Math.sqrt(rng()) : rng();
    const f = b[2] + 0.6 + t * (b[3] - b[2] - 0.2);
    const u = 0.7 + rng() * 2.6;
    const rr = side ? b[0] + 0.04 : b[1] + 1 - 0.04;
    const e = Doors.spawnFor(run, "zt:seek_eye", fr.at(rr, u, f), { yaw: fr.yawOf(side ? "r" : "l") });
    e.setProperty("zt:size", Math.round((0.6 + rng() * 0.9) * 100) / 100);
    e.setProperty("zt:pair", rng() < 0.3);
    r.ents.push(e.id);
  }
  if (r.kind === "final") {
    const c = r.c;
    for (const w of r.windows) {
      if (!w.hand) continue;
      const wallFace = w.side < 0 ? c - r.w / 2 : c + r.w / 2;
      const e = Doors.spawnFor(run, "zt:seek_hand", fr.at(wallFace, 2.4, w.f + 1), { yaw: fr.yawOf(w.side < 0 ? "r" : "l") });
      d.hands.push({ id: e.id, room: r.index, w, out: false, at: 0, face: wallFace });
      r.ents.push(e.id);
    }
    for (const cf of r.chandeliers) {
      // hung so its chain meets the ceiling
      const hang = r.u1 + 1 - 1.75;
      const e = Doors.spawnFor(run, "zt:chandelier", fr.at(c, hang, cf + 0.5), { keep: true, yaw: fr.yaw });
      d.lights.push({ id: e.id, f: cf + 0.5, state: 0, at: 0, u: hang });
    }
  }
}

/** Which room a frame point is in (by its row). @param {SeekData} d */
function roomAt(d, l) {
  for (const r of d.rooms) if (l.f >= r.f0 - 1 && l.f <= r.f1 + 1.0) return r.index;
  return l.f < 0 ? 0 : d.rooms.length - 1;
}

/** @param {Run} run */
function tick(run, now) {
  /** @type {SeekData} */
  const d = run.data;
  const fr = run.frame;
  if (run.phase === "building") return;
  if (run.phase === "ready") {
    const near = run.dim.getPlayers({ location: fr.at(0, 0, 20), maxDistance: 40 }).filter((p) => Doors.inside(run, p.location, 1));
    // door 30 opens for whoever walks up to it
    Doors.autoOpenDoors(run, near, 2.6, (door) => door === d.rooms[0].door);
    for (const p of near) {
      const l = fr.local(p.location);
      if (l.f > d.rooms[1].f1 - 4 && l.f < d.rooms[1].f1 + 1) {
        intro(run, now);
        break;
      }
    }
    return;
  }
  if (run.phase === "intro") {
    introTick(run, now);
    return;
  }
  if (run.phase === "live") chaseTick(run, now);
  if (run.phase === "ending" && now >= d.endAt) {
    for (const id of d.escaped) {
      const p = world.getEntity(id);
      if (isValid(p)) Doors.sendHome(run, /** @type {Player} */ (p));
    }
    Doors.endRun(run, "escaped");
  }
}

/** At the end of the hallway the view swings back: Seek rises from its puddle. @param {Run} run */
function intro(run, now) {
  /** @type {SeekData} */
  const d = run.data;
  const fr = run.frame;
  run.phase = "intro";
  d.introAt = now;
  const players = run.dim.getPlayers({ location: fr.at(0, 0, 20), maxDistance: 48 }).filter((p) => {
    const l = fr.local(p.location);
    return Doors.inside(run, p.location, 1) && l.f < d.rooms[2].f0;
  });
  const hall = d.rooms[1];
  const puddle = { r: hall.c, u: 0, f: hall.f0 + 3 };
  d.s = progressOf(d.line, puddle);
  const seek = Doors.spawnFor(run, SEEK, fr.at(puddle.r, 0, puddle.f), { spawnEvent: "zt:as_level", yaw: fr.yawOf("f") });
  seek.setProperty("zt:anim", 1);
  d.seekId = seek.id;
  Doors.sound(run.dim, "zt.seek.rise", seek.location, 3.0, 1.0);
  for (const p of players) {
    Doors.join(run, p);
    Doors.lockInput(p, true);
    const l = fr.local(p.location);
    // the camera turns around to look back down the hallway
    Doors.camera(p, fr.at(l.r, 2.2, l.f + 0.5), fr.at(puddle.r, 1.4, puddle.f), 0.9);
  }
  if (d.rooms[0].door) Doors.closeDoor(run, d.rooms[0].door, true);
}

/** @param {Run} run */
function introTick(run, now) {
  /** @type {SeekData} */
  const d = run.data;
  const t = now - d.introAt;
  const seek = d.seekId ? world.getEntity(d.seekId) : undefined;
  if (isValid(seek) && t % 6 === 0) particle(run.dim, "zt:seek_goo", { x: seek.location.x, y: seek.location.y + 0.3, z: seek.location.z });
  if (t === 52 && isValid(seek)) Doors.sound(run.dim, "zt.seek.roar", seek.location, 3.0, 1.0);
  if (t < 66) return;
  run.phase = "live";
  d.chaseAt = now;
  if (isValid(seek)) seek.setProperty("zt:anim", 2);
  for (const p of Doors.livePlayers(run)) {
    Doors.lockInput(p, false);
    Doors.cameraClear(p);
    Doors.actionbar(p, "§c§lRUN!");
    try {
      p.addEffect("saturation", 20 * 120, { amplifier: 0, showParticles: false });
      p.playMusic("zt.music.seek_chase", { loop: true, fade: 0.3, volume: 1.0 });
    } catch {
      /* ignore */
    }
  }
}

/** @param {Run} run */
function chaseTick(run, now) {
  /** @type {SeekData} */
  const d = run.data;
  const fr = run.frame;
  const players = Doors.livePlayers(run).filter((p) => !d.escaped.has(p.id));
  const progress = players.map((p) => ({ p, l: fr.local(p.location), s: 0 }));
  for (const x of progress) x.s = progressOf(d.line, x.l);
  // keep building ahead of the leader, and take the eyes away behind the last one
  const lead = progress.reduce((m, x) => Math.max(m, roomAt(d, x.l)), 0);
  const rear = progress.reduce((m, x) => Math.min(m, roomAt(d, x.l)), d.rooms.length);
  if (!d.buildBusy) {
    for (let i = 0; i <= Math.min(lead + 2, d.rooms.length - 1); i++) {
      if (!d.rooms[i].built) {
        buildRoom(run, i);
        break;
      }
    }
  }
  for (const r of d.rooms) {
    if (r.ents?.length && r.index < rear - 1) {
      for (const id of r.ents) {
        const e = world.getEntity(id);
        if (isValid(e)) e.remove();
      }
      r.ents = [];
    }
  }
  guide(run, lead, now);
  doors(run, progress, now);
  seekMove(run, progress, now);
  if (d.rooms[d.rooms.length - 2].built) lastHall(run, progress, now);
  // the boss bar: how much of the chase is left
  for (const x of progress) {
    const i = roomAt(d, x.l);
    const r = d.rooms[i];
    const frac = Math.max(0, Math.min(1, (x.l.f - r.f0) / (r.f1 - r.f0 + 1)));
    const done = Math.max(0, Math.min(CHASE_ROOMS, i - 1 + frac));
    Doors.setMeter(x.p, "seek", ((CHASE_ROOMS - done) / CHASE_ROOMS) * 100);
  }
  // through the last door: escaped
  const exit = d.rooms[d.rooms.length - 1];
  for (const x of progress) if (x.l.f > exit.f0 + 0.5) d.escaped.add(x.p.id);
  if (d.escaped.size && !Doors.livePlayers(run).some((p) => !d.escaped.has(p.id))) escape(run, now);
}

/** The Guiding Light: the door to take glows blue, and so do the gaps to crouch under. @param {Run} run */
function guide(run, lead, now) {
  /** @type {SeekData} */
  const d = run.data;
  const fr = run.frame;
  if (d.guidedRoom !== lead) {
    for (const r of d.rooms) if (r.door) Doors.guideDoor(r.door, r.index === lead);
    d.guidedRoom = lead;
  }
  if (now % 5 !== 0) return;
  const r = d.rooms[lead];
  if (!r) return;
  if (r.door) {
    const c = Doors.doorCenter(run, r.door);
    Doors.guidingLight(run.dim, c, fr.F.x ? 0.3 : 1.0, 1.4, fr.F.x ? 1.0 : 0.3);
  }
  for (const g of r.gaps) Doors.guidingLight(run.dim, fr.at(g.r, 0.6, g.f + 0.5), fr.F.x ? 0.4 : 0.9, 0.45, fr.F.x ? 0.9 : 0.4);
  if (r.kind === "final") {
    // a trail down the middle of the last hall, stepping around the fallen chandeliers
    for (const L of d.lights) {
      if (L.state !== 2) continue;
      const side = Math.floor(L.f) % 2 === 0 ? -1.8 : 1.8;
      Doors.guidingLight(run.dim, fr.at(r.c + side, 0.3, L.f), 0.3, 0.2, 0.3);
    }
  }
}

/** Real doors open as you reach them (if the room behind is built); fake ones only rattle. @param {Run} run */
function doors(run, progress, now) {
  /** @type {SeekData} */
  const d = run.data;
  for (const r of d.rooms) {
    if (r.door && !r.door.open && (d.rooms[r.index + 1]?.built ?? false)) {
      for (const x of progress) {
        const c = Doors.doorCenter(run, r.door);
        if (len(sub(x.p.location, { x: c.x, y: c.y - 1.5, z: c.z })) <= 2.6) {
          Doors.openDoor(run, r.door);
          break;
        }
      }
    }
    for (const fake of r.fakeDoors ?? []) {
      const c = Doors.doorCenter(run, fake);
      for (const x of progress) {
        if (len(sub(x.p.location, { x: c.x, y: c.y - 1.5, z: c.z })) <= 1.9 && now >= d.rattleAt) {
          d.rattleAt = now + 25;
          Doors.sound(run.dim, "zt.doors.locked", c, 1.0, 1.0);
          Doors.actionbar(x.p, "§7It's locked! §bFollow the light.");
        }
      }
    }
  }
}

/** Seek runs along the rooms' path; faster when it's far behind. @param {Run} run */
function seekMove(run, progress, now) {
  /** @type {SeekData} */
  const d = run.data;
  const fr = run.frame;
  const seek = d.seekId ? world.getEntity(d.seekId) : undefined;
  if (!isValid(seek)) return;
  let gap = Infinity;
  for (const x of progress) gap = Math.min(gap, x.s - d.s);
  if (!progress.length) gap = 0;
  const t = now - d.chaseAt;
  let speed = SPEED.base + Math.max(0, gap - SPEED.ease) * SPEED.catchUp;
  if (t < 50) speed = SPEED.start;
  speed = Math.min(SPEED.max, speed);
  // a fallen bookshelf slows Seek down too, as it squeezes under
  const here = fr.local(seek.location);
  for (const r of d.rooms) {
    for (const sh of r.shelves) if (Math.abs(here.f - (sh.f + 0.5)) < 1.2) speed = Math.min(speed, SPEED.squeeze);
  }
  // it never gets through the last door
  const fin = d.rooms[d.rooms.length - 2];
  const stopAt = progressOf(d.line, { r: fin.exit.r + 1, u: 0, f: fin.exit.f + 0.5 }) - 1.0;
  if (now < d.lastKill + 16) speed = 0;
  d.s = Math.min(stopAt, d.s + speed / 20);
  const p = pointAt(d.line, d.s);
  const target = fr.at(p.r, 0, p.f);
  const loc = seek.location;
  try {
    if (len(sub(target, loc)) > 4) seek.teleport(target);
    else {
      seek.clearVelocity();
      seek.applyImpulse({ x: target.x - loc.x, y: target.y - loc.y, z: target.z - loc.z });
    }
    const yaw = yawTo(fr.at(0, 0, 0), fr.at(p.dir.r, 0, p.dir.f));
    seek.setRotation({ x: 0, y: yaw });
  } catch {
    /* ignore */
  }
  if (speed > 0 && now >= d.stepAt) {
    d.stepAt = now + 6;
    Doors.sound(run.dim, "zt.seek.step", loc, 1.0, 0.9 + Math.random() * 0.2);
    if (Math.random() < 0.4) particle(run.dim, "zt:seek_goo", { x: loc.x, y: loc.y + 0.2, z: loc.z });
  }
  // caught
  for (const x of progress) {
    if (!Doors.canDie(x.p)) continue;
    const close = x.s - d.s <= 1.0 && len(sub(x.p.location, loc)) <= 2.2;
    if (close || len(sub(x.p.location, loc)) <= KILL_REACH) {
      d.lastKill = now;
      seek.setProperty("zt:anim", 3);
      system.runTimeout(() => isValid(seek) && seek.setProperty("zt:anim", 2), 16);
      Doors.kill(x.p, seek, "seek");
    }
  }
}

/** The last hall: hands through the windows, chandeliers crashing down in flames. @param {Run} run */
function lastHall(run, progress, now) {
  /** @type {SeekData} */
  const d = run.data;
  const fr = run.frame;
  const fin = d.rooms[d.rooms.length - 2];
  for (const h of d.hands) {
    const hand = world.getEntity(h.id);
    if (!isValid(hand)) continue;
    if (!h.out) {
      if (progress.some((x) => x.l.f >= h.w.f - 7 && x.l.f < h.w.f + 3)) {
        h.out = true;
        h.at = now;
        hand.setProperty("zt:anim", 1);
        const pane = fr.at(h.face + (h.w.side < 0 ? -0.5 : 0.5), 2, h.w.f + 1);
        Doors.sound(run.dim, "zt.seek.hands", pane, 1.6, 1.0);
        particle(run.dim, "zt:glass_burst", pane);
        // the window shatters
        const wr = h.w.side < 0 ? fin.c - fin.w / 2 - 1 : fin.c + fin.w / 2;
        for (let u = 1; u <= 3; u++) {
          for (const f of [h.w.f, h.w.f + 1]) {
            try {
              run.dim.setBlockType(fr.cell(wr, u, f), "minecraft:air");
            } catch {
              /* ignore */
            }
          }
        }
      }
      continue;
    }
    if (now - h.at < 6) continue;
    // anyone within its reach is dragged out through the window
    for (const x of progress) {
      const into = h.w.side < 0 ? x.l.r - h.face : h.face - x.l.r;
      if (into < -0.3 || into > HAND_REACH) continue;
      if (x.l.f < h.w.f - 0.4 || x.l.f > h.w.f + 2.4 || x.l.u > 3.5) continue;
      if (!Doors.canDie(x.p)) continue;
      hand.setProperty("zt:anim", 2);
      Doors.sound(run.dim, "zt.seek.grab", x.p.location, 1.4, 1.0);
      const out = fr.vec(h.w.side < 0 ? "l" : "r");
      try {
        x.p.applyKnockback({ x: out.x * 1.6, z: out.z * 1.6 }, 0.4);
      } catch {
        /* ignore */
      }
      Doors.kill(x.p, hand, "hands");
      system.runTimeout(() => isValid(hand) && hand.setProperty("zt:anim", 1), 30);
    }
  }
  for (const L of d.lights) {
    const ch = world.getEntity(L.id);
    if (!isValid(ch)) continue;
    if (L.state === 0 && progress.some((x) => x.l.f >= L.f - 6.5)) {
      L.state = 1;
      L.at = now;
      ch.setProperty("zt:state", 1);
      Doors.sound(run.dim, "zt.doors.padlock", ch.location, 1.2, 0.6);
    }
    if (L.state === 1) {
      const k = Math.min(1, (now - L.at) / 10);
      const u = L.u * (1 - k * k);
      try {
        ch.teleport(fr.at(fin.c, u, L.f));
      } catch {
        /* ignore */
      }
      if (k >= 1) {
        L.state = 2;
        ch.setProperty("zt:state", 2);
        Doors.sound(run.dim, "zt.seek.chandelier", ch.location, 2.0, 1.0);
        particle(run.dim, "zt:glass_burst", ch.location);
      }
    }
    if (L.state === 2) {
      // it burns
      const at = fr.at(fin.c, 0.2, L.f);
      if (now % 3 === 0) particle(run.dim, "zt:chandelier_fire", at);
      if (now % 30 === 0) Doors.sound(run.dim, "zt.seek.fire", at, 1.0, 1.0);
      for (const x of progress) {
        if (Math.hypot(x.l.r - fin.c, x.l.f - L.f) > FIRE_RADIUS + 0.3 || x.l.u > 2) continue;
        if (!Doors.canDie(x.p)) continue;
        const last = d.burnt.get(x.p.id + L.id) ?? -999;
        if (now - last < 20) continue;
        d.burnt.set(x.p.id + L.id, now);
        try {
          const hp = x.p.getComponent("minecraft:health");
          if (hp && hp.currentValue <= FIRE_DAMAGE) x.p.setDynamicProperty("zt:doors_death", "fire");
          x.p.applyDamage(FIRE_DAMAGE, { cause: /** @type {any} */ ("fire") });
          x.p.setOnFire(3, true);
        } catch {
          /* ignore */
        }
      }
    }
  }
  // the Guiding Light holds the last door open as you come
  const door = fin.door;
  if (door && !d.finalOpen && progress.some((x) => x.l.f >= fin.f1 - 6)) {
    d.finalOpen = true;
    Doors.openDoor(run, door);
    Doors.guideDoor(door, true);
  }
}

/** The door slams on Seek; the chase is over. @param {Run} run */
function escape(run, now) {
  /** @type {SeekData} */
  const d = run.data;
  run.phase = "ending";
  d.endAt = now + 80;
  const fin = d.rooms[d.rooms.length - 2];
  if (fin.door) {
    Doors.closeDoor(run, fin.door, true);
    Doors.guideDoor(fin.door, false);
  }
  const seek = d.seekId ? world.getEntity(d.seekId) : undefined;
  if (isValid(seek)) {
    Doors.sound(run.dim, "zt.seek.slam", seek.location, 2.5, 1.0);
    system.runTimeout(() => isValid(seek) && seek.remove(), 10);
  }
  for (const id of d.escaped) {
    const p = world.getEntity(id);
    if (!isValid(p)) continue;
    const pl = /** @type {Player} */ (p);
    Doors.clearMeter(pl);
    try {
      pl.stopMusic();
      pl.playSound("zt.doors.escape", { volume: 1.0 });
    } catch {
      /* ignore */
    }
    Doors.title(pl, "§aYou survived Seek!", "§bThe Guiding Light shut the door behind you.", 70);
  }
}

/** @param {Run} run */
function end(run) {
  /** @type {SeekData} */
  const d = run.data;
  for (const [id] of run.players) {
    const p = world.getEntity(id);
    if (isValid(p)) {
      try {
        /** @type {Player} */ (p).stopMusic();
      } catch {
        /* ignore */
      }
    }
  }
  // chandeliers that never fell stay up; hands and eyes go with the run
  void d;
}

/** @param {Run} run @param {Player} p */
function death(run, p) {
  try {
    p.stopMusic();
  } catch {
    /* ignore */
  }
}

Doors.registerKind("seek", { tick, end, death });

// ---- Seek from a spawn egg: it chases the nearest player and kills whoever it catches ---------
/** @type {Map<string, { last: any, stepAt: number }>} */
const free = new Map();
let scanAt = 0;

export function seekFreeTick(now) {
  if (now >= scanAt) {
    scanAt = now + 20;
    for (const p of world.getAllPlayers()) {
      let list = [];
      try {
        list = p.dimension.getEntities({ type: SEEK, location: p.location, maxDistance: 96 });
      } catch {
        continue;
      }
      for (const e of list) if (!free.has(e.id) && e.getDynamicProperty("zt:run") === undefined) free.set(e.id, { last: e.location, stepAt: 0 });
    }
  }
  for (const [id, m] of free) {
    const e = world.getEntity(id);
    if (!isValid(e)) {
      free.delete(id);
      continue;
    }
    const at = e.location;
    const speed = Math.hypot(at.x - m.last.x, at.z - m.last.z) * 20;
    m.last = { ...at };
    try {
      const want = speed > 1.0 ? 2 : 0;
      if (e.getProperty("zt:anim") !== want && e.getProperty("zt:anim") !== 3) e.setProperty("zt:anim", want);
    } catch {
      /* ignore */
    }
    if (speed > 1.0 && now >= m.stepAt) {
      m.stepAt = now + 6;
      Doors.sound(e.dimension, "zt.seek.step", at, 0.9, 1.0);
    }
    for (const v of livingAround(e.dimension, at, 2.5)) {
      if (v.typeId !== "minecraft:player") continue;
      const s = bodySize(v);
      if (dist2D(v.location, at) > 0.4 + s.r + 0.3 || Math.abs(v.location.y - at.y) > 2) continue;
      try {
        e.setProperty("zt:anim", 3);
      } catch {
        /* ignore */
      }
      system.runTimeout(() => {
        if (isValid(e)) e.setProperty("zt:anim", 0);
      }, 16);
      Doors.kill(v, e, "seek");
    }
  }
}

