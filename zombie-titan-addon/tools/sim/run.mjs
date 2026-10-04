// Copies the behaviour pack scripts next to a fake "@minecraft/server" package
// and runs the simulation tests against them, each in a fresh process.
//   node tools/sim/run.mjs              all tests
//   node tools/sim/run.mjs skeleton     just tools/sim/skeleton.mjs
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TESTS = ["smoke", "skeleton", "items"];

const here = dirname(fileURLToPath(import.meta.url));
const work = mkdtempSync(join(tmpdir(), "zt-sim-"));
const pkg = join(work, "node_modules", "@minecraft", "server");
mkdirSync(pkg, { recursive: true });
cpSync(join(here, "mock-server.mjs"), join(pkg, "index.mjs"));
writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "@minecraft/server", type: "module", main: "index.mjs" }));
writeFileSync(join(work, "package.json"), JSON.stringify({ type: "module" }));
cpSync(join(here, "..", "..", "packs", "ZombieTitan_BP", "scripts"), join(work, "scripts"), { recursive: true });
const wanted = process.argv.length > 2 ? process.argv.slice(2) : TESTS;
let failed = 0;
for (const name of wanted) {
  cpSync(join(here, name + ".mjs"), join(work, name + ".mjs"));
  console.log("=== " + name);
  const r = spawnSync(process.execPath, [join(work, name + ".mjs")], { stdio: "inherit", cwd: work });
  if (r.status !== 0) failed++;
}
console.log(failed === 0 ? "ALL TESTS PASSED" : `${failed} test file(s) failed`);
process.exit(failed === 0 ? 0 : 1);
