// Gum Gum Fruit simulation: finding and eating the fruit, the five moves and
// their Jet versions, Gear 2, sinking in water, and keeping the moves on death.
//   node tools/sim/run.mjs gumgum
import { ItemStack, log, Player, runTicks, system, world } from "@minecraft/server";

const warnings = [];
console.warn = (...a) => {
  warnings.push(a.join(" "));
  if (process.env.ZT_TRACE) process.stderr.write("WARN " + a.join(" ") + "\n");
};

await import("./scripts/main.js");
const Gum = await import("./scripts/gumgum.js");

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
const animsSince = (n, p) => log.animations.slice(n).filter(([id]) => id === p.id).map(([, a]) => a);
const items = (p) => p.getComponent("minecraft:inventory").container.slots.filter(Boolean);
const ids = (p) => items(p).map((i) => i.typeId);
const hpOf = (e) => e.getComponent("minecraft:health").currentValue;
function heal(e) {
  const hp = e.getComponent("minecraft:health");
  hp.setCurrentValue(hp.max);
}
/** a zombie `d` blocks in front of the player (who faces +Z) */
function zombieAhead(p, d, side = 0) {
  const z = ow.spawnEntity("minecraft:zombie", { x: p.location.x + side, y: 64, z: p.location.z + d });
  z.getComponent("minecraft:health").max = 1000;
  heal(z);
  return z;
}
function use(p, id) {
  const stack = new ItemStack(id);
  p.components["minecraft:equippable"].slots.Mainhand = stack;
  world.afterEvents.itemUse.fire({ source: p, itemStack: stack });
  world.afterEvents.itemStartUse.fire({ source: p, itemStack: stack, useDuration: 5 });
}
function clearMobs() {
  for (const e of ow.entities) if (e.typeId !== "minecraft:player") e.valid = false;
}

// no surprise titans
system.afterEvents.scriptEventReceive.fire({ id: "zt:natural_spawns", message: "off", sourceEntity: undefined });
runTicks(1);

console.log("finding the fruit");
const luffy = new Player(ow, { x: 0, y: 64, z: 0 });
luffy.name = "Luffy";
ow.entities.push(luffy);
check(Gum.DROP_CHANCE === 0.00001, "the drop chance is 0.001%");
let n = log.items.length;
check(!Gum.onBlockBroken(luffy, "minecraft:oak_leaves", { x: 0, y: 70, z: 0 }, 0.5), "most leaf blocks drop nothing");
check(!Gum.onBlockBroken(luffy, "minecraft:stone", { x: 0, y: 70, z: 0 }, 0), "other blocks never drop it");
check(Gum.onBlockBroken(luffy, "minecraft:cherry_leaves", { x: 0, y: 70, z: 0 }, 0.000005), "a lucky leaf block drops a Gum Gum Fruit");
check(log.items.slice(n).some(([id]) => id === "zt:gum_gum_fruit"), "the fruit falls out");
world.afterEvents.playerBreakBlock.fire({
  player: luffy, block: { location: { x: 1, y: 70, z: 1 } },
  brokenBlockPermutation: { type: { id: "minecraft:birch_leaves" } }, dimension: ow,
});
check(warnings.length === 0, "breaking leaves runs cleanly");

console.log("eating it");
n = log.messages.length;
world.afterEvents.itemCompleteUse.fire({ source: luffy, itemStack: new ItemStack("zt:gum_gum_fruit"), useDuration: 0 });
check(Gum.hasPower(luffy), "eating it gives the Gum Gum powers");
const expected = ["zt:gum_pistol", "zt:gum_bazooka", "zt:gum_gatling", "zt:gum_stamp", "zt:gum_rocket", "zt:gum_gear2"];
check(expected.every((id) => ids(luffy).includes(id)) && items(luffy).length === 6, "five moves and Gear 2 appear: " + ids(luffy).join(", "));
check(items(luffy).every((i) => i.lockMode === "inventory" && i.keepOnDeath), "the moves can't be dropped and stay on death");
check(items(luffy).every((i) => i.lore.length === 1), "each move says what it does");
check(since(n).some((m) => m.includes("rubber")) && since(n).some((m) => m.includes("swim")), "the player is told about the powers and the catch");
n = log.items.length;
world.afterEvents.itemCompleteUse.fire({ source: luffy, itemStack: new ItemStack("zt:gum_gum_fruit"), useDuration: 0 });
check(ids(luffy).includes("zt:gum_gum_fruit") && items(luffy).length === 7, "a second fruit is given back");
luffy.getComponent("minecraft:inventory").container.slots[6] = undefined;

console.log("only fruit eaters can use the moves");
const other = new Player(ow, { x: 50, y: 64, z: 0 });
ow.entities.push(other);
n = log.messages.length;
let a = log.animations.length;
use(other, "zt:gum_pistol");
check(animsSince(a, other).length === 0, "nothing happens for someone else");
check(since(n).some((m) => m.includes("Only someone who ate")), "they are told why");

console.log("Gum Gum Pistol");
let z = zombieAhead(luffy, 9);
a = log.animations.length;
use(luffy, "zt:gum_pistol");
check(animsSince(a, luffy).includes("animation.zt.gum.pistol_10"), "the arm stretches 10 blocks to reach the zombie 9 away");
runTicks(8);
check(hpOf(z) === 1000, "it lands as the arm snaps forward, not before");
runTicks(1);
check(hpOf(z) === 988, "a 12 damage punch (" + (1000 - hpOf(z)) + ")");
check(z.knockbacks.length > 0 && z.knockbacks[0].z > 0, "it knocks the zombie away");
check(log.particles.includes("zt:gum_impact") && log.sounds.includes("zt.gum.punch"), "a punch impact");
check(luffy.cooldowns["zt_gum_pistol"] > 0, "the item shows its cooldown");
runTicks(10);
n = log.messages.length;
use(luffy, "zt:gum_pistol");
check(since(n).some((m) => m.includes("recharging")), "it has to recharge");
runTicks(20);
a = log.animations.length;
use(luffy, "zt:gum_pistol");
check(animsSince(a, luffy).includes("animation.zt.gum.pistol_10"), "ready again after its cooldown");
runTicks(20);
clearMobs();

console.log("Gum Gum Bazooka");
z = zombieAhead(luffy, 5);
a = log.animations.length;
use(luffy, "zt:gum_bazooka");
check(animsSince(a, luffy).includes("animation.zt.gum.bazooka_7"), "both arms stretch out");
runTicks(12);
check(1000 - hpOf(z) === 20, "a 20 damage double palm strike (" + (1000 - hpOf(z)) + ")");
check(z.knockbacks.some((k) => Math.hypot(k.x, k.z) >= 3.4), "it blasts the zombie far away");
runTicks(20);
clearMobs();

console.log("Gum Gum Gatling");
const z1 = zombieAhead(luffy, 3);
const z2 = zombieAhead(luffy, 5, 1);
const behind = zombieAhead(luffy, -4);
a = log.animations.length;
use(luffy, "zt:gum_gatling");
check(animsSince(a, luffy).includes("animation.zt.gum.gatling"), "a storm of punches");
runTicks(140);
check(1000 - hpOf(z1) >= 160 && 1000 - hpOf(z2) >= 160, "for 7 seconds it pounds everything in front (" + (1000 - hpOf(z1)) + ", " + (1000 - hpOf(z2)) + ")");
check(hpOf(behind) === 1000, "nothing behind the player is hit");
check(log.particles.filter((x) => x === "zt:gum_fists").length >= 60, "rubber fists fly the whole time");
runTicks(10);
clearMobs();

console.log("Gum Gum Stamp");
z = zombieAhead(luffy, 3);
const near = zombieAhead(luffy, 8);
const booms = log.explosions.length;
use(luffy, "zt:gum_stamp");
runTicks(11);
check(hpOf(z) === 1000, "the leg is still up");
runTicks(1);
check(1000 - hpOf(z) === 16, "the stamp lands for 16 (" + (1000 - hpOf(z)) + ")");
check(1000 - hpOf(near) === 8, "the shockwave hurts a little further out (" + (1000 - hpOf(near)) + ")");
check(log.particles.includes("zt:gum_debris") && log.particles.includes("zt:shockwave"), "debris and a shockwave");
check(log.particles.includes("minecraft:huge_explosion_emitter") && log.sounds.includes("random.explode"), "an explosion");
check(log.explosions.length === booms, "no blocks are blown up");
runTicks(20);
clearMobs();

console.log("Gum Gum Rocket");
const cow = ow.spawnEntity("minecraft:cow", { x: 0, y: 64, z: 14 });
runTicks(1);
let kb = luffy.knockbacks.length;
a = log.animations.length;
use(luffy, "zt:gum_rocket");
check(animsSince(a, luffy).includes("animation.zt.gum.rocket_14"), "both arms stretch out to grab the cow 14 blocks away");
runTicks(6);
const launch = luffy.knockbacks[kb];
check(!!launch && launch.z > 1.5 && Math.abs(launch.x) < 0.01, "the player flings themselves at it");
luffy.location = { x: 0, y: 64, z: 12.5 };     // (the mock doesn't move players: put them there)
runTicks(1);
check(cow.damageTaken === 14, "and slams into it on arrival (" + cow.damageTaken + " damage)");
luffy.applyDamage(5, { cause: "fall" });
check(hpOf(luffy) === 20, "no fall damage after a rocket");
luffy.location = { x: 0, y: 64, z: 0 };
runTicks(80);
kb = luffy.knockbacks.length;
n = log.messages.length;
use(luffy, "zt:gum_rocket");
runTicks(10);
check(luffy.knockbacks.length === kb && since(n).some((m) => m.includes("Nothing in reach")), "with nothing to grab, nothing happens");
runTicks(20);
clearMobs();

console.log("Gear 2");
a = log.animations.length;
use(luffy, "zt:gum_gear2");
check(animsSince(a, luffy).includes("animation.zt.gum.gear2"), "a fist to the ground");
runTicks(16);
check(luffy.getEffect("health_boost")?.amplifier === 4, "ten extra hearts");
check(!!luffy.getEffect("speed"), "and speed");
check(ids(luffy).includes("zt:gum_jet_pistol") && !ids(luffy).includes("zt:gum_pistol"), "the moves become Jet moves: " + ids(luffy).join(", "));
check(items(luffy).every((i) => i.lockMode === "inventory" && i.keepOnDeath), "the Jet moves are locked in too");
check(log.particles.includes("zt:gum_steam"), "steam pours off the skin");
runTicks(60);
check(animsSince(a, luffy).includes("animation.zt.gum.gear2_on"), "the pink skin keeps being shown to everyone");
z = zombieAhead(luffy, 6);
a = log.animations.length;
use(luffy, "zt:gum_jet_pistol");
check(animsSince(a, luffy).includes("animation.zt.gum.jet_pistol_7"), "Gum Gum Jet Pistol");
runTicks(4);
check(1000 - hpOf(z) === 20, "lands in a fifth of a second for 20 (" + (1000 - hpOf(z)) + ")");
runTicks(20);
clearMobs();
runTicks(1200);
check(!luffy.getEffect("health_boost") && ids(luffy).includes("zt:gum_pistol") && !ids(luffy).includes("zt:gum_jet_pistol"),
  "after 60 seconds it wears off and the normal moves come back");
check(log.animations.some(([id, x]) => id === luffy.id && x === "animation.zt.gum.gear2_off"), "the skin goes back to normal");
n = log.messages.length;
use(luffy, "zt:gum_gear2");
check(since(n).some((m) => m.includes("needs a rest")), "Gear 2 has to recharge");
runTicks(620);
use(luffy, "zt:gum_gear2");
runTicks(20);
check(ids(luffy).includes("zt:gum_jet_stamp"), "Gear 2 again");
use(luffy, "zt:gum_gear2");
check(ids(luffy).includes("zt:gum_stamp") && !luffy.getEffect("health_boost"), "using it again ends it early");
runTicks(700);

console.log("the catch: no swimming");
luffy.isInWater = true;
kb = luffy.knockbacks.length;
n = log.messages.length;
runTicks(20);
check(luffy.knockbacks.slice(kb).length >= 8 && luffy.knockbacks.slice(kb).every((k) => k.y < 0), "the water drags the player down");
check(!!luffy.getEffect("slowness") && !!luffy.getEffect("weakness"), "and saps their strength");
check(since(n).some((m) => m.includes("can't swim")), "the player is told they can't swim");
a = log.animations.length;
n = log.messages.length;
use(luffy, "zt:gum_pistol");
check(animsSince(a, luffy).length === 0 && since(n).some((m) => m.includes("powers don't work")), "no powers in water");
luffy.isInWater = false;
kb = luffy.knockbacks.length;
runTicks(10);
check(luffy.knockbacks.length === kb, "out of the water all is well");

console.log("death and respawn");
use(luffy, "zt:gum_gear2");
runTicks(20);
world.afterEvents.entityDie.fire({ deadEntity: luffy, damageSource: { cause: "entityAttack" } });
check(ids(luffy).includes("zt:gum_pistol"), "dying ends Gear 2");
luffy.getComponent("minecraft:inventory").container.slots[0] = undefined;
world.afterEvents.playerSpawn.fire({ player: luffy, initialSpawn: false });
check(expected.every((id) => ids(luffy).includes(id)), "a missing move comes back on respawn");
// leaving during Gear 2 and coming back: the Jet moves don't outlive it
use(luffy, "zt:gum_gear2");
runTicks(20);
world.afterEvents.playerLeave.fire({ playerId: luffy.id, playerName: luffy.name });
world.afterEvents.playerSpawn.fire({ player: luffy, initialSpawn: true });
check(ids(luffy).includes("zt:gum_pistol") && !ids(luffy).includes("zt:gum_jet_pistol") && !luffy.getEffect("health_boost"),
  "rejoining after Gear 2 brings the normal moves back");
runTicks(5);

console.log("");
if (warnings.length) {
  console.log("script warnings:");
  for (const w of warnings.slice(0, 20)) console.log("  " + w);
}
console.log(failures === 0 && warnings.length === 0 ? "ALL GOOD" : `${failures} failures, ${warnings.length} warnings`);
process.exit(failures === 0 && warnings.length === 0 ? 0 : 1);
