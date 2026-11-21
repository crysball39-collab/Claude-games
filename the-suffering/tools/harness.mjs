/* Serves the repository and opens the game in a real browser. */
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installMockClaude } from './mockclaude.mjs';

// Needs playwright and a chromium to drive: npm i -D playwright && npx playwright install chromium.
// Set CHROMIUM_PATH to use a chromium you already have.
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); } catch { ({ chromium } = require('playwright')); }

export const GAME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = path.resolve(GAME, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };

export function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(REPO, rel);
    if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(0, () => r(server)));
}

/** An admin address for tests, made admin by a hash the test pages carry; the real admin address is in nobody's test code. */
export const TEST_ADMIN = 'admin@test.invalid';
const TEST_ADMIN_KEY = 'a3dab8f423c533b19fb171f54f029af9d8fd56ece286cb379710baa08128630a';

async function prep(page, logs, claude) {
  await page.addInitScript((keys) => { window.__TS_ADMIN_KEYS = keys; }, [TEST_ADMIN_KEY]);
  if (claude) await page.addInitScript(installMockClaude, claude);
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push('[' + m.type() + '] ' + m.text()); });
  page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
}

const ARGS = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--ignore-gpu-blocklist'];

export async function open({ width = 900, height = 520, touch = false, url = null, scale = 1, claude = null } = {}) {
  const server = url ? null : await serve();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ARGS });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  const logs = [];
  await prep(page, logs, claude);
  await page.goto(url || `http://127.0.0.1:${server.address().port}/the-suffering/index.html`, { waitUntil: 'load' });
  return { page, logs, browser, ev: (fn, ...a) => page.evaluate(fn, ...a), close: async () => { await browser.close(); server?.close(); } };
}

/**
 * Several pages of the game in one browser, each its own claude.ai viewer
 * (the stand-in above): players on the same multiplayer server, for tests.
 */
export async function openMany(viewers, { width = 900, height = 520 } = {}) {
  const server = await serve();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ARGS });
  const ctx = await browser.newContext({ viewport: { width, height } });
  const out = [];
  for (const claude of viewers) {
    const page = await ctx.newPage();
    const logs = [];
    await prep(page, logs, claude);
    await page.goto(`http://127.0.0.1:${server.address().port}/the-suffering/index.html`, { waitUntil: 'load' });
    out.push({ page, logs, ev: (fn, ...a) => page.evaluate(fn, ...a) });
  }
  return { pages: out, browser, close: async () => { await browser.close(); server.close(); } };
}
