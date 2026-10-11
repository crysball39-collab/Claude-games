// Crabulon: the Crab Totem set on the Shroomed Altar in a Shroom Fortress's arena, the summoning
// (the totem rising and flashing, Crabulon coming down from the roof and roaring, the camera
// and controls taken and given back), its attacks (Bullet Barrage, Jump and its shockwave,
// Summon, Shroom Rain with its warning circles, the claw snap), its rage, its leaving when left
// alone, its death and what it leaves; and one called down at an altar outside a fortress.
//   node tools/sim/run.mjs crabulon          ZT_TRACE=1
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ItemStack, Player, blockId, log, runTicks, setBlock, sim, system, world } from "@minecraft/server";

const warnings = [];
console.warn = (...a) => {
  warnings.push(a.join(" "));
  if (process.env.ZT_TRACE) process.stderr.write("WARN " + a.join(" ") + "\n");
};

await import("./scripts/main.js");
const Glow = await import("./scripts/glowshroom.js");
const Fortress = await import("./scripts/fortress.js");
const CR = await import("./scripts/crabulon.js");
const Bullets = await import("./scripts/bullets.js");
const ow = world.getDimension("overworld");
const pack = (rel) => JSON.parse(readFileSync(join(process.env.ZT_ROOT ?? "../..", "packs", rel), "utf8"));
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
const heal = () => hp.setCurrentValue(20);
const count = (id) => log.items.filter(([i]) => i === id).reduce((n, [, k]) => n + k, 0);

console.log("the Crab Totem");
const recipe = pack("ZombieTitan_BP/recipes/crab_totem.json")["minecraft:recipe_shapeless"];
const parts = recipe.ingredients.map((i) => i.item);
check(parts.filter((i) => i === "zt:shroomy_crab_claw").length === 2 && parts.filter((i) => i === "zt:shroom_patch").length === 4 &&
  recipe.result.item === CR.TOTEM, "two Shroomy Crab Claws and four Shroom Patches make a Crab Totem");
const boss = pack("ZombieTitan_BP/entities/crabulon.json")["minecraft:entity"].components;
check(boss["minecraft:health"].max === 3000 && boss["minecraft:boss"].name === "Crabulon", "Crabulon has 3000 health and a boss bar");
const hud = readFileSync(join(process.env.ZT_ROOT ?? "../..", "packs", "ZombieTitan_RP", "ui", "hud_screen.json"), "utf8");
check(hud.includes("zt_crabulon_bar") && hud.includes("'Crabulon'"), "its own bar on the screen");

// a fortress to fight in
let FH;
for (let cx = 80; !FH; cx += 2) {
  const at = { x: cx * 16, y: Glow.HEART_Y, z: 80 * 16 };
  if (Fortress.wantsFortress(at)) FH = at;
}
setBlock(ow, FH.x, FH.y, FH.z, Glow.HEART);
player.teleport({ x: FH.x, y: 60, z: FH.z });
runTicks(6000, () => Fortress.results.has(`${FH.x},${FH.y},${FH.z}`));
const F = Fortress.fortressList().find((f) => f.ok);
check(!!F, "(a Shroom Fortress is built)");
if (!F) process.exit(1);
const [ax, ay, az] = F.altar;
const altar = ow.getBlock({ x: ax, y: ay, z: az });
const altarComp = sim.blockComponents.get("zt:shroomed_altar");
check(!!altarComp?.onPlayerInteract, "the altar's custom component is registered at startup");
const floor = F.floor;
// the player stands by the altar, on the gate's side of it
const [dx, dz] = F.dir;
const stand = { x: ax + 0.5 - dx * 3, y: floor + 1, z: az + 0.5 - dz * 3 };
player.teleport(stand);

console.log("the altar");
slots.Mainhand = undefined;
let m0 = log.messages.length;
altarComp.onPlayerInteract({ block: altar, player, dimension: ow });
check(CR.fights.size === 0 && log.messages.slice(m0).some((m) => m.includes("Crab Totem")), "with empty hands, it tells how to call Crabulon");
slots.Mainhand = new ItemStack(CR.TOTEM, 1);
altarComp.onPlayerInteract({ block: altar, player, dimension: ow });
const fight = [...CR.fights.values()][0];
check(!!fight && fight.phase === "intro", "with a Crab Totem in hand, the summoning begins");
check(!slots.Mainhand, "the totem is used up");
check(fight?.arena.fortress && fight.arena.landing.x === F.shaft[0] + 0.5, "in the fortress's arena, Crabulon to come down its shaft");

console.log("the summoning");
const totem = ow.getEntities({ type: CR.TOTEM_DISPLAY })[0];
check(!!totem && Math.abs(totem.location.y - (ay + 1)) < 0.01, "the totem stands on the altar");
check(player.cameraOn && player.permissions[2] === false && player.hud === "Hide", "the player's camera is taken, their controls locked and the screen cleared");
check(player.getEffect("resistance")?.amplifier === 4, "and nothing can hurt them meanwhile");
runTicks(CR.INTRO.flash - 1);
check(totem.valid, "the totem rises...");
let c0 = player.cameraLog.length;
runTicks(1);
check(!totem.valid && player.cameraLog.slice(c0).some(([k]) => k === "fade") && log.particles.includes("zt:totem_flash"),
  "...and bursts in a flash of blue light");
runTicks(CR.INTRO.arrive - CR.INTRO.flash);
const crab = ow.getEntities({ type: CR.BOSS })[0];
check(!!crab && crab.location.y > F.roof, "Crabulon appears up in the roof's shaft");
check(crab?.getProperty("zt:intro") === true && crab?.getProperty("zt:anim") === CR.ANIM.DESCEND, "coming down, out of reach");
const before = crab.getComponent("minecraft:health").currentValue;
crab.applyDamage(50, { cause: "entityAttack", damagingEntity: player });
check(crab.getComponent("minecraft:health").currentValue === before, "nothing hurts it while it's summoned");
runTicks((CR.INTRO.land - CR.INTRO.arrive) / 2);
const midway = crab.location.y;
check(midway < F.roof + 3 && midway > floor, `it comes down (at ${(midway - floor).toFixed(1)} above the floor halfway)`);
runTicks(CR.INTRO.land - CR.INTRO.arrive - (CR.INTRO.land - CR.INTRO.arrive) / 2);
check(Math.abs(crab.location.y - floor) < 0.01 && crab.getProperty("zt:anim") === CR.ANIM.LAND, "and lands on the arena's floor");
check(log.commands.some((c) => c.startsWith("camerashake")), "shaking the ground");
m0 = log.messages.length;
const s0 = log.sounds.length;
runTicks(CR.INTRO.roar - CR.INTRO.land);
check(crab.getProperty("zt:anim") === CR.ANIM.ROAR && log.sounds.slice(s0).includes("mob.ravager.roar"), "it roars");
check(log.messages.slice(m0).some((m) => m.includes("CRABULON")), "its name across the screen");
runTicks(CR.INTRO.end - CR.INTRO.roar);
check(fight.phase === "fight" && crab.getProperty("zt:intro") === false, "then the fight begins");
check(!player.cameraOn && player.permissions[2] === true && player.hud === "Reset" && !player.hasTag(CR.WATCHING),
  "the player has their camera and controls back");
// facing whoever summoned it
const facing = Math.abs(((crab.getRotation().y - Math.atan2(-(stand.x - crab.location.x), stand.z - crab.location.z) * 180 / Math.PI) % 360 + 540) % 360 - 180);
check(facing < 30, `it faces the altar's side of the arena (${facing.toFixed(0)}° off)`);
slots.Mainhand = new ItemStack(CR.TOTEM, 1);
m0 = log.messages.length;
altarComp.onPlayerInteract({ block: altar, player, dimension: ow });
check(CR.fights.size === 1 && slots.Mainhand?.typeId === CR.TOTEM && log.messages.slice(m0).some((m) => m.includes("already here")),
  "the altar won't take another totem while it's here");
slots.Mainhand = undefined;

console.log("it moves");
fight.next = 1e9;
const p0 = { ...crab.location };
heal();
runTicks(60);
const moved = Math.hypot(crab.location.x - p0.x, crab.location.z - p0.z);
const A = fight.arena;
check(moved > 4, `it scuttles about (${moved.toFixed(1)} blocks in three seconds)`);
check(crab.location.x >= A.x0 + 6.9 && crab.location.x <= A.x1 - 6.9 && crab.location.z >= A.z0 + 6.9 && crab.location.z <= A.z1 - 6.9,
  "keeping its legs out of the walls");
check(crab.getProperty("zt:moving") === true, "its legs going");

/** Puts the player at a spot relative to Crabulon (ahead, to its right), on the floor. */
function placePlayer(ahead, right = 0, up = 0) {
  const yaw = (crab.getRotation().y * Math.PI) / 180;
  const fw = { x: -Math.sin(yaw), z: Math.cos(yaw) };
  const rt = { x: -Math.cos(yaw), z: -Math.sin(yaw) };
  player.teleport({ x: crab.location.x + fw.x * ahead + rt.x * right, y: floor + up, z: crab.location.z + fw.z * ahead + rt.z * right });
}

console.log("Bullet Barrage");
placePlayer(12);
heal();
CR.start(fight, "barrage", player);
runTicks(10);
const volley = Bullets.flying().filter((b) => b.owner === crab);
check(volley.length === 7, `spore bullets, seven at a time (${volley.length})`);
const angles = [...new Set(volley.map((b) => Math.round((Math.atan2(b.vel.z, b.vel.x) * 180) / Math.PI)))].sort((a, b) => a - b);
check(angles.length === 7 && angles.every((a, i) => i === 0 || Math.abs(a - angles[i - 1] - 360 / 7) <= 1), `seven ways at once, evenly (${angles.join(" ")})`);
runTicks(4);
const turned = Bullets.flying().filter((b) => b.owner === crab).slice(-7).map((b) => Math.round((Math.atan2(b.vel.z, b.vel.x) * 180) / Math.PI));
check(!turned.every((a) => angles.includes(a)), "the seven turning, volley by volley");
runTicks(106);
check(hp.currentValue < 20, `they hurt (${(20 - hp.currentValue).toFixed(0)} damage to a player standing still)`);
check(crab.getProperty("zt:anim") === CR.ANIM.NONE, "and after five seconds it stops");
for (const b of Bullets.flying()) b.entity?.remove?.();
runTicks(90);

console.log("Jump");
fight.next = 1e9;
placePlayer(14);
heal();
const from = { ...crab.location };
CR.start(fight, "jump", player);
const target = fight.jump.to;
check(crab.getProperty("zt:anim") === CR.ANIM.CROUCH, "it crouches");
runTicks(CR.CFG.jumpCrouch + 2);
check(crab.getProperty("zt:anim") === CR.ANIM.AIR, "and leaps");
let highest = 0;
for (let i = 0; i < CR.CFG.jumpAir - 2; i++) {
  runTicks(1);
  highest = Math.max(highest, crab.location.y - floor);
}
check(highest > 6, `high into the air (${highest.toFixed(1)} blocks)`);
runTicks(3);
check(Math.hypot(crab.location.x - target.x, crab.location.z - target.z) < 0.01 && Math.hypot(target.x - from.x, target.z - from.z) > 2,
  "to another part of the arena");
check(hp.currentValue < 20, `landing on (or right by) the player crushes them (${(20 - hp.currentValue).toFixed(0)} damage)`);
// a shockwave runs out: a player on the floor is thrown; one in the air isn't touched
runTicks(40);
fight.next = 1e9;
const landOn = () => {
  CR.start(fight, "jump", player);
  fight.jump.to = { x: crab.location.x, y: floor, z: crab.location.z };
};
placePlayer(11, 0);
heal();
landOn();
runTicks(CR.CFG.jumpCrouch + CR.CFG.jumpAir + 12);
check(hp.currentValue < 20 && player.knockbacks.length > 0, `the shockwave throws a player standing on the floor ${11} blocks off (${(20 - hp.currentValue).toFixed(0)} damage)`);
runTicks(40);
fight.next = 1e9;
placePlayer(11, 0, 1.25);
heal();
landOn();
runTicks(CR.CFG.jumpCrouch + CR.CFG.jumpAir + 12);
check(hp.currentValue === 20, "a player in the air as it passes is untouched");
runTicks(40);

console.log("Summon");
fight.next = 1e9;
placePlayer(14);
heal();
CR.start(fight, "summon", player);
runTicks(20);
const summoned = ow.getEntities({ type: CR.CRAB }).filter((c) => CR.inArena(fight.arena, c.location));
check(summoned.length === 5, `five Shroomy Crabs come up (${summoned.length})`);
check(summoned.every((c) => c.events.includes("zt:make_hostile")), "and come for its foes");
check(summoned.every((c) => Math.abs(c.location.y - floor) < 0.01), "on the arena's floor");
runTicks(30);
CR.start(fight, "summon", player);
runTicks(20);
check(ow.getEntities({ type: CR.CRAB }).filter((c) => CR.inArena(fight.arena, c.location)).length <= CR.CFG.crabCap, "no more than ten at once");
for (const c of ow.getEntities({ type: CR.CRAB })) c.remove();
runTicks(30);

console.log("Shroom Rain");
fight.next = 1e9;
placePlayer(12);
heal();
const pr = log.particleAt.length;
CR.start(fight, "rain", player);
runTicks(60);
const rings = log.particleAt.slice(pr).filter((p) => p.id === "zt:warning_ring");
check(rings.length >= 10, `red circles mark where mushrooms will land (${rings.length})`);
check(rings.every((r) => Math.abs(r.y - floor) < 0.2 && r.vars["variable.size"] > 3), "on the floor, as wide as their hit");
const falling = ow.getEntities({ type: CR.SHROOM });
check(falling.length >= 1, `small glowing mushrooms fall (${falling.length} in the air)`);
check(falling.every((s) => rings.some((r) => Math.hypot(r.x - s.location.x, r.z - s.location.z) < 0.01)), "each onto its circle");
runTicks(80);
check(hp.currentValue < 20, `a player standing still gets hit (${(20 - hp.currentValue).toFixed(0)} damage)`);
check(ow.getEntities({ type: CR.SHROOM }).length === 0 && crab.getProperty("zt:anim") === CR.ANIM.NONE, "after five seconds the rain stops");
// one landing well away from the player does nothing to them
heal();
fight.drops.push({ x: player.location.x + 4, y: floor, z: player.location.z, warned: fight.t, falls: fight.t, entity: undefined, h: 0, v: 0.3 });
runTicks(40);
check(hp.currentValue === 20, "one landing four blocks off misses");

console.log("the claw");
fight.next = 1e9;
placePlayer(7);
heal();
CR.start(fight, "claw", player);
runTicks(20);
check(hp.currentValue <= 20 - CR.CFG.clawDamage * 0.99, `it snaps at the player in front of it (${(20 - hp.currentValue).toFixed(0)})`);
runTicks(30);
fight.next = 1e9;
placePlayer(-7);
heal();
CR.start(fight, "claw", player);
runTicks(20);
check(hp.currentValue === 20, "not at one behind it");

console.log("left to itself, it fights on");
fight.next = 0;
placePlayer(12);
const seen = new Set();
for (let i = 0; i < 1600; i++) {
  heal();
  runTicks(1);
  if (fight.attack) seen.add(fight.attack);
  if (i % 200 === 0) placePlayer(9 + (i % 7));
}
check(seen.size >= 4, `it uses its attacks by turns (${[...seen].join(", ")})`);
for (const c of ow.getEntities({ type: CR.CRAB })) c.remove();

console.log("enraged");
const chp = crab.getComponent("minecraft:health");
chp.setCurrentValue(1400);
runTicks(2);
check(fight.enraged && crab.getProperty("zt:enraged") === true, "below half its health it's enraged");

console.log("left alone, it leaves");
player.teleport({ x: F.o[0] - dx * 8, y: floor, z: F.o[2] - dz * 8 });
runTicks(CR.CFG.leaveAfter + 10);
check(fight.phase === "leaving", "with no one in the arena for half a minute, it climbs back into the roof");
const t0 = count(CR.TOTEM);
runTicks(70);
check(!crab.valid && CR.fights.size === 0, "and is gone");
check(count(CR.TOTEM) === t0 + 1, "leaving the Crab Totem on the altar");

console.log("its death");
player.teleport(stand);
slots.Mainhand = new ItemStack(CR.TOTEM, 1);
altarComp.onPlayerInteract({ block: altar, player, dimension: ow });
runTicks(CR.INTRO.end + 2);
const crab2 = ow.getEntities({ type: CR.BOSS }).find((e) => e.valid);
check(!!crab2 && [...CR.fights.values()][0]?.phase === "fight", "(summoned again)");
const xp0 = player.xp;
const s1 = count(CR.SCROLL);
const e1 = count(CR.EYE);
m0 = log.messages.length;
crab2.applyDamage(5000, { cause: "entityAttack", damagingEntity: player });
runTicks(1);
const corpse = ow.getEntities({ type: CR.CORPSE }).find((e) => e.valid);
check(!crab2.valid && !!corpse, "it falls, its corpse in its place");
check(log.messages.slice(m0).some((m) => m.includes("Crabulon has been defeated by")), "everyone near hears of it");
check(CR.fights.size === 0, "the fight is over");
runTicks(CR.DEATH.burst);
check(count(CR.SCROLL) === s1 + 1 && count(CR.EYE) === e1 + 1, "it bursts, leaving a Spore Scroll and a Shroomed Eye");
check(player.xp - xp0 === CR.CFG.xp, `and experience for its killer (${player.xp - xp0})`);
runTicks(CR.DEATH.gone - CR.DEATH.burst + 2);
check(!corpse.valid, "then the corpse is gone");

console.log("one called somewhere else");
const P2 = { x: 3000, y: 64, z: 3000 };
for (let x = P2.x - 25; x <= P2.x + 25; x++) for (let z = P2.z - 25; z <= P2.z + 25; z++) setBlock(ow, x, P2.y - 1, z, "minecraft:grass_block");
setBlock(ow, P2.x, P2.y, P2.z, Fortress.ALTAR);
player.teleport({ x: P2.x - 4.5, y: P2.y, z: P2.z + 0.5 });
slots.Mainhand = new ItemStack(CR.TOTEM, 1);
altarComp.onPlayerInteract({ block: ow.getBlock(P2), player, dimension: ow });
const f2 = [...CR.fights.values()][0];
check(!!f2 && !f2.arena.fortress && f2.arena.landing.x > P2.x + 5, "an altar outside a fortress works too: it comes down beyond the altar");
runTicks(CR.INTRO.end + 2);
const crab3 = ow.getEntities({ type: CR.BOSS }).find((e) => e.valid);
check(!!crab3 && Math.abs(crab3.location.y - P2.y) < 0.01 && f2.phase === "fight", "onto the ground there");
crab3.remove();
runTicks(5);
check(CR.fights.size === 0, "(gone)");

console.log("loose ends");
// one hatched from a spawn egg: it fights where it stands
const egg = ow.spawnEntity(CR.BOSS, { x: P2.x + 5.5, y: P2.y, z: P2.z + 0.5 });
runTicks(45);
check([...CR.fights.values()].some((f) => f.bossId === egg.id && f.phase === "fight"), "one from a spawn egg is picked up and fights");
egg.remove();
runTicks(5);
// a player who left in the middle of a summoning has their camera given back when they return
player.addTag(CR.WATCHING);
player.inputPermissions.setPermissionCategory(2, false);
player.onScreenDisplay.setHudVisibility("Hide");
world.afterEvents.playerSpawn.fire({ player, initialSpawn: true });
check(!player.hasTag(CR.WATCHING) && player.permissions[2] === true && player.hud === "Reset", "a player who left mid-summoning gets their camera and controls back");

check(warnings.length === 0, "no script warnings" + (warnings.length ? ": " + warnings.slice(0, 3).join(" | ") : ""));
console.log(failures === 0 ? "ALL GOOD" : failures + " FAILED");
process.exit(failures === 0 ? 0 : 1);
