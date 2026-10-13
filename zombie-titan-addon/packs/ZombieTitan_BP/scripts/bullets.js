// Glowing spore bullets, moved and landed by script: each tick a bullet steps along its line,
// bursts on the first solid block, or hits the first thing in its way that it may hurt (the
// hostile ones: players and anything not of the Glowshroom Biome; the friendly ones: hostile
// mobs; a Radiation Zombie's spit: players and anything not a monster), for damage credited to
// whoever fired it. (Doing it here rather than with the game's projectiles makes sure every hit
// lands and is counted the same way everywhere.)
import { system } from "@minecraft/server";
import * as U from "./util.js";

/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

export const HOSTILE = "zt:spore_bullet";
export const FRIENDLY = "zt:shroomy_bullet";
/** A Radiation Zombie's spit (radiation.js): it hits players and what isn't a monster. */
export const SPIT = "zt:radiation_spit";
/** How long a bullet flies before it fades (ticks). */
const LIFE = 80;
/** Things a bullet flies through. */
const PASS = /^minecraft:(air|water|flowing_water|lava|flowing_lava|short_grass|tall_grass|fern|large_fern|.*_flower|dandelion|poppy|.*_tulip|.*_sapling|.*_mushroom|vine|glow_lichen|.*torch|.*_carpet|snow_layer|light_block.*|seagrass|kelp|.*_button|.*pressure_plate|rail|.*_rail|redstone_wire|cave_vines.*|hanging_roots|.*_sign|.*_banner)$|^zt:(spore_grass_plant|spore_mushroom|spore_crop|glowshroom_button|glowshroom_pressure_plate)$/;
const SKIP = /^minecraft:(item|xp_orb|arrow|snowball|egg|ender_pearl|fireball|small_fireball|area_effect_cloud|armor_stand|painting|leash_knot|falling_block|tnt|minecart|boat|chest_boat|lightning_bolt)$|^zt:(spore_bullet|shroomy_bullet|spore_arrow|falling_shroom|crab_totem_display|supernova|everest_portal|radiation_spit|nuke_rocket|mushroom_cloud)$/;
/** Hostile by family, but not to be shot unless they start it. */
const NEUTRAL = new Set(["minecraft:enderman", "minecraft:zombie_pigman", "minecraft:piglin"]);

/** The bullets in flight: entity id -> what it is and where it's going. */
const live = new Map();

/**
 * Fires a bullet.
 * @param {Dimension} dim @param {string} type HOSTILE, FRIENDLY or SPIT @param {Vector3} at @param {Vector3} dir (unit)
 * @param {number} speed blocks a tick @param {Entity | undefined} owner credited with what it hits
 * @param {number} damage
 * @param {{ onHit?: (hit: Entity) => void, pop?: string }} [extra] what more a hit does, and the burst it makes
 */
export function fire(dim, type, at, dir, speed, owner, damage, extra = {}) {
  let e;
  try {
    e = dim.spawnEntity(type, at);
  } catch {
    return undefined;
  }
  live.set(e.id, {
    e, dim, type, damage, owner, ownerId: owner?.id, ownerType: owner?.typeId, onHit: extra.onHit, pop: extra.pop,
    pos: { x: at.x, y: at.y, z: at.z }, vel: { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed }, until: system.currentTick + LIFE,
  });
  return e;
}

/** The bullets in flight: type, who fired it, its velocity (for tests). */
export function flying() {
  return [...live.values()].map((b) => ({ type: b.type, owner: b.owner, vel: { ...b.vel }, damage: b.damage, entity: b.e }));
}

/** May this bullet hurt that? @param {any} b @param {Entity} t */
function target(b, t) {
  if (!U.isValid(t) || t.id === b.ownerId || SKIP.test(t.typeId)) return false;
  const is = (/** @type {string} */ f) => {
    try {
      return t.matches({ families: [f] });
    } catch {
      return false;
    }
  };
  if (t.typeId === "minecraft:player") return (b.type === HOSTILE || b.type === SPIT) && U.isVulnerablePlayer(/** @type {any} */ (t));
  if (b.type === FRIENDLY) return is("monster") && !NEUTRAL.has(t.typeId);
  // (a hostile bullet spares the Glowshroom Biome's own)
  let alive = false;
  try {
    alive = !!t.getComponent("minecraft:health");
  } catch {
    alive = false;
  }
  if (b.type === SPIT) return alive && !is("monster") && !is("inanimate");
  return alive && !is("shroom") && !is("inanimate");
}

/** @param {any} b @param {Vector3} at */
function burst(b, at) {
  U.particle(b.dim, b.pop ?? "zt:spore_pop", at);
  live.delete(b.e.id);
  try {
    if (U.isValid(b.e)) b.e.remove();
  } catch {
    /* ignore */
  }
}

/** @param {any} b @param {Entity} t */
function strike(b, t) {
  const owner = b.owner && U.isValid(b.owner) ? b.owner : undefined;
  try {
    if (owner) t.applyDamage(b.damage, { cause: /** @type {any} */ ("entityAttack"), damagingEntity: owner });
    else t.applyDamage(b.damage, { cause: /** @type {any} */ ("magic") });
  } catch {
    /* ignore */
  }
  const v = b.vel;
  const flat = Math.hypot(v.x, v.z) || 1;
  if (t.typeId === "minecraft:player" || t.typeId === "zt:player") U.knock(t, v.x / flat, v.z / flat, 0.3, 0.15);
  try {
    b.onHit?.(t);
  } catch {
    /* ignore */
  }
}

/** Moves every bullet a step; what it hits, it hurts. @param {number} tick */
export function bulletTick(tick) {
  if (!live.size) return;
  for (const b of [...live.values()]) {
    if (!U.isValid(b.e) || tick >= b.until) {
      live.delete(b.e.id);
      try {
        if (U.isValid(b.e)) b.e.remove();
      } catch {
        /* ignore */
      }
      continue;
    }
    const from = b.pos;
    const to = { x: from.x + b.vel.x, y: from.y + b.vel.y, z: from.z + b.vel.z };
    const speed = U.len(b.vel);
    // the first solid block on the way
    let stop;
    const steps = Math.max(1, Math.ceil(speed / 0.4));
    for (let k = 1; k <= steps && !stop; k++) {
      const p = { x: from.x + (b.vel.x * k) / steps, y: from.y + (b.vel.y * k) / steps, z: from.z + (b.vel.z * k) / steps };
      let id;
      try {
        id = b.dim.getBlock(p)?.typeId;
      } catch {
        id = undefined;
      }
      if (id === undefined) stop = p;
      else if (!PASS.test(id)) stop = p;
    }
    const end = stop ?? to;
    // the first thing in the way
    let near = [];
    try {
      near = b.dim.getEntities({ location: { x: (from.x + end.x) / 2, y: (from.y + end.y) / 2, z: (from.z + end.z) / 2 }, maxDistance: speed / 2 + 2.5 });
    } catch {
      near = [];
    }
    let hit;
    let hitK = Infinity;
    const samples = Math.max(2, Math.ceil(U.len(U.sub(end, from)) / 0.25));
    for (const t of near) {
      if (!target(b, t)) continue;
      const s = U.bodySize(t);
      const l = t.location;
      // the first point along the way that's inside its body (a little padded)
      for (let k = 0; k <= samples && k < hitK; k++) {
        const q = { x: from.x + ((end.x - from.x) * k) / samples, y: from.y + ((end.y - from.y) * k) / samples, z: from.z + ((end.z - from.z) * k) / samples };
        if (Math.abs(q.x - l.x) <= s.r + 0.2 && Math.abs(q.z - l.z) <= s.r + 0.2 && q.y >= l.y - 0.2 && q.y <= l.y + s.h + 0.2) {
          hit = t;
          hitK = k;
          break;
        }
      }
    }
    if (hit) {
      strike(b, hit);
      burst(b, U.centerOf(hit));
      continue;
    }
    if (stop) {
      burst(b, from);
      continue;
    }
    b.pos = to;
    try {
      b.e.teleport(to);
    } catch {
      live.delete(b.e.id);
    }
  }
}
