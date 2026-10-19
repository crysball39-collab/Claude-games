/* =============================================================================
   Blood: where it comes out of somebody, and where it ends up.

   Out of somebody: every wound that is bleeding is somewhere it comes from
   - a cut, a hole, a gash, a stump, a knife still in them, a nose - and how
   fast each one bleeds (health.js) is how much comes out of it, so it
   drips from the wound that is bleeding and from nowhere else. A stump, an
   opened artery or a cut throat does not drip: it spurts, a stream in time
   with the heart - harder with the heart racing, weaker as the blood runs
   out, and only pouring out of them once the heart has stopped. Bled dry
   (health.js BLOOD_EMPTY), nothing comes out of them at all, whatever is
   done to them.

   A body slammed into the floor, a wall or a crate bleeds from where it
   hit: a head driven into the floor splashes from the head, out across the
   floor around it, and leaves blood on the floor and on the head - not
   somewhere in the middle of them.

   And where it ends up (fx.js moves it there): whatever it lands on - the
   floor, the walls, crates and blocks, knives and guns, vests and ammo
   boxes, a severed limb, a mod's things, and people. On a thing it is kept
   in the thing's own frame, so it goes where the thing goes and turns
   with it.
   ========================================================================== */
import { DIM, pointOnBone } from './skeleton.js';
import { goneAt } from './draw.js';
import { PARTS } from './health.js';
import { clamp, rand, chance } from '../core/util.js';

/** Which bones each part is made of (skeleton.js BONES; the head's own is the neck). */
const PART_BONES = { head: [2], torso: [0, 1], armA: [3, 4], armB: [5, 6], legA: [7, 8, 9], legB: [10, 11, 12] };
/** Where a part bleeds from when nothing on it shows where: [bone, t] (the head bleeds from the nose). */
const PART_MID = { torso: [1, 0.35], armA: [3, 0.6], armB: [5, 0.6], legA: [7, 0.55], legB: [10, 0.55] };
/** For a stump: the joint before the end of it, so the way out of it is known. */
const BEFORE = {
  midHumA: 'shoulder', midForeA: 'elbowA', midHumB: 'shoulder', midForeB: 'elbowB',
  midFemA: 'hip', midTibA: 'kneeA', midFemB: 'hip', midTibB: 'kneeB',
};
/** The joints of each part, in from where it joins the body: whichever is furthest into a surface is what met it. */
const PART_JOINTS = {
  torso: ['hip', 'chest', 'neck'],
  armA: ['midHumA', 'elbowA', 'midForeA', 'handA'], armB: ['midHumB', 'elbowB', 'midForeB', 'handB'],
  legA: ['midFemA', 'kneeA', 'midTibA', 'footA', 'toeA'], legB: ['midFemB', 'kneeB', 'midTibB', 'footB', 'toeB'],
};
// a wound bleeding this fast (of their blood, a second) comes out in a stream: an artery, a stump, a throat
const SPURT_AT = 0.0045;

let ids = 0;
/** A new wound's name, for the stream coming out of it to be known by. */
export const woundId = () => ++ids;

/**
 * How much blood comes out of them, 0..1: all of it, until they are close
 * to bled dry - and none at all with none left, or frozen solid.
 */
export function bloodK(man) {
  const h = man && man.health;
  if (!h) return 1;
  if (h.dry || h.frozen) return 0;
  return Math.min(1, 0.2 + h.bloodLeft * 2.7);
}

/** Which way they face, the way they are drawn. */
const facingOf = (man) => (man.rag ? man.rag.facing : man.facing);

/** A point on the head, in the head's own frame (in head radii: +x the way the face looks, +y the top), out in the world. */
export function headPoint(man, lx, ly) {
  const j = man.wj, r = DIM.headR * man.scale, f = facingOf(man);
  const c = Math.cos(j.headAngle), s = Math.sin(j.headAngle);
  return { x: j.head.x + f * (lx * c + ly * s) * r, y: j.head.y + (-lx * s + ly * c) * r };
}

/** A direction in the head's own frame, out in the world. */
function headDir(man, lx, ly) {
  const j = man.wj, f = facingOf(man);
  const c = Math.cos(j.headAngle), s = Math.sin(j.headAngle);
  const x = f * (lx * c + ly * s), y = -lx * s + ly * c, d = Math.hypot(x, y) || 1;
  return { x: x / d, y: y / d };
}

/**
 * Where blood is coming out of them right now, and how fast (of their
 * blood, a second): { list: [{ x, y, nx, ny, rate, key, spurt }], total,
 * drip }. (nx, ny) is the way out of the wound; spurt, 0..1, is for one bad
 * enough to come out as a stream rather than drip; drip is how much of it
 * drips, the streams carrying most of theirs.
 */
export function bleedSources(man) {
  const h = man.health, j = man.wj;
  const list = [];
  let total = 0, drip = 0;
  if (h.dry || h.frozen) return { list, total, drip };
  const add = (x, y, nx, ny, rate, key, spurt = 0) => {
    if (!(rate > 0)) return;
    list.push({ x, y, nx, ny, rate, key, spurt });
    total += rate;
    drip += spurt ? rate * 0.25 : rate;
  };
  // out of the side of the bone it was opened on (or up, when that is not known)
  const fromWound = (w, rate, key, spurt) => {
    const q = pointOnBone(j, w.bone, w.t), q2 = pointOnBone(j, w.bone, w.t < 0.95 ? w.t + 0.05 : w.t - 0.05);
    let bx = q2.x - q.x, by = q2.y - q.y;
    const d = Math.hypot(bx, by) || 1;
    bx /= d; by /= d;
    let nx = -by, ny = bx;
    if (w.side ? nx * w.side < 0 : ny < 0) { nx = -nx; ny = -ny; }
    add(q.x, q.y, nx, ny, rate, key, spurt);
  };
  for (const part of PARTS) {
    const p = h.parts[part];
    // a stump: straight out of the end of it
    const st = h.stumps[part] || 0, end = man.cut[part];
    if (st > 0 && end && j[end]) {
      const a = j[BEFORE[end]] || j.hip, e = j[end];
      const d = Math.hypot(e.x - a.x, e.y - a.y) || 1;
      add(e.x, e.y, (e.x - a.x) / d, (e.y - a.y) / d, st, 'stump' + part, clamp(st / 0.009, 0.3, 1));
    }
    const bones = PART_BONES[part];
    const open = man.wounds.filter((w) => !w.stain && !w.burn && bones.includes(w.bone) && !goneAt(man.cut, w.bone, w.t));
    const knives = man.stuck.filter((e) => bones.includes(e.bone));
    // what bleeds inside stays inside - but for a little of it, out of any hole there is in the body
    const rate = p.bleed + (part === 'torso' && (open.length || knives.length) ? h.internal * 0.3 : 0);
    if (rate <= 0) continue;
    const marks = part === 'head' ? man.headMarks.filter((m) => !m.stain && !m.burn) : [];
    const f = h.face;
    const nose = part === 'head' && (f.nose > 0.2 || f.lip > 0.3 || f.brow > 0.3 || open.length + marks.length === 0);
    const n = open.length + knives.length + marks.length + (nose ? 1 : 0);
    if (!n) {
      // nothing shows where: the middle of it
      const [b, t] = PART_MID[part];
      fromWound({ bone: b, t }, rate, 'mid' + part, 0);
      continue;
    }
    // an opened artery is one wound - the last one made - and it takes most of it
    const artery = p.artery && open.length ? open[open.length - 1] : null;
    const each = artery ? rate * 0.3 / n : rate / n;
    for (const w of open) {
      const r = w === artery ? rate * 0.7 + each : each;
      // a stream: an artery, a throat, or anything bleeding that hard on its own
      const sp = w === artery ? clamp(p.bleed / 0.008, 0.35, 1) : r >= SPURT_AT ? clamp(r / 0.012, 0.25, 0.8) : 0;
      fromWound(w, r, 'w' + w.id, sp);
    }
    // round a blade that is still in them: it holds the wound mostly shut
    for (const e of knives) {
      const pose = man.knifePose(e), q = pointOnBone(j, e.bone, e.t);
      add(q.x, q.y, -pose.ux, -pose.uy, each, 'k' + man.stuck.indexOf(e), 0);
    }
    for (const m of marks) {
      const q = headPoint(man, m.x, m.y), dir = headDir(man, m.x || 0.01, m.y);
      add(q.x, q.y, dir.x, dir.y, each, 'h' + m.id, 0);
    }
    if (nose) {
      const q = headPoint(man, 0.86, -0.25), dir = headDir(man, 0.55, -0.85);
      add(q.x, q.y, dir.x, dir.y, each, 'nose', 0);
    }
  }
  // a punctured lung: they cough it up
  if (h.lung && h.internal > 0) {
    const q = headPoint(man, 0.62, -0.5), dir = headDir(man, 0.9, -0.2);
    add(q.x, q.y, dir.x, dir.y, h.internal * 0.12, 'mouth', 0);
  }
  return { list, total, drip };
}

/** One of the places it is coming out of, by how much drips from each. */
export function pickSource(src) {
  let r = Math.random() * src.drip;
  for (const s of src.list) {
    r -= s.spurt ? s.rate * 0.25 : s.rate;
    if (r <= 0) return s;
  }
  return src.list[src.list.length - 1];
}

/**
 * The streams out of them, kept going: one for each wound bad enough, never
 * quite stopping while the heart beats and surging with every beat - harder
 * the faster it goes - and only pouring out once it has stopped.
 */
export function feedStreams(man, src, dt) {
  const fx = man.sandbox.fx, h = man.health;
  // the heart: faster with the fear up and the blood going
  const bpm = man.alive ? clamp(66 + h.adrenaline * 55 + (1 - h.bloodLeft) * 70, 55, 170) : 0;
  man.heartT = (man.heartT || 0) + dt * bpm / 60;
  const ph = man.heartT % 1;
  const beat = bpm ? 0.34 + 0.66 * (ph < 0.42 ? Math.sin((ph / 0.42) * Math.PI) : 0) : 0;
  for (const s of src.list) {
    if (!s.spurt) continue;
    // stopped, the heart pushes nothing out: what there is runs out of the worst of it
    if (!bpm && s.rate < 0.002) continue;
    fx.feedStream(man.id + ':' + s.key, {
      x: s.x, y: s.y, nx: s.nx, ny: s.ny, vx: man.vel.x, vy: man.vel.y,
      flow: bpm ? s.spurt * beat : s.spurt * 0.4, power: bpm ? 1 + 2.6 * s.spurt : 0.3 + 0.3 * s.spurt,
      from: man, tint: man.tint || null,
    });
  }
}

/**
 * The point of `part` furthest into a surface whose face looks along
 * (nx, ny): where that part of them met it.
 */
export function contactOf(man, part, nx, ny) {
  const j = man.wj, s = man.scale;
  if (part === 'head') {
    const r = DIM.headR * s;
    return { x: j.head.x - nx * r, y: j.head.y - ny * r };
  }
  let names = PART_JOINTS[part] || PART_JOINTS.torso;
  // only as far as it goes, if some of it was cut off
  const end = man.cut[part];
  if (end && names.includes(end)) names = names.slice(0, names.indexOf(end) + 1);
  let best = j.hip, bd = Infinity;
  for (const k of names) {
    const p = j[k];
    if (!p) continue;
    const d = p.x * nx + p.y * ny;
    if (d < bd) { bd = d; best = p; }
  }
  const half = (DIM.line / 2) * s;
  return { x: best.x - nx * half, y: best.y - ny * half };
}

/**
 * Blood out of where a body met something hard - the point (x, y), on a
 * surface whose face looks along (nx, ny): thrown back off the surface and
 * out to either side of the point it hit, a squirt of it after a bad one,
 * blood on them there and on what they hit. `amount` is the damage that
 * part took.
 */
export function splatter(man, x, y, nx, ny, amount, part = null) {
  const sb = man.sandbox, fx = sb.fx;
  const k = bloodK(man);
  if (!sb.settings.blood || k <= 0 || amount <= 0) return 0;
  const tint = man.tint || null;
  const tx = -ny, ty = nx;
  const hard = clamp(amount / 30, 0.2, 1);
  const n = Math.round(clamp(amount * 0.45, 3, 28) * k);
  // (from just off the surface, so none of it starts inside what they hit)
  const ox = x + nx * 0.03, oy = y + ny * 0.03;
  const vx = clamp(man.vel.x, -6, 6) * 0.2, vy = clamp(man.vel.y, -6, 6) * 0.1;
  for (let i = 0; i < n; i++) {
    const out = rand(0.6, 3.2) * (0.5 + hard);
    const along = rand(-1, 1) * (1.2 + 2.6 * hard);
    fx.drop(ox, oy, nx * out + tx * along + vx, ny * out + ty * along + vy, rand(0.011, 0.026), man, tint);
  }
  // on what they hit, right where they hit it, and on them where they hit it
  fx.splashAt(x - nx * 0.02, y - ny * 0.02, clamp(0.022 + amount * 0.0016, 0.022, 0.065) * Math.max(0.5, k), tint);
  man.markAt(x, y, 0.6 + hard * 0.5);
  if (amount > 16) {
    const out = 1.5 + hard * 1.8, side = rand(-1.4, 1.4);
    fx.gush(ox, oy, nx * out + tx * side, ny * out + ty * side, k * hard, 0.12 + hard * 0.16, man, tint);
  }
  return n;
}

/* ------------------------------ on anything ------------------------------- */

/**
 * Blood landing on a thing, kept in the thing's own frame so it goes where
 * the thing goes: on a rigid body, in the body's frame (on a severed limb,
 * on the limb itself); on a thing made of points, by the nearest point; on
 * anything else, by where it is. Blood landing in blood already there makes
 * that bigger rather than adding to it. (A crate keeps its own: Crate.stain.)
 */
export function stainThing(t, x, y, r, tint = null) {
  if (t.stain) { t.stain(x, y, r, tint); return; }
  const list = t.stains || (t.stains = []);
  let at;
  if (t.body) {
    at = t.body.toLocal(x, y);
    // a severed limb: onto the limb, not the box round it
    if (t.local) at = nearestOnLine(t.local, at.x, at.y);
  } else if (t.rag) {
    let best = 0, bd = Infinity;
    t.rag.p.forEach((q, i) => {
      const d = Math.hypot(q.x - x, q.y - y);
      if (q.r > 0.005 && d < bd) { bd = d; best = i; }
    });
    const q = t.rag.p[best];
    at = { i: best, x: clamp(x - q.x, -q.r, q.r), y: clamp(y - q.y, -q.r, q.r) };
  } else {
    at = { x: x - t.pos.x, y: y - t.pos.y };
  }
  for (const s of list) {
    if (s.tint === tint && s.i === at.i && Math.hypot(s.x - at.x, s.y - at.y) < s.r) {
      s.r = Math.min(0.065, s.r + r * 0.18);
      return;
    }
  }
  if (list.length >= 48) list.shift();
  list.push({ i: at.i, x: at.x, y: at.y, r, a: rand(0, Math.PI), flat: rand(0.55, 1), dark: chance(0.3), tint });
}

/** The nearest point to (x, y) on a line through pts. */
function nearestOnLine(pts, x, y) {
  let best = { x: pts[0].x, y: pts[0].y }, bd = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1e-9;
    const t = clamp(((x - a.x) * vx + (y - a.y) * vy) / l2, 0, 1);
    const qx = a.x + vx * t, qy = a.y + vy * t, d = Math.hypot(x - qx, y - qy);
    if (d < bd) { bd = d; best = { x: qx, y: qy }; }
  }
  return best;
}

/** Blots of blood, each { x, y, r, a, flat, dark, tint }, where the canvas is now. */
export function drawBlots(ctx, list) {
  for (const st of list) {
    ctx.fillStyle = st.tint ? st.tint[st.dark ? 1 : 0] : st.dark ? 'rgba(110, 7, 16, 0.88)' : 'rgba(163, 16, 28, 0.82)';
    ctx.beginPath();
    ctx.ellipse(st.x, st.y, st.r, st.r * st.flat, st.a, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The blood on a thing (stainThing), drawn over it: kept inside its outline. */
export function drawStains(ctx, t) {
  const list = t.stains;
  if (!list || !list.length) return;
  if (t.body) {
    const b = t.body;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(b.rot);
    if (!t.local) {
      ctx.beginPath();
      ctx.rect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.clip();
    }
    drawBlots(ctx, list);
    ctx.restore();
    return;
  }
  const at = [];
  for (const s of list) {
    const o = t.rag ? t.rag.p[s.i] : t.pos;
    if (o) at.push({ ...s, x: o.x + s.x, y: o.y + s.y });
  }
  drawBlots(ctx, at);
}
