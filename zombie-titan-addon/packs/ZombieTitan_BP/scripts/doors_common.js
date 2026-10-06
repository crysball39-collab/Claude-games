// Shared machinery for the Doors levels (the Library, the Seek chase and the Hotel's Floor 1):
// a "run" is one play-through of a built level with its players; this module tracks them
// (they play in Adventure mode, restored afterwards), works the doors, shows the per-player
// boss bar meters, keeps track of who is hiding, runs cutscene cameras, kills (unless a
// crucifix gets in the way), and gives the Guiding Light's advice after a death.
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
export const CRUCIFIX = "zt:crucifix";
// what a run hands out is taken back when it ends: the Library's paper, the hotel's keys and
// the things found in drawers or bought from Jeff
export const RUN_ITEMS = new Set([PAPER, CRUCIFIX, "zt:room_key", "zt:electrical_key", "zt:lighter", "zt:flashlight",
  "zt:skeleton_key", "zt:breaker_switch", "zt:herb_of_viridis"]);
const MODE_KEY = "zt:doors_mode";
const DEATH_KEY = "zt:doors_death";
const HOME_KEY = "zt:doors_home";

/**
 * @typedef {{ status: "in" | "dead" | "out" | "escaped", name: string }} Seat
 * @typedef {{ id: string, cells: number[], open: boolean, locked: boolean, number: number | null, fake: boolean,
 *   fr: Frame, type: string, skull: boolean }} Door
 * @typedef {{
 *   id: string, kind: string, dim: Dimension, frame: Frame, owner: string,
 *   start: { loc: Vector3, rot: { x: number, y: number } },
 *   players: Map<string, Seat>, phase: string, ents: Set<string>, doors: Door[], bounds: number[],
 *   since: number, data: any,
 * }} Run
 */

/** @type {Map<string, Run>} */
export const runs = new Map();
/**
 * What each kind of run does: its tick, its end, a player's death in it, and (optionally) what
 * counts as inside it, for runs whose players aren't all in one building box.
 * @type {Map<string, { tick?: (run: Run, now: number) => void, end?: (run: Run, why: string) => void,
 *   death?: (run: Run, p: Player) => void, inside?: (run: Run, loc: Vector3) => boolean }>}
 */
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
  hiding.delete(p.id);
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

/** Is this one of the things a run hands out (and takes back)? @param {string} [typeId] */
export function isRunItem(typeId) {
  return !!typeId && (RUN_ITEMS.has(typeId) || typeId.startsWith(BOOK_PREFIX));
}

/** Take the run's things away again: books, papers, keys, lighters... @param {Player} p */
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
    if (it && isRunItem(it.typeId)) inv.setItem(i, undefined);
  }
  try {
    const eq = p.getComponent("minecraft:equippable");
    if (isRunItem(eq?.getEquipment(/** @type {any} */ ("Offhand"))?.typeId)) eq.setEquipment(/** @type {any} */ ("Offhand"), undefined);
  } catch {
    /* ignore */
  }
}

/** How many of an item a player carries. @param {Player} p */
export function countItem(p, typeId) {
  let n = 0;
  try {
    const inv = p.getComponent("minecraft:inventory")?.container;
    for (let i = 0; inv && i < inv.size; i++) {
      const it = inv.getItem(i);
      if (it?.typeId === typeId) n += it.amount;
    }
  } catch {
    /* ignore */
  }
  return n;
}

/** Take `n` of an item from a player; true if they had that many. @param {Player} p */
export function takeItem(p, typeId, n = 1) {
  if (countItem(p, typeId) < n) return false;
  try {
    const inv = p.getComponent("minecraft:inventory")?.container;
    for (let i = 0; inv && i < inv.size && n > 0; i++) {
      const it = inv.getItem(i);
      if (it?.typeId !== typeId) continue;
      const k = Math.min(n, it.amount);
      n -= k;
      if (k >= it.amount) inv.setItem(i, undefined);
      else {
        it.amount -= k;
        inv.setItem(i, it);
      }
    }
  } catch {
    return false;
  }
  return n <= 0;
}

/** The item in a player's main hand. @param {Player} p */
export function heldItem(p) {
  try {
    return p.getComponent("minecraft:equippable")?.getEquipment(/** @type {any} */ ("Mainhand"));
  } catch {
    return undefined;
  }
}

/** A run item that stays put: can't be dropped, kept on death. @param {Player} p */
export function giveRunItem(p, typeId, name, lore, amount = 1) {
  const it = new ItemStack(typeId, amount);
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

// ---------------------------------------------------------------- doors
/**
 * A door in the wall at frame row f, its opening over cells r..r+w-1, u..u+h-1 (2 x 3 unless
 * opts says otherwise). Closed, the opening is filled with barrier blocks; the door entity only
 * shows it. `number` goes on its plate (null: a plain plate, or none for a side room's door).
 *   opts.type    the door entity: "zt:hotel_door" (default), "zt:gate_door", "zt:metal_door", "zt:big_gate"
 *   opts.frame   the frame its cells are in (default: the run's)
 *   opts.locked  shut with a padlock (opts.skull: a skull lock only a skeleton key opens)
 *   opts.fake    a wrong door that leads nowhere: it stays shut for good
 *   opts.yaw     which way its front faces (default: back toward the frame's start)
 * @param {Run} run
 */
export function spawnDoor(run, r, u, f, number, opts = {}) {
  const fr = opts.frame ?? run.frame;
  const w = opts.width ?? 2;
  const h = opts.height ?? 3;
  const type = opts.type ?? "zt:hotel_door";
  const e = spawnFor(run, type, fr.at(r + w / 2, u, f + 0.5), { keep: opts.keep ?? true, yaw: opts.yaw ?? fr.yawOf("b") });
  if (type === "zt:hotel_door" || type === "zt:gate_door") {
    e.setProperty("zt:number", number === null || number === undefined ? (opts.plate === false ? -2 : -1) : number);
  }
  /** @type {Door} */
  const door = { id: e.id, cells: [r, u, f, r + w - 1, u + h - 1, f], open: false, locked: !!opts.locked, number: number ?? null,
    fake: !!opts.fake, fr, type, skull: !!opts.skull };
  // a fake door (Seek's rooms with three doors) leads nowhere: it stays shut for good
  if (door.fake) e.setDynamicProperty("zt:fake", true);
  const [a, b] = worldBox(fr, door.cells);
  e.setDynamicProperty("zt:gap", JSON.stringify([a.x, a.y, a.z, b.x, b.y, b.z]));
  fillGap(run, door, "minecraft:barrier");
  if (door.locked) lockDoor(door, door.skull);
  run.doors.push(door);
  return door;
}

/** @param {Run} run @param {Door} door */
function fillGap(run, door, block) {
  const [a, b] = worldBox(door.fr ?? run.frame, door.cells);
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

const DOOR_SOUNDS = {
  "zt:hotel_door": ["zt.doors.open", "zt.doors.close"],
  "zt:gate_door": ["zt.gate.open", "zt.gate.close"],
  "zt:metal_door": ["zt.metal_door.open", "zt.metal_door.close"],
  "zt:big_gate": ["zt.big_gate.open", "zt.big_gate.open"],
  "zt:elevator_door": ["zt.elevator.open", "zt.elevator.close"],
  "zt:elevator_gate": ["zt.elevator.gate", "zt.elevator.gate"],
};

/** @param {Run} run @param {Door} door */
export function openDoor(run, door, silent = false) {
  if (door.open) return;
  door.open = true;
  fillGap(run, door, "minecraft:air");
  const e = doorEntity(door);
  if (e) {
    e.setProperty("zt:open", true);
    const snd = (DOOR_SOUNDS[door.type] ?? DOOR_SOUNDS["zt:hotel_door"])[0];
    if (!silent) sound(run.dim, snd, e.location, 1.0, 0.9 + Math.random() * 0.15);
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
    const snd = (DOOR_SOUNDS[door.type] ?? DOOR_SOUNDS["zt:hotel_door"])[1];
    sound(run.dim, slam ? "zt.doors.slam" : snd, e.location, slam ? 1.6 : 1.0, 1.0);
  }
}

/** Fill a closed door's opening again (after building next to it). @param {Run} run @param {Door} door */
export function sealDoor(run, door) {
  if (!door.open) fillGap(run, door, "minecraft:barrier");
}

/** Lock a door: a padlock, or a skull lock. @param {Door} door */
export function lockDoor(door, skull = false) {
  door.locked = true;
  door.skull = skull;
  const e = doorEntity(door);
  if (!e) return;
  try {
    e.setProperty("zt:locked", true);
    if (door.type === "zt:hotel_door") e.setProperty("zt:skull", skull);
    e.triggerEvent("zt:lock");
  } catch {
    /* ignore */
  }
}

/** @param {Door} door */
export function unlockDoor(door) {
  door.locked = false;
  const e = doorEntity(door);
  if (e) {
    try {
      e.setProperty("zt:locked", false);
      if (door.type === "zt:hotel_door") e.setProperty("zt:skull", false);
      e.triggerEvent("zt:unlock");
    } catch {
      /* ignore */
    }
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
  const [r0, u0, f, r1, u1] = door.cells;
  return (door.fr ?? run.frame).at((r0 + r1 + 1) / 2, (u0 + u1 + 1) / 2, f + 0.5);
}

/** Where a player stands in front of a door: its middle, at its floor. @param {Run} run @param {Door} door */
export function doorFoot(run, door) {
  const [r0, u0, f, r1] = door.cells;
  return (door.fr ?? run.frame).at((r0 + r1 + 1) / 2, u0, f + 0.5);
}

/** Open a closed door when a player walks up to it (unless it's locked). @param {Run} run */
export function autoOpenDoors(run, players, reach = 2.6, filter) {
  for (const door of run.doors) {
    if (door.open || door.locked || (filter && !filter(door))) continue;
    const c = doorFoot(run, door);
    for (const p of players) {
      if (len(sub(p.location, c)) <= reach) {
        openDoor(run, door);
        break;
      }
    }
  }
}

// ---------------------------------------------------------------- meters (boss bars)
/** Each player's meters by type: the id of the marker that carries it. @type {Map<string, Map<string, string>>} */
const meterOf = new Map();
const METER_TYPES = { figure: "zt:figure_bar", seek: "zt:seek_bar", switches: "zt:switch_bar" };

/**
 * Show this player a boss-bar meter: a hidden marker that follows them, whose health is the
 * meter's value (1-100). Only players right next to it see its bar. A player can have one
 * meter of each type at once.
 * @param {Player} p @param {"figure" | "seek" | "switches"} type
 */
export function setMeter(p, type, value) {
  let mine = meterOf.get(p.id);
  if (!mine) {
    mine = new Map();
    meterOf.set(p.id, mine);
  }
  const id = mine.get(type);
  let e = id ? world.getEntity(id) : undefined;
  if (id && !isValid(e)) {
    mine.delete(type);
    e = undefined;
  }
  const at = { x: p.location.x, y: p.location.y + 0.2, z: p.location.z };
  try {
    if (!e) {
      e = p.dimension.spawnEntity(METER_TYPES[type], at);
      e.setDynamicProperty("zt:run", "meter");
      mine.set(type, e.id);
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
  clearMeters(p.id, type);
}

function clearMeters(pid, type) {
  const mine = meterOf.get(pid);
  if (!mine) return;
  for (const [t, id] of [...mine]) {
    if (type && t !== type) continue;
    const e = world.getEntity(id);
    if (isValid(e)) e.remove();
    mine.delete(t);
  }
  if (!mine.size) meterOf.delete(pid);
}

export function isMeter(id) {
  for (const mine of meterOf.values()) for (const m of mine.values()) if (m === id) return true;
  return false;
}

// ---------------------------------------------------------------- hiding
/**
 * Who is hiding right now (in a closet, under a bed...), and since when. The Floor 1 run
 * puts players in and takes them out; Rush, the Figure and Screech can't find them there.
 * @type {Map<string, { kind: string, since: number, spot?: any, paused?: number, warned?: boolean, released?: boolean }>}
 */
export const hiding = new Map();

/** @param {Player | Entity} p */
export function isHidden(p) {
  return hiding.has(p.id);
}

// ---------------------------------------------------------------- the crucifix
/** Holding up a crucifix? @param {Player} p */
export function holdsCrucifix(p) {
  return heldItem(p)?.typeId === CRUCIFIX;
}

/**
 * The crucifix in a player's hand works: chains of the Guiding Light burst out of the floor
 * at `at`, and the crucifix is used up.
 * @param {Player} p @param {Vector3} at
 */
export function spendCrucifix(p, at) {
  try {
    const eq = p.getComponent("minecraft:equippable");
    const it = eq?.getEquipment(/** @type {any} */ ("Mainhand"));
    if (it?.typeId === CRUCIFIX) {
      if (it.amount > 1) {
        it.amount -= 1;
        eq.setEquipment(/** @type {any} */ ("Mainhand"), it);
      } else eq.setEquipment(/** @type {any} */ ("Mainhand"), undefined);
    }
  } catch {
    /* ignore */
  }
  sound(p.dimension, "zt.crucifix.chains", at, 2.0, 1.0);
  particle(p.dimension, "zt:crucifix_chains", at);
  particle(p.dimension, "zt:guiding_light", { x: at.x, y: at.y + 1, z: at.z }, { hx: 0.8, hy: 1.2, hz: 0.8 });
  title(p, "§b✝", "§bThe crucifix shines with the Guiding Light!", 40);
}

// ---------------------------------------------------------------- cutscenes and screen
/**
 * Lock or free a player's movement. With `keepSneak`, only walking and jumping are locked (a
 * player hiding in a closet crouches to get out).
 * @param {Player} p
 */
export function lockInput(p, locked, keepSneak = false) {
  try {
    const perms = p.inputPermissions;
    if (locked && keepSneak) {
      perms.setPermissionCategory(InputPermissionCategory.LateralMovement, false);
      perms.setPermissionCategory(InputPermissionCategory.Jump, false);
      return;
    }
    perms.setPermissionCategory(InputPermissionCategory.Movement, !locked);
    if (!locked) {
      perms.setPermissionCategory(InputPermissionCategory.LateralMovement, true);
      perms.setPermissionCategory(InputPermissionCategory.Jump, true);
    }
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
  rush: [
    "§bYou died to who you call Rush...",
    "§bIt makes its presence known. When the lights flicker, it is coming.",
    "§bHide in a closet or under a bed, and wait until it has passed.",
    "§bI will be here when you try again.",
  ],
  screech: [
    "§bYou died to who you call Screech...",
    "§bIt lurks in the dark rooms. When you hear it whisper, look around.",
    "§bFind it and look right at it, and it will leave you alone.",
    "§bI will be here when you try again.",
  ],
  hide: [
    "§bYou died to who you call Hide...",
    "§bIt doesn't like it when someone stays hidden too long.",
    "§bWhen you see its eyes, get out of your hiding spot at once.",
    "§bI will be here when you try again.",
  ],
  elevator: [
    "§bYou didn't make it to the elevator...",
    "§bWhen the power comes back, run for it, and don't look back.",
    "§bI will be here when you try again.",
  ],
};

const KILLERS = {
  figure: ["§4§lTHE FIGURE", "zt.figure.kill"],
  elevator: ["§4§lTHE FIGURE", "zt.figure.kill"],
  seek: ["§0§lSEEK", "zt.seek.kill"],
  hands: ["§0§lSEEK", "zt.seek.kill"],
  rush: ["§8§lRUSH", "zt.rush.kill"],
};

/**
 * Kill something for a Doors creature. Players get a jumpscare, and the Guiding Light's advice
 * when they respawn.
 * @param {Entity} victim @param {Entity} killer @param {"figure" | "seek" | "hands" | "rush" | "elevator"} kind
 */
export function kill(victim, killer, kind) {
  if (victim.typeId === "minecraft:player") {
    const p = /** @type {Player} */ (victim);
    p.setDynamicProperty(DEATH_KEY, kind);
    const [text, snd] = KILLERS[kind] ?? KILLERS.figure;
    title(p, text, "", 20);
    try {
      p.playSound("zt.doors.jumpscare", { volume: 1.0 });
    } catch {
      /* ignore */
    }
    sound(victim.dimension, snd, victim.location, 1.4, 1.0);
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

/**
 * Hurt a player for a Doors creature (Screech's bite, Hide's kick); if it is enough to kill
 * them, the Guiding Light knows who did it.
 * @param {Player} p @param {number} amount @param {"screech" | "hide"} kind
 */
export function hurt(p, amount, kind) {
  try {
    const hp = p.getComponent("minecraft:health");
    if (hp && hp.currentValue <= amount) p.setDynamicProperty(DEATH_KEY, kind);
    p.applyDamage(amount, { cause: /** @type {any} */ ("entityAttack") });
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
  hiding.delete(p.id);
  leave(run, p, "dead");
  try {
    kinds.get(run.kind)?.death?.(run, p);
  } catch (err) {
    console.warn("[Titans] doors death: " + err);
  }
}

/**
 * Where a player who dies in this run comes back (the hotel's lobby), instead of their own spawn point.
 * @param {Player} p @param {Dimension} dim @param {Vector3} loc @param {number} yaw
 */
export function setHome(p, dim, loc, yaw) {
  try {
    p.setDynamicProperty(HOME_KEY, JSON.stringify({ dim: dim.id, x: loc.x, y: loc.y, z: loc.z, yaw }));
  } catch {
    /* ignore */
  }
}

/** @param {Player} p */
function goHome(p) {
  const raw = p.getDynamicProperty(HOME_KEY);
  if (typeof raw !== "string") return;
  p.setDynamicProperty(HOME_KEY, undefined);
  try {
    const h = JSON.parse(raw);
    const dim = world.getDimension(h.dim);
    fade(p, 0.0, 0.4, 0.8);
    p.teleport({ x: h.x, y: h.y, z: h.z }, { dimension: dim, rotation: { x: 0, y: h.yaw } });
  } catch {
    /* ignore */
  }
}

/** Respawn or rejoin: their own game mode back if a run kept it, and the Guiding Light. @param {Player} p */
export function onPlayerSpawn(p, initial) {
  const run = runOf(p);
  if (!run) {
    if (p.getDynamicProperty(MODE_KEY) !== undefined) restore(p);
    else clearRunItems(p);
    // a dark room's fog, if they left the game in one
    try {
      p.runCommand("fog @s remove zt_dark");
    } catch {
      /* ignore */
    }
  }
  if (!initial) {
    system.runTimeout(() => {
      if (!isValid(p)) return;
      if (!runOf(p)) goHome(p);
      guidance(p);
    }, 10);
  } else {
    p.setDynamicProperty(DEATH_KEY, undefined);
    p.setDynamicProperty(HOME_KEY, undefined);
  }
}

export function onPlayerLeave(id) {
  for (const run of runs.values()) {
    const s = run.players.get(id);
    if (s && s.status === "in") s.status = "out";
  }
  hiding.delete(id);
  clearMeters(id);
}

/** Inside the run's building (with some slack)? @param {Run} run @param {Vector3} loc */
export function inside(run, loc, slack = 2) {
  const own = kinds.get(run.kind)?.inside;
  if (own) return own(run, loc);
  const l = run.frame.local(loc);
  const b = run.bounds;
  return l.r >= b[0] - slack && l.r <= b[3] + 1 + slack && l.u >= b[1] - slack && l.u <= b[4] + 1 + slack &&
    l.f >= b[2] - slack && l.f <= b[5] + 1 + slack;
}

/** Checks that say a "lobby:..." tag still belongs to something (the lobbies register one). @type {((tag: string) => boolean)[]} */
const keepers = [];
export function keepTagged(check) {
  keepers.push(check);
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
      if (tag === undefined || tag === "lure" || tag === "done") continue;
      if (tag === "meter") {
        if (!isMeter(e.id)) e.remove();
        continue;
      }
      if (runs.has(/** @type {string} */ (tag))) continue;
      if (typeof tag === "string" && tag.startsWith("lobby:")) {
        if (!keepers.some((k) => k(tag))) e.remove();
        continue;
      }
      // a door of a run that is gone: open it for good (unless it's a fake one)
      const isDoor = DOOR_SOUNDS[e.typeId] !== undefined;
      if (isDoor && !e.getDynamicProperty("zt:fake")) freeDoor(e);
      if (e.getDynamicProperty("zt:keep")) {
        if (isDoor) e.setDynamicProperty("zt:run", "done");
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
    if (e.typeId === "zt:hotel_door" || e.typeId === "zt:gate_door") e.setProperty("zt:guided", false);
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
    // a level that never finished building (its area wouldn't load), a built level nobody
    // entered for five minutes, or a run with nobody left in it
    if (run.phase === "building" && now - run.since > 1200) {
      const owner = world.getEntity(run.owner);
      if (isValid(owner)) {
        /** @type {Player} */ (owner).sendMessage("§cThe level couldn't finish building: part of its area isn't loaded. Stay close to it, or try again in an open space.");
      }
      endRun(run, "build failed");
    }
    if (run.phase === "ready" && now - run.since > 6000) endRun(run, "abandoned");
    if (run.phase !== "building" && run.phase !== "ready" && run.phase !== "over" && !livePlayers(run).length) {
      endRun(run, "nobody left");
    }
  }
  sweep(now);
}
