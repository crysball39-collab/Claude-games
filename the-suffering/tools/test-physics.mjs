/* Headless checks on the physics and the rig. node tools/test-physics.mjs */
import { World, Body, Island, Joint, HINGE, BALL } from '../src/physics/world.js';
import { buildRagdoll, PARTS, P, CH, CHANNELS, channelsToLocal, solvePose, legIK, PART_COUNT, MUSCLE_TORQUE } from '../src/human/rig.js';

let fails = 0;
const ok = (name, cond, extra = '') => { console.log((cond ? '  ok  ' : ' FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fails++; };
const run = (w, seconds) => { const n = Math.round(seconds * 60); for (let i = 0; i < n; i++) w.step(1 / 60); };

/* 1. a box dropped on the ground comes to rest on it and falls asleep */
{
  const w = new World();
  const isl = new Island(); const b = isl.add(new Body({ hx: 0.4, hy: 0.4, hz: 0.4, mass: 20, y: 3, shape: 1 }));
  b.qx = 0.3; b.qw = Math.sqrt(1 - 0.09);
  w.addIsland(isl);
  run(w, 4);
  ok('box rests on the ground', Math.abs(b.py - 0.4) < 0.02, 'y=' + b.py.toFixed(3));
  ok('box sleeps', isl.sleeping);
}
/* 2. three crates stacked stay stacked */
{
  const w = new World(); const bs = [];
  for (let i = 0; i < 3; i++) { const isl = new Island(); bs.push(isl.add(new Body({ hx: 0.4, hy: 0.4, hz: 0.4, mass: 20, y: 0.4 + i * 0.81, shape: 1, dense: true }))); w.addIsland(isl); }
  run(w, 5);
  ok('stack holds', Math.abs(bs[2].py - 2.0) < 0.06 && Math.abs(bs[2].px) < 0.05, 'top y=' + bs[2].py.toFixed(3) + ' x=' + bs[2].px.toFixed(3));
  ok('stack sleeps', bs.every((b) => b.island.sleeping));
}
/* 3. a box sliding on the ground is stopped by friction */
{
  const w = new World();
  const isl = new Island(); const b = isl.add(new Body({ hx: 0.4, hy: 0.4, hz: 0.4, mass: 20, y: 0.4, shape: 1 }));
  w.addIsland(isl); b.vx = 4;
  run(w, 3);
  ok('friction stops a slide', Math.abs(b.vx) < 0.05 && b.px > 0.3 && b.px < 3, 'x=' + b.px.toFixed(2));
}
/* 4. a static box is solid */
{
  const w = new World();
  w.addStatic(1, 0, -5, 3, 5, 5);
  const isl = new Island(); const b = isl.add(new Body({ hx: 0.3, hy: 0.3, hz: 0.3, mass: 10, y: 0.3, shape: 1 }));
  w.addIsland(isl); b.vx = 8;
  run(w, 2);
  ok('wall stops a box', b.px < 0.75, 'x=' + b.px.toFixed(3));
}
/* 5. the rig: forward kinematics agrees with the rest pose */
{
  const ch = new Float32Array(CHANNELS), local = new Float32Array(PART_COUNT * 4), pos = new Float32Array(PART_COUNT * 3), quat = new Float32Array(PART_COUNT * 4);
  channelsToLocal(ch, local); solvePose(0, 0, 0, 0, 1, ch, local, pos, quat);
  let worst = 0;
  for (let i = 0; i < PART_COUNT; i++) for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(pos[i * 3 + k] - PARTS[i].c[k]));
  ok('rest pose FK matches the part table', worst < 1e-5, 'worst ' + worst.toExponential(2));
  // raising the left arm forward puts the hand in front; out puts it to the left
  ch[CH.shL] = Math.PI / 2; channelsToLocal(ch, local); solvePose(0, 0, 0, 0, 1, ch, local, pos, quat);
  ok('shoulder flex raises the arm forward', pos[P.HAND_L * 3 + 2] > 0.4 && Math.abs(pos[P.HAND_L * 3 + 1] - 1.55) < 0.05);
  ch.fill(0); ch[CH.shLOut] = Math.PI / 2; channelsToLocal(ch, local); solvePose(0, 0, 0, 0, 1, ch, local, pos, quat);
  ok('left arm abducts to the left', pos[P.HAND_L * 3] > 0.7);
  ch.fill(0); ch[CH.shROut] = Math.PI / 2; channelsToLocal(ch, local); solvePose(0, 0, 0, 0, 1, ch, local, pos, quat);
  ok('right arm abducts to the right', pos[P.HAND_R * 3] < -0.7);
  ch.fill(0); ch[CH.shROut] = Math.PI / 2; ch[CH.shRIn] = Math.PI / 2; channelsToLocal(ch, local); solvePose(0, 0, 0, 0, 1, ch, local, pos, quat);
  ok('"in" swings a raised right arm forward', pos[P.HAND_R * 3 + 2] > 0.4, 'z=' + pos[P.HAND_R * 3 + 2].toFixed(2));
  ch.fill(0); ch[CH.shLOut] = Math.PI / 2; ch[CH.shLIn] = Math.PI / 2; channelsToLocal(ch, local); solvePose(0, 0, 0, 0, 1, ch, local, pos, quat);
  ok('"in" swings a raised left arm forward', pos[P.HAND_L * 3 + 2] > 0.4, 'z=' + pos[P.HAND_L * 3 + 2].toFixed(2));
  ch.fill(0); ch[CH.elL] = Math.PI / 2; channelsToLocal(ch, local); solvePose(0, 0, 0, 0, 1, ch, local, pos, quat);
  ok('elbow flexes forward', pos[P.HAND_L * 3 + 2] > 0.2);
  ch.fill(0); ch[CH.hipL] = Math.PI / 2; channelsToLocal(ch, local); solvePose(0, 0, 0, 0, 1, ch, local, pos, quat);
  ok('hip flex lifts the thigh forward', pos[P.SHIN_L * 3 + 2] > 0.3);
  ch.fill(0); ch[CH.kneeL] = Math.PI / 2; channelsToLocal(ch, local); solvePose(0, 0, 0, 0, 1, ch, local, pos, quat);
  ok('knee folds backward', pos[P.FOOT_L * 3 + 2] < -0.3);
  ch.fill(0); ch[CH.spineBend] = 0.6; channelsToLocal(ch, local); solvePose(0, 0, 0, 0, 1, ch, local, pos, quat);
  ok('spine bends forward', pos[P.HEAD * 3 + 2] > 0.15);
  ch.fill(0); ch[CH.hipLOut] = 0.7; channelsToLocal(ch, local); solvePose(0, 0, 0, 0, 1, ch, local, pos, quat);
  ok('left hip abducts left', pos[P.FOOT_L * 3] > 0.5);
  ch.fill(0); ch[CH.ankleL] = 0.4; channelsToLocal(ch, local); solvePose(0, 0, 0, 0, 1, ch, local, pos, quat);
  ok('ankle flex lifts the toes', pos[P.FOOT_L * 3 + 1] > 0.045, 'y=' + pos[P.FOOT_L * 3 + 1].toFixed(3));
  // leg IK puts the ankle where asked
  const o = [0, 0, 0]; legIK(o, 0, 0.6, 0.25);
  ch.fill(0); ch[CH.hipL] = o[0]; ch[CH.hipLOut] = o[1]; ch[CH.kneeL] = o[2]; channelsToLocal(ch, local); solvePose(0, 0, 0, 0, 1, ch, local, pos, quat);
  // ankle = shin centre + shin's bottom
  const sq = [quat[P.SHIN_L * 4], quat[P.SHIN_L * 4 + 1], quat[P.SHIN_L * 4 + 2], quat[P.SHIN_L * 4 + 3]];
  const down = rotv(sq, 0, -0.21, 0);
  const ax = pos[P.SHIN_L * 3] + down[0], ay = pos[P.SHIN_L * 3 + 1] + down[1], az = pos[P.SHIN_L * 3 + 2] + down[2];
  ok('leg IK reaches its target', Math.abs(ay - (0.94 - 0.6)) < 0.01 && Math.abs(az - 0.25) < 0.01, `ankle y=${ay.toFixed(3)} z=${az.toFixed(3)}`);
}
function rotv(q, x, y, z) {
  const [qx, qy, qz, qw] = q; const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + (qy * tz - qz * ty), y + qw * ty + (qz * tx - qx * tz), z + qw * tz + (qx * ty - qy * tx)];
}
/* 6. a ragdoll dropped from two metres lands, stays in one piece, and sleeps */
function jointError(r) {
  let worst = 0;
  for (const j of r.joints) {
    const a = rotv([j.a.qx, j.a.qy, j.a.qz, j.a.qw], j.lax, j.lay, j.laz), b = rotv([j.b.qx, j.b.qy, j.b.qz, j.b.qw], j.lbx, j.lby, j.lbz);
    worst = Math.max(worst, Math.hypot(j.a.px + a[0] - j.b.px - b[0], j.a.py + a[1] - j.b.py - b[1], j.a.pz + a[2] - j.b.pz - b[2]));
  }
  return worst;
}
function hingeAngle(j) {
  const xa = rotv([j.a.qx, j.a.qy, j.a.qz, j.a.qw], 1, 0, 0), ya = rotv([j.a.qx, j.a.qy, j.a.qz, j.a.qw], 0, 1, 0), yb = rotv([j.b.qx, j.b.qy, j.b.qz, j.b.qw], 0, 1, 0);
  const c = [ya[1] * yb[2] - ya[2] * yb[1], ya[2] * yb[0] - ya[0] * yb[2], ya[0] * yb[1] - ya[1] * yb[0]];
  return Math.atan2(c[0] * xa[0] + c[1] * xa[1] + c[2] * xa[2], ya[0] * yb[0] + ya[1] * yb[1] + ya[2] * yb[2]);
}
{
  const w = new World();
  const r = buildRagdoll(w, null, 0.93);
  for (const b of r.bodies) { b.py += 2; b.vx = 1.5; b.wz = 0.5; }
  let maxSpeed = 0, maxErr = 0, t0 = performance.now(), worstKnee = 0, worstElbow = 0;
  for (let i = 0; i < 60 * 8; i++) {
    w.step(1 / 60);
    for (const b of r.bodies) maxSpeed = Math.max(maxSpeed, Math.hypot(b.vx, b.vy, b.vz));
    maxErr = Math.max(maxErr, jointError(r));
    for (const j of r.joints) if (j.type === HINGE) {
      const a = hingeAngle(j); const over = Math.max(j.min - a, a - j.max, 0);
      if (j.name.startsWith('shin')) worstKnee = Math.max(worstKnee, over); if (j.name.startsWith('forearm')) worstElbow = Math.max(worstElbow, over);
    }
  }
  const ms = (performance.now() - t0) / (60 * 8);
  const low = Math.min(...r.bodies.map((b) => b.py - b.boundR)), high = Math.max(...r.bodies.map((b) => b.py));
  ok('ragdoll ends on the ground', high < 0.45 && low > -0.25, `high=${high.toFixed(2)}`);
  ok('ragdoll never explodes', maxSpeed < 14, 'max speed ' + maxSpeed.toFixed(1));
  ok('joints stay together', maxErr < 0.03, 'worst gap ' + (maxErr * 100).toFixed(2) + ' cm');
  ok('knees never bend backwards', worstKnee < 0.2, 'worst ' + worstKnee.toFixed(3) + ' rad');
  ok('elbows never bend backwards', worstElbow < 0.2, 'worst ' + worstElbow.toFixed(3) + ' rad');
  ok('ragdoll sleeps', r.island.sleeping);
  console.log('       ' + ms.toFixed(3) + ' ms per frame for one live ragdoll');
}
/* 7. muscles hold a pose against gravity: pin the pelvis, ask for raised arms */
{
  const w = new World();
  const r = buildRagdoll(w, null, 1);
  r.bodies[0].setKinematic(true);
  const ch = new Float32Array(CHANNELS), local = new Float32Array(PART_COUNT * 4), pos = new Float32Array(PART_COUNT * 3), quat = new Float32Array(PART_COUNT * 4);
  ch[CH.shL] = 1.4; ch[CH.shR] = 1.4; ch[CH.elL] = 0.5; ch[CH.hipL] = 0.8; ch[CH.kneeL] = 1.2; ch[CH.spineBend] = 0.3;
  channelsToLocal(ch, local); solvePose(0, 0, 0, 0, 1, ch, local, pos, quat);
  for (let i = 1; i < PART_COUNT; i++) r.bodies[i].orient = { x: quat[i * 4], y: quat[i * 4 + 1], z: quat[i * 4 + 2], w: quat[i * 4 + 3], s: 1, t: MUSCLE_TORQUE[i] };
  r.island.canSleep = false;
  run(w, 2);
  let worst = 0;
  for (let i = 1; i < PART_COUNT; i++) worst = Math.max(worst, Math.hypot(r.bodies[i].px - pos[i * 3], r.bodies[i].py - pos[i * 3 + 1], r.bodies[i].pz - pos[i * 3 + 2]));
  ok('muscles hold a whole pose against gravity', worst < 0.06, 'worst part is ' + (worst * 100).toFixed(1) + ' cm off');
  const sp = Math.max(...r.bodies.map((b) => Math.hypot(b.vx, b.vy, b.vz)));
  ok('a held pose is still', sp < 0.1, 'speed ' + sp.toFixed(3));
  // half strength still holds, a tenth lets the arms sink
  for (let i = 1; i < PART_COUNT; i++) r.bodies[i].orient.s = 0.5;
  run(w, 2);
  worst = 0;
  for (let i = 1; i < PART_COUNT; i++) worst = Math.max(worst, Math.hypot(r.bodies[i].px - pos[i * 3], r.bodies[i].py - pos[i * 3 + 1], r.bodies[i].pz - pos[i * 3 + 2]));
  ok('half strength muscles still hold', worst < 0.12, (worst * 100).toFixed(1) + ' cm off');
  for (let i = 1; i < PART_COUNT; i++) r.bodies[i].orient.s = 0.03;
  run(w, 2);
  ok('weak muscles give way', r.bodies[P.HAND_L].py < 1.25, 'hand y=' + r.bodies[P.HAND_L].py.toFixed(2));
}
/* 8. a ragdoll thrown at a wall and a pile of ragdolls stay sane */
{
  const w = new World();
  w.addStatic(3, 0, -4, 4, 14, 4);
  const rs = [];
  for (let i = 0; i < 4; i++) { const r = buildRagdoll(w, null, 0.93); for (const b of r.bodies) { b.py += 0.5 + i * 2.1; b.vx = 6; b.pz += i * 0.1; } rs.push(r); }
  let maxSpeed = 0, t0 = performance.now();
  for (let i = 0; i < 60 * 8; i++) { w.step(1 / 60); for (const r of rs) for (const b of r.bodies) maxSpeed = Math.max(maxSpeed, Math.hypot(b.vx, b.vy, b.vz)); }
  const ms = (performance.now() - t0) / (60 * 8);
  const through = rs.some((r) => r.bodies.some((b) => b.px > 3.2));
  ok('nobody passes through the wall', !through);
  ok('a pile of four stays calm', maxSpeed < 16, 'max speed ' + maxSpeed.toFixed(1));
  ok('the pile settles', rs.filter((r) => r.island.sleeping).length >= 3, rs.filter((r) => r.island.sleeping).length + ' of 4 asleep');
  console.log('       ' + ms.toFixed(3) + ' ms per frame for four ragdolls in a heap');
}
console.log(fails ? `\n${fails} FAILED` : '\nall physics checks passed');
process.exit(fails ? 1 : 0);
