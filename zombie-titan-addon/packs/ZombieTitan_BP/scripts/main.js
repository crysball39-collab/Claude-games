// Titans add-on: wires game events to the titan, minion and item logic.
import { system, world } from "@minecraft/server";
import * as DF from "./darkfists.js";
import * as Doors from "./doors_common.js";
import * as Floor from "./doors_floor1.js";
import * as Items from "./doors_items.js";
import * as Library from "./doors_library.js";
import * as Lobby from "./doors_lobby.js";
import * as Seek from "./doors_seek.js";
import * as FallGuard from "./fallguard.js";
import * as Fig from "./figure.js";
import * as Gum from "./gumgum.js";
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
    if (damageSource.cause === "fall") FallGuard.onFall(/** @type {import("@minecraft/server").Player} */ (hurtEntity), damage);
  }),
  { entityTypes: ["minecraft:player"] },
);

world.afterEvents.entityDie.subscribe(
  safe(({ deadEntity }) => {
    const p = /** @type {import("@minecraft/server").Player} */ (deadEntity);
    Gum.onDeath(p);
    Doors.onPlayerDeath(p);
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
  if (hit && Titan.isTitan(hit.typeId) && ev.source?.typeId === "minecraft:player") {
    Titan.onTitanShot(hit, /** @type {import("@minecraft/server").Player} */ (ev.source), ev.location);
  }
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

// the Doors items open a form or switch something on: one use per tap, though both use events fire
const doorsUsedAt = new Map();
const HOTEL_ITEMS = new Set(["zt:lighter", "zt:flashlight", "zt:crucifix", "zt:skeleton_key", "zt:herb_of_viridis", "zt:room_key",
  "zt:electrical_key", "zt:breaker_switch"]);

/** @param {import("@minecraft/server").ItemUseAfterEvent | import("@minecraft/server").ItemStartUseAfterEvent} ev */
function itemUsed({ source, itemStack }) {
  const id = itemStack?.typeId;
  if (id === DF.ITEM) DF.onUse(source);
  else if (id === Obsidian.SWORD) Obsidian.onUse(source);
  else if (id && Gum.ABILITY_IDS.includes(id)) Gum.onUse(source, id);
  else if (id === Library.ITEM || id === Seek.ITEM || id === Lobby.ITEM || id === Doors.PAPER || id?.startsWith(Doors.BOOK_PREFIX) ||
    HOTEL_ITEMS.has(id)) {
    const now = system.currentTick;
    if (now - (doorsUsedAt.get(source.id) ?? -99) < 10) return;
    doorsUsedAt.set(source.id, now);
    if (id === Library.ITEM) Library.onUse(source);
    else if (id === Seek.ITEM) Seek.onUse(source);
    else if (id === Lobby.ITEM) Lobby.onUse(source);
    else if (HOTEL_ITEMS.has(id)) Floor.onItemUse(source, id);
    else Library.onItemUse(source, id);
  }
}
world.afterEvents.itemUse.subscribe(safe(itemUsed));
world.afterEvents.itemStartUse.subscribe(safe(itemUsed));

// eating the Gum Gum Fruit
world.afterEvents.itemCompleteUse.subscribe(
  safe(({ source, itemStack }) => {
    if (itemStack?.typeId === Gum.FRUIT) Gum.onEat(source);
  }),
);

// one leaf block in 100,000 drops a Gum Gum Fruit
world.afterEvents.playerBreakBlock.subscribe(
  safe(({ player, block, brokenBlockPermutation }) => Gum.onBlockBroken(player, brokenBlockPermutation.type.id, block.location)),
);

world.afterEvents.playerSpawn.subscribe(
  safe(({ player, initialSpawn }) => {
    Gum.onSpawn(player);
    Doors.onPlayerSpawn(player, initialSpawn);
  }),
);

// the Library's books, its solution paper and door 51's padlock; the Hotel's closets, beds,
// drawers, keys, locked doors, Jeff's shop and door 100's lever, breaker box and switches
world.afterEvents.playerInteractWithEntity.subscribe(
  safe(({ player, target }) => {
    if (!target.typeId.startsWith("zt:")) return;
    if (Library.onInteract(player, target)) return;
    Floor.onInteract(player, target);
  }),
);

world.afterEvents.playerLeave.subscribe(
  safe(({ playerId }) => {
    DF.forgetPlayer(playerId);
    Obsidian.forgetPlayer(playerId);
    Gum.forgetPlayer(playerId);
    Doors.onPlayerLeave(playerId);
    Items.forget(playerId);
    Fig.forgetPlayer(playerId);
    doorsUsedAt.delete(playerId);
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
    Gum.gumTick(tick);
    Doors.doorsTick(tick);
    Lobby.lobbyTick(tick);
    Fig.figureTick(tick);
    Seek.seekFreeTick(tick);
    if (tick % 600 === 300) Titan.naturalSpawnTick();
  } catch (err) {
    console.warn("[Titans] tick: " + err);
  }
}, 1);
