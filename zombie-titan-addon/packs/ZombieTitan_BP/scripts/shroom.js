// The Glowshroom Biome's mobs and berries: a Shroom Zombie that can't reach you fires glowing
// spore bullets four ways (one at you); the bullets burst in spores where they land. Shroom
// Berries give Regeneration II for 5 seconds and Shroomy for 20: four glowing bullets circle the
// one who ate them and shoot themselves at hostile mobs that come close.
import { system, world } from "@minecraft/server";
import * as U from "./util.js";

/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

export const ZOMBIE = "zt:shroom_zombie";
export const SKELETON = "zt:shroom_skeleton";
export const BULLET = "zt:spore_bullet";
export const FRIENDLY = "zt:shroomy_bullet";
export const BERRIES = "zt:shroom_berries";
const DIMS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

/** A Shroom Zombie fires when its target is further than this... */
export const BURST_FAR = 7;
/** ...and no further than this, with a clear line to them, every 3 to 4.5 seconds. */
export const BURST_RANGE = 22;
const BURST_COOLDOWN = [60, 90];
const BULLET_SPEED = 1.1;

/** Shroomy: how long it lasts, how far its bullets reach, how hard they hit, how soon one comes back. */
export const SHROOMY_TICKS = 400;
export const SHROOMY_REACH = 7;
export const SHROOMY_DAMAGE = 4;
const ORB_RECHARGE = 30;
const ORB_RADIUS = 1.3;
const REGEN_TICKS = 100;
/** Hostile by family, but left alone unless they start it. */
const NEUTRAL = new Set(["minecraft:enderman", "minecraft:zombie_pigman", "minecraft:piglin"]);

/**
 * Fires a bullet (its owner gets the credit for what it hits).
 * @param {Dimension} dim @param {string} type @param {Vector3} at @param {Vector3} dir @param {number} speed @param {Entity} [owner]
 */
export function shoot(dim, type, at, dir, speed, owner) {
  let b;
  try {
    b = dim.spawnEntity(type, at);
  } catch {
    return undefined;
  }
  const v = { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed };
  try {
    const pc = b.getComponent("minecraft:projectile");
    if (pc) {
      if (owner) pc.owner = owner;
      pc.shoot(v);
    } else b.applyImpulse(v);
  } catch {
    /* ignore */
  }
  return b;
}

// ---------------------------------------------------------------- the Shroom Zombie's bursts
/** When each Shroom Zombie can fire again (entity id -> tick). */
const burstReady = new Map();

/** @param {Entity} from @param {Entity} to */
function clearLine(from, to) {
  try {
    const a = from.getHeadLocation();
    const b = to.getHeadLocation();
    const d = U.len(U.sub(b, a));
    if (d < 0.5) return true;
    const hit = from.dimension.getBlockFromRay(a, U.scale(U.sub(b, a), 1 / d), { maxDistance: d, includeLiquidBlocks: false, includePassableBlocks: false });
    return !hit;
  } catch {
    return false;
  }
}

/** The player a Shroom Zombie would fire at: the nearest it can see, too far off to bite. @param {Entity} z */
function burstTarget(z) {
  let players = [];
  try {
    players = z.dimension.getPlayers({ location: z.location, maxDistance: BURST_RANGE });
  } catch {
    return undefined;
  }
  let best;
  let bestD = Infinity;
  for (const p of players) {
    if (!U.isVulnerablePlayer(p)) continue;
    const d = U.len(U.sub(p.location, z.location));
    if (d < BURST_FAR || d >= bestD) continue;
    if (!clearLine(z, p)) continue;
    best = p;
    bestD = d;
  }
  return best;
}

/** Four bullets, a quarter turn apart, the first one at the target. @param {Entity} z @param {Entity} target */
export function burst(z, target) {
  const dim = z.dimension;
  const from = { x: z.location.x, y: z.location.y + 1.3, z: z.location.z };
  const t = target.location;
  const dx = t.x - from.x;
  const dz = t.z - from.z;
  const flat = Math.hypot(dx, dz) || 1;
  const rise = (t.y + 1.0 - from.y) / flat;
  const a = Math.atan2(dz, dx);
  for (let k = 0; k < 4; k++) {
    const ang = a + (k * Math.PI) / 2;
    const dir = U.norm({ x: Math.cos(ang), y: k === 0 ? rise : 0, z: Math.sin(ang) });
    shoot(dim, BULLET, { x: from.x + dir.x * 0.7, y: from.y + dir.y * 0.7, z: from.z + dir.z * 0.7 }, dir, BULLET_SPEED, z);
  }
  U.particle(dim, "zt:spore_pop", from);
  U.sound(dim, "mob.shulker.shoot", from, 1, 1.4);
}

/** @param {number} tick */
function zombieTick(tick) {
  if (tick % 10 !== 0) return;
  for (const dimId of DIMS) {
    let zombies = [];
    try {
      zombies = world.getDimension(dimId).getEntities({ type: ZOMBIE });
    } catch {
      continue;
    }
    for (const z of zombies) {
      if (!U.isValid(z) || tick < (burstReady.get(z.id) ?? 0)) continue;
      const target = burstTarget(z);
      if (!target) continue;
      burstReady.set(z.id, tick + U.randInt(BURST_COOLDOWN[0], BURST_COOLDOWN[1]));
      burst(z, target);
    }
  }
  if (tick % 1200 === 0) {
    for (const [id, at] of burstReady) if (tick - at > 1200) burstReady.delete(id);
  }
}

// ---------------------------------------------------------------- bullets landing
/**
 * A spore bullet hit something: it bursts in spores. Shroomy's bullets hurt what they hit (the
 * hostile spore bullets do their damage themselves), never a player.
 * @param {string} type @param {Dimension} dim @param {Vector3} at @param {Entity} [hit] @param {Entity} [source]
 */
export function onBulletHit(type, dim, at, hit, source) {
  U.particle(dim, "zt:spore_pop", at);
  if (type !== FRIENDLY || !hit || !U.isValid(hit)) return;
  if (hit.typeId === "minecraft:player" || hit.typeId === "zt:player" || (source && hit.id === source.id)) return;
  U.hurt(hit, SHROOMY_DAMAGE, source, "projectile");
}

// ---------------------------------------------------------------- Shroom Berries and Shroomy
/** Who has Shroomy: player id -> until when, when each of the four bullets is back, which way they've turned. */
const shroomy = new Map();

/** Ate Shroom Berries: Regeneration II for 5 seconds, Shroomy for 20. @param {Player} p */
export function onEat(p) {
  try {
    p.addEffect("regeneration", REGEN_TICKS, { amplifier: 1, showParticles: true });
  } catch {
    /* ignore */
  }
  const now = system.currentTick;
  const s = shroomy.get(p.id) ?? { until: 0, orbs: [0, 0, 0, 0], angle: 0, lastShot: -99 };
  s.until = Math.max(s.until, now + SHROOMY_TICKS);
  shroomy.set(p.id, s);
  U.particle(p.dimension, "zt:spore_pop", { x: p.location.x, y: p.location.y + 1.1, z: p.location.z });
  U.sound(p.dimension, "random.orb", p.location, 0.6, 0.7);
  U.actionbar(p, "§b✦ Shroomy §7— spore bullets guard you");
}

/** Shroomy's state for a player (for tests). @param {string} id */
export function shroomyOf(id) {
  return shroomy.get(id);
}

/** The hostile mob nearest a point, out to `reach`. @param {Dimension} dim @param {Vector3} at @param {number} reach */
function nearestHostile(dim, at, reach) {
  let list = [];
  try {
    list = dim.getEntities({ location: at, maxDistance: reach, families: ["monster"] });
  } catch {
    return undefined;
  }
  let best;
  let bestD = Infinity;
  for (const e of list) {
    if (!U.isValid(e) || NEUTRAL.has(e.typeId)) continue;
    let hp;
    try {
      hp = e.getComponent("minecraft:health");
    } catch {
      hp = undefined;
    }
    if (!hp || hp.currentValue <= 0) continue;
    const d = U.len(U.sub(e.location, at));
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** @param {number} tick */
function shroomyTick(tick) {
  if (!shroomy.size) return;
  for (const [id, s] of [...shroomy]) {
    const p = /** @type {Player | undefined} */ (world.getEntity(id));
    if (!p || !U.isValid(p)) {
      shroomy.delete(id);
      continue;
    }
    if (tick >= s.until) {
      shroomy.delete(id);
      U.actionbar(p, "§7Shroomy wore off");
      continue;
    }
    s.angle += 0.22;
    const dim = p.dimension;
    const l = p.location;
    const orbs = [];
    for (let k = 0; k < 4; k++) {
      const a = s.angle + (k * Math.PI) / 2;
      const o = { x: l.x + Math.cos(a) * ORB_RADIUS, y: l.y + 1.1 + Math.sin(s.angle * 2 + k) * 0.15, z: l.z + Math.sin(a) * ORB_RADIUS };
      orbs.push(o);
      if (tick >= s.orbs[k]) U.particle(dim, "zt:shroomy_orb", o);
    }
    if (tick - s.lastShot >= 6) {
      const k = s.orbs.findIndex((/** @type {number} */ ready) => tick >= ready);
      const target = k >= 0 ? nearestHostile(dim, l, SHROOMY_REACH) : undefined;
      if (target) {
        const aim = U.centerOf(target);
        const from = orbs[k];
        shoot(dim, FRIENDLY, from, U.norm(U.sub(aim, from)), 1.4, p);
        s.orbs[k] = tick + ORB_RECHARGE;
        s.lastShot = tick;
        U.sound(dim, "mob.shulker.shoot", from, 0.5, 1.8);
      }
    }
    if (tick % 10 === 0) {
      const left = Math.ceil((s.until - tick) / 20);
      U.actionbar(p, `§b✦ Shroomy §f${left}s`);
    }
  }
}

/** @param {string} id */
export function forget(id) {
  shroomy.delete(id);
}

/** @param {number} tick */
export function shroomTick(tick) {
  zombieTick(tick);
  shroomyTick(tick);
}
