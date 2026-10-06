// What the Hotel's Floor 1 run and the creatures in it (Rush, Screech, Hide, the Figure at
// door 100) share: which room a point is in, the way through the rooms from door to door,
// and the rooms' lamps (flickering, out, broken).
import { perm } from "./doors_build.js";
import { particle } from "./util.js";

/** @typedef {import("./doors_common.js").Run} Run */
/** @typedef {import("./doors_rooms.js").FloorRoom} FloorRoom */

/**
 * The Floor 1 run's data (doors_floor1.js fills it in).
 * @typedef {{
 *   seed: number, rooms: FloorRoom[], seek1: any, seek2: any, lib: any, d100: any, phase: string,
 *   frontier: number, lead: number, rear: number, maxF: number, [k: string]: any,
 * }} FloorData
 */

/** The room a frame point is in (by how far forward it is), or -1 before the first. @param {FloorData} d */
export function roomIndexAt(d, l) {
  const rooms = d.rooms;
  if (l.f < rooms[0].f0 - 1) return -1;
  let lo = 0;
  let hi = rooms.length - 1;
  // the rooms run forward one after another: binary search on where each starts
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (rooms[mid].f0 - 1 <= l.f) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * The way through room `n` from its way in to its way out: forward, across, forward (the
 * walkway its furniture keeps clear), as frame points at height `up` above its floor.
 * @param {FloorRoom} room
 */
export function walkPoints(room, up = 1.0) {
  const ex = room.entryR + 1;
  const xx = room.exitR + 1;
  const mid = room.f0 + (room.turnZ ?? Math.floor(room.L / 2));
  const u = room.u0 + up;
  return [
    { r: ex, u, f: room.f0 - 0.5 },
    { r: ex, u, f: mid + 0.5 },
    { r: xx, u, f: mid + 0.5 },
    { r: xx, u, f: room.f1 + 1.5 },
  ];
}

/** Points through rooms a..b (inclusive), door to door. @param {FloorData} d */
export function pathThrough(d, a, b, up = 1.0) {
  const pts = [];
  for (let n = a; n <= b; n++) {
    const room = d.rooms[n];
    if (!room) continue;
    for (const p of walkPoints(room, up)) {
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(p.r - last.r, p.f - last.f, p.u - last.u) > 0.01) pts.push(p);
    }
  }
  return pts;
}

/** A path's lengths so far, for walking along it. */
export function measure(pts) {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i].r - pts[i - 1].r, pts[i].f - pts[i - 1].f, pts[i].u - pts[i - 1].u));
  return { pts, s, total: s[s.length - 1] };
}

/** The point `dist` along a measured path, with the way it is heading. */
export function along(line, dist) {
  const { pts, s } = line;
  if (pts.length === 1) return { ...pts[0], dir: { r: 0, f: 1 } };
  for (let i = 1; i < pts.length; i++) {
    if (dist <= s[i] || i === pts.length - 1) {
      const k = Math.max(0, Math.min(1, (dist - s[i - 1]) / (s[i] - s[i - 1] || 1)));
      const a = pts[i - 1];
      const b = pts[i];
      return { r: a.r + (b.r - a.r) * k, u: a.u + (b.u - a.u) * k, f: a.f + (b.f - a.f) * k, dir: { r: b.r - a.r, f: b.f - a.f } };
    }
  }
  return { ...pts[pts.length - 1], dir: { r: 0, f: 1 } };
}

// ---------------------------------------------------------------- lamps
/** Set one lamp: 0 off, 1 on, 2 broken. @param {Run} run */
export function setLamp(run, lamp, lit) {
  if (lamp.spec.states["zt:lit"] === lit) return;
  lamp.spec = { id: lamp.spec.id, states: { ...lamp.spec.states, "zt:lit": lit } };
  const [r, u, f] = lamp.cell;
  try {
    const p = perm(lamp.spec);
    if (p) run.dim.setBlockPermutation(run.frame.cell(r, u, f), p);
  } catch {
    /* chunk unloaded */
  }
}

/** Turn a room's working lamps on or off. @param {Run} run @param {FloorRoom} room */
export function roomLights(run, room, on) {
  for (const lamp of room.lamps ?? []) if (lamp.spec.states["zt:lit"] !== 2) setLamp(run, lamp, on ? 1 : 0);
}

/** Rush went through: every lamp in the room bursts. @param {Run} run @param {FloorRoom} room */
export function breakLights(run, room) {
  let any = false;
  for (const lamp of room.lamps ?? []) {
    if (lamp.spec.states["zt:lit"] === 2) continue;
    setLamp(run, lamp, 2);
    any = true;
    const [r, u, f] = lamp.cell;
    const at = run.frame.at(r + 0.5, u + 0.5, f + 0.5);
    particle(run.dim, "zt:glass_burst", at);
  }
  room.broken = true;
  return any;
}

/** Is it dark in this room (built dark, its lights broken, or never lit)? @param {FloorRoom} room */
export function isDark(room) {
  if (!room || room.seg) return false;
  if (room.kind === "greenhouse") return true;
  if (room.kind === "courtyard" || room.kind === "shop" || room.kind === "reception" || room.kind === "door100") return false;
  if (room.dark || room.broken) return true;
  const lamps = room.lamps ?? [];
  return lamps.length > 0 && lamps.every((l) => l.spec.states["zt:lit"] !== 1);
}

/** Rooms where the hotel's creatures (Rush, Screech, Hide) can show up. @param {FloorRoom} room */
export function isOrdinary(room) {
  return !!room && !room.seg && room.kind !== "reception" && room.kind !== "shop" && room.kind !== "courtyard" &&
    room.kind !== "door100";
}
