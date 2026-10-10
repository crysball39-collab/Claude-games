// What a Player sees and hears.
// Sight: things within ~60 degrees of where its head points it sees clearly (if no block is in
// the way); out to ~110 degrees, its peripheral vision, it only notices what moves; behind it,
// nothing. How far it sees depends on the light: all the way by day, much less at night, and
// only a few blocks in a dark cave (the Nether and the End glow a little).
// Hearing: footsteps (not sneaking players'), fights, blocks breaking, explosions, doors and
// chests, from out of sight too; it turns to look.
import { BlockVolume, system, world } from "@minecraft/server";
import * as B from "./bot_body.js";
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

export const HOSTILE = new Set(["minecraft:zombie", "minecraft:husk", "minecraft:drowned", "minecraft:skeleton", "minecraft:stray",
  "minecraft:bogged", "minecraft:spider", "minecraft:cave_spider", "minecraft:creeper", "minecraft:witch", "minecraft:slime",
  "minecraft:magma_cube", "minecraft:blaze", "minecraft:ghast", "minecraft:wither_skeleton", "minecraft:piglin_brute",
  "minecraft:hoglin", "minecraft:zoglin", "minecraft:phantom", "minecraft:vindicator", "minecraft:pillager", "minecraft:evoker",
  "minecraft:vex", "minecraft:endermite", "minecraft:silverfish", "minecraft:guardian", "minecraft:shulker",
  "minecraft:zombie_villager", "minecraft:zombie_villager_v2", "minecraft:breeze", "minecraft:creaking", "minecraft:ender_dragon",
  "zt:zombie_minion", "zt:skeleton_minion", "zt:creeper_minion", "zt:spider_minion", "zt:silverfish_minion"]);
/** Neutral until provoked (an enderman you look at, a piglin when you wear no gold). */
export const NEUTRAL = new Set(["minecraft:enderman", "minecraft:zombie_pigman", "minecraft:zombified_piglin", "minecraft:piglin",
  "minecraft:wolf", "minecraft:iron_golem", "minecraft:bee", "minecraft:polar_bear", "minecraft:llama", "minecraft:panda"]);
/** Too much for anyone: run. */
export const DREAD = new Set(["minecraft:warden", "minecraft:wither", "minecraft:ravager", "minecraft:elder_guardian",
  "zt:zombie_titan", "zt:skeleton_titan", "zt:creeper_titan", "zt:spider_titan", "zt:omegafish", "zt:figure", "zt:seek", "zt:rush"]);
export const FOOD_ANIMALS = new Set(["minecraft:cow", "minecraft:pig", "minecraft:sheep", "minecraft:chicken", "minecraft:mooshroom",
  "minecraft:rabbit"]);
const IGNORE = /^minecraft:(item|xp_orb|arrow|snowball|egg|ender_pearl|thrown_trident|fireball|small_fireball|dragon_fireball|wither_skull|lightning_bolt|area_effect_cloud|fishing_hook|painting|armor_stand|leash_knot|falling_block|tnt|minecart|boat|chest_boat|splash_potion|lingering_potion|xp_bottle|eye_of_ender_signal|ender_crystal|shulker_bullet|llama_spit|evocation_fang|wind_charge_projectile|breeze_wind_charge_projectile)$/;
const LIGHTS = ["minecraft:torch", "minecraft:lantern", "minecraft:glowstone", "minecraft:lava", "minecraft:fire", "minecraft:sea_lantern",
  "minecraft:shroomlight", "minecraft:lit_pumpkin", "minecraft:campfire", "minecraft:soul_torch", "minecraft:soul_lantern",
  "minecraft:redstone_lamp", "minecraft:lit_redstone_lamp", "minecraft:end_rod", "minecraft:jack_o_lantern"];

/** @param {Entity} e */
function headOf(e) {
  try {
    return e.getHeadLocation();
  } catch {
    return e.location;
  }
}
/** @param {Entity} e */
export function isMoving(e) {
  try {
    const v = e.getVelocity();
    return Math.hypot(v.x, v.z) > 0.03 || Math.abs(v.y) > 0.2;
  } catch {
    return false;
  }
}
/** Is the way between two points clear of blocks? @param {any} dim @param {Vector3} a @param {Vector3} b */
export function clearSight(dim, a, b) {
  const d = B.dist(a, b);
  if (d < 1) return true;
  try {
    const hit = dim.getBlockFromRay(a, { x: (b.x - a.x) / d, y: (b.y - a.y) / d, z: (b.z - a.z) / d },
      { maxDistance: d - 0.6, includeLiquidBlocks: false, includePassableBlocks: false });
    return !hit;
  } catch {
    return true;
  }
}

/** How far it can see right now. @param {any} bot @param {number} now */
export function sightRange(bot, now) {
  if (bot.sight && now - bot.sight.at < 40) return bot.sight.range;
  const e = bot.entity;
  const dim = e.dimension;
  const eyeP = B.eye(bot);
  let range = 48;
  let lit = false;
  try {
    const lights = dim.getBlocks(new BlockVolume({ x: Math.floor(eyeP.x) - 7, y: Math.floor(eyeP.y) - 4, z: Math.floor(eyeP.z) - 7 },
      { x: Math.floor(eyeP.x) + 7, y: Math.floor(eyeP.y) + 4, z: Math.floor(eyeP.z) + 7 }), { includeTypes: LIGHTS }, true);
    lit = lights.getBlockLocationIterator().next().done === false;
  } catch {
    lit = false;
  }
  const heldLight = /torch|lantern/.test(bot.heldId ?? "");
  if (dim.id === "minecraft:overworld") {
    const covered = B.roofed(dim, eyeP);
    const time = world.getTimeOfDay();
    const night = time > 13000 && time < 23000;
    if (covered) range = lit || heldLight ? 24 : 10;
    else if (night) range = lit || heldLight ? 32 : 20;
  } else if (dim.id === "minecraft:nether") range = 32;
  else range = 40;
  if (bot.entity.getEffect?.("night_vision")) range = 48;
  bot.sight = { at: now, range };
  return range;
}

/** Look around: what it can see from here, and the footsteps it hears. @param {any} bot @param {number} now */
export function senseTick(bot, now) {
  const e = bot.entity;
  const dim = e.dimension;
  const eyeP = B.eye(bot);
  const dir = B.viewDir(bot);
  const range = sightRange(bot, now);
  let near = [];
  try {
    near = dim.getEntities({ location: eyeP, maxDistance: 48 });
  } catch {
    return;
  }
  near = near.filter((x) => x.id !== e.id && !IGNORE.test(x.typeId) && x.isValid);
  near.sort((a, b) => B.dist(a.location, eyeP) - B.dist(b.location, eyeP));
  let checked = 0;
  for (const t of near) {
    if (checked >= 16) break;
    const head = headOf(t);
    const d = B.dist(eyeP, head);
    const to = { x: (head.x - eyeP.x) / (d || 1), y: (head.y - eyeP.y) / (d || 1), z: (head.z - eyeP.z) / (d || 1) };
    const angle = Math.acos(Math.max(-1, Math.min(1, dir.x * to.x + dir.y * to.y + dir.z * to.z))) * 180 / Math.PI;
    let seen = false;
    if (d <= 2.2) seen = true;                                   // close enough to feel
    else if (angle <= 60 && d <= range) seen = (checked++, clearSight(dim, eyeP, head));
    else if (angle <= 110 && d <= Math.min(24, range) && isMoving(t)) {
      seen = (checked++, clearSight(dim, eyeP, head));
      // something moved at the edge of its eye: it turns to look
      if (seen && !bot.busyLook) B.lookAt(bot, head, 20, 1);
    }
    if (seen) remember(bot, t, d, now);
    else if (d <= 12 && isMoving(t) && !sneaking(t) && !bot.seen.has(t.id)) hear(bot, t.location, "footsteps", t, now);
  }
  for (const [id, s] of bot.seen) {
    if (now - s.at > 600 || !s.entity.isValid) bot.seen.delete(id);
  }
}

/** @param {Entity} t */
function sneaking(t) {
  try {
    return !!t.isSneaking;
  } catch {
    return false;
  }
}

/** @param {any} bot @param {Entity} t @param {number} d @param {number} now */
function remember(bot, t, d, now) {
  const first = !bot.seen.has(t.id);
  bot.seen.set(t.id, { entity: t, typeId: t.typeId, pos: { ...t.location }, dist: d, at: now, first: first ? now : bot.seen.get(t.id).first });
  if (first) bot.events.push({ kind: "saw", entity: t, typeId: t.typeId, at: now });
}

/**
 * It hears something at a spot: footsteps, a fight, a block breaking, an explosion, a door.
 * It turns to look (if nothing more pressing holds its eyes) and remembers it.
 * @param {any} bot @param {Vector3} pos @param {string} kind @param {Entity | undefined} source @param {number} now
 */
export function hear(bot, pos, kind, source, now) {
  bot.heard.push({ pos: { ...pos }, kind, source, at: now });
  if (bot.heard.length > 20) bot.heard.shift();
  const loud = kind === "explosion" || kind === "hurt";
  if (bot.busyLook && !loud) return;
  if (Math.random() < (loud ? 1 : 0.35)) B.lookAt(bot, { x: pos.x, y: pos.y + 1.4, z: pos.z }, loud ? 30 : 20, loud ? 2 : 1);
}

/** How far each kind of sound carries. */
export const HEARING = { footsteps: 12, hurt: 16, break: 16, place: 12, explosion: 64, door: 12, chest: 12, chat: 32 };

/** A sound somewhere: every Player in earshot hears it. @param {Iterable<any>} bots @param {any} dim @param {Vector3} pos @param {string} kind @param {Entity} [source] */
export function soundAt(bots, dim, pos, kind, source) {
  const now = system.currentTick;
  const r = HEARING[kind] ?? 12;
  for (const bot of bots) {
    try {
      if (bot.entity.dimension.id !== dim.id || bot.entity.id === source?.id) continue;
      if (B.dist(bot.entity.location, pos) <= r) hear(bot, pos, kind, source, now);
    } catch {
      /* gone */
    }
  }
}

/** Seen recently and still about, nearest first. @param {any} bot @param {(s: any) => boolean} test @param {number} [within] */
export function seenWhere(bot, test, within = 100) {
  const now = system.currentTick;
  const out = [];
  for (const s of bot.seen.values()) {
    if (now - s.at > within || !s.entity.isValid) continue;
    if (test(s)) out.push(s);
  }
  const here = bot.entity.location;
  out.sort((a, b) => B.dist(a.entity.location, here) - B.dist(b.entity.location, here));
  return out;
}

/** Is it a danger to this Player right now? @param {any} bot @param {any} s */
export function isThreat(bot, s) {
  const id = s.typeId;
  if (DREAD.has(id)) return true;
  if (HOSTILE.has(id)) {
    if (id === "minecraft:ender_dragon") return bot.entity.dimension.id === "minecraft:the_end";
    return true;
  }
  if (id === "minecraft:piglin") return !bot.wearsGold;
  if (NEUTRAL.has(id)) return bot.angry.has(s.entity.id);
  if (id === "minecraft:player" || id === "zt:player") return bot.angry.has(s.entity.id);
  return false;
}
