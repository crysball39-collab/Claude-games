// Doors structures: a local frame (r = to the right, u = up, f = forward, in blocks) laid
// on the world in one of the four cardinal directions, a plan of block operations in that
// frame, and a job that builds a plan a few operations per tick.
import { BlockPermutation, BlockVolume, system } from "@minecraft/server";

/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {string | { id: string, states?: Record<string, string | number | boolean> }} BlockSpec */

const AXES = [
  { F: { x: 0, z: 1 }, R: { x: -1, z: 0 } }, // yaw 0: facing south
  { F: { x: -1, z: 0 }, R: { x: 0, z: -1 } }, // yaw 90: facing west
  { F: { x: 0, z: -1 }, R: { x: 1, z: 0 } }, // yaw 180: facing north
  { F: { x: 1, z: 0 }, R: { x: 0, z: 1 } }, // yaw 270: facing east
];

/** @param {{x: number, z: number}} v */
function cardinalOf(v) {
  if (v.x > 0.5) return "east";
  if (v.x < -0.5) return "west";
  if (v.z > 0.5) return "south";
  return "north";
}

export class Frame {
  /** @param {Dimension} dim @param {Vector3} origin a block corner @param {number} yaw any angle; snapped to 90s */
  constructor(dim, origin, yaw) {
    this.dim = dim;
    this.o = { x: Math.floor(origin.x), y: Math.floor(origin.y), z: Math.floor(origin.z) };
    const q = (((Math.round(yaw / 90) % 4) + 4) % 4);
    this.yaw = q * 90;
    this.F = AXES[q].F;
    this.R = AXES[q].R;
  }

  /** A point in the frame (continuous) as a world location. */
  at(r, u, f) {
    return { x: this.o.x + r * this.R.x + f * this.F.x, y: this.o.y + u, z: this.o.z + r * this.R.z + f * this.F.z };
  }

  /** The world block of cell (r, u, f). */
  cell(r, u, f) {
    const p = this.at(r + 0.5, u, f + 0.5);
    return { x: Math.floor(p.x), y: this.o.y + u, z: Math.floor(p.z) };
  }

  /** The middle of cell (r, f), at height u: where an entity stands in it. */
  mid(r, u, f) {
    return this.at(r + 0.5, u, f + 0.5);
  }

  /** A world location in frame coordinates. @param {Vector3} p */
  local(p) {
    const dx = p.x - this.o.x;
    const dz = p.z - this.o.z;
    return { r: dx * this.R.x + dz * this.R.z, u: p.y - this.o.y, f: dx * this.F.x + dz * this.F.z };
  }

  /** World yaw of a frame direction: "f" forward, "b" back, "r" right, "l" left. */
  yawOf(dir) {
    return { f: this.yaw, b: this.yaw + 180, r: this.yaw + 90, l: this.yaw - 90 }[dir];
  }

  /** World unit vector of a frame direction. */
  vec(dir) {
    const v = { f: this.F, b: { x: -this.F.x, z: -this.F.z }, r: this.R, l: { x: -this.R.x, z: -this.R.z } }[dir];
    return { x: v.x, y: 0, z: v.z };
  }

  /** Compass name of a frame direction ("north", ...). */
  cardinal(dir) {
    return cardinalOf(this.vec(dir));
  }
}

// ---------------------------------------------------------------- block specs
const WEIRDO = { east: 0, west: 1, south: 2, north: 3 };

/** Stairs that climb toward frame direction `dir`. @param {Frame} fr */
export function stairs(fr, id, dir, upsideDown = false) {
  return { id, states: { weirdo_direction: WEIRDO[fr.cardinal(dir)], upside_down_bit: upsideDown } };
}

/** A log or chain lying along frame direction `dir` ("f"/"r") or standing ("u"). @param {Frame} fr */
export function pillar(fr, id, dir) {
  if (dir === "u") return { id, states: { pillar_axis: "y" } };
  const v = fr.vec(dir);
  return { id, states: { pillar_axis: Math.abs(v.x) > 0.5 ? "x" : "z" } };
}

/** A slab in the top or bottom half. */
export function slab(id, top) {
  return { id, states: { "minecraft:vertical_half": top ? "top" : "bottom" } };
}

/** A fence or glass pane joined to its neighbours along frame direction(s). @param {Frame} fr @param {string[]} dirs */
export function joined(fr, id, dirs) {
  const states = {};
  for (const d of ["north", "east", "south", "west"]) states["minecraft:connection_" + d] = false;
  for (const d of dirs) states["minecraft:connection_" + fr.cardinal(d)] = true;
  return { id, states };
}

export function lantern(hanging, soul = false) {
  return { id: soul ? "minecraft:soul_lantern" : "minecraft:lantern", states: { hanging } };
}

export function candles(n, color = "") {
  return { id: "minecraft:" + (color ? color + "_" : "") + "candle", states: { candles: Math.max(0, Math.min(3, n - 1)), lit: true } };
}

const permCache = new Map();
/** @param {BlockSpec} spec */
export function perm(spec) {
  const key = typeof spec === "string" ? spec : spec.id + JSON.stringify(spec.states ?? {});
  let p = permCache.get(key);
  if (!p) {
    p = typeof spec === "string" ? BlockPermutation.resolve(spec) : BlockPermutation.resolve(spec.id, spec.states ?? {});
    permCache.set(key, p);
  }
  return p;
}

// ---------------------------------------------------------------- plans
/**
 * Block operations in frame coordinates, applied in order.
 *   box:  fill cells r0..r1, u0..u1, f0..f1 (inclusive) with one block
 *   set:  one cell
 */
export class Plan {
  constructor() {
    /** @type {{box: number[], block: BlockSpec}[]} */
    this.ops = [];
  }

  box(r0, u0, f0, r1, u1, f1, block) {
    this.ops.push({ box: [Math.min(r0, r1), Math.min(u0, u1), Math.min(f0, f1), Math.max(r0, r1), Math.max(u0, u1), Math.max(f0, f1)], block });
    return this;
  }

  set(r, u, f, block) {
    this.ops.push({ box: [r, u, f, r, u, f], block });
    return this;
  }

  /** The frame-space bounds of everything in the plan. */
  bounds() {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const { box } of this.ops) {
      for (let i = 0; i < 3; i++) {
        b[i] = Math.min(b[i], box[i]);
        b[i + 3] = Math.max(b[i + 3], box[i + 3]);
      }
    }
    return b;
  }
}

const MAX_FILL = 32000;

/** Fill a world box (inclusive corners), split so no single fill is too large. */
function fillWorld(dim, a, b, p) {
  const n = (b.x - a.x + 1) * (b.y - a.y + 1) * (b.z - a.z + 1);
  if (n <= MAX_FILL) {
    dim.fillBlocks(new BlockVolume(a, b), p);
    return;
  }
  const spans = [b.x - a.x, b.y - a.y, b.z - a.z];
  const k = spans.indexOf(Math.max(...spans));
  const key = ["x", "y", "z"][k];
  const mid = Math.floor((a[key] + b[key]) / 2);
  fillWorld(dim, a, { ...b, [key]: mid }, p);
  fillWorld(dim, { ...a, [key]: mid + 1 }, b, p);
}

/** World corners of a frame-space box. @param {Frame} fr */
export function worldBox(fr, box) {
  const c0 = fr.cell(box[0], box[1], box[2]);
  const c1 = fr.cell(box[3], box[4], box[5]);
  return [
    { x: Math.min(c0.x, c1.x), y: Math.min(c0.y, c1.y), z: Math.min(c0.z, c1.z) },
    { x: Math.max(c0.x, c1.x), y: Math.max(c0.y, c1.y), z: Math.max(c0.z, c1.z) },
  ];
}

/** Apply one operation. @param {Frame} fr */
export function applyOp(fr, op) {
  const [a, b] = worldBox(fr, op.box);
  const p = perm(op.block);
  if (a.x === b.x && a.y === b.y && a.z === b.z) fr.dim.setBlockPermutation(a, p);
  else fillWorld(fr.dim, a, b, p);
}

/** True when every chunk under the frame-space box is loaded. @param {Frame} fr */
export function isLoaded(fr, box) {
  const [a, b] = worldBox(fr, box);
  const y = Math.max(fr.dim.heightRange.min, Math.min(fr.dim.heightRange.max - 1, a.y));
  for (let x = a.x; x <= b.x + 15; x += 16) {
    for (let z = a.z; z <= b.z + 15; z += 16) {
      try {
        if (!fr.dim.getBlock({ x: Math.min(x, b.x), y, z: Math.min(z, b.z) })) return false;
      } catch {
        return false;
      }
    }
  }
  return true;
}

/** True when the frame-space box fits between the world's floor and ceiling. @param {Frame} fr */
export function fitsHeight(fr, box) {
  const r = fr.dim.heightRange;
  return fr.o.y + box[1] >= r.min && fr.o.y + box[4] < r.max;
}

/**
 * Build a plan over several ticks. `done(ok)` runs when it finishes (ok = false if a chunk
 * unloaded or a block was refused part way).
 * @param {Frame} fr @param {Plan} plan @param {(ok: boolean) => void} done @param {number} [perTick]
 */
export function build(fr, plan, done, perTick = 24) {
  const ops = plan.ops;
  function* job() {
    let ok = true;
    for (let i = 0; i < ops.length; i++) {
      try {
        applyOp(fr, ops[i]);
      } catch (err) {
        ok = false;
        console.warn("[Titans] doors build: " + err);
        break;
      }
      if (i % perTick === perTick - 1) yield;
    }
    done(ok);
  }
  try {
    system.runJob(job());
  } catch {
    // no job runner: build in one go
    const it = job();
    while (!it.next().done) {
      /* keep going */
    }
  }
}
