// A Player from nothing in a world like the game's (realworld.mjs): hills with one-block ledges,
// spruce taiga with low leaves, ferns and sweet berry bushes, a river, caves, and ores only
// where the game puts them (no stone at the surface: it has to dig for it). The jumps' physics
// are the harsh kind (a body on the ground reads no fall speed, so a jump worked out from it
// comes out short) unless ZT_SOFT is set. It should get wood and leave its crafting table
// standing, make a wooden and a stone pickaxe (digging down for stone), a sword, hunt animals
// even when they're right beside it, dig down or into a cave for coal, build a house with a bed,
// and dig down for iron, without jumping in place at steps.
//   node tools/sim/run.mjs botreal          ZT_WORLD=<seed> ZT_BIOME=taiga|forest|mixed
import { blockId, log, runTicks, sim, system, world } from "@minecraft/server";

const warnings = [];
console.warn = (...a) => {
  warnings.push(a.join(" "));
  if (process.env.ZT_TRACE) process.stderr.write("WARN " + a.join(" ") + "\n");
};

const { realWorld } = await import("./realworld.mjs");
const W0 = realWorld(Number(process.env.ZT_WORLD ?? 7), { biome: /** @type {any} */ (process.env.ZT_BIOME ?? "taiga") });
sim.terrain = W0.terrain;
sim.items = true;
sim.mobs = true;
sim.machines = true;
sim.groundVyHidden = !process.env.ZT_SOFT;
world.timeOfDay = 1000;

await import("./scripts/main.js");
const Bot = await import("./scripts/bot.js");
const B = await import("./scripts/bot_body.js");
const Inv = await import("./scripts/bot_inv.js");
const G = await import("./scripts/bot_gather.js");
const P = await import("./scripts/bot_progress.js");
const ow = world.getDimension("overworld");
let failures = 0;
function check(cond, msg) {
  if (cond) console.log("  ok   " + msg);
  else {
    failures++;
    console.log("  FAIL " + msg);
  }
}

// animals about, in little groups on dry ground all over (as a new world has them)
const sp = W0.spawn;
let animals = 0;
for (let g = 0; g < 48; g++) {
  const type = ["sheep", "cow", "pig", "chicken"][g % 4];
  const a = g * 2.399;
  const r = 12 + Math.sqrt(g) * 26;
  const cx = Math.round(sp.x + Math.cos(a) * r);
  const cz = Math.round(sp.z + Math.sin(a) * r);
  for (let k = 0; k < 3; k++) {
    const x = cx + k;
    const z = cz + (k % 2);
    const y = W0.surface(x, z);
    if (y < 63) continue;
    ow.spawnEntity("minecraft:" + type, { x: x + 0.5, y: y + 1, z: z + 0.5 });
    animals++;
  }
}
const egg = ow.spawnEntity("zt:player", { x: sp.x + 0.5, y: sp.y, z: sp.z + 0.5 });
runTicks(2);
const bot = Bot.botOf(egg);
bot.persona.brave = 0.9;
bot.style = "chill";
console.log(`    (world ${process.env.ZT_WORLD ?? 7}, ${process.env.ZT_BIOME ?? "taiga"}, start ${sp.x} ${sp.y} ${sp.z}, ${animals} animals, ${sim.groundVyHidden ? "harsh" : "soft"} jumps${process.env.ZT_NIGHT ? ", days and nights" : ""})`);

// how it moves: jumps that got it nowhere, hops up steps it couldn't jump
let jumps = 0;
let lastJumpRec;
// the longest it stayed on one block (sampled every 5 seconds)
let spot = "";
let onSpot = 0;
let worst = { n: 0, at: "" };
/** Run until a test passes (or time's up), tracing what it does. */
function until(test, ticks, label) {
  const t0 = system.currentTick;
  let last = "";
  runTicks(ticks, (t) => {
    // ZT_NIGHT: days and nights pass (and the night's mobs come); else it stays morning
    world.timeOfDay = process.env.ZT_NIGHT ? (world.timeOfDay + 1) % 24000 : 1000;
    if (bot.dead) return false;
    if (bot.jumpRec && bot.jumpRec !== lastJumpRec) {
      jumps++;
      lastJumpRec = bot.jumpRec;
    }
    // staying on one spot: how long (a night in bed or holed up waiting for day doesn't count)
    if (t % 100 === 0) {
      const resting = /^(sleep|shelter)$/.test(bot.task?.name ?? "");
      const k = resting ? "resting" : `${B.feet(bot).x},${B.feet(bot).y},${B.feet(bot).z}`;
      onSpot = k === spot ? onSpot + 1 : 1;
      spot = k;
      if (onSpot > worst.n && !resting) worst = { n: onSpot, at: k + " " + bot.doing };
    }
    const now = `${bot.progress.stage} | ${bot.doing}`;
    if (now !== last && process.env.ZT_TRACE) process.stderr.write(`${t} ${now} @ ${B.feet(bot).x},${B.feet(bot).y},${B.feet(bot).z}\n`);
    if (process.env.ZT_TRACE === "2" && t % 200 === 0) {
      process.stderr.write(`  .. ${t} task ${bot.task?.name} @ ${B.feet(bot).x},${B.feet(bot).y},${B.feet(bot).z} hp ${B.health(bot).toFixed(1)} hunger ${bot.hunger} jump ${B.JUMP.power.toFixed(2)} jumps ${jumps} hops ${bot.hops ?? 0} carrying ${Inv.summary(bot, 8)}\n`);
    }
    // a close look at a stretch of time: ZT_FROM / ZT_TO
    if (process.env.ZT_FROM && t >= Number(process.env.ZT_FROM) && t <= Number(process.env.ZT_TO ?? 1e9) && t % 10 === 0) {
      const v = bot.entity.getVelocity();
      const l = bot.entity.location;
      process.stderr.write(`   ${t} at ${l.x.toFixed(2)},${l.y.toFixed(2)},${l.z.toFixed(2)} v ${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)} ground ${bot.onGround} water ${bot.inWater} move ${bot.move ? `${bot.move.to.x.toFixed(1)},${bot.move.to.y.toFixed(1)},${bot.move.to.z.toFixed(1)} ${bot.move.speed}` : "-"} use ${bot.use} doing ${bot.doing} now ${bot.now ?? ""} step ${JSON.stringify(bot.stepNow)} under ${[1, 2, 3].map((k) => blockId(ow, Math.floor(l.x), Math.floor(l.y) - k, Math.floor(l.z)).replace("minecraft:", "")).join("/")}\n`);
    }
    // ZT_DUMP=<tick>: the blocks round it then, layer by layer
    if (process.env.ZT_DUMP && t === Number(process.env.ZT_DUMP)) {
      const f = B.feet(bot);
      for (let y = f.y + 4; y >= f.y - 3; y--) {
        process.stderr.write(`   y ${y}${y === f.y ? " (feet)" : ""}\n`);
        for (let z = f.z - 3; z <= f.z + 3; z++) {
          const row = [];
          for (let x = f.x - 3; x <= f.x + 3; x++) {
            const id = blockId(ow, x, y, z).replace("minecraft:", "");
            row.push((x === f.x && z === f.z ? "*" : "") + (id === "air" ? "." : id.slice(0, 10)));
          }
          process.stderr.write("     " + row.map((s) => s.padEnd(11)).join("") + "\n");
        }
      }
    }
    if (process.env.ZT_STOP && t >= Number(process.env.ZT_STOP)) process.exit(2);
    last = now;
    return test();
  });
  const took = system.currentTick - t0;
  console.log(`    (${label}: ${took} ticks, ${(took / 1200).toFixed(1)} minutes)`);
  return test();
}
const has = (id, n = 1) => Inv.count(bot, id) >= n;
if (process.env.ZT_TRACE) {
  world.afterEvents.entityHurt.subscribe((ev) => {
    if (ev.hurtEntity.typeId === "zt:player") process.stderr.write(`HURT ${system.currentTick} ${ev.damage.toFixed(1)} ${ev.damageSource.cause} by ${ev.damageSource.damagingEntity?.typeId} hp ${B.health(bot).toFixed(1)} task ${bot.task?.name} @ ${JSON.stringify(B.feet(bot))}\n`);
  });
  world.afterEvents.entityDie.subscribe((ev) => {
    if (ev.deadEntity.typeId === "zt:player") process.stderr.write(`DIED ${system.currentTick} ${ev.damageSource.cause} by ${ev.damageSource.damagingEntity?.typeId} at ${JSON.stringify(B.feet(bot))}\n`);
  });
}
console.log("the first minutes");
check(until(() => has("log") || has("planks"), 2400, "wood"), "chops a tree for wood");
check(until(() => G.pickTier(bot) >= 1, 3600, "wooden pickaxe"), "makes a crafting table and a wooden pickaxe");
const tables = [];
for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) for (let y = -6; y <= 6; y++) {
  const p = { x: B.feet(bot).x + x, y: B.feet(bot).y + y, z: B.feet(bot).z + z };
  if (blockId(ow, p.x, p.y, p.z) === "minecraft:crafting_table") tables.push(p);
}
check(tables.length >= 1, `its crafting table is still standing (${tables.length})`);
check(until(() => G.pickTier(bot) >= 2, 7200, "stone pickaxe"), "digs down to stone and makes a stone pickaxe");
check(until(() => bot.progress.done.includes("sword"), 6000, "sword"), "a stone sword");

console.log("food");
check(until(() => P.foodCount(bot) >= 5, 14400, "food"), "hunts animals and cooks the meat");

console.log("coal and torches");
check(until(() => has("minecraft:torch", 8), 14400, "torches"), "finds coal (in a cave or by digging down) for torches");

console.log("a bed and a house");
check(until(() => !!bot.home, 36000, "house"), "builds a house with a bed");

console.log("iron");
check(until(() => G.pickTier(bot) >= 3, 48000, "iron pickaxe"), "digs down for iron, smelts it, makes an iron pickaxe");

console.log("");
console.log(`    stats: ${JSON.stringify(bot.stats)}; jump push ${B.JUMP.power.toFixed(2)}, ${jumps} jumps, ${bot.hops ?? 0} hops; longest on one spot ${worst.n * 5} s (${worst.at})`);
console.log(`    carrying ${Inv.summary(bot, 16)}`);
check(worst.n < 24, "never stuck on one spot for two minutes");
check(warnings.length === 0, "no script errors" + (warnings.length ? ": " + warnings.slice(0, 3).join(" | ") : ""));
console.log(failures === 0 ? "ALL GOOD" : `${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
