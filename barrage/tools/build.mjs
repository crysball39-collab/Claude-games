/* =============================================================================
   Builds dist/barrage.html: the whole game folded into one file - markup,
   styles, fonts, three.js and every module - so it can be downloaded onto a
   phone and opened straight from the filesystem, with no server and no
   network.

   And dist/barrage-page.html: the same game as the content of its Claude
   page, which is where accounts and cloud saves work. That page is wrapped
   in its own <html>, <head> and <body> when it is published, so this one
   leaves them out and starts with its title and styles.

     npm install -D esbuild
     npm run build:barrage
   ========================================================================== */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(GAME, '..');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT_FILE = path.join(OUT_DIR, 'barrage.html');
const PAGE_FILE = path.join(OUT_DIR, 'barrage-page.html');

/* ------------------------------ the bundle ------------------------------- */

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

/* ------------------------------- the page -------------------------------- */

// the fonts go into the stylesheet as data, so nothing is fetched for them either
let css = fs.readFileSync(path.join(GAME, 'style.css'), 'utf8');
css = css.replace(/url\('fonts\/([^']+)'\)/g, (m, file) => {
  const data = fs.readFileSync(path.join(GAME, 'fonts', file)).toString('base64');
  return `url(data:font/woff2;base64,${data})`;
});
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
  // a replacer function: minified code is full of $ sequences String.replace would expand
  html = html.replace(marker, () => block + marker);
};
inject('</head>', `<style>\n${css}\n</style>\n`);
inject('</body>', `<script>\n${js}\n</script>\n`);

html = html.replace('<!DOCTYPE html>', () =>
  '<!DOCTYPE html>\n<!-- BARRAGE - single file build. Open it in a browser. ' +
  'Source: https://github.com/crysball39-collab/Claude-games/tree/main/barrage -->');

for (const bad of ['</script', '<!--']) {
  if (js.includes(bad)) throw new Error(`bundle contains ${bad}, which would break the inline script`);
}
for (const left of ['src="src/', 'href="style', 'importmap', "url('fonts/"]) {
  if (html.includes(left)) throw new Error(`the page still points at ${left} after inlining`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, html);
const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(`wrote ${path.relative(ROOT, OUT_FILE)}  (${kb(html.length)}; script ${kb(js.length)}, styles ${kb(css.length)})`);

/* ------------------------------ the Claude page ------------------------------ */

const bodyStart = html.indexOf('<body>'), bodyEnd = html.lastIndexOf('</body>');
if (bodyStart < 0 || bodyEnd < 0) throw new Error('cannot find the body in the built page');
const page = '<title>Barrage</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>\n' + css + '\n</style>\n' +
  html.slice(bodyStart + '<body>'.length, bodyEnd).trim() + '\n';
fs.writeFileSync(PAGE_FILE, page);
console.log(`wrote ${path.relative(ROOT, PAGE_FILE)}  (${kb(page.length)})`);
