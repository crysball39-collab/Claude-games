// The end game: finding a stronghold, lighting its portal, the Ender Dragon, and after.
//
// There is no way for a script to ask where a stronghold is, so a Player finds one as a player
// without eyes to spare might: where eyes of ender thrown by real players flew (it watches),
// under the villages near the middle of the world (Bedrock puts strongholds under some of
// them), or by looking underground as it explores. In the stronghold it follows the corridors
// to the portal room. In the End it shoots down the crystals (or climbs to the caged ones if it
// is strong enough), hits the dragon when it lands on the fountain and shoots it when it flies;
// then goes home through the exit portal, or, if it's the curious kind, through a gateway to
// the outer islands to raid an end city for its loot and an elytra.
import { ItemStack, system } from "@minecraft/server";
import * as B from "./bot_body.js";
import * as Build from "./bot_build.js";
import * as C from "./bot_combat.js";
import * as D from "./bot_data.js";
import * as G from "./bot_gather.js";
import * as Inv from "./bot_inv.js";
import * as S from "./bot_skills.js";
import * as Sense from "./bot_senses.js";
import * as T from "./bot_travel.js";
import * as W from "./bot_world.js";
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {import("@minecraft/server").Entity} Entity */

const m = D.mc;
const OW = "minecraft:overworld";
const END = "minecraft:the_end";
/** Blocks only strongholds are built of (with the portal frame itself). */
const MARK = [m("end_portal_frame"), m("mossy_stone_bricks"), m("cracked_stone_bricks"), m("infested_mossy_stone_bricks"),
  m("infested_cracked_stone_bricks"), m("infested_stone_bricks")];
const CORRIDOR = [m("stone_bricks"), m("mossy_stone_bricks"), m("cracked_stone_bricks")];

// ---------------------------------------------------------------- the stronghold
/**
 * Look underground below it for a stronghold: slices of the ground from just under its feet
 * down to the deepslate. True if it found one (and remembers it).
 * @param {any} bot @param {boolean} [wide]
 */
export function* probe(bot, wide = false) {
  const dim = bot.entity.dimension;
  if (dim.id !== OW) return false;
  const f = B.feet(bot);
  const lo = Math.max(dim.heightRange.min + 2, -56);
  const r = wide ? 24 : 16;
  let bricks = 0;
  /** @type {Vector3 | undefined} */
  let first;
  for (let y = Math.min(f.y - 4, 60); y >= lo; y -= 12) {
    for (const p of S.findBlocks(dim, { x: f.x, y: y - 6, z: f.z }, MARK, r, 6)) {
      if (B.idAt(dim, p) === m("end_portal_frame")) {
        W.remember("stronghold", OW, p, { room: p }, 160);
        bot.events.push({ kind: "found_stronghold", room: true, at: system.currentTick });
        return true;
      }
      bricks++;
      first ??= p;
    }
    yield;
  }
  if (bricks >= 6 && first) {
    W.remember("stronghold", OW, first, {}, 160);
    bot.events.push({ kind: "found_stronghold", at: system.currentTick });
    return true;
  }
  return false;
}

/**
 * Down into a stronghold and along its corridors until it finds the portal room.
 * @param {any} bot @param {any} sh
 */
function* exploreStronghold(bot, sh) {
  G.doing(bot, "exploring a stronghold");
  if (B.flat(bot.entity.location, sh.pos) > 12) {
    if (!(yield* T.travel(bot, sh.pos, { r: 8 }))) return false;
  }
  if (B.dist(bot.entity.location, sh.pos) > 6) {
    // a staircase down to it
    yield* S.goTo(bot, { ...sh.pos, y: sh.pos.y + 1, r: 3 }, { tries: 4, weight: 4, maxNodes: 3000, digAny: true });
  }
  const visited = [];
  for (let hop = 0; hop < 18; hop++) {
    if (bot.abort) return false;
    const dim = bot.entity.dimension;
    const f = Build.endFrame(dim, bot.entity.location);
    if (f) {
      W.remember("stronghold", OW, sh.pos, { room: f.centre }, 160);
      bot.events.push({ kind: "found_portal_room", at: system.currentTick });
      return true;
    }
    const frame = S.findBlocks(dim, bot.entity.location, [m("end_portal_frame")], 32, 10)[0];
    if (frame) {
      yield* S.goTo(bot, { ...frame, r: 4 }, { tries: 2, maxNodes: 3000, digAny: true });
      continue;
    }
    // further along: corridor stone it hasn't been near
    visited.push({ ...B.feet(bot) });
    const bricks = S.findBlocks(dim, bot.entity.location, CORRIDOR, 32, 10)
      .filter((p) => visited.every((v) => B.dist(v, p) > 14));
    if (!bricks.length) return false;
    const pick = bricks[Math.min(bricks.length - 1, 3 + Math.floor(Math.random() * 8))];
    yield* S.goTo(bot, { x: pick.x, y: pick.y + 1, z: pick.z, r: 3 }, { tries: 1, maxNodes: 2500, digAny: true });
  }
  return false;
}

/**
 * Find a stronghold's portal room (true when it knows where one is).
 * @param {any} bot
 */
export function* findStronghold(bot) {
  if (bot.entity.dimension.id !== OW) return false;
  for (let round = 0; round < 8; round++) {
    if (bot.abort) return false;
    const here = bot.entity.location;
    const known = W.recall("stronghold", OW, here);
    if (known.some((s) => s.room)) return true;
    const sh = known.find((s) => (s.tries ?? 0) < 3);
    if (sh) {
      if (yield* exploreStronghold(bot, sh)) return true;
      sh.tries = (sh.tries ?? 0) + 1;
      W.changed();
      continue;
    }
    // where thrown eyes of ender pointed
    const guess = W.strongholdGuess(OW, here);
    if (guess) {
      G.doing(bot, "following where the eyes of ender flew");
      const got = yield* T.travel(bot, guess, { r: 24, legs: 40, onLeg: () => probe(bot) });
      if (got && (yield* probe(bot, true))) continue;
      if (guess.line) {
        // that line led nowhere near: forget it
        W.forget("eye", guess.line);
      }
      continue;
    }
    // under the villages near the middle of the world
    const village = W.recall("village", OW, here).find((v) => !v.probed && Math.hypot(v.pos.x, v.pos.z) < 3000);
    if (village) {
      G.doing(bot, "checking under a village for a stronghold");
      if (yield* T.travel(bot, village.pos, { r: 16, onLeg: () => probe(bot) })) yield* probe(bot, true);
      village.probed = true;
      W.changed();
      continue;
    }
    // out exploring, looking down every so often; strongholds are never right at the middle
    G.doing(bot, "looking for a stronghold");
    const l = bot.entity.location;
    const fromMid = Math.hypot(l.x, l.z);
    bot.shYaw ??= Math.random() * 360;
    if (fromMid < 300) bot.shYaw = (Math.atan2(-l.x, l.z) * 180) / Math.PI + (Math.random() - 0.5) * 60;
    else bot.shYaw += 25 + Math.random() * 20;
    const fw = B.forward(bot.shYaw);
    yield* T.travel(bot, { x: l.x + fw.x * 160, z: l.z + fw.z * 160 }, { r: 12, legs: 12, onLeg: () => probe(bot) });
  }
  return W.recall("stronghold", OW).some((s) => s.room);
}

/**
 * To the portal room, eyes in the frame, and in.
 * @param {any} bot
 */
export function* toTheEnd(bot) {
  if (bot.entity.dimension.id === END) return true;
  if (bot.entity.dimension.id !== OW) return false;
  const sh = W.recall("stronghold", OW, bot.entity.location).find((s) => s.room);
  if (!sh) return false;
  G.doing(bot, "heading to the End portal");
  if (B.flat(bot.entity.location, sh.room) > 12 && !(yield* T.travel(bot, sh.room, { r: 10 }))) return false;
  if (B.dist(bot.entity.location, sh.room) > 6) {
    yield* S.goTo(bot, { ...sh.room, y: sh.room.y + 1, r: 4 }, { tries: 4, weight: 4, maxNodes: 3000, digAny: true });
  }
  const dim = bot.entity.dimension;
  const f = Build.endFrame(dim, bot.entity.location);
  if (!f) {
    if (B.dist(bot.entity.location, sh.room) < 10) {
      sh.room = undefined;
      W.changed();
    }
    return false;
  }
  if (!Build.endPortalOpen(dim, f.centre) && !(yield* Build.lightEndPortal(bot, f.centre))) return false;
  const ok = yield* T.enterEndPortal(bot, f);
  if (ok) bot.events.push({ kind: "entered_end", at: system.currentTick });
  return ok;
}

// ---------------------------------------------------------------- the dragon
/** The top of the bedrock fountain in the middle of the island. @param {any} dim */
export function fountain(dim) {
  try {
    const top = dim.getTopmostBlock({ x: 0, z: 0 });
    if (top && top.typeId === m("bedrock")) return { x: 0, y: top.location.y, z: 0 };
  } catch {
    /* not loaded */
  }
  return { x: 0, y: 64, z: 0 };
}
/** @param {any} dim */
function dragonOf(dim) {
  try {
    return dim.getEntities({ type: "minecraft:ender_dragon" }).find((e) => C.alive(e));
  } catch {
    return undefined;
  }
}
/** @param {any} dim */
function crystalsOf(dim) {
  try {
    return dim.getEntities({ type: "minecraft:ender_crystal", location: { x: 0, y: 70, z: 0 }, maxDistance: 140 }).filter((e) => e.isValid);
  } catch {
    return [];
  }
}
/** Has the dragon been beaten in this world? */
export function dragonDead() {
  return W.recall("dragon", END).some((d) => d.dead);
}
/** On the fountain, or about to land on it. @param {Entity} d @param {Vector3} f */
function perched(d, f) {
  const l = d.location;
  return Math.hypot(l.x - f.x, l.z - f.z) < 10 && l.y < f.y + 9;
}
/** The exit portal (open once the dragon dies). @param {any} dim @param {Vector3} f */
function exitPortal(dim, f) {
  return S.findBlocks(dim, f, [m("end_portal")], 4, 6)[0];
}
/** Clouds of dragon's breath near it. @param {any} bot */
function breathNear(bot) {
  try {
    return bot.entity.dimension.getEntities({ type: "minecraft:area_effect_cloud", location: bot.entity.location, maxDistance: 5 });
  } catch {
    return [];
  }
}

/**
 * A crystal: shot from the ground if it can see it, or (caged ones, or without a bow) climbed
 * to and broken, if it's strong enough to take the blast.
 * @param {any} bot @param {Entity} c
 */
function* breakCrystal(bot, c) {
  const dim = bot.entity.dimension;
  const at = { ...c.location };
  bot.skipCrystals ??= new Set();
  if (C.canShoot(bot)) {
    G.doing(bot, "shooting the End crystals");
    const ok = yield* S.goTo(bot, { x: Math.floor(at.x), z: Math.floor(at.z), r: 12, test: (x, y, z) => {
      const d = Math.hypot(x - at.x, z - at.z);
      return d >= 10 && d <= 22 && y < at.y - 4;
    } }, { tries: 2, maxNodes: 2000 });
    if (ok && Sense.clearSight(dim, B.eye(bot), { x: at.x, y: at.y + 1, z: at.z })) {
      for (let k = 0; k < 6 && c.isValid && C.canShoot(bot); k++) {
        yield* C.shoot(bot, c);
        yield* S.wait(10);
      }
      if (!c.isValid) return true;
    }
  }
  const strong = B.health(bot) >= 16 && Inv.armorPoints(bot) >= 12 && S.scaffoldCount(bot) >= 32;
  if (!strong) {
    bot.skipCrystals.add(c.id);
    return false;
  }
  G.doing(bot, "climbing to an End crystal");
  const ok = yield* S.goTo(bot, { x: Math.floor(at.x), y: Math.floor(at.y) - 1, z: Math.floor(at.z), r: 3.4 }, { tries: 3, maxNodes: 3000, digAny: true });
  if (!ok || !c.isValid) {
    if (c.isValid) bot.skipCrystals.add(c.id);
    return !c.isValid;
  }
  // bars in the way
  for (const p of S.findBlocks(dim, at, [m("iron_bars")], 2, 2).slice(0, 4)) {
    if (B.dist(B.eye(bot), p) < 4.5) yield* S.mineBlock(bot, p, { noCollect: true, pathing: true });
  }
  if (C.canShoot(bot)) yield* C.shoot(bot, c, { draw: 12 });
  else {
    C.armUp(bot);
    for (let k = 0; k < 20 && c.isValid; k++) {
      C.hit(bot, c, system.currentTick);
      yield;
    }
  }
  yield* S.wait(10);
  // and back down its pillar
  const f = fountain(dim);
  yield* S.goTo(bot, { x: Math.floor(at.x), z: Math.floor(at.z), r: 8, test: (x, y, z) => y <= f.y + 2 && Math.hypot(x - at.x, z - at.z) < 14 },
    { tries: 3, maxNodes: 2500, digAny: true });
  return !c.isValid;
}

/**
 * The fight: crystals first, then the dragon itself, hit when it lands on the fountain and
 * shot when it flies past.
 * @param {any} bot
 */
export function* dragonFight(bot) {
  const dim = bot.entity.dimension;
  if (dim.id !== END) return false;
  // in the void with nothing under it: the arrival platform
  if (!D.isFloor(B.idAt(dim, { ...bot.entity.location, y: bot.entity.location.y - 1 })) && Math.abs(bot.entity.location.x - 100) < 4) {
    T.endPlatform(dim);
  }
  G.doing(bot, "fighting the Ender Dragon");
  const f = fountain(dim);
  if (B.flat(bot.entity.location, f) > 70) yield* T.travel(bot, f, { r: 40, legs: 12 });
  for (let round = 0; round < 120; round++) {
    if (bot.abort) return false;
    if (dragonDead()) break;
    const d = dragonOf(dim);
    if (!d) {
      // no dragon about: if the exit portal is open it's dead
      if (exitPortal(dim, f) && round > 3) {
        W.remember("dragon", END, f, { dead: true }, 300);
        break;
      }
      yield* S.wait(40);
      continue;
    }
    if (breathNear(bot).length) {
      yield* C.flee(bot, breathNear(bot).map((c) => c.location), 8);
      continue;
    }
    if (perched(d, f)) {
      G.doing(bot, "hitting the Ender Dragon");
      yield* C.fight(bot, d, { ticks: 120, giveUp: 20, fleeHp: 4 });
      continue;
    }
    const crystals = crystalsOf(dim).filter((c) => !bot.skipCrystals?.has(c.id));
    if (crystals.length) {
      crystals.sort((a, b) => B.dist(a.location, bot.entity.location) - B.dist(b.location, bot.entity.location));
      yield* breakCrystal(bot, crystals[0]);
      continue;
    }
    // wait by the fountain for it to land, shooting when it comes near
    if (B.flat(bot.entity.location, f) > 12) yield* S.goTo(bot, { x: f.x + 7, z: f.z, r: 4 }, { tries: 1, maxNodes: 1500 });
    if (C.canShoot(bot) && B.dist(d.location, bot.entity.location) < 40) yield* C.shoot(bot, d);
    else {
      B.lookAtEntity(bot, d, 20, 2);
      yield* S.wait(20);
    }
  }
  if (!dragonDead()) return false;
  // the experience it drops
  yield* S.collect(bot, f, 14, 120);
  bot.progress.dragon = true;
  bot.events.push({ kind: "dragon_dead", at: system.currentTick });
  return true;
}

// ---------------------------------------------------------------- after the dragon
/** The End gateways stand on a ring around the island. @param {any} dim */
function findGateway(dim) {
  for (let i = 0; i < 20; i++) {
    const a = (2 * Math.PI * i) / 20;
    const p = { x: Math.floor(96 * Math.cos(a)), y: 75, z: Math.floor(96 * Math.sin(a)) };
    if (/gateway/.test(B.idAt(dim, p))) return p;
  }
  return undefined;
}
/** Solid ground on the outer islands near a point (loading the world there first). @param {any} bot @param {Vector3} dest @param {Vector3} dir */
function* findLand(bot, dest, dir) {
  const dim = bot.entity.dimension;
  const name = "zt_isle_" + bot.uid.slice(0, 5);
  for (let step = 0; step < 5; step++) {
    const c = { x: Math.floor(dest.x + dir.x * 64 * step), y: 64, z: Math.floor(dest.z + dir.z * 64 * step) };
    if (!(yield* T.loadAt(dim, c, name))) continue;
    for (let r = 0; r <= 40; r += 8) {
      for (let a = 0; a < (r ? 8 : 1); a++) {
        const x = Math.floor(c.x + Math.cos((a * Math.PI) / 4) * r);
        const z = Math.floor(c.z + Math.sin((a * Math.PI) / 4) * r);
        let top;
        try {
          top = dim.getTopmostBlock({ x, z });
        } catch {
          top = undefined;
        }
        if (top && top.typeId === m("end_stone")) {
          T.unload(dim, name);
          return { x, y: top.location.y + 1, z };
        }
      }
      yield;
    }
    T.unload(dim, name);
  }
  return undefined;
}
const CITY = [m("purpur_block"), m("purpur_pillar"), m("purpur_stairs"), m("end_bricks"), m("end_rod"), m("end_brick_stairs")];
/** The tallest end city block in sight from the island tops around it. @param {any} bot */
function* spotCity(bot) {
  const dim = bot.entity.dimension;
  const l = bot.entity.location;
  let best;
  for (let dx = -48; dx <= 48; dx += 8) {
    for (let dz = -48; dz <= 48; dz += 8) {
      let top;
      try {
        top = dim.getTopmostBlock({ x: l.x + dx, z: l.z + dz });
      } catch {
        top = undefined;
      }
      if (top && CITY.includes(top.typeId) && (!best || top.location.y > best.y)) best = { ...top.location };
    }
    yield;
  }
  if (best) W.remember("city", END, best, {}, 64);
  return best;
}
/**
 * Raid an end city: every chest (an unopened one is filled from the end city loot as the game
 * does), then the ship's item frame for its elytra and the dragon head on its bow.
 * @param {any} bot @param {Vector3} city
 */
function* raidCity(bot, city) {
  const dim = bot.entity.dimension;
  G.doing(bot, "raiding an end city");
  if (B.flat(bot.entity.location, city) > 20) yield* T.travel(bot, city, { r: 12, digAny: true, legs: 10 });
  const chests = S.findBlocks(dim, { ...city, y: city.y - 30 }, [m("chest")], 24, 40);
  for (const c of chests.slice(0, 8)) {
    if (W.looted(dim.id, c)) continue;
    if (!(yield* S.goTo(bot, { ...c, r: 2.5 }, { tries: 2, maxNodes: 3000, digAny: true }))) continue;
    try {
      const inv = dim.getBlock(c)?.getComponent("minecraft:inventory")?.container;
      if (inv && inv.emptySlotsCount === inv.size) dim.runCommand(`loot insert ${c.x} ${c.y} ${c.z} loot "chests/end_city_treasure"`);
    } catch {
      /* the command isn't there: take what's in it */
    }
    yield* S.lootChest(bot, c);
    W.markLooted(dim.id, c);
  }
  // the ship: an item frame with an elytra
  const frame = S.findBlocks(dim, { ...city, y: city.y - 20 }, [m("frame")], 40, 30).find((p) => !W.looted(dim.id, p));
  if (frame && (yield* S.goTo(bot, { ...frame, r: 2.5 }, { tries: 3, maxNodes: 3000, digAny: true }))) {
    B.lookAt(bot, { x: frame.x + 0.5, y: frame.y + 0.5, z: frame.z + 0.5 }, 20, 4);
    yield* S.wait(6);
    B.swing(bot);
    try {
      dim.setBlockType(frame, "minecraft:air");
      dim.playSound("block.itemframe.break", frame, { volume: 0.8, pitch: 1 });
      const drop = { x: frame.x + 0.5, y: frame.y + 0.5, z: frame.z + 0.5 };
      dim.spawnItem(new ItemStack(m("elytra"), 1), drop);
      dim.spawnItem(new ItemStack(m("frame"), 1), drop);
    } catch {
      /* ignore */
    }
    W.markLooted(dim.id, frame);
    yield* S.collect(bot, frame, 4, 40);
    if (Inv.has(bot, m("elytra"))) bot.events.push({ kind: "elytra", at: system.currentTick });
    const head = S.findBlocks(dim, frame, [m("dragon_head")], 12, 6)[0];
    if (head) yield* S.mineBlock(bot, head);
  }
  return true;
}
/**
 * Out through a gateway: up beside it, an ender pearl thrown in, and out on the outer islands
 * far along the same line.
 * @param {any} bot
 */
function* throughGateway(bot) {
  const dim = bot.entity.dimension;
  const gw = findGateway(dim);
  if (!gw || !Inv.has(bot, m("ender_pearl"))) return undefined;
  G.doing(bot, "going through an End gateway");
  if (!(yield* S.goTo(bot, { ...gw, r: 2.6 }, { tries: 4, maxNodes: 3000 }))) return undefined;
  const throwSpot = { ...bot.entity.location };
  B.lookAt(bot, { x: gw.x + 0.5, y: gw.y + 0.5, z: gw.z + 0.5 }, 20, 4);
  yield* S.wait(8);
  Inv.hold(bot, m("ender_pearl"));
  B.setUse(bot, 5);
  B.swing(bot);
  Inv.take(bot, m("ender_pearl"), 1);
  try {
    dim.playSound("random.bow", throwSpot, { volume: 0.6, pitch: 0.5 });
  } catch {
    /* ignore */
  }
  yield* S.wait(12);
  B.setUse(bot, 0);
  const d = Math.hypot(gw.x, gw.z) || 1;
  const dir = { x: gw.x / d, y: 0, z: gw.z / d };
  const land = yield* findLand(bot, { x: dir.x * 1024, y: 64, z: dir.z * 1024 }, dir);
  if (!land) return undefined;
  try {
    bot.entity.teleport({ x: land.x + 0.5, y: land.y, z: land.z + 0.5 });
    dim.playSound("mob.endermen.portal", land, { volume: 0.6, pitch: 1 });
  } catch {
    return undefined;
  }
  return { gw, throwSpot, land, dir };
}

/**
 * After the dragon: home through the exit portal, or first (if it's curious, with a pearl and
 * blocks to bridge with) out to the end cities.
 * @param {any} bot
 */
export function* afterDragon(bot) {
  const dim = bot.entity.dimension;
  if (dim.id !== END) {
    bot.progress.after = true;
    return true;
  }
  const f = fountain(dim);
  if (!bot.progress.cities && bot.persona.curious > 0.45 && S.scaffoldCount(bot) >= 32) {
    bot.progress.cities = true;
    const trip = yield* throughGateway(bot);
    if (trip) {
      for (let leg = 0; leg < 16; leg++) {
        if (bot.abort) return false;
        const city = yield* spotCity(bot);
        if (city) {
          yield* raidCity(bot, city);
          if (Inv.has(bot, m("elytra"))) break;
        }
        const l = bot.entity.location;
        yield* T.travel(bot, { x: l.x + trip.dir.x * 48 + (Math.random() - 0.5) * 30, z: l.z + trip.dir.z * 48 + (Math.random() - 0.5) * 30 }, { r: 8, legs: 4 });
      }
      // back the way it came: the gateway out here leads back to the island
      G.doing(bot, "heading back through the gateway");
      yield* T.travel(bot, trip.land, { r: 4, legs: 30 });
      try {
        bot.entity.teleport(trip.throwSpot);
        dim.playSound("mob.endermen.portal", trip.throwSpot, { volume: 0.6, pitch: 1 });
      } catch {
        /* ignore */
      }
      yield* S.wait(10);
    }
  }
  const portal = exitPortal(dim, f);
  if (!portal) return false;
  G.doing(bot, "going home");
  const ok = yield* T.exitEnd(bot, portal, () => bot.homePoint());
  if (ok) {
    bot.progress.after = true;
    bot.events.push({ kind: "home_from_end", at: system.currentTick });
  }
  return ok;
}
