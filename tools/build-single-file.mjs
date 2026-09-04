/* =============================================================================
   Builds dist/gorebox.html: the whole game folded into one file - markup,
   styles, three.js and every module - so it can be downloaded onto a phone
   and opened straight from the filesystem, with no server and no network.

     npm install -D esbuild
     node tools/build-single-file.mjs
   ========================================================================== */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT_FILE = path.join(OUT_DIR, 'gorebox.html');

/* ------------------------------ the bundle ------------------------------- */

const result = await build({
  entryPoints: [path.join(ROOT, 'src/main.js')],
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

/* ------------------------------- the page -------------------------------- */

const css = fs.readFileSync(path.join(ROOT, 'styles/main.css'), 'utf8');
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// Anything the browser would have to go and fetch has to go.
html = html
  .replace(/\n?\s*<link rel="stylesheet" href="styles\/main\.css" \/>/, '')
  .replace(/\n?\s*<script type="importmap">[\s\S]*?<\/script>/, '')
  .replace(/\n?\s*<script type="module" src="src\/main\.js"><\/script>/, '');

const inject = (marker, block) => {
  if (!html.includes(marker)) throw new Error('cannot find ' + marker + ' in index.html');
  // A replacer function, not a string: minified JS is full of $ sequences and
  // String.replace would read them as $&, $` and friends and splice the file
  // into itself.
  html = html.replace(marker, () => block + marker);
};

inject('</head>', `<style>\n${css}\n</style>\n`);
inject('</body>', `<script>\n${js}\n</script>\n`);

// A note for anyone who opens the file in a text editor rather than a browser.
html = html.replace('<!DOCTYPE html>', () =>
  '<!DOCTYPE html>\n<!-- GOREBOX - single file build. Open it in a browser. ' +
  'Source: https://github.com/crysball39-collab/Claude-games -->');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, html);

// Catch the two sequences that would end the inline script early.
for (const bad of ['</script', '<!--']) {
  const inScript = js.includes(bad);
  if (inScript) throw new Error(`bundle contains ${bad}, which would break the inline script`);
}

const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(`wrote ${path.relative(ROOT, OUT_FILE)}  (${kb(html.length)}; script ${kb(js.length)}, styles ${kb(css.length)})`);
