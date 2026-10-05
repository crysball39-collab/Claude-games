// Door 50 (the Library) simulation: building the room, door 50, the opening scene, the
// Figure's hearing and its "how safe are you" meter, its deadly touch, the books, the
// solution paper, the padlock, the escape, and dying to it.
//   node tools/sim/run.mjs library
import { GameMode, InputPermissionCategory, ItemStack, log, Player, runTicks, world } from "@minecraft/server";
import { ui } from "@minecraft/server-ui";

const warnings = [];
console.warn = (...a) => {
  warnings.push(a.join(" "));
  if (process.env.ZT_TRACE) process.stderr.write("WARN " + a.join(" ") + "\n");
};

await import("./scripts/main.js");
const Doors = await import("./scripts/doors_common.js");
const Fig = await import("./scripts/figure.js");

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
const since = (n) => log.messages.slice(n);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const only = (type) => ow.getEntities({ type });

ui.answer = (form) => (form.titleText.includes("Library") ? { canceled: false, selection: 0 } : { canceled: true });

/** Build a Library in front of a player and wait for it. */
async function buildLibrary(p) {
  world.afterEvents.itemUse.fire({ source: p, itemStack: new ItemStack("zt:door_50") });
  world.afterEvents.itemStartUse.fire({ source: p, itemStack: new ItemStack("zt:door_50") });
  await settle();
  runTicks(1);
  const run = [...Doors.runs.values()].find((r) => r.owner === p.id);
  runTicks(400, () => run?.phase === "ready");
  return run;
}

console.log("building the Library");
const player = new Player(ow, { x: 0.5, y: 64, z: 0.5 });
ow.entities.push(player);
player.rotation = { x: 0, y: 0 };
const run = await buildLibrary(player);
check(!!run && run.kind === "library", "Door 50 asks, then builds the Library");
check(run?.phase === "ready", "the Library is finished");
check(ui.shown.filter((s) => s.form.titleText.includes("Library")).length === 1, "one confirmation, though both use events fired");
const fr = run.frame;
const blk = (r, u, f) => ow.getBlock(fr.cell(r, u, f)).typeId;
check(fr.local(player.location).f < -1 && Math.abs(fr.local(player.location).r) <= 0.5, "it is built in front of the player");
check(blk(-16, 2, 20) === "zt:library_shelf" && blk(15, 1, 30) === "zt:library_shelf", "bookshelves line the walls");
check(blk(-13, 2, 15) === "zt:library_shelf" && blk(12, 3, 26) === "zt:library_shelf" && blk(0, 2, 15) === "minecraft:air",
  "rows of shelves with an open aisle up the middle");
check(blk(-12, 0, 12) === "minecraft:dark_oak_planks", "the librarian's desk, on the left");
check(blk(-14, 3, 37) === "minecraft:dark_oak_stairs" && blk(13, 6, 40) === "minecraft:dark_oak_stairs", "two staircases up to the balcony");
check(blk(0, 6, 44) === "minecraft:dark_oak_planks" && blk(0, 7, 41) === "minecraft:dark_oak_fence", "a balcony with a railing");
check(blk(0, 3, 4) === "minecraft:air" && blk(3, 2, 4).startsWith("zt:hotel_wall"), "a hotel corridor before door 50");
check(blk(-1, 0, 8) === "minecraft:barrier" && blk(0, 2, 8) === "minecraft:barrier", "door 50 is shut");
check(blk(-1, 7, 49) === "minecraft:barrier", "door 51 is shut");
const doors = only("zt:hotel_door");
check(doors.length === 2, "two hotel doors");
const door50 = doors.find((d) => d.props["zt:plate"] === 12);
const door51 = doors.find((d) => d.props["zt:plate"] === 13);
check(!!door50 && !!door51 && door51.props["zt:locked"] && !door50.props["zt:locked"], "door 50 and door 51 (padlocked)");
const books = only("zt:library_book");
check(books.length === 10, "ten books on the shelves");
let onShelves = 0;
for (const b of books) {
  const l = fr.local(b.location);
  const dir = { r: 0, f: 0 };
  const yaw = ((Math.round(b.rotation.y - fr.yaw) % 360) + 360) % 360;
  if (yaw === 0) dir.f = 1;
  else if (yaw === 180) dir.f = -1;
  else if (yaw === 90) dir.r = 1;
  else dir.r = -1;
  const behind = blk(Math.floor(l.r - dir.r * 0.6), Math.floor(l.u + 0.1), Math.floor(l.f - dir.f * 0.6));
  const front = ow.getBlock(fr.cell(Math.floor(l.r + dir.r * 0.6), Math.floor(l.u + 0.1), Math.floor(l.f + dir.f * 0.6)));
  if (behind === "zt:library_shelf" && front.isAir) onShelves++;
}
check(onShelves === 10, "each book sits on a bookshelf's face, facing an aisle (" + onShelves + ")");
check(only("zt:library_paper").length === 1 && only("zt:library_lamp").length === 1, "the solution paper and the lamp");

console.log("door 50, and the Figure");
player.location = fr.at(0, 0, 6.6);
runTicks(2);
check(door50.props["zt:open"] && blk(-1, 0, 8) === "minecraft:air", "door 50 opens as you walk up");
player.location = fr.at(-0.3, 0, 10.2);
runTicks(1);
check(run.phase === "intro", "stepping into the library starts the scene");
check(player.getGameMode() === GameMode.Adventure, "you play in Adventure mode (no breaking the walls)");
check(player.permissions[InputPermissionCategory.Movement] === false && player.cameraOn, "the camera takes over");
check(blk(-1, 0, 8) === "minecraft:barrier" && !door50.props["zt:open"], "door 50 slams shut behind you");
const fig = only("zt:figure")[0];
check(!!fig && fig.spawnEvent === "zt:as_level", "the Figure appears (steered by the script)");
const lamp = only("zt:library_lamp")[0];
let roared = false;
runTicks(200, () => {
  if (fig.props["zt:act"] === 2) roared = true;
  return run.phase === "live";
});
check(roared, "it roars");
check(lamp.props["zt:fallen"] && log.particles.includes("zt:glass_burst"), "a lamp crashes to the floor");
check(run.phase === "live" && player.permissions[InputPermissionCategory.Movement] === true && !player.cameraOn,
  "the scene ends and you can move again");
check(dist(fig.location, lamp.location) < 4.5, "the Figure ran to the crash (" + dist(fig.location, lamp.location).toFixed(1) + ")");
check(dist(fig.location, player.location) > 3, "...and didn't run into you");
check(log.messages.some((m) => m.includes("Crouch")), "you are told to crouch");

console.log("the meter: how safe are you");
const brain = Fig.brainOf(fig);
const now = () => world.getAbsoluteTime() - 100000;
const bar = () => only("zt:figure_bar")[0];
// the pure meter, in the four cases
const at = (l) => fr.at(l.r, l.u, l.f);
const quietBrain = { ...brain, state: "patrol", heard: new Map(), lastHeardBy: undefined };
player.location = at({ r: 0, u: 0, f: 12 });
fig.location = at({ r: 0, u: 0, f: 40 });
const low = Fig.danger(quietBrain, fig, player, now());
fig.location = at({ r: 0, u: 0, f: 18 });
const mid = Fig.danger(quietBrain, fig, player, now());
const chasing = { ...brain, state: "hunt", heard: new Map([[player.id, now()]]), lastHeardBy: player.id };
fig.location = at({ r: 0, u: 0, f: 30 });
const high = Fig.danger(chasing, fig, player, now());
fig.location = at({ r: 0, u: 0, f: 17 });
const max = Fig.danger(chasing, fig, player, now());
check(low < 30, "far away and can't hear you: low (" + low.toFixed(0) + ")");
check(mid >= 40 && mid <= 62, "close, but can't hear you: the middle (" + mid.toFixed(0) + ")");
check(high >= 68 && high < 90, "not close, but coming after your noise: high (" + high.toFixed(0) + ")");
check(max === 100, "hears you, close, and coming: full (" + max + ")");
check(!!bar() && bar().components["minecraft:health"].max === 100, "the meter is a boss bar (The Figure) that follows you");

// in play: crouching is silent
fig.location = at({ r: 0, u: 0, f: 19.5 });
brain.state = "patrol";
brain.path = [];
brain.stateUntil = now() + 400;
brain.heard.clear();
player.location = at({ r: -0.5, u: 0, f: 12 });
player.isSneaking = true;
runTicks(1);
let heard = false;
let k = 0;
runTicks(20, () => {
  k++;
  player.location = at({ r: -0.5, u: 0, f: 12 + 0.06 * k });
  if (brain.state === "hunt") heard = true;
});
check(!heard, "it doesn't hear you creep along crouching");
const midBar = bar().components["minecraft:health"].currentValue;
check(midBar >= 38 && midBar <= 64, "the bar sits in the middle while it's close (" + midBar.toFixed(0) + ")");
// walking is not
player.isSneaking = false;
let start = { ...player.location };
k = 0;
runTicks(3, () => {
  k++;
  player.location = { x: start.x + 0.2 * k * fr.F.x, y: start.y, z: start.z + 0.2 * k * fr.F.z };
});
check(brain.state === "hunt" && brain.lastHeardBy === player.id, "walking: it hears you and comes");
// out of reach: dive behind the shelves and crouch
player.isSneaking = true;
player.location = at({ r: -15, u: 0, f: 18 });
runTicks(1);
runTicks(60, () => brain.state !== "hunt");
check(brain.state === "search", "it reaches where it heard you, and listens");
check(dist(fig.location, player.location) > 4, "...but you have moved away");

console.log("its touch");
const cow = ow.spawnEntity("minecraft:cow", { ...fig.location });
const titan = ow.spawnEntity("zt:zombie_titan", { ...fig.location });
const seek = ow.spawnEntity("zt:seek", { ...fig.location });
runTicks(2);
check(!cow.valid, "a cow that touches it dies");
check(titan.valid && seek.valid, "but not a titan, nor Seek");
titan.valid = false;
seek.valid = false;

console.log("the books, the paper and the padlock");
const d = run.data;
const book = only("zt:library_book")[0];
let n = log.messages.length;
world.afterEvents.playerInteractWithEntity.fire({ player, target: book });
const inv = player.getComponent("minecraft:inventory").container;
const bookItem = inv.slots.find((it) => it?.typeId.startsWith("zt:book_"));
check(!book.valid && !!bookItem, "taking a book puts it in your inventory");
const shape = bookItem.typeId.slice(8);
check(bookItem.nameTag.includes(String(d.digits[shape])) && bookItem.lockMode === "inventory",
  "the book shows its shape and digit (" + bookItem.nameTag + ")");
check(since(n).some((m) => m.includes("[title]") && m.includes("= " + d.digits[shape])), "...in big letters");
for (const b of only("zt:library_book")) world.afterEvents.playerInteractWithEntity.fire({ player, target: b });
check(d.found.size === 10 && only("zt:library_book").length === 0, "all ten books found");
const paper = only("zt:library_paper")[0];
world.afterEvents.playerInteractWithEntity.fire({ player, target: paper });
await settle();
const paperForm = ui.shown.filter((s) => s.form.titleText === "Solution Paper").pop();
check(!paper.valid && inv.slots.some((it) => it?.typeId === "zt:solution_paper"), "taking the solution paper");
check(!!paperForm && paperForm.form.items.filter((i) => i.type === "button").length === 5 &&
  paperForm.form.items.every((i) => i.type !== "button" || i.icon.startsWith("textures/items/zt_book_")),
"it shows the five shapes of the code, in order, with pictures");
const code = d.code.map((s) => d.digits[s]).join("");
const wrong = code === "00000" ? "11111" : "00000";
ui.answer = (form) => (form.titleText === "Padlock" ? { canceled: false, formValues: [undefined, undefined, wrong] } : { canceled: true });
n = log.messages.length;
world.afterEvents.playerInteractWithEntity.fire({ player, target: door51 });
await settle();
check(since(n).some((m) => m.includes("doesn't open")) && door51.props["zt:locked"], "a wrong code doesn't open it");
check(ui.shown.some((s) => s.form.titleText === "Padlock" && s.form.items.some((i) => i.type === "label" && i.text.includes("="))),
  "the padlock shows what you know");
ui.answer = (form) => (form.titleText === "Padlock" ? { canceled: false, formValues: [undefined, undefined, code.split("").join(" ")] } : { canceled: true });
world.afterEvents.playerInteractWithEntity.fire({ player, target: door51 });
await settle();
check(!door51.props["zt:locked"] && door51.props["zt:open"] && blk(-1, 8, 49) === "minecraft:air", "the right code opens door 51");
check(brain.state === "rage", "...and the Figure comes running");

console.log("escape");
player.location = at({ r: -0.5, u: 7, f: 51.5 });
runTicks(2);
check(run.phase === "ending" && blk(-1, 7, 49) === "minecraft:barrier", "door 51 slams behind you");
check(log.messages.some((m) => m.includes("escaped the Library")), "you escaped the Library");
runTicks(90);
check(!Doors.runs.has(run.id), "the run is over");
check(dist(player.location, run.start.loc) < 0.01, "you are taken back to where you used the item");
check(player.getGameMode() === GameMode.Survival, "your own game mode is back");
check(!inv.slots.some((it) => it && (it.typeId.startsWith("zt:book_") || it.typeId === "zt:solution_paper")),
  "the books and the paper are gone");
check(!fig.valid && only("zt:figure_bar").length === 0, "the Figure and its meter are gone");
check(blk(-1, 0, 8) === "minecraft:air" && blk(-1, 7, 49) === "minecraft:air", "the empty library's doors stand open");

console.log("dying to it");
ui.answer = (form) => (form.titleText.includes("Library") ? { canceled: false, selection: 0 } : { canceled: true });
const p2 = new Player(ow, { x: 300.5, y: 64, z: 0.5 });
ow.entities.push(p2);
p2.rotation = { x: 0, y: 90 };
p2.gameMode = GameMode.Creative;
const run2 = await buildLibrary(p2);
check(run2?.phase === "ready", "a second Library, facing another way");
const fr2 = run2.frame;
p2.location = fr2.at(-0.3, 0, 10.2);
runTicks(1);
check(p2.getGameMode() === GameMode.Adventure, "creative players play in Adventure mode too");
runTicks(200, () => run2.phase === "live");
const fig2 = only("zt:figure").find((f) => f.getDynamicProperty("zt:run") === run2.id);
// stomp around until it finds you
let died = false;
world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (deadEntity === p2) died = true;
});
const base = fr2.local(p2.location);
k = 0;
runTicks(400, () => {
  k++;
  p2.location = fr2.at(base.r + Math.sin(k / 10) * 1.5, 0, base.f + 1.5 + Math.cos(k / 10) * 1.5);
  return died;
});
check(died, "walking around noisily, the Figure finds you and kills you");
check(log.messages.some((m) => m.includes("THE FIGURE")), "a jumpscare");
runTicks(5);
check(!Doors.runs.has(run2.id) && !fig2.valid, "with nobody left, the run ends");
n = log.messages.length;
p2.respawn({ x: 0, y: 64, z: 0 });
runTicks(260);
check(since(n).some((m) => m.includes("You died to who you call The Figure")), "the Guiding Light speaks when you respawn");
check(since(n).some((m) => m.includes("Crouch")), "...with advice");
check(p2.getGameMode() === GameMode.Creative, "your creative mode is given back");

console.log("a Figure from a spawn egg");
const p3 = new Player(ow, { x: -400.5, y: 64, z: 0.5 });
ow.entities.push(p3);
const wild = ow.spawnEntity("zt:figure", { x: -400.5, y: 64, z: 12.5 });
runTicks(25);
start = { ...p3.location };
k = 0;
runTicks(12, () => {
  k++;
  p3.location = { x: start.x, y: 64, z: start.z + 0.2 * k };
});
check(only("zt:figure_lure").length === 1, "it hears you walking and heads for the sound");
check(only("zt:figure_bar").some((b) => dist(b.location, p3.location) < 2), "you get its meter too");
check(wild.valid, "it is still there");

console.log("");
if (warnings.length) {
  console.log("script warnings:");
  for (const w of warnings.slice(0, 20)) console.log("  " + w);
}
console.log(failures === 0 && warnings.length === 0 ? "ALL GOOD" : `${failures} failures, ${warnings.length} warnings`);
process.exit(failures === 0 && warnings.length === 0 ? 0 : 1);
