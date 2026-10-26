/* =============================================================================
   Boots Blacksmith in a real browser, on a phone-sized landscape screen with
   touch, and checks that the game does what it says it does: the stone
   circle and its two paths, the cave and its ring, the rocks and what they
   take to break, Rob's bounty, the Stone Pickaxe, the anvil and what it
   makes of the ore you give it, dying without losing anything, and the save.

     node blacksmith/tools/verify.mjs            # the source, served over http
     node blacksmith/tools/verify.mjs --file     # dist/blacksmith.html, off the disk

   Screenshots land in blacksmith/.shots/. Exits non-zero if anything fails.
   Set CHROMIUM_PATH to reuse a chromium you already have.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { launch, GAME } from './harness.mjs';
import { mockScript } from './mockcloud.mjs';
import { ORES, minedOreOdds, rollMinedOre, partsOf, itemStats, afterArmor, ROCK_COUNTS, DEEP_ROCK_COUNTS } from '../src/game/data.js';

const FILE = process.argv.includes('--file');
const SHOTS = path.join(GAME, '.shots', FILE ? 'file' : 'src');
fs.mkdirSync(SHOTS, { recursive: true });

const fails = [];
const check = (name, ok, detail = '') => {
  if (!ok) fails.push(name);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

/* ------------------------- the numbers, without a browser ------------------ */

{
  const odds = minedOreOdds();
  const n = 600000, seen = {};
  for (let i = 0; i < n; i++) { const o = rollMinedOre(); seen[o] = (seen[o] || 0) + 1; }
  const exact = ['stone', 'gold', 'amethyst', 'emerald', 'diamond', 'irisite'];
  const okExact = exact.every((id) => Math.abs(odds[id] - 1 / ORES[id].oneIn) < 1e-9);
  const okSim = Object.keys(odds).every((id) => Math.abs((seen[id] || 0) / n - odds[id]) < Math.max(0.004, odds[id] * 0.12));
  check('ore odds: Stone 1/2, Gold 1/12, Amethyst 1/20, Emerald 1/40, Diamond 1/60, Irisite 1/300', okExact);
  check('ore odds: Bronze stays commoner than Iron, and rolls land on the table', odds.bronze > odds.iron && okSim,
    Object.entries(seen).map(([k, v]) => `${k} ${(v / n * 100).toFixed(2)}%`).join(' '));
  check('the most ore is the blade, then the guard, the least the pommel',
    partsOf([['iron', 5], ['gold', 3], ['diamond', 2]]).join() === 'iron,gold,diamond' &&
    partsOf([['diamond', 2], ['gold', 3], ['iron', 5]]).join() === 'iron,gold,diamond');
  check('a tie goes to the slot further left; one ore makes every part',
    partsOf([['gold', 1], ['iron', 1]]).join() === 'gold,iron,iron' && partsOf([['emerald', 3]]).join() === 'emerald,emerald,emerald');
  const dmg = (ore) => itemStats({ kind: 'weapon', type: 'dagger', mix: [[ore, 3]] }).damage;
  const def = (ore) => itemStats({ kind: 'armor', type: 'chestplate', mix: [[ore, 5]] }).defense;
  check('better ore, more damage and more defense',
    dmg('stone') < dmg('bronze') && dmg('iron') < dmg('gold') && dmg('diamond') < dmg('irisite') &&
    def('stone') < def('iron') && def('emerald') < def('irisite'),
    `daggers ${['stone', 'iron', 'gold', 'diamond', 'irisite'].map(dmg).join('/')}`);
  check('armor takes a share of every hit', afterArmor(10, 0) === 10 && afterArmor(10, 40) === 5);
}

/* ------------------------------ in the browser ----------------------------- */

const url = FILE ? 'file://' + path.join(GAME, '..', 'dist', 'blacksmith.html') : null;
if (FILE && !fs.existsSync(url.slice(7))) {
  console.error('dist/blacksmith.html is missing - run: npm run build:blacksmith');
  process.exit(1);
}
const h = await launch({ url });
const { page, logs, ev } = h;
const shot = async (n) => {
  // the frame loop is stood down during the test, so draw the frame first
  await ev(() => window.BLACKSMITH?.game?.render()).catch(() => {});
  await page.screenshot({ path: path.join(SHOTS, n + '.png') });
};
const external = [];
page.on('request', (r) => {
  const u = r.url();
  if (FILE && !u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
});

/**
 * Helpers living in the page. The frame loop stands aside while the test
 * runs and only these fixed steps move the game on: software rendering is
 * slow enough to skew timings, and to turn a tap into a long press.
 */
async function installHelpers() {
  await ev(() => {
    const A = window.BLACKSMITH;
    A.state = 'test';
    window.T = {
      A,
      step(n = 1, { attack = false, move = null, dt = 1 / 30 } = {}) {
        const I = A.input;
        for (let i = 0; i < n; i++) {
          I.beginFrame();
          I.down.attack = attack;
          if (move) { I.move.x = move.x; I.move.y = move.y; }
          A.game.update(dt, I);
        }
        I.down.attack = false;
        if (move) { I.move.x = 0; I.move.y = 0; }
      },
      /**
       * Stand `gap` metres from a thing's edge, facing it, on whichever side
       * has room for you: not in the wall, not in another rock.
       */
      faceUp(x, z, radius, gap = 0.45) {
        const g = A.game, p = g.player;
        const r = radius + gap + p.radius;
        let best = null;
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const want = { x: x + Math.sin(a) * r, z: z + Math.cos(a) * r };
          const at = { ...want };
          g.area.collider.resolve(at, p.radius);
          const err = Math.hypot(at.x - want.x, at.z - want.z);
          if (!best || err < best.err) best = { at, err };
          if (err < 0.01) break;
        }
        p.teleport(best.at.x, best.at.z, Math.atan2(x - best.at.x, z - best.at.z));
        g.camRig.snapBehind(p.pos, p.yaw);
      },
      ores() { return Object.values(A.profile.ores).reduce((a, b) => a + b, 0); },
      /** Where on the screen the middle of a thing is, after a frame. */
      onScreen(v) {
        const g = A.game;
        g.camera.updateMatrixWorld();
        const p = v.clone().project(g.camera);
        const r = g.renderer.domElement.getBoundingClientRect();
        return { x: r.left + (p.x * 0.5 + 0.5) * r.width, y: r.top + (-p.y * 0.5 + 0.5) * r.height };
      },
      /** One frame of a player's hands: the stick, and ATTACK held or not. */
      frame(attack = false, move = null) { this.step(1, { attack, move }); },
      /**
       * Walks to (x, z) on the stick alone, the way a thumb would: the camera
       * is turned to face the way, and the stick pushed forward.
       */
      walkTo(x, z, within = 0.6, maxFrames = 900) {
        const g = A.game;
        for (let f = 0; f < maxFrames; f++) {
          const p = g.player.pos;
          const dx = x - p.x, dz = z - p.z;
          if (Math.hypot(dx, dz) < within || g.mode !== 'play') { this.frame(); return { ok: g.mode === 'play' ? true : g.mode, at: [p.x, p.z] }; }
          g.camRig.yaw = Math.atan2(dx, dz) + Math.PI;
          this.frame(false, { x: 0, y: 1 });
        }
        return { ok: false, at: [g.player.pos.x, g.player.pos.z] };
      },
      /** A skeleton in reach rightly takes a swing meant for a rock: send them round the far side. */
      clearSkeletons(x, z) {
        const far = Math.atan2(-x, -z);
        A.game.skeletons.list.forEach((s, i) => {
          s.pos.set(Math.sin(far + i * 0.4) * 14, 0, Math.cos(far + i * 0.4) * 14);
          s.state = 'wander';
          s.wanderTo = null;
        });
      },
    };
  });
}

try {
  await page.waitForSelector('#menu-screen.active', { timeout: 60000 });
  check('the menu comes up', true);
  await shot('01-menu');
  await page.tap('#btn-newgame');
  await page.waitForFunction(() => window.BLACKSMITH?.state === 'playing', null, { timeout: 180000 });
  await page.waitForTimeout(800);
  await installHelpers();
  await shot('02-spawn');

  const spawn = await ev(() => { const p = window.BLACKSMITH.game.player.pos; return { x: p.x, y: p.y, z: p.z }; });
  check('you spawn on the stone circle', Math.hypot(spawn.x, spawn.z) < 5 && spawn.y > 0.05, JSON.stringify(spawn));
  const start = await ev(() => {
    const P = window.BLACKSMITH.profile;
    return { cash: P.cash, pick: P.pickaxe(), weapon: P.weapon(), tag: window.BLACKSMITH.game.player.tag.text };
  });
  check('you start with a Wood Pickaxe that does 5 damage to rocks, and no money',
    start.cash === 0 && start.pick.item?.type === 'wood' && start.pick.mining === 5 && !start.weapon, JSON.stringify(start.pick));
  check('your level is over your head', start.tag === 'Lv. 1');

  /* ------------------------------ the stick ------------------------------ */
  {
    const c = await ev(() => {
      const r = document.querySelector('#stick-base').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    const before = await ev(() => ({ ...window.BLACKSMITH.game.player.pos }));
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await touch('touchStart', c.x, c.y);
    for (let i = 1; i <= 8; i++) await touch('touchMove', c.x, c.y - i * 7);
    const held = await ev(() => ({ ...window.BLACKSMITH.input.move }));
    await ev(() => window.T.step(30));
    await touch('touchEnd', c.x, c.y - 56);
    const after = await ev(() => ({ ...window.BLACKSMITH.game.player.pos }));
    check('the joystick walks you forward, up the cave path', held.y > 0.6 && before.z - after.z > 1.5,
      JSON.stringify({ held, moved: +(before.z - after.z).toFixed(2) }));
  }

  /* ------------------------ the paths, the forge, the sign ---------------- */
  {
    const world = await ev(() => {
      const g = window.BLACKSMITH.game, ow = g.areas.overworld;
      const sign = ow.cave.sign;
      sign.updateWorldMatrix(true, true);
      const at = sign.getWorldPosition(sign.position.clone());
      let lettered = false;
      sign.traverse((o) => { for (const m of [].concat(o.material || [])) if (m.map?.image?.width === 512) lettered = true; });
      return { forge: !!ow.forge.anvil && !!ow.forge.tipper && !!ow.forge.moldLava, water: !!ow.forge.waterTop,
        sign: { y: at.y, x: at.x, z: at.z, lettered } };
    });
    check('the Forge has its anvil, its lava bucket over a sword mould, and a water bucket', world.forge && world.water);
    check('a wooden sign hangs over the cave mouth', world.sign.lettered && world.sign.y > 3.5 && Math.abs(world.sign.x) < 0.5 && world.sign.z < -44,
      JSON.stringify(world.sign));

    const looks = await ev(() => {
      const g = window.BLACKSMITH.game, scene = g.areas.overworld.scene;
      scene.updateMatrixWorld(true);
      const V = g.camera.position.constructor;
      const r2 = (v) => +v.toFixed(2);
      // the signpost: two arrow-cut planks, each pointing the way it says
      const boards = [];
      scene.traverse((o) => { if (o.isMesh && o.geometry.type === 'ExtrudeGeometry' && Array.isArray(o.material) && o.material.length === 3) boards.push(o); });
      const arrows = boards.map((b) => {
        b.geometry.computeBoundingBox();
        const bb = b.geometry.boundingBox;
        const dir = new V(bb.max.x, 0, 0).applyMatrix4(b.matrixWorld).sub(new V(bb.min.x, 0, 0).applyMatrix4(b.matrixWorld)).normalize();
        return { dir: [r2(dir.x), r2(dir.z)], thick: r2(bb.max.z - bb.min.z), tall: r2(bb.max.y - bb.min.y) };
      });
      // the pickaxe in your hand: two spikes, straight out to each side
      const spikes = [];
      g.player.outfit.held.group.traverse((o) => { if (o.isMesh && o.geometry.parameters?.radiusTop === 0.004) spikes.push(new V(0, 0.29, 0).applyMatrix4(o.matrix)); });
      // the cave mouth: whatever you look at beside it or over it is rock
      const ray = new g.raycaster.constructor();
      ray.camera = g.camera;
      ray.far = 25;
      const holes = [];
      for (const [x, y] of [[-9, 3], [-6, 0.6], [-4, 2], [-3.2, 1], [-3.2, 4], [-2, 5.4], [0, 6], [0, 9], [2, 5.4], [3.2, 1], [3.2, 4], [4, 2], [6, 0.6], [9, 3], [0, 2]]) {
        ray.set(new V(x, y, -43.6), new V(0, 0, -1));
        if (!ray.intersectObjects(scene.children, true).some((h) => h.object.visible && h.object.isMesh)) holes.push([x, y]);
      }
      return { arrows, spikes: spikes.map((t) => [r2(t.x), r2(t.y), r2(t.z)]), holes };
    });
    const cave = looks.arrows.find((a) => a.dir[1] < -0.95), forge = looks.arrows.find((a) => a.dir[0] < -0.95);
    check('the signpost\'s two arrows are cut to a point and aim at the Cave and the Forge',
      looks.arrows.length === 2 && cave && forge && looks.arrows.every((a) => a.thick <= 0.07 && a.tall <= 0.4), JSON.stringify(looks.arrows));
    const [a, b] = looks.spikes;
    check('the pickaxe\'s two spikes stick straight out either side of its head',
      looks.spikes.length === 2 && Math.abs(a[0] + b[0]) < 0.01 && Math.abs(a[0]) > 0.25 && Math.abs(a[1] - b[1]) < 0.01 && Math.abs(a[2]) < 0.01 && Math.abs(b[2]) < 0.01,
      JSON.stringify(looks.spikes));
    check('nothing can be seen through the cliff beside or over the cave mouth', looks.holes.length === 0, JSON.stringify(looks.holes));

    // every torch, at the cave mouth and in the cave: the fire stands on the tip
    // of its handle, the handle leans out from the wall, and the wall is right behind it
    const torches = await ev(() => {
      const g = window.BLACKSMITH.game;
      const ray = new g.raycaster.constructor();
      ray.camera = g.camera;
      const look = (area, flames) => {
        area.scene.updateMatrixWorld(true);
        return flames.map((f) => {
          const { tip, out, dir } = f.userData;
          ray.set(tip, out.clone().negate());
          ray.far = 0.7;
          const wall = ray.intersectObjects(area.scene.children, true).find((h) => h.object.isMesh);
          return {
            onTip: f.position.distanceTo(tip) < 1e-6 && f.center.y <= 0.15,
            out: +dir.dot(out).toFixed(2), up: +dir.y.toFixed(2), wall: wall ? +wall.distance.toFixed(2) : null,
          };
        });
      };
      return {
        mouth: look(g.areas.overworld, g.areas.overworld.cave.torches),
        cave: look(g.areas.cave, g.areas.cave.torches),
        deep: look(g.areas.deep, g.areas.deep.torches),
      };
    });
    const all = [...torches.mouth, ...torches.cave, ...torches.deep];
    check('every torch, up top and down below, has its fire on the tip of its handle, leaning out from the wall it is fixed to',
      torches.mouth.length === 2 && torches.cave.length === 14 && torches.deep.length === 8 &&
      all.every((t) => t.onTip && t.out > 0.25 && t.up > 0.8 && t.wall !== null && t.wall < 0.6), JSON.stringify(torches));
  }

  /* --------------------------------- forging ------------------------------ */
  // tap the anvil itself
  await ev(() => {
    const g = window.BLACKSMITH.game, p = g.player;
    p.teleport(-19.5, -4.4, -Math.PI / 2);
    g.camRig.snapBehind(p.pos, p.yaw);
    g.camRig.pitch = 0.2;
    window.T.step(20);
  });
  const anvilOnScreen = await ev(() => {
    const g = window.BLACKSMITH.game;
    const v = g.area.forge.anvilTop.clone().setY(0.8).project(g.camera);
    const r = g.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
  });
  await shot('03-forge');
  await page.touchscreen.tap(anvilOnScreen.x, anvilOnScreen.y);
  await ev(() => window.T.step(30));
  const forgeOpen = await ev(() => {
    const g = window.BLACKSMITH.game;
    return { mode: g.mode, dist: g.camera.position.distanceTo(g.area.forge.anvilTop), menu: !document.querySelector('#forge').classList.contains('hidden') };
  });
  check('tapping the anvil opens its menu and the camera zooms to it',
    forgeOpen.mode === 'forge' && forgeOpen.menu && forgeOpen.dist < 3.6, JSON.stringify(forgeOpen));
  await shot('04-anvil');

  // forge a sword through the menu, as a player would
  await ev(() => { const P = window.BLACKSMITH.profile; P.addOre('iron', 5); P.addOre('gold', 3); P.addOre('diamond', 2); P.addOre('stone', 6); });
  const tapSel = async (sel) => { await page.tap(sel); await ev(() => window.T.step(1)); };
  await page.tap('.rchip:nth-child(2)');
  const pickOre = async (slot, name) => {
    await page.tap(`#slots .slot:nth-child(${slot}) .sicon`);
    await page.locator('#op-grid .opt', { hasText: name }).first().tap();
  };
  await pickOre(1, 'Diamond');
  await pickOre(2, 'Gold');
  await pickOre(3, 'Iron');
  const slotState = await ev(() => ({
    need: document.querySelector('#forge-need').textContent,
    parts: [...document.querySelectorAll('#slots .spart')].map((e) => e.textContent),
    disabled: document.querySelector('#btn-forge').disabled,
  }));
  check('the anvil says which ore becomes which part as you fill it',
    slotState.need === '10 ORE \u00b7 NEEDS 10' && slotState.parts.join('|') === 'POMMEL|CROSS-GUARD|BLADE' && !slotState.disabled,
    JSON.stringify(slotState));
  await shot('05-anvil-filled');
  await tapSel('#btn-forge');
  const mid = await ev(() => { window.T.step(24); const F = window.BLACKSMITH.game.area.forge; return { tilt: F.tipper.rotation.x, stream: F.stream.visible, ores: window.T.ores() }; });
  check('forging pours the lava bucket into the mould, and uses up the ore', mid.tilt > 0.6 && mid.stream && mid.ores === 6, JSON.stringify(mid));
  await shot('06-pour');
  await ev(() => window.T.step(30));
  await shot('07-hammer');
  await ev(() => window.T.step(70));
  const forged = await ev(() => {
    const P = window.BLACKSMITH.profile;
    const it = P.itemsOf('weapon')[0];
    return { shown: !document.querySelector('#forged').classList.contains('hidden'), it, name: document.querySelector('#forged-name').textContent };
  });
  check('it comes out an Iron Straight-Sword with a Gold guard and a Diamond pommel',
    forged.shown && forged.it?.type === 'sword' && forged.name.startsWith('Iron Straight-Sword'), JSON.stringify(forged));
  await shot('08-forged');
  await tapSel('#btn-forged-equip');
  check('at the anvil you keep hold of the smith\'s hammer', await ev(() => window.BLACKSMITH.game.player.outfit.held?.key === 'hammer'));

  // a helmet: two ores, one each - the tie goes to the left slot
  await ev(() => { const P = window.BLACKSMITH.profile; P.addOre('bronze', 1); P.addOre('gold', 1); });
  await page.tap('.rchip:nth-child(4)');
  await pickOre(1, 'Bronze');
  await pickOre(2, 'Gold');
  await page.tap('#slots .slot:nth-child(3) .sicon');
  await page.locator('#op-grid .opt.clear').tap();
  await tapSel('#btn-forge');
  await ev(() => window.T.step(130));
  await tapSel('#btn-forged-equip');
  const helmet = await ev(() => {
    const g = window.BLACKSMITH.game, P = window.BLACKSMITH.profile;
    const it = P.equippedItem('helmet');
    const ores = new Set();
    for (const m of g.player.outfit.armor.helmet?.meshes || []) ores.add(m.material.userData.ore);
    return { mix: it?.mix, ores: [...ores], def: P.defense() };
  });
  check('a Light Helmet goes on your head in its ores', helmet.mix && helmet.ores.includes('bronze') && helmet.ores.includes('gold') && helmet.def > 0,
    JSON.stringify(helmet));

  // the recipe's count is only the least it takes: twelve Iron into a dagger
  await ev(() => window.BLACKSMITH.profile.addOre('iron', 12));
  await page.tap('.rchip:nth-child(1)');
  await pickOre(1, 'Iron');
  await page.tap('#slots .slot:nth-child(1) .sall');
  const big = await ev(() => ({
    need: document.querySelector('#forge-need').textContent, preview: document.querySelector('#forge-preview').textContent,
    disabled: document.querySelector('#btn-forge').disabled,
  }));
  await tapSel('#btn-forge');
  await ev(() => window.T.step(130));
  const bigDagger = await ev(() => {
    const P = window.BLACKSMITH.profile, it = P.itemsOf('weapon').find((w) => w.type === 'dagger');
    return { mix: it?.mix, iron: P.ores.iron, card: document.querySelector('#forged-stats').textContent };
  });
  check('the anvil takes any amount of ore: twelve Iron in a dagger that needs three, 60% stronger for it',
    big.need === '12 ORE \u00b7 NEEDS 3' && !big.disabled && big.preview.includes('Damage 17') && big.preview.includes('+60%') &&
    bigDagger.mix?.[0]?.[1] === 12 && bigDagger.iron === 0 && bigDagger.card.includes('Damage 17'), JSON.stringify({ big, bigDagger }));
  await tapSel('#btn-forged-ok');

  // a slot that already has an ore in it: tap anywhere on it to change the
  // ore; one already in another slot swaps over
  await ev(() => { const P = window.BLACKSMITH.profile; P.addOre('iron', 9); P.addOre('gold', 4); P.addOre('stone', 5); });
  await page.tap('.rchip:nth-child(2)');
  const slotsNow = () => ev(() => window.BLACKSMITH.forge.slots.map((s) => (s.ore ? `${s.ore}:${s.amount}` : '-')).join(' '));
  await pickOre(1, 'Iron');
  await page.tap('#slots .slot:nth-child(1) .sname');
  const reopened = await ev(() => !document.querySelector('#ore-picker').classList.contains('hidden'));
  await page.locator('#op-grid .opt', { hasText: 'Gold' }).first().tap();
  const replaced = await slotsNow();
  await pickOre(2, 'Stone');
  const [one, two] = (await slotsNow()).split(' ');
  await page.tap('#slots .slot:nth-child(1) .sicon');
  await page.locator('#op-grid .opt', { hasText: 'Stone' }).first().tap();
  const swapped = await slotsNow();
  check('tapping a slot that has an ore in it changes the ore, and one from another slot swaps over',
    reopened && replaced === 'gold:4 - -' && two.startsWith('stone:') && swapped === `${two} ${one} -`, JSON.stringify({ reopened, replaced, swapped }));

  // + and - are one a tap, however quick the taps; held, + counts on until the finger lifts
  await ev(() => window.BLACKSMITH.profile.addOre('stone', 20));
  const amount = () => ev(() => window.BLACKSMITH.forge.slots[0].amount);
  const plusSel = '#slots .slot:nth-child(1) .samt button[data-d="1"]', minusSel = '#slots .slot:nth-child(1) .samt button[data-d="-1"]';
  const n0 = await amount();
  for (let i = 0; i < 4; i++) await page.tap(plusSel);
  for (let i = 0; i < 2; i++) await page.tap(minusSel);
  const n1 = await amount();
  await page.waitForTimeout(1200);
  const n2 = await amount();
  check('+ and - count exactly one a tap, and the count stays put after', n1 === n0 + 2 && n2 === n1, JSON.stringify({ n0, n1, n2 }));
  const cdp = await page.context().newCDPSession(page);
  const pb = await page.locator(plusSel).boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pb.x + pb.width / 2, y: pb.y + pb.height / 2 }] });
  await page.waitForTimeout(1100);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const n3 = await amount();
  await page.waitForTimeout(1000);
  const n4 = await amount();
  check('holding + keeps counting, and lifting the finger stops it dead', n3 > n2 + 3 && n4 === n3 && await ev(() => !window.BLACKSMITH.forge.held),
    JSON.stringify({ n2, n3, n4 }));

  await page.tap('#btn-close-forge');
  await ev(() => window.T.step(30));
  await shot('09-wearing');
  check('closing the anvil gives you your camera back', await ev(() => window.BLACKSMITH.game.mode === 'play'));
  const held = await ev(() => {
    const g = window.BLACKSMITH.game, out = {};
    g.player.rig.joints.grip.traverse((o) => { if (o.isMesh && o.material.userData.ore) out[o.material.userData.ore] = (out[o.material.userData.ore] || 0) + 1; });
    let blade = null;
    g.player.rig.joints.grip.traverse((o) => { if (o.userData.part === 'blade') blade = o.material.userData.ore; });
    return { out, blade };
  });
  check('in your hand the blade is iron, the guard gold, the pommel diamond',
    held.blade === 'iron' && held.out.gold >= 1 && held.out.diamond === 1, JSON.stringify(held));

  /* ---------------------------- the pickaxe wall --------------------------- */
  const tapWall = async () => {
    const at = await ev(() => {
      const g = window.BLACKSMITH.game, Wl = g.area.pickWall, p = g.player;
      p.teleport(Wl.center.x + Wl.normal.x * 4.5, Wl.center.z + Wl.normal.z * 4.5, Math.atan2(-Wl.normal.x, -Wl.normal.z));
      g.camRig.snapBehind(p.pos, p.yaw);
      g.camRig.pitch = 0.12;
      window.T.step(25);
      return window.T.onScreen(Wl.center.clone().setY(1.6));
    });
    await page.touchscreen.tap(at.x, at.y);
    await ev(() => window.T.step(40));
  };
  await tapWall();
  const wall = await ev(() => {
    const g = window.BLACKSMITH.game, Wl = g.area.pickWall, s = Wl.slots.stone;
    const tags = [...document.querySelectorAll('#shop-list .scard')].map((e) => e.textContent);
    return {
      mode: g.mode, dist: +g.camera.position.distanceTo(Wl.showPoint('stone')).toFixed(2), showing: Wl.showing,
      off: +s.pick.position.distanceTo(s.home).toFixed(2), tags,
      buy: document.querySelector('.sd-buy .mbtn').textContent, disabled: document.querySelector('.sd-buy .mbtn').disabled,
      swings: document.querySelector('.sd-stats').textContent,
    };
  });
  check('tapping the pickaxe wall by the cave mouth opens it, the camera close on it',
    wall.mode === 'shop' && wall.dist < 3, JSON.stringify(wall));
  check('it opens on the Stone Pickaxe, taken down off its pegs to be looked at',
    wall.showing === 'stone' && wall.off > 0.3 && wall.swings.includes('Boulder 15'), JSON.stringify(wall));
  check('the wall sells the Stone Pickaxe for $1,000, and not to a smith with $0',
    wall.tags.some((t) => t.includes('Stone Pickaxe') && t.includes('$1,000')) && wall.buy === 'BUY $1,000' && wall.disabled, JSON.stringify(wall));
  await page.tap('#shop-list .scard:nth-child(1)');
  const woodLook = await ev(() => { window.T.step(30); const Wl = window.BLACKSMITH.game.area.pickWall; return { showing: Wl.showing, stats: document.querySelector('.sd-stats').textContent }; });
  check('looking at the Wood Pickaxe instead: it cannot break a boulder', woodLook.showing === 'wood' && woodLook.stats.includes('Boulder too hard'),
    JSON.stringify(woodLook));
  await shot('10a-wall');
  await page.tap('#btn-close-shop');
  await ev(() => window.T.step(30));
  check('closing the wall gives you your camera back', await ev(() => window.BLACKSMITH.game.mode === 'play' && !window.BLACKSMITH.game.area.pickWall.showing));

  /* ------------------------------- the bag -------------------------------- */
  await page.tap('#btn-inventory');
  await page.waitForTimeout(200);
  const tabs = await ev(() => [...document.querySelectorAll('#inv-tabs .tab')].map((t) => t.textContent));
  check('the bag has Weapons, Armor, Pickaxes and Ores', tabs.join() === 'WEAPONS,ARMOR,PICKAXES,ORES', tabs.join());
  await page.tap('.tab[data-tab="armor"]');
  await page.tap('#inv-grid .icard');
  await page.locator('#inv-detail .mbtn', { hasText: 'UNEQUIP' }).tap();
  const off = await ev(() => window.BLACKSMITH.profile.equippedItem('helmet'));
  await page.locator('#inv-detail .mbtn', { hasText: 'EQUIP' }).tap();
  const on = await ev(() => !!window.BLACKSMITH.profile.equippedItem('helmet'));
  check('you equip and unequip from the bag', off === null && on);
  await page.tap('.tab[data-tab="ores"]');
  await shot('10-bag');
  await page.tap('#btn-close-inv');

  /* ------------------------------- the cave ------------------------------- */
  await ev(() => { const g = window.BLACKSMITH.game, p = g.player; p.teleport(0, -44, Math.PI); g.camRig.snapBehind(p.pos, p.yaw); window.T.step(10); });
  await shot('11-cave-mouth');
  await ev(() => window.T.step(45, { move: { x: 0, y: 1 } }));
  await page.waitForTimeout(700);
  await ev(() => window.T.step(5));
  const inCave = await ev(() => window.BLACKSMITH.game.area.id);
  check('walking up the path into the cave mouth takes you inside', inCave === 'cave', inCave);
  await ev(() => window.T.step(40));
  await shot('12-cave');

  const cave = await ev(() => {
    const g = window.BLACKSMITH.game;
    const count = (k) => g.rocks.rocks.filter((r) => r.kind === k).length;
    // try to stand in the middle of the room, then out past its wall
    const p = { x: 0.5, z: 0.5 };
    g.area.collider.resolve(p, 0.38);
    const q = { x: 30, z: -5 };
    g.area.collider.resolve(q, 0.38);
    return {
      pebble: count('pebble'), rock: count('rock'), boulder: count('boulder'),
      skeletons: g.skeletons.alive().length,
      daggers: g.skeletons.list.every((s) => s.rig.joints.grip.children.length === 1),
      wall: Math.hypot(p.x, p.z), outer: Math.hypot(q.x, q.z),
    };
  });
  check('the room is a ring round a stone wall', cave.wall > 7 && cave.outer < 21.5, `${cave.wall.toFixed(2)} / ${cave.outer.toFixed(2)}`);
  check('pebbles, rocks and boulders are waiting to be mined', cave.pebble >= 8 && cave.rock >= 5 && cave.boulder >= 3, JSON.stringify(cave));
  check('three skeletons, each with a wooden dagger', cave.skeletons === 3 && cave.daggers);

  // keep the skeletons out of the mining tests
  await ev(() => { window.BLACKSMITH.game._skHooks.playerAlive = () => false; });
  const mine = async (kind) => ev((k) => {
    const g = window.BLACKSMITH.game;
    const rock = g.rocks.rocks.filter((r) => r.kind === k).sort((a, b) => a.hp - b.hp)[0];
    window.T.clearSkeletons(rock.x, rock.z);
    window.T.faceUp(rock.x, rock.z, rock.radius);
    const before = window.T.ores();
    const hits = [];
    let last = rock.hp;
    for (let i = 0; i < 1200 && rock.hp > 0; i++) {
      window.T.step(1, { attack: true });
      if (rock.hp !== last) { hits.push(last - rock.hp); last = rock.hp; }
      if (i > 60 && !hits.length) break;
    }
    window.T.step(70);
    return { hits: hits.length, each: hits[0], broke: rock.hp <= 0, got: window.T.ores() - before, tool: g.player.tool };
  }, kind);
  const pebble = await mine('pebble');
  check('a pebble takes 4 hits of 5 and breaks into 2 ores', pebble.hits === 4 && pebble.each === 5 && pebble.got === 2, JSON.stringify(pebble));
  await shot('13-mined');
  const rock = await mine('rock');
  check('a rock takes 10 hits and breaks into 3 ores', rock.hits === 10 && rock.got === 3, JSON.stringify(rock));
  const boulderWood = await ev(() => {
    const g = window.BLACKSMITH.game;
    const b = g.rocks.rocks.find((r) => r.kind === 'boulder');
    window.T.clearSkeletons(b.x, b.z);
    window.T.faceUp(b.x, b.z, b.radius);
    window.T.step(60, { attack: true });
    return { hp: b.hp, max: b.maxHp, tool: g.player.tool, toast: document.querySelector('#toast').textContent };
  });
  check('a Wood Pickaxe cannot touch a boulder', boulderWood.hp === boulderWood.max && boulderWood.tool === 'pickaxe' &&
    boulderWood.toast.includes('Stone Pickaxe'), JSON.stringify(boulderWood));

  /* --------------------------------- Rob ---------------------------------- */
  await ev(() => { const g = window.BLACKSMITH.game; g._skHooks.playerAlive = () => !g.player.dead; });
  const robTalk = async () => {
    await ev(() => { const g = window.BLACKSMITH.game; window.T.faceUp(g.rob.pos.x, g.rob.pos.z, 0.4, 1.2); window.T.step(5); });
    await page.locator('#btn-interact').tap();
    await ev(() => window.T.step(5));
  };
  await robTalk();
  await shot('14-rob');
  const offer = await ev(() => ({ mode: window.BLACKSMITH.game.mode, text: document.querySelector('#dlg-text').textContent }));
  check('Rob is in the cave and talks to you', offer.mode === 'talk');
  await page.locator('#dlg-choices .mbtn', { hasText: 'KILL 3 SKELETONS' }).tap();
  await page.locator('#dlg-choices .mbtn', { hasText: 'BYE' }).tap();
  check('he asks for three skeletons', await ev(() => window.BLACKSMITH.profile.quest.active));

  // a weapon that ends a skeleton in one blow, to keep the test short
  const killAll = async (n) => ev((count) => {
    const g = window.BLACKSMITH.game, P = window.BLACKSMITH.profile;
    let kills = 0;
    for (let guard = 0; guard < 40 && kills < count; guard++) {
      const s = g.skeletons.alive().find((x) => x.state !== 'rise');
      if (!s) { window.T.step(30); continue; }
      const before = P.stats.kills;
      for (let i = 0; i < 90 && P.stats.kills === before; i++) {
        window.T.faceUp(s.pos.x, s.pos.z, s.radius, 0.3);
        window.T.step(1, { attack: true });
      }
      if (P.stats.kills > before) kills++;
      window.T.step(30);
    }
    return { kills, quest: { ...P.quest } };
  }, n);
  await ev(() => {
    const P = window.BLACKSMITH.profile;
    const big = P.addItem({ kind: 'weapon', type: 'broadsword', mix: [['irisite', 20]] });
    window.BLACKSMITH.game.equip(big.uid);
    window.BLACKSMITH.game.player.hp = 1e6;
  });
  const hunt = await killAll(3);
  check('killing three skeletons fills the bounty', hunt.kills === 3 && hunt.quest.kills === 3, JSON.stringify(hunt));
  await ev(() => window.T.step(400));
  check('the skeletons come back: always three', await ev(() => window.BLACKSMITH.game.skeletons.alive().length === 3));
  await ev(() => { window.BLACKSMITH.game.player.hp = window.BLACKSMITH.profile.maxHp(); });
  await robTalk();
  await page.locator('#dlg-choices .mbtn', { hasText: 'CLAIM' }).tap();
  await ev(() => window.T.step(20));
  const paid = await ev(() => { const P = window.BLACKSMITH.profile; return { cash: P.cash, exp: P.exp, level: P.level, tag: window.BLACKSMITH.game.player.tag.text, quest: { ...P.quest } }; });
  check('Rob pays $1,000 and 100 EXP, and your level goes up over your head',
    paid.cash === 1000 && paid.exp === 100 && paid.level === 2 && paid.tag === 'Lv. 2', JSON.stringify(paid));
  await shot('15-paid');
  await page.locator('#dlg-choices .mbtn', { hasText: 'KILL 3 SKELETONS' }).tap();
  check('the bounty can be taken again', await ev(() => window.BLACKSMITH.profile.quest.active && window.BLACKSMITH.profile.quest.kills === 0));
  const robSells = await ev(() => [...document.querySelectorAll('#dlg-choices .mbtn')].map((b) => b.textContent).join('|'));
  check('Rob does not sell pickaxes', !/PICKAXE/i.test(robSells), robSells);
  await page.locator('#dlg-choices .mbtn', { hasText: 'BYE' }).tap();

  // out to the wall with the money
  await ev(() => { window.BLACKSMITH.game.enter('overworld', { x: 0, z: -42.2, yaw: 0 }, false); window.T.step(5); });
  await tapWall();
  const canBuy = await ev(() => ({ text: document.querySelector('.sd-buy .mbtn').textContent, disabled: document.querySelector('.sd-buy .mbtn').disabled }));
  await page.locator('.sd-buy .mbtn').tap();
  await ev(() => window.T.step(10));
  const bought = await ev(() => {
    const P = window.BLACKSMITH.profile;
    return {
      cash: P.cash, pick: P.pickaxe(), card: document.querySelector('#shop-list .scard:nth-child(2)').textContent,
      button: document.querySelector('.sd-buy .mbtn').textContent,
    };
  });
  check('$1,000 on the wall buys the Stone Pickaxe, and it goes in your hand',
    canBuy.text === 'BUY $1,000' && !canBuy.disabled && bought.cash === 0 && bought.pick.item?.type === 'stone' && bought.pick.tier === 1 &&
    bought.card.includes('IN HAND') && bought.button === 'IN HAND', JSON.stringify({ canBuy, bought }));
  await shot('15a-bought');
  await page.tap('#btn-close-shop');
  await ev(() => { window.T.step(10); window.BLACKSMITH.game.enter('cave', { x: 0, z: 12, yaw: Math.PI }, false); window.T.step(5); });

  await ev(() => { window.BLACKSMITH.game._skHooks.playerAlive = () => false; });
  const boulder = await mine('boulder');
  check('with it a boulder takes 15 hits and breaks into 4 ores', boulder.hits === 15 && boulder.got === 4 && boulder.tool === 'pickaxe', JSON.stringify(boulder));
  await ev(() => { const g = window.BLACKSMITH.game; g._skHooks.playerAlive = () => !g.player.dead; });

  /* ------------------------------ the deep mine ---------------------------- */
  // down the hall in the north wall, on the stick, with the ring's skeletons told to leave you be
  const down = await ev(() => {
    const g = window.BLACKSMITH.game;
    g._skHooks.playerAlive = () => false;
    g.player.teleport(0, -15, Math.PI);
    g.camRig.snapBehind(g.player.pos, g.player.yaw);
    return window.T.walkTo(0, -34, 0.3, 500);
  });
  await page.waitForTimeout(800);
  await ev(() => window.T.step(10));
  const deep = await ev(() => {
    const g = window.BLACKSMITH.game;
    const elites = g.skeletons.alive();
    const dressed = elites.map((s) => {
      const iron = (j) => s.rig.joints[j].children.filter((m) => m.material?.userData?.ore === 'iron').length;
      let blade = null;
      s.rig.joints.grip.traverse((o) => { if (o.userData.part === 'blade') blade = o.material.userData.ore; });
      return { chest: iron('torso'), boots: iron('ankleL') + iron('ankleR'), blade };
    });
    return {
      area: g.area.id, walked: g.player.pos.z > 15,
      boulders: g.rocks.rocks.filter((r) => r.kind === 'boulder').length,
      caveBoulders: g.fields.cave.rocks.filter((r) => r.kind === 'boulder').length,
      elites: elites.length, elite: g.skeletons.elite, dressed,
      blow: g.skeletons.damageFrom(30), hitsYou: g.packs.deep.kind.damage, daggers: g.packs.cave.kind.damage,
    };
  });
  await shot('16a-deep');
  check('a hall in the cave\'s north wall leads down to the deep mine', down.ok === 'travel' && deep.area === 'deep' && deep.walked,
    JSON.stringify({ down, area: deep.area }));
  check('the deep mine has more boulders: twelve to the cave\'s five', deep.boulders === DEEP_ROCK_COUNTS.boulder && DEEP_ROCK_COUNTS.boulder === 12 &&
    ROCK_COUNTS.boulder === 5 && deep.caveBoulders <= 5, JSON.stringify({ deep: deep.boulders, cave: deep.caveBoulders }));
  check('three elite skeletons, each in an Iron Chestplate and Iron Boots with an Iron Straight-Sword',
    deep.elites === 3 && deep.elite && deep.dressed.every((d) => d.chest >= 9 && d.boots === 6 && d.blade === 'iron'), JSON.stringify(deep.dressed));
  check('their iron takes a share of every blow, and their swords hit harder than daggers',
    deep.blow < 30 && deep.blow >= 20 && deep.hitsYou > deep.daggers, JSON.stringify({ blow: deep.blow, hitsYou: deep.hitsYou, daggers: deep.daggers }));

  // Jack: no work for a smith under level 5
  const jackTalk = async () => {
    await ev(() => { const g = window.BLACKSMITH.game; window.T.faceUp(g.jack.pos.x, g.jack.pos.z, 0.4, 1.2); window.T.step(5); });
    await page.locator('#btn-interact').tap();
    await ev(() => window.T.step(5));
    await page.waitForTimeout(150);
    return ev(() => ({
      mode: window.BLACKSMITH.game.mode, level: window.BLACKSMITH.profile.level,
      choices: [...document.querySelectorAll('#dlg-choices .mbtn')].map((b) => b.textContent),
      mark: window.BLACKSMITH.game.questState('jack'),
    }));
  };
  const early = await jackTalk();
  check('Jack, in the deep mine, has no work for a smith under level 5', early.mode === 'talk' && early.level < 5 &&
    early.mark === 'locked:5' && early.choices.join('|') === 'BYE', JSON.stringify(early));
  await page.locator('#dlg-choices .mbtn', { hasText: 'BYE' }).tap();
  await ev(() => { const P = window.BLACKSMITH.profile; P.addExp(1000 - P.exp); window.BLACKSMITH.game.player.refreshGear(); window.T.step(5); });
  const ready = await jackTalk();
  check('at level 5 he offers his bounty: five elites', ready.level === 5 && ready.choices.includes('KILL 5 ELITES'), JSON.stringify(ready));
  await page.locator('#dlg-choices .mbtn', { hasText: 'KILL 5 ELITES' }).tap();
  await page.locator('#dlg-choices .mbtn', { hasText: 'BYE' }).tap();
  await ev(() => { const g = window.BLACKSMITH.game; g._skHooks.playerAlive = () => !g.player.dead; g.player.hp = 1e6; });
  const hunt5 = await killAll(5);
  const counted = await ev(() => ({ ...window.BLACKSMITH.profile.quests.jack, elites: window.BLACKSMITH.profile.stats.elites, rob: { ...window.BLACKSMITH.profile.quests.rob } }));
  // a broadsword can cut down two at once, so it may take a few more than five
  check('killing five elites fills Jack\'s bounty (and they count as skeletons for Rob\'s)', hunt5.kills === 5 && counted.kills === 5 && counted.elites >= 5 && counted.rob.kills === 3,
    JSON.stringify(counted));
  await ev(() => { window.BLACKSMITH.game.player.hp = window.BLACKSMITH.profile.maxHp(); window.T.step(60); });
  const money0 = await ev(() => ({ cash: window.BLACKSMITH.profile.cash, exp: window.BLACKSMITH.profile.exp }));
  await jackTalk();
  await page.locator('#dlg-choices .mbtn', { hasText: 'CLAIM' }).tap();
  await ev(() => window.T.step(20));
  const jackPaid = await ev(() => { const P = window.BLACKSMITH.profile; return { cash: P.cash, exp: P.exp, level: P.level, q: { ...P.quests.jack } }; });
  check('Jack pays $5,000 and 1,000 EXP, as often as you like',
    jackPaid.cash - money0.cash === 5000 && jackPaid.exp - money0.exp === 1000 && jackPaid.q.completed === 1 && !jackPaid.q.active &&
    (await ev(() => [...document.querySelectorAll('#dlg-choices .mbtn')].some((b) => b.textContent === 'KILL 5 ELITES'))), JSON.stringify({ money0, jackPaid }));
  await shot('16b-jack');
  await page.locator('#dlg-choices .mbtn', { hasText: 'BYE' }).tap();
  // and back up the steps
  const up = await ev(() => {
    const g = window.BLACKSMITH.game;
    g._skHooks.playerAlive = () => false;
    g.player.teleport(0, 20, 0);
    return window.T.walkTo(0, 29, 0.3, 300);
  });
  await page.waitForTimeout(800);
  await ev(() => window.T.step(10));
  const upTo = await ev(() => ({ area: window.BLACKSMITH.game.area.id, z: window.BLACKSMITH.game.player.pos.z }));
  check('the steps at its south end lead back up into the cave\'s hall', up.ok === 'travel' && upTo.area === 'cave' && upTo.z < -21, JSON.stringify(upTo));
  await ev(() => { const g = window.BLACKSMITH.game; g._skHooks.playerAlive = () => !g.player.dead; g.enter('cave', { x: 0, z: 12, yaw: Math.PI }, false); window.T.step(5); });

  /* -------------------------- dying costs nothing ------------------------- */
  const before = await ev(() => JSON.stringify({ c: window.BLACKSMITH.profile.cash, o: window.BLACKSMITH.profile.ores, i: window.BLACKSMITH.profile.items.length }));
  await ev(() => {
    const g = window.BLACKSMITH.game;
    g.player.hp = 3;
    const s = g.skeletons.alive()[0];
    g._hurtPlayer(50, s.pos);
    window.T.step(30);
  });
  await page.waitForTimeout(1400);
  await shot('16-dead');
  const deadState = await ev(() => ({ mode: window.BLACKSMITH.game.mode, overlay: !document.querySelector('#death-overlay').classList.contains('hidden') }));
  check('skeletons can kill you', deadState.mode === 'dead' && deadState.overlay, JSON.stringify(deadState));
  await page.tap('#btn-respawn');
  await page.waitForTimeout(900);
  await ev(() => window.T.step(10));
  const after = await ev(() => JSON.stringify({ c: window.BLACKSMITH.profile.cash, o: window.BLACKSMITH.profile.ores, i: window.BLACKSMITH.profile.items.length }));
  const back = await ev(() => { const g = window.BLACKSMITH.game; return { area: g.area.id, d: Math.hypot(g.player.pos.x, g.player.pos.z), hp: g.player.hp }; });
  check('you come back on the stone circle with every ore, item and dollar', before === after && back.area === 'overworld' && back.d < 5 && back.hp > 50,
    JSON.stringify(back));

  /* --------------------------------- saving -------------------------------- */
  const saved = await ev(() => { window.BLACKSMITH.game.save(); const P = window.BLACKSMITH.profile; return JSON.stringify({ c: P.cash, e: P.exp, o: P.ores, i: P.items.map((x) => x.uid), q: P.quest.active, eq: P.equipped }); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#menu-screen.active', { timeout: 60000 });
  const hasContinue = await ev(() => !document.querySelector('#btn-continue').classList.contains('hidden'));
  await page.tap('#btn-continue');
  await page.waitForFunction(() => window.BLACKSMITH?.state === 'playing', null, { timeout: 180000 });
  await installHelpers();
  const loaded = await ev(() => { const P = window.BLACKSMITH.profile; return JSON.stringify({ c: P.cash, e: P.exp, o: P.ores, i: P.items.map((x) => x.uid), q: P.quest.active, eq: P.equipped }); });
  check('a reload picks up exactly where you saved', hasContinue && saved === loaded);
  await shot('17-continued');

  /* --------------------- a whole loop, by the real controls ----------------- */
  // NEW GAME has to ask before it erases the smith that is saved
  await ev(() => { window.BLACKSMITH.state = 'playing'; });
  await page.tap('#btn-pause');
  await page.tap('#btn-quit');
  await page.waitForSelector('#menu-screen.active');
  await page.tap('#btn-newgame');
  const asked = await ev(() => !document.querySelector('#confirm-new').classList.contains('hidden'));
  await page.tap('#btn-confirm-new');
  await page.waitForFunction(() => window.BLACKSMITH?.state === 'playing', null, { timeout: 180000 });
  await installHelpers();
  const fresh = await ev(() => { const P = window.BLACKSMITH.profile; return { cash: P.cash, items: P.items.length, ores: window.T.ores(), exp: P.exp }; });
  check('NEW GAME asks first, then starts a fresh smith', asked && fresh.cash === 0 && fresh.items === 1 && fresh.ores === 0 && fresh.exp === 0,
    JSON.stringify(fresh));

  // up the path on the stick and into the cave
  await ev(() => window.T.walkTo(0, -40));
  await ev(() => window.T.walkTo(0, -49, 0.3, 240));
  await page.waitForTimeout(800);
  await ev(() => window.T.step(5));
  const loop1 = await ev(() => {
    const g = window.BLACKSMITH.game;
    if (g.area.id !== 'cave') return { area: g.area.id };
    g._skHooks.playerAlive = () => false;
    const mined = [];
    for (let k = 0; k < 4 && window.T.ores() < 3; k++) {
      const p = g.player.pos;
      const rock = g.rocks.rocks.filter((r) => r.kind !== 'boulder')
        .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      window.T.clearSkeletons(rock.x, rock.z);
      window.T.walkTo(rock.x, rock.z, rock.radius + 0.9, 1500);
      for (let n = 0; rock.hp > 0 && n < 900; n++) window.T.frame(true);
      window.T.step(70);
      mined.push(rock.kind);
    }
    g._skHooks.playerAlive = () => !g.player.dead;
    const out = window.T.walkTo(0, 21.5, 0.8, 1500);
    window.T.walkTo(0, 34, 0.3, 600);
    return { area: 'cave', mined, ores: window.T.ores(), out };
  });
  await page.waitForTimeout(800);
  await ev(() => window.T.step(5));
  const home = await ev(() => {
    const g = window.BLACKSMITH.game;
    const back = g.area.id;
    window.T.walkTo(0, -6, 0.8);
    const anvil = window.T.walkTo(-23.0, -4.4, 0.4);
    return { back, anvil, button: document.querySelector('#btn-interact').textContent };
  });
  check('walking in, mining with ATTACK held and walking back out all work on the stick',
    loop1.area === 'cave' && loop1.ores >= 3 && home.back === 'overworld', JSON.stringify({ loop1, back: home.back }));
  check('walking up to the anvil offers it', home.anvil.ok === true && home.button === 'ANVIL', JSON.stringify(home));
  await page.tap('#btn-interact');
  await ev(() => window.T.step(20));
  await page.tap('.rchip:nth-child(1)');
  const owned = await ev(() => Object.entries(window.BLACKSMITH.profile.ores).filter(([, v]) => v > 0).map(([k]) => k));
  const NAMES = { stone: 'Stone', bronze: 'Bronze', iron: 'Iron', bones: 'Bones', gold: 'Gold', amethyst: 'Amethyst', emerald: 'Emerald', diamond: 'Diamond', irisite: 'Irisite' };
  for (let i = 0; i < Math.min(3, owned.length); i++) {
    await page.tap(`#slots .slot:nth-child(${i + 1}) .sicon`);
    await page.locator('#op-grid .opt', { hasText: NAMES[owned[i]] }).first().tap();
  }
  await tapSel('#btn-forge');
  await ev(() => window.T.step(130));
  await tapSel('#btn-forged-equip');
  await page.tap('#btn-close-forge');
  await ev(() => window.T.step(20));
  const dagger = await ev(() => window.BLACKSMITH.profile.weapon());
  check('the first ore makes a dagger', dagger?.item?.type === 'dagger', JSON.stringify(dagger));
  await ev(() => { window.T.walkTo(0, -6, 0.8); window.T.walkTo(0, -40, 0.8); window.T.walkTo(0, -49, 0.3, 240); });
  await page.waitForTimeout(800);
  const fight = await ev(() => {
    const g = window.BLACKSMITH.game, P = window.BLACKSMITH.profile;
    window.T.step(5);
    window.T.walkTo(0, 18, 0.8, 900);
    const before = P.stats.kills;
    let frames = 0;
    while (P.stats.kills === before && frames < 3000 && !g.player.dead) {
      const s = g.skeletons.nearest(g.player.pos, 99);
      const p = g.player.pos;
      if (s && Math.hypot(s.pos.x - p.x, s.pos.z - p.z) > 1.6) {
        g.camRig.yaw = Math.atan2(s.pos.x - p.x, s.pos.z - p.z) + Math.PI;
        window.T.frame(false, { x: 0, y: 1 });
      } else {
        window.T.frame(!!s);
      }
      frames++;
    }
    return { killed: P.stats.kills > before, seconds: +(frames / 30).toFixed(1), hp: Math.round(g.player.hp) };
  });
  check('and with it you can go back down and kill a skeleton', fight.killed, JSON.stringify(fight));
  await shot('18-first-kill');

  if (FILE) check('the single file fetches nothing from the network', external.length === 0, external.slice(0, 3).join(' '));
} catch (e) {
  check('the run finished', false, e.message);
  await shot('xx-failed').catch(() => {});
}

const errors = logs.filter((l) => !l.includes('GPU stall') && !l.includes('Automatic fallback to software WebGL'));
check('no errors in the console', errors.length === 0, errors.slice(0, 5).join('\n'));
await h.close();

/* ---------------------- a phone with little height to spare ---------------------- */
// a phone on its side with the game opened inside another app: 585 x 260
{
  const s = await launch({ url, width: 585, height: 260 });
  try {
    await s.page.waitForSelector('#menu-screen.active', { timeout: 60000 });
    await s.page.tap('#btn-newgame');
    await s.page.waitForFunction(() => window.BLACKSMITH?.state === 'playing', null, { timeout: 180000 });
    await s.ev(() => {
      const A = window.BLACKSMITH, g = A.game, P = A.profile;
      A.state = 'test';
      P.addOre('iron', 30); P.addOre('gold', 6); P.addOre('diamond', 2);
      g.player.teleport(-23.2, -4.4, -Math.PI / 2);
      g.openForge();
      A.forge.type = 'sword';
      A.forge.slots = [{ ore: 'iron', amount: 24 }, { ore: 'gold', amount: 6 }, { ore: 'diamond', amount: 2 }];
      A.forge.render();
    });
    await s.page.waitForTimeout(400);
    const forge = await s.ev(() => {
      const r = (e) => e.getBoundingClientRect();
      const card = r(document.querySelector('#forge-card')), body = r(document.querySelector('.forge-body')), foot = r(document.querySelector('.forge-foot'));
      const slots = [...document.querySelectorAll('#slots .slot')].map(r);
      const btns = [...document.querySelectorAll('#slots .samt button')].map(r);
      const picks = [...document.querySelectorAll('#slots .spick')].map((e) => [Math.round(r(e).width), Math.round(r(e).height)]);
      const forgeBtn = r(document.querySelector('#btn-forge'));
      return {
        separate: body.bottom <= foot.top + 0.5,
        slotsShown: slots.every((b) => b.left >= card.left && b.right <= card.right && b.top >= body.top - 0.5 && b.bottom <= body.bottom + 0.5),
        buttonsInSlots: btns.every((b, k) => b.left >= slots[k >> 1].left && b.right <= slots[k >> 1].right && b.bottom <= slots[k >> 1].bottom),
        picks, forge: forgeBtn.bottom <= innerHeight && forgeBtn.right <= innerWidth && forgeBtn.height >= 30,
      };
    });
    check('on a 585 x 260 screen the anvil\'s three slots, their buttons and FORGE are all on screen, none on top of another',
      forge.separate && forge.slotsShown && forge.buttonsInSlots && forge.forge && forge.picks.every(([w, hgt]) => w >= 100 && hgt >= 28), JSON.stringify(forge));
    await s.page.screenshot({ path: path.join(SHOTS, '19-anvil-585x260.png') });
    // a phone with its text size turned up: everything on the card still stands clear of
    // everything else, wherever it can be seen (a scrolled-away part of the list cannot)
    const bigText = await s.ev(() => {
      const root = document.documentElement;
      root.style.fontSize = document.body.style.fontSize = '20.8px';
      window.BLACKSMITH.forge.render();
      const card = document.querySelector('#forge-card');
      const clip = (e, r) => {
        for (const sc of [e.closest('.recipes'), e.closest('.forge-body')]) {
          if (!sc) continue;
          const c = sc.getBoundingClientRect();
          r = { left: Math.max(r.left, c.left), right: Math.min(r.right, c.right), top: Math.max(r.top, c.top), bottom: Math.min(r.bottom, c.bottom) };
        }
        return r;
      };
      const els = [...card.querySelectorAll('.forge-head h3, .forge-need, #btn-close-forge, .rchip, .sicon, .sname, .spart, .sall:not(.off), .samt button, .samt b, .picon, .ptext, #btn-forge')]
        .filter((e) => e.getClientRects().length).map((e) => ({ e, r: clip(e, e.getBoundingClientRect()) }))
        .filter(({ r }) => r.right - r.left > 1 && r.bottom - r.top > 1);
      const hits = [];
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        const a = els[i], b = els[j];
        if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
        if (Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left) > 1 && Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top) > 1) {
          hits.push(`${a.e.className || a.e.id} / ${b.e.className || b.e.id}`);
        }
      }
      const spills = [...card.querySelectorAll('.sname, .spart, .samt b, .pname, .pline, #btn-forge')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis').length;
      root.style.fontSize = document.body.style.fontSize = '';
      window.BLACKSMITH.forge.render();
      return { hits, spills };
    });
    check('and with the phone\'s text 130% bigger, nothing on the anvil\'s card sits on top of anything else',
      bigText.hits.length === 0 && bigText.spills === 0, JSON.stringify(bigText));
    const shop = await s.ev(() => {
      const A = window.BLACKSMITH, g = A.game;
      g.closeForge();
      A.profile.cash = 1500;
      const Wl = g.area.pickWall;
      g.player.teleport(Wl.center.x + Wl.normal.x * 2.5, Wl.center.z + Wl.normal.z * 2.5, 0);
      g.openShop();
      A.shop.select('stone');
      const b = document.querySelector('.sd-buy .mbtn').getBoundingClientRect();
      return { mode: g.mode, text: document.querySelector('.sd-buy .mbtn').textContent, onScreen: b.top >= 0 && b.bottom <= innerHeight && b.right <= innerWidth };
    });
    await s.page.waitForTimeout(400);
    await s.page.screenshot({ path: path.join(SHOTS, '20-wall-585x260.png') });
    check('and on the pickaxe wall the BUY button is on screen', shop.mode === 'shop' && shop.text === 'BUY $1,000' && shop.onScreen, JSON.stringify(shop));
  } catch (e) {
    check('the small-screen run finished', false, e.message);
  }
  const small = s.logs.filter((l) => !l.includes('GPU stall') && !l.includes('Automatic fallback to software WebGL'));
  check('no errors in the console on the small screen', small.length === 0, small.slice(0, 5).join('\n'));
  await s.close();
}

/* ------------------------------ accounts ------------------------------------ */
// on the game's Claude page there is a database; here a stand-in plays its part
{
  const runs = [];
  const quiet = (logs) => logs.filter((l) => !l.includes('GPU stall') && !l.includes('Automatic fallback to software WebGL'));
  const text = (pg, sel) => pg.evaluate((q) => document.querySelector(q)?.textContent || '', sel);
  const toMenu = async (pg) => { await pg.evaluate(() => document.querySelector('#btn-quit').click()); await pg.waitForSelector('#menu-screen.active'); };
  const play = async (pg, sel) => {
    await pg.tap(sel);
    await pg.waitForFunction(() => window.BLACKSMITH?.state === 'playing', null, { timeout: 180000 });
    await pg.evaluate(() => { window.BLACKSMITH.state = 'test'; });
  };
  try {
    // the downloaded file: no cloud, and it says so
    const off = await launch({ url, width: 585, height: 260 });
    runs.push(off);
    await off.page.waitForSelector('#menu-screen.active', { timeout: 60000 });
    await off.page.waitForTimeout(300);
    await off.page.tap('#btn-account');
    const offline = { chip: await text(off.page, '#ma-label'), why: await text(off.page, '#acct-off-why') };
    check('opened without its Claude page, the game says its smith is saved on the device only',
      offline.chip === 'SAVED HERE' && offline.why.includes('on this device only'), JSON.stringify(offline));

    // one phone: a smith played as a guest, then an account made for it
    const a = await launch({ url, width: 585, height: 260, init: mockScript() });
    runs.push(a);
    const pa = a.page;
    await pa.waitForSelector('#menu-screen.active', { timeout: 60000 });
    await pa.waitForFunction(() => document.querySelector('#ma-label').textContent === 'LOG IN', null, { timeout: 15000 });
    await play(pa, '#btn-newgame');
    await pa.evaluate(() => { const A = window.BLACKSMITH; A.profile.addCash(250); A.profile.addOre('iron', 7); A.game.save(); });
    await toMenu(pa);
    await pa.tap('#btn-account');
    await pa.tap('#tab-signup');
    await pa.fill('#acct-name', 'Crys');
    await pa.fill('#acct-pass', 'forge123');
    await pa.fill('#acct-pass2', 'forge123');
    await pa.waitForTimeout(350);
    const fits = await pa.evaluate(() => {
      const b = document.querySelector('#acct-submit').getBoundingClientRect();
      return b.top >= 0 && b.bottom <= innerHeight && b.right <= innerWidth;
    });
    await pa.screenshot({ path: path.join(SHOTS, '21-sign-up-585x260.png') });
    await pa.tap('#acct-submit');
    await pa.waitForFunction(() => window.BLACKSMITH.cloud.account?.name === 'Crys', null, { timeout: 20000 });
    const store1 = await pa.evaluate(() => window.__mockStore());
    const doc = store1['data/users/u_test/smith-crys'];
    check('SIGN UP makes an account, and the smith already on the phone comes with it', fits && doc?.name === 'Crys' && doc?.save?.cash === 250 &&
      (await text(pa, '#ma-label')) === 'Crys', JSON.stringify({ fits, save: doc?.save?.cash }));
    check('the password is never stored, only a salted hash of it', !!doc?.hash && !!doc?.salt && !JSON.stringify(store1).includes('forge123'));
    await pa.waitForTimeout(800);
    await play(pa, '#btn-continue');
    await pa.evaluate(() => { const A = window.BLACKSMITH; A.profile.addCash(1000); A.game.save(); return A.cloud.flush(); });
    const sent = await pa.evaluate(() => window.__mockStore()['data/users/u_test/smith-crys'].save.cash);
    check('playing on the account sends your progress to the cloud', sent === 1250, String(sent));
    await toMenu(pa);
    await pa.reload({ waitUntil: 'load' });
    await pa.waitForSelector('#menu-screen.active', { timeout: 60000 });
    await pa.waitForTimeout(400);
    const again = { chip: await text(pa, '#ma-label'), save: await text(pa, '#menu-save') };
    check('coming back later, you are still logged in', again.chip === 'Crys' && again.save.includes('$1,250'), JSON.stringify(again));
    await pa.tap('#btn-account');
    await pa.tap('#btn-logout');
    await pa.waitForFunction(() => !window.BLACKSMITH.cloud.account, null, { timeout: 15000 });
    await pa.tap('#btn-account');
    await pa.fill('#acct-name', 'crys');
    await pa.fill('#acct-pass', 'wrong');
    await pa.tap('#acct-submit');
    await pa.waitForFunction(() => document.querySelector('#acct-msg').textContent.length > 0 && !document.querySelector('#acct-submit').disabled, null, { timeout: 20000 });
    const refused = { msg: await text(pa, '#acct-msg'), account: await pa.evaluate(() => window.BLACKSMITH.cloud.account) };
    check('LOG OUT leaves the phone, and a wrong password is turned away', refused.account === null && refused.msg.includes('not right'), JSON.stringify(refused));
    const seed = await pa.evaluate(() => window.__mockStore());

    // another phone, signed in to the same Claude account
    const b = await launch({ url, width: 844, height: 390, init: mockScript(seed) });
    runs.push(b);
    const pb = b.page;
    await pb.waitForSelector('#menu-screen.active', { timeout: 60000 });
    await pb.waitForFunction(() => document.querySelector('#ma-label').textContent === 'LOG IN', null, { timeout: 15000 });
    await pb.tap('#btn-account');
    await pb.tap('#tab-signup');
    await pb.fill('#acct-name', 'CRYS');
    await pb.fill('#acct-pass', 'other1');
    await pb.fill('#acct-pass2', 'other1');
    await pb.tap('#acct-submit');
    await pb.waitForFunction(() => document.querySelector('#acct-msg').textContent.includes('already'), null, { timeout: 20000 });
    check('a name you already have is not given out twice', (await text(pb, '#acct-msg')).includes('already have a smith called Crys'));
    await pb.tap('#tab-login');
    await pb.fill('#acct-name', 'Crys');
    await pb.fill('#acct-pass', 'forge123');
    await pb.tap('#acct-submit');
    await pb.waitForFunction(() => window.BLACKSMITH.cloud.account?.name === 'Crys', null, { timeout: 20000 });
    await pb.waitForTimeout(800);
    await play(pb, '#btn-continue');
    const there = await pb.evaluate(() => ({ cash: window.BLACKSMITH.profile.cash, iron: window.BLACKSMITH.profile.ores.iron }));
    check('LOG IN on another phone, and it is the same smith', there.cash === 1250 && there.iron === 7, JSON.stringify(there));

    // a third phone, last logged in as Crys, where the cloud takes 9 s to answer
    const slow = { content: mockScript(seed).content + "\nlocalStorage.setItem('blacksmith.account', 'Crys'); window.__mockDelay = 9000;" };
    const c = await launch({ url, width: 585, height: 260, init: slow });
    runs.push(c);
    const pc = c.page;
    await pc.waitForSelector('#menu-screen.active', { timeout: 60000 });
    await pc.tap('#btn-settings');
    await pc.waitForFunction(() => window.BLACKSMITH.cloud.account?.name === 'Crys', null, { timeout: 20000 });
    const late = { chip: await text(pc, '#ma-label'), save: await text(pc, '#menu-save'),
      stayed: await pc.evaluate(() => !document.querySelector('#panel-settings').classList.contains('hidden')) };
    check('when the cloud is slow, the menu still comes back to your account once it answers', late.chip === 'Crys' &&
      late.save.includes('$1,250') && late.stayed, JSON.stringify(late));
    // and when PLAY is pressed before it answers, the smith being played is left alone
    await pc.reload({ waitUntil: 'load' });
    await pc.waitForSelector('#menu-screen.active', { timeout: 60000 });
    await play(pc, '#btn-newgame');
    await pc.evaluate(() => { const A = window.BLACKSMITH; A.profile.addCash(5); A.game.save(); });
    await pc.waitForTimeout(9000);
    const kept = await pc.evaluate(() => ({
      account: window.BLACKSMITH.cloud.account?.name || null,
      guest: JSON.parse(localStorage.getItem('blacksmith.save.v1') || 'null')?.cash ?? null,
      cloud: window.__mockStore()['data/users/u_test/smith-crys'].save.cash,
    }));
    check('and if you start playing before it answers, it does not swap smiths under you', kept.account === null &&
      kept.guest === 5 && kept.cloud === 1250, JSON.stringify(kept));
    const errs = runs.flatMap((r) => quiet(r.logs));
    check('no errors in the console with accounts', errs.length === 0, errs.slice(0, 5).join('\n'));
  } catch (e) {
    check('the accounts run finished', false, e.message);
  }
  for (const r of runs) await r.close();
}

console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
process.exit(fails.length ? 1 : 0);
