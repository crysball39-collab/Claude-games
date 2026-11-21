'use strict';
/* =============================================================================
   A run: one attempt at a chapter. The player, the horde, the shuriken and
   the five abilities, EXP gems, level ups and the chapter clock all live
   here. Bosses are in boss.js.
   ========================================================================== */

/* What the camera can see, in world units. render.js keeps it current. */
const VIEW = { w: 420, h: 860, scale: 1, cssW: 420, cssH: 860, hudTop: 110 };
/* How far below an entity's centre its feet are drawn. */
const FOOT = { zombie: 13, butterfly: -2, beetle: 10, minion: 9 };

let run = null;

/* ------------------------------ spatial grid ----------------------------- */

const GRID = 56;
const grid = new Map();
const gridUsed = [];
const gridKey = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);

function gridBuild(list) {
  for (const a of gridUsed) a.length = 0;
  gridUsed.length = 0;
  if (grid.size > 6000) grid.clear();
  for (const e of list) {
    if (e.dead) continue;
    const k = gridKey(Math.floor(e.x / GRID), Math.floor(e.y / GRID));
    let a = grid.get(k);
    if (!a) { a = []; grid.set(k, a); }
    if (!a.length) gridUsed.push(a);
    a.push(e);
  }
}

/* fn(e) for every live enemy (and the boss) whose body touches the circle.
   Returning false from fn stops the search. */
function forEnemiesNear(x, y, r, fn) {
  const m = r + 26;
  const c0 = Math.floor((x - m) / GRID), c1 = Math.floor((x + m) / GRID);
  const r0 = Math.floor((y - m) / GRID), r1 = Math.floor((y + m) / GRID);
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
    const a = grid.get(gridKey(cx, cy));
    if (!a) continue;
    for (let i = 0; i < a.length; i++) {
      const e = a[i];
      if (e.dead) continue;
      const dx = e.x - x, dy = e.y - y, rad = r + e.r;
      if (dx * dx + dy * dy < rad * rad && fn(e) === false) return;
    }
  }
  const b = run.boss;
  if (b && !b.dead && b.targetable) {
    const dx = b.x - x, dy = b.y - y, rad = r + b.r;
    if (dx * dx + dy * dy < rad * rad) fn(b);
  }
}

function nearestEnemy(x, y, maxD) {
  let best = null, bd = maxD * maxD;
  for (const e of run.enemies) {
    if (e.dead) continue;
    const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = e; }
  }
  const b = run.boss;
  if (b && b.targetable && !b.dead) {
    const dx = b.x - x, dy = b.y - y, d = dx * dx + dy * dy - b.r * b.r;
    if (d < bd) best = b;
  }
  return best;
}

/* -------------------------------- the run -------------------------------- */

function startRun() {
  const gear = gearTotals();
  run = {
    chapter: CHAPTERS[0], t: 0, clock: 0, state: 'play',
    p: {
      x: 0, y: 0, r: 12, hp: gear.hp, maxHp: gear.hp, baseAtk: gear.atk, face: 1, moving: false, anim: 0,
      flash: 0, inv: 0, poisonT: 0, poisonTick: 0, poisonDps: 0, level: 1, exp: 0, next: expToNext(1), dead: false, deathT: 0,
    },
    weapon: gear.weapon, shT: 0.6,
    enemies: [], gems: [], shots: [], ebullets: [], zones: [], hazards: [], booms: [], rings: [], parts: [], nums: [], throws: [],
    ab: {}, abOrder: [], bf: {}, bfOrder: [], st: {},
    blades: [], guardAng: 0, ffT: 0, ffRad: 0, durian: null, missileT: 2.5, molT: 1.5,
    kills: 0, gold: 0, spawnAcc: 0, eliteT: 38, ringT: 0,
    bigIdx: 0, bossIdx: 0, bossesDown: 0, inBig: false,
    boss: null, intro: null, arena: null, bossDeath: null,
    cam: { x: 0, y: 0 }, camBlend: 0, camAnchor: { x: 0, y: 0 }, shake: 0,
    pending: 0, gemMerge: 0, victory: false, endT: 0, result: null,
  };
  recalc();
}

function recalc() {
  const b = run.bf, s = run.st;
  s.gold = 1 + 0.08 * (b.goldband || 0);
  s.area = 1 + 0.10 * (b.fuel || 0);
  s.dmg = 1 + 0.02 * (b.sharpener || 0);
  s.dur = 1 + 0.15 * (b.sharpener || 0);
  s.regen = 0.005 * (b.energy || 0);       // share of max HP per second
  s.taken = 1 - 0.10 * (b.armor || 0);
  s.atk = run.p.baseAtk * s.dmg;
}

function updateRun(dt) {
  const R = run;
  if (!R) return;
  if (R.state === 'dead') {
    R.p.deathT += dt;
    updateFx(dt);
    if (R.p.deathT > 1.5 && !R.result) finishRun(false);
    return;
  }
  if (R.state !== 'play') return;
  R.clock += dt;
  updatePlayer(dt);
  if (!R.boss && !R.intro && !R.victory) { R.t += dt; timeline(); spawner(dt); }
  if (R.intro) updateIntro(dt);
  updateEnemies(dt);
  gridBuild(R.enemies);
  separate();
  if (R.boss) updateBoss(dt);
  updateWeapons(dt);
  updateShots(dt);
  updateThrows(dt);
  updateZones(dt);
  updateHazards(dt);
  updateEBullets(dt);
  updateGems(dt);
  updateFx(dt);
  updateStatus(dt);
  updateCamera(dt);
  compact();
  if (R.victory && !R.result) { R.endT -= dt; if (R.endT <= 0) finishRun(true); }
}

function updatePlayer(dt) {
  const R = run, P = R.p, ax = Input.axis();
  P.moving = ax.m > 0.05;
  P.x += ax.x * BASE.speed * dt;
  P.y += ax.y * BASE.speed * dt;
  if (ax.x > 0.15) P.face = 1; else if (ax.x < -0.15) P.face = -1;
  const A = R.arena;
  if (A) {
    P.x = clamp(P.x, A.x - A.w / 2 + P.r, A.x + A.w / 2 - P.r);
    P.y = clamp(P.y, A.y - A.h / 2 + P.r, A.y + A.h / 2 - P.r);
  }
  P.anim += dt * (P.moving ? 8 + 3 * ax.m : 2.4);
  if (P.flash > 0) P.flash -= dt;
  if (P.inv > 0) P.inv -= dt;
}

function updateCamera(dt) {
  const R = run, P = R.p;
  if (R.arena) { R.camAnchor.x = R.arena.x; R.camAnchor.y = R.arena.y - R.arena.camOff; }
  R.camBlend = clamp(R.camBlend + (R.arena ? dt : -dt) * 2.2, 0, 1);
  const k = R.camBlend * R.camBlend * (3 - 2 * R.camBlend);
  R.cam.x = lerp(P.x, R.camAnchor.x, k);
  R.cam.y = lerp(P.y, R.camAnchor.y, k);
  if (R.shake > 0) R.shake = Math.max(0, R.shake - dt * 28);
}

/* ------------------------------- the clock ------------------------------- */

function timeline() {
  const R = run, ch = R.chapter;
  if (R.bigIdx < ch.bigWaves.length && R.t >= ch.bigWaves[R.bigIdx]) {
    R.bigIdx++;
    R.ringT = 1.4;
    UI.banner('A huge wave is approaching!', 'wave');
    Sfx.play('wave');
  }
  if (R.bossIdx < ch.bosses.length && R.t >= ch.bosses[R.bossIdx].at) {
    R.t = ch.bosses[R.bossIdx].at;
    const id = ch.bosses[R.bossIdx].id;
    R.bossIdx++;
    beginBoss(id);
  }
}

function edgeSpawnPoint(margin = 34) {
  const R = run, hw = VIEW.w / 2 + margin, hh = VIEW.h / 2 + margin, cx = R.p.x, cy = R.p.y;
  const r = Math.random() * (4 * hw + 4 * hh);
  if (r < 2 * hw) return [cx - hw + r, cy - hh];
  if (r < 4 * hw) return [cx - hw + (r - 2 * hw), cy + hh];
  if (r < 4 * hw + 2 * hh) return [cx - hw, cy - hh + (r - 4 * hw)];
  return [cx + hw, cy - hh + (r - 4 * hw - 2 * hh)];
}

function spawner(dt) {
  const R = run, plan = spawnPlan(R.t);
  R.inBig = !!plan.big;
  const cap = plan.big ? 300 : 230;
  R.spawnAcc += plan.rate * dt;
  while (R.spawnAcc >= 1) {
    R.spawnAcc -= 1;
    if (R.enemies.length >= cap) { R.spawnAcc = 0; break; }
    const [x, y] = edgeSpawnPoint();
    makeEnemy(weightedPick(plan.mix), x, y, false);
  }
  if (plan.big) {
    R.ringT -= dt;
    if (R.ringT <= 0) { R.ringT = 13; spawnRing(plan.mix, 28 + R.bigIdx * 8); }
  }
  R.eliteT -= dt;
  if (R.eliteT <= 0) {
    R.eliteT = plan.big ? 9 : 40;
    const [x, y] = edgeSpawnPoint(50);
    makeEnemy(weightedPick(plan.mix), x, y, true);
  }
}

function spawnRing(mix, n) {
  const P = run.p, rad = Math.hypot(VIEW.w, VIEW.h) / 2 + 30;
  const off = Math.random() * TAU;
  for (let i = 0; i < n; i++) {
    if (run.enemies.length > 340) break;
    const a = off + i / n * TAU;
    makeEnemy(weightedPick(mix), P.x + Math.cos(a) * rad, P.y + Math.sin(a) * rad, i % 14 === 0);
  }
}

/* -------------------------------- enemies -------------------------------- */

function makeEnemy(type, x, y, elite) {
  const R = run, d = ENEMIES[type];
  const hp = d.hp * enemyHpMult(R.t, R.bossesDown) * (elite ? ELITE.hp : 1);
  const e = {
    type, x, y, elite,
    r: d.r * (elite ? ELITE.size : 1),
    hp, maxHp: hp,
    speed: d.speed * rand(0.88, 1.12) * (elite ? 0.9 : 1),
    dmg: d.dmg * enemyDmgMult(R.t) * (elite ? ELITE.dmg : 1),
    exp: elite ? ELITE.exp : d.exp,
    fly: !!d.flying,
    flash: 0, atkCd: 0, gHit: -9, dHit: -9, slowT: 0, slowMul: 1,
    burnT: 0, burnDps: 0, burnTick: 0, kbx: 0, kby: 0,
    anim: Math.random() * 4, face: 1, wob: Math.random() * TAU, spawnT: 0, dead: false,
  };
  R.enemies.push(e);
  return e;
}

function updateEnemies(dt) {
  const R = run, P = R.p, A = R.arena;
  const far = Math.max(VIEW.w, VIEW.h) * 0.85 + 90;
  for (const e of R.enemies) {
    if (e.dead) continue;
    if (e.spawnT > 0) { e.spawnT -= dt; continue; }
    let dx = P.x - e.x, dy = P.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    let sp = e.speed;
    if (e.slowT > 0) { e.slowT -= dt; sp *= e.slowMul; }
    let mx = dx * sp, my = dy * sp;
    if (e.fly) {
      const w = Math.sin(R.clock * 3.2 + e.wob) * 0.65;
      mx += -dy * sp * w; my += dx * sp * w;
    }
    e.x += (mx + e.kbx) * dt;
    e.y += (my + e.kby) * dt;
    const damp = Math.max(0, 1 - 10 * dt);
    e.kbx *= damp; e.kby *= damp;
    if (Math.abs(dx) > 0.15) e.face = dx > 0 ? 1 : -1;
    e.anim += dt * (e.fly ? 13 : sp / 8);
    if (e.flash > 0) e.flash -= dt;
    if (e.atkCd > 0) e.atkCd -= dt;
    if (e.burnT > 0) {
      e.burnT -= dt; e.burnTick -= dt;
      if (e.burnTick <= 0) { e.burnTick = 0.5; hitEnemy(e, e.burnDps * 0.5, 0, 0, 0, '#d68bff'); if (e.dead) continue; }
    }
    if (!P.dead && d < e.r + P.r - 1 && e.atkCd <= 0) { e.atkCd = 0.75; hurtPlayer(e.dmg); }
    if (A) {
      e.x = clamp(e.x, A.x - A.w / 2 + e.r, A.x + A.w / 2 - e.r);
      e.y = clamp(e.y, A.y - A.h / 2 + e.r, A.y + A.h / 2 - e.r);
    } else if (d > far) {
      // Left far behind: come back in from the side you are walking toward.
      e.x = P.x + dx * far * 0.72 + rand(-40, 40);
      e.y = P.y + dy * far * 0.72 + rand(-40, 40);
    }
  }
}

function separate() {
  for (const e of run.enemies) {
    if (e.dead) continue;
    const cx = Math.floor(e.x / GRID), cy = Math.floor(e.y / GRID);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const a = grid.get(gridKey(cx + ox, cy + oy));
      if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        const o = a[i];
        if (o === e || o.dead || o.fly !== e.fly) continue;
        const dx = e.x - o.x, dy = e.y - o.y, rr = (e.r + o.r) * 0.85, d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0.0001) {
          const d = Math.sqrt(d2), push = (rr - d) / d * 0.22;
          e.x += dx * push; e.y += dy * push;
        }
      }
    }
  }
}

function hitEnemy(e, dmg, kx, ky, kb, color) {
  if (e.dead || e.invuln) return;
  e.hp -= dmg;
  e.flash = 0.09;
  if (kb && !e.isBoss) { const m = e.elite ? 0.3 : 1; e.kbx += kx * kb * m; e.kby += ky * kb * m; }
  addNum(e.x, e.y - e.r - 10, dmg, color);
  if (e.hp <= 0) { if (e.isBoss) killBoss(e); else killEnemy(e); }
}

function killEnemy(e) {
  const R = run;
  e.dead = true;
  R.kills++;
  R.gold += R.st.gold;               // 1 gold per kill, more with Gold Band
  dropGem(e.x, e.y, e.exp);
  const col = e.type === 'zombie' ? '#7d9e62' : e.type === 'butterfly' ? '#9a86c0' : e.type === 'minion' ? '#ff7a2a' : '#3f7a70';
  for (let i = 0; i < (e.elite ? 14 : 5); i++) addPart(e.x, e.y - 6, rand(-90, 90), rand(-110, 30), rand(0.3, 0.55), rand(2, 4.5), col, 'dot');
  addPart(e.x, e.y, 0, -12, 0.45, e.r * 1.3, 'rgba(200,200,210,0.5)', 'smoke');
}

/* -------------------------------- damage --------------------------------- */

function hurtPlayer(amount, opts = {}) {
  const R = run, P = R.p;
  if (P.dead || R.god || R.victory) return false;
  if (opts.boss && P.inv > 0) return false;
  const dmg = amount * R.st.taken;
  P.hp -= dmg;
  if (!opts.dot) {
    P.flash = 0.14;
    if (opts.boss) P.inv = 0.45;
    R.shake = Math.max(R.shake, opts.boss ? 7 : 2.5);
    Sfx.play('hurt');
    UI.hurt();
  }
  addNum(P.x, P.y - 44, dmg, opts.dot ? '#7dff5a' : '#ff4d4d', true);
  if (P.hp <= 0) { P.hp = 0; die(); }
  return true;
}

function die() {
  const R = run;
  if (R.p.dead) return;
  R.p.dead = true; R.p.deathT = 0;
  R.state = 'dead';
  Input.reset();
  Sfx.play('lose');
  for (let i = 0; i < 20; i++) addPart(R.p.x, R.p.y - 10, rand(-120, 120), rand(-160, 40), rand(0.4, 0.9), rand(2, 5), '#d94a3d', 'dot');
}

function finishRun(won) {
  const R = run, ch = R.chapter;
  const time = won ? ch.duration : R.t;
  const goldRun = Math.floor(R.gold);
  const goldBonus = won ? ch.reward.gold : 0, gems = won ? ch.reward.gems : 0;
  SAVE.gold += goldRun + goldBonus;
  SAVE.gems += gems;
  const prevBest = SAVE.best[ch.id] || 0;
  SAVE.best[ch.id] = Math.max(prevBest, time);
  if (won) SAVE.cleared[ch.id] = (SAVE.cleared[ch.id] || 0) + 1;
  SAVE.stats.runs++;
  SAVE.stats.kills += R.kills;
  persist();
  R.result = { won, time, kills: R.kills, goldRun, goldBonus, gems, level: R.p.level, newBest: time > prevBest };
  R.state = 'over';
  UI.showResults(R.result);
}

/* ------------------------------ gems & exp ------------------------------- */

function dropGem(x, y, v) {
  const G = run.gems;
  if (G.length >= 320) { const g = G[(run.gemMerge++) % G.length]; g.v += v; g.big = g.v >= 5; return; }
  G.push({ x: x + rand(-4, 4), y: y + rand(-4, 4), v, big: v >= 5, mag: false, sp: 0, bob: Math.random() * TAU, dead: false });
}

function updateGems(dt) {
  const R = run, P = R.p, pr = BASE.pickup;
  if (P.dead) return;
  for (const g of R.gems) {
    if (g.dead) continue;
    const dx = P.x - g.x, dy = P.y - g.y, d2 = dx * dx + dy * dy;
    if (!g.mag && d2 < pr * pr) g.mag = true;
    if (!g.mag) continue;
    const d = Math.sqrt(d2) || 1;
    if (d < P.r + 7) { g.dead = true; gainExp(g.v); Sfx.play('gem'); continue; }
    g.sp = Math.min(1000, g.sp + 1500 * dt);
    const step = Math.min(d, g.sp * dt);
    g.x += dx / d * step; g.y += dy / d * step;
  }
}

function gainExp(v) {
  const R = run, P = R.p;
  P.exp += v;
  while (P.exp >= P.next) { P.exp -= P.next; P.level++; P.next = expToNext(P.level); R.pending++; }
  if (R.pending > 0 && R.state === 'play' && !P.dead) openLevelUp();
}

function openLevelUp() {
  run.state = 'levelup';
  Input.reset();
  Sfx.play('levelup');
  UI.showLevelUp(makeOffers());
}

function chooseOffer(o) {
  if (!run || run.state !== 'levelup') return;
  applyOffer(o);
  run.pending--;
  if (run.pending > 0) { UI.showLevelUp(makeOffers()); Sfx.play('levelup'); }
  else { run.state = 'play'; UI.hideLevelUp(); }
}

function makeOffers() {
  const R = run, pool = [];
  for (const id of ABILITY_IDS) {
    const a = R.ab[id];
    if (a) {
      if (a.evo) continue;
      if (a.lv < MAX_STARS) pool.push({ type: 'ability', id, w: 1.5 });
      else if (R.bf[ABILITIES[id].needs]) pool.push({ type: 'evo', id, w: 1000 });
    } else if (R.abOrder.length < MAX_HELD) pool.push({ type: 'ability', id, w: 1 });
  }
  for (const id of BUFF_IDS) {
    const lv = R.bf[id] || 0;
    const helps = BUFFS[id].evolves.some(a => R.ab[a] && !R.ab[a].evo) ? 1.6 : 1;
    if (lv) { if (lv < MAX_STARS) pool.push({ type: 'buff', id, w: 0.9 * helps }); }
    else if (R.bfOrder.length < MAX_HELD) pool.push({ type: 'buff', id, w: 0.75 * helps });
  }
  const out = [];
  while (out.length < 3 && pool.length) {
    let total = 0;
    for (const o of pool) total += o.w;
    let r = Math.random() * total, i = 0;
    for (; i < pool.length - 1; i++) { r -= pool[i].w; if (r <= 0) break; }
    out.push(pool.splice(i, 1)[0]);
  }
  if (out.length < 3) out.push({ type: 'heal' });
  if (out.length < 3) out.push({ type: 'gold' });
  return out;
}

function offerInfo(o) {
  const R = run;
  if (o.type === 'ability') {
    const a = R.ab[o.id], next = a ? a.lv + 1 : 1, def = ABILITIES[o.id];
    return {
      icon: ICON[o.id], name: def.name, stars: next, isNew: !a, text: def.lv[next - 1], kind: 'Ability',
      hint: next === MAX_STARS ? `Evolves with ${BUFFS[def.needs].name}${R.bf[def.needs] ? ' (you have it)' : ''}` : '',
    };
  }
  if (o.type === 'evo') {
    const def = ABILITIES[o.id];
    return { icon: ICON[o.id + '_evo'], name: def.evo, evo: true, text: def.evoText, kind: 'Evolution', hint: `${def.name} 5★ + ${BUFFS[def.needs].name}` };
  }
  if (o.type === 'buff') {
    const lv = (R.bf[o.id] || 0) + 1, def = BUFFS[o.id];
    const names = def.evolves.map(id => ABILITIES[id].name);
    return {
      icon: ICON[o.id], name: def.name, stars: lv, isNew: lv === 1, text: def.text(lv), kind: 'Buff',
      hint: names.length ? 'Evolves ' + names.join(' and ') : 'Does not evolve anything',
    };
  }
  if (o.type === 'heal') return { icon: ICON.meat, name: 'Field Ration', text: 'Restore 30% of your max HP.', kind: 'Supply' };
  return { icon: ICON.goldbag, name: 'Gold Stash', text: '+50 gold.', kind: 'Supply' };
}

function applyOffer(o) {
  const R = run, P = R.p;
  if (o.type === 'ability') {
    const a = R.ab[o.id];
    if (a) a.lv = Math.min(MAX_STARS, a.lv + 1);
    else { R.ab[o.id] = { lv: 1, evo: false }; R.abOrder.push(o.id); }
    if (o.id === 'missile' && !a) R.missileT = 0.6;
    if (o.id === 'molotov' && !a) R.molT = 0.6;
  } else if (o.type === 'evo') {
    R.ab[o.id].evo = true;
    Sfx.play('evolve');
    UI.flash('#ffd36a');
    if (o.id === 'missile') R.missileT = 0.3;
    if (o.id === 'molotov') R.molT = 0.3;
  } else if (o.type === 'buff') {
    if (R.bf[o.id]) R.bf[o.id] = Math.min(MAX_STARS, R.bf[o.id] + 1);
    else { R.bf[o.id] = 1; R.bfOrder.push(o.id); }
    recalc();
  } else if (o.type === 'heal') {
    P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.3);
  } else {
    R.gold += 50;
    Sfx.play('coin');
  }
}

/* ----------------------------- your weapons ------------------------------ */

function updateWeapons(dt) {
  const R = run, P = R.p, S = R.st;
  if (P.dead) return;

  // Wood Shuriken: one throw a second at whatever is closest.
  if (R.weapon === 'shuriken') {
    R.shT -= dt;
    if (R.shT <= 0) {
      const t = nearestEnemy(P.x, P.y, AB.shuriken.range * S.area);
      if (t) {
        R.shT = AB.shuriken.every;
        const ang = Math.atan2(t.y - P.y, t.x - P.x), sp = AB.shuriken.speed * S.area;
        R.shots.push({ kind: 'shuriken', x: P.x, y: P.y - 4, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 8, dmg: S.atk * AB.shuriken.dmg, life: 1.3 * S.area, pierce: 0, rot: 0 });
        Sfx.play('shoot');
      } else R.shT = 0.15;
    }
  }

  // Guardian: blades on an orbit.
  R.blades.length = 0;
  const gd = R.ab.guardian;
  if (gd) {
    const C = AB.guardian, evo = gd.evo, n = evo ? 7 : gd.lv + 1;
    const orbit = (evo ? C.evoOrbit : C.orbit(gd.lv)) * S.area;
    R.guardAng += (evo ? C.evoSpin : C.spin) * S.area * dt;
    const br = (evo ? C.evoBlade : C.blade) * Math.sqrt(S.area);
    const dmg = S.atk * (evo ? C.evoDmg : C.dmg(gd.lv));
    for (let i = 0; i < n; i++) {
      const a = R.guardAng + i / n * TAU, bx = P.x + Math.cos(a) * orbit, by = P.y + Math.sin(a) * orbit;
      R.blades.push(bx, by);
      forEnemiesNear(bx, by, br, e => {
        if (R.clock - e.gHit < C.hitCd) return;
        e.gHit = R.clock;
        const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1;
        hitEnemy(e, dmg, dx / d, dy / d, 150, evo ? '#ff8a8a' : '#ffffff');
        Sfx.play('hit');
      });
    }
  }

  // Forcefield: a damaging ring around you.
  const ff = R.ab.forcefield;
  R.ffRad = 0;
  if (ff) {
    const C = AB.forcefield, evo = ff.evo;
    const rad = (evo ? C.evoRadius : C.radius(ff.lv)) * S.area;
    R.ffRad = rad;
    R.ffT -= dt;
    const tick = R.ffT <= 0;
    if (tick) R.ffT = C.tick;
    const dmg = S.atk * (evo ? C.evoDmg : C.dmg(ff.lv));
    if (tick || evo) forEnemiesNear(P.x, P.y, rad, e => {
      if (evo) { e.slowT = 0.2; e.slowMul = C.slow; }
      if (tick) hitEnemy(e, dmg, 0, 0, 0, evo ? '#ff9a9a' : '#a8ffb8');
    });
  }

  // Durian: bounces around the edges of the screen.
  const du = R.ab.durian;
  if (du) {
    const C = AB.durian, evo = du.evo;
    if (!R.durian) { const a = Math.random() * TAU; R.durian = { x: P.x, y: P.y, vx: Math.cos(a), vy: Math.sin(a), rot: 0, spikeT: 0.6, size: 16 }; }
    const D = R.durian;
    const size = (evo ? C.evoSize : C.size(du.lv)) * (1 + 0.05 * (R.bf.fuel || 0));
    const spd = C.speed * S.area, cur = Math.hypot(D.vx, D.vy) || 1;
    D.vx = D.vx / cur * spd; D.vy = D.vy / cur * spd;
    D.x += D.vx * dt; D.y += D.vy * dt;
    D.size = size;
    const L = R.cam.x - VIEW.w / 2, Rt = R.cam.x + VIEW.w / 2, T = R.cam.y - VIEW.h / 2, B = R.cam.y + VIEW.h / 2;
    if (D.x < L + size) { D.x = L + size; D.vx = Math.abs(D.vx); }
    if (D.x > Rt - size) { D.x = Rt - size; D.vx = -Math.abs(D.vx); }
    if (D.y < T + size) { D.y = T + size; D.vy = Math.abs(D.vy); }
    if (D.y > B - size) { D.y = B - size; D.vy = -Math.abs(D.vy); }
    D.rot += dt * (evo ? 5 : 3.5);
    const dmg = S.atk * (evo ? C.evoDmg : C.dmg(du.lv));
    forEnemiesNear(D.x, D.y, size * 0.92, e => {
      if (R.clock - e.dHit < C.hitCd) return;
      e.dHit = R.clock;
      const dx = e.x - D.x, dy = e.y - D.y, d = Math.hypot(dx, dy) || 1;
      hitEnemy(e, dmg, dx / d, dy / d, 170, evo ? '#ff8a8a' : '#d8ff9a');
    });
    if (evo) {
      D.spikeT -= dt;
      if (D.spikeT <= 0) {
        D.spikeT = C.spikeEvery;
        for (let i = 0; i < C.spikes; i++) {
          const a = i / C.spikes * TAU + D.rot, sp = 330 * S.area;
          R.shots.push({ kind: 'spike', x: D.x, y: D.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 6, dmg: S.atk * C.spikeDmg, life: 1.0, pierce: 1, rot: a, hit: [] });
        }
        Sfx.play('spike');
      }
    }
  } else R.durian = null;

  // Missile: every 5 seconds.
  const mi = R.ab.missile;
  if (mi) {
    R.missileT -= dt;
    if (R.missileT <= 0) {
      const t = (R.boss && R.boss.targetable) ? R.boss : nearestEnemy(P.x, P.y, 560);
      if (t || R.missileT < -1) {
        R.missileT = AB.missile.every;
        const ang = t ? Math.atan2(t.y - P.y, t.x - P.x) : Math.random() * TAU, sp = AB.missile.speed * S.area;
        R.shots.push({ kind: 'missile', evo: mi.evo, x: P.x, y: P.y - 8, vx: Math.cos(ang) * sp * 0.35, vy: Math.sin(ang) * sp * 0.35, sp, target: t, life: 3, r: 9, rot: ang, trailT: 0 });
        Sfx.play('shoot');
      }
    }
  }

  // Molotov Cocktail: every 5 seconds.
  const mo = R.ab.molotov;
  if (mo) {
    R.molT -= dt;
    if (R.molT <= 0) {
      R.molT = AB.molotov.every;
      if (mo.evo) {
        const off = Math.random() * TAU;
        for (let i = 0; i < AB.molotov.evoCount; i++) {
          const a = off + i / AB.molotov.evoCount * TAU, d = 128 * S.area;
          throwBottle('canister', P.x + Math.cos(a) * d, P.y + Math.sin(a) * d, i * 0.035);
        }
      } else {
        const targets = pickTargets(AB.molotov.count(mo.lv), AB.molotov.range * S.area);
        targets.forEach(([x, y], i) => throwBottle('molotov', x, y, i * 0.09));
      }
    }
  }
}

function pickTargets(n, range) {
  const P = run.p, cands = [];
  for (const e of run.enemies) if (!e.dead && (e.x - P.x) ** 2 + (e.y - P.y) ** 2 < range * range) cands.push(e);
  if (run.boss && run.boss.targetable) cands.unshift(run.boss);
  else shuffle(cands);
  const out = [];
  for (let i = 0; i < n; i++) {
    const e = cands[i % Math.max(1, cands.length)];
    if (e && (i < cands.length || e.isBoss)) out.push([e.x + rand(-14, 14), e.y + rand(-14, 14)]);
    else { const a = Math.random() * TAU, d = rand(60, range); out.push([P.x + Math.cos(a) * d, P.y + Math.sin(a) * d]); }
  }
  return out;
}

function throwBottle(kind, x1, y1, delay) {
  const P = run.p;
  run.throws.push({ kind, x0: P.x, y0: P.y - 10, x1, y1, t: -delay, dur: 0.55, rot: Math.random() * TAU, x: P.x, y: P.y, h: 0, dead: false });
}

function updateThrows(dt) {
  for (const t of run.throws) {
    if (t.dead) continue;
    t.t += dt;
    if (t.t < 0) { t.x = run.p.x; t.y = run.p.y; t.x0 = run.p.x; t.y0 = run.p.y - 10; continue; }
    const k = Math.min(1, t.t / t.dur);
    t.x = lerp(t.x0, t.x1, k); t.y = lerp(t.y0, t.y1, k);
    t.h = Math.sin(k * Math.PI) * (t.kind === 'canister' ? 70 : 90);
    t.rot += dt * 11;
    if (k >= 1) { t.dead = true; landBottle(t); }
  }
}

function landBottle(t) {
  const R = run, S = R.st, m = R.ab.molotov, lv = m ? m.lv : 1, evo = t.kind === 'canister', C = AB.molotov;
  const r = (evo ? C.evoRadius : C.radius(lv)) * S.area;
  const life = (evo ? C.evoLife : C.life) * S.dur;
  const dmg = S.atk * (evo ? C.evoDmg : C.dmg(lv));
  const flames = [], n = Math.round(4 + r / 8);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * r * 0.78;
    flames.push([Math.cos(a) * d, Math.sin(a) * d * 0.8, Math.random() * 4, 0.75 + Math.random() * 0.5]);
  }
  flames.sort((a, b) => a[1] - b[1]);
  R.zones.push({ x: t.x1, y: t.y1, r, life, max: life, tick: 0, dmg, color: evo ? 'blue' : 'orange', flames, dead: false });
  for (let i = 0; i < 6; i++) addPart(t.x1, t.y1, rand(-70, 70), rand(-90, -10), 0.35, 2.5, evo ? '#bfe3ff' : '#9be39f', 'dot');
  Sfx.play('fire');
}

function updateZones(dt) {
  for (const z of run.zones) {
    if (z.dead) continue;
    z.life -= dt;
    if (z.life <= 0) { z.dead = true; continue; }
    z.tick -= dt;
    if (z.tick <= 0) {
      z.tick = AB.molotov.tick;
      forEnemiesNear(z.x, z.y, z.r, e => hitEnemy(e, z.dmg, 0, 0, 0, z.color === 'blue' ? '#9fd4ff' : '#ffb35a'));
    }
  }
}

function updateShots(dt) {
  const R = run;
  for (const s of R.shots) {
    if (s.dead) continue;
    s.life -= dt;
    if (s.life <= 0) { if (s.kind === 'missile') explodeMissile(s); s.dead = true; continue; }
    if (s.kind === 'missile') {
      let tgt = s.target;
      if (tgt && (tgt.dead || (tgt.isBoss && !tgt.targetable))) tgt = s.target = null;
      if (!tgt) tgt = s.target = nearestEnemy(s.x, s.y, 420);
      const curA = Math.atan2(s.vy, s.vx);
      const want = tgt ? Math.atan2(tgt.y - s.y, tgt.x - s.x) : curA;
      const da = Math.atan2(Math.sin(want - curA), Math.cos(want - curA));
      const na = curA + clamp(da, -6 * dt, 6 * dt);
      const sp = Math.min(s.sp, Math.hypot(s.vx, s.vy) + s.sp * 2.4 * dt);
      s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp; s.rot = na;
      s.trailT -= dt;
      if (s.trailT <= 0) {
        s.trailT = 0.02;
        const bx = s.x - Math.cos(na) * 12, by = s.y - Math.sin(na) * 12;
        if (s.evo) addPart(bx, by, rand(-20, 20), rand(-20, 20), rand(0.25, 0.45), rand(4, 7), Math.random() < 0.5 ? '#b24bff' : '#e3a6ff', 'fire');
        else addPart(bx, by, rand(-15, 15), rand(-15, 15), rand(0.3, 0.5), rand(3, 5), 'rgba(210,210,220,0.7)', 'smoke');
      }
    } else if (s.kind === 'shuriken') s.rot += dt * 20;
    s.x += s.vx * dt; s.y += s.vy * dt;
    forEnemiesNear(s.x, s.y, s.r, e => {
      if (s.dead) return false;
      if (s.hit && s.hit.includes(e)) return;
      if (s.kind === 'missile') { explodeMissile(s); s.dead = true; return false; }
      const d = Math.hypot(s.vx, s.vy) || 1;
      hitEnemy(e, s.dmg, s.vx / d, s.vy / d, s.kind === 'shuriken' ? 70 : 45, '#ffffff');
      for (let i = 0; i < 3; i++) addPart(s.x, s.y, rand(-80, 80), rand(-80, 80), 0.18, 2, s.kind === 'spike' ? '#3a3040' : '#f7d79a', 'dot');
      if (s.pierce > 0) { s.pierce--; s.hit.push(e); }
      else { s.dead = true; return false; }
    });
  }
}

function explodeMissile(s) {
  const R = run, S = R.st, C = AB.missile, evo = s.evo, lv = R.ab.missile ? R.ab.missile.lv : 1;
  const rad = (evo ? C.evoRadius : C.radius(lv)) * S.area;
  const dmg = S.atk * (evo ? C.evoDmg : C.dmg(lv));
  forEnemiesNear(s.x, s.y, rad, e => {
    const dx = e.x - s.x, dy = e.y - s.y, d = Math.hypot(dx, dy) || 1;
    hitEnemy(e, dmg, dx / d, dy / d, 240, evo ? '#e0a0ff' : '#ffd27a');
    if (evo && !e.dead) { e.burnT = C.burnTime * S.dur; e.burnDps = S.atk * C.burn; e.burnTick = 0.5; }
  });
  R.booms.push({ x: s.x, y: s.y, r: rad, t: 0, dur: evo ? 0.6 : 0.42, color: evo ? 'purple' : 'orange', dead: false });
  R.rings.push({ x: s.x, y: s.y, r0: rad * 0.3, r1: rad * 1.1, t: 0, dur: 0.35, color: evo ? 'rgba(200,120,255,' : 'rgba(255,210,140,', dead: false });
  for (let i = 0; i < (evo ? 18 : 10); i++) {
    const a = Math.random() * TAU, v = rand(80, 260);
    addPart(s.x, s.y, Math.cos(a) * v, Math.sin(a) * v, rand(0.3, 0.6), rand(2.5, 5), evo ? (i % 2 ? '#c77dff' : '#f3d9ff') : (i % 2 ? '#ffb02e' : '#fff0a0'), 'fire');
  }
  R.shake = Math.max(R.shake, evo ? 6 : 3);
  Sfx.play(evo ? 'bigboom' : 'boom');
}

/* ------------------------------ your status ------------------------------ */

function updateStatus(dt) {
  const P = run.p, S = run.st;
  if (P.dead) return;
  if (S.regen > 0 && P.hp < P.maxHp) P.hp = Math.min(P.maxHp, P.hp + P.maxHp * S.regen * dt);
  if (P.poisonT > 0) {
    P.poisonT -= dt; P.poisonTick -= dt;
    if (P.poisonTick <= 0) {
      P.poisonTick = 0.5;
      hurtPlayer(P.poisonDps * 0.5, { dot: true });
      addPart(P.x + rand(-8, 8), P.y - rand(10, 30), rand(-10, 10), rand(-40, -20), 0.6, rand(2, 3.5), '#7dff5a', 'dot');
    }
  }
}

/* ----------------------------------- fx ---------------------------------- */

function addPart(x, y, vx, vy, life, size, color, kind) {
  const P = run.parts;
  if (P.length > 650) return;
  P.push({ x, y, vx, vy, life, max: life, size, color, kind, dead: false });
}
function addNum(x, y, v, color, own) {
  if (!SAVE.settings.numbers && !own) return;
  const N = run.nums;
  if (N.length > 48) { if (!own) return; N.shift(); }
  N.push({ x: x + rand(-7, 7), y, v: Math.max(1, Math.round(v)), t: 0, color: color || '#ffffff', own: !!own, dead: false });
}
function puff(x, y, color) {
  for (let i = 0; i < 6; i++) addPart(x + rand(-8, 8), y + rand(-8, 8), rand(-30, 30), rand(-50, -10), rand(0.4, 0.7), rand(5, 9), color, 'smoke');
}

function updateFx(dt) {
  const R = run;
  for (const p of R.parts) {
    if (p.dead) continue;
    p.life -= dt;
    if (p.life <= 0) { p.dead = true; continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    const k = Math.max(0, 1 - 3 * dt);
    p.vx *= k; p.vy = p.vy * k + (p.kind === 'dot' ? 260 * dt : 0);
  }
  for (const b of R.booms) { b.t += dt; if (b.t >= b.dur) b.dead = true; }
  for (const r of R.rings) { r.t += dt; if (r.t >= r.dur) r.dead = true; }
  for (const n of R.nums) { n.t += dt; if (n.t > (n.own ? 0.9 : 0.65)) n.dead = true; }
  if (R.bossDeath) { R.bossDeath.t += dt; if (R.bossDeath.t > 1.6) R.bossDeath = null; }
}

function inplace(a) {
  let j = 0;
  for (let i = 0; i < a.length; i++) if (!a[i].dead) a[j++] = a[i];
  a.length = j;
}
function compact() {
  const R = run;
  inplace(R.enemies); inplace(R.gems); inplace(R.shots); inplace(R.ebullets); inplace(R.zones);
  inplace(R.hazards); inplace(R.booms); inplace(R.rings); inplace(R.parts); inplace(R.nums); inplace(R.throws);
}
