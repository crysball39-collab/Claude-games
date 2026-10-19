/* =============================================================================
   Wires: ropes, rods and pins, tying things to each other - or to the world
   behind them.

     Wood rope         hemp: it hangs slack until it is pulled tight, swings,
                       and snaps under a hard enough pull, a bullet or a
                       blade, or fire
     Metal rope        steel cable: the same, but it takes a great deal more
     Fixed wood rope   a wooden rod: it keeps its two ends exactly as far
                       apart as they were, pushing or pulling, and does not
                       bend; strained too far, it snaps
     Fixed metal rope  a steel rod: the same, and far stronger
     Wood pin          a dowel through two things - or through one thing into
                       the world behind it: they stay together there, and
                       turn about it
     Metal pin         a bolt: the same, stronger

   An end is tied to something - a crate, a gun, a limb, a piece of wall, a
   wall, a branch of a tree, a stickman (by whatever part of them is nearest:
   a wrist, an ankle, the neck) - or to the world behind, where it stays.
   Somebody tied to anything goes limp in it, and does not get up until they
   are free; a rope round the neck that is holding them up chokes them.

   Every step, once everything has moved, each wire pulls its ends back to
   where it says they may be: a body by an impulse where it is tied (so it
   swings, and turns), a ragdoll's point by moving it, a branch by bending
   it. How hard it has had to pull is what it is under, and past what it
   can take, it goes.
   ========================================================================== */
import { clamp, rand, chance } from '../core/util.js';

/**
 * The six: what each is called, what kind of thing it is (a rope, a rod or a
 * pin), how hard a pull it takes (newtons, held for a moment), and how it
 * looks.
 */
export const WIRES = {
  woodRope: { name: 'Wood rope', rope: true, strength: 2600, wood: true, colour: '#9b7340', dark: '#5e4220', width: 0.03, cut: 0.6 },
  metalRope: { name: 'Metal rope', rope: true, strength: 12000, colour: '#9aa3aa', dark: '#5d646a', width: 0.018, cut: 0.06 },
  woodRod: { name: 'Fixed wood rope', rod: true, strength: 3400, wood: true, colour: '#b07c43', dark: '#6b4622', width: 0.05, cut: 0.15 },
  metalRod: { name: 'Fixed metal rope', rod: true, strength: 16000, colour: '#a6aeb5', dark: '#5a6167', width: 0.036, cut: 0 },
  woodPin: { name: 'Wood pin', pin: true, strength: 2400, wood: true, colour: '#b98a50', dark: '#6b4622', width: 0.05, cut: 0 },
  metalPin: { name: 'Metal pin', pin: true, strength: 10000, colour: '#c3c9ce', dark: '#4f565c', width: 0.045, cut: 0 },
};
export const isPin = (kind) => !!(WIRES[kind] && WIRES[kind].pin);

const STEP = 1 / 120;
const ITER = 6;

/* --------------------------------- ends ---------------------------------- */

/** Things a wire can be tied to, at (x, y): what the hand from above could pick up, but not the knife in a wound. */
export function tieable(t) {
  if (!t || t.removed || t.isWire) return false;
  if (t.wornBy || (t.stuckIn && t.stuckIn.person) || t.carriedBy) return false;
  return t.kind === 'stickman' || !!t.body || !!t.rag || !!t.branchAt;
}

/**
 * An end of a wire, tied to `t` at (x, y) - or, with no t, to the world
 * there. Somebody is tied by whichever of their points is nearest, and goes
 * limp to be tied at all.
 */
export function makeEnd(t, x, y) {
  if (!t) return { kind: 'world', x, y };
  if (t.kind === 'stickman') {
    if (!t.rag) t.goLimp({ state: t.dead ? 'dead' : t.conscious ? 'thrown' : 'ko', tone: 0.3 });
    if (!t.rag) {
      // ragdolls turned off: tied to the nearest joint, which the wire follows
      return { kind: 'joint', t, name: nearestJoint(t, x, y) };
    }
    return { kind: 'man', t, name: t.rag.p[nearestPoint(t.rag, x, y)].name };
  }
  if (t.branchAt) return { kind: 'tree', t, ...t.branchAt(x, y) };
  if (t.body) { const l = t.body.toLocal(x, y); return { kind: 'body', t, lx: l.x, ly: l.y }; }
  if (t.rag) return { kind: 'rag', t, i: nearestPoint(t.rag, x, y) };
  return { kind: 'world', x, y };
}

function nearestPoint(rag, x, y) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < rag.p.length; i++) {
    const q = rag.p[i];
    if (q.r <= 0.005) continue;
    const d = Math.hypot(q.x - x, q.y - y);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function nearestJoint(man, x, y) {
  let best = 'chest', bd = Infinity;
  for (const k of ['head', 'neck', 'chest', 'hip', 'handA', 'handB', 'elbowA', 'elbowB', 'kneeA', 'kneeB', 'footA', 'footB']) {
    const p = man.wj[k];
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

/** The point a ragdolled person is tied by, if they still have it. */
function manPoint(e) {
  const rag = e.t.rag;
  if (!rag) return null;
  const i = rag.byName[e.name];
  return i === undefined ? null : rag.p[i];
}

/** Where an end is, in the world, right now. */
export function endPos(e) {
  switch (e.kind) {
    case 'world': return { x: e.x, y: e.y };
    case 'body': return e.t.body.toWorld(e.lx, e.ly);
    case 'man': {
      const q = manPoint(e);
      if (q) return { x: q.x, y: q.y };
      const j = e.t.wj[e.name] || e.t.wj.chest;
      return { x: j.x, y: j.y };
    }
    case 'joint': { const j = e.t.wj[e.name]; return { x: j.x, y: j.y }; }
    case 'rag': { const q = e.t.rag.p[e.i]; return { x: q.x, y: q.y }; }
    case 'tree': return e.t.branchPoint(e.seg, e.along);
    default: return { x: 0, y: 0 };
  }
}

/** How easily an end gives, pulled along (nx, ny): 0 is not at all. */
function give(e, p, nx, ny) {
  switch (e.kind) {
    case 'body': {
      const b = e.t.body;
      if (!b.invMass) return 0;
      const rx = p.x - b.pos.x, ry = p.y - b.pos.y, rn = rx * ny - ry * nx;
      return b.invMass + b.invI * rn * rn;
    }
    case 'man': {
      const q = manPoint(e);
      return q && !e.t.rag.pinned ? q.im : 0;
    }
    case 'rag': return e.t.rag.pinned ? 0 : e.t.rag.p[e.i].im;
    case 'tree': return e.t.branchGive(e.seg, e.along, nx, ny);
    default: return 0;
  }
}

/** How fast an end is moving. */
function endVel(e, p) {
  switch (e.kind) {
    case 'body': return e.t.body.velAt(p.x, p.y);
    case 'man': { const q = manPoint(e); return q ? { x: (q.x - q.px) / STEP, y: (q.y - q.py) / STEP } : { x: e.t.vel.x, y: e.t.vel.y }; }
    case 'joint': return { x: e.t.vel.x, y: e.t.vel.y };
    case 'rag': { const q = e.t.rag.p[e.i]; return { x: (q.x - q.px) / STEP, y: (q.y - q.py) / STEP }; }
    default: return { x: 0, y: 0 };
  }
}

/** An end moved by (dx, dy) for its share of putting the wire right (a body: turned as well). */
function shove(e, p, dx, dy) {
  switch (e.kind) {
    case 'body': {
      const b = e.t.body;
      if (!b.invMass) return;
      // (dx, dy) is what the point should move; the body moves and turns, each by its own share
      const n = Math.hypot(dx, dy);
      if (n < 1e-9) return;
      const nx = dx / n, ny = dy / n;
      const rx = p.x - b.pos.x, ry = p.y - b.pos.y, rn = rx * ny - ry * nx;
      const w = b.invMass + b.invI * rn * rn;
      const lam = n / w;
      b.pos.x += b.invMass * lam * nx;
      b.pos.y += b.invMass * lam * ny;
      b.rot += b.invI * rn * lam;
      return;
    }
    case 'man': {
      const q = manPoint(e);
      if (q && !e.t.rag.pinned) { q.x += dx; q.y += dy; e.t.rag.wake(); }
      return;
    }
    case 'rag': {
      if (e.t.rag.pinned) return;
      const q = e.t.rag.p[e.i];
      q.x += dx; q.y += dy;
      e.t.rag.wake();
      return;
    }
    case 'tree': e.t.bendBy(e.seg, e.along, dx, dy); return;
    default:
  }
}

/** An impulse (ix, iy) on an end that has velocities of its own (a body). */
function kick(e, p, ix, iy) {
  if (e.kind !== 'body') return;
  const b = e.t.body;
  if (!b.invMass) return;
  b.applyImpulse(ix, iy, p.x, p.y);
}

/** Whether the thing an end is tied to has gone (removed, or no longer there to tie to). */
const gone = (e) => e.kind !== 'world' && (!e.t || e.t.removed || (e.kind === 'tree' && (e.seg.gone || !e.t.boughs.includes(e.seg))));

/* -------------------------------- a wire --------------------------------- */

let nextId = 1;

export class Wire {
  constructor(sb, type, a, b, o = {}) {
    const spec = WIRES[type];
    this.id = nextId++;
    this.isWire = true;
    this.kind = 'wire';
    this.type = type;
    this.spec = spec;
    this.name = spec.name;
    this.sandbox = sb;
    this.a = a;
    this.b = b;
    const pa = endPos(a), pb = endPos(b);
    this.len = spec.pin ? 0 : Math.max(0.05, Math.hypot(pb.x - pa.x, pb.y - pa.y) * (spec.rope ? 1.02 : 1));
    this.strain = 0;          // how hard it is being pulled, newtons (smoothed)
    this.burnT = 0;
    this.removed = false;
    this.moved = 0;           // this step: how far it has had to move its ends (weighted), and how hard it has had to stop them
    this.stopped = 0;
    // a rope is drawn as a chain of points that hangs and swings
    if (spec.rope) {
      const n = clamp(Math.round(this.len / 0.1), 4, 40);
      this.chain = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = pa.x + (pb.x - pa.x) * t, y = pa.y + (pb.y - pa.y) * t;
        this.chain.push({ x, y, px: x, py: y });
      }
    }
    for (const e of [a, b]) if (e.t && e.t.kind === 'stickman') (e.t.wires || (e.t.wires = [])).push(this);
  }

  /** Both ends, where they are now. */
  ends() { return [endPos(this.a), endPos(this.b)]; }

  /** What it is tied to, at each end: a name for each. */
  describe() {
    const say = (e) => (e.kind === 'world' ? 'the background' : e.t.kind === 'stickman' ? e.t.name : `the ${(e.t.name || 'thing').toLowerCase()}`);
    const k = this.spec.pin ? 'pinning' : 'between';
    const pct = Math.round(clamp(this.strain / this.spec.strength, 0, 1) * 100);
    return `${this.name}, ${k} ${say(this.a)} and ${say(this.b)} - ${pct}% of what it can take`;
  }

  /**
   * One pass of putting it right: the ends pulled (or pushed, a rod) back to
   * where they may be, and their speed apart taken away.
   */
  solve(first) {
    const spec = this.spec;
    const pa = endPos(this.a), pb = endPos(this.b);
    if (spec.pin) {
      // a pin: the two points together, in x and in y
      this.axis(pa, pb, 1, 0, pb.x - pa.x, first);
      const qa = endPos(this.a), qb = endPos(this.b);
      this.axis(qa, qb, 0, 1, qb.y - qa.y, first);
      return;
    }
    const dx = pb.x - pa.x, dy = pb.y - pa.y, d = Math.hypot(dx, dy);
    if (d < 1e-6) return;
    const nx = dx / d, ny = dy / d;
    const c = d - this.len;
    // a rope only pulls, and only once it is tight
    if (spec.rope && c <= 0) return;
    this.axis(pa, pb, nx, ny, c, first);
  }

  /** The two ends put right along (nx, ny), by c (how far apart they are past where they should be). */
  axis(pa, pb, nx, ny, c, first) {
    const wa = give(this.a, pa, nx, ny), wb = give(this.b, pb, nx, ny);
    const w = wa + wb;
    if (w <= 0) return;
    // where they are
    const lam = c / w;
    shove(this.a, pa, nx * lam * wa, ny * lam * wa);
    shove(this.b, pb, -nx * lam * wb, -ny * lam * wb);
    this.moved += Math.abs(lam);
    // and how fast they are moving apart (a body's speed; a ragdoll's is where it is)
    if (!first) return;
    const va = endVel(this.a, pa), vb = endVel(this.b, pb);
    let vn = (vb.x - va.x) * nx + (vb.y - va.y) * ny;
    if (this.spec.rope && vn < 0) return;
    const ka = this.a.kind === 'body' ? wa : 0, kb = this.b.kind === 'body' ? wb : 0;
    if (ka + kb <= 0) return;
    const j = vn / w;
    kick(this.a, pa, nx * j, ny * j);
    kick(this.b, pb, -nx * j, -ny * j);
    this.stopped += Math.abs(j);
  }

  /** After the passes: how hard it was pulled, and whether that was too much; the rope's chain moves. */
  after(dt) {
    const sb = this.sandbox;
    // the pull it took, in newtons: what it moved its ends by, or what it stopped them doing, whichever is more
    const pull = Math.max(this.moved / (dt * dt), this.stopped / dt);
    this.moved = this.stopped = 0;
    this.strain += (pull - this.strain) * (1 - Math.exp(-dt * 18));
    // a wooden one tied to something on fire burns through
    if (this.spec.wood && [this.a, this.b].some((e) => e.t && (e.t.flames || e.t.burning))) {
      this.burnT += dt;
      if (this.burnT > 3.5) { this.snap('burnt'); return; }
    }
    if (this.strain > this.spec.strength) { this.snap('strain'); return; }
    // round somebody's neck and holding them up: it chokes them
    for (const e of [this.a, this.b]) {
      if (e.kind === 'man' && (e.name === 'head' || e.name === 'neck') && this.strain > 260 && !this.spec.pin) e.t.necked = sb.time;
    }
    if (this.chain) this.swing(dt);
  }

  /** The rope's chain: hanging between its ends, swinging, never through the floor. */
  swing(dt) {
    const [pa, pb] = this.ends();
    const ch = this.chain, n = ch.length - 1, seg = this.len / n;
    const g = 18 * dt * dt;
    for (let i = 1; i < n; i++) {
      const q = ch[i];
      const vx = (q.x - q.px) * 0.985, vy = (q.y - q.py) * 0.985;
      q.px = q.x; q.py = q.y;
      q.x += vx; q.y += vy - g;
    }
    ch[0].x = pa.x; ch[0].y = pa.y; ch[n].x = pb.x; ch[n].y = pb.y;
    for (let it = 0; it < 8; it++) {
      for (let i = 0; i < n; i++) {
        const p = ch[i], q = ch[i + 1];
        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1e-6;
        // (stretched past its length, it is just straight: the ends are what it is holding)
        const k = (d - seg) / d * 0.5;
        if (i > 0) { p.x += dx * k; p.y += dy * k; }
        if (i + 1 < n) { q.x -= dx * k; q.y -= dy * k; }
      }
      for (let i = 1; i < n; i++) if (ch[i].y < 0.01) ch[i].y = 0.01;
    }
  }

  /** Gone: snapped, cut, burnt through - or taken away. */
  snap(why = 'strain') {
    if (this.removed) return;
    const sb = this.sandbox;
    const [pa, pb] = this.ends();
    const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
    sb.removeWire(this);
    // somebody tied by nothing else now: free
    for (const e of [this.a, this.b]) {
      const m = e.t && e.t.kind === 'stickman' ? e.t : null;
      if (m && !m.removed && !m.dead && !tiedUp(m)) m.notify('unroped', { why });
    }
    if (why !== 'removed') {
      sb.emit('wireSnap', { what: this, why, x: mx, y: my, metal: !this.spec.wood, pin: !!this.spec.pin });
      // a rope's two halves fall; a rod's, a pin's, in bits
      const cols = [this.spec.colour, this.spec.dark];
      for (let i = 0; i < (this.spec.rope ? 10 : 6); i++) {
        const t = i / 9, x = pa.x + (pb.x - pa.x) * t, y = pa.y + (pb.y - pa.y) * t;
        sb.fx.bits(x, y, 1, cols[i % 2], rand(-1, 1), rand(0, 1.5), { size: this.spec.width * 1.2 });
      }
    }
  }

  /** Whether the line from (x0, y0) to (x1, y1) crosses it: where, or null. */
  crossedBy(x0, y0, x1, y1) {
    const pts = this.chain || this.ends();
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i], q = pts[i + 1];
      const hit = segX(x0, y0, x1, y1, p.x, p.y, q.x, q.y);
      if (hit) return hit;
    }
    return null;
  }

  /** How near (x, y) is to it. */
  distTo(x, y) {
    const pts = this.chain || this.ends();
    if (pts.length === 2 && this.spec.pin) return Math.hypot(pts[0].x - x, pts[0].y - y);
    let best = Infinity;
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i], q = pts[i + 1];
      const vx = q.x - p.x, vy = q.y - p.y, l2 = vx * vx + vy * vy || 1e-9;
      const t = clamp(((x - p.x) * vx + (y - p.y) * vy) / l2, 0, 1);
      best = Math.min(best, Math.hypot(x - p.x - vx * t, y - p.y - vy * t));
    }
    return best;
  }

  /** A rope as it hangs, a rod straight between its ends, a pin's head. */
  draw(ctx) {
    const s = this.spec;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (s.pin) {
      const p = endPos(this.a);
      ctx.fillStyle = s.dark;
      ctx.beginPath(); ctx.arc(p.x, p.y, s.width * 0.75, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = s.colour;
      ctx.beginPath(); ctx.arc(p.x, p.y, s.width * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = s.dark;
      ctx.beginPath(); ctx.arc(p.x, p.y, s.width * 0.18, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const pts = this.chain || this.ends();
    // how hard it is pulled shows: a rod or a rope near its limit goes red
    const k = clamp(this.strain / s.strength, 0, 1);
    const line = (w, col) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    };
    line(s.width, s.dark);
    line(s.width * 0.55, k > 0.75 ? `rgb(${Math.round(150 + 105 * (k - 0.75) * 4)}, 70, 50)` : s.colour);
    if (s.rope && s.wood) {
      // the twist of the hemp
      ctx.strokeStyle = 'rgba(70, 46, 20, 0.6)';
      ctx.lineWidth = s.width * 0.25;
      ctx.setLineDash([s.width * 0.5, s.width * 0.9]);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // where it is tied: a knot, a bolt
    for (const p of [pts[0], pts[pts.length - 1]]) {
      ctx.fillStyle = s.dark;
      ctx.beginPath(); ctx.arc(p.x, p.y, s.width * 0.8, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/** Where two segments cross, or null. */
function segX(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / den, u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: ax + rx * t, y: ay + ry * t };
}

/* ----------------------------- the world's wires ----------------------------- */

/** Every wire, put right: a few passes, after everything else has moved this step. */
export function solveWires(sb, dt) {
  const ws = sb.wires;
  if (!ws.length) return;
  for (const w of [...ws]) if (gone(w.a) || gone(w.b) || deadEnd(w.a) || deadEnd(w.b)) w.snap('removed');
  for (let it = 0; it < ITER; it++) for (const w of ws) w.solve(it === 0);
  for (const w of [...ws]) w.after(dt);
}

/** An end tied by a point somebody no longer has (a hand cut off, say). */
function deadEnd(e) {
  if (e.kind !== 'man' || !e.t.rag) return false;
  return e.t.rag.byName[e.name] === undefined || (e.t.cut && Object.values(e.t.cut).some((c) => c && cutOff(e.name, c)));
}

// the points that go with each place a limb can be cut through
const BEYOND = {
  midForeA: ['handA'], midHumA: ['elbowA', 'midForeA', 'handA'], midForeB: ['handB'], midHumB: ['elbowB', 'midForeB', 'handB'],
  midTibA: ['footA', 'toeA'], midFemA: ['kneeA', 'midTibA', 'footA', 'toeA'], midTibB: ['footB', 'toeB'], midFemB: ['kneeB', 'midTibB', 'footB', 'toeB'],
};
const cutOff = (name, at) => (BEYOND[at] || []).includes(name);

/**
 * A wire of `type` from (x0, y0) on `t0` to (x1, y1) on `t1` (either may be
 * nothing: the world). Returns it, or a reason it could not be done.
 */
export function tie(sb, type, t0, x0, y0, t1, x1, y1) {
  const spec = WIRES[type];
  if (!spec) return { error: 'No such wire' };
  if (!t0 && !t1) return { error: 'Tie at least one end to something' };
  if (t0 && t0 === t1 && !spec.pin) return { error: 'Both ends are on the same thing' };
  if (!spec.pin && Math.hypot(x1 - x0, y1 - y0) < 0.08) return { error: 'The two ends are too close together' };
  if (sb.wires.length >= 120) return { error: "That's as many wires as the sandbox holds (120)" };
  const a = makeEnd(t0 && tieable(t0) ? t0 : null, x0, y0);
  const b = makeEnd(t1 && tieable(t1) ? t1 : null, x1, y1);
  const w = new Wire(sb, type, a, b);
  sb.addWire(w);
  for (const e of [a, b]) {
    if (e.t && e.t.kind === 'stickman' && !e.t.dead) e.t.notify('roped', { first: e.t.wires.filter((x) => !x.removed).length === 1, part: e.name, by: null });
  }
  sb.emit('wire', { what: w, x: x1, y: y1, pin: !!spec.pin, metal: !spec.wood });
  return w;
}

/**
 * A pin at (x, y): through the two things there, holding them together - or
 * through the one thing there into the world behind it.
 */
export function pinAt(sb, type, x, y, things) {
  const list = things.filter(tieable).slice(0, 2);
  if (!list.length) return { error: 'Nothing there to pin' };
  if (list.length === 1) return tie(sb, type, list[0], x, y, null, x, y);
  return tie(sb, type, list[0], x, y, list[1], x, y);
}

/** Whether somebody is tied to anything at all. */
export const tiedUp = (man) => !!(man.wires && man.wires.some((w) => !w.removed));

/** A chance for a bullet going from (x0, y0) to (x1, y1) to part a wire it crosses. */
export function bulletThrough(sb, x0, y0, x1, y1) {
  for (const w of [...sb.wires]) {
    if (!w.spec.cut) continue;
    const at = w.crossedBy(x0, y0, x1, y1);
    if (at && chance(w.spec.cut)) { w.snap('shot'); sb.fx.sparks(at.x, at.y, w.spec.wood ? 1 : 3); }
  }
}
