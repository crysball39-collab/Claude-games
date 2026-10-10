// What the Players know about the world, shared between them (Players tell each other what they
// find) and kept with the world: villages, Nether fortresses, portals, strongholds, the way
// thrown eyes of ender flew, chests already looted, and the blocks real players have placed
// (a Player never breaks those).
import { system, world } from "@minecraft/server";
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

const KEY = "zt:bot_world";
const PLACED_KEY = "zt:bot_placed";
/** @type {{[kind: string]: Array<any>}} */
let mem;
let dirty = false;

function load() {
  if (mem) return mem;
  try {
    const raw = world.getDynamicProperty(KEY);
    mem = raw ? JSON.parse(String(raw)) : {};
  } catch {
    mem = {};
  }
  return mem;
}
/** Write what changed (now and then: the tick calls this). */
export function save() {
  if (!dirty || !mem) return;
  dirty = false;
  try {
    let text = JSON.stringify(mem);
    // keep well inside a property's size: drop the oldest of the longest lists
    while (text.length > 30000) {
      const longest = Object.keys(mem).sort((a, b) => mem[b].length - mem[a].length)[0];
      mem[longest].splice(0, Math.ceil(mem[longest].length / 4));
      text = JSON.stringify(mem);
    }
    world.setDynamicProperty(KEY, text);
  } catch {
    /* ignore */
  }
}

/**
 * Remember a place of some kind ("village", "fortress", "portal", "stronghold", "spawner",
 * "eye", "looted", "gateway", "city"...). One within `same` blocks of another in the same
 * dimension is the same place (it updates it). Returns the entry.
 * @param {string} kind @param {string} dim @param {Vector3} pos @param {any} [data] @param {number} [same]
 */
export function remember(kind, dim, pos, data = {}, same = 48) {
  const m = load();
  const list = (m[kind] ??= []);
  const p = { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) };
  let e = list.find((x) => x.dim === dim && Math.hypot(x.pos.x - p.x, x.pos.z - p.z) <= same);
  if (e) Object.assign(e, data);
  else {
    e = { dim, pos: p, at: system.currentTick, ...data };
    list.push(e);
    if (list.length > 200) list.shift();
  }
  dirty = true;
  return e;
}
/** Places of a kind (in a dimension), nearest first if `near` is given. @param {string} kind @param {string} [dim] @param {Vector3} [near] */
export function recall(kind, dim, near) {
  const list = (load()[kind] ?? []).filter((x) => !dim || x.dim === dim);
  if (near) list.sort((a, b) => Math.hypot(a.pos.x - near.x, a.pos.z - near.z) - Math.hypot(b.pos.x - near.x, b.pos.z - near.z));
  return list;
}
/** Something about a remembered place changed (it was looked at, emptied...). */
export function changed() {
  dirty = true;
}
/** Forget one. @param {string} kind @param {any} entry */
export function forget(kind, entry) {
  const list = load()[kind];
  if (!list) return;
  const i = list.indexOf(entry);
  if (i >= 0) list.splice(i, 1);
  dirty = true;
}
/** Has a chest at this spot been emptied before? @param {string} dim @param {Vector3} p */
export function looted(dim, p) {
  return recall("looted", dim).some((x) => x.pos.x === Math.floor(p.x) && x.pos.y === Math.floor(p.y) && x.pos.z === Math.floor(p.z));
}
/** @param {string} dim @param {Vector3} p */
export function markLooted(dim, p) {
  remember("looted", dim, p, {}, 0);
}

// ---------------------------------------------------------------- blocks real players placed
/** @param {Set<string>} set */
export function loadPlaced(set) {
  try {
    const raw = world.getDynamicProperty(PLACED_KEY);
    for (const k of raw ? JSON.parse(String(raw)) : []) set.add(k);
  } catch {
    /* ignore */
  }
}
/** @param {Set<string>} set */
export function savePlaced(set) {
  try {
    let list = [...set];
    if (list.length > 1500) list = list.slice(-1500);
    world.setDynamicProperty(PLACED_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- eyes of ender thrown by players
/** eye entity id -> where it started */
const eyes = new Map();
/** A player threw an eye of ender: note where it starts, to see which way it flies. @param {any} e */
export function onEyeThrown(e) {
  try {
    eyes.set(e.id, { e, dim: e.dimension.id, from: { ...e.location }, at: system.currentTick });
  } catch {
    /* ignore */
  }
}
/** Each tick: eyes that have flown a while give a direction toward a stronghold. */
export function eyesTick() {
  const now = system.currentTick;
  for (const [id, t] of eyes) {
    if (now - t.at < 12) continue;
    eyes.delete(id);
    let to;
    try {
      to = t.e.isValid ? t.e.location : undefined;
    } catch {
      to = undefined;
    }
    if (!to) continue;
    const dx = to.x - t.from.x;
    const dz = to.z - t.from.z;
    const d = Math.hypot(dx, dz);
    if (d < 1) continue;
    remember("eye", t.dim, t.from, { dx: dx / d, dz: dz / d }, 24);
  }
}
/**
 * Where the eyes say a stronghold is: where two eye lines cross (if they cross at a fair
 * angle), or a point far along one line.
 * @param {string} dim @param {Vector3} near
 */
export function strongholdGuess(dim, near) {
  const lines = recall("eye", dim, near).slice(0, 6);
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i];
      const b = lines[j];
      const cross = a.dx * b.dz - a.dz * b.dx;
      if (Math.abs(cross) < 0.25) continue;
      const t = ((b.pos.x - a.pos.x) * b.dz - (b.pos.z - a.pos.z) * b.dx) / cross;
      if (t < 0 || t > 6000) continue;
      return { x: a.pos.x + a.dx * t, z: a.pos.z + a.dz * t, sure: true };
    }
  }
  if (lines.length) {
    const a = lines[0];
    return { x: a.pos.x + a.dx * 400, z: a.pos.z + a.dz * 400, sure: false, line: a };
  }
  return undefined;
}
