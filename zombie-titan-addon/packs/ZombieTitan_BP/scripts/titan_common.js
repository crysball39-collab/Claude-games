// Machinery shared by every titan: per-titan state, movement, hit zones,
// stomps and leaps, minions and loot. Each titan's own attacks live in its
// type module (zombie_titan.js, skeleton_titan.js); titan.js runs the loop.
import { BlockVolume, ItemStack, world } from "@minecraft/server";
import * as U from "./util.js";
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {import("@minecraft/server").Block} Block */

/** Animation ids every titan shares (each type adds its own attacks). */
export const NONE = 0;
export const STUN = 8;
export const WAKE = 11;
export const BIRTH = 13;
export const LEAP = 14;

/**
 * Blocks hard enough that a titan's slam on them shatters its weapon or knocks
 * it down (Java: blocks with an explosion resistance above 500).
 */
export const HARD_BLOCKS = new Set([
  "minecraft:obsidian", "minecraft:crying_obsidian", "minecraft:bedrock", "minecraft:netherite_block",
  "minecraft:ancient_debris", "minecraft:respawn_anchor", "minecraft:anvil", "minecraft:chipped_anvil",
  "minecraft:damaged_anvil", "minecraft:enchanting_table", "minecraft:reinforced_deepslate",
  "minecraft:end_portal_frame", "minecraft:ender_chest", "minecraft:barrier", "zt:compact_obsidian",
]);

/** Mobs titans hunt when no player is around. */
export const TARGET_MOBS = new Set([
  "minecraft:villager", "minecraft:villager_v2", "minecraft:wandering_trader", "minecraft:iron_golem",
  "minecraft:snow_golem",
]);

/** Live titans by entity id. @type {Map<string, any>} */
export const titans = new Map();
/** Titan corpses playing their death sequence. @type {Map<string, any>} */
export const corpses = new Map();

let warned = 0;
/** @param {string} msg */
export function warn(msg) {
  if (warned++ < 8) console.warn("[Titans] " + msg);
}

// =============================================================================
// state and animation
// =============================================================================
/** @param {Entity} e @param {any} s @param {string} id @param {boolean | number | string} value */
export function prop(e, s, id, value) {
  if (s.props[id] === value) return;
  s.props[id] = value;
  try {
    e.setProperty(id, value);
  } catch (err) {
    warn("setProperty " + id + " failed: " + err);
  }
}

/** @param {Entity} e @param {any} s @param {number} id */
export function startAnim(e, s, id) {
  s.anim = id;
  s.t = 0;
  s.prevT = 0;
  s.hitThisSwing.clear();
  prop(e, s, "zt:anim", id);
}

/** Did this tick of the current attack pass `tick`? @param {any} s @param {number} tick */
export function crossed(s, tick) {
  return s.prevT < tick && s.t >= tick;
}

/** @param {Entity} e @param {number} value @param {number} max */
export function setHealth(e, value, max) {
  try {
    e.getComponent("minecraft:health").setCurrentValue(Math.max(1, Math.min(max, value)));
  } catch {
    /* ignore */
  }
}

export function isNight() {
  const t = world.getTimeOfDay();
  return t >= 13000 && t <= 23000;
}

// =============================================================================
// movement
// =============================================================================
/** @param {Entity} e @param {any} s */
export function applyRotation(e, s) {
  try {
    e.setRotation({ x: 0, y: s.yaw });
  } catch {
    /* ignore */
  }
}

/** @param {Entity} e @param {any} s @param {number} want @param {number} rate */
export function turnToward(e, s, want, rate) {
  const diff = U.wrapDeg(want - s.yaw);
  s.yaw = U.wrapDeg(s.yaw + Math.max(-rate, Math.min(rate, diff)));
}

/**
 * Moves the titan `speed` blocks along `yaw` and keeps its feet on the ground.
 * Titans have no block collision: they wade through hills and trees like the
 * Java titans do, so terrain can never trap them.
 */
/** @param {Entity} e @param {any} s @param {number} speed @param {number} yaw @param {boolean} birth */
export function followGround(e, s, speed, yaw, birth) {
  const loc = e.location;
  const f = U.forward(yaw);
  if (--s.groundTick <= 0) {
    s.groundTick = 2;
    const ahead = speed > 0 ? 3 : 0;
    const gy = U.groundY(e.dimension, loc.x + f.x * ahead, loc.z + f.z * ahead, loc.y + 9, 48);
    if (gy !== undefined) s.groundY = gy;
  }
  const dy = s.groundY - loc.y;
  const vy = Math.abs(dy) < 0.04 ? 0 : Math.max(-0.9, Math.min(birth ? 0.3 : 0.6, dy * 0.3));
  try {
    e.clearVelocity();
    if (speed > 0 || vy !== 0) e.applyImpulse({ x: f.x * speed, y: vy, z: f.z * speed });
  } catch {
    /* ignore */
  }
}

/** Smash trees and plants in the titan's path (only when mobGriefing is on). */
/** @param {Entity} e @param {any} s */
export function trample(e, s) {
  if (!world.gameRules.mobGriefing) return;
  const types = U.softBlockTypes();
  if (!types.length) return;
  const c = U.offsetFrom(e.location, s.yaw, 3, 0, 0);
  const from = { x: Math.floor(c.x - 5), y: Math.floor(e.location.y), z: Math.floor(c.z - 5) };
  const to = { x: Math.floor(c.x + 5), y: Math.floor(e.location.y + 16), z: Math.floor(c.z + 5) };
  const dim = e.dimension;
  if (!U.inWorld(dim, from.y) || !U.inWorld(dim, to.y)) return;
  try {
    dim.fillBlocks(new BlockVolume(from, to), "minecraft:air", { blockFilter: { includeTypes: types }, ignoreChunkBoundErrors: true });
  } catch {
    /* unloaded chunks */
  }
}

/** @param {Entity} e @param {number} range @returns {Player | undefined} */
export function nearestPlayer(e, range) {
  let best;
  let bestD = Infinity;
  try {
    for (const p of e.dimension.getPlayers({ location: e.location, maxDistance: range })) {
      if (!U.isVulnerablePlayer(p)) continue;
      const d = U.dist2D(p.location, e.location);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  } catch {
    /* ignore */
  }
  return best;
}

// =============================================================================
// hitting things
// =============================================================================
/** All living things in a cylinder (not allies), each hit once per swing. */
/** @param {Entity} e @param {any} s @param {Vector3} center @param {number} radius @param {number} yDown @param {number} yUp @param {number} damage @param {(v: Entity) => void} [onHit] */
export function hitZone(e, s, center, radius, yDown, yUp, damage, onHit) {
  const dim = e.dimension;
  for (const v of U.livingAround(dim, center, radius + 4, { excludeFamilies: ["zt_ally", "inanimate"] })) {
    if (s.hitThisSwing.has(v.id)) continue;
    const vs = U.bodySize(v);
    if (U.dist2D(v.location, center) > radius + vs.r) continue;
    const y = v.location.y - center.y;
    if (y < yDown - vs.h || y > yUp) continue;
    s.hitThisSwing.add(v.id);
    U.hurt(v, damage, e);
    if (onHit) onHit(v);
  }
}

/** @param {Entity} e @param {any} s @param {Vector3} center @param {number} radius @param {number} damage @param {number} shake */
export function groundPound(e, s, center, radius, damage, shake) {
  const dim = e.dimension;
  hitZone(e, s, center, radius, -2, 4, damage, (v) => {
    const away = U.sub(v.location, center);
    U.knock(v, away.x, away.z, 2.5, 0.8);
  });
  U.particle(dim, "zt:shockwave", center, { radius });
  U.particle(dim, "zt:shockwave_dust", center, { radius });
  U.sound(dim, s.T.snd.slam, center, 3, 0.9);
  U.quake(dim, center, radius * 3, shake, 0.8);
}

/** @param {Entity} e @param {any} s @param {number} side @param {number} base */
export function stomp(e, s, side, base) {
  const dim = e.dimension;
  const loc = e.location;
  const foot = U.offsetFrom(loc, s.yaw, 1.5, side * 2, 0);
  const radius = 28;
  s.hitThisSwing.clear();
  // a ground shockwave: anything standing on the ground within 28 blocks is hit and thrown up,
  // so jumping as the foot lands dodges it
  for (const v of U.livingAround(dim, foot, radius + 4, { excludeFamilies: ["zt_ally", "inanimate"] })) {
    if (U.dist2D(v.location, foot) > radius) continue;
    let grounded;
    try {
      grounded = v.isOnGround;
    } catch {
      grounded = v.location.y - loc.y < 1.5;
    }
    if (!grounded || v.location.y - loc.y > 6) continue;
    U.hurt(v, base, e);
    const away = U.sub(v.location, foot);
    U.knock(v, away.x, away.z, 0.8, 1.0 + Math.random() * 1.2);
  }
  U.particle(dim, "zt:shockwave", foot, { radius });
  U.particle(dim, "zt:shockwave_dust", foot, { radius });
  U.particle(dim, "zt:footstep", foot);
  U.sound(dim, s.T.snd.slam, foot, 4, 0.75);
  U.sound(dim, s.T.snd.step, foot, 3, 0.8);
  U.quake(dim, foot, 80, 3, 1.0);
}

/**
 * The first obsidian-hard block in a box laid out along the titan's facing:
 * `ahead` from..to blocks forward, `side` blocks either side, `dy` from..to
 * blocks around its feet.
 * @param {Dimension} dim @param {Vector3} loc @param {number} yaw
 * @param {[number, number]} ahead @param {number} side @param {[number, number]} dy
 * @returns {Block | undefined}
 */
export function findHardBlock(dim, loc, yaw, ahead, side, dy) {
  for (let d = ahead[0]; d <= ahead[1]; d += 1) {
    for (let x = -side; x <= side; x += 1) {
      const p = U.offsetFrom(loc, yaw, d, x, 0);
      for (let y = dy[0]; y <= dy[1]; y++) {
        let blk;
        try {
          blk = dim.getBlock({ x: Math.floor(p.x), y: Math.floor(loc.y + y), z: Math.floor(p.z) });
        } catch {
          blk = undefined;
        }
        if (blk && HARD_BLOCKS.has(blk.typeId)) return blk;
      }
    }
  }
  return undefined;
}

// ------------------------------------------------------------------ leap
/** Crouch, jump at the target (up to 40 blocks), crash down on tick 38. */
/** @param {Entity} e @param {any} s */
export function leapTick(e, s) {
  const dim = e.dimension;
  const loc = e.location;
  const T = s.T;
  if (s.t < 12) {
    followGround(e, s, 0, 0, false);
    return;
  }
  if (!s.leap) {
    const target = s.target;
    let dest = U.offsetFrom(loc, s.yaw, 24);
    if (U.isValid(target)) {
      const tl = target.location;
      const d = U.dist2D(tl, loc);
      const k = Math.min(1, 40 / Math.max(1, d));
      dest = { x: loc.x + (tl.x - loc.x) * k, y: tl.y, z: loc.z + (tl.z - loc.z) * k };
    }
    const gy = U.groundY(dim, dest.x, dest.z, dest.y + 20, 60);
    if (gy !== undefined) dest.y = gy;
    s.leap = { from: { x: loc.x, y: loc.y, z: loc.z }, to: dest, height: 14 };
    U.sound(dim, T.snd.roar, loc, 3, 1.0);
    U.particle(dim, "zt:shockwave_dust", loc, { radius: 8 });
    U.quake(dim, loc, 48, 1.5, 0.5);
  }
  const L = s.leap;
  const u1 = Math.min(1, (s.t - 12) / 26);
  const u0 = Math.max(0, (s.prevT - 12) / 26);
  /** @param {number} u */
  const P = (u) => ({
    x: L.from.x + (L.to.x - L.from.x) * u,
    y: L.from.y + (L.to.y - L.from.y) * u + L.height * 4 * u * (1 - u),
    z: L.from.z + (L.to.z - L.from.z) * u,
  });
  if (u0 < 1) {
    const want = P(u1);
    const v = U.sub(want, loc);
    try {
      e.clearVelocity();
      e.applyImpulse({ x: v.x, y: v.y, z: v.z });
    } catch {
      /* ignore */
    }
  } else {
    followGround(e, s, 0, 0, false);
  }
  if (s.t >= 38 && s.prevT < 38) {
    // landing: Java deals (50 - distance) damage to everything within 48 blocks
    const base = T.baseDamage(s);
    for (const v of U.livingAround(dim, loc, 48, { excludeFamilies: ["zt_ally", "inanimate"] })) {
      const d = U.len(U.sub(v.location, loc));
      U.hurt(v, Math.max(1, 50 - d) * (base / T.cfg.baseAttack), e);
      const away = U.sub(v.location, loc);
      U.knock(v, away.x, away.z, 2.2, 0.7);
    }
    U.particle(dim, "zt:shockwave", loc, { radius: 30 });
    U.particle(dim, "zt:shockwave_dust", loc, { radius: 24 });
    U.sound(dim, T.snd.fall, loc, 4, 1.0);
    U.quake(dim, loc, 100, 4, 1.2);
    s.groundY = loc.y;
    s.leap = undefined;
  }
}

// =============================================================================
// minions
// =============================================================================
/** @param {Dimension} dim @param {Vector3} location @param {string} type */
export function countMinionsAt(dim, location, type) {
  try {
    return dim.getEntities({ type, location, maxDistance: 64 }).length;
  } catch {
    return 0;
  }
}

/** @param {Entity} e @param {number} rMin @param {number} rMax @returns {Vector3} */
export function randomAround(e, rMin, rMax) {
  const loc = e.location;
  const a = Math.random() * Math.PI * 2;
  const r = U.rand(rMin, rMax);
  const p = { x: loc.x + Math.cos(a) * r, y: loc.y, z: loc.z + Math.sin(a) * r };
  const gy = U.groundY(e.dimension, p.x, p.z, loc.y + 12, 30);
  if (gy !== undefined) p.y = gy;
  return p;
}

/** Java minion tiers: mostly loyalists, some priests and zealots, rare templars. */
function minionEvent() {
  const r = Math.random();
  if (r < 0.6) return "zt:as_loyalist";
  if (r < 0.8) return "zt:as_priest";
  if (r < 0.95) return "zt:as_zealot";
  return "zt:as_templar";
}

/** @param {Dimension} dim @param {string} type @param {string | undefined} event @param {Vector3} at */
export function spawnMinion(dim, type, event, at) {
  try {
    const m = dim.spawnEntity(type, at, { spawnEvent: event ?? minionEvent() });
    U.particle(dim, "zt:minion_summon", at);
    U.particle(dim, "zt:rumble", at, { radius: 1 });
    U.sound(dim, "zt.titan.summon", at, 0.8, 1.4);
    m.addEffect("resistance", 40, { amplifier: 4, showParticles: false });
    return m;
  } catch {
    return undefined;
  }
}

// =============================================================================
// loot
// =============================================================================
/** Throws stacks of items out of the air over a spot. */
/** @param {Dimension} dim @param {Vector3} center @param {Array<[string, number]>} items @param {number} spread */
export function dropItems(dim, center, items, spread) {
  for (const [id, total] of items) {
    let left = total;
    while (left > 0) {
      const n = Math.min(64, left);
      left -= n;
      const at = { x: center.x + U.rand(-spread, spread), y: center.y, z: center.z + U.rand(-spread, spread) };
      try {
        dim.spawnItem(new ItemStack(id, n), at);
      } catch {
        /* unknown item on this version */
      }
    }
  }
}

/** Rolls a loot list of [item, min, max] into [item, count] stacks (empty rolls left out). */
/** @param {Array<[string, number, number]>} table @returns {Array<[string, number]>} */
export function rollLoot(table) {
  /** @type {Array<[string, number]>} */
  const out = [];
  for (const [id, lo, hi] of table) {
    const n = U.randInt(lo, hi);
    if (n > 0) out.push([id, n]);
  }
  return out;
}
