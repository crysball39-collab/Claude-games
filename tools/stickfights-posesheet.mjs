/* =============================================================================
   Draws every Stickfights clip, key by key, onto contact sheets, for checking
   poses by eye after editing stickfights/src/game/clips.js:

     node tools/stickfights-posesheet.mjs        -> .shots/sf-poses-*.png

   Needs playwright and a chromium build; set CHROMIUM_PATH to use your own.
   ========================================================================== */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, '.shots');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const PAGE = `<!DOCTYPE html><html><body style="margin:0;background:#9b9b9b">
<canvas id="c"></canvas>
<script type="module">
import { CLIPS } from '/stickfights/src/game/clips.js';
import { solve, makeJoints } from '/stickfights/src/game/skeleton.js';
import { drawStickman } from '/stickfights/src/game/draw.js';
const names = Object.keys(CLIPS);
const perSheet = 12, cellW = 132, cellH = 168, ppm = 62, cols = 8;
window.sheets = Math.ceil(names.length / perSheet);
window.draw = (sheet) => {
  const list = names.slice(sheet * perSheet, sheet * perSheet + perSheet);
  const c = document.getElementById('c');
  c.width = 150 + cols * cellW; c.height = list.length * cellH;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#9b9b9b'; ctx.fillRect(0, 0, c.width, c.height);
  list.forEach((name, row) => {
    const clip = CLIPS[name];
    ctx.fillStyle = '#000'; ctx.font = 'bold 15px sans-serif';
    ctx.fillText(name, 8, row * cellH + 24);
    ctx.font = '11px sans-serif';
    ctx.fillText((clip.loop ? 'loop ' : '') + clip.duration.toFixed(2) + 's', 8, row * cellH + 42);
    if (clip.strike) ctx.fillText('strike ' + clip.strike.limb, 8, row * cellH + 58);
    clip.frames.slice(0, cols).forEach((f, i) => {
      const ox = 150 + i * cellW + cellW / 2, oy = row * cellH + cellH - 22;
      ctx.fillStyle = '#000'; ctx.fillRect(150 + i * cellW + 4, oy, cellW - 8, 18);
      ctx.fillStyle = '#333'; ctx.font = '10px sans-serif';
      ctx.fillText(i + ': ' + f.d + 's' + (f.ev ? ' ' + f.ev : ''), 150 + i * cellW + 6, row * cellH + 12);
      const j = solve(f.p, 1, makeJoints());
      ctx.save();
      ctx.translate(ox, oy); ctx.scale(ppm, -ppm);
      drawStickman(ctx, j, { scale: 1, facing: 1, hair: 'tuft', weapon: name.startsWith('knife') || name === 'stab' || name === 'slash' ? 'knife' : 'knuckles',
        face: { eyes: 'normal', brow: 0, mouth: 0.3, open: 0 } });
      ctx.restore();
    });
  });
};
window.ready = true;
</script></body></html>`;

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/__posesheet.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1250, height: 900 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error(m.text()); });
await page.goto(`http://127.0.0.1:${server.address().port}/__posesheet.html`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 15000 });
const sheets = await page.evaluate(() => window.sheets);
for (let i = 0; i < sheets; i++) {
  await page.evaluate((n) => window.draw(n), i);
  const el = await page.$('#c');
  await el.screenshot({ path: path.join(SHOTS, `sf-poses-${i}.png`) });
  console.log('wrote .shots/sf-poses-' + i + '.png');
}
await browser.close();
server.close();
