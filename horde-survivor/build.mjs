/* =============================================================================
   Builds dist/horde-survivor.html: the whole game in one file (markup, styles
   and every script) so it can be copied to a phone and opened from the
   filesystem with no server. No dependencies.

     node horde-survivor/build.mjs
     node horde-survivor/build.mjs --artifact <path>   also writes a page body
                                                       for hosts that supply
                                                       their own <html>/<head>
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'dist', 'horde-survivor.html');

let html = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(HERE, 'style.css'), 'utf8');

const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>\n?/g)];
if (!scripts.length) throw new Error('no <script src> tags found in index.html');
const js = scripts.map(m => {
  const src = fs.readFileSync(path.join(HERE, m[1]), 'utf8');
  if (/<\/script/i.test(src)) throw new Error(m[1] + ' contains </script');
  return `/* ---- ${m[1]} ---- */\n${src}`;
}).join('\n');

// Replacer functions, not strings: the sources contain `$` sequences that
// String.replace would otherwise read as patterns.
const swap = (from, to) => {
  if (!html.includes(from)) throw new Error('cannot find ' + from);
  html = html.replace(from, () => to);
};
swap('<link rel="stylesheet" href="style.css">', `<style>\n${css}</style>`);
scripts.forEach((m, i) => swap(m[0], i === scripts.length - 1 ? `<script>\n${js}</script>\n` : ''));
html = html.replace('<!doctype html>', () => '<!doctype html>\n<!-- Horde Survivor - single file build. Open it in a browser. Source: horde-survivor/ -->');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`wrote ${path.relative(process.cwd(), OUT)} (${(html.length / 1024).toFixed(0)} KB)`);

const ai = process.argv.indexOf('--artifact');
if (ai > 0) {
  const target = process.argv[ai + 1];
  if (!target) throw new Error('--artifact needs a path');
  const between = (a, b) => {
    const i = html.indexOf(a), j = html.indexOf(b);
    if (i < 0 || j < 0) throw new Error('missing marker ' + a);
    return html.slice(i + a.length, j).trim();
  };
  const page = between('<!--artifact-head-->', '<!--/artifact-head-->') + '\n' + between('<!--artifact-body-->', '<!--/artifact-body-->') + '\n';
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, page);
  console.log(`wrote ${target} (${(page.length / 1024).toFixed(0)} KB)`);
}
