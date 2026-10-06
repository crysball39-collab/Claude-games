// Titan minions, zombie, skeleton, creeper, spider and silverfish alike (Java Titans mod tiers):
//   Loyalist - fights for its titan
//   Priest   - heals nearby injured allies, including the titan
//   Zealot   - fast and strong, leaps at its prey
//   Templar  - the strongest; brings lightning down on the titan's enemies
import { system, world } from "@minecraft/server";
import { MINION_IDS, TITAN_IDS } from "./titan.js";
import * as U from "./util.js";
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

const PRIEST = 1;
const ZEALOT = 2;
const TEMPLAR = 3;
/** @type {Map<string, {next: number, cast: number}>} */
const minions = new Map();

/** @param {Entity} e */
function variantOf(e) {
  try {
    return e.getComponent("minecraft:variant")?.value ?? 0;
  } catch {
    return 0;
  }
}

export function minionTick(tick) {
  if (tick % 10 !== 0) return;
  for (const dimId of ["overworld", "nether", "the_end"]) {
    let list = [];
    try {
      const dim = world.getDimension(dimId);
      for (const type of MINION_IDS) list = list.concat(dim.getEntities({ type }));
    } catch {
      continue;
    }
    for (const m of list) {
      try {
        tickMinion(m, tick);
      } catch {
        /* ignore */
      }
    }
  }
  if (tick % 200 === 0) {
    for (const id of minions.keys()) {
      const e = world.getEntity(id);
      if (!e) minions.delete(id);
    }
  }
}

/** @param {Entity} m @param {number} tick */
function tickMinion(m, tick) {
  const v = variantOf(m);
  let st = minions.get(m.id);
  if (!st) {
    st = { next: tick + U.randInt(40, 120), cast: 0 };
    minions.set(m.id, st);
  }
  if (st.cast > 0 && tick >= st.cast) {
    st.cast = 0;
    try {
      m.setProperty("zt:casting", false);
    } catch {
      /* ignore */
    }
  }
  if (tick < st.next) return;
  const dim = m.dimension;
  const loc = m.location;
  if (v === PRIEST) {
    st.next = tick + 100;
    let healed = false;
    const titans = TITAN_IDS.flatMap((type) => dim.getEntities({ type, location: loc, maxDistance: 48 }));
    for (const t of titans) {
      const hp = t.getComponent("minecraft:health");
      if (hp && hp.currentValue < hp.effectiveMax) {
        hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + 60));
        U.particle(dim, "minecraft:heart_particle", U.add(t.location, { x: 0, y: U.bodySize(t).h * 0.7, z: 0 }));
        healed = true;
      }
    }
    const allies = MINION_IDS.flatMap((type) => dim.getEntities({ type, location: loc, maxDistance: 10 }));
    for (const ally of allies) {
      const hp = ally.getComponent("minecraft:health");
      if (hp && hp.currentValue < hp.effectiveMax) {
        hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + 8));
        U.particle(dim, "minecraft:heart_particle", U.add(ally.location, { x: 0, y: 2.2, z: 0 }));
        healed = true;
      }
    }
    if (healed) cast(m, st, tick, 30);
  } else if (v === TEMPLAR) {
    st.next = tick + 120;
    const target = nearestEnemy(m, 24);
    if (!target) return;
    cast(m, st, tick, 30);
    U.sound(dim, "mob.evocation_illager.cast_spell", loc, 1, 0.6);
    // "brings down judgement from the heavens" a second later
    system.runTimeout(() => {
      if (!U.isValid(target) || !U.isValid(m)) return;
      try {
        target.dimension.spawnEntity("minecraft:lightning_bolt", target.location);
      } catch {
        /* ignore */
      }
    }, 20);
  } else if (v === ZEALOT) {
    st.next = tick + 60;
    const target = nearestEnemy(m, 10);
    if (!target) return;
    const d = U.sub(target.location, loc);
    const l = Math.sqrt(d.x * d.x + d.z * d.z) || 1;
    try {
      m.applyImpulse({ x: (d.x / l) * 0.9, y: 0.55, z: (d.z / l) * 0.9 });
    } catch {
      /* ignore */
    }
  } else {
    st.next = tick + 200;
  }
}

/** @param {Entity} m @param {any} st @param {number} tick @param {number} duration */
function cast(m, st, tick, duration) {
  st.cast = tick + duration;
  try {
    m.setProperty("zt:casting", true);
  } catch {
    /* ignore */
  }
}

/** @param {Entity} m @param {number} range @returns {Player | undefined} */
function nearestEnemy(m, range) {
  let best;
  let bestD = Infinity;
  for (const p of m.dimension.getPlayers({ location: m.location, maxDistance: range })) {
    if (!U.isVulnerablePlayer(p)) continue;
    const d = U.len(U.sub(p.location, m.location));
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
