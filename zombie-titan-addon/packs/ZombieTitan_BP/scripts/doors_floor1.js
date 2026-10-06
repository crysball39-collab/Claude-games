// The Hotel, Floor 1 (DOORS). Ride an elevator down from the Lobby and you arrive at room 0,
// the reception, where the key to door 1 hangs behind the desk. From there the hotel's rooms
// are built ahead of you as you go, a different hotel every run: rooms with closets to hide
// in and beds to hide under, drawers with gold and things to find, locked doors whose key is
// somewhere in the room. The lights flicker before Rush comes; Screech waits in the dark;
// Hide doesn't like you hiding for long. Eyes on the walls from door 27 mean Seek, at 30 and
// again at 60; the Library at 50; Jeff's shop at 52; the hotel falls apart after it; the
// Infirmary at 80, the Courtyard at 89, the Greenhouse to 99, and at door 100 the way out.
import { system, world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { build, isLoaded, perm, shifted, turned } from "./doors_build.js";
import * as Doors from "./doors_common.js";
import * as D100 from "./doors_door100.js";
import { isDark, isOrdinary, roomIndexAt, walkPoints } from "./doors_hotel.js";
import * as Items from "./doors_items.js";
import * as Library from "./doors_library.js";
import { rngFrom } from "./doors_library.js";
import * as Mobs from "./doors_mobs.js";
import { KINDS, pickKind, roomBox, roomContent, SPECIAL } from "./doors_rooms.js";
import * as Seek from "./doors_seek.js";
import { isValid, len, sub } from "./util.js";

/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {import("./doors_common.js").Run} Run */
/** @typedef {import("./doors_build.js").Frame} Frame */
/** @typedef {import("./doors_rooms.js").FloorRoom} FloorRoom */
/** @typedef {import("./doors_hotel.js").FloorData} FloorData */

export const ITEM = "zt:doors_floor1";
export const RIDE_TICKS = 300;          // fifteen seconds down
const AHEAD = 2;                        // rooms built ahead of the leader
const PRICES = { lighter: 100, flashlight: 200, skeleton_key: 400, crucifix: 500 };
const HIDE_WARN = 200;                  // Hide's eyes after ten seconds hidden...
const HIDE_KICK = 300;                  // ...and five more, it throws you out
const HIDE_DAMAGE = 8;

// ---------------------------------------------------------------- the plan of the floor
/**
 * Every room of the floor, 0 to 100, where it goes and what it is. The Seek chases and the
 * Library are laid out by their own modules where the hotel has got to.
 * @param {Frame} fr the hotel's frame (room 0's near wall at f = -1) @returns {FloorData}
 */
export function planFloor(fr, seed) {
  const rng = rngFrom(seed);
  /** @type {FloorRoom[]} */
  const rooms = [];
  /** @type {FloorData} */
  const d = /** @type {any} */ ({ seed, rooms, seek1: undefined, seek2: undefined, lib: undefined, d100: undefined });
  const mk = (n, kind, w, L, H, c, f0, u0, entryR, exitR, extra = {}) => {
    /** @type {FloorRoom} */
    const room = {
      n, kind, style: "hotel", c, w, L, H, f0, f1: f0 + L - 1, u0, entryR, exitR, boxes: [[-w / 2, w / 2 - 1, 0, L - 1]],
      dark: false, locked: false, eyes: 0, gateIn: false, gateOut: false, ...extra,
    };
    rooms.push(room);
    return room;
  };
  const reception = mk(0, "reception", SPECIAL.reception.w, SPECIAL.reception.L, SPECIAL.reception.H, 0, 0, 0, -1, -1);
  reception.locked = true;
  let prev = reception;
  let lastKind = "reception";
  for (let n = 1; n <= 100; n++) {
    const entryR = prev.exitR;
    const f0 = prev.f1 + 2;
    const u0 = prev.u0Out ?? prev.u0;
    // ---- Seek: the corridor (29/59) to the last hall (39/69)
    if (n === 29 || n === 59) {
      const key = n === 29 ? "seek1" : "seek2";
      const chase = Seek.newChase(shifted(fr, 0, u0, 0), seed + n * 31, { first: n + 1, c0: entryR + 1, f0, floor: true });
      d[key] = chase;
      chase.rooms.forEach((cr, i) => {
        let r0 = Infinity;
        let r1 = -Infinity;
        for (const b of cr.boxes) {
          r0 = Math.min(r0, b[0]);
          r1 = Math.max(r1, b[1]);
        }
        mk(n + i, "seek", r1 - r0 + 1, cr.f1 - cr.f0 + 1, cr.u1 + 1, (r0 + r1 + 1) / 2, cr.f0, u0, cr.entryC - 1, cr.exit.r,
          { seg: key, si: i, eyes: 0 });
      });
      n += chase.rooms.length - 1;
      prev = rooms[rooms.length - 1];
      lastKind = "seek";
      continue;
    }
    // ---- the Library: its corridor (49), the hall (50), the little room after door 51 (51)
    if (n === 49) {
      const cl = entryR + 1;
      d.lib = Library.newLibrary(shifted(fr, cl, u0, f0), seed + 4949, true);
      d.libAt = { c: cl, f: f0, u: u0 };
      mk(49, "library", 6, 8, 5, cl, f0, u0, cl - 1, cl - 1, { seg: "lib" });
      mk(50, "library", 30, 40, 13, cl, f0 + 9, u0, cl - 1, cl - 1, { seg: "lib" });
      const exit = Library.LIBRARY_EXIT;
      prev = mk(51, "library", 4, 6, 4, cl, f0 + 50, u0 + exit.u, cl - 1, cl + exit.r, { seg: "lib" });
      n = 51;
      lastKind = "library";
      continue;
    }
    // ---- door 100
    if (n === 100) {
      const spec = D100.plan(entryR, f0, u0);
      mk(100, "door100", spec.w, spec.L, spec.H, spec.c, f0, u0, entryR, entryR, { spec, gateIn: true });
      break;
    }
    // ---- everything else
    /** @type {string} */
    let kind;
    if (n === 52) kind = "shop";
    else if (n === 80) kind = "infirmary";
    else if (n === 89) kind = "courtyard";
    else if (n >= 90) kind = "greenhouse";
    else kind = pickKind(rng, lastKind);
    lastKind = kind;
    const spec = KINDS[kind] ?? SPECIAL[kind];
    const pickIn = (v) => (Array.isArray(v) ? v[0] + 2 * Math.floor(rng() * ((v[1] - v[0]) / 2 + 1)) : v);
    let w = pickIn(spec.w);
    const L = Array.isArray(spec.L) ? spec.L[0] + Math.floor(rng() * (spec.L[1] - spec.L[0] + 1)) : spec.L;
    const H = spec.H;
    /** @type {any} */
    const extra = {};
    let c;
    let exitX;
    if (kind === "shop" || kind === "infirmary" || kind === "courtyard") {
      c = entryR + 1;
      exitX = kind === "shop" ? -1 + Math.floor(rng() * 3) : -1;
    } else if (kind === "lroom") {
      // the first half lines up with the door in; the second half is off to one side
      const lo = entryR - 1;
      const hi = entryR + 3;
      c = towardMiddle(rng, lo, hi);
      const s = c > 0 ? -6 : c < 0 ? 6 : (rng() < 0.5 ? -6 : 6);
      extra.boxes = [[-4, 3, 0, 7], [s - 4, s + 3, 4, L - 1]];
      extra.turnZ = 5;
      exitX = s - 3 + Math.floor(rng() * 5);
      w = 14;
    } else {
      const lo = entryR + 3 - w / 2;
      const hi = entryR - 1 + w / 2;
      c = towardMiddle(rng, lo, hi);
      exitX = -w / 2 + 1 + Math.floor(rng() * (w - 3));
    }
    const room = mk(n, kind, w, L, H, c, f0, u0, entryR, c + exitX, extra);
    if (n >= 53 && n <= 88 && KINDS[kind]) room.style = "abandoned";
    else room.paper = ["zt:hotel_wallpaper", "zt:hotel_wallpaper", "zt:hotel_wallpaper_green", "zt:hotel_wallpaper_blue"][Math.floor(rng() * 4)];
    if (KINDS[kind] && n >= 4 && rng() < 0.05) room.dark = true;
    room.eyes = { 27: 3, 28: 6, 57: 3, 58: 6 }[n] ?? 0;
    room.gateIn = n >= 89;
    room.gateOut = n >= 88;
    // a locked way out now and then (its key is in the room)
    const next = n + 1;
    const lockable = (KINDS[kind] || kind === "infirmary") && ![29, 49, 59, 89].includes(next) && next < 89;
    if (lockable && !prev.locked && rng() < 0.2) room.locked = true;
    prev = room;
  }
  d.maxF = rooms[rooms.length - 1].f1;
  return d;
}

/** A centre in [lo, hi], usually the one nearest the hotel's middle line. */
function towardMiddle(rng, lo, hi) {
  if (rng() < 0.6) return Math.max(lo, Math.min(hi, 0));
  return lo + Math.floor(rng() * (hi - lo + 1));
}

// ---------------------------------------------------------------- the ride down
/**
 * Lobby side of things, handed over by doors_lobby.js: the elevator car the players are in.
 * @typedef {{ id: string, dim: any, hotel: Frame, home: { loc: Vector3, yaw: number },
 *   inCar: (loc: Vector3) => boolean, carDoor: (open: boolean) => void }} Ride
 */

/**
 * The elevator's doors shut: the run begins. Its first rooms are built while it goes down.
 * @param {Ride} ride @param {Player[]} players
 */
export function startRide(ride, players) {
  const seed = Math.floor(Math.random() * 1e9);
  const d = planFloor(ride.hotel, seed);
  Object.assign(d, {
    phase: "ride", ride, rideAt: system.currentTick, buildBusy: false, skipped: 0, frontier: 0, lead: 0, rear: 0,
    gold: new Map(), drawers: new Map(), keys: new Map(), spots: new Map(), hideBan: new Map(), opened: new Set([0]),
    lastRush: 0, rush: undefined, screech: new Map(), darkSince: new Map(), herb: new Set(), shopIds: new Set(),
    lockedAt: 0, warned: new Map(), seg: "", lobbyCar: ride.inCar, titles: new Set(), skippedTold: false,
  });
  const run = Doors.newRun("floor1", players[0], ride.hotel, [-90, -10, -12, 90, 48, d.maxF + 30], d);
  run.start = { loc: ride.home.loc, rot: { x: 0, y: ride.home.yaw } };
  d.finish = () => finish(run);
  for (const p of players) {
    Doors.join(run, p);
    Doors.lockInput(p, true);
    Doors.title(p, "§6The Hotel", "§7Going down...", 60);
    try {
      p.playMusic("zt.music.elevator", { loop: true, fade: 0.5, volume: 0.9 });
      p.runCommand("camerashake add @s 0.06 15 rotational");
    } catch {
      /* ignore */
    }
  }
  Doors.sound(ride.dim, "zt.elevator.close", players[0].location, 1.0, 1.0);
  return run;
}

/** @param {Run} run @param {FloorData} d */
function rideTick(run, d, now) {
  if (!d.buildBusy) {
    if (!d.rooms[0].built) buildRoom(run, d, 0);
    else if (!d.rooms[1].built) buildRoom(run, d, 1);
  }
  const t = now - d.rideAt;
  if (t % 80 === 40) for (const p of Doors.livePlayers(run)) Doors.sound(run.dim, "zt.elevator.hum", p.location, 0.6, 1.0);
  if (t >= RIDE_TICKS && d.rooms[0].built && d.rooms[1].built) arrive(run, d, now);
  else if (t >= RIDE_TICKS && t % 60 === 0) {
    for (const p of Doors.livePlayers(run)) Doors.actionbar(p, "§7The elevator is still going down...");
  }
}

/** The doors open on the reception. @param {Run} run @param {FloorData} d */
function arrive(run, d, now) {
  const fr = run.frame;
  d.phase = "live";
  run.phase = "live";
  d.arrivedAt = now;
  const spots = [[-1.5, -3.5], [0.5, -3.5], [-1.5, -4.5], [0.5, -4.5], [-0.5, -2.5], [-0.5, -4.6]];
  Doors.livePlayers(run).forEach((p, i) => {
    Doors.fade(p, 0.2, 0.4, 0.6);
    const [r, f] = spots[i % spots.length];
    try {
      p.teleport(fr.at(r, 0, f), { dimension: run.dim, rotation: { x: 0, y: fr.yawOf("f") } });
      p.runCommand("camerashake stop @s");
      p.stopMusic();
    } catch {
      /* ignore */
    }
    Doors.lockInput(p, false);
  });
  d.ride.carDoor(true);
  system.runTimeout(() => {
    if (run.phase === "over") return;
    if (d.carDoor) Doors.openDoor(run, d.carDoor);
    Doors.sound(run.dim, "zt.elevator.ding", fr.at(-0.5, 2, -1), 1.2, 1.0);
    for (const p of Doors.livePlayers(run)) {
      Doors.title(p, "§6Floor 1", "§7The Hotel", 60);
      p.sendMessage("§6The Hotel §7- Floor 1. Doors open as you walk up to them; a locked one needs its key, which is somewhere in its room.");
      p.sendMessage("§7Search drawers for gold and things to help. §eWhen the lights flicker, hide in a closet or under a bed!");
      p.sendMessage("§7Tap a closet or bed to hide; crouch to get out. Look at whatever whispers to you in the dark.");
    }
  }, 14);
}

// ---------------------------------------------------------------- building
/** Is room n built (whoever builds it)? @param {FloorData} d */
export function isBuilt(d, n) {
  const room = d.rooms[n];
  if (!room) return false;
  if (room.seg === "seek1" || room.seg === "seek2") return !!d[room.seg].rooms[room.si].built;
  if (room.seg === "lib") return !!d.lib.built;
  return !!room.built;
}

/** Build room n if it isn't yet (and its area is loaded). @param {Run} run @param {FloorData} d */
function buildRoom(run, d, n) {
  const room = d.rooms[n];
  if (!room || isBuilt(d, n) || room.building) return;
  const fr = run.frame;
  if (room.seg === "seek1" || room.seg === "seek2") {
    const chase = d[room.seg];
    if (chase.buildBusy) return;
    if (!chase.onBuilt) {
      // the corridor's near wall is the room before's far wall: keep its door shut
      const before = d.rooms[n - room.si - 1];
      chase.onBuilt = (i) => {
        if (i === 0 && before?.door) Doors.sealDoor(run, before.door);
      };
      chase.nextBuilt = () => isBuilt(d, n - room.si + chase.rooms.length);
    }
    Seek.buildChaseRoom(run, chase, room.si);
    return;
  }
  if (room.seg === "lib") {
    if (d.lib.building) return;
    if (!isLoaded(d.lib.fr, Library.libraryBounds())) return;
    d.buildBusy = true;
    Library.buildLibrary(run, d.lib, (ok, failed) => {
      d.buildBusy = false;
      d.skipped += failed;
      if (!ok) return;
      const before = d.rooms[48];
      if (before?.door) Doors.sealDoor(run, before.door);
      // door 52, in the far wall of the little room past door 51
      const r51 = d.rooms[51];
      r51.door = Doors.spawnDoor(run, r51.exitR, r51.u0, r51.f1 + 1, 52, { keep: false });
    });
    return;
  }
  if (!isLoaded(fr, roomBox(room))) return;
  room.building = true;
  d.buildBusy = true;
  if (room.kind === "door100") {
    D100.build(run, d, room, (ok, failed) => {
      room.building = false;
      d.buildBusy = false;
      d.skipped += failed;
      if (!ok) return;
      room.built = true;
      sealBefore(run, d, n);
    });
    return;
  }
  const content = roomContent(fr, room, rngFrom(d.seed + n * 7919));
  build(fr, content.plan, (ok, failed) => {
    room.building = false;
    d.buildBusy = false;
    d.skipped += failed;
    if (!ok) return;
    room.built = true;
    sealBefore(run, d, n);
    furnish(run, d, room, content);
  }, () => run.phase === "over");
}

/** The room before's door is in this room's near wall: keep it shut. @param {Run} run @param {FloorData} d */
function sealBefore(run, d, n) {
  const before = d.rooms[n - 1];
  if (!before) return;
  if (before.seg === "seek1" || before.seg === "seek2") {
    const chase = d[before.seg];
    const fin = Seek.finalRoom(chase);
    if (fin?.door) Doors.sealDoor(run, fin.door);
  } else if (before.door) Doors.sealDoor(run, before.door);
}

/**
 * A freshly built room's things: furniture, the key for a locked door, eyes, and its way out.
 * @param {Run} run @param {FloorData} d @param {FloorRoom} room @param {any} content
 */
function furnish(run, d, room, content) {
  const fr = run.frame;
  const rng = rngFrom(d.seed + room.n * 104729);
  room.ents = [];
  room.lamps = content.lamps;
  /** @type {any[]} */
  const fixtures = content.fixtures;
  fixtures.forEach((fx) => {
    let e;
    try {
      e = Doors.spawnFor(run, fx.type, fr.at(fx.at.r, fx.at.u, fx.at.f), { yaw: fr.yawOf(fx.face) });
    } catch {
      return;
    }
    for (const [k, v] of Object.entries(fx.props ?? {})) {
      try {
        e.setProperty(k, v);
      } catch {
        /* ignore */
      }
    }
    fx.id = e.id;
    room.ents.push(e.id);
    if (fx.hide) d.spots.set(e.id, { id: e.id, kind: fx.hide, room: room.n, cells: fx.cells, at: fx.at, face: fx.face, occupant: undefined });
    if (fx.drawers) {
      d.drawers.set(e.id, { room: room.n, n: fx.drawers, open: 0, loot: rollLoot(rng, fx.drawers, fx.tag === "rich"),
        style: fx.type === "zt:cabinet" ? 3 : fx.props?.["zt:style"] ?? 0, face: fx.face, at: fx.at, key: 0, keyIn: -1,
        rich: fx.tag === "rich" });
    }
    if (fx.type === "zt:herb_plant") d.herbId = e.id;
    if (fx.type === "zt:jeff" || fx.type === "zt:el_goblino" || fx.type === "zt:shop_display") d.shopIds.add(e.id);
  });
  // the way out
  if (room.n < 100) {
    room.door = Doors.spawnDoor(run, room.exitR, room.u0, room.f1 + 1, room.n + 1,
      { type: room.gateOut ? "zt:gate_door" : "zt:hotel_door", locked: room.locked, keep: false });
  }
  // its key, somewhere in the room
  if (room.locked) {
    if (room.kind === "reception" && content.receptionKey) {
      const k = content.receptionKey;
      const e = Doors.spawnFor(run, "zt:room_key", fr.at(k.r, k.u, k.f), { yaw: fr.yawOf("l") });
      e.setProperty("zt:style", 2);
      d.keys.set(e.id, room.n + 1);
      room.ents.push(e.id);
    } else placeKey(run, d, room, content, rng);
  }
  // the reception: the elevator you came down in
  if (room.kind === "reception") {
    d.carDoor = Doors.spawnDoor(run, -1, 0, -1, null, { type: "zt:elevator_door", keep: false });
  }
  // Seek's eyes, watching from the walls
  for (let k = 0; k < room.eyes; k++) {
    const b = room.boxes[0];
    const side = rng() < 0.5;
    const f = room.f0 + 1 + rng() * (room.L - 2);
    const u = room.u0 + 0.7 + rng() * 2.4;
    const r = side ? room.c + b[0] + 0.04 : room.c + b[1] + 1 - 0.04;
    try {
      const e = Doors.spawnFor(run, "zt:seek_eye", fr.at(r, u, f), { yaw: fr.yawOf(side ? "r" : "l") });
      e.setProperty("zt:size", Math.round((0.6 + rng() * 0.8) * 100) / 100);
      e.setProperty("zt:pair", rng() < 0.3);
      room.ents.push(e.id);
    } catch {
      /* ignore */
    }
  }
  // the infirmary's side room, behind a skull lock
  if (content.side) {
    const s = content.side;
    const sfr = turned(fr, s.frame, s.door[0], s.door[2]);
    d.sideDoor = Doors.spawnDoor(run, 0, s.door[1], 0, null, { frame: sfr, locked: true, skull: true, plate: false, keep: false });
  }
}

/** What's in a dresser's drawers. */
function rollLoot(rng, n, rich) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (rich) {
      out.push({ gold: 40 + Math.floor(rng() * 41) });
      continue;
    }
    const x = rng();
    if (x < 0.01) out.push({ item: "crucifix" });
    else if (x < 0.06) out.push({ item: "flashlight" });
    else if (x < 0.21) out.push({ item: "lighter" });
    else if (x < 0.56) out.push({ gold: rng() < 0.15 ? 25 + Math.floor(rng() * 26) : 5 + Math.floor(rng() * 16) });
    else out.push({});
  }
  return out;
}

/** Hide a locked room's key: in a drawer, on top of something, or on the floor. @param {Run} run @param {FloorData} d */
function placeKey(run, d, room, content, rng) {
  const spots = content.keySpots;
  if (!spots.length) {
    // nowhere to put it: no lock, then
    room.locked = false;
    if (room.door) Doors.unlockDoor(room.door);
    return;
  }
  const drawers = spots.filter((s) => s.on === "drawer");
  const tops = spots.filter((s) => s.on !== "drawer" && s.on !== "floor");
  const floors = spots.filter((s) => s.on === "floor");
  const roll = rng();
  const pool = roll < 0.35 && drawers.length ? drawers : roll < 0.75 && tops.length ? tops : floors.length ? floors : spots;
  const spot = pool[Math.floor(rng() * pool.length)];
  if (spot.on === "drawer") {
    const fx = content.fixtures[spot.fixture];
    const dr = fx?.id ? d.drawers.get(fx.id) : undefined;
    if (dr) {
      dr.key = room.n + 1;
      dr.keyIn = Math.floor(rng() * dr.n);
      return;
    }
  }
  const fr = run.frame;
  const e = Doors.spawnFor(run, "zt:room_key", fr.at(spot.at.r, spot.at.u, spot.at.f), { yaw: Math.floor(rng() * 360) });
  d.keys.set(e.id, room.n + 1);
  room.ents.push(e.id);
}

// ---------------------------------------------------------------- per tick
/** @param {Run} run */
function tick(run, now) {
  /** @type {FloorData} */
  const d = run.data;
  if (d.phase === "ride") {
    rideTick(run, d, now);
    return;
  }
  const fr = run.frame;
  const players = Doors.livePlayers(run);
  const where = players.map((p) => ({ p, l: fr.local(p.location), n: 0 }));
  for (const x of where) x.n = Math.max(0, roomIndexAt(d, x.l));
  d.where = where;
  if (where.length) {
    d.lead = where.reduce((m, x) => Math.max(m, x.n), 0);
    d.rear = where.reduce((m, x) => Math.min(m, x.n), 100);
  }
  // keep building ahead of the leader
  if (!d.buildBusy) {
    const ahead = d.lead >= 46 && d.lead <= 48 ? 49 : Math.min(100, d.lead + AHEAD);
    for (let n = 0; n <= ahead; n++) {
      if (!isBuilt(d, n)) {
        buildRoom(run, d, n);
        break;
      }
    }
  }
  segments(run, d, now, where);
  floorDoors(run, d, now, where);
  if (!d.seg) {
    Mobs.rushTick(run, d, now);
    Mobs.screechTick(run, d, now);
    if (now % 40 === 0) pullLaggards(run, d, where);
  }
  hidingTick(run, d, now);
  Items.itemsTick(run, d, now);
  if (now % 40 === 20) clearMobs(run, d, players);
  if (now % 100 === 50) clearBehind(run, d);
  roomTitles(run, d, where);
  if (d.skipped && !d.skippedTold && players.length) {
    d.skippedTold = true;
    players[0].sendMessage(`§7(${d.skipped} decoration${d.skipped === 1 ? "" : "s"} couldn't be placed in this version of Minecraft.)`);
  }
}

/** The Seek chases, the Library and door 100 run themselves while players are in them. @param {Run} run @param {FloorData} d */
function segments(run, d, now, where) {
  d.seg = "";
  for (const key of ["seek1", "seek2"]) {
    const chase = d[key];
    const first = d.rooms.findIndex((r) => r.seg === key);
    if (chase.phase === "escaped") {
      if (!chase.cleaned) {
        chase.cleaned = true;
        Seek.chaseEnd(run, chase);
      }
      continue;
    }
    if (d.lead >= first - 1 && isBuilt(d, first)) {
      if (chase.phase === "building") chase.phase = "ready";
      Seek.chaseTick(run, chase, now);
      if (chase.phase !== "ready" || d.lead >= first) d.seg = key;
    }
  }
  const lib = d.lib;
  if (lib.built && lib.phase !== "escaped" && d.lead >= 48) {
    Library.libraryTick(run, lib, now, Doors.livePlayers(run));
    if (lib.phase !== "ready" || d.lead >= 49) d.seg = "lib";
  } else if (lib.phase === "escaped" && !lib.cleaned) {
    lib.cleaned = true;
    Library.libraryEnd(lib);
  }
  if (d.lead >= 100 && isBuilt(d, 100)) {
    d.seg = "d100";
    D100.tick(run, d, now, where);
  }
}

/**
 * The hotel's own doors: they open as you walk up (if the room behind is built), and a locked
 * one tells you so.
 * @param {Run} run @param {FloorData} d
 */
function floorDoors(run, d, now, where) {
  for (let n = Math.max(0, d.lead - 1); n <= Math.min(99, d.lead + 1); n++) {
    const room = d.rooms[n];
    const door = room?.door;
    if (!door || door.open) continue;
    const foot = Doors.doorFoot(run, door);
    for (const x of where) {
      const dist = len(sub(x.p.location, foot));
      if (door.locked) {
        if (dist <= 1.9 && now >= (d.warned.get(x.p.id) ?? 0)) {
          d.warned.set(x.p.id, now + 40);
          Doors.sound(run.dim, "zt.doors.locked", foot, 0.8, 1.0);
          Doors.actionbar(x.p, door.skull ? "§7A skull lock. Only a skeleton key opens it." : "§7It's locked. §eThe key is somewhere in this room.");
        }
        continue;
      }
      if (dist <= 2.6 && isBuilt(d, n + 1)) {
        Doors.openDoor(run, door);
        onDoorOpened(run, d, n + 1, now);
        break;
      }
    }
  }
  // the infirmary's side room, once unlocked, opens like any other door
  if (d.sideDoor && !d.sideDoor.locked && !d.sideDoor.open) {
    const foot = Doors.doorCenter(run, d.sideDoor);
    if (where.some((x) => len(sub(x.p.location, { ...foot, y: foot.y - 1.5 })) <= 2.6)) Doors.openDoor(run, d.sideDoor);
  }
}

/** Someone opened door n and is going into room n. @param {Run} run @param {FloorData} d */
function onDoorOpened(run, d, n, now) {
  d.opened.add(n);
  d.frontier = Math.max(d.frontier, n);
  const room = d.rooms[n];
  if (isOrdinary(room) && n >= 4) Mobs.maybeRush(run, d, n, now);
}

/** Special rooms say what they are when you first walk in. @param {Run} run @param {FloorData} d */
function roomTitles(run, d, where) {
  const names = { 52: ["§9Jeff Shop", "§7Spend your gold"], 80: ["§fThe Infirmary", ""], 89: ["§aThe Courtyard", ""],
    90: ["§2The Greenhouse", "§7It's dark in here..."], 100: ["§7Door 100", "§8The Electrical Room"] };
  for (const x of where) {
    const t = names[x.n];
    if (!t || d.titles.has(x.n)) continue;
    const room = d.rooms[x.n];
    if (x.l.f < room.f0 + 1) continue;
    d.titles.add(x.n);
    for (const p of Doors.livePlayers(run)) Doors.title(p, t[0], t[1], 50);
  }
}

/** Anyone more than three rooms behind is brought up. @param {Run} run @param {FloorData} d */
function pullLaggards(run, d, where) {
  for (const x of where) {
    if (x.n >= d.lead - 3 || Doors.isHidden(x.p)) continue;
    const room = d.rooms[d.lead];
    if (!room || room.seg) continue;
    const [a] = walkPoints(room, 0);
    try {
      Doors.fade(x.p, 0.1, 0.3, 0.5);
      x.p.teleport(run.frame.at(a.r, room.u0, room.f0 + 0.5), { rotation: { x: 0, y: run.frame.yawOf("f") } });
      x.p.sendMessage("§7You fell too far behind: the hotel brought you along.");
    } catch {
      /* ignore */
    }
  }
}

/** Monsters of the world don't get to wander the hotel's dark rooms. @param {Run} run @param {FloorData} d */
function clearMobs(run, d, players) {
  const seen = new Set();
  for (const p of players) {
    let list = [];
    try {
      list = run.dim.getEntities({ location: p.location, maxDistance: 40, families: ["monster"] });
    } catch {
      continue;
    }
    for (const e of list) {
      if (seen.has(e.id) || !e.typeId.startsWith("minecraft:")) continue;
      seen.add(e.id);
      if (inside(run, e.location)) {
        try {
          e.remove();
        } catch {
          /* ignore */
        }
      }
    }
  }
}

/** Rooms far behind everyone lose their furniture (doors and blocks stay). @param {Run} run @param {FloorData} d */
function clearBehind(run, d) {
  for (let n = 0; n < d.rear - 4; n++) {
    const room = d.rooms[n];
    if (!room?.ents?.length) continue;
    for (const id of room.ents) {
      const e = world.getEntity(id);
      if (isValid(e)) e.remove();
      d.spots.delete(id);
      d.drawers.delete(id);
    }
    room.ents = [];
  }
}

// ---------------------------------------------------------------- hiding
/** Into a closet or under a bed. @param {Run} run @param {FloorData} d @param {Player} p */
function hide(run, d, p, spot) {
  const now = system.currentTick;
  if (Doors.isHidden(p)) return;
  if (spot.occupant) {
    Doors.actionbar(p, "§7Someone is already hiding there.");
    return;
  }
  if (now < (d.hideBan.get(p.id) ?? 0)) {
    Doors.actionbar(p, "§4Hide won't let you hide again yet...");
    return;
  }
  const fr = run.frame;
  spot.occupant = p.id;
  Doors.hiding.set(p.id, { kind: spot.kind, since: now, spot, paused: 0, warned: false, released: false });
  const e = world.getEntity(spot.id);
  if (spot.kind === "closet") {
    // the closet's collider steps aside while you're in it
    for (const c of spot.cells) setCell(run, c, "minecraft:air");
    try {
      p.teleport(fr.at(spot.at.r, spot.at.u, spot.at.f), { rotation: { x: 0, y: fr.yawOf(spot.face) } });
    } catch {
      /* ignore */
    }
    if (isValid(e)) {
      e.setProperty("zt:open", true);
      system.runTimeout(() => isValid(e) && e.setProperty("zt:open", false), 8);
    }
    Doors.sound(run.dim, "zt.closet.enter", fr.at(spot.at.r, spot.at.u + 1, spot.at.f), 1.0, 1.0);
  } else {
    // under the bed: you can't be seen; you see out from under it
    try {
      p.addEffect("invisibility", 20 * 600, { amplifier: 0, showParticles: false });
      p.teleport(fr.at(spot.at.r, spot.at.u + 0.6, spot.at.f), { rotation: { x: 0, y: fr.yawOf(spot.face) } });
    } catch {
      /* ignore */
    }
    const out = fr.vec(spot.face);
    const eye = fr.at(spot.at.r, spot.at.u + 0.28, spot.at.f);
    const cam = { x: eye.x + out.x * 0.9, y: eye.y, z: eye.z + out.z * 0.9 };
    Doors.camera(p, cam, { x: cam.x + out.x * 4, y: cam.y + 0.15, z: cam.z + out.z * 4 });
    Doors.sound(run.dim, "zt.bed.enter", eye, 1.0, 1.0);
  }
  Doors.lockInput(p, true, true);
  Doors.actionbar(p, "§7Hiding. §fCrouch to get out.");
}

/** Out of hiding (or thrown out by Hide). @param {Run} run @param {FloorData} d @param {Player} p */
function unhide(run, d, p, kicked = false) {
  const h = Doors.hiding.get(p.id);
  if (!h) return;
  Doors.hiding.delete(p.id);
  const spot = h.spot;
  spot.occupant = undefined;
  const fr = run.frame;
  const out = fr.vec(spot.face);
  const reach = spot.kind === "closet" ? 1.0 : 2.1;
  const at = fr.at(spot.at.r, spot.at.u, spot.at.f);
  const front = { x: at.x + out.x * reach, y: at.y, z: at.z + out.z * reach };
  if (isValid(p)) {
    try {
      p.teleport(front, { rotation: { x: 0, y: fr.yawOf(spot.face) } });
      if (spot.kind === "bed") p.removeEffect("invisibility");
    } catch {
      /* ignore */
    }
    Doors.cameraClear(p);
    Doors.lockInput(p, false);
  }
  if (spot.kind === "closet") {
    for (const c of spot.cells) setCell(run, c, "zt:collider");
    const e = world.getEntity(spot.id);
    if (isValid(e)) {
      e.setProperty("zt:open", true);
      system.runTimeout(() => isValid(e) && e.setProperty("zt:open", false), 10);
    }
    Doors.sound(run.dim, "zt.closet.exit", at, 1.0, 1.0);
  }
  if (kicked && isValid(p)) {
    d.hideBan.set(p.id, system.currentTick + 200);
    Doors.title(p, "§4GET OUT", "", 20);
    Doors.sound(run.dim, "zt.hide.kick", front, 1.5, 1.0);
    try {
      p.applyKnockback({ x: out.x * 0.8, z: out.z * 0.8 }, 0.25);
    } catch {
      /* ignore */
    }
    Doors.hurt(p, HIDE_DAMAGE, "hide");
    p.sendMessage("§4Hide §7threw you out of your hiding spot. Don't stay hidden so long.");
  }
}

/** @param {Run} run */
function setCell(run, c, block) {
  try {
    const p = perm(block);
    if (p) run.dim.setBlockPermutation(run.frame.cell(c[0], c[1], c[2]), p);
  } catch {
    /* unloaded */
  }
}

/**
 * Crouch to get out; and Hide: ten seconds hidden (not counting while Rush goes by) and its
 * eyes fill your view, five more and it throws you out.
 * @param {Run} run @param {FloorData} d
 */
function hidingTick(run, d, now) {
  for (const [id, h] of [...Doors.hiding]) {
    if (!run.players.has(id) || !h.spot) continue;
    const p = /** @type {Player} */ (world.getEntity(id));
    if (!isValid(p) || run.players.get(id)?.status !== "in") {
      Doors.hiding.delete(id);
      h.spot.occupant = undefined;
      if (h.spot.kind === "closet") for (const c of h.spot.cells) setCell(run, c, "zt:collider");
      continue;
    }
    // crouch to get out (a fresh crouch: not one you were already holding when you got in)
    if (!p.isSneaking) h.released = true;
    else if (h.released) {
      unhide(run, d, p);
      continue;
    }
    if (d.rush) h.paused++;
    const t = now - h.since - h.paused;
    if (t >= HIDE_KICK) {
      unhide(run, d, p, true);
      continue;
    }
    if (t >= HIDE_WARN) {
      if (!h.warned) {
        h.warned = true;
        Doors.title(p, "§4GET OUT", "", 30);
      }
      if ((t - HIDE_WARN) % 8 === 0) Mobs.hideEyes(p, (t - HIDE_WARN) / (HIDE_KICK - HIDE_WARN));
    }
  }
}

// ---------------------------------------------------------------- drawers, keys, gold
/** @param {FloorData} d @param {Player} p */
export function addGold(d, p, amount) {
  const total = (d.gold.get(p.id) ?? 0) + amount;
  d.gold.set(p.id, total);
  Doors.actionbar(p, "§6+" + amount + " Gold §7(you have " + total + ")");
  Doors.sound(p.dimension, "zt.gold.pickup", p.location, 1.0, 0.9 + Math.random() * 0.2);
}

/** Which drawer the player is reaching for: by where they look on its front. @param {Run} run @param {Player} p */
function aimedDrawer(run, dr, p, e) {
  const fr = run.frame;
  const counts = { 0: 3, 1: 1, 2: 2, 3: 3 };
  const n = counts[dr.style] ?? dr.n;
  if (n <= 1) return 0;
  let y = 0.5;
  try {
    const head = p.getHeadLocation();
    const dir = p.getViewDirection();
    const out = fr.vec(dr.face);
    const front = { x: e.location.x + out.x * 0.5, z: e.location.z + out.z * 0.5 };
    const denom = dir.x * out.x + dir.z * out.z;
    if (Math.abs(denom) > 1e-3) {
      const t = ((front.x - head.x) * out.x + (front.z - head.z) * out.z) / denom;
      y = head.y + dir.y * t - e.location.y;
    }
  } catch {
    /* ignore */
  }
  const bands = { 0: [0.66, 0.36], 2: [0.5], 3: [1.35, 0.75] }[dr.style] ?? [0.66, 0.36];
  for (let i = 0; i < bands.length; i++) if (y >= bands[i]) return i;
  return bands.length;
}

/** @param {Run} run @param {FloorData} d @param {Player} p @param {Entity} e */
function searchDrawer(run, d, p, e) {
  const dr = d.drawers.get(e.id);
  if (!dr) return;
  let i = aimedDrawer(run, dr, p, e);
  if (dr.open & (1 << i)) {
    i = -1;
    for (let k = 0; k < dr.n; k++) {
      if (!(dr.open & (1 << k))) {
        i = k;
        break;
      }
    }
  }
  if (i < 0) {
    Doors.actionbar(p, "§7Nothing left in here.");
    return;
  }
  dr.open |= 1 << i;
  try {
    e.setProperty("zt:drawers", dr.open);
  } catch {
    /* ignore */
  }
  Doors.sound(run.dim, "zt.drawer.open", e.location, 1.0, 0.9 + Math.random() * 0.2);
  if (dr.key && dr.keyIn === i) {
    giveKey(run, d, p, dr.key);
    dr.key = 0;
    return;
  }
  const loot = dr.loot[i] ?? {};
  if (loot.gold) addGold(d, p, loot.gold);
  else if (loot.item) {
    if (!Items.give(p, /** @type {any} */ (loot.item))) addGold(d, p, 15);
  } else Doors.actionbar(p, "§7Empty.");
}

/** @param {Run} run @param {FloorData} d @param {Player} p */
function giveKey(run, d, p, number) {
  Doors.giveRunItem(p, "zt:room_key", "§eRoom Key §7(" + String(number).padStart(4, "0") + ")", ["§7Opens door " + number + "."]);
  Doors.sound(run.dim, "zt.key.pickup", p.location, 1.0, 1.0);
  Doors.title(p, "§eRoom Key", "§7for door " + String(number).padStart(4, "0"), 40);
  for (const q of Doors.livePlayers(run)) if (q.id !== p.id) q.sendMessage("§7" + p.name + " found the key to door " + number + ".");
}

/**
 * A locked door: a room key or a skeleton key opens it (a skull lock only takes a skeleton
 * key; the High Voltage room, its own key).
 * @param {Run} run @param {FloorData} d @param {Player} p @param {any} door
 */
function tryDoor(run, d, p, door) {
  if (!door.locked) return;
  const foot = Doors.doorCenter(run, door);
  let how = "";
  if (door.type === "zt:metal_door") {
    if (Doors.takeItem(p, "zt:electrical_key")) how = "key";
  } else if (!door.skull && Doors.takeItem(p, "zt:room_key")) how = "key";
  if (!how && Items.useSkeletonKey(p)) how = "skeleton";
  if (!how) {
    Doors.sound(run.dim, "zt.doors.locked", foot, 1.0, 1.0);
    const msg = door.type === "zt:metal_door" ? "§7Locked. §8WARNING: HIGH VOLTAGE. §7It needs a key."
      : door.skull ? "§7A skull lock. Only a §eskeleton key §7opens it." : "§7It's locked. §eFind the key in this room.";
    Doors.actionbar(p, msg);
    return;
  }
  Doors.unlockDoor(door);
  Doors.sound(run.dim, "zt.doors.unlock", foot, 1.4, 1.0);
  Doors.actionbar(p, how === "skeleton" ? "§bThe skeleton key turns..." : "§aUnlocked.");
  if (door.type === "zt:metal_door") D100.onUnlocked(run, d, door);
}

// ---------------------------------------------------------------- Jeff's shop
const SHOP = [
  ["lighter", "Lighter", "textures/items/zt_lighter", "Light that follows you. Lasts a minute."],
  ["flashlight", "Flashlight", "textures/items/zt_flashlight", "Lights up what's in front of you. Two minutes."],
  ["skeleton_key", "Skeleton Key", "textures/items/zt_skeleton_key", "Opens any lock. Two uses."],
  ["crucifix", "Crucifix", "textures/items/zt_crucifix", "Hold it up when something comes for you."],
];

/** @param {Run} run @param {FloorData} d @param {Player} p */
function openShop(run, d, p) {
  const gold = d.gold.get(p.id) ?? 0;
  const lines = ["Welcome to Jeff's shop!", "Jeff doesn't talk much.", "Everything's for sale. Well, almost everything.",
    "Gold only, please."];
  const form = new ActionFormData()
    .title("Jeff Shop")
    .body("§6Your gold: " + gold + "\n§7El Goblino: \"" + lines[Math.floor(Math.random() * lines.length)] + "\"");
  for (const [k, name, icon, about] of SHOP) form.button(name + "  §6" + PRICES[k] + " Gold\n§8" + about, icon);
  form.button("Leave");
  Doors.sound(run.dim, "zt.shop.bell", p.location, 1.0, 1.0);
  form.show(p).then((res) => {
    if (res.canceled || res.selection === undefined || res.selection >= SHOP.length) return;
    if (run.phase === "over" || Doors.runOf(p) !== run) return;
    const [k, name] = SHOP[res.selection];
    const price = PRICES[k];
    const have = d.gold.get(p.id) ?? 0;
    if (have < price) {
      Doors.sound(run.dim, "zt.goblino.laugh", p.location, 1.0, 1.0);
      p.sendMessage("§7El Goblino: \"You need §6" + price + " Gold§7 for that. You have §6" + have + "§7.\"");
      return;
    }
    if (!Items.give(p, /** @type {any} */ (k), true)) {
      p.sendMessage("§7You already have one of those.");
      return;
    }
    d.gold.set(p.id, have - price);
    Doors.sound(run.dim, "zt.shop.buy", p.location, 1.0, 1.0);
    p.sendMessage("§7You bought a §e" + name + "§7. §6" + (have - price) + " Gold §7left.");
  }).catch(() => {
    /* busy */
  });
}

// ---------------------------------------------------------------- interactions
/** A player tapped something; true if it was the hotel's. @param {Player} p @param {Entity} target */
export function onInteract(p, target) {
  const run = Doors.runOf(p);
  if (!run || run.kind !== "floor1") return false;
  /** @type {FloorData} */
  const d = run.data;
  const t = target.typeId;
  if (t === "zt:wardrobe" || t === "zt:hotel_bed") {
    const spot = d.spots.get(target.id);
    if (!spot) return true;
    if (Doors.isHidden(p)) {
      if (spot.occupant === p.id) unhide(run, d, p);
    } else hide(run, d, p, spot);
    return true;
  }
  if (Doors.isHidden(p)) return true;
  if (t === "zt:dresser" || t === "zt:cabinet") {
    searchDrawer(run, d, p, target);
    return true;
  }
  if (t === "zt:room_key" && d.keys.has(target.id)) {
    const n = d.keys.get(target.id);
    d.keys.delete(target.id);
    target.remove();
    giveKey(run, d, p, n);
    return true;
  }
  if (t === "zt:hotel_door" || t === "zt:gate_door" || t === "zt:metal_door") {
    const door = run.doors.find((x) => x.id === target.id);
    if (door) tryDoor(run, d, p, door);
    return true;
  }
  if (d.shopIds.has(target.id)) {
    openShop(run, d, p);
    return true;
  }
  if (t === "zt:bob") {
    p.sendMessage("§7Bob: §8...");
    Doors.sound(run.dim, "zt.bob.rattle", target.location, 0.8, 1.0);
    return true;
  }
  if (t === "zt:herb_plant" && target.id === d.herbId) {
    d.herbId = undefined;
    target.remove();
    Items.give(p, "herb");
    return true;
  }
  return D100.onInteract(run, d, p, target);
}

/** Using one of the hotel's items. @param {Player} p */
export function onItemUse(p, typeId) {
  const run = Doors.runOf(p);
  const d = run?.kind === "floor1" ? run.data : undefined;
  Items.onUse(p, typeId, run, d);
}

// ---------------------------------------------------------------- the run's end, deaths
/** Inside the hotel (or, on the way down, in the elevator)? @param {Run} run @param {Vector3} loc */
function inside(run, loc) {
  /** @type {FloorData} */
  const d = run.data;
  if (d.phase === "ride") return d.lobbyCar(loc);
  const l = run.frame.local(loc);
  return l.f >= -9 && l.f <= d.maxF + 12 && Math.abs(l.r) <= 90 && l.u >= -12 && l.u <= 48;
}

/**
 * Keys and switches a player was carrying when they died fall where they died, for whoever is
 * left to pick up.
 * @param {Run} run @param {FloorData} d @param {Player} p
 */
function dropKeys(run, d, p) {
  const at = { x: p.location.x, y: p.location.y + 0.05, z: p.location.z };
  const keys = Doors.countItem(p, "zt:room_key");
  if (keys) {
    Doors.takeItem(p, "zt:room_key", keys);
    const n = d.rooms.findIndex((r, i) => i >= Math.max(0, d.rear - 1) && r.door?.locked && !r.door.skull);
    if (n >= 0) {
      const e = Doors.spawnFor(run, "zt:room_key", at, { yaw: Math.random() * 360 });
      d.keys.set(e.id, n + 1);
    }
  }
  D100.dropped(run, d, p, at);
}

/** @param {Run} run @param {Player} p */
function death(run, p) {
  /** @type {FloorData} */
  const d = run.data;
  if (Doors.livePlayers(run).length) dropKeys(run, d, p);
  Doors.setHome(p, run.dim, d.ride.home.loc, d.ride.home.yaw);
  Items.forget(p.id);
  for (const q of Doors.livePlayers(run)) q.sendMessage("§7" + p.name + " died.");
  try {
    p.stopMusic();
  } catch {
    /* ignore */
  }
}

/** @param {Run} run */
function end(run, why) {
  /** @type {FloorData} */
  const d = run.data;
  for (const [id, h] of [...Doors.hiding]) {
    if (!run.players.has(id)) continue;
    const p = world.getEntity(id);
    if (isValid(p)) unhide(run, d, /** @type {Player} */ (p));
    else {
      Doors.hiding.delete(id);
      if (h.spot) h.spot.occupant = undefined;
    }
  }
  Mobs.endAll(run, d);
  for (const [id] of run.players) {
    Items.forget(id);
    const p = world.getEntity(id);
    if (isValid(p)) {
      try {
        /** @type {Player} */ (p).stopMusic();
        p.removeEffect("speed");
        p.removeEffect("regeneration");
      } catch {
        /* ignore */
      }
    }
  }
  for (const key of ["seek1", "seek2"]) if (d[key]) Seek.chaseEnd(run, d[key]);
  if (d.lib) Library.libraryEnd(d.lib);
  D100.end(run, d);
  if (d.phase === "ride") d.ride.carDoor(true);
  void why;
}

Doors.registerKind("floor1", { tick, end, death, inside });

/** The run a lobby's elevator started, if it's still going. */
export function runOfRide(rideId) {
  for (const run of Doors.runs.values()) if (run.kind === "floor1" && run.data.ride?.id === rideId) return run;
  return undefined;
}

/** Floor 1 is over: back to the Lobby, everyone who made it. @param {Run} run */
export function finish(run) {
  for (const p of Doors.livePlayers(run)) Doors.sendHome(run, p);
  system.runTimeout(() => Doors.endRun(run, "escaped"), 12);
}
