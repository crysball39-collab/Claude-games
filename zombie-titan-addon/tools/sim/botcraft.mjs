// A Player on its own from nothing, in a small world: a forest on grass, stone with coal and
// iron ore under it, sand by a pond, gravel, and cows, pigs and sheep about. It should get
// wood and a crafting table, a wooden then a stone pickaxe, a sword, food (cooked in a real
// furnace), coal and torches, wool and a bed, build itself a house, and dig down for iron.
//   node tools/sim/run.mjs botcraft
import { blockId, ItemStack, log, runTicks, sim, system, world } from "@minecraft/server";

const warnings = [];
console.warn = (...a) => {
  warnings.push(a.join(" "));
  if (process.env.ZT_TRACE) process.stderr.write("WARN " + a.join(" ") + "\n");
};

/** a repeatable scatter: 0..1 for a block */
function hash(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** trees on a grid (not right at the spawn) */
function treeAt(x, z) {
  return ((x % 8) + 8) % 8 === 4 && ((z % 8) + 8) % 8 === 4 && Math.hypot(x, z) > 4;
}
const POND = (x, z) => x >= 20 && x <= 26 && z >= -16 && z <= -10;
sim.terrain = (dim, x, y, z) => {
  if (dim !== "minecraft:overworld") return undefined;
  if (y <= -60) return "minecraft:bedrock";
  if (y >= 64) {
    // a tree: a trunk five high and a ball of leaves
    for (const [tx, tz] of [[x, z], [x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1], [x - 1, z - 1], [x + 1, z + 1], [x - 1, z + 1], [x + 1, z - 1]]) {
      if (!treeAt(tx, tz)) continue;
      if (tx === x && tz === z && y <= 68) return "minecraft:oak_log";
      if (y >= 67 && y <= 69) return "minecraft:oak_leaves";
    }
    return undefined;
  }
  if (y === 63) return POND(x, z) ? "minecraft:water" : x >= 18 && x <= 28 && z >= -18 && z <= -8 ? "minecraft:sand" : "minecraft:grass_block";
  if (y >= 60) return POND(x, z) && y >= 61 ? "minecraft:water" : x >= -12 && x <= -8 && z >= 10 && z <= 14 ? "minecraft:gravel" : "minecraft:dirt";
  const h = hash(x, y, z);
  if (y < 0) return h > 0.985 ? "minecraft:deepslate_iron_ore" : h < 0.004 ? "minecraft:deepslate_diamond_ore" : "minecraft:deepslate";
  if (y < 58 && h < 0.03) return "minecraft:coal_ore";
  if (y < 40 && h > 0.975) return "minecraft:iron_ore";
  return undefined;
};
sim.items = true;
sim.mobs = true;
sim.machines = true;
world.timeOfDay = 1000;

await import("./scripts/main.js");
const Bot = await import("./scripts/bot.js");
const B = await import("./scripts/bot_body.js");
const Inv = await import("./scripts/bot_inv.js");
const G = await import("./scripts/bot_gather.js");
const ow = world.getDimension("overworld");
let failures = 0;
function check(cond, msg) {
  if (cond) console.log("  ok   " + msg);
  else {
    failures++;
    console.log("  FAIL " + msg);
  }
}

// animals about
for (const [type, x, z] of [["cow", 10, 6], ["cow", 12, 9], ["pig", -6, 10], ["sheep", 6, -10], ["sheep", 8, -12], ["sheep", -10, -6],
  ["cow", -14, 4], ["pig", 14, -4], ["chicken", 3, 12]]) {
  ow.spawnEntity("minecraft:" + type, { x: x + 0.5, y: 64, z: z + 0.5 });
}
const egg = ow.spawnEntity("zt:player", { x: 0.5, y: 64, z: 0.5 });
runTicks(2);
const bot = Bot.botOf(egg);
bot.persona.brave = 0.9;
bot.style = "chill";

/** Run until a test passes (or time's up), printing what it's doing as it changes. */
function until(test, ticks, label) {
  const t0 = system.currentTick;
  let last = "";
  runTicks(ticks, (t) => {
    // a day passes at the game's pace: keep it day so it gets on (nights are tested elsewhere)
    world.timeOfDay = 1000;
    if (bot.dead) return false;
    const now = `${bot.progress.stage} | ${bot.doing}`;
    if (now !== last && process.env.ZT_TRACE) process.stderr.write(`${t} ${now} @ ${B.feet(bot).x},${B.feet(bot).y},${B.feet(bot).z}\n`);
    if (process.env.ZT_TRACE === "2" && t % 400 === 0) {
      process.stderr.write(`  .. ${t} task ${bot.task?.name} mined ${bot.stats.mined} @ ${B.feet(bot).x},${B.feet(bot).y},${B.feet(bot).z} hp ${B.health(bot)} hunger ${bot.hunger} free ${Inv.freeSlots(bot)}\n`);
    }
    last = now;
    return test();
  });
  const took = system.currentTick - t0;
  console.log(`    (${label}: ${took} ticks, ${(took / 1200).toFixed(1)} minutes)`);
  return test();
}
const has = (id, n = 1) => Inv.count(bot, id) >= n;
if (process.env.ZT_TRACE) {
  world.afterEvents.entityDie.subscribe((ev) => {
    if (ev.deadEntity.typeId === "zt:player") process.stderr.write(`DIED ${system.currentTick} ${ev.damageSource.cause} by ${ev.damageSource.damagingEntity?.typeId} at ${JSON.stringify(B.feet(bot))}\n`);
  });
  world.afterEvents.entityHurt.subscribe((ev) => {
    if (ev.hurtEntity.typeId === "zt:player") process.stderr.write(`HURT ${system.currentTick} ${ev.damage} ${ev.damageSource.cause} by ${ev.damageSource.damagingEntity?.typeId} hp ${B.health(bot)} task ${bot.task?.name}\n`);
  });
}

console.log("the first minutes");
check(until(() => has("log") || has("planks"), 2400, "wood"), "punches a tree for wood");
check(until(() => G.pickTier(bot) >= 1, 2400, "wooden pickaxe"), "a crafting table and a wooden pickaxe");
check(log.sounds.includes("dig.wood") && bot.stats.crafted > 2, "chopping and crafting as it goes");
check(until(() => G.pickTier(bot) >= 2, 4800, "stone pickaxe"), "stone, and a stone pickaxe");
check(until(() => bot.progress.done.includes("sword"), 4800, "sword"), "a stone sword");

console.log("food and a furnace");
const P = await import("./scripts/bot_progress.js");
check(until(() => P.foodCount(bot) >= 5, 12000, "food"), "hunts animals and cooks the meat in a furnace");
check(Inv.count(bot, (id) => /cooked_/.test(id)) > 0 || bot.stats.ate > 0, "it has cooked meat");
check(log.sounds.includes("random.chestclosed") || log.sounds.some((s) => /furnace|chest/.test(s)), "used a furnace");
check(until(() => has("minecraft:torch", 8), 12000, "torches"), "mines coal for torches");

console.log("a bed and a house");
check(until(() => !!bot.home, 30000, "house"), "builds a house");
if (bot.home) {
  const h = bot.home;
  check(/bed/.test(blockId(ow, h.bed.x, h.bed.y, h.bed.z)), "with a bed in it");
  check(blockId(ow, h.chests[0].x, h.chests[0].y, h.chests[0].z) === "minecraft:chest", "and a chest");
  check(/door/.test(blockId(ow, h.door.x, h.door.y, h.door.z)), "and a door");
  let walls = 0;
  for (let x = 0; x <= 4; x++) for (let z = 0; z <= 4; z++) for (let y = 0; y <= 3; y++) {
    const id = blockId(ow, h.corner.x + x, h.corner.y + y, h.corner.z + z);
    if (/planks|cobblestone/.test(id)) walls++;
  }
  check(walls >= 60, `walls and a roof (${walls} blocks)`);
  check(bot.spawn && /bed/.test(blockId(ow, bot.spawn.pos.x, bot.spawn.pos.y, bot.spawn.pos.z)), "its bed is where it will respawn");
}

console.log("iron");
check(until(() => G.pickTier(bot) >= 3, 48000, "iron pickaxe"), "digs down for iron, smelts it, makes an iron pickaxe");

console.log("");
console.log(`    stats: ${JSON.stringify(bot.stats)}; level ${bot.level}; carrying ${Inv.summary(bot, 14)}`);
check(warnings.length === 0, "no script errors" + (warnings.length ? ": " + warnings.slice(0, 3).join(" | ") : ""));
console.log(failures === 0 ? "ALL GOOD" : `${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
