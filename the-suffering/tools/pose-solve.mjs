/* =============================================================================
   A workbench for the attack clips. Swings are easiest to describe as "the
   hand is here and the blade points that way"; the rig wants joint angles.
   This finds the angles: for each keyframe it searches the right arm's five
   channels for the pose that puts the grip and the blade where they were
   asked for, and prints the result ready to paste into anim.js.

     node tools/pose-solve.mjs            solve every swing below
     node tools/pose-solve.mjs path       print where each clip's blade goes
   ========================================================================== */
import { P, CH, CHANNELS, channelsToLocal, solvePose, PART_COUNT } from '../src/human/rig.js';

const local = new Float32Array(PART_COUNT * 4), pos = new Float32Array(PART_COUNT * 3), quat = new Float32Array(PART_COUNT * 4);
function rot(q, x, y, z) {
  const [qx, qy, qz, qw] = q; const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + (qy * tz - qz * ty), y + qw * ty + (qz * tx - qx * tz), z + qw * tz + (qx * ty - qy * tx)];
}
/** Grip position and blade direction for a set of channels. */
export function hand(ch, reverse = false) {
  channelsToLocal(ch, local); solvePose(0, 0, 0, 0, 1, ch, local, pos, quat);
  const i = P.HAND_R, q = [quat[i * 4], quat[i * 4 + 1], quat[i * 4 + 2], quat[i * 4 + 3]];
  const g = rot(q, 0, -0.03, 0), d = rot(q, 0, 0, reverse ? -1 : 1);
  return { grip: [pos[i * 3] + g[0], pos[i * 3 + 1] + g[1], pos[i * 3 + 2] + g[2]], dir: d };
}

const RANGE = { shR: [-0.6, 3.05], shROut: [0, 1.6], shRIn: [-0.9, 1.75], elR: [0.05, 2.3], wrR: [-1.6, 0.6], wrRSide: [-1.2, 1.2] };
const NAMES = Object.keys(RANGE);

function solve(target, dir, fixed, start, reverse) {
  const ch = new Float32Array(CHANNELS);
  for (const k in fixed) ch[CH[k]] = fixed[k];
  let best = start ? { ...start } : { shR: 1, shROut: 0.4, shRIn: 0.2, elR: 0.8, wrR: -0.6, wrRSide: 0 };
  const cost = (v) => {
    for (const n of NAMES) ch[CH[n]] = v[n];
    const h = hand(ch, reverse);
    const e = Math.hypot(h.grip[0] - target[0], h.grip[1] - target[1], h.grip[2] - target[2]);
    const a = 1 - (h.dir[0] * dir[0] + h.dir[1] * dir[1] + h.dir[2] * dir[2]);
    // prefer staying near where the arm already was, and a relaxed elbow
    let far = 0;
    if (start) for (const n of NAMES) far += (v[n] - start[n]) ** 2;
    return e * e * 60 + a * 0.6 + far * 0.003 + v.wrRSide * v.wrRSide * 0.004;
  };
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const climb = (from) => {
    let cur = from, cc = cost(cur);
    for (let round = 0; round < 6; round++) {
      const step = 1.2 / (1 + round * 1.6);
      for (let i = 0; i < 5000; i++) {
        const v = { ...cur };
        const n = NAMES[(rnd() * NAMES.length) | 0];
        v[n] = Math.min(RANGE[n][1], Math.max(RANGE[n][0], v[n] + (rnd() - 0.5) * step));
        if (rnd() < 0.3) { const m = NAMES[(rnd() * NAMES.length) | 0]; v[m] = Math.min(RANGE[m][1], Math.max(RANGE[m][0], v[m] + (rnd() - 0.5) * step)); }
        const c = cost(v);
        if (c < cc) { cc = c; cur = v; }
      }
    }
    return [cur, cc];
  };
  // from where the arm already is, and from a handful of other places: the
  // best of them is the answer, so one bad starting point cannot trap it
  let [bv, bc] = climb(best);
  for (let k = 0; k < 10; k++) {
    const v = {};
    for (const n of NAMES) v[n] = RANGE[n][0] + rnd() * (RANGE[n][1] - RANGE[n][0]);
    const [cv, cc] = climb(v);
    if (cc < bc) { bc = cc; bv = cv; }
  }
  best = bv;
  for (const n of NAMES) ch[CH[n]] = best[n];
  const h = hand(ch, reverse);
  return { v: best, err: Math.hypot(h.grip[0] - target[0], h.grip[1] - target[1], h.grip[2] - target[2]), dir: h.dir };
}

const n3 = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
/**
 * Each swing: keyframes of time, where the grip is, where the blade points,
 * and what the trunk is doing. Measured on a person 1.92 m tall standing at
 * the origin facing +Z: their right shoulder is at about (-0.235, 1.55, 0)
 * and their hand reaches 0.6 m from it.
 */
const SWINGS = {
  // the carry: hand in front of the right hip, blade forward and up
  rest: { keys: [[0, [-0.28, 1.12, 0.26], [0, 0.5, 0.87], {}]] },
  slash: { keys: [[0.2, [-0.62, 1.45, 0.12], [-0.7, 0.2, 0.68], { spineTwist: -0.4 }], [0.42, [-0.2, 1.42, 0.58], [0.1, 0.05, 1], { spineTwist: 0.05 }], [0.6, [0.22, 1.38, 0.5], [0.8, 0, 0.6], { spineTwist: 0.45 }]] },
  backslash: { keys: [[0.2, [0.2, 1.45, 0.42], [0.7, 0.2, 0.68], { spineTwist: 0.4 }], [0.42, [-0.18, 1.42, 0.58], [-0.1, 0.05, 1], { spineTwist: 0 }], [0.6, [-0.6, 1.38, 0.28], [-0.8, 0, 0.6], { spineTwist: -0.4 }]] },
  stab: { keys: [[0.24, [-0.3, 1.2, 0.02], [0, 0.05, 1], { spineTwist: -0.35, rootZ: -0.03 }], [0.5, [-0.08, 1.3, 0.62], [0, 0, 1], { spineTwist: 0.42, rootZ: 0.12 }], [0.62, [-0.08, 1.3, 0.6], [0, 0, 1], { spineTwist: 0.4, rootZ: 0.12 }]] },
  overhand: { reverse: true, keys: [[0.3, [-0.28, 1.95, 0.12], [0, -0.4, 0.9], { spineBend: -0.18 }], [0.54, [-0.1, 1.7, 0.6], [0, -0.75, 0.66], { spineBend: 0.26 }], [0.68, [-0.1, 1.5, 0.6], [0, -0.92, 0.4], { spineBend: 0.32 }]] },
  chop: { keys: [[0.26, [-0.45, 1.95, -0.05], [-0.2, 0.8, -0.55], { spineTwist: -0.35, spineBend: -0.1 }], [0.44, [-0.25, 1.78, 0.45], [0.1, 0.55, 0.83], { spineTwist: 0.1, spineBend: 0.06 }], [0.6, [0.05, 1.22, 0.5], [0.45, -0.35, 0.82], { spineTwist: 0.48, spineBend: 0.22 }]] },
  backhand: { keys: [[0.26, [0.25, 1.8, 0.25], [0.5, 0.75, -0.3], { spineTwist: 0.38, spineBend: -0.05 }], [0.44, [0.08, 1.62, 0.52], [0.15, 0.3, 0.94], { spineTwist: 0.05, spineBend: 0.06 }], [0.6, [-0.4, 1.2, 0.45], [-0.45, -0.3, 0.84], { spineTwist: -0.42, spineBend: 0.2 }]] },
  cleave: { keys: [[0.32, [-0.18, 2.1, -0.1], [0, 0.7, -0.7], { spineBend: -0.26, waistBend: -0.05, rootY: 0.02 }], [0.5, [-0.14, 1.95, 0.42], [0, 0.6, 0.8], { spineBend: 0.08, waistBend: 0.04 }], [0.62, [-0.13, 1.15, 0.78], [0.02, -0.35, 0.94], { spineBend: 0.44, waistBend: 0.2, rootY: -0.09 }], [0.7, [-0.13, 1.02, 0.74], [0.02, -0.5, 0.87], { spineBend: 0.48, waistBend: 0.2, rootY: -0.09 }]] },
  sweep: { keys: [[0.24, [-0.55, 1.6, 0.1], [-0.95, 0, 0.3], { spineTwist: -0.55 }], [0.44, [-0.3, 1.6, 0.52], [-0.1, 0, 1], { spineTwist: 0.05 }], [0.62, [0.3, 1.58, 0.42], [0.9, 0, 0.44], { spineTwist: 0.62 }]] },
};

if (process.argv[2] === 'path') {
  const { Animator, CLIPS } = await import('../src/human/anim.js');
  // where does the blade go during each clip's striking window?
  for (const name of process.argv[3] ? [process.argv[3]] : Object.keys(CLIPS)) {
    const c = CLIPS[name];
    if (c.limb !== 'blade') {
      // a fist or a foot: where does it travel?
      const a = new Animator(); a.t = 0; a.phase = 0;
      for (let i = 0; i < 30; i++) a.update(1 / 60, { speed: 0, grounded: true, hold: 'guard' });
      a.play(name);
      console.log(name);
      const n = Math.round(c.dur * 60), part = c.limb === 'handL' ? P.HAND_L : c.limb === 'handR' ? P.HAND_R : P.FOOT_R;
      for (let i = 0; i < n; i++) {
        const ch = a.update(1 / 60, { speed: 0, grounded: true, hold: 'guard' });
        const u = (i + 1) / n;
        if (u < c.hit[0] - 0.05 || u > c.hit[1] + 0.03) continue;
        channelsToLocal(ch, local); solvePose(0, 0, 0, 0, 1, ch, local, pos, quat);
        const q = [quat[part * 4], quat[part * 4 + 1], quat[part * 4 + 2], quat[part * 4 + 3]];
        const o = part === P.FOOT_R ? rot(q, 0, 0, 0.11) : rot(q, 0, -0.045, 0);
        console.log(`  u=${u.toFixed(2)}${u >= c.hit[0] && u <= c.hit[1] ? '*' : ' '} ${(pos[part * 3] + o[0]).toFixed(2)} ${(pos[part * 3 + 1] + o[1]).toFixed(2)} ${(pos[part * 3 + 2] + o[2]).toFixed(2)}`);
      }
      continue;
    }
    const a = new Animator(); a.t = 0; a.phase = 0;
    for (let i = 0; i < 30; i++) a.update(1 / 60, { speed: 0, grounded: true, hold: 'blade' });
    a.play(name);
    const len = name === 'chop' || name === 'backhand' || name === 'cleave' || name === 'sweep' ? 0.5 : 0.19, base = len > 0.3 ? 0.1 : 0.07;
    console.log(name);
    const n = Math.round(c.dur * 60);
    for (let i = 0; i < n; i++) {
      const ch = a.update(1 / 60, { speed: 0, grounded: true, hold: 'blade' });
      const u = (i + 1) / n;
      if (u < c.hit[0] - 0.05 || u > c.hit[1] + 0.03) continue;
      const h = hand(ch, c.reverse);
      const tip = h.grip.map((g, k) => g + h.dir[k] * (base + len));
      console.log(`  u=${u.toFixed(2)}${u >= c.hit[0] && u <= c.hit[1] ? '*' : ' '} grip ${h.grip.map((v) => v.toFixed(2)).join(' ')}   tip ${tip.map((v) => v.toFixed(2)).join(' ')}`);
    }
  }
} else {
  // solve every keyframe and write the result where anim.js reads it
  const { writeFileSync } = await import('node:fs');
  const r2 = (v) => Math.round(v * 100) / 100;
  const out = {};
  let carry = null, worst = 0;
  for (const name in SWINGS) {
    const s = SWINGS[name];
    let prev = carry;
    out[name] = [];
    for (const [t, grip, dir, fixed] of s.keys) {
      const r = solve(grip, n3(dir), fixed, prev, s.reverse);
      prev = r.v;
      const key = {};
      for (const n of NAMES) key[n] = r2(r.v[n]);
      Object.assign(key, fixed);
      out[name].push([t, key]);
      const ang = Math.acos(Math.min(1, r.dir[0] * n3(dir)[0] + r.dir[1] * n3(dir)[1] + r.dir[2] * n3(dir)[2])) * 57.3;
      worst = Math.max(worst, r.err);
      console.log(`${name.padEnd(10)} t=${t}  grip off by ${(r.err * 100).toFixed(1)} cm, blade off by ${ang.toFixed(0)} deg`);
    }
    if (name === 'rest') carry = prev;
  }
  const body = '/* Written by tools/pose-solve.mjs. Edit the swings there, not here. */\nexport const SWINGS = ' + JSON.stringify(out, null, 1).replace(/"(\w+)":/g, '$1:') + ';\n';
  writeFileSync(new URL('../src/human/swings.js', import.meta.url), body);
  console.log('wrote src/human/swings.js; worst grip error ' + (worst * 100).toFixed(1) + ' cm');
}
