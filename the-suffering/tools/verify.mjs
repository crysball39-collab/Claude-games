/* =============================================================================
   Plays the game in a real browser and checks, one by one, the things it is
   supposed to do. Run with: npm run verify
   ========================================================================== */
import { play } from './play.mjs';
import { openMany, TEST_ADMIN } from './harness.mjs';
import { installOV } from './overlap.mjs';
import { LINE_COUNT } from '../src/mind/lines.js';

const t = await play({ width: 1100, height: 600 });
const results = [];
let section = '';
const head = (name) => { section = name; };
const check = (name, ok, detail = '') => { results.push({ section, name, ok: !!ok, detail }); };
const ONLY = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;
const want = (name) => !ONLY || ONLY.test(name);
const run = async (fn, ...a) => t.ev(fn, ...a);

/* helpers that live in the page */
await run(() => {
  const g = window.__game, ts = window.__ts;
  window.V = {
    /** An empty stretch of road, the player facing along it. */
    stage() {
      if (ts.mp && ts.mp.on) ts.mp.leave(true);
      T.clear();
      for (const o of g.props.slice()) g.removeProp(o);
      const p = g.player;
      g.weapons.dropFrom(p, true);
      if (p.vest) p.removeVest();
      if (p.helmet) p.removeHelmet();
      if (p.cuffed) g.weapons.uncuff(p, null);
      p.tased = 0; p.dazeT = 0;
      for (const it of g.weapons.items.slice()) g.weapons.remove(it);
      g.grab?.clear();
      g.powers?.clear();
      g.ropes?.clear(); g.fire?.clear(); g.power?.clear(); g.voxels?.clear(); if (g.daylight && g.daylight.mode !== 'day') g.daylight.set('day');
      if (p.car) g.traffic.exit(p);
      g.traffic?.clearCars();
      p.h.heal(); p.reset(0, -18, Math.PI / 2);
      g.camYaw = Math.PI / 2; g.camPitch = -0.08; g.gore.clean();
      g.paused = false; g.advance(0.3);
    },
    give(type) { const p = g.player; const it = g.weapons.spawn(type, p.x + 0.3, 1, p.z); g.advance(0.3); g.weapons.pickUp(it); g.advance(0.3); return it; },
    aimAt(b) { const a = g.aim; const dx = b.px - a.ox, dy = b.py - a.oy, dz = b.pz - a.oz; g.camYaw = Math.atan2(dx, dz); g.camPitch = Math.atan2(dy, Math.hypot(dx, dz)); },
    still(h) { h.brain = { update() {}, pause: 0, mode: 'wander' }; return h; },
    /** Signed in as the test admin (whose address the test pages are told is the admin's). */
    async admin() {
      const a = ts.auth;
      if (a.admin) return;
      let r = await a.signIn({ email: 'admin@test.invalid', password: 'admin-pass-1' });
      if (r.error) r = await a.signUp({ email: 'admin@test.invalid', password: 'admin-pass-1', confirm: 'admin-pass-1', name: 'Admin' });
    },
  };
});

/* the suite plays as the admin (the abilities and the cheats are the admin's); the account and admin sections sign out to check everybody else */
await run(() => V.admin());

/* ------------------------------- the page ------------------------------- */
head('Page');
if (want('Page')) {
  const r = await run(() => ({ title: document.title, hud: !document.querySelector('#hud').hidden, menu: document.querySelector('#menu').hidden }));
  check('is called The Suffering', /the suffering/i.test(r.title), r.title);
  check('PLAY starts the game', r.hud && r.menu);
}

/* ------------------------------- controls ------------------------------- */
head('Controls');
if (want('Controls')) {
  const r = await run(() => {
    const vis = (s) => { const e = document.querySelector(s); if (!e) return false; const b = e.getBoundingClientRect(); return b.width > 20 && b.height > 20 && getComputedStyle(e).visibility !== 'hidden'; };
    return { stick: vis('#stick-base'), crouch: vis('#btn-crouch'), jump: vis('#btn-jump'), attack: vis('#btn-attack') };
  });
  check('joystick on screen', r.stick);
  check('crouch button on screen', r.crouch);
  check('jump button on screen', r.jump);
  check('attack button on screen', r.attack);

  // the joystick itself, dragged with a real pointer
  const box = await run(() => { const b = document.querySelector('#stick-base').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, r: b.width / 2 }; });
  await run(() => { V.stage(); window.__x0 = __game.player.x; __game.paused = false; });
  await t.page.mouse.move(box.x, box.y);
  await t.page.mouse.down();
  await t.page.mouse.move(box.x, box.y - box.r * 0.9, { steps: 4 });
  const mv = await run(() => { const g = __game, m = { ...__ts.input.move }; g.advance(1.5); return { m, dx: g.player.x - window.__x0, speed: g.player.speed }; });
  await t.page.mouse.up();
  await run(() => { __game.advance(0.4); __game.paused = true; });
  check('pushing the joystick walks the player', mv.dx > 3, `moved ${mv.dx.toFixed(1)} m at ${mv.speed.toFixed(1)} m/s`);

  const j = await run(() => { const g = __game, p = g.player; V.stage(); const y0 = p.y; T.press('jump'); g.advance(0.05); T.release('jump'); let top = 0; for (let i = 0; i < 60; i++) { g.advance(1 / 60); top = Math.max(top, p.y - y0); } return top; });
  check('jump button jumps', j > 0.6, `${j.toFixed(2)} m`);
  const c = await run(() => { const g = __game, p = g.player; V.stage(); const h0 = p.bodies[4].py; T.press('crouch'); g.advance(0.05); T.release('crouch'); g.advance(0.7); const h1 = p.bodies[4].py; T.press('crouch'); g.advance(0.05); T.release('crouch'); g.advance(0.7); return { h0, h1, h2: p.bodies[4].py }; });
  check('crouch button crouches and stands again', c.h0 - c.h1 > 0.3 && c.h2 - c.h1 > 0.3, `head ${c.h0.toFixed(2)} -> ${c.h1.toFixed(2)} -> ${c.h2.toFixed(2)} m`);
}

/* -------------------------------- melee --------------------------------- */
head('Melee');
for (const kit of ['fists', 'knife', 'machete']) {
  if (!want('Melee')) continue;
  const r = await run((kit) => {
    const g = __game, w = g.weapons, out = [];
    for (let i = 0; i < 4; i++) {
      V.stage();
      if (kit !== 'fists') V.give(kit);
      const h = V.still(T.dummy(1.0));
      g.advance(0.4);
      const before = h.h.wounds.length, pain0 = h.h.pain;
      const name = w.def.moves[i];
      w.attack(i); g.advance(1.3);
      out.push({ name, hit: h.h.wounds.length > before || h.h.pain > pain0 + 1 || !!h.gone.some((x) => x), types: h.h.wounds.slice(before).map((x) => x.type) });
    }
    return out;
  }, kit).catch((e) => ({ error: String(e) }));
  if (r.error) { check(`${kit}: four attacks`, false, r.error); continue; }
  const names = new Set(r.map((x) => x.name));
  check(`${kit}: four different attacks`, names.size === 4, [...names].join(', '));
  check(`${kit}: every attack connects`, r.every((x) => x.hit), r.map((x) => `${x.name}:${x.hit ? 'hit' : 'MISS'}`).join(' '));
  if (kit !== 'fists') check(`${kit}: leaves cuts, slashes or stab wounds`, r.some((x) => x.types.some((ty) => ty === 'cut' || ty === 'slash' || ty === 'stab')), [...new Set(r.flatMap((x) => x.types))].join(', '));
}

/* ------------------------------- the city ------------------------------- */
head('City');
if (want('City')) {
  const r = await run(() => {
    const g = __game, city = g.city;
    V.stage();
    __ts.settings.people = 14; g.traffic.setCount(8);
    for (let i = 0; i < 14; i++) { const s = city.randomPavement(); g.spawnHuman(s.x, s.z); }
    // the traffic (not the cars parked about the city), and the people on foot (not the ones driving it)
    const traffic = g.traffic.cars.filter((c) => c.traffic && c.mode === 'rail');
    const cars0 = traffic.map((c) => [c.x, c.z]);
    const ppl = g.humans.filter((h) => !h.isPlayer && !h.car), p0 = ppl.map((h) => [h.x, h.z]);
    let onRoad = 0, jay = 0, samples = 0, carsOff = 0;
    const R = [-54, -18, 18, 54];
    const roadAt = (x, z) => R.some((r) => Math.abs(x - r) < 4.5 || Math.abs(z - r) < 4.5);
    // properly out in the carriageway (not just a foot over the kerb) and nowhere near a corner, where the crossings are
    const midBlock = (x, z) => (R.some((r) => Math.abs(x - r) < 3.9) && !R.some((r) => Math.abs(z - r) < 9)) || (R.some((r) => Math.abs(z - r) < 3.9) && !R.some((r) => Math.abs(x - r) < 9));
    for (let i = 0; i < 40; i++) {
      g.advance(0.5);
      for (const h of ppl) { if (h.removed || h.state !== 0 || h.car) continue; samples++; if (roadAt(h.x, h.z)) onRoad++; if (midBlock(h.x, h.z)) jay++; }
      for (const c of traffic) if (!roadAt(c.x, c.z)) carsOff++;
    }
    const carMoved = traffic.map((c, i) => Math.hypot(c.x - cars0[i][0], c.z - cars0[i][1]));
    const walked = ppl.map((h, i) => Math.hypot(h.x - p0[i][0], h.z - p0[i][1]));
    carMoved.sort((a, b) => a - b);
    return { cars: traffic.length, drivers: traffic.filter((c) => c.seats[0]).length, carMoved: carMoved[carMoved.length >> 1], slowest: carMoved[0], carsOff, walkers: walked.filter((d) => d > 3).length, people: ppl.length, pavement: 1 - onRoad / Math.max(1, samples), jay: jay / Math.max(1, samples), upright: ppl.filter((h) => h.state === 0).length };
  });
  check('cars drive down the streets, somebody at every wheel', r.cars >= 6 && r.drivers === r.cars && r.carMoved > 40 && r.slowest > 2 && r.carsOff === 0, `${r.cars} cars, ${r.drivers} with drivers; in 20 s the typical one covered ${r.carMoved.toFixed(0)} m and the slowest (held up at a crossing) ${r.slowest.toFixed(0)} m; never off the road`);
  check('people walk on the pavements', r.walkers >= r.people * 0.6 && r.pavement > 0.6 && r.jay < 0.03, `${r.walkers}/${r.people} walked more than 3 m; ${(r.pavement * 100).toFixed(0)}% of the time on pavement, the rest on crossings at the corners; ${(r.jay * 100).toFixed(1)}% in the road mid-block`);
}

/* ------------------------------- sandbox -------------------------------- */
head('Sandbox menu');
if (want('Sandbox menu')) {
  await run(() => { V.stage(); __game.paused = false; });
  await t.page.click('#btn-menu');
  const open = await run(() => !document.querySelector('#sandbox').hidden);
  check('the menu opens', open);
  const before = await run(() => ({ p: __game.humans.length, c: __game.props.filter((o) => o.kind === 'crate').length, w: __game.weapons.items.map((i) => i.type) }));
  for (const what of ['human', 'crate', 'm1911', 'ak47', 'knife', 'machete']) await t.page.click(`[data-spawn="${what}"]`);
  const after = await run(() => ({ p: __game.humans.length, c: __game.props.filter((o) => o.kind === 'crate').length, w: __game.weapons.items.map((i) => i.type) }));
  check('spawns a human', after.p === before.p + 1);
  check('spawns a crate', after.c === before.c + 1);
  for (const [type, name] of [['m1911', 'M1911'], ['ak47', 'AK-47'], ['knife', 'knife'], ['machete', 'machete']]) check(`spawns the ${name}`, after.w.filter((x) => x === type).length === before.w.filter((x) => x === type).length + 1);
  await t.page.click('[data-close="sandbox"]');
  await run(() => { __game.paused = true; });
}

/* ------------------------------- firearms ------------------------------- */
head('Firearms');
for (const gun of ['m1911', 'ak47']) {
  if (!want('Firearms')) continue;
  const r = await run((gun) => {
    const g = __game, w = g.weapons;
    V.stage();
    const it = V.give(gun);
    // a wall to put holes in, and then a person
    let holes = 0; const orig = g.gore.hole.bind(g.gore); g.gore.hole = (...a) => { holes++; return orig(...a); };
    g.camYaw = 0; g.camPitch = 0.02; g.advance(0.2);
    const a0 = it.ammo;
    for (let i = 0; i < 3; i++) { w.fire(); g.advance(0.3); }
    const used = a0 - it.ammo;
    g.gore.hole = orig;
    g.camYaw = Math.PI / 2; g.advance(0.2);
    const h = V.still(T.dummy(4));
    g.advance(0.3);
    for (let i = 0; i < 3; i++) { V.aimAt(h.bodies[2]); g.advance(0.05); }
    w.fire(); g.advance(0.6);
    const shot = h.h.wounds.filter((x) => x.type === 'gunshot').length;
    w.reload(); g.advance(3.2);
    return { mag: it.def.mag, used, holes, shot, reloaded: it.ammo };
  }, gun);
  const name = gun === 'm1911' ? 'M1911' : 'AK-47';
  check(`${name} fires and uses ammunition`, r.used === 3, `${r.used} rounds from a magazine of ${r.mag}`);
  check(`${name} leaves bullet holes`, r.holes >= 3, `${r.holes} holes`);
  check(`${name} wounds a person`, r.shot >= 1, `${r.shot} gunshot wound(s)`);
  check(`${name} reloads`, r.reloaded === r.mag);
}

/* --------------------------- ragdolls, stumbling ------------------------ */
head('Ragdolls and stumbling');
if (want('Ragdolls and stumbling')) {
  const r = await run(() => {
    const g = __game;
    V.stage();
    const a = V.still(T.dummy(3));
    g.advance(0.3);
    a.react(40, 1, 0, null);
    const s0 = T.state(a); let moved = 0; const x0 = a.x;
    for (let i = 0; i < 80 && a.state === 1; i++) { g.advance(0.05); }
    moved = Math.hypot(a.x - x0, 0);
    const s1 = T.state(a);
    const b = T.dummy(3, 2);
    g.advance(0.3);
    b.react(120, 1, 0, null);
    const s2 = T.state(b);
    g.advance(1.5);
    const low = b.bodies[2].py - b.y;
    let up = -1;
    for (let i = 0; i < 200; i++) { g.advance(0.05); if (b.state === 0) { up = i * 0.05 + 1.5; break; } }
    return { s0, s1, moved, s2, low, up, joints: b.joints.length, parts: b.bodies.length };
  });
  check('a hard shove makes someone stumble and catch themselves', r.s0 === 'STUMBLE' && r.s1 === 'ANIM', `${r.s0} -> ${r.s1} after staggering ${r.moved.toFixed(1)} m`);
  check('a harder one drops them as a ragdoll', r.s2 === 'RAGDOLL' && r.low < 0.8, `${r.parts} bodies on ${r.joints} joints, chest ${r.low.toFixed(2)} m off the ground`);
  check('they get up again', r.up > 0, r.up > 0 ? `after ${r.up.toFixed(1)} s` : 'still down after 11 s');
}

/* ------------------------------ doctor mode ----------------------------- */
head('Doctor mode');
if (want('Doctor mode')) {
  await run(() => { const g = __game; V.stage(); const h = V.still(T.dummy(3)); window.PT = h; g.advance(1.2); g.paused = false; });
  await t.page.click('#btn-doctor');
  await t.page.waitForTimeout(500);
  // where they are on the screen now that the camera has settled and a frame has been drawn
  const pos = await run(() => { const h = window.PT, o = []; __game.toScreen(h.bodies[2].px, h.bodies[2].py, h.bodies[2].pz, o); return { x: o[0], y: o[1] }; });
  await t.page.mouse.click(pos.x, pos.y);
  await t.page.waitForFunction(() => { const e = document.querySelector('#doc-cond-label'); return e && e.textContent.trim().length > 2; }, { timeout: 8000 }).catch(() => {});
  const r = await run(() => {
    const txt = (s) => (document.querySelector(s) || {}).textContent || '';
    return { picked: __game.selected === window.PT, name: txt('#doc-name'), cond: txt('#doc-cond-label'), vitals: (txt('#doc-vitals') + txt('#doc-state')).toUpperCase(), emo: txt('#doc-emotions').toUpperCase() };
  });
  check('tapping a person selects them', r.picked, r.name);
  check('shows their condition', r.cond.length > 2, r.cond);
  for (const k of ['AIR', 'NAUSEA', 'TEMP', 'SHOCK', 'PAIN', 'BLOOD']) check(`shows ${k.toLowerCase()}`, r.vitals.includes(k));
  for (const k of ['FEAR', 'ANGER', 'SADNESS', 'JOY', 'SURPRISE', 'BOREDOM']) check(`shows ${k.toLowerCase()}`, r.emo.includes(k));

  await t.page.click('[data-tab="xray"]');
  // the plate is redrawn a few times a second: give it time for one (reading it back repeatedly would only make the browser complain)
  await t.page.waitForTimeout(1200);
  const x0 = await run(() => { const c = document.querySelector('#doc-xray'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 0; i < d.length; i += 16) if (d[i] + d[i + 1] + d[i + 2] > 240) lit++; return { lit, w: c.width, h: c.height, legend: document.querySelector('#doc-legend').textContent }; });
  check('the X-ray draws a skeleton and organs', x0.lit > 800, `${x0.lit} lit samples on a ${x0.w}x${x0.h} plate`);
  // break a bone and puncture an organ, then look again
  const dmg = await run(() => {
    const g = __game, h = window.PT, pl = g.player;
    const arm = h.bodies[8]; h.hit({ part: 8, type: 'blunt', power: 2.6, point: [arm.px, arm.py, arm.pz], dir: [-1, 0, 0], normal: [1, 0, 0], impulse: 4, attacker: pl, weapon: 'fists' });
    // three rounds across the chest: whatever their build, one of them finds a lung or the heart
    const c = h.bodies[2]; for (const dz of [-0.08, 0, 0.08]) h.hit({ part: 2, type: 'bullet', power: 1, point: [c.px + 0.1, c.py + 0.04, c.pz + dz], dir: [-1, 0, 0], normal: [1, 0, 0], impulse: 2, attacker: pl, weapon: 'm1911', through: true });
    g.advance(1);
    const bones = Object.keys(h.h.bones).filter((k) => h.h.boneState(k) !== 'intact');
    const organs = Object.keys(h.h.organs).filter((k) => h.h.organs[k] < 100);
    return { bones, organs };
  });
  await t.page.waitForTimeout(300);
  const f = await run(() => document.querySelector('#doc-findings').textContent);
  check('bones can be damaged', dmg.bones.length > 0, dmg.bones.join(', '));
  check('organs can be damaged', dmg.organs.length > 0, dmg.organs.join(', '));
  check('the X-ray reports the damage', f.length > 10, f.slice(0, 110));
  await t.page.click('[data-close="doctor"]');
  await run(() => { __game.paused = true; });
}

/* --------------------------------- gore --------------------------------- */
head('Wounds and blood');
if (want('Wounds and blood')) {
  const r = await run(() => {
    const g = __game, out = {};
    V.stage(); V.give('machete');
    // an arm off at the elbow
    const a = V.still(T.dummy(1.2));
    g.advance(0.3);
    const s0 = { ...g.gore.stats }, blood0 = a.h.blood;
    a.sever(9, [1, 2, 0]);
    let streams = 0;
    for (let i = 0; i < 60; i++) { g.advance(0.05); streams = Math.max(streams, g.gore.stats.streams); }
    out.amputated = !a.attached[9] && !a.attached[10] && a.attached[8];
    out.piece = g.pieces.length;
    out.bleed = a.h.bleedOut; out.lost = blood0 - a.h.blood;
    out.emitted = g.gore.stats.emitted - s0.emitted; out.parted = g.gore.stats.parted - s0.parted; out.landed = g.gore.stats.landed - s0.landed;
    out.streams = streams; out.pools = g.gore.pools.length;
    // a head off
    const b = V.still(T.dummy(1.2, 2));
    g.advance(0.3);
    b.sever(4, [0, 3, 1]);
    g.advance(0.5);
    out.decap = !b.attached[4] && !b.h.alive; out.cause = b.h.cause;
    // a leg hit until it comes apart
    const c = V.still(T.dummy(3, -2));
    g.advance(0.3);
    let burst = false, shots = 0; const gibs0 = g.gore.gibCount ? g.gore.gibCount() : 0;
    const leg = c.bodies[12];
    for (; shots < 14 && !c.gone[12]; shots++) {
      const rep = c.hit({ part: 12, type: 'bullet', power: 1.25, point: [leg.px + 0.05, leg.py, leg.pz], dir: [-1, 0, 0], normal: [1, 0, 0], impulse: 2, attacker: g.player, weapon: 'ak47', hp: 34 });
      if (rep && rep.burst) burst = true;
      g.advance(0.1);
    }
    out.burst = burst || c.gone[12]; out.shots = shots;
    return out;
  });
  check('amputation: a limb comes off and lies where it fell', r.amputated && r.piece >= 1, `${r.piece} severed piece(s) on the ground`);
  check('the stump bleeds', r.bleed > 5 && r.lost > 50, `${r.bleed.toFixed(0)} ml/s, ${r.lost.toFixed(0)} ml lost in 3 s`);
  check('blood leaves in streams', r.streams > 0 && r.emitted > 40, `${r.emitted} drops emitted, up to ${r.streams} linked into streams at once`);
  check('streams part into single drops', r.parted > 5, `${r.parted} links broke`);
  check('blood lands and pools', r.landed > 10 && r.pools > 0, `${r.landed} drops landed, ${r.pools} pool(s)`);
  check('decapitation', r.decap, r.cause);
  check('a limb explodes when it takes enough damage', r.burst, `after ${r.shots} rifle rounds`);
}

/* ---------------------------- seeing, hearing --------------------------- */
head('Senses');
if (want('Senses')) {
  const r = await run(() => {
    const g = __game, p = g.player, out = {};
    V.stage();
    const f = V.still(g.spawnHuman(4, -18, -Math.PI / 2));   // facing the player
    const bk = V.still(g.spawnHuman(4, -15, Math.PI / 2));    // back turned
    const far = V.still(g.spawnHuman(60, -18, -Math.PI / 2)); // a long way off
    g.advance(1.2);
    out.front = f.mind.canSeeHuman(p) > 0; out.behind = bk.mind.canSeeHuman(p) > 0;
    out.sees = f.mind.sees.map((s) => s.text).join('; ');
    // a crate between them hides the player (they are crouched behind it)
    V.give('m1911');
    g.camYaw = 0; g.camPitch = 0.6; g.advance(0.1);
    g.weapons.fire(); g.advance(0.6);
    const heard = (h) => h.mind.memory.filter((m) => m.sense === 'heard').map((m) => m.text);
    out.nearHeard = heard(bk).join(' | '); out.farHeard = heard(far).join(' | ');
    out.deaf = bk.mind.deaf;
    out.turnedFear = bk.mind.emo.fear;
    // touch: a punch from behind, by someone they never saw
    const v = V.still(g.spawnHuman(-6, -18, -Math.PI / 2));
    g.advance(0.5);
    const c = v.bodies[2];
    v.hit({ part: 2, type: 'blunt', power: 0.8, point: [c.px, c.py, c.pz], dir: [-1, 0, 0], normal: [1, 0, 0], impulse: 5, attacker: p, weapon: 'fists' });
    g.advance(1.2);
    out.felt = v.mind.memory.filter((m) => m.sense === 'felt').map((m) => m.text).join(' | ');
    out.feels = v.mind.feels.join('; ');
    return out;
  });
  check('someone facing you sees you', r.front, r.sees);
  check('someone with their back turned does not', !r.behind);
  check('a gunshot is heard nearby', /shot|gun|bang/i.test(r.nearHeard), r.nearHeard.slice(0, 120));
  check('and heard differently from far away', r.farHeard.length > 0 && r.farHeard !== r.nearHeard, r.farHeard.slice(0, 120));
  check('a close gunshot leaves ears ringing and a fright', r.deaf > 0 && r.turnedFear > 20, `deafened ${r.deaf.toFixed(0)}, fear ${r.turnedFear.toFixed(0)}`);
  check('a blow is felt, and they know what they did not see', /blow|hit/i.test(r.felt), r.felt.slice(0, 140));
}

/* --------------------------------- speech ------------------------------- */
head('Speech');
if (want('Speech')) {
  const r = await run(async () => {
    const g = __game, v = __ts.voices, out = {};
    V.stage();
    const said = []; const orig = g.speech.say.bind(g.speech);
    g.speech.say = (h, text, o) => { if (!h.isPlayer) said.push({ text, ai: !!(o && o.ai) }); return orig(h, text, o); };
    const h = g.spawnHuman(2.2, -18, -Math.PI / 2); h.brain.pause = 60;
    g.advance(1);
    g.speech.playerSay('What is your name?'); g.advance(3.5);
    out.scripted = said.map((s) => s.text).join(' / ');
    out.heardYou = h.mind.memory.some((m) => /What is your name/.test(m.text));
    // with Claude connected, the answer comes from Claude instead
    said.length = 0;
    let prompt = '';
    v.sample = { json: async (p) => { prompt = p; const ids = [...p.matchAll(/#(\d+):/g)].map((m) => Number(m[1])); return { lines: ids.map((id) => ({ id, say: 'My cat is called Admiral Biscuit.', shout: false })) }; } };
    const idle0 = v.calls; g.advance(5); out.idleCalls = v.calls - idle0;
    g.speech.playerSay('Tell me something nobody scripted');
    for (let i = 0; i < 30; i++) { g.advance(0.1); await new Promise((r) => setTimeout(r, 5)); }
    out.ai = said.filter((s) => s.ai).map((s) => s.text).join(' / ');
    out.promptHas = /Sees:/.test(prompt) && /Emotions:/.test(prompt) && /Recently/.test(prompt) && /Tell me something nobody scripted/.test(prompt);
    v.sample = null; g.speech.say = orig;
    return out;
  });
  check('a good stock of scripted lines', LINE_COUNT >= 300, `${LINE_COUNT} lines`);
  check('people hear what you say and answer', r.heardYou && r.scripted.length > 0, r.scripted);
  check('connected to Claude, they can say anything', /Admiral Biscuit/.test(r.ai), r.ai);
  check('Claude is told what they see, feel and remember', r.promptHas);
  check('Claude is never called unless you speak or ask', r.idleCalls === 0, `${r.idleCalls} calls in 5 quiet seconds`);
}

/* ------------------------ people crouch and jump ------------------------ */
head('People');
if (want('People')) {
  const r = await run(() => {
    const g = __game, out = {};
    V.stage();
    const h = g.spawnHuman(3, -18, 0);
    let mode = 'stand';
    h.brain = { update() { h.intent.mx = 0; h.intent.mz = 0; h.intent.crouch = mode === 'crouch'; if (mode === 'jump') { h.intent.jump = true; mode = 'stand'; } }, pause: 0, mode: 'wander' };
    g.advance(0.6);
    const head0 = h.bodies[4].py;
    mode = 'crouch'; g.advance(0.8);
    out.crouch = head0 - h.bodies[4].py;
    mode = 'stand'; g.advance(0.8);
    const y0 = h.y; mode = 'jump'; let top = 0;
    for (let i = 0; i < 60; i++) { g.advance(1 / 60); top = Math.max(top, h.y - y0); }
    out.jump = top;
    // and of their own accord: a shot close by
    g.removeHuman(h);
    let ducked = 0, jumped = 0, n = 10;
    const crowd = [];
    for (let i = 0; i < n; i++) crowd.push(g.spawnHuman(4 + (i % 5) * 1.6, -19 + Math.floor(i / 5) * 2.2, -Math.PI / 2));
    g.advance(1);
    V.give('m1911'); g.camYaw = 0; g.camPitch = 0.6; g.advance(0.1);
    g.weapons.fire();
    const seenDuck = new Set(), seenJump = new Set();
    for (let i = 0; i < 60; i++) { g.advance(0.05); for (const c of crowd) { if (c.crouching) seenDuck.add(c.id); if (!c.grounded && c.state === 0 && c.vy > 1) seenJump.add(c.id); } }
    out.ducked = seenDuck.size; out.jumped = seenJump.size; out.n = n;
    out.modes = crowd.map((c) => c.brain.mode).join(',');
    return out;
  });
  check('a person can crouch', r.crouch > 0.3, `head drops ${r.crouch.toFixed(2)} m`);
  check('a person can jump', r.jump > 0.5, `${r.jump.toFixed(2)} m`);
  check('they duck or jump on their own when a shot goes off', r.ducked + r.jumped > 0, `${r.ducked} ducked, ${r.jumped} jumped out of ${r.n} (${r.modes})`);
}

/* --------------------------------- hands -------------------------------- */
head('Fingers');
if (want('Fingers')) {
  const r = await run(() => {
    const g = __game, out = {};
    V.stage();
    let pose = 'rest';
    const h = g.spawnHuman(3, -18, 0);
    h.brain = { update() { h.pose.handsUp = pose === 'up' ? 1 : 0; if (pose === 'fist') h.guardT = 1; }, pause: 0, mode: 'wander' };
    // how far the tip of the index finger is from the middle of the palm, and which way the two segments point
    const tip = () => { const m = g.boxes.m, a = h.fingers[1][0] * 16, b = h.fingers[1][1] * 16, hand = h.bodies[10];
      return { reach: Math.hypot(m[b + 12] - hand.px, m[b + 13] - hand.py, m[b + 14] - hand.pz), bend: Math.acos(Math.max(-1, Math.min(1, (m[a + 4] * m[b + 4] + m[a + 5] * m[b + 5] + m[a + 6] * m[b + 6]) / (Math.hypot(m[a + 4], m[a + 5], m[a + 6]) * Math.hypot(m[b + 4], m[b + 5], m[b + 6]))))) }; };
    g.advance(1); out.rest = { curl: h.curl[1], ...tip() };
    pose = 'fist'; g.advance(1); out.fist = { curl: h.curl[1], ...tip() };
    pose = 'up'; g.advance(1.2); out.up = { curl: h.curl[1], splay: h.splay[1], ...tip() };
    out.boxes = h.fingers[0].length + h.fingers[1].length;
    out.drawn = h.fingers[0].concat(h.fingers[1]).every((i) => g.boxes.m[i * 16 + 15] === 1);
    V.give('m1911'); g.advance(0.6);
    out.grip = { curl: g.player.curl[1], trigger: g.player.trigger };
    return out;
  });
  check('each hand has four fingers and a thumb, in two parts each', r.boxes === 20 && r.drawn, `${r.boxes} segments drawn`);
  check('the segments turn at their joints', r.fist.bend > 1.0 && r.up.bend < 0.3, `second joint bent ${r.fist.bend.toFixed(2)} rad in a fist, ${r.up.bend.toFixed(2)} rad with the hand open`);
  check('fingers close into a fist and open for raised hands', r.fist.curl > 0.9 && r.up.curl < 0.15 && r.fist.reach < r.up.reach - 0.02, `fingertip ${(r.up.reach * 100).toFixed(1)} cm from the palm open, ${(r.fist.reach * 100).toFixed(1)} cm closed; at rest ${(r.rest.reach * 100).toFixed(1)} cm`);
  check('a hand closes round a grip, trigger finger apart', r.grip.curl > 0.9 && r.grip.trigger < 0.7, `grip ${r.grip.curl.toFixed(2)}, trigger finger ${r.grip.trigger.toFixed(2)}`);
}

/* -------------------------------- holsters ------------------------------ */
head('Holstering');
if (want('Holstering')) {
  await run(() => { const g = __game; V.stage(); g.weapons.give(g.player, 'm1911'); g.weapons.give(g.player, 'ak47'); g.advance(0.5); g.paused = false; });
  const a = await run(() => { const g = __game, p = g.player, w = g.weapons, it = w.inventory[0], ak = w.inventory[1], hip = p.bodies[0], chest = p.bodies[2], v = [0, 0, 0];
    chest.toLocal(ak.px, ak.py, ak.pz, v);
    return { hand: p.weapon ? p.weapon.type : null, shown: it.shown && ak.shown, hipDist: Math.hypot(it.px - hip.px, it.py - hip.py, it.pz - hip.pz), behind: v[2], btn: !document.querySelector('#btn-holster').hidden, label: document.querySelector('#holster-label').textContent }; });
  check('a pistol not in the hand rides on the hip', a.hand === null && a.shown && a.hipDist < 0.3, `${(a.hipDist * 100).toFixed(0)} cm from the middle of the hips`);
  check('a rifle not in the hand is slung across the back', a.behind < -0.1, `${(-a.behind * 100).toFixed(0)} cm behind the chest`);
  check('the HOLSTER button offers to draw', a.btn && a.label === 'DRAW', a.label);
  await t.page.keyboard.press('KeyH');
  await run(() => { __game.paused = true; });
  const b = await run(() => { const g = __game, p = g.player; g.paused = false; g.advance(0.15); const mid = { swap: !!p.swap, reach: p.anim.reachW, hand: p.weapon ? p.weapon.type : null }; g.advance(0.9); g.paused = true;
    return { mid, hand: p.weapon ? p.weapon.type : null, label: document.querySelector('#holster-label').textContent, hold: p.hold }; });
  check('H reaches for it', b.mid.swap && b.mid.reach > 0.2 && b.mid.hand === null, `arm ${(b.mid.reach * 100).toFixed(0)}% of the way to the holster, hand still empty`);
  check('and it comes out into the hand', b.hand !== null && b.label === 'HOLSTER', `${b.hand} in hand, held as ${b.hold}`);
  const c = await run(() => { const g = __game, p = g.player, w = g.weapons; g.paused = false; const fired0 = w.equipped.ammo; w.holster(); g.advance(0.1); const blocked = !w.fire(); g.advance(1); const out = { hand: p.weapon ? p.weapon.type : null, blocked, ammo: w.inventory.map((i) => i.ammo), fired0 }; g.paused = true; return out; });
  check('HOLSTER puts it away again, and nothing fires on the way', c.hand === null && c.blocked);
}

/* --------------------------------- reload ------------------------------- */
head('Reloading');
for (const gun of ['m1911', 'ak47']) {
  if (!want('Reloading')) continue;
  const r = await run((gun) => {
    const g = __game, p = g.player, w = g.weapons, out = { stages: [] };
    V.stage(); V.give(gun); g.camYaw = 0; g.camPitch = 0.3; g.advance(0.3);
    const it = w.equipped;
    for (let i = 0; i < 3; i++) { w.fire(); g.advance(gun === 'ak47' ? 0.12 : 0.3); }
    out.before = it.ammo;
    const handL = p.bodies[7], hip = p.bodies[0];
    const rest = Math.hypot(handL.px - hip.px, handL.py - hip.py, handL.pz - hip.pz);
    w.reload(); out.started = !!p.reload;
    let sawOut = false, sawFull = false, sawSlide = false, minBelt = 9, canFire = false, mags0 = w.casings.filter((c) => c.size).length, tilt = 0, hidden = false;
    const dur = it.def.reload;
    for (let t = 0; t < dur + 0.4; t += 1 / 30) {
      g.advance(1 / 30);
      if (it.magOut) { sawOut = true; hidden = hidden || it.def.boxes.some((b, i) => b[9] && g.boxes.m[it.inst[i] * 16 + 15] === 0); }
      if (p.handFull > 0.5) sawFull = true;
      if (it.slide > 0.3) sawSlide = true;
      if (p.reload) { minBelt = Math.min(minBelt, Math.hypot(handL.px - hip.px, handL.py - hip.py, handL.pz - hip.pz)); tilt = Math.max(tilt, p.anim.reloadW); if (w.fire()) canFire = true; }
    }
    out.after = it.ammo; out.mag = it.def.mag; out.done = !p.reload;
    Object.assign(out, { sawOut, sawFull, sawSlide, minBelt, rest, canFire, tilt, hidden, mags: w.casings.filter((c) => c.size).length - mags0 });
    return out;
  }, gun);
  const name = gun === 'm1911' ? 'M1911' : 'AK-47';
  check(`${name}: the empty magazine comes out and falls`, r.started && r.sawOut && r.hidden && r.mags === 1, `${r.mags} magazine on the ground`);
  check(`${name}: the left hand goes to the belt and comes back with a full one`, r.sawFull && r.minBelt < 0.34, `hand within ${(r.minBelt * 100).toFixed(0)} cm of the hip`);
  check(`${name}: the action is worked and the gun is full`, r.sawSlide && r.done && r.after === r.mag && r.before < r.mag, `${r.before} -> ${r.after} rounds`);
  check(`${name}: it cannot be fired half way through`, !r.canFire && r.tilt > 0.9);
}

/* ---------------------------------- vest -------------------------------- */
head('Light vest');
if (want('Light vest')) {
  await run(() => { V.stage(); __game.paused = false; });
  await t.page.click('#btn-menu');
  await t.page.click('[data-spawn="vest"]');
  await t.page.click('[data-close="sandbox"]');
  const r = await run(() => {
    const g = __game, p = g.player, w = g.weapons, out = {};
    g.advance(1.5);
    const it = w.items.find((i) => i.type === 'vest');
    out.spawned = !!it;
    if (it) { p.reset(it.body.px - 0.5, it.body.pz, Math.PI / 2); g.advance(0.4); out.label = document.querySelector('#use-label').textContent; out.put = w.pickUp(); g.advance(0.3); }
    out.worn = !!p.vest;
    out.parts = p.vest ? [...new Set(p.vest.boxes.map((b) => b.part))].sort().join(',') : '';
    out.black = p.vest ? p.vest.boxes.slice(0, 2).every((b) => g.boxes.c[b.idx * 3] < 0.03 && g.boxes.c[b.idx * 3 + 1] < 0.03 && g.boxes.c[b.idx * 3 + 2] < 0.03) : false;
    out.covers = p.vest ? p.vest.boxes[0].z[0] > p.sizes[2][0] && p.vest.boxes[1].z[0] > p.sizes[1][0] : false;
    out.chip = [...document.querySelectorAll('#weapon-bar .slot')].some((b) => b.textContent === 'VEST');
    const mk = (z, vest) => { const h = V.still(g.spawnHuman(p.x + 4, p.z + z, -Math.PI / 2)); if (vest) h.wearVest(); return h; };
    const A = mk(-1, true), B = mk(1, false);
    g.advance(0.3);
    const shoot = (h, part, weapon = 'm1911') => { const c = h.bodies[part]; return h.hit({ part, type: 'bullet', power: weapon === 'ak47' ? 1.4 : 1, point: [c.px - c.hx, c.py, c.pz], dir: [1, 0, 0], normal: [-1, 0, 0], impulse: 6, attacker: p, weapon, rifle: weapon !== 'm1911', through: 0.2, hp: 32 }); };
    const a1 = shoot(A, 2), a2 = shoot(A, 1), b1 = shoot(B, 2);
    g.advance(0.5);
    out.vested = { wounds: A.h.wounds.map((x) => x.type).join(','), bleed: A.h.bleedOut, stopped: a1.stopped && a2.stopped };
    out.bare = { wounds: B.h.wounds.map((x) => x.type).join(','), bleed: B.h.bleedOut };
    const a3 = shoot(A, 4);
    out.head = A.h.wounds.some((x) => x.type === 'gunshot');
    const C = mk(3, true); g.advance(0.2);
    out.rifle = shoot(C, 2, 'ak47').stopped === false && C.h.wounds.some((x) => x.type === 'gunshot');
    w.shedVest(); g.advance(0.8);
    out.off = !p.vest && w.items.some((i) => i.type === 'vest' && i.body);
    return out;
  });
  check('it is in the spawn menu and can be put on', r.spawned && r.put && r.worn && r.label === 'PUT ON', r.label);
  check('black, over the chest and the belly', r.black && r.parts === '1,2' && r.covers, 'covers parts ' + r.parts + ' (belly, chest)');
  check('it stops a pistol round: a bruise, no bleeding', r.vested.stopped && !/gunshot/.test(r.vested.wounds) && r.vested.bleed === 0, `vested: ${r.vested.wounds}; the same shot without one: ${r.bare.wounds}, bleeding ${r.bare.bleed.toFixed(1)} ml/s`);
  check('it does not protect what it does not cover, and a rifle round goes through', r.head && r.rifle);
  check('it comes off again', r.chip && r.off);
}

/* ------------------------------ blood, again ---------------------------- */
head('Splatter and puddles');
if (want('Splatter and puddles')) {
  const r = await run(() => {
    const g = __game, p = g.player, G = g.gore, w = g.weapons, out = {};
    V.stage();
    const gy = g.world.ground(4, -18);
    const drip = (x, z, n) => { for (let i = 0; i < n; i++) G._spawn(x + (Math.random() - 0.5) * 0.05, gy + 0.4, z + (Math.random() - 0.5) * 0.05, 0, 0, 0, 6); };
    const overlaps = () => { const b = G.pools; let n = 0; for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) if (Math.abs(b[i].y - b[j].y) < 0.06 && Math.hypot(b[i].tx - b[j].tx, b[i].tz - b[j].tz) < (b[i].tr + b[j].tr) * 0.84) n++; return n; };
    // two wounds dripping half a metre apart: two puddles to begin with
    for (let k = 0; k < 6; k++) { drip(4, -18.3, 2); drip(4, -17.7, 2); g.advance(0.1); }
    g.advance(0.8);
    out.first = { pools: G.pools.filter((q) => q.big || q.vol > 20).length, merged: G.stats.merged };
    for (let k = 0; k < 50; k++) { drip(4, -18.3, 3); drip(4, -17.7, 3); g.advance(0.1); }
    g.advance(1.5);
    out.then = { pools: G.pools.filter((q) => q.big).length, merged: G.stats.merged, overlaps: overlaps(), r: Math.max(...G.pools.map((q) => q.r)), vol: Math.round(G.pools.reduce((a, q) => a + q.vol, 0)) };
    // a blade, a victim, and somebody standing where the blood goes
    G.clean(); w.give(p, 'machete', true); g.advance(0.3);
    const v = V.still(T.dummy(1.1)); g.advance(0.3);
    const s0 = { ...G.stats }, blade = p.weapon;
    for (let i = 0; i < 2; i++) { w.attack(i); g.advance(1.0); }
    g.advance(1.5);
    out.blade = { marks: G.bDecals.filter((d) => d.body.item === blade).length, bloody: blade.bloody };
    out.attacker = G.bDecals.filter((d) => d.human === p).length;
    out.satellites = G.stats.satellites - s0.satellites;
    const by = V.still(g.spawnHuman(p.x + 3, p.z + 3, 0)); g.advance(0.3);
    const c = by.bodies[2], on0 = G.stats.onPeople;
    G.burst(c.px - 1.0, c.py + 0.1, c.pz, 1, 0.15, 0, 40, 6, 0.25); g.advance(1.2);
    out.bystander = { marks: G.bDecals.filter((d) => d.human === by).length, hits: G.stats.onPeople - on0, felt: by.mind.memory.some((m) => /blood splashed/.test(m.text)) };
    // a pistol on somebody's hip is in the way of it too
    const gun = w.give(by, 'm1911'); g.advance(0.2);
    let onGun = 0;
    for (let k = 0; k < 6 && !onGun; k++) { G.burst(gun.px - 0.5, gun.py + 0.12, gun.pz, 1, -0.1, 0, 50, 4, 0.2); g.advance(0.5); onGun = G.bDecals.filter((d) => d.body.item === gun).length; }
    out.holstered = onGun;
    return out;
  });
  check('two puddles that grow into each other become one', r.first.pools >= 2 && r.then.pools === 1 && r.then.merged > r.first.merged, `${r.first.pools} puddles, then 1 of ${r.then.vol} ml and ${r.then.r.toFixed(2)} m across after ${r.then.merged} mergers`);
  check('no puddle lies on top of another', r.then.overlaps === 0);
  check('a blade that has cut comes away bloody', r.blade.marks >= 2 && r.blade.bloody > 0.3, `${r.blade.marks} marks on the machete`);
  check('and so does whoever swung it', r.attacker > 0, `${r.attacker} marks on the attacker`);
  check('a drop that lands hard throws smaller ones', r.satellites > 0, `${r.satellites} satellite drops`);
  check('spray lands on other people, and they notice', r.bystander.marks > 0 && r.bystander.felt, `${r.bystander.marks} marks on a bystander`);
  check('and on a weapon somebody is carrying', r.holstered > 0, `${r.holstered} marks on a holstered pistol`);
}

/* --------------------------------- police ------------------------------- */
head('Police');
if (want('Police')) {
  const r = await run(() => {
    const g = __game, p = g.player, w = g.weapons, S = g.city.police, out = {};
    V.stage();
    out.station = !!S && g.city.blocks.some((b) => b.kind === 'police');
    out.staffed = g.staffStation(true);
    g.advance(2);
    const cops = () => g.humans.filter((h) => h.officer);
    out.kit = cops().map((h) => ({ vest: !!(h.vest && h.vest.police), gun: (h.kit || []).map((i) => i.type).join(','), holstered: !h.weapon, uniform: h.look.top === 0x1b2a4a, post: h.brain.post.kind, at: Math.hypot(h.x - h.brain.post.x, h.z - h.brain.post.z) }));
    out.inside = cops().some((h) => h.x > S.x0 && h.x < S.x1 && h.z > S.z0 && h.z < S.z1);
    // can you walk in?
    p.reset(S.door.x, S.door.z - 2, 0); g.camYaw = 0; g.advance(0.3); __ts.input.move.y = 1; g.advance(1.5); __ts.input.move.y = 0; g.advance(0.2);
    out.walkedIn = p.z > S.z0 + 0.5 && p.z < S.z1;
    return out;
  });
  check('there is a police station', r.station && r.walkedIn, 'with a lobby you can walk into');
  check('officers are on duty at it', r.staffed === 4 && r.kit.length === 4 && r.inside && r.kit.filter((k) => k.post !== 'beat').every((k) => k.at < 1), `${r.kit.length} officers: ${r.kit.map((k) => k.post).join(', ')}`);
  check('each has a vest and a holstered M1911', r.kit.every((k) => k.vest && k.gun.split(',').includes('m1911') && k.holstered && k.uniform));

  await run(() => { V.stage(); __game.paused = false; });
  await t.page.click('#btn-menu');
  await t.page.click('[data-spawn="officer"]');
  await t.page.click('[data-close="sandbox"]');
  const s = await run(() => { const g = __game; g.advance(0.5); const o = g.humans.filter((h) => h.officer); return { n: o.length, vest: o[0] && !!o[0].vest, gun: o[0] && (o[0].kit || []).map((i) => i.type).join(',') }; });
  check('an officer can be spawned from the menu', s.n === 1 && s.vest && s.gun.split(',').includes('m1911'));

  const e = await run(() => {
    const g = __game, p = g.player, w = g.weapons, out = {};
    V.stage(); g.staffStation(true); g.advance(1.5);
    const cops = () => g.humans.filter((h) => h.officer);
    const said = []; const orig = g.speech.say.bind(g.speech); g.speech.say = (h, text, o) => { if (h.officer) said.push(text); return orig(h, text, o); };
    let fires = 0; const nf = w.npcFire.bind(w); w.npcFire = (h, a, sk) => { const ok = nf(h, a, sk); if (ok) fires++; return ok; };
    // a gun out in front of the station, pointed at nobody
    p.reset(0, 22, Math.PI); g.camYaw = Math.PI; g.camPitch = -0.3; w.give(p, 'm1911', true); g.advance(5);
    out.challenge = { drawn: cops().filter((h) => h.weapon).length, aiming: cops().filter((h) => h.aimYaw != null).length, fires, said: said.slice(0, 2).join(' / ') };
    // put away: they hold, then stand down, and their pistols go back
    w.holster(); g.advance(30);
    out.standDown = { modes: cops().map((h) => h.brain.mode).join(','), drawn: cops().filter((h) => h.weapon).length, fires, alive: p.h.alive };
    // now shoot somebody
    said.length = 0;
    p.h.heal(); p.reset(6, 21.5, -Math.PI / 2); g.camYaw = -Math.PI / 2; g.camPitch = 0; g.advance(0.3);
    const v = V.still(g.spawnHuman(2.5, 21.5, Math.PI / 2)); w.holster(); g.advance(0.9);
    V.aimAt(v.bodies[2]); g.advance(0.1); w.fire(); g.advance(0.3); w.fire();
    let reloading = false, down = false, calm = 0;
    for (let i = 0; i < 300; i++) {
      g.advance(0.1); if (cops().some((h) => h.reload)) reloading = true; if (p.state === 2 || !p.h.alive) down = true;
      // finished with it all: back at their posts, nothing in their hands and nothing in progress, for a few seconds
      calm = cops().every((h) => h.brain.mode === 'post' && !h.weapon && !h.reload && !h.swap && !h.cuffing) ? calm + 0.1 : 0;
      if (down && i > 150 && calm >= 3) break;
    }
    out.fight = { fires, hit: p.h.wounds.length, down, reloading, said: said.slice(0, 3).join(' / '), ammo: cops().filter((h) => !(h.kit || []).some((i) => i.def.rifle)).map((h) => { const pi = (h.kit || []).find((i) => i.type === 'm1911'); return pi ? pi.ammo : -1; }).join(','), modes: cops().map((h) => h.brain.mode + (h.weapon ? '+gun' : '')).join(','), mags: w.casings.filter((c) => c.size).length };
    g.speech.say = orig; w.npcFire = nf;
    return out;
  });
  check('a weapon out in front of them: pistols drawn, orders shouted, nobody shot', e.challenge.drawn >= 3 && e.challenge.aiming >= 3 && e.challenge.fires === 0, e.challenge.said);
  check('put it away and they stand down and holster', e.standDown.drawn === 0 && e.standDown.fires === 0 && e.standDown.alive && /^post(,post)*$/.test(e.standDown.modes));
  check('shoot somebody and they shoot back', e.fight.fires > 0 && e.fight.hit > 0, `${e.fight.fires} rounds fired; "${e.fight.said}"`);
  check('they stop when you are down', e.fight.down);
  check('officers reload, with the same animation, before they holster', e.fight.reloading && e.fight.mags > 0 && e.fight.ammo.split(',').every((a) => a === '7' || a === '-1'), `magazines on the ground: ${e.fight.mags}; pistols now hold ${e.fight.ammo}`);
}

/* ---------------------------------- taser ------------------------------- */
head('Taser');
if (want('Taser')) {
  await run(() => { V.stage(); __game.paused = false; });
  await t.page.click('#btn-menu');
  await t.page.click('[data-spawn="taser"]');
  await t.page.click('[data-close="sandbox"]');
  const r = await run(() => {
    const g = __game, p = g.player, w = g.weapons, out = {};
    g.advance(1.2);
    const it = w.items.find((i) => i.type === 'taser');
    out.spawned = !!it;
    w.pickUp(it); g.advance(0.4);
    out.label = document.querySelector('#attack-label').textContent;
    p.reset(0, -18, Math.PI / 2); g.camYaw = Math.PI / 2; g.advance(0.3);
    const v = V.still(g.spawnHuman(4.5, -18, -Math.PI / 2));
    g.advance(0.4);
    for (let i = 0; i < 3; i++) { V.aimAt(v.bodies[2]); g.advance(0.05); }
    const a0 = it.ammo;
    out.fired = w.fire(); g.advance(1.2);
    const rel = () => v.bodies.map((b) => { const q = v.bodies[0]; return Math.abs(q.qx * b.qx + q.qy * b.qy + q.qz * b.qz + q.qw * b.qw); });
    const q0 = rel(); g.advance(1.0); const q1 = rel();
    out.hit = { used: a0 - it.ammo, tased: v.tased, state: T.state(v), chest: v.bodies[2].py - v.y, wire: !!(it.wire && it.wire.hit), drift: Math.max(...q0.map((x, i) => Math.abs(x - q1[i]))),
      open: v.h.wounds.filter((x) => x.type !== 'bruise').length, acted: !!w.npcAttack(v, p), pain: v.h.pain };
    g.advance(3.3);
    out.over = v.tased;
    const a1 = it.ammo;
    out.again = w.fire(); g.advance(0.3);
    out.rezap = { tased: v.tased, free: it.ammo === a1 };
    let up = -1;
    for (let i = 0; i < 220 && up < 0; i++) { g.advance(0.1); if (v.state === 0) up = i / 10; }
    out.up = up; out.alive = v.h.alive; out.felt = v.mind.memory.some((m) => m.kind === 'tased');
    // somebody too far away for the wires
    const far = V.still(g.spawnHuman(p.x + 12, p.z + 2, 0));
    g.advance(0.3);
    w._dropWire(it); it.ammo = 2; it.cool = 0; w.cool = 0;
    for (let i = 0; i < 3; i++) { V.aimAt(far.bodies[2]); g.advance(0.05); }
    w.fire(); g.advance(0.5);
    out.far = far.tased;
    it.ammo = 0; w._dropWire(it); it.cool = 0; w.cool = 0;
    w.reload(); g.advance(2.2);
    out.reloaded = it.ammo;
    w.holster(); g.advance(1);
    const l = [0, 0, 0]; p.bodies[0].toLocal(it.px, it.py, it.pz, l);
    out.holster = { hand: p.weapon ? p.weapon.type : null, side: l[0], front: l[2] };
    return out;
  });
  check('it is in the spawn menu', r.spawned && r.label === 'TASE');
  check('the probes drop a person, rigid, inside a second', r.fired && r.hit.used === 1 && r.hit.tased > 0 && r.hit.state === 'RAGDOLL' && r.hit.chest < 0.6 && r.hit.wire && r.hit.drift < 0.05,
    `chest ${r.hit.chest.toFixed(2)} m off the ground, joints moved ${r.hit.drift.toFixed(3)} in a second`);
  check('it hurts, and wounds nobody', r.hit.open === 0 && r.hit.pain > 40 && r.alive, `pain ${r.hit.pain.toFixed(0)}, no wound beyond bruises from the fall`);
  check('they can do nothing for the five seconds it lasts', !r.hit.acted && r.over === 0);
  check('the trigger sends another cycle down the wires, with no new cartridge', r.again && r.rezap.tased > 3 && r.rezap.free);
  check('they get up again afterwards, and remember it', r.up >= 0 && r.felt, `on their feet ${r.up.toFixed(1)} s after the second cycle began`);
  check('it does not reach past its wires', r.far === 0);
  check('it reloads, and holsters at the front of the left hip', r.reloaded === 2 && r.holster.hand === null && r.holster.side > 0.05 && r.holster.front > 0.05);
}

/* -------------------------------- handcuffs ----------------------------- */
head('Handcuffs');
if (want('Handcuffs')) {
  await run(() => { V.stage(); __game.paused = false; });
  await t.page.click('#btn-menu');
  await t.page.click('[data-spawn="cuffs"]');
  await t.page.click('[data-close="sandbox"]');
  const r = await run(() => {
    const g = __game, p = g.player, w = g.weapons, out = {};
    g.advance(1.2);
    const it = w.items.find((i) => i.type === 'cuffs');
    out.spawned = !!it;
    w.pickUp(it); g.advance(0.5);
    out.label = document.querySelector('#attack-label').textContent;
    p.reset(0, -18, Math.PI / 2); g.camYaw = Math.PI / 2; g.advance(0.3);
    const v = V.still(T.dummy(1.1));
    g.advance(0.4);
    // somebody standing there minding their own business cannot be cuffed
    out.refused = !w.cuffable(v) && !w.attack(-1);
    g.advance(0.3);
    out.stillFree = !v.cuffed && !p.cuffing;
    // somebody on the ground can
    v.toRagdoll(); v.dazeT = 8; g.advance(1.3);
    const pb = v.bodies[0];
    p.reset(pb.px - 0.9, pb.pz, Math.PI / 2); g.camYaw = Math.atan2(pb.px - p.x, pb.pz - p.z); g.advance(0.3);
    out.started = w.attack(-1); g.advance(0.6);
    out.mid = { cuffing: !!p.cuffing, kneeling: p.crouching, cuffed: !!v.cuffed };
    // they are turned on to their front and their arms brought round first
    let took = 0.6;
    for (let i = 0; i < 60 && !v.cuffed; i++) { g.advance(0.1); took += 0.1; }
    const fr = [0, 0, 0]; v.bodies[2].dirToWorld(0, 0, 1, fr);
    out.cuffed = !!v.cuffed; out.took = took; out.front = fr[1] < -0.5; out.inv = w.inventory.map((i) => i.type).join(',');
    const gap = () => { const a = [0, 0, 0], b = [0, 0, 0], s = v.scale; v.bodies[6].toWorld(0, -0.12 * s, 0, a); v.bodies[9].toWorld(0, -0.12 * s, 0, b); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };
    // (the link draws them together gently, so as not to pull a wrist through anything on the way)
    g.advance(1.5);
    out.downGap = gap();
    v.dazeT = 0;
    let up = false;
    for (let i = 0; i < 160 && !up; i++) { g.advance(0.1); up = v.state === 0; }
    g.advance(1.2);
    const lh = [0, 0, 0], rh = [0, 0, 0];
    v.bodies[2].toLocal(v.bodies[7].px, v.bodies[7].py, v.bodies[7].pz, lh); v.bodies[2].toLocal(v.bodies[10].px, v.bodies[10].py, v.bodies[10].pz, rh);
    out.standing = { up, behind: Math.max(lh[2], rh[2]), gap: gap() };
    out.cannot = !w.npcAttack(v, p) && w.give(v, 'knife') === null;
    out.drawn = w.items.some((i) => i.wornBy === v && i.shown);
    // and off again
    p.reset(v.x - 0.9, v.z, Math.PI / 2); g.advance(0.4);
    out.useLabel = document.querySelector('#btn-use').hidden ? '' : document.querySelector('#use-label').textContent;
    w.pickUp(); g.advance(0.4);
    out.free = !v.cuffed; out.dropped = w.items.some((i) => i.type === 'cuffs' && i.body);
    return out;
  });
  check('they are in the spawn menu', r.spawned && r.label === 'CUFF');
  check('somebody on their feet and minding their own business cannot be cuffed', r.refused && r.stillFree);
  check('somebody on the ground can: it takes a moment, on one knee, and they are turned on to their front', r.started && r.mid.cuffing && r.mid.kneeling && !r.mid.cuffed && r.cuffed && r.took < 5.5 && r.front && r.inv === '', `cuffed after ${r.took.toFixed(1)} s, ${r.front ? 'face down' : 'not face down'}`);
  check('the wrists are held together', r.downGap < 0.3 && r.standing.gap < 0.3 && r.drawn, `${(r.downGap * 100).toFixed(0)} cm apart on the ground, ${(r.standing.gap * 100).toFixed(0)} cm standing`);
  check('they can stand up, hands behind their back', r.standing.up && r.standing.behind < -0.05, `hands ${(-r.standing.behind * 100).toFixed(0)} cm behind the chest`);
  check('in cuffs they can neither hit nor carry', r.cannot);
  check('and the cuffs come off again', r.useLabel === 'UNCUFF' && r.free && r.dropped);
}

/* --------------------------------- helmet ------------------------------- */
head('Light helmet');
if (want('Light helmet')) {
  await run(() => { V.stage(); __game.paused = false; });
  await t.page.click('#btn-menu');
  await t.page.click('[data-spawn="helmet"]');
  await t.page.click('[data-close="sandbox"]');
  const r = await run(() => {
    const g = __game, p = g.player, w = g.weapons, out = {};
    g.advance(1.5);
    const it = w.items.find((i) => i.type === 'helmet');
    out.spawned = !!it;
    p.reset(it.body.px - 0.4, it.body.pz, Math.PI / 2); g.advance(0.4);
    out.label = document.querySelector('#use-label').textContent;
    out.put = w.pickUp(it); g.advance(0.3);
    out.worn = !!p.helmet;
    out.onHead = p.helmet ? p.helmet.boxes.every((b) => b.part === 4) && p.helmet.boxes.length >= 5 : false;
    out.black = p.helmet ? p.helmet.boxes.slice(0, 4).every((b) => g.boxes.c[b.idx * 3] < 0.03 && g.boxes.c[b.idx * 3 + 2] < 0.03) : false;
    out.chip = [...document.querySelectorAll('#weapon-bar .slot')].some((b) => b.textContent === 'HELMET');
    const mk = (z, helm) => { const h = V.still(g.spawnHuman(p.x + 4, p.z + z, -Math.PI / 2)); if (helm) h.wearHelmet(); return h; };
    const hit = (h, type, power, where, weapon) => {
      const b = h.bodies[4], off = { top: [0, 0.1, 0], back: [0, 0.03, -0.1], face: [0, -0.02, 0.1] }[where], n = { top: [0, 1, 0], back: [0, 0, -1], face: [0, 0, 1] }[where];
      const pt = [0, 0, 0], dir = [0, 0, 0];
      b.toWorld(off[0] * h.scale, off[1] * h.scale, off[2] * h.scale, pt); b.dirToWorld(-n[0], -n[1], -n[2], dir);
      return h.hit({ part: 4, type, power, point: pt, dir, normal: n, impulse: 2, attacker: p, weapon, through: 0.2, hp: 32 });
    };
    const A = mk(-2, true), B = mk(2, false);
    A.h.tough = B.h.tough = 1;            // the same blow to the same skull, with and without
    g.advance(0.3);
    hit(A, 'blunt', 1.8, 'top', 'fists'); hit(B, 'blunt', 1.8, 'top', 'fists'); g.advance(0.6);
    out.blow = { helmet: { skull: A.h.bones.skull, conc: A.h.concussion, state: T.state(A) }, bare: { skull: B.h.bones.skull, conc: B.h.concussion, state: T.state(B) } };
    g.removeHuman(A); g.removeHuman(B);
    let turned = 0, face = 0;
    for (let i = 0; i < 20; i++) { const h = mk(0, true); g.advance(0.05); if (hit(h, 'bullet', 1, 'back', 'm1911').stopped) turned++; g.removeHuman(h); }
    for (let i = 0; i < 6; i++) { const h = mk(0, true); g.advance(0.05); const rep = hit(h, 'bullet', 1, 'face', 'm1911'); if (!rep.stopped && h.h.wounds.some((x) => x.type === 'gunshot')) face++; g.removeHuman(h); }
    out.turned = turned; out.face = face;
    const S = mk(0, true); g.advance(0.1);
    out.slash = hit(S, 'cut', 1.6, 'top', 'machete').stopped;
    g.removeHuman(S);
    w.shedHelmet(); g.advance(0.8);
    out.off = !p.helmet && w.items.some((i) => i.type === 'helmet' && i.body);
    return out;
  });
  check('it is in the spawn menu and can be put on', r.spawned && r.put && r.worn && r.label === 'PUT ON');
  check('a black shell on the head', r.onHead && r.black);
  check('it takes the worst out of a blow to the head', r.blow.helmet.skull > r.blow.bare.skull + 8 && r.blow.helmet.conc < r.blow.bare.conc && r.blow.helmet.state === 'ANIM',
    `skull ${r.blow.helmet.skull.toFixed(0)} against ${r.blow.bare.skull.toFixed(0)} without; concussion ${r.blow.helmet.conc.toFixed(0)} against ${r.blow.bare.conc.toFixed(0)}`);
  check('it turns a slash, and some pistol rounds', r.slash && r.turned >= 5 && r.turned <= 19, `${r.turned} of 20 pistol rounds to the back of the head`);
  check('it does not cover the face', r.face === 6);
  check('it comes off again', r.chip && r.off);
}

/* --------------------------------- arrests ------------------------------ */
head('Arrests');
if (want('Arrests')) {
  const r = await run(() => {
    const g = __game, p = g.player, w = g.weapons, S = g.city.police, out = {};
    V.stage(); g.staffStation(true); g.advance(1.5);
    const cops = () => g.humans.filter((h) => h.officer);
    out.belts = cops().every((h) => ['m1911', 'taser', 'cuffs'].every((k) => (h.kit || []).some((i) => i.type === k)));
    const fires = { taser: 0, pistol: 0 }; const nf = w.npcFire.bind(w);
    w.npcFire = (h, a, sk) => { const what = h.weapon && h.weapon.def.taser ? 'taser' : 'pistol'; const ok = nf(h, a, sk); if (ok) fires[what]++; return ok; };
    // keep hitting somebody in front of the station, with nothing in your hands
    p.reset(0, 26.5, 0); g.camYaw = 0; g.camPitch = 0; g.advance(0.3);
    const v = V.still(g.spawnHuman(0.2, 27.6, Math.PI));
    g.advance(0.5);
    for (let i = 0; i < 4; i++) { w.attack(i % 3); g.advance(1.1); }
    let tased = false, at = -1;
    for (let i = 0; i < 260; i++) {
      if (i < 30 && i % 6 === 0 && p.state === 0 && !p.cuffed) w.attack(0);
      g.advance(0.1);
      if (p.tased > 0) tased = true;
      if (p.cuffed && at < 0) at = i / 10;
      if (p.cuffed && cops().every((h) => h.brain.mode === 'post' && !h.weapon)) break;
    }
    out.player = { tased, cuffedAfter: at, fires: { ...fires }, alive: p.h.alive, open: p.h.wounds.filter((x) => x.type !== 'bruise').length,
      chip: [...document.querySelectorAll('#weapon-bar .slot')].some((b) => b.textContent === 'CUFFED'), label: document.querySelector('#attack-label').textContent,
      blocked: !w.attack(0), posts: cops().every((h) => h.brain.mode === 'post' && !h.weapon) };
    const chip = [...document.querySelectorAll('#weapon-bar .slot')].find((b) => b.textContent === 'CUFFED');
    if (chip) chip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    g.advance(0.5);
    out.slipped = !p.cuffed;
    // somebody else the police want, who will not stand still
    g.removeHuman(v); p.h.heal(); p.reset(-30, 0, 0);
    const n = g.spawnHuman(4, 24, 0);
    let dir = 1;
    n.brain = { update() { if (n.cuffed || n.tased > 0 || n.state !== 0) return; if (n.x > 7) dir = -1; if (n.x < -7) dir = 1; n.intent.mx = dir; n.intent.mz = 0; n.intent.run = true; }, pause: 0, mode: 'wander' };
    g.advance(0.5);
    for (const o of cops()) { const k = o.mind._know(n); k.crime = 2.2; k.crimeT = g.time; k.x = n.x; k.z = n.z; }
    let cuffedAt = -1, cellAt = -1;
    for (let i = 0; i < 1100 && cellAt < 0; i++) {
      g.advance(0.1);
      for (const o of cops()) { const k = o.mind.known.get(n.id); if (k && k.crime > 0 && !n.cuffed && n.state === 0 && n.tased <= 0) k.crimeT = g.time; }
      if (n.cuffed && cuffedAt < 0) { cuffedAt = i / 10; n.brain = new (cops()[0].brain.constructor)(n, g); }
      if (n.custody && n.custody.cell && n.x > S.cellX0 + 0.3 && n.z > S.cellDoor.z + 0.3 && n.x < S.x1 && n.z < S.z1) cellAt = i / 10;
    }
    out.npc = { cuffedAt, cellAt, alive: n.h.alive, doing: n.mind.doing, pistol: fires.pistol };
    w.npcFire = nf;
    return out;
  });
  check('officers carry a pistol, a taser and handcuffs', r.belts);
  check('someone with empty hands who will not stop is tased, not shot', r.player.tased && r.player.fires.taser > 0 && r.player.fires.pistol === 0 && r.player.alive && r.player.open === 0, `${r.player.fires.taser} taser shot(s), no pistol rounds`);
  check('and then handcuffed', r.player.cuffedAfter >= 0 && r.player.chip && r.player.label === 'CUFFED' && r.player.blocked, `cuffs on after ${r.player.cuffedAfter.toFixed(0)} s`);
  check('the officers go back to their posts once the cuffs are on', r.player.posts);
  check('in a sandbox the cuffs come off when you want them to', r.slipped);
  check('a prisoner is walked to the station and into the cell', r.npc.cuffedAt >= 0 && r.npc.cellAt >= 0 && r.npc.alive && r.npc.pistol === 0, `cuffed after ${r.npc.cuffedAt.toFixed(0)} s, behind bars after ${r.npc.cellAt.toFixed(0)} s`);
}

/* ---------------------------------- cheat ------------------------------- */
head('Infinite HP');
if (want('Infinite HP')) {
  const before = await run(() => {
    const g = __game, p = g.player;
    V.stage();
    window.shootMe = (weapon, part) => { const q = g.player, c = q.bodies[part]; return q.hit({ part, type: 'bullet', power: weapon === 'ak47' ? 1.4 : 1, point: [c.px + 0.1, c.py, c.pz], dir: [-1, 0, 0], normal: [1, 0, 0], impulse: 8, attacker: null, weapon, through: 0.2, hp: 40 }); };
    shootMe('m1911', 6); shootMe('m1911', 12); g.advance(1.2);
    g.paused = false;
    return { wounds: p.h.wounds.length, god: p.h.god };
  });
  await t.page.click('#btn-pause');
  await t.page.click('[data-ptab="settings"]');
  const there = await run(() => { const e = document.querySelector('#set-cheat-hp'); return !!e && !e.checked && /cheats/i.test(document.querySelector('[data-ppane="settings"]').textContent); });
  await t.page.click('#set-cheat-hp');
  await t.page.click('[data-ptab="main"]');
  await t.page.click('#btn-resume');
  const on = await run(() => {
    const g = __game, p = g.player, out = {};
    g.paused = true; g.paused = false; g.advance(0.4);
    out.tag = !document.querySelector('#v-cheat').hidden; out.mended = p.h.wounds.length === 0 && p.h.pain < 1;
    const marks0 = g.gore.bDecals.filter((d) => d.human === p).length;
    for (let i = 0; i < 12; i++) { shootMe('ak47', [2, 4, 1, 5, 11][i % 5]); g.advance(0.1); }
    const c = p.bodies[3];
    p.hit({ part: 3, type: 'cut', power: 3, point: [c.px + 0.05, c.py, c.pz], dir: [0, 0, 1], normal: [1, 0, 0], impulse: 6, attacker: null, weapon: 'machete', chop: 1.3 });
    p.sever(9, [1, 2, 0]); p.burst(12); p.h.kill('test');
    g.advance(1.5);
    out.after = { alive: p.h.alive, wounds: p.h.wounds.length, blood: p.h.bloodPct, whole: p.attached.every((a) => a) && !p.gone.some((x) => x), marks: g.gore.bDecals.filter((d) => d.human === p).length - marks0 };
    p.tase(2, null); g.advance(0.5); out.tased = p.tased > 0 && p.state === 2;
    g.advance(9);
    g.respawn(true); g.advance(0.3); out.kept = g.player.h.god;
    return out;
  });
  await t.page.click('#btn-pause');
  await t.page.click('[data-ptab="settings"]');
  await t.page.click('#set-cheat-hp');
  await t.page.click('[data-ptab="main"]');
  await t.page.click('#btn-resume');
  const off = await run(() => { const g = __game, p = g.player; g.advance(0.3); shootMe('m1911', 2); g.advance(0.4); const out = { tag: !document.querySelector('#v-cheat').hidden, god: p.h.god, wounds: p.h.wounds.length }; g.paused = true; return out; });
  check('it is in the options, under Cheats, while playing', there && before.wounds > 0 && !before.god);
  check('switching it on mends you and says so on the screen', on.tag && on.mended);
  check('nothing injures you: no wounds, no bleeding, nothing cut off, no dying', on.after.alive && on.after.wounds === 0 && on.after.blood > 99.9 && on.after.whole && on.after.marks === 0, `after twelve rifle rounds, a machete to the neck and three attempts to take a limb or a life: ${on.after.wounds} wounds, blood ${on.after.blood.toFixed(1)}%, ${on.after.marks} marks`);
  check('a taser still drops you', on.tased);
  check('it lasts through starting again, and switches off', on.kept && !off.tag && !off.god && off.wounds > 0);
}

/* ------------------------------ solid bodies ----------------------------- */
// Measured on the boxes that are drawn: how far one is inside another, a person's own or somebody else's.
head('Solid bodies');
if (want('Solid bodies')) {
  await installOV(t);
  const cm = (v) => (v * 100).toFixed(1) + ' cm';
  const pose = await run(() => {
    const g = __game; fresh();
    const kinds = ['', 'h.intent.mz = 1;', 'h.intent.mz = 1; h.intent.run = true;', 'h.intent.crouch = true;', 'h.guardT = 1;', 'h.pose.handsUp = 1;', 'h.pose.cower = 1; h.intent.crouch = true;', 'h.pose.kneel = 1; h.intent.crouch = true;', 'h.pose.hurt = 1;'];
    let worst = 0, pair = '';
    for (const k of kinds) {
      const h = stub(g.spawnHuman(4, -18, 0), new Function('h', k));
      g.advance(0.8);
      const r = OV.watch(1.2, [h]);
      if (r.self > worst) { worst = r.self; pair = r.selfPair; }
      g.removeHuman(h);
    }
    const p = g.player, w = g.weapons;
    let i = 0;
    const a = OV.watch(5, [p], { each: (tm) => { if (!p.anim.busy && tm > i * 1.2) { w.attack(i % 4); i++; } } });
    w.give(p, 'm1911', true); g.advance(0.5);
    const b = OV.watch(5, [p], { each: (tm) => { g.camPitch = Math.sin(tm * 1.3) * 0.7; if (tm > 1 && tm < 1.05) w.fire(); if (tm > 1.4 && tm < 1.45) w.reload(); } });
    g.paused = true;
    return { worst, pair, attack: a.self, gun: b.self };
  });
  check('in every pose, a person\'s arms and legs stay out of their own body', pose.worst < 0.012, `worst ${cm(pose.worst)} ${pose.pair}`);
  check('and while punching, aiming, firing and reloading', pose.attack < 0.012 && pose.gun < 0.012, `${cm(pose.attack)}, ${cm(pose.gun)}`);
  const fight = await run(() => {
    const g = __game, p = g.player, w = g.weapons; fresh();
    const v = stub(T.dummy(1.0)); v.h.tough = 50; g.advance(0.6);
    let i = 0;
    const r = OV.watch(8, [p, v], { pairs: true, each: (tm) => { if (!p.anim.busy && tm > i * 1.3) { if (v.state !== 0) v.h.heal(); w.attack(i % 4); i++; } } });
    g.paused = true;
    return r;
  });
  check('a fist or a foot stops at the body it lands on', fight.otherTime < 0.03 && fight.other < 0.06, `over a centimetre for ${(fight.otherTime * 100).toFixed(1)}% of the time, at worst ${cm(fight.other)} ${fight.otherPair}`);
  const crowd = await run(() => {
    const g = __game; fresh();
    const hs = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const h = g.spawnHuman(6 + Math.sin(a) * 4, -18 + Math.cos(a) * 4, a + Math.PI); stub(h, (x) => { const dx = 6 - x.x, dz = -18 - x.z, d = Math.hypot(dx, dz) || 1; x.intent.mx = dx / d; x.intent.mz = dz / d; x.intent.run = (i % 2) === 0; }); hs.push(h); }
    const r = OV.watch(6, hs, { pairs: true });
    g.paused = true;
    return r;
  });
  check('eight people walking and running into each other do not end up inside each other', crowd.otherTime < 0.04 && crowd.endOther < 0.012, `over a centimetre for ${(crowd.otherTime * 100).toFixed(1)}% of the time, at worst ${cm(crowd.other)} ${crowd.otherPair}`);
  const heap = await run(() => {
    const g = __game; fresh();
    const hs = [];
    for (let i = 0; i < 6; i++) { const h = stub(g.spawnHuman(5 + (i % 2) * 0.5, -18 + (i % 3) * 0.4, i)); hs.push(h); }
    g.advance(0.3);
    hs.forEach((h, i) => { h.h.kill('test'); h.toRagdoll(); for (const b of h.bodies) { b.teleport(b.px, b.py + 0.4 + i * 1.3, b.pz); b.vx = b.vy = b.vz = 0; } });
    const r = OV.watch(9, hs, { pairs: true });
    r.asleep = hs.filter((h) => h.island.sleeping).length;
    g.paused = true;
    return r;
  });
  check('six bodies dropped in a heap come to rest on each other, not in each other', heap.endOther < 0.025 && heap.endSelf < 0.015 && heap.asleep >= 5, `at rest: ${cm(heap.endOther)} between, ${cm(heap.endSelf)} own; ${heap.asleep} of 6 still`);
  const cuff = await run(() => {
    const g = __game; fresh();
    const o = stub(g.spawnOfficer(4, -18, Math.PI / 2)), v = stub(g.spawnHuman(4.75, -18, -Math.PI / 2));
    g.advance(0.4); v.stayDown = true; v.toRagdoll(); v.bodies[2].applyImpulse(30, 0, 0); g.advance(2.5);
    const a = [0, 0, 0]; v.bodies[2].dirToWorld(0, 0, 1, a); const upBefore = a[1];
    const started = g.weapons.cuff(o, v, true);
    const r = OV.watch(6, [o, v], { pairs: true });
    v.bodies[2].dirToWorld(0, 0, 1, a);
    r.started = started; r.upBefore = upBefore; r.upAfter = a[1]; r.cuffed = !!v.cuffed;
    g.paused = true;
    return r;
  });
  check('someone handcuffed where they lie is rolled on to their front, and the cuffs do not pull their wrists through them', cuff.started && cuff.cuffed && cuff.upAfter < -0.5 && cuff.self < 0.035, `facing ${cuff.upBefore > 0.5 ? 'up' : 'sideways or down'} before, ${cuff.upAfter < -0.5 ? 'down' : 'not down'} after; worst ${cm(cuff.self)} ${cuff.selfPair}`);
  const over = await run(() => {
    const g = __game; fresh();
    g.player.reset(-12, -12, 0); g.advance(0.2);
    const v = stub(g.spawnHuman(4, -18, Math.PI / 2)); g.advance(0.3); v.h.kill('test'); v.toRagdoll(); g.advance(2.5);
    const hs = [v];
    // across the legs, where a foot can come down on them (the trunk is walked round)
    const leg = v.bodies[12], legR = v.bodies[15];
    for (let i = 0; i < 3; i++) { const lx = (i === 1 ? legR : leg).px + (i - 1) * 0.08; const h = g.spawnHuman(lx, (i === 1 ? legR : leg).pz - 2.2 - i * 1.3, 0); stub(h, (x) => { x.intent.mz = 1; x.intent.run = i === 1; }); hs.push(h); }
    let lifted = 0;
    const z0 = v.bodies[0].pz;
    const r = OV.watch(6, hs, { pairs: true, each: () => { for (const h of hs) if (h !== v) lifted = Math.max(lifted, h.footLift[0], h.footLift[1]); } });
    r.lifted = lifted; r.across = hs.filter((h) => h !== v && h.z > z0 + 0.6).length;
    g.paused = true;
    return r;
  });
  check('people walking across a body step on it or push its limbs aside, not into it', over.across === 3 && over.other < 0.02, `${over.across} of 3 across, feet lifted up to ${cm(over.lifted)}; worst ${cm(over.other)}`);
  const up = await run(() => {
    const g = __game; fresh();
    const hs = [];
    for (let i = 0; i < 6; i++) { const h = stub(g.spawnHuman(3 + i * 1.6, -18 + (i % 2) * 1.5, i)); hs.push(h); }
    g.advance(0.5);
    hs.forEach((h, i) => { h.toRagdoll(); h.bodies[2].applyImpulse(Math.sin(i * 1.3) * 60, 20, Math.cos(i * 1.3) * 60); });
    let worst = 0, pair = '', rose = 0;
    const seen = new Set();
    OV.watch(9, hs, { each: () => { for (const h of hs) if (h.state === 3) { seen.add(h); const s = OV.self(h); if (s.d > worst) { worst = s.d; pair = s.pair; } } } });
    rose = seen.size;
    g.paused = true;
    return { worst, pair, rose };
  });
  check('getting up, the arms and legs turn at their joints instead of passing through the body', up.rose >= 4 && up.worst < 0.03, `${up.rose} got up; worst ${cm(up.worst)} ${up.pair}`);
}

/* -------------------------------- rifles -------------------------------- */
head('Rifles');
if (want('Rifles')) {
  const r = await run(() => {
    const g = __game, p = g.player, w = g.weapons, out = {};
    for (const type of ['m4a1', 'ar15']) {
      V.stage();
      const it = w.give(p, type, true); g.advance(0.9);
      const o = out[type] = { name: it.def.name, mag: it.def.mag };
      // the trigger held down for a second
      const a0 = it.ammo;
      T.press('attack');
      for (let i = 0; i < 60; i++) g.advance(1 / 60);
      T.release('attack');
      o.held = a0 - it.ammo;
      g.advance(0.6);
      // somebody six metres off, shot once in the chest
      const v = V.still(g.spawnHuman(p.x + Math.sin(g.camYaw) * 6, p.z + Math.cos(g.camYaw) * 6, g.camYaw + Math.PI)); v.h.tough = 95; g.advance(0.5);
      for (let k = 0; k < 4; k++) { V.aimAt(v.bodies[2]); g.advance(1 / 60); }
      w.fire(); g.advance(0.4);
      o.hit = v.h.wounds.filter((x) => x.type === 'gunshot').length;
      w.reload(); g.advance(3);
      o.reloaded = it.ammo === it.def.mag;
      w.holster(); g.advance(1.2);
      o.slung = !p.weapon && w.inventory.includes(it);
    }
    g.paused = true;
    return out;
  });
  const m = r.m4a1, a = r.ar15;
  check('the M4A1 fires in bursts while the trigger is held', m.held >= 6, `${m.held} rounds in a second`);
  check('the AR-15 fires once for each pull of the trigger', a.held === 1, `${a.held} round${a.held === 1 ? '' : 's'} in a second held`);
  check('both hit what they are aimed at', m.hit > 0 && a.hit > 0, `M4A1 ${m.hit}, AR-15 ${a.hit} wounds`);
  check('both take a 30-round magazine and reload', m.mag === 30 && a.mag === 30 && m.reloaded && a.reloaded);
  check('both go on the back when put away', m.slung && a.slung);
}

/* ----------------------------- wanted level ----------------------------- */
head('Wanted level');
if (want('Wanted')) {
  const r = await run(() => {
    const g = __game, p = g.player, w = g.weapons, P = g.police, out = {};
    const stars = () => { g.ui.update(0.25); return document.querySelectorAll('#wanted .stars b.on').length; };
    V.stage(); P.reset(); g.settings.cheatCops = false;
    // the most there can be is two
    P.raise(5, 'test'); out.max = P.wanted; out.maxStars = stars(); P.clear('test');
    // nobody sees it: nobody knows
    const q = V.still(T.dummy(1.0));
    for (let i = 0; i < 40 && q.h.alive; i++) { if (!p.anim.busy) w.attack(i % 3); g.advance(0.3); if (i > 12) q.h.kill('test'); }
    g.advance(3);
    out.unseen = P.wanted;
    // an officer sees a punch: one star, and they come to arrest
    V.stage(); P.reset();
    const o = g.spawnOfficer(p.x + Math.sin(g.camYaw + 0.5) * 7, p.z + Math.cos(g.camYaw + 0.5) * 7, g.camYaw + 0.5 + Math.PI);
    g.advance(1.5);
    const v = V.still(T.dummy(1.0));
    // rounds fired, as against taser probes
    let fires = 0, tasers = 0; const nf = w.npcFire.bind(w); w.npcFire = (h, aim, sk) => { const tz = !!(h.weapon && h.weapon.def.taser); const ok = nf(h, aim, sk); if (ok) { if (tz) tasers++; else fires++; } return ok; };
    for (let i = 0; i < 12 && !P.wanted; i++) { if (!p.anim.busy) w.attack(i % 2); g.advance(0.35); }
    out.punch = P.wanted; out.punchStars = stars();
    let cuffed = -1, b0 = P.stats.busted;
    for (let i = 0; i < 400; i++) { g.advance(0.1); if (p.cuffed) { cuffed = i / 10; break; } }
    out.arrest = { cuffed, fires, tasers, wanted: P.wanted, mode: o.brain.mode, busted: P.stats.busted - b0 };
    g.advance(0.5);
    out.clearedStars = stars();
    // an officer sees you shoot somebody: two stars, and they shoot
    V.stage(); P.reset();
    const o2 = g.spawnOfficer(p.x + Math.sin(g.camYaw - 0.6) * 9, p.z + Math.cos(g.camYaw - 0.6) * 9, g.camYaw - 0.6 + Math.PI);
    g.advance(1.5);
    const v2 = V.still(g.spawnHuman(p.x + Math.sin(g.camYaw) * 4, p.z + Math.cos(g.camYaw) * 4, g.camYaw + Math.PI)); v2.h.tough = 95;
    w.give(p, 'm1911', true); g.advance(0.9);
    for (let k = 0; k < 4; k++) { V.aimAt(v2.bodies[2]); g.advance(1 / 60); }
    fires = 0; w.fire(); g.advance(0.3);
    out.shoot = P.wanted; out.shootStars = stars();
    w.holster();
    for (let i = 0; i < 100 && !fires; i++) g.advance(0.1);
    out.shotAt = { fires, mode: o2.brain.mode, hurt: p.h.wounds.length };
    w.npcFire = nf;
    // out of sight for long enough, the stars go out one at a time (with no more officers sent out to look)
    V.stage(); P.reset();
    const mp = g.maxPeople; g.maxPeople = 0;
    P.raise(2, 'test'); g.advance(1);
    const t0 = g.time; let one = -1, none = -1;
    for (let i = 0; i < 2000 && none < 0; i++) { g.advance(0.1); if (one < 0 && P.wanted === 1) one = g.time - t0; if (P.wanted === 0) none = g.time - t0; }
    g.maxPeople = mp;
    out.cool = { one, none, why: P.log.slice(-2).map((l) => l.text).join(', ') };
    g.paused = true;
    return out;
  });
  check('two stars at most', r.max === 2 && r.maxStars === 2);
  check('with nobody to see it, nobody knows', r.unseen === 0);
  check('an officer who sees you hit someone gives you one star', r.punch === 1 && r.punchStars === 1);
  check('at one star, standing still, you are told to stop and handcuffed: not shot, not tased', r.arrest.cuffed > 0 && r.arrest.fires === 0 && r.arrest.tasers === 0, r.arrest.cuffed > 0 ? `cuffed after ${r.arrest.cuffed.toFixed(1)}s, ${r.arrest.tasers} taser shots` : `not cuffed; officer ${r.arrest.mode}`);
  check('being arrested clears the stars', r.arrest.wanted === 0 && r.arrest.busted === 1 && r.clearedStars === 0);
  check('an officer who sees you shoot someone gives you two stars', r.shoot === 2 && r.shootStars === 2);
  check('at two stars they shoot, even with your gun put away', r.shotAt.fires > 0, `${r.shotAt.fires} rounds, officer ${r.shotAt.mode}`);
  check('out of their sight the stars go out one at a time', r.cool.one > 60 && r.cool.none > r.cool.one + 50, `one star after ${r.cool.one.toFixed(0)}s, none after ${r.cool.none.toFixed(0)}s (${r.cool.why})`);
}

/* ------------------------- 911 and fingerprints ------------------------- */
head('911 calls and fingerprints');
if (want('911')) {
  const crime = async (weapon) => run((weapon) => {
    const g = __game, p = g.player, w = g.weapons, P = g.police, out = { log: [] };
    V.stage(); P.reset(); P.reports.length = 0; g.settings.cheatCops = false;
    const m0 = P.stats.matches, sc0 = P.stats.scans;
    p.reset(-30, -31, Math.PI / 2); g.camYaw = Math.PI / 2; g.camPitch = -0.05; g.advance(0.5);
    g.staffStation(true); g.advance(0.5);
    const v = V.still(T.dummy(1.0));
    if (weapon !== 'fists') w.give(p, weapon, true);
    g.advance(0.6);
    for (let i = 0; i < 40 && v.h.alive; i++) { if (!p.anim.busy) w.attack(i % 3); g.advance(0.3); if (i > 14 && v.h.alive) v.h.kill('test'); }
    w.holster(); g.advance(1);
    out.prints = v.prints ? v.prints.has(p.id) : false;
    out.after = P.wanted;
    // away from it, and somebody comes along who finds the body
    p.reset(-62, 62, 0); g.advance(0.5);
    let f = null, tries = 0, scanT = -1;
    const modes = [];
    for (let i = 0; i < 3000; i++) {
      if (!f || (i % 60 === 59 && !f.mind.toCall && f.brain.mode !== 'call' && !P.reports.length && tries < 8)) {
        if (f) g.removeHuman(f);
        f = g.spawnHuman(-27, -27, Math.PI); f.mind.p.empathy = 1; tries++;
      }
      g.advance(0.1);
      if (i % 100 === 0) modes.push(`${(i / 10).toFixed(0)}s #${tries} ${f.brain.mode}${f.mind.toCall ? ' toCall ' + f.mind.toCall.kind : ''}`);
      if (P.reports.length && !out.report) { const rp = P.reports[0]; out.report = { kind: rp.kind, suspect: !!rp.suspect, t: g.time }; out.wantedAtReport = P.wanted; }
      if (P.stats.scans > sc0 && scanT < 0) { scanT = g.time; out.scan = { matches: P.stats.matches - m0, wanted: P.wanted }; }
      if (scanT > 0 && g.time > scanT + 6) break;
    }
    out.calls = P.stats.calls; out.finders = tries;
    out.modes = g.humans.filter((h) => h.officer).map((h) => h.brain.mode).join(',');
    out.final = P.wanted;
    out.policeLog = P.log.map((l) => l.text).join(' | ') + ' || finders: ' + modes.slice(0, 12).join(', ');
    g.paused = true;
    return out;
  }, weapon);
  const fist = await crime('fists');
  check('someone who finds a body rings the police, who send officers', fist.calls > 0 && !!fist.report, fist.report ? `${fist.report.kind} reported by finder #${fist.finders}` : 'no report');
  check('a caller who did not see it happen cannot say who did it', fist.report && !fist.report.suspect && fist.wantedAtReport === 0);
  check('bare hands on the victim leave your fingerprints', fist.prints);
  check('the officers scan the body, match your prints, and you are wanted', fist.scan && fist.scan.matches > 0 && fist.final >= 1, fist.scan ? `wanted ${fist.final}` : 'never scanned: ' + fist.policeLog);
  check('then they search the city for you', /search/.test(fist.modes), fist.modes);
  const knife = await crime('knife');
  check('a knife leaves no prints, and the scan finds nothing', !knife.prints && knife.scan && knife.scan.matches === 0 && knife.final === 0, knife.scan ? `prints ${knife.prints}, matches ${knife.scan.matches}, wanted ${knife.final}` : 'never scanned: ' + knife.policeLog);
}

/* ------------------------ blood runs and soaking ------------------------ */
head('Blood runs and soaking');
if (want('Blood runs')) {
  const r = await run(() => {
    const g = __game, p = g.player, w = g.weapons, G = g.gore, out = {};
    V.stage(); g.settings.cheatCops = true;
    // somebody with their back to a building wall, shot through the chest
    const x0 = 0, z0 = -22, d = g.world.rayWorld(x0, 1.3, z0, 0, 0, -1, 9);
    const vz = z0 - (d - 0.55);
    p.reset(0, vz + 3.5, Math.PI); g.camYaw = Math.PI; g.advance(0.5);
    const v = V.still(g.spawnHuman(0, vz, 0)); v.h.tough = 95; g.advance(0.5);
    const s0 = { ...G.stats };
    let walls = 0; const wr = G._wallRun.bind(G); G._wallRun = (...a) => { walls++; return wr(...a); };
    w.give(p, 'm4a1', true); g.advance(0.9);
    for (let k = 0; k < 6; k++) { V.aimAt(v.bodies[2]); g.advance(1 / 60); }
    for (let i = 0; i < 2; i++) { w.fire(); g.advance(0.3); }
    // as tough as this, a round comes out of the back only half the time: a few more until one has
    for (let i = 0; i < 4 && !v.h.wounds.some((x) => x.type === 'exit'); i++) {
      for (let k = 0; k < 4; k++) { V.aimAt(v.bodies[2]); g.advance(1 / 60); }
      w.fire(); g.advance(0.3);
    }
    g.advance(15);
    G._wallRun = wr;
    const mine = G.bDecals.filter((x) => x.human === v);
    out.wall = walls;
    out.runs = mine.filter((x) => x.run).length;
    out.chained = G.stats.chained - s0.chained;
    out.drips = G.stats.drips - s0.drips;
    out.soaks = mine.filter((x) => x.soak).length;
    out.cloth = Math.max(...v.soak);
    out.wound = v.h.wounds.filter((x) => x.type === 'gunshot').length;
    // a blade that has been used drips
    V.stage();
    const q = V.still(T.dummy(1.0)); q.h.tough = 95;
    w.give(p, 'knife', true); g.advance(0.8);
    const b0 = G.stats.bladeDrips;
    for (let i = 0; i < 6; i++) { if (!p.anim.busy) w.attack(i % 2); g.advance(0.4); }
    g.advance(5);
    out.blade = G.stats.bladeDrips - b0;
    g.settings.cheatCops = false;
    g.paused = true;
    return out;
  });
  check('blood thrown on a wall runs down it', r.wall > 0, `${r.wall} runs down the wall`);
  check('blood runs down the person from the wound, part to part', r.runs > 0 && r.chained > 0, `${r.runs} runs, ${r.chained} carried on to the part below`);
  check('and drips off where it runs out', r.drips > 0, `${r.drips} drops`);
  check('clothes round the wound soak it up and darken', r.soaks > 0 && r.cloth > 0.1, `${r.soaks} stains, most soaked part ${(r.cloth * 100).toFixed(0)}%`);
  check('a bloody blade drips', r.blade > 0, `${r.blade} drops`);
}

/* ---------------------------- medical state ----------------------------- */
head('Medical state');
if (want('Medical')) {
  const r = await run(() => {
    const g = __game, p = g.player, w = g.weapons, out = {};
    V.stage();
    // running down an open street until there is nothing left
    p.reset(-62, -40, 0); g.camYaw = 0; g.advance(0.5);
    __ts.input.move.x = 0; __ts.input.move.y = 1; g.advance(4);
    out.fresh = p.speed;
    g.advance(20);
    out.tired = { stamina: p.h.stamina, speed: p.speed };
    __ts.input.move.y = 0; g.advance(15);
    out.rested = p.h.stamina;
    g.ui.update(0.25);
    out.bar = document.querySelector('#v-stam').style.width;
    // a fright: adrenaline up in seconds
    V.stage();
    const a = V.still(g.spawnHuman(p.x + Math.sin(g.camYaw) * 4, p.z + Math.cos(g.camYaw) * 4, g.camYaw + Math.PI));
    g.advance(1);
    w.give(p, 'm1911', true); g.advance(0.9);
    g.camPitch = 0.4; w.fire(); g.advance(3);
    out.adrenaline = a.h.adrenaline;
    // a knock on the head: dizzy, and less aware of what is going on
    a.h.concussion = 50; a.h.dizzy = 20; g.advance(1.2);
    out.dizzy = { dizziness: a.h.dizziness, awareness: a.h.awareness };
    // somebody fresh, on their feet, looking down an open street at the player 40 m off
    const b = V.still(g.spawnHuman(4, -18, -Math.PI / 2)); g.advance(0.3);
    const far = (aw) => { b.mind.aware = aw; return b.mind.canSee(p.x, p.y + 1.5, p.z + 0.01, true, true); };
    a.h.concussion = 0; a.h.dizzy = 0;
    p.reset(b.x + Math.sin(b.yaw) * 40, b.z + Math.cos(b.yaw) * 40, b.yaw + Math.PI); g.advance(0.1);
    out.sight = { clear: far(1), clouded: far(0.25) };
    g.paused = true;
    return out;
  });
  check('running uses up stamina until it is only a jog', r.fresh > 4.5 && r.tired.stamina < 25 && r.tired.speed < 3.5, `${r.fresh.toFixed(1)} m/s fresh, ${r.tired.speed.toFixed(1)} m/s with ${r.tired.stamina.toFixed(0)} stamina left`);
  check('rest brings it back, and the bar shows it', r.rested > 90 && parseFloat(r.bar) > 90, `${r.rested.toFixed(0)} after 15s`);
  check('a fright sends adrenaline up in seconds', r.adrenaline > 0.4, r.adrenaline.toFixed(2));
  check('a knock on the head leaves someone dizzy and less aware', r.dizzy.dizziness > 40 && r.dizzy.awareness < 75, `dizziness ${r.dizzy.dizziness.toFixed(0)}, awareness ${r.dizzy.awareness.toFixed(0)}`);
  check('somebody barely aware does not see as far', r.sight.clear > 0 && r.sight.clouded === 0, `at 40 m: ${r.sight.clear.toFixed(2)} alert, ${r.sight.clouded.toFixed(2)} clouded`);

  await run(() => { V.stage(); __game.paused = false; });
  await t.page.click('#btn-menu');
  await t.page.click('[data-spawn="syringe"]');
  await t.page.click('[data-close="sandbox"]');
  const s = await run(() => {
    const g = __game, p = g.player, w = g.weapons, out = {};
    g.advance(0.5);
    const it = w.items.find((i) => i.type === 'syringe');
    out.spawned = !!it;
    if (it) { w.pickUp(it); g.advance(0.5); if (p.weapon !== it) w.draw?.(p, it); g.advance(0.6); }
    out.inHand = !!(p.weapon && p.weapon.type === 'syringe');
    const v = V.still(T.dummy(1.0)); g.advance(0.5);
    const said = []; const ask = v.mind.ask.bind(v.mind); v.mind.ask = (k, ...x) => { said.push(k); return ask(k, ...x); };
    out.injected = w.attack(0);
    let sick = -1, down = -1, dead = -1;
    for (let i = 0; i < 1500; i++) {
      g.advance(0.1);
      const tt = (i + 1) / 10;
      if (sick < 0 && v.h.poison > 22) sick = tt;
      if (down < 0 && v.state === 2) down = tt;
      if (dead < 0 && !v.h.alive) { dead = tt; break; }
    }
    out.course = { sick, down, dead, cause: v.h.cause, said: [...new Set(said)].join(','), prints: v.prints ? v.prints.size : 0 };
    // the doctor's view of somebody poisoned
    const v2 = V.still(T.dummy(1.6, 0.8)); v2.h.inject(100); g.advance(25);
    g.ui.toggleDoctor(true); g.ui.doctor.select(v2); g.ui.update(0.3);
    out.rows = [...document.querySelectorAll('#doc-state .meter')].map((m) => m.querySelector('label').textContent + ' ' + m.querySelector('output').textContent);
    g.ui.toggleDoctor(false);
    g.paused = true;
    return out;
  });
  check('a poison syringe can be spawned and picked up', s.spawned && s.inHand);
  check('a jab with it: they know they have been stuck with something', s.injected && /injected/.test(s.course.said), s.course.said);
  check('poison makes them sick within seconds and drops them within a minute', s.course.sick > 0 && s.course.sick < 15 && s.course.down > 15 && s.course.down < 60, `sick at ${s.course.sick}s, down at ${s.course.down}s`);
  check('then their breathing fails and they die of it', s.course.dead > s.course.down && s.course.dead < 140 && s.course.cause === 'Poisoning', `dead at ${s.course.dead}s: ${s.course.cause}`);
  check('a needle leaves no fingerprints', s.course.prints === 0);
  const names = s.rows.map((x) => x.split(' ')[0].toLowerCase());
  check('doctor mode shows awareness, dizziness, stamina, adrenaline, poison and shock', ['awareness', 'dizziness', 'stamina', 'adrenaline', 'poison', 'shock'].every((n) => names.includes(n)), s.rows.join(' / '));
}

/* ---------------------------- settings scroll ---------------------------- */
head('Settings');
if (want('Settings')) {
  await t.page.setViewportSize({ width: 844, height: 390 });
  await run(() => { __ts.ui.pause('settings'); });
  await t.page.waitForTimeout(300);
  const box = await run(() => { const c = document.querySelector('#pause .card').getBoundingClientRect(), s = document.querySelector('#pause .scroll'); return { bottom: c.bottom, vh: innerHeight, sh: s.scrollHeight, ch: s.clientHeight }; });
  await t.page.mouse.move(420, 250); await t.page.mouse.wheel(0, 500);
  // a slow (software) renderer can take a moment to get round to the wheel
  let top = 0;
  for (let i = 0; i < 20 && top <= 100; i++) { await t.page.waitForTimeout(150); top = await run(() => document.querySelector('#pause .scroll').scrollTop); }
  await run(() => { __ts.ui.resume(); });
  await t.page.setViewportSize({ width: 1100, height: 600 });
  await t.page.waitForTimeout(300);
  check('on a short screen the settings fit and scroll', box.bottom <= box.vh + 1 && box.sh > box.ch && top > 100, `card ends at ${Math.round(box.bottom)} of ${box.vh}px; scrolled ${top}px`);
}

/* -------------------------------- glock 19 ------------------------------- */
head('Glock-19');
if (want('Glock')) {
  const r = await run(() => {
    const g = __game, p = g.player, w = g.weapons, out = {};
    V.stage();
    const it = w.give(p, 'glock', true); g.advance(0.8);
    out.mag = it.def.mag;
    let fired = 0;
    for (let i = 0; i < 20; i++) { if (w.fire()) fired++; g.advance(0.15); }
    out.fired = fired;
    w.reload(); g.advance(2.2);
    out.full = it.ammo;
    w.holster(); g.advance(1);
    out.away = !p.weapon && w.inventory.includes(it);
    g.paused = true;
    return out;
  });
  check('fifteen rounds, then empty', r.mag === 15 && r.fired === 15, `${r.fired} fired from a ${r.mag}-round magazine`);
  check('reloads, and goes in a shoulder holster', r.full === 15 && r.away);
}

/* ---------------------------- exit bullet holes --------------------------- */
head('Exit holes');
if (want('Exit holes')) {
  const r = await run(() => {
    const g = __game, p = g.player, w = g.weapons, out = {};
    V.stage();
    const aim = (b) => { for (let k = 0; k < 6; k++) { V.aimAt(b); g.advance(1 / 60); } };
    // a crate with somebody behind it
    const c = g.spawnCrate(p.x + 3, 0.6, p.z); g.advance(1);
    const v = V.still(g.spawnHuman(p.x + 4.4, p.z, -Math.PI / 2)); v.h.tough = 95; g.advance(0.5);
    w.give(p, 'm1911', true); g.advance(0.8);
    const e0 = w.stats.exits;
    aim({ px: c.body.px, py: Math.min(c.body.py + c.body.hy - 0.06, v.bodies[11].py), pz: c.body.pz });
    for (let i = 0; i < 3; i++) { w.fire(); g.advance(0.25); }
    out.crate = { exits: w.stats.exits - e0, behind: v.h.wounds.filter((x) => x.type === 'gunshot').length };
    // a car, broadside on
    // a car parked across the line of fire: in through one door, out of the other (below the windows)
    const car = g.traffic.spawnParked('sedan', p.x + 6, p.z + 4, 0); g.advance(0.2);
    if (car) {
      const side = [Math.cos(car.yaw), 0, -Math.sin(car.yaw)];
      const e1 = w.stats.exits;
      w._bullet(p, w.def, car.x - side[0] * 3, car.y + 0.55, car.z - side[2] * 3, side[0], 0, side[2], 1.3, 0);
      out.car = w.stats.exits - e1;
      g.traffic.remove(car);
    }
    // a wooden wall
    for (const o of g.props.slice()) g.removeProp(o);
    const wall = g.voxels.wall('wood', p.x + 4, p.z, Math.PI / 2); g.advance(0.3);
    const lost0 = wall.lost, x0 = g.voxels.exits;
    aim({ px: wall.body.px, py: 1.2, pz: wall.body.pz });
    for (let i = 0; i < 3; i++) { w.fire(); g.advance(0.25); }
    out.wood = { lost: wall.lost - lost0, exits: g.voxels.exits - x0 };
    g.paused = true;
    return out;
  });
  check('a round goes through a crate and out of the far side, and hits whoever is behind it', r.crate.exits > 0 && r.crate.behind > 0, `${r.crate.exits} exit holes, ${r.crate.behind} wounds behind`);
  check('through both sides of a car', r.car > 0, `${r.car} exit holes`);
  check('through a wooden wall: a hole in, and a bigger one out', r.wood.lost > 3 && r.wood.exits > 0, `${r.wood.lost} cubes gone for 3 rounds, ${r.wood.exits} exit holes`);
}

/* --------------------------- walls and beams ---------------------------- */
head('Walls and beams');
if (want('Walls')) {
  const r = await run(() => {
    const g = __game, p = g.player, w = g.weapons, Vx = g.voxels, out = {};
    V.stage();
    const aim = (x, y, z) => { for (let k = 0; k < 6; k++) { V.aimAt({ px: x, py: y, pz: z }); g.advance(1 / 60); } };
    const steel = Vx.wall('sheet', p.x + 4, p.z, Math.PI / 2), beam = Vx.beam(true, p.x, p.z + 4, 0);
    g.advance(1.5);
    out.made = { steelFixed: steel.body.kinematic, beamFree: !beam.body.kinematic, beamKg: Math.round(beam.body.mass), cubes: steel.count + beam.count };
    w.give(p, 'm1911', true); g.advance(0.8);
    aim(steel.body.px, 1.3, steel.body.pz);
    const s0 = steel.lost, t0 = w.stats.through;
    w.fire(); g.advance(0.3);
    out.pistol = { lost: steel.lost - s0, through: w.stats.through - t0 };
    for (const it of w.items.slice()) w.remove(it);
    w.give(p, 'm4a1', true); g.advance(0.9);
    aim(steel.body.px, 0.9, steel.body.pz + 0.4);
    const s1 = steel.lost, t1 = w.stats.through;
    w.fire(); g.advance(0.3);
    out.rifle = { lost: steel.lost - s1, through: w.stats.through - t1 };
    // cut through the beam's middle, a slice at a time: two beams
    const b0 = Vx.broken;
    for (let k = 0; k < beam.nz; k++) for (let j = 0; j < beam.ny; j++) for (let i = 44; i <= 45; i++) beam.remove(beam.idx(i, j, k), 0, 0, 0, false);
    g.advance(1);
    out.split = { pieces: Vx.list.filter((x) => x.kind === 'beam').length, broken: Vx.broken - b0, free: Vx.list.filter((x) => x.kind === 'beam').every((x) => !x.anchored) };
    // a wooden wall, chopped at with a machete, then cut through at the foot
    for (const o of g.props.slice()) g.removeProp(o);
    for (const it of w.items.slice()) w.remove(it);
    const wood = Vx.wall('wood', p.x + 1.05, p.z, Math.PI / 2);
    g.camYaw = Math.PI / 2; g.camPitch = -0.1;
    w.give(p, 'machete', true); g.advance(0.8);
    const c0 = w.stats.chops;
    for (let i = 0; i < 8; i++) { if (!p.anim.busy) w.attack(i % 3); g.advance(0.45); }
    out.chops = w.stats.chops - c0;
    for (let k = 0; k < wood.nz; k++) for (let j = 0; j < 3; j++) for (let i = 0; i < wood.nx; i++) wood.remove(wood.idx(i, j, k), 0, 0, 0, false);
    g.advance(0.2);
    const fell = Vx.list.find((x) => x.kind === 'wall');
    out.fell = fell ? { free: !fell.anchored } : null;
    g.advance(3);
    out.fellUp = fell ? (1 - 2 * (fell.body.qx ** 2 + fell.body.qz ** 2)).toFixed(2) : null;
    g.paused = true;
    return out;
  });
  check('walls stand where they are put, beams lie loose and heavy', r.made.steelFixed && r.made.beamFree && r.made.beamKg > 150, `large beam ${r.made.beamKg} kg; ${r.made.cubes} cubes`);
  check('a pistol round dents steel; a rifle round goes through it', r.pistol.lost === 0 && r.pistol.through === 0 && r.rifle.lost > 0 && r.rifle.through > 0, `pistol: ${r.pistol.lost} cubes, rifle: ${r.rifle.lost} cube, ${r.rifle.through} through`);
  check('cut through, a beam comes apart into two beams that fall as they will', r.split.pieces === 2 && r.split.broken >= 1 && r.split.free, `${r.split.pieces} pieces`);
  check('a machete chops cubes out of wood', r.chops > 3, `${r.chops} cubes`);
  check('a wall with its foot cut through is no longer held up, and falls', r.fell && r.fell.free && Number(r.fellUp) < 0.9, `upright ${r.fellUp} after 3 s`);
}

/* ----------------------------- rope and wire ----------------------------- */
head('Rope and wire');
if (want('Rope')) {
  const r = await run(() => {
    const g = __game, p = g.player, w = g.weapons, R = g.ropes, out = {};
    V.stage(); R.clear();
    const aim = (b) => { for (let k = 0; k < 6; k++) { V.aimAt(b); g.advance(1 / 60); } };
    g.camPitch = -0.3;
    w.give(p, 'rope', true); g.advance(0.8);
    const crate = g.spawnCrate(p.x + 1.6, 0.6, p.z); g.advance(1);
    const v = V.still(g.spawnHuman(p.x + 2.2, p.z + 1.6, -Math.PI / 2)); g.advance(0.5);
    aim({ px: crate.body.px, py: crate.body.py + 0.2, pz: crate.body.pz });
    out.tie1 = w.attack(-1); out.label = document.querySelector('#attack-label').textContent;
    aim(v.bodies[1]);
    out.tie2 = w.attack(-1);
    out.ropes = R.list.length;
    v.brain = { update() { v.intent.mx = 0; v.intent.mz = 1; }, pause: 0, mode: 'wander' };
    const c0 = [crate.body.px, crate.body.pz];
    g.advance(6);
    out.dragged = Math.hypot(crate.body.px - c0[0], crate.body.pz - c0[1]);
    // tied to the ground: held there
    R.clear();
    const at = { kind: 'world', wp: [v.x, 0.02, v.z + 0.5] };
    const rr = R.make({ kind: 'human', human: v, part: 2, body: v.bodies[2], wp: [v.bodies[2].px, v.bodies[2].py, v.bodies[2].pz], lp: [0, 0, 0] }, at, p);
    const z0 = v.z; g.advance(6);
    out.held = v.z - z0;
    // a blade through a rope strung across at chest height, where a slash goes, with nobody in the way
    R.clear(); g.removeHuman(v);
    for (const it of w.items.slice()) w.remove(it);
    p.reset(0, -18, Math.PI / 2); g.camYaw = Math.PI / 2; g.camPitch = -0.15; g.advance(0.3);
    R.make({ kind: 'world', wp: [p.x + 0.8, 1.5, p.z - 0.8] }, { kind: 'world', wp: [p.x + 0.8, 1.5, p.z + 0.8] }, p);
    g.advance(0.2);
    w.give(p, 'knife', true); g.advance(0.8);
    for (let i = 0; i < 10 && R.list.length; i++) { if (!p.anim.busy) w.attack(i % 2); g.advance(0.35); }
    out.cut = R.list.length === 0;
    g.paused = true;
    return out;
  });
  check('TIE one thing, then TIE TO another: a rope between them', r.tie1 && r.label === 'TIE TO' && r.tie2 && r.ropes === 1);
  check('a crate on a rope is dragged by whoever walks off with the other end', r.dragged > 4, `${r.dragged.toFixed(1)} m`);
  check('somebody tied to the ground gets no further than the rope', r.held < 1.5, `${r.held.toFixed(2)} m, where they would have walked 6 m`);
  check('a blade cuts a rope', r.cut);
}

head('Electricity');
if (want('Electricity')) {
  const r = await run(() => {
    const g = __game, p = g.player, w = g.weapons, R = g.ropes, Pw = g.power, out = {};
    V.stage(); R.clear();
    const aim = (b) => { for (let k = 0; k < 6; k++) { V.aimAt(b); g.advance(1 / 60); } };
    g.camPitch = -0.3;
    const gen = g.things.spawn('generator', p.x + 1.8, p.z, 0);
    const bulb = g.things.spawn('bulb', p.x + 1.9, p.z + 1.3, 0), bulb2 = g.things.spawn('bulb', p.x + 1.9, p.z - 1.3, 0);
    const flood = g.things.spawn('flood', p.x + 3.4, p.z + 2.4, -Math.PI / 2);
    g.advance(1);
    w.give(p, 'wire', true); g.advance(0.8);
    aim({ px: gen.body.px, py: gen.body.py + 0.1, pz: gen.body.pz });
    out.wire1 = w.attack(-1); out.label = document.querySelector('#attack-label').textContent;
    aim(bulb.body);
    out.wire2 = w.attack(-1);
    const end = (o) => ({ kind: 'prop', prop: o.prop, body: o.body, wp: [o.body.px, o.body.py, o.body.pz], lp: [0, 0, 0] });
    R.make(end(bulb), end(flood), p, 'wire');
    R.make(end(gen), end(bulb2), p, 'rope');
    g.advance(0.3);
    out.offLit = bulb.lit;
    // START, by USE, standing beside it
    p.reset(gen.body.px - 1.1, gen.body.pz, Math.PI / 2); g.advance(0.3);
    out.useLabel = document.querySelector('#use-label').textContent;
    w.pickUp(); g.advance(0.8);
    out.on = { running: gen.running, bulb: bulb.lit, flood: flood.lit, roped: bulb2.lit, lights: g.lights.stats.assigned };
    // somebody with a live wire on them
    const v = V.still(g.spawnHuman(p.x + 3.2, p.z - 1.5, -Math.PI / 2)); g.advance(0.5);
    R.make(end(gen), { kind: 'human', human: v, part: 7, body: v.bodies[7], wp: [v.bodies[7].px, v.bodies[7].py, v.bodies[7].pz], lp: [0, 0, 0] }, p, 'wire');
    g.advance(2);
    out.zap = { locked: v.tased > 0, down: v.state === 2, burn: v.h.burns[7], air: v.h.air };
    g.things.use(gen); g.advance(1.2);
    out.freed = v.tased <= 0 && !Pw.zaps.has(v);
    // a round through the floodlight's glass
    for (const it of w.items.slice()) w.remove(it);
    w.give(p, 'glock', true); g.advance(0.8);
    const lens = [0, 0, 0];
    for (let i = 0; i < 8 && !flood.broken; i++) { flood.body.toWorld(0, 0.66, 0.1, lens); aim({ px: lens[0], py: lens[1], pz: lens[2] }); w.fire(); g.advance(0.25); }
    out.lens = flood.broken;
    g.paused = true;
    return out;
  });
  check('WIRE one thing, then WIRE TO another', r.wire1 && r.label === 'WIRE TO' && r.wire2);
  check('START the generator, and lights wired to it come on, one through the other', r.useLabel === 'START' && r.on.running && r.on.bulb && r.on.flood && !r.offLit && r.on.lights > 0, `bulb ${r.on.bulb}, floodlight ${r.on.flood}, ${r.on.lights} real lights`);
  check('a rope carries no power', !r.on.roped);
  check('a live wire on somebody: locked rigid, burnt where it goes in, short of air', r.zap.locked && r.zap.down && r.zap.burn > 5 && r.zap.air < 97, `burn ${r.zap.burn.toFixed(0)}, air ${r.zap.air.toFixed(0)}`);
  check('the generator off, and it lets them go', r.freed);
  check('a round through a floodlight breaks the glass', r.lens);
}

/* ------------------------------- the flamethrower ------------------------ */
head('Flamethrower and burns');
if (want('Flamethrower')) {
  const r = await run(() => {
    const g = __game, p = g.player, w = g.weapons, F = g.fire, out = {};
    V.stage();
    const aim = (b) => { for (let k = 0; k < 6; k++) { V.aimAt(b); g.advance(1 / 60); } };
    const it = w.give(p, 'flamethrower', true); g.advance(1);
    const v = g.spawnHuman(p.x + 4, p.z, -Math.PI / 2);
    const said = []; const ask = v.mind.ask.bind(v.mind); v.mind.ask = (k, ...a) => { said.push(k); return ask(k, ...a); };
    g.advance(0.6);
    aim(v.bodies[2]);
    T.press('attack'); for (let i = 0; i < 70; i++) g.advance(1 / 60); T.release('attack');
    out.fuel = it.ammo;
    out.lit = !!v.fire;
    let ran = 0, rolled = false;
    for (let i = 0; i < 40; i++) { g.advance(0.25); if (v.fire && v.state === 0 && v.speed > 2) ran++; if (v.rollT > 0) rolled = true; }
    out.burn = { area: v.h.burnArea, worst: Math.max(...v.h.burns), out: !v.fire, said: [...new Set(said)].join(','), ran, rolled };
    g.ui.toggleDoctor(true); g.ui.doctor.select(v); g.ui.update(0.3);
    out.doctor = [...document.querySelectorAll('#doc-wounds li')].map((li) => li.textContent).filter((t) => /Burn/.test(t)).length;
    g.ui.toggleDoctor(false);
    w.reload(); g.advance(3);
    out.refilled = it.ammo === it.def.mag;
    // wood catches; a crate burns down
    T.clear();
    const wall = g.voxels.wall('wood', p.x + 4, p.z, Math.PI / 2); g.advance(0.3);
    aim({ px: wall.body.px, py: 0.6, pz: wall.body.pz });
    T.press('attack'); for (let i = 0; i < 60; i++) g.advance(1 / 60); T.release('attack');
    let lit = 0;
    for (let i = 0; i < 30; i++) { g.advance(0.1); lit = Math.max(lit, wall.burning.length); }
    out.woodLit = lit;
    const n0 = wall.count; g.advance(15);
    out.woodGone = n0 - wall.count;
    const crate = g.spawnCrate(p.x + 3, 0.6, p.z + 2.5); g.advance(1);
    aim(crate.body);
    T.press('attack'); for (let i = 0; i < 90; i++) g.advance(1 / 60); T.release('attack');
    out.crateLit = !!crate.fire;
    g.advance(36);
    out.crateGone = !g.props.includes(crate);
    g.paused = true;
    return out;
  });
  check('the flamethrower uses fuel and sets people alight', r.lit && r.fuel < 95, `fuel left ${r.fuel}`);
  check('somebody on fire runs, then drops and rolls, and it goes out', r.burn.ran > 0 && r.burn.rolled && r.burn.out, `ran for ${(r.burn.ran * 0.25).toFixed(2)} s; ${r.burn.said}`);
  check('the burns are real: the medical model and the doctor show them', r.burn.area > 0.03 && r.burn.worst > 25 && r.doctor > 0, `${Math.round(r.burn.area * 100)}% of the skin, worst ${r.burn.worst.toFixed(0)}; ${r.doctor} burns listed`);
  check('a new fuel canister on reload', r.refilled);
  check('wood catches and burns away', r.woodLit > 0 && r.woodGone > 0, `${r.woodLit} cubes alight, ${r.woodGone} burnt away in 15 s`);
  check('a crate burns down', r.crateLit && r.crateGone);
}

/* ------------------------------ time of day ------------------------------ */
head('Time of day');
if (want('Time of day')) {
  const r = await run(() => {
    const g = __game, out = {};
    V.stage();
    const sel = document.querySelector('#set-tod');
    sel.value = 'night'; sel.dispatchEvent(new Event('input'));
    g.advance(0.2);
    out.night = { mode: g.daylight.mode, sun: g.sun.intensity, windows: g.city.facades[0].emissive.r, pools: g.daylight.pools.mesh.visible, lights: g.lights.stats.assigned };
    sel.value = 'day'; sel.dispatchEvent(new Event('input'));
    g.advance(0.2);
    out.day = { mode: g.daylight.mode, sun: g.sun.intensity, windows: g.city.facades[0].emissive.r, pools: g.daylight.pools.mesh.visible };
    g.paused = true;
    return out;
  });
  check('night: a dim moon, windows lit from inside, street lamps lighting the street', r.night.mode === 'night' && r.night.sun < 0.5 && r.night.windows > 0.5 && r.night.pools && r.night.lights > 0, `${r.night.lights} real lights`);
  check('and back to the afternoon', r.day.mode === 'day' && r.day.sun > 1.5 && r.day.windows === 0 && !r.day.pools);
}

head('More lines');
if (want('More lines')) {
  check('a bigger stock of lines', LINE_COUNT >= 1200, `${LINE_COUNT} lines`);
}

/* ------------------------------ armour tiers ----------------------------- */
head('Armour tiers');
if (want('Armour tiers')) {
  await run(() => { V.stage(); __game.paused = false; });
  await t.page.click('#btn-menu');
  const listed = await run(() => ['vestM', 'helmetM', 'vestS', 'helmetS', 'swat'].every((k) => !!document.querySelector(`[data-spawn="${k}"]`)));
  await t.page.click('[data-spawn="vestS"]');
  await t.page.click('[data-close="sandbox"]');
  const r = await run(() => {
    const g = __game, p = g.player, w = g.weapons, out = {};
    g.advance(1.2);
    const it = w.items.find((i) => i.type === 'vestS');
    out.spawned = !!it;
    if (it) { p.reset(it.body.px - 0.5, it.body.pz, Math.PI / 2); g.advance(0.4); out.label = document.querySelector('#use-label').textContent; w.pickUp(); g.advance(0.3); }
    out.worn = p.vest && p.vest.kind;
    out.parts = p.vest ? [...new Set(p.vest.boxes.map((b) => b.part))].sort((a, b) => a - b).join(',') : '';
    out.chip = [...document.querySelectorAll('#weapon-bar .slot')].some((b) => b.textContent === 'SWAT VEST');
    // swapped for a medium one: the S.W.A.T. vest is left where the medium one was
    const m = w.spawn('vestM', p.x + 0.4, 1, p.z); g.advance(0.6); w.pickUp(m); g.advance(0.3);
    out.swapped = p.vest && p.vest.kind === 'medium' && w.items.some((i) => i.type === 'vestS' && i.body);
    w.shedVest(); g.advance(0.5);
    for (const i of w.items.slice()) w.remove(i);
    // what each one does, shot by shot
    const mk = (vest, helm) => { const h = V.still(g.spawnHuman(p.x + 4, p.z, -Math.PI / 2)); if (vest) h.wearVest(vest); if (helm) h.wearHelmet(helm); g.advance(0.05); return h; };
    const shoot = (h, part, rifle, face = 'front', y = 0) => {
      const c = h.bodies[part], n = face === 'front' ? [0, 0, 1] : [1, 0, 0], pt = [0, 0, 0], dir = [0, 0, 0];
      c.toWorld(n[0] * c.hx, y, n[2] * c.hz, pt); c.dirToWorld(-n[0], -n[1], -n[2], dir);
      const rep = h.hit({ part, type: 'bullet', power: rifle ? 1.4 : 1, point: pt, dir, normal: n, impulse: 4, attacker: p, weapon: rifle ? 'm4a1' : 'glock', rifle, through: 0.2, hp: 32 });
      g.removeHuman(h);
      return rep.stopped;
    };
    out.lightPelvis = shoot(mk('light'), 0, false);
    out.mediumPelvis = shoot(mk('medium'), 0, false);
    out.mediumRifle = shoot(mk('medium'), 2, true);
    out.plateRifle = shoot(mk('swat'), 2, true);
    out.sideRifle = shoot(mk('swat'), 2, true, 'side');
    out.collar = shoot(mk('swat'), 3, false);
    let ear = 0, earLight = 0;
    for (let i = 0; i < 10; i++) { if (shoot(mk(null, 'medium'), 4, false, 'side', -0.04)) ear++; if (shoot(mk(null, 'light'), 4, false, 'side', -0.04)) earLight++; }
    out.ear = ear; out.earLight = earLight;
    const V2 = mk(null, 'swat'), vis = [];
    for (let i = 0; i < 4; i++) { const c = V2.bodies[4], pt = [0, 0, 0], dir = [0, 0, 0]; c.toWorld(0, -0.02, c.hz, pt); c.dirToWorld(0, 0, -1, dir); vis.push(V2.hit({ part: 4, type: 'bullet', power: 1, point: pt, dir, normal: [0, 0, 1], impulse: 1, attacker: p, weapon: 'glock', rifle: false, through: 0.2, hp: 32 }).stopped); }
    out.visor = { first: vis[0], crazed: V2.helmet.visor >= 3, last: vis[3], glass: V2.helmet.boxes.some((b) => b.glass) };
    g.removeHuman(V2);
    g.paused = true;
    return out;
  });
  check('medium and S.W.A.T. vests and helmets are in the spawn menu, and go on', listed && r.spawned && r.worn === 'swat' && r.label === 'PUT ON' && r.chip, `${r.label}, worn: ${r.worn}`);
  check('a S.W.A.T. vest covers chest, belly, hips, neck and shoulders', r.parts === '0,1,2,3,5,8', 'parts ' + r.parts);
  check('putting on another vest swaps it for the one you had', r.swapped);
  check('the medium vest covers the whole torso: a pistol round to the hips is stopped (not by a light one)', r.mediumPelvis && !r.lightPelvis);
  check('soft armour does not stop a rifle round; a S.W.A.T. plate does, front and back but not at the side', !r.mediumRifle && r.plateRifle && !r.sideRifle);
  check('the S.W.A.T. collar stops a pistol round to the neck', r.collar);
  check('a medium helmet comes down over the ears; a light one does not', r.ear >= 7 && r.earLight === 0, `${r.ear}/10 against ${r.earLight}/10`);
  check('the S.W.A.T. visor is glass you can see through, it stops a pistol round, and after three it is crazed and stops nothing', r.visor.glass && r.visor.first && r.visor.crazed && !r.visor.last);
}

/* -------------------------------- S.W.A.T. -------------------------------- */
head('S.W.A.T.');
if (want('S.W.A.T')) {
  await run(() => { V.stage(); __game.paused = false; });
  await t.page.click('#btn-menu');
  await t.page.click('[data-spawn="swat"]');
  await t.page.click('[data-close="sandbox"]');
  const r = await run(() => {
    const g = __game, out = {};
    g.advance(0.6);
    const team = g.humans.filter((h) => h.swat);
    out.n = team.length;
    out.kit = team.map((h) => ({ officer: h.officer, vest: h.vest && h.vest.kind, helm: h.helmet && h.helmet.kind, kit: (h.kit || []).map((i) => i.type).sort().join(','), dark: h.look.top === 0x1c1f26 }));
    // at two stars, the reinforcements that come out of the station are S.W.A.T.
    // (an earlier section leaves the police-ignore-you cheat on, and the suite plays as the admin, for whom it works)
    T.clear(); g.settings.cheatCops = false; g.police.reset(); g.staffStation(true); g.advance(0.3);
    g.police.raise(2, 'test', { x: g.player.x, z: g.player.z });
    let swat = 0;
    for (let i = 0; i < 40; i++) { g.advance(0.5); swat = g.humans.filter((h) => h.swat).length; if (swat) break; }
    out.reinforced = swat;
    g.police.reset();
    g.paused = true;
    return out;
  });
  check('the sandbox sends a team of four', r.n === 4, `${r.n}`);
  check('each in black, with a S.W.A.T. vest and helmet, an M4A1, a Glock, a taser and cuffs', r.kit.length === 4 && r.kit.every((k) => k.officer && k.vest === 'swat' && k.helm === 'swat' && k.kit === 'cuffs,glock,m4a1,taser' && k.dark), JSON.stringify(r.kit[0]));
  check('at two stars it is the S.W.A.T. team that comes out of the station', r.reinforced > 0, `${r.reinforced}`);
}

/* ---------------------------------- cars ---------------------------------- */
head('Cars');
if (want('Cars')) {
  const traffic = await run(() => {
    const g = __game, out = {};
    V.stage(); g.traffic.setCount(6); g.advance(2);
    const live = g.traffic.cars.filter((c) => c.mode === 'rail');
    out.n = live.length; out.drivers = live.filter((c) => c.seats[0] && c.seats[0].car === c).length;
    const c = live[0];
    out.glass = c ? c.glassMesh.material.transparent && c.glassMesh.geometry.attributes.color.itemSize === 4 && c.glassMesh.geometry.attributes.color.array[3] < 0.5 : false;
    out.interior = c ? c.innerMesh.geometry.attributes.position.count > 100 : false;
    // a driver can be seen through the windscreen (a car stopped in an empty street, somebody standing in front of it)
    const sc = g.traffic.spawnParked('sedan', -40, -18, Math.PI / 2);
    const sd = V.still(g.spawnHuman(-40, -15, 0)); g.traffic.seat(sd, sc, 0, true);
    const o = V.still(g.spawnHuman(-33, -18, -Math.PI / 2)); g.advance(0.1);
    out.seen = o.mind.canSeeHuman(sd) > 0;
    // and not through the door below the window
    const lo = [0, 0, 0]; sc.toWorld(0, 0.5, 0, lo);
    out.door = o.mind.canSee(lo[0] - 0.9, 0.5, lo[2], false, false) === 0;
    g.removeHuman(o); g.removeHuman(sd); g.traffic.remove(sc);
    out.parked = g.traffic.cars.filter((c) => c.home).length;
    g.traffic.setCount(0);
    g.paused = true;
    return out;
  });
  check('traffic has somebody at the wheel of every car', traffic.n >= 5 && traffic.drivers === traffic.n, `${traffic.drivers}/${traffic.n}`);
  check('the windows are see-through glass, with seats, a dashboard and a wheel behind them', traffic.glass && traffic.interior);
  check('and the people in the street can see the driver through it', traffic.seen);
  check('the cars parked about the city are real cars too', traffic.parked >= 6, `${traffic.parked}`);

  // the player drives: walk up, DRIVE, the pedals, the arrows, the handbrake, the door
  const drive = await run(() => {
    const g = __game, p = g.player, out = {};
    V.stage(); g.paused = false;
    // a long straight stretch of empty road, heading east
    p.reset(-46, -21, Math.PI / 2); g.advance(0.2);
    const c = g.traffic.spawnParked('sedan', -46, -18, Math.PI / 2);
    g.advance(0.3);
    const sp = c.seatAt[0], a = [0, 0, 0]; c.toWorld(sp[0] + 0.9, 0, sp[2] + 0.1, a);
    p.reset(a[0], a[2], c.yaw + Math.PI); g.advance(0.4);
    out.label = document.querySelector('#use-label').textContent;
    T.press('use'); g.advance(0.05); T.release('use'); g.advance(0.7);
    out.in = p.car === c && p.pose.sit === 1;
    const vis = (s) => { const e = document.querySelector(s); if (!e) return false; const b = e.getBoundingClientRect(); return b.width > 20 && b.height > 20; };
    out.controls = ['#btn-gas', '#btn-brake', '#btn-hand', '#btn-left', '#btn-right', '#btn-exit', '#speedo'].every(vis) && !vis('#stick-base') && !vis('#btn-attack');
    const x0 = c.x, z0 = c.z, y0 = c.yaw;
    T.press('gas'); g.advance(3); out.speed = c.speed; out.kmh = Number(document.querySelector('#speedo-v').textContent);
    out.ahead = (c.x - x0) * Math.sin(y0) + (c.z - z0) * Math.cos(y0);
    T.press('steerR'); g.advance(0.6); T.release('steerR'); T.release('gas');
    out.turned = wrapA(c.yaw - y0);
    T.press('brake'); let stopT = 0; for (let i = 0; i < 120 && c.speed > 0.3; i++) { g.advance(1 / 30); stopT += 1 / 30; } out.stopT = stopT;
    g.advance(1.5); out.rev = c.speed; out.gear = document.querySelector('#speedo-g').textContent; T.release('brake');
    T.press('gas'); g.advance(1.5); T.release('gas'); T.press('hand'); const s0 = c.speed; g.advance(1); out.hand = [s0, c.speed]; T.release('hand');
    T.press('use'); g.advance(0.05); T.release('use'); g.advance(0.8);
    out.out = !p.car && T.state(p) === 'ANIM' && Math.hypot(p.x - c.x, p.z - c.z) > 1.1;
    out.hudBack = !document.querySelector('#hud').classList.contains('driving');
    function wrapA(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
    g.paused = true;
    return out;
  });
  check('walk up to a car and DRIVE gets you in behind the wheel', drive.label === 'DRIVE' && drive.in, drive.label);
  check('in the car the controls are two pedals, a handbrake, arrows to steer and a door, and a speedometer', drive.controls);
  check('GAS drives it forward', drive.speed > 8 && drive.ahead > 12 && drive.kmh > 25, `${drive.speed.toFixed(1)} m/s (${drive.kmh} km/h) after 3 s, ${drive.ahead.toFixed(0)} m`);
  check('the right arrow turns it right', drive.turned < -0.15, `${drive.turned.toFixed(2)} rad`);
  check('BRAKE stops it, and held at a standstill backs it up', drive.stopT < 2.5 && drive.rev < -1 && drive.gear === 'R', `stopped in ${drive.stopT.toFixed(1)} s; then ${drive.rev.toFixed(1)} m/s, gear ${drive.gear}`);
  check('the handbrake brings it down', drive.hand[1] < drive.hand[0] - 3, `${drive.hand[0].toFixed(1)} -> ${drive.hand[1].toFixed(1)} m/s`);
  check('EXIT puts you back on your feet beside it', drive.out && drive.hudBack);

  const jack = await run(() => {
    const g = __game, p = g.player, out = {};
    V.stage(); g.paused = false; g.police.reset();
    const c = g.traffic.spawnParked('taxi', p.x + 4, p.z, Math.PI / 2);
    const d = g.spawnHuman(c.x, c.z + 3, 0); g.traffic.seat(d, c, 0, true);
    const w = V.still(g.spawnHuman(c.x - 2, c.z + 6, Math.PI)); g.advance(0.3);
    const sp = c.seatAt[0], a = [0, 0, 0]; c.toWorld(sp[0] + 0.9, 0, sp[2] + 0.1, a);
    p.reset(a[0], a[2], c.yaw + Math.PI); g.advance(0.4);
    out.label = document.querySelector('#use-label').textContent;
    T.press('use'); g.advance(0.05); T.release('use'); g.advance(2.5);
    out.in = p.car === c; out.out = !d.car; out.hurt = d.h.wounds.length; out.alive = d.h.alive;
    out.fear = Math.round(d.mind.emo.fear); out.anger = Math.round(d.mind.emo.anger);
    out.knows = d.mind.memory.some((m) => /dragged out of my own car/.test(m.text));
    out.saw = w.mind.memory.some((m) => /out of their car/.test(m.text));
    g.traffic.exit(p);
    g.paused = true;
    return out;
  });
  check('a car with somebody at the wheel: CARJACK pulls them out and you are in', jack.label === 'CARJACK' && jack.in && jack.out, jack.label);
  check('they come out of it frightened and angry, not hurt', jack.alive && jack.hurt === 0 && jack.fear > 30 && jack.anger > 25 && jack.knows, `fear ${jack.fear}, anger ${jack.anger}, ${jack.hurt} wounds`);
  check('and whoever saw it knows what they saw', jack.saw);

  // crashes: the same wall at different speeds
  const crash = await run(() => {
    const g = __game, W = g.world, out = {};
    V.stage(); g.paused = false;
    for (const [v, k] of [[4.2, 15], [8.3, 30], [13.9, 50], [25, 90]]) {
      const c = g.traffic.spawnParked('sedan', 0, 18, Math.PI / 2);
      c.mode = 'loose'; c.hand = 0;
      const d0 = W.rayWorld(c.x, 0.8, c.z, 1, 0, 0, 80);
      c.x += d0 - 6.5; c.vx = v; c.vz = 0; c.place(0);
      for (let i = 0; i < 150; i++) g.advance(1 / 60);
      const pos = c.shellMesh.geometry.attributes.position.array, base = c.base; let m = 0;
      for (let i = 0; i < pos.length; i += 3) m = Math.max(m, Math.hypot(pos[i] - base[i], pos[i + 1] - base[i + 1], pos[i + 2] - base[i + 2]));
      out[k] = { hp: Math.round(c.hp), smoke: c.smoke, fire: c.fire >= 0, dent: +m.toFixed(2), glass: c.windows.filter((w) => w && (w.broken || w.cracks > 0)).length };
      if (k === 50) { const grey = []; for (const h of [80, 60, 40, 10]) { c.hp = h; grey.push(c.smoke); } out.levels = grey.join(','); }
      if (k === 90) { out.boom = c.boomT; g.advance(c.boomT + 0.5); out.wreck = c.wreck && !c.drivable; }
      g.traffic.remove(c);
    }
    g.paused = true;
    return out;
  });
  check('a knock at 15 km/h is a dent in the bumper and nothing more', crash[15].dent > 0.02 && crash[15].dent < 0.2 && crash[15].hp > 95 && crash[15].smoke === 0, JSON.stringify(crash[15]));
  check('at 50 km/h the front is crushed half a metre and the engine smokes', crash[50].dent > 0.4 && crash[50].smoke >= 2 && !crash[50].fire, JSON.stringify(crash[50]));
  check('smoke: light grey when lightly damaged, grey when worse, dark grey when nearly done', crash.levels === '0,1,2,3', crash.levels);
  check('at 90 km/h it is finished: it catches fire, then goes up, and is a wreck nobody can drive', crash[90].fire && crash.wreck, JSON.stringify(crash[90]));

  // gunfire: through the windscreen into the driver; the engine until it burns and goes up
  const guns = await run(() => {
    const g = __game, p = g.player, w = g.weapons, out = {};
    V.stage(); g.paused = false;
    const c = g.traffic.spawnParked('sedan', p.x + 8, p.z, -Math.PI / 2);
    const d = V.still(g.spawnHuman(c.x, c.z + 3, 0)); g.traffic.seat(d, c, 0, true); g.advance(0.3);
    const head = d.bodies[4], dir = [head.px - p.x, head.py - 1.5, head.pz - p.z], l = Math.hypot(...dir);
    w._bullet(p, { id: 'glock', power: 1, impulse: 3, hp: 32 }, p.x, 1.5, p.z, dir[0] / l, dir[1] / l, dir[2] / l, 1, 0);
    g.advance(0.3);
    out.screen = c.windows[0].cracks > 0; out.driverHit = d.h.wounds.length > 0;
    out.stillSeated = d.car === c;
    // the engine, a rifle round at a time
    const by = V.still(g.spawnHuman(c.x + 2, c.z + 3.5, 0)); g.advance(0.1);
    let n = 0;
    while (c.fire < 0 && n < 80) { const a = [0, 0, 0]; c.toWorld(0, 0.7, 1.7, a); w._bullet(p, { id: 'ak47', rifle: true, power: 1.4, impulse: 6, hp: 40, pierce: true }, a[0], 3, a[2] + 0.01, 0, -1, 0, 1.4, 0); n++; }
    out.rounds = n; out.burning = c.fire >= 0;
    g.advance(c.boomT - c.fire + 0.4);
    out.wreck = c.wreck; out.free = !c.body.kinematic;
    out.thrown = T.state(by) === 'RAGDOLL'; out.blastHurt = by.h.wounds.length;
    out.driverOut = !d.car;
    out.wanted = g.police.wanted;
    g.advance(2);
    out.debris = g.traffic.debris.length;
    g.police.reset();
    g.paused = true;
    return out;
  });
  check('a round through the windscreen stars the glass and hits the driver behind it, who stays in the seat', guns.screen && guns.driverHit && guns.stillSeated);
  check('rounds into the engine set it on fire', guns.burning && guns.rounds < 60, `${guns.rounds} rifle rounds`);
  check('then it explodes: a free wreck, pieces everywhere, the bystander thrown and hurt, the body in it thrown out', guns.wreck && guns.free && guns.debris > 3 && guns.thrown && guns.blastHurt > 0 && guns.driverOut, `${guns.debris} pieces, bystander ${guns.blastHurt} wounds`);
  check('blowing up a car makes you wanted', guns.wanted >= 2, `${guns.wanted} stars`);

  const road = await run(() => {
    const g = __game, out = {};
    V.stage(); g.paused = false;
    const v = V.still(g.spawnHuman(-17.14, -33, Math.PI / 2)); g.advance(0.1); v.h.ko = 90; v.toRagdoll(); g.advance(1.5);
    const pel = v.bodies[0];
    const c = g.traffic.spawnParked('sedan', pel.px - 0.86, pel.pz - 8, 0); c.mode = 'loose'; c.hand = 0; c.vz = 7; c.place(0);
    const r0 = g.traffic.stats.runOver;
    for (let i = 0; i < 150; i++) g.advance(1 / 60);
    out.crushed = g.traffic.stats.runOver - r0; out.wounds = v.h.wounds.length;
    out.broken = Object.values(v.h.bones).filter((b) => b < 60).length;
    // a standing person, hit at 40 km/h
    const s = V.still(g.spawnHuman(5, 18, 0)); g.advance(0.2);
    const c2 = g.traffic.spawnParked('sedan', -6, 18, Math.PI / 2); c2.mode = 'loose'; c2.hand = 0; c2.vx = 11; c2.place(0);
    for (let i = 0; i < 90; i++) g.advance(1 / 60);
    out.struck = T.state(s) !== 'ANIM'; out.struckWounds = s.h.wounds.length; out.dented = c2.dents > 0;
    // a traffic driver knocked off the rails gets back into the traffic
    g.traffic.setCount(3); g.advance(1);
    const t = g.traffic.cars.find((c) => c.mode === 'rail' && c.seats[0]);
    g.traffic.loosen(t); t.vx += Math.cos(t.yaw) * 3; t.vz -= Math.sin(t.yaw) * 3;
    let back = -1; for (let i = 0; i < 60; i++) { g.advance(0.5); if (t.mode === 'rail') { back = i * 0.5; break; } }
    out.rejoined = back;
    g.traffic.setCount(0);
    g.paused = true;
    return out;
  });
  check('anyone lying in the road is driven over: crushed, with bones broken', road.crushed > 0 && road.wounds > 2 && road.broken > 0, `${road.crushed} times under a wheel, ${road.wounds} wounds, ${road.broken} bones broken`);
  check('somebody standing in the road is knocked down, and dents the car', road.struck && road.struckWounds > 0 && road.dented);
  check('a driver knocked off the lane stops, then drives back into the traffic', road.rejoined > 0 && road.rejoined < 40, `back in ${road.rejoined} s`);

  const flee = await run(() => {
    const g = __game, p = g.player, out = {};
    V.stage(); g.paused = false;
    const c = g.traffic.spawnParked('sedan', p.x + 4, p.z - 4, Math.PI / 2);
    const h = g.spawnHuman(p.x + 4, p.z - 1.5, 0); g.advance(0.3);
    h.mind.p.bravery = 0.5; h.mind.p.temper = 0.1;      // somebody who runs: not brave enough to fight, not so timid they freeze
    h.mind.stir('fear', 90); h.mind._threaten(p, 90); h.brain.mode = 'flee'; h.brain.modeT = 2; h.brain.carLook = 0;
    let t0 = -1;
    for (let i = 0; i < 80; i++) { g.advance(0.25); if (h.car === c && t0 < 0) t0 = i * 0.25; if (h.car && Math.abs(c.speed) > 2) break; }
    out.took = t0; out.driving = h.car === c && Math.abs(c.speed) > 2;
    g.paused = true;
    return out;
  });
  check('someone running for their life gets into an empty car and drives it away', flee.took >= 0 && flee.driving, `in after ${flee.took} s`);

  await run(() => { V.stage(); __game.paused = false; });
  await t.page.click('#btn-menu');
  const carsListed = await run(() => ['car', 'policecar', 'van'].every((k) => !!document.querySelector(`[data-spawn="${k}"]`)));
  await t.page.click('[data-spawn="policecar"]');
  await t.page.click('[data-close="sandbox"]');
  const spawned = await run(() => { const g = __game; g.advance(0.3); const c = g.traffic.cars.find((c) => c.spawned); const out = { kind: c && c.kind }; g.cleanUp('cars'); out.cleaned = !g.traffic.cars.some((c) => c.spawned); g.paused = true; return out; });
  check('cars, a police car and a van are in the spawn menu, and clean up', carsListed && spawned.kind === 'police' && spawned.cleaned);
}

/* ---------------------------------- gore ---------------------------------- */
head('Gore');
if (want('Gore')) {
  const r = await run(() => {
    const g = __game, p = g.player, out = {};
    V.stage(); g.paused = false;
    const v = V.still(T.dummy(1.6)); g.advance(0.2);
    v.sever(6, [0, 1, 0]); g.advance(0.3);
    out.caps = (v.caps || []).length;
    out.capsOn = v.caps ? [...new Set(v.caps.map((c) => c.part))].sort().join(',') : '';
    const cols = (v.caps || []).map((c) => [g.boxes.c[c.idx * 3], g.boxes.c[c.idx * 3 + 1], g.boxes.c[c.idx * 3 + 2]]);
    out.bone = cols.some((c) => c[0] > 0.7 && c[1] > 0.65 && c[2] > 0.5);
    // a burst head: bone and brain among the pieces
    const n0 = g.gore.gibsList.length;
    v.burst(4, [0, 2, 0]); g.advance(0.1);
    const pieces = g.gore.gibsList.slice(n0).map((o) => g.boxes.c[o.idx * 3] * 1000 | 0);
    out.gibs = pieces.length; out.mixed = new Set(pieces).size;
    // dragged along the ground, bleeding: a smear behind
    const u = V.still(T.dummy(2.5, 2)); g.advance(0.2);
    u.h.hit({ part: 1, type: 'cut', power: 2.5, lp: [0, 0, 0.09], ln: [0, 0, 1], ld: [0, 0, -1] });
    u.toRagdoll(); g.advance(1);
    const t0 = g.gore.stats.trails || 0;
    for (let i = 0; i < 60; i++) { for (const b of u.bodies) { b.vx = 2.2; b.vz = 0; } g.advance(1 / 30); }
    out.trails = (g.gore.stats.trails || 0) - t0;
    // blood thrown on to a car lands on it
    const c = g.traffic.spawnParked('sedan', p.x + 3, p.z - 4, 0); g.advance(0.2);
    const k0 = g.gore.stats.onCars || 0;
    g.gore.burst(c.x + 1.6, 1.0, c.z, -1, 0.2, 0, 40, 4, 0.3); g.advance(1.5);
    out.onCar = (g.gore.stats.onCars || 0) - k0;
    // and pools dry dark
    const G = g.gore, i = G._groundDecal(G.constructor && DECAL_SPLAT(), p.x, 0, p.z, 0.4, 0.4, 0);
    G.gInfo[i].born -= 400; G._dry();
    out.dry = G.ground.col ? G.ground.col[i * 16 + 1] : (G.gInfo[i].dry || 0);
    out.dryK = G.gInfo[i].dry || 0;
    g.traffic.remove(c);
    g.paused = true;
    return out;
    function DECAL_SPLAT() { return [0, 0, 0.1, 0.1]; }
  });
  check('a severed stump has a ring of flesh and the end of the bone standing proud of it, on both sides of the cut', r.caps >= 6 && r.capsOn === '5,6' && r.bone, `${r.caps} pieces on parts ${r.capsOn}`);
  check('a head that bursts throws bone and brain with the blood', r.gibs >= 8 && r.mixed >= 6, `${r.gibs} pieces, ${r.mixed} kinds`);
  check('somebody bleeding who is dragged along the ground leaves a smear the way they went', r.trails > 2, `${r.trails} smears`);
  check('blood that lands on a car stays on the car', r.onCar > 2, `${r.onCar} marks`);
  check('blood on the ground goes dark as it dries', r.dryK > 0.9, `${r.dryK}`);
}

/* --------------------------------- pushing -------------------------------- */
head('Pushing people');
if (want('Pushing people')) {
  const r = await run(() => {
    const g = __game, p = g.player, inp = __ts.input, out = {};
    V.stage(); g.paused = false;
    // somebody standing in the road, and you walk into them and keep walking
    const h = V.still(g.spawnHuman(1.2, -18, -Math.PI / 2)); g.advance(0.3);
    const x0 = h.x, said0 = h.mind.want.length;
    inp.move.y = 0.4;
    let asked = false;
    for (let i = 0; i < 12; i++) { g.advance(0.25); if (h.mind.want.some((w) => w.kind === 'bump') || h.mind.memory.some((m) => m.kind === 'pushed')) asked = true; }
    inp.move.y = 0;
    out.pushed = h.x - x0; out.gap = Math.hypot(p.x - h.x, p.z - h.z); out.upright = T.state(h) === 'ANIM'; out.noticed = asked;
    out.faceErr = Math.abs(((Math.atan2(p.x - h.x, p.z - h.z) - h.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    out.facing = out.faceErr < 0.6;
    out.mem = h.mind.memory.slice(-3).map((m) => m.kind).join(',');
    // and run into somebody: they go over, or stagger
    V.stage(); g.paused = false;
    const k = V.still(g.spawnHuman(5, -18, -Math.PI / 2)); g.advance(0.3);
    inp.move.y = 1;
    let knocked = false;
    for (let i = 0; i < 25 && !knocked; i++) { g.advance(0.1); knocked = T.state(k) !== 'ANIM'; }
    inp.move.y = 0;
    out.knocked = knocked;
    g.paused = true;
    return out;
  });
  check('walk into somebody and keep walking: you push them back as you go', r.pushed > 1.2 && r.gap < 1.2 && r.upright, `${r.pushed.toFixed(2)} m in 3 s, still on their feet`);
  check('they face whoever is pushing them, and mind it', r.facing && r.noticed, `facing off by ${r.faceErr.toFixed(2)} rad; noticed ${r.noticed} (${r.mem})`);
  check('run into somebody and they are knocked off their feet', r.knocked);
}

head('Black-powder guns');
if (want('Black-powder guns')) {
  await run(() => { V.stage(); __game.paused = false; });
  await t.page.click('#btn-menu');
  const listed = await run(() => ['musket', 'arquebus', 'blunderbuss', 'sword', 'crowbar'].every((k) => !!document.querySelector(`[data-spawn="${k}"]`)));
  await t.page.click('[data-close="sandbox"]');
  const r = await run(() => {
    const g = __game, p = g.player, W = g.weapons, out = {};
    for (const gun of ['musket', 'arquebus', 'blunderbuss']) {
      V.stage(); g.paused = false;
      const it = W.give(p, gun, true); g.advance(1.2);
      const d = it.def, keep = d.misfire; d.misfire = 0;
      const o = out[gun] = { held: p.weapon === it, ammo: it.ammo };
      const h = V.still(g.spawnHuman(p.x + 3.2, p.z, -Math.PI / 2)); g.advance(0.3);
      // (turning the camera moves it, so aim, let it settle, and aim again)
      for (let i = 0; i < 3; i++) { V.aimAt(h.bodies[2]); g.advance(1 / 60); }
      V.aimAt(h.bodies[2]);
      const fx0 = g.gore.fxList.length;
      o.fired = W.fire(); o.lit = !!W.lockT;
      g.advance(0.04); o.waits = it.ammo === 1;
      g.advance(0.5); o.went = it.ammo === 0;
      o.smoke = g.gore.fxList.length - fx0;
      o.holes = h.h.wounds.filter((w) => w.type === 'gunshot').length;
      // loading it again: long, from the muzzle, and it ends loaded
      g.advance(0.8); W.reload(); o.loading = !!p.reload; o.dur = p.reload ? p.reload.dur : 0;
      let rod = false, near = 9, lock = 9;
      const a = [0, 0, 0];
      for (let i = 0; i < (o.dur + 0.6) * 20 && (p.reload || i < 5); i++) {
        g.advance(0.05);
        if (it.magOut) rod = true;
        const r = p.reload, u = r ? r.t / r.dur : 1;
        if (r && it.muzzleWorld) {
          p.palmAt(0, a);
          const m = it.muzzleWorld, l = it.lockWorld;
          if (u > 0.3 && u < 0.75) near = Math.min(near, Math.hypot(a[0] - m[0], a[1] - m[1], a[2] - m[2]));
          if (l && u > 0.86 && u < 0.95) lock = Math.min(lock, Math.hypot(a[0] - l[0], a[1] - l[1], a[2] - l[2]));
        }
      }
      o.rod = rod; o.near = near; o.lock = lock; o.reloaded = it.ammo === 1 && !p.reload;
      d.misfire = keep;
    }
    // a flash in the pan: nothing comes out of the barrel, and it is still loaded
    V.stage(); g.paused = false;
    const m = W.give(p, 'musket', true); g.advance(1.2);
    const keep = m.def.misfire; m.def.misfire = 1;
    W.fire(); g.advance(0.6); out.misfire = m.ammo === 1 && !W.lockT;
    m.def.misfire = keep;
    // the left hand out along the stock, not by the right
    const a = [0, 0, 0]; p.palmAt(0, a);
    const q = m.q, fx = 2 * (q[0] * q[2] + q[3] * q[1]), fy = 2 * (q[1] * q[2] - q[3] * q[0]), fz = 1 - 2 * (q[0] * q[0] + q[1] * q[1]);
    out.fore = (a[0] - m.px) * fx + (a[1] - m.py) * fy + (a[2] - m.pz) * fz;
    // what armour makes of a ball, and of shot
    const mk = (vest) => { const h = V.still(g.spawnHuman(p.x + 4, p.z, -Math.PI / 2)); if (vest) h.wearVest(vest); g.advance(0.05); return h; };
    const shoot = (vest, kind) => {
      let stopped = 0;
      for (let i = 0; i < 12; i++) {
        const h = mk(vest), c = h.bodies[2], pt = [0, 0, 0], dir = [0, 0, 0];
        c.toWorld(0, 0, c.hz, pt); c.dirToWorld(0, 0, -1, dir);
        const rep = h.hit({ part: 2, type: 'bullet', power: kind === 'shot' ? 0.48 : 1.75, point: pt, dir, normal: [0, 0, 1], impulse: 4, attacker: p, weapon: kind === 'shot' ? 'blunderbuss' : 'musket', ball: kind === 'ball', shot: kind === 'shot', through: 0.2, hp: kind === 'shot' ? 10 : 36 });
        if (rep.stopped) stopped++;
        g.removeHuman(h);
      }
      return stopped;
    };
    out.shotLight = shoot('light', 'shot'); out.ballSwat = shoot('swat', 'ball'); out.ballLight = shoot('light', 'ball');
    // a pellet is a small hole; a ball a big one
    const bare = (kind) => { const h = mk(null), c = h.bodies[2], pt = [0, 0, 0], dir = [0, 0, 0]; c.toWorld(0, 0, c.hz, pt); c.dirToWorld(0, 0, -1, dir); h.hit({ part: 2, type: 'bullet', power: kind === 'shot' ? 0.48 : 1.75, point: pt, dir, normal: [0, 0, 1], impulse: 4, attacker: p, weapon: 'musket', ball: kind === 'ball', shot: kind === 'shot', through: 0.2, hp: 10 }); const w = h.h.wounds.find((x) => x.type === 'gunshot'); const v = w ? w.size : 0; g.removeHuman(h); return v; };
    out.pellet = bare('shot'); out.ball = bare('ball');
    // people know what it is
    const o = V.still(g.spawnHuman(p.x + 3, p.z, -Math.PI / 2)); g.advance(2.5);
    out.seen = o.mind.memory.some((x) => /musket/.test(x.text || ''));
    g.removeHuman(o);
    g.paused = true;
    return out;
  });
  check('the musket, arquebus, blunderbuss, sword and crowbar are in the sandbox', listed);
  for (const gun of ['musket', 'arquebus', 'blunderbuss']) {
    const o = r[gun];
    check(`${gun}: the priming flashes first, then the charge goes off`, o.held && o.fired && o.lit && o.waits && o.went, `lit ${o.lit}, waited ${o.waits}, went ${o.went}`);
    check(`${gun}: a cloud of white smoke`, o.smoke >= 8, `${o.smoke} puffs`);
    check(`${gun}: it hits what it is aimed at`, o.holes >= (gun === 'blunderbuss' ? 3 : 1), `${o.holes} holes`);
    check(`${gun}: loaded from the muzzle: powder, ball, the rod run down it, the pan primed`, o.loading && o.dur >= 6 && o.rod && o.reloaded, `${o.dur.toFixed(1)} s, rod drawn ${o.rod}, loaded ${o.reloaded}`);
    check(`${gun}: the left hand goes to the muzzle, then to the lock`, o.near < 0.5 && o.lock < 0.25, `${o.near.toFixed(2)} m from the muzzle, ${o.lock.toFixed(2)} m from the lock`);
  }
  check('a flash in the pan leaves it loaded', r.misfire);
  check('the left hand holds the musket out along the stock', r.fore > 0.06, `${r.fore.toFixed(2)} m forward of the grip`);
  check('soft armour stops buckshot; a plate stops a musket ball; soft armour only sometimes does', r.shotLight === 12 && r.ballSwat === 12 && r.ballLight < 12, `shot ${r.shotLight}/12 on a light vest, ball ${r.ballSwat}/12 on a plate, ${r.ballLight}/12 on a light vest`);
  check('a pellet of shot makes a small hole, a musket ball a big one', r.pellet > 0 && r.ball > r.pellet * 2, `${r.pellet.toFixed(3)} against ${r.ball.toFixed(3)}`);
  check('people know a musket when they see one', r.seen);
}

head('Sword and crowbar');
if (want('Sword and crowbar')) {
  const r = await run(() => {
    const g = __game, p = g.player, W = g.weapons, out = {};
    for (const w of ['sword', 'crowbar']) {
      V.stage(); g.paused = false;
      W.give(p, w, true); g.advance(0.9);
      const h = T.dummy(1.15); g.advance(0.4);
      h.h.tough = 1;
      for (let m = 0; m < 4; m++) { W.attack(m); g.advance(1.1); if (T.state(h) !== 'ANIM') break; }
      out[w] = { moves: W.def.moves.join(','), wounds: h.h.wounds.map((x) => x.type), down: T.state(h) !== 'ANIM', bloody: p.weapon.bloody };
    }
    // a sword's reach: further than a knife's
    out.reach = W.def ? 0 : 0;
    V.stage(); g.paused = false;
    W.give(p, 'crowbar', true); g.advance(0.9);
    const car = g.traffic.spawnParked('car', p.x + 2.3, p.z, 0); g.advance(0.5);
    const d0 = car.dents, w0 = car.windows.filter((x) => x && x.broken).length;
    for (let i = 0; i < 4; i++) { g.camPitch = i < 2 ? -0.15 : 0.05; W.attack(i % 4); g.advance(1); }
    out.dents = car.dents - d0; out.windows = car.windows.filter((x) => x && x.broken).length - w0;
    // a rope is not cut by a bar
    out.ropes = g.ropes.list.length;
    g.paused = true;
    return out;
  });
  check('the sword slashes, thrusts and cleaves: cuts, and it can take a limb', r.sword.down && r.sword.wounds.some((x) => x === 'slash' || x === 'stab' || x === 'stump'), r.sword.wounds.join(','));
  check('the crowbar beats: bruises and broken bones, no cuts', r.crowbar.down && r.crowbar.wounds.length > 0 && r.crowbar.wounds.every((x) => x === 'bruise' || x === 'crush'), r.crowbar.wounds.join(','));
  check('a crowbar dents a car and breaks its windows', r.dents >= 1 && r.windows >= 1, `${r.dents} dents, ${r.windows} windows`);
}

head('Grab and drag');
if (want('Grab and drag')) {
  await run(() => { V.stage(); __game.paused = false; });
  const r = await run(() => {
    const g = __game, p = g.player, G = g.grab, out = {};
    V.stage(); g.paused = false;
    // somebody out cold on the ground in front
    const h = V.still(g.spawnHuman(p.x + 1.1, p.z + 0.2, 0)); g.advance(0.3);
    h.h.ko = 80; h.h.faint = 80; h.toRagdoll(); g.advance(2.5);
    g.camPitch = -0.3;
    const n = G.find();
    out.found = n && n.human === h; out.where = n && n.where; out.label = document.querySelector('#grab-label').textContent;
    out.button = !document.querySelector('#btn-grab').hidden;
    T.press('grab'); g.advance(0.05); T.release('grab');
    // the arm goes out to it, the body bending down for it, the fingers opening
    let stoop = 0, open = false;
    for (let i = 0; i < 40 && G.hold && G.hold.phase === 'reach'; i++) { g.advance(1 / 30); stoop = Math.max(stoop, p.stoop); if (p.grasp[1] === 0 || p.grasp[0] === 0) open = true; }
    out.stoop = stoop; out.open = open;
    out.held = !!G.hold && G.hold.phase === 'hold';
    g.advance(0.4);
    const a = [0, 0, 0], b = [0, 0, 0], H = G.hold;
    if (H) { const e = H.hands[0]; p.palmAt(e.side, a); H.body.toWorld(e.lp[0], e.lp[1], e.lp[2], b); out.gap = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); out.curl = p.curl[e.side]; }
    out.prints = !!(h.prints && h.prints.has(p.id));
    // walking backward: they come too
    const pel = h.bodies[0], x0 = pel.px;
    __ts.input.move.y = -1; g.advance(3); __ts.input.move.y = 0; g.advance(0.3);
    out.dragged = Math.abs(pel.px - x0); out.speed = p.dragMax; out.still = !!G.hold;
    out.gap2 = Math.hypot(p.x - pel.px, p.z - pel.pz);
    // and let go
    T.press('grab'); g.advance(0.05); T.release('grab'); g.advance(0.2);
    out.let = !G.hold && p.dragMax === Infinity && p.grasp[0] < 0 && p.grasp[1] < 0;
    // they come round while being dragged: they pull free
    T.press('grab'); g.advance(0.05); T.release('grab');
    for (let i = 0; i < 40 && !(G.hold && G.hold.phase === 'hold'); i++) g.advance(0.1);
    const held2 = !!G.hold && G.hold.phase === 'hold';
    h.h.ko = 0; h.h.faint = 0; h.h.concussion = 0; g.advance(4);
    out.freed = held2 && !G.hold && G.why === 'freed';
    // somebody standing is not something you can take hold of
    V.stage(); g.paused = false;
    const s = V.still(g.spawnHuman(p.x + 1.0, p.z, -Math.PI / 2)); g.advance(0.5);
    g.camPitch = -0.05;
    const n2 = G.find();
    out.standing = !n2 || n2.human !== s;
    // a crate: dragged along the ground, not lifted
    V.stage(); g.paused = false;
    const c = g.spawnCrate(p.x + 1.2, 0.45, p.z); g.advance(1); g.camPitch = -0.3;
    T.press('grab'); g.advance(0.05); T.release('grab'); g.advance(1.3);
    out.crateHeld = !!G.hold && G.hold.phase === 'hold' && !G.hold.carry;
    const cx0 = c.body.px; let high = 0;
    __ts.input.move.y = -1;
    for (let i = 0; i < 20; i++) { g.advance(0.1); high = Math.max(high, c.body.py); }
    __ts.input.move.y = 0; g.advance(0.3);
    out.crateMoved = Math.abs(c.body.px - cx0); out.crateHigh = high; out.crateStill = !!G.hold;
    G.clear();
    // something light: carried, then thrown
    V.stage(); g.paused = false;
    g.things.spawn('bulb', p.x + 0.8, p.z + 0.1, 0); g.advance(1);
    const bulb = g.props.find((o) => o.thing && o.thing.type === 'bulb').body;
    T.press('grab'); g.advance(0.05); T.release('grab'); g.advance(1.3);
    out.carry = !!G.hold && G.hold.carry && G.hold.phase === 'hold'; out.carryY = bulb.py - p.y;
    out.throwLabel = document.querySelector('#attack-label').textContent;
    g.camPitch = 0.1;
    T.press('attack'); g.advance(0.05); T.release('attack'); g.advance(0.15);
    out.thrown = !G.hold && Math.hypot(bulb.vx, bulb.vz) > 3;
    // somebody watching sees a body dragged
    V.stage(); g.paused = false;
    const v = V.still(g.spawnHuman(p.x + 1.1, p.z + 0.2, 0)); g.advance(0.3);
    v.h.ko = 80; v.h.faint = 80; v.toRagdoll(); g.advance(2);
    const w = V.still(g.spawnHuman(p.x + 2, p.z + 5, Math.PI)); g.advance(0.5);
    g.camPitch = -0.3;
    T.press('grab'); g.advance(0.05); T.release('grab'); g.advance(1.5);
    out.witness = w.mind.memory.some((m) => m.kind === 'drag');
    G.clear();
    g.paused = true;
    return out;
  });
  check('an unconscious person on the ground can be taken hold of: GRAB shows DRAG', r.found && r.button && r.label === 'DRAG', `${r.where}, button ${r.button} "${r.label}"`);
  check('reaching for them: the body bends down, the hand opens, the arm goes to them', r.stoop > 0.6 && r.open && r.held, `stoop ${r.stoop.toFixed(2)}, open ${r.open}, held ${r.held}`);
  check('the hand closes round the wrist and holds it', r.gap < 0.12 && r.curl > 0.7, `${(r.gap || 0).toFixed(3)} m from palm to wrist, curl ${(r.curl || 0).toFixed(2)}`);
  check('bare hands leave prints on them', r.prints);
  check('walking backward drags them along, slower than a walk', r.dragged > 1.8 && r.still && r.speed < 1.9 && r.gap2 < 2.2, `${r.dragged.toFixed(2)} m, top speed ${r.speed.toFixed(2)}, ${r.gap2.toFixed(2)} m behind`);
  check('GRAB again lets go', r.let);
  check('somebody who comes round while being dragged pulls free', r.freed);
  check('somebody standing cannot be grabbed', r.standing);
  check('a crate is dragged along the ground, not lifted', r.crateHeld && r.crateMoved > 1 && r.crateHigh < 0.6 && r.crateStill, `${r.crateMoved.toFixed(2)} m, never higher than ${r.crateHigh.toFixed(2)}`);
  check('something light is carried in front, and ATTACK throws it', r.carry && r.carryY > 0.6 && r.throwLabel === 'THROW' && r.thrown, `carried at ${r.carryY.toFixed(2)} m, button "${r.throwLabel}", thrown ${r.thrown}`);
  check('somebody watching remembers a body being dragged', r.witness);
}

head('Special abilities');
if (want('Special abilities')) {
  await run(async () => { await V.admin(); V.stage(); __game.paused = false; __game.powers.forget(); });
  await t.page.click('#btn-abilities');
  const menu = await run(() => {
    const a = document.querySelector('#btn-abilities').getBoundingClientRect(), b = document.querySelector('#btn-menu').getBoundingClientRect();
    return { open: !document.querySelector('#abilities').hidden, beside: Math.abs(a.top - b.top) < 4 && a.left > b.left && a.left - b.right < 20,
      tempest: !!document.querySelector('#abilities [data-ability="tempest"]'), fruit: !!document.querySelector('#abilities .item.fruit') };
  });
  await t.page.click('#abilities [data-ability="tempest"]');
  const r = await run(() => {
    const g = __game, p = g.player, P = g.powers, out = {};
    out.power = !document.querySelector('#btn-power').hidden && document.querySelector('#power-label').textContent === 'TEMPEST' && document.querySelector('#abilities').hidden;
    const dummy = (d, side = 0) => { const h = V.still(g.spawnHuman(p.x + d, p.z + side, -Math.PI / 2)); h.h.tough = 1; g.advance(0.3); return h; };
    const fresh = () => { V.stage(); g.paused = false; P.clear(); for (const k in P.cool) P.cool[k] = 0; };
    const holes = (h) => h.h.wounds.filter((w) => w.type === 'gunshot').length;
    const alight = (h) => !!(h.fire && Array.from(h.fire).some((v) => v > 0)) || h.h.burns.some((b) => b > 0);
    // Tempest Kick needs no fruit
    fresh();
    let h = dummy(6); g.camPitch = -0.02;
    out.tempestUsed = P.use('tempest'); g.advance(0.45);
    out.slashFlying = P.shots.some((o) => o.kind === 'slash');
    g.advance(1.2);
    out.tempestCut = h.h.wounds.some((w) => w.type === 'slash' || w.type === 'cut' || w.type === 'stump');
    out.fruitLocked = !P.use('finger');
    // the fruit
    fresh();
    out.eating = P.eat(); g.advance(1.0); out.handUp = !!(p.reachT[0] && p.reachT[0].eat);
    g.advance(2); out.fruit = P.fruit; out.label = document.querySelector('#power-label').textContent;
    // Finger Pistol
    fresh(); h = dummy(1.15);
    P.use('finger'); g.advance(0.12); out.pointing = p.point[1] > 0.5 || p.point[0] > 0.5; g.advance(0.8);
    out.fingerHole = holes(h) >= 1;
    // Leo's Flame
    fresh(); h = dummy(8);
    const fb0 = P.stats.fireballs, fh0 = P.stats.fireHits;
    P.use('flame'); g.advance(3);
    out.fireballs = P.stats.fireballs - fb0; out.fireHits = P.stats.fireHits - fh0; out.alight = alight(h);
    // Swirling Kick
    fresh(); h = dummy(7); g.camPitch = -0.02;
    const b0 = P.stats.bursts;
    P.use('swirl'); g.advance(0.6); out.ring = P.shots.some((o) => o.kind === 'ring'); g.advance(1.2);
    out.burst = P.stats.bursts - b0; out.swirlDown = T.state(h) !== 'ANIM'; out.swirlFire = alight(h);
    // Leopard Leap
    fresh(); h = dummy(4.2);
    const l0 = P.stats.leapHits;
    P.use('leap'); g.advance(0.2); out.airborne = !p.grounded; g.advance(1.2);
    out.leapHit = P.stats.leapHits - l0; out.leapHoles = holes(h);
    // Hybrid
    fresh(); h = dummy(1.0);
    P.use('hybrid'); g.advance(0.5);
    out.hybrid = P.form === 'hybrid' && p.coat != null && p.claws && p.beast && p.anim.speedUp > 1 && p.powerMul > 1;
    const cut = (w) => w.type === 'slash' || w.type === 'cut';
    for (let i = 0; i < 4 && !h.h.wounds.some(cut); i++) { g.weapons.attack(i % 3); g.advance(0.6); }
    out.clawed = h.h.wounds.some(cut);
    out.hybridWounds = h.h.wounds.map((w) => w.type).join(',') + ' d=' + Math.hypot(h.x - p.x, h.z - p.z).toFixed(2) + ' ' + T.state(h);
    P.cool.hybrid = 0; P.use('hybrid'); g.advance(0.3);
    out.hybridOff = !P.form && p.coat == null && !p.claws && p.powerMul === 1;
    // Full Leopard, with somebody watching
    fresh(); h = dummy(7);
    const w = V.still(g.spawnHuman(p.x + 2, p.z + 6, Math.PI)); g.advance(0.3);
    P.use('leopard'); g.advance(0.4);
    out.leopard = P.form === 'leopard' && p.hidden;
    __ts.input.move.y = 1; let mauled = false, top = 0;
    for (let i = 0; i < 40 && !mauled; i++) { g.advance(0.05); top = Math.max(top, p.speed); mauled = !!P.maul; }
    __ts.input.move.y = 0;
    out.leopardSpeed = top; out.mauled = mauled;
    g.advance(2.2);
    out.bitten = h.h.wounds.filter((x) => x.type === 'stab' || x.type === 'slash' || x.type === 'cut').length;
    out.turnedBack = !P.form && !p.hidden;
    out.seen = w.mind.memory.some((m) => m.kind === 'power');
    g.paused = true;
    return out;
  });
  check('an ABILITIES button beside SPAWN opens the abilities menu', menu.open && menu.beside && menu.tempest && menu.fruit, JSON.stringify(menu));
  check('choosing an ability puts it on the POWER button', r.power);
  check('Tempest Kick: a green slash flies off the kick and cuts whoever it reaches', r.tempestUsed && r.slashFlying && r.tempestCut);
  check('the fruit\u2019s abilities need the fruit', r.fruitLocked);
  check('eating the Cat-Cat Fruit: the hand goes to the mouth, and its powers are yours', r.eating && r.handUp && r.fruit, `power button "${r.label}"`);
  check('Finger Pistol: a straight finger, and a hole like a round\u2019s', r.pointing && r.fingerHole);
  check('Leo\u2019s Flame: five fireballs at the nearest person, who catches fire', r.fireballs === 5 && r.fireHits >= 3 && r.alight, `${r.fireballs} thrown, ${r.fireHits} hit`);
  check('Swirling Kick: a ring of air flies out and bursts into flame', r.ring && r.burst >= 1 && r.swirlDown && r.swirlFire);
  check('Leopard Leap: a bound, and a finger from each hand into whoever it lands on', r.airborne && r.leapHit >= 1 && r.leapHoles >= 2, `${r.leapHoles} holes`);
  check('Hybrid: fur, claws, a leopard\u2019s head; harder and faster; punches become claws; and back again', r.hybrid && r.clawed && r.hybridOff, `form ${r.hybrid}, clawed ${r.clawed}, back ${r.hybridOff}, wounds ${r.hybridWounds}`);
  check('Full Leopard: fast on all fours; pounces on whoever it runs into, mauls them, turns back', r.leopard && r.leopardSpeed > 6 && r.mauled && r.bitten >= 3 && r.turnedBack, `top speed ${r.leopardSpeed.toFixed(1)} m/s, ${r.bitten} bites and rakes`);
  check('somebody watching remembers it', r.seen);
}

/* ------------------------------ the hybrid's suit ------------------------------ */
head('Hybrid suit');
if (want('Hybrid suit')) {
  await run(() => V.admin());
  const r = await run(() => {
    V.stage();
    const g = __game, p = g.player, P = g.powers, bx = g.boxes, out = {};
    P.fruit = true; for (const k in P.cool) P.cool[k] = 0;
    const s0 = p.scale, tough0 = p.h.tough, head0 = p.bodies[4].py - p.y;
    P.use('hybrid'); g.advance(0.6);
    const H = P.hyb, hd = p.bodies[4];
    const vis = (i) => bx.m[i * 16 + 15] === 1;
    const col = (i) => [bx.c[i * 3], bx.c[i * 3 + 1], bx.c[i * 3 + 2]];
    const band = col(H.hat.band), crown = col(H.hat.crown), chest = col(p.inst[2]);
    out.hat = vis(H.hat.brim) && vis(H.hat.crown) && vis(H.hat.band) && bx.m[H.hat.crown * 16 + 13] > hd.py;
    out.band = band[0] > 0.3 && band[0] > band[1] * 3 && band[0] > band[2] * 3;   // red (colours are kept linear)
    out.black = crown.every((v) => v < 0.12) && chest.every((v) => v < 0.15);
    out.shirt = vis(H.suit.shirt) && vis(H.suit.tie);
    out.bigger = p.scale / s0; out.taller = (p.bodies[4].py - p.y) / head0;
    out.tougher = p.h.tough / tough0; out.sturdy = p.sturdy;
    // a shove that floors anybody else leaves the hybrid on its feet
    p.react(70, 1, 0, null); g.advance(0.4); out.standing = T.state(p) !== 'RAGDOLL';
    P.cool.hybrid = 0; P.use('hybrid'); g.advance(0.4);
    out.back = Math.abs(p.scale - s0) < 1e-6 && p.h.tough === tough0 && p.sturdy === 1 && !vis(H.hat.band) && p.coat == null;
    g.paused = true;
    return out;
  });
  check('Hybrid wears a black suit (white shirt, black tie) and a black top hat with a red band', r.hat && r.band && r.black && r.shirt, JSON.stringify({ hat: r.hat, band: r.band, black: r.black, shirt: r.shirt }));
  check('Hybrid is bigger and far tougher, and a hard shove does not floor it', r.bigger > 1.25 && r.taller > 1.25 && r.tougher > 2.5 && r.sturdy > 2 && r.standing, `size x${r.bigger.toFixed(2)}, height x${r.taller.toFixed(2)}, toughness x${r.tougher.toFixed(2)}, standing ${r.standing}`);
  check('turning back undoes all of it', r.back);
}

/* ---------------------------------- accounts ---------------------------------- */
head('Accounts');
if (want('Accounts')) {
  const r = await run(async () => {
    const a = __ts.auth, out = {};
    a.signOut();
    const up = await a.signUp({ email: 'Some.Body+games@Gmail.com', password: 'pass-word-1', confirm: 'pass-word-1', name: 'Somebody' });
    out.up = !!up.ok; out.name = a.name; out.hint = a.hint; out.notAdmin = !a.admin;
    // what is kept: neither the address nor the password, as typed
    const kept = JSON.stringify(localStorage);
    out.noAddress = !/some\.?body[^"\\]*@/i.test(kept) && !/rusty|screen\.user/i.test(kept); out.noPassword = !kept.includes('pass-word-1');
    out.session = !!JSON.parse(localStorage.getItem('suffering.session') || 'null');
    a.signOut(); out.out = !a.signedIn;
    out.wrong = (await a.signIn({ email: 'somebody@gmail.com', password: 'nope' })).error || '';
    // Gmail reads capitals, dots and +labels as the same inbox: so does signing in
    out.sameInbox = !!(await a.signIn({ email: 'SOMEBODY@gmail.com', password: 'pass-word-1' })).ok;
    out.dup = (await a.signUp({ email: 'some.body@gmail.com', password: 'x1x1x1', confirm: 'x1x1x1', name: 'Again' })).error || '';
    out.short = (await a.signUp({ email: 'other@gmail.com', password: '123', confirm: '123', name: 'Other' })).error || '';
    out.mismatch = (await a.signUp({ email: 'other@gmail.com', password: '123456', confirm: '654321', name: 'Other' })).error || '';
    out.bad = (await a.signUp({ email: 'not an address', password: '123456', confirm: '123456', name: 'Other' })).error || '';
    a.signOut();
    return out;
  });
  check('a fresh browser is asked to SIGN IN or SIGN UP, or play as a guest', t.authAtStart);
  check('SIGN UP with an email address and a password, SIGN IN again later (Gmail dots, capitals and +labels are the same inbox)', r.up && r.out && r.sameInbox && r.name === 'Somebody', `shown as ${r.hint}`);
  check('a wrong password, a taken address, a short password, two different passwords and a non-address are refused', /not the password/.test(r.wrong) && /already/.test(r.dup) && /6 characters/.test(r.short) && /not the same/.test(r.mismatch) && /not an email/.test(r.bad));
  check('neither the address nor the password is kept as typed; you stay signed in on this device', r.noAddress && r.noPassword && r.session);
  // the screen itself
  await run(() => { __ts.ui.showMenu(); __ts.ui.authui.open('up'); });
  await t.page.fill('#auth-name', 'Screen'); await t.page.fill('#auth-email', 'screen.user@gmail.com');
  await t.page.fill('#auth-pass', 'screen-pass'); await t.page.fill('#auth-confirm', 'screen-pass');
  await t.page.click('#auth-go');
  await t.page.waitForFunction(() => document.querySelector('#auth').hidden, { timeout: 10000 }).catch(() => {});
  const s = await run(() => ({ closed: document.querySelector('#auth').hidden, who: document.querySelector('#menu-who').textContent, btn: document.querySelector('#btn-account').textContent }));
  await t.page.click('#btn-account');
  const s2 = await run(() => ({ who: document.querySelector('#menu-who').textContent, btn: document.querySelector('#btn-account').textContent }));
  check('the sign-up screen works, and the title screen says who you are, with SIGN OUT', s.closed && /Signed in as Screen/.test(s.who) && s.btn === 'SIGN OUT' && /guest/.test(s2.who) && s2.btn === 'SIGN IN', `${s.who} / ${s2.who}`);
  await run(() => { __ts.ui.play(); __game.paused = true; });
}

/* ------------------------------------ admin ------------------------------------ */
head('Admin');
if (want('Admin')) {
  const r = await run(async () => {
    const a = __ts.auth, g = __game, ui = __ts.ui, out = {};
    V.stage(); a.signOut();
    // anybody else: no abilities, no cheats, no admin menu (single player too)
    ui.toggleAbilities(true); out.gAbil = document.querySelector('#abilities').hidden;
    out.gUse = !g.powers.use('tempest') && !g.powers.eat();
    ui.input.onAbilityKey('J'); out.gKey = /only for the admin/.test(document.querySelector('#toast').textContent);
    out.gBtn = document.querySelector('#btn-admin').hidden && document.querySelector('#btn-abilities').classList.contains('locked');
    __ts.settings.cheatHp = true; ui.apply(); out.gGod = g.player.h.god; __ts.settings.cheatHp = false; ui.apply();
    __ts.settings.cheatCops = true; out.gIgnored = g.police.ignored; __ts.settings.cheatCops = false;
    ui.pause('settings'); out.gCheats = document.querySelector('#cheats').hidden && !document.querySelector('#cheats-locked').hidden; ui.resume();
    ui.adminui.toggle(true); out.gMenu = document.querySelector('#admin').hidden;
    // the admin
    await V.admin(); g.paused = false;
    out.admin = a.admin;
    out.aBtn = !document.querySelector('#btn-admin').hidden && !document.querySelector('#btn-abilities').classList.contains('locked');
    for (const k in g.powers.cool) g.powers.cool[k] = 0;
    out.aUse = g.powers.use('tempest'); g.advance(1.2);
    __ts.settings.cheatHp = true; ui.apply(); out.aGod = g.player.h.god; __ts.settings.cheatHp = false; ui.apply();
    __ts.settings.cheatCops = true; out.aIgnored = g.police.ignored; __ts.settings.cheatCops = false;
    ui.pause('settings'); out.aCheats = !document.querySelector('#cheats').hidden; ui.resume(); g.paused = false;
    // the admin menu, on yourself: speed, max HP, toughness, wanted
    ui.adminui.toggle(true); out.aMenu = !document.querySelector('#admin').hidden;
    out.targets = Array.from(document.querySelectorAll('#ad-targets .tg')).map((e) => e.firstChild.textContent);
    const run = (secs) => { const p = g.player, x0 = p.x, z0 = p.z; __ts.input.move.y = 1; g.advance(secs); __ts.input.move.y = 0; g.advance(0.4); return Math.hypot(p.x - x0, p.z - z0); };
    const shot = () => { const p = g.player, c = p.bodies[2], pt = [0, 0, 0], dir = [0, 0, 0]; c.toWorld(0, 0, c.hz, pt); c.dirToWorld(0, 0, -1, dir); const b0 = p.h.bloodPct; p.hit({ part: 2, type: 'bullet', power: 1.2, point: pt, dir, normal: [0, 0, 1], impulse: 0, attacker: null, weapon: 'm1911', through: 0.2, hp: 32 }); g.advance(4); return b0 - p.h.bloodPct; };
    const shove = () => { const p = g.player; p.h.heal(); p.reset(p.x, p.z, p.yaw); g.advance(0.6); p.react(150, 1, 0, null); g.advance(0.5); const down = p.state === 2; p.h.heal(); p.reset(p.x, p.z, p.yaw); g.advance(0.5); return down; };
    V.stage(); g.paused = false; g.camYaw = g.player.yaw;
    const set = (sp, hp, tg, wl) => { document.querySelector('#ad-speed').value = String(sp); document.querySelector('#ad-hp').value = String(hp); document.querySelector('#ad-tough').value = String(tg); document.querySelector('#ad-wanted').value = String(wl); document.querySelector('#ad-apply').click(); };
    set(1, 100, 1, 0); out.run1 = run(1.6); out.bled1 = shot(); g.player.h.heal(); out.down1 = shove();
    V.stage(); g.paused = false; g.camYaw = g.player.yaw; ui.adminui.toggle(true);
    set(2, 400, 6, 2); out.msg = document.querySelector('#ad-msg').textContent;
    out.wanted = g.police.wanted; out.run2 = run(1.6); out.bled2 = shot(); g.player.h.heal(); out.down2 = shove();
    // through a respawn, what was set stays
    g.respawn(false); g.advance(0.3); out.kept = g.player.boost === 2 && g.player.knock === 6 && g.player.h.hpMul === 4;
    set(1, 100, 1, 0); out.cleared = g.police.wanted === 0 && g.player.boost === 1;
    out.kickOff = document.querySelector('#ad-kick').disabled; out.banOff = document.querySelector('#ad-ban').disabled;
    ui.adminui.toggle(false); g.paused = true;
    return out;
  });
  check('anybody but the admin: no abilities (menu, POWER, keys or fruit), single player too', r.gAbil && r.gUse && r.gKey && r.gBtn);
  check('anybody but the admin: the cheats are hidden and do nothing; no admin menu', !r.gGod && !r.gIgnored && r.gCheats && r.gMenu);
  check('the admin account: the abilities, the cheats and the ADMIN menu', r.admin && r.aBtn && r.aUse && r.aGod && r.aIgnored && r.aCheats && r.aMenu);
  check('the admin menu lists whoever you can choose, you at the top', r.targets.length >= 1 && /\(you\)/.test(r.targets[0]), JSON.stringify(r.targets));
  check('APPLY on yourself: speed, max HP, toughness and wanted level all take', r.run2 > r.run1 * 1.6 && r.bled2 < r.bled1 * 0.6 && r.down1 && !r.down2 && r.wanted === 2,
    `ran ${r.run1.toFixed(1)} m then ${r.run2.toFixed(1)} m; bled ${r.bled1.toFixed(2)}% then ${r.bled2.toFixed(2)}%; knocked down ${r.down1} then ${r.down2}; wanted ${r.wanted}`);
  check('what the admin set lasts through a respawn, and can be set back', r.kept && r.cleared);
  check('in single player there is nobody to kick, and bans need claude.ai', r.kickOff && r.banOff);
}

/* --------------------------------- multiplayer --------------------------------- */
head('Multiplayer');
if (want('Multiplayer')) {
  // a copy of the game on its own: nothing to play through
  const solo = await run(async () => {
    V.stage(); const ui = __ts.ui, mp = __ts.mp;
    ui.showMenu(); document.querySelector('#btn-mp').click();
    const out = { open: !document.querySelector('#mp').hidden, status: document.querySelector('#mp-status').textContent, servers: mp.servers.length, host: (await mp.host({ name: 'x' })).error || '' };
    ui.mpui.close(); ui.play(); __game.paused = true;
    return out;
  });
  check('opened on its own, MULTIPLAYER says it needs claude.ai, and there are no servers', solo.open && /claude\.ai/.test(solo.status) && solo.servers === 0 && /claude\.ai/.test(solo.host));

  // two players in one browser, each their own claude.ai viewer: A owns the page and is the admin; B is a friend
  const M = await openMany([{ uid: 'u_owner', owner: true }, { uid: 'u_friend' }], { width: 900, height: 540 });
  const [A, B] = M.pages;
  for (const x of [A, B]) await x.page.waitForFunction(() => window.__game && window.__ts.mp, null, { timeout: 180000 });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const step = async (secs, dt = 0.1) => { for (let s = 0; s < secs; s += dt) { for (const x of [A, B]) await x.ev((dt) => { const g = window.__game; g.paused = false; g.advance(dt); g.paused = true; }, dt); await sleep(12); } };
  const enter = (x, email, name) => x.ev(async ([email, name]) => {
    const a = window.__ts.auth; await a.ready;
    const res = await a.signUp({ email, password: 'secret-12', confirm: 'secret-12', name });
    document.querySelector('#auth').hidden = true; await window.__ts.mp.ready; window.__ts.ui.play(); window.__game.paused = true;
    return { ok: !!res.ok, admin: a.admin, err: res.error || '' };
  }, [email, name]);
  const reserved = await B.ev(async (email) => { const a = window.__ts.auth; await a.ready; return (await a.signUp({ email, password: 'secret-12', confirm: 'secret-12', name: 'Fake' })).error || ''; }, TEST_ADMIN);
  const ea = await enter(A, TEST_ADMIN, 'Boss'), eb = await enter(B, 'friend.player@gmail.com', 'Friend');
  check('on claude.ai the admin address is the page owner’s alone: anybody else is refused it', ea.admin && !eb.admin && /reserved/.test(reserved), reserved);
  await step(0.5);
  const store = await B.ev(async () => { const db = await window.claude.use('db'); const s = await db.doc('config/admin').get(); let forged = false; try { await db.doc('config/admin').set({ id: 'u_friend' }); forged = true; } catch { forged = false; } return { id: s.exists ? s.data().id : null, forged }; });
  check('the admin’s platform id is in the shared store, and nobody else can write it', store.id === 'u_owner' && !store.forged);

  await A.ev(async () => { await window.__ts.mp.host({ name: 'Test City', max: 8 }); window.__game.paused = true; });
  await step(1.2);
  const list = await B.ev(() => { const ui = window.__ts.ui; ui.showMenu(); document.querySelector('#btn-mp').click(); const rows = Array.from(document.querySelectorAll('#mp-servers .srv')).map((r) => ({ name: r.querySelector('.srv-name b').textContent, n: r.querySelector('.srv-n').textContent, ping: r.querySelector('.srv-ping').textContent })); return { rows, servers: window.__ts.mp.servers }; });
  check('HOST puts a server in everyone’s list, with its name, players and a measured ping', list.rows.length === 1 && list.rows[0].name === 'Test City' && list.rows[0].n === '1/8' && /^\d+ ms$/.test(list.rows[0].ping), JSON.stringify(list.rows));
  await B.ev(async () => { await window.__ts.ui.mpui._join(window.__ts.mp.servers[0].id); window.__game.paused = true; });
  await step(2.5);
  const seen = await Promise.all([A, B].map((x) => x.ev(() => { const mp = window.__ts.mp, r = [...mp.remotes.values()][0]; window.__ts.ui.mpui._tags(0.3); return { on: mp.on, count: mp.count, host: mp.isHost, other: r ? r.name : null, puppet: !!(r && r.h && r.h.puppet), tags: document.querySelectorAll('#tags .tag').length, chip: document.querySelector('#mp-chip-n').textContent, ping: mp.you.ping }; })));
  check('JOIN: both are on the server and see each other, a name over each', seen[0].on && seen[1].on && seen[0].other === 'Friend' && seen[1].other === 'Boss' && seen[0].puppet && seen[1].puppet && seen[0].tags === 1 && seen[1].tags === 1 && seen[0].host && !seen[1].host && seen[1].chip === '2/8', JSON.stringify(seen));
  check('the player who joined measures their ping to the host', seen[1].ping > 0, `${seen[1].ping} ms`);
  // B walks; A's stand-in for B follows
  await B.ev(() => { window.__ts.input.move.y = 1; }); await step(1.5); await B.ev(() => { window.__ts.input.move.y = 0; }); await step(0.6);
  const bAt = await B.ev(() => [window.__game.player.x, window.__game.player.z]);
  const aSees = await A.ev(() => { const r = [...window.__ts.mp.remotes.values()][0]; return [r.h.x, r.h.z]; });
  const gap = Math.hypot(bAt[0] - aSees[0], bAt[1] - aSees[1]);
  check('a player who moves is drawn where they are on everybody else’s screen', gap < 0.15, `${(gap * 100).toFixed(1)} cm apart`);
  const face = async (d) => {
    const a = await A.ev(() => { const g = window.__game, p = g.player; return [p.x, p.z, g.camYaw]; });
    await B.ev(([x, z, yaw, d]) => { const p = window.__game.player; p.h.heal(); p.reset(x + Math.sin(yaw) * d, z + Math.cos(yaw) * d, yaw + Math.PI); p.h.tough = 1; }, [...a, d]);
    await step(1);
  };
  const aim = () => A.ev(() => { const g = window.__game, r = [...window.__ts.mp.remotes.values()][0], c = r.h.bodies[2], a = g.aim; g.camYaw = Math.atan2(c.px - a.ox, c.pz - a.oz); g.camPitch = Math.atan2(c.py - a.oy, Math.hypot(c.px - a.ox, c.pz - a.oz)); });
  // blows: A punches B on A's screen; B's own game takes them
  await face(1.0);
  for (let i = 0; i < 5; i++) { await A.ev((i) => { const g = window.__game; g.paused = false; g.weapons.attack(i % 3); g.advance(0.05); g.paused = true; }, i); await step(0.6); }
  await step(1);
  const punched = await B.ev(() => { const p = window.__game.player; return { wounds: p.h.wounds.length, pain: Math.round(p.h.pain), by: p.lastAttacker && p.lastAttacker.remote ? p.lastAttacker.remote.name : null }; });
  check('a punch on another player lands in their own game, put down to whoever threw it', punched.wounds >= 1 && punched.by === 'Boss', JSON.stringify(punched));
  // rounds
  await face(6);
  await A.ev(() => { const g = window.__game; g.weapons.give(g.player, 'm1911', true); g.paused = false; g.advance(0.8); g.paused = true; });
  for (let i = 0; i < 3; i++) { await aim(); await A.ev(() => { const g = window.__game; g.paused = false; g.advance(0.15); g.weapons.fire(); g.advance(0.05); g.paused = true; }); await step(0.5); }
  await step(1);
  const shotB = await B.ev(() => { const p = window.__game.player; return { holes: p.h.wounds.filter((w) => w.type === 'gunshot').length, weapon: p.lastWeapon }; });
  check('so does a round; and everybody else sees and hears the shot', shotB.holes >= 1 && shotB.weapon === 'm1911', JSON.stringify(shotB));
  // the admin's Tempest Kick, at B: B's game takes the cut, and B's screen shows the slash
  await face(5);
  await A.ev(() => { const g = window.__game; g.weapons.select(-1); g.paused = false; g.advance(0.8); g.paused = true; });
  await aim();
  await A.ev(() => { const g = window.__game; g.camPitch = -0.02; g.paused = false; for (const k in g.powers.cool) g.powers.cool[k] = 0; window.__k = g.powers.use('tempest'); g.advance(0.05); g.paused = true; });
  let ghost = 0;
  for (let i = 0; i < 12; i++) { await step(0.1); ghost = Math.max(ghost, await B.ev(() => window.__game.powers.shots.filter((o) => o.ghost).length)); }
  await step(1);
  const kicked = await B.ev(() => { const p = window.__game.player; return { cuts: p.h.wounds.filter((w) => w.type === 'slash' || w.type === 'cut' || w.type === 'stump').length, weapon: p.lastWeapon }; });
  check('the admin’s Tempest Kick cuts another player, who sees the slash come', (await A.ev(() => window.__k)) && ghost >= 1 && kicked.cuts >= 1 && kicked.weapon === 'tempest', `ghost slashes ${ghost}, ${JSON.stringify(kicked)}`);
  // a kill: the feed on both screens, and the score
  await face(5);
  await A.ev(() => { const g = window.__game; g.weapons.give(g.player, 'ak47', true); g.paused = false; g.advance(0.8); g.paused = true; });
  await B.ev(() => { window.__game.player.h.tough = 0.3; });
  for (let i = 0; i < 14; i++) {
    await aim(); await A.ev(() => { const g = window.__game, r = [...window.__ts.mp.remotes.values()][0], c = r.h.bodies[4], a = g.aim; g.camYaw = Math.atan2(c.px - a.ox, c.pz - a.oz); g.camPitch = Math.atan2(c.py - a.oy, Math.hypot(c.px - a.ox, c.pz - a.oz)); g.paused = false; g.advance(0.12); g.weapons.fire(); g.advance(0.05); g.paused = true; });
    await step(0.25);
    if (!(await B.ev(() => window.__game.player.h.alive))) break;
  }
  await step(1.5);
  const score = await Promise.all([A, B].map((x) => x.ev(() => ({ kills: window.__ts.mp.you.kills, deaths: window.__ts.mp.you.deaths, feed: Array.from(document.querySelectorAll('#feed .fe.kill')).map((e) => e.textContent) }))));
  check('a kill goes in the feed on both screens, and on the scoreboard', score[0].kills === 1 && score[1].deaths === 1 && score[0].feed.some((f) => /Boss.*AK-47.*Friend/.test(f)) && score[1].feed.some((f) => /Boss.*AK-47.*Friend/.test(f)), JSON.stringify(score));
  // B gets up again: a new stand-in
  await A.ev(() => { window.__oldH = [...window.__ts.mp.remotes.values()][0].h; });
  await B.ev(() => document.querySelector('#btn-respawn').click());
  await step(1.5);
  const back = await A.ev(() => { const r = [...window.__ts.mp.remotes.values()][0]; return { fresh: r.h !== window.__oldH && window.__oldH.removed && r.h.h.alive }; });
  check('a player who gets up again is a fresh stand-in on everybody else’s screen', back.fresh);
  // talk
  await B.ev(() => window.__game.speech.playerSay('hello boss!'));
  await step(0.6);
  const heard = await A.ev(() => ({ feed: Array.from(document.querySelectorAll('#feed .fe.chat')).map((e) => e.textContent), bubble: Array.from(document.querySelectorAll('#bubbles .bubble')).some((b) => b.textContent === 'hello boss!') }));
  check('what a player says is heard: a bubble over them and a line in the chat', heard.feed.includes('Friend: hello boss!') && heard.bubble, JSON.stringify(heard.feed));
  // a car
  await B.ev(() => { const g = window.__game, p = g.player; const car = g.traffic.spawnParked('sedan', p.x + 3, p.z, 0); g.traffic.enter(p, car); window.__ts.input._press('gas'); });
  await step(2); await B.ev(() => window.__ts.input._release('gas')); await step(0.5);
  const cars = await Promise.all([B.ev(() => { const c = window.__game.player.car; return c ? [c.x, c.z] : null; }), A.ev(() => { const c = [...window.__ts.mp.remotes.values()][0].car; return c ? [c.x, c.z] : null; })]);
  check('a car somebody drives goes with them, on everybody’s screen', cars[0] && cars[1] && Math.hypot(cars[0][0] - cars[1][0], cars[0][1] - cars[1][1]) < 1.0, JSON.stringify(cars));
  await B.ev(() => { const g = window.__game; g.traffic.exit(g.player); }); await step(1);
  // the admin's menu on B
  const applied = await A.ev(() => {
    const ui = window.__ts.ui, mp = window.__ts.mp; ui.adminui.toggle(true);
    const rows = Array.from(document.querySelectorAll('#ad-targets .tg'));
    const out = { rows: rows.map((e) => e.firstChild.textContent) };
    rows[1].click();
    document.querySelector('#ad-speed').value = '2'; document.querySelector('#ad-hp').value = '300'; document.querySelector('#ad-tough').value = '4'; document.querySelector('#ad-wanted').value = '1';
    document.querySelector('#ad-apply').click(); out.msg = document.querySelector('#ad-msg').textContent;
    return out;
  });
  await step(0.8);
  const onB = await B.ev(() => { const g = window.__game, p = g.player; return { boost: p.boost, hpMul: p.h.hpMul, knock: p.knock, wanted: g.police.wanted }; });
  check('the admin menu lists everyone on the server, you first; APPLY sets their speed, max HP, toughness and wanted level', applied.rows.length === 2 && /you/.test(applied.rows[0]) && applied.rows[1] === 'Friend' && onB.boost === 2 && onB.hpMul === 3 && onB.knock === 4 && onB.wanted === 1, JSON.stringify(onB));
  // somebody else trying it: nothing happens
  await B.ev(() => { const mp = window.__ts.mp; mp._emit('adm', [...mp.remotes.keys()][0], { op: 'kick', note: 'ha' }); mp._emit('adm', [...mp.remotes.keys()][0], { op: 'set', sp: 5, hp: 1, tg: 0.1, wl: 2 }); });
  await step(0.8);
  const forged = await A.ev(() => ({ on: window.__ts.mp.on, boost: window.__game.player.boost, refused: window.__ts.mp.stats.refused }));
  check('an admin command from anybody but the admin is ignored', forged.on && forged.boost === 1 && forged.refused >= 2, JSON.stringify(forged));
  // KICK
  await A.ev(() => { document.querySelector('#ad-note').value = 'cool it'; document.querySelector('#ad-kick').click(); });
  await step(1);
  const kick = await B.ev(async () => { const mp = window.__ts.mp; const again = await mp.join((mp.servers[0] || {}).id); return { on: mp.on, toast: document.querySelector('#toast').textContent, again: again.error || 'joined' }; });
  check('KICK: they are off the server, told why, and cannot come straight back', !kick.on && /kicked/.test(kick.toast) && /cool it/.test(kick.toast) && /kicked/.test(kick.again), kick.toast);
  // BAN, with a note and a length; then lifted
  await B.ev(async () => { const mp = window.__ts.mp; mp.kickedFrom.clear(); await mp.join(mp.servers[0].id); window.__game.paused = true; });
  await step(2);
  await A.ev(() => { const ui = window.__ts.ui; ui.adminui.render(); const rows = document.querySelectorAll('#ad-targets .tg'); rows[1].click(); document.querySelector('#ad-note').value = 'griefing'; document.querySelector('#ad-length').value = '3600000'; });
  await A.ev(async () => { await window.__ts.ui.adminui.ban(); });
  await step(1.5);
  const ban = await B.ev(async () => { const mp = window.__ts.mp; return { on: mp.on, banned: !!mp.banned, text: mp.banText(), join: (await mp.join((mp.servers[0] || {}).id)).error || '', host: (await mp.host({ name: 'x' })).error || '' }; });
  const listed = await A.ev(() => Array.from(document.querySelectorAll('#ad-bans li')).map((e) => e.textContent));
  check('BAN: off the server, told the note and until when, and cannot join or host', !ban.on && ban.banned && /griefing/.test(ban.text) && /until/.test(ban.text) && /banned/.test(ban.join) && /banned/.test(ban.host), ban.text);
  check('the admin sees the ban in the list, and can lift it', listed.some((l) => /Friend/.test(l) && /griefing/.test(l)), JSON.stringify(listed));
  await A.ev(async () => { const b = window.__ts.mp.banList[0]; await window.__ts.mp.adminUnban(b.id); });
  await step(0.6);
  const lifted = await B.ev(() => !window.__ts.mp.banned);
  check('UNBAN: they may play again', lifted);
  // the host leaves: whoever has been on longest hosts it now
  await B.ev(async () => { const mp = window.__ts.mp; await mp.join(mp.servers[0].id); window.__game.paused = true; });
  await step(2);
  await A.ev(async () => { await window.__ts.mp.leave(true); });
  await step(2);
  const moved = await B.ev(() => ({ host: window.__ts.mp.isHost, list: window.__ts.mp.servers.map((s) => s.name + '/' + s.host) }));
  check('when the host leaves, the server carries on with a new host', moved.host && moved.list.includes('Test City/Friend'), JSON.stringify(moved));
  const errs = [...A.logs, ...B.logs].filter((l) => !/401|Failed to load resource|willReadFrequently/.test(l));
  check('no errors on either player’s page', errs.length === 0, errs.slice(0, 3).join(' | '));
  await M.close();
}

/* --------------------------------- report ------------------------------- */
const errors = t.logs.filter((l) => !/401|Failed to load resource|willReadFrequently/.test(l));
head('Console');
check('no errors or warnings in the console', errors.length === 0, errors.slice(0, 3).join(' | '));
await t.close();

let failed = 0, last = '';
for (const r of results) {
  if (r.section !== last) { console.log('\n' + r.section); last = r.section; }
  if (!r.ok) failed++;
  console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.detail ? '  -  ' + r.detail : ''}`);
}
console.log(`\n${results.length - failed} of ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
