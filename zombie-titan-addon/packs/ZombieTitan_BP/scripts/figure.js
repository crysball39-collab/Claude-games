// The Figure (DOORS): blind, hunts by sound, and kills whatever living thing it touches,
// except Seek and the titans. In the Library it walks the room's own paths under script
// control; one from a spawn egg roams with vanilla AI and the script points it at what it
// hears with an invisible lure.
//
// Its boss bar is a "how safe are you" meter for each player, not its health:
//   low     it is far away and can't hear you
//   middle  it is close, but can't hear you
//   high    it is not close, but it heard you and is coming
//   full    it heard you, it is close, and it is coming
import { system, world } from "@minecraft/server";
import * as Doors from "./doors_common.js";
import { bodySize, dist2D, isValid, len, livingAround, sub, wrapDeg, yawTo } from "./util.js";

/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {{ r: number, u: number, f: number }} Local */

export const FIGURE = "zt:figure";
export const LURE = "zt:figure_lure";

export const SPEED = { patrol: 2.2, hunt: 4.6, huntMax: 5.5, rage: 6.2 };
const CLOSE = 10;          // "close" for the meter, in blocks
const HEARD_FOR = 20;      // ticks a player counts as "heard" after a noise
const SEARCH_TICKS = 60;
const ACT = { none: 0, listen: 1, roar: 2, kill: 3, stumble: 4 };
const NEVER_KILL = ["titan", "zt_seek", "zt_figure", "zt_doors_prop", "inanimate"];

// ---------------------------------------------------------------- noise
/** @type {{ dim: string, loc: Vector3, radius: number, source?: string, tick: number }[]} */
let noises = [];

/** Something made a sound the Figure can hear (a book taken, the padlock, a lamp smashing...). */
export function makeNoise(dim, loc, radius, source) {
  noises.push({ dim: dim.id, loc: { ...loc }, radius, source: source?.id, tick: system.currentTick });
}

/** Per-player footstep memory. @type {Map<string, { pos: Vector3, onGround: boolean, air: number, tick: number, radius: number }>} */
const steps = new Map();

/**
 * How far this player's footsteps carry this tick: 0 while standing still or crouching,
 * 14 blocks walking, 24 sprinting, 16 for a landing thump.
 * @param {Player} p
 */
export function footsteps(p) {
  const now = system.currentTick;
  let m = steps.get(p.id);
  if (m && m.tick === now) return m.radius;
  const loc = p.location;
  if (!m) {
    m = { pos: { ...loc }, onGround: true, air: 0, tick: now, radius: 0 };
    steps.set(p.id, m);
  }
  const ticks = Math.max(1, now - m.tick);
  const speed = (Math.hypot(loc.x - m.pos.x, loc.z - m.pos.z) / ticks) * 20;
  let onGround = true;
  let sneaking = false;
  let sprinting = false;
  try {
    onGround = p.isOnGround;
    sneaking = p.isSneaking;
    sprinting = p.isSprinting;
  } catch {
    /* ignore */
  }
  let r = 0;
  if (onGround && speed > 0.35 && !sneaking) r = sprinting || speed > 5.0 ? 24 : 14;
  if (onGround && !m.onGround && m.air > 4) r = Math.max(r, sneaking ? 4 : 16);
  m.air = onGround ? 0 : m.air + ticks;
  m.onGround = onGround;
  m.pos = { ...loc };
  m.tick = now;
  m.radius = r;
  return r;
}

export function forgetPlayer(id) {
  steps.delete(id);
  for (const b of brains.values()) b.heard.delete(id);
}

// ---------------------------------------------------------------- brains
/**
 * @typedef {{
 *   id: string, mode: "level" | "free", run?: any, nav?: any,
 *   state: string, goal?: Local, path: Local[], replanAt: number, stateUntil: number,
 *   heard: Map<string, number>, lastHeardBy?: string, lastRoar: number, bonus: number,
 *   yaw: number, lureId?: string, lureAt: number, act: number, actUntil: number,
 *   lastPos?: Vector3, gait: number, stepAt: number, holdUntil: number, scriptSpeed?: number,
 * }} Brain
 */
/** @type {Map<string, Brain>} */
const brains = new Map();

function newBrain(e, mode) {
  return {
    id: e.id, mode, state: "patrol", path: [], replanAt: 0, stateUntil: 0, heard: new Map(), lastRoar: -9999,
    bonus: 0, yaw: e.getRotation().y, lureAt: 0, act: 0, actUntil: 0, gait: 0, stepAt: 0, holdUntil: 0,
  };
}

/**
 * Put a Library Figure under script control.
 * nav: { node(l) -> Local | undefined, path(a, b) -> Local[], random(rng?) -> Local, height(l) -> number }
 * @param {Entity} e
 */
export function attachLevel(e, run, nav) {
  const b = newBrain(e, "level");
  b.run = run;
  b.nav = nav;
  b.state = "scripted";
  brains.set(e.id, b);
  return b;
}

export function brainOf(e) {
  return brains.get(e.id);
}

export function detach(id) {
  const b = brains.get(id);
  if (b?.lureId) removeLure(b);
  brains.delete(id);
}

function setProp(e, k, v) {
  try {
    if (e.getProperty(k) !== v) e.setProperty(k, v);
  } catch {
    /* gone */
  }
}

/** @param {Brain} b @param {Entity} e */
function act(b, e, which, ticks) {
  b.act = ACT[which];
  b.actUntil = system.currentTick + ticks;
  setProp(e, "zt:act", b.act);
}

/** Make a Library Figure go (scripted, in a cutscene) to a frame point at a speed; it stops there. */
export function scriptMove(e, to, speed, gait = 1) {
  const b = brains.get(e.id);
  if (!b || !b.nav) return;
  b.state = "scripted";
  b.goal = to;
  b.path = b.nav.path(b.run.frame.local(e.location), to) ?? [to];
  b.scriptSpeed = speed;
  b.gait = gait;
}

export function scriptAct(e, which, ticks) {
  const b = brains.get(e.id);
  if (b) act(b, e, which, ticks);
}

/** Hand a scripted Figure over to its own hunting (after the cutscene). */
export function release(e, state = "search", goal) {
  const b = brains.get(e.id);
  if (!b) return;
  b.state = state;
  b.path = [];
  if (goal) b.goal = goal;
  b.stateUntil = system.currentTick + SEARCH_TICKS;
  if (state === "search") act(b, e, "listen", SEARCH_TICKS);
}

/** After the padlock opens: it runs at whoever is still inside, sound or no sound. */
export function enrage(e) {
  const b = brains.get(e.id);
  if (!b) return;
  b.state = "rage";
  b.replanAt = 0;
  act(b, e, "roar", 30);
  b.holdUntil = system.currentTick + 20;
  b.lastRoar = system.currentTick;
  Doors.sound(e.dimension, "zt.figure.roar", e.location, 2.5, 0.9);
}

/** Every library book taken makes it a little faster. */
export function addBonus(e, amount) {
  const b = brains.get(e.id);
  if (b) b.bonus += amount;
}

// ---------------------------------------------------------------- movement
const WALK_EPS = 0.35;

/** Kinematic step along the brain's path. Returns true when the end was reached. @param {Brain} b @param {Entity} e */
function follow(b, e, speed) {
  const fr = b.run.frame;
  const loc = e.location;
  const here = fr.local(loc);
  while (b.path.length) {
    const n = b.path[0];
    if (Math.hypot(n.r - here.r, n.f - here.f) > WALK_EPS || Math.abs(n.u - here.u) > 1.2) break;
    b.path.shift();
  }
  if (!b.path.length) {
    halt(b, e);
    return true;
  }
  const n = b.path[0];
  const dr = n.r - here.r;
  const df = n.f - here.f;
  const dl = Math.hypot(dr, df);
  // knocked far off its path (or a lag spike): put it back on it
  if (dl > 6) {
    try {
      e.teleport(fr.at(n.r, n.u, n.f));
    } catch {
      /* ignore */
    }
    return false;
  }
  const step = Math.min(speed / 20, dl || 0);
  const k = dl > 0 ? step / dl : 1;
  // the floor height runs smoothly from node to node (up the stairs to the balcony)
  const target = fr.at(here.r + dr * k, here.u + (n.u - here.u) * Math.max(k, dl < 0.05 ? 1 : 0), here.f + df * k);
  try {
    e.clearVelocity();
    e.applyImpulse({ x: target.x - loc.x, y: target.y - loc.y, z: target.z - loc.z });
  } catch {
    /* ignore */
  }
  if (dl > 0.05) face(b, e, yawTo(loc, target), 18);
  return false;
}

/** @param {Brain} b @param {Entity} e */
function halt(b, e) {
  try {
    e.clearVelocity();
  } catch {
    /* ignore */
  }
}

/** @param {Brain} b @param {Entity} e */
function face(b, e, yaw, maxTurn) {
  const d = wrapDeg(yaw - b.yaw);
  b.yaw = wrapDeg(b.yaw + Math.max(-maxTurn, Math.min(maxTurn, d)));
  try {
    e.setRotation({ x: 0, y: b.yaw });
  } catch {
    /* ignore */
  }
}

/** @param {Brain} b @param {Entity} e @param {Local} goal */
function planTo(b, e, goal) {
  const fr = b.run.frame;
  const path = b.nav.path(fr.local(e.location), goal);
  b.goal = goal;
  b.path = path ?? [];
  b.replanAt = system.currentTick + 12;
}

// ---------------------------------------------------------------- hearing
/**
 * Players this Figure can hear right now, with where it heard them.
 * @param {Brain} b @param {Entity} e @param {Player[]} players
 * @returns {{ player?: Player, loc: Vector3, loudness: number }[]}
 */
function listen(b, e, players) {
  const heard = [];
  const at = e.location;
  for (const p of players) {
    const r = footsteps(p);
    if (r > 0 && len(sub(p.location, at)) <= r) heard.push({ player: p, loc: p.location, loudness: r - len(sub(p.location, at)) });
  }
  const now = system.currentTick;
  for (const n of noises) {
    if (n.dim !== e.dimension.id || now - n.tick > 1) continue;
    const d = len(sub(n.loc, at));
    if (d <= n.radius) {
      const player = n.source ? players.find((p) => p.id === n.source) : undefined;
      heard.push({ player, loc: n.loc, loudness: n.radius - d + 100 });
    }
  }
  heard.sort((a, c) => c.loudness - a.loudness);
  return heard;
}

// ---------------------------------------------------------------- the level Figure
/** @param {Brain} b @param {Entity} e */
function levelTick(b, e, now) {
  const run = b.run;
  const players = Doors.livePlayers(run);
  // what can it hear?
  if (b.state !== "scripted" && b.state !== "kill") {
    const heard = listen(b, e, players);
    if (heard.length) {
      const h = heard[0];
      for (const x of heard) if (x.player) b.heard.set(x.player.id, now);
      if (h.player) b.lastHeardBy = h.player.id;
      const goal = b.nav.node(run.frame.local(h.loc));
      if (b.state !== "rage" && goal) {
        const fresh = b.state === "patrol" || b.state === "search";
        if (!b.goal || b.state !== "hunt" || Math.hypot(goal.r - b.goal.r, goal.f - b.goal.f) > 1.5 || b.goal.u !== goal.u) {
          planTo(b, e, goal);
        }
        b.state = "hunt";
        if (fresh) {
          // it freezes for a moment, turns to the sound and growls, then rushes
          b.holdUntil = now + 8;
          act(b, e, "none", 0);
          if (now - b.lastRoar > 200) {
            b.lastRoar = now;
            Doors.sound(e.dimension, "zt.figure.roar", e.location, 1.6, 1.0);
            act(b, e, "roar", 16);
          }
        }
      }
    }
  }
  if (b.act && now >= b.actUntil) act(b, e, "none", 0);
  let speed = 0;
  let gait = 0;
  if (now < b.holdUntil) {
    halt(b, e);
  } else if (b.state === "scripted") {
    if (b.path.length) {
      speed = b.scriptSpeed ?? SPEED.patrol;
      gait = b.gait;
      if (follow(b, e, speed)) speed = 0;
    } else halt(b, e);
  } else if (b.state === "hunt") {
    speed = Math.min(SPEED.huntMax, SPEED.hunt + b.bonus);
    gait = 2;
    if (follow(b, e, speed)) {
      b.state = "search";
      b.stateUntil = now + SEARCH_TICKS;
      act(b, e, "listen", SEARCH_TICKS);
      Doors.sound(e.dimension, "zt.figure.sniff", e.location, 1.0, 0.9);
      speed = 0;
    }
  } else if (b.state === "rage") {
    // straight for the nearest player still inside
    let best;
    let bestD = Infinity;
    for (const p of players) {
      const d = len(sub(p.location, e.location));
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best) {
      b.lastHeardBy = best.id;
      b.heard.set(best.id, now);
      if (now >= b.replanAt || !b.path.length) {
        const goal = b.nav.node(run.frame.local(best.location));
        if (goal) planTo(b, e, goal);
        b.replanAt = now + 10;
      }
      speed = SPEED.rage;
      gait = 2;
      follow(b, e, speed);
    } else halt(b, e);
  } else if (b.state === "search") {
    halt(b, e);
    if (now >= b.stateUntil) {
      b.state = "patrol";
      b.path = [];
    }
  } else if (b.state === "patrol") {
    if (!b.path.length) {
      if (now >= b.stateUntil) {
        const here = run.frame.local(e.location);
        let goal;
        for (let i = 0; i < 6; i++) {
          goal = b.nav.random();
          if (goal && Math.hypot(goal.r - here.r, goal.f - here.f) > 8) break;
        }
        if (goal) planTo(b, e, goal);
      } else halt(b, e);
    }
    if (b.path.length) {
      speed = SPEED.patrol;
      gait = 1;
      if (follow(b, e, speed)) {
        // stop and listen now and then
        if (Math.random() < 0.5) {
          b.stateUntil = now + 40;
          act(b, e, "listen", 40);
          Doors.sound(e.dimension, "zt.figure.sniff", e.location, 0.8, 1.0);
        } else b.stateUntil = now + 10;
        speed = 0;
      }
    }
  } else halt(b, e);
  b.gait = speed > 0 ? gait : 0;
  setProp(e, "zt:gait", b.gait);
  if (b.gait && now >= b.stepAt) {
    b.stepAt = now + (b.gait === 2 ? 7 : 12);
    Doors.sound(e.dimension, "zt.figure.step", e.location, b.gait === 2 ? 1.0 : 0.7, 0.85 + Math.random() * 0.2);
  }
}

// ---------------------------------------------------------------- the free (spawn egg) Figure
/** @param {Brain} b */
function removeLure(b) {
  if (!b.lureId) return;
  const l = world.getEntity(b.lureId);
  if (isValid(l)) l.remove();
  b.lureId = undefined;
}

/** @param {Brain} b @param {Entity} e */
function freeTick(b, e, now) {
  const dim = e.dimension;
  const at = e.location;
  if (now % 4 === 0) {
    let players = [];
    try {
      players = dim.getPlayers({ location: at, maxDistance: 40 });
    } catch {
      /* ignore */
    }
    const heard = listen(b, e, players);
    // it hears other creatures moving close by, too
    if (!heard.length) {
      for (const m of livingAround(dim, at, 10, { excludeFamilies: NEVER_KILL })) {
        if (m.typeId === "minecraft:player") continue;
        let v;
        try {
          v = m.getVelocity();
        } catch {
          continue;
        }
        if (Math.hypot(v.x, v.z) > 0.06) {
          heard.push({ loc: m.location, loudness: 1 });
          break;
        }
      }
    }
    if (heard.length) {
      const h = heard[0];
      for (const x of heard) if (x.player) b.heard.set(x.player.id, now);
      if (h.player) b.lastHeardBy = h.player.id;
      let lure = b.lureId ? world.getEntity(b.lureId) : undefined;
      try {
        if (!isValid(lure)) {
          lure = dim.spawnEntity(LURE, h.loc);
          lure.setDynamicProperty("zt:run", "lure");
          b.lureId = lure.id;
        } else lure.teleport(h.loc);
      } catch {
        /* chunk not loaded */
      }
      if (b.state !== "hunt" && now - b.lastRoar > 240) {
        b.lastRoar = now;
        Doors.sound(dim, "zt.figure.roar", at, 1.4, 1.0);
        act(b, e, "roar", 16);
      }
      b.state = "hunt";
      b.lureAt = now;
    }
  }
  if (b.lureId) {
    const lure = world.getEntity(b.lureId);
    if (!isValid(lure) || dist2D(lure.location, at) < 2.2 || now - b.lureAt > 300) {
      removeLure(b);
      b.state = "search";
      act(b, e, "listen", 40);
      Doors.sound(dim, "zt.figure.sniff", at, 0.8, 1.0);
    }
  }
  if (b.act && now >= b.actUntil) act(b, e, "none", 0);
  // walk / run animation from how fast it actually moves
  const last = b.lastPos ?? at;
  const speed = Math.hypot(at.x - last.x, at.z - last.z) * 20;
  b.lastPos = { ...at };
  b.gait = speed > 3.0 ? 2 : speed > 0.4 ? 1 : 0;
  setProp(e, "zt:gait", b.gait);
  if (b.gait && now >= b.stepAt) {
    b.stepAt = now + (b.gait === 2 ? 7 : 12);
    Doors.sound(dim, "zt.figure.step", at, b.gait === 2 ? 1.0 : 0.7, 0.85 + Math.random() * 0.2);
  }
}

// ---------------------------------------------------------------- touch, meters
/** Everything it touches dies, except Seek, the titans and its own kind. @param {Brain} b @param {Entity} e */
function touch(b, e, now) {
  const at = e.location;
  for (const v of livingAround(e.dimension, at, 3, { excludeFamilies: NEVER_KILL })) {
    if (v.id === e.id) continue;
    const s = bodySize(v);
    if (dist2D(v.location, at) > 0.45 + s.r + 0.25) continue;
    if (v.location.y > at.y + 2.7 || v.location.y + s.h < at.y) continue;
    if (v.typeId === "minecraft:player" && !Doors.canDie(/** @type {Player} */ (v))) continue;
    if (v.typeId === "minecraft:player") {
      act(b, e, "kill", 20);
      b.holdUntil = now + 16;
    }
    Doors.kill(v, e, "figure");
  }
}

/**
 * The danger meter for one player against one Figure (1..100).
 * @param {Brain} b @param {Entity} e @param {Player} p
 */
export function danger(b, e, p, now) {
  const d = len(sub(p.location, e.location));
  const heardAt = b.heard.get(p.id);
  const hears = heardAt !== undefined && now - heardAt <= HEARD_FOR;
  const chasing = (b.state === "hunt" || b.state === "rage") && b.lastHeardBy === p.id;
  const close = d <= CLOSE;
  const k = (lo, hi, v) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  if ((hears || chasing) && close) return 100;
  if (hears || chasing) return 70 + 15 * (1 - k(CLOSE, 40, d));
  if (close) return 42 + 18 * (1 - k(2, CLOSE, d));
  return 8 + 20 * (1 - k(CLOSE, 48, d));
}

/** @type {Map<string, { value: number, beatAt: number }>} */
const meters = new Map();

function updateMeters(now) {
  /** @type {Map<string, { p: Player, level: number }>} */
  const best = new Map();
  for (const b of brains.values()) {
    const e = world.getEntity(b.id);
    if (!isValid(e)) continue;
    let players = [];
    try {
      players = b.mode === "level" ? Doors.livePlayers(b.run) : e.dimension.getPlayers({ location: e.location, maxDistance: 48 });
    } catch {
      continue;
    }
    for (const p of players) {
      try {
        if (p.getGameMode() === "Spectator") continue;
      } catch {
        continue;
      }
      // in the middle of a Seek chase, Seek's bar is the one that matters
      if (Doors.runOf(p)?.kind === "seek") continue;
      const level = danger(b, e, p, now);
      const cur = best.get(p.id);
      if (!cur || level > cur.level) best.set(p.id, { p, level });
    }
  }
  for (const [id, { p, level }] of best) {
    let m = meters.get(id);
    if (!m) {
      m = { value: level, beatAt: 0 };
      meters.set(id, m);
    }
    m.value += (level - m.value) * 0.3;
    Doors.setMeter(p, "figure", m.value);
    // a heartbeat in your ears when it is close or coming for you
    if (level >= 40 && now >= m.beatAt) {
      m.beatAt = now + (level >= 70 ? 13 : 22);
      try {
        p.playSound(level >= 70 ? "zt.figure.heartbeat_fast" : "zt.figure.heartbeat", { volume: 0.9 });
      } catch {
        /* ignore */
      }
    }
  }
  for (const id of [...meters.keys()]) {
    if (best.has(id)) continue;
    meters.delete(id);
    const p = world.getEntity(id);
    if (p) Doors.clearMeter(/** @type {Player} */ (p), "figure");
  }
}

// ---------------------------------------------------------------- tick
let scanAt = 0;

export function figureTick(now) {
  // pick up Figures from spawn eggs near players
  if (now >= scanAt) {
    scanAt = now + 20;
    for (const p of world.getAllPlayers()) {
      let list = [];
      try {
        list = p.dimension.getEntities({ type: FIGURE, location: p.location, maxDistance: 96 });
      } catch {
        continue;
      }
      for (const e of list) {
        if (!brains.has(e.id) && e.getDynamicProperty("zt:run") === undefined) brains.set(e.id, newBrain(e, "free"));
      }
    }
  }
  for (const [id, b] of brains) {
    const e = world.getEntity(id);
    if (!isValid(e)) {
      if (b.lureId) removeLure(b);
      brains.delete(id);
      continue;
    }
    try {
      if (b.mode === "level") levelTick(b, e, now);
      else freeTick(b, e, now);
      if (b.state !== "scripted") touch(b, e, now);
    } catch (err) {
      console.warn("[Titans] figure: " + err);
    }
  }
  updateMeters(now);
  noises = noises.filter((n) => now - n.tick < 2);
}

export function isFigure(typeId) {
  return typeId === FIGURE;
}

/** A player crouching right now (for tips). @param {Player} p */
export function isQuiet(p) {
  return footsteps(p) === 0;
}

export { ACT };
