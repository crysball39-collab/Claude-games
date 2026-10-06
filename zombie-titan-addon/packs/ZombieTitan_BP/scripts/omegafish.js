// Omegafish, the silverfish titan: its head butt, tail swipe, lightning shot,
// tail smash and body slam; burrowing under the ground to get at its prey and
// bursting out beneath it; the explosions it sets off at its enemies' feet when
// it is nearly dead; the arrow stun; loot and its death sequence.
//
// Numbers follow the Java Titans mod (0.45) Omegafish: 8,000 HP, head butt 50,
// tail swipe 50-200, lightning shot 50 (and it sets you burning), tail smash
// 400, body slam 500, 1,000 XP. Below a quarter of its health it glows white
// and explosions go off at its enemies' feet. Its armoured plates turn blades
// and fists: as the mod's own tip says, shoot it with arrows until it flops
// over (six arrows here, or thrown tridents), then attack it. It lies on its
// back for about 19 seconds. Its head attacks hit what is in front of it, its
// tail whatever is beside or behind it, and it burrows to reach far-off prey.
import { system } from "@minecraft/server";
import * as C from "./titan_common.js";
import * as U from "./util.js";
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

const MINION = "zt:silverfish_minion";

const CFG = {
  maxHp: 8000,
  baseAttack: 50,
  walkSpeed: 0.32,
  turnRate: 5,
  meleeRange: 12,
  approachRange: 8,
  targetRange: 80,
  enragedAt: 0.25,
  minionCap: 12,
  minionCapEnraged: 16,
  eggBirthTicks: 200,
  naturalBirthTicks: 860,
  serumBirthTicks: 160,
  xpReward: 1000,
  // it lies on its back for 18.8 s, then rolls over (the stun animation is 20 s)
  stunTicks: 376,
  arrowHits: 6,
  // six short legs scurry: a footfall every 10 ticks, out to the side of its body
  stepPeriod: 10,
  stepPeriodFast: 7,
  footAhead: -1,
  footSide: 5,
  // underground it tunnels this many blocks a tick, for at most burrowTicks
  burrowSpeed: 0.9,
  burrowTicks: 200,
};

const ANIM = {
  NONE: 0, HEADBUTT: 3, TAIL_SWIPE: 4, LIGHTNING: 5, TAIL_SMASH: 6, BODY_SLAM: 7, STUN: C.STUN, BURROW: 9, ERUPT: 10,
  AWAKEN: C.WAKE, BIRTH: C.BIRTH,
};
const DURATION = { 3: 30, 4: 40, 5: 70, 6: 60, 7: 80, 8: 400, 9: CFG.burrowTicks + 20, 10: 30, 11: 60 };
// keep turning toward the target until this tick of each attack (the tail attacks don't turn: the
// tail lashes at whatever is behind it; underground it steers itself)
const TRACK_UNTIL = { 3: 10, 4: 0, 5: 40, 6: 0, 7: 30, 8: 0, 9: 0, 10: 0, 11: 20 };
// the burrow: it noses into the ground for this many ticks before it starts tunnelling
const DIVE = 20;
const SHOT_TYPES = new Set(["minecraft:arrow", "minecraft:thrown_trident"]);
const WHITE = { red: 0.95, green: 0.97, blue: 1.0 };

/** @param {any} s */
function baseDamage(s) {
  return CFG.baseAttack;
}

/** @param {Entity} e @param {any} s @param {boolean} on */
function setStunned(e, s, on) {
  s.stunned = on;
  C.prop(e, s, "zt:stunned", on);
}

/** @param {Entity} e @param {any} s @param {boolean} on */
function setBurrowed(e, s, on) {
  s.burrowed = on;
  C.prop(e, s, "zt:burrowed", on);
}

// =============================================================================
// attacks
// =============================================================================
/** @param {Entity} e @param {any} s @param {Entity} target @param {number} d @param {number} dy @param {number} off @param {number} hp */
function chooseAttack(e, s, target, d, dy, off, hp) {
  const reach = U.bodySize(target).r;
  // something perched out of reach above it gets a lightning shot
  if (dy > 7 && d < 40 && U.chance(1 / 30)) {
    C.startAnim(e, s, ANIM.LIGHTNING);
    return true;
  }
  // in front of it: its head and the front half of its body
  if (off < 40 && d <= CFG.meleeRange + reach && dy < 8) {
    const r = Math.random();
    C.startAnim(e, s, r < 0.55 ? ANIM.HEADBUTT : r < 0.85 ? ANIM.BODY_SLAM : ANIM.LIGHTNING);
    return true;
  }
  // beside or behind it: its tail
  if (off >= 60 && d <= 15 + reach && dy < 8) {
    C.startAnim(e, s, off > 120 && U.chance(0.45) ? ANIM.TAIL_SMASH : ANIM.TAIL_SWIPE);
    return true;
  }
  // farther off: a lightning shot now and then, or it burrows to get at its prey much faster
  if (d > 16 && d < 64 && off < 50 && U.chance(1 / 70)) {
    C.startAnim(e, s, ANIM.LIGHTNING);
    return true;
  }
  if (d > 24 && d < 100 && U.chance(1 / 90)) {
    C.startAnim(e, s, ANIM.BURROW);
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
    case ANIM.HEADBUTT: {
      if (C.crossed(s, 4)) U.sound(dim, "zt.omega.hiss", loc, 2, 1.1);
      if (C.crossed(s, 14)) headButt(e, s, base);
      break;
    }
    case ANIM.TAIL_SWIPE: {
      if (C.crossed(s, 10)) U.sound(dim, "zt.titan.swing", U.offsetFrom(loc, s.yaw, -8), 2, 1.1);
      if (C.crossed(s, 20)) tailSwipe(e, s);
      break;
    }
    case ANIM.LIGHTNING: {
      if (C.crossed(s, 10)) U.sound(dim, "zt.omega.roar", loc, 3, 0.9);
      // the air crackles around its mandibles as it rears
      if (s.t > 20 && s.t < 45 && s.t % 5 === 0) {
        U.particle(dim, "zt:spark_burst", U.offsetFrom(loc, s.yaw, 7, U.rand(-2, 2), U.rand(6, 9)), { color: WHITE });
      }
      if (C.crossed(s, 45) && U.isValid(target)) lightningShot(e, s, target, base);
      break;
    }
    case ANIM.TAIL_SMASH: {
      if (C.crossed(s, 20)) U.sound(dim, "zt.omega.hiss", loc, 3, 0.8);
      if (C.crossed(s, 38)) tailSmash(e, s, base);
      break;
    }
    case ANIM.BODY_SLAM: {
      if (C.crossed(s, 10)) U.sound(dim, "zt.omega.hiss", loc, 3, 0.9);
      if (C.crossed(s, 36)) U.sound(dim, "zt.omega.roar", loc, 4, 0.8);
      if (C.crossed(s, 52)) bodySlam(e, s, base);
      break;
    }
    case ANIM.STUN: {
      if (C.crossed(s, 16)) {
        // it crashes down onto its back
        U.sound(dim, "zt.titan.fall", loc, 4, 1.2);
        U.sound(dim, "zt.omega.hurt", loc, 3, 0.8);
        U.particle(dim, "zt:shockwave_dust", loc, { radius: 10 });
        U.quake(dim, loc, 64, 2.0, 0.8);
      }
      if (s.t > 40 && s.t < CFG.stunTicks && s.t % 50 < 2) U.sound(dim, "zt.omega.hurt", loc, 1.5, 0.7);
      if (C.crossed(s, CFG.stunTicks)) {
        setStunned(e, s, false);
        U.tell(dim, loc, 128, "§6The Omegafish is rolling back over!");
        U.sound(dim, "zt.omega.hiss", loc, 3, 0.8);
      }
      break;
    }
    case ANIM.BURROW:
      burrowTick(e, s, target);
      break;
    case ANIM.ERUPT: {
      if (C.crossed(s, 2)) {
        U.sound(dim, "zt.omega.dig", loc, 4, 0.7);
        U.sound(dim, "zt.omega.roar", loc, 4, 0.9);
      }
      if (C.crossed(s, 5)) erupt(e, s, base);
      break;
    }
    case ANIM.AWAKEN: {
      if (C.crossed(s, 10)) U.sound(dim, "zt.omega.hiss", loc, 4, 0.8);
      if (C.crossed(s, 30)) {
        U.sound(dim, "zt.omega.roar", loc, 4, 0.9);
        U.quake(dim, loc, 64, 1.2, 1.0);
      }
      break;
    }
    default:
      break;
  }
}

/** Head butt: it lunges and rams whatever is in front of its head (Java: 50). */
/** @param {Entity} e @param {any} s @param {number} base */
function headButt(e, s, base) {
  const dim = e.dimension;
  const at = U.offsetFrom(e.location, s.yaw, 7);
  const f = U.forward(s.yaw);
  C.hitZone(e, s, at, 5, -2, 6, base, (v) => U.knock(v, f.x, f.z, 2.4, 0.6));
  U.particle(dim, "zt:shockwave_dust", at, { radius: 4 });
  U.sound(dim, "zt.titan.slam", at, 1.5, 1.4);
  U.quake(dim, at, 32, 0.8, 0.4);
}

/** Tail swipe: its tail lashes across beside and behind it, 50 to 200 damage (Java: Tail Swipe). */
/** @param {Entity} e @param {any} s */
function tailSwipe(e, s) {
  const dim = e.dimension;
  const loc = e.location;
  const f = U.forward(s.yaw);
  for (const v of U.livingAround(dim, loc, 18, { excludeFamilies: ["zt_ally", "inanimate"] })) {
    if (s.hitThisSwing.has(v.id)) continue;
    const rel = U.sub(v.location, loc);
    const ahead = rel.x * f.x + rel.z * f.z;
    // its head and front legs are out of the tail's reach
    if (ahead > 3 || U.dist2D(v.location, loc) > 14 + U.bodySize(v).r) continue;
    if (rel.y < -3 - U.bodySize(v).h || rel.y > 8) continue;
    s.hitThisSwing.add(v.id);
    U.hurt(v, U.randInt(50, 200), e);
    U.knock(v, rel.x, rel.z, 2.6, 0.6);
  }
  const tip = U.offsetFrom(loc, s.yaw, -9);
  U.particle(dim, "zt:shockwave_dust", tip, { radius: 8 });
  U.sound(dim, "zt.titan.slam", tip, 2, 1.2);
}

/** Tail smash: its tail curls up over its back and slams down behind it, 8x (Java: Tail Smash, 400). */
/** @param {Entity} e @param {any} s @param {number} base */
function tailSmash(e, s, base) {
  const dim = e.dimension;
  const at = U.offsetFrom(e.location, s.yaw, -9);
  C.hitZone(e, s, at, 8, -2, 10, base * 8, (v) => {
    const away = U.sub(v.location, at);
    U.knock(v, away.x, away.z, 1.6, 1.0 + Math.random());
  });
  U.particle(dim, "zt:shockwave", at, { radius: 10 });
  U.particle(dim, "zt:shockwave_dust", at, { radius: 8 });
  U.sound(dim, "zt.titan.slam", at, 3, 0.9);
  U.sound(dim, "zt.titan.fall", at, 2, 1.3);
  U.quake(dim, at, 64, 2.2, 0.8);
}

/** Body slam: the whole front of it rears up and crashes down, 10x (Java: Body Slam, 500). */
/** @param {Entity} e @param {any} s @param {number} base */
function bodySlam(e, s, base) {
  const dim = e.dimension;
  const loc = e.location;
  const at = U.offsetFrom(loc, s.yaw, 6);
  C.hitZone(e, s, at, 9, -2, 10, base * 10, (v) => {
    const away = U.sub(v.location, loc);
    U.knock(v, away.x, away.z, 2.0, 0.9);
  });
  U.particle(dim, "zt:shockwave", at, { radius: 14 });
  U.particle(dim, "zt:shockwave_dust", at, { radius: 10 });
  U.sound(dim, "zt.titan.slam", at, 4, 0.8);
  U.sound(dim, "zt.titan.fall", at, 3, 1.0);
  U.quake(dim, at, 80, 3.0, 1.0);
}

/** Lightning shot: a bolt on its prey, which takes 50 and catches fire (Java: Lightning Shot). */
/** @param {Entity} e @param {any} s @param {Entity} target @param {number} base */
function lightningShot(e, s, target, base) {
  const dim = e.dimension;
  const tl = target.location;
  if (U.dist2D(tl, e.location) > 72) return;
  bolt(dim, { x: tl.x, y: tl.y, z: tl.z });
  U.hurt(target, base, e);
  try {
    target.setOnFire(8, true);
  } catch {
    /* can't burn */
  }
  U.particle(dim, "zt:spark_burst", U.offsetFrom(e.location, s.yaw, 9, 0, 3), { color: WHITE });
  U.sound(dim, "zt.creeper.thunder", tl, 3, 1.1);
}

/** @param {Dimension} dim @param {Vector3} at */
function bolt(dim, at) {
  try {
    dim.spawnEntity("minecraft:lightning_bolt", at);
  } catch {
    U.particle(dim, "zt:spark_burst", at, { color: WHITE });
  }
}

// ------------------------------------------------------------------ burrowing
/**
 * It noses down into the ground, then tunnels toward its prey (a rumbling trail of dust is all
 * that shows), and bursts out under it. Nothing can hurt it while it is underground.
 * @param {Entity} e @param {any} s @param {Entity | undefined} target
 */
function burrowTick(e, s, target) {
  const dim = e.dimension;
  const loc = e.location;
  if (C.crossed(s, 6)) U.sound(dim, "zt.omega.hiss", loc, 3, 1.0);
  if (s.t < DIVE) {
    if (s.t % 4 === 0) U.particle(dim, "zt:shockwave_dust", U.offsetFrom(loc, s.yaw, 6), { radius: 3 });
    if (C.crossed(s, 12)) U.sound(dim, "zt.omega.dig", loc, 3, 0.8);
    return;
  }
  if (!s.burrowed) {
    setBurrowed(e, s, true);
    U.particle(dim, "zt:shockwave_dust", loc, { radius: 8 });
    U.sound(dim, "zt.omega.dig", loc, 4, 0.6);
  }
  const fury = s.props["zt:enraged"] ? 1.4 : 1;
  let done = !U.isValid(target) || s.t >= CFG.burrowTicks;
  if (U.isValid(target)) {
    const tl = target.location;
    const d = U.dist2D(tl, loc);
    if (d > CFG.targetRange + 32 || target.dimension.id !== dim.id) done = true;
    else if (d < 3.5) done = true;
    else {
      C.turnToward(e, s, U.yawTo(loc, tl), 12);
      C.followGround(e, s, Math.min(CFG.burrowSpeed * fury, d - 2), s.yaw, false);
    }
  }
  if (s.t % 3 === 0) U.particle(dim, "zt:rumble", loc, { radius: 3 });
  if (s.t % 8 === 0) {
    U.sound(dim, "zt.omega.dig", loc, 2, 0.7);
    U.quake(dim, loc, 24, 0.6, 0.4);
  }
  // a burrow ends with the eruption (onAttackEnd)
  if (done) s.t = DURATION[ANIM.BURROW];
}

/** Bursting out of the ground: everything above it is hurt (3x) and thrown into the air. */
/** @param {Entity} e @param {any} s @param {number} base */
function erupt(e, s, base) {
  const dim = e.dimension;
  const loc = e.location;
  C.hitZone(e, s, loc, 8, -2, 12, base * 3, (v) => {
    const away = U.sub(v.location, loc);
    U.knock(v, away.x, away.z, 1.2, 1.4);
  });
  U.particle(dim, "zt:shockwave", loc, { radius: 10 });
  U.particle(dim, "zt:shockwave_dust", loc, { radius: 9 });
  U.particle(dim, "zt:rumble", loc, { radius: 6 });
  U.sound(dim, "zt.titan.slam", loc, 3, 1.0);
  U.quake(dim, loc, 64, 2.5, 0.8);
}

// ------------------------------------------------------------------ explosions at your feet
/**
 * Below a quarter of its health, now and then the ground under its prey crackles white for a
 * second, then blows up (Java: random explosions at your feet). They break no blocks.
 * @param {Entity} e @param {any} s @param {Entity | undefined} target
 */
function everyTick(e, s, target) {
  const dim = e.dimension;
  for (const b of [...s.blasts]) {
    b.left--;
    if (b.left % 4 === 0) U.particle(dim, "zt:spark_burst", b.at, { color: WHITE });
    if (b.left > 0) continue;
    s.blasts.splice(s.blasts.indexOf(b), 1);
    try {
      dim.createExplosion(b.at, 2.5, { breaksBlocks: false, causesFire: false, source: e });
    } catch {
      U.particle(dim, "minecraft:huge_explosion_emitter", b.at);
    }
  }
  if (!s.props["zt:enraged"] || !target || s.stunned || s.anim === ANIM.STUN || s.blasts.length >= 2) return;
  if (!U.chance(1 / 60)) return;
  const tl = target.location;
  if (U.dist2D(tl, e.location) > 40) return;
  const at = { x: tl.x, y: tl.y, z: tl.z };
  s.blasts.push({ at, left: 20 });
  U.particle(dim, "zt:rumble", at, { radius: 1.5 });
  U.sound(dim, "random.fuse", at, 1.5, 0.7);
}

// =============================================================================
// the arrow stun
// =============================================================================
const tipShown = new Map();
const STUN_TIP =
  "§6Blades and fists can't get through the Omegafish's armour. §eShoot it with §larrows§r§e (or throw tridents) " +
  `${CFG.arrowHits} times: it flops over onto its back, and for about 19 seconds it can be hurt. ` +
  "§7Nothing can hurt it while it is underground.";

/** @param {Player} player @param {string} [actionbarText] */
function tip(player, actionbarText) {
  const now = system.currentTick;
  if ((tipShown.get(player.id) ?? 0) < now) {
    tipShown.set(player.id, now + 400);
    if (actionbarText) U.actionbar(player, actionbarText);
    player.sendMessage(STUN_TIP);
  }
}

/** @param {Entity} e @param {any} s */
function flopOver(e, s) {
  const dim = e.dimension;
  const loc = e.location;
  s.arrowHits = 0;
  C.startAnim(e, s, ANIM.STUN);
  setStunned(e, s, true);
  U.sound(dim, "zt.omega.death", loc, 3, 1.3);
  U.tell(dim, loc, 128, "§e§lIT FLOPS OVER! §r§eThe Omegafish is on its back: §ahit it now, it can be hurt for about 19 seconds!");
}

/** @param {any} s */
function cantBeStunned(s) {
  return s.stunned || s.burrowed || s.props["zt:birth"] || s.anim === ANIM.BURROW || s.anim === ANIM.ERUPT;
}

/** A player hit it with a weapon: it bounces off its plates. */
/** @param {Player} player @param {Entity} titan @param {any} s */
function onPlayerHit(player, titan, s) {
  if (cantBeStunned(s)) return;
  const dim = titan.dimension;
  const at = player.getHeadLocation();
  const f = player.getViewDirection();
  U.particle(dim, "zt:spark_burst", { x: at.x + f.x * 2, y: at.y + f.y * 2, z: at.z + f.z * 2 }, { color: WHITE });
  U.sound(dim, "zt.titan.block", at, 1, 1.2);
  tip(player, "§7Its armoured plates turn your blow! §eShoot it with §larrows§r§e until it flops over.");
}

/** A player's projectile struck it: arrows and tridents count toward flipping it over. */
/** @param {Player} player @param {Entity} titan @param {any} s @param {Vector3} where @param {string} [type] */
function onPlayerShot(player, titan, s, where, type) {
  if (cantBeStunned(s)) return;
  if (type && !SHOT_TYPES.has(type)) {
    tip(player, "§7That bounced off its plates! §eShoot it with §larrows§r§e (or throw a trident).");
    return;
  }
  const now = system.currentTick;
  // a multishot volley counts once
  if (now - (s.shotAt ?? -99) < 5) return;
  s.shotAt = now;
  s.arrowHits = (s.arrowHits ?? 0) + 1;
  const dim = titan.dimension;
  U.sound(dim, "zt.omega.hurt", where, 2, 1.1);
  U.particle(dim, "zt:spark_burst", where, { color: WHITE });
  if (s.arrowHits >= CFG.arrowHits) {
    flopOver(titan, s);
    return;
  }
  U.actionbar(player, `§eArrow hit! §f${s.arrowHits}/${CFG.arrowHits} §7- keep shooting until it flops over!`);
}

/** @param {Player} player @param {Entity} titan @param {any} s */
function notifyBlocked(player, titan, s) {
  if (!s.stunned) tip(player);
}

// =============================================================================
// death sequence (corpse entity, 300 ticks): it writhes, curls up, flops onto
// its back, its legs twitch, and it is still
// =============================================================================
const LOOT = /** @type {Array<[string, number, number]>} */ ([
  // Java: "a whole lot of random stuff, including things associated with silverfish" (stone, the
  // stronghold's stone bricks, paper from its libraries), diamonds, emeralds and harcadium (netherite
  // scrap here)
  ["minecraft:stone", 16, 48],
  ["minecraft:cobblestone", 32, 63],
  ["minecraft:stone_bricks", 16, 31],
  ["minecraft:mossy_stone_bricks", 8, 23],
  ["minecraft:cracked_stone_bricks", 8, 23],
  ["minecraft:paper", 16, 64],
  ["minecraft:iron_ingot", 16, 31],
  ["minecraft:gold_ingot", 8, 15],
  ["minecraft:emerald", 4, 15],
  ["minecraft:diamond", 4, 15],
  ["minecraft:netherite_scrap", 0, 2],
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
    U.sound(dim, "zt.omega.death", loc, 4, 1);
    U.sound(dim, "zt.omega.roar", loc, 3, 0.7);
    U.quake(dim, loc, 64, 1.0, 1.5);
  }
  // it writhes
  if (t > 10 && t < 70 && t % 12 === 0) U.sound(dim, "zt.omega.hurt", loc, 3, 0.6 + Math.random() * 0.2);
  if (t === 100) {
    // it flops onto its back
    U.sound(dim, "zt.titan.fall", loc, 4, 1.2);
    U.quake(dim, loc, 80, 2.2, 1.0);
    U.particle(dim, "zt:shockwave", loc, { radius: 12 });
    U.particle(dim, "zt:shockwave_dust", loc, { radius: 10 });
    for (const v of U.livingAround(dim, loc, 9, { excludeFamilies: ["zt_ally", "inanimate"] })) {
      U.hurt(v, 6, undefined, "fallingBlock");
      const away = U.sub(v.location, loc);
      U.knock(v, away.x, away.z, 1.4, 0.5);
    }
  }
  // Java: its experience bursts out of it in XP bombs
  if (t > 120 && t < 290 && t % 10 === 0) {
    const p = U.offsetFrom(loc, yaw, U.rand(-8, 8), U.rand(-4, 4), U.rand(1, 5));
    U.particle(dim, t % 20 === 0 ? "minecraft:huge_explosion_emitter" : "zt:shockwave_dust", p, t % 20 === 0 ? undefined : { radius: 3 });
    if (t % 30 === 0) U.sound(dim, "random.explode", p, 2, 0.7);
    for (let i = 0; i < 3; i++) {
      try {
        dim.spawnEntity("minecraft:xp_orb", U.offsetFrom(loc, yaw, U.rand(-6, 6), U.rand(-3, 3), 6));
      } catch {
        /* ignore */
      }
    }
  }
}

// =============================================================================
// the type definition titan.js runs
// =============================================================================
export const OMEGAFISH = {
  id: "zt:omegafish",
  name: "Omegafish",
  color: "§7",
  corpse: "zt:omegafish_corpse",
  minion: MINION,
  cfg: CFG,
  duration: DURATION,
  trackUntil: TRACK_UNTIL,
  snd: {
    step: "zt.omega.step", slam: "zt.titan.slam", roar: "zt.omega.roar", fall: "zt.titan.fall",
    quake: "zt.titan.quake", ambient: "zt.omega.ambient",
  },
  enragedText: "It glows white, and explosions burst at its enemies' feet.",
  /** a titan saved on its back or underground starts again on its feet @param {Entity} e @param {any} s */
  init(e, s) {
    s.stunned = false;
    s.burrowed = false;
    s.arrowHits = 0;
    s.blasts = [];
    for (const id of ["zt:stunned", "zt:burrowed"]) {
      s.props[id] = false;
      try {
        e.setProperty(id, false);
      } catch {
        /* ignore */
      }
    }
  },
  /** @param {Entity} e @param {any} s */
  onBirthStart(e, s) {
    setStunned(e, s, false);
    setBurrowed(e, s, false);
    s.arrowHits = 0;
  },
  baseDamage,
  chooseAttack,
  runAttack,
  everyTick,
  /** @param {Entity} e @param {any} s @param {number} ended */
  onAttackEnd(e, s, ended) {
    if (ended === ANIM.STUN) setStunned(e, s, false);
    if (ended === ANIM.BURROW) {
      setBurrowed(e, s, false);
      C.startAnim(e, s, ANIM.ERUPT);
    }
  },
  /** no healing while it lies on its back @param {any} s */
  canRegen(s) {
    return !s.stunned;
  },
  onPlayerHit,
  onPlayerShot,
  notifyBlocked,
  corpseSeq: { lootTick: 150, endTick: 300, lootAhead: 0, tick: corpseTick },
  loot,
};
