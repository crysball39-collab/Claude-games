// The Lobby and Floor 1 (the Hotel) simulation: building the Lobby, riding an elevator down,
// the reception and the key to door 1, rooms built ahead as you go (every one can be walked
// through from door to door), locked doors and their keys, drawers with gold and items,
// hiding in closets and under beds, Hide, Rush, Screech, the crucifix, then on through the
// Seek chases, the Library, Jeff's shop, the Infirmary's skull lock, the Courtyard and the
// Greenhouse to door 100's lever, key, switches, breaker puzzle and the elevator.
//   node tools/sim/run.mjs floor1
import { GameMode, InputPermissionCategory, ItemStack, log, Player, runTicks, world } from "@minecraft/server";
import { ui } from "@minecraft/server-ui";

const warnings = [];
console.warn = (...a) => {
  warnings.push(a.join(" "));
  if (process.env.ZT_TRACE) process.stderr.write("WARN " + a.join(" ") + "\n");
};

await import("./scripts/main.js");
const Doors = await import("./scripts/doors_common.js");
const Hotel = await import("./scripts/doors_hotel.js");
const Floor = await import("./scripts/doors_floor1.js");
const Mobs = await import("./scripts/doors_mobs.js");
const Lobby = await import("./scripts/doors_lobby.js");
const Seek = await import("./scripts/doors_seek.js");

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
const trace = (...a) => process.env.ZT_TRACE && console.log("    ..", ...a);

/** The answer to each form: the Lobby's confirmation and the elevator's floor list. */
let answer = (form) => {
  if (form.titleText.includes("Lobby")) return { canceled: false, selection: 0 };
  if (form.titleText === "Elevator") return { canceled: false, selection: 0 };
  return { canceled: true };
};
ui.answer = (form, p) => answer(form, p);

// ---------------------------------------------------------------- the Lobby
console.log("the Lobby");
const player = new Player(ow, { x: 0.5, y: -60, z: 0.5 });
player.name = "Alex";
const buddy = new Player(ow, { x: 1.5, y: -60, z: 0.5 });
buddy.name = "Sam";
ow.entities.push(player, buddy);
player.rotation = { x: 0, y: 0 };
world.afterEvents.itemUse.fire({ source: player, itemStack: new ItemStack("zt:doors_floor1") });
world.afterEvents.itemStartUse.fire({ source: player, itemStack: new ItemStack("zt:doors_floor1") });
await settle();
runTicks(300, () => Lobby.allLobbies().length > 0 && Lobby.allLobbies()[0].ready);
const lobby = Lobby.allLobbies()[0];
check(!!lobby && lobby.ready, "the item asks, then builds the Lobby");
check(ui.shown.filter((s) => s.form.titleText.includes("Lobby")).length === 1, "one confirmation, though both use events fired");
const L = lobby.fr;
const lblk = (r, u, f) => ow.getBlock(L.cell(r, u, f)).typeId;
check(lblk(0, -1, 10) === "zt:hotel_floor" && lblk(-12, 1, 2) === "zt:hotel_wainscot" && lblk(0, 3, 10) === "minecraft:air",
  "a grand hall in front of you");
trace("lobby doors", JSON.stringify(lobby.cars.map((c) => [c.door?.open, c.door?.id])), Lobby.allLobbies().length, lobby.refreshed, lobby.ready);
check(lobby.cars.length === 8 && lobby.cars.filter((c) => c.side === "l").length === 4, "eight elevators, four down each side");
check(only("zt:elevator_door").length === 8 && lobby.cars.every((c) => c.door?.open), "their doors stand open");
check(lblk(-14, 0, 5) === "minecraft:air" && lblk(13, 0, 13) === "minecraft:air" && lblk(-12, 0, 5) === "minecraft:air",
  "you can walk into each car");
check(only("zt:chandelier").length === 2 && only("zt:couch").length === 4, "chandeliers and couches");
check(JSON.parse(world.getDynamicProperty("zt:lobbies")).length === 1, "the Lobby is remembered (for when the world is reopened)");

console.log("the elevator");
const car = lobby.cars[0];
const carSpot = (k) => L.at(car.box[0] + 1.5 + k, 0, car.f + 1.5 + k * 0.5);
const n0 = ui.shown.length;
player.location = carSpot(0);
buddy.location = carSpot(1);
runTicks(10);
const asked = ui.shown.slice(n0).filter((s) => s.form.titleText === "Elevator");
check(asked.length === 2, "stepping in, each of you is asked where to go");
check(asked[0].form.items.some((i) => i.text.includes("The Hotel")), "...The Hotel, Floor 1");
await settle();
runTicks(60, () => car.state === "riding");
check(car.state === "riding" && !car.door.open, "the doors shut and it goes down");
const run = [...Doors.runs.values()].find((r) => r.kind === "floor1");
check(!!run && run.data.phase === "ride", "the run begins");
const d = run.data;
const fr = run.frame;
const blk = (r, u, f) => ow.getBlock(fr.cell(r, u, f)).typeId;
check(player.music === "zt.music.elevator" && buddy.music === "zt.music.elevator", "elevator music plays");
check(player.permissions[InputPermissionCategory.Movement] === false, "you ride it out");
check(player.getGameMode() === GameMode.Adventure && buddy.getGameMode() === GameMode.Adventure, "both of you, in Adventure mode");
check(d.rooms.length === 101 && d.rooms[0].kind === "reception" && d.rooms[100].kind === "door100", "rooms 0 to 100, planned");
check(d.rooms[30].seg === "seek1" && d.rooms[50].seg === "lib" && d.rooms[52].kind === "shop" && d.rooms[65].seg === "seek2",
  "Seek at 30 and 60, the Library at 50, Jeff's shop at 52");
check(d.rooms[80].kind === "infirmary" && d.rooms[89].kind === "courtyard" && d.rooms.slice(90, 100).every((r) => r.kind === "greenhouse"),
  "the Infirmary at 80, the Courtyard at 89, the Greenhouse from 90");
check(d.rooms.slice(53, 88).filter((r) => !r.seg && r.kind !== "infirmary").every((r) => r.style === "abandoned"),
  "past the shop, the hotel is falling apart");
check([27, 28, 57, 58].every((n) => d.rooms[n].eyes > 0), "eyes on the walls before each Seek");
for (let n = 1; n < 100; n++) {
  const a = d.rooms[n - 1];
  const b = d.rooms[n];
  if (b.f0 !== a.f1 + 2 || b.entryR !== a.exitR) {
    check(false, `room ${n} starts right behind room ${n - 1}'s door (${a.f1} ${b.f0} ${a.exitR} ${b.entryR})`);
    break;
  }
}
runTicks(260);
check(run.data.phase === "ride" && d.rooms[0].built && d.rooms[1].built, "the reception and room 1 are built on the way down");
runTicks(60, () => d.phase === "live");
check(d.phase === "live" && run.phase === "live", "fifteen seconds later, you're there");
runTicks(20);
const local = (p) => fr.local(p.location);
check(local(player).f < -1 && local(player).f > -6 && Math.abs(local(player).r) < 3, "...in the reception's elevator");
check(player.permissions[InputPermissionCategory.Movement] === true && player.music === null, "you can move; the music stops");
check(d.carDoor?.open, "the elevator doors open");
check(car.state === "idle" && car.door.open, "back in the Lobby, that elevator is free again");

// ---------------------------------------------------------------- walking the hotel
let party = [player, buddy];
const screechSeen = new Set();
let rushesSeen = 0;
let rushHidden = 0;
/** Walk a player straight to a point (frame cells). Returns "rush" if the lights start flickering on the way. */
/** Hear a psst: turn and look at it (as a player would). */
function faceScreech(p) {
  const s = d.screech?.get(p.id);
  const e = s && s.phase === "lurk" ? world.getEntity(s.id) : undefined;
  if (!e) {
    delete p.getViewDirection;
    return;
  }
  const h = p.getHeadLocation();
  const at = { x: e.location.x, y: e.location.y + 0.5, z: e.location.z };
  p.getViewDirection = () => {
    const v = { x: at.x - h.x, y: at.y - h.y, z: at.z - h.z };
    const l = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / l, y: v.y / l, z: v.z / l };
  };
}
let screechLooked = 0;
function walk(p, to, speed = 5.0) {
  const target = fr.at(to.r, to.u, to.f);
  let result = "stuck";
  runTicks(4000, () => {
    if (d.screech?.get(p.id)?.phase === "lurk" && !screechSeen.has(d.screech.get(p.id).id)) {
      screechSeen.add(d.screech.get(p.id).id);
      screechLooked++;
      // a moment to react
      runTicks(10);
      faceScreech(p);
    } else if (p.getViewDirection && !d.screech?.get(p.id)) delete p.getViewDirection;
    if (d.rush?.phase === "warn" && !party.some((q) => Doors.isHidden(q))) {
      result = "rush";
      return true;
    }
    const at = p.location;
    const dd = dist(at, target);
    if (dd < 0.1) {
      result = "ok";
      return true;
    }
    const step = Math.min(dd, speed / 20);
    p.location = { x: at.x + ((target.x - at.x) * step) / dd, y: at.y + ((target.y - at.y) * step) / dd, z: at.z + ((target.z - at.z) * step) / dd };
    return false;
  });
  return result;
}
/** The room a player is in. */
const roomOf = (p) => Hotel.roomIndexAt(d, fr.local(p.location));
/** The lights flicker: everyone into a closet or under a bed until Rush has gone by, then out again. */
function hideFromRush() {
  rushesSeen++;
  const alive = party.filter((q) => !q.dead && run.players.get(q.id)?.status === "in");
  const taken = new Set();
  for (const q of alive) {
    const n = roomOf(q);
    const spots = [...d.spots.values()].filter((s) => !s.occupant && !taken.has(s.id) && Math.abs(s.room - n) <= 1)
      .sort((a, b) => dist(fr.at(a.at.r, a.at.u, a.at.f), q.location) - dist(fr.at(b.at.r, b.at.u, b.at.f), q.location));
    const s = spots[0];
    if (!s) continue;
    taken.add(s.id);
    const out = fr.vec(s.face);
    const reach = s.kind === "closet" ? 1.0 : 2.1;
    const at = fr.at(s.at.r, s.at.u, s.at.f);
    q.location = { x: at.x + out.x * reach, y: at.y, z: at.z + out.z * reach };
    world.afterEvents.playerInteractWithEntity.fire({ player: q, target: world.getEntity(s.id) });
  }
  if (alive.some((q) => Doors.isHidden(q))) rushHidden++;
  runTicks(900, () => !d.rush);
  for (const q of alive) {
    if (!Doors.isHidden(q)) continue;
    q.isSneaking = true;
    runTicks(2);
    q.isSneaking = false;
  }
}
/** Walk to a point, hiding from Rush on the way if need be. */
function go(p, to) {
  for (let tries = 0; tries < 6; tries++) {
    const r = walk(p, to);
    if (r === "rush") {
      hideFromRush();
      continue;
    }
    return r === "ok";
  }
  return false;
}
const passable = (id) => id === "minecraft:air" || id.endsWith("_carpet") || id.startsWith("minecraft:light_block") ||
  id === "minecraft:barrier" || id === "minecraft:web" || id === "minecraft:short_grass" || id === "minecraft:fern" ||
  id === "minecraft:poppy" || id === "minecraft:tall_grass";
/** Is the way through room n (its walkway) clear of anything solid, at feet and head height? */
function walkwayClear(n) {
  const room = d.rooms[n];
  const pts = Hotel.walkPoints(room, 0);
  const bad = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.r - a.r, b.f - a.f);
    for (let s = 0; s <= len; s += 0.25) {
      const r = a.r + ((b.r - a.r) * s) / (len || 1);
      const f = a.f + ((b.f - a.f) * s) / (len || 1);
      for (const off of [-0.3, 0.3]) {
        for (const u of [room.u0, room.u0 + 1]) {
          const id = blk(Math.floor(r + off), u, Math.floor(f));
          if (!passable(id)) bad.push(`${id} at ${Math.floor(r + off)},${u},${Math.floor(f)}`);
        }
      }
    }
  }
  return bad;
}
/** Find room n's key and open its door with it. */
function unlockWithKey(p, n) {
  const room = d.rooms[n];
  for (const [id, num] of d.keys) {
    if (num !== n + 1) continue;
    const e = world.getEntity(id);
    if (!e) continue;
    world.afterEvents.playerInteractWithEntity.fire({ player: p, target: e });
    break;
  }
  if (!Doors.countItem(p, "zt:room_key")) {
    for (const [id, dr] of d.drawers) {
      if (dr.key !== n + 1) continue;
      const e = world.getEntity(id);
      for (let k = 0; k < 3 && !Doors.countItem(p, "zt:room_key"); k++) world.afterEvents.playerInteractWithEntity.fire({ player: p, target: e });
    }
  }
  const had = Doors.countItem(p, "zt:room_key") > 0;
  world.afterEvents.playerInteractWithEntity.fire({ player: p, target: world.getEntity(room.door.id) });
  return had && !room.door.locked;
}
let keysUsed = 0;
const blockedRooms = [];
/** Walk through ordinary room n to its far door and through it into room n+1 (everyone else following). */
function passRoom(p, n) {
  const room = d.rooms[n];
  const others = party.filter((q) => q !== p && !q.dead);
  const pts = Hotel.walkPoints(room, 0);
  for (const pt of pts.slice(1, 3)) {
    if (!go(p, pt)) return false;
    for (const o of others) o.location = { ...p.location, x: p.location.x + 0.4 };
  }
  // up to the door
  const front = { r: room.exitR + 1, u: room.u0, f: room.f1 - 0.2 };
  if (!go(p, front)) return false;
  if (room.door?.locked) {
    if (unlockWithKey(p, n)) keysUsed++;
    else trace("could not unlock", n);
  }
  runTicks(200, () => room.door?.open);
  if (!room.door?.open) return false;
  if (!go(p, { r: room.exitR + 1, u: d.rooms[n + 1].u0, f: room.f1 + 2.2 })) return false;
  for (const o of others) o.location = { ...p.location, x: p.location.x + 0.4 };
  runTicks(2);
  return true;
}

console.log("the reception");
const rec = d.rooms[0];
check(blk(rec.c, -1, 5) === "zt:hotel_floor" && blk(rec.c + 3, 0, rec.f0 + 7) === "minecraft:dark_oak_planks",
  "a reception, its front desk on the right");
const door1 = rec.door;
check(door1 && door1.locked && door1.number === 1, "door 1 is locked");
const key1 = [...d.keys.entries()].find(([, n]) => n === 1);
const key1e = key1 && world.getEntity(key1[0]);
check(!!key1e && key1e.props["zt:style"] === 2 && fr.local(key1e.location).r > rec.c + 4, "its key hangs on the wall behind the desk");
{
  // the hanging key's model is 2.4-3.4 px behind the entity (toward the wall, +r here): it has to be
  // in front of the wall, and its tap box (0.5 wide) out in the room
  const kl = fr.local(key1e.location);
  const solid = (r) => !["minecraft:air", "zt:hotel_painting"].includes(blk(Math.floor(r), Math.floor(kl.u + 0.3), Math.floor(kl.f)));
  check(!solid(kl.r + 3.4 / 16) && !solid(kl.r - 0.25) && solid(kl.r + 0.5), "...in front of the wall, where you can reach it");
}
const m0 = log.messages.length;
go(player, { r: door1.cells[0] + 1, u: 0, f: rec.f1 - 0.3 });
runTicks(3);
check(!door1.open && log.messages.slice(m0).some((m) => m.includes("locked")), "walk up to it: it's locked");
world.afterEvents.playerInteractWithEntity.fire({ player, target: key1e });
check(Doors.countItem(player, "zt:room_key") === 1 && !key1e.valid, "you take the key");
world.afterEvents.playerInteractWithEntity.fire({ player, target: world.getEntity(door1.id) });
check(!door1.locked && Doors.countItem(player, "zt:room_key") === 0, "...and unlock door 1 with it");
runTicks(5);
check(door1.open && blk(door1.cells[0], 0, door1.cells[2]) === "minecraft:air", "door 1 opens as you reach it");
go(player, { r: rec.exitR + 1, u: 0, f: rec.f1 + 2.5 });
buddy.location = { ...player.location, x: player.location.x + 0.5 };
runTicks(60, () => d.rooms[2].built && d.rooms[3].built);
check(d.rooms[2].built && d.rooms[3].built && !d.rooms[5].built, "rooms are built ahead of you, a couple at a time");

console.log("rooms 1 to 26");
const kinds = new Set();
let locked = 0;
let walkway = [];
for (let n = 1; n <= 26; n++) {
  const room = d.rooms[n];
  runTicks(200, () => room.built);
  kinds.add(room.kind);
  if (room.locked) locked++;
  const bad = walkwayClear(n);
  if (bad.length) walkway.push(`room ${n} (${room.kind}): ${bad.slice(0, 2).join("; ")}`);
  if (bad.length) trace("room", n, JSON.stringify({ c: room.c, w: room.w, L: room.L, f0: room.f0, f1: room.f1, entryR: room.entryR, exitR: room.exitR, boxes: room.boxes, turnZ: room.turnZ }));
  if (!passRoom(player, n)) {
    blockedRooms.push(n);
    trace("stuck in room", n, room.kind, room.door?.locked, "busy", d.buildBusy, "building", d.rooms.slice(n - 1, n + 3).map((r) => [r.n, r.kind, !!r.built, !!r.building]), "lead", d.lead, "where", d.where?.map((x) => x.n));
    break;
  }
}
check(kinds.size >= 6, "many kinds of room (" + [...kinds].join(", ") + ")");
check(walkway.length === 0, "every room can be walked through from door to door" + (walkway.length ? ": " + walkway.slice(0, 3).join(" | ") : ""));
check(blockedRooms.length === 0, "you got through every door" + (blockedRooms.length ? " (stuck at " + blockedRooms + ")" : ""));
check(locked >= 2 && keysUsed === locked, `locked doors (${locked}), each opened with the key from its room`);
check(d.rooms.slice(1, 27).every((r) => r.ents === undefined || r.lamps?.length || r.dark), "rooms have lamps");
const wardrobes = only("zt:wardrobe").length + only("zt:hotel_bed").length;
check(!player.dead && !buddy.dead, "nobody died on the way");
check(rushesSeen === 0 || rushHidden === rushesSeen, `when the lights flickered (${rushesSeen} times), you hid until Rush had gone by`);
trace("spots", d.spots.size, "drawers", d.drawers.size, "ents", d.rooms.slice(1, 15).map((r) => r.ents?.length));
if (process.env.ZT_TRACE) {
  const counts = {};
  for (const e of ow.entities) if (e.valid) counts[e.typeId] = (counts[e.typeId] ?? 0) + 1;
  trace("entities", JSON.stringify(counts), "player dead", player.dead, "buddy dead", buddy.dead, log.messages.filter((m) => m.includes("RUSH") || m.includes("died")).slice(0, 5));
}
check(wardrobes > 0, "closets and beds to hide in (" + wardrobes + " around you)");

// ---------------------------------------------------------------- what's in the rooms
console.log("drawers");
const here = roomOf(player);
const dressers = [...d.drawers.entries()].filter(([id]) => world.getEntity(id));
check(dressers.length > 0, "dressers and cabinets with drawers to search");
const goldBefore = d.gold.get(player.id) ?? 0;
let opened = 0;
for (const [id, dr] of dressers) {
  const e = world.getEntity(id);
  for (let k = 0; k < dr.n; k++) world.afterEvents.playerInteractWithEntity.fire({ player, target: e });
  opened += dr.n;
  if (e.props["zt:drawers"] !== (1 << dr.n) - 1) check(false, "every drawer opened shows open (" + e.props["zt:drawers"] + ")");
}
const gold = (d.gold.get(player.id) ?? 0) - goldBefore;
const found = ["zt:lighter", "zt:flashlight", "zt:crucifix"].filter((t) => Doors.countItem(player, t) > 0);
check(opened > 3 && (gold > 0 || found.length), `searching ${opened} drawers: ${gold} gold` + (found.length ? " and " + found.join(", ") : ""));
check(log.messages.some((m) => m.includes("Gold §7(you have")), "gold shows as you pick it up");
const before = log.messages.length;
world.afterEvents.playerInteractWithEntity.fire({ player, target: world.getEntity(dressers[0][0]) });
check(log.messages.slice(before).some((m) => m.includes("Nothing left")), "an emptied dresser has nothing left");

console.log("hiding, and Hide");
const room = d.rooms[here];
const spot = [...d.spots.values()].find((s) => s.room === here && s.kind === "closet") ?? [...d.spots.values()].find((s) => s.kind === "closet");
const closet = world.getEntity(spot.id);
const cellBlock = (c) => ow.getBlock(fr.cell(c[0], c[1], c[2])).typeId;
check(spot.cells.every((c) => cellBlock(c) === "zt:collider"), "a closet stands on invisible blocks (you can't walk through it)");
world.afterEvents.playerInteractWithEntity.fire({ player, target: closet });
check(Doors.isHidden(player) && spot.occupant === player.id, "tap a closet: you hide in it");
check(spot.cells.every((c) => cellBlock(c) === "minecraft:air"), "...standing inside it");
check(player.permissions[InputPermissionCategory.LateralMovement] === false && player.permissions[InputPermissionCategory.Sneak] !== false,
  "you can't walk, but you can crouch (to get out)");
world.afterEvents.playerInteractWithEntity.fire({ player: buddy, target: closet });
check(!Doors.isHidden(buddy), "only one in a closet at a time");
const hp = player.getComponent("minecraft:health");
const hp0 = hp.currentValue;
const t0 = log.messages.length;
runTicks(205);
check(log.messages.slice(t0).some((m) => m.includes("GET OUT")) && log.particles.includes("zt:hide_eyes"),
  "ten seconds in: Hide's eyes, and GET OUT");
check(Doors.isHidden(player), "...you're still in");
runTicks(100);
check(!Doors.isHidden(player) && hp.currentValue === hp0 - 8, "five more: Hide throws you out, and it hurts (" + (hp0 - hp.currentValue) + ")");
check(spot.cells.every((c) => cellBlock(c) === "zt:collider") && player.permissions[InputPermissionCategory.LateralMovement] !== false,
  "out you come; the closet is solid again");
world.afterEvents.playerInteractWithEntity.fire({ player, target: closet });
check(!Doors.isHidden(player), "Hide won't let you hide again straight away");
runTicks(200);
world.afterEvents.playerInteractWithEntity.fire({ player, target: closet });
check(Doors.isHidden(player), "a while later you can");
runTicks(5);
player.isSneaking = true;
runTicks(3);
player.isSneaking = false;
check(!Doors.isHidden(player), "crouch to get out");
hp.setCurrentValue(20);
const bed = [...d.spots.values()].find((s) => s.kind === "bed" && world.getEntity(s.id));
if (bed) {
  world.afterEvents.playerInteractWithEntity.fire({ player: buddy, target: world.getEntity(bed.id) });
  check(Doors.isHidden(buddy) && buddy.cameraOn && !!buddy.getEffect("invisibility"), "under a bed: out of sight, looking out from under it");
  runTicks(5);
  buddy.isSneaking = true;
  runTicks(3);
  buddy.isSneaking = false;
  check(!Doors.isHidden(buddy) && !buddy.cameraOn && !buddy.getEffect("invisibility"), "...and out again");
}

console.log("Rush, and the crucifix");
const giveCrucifix = (p) => {
  const it = new ItemStack("zt:crucifix", 1);
  p.components["minecraft:equippable"].slots.Mainhand = it;
};
// the buddy holds up a crucifix; the player hides
const nRush = roomOf(player);
const lampsLit = (n) => (d.rooms[n].lamps ?? []).filter((l) => ow.getBlock(fr.cell(l.cell[0], l.cell[1], l.cell[2])).permutation.getState("zt:lit") === 1).length;
const lit0 = lampsLit(nRush);
Mobs.startRush(run, d, nRush, 0);
d.rush.at = world.getAbsoluteTime() - 100000;
check(d.rush?.phase === "warn" && log.sounds.includes("zt.rush.flicker"), "the lights flicker...");
check(log.sounds.includes("zt.rush.approach"), "...and something is coming, louder and louder");
let flickered = false;
runTicks(30, () => {
  if (lampsLit(nRush) < lit0) flickered = true;
});
check(lit0 === 0 || flickered, "...going off and on");
giveCrucifix(buddy);
const closet2 = [...d.spots.values()].find((s) => s.kind === "closet" && !s.occupant && world.getEntity(s.id) && Math.abs(s.room - nRush) <= 1);
const oc = fr.vec(closet2.face);
const cat = fr.at(closet2.at.r, closet2.at.u, closet2.at.f);
player.location = { x: cat.x + oc.x, y: cat.y, z: cat.z + oc.z };
world.afterEvents.playerInteractWithEntity.fire({ player, target: world.getEntity(closet2.id) });
check(Doors.isHidden(player), "you hide");
runTicks(140, () => d.rush?.phase === "pass");
check(d.rush?.phase === "pass" && only("zt:rush").length === 1, "seven seconds later Rush comes roaring through");
runTicks(40, () => log.sounds.includes("zt.rush.pass"));
check(log.sounds.includes("zt.rush.pass"), "...with a roar as it goes by");
runTicks(200, () => !d.rush || d.rush.phase === "banished");
check(!buddy.dead && Doors.countItem(buddy, "zt:crucifix") === 0 && log.particles.includes("zt:crucifix_chains"),
  "your friend held up the crucifix: chains drag Rush into the floor");
runTicks(80, () => !d.rush);
check(!d.rush && only("zt:rush").length === 0, "Rush is gone");
check(!player.dead, "you were safe in the closet");
player.isSneaking = true;
runTicks(3);
player.isSneaking = false;

console.log("Rush, and being caught out");
Mobs.startRush(run, d, roomOf(player), 0);
d.rush.at = world.getAbsoluteTime() - 100000;
world.afterEvents.playerInteractWithEntity.fire({ player, target: world.getEntity(closet2.id) });
let buddyDied = false;
world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (deadEntity === buddy) buddyDied = true;
});
runTicks(600, () => !d.rush);
check(buddyDied && !player.dead, "your friend stayed out in the open: Rush got them; you, hiding, it didn't");
check(log.messages.some((m) => m.includes("RUSH")), "...a jumpscare");
const broken = d.rooms.filter((r) => r.broken).map((r) => r.n);
check(broken.length > 0, "the rooms it went through are dark now, their lights burst (" + broken.join(", ") + ")");
player.isSneaking = true;
runTicks(3);
player.isSneaking = false;
buddy.respawn({ x: 0, y: -60, z: 0 });
runTicks(20);
check(dist(buddy.location, lobby.home.loc) < 1.0, "your friend comes back in the Lobby");
check(buddy.getGameMode() === GameMode.Survival, "...in their own game mode");
party = [player];

console.log("Screech");
const darkRoom = d.rooms[roomOf(player)];
darkRoom.dark = true;
d.screechBan?.clear();
Mobs.spawnScreech(run, d, player, world.getAbsoluteTime() - 100000);
const scr = only("zt:screech")[0];
check(!!scr && log.sounds.includes("zt.screech.psst"), "in the dark: psst...");
const lookAt = (p, e) => {
  const h = p.getHeadLocation();
  const yaw = (Math.atan2(-(e.location.x - h.x), e.location.z - h.z) * 180) / Math.PI;
  p.rotation = { x: 0, y: yaw };
  p.getViewDirection = () => {
    const v = { x: e.location.x - h.x, y: e.location.y + 0.5 - h.y, z: e.location.z - h.z };
    const l = Math.hypot(v.x, v.y, v.z);
    return { x: v.x / l, y: v.y / l, z: v.z / l };
  };
};
const hpS = hp.currentValue;
lookAt(player, scr);
runTicks(20);
check(!scr.valid && hp.currentValue === hpS && log.sounds.includes("zt.screech.scream"), "you look right at it: it screeches and leaves");
delete player.getViewDirection;
d.screechBan?.clear();
Mobs.spawnScreech(run, d, player, world.getAbsoluteTime() - 100000);
runTicks(70);
check(hp.currentValue === hpS - 8, "you don't: it bites (" + (hpS - hp.currentValue) + " damage)");
darkRoom.dark = false;
hp.setCurrentValue(20);

console.log("the lighter, and the dark");
const lighter = new ItemStack("zt:lighter", 1);
const head = player.getHeadLocation();
const headLight = () => ow.getBlock({ x: Math.floor(head.x), y: Math.floor(head.y), z: Math.floor(head.z) }).typeId;
// (the player's own fog commands: everyone's commands land in the same log)
const myCommands = [];
const runCommand0 = player.runCommand.bind(player);
player.runCommand = (c) => {
  myCommands.push(c);
  return runCommand0(c);
};
const fogs = () => myCommands.filter((c) => c.startsWith("fog "));
// (Rush smashed this room's lights earlier: light it again for this, then put it back)
const broken0 = darkRoom.broken;
const lamps0 = darkRoom.lamps;
darkRoom.broken = false;
darkRoom.lamps = [];
runTicks(2);
check(fogs().at(-1) === "fog @s remove zt_dark", "in a lit room you can see");
darkRoom.dark = true;
runTicks(2);
check(fogs().at(-1) === "fog @s push zt:dark_room zt_dark", "in a dark room the dark closes in (" + fogs().at(-1) + ")");
player.components["minecraft:equippable"].slots.Mainhand = lighter;
runTicks(4);
check(headLight().startsWith("minecraft:light_block"), "take out the lighter: it lights, light all around you (" + headLight() + ")");
check(fogs().at(-1) === "fog @s push zt:dark_lighter zt_dark", "...and it holds the dark back");
world.afterEvents.itemUse.fire({ source: player, itemStack: lighter });
runTicks(4);
check(!headLight().startsWith("minecraft:light_block") && fogs().at(-1) === "fog @s push zt:dark_room zt_dark",
  "use it: you close it, and it's dark again");
runTicks(12);
world.afterEvents.itemUse.fire({ source: player, itemStack: lighter });
runTicks(4);
check(headLight().startsWith("minecraft:light_block"), "use it again: lit");
runTicks(41);
check(lighter.getComponent("minecraft:durability").damage >= 2, "...burning its fuel");
player.components["minecraft:equippable"].slots.Mainhand = undefined;
runTicks(4);
check(!headLight().startsWith("minecraft:light_block"), "put it away and it goes out");
darkRoom.dark = false;
runTicks(2);
check(fogs().at(-1) === "fog @s remove zt_dark", "out of the dark, the fog lifts");
darkRoom.broken = broken0;
darkRoom.lamps = lamps0;

// ---------------------------------------------------------------- on to Seek
/** Through ordinary rooms from where the player is up to (not including) room `upTo`. */
function walkRooms(upTo, label) {
  const bad = [];
  let n = roomOf(player);
  for (; n < upTo; n++) {
    const room = d.rooms[n];
    if (room.seg) continue;
    runTicks(300, () => room.built);
    if (!room.built) {
      bad.push("room " + n + " never built");
      break;
    }
    const w = walkwayClear(n);
    if (w.length) bad.push(`room ${n} (${room.kind}): ${w.slice(0, 2).join("; ")}`);
    if (!passRoom(player, n)) {
      bad.push("stuck in room " + n + " (" + room.kind + ")");
      break;
    }
  }
  check(!bad.length && roomOf(player) === upTo, `${label}: every room walked through` + (bad.length ? ": " + bad.slice(0, 3).join(" | ") : ""));
  check(!player.dead, `${label}: still alive`);
  if (player.dead) trace("death", player.getDynamicProperty("zt:doors_death"), "room", roomOf(player), d.rooms[roomOf(player)]?.kind, "rush", JSON.stringify(d.rush ? { phase: d.rush.phase, room: d.rush.room } : null), log.messages.filter((m) => /RUSH|died|SEEK|FIGURE/.test(m)).slice(-4));
}

/** The Seek chase: through its corridor and hallway, then run, crouching under the shelves, to its last door. */
function runChase(chase, first) {
  const hall = chase.rooms[1];
  // the corridor and its door
  const ante = chase.rooms[0];
  go(player, { r: ante.entryC, u: d.rooms[first].u0, f: ante.f0 + 1 });
  go(player, { r: ante.exit.r + 1, u: d.rooms[first].u0, f: ante.f1 - 0.3 });
  runTicks(200, () => ante.door?.open);
  check(!!ante.door?.open, `door ${first + 1} opens`);
  const u = d.rooms[first].u0;
  go(player, { r: hall.c, u, f: hall.f0 + 2 });
  check(only("zt:seek_eye").length >= 10, "eyes everywhere");
  go(player, { r: hall.c, u, f: hall.f1 - 2 });
  runTicks(10, () => chase.phase !== "ready");
  check(chase.phase === "intro" && only("zt:seek").length === 1, "at the hallway's end, Seek rises");
  runTicks(80, () => chase.phase === "live");
  check(chase.phase === "live" && player.music === "zt.music.seek_chase", "...and the chase is on");
  const fr2 = chase.fr;
  let s = Seek.progressOf(chase.line, fr2.local(player.location));
  let blocked = 0;
  runTicks(3000, () => {
    if (chase.phase === "escaped" || player.dead) return true;
    const here = Seek.pointAt(chase.line, s);
    const crawling = chase.rooms.some((r) => r.shelves.some((sh) => Math.abs(here.f - (sh.f + 0.5)) < 1.1 && Math.abs(here.r - (r.c + sh.gap + 1)) < 1.5));
    player.isSneaking = crawling;
    player.isSprinting = !crawling;
    s += (crawling ? 1.3 : 5.6) / 20;
    const pt = Seek.pointAt(chase.line, s);
    let r = pt.r;
    const fin = Seek.finalRoom(chase);
    if (pt.f > fin.f0 && pt.f < fin.f1) for (const Lt of chase.lights) if (Math.abs(pt.f - Lt.f) < 2.6) r = fin.c + (Math.floor(Lt.f) % 2 === 0 ? -1.8 : 1.8);
    for (const room of chase.rooms) {
      if (room.door && !room.door.open && Math.abs(pt.f - (room.exit.f + 0.5)) < 0.6 && Math.abs(r - (room.exit.r + 1)) < 1.2) {
        blocked++;
        if (blocked % 200 === 1) trace("blocked at door", room.exit.number, room.kind, "next built", chase.rooms[room.index + 1]?.built, chase.nextBuilt?.(), "phase", chase.phase, "lead", d.lead);
        s -= (crawling ? 1.3 : 5.6) / 20;
        return false;
      }
    }
    player.location = fr2.at(r, 0, pt.f);
    if (s >= chase.line.total - 0.2) player.location = fr2.at(fin.exit.r + 1, 0, fin.exit.f + 2.2);
    return chase.phase === "escaped" || player.dead;
  });
  player.isSneaking = false;
  player.isSprinting = false;
  check(!player.dead, "you outran Seek" + (player.dead ? " (caught)" : ""));
  check(chase.phase === "escaped", "through the last door, it slams on Seek");
  runTicks(15);
  check(only("zt:seek").length === 0 && player.music === null, "Seek is gone, the music stops");
  check(blocked < 40, "doors were open when you got to them (" + blocked + " ticks waiting)");
}

console.log("rooms 27-28: eyes on the walls");
walkRooms(29, "rooms up to 28");
check(only("zt:seek_eye").length > 0, "Seek's eyes watch from the walls");
console.log("Seek (doors 30-40)");
runChase(d.seek1, 29);
check(roomOf(player) === 40, "you're in room 40");

console.log("rooms 40-48");
walkRooms(49, "rooms 40 to 48");

console.log("the Library (doors 49-51)");
const lib = d.lib;
runTicks(600, () => lib.built);
check(lib.built && lib.phase === "ready", "the Library is built ahead of you");
const r48 = d.rooms[48];
check(r48.door && r48.door.cells[2] === r48.f1 + 1 && d.libAt.f === r48.f1 + 2 && r48.door.number === 49, "door 49 leads into it");
// in through door 49, along the corridor to door 50
const libFr = lib.fr;
go(player, { r: d.libAt.c - 0.5, u: d.libAt.u, f: d.libAt.f + 6.8 });
runTicks(40, () => lib.door50?.open);
check(!!lib.door50?.open, "door 50 opens as you come");
player.location = libFr.at(-0.5, 0, 11.5);
runTicks(5);
check(lib.phase === "intro" && only("zt:figure").length === 1, "step in: the Figure is waiting");
runTicks(200, () => lib.phase === "live");
check(lib.phase === "live", "...and the hunt begins");
player.setGameMode(GameMode.Creative);
for (const e of only("zt:library_book")) world.afterEvents.playerInteractWithEntity.fire({ player, target: e });
world.afterEvents.playerInteractWithEntity.fire({ player, target: only("zt:library_paper")[0] });
check(lib.found.size === 10 && lib.paperTaken, "all ten books, and the paper");
const code = lib.code.map((sh) => lib.digits[sh]).join("");
answer = (form) => (form.titleText === "Padlock" ? { canceled: false, formValues: [code] } : { canceled: true });
world.afterEvents.playerInteractWithEntity.fire({ player, target: world.getEntity(lib.door51.id) });
await settle();
runTicks(2);
check(lib.unlocked && lib.door51.open, "the code opens door 51");
player.location = libFr.at(-0.5, 7, 52.5);
runTicks(5);
check(lib.phase === "escaped", "out through door 51: you escaped the Library");
player.setGameMode(GameMode.Adventure);
runTicks(20);
check(only("zt:figure").length === 0, "(the Figure stays behind)");
check(!!d.rooms[51].door, "door 52 is ahead");

console.log("Jeff's shop (room 52)");
const exitRoom = d.rooms[51];
go(player, { r: exitRoom.exitR + 1, u: exitRoom.u0, f: exitRoom.f1 - 0.3 });
runTicks(300, () => exitRoom.door?.open);
check(!!exitRoom.door?.open, "door 52 opens");
go(player, { r: exitRoom.exitR + 1, u: exitRoom.u0, f: exitRoom.f1 + 2.5 });
runTicks(100, () => d.rooms[52].built && only("zt:jeff").length > 0);
check(only("zt:jeff").length === 1 && only("zt:el_goblino").length === 1 && only("zt:bob").length === 1 && only("zt:shop_display").length === 1,
  "Jeff, El Goblino and Bob, and the goods on the counter");
const jeff = only("zt:jeff")[0];
d.gold.set(player.id, 450);
answer = (form) => (form.titleText === "Jeff Shop" ? { canceled: false, selection: 2 } : { canceled: true });
world.afterEvents.playerInteractWithEntity.fire({ player, target: jeff });
await settle();
check(ui.shown.some((s) => s.form.titleText === "Jeff Shop" && s.form.bodyText.includes("450")), "Jeff's shop: what's for sale, and your gold");
check(Doors.countItem(player, "zt:skeleton_key") === 1 && d.gold.get(player.id) === 50, "you buy a skeleton key (400 gold)");
answer = (form) => (form.titleText === "Jeff Shop" ? { canceled: false, selection: 3 } : { canceled: true });
world.afterEvents.playerInteractWithEntity.fire({ player, target: only("zt:el_goblino")[0] });
await settle();
check(d.gold.get(player.id) === 50 && log.messages.some((m) => m.includes("You need §6500 Gold")), "...but can't afford a crucifix");

console.log("the abandoned hotel (53-58)");
go(player, { r: d.rooms[52].exitR + 1, u: d.rooms[52].u0, f: d.rooms[52].f0 + 1 });
walkRooms(59, "rooms 52 to 58");
check(only("zt:flesh_pile").length > 0, "piles of flesh on the floor");
check(d.rooms.slice(53, 59).some((r) => r.style === "abandoned" && r.built), "torn wallpaper, everything knocked about");
console.log("Seek again (doors 60-70)");
runChase(d.seek2, 59);
check(roomOf(player) === 70, "you're in room 70");

console.log("rooms 70-79");
walkRooms(80, "rooms 70 to 79");

console.log("the Infirmary (80)");
const inf = d.rooms[80];
runTicks(100, () => inf.built);
check(inf.kind === "infirmary" && only("zt:hotel_bed").some((e) => e.props["zt:style"] === 1), "hospital beds");
check(!!d.sideDoor && d.sideDoor.locked && d.sideDoor.skull, "a side room behind a skull lock");
const sideE = world.getEntity(d.sideDoor.id);
check(sideE?.props["zt:number"] === -2 && sideE?.props["zt:skull"] === true, "...no number on its door");
const giveKey = new ItemStack("zt:room_key", 1);
player.components["minecraft:inventory"].container.addItem(giveKey);
world.afterEvents.playerInteractWithEntity.fire({ player, target: sideE });
const keyItem = player.components["minecraft:inventory"].container.slots.find((it) => it?.typeId === "zt:skeleton_key");
check(!d.sideDoor.locked && keyItem?.getComponent("minecraft:durability").damage === 1 && Doors.countItem(player, "zt:room_key") === 1,
  "the skeleton key opens it (one use left); the room key stays in your pocket");
const herb = d.herbId && world.getEntity(d.herbId);
check(!!herb, "inside: the Herb of Viridis");
world.afterEvents.playerInteractWithEntity.fire({ player, target: herb });
check(Doors.countItem(player, "zt:herb_of_viridis") === 1, "you take it");
world.afterEvents.itemUse.fire({ source: player, itemStack: new ItemStack("zt:herb_of_viridis") });
runTicks(12);
check(!!player.getEffect("speed") && !!player.getEffect("regeneration") && Doors.countItem(player, "zt:herb_of_viridis") === 0,
  "eat it: faster, and healing");
const rich = [...d.drawers.entries()].filter(([, dr]) => dr.room === 80 && dr.rich && dr.loot.every((x) => x.gold >= 40));
if (rich.length !== 2) trace("infirmary drawers", JSON.stringify([...d.drawers.values()].filter((dr) => dr.room === 80)));
check(rich.length === 2, "two cabinets full of gold");
walkRooms(81, "through the infirmary");

console.log("rooms 81-88");
walkRooms(89, "rooms 81 to 88");
check(d.rooms[88].door?.type === "zt:gate_door", "door 89 is an iron gate");

console.log("the Courtyard (89)");
walkRooms(90, "the courtyard");
check(only("zt:angel_statue").length === 1, "an angel statue among the graves");
const yard = d.rooms[89];
check(blk(yard.c - 8, yard.u0 - 3, yard.f0 + 5) === "minecraft:grass_block" && blk(yard.c - 8, yard.u0 + 6, yard.f0 + 5) === "minecraft:air",
  "gardens under the open sky");

console.log("the Greenhouse (90-99)");
walkRooms(100, "the greenhouse");
check(d.rooms.slice(90, 100).every((r) => r.door?.type === "zt:gate_door"), "iron gates all the way");
check(d.rooms.slice(90, 100).every((r) => !r.lamps?.length), "no lights at all");

console.log("door 100");
runTicks(400, () => d.rooms[100].built && !!d.d100);
const s100 = d.d100;
check(!!s100 && roomOf(player) === 100, "through door 100: the electrical room");
const L100 = s100.lay.L;
const at100 = (x, y, z) => ({ r: L100.R(x), u: L100.U(y), f: L100.F(z) });
const b100 = (x, y, z) => blk(L100.R(x), L100.U(y), L100.F(z));
check(b100(-1, 1, 27) === "minecraft:barrier" && only("zt:big_gate").length === 1, "a wide grey gate, shut");
check(only("zt:wall_lever").length === 1 && only("zt:breaker_box").length === 1, "a lever beside it; a breaker box in the High Voltage room");
check(s100.hvDoor.locked && world.getEntity(s100.hvDoor.id)?.props["zt:sign"] === true, "the High Voltage room's grey door, locked, with its warning");
check(only("zt:wardrobe").filter((e) => e.props["zt:style"] === 1).length >= 7, "wooden closets in the halls");
check(b100(-18, 1, 9) === "zt:metal_shelf" && b100(-24, 1, 15) === "zt:metal_shelf", "grey shelves in the halls and the open side rooms");
check(b100(-14, 2, 15) === "minecraft:light_gray_concrete" && b100(-1, 2, 15) === "minecraft:air" && b100(15, 2, 15) === "minecraft:air",
  "two great squares, halls all around them and between");
check(b100(-0.5, 0, 31) === "minecraft:polished_andesite_stairs" && b100(-1, 8, 45) === "minecraft:air", "beyond the gate, stairs up to a room");
const skeleton = player.components["minecraft:inventory"].container.slots.findIndex((it) => it?.typeId === "zt:skeleton_key");
if (skeleton >= 0) player.components["minecraft:inventory"].container.slots[skeleton] = undefined;
world.afterEvents.playerInteractWithEntity.fire({ player, target: world.getEntity(s100.hvDoor.id) });
check(s100.hvDoor.locked && log.messages.some((m) => m.includes("HIGH VOLTAGE")), "the High Voltage door won't open (without a key)");

console.log("the lever");
player.setGameMode(GameMode.Creative);
go(player, at100(3.5, 0, 25.5));
world.afterEvents.playerInteractWithEntity.fire({ player, target: only("zt:wall_lever")[0] });
check(s100.stage === "lever" && only("zt:wall_lever")[0].props["zt:on"] === true, "pull the lever...");
runTicks(5);
check(b100(-1, 1, 27) === "minecraft:air" && player.cameraOn, "...the gate slides open, and you watch");
runTicks(600, () => s100.stage !== "lever");
const fig = only("zt:figure")[0];
check(s100.stage === "hunt" && !!fig, "the Figure came down the stairs, and it's hunting");
check(!player.cameraOn && player.permissions[InputPermissionCategory.Movement] !== false, "you can move again");
const inHalls = (e) => {
  const l = fr.local(e.location);
  return s100.nav.walk(Math.floor(l.r), Math.floor(l.f));
};
let strayed = 0;
runTicks(300, () => {
  if (fig.valid && !inHalls(fig)) strayed++;
});
check(strayed === 0, "it keeps to the halls");

console.log("the grey key, the box, the switches");
world.afterEvents.playerInteractWithEntity.fire({ player, target: world.getEntity(s100.keyId) });
check(Doors.countItem(player, "zt:electrical_key") === 1, "the grey key, from a crate upstairs");
world.afterEvents.playerInteractWithEntity.fire({ player, target: world.getEntity(s100.hvDoor.id) });
check(!s100.hvDoor.locked && s100.hvDoor.open, "it opens the High Voltage room");
const box = only("zt:breaker_box")[0];
world.afterEvents.playerInteractWithEntity.fire({ player, target: box });
check(box.props["zt:open"] && s100.switches.size === 10, "the breaker box: ten switches missing");
const upstairs = [...s100.switches.values()].filter((sp) => sp.up).length;
check(upstairs >= 2 && upstairs <= 3, "two or three of them upstairs (" + upstairs + "), the rest in the halls");
runTicks(12);
check(only("zt:switch_bar").length === 1, "a meter: 0/10 switches");
for (const id of [...s100.switches.keys()]) world.afterEvents.playerInteractWithEntity.fire({ player, target: world.getEntity(id) });
check(Doors.countItem(player, "zt:breaker_switch") === 10, "you found all ten");
world.afterEvents.playerInteractWithEntity.fire({ player, target: box });
check(s100.inserted === 10 && s100.stage === "fire", "you put them in...");

console.log("the fire");
runTicks(900, () => s100.stage === "puzzle");
check(log.sounds.includes("zt.fire.whoosh") && log.sounds.includes("zt.figure.bump"), "the Figure steps on the live wire and burns, crashing into the walls");
check(b100(18, 2, 24) === "minecraft:air" && log.sounds.includes("zt.window.crash"), "...and out through the window");
check(only("zt:figure").length === 0 && s100.stage === "puzzle", "it's gone; the puzzle begins");

console.log("the breaker puzzle");
check(only("zt:breaker_lever").length === 10, "ten switches in the box");
let saw = new Set();
let showed = [];
for (let round = 1; round <= 3; round++) {
  runTicks(2000, () => {
    const n = box.props["zt:num"];
    if (n) saw.add(n + ":" + box.props["zt:fill"]);
    if (n === 11) showed.push(round);
    return s100.puzzle?.passes >= 1 || s100.stage !== "puzzle";
  });
  const P = s100.puzzle;
  if (!P) break;
  P.target.forEach((on, i) => {
    const lever = world.getEntity(s100.levers[i]);
    if (lever.props["zt:on"] !== on) world.afterEvents.playerInteractWithEntity.fire({ player, target: lever });
  });
  runTicks(2000, () => s100.puzzle?.round !== round || s100.stage !== "puzzle");
}
check([...saw].some((x) => x.endsWith(":2")) && [...saw].some((x) => x.endsWith(":1")), "numbers flash up with full and empty squares");
check(showed.length > 0 && showed.every((r) => r === 3), "in the third round, the last one shows as ??");
check(s100.stage === "power" || s100.stage === "chase", "three rounds, and the power comes back");

console.log("the escape");
runTicks(300, () => s100.stage === "chase");
check(log.sounds.filter((x) => x === "zt.figure.bang").length >= 2 && log.sounds.includes("zt.door.burst"), "BANG... BANG... and it bursts through");
check(world.getEntity(s100.hvDoor.id)?.props["zt:broken"] === true && only("zt:figure").length === 1, "the door's down, the Figure's in");
player.setGameMode(GameMode.Adventure);
const route = [at100(-10.5, 0, 3.0), at100(-9, 0, 4.5), at100(-9, 0, 8.6), at100(-0.5, 0, 8.6), at100(-0.5, 0, 25.5), at100(-0.5, 0, 28.5),
  at100(-0.5, 0, 30.5), at100(-0.5, 8, 39.5), at100(-0.5, 8, 49.6), at100(-0.5, 8, 53.5)];
player.location = fr.at(route[0].r, route[0].u, route[0].f);
for (const pt of route) walk(player, pt, 5.6);
check(!player.dead, "you got past it and ran for the elevator");
runTicks(120, () => s100.stage === "elevator");
check(s100.stage === "elevator" && b100(-1, 9, 51) === "minecraft:barrier", "the gate slams shut in its face");
check(run.phase === "ending", "...going down");
let looked = false;
let fell = false;
runTicks(800, () => {
  if (player.cameraOn) looked = true;
  if (log.sounds.includes("zt.elevator.cable")) fell = true;
  return !Doors.runs.has(run.id);
});
check(looked && only("zt:figure").length === 0 && fell, "you look up: it's on the roof... the cable snaps");
check(log.sounds.includes("zt.elevator.crash") && log.messages.some((m) => m.includes("Floor 1 Complete")), "the fall, the crash: Floor 1 complete!");
check(!Doors.runs.has(run.id), "the run is over");
runTicks(15);
check(dist(player.location, lobby.home.loc) < 1.0, "back in the Lobby");
check(player.getGameMode() === GameMode.Survival && Doors.countItem(player, "zt:room_key") === 0 && Doors.countItem(player, "zt:skeleton_key") === 0,
  "in your own game mode, the hotel's things gone");
check(!player.cameraOn && player.permissions[InputPermissionCategory.Movement] !== false && player.music === null, "you can move, and it's quiet");

console.log("");
if (warnings.length) {
  console.log("script warnings:");
  for (const w of warnings.slice(0, 20)) console.log("  " + w);
}
console.log(failures === 0 && warnings.length === 0 ? "ALL GOOD" : `${failures} failures, ${warnings.length} warnings`);
process.exit(failures === 0 && warnings.length === 0 ? 0 : 1);
