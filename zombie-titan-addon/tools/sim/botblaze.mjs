// A Player kitted out for the Nether (diamond sword, bow and arrows, shield, iron armour, food,
// golden apples) at a fortress's blaze spawner, getting blaze rods as the End journey has it do:
// the blazes come two at a time, throw their fireballs in bursts and set it alight. It should
// come away with its rods without dying (shield up to what it sees coming, out of their sight
// to eat, back in when it's healed).
//   node tools/sim/run.mjs botblaze          ZT_SEED=<n> ZT_TRACE=1
import { ItemStack, log, runTicks, sim, system, world } from "@minecraft/server";

const warnings = [];
console.warn = (...a) => {
  warnings.push(a.join(" "));
  if (process.env.ZT_TRACE) process.stderr.write("WARN " + a.join(" ") + "\n");
};

// the Nether: a floor of netherrack, a fortress with a blaze spawner on a fenced platform (as
// the End journey's), and the portal it came in by
function nether(x, y, z) {
  if (y >= 127 || y <= 0) return "minecraft:bedrock";
  if (x >= 20 && x <= 60 && z >= -8 && z <= 8) {
    if (y === 40) return "minecraft:nether_brick";
    if (y === 41 && (z === -8 || z === 8) && x > 21) return "minecraft:nether_brick_fence";
    if (y === 41 && x === 40 && z === 0) return "minecraft:mob_spawner";
    if (y > 40) return "minecraft:air";
  }
  if (y < 40) return "minecraft:netherrack";
  return "minecraft:air";
}
sim.terrain = (dim, x, y, z) => (dim === "minecraft:nether" ? nether(x, y, z) : y === 63 ? "minecraft:grass_block" : y < 63 && y > 59 ? "minecraft:dirt" : undefined);
sim.items = true;
sim.mobs = true;
sim.machines = true;
world.timeOfDay = 1000;

await import("./scripts/main.js");
const Bot = await import("./scripts/bot.js");
const B = await import("./scripts/bot_body.js");
const Inv = await import("./scripts/bot_inv.js");
const P = await import("./scripts/bot_progress.js");
const Sense = await import("./scripts/bot_senses.js");
const ne = world.getDimension("nether");
let failures = 0;
function check(cond, msg) {
  if (cond) console.log("  ok   " + msg);
  else {
    failures++;
    console.log("  FAIL " + msg);
  }
}

const egg = ne.spawnEntity("zt:player", { x: 0.5, y: 40, z: 0.5 });
runTicks(2);
const bot = Bot.botOf(egg);
bot.persona.brave = 0.9;
bot.home = { dim: "minecraft:overworld", pos: { x: 0, y: 64, z: 0 }, chests: [], stash: {}, stations: {} };
bot.known.netherPortal = { dim: "minecraft:nether", pos: { x: 0, y: 40, z: 0 } };
const kit = [["diamond_pickaxe", 1], ["diamond_sword", 1], ["bow", 1], ["arrow", 64], ["arrow", 64], ["shield", 1], ["iron_helmet", 1],
  ["iron_chestplate", 1], ["iron_leggings", 1], ["iron_boots", 1], ["golden_helmet", 1], ["cooked_beef", 64], ["cobblestone", 64], ["golden_apple", 4]];
for (const [id, n] of kit) Inv.add(bot, new ItemStack("minecraft:" + id, n));
Inv.equipArmor(bot);

let hurt = 0;
let deaths = 0;
world.afterEvents.entityHurt.subscribe((ev) => {
  if (ev.hurtEntity.typeId !== "zt:player") return;
  hurt += ev.damage;
  if (process.env.ZT_TRACE) process.stderr.write(`HURT ${system.currentTick} ${ev.damage.toFixed(1)} ${ev.damageSource.cause} by ${ev.damageSource.damagingEntity?.typeId} hp ${B.health(bot).toFixed(1)} task ${bot.task?.name} use ${bot.use}\n`);
});
const killed = {};
world.afterEvents.entityDie.subscribe((ev) => {
  if (ev.deadEntity.typeId === "zt:player") deaths++;
  else if (ev.damageSource.damagingEntity?.typeId === "zt:player") killed[ev.deadEntity.typeId] = (killed[ev.deadEntity.typeId] ?? 0) + 1;
});

// its job, as the End journey gives it: rods for twelve eyes (the other steps of its game are
// put off), and the brain looks after the fighting, running, eating
for (const s of P.STEPS) if (s.id !== "blaze") bot.stepCool[s.id] = 1e9;
const t0 = system.currentTick;
runTicks(12000, (t) => {
  if (process.env.ZT_TRACE === "2" && t % 20 === 0) {
    const l = bot.entity.location;
    const blazes = ne.getEntities({ type: "minecraft:blaze" }).map((b) => `${b.location.x.toFixed(0)},${b.location.y.toFixed(0)},${b.location.z.toFixed(0)} hp ${b.getComponent("minecraft:health")?.currentValue}`);
    process.stderr.write(`   ${t} at ${l.x.toFixed(1)},${l.y.toFixed(1)},${l.z.toFixed(1)} hp ${B.health(bot).toFixed(1)} task ${bot.task?.name} use ${bot.use} rods ${Inv.count(bot, "minecraft:blaze_rod")} arrows ${Inv.count(bot, "minecraft:arrow")} blazes ${blazes.join(" | ")}\n`);
  }
  if (process.env.ZT_FROM && t >= Number(process.env.ZT_FROM) && t <= Number(process.env.ZT_TO ?? 1e9)) {
    const l = bot.entity.location;
    const balls = ne.getEntities({ type: "minecraft:small_fireball" }).map((f) => {
      const v = f.getVelocity();
      return `${B.dist(f.location, l).toFixed(1)}@${Math.hypot(v.x, v.y, v.z).toFixed(2)}`;
    });
    process.stderr.write(`   ${t} at ${l.x.toFixed(1)},${l.y.toFixed(1)},${l.z.toFixed(1)} hp ${B.health(bot).toFixed(1)} task ${bot.task?.name} use ${bot.use} doing ${bot.doing} now ${bot.now} fireballs ${balls.join(" ")}\n`);
  }
  if (process.env.ZT_SEEN && t % 600 === 0) {
    const now = system.currentTick;
    for (const b of ne.getEntities({ type: "minecraft:blaze" })) {
      const eyeP = B.eye(bot);
      const head = b.getHeadLocation();
      const d = B.dist(eyeP, head);
      const dir = B.viewDir(bot);
      const to = { x: (head.x - eyeP.x) / d, y: (head.y - eyeP.y) / d, z: (head.z - eyeP.z) / d };
      const angle = Math.acos(Math.max(-1, Math.min(1, dir.x * to.x + dir.y * to.y + dir.z * to.z))) * 180 / Math.PI;
      const hit = ne.getBlockFromRay(eyeP, to, { maxDistance: d - 0.6, includeLiquidBlocks: false, includePassableBlocks: false });
      process.stderr.write(`   HIT ${hit ? `${hit.block.typeId} ${JSON.stringify(hit.block.location)}` : "-"}\n`);
      process.stderr.write(`   BLAZE ${t} d ${d.toFixed(1)} angle ${angle.toFixed(0)} sight ${Sense.clearSight(ne, eyeP, head)} range ${Sense.sightRange(bot, system.currentTick)} head ${JSON.stringify(head)} eye ${JSON.stringify(eyeP)} near ${ne.getEntities({ location: eyeP, maxDistance: 48 }).length}\n`);
    }
    process.stderr.write(`   SEEN ${t} ${[...bot.seen.values()].map((x) => `${x.typeId.slice(10)} ${now - x.at}`).join(", ")} | IGNORE ${[...(bot.ignore ?? new Map()).entries()].filter(([, u]) => u > now).map(([id, u]) => `${id}:${u - now}`).join(",")} | look ${bot.headYaw?.toFixed(0)},${bot.headPitch?.toFixed(0)} cool ${JSON.stringify(bot.driveCool)}\n`);
  }
  if (process.env.ZT_WATCH) {
    const [wx, wy, wz] = process.env.ZT_WATCH.split(",").map(Number);
    const id = ne.getBlock({ x: wx, y: wy, z: wz })?.typeId;
    if (id !== globalThis.zwLast) process.stderr.write(`   WATCH ${t} ${id} task ${bot.task?.name} doing ${bot.doing} now ${bot.now} step ${JSON.stringify(bot.stepNow)} at ${JSON.stringify(B.feet(bot))}\n`);
    globalThis.zwLast = id;
  }
  // (it died, or has its rods: that's the trip over)
  return bot.dead || Inv.count(bot, "minecraft:blaze_rod") >= 6;
});
const took = system.currentTick - t0;
const rods = Inv.count(bot, "minecraft:blaze_rod");
const dropped = log.items.filter(([id]) => id === "minecraft:blaze_rod").reduce((n, [, k]) => n + (k ?? 1), 0);
const lying = ne.getEntities({ type: "minecraft:item" }).filter((i) => i.getComponent("minecraft:item")?.itemStack?.typeId === "minecraft:blaze_rod")
  .map((i) => `${i.location.x.toFixed(1)},${i.location.y.toFixed(1)},${i.location.z.toFixed(1)}`);
console.log(`    (${took} ticks, ${(took / 1200).toFixed(1)} minutes: ${rods} rods (${dropped} dropped, lying at ${lying.join(" ") || "-"}), ${hurt.toFixed(0)} damage taken, ${deaths} deaths, ${Inv.count(bot, "minecraft:arrow")} arrows left, ${bot.stats.kills} kills: ${JSON.stringify(killed).replace(/minecraft:/g, "")})`);
check(deaths === 0, "it doesn't die");
check(rods >= 6, `it gets the six blaze rods twelve eyes take (${rods})`);
check(warnings.length === 0, "no script errors" + (warnings.length ? ": " + warnings.slice(0, 3).join(" | ") : ""));
console.log(failures === 0 ? "ALL GOOD" : `${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
