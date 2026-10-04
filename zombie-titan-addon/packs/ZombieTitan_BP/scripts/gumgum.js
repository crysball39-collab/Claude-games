// Gum Gum Fruit: eat it and your body turns to rubber. You get five moves and
// Gear 2 as items (they can't be dropped and stay with you when you die), and
// you can never swim again: in water you sink and your powers stop working.
//   Gum Gum Pistol   stretch an arm back, punch with it, let it snap back
//   Gum Gum Bazooka  the same with both arms, much harder
//   Gum Gum Gatling  a storm of stretching punches in front of you for 7 seconds
//   Gum Gum Stamp    stretch a leg up, then slam it down: debris, a shockwave and a blast
//   Gum Gum Rocket   stretch both arms out, grab what you look at (blocks or mobs) and fling yourself to it
//   Gear 2           fist to the ground: pink steaming skin, more hearts, and Jet versions of every move
// The fruit drops from 0.001% of the leaf blocks players break.
import { EquipmentSlot, ItemLockMode, ItemStack, system, world } from "@minecraft/server";
import * as FallGuard from "./fallguard.js";
import { isTitan, onPlayerHitTitan } from "./titan.js";
import * as U from "./util.js";
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

export const FRUIT = "zt:gum_gum_fruit";
const POWER_KEY = "zt:gum_gum";
export const DROP_CHANCE = 0.00001; // 0.001% of broken leaf blocks

const MOVES = ["pistol", "bazooka", "gatling", "stamp", "rocket"];
const GEAR2 = "zt:gum_gear2";
const NORMAL_IDS = MOVES.map((m) => "zt:gum_" + m);
const JET_IDS = MOVES.map((m) => "zt:gum_jet_" + m);
export const ABILITY_IDS = [...NORMAL_IDS, GEAR2, ...JET_IDS];
const LORE = {
  pistol: "Stretch your arm back, then punch",
  bazooka: "A two-handed rubber blast",
  gatling: "7 seconds of rapid punches",
  stamp: "Stretch a leg up and slam it down",
  rocket: "Grab what you look at and fling yourself to it",
  gear2: "Pink steaming skin: Jet moves and more hearts",
};

const PUNCH_REACH = [4, 7, 10, 13, 16];
const ROCKET_REACH = [6, 10, 14, 18, 22];
const GEAR2_TICKS = 1200; // 60 seconds
const GEAR2_RECHARGE = 600; // 30 seconds after it wears off
const GEAR2_HEARTS = 20; // Health Boost V: ten extra hearts

// [normal, jet] numbers for each move: the tick it lands, how long it lasts, cooldown after, damage
const SPEC = {
  pistol: { hit: [9, 4], length: [18, 8], cooldown: [20, 10], damage: [12, 20], knock: [1.2, 1.8] },
  bazooka: { hit: [12, 4], length: [23, 10], cooldown: [60, 30], damage: [20, 32], knock: [3.5, 5.0] },
  gatling: { hit: [0, 0], length: [140, 140], cooldown: [160, 100], damage: [12, 25], reach: [6, 9] },
  stamp: { hit: [12, 5], length: [22, 11], cooldown: [80, 40], damage: [16, 26], radius: [3.5, 4.5] },
  rocket: { hit: [6, 3], length: [17, 8], cooldown: [60, 30], damage: [14, 24] },
};

/** @type {Map<string, any>} */
const players = new Map();

/** @param {Player} p */
function stateOf(p) {
  let s = players.get(p.id);
  if (!s) {
    s = { gear2Until: 0, gear2ReadyAt: 0, flagAt: 0, move: undefined, readyAt: {}, lastUse: -1, wet: false, wetTold: 0 };
    players.set(p.id, s);
  }
  return s;
}

/** @param {string} id */
export function forgetPlayer(id) {
  players.delete(id);
  FallGuard.forget(id);
}

/** @param {Player} p */
export function hasPower(p) {
  try {
    return !!p.getDynamicProperty(POWER_KEY);
  } catch {
    return false;
  }
}

/** @param {Player} p */
function inventory(p) {
  try {
    return p.getComponent("minecraft:inventory")?.container;
  } catch {
    return undefined;
  }
}

/** A move item locked into the inventory (it can't be dropped or stored) that stays on death. */
/** @param {string} id */
function abilityStack(id) {
  const item = new ItemStack(id, 1);
  try {
    item.lockMode = ItemLockMode.inventory;
    item.keepOnDeath = true;
  } catch {
    /* ignore */
  }
  const move = id.replace("zt:gum_", "").replace("jet_", "");
  try {
    item.setLore(["§7" + (LORE[move] ?? "")]);
  } catch {
    /* ignore */
  }
  return item;
}

/** @param {Player} p @returns {Set<string>} */
function carried(p) {
  const out = new Set();
  const inv = inventory(p);
  if (inv) {
    for (let i = 0; i < inv.size; i++) {
      const it = inv.getItem(i);
      if (it) out.add(it.typeId);
    }
  }
  try {
    const off = p.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Offhand);
    if (off) out.add(off.typeId);
  } catch {
    /* ignore */
  }
  return out;
}

/** Hands out any move item the player is missing (after eating, joining or respawning). */
/** @param {Player} p */
export function ensureItems(p) {
  const s = stateOf(p);
  const have = carried(p);
  const jet = s.gear2Until > system.currentTick;
  const want = [...(jet ? JET_IDS : NORMAL_IDS), GEAR2];
  const inv = inventory(p);
  for (const id of want) {
    const other = jet ? id.replace("zt:gum_jet_", "zt:gum_") : id.replace("zt:gum_", "zt:gum_jet_");
    if (have.has(id) || have.has(other)) continue;
    const left = inv ? inv.addItem(abilityStack(id)) : abilityStack(id);
    if (left) {
      try {
        p.dimension.spawnItem(left, p.location);
      } catch {
        /* ignore */
      }
    }
  }
}

// =============================================================================
// eating the fruit, and finding it
// =============================================================================
/** @param {Player} p */
export function onEat(p) {
  if (hasPower(p)) {
    // a second Devil Fruit would do you no good: give it back
    const inv = inventory(p);
    const left = inv ? inv.addItem(new ItemStack(FRUIT, 1)) : undefined;
    if (left) p.dimension.spawnItem(left, p.location);
    p.sendMessage("§dYou already ate a Gum Gum Fruit! §7Its power is still in you, so you put this one away.");
    return;
  }
  p.setDynamicProperty(POWER_KEY, true);
  ensureItems(p);
  const dim = p.dimension;
  U.sound(dim, "zt.gum.eat", p.location, 1, 1);
  U.particle(dim, "zt:gum_impact", U.add(p.location, { x: 0, y: 1, z: 0 }));
  try {
    p.onScreenDisplay.setTitle("§d§lGum Gum Fruit!", { subtitle: "§fYour body turned to rubber!", fadeInDuration: 5,
      stayDuration: 60, fadeOutDuration: 15 });
  } catch {
    /* ignore */
  }
  p.sendMessage("§dYour body is now made of rubber! §fYour Gum Gum moves are in your inventory: hold one and press " +
    "§lUse§r§f to throw it. §9But you can never swim again: in water you sink and your powers stop working.");
}

/** A player broke a block: one leaf block in 100,000 holds a Gum Gum Fruit. */
/** @param {Player} p @param {string} typeId @param {Vector3} at @param {number} [roll] */
export function onBlockBroken(p, typeId, at, roll = Math.random()) {
  if (!/leaves/.test(typeId) || roll >= DROP_CHANCE) return false;
  const dim = p.dimension;
  const c = { x: at.x + 0.5, y: at.y + 0.5, z: at.z + 0.5 };
  try {
    dim.spawnItem(new ItemStack(FRUIT, 1), c);
  } catch {
    return false;
  }
  U.particle(dim, "zt:serum_swirl", c);
  U.sound(dim, "random.orb", c, 1, 0.6);
  p.sendMessage("§d✦ A strange swirly fruit fell out of the leaves!");
  return true;
}

/** @param {Player} p */
export function onSpawn(p) {
  if (!hasPower(p)) return;
  const s = stateOf(p);
  if (s.gear2Until > 0) endGear2(p, s, false);
  else if (JET_IDS.some((id) => carried(p).has(id))) {
    // left the world (or it was reloaded) during Gear 2: it's over now
    endGear2(p, s, false);
  }
  s.move = undefined;
  ensureItems(p);
}

/** @param {Player} p */
export function onDeath(p) {
  const s = players.get(p.id);
  if (!s) return;
  s.move = undefined;
  if (s.gear2Until > 0) endGear2(p, s, false);
}

// =============================================================================
// using a move
// =============================================================================
/** @param {Player} p @param {string} itemId */
export function onUse(p, itemId) {
  if (!ABILITY_IDS.includes(itemId)) return;
  const s = stateOf(p);
  const now = system.currentTick;
  if (s.lastUse === now) return;
  s.lastUse = now;
  if (!hasPower(p)) {
    U.actionbar(p, "§7Only someone who ate the §dGum Gum Fruit§7 can use this.");
    return;
  }
  if (inWater(p)) {
    U.actionbar(p, "§9You're in water: your Devil Fruit powers don't work!");
    return;
  }
  if (itemId === GEAR2) {
    if (s.gear2Until > now) endGear2(p, s, true);
    else startGear2(p, s);
    return;
  }
  if (s.move) return;
  const jet = itemId.startsWith("zt:gum_jet_");
  const kind = itemId.replace("zt:gum_jet_", "").replace("zt:gum_", "");
  if (now < (s.readyAt[kind] ?? 0)) {
    U.actionbar(p, `§dGum Gum ${title(kind)} §8» §7recharging... §f${Math.ceil((s.readyAt[kind] - now) / 20)}s`);
    return;
  }
  startMove(p, s, kind, jet);
}

/** @param {string} kind */
function title(kind) {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

/** @param {Player} p @param {any} s @param {string} kind @param {boolean} jet */
function startMove(p, s, kind, jet) {
  const spec = SPEC[kind];
  const j = jet ? 1 : 0;
  const m = { kind, jet, t: 0, length: spec.length[j], hit: spec.hit[j], spec, done: false };
  s.move = m;
  const now = system.currentTick;
  s.readyAt[kind] = now + spec.length[j] + spec.cooldown[j];
  try {
    p.startItemCooldown("zt_gum_" + kind, spec.length[j] + spec.cooldown[j]);
  } catch {
    /* ignore */
  }
  const dim = p.dimension;
  const pre = jet ? "animation.zt.gum.jet_" : "animation.zt.gum.";
  if (kind === "pistol" || kind === "bazooka") {
    const aim = aimAt(p, 16);
    m.target = aim.entity;
    m.reach = aim.distance;
    play(p, `${pre}${kind}_${bucket(PUNCH_REACH, aim.distance)}`);
    U.sound(dim, "zt.gum.stretch", p.location, 1, jet ? 1.4 : 1.0);
  } else if (kind === "gatling") {
    play(p, pre + "gatling");
    U.sound(dim, "zt.gum.stretch", p.location, 1, 1.2);
  } else if (kind === "stamp") {
    play(p, pre + "stamp");
    U.sound(dim, "zt.gum.stretch", p.location, 1, 0.8);
  } else if (kind === "rocket") {
    const aim = aimAt(p, 22);
    m.grab = aim.hit ? aim.point : undefined;
    m.target = aim.entity;
    play(p, `${pre}rocket_${bucket(ROCKET_REACH, aim.distance)}`);
    U.sound(dim, "zt.gum.stretch", p.location, 1, jet ? 1.3 : 0.9);
    if (!m.grab) {
      // nothing within reach to grab: the arms snap back empty and it recharges at once
      U.actionbar(p, "§7Nothing in reach to grab!");
      s.readyAt[kind] = now + m.length;
      try {
        p.startItemCooldown("zt_gum_" + kind, m.length);
      } catch {
        /* ignore */
      }
    }
  }
}

/** @param {number[]} list @param {number} d */
function bucket(list, d) {
  for (const r of list) if (r >= d - 0.5) return r;
  return list[list.length - 1];
}

/** @param {Player} p @param {string} anim */
function play(p, anim) {
  try {
    p.playAnimation(anim, { blendOutTime: 0.12 });
  } catch {
    /* ignore */
  }
}

/** @param {Player} p */
function eye(p) {
  try {
    return p.getHeadLocation();
  } catch {
    return U.add(p.location, { x: 0, y: 1.6, z: 0 });
  }
}

/** @param {Player} p */
function lookDir(p) {
  try {
    return U.norm(p.getViewDirection());
  } catch {
    return U.forward(p.getRotation().y);
  }
}

/** Is `e` something the moves should hurt? @param {Player} p @param {Entity} e */
function hittable(p, e) {
  if (e.id === p.id) return false;
  if (e.typeId === "minecraft:player" && !world.gameRules.pvp) return false;
  return true;
}

/**
 * What the player is looking at within `range`: the first mob near the line of sight (a forgiving
 * aim, for touch screens), else the block in the way, else nothing.
 * @param {Player} p @param {number} range
 * @returns {{entity?: Entity, point: Vector3, distance: number, hit: boolean}}
 */
function aimAt(p, range) {
  const from = eye(p);
  const dir = lookDir(p);
  const to = U.add(from, U.scale(dir, range));
  let blockDist = range;
  let blockHit = false;
  try {
    const hit = p.getBlockFromViewDirection({ maxDistance: range });
    if (hit) {
      const b = hit.block.location;
      const at = { x: b.x + hit.faceLocation.x, y: b.y + hit.faceLocation.y, z: b.z + hit.faceLocation.z };
      blockDist = Math.min(range, U.len(U.sub(at, from)));
      blockHit = true;
    }
  } catch {
    /* ignore */
  }
  let best;
  let bestD = Infinity;
  for (const e of U.livingAround(p.dimension, U.add(from, U.scale(dir, range / 2)), range / 2 + 3)) {
    if (!hittable(p, e)) continue;
    const c = U.centerOf(e);
    const along = U.len(U.sub(c, from));
    if (along > blockDist + 1) continue;
    const off = U.distToSegment(c, from, to);
    if (off > 1.4 + U.bodySize(e).r) continue;
    if (along < bestD) {
      bestD = along;
      best = e;
    }
  }
  if (best) return { entity: best, point: U.centerOf(best), distance: Math.min(range, bestD), hit: true };
  return { point: U.add(from, U.scale(dir, blockDist)), distance: blockDist, hit: blockHit };
}

/** @param {Player} p @param {Entity} v @param {number} damage */
function strike(p, v, damage) {
  U.hurt(v, damage, p);
  if (isTitan(v.typeId)) {
    try {
      onPlayerHitTitan(p, v);
    } catch {
      /* ignore */
    }
  }
}

// =============================================================================
// the moves, tick by tick
// =============================================================================
/** @param {Player} p @param {any} s */
function moveTick(p, s) {
  const m = s.move;
  m.t++;
  const j = m.jet ? 1 : 0;
  const dim = p.dimension;
  switch (m.kind) {
    case "pistol":
    case "bazooka":
      if (m.t === m.hit) punch(p, m, j);
      break;
    case "gatling":
      gatlingTick(p, m, j);
      break;
    case "stamp":
      if (m.t === m.hit) stampDown(p, m, j);
      break;
    case "rocket":
      rocketTick(p, m, j);
      break;
    default:
      break;
  }
  if (m.jet && m.t <= m.hit + 2) U.particle(dim, "zt:gum_trail", U.add(p.location, { x: 0, y: 1, z: 0 }));
  if (m.t >= m.length) s.move = undefined;
}

/** Pistol and Bazooka: the stretched fist(s) land on what the player aimed at. */
/** @param {Player} p @param {any} m @param {number} j */
function punch(p, m, j) {
  const dim = p.dimension;
  const from = eye(p);
  const dir = lookDir(p);
  let fist = U.add(from, U.scale(dir, m.reach));
  const victims = [];
  if (U.isValid(m.target) && U.len(U.sub(U.centerOf(m.target), from)) <= m.reach + 3) {
    fist = U.centerOf(m.target);
    victims.push(m.target);
  }
  const radius = m.kind === "bazooka" ? 2.2 : 1.4;
  for (const e of U.livingAround(dim, fist, radius)) {
    if (hittable(p, e) && !victims.includes(e)) victims.push(e);
  }
  for (const v of victims) {
    strike(p, v, m.spec.damage[j]);
    const away = U.sub(v.location, p.location);
    U.knock(v, away.x, away.z, m.spec.knock[j], m.kind === "bazooka" ? 0.7 : 0.35);
  }
  U.particle(dim, "zt:gum_impact", fist);
  if (m.kind === "bazooka") U.particle(dim, "minecraft:huge_explosion_emitter", fist);
  U.sound(dim, "zt.gum.punch", fist, m.kind === "bazooka" ? 2 : 1.2, m.jet ? 1.2 : 0.9);
  U.sound(dim, "zt.gum.snap", p.location, 0.8, 1.2);
}

/** Gatling: every half second, the punches land on everything in front (a mob can only be hurt that often). */
/** @param {Player} p @param {any} m @param {number} j */
function gatlingTick(p, m, j) {
  const dim = p.dimension;
  const from = eye(p);
  const dir = lookDir(p);
  if (m.t % 2 === 0) U.particle(dim, "zt:gum_fists", U.add(from, U.scale(dir, 1.2)), { dir });
  if (m.t % (m.jet ? 2 : 3) === 0) U.sound(dim, "zt.gum.gatling", U.add(from, U.scale(dir, 2)), 0.8, U.rand(0.9, 1.2));
  if (m.t % 10 !== 5) return;
  const reach = m.spec.reach[j];
  const to = U.add(from, U.scale(dir, reach));
  for (const e of U.livingAround(dim, U.add(from, U.scale(dir, reach / 2)), reach / 2 + 2.5)) {
    if (!hittable(p, e)) continue;
    const c = U.centerOf(e);
    if (U.distToSegment(c, from, to) > 2.2 + U.bodySize(e).r) continue;
    strike(p, e, m.spec.damage[j]);
    U.knock(e, dir.x, dir.z, 0.35, 0.12);
    U.particle(dim, "zt:gum_impact", c);
  }
}

/** Stamp: the stretched leg comes down three blocks ahead: debris, a shockwave, a blast. */
/** @param {Player} p @param {any} m @param {number} j */
function stampDown(p, m, j) {
  const dim = p.dimension;
  const loc = p.location;
  const f = U.forward(p.getRotation().y);
  const at = { x: loc.x + f.x * 3, y: loc.y, z: loc.z + f.z * 3 };
  const gy = U.groundY(dim, at.x, at.z, loc.y + 2, 6);
  if (gy !== undefined) at.y = gy;
  const radius = m.spec.radius[j];
  for (const v of U.livingAround(dim, at, radius * 2)) {
    if (!hittable(p, v)) continue;
    const d = U.len(U.sub(v.location, at));
    if (d > radius * 2) continue;
    strike(p, v, d <= radius ? m.spec.damage[j] : m.spec.damage[j] / 2);
    const away = U.sub(v.location, at);
    U.knock(v, away.x, away.z, d <= radius ? 1.6 : 0.9, 0.9);
  }
  U.particle(dim, "zt:gum_debris", at, { radius });
  U.particle(dim, "zt:shockwave", at, { radius: radius * 2 });
  U.particle(dim, "zt:shockwave_dust", at, { radius });
  U.particle(dim, "minecraft:huge_explosion_emitter", U.add(at, { x: 0, y: 0.5, z: 0 }));
  U.sound(dim, "zt.gum.stamp", at, 2, m.jet ? 1.15 : 0.9);
  U.sound(dim, "random.explode", at, 1.5, 1.1);
  U.quake(dim, at, 16, 0.9, 0.4);
}

/** Rocket: once the arms have hold of something, the player is flung to it; a grabbed mob gets hit on arrival. */
/** @param {Player} p @param {any} m @param {number} j */
function rocketTick(p, m, j) {
  if (!m.grab) return;
  const dim = p.dimension;
  if (m.t === m.hit) {
    const from = eye(p);
    const goal = U.isValid(m.target) ? U.centerOf(m.target) : m.grab;
    const to = U.sub(goal, from);
    const d = U.len(to);
    const flat = Math.hypot(to.x, to.z) || 1;
    const speed = Math.min(4.2, (0.11 * d + 0.7) * (m.jet ? 1.25 : 1));
    const lift = Math.max(0.2, Math.min(1.6, 0.25 + (to.y / (d || 1)) * 1.2 + d * 0.012));
    try {
      p.applyKnockback({ x: (to.x / flat) * speed, z: (to.z / flat) * speed }, lift);
    } catch {
      /* ignore */
    }
    FallGuard.protect(p, 80);
    m.flying = true;
    U.sound(dim, "zt.gum.rocket", p.location, 1.2, m.jet ? 1.3 : 1.0);
  }
  if (!m.flying) return;
  U.particle(dim, "zt:gum_trail", U.add(p.location, { x: 0, y: 1, z: 0 }));
  if (U.isValid(m.target) && !m.landed) {
    const c = U.centerOf(m.target);
    if (U.len(U.sub(c, U.add(p.location, { x: 0, y: 1, z: 0 }))) <= 2.6 + U.bodySize(m.target).r) {
      m.landed = true;
      strike(p, m.target, m.spec.damage[j]);
      const dir = lookDir(p);
      U.knock(m.target, dir.x, dir.z, 2.0, 0.6);
      U.particle(dim, "zt:gum_impact", c);
      U.sound(dim, "zt.gum.punch", c, 1.5, 0.8);
    }
  }
}

// =============================================================================
// Gear 2
// =============================================================================
/** @param {Player} p @param {any} s */
function startGear2(p, s) {
  const now = system.currentTick;
  if (now < s.gear2ReadyAt) {
    U.actionbar(p, `§dGear 2 §8» §7your body needs a rest... §f${Math.ceil((s.gear2ReadyAt - now) / 20)}s`);
    return;
  }
  if (s.move) return;
  s.move = { kind: "gear2", t: 0, length: 28, hit: 16, jet: false, spec: {} };
  s.gear2Until = now + GEAR2_TICKS + 16;
  s.flagAt = now + 40;
  play(p, "animation.zt.gum.gear2");
  U.sound(p.dimension, "zt.gum.stretch", p.location, 1, 0.6);
}

/** The fist hits the ground: the blood starts pumping. @param {Player} p @param {any} s */
function gear2Kicks(p, s) {
  const dim = p.dimension;
  try {
    p.addEffect("health_boost", GEAR2_TICKS, { amplifier: GEAR2_HEARTS / 4 - 1, showParticles: false });
    p.addEffect("speed", GEAR2_TICKS, { amplifier: 0, showParticles: false });
  } catch {
    /* ignore */
  }
  system.run(() => {
    // the new hearts come filled
    try {
      const hp = p.getComponent("minecraft:health");
      if (hp) hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + GEAR2_HEARTS));
    } catch {
      /* ignore */
    }
  });
  swapItems(p, true);
  for (let i = 0; i < 3; i++) U.particle(dim, "zt:gum_steam", p.location);
  U.particle(dim, "zt:shockwave_dust", p.location, { radius: 3 });
  U.sound(dim, "zt.gum.gear2", p.location, 1.5, 1);
  try {
    p.onScreenDisplay.setTitle("§d§lGear 2", { subtitle: "§fJet moves for 60 seconds", fadeInDuration: 4, stayDuration: 30,
      fadeOutDuration: 10 });
  } catch {
    /* ignore */
  }
}

/** @param {Player} p @param {any} s @param {boolean} recharge */
function endGear2(p, s, recharge) {
  s.gear2Until = 0;
  if (recharge) s.gear2ReadyAt = system.currentTick + GEAR2_RECHARGE;
  try {
    p.removeEffect("health_boost");
    p.removeEffect("speed");
  } catch {
    /* ignore */
  }
  swapItems(p, false);
  play(p, "animation.zt.gum.gear2_off");
  try {
    if (recharge) p.startItemCooldown("zt_gum_gear2", GEAR2_RECHARGE);
  } catch {
    /* ignore */
  }
  U.actionbar(p, "§7Gear 2 wears off.");
}

/** Gear 2 swaps every move in the inventory for its Jet version, and back. */
/** @param {Player} p @param {boolean} toJet */
function swapItems(p, toJet) {
  const inv = inventory(p);
  if (!inv) return;
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (!it) continue;
    const k = (toJet ? NORMAL_IDS : JET_IDS).indexOf(it.typeId);
    if (k < 0) continue;
    inv.setItem(i, abilityStack((toJet ? JET_IDS : NORMAL_IDS)[k]));
  }
  try {
    const eq = p.getComponent("minecraft:equippable");
    const off = eq?.getEquipment(EquipmentSlot.Offhand);
    const k = off ? (toJet ? NORMAL_IDS : JET_IDS).indexOf(off.typeId) : -1;
    if (k >= 0) eq.setEquipment(EquipmentSlot.Offhand, abilityStack((toJet ? JET_IDS : NORMAL_IDS)[k]));
  } catch {
    /* ignore */
  }
}

// =============================================================================
// every tick: moves, Gear 2's steam, and sinking like a stone in water
// =============================================================================
/** @param {Player} p */
function inWater(p) {
  try {
    return p.isInWater || p.isSwimming;
  } catch {
    return false;
  }
}

/** @param {number} tick */
export function gumTick(tick) {
  for (const p of world.getAllPlayers()) {
    const s = players.get(p.id);
    let power;
    if (tick % 4 === 0 || s) power = hasPower(p);
    if (!power) continue;
    const st = stateOf(p);
    try {
      playerTick(p, st, tick);
    } catch (err) {
      console.warn("[Titans] gum gum: " + err);
    }
  }
}

/** @param {Player} p @param {any} s @param {number} tick */
function playerTick(p, s, tick) {
  if (s.move) {
    if (s.move.kind === "gear2") {
      s.move.t++;
      if (s.move.t === s.move.hit) gear2Kicks(p, s);
      if (s.move.t >= s.move.length) s.move = undefined;
    } else {
      moveTick(p, s);
    }
  }
  if (s.gear2Until > 0) {
    if (tick >= s.gear2Until) endGear2(p, s, true);
    else {
      if (tick % 4 === 0) U.particle(p.dimension, "zt:gum_steam", p.location);
      if (tick % 40 === 0) U.sound(p.dimension, "zt.gum.steam", p.location, 0.5, 1);
      // keep the pink skin showing for everyone, also players who just arrived (never mid-move)
      if (tick >= s.flagAt && !s.move) {
        s.flagAt = tick + 40;
        play(p, "animation.zt.gum.gear2_on");
      }
    }
  }
  if (tick % 2 === 0) waterTick(p, s, tick);
}

/** A Devil Fruit user can't swim: the water pulls them down and saps their strength. */
/** @param {Player} p @param {any} s @param {number} tick */
function waterTick(p, s, tick) {
  if (!inWater(p)) {
    s.wet = false;
    return;
  }
  try {
    p.applyKnockback({ x: 0, z: 0 }, -0.3);
  } catch {
    /* ignore */
  }
  if (tick % 10 === 0) {
    try {
      p.addEffect("slowness", 30, { amplifier: 1, showParticles: false });
      p.addEffect("weakness", 30, { amplifier: 1, showParticles: false });
    } catch {
      /* ignore */
    }
  }
  if (s.move && s.move.kind === "gatling") s.move = undefined;
  if (!s.wet) {
    s.wet = true;
    U.sound(p.dimension, "zt.gum.sink", p.location, 1, 0.8);
    if (tick >= s.wetTold) {
      s.wetTold = tick + 600;
      U.actionbar(p, "§9You sink like a stone! §7Gum Gum Fruit users can't swim.");
    }
  }
}
