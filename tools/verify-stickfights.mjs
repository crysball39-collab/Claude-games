/* =============================================================================
   Checks that STICKFIGHTS does what it says, in a real browser on a phone-
   sized touch screen:

     node tools/verify-stickfights.mjs          the source, served over http
     node tools/verify-stickfights.mjs --file   dist/stickfights.html off the
                                                disk, failing on any network
                                                request

   Most checks set something up and then run the simulation forward in fixed
   steps inside the page, so they do not depend on how fast the machine is.
   The mods are checked too: off until installed from the MODS screen, the
   storage each shows, and everything the Murder Drones, Minecraft and
   Shallow mods add - Steve, crafting a Wither Totem, the Wither from its
   first skull to its Nether Star, and Shallow from its disguise to the
   next skin it climbs into. So are the walls and the trees, cell by cell,
   the freeze tool, moving things with the world paused, the six wires, the
   AK-47, the Mossberg 500, the crowbar and the four kinds of ammo.

   Needs playwright and a chromium build:
     npm install -D playwright && npx playwright install chromium
   Set CHROMIUM_PATH to use a chromium you already have.
   ========================================================================== */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { measureMods, writeModSizes } from './mod-sizes.mjs';

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
  const file = path.join(ROOT, 'dist/stickfights.html');
  if (!fs.existsSync(file)) { console.error('no dist/stickfights.html - run node tools/build-stickfights.mjs'); process.exit(1); }
  url = pathToFileURL(file).href;
} else {
  // the source needs what the build would write: how much storage each mod needs
  writeModSizes();
  server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, r));
  url = `http://127.0.0.1:${server.address().port}/stickfights/index.html`;
}

fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
// Every check starts from the same random numbers (see fresh()): what the
// people in it decide is down to chance, and a check should not pass or fail
// on a roll of the dice
await ctx.addInitScript(() => {
  let seed = 1;
  Math.random = () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  window.__seed = (n) => { seed = n; };
});
const page = await ctx.newPage();
const errors = [];
const network = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) network.push(r.url()); });

const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = (name) => page.screenshot({ path: path.join(SHOTS, `sf-${FILE_MODE ? 'file-' : ''}${name}.png`) });
const cdp = await ctx.newCDPSession(page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });

/** Runs the sandbox forward by `secs` of game time, in fixed steps, right now. */
const sim = (secs) => ev((s) => { const sb = window.__sf.sb; for (let i = 0; i < Math.round(s * 120); i++) sb.step(1 / 120); }, secs);
/** Clears the sandbox and pauses the real-time loop, so only sim() moves things - from the same clock and the same random numbers every run. */
let freshN = 0;
const fresh = () => ev((n) => {
  const sf = window.__sf;
  sf.sb.clear();
  sf.sb.time = 0;
  sf.ui.select(null);
  sf.sb.paused = true;
  // (after the clear: dropping what the last lot were holding uses some up)
  window.__seed(9001 + n * 7919);
}, freshN++);

await page.goto(url, { waitUntil: 'load' });
await page.waitForSelector('#btn-play', { state: 'visible', timeout: 30000 });

/* --------------------------------- title -------------------------------- */

check('title screen shows PLAY', await page.isVisible('#btn-play'));
const t0 = await ev(() => window.__sf.sb.people.map((p) => p.pos.x));
await page.waitForTimeout(2500);
const t1 = await ev(() => window.__sf.sb.people.map((p) => p.pos.x));
check('stickmen are already living their lives behind the title', t0.length >= 3 && t0.some((x, i) => Math.abs(x - t1[i]) > 0.05),
  `${t0.length} people`);
await shot('title');

await page.tap('#btn-play');
await page.waitForTimeout(500);
check('PLAY opens the game, the HUD and the spawn menu', await ev(() =>
  !document.querySelector('#hud').classList.contains('hidden') && document.querySelector('#drawer').classList.contains('open')));
check('the sandbox starts empty', await ev(() => window.__sf.sb.people.length === 0 && window.__sf.sb.crates.length === 0));
const cards = await ev(() => [...document.querySelectorAll('.card')].map((c) => c.dataset.spawn));
const BASE = ['stickman', 'officer', 'knuckles', 'knife', 'machete', 'crowbar', 'glock', 'm1911', 'ak47', 'mossberg', 'taser', 'crate', 'vest',
  'ammo9', 'ammo45', 'ammo762', 'ammo12', 'woodWall', 'metalWall', 'glassWall', 'tree', 'bush'];
check('there are twenty-two things to spawn: a Stickman, an Officer, Brass Knuckles, a Combat Knife, a Machete, a Crowbar, a Glock-19, an M1911, an AK-47, a Mossberg 500, a Taser, a Crate, a Light Vest, four kinds of ammo, three walls, a Tree and a Bush',
  cards.length === BASE.length && BASE.every((k) => cards.includes(k)), cards.join(', '));
check('the cards are named for what they spawn', await ev(() =>
  ['Stickman', 'Brass Knuckles', 'Combat Knife', 'Machete', 'Glock-19', 'Crate'].every((n) => [...document.querySelectorAll('.card b')].some((b) => b.textContent === n))));
await shot('menu');

/* ------------------------------ grey and black --------------------------- */

const colours = await ev(() => {
  const c = document.getElementById('view');
  const g = c.getContext('2d');
  const at = (x, y) => [...g.getImageData(Math.round(x * c.width), Math.round(y * c.height), 1, 1).data];
  return { sky: at(0.6, 0.35), floor: at(0.6, 0.95) };
});
const grey = (p) => Math.abs(p[0] - p[1]) < 6 && Math.abs(p[1] - p[2]) < 6 && p[0] > 110 && p[0] < 200;
check('the background is grey', grey(colours.sky), colours.sky.slice(0, 3).join(','));
check('the ground is black', colours.floor[0] < 12 && colours.floor[1] < 12 && colours.floor[2] < 12, colours.floor.slice(0, 3).join(','));

/* -------------------------------- spawning ------------------------------- */

await page.tap('.card[data-spawn="stickman"]');
await page.waitForTimeout(350);
check('picking a card closes the menu and arms the spawn tool', await ev(() =>
  !document.querySelector('#drawer').classList.contains('open') && window.__sf.ui.tool === 'spawn' && window.__sf.ui.spawnKind === 'stickman'));
const tapAt = async (x, y) => { await page.touchscreen.tap(x, y); await page.waitForTimeout(80); };
// paused while placing things, so nobody wanders under the next tap
await ev(() => { window.__sf.sb.paused = true; });
await tapAt(300, 180);
await tapAt(520, 180);
const spawned = await ev(() => window.__sf.sb.people.map((p) => ({ x: p.pos.x, sx: window.__sf.cam.toScreen(p.pos.x, 0).x, onFloor: Math.abs(p.pos.y) < 0.05 })));
check('tapping the world places a stickman where it was tapped, on the floor',
  spawned.length === 2 && Math.abs(spawned[0].sx - 300) < 25 && Math.abs(spawned[1].sx - 520) < 25, JSON.stringify(spawned.map((s) => Math.round(s.sx))));
await page.tap('#btn-menu');
await page.waitForTimeout(300);
await page.tap('.card[data-spawn="crate"]');
await page.waitForTimeout(300);
await tapAt(700, 120);
await page.tap('#btn-menu');
await page.waitForTimeout(300);
await page.tap('.card[data-spawn="knuckles"]');
await page.waitForTimeout(300);
await tapAt(160, 300);
check('a crate and a set of brass knuckles appear where tapped', await ev(() => {
  const sb = window.__sf.sb, cam = window.__sf.cam;
  return sb.crates.length === 1 && sb.knuckles.length === 1 &&
    Math.abs(cam.toScreen(sb.crates[0].pos.x, 0).x - 700) < 30 && Math.abs(cam.toScreen(sb.knuckles[0].pos.x, 0).x - 160) < 30;
}));
await ev(() => { window.__sf.sb.paused = false; });
await page.waitForTimeout(1500);
check('the crate falls and comes to rest on the floor', await ev(() => {
  const c = window.__sf.sb.crates[0];
  return Math.abs(c.pos.y - 0.39) < 0.05 && Math.hypot(c.body.vel.x, c.body.vel.y) < 0.2;
}));
await shot('spawned');

/* ------------------------------- animation ------------------------------ */

await fresh();
const anim = await ev(() => {
  const sf = window.__sf, sb = sf.sb;
  // (an everyday height: a taller body takes longer strides, so fewer of them)
  const p = sb.spawnStickman(0, null, { name: 'Walker', scale: 1 });
  p.brain = null;                 // just the body, for this
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  p.goTo(6, 'walk');
  const order = [];
  const xs = [];
  for (let i = 0; i < 240; i++) {
    sb.step(1 / 120);
    if (i % 6 === 0) { order.push(Math.sign(p.wj.footA.x - p.wj.footB.x)); xs.push(p.wj.handA.x - p.pos.x); }
  }
  let swaps = 0;
  for (let i = 1; i < order.length; i++) if (order[i] !== order[i - 1]) swaps++;
  return { clip: p.anim.baseName, swaps, moved: p.pos.x, handRange: Math.max(...xs) - Math.min(...xs) };
});
check('walking plays the walk cycle: the feet trade places and the arms swing', anim.clip === 'walk' && anim.swaps >= 4 && anim.handRange > 0.15,
  `${anim.clip}, ${anim.swaps} swaps, moved to ${anim.moved.toFixed(2)}`);
const flip = await ev(() => {
  const sf = window.__sf, sb = sf.sb;
  const p = sb.people[0];
  sf.STYLE.flipbook = true;
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  // with flipbook on, every pose on screen is one of the hand-keyed frames, exactly
  const clip = p.anim.base.clip;
  const pose = p.anim.basePose;
  const match = clip.frames.some((f) => Math.abs(f.p.lAu - pose.lAu) < 1e-9 && Math.abs(f.p.aBu - pose.aBu) < 1e-9);
  sf.STYLE.flipbook = false;
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  const smooth = !clip.frames.some((f) => Math.abs(f.p.lAu - p.anim.basePose.lAu) < 1e-9);
  return { match, smooth, clip: clip.name };
});
check('animation is keyed frame by frame: in flipbook mode every pose is a hand-keyed frame', flip.match, flip.clip);
check('in smooth mode the frames are eased into each other', flip.smooth);

/* ------------------------------- the brain ------------------------------ */

await fresh();
const brain = await ev(() => {
  const sb = window.__sf.sb;
  const a = sb.spawnStickman(-1, null, { name: 'Ann', traits: { sociability: 0.95, aggression: 0.1, temper: 0.1 } });
  const b = sb.spawnStickman(2, null, { name: 'Ben', traits: { sociability: 0.95, aggression: 0.1, temper: 0.1 } });
  a.facing = 1; b.facing = -1;
  const said = [];
  sb.on('speech', (e) => said.push(e.who.name + ': ' + e.text));
  for (let i = 0; i < 120 * 25; i++) sb.step(1 / 120);
  return {
    said: said.length,
    sample: said.slice(0, 4),
    chatted: a.brain.rel(b).chatT > 0 || b.brain.rel(a).chatT > 0 || said.length > 2,
    like: a.brain.rel(b).like,
    thoughts: a.brain.thoughts.length,
    traits: Object.keys(a.traits).length,
  };
});
check('every stickman has a personality (eight traits) and a stream of thoughts', brain.traits === 8 && brain.thoughts >= 2);
check('two friendly stickmen notice each other and talk', brain.chatted && brain.said >= 3, brain.sample.join(' | '));

await fresh();
const hurt = await ev(() => {
  const sb = window.__sf.sb;
  const p = sb.spawnStickman(0, null, { name: 'Cal', traits: { bravery: 0.3 } });
  for (let i = 0; i < 120; i++) sb.step(1 / 120);
  // he still sees, hears and feels everything, he just does not wander off
  p.brain.clearBehaviour();
  p.brain.thinkT = 1e9;
  p.stop();
  const before = { fear: p.brain.emo.fear, surprise: p.brain.emo.surprise, pain: p.health.pain };
  sb.spawnCrate(p.wj.hip.x, 4.5);
  let peak = { fear: 0, surprise: 0, pain: 0 };
  for (let i = 0; i < 120 * 1.5; i++) {
    sb.step(1 / 120);
    peak = { fear: Math.max(peak.fear, p.brain.emo.fear), surprise: Math.max(peak.surprise, p.brain.emo.surprise), pain: Math.max(peak.pain, p.health.pain) };
  }
  const hurtParts = Object.entries(p.health.parts).filter(([, v]) => v.hp < v.max).map(([k]) => k);
  return { before, peak, hurtParts, thought: p.brain.thoughts.map((t) => t.text).join(' / '), state: p.state };
});
check('a crate dropped on someone hurts the parts it hits', hurt.hurtParts.length > 0, hurt.hurtParts.join(', '));
check('...and they feel it: pain, fear and surprise go up', hurt.peak.pain > hurt.before.pain + 5 && hurt.peak.fear > hurt.before.fear + 0.1 && hurt.peak.surprise > 0.4,
  `pain ${hurt.peak.pain.toFixed(0)}, fear ${hurt.peak.fear.toFixed(2)}, surprise ${hurt.peak.surprise.toFixed(2)}`);
check('...and think about it', /out of nowhere|hit me|hit the ground/i.test(hurt.thought), hurt.thought);

/* -------------------------------- fighting ------------------------------ */

await fresh();
const fight = await ev(() => {
  const sb = window.__sf.sb;
  const a = sb.spawnStickman(-1.2, null, { name: 'Axl', traits: { aggression: 0.9, temper: 0.9, bravery: 0.9, skill: 0.6, empathy: 0.3 } });
  const b = sb.spawnStickman(1.2, null, { name: 'Bea', traits: { aggression: 0.5, temper: 0.5, bravery: 0.6, skill: 0.5 } });
  const w = sb.spawnStickman(5, null, { name: 'Wes', traits: { empathy: 0.8, bravery: 0.4 } });
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  a.brain.rel(b).anger = 1;
  a.brain.rel(b).like = -0.7;
  w.brain.rel(b).like = 0.6;
  const hits = [], kos = [];
  let contactOK = true;
  sb.on('hit', (e) => {
    if (!e.by || e.kind === 'impact') return;
    // a hit has to come from the striking hand or foot actually being on the body
    const s = e.by.strike;
    if (s) {
      const limb = e.by.wj[s.def.limb];
      if (Math.hypot(limb.x - e.x, limb.y - e.y) > 0.2) contactOK = false;
    }
    hits.push({ by: e.by.name, part: e.part, dmg: e.damage });
  });
  sb.on('ko', (e) => kos.push(e.who.name));
  sb.on('knockdown', (e) => kos.push(e.who.name));
  const wFeel0 = w.brain.emo.fear + w.brain.emo.anger + w.brain.emo.surprise;
  let wPeak = 0, wentFor = -1, firstHitT = -1, blocked = 0;
  const bDid = new Set(), wDid = new Set();
  const t0 = sb.time;
  sb.on('hit', (e) => { if (firstHitT < 0) firstHitT = sb.time - t0; if (e.who === b && e.blocked) blocked++; });
  for (let i = 0; i < 120 * 30; i++) {
    sb.step(1 / 120);
    if (wentFor < 0 && a.brain.fightTarget === b) wentFor = sb.time - t0;
    if (b.brain.behaviour) bDid.add(b.brain.behaviour.kind);
    if (w.brain.behaviour) wDid.add(w.brain.behaviour.kind);
    wPeak = Math.max(wPeak, w.brain.emo.fear + w.brain.emo.anger + w.brain.emo.surprise);
  }
  return {
    hits: hits.length, first: hits.length ? hits[0].by : null, byB: hits.filter((h) => h.by === 'Bea').length, wentFor, firstHitT,
    blocked, bDid: [...bDid],
    parts: [...new Set(hits.map((h) => h.part))], kos, contactOK,
    bHurt: 1 - b.health.overall, wFeel0, wPeak, wDid: [...wDid], wThought: w.brain.thoughts.map((t) => t.text).join(' / '),
  };
});
check('a stickman with a grudge goes for them, and blows land', fight.wentFor >= 0 && (fight.firstHitT < 0 || fight.wentFor <= fight.firstHitT) && fight.hits >= 5,
  `decided to fight at ${fight.wentFor.toFixed(2)} s, first blow at ${fight.firstHitT.toFixed(2)} s by ${fight.first}, ${fight.hits} in all`);
check('the one attacked defends themselves: hits back, blocks, runs or cowers', fight.byB >= 1 || fight.blocked >= 1 || fight.bDid.some((k) => ['fight', 'flee', 'hide', 'cower'].includes(k)),
  `${fight.byB} back, ${fight.blocked} blocked, ${fight.bDid.join(', ')}`);
check('every blow lands where the fist or foot actually was', fight.contactOK);
check('blows land on different parts of the body', fight.parts.length >= 2, fight.parts.join(', '));
check('someone gets knocked down or out', fight.kos.length >= 1, fight.kos.join(', '));
// reacting is feeling it, or doing something about it: stepping in, watching, helping, getting away
const wReacted = fight.wDid.filter((k) => ['confront', 'watch', 'help', 'flee', 'hide', 'cower'].includes(k));
check('a friend watching it happen reacts', fight.wPeak > fight.wFeel0 + 0.3 || wReacted.length > 0,
  `${wReacted.join(', ') || 'felt it'}: ${fight.wThought.slice(0, 140)}`);

/* ------------------------------ brass knuckles --------------------------- */

await fresh();
const arm = await ev(() => {
  const sb = window.__sf.sb;
  const a = sb.spawnStickman(0, null, { name: 'Ivy', traits: { aggression: 0.9, temper: 0.8, bravery: 0.9, curiosity: 0.6 } });
  const b = sb.spawnStickman(4, null, { name: 'Jun', traits: { aggression: 0.2, bravery: 0.4 } });
  sb.spawnKnuckles(1.5, 0.1);
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  a.facing = 1;
  a.brain.rel(b).anger = 0.8;
  a.brain.rel(b).like = -0.5;
  let armedAt = -1, firstHit = -1;
  const t0 = sb.time;
  sb.on('hit', (e) => { if (e.by === a && firstHit < 0) firstHit = sb.time - t0; });
  for (let i = 0; i < 120 * 20; i++) {
    sb.step(1 / 120);
    if (armedAt < 0 && a.weapon) armedAt = sb.time - t0;
  }
  return { armed: !!a.weapon, armedAt, firstHit };
});
check('an angry stickman grabs the brass knuckles on the way to a fight', arm.armedAt >= 0 && (arm.firstHit < 0 || arm.armedAt < arm.firstHit),
  `armed at ${arm.armedAt.toFixed(1)} s, first blow at ${arm.firstHit.toFixed(1)} s`);

await fresh();
const dmg = await ev(() => {
  const sb = window.__sf.sb;
  // the same punches at a dummy who just stands there, with and without
  const a = sb.spawnStickman(0, null, { name: 'Rex', scale: 1, strength: 1 });
  let d = null;
  a.brain = null;
  a.facing = 1;
  const k = sb.spawnKnuckles(-3, 0.1);
  const out = { bare: [], armed: [] };
  sb.on('hit', (e) => { if (e.by === a && !e.blocked) (e.armed ? out.armed : out.bare).push(e.damage); });
  const swing = (n) => {
    for (let s = 0; s < n; s++) {
      for (let i = 0; i < 90; i++) { sb.step(1 / 120); if (a.ready) break; }
      // (a hard one can send the dummy stumbling, or over: then a fresh one)
      if (!d || d.state !== 'stand') {
        if (d) sb.remove(d);
        d = sb.spawnStickman(0.85, null, { name: 'Dummy', scale: 1 });
        d.brain = null;
        for (let i = 0; i < 30; i++) sb.step(1 / 120);
      }
      d.health.heal(); d.balance = 1; d.pos.x = 0.85; d.vel.x = 0; d.facing = -1; a.pos.x = 0; a.vel.x = 0; a.stamina = 1;
      a.attack('cross', d);
      for (let i = 0; i < 60; i++) sb.step(1 / 120);
    }
  };
  swing(6);
  k.wear(a); a.weapon = k;
  swing(6);
  return out;
});
const avg = (l) => l.reduce((s, v) => s + v, 0) / Math.max(1, l.length);
check('punches with brass knuckles do about twice the damage', dmg.armed.length >= 3 && dmg.bare.length >= 3 && avg(dmg.armed) > avg(dmg.bare) * 1.6,
  `bare ${avg(dmg.bare).toFixed(1)} x${dmg.bare.length}, armed ${avg(dmg.armed).toFixed(1)} x${dmg.armed.length}`);

/* ---------------------------------- crates ------------------------------- */

await fresh();
const crates = await ev(() => {
  const sb = window.__sf.sb;
  const c1 = sb.spawnCrate(0, 0.4), c2 = sb.spawnCrate(0.05, 1.2), c3 = sb.spawnCrate(-0.05, 2);
  for (let i = 0; i < 120 * 3; i++) sb.step(1 / 120);
  const y = [c1.pos.y, c2.pos.y, c3.pos.y];
  for (let i = 0; i < 120 * 3; i++) sb.step(1 / 120);
  const drift = Math.max(Math.abs(c1.pos.y - y[0]), Math.abs(c2.pos.y - y[1]), Math.abs(c3.pos.y - y[2]));
  const p = sb.spawnStickman(-0.8, null, { name: 'Kit' });
  p.brain = null;
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  p.goTo(-0.3, 'walk');
  for (let i = 0; i < 120 * 2; i++) sb.step(1 / 120);
  return { stack: y.map((v) => v.toFixed(2)), drift, blocked: p.pos.x < -0.38 };
});
check('crates stack and stay stacked', crates.drift < 0.01 && +crates.stack[2] > 1.9, `${crates.stack.join(', ')}, drift ${crates.drift.toFixed(4)}`);
check('a crate is solid: people bump into it', crates.blocked);

await fresh();
const climb = await ev(() => {
  const sb = window.__sf.sb;
  sb.spawnCrate(1, 0.4);
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  const p = sb.spawnStickman(-1.5, null, { name: 'Lou' });
  p.brain = null;
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  p.goTo(1, 'walk');
  let top = 0;
  for (let i = 0; i < 120 * 4; i++) { sb.step(1 / 120); top = Math.max(top, p.pos.y); }
  return { top, onIt: p.onGround && p.pos.y > 0.7 };
});
check('a stickman walking at a crate jumps up onto it', climb.onIt, `stood at ${climb.top.toFixed(2)} m`);

await fresh();
const seat = await ev(() => {
  const sb = window.__sf.sb;
  const c = sb.spawnCrate(0, 0.4);
  const p = sb.spawnStickman(-2.5, null, { name: 'Rae', traits: { curiosity: 0.15, aggression: 0.2, sociability: 0.1 } });
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  p.facing = 1;
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  const saw = p.brain.things.has(c);
  // they have had a good look at it already, and are bored stiff
  p.brain.inspected.add(c);
  p.brain.boredom = 0.95;
  let sat = false, x = 0;
  for (let i = 0; i < 120 * 45 && !sat; i++) {
    sb.step(1 / 120);
    if (p.posture === 'sitEdge' && p.support === c.body) { sat = true; x = p.pos.x - c.pos.x; }
  }
  return { saw, sat, x, label: p.brain.behaviour ? p.brain.behaviour.label : '' };
});
check('a stickman looking at a crate sees it', seat.saw);
check('a calm, bored stickman climbs onto a crate and sits on its edge', seat.sat && Math.abs(seat.x) > 0.15, `${seat.label}, ${seat.x.toFixed(2)} m from the middle`);

await fresh();
const bowl = await ev(() => {
  const sb = window.__sf.sb;
  const a = sb.spawnStickman(-6.2, null, { name: 'Sid' });
  const b = sb.spawnStickman(0, null, { name: 'Tam' });
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  let hit = null;
  sb.on('collide', (e) => { if (!hit) hit = { who: e.who.name, what: e.what.name, speed: e.speed }; });
  // swung along at chest height and let go just short of Tam (a flailing
  // limb can reach Tam before the hand lets go)
  const hpA = a.health.overall, hpB = b.health.overall;
  const n = a.wj.neck;
  a.grab(n.x, n.y);
  let x = n.x;
  for (let i = 0; i < 40; i++) { x += 14 / 120; a.holdAt(x, 1.5); sb.step(1 / 120); }
  a.release();
  for (let i = 0; i < 120 * 1.5; i++) sb.step(1 / 120);
  return { hit, hurtB: hpB - b.health.overall, hurtA: hpA - a.health.overall, bState: b.state };
});
check('a stickman thrown into another knocks into them, and both get hurt', !!bowl.hit && bowl.hurtB > 0.005 && bowl.hurtA > 0.005,
  bowl.hit ? `${bowl.hit.what} into ${bowl.hit.who} at ${bowl.hit.speed.toFixed(1)} m/s, ${bowl.hit.who} ${bowl.bState}` : 'no collision');

/* ----------------------------- injuries, death ---------------------------- */

await fresh();
const injuries = await ev(() => {
  const sb = window.__sf.sb;
  const p = sb.spawnStickman(0, null, { name: 'Mo' });
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  p.health.parts.armA.broken = true;
  const noCross = !p.strikes().includes('cross');
  p.health.parts.legB.broken = true;
  for (let i = 0; i < 120 * 6; i++) sb.step(1 / 120);
  return { noCross, state: p.state };
});
check('a broken arm cannot throw a punch', injuries.noCross);
check('a broken leg puts them on the floor, crawling', injuries.state === 'crawl', injuries.state);

await fresh();
const death = await ev(() => {
  const sb = window.__sf.sb;
  const v = sb.spawnStickman(0, null, { name: 'Ned', traits: { sociability: 0.8 } });
  const f = sb.spawnStickman(2.5, null, { name: 'Ola', traits: { empathy: 0.95, bravery: 0.6, sociability: 0.8 } });
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  f.facing = -1;
  f.brain.rel(v).like = 0.8;
  f.brain.rel(v).fam = 0.6;
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  const sad0 = f.brain.emo.sadness;
  let fx = 0;
  for (let k = 0; k < 12 && v.alive; k++) {
    v.takeHit({ by: null, part: 'head', x: v.wj.head.x, y: v.wj.head.y, dir: 1, power: 3, kind: 'impact' });
    for (let i = 0; i < 30; i++) sb.step(1 / 120);
  }
  const deadAt = sb.time;
  let mourned = false, peakSad = 0;
  for (let i = 0; i < 120 * 25; i++) {
    sb.step(1 / 120);
    peakSad = Math.max(peakSad, f.brain.emo.sadness);
    if (f.brain.behaviour && f.brain.behaviour.kind === 'mourn') mourned = true;
  }
  return { dead: v.dead, state: v.state, eyes: v.face.eyes, headY: v.wj.head.y, lying: v.wj.head.y < 0.5, cause: v.health.cause, sad0, peakSad, mourned, fx };
});
check('enough damage kills a stickman', death.dead && death.state === 'dead', death.cause);
check('the dead lie still on the floor with crosses for eyes', death.lying && death.eyes === 'x', `head at ${death.headY.toFixed(2)} m, eyes ${death.eyes}`);
check('a friend who saw it is saddened and goes to mourn', death.peakSad > death.sad0 + 0.25 && death.mourned,
  `sadness ${death.sad0.toFixed(2)} -> ${death.peakSad.toFixed(2)}`);

/* ------------------------------- the hand -------------------------------- */

await fresh();
await ev(() => { const sb = window.__sf.sb; window.__p = sb.spawnStickman(0, null, { name: 'Pip' }); window.__sf.sb.paused = false; window.__sf.ui.setTool('hand'); });
await page.waitForTimeout(500);
let neck = await ev(() => window.__sf.cam.toScreen(window.__p.wj.neck.x, window.__p.wj.neck.y));
await touch('touchStart', neck.x, neck.y);
for (let i = 1; i <= 14; i++) { await touch('touchMove', neck.x + i, neck.y - i * 9); await page.waitForTimeout(16); }
await page.waitForTimeout(250);
const held = await ev(() => ({ state: window.__p.state, y: window.__p.pos.y }));
check('dragging a stickman picks them up', held.state === 'held' && held.y > 0.5, `${held.state} at ${held.y.toFixed(2)} m`);
await shot('held');
for (let i = 1; i <= 6; i++) { await touch('touchMove', neck.x + 14 + i * 30, neck.y - 126 - i * 4); await page.waitForTimeout(16); }
await touch('touchEnd', 0, 0);
await page.waitForTimeout(100);
const thrown = await ev(() => ({ state: window.__p.state, vx: window.__p.vel.x }));
check('letting go while moving throws them', (thrown.state === 'thrown' || thrown.state === 'air') && thrown.vx > 2, `${thrown.state}, ${thrown.vx.toFixed(1)} m/s`);
let landed = null;
for (let k = 0; k < 40; k++) {
  await page.waitForTimeout(200);
  landed = await ev(() => ({ state: window.__p.state, y: window.__p.pos.y }));
  if (landed.y < 0.05 && landed.state !== 'thrown' && landed.state !== 'held') break;
}
check('...and they come back down', landed.y < 0.05 && landed.state !== 'thrown' && landed.state !== 'held', landed.state);

/* ------------------------------- inspector -------------------------------- */

await ev(() => { window.__sf.sb.paused = false; });
await page.waitForTimeout(1500);
// wherever the throw took them, the camera goes there
neck = await ev(() => {
  const sf = window.__sf, p = window.__p;
  sf.sb.paused = true;
  sf.cam.follow = null; sf.cam.glide = null;
  sf.cam.x = p.wj.hip.x;
  sf.cam.clamp();
  return sf.cam.toScreen(p.wj.hip.x, p.wj.hip.y + 0.1);
});
await page.waitForTimeout(100);
await page.touchscreen.tap(neck.x, neck.y);
await page.waitForTimeout(400);
const ins = await ev(() => ({
  open: !document.querySelector('#inspector').classList.contains('hidden'),
  name: document.querySelector('#ins-name').textContent,
  bars: document.querySelectorAll('#ins-emotions .meter').length,
  thoughts: document.querySelectorAll('#ins-thoughts .thought').length,
}));
check('tapping a stickman opens their mind: name, five emotions, thoughts', ins.open && ins.name === 'Pip' && ins.bars === 5 && ins.thoughts >= 1,
  JSON.stringify(ins));
await shot('inspector');

await page.tap('.tool[data-tool="erase"]');
await page.waitForTimeout(200);
neck = await ev(() => { const p = window.__p; return window.__sf.cam.toScreen(p.wj.hip.x, p.wj.hip.y + 0.1); });
await page.touchscreen.tap(neck.x, neck.y);
await page.waitForTimeout(300);
check('the erase tool removes what it touches', await ev(() => window.__sf.sb.people.length === 0));
await page.tap('.tool[data-tool="hand"]');

/* -------------------------------- ragdolls -------------------------------- */

await fresh();
const limp = await ev(() => {
  const sb = window.__sf.sb;
  const p = sb.spawnStickman(0, null, { name: 'Rag' });
  p.brain = null;
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  // (on the skull: one on the neck can break it, and that kills as often as not)
  p.takeHit({ by: null, part: 'head', x: p.wj.head.x, y: p.wj.head.y, dir: 1, power: 4.5, kind: 'impact', bone: 'skull' });
  const wentLimp = !!p.rag && p.state === 'ko';
  // every joint stays inside the range it bends through, the whole way down
  let worst = 0, worstName = '';
  for (let i = 0; i < 120 * 4; i++) {
    sb.step(1 / 120);
    if (!p.rag) break;
    for (const j of p.rag.joints) {
      const off = Math.atan2(Math.sin(p.rag.rawBend(j) - p.rag.facing * j.center), Math.cos(p.rag.rawBend(j) - p.rag.facing * j.center));
      const over = Math.abs(off) - j.half;
      if (over > worst) { worst = over; worstName = j.name; }
    }
  }
  return { wentLimp, still: !!p.rag && p.wj.head.y < 0.5 && p.rag.maxSpeed < 0.5, worst: worst * 180 / Math.PI, worstName, headY: p.wj.head.y };
});
check('knocked out, they go limp: a ragdoll that falls however it falls and comes to rest', limp.wentLimp && limp.still, `head at ${limp.headY.toFixed(2)} m`);
check('a ragdoll\'s joints only bend the ways joints bend: no knee or elbow the wrong way', limp.worst < 4,
  limp.worst > 0 ? `${limp.worstName} past its range by ${limp.worst.toFixed(1)} degrees` : 'all inside');

await fresh();
const ankle = await ev(() => {
  const sb = window.__sf.sb;
  const p = sb.spawnStickman(0, null, { name: 'Dangle' });
  p.brain = null;
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  const f0 = { x: p.wj.footA.x, y: p.wj.footA.y };
  p.grab(f0.x, f0.y);
  // lifted up over half a second, then held there: they swing, then hang
  let head = 0, n = 0;
  for (let i = 0; i < 120 * 4; i++) {
    const u = Math.min(1, i / 60);
    p.holdAt(f0.x * (1 - u), f0.y + (2.6 - f0.y) * u);
    sb.step(1 / 120);
    if (i >= 120 * 3) { head += p.wj.head.y; n++; }
  }
  const out = { state: p.state, foot: p.wj.footA.y, head: head / n, toHand: Math.hypot(p.wj.footA.x, p.wj.footA.y - 2.6) };
  p.release();
  return out;
});
check('picked up by an ankle, they hang upside down from it', ankle.state === 'held' && ankle.head < ankle.foot - 0.6 && ankle.toHand < 0.12,
  `foot at ${ankle.foot.toFixed(2)} m, head at ${ankle.head.toFixed(2)} m on average`);

await fresh();
const pin = await ev(() => {
  const sb = window.__sf.sb;
  const p = sb.spawnStickman(0, null, { name: 'Flat' });
  p.brain = null;
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  p.health.conscious = 0.1;
  p.knockOut(1, 0.5);
  for (let i = 0; i < 120 * 3; i++) sb.step(1 / 120);
  const c = sb.spawnCrate(p.wj.chest.x, 1.2);
  let pinned = false;
  for (let i = 0; i < 120 * 2.5; i++) { sb.step(1 / 120); if (p.pinnedBy === c) pinned = true; }
  return { pinned, bottom: c.body.aabb().minY, lying: p.wj.head.y < 0.5 };
});
check('a crate dropped on a body lands on it instead of through it', pin.pinned || pin.bottom > 0.05,
  `crate bottom at ${pin.bottom.toFixed(2)} m${pin.pinned ? ', pinning them' : ''}`);

await fresh();
const comeRound = await ev(() => {
  const sb = window.__sf.sb;
  const p = sb.spawnStickman(0, null, { name: 'Tough', traits: { toughness: 0.9 } });
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  p.balance = -1;
  p.knockDown(1, 1.5, { x: p.wj.chest.x, y: p.wj.chest.y });
  const limp = !!p.rag;
  let up = -1, recovered = -1;
  for (let i = 0; i < 120 * 12 && up < 0; i++) {
    sb.step(1 / 120);
    if (recovered < 0 && !p.rag) recovered = sb.time;
    if (p.state === 'stand' && !p.rag) up = sb.time;
  }
  return { limp, recovered, up };
});
check('knocked off their feet they fall limp, and once they come to rest they get up again', comeRound.limp && comeRound.recovered > 0 && comeRound.up > 0,
  comeRound.up > 0 ? 'back up' : 'still down');

/* ---------------------------------- bones --------------------------------- */

await fresh();
const bones = await ev(() => {
  const sb = window.__sf.sb;
  const p = sb.spawnStickman(0, null, { name: 'Brittle' });
  p.brain = null;
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  p.health.breakBone('forearmA');
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  const j = p.wj;
  // how far the break point sits off the line between the elbow and the hand
  const ax = j.elbowA.x, ay = j.elbowA.y, bx = j.handA.x, by = j.handA.y;
  const off = Math.abs((bx - ax) * (j.midForeA.y - ay) - (by - ay) * (j.midForeA.x - ax)) / Math.hypot(bx - ax, by - ay);
  const named = p.health.conditions().includes('Broken right forearm');
  const noPunch = !p.strikes().includes('cross');
  const q = sb.spawnStickman(3, null, { name: 'Back' });
  q.brain = null;
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  q.health.breakBone('spine');
  for (let i = 0; i < 120 * 6; i++) sb.step(1 / 120);
  return { off, named, noPunch, back: q.state, paralysed: q.health.paralysed, conds: q.health.conditions().slice(0, 3).join(', ') };
});
check('a broken bone has its name, stops the limb working, and bends where it broke', bones.named && bones.noPunch && bones.off > 0.03,
  `bent ${(bones.off * 100).toFixed(0)} cm off straight`);
check('a broken back paralyses the legs: they drag themselves along', bones.back === 'crawl' && bones.paralysed === 'legs', `${bones.back}: ${bones.conds}`);

/* ------------------------------- the knife -------------------------------- */

await fresh();
const knife = await ev(() => {
  const sb = window.__sf.sb;
  const a = sb.spawnStickman(-0.6, null, { name: 'Kit' });
  const b = sb.spawnStickman(0.4, null, { name: 'Lee' });
  const k = sb.spawnKnife(-0.3, 0.05);
  a.brain = null; b.brain = null;
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  a.facing = 1;
  for (let i = 0; i < 20; i++) sb.step(1 / 120);
  const picked = a.pickUp(k);
  for (let i = 0; i < 120; i++) sb.step(1 / 120);
  const holding = a.weapon === k;
  // how much a blow makes them bleed: stabs against punches with the other
  // hand, five that land of each (a punch to the face splits it now and then)
  const cut = [];
  sb.on('hit', (e) => { if (e.by === a) cut.push(e); });
  const bleedFrom = (kind) => {
    const out = [];
    for (let t = 0; t < 20 && out.length < 5; t++) {
      b.health.heal(); b.wounds.length = 0;
      b.pos.x = a.pos.x + (kind === 'jab' ? 0.7 : 0.85); b.facing = -1;
      for (let i = 0; i < 30; i++) sb.step(1 / 120);
      const n = cut.length;
      a.attack(kind, b);
      for (let i = 0; i < 70; i++) sb.step(1 / 120);
      if (cut.length > n) out.push(b.health.bleeding);
    }
    return out;
  };
  const stabs = bleedFrom('stab'), jabs = bleedFrom('jab');
  const avg = (v) => (v.length ? v.reduce((x, y) => x + y, 0) / v.length : -1);
  return { picked, holding, stab: avg(stabs), jab: avg(jabs), dry: stabs.filter((v) => v <= 0).length, n: stabs.length };
});
check('a stickman picks up the combat knife and holds it', knife.picked && knife.holding);
check('a stab with it opens a wound that bleeds hard: far more than a punch', knife.n >= 3 && !knife.dry && knife.stab > 0.0025 && knife.stab > knife.jab * 3,
  `stab ${knife.stab.toFixed(4)}, punch ${knife.jab.toFixed(4)} of their blood a second, on average`);

await fresh();
const thrownKnife = await ev(() => {
  const sb = window.__sf.sb;
  const c = sb.spawnCrate(2, 0.4);
  const k1 = sb.spawnKnife(-1, 0.5, 0);
  k1.body.vel.x = 13; k1.body.vel.y = 0.4;
  const p = sb.spawnStickman(-3, null, { name: 'Target', traits: { toughness: 0.8, bravery: 0.5 } });
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  p.facing = 1;
  const k2 = sb.spawnKnife(-6, p.wj.chest.y, 0);
  k2.body.vel.x = 13; k2.body.vel.y = 1.2;
  let inCrate = false, inBody = false, pulled = false;
  for (let i = 0; i < 120 * 10; i++) {
    sb.step(1 / 120);
    if (k1.stuckIn && k1.stuckIn.crate === c) inCrate = true;
    if (p.stuck.length) inBody = true;
    if (inBody && !p.stuck.length) pulled = true;
  }
  return { inCrate, inBody, pulled, said: p.brain.thoughts.map((t) => t.text).slice(-3).join(' / ') };
});
check('a knife thrown point first sticks into a crate', thrownKnife.inCrate);
check('...and into a person, who pulls it out', thrownKnife.inBody && thrownKnife.pulled, thrownKnife.said);

/* ------------------------------- the machete ------------------------------ */

await fresh();
const machete = await ev(() => {
  const sb = window.__sf.sb;
  const steps = (n) => { for (let i = 0; i < n; i++) sb.step(1 / 120); };
  const a = sb.spawnStickman(-0.6, null, { name: 'Kit', traits: { skill: 0.8 } });
  const m = sb.spawnMachete(-0.3, 0.05);
  a.brain = null;
  steps(30);
  a.facing = 1;
  steps(20);
  const picked = a.pickUp(m);
  steps(120);
  const holding = a.weapon === m;
  let chops = 0, gashes = 0, bled = 0, severed = null, victim = null;
  sb.on('hit', (e) => { if (e.by === a && e.weapon === 'machete') chops++; });
  // a few blows at somebody new each time, guard down: how bad the wounds are
  for (let k = 0; k < 6; k++) {
    victim = sb.spawnStickman(a.pos.x + 0.95, null, { name: 'Lou' + k });
    victim.brain = null;
    victim.facing = -1;
    a.pos.x = victim.pos.x - 0.95; a.facing = 1;
    steps(36);
    const n = chops;
    a.attack(k % 2 ? 'hack' : 'chop', victim);
    steps(84);
    if (chops > n) {
      if (Object.values(victim.health.gashes).some(Boolean)) gashes++;
      if (victim.health.bleeding > 0.002) bled++;
    }
    sb.remove(victim);
  }
  const landed = chops;
  victim = null;
  sb.on('sever', (e) => { if (!severed) severed = { lost: e.lost, who: e.who }; });
  // chop at somebody new each time, until something comes off - somebody with
  // their guard up, since an arm thrown up against a machete is what usually goes
  for (let k = 0; k < 80 && !severed; k++) {
    if (victim) sb.remove(victim);
    victim = sb.spawnStickman(a.pos.x + 0.95, null, { name: 'Lee' + k });
    victim.brain = null;
    victim.facing = -1;
    a.pos.x = victim.pos.x - 0.95; a.facing = 1;
    steps(36);
    victim.setPosture('guard');
    if (k % 3 !== 2) victim.block(true);
    steps(12);
    // (a fresh swing each time: eighty in a row would wind anybody, and a tired one cuts less)
    a.stamina = 1;
    a.attack(k % 3 === 2 ? 'hack' : 'chop', victim);
    steps(84);
  }
  const v = severed && severed.who;
  const part = v && Object.keys(v.health.missing)[0];
  return {
    picked, holding, landed, chops: chops - landed, gashes, bled, severed: !!severed, lost: severed && severed.lost,
    limbs: sb.limbs.length, limbName: sb.limbs[0] && sb.limbs[0].name,
    stump: !!(v && part && v.health.stumps[part] > 0), conds: v ? v.health.conditions().slice(0, 4).join('; ') : '',
  };
});
check('a stickman picks up the machete and holds it', machete.picked && machete.holding);
check('a machete chop leaves a gaping wound that bleeds', machete.landed >= 3 && machete.gashes >= 2 && machete.bled >= 2,
  `${machete.landed} blows landed, ${machete.gashes} left a machete wound, ${machete.bled} left them bleeding`);
check('a hard enough chop takes a limb clean off: it falls to the floor and the stump bleeds', machete.severed && machete.limbs >= 1 && machete.stump,
  `${machete.limbName || 'nothing'} off after ${machete.chops} blows landed; ${machete.conds}`);
await ev(() => { const sf = window.__sf; sf.cam.follow = null; sf.cam.glide = null; sf.cam.x = sf.sb.limbs.length ? sf.sb.limbs[0].pos.x : 0; sf.cam.clamp(); });
await page.waitForTimeout(150);
await shot('machete');

await fresh();
const tq = await ev(() => {
  const sb = window.__sf.sb;
  const steps = (n, stop) => { for (let i = 0; i < n; i++) { sb.step(1 / 120); if (stop && stop()) return true; } return false; };
  const v = sb.spawnStickman(0, null, { name: 'Vic', traits: { toughness: 0.9 } });
  const f = sb.spawnStickman(2.5, null, { name: 'Fay', traits: { empathy: 0.95, bravery: 0.8 } });
  steps(60);
  for (const [x, y] of [[v, f], [f, v]]) { const r = x.brain.rel(y); r.like = 0.8; r.fam = 0.6; r.met = true; r.greeted = true; }
  v.sever('forearmA', 1, 1);
  const tied = steps(120 * 40, () => v.health.tourniquet.armA);
  const said = f.brain.thoughts.map((t) => t.text).slice(-2).join(' / ');
  v.dislocate('shoulderB');
  const out = !!v.health.dislocated.shoulderB && !v.health.canUse('armB');
  const back = steps(120 * 40, () => !v.health.dislocated.shoulderB);
  return { tied, out, back, alive: !v.dead, conds: v.health.conditions().slice(0, 3).join('; '), said, vThought: v.brain.thoughts.slice(-3).map((t) => t.text).join(' / ') };
});
check('a friend ties off the stump with a tourniquet', tq.tied && tq.alive, tq.conds);
check('a joint knocked out of its socket stops the arm working, and a friend pops it back in', tq.out && tq.back, tq.vThought);

await fresh();
const face = await ev(() => {
  const sb = window.__sf.sb;
  const p = sb.spawnStickman(0, null, { name: 'Ida', traits: { toughness: 0.9 } });
  p.brain = null;
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  for (let k = 0; k < 14; k++) {
    p.health.parts.head.hp = p.health.parts.head.max;
    p.health.conscious = 1;
    p.takeHit({ by: null, part: 'head', x: p.wj.head.x, y: p.wj.head.y, dir: 1, power: 1.3, kind: 'cross' });
    for (let i = 0; i < 40; i++) sb.step(1 / 120);
  }
  const f = p.health.face;
  return { eye: Math.max(...f.blackEye), lip: f.lip, nose: f.nose, teeth: f.teeth, conds: p.health.conditions().filter((c) => /eye|lip|nose|tooth|teeth/i.test(c)) };
});
check('punches to the face leave their marks: black eyes, a split lip, a bloody nose, knocked-out teeth',
  face.conds.length >= 2 && (face.eye > 0.25 || face.lip > 0.3 || face.nose > 0.3), face.conds.join('; '));

/* ------------------------------- the Glock-19 ------------------------------ */

await fresh();
const pistol = await ev(() => {
  const sb = window.__sf.sb;
  const steps = (n) => { for (let i = 0; i < n; i++) sb.step(1 / 120); };
  const a = sb.spawnStickman(-4, null, { name: 'Gus', traits: { skill: 0.9 } });
  const b = sb.spawnStickman(3, null, { name: 'Tam' });
  // two crates high, so the one on top is in the way of a shot at the chest
  const c0 = sb.spawnCrate(0, 0.4);
  const c = sb.spawnCrate(0, 1.2);
  const g = sb.spawnGun(-3.6, 0.1);
  a.brain = null; b.brain = null;
  steps(30);
  a.facing = 1;
  steps(10);
  const picked = a.pickUp(g);
  steps(120);
  const holding = a.weapon === g && a.armedWith === 'glock';
  let shots = 0, hitTam = 0, hitCrate = 0;
  sb.on('shot', (e) => { if (e.who === a) shots++; });
  sb.on('bulletHit', (e) => { if (e.what === b) hitTam++; if (e.what === c || e.what === c0) hitCrate++; });
  a.aimAt(b);
  steps(80);
  const mag0 = g.mag;
  for (let i = 0; i < 4; i++) { a.fire(); steps(50); }
  const mag1 = g.mag;
  // empty it, then reload
  while (g.mag > 0) { a.fire(); steps(16); }
  const dry = g.mag;
  const reloading = a.reload();
  steps(240);
  return {
    picked, holding, shots, mag0, mag1, dry, reloading, mag2: g.mag, spare: g.spare, hitTam, hitCrate,
    holes: c.holes.length + c0.holes.length, wounds: b.health.conditions().filter((s) => /gunshot|shot|bullet/i.test(s)).join('; '), casings: sb.fx.casings.length,
  };
});
check('a stickman picks up the Glock-19 and holds it up to aim', pistol.picked && pistol.holding);
check('each shot uses a round from the magazine and leaves a casing on the floor', pistol.mag0 - pistol.mag1 === 4 && pistol.casings >= 4,
  `${pistol.mag0} -> ${pistol.mag1}, ${pistol.casings} casings`);
check('the bullets go through the crate in the way and into the person behind it', pistol.hitCrate >= 2 && pistol.holes >= 4 && pistol.hitTam >= 1 && pistol.wounds,
  `${pistol.hitCrate} through the crate (${pistol.holes} holes), ${pistol.hitTam} into Tam: ${pistol.wounds}`);
check('empty, it is reloaded from the spare magazines', pistol.dry === 0 && pistol.reloading && pistol.mag2 === 15 && pistol.spare === 15,
  `${pistol.mag2} in the magazine, ${pistol.spare} spare`);

await fresh();
const tapGun = await ev(() => {
  const sf = window.__sf, sb = sf.sb;
  const g = sb.spawnGun(0, 0.12, 0);
  for (let i = 0; i < 120; i++) sb.step(1 / 120);
  sf.cam.follow = null; sf.cam.glide = null; sf.cam.x = 0; sf.cam.clamp();
  window.__g = g;
  return { mag: g.mag, at: sf.cam.toScreen(g.pos.x, g.pos.y) };
});
await page.tap('.tool[data-tool="hand"]');
await page.touchscreen.tap(tapGun.at.x, tapGun.at.y);
await page.waitForTimeout(250);
const tapped = await ev(() => ({ mag: window.__g.mag, toast: document.querySelector('#toast').textContent }));
check('tapping a pistol lying on the floor fires it', tapped.mag === tapGun.mag - 1, `${tapGun.mag} -> ${tapped.mag}: "${tapped.toast}"`);

await fresh();
const scare = await ev(() => {
  const sb = window.__sf.sb;
  const steps = (n, stop) => { for (let i = 0; i < n; i++) { sb.step(1 / 120); if (stop && stop()) return true; } return false; };
  const g = sb.spawnStickman(-3, null, { name: 'Gus' });
  const t = sb.spawnStickman(1, null, { name: 'Tam', traits: { bravery: 0.2 } });
  const w = sb.spawnStickman(-7, null, { name: 'Wes', traits: { bravery: 0.25 } });
  const pistol = sb.spawnGun(-2.6, 0.1);
  steps(60);
  g.brain = null;
  g.facing = 1;
  g.pickUp(pistol);
  steps(150);
  // wherever the sight of the pistol sent them, they are back in front of Gus and looking at him when it comes up
  t.brain.clearBehaviour();
  t.stop();
  t.pos.x = g.pos.x + 4;
  t.vel.x = 0;
  t.facing = -1;
  g.aimAt(t);
  t.brain.sense();
  // (giving up, or cowering: either way, up go the hands)
  const handsUp = steps(120 * 4, () => t.posture === 'handsUp' && t.brain.behaviour && (t.brain.behaviour.kind === 'surrender' || t.brain.behaviour.kind === 'cower'));
  const tSaid = (t.brain.behaviour ? t.brain.behaviour.kind + ': ' : '') + (t.bubble ? t.bubble.text : '');
  // and then it goes off
  const fear0 = w.brain.emo.fear;
  g.fire();
  const did = new Set();
  let wFear = 0;
  steps(120 * 3, () => {
    for (const p of [t, w]) {
      if (p.brain.behaviour) did.add(p.name + ':' + p.brain.behaviour.kind);
      if (p.posture) did.add(p.name + ':' + p.posture);
    }
    wFear = Math.max(wFear, w.brain.emo.fear);
    return false;
  });
  return { handsUp, tSaid, did: [...did], fear0, wFear };
});
check('with a gun pointed at them, they put their hands up', scare.handsUp, scare.tSaid);
check('a gunshot sends people running or diving for cover', scare.did.some((d) => /^Wes:(flee|hide|cower|surrender|coverHead|handsUp|panic)$/.test(d)) && scare.wFear > scare.fear0 + 0.15,
  `${scare.did.join(', ')}; Wes's fear ${scare.fear0.toFixed(2)} -> ${scare.wFear.toFixed(2)}`);

/* -------------------------------- remembering ------------------------------ */

await fresh();
const mem = await ev(() => {
  const sb = window.__sf.sb;
  const steps = (n, stop) => { for (let i = 0; i < n; i++) { sb.step(1 / 120); if (stop && stop()) return true; } return false; };
  const a = sb.spawnStickman(-1.2, null, { name: 'Axl', traits: { aggression: 0.9, temper: 0.9 } });
  const b = sb.spawnStickman(0.2, null, { name: 'Bea', traits: { bravery: 0.4 } });
  steps(60);
  a.brain = null;
  // a punch, again if it misses
  let m = null;
  for (let k = 0; k < 5 && !m; k++) {
    a.facing = 1;
    b.facing = -1;
    b.pos.x = a.pos.x + 0.8;
    steps(10);
    a.attack('cross', b);
    steps(90);
    m = b.brain.memories.find((x) => x.who === a && x.v < 0);
  }
  // Axl goes away for a while, and comes back
  a.pos.x = -18;
  steps(60);
  b.brain.rel(a).lastSeen = sb.time - 30;
  a.pos.x = b.pos.x - 2.5;
  const recalled = steps(120 * 4, () => b.brain.thoughts.some((t) => /I remember Axl/.test(t.text)));
  return { kept: m ? b.brain.memoryText(m) : null, recalled, thought: b.brain.thoughts.slice(-2).map((t) => t.text).join(' / ') };
});
check('they remember who hurt them', !!mem.kept, mem.kept || 'nothing');
check('...and when that person comes back, it comes back to them', mem.recalled, mem.thought);

await fresh();
const gossip = await ev(() => {
  const sb = window.__sf.sb;
  const a = sb.spawnStickman(-17, null, { name: 'Axl' });
  const b = sb.spawnStickman(9, null, { name: 'Bea', traits: { sociability: 0.9, aggression: 0.1 } });
  const c = sb.spawnStickman(11, null, { name: 'Cal', traits: { sociability: 0.9, aggression: 0.1 } });
  a.brain = null;
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  for (const [x, y] of [[b, c], [c, b]]) { const r = x.brain.rel(y); r.like = 0.7; r.fam = 0.6; r.met = true; r.greeted = true; }
  b.brain.remember('shotMe', a);
  const like0 = c.brain.rel(a).like;
  for (let i = 0; i < 120 * 90; i++) {
    sb.step(1 / 120);
    if (c.brain.memories.some((m) => m.from === b && m.who === a)) break;
  }
  const m = c.brain.memories.find((x) => x.from === b && x.who === a);
  return { told: m ? c.brain.memoryText(m) : null, like0, like1: c.brain.rel(a).like };
});
check('in a chat they pass on what they know: a reputation gets around', !!gossip.told && gossip.like1 < gossip.like0 - 0.1,
  `${gossip.told || 'nothing passed on'}; Cal's liking for Axl ${gossip.like0.toFixed(2)} -> ${gossip.like1.toFixed(2)}`);

/* -------------------------- editing a stickman's mind ----------------------- */

await fresh();
await ev(() => {
  const sf = window.__sf, sb = sf.sb;
  const a = sb.spawnStickman(-1.5, null, { name: 'Gus', traits: { aggression: 0.3, temper: 0.3 } });
  const b = sb.spawnStickman(1.2, null, { name: 'Tam' });
  const c = sb.spawnStickman(3.5, null, { name: 'Bea' });
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  a.brain.setRelation(b, 'friend');
  a.brain.setRelation(c, 'dislikes');
  window.__a = a; window.__b = b; window.__c = c;
  sf.cam.follow = null; sf.cam.glide = null; sf.cam.x = 0; sf.cam.clamp();
  sf.ui.select(a);
});
await page.waitForTimeout(400);
const groups = await ev(() => [...document.querySelectorAll('#ins-people .ppl-group')].map((g) => ({
  title: g.querySelector('.ppl-title').firstChild.textContent, names: [...g.querySelectorAll('.person b')].map((n) => n.textContent),
})));
const titles = groups.map((g) => g.title);
check('the inspector lists everyone under Friends, Knows, Dislikes and - below Dislikes - Enemies',
  titles.indexOf('FRIENDS') === 0 && titles.indexOf('KNOWS') === 1 && titles.indexOf('DISLIKES') === 2 && titles.indexOf('ENEMIES') === 3 &&
  groups[0].names.includes('Tam') && groups[2].names.includes('Bea'), groups.map((g) => g.title + ': ' + g.names.join(',')).join(' | '));

// make Bea an enemy, with the menu in her row
await ev(() => {
  const row = [...document.querySelectorAll('#ins-people .person')].find((r) => r.dataset.name === 'Bea');
  const sel = row.querySelector('select');
  sel.value = 'enemy';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(400);
const enemy = await ev(() => {
  const g = document.querySelector('#ins-people .ppl-group.enemy');
  const r = window.__a.brain.rel(window.__c);
  return { inGroup: [...g.querySelectorAll('.person b')].map((n) => n.textContent), enemy: r.enemy, like: r.like };
});
check('picking Enemy for someone moves them under Enemies, and that is what they think of them now', enemy.inGroup.includes('Bea') && enemy.enemy && enemy.like < -0.6,
  `${enemy.inGroup.join(',')}; liking ${enemy.like.toFixed(2)}`);

// drag the anger bar most of the way along
const angerBar = await ev(() => {
  const row = [...document.querySelectorAll('#ins-emotions .meter')].find((m) => m.firstChild.textContent === 'Anger');
  row.scrollIntoView({ block: 'center' });
  const r = row.querySelector('.bar').getBoundingClientRect();
  return { x0: r.left + r.width * 0.15, x1: r.left + r.width * 0.92, y: r.top + r.height / 2 };
});
await touch('touchStart', angerBar.x0, angerBar.y);
for (let i = 1; i <= 6; i++) await touch('touchMove', angerBar.x0 + (angerBar.x1 - angerBar.x0) * i / 6, angerBar.y);
await touch('touchEnd', angerBar.x1, angerBar.y);
await page.waitForTimeout(150);
const anger = await ev(() => window.__a.brain.emo.anger);
check('dragging a feeling\'s bar sets how they feel', anger > 0.8, `anger ${anger.toFixed(2)}`);

// and turn their bravery all the way up
const brave = await ev(() => {
  const input = [...document.querySelectorAll('#ins-personality .trait')].find((t) => t.firstChild.textContent === 'Bravery').querySelector('input');
  input.value = '97';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return { trait: window.__a.brain.traits.bravery, chips: [...document.querySelectorAll('#ins-traits .chip')].map((c) => c.textContent) };
});
check('the personality sliders change who they are', Math.abs(brave.trait - 0.97) < 0.001 && brave.chips.includes('Brave'), brave.chips.join(', '));

// send them to fight Tam, their friend
await ev(() => { const row = [...document.querySelectorAll('#ins-people .person')].find((r) => r.dataset.name === 'Tam'); row.scrollIntoView({ block: 'center' }); });
await page.waitForTimeout(100);
await page.tap('#ins-people .person[data-name="Tam"] .mini-btn');
await page.waitForTimeout(300);
const ordered = await ev(() => {
  const a = window.__a, b = window.__b, sb = window.__sf.sb;
  const before = { target: a.brain.ordered && a.brain.ordered.target.name, button: document.querySelector('#ins-people .person[data-name="Tam"] .mini-btn').textContent,
    banner: !document.querySelector('#ins-order').classList.contains('hidden') && document.querySelector('#ins-order-text').textContent };
  let hits = 0, after = 0, n = 0;
  sb.on('hit', (e) => { if (e.by === a && e.who === b) hits++; });
  for (let i = 0; i < 120 * 15 && !hits; i++) {
    sb.step(1 / 120);
    n++;
    if (a.brain.fightTarget === b) after++;
  }
  return { ...before, after: after / Math.max(1, n), hits };
});
check('the Fight button sends them after that person, friend or not', ordered.target === 'Tam' && ordered.button === 'Stop' && (ordered.hits >= 1 || ordered.after > 0.9),
  `${ordered.banner}; after Tam ${(ordered.after * 100).toFixed(0)}% of the time, ${ordered.hits} blows landed`);
await shot('inspector-edit');
await page.tap('#ins-order-stop');
await page.waitForTimeout(250);
check('...and they can be called off', await ev(() => !window.__a.brain.ordered && document.querySelector('#ins-order').classList.contains('hidden')));
await ev(() => window.__sf.ui.select(null));

/* ------------------------- animations and words -------------------------- */

const lib = await ev(() => {
  const { CLIPS, LINES } = window.__sf;
  let lines = 0;
  for (const v of Object.values(LINES)) lines += Array.isArray(v) ? v.length : Object.values(v).reduce((a, b) => a + b.length, 0);
  const need = ['stab', 'slash', 'knifeThrow', 'pullOut', 'brace', 'hug', 'highFive', 'handshake', 'pushups', 'squats', 'jumpingJacks', 'handsUp', 'clutchStomach', 'shiver',
    'chop', 'hack', 'macheteGuard', 'aimPistol', 'reload', 'tourniquet', 'popJoint', 'clutchStump', 'coverHead', 'retch', 'shock',
    'handsOnKnees', 'catchBreath', 'holster', 'drawGun', 'pocket', 'unpocket', 'vestOn', 'ammoGrab', 'reloadTaser', 'tased', 'taserZap',
    'commandStop', 'radio', 'cuffing', 'kneelHands', 'sitCuffed', 'crackKnuckles', 'bounce', 'think'];
  return { clips: Object.keys(CLIPS).length, missing: need.filter((n) => !CLIPS[n]), lines, kinds: Object.keys(LINES).length };
});
check('over a hundred and forty hand-keyed clips: knife and machete fighting, aiming and reloading, holstering, tasing, cuffing, catching their breath, hugs, press-ups',
  lib.clips >= 140 && !lib.missing.length, `${lib.clips} clips${lib.missing.length ? ', missing ' + lib.missing.join(' ') : ''}`);
check('hundreds of things to say, for every situation', lib.lines >= 1000 && lib.kinds >= 200, `${lib.lines} lines in ${lib.kinds} situations`);

await fresh();
const bye = await ev(() => {
  const sb = window.__sf.sb;
  const a = sb.spawnStickman(-1, null, { name: 'Mia', traits: { sociability: 0.9, aggression: 0.1 } });
  const b = sb.spawnStickman(1, null, { name: 'Ned', traits: { sociability: 0.9, aggression: 0.1 } });
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  for (const [x, y] of [[a, b], [b, a]]) { const r = x.brain.rel(y); r.like = 0.85; r.fam = 0.6; r.met = true; r.greeted = true; }
  const seen = new Set();
  for (let i = 0; i < 120 * 70 && !(seen.has('hug') || seen.has('highFive')); i++) {
    sb.step(1 / 120);
    for (const p of [a, b]) if (p.anim.actionName) seen.add(p.anim.actionName);
  }
  return [...seen];
});
check('good friends part with a hug or a high five', bye.includes('hug') || bye.includes('highFive'), bye.join(', '));

// a padlock on a feeling: then it stays where it is, whatever happens to them
await fresh();
await ev(() => {
  const sb = window.__sf.sb;
  window.__l = sb.spawnStickman(-1, null, { name: 'Lou' });
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  window.__sf.ui.select(window.__l);
});
await page.waitForTimeout(300);
const lockAt = await ev(() => {
  const row = [...document.querySelectorAll('#ins-emotions .meter')].find((m) => m.firstChild.textContent === 'Anger');
  row.scrollIntoView({ block: 'center' });
  window.__l.brain.emo.set('anger', 0.7);
  const r = row.querySelector('.lock-btn').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await tapAt(lockAt.x, lockAt.y);
await page.waitForTimeout(250);
const lockHeld = await ev(() => {
  const sb = window.__sf.sb, e = window.__l.brain.emo, at = e.anger, joy0 = e.joy;
  // calming down, and cheering up, as hard as it goes: none of it reaches a locked feeling
  for (let i = 0; i < 120 * 6; i++) { if (i % 60 === 0) { e.bump('anger', -0.3); e.bump('joy', 0.1); } sb.step(1 / 120); }
  const row = [...document.querySelectorAll('#ins-emotions .meter')].find((m) => m.firstChild.textContent === 'Anger');
  return { at: +at.toFixed(4), after: +e.anger.toFixed(4), locked: e.isLocked('anger'), shown: row.classList.contains('locked'), joyMoved: Math.abs(e.joy - joy0) > 0.01 };
});
check('the padlock on a feeling locks it: nothing that happens moves it up or down (and the others still move)', lockHeld.locked && lockHeld.shown && lockHeld.at === lockHeld.after && lockHeld.joyMoved, JSON.stringify(lockHeld));
await tapAt(lockAt.x, lockAt.y);
await page.waitForTimeout(150);
const freed = await ev(() => {
  const e = window.__l.brain.emo, at = e.anger;
  e.bump('anger', -0.2);
  return { locked: e.isLocked('anger'), moved: e.anger < at - 0.1 };
});
check('...and tapped again, it is free to change', !freed.locked && freed.moved, JSON.stringify(freed));
await ev(() => window.__sf.ui.select(null));

/* ------------------------ the law, and what it carries ----------------------- */

const spawnKind = (kind, x) => ev(([k, x]) => {
  const ui = window.__sf.ui;
  ui.setSpawnKind(k);
  const made = ui.spawnAt(x, 0.3);
  ui.setSpawnKind('stickman');
  return !!made;
}, [kind, x]);

await fresh();
await spawnKind('officer', 0);
const officer = await ev(() => {
  const sb = window.__sf.sb, o = sb.people[0];
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  return o && { name: o.name, officer: o.officer, vest: !!(o.vest && o.vest.police), holster: o.stowed.holster && o.stowed.holster.kind, mag: o.stowed.holster && o.stowed.holster.mag,
    duty: o.stowed.duty && o.stowed.duty.kind, cop: !!(o.brain && o.brain.cop), hand: o.weapon ? o.weapon.kind : null };
});
check('an Officer spawns in uniform: a police vest on, an M1911 (7 rounds) in the holster, a taser on the duty belt',
  !!officer && officer.officer && officer.vest && officer.holster === 'm1911' && officer.mag === 7 && officer.duty === 'taser' && officer.cop && !officer.hand && /^Officer /.test(officer.name), JSON.stringify(officer));

await fresh();
const arrest = await ev(() => {
  const sb = window.__sf.sb, ui = window.__sf.ui;
  const a = sb.spawnStickman(-3, null, { name: 'Rex', traits: { aggression: 0.9, temper: 0.9, bravery: 0.5, empathy: 0.2 } });
  const v = sb.spawnStickman(-1.5, null, { name: 'Dot', traits: { aggression: 0.1, bravery: 0.3 } });
  ui.setSpawnKind('officer');
  const cop = ui.spawnAt(2, 0.3);
  ui.setSpawnKind('stickman');
  cop.facing = -1;
  a.brain.rel(v).anger = 0.95;
  a.brain.rel(v).like = -0.7;
  let crime = null, commanded = false, cuffedT = null, tased = false, gaveUp = false;
  const said = new Set();
  sb.on('crime', (e) => { if (!crime && e.who === a) crime = e.crime; });
  sb.on('command', (e) => { if (e.who === cop && e.to === a) commanded = true; });
  sb.on('cuffed', (e) => { if (e.who === a && cuffedT === null) cuffedT = sb.time; });
  sb.on('tased', (e) => { if (e.who === a) tased = true; });
  sb.on('speech', (e) => { if (e.who === cop) said.add(e.kind); });
  for (let i = 0; i < 120 * 80; i++) {
    sb.step(1 / 120);
    if (a.brain.behaviour && a.brain.behaviour.kind === 'comply') gaveUp = true;
    // (tased first, they lie there a while before they are sat up)
    if (cuffedT !== null && sb.time - cuffedT > 6 && a.brain.behaviour && a.brain.behaviour.kind === 'detained') break;
    if (cuffedT !== null && sb.time - cuffedT > 16) break;
  }
  return {
    crime: crime && crime.kind, answered: !!crime && crime.done, commanded, cuffed: !!a.cuffed, tased, gaveUp,
    after: a.brain.behaviour ? a.brain.behaviour.kind : a.state, radio: said.has('copRadioCustody'), arrestSaid: said.has('copArrest') || said.has('copCuffing') || said.has('copCuffTased'),
    hands: a.cuffed ? Math.hypot(a.wj.handA.x - a.wj.handB.x, a.wj.handA.y - a.wj.handB.y) : null, open: !!(cop.brain.cop.cases.size),
  };
});
check('an Officer goes after whoever commits a crime: "Police! Stop!", then the taser for anyone who will not give up, and the cuffs',
  !!arrest.crime && arrest.commanded && arrest.cuffed && arrest.answered && (arrest.tased || arrest.gaveUp), JSON.stringify(arrest));
check('...cuffed, they sit there with their hands together behind them, and the officer calls it in',
  arrest.cuffed && (arrest.after === 'detained' || arrest.after === 'down') && arrest.hands !== null && arrest.hands < 0.2 && arrest.radio && !arrest.open, JSON.stringify(arrest));

await fresh();
const heard = await ev(() => {
  const sb = window.__sf.sb, ui = window.__sf.ui;
  const s = sb.spawnStickman(-12, null, { name: 'Gus', traits: { aggression: 0.9 } });
  const v = sb.spawnStickman(-9, null, { name: 'Bo' });
  ui.setSpawnKind('officer');
  const cop = ui.spawnAt(12, 0.3);
  ui.setSpawnKind('stickman');
  cop.facing = 1;
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  s.brain = null;
  // (and Bo in no position to start anything back, which would make it self defence)
  v.brain = null;
  const g = sb.spawnGun(s.pos.x, 0.5);
  g.wear(s);
  s.weapon = g;
  s.facing = 1;
  s.aimAt(v);
  for (let i = 0; i < 90; i++) sb.step(1 / 120);
  const x0 = cop.pos.x;
  const fired = s.fire();
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  const knew = cop.brain.cop.cases.has(s), saw = cop.brain.canSee(s.pos.x, s.pos.y + 1);
  for (let i = 0; i < 120 * 4; i++) sb.step(1 / 120);
  return { fired, knew, saw, moved: x0 - cop.pos.x, doing: cop.brain.doing };
});
check('gunshots carry: an officer who only heard them knows who fired, and heads that way', heard.fired && heard.knew && !heard.saw && heard.moved > 3, JSON.stringify(heard));

/* -------------------------------- the taser -------------------------------- */

await fresh();
const tase = await ev(() => {
  const sb = window.__sf.sb;
  const a = sb.spawnStickman(-1.5, null, { name: 'Zed' });
  const b = sb.spawnStickman(1.5, null, { name: 'Ivy' });
  a.brain = null;
  b.brain = null;
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  const t = sb.spawnTaser(a.pos.x, 0.5);
  t.wear(a);
  a.weapon = t;
  a.facing = 1;
  a.aimAt(b);
  for (let i = 0; i < 90; i++) sb.step(1 / 120);
  let tasedAt = null, endAt = null, ticks = 0, rigid = 0, n = 0, low = 9;
  sb.on('tased', (e) => { if (e.who === b && tasedAt === null) tasedAt = sb.time; });
  sb.on('tasedEnd', (e) => { if (e.who === b) endAt = sb.time; });
  sb.on('taserTick', (e) => { if (e.who === b) ticks++; });
  const fired = a.fire();
  const x0 = b.pos.x;
  for (let i = 0; i < 120 * 8; i++) {
    sb.step(1 / 120);
    if (b.tased) { n++; if (b.rag) rigid++; }
    low = Math.min(low, b.wj.head.y);
  }
  return { fired, tased: tasedAt !== null, ride: tasedAt !== null && endAt !== null ? +(endAt - tasedAt).toFixed(2) : null, ticks, rigid: n ? rigid / n : 0,
    down: low < 0.6, slid: +Math.abs(b.pos.x - x0).toFixed(2), crime: sb.law.crimes.map((c) => c.kind).join(), spent: !t.cart };
});
check('a taser fires two probes on wires: five seconds of current, every muscle locked, and over they go like a plank',
  tase.fired && tase.tased && tase.ride >= 4.6 && tase.ride <= 5.6 && tase.ticks > 20 && tase.rigid > 0.9 && tase.down && tase.spent, JSON.stringify(tase));
check('...and tasing somebody who was doing nothing is a crime', /tasing/.test(tase.crime), tase.crime);

await fresh();
const stun = await ev(() => {
  const sb = window.__sf.sb;
  const a = sb.spawnStickman(0, null, { name: 'Zed' });
  const b = sb.spawnStickman(0.85, null, { name: 'Ivy' });
  a.brain = null;
  b.brain = null;
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  const t = sb.spawnTaser(a.pos.x, 0.5);
  t.wear(a);
  a.weapon = t;
  t.cart = false;
  t.spare = 0;
  a.facing = 1;
  b.facing = -1;
  let stunned = 0;
  sb.on('driveStun', (e) => { if (e.who === b) stunned++; });
  const p0 = b.health.pain;
  const can = a.strikes().includes('taserZap');
  for (let k = 0; k < 3 && !stunned; k++) {
    a.attack('taserZap', b);
    for (let i = 0; i < 90; i++) sb.step(1 / 120);
  }
  return { can, stunned, pain: Math.round(b.health.pain - p0), tased: !!b.tased, standing: b.state === 'stand' || b.state === 'stumble' || b.state === 'stagger' };
});
check('out of cartridges, a taser pressed against somebody is a drive stun: it hurts like anything, but it does not lock them up',
  stun.can && stun.stunned >= 1 && stun.pain >= 25 && !stun.tased, JSON.stringify(stun));

/* --------------------------------- the vest -------------------------------- */

await fresh();
const vest = await ev(() => {
  const sb = window.__sf.sb;
  const a = sb.spawnStickman(-3, null, { name: 'Ash' });
  a.brain = null;
  let stops = 0, holes = 0, worn = 0, alive = 0, hurt = 0, pushed = 0;
  const vests = [];
  // a round into each of four people in vests, square in the chest
  for (let k = 0; k < 4; k++) {
    const b = sb.spawnStickman(1, null, { name: 'Kit' + k, traits: { toughness: 0.6 } });
    b.brain = null;
    for (let i = 0; i < 30; i++) sb.step(1 / 120);
    const v = sb.spawnVest(b.pos.x, 0.2);
    v.wear(b);
    b.vest = v;
    vests.push(v);
    // hands up, so the round finds the body and not an arm hanging in front of it
    a.pos.x = -3;
    a.facing = 1;
    b.facing = -1;
    b.setPosture('handsUp');
    for (let i = 0; i < 40; i++) sb.step(1 / 120);
    let stopped = false;
    const off = (e) => { if (e.who === b) stopped = true; };
    sb.on('vestStop', off);
    const torsoHp = b.health.parts.torso.hp, x0 = b.pos.x;
    // a 9 mm round along a line through the chest
    sb.shoot(a, b.pos.x - 1.2, b.wj.chest.y - 0.06, 0, { energy: 1, target: b });
    for (let i = 0; i < 60; i++) sb.step(1 / 120);
    if (stopped) {
      stops++;
      if (b.alive) alive++;
      if (b.health.parts.torso.hp < torsoHp) hurt++;
      if (b.pos.x - x0 > 0.05 || b.state !== 'stand') pushed++;
    }
    holes += b.wounds.filter((w) => w.hole && (w.bone === 'ribs' || w.bone === 'spine' || w.bone === 'pelvis')).length;
    if (v.wornBy === b) worn++;
    sb.remove(b);
  }
  return { stops, holes, alive, hurt, pushed, worn, worn0: vests.filter((v) => v.hp < 100).length };
});
check('a light vest stops pistol rounds to the body - they still hit like a hammer, and knock them back - and wears down with each one',
  vest.stops >= 3 && vest.holes === 0 && vest.alive === vest.stops && vest.hurt === vest.stops && vest.pushed >= vest.stops - 1 && vest.worn0 >= vest.stops, JSON.stringify(vest));

await fresh();
const vestOn = await ev(() => {
  const sb = window.__sf.sb;
  const p = sb.spawnStickman(0, null, { name: 'Pia', traits: { bravery: 0.2, curiosity: 0.6 } });
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  const v = sb.spawnVest(1.6, 0.1);
  // shots, somewhere: anyone would want it on
  p.brain.gunThreat = { who: null, t: sb.time, x: 30, y: 1 };
  p.brain.emo.bump('fear', 0.4);
  let picked = false;
  for (let i = 0; i < 120 * 20 && p.vest !== v; i++) {
    sb.step(1 / 120);
    if (p.brain.behaviour && p.brain.behaviour.kind === 'vest') picked = true;
  }
  return { picked, on: p.vest === v, worn: v.wornBy === p, inHands: !!p.donning };
});
check('a stickman who sees a vest lying about, with shots going off, goes over and puts it on', vestOn.picked && vestOn.on && vestOn.worn, JSON.stringify(vestOn));

/* -------------------------- holsters and pockets --------------------------- */

await fresh();
const holster = await ev(() => {
  const sb = window.__sf.sb;
  const p = sb.spawnStickman(0, null, { name: 'Hal', traits: { aggression: 0.3, temper: 0.3, bravery: 0.7 } });
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  const g = sb.spawnGun(0, 0.5);
  g.wear(p);
  p.weapon = g;
  p.brain.calmT = sb.time;
  let holstered = false;
  for (let i = 0; i < 120 * 25 && !holstered; i++) { sb.step(1 / 120); holstered = p.stowed.holster === g && !p.weapon; }
  // trouble: somebody coming at them with a knife
  const foe = sb.spawnStickman(5, null, { name: 'Foe', traits: { aggression: 0.95, temper: 0.9, bravery: 0.9 } });
  const k = sb.spawnKnife(5, 0.5, 0);
  k.wear(foe);
  foe.weapon = k;
  foe.brain.rel(p).anger = 1;
  foe.brain.rel(p).like = -0.8;
  foe.facing = -1;
  let drew = false;
  for (let i = 0; i < 120 * 20 && !drew; i++) { sb.step(1 / 120); drew = p.weapon === g; }
  return { holstered, drew };
});
check('with nothing to be armed for, a pistol goes back in its holster...', holster.holstered, JSON.stringify(holster));
check('...and comes back out when somebody comes at them', holster.drew, JSON.stringify(holster));

await fresh();
const pocket = await ev(() => {
  const sb = window.__sf.sb;
  const p = sb.spawnStickman(0, null, { name: 'Ned' });
  p.brain = null;
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  const knife = sb.spawnKnife(0, 0.5, 0);
  knife.wear(p);
  p.weapon = knife;
  p.facing = 1;
  const kn = sb.spawnKnuckles(p.pos.x + 0.5, 0.06);
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  const bent = p.pickUp(kn);
  for (let i = 0; i < 120; i++) sb.step(1 / 120);
  return { bent, pocket: p.stowed.pocket ? p.stowed.pocket.kind : null, hand: p.weapon ? p.weapon.kind : null };
});
check('hands full, something small goes in a pocket', pocket.bent && pocket.pocket === 'knuckles' && pocket.hand === 'knife', JSON.stringify(pocket));

/* ---------------------------- the M1911 and ammo ---------------------------- */

await fresh();
const m1911 = await ev(() => {
  const sb = window.__sf.sb;
  const a = sb.spawnStickman(-2, null, { name: 'Sid' });
  a.brain = null;
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  const g = sb.spawnGun(a.pos.x, 0.5, 0, 'm1911');
  const full = { mag: g.mag, spare: g.spare, energy: g.spec.energy };
  g.wear(a);
  a.weapon = g;
  a.facing = 1;
  a.aimAt({ x: 6, y: 1.2 });
  let heavy = null;
  sb.on('shot', (e) => { if (e.who === a) heavy = !!e.heavy; });
  for (let i = 0; i < 80; i++) sb.step(1 / 120);
  const fired = a.fire();
  return { ...full, fired, heavy, after: g.mag, said: g.describe(a) };
});
check('the M1911 holds seven .45s, two spare magazines, and each one hits harder than a 9 mm',
  m1911.mag === 7 && m1911.spare === 14 && m1911.energy > 1 && m1911.fired && m1911.heavy && m1911.after === 6 && /M1911/.test(m1911.said), JSON.stringify(m1911));

await fresh();
const ammo = await ev(() => {
  const sb = window.__sf.sb, ui = window.__sf.ui;
  const sizes = {};
  for (const [k, x] of [['ammo9', -7], ['ammo45', -5], ['ammo762', -3], ['ammo12', -1]]) {
    ui.setSpawnKind(k);
    const b = ui.spawnAt(x, 0.3);
    sizes[k] = b ? b.rounds : null;
  }
  ui.setSpawnKind('stickman');
  for (const b of [...sb.ammo]) sb.remove(b);
  const p = sb.spawnStickman(3, null, { name: 'Max', traits: { curiosity: 0.5 } });
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  const g = sb.spawnGun(p.pos.x, 0.5, 0, 'm1911');
  g.wear(p);
  p.weapon = g;
  g.mag = 1;
  g.spare = 0;
  p.brain.calmT = sb.time;
  // (a box of 9 mm beside them first: no use to an M1911)
  const wrong = sb.spawnAmmo(5.2, 0.2, 'ammo9');
  const box = sb.spawnAmmo(6.5, 0.2, 'ammo45');
  let went = false;
  for (let i = 0; i < 120 * 45 && box.rounds === 50; i++) {
    sb.step(1 / 120);
    if (p.brain.behaviour && p.brain.behaviour.kind === 'ammo') went = true;
  }
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  return { sizes, went, left: box.rounds, rounds: g.mag + g.spare, wrongLeft: wrong.rounds };
});
check('ammo comes in four kinds: 50 rounds of 9 mm, 50 of .45, 120 of 7.62 and 25 shotgun shells',
  ammo.sizes.ammo9 === 50 && ammo.sizes.ammo45 === 50 && ammo.sizes.ammo762 === 120 && ammo.sizes.ammo12 === 25, JSON.stringify(ammo.sizes));
check('...and anyone with a gun running low fills up from a box of the right rounds, and leaves the wrong ones alone',
  ammo.went && ammo.rounds === 21 && ammo.left === 30 && ammo.wrongLeft === 50, JSON.stringify(ammo));

/* ------------------------- stamina, knockback, stumbling ------------------------- */

await fresh();
const breath = await ev(() => {
  const sb = window.__sf.sb;
  const p = sb.spawnStickman(-15, null, { name: 'Ola' });
  p.brain = null;
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  // laps, end to end, at a run
  let fast = 0, slow = 0, to = 17;
  for (let i = 0; i < 120 * 13; i++) {
    if (p.pos.x > 15) to = -17;
    if (p.pos.x < -15) to = 17;
    p.goTo(to, 'run');
    sb.step(1 / 120);
    if (i === 120) fast = Math.abs(p.vel.x);
  }
  slow = p.maxSpeed('run');
  fast = Math.max(fast, 0.01);
  const spent = p.stamina;
  p.stop();
  for (let i = 0; i < 120 * 10; i++) sb.step(1 / 120);
  return { fast: +fast.toFixed(2), slow: +slow.toFixed(2), spent: +spent.toFixed(2), back: +p.stamina.toFixed(2) };
});
check('running uses up stamina - out of breath, they slow down - and standing still gets it back',
  breath.spent < 0.25 && breath.slow < breath.fast * 0.85 && breath.back > 0.75, JSON.stringify(breath));

await fresh();
const puffed = await ev(() => {
  const sb = window.__sf.sb;
  const p = sb.spawnStickman(0, null, { name: 'Uma' });
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  p.stamina = 0.04;
  let bent = false, kind = null;
  for (let i = 0; i < 120 * 4; i++) {
    sb.step(1 / 120);
    if (p.brain.behaviour && p.brain.behaviour.kind === 'catchBreath') kind = 'catchBreath';
    if (p.posture === 'handsOnKnees') bent = true;
  }
  return { kind, bent };
});
check('spent, they stop and catch their breath, hands on their knees', puffed.kind === 'catchBreath' && puffed.bent, JSON.stringify(puffed));

await fresh();
const shove = await ev(() => {
  const sb = window.__sf.sb;
  const a = sb.spawnStickman(0, null, { name: 'Bram', scale: 1, strength: 1 });
  const b = sb.spawnStickman(0.85, null, { name: 'Cleo', scale: 1, traits: { toughness: 0.5 } });
  a.brain = null;
  b.brain = null;
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  a.facing = 1;
  b.facing = -1;
  a.pos.x = 0;
  b.pos.x = 0.85;
  const x0 = b.pos.x;
  let landed = false;
  sb.on('hit', (e) => { if (e.who === b && !e.blocked) landed = true; });
  a.attack('jab', b);
  for (let i = 0; i < 90; i++) sb.step(1 / 120);
  return { landed, back: +(b.pos.x - x0).toFixed(3), state: b.state };
});
check('a blow knocks them back the way it was going', shove.landed && shove.back > 0.05, JSON.stringify(shove));

await fresh();
const stumbles = await ev(() => {
  const sb = window.__sf.sb;
  const out = { stumbled: 0, steps: 0, caught: 0, fell: 0 };
  let st = null;
  sb.on('stumbleStep', () => out.steps++);
  sb.on('stumbleCaught', () => { st = 'caught'; });
  sb.on('stumbleFall', () => { st = 'fell'; });
  for (let k = 0; k < 16; k++) {
    sb.clear();
    const p = sb.spawnStickman(0, null, { name: 'Lee' + k, traits: { toughness: 0.5 } });
    p.brain = null;
    for (let i = 0; i < 30; i++) sb.step(1 / 120);
    p.facing = 1;
    st = null;
    // a cross to the body, or an uppercut that rocks the head back
    const up = k % 2 === 1;
    p.takeHit({ by: null, part: up ? 'head' : 'torso', x: p.wj.chest.x, y: up ? p.wj.head.y : p.wj.chest.y, dir: -1, power: up ? 1.8 : 1.25, kind: up ? 'uppercut' : 'cross', armed: false, bone: up ? 'skull' : 'ribs' });
    if (p.state === 'stumble') out.stumbled++;
    // (time enough for the longest stumble to end, one way or the other)
    for (let i = 0; i < 120 * 4; i++) sb.step(1 / 120);
    if (st === 'caught') out.caught++;
    if (st === 'fell') out.fell++;
  }
  return out;
});
check('a hard blow sends them stumbling - free steps, worked out as they go - and they catch themselves or go down',
  stumbles.stumbled >= 12 && stumbles.steps >= stumbles.stumbled && stumbles.caught >= 4 && stumbles.fell >= 1 && stumbles.caught + stumbles.fell >= stumbles.stumbled - 1, JSON.stringify(stumbles));

/* ------------------------------ in the inspector ------------------------------ */

await fresh();
await ev(() => {
  const sb = window.__sf.sb, ui = window.__sf.ui;
  ui.setSpawnKind('officer');
  window.__o = ui.spawnAt(-1, 0.3);
  ui.setSpawnKind('stickman');
  window.__c = sb.spawnStickman(1, null, { name: 'Cal' });
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  window.__c.cuff(window.__o);
  ui.select(window.__o);
});
await page.waitForTimeout(300);
const insCop = await ev(() => ({
  chips: [...document.querySelectorAll('#ins-traits .chip')].map((c) => c.textContent),
  meters: [...document.querySelectorAll('#ins-vitals .meter span')].map((s) => s.textContent),
  conds: [...document.querySelectorAll('#ins-conds div')].map((d) => d.textContent),
}));
check('the inspector shows an officer as one, their stamina, their vest and what is in the holster and on the belt',
  insCop.chips.includes('Police officer') && insCop.meters.includes('Stamina') && insCop.conds.some((c) => /police vest/.test(c)) &&
  insCop.conds.some((c) => /^In the holster: an M1911/.test(c)) && insCop.conds.some((c) => /^On the duty belt: a taser/.test(c)), JSON.stringify(insCop));
await ev(() => window.__sf.ui.select(window.__c));
await page.waitForTimeout(300);
const cuffBtn = await ev(() => {
  const b = document.querySelector('#ins-uncuff');
  const r = b.getBoundingClientRect();
  return { shown: !b.classList.contains('hidden'), x: r.left + r.width / 2, y: r.top + r.height / 2, cond: [...document.querySelectorAll('#ins-conds div')].map((d) => d.textContent)[0] };
});
if (cuffBtn.shown) await tapAt(cuffBtn.x, cuffBtn.y);
await page.waitForTimeout(250);
const uncuffed = await ev(() => !window.__c.cuffed && document.querySelector('#ins-uncuff').classList.contains('hidden'));
check('somebody in handcuffs says so, and an Uncuff button lets them go', cuffBtn.shown && /handcuffs/.test(cuffBtn.cond) && uncuffed, JSON.stringify(cuffBtn));

// a pistol in the hand: PUT AWAY puts it in the holster, GET IT OUT brings it back
const kitAt = await ev(() => {
  const sb = window.__sf.sb, c = window.__c;
  const g = sb.spawnGun(c.pos.x, 0.5);
  g.wear(c);
  c.weapon = g;
  // (just picked up: not about to put it straight away by themselves)
  c.brain.calmT = sb.time;
  window.__g6 = g;
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  window.__sf.ui.updateInspector();
  const b = document.querySelector('#ins-kit');
  const r = b.getBoundingClientRect();
  return { shown: !b.classList.contains('hidden'), label: b.textContent, x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
if (kitAt.shown) await tapAt(kitAt.x, kitAt.y);
await sim(1);
const away = await ev(() => {
  window.__sf.ui.updateInspector();
  const b = document.querySelector('#ins-kit');
  return { holstered: window.__c.stowed.holster === window.__g6 && !window.__c.weapon, label: b.textContent };
});
if (away.holstered) await tapAt(kitAt.x, kitAt.y);
await sim(1);
const back = await ev(() => window.__c.weapon === window.__g6);
check('the inspector can have them put a pistol away in its holster, and get it out again',
  kitAt.shown && kitAt.label === 'Put away' && away.holstered && away.label === 'Get it out' && back, JSON.stringify({ kitAt, away, back }));
await ev(() => window.__sf.ui.select(null));
await shot('officer');

/* ---------------------------- fire, ice and air ---------------------------- */

// what was said, put out and frozen, from here on
await ev(() => {
  const sb = window.__sf.sb;
  window.__vit = { said: [], out: [], gasps: 0, ice: [] };
  sb.on('speech', (e) => window.__vit.said.push(e.kind + '|' + e.who.name));
  sb.on('extinguish', (e) => window.__vit.out.push(e.how + '|' + e.who.name));
  sb.on('gasp', () => { window.__vit.gasps++; });
  for (const k of ['freeze', 'thaw', 'iceSnap', 'shatter']) sb.on(k, (e) => window.__vit.ice.push(k + '|' + e.who.name));
});
/** Types into the temperature box of whoever is selected, the way a person would, and presses Enter. */
const typeTemp = async (text) => {
  await page.fill('.temp-input', text);
  await page.press('.temp-input', 'Enter');
  await page.waitForTimeout(120);
  return ev(() => ({ t: window.__sf.ui.selected.health.temp, shown: document.querySelector('.temp-input').value, toast: document.querySelector('#toast').textContent }));
};
/** How many pixels near somebody are the colour asked for (in the picture as drawn). */
const pixelsNear = (who, kind) => ev(([w, k]) => {
  const sf = window.__sf, p = window[w], c = document.getElementById('view'), g = c.getContext('2d');
  sf.renderer.draw(sf.ui.drawState());
  const q = sf.cam.toScreen(p.wj.chest.x, p.wj.chest.y), dpr = sf.cam.dpr;
  const x0 = Math.round((q.x - 70) * dpr), y0 = Math.round((q.y - 90) * dpr), W = Math.round(140 * dpr), H = Math.round(180 * dpr);
  const d = g.getImageData(Math.max(0, x0), Math.max(0, y0), W, H).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    if (k === 'flame' && r > 220 && gg > 90 && gg < 235 && b < 120) n++;
    if (k === 'ice' && b > 175 && b - r > 25 && gg > 150) n++;
    if (k === 'blood' && r > 120 && gg < 45 && b < 55) n++;
  }
  return n;
}, [who, kind]);

await fresh();
await ev(() => {
  const sb = window.__sf.sb;
  window.__v1 = sb.spawnStickman(-2, null, { name: 'Vic' });
  window.__v2 = sb.spawnStickman(5, null, { name: 'Wen' });
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  window.__sf.ui.select(window.__v1);
});
await page.waitForTimeout(300);
const vit0 = await ev(() => ({
  labels: [...document.querySelectorAll('#ins-vitals .meter span')].map((s) => s.textContent),
  values: [...document.querySelectorAll('#ins-vitals .meter b')].map((s) => s.textContent),
  input: document.querySelector('.temp-input').value,
}));
check('the inspector has a Conscious, an Adrenaline, an Oxygen and a Temperature meter, each with its number',
  ['Conscious', 'Adrenaline', 'Oxygen', 'Temp'].every((l) => vit0.labels.includes(l)) && vit0.values[0] === '100%' && vit0.input === '37.0 °C', JSON.stringify(vit0));
const typed40 = await typeTemp('40');
const typedF = await typeTemp('104F');
const typedK = await typeTemp('300 K');
const typedBad = await typeTemp('banana');
check('a temperature typed into the inspector sets theirs, in degrees C, F or K',
  Math.abs(typed40.t - 40) < 0.01 && typed40.shown === '40.0 °C' && /104 °F/.test(typed40.toast) && Math.abs(typedF.t - 40) < 0.01 && Math.abs(typedK.t - 26.85) < 0.01,
  JSON.stringify({ typed40, typedF, typedK }));
check('...and anything that is not a temperature is turned away, leaving theirs as it was', Math.abs(typedBad.t - 26.85) < 0.01 && /Type a temperature/.test(typedBad.toast), JSON.stringify(typedBad));
await typeTemp('41');
await ev(() => document.querySelector('.meter.temp .lock-btn').click());
await sim(10);
const heldT = await ev(() => ({ t: window.__v1.health.temp, locked: document.querySelector('.meter.temp').classList.contains('locked') }));
await ev(() => document.querySelector('.meter.temp .lock-btn').click());
await sim(20);
const freeT = await ev(() => window.__v1.health.temp);
check('the padlock holds a temperature exactly where it is; let go, the body sweats it back down toward 37',
  heldT.locked && Math.abs(heldT.t - 41) < 0.01 && freeT < 39.5 && freeT > 36.5, JSON.stringify({ heldT, freeT }));

// adrenaline: up with fright, and wearing off
const adr = await ev(() => {
  const sb = window.__sf.sb, v = window.__v1;
  const before = v.health.adrenaline;
  v.brain.setEmotion('fear', 0.95);
  for (let i = 0; i < 240; i++) sb.step(1 / 120);
  const up = v.health.adrenaline, painK = v.health.numbed;
  v.brain.setEmotion('fear', 0);
  v.brain.emo.lock('fear', true);
  for (let i = 0; i < 120 * 30; i++) sb.step(1 / 120);
  v.brain.emo.lock('fear', false);
  return { before, up, painK, later: v.health.adrenaline, speed: v.maxSpeed('run') };
});
check('a fright sends the adrenaline up within seconds (numbing the pain), and it wears off over half a minute',
  adr.before < 0.2 && adr.up > 0.6 && adr.painK < 0.8 && adr.later < adr.up - 0.4, JSON.stringify(adr));

// held up by the head: no air
const choke = await ev(() => {
  const sb = window.__sf.sb, v = window.__v2;
  v.brain.thinkT = 99;
  const hx = v.wj.head.x, hy = v.wj.head.y;
  v.grab(hx, hy);
  const part = v.held.part;
  let out = null, said = 0;
  for (let i = 0; i < 120 * 16; i++) {
    v.holdAt(hx, hy + 0.6);
    sb.step(1 / 120);
    if (out === null && !v.conscious) out = +sb.time.toFixed(1);
  }
  said = window.__vit.said.filter((s) => s === 'choking|Wen').length;
  const low = v.health.oxygen, doing = v.brain.doing;
  v.release();
  for (let i = 0; i < 120 * 12; i++) sb.step(1 / 120);
  return { part, out, said, low, doing, after: v.health.oxygen, alive: v.alive, awake: v.conscious, gasps: window.__vit.gasps };
});
check('held up by the head, they cannot breathe: they choke, the oxygen goes, and before long they pass out',
  choke.part === 'head' && choke.said >= 1 && choke.low < 0.5 && choke.out !== null, JSON.stringify(choke));
check('...let go in time, the air comes back and they come round', choke.alive && choke.after > 0.9 && choke.awake, JSON.stringify(choke));

// the heat, and the cold
const weather = await ev(() => {
  const sb = window.__sf.sb, V = window.__sf.vitals;
  const a = sb.spawnStickman(-8, null, { name: 'Hal' }), b = sb.spawnStickman(-10, null, { name: 'Ike' }), c = sb.spawnStickman(10, null, { name: 'Jan' }), d = sb.spawnStickman(12, null, { name: 'Kai' });
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  const run = d.maxSpeed('run');
  V.setTemperature(a, 44);
  V.setTemperature(b, 52);
  V.setTemperature(c, 33);
  V.setTemperature(d, 26);
  for (let i = 0; i < 120; i++) sb.step(1 / 120);
  const early = { a: a.conscious, b: b.conscious, c: c.conscious, d: d.conscious, cold: c.maxSpeed('run') / run, conds: c.health.conditions() };
  for (let i = 0; i < 120 * 30; i++) sb.step(1 / 120);
  const r = { early, a: [a.alive, a.conscious, +a.health.temp.toFixed(1)], b: [b.alive, b.health.cause], d: [d.alive, +d.health.temp.toFixed(1)] };
  for (const p of [a, b, c, d]) sb.remove(p, { quiet: true });
  return r;
});
check('too hot: past 43 or so they pass out, and at 44 they come round as it comes down; at 52 the heatstroke kills them',
  !weather.early.a && weather.a[0] && weather.a[1] && !weather.early.b && !weather.b[0] && weather.b[1] === 'heatstroke', JSON.stringify(weather));
check('too cold: shivering at 33 (and slower on their feet), out cold below 28', weather.early.c && weather.early.cold < 0.95 && weather.early.conds.includes('Cold') && !weather.early.d,
  JSON.stringify(weather.early));

/* fire */
await fresh();
await ev(() => {
  const sb = window.__sf.sb;
  window.__f1 = sb.spawnStickman(-1, null, { name: 'Fay', traits: { skill: 0.1, bravery: 0.2, curiosity: 0.2 } });
  window.__f2 = sb.spawnStickman(2.5, null, { name: 'Gus', traits: { empathy: 0.9, bravery: 0.8, sociability: 0.6 } });
  window.__f3 = sb.spawnStickman(-6, null, { name: 'Hob', traits: { empathy: 0.2, bravery: 0.1 } });
  for (let i = 0; i < 120; i++) sb.step(1 / 120);
  window.__sf.ui.select(window.__f1);
});
await page.waitForTimeout(250);
const lit = await typeTemp('100');
await ev(() => { window.__f1.brain.rollKnows = false; });
await sim(0.5);
await page.waitForTimeout(200);
const fireNow = await ev(() => ({
  fire: !!window.__f1.flames, power: window.__f1.flames ? +window.__f1.flames.power.toFixed(2) : 0, awake: window.__f1.conscious,
  doing: window.__f1.brain.doing, conds: [...document.querySelectorAll('#ins-conds div')].map((d) => d.textContent), mood: document.querySelector('#ins-mood').textContent,
  said: window.__vit.said.filter((s) => s === 'onFire|Fay').length,
}));
const flamePx = await pixelsNear('__f1', 'flame');
check('typed 100 °C, they burst into flames - and, awake, scream about it', fireNow.fire && fireNow.awake && fireNow.said >= 1 && /100 °C/.test(lit.toast), JSON.stringify(fireNow));
check('...the inspector says they are on fire, and the flames are drawn on them', fireNow.conds[0] === 'On fire' && /On fire/.test(fireNow.doing) && flamePx > 40, `${flamePx} flame pixels, ${fireNow.conds.join(', ')}`);
await shot('fire');
await sim(3);
const crowd = await ev(() => ({
  gus: window.__f2.brain.behaviour && window.__f2.brain.behaviour.kind, hob: window.__f3.brain.behaviour && window.__f3.brain.behaviour.kind,
  said: window.__vit.said.filter((s) => /^(sawOnFire|rollAdvice)\|/.test(s)), fay: window.__f1.brain.behaviour && window.__f1.brain.behaviour.kind,
}));
check('the people around see it: they shout, run in to beat it out, or keep well clear',
  crowd.said.length >= 1 && (crowd.said.some((x) => x.startsWith('rollAdvice')) || ['douse', 'flee'].includes(crowd.gus) || crowd.hob === 'flee'), JSON.stringify(crowd));
const rolled = await ev(() => {
  const sb = window.__sf.sb, f = window.__f1;
  if (!f.flames) return { already: true };
  const ok = f.dropAndRoll(3.5);
  let outT = null;
  for (let i = 0; i < 120 * 6; i++) { sb.step(1 / 120); if (outT === null && !f.flames) outT = +(i / 120).toFixed(2); }
  return { ok, outT, out: window.__vit.out.slice(), alive: f.alive, burns: f.health.conditions().filter((c) => /Burns/.test(c)) };
});
check('stop, drop and roll: rolling on the floor puts the fire out in a few seconds, and leaves them burned but alive',
  rolled.ok && rolled.outT !== null && rolled.outT < 4 && rolled.out.some((o) => /^(rolled|smothered)\|Fay/.test(o)) && rolled.alive && rolled.burns.length >= 1, JSON.stringify(rolled));
const cooled = await ev(() => {
  const sb = window.__sf.sb, V = window.__sf.vitals, g = window.__f2;
  V.ignite(g, { power: 0.6 });
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  const was = !!g.flames;
  V.setTemperature(g, 20);
  sb.step(1 / 120);
  return { was, now: !!g.flames, how: window.__vit.out.filter((o) => /\|Gus$/.test(o)) };
});
check('a burning body cooled (a temperature under 36 typed in) goes out with a hiss', cooled.was && !cooled.now && cooled.how.includes('cooled|Gus'), JSON.stringify(cooled));
const spread = await ev(() => {
  const sb = window.__sf.sb, V = window.__sf.vitals;
  const a = sb.spawnStickman(8, null, { name: 'Lou' }), b = sb.spawnStickman(8.25, null, { name: 'Max' });
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  b.knockOut(0, 0.2);
  a.knockOut(0, 0.2);
  for (let i = 0; i < 120; i++) sb.step(1 / 120);
  a.health.tempLock = 120;
  V.setTemperature(a, 120);
  let caught = null;
  for (let i = 0; i < 120 * 8 && caught === null; i++) { sb.step(1 / 120); if (b.flames) caught = +(i / 120).toFixed(2); }
  a.health.tempLock = null;
  return { caught, d: +Math.abs(a.wj.chest.x - b.wj.chest.x).toFixed(2) };
});
check('fire spreads to anybody it touches', spread.caught !== null, JSON.stringify(spread));
const burnedOut = await ev(() => {
  const sb = window.__sf.sb, V = window.__sf.vitals;
  // nobody about to beat it out, and no mind of their own to roll it out with: just a body, burning
  for (const q of [...sb.people]) sb.remove(q, { quiet: true });
  const a = sb.spawnStickman(-12, null, { name: 'Ned' });
  a.brain = null;
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  V.setTemperature(a, 300);
  let deadT = null;
  for (let i = 0; i < 120 * 30; i++) { sb.step(1 / 120); if (deadT === null && a.dead) deadT = +(i / 120).toFixed(1); }
  return { deadT, cause: a.health.cause, char: +a.char.toFixed(2), fire: !!a.flames, conds: [...V.vitalConditions(a), ...a.health.conditions()] };
});
check('nobody puts it out and it is not rolled out: they burn to death in a quarter of a minute or so, charred black',
  burnedOut.deadT !== null && burnedOut.deadT < 25 && burnedOut.cause === 'burns' && burnedOut.char > 0.4 && burnedOut.conds.includes('Charred'), JSON.stringify(burnedOut));

/* ice */
await fresh();
await ev(() => {
  const sb = window.__sf.sb;
  window.__i1 = sb.spawnStickman(-1, null, { name: 'Ida' });
  window.__i2 = sb.spawnStickman(3, null, { name: 'Jo' });
  for (const p of [window.__i1, window.__i2]) { p.brain.thinkT = 99; p.brain.clearBehaviour(); p.stop(); }
  for (let i = 0; i < 120; i++) sb.step(1 / 120);
  window.__sf.ui.select(window.__i1);
});
await page.waitForTimeout(250);
await typeTemp('-10');
await sim(3);
await page.waitForTimeout(200);
const iced = await ev(() => {
  const p = window.__i1;
  return {
    frozen: p.health.frozen, locked: !!p.rag && p.rag.locked, awake: p.conscious, headY: +p.wj.head.y.toFixed(2), mood: document.querySelector('#ins-mood').textContent,
    conds: [...document.querySelectorAll('#ins-conds div')].map((d) => d.textContent), conscious: document.querySelectorAll('#ins-vitals .meter b')[0].textContent,
  };
});
const icePx = await pixelsNear('__i1', 'ice');
check('typed -10 °C, they freeze solid: stiff as a statue, still standing, nobody home', iced.frozen && iced.locked && !iced.awake && iced.headY > 1.2 && iced.conscious === '0%', JSON.stringify(iced));
check('...the inspector says so, and they are drawn in a shell of ice', iced.mood === 'Frozen solid' && iced.conds[0] === 'Frozen solid' && icePx > 150, `${icePx} ice pixels, ${iced.conds.join(', ')}`);
await shot('frozen');
await typeTemp('37');
await sim(1.5);
const thawed = await ev(() => ({ frozen: window.__i1.health.frozen, ice: window.__vit.ice.filter((e) => /Ida$/.test(e)) }));
await sim(12);
const woke = await ev(() => ({ awake: window.__i1.conscious, alive: window.__i1.alive, frost: window.__i1.health.conditions().filter((c) => /Frostbite/.test(c)) }));
check('warmed up again in time, the ice melts off them and they come round, with frostbite', !thawed.frozen && thawed.ice.includes('thaw|Ida') && woke.awake && woke.alive && woke.frost.length >= 1,
  JSON.stringify({ thawed, woke }));
const frozeDead = await ev(() => {
  const sb = window.__sf.sb, V = window.__sf.vitals, p = window.__i2;
  V.setTemperature(p, -10);
  let deadT = null;
  for (let i = 0; i < 120 * 25 && deadT === null; i++) { sb.step(1 / 120); if (p.dead) deadT = +(i / 120).toFixed(1); }
  return { deadT, cause: p.health.cause, frozen: p.health.frozen };
});
check('left frozen solid, the cold kills them in a quarter of a minute or so', frozeDead.deadT !== null && frozeDead.deadT < 20 && frozeDead.cause === 'frozen solid' && frozeDead.frozen, JSON.stringify(frozeDead));
const snapped = await ev(() => {
  const sb = window.__sf.sb, V = window.__sf.vitals;
  const p = sb.spawnStickman(7, null, { name: 'Kit' }), q = sb.spawnStickman(8.2, null, { name: 'Lu' });
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  V.setTemperature(p, -15);
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  const e = p.wj.midForeA;
  let tries = 0;
  while (!p.cut.armA && tries++ < 4) { p.takeHit({ by: q, part: 'armA', x: e.x, y: e.y, dir: 1, power: 2.6, kind: 'kick', bone: 'forearmA' }); sb.step(1 / 120); }
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  return { cut: Object.keys(p.cut), iced: sb.limbs.filter((l) => l.iced).length, snaps: window.__vit.ice.filter((x) => x === 'iceSnap|Kit').length, tries };
});
check('a hard kick to a frozen arm snaps it clean off, like an icicle', snapped.cut.includes('armA') && snapped.iced >= 1 && snapped.snaps >= 1, JSON.stringify(snapped));
const shattered = await ev(() => {
  const sb = window.__sf.sb, V = window.__sf.vitals;
  const p = sb.spawnStickman(-9, null, { name: 'Mo' });
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  V.setTemperature(p, -20);
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  const hx = p.wj.head.x;
  p.grab(hx, p.wj.head.y);
  for (let i = 0; i < 120; i++) { p.holdAt(hx, Math.min(6.5, p.wj.head.y + 0.08)); sb.step(1 / 120); }
  p.release();
  for (let i = 0; i < 120 * 3; i++) sb.step(1 / 120);
  return { dead: p.dead, cause: p.health.cause, cut: Object.keys(p.cut).length, shattered: window.__vit.ice.includes('shatter|Mo') };
});
check('dropped from high up while frozen, the whole body shatters', shattered.dead && shattered.cause === 'shattered' && shattered.cut === 4 && shattered.shattered, JSON.stringify(shattered));
const healedIce = await ev(() => {
  const sb = window.__sf.sb, V = window.__sf.vitals;
  const p = sb.spawnStickman(12, null, { name: 'Ola' });
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  V.setTemperature(p, -5);
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  const was = p.health.frozen;
  p.heal();
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  return { was, frozen: p.health.frozen, t: +p.health.temp.toFixed(1), locked: !!p.rag && p.rag.locked };
});
check('Heal thaws them out, and sets their temperature right', healedIce.was && !healedIce.frozen && Math.abs(healedIce.t - 37) < 0.5 && !healedIce.locked, JSON.stringify(healedIce));
await ev(() => window.__sf.ui.select(null));

/* ----------------------------------- blood ----------------------------------- */

// every drop, squirt and drip that starts from here on, where it starts, and whose it is
await ev(() => {
  const fx = window.__sf.sb.fx;
  window.__bl = [];
  // (where each takes what it came out of)
  for (const [k, at] of [['drop', 5], ['drip', 2], ['gush', 6], ['blood', 6]]) {
    const f = fx[k];
    fx[k] = function (...a) { window.__bl.push({ k, x: a[0], y: a[1], who: a[at] && a[at].name, t: this.sb.time }); return f.apply(this, a); };
  }
});

await fresh();
const slam = await ev(() => {
  const sb = window.__sf.sb;
  const p = sb.spawnStickman(0, null, { name: 'Sal' });
  p.brain = null;
  for (let i = 0; i < 36; i++) sb.step(1 / 120);
  p.goLimp({ state: 'thrown', tone: 0 });
  // turned upside down, the top of the head a step off the floor, coming down at 14 m/s
  const r = p.rag, hip = r.p[r.byName.hip], cx = hip.x, cy = hip.y;
  for (const q of r.p) { q.x = 2 * cx - q.x; q.y = 2 * cy - q.y; }
  let low = Infinity;
  for (const q of r.p) low = Math.min(low, q.y - q.r);
  for (const q of r.p) { q.y += 14 / 120 - 0.001 - low; q.px = q.x; q.py = q.y + 14 / 120; }
  window.__bl = [];
  let at = null;
  for (let i = 0; i < 6 && !at; i++) {
    sb.step(1 / 120);
    if (window.__bl.some((e) => e.k === 'drop')) at = { head: { ...p.wj.head }, hip: { ...p.wj.hip } };
  }
  if (!at) return { bled: false };
  const from = window.__bl.filter((e) => e.k === 'drop' || e.k === 'gush');
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  return {
    bled: true, n: from.length,
    fromHead: +Math.max(...from.map((e) => Math.hypot(e.x - at.head.x, e.y - at.head.y))).toFixed(2),
    fromHip: +Math.min(...from.map((e) => Math.hypot(e.x - at.hip.x, e.y - at.hip.y))).toFixed(2),
    wound: p.headMarks.some((m) => !m.stain && !m.burn), floor: sb.fx.splats.some((s) => Math.abs(s.x - at.head.x) < 0.4),
  };
});
check('a head driven into the floor bleeds from the head, out across the floor round it - not from somewhere in the middle of them',
  slam.bled && slam.n >= 6 && slam.fromHead < 0.3 && slam.fromHip > 0.6 && slam.floor, JSON.stringify(slam));
check('...and it leaves a wound on the head, where it hit', slam.wound, JSON.stringify(slam));

await fresh();
const slam2 = await ev(() => {
  const sb = window.__sf.sb;
  sb.settings.ragdoll = false;
  const p = sb.spawnStickman(0, null, { name: 'Ty' });
  p.brain = null;
  for (let i = 0; i < 36; i++) sb.step(1 / 120);
  // held upside down by an ankle, up high - and brought down hard
  const f = p.wj.footA, x = f.x;
  p.grab(x, f.y);
  let y = f.y;
  for (let i = 0; i < 120; i++) { y = Math.min(2.4, y + 0.04); p.holdAt(x, y); sb.step(1 / 120); }
  window.__bl = [];
  let at = null;
  for (let i = 0; i < 60 && !at; i++) {
    y = Math.max(0.05, y - 14 / 120);
    p.holdAt(x, y);
    sb.step(1 / 120);
    if (window.__bl.some((e) => e.k === 'drop')) at = { head: { ...p.wj.head }, hip: { ...p.wj.hip } };
  }
  p.release();
  sb.settings.ragdoll = true;
  if (!at) return { bled: false, state: p.state };
  const from = window.__bl.filter((e) => e.k === 'drop' || e.k === 'gush');
  return {
    bled: true, n: from.length,
    fromHead: +Math.max(...from.map((e) => Math.hypot(e.x - at.head.x, e.y - at.head.y))).toFixed(2),
    fromHip: +Math.min(...from.map((e) => Math.hypot(e.x - at.hip.x, e.y - at.hip.y))).toFixed(2),
  };
});
check('...the same with ragdolls off: held upside down by the ankle and slammed down, it is the head that bleeds',
  slam2.bled && slam2.fromHead < 0.3 && slam2.fromHip > 0.6, JSON.stringify(slam2));

await fresh();
const drips = await ev(() => {
  const sb = window.__sf.sb;
  // how far (x, y) is from the segment a-b
  const dist = (x, y, a, b) => {
    const vx = b.x - a.x, vy = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / (vx * vx + vy * vy || 1e-9)));
    return Math.hypot(x - a.x - vx * t, y - a.y - vy * t);
  };
  const p = sb.spawnStickman(0, null, { name: 'Uma' });
  p.brain = null;
  for (let i = 0; i < 36; i++) sb.step(1 / 120);
  // a cut across the right thigh (and nothing to knock them off their feet)
  const m = p.wj.midFemA;
  p.health.hit('legA', 7, { sharp: 1, bone: 'femurA' });
  p.markAt(m.x, m.y, 0.8);
  window.__bl = [];
  let n = 0, worst = 0;
  for (let i = 0; i < 120 * 4; i++) {
    const before = window.__bl.length;
    sb.step(1 / 120);
    for (const e of window.__bl.slice(before)) {
      if (e.k !== 'drip' || e.who !== 'Uma') continue;
      n++;
      worst = Math.max(worst, Math.min(dist(e.x, e.y, p.wj.hip, p.wj.midFemA), dist(e.x, e.y, p.wj.midFemA, p.wj.kneeA)));
    }
  }
  return { n, worst: +worst.toFixed(3), leg: +p.health.parts.legA.bleed.toFixed(4), head: +p.health.parts.head.bleed.toFixed(4) };
});
check('blood drips from the wound that is bleeding and from nowhere else: a cut on the thigh drips off the thigh', drips.n >= 5 && drips.worst < 0.08 && drips.head === 0, JSON.stringify(drips));

await fresh();
const stump = await ev(() => {
  const sb = window.__sf.sb, fx = sb.fx;
  const p = window.__stp = sb.spawnStickman(0, null, { name: 'Viv' });
  p.brain = null;
  for (let i = 0; i < 36; i++) sb.step(1 / 120);
  p.sever('humerusA', 1, 1);
  const key = p.id + ':stumparmA', arm = sb.limbs[0];
  const flows = [];
  let off = 0, linked = 0, limb = false;
  for (let i = 0; i < 120 * 3; i++) {
    sb.step(1 / 120);
    const s = fx.streams.find((q) => q.key === key);
    if (s) {
      flows.push(s.flow);
      const e = p.wj[p.cut.armA];
      off = Math.max(off, Math.hypot(s.x - e.x, s.y - e.y));
    }
    linked = Math.max(linked, fx.drops.filter((d) => d.link && !d.link.gone && d.from === p).length);
    if (i === 12) limb = fx.streams.some((q) => q.key === 'limb' + arm.id);
  }
  return {
    stream: flows.length, off: +off.toFixed(3), linked, beats: flows.filter((f, i) => i && f > 0.75 && flows[i - 1] <= 0.75).length,
    min: +Math.min(...flows).toFixed(2), max: +Math.max(...flows).toFixed(2), limb, limbLater: fx.streams.some((q) => q.key === 'limb' + arm.id),
  };
});
check('a stump spurts a stream of blood straight out of the end of it, that never quite stops while the heart beats and surges with every beat',
  stump.stream >= 340 && stump.off < 0.08 && stump.linked >= 10 && stump.beats >= 3 && stump.min > 0.2 && stump.max > 0.9, JSON.stringify(stump));
check('...and the arm that came off pours out of its cut end, for a moment', stump.limb && !stump.limbLater, JSON.stringify(stump));
await ev(() => { const c = window.__sf.cam, p = window.__stp; c.follow = null; c.glide = null; c.ppm = c.homePpm * 2.4; c.x = p.wj.chest.x + 0.3; c.y = p.wj.chest.y; c.clamp(); });
// the picture round the stump with the blood in the air in it, and without
const streamPx = await ev(() => {
  const sf = window.__sf, fx = sf.sb.fx, p = window.__stp, c = document.getElementById('view'), g = c.getContext('2d');
  const count = () => {
    sf.renderer.draw(sf.ui.drawState());
    const q = sf.cam.toScreen(p.wj.chest.x, p.wj.chest.y), dpr = sf.cam.dpr;
    const d = g.getImageData(Math.round((q.x - 90) * dpr), Math.round((q.y - 60) * dpr), Math.round(180 * dpr), Math.round(200 * dpr)).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 120 && d[i + 1] < 45 && d[i + 2] < 55) n++;
    return n;
  };
  const all = count(), drops = fx.drops;
  fx.drops = [];
  const none = count();
  fx.drops = drops;
  return { all, none, stream: all - none, linked: drops.filter((d) => d.link && !d.link.gone && d.from === p).length };
});
check('...drawn as a stream: one unbroken arc of blood, not a scatter of drops', streamPx.stream > 120 && streamPx.linked >= 8, JSON.stringify(streamPx));
await shot('stream');

const dry = await ev(() => {
  const sb = window.__sf.sb, fx = sb.fx, p = window.__stp, ui = window.__sf.ui;
  // (most of it gone already, to save waiting for it)
  p.health.blood = 0.45;
  for (const l of [...sb.limbs]) sb.remove(l);
  let t = 0;
  for (; t < 120 * 60 && !p.health.dry; t++) sb.step(1 / 120);
  const out = { dead: p.dead, cause: p.health.cause, left: p.health.bloodLeft, bleeding: p.health.bleeding, secs: +(t / 120).toFixed(1) };
  // three seconds more: nothing more comes out of them
  window.__bl = [];
  for (let i = 0; i < 360; i++) sb.step(1 / 120);
  out.after = window.__bl.filter((e) => e.who === 'Viv' && e.k === 'drip').length;
  out.streams = fx.streams.filter((q) => q.from === p).length;
  out.inAir = fx.drops.filter((d) => d.from === p).length;
  // (with a mind again, for the inspector to show all of them)
  p.brain = sb.makeBrain(p, p.traits);
  ui.select(p);
  return out;
});
await page.waitForTimeout(300);
const dryShown = await ev(() => {
  const rows = [...document.querySelectorAll('#ins-vitals .meter')];
  const row = rows.find((r) => r.querySelector('span').textContent === 'Blood');
  return { value: row && row.querySelector('b').textContent, width: row && row.querySelector('.fill').style.width, conds: document.querySelector('#ins-conds').textContent };
});
check('they bleed out; and with no blood left (the Blood bar at 0%), they stop bleeding: no drips, no streams, nothing',
  dry.dead && dry.cause === 'blood loss' && dry.left === 0 && dry.bleeding === 0 && dry.after === 0 && dry.streams === 0 && dry.inAir === 0, JSON.stringify(dry));
check('...the inspector says so: Blood 0%, and no blood left', dryShown.value === '0%' && dryShown.width === '0%' && /No blood left/.test(dryShown.conds), JSON.stringify(dryShown));
const dryAfter = await ev(() => {
  const sb = window.__sf.sb, fx = sb.fx, p = window.__stp;
  window.__sf.ui.select(null);
  const n0 = fx.drops.filter((d) => d.from === p).length;
  p.takeHit({ by: null, part: 'torso', x: p.wj.chest.x, y: p.wj.chest.y, dir: 1, power: 3, kind: 'chop', weapon: 'machete', bone: 'ribs' });
  p.sever('femurB', 1, 1);
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  return { drops: fx.drops.filter((d) => d.from === p).length - n0, streams: fx.streams.filter((q) => q.from === p).length, bleeding: p.health.bleeding, leg: sb.limbs[0] ? sb.limbs[0].bleed : null };
});
check('...and nothing comes out of them afterwards, whatever is done to them: a machete, a leg off - the leg does not bleed either',
  dryAfter.drops === 0 && dryAfter.streams === 0 && dryAfter.bleeding === 0 && dryAfter.leg === 0, JSON.stringify(dryAfter));

await fresh();
const stains = await ev(() => {
  const sb = window.__sf.sb, fx = sb.fx;
  const things = {
    crate: sb.spawnCrate(-8, 0.4), knuckles: sb.spawnKnuckles(-6.6, 0.06), knife: sb.spawnKnife(-5.6, 0.04), machete: sb.spawnMachete(-4.4, 0.05),
    pistol: sb.spawnGun(-3.1, 0.08), taser: sb.spawnTaser(-2.3, 0.08), vest: sb.spawnVest(-1.3, 0.05), ammo: sb.spawnAmmo(-0.2, 0.1, 'ammo762'),
  };
  const v = sb.spawnStickman(2, null, { name: 'Wes' });
  const q = sb.spawnStickman(5, null, { name: 'Xia' });
  v.brain = null;
  q.brain = null;
  for (let i = 0; i < 40; i++) sb.step(1 / 120);
  v.sever('humerusA', 1, 1);
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  things.arm = sb.limbs[0];
  sb.remove(v);
  for (let i = 0; i < 360; i++) sb.step(1 / 120);
  // blood coming down over all of it, and thrown at both walls
  for (let i = 0; i < 120; i++) {
    for (let x = -8.6; x <= 6; x += 0.05) fx.drop(x + Math.random() * 0.05, 2.4 + Math.random() * 0.4, 0, -1);
    for (const [x, vx] of [[sb.left + 1, -8], [sb.right - 1, 8]]) fx.drop(x, 1.5, vx, 1);
    for (let k = 0; k < 6; k++) sb.step(1 / 120);
  }
  for (let i = 0; i < 240; i++) sb.step(1 / 120);
  const out = { on: {} };
  for (const [k, t] of Object.entries(things)) out.on[k] = (t.stains || []).length;
  out.person = q.wounds.filter((w) => w.stain).length + q.headMarks.filter((m) => m.stain).length;
  out.bleeds = q.health.bleeding;
  out.walls = [fx.wallSplats.filter((w) => w.side < 0).length, fx.wallSplats.filter((w) => w.side > 0).length];
  out.runs = fx.wallSplats.filter((w) => w.run > 0.01).length;
  // and it goes where the thing goes: a stain on the knife, before and after the knife is moved
  const kn = things.knife, s0 = kn.stains && kn.stains[0];
  if (s0) {
    const w0 = kn.body.toWorld(s0.x, s0.y);
    kn.body.pos.x += 1;
    kn.body.rot += 1;
    const w1 = kn.body.toWorld(s0.x, s0.y), c1 = kn.body.pos;
    out.moved = Math.hypot(w1.x - w0.x, w1.y - w0.y) > 0.5 && Math.abs(Math.hypot(w1.x - c1.x, w1.y - c1.y) - Math.hypot(s0.x, s0.y)) < 1e-9;
  } else out.moved = false;
  return out;
});
check('blood lands on anything and stays there: a crate, knuckles, a knife, a machete, a pistol, a taser, a vest, an ammo box, a severed arm',
  Object.values(stains.on).every((n) => n > 0), JSON.stringify(stains.on));
check('...on the walls, where it runs down', stains.walls[0] > 0 && stains.walls[1] > 0 && stains.runs > 0, JSON.stringify({ walls: stains.walls, runs: stains.runs }));
check('...and on people - as blood on them, not wounds: it does not make them bleed', stains.person > 0 && stains.bleeds === 0, JSON.stringify({ person: stains.person, bleeds: stains.bleeds }));
check('...kept in the thing\'s own frame, so it goes where the thing goes', stains.moved, JSON.stringify(stains.moved));
await ev(() => { const c = window.__sf.cam; c.follow = null; c.glide = null; c.ppm = c.homePpm * 1.6; c.x = -4.2; c.y = 0.9; c.clamp(); window.__sf.sb.paused = true; });
await page.waitForTimeout(250);
await shot('blood');
await ev(() => {
  const fx = window.__sf.sb.fx;
  for (const k of ['drop', 'drip', 'gush', 'blood']) delete fx[k];
  window.__sf.cam.home();
});

/* ------------------------------ walls and trees ------------------------------ */

await fresh();
const walls = await ev(() => {
  const sb = window.__sf.sb, ui = window.__sf.ui;
  const made = {};
  for (const [k, x] of [['woodWall', -6], ['metalWall', -3], ['glassWall', 0]]) { ui.setSpawnKind(k); made[k] = ui.spawnAt(x, 0.5); }
  ui.setSpawnKind('stickman');
  for (let i = 0; i < 24; i++) sb.step(1 / 120);
  const wood = made.woodWall, metal = made.metalWall, glass = made.glassWall;
  const standing = [wood, metal, glass].every((w) => w && w.anchored && Math.abs(w.body.h - 2.4) < 0.01 && Math.abs(w.pos.y - w.body.h / 2) < 0.01);
  const hits = [];
  sb.on('bulletHit', (e) => { if (window.__wallHits) window.__wallHits.push({ k: e.what ? e.what.kind : null, mat: e.material || null, through: !!e.through }); });
  window.__wallHits = hits;
  sb.shoot(null, -8.5, 1.2, 0, { energy: 1 });
  window.__wallHits = null;
  // a blow takes out the cells round it; a cut right across, and the top half comes away
  const before = wood.alive;
  const gone = wood.damage(-6, 1.6, 0.1, 3, 'blunt');
  for (let x = -6.14; x <= -5.86; x += 0.02) wood.damage(x, 1.0, 0.05, 5, 'blade', { dx: 1 });
  const pieces = sb.slabs.filter((s) => s.kind === 'piece');
  for (let i = 0; i < 240; i++) sb.step(1 / 120);
  let shots = 0;
  while (!glass.removed && shots < 20) { sb.shoot(null, -1.5, 0.5 + shots * 0.15, 0, { energy: 1 }); shots++; }
  const shards = sb.fx.debris.filter((d) => d.sharp).length;
  // what people can see through: glass, not steel
  const seeGlass = sb.lineOfSight(-1, 1.5, 1, 1.5), seeMetal = sb.lineOfSight(-4, 1.5, -2, 1.5);
  return {
    standing, hits, gone, before, after: wood.alive, pieces: pieces.length, pieceCells: pieces[0] ? pieces[0].cellCount : 0,
    pieceLying: pieces[0] ? Math.abs(Math.cos(pieces[0].body.rot)) < 0.3 && pieces[0].pos.y < 0.3 : false, stump: wood.body.h, shots, shards, seeGlass, seeMetal,
  };
});
check('the three walls stand 2.4 m tall where they are put: wood, metal and glass', walls.standing, JSON.stringify(walls));
check('a 9 mm goes through the wood wall and stops dead in the steel one', walls.hits[0] && walls.hits[0].mat === 'wood' && walls.hits[0].through && walls.hits[1] && walls.hits[1].mat === 'metal' && !walls.hits[1].through,
  JSON.stringify(walls.hits));
check('walls break cell by cell: a blow knocks out the cells round it', walls.gone > 5 && walls.after < walls.before, `${walls.before} -> ${walls.after}`);
check('...and cut right across, everything above the cut comes away as a piece of its own, and falls over', walls.pieces === 1 && walls.pieceCells > 150 && walls.pieceLying && walls.stump < 1.1,
  JSON.stringify(walls));
check('glass cracks with every round, and after a few it all comes down in sharp shards', walls.shots <= 6 && walls.shards > 30, `${walls.shots} shots, ${walls.shards} shards`);
check('people can see through glass, not through steel', walls.seeGlass && !walls.seeMetal);
await ev(() => { window.__sf.cam.x = -3; window.__sf.cam.y = 2; });
await shot('walls');

await fresh();
const trees = await ev(() => {
  const sb = window.__sf.sb, ui = window.__sf.ui;
  ui.setSpawnKind('tree');
  const t = ui.spawnAt(0, 0.5);
  ui.setSpawnKind('bush');
  const bush = ui.spawnAt(6, 0.5);
  ui.setSpawnKind('stickman');
  const depths = new Set(t.boughs.map((b) => b.depth));
  let leaves = 0;
  for (const b of t.boughs) leaves += b.leaves.length;
  // a twig sways in the air
  const twig = t.boughs.find((b) => b.depth === 3);
  let lo = 9, hi = -9;
  for (let i = 0; i < 240; i++) { sb.step(1 / 120); lo = Math.min(lo, twig.bend); hi = Math.max(hi, twig.bend); }
  // bullets through the leaves strip some off
  for (let i = 0; i < 15; i++) sb.shoot(null, -6, 3.4 + i * 0.07, 0.05, { energy: 1 });
  let leaves2 = 0;
  for (const b of t.boughs) leaves2 += b.leaves.length;
  // somebody walking through the bush pushes its stems aside
  const p = sb.spawnStickman(4.6, null, { name: 'Bo' });
  p.brain = null;
  let bent = 0;
  for (let i = 0; i < 300; i++) { p.goTo(8, 'walk'); sb.step(1 / 120); for (const b of bush.boughs) bent = Math.max(bent, Math.abs(b.bend)); }
  // chopped at the foot of the trunk, it comes down
  let chops = 0;
  while (!sb.logs.some((l) => l.name === 'Fallen tree') && chops < 80) {
    const q = t.firstSolid(-0.6, 0.6, 1, 0, 1.2);
    if (!q) break;
    t.damage(q.x, q.y, 0.045, 0.6, 'blade', { dx: 1, dy: 0 });
    chops++;
  }
  const log = sb.logs.find((l) => l.name === 'Fallen tree');
  for (let i = 0; i < 120 * 5; i++) sb.step(1 / 120);
  return {
    depths: [...depths].sort(), leaves, sway: hi - lo, leaves2, bent, chops, felled: !!log,
    lying: log ? Math.abs(Math.sin(log.body.rot)) < 0.35 && log.pos.y < 0.6 : false, stump: t.boughs.length, len: log ? log.body.w : 0,
  };
});
check('a tree is a trunk, branches, smaller branches and twigs, with leaves on them', trees.depths.join() === '0,1,2,3' && trees.leaves > 40, JSON.stringify(trees));
check('...its twigs sway in the air', trees.sway > 0.004, trees.sway.toFixed(4));
check('...bullets through the leaves knock them off', trees.leaves2 < trees.leaves, `${trees.leaves} -> ${trees.leaves2}`);
check('somebody walking through a bush pushes its stems aside', trees.bent > 0.15, trees.bent.toFixed(2));
check('chopped through at the foot, a tree comes down, and lies there as a fallen tree with the stump left standing',
  trees.felled && trees.chops < 40 && trees.lying && trees.stump >= 1 && trees.len > 2, JSON.stringify(trees));
await ev(() => { window.__sf.cam.x = 2; window.__sf.cam.y = 2; });
await shot('trees');

await fresh();
const bend = await ev(() => {
  const sb = window.__sf.sb, hand = window.__sf.hand;
  const t = sb.spawnPlant('tree', 0);
  const p = sb.spawnStickman(3, null, { name: 'Lu' });
  p.brain = null;
  for (let i = 0; i < 20; i++) sb.step(1 / 120);
  // hung from a branch by a steel rope: the branch bends under them
  const br = t.boughs.filter((b) => b.depth === 1).sort((a, b) => b.r0 - a.r0)[0];
  const at = t.at(br, br.len * 0.7);
  const { tie } = window.__sf.wires;
  const w = tie(sb, 'metalRope', t, at.x, at.y, p, p.wj.handA.x, p.wj.handA.y);
  let most = 0;
  for (let i = 0; i < 360; i++) { sb.step(1 / 120); most = Math.max(most, Math.abs(br.bend)); }
  // a twig dragged by the hand bends - and, bent too far, snaps off
  const tw0 = t.boughs.find((b) => b.depth === 3 && !b.gone);
  const tip = t.at(tw0, tw0.len * 0.7);
  // (taken hold of as the world runs: paused, it would only be moved, whole)
  sb.paused = false;
  hand.grab(t, tip.x, tip.y);
  sb.paused = true;
  // (whichever twig the hand closed on)
  const tw = t.held && t.held.b ? t.held.b : tw0;
  let snapped = false, maxBend = 0;
  for (let i = 0; i < 200 && !snapped; i++) {
    hand.move(tip.x + i * 0.01, tip.y - i * 0.015);
    sb.step(1 / 120);
    maxBend = Math.max(maxBend, Math.abs(tw.bend));
    snapped = !!tw.gone || !t.boughs.includes(tw);
  }
  hand.release();
  return { tied: p.tied, rope: !w.removed, most, snapped, maxBend, depth: tw.depth, fell: sb.logs.length > 0 };
});
check('someone hung from a branch on a rope bends it', bend.tied && bend.rope && bend.most > 0.03, JSON.stringify(bend));
check('a branch dragged by the hand bends, then snaps off and falls', bend.snapped && bend.maxBend > 0.4 && bend.fell, JSON.stringify(bend));

/* --------------------------- freezing, and pausing --------------------------- */

await fresh();
const frozen = await ev(() => {
  const sf = window.__sf, sb = sf.sb, ui = sf.ui, cam = sf.cam;
  cam.follow = null; cam.x = 0; cam.y = 2; cam.clamp();
  const c = sb.spawnCrate(0, 3);
  const p = sb.spawnStickman(3, null, { name: 'Fen' });
  for (let i = 0; i < 12; i++) sb.step(1 / 120);
  ui.setTool('freeze');
  const at = (x, y) => { const q = cam.toScreen(x, y); return [q.x, q.y]; };
  ui.tap(...at(c.body.pos.x, c.body.pos.y));
  const y0 = c.body.pos.y, mid = { on: c.frozenInPlace, y: y0 };
  for (let i = 0; i < 120; i++) sb.step(1 / 120);
  mid.after = c.body.pos.y;
  // something landing on it does not move it either
  const k = sb.spawnKnuckles(c.body.pos.x, c.body.pos.y + 1.2);
  for (let i = 0; i < 90; i++) sb.step(1 / 120);
  mid.landed = c.body.pos.y;
  // (by its lower half: the knuckles are lying on top of it)
  ui.tap(...at(c.body.pos.x, c.body.pos.y - 0.25));
  for (let i = 0; i < 180; i++) sb.step(1 / 120);
  // a person: stopped dead, mid-stride; still thinking, still talking
  p.goTo(8, 'run');
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  ui.tap(...at(p.wj.chest.x, p.wj.chest.y));
  const px = p.pos.x;
  for (let i = 0; i < 240; i++) sb.step(1 / 120);
  const person = { on: p.frozenInPlace, moved: Math.abs(p.pos.x - px), said: p.brain.doing || '', toast: document.querySelector('#toast').textContent };
  ui.tap(...at(p.wj.chest.x, p.wj.chest.y));
  person.free = !p.frozenInPlace;
  ui.setTool('hand');
  return { mid, fell: c.body.pos.y, person };
});
check('the freeze tool stops a falling crate dead in the air, and it stays there', frozen.mid.on && Math.abs(frozen.mid.after - frozen.mid.y) < 0.001 && frozen.mid.y > 2,
  JSON.stringify(frozen.mid));
check('...even with something landing on it', Math.abs(frozen.mid.landed - frozen.mid.y) < 0.001, JSON.stringify(frozen.mid));
check('...and tapped again, it falls', frozen.fell < 0.45, frozen.fell.toFixed(2));
check('a person frozen in place stops mid-stride and cannot move, but still knows it - and tapped again, is let go',
  frozen.person.on && frozen.person.moved < 0.01 && /Frozen in place/.test(frozen.person.said) && /frozen in place/.test(frozen.person.toast) && frozen.person.free,
  JSON.stringify(frozen.person));

await fresh();
const paused = await ev(() => {
  const sf = window.__sf, sb = sf.sb, ui = sf.ui, cam = sf.cam;
  cam.follow = null; cam.x = 0; cam.y = 2; cam.clamp();
  const c = sb.spawnCrate(-2, 0.4);
  const p = sb.spawnStickman(2, null, { name: 'Gil' });
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  sb.paused = true;
  ui.setTool('hand');
  const t0 = sb.time;
  const drag = (x0, y0, x1, y1) => {
    const a = cam.toScreen(x0, y0), b = cam.toScreen(x1, y1);
    const mode = ui.dragStart(a.x, a.y, 0);
    for (let i = 1; i <= 10; i++) ui.dragMove(a.x + (b.x - a.x) * i / 10, a.y + (b.y - a.y) * i / 10, 0, 0, mode);
    ui.dragEnd(b.x, b.y, mode);
    return mode;
  };
  const m1 = drag(-2, 0.4, 0, 2.4);
  const crate = { x: c.body.pos.x, y: c.body.pos.y, rot: c.body.rot };
  const m2 = drag(p.wj.chest.x, p.wj.chest.y, p.wj.chest.x + 2, p.wj.chest.y + 1);
  const person = { x: p.pos.x, y: p.pos.y, state: p.state };
  const still = sb.time === t0;
  return { m1, m2, crate, person, still };
});
check('with the world paused, dragging something just puts it somewhere else, as it is - nothing moves on its own',
  paused.m1 === 'grab' && Math.abs(paused.crate.x) < 0.02 && Math.abs(paused.crate.y - 2.4) < 0.02 && Math.abs(paused.crate.rot) < 0.01 && paused.still,
  JSON.stringify(paused));
check('...a person too: picked up and put down, standing just as they were', paused.m2 === 'grab' && Math.abs(paused.person.x - 4) < 0.05 && paused.person.y > 0.9 && paused.person.state === 'stand',
  JSON.stringify(paused.person));
await ev(() => { window.__sf.sb.paused = false; });
await page.waitForTimeout(900);
const unpaused = await ev(() => ({ y: window.__sf.sb.crates[0].body.pos.y, p: window.__sf.sb.people[0].pos.y }));
check('...and let go of the pause, they fall', unpaused.y < 0.5 && unpaused.p < 0.1, JSON.stringify(unpaused));
await ev(() => { window.__sf.sb.paused = true; });

/* ----------------------------------- wires ----------------------------------- */

await fresh();
const wirebar = await ev(() => {
  window.__sf.ui.setTool('wire');
  const bar = document.querySelector('#wirebar');
  const kinds = [...bar.querySelectorAll('.wire-kind')].map((b) => b.dataset.wire + ':' + b.textContent.trim());
  const shown = !bar.classList.contains('hidden');
  window.__sf.ui.setTool('hand');
  return { kinds, shown, hidden: bar.classList.contains('hidden') };
});
check('the wire tool has six wires: wood rope, metal rope, fixed wood rope, fixed metal rope, wood pin and metal pin',
  wirebar.shown && wirebar.hidden && wirebar.kinds.join('|') === 'woodRope:WOOD ROPE|metalRope:METAL ROPE|woodRod:FIXED WOOD ROPE|metalRod:FIXED METAL ROPE|woodPin:WOOD PIN|metalPin:METAL PIN',
  JSON.stringify(wirebar));
await ev(() => window.__sf.ui.setTool('wire'));
await shot('wirebar');

const wires = await ev(() => {
  const sf = window.__sf, sb = sf.sb, ui = sf.ui, cam = sf.cam;
  cam.follow = null; cam.x = 0; cam.y = 2; cam.clamp();
  const drag = (x0, y0, x1, y1) => {
    const a = cam.toScreen(x0, y0), b = cam.toScreen(x1, y1);
    const mode = ui.dragStart(a.x, a.y, 0);
    for (let i = 1; i <= 8; i++) ui.dragMove(a.x + (b.x - a.x) * i / 8, a.y + (b.y - a.y) * i / 8, 0, 0, mode);
    ui.dragEnd(b.x, b.y, mode);
  };
  // a crate hung from the background on a wood rope, dragged out with the wire tool
  const c1 = sb.spawnCrate(-6, 2.6);
  for (let i = 0; i < 2; i++) sb.step(1 / 120);
  ui.setTool('wire');
  ui.setWireKind('woodRope');
  drag(-6, 2.95, -6, 4.2);
  const rope = sb.wires[0];
  for (let i = 0; i < 240; i++) sb.step(1 / 120);
  const hung = { y: c1.body.pos.y, rope: !!rope && !rope.removed, ends: rope ? rope.a.kind + '/' + rope.b.kind : null };
  // two crates on a fixed metal rope: kick one, and they go together, the same distance apart
  const c2 = sb.spawnCrate(1, 0.4), c3 = sb.spawnCrate(3, 0.4);
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  ui.setWireKind('metalRod');
  drag(1, 0.4, 3, 0.4);
  const rod = sb.wires.find((w) => w.type === 'metalRod');
  c3.body.vel.x = 4;
  for (let i = 0; i < 180; i++) sb.step(1 / 120);
  const [ra, rb] = rod ? rod.ends() : [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  const rodOk = rod && Math.abs(Math.hypot(rb.x - ra.x, rb.y - ra.y) - 2) < 0.03 && c2.body.pos.x > 1.08;
  // a metal pin through a crate into the background: it hangs there, and turns about it
  const c4 = sb.spawnCrate(6, 1.6);
  for (let i = 0; i < 2; i++) sb.step(1 / 120);
  ui.setWireKind('metalPin');
  const q = cam.toScreen(c4.body.pos.x - 0.3, c4.body.pos.y + 0.3);
  ui.tap(q.x, q.y);
  const pin = sb.wires.find((w) => w.type === 'metalPin');
  for (let i = 0; i < 240; i++) sb.step(1 / 120);
  const pp = pin ? pin.ends() : null;
  const pinned = !!pin && Math.hypot(pp[0].x - pp[1].x, pp[0].y - pp[1].y) < 0.02 && c4.body.pos.y > 1 && Math.abs(c4.body.rot) > 0.3;
  // somebody tied by the wrist to the background: they go limp, and hang there
  const p = sb.spawnStickman(-2, null, { name: 'Ty' });
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  ui.setWireKind('woodRope');
  drag(p.wj.handA.x, p.wj.handA.y, p.wj.handA.x, p.wj.handA.y + 1.4);
  for (let i = 0; i < 240; i++) sb.step(1 / 120);
  const tied = { tied: p.tied, rag: !!p.rag, doing: p.brain.doing };
  ui.setTool('hand');
  return { hung, rodOk, pinned, tied, count: sb.wires.length };
});
check('a wood rope dragged from a crate to the background: the crate hangs on it', wires.hung.rope && wires.hung.ends === 'body/world' && wires.hung.y > 2.3, JSON.stringify(wires.hung));
check('a fixed metal rope keeps two crates exactly as far apart as they were: kick one, and the other comes with it', wires.rodOk, JSON.stringify(wires));
check('a metal pin through a crate holds it to the background, and it turns about the pin', wires.pinned, JSON.stringify(wires));
check('somebody tied up by the wrist goes limp and hangs there - and knows they are tied up', wires.tied.tied && wires.tied.rag && /Tied up/.test(wires.tied.doing), JSON.stringify(wires.tied));
await shot('wires');

await fresh();
const strain = await ev(() => {
  const sb = window.__sf.sb;
  const { tie } = window.__sf.wires;
  // the same jolt on the two ropes: a crate dropped on a metre of slack
  const out = {};
  for (const [k, x] of [['woodRope', -4], ['metalRope', 4]]) {
    const c = sb.spawnCrate(x, 3.2);
    for (let i = 0; i < 2; i++) sb.step(1 / 120);
    const w = tie(sb, k, c, x, c.body.pos.y + 0.39, null, x, c.body.pos.y + 0.49);
    c.body.vel.y = -9;
    out[k] = { w };
  }
  let peak = { woodRope: 0, metalRope: 0 };
  for (let i = 0; i < 180; i++) {
    sb.step(1 / 120);
    for (const k of ['woodRope', 'metalRope']) if (!out[k].w.removed) peak[k] = Math.max(peak[k], out[k].w.strain);
  }
  return { wood: out.woodRope.w.removed, metal: out.metalRope.w.removed, peak };
});
check('a hard enough jolt snaps a wood rope; the metal one, which takes far more, holds', strain.wood && !strain.metal, JSON.stringify(strain));

/* ------------------------- the AK-47, the Mossberg, the crowbar ------------------------- */

await fresh();
const guns = await ev(() => {
  const sb = window.__sf.sb, ui = window.__sf.ui;
  ui.setSpawnKind('ak47');
  const ak = ui.spawnAt(-6, 0.3);
  ui.setSpawnKind('mossberg');
  const sg = ui.spawnAt(-3, 0.3);
  ui.setSpawnKind('crowbar');
  const cb = ui.spawnAt(0, 0.3);
  ui.setSpawnKind('stickman');
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  // a shotgun shell is eight pellets
  let paths = 0;
  const sh = sb.shoot;
  sb.shoot = function (...a) { paths++; return sh.apply(this, a); };
  sb.fireLoose(sg);
  sb.shoot = sh;
  // somebody angry, with the rifle: bursts, as fast as it goes
  const a = sb.spawnStickman(-9, null, { name: 'Ari', traits: { aggression: 0.95, temper: 0.9, bravery: 0.9, skill: 0.7 } });
  const b = sb.spawnStickman(-2.5, null, { name: 'Bea', traits: { aggression: 0.1, bravery: 0.2 } });
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  ak.wear(a);
  a.weapon = ak;
  a.brain.rel(b).anger = 1;
  a.brain.rel(b).like = -1;
  const times = [];
  sb.on('shot', (e) => { if (e.who === a && window.__akShots) window.__akShots.push(sb.time); });
  window.__akShots = times;
  for (let i = 0; i < 120 * 10 && times.length < 12; i++) sb.step(1 / 120);
  window.__akShots = null;
  let quick = 0;
  for (let i = 1; i < times.length; i++) if (times[i] - times[i - 1] < 0.13) quick++;
  return {
    ak: { name: ak.name, mag: ak.spec.mag, spare: ak.spec.spare, energy: ak.spec.energy }, sg: { name: sg.name, mag: sg.spec.mag, left: sg.mag },
    cb: cb.name, paths, shots: times.length, quick, bea: b.alive ? b.state : 'dead',
  };
});
check('the AK-47 holds 30 rounds of 7.62 and hits far harder than a pistol', guns.ak.name === 'AK-47' && guns.ak.mag === 30 && guns.ak.energy > 1.5, JSON.stringify(guns.ak));
check('the Mossberg 500 holds six shells, and each one is eight pellets', guns.sg.name === 'Mossberg 500' && guns.sg.mag === 6 && guns.sg.left === 5 && guns.paths === 8, JSON.stringify(guns));
check('someone angry with an AK fires it in bursts, a round every tenth of a second', guns.shots >= 3 && guns.quick >= 2, JSON.stringify(guns));

await fresh();
const bar = await ev(() => {
  const sb = window.__sf.sb;
  const g = sb.spawnWall('glassWall', 1.6);
  const p = sb.spawnStickman(0.8, null, { name: 'Cy', traits: { aggression: 0.5 } });
  p.brain = null;
  const cb = sb.spawnCrowbar(0.8, 0.1);
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  cb.wear(p);
  p.weapon = cb;
  p.facing = 1;
  const strikes = p.strikes();
  p.attack('chop');
  for (let i = 0; i < 100; i++) sb.step(1 / 120);
  // and on a person: a heavy blow, no cut
  const q = sb.spawnStickman(5, null, { name: 'Dot' });
  q.brain = null;
  for (let i = 0; i < 20; i++) sb.step(1 / 120);
  const hp = q.health.parts.torso.hp;
  q.takeHit({ by: p, part: 'torso', x: q.wj.chest.x, y: q.wj.chest.y, dir: -1, power: 2.1, kind: 'chop', armed: true, weapon: 'crowbar', bone: 'ribs' });
  return { strikes, glass: g.removed, hurt: hp - q.health.parts.torso.hp, gash: q.wounds.some((w) => w.gash) };
});
check('a crowbar is swung like a machete, and one blow puts a glass wall in', bar.strikes.includes('chop') && bar.glass, JSON.stringify(bar));
check('...on a person, a heavy blow that does not cut', bar.hurt > 10 && !bar.gash, JSON.stringify(bar));

/* ---------------------------------- mods --------------------------------- */

await fresh();
const modsOff = await ev(() => ({
  installed: window.__sf.mods.installedMods().map((m) => m.id),
  cards: document.querySelectorAll('.card').length,
  section: document.getElementById('drawer-mods').children.length,
}));
check('mods are not in the game until they are installed', !modsOff.installed.length && modsOff.cards === BASE.length && !modsOff.section, JSON.stringify(modsOff));

await page.tap('#btn-menu');
await page.waitForTimeout(300);
await page.tap('#btn-mods');
await page.waitForTimeout(300);
const listed = await ev(() => [...document.querySelectorAll('.mod-item')].map((el) => ({
  id: el.dataset.mod,
  name: el.querySelector('.mod-name').textContent,
  size: el.querySelector('.mod-size').textContent,
  adds: [...el.querySelectorAll('.mod-adds .chip')].map((c) => c.textContent),
  btn: el.querySelector('.mod-btn').textContent,
})));
const mdItem = listed.find((m) => m.id === 'murder-drones');
check('the MODS screen has Murder Drones, which adds Uzi, N and V', !!mdItem && mdItem.name === 'Murder Drones' && ['Uzi', 'N', 'V'].every((n) => mdItem.adds.includes(n)) && mdItem.btn === 'INSTALL',
  JSON.stringify(mdItem));
const realKB = (measureMods()['murder-drones'] / 1024).toFixed(1) + ' KB';
check('...and shows the storage it needs: what its files really take up', !!mdItem && mdItem.size === 'Storage needed: ' + realKB, `${mdItem && mdItem.size} (its folder: ${realKB})`);
await shot('mods');
await page.tap('.mod-item[data-mod="murder-drones"] .mod-btn');
await page.waitForTimeout(350);
const installing = await ev(() => {
  const it = document.querySelector('.mod-item[data-mod="murder-drones"]');
  return { bar: !it.querySelector('.mod-progress').classList.contains('hidden'), text: it.querySelector('.mod-progress span').textContent, yet: window.__sf.mods.isInstalled('murder-drones') };
});
await page.waitForFunction(() => window.__sf.mods.isInstalled('murder-drones'), null, { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(150);
const installed = await ev(() => ({
  cards: [...document.querySelectorAll('.card')].map((c) => c.dataset.spawn),
  stored: JSON.parse(localStorage.getItem('sf.mods') || '[]'),
  state: document.querySelector('.mod-item[data-mod="murder-drones"] .mod-state').offsetParent !== null,
}));
check('INSTALL fills a bar as it goes in, then Uzi, N and V are in the spawn menu',
  installing.bar && !installing.yet && installed.cards.length === BASE.length + 3 && ['md-uzi', 'md-n', 'md-v'].every((k) => installed.cards.includes(k)) && installed.state,
  `"${installing.text}" -> ${installed.cards.join(', ')}`);
check('...and the device remembers that it is installed', installed.stored.includes('murder-drones'), JSON.stringify(installed.stored));
await page.tap('#mods-close');
await page.waitForTimeout(250);

// Uzi, from her card, holding her railgun
await ev(() => { window.__sf.ui.toggleDrawer(true); });
await page.waitForTimeout(300);
await page.tap('.card[data-spawn="md-uzi"]');
await page.waitForTimeout(300);
await tapAt(420, 200);
await sim(0.5);
const uzi = await ev(() => {
  const u = window.__sf.sb.people.find((p) => p.name === 'Uzi');
  return u ? { armed: u.armedWith, kind: u.species && u.species.label, onFloor: Math.abs(u.pos.y) < 0.05, guns: window.__sf.sb.guns.map((g) => g.kind) } : null;
});
check('Uzi spawns from her card holding her railgun', !!uzi && uzi.armed === 'railgun' && uzi.kind === 'Worker Drone' && uzi.onFloor, JSON.stringify(uzi));

const crash = await ev(() => {
  const sb = window.__sf.sb, M = window.__sf.mods;
  const out = {};
  for (const k of ['n', 'v']) {
    sb.clear();
    let crashed = 0;
    sb.on('crashLand', () => { crashed++; });
    const d = M.findSpawnable('md-' + k).spawn(sb, 2);
    const y0 = d.pos.y, wing0 = d.md.wing.open, t0 = sb.time;
    let landed = null, wings = 0, kneel = false;
    for (let i = 0; i < 120 * 4; i++) {
      sb.step(1 / 120);
      if (landed === null && d.state === 'stand') { landed = sb.time - t0; wings = d.md.wing.open; kneel = d.anim.actionName === 'crashLand'; }
    }
    out[k] = { y0: +y0.toFixed(1), wing0, landed: landed && +landed.toFixed(2), wings: +wings.toFixed(2), kneel, crashed: crashed > 0, cracks: sb.effects.some((e) => Array.isArray(e.lines)), fine: d.health.overall > 0.9 };
  }
  return out;
});
const crashed = (c) => c.y0 > 8 && c.wing0 > 0.9 && c.landed !== null && c.landed < 3 && c.wings > 0.8 && c.kneel && c.crashed && c.cracks && c.fine;
check('N comes down out of the sky and crash-lands, wings out, cracking the floor', crashed(crash.n), JSON.stringify(crash.n));
check('...and so does V', crashed(crash.v), JSON.stringify(crash.v));

const forms = await ev(() => {
  const sb = window.__sf.sb, M = window.__sf.mods;
  const steps = (n, each) => { for (let i = 0; i < n; i++) { if (each) each(); sb.step(1 / 120); } };
  sb.clear();
  const n = M.findSpawnable('md-n').spawn(sb, -2);
  steps(120 * 3);
  n.brain = null;
  // (and nowhere it was already on its way to)
  n.stop();
  const STRIKE = { chainsaw: 'saw', sword: 'chop', claw: 'slash' };
  const REACH = { chainsaw: 1.05, sword: 1.25, claw: 0.95 };
  const out = {};
  for (const f of ['chainsaw', 'gunArm', 'sword', 'claw', 'laser', 'missile']) {
    n.md.formLock = f;
    n.lowerGun();
    let t = 0;
    while (t < 120 * 4 && !(n.md.form === f && n.md.formT >= 1 && !n.md.morphing && n.ready)) { sb.step(1 / 120); t++; }
    const morphed = n.md.form === f && n.innate === f;
    const melee = !!STRIKE[f];
    n.pos.x = -2; n.vel.x = 0; n.facing = 1;
    const dummy = sb.spawnStickman(-2 + (melee ? REACH[f] * n.scale * 0.85 : 4.5), null, { name: 'Dummy', traits: { toughness: 1 } });
    dummy.brain = null;
    dummy.facing = -1;
    steps(30);
    const hp0 = dummy.health.overall;
    if (melee) { n.attack(STRIKE[f], dummy); steps(120 * 1.2); }
    else { steps(120 * 0.7, () => n.aimAt(dummy)); n.fire(); steps(120 * 1.6, () => n.aimAt(dummy)); }
    out[f] = { morphed, hurt: dummy.health.overall < hp0 - 0.01, said: dummy.health.conditions().slice(0, 2).join('; ') };
    sb.remove(dummy);
    n.lowerGun();
    n.heal();
    steps(60);
  }
  return out;
});
const formsOk = Object.values(forms).every((f) => f.morphed && f.hurt);
check('N\'s hands turn into a chainsaw, a gun, a sword, claws, a laser and missiles, and each of them does damage', formsOk,
  Object.entries(forms).map(([k, f]) => `${k}${f.morphed ? '' : ' (no morph)'}${f.hurt ? '' : ' (no hurt)'}: ${f.said}`).join(' | '));

const tail = await ev(() => {
  const sb = window.__sf.sb, M = window.__sf.mods;
  const steps = (n) => { for (let i = 0; i < n; i++) sb.step(1 / 120); };
  sb.clear();
  const v = M.findSpawnable('md-v').spawn(sb, -2);
  steps(120 * 3);
  v.brain = null;
  v.pos.x = -2; v.vel.x = 0; v.facing = 1;
  const d = sb.spawnStickman(-1, null, { name: 'Dee', traits: { toughness: 1 } });
  d.brain = null;
  d.facing = -1;
  steps(30);
  // whatever she was in the middle of, finished
  for (let i = 0; i < 120 * 4 && !(v.ready && (!v.md.tail || v.md.tail.phase === 'idle') && sb.time - v.md.tailCool > 3.3); i++) sb.step(1 / 120);
  v.facing = 1;
  const strike = v.species.abilities(v).find((a) => a.id === 'tail');
  const did = strike.pick();
  steps(120 * 0.8);
  const acid = d.afflictions.map((a) => a.label);
  steps(120 * 4);
  return { did, acid, conds: d.health.conditions() };
});
check('V\'s tail stabs, and puts nanite acid in them that eats away at them', tail.did && tail.acid.length > 0 && tail.conds.some((c) => /Nanite acid/.test(c)),
  `${tail.acid.join(', ')} -> ${tail.conds.slice(0, 3).join('; ')}`);

const rail = await ev(() => {
  const sb = window.__sf.sb, M = window.__sf.mods;
  const steps = (n, each) => { for (let i = 0; i < n; i++) { if (each) each(); sb.step(1 / 120); } };
  sb.clear();
  const u = M.findSpawnable('md-uzi').spawn(sb, -5);
  const a = sb.spawnStickman(0, null, { name: 'Ann', traits: { toughness: 1 } });
  const b = sb.spawnStickman(2.5, null, { name: 'Bob', traits: { toughness: 1 } });
  for (const p of [u, a, b]) p.brain = null;
  steps(60);
  u.facing = 1; a.facing = -1; b.facing = -1;
  let shotAt = null;
  sb.on('railShot', () => { if (shotAt === null) shotAt = sb.time; });
  steps(120 * 0.7, () => u.aimAt(a));
  const t0 = sb.time;
  u.fire();
  steps(120 * 1.5, () => { u.aimAt(a); u.fire(); });
  const hit = (p) => p.dead || p.health.conditions().some((c) => /Railgun|Shot/.test(c));
  return { charged: shotAt === null ? null : +(shotAt - t0).toFixed(2), a: hit(a), b: hit(b) };
});
check('the railgun charges, then goes through everyone in its way', rail.charged !== null && rail.charged >= 0.85 && rail.a && rail.b, JSON.stringify(rail));

const peace = await ev(() => {
  const sb = window.__sf.sb, M = window.__sf.mods;
  sb.clear();
  const sp = (k, x) => M.findSpawnable(k).spawn(sb, x);
  const u = sp('md-uzi', -2), v = sp('md-v', 3), n = sp('md-n', 6);
  let hits = 0, fights = 0;
  sb.on('hit', (e) => { if (e.by === u && (e.who === v || e.who === n)) hits++; });
  for (let i = 0; i < 120 * 40; i++) {
    sb.step(1 / 120);
    const b = u.brain.behaviour;
    if (b && b.kind === 'fight' && (b.target === v || b.target === n)) fights++;
  }
  return { hits, fights };
});
check('Uzi leaves V (and N) alone when they have done nothing to her', peace.hits === 0 && peace.fights === 0, JSON.stringify(peace));

// the inspector: what they are, and buttons for what they can do
await fresh();
await ev(() => {
  const sb = window.__sf.sb, M = window.__sf.mods;
  const n = M.findSpawnable('md-n').spawn(sb, 0);
  for (let i = 0; i < 120 * 3; i++) sb.step(1 / 120);
  window.__n = n;
  window.__sf.ui.select(n);
});
await page.waitForTimeout(300);
const insp = await ev(() => ({
  chips: [...document.querySelectorAll('#ins-traits .chip')].map((c) => c.textContent),
  abilities: [...document.querySelectorAll('.abil-btn')].map((b) => b.textContent),
}));
check('tapping N shows a Disassembly Drone, with a button for each of his abilities',
  insp.chips[0] === 'Disassembly Drone' && ['Chainsaw', 'Gun', 'Sword', 'Claws', 'Laser', 'Missiles', 'Tail strike', 'Fly'].every((a) => insp.abilities.includes(a)), insp.abilities.join(', '));
await page.tap('.abil-btn[data-ability="sword"]');
await sim(1.5);
await page.waitForTimeout(250);
const locked = await ev(() => ({ lock: window.__n.md.formLock, form: window.__n.md.form, on: document.querySelector('.abil-btn[data-ability="sword"]').classList.contains('on') }));
check('...and his hands become what is tapped, and stay that way', locked.lock === 'sword' && locked.form === 'sword' && locked.on, JSON.stringify(locked));
await shot('drone-inspector');
await ev(() => window.__sf.ui.select(null));

// out again: the menu, the world and the device all forget it
await ev(() => {
  const sb = window.__sf.sb, M = window.__sf.mods;
  M.findSpawnable('md-uzi').spawn(sb, -4);
  M.findSpawnable('md-v').spawn(sb, 4);
  sb.spawnStickman(7, null, { name: 'Keeper' });
  for (let i = 0; i < 120 * 2; i++) sb.step(1 / 120);
});
await ev(() => { window.__sf.ui.toggleDrawer(true); });
await page.waitForTimeout(300);
await page.tap('#btn-mods');
await page.waitForTimeout(300);
await page.tap('.mod-item[data-mod="murder-drones"] .mod-btn');
await page.waitForTimeout(150);
const armedRemove = await ev(() => document.querySelector('.mod-item[data-mod="murder-drones"] .mod-btn').textContent);
await page.tap('.mod-item[data-mod="murder-drones"] .mod-btn');
await page.waitForTimeout(250);
const removed = await ev(() => ({
  people: window.__sf.sb.people.map((p) => p.name),
  guns: window.__sf.sb.guns.map((g) => g.kind),
  cards: document.querySelectorAll('.card').length,
  stored: JSON.parse(localStorage.getItem('sf.mods') || '[]'),
}));
check('REMOVE asks once more, then takes the mod out of the spawn menu and everything of it out of the world',
  armedRemove === 'TAP TO REMOVE' && removed.people.join() === 'Keeper' && !removed.guns.length && removed.cards === BASE.length && !removed.stored.length, JSON.stringify(removed));
await page.tap('#mods-close');
await ev(() => window.__sf.ui.toggleDrawer(false));
await page.waitForTimeout(250);

/* ------------------------------- Minecraft ------------------------------- */

await fresh();
await ev(() => { window.__sf.ui.toggleDrawer(true); });
await page.waitForTimeout(300);
await page.tap('#btn-mods');
await page.waitForTimeout(300);
const mcItem = await ev(() => {
  const el = document.querySelector('.mod-item[data-mod="minecraft"]');
  return el && {
    name: el.querySelector('.mod-name').textContent,
    size: el.querySelector('.mod-size').textContent,
    adds: [...el.querySelectorAll('.mod-adds .chip')].map((c) => c.textContent),
    btn: el.querySelector('.mod-btn').textContent,
  };
});
check('the MODS screen has Minecraft too: Steve, the blocks for a Wither Totem, the Wither, its skeletons and its Nether Star',
  !!mcItem && mcItem.name === 'Minecraft' && mcItem.btn === 'INSTALL' &&
  ['Steve', 'Crafting Table', 'Soul Sand', 'Wither Skull', 'Wither Totem', 'The Wither', 'Wither Skeletons', 'Nether Star'].every((n) => mcItem.adds.includes(n)), JSON.stringify(mcItem));
const mcKB = (measureMods().minecraft / 1024).toFixed(1) + ' KB';
check('...and shows the storage it needs, too', !!mcItem && mcItem.size === 'Storage needed: ' + mcKB, `${mcItem && mcItem.size} (its folder: ${mcKB})`);
await page.tap('.mod-item[data-mod="minecraft"] .mod-btn');
await page.waitForFunction(() => window.__sf.mods.isInstalled('minecraft'), null, { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(150);
await page.tap('#mods-close');
await page.waitForTimeout(250);
const mcCards = await ev(() => {
  window.__sf.ui.toggleDrawer(true);
  const c = document.querySelector('.card[data-spawn="mc-totem"]');
  return { cards: [...document.querySelectorAll('.card')].map((k) => k.dataset.spawn), locked: !!c && c.classList.contains('locked'), badge: c && c.querySelector('.card-badge').textContent };
});
check('installed, Steve, a Crafting Table, Soul Sand, a Wither Skull and a Wither Totem are in the spawn menu - the totem locked until one is crafted',
  mcCards.cards.length === BASE.length + 5 && ['mc-steve', 'mc-table', 'mc-soul', 'mc-skull', 'mc-totem'].every((k) => mcCards.cards.includes(k)) && mcCards.locked && mcCards.badge === 'CRAFT',
  `${mcCards.cards.join(', ')}; the totem says ${mcCards.badge}`);
await page.waitForTimeout(300);
await ev(() => document.querySelector('.card[data-spawn="mc-totem"]').scrollIntoView({ block: 'center' }));
await page.tap('.card[data-spawn="mc-totem"]');
await page.waitForTimeout(200);
const lockedTap = await ev(() => ({ open: document.querySelector('#drawer').classList.contains('open'), kind: window.__sf.ui.spawnKind, toast: document.querySelector('#toast').textContent }));
check('...and tapping it says how to make one, instead of arming the spawn tool', lockedTap.open && lockedTap.kind !== 'mc-totem' && /Craft one first/.test(lockedTap.toast), JSON.stringify(lockedTap));

// Steve, from his card
await ev(() => document.querySelector('.card[data-spawn="mc-steve"]').scrollIntoView({ block: 'center' }));
await page.tap('.card[data-spawn="mc-steve"]');
await page.waitForTimeout(300);
await tapAt(220, 200);
await sim(0.6);
const steve = await ev(() => {
  const s = window.__sf.sb.people.find((p) => p.name === 'Steve');
  window.__s = s;
  return s && { kind: s.species && s.species.label, holding: s.innate, apples: s.mc.apples, onFloor: Math.abs(s.pos.y) < 0.05 };
});
check('Steve spawns from his card, with his diamond sword and three golden apples', !!steve && steve.kind === 'Minecraft Player' && steve.holding === 'diamondSword' && steve.apples === 3 && steve.onFloor, JSON.stringify(steve));
const kit = await ev(() => {
  const sb = window.__sf.sb, s = window.__s;
  const steps = (n, each) => { for (let i = 0; i < n; i++) { if (each) each(); sb.step(1 / 120); } };
  s.brain = null;
  s.pos.x = -6; s.vel.x = 0; s.facing = 1;
  const d = sb.spawnStickman(1, null, { name: 'Target', traits: { toughness: 1 } });
  d.brain = null;
  d.facing = -1;
  steps(60);
  s.species.abilities(s).find((a) => a.id === 'bow').pick();
  steps(120);
  const form = s.mc.form;
  let shots = 0, hits = 0;
  sb.on('bowShoot', (e) => { if (e.who === s) shots++; });
  sb.on('arrowHit', (e) => { if (e.who === d) hits++; });
  steps(120 * 4, () => { s.aimAt(d); s.fire(); });
  // and, hurt, an apple
  s.health.parts.torso.hp *= 0.5;
  const hp0 = s.health.overall;
  s.lowerGun();
  steps(30);
  const ate = s.species.abilities(s).find((a) => a.id === 'apple').pick();
  steps(120 * 2.5);
  return { form, shots, hits, ate, apples: s.mc.apples, healed: s.health.overall > hp0, regen: s.afflictions.some((a) => a.label === 'Regeneration') };
});
check('Steve swaps to his bow, draws it, and his arrows arc over and hit', kit.form === 'bow' && kit.shots >= 2 && kit.hits >= 1, JSON.stringify(kit));
check('...and a golden apple mends him, and leaves him regenerating', kit.ate && kit.apples === 2 && kit.healed && kit.regen, JSON.stringify(kit));

// crafting: the blocks next to a table, the table tapped, CRAFT
await fresh();
const tableAt = await ev(() => {
  const sf = window.__sf, sb = sf.sb, M = sf.mods, cam = sf.cam;
  const sp = (k, x, y = 0.4) => M.findSpawnable(k).spawn(sb, x, y);
  sf.ui.toggleDrawer(false);
  cam.home();
  const t = sp('mc-table', 0);
  for (const x of [1.0, 1.8, 1.4, -1.2]) sp('mc-soul', x, x === 1.4 ? 1.3 : 0.4);
  for (const x of [-0.6, -1.9, 0.6]) sp('mc-skull', x, 1.2);
  for (let i = 0; i < 240; i++) sb.step(1 / 120);
  window.__table = t;
  sf.ui.setTool('hand');
  // somewhere on its face with nothing in front of it (a skull can come to rest against it, or on top)
  let at = { x: t.pos.x, y: t.pos.y - 0.12 };
  find: for (const dy of [-0.12, -0.24, 0, 0.12, -0.3]) {
    for (const dx of [0, -0.18, 0.18, -0.3, 0.3]) {
      if (sb.thingAt(t.pos.x + dx, t.pos.y + dy, sf.ui.tol) === t) { at = { x: t.pos.x + dx, y: t.pos.y + dy }; break find; }
    }
  }
  const s = cam.toScreen(at.x, at.y);
  return { x: s.x, y: s.y };
});
// (the spawn menu all the way shut first: it slides out over where the table is)
await page.waitForFunction(() => !document.querySelector('#drawer').classList.contains('open'), null, { timeout: 3000 }).catch(() => {});
await page.waitForTimeout(500);
await tapAt(tableAt.x, tableAt.y);
await page.waitForTimeout(300);
const panel = await ev(() => {
  const b = document.querySelector('#panel-buttons .panel-btn');
  return {
    open: !document.querySelector('#thing-panel').classList.contains('hidden'),
    title: document.querySelector('#panel-title').textContent,
    text: document.querySelector('#panel-text').textContent,
    craft: b && { label: b.textContent, enabled: !b.disabled },
  };
});
check('tapping the Crafting Table opens its crafting grid, which sees the 4 Soul Sand and 3 Wither Skulls by it',
  panel.open && panel.title === 'CRAFTING' && /4\/4 Soul Sand, 3\/3 Wither Skulls/.test(panel.text) && !!panel.craft && panel.craft.label === 'CRAFT' && panel.craft.enabled, JSON.stringify(panel));
await shot('crafting');
await page.tap('#panel-buttons .panel-btn');
await page.waitForTimeout(300);
const crafted = await ev(() => {
  const sb = window.__sf.sb, c = document.querySelector('.card[data-spawn="mc-totem"]');
  window.__sf.ui.updateBadges();
  return {
    sand: sb.crates.filter((k) => k.block === 'soul').length, skulls: sb.items.filter((i) => i.kind === 'witherSkull').length,
    closed: document.querySelector('#thing-panel').classList.contains('hidden'), badge: c.querySelector('.card-badge').textContent, locked: c.classList.contains('locked'),
  };
});
check('CRAFT uses them up, and a Wither Totem is waiting in the spawn menu', crafted.sand === 0 && crafted.skulls === 0 && crafted.closed && crafted.badge === '×1' && !crafted.locked, JSON.stringify(crafted));

// the totem, placed and activated
await ev(() => { window.__sf.ui.toggleDrawer(true); document.querySelector('.card[data-spawn="mc-totem"]').scrollIntoView({ block: 'center' }); });
await page.waitForTimeout(300);
await page.tap('.card[data-spawn="mc-totem"]');
await page.waitForTimeout(300);
const placeAt = await ev(() => { const s = window.__sf.cam.toScreen(-3, 0.5); return { x: s.x, y: s.y }; });
await tapAt(placeAt.x, placeAt.y);
await ev(() => window.__sf.ui.setTool('hand'));
await sim(0.3);
await page.waitForTimeout(250);
const placed = await ev(() => {
  const sb = window.__sf.sb, t = sb.items.find((i) => i.kind === 'witherTotem');
  window.__totem = t;
  const b = document.querySelector('#world-buttons .world-btn');
  return { totem: !!t, x: t && +t.pos.x.toFixed(2), badge: document.querySelector('.card[data-spawn="mc-totem"] .card-badge').textContent, button: b && b.textContent, shown: !!b && b.style.display !== 'none' };
});
check('the Wither Totem goes down where it is tapped, with an ACTIVATE button over it', placed.totem && Math.abs(placed.x + 3) < 0.2 && placed.button === 'ACTIVATE' && placed.shown && placed.badge === 'CRAFT', JSON.stringify(placed));
await shot('totem');
await page.tap('#world-buttons .world-btn');
await page.waitForTimeout(100);
const charge = await ev(() => {
  const sb = window.__sf.sb, t = window.__totem, y0 = t.pos.y;
  const out = { charging: t.charging };
  let wither = null, bang = 0;
  sb.on('mcExplosion', () => { bang++; });
  sb.on('witherSpawn', (e) => { wither = e.who; });
  const xs = [];
  for (let i = 0; i < 120 * 3.3; i++) { sb.step(1 / 120); if (i > 120 * 2.8) xs.push(t.pos.x); }
  out.rose = +(t.pos.y - y0).toFixed(2);
  out.glow = +t.glow.toFixed(2);
  out.shake = +(Math.max(...xs) - Math.min(...xs)).toFixed(3);
  out.whole = !t.removed && !wither;
  for (let i = 0; i < 120; i++) sb.step(1 / 120);
  out.gone = t.removed;
  out.bang = bang > 0;
  out.wither = !!wither;
  window.__w = wither;
  return out;
});
check('ACTIVATE: the totem floats up, glows white and shakes - then explodes into the Wither',
  charge.charging && charge.rose > 1 && charge.glow > 0.8 && charge.shake > 0.02 && charge.whole && charge.gone && charge.bang && charge.wither, JSON.stringify(charge));
await page.waitForTimeout(300);
const boss = await ev(() => {
  const w = window.__w, bars = [...document.querySelectorAll('#bossbars .bossbar')];
  return { name: w && w.name, hp: w && +w.health.bossHp.toFixed(1), max: w && w.health.bossMax, bars: bars.map((b) => b.querySelector('.boss-name').textContent), fill: bars[0] && bars[0].querySelector('.boss-fill').style.width };
});
check('the Wither has a boss bar along the top, and 600 health', boss.name === 'Wither' && boss.max === 600 && boss.hp > 590 && boss.bars.length === 1 && boss.bars[0] === 'Wither' && parseFloat(boss.fill) > 98, JSON.stringify(boss));
await shot('wither');

const p1 = await ev(() => {
  const sb = window.__sf.sb, w = window.__w;
  sb.spawnStickman(-6, null, { name: 'Ash', traits: { toughness: 1, bravery: 1 } });
  sb.spawnStickman(5, null, { name: 'Bo', traits: { toughness: 1, bravery: 1 } });
  let black = 0, blue = 0, high = 0;
  const withered = new Set();
  sb.on('witherShoot', (e) => { if (e.who === w) { if (e.blue) blue++; else black++; } });
  sb.on('withered', (e) => withered.add(e.who.name));
  for (let i = 0; i < 120 * 16; i++) { sb.step(1 / 120); high = Math.max(high, w.pos.y); }
  return { black, blue, withered: [...withered], high: +high.toFixed(2), outOfReach: !w.species.reachable(w), phase: w.mc.phase };
});
check('phase 1: up out of reach, it spits black skulls and blue ones, and whoever they catch withers',
  p1.black >= 4 && p1.blue >= 1 && p1.withered.length >= 1 && p1.high > 2 && p1.outOfReach && p1.phase === 1, JSON.stringify(p1));

const p2 = await ev(() => {
  const sb = window.__sf.sb, w = window.__w;
  w.health.bossHp = 300;
  let armour = 0, summoned = 0, low = 9;
  sb.on('witherArmor', () => { armour++; });
  sb.on('skeletonSummoned', (e) => { if (e.by === w) summoned++; });
  for (let i = 0; i < 120 * 3; i++) sb.step(1 / 120);
  const sk = sb.people.filter((p) => p.species && p.species.kind === 'witherSkeleton');
  window.__skSpecies = sk.length ? sk[0].species : null;
  for (let i = 0; i < 120 * 4; i++) { sb.step(1 / 120); low = Math.min(low, w.pos.y); }
  return {
    phase: w.mc.phase, armored: w.mc.armored, armour, summoned, swords: sk.map((s) => s.innate), low: +low.toFixed(2),
    shotsBounce: ['arrow', 'bullet', 'rail'].map((k) => w.species.deflects(w, k)), swordBounces: w.species.deflects(w, 'diamondSword'),
  };
});
check('half way, its armour comes up, and wither skeletons with stone swords stand up out of soul fire around it',
  p2.phase === 2 && p2.armored && p2.armour === 1 && p2.summoned >= 2 && p2.swords.length >= 2 && p2.swords.every((k) => k === 'stoneSword'), JSON.stringify(p2));
check('...then it comes down low, where a sword can reach it - arrows and bullets bounce off the armour, a sword does not',
  p2.low < 1.2 && p2.shotsBounce.every(Boolean) && !p2.swordBounces, JSON.stringify(p2));
await page.waitForTimeout(300);
const armourBar = await ev(() => { const b = document.querySelector('#bossbars .bossbar'); return b && { name: b.querySelector('.boss-name').textContent, armored: b.querySelector('.boss-track').classList.contains('armored') }; });
check('...and its boss bar says so', !!armourBar && armourBar.name === 'Wither - Wither Armour' && armourBar.armored, JSON.stringify(armourBar));
await shot('wither-armour');

const fall = await ev(() => {
  const sb = window.__sf.sb, w = window.__w, t0 = sb.time, glow = [];
  let roar = null, bang = null;
  sb.on('witherRoar', () => { if (roar === null) roar = +(sb.time - t0).toFixed(2); });
  sb.on('witherDeath', () => { if (bang === null) bang = +(sb.time - t0).toFixed(2); });
  w.health.bossHp = 0;
  for (let i = 0; i < 120 * 4; i++) { sb.step(1 / 120); if (!w.removed) glow.push(w.mc.glow); }
  const star = sb.items.find((i) => i.kind === 'netherStar');
  return { roar, bang, glow: +Math.max(...glow).toFixed(2), gone: w.removed && !sb.people.includes(w), star: star ? star.name : null };
});
check('beaten, it roars, glows white - then explodes, and drops a Nether Star', fall.roar !== null && fall.roar < 0.2 && fall.bang > 2 && fall.glow > 0.9 && fall.gone && fall.star === 'Nether Star', JSON.stringify(fall));
await page.waitForTimeout(300);
const barsLeft = await ev(() => document.querySelectorAll('#bossbars .bossbar').length);
check('...and its boss bar goes with it', barsLeft === 0, String(barsLeft));

const cut = await ev(() => {
  const sb = window.__sf.sb, S = window.__skSpecies;
  sb.clear();
  const k = sb.spawnStickman(-1, null, { name: 'Wither Skeleton', species: S, scale: 1.24 });
  const d = sb.spawnStickman(0.6, null, { name: 'Dot', traits: { toughness: 1 } });
  let cuts = 0;
  sb.on('hit', (e) => { if (e.by === k && e.who === d && e.weapon === 'stoneSword' && !e.blocked) cuts++; });
  for (let i = 0; i < 120 * 15 && !cuts; i++) sb.step(1 / 120);
  sb.step(1 / 120);
  const w = d.afflictions.find((a) => a.withering);
  return { cuts, withering: w ? w.label : null, byIt: !!w && w.by === k, fear: k.brain.emo.fear, fearLocked: k.brain.emo.isLocked('fear') };
});
check('a wither skeleton goes for the living, and its stone sword withers whoever it cuts - and nothing frightens it',
  cut.cuts >= 1 && !!cut.withering && cut.byIt && cut.fear === 0 && cut.fearLocked, JSON.stringify(cut));

// out again
await fresh();
await ev(() => {
  const sb = window.__sf.sb, M = window.__sf.mods;
  M.findSpawnable('mc-steve').spawn(sb, -4);
  M.findSpawnable('mc-table').spawn(sb, 2, 0.4);
  M.findSpawnable('mc-skull').spawn(sb, 3, 0.3);
  sb.spawnStickman(7, null, { name: 'Keeper' });
  for (let i = 0; i < 120; i++) sb.step(1 / 120);
});
const mcBlood = await ev(() => {
  const sb = window.__sf.sb, fx = sb.fx;
  const table = sb.crates.find((c) => c.block === 'table'), skull = sb.items.find((i) => i.kind === 'witherSkull');
  for (let i = 0; i < 60; i++) {
    for (let x = 1.4; x <= 3.6; x += 0.04) fx.drop(x, 1.6, 0, -1);
    for (let k = 0; k < 4; k++) sb.step(1 / 120);
  }
  return { table: table ? table.stains.length : -1, skull: skull ? (skull.stains || []).length : -1 };
});
check('blood lands on the mod\'s things too: a Crafting Table, a Wither Skull', mcBlood.table > 0 && mcBlood.skull > 0, JSON.stringify(mcBlood));
await ev(() => { window.__sf.ui.toggleDrawer(true); });
await page.waitForTimeout(300);
await page.tap('#btn-mods');
await page.waitForTimeout(300);
await page.tap('.mod-item[data-mod="minecraft"] .mod-btn');
await page.waitForTimeout(150);
await page.tap('.mod-item[data-mod="minecraft"] .mod-btn');
await page.waitForTimeout(250);
const mcGone = await ev(() => ({
  people: window.__sf.sb.people.map((p) => p.name),
  crates: window.__sf.sb.crates.length,
  items: window.__sf.sb.items.length,
  cards: document.querySelectorAll('.card').length,
  stored: JSON.parse(localStorage.getItem('sf.mods') || '[]'),
}));
check('removing Minecraft takes Steve, the blocks and everything else of it out of the world and the menu',
  mcGone.people.join() === 'Keeper' && !mcGone.crates && !mcGone.items && mcGone.cards === BASE.length && !mcGone.stored.length, JSON.stringify(mcGone));
await page.tap('#mods-close');
await ev(() => window.__sf.ui.toggleDrawer(false));
await page.waitForTimeout(250);

/* -------------------------------- Shallow -------------------------------- */

await fresh();
await ev(() => { window.__sf.ui.toggleDrawer(true); });
await page.waitForTimeout(300);
await page.tap('#btn-mods');
await page.waitForTimeout(300);
const shItem = await ev(() => {
  const el = document.querySelector('.mod-item[data-mod="shallow"]');
  return el && {
    name: el.querySelector('.mod-name').textContent,
    size: el.querySelector('.mod-size').textContent,
    adds: [...el.querySelectorAll('.mod-adds .chip')].map((c) => c.textContent),
    btn: el.querySelector('.mod-btn').textContent,
  };
});
check('the MODS screen has Shallow, which adds Shallow', !!shItem && shItem.name === 'Shallow' && shItem.btn === 'INSTALL' && shItem.adds.join() === 'Shallow', JSON.stringify(shItem));
const shKB = (measureMods().shallow / 1024).toFixed(1) + ' KB';
check('...and shows the storage it needs', !!shItem && shItem.size === 'Storage needed: ' + shKB, `${shItem && shItem.size} (its folder: ${shKB})`);
await page.tap('.mod-item[data-mod="shallow"] .mod-btn');
await page.waitForFunction(() => window.__sf.mods.isInstalled('shallow'), null, { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(150);
await page.tap('#mods-close');
await page.waitForTimeout(250);
const shCards = await ev(() => { window.__sf.ui.toggleDrawer(true); return [...document.querySelectorAll('.card')].map((k) => k.dataset.spawn); });
check('installed, Shallow is in the spawn menu', shCards.length === BASE.length + 1 && shCards.includes('sh-shallow'), shCards.join(', '));

// from its card: somebody ordinary
await ev(() => document.querySelector('.card[data-spawn="sh-shallow"]').scrollIntoView({ block: 'center' }));
await page.tap('.card[data-spawn="sh-shallow"]');
await page.waitForTimeout(300);
await tapAt(300, 200);
await sim(0.5);
const shSpawn = await ev(() => {
  const sb = window.__sf.sb, s = sb.people[0];
  window.__s = s;
  return s && { name: s.name, label: s.species && s.species.label, human: s.human, scale: s.scale, hair: s.hair, holster: s.slotFor({ kind: 'glock' }), toast: document.querySelector('#toast').textContent };
});
check('Shallow spawns from its card looking like anybody at all: a name, a height, a haircut - and it passes for a person (a holster for a pistol, a pocket for a knife)',
  !!shSpawn && shSpawn.label === 'Shallow, in disguise' && shSpawn.name !== 'Shallow' && shSpawn.human && shSpawn.scale > 0.9 && shSpawn.scale < 1.1 && shSpawn.holster === 'holster' && /Nobody looks twice/.test(shSpawn.toast), JSON.stringify(shSpawn));

// angry: it splits, and comes out of the skin taller
const shOut = await ev(() => {
  const sb = window.__sf.sb, s = window.__s, ui = window.__sf.ui;
  const a = window.__a = sb.spawnStickman(s.pos.x + 1.8, null, { name: 'Ann', traits: { bravery: 0.1 } });
  window.__c = sb.spawnStickman(s.pos.x - 4, null, { name: 'Cy', hair: 'curly' });
  // (tough enough not to faint at what they are about to see)
  window.__d = sb.spawnStickman(s.pos.x - 6.5, null, { name: 'Dee', traits: { toughness: 1, bravery: 0.4 } });
  for (let i = 0; i < 30; i++) sb.step(1 / 120);
  ui.select(s);
  const was = { name: s.name, scale: s.scale };
  const seen = [];
  for (const k of ['shallowCrack', 'shallowEmerge', 'becomes']) sb.on(k, (e) => seen.push(k));
  s.brain.rel(a).anger = 0.7;
  let it = null;
  for (let i = 0; i < 120 * 4 && !(it && it.sh.phase !== 'rise'); i++) { sb.step(1 / 120); it = sb.people.find((p) => p.species && p.species.kind === 'shallow'); }
  window.__it = it;
  return {
    seen, was, gone: s.removed, name: it && it.name, scale: it && it.scale, husk: sb.items.filter((x) => x.kind === 'husk').map((x) => x.name),
    marked: it ? [...it.sh.marked].map((o) => o.name) : [], selected: ui.selected && ui.selected.name, claws: it && it.species.describeArms(it), monster: it && it.species.monster,
  };
});
check('made angry, it cracks open and tears its way out of the skin', shOut.seen.includes('shallowCrack') && shOut.seen.includes('shallowEmerge') && shOut.gone && shOut.name === 'Shallow', JSON.stringify(shOut));
check('...taller than the skin it came out of, and the skin is left lying where it stood', shOut.scale > shOut.was.scale * 1.45 && shOut.husk.includes(`${shOut.was.name}'s skin`),
  `${shOut.was.scale.toFixed(2)} -> ${shOut.scale && shOut.scale.toFixed(2)}, ${shOut.husk.join()}`);
check('...with five long black claws on each hand, and whoever made it angry on its list (the inspector goes with it)',
  shOut.claws === 'Five long black claws on each hand' && shOut.monster && shOut.marked.join() === 'Ann' && shOut.selected === 'Shallow', JSON.stringify(shOut));
await ev(() => { const c = window.__sf.cam, it = window.__it; c.follow = null; c.glide = null; c.ppm = c.homePpm * 2.2; c.x = it.wj.head.x; c.y = it.wj.chest.y; c.clamp(); window.__sf.ui.select(null); });
await page.waitForTimeout(250);
const shLook = await ev(() => {
  // what the head looks like on screen: black, with white in it (the pupils, the teeth)
  const it = window.__it, cam = window.__sf.cam, c = document.getElementById('view'), g = c.getContext('2d');
  const r = 0.155 * it.scale * cam.ppm * (c.width / cam.w);
  const p = cam.toScreen(it.wj.head.x, it.wj.head.y), k = c.width / cam.w;
  const d = g.getImageData(Math.round(p.x * k - r), Math.round(p.y * k - r), Math.round(r * 2), Math.round(r * 2)).data;
  let black = 0, white = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] < 16 && d[i + 1] < 16 && d[i + 2] < 16) black++;
    else if (d[i] > 225 && d[i + 1] > 225 && d[i + 2] > 215) white++;
  }
  return { black, white, n: d.length / 4 };
});
check('...black all over, with white pupils and a grin of white teeth in its face', shLook.black > shLook.n * 0.35 && shLook.white > 12, JSON.stringify(shLook));
await shot('shallow');

// it grabs whoever did it, and tears them in half
const shRip = await ev(() => {
  const sb = window.__sf.sb, it = window.__it, a = window.__a;
  it.sh.next = 'rip';
  let grabbed = false, held = false;
  sb.on('shallowSeize', (e) => { if (e.who === a) grabbed = true; });
  for (let i = 0; i < 120 * 14 && !(a.dead && it.sh.phase === 'after'); i++) { sb.step(1 / 120); if (a.heldBy === it) held = true; }
  return { grabbed, held, dead: a.dead, cause: a.health.cause, half: a.species && a.species.kind, legs: sb.items.filter((x) => x.kind === 'legs').map((x) => x.name) };
});
check('it goes after whoever made it angry, takes them by the neck, and tears them in half - the legs a thing of their own',
  shRip.grabbed && shRip.held && shRip.dead && shRip.cause === 'torn in half' && shRip.half === 'shallowHalf' && shRip.legs.includes("Ann's legs"), JSON.stringify(shRip));

// ...or eats them
const shEat = await ev(() => {
  const sb = window.__sf.sb, it = window.__it;
  const b = window.__b = sb.spawnStickman(it.pos.x + 2.2, null, { name: 'Bob', traits: { bravery: 0.1 } });
  for (let i = 0; i < 20; i++) sb.step(1 / 120);
  it.sh.next = 'eat';
  it.sh.marked.add(b);
  const bites = [];
  let cause = null;
  sb.on('shallowBite', (e) => bites.push(e.n));
  sb.on('death', (e) => { if (e.who === b) cause = e.cause; });
  for (let i = 0; i < 120 * 14 && !(b.removed && it.sh.phase !== 'eat'); i++) sb.step(1 / 120);
  return { bites, cause, gone: b.removed, inWorld: sb.people.includes(b), kills: it.sh.kills };
});
check('...or eats them: the head, the body, then the legs, and nothing of them is left',
  shEat.bites.join() === '1,2,3' && shEat.cause === 'eaten' && shEat.gone && !shEat.inWorld && shEat.kills === 2, JSON.stringify(shEat));

// then: the nearest person, emptied out, and it climbs inside and becomes them
const shTake = await ev(() => {
  const sb = window.__sf.sb, it = window.__it, c = window.__c, d = window.__d, ui = window.__sf.ui;
  const before = { name: c.name, scale: c.scale, hair: c.hair, voice: c.voice, traits: JSON.stringify(c.traits) };
  ui.select(it);
  const seen = [];
  for (const k of ['shallowCut', 'shallowBones', 'shallowOrgan', 'shallowEnter', 'shallowTook']) sb.on(k, (e) => seen.push(k));
  // Cy right by it, the nearest; Dee further off the other way, watching
  // (both of them rooted to the spot: this is not about the chase)
  for (const [p, x] of [[it, 0], [c, 1.4], [d, -6.5]]) { p.pos.x = x; p.vel.x = 0; p.stop(); if (p.brain) { p.brain.clearBehaviour(); p.brain.thinkT = 99; } }
  it.facing = 1;
  c.facing = 1;
  for (let i = 0; i < 120 * 25 && !(c.species && c.species.kind === 'shallowDisguise' && c.state === 'stand'); i++) { sb.step(1 / 120); d.facing = Math.sign(c.pos.x - d.pos.x) || 1; }
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  const r = d.brain.rels.get(c);
  return {
    seen: [...new Set(seen)], organs: sb.items.filter((x) => x.kind === 'organ').map((x) => x.organ), skeleton: sb.items.filter((x) => x.kind === 'skeleton').map((x) => x.name),
    before, after: { name: c.name, scale: c.scale, hair: c.hair, voice: c.voice, traits: JSON.stringify(c.traits) },
    kind: c.species && c.species.kind, state: c.state, health: c.health.overall, creature: it.removed, selected: ui.selected && ui.selected.name,
    knows: !!(r && r.shallow) && d.brain.memories.some((m) => m.kind === 'sawShallowTake' && m.about === c), fear: r ? r.fear : 0,
  };
});
check('with nobody left it is angry with, it takes the nearest person, cuts their back open and pulls out the skeleton and the organs',
  ['shallowCut', 'shallowBones', 'shallowOrgan'].every((k) => shTake.seen.includes(k)) && shTake.skeleton.includes("Cy's skeleton") &&
  ['heart', 'lungs', 'stomach', 'guts'].every((o) => shTake.organs.includes(o)), JSON.stringify({ seen: shTake.seen, organs: shTake.organs, skeleton: shTake.skeleton }));
check('...climbs inside, and gets up as them: their name, height, hair, voice and all, good as new (the inspector follows it in)',
  shTake.seen.includes('shallowTook') && shTake.creature && shTake.kind === 'shallowDisguise' && shTake.state === 'stand' && shTake.health > 0.95 &&
  JSON.stringify(shTake.before) === JSON.stringify(shTake.after) && shTake.selected === 'Cy', JSON.stringify(shTake));
check('...and whoever saw it happen knows that is not Cy any more, and is afraid of them', shTake.knows && shTake.fear > 0.5, JSON.stringify({ knows: shTake.knows, fear: shTake.fear }));
await ev(() => window.__sf.ui.select(null));
const shBlood = await ev(() => {
  const sb = window.__sf.sb, fx = sb.fx;
  const its = sb.items.filter((i) => ['husk', 'legs', 'skeleton', 'organ'].includes(i.kind) && !i.removed);
  for (let r = 0; r < 40; r++) {
    for (const it of its) { const p = it.pos; for (let k = 0; k < 10; k++) fx.drop(p.x + (Math.random() - 0.5) * 0.5, p.y + 0.8, 0, -1); }
    for (let k = 0; k < 6; k++) sb.step(1 / 120);
  }
  const out = {};
  for (const it of its) out[it.kind] = (out[it.kind] || 0) + (it.stains || []).length;
  return out;
});
check('blood lands on what it leaves lying about, too: the skin, the legs, the skeleton, the organs',
  Object.keys(shBlood).length >= 3 && Object.values(shBlood).every((n) => n > 0), JSON.stringify(shBlood));

// removing the mod takes all of it away: the thing, wherever it is, and everything it left
await ev(() => { window.__sf.ui.toggleDrawer(true); });
await page.waitForTimeout(300);
await page.tap('#btn-mods');
await page.waitForTimeout(300);
await page.tap('.mod-item[data-mod="shallow"] .mod-btn');
await page.waitForTimeout(150);
await page.tap('.mod-item[data-mod="shallow"] .mod-btn');
await page.waitForTimeout(250);
const shGone = await ev(() => ({
  people: window.__sf.sb.people.map((p) => p.name),
  items: window.__sf.sb.items.length,
  cards: document.querySelectorAll('.card').length,
  stored: JSON.parse(localStorage.getItem('sf.mods') || '[]'),
}));
check('removing Shallow takes it (in whatever skin it is wearing) and everything it left out of the world and the menu',
  shGone.people.join() === 'Dee' && !shGone.items && shGone.cards === BASE.length && !shGone.stored.includes('shallow'), JSON.stringify(shGone));
await page.tap('#mods-close');
await ev(() => window.__sf.ui.toggleDrawer(false));
await page.waitForTimeout(250);

/* --------------------------------- mayhem -------------------------------- */

await fresh();
const mayhem = await ev(() => {
  const sb = window.__sf.sb;
  for (let i = 0; i < 10; i++) sb.spawnStickman(-9 + i * 2);
  for (let i = 0; i < 6; i++) sb.spawnCrate(-8 + i * 3.2, 0.4 + (i % 2) * 2);
  for (let i = 0; i < 3; i++) sb.spawnKnuckles(-6 + i * 6, 0.1);
  for (let i = 0; i < 2; i++) sb.spawnKnife(-3 + i * 6, 0.1);
  for (let i = 0; i < 2; i++) sb.spawnMachete(-9 + i * 15, 0.1);
  sb.spawnGun(0.5, 0.1);
  for (let i = 0; i < 60; i++) sb.step(1 / 120);
  const ps = sb.people;
  for (let i = 0; i < ps.length; i += 2) { const r = ps[i].brain.rel(ps[(i + 3) % ps.length]); r.anger = 0.9; r.like = -0.6; }
  let bad = 0;
  const kinds = new Set();
  for (let i = 0; i < 120 * 45; i++) {
    sb.step(1 / 120);
    if (i % 60 === 0) {
      for (const p of sb.people) {
        for (const k of ['head', 'hip', 'footA', 'handB']) if (!Number.isFinite(p.wj[k].x) || !Number.isFinite(p.wj[k].y)) bad++;
        if (p.brain && p.brain.behaviour) kinds.add(p.brain.behaviour.kind);
      }
      for (const c of sb.crates) if (!Number.isFinite(c.pos.x) || !Number.isFinite(c.pos.y)) bad++;
    }
  }
  return { bad, kinds: [...kinds], people: sb.people.length, dead: sb.people.filter((p) => p.dead).length };
});
check('ten stickmen, six crates, knuckles, knives, machetes and a pistol for 45 seconds: nothing turns into NaN', mayhem.bad === 0);
check('...and they get up to many different things', mayhem.kinds.length >= 6, mayhem.kinds.join(', '));
await ev(() => { window.__sf.sb.paused = false; });
await page.waitForTimeout(800);
await shot('mayhem');

check('the console stays clean', errors.length === 0, errors.slice(0, 3).join(' | '));
if (FILE_MODE) check('the single file fetches nothing', network.length === 0, network.slice(0, 3).join(', '));

await browser.close();
if (server) server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
