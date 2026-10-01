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
/* The HUD only re-asks what is in reach every eighth of a second, and a
   freshly dropped machete is still rolling, so wait for the button rather
   than for the clock. */
await page.waitForFunction(
  () => document.querySelector('#btn-use').classList.contains('show'),
  null, { timeout: 15000 },
).catch(() => {});
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

/* ----------------------------- the sledgehammer ---------------------------- */
await page.tap('#btn-use'); await page.waitForTimeout(400);      // put the blade down
await page.tap('#btn-pause'); await page.waitForTimeout(300);
await page.tap('#btn-clear'); await page.waitForTimeout(200);
await page.tap('#btn-resume'); await page.waitForTimeout(400);
await page.tap('#btn-hamburger'); await page.waitForTimeout(350);
await page.tap('.item[data-id="sledge"]'); await page.waitForTimeout(150);
await page.tap('#btn-close-drawer'); await page.waitForTimeout(250);
await page.tap('.wslot[data-weapon="rcv2"]'); await page.waitForTimeout(300);
await page.tap('#btn-spawn'); await page.waitForTimeout(1600);
await page.evaluate(() => {
  const g = window.GOREBOX.game;
  const m = g.spawnedBodies.find((b) => b.tag === 'sledge');
  if (!m) return;
  g.player.teleport(m.pos.x, m.pos.z + 0.9, 0);
  g.camYaw = 0; g.camPitch = -0.15;
  g.setEquipped('fists');
});
await page.waitForTimeout(600);
await page.tap('#btn-use'); await page.waitForTimeout(700);
await shot('8-sledge');
await page.tap('#btn-primary');
// A two-handed swing is a slow thing to start; watch for it rather than
// guessing when to look.
const sledge = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const a = g.player.animator;
  let seen = a.actionName;
  for (let i = 0; i < 90 && !seen; i++) {
    await new Promise((res) => requestAnimationFrame(res));
    seen = a.actionName;
  }
  return {
    carrying: g.carried?.kind || null,
    equipped: g.equipped,
    swinging: seen,
    state: g.player.state,
    cooldown: +g.player.punchCooldown.toFixed(2),
    label: document.querySelector('#btn-primary').textContent,
  };
});
await shot('9-swing');
check('USE picks the sledgehammer up and PRIMARY swings it',
  sledge.carrying === 'sledge' && sledge.equipped === 'sledge' &&
  /swing/.test(sledge.swinging || '') && sledge.label === 'SWING', JSON.stringify(sledge));

/* --------------------------------- the guns -------------------------------- */
await page.tap('#btn-use'); await page.waitForTimeout(400);      // put the hammer down

/* Every firearm, through the buttons a player actually has: spawn it, walk to
   it, USE to pick it up, FIRE, then RELOAD back to a full magazine. */
for (const [kind, cap] of [['glock', '15'], ['ak47', '30'], ['m16', '30']]) {
  await page.tap('#btn-pause'); await page.waitForTimeout(300);
  await page.tap('#btn-clear'); await page.waitForTimeout(200);
  await page.tap('#btn-resume'); await page.waitForTimeout(400);
  await page.tap('#btn-hamburger'); await page.waitForTimeout(350);
  await page.tap(`.item[data-id="${kind}"]`); await page.waitForTimeout(150);
  await page.tap('#btn-close-drawer'); await page.waitForTimeout(250);
  await page.tap('.wslot[data-weapon="rcv2"]'); await page.waitForTimeout(300);
  await page.tap('#btn-spawn'); await page.waitForTimeout(1500);
  await page.evaluate((k) => {
    const g = window.GOREBOX.game;
    const m = g.spawnedBodies.find((b) => b.tag === k);
    if (!m) return;
    g.player.teleport(m.pos.x, m.pos.z + 0.9, 0);
    g.camYaw = 0; g.camPitch = -0.15;
    g.setEquipped('fists');
  }, kind);
  await page.waitForTimeout(600);
  await page.tap('#btn-use'); await page.waitForTimeout(700);
  await shot(`10-${kind}`);
  const ammoBefore = await page.evaluate(() => document.querySelector('#ammo-now').textContent);
  await page.tap('#btn-primary'); await page.waitForTimeout(500);
  await shot(`11-${kind}-fired`);
  const ammoFired = await page.evaluate(() => document.querySelector('#ammo-now').textContent);
  await page.tap('#btn-reload');
  // Reloading takes a second and a half of GAME time, and this renderer is slow
  // enough that that is several seconds of ours.
  await page.waitForFunction(
    (want) => document.querySelector('#ammo-now').textContent === want,
    cap, { timeout: 25000 },
  ).catch(() => {});
  const gun = await page.evaluate((k) => ({
    carrying: window.GOREBOX.game.carried?.kind || null,
    equipped: window.GOREBOX.game.equipped,
    label: document.querySelector('#btn-primary').textContent,
    reloadShown: document.querySelector('#btn-reload').classList.contains('show'),
    slot: !document.querySelector('#slot-' + k).classList.contains('hidden'),
    ammo: document.querySelector('#ammo-now').textContent,
    visible: !document.querySelector('#ammo-readout').classList.contains('hidden'),
  }), kind);
  check(`USE takes the ${kind}, PRIMARY fires it and RELOAD fills it`,
    gun.carrying === kind && gun.equipped === kind && gun.label === 'FIRE' &&
    gun.reloadShown && gun.slot && gun.visible &&
    ammoBefore === cap && +ammoFired < +cap && gun.ammo === cap,
    JSON.stringify({ ...gun, ammoBefore, ammoFired }));
  await page.tap('#btn-use'); await page.waitForTimeout(500);   // put it down again
}

/* ------------------------------- the crowbar ------------------------------- */
await page.tap('#btn-pause'); await page.waitForTimeout(300);
await page.tap('#btn-clear'); await page.waitForTimeout(200);
await page.tap('#btn-resume'); await page.waitForTimeout(400);
await page.tap('#btn-hamburger'); await page.waitForTimeout(350);
await page.tap('.item[data-id="crowbar"]'); await page.waitForTimeout(150);
await page.tap('#btn-close-drawer'); await page.waitForTimeout(250);
await page.tap('.wslot[data-weapon="rcv2"]'); await page.waitForTimeout(300);
await page.tap('#btn-spawn'); await page.waitForTimeout(1500);
await page.evaluate(() => {
  const g = window.GOREBOX.game;
  const m = g.spawnedBodies.find((b) => b.tag === 'crowbar');
  if (!m) return;
  g.player.teleport(m.pos.x, m.pos.z + 0.9, 0);
  g.camYaw = 0; g.camPitch = -0.15;
  g.setEquipped('fists');
});
await page.waitForTimeout(600);
await page.tap('#btn-use'); await page.waitForTimeout(700);
await shot('12-crowbar');
await page.tap('#btn-primary'); await page.waitForTimeout(900);
const bar = await page.evaluate(() => ({
  carrying: window.GOREBOX.game.carried?.kind || null,
  equipped: window.GOREBOX.game.equipped,
  swinging: window.GOREBOX.game.player.animator.actionName,
  label: document.querySelector('#btn-primary').textContent,
  slot: !document.querySelector('#slot-crowbar').classList.contains('hidden'),
}));
check('USE picks the crowbar up and PRIMARY swings it',
  bar.carrying === 'crowbar' && bar.equipped === 'crowbar' && bar.label === 'SWING' &&
  bar.slot && /crowbar[RL]/.test(bar.swinging || ''), JSON.stringify(bar));
await page.tap('#btn-use'); await page.waitForTimeout(500);

/* ------------------------------ the light vest ----------------------------- */
await page.tap('#btn-pause'); await page.waitForTimeout(300);
await page.tap('#btn-clear'); await page.waitForTimeout(200);
await page.tap('#btn-resume'); await page.waitForTimeout(400);
await page.tap('#btn-hamburger'); await page.waitForTimeout(350);
await page.tap('.item[data-id="vest"]'); await page.waitForTimeout(150);
await page.tap('#btn-close-drawer'); await page.waitForTimeout(250);
await page.tap('.wslot[data-weapon="rcv2"]'); await page.waitForTimeout(300);
await page.tap('#btn-spawn'); await page.waitForTimeout(1500);
await page.evaluate(() => {
  const g = window.GOREBOX.game;
  const m = g.spawnedBodies.find((b) => b.tag === 'vest');
  if (!m) return;
  g.player.teleport(m.pos.x, m.pos.z + 0.9, 0);
  g.camYaw = 0; g.camPitch = -0.2;
  g.setEquipped('fists');
});
/* This renderer runs at a quarter speed, so game time and wall time are not
   the same thing. Wait for the state to actually change rather than guessing
   how long it takes. */
const wornIs = (want) => page.waitForFunction(
  (w) => !!window.GOREBOX.game.player.armour === w, want, { timeout: 20000 },
).catch(() => {});
await page.waitForFunction(
  () => document.querySelector('#btn-use').textContent === 'WEAR', null, { timeout: 20000 },
).catch(() => {});
const vestOffer = await page.evaluate(() => document.querySelector('#btn-use').textContent);
await page.tap('#btn-use');
await wornIs(true);
await page.waitForFunction(
  () => document.querySelector('#btn-use').textContent === 'TAKE OFF', null, { timeout: 20000 },
).catch(() => {});
await shot('13-vest');
const vest = await page.evaluate(() => ({
  offer: document.querySelector('#btn-use').textContent,
  worn: !!window.GOREBOX.game.player.armour,
  hp: window.GOREBOX.game.player.armour?.hp,
  bar: !document.querySelector('#armour-wrap').classList.contains('hidden'),
}));
await page.tap('#btn-use');                                        // take it off again
await wornIs(false);
await page.waitForTimeout(400);
const vestOff = await page.evaluate(() => ({
  worn: !!window.GOREBOX.game.player.armour,
  onGround: window.GOREBOX.game.spawnedBodies.some((b) => b.tag === 'vest'),
}));
check('USE wears the light vest and takes it off again',
  vestOffer === 'WEAR' && vest.worn && vest.hp > 0 && vest.bar &&
  vest.offer === 'TAKE OFF' && !vestOff.worn && vestOff.onGround,
  JSON.stringify({ vestOffer, ...vest, ...vestOff }));

/* ------------------------------ full screen -------------------------------- */
const full = await page.evaluate(() => {
  const hud = document.querySelector('#btn-fullscreen');
  const pause = document.querySelector('#btn-fullscreen-pause');
  return { hud: !!hud, pause: !!pause, hudShown: hud && hud.style.display !== 'none' };
});
check('the full screen button is on the HUD and in the pause menu',
  full.hud && full.pause && full.hudShown, JSON.stringify(full));

/* ---------------- the secret way, the fight, and the prize ------------------ */
/* Everything a player touches on the way: USE on the red RCV2 in the pit,
   USE on the fireball, SKIP, TAKE on what Silva leaves, the FIRE FIST slot and
   its FIREBALL button. Getting to each one is done for the test, and so is
   killing him - 2500 hit points of tapping is not what this file is checking. */
const arrive = (id) => page.waitForFunction(
  (want) => window.GOREBOX.game?.map?.id === want && window.GOREBOX.state === 'playing',
  id, { timeout: 180000 },
).then(() => true).catch(() => false);
const useSays = (label) => page.waitForFunction(
  (want) => document.querySelector('#btn-use').classList.contains('show')
    && document.querySelector('#btn-use').textContent === want,
  label, { timeout: 30000 },
).then(() => true).catch(() => false);

await page.evaluate(() => window.GOREBOX.game.travel('pitvalley'));
const inValley = await arrive('pitvalley');
await page.evaluate(() => {
  const g = window.GOREBOX.game;
  const egg = g.map.interactables.find((i) => i.id === 'redRCV2');
  g.player.teleport(egg.position.x - 1.3, egg.position.z + 1.1, 0);
  g.camYaw = Math.atan2(-(egg.position.x - g.player.pos.x), -(egg.position.z - g.player.pos.z));
  g.camPitch = -0.3;
});
const touchEgg = await useSays('TOUCH');
await shot('14-egg');
await page.tap('#btn-use');
const inRed = await arrive('redplains');
await page.evaluate(() => {
  const g = window.GOREBOX.game;
  g.player.teleport(0, 1.8, 0); g.camYaw = 0; g.camPitch = 0.1;
});
const touchOrb = await useSays('TOUCH');
await page.tap('#btn-use');
const playing = await page.waitForFunction(
  () => document.querySelector('#cutscene').classList.contains('on'), null, { timeout: 20000 },
).then(() => true).catch(() => false);
await page.waitForTimeout(600);
await shot('15-cutscene');
await page.tap('#btn-skip');
const fight = await page.waitForFunction(
  () => window.GOREBOX.game.encounter?.state === 'fight'
    && !document.querySelector('#boss-bar').classList.contains('hidden'),
  null, { timeout: 20000 },
).then(() => true).catch(() => false);
await page.waitForTimeout(500);
await shot('16-fight');
await page.evaluate(() => window.GOREBOX.game.encounter.boss.takeDamage(99999));
const won = await page.waitForFunction(
  () => window.GOREBOX.game.encounter?.rewardUse.enabled, null, { timeout: 60000 },
).then(() => true).catch(() => false);
await page.evaluate(() => {
  const g = window.GOREBOX.game, e = g.encounter;
  g.player.teleport(e.rewardBase.x, e.rewardBase.z + 1.6, 0); g.camYaw = 0; g.camPitch = 0.1;
});
const take = await useSays('TAKE');
await shot('17-reward');
await page.tap('#btn-use');
const home = await arrive('pitvalley');
await page.waitForTimeout(500);
const slotShown = await page.evaluate(
  () => !document.querySelector('#slot-firefist').classList.contains('hidden'));
await page.tap('.wslot[data-weapon="firefist"]'); await page.waitForTimeout(400);
await page.evaluate(() => {
  const g = window.GOREBOX.game;
  g.player.teleport(g.map.openArea.x, g.map.openArea.z, 0); g.camYaw = 0; g.camPitch = 0;
});
await page.waitForTimeout(300);
await page.tap('#btn-fireball');
const threw = await page.waitForFunction(
  () => window.GOREBOX.game.fire.balls.length > 0, null, { timeout: 15000 },
).then(() => true).catch(() => false);
await shot('18-firefist');
const ff = await page.evaluate(() => ({
  equipped: window.GOREBOX.game.equipped,
  button: document.querySelector('#firefist-extra').classList.contains('show'),
}));
check('the red RCV2 in the pit, USE: off to Red Plains', inValley && touchEgg && inRed);
check('USE on the fireball plays the cutscene, and SKIP goes straight to the fight',
  touchOrb && playing && fight);
check('Silva dead, TAKE on his red RCV2: back to Pit Valley with the Fire Fist',
  won && take && home && slotShown);
check('the FIRE FIST slot equips it and FIREBALL throws one',
  ff.equipped === 'firefist' && ff.button && threw, JSON.stringify(ff));

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
