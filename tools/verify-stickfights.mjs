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
   storage it shows, and everything the Murder Drones mod adds.

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
/** Clears the sandbox and pauses the real-time loop, so only sim() moves things. */
const fresh = () => ev(() => { const sf = window.__sf; sf.sb.clear(); sf.ui.select(null); sf.sb.paused = true; });

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
check('there are six things to spawn: a Stickman, Brass Knuckles, a Combat Knife, a Machete, a Glock-19 and a Crate',
  cards.length === 6 && ['stickman', 'knuckles', 'knife', 'machete', 'glock', 'crate'].every((k) => cards.includes(k)), cards.join(', '));
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
  const p = sb.spawnStickman(0, null, { name: 'Walker' });
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
  const d = sb.spawnStickman(0.85, null, { name: 'Dummy', scale: 1 });
  a.brain = null; d.brain = null;
  a.facing = 1; d.facing = -1;
  const k = sb.spawnKnuckles(-3, 0.1);
  const out = { bare: [], armed: [] };
  sb.on('hit', (e) => { if (e.by === a && !e.blocked) (e.armed ? out.armed : out.bare).push(e.damage); });
  const swing = (n) => {
    for (let s = 0; s < n; s++) {
      for (let i = 0; i < 90; i++) { sb.step(1 / 120); if (a.ready) break; }
      d.health.heal(); d.balance = 1; d.pos.x = 0.85; d.vel.x = 0; a.pos.x = 0; a.vel.x = 0;
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
  for (let i = 0; i < 120 * 25 && !sat; i++) {
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
    'chop', 'hack', 'macheteGuard', 'aimPistol', 'reload', 'tourniquet', 'popJoint', 'clutchStump', 'coverHead', 'retch', 'shock'];
  return { clips: Object.keys(CLIPS).length, missing: need.filter((n) => !CLIPS[n]), lines, kinds: Object.keys(LINES).length };
});
check('over a hundred hand-keyed clips: knife and machete fighting, aiming and reloading a pistol, tying a tourniquet, hugs, press-ups',
  lib.clips >= 110 && !lib.missing.length, `${lib.clips} clips${lib.missing.length ? ', missing ' + lib.missing.join(' ') : ''}`);
check('hundreds of things to say, for every situation', lib.lines >= 700 && lib.kinds >= 140, `${lib.lines} lines in ${lib.kinds} situations`);

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

/* ---------------------------------- mods --------------------------------- */

await fresh();
const modsOff = await ev(() => ({
  installed: window.__sf.mods.installedMods().map((m) => m.id),
  cards: document.querySelectorAll('.card').length,
  section: document.getElementById('drawer-mods').children.length,
}));
check('mods are not in the game until they are installed', !modsOff.installed.length && modsOff.cards === 6 && !modsOff.section, JSON.stringify(modsOff));

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
  installing.bar && !installing.yet && installed.cards.length === 9 && ['md-uzi', 'md-n', 'md-v'].every((k) => installed.cards.includes(k)) && installed.state,
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
  armedRemove === 'TAP TO REMOVE' && removed.people.join() === 'Keeper' && !removed.guns.length && removed.cards === 6 && !removed.stored.length, JSON.stringify(removed));
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
