// A Player's body: it walks, sprints, sneaks, jumps, swims and climbs at a player's speeds, turns
// its head to look at things (and glances around when it has nothing to look at), swings its
// arm, picks up items it walks over, and gets hungry, heals and gains experience as a player
// does. The brain (bot_brain.js) and its skills set where it goes and what it looks at; this
// runs every tick.
import { Difficulty, ItemStack, system, world } from "@minecraft/server";
import * as D from "./bot_data.js";
import * as Inv from "./bot_inv.js";
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {import("@minecraft/server").Dimension} Dimension */

// player speeds, blocks a tick
export const SPEED = { walk: 0.2158, sprint: 0.2806, sneak: 0.0655, swim: 0.1, slow: 0.13 };
/**
 * The upward push of a jump. A player's jump rises about 1.25 blocks; how high a push really
 * goes is up to the game's physics, so the Players measure their jumps and adjust this (shared
 * by all of them) until a jump clears a block. It starts a little strong: a jump too high does
 * no harm, one too low gets it nowhere.
 */
export const JUMP = { power: 0.5 };
export const EYE = 1.62;
const DEG = Math.PI / 180;

export const wrap = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
/** @param {Vector3} a @param {Vector3} b */
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/** @param {{x: number, z: number}} a @param {{x: number, z: number}} b */
export const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** yaw toward a point (0 = south, 90 = west). @param {Vector3} from @param {Vector3} to */
export const yawTo = (from, to) => Math.atan2(-(to.x - from.x), to.z - from.z) / DEG;
/** @param {number} yaw */
export const forward = (yaw) => ({ x: -Math.sin(yaw * DEG), y: 0, z: Math.cos(yaw * DEG) });
/** @param {Vector3} p */
export const blockPos = (p) => ({ x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) });
/** @param {Vector3} p */
export const center = (p) => ({ x: Math.floor(p.x) + 0.5, y: Math.floor(p.y), z: Math.floor(p.z) + 0.5 });
export const key = (p) => `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;

/** @param {any} bot */
export function eye(bot) {
  const l = bot.entity.location;
  return { x: l.x, y: l.y + (bot.pose === 1 ? 1.27 : bot.pose === 2 ? 0.4 : EYE), z: l.z };
}
/** @param {any} bot */
export function feet(bot) {
  return blockPos(bot.entity.location);
}
/** The block at a spot (undefined where nothing is loaded). @param {Dimension} dim @param {Vector3} p */
export function blockAt(dim, p) {
  try {
    return dim.getBlock(blockPos(p));
  } catch {
    return undefined;
  }
}
/** @param {Dimension} dim @param {Vector3} p */
export function idAt(dim, p) {
  return blockAt(dim, p)?.typeId ?? "minecraft:air";
}

/**
 * Is it under a roof of rock or a building (a cave, a mine, a house), not just under trees or
 * open sky? It looks straight up for something solid that isn't leaves, wood or glass.
 * @param {Dimension} dim @param {Vector3} p
 */
export function roofed(dim, p) {
  const x = Math.floor(p.x);
  const z = Math.floor(p.z);
  const top = Math.min(dim.heightRange.max - 1, Math.floor(p.y) + 40);
  for (let y = Math.floor(p.y) + 2; y <= top; y++) {
    const id = idAt(dim, { x, y, z });
    if (id === "minecraft:air") continue;
    if (/leaves|_log$|_wood$|glass|vine|water|snow_layer|torch|lantern|_stem$/.test(id)) continue;
    if (D.isFloor(id)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- properties (only sent when they change)
/** @param {any} bot @param {string} id @param {any} v */
export function prop(bot, id, v) {
  if (bot.props[id] === v) return;
  bot.props[id] = v;
  try {
    bot.entity.setProperty(id, v);
  } catch {
    /* the entity is gone or unloading */
  }
}
/** Swing its arm (a hit, a block mined or placed). @param {any} bot */
export function swing(bot) {
  bot.swingN = ((bot.swingN ?? 0) + 1) % 8;
  prop(bot, "zt:swing", bot.swingN);
}
/** 0 nothing, 1 eating, 2 bow, 3 shield, 4 working at a table, 5 throwing, 6 thinking, 7 waving. @param {any} bot @param {number} n */
export function setUse(bot, n) {
  bot.use = n;
  prop(bot, "zt:use", n);
  prop(bot, "zt:blocking", n === 3);
}
/** 0 standing, 1 sneaking, 2 swimming, 3 asleep, 4 sitting. @param {any} bot @param {number} n */
export function setPose(bot, n) {
  if (bot.pose === n) return;
  bot.pose = n;
  prop(bot, "zt:pose", n);
  try {
    bot.entity.isSneaking = n === 1;
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- what the brain asks for
/**
 * Walk toward a point (its feet there). speed: "walk", "sprint", "sneak". tol: how close is
 * there. noFall: don't step off an edge on the way (bridging, near drops).
 * @param {any} bot @param {Vector3} to @param {{speed?: string, tol?: number, noFall?: boolean}} [o]
 */
export function moveTo(bot, to, o = {}) {
  bot.move = { to: { x: to.x, y: to.y, z: to.z }, speed: o.speed ?? "walk", tol: o.tol ?? 0.25, noFall: !!o.noFall };
}
/** @param {any} bot */
export function stop(bot) {
  bot.move = undefined;
}
/** @param {any} bot */
export function jump(bot) {
  bot.jumpReq = system.currentTick;
}
/**
 * Look at a point for a while (prio: higher wins until it runs out).
 * @param {any} bot @param {Vector3} p @param {number} [ticks] @param {number} [prio]
 */
export function lookAt(bot, p, ticks = 20, prio = 1) {
  const now = system.currentTick;
  if (bot.look && bot.look.until > now && bot.look.prio > prio) return;
  bot.look = { p: { x: p.x, y: p.y, z: p.z }, until: now + ticks, prio };
}
/** Look at an entity's face. @param {any} bot @param {Entity} e @param {number} [ticks] @param {number} [prio] */
export function lookAtEntity(bot, e, ticks = 20, prio = 1) {
  try {
    const h = e.getHeadLocation();
    lookAt(bot, h, ticks, prio);
    bot.look.entity = e;
  } catch {
    /* gone */
  }
}
/** Is its head pointing at p (within deg)? @param {any} bot @param {Vector3} p @param {number} [deg] */
export function facing(bot, p, deg = 20) {
  const e = eye(bot);
  const yaw = yawTo(e, p);
  const pitch = -Math.atan2(p.y - e.y, Math.hypot(p.x - e.x, p.z - e.z)) / DEG;
  return Math.abs(wrap(yaw - bot.headYaw)) <= deg && Math.abs(pitch - bot.headPitch) <= deg + 10;
}
/** The direction its head points. @param {any} bot */
export function viewDir(bot) {
  const cp = Math.cos(bot.headPitch * DEG);
  return { x: -Math.sin(bot.headYaw * DEG) * cp, y: -Math.sin(bot.headPitch * DEG), z: Math.cos(bot.headYaw * DEG) * cp };
}

// ---------------------------------------------------------------- the tick
/** @param {any} bot @param {number} now */
export function bodyTick(bot, now) {
  const e = bot.entity;
  const dim = e.dimension;
  const loc = e.location;
  let v;
  let onGround;
  let inWater;
  try {
    v = e.getVelocity();
    onGround = e.isOnGround;
    inWater = e.isInWater;
  } catch {
    return;
  }
  bot.onGround = onGround;
  bot.inWater = inWater;
  if (onGround) bot.airTicks = 0;
  else bot.airTicks = (bot.airTicks ?? 0) + 1;
  const feetId = idAt(dim, loc);
  const headId = idAt(dim, { x: loc.x, y: loc.y + 1.5, z: loc.z });
  const climbing = /ladder|vine|scaffolding/.test(feetId) || /ladder|vine/.test(headId);
  bot.headInWater = /water/.test(headId);

  // ---------------------------------------------------------------- where it goes
  let want = { x: 0, z: 0 };
  let speed = 0;
  let wantUp = false;
  let wantDown = false;
  const m = bot.move;
  if (m && bot.pose !== 3) {
    const dx = m.to.x - loc.x;
    const dz = m.to.z - loc.z;
    const d = Math.hypot(dx, dz);
    speed = inWater ? SPEED.swim * (m.speed === "sprint" ? 1.6 : 1) : SPEED[m.speed] ?? SPEED.walk;
    if (bot.slow) speed = Math.min(speed, SPEED.slow);
    if (d > m.tol) {
      const k = Math.min(speed, d * 0.6) / d;
      want = { x: dx * k, z: dz * k };
    }
    wantUp = m.to.y > loc.y + 0.6;
    wantDown = m.to.y < loc.y - 0.6;
    if (m.noFall && onGround && d > 0.01) {
      // don't walk off an edge: stop where the next step has nothing under it
      const nx = loc.x + want.x * 2;
      const nz = loc.z + want.z * 2;
      const below = idAt(dim, { x: nx, y: loc.y - 0.5, z: nz });
      if (!D.isFloor(below) && !/water/.test(below) && !D.isFloor(idAt(dim, { x: loc.x, y: loc.y - 0.5, z: loc.z }))) want = { x: 0, z: 0 };
      else if (!D.isFloor(below) && !/water/.test(below)) want = { x: want.x * 0.25, z: want.z * 0.25 };
    }
  }
  // sneaking slows a player down; swimming players sprint along flat
  if (bot.pose === 1 && !inWater) speed = Math.min(speed, SPEED.sneak);

  // ---------------------------------------------------------------- velocity
  // how high its last jump went: too low to clear a block, push harder next time
  const jr = bot.jumpRec;
  if (jr) {
    jr.top = Math.max(jr.top, loc.y);
    const over = (onGround && now - jr.at > 3) || inWater || climbing || now - jr.at > 30;
    if (over) {
      if (jr.top + 1.8 < jr.ceil - 0.05 && !inWater && !climbing && now - jr.at <= 30) {
        const rise = jr.top - jr.y0;
        if (rise < 1.15) JUMP.power = Math.min(0.7, JUMP.power + Math.min(0.08, (1.25 - rise) * 0.3));
        else if (rise > 1.5) JUMP.power = Math.max(0.42, JUMP.power - 0.02);
      }
      // a jump at a step that didn't get it up: after a few, stop trying that one
      if (jr.step) {
        if (loc.y - jr.y0 < 0.5) bot.missedSteps = (bot.missedSteps ?? 0) + 1;
        else bot.missedSteps = 0;
        if (bot.missedSteps >= 4) {
          bot.missedSteps = 0;
          bot.noStepUntil = now + 60;
        }
      }
      bot.jumpRec = undefined;
    }
  }
  // in the air on its way up a step, it keeps going for the step (as a player holding forward)
  const stepping = !!(bot.jumpRec?.step && now - bot.jumpRec.at < 14);
  const accel = onGround ? 1.0 : inWater ? 0.35 : stepping ? 0.5 : 0.12;
  let iy = 0;
  const jumpAsked = bot.jumpReq && now - bot.jumpReq < 3;
  if (inWater) {
    // keep its head above water unless it means to go down
    if (wantUp || (bot.headInWater && !wantDown) || jumpAsked) iy = Math.max(0, Math.min(0.06, 0.12 - v.y));
    else if (wantDown) iy = -0.02;
    if (bot.headInWater && !wantUp && !wantDown && v.y < 0) iy = Math.max(iy, 0.04 - v.y * 0.5);
    // at the bank, swimming toward it: up and out, as a swimmer pulls itself out (and if the
    // water won't let it, a moment later it climbs out)
    const bank = m && !wantDown && bankAhead(dim, loc, want);
    if (bank) {
      iy = Math.max(iy, 0.3 - v.y);
      bot.bankTicks = (bot.bankTicks ?? 0) + 1;
      if (bot.bankTicks > 8) {
        bot.bankTicks = 0;
        try {
          e.teleport({ x: bank.x + 0.5, y: bank.y, z: bank.z + 0.5 });
          bot.hops = (bot.hops ?? 0) + 1;
        } catch {
          /* ignore */
        }
      }
    } else bot.bankTicks = 0;
  } else if (climbing && (wantUp || jumpAsked)) {
    iy = 0.12 - v.y;
  } else if (climbing && !wantDown && v.y < -0.1) {
    iy = -0.1 - v.y;
  } else if (jumpAsked && onGround) {
    iy = JUMP.power - v.y;
    bot.jumpReq = 0;
    // the first block over its head (a jump that stops short of it tells how high a jump goes;
    // one that hits it doesn't)
    let ceil = Infinity;
    for (const [ox, oz] of [[-0.29, -0.29], [0.29, -0.29], [-0.29, 0.29], [0.29, 0.29]]) {
      for (let k = 2; k <= 3; k++) {
        const yy = Math.floor(loc.y) + k;
        if (!D.isPassable(idAt(dim, { x: loc.x + ox, y: yy, z: loc.z + oz }))) {
          ceil = Math.min(ceil, yy);
          break;
        }
      }
    }
    bot.jumpRec = { y0: loc.y, top: loc.y, at: now, step: !!bot.stepJump, ceil };
    bot.stepJump = false;
    bot.exhaust += m?.speed === "sprint" ? 0.2 : 0.05;
    // a sprint jump carries it a little further
    if (m?.speed === "sprint" && Math.hypot(want.x, want.z) > 0.05) {
      want.x *= 1.25;
      want.z *= 1.25;
    }
  }
  const ix = (want.x - v.x) * accel;
  const iz = (want.z - v.z) * accel;
  if (Math.abs(ix) > 1e-4 || Math.abs(iz) > 1e-4 || iy) {
    try {
      e.applyImpulse({ x: ix, y: iy, z: iz });
    } catch {
      /* ignore */
    }
  }
  // auto-jump up a one-block step, as players do (with room to stand on it)
  if (onGround && !inWater && Math.hypot(want.x, want.z) > 0.03 && m && !bot.jumpRec && now >= (bot.noStepUntil ?? 0)) {
    const f = Math.hypot(want.x, want.z);
    const ahead = { x: loc.x + (want.x / f) * 0.6, y: loc.y + 0.5, z: loc.z + (want.z / f) * 0.6 };
    if (D.isFloor(idAt(dim, ahead)) && D.isPassable(idAt(dim, { ...ahead, y: loc.y + 1.5 })) && D.isPassable(idAt(dim, { ...ahead, y: loc.y + 2.5 })) &&
        D.isPassable(idAt(dim, { x: loc.x, y: loc.y + 2.2, z: loc.z })) && m.to.y > loc.y - 0.5) {
      jump(bot);
      bot.stepJump = true;
    }
  }

  // ---------------------------------------------------------------- moved how far (footsteps, hunger, stuck)
  const last = bot.lastLoc ?? loc;
  const moved = Math.hypot(loc.x - last.x, loc.z - last.z);
  bot.lastLoc = { x: loc.x, y: loc.y, z: loc.z };
  if (moved < 2) {
    bot.walked = (bot.walked ?? 0) + moved;
    if (m?.speed === "sprint" && !inWater) bot.exhaust += moved * 0.1;
    if (inWater) bot.exhaust += moved * 0.01;
    if (onGround && bot.walked > (m?.speed === "sprint" ? 2.0 : 1.6)) {
      bot.walked = 0;
      if (bot.pose !== 1) stepSound(dim, loc);
    }
  }
  if (m) {
    bot.steps.push(moved);
    if (bot.steps.length > 20) bot.steps.shift();
  } else bot.steps.length = 0;

  // ---------------------------------------------------------------- pose
  if (bot.pose !== 3 && bot.pose !== 4) {
    if (inWater && bot.headInWater && m && Math.hypot(want.x, want.z) > 0.05) setPose(bot, 2);
    else setPose(bot, bot.sneak ? 1 : 0);
  }

  // ---------------------------------------------------------------- head and body
  lookTick(bot, now, want);

  // ---------------------------------------------------------------- picking things up
  if (now % 4 === bot.phase % 4) pickUp(bot, now);
}

/**
 * The dry ground at a bank in front of it (where it means to go): a block at the water's top or
 * one above it, with room to stand on it. Returns where it would stand, or undefined.
 * @param {Dimension} dim @param {Vector3} loc @param {{x: number, z: number}} want
 */
function bankAhead(dim, loc, want) {
  const f = Math.hypot(want.x, want.z);
  if (f < 0.01) return undefined;
  const x = loc.x + (want.x / f) * 0.6;
  const z = loc.z + (want.z / f) * 0.6;
  if (Math.floor(x) === Math.floor(loc.x) && Math.floor(z) === Math.floor(loc.z)) return undefined;
  for (const by of [Math.floor(loc.y), Math.floor(loc.y) + 1]) {
    if (D.isFloor(idAt(dim, { x, y: by, z })) && D.isPassable(idAt(dim, { x, y: by + 1, z })) && D.isPassable(idAt(dim, { x, y: by + 2, z })) &&
        !/water/.test(idAt(dim, { x, y: by + 1, z }))) {
      return { x: Math.floor(x), y: by + 1, z: Math.floor(z) };
    }
  }
  return undefined;
}

/** @param {Dimension} dim @param {Vector3} loc */
function stepSound(dim, loc) {
  const id = idAt(dim, { x: loc.x, y: loc.y - 0.2, z: loc.z });
  const mat = /wool|carpet/.test(id) ? "cloth" : /planks|log|wood|door|chest|crafting|stem|bookshelf|barrel/.test(id) ? "wood"
    : /grass_block|dirt|podzol|mycelium|leaves|farmland|moss/.test(id) ? "grass" : /gravel|clay/.test(id) ? "gravel"
    : /sand|soul_s/.test(id) ? "sand" : /snow/.test(id) ? "snow" : /ladder/.test(id) ? "ladder" : "stone";
  try {
    dim.playSound("step." + mat, loc, { volume: 0.15, pitch: 1.0 });
  } catch {
    /* ignore */
  }
}

/**
 * Turn its head toward what it looks at (or along its way, or glance about), and its body after:
 * a player's body follows its head when it turns far.
 * @param {any} bot @param {number} now @param {{x: number, z: number}} want
 */
function lookTick(bot, now, want) {
  const e = bot.entity;
  const eyeP = eye(bot);
  let target;
  if (bot.look && bot.look.until > now) {
    if (bot.look.entity) {
      try {
        if (bot.look.entity.isValid) bot.look.p = bot.look.entity.getHeadLocation();
      } catch {
        bot.look.entity = undefined;
      }
    }
    target = bot.look.p;
  } else if (Math.hypot(want.x, want.z) > 0.02 && bot.move) {
    // walking: look where it's going, a little down
    const f = Math.hypot(want.x, want.z);
    target = { x: eyeP.x + (want.x / f) * 6, y: eyeP.y - 1.2 + (bot.move.to.y - e.location.y) * 0.5, z: eyeP.z + (want.z / f) * 6 };
  } else {
    // idle: glance about now and then
    if (!bot.glance || bot.glance.until < now) {
      if (Math.random() < 0.04) {
        const yaw = bot.yaw + (Math.random() - 0.5) * 160;
        const pitch = -15 + Math.random() * 35;
        const f = { x: -Math.sin(yaw * DEG), z: Math.cos(yaw * DEG) };
        bot.glance = { p: { x: eyeP.x + f.x * 8, y: eyeP.y - Math.tan(pitch * DEG) * 8, z: eyeP.z + f.z * 8 }, until: now + 30 + Math.floor(Math.random() * 60) };
      }
    }
    target = bot.glance?.until >= now ? bot.glance.p : undefined;
  }
  if (target) {
    const yaw = yawTo(eyeP, target);
    const pitch = Math.max(-89, Math.min(89, -Math.atan2(target.y - eyeP.y, Math.hypot(target.x - eyeP.x, target.z - eyeP.z)) / DEG));
    bot.headYaw = wrap(bot.headYaw + Math.max(-28, Math.min(28, wrap(yaw - bot.headYaw))));
    bot.headPitch += Math.max(-18, Math.min(18, pitch - bot.headPitch));
  }
  // its body turns toward where it walks, or after its head
  const moving = Math.hypot(want.x, want.z) > 0.02;
  if (moving) {
    const wy = Math.atan2(-want.x, want.z) / DEG;
    bot.yaw = wrap(bot.yaw + Math.max(-20, Math.min(20, wrap(wy - bot.yaw))));
  }
  const rel = wrap(bot.headYaw - bot.yaw);
  if (Math.abs(rel) > 50) bot.yaw = wrap(bot.yaw + Math.sign(rel) * Math.min(Math.abs(rel) - 45, 12));
  const relYaw = Math.max(-85, Math.min(85, wrap(bot.headYaw - bot.yaw)));
  try {
    e.setRotation({ x: bot.headPitch, y: bot.yaw });
  } catch {
    /* ignore */
  }
  const lx = Math.round(Math.max(-89, Math.min(89, bot.headPitch)) * 2) / 2;
  const ly = Math.round(relYaw * 2) / 2;
  if (Math.abs((bot.props["zt:look_x"] ?? 0) - lx) >= 1.5 || now % 10 === 0) prop(bot, "zt:look_x", lx);
  if (Math.abs((bot.props["zt:look_y"] ?? 0) - ly) >= 1.5 || now % 10 === 0) prop(bot, "zt:look_y", ly);
}

/** Items within reach go into its pockets (not ones it threw away itself, for a while). @param {any} bot @param {number} now */
function pickUp(bot, now) {
  const e = bot.entity;
  let near = [];
  try {
    near = e.dimension.getEntities({ type: "minecraft:item", location: e.location, maxDistance: 1.8 });
  } catch {
    return;
  }
  for (const it of near) {
    if ((bot.tossed.get(it.id) ?? 0) > now) continue;
    let stack;
    try {
      stack = it.getComponent("minecraft:item")?.itemStack;
    } catch {
      stack = undefined;
    }
    if (!stack) continue;
    const c = Inv.container(bot);
    if (!c) return;
    // only if it all fits (the game's item entities can't be split from a script)
    if (c.emptySlotsCount === 0 && !Inv.stacks(bot).some((s) => s.item.isStackableWith(stack) && s.item.amount + stack.amount <= s.item.maxAmount)) continue;
    if (!Inv.add(bot, stack)) continue;
    try {
      it.remove();
    } catch {
      /* gone already */
    }
    bot.picked.push({ id: stack.typeId, n: stack.amount, at: now });
    if (bot.picked.length > 40) bot.picked.shift();
    try {
      e.dimension.playSound("random.pop", e.location, { volume: 0.25, pitch: 1.4 + Math.random() * 0.6 });
    } catch {
      /* ignore */
    }
  }
  // experience orbs
  try {
    for (const orb of e.dimension.getEntities({ type: "minecraft:xp_orb", location: e.location, maxDistance: 1.6 })) {
      orb.remove();
      addXp(bot, 1 + Math.floor(Math.random() * 3));
    }
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- hunger, healing, experience
/** @param {any} bot */
export function health(bot) {
  try {
    return bot.entity.getComponent("minecraft:health")?.currentValue ?? 0;
  } catch {
    return 0;
  }
}
/** @param {any} bot @param {number} amount */
export function heal(bot, amount) {
  try {
    const h = bot.entity.getComponent("minecraft:health");
    if (h) h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + amount));
  } catch {
    /* ignore */
  }
}
/** @param {any} bot @param {number} amount */
export function exhaust(bot, amount) {
  bot.exhaust += amount;
}

/** Hunger drains with what it does; a full belly heals it; an empty one hurts. @param {any} bot @param {number} now */
export function vitalsTick(bot, now) {
  let diff;
  try {
    diff = world.getDifficulty();
  } catch {
    diff = Difficulty.Normal;
  }
  if (diff === Difficulty.Peaceful) {
    bot.hunger = 20;
    if (now % 20 === 0) heal(bot, 1);
    return;
  }
  while (bot.exhaust >= 4) {
    bot.exhaust -= 4;
    if (bot.sat > 0) bot.sat = Math.max(0, bot.sat - 1);
    else bot.hunger = Math.max(0, bot.hunger - 1);
  }
  const hp = health(bot);
  if (hp <= 0) return;
  if (hp < 20 && bot.hunger >= 18) {
    const fast = bot.sat > 0 && bot.hunger >= 20;
    if (now - (bot.regenAt ?? 0) >= (fast ? 10 : 80)) {
      bot.regenAt = now;
      heal(bot, 1);
      bot.exhaust += 6;
    }
  }
  if (bot.hunger <= 0 && now - (bot.starveAt ?? 0) >= 80) {
    bot.starveAt = now;
    const floor = diff === Difficulty.Hard ? 0 : diff === Difficulty.Easy ? 10 : 1;
    if (hp > floor) {
      try {
        bot.entity.applyDamage(1, { cause: /** @type {any} */ ("starve") });
      } catch {
        /* ignore */
      }
    }
  }
}

/** Experience to go from one level to the next (as for players). @param {number} level */
export function xpToNext(level) {
  return level <= 15 ? 2 * level + 7 : level <= 30 ? 5 * level - 38 : 9 * level - 158;
}
/** @param {any} bot @param {number} points */
export function addXp(bot, points) {
  bot.xp += points;
  let up = false;
  while (bot.xp >= xpToNext(bot.level)) {
    bot.xp -= xpToNext(bot.level);
    bot.level++;
    up = true;
  }
  try {
    const dim = bot.entity.dimension;
    dim.playSound(up && bot.level % 5 === 0 ? "random.levelup" : "random.orb", bot.entity.location, { volume: 0.3, pitch: 0.8 + Math.random() * 0.4 });
  } catch {
    /* ignore */
  }
}
/** Spend levels (enchanting, an anvil). @param {any} bot @param {number} levels */
export function spendLevels(bot, levels) {
  bot.level = Math.max(0, bot.level - levels);
}

/** Eat or drink: the food's points and saturation. @param {any} bot @param {string} id */
export function nourish(bot, id) {
  let f = D.FOOD[D.bare(id)];
  try {
    const c = new ItemStack(id).getComponent("minecraft:food");
    if (c) f = [c.nutrition, c.saturationModifier];
  } catch {
    /* use the table */
  }
  if (!f) return;
  bot.hunger = Math.min(20, bot.hunger + f[0]);
  bot.sat = Math.min(bot.hunger, bot.sat + f[0] * f[1] * 2);
  const e = bot.entity;
  try {
    if (id === "minecraft:golden_apple") {
      e.addEffect("regeneration", 100, { amplifier: 1, showParticles: true });
      e.addEffect("absorption", 2400, { amplifier: 0, showParticles: true });
    } else if (id === "minecraft:enchanted_golden_apple") {
      e.addEffect("regeneration", 600, { amplifier: 4 });
      e.addEffect("absorption", 2400, { amplifier: 3 });
      e.addEffect("resistance", 6000, { amplifier: 0 });
      e.addEffect("fire_resistance", 6000, { amplifier: 0 });
    } else if (id === "minecraft:rotten_flesh" && Math.random() < 0.8) {
      e.addEffect("hunger", 600, { amplifier: 0 });
    }
  } catch {
    /* ignore */
  }
}
