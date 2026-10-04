// Obsidian gear: the sword's dash and the full armor set's bonus.
//   Obsidian Sword - 15 damage; tap and hold (use) to launch yourself forward
//   Full armor set - Resistance I while all four obsidian pieces are worn
import { EquipmentSlot, system, world } from "@minecraft/server";
import * as FallGuard from "./fallguard.js";
import * as U from "./util.js";
/** @typedef {import("@minecraft/server").Player} Player */

export const SWORD = "zt:obsidian_sword";
const DASH_CATEGORY = "zt_obsidian_dash";
const DASH_COOLDOWN = 30; // 1.5 s, matches the sword's cooldown component
const DASH_SPEED = 2.6; // horizontal launch: about 20 blocks
const DASH_LIFT = 0.4; // a little hop so the launch carries through the air
const TRAIL_TICKS = 10;
const SAFE_LANDING = 50; // fall damage this soon after a dash is undone

/** @type {Array<[EquipmentSlot, string]>} */
const ARMOR = [
  [EquipmentSlot.Head, "zt:obsidian_helmet"],
  [EquipmentSlot.Chest, "zt:obsidian_chestplate"],
  [EquipmentSlot.Legs, "zt:obsidian_leggings"],
  [EquipmentSlot.Feet, "zt:obsidian_boots"],
];

/** @type {Map<string, {readyAt: number, lastUse: number, trailUntil: number}>} */
const players = new Map();

/** @param {Player} p */
function stateOf(p) {
  let s = players.get(p.id);
  if (!s) {
    s = { readyAt: 0, lastUse: -1, trailUntil: 0 };
    players.set(p.id, s);
  }
  return s;
}

/** @param {string} id */
export function forgetPlayer(id) {
  players.delete(id);
}

/** @param {Player} p @param {EquipmentSlot} slot */
function equipped(p, slot) {
  try {
    return p.getComponent("minecraft:equippable")?.getEquipment(slot)?.typeId;
  } catch {
    return undefined;
  }
}

/** Use / tap-and-hold with the Obsidian Sword: launch forward. */
/** @param {Player} p */
export function onUse(p) {
  if (equipped(p, EquipmentSlot.Mainhand) !== SWORD) return;
  const s = stateOf(p);
  const now = system.currentTick;
  if (s.lastUse === now) return;
  s.lastUse = now;
  if (now < s.readyAt) {
    // the use and start-use events of one press can land a tick apart: only a later press hears this
    if (now - (s.readyAt - DASH_COOLDOWN) > 4) {
      U.actionbar(p, `§5Obsidian Sword §8» §7dash recharging... §f${Math.ceil((s.readyAt - now) / 20)}s`);
    }
    return;
  }
  const dir = p.getViewDirection();
  let hx = dir.x;
  let hz = dir.z;
  const flat = Math.hypot(hx, hz);
  if (flat < 0.1) {
    // looking straight up or down: dash the way the body faces
    const f = U.forward(p.getRotation().y);
    hx = f.x;
    hz = f.z;
  } else {
    hx /= flat;
    hz /= flat;
  }
  // looking up lifts the dash, looking down keeps it low
  const lift = Math.max(0.15, Math.min(0.9, DASH_LIFT + dir.y * 0.6));
  try {
    p.applyKnockback({ x: hx * DASH_SPEED, z: hz * DASH_SPEED }, lift);
  } catch {
    return;
  }
  s.readyAt = now + DASH_COOLDOWN;
  s.trailUntil = now + TRAIL_TICKS;
  FallGuard.protect(p, SAFE_LANDING);
  try {
    p.startItemCooldown(DASH_CATEGORY, DASH_COOLDOWN);
  } catch {
    /* ignore */
  }
  U.sound(p.dimension, "zt.obsidian.dash", p.location, 1.2, 1);
  U.particle(p.dimension, "zt:dash_trail", U.add(p.location, { x: 0, y: 1, z: 0 }));
}

/** @param {number} tick */
export function obsidianTick(tick) {
  for (const p of world.getAllPlayers()) {
    const s = players.get(p.id);
    if (s && tick <= s.trailUntil) U.particle(p.dimension, "zt:dash_trail", U.add(p.location, { x: 0, y: 1, z: 0 }));
    if (tick % 20 === 0 && ARMOR.every(([slot, id]) => equipped(p, slot) === id)) {
      try {
        p.addEffect("resistance", 40, { amplifier: 0, showParticles: false });
      } catch {
        /* ignore */
      }
    }
  }
}
