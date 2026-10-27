/* =============================================================================
   GODZILLA - what he does to everything else.

     a foot coming down    whoever is under it is crushed flat; crates under
                           it are matchwood, rubble is ground smaller, a tree
                           is snapped off - and a stomp knocks everyone near
                           it off their feet
     walking               the rubble and the loose things in his way are
                           shoved aside, and the odd one crushed
     the roar              the glass goes in every building near him
     a bite                whoever is between his jaws is caught there; a
                           building loses a mouthful
     his claws, a kick,    whoever they go through is thrown, and the
       his tail            building they go through is gouged - a tail
                           through the ground floor of one, often enough,
                           brings the rest of it down (structures.js)
     eating                two bites, and whoever it was is gone

   Buildings are behind the street, out of the way of everyone else: only
   he is big enough to reach into them.
   ========================================================================== */
import { clamp, rand, chance, sign } from '../../core/util.js';
import { toWorld, K } from './body.js';

const alive = (p) => !!p && !p.removed && !p.dead;
const giant = (p) => !!(p && p.species && p.species.giant);
const B = (man) => man.gz.body;
const S = (man) => man.gz.body.sk;
const W = (man, p) => toWorld(B(man), man, p);
const CRUSH = 'crush';   // (a kind of harm no material is any harder against than any other)

/** Every slab, plant and log whose box is within r of (x, y): what a blow there can reach. */
function thingsNear(sb, x, y, r, o = {}) {
  const out = [];
  for (const w of sb.slabs) {
    if (w.removed || (o.loose && !w.loose) || (o.standing && w.loose)) continue;
    const b = w.body.aabb();
    if (x < b.minX - r || x > b.maxX + r || y < b.minY - r || y > b.maxY + r) continue;
    out.push(w);
  }
  if (o.plants !== false) {
    for (const t of sb.plants) {
      if (t.removed) continue;
      const b = t.bounds();
      if (x < b.x0 - r || x > b.x1 + r || y < b.y0 - r || y > b.y1 + r) continue;
      out.push(t);
    }
  }
  return out;
}

/** Harm to whatever is solid round (x, y): the cells of walls, buildings, rubble, trees. */
export function wreck(man, x, y, r, amount, o = {}) {
  const sb = man.sandbox;
  let gone = 0;
  for (const w of thingsNear(sb, x, y, r, o)) {
    blame(man, w);
    gone += w.damage(x, y, r, amount, o.kind || CRUSH, { dx: o.dx || 0, dy: o.dy ?? 1, speed: o.speed || 2 }) || 0;
    if (w.background) mostlyGone(man, w);
  }
  return gone;
}

/** A building he has had most of: that one counts as wrecked (once). */
function mostlyGone(man, w) {
  if (w.gzCells0 === undefined) w.gzCells0 = w.cellCount;
  if (!w.gzWrecked && w.gzCells0 > 300 && (w.removed || w.cellCount < w.gzCells0 * 0.4)) noteWrecked(man, w);
}

/** Whatever comes down off it in the next few seconds, and lands on somebody, is his doing. */
function blame(man, w) {
  w.thrownBy = man;
  w.thrownAt = man.sandbox.time;
}

export function noteWrecked(man, w) {
  if (w.gzWrecked) return;
  w.gzWrecked = true;
  const gz = man.gz;
  gz.wrecked = (gz.wrecked || 0) + 1;
  man.sandbox.emit('gzWreck', { who: man, what: w, x: w.body.pos.x, y: w.body.pos.y });
}

/* ------------------------------ people, and crates ----------------------------- */

/** Somebody he has just hurt: if it kills them, however it does (the fall after, say), it was him. */
export function struck(man, p) {
  p.gzHitBy = man;
  p.gzHitT = man.sandbox.time;
}

/** Somebody under his foot. */
function crush(man, p, x) {
  const sb = man.sandbox;
  const was = alive(p);
  if (p.steadfast) {
    // (something else that big: it takes it, and stays where it is)
    p.takeHit({ by: man, part: 'torso', x: p.pos.x, y: 0.6, dir: sign(p.pos.x - x) || 1, power: 25, kind: 'stomp', weapon: 'gzStomp' });
    return;
  }
  if (sb.hand && sb.hand.holding === p) sb.hand.release();
  // (dead at once - and not sent flying by it: pressed flat where they were)
  if (!p.dead) p.die('crushed', man, 0, 0.2);
  if (p.removed) return;
  p.health.cause = 'crushed';
  // flat: laid out along the ground where they stood, as long as they were tall (a body squashed
  // shorter than its bones would only spring back out)
  if (p.rag) {
    const side = sign(p.pos.x - x) || 1, x0 = p.pos.x;
    for (const q of p.rag.p) {
      const h = Math.max(0, q.y);
      q.x = x0 + side * h * 0.95 + (q.x - x0) * 0.25;
      q.y = (q.r || 0.03) + 0.005;
      q.px = q.x;
      q.py = q.y;
    }
    p.rag.wake();
  }
  p.gzFlat = true;
  const t = p.tint;
  sb.fx.blood(p.pos.x, 0.25, 2.6, 1.2, 34, 2, p, t);
  sb.fx.blood(p.pos.x, 0.25, -2.6, 1.2, 34, 2, p, t);
  sb.fx.pool(p.pos.x, 0, 1.6, t);
  sb.fx.splat(p.pos.x + rand(-0.4, 0.4), 0.5, t);
  sb.fx.splat(p.pos.x + rand(-0.9, 0.9), 0.3, t);
  sb.emit('gzCrush', { who: p, by: man, x: p.pos.x, y: 0.3, alive: was });
}

/** A crate under his foot: splinters. */
function smash(man, c) {
  const sb = man.sandbox, p = c.body.pos;
  for (let i = 0; i < 3; i++) sb.fx.splinters(p.x + rand(-0.3, 0.3), p.y, rand(-1, 1), rand(0.3, 1), 6);
  sb.fx.bits(p.x, p.y, 8, '#9b7148', rand(-2, 2), 2, { size: 0.06 });
  sb.fx.bits(p.x, p.y, 6, '#6e4b2f', rand(-2, 2), 2, { size: 0.05 });
  sb.emit('gzSmash', { who: man, what: c, x: p.x, y: p.y });
  sb.remove(c);
}

/**
 * A foot coming down (k: 1 for a stomp, less for a step): what is under it,
 * and - hard enough - everyone near it knocked off their feet.
 */
export function footDown(man, foot, k) {
  const sb = man.sandbox, sk = S(man), L = sk.legs[foot];
  const heel = W(man, L.heel), toe = W(man, L.toe);
  const x0 = Math.min(heel.x, toe.x) - 0.1, x1 = Math.max(heel.x, toe.x) + 0.1, cx = (x0 + x1) / 2;
  const top = 1.3 * K;
  for (const p of [...sb.people]) {
    if (p === man || p.removed || giant(p) || p.heldBy === man || p.state === 'held') continue;
    if (p.box.maxX < x0 || p.box.minX > x1 || p.box.minY > top) continue;
    // (a step does not always find them: it is a foot, not a wall)
    const mid = (p.box.minX + p.box.maxX) / 2;
    if (k < 0.5 && (mid < x0 + 0.15 || mid > x1 - 0.15)) continue;
    crush(man, p, cx);
  }
  for (const c of [...sb.crates]) {
    if (c.removed || c.carriedBy) continue;
    const b = c.body.aabb();
    if (b.maxX < x0 + 0.1 || b.minX > x1 - 0.1 || b.minY > top) continue;
    smash(man, c);
  }
  for (const t of sb.loose()) {
    if (!t.body || t.removed) continue;
    const b = t.body.aabb();
    if (b.maxX < x0 || b.minX > x1 || b.minY > top) continue;
    if (t.kind === 'wall' || t.kind === 'piece') {
      t.damage(cx, 0.3, (x1 - x0) * 0.55, 14 * Math.max(0.4, k), CRUSH, { dx: 0, dy: 1, speed: 2 });
      if (!t.removed && t.body.invMass > 0) t.body.applyImpulse(sign(t.body.pos.x - cx) * t.body.mass * 2.5, t.body.mass * 1.5, t.body.pos.x, t.body.pos.y);
    } else {
      const m = t.body.mass || 1;
      t.body.applyImpulse(sign(t.body.pos.x - cx) * m * rand(4, 8), m * rand(3, 6), t.body.pos.x, t.body.pos.y);
    }
  }
  for (const t of sb.plants) {
    if (t.removed) continue;
    const b = t.bounds();
    if (b.x1 < x0 || b.x0 > x1) continue;
    t.damage(Math.max(x0, Math.min(x1, t.x)), 0.4, 0.9, 30 * Math.max(0.5, k), CRUSH, { dx: 0, dy: 1, speed: 2 });
  }
  // the ground shaking: everybody near it, off their feet
  const R = 2.5 + 6 * k;
  if (k >= 0.5) {
    for (const p of sb.people) {
      if (p === man || !alive(p) || giant(p) || p.state === 'held' || p.lying || p.rag) continue;
      const d = Math.abs(p.pos.x - cx);
      if (d > R || p.pos.y > 2) continue;
      const q = 1 - d / R;
      if (q > 0.35 || chance(q * 1.6)) {
        struck(man, p);
        p.takeHit({ by: man, part: chance(0.5) ? 'legA' : 'legB', x: p.pos.x, y: 0.3, dir: sign(p.pos.x - cx) || 1, power: 0.6 + q * 1.4, kind: 'impact', weapon: 'gzQuake' });
        if (!p.removed && p.alive && !p.lying && !p.rag) {
          if (q > 0.5) p.launch(sign(p.pos.x - cx) * (2 + q * 5), 2 + q * 4);
          else p.knockDown(sign(p.pos.x - cx), 0.8 + q);
        }
      }
    }
    for (const c of sb.crates) {
      if (c.removed || c.carriedBy) continue;
      const d = Math.abs(c.body.pos.x - cx);
      if (d < R) c.body.applyImpulse(0, c.body.mass * (1 - d / R) * 4, c.body.pos.x + rand(-0.2, 0.2), c.body.pos.y);
    }
    // the glass in the nearest windows goes
    for (const w of thingsNear(sb, cx, 2, 5 * k, { standing: true, plants: false })) {
      if (!w.cellMat) continue;
      w.damage(cx, 2.5, 6 * k, 0.5 * k, 'blast', { only: (m) => m.brittle, mark: false, dx: 0, dy: 1, speed: 2, bulk: true, soft: true });
    }
  }
  sb.fx.dust(cx, 0.05, Math.round(8 + 22 * k), 1 + k * 2.5);
  sb.emit('gzStep', { who: man, x: cx, k, foot });
}

/** Walking: the rubble and loose things in front of his feet shoved out of the way, a little ground down. */
export function crushIn(man, dt) {
  const sb = man.sandbox, sk = S(man), g = B(man);
  const dir = Math.sign(man.gz.v) || man.facing;
  for (const foot of ['A', 'B']) {
    const L = sk.legs[foot];
    const a = W(man, L.heel), b = W(man, L.toe), ank = W(man, L.ankle);
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
    const top = ank.y + 0.5 * K;
    for (const t of sb.loose()) {
      if (!t.body || t.removed || t.body.invMass === 0) continue;
      const bb = t.body.aabb();
      if (bb.maxX < x0 - 0.2 || bb.minX > x1 + 0.2 || bb.minY > top) continue;
      const m = t.body.mass || 1;
      t.body.vel.x += (dir * 3 - t.body.vel.x) * Math.min(1, dt * 6);
      t.body.vel.y = Math.max(t.body.vel.y, 0.8);
      if ((t.kind === 'piece' || t.kind === 'wall') && chance(dt * 3)) t.damage((x0 + x1) / 2, Math.min(bb.maxY, 0.5), 0.5, 3, CRUSH, { dx: dir, dy: 0.5 });
      if (m > 200 && chance(dt * 2)) sb.fx.dust(bb.minX + rand(0, bb.maxX - bb.minX), 0.1, 2, 0.6);
    }
  }
}

/* ------------------------------------ the roar ---------------------------------- */

const ROAR_REACH = 17;

/**
 * The roar itself: the air shaking out from his mouth, and the glass in
 * every building it reaches going as it gets there (the nearest first, a
 * few at a time) - and everything on the ground jumps.
 */
export function roarAt(man) {
  const sb = man.sandbox, mo = W(man, S(man).mouth);
  sb.emit('gzRoar', { who: man, x: mo.x, y: mo.y });
  const todo = [];
  for (const w of sb.slabs) {
    if (w.removed || !(w.cellMat || w.mat.brittle)) continue;
    const b = w.body.aabb();
    const dx = Math.max(b.minX - mo.x, 0, mo.x - b.maxX), dy = Math.max(b.minY - mo.y, 0, mo.y - b.maxY);
    const d = Math.hypot(dx, dy);
    if (d <= ROAR_REACH) todo.push({ w, d });
  }
  todo.sort((a, b) => a.d - b.d);
  let r = 0;
  sb.effects.push({
    mod: 'godzilla',
    update(dt) {
      r += dt * 40;
      // (no more than two buildings' glass in one step)
      let n = 0;
      while (todo.length && todo[0].d <= r && n < 2) {
        const { w, d } = todo.shift();
        if (w.removed) continue;
        n++;
        const b = w.body.aabb(), k = 1 - d / ROAR_REACH;
        const px = clamp(mo.x, b.minX, b.maxX), py = clamp(mo.y, b.minY, b.maxY);
        if (w.cellMat) w.damage(px, py, 7 + k * 5, 0.35 + k * 1.3, 'blast', { only: (m) => m.brittle, mark: false, dx: sign(px - mo.x), dy: 0.3, speed: 2.5, bulk: true, soft: true });
        else if (d < 10) w.damage(px, py, 2, 3 * k, 'blast', { dx: sign(px - mo.x), dy: 0.2, speed: 2, soft: true });
      }
      return todo.length > 0;
    },
  });
  for (const c of sb.crates) {
    if (c.removed || c.carriedBy) continue;
    const d = Math.abs(c.body.pos.x - man.pos.x);
    if (d < 14) c.body.applyImpulse(0, c.body.mass * (1 - d / 14) * 2.5, c.body.pos.x + rand(-0.2, 0.2), c.body.pos.y);
  }
}

/* ------------------------------------ biting ------------------------------------ */

/**
 * His jaws shutting at `mo`. n 0: a bite - whoever is there is caught in them
 * (returned), or the building there loses a mouthful. n 1: the first bite of
 * whoever he is eating; n 2: the last, and they are gone.
 */
export function bite(man, mo, o, n, m = null) {
  const sb = man.sandbox, gz = man.gz, f = man.facing;
  sb.emit('gzChomp', { who: man, x: mo.x, y: mo.y, n });
  if (n === 0) {
    let best = null, bd = 1.45 * K;
    for (const p of sb.people) {
      if (p === man || p.removed || giant(p) || p.heldBy === man) continue;
      if (p.box.maxX < mo.x - 2 || p.box.minX > mo.x + 2 || p.box.maxY < mo.y - 2 || p.box.minY > mo.y + 2) continue;
      const q = p.nearestPart(mo.x, mo.y);
      if (q && q.d < bd) { bd = q.d; best = { p, q }; }
    }
    if (best) {
      const p = best.p, q = best.q;
      if (sb.hand && sb.hand.holding === p) sb.hand.release();
      const was = alive(p);
      struck(man, p);
      p.takeHit({ by: man, part: q.part, x: q.x, y: q.y, dir: f, power: 12, kind: 'bite', weapon: 'gzBite', bone: p.boneName(q.bone, q.t) });
      if (p.removed) return null;
      if (p.weapon) p.dropWeapon(0.5);
      p.grab(mo.x, mo.y, man);
      sb.fx.blood(mo.x, mo.y, f * 2, 1, 26, 1.4, p, p.tint);
      sb.emit('gzBite', { who: p, by: man, x: mo.x, y: mo.y, alive: was });
      return p;
    }
    // a mouthful of building
    let got = 0;
    for (const w of thingsNear(sb, mo.x, mo.y, 1.4 * K, { plants: true })) {
      if (w.kind === 'tree' || w.kind === 'bush') { w.damage(mo.x, mo.y, 0.9 * K, 20, CRUSH, { dx: f, dy: 0 }); got++; continue; }
      if (!w.contains(mo.x, mo.y, 0.9 * K)) continue;
      blame(man, w);
      if (w.background && w.gzCells0 === undefined) w.gzCells0 = w.cellCount;
      const piece = w.spec && w.spec.tear && w.anchored ? w.tearAt(mo.x, mo.y, 0.85 * K) : null;
      if (!w.removed) w.damage(mo.x, mo.y, 1.05 * K, 14, CRUSH, { dx: f, dy: -0.5, speed: 2 });
      if (piece && !piece.removed) piece.body.applyImpulse(f * piece.body.mass * 2, -piece.body.mass * 1, mo.x, mo.y);
      if (w.background) mostlyGone(man, w);
      got++;
    }
    if (got) { sb.fx.dust(mo.x, mo.y, 10, 1.4); sb.emit('gzBiteWall', { who: man, x: mo.x, y: mo.y }); }
    return null;
  }
  if (!o || o.removed) return null;
  if (n === 1) {
    const was = alive(o);
    if (!o.dead) o.die('eaten', man);
    o.health.cause = 'eaten';
    sb.fx.blood(mo.x, mo.y, f * 2.4, 0.4, 40, 1.6, o, o.tint);
    sb.fx.blood(mo.x, mo.y - 0.3, -f * 0.8, -0.6, 20, 1, o, o.tint);
    sb.fx.gush(mo.x, mo.y - 0.2, f * 1.2, -0.8, 0.9, 0.4, o, o.tint);
    return o;
  }
  // gone
  o.inMouth = true;
  sb.fx.blood(mo.x, mo.y - 0.2, f * 1.4, -1, 22, 1.2, null, o.tint);
  sb.emit('gzEat', { who: o, by: man, x: mo.x, y: mo.y, name: o.name });
  gz.eaten++;
  if (gz.holding === o) gz.holding = null;
  if (gz.mouthful === o) gz.mouthful = null;
  sb.remove(o, { quiet: true });
  return o;
}

/* ------------------------------ claws, foot, tail ------------------------------- */

/** Whoever a part of him going through (a, b), radius r, catches - once each move - and what happens to them. */
function strikeAlong(man, m, a, b, r, hitFn) {
  const sb = man.sandbox;
  const minX = Math.min(a.x, b.x) - r - 1, maxX = Math.max(a.x, b.x) + r + 1;
  for (const p of sb.people) {
    if (p === man || p.removed || giant(p) || m.hit.has(p) || p.heldBy === man) continue;
    if (p.box.maxX < minX || p.box.minX > maxX) continue;
    // (the nearest point of them to the line)
    let best = null;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      const q = p.nearestPart(x, y);
      if (q && (!best || q.d < best.d)) best = q;
    }
    if (!best || best.d > r) continue;
    m.hit.add(p);
    struck(man, p);
    hitFn(p, best);
  }
}

/** His claws going through `hand`: whoever is there, and three gouges in whatever is solid. */
export function claw(man, m, hand, side) {
  const sb = man.sandbox, f = man.facing;
  const prev = m.prevHand || hand;
  m.prevHand = { x: hand.x, y: hand.y };
  strikeAlong(man, m, prev, hand, 0.95 * K, (p, q) => {
    p.takeHit({ by: man, part: q.part, x: q.x, y: q.y, dir: f, power: 11, kind: 'claw', weapon: 'gzClaw', bone: p.boneName(q.bone, q.t) });
    if (!p.removed && p.alive && !p.steadfast) p.launch(f * rand(7, 11), rand(3, 6));
    sb.emit('gzClawHit', { who: p, by: man, x: q.x, y: q.y });
  });
  // (gouges: three, side by side, along the way the hand went)
  const dx = hand.x - prev.x, dy = hand.y - prev.y, l = Math.hypot(dx, dy);
  if (l < 0.02) return;
  const nx = -dy / l, ny = dx / l;
  m.gouge = (m.gouge || 0) + 1;
  if (m.gouge % 2) return;
  let hit = 0;
  for (const o of [-0.38, 0, 0.38]) {
    hit += wreck(man, hand.x + nx * o * K, hand.y + ny * o * K, 0.3 * K, 9, { dx: dx / l, dy: dy / l });
  }
  for (const c of sb.crates) {
    if (c.removed || c.carriedBy || m.hit.has(c) || !c.body.contains(hand.x, hand.y, 0.8 * K)) continue;
    m.hit.add(c);
    c.body.applyImpulse(f * c.body.mass * 9, c.body.mass * 3, hand.x, hand.y);
  }
  if (hit) sb.emit('gzGouge', { who: man, x: hand.x, y: hand.y });
}

/** A kick: the foot from `ank` to `toe`, through whoever and whatever is there. */
export function kickAt(man, m, ank, toe) {
  const sb = man.sandbox, f = man.facing;
  m.hit = m.hit || new Set();
  strikeAlong(man, m, ank, toe, 0.85 * K, (p, q) => {
    p.takeHit({ by: man, part: q.part, x: q.x, y: q.y, dir: f, power: 8, kind: 'kick', weapon: 'gzKick', bone: p.boneName(q.bone, q.t) });
    if (!p.removed && p.alive && !p.steadfast) p.launch(f * rand(12, 16), rand(6, 9));
    sb.emit('gzKickHit', { who: p, by: man, x: q.x, y: q.y });
  });
  for (const c of sb.crates) {
    if (c.removed || c.carriedBy || m.hit.has(c)) continue;
    const b = c.body.aabb();
    if (toe.x < b.minX - 0.6 || toe.x > b.maxX + 0.6 || toe.y < b.minY - 0.8 || toe.y > b.maxY + 0.8) continue;
    m.hit.add(c);
    c.body.applyImpulse(f * c.body.mass * 14, c.body.mass * 7, toe.x, toe.y);
  }
  for (const t of sb.loose()) {
    if (!t.body || t.removed || m.hit.has(t) || t.body.invMass === 0) continue;
    const b = t.body.aabb();
    if (toe.x < b.minX - 0.5 || toe.x > b.maxX + 0.5 || toe.y < b.minY - 0.8 || toe.y > b.maxY + 0.8) continue;
    m.hit.add(t);
    const mass = Math.min(t.body.mass, 400);
    t.body.applyImpulse(f * mass * 10, mass * 5, toe.x, toe.y);
  }
  m.kickT = (m.kickT || 0) + 1;
  if (m.kickT % 3 === 0) wreck(man, toe.x, toe.y, 0.85 * K, 12, { dx: f, dy: 0.3, standing: true });
}

/**
 * His tail going through whatever it reaches - in a spin, round in front
 * of him (dir the way it is going); in a lash, down on whatever is behind.
 */
export function tailHits(man, m, dir, k) {
  const sb = man.sandbox, caps = B(man).caps;
  const tail = caps.slice(3, 16);
  for (const c of tail) {
    const a = { x: c.x0, y: c.y0 }, b = { x: c.x1, y: c.y1 };
    strikeAlong(man, m, a, b, c.r + 0.35, (p, q) => {
      p.takeHit({ by: man, part: q.part, x: q.x, y: q.y, dir, power: 8 * k, kind: 'impact', weapon: 'gzTail', bone: p.boneName(q.bone, q.t) });
      if (!p.removed && p.alive && !p.steadfast) p.launch(dir * rand(13, 18) * k, rand(7, 10) * k);
      sb.emit('gzTailHit', { who: p, by: man, x: q.x, y: q.y });
    });
    for (const cr of sb.crates) {
      if (cr.removed || cr.carriedBy || m.hit.has(cr)) continue;
      const bb = cr.body.aabb();
      const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
      if (cx < bb.minX - c.r || cx > bb.maxX + c.r || cy < bb.minY - c.r || cy > bb.maxY + c.r) continue;
      m.hit.add(cr);
      cr.body.applyImpulse(dir * cr.body.mass * 16 * k, cr.body.mass * 8 * k, cx, cy);
    }
  }
  // through the buildings it reaches: a gash along it (not every step: it is the same tail)
  m.tailT = (m.tailT || 0) + 1;
  if (m.tailT % 3) return;
  let hit = 0;
  for (const c of tail) {
    const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
    hit += wreck(man, cx, cy, c.r + 0.15, 11 * k, { dx: dir, dy: 0.2 });
  }
  if (hit) sb.emit('gzGouge', { who: man, x: man.pos.x, y: 2 });
}

/* ------------------------------------ buildings ---------------------------------- */

/** A building still standing, with enough of it left to bother with. */
export const wreckable = (w) => !!w && !w.removed && !!w.spec && !!w.spec.background && w.anchored && w.cellCount > 200 && w.spec.load !== false &&
  w.body.aabb().maxY > 2.6;

/** The building he would go for: the nearest - in front of him, if there is one nearly as near. */
export function nearestBuilding(man) {
  let best = null, bs = Infinity;
  const skip = man.gz.skip;
  for (const w of man.sandbox.slabs) {
    if (!wreckable(w) || (skip && skip.has(w))) continue;
    const b = w.body.aabb();
    const cx = (b.minX + b.maxX) / 2;
    const d = Math.abs(cx - man.pos.x) + (sign(cx - man.pos.x) !== man.facing ? 7 : 0) + rand(0, 3);
    if (d < bs) { bs = d; best = w; }
  }
  return best;
}

/** A point on a building to go for: on his side of it, as high up as he can reach. */
export function buildingPoint(man, w) {
  const b = w.body.aabb();
  const from = man.pos.x < (b.minX + b.maxX) / 2 ? -1 : 1;
  const x = from < 0 ? b.minX - 0.2 : b.maxX + 0.2;
  const top = Math.min(b.maxY - 0.15, 12.5 * K), bottom = Math.min(1.2, top * 0.5);
  for (let i = 0; i < 10; i++) {
    const y = rand(bottom, Math.max(bottom + 0.1, top));
    const hit = w.firstSolid(x, y, -from, 0, b.maxX - b.minX + 0.4);
    if (hit) return { x: hit.x - from * 0.3, y: hit.y };
  }
  return null;
}

export { crush };
