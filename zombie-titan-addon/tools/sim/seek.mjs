// Door 30 (the Seek chase) simulation: the corridor with the first eyes, the long hallway
// where Seek rises, ten rooms built ahead as you run (crawl spaces, three-door rooms, the
// jog, the furniture), the last hall's hands and burning chandeliers, the Guiding Light
// shutting the last door, and being caught.
//   node tools/sim/run.mjs seek
import { GameMode, InputPermissionCategory, ItemStack, log, Player, runTicks, unloadedChunks, world } from "@minecraft/server";
import { ui } from "@minecraft/server-ui";

const warnings = [];
console.warn = (...a) => {
  warnings.push(a.join(" "));
  if (process.env.ZT_TRACE) process.stderr.write("WARN " + a.join(" ") + "\n");
};

await import("./scripts/main.js");
const Doors = await import("./scripts/doors_common.js");
const Chase = await import("./scripts/doors_seek.js");

const ow = world.getDimension("overworld");
let failures = 0;
function check(cond, msg) {
  if (cond) console.log("  ok   " + msg);
  else {
    failures++;
    console.log("  FAIL " + msg);
  }
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const only = (type) => ow.getEntities({ type });
ui.answer = (form) => (form.titleText.includes("Seek") ? { canceled: false, selection: 0 } : { canceled: true });

async function buildChase(p) {
  world.afterEvents.itemUse.fire({ source: p, itemStack: new ItemStack("zt:door_30") });
  await settle();
  runTicks(1);
  const run = [...Doors.runs.values()].find((r) => r.owner === p.id);
  runTicks(400, () => run?.phase === "ready" && run.data.rooms[2].built);
  return run;
}

/** Walk a player down the corridor and the hallway until the chase begins. */
function walkToSeek(run, players) {
  const fr = run.frame;
  const hall = run.data.rooms[1];
  let f = -1.5;
  runTicks(600, () => {
    f += 0.2;
    players.forEach((p, i) => {
      p.location = fr.at(i * 0.8 - 0.4, 0, f - i * 0.6);
    });
    return run.phase !== "ready" || f > hall.f1;
  });
}

console.log("building the hotel");
const player = new Player(ow, { x: 0.5, y: 64, z: 0.5 });
const buddy = new Player(ow, { x: 1.3, y: 64, z: 0.5 });
ow.entities.push(player, buddy);
player.rotation = { x: 0, y: 0 };
const run = await buildChase(player);
check(!!run && run.kind === "seek" && run.phase === "ready", "Door 30 asks, then builds the hotel");
const d = run.data;
const fr = run.frame;
const blk = (r, u, f) => ow.getBlock(fr.cell(r, u, f)).typeId;
check(d.rooms.length === 12, "a corridor, the hallway, eight more rooms, the last hall and a way out");
check(d.rooms.filter((r) => r.kind === "three").length === 3 && d.rooms.filter((r) => r.kind === "crawl").length === 3,
  "three rooms with three doors, three with fallen shelves to crawl under");
check(d.rooms[0].built && d.rooms[1].built && d.rooms[2].built && !d.rooms[4].built, "only the first rooms are built at first");
check(ow.getBlock(fr.cell(0, 1, 5)).isAir && blk(3, 2, 5).startsWith("zt:hotel_wall") && blk(0, -1, 5) === "zt:hotel_floor",
  "a hotel corridor: floor, papered walls");
check(blk(-1, 0, 10) === "minecraft:barrier", "door 30 is shut");
check(only("zt:hotel_door").some((e) => e.props["zt:plate"] === 1), "with its number plate (0030)");
const eyes0 = only("zt:seek_eye").length;
check(eyes0 >= 10, "eyes are already watching from the walls (" + eyes0 + ")");
check(d.rooms[1].kind === "hall" && d.rooms[1].f1 - d.rooms[1].f0 >= 30, "a long hallway");
check(only("zt:hotel_door").length >= 2 && !log.messages.some((m) => m.includes("couldn't")) && !warnings.length,
  "every block of the first rooms went in, and their doors are up");

console.log("Seek rises");
walkToSeek(run, [player, buddy]);
check(run.phase === "intro", "at the end of the hallway the chase begins");
const seek = only("zt:seek")[0];
check(!!seek && seek.spawnEvent === "zt:as_level" && seek.props["zt:anim"] === 1, "Seek rises out of its puddle");
check(player.cameraOn && player.permissions[InputPermissionCategory.Movement] === false, "the camera turns back to watch");
check(player.getGameMode() === GameMode.Adventure && buddy.getGameMode() === GameMode.Adventure, "both players are in");
check(blk(-1, 0, 10) === "minecraft:barrier", "door 30 slammed behind");
runTicks(70, () => run.phase === "live");
runTicks(2);
check(run.phase === "live" && seek.props["zt:anim"] === 2, "then it runs");
check(player.music === "zt.music.seek_chase", "the chase music starts");
check(!!player.getEffect("saturation"), "you won't go hungry from sprinting");
check(!player.cameraOn && player.permissions[InputPermissionCategory.Movement] === true, "you can run");
const bars = only("zt:seek_bar");
check(bars.length === 2, "each player gets Seek's bar");
const bar0 = bars[0].components["minecraft:health"].currentValue;
check(bar0 > 80, "the bar: almost all of the chase still to go (" + bar0.toFixed(0) + "%)");

console.log("the chase");
const line = d.line;
let sBot = Chase.progressOf(line, fr.local(player.location));
const fin = d.rooms[d.rooms.length - 2];
let blockedByDoor = 0;
let rattled = false;
let handsOut = 0;
let fireFelt = false;
let buddyGrabbed = false;
world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (deadEntity === buddy) buddyGrabbed = true;
});
let minGap = Infinity;
let barLate = 100;
let tick = 0;
let crouchTicks = 0;
runTicks(2400, () => {
  tick++;
  // crouch under fallen shelves, sprint everywhere else
  const here = Chase.pointAt(line, sBot);
  const crawling = d.rooms.some((r) => r.shelves.some((s) => Math.abs(here.f - (s.f + 0.5)) < 1.1 && Math.abs(here.r - (r.c + s.gap + 1)) < 1.5));
  const speed = crawling ? 1.3 : 5.6;
  if (crawling) crouchTicks++;
  player.isSneaking = crawling;
  player.isSprinting = !crawling;
  sBot += speed / 20;
  const p = Chase.pointAt(line, sBot);
  let r = p.r;
  // in the last hall, step around the burning chandeliers the way the light shows
  if (p.f > fin.f0 && p.f < fin.f1) {
    for (const L of d.lights) if (Math.abs(p.f - L.f) < 2.6) r = fin.c + (Math.floor(L.f) % 2 === 0 ? -1.8 : 1.8);
  }
  const loc = fr.at(r, 0, p.f);
  // a door must be open before you can go through it
  for (const room of d.rooms) {
    if (room.door && !room.door.open && Math.abs(p.f - (room.exit.f + 0.5)) < 0.6 && Math.abs(r - (room.exit.r + 1)) < 1.2) blockedByDoor++;
  }
  player.location = loc;
  // the buddy follows, then in the last hall gets too close to a window
  if (!buddy.dead) {
    const handWin = d.hands.find((h) => h.out && Math.abs(p.f - (h.w.f + 1)) < 4);
    if (handWin && p.f > fin.f0 + 10) {
      buddy.location = fr.at(handWin.face + (handWin.w.side < 0 ? 0.8 : -0.8), 0, handWin.w.f + 1);
    } else buddy.location = fr.at(r, 0, p.f - 0.8);
  }
  // try a wrong door once
  const three = d.rooms.find((rm) => rm.kind === "three");
  if (!rattled && three.fakeDoors?.length && p.f > three.f1 - 1.5 && p.f < three.f1) {
    const fake = three.fakeDoors[0];
    const n = log.sounds.length;
    player.location = Doors.doorCenter(run, fake);
    player.location = { ...player.location, y: player.location.y - 1.5 };
    runTicks(1);
    rattled = log.sounds.slice(n).includes("zt.doors.locked") && !fake.open;
    player.location = loc;
  }
  handsOut = d.hands.filter((h) => h.out).length;
  if (d.lights.some((L) => L.state === 2) && log.particles.includes("zt:chandelier_fire")) fireFelt = true;
  const gap = Chase.progressOf(line, fr.local(player.location)) - d.s;
  if (run.phase === "live") minGap = Math.min(minGap, gap);
  const b = only("zt:seek_bar").find((e) => dist(e.location, player.location) < 2);
  if (b) barLate = b.components["minecraft:health"].currentValue;
  return run.phase !== "live" || player.dead;
});
check(!player.dead, "sprinting, crouching where the light shows, you outrun Seek (closest: " + minGap.toFixed(1) + " blocks)");
check(crouchTicks > 0, "you had to crouch under fallen bookshelves");
check(blockedByDoor === 0, "every right door was open when you reached it");
check(rattled, "a wrong door just rattles: it's locked");
check(d.rooms.every((r) => r.built), "every room was built ahead of you");
check(d.rooms.slice(0, 6).every((r) => !r.ents?.length), "the eyes behind you are gone");
check(handsOut >= 2, "black hands burst through the windows of the last hall (" + handsOut + ")");
check(log.sounds.includes("zt.seek.hands") && log.particles.includes("zt:glass_burst"), "...shattering the glass");
check(d.lights.every((L) => L.state === 2), "every chandelier came crashing down");
check(fireFelt, "and burned on the floor");
check(buddyGrabbed, "your friend went too close to a window and was dragged out");
check(log.messages.some((m) => m.includes("dragged away by Seek's hands")) || buddy.getDynamicProperty("zt:doors_death") === "hands",
  "...by Seek's hands");
check(barLate < 15, "the bar emptied as the chase ran out (" + barLate.toFixed(0) + "%)");

console.log("the last door");
check(run.phase === "ending", "through the last door: it slams shut");
check(fin.door && !fin.door.open && blk(fin.exit.r, 0, fin.exit.f) === "minecraft:barrier", "the Guiding Light shut it on Seek");
check(log.messages.some((m) => m.includes("You survived Seek")), "you survived Seek!");
runTicks(15);
check(!seek.valid, "Seek is gone");
check(player.music === null, "the music stops");
runTicks(90);
check(!Doors.runs.has(run.id), "the run is over");
check(dist(player.location, run.start.loc) < 0.01 && player.getGameMode() === GameMode.Survival, "home again, in your own game mode");
check(only("zt:seek_eye").length === 0 && only("zt:seek_hand").length === 0, "the eyes and hands are gone");

console.log("caught");
const slow = new Player(ow, { x: 600.5, y: 64, z: 0.5 });
ow.entities.push(slow);
const run2 = await buildChase(slow);
walkToSeek(run2, [slow]);
runTicks(70, () => run2.phase === "live");
let died = false;
world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (deadEntity === slow) died = true;
});
let s2 = Chase.progressOf(run2.data.line, run2.frame.local(slow.location));
let frozen = 0;
runTicks(1200, () => {
  // frozen with fear for several seconds, then walking
  if (frozen++ < 160) return died;
  s2 += 4.3 / 20;
  const p = Chase.pointAt(run2.data.line, s2);
  slow.location = run2.frame.at(p.r, 0, p.f);
  return died;
});
check(died, "stop to look, and Seek catches you");
check(log.messages.some((m) => m.includes("SEEK")), "a jumpscare");
runTicks(5);
check(!Doors.runs.has(run2.id) && slow.music === null, "the chase ends with you");
const n = log.messages.length;
if (process.env.ZT_TRACE) console.log("death key", slow.getDynamicProperty("zt:doors_death"));
slow.respawn({ x: 600.5, y: 64, z: -30 });
runTicks(260);
if (process.env.ZT_TRACE) console.log(log.messages.slice(n));
check(log.messages.slice(n).some((m) => m.includes("You died to who you call Seek")), "the Guiding Light speaks");
check(slow.getGameMode() === GameMode.Survival, "your game mode is back");

console.log("Seek from a spawn egg");
const p3 = new Player(ow, { x: -700.5, y: 64, z: 0.5 });
ow.entities.push(p3);
const wild = ow.spawnEntity("zt:seek", { x: -700.5, y: 64, z: 1.2 });
let killed = false;
world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (deadEntity === p3) killed = true;
});
runTicks(25);
check(killed && wild.valid, "it kills a player it catches");

console.log("an area that won't load");
const p5 = new Player(ow, { x: 5000.5, y: 64, z: 0.5 });
ow.entities.push(p5);
p5.rotation = { x: 0, y: 0 };
let m0 = log.messages.length;
const fresh = () => log.messages.slice(m0);
world.afterEvents.itemUse.fire({ source: p5, itemStack: new ItemStack("zt:door_30") });
await settle();
const run5 = [...Doors.runs.values()].find((r) => r.owner === p5.id);
// the hallway's far end unloads before it is built
const hall5 = run5.data.rooms[1];
const far = run5.frame.cell(hall5.c, 0, hall5.f1);
unloadedChunks.add(`${Math.floor(far.x / 16)},${Math.floor(far.z / 16)}`);
runTicks(200);
check(run5.data.rooms[0].built && !run5.data.rooms[1].built && run5.phase === "building" && !fresh().some((m) => m.includes("is ready")),
  "the first room goes up; the hallway waits for its area to load");
unloadedChunks.clear();
runTicks(200, () => run5.phase === "ready");
check(run5.phase === "ready" && run5.data.rooms[1].built && fresh().some((m) => m.includes("is ready")), "once it loads, the hotel is finished");
Doors.endRun(run5, "test over");
check(run5.data.buildBusy && run5.data.rooms[2].building, "(a room was still going up when that level ended)");
runTicks(20);
check(!run5.data.rooms[2].built && !(run5.data.rooms[2].ents?.length), "an ended level's build stops, and its room isn't furnished");
m0 = log.messages.length;
world.afterEvents.itemUse.fire({ source: p5, itemStack: new ItemStack("zt:door_30") });
await settle();
const run6 = [...Doors.runs.values()].find((r) => r.owner === p5.id);
const far6 = run6.frame.cell(run6.data.rooms[1].c, 0, run6.data.rooms[1].f1);
unloadedChunks.add(`${Math.floor(far6.x / 16)},${Math.floor(far6.z / 16)}`);
runTicks(1300, () => run6.phase === "over");
check(run6.phase === "over" && Doors.pendingRunOf(p5) === undefined && fresh().some((m) => m.includes("couldn't finish building")),
  "if it never loads, the level gives up after a minute and says why (so you can start another)");
unloadedChunks.clear();

console.log("");
if (warnings.length) {
  console.log("script warnings:");
  for (const w of warnings.slice(0, 20)) console.log("  " + w);
}
console.log(failures === 0 && warnings.length === 0 ? "ALL GOOD" : `${failures} failures, ${warnings.length} warnings`);
process.exit(failures === 0 && warnings.length === 0 ? 0 : 1);
