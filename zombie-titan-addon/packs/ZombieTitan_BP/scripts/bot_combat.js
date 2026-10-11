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
  "minecraft:ghast", "minecraft:witch", "minecraft:breeze", "minecraft:shulker", "zt:skeleton_minion", "zt:shroom_skeleton"]);
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
/** A mob's health (20 if it can't be told). @param {Entity} t */
export function hpOf(t) {
  try {
    return t.getComponent("minecraft:health")?.currentValue ?? 20;
  } catch {
    return 20;
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

/** Is anything that shoots or throws (a blaze, a skeleton) about and after it? @param {any} bot @param {number} r */
export function shootersNear(bot, r) {
  try {
    return bot.entity.dimension.getEntities({ location: bot.entity.location, maxDistance: r }).some((e) => RANGED.has(e.typeId) && alive(e));
  } catch {
    return false;
  }
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
  let id = t.id;
  armUp(bot);
  bot.busyLook = true;
  // a creeper's fuse, as near as it can tell (when it came close enough to light it), and
  // whether it got its blow in this time
  let lit = 0;
  let struck = false;
  // times it came in on a creeper and couldn't land a blow (one down a hole it can't reach)
  let misses = 0;
  /** where it's backing off to (kept a few ticks, so it doesn't dither) */
  let retreat;
  let retreatUntil = 0;
  let lastPos;
  let stillFor = 0;
  let stuck = 0;
  let lastD = Infinity;
  // a fight going nowhere: shot again and again, no blow landed
  const hp0 = B.health(bot);
  let tHp0;
  try {
    tHp0 = t.getComponent("minecraft:health")?.currentValue;
  } catch {
    tHp0 = undefined;
  }
  // arrows that did it no harm: after twenty (stuck in a wall, out of true range) it gives up,
  // unless things are shooting at it (a blaze is hard to hit, but it has to be fought)
  let shots = 0;
  let hpAtShot = tHp0;
  const futile = () => {
    let hp;
    try {
      hp = t.getComponent("minecraft:health")?.currentValue;
    } catch {
      hp = undefined;
    }
    if (hp === undefined || hpAtShot === undefined || hp < hpAtShot) {
      hpAtShot = hp;
      shots = 0;
      return false;
    }
    const underFire = bot.lastAttacker && RANGED.has(bot.lastAttacker.typeId) && system.currentTick - (bot.lastAttackerAt ?? -1e9) < 200;
    return shots >= 20 && !underFire;
  };
  const started = system.currentTick;
  try {
    for (let i = 0; i < limit; i++) {
      const now = system.currentTick;
      if (!alive(t)) return bot.lastKill === id ? "killed" : t.isValid ? "killed" : "gone";
      if (B.health(bot) <= fleeHp && !o.fleeHp) return "flee";
      if (RANGED.has(t.typeId) && now - started > 120 && hp0 - B.health(bot) >= 7) {
        let tHp;
        try {
          tHp = t.getComponent("minecraft:health")?.currentValue;
        } catch {
          tHp = undefined;
        }
        if (tHp !== undefined && tHp0 !== undefined && tHp >= tHp0) return "lost";
      }
      // a creeper creeping up on it while it fights something else: that first
      if (t.typeId !== "minecraft:creeper") {
        const boom = creeperNear(bot, 4.5);
        if (boom) {
          t = boom;
          id = t.id;
          lit = 0;
          struck = false;
          hpAtShot = undefined;
          continue;
        }
      }
      bot.lastTargetPos = { ...t.location };
      const l = bot.entity.location;
      const c = centre(t);
      const d = B.dist(B.eye(bot), nearestPoint(t, B.eye(bot)));
      if (d > (o.giveUp ?? 24) || t.dimension.id !== bot.entity.dimension.id) return "lost";
      B.lookAt(bot, c, 6, 5);
      const creeper = t.typeId === "minecraft:creeper";
      // a creeper lights its fuse when it gets within about three blocks, and it goes off a
      // second and a half later unless what it's after gets more than six or seven away. So:
      // one blow as it comes in (it knocks it back), then away out of its range, and again
      if (creeper) {
        const fd = B.dist(l, t.location);
        if (fd < 3.3 && !lit) {
          lit = now;
          if (!inReach(bot, t) && ++misses >= 3) return "lost";
        } else if (fd > 7.2) lit = 0;
        // in water it can't get away fast enough: out onto dry land first
        if (lit || (bot.inWater && fd < 7.5)) {
          if (!struck && lit && now - lit < 6 && (bot.onGround || bot.inWater)) {
            struck = hit(bot, t, now);
            if (struck) misses = 0;
          }
          // which way (the same way a few ticks, unless it's got nowhere)
          const moved = lastPos ? B.flat(lastPos, l) : 1;
          if (!retreat || now >= retreatUntil || (moved < 0.03 && now - retreatUntil > -6)) {
            // (away from whatever else is at it too)
            retreat = awayFrom(bot, [t.location, ...closeBy(bot, t)], 5);
            retreatUntil = now + 10;
          }
          // one more blow finishes it, or it's cornered (nowhere to go, or not getting anywhere):
          // hit it, and again (each blow knocks it back)
          stillFor = moved < 0.03 ? stillFor + 1 : 0;
          lastPos = { ...l };
          let left = 20;
          try {
            left = t.getComponent("minecraft:health")?.currentValue ?? 20;
          } catch {
            left = 20;
          }
          const finish = left <= D.toolInfo(Inv.held(bot)?.typeId).damage;
          if ((finish || !retreat || stillFor > 8) && inReach(bot, t)) {
            hit(bot, t, now);
            if (finish || !retreat) B.stop(bot);
          } else if (retreat) B.moveTo(bot, retreat, { speed: "sprint" });
          // it can't get clear in time: its shield between them
          if (fd < 4.5 && now - lit > 16 && hasShield(bot)) B.setUse(bot, 3);
          else if (bot.use === 3) B.setUse(bot, 0);
          yield;
          continue;
        }
        struck = false;
        retreat = undefined;
        if (bot.use === 3) B.setUse(bot, 0);
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
        if (futile()) return "lost";
        const shot = yield* shoot(bot, t, { draw: 16, wary: shield });
        if (shot) shots++;
        armUp(bot);
        if (!shot) {
          if (shield) B.setUse(bot, 3);
          yield;
        }
        continue;
      }
      if ((FLYING.has(t.typeId) || above || o.bow || (creeper && d > 5)) && canShoot(bot) && d > 4) {
        if (futile()) return "lost";
        yield* shoot(bot, t);
        shots++;
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
          // (on foot: no pillaring up to a thing in the air, no bridging; under it will do)
          const p = B.blockPos(t.location);
          const air = FLYING.has(t.typeId) || t.typeId === "minecraft:blaze" || c.y - l.y > 2.5;
          const r = yield* S.plan(bot, air ? { x: p.x, z: p.z, r: 2.5 } : { ...p, r: 1.5 }, { maxNodes: 700, noPlace: true });
          const watch = t.typeId === "minecraft:creeper" ? undefined : () => !!creeperNear(bot, 4.5);
          if (r.path.length) yield* S.follow(bot, r.path.slice(0, 4), { speed: "sprint", interrupt: watch });
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
      // in reach. Others closing in on it too (a second zombie at its side)?
      const crowd = closeBy(bot, t);
      const fd = B.flat(l, t.location);
      // a jump for a critical hit now and then, timed to come down as the next blow is due (not
      // with others about: it keeps its feet, to step away)
      const due = now - (bot.lastHit ?? -99) >= (bot.hitGap ?? 10) - 7;
      if (bot.onGround && due && !crowd.length && fd > 2 && Math.random() < 0.08) B.jump(bot);
      const falling = !bot.onGround && !bot.inWater;
      let vy = 0;
      try {
        vy = bot.entity.getVelocity().y;
      } catch {
        vy = 0;
      }
      if (!falling || vy < -0.05) hit(bot, t, now);
      // a step outside its reach, as good players keep (its own knockback holds it there), and
      // away from any other closing in; else a step to the side now and then
      const narrow = (SIZE[t.typeId]?.[0] ?? 0.3) <= 0.35;
      const pressing = [...(narrow && fd < 2.4 ? [t.location] : []), ...crowd.filter((p) => B.flat(l, p) < 2.6)];
      if (pressing.length || d < 1.2) {
        const to = awayFrom(bot, pressing.length ? pressing : [t.location], 2);
        if (to) B.moveTo(bot, to, { speed: "walk" });
        else B.stop(bot);
      } else if (Math.random() < 0.1) {
        const side = Math.random() < 0.5 ? 1 : -1;
        B.moveTo(bot, { x: l.x + (c.z - l.z) * 0.4 * side, y: l.y, z: l.z - (c.x - l.x) * 0.4 * side }, { speed: "walk", noFall: true });
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

/** The nearest creeper within r blocks. @param {any} bot @param {number} r @returns {Entity | undefined} */
function creeperNear(bot, r) {
  try {
    const near = bot.entity.dimension.getEntities({ type: "minecraft:creeper", location: bot.entity.location, maxDistance: r }).filter(alive);
    near.sort((a, b) => B.dist(a.location, bot.entity.location) - B.dist(b.location, bot.entity.location));
    return near[0];
  } catch {
    return undefined;
  }
}

/** Where the other hostile mobs closing in on it are (not the one it's fighting). @param {any} bot @param {Entity} t */
function closeBy(bot, t) {
  /** @type {Vector3[]} */
  const out = [];
  try {
    for (const e of bot.entity.dimension.getEntities({ location: bot.entity.location, maxDistance: 4 })) {
      if (e.id === t.id || !HOSTILE_MELEE.test(e.typeId) || !alive(e)) continue;
      out.push(e.location);
    }
  } catch {
    /* ignore */
  }
  return out;
}
const HOSTILE_MELEE = /^minecraft:(zombie|husk|drowned|zombie_villager|zombie_villager_v2|spider|cave_spider|creeper|vindicator|piglin_brute|zoglin|hoglin|wither_skeleton|silverfish|endermite|slime|magma_cube)$|^zt:(.*_minion|shroom_zombie)$/;

/**
 * A spot a few blocks away from some threats it can get to on foot: straight away from them if
 * the ground allows (no wall, no drop of more than two blocks), else off to one side.
 * @param {any} bot @param {Vector3[]} from @param {number} [far]
 */
function awayFrom(bot, from, far = 4) {
  const l = bot.entity.location;
  const dim = bot.entity.dimension;
  let ax = 0;
  let az = 0;
  for (const p of from) {
    const k = 1 / Math.max(0.5, B.flat(l, p));
    ax += (l.x - p.x) * k;
    az += (l.z - p.z) * k;
  }
  const n = Math.hypot(ax, az);
  if (n < 1e-6) {
    // right on top of it: back the way it faces
    const f = B.forward(bot.yaw);
    ax = -f.x;
    az = -f.z;
  } else {
    ax /= n;
    az /= n;
  }
  // each way it could go: straight away best, then off to the sides; dry land over water
  let best;
  let bestScore = Infinity;
  for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.7, -1.7]) {
    const cs = Math.cos(turn);
    const sn = Math.sin(turn);
    const dx = ax * cs - az * sn;
    const dz = ax * sn + az * cs;
    let y = Math.floor(l.y);
    let px = Math.floor(l.x);
    let pz = Math.floor(l.z);
    let ok = true;
    let wet = 0;
    for (let k = 1; k <= Math.ceil(far) && ok; k++) {
      const x = Math.floor(l.x + dx * k);
      const z = Math.floor(l.z + dz * k);
      if (x === px && z === pz) continue;
      const at = (yy) => B.idAt(dim, { x, y: yy, z });
      const open = (yy) => D.isPassable(at(yy)) || /water/.test(at(yy));
      ok = false;
      if (open(y) && open(y + 1)) {
        // in at this height, then down to the ground (two blocks at most) or into water
        let yy = y;
        while (yy > y - 3 && !/water/.test(at(yy)) && open(yy - 1)) yy--;
        if (yy >= y - 2 && (D.isFloor(at(yy - 1)) || /water/.test(at(yy)))) {
          y = yy;
          ok = true;
        }
      } else if (D.isFloor(at(y)) && open(y + 1) && open(y + 2) && D.isPassable(B.idAt(dim, { x: px, y: y + 2, z: pz }))) {
        // a step up (with room over its head to jump)
        y += 1;
        ok = true;
      }
      if (ok && /water/.test(at(y))) wet++;
      ok = ok && !/lava|fire|magma|cactus|sweet_berry/.test(at(y) + at(y - 1));
      px = x;
      pz = z;
    }
    if (!ok) continue;
    const score = Math.abs(turn) + wet * 0.8;
    if (score < bestScore) {
      bestScore = score;
      best = { x: l.x + dx * far, y, z: l.z + dz * far };
    }
  }
  return best;
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
