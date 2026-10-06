// Door 100 (DOORS): the end of Floor 1. Through the last greenhouse gate, a corridor of
// flickering lights leads into a big electrical room: grey halls running around and between
// two great square blocks, with grey shelves and wooden closets, open side rooms full of
// shelves, the locked grey door of the "WARNING: HIGH VOLTAGE" room, and a lever beside a
// wide grey gate.
//
// Pull the lever and the gate slides apart: the Figure comes out of a side hall upstairs,
// down the straight staircase and into the halls, and hunts there (it won't leave them).
// Through the gate and up the stairs is a gated room with grey shelves, wooden crates (a grey
// key on one) and the broken-down elevator, doors open. The key opens the High Voltage room,
// and its breaker box: ten empty slots under a black screen. Find the ten switches (two or
// three upstairs, the rest on the shelves in the Figure's halls) and put them in.
//
// The Figure steps on a sparking live wire; the oil under it goes up in flames; it runs,
// crashes into two walls and out through a window. Then the breaker puzzle: the screen shows
// switch numbers one after another, each with a full square (switch on) or an empty one (off);
// set the switches to match. Three rounds, each faster; in the last, the final number shows
// as "??" (it's the one that wasn't shown). The power comes back... and the Figure slams into
// the door behind you, twice, and bursts through on the third. Run upstairs into the elevator;
// its gate shuts in the Figure's face and down it goes. Ten seconds of elevator music. Look
// up: the Figure lands on the roof, the cable snaps, and the elevator falls... Floor 1 done.
import { system, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { build, joined, lantern, perm, pillar, Plan, slab, stairs } from "./doors_build.js";
import * as Doors from "./doors_common.js";
import { along, measure, setLamp } from "./doors_hotel.js";
import * as Fig from "./figure.js";
import { isValid, len, particle, sub, yawTo } from "./util.js";

/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("./doors_common.js").Run} Run */
/** @typedef {import("./doors_hotel.js").FloorData} FloorData */
/** @typedef {import("./doors_rooms.js").FloorRoom} FloorRoom */

// ---- the layout, in the room's own cells (x across from its centre, z forward from door 100, y up)
const HALLS = { x0: -18, x1: 17, z0: 7, z1: 26, h: 6 };
const SQUARES = [[-14, -3, 11, 22], [2, 13, 11, 22]];
const ALCOVES = [[-24, -20, 15, 20], [19, 23, 15, 20]];
const HV = { x0: -12, x1: -6, z0: 0, z1: 5, door: -10 };
const GATE = { x: -3, z: 27, w: 6, h: 4 };
const LEVER = { x: 4.5, y: 1.4, z: 26.82 };
const UP = { x0: -8, x1: 7, z0: 40, z1: 50, y: 8 };
const SIDE_HALL = { x0: -14, x1: -10, z0: 42, z1: 45 };
const CAR = { x0: -2, x1: 1, z0: 52, z1: 55, y: 8 };
const WINDOW = { x: 18, z: 24 };
const WIRE = { x: 11.5, z: 24.5 };
const BOX = { x: -12, z: 2.5 };
const FALL = { x: -7.2, z: 3.2 };    // where the Figure lands when it bursts into the High Voltage room
const STUMBLE = 60;
export const SWITCHES = 10;
const PRICE_OF_BUMP = 18;

const B = {
  air: "minecraft:air",
  wall: "minecraft:light_gray_concrete",
  dark: "minecraft:gray_concrete",
  floor: "minecraft:polished_andesite",
  grate: "minecraft:smooth_stone",
  stripes: "zt:hazard_stripes",
  shelf: "zt:metal_shelf",
  crate: "zt:wooden_crate",
  panel: "zt:elevator_panel",
  lamp: "zt:ceiling_lamp",
  sconce: "zt:wall_lamp",
  exit: "zt:exit_sign",
  bars: "minecraft:iron_bars",
  shaft: "zt:shaft_wall",
  shaftFast: "zt:shaft_wall_fast",
};

/** How big door 100 is, for the plan of the floor: its centre, and a box around everything. */
export function plan(entryR, f0, u0) {
  void f0;
  void u0;
  return { c: entryR + 1, w: 50, L: 58, H: 21 };
}

// ---------------------------------------------------------------- building
class Local {
  /** @param {FloorRoom} room */
  constructor(fr, room) {
    this.fr = fr;
    this.room = room;
    this.plan = new Plan();
  }

  R(x) {
    return this.room.c + x;
  }

  U(y) {
    return this.room.u0 + y;
  }

  F(z) {
    return this.room.f0 + z;
  }

  at(x, y, z) {
    return this.fr.at(this.R(x), this.U(y), this.F(z));
  }

  box(x0, y0, z0, x1, y1, z1, b) {
    this.plan.box(this.R(x0), this.U(y0), this.F(z0), this.R(x1), this.U(y1), this.F(z1), b);
  }

  set(x, y, z, b) {
    this.box(x, y, z, x, y, z, b);
  }
}

/**
 * The blocks of door 100, and where its things go.
 * @param {FloorRoom} room
 */
function layout(fr, room, rng) {
  const L = new Local(fr, room);
  const lamps = [];
  const lamp = (x, y, z, lit = 1) => {
    const spec = { id: B.lamp, states: { "zt:lit": lit } };
    L.set(x, y, z, spec);
    lamps.push({ cell: [L.R(x), L.U(y), L.F(z)], spec, x, z });
  };
  // ---- the ground floor: one solid block, carved out
  L.box(-25, -1, -1, 24, HALLS.h, GATE.z, B.wall);
  L.box(-25, -1, -1, 24, -1, GATE.z, B.floor);
  // the corridor from door 100, with an EXIT sign over its far end
  L.box(-3, 0, 0, 2, 4, 6, B.air);
  L.box(-3, -1, 0, 2, -1, 6, B.grate);
  L.box(-4, 4, 6, 3, 5, 6, B.dark);
  lamp(-1, 4, 1);
  lamp(-1, 4, 4);
  // the halls, around and between the two squares
  L.box(HALLS.x0, 0, HALLS.z0, HALLS.x1, HALLS.h - 1, HALLS.z1, B.air);
  for (const s of SQUARES) {
    L.box(s[0], 0, s[2], s[1], HALLS.h - 1, s[3], B.wall);
    // a band of darker grey and hazard stripes round the squares' feet
    L.box(s[0], 0, s[2], s[1], 0, s[3], B.dark);
  }
  L.box(HALLS.x0, HALLS.h, HALLS.z0, HALLS.x1, HALLS.h, HALLS.z1, B.dark);
  // open side rooms full of shelves, as wide as the gate
  for (const a of ALCOVES) {
    L.box(a[0], 0, a[2], a[1], 4, a[3], B.air);
    const wallX = a[0] < 0 ? a[1] + 1 : a[0] - 1;
    L.box(wallX, 0, a[2], wallX, 3, a[3], B.air);
    L.box(wallX, 4, a[2], wallX, 4, a[3], B.stripes);
  }
  // the High Voltage room
  L.box(HV.x0, 0, HV.z0, HV.x1, 4, HV.z1, B.air);
  L.box(HV.x0, -1, HV.z0, HV.x1, -1, HV.z1, B.grate);
  L.box(HV.door, 0, 6, HV.door + 1, 2, 6, B.air);
  L.box(HV.door - 1, 3, 6, HV.door + 2, 3, 6, B.stripes);
  lamp(-9, 4, 2);
  // the window the Figure leaves by, and the dark beyond it
  L.box(WINDOW.x, 1, WINDOW.z, WINDOW.x, 3, WINDOW.z + 1, joined(fr, "minecraft:glass_pane", ["f", "b"]));
  L.box(WINDOW.x + 1, 0, WINDOW.z - 1, WINDOW.x + 5, 4, WINDOW.z + 2, B.air);
  L.box(WINDOW.x + 1, -1, WINDOW.z - 1, WINDOW.x + 5, -1, WINDOW.z + 2, "minecraft:black_concrete");
  // the oil puddle by the live wire
  L.box(WIRE.x - 0.5, 0, WIRE.z - 0.5, WIRE.x + 0.5, 0, WIRE.z + 0.5, "minecraft:black_carpet");
  // lights down the halls
  for (let z = HALLS.z0 + 1; z <= HALLS.z1; z += 6) {
    for (const x of [-17, -1, 16]) lamp(x, HALLS.h - 1, z);
  }
  for (const x of [-9, 8]) {
    lamp(x, HALLS.h - 1, 8);
    lamp(x, HALLS.h - 1, 25);
  }
  for (const a of ALCOVES) lamp(Math.floor((a[0] + a[1]) / 2), 4, 17);
  // ---- the gate, the stairs up, and the room upstairs
  L.box(-9, -1, GATE.z, 8, 13, 39, B.wall);
  L.box(-3, 0, 28, 2, 12, 38, B.air);
  L.box(-3, -1, 28, 2, -1, 30, B.grate);
  for (let k = 0; k <= 7; k++) {
    const z = 31 + k;
    if (k > 0) L.box(-3, 0, z, 2, k - 1, z, B.dark);
    L.box(-3, k, z, 2, k, z, stairs(fr, "minecraft:polished_andesite_stairs", "f"));
  }
  L.box(GATE.x, 0, GATE.z, GATE.x + GATE.w - 1, GATE.h - 1, GATE.z, B.air);
  L.box(GATE.x - 1, GATE.h, GATE.z, GATE.x + GATE.w, GATE.h, GATE.z, B.stripes);
  L.set(-1, 5, GATE.z, { id: B.exit, states: { "minecraft:cardinal_direction": fr.cardinal("b") } });
  lamp(-1, 12, 33);
  // upstairs
  L.box(-15, 6, 39, 8, 13, 51, B.wall);
  L.box(UP.x0, UP.y, UP.z0, UP.x1, UP.y + 4, UP.z1, B.air);
  L.box(UP.x0, UP.y - 1, UP.z0, UP.x1, UP.y - 1, UP.z1, B.floor);
  L.box(-3, UP.y, 39, 2, UP.y + 3, 39, B.air);
  L.box(-4, UP.y + 3, 39, 3, UP.y + 3, 39, B.bars);
  L.box(-3, UP.y + 4, 39, 2, UP.y + 4, 39, B.bars);
  L.box(SIDE_HALL.x0, UP.y, SIDE_HALL.z0, SIDE_HALL.x1, UP.y + 3, SIDE_HALL.z1, B.air);
  L.box(-9, UP.y, SIDE_HALL.z0, -9, UP.y + 2, SIDE_HALL.z1, B.air);
  lamp(-3, UP.y + 4, 43);
  lamp(4, UP.y + 4, 47, 0);
  lamp(-12, UP.y + 3, 43, 0);
  // the elevator: a car with a grille in its roof, in a shaft
  L.box(-3, 6, 51, 2, 20, 56, B.panel);
  L.box(CAR.x0, CAR.y, CAR.z0, CAR.x1, CAR.y + 3, CAR.z1, B.air);
  L.box(CAR.x0, CAR.y + 4, CAR.z0, CAR.x1, CAR.y + 4, CAR.z1, B.panel);
  L.box(-1, CAR.y + 4, 53, 0, CAR.y + 4, 54, B.bars);
  L.box(CAR.x0, CAR.y + 5, CAR.z0, CAR.x1, 19, CAR.z1, B.air);
  L.box(CAR.x0, CAR.y, 51, CAR.x1, CAR.y + 2, 51, B.air);
  L.set(-1, CAR.y + 3, 51, { id: B.exit, states: { "minecraft:cardinal_direction": fr.cardinal("b") } });
  const carLamp = { id: B.sconce, states: { "zt:lit": 0, "minecraft:cardinal_direction": fr.cardinal("r") } };
  L.set(CAR.x0, CAR.y + 2, 54, carLamp);
  lamps.push({ cell: [L.R(CAR.x0), L.U(CAR.y + 2), L.F(54)], spec: carLamp, x: CAR.x0, z: 54, car: true });

  // ---- shelves, closets, crates, and where the switches can be
  const blocked = new Set();
  const take = (x, z) => blocked.add(x + "," + z);
  /** @type {{ x: number, y: number, z: number, face: string, up?: boolean }[]} */
  const shelfSpots = [];
  const shelf = (x, z, face, up = false) => {
    const y0 = up ? UP.y : 0;
    L.box(x, y0, z, x, y0 + 2, z, B.shelf);
    if (!up) take(x, z);
    shelfSpots.push({ x, y: y0 + 1, z, face, up });
  };
  // against the outer walls and the squares' faces, never across a hall
  for (const z of [9, 13, 21, 25]) shelf(HALLS.x0, z, "r");
  for (const z of [9, 13, 22]) shelf(HALLS.x1, z, "l");
  for (const x of [-12, -7, 6, 10]) shelf(x, HALLS.z0, "f");
  for (const x of [-16, 15]) shelf(x, HALLS.z1, "b");
  for (const a of ALCOVES) {
    const back = a[0] < 0 ? a[0] : a[1];
    for (let z = a[2]; z <= a[3]; z += 2) shelf(back, z, a[0] < 0 ? "r" : "l");
    for (const x of [a[0] + 1, a[1] - 1]) {
      shelf(x, a[2], "f");
      shelf(x, a[3], "b");
    }
  }
  /** @type {{ x: number, z: number, face: string }[]} */
  const closets = [
    { x: -18, z: 17, face: "r" }, { x: 17, z: 18, face: "l" }, { x: -2, z: 15, face: "r" }, { x: 1, z: 19, face: "l" },
    { x: -9, z: 10, face: "b" }, { x: 9, z: 23, face: "f" }, { x: -9, z: 26, face: "b" },
  ];
  for (const c of closets) {
    L.box(c.x, 0, c.z, c.x, 2, c.z, "zt:collider");
    take(c.x, c.z);
  }
  // upstairs: shelves along the right, crate stacks, the key on one of them
  for (const z of [41, 43, 45, 47, 49]) shelf(UP.x1, z, "l", true);
  const crates = [[-7, 41], [-7, 49], [3, 41], [-2, 46], [5, 49]];
  /** @type {{ x: number, y: number, z: number }[]} */
  const crateTops = [];
  for (const [x, z] of crates) {
    const hgt = 1 + Math.floor(rng() * 2);
    L.box(x, UP.y, z, x, UP.y + hgt - 1, z, B.crate);
    crateTops.push({ x, y: UP.y + hgt, z });
  }
  // the live wire hangs from a pipe across the back hall
  L.box(WIRE.x - 2, HALLS.h - 1, WIRE.z, WIRE.x + 2, HALLS.h - 1, WIRE.z, pillar(fr, "minecraft:iron_chain", "r"));
  return { plan: L.plan, lamps, shelfSpots, closets, crateTops, blocked, L };
}

/**
 * Build door 100 and set it up. `done(ok, failed)` as for build().
 * @param {Run} run @param {FloorData} d @param {FloorRoom} room
 */
export function build100(run, d, room, done) {
  const fr = run.frame;
  const rng = mulberry(d.seed + 100100);
  const lay = layout(fr, room, rng);
  build(fr, lay.plan, (ok, failed) => {
    if (ok) setup(run, d, room, lay, rng);
    done(ok, failed);
  }, () => run.phase === "over");
}
export { build100 as build };

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The doors, the lever, the box, closets, the key, the wire, and the Figure's map. @param {Run} run @param {FloorData} d */
function setup(run, d, room, lay, rng) {
  const fr = run.frame;
  const L = lay.L;
  room.lamps = lay.lamps;
  room.ents = [];
  const spawn = (type, x, y, z, face, props = {}) => {
    const e = Doors.spawnFor(run, type, L.at(x, y, z), { yaw: fr.yawOf(face) });
    for (const [k, v] of Object.entries(props)) e.setProperty(k, v);
    room.ents.push(e.id);
    return e;
  };
  /** @type {any} */
  const s = {
    stage: "explore", at: 0, lay, figureId: undefined, switches: new Map(), collected: 0, inserted: 0, levers: [], boxId: "",
    leverId: "", keyId: "", wireId: "", puzzle: undefined, flickerAt: 0, carAt: 0, chase: undefined, bangs: 0, d,
    leverPulled: false, boxOpened: false,
  };
  d.d100 = s;
  // the High Voltage room's grey door (its sign out toward the halls), locked
  s.hvDoor = Doors.spawnDoor(run, L.R(HV.door), L.U(0), L.F(6), null, { type: "zt:metal_door", locked: true, keep: false, yaw: fr.yawOf("f") });
  try {
    Doors.doorEntity(s.hvDoor)?.setProperty("zt:sign", true);
  } catch {
    /* ignore */
  }
  // the wide grey gate and its lever
  s.gate = Doors.spawnDoor(run, L.R(GATE.x), L.U(0), L.F(GATE.z), null, { type: "zt:big_gate", width: GATE.w, height: GATE.h, keep: false });
  s.leverId = spawn("zt:wall_lever", LEVER.x, LEVER.y, LEVER.z, "b").id;
  // the breaker box on the High Voltage room's wall, its door shut
  s.boxId = spawn("zt:breaker_box", BOX.x + 0.18, 0.55, BOX.z, "r").id;
  // the broken elevator: its gate wide open
  s.carGate = Doors.spawnDoor(run, L.R(CAR.x0), L.U(CAR.y), L.F(51), null, { type: "zt:elevator_gate", width: 4, height: 3, keep: false });
  Doors.openDoor(run, s.carGate, true);
  // wooden closets in the halls
  for (const c of lay.closets) {
    const e = spawn("zt:wardrobe", c.x + 0.5, 0, c.z + 0.5, c.face, { "zt:style": 1 });
    d.spots.set(e.id, { id: e.id, kind: "closet", room: 100, cells: [[L.R(c.x), L.U(0), L.F(c.z)], [L.R(c.x), L.U(1), L.F(c.z)],
      [L.R(c.x), L.U(2), L.F(c.z)]], at: { r: L.R(c.x + 0.5), u: L.U(0), f: L.F(c.z + 0.5) }, face: c.face, occupant: undefined });
  }
  // the grey key, on one of the crates upstairs
  const top = lay.crateTops[Math.floor(rng() * lay.crateTops.length)];
  const key = spawn("zt:room_key", top.x + 0.5, top.y, top.z + 0.5, "f", { "zt:style": 1 });
  s.keyId = key.id;
  // the live wire, sparking
  s.wireId = spawn("zt:live_wire", WIRE.x, 0, WIRE.z, "f").id;
  // the Figure's map: the halls and their side rooms, nothing else
  s.nav = new GridNav(L, lay.blocked);
}

// ---------------------------------------------------------------- the Figure's map of the halls
/** A small binary heap of ids by priority. */
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

/** Walkable cells of the halls (frame cells), A* across them, straightened paths. */
export class GridNav {
  constructor(L, blocked) {
    this.u = L.U(0);
    this.cells = new Set();
    const add = (x, z) => {
      if (!blocked.has(x + "," + z)) this.cells.add(L.R(x) + "," + L.F(z));
    };
    for (let x = HALLS.x0; x <= HALLS.x1; x++) {
      for (let z = HALLS.z0; z <= HALLS.z1; z++) {
        if (SQUARES.some((s) => x >= s[0] && x <= s[1] && z >= s[2] && z <= s[3])) continue;
        add(x, z);
      }
    }
    for (const a of ALCOVES) {
      for (let x = a[0]; x <= a[1]; x++) for (let z = a[2]; z <= a[3]; z++) add(x, z);
      const wallX = a[0] < 0 ? a[1] + 1 : a[0] - 1;
      for (let z = a[2]; z <= a[3]; z++) add(wallX, z);
    }
    this.list = [...this.cells].map((k) => k.split(",").map(Number));
  }

  walk(r, f) {
    return this.cells.has(r + "," + f);
  }

  node(l) {
    const r0 = Math.floor(l.r);
    const f0 = Math.floor(l.f);
    for (let rad = 0; rad <= 4; rad++) {
      let best;
      let bestD = Infinity;
      for (let dr = -rad; dr <= rad; dr++) {
        for (let df = -rad; df <= rad; df++) {
          if (Math.max(Math.abs(dr), Math.abs(df)) !== rad || !this.walk(r0 + dr, f0 + df)) continue;
          const dd = Math.hypot(dr, df);
          if (dd < bestD) {
            bestD = dd;
            best = { r: r0 + dr + 0.5, u: this.u, f: f0 + df + 0.5 };
          }
        }
      }
      if (best) return best;
    }
    return undefined;
  }

  random() {
    const [r, f] = this.list[Math.floor(Math.random() * this.list.length)];
    return { r: r + 0.5, u: this.u, f: f + 0.5 };
  }

  path(from, to) {
    const a = this.node(from);
    const b = this.node(to);
    if (!a || !b) return undefined;
    const sr = Math.floor(a.r);
    const sf = Math.floor(a.f);
    const gr = Math.floor(b.r);
    const gf = Math.floor(b.f);
    const id = (r, f) => (r + 4096) * 8192 + (f + 4096);
    const h = (r, f) => {
      const dr = Math.abs(r - gr);
      const df = Math.abs(f - gf);
      return Math.max(dr, df) + 0.414 * Math.min(dr, df);
    };
    /** @type {Map<number, { r: number, f: number, g: number, prev: number | null, closed: boolean }>} */
    const nodes = new Map();
    const start = id(sr, sf);
    const goal = id(gr, gf);
    nodes.set(start, { r: sr, f: sf, g: 0, prev: null, closed: false });
    const open = new Heap();
    open.push(start, h(sr, sf));
    let found = false;
    let guard = 0;
    while (open.size && guard++ < 6000) {
      const cid = open.pop();
      const cur = nodes.get(cid);
      if (cur.closed) continue;
      cur.closed = true;
      if (cid === goal) {
        found = true;
        break;
      }
      for (let dr = -1; dr <= 1; dr++) {
        for (let df = -1; df <= 1; df++) {
          if (!dr && !df) continue;
          const r = cur.r + dr;
          const f = cur.f + df;
          if (!this.walk(r, f)) continue;
          if (dr && df && (!this.walk(cur.r + dr, cur.f) || !this.walk(cur.r, cur.f + df))) continue;
          const nid = id(r, f);
          const g = cur.g + (dr && df ? 1.414 : 1);
          const old = nodes.get(nid);
          if (old && (old.closed || old.g <= g)) continue;
          nodes.set(nid, { r, f, g, prev: cid, closed: false });
          open.push(nid, g + h(r, f));
        }
      }
    }
    if (!found) return undefined;
    const cells = [];
    for (let k = goal; k !== null; k = nodes.get(k).prev) cells.push(nodes.get(k));
    cells.reverse();
    const pts = cells.map((c) => ({ r: c.r + 0.5, u: this.u, f: c.f + 0.5 }));
    return this.smooth(pts);
  }

  smooth(pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.clear(pts[i], pts[j])) j--;
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
      for (const [or, of] of [[0.35, 0.35], [-0.35, 0.35], [0.35, -0.35], [-0.35, -0.35]]) {
        if (!this.walk(Math.floor(r + or), Math.floor(f + of))) return false;
      }
    }
    return true;
  }
}

// ---------------------------------------------------------------- per tick
/** @param {Run} run @param {FloorData} d */
export function tick(run, d, now, where) {
  const s = d.d100;
  if (!s) return;
  const L = s.lay.L;
  const players = Doors.livePlayers(run);
  // the corridor's lights never stop flickering (until the power is back)
  if (now >= s.flickerAt && s.stage !== "power" && s.stage !== "chase" && s.stage !== "elevator") {
    s.flickerAt = now + 3 + Math.floor(Math.random() * 10);
    for (const lamp of s.lay.lamps.slice(0, 2)) setLamp(run, lamp, Math.random() < 0.55 ? 1 : 0);
  }
  if (s.stage === "lever") leverScene(run, d, s, now);
  else if (s.stage === "fire") fireScene(run, d, s, now);
  else if (s.stage === "puzzle") puzzleTick(run, d, s, now);
  else if (s.stage === "power") powerScene(run, d, s, now);
  else if (s.stage === "chase") chaseTick(run, d, s, now, players);
  else if (s.stage === "elevator") elevatorScene(run, d, s, now);
  // the switches meter, once the box is open
  if (s.collected !== undefined && (s.stage === "hunt" || s.stage === "switches") && now % 10 === 0 && s.boxOpened) {
    for (const p of players) Doors.setMeter(p, "switches", Math.max(1, ((s.collected + s.inserted) / SWITCHES) * 100));
  }
  void where;
  void L;
}

// ---------------------------------------------------------------- interactions
/** @param {Run} run @param {FloorData} d @param {Player} p @param {Entity} target */
export function onInteract(run, d, p, target) {
  const s = d.d100;
  if (!s) return false;
  if (target.id === s.leverId) {
    if (!s.leverPulled) pullLever(run, d, s, p, target);
    else Doors.actionbar(p, "§7The lever is stuck down.");
    return true;
  }
  if (target.id === s.keyId) {
    target.remove();
    s.keyId = "";
    Doors.giveRunItem(p, "zt:electrical_key", "§7Grey Key", ["§7Opens the High Voltage room."]);
    Doors.sound(run.dim, "zt.key.pickup", p.location, 1.0, 1.0);
    Doors.title(p, "§7Grey Key", "§8\"WARNING: HIGH VOLTAGE\"", 40);
    return true;
  }
  if (s.switches.has(target.id)) {
    s.switches.delete(target.id);
    target.remove();
    s.collected++;
    Doors.giveRunItem(p, "zt:breaker_switch", "§eBreaker Switch", ["§7Put it in the breaker box."]);
    Doors.sound(run.dim, "zt.breaker.pickup", p.location, 1.0, 1.0);
    for (const q of Doors.livePlayers(run)) Doors.actionbar(q, "§eSwitches: " + (s.collected + s.inserted) + "/" + SWITCHES);
    return true;
  }
  if (target.id === s.boxId) {
    breakerBox(run, d, s, p, target);
    return true;
  }
  const lever = s.levers.indexOf(target.id);
  if (lever >= 0) {
    flip(run, s, lever);
    return true;
  }
  return false;
}

/**
 * Someone died carrying the grey key or switches: they fall where they died.
 * @param {Run} run @param {FloorData} d @param {Player} p
 */
export function dropped(run, d, p, at) {
  const s = d.d100;
  if (!s) return;
  if (Doors.countItem(p, "zt:electrical_key") && s.hvDoor?.locked) {
    Doors.takeItem(p, "zt:electrical_key");
    const e = Doors.spawnFor(run, "zt:room_key", at, { yaw: Math.random() * 360 });
    e.setProperty("zt:style", 1);
    s.keyId = e.id;
  }
  const n = Doors.countItem(p, "zt:breaker_switch");
  if (n) {
    Doors.takeItem(p, "zt:breaker_switch", n);
    s.collected = Math.max(0, s.collected - n);
    for (let i = 0; i < n; i++) {
      const e = Doors.spawnFor(run, "zt:switch_pickup", { x: at.x + (Math.random() - 0.5) * 0.8, y: at.y, z: at.z + (Math.random() - 0.5) * 0.8 },
        { yaw: Math.random() * 360 });
      s.switches.set(e.id, { x: 0, y: 0, z: 0, face: "f", up: false });
    }
  }
}

/** The High Voltage room's door was unlocked. @param {Run} run @param {FloorData} d */
export function onUnlocked(run, d, door) {
  Doors.openDoor(run, door);
}

/** The lever: the gate slides open, and the Figure comes down the stairs. @param {Run} run @param {FloorData} d */
function pullLever(run, d, s, p, lever) {
  s.leverPulled = true;
  s.stage = "lever";
  s.at = system.currentTick;
  lever.setProperty("zt:on", true);
  Doors.sound(run.dim, "zt.lever.pull", lever.location, 1.2, 1.0);
  Doors.openDoor(run, s.gate);
  const L = s.lay.L;
  for (const q of Doors.livePlayers(run)) {
    Doors.lockInput(q, true);
    Doors.camera(q, L.at(5.5, 2.6, 23.5), L.at(-0.5, 6, 37), 0.8);
  }
}

/** @param {Run} run @param {FloorData} d */
function leverScene(run, d, s, now) {
  const t = now - s.at;
  const L = s.lay.L;
  const fr = run.frame;
  if (t === 30) {
    const fig = Doors.spawnFor(run, Fig.FIGURE, L.at(-12.5, UP.y, 43.5), { spawnEvent: "zt:as_level", yaw: fr.yawOf("r") });
    s.figureId = fig.id;
    Fig.attachLevel(fig, run, s.nav, fr);
    Fig.setKillKind(fig, "figure");
    const pt = (x, y, z) => ({ r: L.R(x), u: L.U(y), f: L.F(z) });
    Fig.scriptPath(fig, [pt(-6.5, UP.y, 43.5), pt(-0.5, UP.y, 41.5), pt(-0.5, UP.y, 39.5), pt(-0.5, 0, 30.5), pt(-0.5, 0, 28.5),
      pt(-0.5, 0, 25.5), pt(3.5, 0, 24.5)], 3.2, 1);
    Doors.sound(run.dim, "zt.figure.roar", fig.location, 2.5, 0.9);
    for (const q of Doors.livePlayers(run)) Doors.camera(q, L.at(3.5, 3.2, 23.0), fig, 0.6);
  }
  const fig = s.figureId ? world.getEntity(s.figureId) : undefined;
  if (t > 30 && (!isValid(fig) || !Fig.isWalking(fig) || t > 520)) {
    if (isValid(fig)) {
      try {
        fig.teleport(L.at(3.5, 0, 24.5));
      } catch {
        /* ignore */
      }
      Fig.scriptAct(fig, "roar", 30);
      Doors.sound(run.dim, "zt.figure.roar", fig.location, 3.0, 1.0);
      Fig.release(fig, "search", { r: L.R(3.5), u: L.U(0), f: L.F(24.5) });
    }
    s.stage = "hunt";
    for (const q of Doors.livePlayers(run)) {
      Doors.lockInput(q, false);
      Doors.cameraClear(q);
      Doors.title(q, "§4The Figure", "§7Hide in a closet. Find a key upstairs.", 70);
      q.sendMessage("§cThe Figure is loose in the halls. §7It hears every step: crouch, or hide in a wooden closet.");
      q.sendMessage("§7Through the gate and up the stairs: the grey key opens the §8High Voltage §7room.");
    }
  }
}

/** The breaker box: open it, put the switches in, or (during the puzzle) set its switches. @param {Run} run @param {FloorData} d */
function breakerBox(run, d, s, p, box) {
  if (!s.boxOpened) {
    s.boxOpened = true;
    box.setProperty("zt:open", true);
    Doors.sound(run.dim, "zt.breaker.open", box.location, 1.0, 1.0);
    placeSwitches(run, d, s);
    if (s.stage === "explore") s.stage = "switches";
    for (const q of Doors.livePlayers(run)) {
      Doors.title(q, "§e0/" + SWITCHES + " Switches", "§7The breaker box is missing its switches.", 60);
      q.sendMessage("§7Ten switches are missing: §etwo or three upstairs§7, the rest on the shelves in the halls (where the Figure is).");
    }
    return;
  }
  if (s.stage === "puzzle") {
    puzzleForm(run, s, p);
    return;
  }
  if (s.inserted >= SWITCHES) return;
  const have = Doors.countItem(p, "zt:breaker_switch");
  if (!have) {
    Doors.actionbar(p, "§7" + (SWITCHES - s.inserted) + " switches still missing.");
    return;
  }
  Doors.takeItem(p, "zt:breaker_switch", have);
  s.collected = Math.max(0, s.collected - have);
  s.inserted += have;
  box.setProperty("zt:slots", s.inserted);
  Doors.sound(run.dim, "zt.breaker.insert", box.location, 1.0, 1.0);
  for (const q of Doors.livePlayers(run)) Doors.actionbar(q, "§eSwitches in the box: " + s.inserted + "/" + SWITCHES);
  if (s.inserted >= SWITCHES) startFire(run, d, s);
}

/** The ten switches: two or three upstairs, the rest in the halls. @param {Run} run @param {FloorData} d */
function placeSwitches(run, d, s) {
  const rng = mulberry(d.seed + 1001);
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const up = shuffle(s.lay.shelfSpots.filter((x) => x.up));
  const down = shuffle(s.lay.shelfSpots.filter((x) => !x.up));
  const nUp = 2 + Math.floor(rng() * 2);
  const spots = [...up.slice(0, nUp), ...down.slice(0, SWITCHES - nUp)];
  const fr = run.frame;
  const L = s.lay.L;
  const room = d.rooms[100];
  for (const sp of spots) {
    const v = fr.vec(sp.face);
    const at = L.at(sp.x + 0.5 + 0, sp.y + 0.05, sp.z + 0.5);
    const loc = { x: at.x + v.x * 0.18, y: at.y, z: at.z + v.z * 0.18 };
    const e = Doors.spawnFor(run, "zt:switch_pickup", loc, { yaw: fr.yawOf(sp.face) });
    s.switches.set(e.id, sp);
    room.ents.push(e.id);
  }
}

// ---------------------------------------------------------------- the fire
/** @param {Run} run @param {FloorData} d */
function startFire(run, d, s) {
  s.stage = "fire";
  s.at = system.currentTick;
  const L = s.lay.L;
  for (const q of Doors.livePlayers(run)) {
    Doors.clearMeter(q, "switches");
    Doors.lockInput(q, true);
    Doors.fade(q, 0.3, 0.3, 0.5);
  }
  // the Figure is brought to the back hall for the scene (out of sight, during the fade)
  let fig = s.figureId ? world.getEntity(s.figureId) : undefined;
  if (!isValid(fig)) {
    fig = Doors.spawnFor(run, Fig.FIGURE, L.at(4.5, 0, 24.5), { spawnEvent: "zt:as_level", yaw: run.frame.yawOf("r") });
    s.figureId = fig.id;
    Fig.attachLevel(fig, run, s.nav, run.frame);
  }
  system.runTimeout(() => {
    if (!isValid(fig)) return;
    try {
      fig.teleport(L.at(4.5, 0, 24.5));
    } catch {
      /* ignore */
    }
    Fig.scriptPath(fig, [{ r: L.R(WIRE.x), u: L.U(0), f: L.F(WIRE.z) }], 2.0, 1);
    for (const q of Doors.livePlayers(run)) Doors.camera(q, L.at(6.0, 3.6, 22.2), L.at(WIRE.x, 0.8, WIRE.z), 0.0);
  }, 8);
}

/** @param {Run} run @param {FloorData} d */
function fireScene(run, d, s, now) {
  const t = now - s.at;
  const L = s.lay.L;
  const fig = s.figureId ? world.getEntity(s.figureId) : undefined;
  const pt = (x, z) => ({ r: L.R(x), u: L.U(0), f: L.F(z) });
  if (now % 4 === 0) particle(run.dim, "zt:sparks", L.at(WIRE.x, 0.2, WIRE.z));
  if (!s.fire && t > 12 && isValid(fig) && !Fig.isWalking(fig)) {
    // it steps on the wire: sparks, and the oil goes up
    s.fire = now;
    Doors.sound(run.dim, "zt.wire.spark", L.at(WIRE.x, 0.5, WIRE.z), 2.0, 1.0);
    Doors.sound(run.dim, "zt.fire.whoosh", L.at(WIRE.x, 0.5, WIRE.z), 2.5, 1.0);
    Fig.scriptAct(fig, "roar", 30);
    Doors.sound(run.dim, "zt.figure.roar", fig.location, 3.0, 1.2);
    s.bump = 0;
    s.bumpAt = now + 30;
  }
  if (s.fire) {
    if (now % 3 === 0) {
      particle(run.dim, "zt:chandelier_fire", L.at(WIRE.x, 0.1, WIRE.z));
      if (isValid(fig)) particle(run.dim, "zt:chandelier_fire", { x: fig.location.x, y: fig.location.y + 1.2, z: fig.location.z });
    }
    if (isValid(fig) && now >= s.bumpAt && !Fig.isWalking(fig)) {
      // it runs blind, burning: into the back wall, into the square, and out through the window
      const legs = [[pt(WIRE.x, 26.3)], [pt(9.5, 23.15)], [pt(WINDOW.x - 0.6, WINDOW.z + 1), pt(WINDOW.x + 3, WINDOW.z + 1)]];
      if (s.bump > 0 && s.bump < 3) {
        Fig.scriptAct(fig, "stumble", 14);
        Doors.sound(run.dim, "zt.figure.bump", fig.location, 2.0, 1.0);
        for (const q of Doors.livePlayers(run)) {
          try {
            q.runCommand("camerashake add @s 0.3 0.5 positional");
          } catch {
            /* ignore */
          }
        }
      }
      if (s.bump < 3) {
        Fig.scriptPath(fig, legs[s.bump], 6.0, 2);
        s.bump++;
        s.bumpAt = now + PRICE_OF_BUMP;
        if (s.bump === 3) {
          // through the glass
          system.runTimeout(() => {
            for (let y = 1; y <= 3; y++) {
              for (const z of [WINDOW.z, WINDOW.z + 1]) {
                try {
                  run.dim.setBlockPermutation(run.frame.cell(L.R(WINDOW.x), L.U(y), L.F(z)), perm("minecraft:air"));
                } catch {
                  /* ignore */
                }
              }
            }
            particle(run.dim, "zt:glass_burst", L.at(WINDOW.x + 0.5, 2, WINDOW.z + 1));
            Doors.sound(run.dim, "zt.window.crash", L.at(WINDOW.x, 2, WINDOW.z + 1), 2.5, 1.0);
          }, 14);
        }
      } else {
        // gone: out into the dark
        Fig.detach(fig.id);
        fig.remove();
        s.figureId = undefined;
        startPuzzle(run, d, s);
      }
    }
  }
  if (t > 600) {
    if (isValid(fig)) {
      Fig.detach(fig.id);
      fig.remove();
    }
    s.figureId = undefined;
    startPuzzle(run, d, s);
  }
}

// ---------------------------------------------------------------- the breaker puzzle
const ROUND_SHOW = [32, 22, 15];
const GAP = 6;
const PAUSE = 40;

/** @param {Run} run @param {FloorData} d */
function startPuzzle(run, d, s) {
  s.stage = "puzzle";
  const L = s.lay.L;
  const fr = run.frame;
  s.stage = "puzzle";
  for (const q of Doors.livePlayers(run)) {
    Doors.lockInput(q, false);
    Doors.cameraClear(q);
    Doors.title(q, "§eThe Breaker", "§7Watch the screen. Set the switches to match.", 80);
    q.sendMessage("§7The screen shows a switch number with a §ffull square§7 (switch it ON) or an §8empty square§7 (OFF).");
    q.sendMessage("§7Three rounds, each faster. In the last, the final number shows as §e??§7: it's the one that wasn't shown.");
    q.sendMessage("§7Tap a switch to flip it, or tap the box to set them all at once.");
  }
  // the ten switches in their slots: two rows of five
  const box = world.getEntity(s.boxId);
  s.levers = [];
  for (let i = 0; i < SWITCHES; i++) {
    const row = i < 5 ? 0 : 1;
    const col = i % 5;
    const loc = L.at(BOX.x + 0.38, 0.55 + (row === 0 ? 1.0 : 0.5), BOX.z - 0.9 + col * 0.45);
    const e = Doors.spawnFor(run, "zt:breaker_lever", loc, { yaw: fr.yawOf("r") });
    e.setProperty("zt:n", i + 1);
    s.levers.push(e.id);
    d.rooms[100].ents.push(e.id);
  }
  if (isValid(box)) box.setProperty("zt:slots", SWITCHES);
  s.puzzle = newRound(1);
  s.puzzle.at = system.currentTick + 40;
}

function newRound(round) {
  const order = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].sort(() => Math.random() - 0.5);
  const target = new Array(SWITCHES).fill(false);
  const seq = order.map((n) => {
    const on = Math.random() < 0.5;
    target[n - 1] = on;
    return { n, on };
  });
  // at least a few of each
  if (target.every((x) => x) || target.every((x) => !x)) {
    seq[0].on = !seq[0].on;
    target[seq[0].n - 1] = seq[0].on;
  }
  return { round, seq, target, i: -1, at: 0, passes: 0, okUntil: 0 };
}

/** @param {Run} run @param {FloorData} d */
function puzzleTick(run, d, s, now) {
  const P = s.puzzle;
  const box = world.getEntity(s.boxId);
  if (!P || !isValid(box)) return;
  if (now < P.at) return;
  const show = ROUND_SHOW[P.round - 1];
  // the screen steps through the sequence: number, blank, number... then a pause, and again
  if (P.i >= 0 && P.i < P.seq.length && P.blank !== true) {
    P.blank = true;
    P.at = now + GAP;
    box.setProperty("zt:num", 0);
    box.setProperty("zt:fill", 0);
    return;
  }
  P.blank = false;
  P.i++;
  if (P.i >= P.seq.length) {
    P.passes++;
    P.i = -1;
    P.at = now + PAUSE;
    box.setProperty("zt:num", 0);
    box.setProperty("zt:fill", 0);
    if (solved(run, s)) nextRound(run, d, s, box, now);
    return;
  }
  const e = P.seq[P.i];
  const last = P.i === P.seq.length - 1;
  box.setProperty("zt:num", P.round === 3 && last ? 11 : e.n);
  box.setProperty("zt:fill", e.on ? 2 : 1);
  Doors.sound(run.dim, "zt.breaker.beep", box.location, 0.8, e.on ? 1.2 : 0.9);
  P.at = now + show;
}

/** Do the switches match? (after the sequence has been shown once) */
function solved(run, s) {
  const P = s.puzzle;
  if (!P || P.passes < 1) return false;
  return s.levers.every((id, i) => {
    const e = world.getEntity(id);
    return isValid(e) && e.getProperty("zt:on") === P.target[i];
  });
}

/** @param {Run} run @param {FloorData} d */
function nextRound(run, d, s, box, now) {
  const P = s.puzzle;
  box.setProperty("zt:ok", true);
  system.runTimeout(() => isValid(box) && box.setProperty("zt:ok", false), 25);
  Doors.sound(run.dim, "zt.breaker.correct", box.location, 1.5, 1.0);
  if (P.round >= 3) {
    s.puzzle = undefined;
    power(run, d, s, now);
    return;
  }
  for (const q of Doors.livePlayers(run)) Doors.actionbar(q, "§aRound " + P.round + " done! §7Faster now...");
  s.puzzle = newRound(P.round + 1);
  s.puzzle.at = now + 40;
}

/** Flip one switch (and see whether that solved it). @param {Run} run */
function flip(run, s, i) {
  if (s.stage !== "puzzle") return;
  const e = world.getEntity(s.levers[i]);
  if (!isValid(e)) return;
  e.setProperty("zt:on", !e.getProperty("zt:on"));
  Doors.sound(run.dim, "zt.breaker.click", e.location, 1.0, e.getProperty("zt:on") ? 1.2 : 0.9);
  checkNow(run, s);
}

/** @param {Run} run */
function checkNow(run, s) {
  const P = s.puzzle;
  if (!P || P.i !== -1) return;
  // during the pause after a full showing, a correct board counts straight away
  const box = world.getEntity(s.boxId);
  if (isValid(box) && solved(run, s)) nextRound(run, s.d, s, box, system.currentTick);
}

/** All ten switches at once, with a form. @param {Run} run @param {Player} p */
function puzzleForm(run, s, p) {
  const form = new ModalFormData().title("Breaker Box");
  s.levers.forEach((id, i) => {
    const e = world.getEntity(id);
    form.toggle("Switch " + (i + 1), { defaultValue: isValid(e) ? !!e.getProperty("zt:on") : false });
  });
  form.show(p).then((res) => {
    if (res.canceled || !res.formValues || s.stage !== "puzzle") return;
    res.formValues.forEach((v, i) => {
      const e = world.getEntity(s.levers[i]);
      if (isValid(e) && e.getProperty("zt:on") !== !!v) e.setProperty("zt:on", !!v);
    });
    Doors.sound(run.dim, "zt.breaker.click", p.location, 1.0, 1.0);
    checkNow(run, s);
  }).catch(() => {
    /* busy */
  });
}

// ---------------------------------------------------------------- the power, and the Figure
/** @param {Run} run @param {FloorData} d */
function power(run, d, s, now) {
  s.stage = "power";
  s.at = now;
  for (const lamp of s.lay.lamps) setLamp(run, lamp, 1);
  const box = world.getEntity(s.boxId);
  if (isValid(box)) {
    box.setProperty("zt:num", 0);
    box.setProperty("zt:fill", 0);
    box.setProperty("zt:ok", true);
  }
  Doors.sound(run.dim, "zt.breaker.power", box?.location ?? run.frame.at(0, 0, 0), 2.5, 1.0);
  for (const q of Doors.livePlayers(run)) {
    Doors.title(q, "§aThe power is back!", "§7The elevator is working...", 50);
    try {
      q.playMusic("zt.music.door100", { loop: true, fade: 0.5, volume: 1.0 });
    } catch {
      /* ignore */
    }
  }
}

/** Two slams on the door behind you, and on the third it bursts. @param {Run} run @param {FloorData} d */
function powerScene(run, d, s, now) {
  const t = now - s.at;
  const door = Doors.doorEntity(s.hvDoor);
  const L = s.lay.L;
  const bang = (k) => {
    if (door) {
      door.setProperty("zt:bang", true);
      system.runTimeout(() => {
        const e = Doors.doorEntity(s.hvDoor);
        if (e) e.setProperty("zt:bang", false);
      }, 6);
    }
    Doors.sound(run.dim, k < 3 ? "zt.figure.bang" : "zt.door.burst", door?.location ?? L.at(HV.door, 1, 6), 3.0, 1.0);
    for (const q of Doors.livePlayers(run)) {
      try {
        q.runCommand("camerashake add @s " + (k < 3 ? 0.25 : 0.6) + " 0.6 positional");
      } catch {
        /* ignore */
      }
    }
  };
  if (t === 60) bang(1);
  if (t === 110) bang(2);
  if (t === 160) {
    bang(3);
    // it's through
    if (s.hvDoor.open === false) Doors.openDoor(run, s.hvDoor, true);
    if (door) door.setProperty("zt:broken", true);
    particle(run.dim, "zt:door_debris", L.at(HV.door + 1, 1.2, 6));
    // it comes through with the door and goes sprawling into the room: get past it, now
    const fig = Doors.spawnFor(run, Fig.FIGURE, L.at(FALL.x, 0, FALL.z), { spawnEvent: "zt:as_level", yaw: run.frame.yawOf("l") });
    s.figureId = fig.id;
    fig.setProperty("zt:act", 4);
    Doors.sound(run.dim, "zt.figure.roar", fig.location, 3.5, 0.9);
    for (const q of Doors.livePlayers(run)) {
      Doors.title(q, "§4RUN!", "§7Up the stairs, to the elevator!", 40);
    }
    startChase(run, d, s, now);
  }
}

/** The way from where the Figure fell to the elevator: the route it hunts you along. */
function chaseLine(s) {
  const L = s.lay.L;
  const pt = (x, y, z) => ({ r: L.R(x), u: L.U(y), f: L.F(z) });
  return measure([pt(FALL.x, 0, FALL.z), pt(HV.door + 1, 0, 4.5), pt(HV.door + 1, 0, 8.6), pt(-0.5, 0, 8.6), pt(-0.5, 0, 25.5),
    pt(-0.5, 0, 28.5), pt(-0.5, 0, 30.5), pt(-0.5, UP.y, 39.5), pt(-0.5, UP.y, 49.6)]);
}

/** How far along a measured route a frame point is (its nearest point on it, heights counted). */
function progressOn(line, l) {
  let best = 0;
  let bestD = Infinity;
  const { pts, s } = line;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = { r: b.r - a.r, u: b.u - a.u, f: b.f - a.f };
    const L2 = d.r * d.r + d.u * d.u + d.f * d.f || 1;
    const t = Math.max(0, Math.min(1, ((l.r - a.r) * d.r + (l.u - a.u) * d.u + (l.f - a.f) * d.f) / L2));
    const dist = Math.hypot(a.r + d.r * t - l.r, (a.u + d.u * t - l.u) * 0.5, a.f + d.f * t - l.f);
    if (dist < bestD) {
      bestD = dist;
      best = s[i - 1] + Math.sqrt(L2) * t;
    }
  }
  return best;
}

/** @param {Run} run @param {FloorData} d */
function startChase(run, d, s, now) {
  s.stage = "chase";
  s.chase = { line: chaseLine(s), s: 0, at: now, stepAt: 0, carAt: 0 };
}

/** @param {Run} run @param {FloorData} d @param {Player[]} players */
function chaseTick(run, d, s, now, players) {
  const c = s.chase;
  const fig = s.figureId ? world.getEntity(s.figureId) : undefined;
  const fr = run.frame;
  const L = s.lay.L;
  if (isValid(fig)) {
    // it gets up, then comes after whoever is furthest behind, along the way to the elevator
    if (now - c.at > STUMBLE) {
      if (now - c.at === STUMBLE + 1) fig.setProperty("zt:act", 2);
      let goal = Infinity;
      let lag = 0;
      for (const p of players) {
        if (inCar(s, run, p.location) || Doors.isHidden(p)) continue;
        const ps = progressOn(c.line, fr.local(p.location));
        goal = Math.min(goal, ps);
        lag = Math.max(lag, len(sub(p.location, fig.location)));
      }
      if (goal === Infinity) goal = c.line.total;
      const speed = Math.min(6.2, 4.4 + Math.max(0, lag - 12) * 0.12);
      const step = speed / 20;
      c.s = goal > c.s ? Math.min(goal, c.s + step) : Math.max(goal, c.s - step);
      const pt = along(c.line, c.s);
      const at = fr.at(pt.r, pt.u, pt.f);
      try {
        fig.clearVelocity();
        fig.applyImpulse({ x: at.x - fig.location.x, y: at.y - fig.location.y, z: at.z - fig.location.z });
        fig.setRotation({ x: 0, y: yawTo(fr.at(0, 0, 0), fr.at(pt.dir.r, 0, pt.dir.f)) });
        fig.setProperty("zt:gait", Math.abs(goal - c.s) > 0.05 ? 2 : 0);
      } catch {
        /* ignore */
      }
      if (now >= c.stepAt) {
        c.stepAt = now + 7;
        Doors.sound(run.dim, "zt.figure.step", fig.location, 1.0, 0.9);
      }
      for (const p of players) {
        if (Doors.isHidden(p) || inCar(s, run, p.location) || !Doors.canDie(p)) continue;
        if (len(sub(p.location, fig.location)) <= 1.4) {
          if (Doors.holdsCrucifix(p)) {
            Doors.spendCrucifix(p, fig.location);
            c.at = now + 70;
            continue;
          }
          Doors.kill(p, fig, "elevator");
        }
      }
    }
  }
  // the elevator: it leaves five seconds after the first one gets in, or once everyone is in
  const inside = players.filter((p) => inCar(s, run, p.location));
  if (inside.length && !c.carAt) {
    c.carAt = now + 100;
    for (const p of players) Doors.actionbar(p, "§eThe elevator gate is closing! Get in!");
  }
  const everyone = players.length > 0 && players.every((p) => inCar(s, run, p.location));
  if (c.carAt && (now >= c.carAt || (everyone && now >= c.carAt - 80))) closeCar(run, d, s, now, players);
  void L;
}

/** @param {Run} run */
function inCar(s, run, loc) {
  const L = s.lay.L;
  const l = run.frame.local(loc);
  return l.r >= L.R(CAR.x0) && l.r < L.R(CAR.x1) + 1 && l.f >= L.F(CAR.z0) && l.f < L.F(CAR.z1) + 1 && l.u > L.U(CAR.y) - 1 &&
    l.u < L.U(CAR.y) + 4;
}

/** The gate shuts in the Figure's face. Anyone not in the car is left with it. @param {Run} run @param {FloorData} d */
function closeCar(run, d, s, now, players) {
  s.stage = "elevator";
  s.at = now;
  run.phase = "ending";
  Doors.closeDoor(run, s.carGate);
  const fig = s.figureId ? world.getEntity(s.figureId) : undefined;
  for (const p of players) {
    if (inCar(s, run, p.location)) {
      Doors.lockInput(p, true);
      continue;
    }
    if (isValid(fig) && Doors.canDie(p)) Doors.kill(p, fig, "elevator");
  }
  if (isValid(fig)) {
    try {
      fig.teleport(s.lay.L.at(-0.5, UP.y, 50.2), { rotation: { x: 0, y: run.frame.yawOf("f") } });
      fig.setProperty("zt:gait", 0);
    } catch {
      /* ignore */
    }
  }
}

/**
 * The ride down: the Figure bangs on the gate; ten seconds of elevator music; look up: it lands
 * on the roof, the cable snaps, ten seconds of falling, and the crash.
 * @param {Run} run @param {FloorData} d
 */
function elevatorScene(run, d, s, now) {
  const t = now - s.at;
  const L = s.lay.L;
  const players = Doors.livePlayers(run).filter((p) => inCar(s, run, p.location));
  const fig = s.figureId ? world.getEntity(s.figureId) : undefined;
  const setRow = (block) => {
    for (let x = CAR.x0; x <= CAR.x1; x++) {
      for (let y = CAR.y; y <= CAR.y + 3; y++) {
        try {
          run.dim.setBlockPermutation(run.frame.cell(L.R(x), L.U(y), L.F(50)), perm(block));
        } catch {
          /* ignore */
        }
      }
    }
  };
  const carLamp = s.lay.lamps.find((l) => l.car);
  if (t === 10 || t === 25 || t === 40) {
    if (isValid(fig)) {
      fig.setProperty("zt:act", 3);
      system.runTimeout(() => isValid(fig) && fig.setProperty("zt:act", 0), 8);
    }
    Doors.sound(run.dim, "zt.figure.bang_gate", L.at(-0.5, UP.y + 1, 51), 2.5, 1.0);
  }
  if (t === 55) for (const p of players) Doors.fade(p, 0.4, 0.6, 0.6);
  if (t === 65) {
    if (isValid(fig)) {
      Fig.detach(fig.id);
      fig.remove();
    }
    s.figureId = undefined;
    // outside the gate, the shaft walls slide up past you
    setRow(B.shaft);
    if (carLamp) setLamp(run, carLamp, 1);
    for (const p of players) {
      try {
        p.playMusic("zt.music.elevator", { loop: true, fade: 0.5, volume: 1.0 });
        p.runCommand("camerashake add @s 0.05 10 rotational");
      } catch {
        /* ignore */
      }
    }
  }
  if (t === 265) {
    // something lands on the roof
    for (const p of players) {
      Doors.camera(p, L.at(-0.5, CAR.y + 1.6, 53.5), L.at(-0.45, CAR.y + 6, 53.6), 0.6);
      try {
        p.stopMusic();
      } catch {
        /* ignore */
      }
    }
    const f2 = Doors.spawnFor(run, Fig.FIGURE, L.at(-0.5, CAR.y + 11, 53.5), { spawnEvent: "zt:as_level", yaw: run.frame.yawOf("f") });
    s.roofId = f2.id;
  }
  const roof = s.roofId ? world.getEntity(s.roofId) : undefined;
  if (t > 265 && t <= 280 && isValid(roof)) {
    const k = (t - 265) / 15;
    try {
      roof.teleport(L.at(-0.5, CAR.y + 11 - 6 * k * k, 53.5));
    } catch {
      /* ignore */
    }
    if (t === 280) {
      Doors.sound(run.dim, "zt.figure.land", roof.location, 3.0, 1.0);
      roof.setProperty("zt:act", 2);
      for (const p of players) {
        try {
          p.runCommand("camerashake add @s 0.5 0.6 positional");
        } catch {
          /* ignore */
        }
      }
    }
  }
  if (t === 300) Doors.sound(run.dim, "zt.figure.roar", L.at(-0.5, CAR.y + 5, 53.5), 3.0, 0.9);
  if (t === 330) {
    // the cable snaps
    Doors.sound(run.dim, "zt.elevator.cable", L.at(-0.5, CAR.y + 6, 53.5), 3.0, 1.0);
    particle(run.dim, "zt:sparks", L.at(-0.5, CAR.y + 5.2, 53.5));
    setRow(B.shaftFast);
    for (const p of players) {
      try {
        p.playSound("zt.elevator.fall", { volume: 1.0 });
        p.runCommand("camerashake add @s 0.9 10 positional");
      } catch {
        /* ignore */
      }
    }
  }
  if (t > 330 && t < 530 && t % 6 === 0) {
    if (carLamp) setLamp(run, carLamp, (t / 6) % 2 === 0 ? 1 : 0);
    for (const p of players) Doors.fade(p, 0.0, 0.05, 0.2, { red: 0.5, green: 0.0, blue: 0.0 });
    if (t % 30 === 0) Doors.sound(run.dim, "zt.elevator.alarm", L.at(-0.5, CAR.y + 2, 53.5), 1.5, 1.0);
  }
  if (t === 530) {
    for (const p of players) {
      Doors.fade(p, 0.0, 2.5, 1.0, { red: 1.0, green: 1.0, blue: 1.0 });
      try {
        p.playSound("zt.elevator.crash", { volume: 1.0 });
        p.runCommand("camerashake stop @s");
      } catch {
        /* ignore */
      }
    }
  }
  if (t === 560) {
    for (const p of players) {
      Doors.cameraClear(p);
      Doors.fade(p, 0.5, 2.5, 1.0);
      Doors.title(p, "§aFloor 1 Complete!", "§7You escaped The Hotel.", 120);
      p.sendMessage("§aYou made it through all 100 doors of The Hotel! §7Back to the Lobby...");
      try {
        p.playSound("zt.doors.escape", { volume: 1.0 });
      } catch {
        /* ignore */
      }
    }
  }
  if (t === 640) {
    s.stage = "done";
    if (d.finish) d.finish();
  }
}

/** @param {Run} run @param {FloorData} d */
export function end(run, d) {
  const s = d.d100;
  if (!s) return;
  for (const id of [s.figureId, s.roofId]) {
    if (!id) continue;
    Fig.detach(id);
    const e = world.getEntity(id);
    if (isValid(e)) e.remove();
  }
  for (const p of Doors.livePlayers(run)) Doors.clearMeter(p, "switches");
  void lantern;
  void slab;
}
