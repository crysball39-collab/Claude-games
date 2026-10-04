// Titans add-on: wires game events to the titan, minion and item logic.
import { system, world } from "@minecraft/server";
import * as DF from "./darkfists.js";
import { minionTick } from "./minions.js";
import * as Obsidian from "./obsidian.js";
import * as Serum from "./serum.js";
import * as Titan from "./titan.js";

/**
 * @template T
 * @param {(ev: T) => void} fn
 * @returns {(ev: T) => void}
 */
function safe(fn) {
  return (ev) => {
    try {
      fn(ev);
    } catch (err) {
      console.warn("[Titans] " + err);
    }
  };
}

world.afterEvents.entitySpawn.subscribe(
  safe(({ entity, cause }) => {
    if (Titan.isTitan(entity.typeId)) Titan.onTitanSpawned(entity, cause);
  }),
);

world.afterEvents.entityDie.subscribe(
  safe(({ deadEntity, damageSource }) => Titan.onTitanDied(deadEntity, damageSource)),
  { entityTypes: Titan.TITAN_IDS },
);

world.afterEvents.entityHurt.subscribe(
  safe(({ hurtEntity, damageSource }) => Titan.onTitanHurt(hurtEntity, damageSource.damagingEntity)),
  { entityTypes: Titan.TITAN_IDS },
);

world.afterEvents.entityHurt.subscribe(
  safe(({ hurtEntity, damage, damageSource }) => {
    if (damageSource.cause === "fall") Obsidian.onPlayerFell(/** @type {import("@minecraft/server").Player} */ (hurtEntity), damage);
  }),
  { entityTypes: ["minecraft:player"] },
);

world.afterEvents.entityHitEntity.subscribe(
  safe(({ damagingEntity, hitEntity }) => {
    if (Titan.isTitan(hitEntity.typeId) && damagingEntity.typeId === "minecraft:player") {
      Titan.onPlayerHitTitan(/** @type {import("@minecraft/server").Player} */ (damagingEntity), hitEntity);
    }
  }),
);

/**
 * @param {import("@minecraft/server").ProjectileHitBlockAfterEvent | import("@minecraft/server").ProjectileHitEntityAfterEvent} ev
 * @param {import("@minecraft/server").Entity} [hit]
 */
function projectileHit(ev, hit) {
  // projectiles that remove themselves on impact may already be gone; their type id still reads
  let type;
  try {
    type = ev.projectile.typeId;
  } catch {
    return;
  }
  if (type === Serum.SERUM) Serum.onSerumHit(ev.dimension, ev.location, hit, ev.source);
  else Titan.onProjectileHit(ev.projectile, ev.dimension, ev.location);
}
world.afterEvents.projectileHitBlock.subscribe(safe((ev) => projectileHit(ev)));
world.afterEvents.projectileHitEntity.subscribe(
  safe((ev) => {
    let hit;
    try {
      hit = ev.getEntityHit()?.entity;
    } catch {
      hit = undefined;
    }
    projectileHit(ev, hit);
  }),
);

/** @param {import("@minecraft/server").ItemUseAfterEvent | import("@minecraft/server").ItemStartUseAfterEvent} ev */
function itemUsed({ source, itemStack }) {
  if (itemStack?.typeId === DF.ITEM) DF.onUse(source);
  else if (itemStack?.typeId === Obsidian.SWORD) Obsidian.onUse(source);
}
world.afterEvents.itemUse.subscribe(safe(itemUsed));
world.afterEvents.itemStartUse.subscribe(safe(itemUsed));

world.afterEvents.playerLeave.subscribe(
  safe(({ playerId }) => {
    DF.forgetPlayer(playerId);
    Obsidian.forgetPlayer(playerId);
  }),
);

// /scriptevent zt:natural_spawns off|on   - turn natural titan spawns off or on
system.afterEvents.scriptEventReceive.subscribe(
  safe(({ id, message, sourceEntity }) => {
    if (id !== "zt:natural_spawns") return;
    const on = !/^(off|false|0|no)$/i.test(message.trim());
    Titan.setNaturalSpawns(on);
    const text = on ? "§aNatural titan spawns: ON" : "§cNatural titan spawns: OFF";
    if (sourceEntity && sourceEntity.typeId === "minecraft:player") {
      /** @type {import("@minecraft/server").Player} */ (sourceEntity).sendMessage(text);
    }
    else world.sendMessage(text);
  }),
  { namespaces: ["zt"] },
);

system.runInterval(() => {
  const tick = system.currentTick;
  try {
    if (tick % 20 === 0) Titan.scanForTitans();
    Titan.titanTick(tick);
    minionTick(tick);
    DF.darkFistsTick(tick);
    Obsidian.obsidianTick(tick);
    if (tick % 600 === 300) Titan.naturalSpawnTick();
  } catch (err) {
    console.warn("[Titans] tick: " + err);
  }
}, 1);
