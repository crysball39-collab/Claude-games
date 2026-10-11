// Copies the behaviour pack scripts next to a fake "@minecraft/server" package
// and runs the simulation tests against them, each in a fresh process.
//   node tools/sim/run.mjs              all tests
//   node tools/sim/run.mjs skeleton     just tools/sim/skeleton.mjs
//   node tools/sim/run.mjs seek@1.21.90 the Seek test with the blocks of Minecraft 1.21.90
// Math.random is seeded so runs repeat exactly; ZT_SEED=<number> tries another seed.
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// the Doors levels place many kinds of blocks: build them with older block lists too
// (glowite: the ore, furnace, armor, the Glowshroom caverns, their blocks, mobs and berries)
// (the Players: bot is its senses, chat and menus; botpath getting about; botcraft a game from
// nothing; botstations the blocks it uses; botend the way to the dragon; botai the AI bridge)
const TESTS = ["smoke", "skeleton", "creeper", "spider", "omegafish", "items", "gumgum", "library", "seek", "library@1.21.90", "seek@1.21.90",
  "library@1.26.20", "floor1", "floor1@1.21.90", "bot", "botpath", "botstations", "botai", "botcraft", "botend", "botfight", "botblaze", "botreal", "glowite"];

const here = dirname(fileURLToPath(import.meta.url));
const work = mkdtempSync(join(tmpdir(), "zt-sim-"));
const pkg = join(work, "node_modules", "@minecraft", "server");
mkdirSync(pkg, { recursive: true });
cpSync(join(here, "mock-server.mjs"), join(pkg, "index.mjs"));
writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "@minecraft/server", type: "module", main: "index.mjs" }));
const uiPkg = join(work, "node_modules", "@minecraft", "server-ui");
mkdirSync(uiPkg, { recursive: true });
cpSync(join(here, "mock-server-ui.mjs"), join(uiPkg, "index.mjs"));
writeFileSync(join(uiPkg, "package.json"), JSON.stringify({ name: "@minecraft/server-ui", type: "module", main: "index.mjs" }));
const netPkg = join(work, "node_modules", "@minecraft", "server-net");
mkdirSync(netPkg, { recursive: true });
cpSync(join(here, "mock-server-net.mjs"), join(netPkg, "index.mjs"));
writeFileSync(join(netPkg, "package.json"), JSON.stringify({ name: "@minecraft/server-net", type: "module", main: "index.mjs" }));
writeFileSync(join(work, "package.json"), JSON.stringify({ type: "module" }));
cpSync(join(here, "..", "..", "packs", "ZombieTitan_BP", "scripts"), join(work, "scripts"), { recursive: true });
// the world like the game's, for the Players' tests
cpSync(join(here, "realworld.mjs"), join(work, "realworld.mjs"));
// the Player AI Bridge pack's script
cpSync(join(here, "..", "..", "packs", "PlayerAI_Bridge_BP", "scripts"), join(work, "bridge"), { recursive: true });
// the blocks the game knows: vanilla ones (per version) and the pack's own, with their states
cpSync(join(here, "vanilla-blocks.json"), join(work, "vanilla-blocks.json"));
const blocksDir = join(here, "..", "..", "packs", "ZombieTitan_BP", "blocks");
const custom = {};
for (const f of readdirSync(blocksDir).filter((n) => n.endsWith(".json"))) {
  const desc = JSON.parse(readFileSync(join(blocksDir, f), "utf8"))["minecraft:block"].description;
  const states = {};
  for (const [k, v] of Object.entries(desc.states ?? {})) {
    states[k] = Array.isArray(v) ? v : Array.from({ length: v.values.max - v.values.min + 1 }, (_, i) => v.values.min + i);
  }
  // states that traits add
  const traits = desc.traits ?? {};
  const dirs = traits["minecraft:placement_direction"]?.enabled_states ?? [];
  const cardinal = ["north", "south", "east", "west"];
  if (dirs.includes("minecraft:cardinal_direction")) states["minecraft:cardinal_direction"] = cardinal;
  if (dirs.includes("minecraft:corner_and_cardinal_direction")) {
    states["minecraft:cardinal_direction"] = cardinal;
    states["minecraft:corner"] = ["none", "inner_left", "inner_right", "outer_left", "outer_right"];
  }
  const where = traits["minecraft:placement_position"]?.enabled_states ?? [];
  if (where.includes("minecraft:block_face")) states["minecraft:block_face"] = ["down", "up", "north", "south", "east", "west"];
  if (where.includes("minecraft:vertical_half")) states["minecraft:vertical_half"] = ["bottom", "top"];
  if (traits["minecraft:connection"]) for (const d of cardinal) states["minecraft:connection_" + d] = [false, true];
  if (traits["minecraft:multi_block"]) states["minecraft:multi_block_part"] = Array.from({ length: traits["minecraft:multi_block"].parts ?? 2 }, (_, i) => i);
  custom[desc.identifier] = states;
}
writeFileSync(join(work, "custom-blocks.json"), JSON.stringify(custom));
// the pack's entities as the game reads them: properties, events, families and health
const entitiesDir = join(here, "..", "..", "packs", "ZombieTitan_BP", "entities");
const entities = {};
for (const f of readdirSync(entitiesDir).filter((n) => n.endsWith(".json"))) {
  const ent = JSON.parse(readFileSync(join(entitiesDir, f), "utf8"))["minecraft:entity"];
  const comps = ent.components ?? {};
  entities[ent.description.identifier] = {
    props: ent.description.properties ?? {},
    events: Object.keys(ent.events ?? {}),
    families: comps["minecraft:type_family"]?.family ?? [],
    health: comps["minecraft:health"]?.max ?? comps["minecraft:health"]?.value,
    collision: comps["minecraft:collision_box"],
    sensor: [comps["minecraft:damage_sensor"]?.triggers ?? []].flat(),
    inventory: comps["minecraft:inventory"]?.inventory_size,
  };
}
writeFileSync(join(work, "entities.json"), JSON.stringify(entities));
// the pack's items: how many stack, and how much durability they have
const itemsDir = join(here, "..", "..", "packs", "ZombieTitan_BP", "items");
const items = {};
for (const f of readdirSync(itemsDir).filter((n) => n.endsWith(".json"))) {
  const it = JSON.parse(readFileSync(join(itemsDir, f), "utf8"))["minecraft:item"];
  const c = it.components ?? {};
  items[it.description.identifier] = { maxStack: c["minecraft:max_stack_size"] ?? 64, durability: c["minecraft:durability"]?.max_durability,
    tags: c["minecraft:tags"]?.tags ?? [] };
}
writeFileSync(join(work, "items.json"), JSON.stringify(items));
// a seeded Math.random, loaded before each test (mulberry32)
writeFileSync(join(work, "seed.mjs"), `let s = ${Number(process.env.ZT_SEED ?? 1005) >>> 0};
Math.random = () => {
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
`);
const wanted = process.argv.length > 2 ? process.argv.slice(2) : TESTS;
let failed = 0;
for (const name of wanted) {
  const [file, mc] = name.split("@");
  cpSync(join(here, file + ".mjs"), join(work, file + ".mjs"));
  console.log("=== " + name);
  const env = { ...process.env };
  if (mc) env.ZT_MC = mc;
  else delete env.ZT_MC;
  const r = spawnSync(process.execPath, ["--import", "./seed.mjs", join(work, file + ".mjs")], { stdio: "inherit", cwd: work, env });
  if (r.status !== 0) failed++;
}
console.log(failed === 0 ? "ALL TESTS PASSED" : `${failed} test file(s) failed`);
process.exit(failed === 0 ? 0 : 1);
