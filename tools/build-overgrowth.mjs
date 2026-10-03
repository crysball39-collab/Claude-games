/* =============================================================================
   Builds dist/overgrowth.html: OVERGROWTH folded into one file - markup,
   styles, three.js and every module - so it can be downloaded onto a phone
   and opened straight from the filesystem, with no server and no network.

     npm install -D esbuild
     node tools/build-overgrowth.mjs
   ========================================================================== */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAME = path.join(ROOT, 'overgrowth');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT_FILE = path.join(OUT_DIR, 'overgrowth.html');

const result = await build({
  entryPoints: [path.join(GAME, 'src/main.js')],
  bundle: true,
  write: false,
  format: 'iife',            // a classic script, so file:// has nothing to fetch
  target: ['es2020'],
  minify: true,
  legalComments: 'none',
  alias: { three: path.join(ROOT, 'vendor/three.module.js') },
  logLevel: 'warning',
});
const js = result.outputFiles[0].text;

const css = fs.readFileSync(path.join(GAME, 'style.css'), 'utf8');
let html = fs.readFileSync(path.join(GAME, 'index.html'), 'utf8');

// Anything the browser would have to go and fetch has to go.
const strip = [
  /\n?\s*<link rel="stylesheet" href="style\.css" \/>/,
  /\n?\s*<script type="importmap">[\s\S]*?<\/script>/,
  /\n?\s*<script type="module" src="src\/main\.js"><\/script>/,
];
for (const re of strip) {
  if (!re.test(html)) throw new Error('index.html no longer matches ' + re);
  html = html.replace(re, '');
}

const inject = (marker, block) => {
  if (!html.includes(marker)) throw new Error('cannot find ' + marker + ' in index.html');
  // a replacer function: minified code is full of $ sequences
  html = html.replace(marker, () => block + marker);
};
inject('</head>', `<style>\n${css}\n</style>\n`);
inject('</body>', `<script>\n${js}\n</script>\n`);

html = html.replace('<!DOCTYPE html>', () =>
  '<!DOCTYPE html>\n<!-- OVERGROWTH - single file build. Open it in a browser. ' +
  'Source: https://github.com/crysball39-collab/Claude-games/tree/main/overgrowth -->');

for (const bad of ['</script', '<!--']) {
  if (js.includes(bad)) throw new Error(`bundle contains ${bad}, which would break the inline script`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, html);
const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(`wrote ${path.relative(ROOT, OUT_FILE)}  (${kb(html.length)}; script ${kb(js.length)}, styles ${kb(css.length)})`);
