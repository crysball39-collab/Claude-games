// Zombie Titan: movement, targeting, attacks, birth, minions, death.
//
// Numbers follow the Java Titans mod (0.45) Zombie Titan where Bedrock allows:
// 32 blocks tall (16x a zombie), 20,000 HP, 120 attack damage (240 with its
// sword), stomp / kick / smash / sideways slash / downward slash / lightning /
// proto-ball volley / roar, a 43 second "birth" for natural titans, faster
// healing at night, and an enraged ("armored") phase below 20% health.
import { BlockVolume, Difficulty, ItemStack, system, world } from "@minecraft/server";
import * as U from "./util.js";
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

export const TITAN = "zt:zombie_titan";
export const CORPSE = "zt:zombie_titan_corpse";
export const MINION = "zt:zombie_minion";
export const PROTO = "zt:proto_ball";

export const CFG = {
  maxHp: 20000,
  baseAttack: 120,
  walkSpeed: 0.23,
  turnRate: 3.5,
  meleeRange: 20,
  approachRange: 10,
  targetRange: 72,
  enragedAt: 0.2,
  minionCap: 10,
  minionCapEnraged: 14,
  hardMinionCap: 18,
  eggBirthTicks: 200,
  naturalBirthTicks: 860,
  xpReward: 10000,
};

export const ANIM = {
  NONE: 0, KICK: 1, REFORM: 2, SMASH: 3, SWAT: 4, LIGHTNING: 5, STOMP: 6, SLASH_DOWN: 7,
  STUN: 8, SLASH_SIDE: 9, ROAR: 11, SPIT: 12, BIRTH: 13, LEAP: 14,
};
const DURATION = { 1: 60, 2: 210, 3: 70, 4: 30, 5: 110, 6: 150, 7: 230, 8: 140, 9: 190, 11: 100, 12: 110, 14: 50 };
// keep turning toward the target until this tick of each attack
const TRACK_UNTIL = { 1: 24, 2: 30, 3: 26, 4: 10, 5: 50, 6: 40, 7: 40, 8: 0, 9: 84, 11: 20, 12: 48, 14: 11 };

const SWORD_BREAKERS = new Set([
  "minecraft:obsidian", "minecraft:crying_obsidian", "minecraft:bedrock", "minecraft:netherite_block",
  "minecraft:ancient_debris", "minecraft:respawn_anchor", "minecraft:anvil", "minecraft:chipped_anvil",
  "minecraft:damaged_anvil", "minecraft:enchanting_table", "minecraft:reinforced_deepslate",
  "minecraft:end_portal_frame", "minecraft:ender_chest", "minecraft:barrier",
]);

const TARGET_MOBS = new Set([
  "minecraft:villager", "minecraft:villager_v2", "minecraft:wandering_trader", "minecraft:iron_golem",
  "minecraft:snow_golem",
]);

/** @type {Map<string, any>} */
const titans = new Map();
/** @type {Map<string, any>} */
const corpses = new Map();
/** @type {Map<string, number>} */
const protoBalls = new Map();
const pendingNatural = new Set();
let warned = 0;

function warn(msg) {
  if (warned++ < 8) console.warn("[Zombie Titan] " + msg);
}

// =============================================================================
// bookkeeping
// =============================================================================
/** @param {Entity} e @param {any} s @param {string} id @param {boolean | number | string} value */
function prop(e, s, id, value) {
  if (s.props[id] === value) return;
  s.props[id] = value;
  try {
    e.setProperty(id, value);
  } catch (err) {
    warn("setProperty " + id + " failed: " + err);
  }
}

/** @param {Entity} e */
function stateOf(e) {
  let s = titans.get(e.id);
  if (s) return s;
  let yaw = 0;
  try {
    yaw = e.getRotation().y;
  } catch {
    /* ignore */
  }
  s = {
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
    nameTick: 0,
    lastHpShown: -1,
    wanderTicks: 0,
    idleTicks: 0,
    birthT: 0,
    birthTotal: CFG.eggBirthTicks,
    groundTick: 0,
    groundY: e.location.y,
    leap: undefined,
    hitThisSwing: new Set(),
    enragedAnnounced: false,
    armed: true,
  };
  try {
    s.armed = !!e.getProperty("zt:armed");
    s.props["zt:armed"] = s.armed;
    s.props["zt:enraged"] = !!e.getProperty("zt:enraged");
    // a titan that was still rising when the world was saved carries on from its current size
    if (e.getProperty("zt:birth")) {
      const grow = Number(e.getProperty("zt:grow"));
      s.props["zt:birth"] = true;
      s.props["zt:grow"] = grow;
      s.birthTotal = CFG.naturalBirthTicks;
      s.birthT = Math.max(0, Math.round(((grow - 0.0625) / 0.9375) * s.birthTotal));
    }
  } catch {
    /* ignore */
  }
  // after a reload the animation and walking flags start fresh
  s.props["zt:anim"] = -1;
  s.props["zt:moving"] = undefined;
  titans.set(e.id, s);
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
    try {
      for (const e of dim.getEntities({ type: TITAN })) stateOf(e);
      for (const e of dim.getEntities({ type: CORPSE })) {
        if (corpses.has(e.id)) continue;
        let yaw = 0;
        let armed = false;
        try {
          yaw = e.getRotation().y;
          armed = !!e.getProperty("zt:armed");
        } catch {
          /* ignore */
        }
        const looted = !!e.getDynamicProperty("zt:looted");
        corpses.set(e.id, { entity: e, t: looted ? 299 : 168, killer: undefined, armed, yaw });
      }
    } catch {
      /* ignore */
    }
  }
}

/** @param {Entity} e @param {any} s @param {number} id */
function startAnim(e, s, id) {
  s.anim = id;
  s.t = 0;
  s.prevT = 0;
  s.hitThisSwing.clear();
  prop(e, s, "zt:anim", id);
}

function crossed(s, tick) {
  return s.prevT < tick && s.t >= tick;
}

function baseDamage(s) {
  return s.armed ? CFG.baseAttack * 2 : CFG.baseAttack;
}

/** @param {Entity} e @param {any} s @param {boolean} armed */
function setArmed(e, s, armed) {
  s.armed = armed;
  prop(e, s, "zt:armed", armed);
}

// =============================================================================
// spawning & birth
// =============================================================================
/** Called from entitySpawn for every new titan. */
/** @param {Entity} e @param {string} cause */
export function onTitanSpawned(e, cause) {
  const s = stateOf(e);
  if (cause === "Loaded") return;
  const natural = pendingNatural.delete(e.id);
  beginBirth(e, s, natural ? CFG.naturalBirthTicks : CFG.eggBirthTicks);
}

/** @param {Entity} e @param {any} s @param {number} ticks */
function beginBirth(e, s, ticks) {
  s.birthT = 0;
  s.birthTotal = ticks;
  setArmed(e, s, true);
  prop(e, s, "zt:enraged", false);
  prop(e, s, "zt:birth", true);
  prop(e, s, "zt:grow", 0.0625);
  startAnim(e, s, ANIM.BIRTH);
  try {
    e.triggerEvent("zt:start_birth");
  } catch {
    /* ignore */
  }
  setHealth(e, CFG.maxHp * 0.1);
  updateName(e, s, true);
  const dim = e.dimension;
  U.sound(dim, "zt.titan.quake", e.location, 2, 0.6);
  U.tell(dim, e.location, 160, "§2§lThe ground trembles... §r§aa Zombie Titan is rising!");
}

/** @param {Entity} e @param {any} s */
function birthTick(e, s) {
  const dim = e.dimension;
  const loc = e.location;
  s.birthT++;
  const k = Math.min(1, s.birthT / s.birthTotal);
  const grow = Math.round((0.0625 + 0.9375 * k) * 1000) / 1000;
  prop(e, s, "zt:grow", grow);
  if (s.birthT % 5 === 0) setHealth(e, CFG.maxHp * (0.1 + 0.9 * k));
  if (s.birthT % 10 === 0) updateName(e, s, false);
  if (s.props["zt:anim"] !== ANIM.BIRTH) startAnim(e, s, ANIM.BIRTH);
  followGround(e, s, 0, 0, true);
  // slowly face the nearest player
  const p = nearestPlayer(e, 64);
  if (p) turnToward(e, s, U.yawTo(loc, p.location), 1.5);
  try {
    e.setRotation({ x: 0, y: s.yaw });
  } catch {
    /* ignore */
  }
  if (s.birthT % 10 === 0) {
    U.particle(dim, "zt:rumble", loc, { radius: 2 + grow * 7 });
    U.quake(dim, loc, 40 + grow * 40, 0.3 + grow * 0.9, 0.6);
  }
  if (s.birthT % 40 === 0) U.sound(dim, "zt.titan.quake", loc, 1.5, 0.5 + grow * 0.3);
  if (s.birthT % 60 === 30) U.sound(dim, "zt.titan.ambient", loc, 2, 1.4 - grow * 0.6);
  if (k >= 1) {
    prop(e, s, "zt:birth", false);
    prop(e, s, "zt:grow", 1);
    try {
      e.triggerEvent("zt:end_birth");
    } catch {
      /* ignore */
    }
    setHealth(e, CFG.maxHp);
    s.cooldown = 10;
    startAnim(e, s, ANIM.ROAR);
    U.tell(dim, loc, 160, "§4§lThe Zombie Titan has awoken!");
  }
}

/** @param {Entity} e @param {number} value */
function setHealth(e, value) {
  try {
    e.getComponent("minecraft:health").setCurrentValue(Math.max(1, Math.min(CFG.maxHp, value)));
  } catch {
    /* ignore */
  }
}

// =============================================================================
// main tick
// =============================================================================
export function titanTick(tick) {
  for (const [id, s] of titans) {
    const e = s.entity;
    if (!U.isValid(e)) {
      titans.delete(id);
      continue;
    }
    try {
      tickTitan(e, s, tick);
    } catch (err) {
      warn("titan tick: " + err + (err && err.stack ? "\n" + err.stack : ""));
    }
  }
  for (const [id, c] of corpses) {
    if (!U.isValid(c.entity)) {
      corpses.delete(id);
      continue;
    }
    try {
      tickCorpse(c);
    } catch (err) {
      warn("corpse tick: " + err);
    }
  }
  if (tick % 20 === 0) cleanProtoBalls(tick);
}

/** @param {Entity} e @param {any} s @param {number} tick */
function tickTitan(e, s, tick) {
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
  if (s.props["zt:anim"] === -1) startAnim(e, s, ANIM.NONE);

  const dim = e.dimension;
  const loc = e.location;
  const hpC = e.getComponent("minecraft:health");
  const hp = hpC ? hpC.currentValue : CFG.maxHp;

  // ----- enraged / "armored" phase
  const enraged = hp <= CFG.maxHp * CFG.enragedAt;
  if (enraged !== !!s.props["zt:enraged"]) {
    if (enraged || hp > CFG.maxHp * (CFG.enragedAt + 0.02)) prop(e, s, "zt:enraged", enraged);
    if (enraged && !s.enragedAnnounced) {
      s.enragedAnnounced = true;
      U.tell(dim, loc, 128, "§4§lThe Zombie Titan is ENRAGED! §r§cIt moves faster and shrugs off arrows.");
      U.sound(dim, "zt.titan.roar", loc, 3, 0.8);
    }
  }
  const fury = s.props["zt:enraged"] ? 2 : 1;

  // ----- regeneration (faster at night, like the Java mod)
  const night = isNight();
  if (--s.regenTick <= 0) {
    s.regenTick = night ? 10 : 20;
    let amount = 10;
    if (U.chance(1 / 3)) amount += 10;
    if (U.chance(1 / 4)) amount += 10;
    if (U.chance(1 / 5)) amount += 10;
    if (U.chance(1 / 6)) amount += 10;
    if (hpC && hp < CFG.maxHp && hp > 0) hpC.setCurrentValue(Math.min(CFG.maxHp, hp + amount));
  }

  // ----- name / boss bar text
  if (--s.nameTick <= 0) {
    s.nameTick = 10;
    updateName(e, s, false);
  }

  // ----- target
  if (--s.targetTick <= 0 || !U.isValid(s.target)) {
    s.targetTick = 10;
    s.target = pickTarget(e, s);
  }
  const target = s.target;

  // ----- running an attack
  if (s.anim !== ANIM.NONE) {
    s.prevT = s.t;
    s.t += s.anim === ANIM.LEAP ? 1 : fury;
    if (target && s.t <= (TRACK_UNTIL[s.anim] ?? 0)) turnToward(e, s, U.yawTo(loc, target.location), 6);
    if (s.anim === ANIM.LEAP) leapTick(e, s);
    else followGround(e, s, 0, 0, false);
    prop(e, s, "zt:moving", false);
    runAttack(e, s, target);
    if (s.t >= (DURATION[s.anim] ?? 60)) {
      const wasStun = s.anim === ANIM.STUN;
      startAnim(e, s, ANIM.NONE);
      s.cooldown = wasStun ? 10 : U.randInt(8, 20);
    }
    applyRotation(e, s);
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
    turnToward(e, s, want, CFG.turnRate * (fury > 1 ? 1.4 : 1));
    const d = U.dist2D(loc, tl);
    const dy = tl.y - loc.y;
    if (s.cooldown <= 0 && chooseAttack(e, s, target, d, dy, off, hp)) {
      applyRotation(e, s);
      return;
    }
    if (d > CFG.approachRange && off < 60) speed = CFG.walkSpeed * (fury > 1 ? 1.5 : 1);
  } else {
    // wander now and then, like EntityAITitanWander
    s.idleTicks++;
    if (s.wanderTicks > 0) {
      s.wanderTicks--;
      turnToward(e, s, s.wanderYaw, 2);
      if (Math.abs(U.wrapDeg(s.wanderYaw - s.yaw)) < 20) speed = CFG.walkSpeed * 0.6;
    } else if (s.idleTicks > 200 && U.chance(1 / 300)) {
      s.wanderYaw = s.yaw + U.rand(-120, 120);
      s.wanderTicks = U.randInt(80, 180);
    }
  }

  followGround(e, s, speed, s.yaw, false);
  const moving = speed > 0;
  if (moving && !s.moving) s.stepTick = 0;
  s.moving = moving;
  prop(e, s, "zt:moving", moving);
  if (moving) walkEffects(e, s, fury);

  // ----- minions
  if (target && --s.minionTick <= 0) {
    s.minionTick = fury > 1 ? 60 : 100;
    const cap = fury > 1 ? CFG.minionCapEnraged : CFG.minionCap;
    if (countMinions(e) < cap) spawnMinion(e, undefined, randomAround(e, 7, 15));
  }
  applyRotation(e, s);
}

/** @param {Entity} e @param {any} s */
function applyRotation(e, s) {
  try {
    e.setRotation({ x: 0, y: s.yaw });
  } catch {
    /* ignore */
  }
}

/** @param {Entity} e @param {any} s @param {number} want @param {number} rate */
function turnToward(e, s, want, rate) {
  const diff = U.wrapDeg(want - s.yaw);
  s.yaw = U.wrapDeg(s.yaw + Math.max(-rate, Math.min(rate, diff)));
}

/**
 * Moves the titan `speed` blocks along `yaw` and keeps its feet on the ground.
 * The titan has no block collision: it wades through hills and trees like the
 * Java titans do, so terrain can never trap it.
 */
/** @param {Entity} e @param {any} s @param {number} speed @param {number} yaw @param {boolean} birth */
function followGround(e, s, speed, yaw, birth) {
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

/** @param {Entity} e @param {any} s @param {number} fury */
function walkEffects(e, s, fury) {
  const period = fury > 1 ? 21 : 32;
  if (s.stepTick-- > 0) return;
  s.stepTick = period;
  s.foot = -s.foot;
  const dim = e.dimension;
  const footPos = U.offsetFrom(e.location, s.yaw, 2, s.foot * 2, 0);
  U.sound(dim, "zt.titan.step", footPos, 2.2, 1);
  U.particle(dim, "zt:footstep", footPos);
  U.quake(dim, footPos, 40, 0.8, 0.35);
  // crush whatever it steps on (Java: squish damage = attack / 2)
  for (const v of U.livingAround(dim, footPos, 4.5, { excludeFamilies: ["zt_ally", "inanimate"] })) {
    if (U.dist2D(v.location, footPos) > 3.5 || v.location.y - e.location.y > 3) continue;
    U.hurt(v, baseDamage(s) / 2, e);
  }
  trample(e, s);
}

/** Smash trees and plants in the titan's path (only when mobGriefing is on). */
/** @param {Entity} e @param {any} s */
function trample(e, s) {
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

// =============================================================================
// targeting
// =============================================================================
/** @param {Entity} e @param {number} range @returns {Player | undefined} */
function nearestPlayer(e, range) {
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

/** @param {Entity} e @param {any} s @returns {Entity | undefined} */
function pickTarget(e, s) {
  if (U.isValid(s.revenge)) {
    const r = s.revenge;
    const ok = r.typeId !== "minecraft:player" || U.isVulnerablePlayer(r);
    if (ok && U.dist2D(r.location, e.location) < CFG.targetRange + 16 && r.dimension.id === e.dimension.id) return r;
    s.revenge = undefined;
  }
  const p = nearestPlayer(e, CFG.targetRange);
  if (p) return p;
  let best;
  let bestD = Infinity;
  for (const m of U.livingAround(e.dimension, e.location, 48)) {
    if (!TARGET_MOBS.has(m.typeId)) continue;
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

function isNight() {
  const t = world.getTimeOfDay();
  return t >= 13000 && t <= 23000;
}

// =============================================================================
// attacks
// =============================================================================
/** @param {Entity} e @param {any} s @param {Entity} target @param {number} d @param {number} dy @param {number} off @param {number} hp */
function chooseAttack(e, s, target, d, dy, off, hp) {
  // things high above it (flying players, pillars) get swatted
  if (dy > 10 && d < 26) {
    startAnim(e, s, ANIM.SWAT);
    return true;
  }
  if (d <= CFG.meleeRange && off < 35) {
    switch (U.randInt(0, 4)) {
      case 0:
        startAnim(e, s, ANIM.STOMP);
        break;
      case 1:
        if (s.armed) startAnim(e, s, ANIM.SLASH_DOWN);
        else startAnim(e, s, U.chance(0.5) ? ANIM.REFORM : ANIM.KICK);
        break;
      case 2:
        startAnim(e, s, ANIM.SLASH_SIDE);
        break;
      case 3:
        startAnim(e, s, d < 13 ? ANIM.KICK : ANIM.SMASH);
        break;
      default:
        startAnim(e, s, ANIM.SMASH);
    }
    return true;
  }
  if (d > 24 && U.chance(1 / 100)) {
    const r = U.randInt(0, 3);
    if (r === 0 && countMinions(e) < CFG.minionCap) startAnim(e, s, ANIM.ROAR);
    else startAnim(e, s, r % 2 === 0 ? ANIM.LIGHTNING : ANIM.SPIT);
    return true;
  }
  if (hp <= CFG.maxHp / 2 && d > 22 && d < 70 && U.chance(1 / 120)) {
    startAnim(e, s, ANIM.LEAP);
    return true;
  }
  return false;
}

/** @param {Entity} e @param {any} s @param {Entity | undefined} target */
function runAttack(e, s, target) {
  const dim = e.dimension;
  const loc = e.location;
  const yaw = s.yaw;
  const base = baseDamage(s);
  switch (s.anim) {
    case ANIM.KICK: {
      if (crossed(s, 24)) U.sound(dim, "zt.titan.swing", loc, 2, 1);
      if (crossed(s, 30)) {
        const c = U.offsetFrom(loc, yaw, 8, 1.5, 0);
        hitZone(e, s, c, 7.5, -1, 12, base, (v) => {
          const dir = U.forward(yaw);
          U.knock(v, dir.x, dir.z, 5, 1.6);
        });
        U.particle(dim, "zt:footstep", c);
        U.quake(dim, c, 30, 1.2, 0.4);
        U.sound(dim, "zt.titan.slam", c, 1.5, 1.3);
      }
      break;
    }
    case ANIM.REFORM: {
      if (crossed(s, 44)) U.sound(dim, "zt.titan.swing", loc, 2, 0.8);
      if (crossed(s, 50)) groundPound(e, s, U.offsetFrom(loc, yaw, 8), 20, base, 2.5);
      if (s.t > 60 && s.t < 150 && s.t % 20 < 2) {
        U.particle(dim, "zt:rumble", U.offsetFrom(loc, yaw, 8), { radius: 4 });
        U.quake(dim, loc, 32, 0.4, 0.3);
      }
      if (crossed(s, 160)) {
        setArmed(e, s, true);
        U.sound(dim, "zt.titan.summon", loc, 2, 0.5);
        U.sound(dim, "zt.titan.clang", loc, 2, 1.2);
        U.particle(dim, "zt:spark_burst", U.offsetFrom(loc, yaw, 6, 6, 20), { color: { red: 1, green: 1, blue: 0.85 } });
        U.tell(dim, loc, 96, "§6The Zombie Titan forged a new sword from the earth! §7(It can't be hurt while it holds it.)");
      }
      break;
    }
    case ANIM.SMASH: {
      if (crossed(s, 26)) U.sound(dim, "zt.titan.swing", loc, 2, 0.9);
      if (crossed(s, 32)) groundPound(e, s, U.offsetFrom(loc, yaw, 12), 18, base, 2.5);
      break;
    }
    case ANIM.SWAT: {
      if (crossed(s, 12) && U.isValid(target)) {
        const tl = target.location;
        if (U.dist2D(tl, loc) < 34) {
          U.sound(dim, "zt.titan.swing", tl, 2, 1.2);
          U.sound(dim, "zt.titan.slam", tl, 1.2, 1.5);
          for (const v of U.livingAround(dim, tl, 10, { excludeFamilies: ["zt_ally", "inanimate"] })) {
            U.hurt(v, v.id === target.id ? base * 4 : base * 2, e);
            const away = U.sub(v.location, loc);
            U.knock(v, away.x, away.z, 3.5, 0.9);
          }
          U.particle(dim, "minecraft:huge_explosion_emitter", tl);
        }
      }
      break;
    }
    case ANIM.LIGHTNING: {
      if (s.t >= 26 && s.t <= 46 && s.t % 5 < (s.props["zt:enraged"] ? 2 : 1)) {
        for (const side of [-9.5, 9.5]) {
          const hand = U.offsetFrom(loc, yaw, 1, side, 26);
          try {
            dim.spawnEntity("minecraft:lightning_bolt", hand);
          } catch {
            /* ignore */
          }
        }
      }
      if (crossed(s, 30)) U.sound(dim, "zt.titan.roar", loc, 3, 0.9);
      if (crossed(s, 64) && U.isValid(target)) superZombu(e, s, target, base);
      break;
    }
    case ANIM.STOMP: {
      if (crossed(s, 60)) stomp(e, s, 1, base);
      if (crossed(s, 104)) stomp(e, s, -1, base);
      break;
    }
    case ANIM.SLASH_DOWN: {
      if (crossed(s, 30)) U.sound(dim, "zt.titan.roar", loc, 2, 1.0);
      if (crossed(s, 112)) U.sound(dim, "zt.titan.swing", loc, 3, 0.6);
      if (crossed(s, 120)) downwardSlash(e, s, base);
      break;
    }
    case ANIM.STUN: {
      if (s.t % 30 < 2 && s.t < 100) U.sound(dim, "zt.titan.hurt", loc, 2, 0.9);
      break;
    }
    case ANIM.SLASH_SIDE: {
      if (crossed(s, 100)) U.sound(dim, "zt.titan.swing", loc, 3, 0.7);
      if (s.t >= 106 && s.prevT <= 110) sidewaysSlash(e, s, base);
      break;
    }
    case ANIM.ROAR: {
      if (crossed(s, 24)) {
        U.sound(dim, "zt.titan.roar", loc, 4, 0.85);
        U.particle(dim, "minecraft:knockback_roar_particle", U.offsetFrom(loc, yaw, 3, 0, 26));
        U.quake(dim, loc, 64, 1.5, 1.5);
        for (const v of U.livingAround(dim, loc, 16, { excludeFamilies: ["zt_ally", "inanimate"] })) {
          const away = U.sub(v.location, loc);
          U.knock(v, away.x, away.z, 2.5, 0.6);
        }
      }
      if (crossed(s, 30)) {
        // "ZOMBIE APOCALYPSE": a wave of minions claws out of the ground
        const n = Math.max(0, Math.min(6, CFG.hardMinionCap - countMinions(e)));
        for (let i = 0; i < n; i++) spawnMinion(e, undefined, randomAround(e, 8, 18));
        if (n > 0) U.tell(dim, loc, 96, "§2The Zombie Titan calls its minions!");
      }
      break;
    }
    case ANIM.SPIT: {
      if (crossed(s, 40)) U.sound(dim, "zt.titan.ambient", loc, 3, 0.7);
      const extra = world.getDifficulty() === Difficulty.Hard ? 2 : 0;
      if (s.t >= 52 && s.t <= 60 + extra * 2 && s.t % 2 === 0 && s.prevT !== s.t && U.isValid(target)) {
        spitProtoBall(e, s, target);
      }
      break;
    }
    default:
      break;
  }
}

/** All living things in a cylinder (not allies), each hit once per swing. */
/** @param {Entity} e @param {any} s @param {Vector3} center @param {number} radius @param {number} yDown @param {number} yUp @param {number} damage @param {(v: Entity) => void} [onHit] */
function hitZone(e, s, center, radius, yDown, yUp, damage, onHit) {
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
function groundPound(e, s, center, radius, damage, shake) {
  const dim = e.dimension;
  hitZone(e, s, center, radius, -2, 4, damage, (v) => {
    const away = U.sub(v.location, center);
    U.knock(v, away.x, away.z, 2.5, 0.8);
  });
  U.particle(dim, "zt:shockwave", center, { radius });
  U.particle(dim, "zt:shockwave_dust", center, { radius });
  U.sound(dim, "zt.titan.slam", center, 3, 0.9);
  U.quake(dim, center, radius * 3, shake, 0.8);
}

/** @param {Entity} e @param {any} s @param {number} side @param {number} base */
function stomp(e, s, side, base) {
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
  U.sound(dim, "zt.titan.slam", foot, 4, 0.75);
  U.sound(dim, "zt.titan.step", foot, 3, 0.8);
  U.quake(dim, foot, 80, 3, 1.0);
}

/** @param {Entity} e @param {any} s @param {Entity} target @param {number} base */
function superZombu(e, s, target, base) {
  const dim = e.dimension;
  const tl = target.location;
  U.hurt(target, base * 3, e);
  U.knock(target, 0, 0, 0, 1.0 + Math.random());
  try {
    dim.spawnEntity("minecraft:lightning_bolt", tl);
    dim.createExplosion(tl, 2, { breaksBlocks: false, causesFire: false, source: e });
  } catch {
    /* ignore */
  }
  for (const v of U.livingAround(dim, tl, 12, { excludeFamilies: ["zt_ally", "inanimate"] })) {
    if (v.id === target.id) continue;
    U.hurt(v, base, e);
    U.knock(v, 0, 0, 0, 1.0 + Math.random());
    try {
      dim.spawnEntity("minecraft:lightning_bolt", v.location);
    } catch {
      /* ignore */
    }
  }
  U.quake(dim, tl, 48, 2, 0.8);
}

/** @param {Entity} e @param {any} s @param {number} base */
function downwardSlash(e, s, base) {
  const dim = e.dimension;
  const loc = e.location;
  const yaw = s.yaw;
  const a = U.offsetFrom(loc, yaw, 6, 0, 0);
  const b = U.offsetFrom(loc, yaw, 40, 0, 0);
  // the blade itself: a 9 block wide strip, x10 damage
  for (const v of U.livingAround(dim, U.offsetFrom(loc, yaw, 23, 0, 0), 24, { excludeFamilies: ["zt_ally", "inanimate"] })) {
    const vs = U.bodySize(v);
    const flat = { x: v.location.x, y: a.y, z: v.location.z };
    if (U.distToSegment(flat, a, b) > 4.5 + vs.r) continue;
    if (v.location.y - loc.y > 12) continue;
    s.hitThisSwing.add(v.id);
    U.hurt(v, base * 10, e);
  }
  const impact = U.offsetFrom(loc, yaw, 30, 0, 0);
  hitZone(e, s, impact, 8, -2, 5, base, (v) => {
    const away = U.sub(v.location, impact);
    U.knock(v, away.x, away.z, 2, 0.7);
  });
  for (let d = 10; d <= 38; d += 7) U.particle(dim, "zt:shockwave_dust", U.offsetFrom(loc, yaw, d), { radius: 5 });
  U.particle(dim, "zt:shockwave", impact, { radius: 12 });
  U.sound(dim, "zt.titan.slam", impact, 4, 0.7);
  U.sound(dim, "zt.titan.clang", impact, 3, 0.8);
  U.quake(dim, impact, 90, 3.5, 1.0);

  // Java mechanic: slamming the sword into obsidian-hard blocks breaks it and stuns the titan
  if (!s.armed) return;
  for (let d = 8; d <= 40; d += 1) {
    for (let side = -3; side <= 3; side += 1) {
      const p = U.offsetFrom(loc, yaw, d, side, 0);
      for (let dy = -2; dy <= 1; dy++) {
        let blk;
        try {
          blk = dim.getBlock({ x: Math.floor(p.x), y: Math.floor(loc.y + dy), z: Math.floor(p.z) });
        } catch {
          blk = undefined;
        }
        if (blk && SWORD_BREAKERS.has(blk.typeId)) {
          breakSword(e, s, blk.location);
          return;
        }
      }
    }
  }
}

/** @param {Entity} e @param {any} s @param {Vector3} where */
function breakSword(e, s, where) {
  const dim = e.dimension;
  const loc = e.location;
  setArmed(e, s, false);
  startAnim(e, s, ANIM.STUN);
  U.sound(dim, "zt.titan.clang", where, 4, 0.5);
  U.sound(dim, "random.anvil_break", where, 3, 0.5);
  U.particle(dim, "zt:spark_burst", { x: where.x + 0.5, y: where.y + 1.5, z: where.z + 0.5 }, { color: { red: 1, green: 0.9, blue: 0.5 } });
  // the shattered sword rains down as sticks and iron (Java: 16 sticks + 32 iron)
  dropItems(dim, U.offsetFrom(loc, s.yaw, 20, 0, 12), [["minecraft:stick", 16], ["minecraft:iron_ingot", 32]], 6);
  U.tell(dim, loc, 128, "§e§lCLANG! §r§eThe Zombie Titan's sword shattered on the hard block! §aIt's stunned and can be hurt now!");
}

/** @param {Entity} e @param {any} s @param {number} base */
function sidewaysSlash(e, s, base) {
  const dim = e.dimension;
  const loc = e.location;
  const yaw = s.yaw;
  const left = U.scale(U.rightOf(yaw), -1);
  for (const v of U.livingAround(dim, loc, 40, { excludeFamilies: ["zt_ally", "inanimate"] })) {
    if (s.hitThisSwing.has(v.id)) continue;
    const d = U.dist2D(v.location, loc);
    if (d < 3 || d > 34) continue;
    const ang = Math.abs(U.wrapDeg(U.yawTo(loc, v.location) - yaw));
    if (ang > 75) continue;
    const y = v.location.y - loc.y;
    if (y < -3 || y > 18) continue;
    s.hitThisSwing.add(v.id);
    U.hurt(v, base * 3, e);
    U.knock(v, left.x, left.z, 3.2, 0.8);
  }
  if (s.t >= 108 && s.prevT < 108) {
    U.sound(dim, "zt.titan.slam", U.offsetFrom(loc, yaw, 18), 2, 1.2);
    U.quake(dim, loc, 48, 1.2, 0.4);
  }
}

// ------------------------------------------------------------------ leap
/** @param {Entity} e @param {any} s */
function leapTick(e, s) {
  const dim = e.dimension;
  const loc = e.location;
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
    U.sound(dim, "zt.titan.roar", loc, 3, 1.0);
    U.particle(dim, "zt:shockwave_dust", loc, { radius: 8 });
    U.quake(dim, loc, 48, 1.5, 0.5);
  }
  const L = s.leap;
  const u1 = Math.min(1, (s.t - 12) / 26);
  const u0 = Math.max(0, (s.prevT - 12) / 26);
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
    const base = baseDamage(s);
    for (const v of U.livingAround(dim, loc, 48, { excludeFamilies: ["zt_ally", "inanimate"] })) {
      const d = U.len(U.sub(v.location, loc));
      U.hurt(v, Math.max(1, 50 - d) * (base / CFG.baseAttack), e);
      const away = U.sub(v.location, loc);
      U.knock(v, away.x, away.z, 2.2, 0.7);
    }
    U.particle(dim, "zt:shockwave", loc, { radius: 30 });
    U.particle(dim, "zt:shockwave_dust", loc, { radius: 24 });
    U.sound(dim, "zt.titan.fall", loc, 4, 1.0);
    U.quake(dim, loc, 100, 4, 1.2);
    s.groundY = loc.y;
    s.leap = undefined;
  }
}

// ------------------------------------------------------------------ proto balls
/** @param {Entity} e @param {any} s @param {Entity} target */
function spitProtoBall(e, s, target) {
  const dim = e.dimension;
  const mouth = U.offsetFrom(e.location, s.yaw, 6, 0, 26);
  const tl = target.location;
  const aim = { x: tl.x + U.rand(-6, 6), y: tl.y, z: tl.z + U.rand(-6, 6) };
  const g = 0.05;
  const flat = U.dist2D(aim, mouth);
  const T = Math.max(18, Math.min(60, 14 + flat * 0.6));
  const vel = { x: (aim.x - mouth.x) / T, y: (aim.y - mouth.y + 0.5 * g * T * T) / T, z: (aim.z - mouth.z) / T };
  try {
    const ball = dim.spawnEntity(PROTO, mouth);
    const proj = ball.getComponent("minecraft:projectile");
    if (proj) {
      proj.owner = e;
      proj.shoot(vel);
    } else {
      ball.applyImpulse(vel);
    }
    protoBalls.set(ball.id, system.currentTick);
  } catch (err) {
    warn("proto ball: " + err);
  }
  U.sound(dim, "zt.titan.spit", mouth, 3, 1);
}

/** A proto ball landed: burst and a few minions climb out (Java: "summons hordes of minions"). */
/** @param {Entity} projectile @param {Dimension} dim @param {Vector3} location */
export function onProtoBallHit(projectile, dim, location) {
  protoBalls.delete(projectile.id);
  U.particle(dim, "zt:proto_burst", location);
  U.sound(dim, "zt.titan.splat", location, 2, 0.8);
  for (const v of U.livingAround(dim, location, 3.5, { excludeFamilies: ["zt_ally", "inanimate"] })) {
    U.hurt(v, 8, undefined, "entityExplosion");
  }
  let owner;
  try {
    owner = projectile.getComponent("minecraft:projectile")?.owner;
  } catch {
    owner = undefined;
  }
  const near = countMinionsAt(dim, location);
  if (near >= CFG.hardMinionCap) return;
  const n = U.chance(0.35) ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const at = { x: location.x + U.rand(-1.5, 1.5), y: location.y, z: location.z + U.rand(-1.5, 1.5) };
    const gy = U.groundY(dim, at.x, at.z, at.y + 3, 12);
    if (gy !== undefined) at.y = gy;
    spawnMinion(owner, "zt:as_loyalist", at, dim);
  }
  try {
    projectile.remove();
  } catch {
    /* already gone */
  }
}

function cleanProtoBalls(tick) {
  for (const [id, born] of protoBalls) {
    if (tick - born > 240) protoBalls.delete(id);
  }
}

// ------------------------------------------------------------------ minions
/** @param {Entity} e */
function countMinions(e) {
  return countMinionsAt(e.dimension, e.location);
}

/** @param {Dimension} dim @param {Vector3} location */
function countMinionsAt(dim, location) {
  try {
    return dim.getEntities({ type: MINION, location, maxDistance: 64 }).length;
  } catch {
    return 0;
  }
}

/** @param {Entity} e @param {number} rMin @param {number} rMax @returns {Vector3} */
function randomAround(e, rMin, rMax) {
  const loc = e.location;
  const a = Math.random() * Math.PI * 2;
  const r = U.rand(rMin, rMax);
  const p = { x: loc.x + Math.cos(a) * r, y: loc.y, z: loc.z + Math.sin(a) * r };
  const gy = U.groundY(e.dimension, p.x, p.z, loc.y + 12, 30);
  if (gy !== undefined) p.y = gy;
  return p;
}

function minionEvent() {
  const r = Math.random();
  if (r < 0.6) return "zt:as_loyalist";
  if (r < 0.8) return "zt:as_priest";
  if (r < 0.95) return "zt:as_zealot";
  return "zt:as_templar";
}

/** @param {Entity | undefined} titan @param {string | undefined} event @param {Vector3} at @param {Dimension} [dimOverride] */
export function spawnMinion(titan, event, at, dimOverride) {
  const dim = dimOverride ?? titan?.dimension;
  if (!dim) return undefined;
  try {
    const m = dim.spawnEntity(MINION, at, { spawnEvent: event ?? minionEvent() });
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
// name / boss bar
// =============================================================================
/** @param {Entity} e @param {any} s @param {boolean} force */
function updateName(e, s, force) {
  let hp = CFG.maxHp;
  try {
    hp = Math.ceil(e.getComponent("minecraft:health").currentValue);
  } catch {
    /* ignore */
  }
  if (!force && hp === s.lastHpShown) return;
  s.lastHpShown = hp;
  const sword = s.armed ? " §8[§7Sword§8]" : "";
  const rage = s.props["zt:enraged"] ? " §4[ENRAGED]" : "";
  try {
    e.nameTag = `§l§2Zombie Titan§r §c${hp.toLocaleString("en-US")}§7/§c${CFG.maxHp.toLocaleString("en-US")}${sword}${rage}`;
  } catch {
    /* ignore */
  }
}

// =============================================================================
// sword parry feedback
// =============================================================================
const parryTip = new Map();
const SWORD_TIP =
  "§6While the Zombie Titan holds its sword, it can't be hurt by players. §ePlace §5Obsidian§e in front of you, " +
  "and when it raises its sword for a §lDownward Slash§r§e, run sideways! If the sword hits the obsidian it shatters " +
  "and the titan is stunned.";

/**
 * A Dark Fists ability hit an armed titan: explain why nothing happened (at most every 20 s).
 * @param {Player} player @param {Entity} titan
 */
export function notifySwordBlocked(player, titan) {
  const s = stateOf(titan);
  if (!s.armed) return;
  const now = system.currentTick;
  if ((parryTip.get(player.id) ?? 0) < now) {
    parryTip.set(player.id, now + 400);
    player.sendMessage(SWORD_TIP);
  }
}
/** @param {Player} player @param {Entity} titan */
export function onPlayerHitTitan(player, titan) {
  const s = stateOf(titan);
  onTitanHurt(titan, player);
  if (!s.armed) return;
  const dim = titan.dimension;
  const at = player.getHeadLocation();
  const f = player.getViewDirection();
  U.particle(dim, "zt:spark_burst", { x: at.x + f.x * 2, y: at.y + f.y * 2, z: at.z + f.z * 2 }, { color: { red: 1, green: 0.95, blue: 0.7 } });
  U.sound(dim, "zt.titan.block", at, 1, 1);
  const now = system.currentTick;
  if ((parryTip.get(player.id) ?? 0) < now) {
    parryTip.set(player.id, now + 400);
    U.actionbar(player, "§7The titan's §fgiant sword§7 blocks you! §eMake its Downward Slash hit §5Obsidian§e to break it.");
    player.sendMessage(SWORD_TIP);
  }
}

// =============================================================================
// death -> corpse
// =============================================================================
/** @param {Entity} dead @param {import("@minecraft/server").EntityDamageSource} damageSource */
export function onTitanDied(dead, damageSource) {
  let loc;
  let dim;
  let yaw = 0;
  let armed = false;
  try {
    loc = dead.location;
    dim = dead.dimension;
    yaw = dead.getRotation().y;
    armed = !!dead.getProperty("zt:armed");
  } catch {
    return;
  }
  const s = titans.get(dead.id);
  if (s) {
    yaw = s.yaw;
    armed = s.armed;
    titans.delete(dead.id);
  }
  try {
    dead.remove();
  } catch {
    /* the vanilla death animation plays instead */
  }
  let corpse;
  try {
    corpse = dim.spawnEntity(CORPSE, loc);
    corpse.setRotation({ x: 0, y: yaw });
    corpse.setProperty("zt:armed", armed);
  } catch (err) {
    warn("corpse: " + err);
    return;
  }
  let killer = damageSource?.damagingEntity;
  if (!U.isValid(killer) || killer.typeId !== "minecraft:player") killer = undefined;
  corpses.set(corpse.id, { entity: corpse, t: 0, killer, armed, yaw, loc: { x: loc.x, y: loc.y, z: loc.z } });
  const who = killer ? " by §f" + /** @type {Player} */ (killer).name + "§a" : "";
  U.tell(dim, loc, 200, `§a§lThe Zombie Titan has been slain${who}!`);
}

const LOOT = [
  // Java 0.45 drops: 128-255 rotten flesh, 32-63 bones / coal / iron, 8-15 emeralds and diamonds,
  // up to 3 harcadium (netherite scrap here) and a 1 in 10 chance of bedrock
  ["minecraft:rotten_flesh", 128, 255],
  ["minecraft:bone", 32, 63],
  ["minecraft:coal", 32, 63],
  ["minecraft:iron_ingot", 32, 63],
  ["minecraft:emerald", 8, 15],
  ["minecraft:diamond", 8, 15],
  ["minecraft:netherite_scrap", 0, 3],
];

/** @param {any} c */
function tickCorpse(c) {
  const e = c.entity;
  const dim = e.dimension;
  const loc = c.loc ?? e.location;
  const yaw = c.yaw;
  c.t++;
  const t = c.t;
  if (t === 1) {
    U.sound(dim, "zt.titan.death", loc, 4, 1);
    U.sound(dim, "zt.titan.roar", loc, 4, 0.7);
    U.quake(dim, loc, 80, 1.2, 1.5);
  }
  if (t === 36 || t === 56) {
    U.sound(dim, "zt.titan.step", loc, 3, 0.9);
    U.quake(dim, loc, 60, 1.2, 0.5);
  }
  if (t === 132) {
    // the titan crashes to the ground, face first
    U.sound(dim, "zt.titan.fall", loc, 5, 1);
    U.sound(dim, "zt.titan.slam", U.offsetFrom(loc, yaw, 16), 5, 0.6);
    U.quake(dim, loc, 120, 4, 1.6);
    for (let d = 2; d <= 30; d += 5) U.particle(dim, "zt:shockwave_dust", U.offsetFrom(loc, yaw, d), { radius: 7 });
    U.particle(dim, "zt:shockwave", U.offsetFrom(loc, yaw, 16), { radius: 24 });
    const a = U.offsetFrom(loc, yaw, 0);
    const b = U.offsetFrom(loc, yaw, 32);
    for (const v of U.livingAround(dim, U.offsetFrom(loc, yaw, 16), 22, { excludeFamilies: ["zt_ally", "inanimate"] })) {
      if (U.distToSegment({ x: v.location.x, y: loc.y, z: v.location.z }, a, b) > 6) continue;
      U.hurt(v, 6, undefined, "fallingBlock");
      const r = U.rightOf(yaw);
      const side = (v.location.x - loc.x) * r.x + (v.location.z - loc.z) * r.z >= 0 ? 1 : -1;
      U.knock(v, r.x * side, r.z * side, 1.8, 0.6);
    }
  }
  if (t > 150 && t < 290 && t % 10 === 0) {
    const p = U.offsetFrom(loc, yaw, U.rand(2, 30), U.rand(-4, 4), U.rand(1, 5));
    U.particle(dim, t % 20 === 0 ? "minecraft:huge_explosion_emitter" : "minecraft:large_explosion", p);
    if (t % 30 === 0) U.sound(dim, "random.explode", p, 2, 0.6);
    for (let i = 0; i < 3; i++) {
      try {
        dim.spawnEntity("minecraft:xp_orb", U.offsetFrom(loc, yaw, U.rand(4, 28), U.rand(-3, 3), 8));
      } catch {
        /* ignore */
      }
    }
  }
  if (t === 170 && world.gameRules.doMobLoot) {
    /** @type {Array<[string, number]>} */
    const items = LOOT.map(([id, lo, hi]) => /** @type {[string, number]} */ ([String(id), U.randInt(Number(lo), Number(hi))]));
    const rare = ["minecraft:iron_ingot", "minecraft:carrot", "minecraft:potato"][U.randInt(0, 2)];
    items.push([rare, 64]);
    if (U.chance(0.1)) items.push(["minecraft:bedrock", 1]);
    if (c.armed) items.push(["minecraft:stick", 16], ["minecraft:iron_ingot", 32]);
    dropItems(dim, U.offsetFrom(loc, yaw, 16, 0, 10), items, 10);
    try {
      e.setDynamicProperty("zt:looted", true);
    } catch {
      /* ignore */
    }
    let rewarded = c.killer;
    if (!U.isValid(rewarded)) {
      try {
        rewarded = dim.getPlayers({ location: loc, maxDistance: 64, closest: 1 })[0];
      } catch {
        rewarded = undefined;
      }
    }
    if (rewarded) {
      try {
        rewarded.addExperience(CFG.xpReward);
        rewarded.sendMessage("§a+10,000 XP for slaying the Zombie Titan!");
      } catch {
        /* ignore */
      }
    }
  }
  if (t >= 300) {
    try {
      e.remove();
    } catch {
      /* ignore */
    }
    corpses.delete(e.id);
  }
}

/** Throws stacks of items out of the air over a spot. */
/** @param {Dimension} dim @param {Vector3} center @param {Array<[string, number]>} items @param {number} spread */
function dropItems(dim, center, items, spread) {
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

/** Every 30 seconds at night there is a small chance a titan claws its way out near a player. */
export function naturalSpawnTick() {
  if (!naturalSpawnsEnabled()) return;
  if (world.getDifficulty() === Difficulty.Peaceful || !isNight()) return;
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
    if (dim.getEntities({ type: TITAN, location: p.location, maxDistance: 256 }).length > 0) continue;
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
        const titan = dim.spawnEntity(TITAN, at);
        pendingNatural.add(titan.id);
        world.setDynamicProperty(LAST_SPAWN_KEY, now);
        for (const q of dim.getPlayers({ location: at, maxDistance: 160 })) {
          q.onScreenDisplay.setTitle("§2The ground trembles...", {
            subtitle: "§aA Zombie Titan is rising nearby!",
            fadeInDuration: 10,
            stayDuration: 60,
            fadeOutDuration: 20,
          });
        }
      } catch (err) {
        warn("natural spawn: " + err);
      }
      return;
    }
  }
}
