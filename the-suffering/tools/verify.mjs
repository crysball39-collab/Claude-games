/* =============================================================================
   Plays the game in a real browser and checks, one by one, the things it is
   supposed to do. Run with: npm run verify
   ========================================================================== */
import { play } from './play.mjs';
import { LINE_COUNT } from '../src/mind/lines.js';

const t = await play({ width: 1100, height: 600 });
const results = [];
let section = '';
const head = (name) => { section = name; };
const check = (name, ok, detail = '') => { results.push({ section, name, ok: !!ok, detail }); };
const run = async (fn, ...a) => t.ev(fn, ...a);

/* helpers that live in the page */
await run(() => {
  const g = window.__game, ts = window.__ts;
  window.V = {
    /** An empty stretch of road, the player facing along it. */
    stage() {
      T.clear();
      for (const o of g.props.slice()) g.removeProp(o);
      const p = g.player;
      g.weapons.dropFrom(p, true);
      for (const it of g.weapons.items.slice()) g.weapons.remove(it);
      p.h.heal(); p.reset(0, -18, Math.PI / 2);
      g.camYaw = Math.PI / 2; g.camPitch = -0.08; g.gore.clean();
      g.paused = false; g.advance(0.3);
    },
    give(type) { const p = g.player; const it = g.weapons.spawn(type, p.x + 0.3, 1, p.z); g.advance(0.3); g.weapons.pickUp(it); g.advance(0.3); return it; },
    aimAt(b) { const a = g.aim; const dx = b.px - a.ox, dy = b.py - a.oy, dz = b.pz - a.oz; g.camYaw = Math.atan2(dx, dz); g.camPitch = Math.atan2(dy, Math.hypot(dx, dz)); },
    still(h) { h.brain = { update() {}, pause: 0, mode: 'wander' }; return h; },
  };
});

/* ------------------------------- the page ------------------------------- */
head('Page');
{
  const r = await run(() => ({ title: document.title, hud: !document.querySelector('#hud').hidden, menu: document.querySelector('#menu').hidden }));
  check('is called The Suffering', /the suffering/i.test(r.title), r.title);
  check('PLAY starts the game', r.hud && r.menu);
}

/* ------------------------------- controls ------------------------------- */
head('Controls');
{
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
{
  const r = await run(() => {
    const g = __game, city = g.city;
    V.stage();
    __ts.settings.people = 14; g.traffic.setCount(8);
    for (let i = 0; i < 14; i++) { const s = city.randomPavement(); g.spawnHuman(s.x, s.z); }
    const cars0 = g.traffic.cars.map((c) => [c.x, c.z]);
    const ppl = g.humans.filter((h) => !h.isPlayer), p0 = ppl.map((h) => [h.x, h.z]);
    let onRoad = 0, jay = 0, samples = 0, carsOff = 0;
    const R = [-54, -18, 18, 54];
    const roadAt = (x, z) => R.some((r) => Math.abs(x - r) < 4.5 || Math.abs(z - r) < 4.5);
    // properly out in the carriageway (not just a foot over the kerb) and nowhere near a corner, where the crossings are
    const midBlock = (x, z) => (R.some((r) => Math.abs(x - r) < 3.9) && !R.some((r) => Math.abs(z - r) < 9)) || (R.some((r) => Math.abs(z - r) < 3.9) && !R.some((r) => Math.abs(x - r) < 9));
    for (let i = 0; i < 40; i++) {
      g.advance(0.5);
      for (const h of ppl) { if (h.removed || h.state !== 0) continue; samples++; if (roadAt(h.x, h.z)) onRoad++; if (midBlock(h.x, h.z)) jay++; }
      for (const c of g.traffic.cars) if (!roadAt(c.x, c.z)) carsOff++;
    }
    const carMoved = g.traffic.cars.map((c, i) => Math.hypot(c.x - cars0[i][0], c.z - cars0[i][1]));
    const walked = ppl.map((h, i) => Math.hypot(h.x - p0[i][0], h.z - p0[i][1]));
    carMoved.sort((a, b) => a - b);
    return { cars: g.traffic.cars.length, carMoved: carMoved[carMoved.length >> 1], slowest: carMoved[0], carsOff, walkers: walked.filter((d) => d > 3).length, people: ppl.length, pavement: 1 - onRoad / Math.max(1, samples), jay: jay / Math.max(1, samples), upright: ppl.filter((h) => h.state === 0).length };
  });
  check('cars drive down the streets', r.cars >= 6 && r.carMoved > 40 && r.slowest > 2 && r.carsOff === 0, `${r.cars} cars; in 20 s the typical one covered ${r.carMoved.toFixed(0)} m and the slowest (held up at a crossing) ${r.slowest.toFixed(0)} m; never off the road`);
  check('people walk on the pavements', r.walkers >= r.people * 0.6 && r.pavement > 0.6 && r.jay < 0.03, `${r.walkers}/${r.people} walked more than 3 m; ${(r.pavement * 100).toFixed(0)}% of the time on pavement, the rest on crossings at the corners; ${(r.jay * 100).toFixed(1)}% in the road mid-block`);
}

/* ------------------------------- sandbox -------------------------------- */
head('Sandbox menu');
{
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
{
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
{
  await run(() => { const g = __game; V.stage(); const h = V.still(T.dummy(3)); window.PT = h; g.advance(1.2); g.paused = false; });
  await t.page.click('#btn-doctor');
  await t.page.waitForTimeout(500);
  // where they are on the screen now that the camera has settled and a frame has been drawn
  const pos = await run(() => { const h = window.PT, o = []; __game.toScreen(h.bodies[2].px, h.bodies[2].py, h.bodies[2].pz, o); return { x: o[0], y: o[1] }; });
  await t.page.mouse.click(pos.x, pos.y);
  await t.page.waitForFunction(() => { const e = document.querySelector('#doc-cond-label'); return e && e.textContent.trim().length > 2; }, { timeout: 8000 }).catch(() => {});
  const r = await run(() => {
    const txt = (s) => (document.querySelector(s) || {}).textContent || '';
    return { picked: __game.selected === window.PT, name: txt('#doc-name'), cond: txt('#doc-cond-label'), vitals: txt('#doc-vitals').toUpperCase(), emo: txt('#doc-emotions').toUpperCase() };
  });
  check('tapping a person selects them', r.picked, r.name);
  check('shows their condition', r.cond.length > 2, r.cond);
  for (const k of ['AIR', 'NAUSEA', 'TEMP', 'SHOCK', 'PAIN', 'BLOOD']) check(`shows ${k.toLowerCase()}`, r.vitals.includes(k));
  for (const k of ['FEAR', 'ANGER', 'SADNESS', 'JOY', 'SURPRISE', 'BOREDOM']) check(`shows ${k.toLowerCase()}`, r.emo.includes(k));

  await t.page.click('[data-tab="xray"]');
  await t.page.waitForTimeout(300);
  const x0 = await run(() => { const c = document.querySelector('#doc-xray'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 0; i < d.length; i += 16) if (d[i] + d[i + 1] + d[i + 2] > 240) lit++; return { lit, w: c.width, h: c.height, legend: document.querySelector('#doc-legend').textContent }; });
  check('the X-ray draws a skeleton and organs', x0.lit > 800, `${x0.lit} lit samples on a ${x0.w}x${x0.h} plate`);
  // break a bone and puncture an organ, then look again
  const dmg = await run(() => {
    const g = __game, h = window.PT, pl = g.player;
    const arm = h.bodies[8]; h.hit({ part: 8, type: 'blunt', power: 2.6, point: [arm.px, arm.py, arm.pz], dir: [-1, 0, 0], normal: [1, 0, 0], impulse: 4, attacker: pl, weapon: 'fists' });
    const c = h.bodies[2]; h.hit({ part: 2, type: 'bullet', power: 1, point: [c.px + 0.1, c.py + 0.06, c.pz - 0.05], dir: [-1, 0, 0], normal: [1, 0, 0], impulse: 2, attacker: pl, weapon: 'm1911', through: true });
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
{
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
{
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
{
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
{
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

/* --------------------------------- report ------------------------------- */
const errors = t.logs.filter((l) => !/401|Failed to load resource/.test(l));
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
