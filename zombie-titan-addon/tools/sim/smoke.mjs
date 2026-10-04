// Smoke test: runs the behaviour pack scripts against the mock API.
//   node tools/sim/run.mjs
import { blockOverrides, Entity, ItemStack, log, Player, runTicks, world } from "@minecraft/server";

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
function protectPlayer(p) {
  const hp = p.getComponent("minecraft:health");
  hp.max = 1e9;
  hp.setCurrentValue(1e9);
}

console.log("birth");
const player = new Player(ow, { x: 0, y: 64, z: 18 });
ow.entities.push(player);
protectPlayer(player);
const titan = ow.spawnEntity("zt:zombie_titan", { x: 0, y: 64, z: 0 });
runTicks(1);
check(titan.props["zt:birth"] === true, "titan starts its birth");
check(titan.props["zt:grow"] < 0.1, "titan starts zombie-sized (grow " + titan.props["zt:grow"] + ")");
check(titan.events.includes("zt:start_birth"), "small collision box during birth");
check(titan.getComponent("minecraft:health").currentValue <= 2000, "boss bar starts at 10%");
runTicks(100);
const midGrow = titan.props["zt:grow"];
check(midGrow > 0.4 && midGrow < 0.7, "half grown after 5 s (" + midGrow + ")");
runTicks(110);
check(titan.props["zt:birth"] === false, "birth finished");
check(titan.props["zt:grow"] === 1, "fully grown");
check(titan.getComponent("minecraft:health").currentValue === 20000, "full 20,000 HP");
check(titan.props["zt:anim"] === 11, "roars when it wakes up");
check(titan.nameTag === "", "no name tag, so the boss bar uses the name from the entity file");
const oldTitan = new Entity(ow, "zt:zombie_titan", { x: 400, y: 64, z: 400 });
oldTitan.nameTag = "§l§2Zombie Titan§r §c20000§7/§c20000 §8[§7Sword§8]";
ow.entities.push(oldTitan);
runTicks(21);
check(oldTitan.nameTag === "", "clears the health name tag left by version 1.0.0");
oldTitan.valid = false;

console.log("fighting");
const seen = new Set();
let moved = 0;
const startPos = { ...titan.location };
player.location = { x: 0, y: 64, z: 60 };
runTicks(400, () => {
  seen.add(titan.props["zt:anim"]);
  if (titan.props["zt:moving"]) moved++;
});
check(moved > 50, "walks toward a far player (" + moved + " ticks walking)");
check(Math.hypot(titan.location.x - startPos.x, titan.location.z - startPos.z) > 5, "actually moved");
check(Math.abs(titan.location.y - 64) < 0.5, "stays on the ground (y " + titan.location.y.toFixed(2) + ")");
player.location = { x: titan.location.x, y: 64, z: titan.location.z + 12 };
const before = player.damageTaken;
runTicks(4000, (t) => {
  seen.add(titan.props["zt:anim"]);
  if (t % 200 === 0) {
    // keep the player in melee range
    player.location = { x: titan.location.x + 3, y: 64, z: titan.location.z + 12 };
  }
});
const attacks = [...seen].filter((a) => a > 0 && a !== 13).sort((a, b) => a - b);
check(attacks.length >= 4, "uses several attacks: " + attacks.join(","));
check(player.damageTaken > before, "hurts the player (" + Math.round(player.damageTaken - before) + " damage)");
check(log.commands.some((c) => c.startsWith("camerashake")), "shakes the camera");
check(log.sounds.includes("zt.titan.step") && log.sounds.includes("zt.titan.slam"), "plays titan sounds");
check(log.particles.includes("zt:shockwave"), "spawns shockwaves");
const minions = ow.getEntities({ type: "zt:zombie_minion" }).length;
check(minions > 0, "summons minions (" + minions + ")");

console.log("sword parry");
player.components["minecraft:equippable"].slots.Mainhand = new ItemStack("zt:dark_fists");
const hpBefore = titan.getComponent("minecraft:health").currentValue;
titan.applyDamage(9, { cause: "entityAttack", damagingEntity: player });
world.afterEvents.entityHitEntity.fire({ damagingEntity: player, hitEntity: titan });
check(titan.getComponent("minecraft:health").currentValue === hpBefore, "armed titan ignores player hits");
check(log.messages.some((m) => m.includes("Obsidian")), "tells the player how to break the sword");

console.log("sword break on obsidian");
for (let r = 6; r <= 42; r++) {
  for (let a = 0; a < 360; a += 2) {
    const x = Math.floor(titan.location.x + Math.cos((a * Math.PI) / 180) * r);
    const z = Math.floor(titan.location.z + Math.sin((a * Math.PI) / 180) * r);
    blockOverrides.set(`${x},63,${z}`, "minecraft:obsidian");
  }
}
let stunned = false;
runTicks(6000, (t) => {
  if (titan.props["zt:anim"] === 8) stunned = true;
  if (t % 200 === 0) player.location = { x: titan.location.x + 3, y: 64, z: titan.location.z + 12 };
});
check(titan.props["zt:armed"] === false || stunned, "downward slash on obsidian breaks the sword");
check(stunned, "titan gets stunned");
check(log.items.some(([id]) => id === "minecraft:stick"), "sword drops sticks and iron");
blockOverrides.clear();

console.log("dark fists");
const df = new Player(ow, { x: 200, y: 64, z: 200 });
ow.entities.push(df);
protectPlayer(df);
df.components["minecraft:equippable"].slots.Mainhand = new ItemStack("zt:dark_fists");
runTicks(2);
check(log.messages.some((m) => m.includes("Dark Fists") && m.includes("Barrage")), "equip message shows Barrage");
check(df.held.getLore().length > 0, "fists get ability lore");
df.isSneaking = true;
runTicks(2);
df.isSneaking = false;
runTicks(2);
check(df.dyn["zt:df_mode"] === 1, "crouching switches to Dark Beam");
df.isSneaking = true;
runTicks(2);
df.isSneaking = false;
runTicks(2);
check(df.dyn["zt:df_mode"] === 0, "crouching again switches back to Barrage");
df.rotation = { x: 0, y: 0 }; // facing +Z
const dummy = ow.spawnEntity("minecraft:zombie", { x: 200, y: 64, z: 202.5 });
dummy.getComponent("minecraft:health").max = 1000;
dummy.getComponent("minecraft:health").setCurrentValue(1000);
runTicks(1);
world.afterEvents.itemUse.fire({ source: df, itemStack: df.held });
runTicks(40);
check(dummy.damageTaken >= 27 * 3, "barrage punches hit (" + dummy.damageTaken + " damage in 2 s)");
check(log.particles.includes("zt:barrage_fists"), "barrage shows fists");
check(df.cooldowns["zt_dark_fists"] === 240, "barrage cooldown shown on the item");
runTicks(400);
// beam
df.isSneaking = true;
runTicks(1);
df.isSneaking = false;
runTicks(1);
const far = ow.spawnEntity("minecraft:zombie", { x: 200, y: 64, z: 230 });
far.getComponent("minecraft:health").max = 1000;
far.getComponent("minecraft:health").setCurrentValue(1000);
runTicks(1);
world.afterEvents.itemStartUse.fire({ source: df, itemStack: df.held, useDuration: 5 });
runTicks(115);
check(far.damageTaken >= 20 * 9, "dark beam hits 30 blocks away (" + far.damageTaken + " damage)");
check(log.particles.includes("zt:dark_beam"), "beam particles");
check(far.effects.includes("wither"), "beam withers its target");

console.log("killing the titan");
titan.props["zt:armed"] = false;
let corpse;
player.components["minecraft:equippable"].slots.Mainhand = new ItemStack("zt:dark_fists");
for (let i = 0; i < 400 && titan.valid; i++) {
  titan.applyDamage(100, { cause: "entityAttack", damagingEntity: player });
  runTicks(1);
}
check(!titan.valid, "titan dies");
runTicks(2);
corpse = ow.getEntities({ type: "zt:zombie_titan_corpse" })[0];
check(!!corpse, "a corpse plays the death animation");
check(log.messages.some((m) => m.includes("has been slain")), "death announced");
const itemsBefore = log.items.length;
runTicks(320);
check(log.items.length > itemsBefore + 8, "drops a huge pile of loot (" + (log.items.length - itemsBefore) + " stacks)");
check(log.items.some(([id]) => id === "minecraft:diamond"), "loot includes diamonds");
check(player.xp === 10000, "killer gets 10,000 XP");
check(!!corpse && !corpse.valid, "corpse removed after the death sequence");

console.log("natural spawn");
const rnd = Math.random;
Math.random = () => 0.001;
world.timeOfDay = 15000;
let natural = [];
for (let i = 0; i < 1200 && natural.length === 0; i++) {
  runTicks(1);
  natural = ow.getEntities({ type: "zt:zombie_titan" });
}
Math.random = rnd;
check(natural.length === 1, "a titan can rise naturally at night");
check(log.messages.some((m) => m.includes("ground trembles")), "players are warned");
runTicks(400);
check(natural[0] && natural[0].props["zt:birth"] === true, "natural titan still rising after 20 s (43 s birth)");
runTicks(500);
check(natural[0] && natural[0].props["zt:birth"] === false, "natural titan awake after 45 s");

console.log("");
if (warnings.length) {
  console.log("script warnings:");
  for (const w of warnings.slice(0, 20)) console.log("  " + w);
}
console.log(failures === 0 && warnings.length === 0 ? "ALL GOOD" : `${failures} failures, ${warnings.length} warnings`);
process.exit(failures === 0 && warnings.length === 0 ? 0 : 1);
