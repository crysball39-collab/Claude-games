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
  g.player.teleport(0, 6, 0);
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
  g.clearSpawns();
  g.player.teleport(16, 16, 0);          // out of the way of the test subject
  const V = g.player.pos.constructor;
  const { spawnCrate } = await import('/src/game/objects.js');
  for (let i = -3; i <= 3; i++) {
    spawnCrate(g, new V(i * 0.72, 0.4, 0), { size: 0.72 });
    spawnCrate(g, new V(i * 0.72, 1.1, 0), { size: 0.72 });
  }
  g.nav.rebuild(g.world, { groundY: 0 });
  const { spawnCitizen } = await import('/src/game/citizen.js');
  const c = spawnCitizen(g, new V(0, 0, 5));
  c.ai._setState('wander'); c.ai.hasGoal = true; c.ai.goal.set(0, 0, -5); c.ai.repathTimer = 0;
  const start = c.pos.z;
  let best = start;
  for (let i=0;i<420;i++){ await new Promise(r=>requestAnimationFrame(r)); best = Math.min(best, c.pos.z); }
  return { start:+start.toFixed(1), end:+best.toFixed(1), x:+c.pos.x.toFixed(1), pathLen: c.ai.path.length, state:c.ai.state };
});
check('citizen paths around a crate wall', r.end < 1.0, JSON.stringify(r));

// ---------- RCV2 grab and carry ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  g.clearSpawns();
  g.player.teleport(0, 4, 0); g.camYaw = 0; g.camPitch = 0;
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
  g.clearSpawns();
  g.player.teleport(0, 4, 0); g.camYaw = 0; g.camPitch = 0;
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
  g.clearSpawns();
  g.setSelected('boulder'); g.player.teleport(0, 4, 0); g.camYaw = 0; g.camPitch = 0;
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
  g.clearSpawns();
  const V = g.player.pos.constructor;
  const { spawnCitizen } = await import('/src/game/citizen.js');
  const c = spawnCitizen(g, new V(0, 0, 0));
  await window.settle(() => c.grounded);
  g.setEquipped('fists');
  c.ai.update = () => { c.moveInput.set(0, 0, 0); };
  c.health = 100; c.balance = 1; c.setState('controlled');
  c.teleport(0, 0, Math.PI);
  g.player.teleport(0, 3, 0); g.camYaw = 0; g.camPitch = 0;
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
  // Its own subject, so this check does not inherit whatever the last one did.
  g.clearSpawns();
  const V = g.player.pos.constructor;
  const { spawnCitizen } = await import('/src/game/citizen.js');
  const c = spawnCitizen(g, new V(0, 0, 0));
  await window.settle(() => c.grounded);
  g.setEquipped('fists');
  c.ai.update = () => { c.moveInput.set(0, 0, 0); };
  const start = c.health;
  let landed = 0, swings = 0;
  for (let i = 0; i < 26 && !c.dead; i++) {
    // Put the target back on its feet each round: this is a damage test, not
    // a test of what happens to a body already on the floor.
    if (c.state !== 'controlled') { c.balance = 1; c.setState('controlled'); }
    c.teleport(0, 0, Math.PI);
    g.player.teleport(0, 0.62, 0); g.camYaw = 0; g.camPitch = 0.02;
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
  g.clearSpawns();
  const V = g.player.pos.constructor;
  const { spawnCitizen } = await import('/src/game/citizen.js');
  const c = spawnCitizen(g, new V(0, 0, 0));
  await window.settle(() => c.grounded);
  g.respawnPlayer();
  g.player.teleport(0, 0.7, 0);
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
    g.clearSpawns();
    g.player.balance = 1;
    g.player.setState('controlled');
    g.player.teleport(0, 0, 0);
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
  r = await ev((f) => {
    const p = window.GOREBOX.game.player;
    return { moved: +Math.hypot(p.pos.x - f.x, p.pos.z - f.z).toFixed(2) };
  }, from);
  await grip.release();
  r.held = held;
  check('the joystick moves you', Math.abs(held.z) > 0.5 && r.moved > 1.5, JSON.stringify(r));
}

// ---------- nothing gets launched into orbit ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const V = g.player.pos.constructor;
  const { spawnCitizen } = await import('/src/game/citizen.js');
  const { spawnBoulder } = await import('/src/game/objects.js');
  g.clearSpawns();
  const cs = [];
  for (let i = 0; i < 3; i++) cs.push(spawnCitizen(g, new V(i * 1.5 - 1.5, 0, 0)));
  await new Promise((res) => setTimeout(res, 500));
  cs.forEach((c, i) => { c.ai.update = () => { c.moveInput.set(0, 0, 0); }; c.teleport(i * 1.5 - 1.5, 0, Math.PI); });
  g.player.teleport(0, 8, 0);
  await new Promise((res) => setTimeout(res, 300));

  // a hard jab each, then a boulder straight through them
  cs.forEach((c) => {
    const b = c.rig.byName.upperTorso;
    c.applyImpact(new V(b.worldPos.x, b.worldPos.y, b.worldPos.z + 0.1), new V(0, 7, -130),
      { boneName: b.name, damage: 12, type: 'blunt' });
  });
  const rock = spawnBoulder(g, new V(-7, 0.6, 0.1));
  rock.vel.set(16, 0, 0); rock.wake();

  let peak = 0, high = 0;
  for (let f = 0; f < 260; f++) {
    await new Promise((res) => requestAnimationFrame(res));
    for (const c of cs) {
      for (const p of c.particleList) {
        peak = Math.max(peak, Math.hypot(p.x - p.px, p.y - p.py, p.z - p.pz) * 90);
        high = Math.max(high, p.y);
      }
    }
  }
  return {
    peakSpeed: +peak.toFixed(1), maxHeight: +high.toFixed(2),
    finite: cs.every((c) => Number.isFinite(c.pos.x) && Number.isFinite(c.pos.y)),
  };
});
check('ragdolls take a hit without being launched',
  r.finite && r.peakSpeed < 14 && r.maxHeight < 3, JSON.stringify(r));

// ---------- the machete: pick it up, swing it, put it down ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  const V = g.player.pos.constructor;
  const { spawnCitizen } = await import('/src/game/citizen.js');
  g.clearSpawns();
  g.player.teleport(0, 3, 0); g.camYaw = 0; g.camPitch = -0.2;
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
  g.useAction();                                  // USE picks it up
  const carried = !!g.carried && g.equipped === 'machete';

  const c = spawnCitizen(g, new V(0, 0, 0));
  await new Promise((res) => setTimeout(res, 400));
  c.ai.update = () => { c.moveInput.set(0, 0, 0); };
  const clips = []; let bled = false;
  const startHp = c.health;
  const frame = () => new Promise((res) => requestAnimationFrame(res));
  for (let i = 0; i < 5 && !c.dead; i++) {
    if (c.state !== 'controlled') { c.balance = 1; c.setState('controlled'); }
    c.teleport(0, 0, Math.PI);
    g.player.teleport(0, 0.85, 0); g.camYaw = 0; g.camPitch = 0.02;
    for (let k = 0; k < 6; k++) await frame();
    g.player.punchCooldown = 0; g.player.animator.cancelAction();
    if (!g.player.slash()) continue;
    clips.push(g.player.animator.actionName);
    for (let k = 0; k < 240 && g.player.animator.actionActive; k++) await frame();
  }
  const damage = Math.round(startHp - c.health);
  for (const [, e] of c.body.entries) {
    if (e.skin.surface && e.skin.surface.bloodAmount > 0) bled = true;
  }
  g.useAction();                                  // USE puts it back down
  return {
    carried, useOffered, clips, damage, bled,
    dropped: !g.carried && g.spawnedBodies.some((b) => b.tag === 'machete'),
    equippedAfter: g.equipped,
  };
});
check('the machete can be picked up, swung and dropped',
  r.carried && r.useOffered && r.damage > 30 && r.bled && r.dropped &&
  r.clips.includes('slashR') && r.clips.includes('slashL'), JSON.stringify(r));

// ---------- boulder actually rolls ----------
r = await page.evaluate(async () => {
  const g = window.GOREBOX.game;
  g.clearSpawns();
  const V = g.player.pos.constructor;
  const { spawnBoulder } = await import('/src/game/objects.js');
  const b = spawnBoulder(g, new V(0, 0.6, 0));
  b.vel.set(6, 0, 0); b.angVel.set(0,0,0); b.wake();
  let spin = 0;
  for (let i=0;i<120;i++){ await new Promise(r=>requestAnimationFrame(r)); spin = Math.max(spin, b.angVel.length()); }
  return { spin:+spin.toFixed(2), moved:+b.pos.x.toFixed(2) };
});
check('boulder rolls rather than slides', r.spin > 3 && r.moved > 2, JSON.stringify(r));

await h.showHud();
await ev(() => { const g=window.GOREBOX.game; g.clearSpawns(); g.debugCam=null; g.setEquipped('fists'); g.player.teleport(0,6,0); });
await page.waitForTimeout(800);
await shot('gameplay');
console.log('\n=== LOGS ==='); console.log(logs.slice(0,15).join('\n')||'(none)');
console.log(fail.length ? '\nFAILURES: ' + fail.join(', ') : '\nAll checks passed.');
await close();
process.exit(fail.length ? 1 : 0);
