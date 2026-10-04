// Zombie Titan: its attacks, sword, proto balls, loot and death sequence.
//
// Numbers follow the Java Titans mod (0.45) Zombie Titan where Bedrock allows:
// 32 blocks tall (16x a zombie), 20,000 HP, 120 attack damage (240 with its
// sword), stomp / kick / smash / sideways slash / downward slash / lightning /
// proto-ball volley / roar, and an enraged ("armored") phase below 20% health.
import { Difficulty, system, world } from "@minecraft/server";
import * as C from "./titan_common.js";
import * as U from "./util.js";
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

export const PROTO = "zt:proto_ball";
const MINION = "zt:zombie_minion";

const CFG = {
  maxHp: 20000,
  baseAttack: 120,
  walkSpeed: 0.23,
  turnRate: 3.5,
  meleeRange: 20,
  approachRange: 10,
  targetRange: 72,
  enragedAt: 0.2,
  minionCap: 10,
  minionCapEnraged: 14,
  hardMinionCap: 18,
  eggBirthTicks: 200,
  naturalBirthTicks: 860,
  serumBirthTicks: 160,
  xpReward: 10000,
};

const ANIM = {
  NONE: 0, KICK: 1, REFORM: 2, SMASH: 3, SWAT: 4, LIGHTNING: 5, STOMP: 6, SLASH_DOWN: 7,
  STUN: C.STUN, SLASH_SIDE: 9, ROAR: C.WAKE, SPIT: 12, BIRTH: C.BIRTH, LEAP: C.LEAP,
};
const DURATION = { 1: 60, 2: 210, 3: 70, 4: 30, 5: 110, 6: 150, 7: 230, 8: 140, 9: 190, 11: 100, 12: 110, 14: 50 };
// keep turning toward the target until this tick of each attack
const TRACK_UNTIL = { 1: 24, 2: 30, 3: 26, 4: 10, 5: 50, 6: 40, 7: 40, 8: 0, 9: 84, 11: 20, 12: 48, 14: 11 };

/** @type {Map<string, number>} */
const protoBalls = new Map();

/** @param {any} s */
function baseDamage(s) {
  return s.armed ? CFG.baseAttack * 2 : CFG.baseAttack;
}

/** @param {Entity} e @param {any} s @param {boolean} armed */
function setArmed(e, s, armed) {
  s.armed = armed;
  C.prop(e, s, "zt:armed", armed);
}

/** @param {Entity} e */
function countMinions(e) {
  return C.countMinionsAt(e.dimension, e.location, MINION);
}

// =============================================================================
// attacks
// =============================================================================
/** @param {Entity} e @param {any} s @param {Entity} target @param {number} d @param {number} dy @param {number} off @param {number} hp */
function chooseAttack(e, s, target, d, dy, off, hp) {
  // things high above it (flying players, pillars) get swatted
  if (dy > 10 && d < 26) {
    C.startAnim(e, s, ANIM.SWAT);
    return true;
  }
  if (d <= CFG.meleeRange && off < 35) {
    switch (U.randInt(0, 4)) {
      case 0:
        C.startAnim(e, s, ANIM.STOMP);
        break;
      case 1:
        if (s.armed) C.startAnim(e, s, ANIM.SLASH_DOWN);
        else C.startAnim(e, s, U.chance(0.5) ? ANIM.REFORM : ANIM.KICK);
        break;
      case 2:
        C.startAnim(e, s, ANIM.SLASH_SIDE);
        break;
      case 3:
        C.startAnim(e, s, d < 13 ? ANIM.KICK : ANIM.SMASH);
        break;
      default:
        C.startAnim(e, s, ANIM.SMASH);
    }
    return true;
  }
  if (d > 24 && U.chance(1 / 100)) {
    const r = U.randInt(0, 3);
    if (r === 0 && countMinions(e) < CFG.minionCap) C.startAnim(e, s, ANIM.ROAR);
    else C.startAnim(e, s, r % 2 === 0 ? ANIM.LIGHTNING : ANIM.SPIT);
    return true;
  }
  if (hp <= CFG.maxHp / 2 && d > 22 && d < 70 && U.chance(1 / 120)) {
    C.startAnim(e, s, ANIM.LEAP);
    return true;
  }
  return false;
}

/** @param {Entity} e @param {any} s @param {Entity | undefined} target */
function runAttack(e, s, target) {
  const dim = e.dimension;
  const loc = e.location;
  const yaw = s.yaw;
  const base = baseDamage(s);
  switch (s.anim) {
    case ANIM.KICK: {
      if (C.crossed(s, 24)) U.sound(dim, "zt.titan.swing", loc, 2, 1);
      if (C.crossed(s, 30)) {
        const c = U.offsetFrom(loc, yaw, 8, 1.5, 0);
        C.hitZone(e, s, c, 7.5, -1, 12, base, (v) => {
          const dir = U.forward(yaw);
          U.knock(v, dir.x, dir.z, 5, 1.6);
        });
        U.particle(dim, "zt:footstep", c);
        U.quake(dim, c, 30, 1.2, 0.4);
        U.sound(dim, "zt.titan.slam", c, 1.5, 1.3);
      }
      break;
    }
    case ANIM.REFORM: {
      if (C.crossed(s, 44)) U.sound(dim, "zt.titan.swing", loc, 2, 0.8);
      if (C.crossed(s, 50)) C.groundPound(e, s, U.offsetFrom(loc, yaw, 8), 20, base, 2.5);
      if (s.t > 60 && s.t < 150 && s.t % 20 < 2) {
        U.particle(dim, "zt:rumble", U.offsetFrom(loc, yaw, 8), { radius: 4 });
        U.quake(dim, loc, 32, 0.4, 0.3);
      }
      if (C.crossed(s, 160)) {
        setArmed(e, s, true);
        U.sound(dim, "zt.titan.summon", loc, 2, 0.5);
        U.sound(dim, "zt.titan.clang", loc, 2, 1.2);
        U.particle(dim, "zt:spark_burst", U.offsetFrom(loc, yaw, 6, 6, 20), { color: { red: 1, green: 1, blue: 0.85 } });
        U.tell(dim, loc, 96, "§6The Zombie Titan forged a new sword from the earth! §7(It can't be hurt while it holds it.)");
      }
      break;
    }
    case ANIM.SMASH: {
      if (C.crossed(s, 26)) U.sound(dim, "zt.titan.swing", loc, 2, 0.9);
      if (C.crossed(s, 32)) C.groundPound(e, s, U.offsetFrom(loc, yaw, 12), 18, base, 2.5);
      break;
    }
    case ANIM.SWAT: {
      if (C.crossed(s, 12) && U.isValid(target)) {
        const tl = target.location;
        if (U.dist2D(tl, loc) < 34) {
          U.sound(dim, "zt.titan.swing", tl, 2, 1.2);
          U.sound(dim, "zt.titan.slam", tl, 1.2, 1.5);
          for (const v of U.livingAround(dim, tl, 10, { excludeFamilies: ["zt_ally", "inanimate"] })) {
            U.hurt(v, v.id === target.id ? base * 4 : base * 2, e);
            const away = U.sub(v.location, loc);
            U.knock(v, away.x, away.z, 3.5, 0.9);
          }
          U.particle(dim, "minecraft:huge_explosion_emitter", tl);
        }
      }
      break;
    }
    case ANIM.LIGHTNING: {
      if (s.t >= 26 && s.t <= 46 && s.t % 5 < (s.props["zt:enraged"] ? 2 : 1)) {
        for (const side of [-9.5, 9.5]) {
          const hand = U.offsetFrom(loc, yaw, 1, side, 26);
          try {
            dim.spawnEntity("minecraft:lightning_bolt", hand);
          } catch {
            /* ignore */
          }
        }
      }
      if (C.crossed(s, 30)) U.sound(dim, "zt.titan.roar", loc, 3, 0.9);
      if (C.crossed(s, 64) && U.isValid(target)) superZombu(e, s, target, base);
      break;
    }
    case ANIM.STOMP: {
      if (C.crossed(s, 60)) C.stomp(e, s, 1, base);
      if (C.crossed(s, 104)) C.stomp(e, s, -1, base);
      break;
    }
    case ANIM.SLASH_DOWN: {
      if (C.crossed(s, 30)) U.sound(dim, "zt.titan.roar", loc, 2, 1.0);
      if (C.crossed(s, 112)) U.sound(dim, "zt.titan.swing", loc, 3, 0.6);
      if (C.crossed(s, 120)) downwardSlash(e, s, base);
      break;
    }
    case ANIM.STUN: {
      if (s.t % 30 < 2 && s.t < 100) U.sound(dim, "zt.titan.hurt", loc, 2, 0.9);
      break;
    }
    case ANIM.SLASH_SIDE: {
      if (C.crossed(s, 100)) U.sound(dim, "zt.titan.swing", loc, 3, 0.7);
      if (s.t >= 106 && s.prevT <= 110) sidewaysSlash(e, s, base);
      break;
    }
    case ANIM.ROAR: {
      if (C.crossed(s, 24)) {
        U.sound(dim, "zt.titan.roar", loc, 4, 0.85);
        U.particle(dim, "minecraft:knockback_roar_particle", U.offsetFrom(loc, yaw, 3, 0, 26));
        U.quake(dim, loc, 64, 1.5, 1.5);
        for (const v of U.livingAround(dim, loc, 16, { excludeFamilies: ["zt_ally", "inanimate"] })) {
          const away = U.sub(v.location, loc);
          U.knock(v, away.x, away.z, 2.5, 0.6);
        }
      }
      if (C.crossed(s, 30)) {
        // "ZOMBIE APOCALYPSE": a wave of minions claws out of the ground
        const n = Math.max(0, Math.min(6, CFG.hardMinionCap - countMinions(e)));
        for (let i = 0; i < n; i++) C.spawnMinion(dim, MINION, undefined, C.randomAround(e, 8, 18));
        if (n > 0) U.tell(dim, loc, 96, "§2The Zombie Titan calls its minions!");
      }
      break;
    }
    case ANIM.SPIT: {
      if (C.crossed(s, 40)) U.sound(dim, "zt.titan.ambient", loc, 3, 0.7);
      const extra = world.getDifficulty() === Difficulty.Hard ? 2 : 0;
      if (s.t >= 52 && s.t <= 60 + extra * 2 && s.t % 2 === 0 && s.prevT !== s.t && U.isValid(target)) {
        spitProtoBall(e, s, target);
      }
      break;
    }
    default:
      break;
  }
}

/** @param {Entity} e @param {any} s @param {Entity} target @param {number} base */
function superZombu(e, s, target, base) {
  const dim = e.dimension;
  const tl = target.location;
  U.hurt(target, base * 3, e);
  U.knock(target, 0, 0, 0, 1.0 + Math.random());
  try {
    dim.spawnEntity("minecraft:lightning_bolt", tl);
    dim.createExplosion(tl, 2, { breaksBlocks: false, causesFire: false, source: e });
  } catch {
    /* ignore */
  }
  for (const v of U.livingAround(dim, tl, 12, { excludeFamilies: ["zt_ally", "inanimate"] })) {
    if (v.id === target.id) continue;
    U.hurt(v, base, e);
    U.knock(v, 0, 0, 0, 1.0 + Math.random());
    try {
      dim.spawnEntity("minecraft:lightning_bolt", v.location);
    } catch {
      /* ignore */
    }
  }
  U.quake(dim, tl, 48, 2, 0.8);
}

/** @param {Entity} e @param {any} s @param {number} base */
function downwardSlash(e, s, base) {
  const dim = e.dimension;
  const loc = e.location;
  const yaw = s.yaw;
  const a = U.offsetFrom(loc, yaw, 6, 0, 0);
  const b = U.offsetFrom(loc, yaw, 40, 0, 0);
  // the blade itself: a 9 block wide strip, x10 damage
  for (const v of U.livingAround(dim, U.offsetFrom(loc, yaw, 23, 0, 0), 24, { excludeFamilies: ["zt_ally", "inanimate"] })) {
    const vs = U.bodySize(v);
    const flat = { x: v.location.x, y: a.y, z: v.location.z };
    if (U.distToSegment(flat, a, b) > 4.5 + vs.r) continue;
    if (v.location.y - loc.y > 12) continue;
    s.hitThisSwing.add(v.id);
    U.hurt(v, base * 10, e);
  }
  const impact = U.offsetFrom(loc, yaw, 30, 0, 0);
  C.hitZone(e, s, impact, 8, -2, 5, base, (v) => {
    const away = U.sub(v.location, impact);
    U.knock(v, away.x, away.z, 2, 0.7);
  });
  for (let d = 10; d <= 38; d += 7) U.particle(dim, "zt:shockwave_dust", U.offsetFrom(loc, yaw, d), { radius: 5 });
  U.particle(dim, "zt:shockwave", impact, { radius: 12 });
  U.sound(dim, "zt.titan.slam", impact, 4, 0.7);
  U.sound(dim, "zt.titan.clang", impact, 3, 0.8);
  U.quake(dim, impact, 90, 3.5, 1.0);

  // Java mechanic: slamming the sword into obsidian-hard blocks breaks it and stuns the titan
  if (!s.armed) return;
  const blk = C.findHardBlock(dim, loc, yaw, [8, 40], 3, [-2, 1]);
  if (blk) breakSword(e, s, blk.location);
}

/** @param {Entity} e @param {any} s @param {Vector3} where */
function breakSword(e, s, where) {
  const dim = e.dimension;
  const loc = e.location;
  setArmed(e, s, false);
  C.startAnim(e, s, ANIM.STUN);
  U.sound(dim, "zt.titan.clang", where, 4, 0.5);
  U.sound(dim, "random.anvil_break", where, 3, 0.5);
  U.particle(dim, "zt:spark_burst", { x: where.x + 0.5, y: where.y + 1.5, z: where.z + 0.5 }, { color: { red: 1, green: 0.9, blue: 0.5 } });
  // the shattered sword rains down as sticks and iron (Java: 16 sticks + 32 iron)
  C.dropItems(dim, U.offsetFrom(loc, s.yaw, 20, 0, 12), [["minecraft:stick", 16], ["minecraft:iron_ingot", 32]], 6);
  U.tell(dim, loc, 128, "§e§lCLANG! §r§eThe Zombie Titan's sword shattered on the hard block! §aIt's stunned and can be hurt now!");
}

/** @param {Entity} e @param {any} s @param {number} base */
function sidewaysSlash(e, s, base) {
  const dim = e.dimension;
  const loc = e.location;
  const yaw = s.yaw;
  const left = U.scale(U.rightOf(yaw), -1);
  for (const v of U.livingAround(dim, loc, 40, { excludeFamilies: ["zt_ally", "inanimate"] })) {
    if (s.hitThisSwing.has(v.id)) continue;
    const d = U.dist2D(v.location, loc);
    if (d < 3 || d > 34) continue;
    const ang = Math.abs(U.wrapDeg(U.yawTo(loc, v.location) - yaw));
    if (ang > 75) continue;
    const y = v.location.y - loc.y;
    if (y < -3 || y > 18) continue;
    s.hitThisSwing.add(v.id);
    U.hurt(v, base * 3, e);
    U.knock(v, left.x, left.z, 3.2, 0.8);
  }
  if (s.t >= 108 && s.prevT < 108) {
    U.sound(dim, "zt.titan.slam", U.offsetFrom(loc, yaw, 18), 2, 1.2);
    U.quake(dim, loc, 48, 1.2, 0.4);
  }
}

// ------------------------------------------------------------------ proto balls
/** @param {Entity} e @param {any} s @param {Entity} target */
function spitProtoBall(e, s, target) {
  const dim = e.dimension;
  const mouth = U.offsetFrom(e.location, s.yaw, 6, 0, 26);
  const tl = target.location;
  const aim = { x: tl.x + U.rand(-6, 6), y: tl.y, z: tl.z + U.rand(-6, 6) };
  const g = 0.05;
  const flat = U.dist2D(aim, mouth);
  const T = Math.max(18, Math.min(60, 14 + flat * 0.6));
  const vel = { x: (aim.x - mouth.x) / T, y: (aim.y - mouth.y + 0.5 * g * T * T) / T, z: (aim.z - mouth.z) / T };
  try {
    const ball = dim.spawnEntity(PROTO, mouth);
    const proj = ball.getComponent("minecraft:projectile");
    if (proj) {
      proj.owner = e;
      proj.shoot(vel);
    } else {
      ball.applyImpulse(vel);
    }
    protoBalls.set(ball.id, system.currentTick);
  } catch (err) {
    C.warn("proto ball: " + err);
  }
  U.sound(dim, "zt.titan.spit", mouth, 3, 1);
}

/** A proto ball landed: burst and a few minions climb out (Java: "summons hordes of minions"). */
/** @param {Entity} projectile @param {Dimension} dim @param {Vector3} location */
function onProtoBallHit(projectile, dim, location) {
  protoBalls.delete(projectile.id);
  U.particle(dim, "zt:proto_burst", location);
  U.sound(dim, "zt.titan.splat", location, 2, 0.8);
  for (const v of U.livingAround(dim, location, 3.5, { excludeFamilies: ["zt_ally", "inanimate"] })) {
    U.hurt(v, 8, undefined, "entityExplosion");
  }
  if (C.countMinionsAt(dim, location, MINION) < CFG.hardMinionCap) {
    const n = U.chance(0.35) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const at = { x: location.x + U.rand(-1.5, 1.5), y: location.y, z: location.z + U.rand(-1.5, 1.5) };
      const gy = U.groundY(dim, at.x, at.z, at.y + 3, 12);
      if (gy !== undefined) at.y = gy;
      C.spawnMinion(dim, MINION, "zt:as_loyalist", at);
    }
  }
  try {
    projectile.remove();
  } catch {
    /* already gone */
  }
}

// =============================================================================
// sword parry feedback
// =============================================================================
const parryTip = new Map();
const SWORD_TIP =
  "§6While the Zombie Titan holds its sword, it can't be hurt by players. §ePlace §5Obsidian§e in front of you, " +
  "and when it raises its sword for a §lDownward Slash§r§e, run sideways! If the sword hits the obsidian it shatters " +
  "and the titan is stunned.";

/** A Dark Fists ability hit the armed titan: explain why nothing happened (at most every 20 s). */
/** @param {Player} player @param {Entity} titan @param {any} s */
function notifyBlocked(player, titan, s) {
  if (!s.armed) return;
  const now = system.currentTick;
  if ((parryTip.get(player.id) ?? 0) < now) {
    parryTip.set(player.id, now + 400);
    player.sendMessage(SWORD_TIP);
  }
}

/** @param {Player} player @param {Entity} titan @param {any} s */
function onPlayerHit(player, titan, s) {
  if (!s.armed) return;
  const dim = titan.dimension;
  const at = player.getHeadLocation();
  const f = player.getViewDirection();
  U.particle(dim, "zt:spark_burst", { x: at.x + f.x * 2, y: at.y + f.y * 2, z: at.z + f.z * 2 }, { color: { red: 1, green: 0.95, blue: 0.7 } });
  U.sound(dim, "zt.titan.block", at, 1, 1);
  const now = system.currentTick;
  if ((parryTip.get(player.id) ?? 0) < now) {
    parryTip.set(player.id, now + 400);
    U.actionbar(player, "§7The titan's §fgiant sword§7 blocks you! §eMake its Downward Slash hit §5Obsidian§e to break it.");
    player.sendMessage(SWORD_TIP);
  }
}

// =============================================================================
// death sequence (corpse entity, 300 ticks): it staggers and falls face first
// =============================================================================
const LOOT = /** @type {Array<[string, number, number]>} */ ([
  // Java 0.45 drops: 128-255 rotten flesh, 32-63 bones / coal / iron, 8-15 emeralds and diamonds,
  // up to 3 harcadium (netherite scrap here) and a 1 in 10 chance of bedrock
  ["minecraft:rotten_flesh", 128, 255],
  ["minecraft:bone", 32, 63],
  ["minecraft:coal", 32, 63],
  ["minecraft:iron_ingot", 32, 63],
  ["minecraft:emerald", 8, 15],
  ["minecraft:diamond", 8, 15],
  ["minecraft:netherite_scrap", 0, 3],
]);

/** @param {any} c */
function loot(c) {
  const items = C.rollLoot(LOOT);
  const rare = ["minecraft:iron_ingot", "minecraft:carrot", "minecraft:potato"][U.randInt(0, 2)];
  items.push([rare, 64]);
  if (U.chance(0.1)) items.push(["minecraft:bedrock", 1]);
  if (c.armed) items.push(["minecraft:stick", 16], ["minecraft:iron_ingot", 32]);
  return items;
}

/** @param {any} c */
function corpseTick(c) {
  const dim = c.entity.dimension;
  const loc = c.loc;
  const yaw = c.yaw;
  const t = c.t;
  if (t === 1) {
    U.sound(dim, "zt.titan.death", loc, 4, 1);
    U.sound(dim, "zt.titan.roar", loc, 4, 0.7);
    U.quake(dim, loc, 80, 1.2, 1.5);
  }
  if (t === 36 || t === 56) {
    U.sound(dim, "zt.titan.step", loc, 3, 0.9);
    U.quake(dim, loc, 60, 1.2, 0.5);
  }
  if (t === 132) {
    // the titan crashes to the ground, face first
    U.sound(dim, "zt.titan.fall", loc, 5, 1);
    U.sound(dim, "zt.titan.slam", U.offsetFrom(loc, yaw, 16), 5, 0.6);
    U.quake(dim, loc, 120, 4, 1.6);
    for (let d = 2; d <= 30; d += 5) U.particle(dim, "zt:shockwave_dust", U.offsetFrom(loc, yaw, d), { radius: 7 });
    U.particle(dim, "zt:shockwave", U.offsetFrom(loc, yaw, 16), { radius: 24 });
    const a = U.offsetFrom(loc, yaw, 0);
    const b = U.offsetFrom(loc, yaw, 32);
    for (const v of U.livingAround(dim, U.offsetFrom(loc, yaw, 16), 22, { excludeFamilies: ["zt_ally", "inanimate"] })) {
      if (U.distToSegment({ x: v.location.x, y: loc.y, z: v.location.z }, a, b) > 6) continue;
      U.hurt(v, 6, undefined, "fallingBlock");
      const r = U.rightOf(yaw);
      const side = (v.location.x - loc.x) * r.x + (v.location.z - loc.z) * r.z >= 0 ? 1 : -1;
      U.knock(v, r.x * side, r.z * side, 1.8, 0.6);
    }
  }
  if (t > 150 && t < 290 && t % 10 === 0) {
    const p = U.offsetFrom(loc, yaw, U.rand(2, 30), U.rand(-4, 4), U.rand(1, 5));
    U.particle(dim, t % 20 === 0 ? "minecraft:huge_explosion_emitter" : "minecraft:large_explosion", p);
    if (t % 30 === 0) U.sound(dim, "random.explode", p, 2, 0.6);
    for (let i = 0; i < 3; i++) {
      try {
        dim.spawnEntity("minecraft:xp_orb", U.offsetFrom(loc, yaw, U.rand(4, 28), U.rand(-3, 3), 8));
      } catch {
        /* ignore */
      }
    }
  }
}

// =============================================================================
// the type definition titan.js runs
// =============================================================================
export const ZOMBIE_TITAN = {
  id: "zt:zombie_titan",
  name: "Zombie Titan",
  color: "§2",
  corpse: "zt:zombie_titan_corpse",
  minion: MINION,
  cfg: CFG,
  duration: DURATION,
  trackUntil: TRACK_UNTIL,
  snd: {
    step: "zt.titan.step", slam: "zt.titan.slam", roar: "zt.titan.roar", fall: "zt.titan.fall",
    quake: "zt.titan.quake", ambient: "zt.titan.ambient",
  },
  enragedText: "It moves faster and shrugs off arrows.",
  /** read the saved sword state into a fresh state object @param {Entity} e @param {any} s */
  init(e, s) {
    s.armed = true;
    try {
      s.armed = !!e.getProperty("zt:armed");
    } catch {
      /* ignore */
    }
    s.props["zt:armed"] = s.armed;
  },
  /** @param {Entity} e @param {any} s */
  onBirthStart(e, s) {
    setArmed(e, s, true);
  },
  baseDamage,
  chooseAttack,
  runAttack,
  onPlayerHit,
  notifyBlocked,
  /** @param {Entity} projectile @param {Dimension} dim @param {Vector3} location */
  onProjectileHit(projectile, dim, location) {
    if (projectile.typeId !== PROTO) return false;
    onProtoBallHit(projectile, dim, location);
    return true;
  },
  /** @param {number} tick */
  housekeeping(tick) {
    for (const [id, born] of protoBalls) {
      if (tick - born > 240) protoBalls.delete(id);
    }
  },
  /** the corpse shows the sword if the titan died holding it @param {Entity} corpse @param {any} s */
  corpseInit(corpse, s) {
    corpse.setProperty("zt:armed", !!s.armed);
  },
  /** @param {Entity} corpse */
  corpseLoad(corpse) {
    try {
      return { armed: !!corpse.getProperty("zt:armed") };
    } catch {
      return {};
    }
  },
  corpseSeq: { lootTick: 170, endTick: 300, lootAhead: 16, tick: corpseTick },
  loot,
};
