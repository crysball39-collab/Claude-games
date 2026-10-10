// A Player's mind: what it does from moment to moment. Every half second it weighs what needs
// doing, most urgent first: getting out of lava or a wall, running from what it can't fight,
// fighting off what attacks it (or its friends), eating, drinking a potion, what friends ask,
// following or waiting for a friend, sleeping at night, greeting people, chores (a full
// inventory, a furnace to empty, torches, repairs, trades), getting on with the game, and when
// there's nothing else, wandering about. A more urgent thing interrupts a less urgent one; now
// and then, between things, it stops to think.
import { ItemStack, system, world } from "@minecraft/server";
import * as B from "./bot_body.js";
import * as Build from "./bot_build.js";
import * as C from "./bot_combat.js";
import * as D from "./bot_data.js";
import * as G from "./bot_gather.js";
import * as Inv from "./bot_inv.js";
import * as P from "./bot_progress.js";
import * as Sense from "./bot_senses.js";
import * as S from "./bot_skills.js";
import * as St from "./bot_stations.js";
import * as T from "./bot_travel.js";
import * as W from "./bot_world.js";
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {{name: string, prio: number, gen: () => Generator<undefined, any>, ttl?: number}} Offer */

const m = D.mc;
export const PRIO = { danger: 100, flee: 90, fight: 80, heal: 75, eat: 70, request: 60, sleep: 55, follow: 50, greet: 45, recover: 44,
  chores: 40, progress: 30, think: 20, idle: 5 };

// ---------------------------------------------------------------- running tasks
/** End the task it's doing (its `finally` blocks run: it lets go of what it held). @param {any} bot */
export function stopTask(bot) {
  const t = bot.task;
  bot.task = null;
  if (t) {
    bot.abort = true;
    try {
      t.gen.return(undefined);
    } catch {
      /* ignore */
    } finally {
      bot.abort = false;
    }
  }
  B.stop(bot);
  bot.sneak = false;
  bot.slow = false;
  bot.busyLook = false;
  if (bot.pose === 3) B.setPose(bot, 0);
  if (bot.use !== 0) B.setUse(bot, 0);
}
/** @param {any} bot @param {Offer} o @param {number} now */
function startTask(bot, o, now) {
  stopTask(bot);
  bot.task = { name: o.name, prio: o.prio, gen: o.gen(), since: now, ttl: o.ttl ?? 12000 };
  bot.taskName = o.name;
}
/** @param {any} bot @param {boolean} ok @param {number} now */
function finishTask(bot, ok, now) {
  const t = bot.task;
  bot.task = null;
  bot.lastTask = t?.name ?? "";
  bot.lastResult = ok;
  B.stop(bot);
  bot.sneak = false;
  bot.slow = false;
  bot.busyLook = false;
  if (bot.use !== 0 && bot.use !== 7) B.setUse(bot, 0);
  // a breather between things
  const thoughtful = 0.1 + (1 - bot.persona.chatty) * 0.15;
  if (t && t.name !== "think" && t.name !== "idle" && (!ok || Math.random() < thoughtful)) bot.thinkNext = true;
  if (t && !ok) (bot.driveCool ??= {})[t.name] = now + (t.name === "progress" ? 60 : 100);
}

// ---------------------------------------------------------------- the drives
/** Things to see to first: lava, a block in its face, drowning, falling. @param {any} bot @returns {Offer | undefined} */
function danger(bot) {
  const e = bot.entity;
  const dim = e.dimension;
  const l = e.location;
  const feet = B.idAt(dim, l);
  const head = B.idAt(dim, { x: l.x, y: l.y + 1.5, z: l.z });
  if (/lava/.test(feet) || /lava/.test(head)) return { name: "lava", prio: PRIO.danger, gen: () => escapeLava(bot), ttl: 200 };
  const hk = D.blockInfo(head).kind;
  if ((hk === "solid") && bot.pose !== 3 && D.blockInfo(head).h >= 0) return { name: "unstuck", prio: PRIO.danger, gen: () => unstuck(bot, B.blockPos({ x: l.x, y: l.y + 1.5, z: l.z })), ttl: 300 };
  bot.underwater = bot.headInWater ? (bot.underwater ?? 0) + 10 : 0;
  if (bot.underwater > 180) return { name: "air", prio: PRIO.danger, gen: () => surface(bot), ttl: 300 };
  // falling far with water to hand: a bucket clutch
  let v;
  try {
    v = e.getVelocity();
  } catch {
    v = { x: 0, y: 0, z: 0 };
  }
  if (!bot.onGround && !bot.inWater && v.y < -0.75 && Inv.has(bot, m("water_bucket"))) {
    return { name: "clutch", prio: PRIO.danger, gen: () => clutch(bot), ttl: 80 };
  }
  let burning = false;
  try {
    burning = !!e.getComponent("minecraft:onfire");
  } catch {
    burning = false;
  }
  if (burning && !bot.inWater && St.hasPotion(bot, "fire_resistance") && !e.getEffect?.("fire_resistance")) {
    return { name: "fireres", prio: PRIO.danger, gen: () => St.drink(bot, "fire_resistance"), ttl: 60 };
  }
  return undefined;
}
/** @param {any} bot */
function* escapeLava(bot) {
  if (St.hasPotion(bot, "fire_resistance")) {
    try {
      if (!bot.entity.getEffect("fire_resistance")) yield* St.drink(bot, "fire_resistance");
    } catch {
      /* ignore */
    }
  }
  const dim = bot.entity.dimension;
  const f = B.feet(bot);
  let best;
  let bestD = Infinity;
  for (let dx = -4; dx <= 4; dx++) {
    for (let dz = -4; dz <= 4; dz++) {
      for (let dy = -1; dy <= 2; dy++) {
        const p = { x: f.x + dx, y: f.y + dy, z: f.z + dz };
        const k = D.blockInfo(B.idAt(dim, p)).kind;
        if (k !== "air" && k !== "pass") continue;
        if (D.blockInfo(B.idAt(dim, { ...p, y: p.y + 1 })).kind !== "air") continue;
        if (!D.isFloor(B.idAt(dim, { ...p, y: p.y - 1 }))) continue;
        const d = Math.hypot(dx, dy, dz);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
    }
  }
  for (let t = 0; t < 100; t++) {
    const l = bot.entity.location;
    if (!/lava/.test(B.idAt(dim, l)) && !/lava/.test(B.idAt(dim, { ...l, y: l.y + 1 }))) break;
    if (best) B.moveTo(bot, { x: best.x + 0.5, y: best.y, z: best.z + 0.5 }, { speed: "sprint", tol: 0.2 });
    B.jump(bot);
    yield;
  }
  B.stop(bot);
  return true;
}
/** Its head is in a block (gravel fell on it, it was squeezed): dig out. @param {any} bot @param {any} p */
function* unstuck(bot, p) {
  const ok = yield* S.mineBlock(bot, p, { pathing: true, noCollect: true });
  if (!ok) {
    // can't dig it: step out of it
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const q = { x: p.x + dx, y: p.y, z: p.z + dz };
      if (D.blockInfo(B.idAt(bot.entity.dimension, q)).kind === "air") {
        for (let t = 0; t < 20; t++) {
          B.moveTo(bot, { x: q.x + 0.5, y: q.y - 1, z: q.z + 0.5 });
          yield;
        }
        break;
      }
    }
  }
  return true;
}
/** Up for air. @param {any} bot */
function* surface(bot) {
  const dim = bot.entity.dimension;
  for (let t = 0; t < 200 && bot.headInWater; t++) {
    const l = bot.entity.location;
    if (D.isFloor(B.idAt(dim, { ...l, y: l.y + 2 }))) {
      // a ceiling: sideways to open water
      B.moveTo(bot, { x: l.x + B.forward(bot.yaw).x * 2, y: l.y + 2, z: l.z + B.forward(bot.yaw).z * 2 });
    } else B.moveTo(bot, { x: l.x, y: l.y + 3, z: l.z });
    B.jump(bot);
    yield;
  }
  bot.underwater = 0;
  return true;
}
/** Water placed just before it lands breaks the fall; it scoops it back up after. @param {any} bot */
function* clutch(bot) {
  const dim = bot.entity.dimension;
  Inv.hold(bot, m("water_bucket"));
  B.lookAt(bot, { ...bot.entity.location, y: bot.entity.location.y - 5 }, 20, 6);
  for (let t = 0; t < 60 && !bot.onGround && !bot.inWater; t++) {
    const l = bot.entity.location;
    let ground;
    for (let dy = 1; dy <= 3 && !ground; dy++) {
      const q = { x: Math.floor(l.x), y: Math.floor(l.y) - dy, z: Math.floor(l.z) };
      if (D.isFloor(B.idAt(dim, q))) ground = q;
    }
    if (ground) {
      const p = { x: ground.x, y: ground.y + 1, z: ground.z };
      yield* S.placeBlock(bot, p, m("water_bucket"), { under: true });
      yield* S.until(() => bot.onGround || bot.inWater, 20);
      yield* S.wait(6);
      // and the water back in the bucket
      try {
        if (/water/.test(B.idAt(dim, p)) && Inv.has(bot, m("bucket"))) {
          dim.setBlockType(p, "minecraft:air");
          Inv.take(bot, m("bucket"), 1);
          Inv.add(bot, new ItemStack(m("water_bucket"), 1));
        }
      } catch {
        /* ignore */
      }
      return true;
    }
    yield;
  }
  return true;
}

/** Run from what it can't beat. @param {any} bot @returns {Offer | undefined} */
function flee(bot) {
  const dread = Sense.seenWhere(bot, (s) => Sense.DREAD.has(s.typeId) && B.dist(s.entity.location, bot.entity.location) < 24, 60);
  if (dread.length) return { name: "flee", prio: PRIO.flee, gen: () => C.flee(bot, dread.map((s) => s.entity.location), 30), ttl: 400 };
  // hurt: away from what's attacking (out of a skeleton's sight)
  const hp = B.health(bot);
  if (hp < 12) {
    const shooters = Sense.seenWhere(bot, (s) => C.RANGED.has(s.typeId) && Sense.isThreat(bot, s) && B.dist(s.entity.location, bot.entity.location) < 18, 60);
    if (shooters.length >= 2) {
      return { name: "flee", prio: PRIO.flee, ttl: 400, gen: () => C.flee(bot, shooters.map((s) => s.entity.location), 28) };
    }
  }
  if (hp <= 6 || (hp < 10 && bot.lastAttacker && C.RANGED.has(bot.lastAttacker.typeId) && system.currentTick - (bot.lastAttackerAt ?? 0) < 100)) {
    const near = Sense.seenWhere(bot, (s) => Sense.isThreat(bot, s) && B.dist(s.entity.location, bot.entity.location) < (C.RANGED.has(s.typeId) ? 18 : 10), 40);
    if (near.length) {
      return { name: "flee", prio: PRIO.flee, gen: function* () {
        // cornered with blocks to hand: up out of reach; else run
        if (S.scaffoldCount(bot) >= 4 && near.every((s) => !C.RANGED.has(s.typeId)) && near.length > 1) {
          if (yield* C.towerUp(bot, 3)) {
            yield* S.wait(200);
            return true;
          }
        }
        return yield* C.flee(bot, near.map((s) => s.entity.location), 24);
      }, ttl: 400 };
    }
  }
  return undefined;
}

/** The thing to fight right now, if any. @param {any} bot @param {number} now */
export function target(bot, now) {
  const l = bot.entity.location;
  bot.ignore ??= new Map();
  const ok = (e) => {
    try {
      return e && e.isValid && C.alive(e) && (bot.ignore.get(e.id) ?? 0) < now && e.dimension.id === bot.entity.dimension.id;
    } catch {
      return false;
    }
  };
  // whoever just hit it
  if (bot.lastAttacker && now - (bot.lastAttackerAt ?? 0) < 100 && ok(bot.lastAttacker) && B.dist(bot.lastAttacker.location, l) < 16) {
    const a = bot.lastAttacker;
    if (a.typeId !== "minecraft:player" || bot.persona.brave > 0.5 || bot.angry.has(a.id)) return a;
  }
  // something going for a friend
  if (bot.defend && ok(bot.defend) && B.dist(bot.defend.location, l) < 20) return bot.defend;
  // badly hurt: it only fights what's on top of it
  const weak = B.health(bot) < 10;
  const seen = Sense.seenWhere(bot, (s) => Sense.isThreat(bot, s) && !Sense.DREAD.has(s.typeId) && s.typeId !== "minecraft:ender_dragon" &&
    ok(s.entity) && B.dist(s.entity.location, l) < (weak ? 3.5 : C.RANGED.has(s.typeId) ? 18 : 12), 60);
  // a creeper is for hitting and backing off, unless it's hurt
  const pick = seen.find((s) => s.typeId !== "minecraft:creeper" || B.health(bot) > 8);
  return pick?.entity;
}
/** @param {any} bot @param {number} now @returns {Offer | undefined} */
function fight(bot, now) {
  const t = target(bot, now);
  if (!t) return undefined;
  return { name: "fight", prio: PRIO.fight, ttl: 1200, gen: function* () {
    const r = yield* C.fight(bot, t);
    if (r === "killed" && bot.lastTargetPos) yield* S.collect(bot, bot.lastTargetPos, 5, 40);
    else if (r === "lost" || r === "timeout") bot.ignore.set(t.id, system.currentTick + 400);
    else if (r === "flee") yield* C.flee(bot, [bot.lastTargetPos ?? t.location], 24);
    if (bot.defend === t) bot.defend = undefined;
    return r === "killed";
  } };
}

/** @param {any} bot @returns {Offer | undefined} */
function heal(bot) {
  const hp = B.health(bot);
  if (hp > 8) return undefined;
  if (St.hasPotion(bot, "healing")) return { name: "heal", prio: PRIO.heal, gen: () => St.drink(bot, "healing"), ttl: 60 };
  if (St.hasPotion(bot, "regeneration")) return { name: "heal", prio: PRIO.heal, gen: () => St.drink(bot, "regeneration"), ttl: 60 };
  let burning = false;
  try {
    burning = !!bot.entity.getComponent("minecraft:onfire") || (bot.entity.onFire ?? 0) > 0;
  } catch {
    burning = false;
  }
  if ((hp <= 6 || (hp <= 9 && burning)) && Inv.has(bot, m("golden_apple"))) {
    return { name: "heal", prio: PRIO.heal, gen: () => S.eat(bot, m("golden_apple")), ttl: 60 };
  }
  return undefined;
}
/** @param {any} bot @param {number} now @returns {Offer | undefined} */
function eat(bot, now) {
  const hp = B.health(bot);
  const want = bot.hunger <= 14 || (bot.hunger < 20 && hp < 14 && bot.hunger <= 17);
  if (!want) return undefined;
  const food = Inv.bestFood(bot, 20 - bot.hunger, bot.hunger <= 6);
  if (!food) return undefined;
  // a fight first, unless it's starving
  if (bot.hunger > 6 && target(bot, now)) return undefined;
  return { name: "eat", prio: PRIO.eat, gen: () => S.eat(bot, food), ttl: 80 };
}

/** Is it night (time to sleep)? */
function isNight() {
  const t = world.getTimeOfDay();
  return t >= 12542 && t <= 23400;
}
/** @param {any} bot @param {number} now @returns {Offer | undefined} */
function sleep(bot, now) {
  const e = bot.entity;
  if (e.dimension.id !== "minecraft:overworld" || !isNight() || bot.pose === 3) return undefined;
  if (bot.follow || target(bot, now)) return undefined;
  // a bed it knows nearby, or one it carries
  const bed = bot.spawn?.dim === e.dimension.id && B.dist(bot.spawn.pos, e.location) < 64 && /bed/.test(B.idAt(e.dimension, bot.spawn.pos)) ? bot.spawn.pos
    : bot.home?.bed && bot.home.dim === e.dimension.id && B.dist(bot.home.bed, e.location) < 64 && /bed/.test(B.idAt(e.dimension, bot.home.bed)) ? bot.home.bed : undefined;
  if (bed) return { name: "sleep", prio: PRIO.sleep, ttl: 13000, gen: () => S.sleep(bot, bed) };
  if (Inv.has(bot, (id) => /bed$/.test(id)) && !G.underground(bot)) {
    return { name: "sleep", prio: PRIO.sleep, ttl: 13000, gen: function* () {
      const spot = S.spotNear(bot, 2);
      if (!spot) return false;
      if (!(yield* S.placeBlock(bot, spot, (id) => /bed$/.test(id)))) return false;
      yield* S.sleep(bot, spot);
      // in the morning it takes its bed along
      if (!bot.home || B.dist(bot.home.pos, spot) > 24) {
        yield* S.mineBlock(bot, spot);
        bot.spawn = null;
      }
      return true;
    } };
  }
  // no bed, out in the open and in no state to fight: dig in until morning
  if (!G.underground(bot) && (Inv.armorPoints(bot) < 6 || B.health(bot) < 12) && bot.persona.brave < 0.7 && bot.world.build) {
    return { name: "shelter", prio: PRIO.sleep, ttl: 13000, gen: () => shelter(bot) };
  }
  return undefined;
}
/** Dig two blocks down and cover its head: a hole to wait out the night in, as players do. @param {any} bot */
function* shelter(bot) {
  G.doing(bot, "waiting out the night in a hole");
  const f = B.feet(bot);
  const dim = bot.entity.dimension;
  for (let dy = 1; dy <= 2; dy++) {
    const p = { x: f.x, y: f.y - dy, z: f.z };
    if (!D.isFloor(B.idAt(dim, p))) continue;
    if (!(yield* S.mineBlock(bot, p, { pathing: true }))) return false;
    yield* S.until(() => bot.onGround, 20);
  }
  const top = { x: f.x, y: f.y, z: f.z };
  if (D.blockInfo(B.idAt(dim, top)).kind === "air") yield* S.placeBlock(bot, top, S.SCAFFOLD);
  for (let t = 0; t < 12000 && isNight(); t++) {
    if (t % 100 === 0) B.lookAt(bot, { ...bot.entity.location, y: bot.entity.location.y + 1, x: bot.entity.location.x + Math.random() * 2 - 1 }, 60, 1);
    if (bot.hunger <= 10 || B.health(bot) < 6) break;
    yield;
  }
  // out again
  yield* S.mineBlock(bot, top, { pathing: true });
  return true;
}

// ---------------------------------------------------------------- friends and people
/** A real player by name. @param {string} name */
export function playerNamed(name) {
  return world.getAllPlayers().find((p) => p.name === name);
}
/** @param {any} bot @param {number} now @returns {Offer | undefined} */
function social(bot, now) {
  // something a friend asked
  if (bot.requests?.length) {
    const req = bot.requests.shift();
    return { name: "request", prio: PRIO.request, ttl: 2400, gen: () => doRequest(bot, req) };
  }
  if (bot.follow) {
    const p = playerNamed(bot.follow);
    if (p) return { name: "follow", prio: PRIO.follow, ttl: 24000, gen: () => follow(bot, p) };
  }
  if (bot.stay) return { name: "stay", prio: PRIO.follow, ttl: 24000, gen: () => stay(bot) };
  // someone new about: say hello
  for (const s of Sense.seenWhere(bot, (x) => x.typeId === "minecraft:player" || x.typeId === "zt:player", 40)) {
    const name = s.entity.typeId === "minecraft:player" ? /** @type {Player} */ (s.entity).name : s.entity.nameTag;
    if (!name || B.dist(s.entity.location, bot.entity.location) > 16) continue;
    if (now - (bot.greeted[name] ?? -99999) < 12000) continue;
    bot.greeted[name] = now;
    return { name: "greet", prio: PRIO.greet, ttl: 120, gen: () => greet(bot, s.entity, name) };
  }
  return undefined;
}
/** Look at someone, wave and say hello. @param {any} bot @param {Entity} who @param {string} name */
function* greet(bot, who, name) {
  B.stop(bot);
  B.lookAtEntity(bot, who, 60, 3);
  yield* S.wait(8);
  B.setUse(bot, 7);
  bot.events.push({ kind: "greet", name, player: who.typeId === "minecraft:player", at: system.currentTick });
  yield* S.wait(30);
  B.setUse(bot, 0);
  return true;
}
/** Keep near a friend: walk (or run) after them, through a portal if they went through one. @param {any} bot @param {Player} p */
function* follow(bot, p) {
  G.doing(bot, "following " + p.name);
  let lost = 0;
  for (;;) {
    if (!bot.follow || !p.isValid) return true;
    if (p.dimension.id !== bot.entity.dimension.id) {
      // they went through a portal: after them
      const portal = T.portalHere(bot) ?? S.findBlocks(bot.entity.dimension, bot.entity.location, [m("portal")], 16, 6)[0];
      if (portal) yield* T.usePortal(bot, portal);
      else if (++lost > 600) {
        bot.events.push({ kind: "lost_friend", name: p.name, at: system.currentTick });
        bot.follow = null;
        return false;
      }
      yield;
      continue;
    }
    const d = B.dist(p.location, bot.entity.location);
    if (d > 96) {
      if (++lost > 400) {
        bot.events.push({ kind: "lost_friend", name: p.name, at: system.currentTick });
        bot.follow = null;
        return false;
      }
    } else lost = 0;
    if (d > 3.5) {
      yield* S.goTo(bot, { ...B.blockPos(p.location), r: 2.5 }, { tries: 1, maxNodes: 1500, speed: d > 8 ? "sprint" : "walk" });
    } else {
      B.stop(bot);
      B.lookAtEntity(bot, p, 20, 1);
      yield* S.wait(10);
    }
    yield;
  }
}
/** Wait where it was told to (wandering a step or two, looking about). @param {any} bot */
function* stay(bot) {
  G.doing(bot, "waiting where it was asked to");
  for (;;) {
    if (!bot.stay) return true;
    const p = bot.stay.pos;
    if (bot.stay.dim !== bot.entity.dimension.id) {
      bot.stay = null;
      return false;
    }
    if (B.dist(p, bot.entity.location) > 3) yield* S.goTo(bot, { ...B.blockPos(p), r: 1.5 }, { tries: 1 });
    else {
      B.stop(bot);
      const near = Sense.seenWhere(bot, (s) => s.typeId === "minecraft:player", 40)[0];
      if (near) B.lookAtEntity(bot, near.entity, 40, 1);
      yield* S.wait(40);
    }
  }
}
/**
 * Do what a friend asked: come here, give them something, go home, build, sleep...
 * @param {any} bot @param {{kind: string, player?: Player, item?: string, n?: number}} req
 */
function* doRequest(bot, req) {
  const p = req.player;
  switch (req.kind) {
    case "come": {
      if (!p?.isValid || p.dimension.id !== bot.entity.dimension.id) return false;
      G.doing(bot, "coming over to " + p.name);
      const ok = yield* S.goTo(bot, { ...B.blockPos(p.location), r: 2.5 }, { tries: 3, speed: "sprint" });
      if (p.isValid) B.lookAtEntity(bot, p, 60, 2);
      return ok;
    }
    case "give": {
      if (!p?.isValid || !req.item) return false;
      const ok = yield* S.goTo(bot, { ...B.blockPos(p.location), r: 2.5 }, { tries: 2 });
      if (!ok || !p.isValid) return false;
      B.lookAtEntity(bot, p, 30, 3);
      yield* S.wait(8);
      const n = Inv.take(bot, req.item, req.n ?? 1);
      if (!n) return false;
      // tossed to them
      const it = new ItemStack(req.item, Math.min(n, 64));
      const ent = Inv.drop(bot, it, true);
      if (ent) bot.tossed.set(ent.id, system.currentTick + 6000);
      B.swing(bot);
      return true;
    }
    case "home": {
      if (!bot.home || bot.home.dim !== bot.entity.dimension.id) return false;
      G.doing(bot, "going home");
      return yield* T.travel(bot, bot.home.pos, { r: 2 });
    }
    case "build":
      return yield* Build.buildHome(bot);
    case "sleep": {
      const o = sleep(bot, system.currentTick);
      if (!o) return false;
      return yield* o.gen();
    }
    case "drop": {
      // drop what it doesn't want
      const n = yield* S.tossJunk(bot);
      return n > 0;
    }
    case "trade": {
      const got = yield* St.tradeFor(bot, req.item ? [req.item] : [m("bread"), m("arrow"), m("ender_pearl")]);
      return got.length > 0;
    }
    case "enchant":
      return yield* St.enchant(bot);
    case "repair":
      return yield* St.anvilRepair(bot);
    default:
      return false;
  }
}
// ---------------------------------------------------------------- chores
/** @param {any} bot @param {string} name @param {number} now @param {number} every */
function ready(bot, name, now, every) {
  bot.choreAt ??= {};
  if ((bot.choreAt[name] ?? -every) + every > now) return false;
  bot.choreAt[name] = now;
  return true;
}
/** What it keeps on it when it puts things away in its chest. @param {string} id @param {number} n */
function keepOnMe(id, n) {
  if (/_(sword|pickaxe|axe|shovel|hoe|helmet|chestplate|leggings|boots)$|bow$|shield|bucket|flint_and_steel|shears|ender_eye|ender_pearl|blaze_rod|blaze_powder|elytra|potion|totem/.test(id)) return true;
  if (/torch|arrow|bed$|crafting_table|furnace/.test(id)) return true;
  if (D.FOOD[D.bare(id)] && !D.BAD_FOOD.has(D.bare(id))) return true;
  if (id === m("cobblestone") || id === m("dirt") || id === m("netherrack")) return n <= 64;
  return false;
}
/** @param {any} bot @param {number} now @returns {Offer | undefined} */
function chores(bot, now) {
  const e = bot.entity;
  const dim = e.dimension;
  // things left smelting
  if (bot.pendingSmelt && bot.pendingSmelt.dim === dim.id && B.dist(bot.pendingSmelt.pos, e.location) < 48 && ready(bot, "furnace", now, 600)) {
    const ps = bot.pendingSmelt;
    return { name: "chores", prio: PRIO.chores, ttl: 1200, gen: function* () {
      const c = yield* S.withdraw(bot, ps.pos, () => true, 64 * 3);
      bot.pendingSmelt = undefined;
      return c > 0;
    } };
  }
  // pockets full: put things away at home, or throw out junk
  if (Inv.freeSlots(bot) <= 1 && ready(bot, "full", now, 400)) {
    const h = bot.home;
    // near home (not down a mine under it): put things away in its chest
    if (h && h.dim === dim.id && B.dist(h.pos, e.location) < 48 && h.chests?.length && !G.underground(bot)) {
      return { name: "chores", prio: PRIO.chores, ttl: 2400, gen: function* () {
        G.doing(bot, "putting things away in its chest");
        const before = new Map(Inv.stacks(bot).map((s) => [s.item.typeId, Inv.count(bot, s.item.typeId)]));
        const n = yield* S.deposit(bot, h.chests[0], (id, k) => keepOnMe(id, k));
        for (const [id, k] of before) G.noteStash(bot, id, k - Inv.count(bot, id));
        if (Inv.freeSlots(bot) <= 1) yield* S.tossJunk(bot);
        return n > 0;
      } };
    }
    return { name: "chores", prio: PRIO.chores, ttl: 600, gen: () => S.tossJunk(bot) };
  }
  // its things where it died, before they vanish (five minutes)
  const ds = bot.deathSpot;
  if (ds && ds.dim === dim.id && world.getAbsoluteTime() - ds.at < 5400 && !bot.recovered && B.dist(ds.pos, e.location) < 200 &&
    !/lava|void/.test(String(ds.cause))) {
    bot.recovered = true;
    return { name: "recover", prio: PRIO.recover, ttl: 3000, gen: function* () {
      G.doing(bot, "going back for its things");
      if (!(yield* T.travel(bot, ds.pos, { r: 3 }))) return false;
      yield* S.collect(bot, ds.pos, 6, 200);
      return true;
    } };
  }
  // a dark tunnel: a torch
  if (G.underground(bot) && Inv.has(bot, m("torch")) && dim.id === "minecraft:overworld" && ready(bot, "torch", now, 200)) {
    const last = bot.lastTorch;
    if (!last || B.dist(last, e.location) > 10) {
      bot.lastTorch = { ...e.location };
      return { name: "chores", prio: PRIO.chores, ttl: 200, gen: () => G.torchHere(bot) };
    }
  }
  // a village: trade spare things for what it wants, ring the bell
  if (ready(bot, "trade", now, 6000)) {
    const vs = St.villagersNear(bot, 32);
    if (vs.length) {
      W.remember("village", dim.id, vs[0].location, {}, 96);
      const wants = [m("ender_pearl"), m("bread"), m("arrow"), m("iron_chestplate"), m("shield"), m("bow"), m("golden_carrot")].filter((id) => !Inv.has(bot, id, id === m("arrow") ? 32 : id === m("bread") ? 8 : 1));
      return { name: "chores", prio: PRIO.chores, ttl: 3000, gen: () => St.tradeFor(bot, wants) };
    }
  }
  if (ready(bot, "bell", now, 24000) && S.findBlocks(dim, e.location, [m("bell")], 8, 4).length) {
    return { name: "chores", prio: PRIO.chores, ttl: 300, gen: () => St.ringBell(bot) };
  }
  if (ready(bot, "compost", now, 6000) && S.findBlocks(dim, e.location, [m("composter")], 16, 4).length) {
    return { name: "chores", prio: PRIO.chores, ttl: 1200, gen: () => St.compost(bot) };
  }
  // worn gear: an anvil or a grindstone near
  if (ready(bot, "repair", now, 6000)) {
    if (S.findBlocks(dim, e.location, [m("anvil"), m("chipped_anvil"), m("damaged_anvil")], 24, 6).length) {
      return { name: "chores", prio: PRIO.chores, ttl: 1200, gen: () => St.anvilRepair(bot) };
    }
    if (S.findBlocks(dim, e.location, [m("grindstone")], 24, 6).length) return { name: "chores", prio: PRIO.chores, ttl: 1200, gen: () => St.grind(bot) };
  }
  if (bot.level >= 5 && Inv.has(bot, m("lapis_lazuli")) && ready(bot, "enchant", now, 6000) &&
    S.findBlocks(dim, e.location, [m("enchanting_table")], 24, 6).length) {
    return { name: "chores", prio: PRIO.chores, ttl: 1200, gen: () => St.enchant(bot) };
  }
  // fire resistance for the Nether, if it can brew it
  if (bot.progress.stage === "blaze" && !St.hasPotion(bot, "fire_resistance") && Inv.has(bot, m("magma_cream")) && Inv.has(bot, m("nether_wart")) &&
    Inv.has(bot, m("blaze_powder")) && ready(bot, "brew", now, 12000)) {
    return { name: "chores", prio: PRIO.chores, ttl: 3000, gen: () => St.brew(bot, "fire_resistance", 3) };
  }
  // a present for a friend nearby, now and then
  if (ready(bot, "gift", now, 18000)) {
    const friend = Object.entries(bot.friends).filter(([, lv]) => lv >= 3).map(([n]) => playerNamed(n)).find((p) => p && B.dist(p.location, e.location) < 8);
    const spare = [m("cooked_beef"), m("bread"), m("iron_ingot"), m("diamond"), m("golden_apple")].find((id) => Inv.count(bot, id) >= (id === m("diamond") ? 6 : 16));
    if (friend && spare) {
      return { name: "chores", prio: PRIO.chores, ttl: 600, gen: () => doRequest(bot, { kind: "give", player: friend, item: spare, n: spare === m("diamond") ? 1 : 3 }) };
    }
  }
  return undefined;
}

// ---------------------------------------------------------------- idle
/** Nothing to do: wander a little near home, look at things, think. @param {any} bot */
function* idle(bot) {
  G.doing(bot, "hanging around");
  const l = bot.entity.location;
  const base = bot.home && bot.home.dim === bot.entity.dimension.id && B.dist(bot.home.pos, l) < 48 ? bot.home.pos : l;
  const a = Math.random() * Math.PI * 2;
  const r = 4 + Math.random() * 10;
  yield* S.goTo(bot, { x: Math.floor(base.x + Math.cos(a) * r), z: Math.floor(base.z + Math.sin(a) * r), r: 2 }, { tries: 1, maxNodes: 600, noBuild: true });
  const near = Sense.seenWhere(bot, (s) => s.typeId === "minecraft:player" || s.typeId === "zt:player" || Sense.FOOD_ANIMALS.has(s.typeId), 80)[0];
  if (near) B.lookAtEntity(bot, near.entity, 60, 1);
  yield* S.wait(60 + Math.floor(Math.random() * 140));
  return true;
}

// ---------------------------------------------------------------- looking about the world
/** Remember villages, fortresses, spawners and strongholds it sees. @param {any} bot */
function survey(bot) {
  const e = bot.entity;
  const dim = e.dimension;
  const l = e.location;
  try {
    const v = dim.getEntities({ type: "minecraft:villager_v2", location: l, maxDistance: 48 })[0];
    if (v) W.remember("village", dim.id, v.location, {}, 96);
  } catch {
    /* ignore */
  }
  if (dim.id === "minecraft:nether") {
    const f = S.findBlocks(dim, l, [m("nether_brick"), m("nether_brick_fence")], 16, 8)[0];
    if (f) W.remember("fortress", dim.id, f, {}, 96);
  }
  const sp = S.findBlocks(dim, l, [m("mob_spawner")], 12, 6)[0];
  if (sp) W.remember("spawner", dim.id, sp, {}, 8);
  if (dim.id === "minecraft:overworld" && G.underground(bot)) {
    const frame = S.findBlocks(dim, l, [m("end_portal_frame")], 16, 8)[0];
    if (frame) W.remember("stronghold", dim.id, frame, { room: frame }, 160);
  }
}

/** Gold on in the Nether (piglins leave you alone), the best armour elsewhere. @param {any} bot */
function dress(bot) {
  const nether = bot.entity.dimension.id === "minecraft:nether";
  if (!nether) {
    Inv.equipArmor(bot);
    bot.wearsGold = false;
    return;
  }
  const worn = ["Head", "Chest", "Legs", "Feet"].map((s) => Inv.getEquip(bot, s)?.typeId ?? "");
  if (worn.some((id) => /golden_/.test(id))) {
    bot.wearsGold = true;
    return;
  }
  const c = Inv.container(bot);
  if (!c) return;
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    const a = D.armorInfo(it?.typeId);
    if (!a || a.material !== "golden") continue;
    const slot = D.ARMOR_EQUIP[a.slot];
    const old = Inv.getEquip(bot, slot);
    c.setItem(i, old);
    Inv.setEquip(bot, slot, it);
    bot.wearsGold = true;
    return;
  }
  Inv.equipArmor(bot);
}

// ---------------------------------------------------------------- the tick
/** @param {any} bot @param {number} now */
export function brainTick(bot, now) {
  const dimId = bot.entity.dimension.id;
  if (bot.lastDim && bot.lastDim !== dimId) {
    // through a portal: whatever it was doing is done with
    stopTask(bot);
    bot.events.push({ kind: "dimension", dim: dimId, at: now });
  }
  bot.lastDim = dimId;
  if ((now + bot.phase) % 40 === 0) dress(bot);
  if ((now + bot.phase) % 100 === 25) survey(bot);
  // a task running too long is stuck at something: let it go
  if (bot.task && now - bot.task.since > bot.task.ttl) stopTask(bot);
  if (!bot.task || (now + bot.phase) % 10 === 0) choose(bot, now);
  const t = bot.task;
  if (!t) return;
  let r;
  try {
    r = t.gen.next();
  } catch (err) {
    if ((bot.errors = (bot.errors ?? 0) + 1) < 6) console.warn("[Titans] Player " + bot.name + " (" + t.name + "): " + err + (err?.stack ? "\n" + err.stack : ""));
    finishTask(bot, false, now);
    return;
  }
  if (r.done && bot.task === t) finishTask(bot, !!r.value, now);
}

/** Weigh what to do, and switch to it if it's more urgent than what it's doing. @param {any} bot @param {number} now */
function choose(bot, now) {
  bot.driveCool ??= {};
  const cur = bot.task;
  /** @type {Offer | undefined} */
  let best;
  const consider = (o) => {
    if (!o) return;
    if ((bot.driveCool[o.name] ?? 0) > now) return;
    if (!best || o.prio > best.prio) best = o;
  };
  // only what could beat the current task is worth asking about
  const floor = cur ? cur.prio : -1;
  if (floor < PRIO.danger) consider(danger(bot));
  if (floor < PRIO.flee) consider(flee(bot));
  if (floor < PRIO.fight) consider(fight(bot, now));
  if (floor < PRIO.heal) consider(heal(bot));
  if (floor < PRIO.eat) consider(eat(bot, now));
  if (floor < PRIO.request) consider(social(bot, now));
  if (floor < PRIO.sleep) consider(sleep(bot, now));
  if (cur) {
    if (best && best.prio > cur.prio && best.name !== cur.name) startTask(bot, best, now);
    return;
  }
  consider(chores(bot, now));
  if (!bot.follow && !bot.stay) {
    if (bot.thinkNext) {
      bot.thinkNext = false;
      consider({ name: "think", prio: PRIO.think, ttl: 200, gen: () => S.think(bot, 30 + Math.floor(Math.random() * 50)) });
    }
    consider({ name: "progress", prio: PRIO.progress, ttl: 36000, gen: () => P.progressTask(bot) });
  }
  consider({ name: "idle", prio: PRIO.idle, ttl: 1200, gen: () => idle(bot) });
  if (best) startTask(bot, best, now);
}
