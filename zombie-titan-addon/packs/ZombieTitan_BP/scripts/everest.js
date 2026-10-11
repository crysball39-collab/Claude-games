// Everest: the lance made from a Glowite Sword, a Shroomed Eye and a Spore Scroll. It hits for 15
// and has four abilities: crouch and use it to switch between them, use it to call one up.
//   Electro-Beam  the lance thrust out where you look and lightning pouring from its tip for
//                 seven seconds: 10 damage a hit to whatever it strikes;
//   Barrage       ten portals open round the mob you're looking at (or the nearest), and you go
//                 through them one after another for seven seconds, stabbing it: 15 a stab;
//   Slam          the lance driven into the ground, and a surge of blue light bursts out of the
//                 ground in a line ahead of you: 100 damage to whatever it reaches;
//   Supernova     the lance held high while a ball of blue light grows over you to fifty blocks
//                 across in ten seconds; then it bursts: a blue flash, and 1500 damage to every
//                 mob within a hundred blocks (players, pets, villagers and golems are spared).
// Each needs a rest before it can be used again.
import { EquipmentSlot, system, world } from "@minecraft/server";
import * as Doors from "./doors_common.js";
import * as U from "./util.js";

/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

export const ITEM = "zt:everest";
export const PORTAL = "zt:everest_portal";
export const NOVA = "zt:supernova";
export const ABILITIES = ["Electro-Beam", "Barrage", "Slam", "Supernova"];
const WHAT = ["lightning from its tip", "through ten portals", "a surge out of the ground", "a ball of light, then a blast"];

export const CFG = {
  beamTicks: 140, beamRange: 32, beamDamage: 10, beamEvery: 10,
  barrageTicks: 140, portals: 10, stabDamage: 15, stabEvery: 10, barrageRange: 40,
  slamDamage: 100, slamLength: 24, slamWidth: 2.2,
  novaTicks: 200, novaDamage: 1500, novaRadius: 100, novaSize: 50,
  /** the rest each needs after it ends (ticks) */
  cooldown: [160, 200, 80, 1200],
};

/** Never hurt by Everest: players and the Players, pets, villagers and golems. */
const SPARED = new Set(["minecraft:player", "zt:player", "minecraft:villager", "minecraft:villager_v2", "minecraft:wandering_trader",
  "minecraft:iron_golem", "minecraft:snow_golem", "minecraft:allay", "minecraft:armor_stand"]);
/** @param {Entity} e */
export function spared(e) {
  if (SPARED.has(e.typeId)) return true;
  try {
    return !!e.getComponent("minecraft:is_tamed");
  } catch {
    return false;
  }
}

/** Each player's lance: the ability chosen, the one running, and when each is ready again. */
const players = new Map();
/** @param {Player} p */
function stateOf(p) {
  let s = players.get(p.id);
  if (!s) {
    s = { ability: abilityOnItem(p), busy: undefined, ready: [0, 0, 0, 0], lastUse: -99, held: false };
    players.set(p.id, s);
  }
  return s;
}
/** For tests. @param {Player} p */
export function state(p) {
  return stateOf(p);
}

/** @param {Player} p */
function held(p) {
  try {
    return p.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand);
  } catch {
    return undefined;
  }
}
/** The ability written on the lance the player holds (its lore). @param {Player} p */
function abilityOnItem(p) {
  try {
    const lore = held(p)?.getLore() ?? [];
    for (const line of lore) {
      const i = ABILITIES.findIndex((a) => line.includes(a));
      if (i >= 0) return i;
    }
  } catch {
    /* ignore */
  }
  return 0;
}
/** Writes the chosen ability on the lance, so its tooltip shows it. @param {Player} p @param {number} k */
function writeAbility(p, k) {
  try {
    const eq = p.getComponent("minecraft:equippable");
    const it = eq?.getEquipment(EquipmentSlot.Mainhand);
    if (!eq || it?.typeId !== ITEM) return;
    it.setLore([`§r§bAbility: §f${ABILITIES[k]}`, "§r§7Use: unleash it", "§r§7Crouch + use: switch"]);
    eq.setEquipment(EquipmentSlot.Mainhand, it);
  } catch {
    /* ignore */
  }
}
/** @param {Player} p @param {number} k */
function announce(p, k) {
  U.actionbar(p, `§bEverest §8» §f${ABILITIES[k]} §7(${WHAT[k]})`);
}

// ---------------------------------------------------------------- using it
/**
 * Use with Everest: crouching, the next ability; standing, the chosen one is called up (if it's
 * rested and nothing else is running). @param {Player} p @returns {boolean} whether one began
 */
export function onUse(p) {
  if (held(p)?.typeId !== ITEM) return false;
  const s = stateOf(p);
  const now = system.currentTick;
  // (one press can bring both the use and the start-of-use events, a tick apart)
  if (now - s.lastUse < 4) return false;
  s.lastUse = now;
  if (p.isSneaking) {
    if (s.busy) return false;
    s.ability = (s.ability + 1) % ABILITIES.length;
    writeAbility(p, s.ability);
    announce(p, s.ability);
    U.sound(p.dimension, "random.orb", p.location, 0.6, 0.8 + s.ability * 0.2);
    return false;
  }
  if (s.busy) return false;
  const k = s.ability;
  if (now < s.ready[k]) {
    U.actionbar(p, `§bEverest §8» §7${ABILITIES[k]} recharging... §f${Math.ceil((s.ready[k] - now) / 20)}s`);
    return false;
  }
  const begun = [startBeam, startBarrage, startSlam, startNova][k](p, s);
  if (begun) U.actionbar(p, `§bEverest §8» §f${ABILITIES[k]}!`);
  return begun;
}

/** An ability is over: it rests. @param {Player} p @param {any} s */
function finish(p, s) {
  const b = s.busy;
  if (!b) return;
  s.busy = undefined;
  s.ready[b.k] = system.currentTick + CFG.cooldown[b.k];
  for (const e of [...(b.portals ?? []), b.ball]) {
    try {
      if (U.isValid(e)) {
        U.particle(e.dimension, "zt:portal_burst", e.location);
        e.remove();
      }
    } catch {
      /* ignore */
    }
  }
  if (b.home) {
    try {
      p.teleport(b.home, { rotation: b.facing });
    } catch {
      /* ignore */
    }
  }
}

/** Where the lance's tip is: out ahead of the player's eyes, to the right a little. @param {Player} p */
function tip(p) {
  const head = p.getHeadLocation();
  const dir = p.getViewDirection();
  const right = U.rightOf(p.getRotation().y);
  return { x: head.x + dir.x * 1.2 + right.x * 0.35, y: head.y - 0.25 + dir.y * 1.2, z: head.z + dir.z * 1.2 + right.z * 0.35 };
}

/** Living things Everest may hurt about a point. @param {import("@minecraft/server").Dimension} dim @param {Vector3} at @param {number} r @param {Player} p */
function prey(dim, at, r, p) {
  return U.livingAround(dim, at, r).filter((e) => e.id !== p.id && !spared(e));
}

/** @param {Entity} e @param {number} amount @param {Player} p */
function strike(e, amount, p) {
  try {
    return e.applyDamage(amount, { cause: /** @type {any} */ ("entityAttack"), damagingEntity: p });
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- Electro-Beam
/** @param {Player} p @param {any} s */
function startBeam(p, s) {
  s.busy = { k: 0, kind: "beam", t: 0, hit: new Map() };
  try {
    p.playAnimation("animation.zt.everest.aim", { blendOutTime: 0.2 });
  } catch {
    /* ignore */
  }
  U.sound(p.dimension, "item.trident.thunder", p.location, 0.7, 1.4);
  return true;
}
/** @param {Player} p @param {any} s */
function beamTick(p, s) {
  const b = s.busy;
  const dim = p.dimension;
  const from = tip(p);
  const dir = U.norm(p.getViewDirection());
  let dist = CFG.beamRange;
  try {
    const hit = dim.getBlockFromRay(from, dir, { maxDistance: CFG.beamRange, includeLiquidBlocks: false, includePassableBlocks: false });
    if (hit) dist = Math.min(dist, U.len(U.sub({ x: hit.block.x + hit.faceLocation.x, y: hit.block.y + hit.faceLocation.y, z: hit.block.z + hit.faceLocation.z }, from)));
  } catch {
    /* ignore */
  }
  const end = U.add(from, U.scale(dir, dist));
  // what the beam passes through: hurt, each a hit at a time
  const mid = U.add(from, U.scale(dir, dist / 2));
  const now = system.currentTick;
  let struck;
  for (const e of prey(dim, mid, dist / 2 + 5, p)) {
    const size = U.bodySize(e);
    const c = { x: e.location.x, y: e.location.y + Math.min(size.h, 6) / 2, z: e.location.z };
    if (U.distToSegment(c, from, end) > size.r + 0.8 + Math.min(size.h, 6) / 4) continue;
    struck = e;
    if (now - (b.hit.get(e.id) ?? -99) < CFG.beamEvery) continue;
    b.hit.set(e.id, now);
    strike(e, CFG.beamDamage, p);
    U.particle(dim, "zt:electro_hit", c);
  }
  // the lightning: a jagged line of sparks, redrawn every other tick
  if (b.t % 2 === 0) {
    const side = U.norm({ x: -dir.z, y: 0, z: dir.x });
    const n = Math.min(46, Math.ceil(dist / 0.7));
    for (let i = 0; i <= n; i++) {
      const j = i === 0 ? 0 : U.rand(-0.3, 0.3);
      const jy = i === 0 ? 0 : U.rand(-0.3, 0.3);
      U.particle(dim, "zt:electro_spark", { x: from.x + dir.x * (i * dist / n) + side.x * j, y: from.y + dir.y * (i * dist / n) + jy, z: from.z + dir.z * (i * dist / n) + side.z * j });
    }
    U.particle(dim, "zt:electro_hit", end);
  }
  if (b.t % 8 === 0) U.sound(dim, "random.fizz", from, 0.6, 1.6);
  if (b.t % 30 === 0 && struck) U.sound(dim, "ambient.weather.lightning.impact", end, 0.5, 1.4);
  if (b.t >= CFG.beamTicks) finish(p, s);
}

// ---------------------------------------------------------------- Barrage
/** The mob the player is looking at, or the nearest one. @param {Player} p */
function targetOf(p) {
  try {
    for (const h of p.getEntitiesFromViewDirection({ maxDistance: CFG.barrageRange })) {
      const e = h.entity;
      if (U.isValid(e) && !spared(e) && e.getComponent("minecraft:health")) return e;
    }
  } catch {
    /* ignore */
  }
  const near = prey(p.dimension, p.location, 16, p).sort((a, b) => U.dist2D(a.location, p.location) - U.dist2D(b.location, p.location));
  return near.find((e) => {
    try {
      return e.matches({ families: ["monster"] });
    } catch {
      return false;
    }
  }) ?? near[0];
}
/** @param {Entity} e */
function middle(e) {
  const size = U.bodySize(e);
  return { x: e.location.x, y: e.location.y + Math.min(size.h, 6) / 2, z: e.location.z };
}
/** @param {Player} p @param {any} s */
function startBarrage(p, s) {
  const target = targetOf(p);
  if (!target) {
    U.actionbar(p, "§bEverest §8» §7nothing to strike with Barrage");
    return false;
  }
  const dim = p.dimension;
  const c = middle(target);
  const r = Math.max(3.5, U.bodySize(target).r + 2.5);
  const portals = [];
  for (let i = 0; i < CFG.portals; i++) {
    const a = (i / CFG.portals) * Math.PI * 2;
    const at = { x: c.x + Math.cos(a) * r, y: c.y - 1 + (i % 2 ? 1.6 : 0), z: c.z + Math.sin(a) * r };
    try {
      const portal = dim.spawnEntity(PORTAL, at);
      portal.setRotation({ x: 0, y: U.yawTo(at, c) });
      portals.push(portal);
      U.particle(dim, "zt:portal_burst", at);
    } catch {
      /* ignore */
    }
  }
  const rot = p.getRotation();
  s.busy = { k: 1, kind: "barrage", t: 0, target, portals, home: { ...p.location }, facing: { x: rot.x, y: rot.y } };
  try {
    p.addEffect("resistance", CFG.barrageTicks + 20, { amplifier: 4, showParticles: false });
    p.addEffect("slow_falling", CFG.barrageTicks + 40, { amplifier: 0, showParticles: false });
  } catch {
    /* ignore */
  }
  U.sound(dim, "mob.endermen.portal", c, 1.5, 0.6);
  return true;
}
/** @param {Player} p @param {any} s */
function barrageTick(p, s) {
  const b = s.busy;
  const dim = p.dimension;
  const target = b.target;
  let alive = U.isValid(target);
  try {
    alive = alive && (target.getComponent("minecraft:health")?.currentValue ?? 0) > 0;
  } catch {
    alive = false;
  }
  if (!alive || b.t >= CFG.barrageTicks) {
    finish(p, s);
    return;
  }
  const c = middle(target);
  const hop = Math.floor(CFG.barrageTicks / CFG.portals);
  if (b.t % hop === 0) {
    // through the next portal, facing the mob
    const portal = b.portals[Math.floor(b.t / hop) % Math.max(1, b.portals.length)];
    if (U.isValid(portal)) {
      const at = portal.location;
      try {
        p.teleport({ x: at.x, y: at.y - 0.8, z: at.z }, { facingLocation: c });
      } catch {
        /* ignore */
      }
      U.particle(dim, "zt:portal_burst", at);
      U.sound(dim, "mob.endermen.portal", at, 0.7, 1.4);
    }
  }
  if (b.t % CFG.stabEvery === 5) {
    strike(target, CFG.stabDamage, p);
    try {
      p.playAnimation("animation.zt.everest.stab", { blendOutTime: 0.1 });
    } catch {
      /* ignore */
    }
    U.particle(dim, "zt:electro_hit", c);
    U.sound(dim, "item.trident.hit", c, 1, 1.2);
  }
}

// ---------------------------------------------------------------- Slam
/** @param {Player} p @param {any} s */
function startSlam(p, s) {
  const v = p.getViewDirection();
  let dir = { x: v.x, y: 0, z: v.z };
  if (Math.hypot(dir.x, dir.z) < 0.1) dir = U.forward(p.getRotation().y);
  s.busy = { k: 2, kind: "slam", t: 0, dir: U.norm(dir), from: { ...p.location }, hit: new Set() };
  try {
    p.playAnimation("animation.zt.everest.slam", { blendOutTime: 0.15 });
  } catch {
    /* ignore */
  }
  U.sound(p.dimension, "item.trident.riptide_1", p.location, 1, 0.8);
  return true;
}
/** When the lance hits the ground, and how many blocks a tick the surge runs. */
const SLAM_HIT = 7;
const SURGE_STEP = 2;
/** @param {Player} p @param {any} s */
function slamTick(p, s) {
  const b = s.busy;
  const dim = p.dimension;
  if (b.t === SLAM_HIT) {
    U.sound(dim, "random.explode", b.from, 1.2, 1.3);
    U.quake(dim, b.from, 24, 0.6, 0.5);
    U.particle(dim, "zt:surge", U.add(b.from, U.scale(b.dir, 1.2)));
  }
  if (b.t > SLAM_HIT) {
    // the surge runs out along the ground, bursting up as it goes
    const k = b.t - SLAM_HIT;
    const d = 1 + k * SURGE_STEP;
    if (d > CFG.slamLength) {
      finish(p, s);
      return;
    }
    const x = b.from.x + b.dir.x * d;
    const z = b.from.z + b.dir.z * d;
    const gy = U.groundY(dim, x, z, b.from.y + 4, 10) ?? b.from.y;
    const at = { x, y: gy, z };
    U.particle(dim, "zt:surge", at);
    if (k % 2 === 0) U.sound(dim, "random.explode", at, 0.5, 1.8);
    for (const e of prey(dim, { x, y: gy + 1, z }, CFG.slamWidth + 3, p)) {
      if (b.hit.has(e.id)) continue;
      const size = U.bodySize(e);
      if (U.dist2D(e.location, at) > CFG.slamWidth + size.r || e.location.y > gy + 3 || e.location.y + size.h < gy - 1) continue;
      b.hit.add(e.id);
      strike(e, CFG.slamDamage, p);
      U.knock(e, b.dir.x, b.dir.z, 0.3, 0.6);
    }
  }
}

// ---------------------------------------------------------------- Supernova
/** @param {Player} p @param {any} s */
function startNova(p, s) {
  const dim = p.dimension;
  let ball;
  try {
    ball = dim.spawnEntity(NOVA, novaAt(p, 0));
  } catch {
    return false;
  }
  s.busy = { k: 3, kind: "nova", t: 0, ball };
  try {
    p.playAnimation("animation.zt.everest.raise", { blendOutTime: 0.3 });
    p.addEffect("slowness", CFG.novaTicks + 10, { amplifier: 2, showParticles: false });
  } catch {
    /* ignore */
  }
  U.sound(dim, "beacon.activate", p.location, 2, 0.5);
  return true;
}
/** Where the ball is: over the lance held high, its bottom just above the tip. @param {Player} p @param {number} t */
function novaAt(p, t) {
  const r = (Math.min(t, CFG.novaTicks) / CFG.novaTicks) * (CFG.novaSize / 2);
  const head = p.getHeadLocation();
  return { x: head.x, y: head.y + 2.2 + r, z: head.z };
}
/** @param {Player} p @param {any} s */
function novaTick(p, s) {
  const b = s.busy;
  const dim = p.dimension;
  const at = novaAt(p, b.t);
  try {
    if (U.isValid(b.ball)) b.ball.teleport(at);
  } catch {
    /* ignore */
  }
  const r = (b.t / CFG.novaTicks) * (CFG.novaSize / 2);
  if (b.t % 4 === 0) U.particle(dim, "zt:nova_charge", at, { size: r + 4 });
  if (b.t % 20 === 0) U.sound(dim, "beacon.ambient", at, 3, 0.5 + (b.t / CFG.novaTicks) * 1.5);
  if (b.t === Math.floor(CFG.novaTicks / 2)) U.sound(dim, "conduit.activate", at, 3, 0.8);
  if (b.t < CFG.novaTicks) return;
  // it bursts
  explode(p, at);
  finish(p, s);
}
/** The Supernova's burst: a blue flash over everyone near, and 1500 damage to every mob within a
 * hundred blocks. @param {Player} p @param {Vector3} at */
export function explode(p, at) {
  const dim = p.dimension;
  U.particle(dim, "zt:nova_burst", at);
  U.sound(dim, "random.explode", at, 10, 0.5);
  U.sound(dim, "ambient.weather.thunder", at, 8, 0.8);
  U.sound(dim, "random.totem", at, 4, 0.6);
  U.quake(dim, p.location, 140, 2.5, 2.0);
  try {
    for (const q of dim.getPlayers({ location: at, maxDistance: 160 })) Doors.fade(q, 0.05, 0.35, 1.4, { red: 0.45, green: 0.8, blue: 1.0 });
  } catch {
    /* ignore */
  }
  const hit = [];
  for (const e of prey(dim, p.location, CFG.novaRadius, p)) {
    if (strike(e, CFG.novaDamage, p)) hit.push(e);
  }
  return hit;
}

// ---------------------------------------------------------------- each tick
/** @param {number} tick */
export function everestTick(tick) {
  for (const p of world.getAllPlayers()) {
    const s = players.get(p.id);
    const holding = held(p)?.typeId === ITEM;
    // picking Everest up: which ability it's set to
    if (holding && !s?.held) {
      const st = stateOf(p);
      st.ability = abilityOnItem(p);
      if (!st.busy) announce(p, st.ability);
    }
    if (s) s.held = holding;
    if (!s?.busy) continue;
    let alive = true;
    try {
      alive = (p.getComponent("minecraft:health")?.currentValue ?? 0) > 0;
    } catch {
      alive = false;
    }
    // (put away, or its holder down: it's over)
    if (!alive || (!holding && s.busy.kind !== "barrage")) {
      if (s.busy.kind === "nova") U.particle(p.dimension, "zt:portal_burst", novaAt(p, s.busy.t));
      finish(p, s);
      continue;
    }
    s.busy.t++;
    try {
      if (s.busy.kind === "beam") beamTick(p, s);
      else if (s.busy.kind === "barrage") barrageTick(p, s);
      else if (s.busy.kind === "slam") slamTick(p, s);
      else if (s.busy.kind === "nova") novaTick(p, s);
    } catch (err) {
      console.warn("[Titans] Everest: " + err);
      finish(p, s);
    }
  }
}

/** @param {string} id */
export function forgetPlayer(id) {
  const s = players.get(id);
  if (s?.busy) {
    for (const e of [...(s.busy.portals ?? []), s.busy.ball]) {
      try {
        if (U.isValid(e)) e.remove();
      } catch {
        /* ignore */
      }
    }
  }
  players.delete(id);
}
