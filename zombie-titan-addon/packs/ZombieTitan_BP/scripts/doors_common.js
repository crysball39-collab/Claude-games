// Shared machinery for the Doors levels (the Library and the Seek chase): a "run" is one
// play-through of a built level with its players; this module tracks them (they play in
// Adventure mode, restored afterwards), works the hotel doors, shows the per-player boss
// bar meters, runs cutscene cameras, kills, and the Guiding Light's advice after a death.
import { EasingType, GameMode, InputPermissionCategory, ItemLockMode, ItemStack, system, world } from "@minecraft/server";
import { perm, worldBox } from "./doors_build.js";
import { isValid, isVulnerablePlayer, len, particle, sub } from "./util.js";

/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {import("./doors_build.js").Frame} Frame */

export const BOOK_PREFIX = "zt:book_";
export const PAPER = "zt:solution_paper";
const MODE_KEY = "zt:doors_mode";
const DEATH_KEY = "zt:doors_death";

/**
 * @typedef {{ status: "in" | "dead" | "out" | "escaped", name: string }} Seat
 * @typedef {{ id: string, cells: number[], open: boolean, locked: boolean, number: number | null, fake: boolean }} Door
 * @typedef {{
 *   id: string, kind: string, dim: Dimension, frame: Frame, owner: string,
 *   start: { loc: Vector3, rot: { x: number, y: number } },
 *   players: Map<string, Seat>, phase: string, ents: Set<string>, doors: Door[], bounds: number[],
 *   since: number, data: any,
 * }} Run
 */

/** @type {Map<string, Run>} */
export const runs = new Map();
/** @type {Map<string, { tick?: (run: Run, now: number) => void, end?: (run: Run, why: string) => void, death?: (run: Run, p: Player) => void }>} */
const kinds = new Map();

export function registerKind(kind, handlers) {
  kinds.set(kind, handlers);
}

let serial = 0;
/** @param {Player} owner @param {Frame} frame */
export function newRun(kind, owner, frame, bounds, data) {
  const id = kind + "-" + system.currentTick + "-" + ++serial + "-" + Math.floor(Math.random() * 1e6);
  /** @type {Run} */
  const run = {
    id, kind, dim: frame.dim, frame, owner: owner.id,
    start: { loc: { ...owner.location }, rot: owner.getRotation() },
    players: new Map(), phase: "building", ents: new Set(), doors: [], bounds, since: system.currentTick, data,
  };
  runs.set(id, run);
  return run;
}

/** The active run a player is playing in, if any. @param {Player} p */
export function runOf(p) {
  for (const run of runs.values()) {
    const s = run.players.get(p.id);
    if (s && s.status === "in") return run;
  }
  return undefined;
}

/** A run the player built that is still waiting to be entered. @param {Player} p */
export function pendingRunOf(p) {
  for (const run of runs.values()) if (run.owner === p.id && (run.phase === "building" || run.phase === "ready")) return run;
  return undefined;
}

/** Players still playing (inside and alive). @param {Run} run @returns {Player[]} */
export function livePlayers(run) {
  const out = [];
  for (const [id, s] of run.players) {
    if (s.status !== "in") continue;
    const p = world.getEntity(id);
    if (isValid(p)) out.push(/** @type {Player} */ (p));
  }
  return out;
}

/** @param {Player} p */
export function canDie(p) {
  return isVulnerablePlayer(p);
}

// ---------------------------------------------------------------- players
/** Add a player to a run: they play in Adventure mode, so the walls can't be broken. @param {Run} run @param {Player} p */
export function join(run, p) {
  if (run.players.get(p.id)?.status === "in") return;
  if (runOf(p)) return;
  let gm;
  try {
    gm = p.getGameMode();
  } catch {
    return;
  }
  if (gm === GameMode.Spectator) return;
  if (p.getDynamicProperty(MODE_KEY) === undefined) p.setDynamicProperty(MODE_KEY, gm);
  if (gm !== GameMode.Adventure) {
    try {
      p.setGameMode(GameMode.Adventure);
    } catch {
      /* ignore */
    }
  }
  run.players.set(p.id, { status: "in", name: p.name });
}

/** Give a player back their own game mode and tidy up after a run. @param {Player} p */
export function restore(p) {
  const gm = p.getDynamicProperty(MODE_KEY);
  if (typeof gm === "string") {
    try {
      if (p.getGameMode() !== gm) p.setGameMode(/** @type {any} */ (gm));
    } catch {
      /* ignore */
    }
    p.setDynamicProperty(MODE_KEY, undefined);
  }
  clearMeter(p);
  lockInput(p, false);
  try {
    p.camera.clear();
  } catch {
    /* ignore */
  }
  try {
    p.stopMusic();
  } catch {
    /* ignore */
  }
  clearRunItems(p);
}

/** @param {Run} run @param {Player} p @param {"dead" | "out" | "escaped"} status */
export function leave(run, p, status) {
  const s = run.players.get(p.id);
  if (!s) return;
  s.status = status;
  if (status !== "dead") restore(p);
  else clearMeter(p);
}

/** Back where they used the item, with a fade. @param {Run} run @param {Player} p */
export function sendHome(run, p) {
  fade(p, 0.5, 0.6, 0.8, { red: 0, green: 0, blue: 0 });
  system.runTimeout(() => {
    if (!isValid(p)) return;
    try {
      p.teleport(run.start.loc, { dimension: run.dim, rotation: run.start.rot });
    } catch {
      /* ignore */
    }
  }, 10);
}

/** Take the books and the solution paper away again. @param {Player} p */
export function clearRunItems(p) {
  let inv;
  try {
    inv = p.getComponent("minecraft:inventory")?.container;
  } catch {
    return;
  }
  if (!inv) return;
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (it && (it.typeId === PAPER || it.typeId.startsWith(BOOK_PREFIX))) inv.setItem(i, undefined);
  }
}

/** A run item that stays put: can't be dropped, kept on death. @param {Player} p */
export function giveRunItem(p, typeId, name, lore) {
  const it = new ItemStack(typeId, 1);
  if (name) it.nameTag = name;
  if (lore) it.setLore(lore);
  try {
    it.lockMode = ItemLockMode.inventory;
    it.keepOnDeath = true;
  } catch {
    /* ignore */
  }
  try {
    const inv = p.getComponent("minecraft:inventory")?.container;
    const left = inv?.addItem(it);
    if (left) p.dimension.spawnItem(left, p.location);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- entities
/** Spawn an entity that belongs to a run (removed when the run ends). @param {Run} run */
export function spawnFor(run, typeId, location, opts = {}) {
  const e = run.dim.spawnEntity(typeId, location, opts.spawnEvent ? { spawnEvent: opts.spawnEvent } : undefined);
  e.setDynamicProperty("zt:run", run.id);
  if (opts.keep) e.setDynamicProperty("zt:keep", true);
  if (opts.yaw !== undefined) face(e, location, opts.yaw);
  run.ents.add(e.id);
  return e;
}

/** Turn an entity to a world yaw: its rotation, and (for scenery) the zt:yaw its model follows. @param {Entity} e */
export function face(e, location, yaw) {
  const y = ((((Math.round(yaw) + 180) % 360) + 360) % 360) - 180;
  try {
    e.setRotation({ x: 0, y });
    e.teleport(location, { rotation: { x: 0, y } });
  } catch {
    /* ignore */
  }
  try {
    e.setProperty("zt:yaw", y);
  } catch {
    /* creatures turn themselves */
  }
}

/** @param {Run} run */
export function removeRunEntities(run) {
  for (const id of run.ents) {
    const e = world.getEntity(id);
    if (!isValid(e)) continue;
    if (e.getDynamicProperty("zt:keep")) continue;
    try {
      e.remove();
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------- hotel doors
/**
 * A hotel door in the wall at frame row f, its 2 x 3 opening over cells r..r+1, u..u+2.
 * Closed, the opening is filled with barrier blocks; the door entity only shows it.
 * @param {Run} run
 */
export function spawnDoor(run, r, u, f, plate, opts = {}) {
  const fr = run.frame;
  const e = spawnFor(run, "zt:hotel_door", fr.at(r + 1, u, f + 0.5), { keep: true, yaw: fr.yawOf("b") });
  e.setProperty("zt:plate", plate);
  /** @type {Door} */
  const door = { id: e.id, cells: [r, u, f, r + 1, u + 2, f], open: false, locked: !!opts.locked, number: opts.number ?? null,
    fake: !!opts.fake };
  // a fake door (Seek's rooms with three doors) leads nowhere: it stays shut for good
  if (door.fake) e.setDynamicProperty("zt:fake", true);
  const [a, b] = worldBox(fr, door.cells);
  e.setDynamicProperty("zt:gap", JSON.stringify([a.x, a.y, a.z, b.x, b.y, b.z]));
  fillGap(run, door, "minecraft:barrier");
  if (door.locked) {
    e.setProperty("zt:locked", true);
    e.triggerEvent("zt:lock");
  }
  run.doors.push(door);
  return door;
}

/** @param {Run} run @param {Door} door */
function fillGap(run, door, block) {
  const [a, b] = worldBox(run.frame, door.cells);
  try {
    for (let x = a.x; x <= b.x; x++) {
      for (let y = a.y; y <= b.y; y++) for (let z = a.z; z <= b.z; z++) run.dim.setBlockPermutation({ x, y, z }, perm(block));
    }
  } catch {
    /* chunk unloaded */
  }
}

/** @param {Door} door */
export function doorEntity(door) {
  const e = world.getEntity(door.id);
  return isValid(e) ? e : undefined;
}

/** @param {Run} run @param {Door} door */
export function openDoor(run, door, silent = false) {
  if (door.open) return;
  door.open = true;
  fillGap(run, door, "minecraft:air");
  const e = doorEntity(door);
  if (e) {
    e.setProperty("zt:open", true);
    if (!silent) sound(run.dim, "zt.doors.open", e.location, 1.0, 0.9 + Math.random() * 0.15);
  }
}

/** @param {Run} run @param {Door} door */
export function closeDoor(run, door, slam = false) {
  if (!door.open) return;
  door.open = false;
  fillGap(run, door, "minecraft:barrier");
  const e = doorEntity(door);
  if (e) {
    e.setProperty("zt:open", false);
    sound(run.dim, slam ? "zt.doors.slam" : "zt.doors.close", e.location, slam ? 1.6 : 1.0, 1.0);
  }
}

/** Fill a closed door's opening again (after building next to it). @param {Run} run @param {Door} door */
export function sealDoor(run, door) {
  if (!door.open) fillGap(run, door, "minecraft:barrier");
}

/** @param {Door} door */
export function unlockDoor(door) {
  door.locked = false;
  const e = doorEntity(door);
  if (e) {
    e.setProperty("zt:locked", false);
    e.triggerEvent("zt:unlock");
  }
}

/** The Guiding Light's blue glow on a door. @param {Door} door */
export function guideDoor(door, on) {
  const e = doorEntity(door);
  if (e) {
    try {
      if (e.getProperty("zt:guided") !== on) e.setProperty("zt:guided", on);
    } catch {
      /* ignore */
    }
  }
}

/** Middle of a door's opening, in the world. @param {Run} run @param {Door} door */
export function doorCenter(run, door) {
  const [r, u, f] = door.cells;
  return run.frame.at(r + 1, u + 1.5, f + 0.5);
}

/** Open a closed door when a player walks up to it (unless it's locked). @param {Run} run */
export function autoOpenDoors(run, players, reach = 2.6, filter) {
  for (const door of run.doors) {
    if (door.open || door.locked || (filter && !filter(door))) continue;
    const c = doorCenter(run, door);
    for (const p of players) {
      if (len(sub(p.location, { x: c.x, y: c.y - 1.5, z: c.z })) <= reach) {
        openDoor(run, door);
        break;
      }
    }
  }
}

// ---------------------------------------------------------------- meters (boss bars)
/** @type {Map<string, { id: string, type: string }>} */
const meterOf = new Map();
const METER_TYPES = { figure: "zt:figure_bar", seek: "zt:seek_bar" };

/**
 * Show this player a boss-bar meter: a hidden marker that follows them, whose health is the
 * meter's value (1-100). Only players right next to it see its bar.
 * @param {Player} p @param {"figure" | "seek"} type
 */
export function setMeter(p, type, value) {
  let m = meterOf.get(p.id);
  let e = m ? world.getEntity(m.id) : undefined;
  if (m && (m.type !== type || !isValid(e))) {
    if (isValid(e)) e.remove();
    meterOf.delete(p.id);
    m = undefined;
    e = undefined;
  }
  const at = { x: p.location.x, y: p.location.y + 0.2, z: p.location.z };
  try {
    if (!e) {
      e = p.dimension.spawnEntity(METER_TYPES[type], at);
      e.setDynamicProperty("zt:run", "meter");
      meterOf.set(p.id, { id: e.id, type });
    } else if (e.dimension.id !== p.dimension.id || len(sub(e.location, at)) > 1.5) {
      e.teleport(at, { dimension: p.dimension });
    }
    const hp = e.getComponent("minecraft:health");
    const v = Math.max(1, Math.min(100, Math.round(value)));
    if (hp && Math.round(hp.currentValue) !== v) hp.setCurrentValue(v);
  } catch {
    /* chunk not loaded */
  }
}

/** @param {Player} p @param {string} [type] only clear this kind */
export function clearMeter(p, type) {
  const m = meterOf.get(p.id);
  if (!m || (type && m.type !== type)) return;
  const e = world.getEntity(m.id);
  if (isValid(e)) e.remove();
  meterOf.delete(p.id);
}

export function isMeter(id) {
  for (const m of meterOf.values()) if (m.id === id) return true;
  return false;
}

// ---------------------------------------------------------------- cutscenes and screen
/** @param {Player} p */
export function lockInput(p, locked) {
  try {
    p.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, !locked);
  } catch {
    /* ignore */
  }
}

/** A cutscene camera at `location`, looking at a point or following an entity. @param {Player} p */
export function camera(p, location, look, easeTime = 0) {
  try {
    const easeOptions = easeTime > 0 ? { easeTime, easeType: EasingType.InOutSine } : undefined;
    if (look && "typeId" in look) p.camera.setCamera("minecraft:free", { location, facingEntity: look, easeOptions });
    else p.camera.setCamera("minecraft:free", { location, facingLocation: look, easeOptions });
  } catch {
    /* ignore */
  }
}

/** @param {Player} p */
export function cameraClear(p) {
  try {
    p.camera.clear();
  } catch {
    /* ignore */
  }
}

/** @param {Player} p */
export function fade(p, inT, hold, outT, color = { red: 0, green: 0, blue: 0 }) {
  try {
    p.camera.fade({ fadeColor: color, fadeTime: { fadeInTime: inT, holdTime: hold, fadeOutTime: outT } });
  } catch {
    /* ignore */
  }
}

/** @param {Player} p */
export function title(p, text, sub, stay = 40) {
  try {
    p.onScreenDisplay.setTitle(text, { subtitle: sub, fadeInDuration: 5, stayDuration: stay, fadeOutDuration: 10 });
  } catch {
    /* ignore */
  }
}

/** @param {Player} p */
export function actionbar(p, text) {
  try {
    p.onScreenDisplay.setActionBar(text);
  } catch {
    /* ignore */
  }
}

export function sound(dim, id, location, volume = 1, pitch = 1) {
  try {
    dim.playSound(id, location, { volume, pitch });
  } catch {
    /* ignore */
  }
}

/** The Guiding Light's blue motes in a box around `center`. */
export function guidingLight(dim, center, hx, hy, hz) {
  particle(dim, "zt:guiding_light", center, { hx, hy, hz });
}

// ---------------------------------------------------------------- death and the Guiding Light
const GUIDANCE = {
  figure: [
    "§bYou died to who you call The Figure...",
    "§bIt seems to be blind, but its hearing is very sharp.",
    "§bCrouch to move without a sound, and keep your distance.",
    "§bI will be here when you try again.",
  ],
  seek: [
    "§bYou died to who you call Seek...",
    "§bIt will chase you through room after room. Never stop running.",
    "§bFollow my light: it shows the door to take and where to crouch.",
    "§bI will be here when you try again.",
  ],
  fire: [
    "§bYou were burned by the falling chandeliers...",
    "§bWatch the ceiling in that last hall, and step around the flames.",
    "§bFollow my light: it shows the safe way past them.",
  ],
  hands: [
    "§bYou were dragged away by Seek's hands...",
    "§bStay away from the windows in that last hall.",
    "§bFollow my light down the middle, around the fire.",
  ],
};

/**
 * Kill something for a Doors creature. Players get a jumpscare, and the Guiding Light's advice
 * when they respawn.
 * @param {Entity} victim @param {Entity} killer @param {"figure" | "seek" | "hands"} kind
 */
export function kill(victim, killer, kind) {
  if (victim.typeId === "minecraft:player") {
    const p = /** @type {Player} */ (victim);
    p.setDynamicProperty(DEATH_KEY, kind);
    title(p, kind === "figure" ? "§4§lTHE FIGURE" : "§0§lSEEK", "", 20);
    try {
      p.playSound("zt.doors.jumpscare", { volume: 1.0 });
    } catch {
      /* ignore */
    }
    sound(victim.dimension, kind === "figure" ? "zt.figure.kill" : "zt.seek.kill", victim.location, 1.4, 1.0);
  }
  try {
    victim.applyDamage(1000000, { cause: /** @type {any} */ ("entityAttack"), damagingEntity: killer });
  } catch {
    /* ignore */
  }
  try {
    const hp = victim.getComponent("minecraft:health");
    if (isValid(victim) && hp && hp.currentValue > 0) victim.kill();
  } catch {
    /* ignore */
  }
}

/** On respawn: the Guiding Light speaks. @param {Player} p */
export function guidance(p) {
  const kind = p.getDynamicProperty(DEATH_KEY);
  if (typeof kind !== "string") return;
  p.setDynamicProperty(DEATH_KEY, undefined);
  const lines = GUIDANCE[kind] ?? GUIDANCE.figure;
  lines.forEach((line, i) => {
    system.runTimeout(() => {
      if (!isValid(p)) return;
      try {
        p.onScreenDisplay.setTitle(" ", { subtitle: line, fadeInDuration: 10, stayDuration: 60, fadeOutDuration: 10 });
        p.sendMessage(line);
        if (i === 0) p.playSound("zt.doors.guiding", { volume: 0.8 });
      } catch {
        /* ignore */
      }
    }, 20 + i * 70);
  });
}

// ---------------------------------------------------------------- lifecycle
/** End a run: its creatures and props go, its doors open, everyone gets their game mode back. @param {Run} run */
export function endRun(run, why) {
  if (run.phase === "over") return;
  run.phase = "over";
  try {
    kinds.get(run.kind)?.end?.(run, why);
  } catch (err) {
    console.warn("[Titans] doors end: " + err);
  }
  for (const [id, s] of run.players) {
    if (s.status === "in") s.status = "out";
    const p = world.getEntity(id);
    if (isValid(p) && s.status !== "dead") restore(/** @type {Player} */ (p));
  }
  removeRunEntities(run);
  // what's left is just a building: leave every door open to walk around it
  for (const door of run.doors) {
    door.locked = false;
    unlockDoor(door);
    guideDoor(door, false);
    if (!door.fake) openDoor(run, door, true);
  }
  runs.delete(run.id);
}

/** A player died: tell their run. @param {Player} p */
export function onPlayerDeath(p) {
  const run = runOf(p);
  if (!run) return;
  leave(run, p, "dead");
  try {
    kinds.get(run.kind)?.death?.(run, p);
  } catch (err) {
    console.warn("[Titans] doors death: " + err);
  }
}

/** Respawn or rejoin: their own game mode back if a run kept it, and the Guiding Light. @param {Player} p */
export function onPlayerSpawn(p, initial) {
  const run = runOf(p);
  if (!run) {
    if (p.getDynamicProperty(MODE_KEY) !== undefined) restore(p);
    else clearRunItems(p);
  }
  if (!initial) system.runTimeout(() => isValid(p) && guidance(p), 10);
  else p.setDynamicProperty(DEATH_KEY, undefined);
}

export function onPlayerLeave(id) {
  for (const run of runs.values()) {
    const s = run.players.get(id);
    if (s && s.status === "in") s.status = "out";
  }
  const m = meterOf.get(id);
  if (m) {
    const e = world.getEntity(m.id);
    if (isValid(e)) e.remove();
    meterOf.delete(id);
  }
}

/** Inside the run's building (with some slack)? @param {Run} run @param {Vector3} loc */
export function inside(run, loc, slack = 2) {
  const l = run.frame.local(loc);
  const b = run.bounds;
  return l.r >= b[0] - slack && l.r <= b[3] + 1 + slack && l.u >= b[1] - slack && l.u <= b[4] + 1 + slack &&
    l.f >= b[2] - slack && l.f <= b[5] + 1 + slack;
}

let sweepAt = 0;
/** Leftovers of runs that no longer exist (the world was closed mid-run). */
function sweep(now) {
  if (now < sweepAt) return;
  sweepAt = now + 100;
  const seen = new Set();
  for (const p of world.getAllPlayers()) {
    let list = [];
    try {
      list = p.dimension.getEntities({ location: p.location, maxDistance: 128, families: ["zt_doors_prop"] });
      list = list.concat(p.dimension.getEntities({ location: p.location, maxDistance: 128, type: "zt:figure" }),
        p.dimension.getEntities({ location: p.location, maxDistance: 128, type: "zt:seek" }));
    } catch {
      continue;
    }
    for (const e of list) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      const tag = e.getDynamicProperty("zt:run");
      if (tag === undefined || tag === "lure") continue;
      if (tag === "meter") {
        if (!isMeter(e.id)) e.remove();
        continue;
      }
      if (runs.has(/** @type {string} */ (tag))) continue;
      if (e.getDynamicProperty("zt:keep")) {
        // a door of a run that is gone: open it for good (unless it's a fake one)
        if (e.typeId === "zt:hotel_door" && !e.getDynamicProperty("zt:fake")) freeDoor(e);
        else if (e.typeId === "zt:hotel_door") e.setDynamicProperty("zt:run", "done");
        continue;
      }
      e.remove();
    }
  }
}

/** @param {Entity} e */
function freeDoor(e) {
  try {
    const gap = JSON.parse(String(e.getDynamicProperty("zt:gap") ?? "null"));
    if (gap) {
      for (let x = gap[0]; x <= gap[3]; x++) {
        for (let y = gap[1]; y <= gap[4]; y++) {
          for (let z = gap[2]; z <= gap[5]; z++) {
            const b = e.dimension.getBlock({ x, y, z });
            if (b?.typeId === "minecraft:barrier") e.dimension.setBlockPermutation({ x, y, z }, perm("minecraft:air"));
          }
        }
      }
    }
    e.setProperty("zt:open", true);
    e.setProperty("zt:locked", false);
    e.setProperty("zt:guided", false);
    e.triggerEvent("zt:unlock");
    e.setDynamicProperty("zt:run", "done");
  } catch {
    /* ignore */
  }
}

/** Per tick: each run's own logic, and players who left their run's building. */
export function doorsTick(now) {
  for (const run of [...runs.values()]) {
    if (run.phase === "over") continue;
    // players who logged off or wandered out of the building
    for (const [id, s] of run.players) {
      if (s.status !== "in") continue;
      const p = world.getEntity(id);
      if (!isValid(p)) {
        s.status = "out";
        continue;
      }
      if (p.dimension.id !== run.dim.id || !inside(run, p.location, 6)) leave(run, /** @type {Player} */ (p), "out");
    }
    try {
      kinds.get(run.kind)?.tick?.(run, now);
    } catch (err) {
      console.warn("[Titans] doors " + run.kind + ": " + err);
    }
    // a built level nobody entered for five minutes, or a run with nobody left in it
    if (run.phase === "ready" && now - run.since > 6000) endRun(run, "abandoned");
    if ((run.phase === "live" || run.phase === "intro") && !livePlayers(run).length) {
      endRun(run, "nobody left");
    }
  }
  sweep(now);
}
