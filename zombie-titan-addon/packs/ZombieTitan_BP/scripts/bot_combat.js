// How a Player fights, as a Bedrock player does: it closes in and hits as fast as a blow can
// land (Bedrock has no attack cooldown, but a mob can only be hurt twice a second), jumps for
// critical hits, raises its shield against arrows and blasts, hits a creeper and backs off,
// shoots its bow at what it can't reach (and leads a moving target), and runs when a fight
// goes badly.
import { system } from "@minecraft/server";
import * as B from "./bot_body.js";
import * as D from "./bot_data.js";
import * as Inv from "./bot_inv.js";
import * as S from "./bot_skills.js";
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

/** A player's reach for hitting, in blocks. */
export const REACH = 3;
/** Mobs that fight from a distance (a shield is worth raising). */
export const RANGED = new Set(["minecraft:skeleton", "minecraft:stray", "minecraft:bogged", "minecraft:pillager", "minecraft:blaze",
  "minecraft:ghast", "minecraft:witch", "minecraft:breeze", "minecraft:shulker", "zt:skeleton_minion"]);
/** Mobs a sword can't reach: bow work. */
export const FLYING = new Set(["minecraft:ghast", "minecraft:phantom", "minecraft:ender_dragon", "minecraft:ender_crystal"]);
const UNDEAD = /zombie|husk|drowned|skeleton|stray|wither|phantom|zoglin|bogged|zombified/;
const ARTHROPOD = /spider|silverfish|endermite|bee$/;
/** half width, height */
const SIZE = {
  "minecraft:spider": [0.7, 0.9], "minecraft:cave_spider": [0.35, 0.5], "minecraft:enderman": [0.3, 2.9], "minecraft:ghast": [2, 4],
  "minecraft:ender_dragon": [4, 4], "minecraft:slime": [1, 2], "minecraft:magma_cube": [1, 2], "minecraft:chicken": [0.2, 0.7],
  "minecraft:pig": [0.45, 0.9], "minecraft:cow": [0.45, 1.3], "minecraft:sheep": [0.45, 1.3], "minecraft:ender_crystal": [1, 2],
  "minecraft:hoglin": [0.7, 1.4], "minecraft:silverfish": [0.2, 0.3], "minecraft:endermite": [0.2, 0.3], "minecraft:wolf": [0.3, 0.8],
  "minecraft:rabbit": [0.2, 0.5], "minecraft:creeper": [0.3, 1.7], "minecraft:iron_golem": [0.7, 2.9], "minecraft:ravager": [1, 2.2],
};
/** Experience a player gets for a kill. */
export function killXp(typeId) {
  if (/ender_dragon/.test(typeId)) return 500;
  if (/blaze|elder_guardian|guardian|evoker/.test(typeId)) return 10;
  if (/cow|pig|sheep|chicken|rabbit|mooshroom|horse|llama|goat|frog|turtle/.test(typeId)) return 1 + Math.floor(Math.random() * 3);
  if (/villager|iron_golem|snow_golem|bat|squid|fish|cod|salmon/.test(typeId)) return 0;
  return 5;
}

/** @param {Entity} t */
export function alive(t) {
  try {
    if (!t?.isValid) return false;
    const h = t.getComponent("minecraft:health");
    return !h || h.currentValue > 0;
  } catch {
    return false;
  }
}
/** The point of a mob's body nearest to a spot. @param {Entity} t @param {Vector3} from */
export function nearestPoint(t, from) {
  const [w, h] = SIZE[t.typeId] ?? [0.3, 1.8];
  const l = t.location;
  return {
    x: Math.max(l.x - w, Math.min(l.x + w, from.x)),
    y: Math.max(l.y, Math.min(l.y + h, from.y)),
    z: Math.max(l.z - w, Math.min(l.z + w, from.z)),
  };
}
/** Can it hit t from where it stands? @param {any} bot @param {Entity} t */
export function inReach(bot, t) {
  const e = B.eye(bot);
  return B.dist(e, nearestPoint(t, e)) <= REACH;
}
/** @param {Entity} t */
function centre(t) {
  const [, h] = SIZE[t.typeId] ?? [0.3, 1.8];
  return { x: t.location.x, y: t.location.y + h * 0.6, z: t.location.z };
}

/** Its strength and weakness effects. @param {any} bot */
function effectBonus(bot) {
  let b = 0;
  try {
    const s = bot.entity.getEffect("strength");
    if (s) b += 3 * (s.amplifier + 1);
    const w = bot.entity.getEffect("weakness");
    if (w) b -= 4;
  } catch {
    /* ignore */
  }
  return b;
}

/**
 * One blow, if one can land now: the damage of what it holds (sharpness, smite, bane, crits,
 * strength), knockback, fire aspect, and the weapon wears. True if it hurt.
 * @param {any} bot @param {Entity} t @param {number} now
 */
export function hit(bot, t, now) {
  if (now - (bot.lastHit ?? -99) < (bot.hitGap ?? 10)) return false;
  if (!inReach(bot, t)) return false;
  bot.lastHit = now;
  bot.hitGap = 8 + Math.floor(Math.random() * 4);
  if (bot.use === 3) B.setUse(bot, 0);
  B.lookAt(bot, centre(t), 8, 5);
  B.swing(bot);
  const held = Inv.held(bot);
  const info = D.toolInfo(held?.typeId);
  let dmg = info.damage + Inv.enchantLevel(held, "sharpness") * 1.25 + effectBonus(bot);
  if (UNDEAD.test(t.typeId)) dmg += Inv.enchantLevel(held, "smite") * 2.5;
  if (ARTHROPOD.test(t.typeId)) dmg += Inv.enchantLevel(held, "bane_of_arthropods") * 2.5;
  let vy = 0;
  try {
    vy = bot.entity.getVelocity().y;
  } catch {
    vy = 0;
  }
  const crit = !bot.onGround && !bot.inWater && vy < -0.05;
  if (crit) dmg *= 1.5;
  dmg = Math.max(0.5, dmg);
  let ok = false;
  try {
    ok = t.applyDamage(dmg, { cause: /** @type {any} */ ("entityAttack"), damagingEntity: bot.entity });
  } catch {
    ok = false;
  }
  const dim = bot.entity.dimension;
  try {
    dim.playSound(ok ? "game.player.attack.strong" : "game.player.attack.nodamage", t.location, { volume: 0.7, pitch: 0.9 + Math.random() * 0.2 });
  } catch {
    /* ignore */
  }
  if (!ok) return false;
  const l = bot.entity.location;
  const dx = t.location.x - l.x;
  const dz = t.location.z - l.z;
  const d = Math.hypot(dx, dz) || 1;
  const kb = 0.4 + Inv.enchantLevel(held, "knockback") * 0.5 + (bot.move?.speed === "sprint" ? 0.3 : 0);
  try {
    if (t.typeId !== "minecraft:ender_dragon" && t.typeId !== "minecraft:ender_crystal") t.applyKnockback({ x: (dx / d) * kb, z: (dz / d) * kb }, 0.32);
  } catch {
    /* some things can't be pushed */
  }
  const fire = Inv.enchantLevel(held, "fire_aspect");
  if (fire) {
    try {
      t.setOnFire(4 * fire, true);
    } catch {
      /* ignore */
    }
  }
  if (crit) {
    try {
      dim.spawnParticle("minecraft:critical_hit_emitter", centre(t));
    } catch {
      /* ignore */
    }
  }
  bot.exhaust += 0.1;
  if (held && info.type !== "hand") {
    const w = Inv.wearHeld(bot, info.type === "sword" ? 1 : 2);
    if (w === "broke") S.onToolBroke(bot, held.typeId);
  }
  return true;
}

// ---------------------------------------------------------------- the bow
/**
 * Where to point to hit `to` with an arrow at `speed` blocks a tick: the pitch (degrees, up is
 * negative as for heads) that drops the arrow onto it, allowing for gravity and drag.
 * @param {Vector3} from @param {Vector3} to @param {number} speed
 */
export function aim(from, to, speed = 3) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dh = Math.hypot(dx, dz);
  const dy = to.y - from.y;
  const heightAt = (pitch) => {
    let vx = Math.cos(pitch) * speed;
    let vy = Math.sin(pitch) * speed;
    let x = 0;
    let y = 0;
    for (let t = 0; t < 200; t++) {
      x += vx;
      y += vy;
      if (x >= dh) return { y, t };
      vx *= 0.99;
      vy = vy * 0.99 - 0.05;
      if (vx < 0.05) break;
    }
    return { y: -1e9, t: 200 };
  };
  let lo = -Math.PI / 3;
  let hi = Math.PI / 3;
  for (let k = 0; k < 24; k++) {
    const m = (lo + hi) / 2;
    if (heightAt(m).y < dy) lo = m;
    else hi = m;
  }
  const pitch = (lo + hi) / 2;
  const r = heightAt(pitch);
  return { pitch, ticks: r.t, ok: r.y > -1e8 && Math.abs(r.y - dy) < 1.5 };
}

/** Things shot or thrown that a shield stops. */
const MISSILES = new Set(["minecraft:small_fireball", "minecraft:fireball", "minecraft:arrow", "minecraft:shulker_bullet", "minecraft:wither_skull",
  "minecraft:wither_skull_dangerous"]);
/**
 * Something shot or thrown coming straight at it and about to arrive (a blaze's fireball, an
 * arrow): what a player sees coming and raises a shield against.
 * @param {any} bot
 */
export function incoming(bot) {
  const e = bot.entity;
  const eye = B.eye(bot);
  const mid = { x: eye.x, y: eye.y - 0.6, z: eye.z };
  let list;
  try {
    list = e.dimension.getEntities({ location: mid, maxDistance: 24 });
  } catch {
    return undefined;
  }
  for (const p of list) {
    if (!MISSILES.has(p.typeId)) continue;
    let v;
    try {
      if (p.getComponent("minecraft:projectile")?.owner?.id === e.id) continue;
      v = p.getVelocity();
    } catch {
      continue;
    }
    const sp2 = v.x * v.x + v.y * v.y + v.z * v.z;
    // (an arrow stuck in something isn't coming)
    if (sp2 < 0.01) continue;
    const r = { x: mid.x - p.location.x, y: mid.y - p.location.y, z: mid.z - p.location.z };
    // ticks until it passes nearest, and how near
    const t = (r.x * v.x + r.y * v.y + r.z * v.z) / sp2;
    if (t <= 0 || t > 30) continue;
    if (Math.hypot(r.x - v.x * t, r.y - v.y * t, r.z - v.z * t) < 1.6) return p;
  }
  return undefined;
}

/** Has it a bow and arrows? @param {any} bot */
export function canShoot(bot) {
  return Inv.has(bot, "minecraft:bow") && Inv.has(bot, "minecraft:arrow");
}

/**
 * Draw the bow, aim (leading a moving target) and loose an arrow. True if it shot. Wary, it
 * lets the draw go when it sees something coming at it (to get its shield up).
 * @param {any} bot @param {Entity} t @param {{draw?: number, wary?: boolean}} [o]
 */
export function* shoot(bot, t, o = {}) {
  if (!canShoot(bot) || !Inv.hold(bot, "minecraft:bow")) return false;
  B.stop(bot);
  B.setUse(bot, 2);
  const draw = o.draw ?? 20;
  for (let i = 0; i < draw; i++) {
    if (!alive(t) || (o.wary && incoming(bot))) {
      B.setUse(bot, 0);
      return false;
    }
    B.lookAt(bot, centre(t), 6, 6);
    yield;
  }
  B.setUse(bot, 0);
  const e = bot.entity;
  const eye = B.eye(bot);
  let target = centre(t);
  let v = { x: 0, y: 0, z: 0 };
  try {
    v = t.getVelocity();
  } catch {
    /* ignore */
  }
  let a = aim(eye, target, 3);
  // lead it: where it will be when the arrow gets there
  for (let k = 0; k < 2; k++) {
    target = { x: centre(t).x + v.x * a.ticks, y: centre(t).y + (FLYING.has(t.typeId) ? v.y * a.ticks : 0), z: centre(t).z + v.z * a.ticks };
    a = aim(eye, target, 3);
  }
  const yaw = Math.atan2(-(target.x - eye.x), target.z - eye.z);
  const dir = { x: -Math.sin(yaw) * Math.cos(a.pitch), y: Math.sin(a.pitch), z: Math.cos(yaw) * Math.cos(a.pitch) };
  const dim = e.dimension;
  try {
    const arrow = dim.spawnEntity("minecraft:arrow", { x: eye.x + dir.x * 0.8, y: eye.y - 0.1 + dir.y * 0.8, z: eye.z + dir.z * 0.8 });
    const p = arrow.getComponent("minecraft:projectile");
    if (p) {
      p.owner = e;
      p.shoot({ x: dir.x * 3, y: dir.y * 3, z: dir.z * 3 }, { uncertainty: 0.6 });
    }
    dim.playSound("random.bow", eye, { volume: 0.8, pitch: 0.9 + Math.random() * 0.3 });
  } catch {
    return false;
  }
  B.swing(bot);
  if (!Inv.enchantLevel(Inv.held(bot), "infinity")) Inv.take(bot, "minecraft:arrow", 1);
  if (Inv.wearHeld(bot, 1) === "broke") S.onToolBroke(bot, "minecraft:bow");
  return true;
}

// ---------------------------------------------------------------- a fight
/** Hold its best weapon and get its shield on. @param {any} bot */
export function armUp(bot) {
  const w = Inv.bestWeapon(bot);
  if (w) Inv.holdId(bot, w);
  Inv.equipArmor(bot);
}
/** @param {any} bot */
function hasShield(bot) {
  return Inv.getEquip(bot, "Offhand")?.typeId === "minecraft:shield";
}

/**
 * Fight one mob until it dies, gets away, or the fight goes badly.
 * Returns "killed", "gone", "lost" (out of reach), "flee" (it should run) or "timeout".
 * @param {any} bot @param {Entity} t @param {{ticks?: number, fleeHp?: number, giveUp?: number, bow?: boolean}} [o]
 */
export function* fight(bot, t, o = {}) {
  const limit = o.ticks ?? 900;
  const fleeHp = o.fleeHp ?? (bot.persona.brave > 0.7 ? 4 : 7);
  const id = t.id;
  armUp(bot);
  bot.busyLook = true;
  let near = 0;
  let backOff = 0;
  let stuck = 0;
  let lastD = Infinity;
  try {
    for (let i = 0; i < limit; i++) {
      const now = system.currentTick;
      if (!alive(t)) return bot.lastKill === id ? "killed" : t.isValid ? "killed" : "gone";
      if (B.health(bot) <= fleeHp && !o.fleeHp) return "flee";
      bot.lastTargetPos = { ...t.location };
      const l = bot.entity.location;
      const c = centre(t);
      const d = B.dist(B.eye(bot), nearestPoint(t, B.eye(bot)));
      if (d > (o.giveUp ?? 24) || t.dimension.id !== bot.entity.dimension.id) return "lost";
      B.lookAt(bot, c, 6, 5);
      const creeper = t.typeId === "minecraft:creeper";
      near = d < 3.2 ? near + 1 : Math.max(0, near - 2);
      // a creeper that's been close a while is about to go: get away, shield up if it can't
      if (creeper && (near > 14 || backOff > 0)) {
        if (backOff === 0) backOff = 26;
        backOff--;
        const away = { x: l.x + (l.x - c.x) * 3, y: l.y, z: l.z + (l.z - c.z) * 3 };
        B.moveTo(bot, away, { speed: "sprint", noFall: true });
        if (d < 2.5 && hasShield(bot)) B.setUse(bot, 3);
        if (backOff === 0) {
          near = 0;
          B.setUse(bot, 0);
        }
        yield;
        continue;
      }
      // out of a sword's reach: a bow if it's up in the air (or across a gap, or it shoots back),
      // else close in
      const above = c.y - l.y > 3.5;
      const shooter = (t.typeId === "minecraft:blaze" || t.typeId === "minecraft:ghast") && canShoot(bot);
      // a blaze or a ghast: its shield up to what it throws (a blaze's come in threes), and the
      // bow in the seconds between
      if (shooter && d > REACH - 0.3) {
        const shield = hasShield(bot);
        const thrown = now - Math.max(bot.blockedAt ?? -1e9, bot.shotAt ?? -1e9);
        if (shield && (thrown < 14 || incoming(bot))) {
          if (bot.use !== 3) B.setUse(bot, 3);
          B.stop(bot);
          yield;
          continue;
        }
        const shot = yield* shoot(bot, t, { draw: 16, wary: shield });
        armUp(bot);
        if (!shot) {
          if (shield) B.setUse(bot, 3);
          yield;
        }
        continue;
      }
      if ((FLYING.has(t.typeId) || above || o.bow) && canShoot(bot) && d > 4) {
        yield* shoot(bot, t);
        armUp(bot);
        // between shots, its shield up against what the thing throws back
        if (RANGED.has(t.typeId) && hasShield(bot)) B.setUse(bot, 3);
        yield* S.wait(8 + Math.floor(Math.random() * 10));
        if (bot.use === 3) B.setUse(bot, 0);
        continue;
      }
      if (d > REACH - 0.3) {
        // shield up against arrows while it walks in
        if (RANGED.has(t.typeId) && hasShield(bot) && d > 5) {
          B.setUse(bot, 3);
          bot.slow = true;
        } else if (bot.use === 3) {
          B.setUse(bot, 0);
          bot.slow = false;
        }
        if (d > 7 || stuck > 20) {
          // a proper way round whatever's between
          bot.slow = false;
          const r = yield* S.plan(bot, { ...B.blockPos(t.location), r: 1.5 }, { maxNodes: 700 });
          if (r.path.length) yield* S.follow(bot, r.path.slice(0, 4), { speed: "sprint" });
          else if (++stuck > 60) return "lost";
          if (r.path.length) stuck = 0;
        } else {
          B.moveTo(bot, c, { speed: bot.slow ? "walk" : "sprint", tol: 1.6 });
          if (d >= lastD - 0.01) stuck++;
          else stuck = Math.max(0, stuck - 1);
          if (c.y > l.y + 0.8 && bot.onGround) B.jump(bot);
        }
        lastD = d;
        yield;
        continue;
      }
      bot.slow = false;
      if (bot.use === 3) B.setUse(bot, 0);
      // in reach: a jump for a critical hit now and then, or a step to the side
      if (bot.onGround && Math.random() < 0.3 && !creeper && now - (bot.lastHit ?? 0) > 4) B.jump(bot);
      const falling = !bot.onGround && !bot.inWater;
      let vy = 0;
      try {
        vy = bot.entity.getVelocity().y;
      } catch {
        vy = 0;
      }
      if (!falling || vy < -0.05) {
        const landed = hit(bot, t, now);
        if (landed && creeper) backOff = 18;
      }
      if (Math.random() < 0.15) {
        const side = Math.random() < 0.5 ? 1 : -1;
        B.moveTo(bot, { x: l.x + (c.z - l.z) * 0.4 * side, y: l.y, z: l.z - (c.x - l.x) * 0.4 * side }, { speed: "walk", noFall: true });
      } else if (d < 1.2) {
        B.moveTo(bot, { x: l.x + (l.x - c.x), y: l.y, z: l.z + (l.z - c.z) }, { noFall: true });
      } else B.stop(bot);
      yield;
    }
    return "timeout";
  } finally {
    bot.busyLook = false;
    bot.slow = false;
    if (bot.use === 3 || bot.use === 2) B.setUse(bot, 0);
    B.stop(bot);
  }
}

/**
 * Run from danger: sprint away from what threatens it, around whatever is in the way.
 * @param {any} bot @param {Vector3[]} from @param {number} [far]
 */
export function* flee(bot, from, far = 20) {
  if (!from.length) return true;
  const l = bot.entity.location;
  const c = { x: 0, z: 0 };
  for (const p of from) {
    c.x += p.x / from.length;
    c.z += p.z / from.length;
  }
  let dx = l.x - c.x;
  let dz = l.z - c.z;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d;
  dz /= d;
  // try straight away first, then off to the sides
  for (const turn of [0, 0.7, -0.7, 1.4, -1.4]) {
    const cs = Math.cos(turn);
    const sn = Math.sin(turn);
    const goal = { x: Math.floor(l.x + (dx * cs - dz * sn) * far), z: Math.floor(l.z + (dx * sn + dz * cs) * far), r: 4 };
    const ok = yield* S.goTo(bot, goal, { tries: 1, maxNodes: 900, speed: bot.hunger > 6 ? "sprint" : "walk", noBuild: true });
    if (ok) return true;
    const now = bot.entity.location;
    if (Math.min(...from.map((p) => B.flat(p, now))) > far * 0.7) return true;
  }
  return false;
}

/**
 * Cornered with blocks to hand: pillar straight up out of reach (three blocks), as players do.
 * @param {any} bot @param {number} [height]
 */
export function* towerUp(bot, height = 3) {
  const f = B.feet(bot);
  const r = yield* S.plan(bot, { x: f.x, y: f.y + height, z: f.z, r: 0.5 }, { maxNodes: 200 });
  if (!r.complete) return false;
  return yield* S.follow(bot, r.path);
}
