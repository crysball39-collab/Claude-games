// The Glowite update: Glowite ore's drops by pickaxe (Fortune, Silk Touch), raw glowite blowing
// up a plain furnace, Glowite armor's toughness and knockback resistance; the Glowshroom Biome's
// blocks (spore grass, the spore crop and bone meal, hoes, the slab, door, trapdoor, fence gate,
// button and pressure plate, giant spore trees); a whole cavern grown round its heart, with its
// mobs; the Shroom Zombie's four-way bursts; Shroom Berries and Shroomy.
//   node tools/sim/run.mjs glowite          ZT_TRACE=1  ZT_CAVERN_OUT=<file> (the grown cavern, block by block)
import { ItemStack, Player, blockId, blockPerm, log, runTicks, setBlock, setRedstone, sim, system, unloadedChunks, world } from "@minecraft/server";

const warnings = [];
console.warn = (...a) => {
  warnings.push(a.join(" "));
  if (process.env.ZT_TRACE) process.stderr.write("WARN " + a.join(" ") + "\n");
};

await import("./scripts/main.js");
const Glowite = await import("./scripts/glowite.js");
const Glow = await import("./scripts/glowshroom.js");
const Shroom = await import("./scripts/shroom.js");
const ow = world.getDimension("overworld");
let failures = 0;
function check(cond, msg) {
  if (cond) console.log("  ok   " + msg);
  else {
    failures++;
    console.log("  FAIL " + msg);
  }
}
system.afterEvents.scriptEventReceive.fire({ id: "zt:natural_spawns", message: "off", sourceEntity: undefined });
runTicks(1);

const player = new Player(ow, { x: 0, y: 64, z: 0 });
ow.entities.push(player);
const slots = player.components["minecraft:equippable"].slots;
const hp = player.getComponent("minecraft:health");
const count = (id) => log.items.filter(([i]) => i === id).reduce((n, [, k]) => n + k, 0);
const state = (x, y, z, k) => blockPerm(x, y, z, ow)?.getState(k);
const block = (x, y, z) => ow.getBlock({ x, y, z });
const comp = (name) => sim.blockComponents.get(name);
const enchanted = (id, ench, level) => {
  const it = new ItemStack(id);
  it.getComponent("enchantable").addEnchantment({ type: ench, level });
  return it;
};

console.log("custom components");
for (const name of ["zt:spore_grass", "zt:spore_crop", "zt:slab", "zt:door", "zt:trapdoor", "zt:fence_gate", "zt:button", "zt:pressure_plate", "zt:glowshroom_heart"]) {
  check(sim.blockComponents.has(name), `${name} is registered at startup`);
}

console.log("glowite ore");
const breakOre = (tool, at = { x: 3, y: 40, z: 3 }) => {
  const before = count(Glowite.PARTICLES) + count(Glowite.ORE);
  world.afterEvents.playerBreakBlock.fire({ player, block: { location: at }, brokenBlockPermutation: { type: { id: Glowite.ORE } },
    itemStackBeforeBreak: tool, dimension: ow });
  return count(Glowite.PARTICLES) + count(Glowite.ORE) - before;
};
let got = 0;
for (let i = 0; i < 20; i++) got += breakOre(new ItemStack("minecraft:diamond_pickaxe"));
check(got >= 20 && got <= 40, `a diamond pickaxe gets one or two Glowing Particles (${got} from 20)`);
check(breakOre(new ItemStack("minecraft:iron_pickaxe")) === 0, "an iron pickaxe gets nothing");
check(breakOre(undefined) === 0, "nor a bare hand");
check(breakOre(new ItemStack("zt:glowite_pickaxe")) >= 1, "a Glowite pickaxe gets particles");
check(breakOre(new ItemStack("minecraft:netherite_pickaxe")) >= 1, "so does netherite");
let fortune = 0;
for (let i = 0; i < 40; i++) fortune += breakOre(enchanted("minecraft:diamond_pickaxe", "fortune", 3));
check(fortune / 40 > 2.4, `Fortune III gets more (${(fortune / 40).toFixed(2)} a block)`);
const oresBefore = count(Glowite.ORE);
breakOre(enchanted("minecraft:diamond_pickaxe", "silk_touch", 1));
runTicks(3);
check(count(Glowite.ORE) === oresBefore + 1, "Silk Touch keeps the ore itself");
// (if the game drops a silk-touched block itself, there's no second one)
sim.items = true;
const ore = ow.spawnItem(new ItemStack(Glowite.ORE), { x: 5.5, y: 40.5, z: 5.5 });
breakOre(enchanted("minecraft:diamond_pickaxe", "silk_touch", 1), { x: 5, y: 40, z: 5 });
runTicks(3);
check(count(Glowite.ORE) === oresBefore + 2, "and never two of it");
ore.remove();
sim.items = false;
player.setGameMode("Creative");
check(breakOre(new ItemStack("minecraft:diamond_pickaxe")) === 0, "nothing drops in creative");
player.setGameMode("Survival");

console.log("the furnace and raw glowite");
const F = { x: 6, y: 64, z: 6 };
setBlock(ow, F.x, F.y, F.z, "minecraft:furnace");
const furnace = block(F.x, F.y, F.z);
world.afterEvents.playerInteractWithBlock.fire({ player, block: furnace, isFirstEvent: true });
check(Glowite.watchedCount() === 1, "a furnace a player opens is watched");
const fc = furnace.getComponent("minecraft:inventory").container;
fc.setItem(0, new ItemStack(Glowite.RAW, 2));
let n = log.messages.length;
const blasts = log.explosions.length;
runTicks(20);
check(log.explosions.length === blasts, "unlit, with no fuel, it only rattles");
check(log.messages.slice(n).some((m) => m.includes("rattles")), "and the player is warned");
const rawBack = count(Glowite.RAW);
fc.setItem(1, new ItemStack("minecraft:coal", 4));
n = log.messages.length;
runTicks(10);
check(log.explosions.length === blasts + 1, "with fuel in it, it blows up");
check(log.explosions.at(-1)?.breaksBlocks === true, "taking the furnace with it");
check(!fc.getItem(0), "the raw glowite isn't smelted");
check(log.messages.slice(n).some((m) => m.includes("Blast Furnace")), "the player is told to use a blast furnace");
runTicks(6);
check(count(Glowite.RAW) === rawBack + 2, "the raw glowite is thrown clear afterwards");
check(Glowite.watchedCount() === 0, "that furnace isn't watched any more");
const B = { x: 9, y: 64, z: 6 };
setBlock(ow, B.x, B.y, B.z, "minecraft:blast_furnace");
const blast = block(B.x, B.y, B.z);
world.afterEvents.playerInteractWithBlock.fire({ player, block: blast, isFirstEvent: true });
const bc = blast.getComponent("minecraft:inventory").container;
bc.setItem(0, new ItemStack(Glowite.RAW, 1));
bc.setItem(1, new ItemStack("minecraft:coal", 1));
runTicks(20);
check(log.explosions.length === blasts + 1, "a blast furnace takes raw glowite safely");

console.log("glowite armor");
const zombie = ow.spawnEntity("minecraft:zombie", { x: 3, y: 64, z: 0 });
runTicks(1);
const hit = (dmg) => {
  hp.setCurrentValue(20);
  player.knockbacks = [];
  player.applyDamage(dmg, { cause: "entityAttack", damagingEntity: zombie });
  return { hp: hp.currentValue, kb: player.knockbacks.at(-1) };
};
let r = hit(6);
check(Math.abs(r.hp - 14) < 1e-6 && !r.kb, "without it a hit takes its full toll, no push back");
slots.Head = new ItemStack("zt:glowite_helmet");
slots.Chest = new ItemStack("zt:glowite_chestplate");
slots.Legs = new ItemStack("zt:glowite_leggings");
slots.Feet = new ItemStack("zt:glowite_boots");
check(Glowite.piecesWorn(player) === 4, "four pieces worn");
r = hit(6);
check(Math.abs(r.hp - (14 + 6 * 4 * Glowite.TOUGH_CUT)) < 1e-6, `toughness cuts a hit of 6 by a fifth (to ${(20 - r.hp).toFixed(1)})`);
check(!!r.kb && r.kb.x > 0 && Math.abs(r.kb.z) < 1e-9, "knockback resistance pushes back toward the attacker");
check(!!r.kb && Math.abs(Math.hypot(r.kb.x, r.kb.z) - 0.4 * Glowite.KNOCKBACK_RESISTANCE * 4) < 1e-9, "60% of the push, with all four pieces");
r = hit(12);
check(Math.abs(r.hp - (8 + 12 * 4 * Glowite.BIG_CUT)) < 1e-6, `a big hit is cut harder (12 -> ${(20 - r.hp).toFixed(1)})`);
r = hit(2);
check(Math.abs(r.hp - 18) < 1e-6, "small hits are left alone");
slots.Head = undefined;
slots.Legs = undefined;
r = hit(6);
check(Math.abs(r.hp - (14 + 6 * 2 * Glowite.TOUGH_CUT)) < 1e-6 && Math.abs(Math.hypot(r.kb.x, r.kb.z) - 0.4 * Glowite.KNOCKBACK_RESISTANCE * 2) < 1e-9,
  "two pieces do half as much");
r = (() => {
  hp.setCurrentValue(20);
  player.knockbacks = [];
  player.applyDamage(6, { cause: "fall" });
  return { hp: hp.currentValue, kb: player.knockbacks.at(-1) };
})();
check(!r.kb, "a fall isn't pushed back against");
slots.Chest = undefined;
slots.Feet = undefined;
zombie.remove();
hp.setCurrentValue(20);

console.log("the spore crop");
const CR = { x: 20, y: 64, z: 20 };
setBlock(ow, CR.x, CR.y - 1, CR.z, "minecraft:farmland");
setBlock(ow, CR.x, CR.y, CR.z, Glow.CROP, { "zt:growth": 0 });
for (let i = 0; i < 40; i++) comp("zt:spore_crop").onRandomTick({ block: block(CR.x, CR.y, CR.z), dimension: ow });
check(state(CR.x, CR.y, CR.z, "zt:growth") === 3, "random ticks grow it to its fourth stage");
for (let i = 0; i < 10; i++) comp("zt:spore_crop").onRandomTick({ block: block(CR.x, CR.y, CR.z), dimension: ow });
check(state(CR.x, CR.y, CR.z, "zt:growth") === 3, "and no further");
setBlock(ow, CR.x + 2, CR.y - 1, CR.z, "minecraft:stone");
setBlock(ow, CR.x + 2, CR.y, CR.z, Glow.CROP, { "zt:growth": 0 });
for (let i = 0; i < 30; i++) comp("zt:spore_crop").onRandomTick({ block: block(CR.x + 2, CR.y, CR.z), dimension: ow });
check(state(CR.x + 2, CR.y, CR.z, "zt:growth") === 0, "nothing grows without soil");
setBlock(ow, CR.x + 4, CR.y - 1, CR.z, Glow.DIRT);
setBlock(ow, CR.x + 4, CR.y, CR.z, Glow.CROP, { "zt:growth": 0 });
slots.Mainhand = new ItemStack("minecraft:bone_meal", 5);
const use = (x, y, z) => {
  world.beforeEvents.playerInteractWithBlock.fire({ player, block: block(x, y, z), itemStack: slots.Mainhand, isFirstEvent: true, blockFace: "Up" });
  runTicks(1);
};
use(CR.x + 4, CR.y, CR.z);
check(state(CR.x + 4, CR.y, CR.z, "zt:growth") >= 1, "bone meal grows it a stage or two (on maroon dirt too)");
check(slots.Mainhand?.amount === 4, "and is used up");
use(CR.x + 4, CR.y, CR.z);
use(CR.x + 4, CR.y, CR.z);
use(CR.x + 4, CR.y, CR.z);
check(state(CR.x + 4, CR.y, CR.z, "zt:growth") === 3, "bone meal gets it ripe");
const meal = slots.Mainhand?.amount ?? 0;
use(CR.x + 4, CR.y, CR.z);
check((slots.Mainhand?.amount ?? 0) === meal, "bone meal isn't wasted on a ripe crop");

console.log("spore grass, maroon dirt and hoes");
const G = { x: 30, y: 64, z: 30 };
setBlock(ow, G.x, G.y, G.z, Glow.GRASS);
for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (dx || dz) setBlock(ow, G.x + dx, G.y, G.z + dz, Glow.DIRT);
for (let i = 0; i < 200; i++) {
  const all = [];
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (blockId(ow, G.x + dx, G.y, G.z + dz) === Glow.GRASS) all.push([dx, dz]);
  const [dx, dz] = all[i % all.length];
  comp("zt:spore_grass").onRandomTick({ block: block(G.x + dx, G.y, G.z + dz), dimension: ow });
}
let spread = 0;
for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (blockId(ow, G.x + dx, G.y, G.z + dz) === Glow.GRASS) spread++;
check(spread >= 7, `spore grass spreads over the maroon dirt round it (${spread} of 9)`);
setBlock(ow, G.x, G.y + 1, G.z, "minecraft:stone");
comp("zt:spore_grass").onRandomTick({ block: block(G.x, G.y, G.z), dimension: ow });
check(blockId(ow, G.x, G.y, G.z) === Glow.DIRT, "and turns back to maroon dirt under a block");
setBlock(ow, G.x, G.y + 1, G.z, "minecraft:air");
slots.Mainhand = new ItemStack("minecraft:iron_hoe");
use(G.x, G.y, G.z);
check(blockId(ow, G.x, G.y, G.z) === "minecraft:farmland", "a hoe tills maroon dirt into farmland");
check(slots.Mainhand?.getComponent("durability")?.damage === 1, "and wears a little");
use(G.x + 1, G.y, G.z);
check(blockId(ow, G.x + 1, G.y, G.z) === "minecraft:farmland", "spore grass too");
slots.Mainhand = new ItemStack("minecraft:bone_meal", 3);
use(G.x - 1, G.y, G.z - 1);
let sprouts = 0;
for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
  const id = blockId(ow, G.x + dx, G.y + 1, G.z + dz);
  if (id === Glow.PLANT || id === Glow.MUSHROOM) sprouts++;
}
check(sprouts >= 2, `bone meal on spore grass sprouts plants and mushrooms (${sprouts})`);

console.log("giant spore trees");
const T = { x: 60, y: 64, z: 60 };
check(Glow.growTree(ow, T.x, T.y, T.z, 6, Math.random, "strict"), "one grows where there's room");
let logs = 0;
let caps = 0;
for (let y = T.y; y < T.y + 10; y++) for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) {
  const id = blockId(ow, T.x + dx, y, T.z + dz);
  if (id === Glow.LOG) logs++;
  if (id === Glow.CAP) caps++;
}
check(logs === 6, "a trunk of six Glowshroom logs");
check(caps > 40, `under a broad Mushed Spore Cap (${caps} blocks)`);
setBlock(ow, T.x + 20, T.y + 4, T.z, "minecraft:stone");
check(!Glow.growTree(ow, T.x + 20, T.y, T.z, 6, Math.random, "strict") && blockId(ow, T.x + 20, T.y + 1, T.z) === "minecraft:air",
  "none where something's in the way");

console.log("the Glowshroom slab, door, trapdoor, fence gate, button and pressure plate");
const S = { x: 70, y: 64, z: 70 };
setBlock(ow, S.x, S.y, S.z, Glow.SLAB, { "minecraft:vertical_half": "bottom", "zt:double": 0 });
slots.Mainhand = new ItemStack(Glow.SLAB, 4);
let ev = { block: block(S.x, S.y + 1, S.z), dimension: ow, face: "Up", player, cancel: false, permutationToPlace: undefined };
comp("zt:slab").beforeOnPlayerPlace(ev);
runTicks(1);
check(ev.cancel === true && state(S.x, S.y, S.z, "zt:double") === 1, "a slab put on a bottom slab makes it double");
check(slots.Mainhand?.amount === 3, "using up one slab");
setBlock(ow, S.x + 2, S.y, S.z, Glow.SLAB, { "minecraft:vertical_half": "top", "zt:double": 0 });
ev = { block: block(S.x + 2, S.y + 1, S.z), dimension: ow, face: "Up", player, cancel: false };
comp("zt:slab").beforeOnPlayerPlace(ev);
check(!ev.cancel, "one put on a top slab is just placed above it");

const D = { x: 80, y: 64, z: 80 };
const doorAt = (x, hinge) => {
  setBlock(ow, x, D.y, D.z, Glow.DOOR, { "minecraft:cardinal_direction": "north", "minecraft:multi_block_part": 0, "zt:open": 0, "zt:hinge_right": hinge });
  setBlock(ow, x, D.y + 1, D.z, Glow.DOOR, { "minecraft:cardinal_direction": "north", "minecraft:multi_block_part": 1, "zt:open": 0, "zt:hinge_right": hinge });
};
doorAt(D.x, 0);
comp("zt:door").onPlayerInteract({ block: block(D.x, D.y + 1, D.z), dimension: ow, player });
check(state(D.x, D.y, D.z, "zt:open") === 1 && state(D.x, D.y + 1, D.z, "zt:open") === 1, "a tap on either half opens the whole door");
check(log.sounds.includes("random.door_open"), "with a creak");
comp("zt:door").onPlayerInteract({ block: block(D.x, D.y, D.z), dimension: ow, player });
check(state(D.x, D.y, D.z, "zt:open") === 0 && state(D.x, D.y + 1, D.z, "zt:open") === 0, "and again shuts it");
comp("zt:door").onRedstoneUpdate({ block: block(D.x, D.y, D.z), dimension: ow, powerLevel: 15 });
check(state(D.x, D.y, D.z, "zt:open") === 1, "redstone power opens it");
setRedstone(ow, D.x, D.y, D.z, 15);
runTicks(20);
check(state(D.x, D.y, D.z, "zt:open") === 1, "it stays open while powered");
setRedstone(ow, D.x, D.y, D.z, 0);
runTicks(20);
check(state(D.x, D.y, D.z, "zt:open") === 0, "and shuts when the power goes");
player.rotation = { x: 0, y: 180 };
ev = { block: block(D.x + 1, D.y, D.z), dimension: ow, face: "Up", player, cancel: false,
  permutationToPlace: { withState: (k, v) => ({ placedWith: [k, v] }) } };
comp("zt:door").beforeOnPlayerPlace(ev);
check(ev.permutationToPlace?.placedWith?.[0] === "zt:hinge_right" && ev.permutationToPlace.placedWith[1] === 1,
  "a door put beside another makes a double door (hinged on the other side)");
ev = { block: block(D.x + 5, D.y, D.z), dimension: ow, face: "Up", player, cancel: false, permutationToPlace: { withState: () => "changed" } };
comp("zt:door").beforeOnPlayerPlace(ev);
check(typeof ev.permutationToPlace === "object", "a door on its own keeps its hinge on the left");

const TD = { x: 90, y: 64, z: 80 };
setBlock(ow, TD.x, TD.y, TD.z, Glow.TRAPDOOR, { "minecraft:cardinal_direction": "north", "minecraft:vertical_half": "bottom", "zt:open": 0 });
comp("zt:trapdoor").onPlayerInteract({ block: block(TD.x, TD.y, TD.z), dimension: ow, player });
check(state(TD.x, TD.y, TD.z, "zt:open") === 1, "a trapdoor opens with a tap");
const GT = { x: 100, y: 64, z: 80 };
setBlock(ow, GT.x, GT.y, GT.z, Glow.GATE, { "minecraft:cardinal_direction": "north", "zt:open": 0, "zt:swing": 0 });
player.teleport({ x: GT.x + 0.5, y: GT.y, z: GT.z + 3 });
comp("zt:fence_gate").onPlayerInteract({ block: block(GT.x, GT.y, GT.z), dimension: ow, player });
check(state(GT.x, GT.y, GT.z, "zt:open") === 1 && state(GT.x, GT.y, GT.z, "zt:swing") === 0, "a fence gate opens away from a player south of it");
comp("zt:fence_gate").onPlayerInteract({ block: block(GT.x, GT.y, GT.z), dimension: ow, player });
player.teleport({ x: GT.x + 0.5, y: GT.y, z: GT.z - 3 });
comp("zt:fence_gate").onPlayerInteract({ block: block(GT.x, GT.y, GT.z), dimension: ow, player });
check(state(GT.x, GT.y, GT.z, "zt:swing") === 1, "and the other way for one north of it");

const BT = { x: 110, y: 64, z: 80 };
setBlock(ow, BT.x, BT.y, BT.z, Glow.BUTTON, { "minecraft:block_face": "north", "zt:pressed": 0 });
comp("zt:button").onPlayerInteract({ block: block(BT.x, BT.y, BT.z), dimension: ow, player });
check(state(BT.x, BT.y, BT.z, "zt:pressed") === 1, "a button presses in");
runTicks(25);
check(state(BT.x, BT.y, BT.z, "zt:pressed") === 1, "and stays in a moment");
runTicks(10);
check(state(BT.x, BT.y, BT.z, "zt:pressed") === 0, "then pops back out (a second and a half)");

const PP = { x: 120, y: 64, z: 80 };
setBlock(ow, PP.x, PP.y, PP.z, Glow.PLATE, { "zt:pressed": 0 });
const cow = ow.spawnEntity("minecraft:cow", { x: PP.x + 0.5, y: PP.y + 0.06, z: PP.z + 0.5 });
comp("zt:pressure_plate").onStepOn({ block: block(PP.x, PP.y, PP.z), dimension: ow, entity: cow });
check(state(PP.x, PP.y, PP.z, "zt:pressed") === 1, "a pressure plate goes down when stepped on");
comp("zt:pressure_plate").onTick({ block: block(PP.x, PP.y, PP.z), dimension: ow });
check(state(PP.x, PP.y, PP.z, "zt:pressed") === 1, "and stays down while it's stood on");
cow.teleport({ x: PP.x + 4, y: PP.y, z: PP.z });
comp("zt:pressure_plate").onStepOff({ block: block(PP.x, PP.y, PP.z), dimension: ow, entity: cow });
runTicks(12);
check(state(PP.x, PP.y, PP.z, "zt:pressed") === 0, "and comes up when it's stepped off");
cow.remove();

console.log("a Glowshroom cavern");
// a heart where world generation leaves them (a chunk's corner, y -36), and a player passing above
const H = { x: 32 * 16, y: Glow.HEART_Y, z: 32 * 16 };
setBlock(ow, H.x, H.y, H.z, Glow.HEART);
player.teleport({ x: H.x + 120, y: 64, z: H.z });
runTicks(80);
check(Glow.results.size === 0, "nothing is grown while the player is far off");
player.teleport({ x: H.x + 20, y: H.y - 2, z: H.z + 6 });
let t0 = system.currentTick;
runTicks(2000, () => Glow.results.size > 0);
const how = Glow.results.get(`minecraft:overworld|${H.x},${H.y},${H.z}`);
check(how === "built", `when one comes near it's grown (${how}, ${system.currentTick - t0} ticks)`);
const tally = {};
let lowest = Infinity;
for (let x = H.x - 22; x <= H.x + 22; x++) for (let z = H.z - 22; z <= H.z + 22; z++) for (let y = H.y - 10; y <= H.y + 14; y++) {
  const id = blockId(ow, x, y, z);
  tally[id] = (tally[id] ?? 0) + 1;
  if (id === Glow.GRASS) lowest = Math.min(lowest, y);
}
console.log("    (" + Object.entries(tally).filter(([k]) => k !== "minecraft:stone").map(([k, v]) => `${k.replace(/^(minecraft|zt):/, "")} ${v}`).join(", ") + ")");
check((tally["minecraft:air"] ?? 0) > 3000, `a big hollow (${tally["minecraft:air"]} blocks of air)`);
check((tally[Glow.GRASS] ?? 0) > 250, `floored with spore grass (${tally[Glow.GRASS]})`);
check((tally[Glow.DIRT] ?? 0) > 250, `over maroon dirt (${tally[Glow.DIRT]})`);
check((tally[Glow.PLANT] ?? 0) > 40, `spore grass plants (${tally[Glow.PLANT]})`);
check((tally[Glow.MUSHROOM] ?? 0) >= 4, `spore mushrooms (${tally[Glow.MUSHROOM]})`);
check((tally[Glow.LOG] ?? 0) >= 8 && (tally[Glow.CAP] ?? 0) >= 60, `giant spore trees (${tally[Glow.LOG]} logs, ${tally[Glow.CAP]} cap blocks)`);
check((tally[Glow.ORE] ?? 0) >= 1, `Glowite ore in its roof (${tally[Glow.ORE]})`);
check(!tally[Glow.HEART], "its heart is gone");
check(lowest >= H.y - 8, "the floor is where the plan puts it");
if (process.env.ZT_CAVERN_OUT) {
  const { writeFileSync } = await import("node:fs");
  const rows = [];
  for (let y = H.y - 10; y <= H.y + 14; y++) for (let z = H.z - 22; z <= H.z + 22; z++) {
    const row = [];
    for (let x = H.x - 22; x <= H.x + 22; x++) row.push(blockId(ow, x, y, z).replace(/^(minecraft|zt):/, ""));
    rows.push(row);
  }
  writeFileSync(process.env.ZT_CAVERN_OUT, JSON.stringify({ y0: H.y - 10, n: 45, rows }));
}
const listed = Glow.cavernList();
check(listed.length === 1 && listed[0].x === H.x && listed[0].r >= 12, "it's remembered");
check(typeof world.getDynamicProperty("zt:glowshroom_caverns") === "string", "in the world");
// the player walks in: the biome's title, and its mobs
player.teleport({ x: H.x + 3, y: H.y - 4, z: H.z + 3 });
n = log.messages.length;
runTicks(30);
check(log.messages.slice(n).some((m) => m.includes("Glowshroom Biome")), "walking in shows the Glowshroom Biome's title");
runTicks(1200);
const mobs = ow.getEntities({ families: ["shroom"] });
check(mobs.length >= 1 && mobs.length <= 4, `Shroom Zombies and Skeletons turn up (${mobs.map((m) => m.typeId.slice(3)).join(", ")})`);
check(mobs.every((m) => blockId(ow, Math.floor(m.location.x), Math.floor(m.location.y) - 1, Math.floor(m.location.z)) === Glow.GRASS),
  "on its spore grass");
check(mobs.every((m) => Math.hypot(m.location.x - player.location.x, m.location.z - player.location.z) >= 8), "not right beside the player");
for (const m of mobs) m.remove();
world.difficulty = "Peaceful";
runTicks(800);
check(ow.getEntities({ families: ["shroom"] }).length === 0, "none in peaceful");
world.difficulty = "Normal";

// one where something was built: left alone
const H2 = { x: 40 * 16 + 8, y: Glow.HEART_Y, z: 40 * 16 + 8 };
setBlock(ow, H2.x, H2.y, H2.z, Glow.HEART);
for (let k = 0; k < 6; k++) setBlock(ow, H2.x + 3 + k, H2.y, H2.z + 2, "minecraft:deepslate_bricks");
player.teleport({ x: H2.x, y: 64, z: H2.z });
t0 = system.currentTick;
runTicks(2000, () => Glow.results.has(`minecraft:overworld|${H2.x},${H2.y},${H2.z}`));
check(Glow.results.get(`minecraft:overworld|${H2.x},${H2.y},${H2.z}`) === "built over", "a heart in an ancient city's bricks grows nothing");
check(blockId(ow, H2.x + 1, H2.y, H2.z) === "minecraft:stone" && blockId(ow, H2.x + 3, H2.y, H2.z + 2) === "minecraft:deepslate_bricks", "and nothing is carved");
// one in an aquifer: left alone
const HW = { x: 70 * 16, y: Glow.HEART_Y, z: 70 * 16 };
setBlock(ow, HW.x, HW.y, HW.z, Glow.HEART);
for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) setBlock(ow, HW.x + 6 + dx, HW.y + 1, HW.z + dz, "minecraft:water");
player.teleport({ x: HW.x, y: 64, z: HW.z });
runTicks(2000, () => Glow.results.has(`minecraft:overworld|${HW.x},${HW.y},${HW.z}`));
console.log("    (aquifer: " + Glow.results.get(`minecraft:overworld|${HW.x},${HW.y},${HW.z}`) + ", " + blockId(ow, HW.x + 1, HW.y, HW.z) + ")");
check(Glow.results.get(`minecraft:overworld|${HW.x},${HW.y},${HW.z}`) === "flooded" && blockId(ow, HW.x + 1, HW.y, HW.z) === "minecraft:stone",
  "a heart in an aquifer grows nothing");
// one at the edge of the loaded world: it waits
const H3 = { x: 50 * 16, y: Glow.HEART_Y, z: 50 * 16 };
setBlock(ow, H3.x, H3.y, H3.z, Glow.HEART);
unloadedChunks.add(`${50 - 1},50`);
player.teleport({ x: H3.x + 30, y: 64, z: H3.z });
runTicks(400, () => Glow.results.has(`minecraft:overworld|${H3.x},${H3.y},${H3.z}`));
check(Glow.results.get(`minecraft:overworld|${H3.x},${H3.y},${H3.z}`) === "unloaded" && blockId(ow, H3.x, H3.y, H3.z) === Glow.HEART,
  "a heart next to an unloaded chunk waits");
unloadedChunks.clear();
Glow.results.clear();
comp("zt:glowshroom_heart").onTick({ block: block(H3.x, H3.y, H3.z), dimension: ow });
runTicks(400);
comp("zt:glowshroom_heart").onTick({ block: block(H3.x, H3.y, H3.z), dimension: ow });
runTicks(2000, () => Glow.results.has(`minecraft:overworld|${H3.x},${H3.y},${H3.z}`));
check(Glow.results.get(`minecraft:overworld|${H3.x},${H3.y},${H3.z}`) === "built", "and grows once it's all there");

console.log("the Shroom Zombie's bursts");
const Z = { x: 300, y: 64, z: 300 };
player.teleport({ x: Z.x + 12, y: Z.y, z: Z.z });
hp.setCurrentValue(20);
const sz = ow.spawnEntity(Shroom.ZOMBIE, { x: Z.x, y: Z.y, z: Z.z });
const bullets = () => ow.getEntities({ type: Shroom.BULLET });
const before = bullets().length;
runTicks(10);
const fired = bullets();
check(fired.length - before === 4, `a player too far off gets a burst of four spore bullets (${fired.length - before})`);
const dirs = fired.map((b) => Math.round(Math.atan2(b.velocity.z, b.velocity.x) * 180 / Math.PI));
check(dirs.includes(0) && dirs.some((d) => Math.abs(Math.abs(d) - 180) < 1) && dirs.includes(90) && dirs.includes(-90), `four ways, one at the player (${dirs.join(" ")})`);
check(fired.every((b) => b.components["minecraft:projectile"].owner === sz), "fired by the zombie");
const hpBefore = hp.currentValue;
runTicks(20);
check(hp.currentValue < hpBefore, `the one aimed at the player hits (${(hpBefore - hp.currentValue).toFixed(0)} damage)`);
check(log.particles.includes("zt:spore_pop"), "and bursts in spores");
const shots = bullets().length;
runTicks(30);
check(bullets().length === shots, "it doesn't fire again right away");
player.teleport({ x: Z.x + 4, y: Z.y, z: Z.z });
for (const b of bullets()) b.remove();
runTicks(100);
check(bullets().length === 0, "a player close by gets bitten, not shot");
player.teleport({ x: Z.x + 14, y: Z.y, z: Z.z });
for (let y = Z.y; y < Z.y + 4; y++) for (let dz = -2; dz <= 2; dz++) setBlock(ow, Z.x + 6, y, Z.z + dz, "minecraft:stone");
runTicks(100);
check(bullets().length === 0, "nor one behind a wall");
sz.remove();

console.log("Shroom Berries and Shroomy");
const P2 = { x: 400, y: 64, z: 400 };
player.teleport(P2);
player.effectInfo = {};
world.afterEvents.itemCompleteUse.fire({ source: player, itemStack: new ItemStack(Shroom.BERRIES), useDuration: 32 });
check(player.effectInfo.regeneration?.amplifier === 1 && player.effectInfo.regeneration?.duration === 100, "Regeneration II for 5 seconds");
check(!!Shroom.shroomyOf(player.id), "and Shroomy");
const orbs = log.particles.filter((p) => p === "zt:shroomy_orb").length;
runTicks(5);
check(log.particles.filter((p) => p === "zt:shroomy_orb").length - orbs === 20, "four glowing bullets circle the player");
const foe = ow.spawnEntity("minecraft:zombie", { x: P2.x + 5, y: P2.y, z: P2.z });
const foeHp = foe.getComponent("minecraft:health").currentValue;
const friendly = () => ow.getEntities({ type: Shroom.FRIENDLY });
const pews = () => log.sounds.filter((x) => x === "mob.shulker.shoot").length;
const pew0 = pews();
runTicks(15);
check(pews() > pew0 && foe.angryAt === player, "a hostile mob that comes close is shot at (the player gets the credit)");
const foeNow = foe.valid ? foe.getComponent("minecraft:health").currentValue : 0;
check(foeNow <= foeHp - Shroom.SHROOMY_DAMAGE, `and hit (${foeHp} -> ${foeNow})`);
runTicks(60);
check(!foe.valid || foe.getComponent("minecraft:health").currentValue <= 0 || foe.getComponent("minecraft:health").currentValue < foeNow,
  "again and again");
const ender = ow.spawnEntity("minecraft:enderman", { x: P2.x - 4, y: P2.y, z: P2.z });
const pig = ow.spawnEntity("minecraft:pig", { x: P2.x, y: P2.y, z: P2.z + 4 });
for (const b of friendly()) b.remove();
if (foe.valid) foe.remove();
runTicks(40);
check(friendly().length === 0, "endermen and animals are left alone");
ender.remove();
pig.remove();
n = log.messages.length;
runTicks(400);
check(!Shroom.shroomyOf(player.id) && log.messages.slice(n).some((m) => m.includes("wore off")), "it wears off after 20 seconds");
world.afterEvents.itemCompleteUse.fire({ source: player, itemStack: new ItemStack(Shroom.BERRIES), useDuration: 32 });
runTicks(100);
world.afterEvents.itemCompleteUse.fire({ source: player, itemStack: new ItemStack(Shroom.BERRIES), useDuration: 32 });
check(Shroom.shroomyOf(player.id).until - system.currentTick === Shroom.SHROOMY_TICKS, "eating more starts the 20 seconds over");

console.log("");
check(warnings.length === 0, "no script errors" + (warnings.length ? ": " + warnings.slice(0, 3).join(" | ") : ""));
console.log(failures === 0 ? "ALL GOOD" : `${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
