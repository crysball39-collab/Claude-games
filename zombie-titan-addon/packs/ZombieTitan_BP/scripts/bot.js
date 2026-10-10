// The Players: a Player joins the game from its spawn egg with a name, a skin and a
// personality of its own, and lives there like a player until it is killed (then it respawns
// at its bed or the world spawn, as players do). This module keeps them: their state (saved on
// the entity so it survives a reload), the tick that runs their bodies, senses, brains and
// chat, death messages and dropped belongings, respawning, the ticking areas that keep the
// world around a Player loaded when it wanders off on its own, and the mobs that spawn around a
// Player where no real player is near (the game only spawns mobs around real players).
import { ItemStack, system, world } from "@minecraft/server";
import * as B from "./bot_body.js";
import * as Brain from "./bot_brain.js";
import * as Chat from "./bot_chat.js";
import * as C from "./bot_combat.js";
import * as D from "./bot_data.js";
import * as Inv from "./bot_inv.js";
import * as Sense from "./bot_senses.js";
import * as S from "./bot_skills.js";
import * as W from "./bot_world.js";
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

export const TYPE = "zt:player";
/** Live Players by their own id. @type {Map<string, any>} */
export const bots = new Map();
/** entity id -> Player id */
const byEntity = new Map();
/** Players waiting to respawn. @type {Array<{uid: string, state: any, at: number}>} */
let respawns = [];
/** (a Player's new body is being made: not a new Player) */
let respawning = false;

// ---------------------------------------------------------------- world settings (the Player API item sets them)
const SETTINGS_KEY = "zt:players";
const DEFAULTS = { max: 4, build: true, roam: true, chat: 2, ai: false };
/** @returns {{max: number, build: boolean, roam: boolean, chat: number, ai: boolean}} */
export function settings() {
  try {
    const raw = world.getDynamicProperty(SETTINGS_KEY);
    return { ...DEFAULTS, ...(raw ? JSON.parse(String(raw)) : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}
/** @param {any} s */
export function saveSettings(s) {
  world.setDynamicProperty(SETTINGS_KEY, JSON.stringify({ ...settings(), ...s }));
  const now = settings();
  for (const bot of bots.values()) bot.world = now;
}

// ---------------------------------------------------------------- a Player's state
// (tick counts restart when a world loads: what's kept uses the world's clock, or nothing)
const PERSIST = ["uid", "name", "skin", "style", "persona", "hunger", "sat", "exhaust", "level", "xp", "spawn", "home", "friends",
  "follow", "stay", "known", "progress", "stats", "deathSpot", "firsts"];

function newUid() {
  return Math.floor(Math.random() * 0xffffffff).toString(36) + Date.now().toString(36).slice(-4);
}
function pickName() {
  const used = new Set([...bots.values()].map((b) => b.name));
  for (const p of world.getAllPlayers()) used.add(p.name);
  const free = D.NAMES.filter((n) => !used.has(n));
  if (free.length) return free[Math.floor(Math.random() * free.length)];
  return D.NAMES[Math.floor(Math.random() * D.NAMES.length)] + Math.floor(Math.random() * 100);
}

/** The state a new Player starts with. */
function freshState() {
  const style = D.STYLES[Math.floor(Math.random() * D.STYLES.length)];
  return {
    v: 1, uid: newUid(), name: pickName(), skin: Math.floor(Math.random() * 16), style,
    persona: { chatty: 0.3 + Math.random() * 0.7, brave: 0.3 + Math.random() * 0.7, friendly: 0.3 + Math.random() * 0.7,
      curious: 0.3 + Math.random() * 0.7 },
    hunger: 20, sat: 5, exhaust: 0, level: 0, xp: 0, spawn: null, home: null, friends: {}, follow: null, stay: null,
    known: {}, progress: { stage: "wood", done: [] }, stats: { mined: 0, placed: 0, crafted: 0, ate: 0, kills: 0, deaths: 0,
      diamonds: 0, trades: 0, enchants: 0 },
    deathSpot: null, firsts: {},
  };
}

/** Wrap a saved state and an entity into a live Player. @param {Entity} entity @param {any} state */
function wake(entity, state) {
  const bot = {
    ...freshState(),
    ...state,
    entity,
    world: settings(),
    props: {},
    yaw: 0, headYaw: 0, headPitch: 0, pose: 0, use: 0, swingN: 0,
    move: undefined, look: undefined, glance: undefined, jumpReq: 0, sneak: false, slow: false,
    onGround: true, inWater: false, headInWater: false, airTicks: 0, steps: [],
    progress: state.progress ?? { stage: "wood", done: [] },
    task: null, taskName: "", lastTask: "", busyLook: false, abort: false,
    seen: new Map(), heard: [], events: [], picked: [], angry: new Set(), tossed: new Map(),
    placed: new Set(state.placedList ?? []),
    phase: Math.floor(Math.random() * 20),
    chatQueue: [], lastChat: 0, hurtAt: 0, lastAttacker: undefined, history: [], requests: [], greeted: {},
    dead: false, wearsGold: false,
  };
  bot.homePoint = () => respawnPoint(bot);
  try {
    bot.yaw = entity.getRotation().y;
    bot.headYaw = bot.yaw;
  } catch {
    /* ignore */
  }
  return bot;
}

/** @param {any} bot */
function serialize(bot) {
  const out = {};
  for (const k of PERSIST) out[k] = bot[k];
  out.v = 1;
  out.placedList = [...bot.placed].slice(-400);
  return out;
}
/** @param {any} bot */
export function save(bot) {
  if (!bot.entity || bot.dead) return;
  try {
    bot.entity.setDynamicProperty("zt:bot", JSON.stringify(serialize(bot)));
  } catch {
    /* unloading */
  }
}

/** Set the look the client draws: its skin, its name over its head. @param {any} bot */
function dress(bot) {
  const e = bot.entity;
  try {
    e.nameTag = bot.name;
  } catch {
    /* ignore */
  }
  B.prop(bot, "zt:skin", bot.skin);
  B.prop(bot, "zt:pose", 0);
  B.prop(bot, "zt:use", 0);
  B.prop(bot, "zt:blocking", false);
}

/**
 * A Player entity appeared: a new one from its spawn egg, or one loaded with its chunk.
 * @param {Entity} e @param {string} cause
 */
export function onSpawn(e, cause) {
  if (byEntity.has(e.id) || respawning) return;
  let state;
  try {
    const raw = e.getDynamicProperty("zt:bot");
    state = raw ? JSON.parse(String(raw)) : undefined;
  } catch {
    state = undefined;
  }
  if (state) {
    const live = bots.get(state.uid);
    let liveValid = false;
    try {
      liveValid = !!live?.entity && live.entity.id !== e.id && live.entity.isValid;
    } catch {
      liveValid = false;
    }
    // the same Player twice (a copy of a saved world area): keep the first
    if (liveValid) {
      try {
        e.remove();
      } catch {
        /* ignore */
      }
      return;
    }
    // the same Player in a new body (through a portal): it keeps its mind
    if (live && !live.dead) {
      byEntity.delete(live.entity?.id);
      live.entity = e;
      live.props = {};
      byEntity.set(e.id, live.uid);
      dress(live);
      return;
    }
    const bot = wake(e, state);
    bots.set(bot.uid, bot);
    byEntity.set(e.id, bot.uid);
    dress(bot);
    respawns = respawns.filter((r) => r.uid !== bot.uid);
    return;
  }
  const s = settings();
  if ([...bots.values()].filter((b) => !b.dead).length >= s.max) {
    try {
      for (const p of e.dimension.getPlayers({ location: e.location, maxDistance: 32 })) {
        p.sendMessage(`§cThere are already ${s.max} Players in this world. §7(Use the Player API to allow more.)`);
      }
      e.remove();
    } catch {
      /* ignore */
    }
    return;
  }
  const bot = wake(e, freshState());
  bot.spawn = null;
  bots.set(bot.uid, bot);
  byEntity.set(e.id, bot.uid);
  dress(bot);
  world.sendMessage(`§e${bot.name} joined the game`);
  bot.events.push({ kind: "joined", at: system.currentTick });
  // where it first came into the world is where it starts out from
  bot.known.start = { dim: e.dimension.id, pos: B.feet(bot) };
  save(bot);
}

/** Find Player entities the events missed (a world just loaded, a dimension change). */
export function scan() {
  for (const id of ["overworld", "nether", "the_end"]) {
    let dim;
    try {
      dim = world.getDimension(id);
    } catch {
      continue;
    }
    let list = [];
    try {
      list = dim.getEntities({ type: TYPE });
    } catch {
      continue;
    }
    for (const e of list) {
      const uid = byEntity.get(e.id);
      const bot = uid ? bots.get(uid) : undefined;
      if (bot) {
        // through a portal (or reloaded with its chunk) it comes back as a new object
        let valid = false;
        try {
          valid = bot.entity.isValid;
        } catch {
          valid = false;
        }
        if (!valid) {
          bot.entity = e;
          bot.props = {};
          dress(bot);
        }
        continue;
      }
      onSpawn(e, "Loaded");
    }
  }
}

/** @param {Entity} e */
export function botOf(e) {
  const uid = byEntity.get(e.id);
  return uid ? bots.get(uid) : undefined;
}

// ---------------------------------------------------------------- the tick
/** @param {number} now */
export function playersTick(now) {
  if (now % 100 === 7) scan();
  W.eyesTick();
  Chat.aiTick();
  if (now % 600 === 300) {
    W.save();
    W.savePlaced(S.playerPlaced);
  }
  for (const bot of bots.values()) {
    if (bot.dead) continue;
    const e = bot.entity;
    let valid = false;
    try {
      valid = !!e && e.isValid;
    } catch {
      valid = false;
    }
    if (!valid) {
      bot.goneTicks = (bot.goneTicks ?? 0) + 1;
      continue;
    }
    bot.goneTicks = 0;
    try {
      // (was it already burning before anything that hits it this tick?)
      bot.burning = !!e.getComponent("minecraft:onfire");
      B.bodyTick(bot, now);
      B.vitalsTick(bot, now);
      if ((now + bot.phase) % 5 === 0) Sense.senseTick(bot, now);
      Brain.brainTick(bot, now);
      Chat.chatTick(bot, now);
      if ((now + bot.phase) % 200 === 0 || bot.saveNow) {
        bot.saveNow = false;
        save(bot);
      }
      if ((now + bot.phase) % 40 === 0) keepLoaded(bot);
      if ((now + bot.phase) % 100 === 50) presence(bot, now);
    } catch (err) {
      if ((bot.errors = (bot.errors ?? 0) + 1) < 5) console.warn("[Titans] Player " + bot.name + ": " + err + (err?.stack ? "\n" + err.stack : ""));
    }
  }
  for (const r of [...respawns]) if (now >= r.at) respawn(r);
}

// ---------------------------------------------------------------- death and respawning
/** A Player died: the game's death message, its things spill, it respawns soon. @param {Entity} dead @param {any} source */
export function onDeath(dead, source) {
  const bot = botOf(dead);
  if (!bot || bot.dead) return;
  let loc;
  let dim;
  try {
    loc = { ...dead.location };
    dim = dead.dimension;
  } catch {
    return;
  }
  const killer = source?.damagingEntity;
  let by;
  try {
    if (killer) by = killer.typeId === "minecraft:player" ? /** @type {Player} */ (killer).name : botOf(killer)?.name ?? killer.nameTag ?? D.mobName(killer.typeId);
    if (killer && !by) by = D.mobName(killer.typeId);
  } catch {
    by = undefined;
  }
  world.sendMessage(`${bot.name} ${D.deathMessage(source?.cause ?? "none", by)}`);
  // everything it carried falls where it died
  for (const { item } of Inv.stacks(bot)) {
    try {
      dim.spawnItem(item, { x: loc.x + (Math.random() - 0.5), y: loc.y + 0.5, z: loc.z + (Math.random() - 0.5) });
    } catch {
      /* ignore */
    }
  }
  try {
    Inv.container(bot)?.clearAll();
  } catch {
    /* ignore */
  }
  for (const s of Inv.EQUIP) Inv.setEquip(bot, s, undefined);
  for (let i = 0; i < Math.min(7, bot.level); i++) {
    try {
      dim.spawnEntity("minecraft:xp_orb", { x: loc.x + (Math.random() - 0.5), y: loc.y + 0.5, z: loc.z + (Math.random() - 0.5) });
    } catch {
      /* ignore */
    }
  }
  bot.level = 0;
  bot.xp = 0;
  bot.stats.deaths++;
  bot.deathSpot = { dim: dim.id, pos: loc, at: world.getAbsoluteTime(), cause: source?.cause, by };
  bot.recovered = false;
  Brain.stopTask(bot);
  bot.dead = true;
  byEntity.delete(dead.id);
  try {
    dead.setDynamicProperty("zt:bot", undefined);
  } catch {
    /* ignore */
  }
  Chat.onDied(bot, source?.cause, by);
  respawns.push({ uid: bot.uid, state: serialize(bot), at: system.currentTick + 60 });
  saveRespawns();
}

function saveRespawns() {
  try {
    world.setDynamicProperty("zt:players_respawn", JSON.stringify(respawns.map((r) => ({ uid: r.uid, state: r.state }))));
  } catch {
    /* ignore */
  }
}
/** After a reload: Players that died and hadn't respawned yet. */
export function loadRespawns() {
  try {
    const raw = world.getDynamicProperty("zt:players_respawn");
    const list = raw ? JSON.parse(String(raw)) : [];
    respawns = list.map((r) => ({ ...r, at: system.currentTick + 100 }));
  } catch {
    respawns = [];
  }
}

/** Where a Player comes back: its bed (if it's still there), else the world spawn. @param {any} state */
function respawnPoint(state) {
  const sp = state.spawn;
  if (sp) {
    try {
      const dim = world.getDimension(sp.dim);
      const b = dim.getBlock(sp.pos);
      if (b && /bed/.test(b.typeId)) return { dim, pos: { x: sp.pos.x + 0.5, y: sp.pos.y + 0.6, z: sp.pos.z + 0.5 } };
    } catch {
      /* unloaded or gone */
    }
  }
  const dim = world.getDimension("overworld");
  const s = world.getDefaultSpawnLocation();
  let y = s.y;
  if (y > 1000 || y < -64) {
    try {
      const top = dim.getTopmostBlock({ x: s.x, z: s.z });
      y = top ? top.location.y + 1 : 70;
    } catch {
      y = 70;
    }
  }
  return { dim, pos: { x: s.x + 0.5 + (Math.random() - 0.5) * 4, y, z: s.z + 0.5 + (Math.random() - 0.5) * 4 } };
}

/** @param {{uid: string, state: any, at: number}} r */
function respawn(r) {
  const { dim, pos } = respawnPoint(r.state);
  let e;
  try {
    const state = { ...r.state, hunger: 20, sat: 5, exhaust: 0 };
    respawning = true;
    try {
      e = dim.spawnEntity(TYPE, pos);
    } finally {
      respawning = false;
    }
    e.setDynamicProperty("zt:bot", JSON.stringify(state));
  } catch {
    // the spot isn't loaded: try again in a few seconds (a ticking area loads it)
    try {
      dim.runCommand(`tickingarea add circle ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)} 1 zt_respawn`);
    } catch {
      /* ignore */
    }
    r.at = system.currentTick + 60;
    return;
  }
  respawns = respawns.filter((x) => x !== r);
  saveRespawns();
  const old = bots.get(r.uid);
  if (old) {
    // the same Player, back in a new body: everything it knew, nothing it carried
    old.entity = e;
    old.props = {};
    old.dead = false;
    old.hunger = 20;
    old.sat = 5;
    old.exhaust = 0;
    old.seen.clear();
    old.lastAttacker = undefined;
    old.angry.clear();
    byEntity.set(e.id, old.uid);
    dress(old);
    save(old);
  } else {
    // (after a reload: it wakes from what it saved)
    onSpawn(e, "Respawned");
  }
  const bot = bots.get(r.uid);
  if (bot) bot.events.push({ kind: "respawned", at: system.currentTick });
  try {
    dim.runCommand("tickingarea remove zt_respawn");
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- keeping its world loaded, and alive
/** @param {any} bot */
function nearestRealPlayer(bot) {
  let best = Infinity;
  try {
    for (const p of bot.entity.dimension.getPlayers()) best = Math.min(best, B.dist(p.location, bot.entity.location));
  } catch {
    /* ignore */
  }
  return best;
}
/** Away from every real player, a Player keeps a small ticking area around it so its world goes on. @param {any} bot */
function keepLoaded(bot) {
  const e = bot.entity;
  const alone = nearestRealPlayer(bot) > 80;
  const name = "zt_bot_" + bot.uid.slice(0, 6);
  const dim = e.dimension;
  if (!bot.world.roam || !alone) {
    if (bot.ticking) {
      try {
        world.getDimension(bot.ticking.dim).runCommand(`tickingarea remove ${name}`);
      } catch {
        /* ignore */
      }
      bot.ticking = undefined;
    }
    return;
  }
  const l = e.location;
  if (bot.ticking && bot.ticking.dim === dim.id && B.flat(bot.ticking.pos, l) < 20) return;
  try {
    if (bot.ticking) world.getDimension(bot.ticking.dim).runCommand(`tickingarea remove ${name}`);
    dim.runCommand(`tickingarea add circle ${Math.floor(l.x)} ${Math.floor(l.y)} ${Math.floor(l.z)} 2 ${name}`);
    bot.ticking = { dim: dim.id, pos: { x: l.x, y: l.y, z: l.z } };
  } catch {
    /* all ten ticking areas in use */
  }
}

const NIGHT_MOBS = ["minecraft:zombie", "minecraft:zombie", "minecraft:skeleton", "minecraft:spider", "minecraft:creeper", "minecraft:enderman"];
const NETHER_MOBS = ["minecraft:zombie_pigman", "minecraft:magma_cube", "minecraft:piglin", "minecraft:ghast"];
/**
 * The game spawns mobs around real players only. Far from all of them, a Player gets the mobs a
 * player would: hostile ones at night or in the dark, endermen, blazes by a Nether fortress's
 * spawners.
 * @param {any} bot @param {number} now
 */
function presence(bot, now) {
  const e = bot.entity;
  const dim = e.dimension;
  const l = e.location;
  // a spawner wakes for a player within 16 blocks: for a Player too (unless a real player is
  // already there, when the game does it)
  const spawner = S.findBlocks(dim, l, ["minecraft:mob_spawner"], 16, 8)[0];
  if (spawner) {
    let real = false;
    try {
      real = dim.getPlayers({ location: spawner, maxDistance: 16 }).length > 0;
    } catch {
      real = true;
    }
    if (!real) spawnerTick(bot, dim, spawner);
  }
  if (nearestRealPlayer(bot) < 96) return;
  let near = 0;
  try {
    near = dim.getEntities({ location: l, maxDistance: 32 }).filter((x) => Sense.HOSTILE.has(x.typeId) || x.typeId === "minecraft:enderman").length;
  } catch {
    return;
  }
  if (near >= 4) return;
  let pick;
  if (dim.id === "minecraft:overworld") {
    const t = world.getTimeOfDay();
    // mobs spawn in the dark: at night, or in caves (not just under a tree)
    const covered = B.roofed(dim, l) && !S.findBlocks(dim, l, ["minecraft:torch", "minecraft:lantern", "minecraft:glowstone"], 7, 4).length;
    if (!(t > 13000 && t < 23000) && !covered) return;
    pick = NIGHT_MOBS[Math.floor(Math.random() * NIGHT_MOBS.length)];
  } else if (dim.id === "minecraft:nether") {
    if (spawner) return;
    pick = NETHER_MOBS[Math.floor(Math.random() * NETHER_MOBS.length)];
  } else {
    pick = "minecraft:enderman";
  }
  if (Math.random() < 0.3) spawnAround(dim, l, pick, 16, 28);
}
/**
 * A spawner near a Player: up to four of its mob around it every few seconds, as the game's
 * spawners do (blazes in a Nether fortress, the dungeon mob in a dungeon).
 * @param {any} bot @param {any} dim @param {Vector3} sp
 */
function spawnerTick(bot, dim, sp) {
  bot.spawnerAt ??= 0;
  if (system.currentTick < bot.spawnerAt) return;
  bot.spawnerAt = system.currentTick + 200 + Math.floor(Math.random() * 400);
  const fortress = dim.id === "minecraft:nether" && S.findBlocks(dim, sp, ["minecraft:nether_brick"], 6, 3).length > 0;
  const type = fortress ? "minecraft:blaze" : dim.id === "minecraft:nether" ? "minecraft:magma_cube"
    : S.findBlocks(dim, sp, ["minecraft:mossy_cobblestone"], 4, 2).length ? ["minecraft:zombie", "minecraft:skeleton", "minecraft:spider"][Math.abs(sp.x + sp.z) % 3]
    : "minecraft:cave_spider";
  let near = 0;
  try {
    near = dim.getEntities({ type, location: sp, maxDistance: 9 }).length;
  } catch {
    return;
  }
  // (a wave of one or two, and no more than two about: a Player alone can't take on four blazes)
  if (near >= (type === "minecraft:blaze" ? 2 : 4)) return;
  const n = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) spawnAround(dim, { x: sp.x + 0.5, y: sp.y, z: sp.z + 0.5 }, type, 1, 4);
  try {
    dim.spawnParticle("minecraft:mobflame_single", { x: sp.x + 0.5, y: sp.y + 0.5, z: sp.z + 0.5 });
  } catch {
    /* ignore */
  }
}

/** @param {any} dim @param {Vector3} at @param {string} type @param {number} r0 @param {number} r1 */
function spawnAround(dim, at, type, r0, r1) {
  for (let tries = 0; tries < 6; tries++) {
    const a = Math.random() * Math.PI * 2;
    const r = r0 + Math.random() * (r1 - r0);
    const x = Math.floor(at.x + Math.cos(a) * r);
    const z = Math.floor(at.z + Math.sin(a) * r);
    for (let dy = 4; dy >= -6; dy--) {
      const y = Math.floor(at.y) + dy;
      try {
        const b = dim.getBlock({ x, y, z });
        const below = dim.getBlock({ x, y: y - 1, z });
        const above = dim.getBlock({ x, y: y + 1, z });
        if (b?.isAir && above?.isAir && below && D.isFloor(below.typeId)) {
          dim.spawnEntity(type, { x: x + 0.5, y, z: z + 0.5 });
          return true;
        }
      } catch {
        break;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------- what Players hear and feel
/** Every live Player. */
export function live() {
  return [...bots.values()].filter((b) => !b.dead && b.entity?.isValid);
}

/**
 * Something got hurt. Players near hear it; a Player's friend being attacked gets defended;
 * a hurt Player notices who did it.
 * @param {Entity} hurt @param {any} source @param {number} damage
 */
export function onHurt(hurt, source, damage) {
  const now = system.currentTick;
  if (!bots.size) return;
  const lv = live();
  try {
    Sense.soundAt(lv, hurt.dimension, hurt.location, "hurt", hurt);
  } catch {
    /* ignore */
  }
  const by = source?.damagingEntity;
  if (hurt.typeId === "minecraft:player" && by && by.id !== hurt.id) {
    const name = /** @type {Player} */ (hurt).name;
    for (const b of lv) {
      if ((b.friends[name] ?? 0) >= 3 && b.entity.dimension.id === hurt.dimension.id && B.dist(b.entity.location, hurt.location) < 24 &&
        by.typeId !== "zt:player") b.defend = by;
    }
  }
  const bot = botOf(hurt);
  if (!bot) return;
  bot.hurtAt = now;
  if (/projectile|fireball/i.test(String(source?.cause))) bot.shotAt = now;
  bot.exhaust += 0.1;
  if (by && by.id !== hurt.id) {
    bot.lastAttacker = by;
    bot.lastAttackerAt = now;
    if (!Sense.HOSTILE.has(by.typeId)) bot.angry.add(by.id);
    if (by.typeId === "minecraft:player") Chat.onHurtBy(bot, /** @type {Player} */ (by));
  }
  // armour wears as it takes hits
  if (damage > 0 && /entityAttack|projectile|entityExplosion/.test(String(source?.cause))) {
    for (const s of ["Head", "Chest", "Legs", "Feet"]) Inv.wearSlot(bot, s, 1);
  }
}
/**
 * A Player killed something: experience (the game only drops it for real players), the drops
 * only players get (blaze rods), and it notes the kill.
 * @param {Entity} killer @param {Entity} dead
 */
export function onKill(killer, dead) {
  const bot = botOf(killer);
  if (!bot) return;
  let type;
  let at;
  try {
    type = dead.typeId;
    at = { ...dead.location };
  } catch {
    return;
  }
  bot.lastKill = dead.id;
  bot.stats.kills++;
  B.addXp(bot, C.killXp(type));
  if (type === "minecraft:blaze") {
    // blaze rods drop only for a player: half the time, more with looting
    const looting = Inv.enchantLevel(Inv.held(bot), "looting");
    const n = Math.floor(Math.random() * (2 + looting));
    if (n > 0) {
      try {
        killer.dimension.spawnItem(new ItemStack("minecraft:blaze_rod", n), { x: at.x, y: at.y + 0.5, z: at.z });
      } catch {
        /* ignore */
      }
    }
  }
  bot.events.push({ kind: "killed", typeId: type, at: system.currentTick });
}

/**
 * The dragon died: every Player in the End beat it (whoever struck the last blow, as players
 * there all get "Free the End"), and says so.
 */
export function onDragonDied() {
  const now = system.currentTick;
  for (const b of live()) {
    if (b.entity.dimension.id !== "minecraft:the_end" || b.progress.dragon) continue;
    b.progress.dragon = true;
    b.events.push({ kind: "dragon_dead", at: now });
  }
}

/** Its raised shield took a hit. @param {Entity} e */
export function onShieldBlock(e) {
  const bot = botOf(e);
  if (!bot) return;
  bot.blockedAt = system.currentTick;
  // a blocked fireball sets nothing alight (as for a player)
  if (!bot.burning) {
    try {
      e.extinguishFire(false);
    } catch {
      /* ignore */
    }
  }
  try {
    e.dimension.playSound("item.shield.block", e.location, { volume: 0.8, pitch: 0.9 + Math.random() * 0.2 });
  } catch {
    /* ignore */
  }
  if (Inv.wearSlot(bot, "Offhand", 1) === "broke") S.onToolBroke(bot, "minecraft:shield");
}
