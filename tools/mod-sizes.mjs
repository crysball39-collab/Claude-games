/* =============================================================================
   Measures every STICKFIGHTS mod - each folder under stickfights/src/mods/ -
   and writes what each one needs into stickfights/src/mods/sizes.js, which
   the MODS screen shows as "Storage needed". The build runs this first, so
   the numbers are always the real ones.

     node tools/mod-sizes.mjs
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MODS_DIR = path.join(ROOT, 'stickfights/src/mods');
const OUT = path.join(MODS_DIR, 'sizes.js');

function folderBytes(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    n += e.isDirectory() ? folderBytes(p) : fs.statSync(p).size;
  }
  return n;
}

/** { 'mod-id': bytes } for every mod folder. */
export function measureMods() {
  const out = {};
  for (const e of fs.readdirSync(MODS_DIR, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory()) out[e.name] = folderBytes(path.join(MODS_DIR, e.name));
  }
  return out;
}

export function sizesSource(sizes) {
  const rows = Object.entries(sizes).map(([id, n]) => `  '${id}': ${n},`).join('\n');
  return `/* Written by tools/mod-sizes.mjs - do not edit. How many bytes each mod's folder takes up. */\nexport const MOD_SIZES = {\n${rows}\n};\n`;
}

/** Writes sizes.js (only if it changed) and returns the sizes. */
export function writeModSizes() {
  const sizes = measureMods();
  const src = sizesSource(sizes);
  if (!fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== src) fs.writeFileSync(OUT, src);
  return sizes;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sizes = writeModSizes();
  for (const [id, n] of Object.entries(sizes)) console.log(`${id}: ${(n / 1024).toFixed(1)} KB`);
}
