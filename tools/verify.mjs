/* =============================================================================
   Functional smoke test. Drives the real game in a browser and asserts that
   the systems this project is actually about still work.

     node tools/verify.mjs
   ========================================================================== */
import { boot } from './harness.mjs';
const h = await boot({ width: 960, height: 500, touch: true });
const { page, shot, ev, logs, close } = h;
const fail = [];

// Everything below waits on simulation state, never on the wall clock: under
// software rendering a fixed sleep can end before the world has caught up.
await page.evaluate(() => {
  window.settle = async (test, maxFrames = 600) => {
    for (let i = 0; i < maxFrames; i++) {
      if (test()) return true;
      await new Promise((r) => requestAnimationFrame(r));
    }
    return false;
  };
  window.frames = async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); };
});
const check = (name, ok, extra='') => { console.log((ok?'PASS':'FAIL')+'  '+name+(extra?'  '+extra:'')); if(!ok) fail.push(name); };

// ---------- jump ----------
let r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;   // clear of the platform in the middle
  g.player.teleport(OX, 6, 0);
  await window.settle(() => g.player.grounded);
  const y0 = g.player.pos.y;
  g.player.wantJump = true;
  let peak = y0;
  for (let i=0;i<50;i++){ await new Promise(r=>requestAnimationFrame(r)); peak = Math.max(peak, g.player.pos.y); }
  return { rise: +(peak - y0).toFixed(2), grounded: g.player.grounded };
});
check('jump lifts the player', r.rise > 0.8, JSON.stringify(r));

// ---------- crouch ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;   // clear of the platform in the middle
  const eye = new (g.camera.position.constructor)();
  g.player.eyePosition(eye); const before = eye.y;
  g.player.crouchWant = true;
  await window.settle(() => g.player.crouch > 0.97, 240);
  g.player.eyePosition(eye); const after = eye.y;
  g.player.crouchWant = false;
  return { before:+before.toFixed(2), after:+after.toFixed(2) };
});
check('crouch lowers the eyes', r.before - r.after > 0.20, JSON.stringify(r));

// ---------- pathfinding around a wall of crates ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;   // clear of the platform in the middle
  g.clearSpawns();
  g.player.teleport(OX + 10, 16, 0);          // out of the way of the test subject
  const V = g.player.pos.constructor;
  const { spawnCrate } = await import('/src/game/objects.js');
  for (let i = -3; i <= 3; i++) {
    spawnCrate(g, new V(OX + i * 0.72, 0.4, 0), { size: 0.72 });
    spawnCrate(g, new V(OX + i * 0.72, 1.1, 0), { size: 0.72 });
  }
  g.nav.rebuild(g.world, { groundY: 0 });
  const { spawnCitizen } = await import('/src/game/citizen.js');
  const c = spawnCitizen(g, new V(OX, 0, 5));
  c.ai._setState('wander'); c.ai.hasGoal = true; c.ai.goal.set(OX, 0, -5); c.ai.repathTimer = 0;
  const start = c.pos.z;
  let best = start;
  for (let i=0;i<420;i++){ await new Promise(r=>requestAnimationFrame(r)); best = Math.min(best, c.pos.z); }
  return { start:+start.toFixed(1), end:+best.toFixed(1), x:+(c.pos.x - OX).toFixed(1), pathLen: c.ai.path.length, state:c.ai.state };
});
check('citizen paths around a crate wall', r.end < 1.0, JSON.stringify(r));

// ---------- RCV2 grab and carry ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;   // clear of the platform in the middle
  g.clearSpawns();
  g.player.teleport(OX, 4, 0); g.camYaw = 0; g.camPitch = 0;
  g.setEquipped('rcv2'); g.setSelected('crate');
  await window.frames(3);
  g.spawnSelected();
  const b = g.spawnedBodies[0];
  // wait for the crate to actually be on the floor before aiming at it
  await window.settle(() => b.sleeping || (Math.abs(b.vel.y) < 0.05 && b.pos.y < 0.5));
  g.camPitch = -0.48;          // look down at the crate on the ground
  await window.frames(3);
  g.primaryAction();
  const held = g.rcv2.holding;
  const y0 = b.pos.y;
  g.camPitch = 0.6;
  await window.settle(() => b.pos.y - y0 > 0.9, 300);
  const y1 = b.pos.y;
  const out = { held, lifted: +(y1-y0).toFixed(2) };
  g.primaryAction();      // release
  out.released = !g.rcv2.holding;
  return out;
});
check('RCV2 grabs and lifts a crate', r.held && r.lifted > 0.5 && r.released, JSON.stringify(r));

// ---------- RCV2 on a citizen ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;   // clear of the platform in the middle
  g.clearSpawns();
  g.player.teleport(OX, 4, 0); g.camYaw = 0; g.camPitch = 0;
  g.setSelected('citizen'); g.spawnSelected();
  const c = g.characters.find(x=>x!==g.player);
  await window.settle(() => c.grounded && c.state === 'controlled');
  await window.frames(3);
  g.camPitch = -0.05;
  await window.frames(2);
  g.primaryAction();
  const held = g.rcv2.holding;
  const y0 = c.particles.mt.y;
  g.camPitch = 0.7;
  await window.settle(() => c.particles.mt.y - y0 > 0.5, 300);
  const out = { held, state: c.state, lifted: +(c.particles.mt.y - y0).toFixed(2) };
  g.primaryAction();
  return out;
});
check('RCV2 picks up a citizen', r.held && r.state === 'ragdoll' && r.lifted > 0.4, JSON.stringify(r));

// ---------- delete ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;   // clear of the platform in the middle
  g.clearSpawns();
  g.setSelected('boulder'); g.player.teleport(OX, 4, 0); g.camYaw = 0; g.camPitch = 0;
  await window.frames(2);
  g.spawnSelected();
  const b = g.spawnedBodies[0];
  await window.settle(() => b.sleeping || (Math.abs(b.vel.y) < 0.05 && b.pos.y < 0.8));
  const n0 = g.spawnedBodies.length;
  g.camPitch = -0.35;
  await window.frames(3);
  g.deleteAction();
  return { n0, n1: g.spawnedBodies.length };
});
check('delete removes the target', r.n1 === r.n0 - 1, JSON.stringify(r));

// ---------- player death and respawn ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;   // clear of the platform in the middle
  g.clearSpawns();
  g.player.applyDamage(999, { boneName: 'head', point: g.player.pos.clone(), type: 'impact', severity: 1 });
  await window.settle(() => g.player.dead && g.player.state === 'dead');
  const dead = g.player.dead && g.player.state === 'dead';
  const overlay = !document.querySelector('#death-overlay').classList.contains('hidden');
  g.respawnPlayer();
  await window.settle(() => g.player.state === 'controlled' && g.player.health === 100);
  return { dead, overlay, hp: Math.round(g.player.health), state: g.player.state };
});
check('player dies and respawns', r.dead && r.overlay && r.hp === 100 && r.state === 'controlled', JSON.stringify(r));

// ---------- people are solid ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;   // clear of the platform in the middle
  g.clearSpawns();
  const V = g.player.pos.constructor;
  const { spawnCitizen } = await import('/src/game/citizen.js');
  const c = spawnCitizen(g, new V(OX, 0, 0));
  await window.settle(() => c.grounded);
  g.setEquipped('fists');
  c.ai.update = () => { c.moveInput.set(0, 0, 0); };
  c.health = 100; c.balance = 1; c.setState('controlled');
  c.teleport(OX, 0, Math.PI);
  g.player.teleport(OX, 3, 0); g.camYaw = 0; g.camPitch = 0;
  // stand in for a player leaning on the stick, walking straight into them
  const orig = g._readInput.bind(g);
  g._readInput = (dt, input) => { orig(dt, input); g.player.moveInput.set(0, 0, -1); g.player.wantRun = false; };
  for (let i = 0; i < 200; i++) await new Promise(r => requestAnimationFrame(r));
  g._readInput = orig;
  return {
    standoff: +Math.hypot(g.player.pos.x - c.pos.x, g.player.pos.z - c.pos.z).toFixed(2),
    citizenState: c.state,
  };
});
check('you cannot walk through people', r.standoff > 0.4 && r.standoff < 0.75, JSON.stringify(r));

// ---------- a citizen can actually be killed ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;   // clear of the platform in the middle
  // Its own subject, so this check does not inherit whatever the last one did.
  g.clearSpawns();
  const V = g.player.pos.constructor;
  const { spawnCitizen } = await import('/src/game/citizen.js');
  const c = spawnCitizen(g, new V(OX, 0, 0));
  await window.settle(() => c.grounded);
  g.setEquipped('fists');
  c.ai.update = () => { c.moveInput.set(0, 0, 0); };
  const start = c.health;
  let landed = 0, swings = 0;
  for (let i = 0; i < 26 && !c.dead; i++) {
    // Put the target back on its feet each round: this is a damage test, not
    // a test of what happens to a body already on the floor.
    if (c.state !== 'controlled') { c.balance = 1; c.setState('controlled'); }
    c.teleport(OX, 0, Math.PI);
    g.player.teleport(OX, 0.62, 0); g.camYaw = 0; g.camPitch = 0.02;
    await window.frames(6);

    const before = c.health;
    g.player.punchCooldown = 0;
    g.player.animator.cancelAction();
    if (!g.player.punch()) continue;
    swings++;
    // Wait on the animation, not on the clock: under software rendering a
    // fixed sleep can end before the fist has even started travelling.
    await window.settle(() => !g.player.animator.actionActive, 240);
    if (c.health < before) landed++;
  }
  await window.frames(60);
  return {
    dead: c.dead, state: c.state, hp: Math.round(c.health),
    swings, landed, damage: Math.round(start - c.health),
    stillThere: g.characters.includes(c),
  };
});
check('jabs land at walking-in range and can kill',
  r.dead && r.state === 'dead' && r.stillThere && r.landed >= 4, JSON.stringify(r));

// ---------- citizens can hurt you back ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;   // clear of the platform in the middle
  g.clearSpawns();
  const V = g.player.pos.constructor;
  const { spawnCitizen } = await import('/src/game/citizen.js');
  const c = spawnCitizen(g, new V(OX, 0, 0));
  await window.settle(() => c.grounded);
  g.respawnPlayer();
  g.player.teleport(OX, 0.7, 0);
  g.camYaw = 0; g.camPitch = 0;
  // wind the citizen up: angry, brave, and looking straight at us
  c.ai.anger = 1; c.ai.fear = 0; c.ai.bravery = 1; c.ai.aggression = 1;
  c.ai.threat = g.player; c.ai.threatSeen = 9999;
  c.ai._setState('fight');
  const hp0 = g.player.health;
  for (let i = 0; i < 600; i++) {
    await new Promise(r => requestAnimationFrame(r));
    if (g.player.health < hp0) break;
  }
  return { playerHurt: +(hp0 - g.player.health).toFixed(1), aiState: c.ai.state };
});
check('a citizen fights back and can hurt you', r.playerHurt > 0, JSON.stringify(r));

// ---------- the joystick works the moment you land in the map ----------
{
  // Open ground, on our feet: this is a test of the stick, not of walking
  // into whoever the last check left standing in front of us.
  await ev(() => {
    const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;   // clear of the platform in the middle
    g.clearSpawns();
    g.player.balance = 1;
    g.player.setState('controlled');
    g.player.teleport(OX, 0, 0);
    g.camYaw = 0; g.camPitch = 0;
  });
  await page.waitForTimeout(400);
  const grip = await h.dragStick(0, -70);
  await page.waitForTimeout(120);
  const held = await ev(() => ({
    x: +window.GOREBOX.game.player.moveInput.x.toFixed(2),
    z: +window.GOREBOX.game.player.moveInput.z.toFixed(2),
  }));
  const from = await ev(() => {
    const p = window.GOREBOX.game.player;
    return { x: p.pos.x, z: p.pos.z };
  });
  await page.waitForTimeout(1200);
  /* Distance over WALL time is not a fair measure here: the main loop clamps
     a long frame to a tenth of a second, so on a slow renderer the game sees
     less time than the clock does and the player covers less ground. How
     fast they are actually travelling does not care how many frames it took
     to get there. */
  r = await ev((f) => {
    const p = window.GOREBOX.game.player;
    return {
      moved: +Math.hypot(p.pos.x - f.x, p.pos.z - f.z).toFixed(2),
      speed: +Math.hypot(p.vel.x, p.vel.z).toFixed(2),
    };
  }, from);
  await grip.release();
  r.held = held;
  check('the joystick moves you',
    Math.abs(held.z) > 0.5 && r.moved > 0.6 && r.speed > 1.6, JSON.stringify(r));
}

// ---------- nothing gets launched into orbit ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;   // clear of the platform in the middle
  const V = g.player.pos.constructor;
  const { spawnCitizen } = await import('/src/game/citizen.js');
  const { spawnBoulder } = await import('/src/game/objects.js');
  g.clearSpawns();
  const cs = [];
  for (let i = 0; i < 3; i++) cs.push(spawnCitizen(g, new V(OX + i * 1.5 - 1.5, 0, 0)));
  await new Promise((res) => setTimeout(res, 500));
  // The OX matters: without it they stand a map away from the boulder below,
  // and this measures three people lying quietly instead of being hit.
  cs.forEach((c, i) => { c.ai.update = () => { c.moveInput.set(0, 0, 0); }; c.teleport(OX + i * 1.5 - 1.5, 0, Math.PI); });
  g.player.teleport(OX, 8, 0);
  await new Promise((res) => setTimeout(res, 300));

  // a hard jab each, then a boulder straight through them
  cs.forEach((c) => {
    const b = c.rig.byName.upperTorso;
    c.applyImpact(new V(b.worldPos.x, b.worldPos.y, b.worldPos.z + 0.1), new V(OX, 7, -130),
      { boneName: b.name, damage: 12, type: 'blunt' });
  });
  /* Put them on the floor first. A jab alone no longer floors anyone, and a
     citizen still on their feet is pinned to their animation, which would make
     this measure the walk cycle rather than the ragdoll it is about. */
  for (const c of cs) { c.balance = 0; c._checkBalance(); c.wantsUp = false; }
  for (let i = 0; i < 40; i++) await new Promise((res) => requestAnimationFrame(res));

  /* Aimed at where the middle one actually came to rest, not at where they
     were standing before they fell over. Fired from seven metres it used to
     roll past a body lying half a metre to the side, and the check then
     measured three people lying still. */
  const mark = cs[1].center;
  const rock = spawnBoulder(g, new V(mark.x - 4, 0.6, mark.z));
  rock.vel.set(16, 0, 0); rock.wake();

  /* What "launched" means is that the whole person goes, so the whole person
     is what gets measured: the mass weighted centre of each body. A single
     toe whipping round at fifteen metres a second while the body slides two
     metres is a boulder hit, not a launch, and measuring the fastest particle
     cannot tell those apart.

     A Verlet particle stores speed as a position offset over ONE substep, so
     that is what turns it back into metres per second. */
  const inv = 1 / g.world.substepDt;
  const before = cs.map((c) => ({ x: c.center.x, z: c.center.z }));
  let comPeak = 0, high = 0, capped = 0;
  for (let f = 0; f < 260; f++) {
    await new Promise((res) => requestAnimationFrame(res));
    for (const c of cs) {
      let mx = 0, my = 0, mz = 0, m = 0;
      for (const p of c.particleList) {
        mx += (p.x - p.px) * p.mass; my += (p.y - p.py) * p.mass; mz += (p.z - p.pz) * p.mass;
        m += p.mass;
        const sp = Math.hypot(p.x - p.px, p.y - p.py, p.z - p.pz) * inv;
        if (sp > 19.5) capped++;            // anything at the hard cap has gone wrong
        high = Math.max(high, p.y);
      }
      comPeak = Math.max(comPeak, (Math.hypot(mx, my, mz) / m) * inv);
    }
  }
  let stretch = 1, moved = 0;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    moved = Math.max(moved, Math.hypot(c.center.x - before[i].x, c.center.z - before[i].z));
    for (const con of c.constraints) {
      if (con.kind !== 'eq' || !con.rest) continue;
      stretch = Math.max(stretch,
        Math.hypot(con.a.x - con.b.x, con.a.y - con.b.y, con.a.z - con.b.z) / con.rest);
    }
  }
  return {
    comPeak: +comPeak.toFixed(1), maxHeight: +high.toFixed(2),
    moved: +moved.toFixed(2), stretch: +stretch.toFixed(2), capped,
    finite: cs.every((c) => Number.isFinite(c.pos.x) && Number.isFinite(c.pos.y)),
  };
});
check('a boulder shoves ragdolls along the ground instead of launching them',
  r.finite && r.moved > 0.15 && r.moved < 4 && r.comPeak > 0.5 && r.comPeak < 9 &&
  r.maxHeight < 2.2 && r.stretch < 1.15 && r.capped === 0, JSON.stringify(r));

// ---------- a ragdoll is carried by the RCV2, not flung by it ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;   // clear of the platform in the middle
  const V = g.player.pos.constructor;
  const { spawnCitizen } = await import('/src/game/citizen.js');
  g.clearSpawns();
  g.player.teleport(OX, 3, 0); g.camYaw = 0; g.camPitch = 0;
  const c = spawnCitizen(g, new V(OX, 0, -2));
  c.ai.update = () => c.moveInput.set(0, 0, 0);
  await new Promise((res) => setTimeout(res, 400));
  g.setEquipped('rcv2');
  g.rcv2.shoot(g.camera.position, g.camera.getWorldDirection(new V()));

  const inv = 1 / g.world.substepDt;
  const worst = () => {
    let s = 0;
    for (const p of c.particleList) {
      s = Math.max(s, Math.hypot(p.x - p.px, p.y - p.py, p.z - p.pz) * inv);
    }
    return s;
  };
  // swing them about, hard, then let go
  let held = 0;
  for (let f = 0; f < 200; f++) {
    g.camYaw = Math.sin(f * 0.09) * 1.4; g.camPitch = Math.sin(f * 0.13) * 0.5;
    await new Promise((res) => requestAnimationFrame(res));
    held = Math.max(held, worst());
  }
  g.rcv2.release();
  /* Only the flight and the landing count. Once they start getting up their
     muscles are moving limbs on purpose and fast, which is not a fling. */
  let after = 0, high = 0, gotUp = false;
  for (let f = 0; f < 200; f++) {
    await new Promise((res) => requestAnimationFrame(res));
    if (c.state === 'ragdoll') after = Math.max(after, worst());
    else gotUp = true;
    for (const p of c.particleList) high = Math.max(high, p.y);
  }
  // and once it is all over it should be lying still, not twitching
  let settled = 0;
  for (let f = 0; f < 120; f++) {
    await new Promise((res) => requestAnimationFrame(res));
    settled = Math.max(settled, worst());
  }
  let stretch = 1;
  for (const con of c.constraints) {
    if (con.kind !== 'eq' || !con.rest) continue;
    stretch = Math.max(stretch, Math.hypot(con.a.x - con.b.x, con.a.y - con.b.y, con.a.z - con.b.z) / con.rest);
  }
  return {
    held: +held.toFixed(1), after: +after.toFixed(1), high: +high.toFixed(2),
    settled: +settled.toFixed(2), stretch: +stretch.toFixed(2), gotUp,
  };
});
check('the RCV2 carries a ragdoll instead of flinging it',
  r.held < 10 && r.after < 13.5 && r.high < 3.2 && r.settled < 3 &&
  r.stretch < 1.15 && r.gotUp, JSON.stringify(r));

// ---------- one punch staggers you, it does not floor you ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;   // clear of the platform in the middle
  const V = g.player.pos.constructor;
  g.clearSpawns();
  g.player.teleport(OX, 0, 0);
  g.player.balance = 1; g.player.health = 100;
  g.player.setState('controlled');
  await new Promise((res) => setTimeout(res, 200));

  // exactly what a citizen's hardest jab hands over: 130 kg m/s at chest height
  const jab = () => {
    const b = g.player.rig.byName.upperTorso;
    g.player.applyImpact(new V(b.worldPos.x, b.worldPos.y, b.worldPos.z + 0.15),
      new V(OX, 7, -130), { boneName: 'upperTorso', damage: 9, type: 'blunt' });
  };
  jab();
  await new Promise((res) => requestAnimationFrame(res));
  const afterOne = { state: g.player.state, balance: +g.player.balance.toFixed(2) };

  // keep going and it should still end with you on the floor
  let downAfter = 0;
  for (let i = 2; i <= 8 && g.player.state === 'controlled'; i++) {
    jab();
    await new Promise((res) => requestAnimationFrame(res));
    downAfter = i;
  }
  return { afterOne, downAfter, endState: g.player.state };
});
check('one punch does not floor you, a beating does',
  r.afterOne.state === 'controlled' && r.afterOne.balance > 0.6 &&
  r.downAfter >= 3 && r.endState !== 'controlled', JSON.stringify(r));

// ---------- the machete: pick it up, swing it, put it down ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;   // clear of the platform in the middle
  const V = g.player.pos.constructor;
  const { spawnCitizen } = await import('/src/game/citizen.js');
  g.clearSpawns();
  g.player.teleport(OX, 3, 0); g.camYaw = 0; g.camPitch = -0.2;
  g.setEquipped('rcv2'); g.setSelected('machete');
  await new Promise((res) => setTimeout(res, 150));
  const dropped = g.spawnSelected();
  for (let i = 0; i < 110; i++) await new Promise((res) => requestAnimationFrame(res));
  // it lands a couple of metres out, so walk over to it first
  g.player.teleport(dropped.entity.pos.x, dropped.entity.pos.z + 0.9, 0);
  for (let i = 0; i < 20; i++) await new Promise((res) => requestAnimationFrame(res));
  g.setEquipped('fists');
  // The HUD only offers USE when something is actually in reach, so check the
  // button turns itself on before pressing it.
  for (let i = 0; i < 20; i++) await new Promise((res) => requestAnimationFrame(res));
  const useOffered = document.querySelector('#btn-use').classList.contains('show');
  const fistPose = g.player.animator.upper.clip?.name || null;
  g.useAction();                                  // USE picks it up
  const carried = !!g.carried && g.equipped === 'machete';
  for (let i = 0; i < 10; i++) await new Promise((res) => requestAnimationFrame(res));
  const bladePose = g.player.animator.upper.clip?.name || null;

  const c = spawnCitizen(g, new V(OX, 0, 0));
  await new Promise((res) => setTimeout(res, 400));
  c.ai.update = () => { c.moveInput.set(0, 0, 0); };
  const clips = []; let bled = false; let damage = 0;
  const frame = () => new Promise((res) => requestAnimationFrame(res));
  /* Healed between swings. A machete can take an arm off in one now, and a
     limb coming off is enough to finish someone - so without this the second
     swing has nobody left to land on and only one of the two clips is ever
     seen. */
  for (let i = 0; i < 5; i++) {
    c.heal();
    if (c.state !== 'controlled') { c.balance = 1; c.setState('controlled'); }
    c.teleport(OX, 0, Math.PI);
    g.player.teleport(OX, 0.85, 0); g.camYaw = 0; g.camPitch = 0.02;
    for (let k = 0; k < 6; k++) await frame();
    g.player.punchCooldown = 0; g.player.animator.cancelAction();
    if (!g.player.slash()) continue;
    clips.push(g.player.animator.actionName);
    const hp = c.health;
    for (let k = 0; k < 240 && g.player.animator.actionActive; k++) await frame();
    damage += hp - c.health;
  }
  damage = Math.round(damage);
  for (const [, e] of c.body.entries) {
    if (e.skin.surface && e.skin.surface.bloodAmount > 0) bled = true;
  }
  g.useAction();                                  // USE puts it back down
  return {
    carried, useOffered, fistPose, bladePose, clips, damage, bled,
    dropped: !g.carried && g.spawnedBodies.some((b) => b.tag === 'machete'),
    equippedAfter: g.equipped,
  };
});
check('the machete can be picked up, swung and dropped',
  r.carried && r.useOffered && r.damage > 30 && r.bled && r.dropped &&
  r.clips.includes('slashR') && r.clips.includes('slashL'), JSON.stringify(r));
check('holding a blade looks nothing like holding fists',
  r.fistPose === 'fistGuard' && r.bladePose === 'macheteHold',
  JSON.stringify({ fistPose: r.fistPose, bladePose: r.bladePose }));

// ---------- the two heavy melee weapons: both break bones ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;   // clear of the platform in the middle
  const V = g.player.pos.constructor;
  const { spawnCitizen } = await import('/src/game/citizen.js');
  const frame = () => new Promise((res) => requestAnimationFrame(res));
  const out = {};
  for (const [kind, standOff] of [['sledge', 1.2], ['crowbar', 1.0]]) {
    g.clearSpawns();
    if (g.carried) g.dropCarried();
    g.clearSpawns();
    g.player.teleport(OX, 3, 0); g.camYaw = 0; g.camPitch = -0.2;
    g.setEquipped('rcv2'); g.setSelected(kind);
    await new Promise((res) => setTimeout(res, 150));
    const dropped = g.spawnSelected();
    for (let i = 0; i < 110; i++) await frame();
    g.player.teleport(dropped.entity.pos.x, dropped.entity.pos.z + 0.9, 0);
    for (let i = 0; i < 20; i++) await frame();
    g.setEquipped('fists');
    g.useAction();
    const carried = g.carried?.kind === kind && g.equipped === kind;
    for (let i = 0; i < 10; i++) await frame();
    const holdPose = g.player.animator.upper.clip?.name || null;

    const c = spawnCitizen(g, new V(OX, 0, 0));
    await new Promise((res) => setTimeout(res, 400));
    c.ai.update = () => { c.moveInput.set(0, 0, 0); };
    const clips = [];
    let damage = 0;
    const broken = new Set();
    for (let i = 0; i < 6; i++) {
      // These kill in one or two, so heal between swings: this check is about
      // the weapon working, not about how long anyone survives it.
      const before = c.health;
      if (i > 0) damage += before - c.health;
      for (const b of c.broken) broken.add(b);
      c.heal();
      if (c.state !== 'controlled') { c.balance = 1; c.setState('controlled'); }
      c.teleport(OX, 0, Math.PI);
      g.player.teleport(OX, standOff, 0); g.camYaw = 0; g.camPitch = 0.02;
      for (let k = 0; k < 6; k++) await frame();
      g.player.punchCooldown = 0; g.player.animator.cancelAction();
      if (!g.player.slash()) continue;
      clips.push(g.player.animator.actionName);
      const hp = c.health;
      for (let k = 0; k < 300 && g.player.animator.actionActive; k++) await frame();
      damage += hp - c.health;
      for (const b of c.broken) broken.add(b);
    }
    g.useAction();
    out[kind] = {
      carried, holdPose, clips,
      damage: Math.round(damage), broken: [...broken],
      dropped: !g.carried && g.spawnedBodies.some((b) => b.tag === kind),
    };
  }
  return out;
});
check('the sledgehammer is carried, swung both ways and breaks bones',
  r.sledge.carried && r.sledge.holdPose === 'sledgeHold' && r.sledge.damage > 40 &&
  r.sledge.broken.length > 0 && r.sledge.dropped &&
  r.sledge.clips.includes('swingR') && r.sledge.clips.includes('swingL'),
  JSON.stringify(r.sledge));
check('the crowbar is carried, swung both ways and breaks bones',
  r.crowbar.carried && r.crowbar.holdPose === 'crowbarHold' && r.crowbar.damage > 30 &&
  r.crowbar.broken.length > 0 && r.crowbar.dropped &&
  r.crowbar.clips.includes('crowbarR') && r.crowbar.clips.includes('crowbarL'),
  JSON.stringify(r.crowbar));

// ---------- faces come apart the way they were asked to ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;   // clear of the platform in the middle
  const V = g.player.pos.constructor;
  const { spawnCitizen } = await import('/src/game/citizen.js');
  const frame = () => new Promise((res) => requestAnimationFrame(res));
  g.clearSpawns();
  g.player.teleport(OX, 6, 0);
  const c = spawnCitizen(g, new V(OX, 0, 0));
  await new Promise((res) => setTimeout(res, 300));
  c.ai.update = () => c.moveInput.set(0, 0, 0);
  const hit = (bone, opts) => {
    const b = c.rig.byName[bone];
    c.applyImpact(new V(b.worldPos.x, b.worldPos.y, b.worldPos.z),
      new V(OX, 4, -60), { boneName: bone, ...opts });
  };

  // fists: bloodshot eyes, a bloody nose and lip, but both eyes still in
  c.heal(); c.setState('controlled');
  for (let i = 0; i < 6; i++) { hit('head', { damage: 4, type: 'blunt', severity: 0.25 }); await frame(); }
  const punched = { ...c.injuries, blind: +c.blind.toFixed(2) };

  // a blade takes eyes out of sockets
  c.heal(); c.setState('controlled');
  for (let i = 0; i < 10; i++) {
    hit('head', { damage: 12, type: 'impact', severity: 0.9 });
    await frame();
  }
  const cut = { ...c.injuries, blind: +c.blind.toFixed(2) };
  // and losing both of them is losing your sight, whichever way they went
  c.heal(); c.setState('controlled');
  c.setInjuries({ eyeR: 'gone', eyeL: 'gone' });
  const bothGone = +c.blind.toFixed(2);

  // an eye out of its socket is a real object hanging on a cord
  c.heal(); c.setState('controlled');
  c.setInjuries({ eyeR: 'hanging' });
  for (let i = 0; i < 40; i++) await frame();
  const e = c.body.hangingEyes.R;
  const head = c.rig.byName.head;
  const anchor = e ? e.socket.clone().applyQuaternion(head.worldQuat).add(head.worldPos) : null;
  const hanging = {
    exists: !!e,
    inScene: !!(e && e.ball.parent),
    onCord: !!(e && e.pos.distanceTo(anchor) <= e.cordLen + 0.02 && Number.isFinite(e.pos.y)),
    blind: +c.blind.toFixed(2),
  };
  c.heal();
  return {
    punched, cut, hanging, bothGone,
    healedEyes: c.injuries.eyeR + '/' + c.injuries.eyeL,
    healedMesh: !!(c.body.hangingEyes.R || c.body.hangingEyes.L),
  };
});
check('faces bruise, bleed and lose eyes',
  r.punched.eyeR !== 'ok' || r.punched.eyeL !== 'ok', JSON.stringify(r.punched));
check('a bloodied nose and mouth run',
  r.punched.noseBleed > 0 && r.punched.mouthBleed > 0, JSON.stringify(r.punched));
check('an eye can hang out, and taking both blinds you',
  r.hanging.exists && r.hanging.inScene && r.hanging.onCord && r.hanging.blind >= 0.5 &&
  r.bothGone === 1 && r.cut.blind >= 0.5 &&
  r.healedEyes === 'ok/ok' && !r.healedMesh, JSON.stringify(r));

// ---------- a broken bone stops the limb working ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;   // clear of the platform in the middle
  const V = g.player.pos.constructor;
  const { spawnCitizen } = await import('/src/game/citizen.js');
  const frame = () => new Promise((res) => requestAnimationFrame(res));
  g.clearSpawns();
  g.player.teleport(OX, 6, 0);
  const c = spawnCitizen(g, new V(OX, 0, 0));
  await new Promise((res) => setTimeout(res, 300));
  c.ai.update = () => c.moveInput.set(0, 0, 0);

  c.heal(); c.setState('controlled'); c.balance = 1;
  c.breakBone('upperArmR', c.rig.byName.upperArmR.worldPos.clone());
  for (let i = 0; i < 4; i++) await frame();
  const arm = {
    broken: c.armBroken('R'),
    bleeding: c.bleeding > 0,
    slack: c.particles.elbowR.muscle < 0.2 && c.particles.elbowL.muscle > 0.5,
    bent: !!c.breakBend.upperArmR,
  };
  c.equipped = 'machete'; c.punchCooldown = 0; c.animator.cancelAction();
  arm.cannotSwing = c.slash() === false;
  c.equipped = 'fists'; c.punchCooldown = 0; c.animator.cancelAction();
  arm.stillJabs = c.punch() === true && c.punchSide === 'L';

  c.heal(); c.setState('controlled'); c.balance = 1;
  c.breakBone('lowerLegL', c.rig.byName.lowerLegL.worldPos.clone());
  await frame();
  const y0 = c.pos.y;
  c.wantJump = true;
  let peak = y0;
  for (let i = 0; i < 40; i++) { await frame(); peak = Math.max(peak, c.pos.y); }
  const leg = { broken: c.legBroken('L'), rose: +(peak - y0).toFixed(2) };
  c.heal();
  return { arm, leg, healed: c.broken.size === 0 && c.limpScale.upperArmR === 1 };
});
check('a broken bone bleeds, goes limp and stops working',
  r.arm.broken && r.arm.bleeding && r.arm.slack && r.arm.bent &&
  r.arm.cannotSwing && r.arm.stillJabs &&
  r.leg.broken && r.leg.rose < 0.15 && r.healed, JSON.stringify(r));

// ---------- the skeleton is a hierarchy, not a pile of parts ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;
  const V = g.player.pos.constructor;
  const { spawnCitizen } = await import('/src/game/citizen.js');
  const frame = () => new Promise((res) => requestAnimationFrame(res));
  g.clearSpawns();
  g.player.teleport(OX, 10, 0);
  const c = spawnCitizen(g, new V(OX, 0, 0));
  await new Promise((res) => setTimeout(res, 350));
  const rig = c.rig;

  const parentOf = (n) => rig.byName[n].parent?.name || null;
  const chain = {
    lowerTorso: parentOf('lowerTorso'), midTorso: parentOf('midTorso'),
    upperTorso: parentOf('upperTorso'), neck: parentOf('neck'), head: parentOf('head'),
    upperArmL: parentOf('upperArmL'), lowerArmL: parentOf('lowerArmL'),
    handL: parentOf('handL'), fingerL0A: parentOf('fingerL0A'), fingerL0B: parentOf('fingerL0B'),
    upperArmR: parentOf('upperArmR'), lowerArmR: parentOf('lowerArmR'), handR: parentOf('handR'),
    upperLegR: parentOf('upperLegR'), lowerLegR: parentOf('lowerLegR'), footR: parentOf('footR'),
    upperLegL: parentOf('upperLegL'), lowerLegL: parentOf('lowerLegL'), footL: parentOf('footL'),
  };
  const orphans = rig.bones.filter((b) => b.name !== 'pelvis' && !b.parent).map((b) => b.name);

  // every part is drawn from its own bone, and moves when that bone moves
  const before = c.body.entries.get('lowerArmR').skin.mesh.position.clone();
  rig.byName.upperArmR.anim.x = 1.2;
  rig.updateFK();
  c.body.sync();
  const after = c.body.entries.get('lowerArmR').skin.mesh.position.clone();
  const drivenByParent = before.distanceTo(after) > 0.15;

  /* What the limits actually catch while a body is moving normally. Walking
     and running should touch nothing - the clips were authored inside the
     ranges - and the one thing a punch does touch is the elbow, where the
     interpolation overshoots a hair past straight at full extension and is
     stopped at straight, which is the whole point of having limits. */
  rig.byName.upperArmR.anim.x = 0;
  const caught = {};
  const watchClamps = () => {
    for (const n of rig.limitClamped) caught[n] = (caught[n] || 0) + 1;
  };
  c.ai.update = () => { c.moveInput.set(0, 0, -1); c.wantRun = false; };
  for (let i = 0; i < 80; i++) { await frame(); watchClamps(); }
  c.ai.update = () => { c.moveInput.set(0, 0, -1); c.wantRun = true; };
  for (let i = 0; i < 80; i++) { await frame(); watchClamps(); }
  const inLocomotion = Object.keys(caught).length;
  c.ai.update = () => c.moveInput.set(0, 0, 0);
  for (let i = 0; i < 6; i++) {
    c.punchCooldown = 0; c.animator.cancelAction(); c.punch(true);
    for (let k = 0; k < 40 && c.animator.actionActive; k++) { await frame(); watchClamps(); }
  }
  const elbowsOnly = Object.keys(caught).every((n) => /^lowerArm[RL]$/.test(n));
  const elbowStraight = rig.byName.lowerArmR.anim.x >= 0 && rig.byName.lowerArmL.anim.x >= 0;
  return {
    chain, orphans, drivenByParent, bones: rig.bones.length,
    caught, inLocomotion, elbowsOnly, elbowStraight,
  };
});
check('every bone hangs off its parent and drives its own body part',
  r.orphans.length === 0 && r.drivenByParent &&
  r.chain.lowerTorso === 'pelvis' && r.chain.midTorso === 'lowerTorso' &&
  r.chain.upperTorso === 'midTorso' && r.chain.neck === 'upperTorso' &&
  r.chain.head === 'neck' &&
  r.chain.upperArmL === 'upperTorso' && r.chain.lowerArmL === 'upperArmL' &&
  r.chain.handL === 'lowerArmL' && r.chain.fingerL0A === 'handL' &&
  r.chain.fingerL0B === 'fingerL0A' &&
  r.chain.upperArmR === 'upperTorso' && r.chain.lowerArmR === 'upperArmR' &&
  r.chain.handR === 'lowerArmR' &&
  r.chain.upperLegR === 'pelvis' && r.chain.lowerLegR === 'upperLegR' &&
  r.chain.footR === 'lowerLegR' &&
  r.chain.upperLegL === 'pelvis' && r.chain.lowerLegL === 'upperLegL' &&
  r.chain.footL === 'lowerLegL',
  JSON.stringify({ bones: r.bones, orphans: r.orphans, drivenByParent: r.drivenByParent }));
check('walking and running never ask a joint for the impossible',
  r.inLocomotion === 0, JSON.stringify({ caughtWhileMoving: r.inLocomotion }));
check('and a punch never hyperextends the elbow it throws',
  r.elbowsOnly && r.elbowStraight, JSON.stringify(r.caught));

// ---------- joints refuse what a joint cannot do ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const c = g.characters.find((x) => x !== g.player) || g.player;
  const rig = c.rig;
  const put = (bone, axis, value) => {
    rig.byName[bone].anim[axis] = value;
    rig.updateFK();
    return +rig.byName[bone].anim[axis].toFixed(3);
  };
  const deg = (v) => +(v * 180 / Math.PI).toFixed(0);
  return {
    kneeBack: deg(put('lowerLegR', 'x', 1.4)),        // knees bend negative only
    kneeFlex: deg(put('lowerLegR', 'x', -1.2)),       // ...this one is legal
    elbowBack: deg(put('lowerArmR', 'x', -1.4)),      // elbows bend positive only
    elbowFlex: deg(put('lowerArmR', 'x', 1.9)),       // ...legal
    fingerBack: deg(put('fingerR0A', 'x', 1.2)),
    fingerCurl: deg(put('fingerR0A', 'x', -1.5)),
    neckSpin: deg(put('neck', 'y', 3.0)),
    headSpin: deg(put('head', 'y', 3.0)),
    hipThroughPelvis: deg(put('upperLegR', 'z', -2.6)),
    ankleTwist: deg(put('footR', 'y', 1.6)),
    spineTwist: deg(put('lowerTorso', 'y', 1.5)),
    footTip: deg(put('footTipR', 'x', 1.0)),
  };
});
check('a joint cannot do what the joint it copies cannot do',
  r.kneeBack === 0 && r.kneeFlex === -69 &&
  r.elbowBack === 0 && r.elbowFlex === 109 &&
  r.fingerBack <= 9 && r.fingerCurl === -86 &&
  Math.abs(r.neckSpin) <= 42 && Math.abs(r.headSpin) <= 42 &&
  r.hipThroughPelvis >= -47 && Math.abs(r.ankleTwist) <= 22 &&
  Math.abs(r.spineTwist) <= 13 && r.footTip === 0, JSON.stringify(r));

// ---------- a hit travels along the bones, not through the air ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;
  const V = g.player.pos.constructor;
  const { spawnCitizen } = await import('/src/game/citizen.js');
  const frame = () => new Promise((res) => requestAnimationFrame(res));
  g.clearSpawns();
  g.player.teleport(OX, 10, 0);
  const c = spawnCitizen(g, new V(OX, 0, 0));
  await new Promise((res) => setTimeout(res, 350));
  c.ai.update = () => c.moveInput.set(0, 0, 0);
  const speed = (n) => {
    const p = c.particles[n];
    return Math.hypot(p.x - p.px, p.y - p.py, p.z - p.pz) / g.world.substepDt;
  };
  // The velocity a particle has right now, as a vector: what a hit ADDS is the
  // change in that vector, not the change in its length. A body still drifting
  // as it settles would otherwise report a hit that slowed it down as no hit
  // at all.
  const vel = (n) => {
    const p = c.particles[n];
    return [(p.x - p.px) / g.world.substepDt, (p.y - p.py) / g.world.substepDt,
            (p.z - p.pz) / g.world.substepDt];
  };
  const watch = ['headTop', 'neckTop', 'shoulders', 'mt', 'hip', 'kneeR', 'toeR'];
  const hit = async (boneName) => {
    c.heal(); c.setState('controlled'); c.teleport(OX, 0, 0);
    for (let i = 0; i < 20; i++) await frame();
    c.setState('ragdoll'); c.wantsUp = false;
    for (let i = 0; i < 240; i++) {
      await frame();
      if (i > 70 && speed('hip') < 0.25 && speed('headTop') < 0.25) break;
    }
    c.health = c.maxHealth; c.dead = false;
    const before = {};
    for (const n of watch) before[n] = vel(n);
    const b = c.rig.byName[boneName];
    c.applyImpact(new V(b.worldPos.x, b.worldPos.y, b.worldPos.z), new V(0, 8, -90),
      { boneName, damage: 0, type: 'blunt', severity: 0.6 });
    const out = {};
    for (const n of watch) {
      const a = before[n], d = vel(n);
      out[n] = +Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]).toFixed(2);
    }
    return out;
  };
  return { head: await hit('head'), foot: await hit('footR') };
});
check('a hit moves what it landed on, then fades along the skeleton',
  r.head.headTop > r.head.shoulders && r.head.shoulders > r.head.mt &&
  r.head.mt > r.head.kneeR && r.head.headTop > 2 &&
  r.foot.toeR > r.foot.kneeR && r.foot.kneeR > r.foot.headTop && r.foot.toeR > 2,
  JSON.stringify(r));

// ---------- the ragdoll will not fold a knee backwards ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;
  const c = g.characters.find((x) => x !== g.player);
  const frame = () => new Promise((res) => requestAnimationFrame(res));
  const P = c.particles;
  c.heal(); c.setState('controlled'); c.teleport(OX, 0, 0);
  for (let i = 0; i < 20; i++) await frame();
  c.setState('ragdoll'); c.wantsUp = false;
  for (let i = 0; i < 140; i++) await frame();

  const forward = () => {
    const rx = P.hipR.x - P.hipL.x, ry = P.hipR.y - P.hipL.y, rz = P.hipR.z - P.hipL.z;
    const ux = P.shoulders.x - P.hip.x, uy = P.shoulders.y - P.hip.y, uz = P.shoulders.z - P.hip.z;
    let fx = uy * rz - uz * ry, fy = uz * rx - ux * rz, fz = ux * ry - uy * rx;
    const l = Math.hypot(fx, fy, fz) || 1;
    return { x: fx / l, y: fy / l, z: fz / l };
  };
  const side = (k, a, b) => {
    const f = forward();
    const mx = (P[a].x + P[b].x) / 2, my = (P[a].y + P[b].y) / 2, mz = (P[a].z + P[b].z) / 2;
    return (P[k].x - mx) * f.x + (P[k].y - my) * f.y + (P[k].z - mz) * f.z;
  };
  // shove the knee right through to the wrong side and let physics answer
  for (let i = 0; i < 4; i++) {
    const f = forward();
    P.kneeR.x -= f.x * 0.25; P.kneeR.y -= f.y * 0.25; P.kneeR.z -= f.z * 0.25;
    P.kneeR.px = P.kneeR.x; P.kneeR.py = P.kneeR.y; P.kneeR.pz = P.kneeR.z;
  }
  const wrong = +side('kneeR', 'hipR', 'ankleR').toFixed(3);
  for (let i = 0; i < 30; i++) await frame();
  return { wrong, fixed: +side('kneeR', 'hipR', 'ankleR').toFixed(3) };
});
check('a ragdoll will not keep a knee bent the wrong way',
  r.wrong < -0.2 && r.fixed >= -0.01, JSON.stringify(r));

// ---------- a break turns any way, and still cannot be inside the ribs ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;
  const c = g.characters.find((x) => x !== g.player);
  const frame = () => new Promise((res) => requestAnimationFrame(res));
  c.heal(); c.setState('controlled'); c.teleport(OX, 0, 0);
  for (let i = 0; i < 20; i++) await frame();
  c.breakBone('lowerArmR', c.rig.byName.lowerArmR.worldPos.clone());
  c.rig.byName.lowerArmR.anim.x = -2.4;      // an elbow bent completely backwards
  c.rig.byName.lowerArmL.anim.x = -2.4;      // ...and the same on the good arm
  c.rig.updateFK();
  const out = {
    broken: +c.rig.byName.lowerArmR.anim.x.toFixed(2),
    intact: +c.rig.byName.lowerArmL.anim.x.toFixed(2),
  };
  // now bury the broken hand in the chest every frame and see it pushed out
  c.setState('ragdoll'); c.wantsUp = false;
  const P = c.particles;
  for (let i = 0; i < 40; i++) {
    P.wristR.x = P.mt.x; P.wristR.y = P.mt.y; P.wristR.z = P.mt.z;
    await frame();
  }
  out.outOfChest = +Math.hypot(P.wristR.x - P.mt.x, P.wristR.y - P.mt.y, P.wristR.z - P.mt.z).toFixed(3);
  c.heal();
  return out;
});
check('a broken bone turns any way but still cannot be inside the chest',
  r.broken === -2.4 && r.intact === 0 && r.outOfChest > 0.18, JSON.stringify(r));

// ---------- bones are solid, and stay out of each other ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;
  const V = g.player.pos.constructor;
  const { spawnCitizen } = await import('/src/game/citizen.js');
  const frame = () => new Promise((res) => requestAnimationFrame(res));
  g.clearSpawns();
  g.player.teleport(OX, 14, 0);
  const c = spawnCitizen(g, new V(OX, 0, 0));
  await new Promise((res) => setTimeout(res, 350));

  // how much clearance is there between two bones, at their closest?
  const clearance = (A, B) => {
    let best = 1e9;
    for (let i = 0; i <= 10; i++) {
      for (let j = 0; j <= 10; j++) {
        const s = i / 10, t = j / 10;
        const ax = A.a.x + (A.b.x - A.a.x) * s, ay = A.a.y + (A.b.y - A.a.y) * s,
              az = A.a.z + (A.b.z - A.a.z) * s;
        const bx = B.a.x + (B.b.x - B.a.x) * t, by = B.a.y + (B.b.y - B.a.y) * t,
              bz = B.a.z + (B.b.z - B.a.z) * t;
        best = Math.min(best, Math.hypot(ax - bx, ay - by, az - bz) - (A.r + B.r));
      }
    }
    return best;
  };

  /* Nothing may overlap during ordinary movement - a pair that fires while
     someone is walking would fight the animation every frame. */
  let worst = 1e9, worstPair = '';
  const sample = () => {
    for (const p of c.selfCollisionPairs) {
      const d = clearance({ a: p.a0, b: p.a1, r: p.ra }, { a: p.b0, b: p.b1, r: p.rb });
      if (d < worst) { worst = d; worstPair = p.names; }
    }
  };
  c.ai.update = () => c.moveInput.set(0, 0, 0);
  for (let i = 0; i < 60; i++) { await frame(); sample(); }
  c.ai.update = () => { c.moveInput.set(0, 0, -1); c.wantRun = true; };
  for (let i = 0; i < 90; i++) { await frame(); sample(); }
  c.ai.update = () => c.moveInput.set(0, 0, 0);
  for (let i = 0; i < 5; i++) {
    c.punchCooldown = 0; c.animator.cancelAction(); c.punch(true);
    for (let k = 0; k < 40 && c.animator.actionActive; k++) { await frame(); sample(); }
  }
  const quiet = { worst: +worst.toFixed(3), pair: worstPair, pairs: c.selfCollisionPairs.length };

  /* ...but a limb driven into the body really is stopped. */
  c.heal(); c.setState('controlled'); c.teleport(OX, 0, 0);
  for (let i = 0; i < 20; i++) await frame();
  c.setState('ragdoll'); c.wantsUp = false;
  for (let i = 0; i < 60; i++) await frame();
  const P = c.particles;
  for (let i = 0; i < 45; i++) {
    P.elbowR.x = P.mt.x; P.elbowR.y = P.mt.y; P.elbowR.z = P.mt.z;
    P.wristR.x = P.lt.x; P.wristR.y = P.lt.y; P.wristR.z = P.lt.z;
    await frame();
  }
  const insideSelf = +clearance(c.solidByName.lowerArmR, c.solidByName.midTorso).toFixed(3);

  // and so is one person's arm driven into someone else's chest
  const d2 = spawnCitizen(g, new V(OX + 1.1, 0, 0));
  await new Promise((res) => setTimeout(res, 300));
  d2.ai.update = () => d2.moveInput.set(0, 0, 0);
  d2.setState('ragdoll'); d2.wantsUp = false;
  for (let i = 0; i < 50; i++) {
    d2.particles.elbowR.x = P.mt.x;
    d2.particles.elbowR.y = P.mt.y;
    d2.particles.elbowR.z = P.mt.z;
    await frame();
  }
  const insideOther = +clearance(d2.solidByName.lowerArmR, c.solidByName.midTorso).toFixed(3);
  return { quiet, insideSelf, insideOther };
});
check('every bone is solid: nothing passes through anything',
  r.quiet.pairs > 100 && r.quiet.worst >= 0 &&
  r.insideSelf > -0.02 && r.insideOther > -0.02, JSON.stringify(r));

// ---------- Plains: the platform and the walls are real ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const V = g.player.pos.constructor;
  const { spawnBoulder } = await import('/src/game/objects.js');
  const frame = () => new Promise((res) => requestAnimationFrame(res));
  g.clearSpawns();
  const out = {
    name: g.map.name,
    solids: g.map.solids.length,
    middle: +g._surfaceHeight(0, 0).toFixed(2),
    grass: +g._surfaceHeight(g.map.openArea.x, 0).toFixed(2),
  };
  // dropped over the middle of the map, you land on the platform
  g.player.teleport(0, 0, 0, 4);
  for (let i = 0; i < 90; i++) await frame();
  out.standing = +g.player.pos.y.toFixed(2);
  out.grounded = g.player.grounded;
  // a boulder rolled at a wall is stopped by it
  const b = spawnBoulder(g, new V(g.map.openArea.x, 0.7, 30));
  b.vel.set(0, 0, 14); b.wake();
  for (let i = 0; i < 200; i++) await frame();
  out.boulderAt = +b.pos.z.toFixed(1);
  // and the citizens' map knows about both
  g.nav.rebuild(g.world, { groundY: 0 });
  out.navWall = g.nav.isBlockedWorld(0, -39.5);
  out.navPlatform = g.nav.isBlockedWorld(0, 0);
  g.clearSpawns();
  g.player.teleport(g.map.openArea.x, 6, 0);
  return out;
});
check('Plains has a platform you stand on and walls that stop you',
  r.name === 'Plains' && r.solids >= 6 && r.middle > 0.5 && r.grass === 0 &&
  r.grounded && Math.abs(r.standing - (r.middle + 0.945)) < 0.12 &&
  r.boulderAt < 39 && r.boulderAt > 36 && r.navWall === true && r.navPlatform === false,
  JSON.stringify(r));

// ---------- every weapon is actually held, not floating near the hand ------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;
  const V = g.player.pos.constructor;
  const frame = () => new Promise((res) => requestAnimationFrame(res));
  const { CARRY } = await import('/src/game/game.js');
  const { FIST, gripWorld } = await import('/src/game/grip.js');
  const { pointInBone } = await import('/src/game/skeleton.js');
  const objects = await import('/src/game/objects.js');
  const guns = await import('/src/game/guns.js');
  const SPAWN = {
    machete: objects.spawnMachete, sledge: objects.spawnSledge,
    glock: guns.spawnGlock, ak47: guns.spawnAk, m16: guns.spawnM16,
  };
  /** Where the OTHER hand goes on each two handed thing, in weapon space. */
  const SUPPORT = {
    sledge: [0, 0.42, 0], glock: [-0.048, -0.050, 0.012],
    ak47: [0, -0.014, -0.170], m16: [0, 0.004, -0.205],
  };
  const out = {};
  for (const kind of ['machete', 'sledge', 'glock', 'ak47', 'm16']) {
    g.clearSpawns();
    if (g.carried) g.dropCarried();
    g.clearSpawns();
    g.player.teleport(OX, 0, 0);
    const body = SPAWN[kind](g, new V(OX, 1.0, -1.0));
    for (let i = 0; i < 20; i++) await frame();
    g.pickUp(body);
    for (let i = 0; i < 30; i++) await frame();

    const hand = g.player.rig.byName.handR;
    const q = new (g.player.rig.rootQuat.constructor)();
    const origin = new V();
    gripWorld(hand, CARRY[kind].grip, q, origin);
    // where the fist closes, and where the weapon says its handle is
    const fist = FIST.center.clone().applyQuaternion(hand.worldQuat).add(hand.worldPos);
    const held = new V().fromArray(CARRY[kind].grip.hold).applyQuaternion(q).add(origin);
    // the nearest fingertip to the handle: a grip has the fingers ON it
    let near = 9;
    for (let i = 0; i < 4; i++) {
      const tip = g.player.rig.byName[`fingerR${i}B`].worldEnd;
      near = Math.min(near, tip.distanceTo(held));
    }
    /* And the other hand, for the things that take two. A support hand that
       is merely near the weapon is what makes a hold look wrong: it has to be
       ON the handguard, the haft, the foregrip, with its fingers closed. */
    let support = null;
    if (SUPPORT[kind]) {
      /* The sledgehammer's other hand grips wherever on the haft it can
         reach, so what is checked there is the distance to the haft ITSELF,
         not to one chosen spot on it. */
      const want = new V().fromArray(SUPPORT[kind]).applyQuaternion(q).add(origin);
      if (kind === 'sledge') {
        const lh = g.player.rig.byName.handL;
        const lf0 = FIST.center.clone().applyQuaternion(lh.worldQuat).add(lh.worldPos);
        const axis = new V(0, 1, 0).applyQuaternion(q);
        let best = 9, at = 0;
        for (let t = 0.20; t <= 0.60; t += 0.01) {
          const d = lf0.distanceTo(origin.clone().addScaledVector(axis, t));
          if (d < best) { best = d; at = t; }
        }
        want.copy(origin).addScaledVector(axis, at);
      }
      const lhand = g.player.rig.byName.handL;
      const lfist = FIST.center.clone().applyQuaternion(lhand.worldQuat).add(lhand.worldPos);
      let lnear = 9;
      for (let i = 0; i < 4; i++) {
        lnear = Math.min(lnear, g.player.rig.byName[`fingerL${i}B`].worldEnd.distanceTo(want));
      }
      support = { onIt: +lfist.distanceTo(want).toFixed(3), finger: +lnear.toFixed(3) };
    }
    out[kind] = {
      onFist: +held.distanceTo(fist).toFixed(4),
      inPalm: pointInBone(hand, held, 0),
      finger: +near.toFixed(3),
      model: +g.carried.model.position.distanceTo(origin).toFixed(4),
      support,
    };
  }
  g.dropCarried();
  g.clearSpawns();

  /* The RCV2 is not picked up - it is always in hand - but it is held the
     same way, and the pose that holds it is the one the player sees most. */
  {
    const { RCV2_GRIP, RCV2_FOREGRIP } = await import('/src/game/rcv2.js');
    g.setEquipped('rcv2');
    for (let i = 0; i < 40; i++) await frame();
    const hand = g.player.rig.byName.handR;
    const q = new (g.player.rig.rootQuat.constructor)();
    const origin = new V();
    gripWorld(hand, RCV2_GRIP, q, origin);
    const fist = FIST.center.clone().applyQuaternion(hand.worldQuat).add(hand.worldPos);
    const held = new V().fromArray(RCV2_GRIP.hold).applyQuaternion(q).add(origin);
    const want = new V().fromArray(RCV2_FOREGRIP).applyQuaternion(q).add(origin);
    const lhand = g.player.rig.byName.handL;
    const lfist = FIST.center.clone().applyQuaternion(lhand.worldQuat).add(lhand.worldPos);
    let lnear = 9;
    for (let i = 0; i < 4; i++) {
      lnear = Math.min(lnear, g.player.rig.byName[`fingerL${i}B`].worldEnd.distanceTo(want));
    }
    out.rcv2 = {
      onFist: +held.distanceTo(fist).toFixed(4),
      inPalm: pointInBone(hand, held, 0),
      finger: 0,
      model: +g.rcv2.model.position.distanceTo(origin).toFixed(4),
      support: { onIt: +lfist.distanceTo(want).toFixed(3), finger: +lnear.toFixed(3) },
    };
    g.setEquipped('fists');
  }
  return out;
});
check('every weapon is gripped: handle in the fist, fingers closed on it',
  Object.values(r).every((w) => w.onFist < 0.002 && w.inPalm === false
    && w.finger < 0.075 && w.model < 0.002
    && (!w.support || (w.support.onIt < 0.05 && w.support.finger < 0.09))),
  JSON.stringify(r));

// ---------- the two firearms ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;
  const V = g.player.pos.constructor;
  const frame = () => new Promise((res) => requestAnimationFrame(res));
  const { spawnCitizen } = await import('/src/game/citizen.js');
  const guns = await import('/src/game/guns.js');
  const out = {};
  for (const [kind, fn] of [['glock', 'spawnGlock'], ['ak47', 'spawnAk'], ['m16', 'spawnM16']]) {
    g.clearSpawns();
    if (g.carried) g.dropCarried();
    g.clearSpawns();
    g.player.heal();
    g.player.teleport(OX, 0, 0);
    g.camYaw = 0; g.camPitch = 0;
    const c = spawnCitizen(g, new V(OX, 0, -6));
    c.ai.update = () => c.moveInput.set(0, 0, 0);
    const body = guns[fn](g, new V(OX, 1.0, -1.0));
    for (let i = 0; i < 25; i++) await frame();
    g.useAction();                                  // USE picks it up
    for (let i = 0; i < 25; i++) await frame();
    const o = { carried: g.carried?.kind === kind, equipped: g.equipped,
      pose: g.player.animator.upper.clip?.name || null, full: g.carried?.ammo };

    // three rounds into a citizen six metres away
    const pitch0 = g.camPitch;
    const hp0 = c.health;
    let fired = 0, kick = 0;
    for (let i = 0; i < 3; i++) {
      if (g.fireGun()) fired++;
      kick = Math.max(kick, g.player.recoil);
      g.gunCooldown = 0;
      for (let k = 0; k < 4; k++) await frame();
    }
    o.fired = fired;
    o.spent = o.full - g.carried.ammo;
    o.damage = Math.round(hp0 - c.health);
    o.climb = +(g.camPitch - pitch0).toFixed(3);
    o.armKick = +kick.toFixed(2);
    o.flash = g.flash.life > 0 || g.flash.group.visible;
    o.cases = g.cases.cases.filter((x) => x.alive).length;

    // a partial reload, and then an empty one, which is a different clip
    g.carried.ammo = 4;
    g.reloadAction();
    o.reloadClip = g.player.animator.actionName;
    for (let k = 0; k < 400 && g.reloadTimer > 0; k++) await frame();
    o.afterReload = g.carried.ammo;
    g.carried.ammo = 0; g.carried.chambered = false;
    o.dryFire = g.fireGun();
    g.reloadAction();
    o.emptyClip = g.player.animator.actionName;
    for (let k = 0; k < 500 && g.reloadTimer > 0; k++) await frame();
    o.afterEmpty = g.carried.ammo;
    g.dropCarried();
    o.droppedAmmo = g.spawnedBodies.find((b) => b.tag === kind)?.userData.ammo;
    out[kind] = o;
  }
  g.clearSpawns();
  g.player.teleport(OX, 6, 0);
  return out;
});
check('the Glock, the AK and the M16 are picked up, fire, kick and reload',
  r.glock.carried && r.glock.pose === 'glockHold' && r.glock.full === 15 &&
  r.glock.fired === 3 && r.glock.spent === 3 && r.glock.damage > 40 &&
  r.glock.climb > 0.02 && r.glock.armKick > 0.1 && r.glock.cases === 3 &&
  r.glock.reloadClip === 'reloadPistol' && r.glock.afterReload === 15 &&
  r.glock.dryFire === false && r.glock.emptyClip === 'reloadPistolEmpty' &&
  r.glock.afterEmpty === 15 && r.glock.droppedAmmo === 15 &&
  r.ak47.carried && r.ak47.pose === 'akHold' && r.ak47.full === 30 &&
  r.ak47.fired === 3 && r.ak47.spent === 3 && r.ak47.damage > 60 &&
  r.ak47.climb > r.glock.climb && r.ak47.armKick > r.glock.armKick &&
  r.ak47.reloadClip === 'reloadRifle' && r.ak47.emptyClip === 'reloadRifleEmpty' &&
  r.ak47.afterEmpty === 30 &&
  r.m16.carried && r.m16.pose === 'm16Hold' && r.m16.full === 30 &&
  r.m16.fired === 3 && r.m16.spent === 3 && r.m16.damage > 60 &&
  r.m16.climb > 0.01 && r.m16.climb < r.ak47.climb && r.m16.armKick > 0.1 &&
  r.m16.reloadClip === 'reloadM16' && r.m16.emptyClip === 'reloadM16Empty' &&
  r.m16.afterEmpty === 30,
  JSON.stringify(r));

// ---------- one is a pistol, the other empties itself ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const app = window.GOREBOX;
  const OX = g.map.openArea.x;
  const V = g.player.pos.constructor;
  const guns = await import('/src/game/guns.js');
  const out = {};
  const held = {
    consumeLook: () => ({ x: 0, y: 0 }), move: { x: 0, y: 0 },
    pressed: {}, down: { primary: true }, beginFrame() {},
  };
  for (const [kind, fn] of [['glock', 'spawnGlock'], ['ak47', 'spawnAk'], ['m16', 'spawnM16']]) {
    if (g.carried) g.dropCarried();
    g.clearSpawns();
    g.player.teleport(OX, 0, 0);
    const b = guns[fn](g, new V(OX, 1.0, -1.0));
    await new Promise((res) => setTimeout(res, 400));
    g.pickUp(b);
    // Stepped by hand: a trigger held for exactly one second, whatever the
    // frame rate of the machine running this happens to be.
    app.state = 'paused'; g.paused = false;
    const start = g.carried.ammo;
    for (let i = 0; i < 60; i++) g.update(1 / 60, held);
    out[kind] = start - g.carried.ammo;
    app.state = 'playing';
  }
  if (g.carried) g.dropCarried();
  g.clearSpawns();
  return out;
});
check('holding the trigger empties both rifles and does nothing to the Glock',
  r.glock === 0 && r.ak47 >= 8 && r.ak47 <= 11 && r.m16 > r.ak47 && r.m16 <= 15,
  JSON.stringify(r));

// ---------- a body that has stopped moving, stops moving ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const app = window.GOREBOX;
  const OX = g.map.openArea.x;
  const V = g.player.pos.constructor;
  const { spawnCitizen } = await import('/src/game/citizen.js');
  g.clearSpawns();
  g.player.teleport(OX, 9, 0);
  // four of them, dropped into each other: a pile is where a ragdoll that
  // buzzes shows it, because every body is leaning on another one
  const cs = [];
  for (let i = 0; i < 4; i++) {
    const c = spawnCitizen(g, new V(OX + (i % 2) * 0.7 - 0.35, 0, (i > 1 ? 0.7 : 0) - 0.35));
    c.ai.update = () => c.moveInput.set(0, 0, 0);
    cs.push(c);
  }
  await new Promise((res) => setTimeout(res, 600));
  for (const c of cs) { c.balance = 0; c.wantsUp = false; c.setState('ragdoll'); }
  // Stepped by hand so this measures the physics, not the frame rate.
  app.state = 'paused'; g.paused = false;
  const stub = { consumeLook: () => ({ x: 0, y: 0 }), move: { x: 0, y: 0 },
    pressed: {}, down: {}, beginFrame() {} };
  for (let i = 0; i < 900; i++) g.update(1 / 60, stub);      // fifteen seconds

  /* How far each joint TRAVELS over the next five seconds, not how fast the
     busiest one happens to be going at one instant. A single substep's speed
     is a coin toss - catch a hand sliding off a shoulder and it reads ten
     times what the pile is really doing - whereas path length asks the
     question the check is named for: does this lie still? A body that buzzes
     covers a lot of ground without going anywhere, which is the difference
     between this and the drift below. */
  const keys = [];
  for (const c of cs) for (const n of Object.keys(c.particles)) keys.push([c, n]);
  const last = keys.map(([c, n]) => { const p = c.particles[n]; return [p.x, p.y, p.z]; });
  const start = last.map((a) => a.slice());
  const path = new Array(keys.length).fill(0);
  for (let i = 0; i < 300; i++) {
    g.update(1 / 60, stub);
    for (let k = 0; k < keys.length; k++) {
      const p = keys[k][0].particles[keys[k][1]], L = last[k];
      path[k] += Math.hypot(p.x - L[0], p.y - L[1], p.z - L[2]);
      L[0] = p.x; L[1] = p.y; L[2] = p.z;
    }
  }
  let worst = 0, worstName = '', drift = 0;
  for (let k = 0; k < keys.length; k++) {
    if (path[k] > worst) { worst = path[k]; worstName = keys[k][1]; }
    const p = keys[k][0].particles[keys[k][1]], S = start[k];
    drift = Math.max(drift, Math.hypot(p.x - S[0], p.y - S[1], p.z - S[2]));
  }
  app.state = 'playing';
  const flat = cs.map((c) => +(c.rig.byName.head.worldPos.y).toFixed(2));
  g.clearSpawns();
  g.player.teleport(OX, 6, 0);
  // path is over five seconds; report it per second, which is readable
  return { perSec: +(worst / 5).toFixed(3), worstName, drift: +drift.toFixed(3), heads: flat };
});
/* Two different faults, measured separately. `perSec` is the buzzing one:
   metres of travel per second by the busiest joint, and a body that vibrates
   racks that up without going anywhere. `drift` is the other one - a pile
   that slowly walks away from where it landed - and four people leaning on
   each other are entitled to spread a little as they settle. */
check('a settled pile of ragdolls lies still instead of buzzing',
  r.perSec < 0.18 && r.drift < 0.4 && r.heads.every((y) => y < 0.6),
  JSON.stringify(r));

// ---------- the body that is drawn is the body the physics has ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const app = window.GOREBOX;
  const OX = g.map.openArea.x;
  const V = g.player.pos.constructor;
  const { spawnCitizen } = await import('/src/game/citizen.js');
  const stub = { consumeLook: () => ({ x: 0, y: 0 }), move: { x: 0, y: 0 },
    pressed: {}, down: {}, beginFrame() {} };
  const D = 180 / Math.PI;
  const out = {};
  for (const way of ['collapse', 'punched']) {
    g.clearSpawns();
    g.player.teleport(OX, 9, 0);
    const cs = [];
    for (let i = 0; i < 3; i++) {
      const c = spawnCitizen(g, new V(OX + i * 1.5 - 1.5, 0, 0));
      c.ai.update = () => c.moveInput.set(0, 0, 0);
      cs.push(c);
    }
    await new Promise((res) => setTimeout(res, 500));
    for (const c of cs) {
      c.balance = 0; c.wantsUp = false;
      if (way === 'punched') {
        c.applyImpact(new V(c.center.x, c.center.y + 0.4, c.center.z), new V(0, 20, -140),
          { boneName: 'upperTorso', damage: 0, type: 'blunt', severity: 0.8 });
      }
      c.setState('ragdoll'); c.wantsUp = false;
    }
    app.state = 'paused'; g.paused = false;
    for (let i = 0; i < 600; i++) { g.update(1 / 60, stub); for (const c of cs) c.wantsUp = false; }
    /* Every limb is drawn pointing where its own two particles are. A bone
       whose rest rotation was left out of the physics pose came out pointing
       the opposite way - which is how a body ended up with its legs inside
       its chest while the physics of it was perfectly sensible. */
    let worst = 0, worstName = '';
    let torso = 0;
    for (const c of cs) {
      /* The four limb bones. A wrist, an ankle and a neck have narrow ranges
         that nothing limits in the physics, so the drawn pose is deliberately
         pulled back inside what those joints can do - there it is the pose
         that is wrong, not the drawing of it. An arm or a leg has no such
         excuse: it is drawn exactly where its own two particles are, or the
         body being drawn is not the body being simulated. */
      const LIMB = /^(upper|lower)(Arm|Leg)[RL]$/;
      for (const [name, pair] of Object.entries(c.boneParticles)) {
        if (!LIMB.test(name)) continue;
        const b = c.rig.byName[name];
        const a = c.particles[pair[0]], z = c.particles[pair[1]];
        const dir = new V(z.x - a.x, z.y - a.y, z.z - a.z);
        if (dir.lengthSq() < 1e-8) continue;
        const drawn = b.worldEnd.clone().sub(b.worldPos);
        const off = drawn.angleTo(dir) * D;
        if (off > worst) { worst = off; worstName = name; }
      }
      // and a body lying down is its own length, not folded into a ball
      const head = c.rig.byName.head.worldEnd;
      torso = Math.max(torso, head.distanceTo(c.rig.byName.footR.worldEnd),
        head.distanceTo(c.rig.byName.footL.worldEnd));
    }
    app.state = 'playing';
    out[way] = { worst: +worst.toFixed(1), worstName, span: +torso.toFixed(2) };
  }
  g.clearSpawns();
  g.player.teleport(OX, 6, 0);
  return out;
});
check('a ragdoll is drawn where its physics actually is',
  r.collapse.worst < 12 && r.punched.worst < 12 &&
  r.collapse.span > 1.1 && r.punched.span > 1.1, JSON.stringify(r));

// ---------- boulder actually rolls ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;   // clear of the platform in the middle
  g.clearSpawns();
  const V = g.player.pos.constructor;
  const { spawnBoulder } = await import('/src/game/objects.js');
  const b = spawnBoulder(g, new V(OX, 0.6, 0));
  b.vel.set(6, 0, 0); b.angVel.set(0,0,0); b.wake();
  let spin = 0;
  for (let i=0;i<120;i++){ await new Promise(r=>requestAnimationFrame(r)); spin = Math.max(spin, b.angVel.length()); }
  return { spin:+spin.toFixed(2), moved:+(b.pos.x - OX).toFixed(2) };
});
check('boulder rolls rather than slides', r.spin > 3 && r.moved > 2, JSON.stringify(r));

// ---------- the light vest soaks hits until it gives out ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;
  const V = g.player.pos.constructor;
  const frame = () => new Promise((res) => requestAnimationFrame(res));
  const { spawnVest, VEST } = await import('/src/game/armour.js');
  g.clearSpawns();
  if (g.carried) g.dropCarried();
  if (g.player.armour) g.dropArmour();
  g.clearSpawns();
  g.player.teleport(OX, 0, 0); g.camYaw = 0; g.camPitch = 0;
  g.player.heal();
  spawnVest(g, new V(OX, 1.0, -1.0));
  for (let i = 0; i < 25; i++) await frame();
  const offered = document.querySelector('#btn-use').textContent;
  g.useAction();
  for (let i = 0; i < 10; i++) await frame();
  const worn = {
    on: !!g.player.armour, hp: g.player.armour?.hp,
    drawn: g.player.armour?.model.parent === g.scene,
    bar: !document.querySelector('#armour-wrap').classList.contains('hidden'),
  };
  /* Health is topped back up between hits rather than healed, because
     healing repairs the vest too - which is the point of the last check
     below, and would quietly ruin every one before it. */
  const hit = (n, bone) => {
    const b = g.player.rig.byName[bone];
    g.player.health = 100; g.player.dead = false;
    g.player.applyDamage(n, { boneName: bone, point: b.worldPos.clone(), type: 'impact', severity: 0.5 });
    return +(100 - g.player.health).toFixed(1);
  };
  // three at the chest: the vest should take nearly all of it
  const chest = [hit(24, 'upperTorso'), hit(24, 'upperTorso'), hit(24, 'upperTorso')];
  const leg = hit(18, 'upperLegR');           // not covered, so it all lands
  // beaten until it has nothing left, and then it stops helping
  let swings = 0;
  while (g.player.armour && !g.player.armour.spent && swings < 40) { hit(24, 'upperTorso'); swings++; }
  const past = hit(24, 'upperTorso');
  // ...and a full heal puts a fresh one on
  g.player.heal();
  const afterHeal = g.player.armour?.hp;
  // taking it off puts it back on the ground, as worn as it was
  g.dropArmour();
  for (let i = 0; i < 10; i++) await frame();
  const dropped = g.spawnedBodies.find((b) => b.tag === 'vest');
  const out = {
    offered, worn, chest, leg, past, swings,
    afterHeal, capacity: VEST.hp,
    off: !g.player.armour,
    dropped: !!dropped, droppedHp: dropped?.userData.armourHp,
    barGone: document.querySelector('#armour-wrap').classList.contains('hidden'),
  };
  g.clearSpawns();
  g.player.heal();
  return out;
});
check('the light vest is worn, soaks the chest and then gives out',
  r.offered === 'WEAR' && r.worn.on && r.worn.drawn && r.worn.bar &&
  r.worn.hp === r.capacity &&
  r.chest.every((d) => d < 6) && r.leg > 16 && r.past > 20 &&
  r.swings >= 1 && r.swings < 40 &&
  r.afterHeal === r.capacity && r.off && r.dropped && r.barGone,
  JSON.stringify(r));

// ---------- a part that takes too much comes off ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const OX = g.map.openArea.x;
  const V = g.player.pos.constructor;
  const { spawnCitizen } = await import('/src/game/citizen.js');
  const frame = () => new Promise((res) => requestAnimationFrame(res));
  const out = {};
  for (const [tag, which, blow] of [['arm', 'lowerArmR', 60], ['head', 'head', 70],
    ['chip', 'lowerLegL', 9]]) {
    g.clearSpawns();
    g.player.teleport(OX, 8, 0);
    const c = spawnCitizen(g, new V(OX, 0, 0));
    c.ai.update = () => c.moveInput.set(0, 0, 0);
    await new Promise((res) => setTimeout(res, 400));
    const before = {
      particles: g.world.particles.length,
      constraints: g.world.constraints.length,
      pairs: c.selfCollisionPairs.length,
      mass: c.totalMass,
    };
    const bone = c.rig.byName[which];
    const at = bone.worldPos.clone();
    /* `chip` is the control: small hits, over and over. It has to take a lot
       more of them than one big one, but it must get there in the end. */
    const hits = blow >= 40 ? 1 : 14;
    for (let i = 0; i < hits; i++) {
      c.applyImpact(at, new V(0, 8, -90), { boneName: which, damage: blow,
        type: 'impact', severity: 0.9, crush: 0.6 });
      for (let k = 0; k < 2; k++) await frame();
    }
    for (let i = 0; i < 120; i++) await frame();
    const finite = c.particleList.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    let worst = 0;
    for (const p of c.particleList) {
      worst = Math.max(worst, Math.hypot(p.x - p.px, p.y - p.py, p.z - p.pz) / g.world.substepDt);
    }
    out[tag] = {
      gone: c.gone.has(which),
      detached: c.body.isDetached(which),
      stump: bone.parent && !c.gone.has(bone.parent.name),
      shed: before.particles - g.world.particles.length,
      cons: before.constraints - g.world.constraints.length,
      pairs: before.pairs - c.selfCollisionPairs.length,
      lighter: +(before.mass - c.totalMass).toFixed(1),
      debris: g.gore.debris.length,
      dead: c.dead, finite, worst: +worst.toFixed(2),
      splats: g.gore.stats.splats > 0,
    };
    g.clearSpawns();
  }
  g.player.heal();
  return out;
});
check('a limb that takes too much comes off, and the body still works',
  r.arm.gone && r.arm.detached && r.arm.stump && r.arm.shed >= 2 && r.arm.cons > 0 &&
  r.arm.pairs > 0 && r.arm.lighter > 1 && r.arm.debris > 0 &&
  r.arm.finite && r.arm.worst < 20 && r.arm.splats,
  JSON.stringify(r.arm));
check('taking the head off kills, and enough small hits do it too',
  r.head.gone && r.head.dead && r.head.finite &&
  r.chip.gone && r.chip.detached && r.chip.finite && r.chip.worst < 20,
  JSON.stringify({ head: r.head, chip: r.chip }));

// ---------- the full screen button ----------
r = await page.evaluate(async () => {
  const { canFullscreen, isFullscreen } = await import('/src/core/fullscreen.js');
  const hud = document.querySelector('#btn-fullscreen');
  const pause = document.querySelector('#btn-fullscreen-pause');
  return {
    hud: !!hud, pause: !!pause,
    supported: canFullscreen(),
    // headless chromium can do it, so the buttons must not be hidden
    hudShown: hud && hud.style.display !== 'none',
    pauseShown: pause && pause.style.display !== 'none',
    label: pause && pause.textContent,
    already: isFullscreen(),
  };
});
check('there is a full screen button, and this browser can use it',
  r.hud && r.pause && r.supported && r.hudShown && r.pauseShown &&
  r.label === 'FULL SCREEN', JSON.stringify(r));

await h.showHud();
await ev(() => { const g=window.GOREBOX.game; g.clearSpawns(); g.debugCam=null; g.setEquipped('fists'); g.player.teleport(g.map.openArea.x, 6, 0); });
await page.waitForTimeout(800);
await shot('gameplay');
console.log('\n=== LOGS ==='); console.log(logs.slice(0,15).join('\n')||'(none)');
console.log(fail.length ? '\nFAILURES: ' + fail.join(', ') : '\nAll checks passed.');
await close();
process.exit(fail.length ? 1 : 0);
