// Shared helpers: vector math, effects, damage, ground finding.
import { BlockTypes, GameMode, MolangVariableMap, world } from "@minecraft/server";
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

export const DEG = Math.PI / 180;

/** @param {number} yaw degrees (Minecraft: 0 = +Z/south, 90 = -X/west) */
export function forward(yaw) {
  return { x: -Math.sin(yaw * DEG), y: 0, z: Math.cos(yaw * DEG) };
}

/** Unit vector pointing to the entity's right-hand side. */
export function rightOf(yaw) {
  return { x: -Math.cos(yaw * DEG), y: 0, z: -Math.sin(yaw * DEG) };
}

/** @param {Vector3} from @param {Vector3} to */
export function yawTo(from, to) {
  return Math.atan2(-(to.x - from.x), to.z - from.z) / DEG;
}

export function wrapDeg(a) {
  a = ((a + 180) % 360 + 360) % 360 - 180;
  return a;
}

/** @param {Vector3} a @param {Vector3} b @returns {Vector3} */
export function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** @param {Vector3} a @param {Vector3} b @returns {Vector3} */
export function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** @param {Vector3} a @param {number} s @returns {Vector3} */
export function scale(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

/** @param {Vector3} a */
export function len(a) {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

/** @param {Vector3} a @returns {Vector3} */
export function norm(a) {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

/** @param {Vector3} a @param {Vector3} b */
export function dist2D(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Point along `dir` from `origin`, `d` blocks out, with optional sideways and vertical offsets. */
export function offsetFrom(origin, yaw, ahead, side = 0, up = 0) {
  const f = forward(yaw);
  const r = rightOf(yaw);
  return { x: origin.x + f.x * ahead + r.x * side, y: origin.y + up, z: origin.z + f.z * ahead + r.z * side };
}

export function rand(min, max) {
  return min + Math.random() * (max - min);
}

export function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function chance(p) {
  return Math.random() < p;
}

/** Distance from point p to segment a-b. */
/** @param {Vector3} p @param {Vector3} a @param {Vector3} b */
export function distToSegment(p, a, b) {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const l2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
  let t = l2 > 0 ? (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return len(sub(p, add(a, scale(ab, t))));
}

// ---------------------------------------------------------------- entities
/** @param {Entity | undefined} e @returns {e is Entity} */
export function isValid(e) {
  try {
    return !!e && e.isValid;
  } catch {
    return false;
  }
}

/** Horizontal radius and height used for hit tests (titans are huge). */
/** @param {Entity} e */
export function bodySize(e) {
  switch (e.typeId) {
    case "zt:zombie_titan":
    case "zt:skeleton_titan":
      return { r: 4, h: 32 };
    case "zt:creeper_titan":
      return { r: 4, h: 26 };
    case "minecraft:ender_dragon":
      return { r: 6, h: 6 };
    case "minecraft:wither":
      return { r: 0.6, h: 3.5 };
    case "minecraft:ghast":
    case "minecraft:happy_ghast":
      return { r: 2, h: 4 };
    case "minecraft:ravager":
    case "minecraft:iron_golem":
      return { r: 0.8, h: 2.7 };
    default:
      return { r: 0.45, h: 1.9 };
  }
}

/** @param {Entity} e @returns {Vector3} */
export function centerOf(e) {
  const s = bodySize(e);
  const l = e.location;
  return { x: l.x, y: l.y + Math.min(s.h, 4) / 2, z: l.z };
}

/** True for players that can be hurt (not creative / spectator). */
/** @param {Player} p */
export function isVulnerablePlayer(p) {
  try {
    const gm = p.getGameMode();
    return gm !== GameMode.Creative && gm !== GameMode.Spectator;
  } catch {
    return false;
  }
}

const SKIP_TYPES = new Set([
  "minecraft:item",
  "minecraft:xp_orb",
  "minecraft:arrow",
  "minecraft:thrown_trident",
  "minecraft:snowball",
  "minecraft:egg",
  "minecraft:ender_pearl",
  "minecraft:painting",
  "minecraft:leash_knot",
  "minecraft:lightning_bolt",
  "minecraft:fireball",
  "minecraft:small_fireball",
  "minecraft:area_effect_cloud",
  "minecraft:armor_stand",
  "minecraft:falling_block",
  "minecraft:tnt",
  "minecraft:minecart",
  "minecraft:boat",
  "minecraft:chest_boat",
]);

/**
 * Living things around a point that can take damage.
 * @param {import("@minecraft/server").Dimension} dim
 */
export function livingAround(dim, location, radius, opts = {}) {
  let list = [];
  try {
    list = dim.getEntities({ location, maxDistance: radius, excludeFamilies: opts.excludeFamilies ?? ["inanimate"] });
  } catch {
    return [];
  }
  const out = [];
  for (const e of list) {
    if (!isValid(e) || SKIP_TYPES.has(e.typeId)) continue;
    if (opts.exclude && opts.exclude.includes(e)) continue;
    if (e.typeId === "minecraft:player" && !isVulnerablePlayer(/** @type {Player} */ (e))) continue;
    let hp;
    try {
      hp = e.getComponent("minecraft:health");
    } catch {
      hp = undefined;
    }
    if (!hp || hp.currentValue <= 0) continue;
    out.push(e);
  }
  return out;
}

/** @param {Entity} target @param {number} amount @param {Entity | undefined} attacker @param {any} [cause] */
export function hurt(target, amount, attacker, cause = "entityAttack") {
  try {
    if (attacker && isValid(attacker)) {
      return target.applyDamage(amount, { cause, damagingEntity: attacker });
    }
    return target.applyDamage(amount, { cause });
  } catch {
    return false;
  }
}

/** @param {Entity} target @param {number} dirX @param {number} dirZ @param {number} horizontal @param {number} vertical */
export function knock(target, dirX, dirZ, horizontal, vertical) {
  try {
    const l = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
    target.applyKnockback({ x: (dirX / l) * horizontal, z: (dirZ / l) * horizontal }, vertical);
  } catch {
    /* some entities refuse knockback */
  }
}

// ---------------------------------------------------------------- effects
/** @param {Dimension} dim @param {string} id @param {Vector3} location @param {Record<string, any>} [vars] */
export function particle(dim, id, location, vars) {
  try {
    if (vars) {
      const m = new MolangVariableMap();
      for (const [k, v] of Object.entries(vars)) {
        if (typeof v === "number") m.setFloat("variable." + k, v);
        else if (v && "red" in v) m.setColorRGB("variable." + k, v);
        else m.setVector3("variable." + k, v);
      }
      dim.spawnParticle(id, location, m);
    } else {
      dim.spawnParticle(id, location);
    }
  } catch {
    /* chunk not loaded */
  }
}

/** @param {Dimension} dim @param {string} id @param {Vector3} location @param {number} [volume] @param {number} [pitch] */
export function sound(dim, id, location, volume = 1, pitch = 1) {
  try {
    dim.playSound(id, location, { volume, pitch });
  } catch {
    /* ignore */
  }
}

/** Camera shake for every player near a point, stronger when closer. */
/** @param {Dimension} dim @param {Vector3} location @param {number} radius @param {number} strength @param {number} [seconds] */
export function quake(dim, location, radius, strength, seconds = 0.5) {
  let players = [];
  try {
    players = dim.getPlayers({ location, maxDistance: radius });
  } catch {
    return;
  }
  for (const p of players) {
    const d = len(sub(p.location, location));
    const k = Math.max(0, 1 - d / radius);
    const intensity = Math.min(4, Math.max(0.05, strength * k));
    try {
      p.runCommand(`camerashake add @s ${intensity.toFixed(2)} ${seconds.toFixed(2)} positional`);
    } catch {
      /* ignore */
    }
  }
}

/** @param {Dimension} dim @param {Vector3} location @param {number} radius @param {string} text */
export function tell(dim, location, radius, text) {
  try {
    for (const p of dim.getPlayers({ location, maxDistance: radius })) p.sendMessage(text);
  } catch {
    /* ignore */
  }
}

/** @param {Player} player @param {string} text */
export function actionbar(player, text) {
  try {
    player.onScreenDisplay.setActionBar(text);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- terrain
const PASS_THROUGH = new Set([
  "minecraft:air",
  "minecraft:water",
  "minecraft:flowing_water",
  "minecraft:lava",
  "minecraft:flowing_lava",
]);

/** Block types a titan tramples like grass. Filtered to the ones this game version knows. */
let softTypes;
export function softBlockTypes() {
  if (softTypes) return softTypes;
  const ids = [
    "acacia_leaves", "azalea_leaves", "azalea_leaves_flowered", "birch_leaves", "cherry_leaves", "dark_oak_leaves",
    "jungle_leaves", "mangrove_leaves", "oak_leaves", "pale_oak_leaves", "spruce_leaves", "orange_poplar_leaves",
    "red_poplar_leaves", "yellow_poplar_leaves", "acacia_log", "birch_log", "cherry_log", "dark_oak_log",
    "jungle_log", "mangrove_log", "oak_log", "pale_oak_log", "spruce_log", "poplar_log", "mangrove_roots",
    "brown_mushroom_block", "red_mushroom_block", "mushroom_stem", "vine", "bamboo", "cactus", "sweet_berry_bush",
    "snow_layer", "tall_grass", "short_grass", "fern", "large_fern", "deadbush", "azalea", "flowering_azalea",
    "cocoa", "pale_hanging_moss", "glow_lichen",
  ];
  softTypes = [];
  for (const id of ids) {
    try {
      if (BlockTypes.get("minecraft:" + id)) softTypes.push("minecraft:" + id);
    } catch {
      /* unknown on this version */
    }
  }
  return softTypes;
}

const LEAFY = /leaves|_log$|mushroom_block|mushroom_stem|mangrove_roots|vine|bamboo|cactus/;

/**
 * Height of the ground under (x, z), ignoring tree canopies. Scans down from `fromY`.
 * Returns undefined when the column is not loaded.
 */
/** @param {Dimension} dim @param {number} x @param {number} z @param {number} fromY @param {number} [maxDown] @returns {number | undefined} */
export function groundY(dim, x, z, fromY, maxDown = 48) {
  const range = dim.heightRange;
  let y = Math.min(Math.floor(fromY), range.max - 1);
  const bottom = Math.max(range.min, y - maxDown);
  for (; y >= bottom; y--) {
    let b;
    try {
      b = dim.getBlock({ x: Math.floor(x), y, z: Math.floor(z) });
    } catch {
      return undefined;
    }
    if (!b) return undefined;
    const id = b.typeId;
    if (PASS_THROUGH.has(id) || LEAFY.test(id)) continue;
    if (b.isAir || b.isLiquid) continue;
    // ignore thin plants etc.
    if (/grass$|fern|flower|tulip|poppy|dandelion|orchid|allium|bluet|daisy|torch|sapling|carpet|snow_layer|rail|button|lever|sign|banner|pressure_plate|bush|petals|wildflowers|leaf_litter/.test(id)) continue;
    return y + 1;
  }
  return undefined;
}

/** @param {Dimension} dim @param {number} y */
export function inWorld(dim, y) {
  const r = dim.heightRange;
  return y >= r.min && y < r.max;
}

export function nowTick() {
  return world.getAbsoluteTime();
}
