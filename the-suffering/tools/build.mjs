/* =============================================================================
   Folds the whole game into one file - markup, styles, three.js, every module -
   so it can be put on a phone and opened with no server and no network.

     npm install
     node tools/build.mjs                 -> dist/the-suffering.html
     node tools/build.mjs --page out.html    the same game as bare page content,
                                             for hosts that supply their own
                                             <html> and <head>
   ========================================================================== */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.resolve(ROOT, '..', 'vendor');

const result = await build({
  entryPoints: [path.join(ROOT, 'src/main.js')],
  bundle: true,
  write: false,
  format: 'iife',
  target: ['es2020'],
  minify: true,
  legalComments: 'none',
  alias: { three: path.join(VENDOR, 'three.module.js'), '@anthropic-ai/sdk': path.join(VENDOR, 'anthropic-sdk.js') },
  logLevel: 'warning',
});
const js = result.outputFiles[0].text;
for (const bad of ['</script', '<!--']) if (js.includes(bad)) throw new Error(`the bundle contains ${bad}, which would end the inline script early`);

const css = fs.readFileSync(path.join(ROOT, 'styles/main.css'), 'utf8');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const body = src.slice(src.indexOf('<body>') + 6, src.indexOf('</body>'))
  .replace(/\n?\s*<script type="module" src="src\/main\.js"><\/script>/, '');
if (body.includes('src/main.js')) throw new Error('could not remove the module script tag');

const kb = (n) => (n / 1024).toFixed(0) + ' KB';
const pageAt = process.argv.indexOf('--page');
if (pageAt > 0) {
  // content only: the host wraps it in its own document
  const out = path.resolve(process.argv[pageAt + 1]);
  const page = `<title>The Suffering</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>\n${css}\n</style>\n${body}\n<script>\n${js}\n</script>\n`;
  fs.writeFileSync(out, page);
  console.log(`wrote ${out}  (${kb(page.length)})`);
} else {
  let head = src.slice(0, src.indexOf('</head>'))
    .replace(/\n?\s*<link rel="stylesheet" href="styles\/main\.css" \/>/, '')
    .replace(/\n?\s*<script type="importmap">[\s\S]*?<\/script>/, '');
  if (head.includes('importmap') || head.includes('main.css')) throw new Error('could not strip the links from <head>');
  head = head.replace('<!DOCTYPE html>', () => '<!DOCTYPE html>\n<!-- The Suffering - single file build. Open it in a browser. Source: https://github.com/crysball39-collab/Claude-games -->');
  // replacer functions, not strings: minified code is full of $ sequences
  const html = `${head}<style>\n${css}\n</style>\n</head>\n<body>${body}<script>\n${js}\n</script>\n</body>\n</html>\n`;
  fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'dist/the-suffering.html'), html);
  console.log(`wrote dist/the-suffering.html  (${kb(html.length)}; script ${kb(js.length)}, styles ${kb(css.length)})`);
}
