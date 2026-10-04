// Growth Serum: a thrown bottle that makes a mob with a titan form grow into
// that titan (zombies -> Zombie Titan, skeletons -> Skeleton Titan).
//   8 glass around a bottle of dragon's breath; thrown like a splash potion
import { ItemStack } from "@minecraft/server";
import * as Titan from "./titan.js";
import * as U from "./util.js";
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

export const SERUM = "zt:growth_serum";
const SPLASH_RADIUS = 2.5; // a near miss still reaches a mob this close to where the bottle broke
const TITAN_CAP = 3; // titans are heavy: at most this many near each other
const CAP_RADIUS = 128;

/** @param {Entity | undefined} e */
function canGrow(e) {
  try {
    return U.isValid(e) && e.typeId in Titan.GROWS_INTO;
  } catch {
    return false;
  }
}

/** The mob the bottle hit, or else the closest one it splashed. */
/** @param {Dimension} dim @param {Vector3} location @param {Entity | undefined} hit */
function pickMob(dim, location, hit) {
  if (canGrow(hit)) return hit;
  let best;
  let bestDist = Infinity;
  try {
    for (const e of dim.getEntities({ location, maxDistance: SPLASH_RADIUS, excludeTypes: ["minecraft:player"] })) {
      if (!canGrow(e)) continue;
      const d = U.len(U.sub(e.location, location));
      if (d < bestDist) {
        best = e;
        bestDist = d;
      }
    }
  } catch {
    return undefined;
  }
  return best;
}

/** @param {Dimension} dim @param {Vector3} location */
function titansNear(dim, location) {
  let n = 0;
  for (const type of Titan.TITAN_IDS) {
    try {
      n += dim.getEntities({ type, location, maxDistance: CAP_RADIUS }).length;
    } catch {
      /* ignore */
    }
  }
  return n;
}

/** @param {Entity | undefined} thrower @param {string} text */
function tell(thrower, text) {
  if (!thrower) return;
  try {
    if (thrower.typeId === "minecraft:player") /** @type {Player} */ (thrower).sendMessage(text);
  } catch {
    /* ignore */
  }
}

/**
 * A Growth Serum bottle broke on a block or a mob.
 * @param {Dimension} dim @param {Vector3} location
 * @param {Entity | undefined} hit the mob it hit, if it hit one
 * @param {Entity | undefined} thrower
 */
export function onSerumHit(dim, location, hit, thrower) {
  U.particle(dim, "zt:serum_splash", location);
  U.sound(dim, "zt.serum.shatter", location, 1, 1);
  const mob = pickMob(dim, location, hit);
  if (!mob) {
    tell(thrower, "§7The Growth Serum splashes, but nothing here has a titan form. §8(zombies and skeletons do)");
    return;
  }
  let at;
  try {
    at = { x: mob.location.x, y: mob.location.y, z: mob.location.z };
  } catch {
    return;
  }
  if (titansNear(dim, at) >= TITAN_CAP) {
    tell(thrower, `§cThe Growth Serum fizzles out: there are already ${TITAN_CAP} titans nearby.`);
    // the bottle didn't get to work, so it isn't lost
    try {
      dim.spawnItem(new ItemStack(SERUM, 1), location);
    } catch {
      /* ignore */
    }
    return;
  }
  const titan = Titan.growIntoTitan(mob);
  if (!titan) return;
  U.particle(dim, "zt:serum_swirl", at);
  U.particle(dim, "zt:minion_summon", at);
  U.sound(dim, "zt.serum.grow", at, 2, 0.8);
}
