// A well-equipped Player's way to the end of the game: it builds and lights a Nether portal
// near home and goes through; finds a fortress, shoots blazes at the spawner for their rods
// and comes home; makes eyes of ender; finds the stronghold where two thrown eyes point, lights
// the portal room's frame and jumps in; shoots down the End crystals, fights the dragon until
// it dies; goes out through a gateway to an end city for its loot and the elytra in the ship;
// and goes home through the exit portal.
//   node tools/sim/run.mjs botend
import { blockId, blockContainer, ItemStack, log, runTicks, setBlock, sim, system, world } from "@minecraft/server";

const warnings = [];
console.warn = (...a) => {
  warnings.push(a.join(" "));
  if (process.env.ZT_TRACE) process.stderr.write("WARN " + a.join(" ") + "\n");
};

// the stronghold's portal room: frames round a 3 by 3 at y 20, under x 150
const ROOM = { x: 150, y: 20, z: 0 };
function inRoom(x, y, z) {
  return x >= ROOM.x - 6 && x <= ROOM.x + 6 && z >= ROOM.z - 6 && z <= ROOM.z + 6 && y >= ROOM.y && y <= ROOM.y + 5;
}
function overworld(x, y, z) {
  if (y <= -60) return "minecraft:bedrock";
  if (inRoom(x, y, z)) return undefined === 0 ? "" : "minecraft:air";
  // the room's walls and floor of stronghold brick
  if (x >= ROOM.x - 7 && x <= ROOM.x + 7 && z >= ROOM.z - 7 && z <= ROOM.z + 7 && y >= ROOM.y - 1 && y <= ROOM.y + 6) {
    return (x + y + z) % 3 === 0 ? "minecraft:mossy_stone_bricks" : (x + z) % 4 === 0 ? "minecraft:cracked_stone_bricks" : "minecraft:stone_bricks";
  }
  if (y === 63) return "minecraft:grass_block";
  if (y >= 60 && y < 63) return "minecraft:dirt";
  return undefined;
}
// the Nether: a floor of netherrack, a fortress bridge with a blaze spawner
function nether(x, y, z) {
  if (y >= 127 || y <= 0) return "minecraft:bedrock";
  if (x >= 20 && x <= 60 && z >= -3 && z <= 3) {
    if (y === 40) return "minecraft:nether_brick";
    if (y === 41 && (z === -3 || z === 3)) return "minecraft:nether_brick_fence";
    if (y === 41 && x === 40 && z === 0) return "minecraft:mob_spawner";
    if (y > 40) return "minecraft:air";
  }
  if (y < 40) return "minecraft:netherrack";
  return "minecraft:air";
}
// the End: the main island (wide enough that the arrival platform is under it), two pillars with
// crystals, and far out along +x an island with an end city tower and its ship
function end(x, y, z) {
  const r = Math.hypot(x, z);
  if (x === 30 && z === 0 && y >= 63 && y <= 72) return "minecraft:obsidian";
  if (x === 0 && z === -30 && y >= 63 && y <= 68) return "minecraft:obsidian";
  if (r < 110 && y <= 62 && y >= 40) return "minecraft:end_stone";
  if (x >= 990 && x <= 1090 && Math.abs(z) <= 40 && y <= 60 && y >= 50) return "minecraft:end_stone";
  if (x >= 1040 && x <= 1044 && z >= -2 && z <= 2 && y >= 61 && y <= 76) return "minecraft:purpur_block";
  if (x >= 1046 && x <= 1052 && z >= -2 && z <= 2 && y === 78) return "minecraft:purpur_block";
  return "minecraft:air";
}
sim.terrain = (dim, x, y, z) => (dim === "minecraft:overworld" ? overworld(x, y, z) : dim === "minecraft:nether" ? nether(x, y, z) : end(x, y, z));
sim.items = true;
sim.mobs = true;
sim.portals = true;
sim.machines = true;
world.timeOfDay = 1000;

await import("./scripts/main.js");
const Bot = await import("./scripts/bot.js");
const B = await import("./scripts/bot_body.js");
const Inv = await import("./scripts/bot_inv.js");
const W = await import("./scripts/bot_world.js");
const St = await import("./scripts/bot_stations.js");
const ow = world.getDimension("overworld");
const ne = world.getDimension("nether");
const en = world.getDimension("the_end");
let failures = 0;
function check(cond, msg) {
  if (cond) console.log("  ok   " + msg);
  else {
    failures++;
    console.log("  FAIL " + msg);
  }
}

// the stronghold's frame (no eyes in it yet)
const frames = [];
for (let d = -1; d <= 1; d++) {
  frames.push([ROOM.x - 2, ROOM.z + d, "east"], [ROOM.x + 2, ROOM.z + d, "west"], [ROOM.x + d, ROOM.z - 2, "south"], [ROOM.x + d, ROOM.z + 2, "north"]);
}
for (const [x, z, dir] of frames) setBlock(ow, x, ROOM.y, z, "minecraft:end_portal_frame", { end_portal_eye_bit: false, "minecraft:cardinal_direction": dir });
// the end city's loot and the ship
setBlock(en, 1042, 77, 0, "minecraft:chest");
blockContainer(en, { x: 1042, y: 77, z: 0 }).setItem(4, new ItemStack("minecraft:diamond", 3));
setBlock(en, 1049, 79, 0, "minecraft:frame");
setBlock(en, 1051, 79, 0, "minecraft:dragon_head");

// a Player ready for the late game
const egg = ow.spawnEntity("zt:player", { x: 0.5, y: 64, z: 0.5 });
runTicks(2);
const bot = Bot.botOf(egg);
bot.persona.brave = 0.9;
bot.persona.curious = 0.9;
bot.home = { dim: "minecraft:overworld", pos: { x: 0, y: 64, z: 0 }, chests: [], stash: {}, stations: { crafting_table: { x: 3, y: 64, z: 3 }, furnace: { x: 3, y: 64, z: 4 } } };
setBlock(ow, 3, 64, 3, "minecraft:crafting_table");
setBlock(ow, 3, 64, 4, "minecraft:furnace", { "minecraft:cardinal_direction": "north" });
const kit = [["diamond_pickaxe", 1], ["diamond_sword", 1], ["diamond_axe", 1], ["bow", 1], ["arrow", 64], ["arrow", 64], ["shield", 1],
  ["iron_helmet", 1], ["iron_chestplate", 1], ["iron_leggings", 1], ["golden_boots", 1], ["iron_boots", 1], ["cooked_beef", 64],
  ["cobblestone", 64], ["cobblestone", 64], ["obsidian", 10], ["flint_and_steel", 1], ["ender_pearl", 13], ["water_bucket", 1],
  ["torch", 64], ["crafting_table", 1], ["stick", 16], ["golden_apple", 4]];
for (const [id, n] of kit) Inv.add(bot, new ItemStack("minecraft:" + id, n));
Inv.equipArmor(bot);

/** Run until a test passes, tracing what it does. */
function until(test, ticks, label) {
  const t0 = system.currentTick;
  let last = "";
  runTicks(ticks, (t) => {
    world.timeOfDay = 1000;
    if (bot.dead) return false;
    const now = `${bot.progress.stage} | ${bot.doing} | ${bot.entity.dimension.id.replace("minecraft:", "")}`;
    if (now !== last && process.env.ZT_TRACE) process.stderr.write(`${t} ${now} @ ${B.feet(bot).x},${B.feet(bot).y},${B.feet(bot).z} hp ${B.health(bot)}\n`);
    last = now;
    return test();
  });
  const took = system.currentTick - t0;
  console.log(`    (${label}: ${took} ticks, ${(took / 1200).toFixed(1)} minutes)`);
  return test();
}
if (process.env.ZT_TRACE) {
  world.afterEvents.entityHurt.subscribe((ev) => {
    if (ev.hurtEntity.typeId === "zt:player") process.stderr.write(`HURT ${system.currentTick} ${ev.damage.toFixed(1)} ${ev.damageSource.cause} by ${ev.damageSource.damagingEntity?.typeId} hp ${B.health(bot).toFixed(1)} task ${bot.task?.name} @ ${JSON.stringify(B.feet(bot))}\n`);
  });
  world.afterEvents.entityDie.subscribe((ev) => {
    if (ev.deadEntity.typeId === "zt:player") process.stderr.write(`DIED ${system.currentTick} ${ev.damageSource.cause} by ${ev.damageSource.damagingEntity?.typeId}\n`);
  });
}

console.log("a Nether portal");
check(until(() => !!bot.known.portal, 6000, "portal"), "builds a Nether portal near home and lights it");
if (bot.known.portal) {
  const p = bot.known.portal.pos;
  check(blockId(ow, p.x, p.y, p.z) === "minecraft:portal" && blockId(ow, p.x - 1, p.y, p.z) === "minecraft:obsidian", "an obsidian frame full of portal");
}

console.log("the Nether");
check(until(() => bot.entity.dimension.id === "minecraft:nether", 3000, "through"), "walks into it and comes out in the Nether");
check(until(() => W.recall("fortress", "minecraft:nether").length > 0, 6000, "fortress"), "finds the fortress");
check(until(() => Inv.count(bot, "minecraft:blaze_rod") >= 6 || bot.entity.dimension.id === "minecraft:overworld", 30000, "blaze rods"),
  `fights blazes at their spawner for blaze rods (${Inv.count(bot, "minecraft:blaze_rod")})`);
check(until(() => bot.entity.dimension.id === "minecraft:overworld", 12000, "home"), "and goes back through the portal");

console.log("eyes of ender");
check(until(() => Inv.count(bot, "minecraft:ender_eye") >= 12, 6000, "eyes"), "makes twelve eyes of ender");

console.log("the stronghold");
// a player throws two eyes, from two places: each flies toward the stronghold
for (const from of [{ x: 0, z: 0 }, { x: 60, z: 80 }]) {
  const eye = ow.spawnEntity("minecraft:eye_of_ender_signal", { x: from.x + 0.5, y: 66, z: from.z + 0.5 });
  const d = Math.hypot(ROOM.x - from.x, ROOM.z - from.z);
  runTicks(4);
  eye.location = { x: from.x + ((ROOM.x - from.x) / d) * 12, y: 70, z: from.z + ((ROOM.z - from.z) / d) * 12 };
  runTicks(14);
  eye.remove();
}
const guess = W.strongholdGuess("minecraft:overworld", { x: 0, y: 64, z: 0 });
check(guess && guess.sure && Math.hypot(guess.x - ROOM.x, guess.z - ROOM.z) < 8, "watching where the eyes flew, it works out where the stronghold is");
check(until(() => W.recall("stronghold", "minecraft:overworld").some((s) => s.room), 20000, "stronghold"), "goes there and finds the portal room underground");

console.log("the End portal");
check(until(() => bot.entity.dimension.id === "minecraft:the_end", 20000, "into the End"), "digs down, fills the frame with eyes, and jumps in");
check(frames.every(([x, z]) => ow.getBlock({ x, y: ROOM.y, z }).permutation.getState("end_portal_eye_bit")), "an eye in every frame");
check(blockId(ow, ROOM.x, ROOM.y, ROOM.z) === "minecraft:end_portal", "and the portal open");

console.log("the dragon");
const dragon = en.spawnEntity("minecraft:ender_dragon", { x: 0, y: 80, z: 30 });
const c1 = en.spawnEntity("minecraft:ender_crystal", { x: 30.5, y: 73, z: 0.5 });
const c2 = en.spawnEntity("minecraft:ender_crystal", { x: 0.5, y: 69, z: -29.5 });
check(until(() => !c1.isValid && !c2.isValid, 20000, "crystals"), "destroys the End crystals");
check(until(() => !dragon.isValid, 30000, "dragon"), "and kills the Ender Dragon");
check(bot.progress.dragon, "it knows it beat the dragon");
check(log.messages.some((m) => m.startsWith(`<${bot.name}> `) && /gg|dragon/i.test(m)), "and says so");

console.log("after");
check(until(() => Inv.has(bot, "minecraft:elytra"), 40000, "end city"), "through the gateway to the outer islands, it finds the ship's elytra");
check(Inv.count(bot, "minecraft:diamond") >= 3, "and loots the end city's chest");
check(until(() => bot.entity.dimension.id === "minecraft:overworld", 20000, "home"), "then goes home through the exit portal");

console.log("");
console.log(`    stats: ${JSON.stringify(bot.stats)}; level ${bot.level}`);
check(warnings.length === 0, "no script errors" + (warnings.length ? ": " + warnings.slice(0, 3).join(" | ") : ""));
console.log(failures === 0 ? "ALL GOOD" : `${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
