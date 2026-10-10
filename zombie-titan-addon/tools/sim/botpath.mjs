// The Players' pathfinding on its own: walking, steps, drops, swimming, ladders, doors,
// tunnelling, staircases down, bridging and pillaring, and keeping away from lava.
//   node tools/sim/run.mjs botpath
import { blockId, setBlock, world } from "@minecraft/server";

const P = await import("./scripts/bot_path.js");
const D = await import("./scripts/bot_data.js");
const ow = world.getDimension("overworld");
let failures = 0;
function check(cond, msg) {
  if (cond) console.log("  ok   " + msg);
  else {
    failures++;
    console.log("  FAIL " + msg);
  }
}
// tools: a stone pickaxe and shovel (what the miner's searches assume)
const mine = (id) => D.breakTicks(id, D.toolFor(id) === "pickaxe" ? "minecraft:stone_pickaxe" : D.toolFor(id) === "shovel" ? "minecraft:stone_shovel" : D.toolFor(id) === "axe" ? "minecraft:stone_axe" : undefined);
const find = (start, goal, o = {}) => P.runNow(P.search(ow, start, goal, o));
const hows = (path) => [...new Set(path.map((s) => s.how))].join(",");
const last = (path) => path[path.length - 1];
/** fill a box (inclusive) */
function box(x0, y0, z0, x1, y1, z1, id) {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) setBlock(ow, x, y, z, id);
}

console.log("walking");
let r = find({ x: 0, y: 64, z: 0 }, { x: 10, y: 64, z: 5 });
check(r.complete && last(r.path).x === 10 && last(r.path).z === 5, "across flat ground (" + r.path.length + " steps, " + hows(r.path) + ")");

console.log("a step up and a drop");
box(20, 64, -5, 30, 64, 5, "minecraft:stone");
r = find({ x: 15, y: 64, z: 0 }, { x: 25, y: 65, z: 0 });
check(r.complete && r.path.some((s) => s.how === "up"), "jumps up a block (" + hows(r.path) + ")");
r = find({ x: 25, y: 65, z: 0 }, { x: 35, y: 64, z: 0 });
check(r.complete && r.path.some((s) => s.how === "down"), "steps down off it");

console.log("a wall in the way");
box(40, 64, -30, 40, 67, 30, "minecraft:stone");
r = find({ x: 35, y: 64, z: 0 }, { x: 45, y: 64, z: 0 }, { maxNodes: 1500 });
check(!r.complete, "can't get past a long wall with nothing to dig with");
r = find({ x: 35, y: 64, z: 0 }, { x: 45, y: 64, z: 0 }, { mine });
check(r.complete && r.path.some((s) => s.how === "dig" && s.mine?.length === 2), "tunnels through it with a pickaxe (" + hows(r.path) + ")");
box(40, 64, -30, 40, 67, 30, "minecraft:air");

console.log("a door");
box(50, 64, -30, 50, 66, 30, "minecraft:oak_planks");
setBlock(ow, 50, 64, 0, "minecraft:wooden_door", { open_bit: false, upper_block_bit: false });
setBlock(ow, 50, 65, 0, "minecraft:wooden_door", { open_bit: false, upper_block_bit: true });
r = find({ x: 46, y: 64, z: 0 }, { x: 54, y: 64, z: 0 }, { maxNodes: 1500 });
check(r.complete && r.path.some((s) => s.door), "goes through a closed door, opening it");
box(50, 64, -30, 50, 66, 30, "minecraft:air");

console.log("a gap");
box(60, 54, -30, 62, 63, 30, "minecraft:air");
r = find({ x: 58, y: 64, z: 0 }, { x: 64, y: 64, z: 0 }, { maxNodes: 2000 });
check(!r.complete || !r.path.some((s) => s.how === "bridge"), "no blocks: no bridging");
r = find({ x: 58, y: 64, z: 0 }, { x: 64, y: 64, z: 0 }, { blocks: 16 });
const bridges = r.path.filter((s) => s.how === "bridge");
check(r.complete && bridges.length === 3 && bridges.every((s) => s.place[1] === 63), "bridges the 3-block gap (" + bridges.length + " blocks)");

console.log("up onto a tower");
box(70, 64, 0, 70, 67, 0, "minecraft:stone");
r = find({ x: 70, y: 64, z: 2 }, { x: 70, y: 68, z: 0 }, { blocks: 16, maxNodes: 3000 });
check(r.complete && r.path.filter((s) => s.how === "pillar").length >= 3, "pillars up next to it (" + hows(r.path) + ")");

console.log("lava");
box(80, 63, -2, 84, 63, 2, "minecraft:lava");
r = find({ x: 78, y: 64, z: 0 }, { x: 86, y: 64, z: 0 });
check(r.complete && r.path.every((s) => !(s.x >= 80 && s.x <= 84 && Math.abs(s.z) <= 2 && s.how === "walk" && s.y === 63)), "never walks into lava");
check(r.path.every((s) => blockId(ow, s.x, s.y - 1, s.z) !== "minecraft:lava"), "never stands over lava");
const nextTo = r.path.filter((s) => s.x >= 79 && s.x <= 85 && Math.abs(s.z) <= 3).length;
check(nextTo === 0 || r.path.length > 8, "keeps away from its edge (" + r.path.length + " steps)");
setBlock(ow, 92, 64, 0, "minecraft:lava");
r = find({ x: 88, y: 64, z: 0 }, { x: 96, y: 64, z: 0 }, { mine });
check(r.complete, "finds a way past lava in a wall");

console.log("down a staircase");
// (a player digs down in one direction: the goal is ahead of it and below)
r = find({ x: 100, y: 64, z: 0 }, { x: 112, y: 55, z: 0, r: 1 }, { mine, maxNodes: 3000, weight: 5 });
const downs = r.path.filter((s) => s.how === "down" && s.mine?.length);
check(r.complete && downs.length >= 7 && r.path.every((s) => s.how !== "dig"), "digs a staircase, not straight down (" + downs.length + " steps)");

console.log("swimming and ladders");
box(110, 60, -3, 120, 63, 3, "minecraft:water");
r = find({ x: 108, y: 64, z: 0 }, { x: 122, y: 64, z: 0 });
check(r.complete, "crosses a pond (" + hows(r.path) + ")");
box(130, 64, 0, 130, 70, 0, "minecraft:stone");
for (let y = 64; y <= 70; y++) setBlock(ow, 130, y, 1, "minecraft:ladder", { facing_direction: 3 });
r = find({ x: 130, y: 64, z: 1 }, { x: 130, y: 71, z: 0 });
check(r.complete && r.path.some((s) => s.how === "climb"), "climbs a ladder (" + hows(r.path) + ")");

console.log("");
console.log(failures === 0 ? "ALL GOOD" : `${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
