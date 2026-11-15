/* =============================================================================
   Measures how far body parts are inside each other: a person's own, and one
   person's inside another's. The boxes measured are the ones that are drawn.

     node tools/overlap.mjs            every scenario
     node tools/overlap.mjs ragdoll    only those whose name matches
   ========================================================================== */
import { play } from './play.mjs';

const only = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;
const t = await play({ width: 900, height: 520 });

await t.ev(async () => {
  const g = window.__game;
  const rig = await import(location.origin + '/the-suffering/src/human/rig.js');
  const { PARTS, P } = rig;
  const N = PARTS.length;
  const adj = new Set();
  for (let i = 1; i < N; i++) { adj.add(i * 32 + PARTS[i].parent); adj.add(PARTS[i].parent * 32 + i); }
  const NAME = PARTS.map((p) => p.name);
  // the three axes of a body, from its quaternion
  const axes = (b, o) => {
    const x = b.qx, y = b.qy, z = b.qz, w = b.qw;
    o[0] = 1 - 2 * (y * y + z * z); o[1] = 2 * (x * y + w * z); o[2] = 2 * (x * z - w * y);
    o[3] = 2 * (x * y - w * z); o[4] = 1 - 2 * (x * x + z * z); o[5] = 2 * (y * z + w * x);
    o[6] = 2 * (x * z + w * y); o[7] = 2 * (y * z - w * x); o[8] = 1 - 2 * (x * x + y * y);
    return o;
  };
  const A9 = new Float64Array(9), B9 = new Float64Array(9);
  /** How far two drawn boxes are inside each other: the least distance one must move to be clear. 0 if they are apart. */
  const depth = (a, sa, b, sb, slack = 0.004) => {
    const tx = b.px - a.px, ty = b.py - a.py, tz = b.pz - a.pz;
    const ra = Math.hypot(sa[0], sa[1], sa[2]) * 0.5, rb = Math.hypot(sb[0], sb[1], sb[2]) * 0.5;
    if (tx * tx + ty * ty + tz * tz > (ra + rb) * (ra + rb)) return 0;
    axes(a, A9); axes(b, B9);
    const ea = [sa[0] * 0.5 - slack, sa[1] * 0.5 - slack, sa[2] * 0.5 - slack], eb = [sb[0] * 0.5 - slack, sb[1] * 0.5 - slack, sb[2] * 0.5 - slack];
    let best = Infinity;
    const test = (lx, ly, lz) => {
      const l = Math.hypot(lx, ly, lz);
      if (l < 1e-6) return true;
      lx /= l; ly /= l; lz /= l;
      let pa = 0, pb = 0;
      for (let i = 0; i < 3; i++) { pa += ea[i] * Math.abs(A9[i * 3] * lx + A9[i * 3 + 1] * ly + A9[i * 3 + 2] * lz); pb += eb[i] * Math.abs(B9[i * 3] * lx + B9[i * 3 + 1] * ly + B9[i * 3 + 2] * lz); }
      const d = pa + pb - Math.abs(tx * lx + ty * ly + tz * lz);
      if (d <= 0) return false;
      if (d < best) best = d;
      return true;
    };
    for (let i = 0; i < 3; i++) if (!test(A9[i * 3], A9[i * 3 + 1], A9[i * 3 + 2])) return 0;
    for (let i = 0; i < 3; i++) if (!test(B9[i * 3], B9[i * 3 + 1], B9[i * 3 + 2])) return 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const ax = A9[i * 3], ay = A9[i * 3 + 1], az = A9[i * 3 + 2], bx = B9[j * 3], by = B9[j * 3 + 1], bz = B9[j * 3 + 2];
      if (!test(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx)) return 0;
    }
    return best;
  };
  const OV = window.OV = {
    depth, NAME,
    /** A person's own parts: the worst pair that is not joined at a joint. */
    self(h) {
      let worst = 0, pair = '';
      for (let i = 0; i < N; i++) {
        if (h.gone[i] || !h.attached[i]) continue;
        for (let j = i + 1; j < N; j++) {
          if (h.gone[j] || !h.attached[j] || adj.has(i * 32 + j)) continue;
          const d = depth(h.bodies[i], h.sizes[i], h.bodies[j], h.sizes[j]);
          if (d > worst) { worst = d; pair = NAME[i] + '/' + NAME[j]; }
        }
      }
      return { d: worst, pair };
    },
    /** One person's parts in another's. */
    between(a, b) {
      let worst = 0, pair = '';
      if (Math.hypot(a.bodies[2].px - b.bodies[2].px, a.bodies[2].py - b.bodies[2].py, a.bodies[2].pz - b.bodies[2].pz) > 2.6) return { d: 0, pair };
      for (let i = 0; i < N; i++) {
        if (a.gone[i]) continue;
        for (let j = 0; j < N; j++) {
          if (b.gone[j]) continue;
          const d = depth(a.bodies[i], a.sizes[i], b.bodies[j], b.sizes[j]);
          if (d > worst) { worst = d; pair = NAME[i] + '/' + NAME[j]; }
        }
      }
      return { d: worst, pair };
    },
    /** Runs the game for `secs`, sampling every frame; returns the worst seen and how much of the time anything was more than `lim` in. */
    watch(secs, people, { lim = 0.012, pairs = false, each = null } = {}) {
      const out = { self: 0, selfPair: '', selfTime: 0, other: 0, otherPair: '', otherTime: 0, frames: 0 };
      const tally = {};
      for (let f = 0; f < secs * 60; f++) {
        if (each) each(f / 60);
        g.advance(1 / 60);
        out.frames++;
        let sBad = false, oBad = false;
        const list = typeof people === 'function' ? people() : people;
        for (let i = 0; i < list.length; i++) {
          const h = list[i];
          if (h.removed) continue;
          const s = OV.self(h);
          if (s.d > out.self) { out.self = s.d; out.selfPair = s.pair + ' (' + ['anim', 'stumble', 'ragdoll', 'getup'][h.state] + ')'; }
          if (s.d > lim) { sBad = true; tally[s.pair] = (tally[s.pair] || 0) + 1; }
          if (pairs) for (let j = i + 1; j < list.length; j++) {
            const o = list[j];
            if (o.removed) continue;
            const b = OV.between(h, o);
            if (b.d > out.other) { out.other = b.d; out.otherPair = b.pair + ' (' + ['anim', 'stumble', 'ragdoll', 'getup'][h.state] + '/' + ['anim', 'stumble', 'ragdoll', 'getup'][o.state] + ')'; }
            if (b.d > lim) oBad = true;
          }
        }
        if (sBad) out.selfTime++;
        if (oBad) out.otherTime++;
      }
      // and how things stand at the end, once whatever was going to happen has happened
      out.endSelf = 0; out.endOther = 0; out.endPair = '';
      { const list = typeof people === 'function' ? people() : people;
        for (let i = 0; i < list.length; i++) { if (list[i].removed) continue; out.endSelf = Math.max(out.endSelf, OV.self(list[i]).d);
          if (pairs) for (let j = i + 1; j < list.length; j++) { if (list[j].removed) continue; const b = OV.between(list[i], list[j]); if (b.d > out.endOther) { out.endOther = b.d; out.endPair = b.pair; } } } }
      out.selfTime /= out.frames; out.otherTime /= out.frames;
      out.common = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => k + ' ' + Math.round(v / out.frames * 100) + '%').join(', ');
      return out;
    },
  };
  window.fresh = () => { T.clear(); for (const o of g.props.slice()) g.removeProp(o); const p = g.player; g.weapons.dropFrom(p, true); for (const it of g.weapons.items.slice()) g.weapons.remove(it); if (p.vest) p.removeVest(); if (p.helmet) p.removeHelmet(); if (p.cuffed) g.weapons.uncuff(p, null); p.h.heal(); p.tased = 0; p.reset(0, -18, Math.PI / 2); g.camYaw = Math.PI / 2; g.camPitch = -0.05; g.gore.clean(); g.paused = false; g.advance(0.3); };
  window.stub = (h, fn) => { h.brain = { update() { h.intent.mx = 0; h.intent.mz = 0; h.intent.run = false; h.intent.crouch = false; h.intent.face = null; for (const k in h.pose) if (k !== 'cuffed' && k !== 'cuffing') h.pose[k] = 0; fn && fn(h); }, pause: 0, mode: 'wander' }; return h; };
});

const cm = (v) => (v * 100).toFixed(1).padStart(5) + ' cm';
const rows = [];
const report = (name, r) => { rows.push({ name, r }); console.log(name.padEnd(34), 'own', cm(r.self), (Math.round(r.selfTime * 100) + '%').padStart(4), (r.selfPair || '-').padEnd(34), r.other !== undefined && r.otherPair ? 'others ' + cm(r.other) + ' ' + Math.round(r.otherTime * 100) + '% ' + r.otherPair : '', r.common ? ' [' + r.common + ']' : '', `| at the end: own ${(r.endSelf * 100).toFixed(1)} cm` + (r.endPair ? `, others ${(r.endOther * 100).toFixed(1)} cm ${r.endPair}` : '')); };
const scen = async (name, fn, arg) => { if (only && !only.test(name)) return; try { report(name, await t.ev(fn, arg)); } catch (e) { console.log(name, 'ERROR', String(e).slice(0, 300)); } };

/* --------------------------- one person, on their feet ----------------------- */
const POSES = {
  'standing': '', 'walking': 'h.intent.mz = 1;', 'running': 'h.intent.mz = 1; h.intent.run = true;', 'crouched': 'h.intent.crouch = true;', 'crouch walking': 'h.intent.crouch = true; h.intent.mz = 1;',
  'fists up': 'h.guardT = 1;', 'hands up': 'h.pose.handsUp = 1;', 'cowering': 'h.pose.cower = 1; h.intent.crouch = true;', 'doubled over': 'h.pose.hurt = 1;', 'on the phone': 'h.pose.phone = 1;',
  'talking': 'h.pose.talk = 1;', 'kneeling': 'h.pose.kneel = 1; h.intent.crouch = true;', 'staggering': 'h.pose.stagger = 1;', 'in handcuffs': '', 'in handcuffs, running': 'h.intent.mz = 1; h.intent.run = true;',
};
for (const [name, body] of Object.entries(POSES)) {
  await scen('pose: ' + name, ([name, body]) => {
    const g = __game; fresh();
    const h = stub(g.spawnHuman(4, -18, 0), new Function('h', body));
    if (name.startsWith('in handcuffs')) { g.weapons.give(g.player, 'cuffs'); g.weapons._applyCuffs(g.player, h, g.weapons.inventory[0]); }
    g.advance(1.2);
    return OV.watch(2.5, [h]);
  }, [name, body]);
}
for (const kit of ['fists', 'knife', 'machete']) await scen('attacks: ' + kit, (kit) => {
  const g = __game, p = g.player, w = g.weapons; fresh();
  if (kit !== 'fists') w.give(p, kit, true);
  g.advance(0.6);
  let i = 0;
  return OV.watch(6, [p], { each: (tm) => { if (!p.anim.busy && tm > i * 1.4) { w.attack(i % 4); i++; } } });
}, kit);
for (const gun of ['m1911', 'ak47', 'taser']) await scen('gun: ' + gun + ' aim, fire, reload', (gun) => {
  const g = __game, p = g.player, w = g.weapons; fresh();
  w.give(p, gun, true); g.advance(0.6);
  return OV.watch(9, [p], { each: (tm) => { g.camPitch = Math.sin(tm * 1.3) * 0.7; if (tm > 2 && tm < 2.1) w.fire(); if (tm > 2.6 && tm < 2.7) w.reload(); if (tm > 6 && tm < 6.05) w.holster(); if (tm > 7.2 && tm < 7.25) w.holster(); __ts.input.move.y = tm > 4 && tm < 5.5 ? 1 : 0; } });
}, gun);
await scen('player: jump, crouch, run', () => {
  const g = __game, p = g.player; fresh();
  const r = OV.watch(7, [p], { each: (tm) => { __ts.input.move.y = tm < 5 ? 1 : 0; if (Math.abs(tm - 1) < 0.02 || Math.abs(tm - 3) < 0.02) T.press('jump'); else T.release('jump'); if (Math.abs(tm - 4) < 0.02 || Math.abs(tm - 6) < 0.02) T.press('crouch'); else T.release('crouch'); } });
  __ts.input.move.y = 0; return r;
});

/* --------------------------------- ragdolls ---------------------------------- */
await scen('ragdoll: knocked down, gets up', () => {
  const g = __game; fresh();
  const hs = [];
  for (let i = 0; i < 6; i++) { const h = stub(g.spawnHuman(3 + i * 1.6, -18 + (i % 2) * 1.5, i)); hs.push(h); }
  g.advance(0.5);
  hs.forEach((h, i) => { h.toRagdoll(); const c = h.bodies[2]; c.applyImpulse(Math.sin(i * 1.3) * 60, 20, Math.cos(i * 1.3) * 60); });
  return OV.watch(8, hs);
});
await scen('ragdoll: dead, thrown', () => {
  const g = __game; fresh();
  const hs = [];
  for (let i = 0; i < 6; i++) { const h = stub(g.spawnHuman(3 + i * 1.8, -18 + (i % 2) * 1.5, i)); hs.push(h); }
  g.advance(0.5);
  hs.forEach((h, i) => { h.h.kill('test'); h.toRagdoll(); for (const b of h.bodies) { b.vx = Math.sin(i) * 5; b.vy = 4 + i; b.vz = Math.cos(i) * 5; b.wx = i - 2; b.wz = 2 - i; } });
  return OV.watch(7, hs);
});
await scen('ragdoll: tased', () => {
  const g = __game; fresh();
  const hs = [];
  for (let i = 0; i < 4; i++) { const h = stub(g.spawnHuman(3 + i * 2, -18, i)); hs.push(h); }
  g.advance(0.5);
  hs.forEach((h) => h.tase(4, null));
  return OV.watch(9, hs);
});
await scen('ragdoll: in handcuffs', () => {
  const g = __game; fresh();
  const hs = [];
  for (let i = 0; i < 3; i++) { const h = stub(g.spawnHuman(3 + i * 2, -18, i)); hs.push(h); g.weapons.give(g.player, 'cuffs'); g.weapons._applyCuffs(g.player, h, g.weapons.inventory[0]); }
  g.advance(0.5);
  hs.forEach((h, i) => { h.toRagdoll(); h.bodies[2].applyImpulse(40 * (i - 1), 10, 50); });
  return OV.watch(9, hs);
});

/* ------------------------------ more than one person -------------------------- */
await scen('pile: six bodies dropped together', () => {
  const g = __game; fresh();
  const hs = [];
  for (let i = 0; i < 6; i++) { const h = stub(g.spawnHuman(5 + (i % 2) * 0.5, -18 + (i % 3) * 0.4, i)); hs.push(h); }
  g.advance(0.3);
  hs.forEach((h, i) => { h.h.kill('test'); h.toRagdoll(); for (const b of h.bodies) { b.teleport(b.px, b.py + 0.4 + i * 1.3, b.pz); b.vx = b.vy = b.vz = 0; } });
  return OV.watch(9, hs, { pairs: true });
});
await scen('pile: live bodies thrown at each other', () => {
  const g = __game; fresh();
  const hs = [];
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const h = stub(g.spawnHuman(6 + Math.sin(a) * 2.2, -18 + Math.cos(a) * 2.2, a + Math.PI)); hs.push(h); }
  g.advance(0.3);
  hs.forEach((h, i) => { const a = i / 6 * Math.PI * 2; h.toRagdoll(); for (const b of h.bodies) { b.vx = -Math.sin(a) * 5; b.vy = 2.5; b.vz = -Math.cos(a) * 5; } });
  return OV.watch(9, hs, { pairs: true });
});
await scen('ragdoll thrown at a standing person', () => {
  const g = __game; fresh();
  const a = stub(g.spawnHuman(4, -18, 0)), hs = [a];
  for (let i = 0; i < 3; i++) { const h = stub(g.spawnHuman(4 + (i - 1) * 0.3, -21 - i * 1.5, 0)); hs.push(h); }
  g.advance(0.3);
  hs.slice(1).forEach((h) => { h.h.kill('test'); h.toRagdoll(); for (const b of h.bodies) { b.vz = 7; b.vy = 2.5; } });
  return OV.watch(6, hs, { pairs: true });
});
await scen('crowd: five spawned together, milling', () => {
  const g = __game; fresh();
  g.paused = false; __ts.ui.spawn('crowd'); __ts.ui.spawn('crowd');
  g.advance(0.3);
  const hs = g.humans.slice();
  return OV.watch(14, () => g.humans, { pairs: true });
});
await scen('crowd: walking into each other', () => {
  const g = __game; fresh();
  const hs = [];
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const h = g.spawnHuman(6 + Math.sin(a) * 4, -18 + Math.cos(a) * 4, a + Math.PI); stub(h, (x) => { const dx = 6 - x.x, dz = -18 - x.z, d = Math.hypot(dx, dz) || 1; x.intent.mx = dx / d; x.intent.mz = dz / d; x.intent.run = (i % 2) === 0; }); hs.push(h); }
  return OV.watch(8, hs, { pairs: true });
});
await scen('player walks into people', () => {
  const g = __game, p = g.player; fresh();
  const hs = [p];
  for (let i = 0; i < 4; i++) hs.push(stub(g.spawnHuman(2.5 + i * 1.1, -18 + (i % 2) * 0.3, -Math.PI / 2)));
  const r = OV.watch(6, hs, { pairs: true, each: () => { __ts.input.move.y = 1; } });
  __ts.input.move.y = 0; return r;
});
for (const kit of ['fists', 'knife', 'machete']) await scen('fight: player attacks with ' + kit, (kit) => {
  const g = __game, p = g.player, w = g.weapons; fresh();
  if (kit !== 'fists') w.give(p, kit, true);
  const v = stub(T.dummy(1.0));
  v.h.tough = 50;                                    // someone who can take it, so the swings keep landing on a standing body
  g.advance(0.6);
  let i = 0;
  return OV.watch(8, [p, v], { pairs: true, each: (tm) => { if (!p.anim.busy && tm > i * 1.3) { if (v.state !== 0) { v.h.heal(); } w.attack(i % 4); i++; } } });
}, kit);
await scen('fight: two people trading punches', () => {
  const g = __game; fresh();
  const a = g.spawnHuman(4, -18, Math.PI / 2), b = g.spawnHuman(5.0, -18, -Math.PI / 2);
  a.h.tough = 30; b.h.tough = 30;
  let ta = 0, tb = 0.4;
  stub(a, (x) => { x.intent.face = Math.atan2(b.x - x.x, b.z - x.z); x.guardT = 1; const d = Math.hypot(b.x - x.x, b.z - x.z); if (d > 1.0) { x.intent.mx = (b.x - x.x) / d; x.intent.mz = (b.z - x.z) / d; } });
  stub(b, (x) => { x.intent.face = Math.atan2(a.x - x.x, a.z - x.z); x.guardT = 1; const d = Math.hypot(a.x - x.x, a.z - x.z); if (d > 1.0) { x.intent.mx = (a.x - x.x) / d; x.intent.mz = (a.z - x.z) / d; } });
  return OV.watch(10, [a, b], { pairs: true, each: (tm) => { if (tm > ta && a.state === 0) { g.weapons.npcAttack(a, b); ta = tm + 0.9; } if (tm > tb && b.state === 0) { g.weapons.npcAttack(b, a); tb = tm + 1.0; } } });
});
await scen('arrest: officer cuffs someone on the ground', () => {
  const g = __game; fresh();
  const o = g.spawnOfficer(4, -18, 0), v = stub(g.spawnHuman(5.2, -18, 0));
  g.advance(0.5);
  for (const k of [o.mind._know(v)]) { k.crime = 2.2; k.crimeT = g.time; }
  v.tase(5, o);
  return OV.watch(14, [o, v], { pairs: true });
});
await scen('walking over a body', () => {
  const g = __game; fresh();
  const v = stub(g.spawnHuman(4, -18, Math.PI / 2)); g.advance(0.3); v.h.kill('test'); v.toRagdoll(); g.advance(2.5);
  const hs = [v];
  for (let i = 0; i < 3; i++) { const h = g.spawnHuman(0.5 - i * 1.4, -18 + (i - 1) * 0.25, Math.PI / 2); stub(h, (x) => { x.intent.mx = 1; x.intent.run = i === 1; }); hs.push(h); }
  return OV.watch(6, hs, { pairs: true });
});

console.log('\nLOGS:', t.logs.join('\n') || 'none');
await t.close();
