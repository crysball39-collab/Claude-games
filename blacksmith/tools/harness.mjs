/* =============================================================================
   Test harness. Serves the repository over http, opens Blacksmith in a real
   browser and hands back the page plus a few helpers.

     node blacksmith/tools/verify.mjs

   Set CHROMIUM_PATH to point at a chromium binary you already have.
   ========================================================================== */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const GAME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(GAME, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function serve() {
  return http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/') rel = '/blacksmith/index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
}

export async function launch({ width = 844, height = 390, touch = true, url = null, init = null } = {}) {
  let server = null, target = url;
  if (!target) {
    server = serve();
    await new Promise((r) => server.listen(0, r));
    target = `http://127.0.0.1:${server.address().port}/blacksmith/index.html`;
  }
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch,
  });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ` + m.text()); });
  page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')));
  await page.goto(target, { waitUntil: 'load' });
  return {
    page, ctx, browser, logs,
    ev: (fn, ...a) => page.evaluate(fn, ...a),
    close: async () => { await browser.close(); server?.close(); },
  };
}
