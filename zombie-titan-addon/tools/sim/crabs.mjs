// The Crabulon update: the small ponds dug in the Glowshroom caverns (and in caverns grown
// before there were ponds) and the Shroomy Crabs that live in them; the Shroom Fortress built
// beside a cavern, its spawners and its chest.
//   node tools/sim/run.mjs crabs          ZT_TRACE=1  ZT_FORTRESS_OUT=<file> (the fortress, block by block)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Player, blockId, blockPerm, blockContainer, log, runTicks, setBlock, sim, system, unloadedChunks, world } from "@minecraft/server";

const warnings = [];
console.warn = (...a) => {
  warnings.push(a.join(" "));
  if (process.env.ZT_TRACE) process.stderr.write("WARN " + a.join(" ") + "\n");
};

await import("./scripts/main.js");
const Glow = await import("./scripts/glowshroom.js");
const Fortress = await import("./scripts/fortress.js");
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

console.log("the Shroomy Crab");
const crabFile = pack("ZombieTitan_BP/entities/shroomy_crab.json")["minecraft:entity"];
const cc = crabFile.components;
check(!cc["minecraft:behavior.nearest_attackable_target"] && !!cc["minecraft:behavior.hurt_by_target"]?.alert_same_type,
  "neutral: it only fights what hurts it (or the crabs about it)");
check(cc["minecraft:type_family"].family.includes("shroom") && !cc["minecraft:type_family"].family.includes("monster"),
  "of the Glowshroom Biome (spore bullets pass it by), and no monster");
check(cc["minecraft:breathable"].breathes_water && cc["minecraft:navigation.walk"].is_amphibious && !cc["minecraft:behavior.float"],
  "it breathes water and walks the bottom of its pond");
check(!!crabFile.events["zt:make_hostile"] && !!crabFile.component_groups["zt:hostile"]["minecraft:behavior.nearest_attackable_target"],
  "and can be made to come for players (Crabulon's)");
const loot = pack("ZombieTitan_BP/loot_tables/entities/shroomy_crab.json").pools.flatMap((p) => p.entries.map((e) => e.name));
check(loot.includes("zt:shroom_patch") && loot.includes("zt:shroomy_crab_claw"), "it drops Shroom Patches and Shroomy Crab Claws");
const client = pack("ZombieTitan_RP/entity/shroomy_crab.entity.json")["minecraft:client_entity"].description;
const anims = pack("ZombieTitan_RP/animations/crabs.animation.json").animations;
check(Object.values(client.animations).every((a) => a.startsWith("controller.") || anims[a]), "its animations are all there");
const geo = pack("ZombieTitan_RP/models/entity/crabs.geo.json")["minecraft:geometry"][0];
const bones = new Set(geo.bones.map((b) => b.name));
const geos = pack("ZombieTitan_RP/models/entity/crabs.geo.json")["minecraft:geometry"];
const bonesOf = (id) => new Set(geos.find((g) => g.description.identifier === id).bones.map((b) => b.name));
const movedBy = (prefix) => Object.entries(anims).filter(([k]) => k.startsWith(prefix)).flatMap(([, a]) => Object.keys(a.bones ?? {}));
check(movedBy("animation.zt.shroomy_crab.").every((b) => bones.has(b)), "and move bones its model has");
const big = bonesOf("geometry.zt.crabulon");
check(movedBy("animation.zt.crabulon.").every((b) => big.has(b)), "(as do Crabulon's)");
check(geo.bones.filter((b) => b.name.startsWith("shin_")).length === 8 && bones.has("leftPincer") && bones.has("shrooms"),
  "eight legs, two pincers and mushrooms on its back");

console.log("ponds in a new cavern");
const H = { x: 32 * 16, y: Glow.HEART_Y, z: 32 * 16 };
setBlock(ow, H.x, H.y, H.z, Glow.HEART);
player.teleport({ x: H.x + 20, y: H.y - 2, z: H.z + 6 });
runTicks(3000, () => Glow.results.size > 0);
check(Glow.results.get(`minecraft:overworld|${H.x},${H.y},${H.z}`) === "built", "a cavern is grown");
const cav = Glow.cavernList()[0];
check(cav?.v === 2 && Array.isArray(cav.p) && cav.p.length >= 1 && cav.p.length <= 3, `with ponds (${cav?.p?.length})`);
/** The water of a pond, its blocks, and whether it all stays put. */
function survey(q) {
  let water = 0;
  let deep = 0;
  let pickles = 0;
  let leaks = 0;
  for (let x = q[0] - 5; x <= q[0] + 5; x++) for (let z = q[2] - 5; z <= q[2] + 5; z++) {
    for (let y = q[1] - 2; y <= q[1]; y++) {
      const id = blockId(ow, x, y, z);
      const wet = id === "minecraft:water" || (id === "minecraft:sea_pickle" && ow.getBlock({ x, y, z }).isWaterlogged);
      if (id === "minecraft:sea_pickle") pickles += ow.getBlock({ x, y, z }).isWaterlogged ? 1 : 0;
      if (!wet) continue;
      water++;
      if (y < q[1]) deep++;
      // water only stays where it's walled in, and floored
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) {
        const n = blockId(ow, x + dx, y + dy, z + dz);
        if (n === "minecraft:air" || n === Glow.PLANT || n === Glow.MUSHROOM) leaks++;
      }
    }
  }
  return { water, deep, pickles, leaks, top: blockId(ow, q[0], q[1] + 1, q[2]) };
}
for (const q of cav?.p ?? []) {
  const s = survey(q);
  check(s.water >= 6 && s.deep >= 1 && s.leaks === 0 && s.top === "minecraft:air",
    `a pond at ${q.join(" ")}: ${s.water} water, ${s.deep} of it deep, walled and floored (${s.leaks} leaks)`);
  check(s.pickles >= 1, "  a sea pickle glowing on its bottom");
  check(Math.abs(q[1] - (H.y - 7)) <= 2, "  sunk into the cavern's floor");
}
const pondsApart = (cav?.p ?? []).every((a, i, all) => all.every((b, j) => i === j || Math.hypot(a[0] - b[0], a[2] - b[2]) >= 9));
check(pondsApart, "the ponds are well apart");

console.log("crabs come to the ponds");
const q0 = cav.p[0];
player.teleport({ x: q0[0] + 0.5 + Math.cos(Math.atan2(cav.z - q0[2], cav.x - q0[0])) * 12, y: q0[1] + 1,
  z: q0[2] + 0.5 + Math.sin(Math.atan2(cav.z - q0[2], cav.x - q0[0])) * 12 });
let crabs = [];
for (let i = 0; i < 12; i++) crabs.push(...Glow.spawnCrabs(player, cav));
const live = () => ow.getEntities({ type: Glow.CRAB });
check(live().length === 5 || live().length === 6, `a few crabs turn up near the player, no more (${live().length})`);
check(crabs.every((c) => cav.p.some((q) => Math.hypot(c.location.x - q[0] - 0.5, c.location.z - q[2] - 0.5) < 1.5 && Math.abs(c.location.y - q[1]) < 1)),
  "in the water of a pond");
for (const c of live()) c.remove();
player.teleport({ x: q0[0] + 2, y: q0[1] + 1, z: q0[2] });
check(cav.p.length > 1 || Glow.spawnCrabs(player, cav).length === 0, "not right under the player's feet");
for (const c of live()) c.remove();
// left to itself, the cavern brings them now and then
// (inside the cavern, eight blocks from the pond toward its middle)
const inward = Math.atan2(cav.z - q0[2], cav.x - q0[0]);
player.teleport({ x: q0[0] + 0.5 + Math.cos(inward) * 8, y: q0[1] + 1, z: q0[2] + 0.5 + Math.sin(inward) * 8 });
check(Glow.cavernAt("minecraft:overworld", player.location) === cav, "(the player is in the cavern)");
runTicks(2400);
check(live().length >= 1 && live().length <= 6, `crabs come up while a player's about (${live().length} in two minutes)`);
for (const c of live()) c.remove();
// a pond drained (or built over) has none
const saved = blockId(ow, q0[0], q0[1], q0[2]);
setBlock(ow, q0[0], q0[1], q0[2], "minecraft:dirt");
const onlyThat = { ...cav, p: [q0] };
check(Glow.spawnCrabs(player, onlyThat).length === 0, "a drained pond has none");
setBlock(ow, q0[0], q0[1], q0[2], saved);

console.log("an older cavern gets its ponds");
// a cavern as 1.8.0 left it: hollow, floored with spore grass, remembered without ponds
const O = { x: 60 * 16, y: Glow.HEART_Y, z: 60 * 16 };
for (let x = O.x - 13; x <= O.x + 13; x++) for (let z = O.z - 13; z <= O.z + 13; z++) {
  if (Math.hypot(x - O.x, z - O.z) > 13) continue;
  setBlock(ow, x, O.y - 6, z, Glow.DIRT);
  setBlock(ow, x, O.y - 5, z, Glow.GRASS);
  for (let y = O.y - 4; y <= O.y + 4; y++) setBlock(ow, x, y, z, "minecraft:air");
}
const old = { d: "minecraft:overworld", x: O.x, y: O.y, z: O.z, r: 13 };
Glow.cavernList().push(old);
player.teleport({ x: O.x + 3, y: O.y - 4, z: O.z + 3 });
runTicks(600, () => old.v === 2);
check(old.v === 2 && old.p.length >= 1, `when a player comes in, it's given ponds (${old.p?.length})`);
check(old.p.every((q) => survey(q).leaks === 0 && blockId(ow, q[0], q[1], q[2]) === "minecraft:water"), "proper ones");
check(old.p.every((q) => Math.hypot(q[0] - player.location.x, q[2] - player.location.z) >= 4), "not where the player stands");
const stored = JSON.parse(String(world.getDynamicProperty("zt:glowshroom_caverns")));
check(stored.some((c) => c.x === O.x && c.v === 2 && c.p.length === old.p.length), "and the world remembers them");

console.log("the Shroom Fortress");
// a cavern that gets a fortress (one in two do, by where they are)
let FH;
for (let cx = 80; !FH; cx += 2) {
  const at = { x: cx * 16, y: Glow.HEART_Y, z: 80 * 16 };
  if (Fortress.wantsFortress(at)) FH = at;
}
setBlock(ow, FH.x, FH.y, FH.z, Glow.HEART);
player.teleport({ x: FH.x, y: 60, z: FH.z });
const fkey = `${FH.x},${FH.y},${FH.z}`;
let t0 = system.currentTick;
runTicks(6000, () => Fortress.results.has(fkey));
const fres = Fortress.results.get(fkey);
check(fres === "built", `a cavern's fortress is built beside it (${fres}, ${system.currentTick - t0} ticks)`);
const F = Fortress.fortressList().find((f) => f.c === fkey);
check(!!F?.ok && !!F.altar && !!F.arena && F.spawners?.length === 2, "and remembered, with its altar, arena and spawners");
const stored2 = JSON.parse(String(world.getDynamicProperty("zt:shroom_fortresses")));
check(stored2.some((f) => f.c === fkey && f.ok), "in the world");
if (F?.ok) {
  const [dx, dz] = F.dir;
  const at = (u, v, h) => ({ x: F.o[0] + u * dx - v * dz, y: F.o[1] + h, z: F.o[2] + u * dz + v * dx });
  const idf = (u, v, h) => { const p = at(u, v, h); return blockId(ow, p.x, p.y, p.z); };
  if (process.env.ZT_FORTRESS_OUT) {
    const { writeFileSync } = await import("node:fs");
    const layers = {};
    for (const h of [-1, 0, 1, 3, 7, 12, 22, 30]) {
      const rows = [];
      for (let v = -24; v <= 24; v++) {
        const row = [];
        for (let u = -5; u <= 65; u++) row.push(idf(u, v, h).replace(/^(minecraft|zt):/, ""));
        rows.push(row);
      }
      layers[h] = rows;
    }
    const side = [];
    for (let h = -3; h <= 37; h++) {
      const row = [];
      for (let u = -5; u <= 65; u++) row.push(idf(u, 0, h).replace(/^(minecraft|zt):/, ""));
      side.push(row);
    }
    writeFileSync(process.env.ZT_FORTRESS_OUT, JSON.stringify({ layers, side }));
  }
  check(blockId(ow, ...F.altar) === Fortress.ALTAR, "the Shroomed Altar stands in the arena");
  check(F.spawners.every((s) => blockId(ow, ...s) === Fortress.SPAWNER), "the spawners stand in the hall");
  // the way in: from the cavern through the gate and the hall into the arena, two blocks high
  let blocked = 0;
  for (let u = -1; u <= 37; u++) for (const h of [0, 1]) if (idf(u, 0, h) !== "minecraft:air") blocked++;
  check(blocked === 0, `an open way from the cavern through the gate and the hall to the altar's dais (${blocked} blocked)`);
  check(idf(41, 0, 0) === Fortress.BRICKS && idf(38, 0, 0) === Fortress.BRICKS, "which stands a step up");
  check(idf(-1, 0, -1) !== "minecraft:air" && idf(5, 0, -1) === Fortress.BRICKS, "floored all the way");
  // the arena: forty-one across and twenty-two high, inside walls of brick
  let air = 0;
  let cells = 0;
  for (let u = 22; u <= 60; u += 2) for (let v = -18; v <= 18; v += 2) for (let h = 2; h <= 20; h += 3) {
    cells++;
    if (idf(u, v, h) === "minecraft:air") air++;
  }
  check(air / cells > 0.97, `the arena is a great open hall (${(100 * air / cells).toFixed(1)}% open)`);
  check(idf(41, 0, 23) === Fortress.BRICKS && idf(51, 0, 23) === "minecraft:air" && idf(51, 0, 34) === Fortress.BRICKS,
    "roofed, with a shaft up into the roof over its far half");
  let shell = 0;
  for (let u = 21; u <= 61; u += 5) for (const v of [-21, 21]) for (let h = 0; h <= 20; h += 5) if (idf(u, v, h) === Fortress.BRICKS) shell++;
  check(shell >= 40, `walled in Shroomed Brick (${shell})`);
  let walls = 0;
  let lanterns = 0;
  let lights = 0;
  for (let u = -3; u <= 64; u++) for (let v = -23; v <= 23; v++) for (let h = -1; h <= 18; h++) {
    const id = idf(u, v, h);
    if (id === Fortress.WALL) walls++;
    else if (id === "minecraft:soul_lantern") lanterns++;
    else if (id === "minecraft:sea_lantern") lights++;
  }
  check(walls >= 8 && lanterns >= 6 && lights >= 20, `with walls (${walls}), lanterns (${lanterns}) and lights (${lights})`);
  let wet = 0;
  for (let u = 0; u <= 63; u++) for (let v = -22; v <= 22; v++) for (const h of [0, 1]) if (/water|lava/.test(idf(u, v, h))) wet++;
  check(wet === 0, "dry inside");
  const chestAt = at(16, 5, 0);
  const chest = blockContainer(ow, chestAt);
  const stocked = chest ? chest.slots.filter(Boolean).map((i) => i.typeId.replace(/^(minecraft|zt):/, "")) : [];
  check(blockId(ow, chestAt.x, chestAt.y, chestAt.z) === "minecraft:chest" && stocked.length >= 2, `a chest in the hall, with loot (${stocked.join(", ")})`);
  check(Fortress.arenaAt("minecraft:overworld", { x: F.altar[0] + 10, y: F.floor + 1, z: F.altar[2] }) === F, "the arena is where the world says it is");

  console.log("finding it");
  const m0 = log.messages.length;
  const g = at(-6, 0, 0);
  player.teleport({ x: g.x + 0.5, y: g.y, z: g.z + 0.5 });
  runTicks(40);
  check(!log.messages.slice(m0).some((m) => m.includes("Shroom Fortress")), "(nothing in the cavern before its gate)");
  const hall = at(6, 0, 0);
  player.teleport({ x: hall.x + 0.5, y: hall.y, z: hall.z + 0.5 });
  runTicks(40);
  check(log.messages.slice(m0).some((m) => m.includes("Shroom Fortress")), "walking in shows the Shroom Fortress's title");

  console.log("the Shroomy Crab spawners");
  const sp = F.spawners[0];
  const spBlock = ow.getBlock({ x: sp[0], y: sp[1], z: sp[2] });
  const spComp = sim.blockComponents.get("zt:crab_spawner");
  check(!!spComp?.onTick, "its custom component is registered at startup");
  player.teleport({ x: sp[0] + 30, y: sp[1], z: sp[2] });
  let made = 0;
  for (let i = 0; i < 100; i++) {
    made += Fortress.spawnerTick(spBlock).length;
    runTicks(10);
  }
  check(made === 0, "with no player near, nothing comes out");
  const s0 = at(10, 0, 0);
  player.teleport({ x: s0.x + 0.5, y: s0.y, z: s0.z + 0.5 });
  const flames = log.particles.length;
  made = 0;
  for (let i = 0; i < 300 && made === 0; i++) {
    made += Fortress.spawnerTick(spBlock).length;
    runTicks(10);
  }
  check(made >= 1 && made <= 3, `with a player near, crabs come out of it (${made})`);
  check(log.particles.slice(flames).includes("zt:spawner_flame"), "its flames burn while a player's near");
  const crabsNear = ow.getEntities({ type: Fortress.CRAB, location: { x: sp[0] + 0.5, y: sp[1], z: sp[2] + 0.5 }, maxDistance: 9 });
  check(crabsNear.every((c) => blockId(ow, Math.floor(c.location.x), Math.floor(c.location.y) - 1, Math.floor(c.location.z)) !== "minecraft:air"),
    "on the floor about it");
  for (let i = 0; i < 2000; i++) {
    Fortress.spawnerTick(spBlock);
    runTicks(10);
  }
  const most = ow.getEntities({ type: Fortress.CRAB, location: { x: sp[0] + 0.5, y: sp[1], z: sp[2] + 0.5 }, maxDistance: 9 }).length;
  check(most >= 3 && most <= 6, `no more than six about it (${most})`);
  for (const c of ow.getEntities({ type: Fortress.CRAB })) c.remove();
  const xp = player.xp;
  spComp.onPlayerBreak({ block: spBlock, player, brokenBlockPermutation: blockPerm(sp[0], sp[1], sp[2], ow) });
  check(player.xp - xp >= 15 && player.xp - xp <= 43, `breaking one gives experience (${player.xp - xp})`);
}
// one whose far end isn't loaded (on a short simulation distance): a ticking area loads it
let LH;
for (let cx = 120; !LH; cx += 2) {
  const at = { x: cx * 16, y: Glow.HEART_Y, z: 120 * 16 };
  if (Fortress.wantsFortress(at)) LH = at;
}
const hcx = LH.x / 16;
const hcz = LH.z / 16;
for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
  if (Math.max(Math.abs(dx), Math.abs(dz)) >= 3) unloadedChunks.add(`${hcx + dx},${hcz + dz}`);
}
setBlock(ow, LH.x, LH.y, LH.z, Glow.HEART);
player.teleport({ x: LH.x, y: 60, z: LH.z });
const lkey = `${LH.x},${LH.y},${LH.z}`;
const c0 = log.commands.length;
runTicks(6000, () => Fortress.results.has(lkey));
check(Fortress.results.get(lkey) === "loading" && log.commands.slice(c0).some((c) => c.startsWith("tickingarea add") && c.endsWith("zt_fortress")),
  "a fortress reaching beyond the loaded world asks for a ticking area to load it");
// (the ticking area loads the chunks)
unloadedChunks.clear();
runTicks(400, () => Fortress.results.get(lkey) === "built");
check(Fortress.results.get(lkey) === "built", "and is built once they're loaded");
check(log.commands.slice(c0).some((c) => c === "tickingarea remove zt_fortress"), "then the ticking area is removed");
// a cavern without one
let NH;
for (let cx = 100; !NH; cx += 2) {
  const at = { x: cx * 16, y: Glow.HEART_Y, z: 100 * 16 };
  if (!Fortress.wantsFortress(at)) NH = at;
}
setBlock(ow, NH.x, NH.y, NH.z, Glow.HEART);
player.teleport({ x: NH.x, y: 60, z: NH.z });
runTicks(4000, () => Fortress.results.has(`${NH.x},${NH.y},${NH.z}`));
check(Fortress.results.get(`${NH.x},${NH.y},${NH.z}`) === "not here", "half the caverns have no fortress");

check(warnings.length === 0, "no script warnings" + (warnings.length ? ": " + warnings.slice(0, 3).join(" | ") : ""));
console.log(failures === 0 ? "ALL GOOD" : failures + " FAILED");
process.exit(failures === 0 ? 0 : 1);
