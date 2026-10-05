// Titans: the shared loop that runs every titan type. Each tick a titan
// heals, picks a target, walks toward it and starts or plays an attack; the
// attacks themselves come from its type (zombie_titan.js, skeleton_titan.js,
// creeper_titan.js, spider_titan.js).
// Also here: the rise-from-the-ground birth, death -> corpse, loot, natural
// night spawns and the Growth Serum turning mobs into titans.
import { Difficulty, world } from "@minecraft/server";
import { CREEPER_TITAN } from "./creeper_titan.js";
import { SKELETON_TITAN } from "./skeleton_titan.js";
import { SPIDER_TITAN } from "./spider_titan.js";
import * as C from "./titan_common.js";
import * as U from "./util.js";
import { ZOMBIE_TITAN } from "./zombie_titan.js";
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

/** @type {Record<string, any>} */
export const TYPES = {
  [ZOMBIE_TITAN.id]: ZOMBIE_TITAN,
  [SKELETON_TITAN.id]: SKELETON_TITAN,
  [CREEPER_TITAN.id]: CREEPER_TITAN,
  [SPIDER_TITAN.id]: SPIDER_TITAN,
};
export const TITAN_IDS = Object.keys(TYPES);
export const CORPSE_IDS = TITAN_IDS.map((id) => TYPES[id].corpse);
export const MINION_IDS = TITAN_IDS.map((id) => TYPES[id].minion);

/** @param {string} typeId */
export function isTitan(typeId) {
  return typeId in TYPES;
}

const pendingNatural = new Set();
/** @type {Map<string, string>} new titan id -> name of the mob that drank the Growth Serum */
const pendingSerum = new Map();

// =============================================================================
// bookkeeping
// =============================================================================
/** @param {Entity} e */
function stateOf(e) {
  let s = C.titans.get(e.id);
  if (s) return s;
  const T = TYPES[e.typeId];
  let yaw = 0;
  try {
    yaw = e.getRotation().y;
  } catch {
    /* ignore */
  }
  s = {
    T,
    entity: e,
    props: {},
    anim: 0,
    t: 0,
    prevT: 0,
    yaw,
    target: undefined,
    revenge: undefined,
    targetTick: 0,
    cooldown: 40,
    moving: false,
    stepTick: 0,
    foot: 1,
    regenTick: 0,
    minionTick: 60,
    wanderTicks: 0,
    idleTicks: 0,
    birthT: 0,
    birthTotal: T.cfg.eggBirthTicks,
    groundTick: 0,
    groundY: e.location.y,
    leap: undefined,
    hitThisSwing: new Set(),
    enragedAnnounced: false,
  };
  T.init(e, s);
  try {
    s.props["zt:enraged"] = !!e.getProperty("zt:enraged");
    // a titan that was still rising when the world was saved carries on from its current size
    if (e.getProperty("zt:birth")) {
      const grow = Number(e.getProperty("zt:grow"));
      s.props["zt:birth"] = true;
      s.props["zt:grow"] = grow;
      s.birthTotal = T.cfg.naturalBirthTicks;
      s.birthT = Math.max(0, Math.round(((grow - 0.0625) / 0.9375) * s.birthTotal));
    }
  } catch {
    /* ignore */
  }
  clearOldNameTag(e);
  // after a reload the animation and walking flags start fresh
  s.props["zt:anim"] = -1;
  s.props["zt:moving"] = undefined;
  C.titans.set(e.id, s);
  return s;
}

export function scanForTitans() {
  for (const dimId of ["overworld", "nether", "the_end"]) {
    let dim;
    try {
      dim = world.getDimension(dimId);
    } catch {
      continue;
    }
    for (const T of Object.values(TYPES)) {
      try {
        for (const e of dim.getEntities({ type: T.id })) stateOf(e);
        for (const e of dim.getEntities({ type: T.corpse })) {
          if (C.corpses.has(e.id)) continue;
          let yaw = 0;
          try {
            yaw = e.getRotation().y;
          } catch {
            /* ignore */
          }
          const looted = !!e.getDynamicProperty("zt:looted");
          const seq = T.corpseSeq;
          const loc = { x: e.location.x, y: e.location.y, z: e.location.z };
          const extra = T.corpseLoad ? T.corpseLoad(e) : {};
          C.corpses.set(e.id, { T, entity: e, t: looted ? seq.endTick - 1 : seq.lootTick - 2, killer: undefined, yaw, loc, ...extra });
        }
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Version 1.0.0 wrote the titan's health into its name tag, hoping the boss bar would show it.
 * The boss bar takes its name from the entity file instead, so clear those old tags.
 * @param {Entity} e
 */
function clearOldNameTag(e) {
  try {
    if (e.nameTag.startsWith("§l§2Zombie Titan")) e.nameTag = "";
  } catch {
    /* ignore */
  }
}

/** "a Zombie Titan" @param {any} T */
function aName(T) {
  return (/^[AEIOU]/.test(T.name) ? "an " : "a ") + T.name;
}

/** 10000 -> "10,000" (Minecraft's scripting engine has no locale support) @param {number} n */
function fmt(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// =============================================================================
// spawning & birth
// =============================================================================
/** Called from entitySpawn for every new titan. */
/** @param {Entity} e @param {string} cause */
export function onTitanSpawned(e, cause) {
  const s = stateOf(e);
  if (cause === "Loaded") return;
  const T = s.T;
  const from = pendingSerum.get(e.id);
  if (pendingNatural.delete(e.id)) beginBirth(e, s, T.cfg.naturalBirthTicks);
  else if (pendingSerum.delete(e.id)) {
    beginBirth(e, s, T.cfg.serumBirthTicks, `§5§lThe Growth Serum takes hold... §r§dthe ${from} is growing into ${aName(T)}!`);
  } else beginBirth(e, s, T.cfg.eggBirthTicks);
}

/** @param {Entity} e @param {any} s @param {number} ticks @param {string} [text] */
function beginBirth(e, s, ticks, text) {
  const T = s.T;
  s.birthT = 0;
  s.birthTotal = ticks;
  T.onBirthStart(e, s);
  C.prop(e, s, "zt:enraged", false);
  C.prop(e, s, "zt:birth", true);
  C.prop(e, s, "zt:grow", 0.0625);
  C.startAnim(e, s, C.BIRTH);
  try {
    e.triggerEvent("zt:start_birth");
  } catch {
    /* ignore */
  }
  C.setHealth(e, T.cfg.maxHp * 0.1, T.cfg.maxHp);
  const dim = e.dimension;
  U.sound(dim, T.snd.quake, e.location, 2, 0.6);
  U.tell(dim, e.location, 160, text ?? `${T.color}§lThe ground trembles... §r§a${aName(T)} is rising!`);
}

/** @param {Entity} e @param {any} s */
function birthTick(e, s) {
  const T = s.T;
  const dim = e.dimension;
  const loc = e.location;
  s.birthT++;
  const k = Math.min(1, s.birthT / s.birthTotal);
  const grow = Math.round((0.0625 + 0.9375 * k) * 1000) / 1000;
  C.prop(e, s, "zt:grow", grow);
  if (s.birthT % 5 === 0) C.setHealth(e, T.cfg.maxHp * (0.1 + 0.9 * k), T.cfg.maxHp);
  if (s.props["zt:anim"] !== C.BIRTH) C.startAnim(e, s, C.BIRTH);
  C.followGround(e, s, 0, 0, true);
  // slowly face the nearest player
  const p = C.nearestPlayer(e, 64);
  if (p) C.turnToward(e, s, U.yawTo(loc, p.location), 1.5);
  try {
    e.setRotation({ x: 0, y: s.yaw });
  } catch {
    /* ignore */
  }
  if (s.birthT % 10 === 0) {
    U.particle(dim, "zt:rumble", loc, { radius: 2 + grow * 7 });
    U.quake(dim, loc, 40 + grow * 40, 0.3 + grow * 0.9, 0.6);
  }
  if (s.birthT % 40 === 0) U.sound(dim, T.snd.quake, loc, 1.5, 0.5 + grow * 0.3);
  if (s.birthT % 60 === 30) U.sound(dim, T.snd.ambient, loc, 2, 1.4 - grow * 0.6);
  if (k >= 1) {
    C.prop(e, s, "zt:birth", false);
    C.prop(e, s, "zt:grow", 1);
    try {
      e.triggerEvent("zt:end_birth");
    } catch {
      /* ignore */
    }
    C.setHealth(e, T.cfg.maxHp, T.cfg.maxHp);
    s.cooldown = 10;
    C.startAnim(e, s, C.WAKE);
    U.tell(dim, loc, 160, `§4§lThe ${T.name} has awoken!`);
  }
}

// =============================================================================
// main tick
// =============================================================================
/** @param {number} tick */
export function titanTick(tick) {
  for (const [id, s] of C.titans) {
    const e = s.entity;
    if (!U.isValid(e)) {
      C.titans.delete(id);
      continue;
    }
    try {
      tickTitan(e, s);
    } catch (err) {
      C.warn("titan tick: " + err + (err && err.stack ? "\n" + err.stack : ""));
    }
  }
  for (const [id, c] of C.corpses) {
    if (!U.isValid(c.entity)) {
      C.corpses.delete(id);
      continue;
    }
    try {
      tickCorpse(c);
    } catch (err) {
      C.warn("corpse tick: " + err);
    }
  }
  if (tick % 20 === 0) {
    for (const T of Object.values(TYPES)) T.housekeeping?.(tick);
  }
}

/** @param {Entity} e @param {any} s */
function tickTitan(e, s) {
  const T = s.T;
  const cfg = T.cfg;
  if (s.props["zt:birth"] === undefined) {
    try {
      s.props["zt:birth"] = !!e.getProperty("zt:birth");
    } catch {
      s.props["zt:birth"] = false;
    }
  }
  if (s.props["zt:birth"]) {
    birthTick(e, s);
    return;
  }
  if (s.props["zt:anim"] === -1) C.startAnim(e, s, C.NONE);

  const dim = e.dimension;
  const loc = e.location;
  const hpC = e.getComponent("minecraft:health");
  const hp = hpC ? hpC.currentValue : cfg.maxHp;

  // ----- enraged / "armored" phase
  const enraged = hp <= cfg.maxHp * cfg.enragedAt;
  if (enraged !== !!s.props["zt:enraged"]) {
    if (enraged || hp > cfg.maxHp * (cfg.enragedAt + 0.02)) C.prop(e, s, "zt:enraged", enraged);
    if (enraged && !s.enragedAnnounced) {
      s.enragedAnnounced = true;
      U.tell(dim, loc, 128, `§4§lThe ${T.name} is ENRAGED! §r§c${T.enragedText}`);
      U.sound(dim, T.snd.roar, loc, 3, 0.8);
    }
  }
  const fury = s.props["zt:enraged"] ? 2 : 1;

  // ----- regeneration (faster at night, like the Java mod)
  const night = C.isNight();
  if (--s.regenTick <= 0) {
    s.regenTick = night ? 10 : 20;
    let amount = 10;
    if (U.chance(1 / 3)) amount += 10;
    if (U.chance(1 / 4)) amount += 10;
    if (U.chance(1 / 5)) amount += 10;
    if (U.chance(1 / 6)) amount += 10;
    const allowed = T.canRegen ? T.canRegen(s) : true;
    if (allowed && hpC && hp < cfg.maxHp && hp > 0) hpC.setCurrentValue(Math.min(cfg.maxHp, hp + amount));
  }

  // ----- target
  if (--s.targetTick <= 0 || !U.isValid(s.target)) {
    s.targetTick = 10;
    s.target = pickTarget(e, s);
  }
  const target = s.target;
  T.everyTick?.(e, s, target, fury);

  // ----- running an attack
  if (s.anim !== C.NONE) {
    s.prevT = s.t;
    s.t += s.anim === C.LEAP ? 1 : fury;
    if (target && s.t <= (T.trackUntil[s.anim] ?? 0)) C.turnToward(e, s, U.yawTo(loc, target.location), 6);
    if (s.anim === C.LEAP) C.leapTick(e, s);
    else C.followGround(e, s, 0, 0, false);
    C.prop(e, s, "zt:moving", false);
    T.runAttack(e, s, target);
    if (s.t >= (T.duration[s.anim] ?? 60)) {
      const ended = s.anim;
      C.startAnim(e, s, C.NONE);
      T.onAttackEnd?.(e, s, ended);
      s.cooldown = ended === C.STUN ? 10 : U.randInt(8, 20);
    }
    C.applyRotation(e, s);
    return;
  }

  // ----- deciding what to do
  if (s.cooldown > 0) s.cooldown -= fury;
  let speed = 0;
  if (target) {
    s.idleTicks = 0;
    s.wanderTicks = 0;
    const tl = target.location;
    const want = U.yawTo(loc, tl);
    const off = Math.abs(U.wrapDeg(want - s.yaw));
    C.turnToward(e, s, want, cfg.turnRate * (fury > 1 ? 1.4 : 1));
    const d = U.dist2D(loc, tl);
    const dy = tl.y - loc.y;
    if (s.cooldown <= 0 && T.chooseAttack(e, s, target, d, dy, off, hp)) {
      C.applyRotation(e, s);
      return;
    }
    if (d > cfg.approachRange && off < 60) speed = cfg.walkSpeed * (fury > 1 ? 1.5 : 1);
  } else {
    // wander now and then, like EntityAITitanWander
    s.idleTicks++;
    if (s.wanderTicks > 0) {
      s.wanderTicks--;
      C.turnToward(e, s, s.wanderYaw, 2);
      if (Math.abs(U.wrapDeg(s.wanderYaw - s.yaw)) < 20) speed = cfg.walkSpeed * 0.6;
    } else if (s.idleTicks > 200 && U.chance(1 / 300)) {
      s.wanderYaw = s.yaw + U.rand(-120, 120);
      s.wanderTicks = U.randInt(80, 180);
    }
  }

  C.followGround(e, s, speed, s.yaw, false);
  const moving = speed > 0;
  if (moving && !s.moving) s.stepTick = 0;
  s.moving = moving;
  C.prop(e, s, "zt:moving", moving);
  if (moving) walkEffects(e, s, fury);

  // ----- minions
  if (target && --s.minionTick <= 0) {
    s.minionTick = fury > 1 ? 60 : 100;
    const cap = fury > 1 ? cfg.minionCapEnraged : cfg.minionCap;
    if (C.countMinionsAt(dim, loc, T.minion) < cap) C.spawnMinion(dim, T.minion, undefined, C.randomAround(e, 7, 15));
  }
  C.applyRotation(e, s);
}

/** @param {Entity} e @param {any} s @param {number} fury */
function walkEffects(e, s, fury) {
  const cfg = s.T.cfg;
  const period = fury > 1 ? (cfg.stepPeriodFast ?? 21) : (cfg.stepPeriod ?? 32);
  if (s.stepTick-- > 0) return;
  s.stepTick = period;
  s.foot = -s.foot;
  const dim = e.dimension;
  const footPos = U.offsetFrom(e.location, s.yaw, cfg.footAhead ?? 2, s.foot * (cfg.footSide ?? 2), 0);
  U.sound(dim, s.T.snd.step, footPos, 2.2, 1);
  U.particle(dim, "zt:footstep", footPos);
  U.quake(dim, footPos, 40, 0.8, 0.35);
  // crush whatever it steps on (Java: squish damage = attack / 2)
  for (const v of U.livingAround(dim, footPos, 4.5, { excludeFamilies: ["zt_ally", "inanimate"] })) {
    if (U.dist2D(v.location, footPos) > 3.5 || v.location.y - e.location.y > 3) continue;
    U.hurt(v, s.T.baseDamage(s) / 2, e);
  }
  C.trample(e, s);
}

// =============================================================================
// targeting
// =============================================================================
/** @param {Entity} e @param {any} s @returns {Entity | undefined} */
function pickTarget(e, s) {
  const range = s.T.cfg.targetRange;
  if (U.isValid(s.revenge)) {
    const r = s.revenge;
    const ok = r.typeId !== "minecraft:player" || U.isVulnerablePlayer(r);
    if (ok && U.dist2D(r.location, e.location) < range + 16 && r.dimension.id === e.dimension.id) return r;
    s.revenge = undefined;
  }
  const p = C.nearestPlayer(e, range);
  if (p) return p;
  let best;
  let bestD = Infinity;
  for (const m of U.livingAround(e.dimension, e.location, 48)) {
    if (!C.TARGET_MOBS.has(m.typeId)) continue;
    const d = U.dist2D(m.location, e.location);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

/** Something hurt the titan: fight back (Java: EntityAIHurtByTarget). */
/** @param {Entity} e @param {Entity | undefined} attacker */
export function onTitanHurt(e, attacker) {
  if (!U.isValid(attacker) || attacker.id === e.id) return;
  try {
    if (attacker.matches({ families: ["zt_ally"] })) return;
  } catch {
    /* ignore */
  }
  const s = stateOf(e);
  if (!U.isValid(s.target) || s.target.typeId !== "minecraft:player") {
    s.revenge = attacker;
    s.targetTick = 0;
  }
}

/** A player swung at a titan (the damage itself is decided by its damage sensor). */
/** @param {Player} player @param {Entity} titan */
export function onPlayerHitTitan(player, titan) {
  const s = stateOf(titan);
  onTitanHurt(titan, player);
  s.T.onPlayerHit?.(player, titan, s);
}

/** A Dark Fists ability hit a titan that can't be hurt right now: tell the player why. */
/** @param {Player} player @param {Entity} titan */
export function notifyTitanBlocked(player, titan) {
  const s = stateOf(titan);
  s.T.notifyBlocked?.(player, titan, s);
}

/** A player's arrow or trident hit a titan at `location`: some care where (the Spider Titan's legs). */
/** @param {Entity} titan @param {Player} shooter @param {Vector3} location */
export function onTitanShot(titan, shooter, location) {
  const s = stateOf(titan);
  s.T.onPlayerShot?.(shooter, titan, s, location);
}

/** Proto balls, giant arrows...: the first titan type that owns the projectile handles it. */
/** @param {Entity} projectile @param {Dimension} dim @param {Vector3} location */
export function onProjectileHit(projectile, dim, location) {
  for (const T of Object.values(TYPES)) {
    if (T.onProjectileHit?.(projectile, dim, location)) return true;
  }
  return false;
}

// =============================================================================
// death -> corpse
// =============================================================================
/** @param {Entity} dead @param {import("@minecraft/server").EntityDamageSource} damageSource */
export function onTitanDied(dead, damageSource) {
  const T = TYPES[dead.typeId];
  if (!T) return;
  let loc;
  let dim;
  try {
    loc = dead.location;
    dim = dead.dimension;
  } catch {
    return;
  }
  const s = stateOf(dead);
  const yaw = s.yaw;
  C.titans.delete(dead.id);
  try {
    dead.remove();
  } catch {
    /* the vanilla death animation plays instead */
  }
  let corpse;
  let extra;
  try {
    corpse = dim.spawnEntity(T.corpse, loc);
    corpse.setRotation({ x: 0, y: yaw });
    extra = T.corpseInit?.(corpse, s);
  } catch (err) {
    C.warn("corpse: " + err);
    return;
  }
  let killer = damageSource?.damagingEntity;
  if (!U.isValid(killer) || killer.typeId !== "minecraft:player") killer = undefined;
  C.corpses.set(corpse.id, { T, entity: corpse, t: 0, killer, armed: !!s.armed, yaw, loc: { x: loc.x, y: loc.y, z: loc.z }, ...extra });
  const who = killer ? " by §f" + /** @type {Player} */ (killer).name + "§a" : "";
  U.tell(dim, loc, 200, `§a§lThe ${T.name} has been slain${who}!`);
}

/** @param {any} c */
function tickCorpse(c) {
  const e = c.entity;
  const T = c.T;
  const seq = T.corpseSeq;
  const dim = e.dimension;
  c.t++;
  seq.tick(c);
  if (c.t === seq.lootTick && world.gameRules.doMobLoot) {
    C.dropItems(dim, U.offsetFrom(c.loc, c.yaw, seq.lootAhead, 0, 10), T.loot(c), 10);
    try {
      e.setDynamicProperty("zt:looted", true);
    } catch {
      /* ignore */
    }
    let rewarded = c.killer;
    if (!U.isValid(rewarded)) {
      try {
        rewarded = dim.getPlayers({ location: c.loc, maxDistance: 64, closest: 1 })[0];
      } catch {
        rewarded = undefined;
      }
    }
    if (rewarded) {
      try {
        rewarded.addExperience(T.cfg.xpReward);
        rewarded.sendMessage(`§a+${fmt(T.cfg.xpReward)} XP for slaying the ${T.name}!`);
      } catch {
        /* ignore */
      }
    }
  }
  if (c.t >= seq.endTick) {
    try {
      e.remove();
    } catch {
      /* ignore */
    }
    C.corpses.delete(e.id);
  }
}

// =============================================================================
// Growth Serum: a zombie, skeleton, creeper or spider splashed with it grows into its titan
// =============================================================================
/** Mobs with a titan version of themselves, and the titan each one becomes. */
/** @type {Record<string, string>} */
export const GROWS_INTO = {
  "minecraft:zombie": ZOMBIE_TITAN.id,
  "minecraft:husk": ZOMBIE_TITAN.id,
  "minecraft:drowned": ZOMBIE_TITAN.id,
  "minecraft:zombie_villager": ZOMBIE_TITAN.id,
  "minecraft:zombie_villager_v2": ZOMBIE_TITAN.id,
  [ZOMBIE_TITAN.minion]: ZOMBIE_TITAN.id,
  "minecraft:skeleton": SKELETON_TITAN.id,
  "minecraft:stray": SKELETON_TITAN.id,
  "minecraft:bogged": SKELETON_TITAN.id,
  [SKELETON_TITAN.minion]: SKELETON_TITAN.id,
  "minecraft:creeper": CREEPER_TITAN.id,
  [CREEPER_TITAN.minion]: CREEPER_TITAN.id,
  "minecraft:spider": SPIDER_TITAN.id,
  "minecraft:cave_spider": SPIDER_TITAN.id,
  [SPIDER_TITAN.minion]: SPIDER_TITAN.id,
};

/** "minecraft:zombie_villager_v2" -> "Zombie Villager" @param {string} typeId */
function mobName(typeId) {
  return typeId
    .replace(/^.*:/, "")
    .replace(/_v\d+$/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Swaps the mob for its titan, which then grows from mob size. */
/** @param {Entity} mob @returns {Entity | undefined} the new titan */
export function growIntoTitan(mob) {
  const T = TYPES[GROWS_INTO[mob.typeId]];
  if (!T) return undefined;
  const from = mobName(mob.typeId);
  let dim;
  let loc;
  let yaw = 0;
  try {
    dim = mob.dimension;
    loc = { x: mob.location.x, y: mob.location.y, z: mob.location.z };
    yaw = mob.getRotation().y;
  } catch {
    return undefined;
  }
  try {
    mob.remove();
  } catch {
    return undefined;
  }
  let titan;
  try {
    titan = dim.spawnEntity(T.id, loc);
    titan.setRotation({ x: 0, y: yaw });
  } catch (err) {
    C.warn("growth serum: " + err);
    return undefined;
  }
  pendingSerum.set(titan.id, from);
  return titan;
}

// =============================================================================
// natural spawning
// =============================================================================
const NATURAL_KEY = "zt:natural_spawns";
const LAST_SPAWN_KEY = "zt:last_natural_spawn";

export function naturalSpawnsEnabled() {
  const v = world.getDynamicProperty(NATURAL_KEY);
  return v === undefined ? true : !!v;
}

/** @param {boolean} on */
export function setNaturalSpawns(on) {
  world.setDynamicProperty(NATURAL_KEY, on);
}

/** @param {Dimension} dim @param {Vector3} location @param {number} radius */
function titanNear(dim, location, radius) {
  return TITAN_IDS.some((type) => dim.getEntities({ type, location, maxDistance: radius }).length > 0);
}

/** Every 30 seconds at night there is a small chance a titan claws its way out near a player. */
export function naturalSpawnTick() {
  if (!naturalSpawnsEnabled()) return;
  if (world.getDifficulty() === Difficulty.Peaceful || !C.isNight()) return;
  const now = world.getAbsoluteTime();
  const last = /** @type {number|undefined} */ (world.getDynamicProperty(LAST_SPAWN_KEY));
  if (last !== undefined && now - last < 48000 && now >= last) return;
  let dim;
  try {
    dim = world.getDimension("overworld");
  } catch {
    return;
  }
  for (const p of dim.getPlayers()) {
    if (!U.isVulnerablePlayer(p) || !U.chance(0.012)) continue;
    if (titanNear(dim, p.location, 256)) continue;
    const T = [ZOMBIE_TITAN, SKELETON_TITAN, CREEPER_TITAN, SPIDER_TITAN][U.randInt(0, 3)];
    for (let attempt = 0; attempt < 6; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const r = U.rand(48, 72);
      const x = p.location.x + Math.cos(a) * r;
      const z = p.location.z + Math.sin(a) * r;
      let top;
      try {
        top = dim.getTopmostBlock({ x, z });
      } catch {
        top = undefined;
      }
      if (!top || top.isLiquid || /water|lava|leaves/.test(top.typeId)) continue;
      const at = { x: Math.floor(x) + 0.5, y: top.location.y + 1, z: Math.floor(z) + 0.5 };
      try {
        const titan = dim.spawnEntity(T.id, at);
        pendingNatural.add(titan.id);
        world.setDynamicProperty(LAST_SPAWN_KEY, now);
        for (const q of dim.getPlayers({ location: at, maxDistance: 160 })) {
          q.onScreenDisplay.setTitle("§2The ground trembles...", {
            subtitle: `§aA ${T.name} is rising nearby!`,
            fadeInDuration: 10,
            stayDuration: 60,
            fadeOutDuration: 20,
          });
        }
      } catch (err) {
        C.warn("natural spawn: " + err);
      }
      return;
    }
  }
}
