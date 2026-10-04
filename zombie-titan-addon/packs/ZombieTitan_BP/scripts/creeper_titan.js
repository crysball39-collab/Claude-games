// Creeper Titan: head slam, stomps, body slam, kick, anti-air strike, TNT rain,
// thunder clap and lightning; the head-hit stun; and its slow death blast.
//
// Numbers follow the Java Titans mod (0.45) Creeper Titan: 26 blocks tall,
// 25,000 HP, 180 attack damage, 50,000 XP. Explosions and lightning never hurt
// it, and players can only hurt it while it is stunned: hit its head while it
// is down at the ground after a Head Slam, Body Slam or Thunder Clap and it
// keels over for 23 seconds. Below a quarter of its health it becomes charged
// (Java's Charged Creeper Titan): faster, more lightning, twice the TNT. When it
// dies it topples over, its fuse lights, and it swells and flashes for ten
// seconds before it blows up.
import { system, world } from "@minecraft/server";
import * as C from "./titan_common.js";
import * as U from "./util.js";
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

const MINION = "zt:creeper_minion";

const CFG = {
  maxHp: 25000,
  baseAttack: 180,
  walkSpeed: 0.26,
  turnRate: 3.5,
  meleeRange: 30,
  approachRange: 16,
  targetRange: 80,
  enragedAt: 0.25,
  minionCap: 8,
  minionCapEnraged: 12,
  eggBirthTicks: 200,
  naturalBirthTicks: 860,
  serumBirthTicks: 160,
  xpReward: 50000,
  stunTicks: 460,
};

const ANIM = {
  NONE: 0, HEAD_SLAM: 1, STOMP: 2, BODY_SLAM: 3, ANTI_AIR: 4, KICK: 5, TNT: 6, THUNDER: 7,
  STUN: C.STUN, AWAKEN: C.WAKE, BIRTH: C.BIRTH, LEAP: C.LEAP,
};
const DURATION = { 1: 90, 2: 150, 3: 170, 4: 30, 5: 60, 6: 60, 7: 230, 8: 520, 11: 60, 14: 50 };
// keep turning toward the target until this tick of each attack (the aim locks before a blow lands)
const TRACK_UNTIL = { 1: 20, 2: 60, 3: 60, 4: 12, 5: 20, 6: 40, 7: 80, 8: 0, 11: 20, 14: 11 };
// its head lies on the ground for these ticks after a slam: a hit on it then knocks the titan out
const HEAD_DOWN = { 1: [32, 80], 3: [90, 130], 7: [100, 135] };

/** @param {any} s */
function baseDamage(s) {
  return s.props["zt:enraged"] ? CFG.baseAttack * 2 : CFG.baseAttack;
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
    // anything perched 6+ blocks up, or another giant, gets an anti-air strike
    if (dy > 6 || isTall(target)) {
      C.startAnim(e, s, ANIM.ANTI_AIR);
      return true;
    }
    C.startAnim(e, s, [ANIM.HEAD_SLAM, ANIM.STOMP, ANIM.BODY_SLAM, ANIM.KICK][U.randInt(0, 3)]);
    return true;
  }
  // out of reach: rain TNT down on the target, or rear up for a thunder clap
  if (d > CFG.meleeRange && U.chance(1 / 100)) {
    C.startAnim(e, s, U.chance(0.5) ? ANIM.TNT : ANIM.THUNDER);
    return true;
  }
  if (d > 24 && d < 70 && U.chance(1 / 300)) {
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
    case ANIM.HEAD_SLAM: {
      if (C.crossed(s, 12)) U.sound(dim, "zt.creeper.hiss", loc, 3, 0.9);
      if (C.crossed(s, 32)) {
        headImpact(e, s, 11, 9, base * 2);
        if (U.isValid(target)) lightningStrike(e, s, target.location);
      }
      break;
    }
    case ANIM.STOMP: {
      if (C.crossed(s, 60)) C.stomp(e, s, -1, base);
      if (C.crossed(s, 104)) C.stomp(e, s, 1, base);
      break;
    }
    case ANIM.BODY_SLAM: {
      if (C.crossed(s, 40)) U.sound(dim, "zt.creeper.hiss", loc, 3, 0.7);
      if (C.crossed(s, 90)) {
        headImpact(e, s, 13, 12, base * 2, true);
        U.sound(dim, "zt.titan.fall", loc, 4, 1.0);
      }
      break;
    }
    case ANIM.ANTI_AIR: {
      if (C.crossed(s, 6)) U.sound(dim, "zt.titan.swing", loc, 2, 1.2);
      if (C.crossed(s, 12) && U.isValid(target)) antiAir(e, s, target, base);
      break;
    }
    case ANIM.KICK: {
      if (C.crossed(s, 22)) U.sound(dim, "zt.titan.swing", loc, 2, 0.9);
      if (C.crossed(s, 30)) {
        const foot = U.offsetFrom(loc, yaw, 10, -4, 0);
        C.hitZone(e, s, foot, 8, -2, 8, base, (v) => {
          const away = U.sub(v.location, loc);
          U.knock(v, away.x, away.z, 3.2, 0.9);
        });
        U.particle(dim, "zt:shockwave_dust", foot, { radius: 6 });
        U.sound(dim, "zt.titan.slam", foot, 2, 1.2);
      }
      break;
    }
    case ANIM.TNT: {
      if (C.crossed(s, 10)) U.sound(dim, "zt.creeper.hiss", loc, 4, 0.8);
      if (C.crossed(s, 40) && U.isValid(target)) tntRain(e, s, target);
      break;
    }
    case ANIM.THUNDER: {
      if (C.crossed(s, 50)) U.sound(dim, "zt.creeper.thunder", loc, 3, 1.2);
      if (C.crossed(s, 95)) U.sound(dim, "zt.titan.swing", loc, 3, 0.6);
      if (C.crossed(s, 100)) {
        // the clap: lightning on the target, a blast where the head comes down
        if (U.isValid(target)) lightningStrike(e, s, target.location);
        const ahead = U.offsetFrom(loc, yaw, 12, 0, 10);
        explode(dim, ahead, s.props["zt:enraged"] ? 5 : 3, false, e);
        headImpact(e, s, 10, 12, base * 2);
        U.sound(dim, "zt.creeper.thunder", loc, 4, 0.9);
      }
      if (C.crossed(s, 150)) {
        s.hitThisSwing.clear();
        headImpact(e, s, 13, 14, base * 2, true);
        U.sound(dim, "zt.titan.fall", loc, 4, 1.0);
      }
      break;
    }
    case ANIM.STUN: {
      if (C.crossed(s, 20)) U.sound(dim, "zt.creeper.hurt", loc, 3, 0.6);
      if (C.crossed(s, 112)) {
        // it rolls over onto its side
        U.sound(dim, "zt.titan.fall", loc, 4, 1.1);
        U.particle(dim, "zt:shockwave_dust", U.offsetFrom(loc, yaw, 0, -10, 0), { radius: 14 });
        U.quake(dim, loc, 80, 2.5, 1.0);
      }
      if (s.t > 130 && s.t < CFG.stunTicks && s.t % 50 < 2) U.sound(dim, "zt.creeper.hurt", loc, 1.5, 0.5);
      if (C.crossed(s, CFG.stunTicks)) {
        setStunned(e, s, false);
        U.tell(dim, loc, 128, "§6The Creeper Titan is getting back up!");
        U.sound(dim, "zt.creeper.hiss", loc, 3, 0.7);
      }
      break;
    }
    case ANIM.AWAKEN: {
      if (C.crossed(s, 8)) U.sound(dim, "zt.creeper.hiss", loc, 4, 0.7);
      if (C.crossed(s, 28)) {
        U.sound(dim, "zt.creeper.ambient", loc, 4, 0.6);
        U.quake(dim, loc, 64, 1.5, 1.0);
      }
      break;
    }
    default:
      break;
  }
}

/** The head (or the whole body) crashes into the ground `ahead` blocks in front of it. */
/** @param {Entity} e @param {any} s @param {number} ahead @param {number} radius @param {number} damage @param {boolean} [lift] */
function headImpact(e, s, ahead, radius, damage, lift) {
  const dim = e.dimension;
  const impact = U.offsetFrom(e.location, s.yaw, ahead, 0, 0);
  C.hitZone(e, s, impact, radius, -2, 8, damage, (v) => {
    const away = U.sub(v.location, impact);
    U.knock(v, away.x, away.z, 1.6, lift ? 1.6 + Math.random() : 0.8);
  });
  U.particle(dim, "zt:shockwave", impact, { radius: radius + 4 });
  U.particle(dim, "zt:shockwave_dust", impact, { radius });
  U.sound(dim, "zt.titan.slam", impact, 4, 0.8);
  U.quake(dim, impact, 90, 3, 1.0);
}

/** Anti-air strike: whatever is above it takes 4x, its neighbours 2x (Java: AntiTitanAttack). */
/** @param {Entity} e @param {any} s @param {Entity} target @param {number} base */
function antiAir(e, s, target, base) {
  const dim = e.dimension;
  const loc = e.location;
  const tl = target.location;
  if (U.dist2D(tl, loc) > 36 || tl.y - loc.y > 40) return;
  U.hurt(target, base * 4, e);
  const away = U.sub(tl, loc);
  U.knock(target, away.x, away.z, 3, 0.9);
  for (const v of U.livingAround(dim, tl, 8, { excludeFamilies: ["zt_ally", "inanimate"] })) {
    if (v.id === target.id) continue;
    U.hurt(v, base * 2, e);
  }
  U.particle(dim, "minecraft:huge_explosion_emitter", tl);
  U.sound(dim, "zt.titan.slam", tl, 2, 1.3);
}

/** @param {Dimension} dim @param {Vector3} at @param {number} radius @param {boolean} breaks @param {Entity} [source] */
function explode(dim, at, radius, breaks, source) {
  try {
    dim.createExplosion(at, radius, { breaksBlocks: breaks, causesFire: false, source });
  } catch {
    U.particle(dim, "minecraft:huge_explosion_emitter", at);
    U.sound(dim, "zt.creeper.pop", at, 2, 1);
  }
}

// ------------------------------------------------------------------ lightning
/**
 * Java's lightning attack: bolts and blasts at the target (49 damage, no blocks
 * broken). Bedrock gives a one-second warning: the air crackles where it will strike.
 * @param {Entity} e @param {any} s @param {Vector3} at
 */
function lightningStrike(e, s, at) {
  const dim = e.dimension;
  const power = s.props["zt:enraged"] ? 5 : 3;
  try {
    dim.spawnEntity("minecraft:lightning_bolt", at);
  } catch {
    /* ignore */
  }
  explode(dim, at, power, false, e);
  explode(dim, { x: at.x, y: at.y + 12, z: at.z }, power, false, e);
  for (const v of U.livingAround(dim, at, 4, { excludeFamilies: ["zt_ally", "inanimate"] })) U.hurt(v, 49, e, "lightning");
  U.particle(dim, "zt:spark_burst", { x: at.x, y: at.y + 1, z: at.z }, { color: { red: 0.55, green: 0.8, blue: 1.0 } });
  U.sound(dim, "zt.creeper.thunder", at, 3, 1.1);
}

/** Now and then, without stopping what it is doing, it calls lightning down on its target. */
/** @param {Entity} e @param {any} s @param {Entity | undefined} target @param {number} fury */
function everyTick(e, s, target, fury) {
  if (s.stunned) {
    s.bolt = undefined;
    return;
  }
  const dim = e.dimension;
  if (s.bolt) {
    s.bolt.t--;
    if (s.bolt.t % 4 === 0) U.particle(dim, "zt:fuse_spark", s.bolt.at);
    if (s.bolt.t <= 0) {
      lightningStrike(e, s, s.bolt.at);
      s.bolt = undefined;
    }
    return;
  }
  if (!U.isValid(target) || s.anim === ANIM.TNT || s.anim === ANIM.ANTI_AIR) return;
  if (U.dist2D(target.location, e.location) > 64) return;
  if (!U.chance(fury > 1 ? 1 / 60 : 1 / 160)) return;
  const tl = target.location;
  s.bolt = { at: { x: tl.x, y: tl.y, z: tl.z }, t: 20 };
  U.particle(dim, "zt:fuse_spark", s.bolt.at);
  U.sound(dim, "zt.creeper.fuse", s.bolt.at, 1.5, 1.6);
}

// ------------------------------------------------------------------ TNT rain
/** Java hurls hundreds of TNT and fireballs; Bedrock drops a few dozen so phones keep up. */
/** @param {Entity} e @param {any} s @param {Entity} target */
function tntRain(e, s, target) {
  const dim = e.dimension;
  const tl = target.location;
  const charged = !!s.props["zt:enraged"];
  const count = charged ? 24 : 14;
  U.sound(dim, "zt.titan.spit", U.offsetFrom(e.location, s.yaw, 4, 0, 22), 3, 0.7);
  U.tell(dim, tl, 48, "§c§lTNT is raining down! §r§eRun!");
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = i === 0 ? 0 : U.rand(2, 16);
    const at = { x: tl.x + Math.cos(a) * r, y: tl.y + U.rand(18, 30), z: tl.z + Math.sin(a) * r };
    if (!U.inWorld(dim, at.y)) at.y = dim.heightRange.max - 2;
    try {
      dim.spawnEntity("minecraft:tnt", at);
    } catch {
      /* ignore */
    }
  }
  // and a few fireballs from above its head, like the Java mod's creeper titan fireballs
  const head = U.offsetFrom(e.location, s.yaw, 2, 0, 28);
  for (let i = 0; i < (charged ? 6 : 3); i++) {
    const aim = { x: tl.x + U.rand(-4, 4), y: tl.y + 1, z: tl.z + U.rand(-4, 4) };
    const from = { x: head.x + U.rand(-4, 4), y: head.y + U.rand(0, 6), z: head.z + U.rand(-4, 4) };
    const dir = U.norm(U.sub(aim, from));
    try {
      const fb = dim.spawnEntity("minecraft:fireball", from);
      const proj = fb.getComponent("minecraft:projectile");
      if (proj) {
        proj.owner = e;
        proj.shoot({ x: dir.x * 1.6, y: dir.y * 1.6, z: dir.z * 1.6 });
      }
    } catch {
      /* ignore */
    }
  }
}

// =============================================================================
// the stun: hit its head while it lies on the ground
// =============================================================================
const tipShown = new Map();
const STUN_TIP =
  "§6Players can't hurt the Creeper Titan until it is stunned. §eWhen its head crashes into the ground " +
  "(Head Slam, Body Slam or Thunder Clap), run in front of it and §lhit its head§r§e before it gets up! " +
  "Then it keels over and can be hurt for 23 seconds. §7Explosions and lightning can't hurt it.";

/** Is its head down on the ground in front of it right now? @param {any} s */
function headIsDown(s) {
  const w = HEAD_DOWN[s.anim];
  return !!w && s.t >= w[0] && s.t <= w[1];
}

/** @param {Entity} player @param {Entity} titan @param {any} s */
function inFront(player, titan, s) {
  const f = U.forward(s.yaw);
  const to = U.sub(player.location, titan.location);
  const d = Math.hypot(to.x, to.z);
  return d < 26 && (to.x * f.x + to.z * f.z) / (d || 1) > 0.2;
}

/** @param {Entity} e @param {any} s */
function knockOut(e, s) {
  const dim = e.dimension;
  const loc = e.location;
  C.startAnim(e, s, ANIM.STUN);
  setStunned(e, s, true);
  s.bolt = undefined;
  U.sound(dim, "random.anvil_land", loc, 3, 0.5);
  U.sound(dim, "zt.creeper.hurt", loc, 4, 0.5);
  U.particle(dim, "zt:spark_burst", U.offsetFrom(loc, s.yaw, 12, 0, 3), { color: { red: 1.0, green: 0.95, blue: 0.6 } });
  U.tell(dim, loc, 128, "§e§lBONK! §r§eYou hit the Creeper Titan on the head and it keeled over! §aHit it now, it can be hurt for 23 seconds!");
}

/** A player hit it (melee, Dark Fists, Gum Gum...). @param {Player} player @param {Entity} titan @param {any} s */
function onPlayerHit(player, titan, s) {
  if (s.stunned) return;
  if (headIsDown(s) && inFront(player, titan, s)) {
    knockOut(titan, s);
    return;
  }
  const dim = titan.dimension;
  const at = player.getHeadLocation();
  const f = player.getViewDirection();
  U.particle(dim, "zt:spark_burst", { x: at.x + f.x * 2, y: at.y + f.y * 2, z: at.z + f.z * 2 },
    { color: { red: 0.5, green: 0.9, blue: 0.4 } });
  U.sound(dim, "zt.titan.block", at, 1, 1.0);
  const now = system.currentTick;
  if ((tipShown.get(player.id) ?? 0) < now) {
    tipShown.set(player.id, now + 400);
    U.actionbar(player, "§7Your hit bounced off! §eHit its §lhead§r§e when it slams it into the ground.");
    player.sendMessage(STUN_TIP);
  }
}

// =============================================================================
// death: it topples over, the fuse burns for ten seconds, then it blows up
// =============================================================================
const LOOT = /** @type {Array<[string, number, number]>} */ ([
  // Java 0.45: 256-511 gunpowder, 64-127 TNT, 32-63 coal, music discs, 8-15 emeralds and
  // diamonds, up to 3 harcadium (netherite scrap here) and a 1 in 10 chance of bedrock
  ["minecraft:gunpowder", 256, 511],
  ["minecraft:tnt", 64, 127],
  ["minecraft:coal", 32, 63],
  ["minecraft:emerald", 8, 15],
  ["minecraft:diamond", 8, 15],
  ["minecraft:netherite_scrap", 0, 3],
]);
const DISCS = ["minecraft:music_disc_13", "minecraft:music_disc_cat", "minecraft:music_disc_blocks",
  "minecraft:music_disc_chirp", "minecraft:music_disc_far", "minecraft:music_disc_mall",
  "minecraft:music_disc_mellohi", "minecraft:music_disc_stal", "minecraft:music_disc_strad",
  "minecraft:music_disc_ward", "minecraft:music_disc_11", "minecraft:music_disc_wait"];

/** @param {any} c */
function loot(c) {
  const items = C.rollLoot(LOOT);
  for (let i = U.randInt(4, 8); i > 0; i--) items.push([DISCS[U.randInt(0, DISCS.length - 1)], 1]);
  items.push(["minecraft:creeper_head", U.randInt(1, 2)]);
  if (U.chance(0.1)) items.push(["minecraft:bedrock", 1]);
  return items;
}

const FUSE_START = 100;
const BLAST = 300;

/** @param {any} c */
function corpseTick(c) {
  const e = c.entity;
  const dim = e.dimension;
  const loc = c.loc;
  const yaw = c.yaw;
  const t = c.t;
  // it falls onto its right side, so its body and head lie off to its right (the head ~20 blocks out)
  const along = (/** @type {number} */ d, up = 2) => U.offsetFrom(loc, yaw, 0, d, up);
  if (t === 1) {
    U.sound(dim, "zt.creeper.death", loc, 4, 1);
    U.quake(dim, loc, 80, 1.2, 1.5);
  }
  if (t === 84) {
    U.sound(dim, "zt.titan.fall", loc, 5, 1.0);
    U.particle(dim, "zt:shockwave", along(10, 0), { radius: 18 });
    U.particle(dim, "zt:shockwave_dust", along(10, 0), { radius: 14 });
    U.quake(dim, loc, 120, 3.5, 1.4);
  }
  if (t === FUSE_START) {
    U.sound(dim, "zt.creeper.hiss", loc, 5, 0.6);
    U.tell(dim, loc, 192, "§c§lThe Creeper Titan's fuse is lit! §r§eRun! It blows up in 10 seconds!");
    try {
      for (const p of dim.getPlayers({ location: loc, maxDistance: 96 })) {
        p.onScreenDisplay.setTitle("§4§lRUN!", { subtitle: "§cThe Creeper Titan is about to explode!", fadeInDuration: 5, stayDuration: 50, fadeOutDuration: 10 });
      }
    } catch {
      /* ignore */
    }
  }
  if (t >= FUSE_START && t < BLAST) {
    const k = (t - FUSE_START) / (BLAST - FUSE_START);
    if (t % 2 === 0) setFuse(e, Math.round(k * 1000) / 1000);
    if (t % Math.max(6, Math.round(24 - k * 18)) === 0) U.sound(dim, "zt.creeper.fuse", loc, 4, 0.5 + k * 0.8);
    if (t % 4 === 0) U.particle(dim, "zt:fuse_spark", along(U.rand(0, 22), U.rand(1, 7)));
    // smaller blasts pop out of it, faster as the fuse runs down
    if (t > 160 && Math.random() < 0.04 + k * 0.16) {
      const p = along(U.rand(-2, 24), U.rand(1, 8));
      U.particle(dim, "minecraft:huge_explosion_emitter", p);
      U.sound(dim, "zt.creeper.pop", p, 2, U.rand(0.8, 1.2));
    }
    if (t % 20 === 0) {
      const left = Math.ceil((BLAST - t) / 20);
      try {
        for (const p of dim.getPlayers({ location: loc, maxDistance: 128 })) {
          U.actionbar(p, `§c§lThe Creeper Titan explodes in ${left}...`);
        }
      } catch {
        /* ignore */
      }
      U.quake(dim, loc, 96, 0.4 + k * 1.6, 1.0);
    }
  }
  if (t >= BLAST && t < BLAST + 5) blast(c, t - BLAST);
}

/** @param {Entity} e @param {number} v */
function setFuse(e, v) {
  try {
    e.setProperty("zt:fuse", Math.max(0, Math.min(1, v)));
  } catch {
    /* ignore */
  }
}

/** Five huge explosions run along its body, one a tick, then everything around is thrown away. */
/** @param {any} c @param {number} i */
function blast(c, i) {
  const e = c.entity;
  const dim = e.dimension;
  const charged = !!c.charged;
  const at = U.offsetFrom(c.loc, c.yaw, 0, i * 5.5, 3);
  explode(dim, at, charged ? 8 : 6, !!world.gameRules.mobGriefing, e);
  U.particle(dim, "minecraft:huge_explosion_emitter", at);
  U.particle(dim, "zt:shockwave", at, { radius: 20 });
  if (i !== 0) return;
  setFuse(e, 1);
  U.sound(dim, "zt.creeper.blast", c.loc, 8, 1);
  U.particle(dim, "zt:shockwave_dust", c.loc, { radius: 30 });
  U.quake(dim, c.loc, 200, 4, 2.5);
  const center = U.offsetFrom(c.loc, c.yaw, 0, 11, 0);
  const radius = charged ? 72 : 48;
  for (const v of U.livingAround(dim, center, radius, { excludeFamilies: ["zt_ally", "inanimate"] })) {
    const d = U.len(U.sub(v.location, center));
    const k = Math.max(0, 1 - d / radius);
    U.hurt(v, 10 + 110 * k * k * (charged ? 2 : 1), e, "entityExplosion");
    const away = U.sub(v.location, center);
    U.knock(v, away.x, away.z, 1 + 3 * k, 0.6 + 1.2 * k);
    try {
      v.addEffect("nausea", 200, { amplifier: 0, showParticles: false });
    } catch {
      /* ignore */
    }
  }
}

// =============================================================================
// the type definition titan.js runs
// =============================================================================
export const CREEPER_TITAN = {
  id: "zt:creeper_titan",
  name: "Creeper Titan",
  color: "§a",
  corpse: "zt:creeper_titan_corpse",
  minion: MINION,
  cfg: CFG,
  duration: DURATION,
  trackUntil: TRACK_UNTIL,
  snd: {
    step: "zt.titan.step", slam: "zt.titan.slam", roar: "zt.creeper.hiss", fall: "zt.titan.fall",
    quake: "zt.titan.quake", ambient: "zt.creeper.ambient",
  },
  enragedText: "It is CHARGED! It moves faster, calls down more lightning and shrugs off arrows.",
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
  notifyBlocked: onPlayerHit,
  /** @param {Entity} corpse @param {any} s */
  corpseInit(corpse, s) {
    const charged = !!s.props["zt:enraged"];
    try {
      corpse.setProperty("zt:enraged", charged);
    } catch {
      /* ignore */
    }
    return { charged };
  },
  /** @param {Entity} e */
  corpseLoad(e) {
    let charged = false;
    try {
      charged = !!e.getProperty("zt:enraged");
    } catch {
      /* ignore */
    }
    return { charged };
  },
  // the loot falls a second after the blast, so the explosion can't destroy it
  corpseSeq: { lootTick: BLAST + 20, endTick: BLAST + 60, lootAhead: 0, tick: corpseTick },
  loot,
};
