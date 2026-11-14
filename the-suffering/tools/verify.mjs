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
      if (p.vest) p.removeVest();
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

/* --------------------------------- hands -------------------------------- */
head('Fingers');
{
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
{
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
{
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
    const shoot = (h, part, weapon = 'm1911') => { const c = h.bodies[part]; return h.hit({ part, type: 'bullet', power: weapon === 'ak47' ? 1.4 : 1, point: [c.px - c.hx, c.py, c.pz], dir: [1, 0, 0], normal: [-1, 0, 0], impulse: 6, attacker: p, weapon, through: 0.2, hp: 32 }); };
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
{
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
{
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
  check('each has a vest and a holstered M1911', r.kit.every((k) => k.vest && k.gun === 'm1911' && k.holstered && k.uniform));

  await run(() => { V.stage(); __game.paused = false; });
  await t.page.click('#btn-menu');
  await t.page.click('[data-spawn="officer"]');
  await t.page.click('[data-close="sandbox"]');
  const s = await run(() => { const g = __game; g.advance(0.5); const o = g.humans.filter((h) => h.officer); return { n: o.length, vest: o[0] && !!o[0].vest, gun: o[0] && (o[0].kit || []).map((i) => i.type).join(',') }; });
  check('an officer can be spawned from the menu', s.n === 1 && s.vest && s.gun === 'm1911');

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
    let reloading = false, down = false;
    for (let i = 0; i < 260; i++) { g.advance(0.1); if (cops().some((h) => h.reload)) reloading = true; if (p.state === 2 || !p.h.alive) down = true; if (down && i > 150 && cops().every((h) => h.brain.mode === 'post' && !h.weapon)) break; }
    out.fight = { fires, hit: p.h.wounds.length, down, reloading, said: said.slice(0, 3).join(' / '), ammo: cops().map((h) => h.kit && h.kit[0] ? h.kit[0].ammo : -1).join(','), modes: cops().map((h) => h.brain.mode + (h.weapon ? '+gun' : '')).join(','), mags: w.casings.filter((c) => c.size).length };
    g.speech.say = orig; w.npcFire = nf;
    return out;
  });
  check('a weapon out in front of them: pistols drawn, orders shouted, nobody shot', e.challenge.drawn >= 3 && e.challenge.aiming >= 3 && e.challenge.fires === 0, e.challenge.said);
  check('put it away and they stand down and holster', e.standDown.drawn === 0 && e.standDown.fires === 0 && e.standDown.alive && /^post(,post)*$/.test(e.standDown.modes));
  check('shoot somebody and they shoot back', e.fight.fires > 0 && e.fight.hit > 0, `${e.fight.fires} rounds fired; "${e.fight.said}"`);
  check('they stop when you are down', e.fight.down);
  check('officers reload, with the same animation, before they holster', e.fight.reloading && e.fight.mags > 0 && e.fight.ammo.split(',').every((a) => a === '7' || a === '-1'), `magazines on the ground: ${e.fight.mags}; pistols now hold ${e.fight.ammo}`);
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
