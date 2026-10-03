/* =============================================================================
   Checks that OVERGROWTH does what it says, in a real browser on a phone-
   sized touch screen:

     node tools/verify-overgrowth.mjs          the source, served over http
     node tools/verify-overgrowth.mjs --file   dist/overgrowth.html off the disk,
                                               failing on any network request

   Needs playwright and a chromium build:
     npm install -D playwright && npx playwright install chromium
   Set CHROMIUM_PATH to use a chromium you already have.
   ========================================================================== */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE_MODE = process.argv.includes('--file');
const SHOTS = path.join(ROOT, '.shots');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
}

/* ------------------------------- boot it -------------------------------- */

let server = null;
let url;
if (FILE_MODE) {
  const file = path.join(ROOT, 'dist/overgrowth.html');
  if (!fs.existsSync(file)) { console.error('no dist/overgrowth.html - run node tools/build-overgrowth.mjs'); process.exit(1); }
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
  url = `http://127.0.0.1:${server.address().port}/overgrowth/index.html`;
}

fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
const network = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) network.push(r.url()); });

const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = (name) => page.screenshot({ path: path.join(SHOTS, `og-${FILE_MODE ? 'file-' : ''}${name}.png`) });
/** Waits until the game clock has advanced by `secs` of simulated time. */
async function simFor(secs, timeout = 120000) {
  const t0 = await ev(() => window.__og.game.time);
  await page.waitForFunction((t) => window.__og.game.time >= t, t0 + secs, { timeout, polling: 100 });
}
/** Taps an element the way a finger would. */
async function tap(sel) {
  await page.tap(sel);
  await page.waitForTimeout(60);
}

await page.goto(url, { waitUntil: 'load' });
await page.waitForSelector('#btn-play', { state: 'visible', timeout: 30000 });

/* ------------------------------ title, menu ----------------------------- */

check('title screen shows PLAY', await page.isVisible('#btn-play'));
await shot('title');
await tap('#btn-play');
await page.waitForTimeout(400);
check('PLAY opens the game and the HUD', await ev(() => !document.querySelector('#hud').classList.contains('hidden')
  && !document.querySelector('#title').classList.contains('active')));
check('the spawn menu opens', await ev(() => document.querySelector('#spawn-menu').classList.contains('open')));
check('the spawn menu lists all six teams', await ev(() =>
  ['red', 'blue', 'yellow', 'purple', 'black', 'orange'].every((t) => !!document.querySelector(`.card[data-team="${t}"]`))));
check('spawn is disabled until something is selected', await ev(() => document.querySelector('#btn-spawn').disabled));

await tap('.card[data-team="red"]');
await page.waitForTimeout(300);   // the outline fades in
const sel = await ev(() => {
  const el = document.querySelector('.card[data-team="red"]');
  const cs = getComputedStyle(el);
  return { selected: el.classList.contains('selected'), outline: cs.outlineColor, width: cs.outlineWidth,
    others: document.querySelectorAll('.card.selected').length };
});
check('selecting a team gives it a green outline', sel.selected && sel.outline === 'rgb(57, 255, 90)' && parseFloat(sel.width) >= 2,
  `${sel.outline} ${sel.width}`);
check('only one card is selected at a time', sel.others === 1);
await shot('selected');
check('the spawn button names the selection', await ev(() => {
  const b = document.querySelector('#btn-spawn');
  return !b.disabled && /RED/.test(b.textContent);
}));
await tap('#btn-spawn');
await page.waitForTimeout(100);
check('SPAWN puts a Red human on the platform', await ev(() => {
  const g = window.__og.game;
  return g.humans.length === 1 && g.humans[0].team === 'red' && Math.abs(g.humans[0].root.x) < 25;
}));

await tap('#count button[data-n="3"]');
await tap('.card[data-team="blue"]');
await tap('#btn-spawn');
await page.waitForTimeout(100);
check('x3 spawns three Blue', await ev(() => window.__og.game.humans.filter((h) => h.team === 'blue').length === 3));

await tap('.tab[data-tab="objects"]');
await tap('.card[data-kind="crate"]');
check('selecting an object moves the outline to it', await ev(() =>
  document.querySelector('.card[data-kind="crate"]').classList.contains('selected') &&
  !document.querySelector('.card[data-team="blue"]').classList.contains('selected')));
await tap('#count button[data-n="1"]');
await tap('#btn-spawn');
await tap('.card[data-kind="sword"]');
await tap('#btn-spawn');
await tap('.card[data-kind="bat"]');
await tap('#btn-spawn');
await page.waitForTimeout(100);
check('crates, swords and bats spawn', await ev(() => {
  const k = window.__og.game.props.map((p) => p.kind).sort().join(',');
  return k === 'bat,crate,sword';
}));
await tap('#btn-close');
await page.waitForTimeout(300);
check('the spawn menu closes', await ev(() => !document.querySelector('#spawn-menu').classList.contains('open')));
check('the corner SPAWN button keeps the selection', await page.isVisible('#btn-quick'));
await tap('#btn-menu');
await page.waitForTimeout(300);
check('...and reopens', await ev(() => document.querySelector('#spawn-menu').classList.contains('open')));
await tap('#btn-close');
await page.waitForTimeout(300);
await shot('spawned');

/* ------------------------------- the camera ----------------------------- */

const camBefore = await ev(() => { const c = window.__og.game.cam; return { x: c.pos.x, y: c.pos.y, z: c.pos.z, yaw: c.yaw }; });
{
  const box = await page.locator('#stick-base').boundingBox();
  const cdp = await ctx.newCDPSession(page);
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const send = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 7 }] });
  await send('touchStart', cx, cy);
  for (let i = 1; i <= 8; i++) await send('touchMove', cx, cy - i * 6);
  await page.waitForTimeout(900);
  await send('touchEnd', cx, cy - 48);
  // and drag on the view to look
  await send('touchStart', 600, 200);
  for (let i = 1; i <= 8; i++) await send('touchMove', 600 - i * 10, 200);
  await send('touchEnd', 520, 200);
}
await page.waitForTimeout(200);
const camAfter = await ev(() => { const c = window.__og.game.cam; return { x: c.pos.x, y: c.pos.y, z: c.pos.z, yaw: c.yaw }; });
{
  const fx = -Math.sin(camBefore.yaw), fz = -Math.cos(camBefore.yaw);
  const moved = (camAfter.x - camBefore.x) * fx + (camAfter.z - camBefore.z) * fz;
  check('the joystick moves the camera forward', moved > 1, `${moved.toFixed(2)} m`);
  check('dragging the view turns the camera', Math.abs(camAfter.yaw - camBefore.yaw) > 0.1, `${(camAfter.yaw - camBefore.yaw).toFixed(2)} rad`);
}

/* ------------------------- the rest runs headless ------------------------ */
// Software rendering is slow; the simulation does not need the picture.
await ev(() => {
  window.__og.realRender = window.__og.renderer.render.bind(window.__og.renderer);
  window.__og.renderer.render = () => {};
  const g = window.__og.game;
  window.__ev = { hits: [], deaths: [], states: new Map() };
  g.on('hit', (v, h) => window.__ev.hits.push({ v: v.id, part: h.part, kind: h.kind, dmg: h.damage }));
  g.on('death', (h) => window.__ev.deaths.push(h.id));
  window.__maxSep = 0;
  window.__nan = false;
  const fs = g.fixedStep.bind(g);
  g.fixedStep = (dt) => {
    fs(dt);
    for (const h of g.humans) {
      if (!window.__ev.states.has(h.id)) window.__ev.states.set(h.id, new Set());
      window.__ev.states.get(h.id).add(h.state);
      for (const b of h.bodies) if (!Number.isFinite(b.x.x + b.x.y + b.x.z + b.q.w)) window.__nan = true;
      if (h.state === 'ragdoll' || h.state === 'dead' || h.state === 'stumble') {
        for (const j of h.joints) {
          const a = j.a.toWorld(j.anchorA, j._pa || (j._pa = j.anchorA.clone()));
          const b = j.b.toWorld(j.anchorB, j._pb || (j._pb = j.anchorB.clone()));
          window.__maxSep = Math.max(window.__maxSep, a.distanceTo(b));
        }
      }
    }
  };
});
const show = async (name) => { await ev(() => window.__og.realRender(window.__og.game.scene, window.__og.game.camera)); await shot(name); };

/* --------------------------- a free for all fight ----------------------- */

await simFor(14);
const fight = await ev(() => {
  const g = window.__og.game;
  const states = new Set();
  for (const s of window.__ev.states.values()) for (const x of s) states.add(x);
  // blood on the grass is drawn on tiles made where it lands; on the grey platform, on its own canvas
  const d = g.map.greyPaint.ctx.getImageData(0, 0, g.map.greyPaint.canvas.width, g.map.greyPaint.canvas.height).data;
  let grey = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 80 && d[i] > d[i + 1] * 2 && d[i] > d[i + 2] * 2) grey++;
  return { hits: window.__ev.hits.length, states: [...states], blood: g.blood.stats, floorTiles: g.map.floor.tiles.size, grey, health: g.humans.map((h) => h.health) };
});
check('Red and Blue find each other and land hits', fight.hits >= 3, `${fight.hits} hits`);
check('somebody stumbled or was knocked down', fight.states.includes('stumble') || fight.states.includes('ragdoll'), fight.states.join(','));
check('blood flies and lands on the ground', fight.blood.drops > 0 && fight.blood.onGround > 0 && (fight.floorTiles > 0 || fight.grey > 0),
  `${fight.blood.drops} drops, ${fight.blood.onGround} on the ground: ${fight.floorTiles} grass tiles, ${fight.grey} px on the grey platform`);
await ev(() => { const c = window.__og.game.cam; c.pos.set(0, 5, 9); c.yaw = 0; c.pitch = -0.5; c.apply(); });
await show('fight');

if (!FILE_MODE) {
  /* ------------------ damage needs contact: air jabs do nothing ---------- */
  const air = await ev(async () => {
    const g = window.__og.game;
    const A = window.__og.anim;
    g.clearAll();
    const a = g.spawnHuman('red', -2.2, 10, Math.PI / 2);
    const b = g.spawnHuman('blue', 2.2, 10, -Math.PI / 2);
    for (const [h, o] of [[a, b], [b, a]]) {
      let side = 1;
      h.brain.update = () => {
        h.move.set(0, 0, 0); h.combat = true;
        h.face = Math.atan2(o.root.x - h.root.x, o.root.z - h.root.z);
        if (h.canAct()) { h.play(side > 0 ? A.JAB_L : A.JAB_R, 10); side = -side; }
      };
    }
    window.__pair = [a, b];
    window.__ev.hits.length = 0;
    return true;
  });
  await simFor(3);
  const airRes = await ev(() => ({ hits: window.__ev.hits.length, h: window.__pair.map((x) => x.health), acts: window.__pair.map((x) => !!x.action) }));
  check('jabbing the air at 4.4 m does no damage', air && airRes.hits === 0 && airRes.h.every((x) => x === 100), `hits ${airRes.hits}`);

  await ev(() => {
    const g = window.__og.game;
    const A = window.__og.anim;
    g.clearAll();
    const a = g.spawnHuman('red', -0.36, 10, Math.PI / 2);
    const b = g.spawnHuman('blue', 0.36, 10, -Math.PI / 2);
    for (const [h, o] of [[a, b], [b, a]]) {
      let side = 1;
      h.brain.update = () => {
        h.move.set(0, 0, 0); h.combat = true;
        h.face = Math.atan2(o.root.x - h.root.x, o.root.z - h.root.z);
        if (h.canAct()) { h.play(side > 0 ? A.JAB_L : A.JAB_R, 10); side = -side; }
      };
    }
    window.__pair = [a, b];
    window.__ev.hits.length = 0;
  });
  await simFor(3);
  const close = await ev(() => ({ hits: window.__ev.hits.length, h: window.__pair.map((x) => Math.round(x.health)) }));
  check('the same jabs at arm\'s length connect and hurt', close.hits > 0 && close.h.some((x) => x < 100), `hits ${close.hits}, health ${close.h}`);

  /* ------------------------------ animations ----------------------------- */
  const anim = await ev(async () => {
    const g = window.__og.game;
    const A = window.__og.anim;
    g.clearAll();
    const h = g.spawnHuman('yellow', 0, 12, 0);
    h.brain.update = () => { h.move.set(0, 0, 0); h.face = 0; h.combat = false; };
    const P = { handL: 8, handR: 11, footL: 14, footR: 17 };
    const local = (i) => { const b = h.bodies[i]; return { x: b.x.x - h.root.x, y: b.x.y - h.root.y, z: b.x.z - h.root.z }; };
    const wait = (s) => new Promise((r) => { const t0 = g.time; const f = () => (g.time >= t0 + s ? r() : setTimeout(f, 30)); f(); });
    await wait(0.5);
    const rest = { l: local(P.handL), r: local(P.handR) };
    // idle breathes: the chest moves while standing still
    const c0 = h.bodies[3].q.clone(); await wait(0.8); const idleMoves = c0.angleTo(h.bodies[3].q) > 0.003;
    h.play(A.JAB_L, 0); await wait(0.16);
    const jabL = local(P.handL).z - rest.l.z;
    await wait(0.5);
    h.play(A.JAB_R, 0); await wait(0.16);
    const jabR = local(P.handR).z - rest.r.z;
    await wait(0.5);
    // walk then run straight ahead: speed and the feet trading places
    const run = async (speed) => {
      h.brain.update = () => { h.move.set(0, 0, speed); h.face = 0; };
      await wait(1.2);
      const z0 = h.root.z, t0 = g.time; let swaps = 0, prev = Math.sign(local(P.footL).z - local(P.footR).z);
      while (g.time < t0 + 1) {
        await wait(0.03);
        const s = Math.sign(local(P.footL).z - local(P.footR).z);
        if (s !== prev) { swaps++; prev = s; }
      }
      return { v: (h.root.z - z0) / (g.time - t0), swaps };
    };
    const walk = await run(1.4);
    const sprint = await run(4.2);
    h.brain.update = () => { h.move.set(0, 0, 0); h.face = 0; };
    return { idleMoves, jabL, jabR, walk, sprint };
  });
  check('idle animation breathes', anim.idleMoves);
  check('left jab throws the left fist forward', anim.jabL > 0.3, `${anim.jabL.toFixed(2)} m`);
  check('right jab throws the right fist forward', anim.jabR > 0.3, `${anim.jabR.toFixed(2)} m`);
  check('walking moves at walking pace with the feet trading places', anim.walk.v > 1.0 && anim.walk.v < 1.9 && anim.walk.swaps >= 1,
    `${anim.walk.v.toFixed(2)} m/s, ${anim.walk.swaps} swaps`);
  check('running moves at running pace with quicker steps', anim.sprint.v > 3.3 && anim.sprint.swaps > anim.walk.swaps,
    `${anim.sprint.v.toFixed(2)} m/s, ${anim.sprint.swaps} swaps`);

  /* ---------------------------- stumble, recover -------------------------- */
  await ev(() => {
    const g = window.__og.game;
    g.clearAll();
    const h = g.spawnHuman('purple', 0, 12, 0);
    h.brain.update = () => { h.move.set(0, 0, 0); h.face = null; h.combat = false; };
    window.__st = { h, seen: new Set() };
    const b = h.bodies[3];
    h.takeHit({ part: 3, point: b.x.clone().add({ x: 0, y: 0, z: 0.1 }), dir: { x: 0, y: 0, z: -1, clone() { return this; } }, J: 20, speed: 6, damage: 2, attacker: null, kind: 'fist' });
    const fs = g.fixedStep;
    g.fixedStep = (dt) => { fs(dt); window.__st.seen.add(h.state); };
  });
  const st0 = await ev(() => window.__st.h.state);
  await simFor(3);
  const st = await ev(() => ({ now: window.__st.h.state, seen: [...window.__st.seen] }));
  check('a solid hit makes someone stumble', st0 === 'stumble', st0);
  check('...and they recover or go down, but do not stay stumbling', st.now !== 'stumble', st.seen.join(','));

  /* --------------------------- ragdoll and get up ------------------------- */
  await ev(() => {
    const g = window.__og.game;
    g.clearAll();
    const h = g.spawnHuman('orange', 0, 12, 0);
    h.brain.update = () => { h.move.set(0, 0, 0); h.face = null; h.combat = false; };
    h.enterRagdoll();
    h.push(5, h.head.x.clone(), { x: 0, y: 0, z: -1, clone() { return this; } }, 20);
    window.__rg = { h, low: 9, seen: [], relMoved: 0, arm0: null };
    const fs = g.fixedStep;
    g.fixedStep = (dt) => {
      fs(dt);
      const r = window.__rg;
      if (r.seen[r.seen.length - 1] !== h.state) r.seen.push(h.state);
      if (h.state === 'ragdoll') r.low = Math.min(r.low, h.pelvis.x.y);
      // does the forearm move relative to the chest on its own?
      const ut = h.bodies[3], la = h.bodies[7];
      const rel = ut.q.clone().invert().multiply(la.q);
      if (!r.arm0) r.arm0 = rel.clone();
      r.relMoved = Math.max(r.relMoved, r.arm0.angleTo(rel));
    };
  });
  await simFor(1.2);
  await ev(() => { const g = window.__og.game; const h = window.__rg.h; const c = g.cam; c.pos.set(h.pelvis.x.x + 2.2, 1.2, h.pelvis.x.z + 2.2); c.yaw = Math.PI / 4; c.pitch = -0.35; c.apply(); });
  await show('ragdoll');
  await simFor(9);
  const rg = await ev(() => ({ seen: window.__rg.seen, low: window.__rg.low, rel: window.__rg.relMoved, sep: window.__maxSep }));
  check('a ragdoll falls to the ground', rg.low < 0.45, `pelvis down to ${rg.low.toFixed(2)} m`);
  check('ragdoll limbs move independently at their joints', rg.rel > 0.3, `forearm turned ${rg.rel.toFixed(2)} rad against the chest`);
  check('...then plays a get up animation and stands', rg.seen.join('>').includes('ragdoll>getup>active'), rg.seen.join('>'));
  check('every joint stays connected', rg.sep < 0.06, `largest gap ${(rg.sep * 100).toFixed(1)} cm`);

  /* ------------------------------ blood, objects -------------------------- */
  const blood = await ev(async () => {
    const g = window.__og.game;
    const A = window.__og.anim;
    g.clearAll();
    const wait = (s) => new Promise((r) => { const t0 = g.time; const f = () => (g.time >= t0 + s ? r() : setTimeout(f, 30)); f(); });
    const reds = (pc) => {
      const d = pc.ctx.getImageData(0, 0, pc.canvas.width, pc.canvas.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 100 && d[i] > 80 && d[i] > d[i + 1] * 2.2 && d[i] > d[i + 2] * 2.2 && d[i + 1] < 40) n++;
      return n;
    };
    const a = g.spawnHuman('black', -0.55, 10, Math.PI / 2);
    const b = g.spawnHuman('yellow', 0.55, 10, -Math.PI / 2);
    const sword = g.spawnProp('sword', -1, 11);
    sword.attach(a);
    const crate = g.spawnProp('crate', 0.55, 9.3);
    const before = { sword: reds(sword.paint), victim: reds(b.paint), crate: reds(crate.paint) };
    for (const h of [a, b]) h.brain.update = () => { h.move.set(0, 0, 0); h.combat = true; h.face = h === a ? Math.PI / 2 : -Math.PI / 2; };
    let hit = null;
    g.on('hit', (v, x) => { if (!hit && x.kind === 'sword') hit = x; });
    for (let k = 0; k < 6 && !hit; k++) { a.play(k % 2 ? A.SWING_L : A.SWING_R); await wait(0.9); }
    // and a spray straight down onto the crate
    const top = crate.body.x.clone(); top.y += 0.8;
    g.blood.spray(top, { x: 0, y: -1, z: 0 }, 30, 1.5, 0.15, 0.015);
    await wait(1.5);
    return { hit: !!hit, before, after: { sword: reds(sword.paint), victim: reds(b.paint), crate: reds(crate.paint) }, stats: g.blood.stats, wounds: g.blood.wounds.length };
  });
  check('a sword swing lands by contact', blood.hit);
  check('blood lands on the enemy', blood.after.victim > blood.before.victim + 5, `${blood.before.victim} -> ${blood.after.victim} red pixels`);
  check('blood lands on the held sword', blood.after.sword > blood.before.sword + 3, `${blood.before.sword} -> ${blood.after.sword} red pixels`);
  check('blood lands on objects', blood.after.crate > blood.before.crate + 3, `${blood.before.crate} -> ${blood.after.crate} red pixels`);
  check('wounds keep bleeding', blood.wounds > 0, `${blood.wounds} open`);
  await ev(() => { const g = window.__og.game; const c = g.cam; c.pos.set(0, 1.4, 12.3); c.yaw = 0; c.pitch = -0.25; c.apply(); });
  await show('blood');

  /* ----------------------------- six teams brawl -------------------------- */
  await ev(() => {
    const g = window.__og.game;
    g.clearAll();
    const teams = ['red', 'blue', 'yellow', 'purple', 'black', 'orange'];
    teams.forEach((t, i) => {
      const a = (i / 6) * Math.PI * 2;
      for (let k = 0; k < 3; k++) g.spawnHuman(t, Math.cos(a) * 5 + (k - 1) * 0.9, Math.sin(a) * 5);
    });
    window.__perf = { n: 0, t: 0 };
    window.__pairs = new Set();
    g.on('hit', (v, h) => { if (h.attacker) window.__pairs.add(h.attacker.team + '>' + v.team); });
    const fs = g.fixedStep;
    g.fixedStep = (dt) => { const t0 = performance.now(); fs(dt); window.__perf.n++; window.__perf.t += performance.now() - t0; };
  });
  await simFor(15);
  const brawl = await ev(() => {
    const g = window.__og.game;
    const hitters = new Set([...window.__pairs].map((p) => p.split('>')[0]));
    return { teams: new Set(g.humans.map((h) => h.team)).size, dead: g.humans.filter((h) => !h.alive).length,
      hitters: hitters.size, pairs: window.__pairs.size,
      ms: window.__perf.t / window.__perf.n, nan: window.__nan, sep: window.__maxSep };
  });
  check('six teams fight each other', brawl.teams === 6 && brawl.hitters >= 4 && brawl.pairs >= 5,
    `${brawl.hitters} teams landed blows, ${brawl.pairs} team match-ups, ${brawl.dead} dead after 15 s`);
  check('joints hold through the whole brawl', brawl.sep < 0.05, `largest gap ${(brawl.sep * 100).toFixed(1)} cm`);
  check('the physics never produces NaN', !brawl.nan);
  console.log(`      (${brawl.ms.toFixed(2)} ms per simulation step with 18 fighters on this machine)`);
  await ev(() => { const c = window.__og.game.cam; c.pos.set(0, 7, 11); c.yaw = 0; c.pitch = -0.6; c.apply(); });
  await show('brawl');
}

check('no errors in the console', errors.length === 0, errors.slice(0, 3).join(' | '));
if (FILE_MODE) check('the single file fetches nothing', network.length === 0, network.slice(0, 3).join(' '));

await browser.close();
if (server) server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
