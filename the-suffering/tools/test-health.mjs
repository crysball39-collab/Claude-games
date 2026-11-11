/* Headless checks on the medical simulation. node tools/test-health.mjs */
import { Health, BONES, ORGANS } from '../src/human/health.js';
import { P, SUBTREE } from '../src/human/rig.js';

let fails = 0;
const ok = (name, cond, extra = '') => { console.log((cond ? '  ok  ' : ' FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fails++; };
/** Runs a body forward; returns the times at which it lost consciousness, arrested and died. */
function run(h, seconds, ctx = {}) {
  const t = { out: -1, arrest: -1, dead: -1, vomit: 0, maxPulse: 0, minTemp: 99, maxShock: 0, maxPain: 0 };
  for (let i = 0; i < seconds * 10; i++) {
    h.tick(0.1, ctx);
    const now = (i + 1) / 10;
    if (t.out < 0 && !h.conscious) t.out = now;
    if (t.arrest < 0 && h.heartStopped) t.arrest = now;
    if (t.dead < 0 && !h.alive) t.dead = now;
    if (h.events.includes('vomit')) t.vomit++;
    t.maxPulse = Math.max(t.maxPulse, h.pulse); t.minTemp = Math.min(t.minTemp, h.temp);
    t.maxShock = Math.max(t.maxShock, h.shock); t.maxPain = Math.max(t.maxPain, h.pain);
  }
  return t;
}
const FRONT = [0, 0, 1], IN = [0, 0, -1];
const seed = (n) => { let a = n; Math.random = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; };

seed(1);
{
  const h = new Health(); const t = run(h, 60);
  ok('a healthy person stays healthy', h.alive && h.conscious && h.bloodPct > 99.9 && h.air > 96 && Math.abs(h.pulse - 72) < 4 && h.condition.label === 'HEALTHY',
    `pulse ${h.pulse.toFixed(0)} air ${h.air.toFixed(0)} temp ${h.temp.toFixed(1)}`);
  const r = run(new Health(), 30, { fear: 90, moving: 1 });
  ok('fear and running raise the pulse', r.maxPulse > 140, 'peak ' + r.maxPulse.toFixed(0));
}
{
  let dead = 0, ko = 0, maxPain = 0, lost = 0;
  for (let k = 0; k < 40; k++) {
    seed(100 + k);
    const h = new Health();
    for (let i = 0; i < 6; i++) { const r = h.hit({ part: i % 2 ? P.HEAD : P.CHEST, type: 'blunt', power: 0.9, lp: [0.02, 0, 0.11], ln: FRONT, ld: IN }); if (r.ko) ko++; h.tick(0.4); }
    const t = run(h, 60); if (!h.alive) dead++; maxPain = Math.max(maxPain, t.maxPain); lost = Math.max(lost, h.bloodMax - h.blood);
  }
  ok('a beating bruises, hurts, and does not kill', dead === 0 && maxPain > 25 && lost < 120, `dead ${dead}/40, knocked out in ${ko} blows of 240, worst pain ${maxPain.toFixed(0)}, most blood lost ${lost.toFixed(0)} ml`);
  ok('a beating sometimes knocks someone out', ko > 2 && ko < 120);
}
{
  seed(7);
  const h = new Health();
  const r = h.hit({ part: P.CHEST, type: 'bullet', power: 1.4, lp: [0.025, -0.015, 0.11], ln: FRONT, ld: IN, through: 0.22 });
  const t = run(h, 60);
  ok('a round through the heart kills quickly', !h.alive && t.dead < 30 && /Heart/.test(h.cause), `out ${t.out}s dead ${t.dead}s: ${h.cause}`);
  ok('it reports the heart and an exit wound', r.organs.some((o) => o.id === 'heart') && (r.exit || !r.through));
}
{
  seed(8);
  const h = new Health();
  const r = h.hit({ part: P.HEAD, type: 'bullet', power: 1, lp: [0, 0.03, 0.11], ln: FRONT, ld: IN, through: 0.22 });
  ok('a round through the brain kills at once', !h.alive && r.killed && /Brain/.test(h.cause), h.cause);
}
{
  let outs = [], deads = [];
  for (let k = 0; k < 30; k++) {
    seed(300 + k);
    const h = new Health();
    // keep cutting until an artery goes, as a determined attacker would
    for (let i = 0; i < 8 && !h.wounds.some((w) => w.arterial); i++) h.hit({ part: P.NECK, type: 'cut', power: 1.2, lp: [0.03, 0, 0.055], ln: FRONT, ld: [1, 0, 0] });
    const t = run(h, 200);
    if (t.out > 0) outs.push(t.out); if (t.dead > 0) deads.push(t.dead);
    if (k === 0) ok('a cut throat is blood loss', /Blood loss/.test(h.cause), h.cause + `, max shock ${t.maxShock.toFixed(0)}, coldest ${t.minTemp.toFixed(1)}, peak pulse ${t.maxPulse.toFixed(0)}`);
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  ok('a cut throat drops them in well under a minute', outs.length === 30 && avg(outs) > 8 && avg(outs) < 45, `unconscious after ${avg(outs).toFixed(0)}s on average`);
  ok('...and kills in about a minute', deads.length === 30 && avg(deads) > 25 && avg(deads) < 110, `dead after ${avg(deads).toFixed(0)}s on average`);
}
{
  seed(9);
  const h = new Health();
  h.hit({ part: P.FARM_L, type: 'cut', power: 0.5, lp: [0, 0, 0.04], ln: FRONT, ld: [1, 0, 0] });
  const w = h.wounds[0]; w.arterial = false; w.bleed = w.base = Math.min(w.base, 1.4);
  const t = run(h, 240);
  ok('a small cut closes by itself', h.alive && h.bleedOut < 0.01 && h.bloodMax - h.blood < 120, `lost ${(h.bloodMax - h.blood).toFixed(0)} ml`);
}
{
  seed(10);
  const h = new Health();
  h.lose(P.FARM_R, SUBTREE[P.FARM_R]);
  ok('losing a forearm is survived for a while', h.alive && h.missing[P.HAND_R] && h.bones.forearmR < 0 && !h.armOk(-1) && h.armOk(1));
  const t = run(h, 400);
  ok('an untreated amputation bleeds out', !h.alive && t.dead > 50 && t.dead < 330 && t.maxShock > 80 && t.minTemp < 35.5 && t.maxPulse > 120,
    `out ${t.out}s dead ${t.dead}s, shock ${t.maxShock.toFixed(0)}, temp ${t.minTemp.toFixed(1)}, pulse ${t.maxPulse.toFixed(0)}: ${h.cause}`);
  const h2 = new Health(); h2.lose(P.HEAD, SUBTREE[P.HEAD]);
  ok('decapitation is immediate', !h2.alive && h2.cause === 'Decapitation');
}
{
  seed(11);
  const h = new Health();
  h.hit({ part: P.CHEST, type: 'bullet', power: 1, lp: [0.1, 0, 0.11], ln: FRONT, ld: IN, through: 0.22 });
  h.hit({ part: P.CHEST, type: 'bullet', power: 1, lp: [-0.1, 0, 0.11], ln: FRONT, ld: IN, through: 0.22 });
  const before = h.air; const t = run(h, 40);
  ok('holes in both lungs starve them of air', h.air < 70 || !h.alive, `air ${before.toFixed(0)} -> ${h.air.toFixed(0)}, ${h.alive ? h.condition.label : h.cause}`);
}
{
  let cannot = 0;
  for (let k = 0; k < 40; k++) { seed(500 + k); const h = new Health(); for (let i = 0; i < 3; i++) h.hit({ part: P.THIGH_L, type: 'bullet', power: 1.4, lp: [0, 0, 0.07], ln: FRONT, ld: IN, through: 0.14 }); h.tick(0.1); if (!h.canStand) cannot++; }
  ok('three rifle rounds in a thigh usually take the leg out', cannot > 24, cannot + ' of 40 could not stand');
  seed(12);
  const h = new Health(); let r;
  for (let i = 0; i < 8 && !(r && r.burst); i++) r = h.hit({ part: P.FARM_L, type: 'bullet', power: 1.4, lp: [0, 0, 0.04], ln: FRONT, ld: IN, through: 0.08 });
  ok('enough rounds destroy a limb', r.burst);
  seed(13);
  const h3 = new Health(); let s, n = 0;
  for (; n < 12 && !(s && s.severed >= 0); n++) s = h3.hit({ part: P.NECK, type: 'cut', power: 1.9, chop: 1, lp: [0.03, 0, 0.05], ln: FRONT, ld: [1, 0, 0] });
  ok('a machete takes a head off in a blow or two', s.severed === P.NECK && n <= 3, n + ' blows');
  seed(14);
  const h4 = new Health(); let q; n = 0;
  for (; n < 40 && !(q && q.severed >= 0); n++) q = h4.hit({ part: P.NECK, type: 'cut', power: 1, chop: 0, lp: [0.03, 0, 0.05], ln: FRONT, ld: [1, 0, 0] });
  ok('a knife never does', !(q.severed >= 0) || n > 15, n + ' cuts');
}
{
  seed(15);
  const h = new Health();
  h.hit({ part: P.ABDOMEN, type: 'stab', power: 1.2, lp: [0.055, 0.04, 0.09], ln: FRONT, ld: IN });
  const t = run(h, 30);
  ok('a knife in the stomach makes them sick', t.vomit > 0 || h.nausea > 45, `vomited ${t.vomit} times, nausea ${h.nausea.toFixed(0)}`);
  const f = h.findings();
  ok('findings list what is wrong', f.some((x) => x.id === 'stomach'), f.map((x) => x.name + ':' + x.state).join(', '));
}
{
  seed(16);
  const h = new Health();
  h.hit({ part: P.ABDOMEN, type: 'bullet', power: 1, lp: [0, -0.02, -0.09], ln: [0, 0, -1], ld: [0, 0, 1], through: 0.18 });
  h.bones.lspine = 10;
  ok('a broken lower spine paralyses the legs and not the arms', h.paralysedLegs && !h.paralysedArms && !h.canStand && h.armOk(1));
  h.heal();
  ok('healing restores them', h.canStand && h.bloodPct === 100 && h.wounds.length === 0);
}
console.log(fails ? `\n${fails} FAILED` : '\nall health checks passed');
process.exit(fails ? 1 : 0);
