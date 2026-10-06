// The Lobby (DOORS). The "Spawn The Lobby+Floor 1" item builds it in front of you: a grand
// hall with four elevators down each side, couches, plants and chandeliers. Step into an
// elevator and pick a floor; its doors shut and it goes down for fifteen seconds (with music)
// to the Hotel's reception, room 0, where Floor 1 begins (doors_floor1.js). The hotel is built
// straight on from the far end of the lobby as you play. A lobby stays where it was built, and
// its elevators keep working after the world is closed and opened again.
import { system, world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { build, candles, fitsHeight, Frame, isLoaded, joined, lantern, pillar, Plan, shifted, slab, stairs, turned } from "./doors_build.js";
import * as Doors from "./doors_common.js";
import * as Floor from "./doors_floor1.js";
import { confirm } from "./doors_library.js";
import { isValid } from "./util.js";

/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

export const ITEM = Floor.ITEM;
const KEY = "zt:lobbies";
const MAX_LOBBIES = 6;
// the hall, in its frame's cells (r across, u up, f forward from its entrance)
const HALL = { r0: -11, r1: 10, f0: 0, f1: 35, u1: 7 };
const CAR_F = [4, 12, 20, 28];   // each elevator car's first row, down both sides
const CAR_DEPTH = 4;
export const BOUNDS = [-18, -1, -1, 17, 9, 37];
// the hotel starts beyond the lobby's far wall: the reception's elevator car backs onto it
const HOTEL_AT = 44;

const B = {
  air: "minecraft:air",
  floor: "zt:hotel_floor",
  ceiling: "zt:hotel_ceiling",
  paper: "zt:hotel_wallpaper_green",
  wainscot: "zt:hotel_wainscot",
  trim: "zt:hotel_trim",
  panel: "zt:elevator_panel",
  planks: "minecraft:dark_oak_planks",
  slab: "minecraft:dark_oak_slab",
  log: "minecraft:stripped_dark_oak_log",
  carpet: "minecraft:red_carpet",
  lamp: "zt:ceiling_lamp",
  sconce: "zt:wall_lamp",
};

/**
 * @typedef {{ i: number, side: "l" | "r", f: number, box: number[], door?: any, state: string, asked: Set<string>,
 *   closeAt: number, run?: any }} Car
 * @typedef {{ id: string, dim: any, fr: Frame, hotel: Frame, cars: Car[], pseudo: any, ready: boolean, refreshed: boolean,
 *   home: { loc: Vector3, yaw: number } }} Lobby
 */
/** @type {Map<string, Lobby>} */
const lobbies = new Map();

Doors.keepTagged((tag) => lobbies.has(tag));

// ---------------------------------------------------------------- the item
/** @param {Player} p */
export function onUse(p) {
  if (Doors.runOf(p) || Doors.pendingRunOf(p)) {
    p.sendMessage("§7You are already in a level. Finish it first.");
    return;
  }
  const fr = frameFor(p);
  if (!fitsHeight(fr, [BOUNDS[0], -1, BOUNDS[2], BOUNDS[3], 30, BOUNDS[5]])) {
    p.sendMessage("§cThere is no room for the Lobby and the Hotel here (too close to the top or bottom of the world).");
    return;
  }
  confirm(p, "The Lobby + Floor 1",
    "Build the Lobby in front of you?\n\nIt is 36 x 39 blocks (11 high), with four elevators down each side. Ride one down to the Hotel's reception: Floor 1, doors 1 to 100.\n\n" +
    "The Hotel's rooms are built straight on from the far end of the Lobby as you play, up to about 2,500 blocks ahead and 40 to each side. They replace anything in the way.",
    () => buildLobby(p));
}

/** @param {Player} p */
function frameFor(p) {
  const yaw = p.getRotation().y;
  const fr0 = new Frame(p.dimension, { x: 0, y: 0, z: 0 }, yaw);
  const loc = p.location;
  return new Frame(p.dimension, { x: Math.round(loc.x + fr0.F.x * 2.5), y: Math.floor(loc.y + 0.01), z: Math.round(loc.z + fr0.F.z * 2.5) }, yaw);
}

/** @param {Player} p */
function buildLobby(p) {
  const fr = frameFor(p);
  if (!isLoaded(fr, BOUNDS)) {
    p.sendMessage("§cPart of that area isn't loaded. Move closer to an open space and try again.");
    return;
  }
  const id = "lobby:" + system.currentTick + "-" + Math.floor(Math.random() * 1e6);
  const lobby = makeLobby(id, fr);
  p.sendMessage("§7Building the Lobby...");
  build(fr, lobbyPlan(fr), (ok, failed) => {
    if (!ok) {
      p.sendMessage("§cPart of the Lobby's area stopped being loaded while it was being built. Stay close, and use the item again.");
      return;
    }
    lobbies.set(id, lobby);
    save();
    furnish(lobby);
    lobby.ready = true;
    lobby.refreshed = true;
    if (failed) p.sendMessage(`§7(${failed} decoration${failed === 1 ? "" : "s"} couldn't be placed in this version of Minecraft.)`);
    p.sendMessage("§6The Lobby §7is ready. Step into an elevator to go down to the Hotel.");
    Doors.sound(p.dimension, "zt.elevator.ding", p.location, 1.0, 1.0);
  });
}

/** @param {Frame} fr @returns {Lobby} */
function makeLobby(id, fr) {
  /** @type {Car[]} */
  const cars = [];
  CAR_F.forEach((f, k) => {
    for (const side of /** @type {("l" | "r")[]} */ (["l", "r"])) {
      const r0 = side === "l" ? HALL.r0 - 1 - CAR_DEPTH : HALL.r1 + 2;
      cars.push({ i: cars.length, side, f, box: [r0, r0 + CAR_DEPTH - 1, f, f + 3], state: "idle", asked: new Set(), closeAt: 0 });
    }
    void k;
  });
  const home = { loc: fr.at(-0.5 + 0.5, 0, 3.5), yaw: fr.yawOf("f") };
  return {
    id, dim: fr.dim, fr, hotel: shifted(fr, 0, 0, HOTEL_AT), cars, ready: false, refreshed: false, home,
    pseudo: { id, dim: fr.dim, frame: fr, ents: new Set(), doors: [] },
  };
}

// ---------------------------------------------------------------- the building
/** @param {Frame} fr */
function lobbyPlan(fr) {
  const plan = new Plan();
  const { r0, r1, f0, f1, u1 } = HALL;
  // the hall: wainscoting, green damask, a dark ceiling
  plan.box(r0 - 1, -1, f0 - 1, r1 + 1, u1 + 1, f1 + 1, B.wainscot);
  plan.box(r0 - 1, 2, f0 - 1, r1 + 1, u1 - 1, f1 + 1, B.paper);
  plan.box(r0 - 1, u1, f0 - 1, r1 + 1, u1, f1 + 1, B.trim);
  plan.box(r0 - 1, -1, f0 - 1, r1 + 1, -1, f1 + 1, B.floor);
  plan.box(r0 - 1, u1 + 1, f0 - 1, r1 + 1, u1 + 1, f1 + 1, B.ceiling);
  plan.box(r0, 0, f0, r1, u1, f1, B.air);
  // the way in: a wide doorway
  plan.box(-3, 0, f0 - 1, 2, 4, f0 - 1, B.log);
  plan.box(-2, 0, f0 - 1, 1, 3, f0 - 1, B.air);
  // the elevator cars
  for (const f of CAR_F) {
    for (const side of ["l", "r"]) {
      const a = side === "l" ? r0 - 1 - CAR_DEPTH : r1 + 2;
      const b = a + CAR_DEPTH - 1;
      plan.box(a - 1, -1, f - 1, b + 1, 4, f + 4, B.panel);
      plan.box(a, -1, f, b, -1, f + 3, B.planks);
      plan.box(a, 0, f, b, 3, f + 3, B.air);
      plan.set(Math.floor((a + b) / 2), 3, f + 1, { id: B.lamp, states: { "zt:lit": 1 } });
      // its doorway in the hall's wall, brass framed
      const wall = side === "l" ? r0 - 1 : r1 + 1;
      plan.box(wall, 0, f, wall, 3, f + 3, B.panel);
      plan.box(wall, 0, f + 1, wall, 2, f + 2, B.air);
      // a lamp beside each door
      const inner = side === "l" ? r0 : r1;
      plan.set(inner, 3, f - 1, { id: B.sconce, states: { "zt:lit": 1, "minecraft:cardinal_direction": fr.cardinal(side === "l" ? "r" : "l") } });
    }
  }
  // a red carpet down the middle, rugs, couches and low tables, plants by the walls
  plan.box(-2, 0, f0, 1, 0, f1, B.carpet);
  for (const f of [8, 24]) {
    for (const r of [-7, 4]) {
      plan.box(r, 0, f - 1, r + 2, 0, f + 3, "minecraft:brown_carpet");
      plan.box(r + 1, 0, f, r + 1, 0, f + 2, slab(B.slab, false));
      plan.set(r + 1, 1, f + 1, candles(3));
    }
  }
  for (const f of [2, 16, 33]) {
    for (const r of [r0, r1]) {
      plan.set(r, 0, f, { id: "minecraft:decorated_pot", states: { direction: 0 } });
      plan.set(r, 1, f, { id: "minecraft:azalea_leaves_flowered", states: { persistent_bit: true } });
    }
  }
  // pillars along the carpet, a front desk at the far end with a lamp and a bell's candle
  for (const f of [6, 14, 22, 30]) {
    for (const r of [-5, 4]) plan.box(r, 0, f, r, u1, f, pillar(fr, B.log, "u"));
  }
  plan.box(-4, 0, f1 - 2, 3, 0, f1 - 2, B.planks);
  plan.box(-4, 1, f1 - 2, 3, 1, f1 - 2, slab(B.slab, false));
  plan.set(-3, 2, f1 - 2, lantern(false));
  plan.set(2, 2, f1 - 2, candles(2));
  plan.set(-1, 3, f1 + 1, { id: "zt:hotel_painting", states: { "minecraft:cardinal_direction": fr.cardinal("b"), "zt:art": 6 } });
  for (const f of [3, 10, 17, 24, 31]) {
    for (const r of [-8, 7]) plan.set(r, u1, f, { id: B.lamp, states: { "zt:lit": 1 } });
  }
  void joined;
  void stairs;
  return plan;
}

/** The lobby's things: an elevator door per car, chandeliers, couches. @param {Lobby} lobby */
function furnish(lobby) {
  const fr = lobby.fr;
  const run = lobby.pseudo;
  for (const car of lobby.cars) {
    const wall = car.side === "l" ? HALL.r0 - 1 : HALL.r1 + 1;
    const tfr = turned(fr, car.side, wall, car.f + 1);
    car.door = Doors.spawnDoor(run, 0, 0, 0, null, { type: "zt:elevator_door", frame: tfr, keep: true });
    Doors.openDoor(run, car.door, true);
  }
  for (const f of [10, 26]) Doors.spawnFor(run, "zt:chandelier", fr.at(-0.5 + 0.5, HALL.u1 + 1 - 1.75, f + 0.5), { keep: true, yaw: fr.yaw });
  for (const f of [8, 24]) {
    for (const [r, face] of /** @type {[number, string][]} */ ([[-8, "r"], [7, "l"]])) {
      const e = Doors.spawnFor(run, "zt:couch", fr.at(r + 0.5, 0, f + 1.5), { keep: true, yaw: fr.yawOf(face) });
      e.setProperty("zt:style", 0);
    }
  }
}

/** A lobby seen again after the world was reopened: its old things go, fresh ones come. @param {Lobby} lobby */
function refresh(lobby) {
  const fr = lobby.fr;
  const c = fr.at(0, 0, 18);
  let list = [];
  try {
    list = lobby.dim.getEntities({ location: c, maxDistance: 40, families: ["zt_doors_prop"] });
  } catch {
    return false;
  }
  for (const e of list) if (e.getDynamicProperty("zt:run") === lobby.id) e.remove();
  furnish(lobby);
  lobby.refreshed = true;
  return true;
}

// ---------------------------------------------------------------- saving
function save() {
  const list = [...lobbies.values()].map((l) => ({ id: l.id, dim: l.dim.id, o: l.fr.o, yaw: l.fr.yaw }));
  while (list.length > MAX_LOBBIES) {
    const old = list.shift();
    lobbies.delete(old.id);
  }
  try {
    world.setDynamicProperty(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

let loaded = false;
function load() {
  loaded = true;
  try {
    const raw = world.getDynamicProperty(KEY);
    if (typeof raw !== "string") return;
    for (const l of JSON.parse(raw)) {
      if (lobbies.has(l.id)) continue;
      const fr = new Frame(world.getDimension(l.dim), l.o, l.yaw);
      const lobby = makeLobby(l.id, fr);
      lobby.ready = true;
      lobbies.set(l.id, lobby);
    }
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- the elevators
/** @param {Lobby} lobby @param {Car} car @param {Vector3} loc */
function inCar(lobby, car, loc, slack = 0) {
  const l = lobby.fr.local(loc);
  return l.r >= car.box[0] - slack && l.r < car.box[1] + 1 + slack && l.f >= car.box[2] - slack && l.f < car.box[3] + 1 + slack &&
    l.u > -1 && l.u < 4;
}

/** Is this lobby's hotel being played? @param {Lobby} lobby */
function busy(lobby) {
  for (const run of Doors.runs.values()) if (run.kind === "floor1" && run.data.ride?.id?.startsWith(lobby.id + "#")) return run;
  return undefined;
}

/** @param {Lobby} lobby @param {Car} car */
function setCarDoor(lobby, car, open) {
  if (!car.door) return;
  if (open) Doors.openDoor(lobby.pseudo, car.door);
  else Doors.closeDoor(lobby.pseudo, car.door);
}

/** Per tick: who stepped into which elevator. */
export function lobbyTick(now) {
  if (!loaded) load();
  if (now % 5 !== 0) return;
  for (const lobby of lobbies.values()) {
    if (!lobby.ready) continue;
    let near = [];
    try {
      near = lobby.dim.getPlayers({ location: lobby.fr.at(0, 0, 18), maxDistance: 40 });
    } catch {
      continue;
    }
    if (!near.length) continue;
    if (!lobby.refreshed && !refresh(lobby)) continue;
    for (const car of lobby.cars) carTick(lobby, car, near, now);
  }
}

/** @param {Lobby} lobby @param {Car} car @param {Player[]} near */
function carTick(lobby, car, near, now) {
  const inside = near.filter((p) => inCar(lobby, car, p.location));
  if (car.state === "riding") {
    if (!car.run || car.run.phase === "over" || car.run.data.phase !== "ride") {
      car.state = "idle";
      car.run = undefined;
      setCarDoor(lobby, car, true);
    }
    return;
  }
  if (car.state === "closing") {
    if (now < car.closeAt) {
      for (const p of inside) Doors.actionbar(p, "§6The doors are closing...");
      return;
    }
    const riders = inside.filter((p) => !Doors.runOf(p));
    if (!riders.length || busy(lobby)) {
      car.state = "idle";
      setCarDoor(lobby, car, true);
      return;
    }
    car.state = "riding";
    /** @type {import("./doors_floor1.js").Ride} */
    const ride = {
      id: lobby.id + "#" + car.i, dim: lobby.dim, hotel: lobby.hotel, home: lobby.home,
      inCar: (loc) => inCar(lobby, car, loc, 1.5),
      carDoor: (open) => setCarDoor(lobby, car, open),
    };
    car.run = Floor.startRide(ride, riders);
    return;
  }
  // idle: ask whoever steps in where they're going (once each time they step in)
  for (const id of [...car.asked]) if (!inside.some((p) => p.id === id)) car.asked.delete(id);
  for (const p of inside) {
    if (car.asked.has(p.id) || Doors.runOf(p)) continue;
    car.asked.add(p.id);
    choose(lobby, car, p);
  }
}

/** The floor selection. @param {Lobby} lobby @param {Car} car @param {Player} p */
function choose(lobby, car, p) {
  Doors.sound(lobby.dim, "zt.elevator.ding", p.location, 0.8, 1.2);
  const form = new ActionFormData()
    .title("Elevator")
    .body("Where to?\n\n§7Everyone standing in this elevator when its doors shut comes along.")
    .button("§6The Hotel\n§7Floor 1  (doors 0-100)", "textures/items/zt_doors_floor1")
    .button("§8The Mines\n§8Floor 2  (not open yet)")
    .button("Stay in the Lobby");
  form.show(p).then((res) => {
    if (res.canceled || res.selection === undefined) return;
    if (res.selection === 1) {
      p.sendMessage("§7The Mines aren't open yet. Only §6The Hotel§7 for now.");
      return;
    }
    if (res.selection !== 0) return;
    if (car.state !== "idle" || !inCar(lobby, car, p.location, 0.5) || Doors.runOf(p)) return;
    const playing = busy(lobby);
    if (playing) {
      p.sendMessage("§7Someone is already playing this Lobby's Hotel. Wait for their run to end (or build another Lobby).");
      return;
    }
    car.state = "closing";
    car.closeAt = system.currentTick + 50;
    for (const q of lobby.dim.getPlayers({ location: lobby.fr.at(0, 0, 18), maxDistance: 40 })) {
      if (inCar(lobby, car, q.location)) Doors.title(q, "§6The Hotel", "§7Floor 1", 40);
    }
    system.runTimeout(() => {
      if (car.state === "closing") setCarDoor(lobby, car, false);
    }, 40);
  }).catch(() => {
    car.asked.delete(p.id);
  });
}

/** For tests and commands: the lobbies there are. */
export function allLobbies() {
  return [...lobbies.values()];
}

void isValid;
