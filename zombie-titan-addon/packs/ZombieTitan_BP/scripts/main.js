// Zombie Titan add-on: wires game events to the titan, minion and Dark Fists logic.
import { system, world } from "@minecraft/server";
import * as DF from "./darkfists.js";
import { minionTick } from "./minions.js";
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
      console.warn("[Zombie Titan] " + err);
    }
  };
}

world.afterEvents.entitySpawn.subscribe(
  safe(({ entity, cause }) => {
    if (entity.typeId === Titan.TITAN) Titan.onTitanSpawned(entity, cause);
  }),
);

world.afterEvents.entityDie.subscribe(
  safe(({ deadEntity, damageSource }) => Titan.onTitanDied(deadEntity, damageSource)),
  { entityTypes: [Titan.TITAN] },
);

world.afterEvents.entityHurt.subscribe(
  safe(({ hurtEntity, damageSource }) => Titan.onTitanHurt(hurtEntity, damageSource.damagingEntity)),
  { entityTypes: [Titan.TITAN] },
);

world.afterEvents.entityHitEntity.subscribe(
  safe(({ damagingEntity, hitEntity }) => {
    if (hitEntity.typeId === Titan.TITAN && damagingEntity.typeId === "minecraft:player") {
      Titan.onPlayerHitTitan(/** @type {import("@minecraft/server").Player} */ (damagingEntity), hitEntity);
    }
  }),
);

/** @param {import("@minecraft/server").ProjectileHitBlockAfterEvent | import("@minecraft/server").ProjectileHitEntityAfterEvent} ev */
function protoHit(ev) {
  let type;
  try {
    type = ev.projectile.typeId;
  } catch {
    return;
  }
  if (type === Titan.PROTO) Titan.onProtoBallHit(ev.projectile, ev.dimension, ev.location);
}
world.afterEvents.projectileHitBlock.subscribe(safe(protoHit));
world.afterEvents.projectileHitEntity.subscribe(safe(protoHit));

world.afterEvents.itemUse.subscribe(
  safe(({ source, itemStack }) => {
    if (itemStack?.typeId === DF.ITEM) DF.onUse(source);
  }),
);
world.afterEvents.itemStartUse.subscribe(
  safe(({ source, itemStack }) => {
    if (itemStack?.typeId === DF.ITEM) DF.onUse(source);
  }),
);

world.afterEvents.playerLeave.subscribe(safe(({ playerId }) => DF.forgetPlayer(playerId)));

// /scriptevent zt:natural_spawns off|on   - turn natural Zombie Titan spawns off or on
system.afterEvents.scriptEventReceive.subscribe(
  safe(({ id, message, sourceEntity }) => {
    if (id !== "zt:natural_spawns") return;
    const on = !/^(off|false|0|no)$/i.test(message.trim());
    Titan.setNaturalSpawns(on);
    const text = on ? "§aNatural Zombie Titan spawns: ON" : "§cNatural Zombie Titan spawns: OFF";
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
    if (tick % 600 === 300) Titan.naturalSpawnTick();
  } catch (err) {
    console.warn("[Zombie Titan] tick: " + err);
  }
}, 1);
