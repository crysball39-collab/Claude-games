// A world like the game's, for the Players' tests: rolling hills with one-block ledges, rivers
// and lakes at sea level (62), taiga (spruce trees with low leaves, ferns, sweet berry bushes,
// podzol) and forest (oak and birch, grass and flowers); sand and gravel by the water; stone
// with granite, diorite, andesite, dirt and gravel pockets, deepslate below 0 and bedrock at the
// bottom; caves and tunnels (some open to the surface, lava at the very bottom); and ores in
// small veins at the heights the game puts them (coal high, iron around 16, diamonds deep).
//   const w = realWorld(7); sim.terrain = w.terrain; ... w.surface(x, z), w.spawn
export const SEA = 62;

/** a repeatable 0..1 for a point and a seed */
function hash(x, y, z, s) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177 + s * 1013904223) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
const fade = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
/** smooth 2D value noise, 0..1 */
function noise2(x, z, scale, s) {
  const fx = x / scale;
  const fz = z / scale;
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const tx = fade(fx - x0);
  const tz = fade(fz - z0);
  return lerp(lerp(hash(x0, 0, z0, s), hash(x0 + 1, 0, z0, s), tx), lerp(hash(x0, 0, z0 + 1, s), hash(x0 + 1, 0, z0 + 1, s), tx), tz);
}
/** smooth 3D value noise, 0..1 */
function noise3(x, y, z, scale, s) {
  const fx = x / scale;
  const fy = y / scale;
  const fz = z / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const z0 = Math.floor(fz);
  const tx = fade(fx - x0);
  const ty = fade(fy - y0);
  const tz = fade(fz - z0);
  const c = (dx, dy, dz) => hash(x0 + dx, y0 + dy, z0 + dz, s);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), tx), lerp(c(0, 1, 0), c(1, 1, 0), tx), ty),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), tx), lerp(c(0, 1, 1), c(1, 1, 1), tx), ty), tz);
}

/**
 * Ores, each with how common it is at a height (a fraction of the rock there), as the game's
 * placement makes them (coal on a slope up from 0, iron peaking at 16, diamonds deepest).
 */
const ORES = [
  ["coal_ore", (y) => (y < 0 ? 0 : y < 50 ? 0.006 : y < 130 ? 0.011 : 0.006)],
  ["iron_ore", (y) => (y < -24 || y > 56 ? 0.0008 : 0.012 * (1 - Math.abs(y - 16) / 40))],
  ["copper_ore", (y) => (y < -16 || y > 112 ? 0 : 0.0055 * (1 - Math.abs(y - 48) / 64))],
  ["gold_ore", (y) => (y > 32 ? 0 : 0.0018 * (1 - Math.abs(y + 16) / 48))],
  ["redstone_ore", (y) => (y > 15 ? 0 : 0.0016 + 0.004 * Math.min(1, (15 - y) / 79))],
  ["lapis_ore", (y) => (y < -64 || y > 64 ? 0 : 0.0014 * (1 - Math.abs(y) / 64))],
  ["diamond_ore", (y) => (y > 16 ? 0 : 0.0006 + 0.0016 * Math.min(1, (16 - y) / 80))],
];

/**
 * @param {number} seed
 * @param {{biome?: "taiga" | "forest" | "mixed"}} [o] taiga (like a spruce forest), forest (oak and birch), or both
 */
export function realWorld(seed = 1, o = {}) {
  const biome = o.biome ?? "mixed";
  const S = (k) => seed * 31 + k;
  /** @type {Map<string, any>} */
  const columns = new Map();

  /** the ground's height and what kind of land it is, for a column */
  function land(x, z) {
    let h = 69 + (noise2(x, z, 70, S(1)) - 0.5) * 16 + (noise2(x, z, 26, S(2)) - 0.5) * 7 + (noise2(x, z, 9, S(3)) - 0.5) * 2.2;
    // a river winds through (narrow: a few blocks of water and a sandy bank)
    const r = Math.abs(noise2(x, z, 110, S(4)) - 0.5);
    let river = false;
    if (r < 0.012) {
      river = true;
      h = Math.min(h, SEA - 1 - (0.012 - r) * 250);
    } else if (r < 0.03) h = lerp(Math.min(h, SEA + 1), h, (r - 0.012) / 0.018);
    const taiga = biome === "taiga" ? true : biome === "forest" ? false : noise2(x, z, 140, S(5)) > 0.45;
    return { h: Math.floor(h), river, taiga };
  }

  /** the trees on a 5-block grid (one in some cells), and what each is */
  function treeIn(cx, cz) {
    const taiga = land(cx * 5 + 2, cz * 5 + 2).taiga;
    const density = taiga ? 0.62 : noise2(cx * 5, cz * 5, 60, S(6)) > 0.35 ? 0.5 : 0.08;
    if (hash(cx, 0, cz, S(7)) > density) return undefined;
    const x = cx * 5 + Math.floor(hash(cx, 1, cz, S(8)) * 5);
    const z = cz * 5 + Math.floor(hash(cx, 2, cz, S(8)) * 5);
    const l = land(x, z);
    if (l.h < SEA + 1 || l.river) return undefined;
    // not on a steep spot
    if (Math.abs(land(x + 1, z).h - l.h) > 1 || Math.abs(land(x, z + 1).h - l.h) > 1) return undefined;
    const kind = taiga ? "spruce" : hash(cx, 3, cz, S(9)) < 0.3 ? "birch" : "oak";
    const tall = kind === "spruce" ? 7 + Math.floor(hash(cx, 4, cz, S(9)) * 4) : kind === "birch" ? 6 + Math.floor(hash(cx, 4, cz, S(9)) * 2) : 5 + Math.floor(hash(cx, 4, cz, S(9)) * 2);
    return { x, z, base: l.h + 1, tall, kind };
  }
  /** the log or leaves of a tree at a block, if any */
  function treeBlock(t, x, y, z) {
    const dy = y - t.base;
    const dx = x - t.x;
    const dz = z - t.z;
    if (dx === 0 && dz === 0 && dy >= 0 && dy < t.tall) return `minecraft:${t.kind}_log`;
    const leaves = `minecraft:${t.kind}_leaves`;
    const ring = Math.max(Math.abs(dx), Math.abs(dz));
    if (t.kind === "spruce") {
      // a cone: wide low down, alternating, a tip on top
      if (dy < 2 || dy > t.tall) return undefined;
      if (dy === t.tall) return dx === 0 && dz === 0 ? leaves : undefined;
      const fromTop = t.tall - dy;
      const r = fromTop <= 1 ? 1 : fromTop % 2 === 0 ? Math.min(3, 1 + Math.floor(fromTop / 3)) : 1;
      if (ring > r || (ring === r && r > 1 && Math.abs(dx) === Math.abs(dz))) return undefined;
      return leaves;
    }
    // oak and birch: a round crown on the top few blocks
    const top = t.base + t.tall - 1;
    const k = y - top;
    if (k < -2 || k > 1) return undefined;
    const r = k <= -1 ? 2 : 1;
    if (ring > r) return undefined;
    if (ring === r && Math.abs(dx) === Math.abs(dz) && hash(x, y, z, S(10)) < 0.5) return undefined;
    return leaves;
  }

  /** everything about a column, worked out once */
  function column(x, z) {
    const k = x + "," + z;
    let c = columns.get(k);
    if (c) return c;
    const l = land(x, z);
    c = { ...l, trees: [] };
    const cx = Math.floor(x / 5);
    const cz = Math.floor(z / 5);
    for (let i = cx - 1; i <= cx + 1; i++) {
      for (let j = cz - 1; j <= cz + 1; j++) {
        const t = treeIn(i, j);
        if (t && Math.abs(t.x - x) <= 3 && Math.abs(t.z - z) <= 3) c.trees.push(t);
      }
    }
    // a steep slope is bare stone (a cliff, where ore shows), as the game's mountainsides are
    const steep = Math.max(Math.abs(land(x + 1, z).h - l.h), Math.abs(land(x - 1, z).h - l.h), Math.abs(land(x, z + 1).h - l.h), Math.abs(land(x, z - 1).h - l.h));
    c.cliff = steep >= 3 && l.h > SEA + 2;
    // what grows on top
    const wet = l.h < SEA;
    const shore = !wet && l.h <= SEA + 1 && (l.river || land(x + 3, z).h < SEA || land(x - 3, z).h < SEA || land(x, z + 3).h < SEA || land(x, z - 3).h < SEA);
    c.top = wet ? (hash(x, 0, z, S(11)) < 0.5 ? "minecraft:gravel" : "minecraft:sand") : shore ? "minecraft:sand" : c.cliff ? "minecraft:stone"
      : l.taiga && noise2(x, z, 7, S(12)) > 0.72 ? "minecraft:podzol" : "minecraft:grass_block";
    const p = hash(x, 1, z, S(13));
    c.plant = undefined;
    if (c.top === "minecraft:grass_block" || c.top === "minecraft:podzol") {
      if (l.taiga) {
        c.plant = p < 0.16 ? "minecraft:fern" : p < 0.2 ? "minecraft:large_fern" : p < 0.3 ? "minecraft:short_grass" : p < 0.315 ? "minecraft:sweet_berry_bush"
          : p < 0.325 ? "minecraft:bush" : undefined;
      } else {
        c.plant = p < 0.22 ? "minecraft:short_grass" : p < 0.25 ? "minecraft:tall_grass" : p < 0.27 ? "minecraft:poppy" : p < 0.29 ? "minecraft:dandelion"
          : p < 0.3 ? "minecraft:leaf_litter" : undefined;
      }
    } else if (shore && p < 0.04) c.plant = "minecraft:reeds";
    columns.set(k, c);
    return c;
  }

  /** caves: big chambers deep down, winding tunnels (some up through the ground) */
  function cave(x, y, z, h) {
    if (y <= -60 || y > h) return false;
    // tunnels: where two noises both sit near their middle
    const a = Math.abs(noise3(x, y * 1.4, z, 14, S(20)) - 0.5);
    const b = Math.abs(noise3(x, y * 1.4, z, 14, S(21)) - 0.5);
    if (a < 0.035 && b < 0.05 && (y < h - 4 || noise2(x, z, 30, S(22)) > 0.55)) return true;
    // chambers, under the hills
    if (y < h - 12 && y < 40 && noise3(x, y * 2, z, 22, S(23)) > 0.8) return true;
    return false;
  }

  /** the rock at a block (not cave, not ore) */
  function rock(x, y, z) {
    if (y <= -60 && (y === -64 || hash(x, y, z, S(30)) < (-59 - y) / 5)) return "minecraft:bedrock";
    const deep = y < 0 || (y < 8 && hash(x, y, z, S(31)) * 8 > y);
    const blob = noise3(x, y, z, 7, S(32));
    if (deep) return blob > 0.8 ? "minecraft:tuff" : "minecraft:deepslate";
    if (blob > 0.82) return ["minecraft:granite", "minecraft:diorite", "minecraft:andesite"][Math.floor(hash(Math.floor(x / 7), Math.floor(y / 7), Math.floor(z / 7), S(33)) * 3)];
    const blob2 = noise3(x, y, z, 6, S(34));
    if (blob2 > 0.86) return y > 30 ? "minecraft:dirt" : "minecraft:gravel";
    return "minecraft:stone";
  }
  /** an ore at a block in rock, if one is there: small veins, as common as at that height */
  function ore(x, y, z, deep) {
    for (let i = 0; i < ORES.length; i++) {
      const [id, w] = ORES[i];
      const f = w(y);
      if (f <= 0) continue;
      // each ore its own veins: a small blob where its noise is high, thinned to how common it is
      const v = noise3(x + i * 1000, y, z, 2.3, S(41 + i));
      if (v > 0.83 && hash(x, y, z, S(50 + i)) < f * 26) return deep ? `minecraft:deepslate_${id}` : `minecraft:${id}`;
    }
    return undefined;
  }

  /** @param {any} dim @param {number} x @param {number} y @param {number} z */
  function terrain(dim, x, y, z) {
    if (dim !== "minecraft:overworld") return undefined;
    if (y < -64) return undefined;
    const c = column(x, z);
    const h = c.h;
    if (y > h) {
      // above the ground: water up to sea level, trees, plants
      if (y <= SEA && h < SEA) return "minecraft:water";
      for (const t of c.trees) {
        const b = treeBlock(t, x, y, z);
        if (b) return b;
      }
      if (y === h + 1 && c.plant) {
        if (c.plant === "minecraft:reeds") return "minecraft:reeds";
        return c.plant;
      }
      if (y === h + 2 && (c.plant === "minecraft:large_fern" || c.plant === "minecraft:tall_grass")) return c.plant;
      if (y === h + 2 && c.plant === "minecraft:reeds" && hash(x, 2, z, S(14)) < 0.6) return "minecraft:reeds";
      return undefined;
    }
    if (cave(x, y, z, h)) {
      // not under water (the sea would pour in), lava at the very bottom
      if (h < SEA + 1 && y > h - 6) return y === h ? c.top : "minecraft:dirt";
      return y <= -55 ? "minecraft:lava" : undefined;
    }
    if (y === h && !c.cliff) return c.top;
    if (y > h - 4 && !c.cliff) return c.top === "minecraft:sand" ? "minecraft:sand" : c.top === "minecraft:gravel" ? "minecraft:gravel" : "minecraft:dirt";
    const r = rock(x, y, z);
    if (r === "minecraft:stone" || r === "minecraft:deepslate" || r === "minecraft:tuff") {
      const o = ore(x, y, z, r !== "minecraft:stone");
      if (o) return o;
    }
    return r;
  }

  /** the top of the ground at a column (where a body stands: one above) */
  function surface(x, z) {
    return column(x, z).h;
  }
  // a dry spot near the middle to start from
  let spawn = { x: 0, y: 70, z: 0 };
  for (let ring = 0; ring < 60; ring++) {
    let found = false;
    for (let i = -ring; i <= ring && !found; i++) {
      for (const [x, z] of [[i, -ring], [i, ring], [-ring, i], [ring, i]]) {
        const c = column(x, z);
        if (c.h >= SEA + 1 && !c.trees.some((t) => t.x === x && t.z === z) && c.top === "minecraft:grass_block" &&
            !c.trees.some((t) => Math.abs(t.x - x) <= 1 && Math.abs(t.z - z) <= 1)) {
          spawn = { x, y: c.h + 1, z };
          found = true;
          break;
        }
      }
    }
    if (found) break;
  }
  return { terrain, surface, column, spawn };
}
