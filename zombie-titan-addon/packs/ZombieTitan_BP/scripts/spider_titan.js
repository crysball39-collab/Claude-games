// Spider Titan: its force smash, anti-titan strike, sweep, frontal clap, web
// shot, lightning shot and leaps; the cobwebs it spins over its prey; the
// leg-hit stun; loot and its death sequence.
//
// Numbers follow the Java Titans mod (0.45) Spider Titan: 10,000 HP, 90
// attack damage, 12,000 XP, about 28 blocks across. Players can only hurt it
// while it is stunned: eight hits on its legs (with a weapon or arrows) knock
// it off balance, and it lies flat for 21 seconds. Up close it rears up and
// smashes down (tick 75, 5x damage all around), sweeps a leg across (20) or
// claps its front legs together (25, 2x); anything high above it gets an
// anti-titan strike (12, 4x). Farther off it shoots webs (70) or calls down
// lightning (68), and now and then it leaps at its prey. Like the Java one it
// spins cobwebs around whatever it hunts; here they melt away after 30 s.
import { system, world } from "@minecraft/server";
import * as C from "./titan_common.js";
import * as U from "./util.js";
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

const MINION = "zt:spider_minion";
const WEB = "minecraft:web";

const CFG = {
  maxHp: 10000,
  baseAttack: 90,
  walkSpeed: 0.34,
  turnRate: 4,
  meleeRange: 24,
  approachRange: 12,
  targetRange: 80,
  enragedAt: 0.25,
  minionCap: 10,
  minionCapEnraged: 14,
  eggBirthTicks: 200,
  naturalBirthTicks: 860,
  serumBirthTicks: 160,
  xpReward: 12000,
  stunTicks: 420,
  legHits: 8,
  // eight legs patter: a footfall every 12 ticks, far out to the side
  stepPeriod: 12,
  stepPeriodFast: 8,
  footAhead: 3,
  footSide: 13,
};

const ANIM = {
  NONE: 0, SMASH: 3, ANTI_AIR: 4, SWEEP: 5, WEB: 6, LIGHTNING: 7, STUN: C.STUN, CLAP: 9,
  AWAKEN: C.WAKE, BIRTH: C.BIRTH, LEAP: C.LEAP,
};
const DURATION = { 3: 100, 4: 30, 5: 50, 6: 140, 7: 140, 8: 520, 9: 40, 11: 60, 14: 50 };
// keep turning toward the target until this tick of each attack
const TRACK_UNTIL = { 3: 40, 4: 12, 5: 20, 6: 70, 7: 68, 8: 0, 9: 25, 11: 20, 14: 11 };

/** cobwebs it spun: "dim|x,y,z" -> [dimension, location, tick spun] @type {Map<string, [Dimension, Vector3, number]>} */
const webs = new Map();
const WEB_LIFE = 600;

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
  if (d <= CFG.meleeRange + U.bodySize(target).r && off < 45) {
    // titans, dragons and anything perched above its eyes get the anti-titan strike
    if (dy > 10 || isTall(target)) {
      C.startAnim(e, s, ANIM.ANTI_AIR);
      return true;
    }
    switch (U.randInt(0, 2)) {
      case 0:
        C.startAnim(e, s, U.chance(1 / 3) ? ANIM.SMASH : ANIM.SWEEP);
        break;
      case 1:
        C.startAnim(e, s, ANIM.CLAP);
        break;
      default:
        C.startAnim(e, s, ANIM.SWEEP);
    }
    return true;
  }
  // out of reach: a web or a lightning shot now and then, or a leap at its prey
  if (d > 16 && d < 64 && U.chance(1 / 60)) {
    C.startAnim(e, s, U.chance(0.5) ? ANIM.WEB : ANIM.LIGHTNING);
    return true;
  }
  if (d > 20 && d < 60 && U.chance(1 / 150)) {
    C.startAnim(e, s, ANIM.LEAP);
    return true;
  }
  return false;
}

/** @param {Entity} e @param {any} s @param {Entity | undefined} target */
function runAttack(e, s, target) {
  const dim = e.dimension;
  const loc = e.location;
  const base = baseDamage(s);
  switch (s.anim) {
    case ANIM.SMASH: {
      if (C.crossed(s, 10)) U.sound(dim, "zt.spider.hiss", loc, 3, 0.8);
      if (C.crossed(s, 45)) U.sound(dim, "zt.spider.roar", loc, 3, 0.9);
      if (C.crossed(s, 75)) forceSmash(e, s, base);
      break;
    }
    case ANIM.ANTI_AIR: {
      if (C.crossed(s, 6)) U.sound(dim, "zt.spider.hiss", loc, 2, 1.2);
      if (C.crossed(s, 12) && U.isValid(target)) antiTitan(e, s, target, base);
      break;
    }
    case ANIM.SWEEP: {
      if (C.crossed(s, 14)) U.sound(dim, "zt.titan.swing", loc, 2, 1.0);
      if (C.crossed(s, 20) && U.isValid(target)) sweep(e, s, target, base);
      break;
    }
    case ANIM.WEB: {
      if (C.crossed(s, 20)) U.sound(dim, "zt.spider.hiss", loc, 2, 0.7);
      if (C.crossed(s, 70) && U.isValid(target)) webShot(e, s, target, base);
      break;
    }
    case ANIM.LIGHTNING: {
      if (C.crossed(s, 24)) U.sound(dim, "zt.spider.roar", loc, 3, 0.8);
      // the air crackles around its raised legs
      if (s.t > 30 && s.t < 66 && s.t % 6 === 0) {
        U.particle(dim, "zt:spark_burst", U.offsetFrom(loc, s.yaw, 10, U.rand(-6, 6), 22), { color: { red: 0.6, green: 0.8, blue: 1.0 } });
      }
      if (C.crossed(s, 68) && U.isValid(target)) lightningShot(e, s, target, base);
      break;
    }
    case ANIM.CLAP: {
      if (C.crossed(s, 16)) U.sound(dim, "zt.titan.swing", loc, 2, 0.8);
      if (C.crossed(s, 25)) frontalClap(e, s, base);
      break;
    }
    case ANIM.STUN: {
      if (C.crossed(s, 28)) {
        // it crashes down onto its belly
        U.sound(dim, "zt.titan.fall", loc, 4, 1.1);
        U.sound(dim, "zt.spider.death", loc, 3, 1.3);
        U.particle(dim, "zt:shockwave_dust", loc, { radius: 16 });
        U.quake(dim, loc, 80, 2.5, 1.0);
      }
      if (s.t > 60 && s.t < CFG.stunTicks && s.t % 50 < 2) U.sound(dim, "zt.spider.hurt", loc, 1.5, 0.7);
      if (C.crossed(s, CFG.stunTicks)) {
        setStunned(e, s, false);
        U.tell(dim, loc, 128, "§6The Spider Titan is getting back up!");
        U.sound(dim, "zt.spider.hiss", loc, 3, 0.7);
      }
      break;
    }
    case ANIM.AWAKEN: {
      if (C.crossed(s, 10)) U.sound(dim, "zt.spider.hiss", loc, 4, 0.7);
      if (C.crossed(s, 30)) {
        U.sound(dim, "zt.spider.roar", loc, 4, 0.8);
        U.quake(dim, loc, 64, 1.5, 1.0);
      }
      break;
    }
    default:
      break;
  }
}

/** Force smash: everything around it takes 5x and is flung into the air (Java: Attack, 32 blocks). */
/** @param {Entity} e @param {any} s @param {number} base */
function forceSmash(e, s, base) {
  const dim = e.dimension;
  const loc = e.location;
  const radius = 26;
  C.hitZone(e, s, loc, radius, -2, 16, base * 5, (v) => {
    const away = U.sub(v.location, loc);
    U.knock(v, away.x, away.z, 1.2, 1.0 + Math.random() + Math.random());
  });
  U.particle(dim, "zt:shockwave", loc, { radius });
  U.particle(dim, "zt:shockwave_dust", U.offsetFrom(loc, s.yaw, 8), { radius: 14 });
  U.sound(dim, "zt.titan.slam", loc, 4, 0.75);
  U.sound(dim, "zt.titan.fall", loc, 3, 1.0);
  U.quake(dim, loc, 100, 3.5, 1.2);
}

/** Anti-titan strike: whatever is perched above it takes 4x, its neighbours 2x (Java: AntiTitanAttack). */
/** @param {Entity} e @param {any} s @param {Entity} target @param {number} base */
function antiTitan(e, s, target, base) {
  const dim = e.dimension;
  const loc = e.location;
  const tl = target.location;
  if (U.dist2D(tl, loc) > CFG.meleeRange + 12 || tl.y - loc.y > 40) return;
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
  U.sound(dim, "zt.titan.slam", tl, 2, 1.3);
}

/** Sweep: a front leg swings across, hitting the target and everything within 6 of it (Java: Attack2). */
/** @param {Entity} e @param {any} s @param {Entity} target @param {number} base */
function sweep(e, s, target, base) {
  const dim = e.dimension;
  const loc = e.location;
  const tl = target.location;
  if (U.dist2D(tl, loc) > CFG.meleeRange + 8 || Math.abs(tl.y - loc.y) > 20) return;
  const side = U.rightOf(s.yaw);
  C.hitZone(e, s, tl, 6, -3, 8, base, (v) => U.knock(v, -side.x, -side.z, 2.6, 0.6));
  U.particle(dim, "zt:shockwave_dust", tl, { radius: 6 });
  U.sound(dim, "zt.titan.slam", tl, 1.5, 1.3);
}

/** Frontal clap: its front legs slam together in front of it, 2x damage (Java: Attack3). */
/** @param {Entity} e @param {any} s @param {number} base */
function frontalClap(e, s, base) {
  const dim = e.dimension;
  const loc = e.location;
  const at = U.offsetFrom(loc, s.yaw, 10);
  C.hitZone(e, s, at, 12, -2, 12, base * 2, (v) => {
    const away = U.sub(v.location, loc);
    U.knock(v, away.x, away.z, 2.4, 0.8);
  });
  U.particle(dim, "zt:shockwave", at, { radius: 12 });
  U.sound(dim, "zt.titan.slam", at, 3, 1.1);
  U.quake(dim, at, 64, 2.0, 0.6);
}

/** Where the web comes from: its abdomen is curled up over its back. @param {Entity} e @param {any} s */
function spinneret(e, s) {
  return U.offsetFrom(e.location, s.yaw, 1, 0, 20);
}

/** Web shot: a strand of web hits the target (1x) and cobwebs bloom all around it (Java: ShootWeb). */
/** @param {Entity} e @param {any} s @param {Entity} target @param {number} base */
function webShot(e, s, target, base) {
  const dim = e.dimension;
  const tl = target.location;
  const from = spinneret(e, s);
  const to = { x: tl.x, y: tl.y + 1, z: tl.z };
  const dir = U.sub(to, from);
  const len = U.len(dir);
  if (len > 72) return;
  U.particle(dim, "zt:web_strand", from, { dir: U.norm(dir), len });
  U.particle(dim, "zt:web_burst", to);
  U.sound(dim, "zt.spider.web", from, 3, 0.9);
  U.sound(dim, "zt.spider.web_hit", to, 2, 1.0);
  U.hurt(target, base, e);
  try {
    target.addEffect("slowness", 100, { amplifier: 2 });
  } catch {
    /* not a mob */
  }
  if (!world.gameRules.mobGriefing) return;
  const bx = Math.floor(tl.x);
  const by = Math.floor(tl.y);
  const bz = Math.floor(tl.z);
  const x0 = -1 - U.randInt(0, 2);
  const x1 = 1 + U.randInt(0, 2);
  const z0 = -1 - U.randInt(0, 2);
  const z1 = 1 + U.randInt(0, 2);
  const h = 2 + U.randInt(0, 1);
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      for (let y = 0; y <= h; y++) spinWeb(dim, { x: bx + x, y: by + y, z: bz + z });
    }
  }
}

/** A cobweb in an empty block, remembered so it can melt away later. @param {Dimension} dim @param {Vector3} p */
function spinWeb(dim, p) {
  if (!U.inWorld(dim, p.y)) return false;
  try {
    const b = dim.getBlock(p);
    if (!b || !b.isAir) return false;
    dim.setBlockType(p, WEB);
    webs.set(dim.id + "|" + p.x + "," + p.y + "," + p.z, [dim, p, system.currentTick]);
    return true;
  } catch {
    return false;
  }
}

/** Lightning shot: blasts and bolts on the target and everything within 6 of it (Java: ShootLightning). */
/** @param {Entity} e @param {any} s @param {Entity} target @param {number} base */
function lightningShot(e, s, target, base) {
  const dim = e.dimension;
  const loc = e.location;
  const tl = target.location;
  if (U.dist2D(tl, loc) > 72) return;
  const victims = [target, ...U.livingAround(dim, tl, 6, { excludeFamilies: ["zt_ally", "inanimate"] }).filter((v) => v.id !== target.id)];
  // a bolt in front of it, where its legs came down
  bolt(dim, U.offsetFrom(loc, s.yaw, 12));
  explode(dim, U.offsetFrom(loc, s.yaw, -2, 0, 8), 1, e);
  for (const v of victims) {
    const at = { x: v.location.x, y: v.location.y, z: v.location.z };
    bolt(dim, at);
    explode(dim, at, 2, e);
    U.hurt(v, base * 2, e);
  }
  try {
    target.applyImpulse({ x: 0, y: 1.2, z: 0 });
  } catch {
    U.knock(target, 0, 0, 0, 1.2);
  }
  U.sound(dim, "zt.creeper.thunder", tl, 3, 1.0);
}

/** @param {Dimension} dim @param {Vector3} at */
function bolt(dim, at) {
  try {
    dim.spawnEntity("minecraft:lightning_bolt", at);
  } catch {
    U.particle(dim, "zt:spark_burst", at, { color: { red: 0.6, green: 0.8, blue: 1.0 } });
  }
}

/** @param {Dimension} dim @param {Vector3} at @param {number} power @param {Entity} source */
function explode(dim, at, power, source) {
  try {
    dim.createExplosion(at, power, { breaksBlocks: false, causesFire: false, source });
  } catch {
    U.particle(dim, "minecraft:huge_explosion_emitter", at);
  }
}

/** Java: now and then it spins a cobweb right where its prey stands (or slows it if it can't). */
/** @param {Entity} e @param {any} s @param {Entity | undefined} target */
function everyTick(e, s, target) {
  if (!target || s.stunned || s.anim === ANIM.STUN || !U.chance(1 / 80)) return;
  const tl = target.location;
  if (U.dist2D(tl, e.location) > 48) return;
  const p = { x: Math.floor(tl.x + U.rand(0, 2)), y: Math.floor(tl.y + U.rand(0, 2)), z: Math.floor(tl.z + U.rand(0, 2)) };
  if (world.gameRules.mobGriefing && spinWeb(e.dimension, p)) {
    U.particle(e.dimension, "zt:web_burst", { x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 });
    U.sound(e.dimension, "zt.spider.web_hit", p, 1, 1.2);
    return;
  }
  try {
    target.addEffect("slowness", 100, { amplifier: 2 });
  } catch {
    /* ignore */
  }
}

// =============================================================================
// the leg-hit stun
// =============================================================================
/**
 * Which part of the spider a point (where a blow or an arrow struck) is at: its head is 8 blocks
 * wide, its abdomen 10, and the legs fan out on both sides of them.
 * @param {Entity} e @param {any} s @param {Vector3} p @returns {"head" | "legs" | "abdomen" | "body"}
 */
export function partAt(e, s, p) {
  const loc = e.location;
  const f = U.forward(s.yaw);
  const r = U.rightOf(s.yaw);
  const dx = p.x - loc.x;
  const dz = p.z - loc.z;
  const ahead = dx * f.x + dz * f.z;
  const side = Math.abs(dx * r.x + dz * r.z);
  if (side >= 5 || (side >= 4 && ahead > -3)) return "legs";
  if (ahead > 3) return "head";
  if (ahead < -3) return "abdomen";
  return "body";
}

/**
 * Where a player's blow lands: a couple of blocks along their line of sight, about the reach of an
 * arm (the titan's box is square and doesn't turn with it, so its edge can't tell head from leg).
 * @param {Player} player @returns {Vector3}
 */
export function blowAt(player) {
  const eye = player.getHeadLocation();
  const dir = player.getViewDirection();
  return { x: eye.x + dir.x * 2.5, y: eye.y + dir.y * 2.5, z: eye.z + dir.z * 2.5 };
}

const tipShown = new Map();
const STUN_TIP =
  "§6Players can't hurt the Spider Titan while it stands. §eHit its §llegs§r§e 8 times (aim at them beside its " +
  "head and body, or shoot them with arrows): it loses its balance and collapses, and for 21 seconds it can be hurt. " +
  "§7Tip: get beside it while it is busy attacking.";

/** @param {Player} player @param {string} [actionbarText] */
function tip(player, actionbarText) {
  const now = system.currentTick;
  if ((tipShown.get(player.id) ?? 0) < now) {
    tipShown.set(player.id, now + 400);
    if (actionbarText) U.actionbar(player, actionbarText);
    player.sendMessage(STUN_TIP);
  }
}

/** @param {Player} player @param {Entity} titan @param {any} s @param {Vector3} where */
function legHit(player, titan, s, where) {
  const now = system.currentTick;
  // a multishot volley or a sweep that lands twice counts once
  if (now - (s.legHitAt ?? -99) < 5) return;
  s.legHitAt = now;
  s.legHits = (s.legHits ?? 0) + 1;
  const dim = titan.dimension;
  U.sound(dim, "zt.spider.hurt", where, 2, 1.0);
  U.particle(dim, "zt:spark_burst", { x: where.x, y: where.y + 1, z: where.z }, { color: { red: 0.55, green: 0.42, blue: 0.3 } });
  if (s.legHits >= CFG.legHits) {
    knockDown(titan, s);
    return;
  }
  U.actionbar(player, `§eLeg hit! §f${s.legHits}/${CFG.legHits} §7- keep hitting its legs!`);
}

/** @param {Entity} e @param {any} s */
function knockDown(e, s) {
  const dim = e.dimension;
  const loc = e.location;
  s.legHits = 0;
  C.startAnim(e, s, ANIM.STUN);
  setStunned(e, s, true);
  U.sound(dim, "zt.spider.death", loc, 3, 1.2);
  U.tell(dim, loc, 128, "§e§lITS LEGS GIVE WAY! §r§eThe Spider Titan collapses: §ahit it now, it can be hurt for 21 seconds!");
}

/** A player hit it with a weapon: on a leg it counts, anywhere else it bounces off. */
/** @param {Player} player @param {Entity} titan @param {any} s */
function onPlayerHit(player, titan, s) {
  if (s.stunned || s.props["zt:birth"]) return;
  const at0 = blowAt(player);
  if (partAt(titan, s, at0) === "legs") {
    legHit(player, titan, s, at0);
    return;
  }
  const dim = titan.dimension;
  const at = player.getHeadLocation();
  const f = player.getViewDirection();
  U.particle(dim, "zt:spark_burst", { x: at.x + f.x * 2, y: at.y + f.y * 2, z: at.z + f.z * 2 }, { color: { red: 0.5, green: 0.42, blue: 0.36 } });
  U.sound(dim, "zt.titan.block", at, 1, 1.1);
  tip(player, "§7Its armoured body shrugs that off! §eHit its §llegs§r§e to knock it down.");
}

/** A player's arrow (or trident) struck it at `where`. */
/** @param {Player} player @param {Entity} titan @param {any} s @param {Vector3} where */
function onPlayerShot(player, titan, s, where) {
  if (s.stunned || s.props["zt:birth"]) return;
  if (partAt(titan, s, where) === "legs") legHit(player, titan, s, where);
  else tip(player, "§7That glanced off its body! §eShoot its §llegs§r§e to knock it down.");
}

/** @param {Player} player @param {Entity} titan @param {any} s */
function notifyBlocked(player, titan, s) {
  if (!s.stunned) tip(player);
}

// =============================================================================
// death sequence (corpse entity, 300 ticks): its legs give way, it crashes down,
// then rolls onto its back with its legs curled up
// =============================================================================
const LOOT = /** @type {Array<[string, number, number]>} */ ([
  // Java 0.45: 256-511 string, 64-127 spider eyes, 24-47 fermented ones, cobwebs, leather, iron, coal,
  // mossy cobblestone, 8-15 emeralds and diamonds, and up to 3 harcadium (netherite scrap here)
  ["minecraft:string", 256, 511],
  ["minecraft:spider_eye", 64, 127],
  ["minecraft:fermented_spider_eye", 24, 47],
  ["minecraft:web", 24, 47],
  ["minecraft:leather", 36, 71],
  ["minecraft:iron_ingot", 48, 95],
  ["minecraft:coal", 32, 63],
  ["minecraft:mossy_cobblestone", 24, 47],
  ["minecraft:emerald", 8, 15],
  ["minecraft:diamond", 8, 15],
  ["minecraft:netherite_scrap", 0, 3],
]);

/** @param {any} c */
function loot(c) {
  return C.rollLoot(LOOT);
}

/** @param {any} c */
function corpseTick(c) {
  const dim = c.entity.dimension;
  const loc = c.loc;
  const yaw = c.yaw;
  const t = c.t;
  if (t === 1) {
    U.sound(dim, "zt.spider.death", loc, 4, 1);
    U.sound(dim, "zt.spider.roar", loc, 3, 0.7);
    U.quake(dim, loc, 80, 1.2, 1.5);
  }
  if (t === 50) {
    // its legs give way and it crashes down
    U.sound(dim, "zt.titan.fall", loc, 5, 1.1);
    U.quake(dim, loc, 100, 3, 1.2);
    U.particle(dim, "zt:shockwave", loc, { radius: 18 });
    U.particle(dim, "zt:shockwave_dust", loc, { radius: 16 });
    for (const v of U.livingAround(dim, loc, 12, { excludeFamilies: ["zt_ally", "inanimate"] })) {
      U.hurt(v, 6, undefined, "fallingBlock");
      const away = U.sub(v.location, loc);
      U.knock(v, away.x, away.z, 1.6, 0.6);
    }
  }
  if (t === 112) {
    // it rolls over onto its back
    U.sound(dim, "zt.titan.fall", loc, 4, 0.9);
    U.sound(dim, "zt.spider.hurt", loc, 3, 0.5);
    U.quake(dim, loc, 80, 2, 0.8);
    U.particle(dim, "zt:shockwave_dust", U.offsetFrom(loc, yaw, 0, 6), { radius: 12 });
  }
  if (t > 130 && t < 290 && t % 10 === 0) {
    const p = U.offsetFrom(loc, yaw, U.rand(-8, 8), U.rand(-8, 8), U.rand(1, 6));
    U.particle(dim, t % 20 === 0 ? "minecraft:huge_explosion_emitter" : "zt:web_burst", p);
    if (t % 30 === 0) U.sound(dim, "random.explode", p, 2, 0.6);
    for (let i = 0; i < 3; i++) {
      try {
        dim.spawnEntity("minecraft:xp_orb", U.offsetFrom(loc, yaw, U.rand(-6, 6), U.rand(-6, 6), 8));
      } catch {
        /* ignore */
      }
    }
  }
}

// =============================================================================
// the type definition titan.js runs
// =============================================================================
export const SPIDER_TITAN = {
  id: "zt:spider_titan",
  name: "Spider Titan",
  color: "§8",
  corpse: "zt:spider_titan_corpse",
  minion: MINION,
  cfg: CFG,
  duration: DURATION,
  trackUntil: TRACK_UNTIL,
  snd: {
    step: "zt.spider.step", slam: "zt.titan.slam", roar: "zt.spider.roar", fall: "zt.titan.fall",
    quake: "zt.titan.quake", ambient: "zt.spider.ambient",
  },
  enragedText: "It flashes red with fury: it moves and strikes faster.",
  /** a titan saved mid-stun gets up again (its animation restarts after a reload) @param {Entity} e @param {any} s */
  init(e, s) {
    s.stunned = false;
    s.legHits = 0;
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
    s.legHits = 0;
  },
  baseDamage,
  chooseAttack,
  runAttack,
  everyTick,
  /** @param {Entity} e @param {any} s @param {number} ended */
  onAttackEnd(e, s, ended) {
    if (ended === ANIM.STUN) setStunned(e, s, false);
  },
  /** no healing while it lies stunned @param {any} s */
  canRegen(s) {
    return !s.stunned;
  },
  onPlayerHit,
  onPlayerShot,
  notifyBlocked,
  /** its cobwebs melt away after 30 seconds @param {number} tick */
  housekeeping(tick) {
    for (const [key, [dim, p, at]] of webs) {
      if (tick - at < WEB_LIFE) continue;
      webs.delete(key);
      try {
        if (dim.getBlock(p)?.typeId === WEB) dim.setBlockType(p, "minecraft:air");
      } catch {
        /* chunk unloaded: it stays */
      }
    }
  },
  corpseSeq: { lootTick: 150, endTick: 300, lootAhead: 0, tick: corpseTick },
  loot,
};

/** cobwebs the titans spun that haven't melted yet (for tests) */
export function websSpun() {
  return webs.size;
}
