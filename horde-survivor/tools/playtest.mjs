/* =============================================================================
   Balance check: a bot plays a full chapter in a headless browser and prints
   a timeline (level, HP, kills, boss HP) plus which attacks hurt it most.

     node horde-survivor/tools/playtest.mjs [speed=8] [gear=none|some|max]

   The bot dodges with a simple danger field and grabs gems when it is safe,
   so it plays worse than a careful person. Needs playwright.
   ========================================================================== */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// require() rather than import, so a globally installed playwright is found too.
const { chromium } = createRequire(import.meta.url)('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = 'file://' + path.join(HERE, '..', 'index.html');
const SPEED = +(process.argv[2] || 8);
const GEAR = process.argv[3] || 'none';

function installBot() {
  const P0 = () => __hs.run;
  Input.axis = () => {
    const R = P0();
    if (!R || R.state !== 'play') return { x: 0, y: 0, m: 0 };
    const P = R.p;
    let fx = 0, fy = 0;
    const push = (x, y, w, rad) => {
      const dx = P.x - x, dy = P.y - y, d = Math.hypot(dx, dy) || 0.1;
      if (d < rad) { const k = w * (1 - d / rad) / d; fx += dx * k; fy += dy * k; }
    };
    const hpk = P.hp / P.maxHp, keep = hpk > 0.6 ? 34 : hpk > 0.35 ? 60 : 95;
    for (const e of R.enemies) if (!e.dead) push(e.x, e.y, e.elite ? 3 : 1.2, keep + e.r);
    if (R.boss && !R.boss.dead) push(R.boss.x, R.boss.y, 10, 170 + R.boss.r);
    for (const b of R.ebullets) { if (b.dead) continue; push(b.x + b.vx * 0.25, b.y + b.vy * 0.25, 6, 60); push(b.x, b.y, 4, 45); }
    for (const h of R.hazards) {
      if (h.kind === 'slam') push(h.x, h.y, 14, h.r + 40);
      if (h.kind === 'spike' && !h.erupted) push(h.x, h.y, 4, h.r + 26);
      if (h.kind === 'mine') push(h.x, h.y, h.state === 'fuse' ? 10 : 3, h.state === 'fuse' ? h.r + 30 : h.trig + 30);
      if (h.kind === 'line') {
        const t = Math.max(0, Math.min(h.len, (P.x - h.x) * h.dx + (P.y - h.y) * h.dy));
        push(h.x + h.dx * t, h.y + h.dy * t, 14, h.w + 40);
      }
    }
    const A = R.arena;
    if (A) {
      const m = 70, l = A.x - A.w / 2, r = A.x + A.w / 2, t = A.y - A.h / 2, b = A.y + A.h / 2;
      if (P.x < l + m) fx += 3 * (1 - (P.x - l) / m);
      if (P.x > r - m) fx -= 3 * (1 - (r - P.x) / m);
      if (P.y < t + m) fy += 3 * (1 - (P.y - t) / m);
      if (P.y > b - m) fy -= 3 * (1 - (b - P.y) / m);
    }
    if (Math.hypot(fx, fy) < 0.05) {
      let best = null, bd = 260 * 260;
      for (const g of R.gems) { const d = (g.x - P.x) ** 2 + (g.y - P.y) ** 2; if (d < bd) { bd = d; best = g; } }
      if (best) { const d = Math.sqrt(bd) || 1; fx += (best.x - P.x) / d * 0.06; fy += (best.y - P.y) / d * 0.06; }
    }
    const m = Math.hypot(fx, fy);
    return m < 1e-6 ? { x: 0, y: 0, m: 0 } : { x: fx / m, y: fy / m, m: 1 };
  };
  // Picks: evolutions, then abilities it already has, then buffs that unlock an evolution.
  setInterval(() => {
    const R = P0();
    if (!R || R.state !== 'levelup') return;
    const cards = [...document.querySelectorAll('.choice')];
    const score = name => {
      for (const id in ABILITIES) if (ABILITIES[id].evo === name) return 100;
      for (const id in ABILITIES) if (ABILITIES[id].name === name) return R.ab[id] ? 60 + R.ab[id].lv : 50;
      for (const id in BUFFS) if (BUFFS[id].name === name) return (BUFFS[id].evolves.some(a => R.ab[a]) ? 45 : 20) + (id === 'energy' || id === 'armor' ? 8 : 0);
      return 1;
    };
    let bi = 0;
    cards.forEach((c, i) => { if (score(c.querySelector('.choice-name').textContent) > score(cards[bi].querySelector('.choice-name').textContent)) bi = i; });
    if (cards[bi]) cards[bi].click();
  }, 300);
  // Damage by source.
  window.__dmg = {};
  const orig = window.hurtPlayer;
  window.hurtPlayer = (amount, opts) => {
    const R = P0();
    const line = (new Error().stack || '').split('\n')[2] || '';
    const fn = (line.match(/at (?:Object\.)?([\w.]+)/) || [])[1] || '?';
    const src = fn === 'updateBoss' ? 'contact' : fn;
    const ok = orig(amount, opts);
    if (ok) { const k = (R.boss ? R.boss.id : 'mobs') + ' ' + src; __dmg[k] = (__dmg[k] || 0) + Math.round(amount * R.st.taken); }
    return ok;
  };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(PAGE);
await page.waitForTimeout(400);
await page.evaluate(gear => {
  if (gear === 'none') return;
  const lvl = gear === 'max' ? 10 : 4;
  SAVE.items = [];
  for (const t of Object.keys(ITEMS)) { const it = newItem(t, lvl); SAVE.items.push(it); SAVE.equipped[ITEMS[t].slot] = it.uid; }
}, GEAR);
await page.evaluate(installBot);
await page.evaluate(s => { __hs.start(); __hs.speed(s); }, SPEED);

let lastT = -60;
for (;;) {
  await page.waitForTimeout(1000);
  const s = await page.evaluate(() => {
    const R = __hs.run;
    return R && { t: R.t, hp: Math.round(R.p.hp), max: R.p.maxHp, lv: R.p.level, kills: R.kills, en: R.enemies.length, boss: R.boss && { id: R.boss.id, hp: Math.round(R.boss.hp) }, res: R.result };
  });
  if (!s) break;
  if (s.t - lastT >= 60 || s.boss) {
    console.log(`${String(Math.floor(s.t / 60)).padStart(2)}:${String(Math.floor(s.t % 60)).padStart(2, '0')}  lv ${String(s.lv).padStart(2)}  hp ${s.hp}/${s.max}  kills ${s.kills}  on screen ${s.en}` + (s.boss ? `  ${s.boss.id} ${s.boss.hp}` : ''));
    lastT = s.t;
  }
  if (s.res) { console.log(s.res.won ? 'CLEARED' : 'DIED', JSON.stringify(s.res)); break; }
}
console.log('damage taken by source:', JSON.stringify(await page.evaluate(() => __dmg)));
if (errors.length) console.log('page errors:\n' + errors.join('\n'));
await browser.close();
