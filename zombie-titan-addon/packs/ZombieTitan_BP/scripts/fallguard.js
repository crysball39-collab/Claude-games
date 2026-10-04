// Shared "no fall damage" windows: after a dash or a Gum Gum Rocket the
// landing doesn't hurt. Fall damage inside a window is healed straight back.
import { system } from "@minecraft/server";
/** @typedef {import("@minecraft/server").Player} Player */

/** player id -> last tick of protection @type {Map<string, number>} */
const until = new Map();

/** @param {Player} p @param {number} ticks */
export function protect(p, ticks) {
  until.set(p.id, Math.max(until.get(p.id) ?? 0, system.currentTick + ticks));
}

/** @param {Player} p @param {number} damage */
export function onFall(p, damage) {
  const end = until.get(p.id);
  if (end === undefined || system.currentTick > end) return;
  try {
    const hp = p.getComponent("minecraft:health");
    if (hp && hp.currentValue > 0) hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + damage));
  } catch {
    /* ignore */
  }
}

/** @param {string} id */
export function forget(id) {
  until.delete(id);
}
