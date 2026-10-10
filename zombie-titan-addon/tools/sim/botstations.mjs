// What a Player does with the blocks players use: chests (putting things in and taking them
// out), a furnace, an enchanting table (bookshelves, levels and lapis), an anvil (repairing,
// combining, naming, wearing out), a smithing table (netherite), a grindstone, a stonecutter,
// a brewing stand (real brewing: water bottles, nether wart, an ingredient, blaze powder), a
// composter; trading with villagers by profession and level; drinking potions; dropping junk;
// sleeping in its bed at night; stopping to think; doors it opens and closes.
//   node tools/sim/run.mjs botstations
import { blockId, blockContainer, ItemStack, log, runTicks, setBlock, sim, system, world } from "@minecraft/server";

const warnings = [];
console.warn = (...a) => {
  warnings.push(a.join(" "));
  if (process.env.ZT_TRACE) process.stderr.write("WARN " + a.join(" ") + "\n");
};
sim.items = true;
sim.machines = true;
world.timeOfDay = 1000;

await import("./scripts/main.js");
const Bot = await import("./scripts/bot.js");
const B = await import("./scripts/bot_body.js");
const S = await import("./scripts/bot_skills.js");
const St = await import("./scripts/bot_stations.js");
const Inv = await import("./scripts/bot_inv.js");
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
function run(bot, gen, ticks) {
  let done = false;
  let result;
  const wrapped = (function* () {
    result = yield* gen;
    done = true;
    return result;
  })();
  bot.task = { name: "test", prio: 1000, gen: wrapped, since: system.currentTick, ttl: 1e9 };
  runTicks(ticks, () => done);
  return { done, result };
}
const enchOf = (it, name) => Inv.enchantLevel(it, name);
const dur = (it) => it.getComponent("minecraft:durability");

const egg = ow.spawnEntity("zt:player", { x: 0.5, y: 64, z: 0.5 });
runTicks(2);
const bot = Bot.botOf(egg);
bot.stepCool = Object.fromEntries(["wood", "table", "stone", "sword", "axe", "food", "furnace", "torches", "bed", "home"].map((k) => [k, 1e9]));

console.log("chests");
setBlock(ow, 4, 64, 0, "minecraft:chest");
Inv.add(bot, new ItemStack("minecraft:cobblestone", 40));
Inv.add(bot, new ItemStack("minecraft:iron_ingot", 5));
Inv.add(bot, new ItemStack("minecraft:stone_pickaxe", 1));
let r = run(bot, S.deposit(bot, { x: 4, y: 64, z: 0 }, (id) => /pickaxe/.test(id)), 200);
const chest = blockContainer(ow, { x: 4, y: 64, z: 0 });
const inChest = (id) => [...Array(chest.size).keys()].map((i) => chest.getItem(i)).filter((i) => i?.typeId === id).reduce((s, i) => s + i.amount, 0);
check(r.result >= 2 && inChest("minecraft:cobblestone") === 40 && inChest("minecraft:iron_ingot") === 5 && Inv.has(bot, "minecraft:stone_pickaxe"),
  "puts its cobblestone and iron in a chest, keeps its pickaxe");
check(log.sounds.includes("random.chestopen") && log.sounds.includes("random.chestclosed"), "the lid opens and closes");
r = run(bot, S.withdraw(bot, { x: 4, y: 64, z: 0 }, "minecraft:iron_ingot", 3), 200);
check(r.result === 3 && Inv.count(bot, "minecraft:iron_ingot") === 3 && inChest("minecraft:iron_ingot") === 2, "takes three iron back out");
// a loot chest it finds
setBlock(ow, -4, 64, 0, "minecraft:chest");
const loot = blockContainer(ow, { x: -4, y: 64, z: 0 });
loot.setItem(3, new ItemStack("minecraft:diamond", 2));
loot.setItem(9, new ItemStack("minecraft:bread", 5));
r = run(bot, S.lootChest(bot, { x: -4, y: 64, z: 0 }), 300);
check(Inv.count(bot, "minecraft:diamond") === 2 && Inv.count(bot, "minecraft:bread") === 5 && !loot.getItem(3), "empties a chest it finds");

console.log("the furnace");
setBlock(ow, 0, 64, 4, "minecraft:furnace", { "minecraft:cardinal_direction": "north" });
Inv.add(bot, new ItemStack("minecraft:raw_iron", 3));
Inv.add(bot, new ItemStack("minecraft:coal", 2));
const ingots0 = Inv.count(bot, "minecraft:iron_ingot");
r = run(bot, S.smelt(bot, "minecraft:raw_iron", 3), 1200);
check(r.result && Inv.count(bot, "minecraft:iron_ingot") === ingots0 + 3, "smelts raw iron into ingots in a real furnace");
check(bot.level + bot.xp > 0, "and gets the furnace's experience");

console.log("the enchanting table");
setBlock(ow, 10, 64, 10, "minecraft:enchanting_table");
for (const [dx, dz] of [[-2, -2], [-2, -1], [-2, 0], [-2, 1], [-2, 2], [-1, 2], [0, 2], [1, 2]]) setBlock(ow, 10 + dx, 64, 10 + dz, "minecraft:bookshelf");
check(St.bookshelves(ow, { x: 10, y: 64, z: 10 }) === 8, "counts the bookshelves around it (8)");
bot.level = 30;
Inv.add(bot, new ItemStack("minecraft:lapis_lazuli", 10));
Inv.add(bot, new ItemStack("minecraft:iron_sword", 1));
r = run(bot, St.enchant(bot), 600);
const sword = Inv.stacks(bot).find((s) => s.item.typeId === "minecraft:iron_sword")?.item;
const swordEnch = sword ? sword.getComponent("minecraft:enchantable").getEnchantments() : [];
check(r.result && swordEnch.length >= 1, `enchants its iron sword (${swordEnch.map((e) => e.type.id.replace("minecraft:", "") + " " + e.level).join(", ")})`);
check(bot.level === 27 && Inv.count(bot, "minecraft:lapis_lazuli") === 7, "with the third offer: three levels and three lapis");
// the table's rolls, many times: never the impossible
let bad = 0;
for (let i = 0; i < 300; i++) {
  const list = St.rollEnchants("minecraft:diamond_pickaxe", 30);
  if (list.some(([n]) => n === "silk_touch") && list.some(([n]) => n === "fortune")) bad++;
  if (list.some(([n, l]) => l > (D.ENCHANTS.pickaxe.find((e) => e[0] === n)?.[1] ?? 0))) bad++;
}
check(bad === 0, "its rolls never put silk touch with fortune, or a level too high");

console.log("the anvil");
setBlock(ow, 14, 64, 0, "minecraft:anvil", { "minecraft:cardinal_direction": "north" });
const worn = new ItemStack("minecraft:iron_pickaxe", 1);
dur(worn).damage = 200;
Inv.add(bot, worn);
Inv.add(bot, new ItemStack("minecraft:iron_ingot", 4));
bot.level = 10;
r = run(bot, St.anvilRepair(bot, (it) => it.typeId === "minecraft:iron_pickaxe"), 600);
const fixed = Inv.stacks(bot).find((s) => s.item.typeId === "minecraft:iron_pickaxe")?.item;
check(r.result && dur(fixed).damage < 200, `repairs its worn iron pickaxe with iron (damage 200 -> ${dur(fixed).damage})`);
check(bot.level < 10 && log.sounds.includes("random.anvil_use"), "spending levels, with the anvil's clang");
// two worn swords make one, their enchantments merged
const s1 = new ItemStack("minecraft:diamond_sword", 1);
const s2 = new ItemStack("minecraft:diamond_sword", 1);
dur(s1).damage = 1200;
dur(s2).damage = 1000;
s1.getComponent("minecraft:enchantable").addEnchantment({ type: { id: "minecraft:sharpness" }, level: 2 });
s2.getComponent("minecraft:enchantable").addEnchantment({ type: { id: "minecraft:sharpness" }, level: 2 });
for (const it of Inv.stacks(bot).filter((s) => /sword/.test(s.item.typeId))) Inv.takeSlot(bot, it.slot);
// (no diamonds: it would just repair them with diamonds)
const diamonds = Inv.count(bot, "minecraft:diamond");
Inv.take(bot, "minecraft:diamond", diamonds);
Inv.add(bot, s1);
Inv.add(bot, s2);
bot.level = 20;
r = run(bot, St.anvilRepair(bot, (it) => it.typeId === "minecraft:diamond_sword"), 600);
const merged = Inv.stacks(bot).filter((s) => s.item.typeId === "minecraft:diamond_sword");
check(merged.length === 1 && enchOf(merged[0].item, "sharpness") === 3 && dur(merged[0].item).damage < 1000,
  "combines two worn sharpness II swords into one sharpness III");
Inv.add(bot, new ItemStack("minecraft:diamond", diamonds));
r = run(bot, St.anvilName(bot, "Excalibur"), 600);
check(Inv.stacks(bot).some((s) => s.item.nameTag === "Excalibur"), "names its sword at the anvil");

console.log("the smithing table");
setBlock(ow, 18, 64, 0, "minecraft:smithing_table");
Inv.add(bot, new ItemStack("minecraft:netherite_upgrade_smithing_template", 1));
Inv.add(bot, new ItemStack("minecraft:netherite_ingot", 1));
r = run(bot, St.smithNetherite(bot), 600);
const ns = Inv.stacks(bot).find((s) => s.item.typeId === "minecraft:netherite_sword")?.item;
check(r.result && ns && ns.nameTag === "Excalibur" && enchOf(ns, "sharpness") === 3, "upgrades its named, enchanted diamond sword to netherite");
check(!Inv.has(bot, "minecraft:netherite_upgrade_smithing_template") && !Inv.has(bot, "minecraft:netherite_ingot"), "using up the template and the ingot");

console.log("the grindstone and stonecutter");
setBlock(ow, 22, 64, 0, "minecraft:grindstone");
const p1 = new ItemStack("minecraft:stone_pickaxe", 1);
const p2 = new ItemStack("minecraft:stone_pickaxe", 1);
dur(p1).damage = 100;
dur(p2).damage = 90;
for (const it of Inv.stacks(bot).filter((s) => s.item.typeId === "minecraft:stone_pickaxe")) Inv.takeSlot(bot, it.slot);
Inv.add(bot, p1);
Inv.add(bot, p2);
r = run(bot, St.grind(bot), 600);
const ground = Inv.stacks(bot).filter((s) => s.item.typeId === "minecraft:stone_pickaxe");
check(r.result && ground.length === 1 && dur(ground[0].item).damage < 90, "grinds two worn stone pickaxes into one");
setBlock(ow, 26, 64, 0, "minecraft:stonecutter_block", { "minecraft:cardinal_direction": "north" });
Inv.add(bot, new ItemStack("minecraft:stone", 8));
r = run(bot, St.stonecut(bot, "minecraft:stone", "minecraft:stone_bricks", 8), 600);
check(r.result && Inv.count(bot, "minecraft:stone_bricks") === 8 && !Inv.has(bot, "minecraft:stone"), "cuts eight stone into eight stone bricks");

console.log("brewing");
setBlock(ow, 30, 64, 0, "minecraft:brewing_stand");
setBlock(ow, 30, 63, 4, "minecraft:water");
Inv.add(bot, new ItemStack("minecraft:glass_bottle", 3));
Inv.add(bot, new ItemStack("minecraft:nether_wart", 1));
Inv.add(bot, new ItemStack("minecraft:magma_cream", 1));
Inv.add(bot, new ItemStack("minecraft:blaze_powder", 1));
r = run(bot, St.brew(bot, "fire_resistance", 3), 2400);
check(r.result && St.potions(bot).fire_resistance === 3, "fills bottles at water and brews three fire resistance potions");
check(log.sounds.includes("bottle.fill"), "bottles filled at the water");
// drinking one
egg.effectInfo = {};
r = run(bot, St.drink(bot, "fire_resistance"), 100);
check(r.result && egg.getEffect("fire_resistance") && St.potions(bot).fire_resistance === 2 && Inv.has(bot, "minecraft:glass_bottle"),
  "drinks one: fire resistance, and the empty bottle back");

console.log("the composter");
setBlock(ow, 34, 64, 0, "minecraft:composter");
Inv.add(bot, new ItemStack("minecraft:wheat_seeds", 40));
r = run(bot, St.compost(bot), 2000);
check(Inv.has(bot, "minecraft:bone_meal") && Inv.count(bot, "minecraft:wheat_seeds") < 40, "composts its seeds into bone meal");

console.log("villagers");
const cleric = ow.spawnEntity("minecraft:villager_v2", { x: 40.5, y: 64, z: 0.5 });
cleric.components["minecraft:variant"].value = 7;
const fletcher = ow.spawnEntity("minecraft:villager_v2", { x: 44.5, y: 64, z: 0.5 });
fletcher.components["minecraft:variant"].value = 4;
check(St.profession(cleric) === "cleric" && St.profession(fletcher) === "fletcher", "tells a cleric from a fletcher");
check(!St.offers(cleric).some((o) => o.get[0] === "ender_pearl"), "a new cleric doesn't sell ender pearls yet");
Inv.add(bot, new ItemStack("minecraft:stick", 64));
const em0 = Inv.count(bot, "minecraft:emerald");
r = run(bot, St.tradeFor(bot, ["minecraft:arrow"]), 2000);
check(Inv.count(bot, "minecraft:arrow") >= 16 && Inv.count(bot, "minecraft:stick") <= 32, "sells sticks to the fletcher for emeralds and buys arrows");
check(log.sounds.includes("mob.villager.haggle") && log.sounds.includes("mob.villager.yes") && bot.stats.trades >= 2, "haggling, and the villager's yes");
// a cleric that has traded a lot sells pearls
cleric.setDynamicProperty("zt:trades", 20);
Inv.add(bot, new ItemStack("minecraft:emerald", 10));
const fresh = ow.spawnEntity("minecraft:villager_v2", { x: 40.5, y: 64, z: 2.5 });
fresh.components["minecraft:variant"].value = 7;
fresh.setDynamicProperty("zt:trades", 20);
check(St.offers(fresh).some((o) => o.get[0] === "ender_pearl"), "a cleric at expert level offers ender pearls");
r = run(bot, St.tradeFor(bot, ["minecraft:ender_pearl"]), 2000);
check(Inv.count(bot, "minecraft:ender_pearl") >= 2, `buys ender pearls from it (${Inv.count(bot, "minecraft:ender_pearl")})`);

console.log("junk");
Inv.add(bot, new ItemStack("minecraft:rotten_flesh", 30));
Inv.add(bot, new ItemStack("minecraft:dirt", 64));
const drops0 = log.items.length;
r = run(bot, S.tossJunk(bot), 400);
check(Inv.count(bot, "minecraft:rotten_flesh") === 8 && Inv.count(bot, "minecraft:dirt") === 32, "throws out rotten flesh and dirt it doesn't want (keeping a little)");
check(log.items.slice(drops0).some(([id]) => id === "minecraft:rotten_flesh"), "you can see it drop them");
const tossed = ow.entities.filter((e) => e.typeId === "minecraft:item" && e.valid && e.components["minecraft:item"].itemStack.typeId === "minecraft:dirt");
runTicks(60);
check(tossed.length > 0 && tossed.every((e) => e.valid), "and doesn't pick them straight back up");

console.log("doors");
for (let y = 64; y <= 66; y++) for (let z = -6; z <= 6; z++) setBlock(ow, 50, y, z, "minecraft:oak_planks");
setBlock(ow, 50, 64, 0, "minecraft:wooden_door", { open_bit: false, upper_block_bit: false });
setBlock(ow, 50, 65, 0, "minecraft:wooden_door", { open_bit: false, upper_block_bit: true });
r = run(bot, S.goTo(bot, { x: 48, y: 64, z: 0, r: 0.5 }), 600);
r = run(bot, S.goTo(bot, { x: 53, y: 64, z: 0, r: 0.5 }, { noBuild: true }), 600);
check(r.result && egg.location.x > 52, "walks through a closed door, opening it");
runTicks(10);
check(log.sounds.includes("open.wooden_door") && log.sounds.includes("close.wooden_door"), "and shuts it behind itself");

console.log("night");
setBlock(ow, 60, 64, 0, "minecraft:bed", { direction: 0, head_piece_bit: false });
setBlock(ow, 60, 64, 1, "minecraft:bed", { direction: 0, head_piece_bit: true });
bot.spawn = { dim: "minecraft:overworld", pos: { x: 60, y: 64, z: 0 } };
world.timeOfDay = 14000;
bot.task = null;
runTicks(600, () => bot.pose === 3);
check(bot.pose === 3 && egg.getProperty("zt:pose") === 3, "at night it goes to bed and sleeps");
world.timeOfDay = 23500;
runTicks(40);
check(bot.pose !== 3, "and gets up in the morning");
world.timeOfDay = 1000;

console.log("thinking");
let thought = false;
bot.task = null;
runTicks(3000, () => {
  if (egg.getProperty("zt:use") === 6) thought = true;
  return thought;
});
check(thought, "now and then it stops to think");

console.log("");
check(warnings.length === 0, "no script errors" + (warnings.length ? ": " + warnings.slice(0, 3).join(" | ") : ""));
console.log(failures === 0 ? "ALL GOOD" : `${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
