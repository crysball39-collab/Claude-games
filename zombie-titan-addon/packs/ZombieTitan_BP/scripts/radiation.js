// Radiation: the fallout of the nukes (nukes.js keeps where they went off). It's strongest at
// ground zero and weaker the farther out, to 3000 blocks round Little Boy and 5000 round Fat
// Man (the Doomsday Missile leaves none), and it fades over ten days, shrinking back toward
// ground zero; where fallout overlaps it's worse. Six levels, None, Low, Medium, High, Extreme
// and DANGER, and the higher the worse what it does: hunger, weakness, nausea, mining fatigue,
// slowness, withering, blindness, and harm. It hurts mobs too, and a zombie it kills may rise
// again as a Radiation Zombie, whose hits leave radiation in what they strike and who spits it
// at what's out of reach.
//
// The Radiation Detector, held, reads the level where you stand and clicks; used, it tells
// more. A Hazmat suit keeps radiation off up to High (each missing piece lets more in); beyond
// what it's made for, it still helps, but wears out.
import { MolangVariableMap, system, world } from "@minecraft/server";
import * as Bullets from "./bullets.js";
import * as Nukes from "./nukes.js";
import * as U from "./util.js";

/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {import("./nukes.js").Site} Site */

export const DETECTOR = "zt:radiation_detector";
export const ZOMBIE = "zt:radiation_zombie";
export const SPIT = Bullets.SPIT;
/** The Hazmat suit, by the slot each piece is worn in. */
export const HAZMAT = { Head: "zt:hazmat_helmet", Chest: "zt:hazmat_chestplate", Legs: "zt:hazmat_leggings", Feet: "zt:hazmat_boots" };
export const LEVELS = ["None", "Low", "Medium", "High", "Extreme", "DANGER"];
const COLORS = ["§a", "§e", "§6", "§c", "§4", "§5§l"];
/** The Geiger counter's clicking at each level (faster the higher). */
const GEIGER = ["", "zt.geiger.1", "zt.geiger.2", "zt.geiger.3", "zt.geiger.4", "zt.geiger.5"];
/** The zombies radiation can raise again. */
const ZOMBIES = new Set(["minecraft:zombie", "minecraft:husk", "minecraft:drowned", "minecraft:zombie_villager", "minecraft:zombie_villager_v2"]);
/** What a Radiation Zombie spits at, besides players. */
const PREY = new Set(["minecraft:villager", "minecraft:villager_v2", "minecraft:wandering_trader", "minecraft:iron_golem", "minecraft:snow_golem",
  "zt:player"]);

export const CFG = {
  /** Ticks the fallout lasts: ten Minecraft days. */
  life: 10 * 24000,
  /** The fallout's strength (0 to 6; its level is the whole part) at each fraction of its radius. */
  curve: [[0, 6], [0.1, 5], [0.2, 4], [0.367, 3], [0.6, 2], [1, 1]],
  /** How much of the weaker fallout counts where blasts overlap. */
  overlap: 0.35,
  convertChance: 0.6,
  spit: { min: 6, max: 24, cooldown: 70, damage: 3, speed: 1.1 },
  /** What a Radiation Zombie's hit and its spit leave in what they strike: a level, for so long. */
  hitDose: { level: 3, ticks: 120 },
  spitDose: { level: 3, ticks: 160 },
};

/** Effects at each level: [effect, amplifier]. */
const EFFECTS = [
  [],
  [["hunger", 0]],
  [["hunger", 1], ["weakness", 0]],
  [["hunger", 2], ["weakness", 1], ["mining_fatigue", 0], ["nausea", 0]],
  [["hunger", 3], ["weakness", 2], ["mining_fatigue", 1], ["nausea", 0], ["slowness", 0], ["wither", 0]],
  [["hunger", 4], ["weakness", 3], ["mining_fatigue", 2], ["nausea", 0], ["slowness", 1], ["wither", 1], ["blindness", 0]],
];
/** The harm it does at each level: so much, every so many ticks. */
export const HARM = [[0, 0], [0, 0], [1, 120], [2, 80], [3, 40], [4, 20]];

// =============================================================================================
// How strong it is where
// =============================================================================================
/** The strength of one site's fallout at (x, z), 0 to 6. @param {Site} s @param {number} x @param {number} z @param {number} now */
function strength(s, x, z, now) {
  const spec = Nukes.payload(s.k);
  if (!spec.fallout) return 0;
  const age = Math.max(0, now - s.t);
  if (age >= CFG.life) return 0;
  const R = spec.fallout * (1 - age / CFG.life);
  const d = Math.hypot(x - (s.x + 0.5), z - (s.z + 0.5));
  if (d >= R) return 0;
  const f = d / R;
  const c = CFG.curve;
  for (let i = 1; i < c.length; i++) {
    if (f <= c[i][0]) {
      const [f0, v0] = c[i - 1];
      const [f1, v1] = c[i];
      return v0 + ((v1 - v0) * (f - f0)) / (f1 - f0);
    }
  }
  return 1;
}
/** How strong the radiation is at a place, 0 to 6. @param {string} dimId @param {{x: number, z: number}} loc */
export function radiationAt(dimId, loc) {
  const now = U.nowTick();
  let max = 0;
  let sum = 0;
  for (const s of Nukes.sites()) {
    if (s.d !== dimId) continue;
    const v = strength(s, loc.x, loc.z, now);
    if (v <= 0) continue;
    sum += v;
    if (v > max) max = v;
  }
  return Math.min(6, max + CFG.overlap * (sum - max));
}
/** The level of radiation at a place: 0 (None) to 5 (DANGER). @param {string} dimId @param {{x: number, z: number}} loc */
export function levelAt(dimId, loc) {
  return Math.min(5, Math.floor(radiationAt(dimId, loc)));
}
/** Within the ash zone of a blast whose fallout hasn't faded (its air thick with ash)? @param {string} dimId @param {{x: number, z: number}} loc */
function inAsh(dimId, loc) {
  const now = U.nowTick();
  return Nukes.sites().some((s) => s.d === dimId && now - s.t < CFG.life && Math.hypot(loc.x - s.x, loc.z - s.z) <= Nukes.payload(s.k).ash);
}

// =============================================================================================
// Doses: what a Radiation Zombie's hits and spit leave in what they strike
// =============================================================================================
/** @type {Map<string, {level: number, until: number}>} */
const doses = new Map();
/** @param {Entity} e @param {number} level @param {number} ticks */
export function contaminate(e, level, ticks) {
  const now = system.currentTick;
  const d = doses.get(e.id);
  if (d && d.until > now) {
    d.level = Math.max(d.level, level);
    d.until = Math.min(now + 400, Math.max(d.until, now + ticks));
  } else doses.set(e.id, { level, until: now + ticks });
  if (e.typeId === "minecraft:player") U.actionbar(/** @type {Player} */ (e), "§2§lYou're contaminated with radiation!");
  harmAt.delete(e.id);
}
/** @param {Entity} e */
function doseOf(e) {
  const d = doses.get(e.id);
  if (!d) return 0;
  if (d.until <= system.currentTick) {
    doses.delete(e.id);
    return 0;
  }
  return d.level;
}

// =============================================================================================
// The Hazmat suit
// =============================================================================================
/** @param {Player} p @returns {number} how many pieces of the suit they wear */
export function suitPieces(p) {
  let n = 0;
  try {
    const eq = p.getComponent("minecraft:equippable");
    for (const [slot, id] of Object.entries(HAZMAT)) if (eq?.getEquipment(/** @type {any} */ (slot))?.typeId === id) n++;
  } catch {
    /* ignore */
  }
  return n;
}
/** Levels the suit keeps off: the whole of it, three (all of High); each missing piece, one fewer. @param {number} pieces */
export function protection(pieces) {
  return Math.max(0, pieces - 1);
}
/** Beyond what it's made for, the suit wears: each piece a point. @param {Player} p */
function wearSuit(p) {
  try {
    const eq = p.getComponent("minecraft:equippable");
    if (!eq) return;
    for (const [slot, id] of Object.entries(HAZMAT)) {
      const it = eq.getEquipment(/** @type {any} */ (slot));
      if (it?.typeId !== id) continue;
      const dur = it.getComponent("minecraft:durability");
      if (!dur) continue;
      if (dur.damage + 1 >= dur.maxDurability) {
        eq.setEquipment(/** @type {any} */ (slot), undefined);
        U.sound(p.dimension, "random.break", p.location);
      } else {
        dur.damage += 1;
        eq.setEquipment(/** @type {any} */ (slot), it);
      }
    }
  } catch {
    /* ignore */
  }
}

// =============================================================================================
// What it does
// =============================================================================================
/** @type {Map<string, number>} entity id -> when radiation next harms it */
const harmAt = new Map();
/** @type {Map<string, {tick: number, loc: Vector3, dim: string}>} entity id -> when (and where) radiation last harmed it */
const lastHarm = new Map();

/** @param {Entity} e @param {number} level @param {number} tick */
function harm(e, level, tick) {
  const [amount, every] = HARM[level];
  if (!amount) return;
  const due = harmAt.get(e.id);
  if (due !== undefined && tick < due) return;
  harmAt.set(e.id, tick + every);
  if (due === undefined) return;          // (the first time, it only starts counting)
  lastHarm.set(e.id, { tick, loc: { ...e.location }, dim: e.dimension.id });
  U.hurt(e, amount, undefined, "magic");
}

/** @typedef {{ raw: number, env: number, dose: number, pieces: number, felt: number }} Reading */
/** What radiation a player is in and feels. @param {Player} p @returns {Reading} */
export function reading(p) {
  const env = levelAt(p.dimension.id, p.location);
  const dose = doseOf(p);
  const raw = Math.max(env, dose);
  const pieces = suitPieces(p);
  return { raw, env, dose, pieces, felt: Math.max(0, raw - protection(pieces)) };
}

/** @type {Map<string, string>} player id -> the haze they see ("ash", "haze" or none) */
const hazeOf = new Map();
/** @param {Player} p @param {string} want */
function haze(p, want) {
  // (the game keeps a player's fog with them: a haze from before is cleared the first time)
  const had = hazeOf.has(p.id) ? hazeOf.get(p.id) ?? "" : "stale";
  if (had === want) return;
  hazeOf.set(p.id, want);
  try {
    if (had) p.runCommand("fog @s remove zt_fallout");
    if (want) p.runCommand(`fog @s push zt:nuclear_${want} zt_fallout`);
  } catch {
    /* ignore */
  }
}
/** @param {Player} p @param {string} id @param {Vector3} at @param {Record<string, number>} [vars] */
function playerParticle(p, id, at, vars) {
  try {
    if (vars) {
      const m = new MolangVariableMap();
      for (const [k, v] of Object.entries(vars)) m.setFloat("variable." + k, v);
      p.spawnParticle(id, at, m);
    } else p.spawnParticle(id, at);
  } catch {
    /* ignore */
  }
}

/** @param {Player} p @param {number} tick */
function playerTick(p, tick) {
  const r = reading(p);
  const vulnerable = U.isVulnerablePlayer(p);
  if (tick % 40 === 0 && vulnerable && r.felt > 0) {
    for (const [effect, amp] of EFFECTS[r.felt]) {
      try {
        p.addEffect(String(effect), effect === "nausea" ? 140 : 70, { amplifier: Number(amp), showParticles: false });
      } catch {
        /* ignore */
      }
    }
  }
  if (vulnerable) {
    if (r.felt >= 2) harm(p, r.felt, tick);
    else harmAt.delete(p.id);
    // (beyond High, the suit wears out)
    if (r.pieces && r.raw >= 4 && tick % (r.raw === 5 ? 20 : 60) === 0) wearSuit(p);
  }
  if (tick % 20 === 0) {
    const ash = inAsh(p.dimension.id, p.location);
    haze(p, ash ? "ash" : r.env >= 3 ? "haze" : "");
    if (ash) playerParticle(p, "zt:ash_fall", { x: p.location.x, y: p.location.y + 6, z: p.location.z });
    if (r.env >= 3) playerParticle(p, "zt:radiation_glow", { x: p.location.x, y: p.location.y + 1, z: p.location.z }, { level: r.env });
  }
  if (holding(p)) {
    if (tick % 10 === 0) U.actionbar(p, readout(r));
    if (tick % 40 === 0 && r.raw > 0) {
      try {
        p.playSound(GEIGER[r.raw]);
      } catch {
        /* ignore */
      }
    }
  }
}

/** @param {Player} p */
function holding(p) {
  try {
    const eq = p.getComponent("minecraft:equippable");
    return eq?.getEquipment(/** @type {any} */ ("Mainhand"))?.typeId === DETECTOR || eq?.getEquipment(/** @type {any} */ ("Offhand"))?.typeId === DETECTOR;
  } catch {
    return false;
  }
}
/** The detector's line on the screen. @param {Reading} r */
export function readout(r) {
  let s = `§lRadiation: ${COLORS[r.raw]}${LEVELS[r.raw].toUpperCase()}§r`;
  if (r.dose > r.env) s += " §2(contaminated)";
  if (r.pieces) s += ` §7| Hazmat ${r.pieces}/4` + (r.raw > 0 && r.felt === 0 ? " §a(protected)" : "");
  return s;
}

/** The detector, used: what it reads, and the nearest blast. @param {Player} p */
export function onUse(p) {
  const r = reading(p);
  const lines = ["§l--- Radiation Detector ---", `Here: ${COLORS[r.raw]}${LEVELS[r.raw]}§r (${r.raw} of 5)`];
  if (r.dose > r.env) lines.push("§2You're contaminated: it'll pass in a few seconds.");
  const now = U.nowTick();
  let best;
  for (const s of Nukes.sites()) {
    const spec = Nukes.payload(s.k);
    if (s.d !== p.dimension.id || !spec.fallout || now - s.t >= CFG.life) continue;
    const d = Math.hypot(p.location.x - s.x, p.location.z - s.z);
    if (!best || d < best.d) best = { s, d, spec };
  }
  if (best) {
    const days = (now - best.s.t) / 24000;
    lines.push(`Nearest blast: ${best.spec.name}, ${Math.round(best.d)} blocks ${directionTo(p.location, best.s)}, ` +
      `${days.toFixed(1)} days ago (its fallout fades in ${(CFG.life / 24000 - days).toFixed(1)} more).`);
  } else lines.push("§7No fallout anywhere in this dimension.");
  const pieces = r.pieces;
  if (pieces === 4) lines.push("Your Hazmat suit keeps you safe up to High.");
  else if (pieces) lines.push(`You wear ${pieces} of the 4 Hazmat pieces: they keep ${protection(pieces)} level${protection(pieces) === 1 ? "" : "s"} off.`);
  else lines.push("§7No Hazmat suit: you feel all of it.");
  p.sendMessage(lines.join("\n"));
  try {
    p.playSound(GEIGER[Math.max(1, r.raw)]);
  } catch {
    /* ignore */
  }
}
/** @param {{x: number, z: number}} a @param {{x: number, z: number}} b */
function directionTo(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (Math.hypot(dx, dz) < 1) return "right here";
  const names = ["south", "south-west", "west", "north-west", "north", "north-east", "east", "south-east"];
  return "to the " + names[((Math.round((Math.atan2(-dx, dz) * 180) / Math.PI / 45) % 8) + 8) % 8];
}

/** Mobs near players: radiation harms them (Radiation Zombies thrive in it). @param {number} tick */
function mobsTick(tick) {
  /** @type {Map<string, Entity>} */
  const seen = new Map();
  for (const p of world.getAllPlayers()) {
    let near = [];
    try {
      near = p.dimension.getEntities({ location: p.location, maxDistance: 64, excludeFamilies: ["inanimate"],
        excludeTypes: ["minecraft:player", ZOMBIE, "minecraft:item", "minecraft:xp_orb"] });
    } catch {
      continue;
    }
    for (const e of near) seen.set(e.id, e);
  }
  for (const e of seen.values()) {
    if (!U.isValid(e)) continue;
    let level;
    try {
      level = Math.max(levelAt(e.dimension.id, e.location), doseOf(e));
    } catch {
      continue;
    }
    if (level >= 2) harm(e, level, tick);
    else if (harmAt.has(e.id)) harmAt.delete(e.id);
  }
}

// =============================================================================================
// Radiation Zombies
// =============================================================================================
/**
 * Something died: if it was a zombie and radiation killed it, it may rise again.
 * @param {Entity} dead @param {import("@minecraft/server").EntityDamageSource} [source]
 */
export function onDeath(dead, source) {
  const id = dead.id;
  harmAt.delete(id);
  doses.delete(id);
  const last = lastHarm.get(id);
  lastHarm.delete(id);
  if (!ZOMBIES.has(dead.typeId) || !last || system.currentTick - last.tick > 5) return;
  if (source && source.cause !== "magic") return;
  if (Math.random() >= CFG.convertChance) return;
  let at;
  try {
    at = { ...dead.location };
  } catch {
    at = last.loc;
  }
  const dimId = last.dim;
  system.runTimeout(() => {
    try {
      const dim = world.getDimension(dimId);
      dim.spawnEntity(ZOMBIE, at);
      U.particle(dim, "zt:radiation_splash", { x: at.x, y: at.y + 1, z: at.z });
      U.sound(dim, "mob.zombie.unfect", at, 1, 0.6);
    } catch {
      /* ignore */
    }
  }, 30);
}

/** A Radiation Zombie's hit leaves radiation in what it struck. @param {Entity} hurt @param {import("@minecraft/server").EntityDamageSource} source */
export function onHurt(hurt, source) {
  if (source.damagingEntity?.typeId !== ZOMBIE || source.cause !== "entityAttack") return;
  contaminate(hurt, CFG.hitDose.level, CFG.hitDose.ticks);
}

/** @type {Map<string, number>} zombie id -> when it may spit again */
const spitAt = new Map();
/** @param {Entity} z @param {Entity} t */
function canSee(z, t) {
  try {
    const eye = z.getHeadLocation();
    const aim = U.centerOf(t);
    const v = U.sub(aim, eye);
    const d = U.len(v);
    const hit = z.dimension.getBlockFromRay(eye, U.scale(v, 1 / d), { maxDistance: d - 0.5 });
    return !hit;
  } catch {
    return false;
  }
}
/** @param {Entity} z */
function preyFor(z) {
  let best;
  let bestD = Infinity;
  let near = [];
  try {
    near = z.dimension.getEntities({ location: z.location, maxDistance: CFG.spit.max });
  } catch {
    return undefined;
  }
  for (const t of near) {
    const ok = t.typeId === "minecraft:player" ? U.isVulnerablePlayer(/** @type {Player} */ (t)) : PREY.has(t.typeId);
    if (!ok || !U.isValid(t)) continue;
    const d = U.len(U.sub(t.location, z.location));
    if (d < CFG.spit.min || d >= bestD) continue;
    best = t;
    bestD = d;
  }
  return best;
}
/** It spits at what it can see that's out of its reach. @param {Entity} z @param {Entity} t */
export function spit(z, t) {
  spitAt.set(z.id, system.currentTick + CFG.spit.cooldown);
  try {
    z.setRotation({ x: 0, y: U.yawTo(z.location, t.location) });
    z.playAnimation("animation.zt.radiation_zombie.spit");
  } catch {
    /* ignore */
  }
  U.sound(z.dimension, "zt.radiation_zombie.spit", z.location);
  system.runTimeout(() => {
    if (!U.isValid(z) || !U.isValid(t)) return;
    const head = z.getHeadLocation();
    const aim = U.centerOf(t);
    let lead = { x: 0, y: 0, z: 0 };
    try {
      lead = t.getVelocity();
    } catch {
      /* ignore */
    }
    const ticks = U.len(U.sub(aim, head)) / CFG.spit.speed;
    const to = { x: aim.x + lead.x * ticks, y: aim.y, z: aim.z + lead.z * ticks };
    const dir = U.norm(U.sub(to, head));
    const from = U.add(head, U.scale(dir, 0.6));
    Bullets.fire(z.dimension, SPIT, from, dir, CFG.spit.speed, z, CFG.spit.damage, {
      pop: "zt:radiation_splash",
      onHit: (/** @type {Entity} */ hit) => contaminate(hit, CFG.spitDose.level, CFG.spitDose.ticks),
    });
  }, 8);
}
/** @param {number} tick */
function zombiesTick(tick) {
  for (const id of ["overworld", "nether", "the_end"]) {
    let dim;
    try {
      dim = world.getDimension(id);
    } catch {
      continue;
    }
    if (!dim.getPlayers().length) continue;
    let zombies = [];
    try {
      zombies = dim.getEntities({ type: ZOMBIE });
    } catch {
      continue;
    }
    for (const z of zombies) {
      if (tick < (spitAt.get(z.id) ?? 0)) continue;
      const t = preyFor(z);
      if (t && canSee(z, t)) spit(z, t);
    }
  }
}

// =============================================================================================
// Ticks and the rest
// =============================================================================================
/** @param {number} tick */
export function radiationTick(tick) {
  for (const p of world.getAllPlayers()) {
    try {
      playerTick(p, tick);
    } catch (err) {
      console.warn("[Titans] radiation: " + err);
    }
  }
  if (tick % 20 === 5) mobsTick(tick);
  if (tick % 10 === 3) zombiesTick(tick);
  if (tick % 600 === 0) {
    for (const [id, d] of doses) if (d.until <= tick) doses.delete(id);
    for (const [id, d] of lastHarm) if (tick - d.tick > 100) lastHarm.delete(id);
    for (const [id, t] of spitAt) if (t < tick) spitAt.delete(id);
    for (const id of [...harmAt.keys()]) if (!world.getEntity(id)) harmAt.delete(id);
  }
}

/** @param {string} playerId */
export function forgetPlayer(playerId) {
  doses.delete(playerId);
  harmAt.delete(playerId);
  hazeOf.delete(playerId);
}
/** A player died: what radiation was in them goes. @param {string} playerId */
export function onPlayerDeath(playerId) {
  doses.delete(playerId);
  harmAt.delete(playerId);
}
