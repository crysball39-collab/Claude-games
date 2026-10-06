// The Hotel's rooms (DOORS, Floor 1): what each kind of room looks like and what is in it.
// A room is laid out in its own local cells (x across, from -w/2 to w/2-1; z forward from 0;
// y up from its floor) and comes out as a plan of blocks in the run's frame plus the things to
// spawn in it: closets and beds to hide in, dressers with drawers to search, lamps that Rush
// breaks, spots where a key can lie. Furniture keeps out of the way between the doors.
import { candles, joined, lantern, pillar, Plan, slab, stairs } from "./doors_build.js";

/** @typedef {import("./doors_build.js").Frame} Frame */

export const B = {
  air: "minecraft:air",
  floor: "zt:hotel_floor",
  ceiling: "zt:hotel_ceiling",
  wallpaper: "zt:hotel_wallpaper",
  green: "zt:hotel_wallpaper_green",
  blue: "zt:hotel_wallpaper_blue",
  torn: "zt:hotel_wallpaper_torn",
  wainscot: "zt:hotel_wainscot",
  trim: "zt:hotel_trim",
  shelf: "zt:library_shelf",
  planks: "minecraft:dark_oak_planks",
  slab: "minecraft:dark_oak_slab",
  stairs: "minecraft:dark_oak_stairs",
  log: "minecraft:stripped_dark_oak_log",
  fence: "minecraft:dark_oak_fence",
  carpet: "minecraft:red_carpet",
  collider: "zt:collider",
  colliderMid: "zt:collider_mid",
  colliderLow: "zt:collider_low",
  window: "zt:hotel_window",
  crate: "zt:wooden_crate",
  lamp: "zt:ceiling_lamp",
  sconce: "zt:wall_lamp",
  painting: "zt:hotel_painting",
  curtain: "zt:hospital_curtain",
  hospitalWall: "zt:hospital_wall",
  hospitalFloor: "zt:hospital_floor",
  pot: "minecraft:decorated_pot",
  leaves: { id: "minecraft:azalea_leaves", states: { persistent_bit: true } },
  flowering: { id: "minecraft:azalea_leaves_flowered", states: { persistent_bit: true } },
  oakLeaves: { id: "minecraft:oak_leaves", states: { persistent_bit: true } },
  light1: "minecraft:light_block_1",
};

/**
 * One room of the hotel, in the run's frame (r across, f forward, u up). The room's local
 * cells are x = r - c, z = f - f0, y = u - u0.
 * @typedef {{
 *   n: number, kind: string, style: string, c: number, w: number, L: number, H: number, f0: number, f1: number,
 *   u0: number, entryR: number, exitR: number, boxes: number[][], dark: boolean, locked: boolean, eyes: number,
 *   gateIn: boolean, gateOut: boolean, seg?: string, si?: number, built?: boolean, building?: boolean, door?: any,
 *   ents?: string[], lamps?: any[], content?: RoomContent, keyId?: string, side?: any, [k: string]: any,
 * }} FloorRoom
 *
 * A piece of furniture or a creature to spawn, in frame cells.
 * @typedef {{
 *   type: string, at: { r: number, u: number, f: number }, face: string, props?: Record<string, any>,
 *   cells?: number[][], hide?: string, drawers?: number, top?: number, tag?: string, spot?: any,
 * }} Fixture
 *
 * @typedef {{
 *   plan: Plan, fixtures: Fixture[], lamps: { cell: number[], spec: any }[],
 *   keySpots: { at: { r: number, u: number, f: number }, on: string, fixture?: number }[],
 *   side?: { door: number[], frame: any, room: number[] },
 * }} RoomContent
 */

// ---------------------------------------------------------------- the kinds of rooms
/** Sizes of the ordinary rooms (widths even), and how often each comes up. */
export const KINDS = {
  hall: { w: [6, 6], L: [14, 20], H: 5, weight: 3 },
  bedroom: { w: [10, 12], L: [11, 14], H: 5, weight: 3 },
  living: { w: [12, 12], L: [12, 15], H: 5, weight: 2 },
  dining: { w: [10, 12], L: [14, 17], H: 5, weight: 1 },
  office: { w: [10, 10], L: [10, 13], H: 5, weight: 2 },
  storage: { w: [10, 12], L: [12, 15], H: 5, weight: 1 },
  books: { w: [10, 12], L: [12, 15], H: 6, weight: 1 },
  kitchen: { w: [10, 10], L: [12, 14], H: 5, weight: 1 },
  closets: { w: [8, 10], L: [10, 12], H: 5, weight: 1 },
  lroom: { w: [8, 8], L: [16, 18], H: 5, weight: 2 },
  suite: { w: [14, 14], L: [16, 20], H: 6, weight: 1 },
};

/** The special rooms' sizes. */
export const SPECIAL = {
  reception: { w: 14, L: 16, H: 6 },
  shop: { w: 12, L: 12, H: 5 },
  infirmary: { w: 16, L: 20, H: 5 },
  courtyard: { w: 26, L: 22, H: 4 },
  greenhouse: { w: [12, 14], L: [14, 18], H: 6 },
};

/** @param {() => number} rng */
export function pickKind(rng, avoid) {
  const names = Object.keys(KINDS).filter((k) => k !== avoid);
  const total = names.reduce((s, k) => s + KINDS[k].weight, 0);
  let x = rng() * total;
  for (const k of names) {
    x -= KINDS[k].weight;
    if (x < 0) return k;
  }
  return names[0];
}

// ---------------------------------------------------------------- furniture
/** What each piece is: its entity, footprint (fw along the wall, dd out from it), collider and use. */
export const PIECES = {
  wardrobe: { type: "zt:wardrobe", fw: 1, dd: 1, col: B.collider, h: 3, hide: "closet" },
  bed: { type: "zt:hotel_bed", fw: 2, dd: 3, col: B.colliderLow, h: 1, hide: "bed", top: 0.6 },
  dresser: { type: "zt:dresser", fw: 2, dd: 1, col: B.collider, h: 1, style: 0, drawers: 3, top: 1.0 },
  nightstand: { type: "zt:dresser", fw: 1, dd: 1, col: B.colliderMid, h: 1, style: 1, drawers: 1, top: 0.75 },
  desk: { type: "zt:dresser", fw: 2, dd: 1, col: B.collider, h: 1, style: 2, drawers: 2, top: 1.0 },
  cabinet: { type: "zt:cabinet", fw: 1, dd: 1, col: B.collider, h: 2, drawers: 3, top: 2.0 },
  couch: { type: "zt:couch", fw: 3, dd: 1, col: B.colliderLow, h: 1, top: 0.55 },
};

const FACE_OF = { left: "r", right: "l", far: "b", near: "f" };

class Kit {
  /** @param {Frame} fr @param {FloorRoom} room @param {() => number} rng */
  constructor(fr, room, rng) {
    this.fr = fr;
    this.room = room;
    this.rng = rng;
    this.plan = new Plan();
    /** @type {Fixture[]} */
    this.fixtures = [];
    /** @type {{ cell: number[], spec: any }[]} */
    this.lamps = [];
    /** @type {RoomContent["keySpots"]} */
    this.keySpots = [];
    this.used = new Set();
    this.keep = new Set();
    this.boxes = room.boxes;
    this.style = room.style;
    this.paper = room.style === "abandoned" ? B.torn : (room.paper ?? B.wallpaper);
    this.lit = room.dark ? 0 : 1;
    /** @type {RoomContent["side"]} */
    this.side = undefined;
    /** @type {any} */
    this.receptionKey = undefined;
    /** @type {any} */
    this.shopSpot = undefined;
    /** @type {any} */
    this.pathPts = undefined;
    this.mid = 0;
  }

  get w() {
    return this.room.w;
  }

  get L() {
    return this.room.L;
  }

  get H() {
    return this.room.H;
  }

  get x0() {
    return Math.min(...this.boxes.map((b) => b[0]));
  }

  get x1() {
    return Math.max(...this.boxes.map((b) => b[1]));
  }

  get z1() {
    return this.room.L - 1;
  }

  get entryX() {
    return this.room.entryR - this.room.c;
  }

  get exitX() {
    return this.room.exitR - this.room.c;
  }

  rand(a, b) {
    return a + Math.floor(this.rng() * (b - a + 1));
  }

  chance(p) {
    return this.rng() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.rng() * arr.length)];
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---- local cells to frame cells
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
    return { r: this.R(x), u: this.U(y), f: this.F(z) };
  }

  box(x0, y0, z0, x1, y1, z1, block) {
    this.plan.box(this.R(x0), this.U(y0), this.F(z0), this.R(x1), this.U(y1), this.F(z1), block);
  }

  set(x, y, z, block) {
    this.plan.set(this.R(x), this.U(y), this.F(z), block);
  }

  // ---- what is where
  inRoom(x, z) {
    return this.boxes.some((b) => x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3]);
  }

  isFree(x, z) {
    const k = x + "," + z;
    return this.inRoom(x, z) && !this.used.has(k) && !this.keep.has(k);
  }

  areaFree(x0, z0, x1, z1) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) if (!this.isFree(x, z)) return false;
    }
    return true;
  }

  take(x0, z0, x1, z1) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) this.used.add(x + "," + z);
    }
  }

  keepClear(x0, z0, x1, z1) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) this.keep.add(x + "," + z);
    }
  }

  /** Keep a walkway clear from the way in to the way out: forward, across, forward. */
  walkway(zm) {
    const ex = this.entryX + 1;
    const xx = this.exitX + 1;
    const mid = zm ?? Math.floor(this.L / 2);
    const pts = [[ex, -0.5], [ex, mid], [xx, mid], [xx, this.L - 0.5]];
    this.pathPts = pts;
    for (let x = this.x0; x <= this.x1; x++) {
      for (let z = 0; z <= this.z1; z++) {
        const cx = x + 0.5;
        const cz = z + 0.5;
        for (let i = 1; i < pts.length; i++) {
          if (segDist(cx, cz, pts[i - 1], pts[i]) <= 1.25) {
            this.keep.add(x + "," + z);
            break;
          }
        }
      }
    }
    // the cells in front of both doors
    this.keepClear(this.entryX - 1, 0, this.entryX + 2, 1);
    this.keepClear(this.exitX - 1, this.z1 - 1, this.exitX + 2, this.z1);
    this.mid = mid;
  }

  // ---- shell
  /** Floor, walls (wainscot, paper, trim) and ceiling around every box, emptied inside. */
  shell(paper = this.paper, opts = {}) {
    const H = this.H;
    const floor = opts.floor ?? B.floor;
    const ceiling = opts.ceiling ?? B.ceiling;
    const wains = opts.wainscot ?? B.wainscot;
    const trim = opts.trim ?? B.trim;
    for (const b of this.boxes) {
      this.box(b[0] - 1, -1, b[2] - 1, b[1] + 1, H, b[3] + 1, wains);
      if (H > 3) this.box(b[0] - 1, 2, b[2] - 1, b[1] + 1, H - 2, b[3] + 1, paper);
      this.box(b[0] - 1, H - 1, b[2] - 1, b[1] + 1, H - 1, b[3] + 1, trim);
      this.box(b[0] - 1, -1, b[2] - 1, b[1] + 1, -1, b[3] + 1, floor);
      this.box(b[0] - 1, H, b[2] - 1, b[1] + 1, H, b[3] + 1, ceiling);
    }
    for (const b of this.boxes) this.box(b[0], 0, b[2], b[1], H - 1, b[3], B.air);
  }

  /** The doorways: in from the room before, out to the next. */
  doorways(opts = {}) {
    doorwayAt(this, this.entryX, -1, this.room.gateIn);
    if (!opts.noExit) doorwayAt(this, this.exitX, this.L, this.room.gateOut);
  }

  /** A red runner from door to door. */
  runner(block = B.carpet) {
    if (this.style === "abandoned" && this.chance(0.5)) block = "minecraft:brown_carpet";
    const pts = this.pathPts ?? [];
    for (const k of this.keep) {
      const [x, z] = k.split(",").map(Number);
      if (!this.inRoom(x, z)) continue;
      for (let i = 1; i < pts.length; i++) {
        if (segDist(x + 0.5, z + 0.5, pts[i - 1], pts[i]) <= 0.75) {
          this.set(x, 0, z, block);
          break;
        }
      }
    }
  }

  // ---- lights
  ceilingLamp(x, z) {
    const lit = this.style === "abandoned" && this.chance(0.2) ? 2 : this.lit;
    const spec = { id: B.lamp, states: { "zt:lit": lit } };
    this.set(x, this.H - 1, z, spec);
    this.lamps.push({ cell: [this.R(x), this.U(this.H - 1), this.F(z)], spec });
  }

  /** Ceiling lamps down the room, every `step` blocks (two rows in wide rooms). */
  ceilingLamps(step = 6) {
    for (const b of this.boxes) {
      const width = b[1] - b[0] + 1;
      const xs = width >= 12 ? [b[0] + Math.floor(width / 4), b[1] - Math.floor(width / 4)] : [Math.floor((b[0] + b[1]) / 2)];
      const len = b[3] - b[2] + 1;
      const n = Math.max(1, Math.round(len / step));
      for (let i = 0; i < n; i++) {
        const z = b[2] + Math.floor(((i + 0.5) * len) / n);
        for (const x of xs) this.ceilingLamp(x, z);
      }
    }
  }

  /** A lamp on a wall, facing into the room. side: "left" | "right" */
  wallLamp(side, z, y = 2) {
    const x = side === "left" ? this.x0 : this.x1;
    if (!this.inRoom(x, z)) return;
    const lit = this.style === "abandoned" && this.chance(0.25) ? 2 : this.lit;
    const spec = { id: B.sconce, states: { "zt:lit": lit, "minecraft:cardinal_direction": this.fr.cardinal(side === "left" ? "r" : "l") } };
    this.set(x, y, z, spec);
    this.lamps.push({ cell: [this.R(x), this.U(y), this.F(z)], spec });
  }

  // ---- furniture
  /**
   * Places along the walls where a piece fits: its cells, which way it faces, and its wall.
   * @returns {{ x0: number, x1: number, z0: number, z1: number, face: string, wall: string }[]}
   */
  wallSpots(fw, dd) {
    const out = [];
    for (let x = this.x0; x <= this.x1; x++) {
      for (let z = 0; z <= this.z1; z++) {
        // against the left wall: the piece runs along z
        if (!this.inRoom(x - 1, z)) out.push({ x0: x, x1: x + dd - 1, z0: z, z1: z + fw - 1, face: "r", wall: "left" });
        if (!this.inRoom(x + 1, z)) out.push({ x0: x - dd + 1, x1: x, z0: z, z1: z + fw - 1, face: "l", wall: "right" });
        if (!this.inRoom(x, z + 1)) out.push({ x0: x, x1: x + fw - 1, z0: z - dd + 1, z1: z, face: "b", wall: "far" });
        if (!this.inRoom(x, z - 1)) out.push({ x0: x, x1: x + fw - 1, z0: z, z1: z + dd - 1, face: "f", wall: "near" });
      }
    }
    return out.filter((s) => {
      if (!this.areaFree(s.x0, s.z0, s.x1, s.z1)) return false;
      // the whole back of the piece is against the wall
      if (s.wall === "left") return rangeAll(s.z0, s.z1, (z) => !this.inRoom(s.x0 - 1, z));
      if (s.wall === "right") return rangeAll(s.z0, s.z1, (z) => !this.inRoom(s.x1 + 1, z));
      if (s.wall === "far") return rangeAll(s.x0, s.x1, (x) => !this.inRoom(x, s.z1 + 1));
      return rangeAll(s.x0, s.x1, (x) => !this.inRoom(x, s.z0 - 1));
    });
  }

  /**
   * Put a piece of furniture against a wall (one of `walls` if given). Returns its fixture
   * index, or -1 if there was no room for it.
   * @param {keyof typeof PIECES} name
   */
  place(name, opts = {}) {
    const piece = PIECES[name];
    let spots = this.wallSpots(piece.fw, piece.dd);
    if (opts.walls) spots = spots.filter((s) => opts.walls.includes(s.wall));
    if (opts.near) spots = spots.filter((s) => Math.abs((s.z0 + s.z1) / 2 - opts.near.z) <= (opts.near.dz ?? 3) &&
      Math.abs((s.x0 + s.x1) / 2 - opts.near.x) <= (opts.near.dx ?? 3));
    if (!spots.length) return -1;
    const s = opts.first ? spots[0] : this.pick(spots);
    return this.put(name, s, opts);
  }

  /** Put a piece exactly at a spot (cells and facing). */
  put(name, s, opts = {}) {
    const piece = PIECES[name];
    this.take(s.x0, s.z0, s.x1, s.z1);
    const cells = [];
    for (let x = s.x0; x <= s.x1; x++) {
      for (let z = s.z0; z <= s.z1; z++) {
        for (let y = 0; y < piece.h; y++) {
          cells.push([this.R(x), this.U(y), this.F(z)]);
          this.set(x, y, z, piece.col);
        }
      }
    }
    const props = { ...(opts.props ?? {}) };
    if (piece.style !== undefined) props["zt:style"] = piece.style;
    if (name === "wardrobe") props["zt:style"] = opts.style ?? (this.room.kind === "greenhouse" ? 1 : 0);
    if (name === "bed") props["zt:style"] = opts.style ?? 0;
    if (name === "couch") props["zt:style"] = opts.style ?? (this.style === "abandoned" ? 2 : this.pick([0, 0, 1]));
    /** @type {Fixture} */
    const fx = {
      type: piece.type, face: s.face, props, cells, hide: piece.hide, drawers: piece.drawers, top: piece.top, spot: s,
      at: { r: this.R((s.x0 + s.x1 + 1) / 2), u: this.U(0), f: this.F((s.z0 + s.z1 + 1) / 2) },
    };
    this.fixtures.push(fx);
    const i = this.fixtures.length - 1;
    if (piece.top !== undefined) this.keySpots.push({ at: { ...fx.at, u: fx.at.u + piece.top }, on: name, fixture: i });
    if (piece.drawers) this.keySpots.push({ at: fx.at, on: "drawer", fixture: i });
    return i;
  }

  /** The cell in front of a placed piece's first cell (where a chair goes). @param {Fixture} fx */
  front(fx) {
    const s = fx.spot;
    if (fx.face === "r") return [s.x1 + 1, s.z0];
    if (fx.face === "l") return [s.x0 - 1, s.z0];
    if (fx.face === "f") return [s.x0, s.z1 + 1];
    return [s.x0, s.z0 - 1];
  }

  /** A decoration that is just an entity (flesh, an angel...). */
  prop(type, x, z, face, props = {}, y = 0) {
    this.fixtures.push({ type, face, props, at: { r: this.R(x + 0.5), u: this.U(y), f: this.F(z + 0.5) } });
    return this.fixtures.length - 1;
  }

  /** A potted plant in a free spot against a wall. */
  plant(near) {
    const spots = this.wallSpots(1, 1).filter((s) => !near || Math.abs(s.z0 - near.z) <= 2);
    if (!spots.length) return;
    const s = this.pick(spots);
    this.take(s.x0, s.z0, s.x1, s.z1);
    this.set(s.x0, 0, s.z0, { id: B.pot, states: { direction: 0 } });
    this.set(s.x0, 1, s.z0, this.chance(0.4) ? B.flowering : B.leaves);
  }

  /** A small table against a wall with candles or a lantern on it. */
  sideTable() {
    const spots = this.wallSpots(1, 1);
    if (!spots.length) return;
    const s = this.pick(spots);
    this.take(s.x0, s.z0, s.x1, s.z1);
    this.set(s.x0, 0, s.z0, slab(B.slab, true));
    if (this.style === "abandoned" && this.chance(0.4)) return;
    this.set(s.x0, 1, s.z0, this.chance(0.5) ? candles(this.rand(1, 3)) : lantern(false));
    this.keySpots.push({ at: { r: this.R(s.x0 + 0.5), u: this.U(1.0), f: this.F(s.z0 + 0.5) }, on: "table" });
  }

  /** A painting on a wall (a flat block in the cell against it), at head height. */
  painting() {
    for (let tries = 0; tries < 8; tries++) {
      const spots = this.wallSpots(1, 1);
      if (!spots.length) return;
      const s = this.pick(spots);
      if (s.wall === "near" || s.wall === "far") {
        const xs = [this.entryX - 1, this.entryX + 2, this.exitX - 1, this.exitX + 2];
        if (xs.some((x) => Math.abs(x - s.x0) <= 1)) continue;
      }
      const face = FACE_OF[s.wall];
      this.set(s.x0, 2, s.z0, { id: B.painting, states: { "minecraft:cardinal_direction": this.fr.cardinal(face),
        "zt:art": this.style === "abandoned" ? this.pick([0, 1, 4]) : this.rand(0, 3) } });
      return;
    }
  }

  /** A window (blind, with the curtains drawn) in a side wall. */
  window(side, z) {
    const x = side === "left" ? this.x0 - 1 : this.x1 + 1;
    this.box(x, 1, z, x, 2, z + 1, B.window);
  }

  /** A rug under part of the room. */
  rug(x0, z0, x1, z1, block) {
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) if (this.inRoom(x, z) && !this.used.has(x + "," + z)) this.set(x, 0, z, block);
    }
  }

  /** A free spot on the floor by a wall, for a key on the floor. */
  floorSpots(n = 2) {
    const spots = this.shuffle(this.wallSpots(1, 1)).slice(0, n);
    for (const s of spots) this.keySpots.push({ at: { r: this.R(s.x0 + 0.5), u: this.U(0), f: this.F(s.z0 + 0.5) }, on: "floor" });
  }

  /** The abandoned part of the hotel: flesh on the floor, cobwebs, knocked-over chairs. */
  abandon() {
    if (this.style !== "abandoned") return;
    const piles = this.rand(1, 3);
    for (let i = 0; i < piles; i++) {
      for (let tries = 0; tries < 10; tries++) {
        const x = this.rand(this.x0, this.x1);
        const z = this.rand(1, this.z1 - 1);
        if (!this.isFree(x, z)) continue;
        this.take(x, z, x, z);
        this.prop("zt:flesh_pile", x, z, this.pick(["f", "b", "l", "r"]), { "zt:style": this.rand(0, 2) });
        break;
      }
    }
    // cobwebs in the corners up by the ceiling
    for (const b of this.boxes) {
      for (const [x, z] of [[b[0], b[2]], [b[1], b[2]], [b[0], b[3]], [b[1], b[3]]]) {
        if (this.chance(0.5)) this.set(x, this.H - 1, z, "minecraft:web");
      }
    }
    // chairs on their backs
    const n = this.rand(1, 2);
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 10; tries++) {
        const x = this.rand(this.x0, this.x1);
        const z = this.rand(1, this.z1 - 1);
        if (!this.isFree(x, z)) continue;
        this.take(x, z, x, z);
        this.set(x, 0, z, stairs(this.fr, B.stairs, this.pick(["f", "b", "l", "r"]), true));
        break;
      }
    }
  }

  /** The room's content, ready to build. @returns {RoomContent} */
  done() {
    return { plan: this.plan, fixtures: this.fixtures, lamps: this.lamps, keySpots: this.keySpots, side: this.side };
  }
}

/** Distance from (x, z) to segment a-b. */
function segDist(x, z, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const L2 = dx * dx + dz * dz;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0;
  return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
}

function rangeAll(a, b, fn) {
  for (let i = a; i <= b; i++) if (!fn(i)) return false;
  return true;
}

/**
 * A 2-wide, 3-tall doorway in the near (z = -1) or far (z = L) wall at local x, framed in dark
 * wood (or stone, for the iron gates).
 * @param {Kit} k
 */
function doorwayAt(k, x, z, gate) {
  const frame = gate ? "minecraft:stone_bricks" : B.log;
  k.box(x - 1, 0, z, x + 2, 3, z, frame);
  if (!gate) k.box(x - 1, 3, z, x + 2, 3, z, pillar(k.fr, B.log, "r"));
  k.box(x, 0, z, x + 1, 2, z, B.air);
}

// ---------------------------------------------------------------- the ordinary rooms
/** @param {Kit} k */
function hall(k) {
  k.shell();
  k.doorways();
  k.walkway();
  k.runner();
  for (let z = 2; z <= k.z1 - 1; z += 5) {
    k.wallLamp("left", z);
    k.wallLamp("right", Math.min(k.z1, z + 2));
  }
  k.place("wardrobe");
  if (k.chance(0.6)) k.place("wardrobe");
  k.place("dresser");
  if (k.chance(0.5)) k.place("dresser");
  if (k.chance(0.5)) k.place("nightstand");
  k.sideTable();
  k.plant();
  if (k.chance(0.6)) k.plant();
  k.painting();
  k.painting();
  if (k.chance(0.5)) k.window(k.chance(0.5) ? "left" : "right", k.rand(2, k.z1 - 3));
  k.abandon();
  k.floorSpots();
}

/** @param {Kit} k */
function bedroom(k) {
  k.shell();
  k.doorways();
  k.walkway();
  const beds = k.chance(0.45) ? 2 : 1;
  for (let i = 0; i < beds; i++) {
    const b = k.place("bed", { walls: ["left", "right", "far"], props: {} });
    if (b < 0) continue;
    // a nightstand by the head of the bed
    const fx = k.fixtures[b];
    const x = fx.at.r - k.room.c;
    const z = fx.at.f - k.room.f0;
    k.place("nightstand", { near: { x, z, dx: 2.5, dz: 2.5 } });
  }
  k.place("wardrobe");
  if (k.chance(0.7)) k.place("wardrobe");
  k.place("dresser");
  k.rug(k.x0 + 2, 2, k.x1 - 2, k.z1 - 2, k.pick(["minecraft:red_carpet", "minecraft:brown_carpet", "minecraft:green_carpet"]));
  k.ceilingLamps(6);
  k.window(k.chance(0.5) ? "left" : "right", k.rand(2, k.z1 - 3));
  k.painting();
  if (k.chance(0.5)) k.plant();
  k.abandon();
  k.floorSpots();
}

/** @param {Kit} k */
function living(k) {
  k.shell(k.style === "abandoned" ? B.torn : k.pick([B.wallpaper, B.green, B.blue]));
  k.doorways();
  k.walkway();
  const couch = k.place("couch", { walls: ["left", "right"] });
  if (couch >= 0) {
    // a low table in front of the couch, and an armchair at each end
    const fx = k.fixtures[couch];
    const x = Math.round(fx.at.r - k.room.c - 0.5);
    const z = Math.round(fx.at.f - k.room.f0 - 0.5);
    const dir = fx.face === "r" ? 1 : -1;
    const tx = x + dir * 2;
    if (k.areaFree(tx, z - 1, tx, z + 1)) {
      k.take(tx, z - 1, tx, z + 1);
      k.box(tx, 0, z - 1, tx, 0, z + 1, slab(B.slab, false));
      k.set(tx, 1, z, candles(2));
      k.keySpots.push({ at: { r: k.R(tx + 0.5), u: k.U(0.5), f: k.F(z + 0.5) }, on: "table" });
    }
    for (const dz of [-2, 2]) {
      if (k.areaFree(tx, z + dz, tx, z + dz)) {
        k.take(tx, z + dz, tx, z + dz);
        k.set(tx, 0, z + dz, stairs(k.fr, B.stairs, dz < 0 ? "b" : "f"));
      }
    }
  }
  if (k.chance(0.5)) k.place("couch", { walls: ["far", "near"] });
  k.place("wardrobe");
  if (k.chance(0.6)) k.place("wardrobe");
  k.place("dresser");
  // a bookcase
  const spots = k.wallSpots(2, 1);
  if (spots.length) {
    const s = k.pick(spots);
    k.take(s.x0, s.z0, s.x1, s.z1);
    k.box(s.x0, 0, s.z0, s.x1, 2, s.z1, B.shelf);
  }
  k.rug(k.x0 + 2, 3, k.x1 - 2, k.z1 - 3, "minecraft:red_carpet");
  k.ceilingLamps(6);
  k.plant();
  k.plant();
  k.painting();
  k.painting();
  k.abandon();
  k.floorSpots();
}

/** @param {Kit} k */
function dining(k) {
  k.shell(k.style === "abandoned" ? B.torn : k.pick([B.wallpaper, B.green]));
  k.doorways();
  k.walkway();
  // the long table on whichever side is clear, with chairs all along it
  const len = Math.min(6, k.L - 6);
  for (const tx of k.shuffle([k.x0 + 2, k.x1 - 3])) {
    if (!k.areaFree(tx - 1, 3, tx + 2, 3 + len - 1)) continue;
    k.take(tx - 1, 3, tx + 2, 3 + len - 1);
    k.box(tx, 0, 3, tx + 1, 0, 3 + len - 1, slab(B.slab, true));
    for (let z = 3; z < 3 + len; z += 2) {
      k.set(tx - 1, 0, z, stairs(k.fr, B.stairs, "l"));
      k.set(tx + 2, 0, z, stairs(k.fr, B.stairs, "r"));
    }
    for (let z = 4; z < 3 + len; z += 3) k.set(tx, 1, z, candles(3));
    k.keySpots.push({ at: { r: k.R(tx + 1), u: k.U(1.0), f: k.F(3 + len / 2) }, on: "table" });
    k.fixtures.push({ type: "zt:chandelier", face: "f", props: {}, at: { r: k.R(tx + 1), u: k.U(k.H - 1.75), f: k.F(3 + len / 2) }, tag: "deco" });
    break;
  }
  k.place("dresser", { walls: ["far", "near", "left", "right"] });
  k.place("wardrobe");
  if (k.chance(0.5)) k.place("wardrobe");
  if (k.chance(0.5)) k.place("dresser");
  k.ceilingLamps(6);
  k.plant();
  k.painting();
  k.painting();
  k.abandon();
  k.floorSpots();
}

/** @param {Kit} k */
function office(k) {
  k.shell(k.style === "abandoned" ? B.torn : B.blue);
  k.doorways();
  k.walkway();
  for (let i = 0; i < 2; i++) {
    const d = k.place("desk", { walls: ["left", "right", "far"] });
    if (d < 0) continue;
    // a chair at the desk
    const fx = k.fixtures[d];
    const [cx, cz] = k.front(fx);
    if (k.areaFree(cx, cz, cx, cz)) {
      k.take(cx, cz, cx, cz);
      k.set(cx, 0, cz, stairs(k.fr, B.stairs, fx.face));
    }
  }
  k.place("cabinet");
  if (k.chance(0.5)) k.place("cabinet");
  k.place("wardrobe");
  const spots = k.wallSpots(3, 1);
  if (spots.length) {
    const s = k.pick(spots);
    k.take(s.x0, s.z0, s.x1, s.z1);
    k.box(s.x0, 0, s.z0, s.x1, 2, s.z1, B.shelf);
  }
  k.ceilingLamps(6);
  k.plant();
  k.painting();
  k.abandon();
  k.floorSpots();
}

/** @param {Kit} k */
function storage(k) {
  k.shell(k.style === "abandoned" ? B.torn : B.wallpaper);
  k.doorways();
  k.walkway();
  // stacks of crates and barrels, and wooden shelving
  const stacks = k.rand(4, 7);
  for (let i = 0; i < stacks; i++) {
    const spots = k.wallSpots(1, 1);
    if (!spots.length) break;
    const s = k.pick(spots);
    k.take(s.x0, s.z0, s.x1, s.z1);
    const hgt = k.rand(1, 2);
    for (let y = 0; y < hgt; y++) k.set(s.x0, y, s.z0, k.chance(0.7) ? B.crate : { id: "minecraft:barrel", states: { facing_direction: 1, open_bit: false } });
    k.keySpots.push({ at: { r: k.R(s.x0 + 0.5), u: k.U(hgt), f: k.F(s.z0 + 0.5) }, on: "crate" });
  }
  for (let i = 0; i < 2; i++) {
    const spots = k.wallSpots(2, 1);
    if (!spots.length) break;
    const s = k.pick(spots);
    k.take(s.x0, s.z0, s.x1, s.z1);
    for (let y = 0; y <= 2; y++) k.box(s.x0, y, s.z0, s.x1, y, s.z1, slab(B.slab, true));
  }
  k.place("wardrobe");
  if (k.chance(0.6)) k.place("wardrobe");
  if (k.chance(0.5)) k.place("cabinet");
  k.ceilingLamps(8);
  k.abandon();
  k.floorSpots();
}

/** @param {Kit} k */
function books(k) {
  k.shell(B.green);
  k.doorways();
  k.walkway();
  // bookcases along the walls, three high
  for (let i = 0; i < 5; i++) {
    const spots = k.wallSpots(3, 1);
    if (!spots.length) break;
    const s = k.pick(spots);
    k.take(s.x0, s.z0, s.x1, s.z1);
    k.box(s.x0, 0, s.z0, s.x1, 2, s.z1, B.shelf);
  }
  // a reading table
  for (let tries = 0; tries < 12; tries++) {
    const x = k.rand(k.x0 + 1, k.x1 - 2);
    const z = k.rand(2, k.z1 - 2);
    if (!k.areaFree(x - 1, z - 1, x + 2, z + 1)) continue;
    k.take(x - 1, z - 1, x + 2, z + 1);
    k.box(x, 0, z, x + 1, 0, z, slab(B.slab, true));
    k.set(x, 1, z, candles(2));
    k.set(x - 1, 0, z, stairs(k.fr, B.stairs, "l"));
    k.set(x + 2, 0, z, stairs(k.fr, B.stairs, "r"));
    k.keySpots.push({ at: { r: k.R(x + 1.5), u: k.U(1.0), f: k.F(z + 0.5) }, on: "table" });
    break;
  }
  k.place("wardrobe");
  k.place("dresser");
  k.ceilingLamps(6);
  k.plant();
  k.abandon();
  k.floorSpots();
}

/** @param {Kit} k */
function kitchen(k) {
  k.shell(k.style === "abandoned" ? B.torn : B.blue, { floor: "minecraft:polished_andesite" });
  k.doorways();
  k.walkway();
  // a counter along one wall: cupboards with a stone top, the stove and the sink in it
  for (const wall of k.shuffle(["left", "right"])) {
    const run = k.wallSpots(1, 1).filter((s) => s.wall === wall).sort((a, b) => a.z0 - b.z0);
    const cells = run.filter((s) => s.z0 >= 2 && s.z0 <= k.z1 - 2);
    if (cells.length < 4) continue;
    const start = k.rand(0, cells.length - 4);
    const take = cells.slice(start, start + Math.min(6, cells.length - start));
    take.forEach((s, i) => {
      k.take(s.x0, s.z0, s.x1, s.z1);
      const block = i === 1 ? { id: "minecraft:smoker", states: { "minecraft:cardinal_direction": k.fr.cardinal(s.face === "r" ? "l" : "r") } }
        : i === 3 ? { id: "minecraft:cauldron", states: {} } : B.planks;
      k.set(s.x0, 0, s.z0, block);
      if (i !== 1 && i !== 3) k.set(s.x0, 1, s.z0, i % 2 ? "minecraft:smooth_stone_slab" : candles(1));
    });
    break;
  }
  // the fridge
  const fs = k.wallSpots(1, 1);
  if (fs.length) {
    const s = k.pick(fs);
    k.take(s.x0, s.z0, s.x1, s.z1);
    k.box(s.x0, 0, s.z0, s.x0, 1, s.z0, "minecraft:iron_block");
  }
  k.place("desk", { props: {} });
  k.place("cabinet");
  k.place("wardrobe");
  k.ceilingLamps(6);
  k.abandon();
  k.floorSpots();
}

/** @param {Kit} k */
function closets(k) {
  k.shell();
  k.doorways();
  k.walkway();
  const n = k.rand(4, 6);
  for (let i = 0; i < n; i++) k.place("wardrobe");
  k.place("dresser");
  k.ceilingLamps(6);
  k.painting();
  k.abandon();
  k.floorSpots();
}

/** An L-shaped room: the way on is off to one side. @param {Kit} k */
function lroom(k) {
  k.shell();
  k.doorways();
  k.walkway(k.room.turnZ);
  k.runner();
  for (const b of k.boxes) {
    const x = Math.floor((b[0] + b[1]) / 2);
    for (let z = b[2] + 2; z <= b[3]; z += 6) k.ceilingLamp(x, z);
  }
  k.place("wardrobe");
  k.place("wardrobe");
  k.place("dresser");
  if (k.chance(0.5)) k.place("nightstand");
  k.plant();
  k.painting();
  k.painting();
  k.sideTable();
  k.abandon();
  k.floorSpots();
}

/** A grand suite: pillars, a bed, a sitting area. @param {Kit} k */
function suite(k) {
  k.shell(k.style === "abandoned" ? B.torn : B.green);
  k.doorways();
  k.walkway();
  for (const x of [k.x0 + 3, k.x1 - 3]) {
    for (const z of [4, k.z1 - 4]) {
      if (!k.isFree(x, z)) continue;
      k.take(x, z, x, z);
      k.box(x, 0, z, x, k.H - 1, z, pillar(k.fr, B.log, "u"));
    }
  }
  k.place("bed", { walls: ["left", "right"] });
  k.place("nightstand");
  k.place("couch");
  k.place("wardrobe");
  k.place("wardrobe");
  k.place("dresser");
  if (k.chance(0.5)) k.place("desk");
  k.rug(k.x0 + 1, 2, k.x1 - 1, k.z1 - 2, "minecraft:red_carpet");
  k.ceilingLamps(6);
  k.plant();
  k.plant();
  k.painting();
  k.painting();
  k.window("left", k.rand(3, k.z1 - 4));
  k.window("right", k.rand(3, k.z1 - 4));
  k.abandon();
  k.floorSpots();
}

// ---------------------------------------------------------------- the special rooms
/**
 * Room 0, the reception: the elevator you arrive in behind you, the front desk on the right
 * with the key to door 1 hanging on the wall behind it, couches, plants and a chandelier.
 * @param {Kit} k
 */
function reception(k) {
  k.shell(B.green);
  // the elevator: a little car behind the near wall
  const car = [-2, 1, -5, -2];
  k.box(car[0] - 1, -1, car[2] - 1, car[1] + 1, 4, car[3] + 1, "zt:elevator_panel");
  k.box(car[0] - 1, -1, car[2] - 1, car[1] + 1, -1, car[3] + 1, B.planks);
  k.box(car[0] - 1, 4, car[2] - 1, car[1] + 1, 4, car[3] + 1, B.ceiling);
  k.box(car[0], 0, car[2], car[1], 3, car[3], B.air);
  k.set(-1, 3, -4, { id: B.lamp, states: { "zt:lit": 1 } });
  k.box(-1, 0, -1, 0, 2, -1, B.air);
  k.box(-2, 3, -1, 1, 3, -1, "zt:elevator_panel");
  k.doorways({ noExit: false });
  // entry doorway was cut by doorways(); put the elevator's frame back around it
  k.box(-2, 0, -1, -2, 3, -1, "zt:elevator_panel");
  k.box(1, 0, -1, 1, 3, -1, "zt:elevator_panel");
  k.walkway();
  k.runner();
  // the front desk: a counter along the right, the clerk's side behind it
  const dx = k.x1 - 3;
  for (let z = 5; z <= 10; z++) k.set(dx, 0, z, B.planks);
  k.box(dx, 1, 5, dx, 1, 10, slab(B.slab, false));
  k.box(dx + 1, 0, 10, k.x1, 0, 10, B.planks);
  k.box(dx + 1, 1, 10, k.x1, 1, 10, slab(B.slab, false));
  k.take(dx, 5, k.x1, 10);
  k.set(dx, 2, 7, lantern(false));
  k.set(dx, 2, 9, candles(1));
  // a key rack on the wall behind the desk, the key for door 1 on it
  k.set(k.x1, 2, 8, { id: B.painting, states: { "minecraft:cardinal_direction": k.fr.cardinal("l"), "zt:art": 3 } });
  // (the key's model hangs 3/16 of a block behind the entity, against the rack; its tap box reaches out
  // into the room so it can be taken from behind the desk)
  k.receptionKey = { r: k.R(k.x1 + 0.72), u: k.U(2.0), f: k.F(8.5) };
  // couches facing each other on the left, a low table between them
  if (k.areaFree(k.x0, 4, k.x0, 6)) k.put("couch", { x0: k.x0, x1: k.x0, z0: 4, z1: 6, face: "r", wall: "left" }, { style: 1 });
  k.box(k.x0 + 2, 0, 4, k.x0 + 2, 0, 6, slab(B.slab, false));
  k.take(k.x0 + 2, 4, k.x0 + 2, 6);
  k.set(k.x0 + 2, 1, 5, candles(3));
  for (const z of [3, 7]) {
    k.set(k.x0 + 1, 0, z, stairs(k.fr, B.stairs, z < 5 ? "b" : "f"));
    k.take(k.x0 + 1, z, k.x0 + 1, z);
  }
  k.place("wardrobe", { walls: ["left"] });
  k.place("dresser", { walls: ["near", "left"] });
  for (const [x, z] of [[k.x0, 0], [k.x1, 0], [k.x0, k.z1], [k.x1, k.z1]]) {
    if (!k.isFree(x, z)) continue;
    k.take(x, z, x, z);
    k.set(x, 0, z, { id: B.pot, states: { direction: 0 } });
    k.set(x, 1, z, B.flowering);
  }
  k.rug(k.x0 + 1, 2, k.x1 - 4, k.z1 - 2, "minecraft:red_carpet");
  k.fixtures.push({ type: "zt:chandelier", face: "f", props: {}, at: { r: k.R(0), u: k.U(k.H - 1.75), f: k.F(8) }, tag: "deco" });
  k.ceilingLamp(-4, 3);
  k.ceilingLamp(3, 3);
  k.ceilingLamp(-4, 12);
  k.ceilingLamp(3, 12);
  k.wallLamp("left", 10);
  k.painting();
  k.painting();
  k.floorSpots();
}

/**
 * Room 52, Jeff's shop: a counter down the left with Jeff in the dark behind it, El Goblino
 * on the counter, Bob in his chair, and what's for sale laid out.
 * @param {Kit} k
 */
function shop(k) {
  k.shell(B.blue);
  k.doorways();
  k.walkway();
  k.runner();
  const cx = k.x0 + 2;
  for (let z = 3; z <= 8; z++) k.set(cx, 0, z, B.planks);
  k.box(cx, 1, 3, cx, 1, 8, slab(B.slab, false));
  k.take(k.x0, 2, cx, 9);
  // shelves of stock behind Jeff
  k.box(k.x0, 0, 2, k.x0, 2, 3, B.shelf);
  k.box(k.x0, 0, 8, k.x0, 2, 9, B.shelf);
  k.set(k.x0, 0, 5, { id: "minecraft:barrel", states: { facing_direction: 1, open_bit: false } });
  k.prop("zt:jeff", k.x0 + 1, 5, "r");
  k.prop("zt:shop_display", cx, 5, "r", {}, 1.5);
  k.prop("zt:el_goblino", cx, 7, "r", {}, 1.5);
  // Bob, in his chair by the far wall
  const bx = k.x1 - 1;
  k.take(bx - 1, k.z1 - 3, k.x1, k.z1);
  k.prop("zt:bob", bx, k.z1 - 2, "l");
  k.set(bx + 1, 0, k.z1 - 3, slab(B.slab, true));
  k.set(bx + 1, 1, k.z1 - 3, candles(1));
  k.place("wardrobe", { walls: ["right"] });
  k.set(k.x1, 2, 4, { id: B.painting, states: { "minecraft:cardinal_direction": k.fr.cardinal("l"), "zt:art": 5 } });
  // only the right side is lit: Jeff stays in the shadows
  k.ceilingLamp(k.x1 - 2, 3);
  k.ceilingLamp(k.x1 - 2, k.z1 - 2);
  k.shopSpot = { counter: k.at(cx + 0.5, 1, 5.5) };
}

/**
 * Room 80, the infirmary: hospital beds in curtained bays down both sides, medicine cabinets,
 * and a side room behind a skull lock with the Herb of Viridis and drawers full of gold.
 * @param {Kit} k
 */
function infirmary(k) {
  k.shell(B.hospitalWall, { floor: B.hospitalFloor, wainscot: B.hospitalWall, trim: "minecraft:smooth_quartz" });
  k.doorways();
  k.walkway();
  // the side room's door in the right wall, toward the far end
  const sz = k.z1 - 7;
  k.keepClear(k.x1 - 2, sz - 1, k.x1, sz + 2);
  // bays: a bed with its head at the wall and a curtain between each
  for (const wall of ["left", "right"]) {
    const x = wall === "left" ? k.x0 : k.x1 - 2;
    for (let z = 2; z + 1 <= k.z1 - 2; z += 4) {
      if (!k.areaFree(x, z, x + 2, z + 1)) continue;
      k.put("bed", { x0: x, x1: x + 2, z0: z, z1: z + 1, face: wall === "left" ? "r" : "l", wall }, { style: 1 });
      const cz = z + 2;
      if (k.areaFree(x, cz, x + 2, cz)) {
        k.take(x, cz, x + 2, cz);
        k.box(x, 0, cz, x + 2, 2, cz, { id: B.curtain, states: { "minecraft:cardinal_direction": k.fr.cardinal("f") } });
      }
    }
  }
  k.place("cabinet", { walls: ["far", "near"] });
  k.place("cabinet", { walls: ["far", "near"] });
  k.place("wardrobe");
  k.place("desk", { walls: ["far", "near"] });
  for (let z = 2; z <= k.z1; z += 6) {
    k.ceilingLamp(-3, z);
    k.ceilingLamp(2, z);
  }
  // the side room beyond the right wall: 5 x 6, its door in the wall (no number on it)
  const s0 = k.x1 + 2;
  const room = [s0, s0 + 4, sz - 2, sz + 3];
  k.box(room[0] - 1, -1, room[2] - 1, room[1] + 1, 4, room[3] + 1, B.hospitalWall);
  k.box(room[0] - 1, -1, room[2] - 1, room[1] + 1, -1, room[3] + 1, B.hospitalFloor);
  k.box(room[0] - 1, 4, room[2] - 1, room[1] + 1, 4, room[3] + 1, B.ceiling);
  k.box(room[0], 0, room[2], room[1], 3, room[3], B.air);
  // its doorway through the shared wall (column x1 + 1), rows sz..sz+1
  k.box(k.x1 + 1, 0, sz - 1, k.x1 + 1, 3, sz + 2, "minecraft:smooth_quartz");
  k.box(k.x1 + 1, 0, sz, k.x1 + 1, 2, sz + 1, B.air);
  // the herb on a little table, cabinets of gold along the far side
  k.set(room[1], 0, sz, slab(B.slab, true));
  k.fixtures.push({ type: "zt:herb_plant", face: "l", props: {}, at: { r: k.R(room[1] + 0.5), u: k.U(1.0), f: k.F(sz + 0.5) }, tag: "herb" });
  for (const z of [room[2], room[3]]) {
    const i = k.put("cabinet", { x0: room[1], x1: room[1], z0: z, z1: z, face: "l", wall: "right" });
    k.fixtures[i].tag = "rich";
  }
  k.set(room[0] + 1, 3, sz, { id: B.lamp, states: { "zt:lit": 1 } });
  k.lamps.push({ cell: [k.R(room[0] + 1), k.U(3), k.F(sz)], spec: { id: B.lamp, states: { "zt:lit": 1 } } });
  k.side = { door: [k.R(k.x1 + 1), k.U(0), k.F(sz)], frame: "r", room: [k.R(room[0]), k.R(room[1]), k.F(room[2]), k.F(room[3])] };
  k.floorSpots();
}

/**
 * Room 89, the courtyard: a covered stone walkway from gate to gate with lanterns, and down
 * two little staircases in the middle, gardens on both sides with graves and an angel statue,
 * under the open sky.
 * @param {Kit} k
 */
function courtyard(k) {
  const W = 2;            // the walkway's half-width
  const x0 = k.x0;
  const x1 = k.x1;
  const z1 = k.z1;
  const top = 8;
  // the walls all round, tall, and the ground
  k.box(x0 - 1, -4, -1, x1 + 1, top, z1 + 1, "minecraft:stone_bricks");
  k.box(x0, -3, 0, x1, -3, z1, "minecraft:dirt");
  k.box(x0, -2, 0, x1, top, z1, B.air);
  k.box(x0, -3, 0, x1, -3, z1, "minecraft:grass_block");
  // the walkway: raised stone, a roof on posts, railings except at the stairs
  k.box(-W - 1, -2, 0, W, -1, z1, "minecraft:stone_bricks");
  k.box(-W - 1, -1, 0, W, -1, z1, "minecraft:polished_andesite");
  k.box(-W - 2, 4, 0, W + 1, 4, z1, slab(B.slab, false));
  k.box(-W - 1, 5, 0, W, 5, z1, B.planks);
  const mid = Math.floor(z1 / 2);
  for (let z = 0; z <= z1; z++) {
    const stair = z >= mid - 1 && z <= mid + 1;
    for (const x of [-W - 1, W]) {
      if (z % 4 === 0) k.box(x, 0, z, x, 3, z, pillar(k.fr, B.log, "u"));
      else if (!stair) k.set(x, 0, z, joined(k.fr, B.fence, ["f", "b"]));
    }
    if (z % 4 === 2) {
      k.set(-1, 3, z, pillar(k.fr, "minecraft:iron_chain", "u"));
      k.set(-1, 2, z, lantern(true));
    }
  }
  // the little staircases down into the gardens, left and right
  for (let z = mid - 1; z <= mid + 1; z++) {
    k.set(-W - 1, -1, z, stairs(k.fr, "minecraft:stone_brick_stairs", "r"));
    k.set(-W - 2, -2, z, stairs(k.fr, "minecraft:stone_brick_stairs", "r"));
    k.set(W, -1, z, stairs(k.fr, "minecraft:stone_brick_stairs", "l"));
    k.set(W + 1, -2, z, stairs(k.fr, "minecraft:stone_brick_stairs", "l"));
  }
  // gardens: paths of gravel, graves in rows, flowers, hedges, lanterns on posts
  const rng = k.rng;
  for (const side of [-1, 1]) {
    const gx0 = side < 0 ? x0 : W + 3;
    const gx1 = side < 0 ? -W - 4 : x1;
    for (let z = 0; z <= z1; z++) {
      for (let x = gx0; x <= gx1; x++) {
        const edge = x === gx0 || x === gx1 || z === 0 || z === z1;
        if (Math.abs(z - mid) <= 1) continue;
        if (edge && rng() < 0.7) {
          k.set(x, -2, z, B.oakLeaves);
          if (rng() < 0.4) k.set(x, -1, z, B.oakLeaves);
        } else if (rng() < 0.18) k.set(x, -2, z, k.pick(["minecraft:short_grass", "minecraft:poppy", "minecraft:dandelion", "minecraft:fern"]));
      }
    }
    // a gravel path to the stairs
    for (let x = Math.min(gx0, gx1) + 1; x <= Math.max(gx0, gx1) - 1; x++) k.set(x, -3, mid, "minecraft:gravel");
    // graves
    for (let z = 3; z <= z1 - 3; z += 3) {
      if (Math.abs(z - mid) <= 1) continue;
      for (let x = Math.min(gx0, gx1) + 2; x <= Math.max(gx0, gx1) - 2; x += 3) {
        if (rng() < 0.25) continue;
        k.set(x, -2, z, { id: rng() < 0.5 ? "minecraft:stone_brick_wall" : "minecraft:mossy_stone_brick_wall", states: { wall_post_bit: true } });
        k.set(x, -3, z + 1, "minecraft:coarse_dirt");
        k.set(x, -2, z + 1, B.air);
      }
    }
    // a lantern post
    const lx = side < 0 ? gx1 - 1 : gx0 + 1;
    k.box(lx, -2, 2, lx, -1, 2, joined(k.fr, B.fence, []));
    k.set(lx, 0, 2, lantern(false));
  }
  // the angel, on a plinth in the left garden
  const ax = Math.floor((x0 + (-W - 4)) / 2);
  k.box(ax, -2, mid + 4, ax, -2, mid + 4, "minecraft:chiseled_stone_bricks");
  k.fixtures.push({ type: "zt:angel_statue", face: "r", props: {}, at: { r: k.R(ax + 0.5), u: k.U(-1), f: k.F(mid + 4.5) }, tag: "deco" });
  // the gates in and out
  k.doorways();
  k.keepClear(-W, 0, W - 1, z1);
}

/**
 * Rooms 90-99, the greenhouse: brick walls with tall windows under a glass roof, beds of plants
 * either side of a brick path, wooden closets along it, and no lights at all.
 * @param {Kit} k
 */
function greenhouse(k) {
  const H = k.H;
  for (const b of k.boxes) {
    k.box(b[0] - 1, -2, b[2] - 1, b[1] + 1, H, b[3] + 1, "minecraft:brick_block");
    k.box(b[0] - 1, -2, b[2] - 1, b[1] + 1, -2, b[3] + 1, "minecraft:dirt");
    k.box(b[0], -1, b[2], b[1], -1, b[3], "minecraft:grass_block");
    // tall windows in the side walls between brick piers
    for (let z = b[2]; z <= b[3]; z++) {
      if (z % 3 === 0) continue;
      for (const x of [b[0] - 1, b[1] + 1]) k.box(x, 1, z, x, H - 2, z, joined(k.fr, "minecraft:glass_pane", ["f", "b"]));
    }
    // a glass roof (tinted: it keeps the night in) on dark beams
    k.box(b[0] - 1, H, b[2] - 1, b[1] + 1, H, b[3] + 1, "minecraft:tinted_glass");
    for (let z = b[2]; z <= b[3]; z += 3) k.box(b[0] - 1, H, z, b[1] + 1, H, z, pillar(k.fr, B.log, "r"));
    k.box(b[0], 0, b[2], b[1], H - 1, b[3], B.air);
  }
  k.doorways();
  k.walkway();
  // the brick path, set into the ground
  for (const key of k.keep) {
    const [x, z] = key.split(",").map(Number);
    if (k.inRoom(x, z)) k.set(x, -1, z, "minecraft:brick_block");
  }
  // wooden closets along the path
  const n = k.rand(2, 3);
  for (let i = 0; i < n; i++) k.place("wardrobe", { style: 1 });
  if (k.chance(0.5)) k.place("cabinet");
  // plants everywhere else: bushes, ferns, tall grass, flowers, planters
  for (let x = k.x0; x <= k.x1; x++) {
    for (let z = 0; z <= k.z1; z++) {
      if (!k.isFree(x, z)) continue;
      const roll = k.rng();
      if (roll < 0.16) {
        k.set(x, 0, z, B.leaves);
        if (k.rng() < 0.5) k.set(x, 1, z, k.rng() < 0.5 ? B.flowering : B.leaves);
        k.take(x, z, x, z);
      } else if (roll < 0.26) {
        k.set(x, 0, z, { id: "minecraft:tall_grass", states: { upper_block_bit: false } });
        k.set(x, 1, z, { id: "minecraft:tall_grass", states: { upper_block_bit: true } });
      } else if (roll < 0.5) k.set(x, 0, z, k.pick(["minecraft:short_grass", "minecraft:fern", "minecraft:short_grass", "minecraft:poppy"]));
    }
  }
  k.floorSpots();
}

const TEMPLATES = { hall, bedroom, living, dining, office, storage, books, kitchen, closets, lroom, suite, reception, shop, infirmary,
  courtyard, greenhouse };

/**
 * The blocks and things of one room.
 * @param {Frame} fr @param {FloorRoom} room @param {() => number} rng
 * @returns {RoomContent & { receptionKey?: any, shopSpot?: any }}
 */
export function roomContent(fr, room, rng) {
  const k = new Kit(fr, room, rng);
  const t = TEMPLATES[room.kind] ?? hall;
  t(k);
  const out = k.done();
  return Object.assign(out, { receptionKey: k.receptionKey, shopSpot: k.shopSpot });
}

/** The frame box a room's blocks take up (walls included): [r0, u0, f0, r1, u1, f1]. @param {FloorRoom} room */
export function roomBox(room) {
  let r0 = Infinity;
  let r1 = -Infinity;
  for (const b of room.boxes) {
    r0 = Math.min(r0, b[0]);
    r1 = Math.max(r1, b[1]);
  }
  const lo = room.c + r0 - 1;
  let hi = room.c + r1 + 1;
  if (room.kind === "infirmary") hi += 7;
  const back = room.kind === "reception" ? 6 : 1;
  const below = room.kind === "courtyard" ? 4 : room.kind === "greenhouse" ? 2 : 1;
  const above = room.kind === "courtyard" ? 8 : room.H;
  return [lo, room.u0 - below, room.f0 - back, hi, room.u0 + above, room.f1 + 1];
}
