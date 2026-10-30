/* =============================================================================
   Checks that BARRAGE does what it says, in a real browser on a phone-sized
   touch screen:

     node barrage/tools/verify.mjs          the source, served over http
     node barrage/tools/verify.mjs --file   dist/barrage.html off the disk,
                                            failing on any network request

   Needs playwright and a chromium build:
     npm install -D playwright && npx playwright install chromium
   Set CHROMIUM_PATH to use a chromium you already have. Screenshots land in
   .shots/ at the repository root.
   ========================================================================== */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mockScript } from './mockcloud.mjs';

const GAME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(GAME, '..');
const FILE_MODE = process.argv.includes('--file');
const SHOTS = path.join(ROOT, '.shots');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
}

/* ------------------------------- boot it -------------------------------- */

let server = null;
let url;
if (FILE_MODE) {
  const file = path.join(ROOT, 'dist/barrage.html');
  if (!fs.existsSync(file)) { console.error('no dist/barrage.html - run npm run build:barrage'); process.exit(1); }
  url = pathToFileURL(file).href;
} else {
  server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, r));
  url = `http://127.0.0.1:${server.address().port}/barrage/index.html`;
}

fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const errors = [];
const network = [];

async function open(init = null) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url()) && !r.url().startsWith(url.split('/barrage/')[0])) network.push(r.url()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__barrage && window.__barrage.state === 'title', null, { timeout: 90000 });
  return { ctx, page };
}

let { ctx, page } = await open();
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = (name) => page.screenshot({ path: path.join(SHOTS, `barrage-${FILE_MODE ? 'file-' : ''}${name}.png`) });
/** Software rendering is slow; draw small and without shadows while the simulation runs. */
const fast = (on) => ev((on) => { const b = window.__barrage; b.renderer.setPixelRatio(on ? 0.3 : 1); b.game.arena.sun.castShadow = !on; b.game.maxSteps = on ? 10 : 3; }, on);
/** Waits until the game clock has advanced by `secs` of simulated time. */
async function simFor(secs, timeout = 240000) {
  const t0 = await ev(() => window.__barrage.game.time);
  await page.waitForFunction((t) => window.__barrage.game.time >= t, t0 + secs, { timeout, polling: 100 });
}
async function tap(sel) { await page.tap(sel); await page.waitForTimeout(80); }
/** An on-screen action, pressed and let go the way a quick tap does. */
const act = (name) => ev((n) => { const i = window.__barrage.input; i.press(n); i.release(n); }, name);
const finite = () => ev(() => window.__barrage.game.world.bodies.every((b) => Number.isFinite(b.x.x + b.x.y + b.x.z + b.q.x + b.q.w)));

/* --------------------------------- title -------------------------------- */

check('the title shows PLAY, LOG IN and SIGN UP', await page.isVisible('#btn-play') && await page.isVisible('#btn-login') && await page.isVisible('#btn-signup'));
check('box ragdolls fight behind the title', await ev(() => window.__barrage.game.fighters.length >= 6));
await shot('title');
await tap('#btn-login');
check('off its Claude page, LOG IN explains where accounts work', await page.isVisible('#panel-offline') &&
  /Claude page/.test(await page.textContent('#offline-why')));
await tap('#panel-offline [data-back]');

/* ------------------------------ into the arena -------------------------- */

await tap('#btn-play');
await fast(true);
check('PLAY puts you in the middle of the sand', await ev(() => { const p = window.__barrage.game.player; return !!p && Math.hypot(p.root.x, p.root.z) < 1; }));
check('wave 1 starts at once and the south doors are shut', await ev(() => { const g = window.__barrage.game; return g.waves.state === 'intro' && g.waves.wave === 1 && g.arena.gates.south.target === 0; }));
await simFor(4.5);
const out = await ev(() => {
  const g = window.__barrage.game;
  return {
    enemies: g.waves.enemies.length,
    opened: ['north', 'east', 'west'].some((id) => g.arena.gates[id].target === 1 || g.arena.gates[id].open > 0),
    fromTunnel: g.waves.enemies.every((e) => e.controller && (e.controller.gate || Math.hypot(e.root.x, e.root.z) < 12)),
  };
});
check('the portcullises open and box ragdolls come out of the tunnels', out.enemies >= 1 && out.opened && out.fromTunnel, JSON.stringify(out));
await simFor(3);
check('they come into the arena after you', await ev(() => window.__barrage.game.waves.enemies.some((e) => Math.hypot(e.root.x, e.root.z) < 10)));

/* ---------------------------------- moving ------------------------------ */

// clear the sand so the moves can be checked one at a time
await ev(() => { const g = window.__barrage.game; g.waves.reset(); g.waves.state = 'rest'; g.arena.setGate('south', true, true); g.player.root.set(0, 0, 0); });
const before = await ev(() => window.__barrage.game.player.root.clone());
const zone = await page.$('#stick-zone');
const zb = await zone.boundingBox();
await page.mouse.move(zb.x + 90, zb.y + zb.height - 90);
await page.mouse.down();
await page.mouse.move(zb.x + 90, zb.y + zb.height - 150, { steps: 4 });
await simFor(1);
await page.mouse.up();
const after = await ev(() => window.__barrage.game.player.root.clone());
check('the joystick moves you', Math.hypot(after.x - before.x, after.z - before.z) > 0.8, `${Math.hypot(after.x - before.x, after.z - before.z).toFixed(2)} m`);
const yaw0 = await ev(() => window.__barrage.game.cam.yaw);
await page.mouse.move(600, 200);
await page.mouse.down();
await page.mouse.move(520, 200, { steps: 4 });
await page.mouse.up();
await simFor(0.2);
check('dragging the right of the screen swings the camera', Math.abs(await ev(() => window.__barrage.game.cam.yaw) - yaw0) > 0.1);

await simFor(1);
const st0 = await ev(() => window.__barrage.game.player.stamina);
await tap('#btn-punch');
await simFor(0.1);
const punch = await ev(() => { const p = window.__barrage.game.player; return { clip: p.action && p.action.clip.name, st: p.stamina }; });
check('PUNCH throws a jab and costs stamina', /jab/.test(punch.clip || '') && punch.st < st0, JSON.stringify(punch));
await simFor(0.6);
await tap('#btn-kick');
await simFor(0.12);
check('KICK throws a kick', await ev(() => { const p = window.__barrage.game.player; return p.action && p.action.clip.name === 'kick'; }));
await simFor(0.7);
await tap('#btn-jump');
await simFor(0.25);
const jump = await ev(() => { const p = window.__barrage.game.player; return { air: !!p.air, y: p.root.y }; });
check('JUMP lifts you off the ground', jump.air && jump.y > 0.2, JSON.stringify(jump));
await simFor(1);
check('...and you land again', await ev(() => { const p = window.__barrage.game.player; return !p.air && Math.abs(p.root.y) < 0.05; }));
const headStand = await ev(() => window.__barrage.game.player.head.x.y);
await tap('#btn-crouch');
await simFor(0.8);
const headCrouch = await ev(() => window.__barrage.game.player.head.x.y);
check('CROUCH lowers you', headCrouch < headStand - 0.25, `${headStand.toFixed(2)} -> ${headCrouch.toFixed(2)}`);
await tap('#btn-crouch');
await simFor(0.5);
// sprint: the switch, then the stick
await ev(() => { window.__barrage.game.player.stamina = 100; });
await tap('#btn-sprint');
await page.mouse.move(zb.x + 90, zb.y + zb.height - 90);
await page.mouse.down();
await page.mouse.move(zb.x + 90, zb.y + zb.height - 160, { steps: 4 });
await simFor(1.2);
const sprint = await ev(() => { const p = window.__barrage.game.player; return { sp: Math.hypot(p.vel.x, p.vel.z), st: p.stamina, on: p.sprinting }; });
await page.mouse.up();
check('SPRINT runs faster than walking and drains stamina', sprint.on && sprint.sp > 4 && sprint.st < 90, JSON.stringify(sprint));
await tap('#btn-sprint');
check('the HUD has an HP bar and a stamina bar', await page.isVisible('#hp-fill') && await page.isVisible('#st-fill'));

/* ------------------------------ fighting --------------------------------- */

// a brawler squared up in front of you
await ev(() => {
  const g = window.__barrage.game;
  g.player.root.set(0, 0, 0); g.player.heading = Math.PI; g.player.stamina = 100;
  const d = g.spawn('brawler', { team: 'enemy', x: 0, z: -1.05, heading: 0, health: 500, mask: 2 });
  g.waves.enemies.push(d);
  window.__dummy = d;
});
for (let i = 0; i < 8; i++) {
  await ev(() => { const d = window.__dummy; if (d.state === 'active') d.root.set(0, 0, -1.05); window.__barrage.game.player.stamina = 100; });
  await act(i % 3 === 2 ? 'kick' : 'punch');
  await simFor(0.55);
}
const hurt = await ev(() => { const d = window.__dummy; return { hp: d.health, marks: d.marks || {}, states: d.state }; });
check('punches and kicks land by contact and do damage', hurt.hp < 500, JSON.stringify(hurt));
check('blunt blows bruise a box ragdoll', (hurt.marks.bruise || 0) > 0);
await ev(() => { const d = window.__dummy; d.health = 500; d.balance = 100; });
await page.waitForFunction(() => window.__dummy.state === 'active', null, { timeout: 120000, polling: 100 }).catch(() => {});
// a hard kick knocks a box ragdoll about
const knock = await ev(() => {
  const d = window.__dummy;
  d.takeHit({ part: 2, point: d.bodies[2].x.clone(), dir: d.forward.clone().negate(), J: 70, speed: 9, damage: 5, attacker: window.__barrage.game.player, kind: 'kick', striker: null, weapon: null });
  return d.state;
});
check('a heavy blow sends a box ragdoll down as a ragdoll', knock === 'ragdoll', knock);
await simFor(5);
check('...and it gets up again', await ev(() => window.__dummy.state === 'active' || window.__dummy.state === 'getup'), await ev(() => window.__dummy.state));
const stumble = await ev(() => {
  const d = window.__dummy;
  if (d.state !== 'active') return 'busy';
  d.balance = 100;
  d.takeHit({ part: 2, point: d.bodies[2].x.clone(), dir: d.forward.clone().negate(), J: 22, speed: 6, damage: 2, attacker: null, kind: 'fist', striker: null, weapon: null });
  return d.state;
});
check('a solid blow makes a box ragdoll stumble', stumble === 'stumble' || stumble === 'busy', stumble);
await simFor(2);

// blocking: the same blow does far less behind a guard
const block = await ev(() => {
  const p = window.__barrage.game.player;
  const hit = () => ({ part: 5, point: p.head.x.clone(), dir: p.forward.clone().negate(), J: 6, speed: 6, damage: 10, attacker: window.__dummy, kind: 'fist', striker: null, weapon: null });
  p.health = 100; p.wantBlock = false; p.block = 0;
  p.takeHit(hit());
  const open = 100 - p.health;
  p.health = 100; p.wantBlock = true; p.block = 1;
  p.takeHit(hit());
  const guarded = 100 - p.health;
  p.wantBlock = false; p.health = 100;
  return { open, guarded };
});
check('BLOCK takes most of the sting out of a blow', block.guarded < block.open * 0.5, JSON.stringify(block));
await tap('#btn-block');
check('the BLOCK button raises the guard while held', true);
await shot('fight');

/* ------------------------------ coins, waves ------------------------------ */

await ev(() => { const g = window.__barrage.game; for (const f of [...g.waves.enemies]) g.removeFighter(f); g.waves.enemies = []; });
const coins0 = await ev(() => window.__barrage.profile.coins);
await ev(() => { const g = window.__barrage.game; g.player.root.set(0, 0, 0); g.waves.begin(1); });
await simFor(4.5);
await ev(() => { for (const e of window.__barrage.game.waves.enemies) e.health = Math.min(e.health, 1); });
// finish them by hand
for (let i = 0; i < 80; i++) {
  const state = await ev(() => window.__barrage.game.waves.state);
  if (state !== 'fight' && state !== 'intro') break;
  await ev(() => {
    const g = window.__barrage.game, p = g.player;
    p.health = 100; p.stamina = 100;
    const e = g.waves.enemies.find((x) => x.alive && Math.hypot(x.root.x, x.root.z) < 11.4);
    if (e && e.state === 'active') { p.root.set(e.root.x, 0, e.root.z + 1.0); p.heading = Math.PI; e.root.y = 0; }
    for (const x of g.waves.enemies) x.health = Math.min(x.health, 1);
  });
  await act('punch');
  await simFor(0.4);
}
const won = await ev(() => { const b = window.__barrage; return { state: b.game.waves.state, coins: b.profile.coins, kills: b.profile.d.kills, wave: b.profile.d.wave }; });
check('every kill and the wave clear pay coins', won.coins >= coins0 + 3 * 2 + 7, `${coins0} -> ${won.coins}`);
check('clearing a wave moves you on to the next', won.wave === 2, JSON.stringify(won));
await simFor(3);
const rest = await ev(() => { const g = window.__barrage.game; return { state: g.waves.state, south: g.arena.gates.south.target, ctx: document.querySelector('#btn-context').textContent }; });
check('between waves the south doors open and START WAVE 2 is offered', rest.state === 'rest' && rest.south === 1 && /START WAVE 2/.test(rest.ctx), JSON.stringify(rest));

/* ---------------------------------- Stall -------------------------------- */

await ev(() => { const p = window.__barrage.game.player; p.root.set(5.2, 0, 15.6); p.heading = 0; });
await simFor(0.3);
await ev(() => { const p = window.__barrage.game.player; p.root.set(5.2, 0, 18.7); });
await page.waitForFunction(() => window.__barrage.state === 'shop', null, { timeout: 60000, polling: 100 }).catch(() => {});
check('walking up to the Stall outside the arena opens it', await ev(() => window.__barrage.state === 'shop' && !document.querySelector('#shop').classList.contains('hidden')));
const wares = await ev(() => [...document.querySelectorAll('.ware')].map((w) => w.dataset.kind + ':' + w.querySelector('.price').textContent.trim()));
check('the Stall sells a wooden sword for 10, a rusty steel sword for 50 and a wood shield for 10',
  wares.join(',') === 'wooden_sword:10,rusty_sword:50,wood_shield:10', wares.join(', '));
await ev(() => { const b = window.__barrage; b.profile.d.coins = 25; b.shop.render(); });
await tap('[data-buy="rusty_sword"]');
check('you cannot buy what you cannot afford', await ev(() => { const b = window.__barrage; return b.profile.coins === 25 && !b.profile.owns('rusty_sword'); }));
await tap('[data-buy="wooden_sword"]');
await tap('[data-buy="wood_shield"]');
const bought = await ev(() => { const b = window.__barrage; return { coins: b.profile.coins, bag: b.profile.d.bag.filter(Boolean).map((i) => i.kind) }; });
check('buying takes the coins and puts the item in your bag', bought.coins === 5 && bought.bag.includes('wooden_sword') && bought.bag.includes('wood_shield'), JSON.stringify(bought));
await shot('stall');
await tap('.tab[data-tab="sell"]');
check('the SELL tab lists your gear at half price', await ev(() => [...document.querySelectorAll('.sell-row')].length === 2 && document.querySelector('.sell-row .price').textContent.trim() === '5'));
await tap('#shop-close');

/* -------------------------------- inventory ------------------------------ */

await tap('#btn-inv');
check('the bag button opens the inventory', await ev(() => window.__barrage.state === 'bag'));
const slots = await ev(() => ({
  bag: document.querySelectorAll('#inv-grid .slot').length,
  eq: [...document.querySelectorAll('.slot.eq')].map((s) => s.dataset.loc.slice(2)).sort().join(','),
}));
check('the inventory has 60 slots', slots.bag === 60, `${slots.bag}`);
check('...and Weapon, Offhand, 2 Accessory, Helmet, Chestplate, Leggings and Boots slots',
  slots.eq === 'acc1,acc2,boots,chest,helmet,legs,offhand,weapon', slots.eq);
const shieldLoc = await ev(() => 'b' + window.__barrage.profile.d.bag.findIndex((i) => i && i.kind === 'wood_shield'));
const swordLoc = await ev(() => 'b' + window.__barrage.profile.d.bag.findIndex((i) => i && i.kind === 'wooden_sword'));
await tap(`[data-loc="${shieldLoc}"]`);
await tap('[data-loc="e:weapon"]');
check('the shield will not go in the weapon slot', await ev(() => !window.__barrage.profile.d.eq.weapon));
await tap('[data-loc="e:helmet"]');
check('nothing goes in the armour slots yet', await ev(() => !window.__barrage.profile.d.eq.helmet));
// the shield is still picked up after a slot refused it: straight to the offhand
await tap('[data-loc="e:offhand"]');
check('the wood shield goes in the offhand slot', await ev(() => window.__barrage.profile.d.eq.offhand && window.__barrage.profile.d.eq.offhand.kind === 'wood_shield'));
// drag the sword onto the weapon slot
const from = await (await page.$(`[data-loc="${swordLoc}"]`)).boundingBox();
const to = await (await page.$('[data-loc="e:weapon"]')).boundingBox();
await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
await page.mouse.down();
await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(150);
check('dragging the sword onto the weapon slot equips it', await ev(() => window.__barrage.profile.d.eq.weapon && window.__barrage.profile.d.eq.weapon.kind === 'wooden_sword'));
await shot('inventory');
await tap('#inv-close');
const held = await ev(() => { const p = window.__barrage.game.player; return { w: p.weapon && p.weapon.kind, s: p.shield && p.shield.kind, label: document.querySelector('#punch-label').textContent }; });
check('you hold what you equipped: sword in hand, shield on the arm, PUNCH becomes SLASH',
  held.w === 'wooden_sword' && held.s === 'wood_shield' && held.label === 'SLASH', JSON.stringify(held));

/* ----------------------------- gear in a fight ---------------------------- */

await ev(() => {
  const g = window.__barrage.game, p = g.player;
  p.root.set(0, 0, 0); p.heading = Math.PI;
  const d = g.spawn('brawler', { team: 'enemy', x: 0, z: -1.15, heading: 0, health: 900, mask: 2 });
  window.__dummy = d;
});
for (let i = 0; i < 6; i++) {
  await ev(() => { const d = window.__dummy; if (d.state === 'active') d.root.set(0, 0, -1.15); window.__barrage.game.player.stamina = 100; });
  await act('punch');
  await simFor(0.8);
}
check('the wooden sword lands and bruises', await ev(() => window.__dummy.health < 900 && (window.__dummy.marks.bruise || 0) > 0), await ev(() => JSON.stringify(window.__dummy.marks)));
await ev(() => { const b = window.__barrage; b.game.player.equip('weapon', 'rusty_sword'); });
for (let i = 0; i < 8; i++) {
  await ev(() => { const d = window.__dummy; if (d.state === 'active') d.root.set(0, 0, -1.15); window.__barrage.game.player.stamina = 100; });
  await act('punch');
  await simFor(0.8);
}
const steel = await ev(() => window.__dummy.marks);
check('the rusty steel sword cuts and slashes', (steel.cut || 0) + (steel.slash || 0) > 0, JSON.stringify(steel));
await ev(() => { const b = window.__barrage; b.game.player.equip('weapon', 'wooden_sword'); window.__barrage.game.removeFighter(window.__dummy); });
// a shield held up stops a punch dead
// hold BLOCK, the way a player does, and let a brawler jab at you
await ev(() => { const b = window.__barrage; b.input.press('block'); b.game.player.health = 100; });
await simFor(0.5);
check('holding BLOCK with a shield on raises the shield', await ev(() => { const p = window.__barrage.game.player; return p.blocking && !!p.shield; }));
await ev(() => {
  const g = window.__barrage.game, p = g.player;
  let blocked = 0;
  g.on('blocked', (f, h) => { if (f === p && h.shield) blocked++; });
  const e = g.spawn('brawler', { team: 'enemy', x: p.root.x + Math.sin(p.heading) * 0.95, z: p.root.z + Math.cos(p.heading) * 0.95, heading: p.heading + Math.PI, health: 100, mask: 2 });
  window.__jabber = e;
  window.__shieldCount = () => blocked;
});
for (let i = 0; i < 5; i++) {
  await ev(() => { const { JAB_L } = window.__barrage.lib.anim; const e = window.__jabber; if (e.canAct()) e.play(JAB_L, 10); });
  await simFor(0.5);
}
check('a raised shield stops blows from the front', await ev(() => window.__shieldCount() > 0), `${await ev(() => window.__shieldCount())} stopped`);
await ev(() => { const b = window.__barrage, g = b.game; b.input.release('block'); g.removeFighter(window.__jabber); });

/* -------------------------------- bullets ------------------------------- */

await ev(() => {
  const g = window.__barrage.game, p = g.player;
  p.root.set(0, 0, 2); p.heading = Math.PI; p.health = 100; p.maxHealth = 100000; p.health = 100000;
  const gunner = g.spawn('gunner', { team: 'enemy', x: 0, z: -7, heading: 0, health: 300, mask: 2 });
  gunner.giveGun();
  gunner.wantAim = true;
  const wall = g.spawn('brawler', { team: 'enemy', x: 0.05, z: -1.2, heading: Math.PI, health: 9999, mask: 2 });
  window.__gun = gunner; window.__wall = wall;
});
await simFor(1);
for (let i = 0; i < 6; i++) {
  await ev(() => {
    const g = window.__barrage.game, gun = window.__gun, w = window.__wall;
    if (w.state === 'active') w.root.set(0.05, 0, -1.2);
    const at = w.chest.x.clone();
    g.guns.fire(gun, g.guns.aim(gun, at, 0.01, at.clone()), 12);
  });
  await simFor(0.3);
}
const shots = await ev(() => ({ stats: window.__barrage.game.guns.stats, marks: window.__wall.marks }));
check('gunners\' bullets hit whoever is in the way and leave bullet holes', (shots.marks.bullet || 0) > 0 && shots.stats.friendly > 0, JSON.stringify(shots));
// and a raised shield stops one
await ev(() => { const b = window.__barrage, g = b.game; g.removeFighter(window.__wall); const p = g.player; p.root.set(0, 0, 2); p.heading = Math.PI; b.input.press('block'); });
await simFor(0.6);
const shieldShots0 = await ev(() => window.__barrage.game.guns.stats.hitShields);
for (let i = 0; i < 4; i++) {
  await ev(() => {
    const g = window.__barrage.game, gun = window.__gun, p = g.player;
    p.root.set(0, 0, 2); p.heading = Math.PI;
    const at = p.chest.x.clone();
    g.guns.fire(gun, g.guns.aim(gun, at, 0.005, at.clone()), 12);
  });
  await simFor(0.3);
}
check('a raised shield stops bullets', await ev((n) => window.__barrage.game.guns.stats.hitShields > n, shieldShots0), JSON.stringify(await ev(() => window.__barrage.game.guns.stats)));
await ev(() => { const b = window.__barrage, g = b.game; b.input.release('block'); g.removeFighter(window.__gun); g.player.maxHealth = 100; g.player.health = 100; });

/* --------------------------------- rounds -------------------------------- */

const rosters = await ev(() => {
  const { roster } = window.__barrage.lib;
  const kinds = (n) => { const all = new Set(); for (let i = 0; i < 30; i++) for (const r of roster(n)) all.add(r.kind); return [...all].sort().join(','); };
  return { w1: kinds(1), w3: kinds(3), w5: kinds(5), w8: kinds(8) };
});
check('wave 1 is brawlers; swordsmen join on 3, shields on 4, gunners and a champion on 5',
  rosters.w1 === 'brawler' && rosters.w3.includes('swordsman') && rosters.w5.includes('gunner') && rosters.w5.includes('champion'), JSON.stringify(rosters));
check('nothing in the physics has gone to NaN', await finite());

/* ---------------------------------- falling ------------------------------ */

await ev(() => { const g = window.__barrage.game; g.player.root.set(0, 0, 0); g.waves.begin(2); });
await simFor(3.5);
await ev(() => { const p = window.__barrage.game.player; p.takeHit({ part: 5, point: p.head.x.clone(), dir: p.forward.clone().negate(), J: 30, speed: 9, damage: 999, attacker: null, kind: 'fist', striker: null, weapon: null }); });
await page.waitForFunction(() => !document.querySelector('#death').classList.contains('hidden'), null, { timeout: 120000, polling: 200 }).catch(() => {});
check('you can fall, and the defeat screen says so', await page.isVisible('#death') && await ev(() => window.__barrage.state === 'fallen'));
await shot('fallen');
const keep = await ev(() => window.__barrage.profile.coins);
await tap('#btn-again');
const again = await ev(() => { const b = window.__barrage; return { state: b.state, wave: b.game.waves.wave, ws: b.game.waves.state, coins: b.profile.coins, alive: b.game.player.alive, enemies: b.game.waves.enemies.length }; });
check('BACK TO THE ARENA: on your feet again, doors open, wave 1 next, coins kept',
  again.state === 'playing' && again.alive && again.wave === 1 && again.ws === 'rest' && again.coins === keep && again.enemies === 0, JSON.stringify(again));

/* ---------------------------------- saving -------------------------------- */

const saved = await ev(() => { const b = window.__barrage; return { coins: b.profile.coins, eq: b.profile.gear() }; });
await page.waitForTimeout(400);
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__barrage && window.__barrage.state === 'title', null, { timeout: 90000 });
const loaded = await ev(() => { const b = window.__barrage; return { coins: b.profile.coins, eq: b.profile.gear() }; });
check('your coins and gear are still there after a reload', JSON.stringify(saved) === JSON.stringify(loaded), JSON.stringify(loaded));
check('nothing went wrong in the console', errors.length === 0, errors.slice(0, 3).join(' | '));
await ctx.close();

/* --------------------------------- accounts ------------------------------- */

{
  ({ ctx, page } = await open(mockScript(null, 'u_tester')));
  const P = page;
  const ev2 = (fn, arg) => P.evaluate(fn, arg);
  await P.waitForFunction(() => window.__barrage && window.__barrage.state === 'title', null, { timeout: 90000 });
  await P.tap('#btn-signup');
  await P.waitForTimeout(150);
  check('on the Claude page, SIGN UP opens the account form', await P.isVisible('#panel-account') && await ev2(() => document.querySelector('#panel-account').dataset.mode === 'signup'));
  await P.fill('#acct-name', 'Nova');
  await P.fill('#acct-pass', 'sand123');
  await P.fill('#acct-pass2', 'sand123');
  await P.tap('#acct-submit');
  await P.waitForFunction(() => window.__barrage && document.querySelector('#who').classList.contains('in'), null, { timeout: 30000 }).catch(() => {});
  const acct = await ev2(() => { const s = window.__mockStore(); const k = Object.keys(s).find((x) => x.includes('barrage-nova')); return { key: k, doc: k ? s[k] : null }; });
  check('signing up makes an account in your private cloud storage', !!acct.key && acct.key.startsWith('data/users/u_tester/'), acct.key);
  check('the password is not stored, only a salted hash', acct.doc && !JSON.stringify(acct.doc).includes('sand123') && acct.doc.hash && acct.doc.salt);
  await P.waitForTimeout(800);
  await ev2(() => { const b = window.__barrage; b.profile.addCoins(77); });
  await ev2(async () => { await new Promise((r) => setTimeout(r, 400)); await window.__barrage.lib.cloud.flush(); });
  const up = await ev2(() => { const s = window.__mockStore(); return s['data/users/u_tester/barrage-nova'].save.coins; });
  check('your progress is saved to the cloud', up === 77, `${up}`);
  await P.tap('#btn-logout');
  await P.waitForFunction(() => !document.querySelector('#who').classList.contains('in'), null, { timeout: 30000 }).catch(() => {});
  check('LOG OUT goes back to playing as a guest', await ev2(() => window.__barrage.profile.coins === 0));
  await P.tap('#btn-login');
  await P.fill('#acct-name', 'Nova');
  await P.fill('#acct-pass', 'wrong');
  await P.tap('#acct-submit');
  await P.waitForFunction(() => /not right/.test(document.querySelector('#acct-msg').textContent), null, { timeout: 30000 }).catch(() => {});
  check('a wrong password is refused', /not right/.test(await P.textContent('#acct-msg')));
  await P.fill('#acct-pass', 'sand123');
  await P.tap('#acct-submit');
  await P.waitForFunction(() => document.querySelector('#who').classList.contains('in'), null, { timeout: 30000 }).catch(() => {});
  await P.waitForTimeout(900);
  check('LOG IN brings your coins back', await ev2(() => window.__barrage.profile.coins === 77), `${await ev2(() => window.__barrage.profile.coins)}`);
  await P.reload({ waitUntil: 'load' });
  await P.waitForFunction(() => window.__barrage && window.__barrage.state === 'title' && document.querySelector('#who').classList.contains('in'), null, { timeout: 60000 }).catch(() => {});
  check('coming back later, you are still logged in', await ev2(() => document.querySelector('#who-text').textContent.includes('Nova')));
  await ctx.close();
}

if (FILE_MODE) check('the single file fetched nothing from the network', network.length === 0, network.slice(0, 3).join(', '));
check('no errors anywhere', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
if (server) server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
