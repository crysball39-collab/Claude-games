// Skeleton Titan: its bow volley, stomp, punch, swat, anti-air strikes, bow
// slam, stun, loot and death sequence.
//
// Numbers follow the Java Titans mod (0.45) Skeleton Titan: 32 blocks tall,
// 20,000 HP, 120 attack damage, 20,000 XP. Players can only hurt it while it
// is stunned: its Bow Slam has to hit obsidian-hard blocks, which knocks it
// down for 22.5 seconds. Up close it stomps (ticks 60 and 104), punches (60),
// swats (24) and slams its bow 32 blocks ahead (90, 15x damage); anything
// high above it gets an anti-air strike (12, 4x). Out of reach it looses an
// 11 second arrow volley (ticks 120-340). Java fires ten 30-damage arrows a
// tick; Bedrock gets one giant arrow a tick so phones keep up.
import { system } from "@minecraft/server";
import * as C from "./titan_common.js";
import * as U from "./util.js";
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

export const ARROW = "zt:titan_arrow";
const MINION = "zt:skeleton_minion";

const CFG = {
  maxHp: 20000,
  baseAttack: 120,
  walkSpeed: 0.23,
  turnRate: 3.5,
  meleeRange: 29,
  approachRange: 16,
  targetRange: 80,
  enragedAt: 0.125,
  minionCap: 8,
  minionCapEnraged: 12,
  eggBirthTicks: 200,
  naturalBirthTicks: 860,
  serumBirthTicks: 160,
  xpReward: 20000,
  stunTicks: 450,
};

const ANIM = {
  NONE: 0, ANTI_AIR: 1, SWAT: 2, PUNCH: 3, ANTI_AIR2: 4, VOLLEY: 5, STOMP: 6, SLAM: 7,
  STUN: C.STUN, AWAKEN: C.WAKE, BIRTH: C.BIRTH, LEAP: C.LEAP,
};
const DURATION = { 1: 30, 2: 60, 3: 140, 4: 30, 5: 400, 6: 150, 7: 260, 8: 540, 11: 60, 14: 50 };
// keep turning toward the target until this tick of each attack (the bow slam
// locks its aim 1.5 s before it lands so it can be dodged)
const TRACK_UNTIL = { 1: 12, 2: 24, 3: 40, 4: 12, 5: 340, 6: 60, 7: 60, 8: 0, 11: 20, 14: 11 };

/** giant arrows in flight or stuck in the ground: id -> [entity, tick shot, tick landed or 0] @type {Map<string, [Entity, number, number]>} */
const arrows = new Map();

/** @param {any} s */
function baseDamage(s) {
  return CFG.baseAttack;
}

/** @param {Entity} e @param {any} s @param {boolean} on */
function setStunned(e, s, on) {
  s.stunned = on;
  C.prop(e, s, "zt:stunned", on);
}

/** @param {Entity} target */
function isTall(target) {
  return U.bodySize(target).h >= 6;
}

// =============================================================================
// attacks
// =============================================================================
/** @param {Entity} e @param {any} s @param {Entity} target @param {number} d @param {number} dy @param {number} off @param {number} hp */
function chooseAttack(e, s, target, d, dy, off, hp) {
  if (d <= CFG.meleeRange && off < 40) {
    // titans, dragons and anything perched 6+ blocks up get an anti-air strike
    if (dy > 6 || isTall(target)) {
      C.startAnim(e, s, U.chance(0.5) ? ANIM.ANTI_AIR : ANIM.ANTI_AIR2);
      return true;
    }
    switch (U.randInt(0, 3)) {
      case 0:
        C.startAnim(e, s, ANIM.STOMP);
        break;
      case 1:
        C.startAnim(e, s, ANIM.PUNCH);
        break;
      case 2:
        C.startAnim(e, s, ANIM.SLAM);
        break;
      default:
        C.startAnim(e, s, ANIM.SWAT);
    }
    return true;
  }
  if (d > CFG.meleeRange && U.chance(1 / 80)) {
    C.startAnim(e, s, ANIM.VOLLEY);
    return true;
  }
  // Java: now and then it jumps at a far-away target
  if (d > 24 && d < 70 && U.chance(1 / 200)) {
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
    case ANIM.ANTI_AIR:
    case ANIM.ANTI_AIR2: {
      if (C.crossed(s, 8)) U.sound(dim, "zt.titan.swing", loc, 2, 1.3);
      if (C.crossed(s, 12) && U.isValid(target)) antiAir(e, s, target, base);
      break;
    }
    case ANIM.SWAT: {
      if (C.crossed(s, 16)) U.sound(dim, "zt.titan.swing", loc, 2, 1.1);
      if (C.crossed(s, 24) && U.isValid(target)) {
        const tl = target.location;
        const dy = tl.y - loc.y;
        if (U.dist2D(tl, loc) <= 32 && dy > -6 && dy < 24) {
          C.hitZone(e, s, tl, 6, -3, 6, base, (v) => {
            const away = U.sub(v.location, loc);
            U.knock(v, away.x, away.z, 2.8, 0.7);
          });
          U.particle(dim, "zt:bone_dust", tl);
          U.sound(dim, "zt.titan.slam", tl, 1.5, 1.4);
        }
      }
      break;
    }
    case ANIM.PUNCH: {
      if (C.crossed(s, 50)) U.sound(dim, "zt.titan.swing", loc, 2, 0.9);
      if (C.crossed(s, 60)) {
        const fist = U.offsetFrom(loc, yaw, 8);
        try {
          dim.createExplosion(fist, 3, { breaksBlocks: false, causesFire: false, source: e });
        } catch {
          /* ignore */
        }
        C.groundPound(e, s, U.offsetFrom(loc, yaw, 10), 14, base, 2.5);
      }
      break;
    }
    case ANIM.VOLLEY: {
      if (C.crossed(s, 60)) U.sound(dim, "zt.skel.draw", loc, 3, 0.6);
      if (s.t >= 120 && s.t <= 340 && U.isValid(target)) {
        shootArrow(e, s, target);
        if (s.t % 4 === 0) U.sound(dim, "zt.skel.bow", U.offsetFrom(loc, yaw, 8, 0, 18), 3, 0.7);
      }
      break;
    }
    case ANIM.STOMP: {
      if (C.crossed(s, 60)) C.stomp(e, s, 1, base);
      if (C.crossed(s, 104)) C.stomp(e, s, -1, base);
      break;
    }
    case ANIM.SLAM: {
      if (C.crossed(s, 20)) U.sound(dim, "zt.skel.rattle", loc, 2, 0.7);
      // the aim and the reach lock here, 1.5 s before the bow comes down
      if (C.crossed(s, 60)) s.slamReach = U.isValid(target) ? Math.max(12, Math.min(32, U.dist2D(target.location, loc))) : 32;
      if (C.crossed(s, 82)) U.sound(dim, "zt.titan.swing", loc, 3, 0.6);
      if (C.crossed(s, 90)) bowSlam(e, s, base);
      break;
    }
    case ANIM.STUN: {
      if (C.crossed(s, 70)) {
        // it crashes down onto its back
        U.sound(dim, "zt.titan.fall", loc, 4, 1.1);
        U.sound(dim, "zt.skel.crack", loc, 3, 0.6);
        U.particle(dim, "zt:shockwave_dust", loc, { radius: 12 });
        U.particle(dim, "zt:bone_dust", U.offsetFrom(loc, yaw, -6, 0, 2));
        U.quake(dim, loc, 80, 2.5, 1.0);
      }
      if (s.t > 90 && s.t < CFG.stunTicks && s.t % 40 < 2) U.sound(dim, "zt.skel.hurt", loc, 1.5, 0.6);
      if (C.crossed(s, CFG.stunTicks)) {
        setStunned(e, s, false);
        U.tell(dim, loc, 128, "§6The Skeleton Titan is getting back up!");
        U.sound(dim, "zt.skel.rattle", loc, 3, 0.6);
      }
      if (C.crossed(s, 480)) {
        U.sound(dim, "zt.skel.step", loc, 3, 0.8);
        U.quake(dim, loc, 60, 1.2, 0.5);
      }
      break;
    }
    case ANIM.AWAKEN: {
      if (C.crossed(s, 10)) U.sound(dim, "zt.skel.rattle", loc, 4, 0.7);
      if (C.crossed(s, 28)) {
        U.sound(dim, "zt.skel.roar", loc, 4, 0.8);
        U.quake(dim, loc, 64, 1.5, 1.0);
        U.particle(dim, "zt:bone_dust", U.offsetFrom(loc, yaw, 1, 0, 24));
      }
      break;
    }
    default:
      break;
  }
}

/** Anti-air strike: whatever is perched above it takes 4x, its neighbours 2x (Java: AntiTitanAttack). */
/** @param {Entity} e @param {any} s @param {Entity} target @param {number} base */
function antiAir(e, s, target, base) {
  const dim = e.dimension;
  const loc = e.location;
  const tl = target.location;
  if (U.dist2D(tl, loc) > 36 || tl.y - loc.y > 44) return;
  U.hurt(target, base * 4, e);
  const away = U.sub(tl, loc);
  U.knock(target, away.x, away.z, 3, 0.9);
  for (const v of U.livingAround(dim, tl, 8, { excludeFamilies: ["zt_ally", "inanimate"] })) {
    if (v.id === target.id) continue;
    U.hurt(v, base * 2, e);
    const a = U.sub(v.location, loc);
    U.knock(v, a.x, a.z, 2.5, 0.7);
  }
  U.particle(dim, "minecraft:huge_explosion_emitter", tl);
  U.particle(dim, "zt:bone_dust", tl);
  U.sound(dim, "zt.titan.slam", tl, 2, 1.3);
}

/** The bow comes down `slamReach` blocks ahead: 15x in the middle, a shockwave around it. */
/** @param {Entity} e @param {any} s @param {number} base */
function bowSlam(e, s, base) {
  const dim = e.dimension;
  const loc = e.location;
  const yaw = s.yaw;
  const reach = s.slamReach ?? 32;
  const impact = U.offsetFrom(loc, yaw, reach, 0, 0);
  C.hitZone(e, s, impact, 6, -2, 8, base * 15);
  C.hitZone(e, s, impact, 14, -2, 6, base / 4, (v) => {
    const away = U.sub(v.location, impact);
    U.knock(v, away.x, away.z, 2.2, 0.8);
  });
  for (let d = 8; d <= reach; d += 6) U.particle(dim, "zt:shockwave_dust", U.offsetFrom(loc, yaw, d), { radius: 4 });
  U.particle(dim, "zt:shockwave", impact, { radius: 14 });
  U.particle(dim, "zt:bone_dust", impact);
  U.sound(dim, "zt.titan.slam", impact, 4, 0.7);
  U.sound(dim, "zt.skel.crack", impact, 3, 0.9);
  U.quake(dim, impact, 90, 3.5, 1.0);

  // Java mechanic: slamming into obsidian-hard blocks knocks the titan down
  const blk = C.findHardBlock(dim, loc, yaw, [Math.max(6, reach - 4), reach + 4], 4, [-1, 1]);
  if (blk) knockDown(e, s, blk.location);
}

/** @param {Entity} e @param {any} s @param {Vector3} where */
function knockDown(e, s, where) {
  const dim = e.dimension;
  const loc = e.location;
  C.startAnim(e, s, ANIM.STUN);
  setStunned(e, s, true);
  U.sound(dim, "random.anvil_land", where, 3, 0.5);
  U.sound(dim, "zt.skel.crack", where, 4, 0.5);
  U.particle(dim, "zt:spark_burst", { x: where.x + 0.5, y: where.y + 1.5, z: where.z + 0.5 }, { color: { red: 0.95, green: 0.92, blue: 0.8 } });
  U.particle(dim, "zt:bone_dust", { x: where.x + 0.5, y: where.y + 1.5, z: where.z + 0.5 });
  U.tell(dim, loc, 128, "§e§lCRACK! §r§eThe Skeleton Titan's bow slam hit the hard block and it collapsed! §aHit it now, it can be hurt for 22 seconds!");
}

// ------------------------------------------------------------------ giant arrows
/** @param {Entity} e @param {any} s @param {Entity} target */
function shootArrow(e, s, target) {
  const dim = e.dimension;
  const bow = U.offsetFrom(e.location, s.yaw, 8, 0, 18);
  const tl = target.location;
  const flat0 = U.dist2D(tl, bow);
  const spread = 2 + flat0 * 0.08;
  const aim = { x: tl.x + U.rand(-spread, spread), y: tl.y + 0.9, z: tl.z + U.rand(-spread, spread) };
  const g = 0.05;
  const flat = U.dist2D(aim, bow);
  const T = Math.max(10, Math.min(40, 8 + flat * 0.3));
  const vel = { x: (aim.x - bow.x) / T, y: (aim.y - bow.y + 0.5 * g * T * T) / T, z: (aim.z - bow.z) / T };
  try {
    const arrow = dim.spawnEntity(ARROW, bow);
    const proj = arrow.getComponent("minecraft:projectile");
    if (proj) {
      proj.owner = e;
      proj.shoot(vel);
    } else {
      arrow.applyImpulse(vel);
    }
    arrows.set(arrow.id, [arrow, system.currentTick, 0]);
  } catch (err) {
    C.warn("titan arrow: " + err);
  }
}

// =============================================================================
// stun feedback
// =============================================================================
const tipShown = new Map();
const STUN_TIP =
  "§6Players can't hurt the Skeleton Titan until it is knocked down. §ePlace §5Obsidian§e where you stand, and when " +
  "it lifts its bow for a §lBow Slam§r§e, run sideways! When the bow smashes into the obsidian the titan collapses " +
  "and can be hurt for 22 seconds.";

/** @param {Player} player @param {Entity} titan @param {any} s */
function notifyBlocked(player, titan, s) {
  if (s.stunned) return;
  const now = system.currentTick;
  if ((tipShown.get(player.id) ?? 0) < now) {
    tipShown.set(player.id, now + 400);
    player.sendMessage(STUN_TIP);
  }
}

/** @param {Player} player @param {Entity} titan @param {any} s */
function onPlayerHit(player, titan, s) {
  if (s.stunned) return;
  const dim = titan.dimension;
  const at = player.getHeadLocation();
  const f = player.getViewDirection();
  U.particle(dim, "zt:bone_dust", { x: at.x + f.x * 2, y: at.y + f.y * 2, z: at.z + f.z * 2 });
  U.sound(dim, "zt.titan.block", at, 1, 1.3);
  const now = system.currentTick;
  if ((tipShown.get(player.id) ?? 0) < now) {
    tipShown.set(player.id, now + 400);
    U.actionbar(player, "§7The titan's bones are too hard! §eMake its Bow Slam hit §5Obsidian§e to knock it down.");
    player.sendMessage(STUN_TIP);
  }
}

// =============================================================================
// death sequence (corpse entity, 300 ticks): it sinks to its knees and collapses
// =============================================================================
const LOOT = /** @type {Array<[string, number, number]>} */ ([
  // Java 0.45: 48 sticks and 48 string (its bow), 128-255 arrows, bones and coal,
  // 256-511 bone meal, up to 15 emeralds and 15 diamonds, up to 3 harcadium (netherite scrap here)
  ["minecraft:bone", 128, 255],
  ["minecraft:arrow", 128, 255],
  ["minecraft:coal", 128, 255],
  ["minecraft:bone_meal", 256, 511],
  ["minecraft:stick", 48, 48],
  ["minecraft:string", 48, 48],
  ["minecraft:emerald", 0, 15],
  ["minecraft:diamond", 0, 15],
  ["minecraft:netherite_scrap", 0, 3],
]);

/** @param {any} c */
function loot(c) {
  const items = C.rollLoot(LOOT);
  items.push(["minecraft:bow", 1], ["minecraft:skeleton_skull", U.randInt(1, 3)]);
  return items;
}

/** @param {any} c */
function corpseTick(c) {
  const dim = c.entity.dimension;
  const loc = c.loc;
  const yaw = c.yaw;
  const t = c.t;
  if (t === 1) {
    U.sound(dim, "zt.skel.death", loc, 4, 1);
    U.sound(dim, "zt.skel.rattle", loc, 4, 0.6);
    U.quake(dim, loc, 80, 1.2, 1.5);
  }
  if (t === 40) {
    // its knees hit the ground
    U.sound(dim, "zt.skel.step", loc, 3, 0.8);
    U.sound(dim, "zt.titan.slam", loc, 3, 0.8);
    U.particle(dim, "zt:shockwave_dust", U.offsetFrom(loc, yaw, 4), { radius: 8 });
    U.quake(dim, loc, 80, 2, 0.8);
  }
  if (t === 110) {
    // the rest of it crashes down and falls apart
    U.sound(dim, "zt.titan.fall", loc, 5, 1.1);
    U.sound(dim, "zt.skel.crack", loc, 4, 0.5);
    U.quake(dim, loc, 120, 4, 1.6);
    U.particle(dim, "zt:shockwave", U.offsetFrom(loc, yaw, 8), { radius: 18 });
    for (let d = 0; d <= 18; d += 6) U.particle(dim, "zt:bone_dust", U.offsetFrom(loc, yaw, d, 0, 1));
    for (const v of U.livingAround(dim, U.offsetFrom(loc, yaw, 8), 14, { excludeFamilies: ["zt_ally", "inanimate"] })) {
      U.hurt(v, 6, undefined, "fallingBlock");
      const away = U.sub(v.location, loc);
      U.knock(v, away.x, away.z, 1.6, 0.6);
    }
  }
  if (t > 130 && t < 290 && t % 10 === 0) {
    const p = U.offsetFrom(loc, yaw, U.rand(-2, 16), U.rand(-5, 5), U.rand(1, 4));
    U.particle(dim, t % 20 === 0 ? "minecraft:huge_explosion_emitter" : "zt:bone_dust", p);
    if (t % 30 === 0) U.sound(dim, "random.explode", p, 2, 0.6);
    for (let i = 0; i < 3; i++) {
      try {
        dim.spawnEntity("minecraft:xp_orb", U.offsetFrom(loc, yaw, U.rand(0, 14), U.rand(-4, 4), 8));
      } catch {
        /* ignore */
      }
    }
  }
}

// =============================================================================
// the type definition titan.js runs
// =============================================================================
export const SKELETON_TITAN = {
  id: "zt:skeleton_titan",
  name: "Skeleton Titan",
  color: "§7",
  corpse: "zt:skeleton_titan_corpse",
  minion: MINION,
  cfg: CFG,
  duration: DURATION,
  trackUntil: TRACK_UNTIL,
  snd: {
    step: "zt.skel.step", slam: "zt.titan.slam", roar: "zt.skel.roar", fall: "zt.titan.fall",
    quake: "zt.titan.quake", ambient: "zt.skel.ambient",
  },
  enragedText: "Its bones harden: it moves faster and shrugs off arrows.",
  /** a titan saved mid-stun gets up again (its animation restarts after a reload) @param {Entity} e @param {any} s */
  init(e, s) {
    s.stunned = false;
    s.props["zt:stunned"] = false;
    try {
      e.setProperty("zt:stunned", false);
    } catch {
      /* ignore */
    }
  },
  /** @param {Entity} e @param {any} s */
  onBirthStart(e, s) {
    setStunned(e, s, false);
  },
  baseDamage,
  chooseAttack,
  runAttack,
  /** @param {Entity} e @param {any} s @param {number} ended */
  onAttackEnd(e, s, ended) {
    if (ended === ANIM.STUN) setStunned(e, s, false);
  },
  /** no healing while it lies stunned @param {any} s */
  canRegen(s) {
    return !s.stunned;
  },
  onPlayerHit,
  notifyBlocked,
  /** @param {Entity} projectile @param {Dimension} dim @param {Vector3} location */
  onProjectileHit(projectile, dim, location) {
    if (projectile.typeId !== ARROW) return false;
    const rec = arrows.get(projectile.id);
    if (rec && !rec[2]) rec[2] = system.currentTick;
    return true;
  },
  /** stuck arrows vanish 2-3 s after landing, strays after 10 s @param {number} tick */
  housekeeping(tick) {
    for (const [id, [arrow, shot, landed]] of arrows) {
      if (!U.isValid(arrow)) {
        arrows.delete(id);
        continue;
      }
      if ((landed && tick - landed > 40) || tick - shot > 200) {
        try {
          arrow.remove();
        } catch {
          /* gone */
        }
        arrows.delete(id);
      }
    }
  },
  corpseSeq: { lootTick: 150, endTick: 300, lootAhead: 6, tick: corpseTick },
  loot,
};
