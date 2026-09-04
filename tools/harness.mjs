/* =============================================================================
   Test harness. Serves the game over http, drives it in a real browser and
   hands back a page plus a few helpers. Needs playwright and a chromium build:

     npm install -D playwright && npx playwright install chromium
     node tools/verify.mjs

   Set CHROMIUM_PATH to point at a chromium binary you already have.
   ========================================================================== */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const CHROME = process.env.CHROMIUM_PATH || undefined;

function serve() {
  return http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/') rel = '/index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
}

/**
 * Boots the game all the way into the Test Baseplate and returns the page
 * plus a few conveniences. `port` defaults to 0 so the OS picks a free one,
 * which stops a stale run from blocking a new one.
 */
export async function boot({
  port = 0, width = 900, height = 560, touch = false,
  shots = path.join(ROOT, '.shots'),
} = {}) {
  const server = serve();
  await new Promise((r) => server.listen(port, r));
  port = server.address().port;
  fs.mkdirSync(shots, { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: [
      '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--disable-dev-shm-usage',
    ],
  });
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 1,
    hasTouch: touch, isMobile: touch,
  });
  const page = await ctx.newPage();

  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push('[err] ' + m.text()); });
  page.on('pageerror', (e) => logs.push(
    '[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')));

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#menu-screen.active', { timeout: 30000 });
  await page.click('#btn-maps'); await page.waitForTimeout(120);
  await page.click('.map-card'); await page.waitForTimeout(120);
  await page.click('#btn-play');
  await page.waitForFunction(
    () => !document.querySelector('#map-screen').classList.contains('active'),
    { timeout: 150000 });
  await page.waitForTimeout(1200);

  return {
    page,
    logs,
    ev: (fn, ...args) => page.evaluate(fn, ...args),
    shot: (name) => page.screenshot({ path: `${shots}/${name}.png` }),
    /** Drags the on-screen joystick, the way a thumb would. */
    dragStick: async (dx, dy, steps = 12) => {
      const c = await page.evaluate(() => {
        const r = document.querySelector('#stick-base').getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      const cdp = await page.context().newCDPSession(page);
      const send = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
        type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
      });
      await send('touchStart', c.x, c.y);
      for (let i = 1; i <= steps; i++) {
        await send('touchMove', c.x + (dx * i) / steps, c.y + (dy * i) / steps);
      }
      return { release: () => send('touchEnd', c.x + dx, c.y + dy) };
    },
    hideHud: () => page.evaluate(() => { document.querySelector('#hud').style.display = 'none'; }),
    showHud: () => page.evaluate(() => { document.querySelector('#hud').style.display = ''; }),
    close: async () => { await browser.close(); server.close(); },
  };
}
