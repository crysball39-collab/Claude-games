// A Player with a stone sword meets the mobs of a night out in a world like the game's (realworld.mjs,
// slopes, trees and all; the harsh jump physics): husks (zombies that don't burn by day, so the
// fight is the fight) one and two at a time, and creepers. It should kill a husk taking a hit
// or two, two of them without being worn down, and a creeper without being blown up: a hit,
// back off out of its range, and again.
//   node tools/sim/run.mjs botfight          ZT_WORLD=<seed> ZT_TRACE=1
import { ItemStack, runTicks, sim, system, world } from "@minecraft/server";

const warnings = [];
console.warn = (...a) => {
  warnings.push(a.join(" "));
  if (process.env.ZT_TRACE) process.stderr.write("WARN " + a.join(" ") + "\n");
};

const { realWorld } = await import("./realworld.mjs");
const W0 = realWorld(Number(process.env.ZT_WORLD ?? 42), { biome: "mixed" });
sim.terrain = W0.terrain;
sim.items = true;
sim.mobs = true;
sim.groundVyHidden = !process.env.ZT_SOFT;
world.timeOfDay = 1000;

await import("./scripts/main.js");
const Bot = await import("./scripts/bot.js");
const B = await import("./scripts/bot_body.js");
const Inv = await import("./scripts/bot_inv.js");
const ow = world.getDimension("overworld");
let failures = 0;
function check(cond, msg) {
  if (cond) console.log("  ok   " + msg);
  else {
    failures++;
    console.log("  FAIL " + msg);
  }
}

const sp = W0.spawn;
const egg = ow.spawnEntity("zt:player", { x: sp.x + 0.5, y: sp.y, z: sp.z + 0.5 });
runTicks(2);
const bot = Bot.botOf(egg);
bot.persona.brave = 0.9;
bot.style = "chill";
// fed, armed, and enough wood about it that it isn't off far
Inv.add(bot, new ItemStack("minecraft:stone_sword", 1));
Inv.add(bot, new ItemStack("minecraft:cooked_beef", 16));
runTicks(200, (t) => {
  if (process.env.ZT_TRACE === "2" && t % 5 === 0) {
    const l = bot.entity.location;
    const v = bot.entity.getVelocity();
    process.stderr.write(`   ${t} at ${l.x.toFixed(2)},${l.y.toFixed(2)},${l.z.toFixed(2)} v ${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)} ground ${bot.onGround} water ${bot.inWater} task ${bot.task?.name} doing ${bot.doing} now ${bot.now} move ${bot.move ? JSON.stringify(bot.move.to) : "-"} step ${JSON.stringify(bot.stepNow)}\n`);
  }
  return false;
});

let hurt = 0;
world.afterEvents.entityHurt.subscribe((ev) => {
  if (ev.hurtEntity.typeId !== "zt:player") return;
  hurt += ev.damage;
  if (process.env.ZT_TRACE) process.stderr.write(`HURT ${system.currentTick} ${ev.damage.toFixed(1)} ${ev.damageSource.cause} by ${ev.damageSource.damagingEntity?.typeId} hp ${B.health(bot).toFixed(1)} task ${bot.task?.name}\n`);
});

/** A place for a mob about `r` blocks from the Player, on the ground. */
function around(r, k) {
  const l = bot.entity.location;
  for (let tries = 0; tries < 24; tries++) {
    const a = k * 2.1 + tries * 0.7;
    const x = Math.floor(l.x + Math.cos(a) * r);
    const z = Math.floor(l.z + Math.sin(a) * r);
    const y = W0.surface(x, z);
    if (y < 63 || Math.abs(y + 1 - l.y) > 3) continue;
    return { x: x + 0.5, y: y + 1, z: z + 0.5 };
  }
  return { x: l.x + r, y: l.y, z: l.z };
}

/** One encounter: these mobs come at it; how much it's hurt, and how it ends. */
function encounter(label, types) {
  // (out in the open: down a hole it's digging, nothing gets to it)
  const f = B.feet(bot);
  const top = W0.surface(f.x, f.z);
  if (f.y < top) bot.entity.teleport({ x: f.x + 0.5, y: top + 1, z: f.z + 0.5 });
  runTicks(5);
  B.heal(bot, 20);
  bot.hunger = 20;
  if (!Inv.has(bot, "minecraft:stone_sword")) Inv.add(bot, new ItemStack("minecraft:stone_sword", 1));
  const mobs = types.map((t, k) => ow.spawnEntity(t, around(9 + k, system.currentTick % 7 + k)));
  if (process.env.ZT_TRACE) process.stderr.write(`ENCOUNTER ${label} at ${system.currentTick}\n`);
  hurt = 0;
  const t0 = system.currentTick;
  let blasts = 0;
  const watch = world.afterEvents.entityHurt.subscribe((ev) => {
    if (ev.hurtEntity.typeId === "zt:player" && ev.damageSource.cause === "entityExplosion") blasts++;
  });
  runTicks(900, (t) => {
    if (process.env.ZT_TRACE === "2" && t % 5 === 0) {
      const l = bot.entity.location;
      const v = bot.entity.getVelocity();
      process.stderr.write(`   ${t} at ${l.x.toFixed(2)},${l.y.toFixed(2)},${l.z.toFixed(2)} v ${v.y.toFixed(2)} ground ${bot.onGround} hp ${B.health(bot).toFixed(0)} task ${bot.task?.name} use ${bot.use} now ${bot.now} move ${bot.move ? `${bot.move.to.x.toFixed(1)},${bot.move.to.y.toFixed(1)},${bot.move.to.z.toFixed(1)}` : "-"} step ${JSON.stringify(bot.stepNow)} | ` +
        mobs.map((m) => m.valid ? `${m.typeId.slice(10)} d ${B.dist(m.location, l).toFixed(1)} dy ${(m.location.y - l.y).toFixed(1)} hp ${m.getComponent("minecraft:health")?.currentValue} fuse ${m.fuse ?? 0}` : "dead").join(" | ") + "\n");
    }
    return bot.dead || mobs.every((m) => !m.valid);
  });
  const died = bot.dead;
  world.afterEvents.entityHurt.unsubscribe(watch);
  // (one that never got to it, stuck behind a tree or in a hole, doesn't count)
  const left = mobs.filter((m) => m.valid && B.dist(m.location, bot.entity.location) < 8);
  for (const m of mobs) if (m.valid) m.remove();
  const took = system.currentTick - t0;
  console.log(`    (${label}: ${hurt.toFixed(0)} damage taken, ${took} ticks${left.length ? `, ${left.length} left` : ""}${blasts ? `, ${blasts} blast` : ""}${died ? ", DIED" : ""})`);
  if (died) runTicks(120, () => !bot.dead);
  return { hurt, took, left: left.length, blasts, dead: died };
}

const results = { one: [], two: [], creeper: [], mixed: [] };
for (let round = 0; round < 3; round++) {
  console.log(`round ${round + 1}`);
  results.one.push(encounter("a husk", ["minecraft:husk"]));
  runTicks(200);
  results.creeper.push(encounter("a creeper", ["minecraft:creeper"]));
  runTicks(200);
  results.two.push(encounter("two husks", ["minecraft:husk", "minecraft:husk"]));
  runTicks(200);
  results.mixed.push(encounter("a husk and a creeper", ["minecraft:husk", "minecraft:creeper"]));
  runTicks(200);
}
const avg = (a, f) => a.reduce((s, r) => s + f(r), 0) / a.length;
console.log("");
check(results.one.every((r) => !r.left && !r.dead) && avg(results.one, (r) => r.hurt) <= 7, `kills a husk taking a hit or two (on average ${avg(results.one, (r) => r.hurt).toFixed(1)} damage)`);
check(results.two.every((r) => !r.left && !r.dead) && avg(results.two, (r) => r.hurt) <= 14, `kills two husks (on average ${avg(results.two, (r) => r.hurt).toFixed(1)} damage)`);
check(results.creeper.every((r) => !r.dead) && results.creeper.filter((r) => r.blasts).length <= 1 && avg(results.creeper, (r) => r.hurt) <= 7,
  `a creeper doesn't blow it up (blasts ${results.creeper.filter((r) => r.blasts).length} of 3, on average ${avg(results.creeper, (r) => r.hurt).toFixed(1)} damage)`);
check(results.mixed.every((r) => !r.dead) && avg(results.mixed, (r) => r.hurt) <= 12, `a husk and a creeper together (on average ${avg(results.mixed, (r) => r.hurt).toFixed(1)} damage)`);
check(!Object.values(results).flat().some((r) => r.dead), "never dies");
check(warnings.length === 0, "no script errors" + (warnings.length ? ": " + warnings.slice(0, 3).join(" | ") : ""));
console.log(failures === 0 ? "ALL GOOD" : `${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
