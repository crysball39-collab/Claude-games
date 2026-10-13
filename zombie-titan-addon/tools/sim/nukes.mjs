// The nukes: their recipes and models; a Nuke Silo loaded, aimed, opened and activated through
// its controls (and what it refuses); the countdown and the launch; the flight, and the bomb
// falling where players can see it; the blast (its flash, its shockwave running out at the
// speed of sound, what it does near and far); the mushroom cloud each player is shown; ash,
// the crater, burning and shattering, a chunk at a time and each chunk once; the fallout (its
// levels near and far, its fading, overlapping blasts), what radiation does and what a Hazmat
// suit keeps off, the Radiation Detector, Radiation Zombies (risen from zombies radiation
// killed, their hits and their spit); the Missile Silo and the Doomsday Missile; everything
// remembered when the world is opened again.
//   node tools/sim/run.mjs nukes          ZT_TRACE=1
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { GameMode, ItemStack, Player, blockId, log, runTicks, setBlock, system, unloadedChunks, world } from "@minecraft/server";
import { ui } from "@minecraft/server-ui";

const warnings = [];
console.warn = (...a) => {
  warnings.push(a.join(" "));
  if (process.env.ZT_TRACE) process.stderr.write("WARN " + a.join(" ") + "\n");
};

await import("./scripts/main.js");
const N = await import("./scripts/nukes.js");
const R = await import("./scripts/radiation.js");
const Bullets = await import("./scripts/bullets.js");
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
const trace = (...a) => process.env.ZT_TRACE && console.log("    ..", ...a);
const settle = () => new Promise((r) => setTimeout(r, 0));
system.afterEvents.scriptEventReceive.fire({ id: "zt:natural_spawns", message: "off", sourceEntity: undefined });
runTicks(1);

/** The answer to each form (by default, none). */
let answer = () => ({ canceled: true });
ui.answer = (form, p) => answer(form, p);
/** Presses the button labelled `text` on the next form titled `title`, then answers no more. */
function press(title, text) {
  answer = (form) => {
    if (!form.titleText.includes(title)) return { canceled: true };
    const buttons = form.items.filter((i) => i.type === "button");
    const i = buttons.findIndex((b) => b.text.replace(/§./g, "") === text);
    answer = () => ({ canceled: true });
    return i < 0 ? { canceled: true } : { canceled: false, selection: i };
  };
}
/** @param {any} form @param {string} text */
const buttonIndex = (form, text) => form.items.filter((i) => i.type === "button").findIndex((b) => b.text.replace(/§./g, "") === text);
/** The buttons of the last form a player was shown. */
const lastButtons = () => ui.shown[ui.shown.length - 1].form.items.filter((i) => i.type === "button").map((b) => b.text.replace(/§./g, ""));
const said = (from, re) => log.messages.slice(from).some((m) => re.test(m));
const prop = (e, id) => e.getProperty(id);

// =============================================================================================
console.log("the data");
const recipe = (name) => pack(`ZombieTitan_BP/recipes/${name}.json`)["minecraft:recipe_shaped"];
const uses = (r, id) => r.pattern.join("").split("").filter((c) => r.key[c]?.item === id).length;
check(uses(recipe("little_boy"), "minecraft:nether_star") === 1 && uses(recipe("fat_man"), "minecraft:nether_star") === 2 &&
  uses(recipe("doomsday_missile"), "minecraft:nether_star") === 0, "Little Boy takes a Nether Star, Fat Man two, the Doomsday Missile none");
check(recipe("nuke_silo").result.item === "zt:nuke_silo" && recipe("missile_silo").result.item === "zt:missile_silo" &&
  uses(recipe("nuke_silo"), "minecraft:dispenser") === 1, "the silos are crafted");
check(recipe("radiation_detector").result.item === R.DETECTOR, "and the Radiation Detector");
const IRON = { helmet: [2, 165], chestplate: [6, 240], leggings: [5, 225], boots: [2, 195] };
check(Object.entries(IRON).every(([n, [prot, dur]]) => {
  const c = pack(`ZombieTitan_BP/items/hazmat_${n}.json`)["minecraft:item"].components;
  return c["minecraft:wearable"].protection === prot && c["minecraft:durability"].max_durability === dur && recipe("hazmat_" + n);
}), "the Hazmat suit: crafted, with iron's protection and wear");
check(["nuke_silo", "missile_silo"].every((n) => pack(`ZombieTitan_BP/items/${n}.json`)["minecraft:item"].components["minecraft:entity_placer"].entity === "zt:" + n),
  "a silo item places its silo");
const lang = readFileSync(join(root, "packs", "ZombieTitan_RP", "texts", "en_US.lang"), "utf8");
check(["item.zt:little_boy.name=Little Boy", "item.zt:fat_man.name=Fat Man", "item.zt:doomsday_missile.name=Doomsday Missile",
  "entity.zt:radiation_zombie.name=Radiation Zombie", "item.spawn_egg.entity.zt:radiation_zombie.name=Spawn Radiation Zombie",
  "item.zt:radiation_detector.name=Radiation Detector", "tile.zt:ash.name=Ash", "item.zt:hazmat_chestplate.name=Hazmat Chestplate"]
  .every((l) => lang.includes(l)), "all named");
const sdefs = pack("ZombieTitan_RP/sounds/sound_definitions.json").sound_definitions;
check(["zt.nuke.siren", "zt.nuke.launch", "zt.nuke.whistle", "zt.nuke.blast", "zt.nuke.rumble", "zt.silo.doors", "zt.geiger.3"]
  .every((k) => sdefs[k] && existsSync(join(root, "packs", "ZombieTitan_RP", sdefs[k].sounds[0].name + ".ogg"))),
  "a siren, a launch, a whistle, a blast, a rumble, the doors and a Geiger counter, all heard");
const geos = pack("ZombieTitan_RP/models/entity/nukes.geo.json")["minecraft:geometry"];
const bonesOf = (id) => geos.find((g) => g.description.identifier === id).bones.map((b) => b.name);
check(["door_r", "door_l", "lights", "little_boy", "fat_man", "doomsday"].every((b) => bonesOf("geometry.zt.nuke_silo").includes(b)),
  "the silo's model: hatch doors, warning lights and its three payloads");
check(["fireball", "stem", "cap", "skirt", "ring"].every((b) => bonesOf("geometry.zt.mushroom_cloud").includes(b)),
  "the cloud's: a fireball, a stem, a cap, a skirt of dust and a ring");
const anims = pack("ZombieTitan_RP/animations/nukes.animation.json").animations;
check(anims["animation.zt.silo.doors_open"].animation_length * 20 === N.CFG.doorTicks, "the doors take as long to open as the silo waits");
const rc = pack("ZombieTitan_RP/render_controllers/nukes.render_controllers.json").render_controllers;
check(JSON.stringify(rc["controller.render.zt.mushroom_cloud"].part_visibility).includes("zt:visible"), "a cloud is seen only by whom it's shown");
check(existsSync(join(root, "packs", "ZombieTitan_RP", "fogs", "nuclear_ash.json")), "the air of the wasteland");

// =============================================================================================
console.log("the silo");
// the world: stone to y 63; the silo at the origin, a player beside it
const player = new Player(ow, { x: 2.5, y: 64, z: 2.5 });
player.name = "Alex";
ow.entities.push(player);
const slots = player.components["minecraft:equippable"].slots;
const inv = player.getComponent("minecraft:inventory").container;
const silo = ow.spawnEntity(N.NUKE_SILO, { x: 0.5, y: 64, z: 0.5 });
runTicks(2);
slots.Mainhand = new ItemStack("zt:doomsday_missile", 1);
let m0 = log.messages.length;
N.onInteract(player, silo);
check(prop(silo, "zt:payload") === 0 && said(m0, /Missile Silo/), "the Doomsday Missile won't go in a Nuke Silo");
slots.Mainhand = new ItemStack("zt:little_boy", 1);
N.onInteract(player, silo);
check(prop(silo, "zt:payload") === 1 && !slots.Mainhand, "Little Boy, used on it, is loaded (and gone from the hand)");
// its controls
await settle();
N.onInteract(player, silo);
await settle();
check(ui.shown.at(-1).form.titleText === "Nuke Silo" && lastButtons().includes("Set Target") && lastButtons().includes("ACTIVATE") &&
  lastButtons().includes("Unload Little Boy"), `tapped, its controls open (${lastButtons().join(", ")})`);
m0 = log.messages.length;
press("Nuke Silo", "ACTIVATE");
N.onInteract(player, silo);
await settle();
check(said(m0, /Set a target/), "it won't launch without a target");
// aim it 700 blocks south, at the ground
answer = (form) => {
  if (form.titleText === "Nuke Silo") return { canceled: false, selection: buttonIndex(form, "Set Target") };
  if (form.titleText === "Target") {
    answer = () => ({ canceled: true });
    return { canceled: false, formValues: ["~", "ground", "~700"] };
  }
  return { canceled: true };
};
N.onInteract(player, silo);
await settle();
await settle();
const target = N.siloState(silo).target;
check(target?.x === 0 && target.z === 700 && target.ground, `aimed with ~ at 0 ground 700 (${JSON.stringify(target)})`);
check(N.coord("~-5", 10.7) === 5 && N.coord("123", 0) === 123 && Number.isNaN(N.coord("abc", 0)), "coordinates as typed: numbers or ~");
m0 = log.messages.length;
press("Nuke Silo", "ACTIVATE");
N.onInteract(player, silo);
await settle();
check(said(m0, /Open the doors/), "nor with its doors shut");
press("Nuke Silo", "Open Doors");
N.onInteract(player, silo);
await settle();
check(prop(silo, "zt:open") === true && log.sounds.includes("zt.silo.doors"), "the doors open, with a grinding of hydraulics");
m0 = log.messages.length;
press("Nuke Silo", "ACTIVATE");
N.onInteract(player, silo);
await settle();
check(said(m0, /still opening/), "it waits while they swing open");
runTicks(N.CFG.doorTicks);

// =============================================================================================
console.log("the launch");
// a player near the target sees it come down; one far off feels the blast; the one at the silo watches
const watcher = new Player(ow, { x: 0.5, y: 64, z: 500.5 });
watcher.name = "Sam";
watcher.setGameMode(GameMode.Creative);
const victim = new Player(ow, { x: 0.5, y: 64, z: 2700.5 });
victim.name = "Kai";
ow.entities.push(watcher, victim);
player.setGameMode(GameMode.Creative);
let confirm;
answer = (form) => {
  if (form.titleText === "Nuke Silo") {
    const i = form.items.filter((x) => x.type === "button").findIndex((b) => b.text.replace(/§./g, "") === "ACTIVATE");
    return { canceled: false, selection: i };
  }
  if (form.kind === "message") {
    confirm = form;
    answer = () => ({ canceled: true });
    return { canceled: false, selection: 1 };
  }
  return { canceled: true };
};
N.onInteract(player, silo);
await settle();
await settle();
check(confirm?.titleText === "Launch Little Boy?" && /2,500/.test(confirm.bodyText) && /700 blocks/.test(confirm.bodyText),
  "activated, it asks first: the target, how far, the blast radius");
check(!N.countdowns.has(silo.id) && prop(silo, "zt:stage") === 0, "Cancel: nothing happens");
answer = (form) => {
  if (form.titleText === "Nuke Silo") return { canceled: false, selection: form.items.filter((x) => x.type === "button").findIndex((b) => b.text.includes("ACTIVATE")) };
  if (form.kind === "message") {
    answer = () => ({ canceled: true });
    return { canceled: false, selection: 0 };
  }
  return { canceled: true };
};
N.onInteract(player, silo);
await settle();
await settle();
check(N.countdowns.has(silo.id) && prop(silo, "zt:stage") === 1 && log.sounds.includes("zt.nuke.siren"), "LAUNCH: a siren, and the countdown");
// it can be stopped
runTicks(40);
press("Nuke Silo", "ABORT LAUNCH");
N.onInteract(player, silo);
await settle();
check(!N.countdowns.has(silo.id) && prop(silo, "zt:stage") === 0 && prop(silo, "zt:payload") === 1, "aborted: it stops, still loaded");
N.begin(silo);
const beeps0 = log.sounds.filter((s) => s === "zt.nuke.beep").length;
const flights0 = N.flights().length;
runTicks(N.CFG.countdown * 20 - 2);
check(log.sounds.filter((s) => s === "zt.nuke.beep").length - beeps0 >= N.CFG.countdown - 1 &&
  log.messages.some((m) => m.startsWith("[title] §c3")), "ten seconds of beeps, counted down on the screen");
check(N.flights().length === flights0, "(not yet)");
runTicks(3);
const rocket = ow.getEntities({ type: N.ROCKET })[0];
check(!!rocket && prop(rocket, "zt:kind") === 0, "then Little Boy rises out of the silo");
check(prop(silo, "zt:payload") === 0 && prop(silo, "zt:stage") === 0 && log.sounds.includes("zt.nuke.launch"), "with a roar, leaving it empty");
const flight = N.flights()[0];
const due = Math.round(N.CFG.flightSeconds(700) * 20);
check(!!flight && flight.x === 0 && flight.z === 700 && Math.abs(flight.at - (world.getAbsoluteTime() + due)) <= 3,
  `on its way: ${(due / 20).toFixed(1)} seconds to go 700 blocks`);
runTicks(40);
check(rocket.location.y > 80 && log.particles.includes("zt:launch_smoke"), `climbing (${rocket.location.y.toFixed(0)}) out of a cloud of smoke`);
runTicks(N.CFG.climbTicks);
check(!rocket.valid, "and out of sight");

// =============================================================================================
console.log("what it hits");
// things to see change: near the silo (where leaves burn), round the watcher (ash), near the
// victim (glass shatters), past the blast (nothing)
const tree = (x, z) => {
  for (let y = 64; y < 68; y++) setBlock(ow, x, y, z, "minecraft:oak_log");
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) setBlock(ow, x + dx, 67, z + dz, "minecraft:oak_leaves");
  setBlock(ow, x + 2, 64, z, "minecraft:poppy");
  setBlock(ow, x - 2, 63, z, "minecraft:grass_block");
  setBlock(ow, x, 64, z + 2, "minecraft:glass");
};
tree(8, 8);          // 700 from ground zero: burnt
tree(8, 508);        // 200: ash
tree(8, 2708);       // 2000: glass shatters
tree(8, 3500);       // 2800: past it all
// mobs to feel the shockwave, at 600, 1500, 2400 and 2600 blocks
const dummies = [600, 1500, 2400, 2600].map((d) => {
  const e = ow.spawnEntity("minecraft:villager_v2", { x: 40.5, y: 64, z: 700 - d + 0.5 });
  e.getComponent("minecraft:health").max = 5000;
  e.getComponent("minecraft:health").setCurrentValue(5000);
  return { e, d: Math.hypot(40, d) };
});
const lost = (e) => 5000 - e.getComponent("minecraft:health").currentValue;
// the fall
const left = flight.at - world.getAbsoluteTime();
runTicks(left - N.CFG.fallTicks + 2);
const bomb = ow.getEntities({ type: N.ROCKET })[0];
check(!!bomb && prop(bomb, "zt:falling") === true && bomb.location.y > 150, `a player near the target sees it falling (from ${bomb?.location.y.toFixed(0)})`);
check(log.sounds.includes("zt.nuke.whistle"), "and hears the whistle");
const fades = { p: player.cameraLog.length, w: watcher.cameraLog.length, v: victim.cameraLog.length };
const victimHp = victim.getComponent("minecraft:health").currentValue;
runTicks(N.CFG.fallTicks + 2, () => N.sites().length > 0);
const site = N.sites()[0];
check(!!site && site.x === 0 && site.z === 700 && site.y === 64 && site.g === 64 && site.s === 1, `it hits the ground and goes off (${JSON.stringify(site)})`);
check(!bomb.valid && N.flights().length === 0, "(the bomb's gone, its flight over)");
check(player.cameraLog.length > fades.p && watcher.cameraLog.length > fades.w && victim.cameraLog.length > fades.v, "a flash: everyone in sight is dazzled");
const t0 = system.currentTick;
check(victim.getComponent("minecraft:health").currentValue === victimHp, "the shockwave hasn't reached the far players yet");
runTicks(Math.floor(1500 / N.CFG.wave) - 4);
check(lost(dummies[0].e) > 0 && lost(dummies[1].e) === 0, "it runs out at the speed of sound: 600 blocks off it's struck, 1500 not yet");
runTicks(10);
check(lost(dummies[1].e) > 0, "then 1500");
runTicks(Math.ceil(2700 / N.CFG.wave) - (system.currentTick - t0) + 3);
check(dummies.every(({ e, d }) => lost(e) === N.blastDamage(N.PAYLOADS["zt:little_boy"], d)),
  `less the farther out: ${dummies.map(({ e }) => lost(e)).join(", ")} damage at 600, 1500, 2400 and 2600 blocks`);
check(lost(dummies[3].e) === 0, "and nothing past its 2500 blocks");
const vh = victimHp - victim.getComponent("minecraft:health").currentValue;
check(vh === N.blastDamage(N.PAYLOADS["zt:little_boy"], 2000) && victim.knockbacks.length > 0, `the player 2000 blocks off is hit for ${vh} and thrown`);
check(log.sounds.includes("zt.nuke.blast") && log.sounds.includes("zt.nuke.rumble"), "the boom near, a rumble far off");
check(log.commands.some((c) => c.startsWith("camerashake add @s")), "the ground shakes");
check(watcher.getComponent("minecraft:health").currentValue === 20, "(a player in creative is spared)");

// =============================================================================================
console.log("the mushroom cloud");
runTicks(20);
for (const p of [player, watcher, victim]) {
  const mine = N.cloudsOf(p.id);
  const c = mine[0]?.entity;
  if (!c) {
    check(false, p.name + " is shown a cloud");
    continue;
  }
  const eye = p.getHeadLocation();
  const foot = { x: 0.5, y: 64, z: 700.5 };
  const d = Math.hypot(foot.x - eye.x, foot.y - eye.y, foot.z - eye.z);
  const off = Math.hypot(c.location.x - eye.x, c.location.y - prop(c, "zt:lift") - eye.y, c.location.z - eye.z);
  const k = Math.min(1, N.CFG.proxyDist / d);
  const toward = ((c.location.z - eye.z) / off) * ((foot.z - eye.z) / d) > 0.99 || d < N.CFG.proxyDist;
  check(mine.length === 1 && Math.abs(off - Math.min(d, N.CFG.proxyDist)) < 0.6 && toward && Math.abs(prop(c, "zt:size") - 65 * k) < 0.05,
    `${p.name}, ${Math.round(d)} blocks off, is shown it ${off.toFixed(1)} blocks away, toward ground zero, ${(k * 100).toFixed(1)}% its size`);
  check(prop(c, "zt:visible") === false && c.overrides?.get(p.id + "|zt:visible") === true, `only ${p.name} sees theirs`);
}
check(log.particleAt.some((q) => q.id === "zt:nuke_smoke" && q.player === victim.id && q.vars["variable.scale"] < 0.1), "smoke rolls out from its foot");
const age1 = prop(N.cloudsOf(player.id)[0].entity, "zt:age");
runTicks(200);
const age2 = prop(N.cloudsOf(player.id)[0].entity, "zt:age");
check(Math.abs(age2 - age1 - 10) < 0.6, `it grows with its age (${age1.toFixed(1)} s, then ${age2.toFixed(1)})`);
// moving, the cloud keeps its place on the horizon
player.teleport({ x: 300.5, y: 64, z: 2.5 });
runTicks(2);
const c1 = N.cloudsOf(player.id)[0].entity;
const eye1 = player.getHeadLocation();
check(Math.abs(Math.atan2(c1.location.x - eye1.x, c1.location.z - eye1.z) - Math.atan2(0.5 - eye1.x, 700.5 - eye1.z)) < 0.01,
  "walking away, theirs stays between them and it");
player.teleport({ x: 2.5, y: 64, z: 2.5 });

// =============================================================================================
console.log("ash");
runTicks(120);
check(N.processed(site, 8, 508), "the chunks round each player are seen to");
check(blockId(ow, 8, 64, 508) === N.ASH && blockId(ow, 8, 67, 508) === N.ASH && blockId(ow, 7, 63, 508) === N.ASH && blockId(ow, 8, 64, 510) === N.ASH,
  "200 blocks from ground zero, all turns to ash: the tree, the ground, the glass");
check(blockId(ow, 9, 67, 508) === "minecraft:air" && blockId(ow, 10, 64, 508) === "minecraft:air", "its leaves and flowers burn away");
const deep = N.ashDepthAt(N.PAYLOADS["zt:little_boy"], 197 - 16 * 0.71);
check(deep > N.CFG.ashDepth && blockId(ow, 3, 63 - deep, 503) === N.ASH && blockId(ow, 3, 62 - deep, 503) === "minecraft:stone",
  `the ash goes ${deep} blocks deep there (deeper toward ground zero)`);
check(blockId(ow, 8, 64, 8) === "minecraft:oak_log" && blockId(ow, 9, 67, 8) === "minecraft:air" && blockId(ow, 10, 64, 8) === "minecraft:air" &&
  blockId(ow, 6, 63, 8) === "minecraft:dirt" && blockId(ow, 8, 64, 10) === "minecraft:air" && blockId(ow, 3, 63, 3) === "minecraft:stone",
  "700 blocks off: leaves, flowers and grass burnt, glass shattered; logs and stone still stand");
check(blockId(ow, 8, 64, 2710) === "minecraft:air" && blockId(ow, 9, 67, 2708) === "minecraft:oak_leaves" && blockId(ow, 6, 63, 2708) === "minecraft:grass_block",
  "2000 blocks off: only the glass shatters");
victim.teleport({ x: 0.5, y: 64, z: 3500.5 });
runTicks(60);
check(blockId(ow, 8, 64, 3502) === "minecraft:glass" && blockId(ow, 9, 67, 3500) === "minecraft:oak_leaves" && blockId(ow, 10, 64, 3500) === "minecraft:poppy",
  "past the blast, nothing");
// ground zero (the watcher walks in)
watcher.teleport({ x: 0.5, y: 64, z: 700.5 });
runTicks(120);
const craterAt = (d) => {
  const depth = N.PAYLOADS["zt:little_boy"].depth * (1 - (d / N.PAYLOADS["zt:little_boy"].crater) ** 2);
  return 64 - depth;
};
check(blockId(ow, 0, 60, 700) === "minecraft:air" && blockId(ow, 0, 51, 700) === "minecraft:air" && blockId(ow, 0, 49, 700) === N.ASH,
  "at ground zero, a crater fourteen blocks deep, lined with ash");
check(blockId(ow, 20, 59, 700) === "minecraft:air" && blockId(ow, 20, Math.round(craterAt(20.5)) - 2, 700) === N.ASH && blockId(ow, 40, 63, 700) === N.ASH,
  "shallower toward its rim; beyond, ash");
// a chunk not loaded until later
unloadedChunks.add("10,40");
watcher.teleport({ x: 165.5, y: 64, z: 645.5 });
runTicks(100);
check(!N.processed(site, 165, 645) && blockId(ow, 165, 63, 645) === "minecraft:stone", "a chunk that isn't loaded waits");
const late = ow.spawnEntity("minecraft:cow", { x: 166.5, y: 64, z: 646.5 });
unloadedChunks.delete("10,40");
runTicks(60);
check(N.processed(site, 165, 645) && blockId(ow, 165, 63, 645) === N.ASH, "and turns to ash when it's loaded");
check(!late.valid || late.getComponent("minecraft:health").currentValue <= 0, "what was in it then dies as it would have");
// each chunk is seen to once, even when the world is opened again
runTicks(200);
const fills = log.filled;
N.reload();
runTicks(60);
check(N.processed(site, 165, 645) && N.pending() === 0 && log.filled === fills, "each chunk only once, remembered when the world is opened again");

// =============================================================================================
console.log("radiation");
const lvl = (x, z) => R.levelAt("minecraft:overworld", { x, z });
const away = (d) => lvl(0.5, 700.5 + d);
check(away(0) === 5 && away(250) === 5 && away(450) === 4 && away(900) === 3 && away(1500) === 2 && away(2500) === 1 && away(3100) === 0,
  `lower the farther out: ${[0, 250, 450, 900, 1500, 2500, 3100].map((d) => R.LEVELS[away(d)]).join(", ")}`);
// a survivor in High
const sam = new Player(ow, { x: 900.5, y: 64, z: 700.5 });
sam.name = "Jo";
ow.entities.push(sam);
const samSlots = sam.components["minecraft:equippable"].slots;
const samHp = sam.getComponent("minecraft:health");
runTicks(200);
check(sam.effectInfo.hunger?.amplifier === 2 && sam.effectInfo.weakness?.amplifier === 1 && sam.effectInfo.nausea && sam.effectInfo.mining_fatigue,
  `High: hunger, weakness, nausea, mining fatigue (${Object.keys(sam.effectInfo).join(", ")})`);
check(sam.damageTaken >= 2, `and it hurts (${sam.damageTaken} in ten seconds)`);
check(log.commands.some((c) => c === "fog @s push zt:nuclear_haze zt_fallout"), "a haze in the air");
// the detector
samSlots.Mainhand = new ItemStack(R.DETECTOR, 1);
m0 = log.messages.length;
runTicks(41);
check(said(m0, /\[actionbar\] §lRadiation: §cHIGH/) && log.sounds.includes("zt.geiger.3"), "held, the detector reads HIGH, clicking");
m0 = log.messages.length;
world.afterEvents.itemUse.fire({ source: sam, itemStack: samSlots.Mainhand });
check(said(m0, /Nearest blast: Little Boy, 90\d blocks to the west/), "used, it tells where the blast was");
// the suit
for (const [slot, id] of Object.entries(R.HAZMAT)) samSlots[slot] = new ItemStack(id, 1);
sam.effectInfo = {};
sam.effects = [];
samHp.setCurrentValue(20);
const hurt0 = sam.damageTaken;
runTicks(200);
check(Object.keys(sam.effectInfo).length === 0 && sam.damageTaken === hurt0, "in a whole Hazmat suit, High does nothing");
m0 = log.messages.length;
runTicks(10);
check(said(m0, /Hazmat 4\/4 §a\(protected\)/), "(the detector says so)");
// in DANGER the suit isn't enough, and wears out
sam.teleport({ x: 100.5, y: 64, z: 700.5 });
runTicks(200);
check(sam.effectInfo.hunger?.amplifier === 1 && !sam.effectInfo.nausea, "in DANGER, a suit lets through Medium");
check(samSlots.Head.getComponent("minecraft:durability").damage >= 9, `and wears out (${samSlots.Head.getComponent("minecraft:durability").damage} points)`);
check(log.commands.some((c) => c === "fog @s push zt:nuclear_ash zt_fallout"), "(in the ash zone, thick with ash)");
check(log.particleAt.some((q) => q.id === "zt:ash_fall" && q.player === sam.id), "ash falling all round");
// part of a suit lets more in
samSlots.Head = undefined;
samSlots.Feet = undefined;
sam.teleport({ x: 900.5, y: 64, z: 700.5 });
sam.effectInfo = {};
runTicks(60);
check(sam.effectInfo.hunger?.amplifier === 1 && sam.effectInfo.weakness?.amplifier === 0 && !sam.effectInfo.nausea, "half a suit: High feels like Medium");
// out of it
sam.teleport({ x: 4000.5, y: 64, z: 700.5 });
runTicks(40);
check(log.commands.at(-1) === "fog @s remove zt_fallout" || log.commands.includes("fog @s remove zt_fallout"), "out of it, the air clears");
// mobs
const cow = ow.spawnEntity("minecraft:cow", { x: 100.5, y: 64, z: 760.5 });
watcher.teleport({ x: 100.5, y: 64, z: 740.5 });
runTicks(200);
check(!cow.valid || cow.getComponent("minecraft:health").currentValue <= 0, "a cow in DANGER dies of it");

// =============================================================================================
console.log("Radiation Zombies");
R.CFG.convertChance = 1;
const zed = ow.spawnEntity("minecraft:zombie", { x: 110.5, y: 64, z: 760.5 });
runTicks(400, () => !zed.valid);
check(!zed.valid, "a zombie in DANGER dies of it");
runTicks(40);
const risen = ow.getEntities({ type: R.ZOMBIE }).find((z) => Math.hypot(z.location.x - 110.5, z.location.z - 760.5) < 1);
check(!!risen && log.particles.includes("zt:radiation_splash"), "and rises again, a Radiation Zombie");
check((risen?.getComponent("minecraft:health")?.currentValue ?? 0) === 30, "(which radiation doesn't hurt)");
R.CFG.convertChance = 0;
const zed2 = ow.spawnEntity("minecraft:zombie", { x: 120.5, y: 64, z: 760.5 });
runTicks(400, () => !zed2.valid);
runTicks(40);
check(!ow.getEntities({ type: R.ZOMBIE }).some((z) => Math.hypot(z.location.x - 120.5, z.location.z - 760.5) < 1), "(not every one)");
const zed3 = ow.spawnEntity("minecraft:zombie", { x: 4000.5, y: 64, z: 760.5 });
R.CFG.convertChance = 1;
zed3.applyDamage(100, { cause: "entityAttack", damagingEntity: player });
runTicks(40);
check(!ow.getEntities({ type: R.ZOMBIE }).some((z) => Math.hypot(z.location.x - 4000.5, z.location.z - 760.5) < 1), "a zombie killed otherwise stays dead");
risen?.remove();
// far from the fallout: its hit leaves radiation
const rz = ow.spawnEntity(R.ZOMBIE, { x: 5000.5, y: 64, z: 5000.5 });
sam.teleport({ x: 5000.5, y: 64, z: 5003.5 });
for (const slot of ["Head", "Chest", "Legs", "Feet"]) samSlots[slot] = undefined;
sam.effectInfo = {};
runTicks(5);
sam.applyDamage(4, { cause: "entityAttack", damagingEntity: rz });
runTicks(41);
check(R.reading(sam).dose === R.CFG.hitDose.level && R.reading(sam).env === 0 && sam.effectInfo.hunger?.amplifier === 2,
  "its hit leaves High radiation in you, though there's none about");
runTicks(R.CFG.hitDose.ticks);
check(R.reading(sam).raw === 0, "for a few seconds");
// and it spits at what's out of reach
sam.teleport({ x: 5000.5, y: 64, z: 5012.5 });
sam.getComponent("minecraft:health").setCurrentValue(20);
const anims0 = log.animations.length;
let spat;
runTicks(30, () => {
  spat = Bullets.flying().find((b) => b.type === Bullets.SPIT);
  return !!spat;
});
check(log.animations.slice(anims0).some(([id, a]) => id === rz.id && a === "animation.zt.radiation_zombie.spit") && !!spat && spat.owner === rz,
  "12 blocks off, it spits");
const samHurt = sam.damageTaken;
runTicks(20);
check(sam.damageTaken - samHurt === R.CFG.spit.damage && R.reading(sam).dose === R.CFG.spitDose.level, "the spit hits: it hurts, and it's radioactive");
// not through a wall, nor at what's in reach
for (let y = 64; y < 68; y++) for (let x = 4998; x <= 5003; x++) setBlock(ow, x, y, 5007, "minecraft:stone");
runTicks(R.CFG.spit.cooldown + 20);
const n0 = Bullets.flying().filter((b) => b.type === Bullets.SPIT).length;
runTicks(40);
check(Bullets.flying().filter((b) => b.type === Bullets.SPIT).length === n0, "it doesn't spit through a wall");
sam.teleport({ x: 5000.5, y: 64, z: 5003 });
runTicks(60);
check(Bullets.flying().filter((b) => b.type === Bullets.SPIT).length === n0, "nor at what's in its reach");
rz.remove();

// =============================================================================================
console.log("time and more blasts");
const s0 = N.sites()[0];
const t00 = s0.t;
s0.t = world.getAbsoluteTime() - 5 * 24000;
check(away(900) === 2 && away(1600) === 0, "five days on, the fallout has shrunk by half");
s0.t = world.getAbsoluteTime() - 10 * 24000;
check(away(0) === 0, "after ten, it's gone");
s0.t = t00;
// a second blast beside the first: worse where they overlap
const s1 = N.detonate(1, ow, { x: 3000.5, y: 64, z: 700.5 }, true);
check(lvl(1500, 700) > Math.max(away(1500), 2), `where fallouts overlap it's worse (${R.LEVELS[lvl(1500, 700)]})`);
runTicks(400);
// =============================================================================================
console.log("the Missile Silo");
const msilo = ow.spawnEntity(N.MISSILE_SILO, { x: 9000.5, y: 64, z: 0.5 });
player.teleport({ x: 9002.5, y: 64, z: 2.5 });
player.setGameMode(GameMode.Survival);
player.getComponent("minecraft:health").setCurrentValue(20);
runTicks(2);
slots.Mainhand = new ItemStack("zt:fat_man", 1);
m0 = log.messages.length;
N.onInteract(player, msilo);
check(prop(msilo, "zt:payload") === 0 && said(m0, /Nuke Silo/), "a nuke won't go in a Missile Silo");
slots.Mainhand = undefined;
inv.addItem(new ItemStack("zt:doomsday_missile", 1));
press("Missile Silo", "Load Doomsday Missile");
N.onInteract(player, msilo);
await settle();
check(prop(msilo, "zt:payload") === 3 && !inv.getItem(0), "the Doomsday Missile loads from the inventory");
msilo.setDynamicProperty("zt:target", JSON.stringify({ x: 9000, y: 64, z: 600 }));
press("Missile Silo", "Open Doors");
N.onInteract(player, msilo);
await settle();
runTicks(N.CFG.doorTicks);
N.begin(msilo);
runTicks(N.CFG.countdown * 20 + 5);
const mf = N.flights().at(-1);
check(mf?.k === 2, "launched");
// (the world closed and opened mid-flight)
N.reload();
check(N.flights().some((f) => f.id === mf.id), "its flight is remembered when the world is opened again");
player.teleport({ x: 9000.5, y: 64, z: 1500.5 });
runTicks(N.CFG.flightSeconds(600) * 20 + 40, () => N.sites().some((s) => s.k === 2));
const ms = N.sites().find((s) => s.k === 2);
check(!!ms && ms.x === 9000 && ms.z === 600, "it comes down where it was aimed");
check(R.levelAt("minecraft:overworld", { x: 9000, z: 600 }) === 0, "a missile, not a nuke: it leaves no fallout");
player.teleport({ x: 9150.5, y: 64, z: 600.5 });
runTicks(120);
check(blockId(ow, 9150, 63, 600) === N.ASH && N.blastDamage(N.PAYLOADS["zt:doomsday_missile"], 1600) === 0,
  "but 150 blocks off is ash, and it reaches 1500");
player.teleport({ x: 9260.5, y: 64, z: 600.5 });
runTicks(120);
check(blockId(ow, 9260, 63, 600) === "minecraft:stone", "(its ash zone: 200 blocks)");

// =============================================================================================
console.log("picking a silo up");
const before = inv.getItem(0)?.typeId;
press("Missile Silo", "Close Doors");
N.onInteract(player, msilo);
await settle();
runTicks(5);
press("Missile Silo", "Pick Up Silo");
N.onInteract(player, msilo);
await settle();
check(!msilo.valid && [...Array(36).keys()].some((i) => inv.getItem(i)?.typeId === N.MISSILE_SILO), `empty and shut, it can be picked up (${before})`);

console.log("commands");
system.afterEvents.scriptEventReceive.fire({ id: "zt:nuke", message: "clear", sourceEntity: player });
check(N.sites().length === 0 && away(0) === 0, "/scriptevent zt:nuke clear: no more fallout");
runTicks(5);
check(ow.getEntities({ type: N.CLOUD }).length === 0, "and no more clouds");

trace(s1.id);
check(warnings.length === 0, "no script warnings" + (warnings.length ? ": " + warnings.slice(0, 3).join(" | ") : ""));
console.log(failures === 0 ? "ALL GOOD" : failures + " FAILED");
process.exit(failures === 0 ? 0 : 1);
