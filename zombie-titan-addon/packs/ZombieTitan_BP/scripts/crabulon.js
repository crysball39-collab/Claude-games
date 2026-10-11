// Crabulon, the boss of the Shroom Fortress. A Crab Totem set on the Shroomed Altar calls it: the
// totem floats up off the altar and bursts in a flash of blue light, Crabulon comes down out of
// the shaft in the arena's roof, lands, and roars; then the fight begins. Ten blocks tall with
// 3000 health, it scuttles sideways round its foes, as crabs do, and by turns:
//   Bullet Barrage  five seconds of spore bullets fired seven ways at once, the seven turning;
//   Jump            it leaps to another part of the arena and a shockwave runs out over the floor
//                   from where it lands (jump it);
//   Summon          it beats the floor and five Shroomy Crabs come for its foes;
//   Shroom Rain     five seconds of small glowing mushrooms falling from the roof, each one's
//                   landing place marked by a red circle on the floor first;
//   a claw snap at whoever's in front of it.
// Below half its health it fights faster. Left alone (no one in its arena for half a minute) it
// climbs back up into its roof and leaves the totem on the altar. When it dies it slumps, bursts
// in spores and leaves a Spore Scroll and a Shroomed Eye.
//
// An altar set down outside a fortress works too: the arena is then the ground round it.
import { GameMode, HudVisibility, ItemStack, system, world } from "@minecraft/server";
import * as Bullets from "./bullets.js";
import * as Doors from "./doors_common.js";
import * as Fortress from "./fortress.js";
import * as U from "./util.js";

/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Block} Block */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

export const BOSS = "zt:crabulon";
export const CORPSE = "zt:crabulon_corpse";
export const TOTEM = "zt:crab_totem";
export const TOTEM_DISPLAY = "zt:crab_totem_display";
export const SHROOM = "zt:falling_shroom";
export const SCROLL = "zt:spore_scroll";
export const EYE = "zt:shroomed_eye";
export const CRAB = "zt:shroomy_crab";
export const HP = 3000;
/** Players watching the summoning carry this tag (so a player who leaves mid-way gets their camera back). */
export const WATCHING = "zt:crab_cutscene";

export const ANIM = { NONE: 0, BARRAGE: 1, CROUCH: 2, AIR: 3, LAND: 4, SUMMON: 5, RAIN: 6, CLAW: 7, ROAR: 8, DESCEND: 9 };

export const CFG = {
  // Bullet Barrage: seven ways at once, every few ticks, for five seconds
  barrageTicks: 100, barrageEvery: 3, barrageEveryEnraged: 2, barrageDirs: 7, bulletSpeed: 0.55, bulletDamage: 5,
  // Jump: crouch, fly, land; a crush where it lands and a shockwave running out from there
  jumpCrouch: 14, jumpAir: 26, jumpHeight: 9, crushRadius: 6, crushDamage: 18, waveRange: 16, waveDamage: 8,
  // Summon: five crabs (no more than ten in the arena)
  summonCount: 5, crabCap: 10,
  // Shroom Rain: a mushroom every few ticks for five seconds, each warned of for a second
  rainTicks: 100, rainEvery: 5, rainEveryEnraged: 3, rainWarn: 22, rainRadius: 1.7, rainDamage: 7, rainHeight: 12,
  // the claw snap
  clawRange: 9.5, clawDamage: 12,
  // getting about, and resting between attacks
  walkSpeed: 0.17, walkSpeedEnraged: 0.24, turnRate: 6, restMin: 45, restMax: 85,
  // with no one in its arena for this long, it leaves
  leaveAfter: 600,
  xp: 500,
};

/** The fights, by their altar ("dim|x,y,z"). @type {Map<string, any>} */
export const fights = new Map();

// ---------------------------------------------------------------- small helpers
/** @param {Player} p */
function creative(p) {
  try {
    return p.getGameMode() === GameMode.Creative;
  } catch {
    return false;
  }
}
/** @param {Entity} e @param {string} id @param {any} v */
function prop(e, id, v) {
  try {
    if (e.getProperty(id) !== v) e.setProperty(id, v);
  } catch {
    /* ignore */
  }
}
/** @param {any} f @param {number} a */
function setAnim(f, a) {
  f.anim = a;
  f.at = 0;
  if (U.isValid(f.boss)) prop(f.boss, "zt:anim", a);
}
/** @param {Dimension} dim @param {string} id @param {Vector3} at @param {number} [volume] @param {number} [pitch] */
function sound(dim, id, at, volume = 1, pitch = 1) {
  U.sound(dim, id, at, volume, pitch);
}
/** Turns `from` toward `to` by at most `rate` degrees. @param {number} from @param {number} to @param {number} rate */
function turn(from, to, rate) {
  const d = U.wrapDeg(to - from);
  return from + Math.max(-rate, Math.min(rate, d));
}

// ---------------------------------------------------------------- the arena
/**
 * Where a fight happens: in a fortress, its arena; anywhere else, the ground round the altar.
 * @param {Dimension} dim @param {Vector3} altar @param {Player | undefined} by
 */
export function arenaFor(dim, altar, by) {
  const f = Fortress.fortressOfAltar(dim.id, altar) ?? Fortress.arenaAt(dim.id, { x: altar.x + 0.5, y: altar.y, z: altar.z + 0.5 });
  if (f?.arena && f.shaft && f.floor !== undefined && f.roof !== undefined) {
    const [x0, z0, x1, z1] = f.arena;
    return { fortress: true, x0, z0, x1: x1 + 1, z1: z1 + 1, floor: f.floor, roof: f.roof, altar: { ...altar },
      landing: { x: f.shaft[0] + 0.5, z: f.shaft[1] + 0.5 } };
  }
  // the ground round the altar: Crabulon comes down ten blocks off, beyond the altar from whoever called it
  const c = { x: altar.x + 0.5, z: altar.z + 0.5 };
  let away = { x: 1, z: 0 };
  if (by) {
    const d = { x: c.x - by.location.x, z: c.z - by.location.z };
    const l = Math.hypot(d.x, d.z);
    if (l > 0.1) away = { x: d.x / l, z: d.z / l };
  }
  return { fortress: false, x0: c.x - 20, z0: c.z - 20, x1: c.x + 20, z1: c.z + 20, floor: altar.y, roof: altar.y + 22,
    altar: { ...altar }, landing: { x: c.x + away.x * 10, z: c.z + away.z * 10 } };
}
/** Is a point in the arena (with a margin)? @param {any} a @param {Vector3} l @param {number} [m] */
export function inArena(a, l, m = 1) {
  return l.x >= a.x0 - m && l.x <= a.x1 + m && l.z >= a.z0 - m && l.z <= a.z1 + m && l.y >= a.floor - 4 && l.y <= a.roof + 6;
}
/** Where Crabulon may stand: far enough from the walls that its legs stay out of them. @param {any} a @param {Vector3} p */
function keepIn(a, p) {
  const m = a.fortress ? 7 : 4;
  return { x: Math.max(a.x0 + m, Math.min(a.x1 - m, p.x)), y: p.y, z: Math.max(a.z0 + m, Math.min(a.z1 - m, p.z)) };
}
/** The floor under a point (flat in a fortress; the ground elsewhere). @param {any} f @param {number} x @param {number} z */
function floorAt(f, x, z) {
  if (f.arena.fortress) return f.arena.floor;
  const g = U.groundY(f.dim, x, z, f.arena.floor + 10, 24);
  return g ?? f.arena.floor;
}
/** The players a fight is about: alive and not in creative, in the arena. @param {any} f */
function foes(f) {
  let list = [];
  try {
    list = f.dim.getPlayers();
  } catch {
    return [];
  }
  return list.filter((p) => U.isVulnerablePlayer(p) && inArena(f.arena, p.location, 2) && (p.getComponent("minecraft:health")?.currentValue ?? 0) > 0);
}
/** Everyone in the arena, creative or not (they all see the summoning). @param {any} f */
function everyoneIn(f) {
  try {
    return f.dim.getPlayers().filter((p) => inArena(f.arena, p.location, 3));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- the altar
/**
 * A player used the Shroomed Altar: with a Crab Totem in hand (and no Crabulon already about),
 * the totem goes on the altar and the summoning begins. @param {Player} p @param {Block} block
 * @returns {boolean} whether it began
 */
export function useAltar(p, block) {
  const dim = block.dimension;
  const l = block.location;
  const key = `${dim.id}|${l.x},${l.y},${l.z}`;
  if (fights.has(key)) {
    U.actionbar(p, "§bCrabulon is already here!");
    return false;
  }
  let held;
  try {
    held = p.getComponent("minecraft:equippable")?.getEquipment(/** @type {any} */ ("Mainhand"));
  } catch {
    held = undefined;
  }
  if (held?.typeId !== TOTEM) {
    U.actionbar(p, "§7Set a §bCrab Totem§7 on the altar to call §bCrabulon §8(2 Shroomy Crab Claws + 4 Shroom Patches)");
    return false;
  }
  const arena = arenaFor(dim, l, p);
  // (one Crabulon to an arena)
  try {
    if (dim.getEntities({ type: BOSS }).some((e) => inArena(arena, e.location, 4))) {
      U.actionbar(p, "§bCrabulon is already here!");
      return false;
    }
  } catch {
    /* ignore */
  }
  if (!creative(p)) {
    try {
      const eq = p.getComponent("minecraft:equippable");
      if (held.amount <= 1) eq?.setEquipment(/** @type {any} */ ("Mainhand"), undefined);
      else {
        held.amount -= 1;
        eq?.setEquipment(/** @type {any} */ ("Mainhand"), held);
      }
    } catch {
      /* ignore */
    }
  }
  begin(dim, key, arena, p);
  return true;
}

// ---------------------------------------------------------------- the summoning
/** The cutscene's timeline (ticks). */
export const INTRO = { flash: 60, look: 70, arrive: 80, land: 140, front: 150, roar: 160, end: 215 };

/** @param {Dimension} dim @param {string} key @param {any} arena @param {Player} by */
function begin(dim, key, arena, by) {
  const a = arena.altar;
  const top = { x: a.x + 0.5, y: a.y + 1, z: a.z + 0.5 };
  /** @type {any} */
  const f = { key, dim, arena, phase: "intro", t: 0, anim: ANIM.NONE, at: 0, drops: [], waves: [], hits: new Set(), alone: 0,
    enraged: false, next: 0, last: "", strafe: 1, strafeUntil: 0, spin: 0 };
  // which way it'll face: from where it lands toward the altar
  f.yaw = U.yawTo({ x: arena.landing.x, y: 0, z: arena.landing.z }, top);
  try {
    f.totem = dim.spawnEntity(TOTEM_DISPLAY, top);
  } catch {
    f.totem = undefined;
  }
  f.viewers = everyoneIn(f);
  if (!f.viewers.some((/** @type {Player} */ p) => p.id === by.id)) f.viewers.push(by);
  for (const p of f.viewers) watch(p, true);
  sound(dim, "beacon.activate", top, 2, 0.7);
  U.particle(dim, "zt:totem_flash", top);
  fights.set(key, f);
  shot(f, 0);
  return f;
}

/** A player starts or stops watching the summoning. @param {Player} p @param {boolean} on */
function watch(p, on) {
  try {
    if (on) {
      p.addTag(WATCHING);
      Doors.lockInput(p, true);
      p.onScreenDisplay.setHudVisibility(HudVisibility.Hide);
      p.addEffect("resistance", INTRO.end + 20, { amplifier: 4, showParticles: false });
    } else {
      p.removeTag(WATCHING);
      Doors.lockInput(p, false);
      Doors.cameraClear(p);
      p.onScreenDisplay.setHudVisibility(HudVisibility.Reset);
    }
  } catch {
    /* ignore */
  }
}

/** Gives back a player's camera and controls if they were left watching (they left mid-way). @param {Player} p */
export function restore(p) {
  try {
    if (!p.hasTag(WATCHING)) return;
  } catch {
    return;
  }
  for (const f of fights.values()) if (f.phase === "intro" && f.viewers?.some((/** @type {Player} */ q) => q.id === p.id)) return;
  watch(p, false);
}

/** The cutscene's camera shots. @param {any} f @param {number} n */
function shot(f, n) {
  const A = f.arena;
  const alt = { x: A.altar.x + 0.5, y: A.altar.y + 1, z: A.altar.z + 0.5 };
  const L = { x: A.landing.x, y: A.floor, z: A.landing.z };
  const toL = U.norm({ x: L.x - alt.x, y: 0, z: L.z - alt.z });
  const side = { x: -toL.z, y: 0, z: toL.x };
  /** @type {Player[]} */
  const viewers = f.viewers;
  for (const p of viewers) {
    if (!U.isValid(p)) continue;
    if (n === 0) Doors.camera(p, { x: alt.x - toL.x * 8 + side.x * 5, y: alt.y + 4, z: alt.z - toL.z * 8 + side.z * 5 }, { x: alt.x, y: alt.y + 1.5, z: alt.z });
    else if (n === 1) Doors.camera(p, { x: alt.x - toL.x * 6, y: alt.y + 2.5, z: alt.z - toL.z * 6 }, { x: L.x, y: A.roof + 2, z: L.z }, 1.0);
    else if (n === 2 && U.isValid(f.boss)) Doors.camera(p, { x: alt.x - toL.x * 6, y: alt.y + 2.5, z: alt.z - toL.z * 6 }, f.boss);
    else if (n === 3) Doors.camera(p, { x: L.x - toL.x * 17, y: L.y + 5, z: L.z - toL.z * 17 }, { x: L.x, y: L.y + 6, z: L.z }, 0.8);
  }
}

/** A tick of the summoning. @param {any} f */
function introTick(f) {
  const A = f.arena;
  const dim = f.dim;
  const t = ++f.t;
  const alt = { x: A.altar.x + 0.5, y: A.altar.y + 1, z: A.altar.z + 0.5 };
  const L = { x: A.landing.x, y: A.floor, z: A.landing.z };
  if (t < INTRO.flash && t % 5 === 0) {
    // the totem rising, spores swirling up round it
    U.particle(dim, "zt:spore_pop", { x: alt.x, y: alt.y + (t / INTRO.flash) * 3, z: alt.z });
    if (t % 20 === 0) sound(dim, "beacon.ambient", alt, 2, 0.6 + t / 100);
  }
  if (t === INTRO.flash) {
    // the flash: blue light over everyone's eyes
    const at = { x: alt.x, y: alt.y + 3, z: alt.z };
    U.particle(dim, "zt:totem_flash", at);
    sound(dim, "random.totem", at, 3, 0.8);
    sound(dim, "beacon.power", at, 3, 0.6);
    for (const p of everyoneIn(f)) Doors.fade(p, 0.12, 0.3, 0.7, { red: 0.35, green: 0.75, blue: 1.0 });
    try {
      if (U.isValid(f.totem)) f.totem.remove();
    } catch {
      /* ignore */
    }
    f.totem = undefined;
  }
  if (t === INTRO.look) {
    shot(f, 1);
    U.quake(dim, L, 48, 0.6, 3);
    sound(dim, "mob.ravager.stun", { x: L.x, y: A.roof, z: L.z }, 3, 0.4);
  }
  if (t >= INTRO.look && t < INTRO.land && t % 6 === 0) U.particle(dim, "zt:roof_dust", { x: L.x, y: A.roof, z: L.z });
  if (t === INTRO.arrive) {
    try {
      f.boss = dim.spawnEntity(BOSS, { x: L.x, y: A.roof + 3, z: L.z });
      f.bossId = f.boss.id;
      prop(f.boss, "zt:intro", true);
      f.boss.setRotation({ x: 0, y: f.yaw });
      setAnim(f, ANIM.DESCEND);
    } catch (err) {
      console.warn("[Titans] Crabulon: " + err);
    }
    shot(f, 2);
  }
  if (t > INTRO.arrive && t <= INTRO.land && U.isValid(f.boss)) {
    // down out of the shaft, faster and faster
    const k = (t - INTRO.arrive) / (INTRO.land - INTRO.arrive);
    const y = A.roof + 3 - (A.roof + 3 - A.floor) * k * k;
    f.pos = { x: L.x, y, z: L.z };
    try {
      f.boss.teleport(f.pos, { rotation: { x: 0, y: f.yaw } });
    } catch {
      /* ignore */
    }
  }
  if (t === INTRO.land) {
    setAnim(f, ANIM.LAND);
    U.quake(dim, L, 48, 1.4, 1);
    sound(dim, "mob.ravager.stun", L, 4, 0.5);
    sound(dim, "random.explode", L, 3, 0.5);
    U.particle(dim, "zt:slam_dust", { x: L.x, y: L.y + 0.2, z: L.z });
    U.particle(dim, "zt:shock_ring", { x: L.x, y: L.y + 0.1, z: L.z }, { size: 30 });
  }
  if (t === INTRO.front) shot(f, 3);
  if (t === INTRO.roar) {
    setAnim(f, ANIM.ROAR);
    roar(f);
    for (const p of everyoneIn(f)) Doors.title(p, "§b§lCRABULON", "§3the Crab King of the Shroom Fortress", 50);
  }
  if (t === INTRO.end) {
    for (const p of f.viewers) watch(p, false);
    f.viewers = [];
    if (U.isValid(f.boss)) prop(f.boss, "zt:intro", false);
    setAnim(f, ANIM.NONE);
    f.phase = "fight";
    f.t = 0;
    f.next = 30;
  }
}

/** Its roar: three of the game's great roars at once, low. @param {any} f */
function roar(f) {
  const at = f.pos ?? { x: f.arena.landing.x, y: f.arena.floor, z: f.arena.landing.z };
  sound(f.dim, "mob.ravager.roar", at, 5, 0.5);
  sound(f.dim, "mob.warden.roar", at, 4, 0.75);
  sound(f.dim, "mob.enderdragon.growl", at, 3, 0.6);
  U.quake(f.dim, at, 48, 0.9, 2.2);
}

// ---------------------------------------------------------------- the fight
/** @param {any} f */
function hp(f) {
  try {
    return f.boss.getComponent("minecraft:health")?.currentValue ?? HP;
  } catch {
    return HP;
  }
}
/** The bit of floor in front of it, its centre. @param {any} f */
function center(f) {
  return { x: f.pos.x, y: f.pos.y + 3, z: f.pos.z };
}

/** A tick of the fight. @param {any} f */
function fightTick(f) {
  const e = f.boss;
  if (!U.isValid(e)) {
    end(f);
    return;
  }
  f.t++;
  f.at++;
  if (!f.pos) f.pos = { ...e.location };
  const list = foes(f);
  f.alone = list.length ? 0 : f.alone + 1;
  if (f.alone > CFG.leaveAfter) {
    leave(f);
    return;
  }
  if (!f.enraged && hp(f) < HP / 2) {
    f.enraged = true;
    prop(e, "zt:enraged", true);
    roar(f);
    for (const p of list) Doors.title(p, " ", "§bCrabulon is enraged!", 30);
  }
  // its foe: the nearest, kept while it's still about
  if (!f.target || !list.some((p) => p.id === f.target.id)) {
    f.target = list.sort((a, b) => U.dist2D(a.location, f.pos) - U.dist2D(b.location, f.pos))[0];
  }
  const target = f.target;
  if (f.anim === ANIM.NONE) {
    const moved = walk(f, target);
    prop(e, "zt:moving", moved);
    if (target && f.t >= f.next) choose(f, target);
  } else {
    prop(e, "zt:moving", false);
    attackTick(f, target);
  }
  try {
    e.teleport(f.pos, { rotation: { x: 0, y: f.yaw } });
  } catch {
    /* ignore */
  }
}

/** Scuttles sideways round its foe, keeping a claw's reach off. @param {any} f @param {Player | undefined} target */
function walk(f, target) {
  if (!target) return false;
  const tl = target.location;
  f.yaw = turn(f.yaw, U.yawTo(f.pos, tl), CFG.turnRate);
  const d = U.dist2D(f.pos, tl);
  if (f.t >= f.strafeUntil) {
    f.strafe = Math.random() < 0.5 ? 1 : -1;
    f.strafeUntil = f.t + U.randInt(40, 90);
  }
  const to = U.norm({ x: tl.x - f.pos.x, y: 0, z: tl.z - f.pos.z });
  const side = { x: -to.z * f.strafe, y: 0, z: to.x * f.strafe };
  const radial = d > 13 ? 1 : d < 7 ? -0.7 : 0;
  const v = U.norm({ x: to.x * radial + side.x, y: 0, z: to.z * radial + side.z });
  const speed = f.enraged ? CFG.walkSpeedEnraged : CFG.walkSpeed;
  const next = keepIn(f.arena, { x: f.pos.x + v.x * speed, y: f.pos.y, z: f.pos.z + v.z * speed });
  // (against a wall, it turns about and scuttles the other way)
  if (Math.hypot(next.x - f.pos.x, next.z - f.pos.z) < speed * 0.3) {
    f.strafe = -f.strafe;
    f.strafeUntil = f.t + U.randInt(30, 60);
  }
  f.pos = { x: next.x, y: floorAt(f, next.x, next.z), z: next.z };
  return true;
}

/** Picks its next attack. @param {any} f @param {Player} target */
function choose(f, target) {
  const d = U.dist2D(f.pos, target.location);
  const off = Math.abs(U.wrapDeg(U.yawTo(f.pos, target.location) - f.yaw));
  let crabs = 0;
  try {
    crabs = f.dim.getEntities({ type: CRAB }).filter((c) => inArena(f.arena, c.location)).length;
  } catch {
    crabs = 0;
  }
  /** @type {Array<[string, number]>} */
  const options = [["barrage", 3], ["jump", d > 10 ? 4 : 2], ["rain", 2.5], ["summon", crabs <= CFG.crabCap - CFG.summonCount ? 2 : 0]];
  if (d < CFG.clawRange + 2 && off < 50) options.push(["claw", 5]);
  const pool = options.filter(([name, w]) => w > 0 && name !== f.last);
  let r = Math.random() * pool.reduce((n, [, w]) => n + w, 0);
  let pick = pool[0][0];
  for (const [name, w] of pool) {
    r -= w;
    if (r <= 0) {
      pick = name;
      break;
    }
  }
  start(f, pick, target);
}

/** Starts an attack (exported for tests). @param {any} f @param {string} name @param {Player | undefined} target */
export function start(f, name, target) {
  f.last = name;
  f.attack = name;
  if (name === "barrage") {
    setAnim(f, ANIM.BARRAGE);
    f.spin = U.yawTo(f.pos, target?.location ?? f.pos);
    sound(f.dim, "mob.evocation_illager.prepare_attack", center(f), 3, 0.6);
  } else if (name === "jump") {
    setAnim(f, ANIM.CROUCH);
    const A = f.arena;
    let to;
    if (target && Math.random() < 0.6) {
      const a = Math.random() * Math.PI * 2;
      const r = U.rand(1, 4);
      to = { x: target.location.x + Math.cos(a) * r, z: target.location.z + Math.sin(a) * r };
    } else to = { x: U.rand(A.x0, A.x1), z: U.rand(A.z0, A.z1) };
    const k = keepIn(A, { x: to.x, y: 0, z: to.z });
    f.jump = { from: { ...f.pos }, to: { x: k.x, y: floorAt(f, k.x, k.z), z: k.z } };
    sound(f.dim, "mob.ravager.step", f.pos, 3, 0.5);
  } else if (name === "summon") {
    setAnim(f, ANIM.SUMMON);
    sound(f.dim, "mob.evocation_illager.prepare_summon", center(f), 3, 0.7);
  } else if (name === "rain") {
    setAnim(f, ANIM.RAIN);
    sound(f.dim, "conduit.activate", center(f), 3, 0.7);
  } else if (name === "claw") {
    setAnim(f, ANIM.CLAW);
    sound(f.dim, "mob.ravager.ambient", center(f), 3, 0.6);
  }
}

/** The end of an attack: it rests a little before the next. @param {any} f */
function done(f) {
  setAnim(f, ANIM.NONE);
  f.attack = undefined;
  const rest = U.randInt(CFG.restMin, CFG.restMax);
  f.next = f.t + Math.round(f.enraged ? rest * 0.65 : rest);
}

/** @param {any} f @param {Player | undefined} target */
function attackTick(f, target) {
  const dim = f.dim;
  const at = f.at;
  if (target && f.attack !== "jump") f.yaw = turn(f.yaw, U.yawTo(f.pos, target.location), f.attack === "claw" && at > 8 ? 0 : CFG.turnRate / 2);
  switch (f.attack) {
    case "barrage": {
      const every = f.enraged ? CFG.barrageEveryEnraged : CFG.barrageEvery;
      if (at >= 10 && at < 10 + CFG.barrageTicks && (at - 10) % every === 0) {
        // seven ways at once, the seven turning a little each volley (and back the other way when enraged)
        f.spin += f.enraged && Math.floor(at / 30) % 2 ? -5 : 5;
        for (let k = 0; k < CFG.barrageDirs; k++) {
          const yaw = f.spin + (k * 360) / CFG.barrageDirs;
          const dir = U.forward(yaw);
          const from = { x: f.pos.x + dir.x * 4.8, y: f.pos.y + 1.3, z: f.pos.z + dir.z * 4.8 };
          Bullets.fire(dim, Bullets.HOSTILE, from, dir, CFG.bulletSpeed, f.boss, CFG.bulletDamage);
        }
        if ((at - 10) % 6 === 0) sound(dim, "mob.shulker.shoot", center(f), 2, 0.6);
      }
      if (at >= 10 + CFG.barrageTicks + 6) done(f);
      break;
    }
    case "jump": {
      if (f.anim === ANIM.CROUCH && at >= CFG.jumpCrouch) {
        setAnim(f, ANIM.AIR);
        f.at = 0;
        sound(dim, "mob.ravager.roar", center(f), 2, 1.2);
      } else if (f.anim === ANIM.AIR) {
        const k = Math.min(1, at / CFG.jumpAir);
        const { from, to } = f.jump;
        f.pos = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k + 4 * CFG.jumpHeight * k * (1 - k), z: from.z + (to.z - from.z) * k };
        if (k >= 1) {
          f.pos = { ...to };
          setAnim(f, ANIM.LAND);
          land(f);
        }
      } else if (f.anim === ANIM.LAND && at >= 12) done(f);
      break;
    }
    case "summon": {
      if (at === 14) summon(f);
      if (at >= 40) done(f);
      break;
    }
    case "rain": {
      const every = f.enraged ? CFG.rainEveryEnraged : CFG.rainEvery;
      if (at % 4 === 0 && at < 10 + CFG.rainTicks) U.particle(dim, "zt:spore_pop", { x: f.pos.x, y: f.pos.y + 8, z: f.pos.z });
      if (at >= 10 && at < 10 + CFG.rainTicks && (at - 10) % every === 0) dropShroom(f);
      if (at >= 10 + CFG.rainTicks + 10) done(f);
      break;
    }
    case "claw": {
      if (at === 9) claw(f);
      if (at >= 18) done(f);
      break;
    }
    default:
      done(f);
  }
}

/** It lands: whoever's under it is crushed, and a shockwave runs out over the floor. @param {any} f */
function land(f) {
  const dim = f.dim;
  const at = { x: f.pos.x, y: f.pos.y, z: f.pos.z };
  sound(dim, "mob.ravager.stun", at, 4, 0.5);
  sound(dim, "random.explode", at, 3, 0.6);
  U.quake(dim, at, 40, 1.2, 0.8);
  U.particle(dim, "zt:slam_dust", { x: at.x, y: at.y + 0.2, z: at.z });
  U.particle(dim, "zt:shock_ring", { x: at.x, y: at.y + 0.1, z: at.z }, { size: CFG.waveRange * 2 });
  for (const p of foes(f)) {
    const d = U.dist2D(p.location, at);
    if (d > CFG.crushRadius || Math.abs(p.location.y - at.y) > 4) continue;
    U.hurt(p, CFG.crushDamage * (1 - (d / CFG.crushRadius) * 0.5), f.boss);
    U.knock(p, p.location.x - at.x, p.location.z - at.z, 1.2, 0.5);
  }
  f.waves.push({ at, r: CFG.crushRadius - 1, hit: new Set() });
}

/** The shockwaves running out: a player on the floor where the wave is gets thrown. @param {any} f */
function wavesTick(f) {
  if (!f.waves.length) return;
  const list = foes(f);
  for (const w of f.waves) {
    w.r += 1;
    for (const p of list) {
      if (w.hit.has(p.id)) continue;
      const d = U.dist2D(p.location, w.at);
      if (d < w.r - 1.3 || d > w.r + 0.4 || Math.abs(p.location.y - w.at.y) > 1.2) continue;
      // (a jump clears it)
      let grounded = true;
      try {
        grounded = p.isOnGround;
      } catch {
        grounded = true;
      }
      if (!grounded) continue;
      w.hit.add(p.id);
      U.hurt(p, CFG.waveDamage, f.boss);
      U.knock(p, p.location.x - w.at.x, p.location.z - w.at.z, 0.8, 0.45);
    }
  }
  f.waves = f.waves.filter((w) => w.r < CFG.waveRange);
}

/** Five crabs come up out of the floor round it, and go for its foes. @param {any} f */
function summon(f) {
  const dim = f.dim;
  let crabs = 0;
  try {
    crabs = dim.getEntities({ type: CRAB }).filter((c) => inArena(f.arena, c.location)).length;
  } catch {
    crabs = 0;
  }
  const n = Math.min(CFG.summonCount, CFG.crabCap - crabs);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(1, n)) * Math.PI * 2 + Math.random() * 0.6;
    const r = U.rand(6.5, 9);
    const p = keepIn(f.arena, { x: f.pos.x + Math.cos(a) * r, y: 0, z: f.pos.z + Math.sin(a) * r });
    const y = floorAt(f, p.x, p.z);
    try {
      const crab = dim.spawnEntity(CRAB, { x: p.x, y, z: p.z });
      crab.triggerEvent("zt:make_hostile");
      out.push(crab);
      U.particle(dim, "zt:slam_dust", { x: p.x, y: y + 0.1, z: p.z });
      U.particle(dim, "zt:spore_pop", { x: p.x, y: y + 0.5, z: p.z });
    } catch {
      /* ignore */
    }
  }
  sound(dim, "trial_spawner.spawn_mob", center(f), 3, 0.8);
  U.quake(dim, f.pos, 30, 0.4, 0.5);
  return out;
}

/** One mushroom of the Shroom Rain: a red circle where it'll land, then down it comes. @param {any} f */
function dropShroom(f) {
  const A = f.arena;
  const list = foes(f);
  let x;
  let z;
  if (list.length && Math.random() < 0.45) {
    const p = list[Math.floor(Math.random() * list.length)];
    x = p.location.x + U.rand(-1.5, 1.5);
    z = p.location.z + U.rand(-1.5, 1.5);
  } else {
    x = U.rand(A.x0 + 1.5, A.x1 - 1.5);
    z = U.rand(A.z0 + 1.5, A.z1 - 1.5);
  }
  x = Math.max(A.x0 + 1, Math.min(A.x1 - 1, x));
  z = Math.max(A.z0 + 1, Math.min(A.z1 - 1, z));
  const y = floorAt(f, x, z);
  f.drops.push({ x, y, z, warned: f.t, falls: f.t + CFG.rainWarn - 12, entity: undefined, h: 0, v: 0.3 });
}

/** The Shroom Rain's mushrooms: warned of, falling, landing. @param {any} f */
function dropsTick(f) {
  if (!f.drops.length) return;
  const dim = f.dim;
  for (const d of f.drops) {
    if (!d.entity && (f.t - d.warned) % 8 === 0) U.particle(dim, "zt:warning_ring", { x: d.x, y: d.y + 0.06, z: d.z }, { size: CFG.rainRadius * 2.2 });
    if (!d.entity && f.t >= d.falls) {
      d.h = Math.min(CFG.rainHeight, f.arena.roof - d.y - 1);
      try {
        d.entity = dim.spawnEntity(SHROOM, { x: d.x, y: d.y + d.h, z: d.z });
      } catch {
        d.entity = undefined;
        d.landed = true;
      }
      continue;
    }
    if (!d.entity) continue;
    if (!d.landed) U.particle(dim, "zt:warning_ring", { x: d.x, y: d.y + 0.06, z: d.z }, { size: CFG.rainRadius * 2.2 });
    d.h -= d.v;
    d.v += 0.1;
    if (d.h > 0) {
      try {
        d.entity.teleport({ x: d.x, y: d.y + d.h, z: d.z });
      } catch {
        d.landed = true;
      }
      continue;
    }
    // it lands: whoever's in the circle is hit
    d.landed = true;
    try {
      if (U.isValid(d.entity)) d.entity.remove();
    } catch {
      /* ignore */
    }
    U.particle(dim, "zt:spore_pop", { x: d.x, y: d.y + 0.4, z: d.z });
    sound(dim, "random.explode", { x: d.x, y: d.y, z: d.z }, 0.6, 1.7);
    for (const p of foes(f)) {
      const dist = U.dist2D(p.location, d);
      if (dist > CFG.rainRadius || p.location.y < d.y - 1 || p.location.y > d.y + 2.5) continue;
      U.hurt(p, CFG.rainDamage, f.boss);
      U.knock(p, p.location.x - d.x, p.location.z - d.z, 0.4, 0.3);
    }
  }
  f.drops = f.drops.filter((d) => !d.landed);
}

/** The claw snap at whoever's in front of it. @param {any} f */
function claw(f) {
  const dim = f.dim;
  const fw = U.forward(f.yaw);
  sound(dim, "mob.ravager.bite", center(f), 3, 0.6);
  for (const p of foes(f)) {
    const to = { x: p.location.x - f.pos.x, z: p.location.z - f.pos.z };
    const d = Math.hypot(to.x, to.z);
    if (d > CFG.clawRange + 1 || p.location.y > f.pos.y + 6) continue;
    const cos = (to.x * fw.x + to.z * fw.z) / (d || 1);
    if (cos < Math.cos(55 * U.DEG)) continue;
    U.hurt(p, CFG.clawDamage, f.boss);
    U.knock(p, to.x, to.z, 1.4, 0.5);
  }
}

/** Left alone, it climbs back up into its roof, and the totem is left on the altar. @param {any} f */
function leave(f) {
  f.phase = "leaving";
  f.t = 0;
  setAnim(f, ANIM.DESCEND);
  prop(f.boss, "zt:moving", false);
  prop(f.boss, "zt:intro", true);
}
/** @param {any} f */
function leavingTick(f) {
  const e = f.boss;
  f.t++;
  if (!U.isValid(e)) {
    end(f);
    return;
  }
  const k = Math.min(1, f.t / 60);
  const y = f.arena.floor + (f.arena.roof + 4 - f.arena.floor) * k * k;
  try {
    e.teleport({ x: f.pos.x, y, z: f.pos.z }, { rotation: { x: 0, y: f.yaw } });
  } catch {
    /* ignore */
  }
  if (f.t % 8 === 0) U.particle(f.dim, "zt:roof_dust", { x: f.pos.x, y: f.arena.roof, z: f.pos.z });
  if (f.t >= 60) {
    try {
      e.remove();
    } catch {
      /* ignore */
    }
    const a = f.arena.altar;
    try {
      f.dim.spawnItem(new ItemStack(TOTEM, 1), { x: a.x + 0.5, y: a.y + 1.2, z: a.z + 0.5 });
    } catch {
      /* ignore */
    }
    end(f);
  }
}

/** @param {any} f */
function end(f) {
  for (const p of f.viewers ?? []) watch(p, false);
  try {
    if (U.isValid(f.totem)) f.totem.remove();
  } catch {
    /* ignore */
  }
  for (const d of f.drops) {
    try {
      if (U.isValid(d.entity)) d.entity.remove();
    } catch {
      /* ignore */
    }
  }
  fights.delete(f.key);
}

// ---------------------------------------------------------------- its death
/** Corpses playing out their death: entity id -> what's left to do. */
const corpses = new Map();
/** The corpse's timeline: it slumps, then bursts in spores and leaves its loot. */
export const DEATH = { burst: 50, gone: 62 };

/** Crabulon died: its corpse takes its place. @param {Entity} dead @param {any} source */
export function onDied(dead, source) {
  let loc;
  let dim;
  let yaw = 0;
  try {
    loc = { ...dead.location };
    dim = dead.dimension;
    yaw = dead.getRotation().y;
  } catch {
    return;
  }
  let f;
  for (const g of fights.values()) if (g.bossId === dead.id) f = g;
  if (f) {
    yaw = f.yaw;
    loc = { ...f.pos };
    end(f);
  }
  try {
    dead.remove();
  } catch {
    /* the vanilla death plays instead */
  }
  let corpse;
  try {
    corpse = dim.spawnEntity(CORPSE, loc);
    corpse.setRotation({ x: 0, y: yaw });
  } catch {
    // (no corpse: the loot is dropped now)
    loot(dim, loc, source?.damagingEntity);
    return;
  }
  let killer = source?.damagingEntity;
  if (!U.isValid(killer) || killer.typeId !== "minecraft:player") killer = undefined;
  corpses.set(corpse.id, { e: corpse, dim, loc, t: 0, killer });
  sound(dim, "mob.ravager.death", loc, 5, 0.4);
  sound(dim, "mob.enderdragon.growl", loc, 3, 0.4);
  U.tell(dim, loc, 80, "§b§lCrabulon has been defeated" + (killer ? " by §f" + /** @type {Player} */ (killer).name + "§b§l" : "") + "!");
}

/** What it leaves: a Spore Scroll and a Shroomed Eye, and experience. @param {Dimension} dim @param {Vector3} at @param {Entity | undefined} killer */
function loot(dim, at, killer) {
  for (const id of [SCROLL, EYE]) {
    try {
      const it = dim.spawnItem(new ItemStack(id, 1), { x: at.x + U.rand(-0.5, 0.5), y: at.y + 1.2, z: at.z + U.rand(-0.5, 0.5) });
      it.applyImpulse({ x: U.rand(-0.15, 0.15), y: 0.3, z: U.rand(-0.15, 0.15) });
    } catch {
      /* ignore */
    }
  }
  let who = killer && U.isValid(killer) ? /** @type {Player} */ (killer) : undefined;
  if (!who) {
    try {
      who = dim.getPlayers({ location: at, maxDistance: 64, closest: 1 })[0];
    } catch {
      who = undefined;
    }
  }
  try {
    who?.addExperience(CFG.xp);
  } catch {
    /* ignore */
  }
}

/** @param {any} c @param {string} id */
function corpseTick(c, id) {
  c.t++;
  if (!U.isValid(c.e)) {
    corpses.delete(id);
    return;
  }
  if (c.t % 10 === 0 && c.t < DEATH.burst) U.particle(c.dim, "zt:spore_pop", { x: c.loc.x + U.rand(-3, 3), y: c.loc.y + U.rand(1, 5), z: c.loc.z + U.rand(-3, 3) });
  if (c.t === DEATH.burst) {
    const at = { x: c.loc.x, y: c.loc.y + 3, z: c.loc.z };
    U.particle(c.dim, "zt:totem_flash", at);
    U.particle(c.dim, "zt:slam_dust", { x: c.loc.x, y: c.loc.y + 0.2, z: c.loc.z });
    sound(c.dim, "random.explode", at, 4, 0.8);
    sound(c.dim, "random.totem", at, 2, 0.6);
    try {
      if (world.gameRules.doMobLoot) loot(c.dim, c.loc, c.killer);
    } catch {
      loot(c.dim, c.loc, c.killer);
    }
    try {
      c.e.setDynamicProperty("zt:looted", true);
    } catch {
      /* ignore */
    }
  }
  if (c.t >= DEATH.gone) {
    try {
      c.e.remove();
    } catch {
      /* ignore */
    }
    corpses.delete(id);
  }
}

// ---------------------------------------------------------------- each tick
/** Picks up a Crabulon the script lost track of (the world was closed mid-fight), and clears up. */
function adopt() {
  for (const dimId of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) {
    let dim;
    try {
      dim = world.getDimension(dimId);
    } catch {
      continue;
    }
    let bosses = [];
    try {
      bosses = dim.getEntities({ type: BOSS });
    } catch {
      bosses = [];
    }
    for (const e of bosses) {
      if ([...fights.values()].some((f) => f.bossId === e.id)) continue;
      const l = e.location;
      const fort = Fortress.arenaAt(dimId, l, 4);
      const altar = fort?.altar ? { x: fort.altar[0], y: fort.altar[1], z: fort.altar[2] } : { x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) };
      const key = `${dimId}|${altar.x},${altar.y},${altar.z}`;
      if (fights.has(key)) continue;
      const arena = arenaFor(dim, altar, undefined);
      /** @type {any} */
      const f = { key, dim, arena, phase: "fight", t: 0, anim: ANIM.NONE, at: 0, drops: [], waves: [], alone: 0, enraged: false,
        next: 20, last: "", strafe: 1, strafeUntil: 0, spin: 0, boss: e, bossId: e.id, viewers: [], pos: { ...l }, yaw: e.getRotation().y };
      f.pos.y = floorAt(f, l.x, l.z);
      prop(e, "zt:intro", false);
      prop(e, "zt:anim", ANIM.NONE);
      f.enraged = hp(f) < HP / 2;
      fights.set(key, f);
    }
    // a corpse left over: its loot (if it hadn't been given) and gone
    let left = [];
    try {
      left = dim.getEntities({ type: CORPSE });
    } catch {
      left = [];
    }
    for (const e of left) {
      if (corpses.has(e.id)) continue;
      let looted = false;
      try {
        looted = !!e.getDynamicProperty("zt:looted");
      } catch {
        looted = false;
      }
      corpses.set(e.id, { e, dim, loc: { ...e.location }, t: looted ? DEATH.gone - 1 : DEATH.burst - 1, killer: undefined });
    }
    // a totem left floating with no summoning going on
    try {
      for (const e of dim.getEntities({ type: TOTEM_DISPLAY })) {
        if (![...fights.values()].some((f) => f.totem === e)) e.remove();
      }
    } catch {
      /* ignore */
    }
  }
}

/** @param {number} tick */
export function crabulonTick(tick) {
  if (tick % 40 === 7) adopt();
  for (const f of [...fights.values()]) {
    try {
      if (f.phase === "intro") introTick(f);
      else if (f.phase === "fight") fightTick(f);
      else if (f.phase === "leaving") leavingTick(f);
      dropsTick(f);
      wavesTick(f);
    } catch (err) {
      console.warn("[Titans] Crabulon: " + err);
      end(f);
    }
  }
  for (const [id, c] of corpses) corpseTick(c, id);
}

system.beforeEvents.startup.subscribe((ev) => {
  try {
    ev.blockComponentRegistry.registerCustomComponent("zt:shroomed_altar", {
      onPlayerInteract: (/** @type {any} */ e) => {
        try {
          if (e.player) useAltar(e.player, e.block);
        } catch (err) {
          console.warn("[Titans] Shroomed Altar: " + err);
        }
      },
    });
  } catch (err) {
    console.warn("[Titans] can't register zt:shroomed_altar: " + err);
  }
});
