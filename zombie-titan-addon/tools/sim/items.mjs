// Item simulation: the Obsidian Sword's dash, the obsidian armor set bonus
// and the Growth Serum turning zombies and skeletons into titans.
//   node tools/sim/run.mjs items
import { GameMode, ItemStack, log, Player, runTicks, system, world } from "@minecraft/server";

const warnings = [];
console.warn = (...a) => {
  warnings.push(a.join(" "));
  if (process.env.ZT_TRACE) process.stderr.write("WARN " + a.join(" ") + "\n");
};

await import("./scripts/main.js");

const ow = world.getDimension("overworld");
let failures = 0;
function check(cond, msg) {
  if (cond) console.log("  ok   " + msg);
  else {
    failures++;
    console.log("  FAIL " + msg);
  }
}
const since = (n) => log.messages.slice(n);

// no surprise titans in the middle of the test
system.afterEvents.scriptEventReceive.fire({ id: "zt:natural_spawns", message: "off", sourceEntity: undefined });

console.log("obsidian sword dash");
const player = new Player(ow, { x: 0, y: 64, z: 0 });
ow.entities.push(player);
const slots = player.components["minecraft:equippable"].slots;
slots.Mainhand = new ItemStack("zt:obsidian_sword");
runTicks(1);
const use = () => {
  world.afterEvents.itemUse.fire({ source: player, itemStack: slots.Mainhand });
  world.afterEvents.itemStartUse.fire({ source: player, itemStack: slots.Mainhand, useDuration: 10 });
};
use();
check(player.knockbacks.length === 1, "tap and hold launches the player (once per press)");
const kb = player.knockbacks[0] ?? { x: 0, y: 0, z: 0 };
check(Math.hypot(kb.x, kb.z) > 2 && kb.z > 0 && Math.abs(kb.x) < 1e-9, "straight ahead at great speed (" + Math.hypot(kb.x, kb.z).toFixed(1) + ")");
check(kb.y > 0 && kb.y < 1, "with a small hop");
check(player.cooldowns["zt_obsidian_dash"] === 30, "the sword shows a 1.5 second cooldown");
check(log.sounds.includes("zt.obsidian.dash"), "whoosh");
let n = log.messages.length;
runTicks(1);
world.afterEvents.itemStartUse.fire({ source: player, itemStack: slots.Mainhand, useDuration: 10 });
check(!since(n).some((m) => m.includes("recharging")), "a late event from the same press stays quiet");
runTicks(5);
check(log.particles.filter((p) => p === "zt:dash_trail").length >= 5, "leaves a trail");
n = log.messages.length;
use();
check(player.knockbacks.length === 1, "no second dash while recharging");
check(since(n).some((m) => m.includes("recharging")), "tells the player it is recharging");
runTicks(30);
player.rotation = { x: 0, y: 90 };
use();
const kb2 = player.knockbacks[1] ?? { x: 0, y: 0, z: 0 };
check(player.knockbacks.length === 2, "dashes again after the cooldown");
check(kb2.x < -2 && Math.abs(kb2.z) < 1e-9, "in the direction the player looks");

console.log("safe landing");
const hp = player.getComponent("minecraft:health");
player.applyDamage(6, { cause: "fall" });
check(hp.currentValue === 20, "fall damage right after a dash is undone");
player.applyDamage(3, { cause: "entityAttack" });
check(hp.currentValue === 17, "other damage still counts");
runTicks(60);
player.applyDamage(6, { cause: "fall" });
check(hp.currentValue === 11, "an ordinary fall still hurts");
hp.setCurrentValue(20);

console.log("only the obsidian sword dashes");
slots.Mainhand = new ItemStack("minecraft:diamond_sword");
use();
check(player.knockbacks.length === 2, "a diamond sword does nothing");
const sword = new ItemStack("zt:obsidian_sword");
world.afterEvents.itemUse.fire({ source: player, itemStack: sword });
check(player.knockbacks.length === 2, "nor an obsidian sword that isn't in the main hand");

console.log("obsidian armor");
slots.Head = new ItemStack("zt:obsidian_helmet");
slots.Chest = new ItemStack("zt:obsidian_chestplate");
slots.Legs = new ItemStack("zt:obsidian_leggings");
player.effects.length = 0;
runTicks(40);
check(!player.effects.includes("resistance"), "three pieces: no bonus");
slots.Feet = new ItemStack("zt:obsidian_boots");
runTicks(40);
check(player.effects.includes("resistance"), "the full set gives Resistance");

console.log("growth serum: direct hit");
player.gameMode = GameMode.Creative; // the new titans leave the player alone
/** throws a bottle that breaks at `at`, on `hit` if given */
function splash(at, hit) {
  const bottle = ow.spawnEntity("zt:growth_serum", at);
  bottle.valid = false; // the bottle breaks on impact
  if (hit) {
    world.afterEvents.projectileHitEntity.fire({
      projectile: bottle, dimension: ow, location: at, hitVector: { x: 0, y: -1, z: 0 }, source: player,
      getEntityHit: () => ({ entity: hit }),
    });
  } else {
    world.afterEvents.projectileHitBlock.fire({
      projectile: bottle, dimension: ow, location: at, hitVector: { x: 0, y: -1, z: 0 }, source: player,
      getBlockHit: () => ({}),
    });
  }
}
const zombie = ow.spawnEntity("minecraft:zombie", { x: 0, y: 64, z: 30 });
zombie.setRotation({ x: 0, y: 90 });
runTicks(1);
n = log.messages.length;
splash({ x: 0, y: 65, z: 30 }, zombie);
check(log.particles.includes("zt:serum_splash") && log.sounds.includes("zt.serum.shatter"), "the bottle shatters");
check(!zombie.valid, "the zombie is gone");
runTicks(1);
const zt = ow.getEntities({ type: "zt:zombie_titan" })[0];
check(!!zt, "a Zombie Titan takes its place");
check(!!zt && zt.location.x === 0 && zt.location.z === 30 && zt.rotation.y === 90, "right where the zombie stood, facing the same way");
check(!!zt && zt.props["zt:birth"] === true && zt.props["zt:grow"] < 0.1, "starting at zombie size");
check(log.particles.includes("zt:serum_swirl") && log.sounds.includes("zt.serum.grow"), "the serum swirls around it");
check(since(n).some((m) => m.includes("the Zombie is growing into a Zombie Titan")), "players see the Zombie growing");
runTicks(170);
check(!!zt && zt.props["zt:birth"] === false && zt.props["zt:grow"] === 1, "fully grown after 8 seconds");
check(!!zt && zt.getComponent("minecraft:health").currentValue === 20000, "with all 20,000 HP");

console.log("growth serum: near miss");
const skeleton = ow.spawnEntity("minecraft:skeleton", { x: 40, y: 64, z: 0 });
runTicks(1);
n = log.messages.length;
splash({ x: 41.5, y: 64, z: 0.5 });
check(!skeleton.valid, "a bottle breaking next to a skeleton still reaches it");
runTicks(1);
const st = ow.getEntities({ type: "zt:skeleton_titan" })[0];
check(!!st && st.props["zt:birth"] === true, "it grows into a Skeleton Titan");
check(since(n).some((m) => m.includes("the Skeleton is growing into a Skeleton Titan")), "announced");

console.log("growth serum: no titan form");
const cow = ow.spawnEntity("minecraft:cow", { x: -40, y: 64, z: 0 });
runTicks(1);
n = log.messages.length;
splash({ x: -40, y: 65, z: 0 }, cow);
check(cow.valid, "a cow stays a cow");
check(since(n).some((m) => m.includes("nothing here has a titan form")), "the thrower is told why");
n = log.messages.length;
splash({ x: -60, y: 64, z: 0 });
check(since(n).some((m) => m.includes("nothing here has a titan form")), "same for a miss");
check(ow.getEntities({ type: "zt:zombie_titan" }).length === 1 && ow.getEntities({ type: "zt:skeleton_titan" }).length === 1, "no extra titans");

console.log("growth serum: titan limit");
const husk = ow.spawnEntity("minecraft:husk", { x: 0, y: 64, z: -30 });
runTicks(1);
splash({ x: 0, y: 65, z: -30 }, husk);
runTicks(1);
check(!husk.valid && ow.getEntities({ type: "zt:zombie_titan" }).length === 2, "a husk becomes the third titan");
const zombie2 = ow.spawnEntity("minecraft:zombie", { x: -20, y: 64, z: -20 });
runTicks(1);
n = log.messages.length;
const items = log.items.length;
splash({ x: -20, y: 65, z: -20 }, zombie2);
runTicks(1);
check(zombie2.valid && ow.getEntities({ type: "zt:zombie_titan" }).length === 2, "a fourth titan nearby is refused");
check(since(n).some((m) => m.includes("already 3 titans nearby")), "the thrower is told why");
check(log.items.slice(items).some(([id]) => id === "zt:growth_serum"), "and gets the bottle back");

console.log("");
if (warnings.length) {
  console.log("script warnings:");
  for (const w of warnings.slice(0, 20)) console.log("  " + w);
}
console.log(failures === 0 && warnings.length === 0 ? "ALL GOOD" : `${failures} failures, ${warnings.length} warnings`);
process.exit(failures === 0 && warnings.length === 0 ? 0 : 1);
