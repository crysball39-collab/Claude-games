// Copies the behaviour pack scripts next to a fake "@minecraft/server" package
// and runs the smoke test against them.
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const work = mkdtempSync(join(tmpdir(), "zt-sim-"));
const pkg = join(work, "node_modules", "@minecraft", "server");
mkdirSync(pkg, { recursive: true });
cpSync(join(here, "mock-server.mjs"), join(pkg, "index.mjs"));
writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "@minecraft/server", type: "module", main: "index.mjs" }));
writeFileSync(join(work, "package.json"), JSON.stringify({ type: "module" }));
cpSync(join(here, "..", "..", "packs", "ZombieTitan_BP", "scripts"), join(work, "scripts"), { recursive: true });
cpSync(join(here, "smoke.mjs"), join(work, "smoke.mjs"));
const r = spawnSync(process.execPath, [join(work, "smoke.mjs")], { stdio: "inherit", cwd: work });
process.exit(r.status ?? 1);
