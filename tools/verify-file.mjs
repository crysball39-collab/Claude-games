/* =============================================================================
   Checks dist/gorebox.html the way a phone actually opens it: straight off the
   filesystem, no server, no flags, no network. Everything here goes through the
   real HUD - taps on real buttons - because that is what a player touches.

     npm run build && npm run verify:file

   Screenshots land in .shots/file/. Set CHROMIUM_PATH to reuse a chromium you
   already have.
   ========================================================================== */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'file://' + path.join(ROOT, 'dist', 'gorebox.html');
const SHOTS = path.join(ROOT, '.shots', 'file');

if (!fs.existsSync(path.join(ROOT, 'dist', 'gorebox.html'))) {
  console.error('dist/gorebox.html is missing - run: npm run build');
  process.exit(1);
}
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
         '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
// a phone in landscape, with touch
const ctx = await browser.newContext({
  viewport: { width: 844, height: 390 },
  deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
});
const page = await ctx.newPage();

const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push('[err] ' + m.text()); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
page.on('requestfailed', (r) => logs.push('[reqfail] ' + r.url().slice(0, 90) + ' ' + r.failure()?.errorText));

// Anything that leaves the file itself is a bug in the single file build: the
// download has to work with the phone in flight mode.
const external = [];
page.on('request', (r) => {
  const u = r.url();
  if (!u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
});

const fail = [];
const check = (name, ok, detail = '') => {
  if (!ok) fail.push(name);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};
const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });

await page.goto(FILE, { waitUntil: 'load' });

let booted = true;
try {
  await page.waitForSelector('#menu-screen.active', { timeout: 60000 });
} catch (e) {
  booted = false;
  console.log('boot status:', await page.evaluate(() => document.querySelector('#boot-status')?.textContent));
  await shot('0-stuck');
}
check('the menu comes up from file://', booted);
if (!booted) { console.log(logs.join('\n')); await browser.close(); process.exit(1); }

await page.waitForTimeout(400);
await shot('1-menu');

/* ------------------------------- into a map -------------------------------- */
await page.tap('#btn-maps'); await page.waitForTimeout(300);
await page.tap('.map-card'); await page.waitForTimeout(300);
await shot('2-maps');
await page.tap('#btn-play');
await page.waitForFunction(
  () => !document.querySelector('#map-screen').classList.contains('active'),
  { timeout: 180000 },
);
await page.waitForTimeout(2500);
await shot('3-game');
check('the map loads and the game runs', await page.evaluate(() => !!window.GOREBOX.game?.running));

/* ----------------------------- the joystick -------------------------------- */
// Straight after loading, which is exactly when it used to be dead.
const stick = await page.evaluate(() => {
  const r = document.querySelector('#stick-base').getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
const before = await page.evaluate(() => ({ ...window.GOREBOX.game.player.pos }));
await page.touchscreen.tap(stick.x, stick.y);           // wake the touch stack
const client = await page.context().newCDPSession(page);
const touch = (type, x, y) => client.send('Input.dispatchTouchEvent', {
  type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 12, radiusY: 12 }],
});
await touch('touchStart', stick.x, stick.y);
for (let i = 1; i <= 8; i++) await touch('touchMove', stick.x, stick.y - i * 7);
await page.waitForTimeout(900);
const held = await page.evaluate(() => ({ ...window.GOREBOX.game.player.moveInput }));
await touch('touchEnd', stick.x, stick.y);
const after = await page.evaluate(() => ({ ...window.GOREBOX.game.player.pos }));
const moved = Math.hypot(after.x - before.x, after.z - before.z);
check('the stick moves you seconds after loading',
  moved > 0.5 && Math.abs(held.z) > 0.5, JSON.stringify({ moved: +moved.toFixed(2), held }));

/* --------------------------- spawning with the RCV2 ------------------------ */
await page.tap('#btn-hamburger'); await page.waitForTimeout(400);
await shot('4-drawer');
await page.tap('.item[data-id="boulder"]'); await page.waitForTimeout(200);
await page.tap('#btn-close-drawer'); await page.waitForTimeout(300);
await page.tap('.wslot[data-weapon="rcv2"]'); await page.waitForTimeout(600);
await page.tap('#btn-spawn'); await page.waitForTimeout(1500);
await page.tap('#btn-spawn'); await page.waitForTimeout(1800);
await shot('5-spawned');
check('the drawer and the RCV2 spawn things',
  (await page.evaluate(() => window.GOREBOX.game.stats.objects)) >= 2);

// clear them out through the pause menu, so the machete lands on open ground
await page.tap('#btn-pause'); await page.waitForTimeout(300);
await page.tap('#btn-clear'); await page.waitForTimeout(200);
await page.tap('#btn-resume'); await page.waitForTimeout(400);

/* ------------------------------- the machete ------------------------------- */
await page.tap('#btn-hamburger'); await page.waitForTimeout(350);
await page.tap('.item[data-id="machete"]'); await page.waitForTimeout(150);
await page.tap('#btn-close-drawer'); await page.waitForTimeout(250);
await page.tap('#btn-spawn'); await page.waitForTimeout(1500);

const walk = await page.evaluate(() => {
  const g = window.GOREBOX.game;
  const m = g.spawnedBodies.find((b) => b.tag === 'machete');
  if (!m) return { found: false };
  // Stand a step behind it and look at it. camYaw is what aiming reads, and
  // the camera overwrites the yaw teleport sets on the very next frame.
  g.player.teleport(m.pos.x, m.pos.z + 0.9, 0);
  g.camYaw = 0; g.camPitch = -0.15;
  return { found: true };
});
await page.waitForTimeout(600);
const offered = await page.evaluate(
  () => document.querySelector('#btn-use').classList.contains('show'));
check('USE offers itself when the machete is in reach', walk.found && offered);

await page.tap('#btn-use'); await page.waitForTimeout(700);
await shot('6-machete');
await page.tap('#btn-primary'); await page.waitForTimeout(300);
await shot('7-slash');
const machete = await page.evaluate(() => ({
  carrying: !!window.GOREBOX.game.carried,
  equipped: window.GOREBOX.game.equipped,
  slashing: window.GOREBOX.game.player.animator.actionName,
}));
check('USE picks the machete up and PRIMARY slashes with it',
  machete.carrying && machete.equipped === 'machete' && /slash/.test(machete.slashing || ''),
  JSON.stringify(machete));

/* -------------------------------- the rest --------------------------------- */
const state = await page.evaluate(() => ({
  running: window.GOREBOX.game.running,
  fps: window.GOREBOX.game.stats.fps,
  origin: location.protocol,
}));
check('nothing is fetched from the network', external.length === 0,
  external.length ? external.slice(0, 4).join(' ') : 'fully self contained');
check('no errors along the way', logs.length === 0);

console.log('\nstate:', JSON.stringify(state));
if (logs.length) console.log(logs.slice(0, 10).join('\n'));
console.log(fail.length ? '\nFAILURES: ' + fail.join(', ') : '\nAll checks passed.');
await browser.close();
process.exit(fail.length ? 1 : 0);
