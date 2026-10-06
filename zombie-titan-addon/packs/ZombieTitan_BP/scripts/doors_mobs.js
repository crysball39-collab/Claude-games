// The Hotel's creatures (DOORS): Rush, Screech and Hide.
//
// Rush: after a door opens, now and then (one door in ten; one in four in the Greenhouse,
// where lightning outside gives it away instead), the lights flicker. Its roar grows louder for
// seven seconds, then it tears through the rooms from behind you to the next closed door,
// bursting every light on its way. Anyone it finds who isn't hiding in a closet or under a
// bed dies, unless they hold up a crucifix: then chains of light drag Rush into the floor.
//
// Screech: in a dark room, sometimes a "psst" behind you. Turn and look at it and it screeches
// and leaves; don't, and it bites (8 damage). A lit lighter or flashlight keeps it away more.
//
// Hide: whoever stays hidden too long sees its eyes, and is thrown out and hurt (the timing is
// kept by doors_floor1.js; this draws the eyes).
import { system, world } from "@minecraft/server";
import * as Doors from "./doors_common.js";
import { along, breakLights, isDark, isOrdinary, measure, pathThrough, roomIndexAt, roomLights } from "./doors_hotel.js";
import * as Items from "./doors_items.js";
import { isValid, len, particle, sub, yawTo } from "./util.js";

/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("./doors_common.js").Run} Run */
/** @typedef {import("./doors_hotel.js").FloorData} FloorData */

export const RUSH = { flicker: 40, warn: 140, speed: 1.3, reach: 6 };
const SCREECH = { wait: 80, look: 60, damage: 8, cone: 0.92, ban: 300 };

// ---------------------------------------------------------------- Rush
/** A door was opened into room n: maybe Rush comes. @param {Run} run @param {FloorData} d */
export function maybeRush(run, d, n, now) {
  if (d.rush || n - d.lastRush < 3) return;
  const room = d.rooms[n];
  const chance = room.kind === "greenhouse" ? 0.25 : 0.1;
  if (Math.random() < chance) startRush(run, d, n, now);
}

/** The warning: flickering lights (or lightning), and a roar that grows. @param {Run} run @param {FloorData} d */
export function startRush(run, d, n, now) {
  d.rush = { phase: "warn", at: now, room: n, s: 0, id: undefined, line: undefined, broke: new Set(), soundAt: now,
    flickerAt: now, passAt: 0, end: n };
  d.lastRush = n;
  const room = d.rooms[n];
  if (room.kind === "greenhouse") {
    for (const p of Doors.livePlayers(run)) {
      Doors.fade(p, 0.0, 0.08, 0.35, { red: 0.9, green: 0.95, blue: 1.0 });
      try {
        p.playSound("zt.rush.thunder", { volume: 1.0 });
      } catch {
        /* ignore */
      }
    }
  } else {
    for (const p of Doors.livePlayers(run)) Doors.sound(run.dim, "zt.rush.flicker", p.location, 1.0, 1.0);
  }
}

/** @param {Run} run @param {FloorData} d */
export function rushTick(run, d, now) {
  const r = d.rush;
  if (!r) return;
  const t = now - r.at;
  const fr = run.frame;
  if (r.phase === "warn") {
    // the lights flicker for two seconds in the rooms around you
    if (t < RUSH.flicker && now >= r.flickerAt) {
      r.flickerAt = now + 2 + Math.floor(Math.random() * 3);
      for (let n = Math.max(0, d.rear - 1); n <= d.lead; n++) {
        const room = d.rooms[n];
        if (room && !room.dark && !room.seg) roomLights(run, room, Math.random() < 0.45);
      }
    }
    if (t === RUSH.flicker) {
      for (let n = Math.max(0, d.rear - 2); n <= d.lead; n++) {
        const room = d.rooms[n];
        if (room && !room.dark && !room.seg) roomLights(run, room, true);
      }
    }
    // somewhere behind you it's coming, louder and louder
    if (now >= r.soundAt) {
      r.soundAt = now + 20;
      const behind = d.rooms[Math.max(0, d.rear - 2)];
      const at = behind ? fr.at(behind.entryR + 1, behind.u0 + 1, behind.f0) : fr.at(0, 1, 0);
      const vol = 0.4 + (t / RUSH.warn) * 2.2;
      for (const p of Doors.livePlayers(run)) {
        try {
          p.playSound("zt.rush.far", { location: at, volume: vol, pitch: 0.9 + (t / RUSH.warn) * 0.2 });
        } catch {
          /* ignore */
        }
      }
    }
    if (t >= RUSH.warn) spawnRush(run, d, now);
    return;
  }
  if (r.phase === "pass") passTick(run, d, r, now);
  if (r.phase === "banished" && now >= r.passAt) {
    const e = r.id ? world.getEntity(r.id) : undefined;
    if (isValid(e)) e.remove();
    d.rush = undefined;
  }
}

/** It comes: from the room behind the last of you, to the next closed door. @param {Run} run @param {FloorData} d */
function spawnRush(run, d, now) {
  const r = d.rush;
  let a = Math.max(1, d.rear - 1);
  while (d.rooms[a]?.seg && a < d.lead) a++;
  let b = Math.max(d.lead, d.frontier);
  while (b > a && d.rooms[b]?.seg) b--;
  if (b < a) {
    d.rush = undefined;
    return;
  }
  r.line = measure(pathThrough(d, a, b, 1.0));
  r.end = b;
  const p0 = along(r.line, 0);
  const fr = run.frame;
  let e;
  try {
    e = Doors.spawnFor(run, "zt:rush", fr.at(p0.r, p0.u, p0.f), { yaw: fr.yawOf("f") });
  } catch {
    d.rush = undefined;
    return;
  }
  r.id = e.id;
  r.phase = "pass";
  r.s = 0;
  Doors.sound(run.dim, "zt.rush.pass", e.location, 3.0, 1.0);
}

/** Through the rooms: lights burst, and whoever isn't hiding dies. @param {Run} run @param {FloorData} d */
function passTick(run, d, r, now) {
  const e = r.id ? world.getEntity(r.id) : undefined;
  if (!isValid(e)) {
    d.rush = undefined;
    return;
  }
  const fr = run.frame;
  r.s += RUSH.speed;
  const p = along(r.line, r.s);
  const at = fr.at(p.r, p.u, p.f);
  try {
    e.teleport(at, { rotation: { x: 0, y: yawTo(fr.at(0, 0, 0), fr.at(p.dir.r, 0, p.dir.f)) } });
  } catch {
    /* ignore */
  }
  if (now % 2 === 0) particle(run.dim, "zt:rush_smoke", at);
  if (now >= r.passAt) {
    r.passAt = now + 8;
    Doors.sound(run.dim, "zt.rush.pass", at, 2.5, 0.95 + Math.random() * 0.1);
  }
  const here = roomIndexAt(d, p);
  const room = d.rooms[here];
  if (room && !r.broke.has(here) && !room.seg) {
    r.broke.add(here);
    if (breakLights(run, room)) Doors.sound(run.dim, "zt.lights.break", at, 2.0, 1.0);
  }
  // whoever it finds out in the open
  for (const x of d.where ?? []) {
    const q = /** @type {Player} */ (x.p);
    if (!isValid(q) || Doors.isHidden(q) || !Doors.canDie(q)) continue;
    const sameRoom = x.n === here && Math.abs(x.l.f - p.f) < 24;
    if (!sameRoom && len(sub(q.location, at)) > RUSH.reach) continue;
    if (Doors.holdsCrucifix(q)) {
      banish(run, d, r, e, q, now);
      return;
    }
    Doors.kill(q, e, "rush");
  }
  if (r.s >= r.line.total) {
    // it's gone through the last door
    particle(run.dim, "zt:rush_smoke", at);
    Doors.sound(run.dim, "zt.rush.gone", at, 2.0, 1.0);
    e.remove();
    d.rush = undefined;
  }
}

/** The crucifix: chains of the Guiding Light drag Rush down into the floor. @param {Run} run @param {FloorData} d */
function banish(run, d, r, e, p, now) {
  r.phase = "banished";
  r.passAt = now + 50;
  Doors.spendCrucifix(p, { x: e.location.x, y: e.location.y - 1, z: e.location.z });
  try {
    e.setProperty("zt:anim", 1);
  } catch {
    /* ignore */
  }
  Doors.sound(run.dim, "zt.rush.banished", e.location, 2.5, 1.0);
  for (const q of Doors.livePlayers(run)) q.sendMessage("§b" + p.name + "'s crucifix dragged Rush into the floor!");
}

// ---------------------------------------------------------------- Screech
/** @param {Run} run @param {FloorData} d */
export function screechTick(run, d, now) {
  for (const x of d.where ?? []) {
    const p = x.p;
    const s = d.screech.get(p.id);
    if (s) {
      screechStep(run, d, p, s, now);
      continue;
    }
    const room = d.rooms[x.n];
    if (Doors.isHidden(p) || !isOrdinary(room) || !isDark(room) || d.rush) {
      d.darkSince.delete(p.id);
      continue;
    }
    if (!d.darkSince.has(p.id)) d.darkSince.set(p.id, now);
    if (now % 20 !== 0 || now - d.darkSince.get(p.id) < SCREECH.wait) continue;
    if (now < (d.screechBan?.get(p.id) ?? 0)) continue;
    const chance = Items.isLit(p) ? 0.025 : 0.07;
    if (Math.random() < chance) spawnScreech(run, d, p, now);
  }
}

/** Somewhere behind you, out of sight: psst. @param {Run} run @param {FloorData} d @param {Player} p */
export function spawnScreech(run, d, p, now) {
  const yaw = p.getRotation().y;
  const head = p.getHeadLocation();
  for (let tries = 0; tries < 16; tries++) {
    // behind you or off to the side; failing that, up by the ceiling over your head
    const last = tries === 15;
    const a = ((yaw + 180 + (Math.random() * 2 - 1) * (tries < 8 ? 75 : 110)) * Math.PI) / 180;
    const dist = last ? 0 : (tries < 8 ? 2.4 : 1.6) + Math.random() * 1.0;
    const off = last ? { x: 0, y: 1.3, z: 0 } : { x: -Math.sin(a) * dist, y: -0.2 + Math.random() * 0.9, z: Math.cos(a) * dist };
    const at = { x: head.x + off.x, y: head.y + off.y, z: head.z + off.z };
    let clear = false;
    try {
      clear = !!run.dim.getBlock(at)?.isAir;
    } catch {
      clear = false;
    }
    if (!clear) continue;
    let e;
    try {
      e = Doors.spawnFor(run, "zt:screech", { x: at.x, y: at.y - 0.5, z: at.z }, { yaw: yawTo(at, head) });
    } catch {
      return;
    }
    d.screech.set(p.id, { id: e.id, at: now, off, phase: "lurk", until: 0 });
    Doors.sound(run.dim, "zt.screech.psst", at, 1.2, 1.0);
    return;
  }
}

/** @param {Run} run @param {FloorData} d @param {Player} p */
function screechStep(run, d, p, s, now) {
  const e = world.getEntity(s.id);
  if (!isValid(e)) {
    d.screech.delete(p.id);
    return;
  }
  if (s.phase !== "lurk") {
    if (now >= s.until) {
      e.remove();
      d.screech.delete(p.id);
    }
    return;
  }
  if (Doors.isHidden(p)) {
    leave(d, p, e, s, now);
    return;
  }
  const head = p.getHeadLocation();
  const at = { x: head.x + s.off.x, y: head.y + s.off.y, z: head.z + s.off.z };
  try {
    e.teleport({ x: at.x, y: at.y - 0.5, z: at.z }, { rotation: { x: 0, y: yawTo(at, head) } });
  } catch {
    /* ignore */
  }
  // did you look at it?
  const to = sub(at, head);
  const dist = len(to);
  let seen = false;
  try {
    const v = p.getViewDirection();
    seen = dist > 0.1 && (v.x * to.x + v.y * to.y + v.z * to.z) / dist >= SCREECH.cone;
  } catch {
    seen = false;
  }
  if (seen) {
    s.phase = "seen";
    s.until = now + 12;
    e.setProperty("zt:anim", 2);
    Doors.sound(run.dim, "zt.screech.scream", at, 1.5, 1.2);
    if (!d.screechBan) d.screechBan = new Map();
    d.screechBan.set(p.id, now + SCREECH.ban);
    return;
  }
  if (now - s.at < SCREECH.look) return;
  // too slow: it bites (unless a crucifix sends it into the floor)
  if (!d.screechBan) d.screechBan = new Map();
  d.screechBan.set(p.id, now + SCREECH.ban);
  if (Doors.holdsCrucifix(p)) {
    s.phase = "banished";
    s.until = now + 40;
    e.setProperty("zt:anim", 3);
    Doors.spendCrucifix(p, { x: at.x, y: p.location.y, z: at.z });
    return;
  }
  s.phase = "bite";
  s.until = now + 14;
  e.setProperty("zt:anim", 1);
  Doors.sound(run.dim, "zt.screech.bite", at, 1.6, 1.0);
  Doors.fade(p, 0.0, 0.15, 0.4, { red: 0.6, green: 0.0, blue: 0.0 });
  if (Doors.canDie(p)) Doors.hurt(p, SCREECH.damage, "screech");
}

/** @param {FloorData} d */
function leave(d, p, e, s, now) {
  s.phase = "gone";
  s.until = now + 1;
  e.remove();
  d.screech.delete(p.id);
}

// ---------------------------------------------------------------- Hide
/**
 * Hide's eyes crowding your view from inside your hiding place, the red closing in.
 * @param {Player} p @param {number} k 0 at the first warning, 1 when it throws you out
 */
export function hideEyes(p, k) {
  let head;
  let v;
  try {
    head = p.getHeadLocation();
    v = p.getViewDirection();
  } catch {
    return;
  }
  const n = 2 + Math.floor(k * 4);
  for (let i = 0; i < n; i++) {
    const dist = 0.7 + Math.random() * 0.5;
    const at = { x: head.x + v.x * dist + (Math.random() - 0.5) * 0.9, y: head.y + v.y * dist + (Math.random() - 0.5) * 0.6,
      z: head.z + v.z * dist + (Math.random() - 0.5) * 0.9 };
    particle(p.dimension, "zt:hide_eyes", at);
  }
  Doors.fade(p, 0.05, 0.05, 0.25, { red: 0.25 + 0.5 * k, green: 0.0, blue: 0.0 });
  try {
    p.playSound(Math.random() < 0.5 ? "zt.hide.whisper" : "zt.figure.heartbeat_fast", { volume: 0.8 + k * 0.4 });
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- the end
/** The run is over: Rush and Screech go. @param {Run} run @param {FloorData} d */
export function endAll(run, d) {
  const r = d.rush;
  if (r?.id) {
    const e = world.getEntity(r.id);
    if (isValid(e)) e.remove();
  }
  d.rush = undefined;
  for (const s of d.screech?.values() ?? []) {
    const e = world.getEntity(s.id);
    if (isValid(e)) e.remove();
  }
  d.screech?.clear();
  void system;
}
