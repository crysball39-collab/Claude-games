/* =============================================================================
   AI play mode. Hands the controls to the autopilot and checks that it plays:
   gears up, fights, uses the RCV2, finds both Easter eggs, and fights both
   bosses - dodging what they throw at it better than standing still does.

     node tools/verify-ai.mjs
   ========================================================================== */
import { boot } from './harness.mjs';
const h = await boot({ width: 960, height: 500, touch: true });
const { page, logs, close, shot } = h;
const fail = [];
const check = (name, ok, extra = '') => {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  ' + extra : ''));
  if (!ok) fail.push(name);
};

await page.evaluate(() => {
  /* The AI drives the game a fixed sixtieth of a second at a time, with the
     real loop held off, so the test runs as fast as the machine allows. */
  window.aiRun = (n, stop) => {
    const app = window.GOREBOX;
    app.state = 'paused';
    const g = app.game; g.paused = false;
    let i = 0;
    for (; i < n; i++) {
      if (app.game !== g || g.travelling) break;
      const inp = app.ai.update(1 / 60);
      g.update(1 / 60, inp);
      if (i % 40 === 0) g.render();
      if (stop && stop(g, app.ai)) { i++; break; }
    }
    return i;
  };
  window.arrive = async () => {
    const app = window.GOREBOX;
    for (let i = 0; i < 3000; i++) {
      if (app.state === 'playing' && app.game?.running && !app.game.travelling) return app.game.map.id;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  };
  window.worn = () => {
    const p = window.GOREBOX.game.player;
    return Object.values(p.worn).filter(Boolean).map((a) => a.kind).sort().join('+');
  };
});

/** Runs the AI for up to `budget` steps, following it across map changes. */
async function drive(budget, stopSrc = null, onMap = null) {
  let used = 0;
  const maps = [];
  while (used < budget) {
    const n = await page.evaluate(([s, src]) => window.aiRun(s, src ? new Function('g', 'ai', src) : null),
      [Math.min(600, budget - used), stopSrc]);
    used += n;
    const st = await page.evaluate((src) => {
      const app = window.GOREBOX, g = app.game;
      return { travelling: !g || g.travelling, stop: src && g ? !!new Function('g', 'ai', src)(g, app.ai) : false };
    }, stopSrc);
    if (st.stop) break;
    if (st.travelling) {
      const id = await page.evaluate(() => window.arrive());
      maps.push(id);
      if (onMap) await onMap(id);
      if (stopSrc && await page.evaluate((src) => !!new Function('g', 'ai', src)(window.GOREBOX.game, window.GOREBOX.ai), stopSrc)) break;
    }
  }
  return { used, maps };
}

// ---------------------------------------------------------------- the switch
let r = await page.evaluate(async () => {
  const app = window.GOREBOX;
  const btn = document.querySelector('#btn-ai');
  btn.click();
  await new Promise((res) => setTimeout(res, 60));
  const on = { enabled: app.ai.enabled, btnOn: btn.classList.contains('on'),
    chatShown: !document.querySelector('#ai-chat').classList.contains('hidden'),
    lines: document.querySelectorAll('#ai-chat .ai-line').length,
    menuBtn: !!document.querySelector('#btn-aiplay'), pauseBtn: document.querySelector('#btn-ai-pause').textContent };
  btn.click();
  await new Promise((res) => setTimeout(res, 60));
  on.offAgain = !app.ai.enabled && document.querySelector('#ai-chat').classList.contains('hidden');
  // the keyboard: I
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI' }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyI' }));
  on.keyOn = app.ai.enabled;
  return on;
});
check('AI button turns AI play on, shows the chat, and turns it off again',
  r.enabled && r.btnOn && r.chatShown && r.lines >= 1 && r.offAgain && r.menuBtn && r.pauseBtn === 'AI PLAY: ON',
  JSON.stringify(r));
check('I on the keyboard toggles AI play', r.keyOn, JSON.stringify(r));

// it moves and looks about on its own, through the controls
r = await page.evaluate(() => {
  const app = window.GOREBOX, g = app.game, p = g.player;
  g.clearSpawns(); p.heal();
  p.teleport(0, 20, 0);
  const x0 = p.pos.x, z0 = p.pos.z, yaw0 = g.camYaw;
  app.ai.task = null; app.ai.startActivity('explore');
  let turned = 0, last = g.camYaw;
  window.aiRun(900, () => { turned += Math.abs(g.camYaw - last); last = g.camYaw; return false; });
  void yaw0;
  return { moved: +Math.hypot(p.pos.x - x0, p.pos.z - z0).toFixed(1), turned: +turned.toFixed(2),
    task: app.ai.taskName };
});
check('AI walks and turns the camera by itself', r.moved > 4 && r.turned > 0.2, JSON.stringify(r));

// ------------------------------------------------------------------ gearing up
r = await page.evaluate(() => {
  const app = window.GOREBOX, g = app.game, p = g.player, ai = app.ai;
  g.clearSpawns(); p.heal();
  p.teleport(g.map.openArea.x, g.map.openArea.z, 0);
  ai._start('arm', ai.armUp({ gun: 'ak47' }));
  const n = window.aiRun(3600, () => !ai.task);
  return { steps: n, worn: window.worn(), carried: g.carried?.kind, equipped: g.equipped,
    ammo: g.carried?.ammo, spawnedLeft: g.spawnedBodies.length };
});
check('AI gears up: Medium Vest, neck armour and helmet worn, AK-47 in hand',
  r.worn === 'helmet+mvest+neckguard' && r.carried === 'ak47' && r.equipped === 'ak47' && r.ammo === 30,
  JSON.stringify(r));

// ------------------------------------------------------------------ the horde
r = await page.evaluate(() => {
  const app = window.GOREBOX, g = app.game, p = g.player, ai = app.ai;
  p.heal();
  const k0 = ai.stats.kills;
  ai.task = null; ai.startActivity('horde');
  let shots = 0, reloads = 0;
  const n = window.aiRun(4800, () => {
    if (ai.input.down.primary || ai.input.pressed.primary) shots++;
    if (ai.input.pressed.reload) reloads++;
    return !ai.task;
  });
  const left = g.characters.filter((c) => c.isZombie && !c.dead).length;
  return { steps: n, kills: ai.stats.kills - k0, mutantsLeft: left, shots, reloads, hp: Math.round(p.health), dead: p.dead };
});
check('AI spawns a Mutant horde and shoots them all down', r.kills >= 3 && r.mutantsLeft === 0 && r.shots > 10,
  JSON.stringify(r));

// ------------------------------------------------------------------ the RCV2
r = await page.evaluate(() => {
  const app = window.GOREBOX, g = app.game, p = g.player, ai = app.ai;
  g.clearSpawns(); p.heal();
  p.teleport(g.map.openArea.x, g.map.openArea.z, 0);
  ai.task = null;
  ai._start('rcv', (function* () { yield* ai.rcvPlay(); yield* ai.cleanup(); })());
  let held = false, maxThings = 0, deletes = 0;
  const n = window.aiRun(5400, () => {
    if (g.rcv2.holding) held = true;
    if (ai.input.pressed.delete) deletes++;
    maxThings = Math.max(maxThings, g.spawnedBodies.length);
    return !ai.task;
  });
  return { steps: n, held, maxThings, deletes, left: g.spawnedBodies.length };
});
check('AI spawns things, grabs and throws them with the RCV2, then deletes them',
  r.held && r.maxThings >= 3 && r.deletes >= 3 && r.left === 0, JSON.stringify(r));

// ---------------------------------------------------------------- who to fight
r = await page.evaluate(async () => {
  const app = window.GOREBOX, g = app.game, p = g.player, ai = app.ai;
  g.clearSpawns();
  const { spawnOfficer } = await import('/src/game/officer.js');
  const { spawnCitizen } = await import('/src/game/citizen.js');
  const V = p.pos.constructor;
  const o = spawnOfficer(g, new V(p.pos.x + 3, 0, p.pos.z));
  const c = spawnCitizen(g, new V(p.pos.x - 3, 0, p.pos.z));
  const calm = ai._isThreat(o) || ai._isThreat(c);
  o.ai.provoke(p);
  const officer = ai._isThreat(o);
  c.ai._setState('fight'); c.ai.threat = p;
  const citizen = ai._isThreat(c);
  g.clearSpawns();
  return { calm, officer, citizen };
});
check('AI knows who is a threat: a provoked Officer, a citizen fighting it - not calm ones',
  !r.calm && r.officer && r.citizen, JSON.stringify(r));

// ---------------------------------------------------- talking to it, offline
r = await page.evaluate(() => {
  const app = window.GOREBOX, g = app.game, p = g.player, ai = app.ai;
  g.clearSpawns(); p.heal();
  p.teleport(g.map.openArea.x, g.map.openArea.z, 0);
  ai.task = null;
  ai.tell('use the shotgun on some mutants');
  window.aiRun(3000, () => g.carried?.kind === 'mossberg');
  const lines = [...document.querySelectorAll('#ai-chat .ai-line')].map((e) => e.textContent);
  return { carried: g.carried?.kind, task: ai.taskName, you: lines.some((l) => l.startsWith('YOU')),
    ack: lines.some((l) => /On it|Sure thing|You got it|doing that/.test(l)), lines: lines.slice(-3) };
});
check('offline, it still does what you type: "use the shotgun" gets the Mossberg out',
  r.carried === 'mossberg' && r.you && r.ack, JSON.stringify(r));

// ------------------------------------------- thinking with Claude (mocked API)
/* No real key here: the Claude API is stood in for at the network, which
   checks what the game sends and that it acts on what comes back. */
const sent = [];
await page.context().route('https://api.anthropic.com/**', async (route) => {
  const q = route.request();
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
  if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  const body = JSON.parse(q.postData() || '{}');
  sent.push({ headers: q.headers(), body });
  const asked = /fight Silva/i.test(body.messages?.[0]?.content || '');
  route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({
    id: 'msg_mock', type: 'message', role: 'assistant', model: body.model,
    content: [
      { type: 'thinking', thinking: asked ? 'The viewer wants Silva. Pit Valley first, then the red RCV2.' : 'Quiet for now.', signature: 'x' },
      { type: 'text', text: JSON.stringify(asked
        ? { say: 'Silva? Love that idea. Off to Pit Valley.', intent: 'go fight Silva', action: 'fight_silva', now: true }
        : { say: '', intent: 'keep going', action: 'continue', now: false }) },
    ],
    stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 60 },
  }) });
});
await page.evaluate(() => { localStorage.setItem('gorebox.aikey', 'sk-ant-mock'); });
await page.evaluate(() => window.GOREBOX.ai.tell('go fight Silva'));
for (let i = 0; i < 40; i++) {
  const done = await page.evaluate(() => {
    window.aiRun(20);
    return window.GOREBOX.ai.goal === 'silva';
  });
  if (done) break;
  await page.waitForTimeout(150);
}
r = await page.evaluate(() => {
  const lines = [...document.querySelectorAll('#ai-chat .ai-line')].map((e) => e.textContent);
  return { goal: window.GOREBOX.ai.goal, thought: lines.some((l) => l.startsWith('AI thinks') && /Silva/.test(l)),
    said: lines.some((l) => /Love that idea/.test(l)), badge: document.querySelector('#ai-chat-mode').textContent };
});
const q0 = sent.find((x) => /fight Silva/i.test(x.body.messages?.[0]?.content || '')) || sent[0] || { headers: {}, body: {} };
const shape = {
  calls: sent.length, model: q0.body.model, thinking: q0.body.thinking?.type, display: q0.body.thinking?.display,
  format: q0.body.output_config?.format?.type, effort: q0.body.output_config?.effort, fallbacks: q0.body.fallbacks,
  beta: q0.headers['anthropic-beta'], key: q0.headers['x-api-key'], cached: q0.body.system?.[0]?.cache_control?.type,
  hasState: /Map: Plains/.test(q0.body.messages?.[0]?.content || ''),
};
check('with a key, it asks Claude (Opus 5.5, adaptive thinking, JSON out, fallbacks, cached system prompt)',
  shape.calls >= 1 && shape.model === 'claude-opus-5-5' && shape.thinking === 'adaptive' && shape.display === 'summarized' &&
  shape.format === 'json_schema' && shape.fallbacks === 'default' && shape.beta === 'server-side-fallback-2026-07-01' &&
  shape.key === 'sk-ant-mock' && shape.cached === 'ephemeral' && shape.hasState, JSON.stringify(shape));
check('Claude\'s thinking and words show in the chat, and it acts on what it decided',
  r.goal === 'silva' && r.thought && r.said, JSON.stringify(r));
// back offline for the rest
await page.evaluate(() => { localStorage.removeItem('gorebox.aikey'); });
await page.context().unroute('https://api.anthropic.com/**');

// ------------------------------------------------------------ the Silva run
r = await page.evaluate(() => {
  const app = window.GOREBOX, g = app.game, p = g.player, ai = app.ai;
  g.clearSpawns(); p.heal();
  ai.task = null; ai.startActivity('silva');
  return { goal: ai.goal };
});
let fightStart = null;
let run = await drive(16000, "return g.encounter && g.encounter.state === 'fight'");
r = await page.evaluate(() => {
  const app = window.GOREBOX, g = app.game;
  return { map: g.map.id, enc: g.encounter?.state, worn: window.worn() };
});
fightStart = r;
check('AI goes to Pit Valley, touches the red RCV2, and reaches Red Plains',
  run.maps.includes('pitvalley') && r.map === 'redplains', JSON.stringify({ maps: run.maps, ...r }));
check('AI gears up before touching the fire, and the Silva fight starts', r.enc === 'fight' &&
  r.worn === 'helmet+mvest+neckguard', JSON.stringify(r));
r = await page.evaluate(() => {
  const app = window.GOREBOX, g = app.game, ai = app.ai;
  window.aiRun(900, () => !!g.carried);
  return { carried: g.carried?.kind, hp: g.encounter.boss.hp };
});
check('AI has a gun in hand early in the fight (picks up the one it put down)', !!r.carried, JSON.stringify(r));
await shot('ai-silva-fight');
run = await drive(30000, "return !g.encounter || g.encounter.state !== 'fight'");
r = await page.evaluate(() => {
  const app = window.GOREBOX, g = app.game, ai = app.ai;
  return { map: g.map.id, enc: g.encounter?.state, deaths: ai.stats.deaths, silva: ai.stats.silva,
    boss: g.encounter?.boss ? Math.round(g.encounter.boss.hp) : null };
});
check('AI kills Silva', r.enc === 'won' || r.enc === 'claimed' || r.map === 'pitvalley',
  JSON.stringify(r));
// and takes the reward
run = await drive(4000, "return g.map.id === 'pitvalley'");
r = await page.evaluate(async () => {
  const { isUnlocked } = await import('/src/game/progress.js');
  return { map: window.GOREBOX.game.map.id, firefist: isUnlocked('firefist'), goal: window.GOREBOX.ai.goal };
});
check('AI takes the red RCV2 Silva leaves: Fire Fist unlocked, back in Pit Valley',
  r.map === 'pitvalley' && r.firefist && r.goal === null, JSON.stringify(r));

// ------------------------------------------------------------ the Shadow run
r = await page.evaluate(() => {
  const app = window.GOREBOX, g = app.game, ai = app.ai;
  g.player.heal();
  ai.task = null; ai.startActivity('shadow');
  return { goal: ai.goal };
});
run = await drive(20000, "return g.encounter && g.encounter.state === 'fight'");
r = await page.evaluate(() => {
  const app = window.GOREBOX, g = app.game;
  return { map: g.map.id, enc: g.encounter?.state, worn: window.worn(), carried: g.carried?.kind };
});
check('AI goes to Legacy, dives to the bent grate, and comes out in Dark Legacy',
  run.maps.includes('legacy') && r.map === 'darklegacy', JSON.stringify({ maps: run.maps, ...r }));
check('AI gears up, walks past the tower, and the Shadow Mutant fight starts',
  r.enc === 'fight' && r.worn === 'helmet+mvest+neckguard' && !!r.carried, JSON.stringify(r));
await shot('ai-shadow-fight');

// --- the dodge drill: the same attack, over and over, AI against standing still
async function drill(kind, reps, withAi) {
  return page.evaluate(([kind, reps, withAi]) => {
    const app = window.GOREBOX, g = app.game, p = g.player, ai = app.ai, b = g.encounter.boss;
    const stub = { consumeLook: () => ({ x: 0, y: 0 }), move: { x: 0, y: 0 }, pressed: {}, down: {} };
    app.state = 'paused'; g.paused = false;
    let hits = 0, done = 0, t = 0, active = false;
    p.heal();
    p.teleport(25, 18, Math.PI);
    b.pos.set(25, b.pos.y, 29); b.vel.set(0, 0, 0);
    b.hp = b.maxHp;
    for (const m of [...b.minions]) g.removeCharacter(m);
    b.minions.length = 0;
    let hp = p.health;
    for (let i = 0; i < 60 * 60 && done < reps; i++) {
      // the attack it is being drilled on, whenever he is ready for one
      if (!active && (b.state === 'chase' || b.state === 'idle' || b.state === 'recover') && t > 0.4) {
        const d = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
        if (kind !== 'slam' || d < 11) { b._start(kind); active = true; }
      }
      if (active && !(b.state === kind)) { active = false; done++; t = 0; p.heal(); hp = p.health; }
      t += 1 / 60;
      for (const k of Object.keys(b.cooldown)) b.cooldown[k] = 99;     // nothing else
      const inp = withAi ? ai.update(1 / 60) : stub;
      if (!withAi) { stub.pressed = {}; }
      g.update(1 / 60, inp);
      if (p.health < hp - 0.5) { hits++; }
      hp = p.health;
      if (p.dead) { g.respawnPlayer(); p.heal(); hp = p.health; }
      if (i % 60 === 0) g.render();
    }
    return { hits, done };
  }, [kind, reps, withAi]);
}
const shadowDrill = {};
for (const kind of ['spikes', 'stab', 'barrage', 'slam']) {
  const still = await drill(kind, 3, false);
  const ai = await drill(kind, 3, true);
  shadowDrill[kind] = { still, ai };
  check(`AI dodges the Shadow Mutant's ${kind} better than standing still`,
    ai.done >= 2 && ai.hits < still.hits, JSON.stringify({ still, ai }));
}

// and the rest of the fight, for real
await page.evaluate(() => {
  const g = window.GOREBOX.game, b = g.encounter.boss;
  b.cooldown = { spikes: 2, stab: 1.5, barrage: 6, summon: 3, slam: 7 };
  window.GOREBOX.ai.task = null;
});
run = await drive(40000, "return !g.encounter || g.encounter.state !== 'fight'");
// a moment after, for it to say so
await page.evaluate(() => window.aiRun(150));
r = await page.evaluate(() => {
  const app = window.GOREBOX, g = app.game, ai = app.ai;
  return { map: g.map.id, enc: g.encounter?.state, deaths: ai.stats.deaths, shadow: ai.stats.shadow,
    boss: g.encounter?.boss ? Math.round(g.encounter.boss.hp) : null, kills: ai.stats.kills };
});
check('AI kills the Shadow Mutant', r.enc === 'won' && r.shadow >= 1, JSON.stringify(r));

// ------------------------------------------------------------- it talks
r = await page.evaluate(() => {
  const log = window.GOREBOX.ai.chat.log;
  const has = (re) => log.some((l) => re.test(l));
  return {
    lines: log.length,
    callouts: log.filter((l) => /spike|stab|barrage|slam|summon|fireball|ring|beam/i.test(l)).length,
    egg: has(/red RCV2/i), grate: has(/grate|bent bar/i), gear: has(/Medium Vest|Helmet|neck/i),
    win: has(/IS DEAD|Silva down|Shadow Mutant down/),
  };
});
check('AI chat: talks through it - gear, Easter eggs, boss callouts, wins',
  r.lines > 30 && r.callouts >= 4 && r.egg && r.grate && r.gear && r.win, JSON.stringify(r));

const errs = logs.filter((l) => !/favicon/.test(l));
check('no page errors', errs.length === 0, errs.slice(0, 5).join(' | '));
await close();
console.log(fail.length ? `\n${fail.length} FAILED: ${fail.join(', ')}` : '\nALL PASSED');
process.exit(fail.length ? 1 : 0);
