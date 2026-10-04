// Dark Fists: a 9 damage weapon with two abilities.
//   Crouch  -> switch between Barrage and Dark Beam
//   Use     -> unleash the selected ability (right click / hold on touch screens)
//   Barrage:   a flurry of dark punches in front of you for 7 seconds
//   Dark Beam: a giant dark beam that fires for 5 seconds
import { EquipmentSlot, system, world } from "@minecraft/server";
import { isTitan, notifyTitanBlocked } from "./titan.js";
import * as U from "./util.js";
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

export const ITEM = "zt:dark_fists";
const COOLDOWN_CATEGORY = "zt_dark_fists";
const MODES = ["Barrage", "Dark Beam"];
const MODE_KEY = "zt:df_mode";

const BARRAGE_TICKS = 140; // 7 seconds
const BARRAGE_COOLDOWN = 100; // 5 seconds after it ends
const PUNCH_DAMAGE = 9; // every punch hits as hard as the fists themselves
const PUNCHES_PER_VOLLEY = 3; // Minecraft lets a mob be hurt every 0.5 s; each volley lands 3 punches
const BARRAGE_REACH = 4.5;

const BEAM_CHARGE = 10; // half a second wind-up
const BEAM_TICKS = 100; // 5 seconds of beam
const BEAM_COOLDOWN = 160; // 8 seconds after it ends
const BEAM_DAMAGE = 20; // every 0.5 s
const BEAM_RANGE = 48;
const BEAM_RADIUS = 2.0; // it's a giant beam

/** @type {Map<string, any>} */
const players = new Map();

/** @param {Player} p */
function stateOf(p) {
  let s = players.get(p.id);
  if (!s) {
    let mode = 0;
    try {
      mode = /** @type {number} */ (p.getDynamicProperty(MODE_KEY)) ?? 0;
    } catch {
      mode = 0;
    }
    s = { mode: mode === 1 ? 1 : 0, wasSneaking: false, wasHolding: false, active: undefined, readyAt: 0, lastUse: -1 };
    players.set(p.id, s);
  }
  return s;
}

export function forgetPlayer(id) {
  players.delete(id);
}

/** @param {Player} p */
function heldItem(p) {
  try {
    return p.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand);
  } catch {
    return undefined;
  }
}

function modeName(s) {
  return MODES[s.mode];
}

export function darkFistsTick(tick) {
  for (const p of world.getAllPlayers()) {
    try {
      tickPlayer(p, tick);
    } catch (err) {
      console.warn("[Dark Fists] " + err);
    }
  }
}

/** @param {Player} p @param {number} tick */
function tickPlayer(p, tick) {
  const s = stateOf(p);
  const item = heldItem(p);
  const holding = item?.typeId === ITEM;
  const sneaking = p.isSneaking;
  // crouching switches ability (only on the moment you start crouching)
  if (holding && sneaking && !s.wasSneaking && !s.active) {
    s.mode = 1 - s.mode;
    try {
      p.setDynamicProperty(MODE_KEY, s.mode);
    } catch {
      /* ignore */
    }
    U.sound(p.dimension, "zt.df.switch", p.location, 1, s.mode === 0 ? 1.0 : 1.3);
    U.actionbar(p, `§5§lDark Fists §r§8» §d${modeName(s)}`);
  }
  s.wasSneaking = sneaking;
  if (holding && !s.wasHolding) onEquip(p, s);
  s.wasHolding = holding;

  if (s.active) {
    let alive = true;
    try {
      alive = (p.getComponent("minecraft:health")?.currentValue ?? 1) > 0;
    } catch {
      alive = false;
    }
    if (!holding || !alive) {
      endAbility(p, s);
      return;
    }
    if (s.active.type === 0) barrageTick(p, s);
    else beamTick(p, s);
    return;
  }
  if (holding && tick % 6 === 0) {
    const h = p.getHeadLocation();
    const f = p.getViewDirection();
    U.particle(p.dimension, "zt:dark_aura", { x: h.x + f.x * 0.6, y: h.y - 0.7, z: h.z + f.z * 0.6 });
  }
  if (holding && s.readyAt > 0 && tick === s.readyAt) {
    U.sound(p.dimension, "zt.df.ready", p.location, 1, 1);
    U.actionbar(p, `§5Dark Fists §8» §d${modeName(s)} §aready!`);
  }
}

/** @param {Player} p @param {any} s */
function onEquip(p, s) {
  U.actionbar(p, `§5§lDark Fists §r§8» §d${modeName(s)} §7(crouch to switch, use to unleash)`);
  // describe the abilities on the item itself, once
  try {
    const slot = p.getComponent("minecraft:equippable")?.getEquipmentSlot(EquipmentSlot.Mainhand);
    const it = slot?.getItem();
    if (slot && it && it.typeId === ITEM && it.getLore().length === 0) {
      it.setLore([
        "§59 damage per punch",
        "§dCrouch§7: switch ability",
        "§dUse§7: unleash it",
        "§5Barrage §7- 7 seconds of punches",
        "§5Dark Beam §7- 5 second giant beam",
      ]);
      slot.setItem(it);
    }
  } catch {
    /* ignore */
  }
}

/** Use / right click / long press with the fists. */
/** @param {Player} p */
export function onUse(p) {
  const item = heldItem(p);
  if (item?.typeId !== ITEM) return;
  const s = stateOf(p);
  const now = system.currentTick;
  if (s.lastUse === now) return;
  s.lastUse = now;
  if (s.active) return;
  if (now < s.readyAt) {
    const secs = Math.ceil((s.readyAt - now) / 20);
    U.actionbar(p, `§5Dark Fists §8» §7recharging... §f${secs}s`);
    return;
  }
  const total = s.mode === 0 ? BARRAGE_TICKS : BEAM_CHARGE + BEAM_TICKS;
  const cooldown = s.mode === 0 ? BARRAGE_COOLDOWN : BEAM_COOLDOWN;
  s.active = { type: s.mode, t: 0, hit: 0 };
  s.readyAt = now + total + cooldown;
  try {
    p.startItemCooldown(COOLDOWN_CATEGORY, total + cooldown);
  } catch {
    /* ignore */
  }
  const dim = p.dimension;
  if (s.mode === 0) {
    U.sound(dim, "zt.df.punch", p.location, 1.5, 0.7);
    playPlayerAnim(p, "animation.zt.player.barrage");
  } else {
    U.sound(dim, "zt.df.beam_start", p.location, 1.5, 1);
    playPlayerAnim(p, "animation.zt.player.beam");
  }
}

/** @param {Player} p @param {string} anim */
function playPlayerAnim(p, anim) {
  try {
    p.playAnimation(anim, { blendOutTime: 0.25 });
  } catch {
    /* ignore */
  }
}

/** @param {Player} p @param {any} s */
function endAbility(p, s) {
  s.active = undefined;
  try {
    p.playAnimation("animation.zt.player.reset", { blendOutTime: 0.2 });
  } catch {
    /* ignore */
  }
}

function progressBar(left, total) {
  const n = 14;
  const k = Math.max(0, Math.min(n, Math.round((left / total) * n)));
  return "§d" + "|".repeat(k) + "§8" + "|".repeat(n - k);
}

// ----------------------------------------------------------------- Barrage
/** @param {Player} p @param {any} s */
function barrageTick(p, s) {
  const a = s.active;
  a.t++;
  const dim = p.dimension;
  const head = p.getHeadLocation();
  const dir = p.getViewDirection();
  const origin = { x: head.x + dir.x * 1.3, y: head.y + dir.y * 1.3 - 0.3, z: head.z + dir.z * 1.3 };
  U.particle(dim, "zt:barrage_fists", origin, { dir });
  if (a.t % 3 === 0) U.sound(dim, "zt.df.punch", origin, 0.7, 1);
  if (a.t % 5 === 0) U.actionbar(p, `§5§lBARRAGE §r${progressBar(BARRAGE_TICKS - a.t, BARRAGE_TICKS)}`);
  if (a.t % 10 === 2) {
    for (const v of targetsInFront(p, head, dir, BARRAGE_REACH)) {
      U.hurt(v, PUNCH_DAMAGE * PUNCHES_PER_VOLLEY, p);
      if (isTitan(v.typeId)) notifyTitanBlocked(p, v);
      U.knock(v, dir.x, dir.z, 0.25, 0.05);
      U.particle(dim, "zt:spark_burst", U.centerOf(v), { color: { red: 0.8, green: 0.35, blue: 1 } });
    }
  }
  if (a.t >= BARRAGE_TICKS) endAbility(p, s);
}

/** @param {Player} p @param {Entity} v */
function canHurt(p, v) {
  if (v.id === p.id) return false;
  if (v.typeId === "minecraft:player" && !world.gameRules.pvp) return false;
  try {
    const tame = v.getComponent("minecraft:tameable");
    if (tame && tame.isTamed && tame.tamedToPlayerId === p.id) return false;
  } catch {
    /* ignore */
  }
  return true;
}

/** @param {Player} p @param {Vector3} head @param {Vector3} dir @param {number} reach */
function targetsInFront(p, head, dir, reach) {
  const center = { x: head.x + dir.x * 2.5, y: head.y + dir.y * 2.5, z: head.z + dir.z * 2.5 };
  const out = [];
  for (const v of U.livingAround(p.dimension, center, reach + 8, { exclude: [p] })) {
    if (!canHurt(p, v)) continue;
    const size = U.bodySize(v);
    // nearest point of the target's body column to the player's eyes
    const ty = Math.max(v.location.y, Math.min(v.location.y + size.h, head.y));
    const to = { x: v.location.x - head.x, y: ty - head.y, z: v.location.z - head.z };
    const along = to.x * dir.x + to.y * dir.y + to.z * dir.z;
    if (along < -0.5 || along > reach + size.r) continue;
    const perp = U.len({ x: to.x - dir.x * along, y: to.y - dir.y * along, z: to.z - dir.z * along });
    if (perp > 1.8 + size.r) continue;
    out.push(v);
  }
  return out;
}

// ----------------------------------------------------------------- Dark Beam
/** @param {Player} p @param {any} s */
function beamTick(p, s) {
  const a = s.active;
  a.t++;
  const dim = p.dimension;
  const head = p.getHeadLocation();
  const dir = p.getViewDirection();
  const origin = { x: head.x + dir.x * 0.9, y: head.y + dir.y * 0.9 - 0.25, z: head.z + dir.z * 0.9 };
  if (a.t <= BEAM_CHARGE) {
    if (a.t % 3 === 1) U.particle(dim, "zt:dark_charge", origin);
    U.actionbar(p, "§5§lDARK BEAM §r§7charging...");
    return;
  }
  const bt = a.t - BEAM_CHARGE;
  // the beam stops at the first solid block
  let length = BEAM_RANGE;
  try {
    const hit = dim.getBlockFromRay(origin, dir, { maxDistance: BEAM_RANGE, includeLiquidBlocks: false, includePassableBlocks: false });
    if (hit) {
      const b = hit.block.location;
      const fl = hit.faceLocation;
      length = Math.max(1, U.len(U.sub({ x: b.x + fl.x, y: b.y + fl.y, z: b.z + fl.z }, origin)));
    }
  } catch {
    /* ignore */
  }
  const end = U.add(origin, U.scale(dir, length));
  U.particle(dim, "zt:dark_beam", origin, { dir, len: length });
  U.particle(dim, "zt:dark_beam_core", origin, { dir, len: length });
  if (bt % 3 === 1) U.particle(dim, "zt:dark_impact", end);
  if (bt === 1 || bt % 20 === 0) U.sound(dim, "zt.df.beam_loop", origin, 1.2, 1);
  if (bt % 5 === 0) U.actionbar(p, `§5§lDARK BEAM §r${progressBar(BEAM_TICKS - bt, BEAM_TICKS)}`);
  if (bt % 10 === 1) {
    try {
      p.addEffect("slowness", 14, { amplifier: 1, showParticles: false });
    } catch {
      /* ignore */
    }
    const mid = U.add(origin, U.scale(dir, length / 2));
    for (const v of U.livingAround(dim, mid, length / 2 + 10, { exclude: [p] })) {
      if (!canHurt(p, v) || !beamTouches(origin, dir, length, v)) continue;
      U.hurt(v, BEAM_DAMAGE, p);
      if (isTitan(v.typeId)) notifyTitanBlocked(p, v);
      U.knock(v, dir.x, dir.z, 0.7, 0.15);
      if (!isTitan(v.typeId)) {
        try {
          v.addEffect("wither", 40, { amplifier: 0 });
        } catch {
          /* immune */
        }
      }
    }
  }
  if (bt >= BEAM_TICKS) endAbility(p, s);
}

/** Does the beam (a thick line) touch the target's body column? */
/** @param {Vector3} origin @param {Vector3} dir @param {number} length @param {Entity} v */
function beamTouches(origin, dir, length, v) {
  const size = U.bodySize(v);
  const l = v.location;
  const reach = BEAM_RADIUS + size.r;
  for (let d = 0; d <= length; d += 0.75) {
    const px = origin.x + dir.x * d;
    const py = origin.y + dir.y * d;
    const pz = origin.z + dir.z * d;
    const dh = Math.sqrt((px - l.x) ** 2 + (pz - l.z) ** 2);
    if (dh > reach) continue;
    const dv = Math.max(0, l.y - py, py - (l.y + size.h));
    if (Math.sqrt(dh * dh + dv * dv) <= reach) return true;
  }
  return false;
}
