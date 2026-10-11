// Everest: its recipe and model; switching its abilities (crouch + use) and calling them up
// (use): Electro-Beam, Barrage, Slam and Supernova, what each hits and spares, and the rest each
// needs before it can be used again.
//   node tools/sim/run.mjs everest          ZT_TRACE=1
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ItemStack, Player, log, runTicks, setBlock, system, world } from "@minecraft/server";

const warnings = [];
console.warn = (...a) => {
  warnings.push(a.join(" "));
  if (process.env.ZT_TRACE) process.stderr.write("WARN " + a.join(" ") + "\n");
};

await import("./scripts/main.js");
const EV = await import("./scripts/everest.js");
const ow = world.getDimension("overworld");
const root = process.env.ZT_ROOT ?? "../..";
const pack = (rel) => JSON.parse(readFileSync(join(root, "packs", rel), "utf8"));
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

console.log("the lance");
const recipe = pack("ZombieTitan_BP/recipes/everest.json")["minecraft:recipe_shapeless"];
check(["zt:glowite_sword", "zt:shroomed_eye", "zt:spore_scroll"].every((i) => recipe.ingredients.some((g) => g.item === i)) &&
  recipe.ingredients.length === 3 && recipe.result.item === EV.ITEM, "a Glowite Sword, a Shroomed Eye and a Spore Scroll make Everest");
const item = pack("ZombieTitan_BP/items/everest.json")["minecraft:item"].components;
check(item["minecraft:damage"] === 15, "it hits for 15");
check(!!item["minecraft:use_modifiers"], "using it reaches the script");
const geo = pack("ZombieTitan_RP/models/entity/everest.geo.json")["minecraft:geometry"][0];
const bones = geo.bones.map((b) => b.name);
check(bones.includes("tip") && ["ring0_spin", "ring1_spin", "ring2_spin"].every((b) => bones.includes(b)) && bones.includes("glyphs"),
  "its model: a glowing tip, three rings of runes and the two squares of Hanzi");
const att = pack("ZombieTitan_RP/attachables/everest.json")["minecraft:attachable"].description;
check(att.materials.glow === "entity_beam_additive" && att.geometry.default === "geometry.zt.everest", "held in the hand, its rings and tip glowing");
const lang = readFileSync(join(root, "packs", "ZombieTitan_RP", "texts", "en_US.lang"), "utf8");
check(lang.includes("item.zt:everest.name=Everest"), "named Everest");

const player = new Player(ow, { x: 0, y: 64, z: 0 });
ow.entities.push(player);
const slots = player.components["minecraft:equippable"].slots;
slots.Mainhand = new ItemStack(EV.ITEM, 1);
// the player faces +z (yaw 0) on a floor of stone
for (let x = -30; x <= 30; x++) for (let z = -130; z <= 130; z++) setBlock(ow, x, 63, z, "minecraft:stone");
player.setRotation({ x: 0, y: 0 });
const use = (sneak = false) => {
  player.isSneaking = sneak;
  runTicks(5);
  const r = EV.onUse(player);
  player.isSneaking = false;
  return r;
};
/** A big target that doesn't move or fight back, n blocks ahead (and `side` to its left). */
function dummy(ahead, side = 0, type = "zt:shroomy_crab", hp = 5000) {
  const e = ow.spawnEntity(type, { x: player.location.x + side, y: 64, z: player.location.z + ahead });
  const h = e.getComponent("minecraft:health");
  if (h) {
    h.max = hp;
    h.value = hp;
  }
  return e;
}
const lost = (e) => 5000 - e.getComponent("minecraft:health").currentValue;

console.log("switching abilities");
check(EV.state(player).ability === 0, "it starts on Electro-Beam");
const seen = [];
for (let i = 0; i < 4; i++) {
  use(true);
  seen.push(EV.state(player).ability);
}
check(seen.join(",") === "1,2,3,0", `crouch + use goes through Barrage, Slam, Supernova and back (${seen.join(",")})`);
check((slots.Mainhand.getLore?.() ?? []).some((l) => l.includes("Electro-Beam")), "the lance's tooltip says which");
check(log.messages.some((m) => m.includes("Everest") && m.includes("Supernova")), "and so does the screen");
check(!EV.state(player).busy, "switching doesn't use one");

console.log("Electro-Beam");
const z1 = dummy(10);
const v1 = dummy(14, 0, "minecraft:villager_v2", 20);
check(use(), "use calls it up");
check(log.animations.some(([, a]) => a === "animation.zt.everest.aim"), "the lance thrust out ahead");
check(!use(), "nothing else while it runs");
runTicks(EV.CFG.beamTicks + 5);
const hits = lost(z1) / EV.CFG.beamDamage;
check(hits >= 12 && hits <= 15, `lightning strikes what it's aimed at: ${lost(z1)} damage in seven seconds (${hits} hits of ${EV.CFG.beamDamage})`);
check(v1.getComponent("minecraft:health").currentValue === 20, "a villager in the way is spared");
check(log.particles.includes("zt:electro_spark") && log.particles.includes("zt:electro_hit"), "sparks all along it");
check(!EV.state(player).busy, "after seven seconds it stops");
let m0 = log.messages.length;
use();
check(log.messages.slice(m0).some((m) => m.includes("recharging")), "and needs a rest before the next");
z1.remove();
v1.remove();
// a wall stops it
runTicks(EV.CFG.cooldown[0] + 5);
const z2 = dummy(10);
for (let y = 64; y < 67; y++) for (let x = -2; x <= 2; x++) setBlock(ow, x, y, 5, "minecraft:stone");
use();
runTicks(EV.CFG.beamTicks + 5);
check(lost(z2) === 0, "a wall stops it");
for (let y = 64; y < 67; y++) for (let x = -2; x <= 2; x++) setBlock(ow, x, y, 5, "minecraft:air");
z2.remove();

console.log("Barrage");
use(true);
check(EV.state(player).ability === 1, "(Barrage chosen)");
m0 = log.messages.length;
check(!use() && log.messages.slice(m0).some((m) => m.includes("nothing to strike")), "with nothing about, it says so and isn't used up");
const home = { ...player.location };
const z3 = dummy(8);
check(use(), "with a mob ahead it's called up");
const portals = ow.getEntities({ type: EV.PORTAL });
check(portals.length === 10, `ten portals open round it (${portals.length})`);
check(portals.every((p) => Math.abs(Math.hypot(p.location.x - z3.location.x, p.location.z - z3.location.z) - 3.5) < 0.6), "in a ring about it");
const places = new Set();
for (let t = 0; t < EV.CFG.barrageTicks; t += 2) {
  runTicks(2);
  places.add(`${Math.round(player.location.x)},${Math.round(player.location.z)}`);
}
runTicks(5);
check(places.size >= 8, `the player goes through them one after another (${places.size} places)`);
const stabs = lost(z3) / EV.CFG.stabDamage;
check(stabs >= 12 && stabs <= 15, `stabbing it again and again: ${lost(z3)} damage (${stabs} stabs of ${EV.CFG.stabDamage})`);
check(ow.getEntities({ type: EV.PORTAL }).length === 0, "then the portals close");
check(Math.hypot(player.location.x - home.x, player.location.z - home.z) < 0.01, "and the player is back where they were");
check(player.getEffect("resistance")?.amplifier === 4, "(nothing hurt them meanwhile)");
z3.remove();

console.log("Slam");
use(true);
const ahead = [dummy(6), dummy(12), dummy(20)];
const aside = dummy(8, 7);
const behind = dummy(-6);
check(use(), "it's called up");
check(log.animations.some(([, a]) => a === "animation.zt.everest.slam"), "the lance swung up and down into the ground");
runTicks(30);
check(ahead.every((e) => lost(e) === EV.CFG.slamDamage), `a surge runs out ahead, hitting each in its way for 100 (${ahead.map(lost).join(", ")})`);
check(lost(aside) === 0 && lost(behind) === 0, "nothing off to the side or behind");
check(log.particles.filter((p) => p === "zt:surge").length >= 8, "bursting up out of the ground as it goes");
for (const e of [...ahead, aside, behind]) e.remove();

console.log("Supernova");
use(true);
check(EV.state(player).ability === 3, "(Supernova chosen)");
const near = dummy(50);
const far = dummy(90, 20);
const tooFar = dummy(120, 0);
const villager = dummy(30, 0, "minecraft:villager_v2", 20);
const pet = dummy(20, 0, "zt:shroomy_crab", 20);
pet.components["minecraft:is_tamed"] = {};
const friend = new Player(ow, { x: 3, y: 64, z: 3 });
ow.entities.push(friend);
const friendHp = friend.getComponent("minecraft:health").currentValue;
check(use(), "it's called up");
check(log.animations.some(([, a]) => a === "animation.zt.everest.raise"), "the lance held high");
const ball = ow.getEntities({ type: EV.NOVA })[0];
check(!!ball, "a ball of light forms over it");
runTicks(100);
const half = ball.location.y - player.getHeadLocation().y;
runTicks(95);
const full = ball.location.y - player.getHeadLocation().y;
check(half > 10 && full > 24 && full > half, `and grows (its middle ${half.toFixed(1)}, then ${full.toFixed(1)} blocks over the player's head)`);
check(lost(near) === 0, "nothing is hurt until it bursts");
const fades = friend.cameraLog.length;
runTicks(10);
check(!ball.valid, "after ten seconds it bursts");
check(lost(near) === EV.CFG.novaDamage && lost(far) === EV.CFG.novaDamage, "1500 damage to every mob within a hundred blocks");
check(lost(tooFar) === 0, "but not farther off");
check(villager.getComponent("minecraft:health").currentValue === 20 && pet.getComponent("minecraft:health").currentValue === 20 &&
  friend.getComponent("minecraft:health").currentValue === friendHp, "villagers, pets and players are spared");
check(friend.cameraLog.slice(fades).some(([k]) => k === "fade") && log.particles.includes("zt:nova_burst"), "a blue flash over everyone's eyes");
m0 = log.messages.length;
use();
check(log.messages.slice(m0).some((m) => m.includes("recharging")), "and it needs a long rest after");
for (const e of [near, far, tooFar, villager, pet]) e.remove();

console.log("putting it away");
runTicks(EV.CFG.cooldown[3] + 5);
use();
check(EV.state(player).busy?.kind === "nova", "(a Supernova growing)");
slots.Mainhand = undefined;
runTicks(3);
check(!EV.state(player).busy && ow.getEntities({ type: EV.NOVA }).length === 0, "put away, it fizzles out");

check(warnings.length === 0, "no script warnings" + (warnings.length ? ": " + warnings.slice(0, 3).join(" | ") : ""));
console.log(failures === 0 ? "ALL GOOD" : failures + " FAILED");
process.exit(failures === 0 ? 0 : 1);
