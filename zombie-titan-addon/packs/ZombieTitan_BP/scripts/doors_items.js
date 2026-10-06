// The Hotel's items (DOORS): found in drawers or bought at Jeff's shop, and taken back when
// the run ends.
//   Lighter       use to light it: a glow follows you; a minute of fuel (its durability bar)
//   Flashlight    use to switch it on: lights up what you point it at; two minutes of battery
//   Crucifix      hold it up when Rush or Screech would get you and they're dragged into the
//                 floor; Seek and the Figure are only held back for five seconds
//   Skeleton Key  opens any lock, skull locks too; two uses
//   Herb of Viridis  eat it: a little faster, and healing, for the rest of the run
import { ItemLockMode, ItemStack, system, world } from "@minecraft/server";
import { perm } from "./doors_build.js";
import * as Doors from "./doors_common.js";
import { isValid } from "./util.js";

/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

export const KINDS = {
  lighter: { id: "zt:lighter", name: "§6Lighter", lore: ["§7Use to light it. A glow follows you.", "§7About a minute of fuel."] },
  flashlight: { id: "zt:flashlight", name: "§eFlashlight", lore: ["§7Use to switch it on.", "§7Two minutes of battery."] },
  crucifix: { id: "zt:crucifix", name: "§bCrucifix", lore: ["§7Hold it up when something comes for you.", "§7Rush and Screech can't stand it."] },
  skeleton_key: { id: "zt:skeleton_key", name: "§fSkeleton Key", lore: ["§7Opens any lock, even skull locks.", "§7Two uses."] },
  herb: { id: "zt:herb_of_viridis", name: "§aHerb of Viridis", lore: ["§7Eat it: a little faster and healing,", "§7for the rest of the run."] },
};

/**
 * Give a player one of the hotel's items; false if they already have one (one of each at a time).
 * @param {Player} p @param {keyof typeof KINDS} kind
 */
export function give(p, kind, bought = false) {
  const k = KINDS[kind];
  if (!k) return false;
  if (Doors.countItem(p, k.id) > 0) return false;
  const it = new ItemStack(k.id, 1);
  it.nameTag = k.name;
  it.setLore(k.lore);
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
    return false;
  }
  Doors.sound(p.dimension, "zt.item.pickup", p.location, 1.0, 1.0);
  Doors.title(p, k.name, bought ? "§7Bought from Jeff" : "§7You found it!", 40);
  return true;
}

// ---------------------------------------------------------------- lights
/**
 * Lit lighters and flashlights: which, and the light blocks placed for them.
 * @type {Map<string, { kind: "lighter" | "flashlight", placed: Vector3[], dim: any, fuelAt: number }>}
 */
const lit = new Map();
/** Lights their player switched off themselves (by using it): which kind. @type {Map<string, string>} */
const switchedOff = new Map();
/** Each player's dark-room fog: "room", "lighter" or "flashlight". @type {Map<string, string>} */
const fogOf = new Map();

/** Is this player carrying a lit light? @param {Player} p */
export function isLit(p) {
  return lit.has(p.id);
}

/** Which light this player has lit, if any. @param {Player} p */
export function litKind(p) {
  return lit.get(p.id)?.kind;
}

/**
 * Dark rooms are dark: a black fog closes in a few blocks away, and a lit lighter (or, farther, a
 * flashlight) pushes it back. mode: "room" (no light), "lighter", "flashlight", or undefined for none.
 * @param {Player} p @param {string | undefined} mode
 */
export function setDark(p, mode) {
  if (fogOf.get(p.id) === mode) return;
  try {
    if (fogOf.has(p.id)) p.runCommand("fog @s remove zt_dark");
    if (mode) p.runCommand("fog @s push zt:dark_" + mode + " zt_dark");
  } catch {
    /* ignore */
  }
  if (mode) fogOf.set(p.id, mode);
  else fogOf.delete(p.id);
}

/** @param {Player} p */
function heldKind(p) {
  const id = Doors.heldItem(p)?.typeId;
  if (id === KINDS.lighter.id) return "lighter";
  if (id === KINDS.flashlight.id) return "flashlight";
  return undefined;
}

/** Light it (it then follows its player in itemsTick). @param {Player} p @param {"lighter" | "flashlight"} kind */
function lightUp(p, kind) {
  if (lit.has(p.id)) off(p.id);
  lit.set(p.id, { kind, placed: [], dim: p.dimension, fuelAt: system.currentTick + 20 });
  Doors.sound(p.dimension, kind === "lighter" ? "zt.lighter.flick" : "zt.flashlight.click", p.location, 1.0, 1.0);
  Doors.actionbar(p, kind === "lighter" ? "§6The lighter flickers on. §7(Use it to close it.)" : "§eFlashlight on. §7(Use it to switch it off.)");
}

/** Use of an item. @param {Player} p */
export function onUse(p, typeId, run, d) {
  if (typeId === KINDS.lighter.id || typeId === KINDS.flashlight.id) {
    // held, a light is on by itself; using it switches it off, and on again
    const kind = typeId === KINDS.lighter.id ? "lighter" : "flashlight";
    const on = lit.get(p.id);
    if (on && on.kind === kind) {
      off(p.id);
      switchedOff.set(p.id, kind);
      Doors.sound(p.dimension, kind === "lighter" ? "zt.lighter.close" : "zt.flashlight.click", p.location, 1.0, 0.9);
      Doors.actionbar(p, kind === "lighter" ? "§7You close the lighter." : "§7Flashlight off.");
      return;
    }
    switchedOff.delete(p.id);
    lightUp(p, kind);
    return;
  }
  if (typeId === KINDS.herb.id) {
    if (!d) {
      p.sendMessage("§7It's just a plant now.");
      return;
    }
    Doors.takeItem(p, typeId);
    d.herb.add(p.id);
    herbEffects(p);
    Doors.sound(p.dimension, "zt.herb.eat", p.location, 1.0, 1.0);
    Doors.title(p, "§aHerb of Viridis", "§7You feel quicker, and your wounds close.", 50);
    return;
  }
  if (typeId === KINDS.skeleton_key.id) Doors.actionbar(p, "§7Tap a locked door with it to unlock it.");
  else if (typeId === "zt:room_key") Doors.actionbar(p, "§7Tap the locked door to unlock it.");
  else if (typeId === "zt:electrical_key") Doors.actionbar(p, "§7It opens the High Voltage room.");
  else if (typeId === "zt:breaker_switch") Doors.actionbar(p, "§7Put the switches in the breaker box.");
  else if (typeId === KINDS.crucifix.id) Doors.actionbar(p, "§bHold it up when something comes for you.");
}

/** @param {Player} p */
function herbEffects(p) {
  try {
    p.addEffect("speed", 20 * 13, { amplifier: 0, showParticles: false });
    p.addEffect("regeneration", 20 * 13, { amplifier: 0, showParticles: false });
  } catch {
    /* ignore */
  }
}

/** Put a light out and take its light blocks away. */
export function off(pid) {
  const l = lit.get(pid);
  if (!l) return;
  for (const at of l.placed) clearLight(l.dim, at);
  lit.delete(pid);
}

/** A player is gone (or their run ended): their light goes out, and the dark lifts. */
export function forget(pid) {
  off(pid);
  switchedOff.delete(pid);
  const p = world.getEntity(pid);
  if (isValid(p)) setDark(/** @type {Player} */ (p), undefined);
  else fogOf.delete(pid);
}

function clearLight(dim, at) {
  try {
    const b = dim.getBlock(at);
    if (b?.typeId.startsWith("minecraft:light_block")) dim.setBlockPermutation(at, perm("minecraft:air"));
  } catch {
    /* unloaded */
  }
}

/** Put light blocks at the given spots (only where it's air), clearing the old ones. */
function lightAt(l, spots) {
  const keep = [];
  for (const s of spots) {
    const at = { x: Math.floor(s.at.x), y: Math.floor(s.at.y), z: Math.floor(s.at.z) };
    if (keep.some((k) => k.x === at.x && k.y === at.y && k.z === at.z)) continue;
    try {
      const b = l.dim.getBlock(at);
      if (!b || !(b.typeId === "minecraft:air" || b.typeId.startsWith("minecraft:light_block"))) continue;
      const p = perm("minecraft:light_block_" + s.level);
      if (p && b.typeId !== "minecraft:light_block_" + s.level) l.dim.setBlockPermutation(at, p);
      keep.push(at);
    } catch {
      /* unloaded */
    }
  }
  for (const old of l.placed) {
    if (!keep.some((k) => k.x === old.x && k.y === old.y && k.z === old.z)) clearLight(l.dim, old);
  }
  l.placed = keep;
}

/** Use up a second of the held light's fuel; false once it runs out. @param {Player} p */
function burn(p) {
  try {
    const eq = p.getComponent("minecraft:equippable");
    const it = eq?.getEquipment(/** @type {any} */ ("Mainhand"));
    const dur = it?.getComponent("minecraft:durability");
    if (!it || !dur) return true;
    if (dur.damage + 1 >= dur.maxDurability) {
      eq.setEquipment(/** @type {any} */ ("Mainhand"), undefined);
      return false;
    }
    dur.damage += 1;
    eq.setEquipment(/** @type {any} */ ("Mainhand"), it);
  } catch {
    /* ignore */
  }
  return true;
}

/** A light in your hand is lit (unless you switched it off) and follows you; the herb's effects stay on. */
export function itemsTick(run, d, now) {
  for (const [pid, st] of run.players) {
    if (st.status !== "in") {
      if (lit.has(pid) || fogOf.has(pid)) forget(pid);
      continue;
    }
    const p = /** @type {Player} */ (world.getEntity(pid));
    if (!isValid(p)) {
      off(pid);
      continue;
    }
    const kind = heldKind(p);
    if (switchedOff.has(pid) && switchedOff.get(pid) !== kind) switchedOff.delete(pid);
    if (lit.has(pid) && lit.get(pid)?.kind !== kind) off(pid);     // put away: it goes out
    if (kind && !lit.has(pid) && !switchedOff.has(pid)) lightUp(p, kind);
    const l = lit.get(pid);
    if (!l) continue;
    if (now % 2 === 0) {
      const head = p.getHeadLocation();
      const spots = [{ at: head, level: l.kind === "lighter" ? 12 : 8 }];
      if (l.kind === "flashlight") {
        const v = p.getViewDirection();
        let reach = 10;
        try {
          const hit = p.dimension.getBlockFromRay(head, v, { maxDistance: 10 });
          if (hit) reach = Math.max(1, Math.hypot(hit.block.location.x + 0.5 - head.x, hit.block.location.y + 0.5 - head.y,
            hit.block.location.z + 0.5 - head.z) - 1.0);
        } catch {
          /* ignore */
        }
        spots.push({ at: { x: head.x + v.x * reach, y: head.y + v.y * reach, z: head.z + v.z * reach }, level: 15 });
        spots.push({ at: { x: head.x + v.x * reach * 0.5, y: head.y + v.y * reach * 0.5, z: head.z + v.z * reach * 0.5 }, level: 11 });
      }
      lightAt(l, spots);
    }
    if (now >= l.fuelAt) {
      l.fuelAt = now + 20;
      if (!burn(p)) {
        off(pid);
        Doors.actionbar(p, l.kind === "lighter" ? "§7Your lighter ran out of fuel." : "§7Your flashlight's battery died.");
        Doors.sound(p.dimension, "zt.item.break", p.location, 1.0, 1.0);
      }
    }
  }
  if (d && now % 200 === 0) {
    for (const pid of d.herb) {
      const p = world.getEntity(pid);
      if (isValid(p) && run.players.get(pid)?.status === "in") herbEffects(/** @type {Player} */ (p));
    }
  }
}

// ---------------------------------------------------------------- keys
/** Use one of a skeleton key's two uses; true if the player had one. @param {Player} p */
export function useSkeletonKey(p) {
  try {
    const inv = p.getComponent("minecraft:inventory")?.container;
    for (let i = 0; inv && i < inv.size; i++) {
      const it = inv.getItem(i);
      if (it?.typeId !== KINDS.skeleton_key.id) continue;
      const dur = it.getComponent("minecraft:durability");
      if (!dur || dur.damage + 1 >= dur.maxDurability) {
        inv.setItem(i, undefined);
        Doors.actionbar(p, "§7The skeleton key crumbles to dust.");
      } else {
        dur.damage += 1;
        inv.setItem(i, it);
        Doors.actionbar(p, "§7The skeleton key has one use left.");
      }
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

