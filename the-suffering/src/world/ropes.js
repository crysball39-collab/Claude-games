/* =============================================================================
   Rope, and wire.

   With the rope in hand, TIE fastens one end to whatever is under the
   crosshair and within reach (a person, a crate, a beam, a wall, a lamp, a
   weapon lying about, the ground or the side of a building), and TIE again
   fastens the other end to something else. The rope is as long as the gap
   between them when it was tied. While there is slack it hangs in a curve;
   pulled tight it goes straight and holds, stretching a little.

   What holds and what gives depends on what is at each end: a crate on a
   rope behind somebody is dragged along; somebody tied to a wall, a beam or
   the ground can get no further than the rope lets them; two people tied
   together are each held by the other. A body on the ground is held, or
   dragged, by the physics itself.

   A rope pulled too hard snaps. A blade across it cuts it, and so, now and
   then, does a round. The heavy attack with the rope in hand unties the one
   nearest the crosshair.

   Wire goes on the same way (WIRE, then WIRE TO), but it is for power, not
   for holding things: an orange extension cord, with more slack in it, that
   pulls out of whatever it is plugged into long before a rope would give.
   Whatever a running generator is wired to has power (see power.js).
   ========================================================================== */
import { Body, Joint, rayBody } from '../physics/world.js';
import { ST } from '../human/human.js';
import { PARTS } from '../human/rig.js';
import { clamp, chance } from '../core/util.js';

const SEG = 12;
const REACH = 3.6;                    // metres from the player
const LONGEST = 16;
const ROPE = 0xa88a5c, WIRE = 0xd36a1f;
const _a = [0, 0, 0], _b = [0, 0, 0], _n = [0, 1, 0];

export class Ropes {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.pending = null;
    this.stats = { made: 0, snapped: 0, cut: 0, untied: 0 };
    this.marker = -1;
  }

  /* --------------------------------- picking ------------------------------- */

  /** Whatever is under the crosshair, within reach of the player. */
  pick() {
    const g = this.g, a = g.aim, p = g.player;
    // the camera is behind the player: reach is counted from the player, not the lens
    const back = Math.hypot(a.ox - p.x, a.oz - p.z);
    let best = REACH + back, end = null;
    const tw = g.world.rayWorld(a.ox, a.oy, a.oz, a.dx, a.dy, a.dz, best, _n);
    const at = (t) => [a.ox + a.dx * t, a.oy + a.dy * t, a.oz + a.dz * t];
    if (tw >= 0) { best = tw; end = { kind: 'world', wp: at(tw), ground: _n[1] > 0.7 }; }
    for (const o of g.props) {
      const t = o.vox ? o.vox.ray(a.ox, a.oy, a.oz, a.dx, a.dy, a.dz, best) : rayBody(o.body, a.ox, a.oy, a.oz, a.dx, a.dy, a.dz, best, null);
      if (t >= 0 && t < best) { best = t; end = { kind: 'prop', prop: o, body: o.body, wp: at(t) }; }
    }
    const ph = g.rayPeople(a.ox, a.oy, a.oz, a.dx, a.dy, a.dz, best, p, 0.03);
    if (ph) { best = ph.t; end = { kind: 'human', human: ph.human, part: ph.part, body: ph.human.bodies[ph.part], wp: at(ph.t) }; }
    if (!end) return null;
    // too close to the lens to be in reach of anyone's hands
    if (best < back - 0.6) return null;
    if (end.body) { end.body.toLocal(end.wp[0], end.wp[1], end.wp[2], _a); end.lp = [_a[0], _a[1], _a[2]]; }
    return end;
  }

  /** What to call one end, for a message. */
  name(e) {
    if (e.kind === 'world') return e.ground ? 'the ground' : 'the wall';
    if (e.kind === 'human') { const h = e.human; return `${h.look.first || 'their'}'s ${PARTS[e.part].label.replace(/^(left|right) /, '')}`; }
    const o = e.prop;
    if (o.vox) return 'the ' + o.vox.name.toLowerCase();
    if (o.thing) return 'the ' + o.thing.def.name.toLowerCase();
    if (o.item) return 'the ' + o.item.def.name;
    return 'the ' + o.kind;
  }

  /* ---------------------------------- using --------------------------------- */

  /** TIE (or WIRE): the first end, then the second. `kind` is 'rope' or 'wire'. */
  use(kind = 'rope') {
    const g = this.g, wire = kind === 'wire';
    if (this.pending && this.pendingKind !== kind) this.pending = null;
    const e = this.pick();
    if (!e) { g.ui?.toast(wire ? 'Nothing within reach to wire up.' : 'Nothing within reach to tie it to.'); return false; }
    if (!this.pending) {
      this.pending = e; this.pendingKind = kind;
      g.audio?.play(wire ? 'switch' : 'tie', 0.5);
      g.ui?.toast(wire ? `Wire on ${this.name(e)}. Now WIRE the other end to something.` : `Tied to ${this.name(e)}. Now TIE the other end to something.`);
      g.ui?._label();
      return true;
    }
    const A = this.pending;
    if ((A.body && A.body === e.body) || (A.human && A.human === e.human && A.part === e.part)) { g.ui?.toast('Both ends on the same thing. The other end goes on something else.'); return false; }
    const d = Math.hypot(A.wp[0] - e.wp[0], A.wp[1] - e.wp[1], A.wp[2] - e.wp[2]);
    if (d > LONGEST) { g.ui?.toast(wire ? 'Too far for one wire.' : 'Too far for one rope.'); return false; }
    // an end on something that has gone since: start again
    if (A.prop && !g.props.includes(A.prop)) { this.pending = null; g.ui?._label(); return this.use(kind); }
    const r = this.make(A, e, g.player, kind);
    this.pending = null;
    g.ui?._label();
    if (r && wire) {
      const live = g.power ? g.power.check(r) : false;
      g.ui?.toast(`Wire from ${this.name(A)} to ${this.name(e)}.` + (live ? ' It is live.' : !this._hasGenerator(r) ? ' Wire it to a generator to give it power.' : ' Start the generator and it is live.'));
    } else if (r) g.ui?.toast(`Rope from ${this.name(A)} to ${this.name(e)}.`);
    return !!r;
  }

  _hasGenerator(r) { return [r.a, r.b].some((e) => e.prop && e.prop.thing && e.prop.thing.type === 'generator'); }

  /** The heavy attack: the rope or wire nearest the crosshair comes off. */
  undo() {
    const g = this.g, a = g.aim, wire = !!g.weapons.def.wire;
    if (this.pending) { this.pending = null; g.ui?._label(); g.ui?.toast('Let go of the loose end.'); return true; }
    let best = null, bd = 0.45;
    for (const r of this.list) {
      if (!r.pts || r.wire !== wire) continue;
      for (let i = 0; i < SEG; i++) {
        const d = rayToSegment(a.ox, a.oy, a.oz, a.dx, a.dy, a.dz, 9, r.pts, i * 3, i * 3 + 3);
        if (d < bd) { bd = d; best = r; }
      }
    }
    if (!best) { g.ui?.toast(wire ? 'No wire there to unplug.' : 'No rope there to untie.'); return false; }
    this.remove(best);
    this.stats.untied++;
    g.audio?.play(wire ? 'switch' : 'tie', 0.4);
    g.ui?.toast(wire ? 'Unplugged.' : 'Untied.');
    return true;
  }

  /* ---------------------------------- making -------------------------------- */

  make(A, B, by = null, kind = 'rope') {
    const g = this.g, wire = kind === 'wire';
    const fix = (e) => {
      if (e.body) return e.body;
      // the world: a point that never moves
      const b = new Body({ hx: 0.02, hy: 0.02, hz: 0.02, mass: 1, x: e.wp[0], y: e.wp[1], z: e.wp[2], collides: false });
      b.setKinematic(true);
      return b;
    };
    const ba = fix(A), bb = fix(B);
    const la = A.body ? A.lp : [0, 0, 0], lb = B.body ? B.lp : [0, 0, 0];
    const d = Math.hypot(A.wp[0] - B.wp[0], A.wp[1] - B.wp[1], A.wp[2] - B.wp[2]);
    // a wire is laid with plenty of slack; a rope is tied at the length it is
    const len = Math.max(0.25, d * (wire ? 1.15 : 1.03));
    const joint = new Joint(ba, bb, { la, lb, rope: len, compliance: wire ? 1e-4 : 2.5e-5, damp: 0, name: kind });
    g.world.addJoint(joint);
    const r = { a: { ...A, body: ba, lp: la }, b: { ...B, body: bb, lp: lb }, joint, len, wire, inst: [], pts: null, born: g.time, by };
    for (let i = 0; i < SEG; i++) { const k = g.boxes.alloc(); g.boxes.colorHex(k, wire ? WIRE : ROPE); r.inst.push(k); }
    this.list.push(r);
    this.stats.made++;
    if (wire) this.stats.wires = (this.stats.wires || 0) + 1;
    g.audio?.at(wire ? 'switch' : 'tie', B.wp[0], B.wp[1], B.wp[2], 0.6);
    // somebody who has just had a rope tied to them notices, and so does anyone watching
    for (const e of [A, B]) {
      const h = e.human;
      if (!h || h.isPlayer || !h.mind || !h.h.alive || !h.h.conscious) continue;
      const m = h.mind;
      m.note('felt', wire ? 'wired' : 'tied', wire ? `somebody clipped a wire on to my ${PARTS[e.part].label}` : `somebody tied a rope to my ${PARTS[e.part].label}`, 0.8);
      m.stir('fear', wire ? 44 : 34); m.stir('surprise', 40); m.stir('anger', 20);
      m.ask(wire ? 'wired' : 'tied', 82);
      if (by) g.minds?.witness({ kind: 'tie', actor: by, victim: h, wire, x: e.wp[0], y: e.wp[1], z: e.wp[2] });
    }
    if (r.a.body.island) r.a.body.island.wake();
    if (r.b.body.island) r.b.body.island.wake();
    return r;
  }

  remove(r) {
    const i = this.list.indexOf(r);
    if (i < 0) return;
    this.list.splice(i, 1);
    this.g.world.removeJoint(r.joint);
    for (const k of r.inst) this.g.boxes.release(k);
    for (const e of [r.a, r.b]) if (e.human && !e.human.removed && e.human.mind && e.human.h.alive && e.human.h.conscious && this.g.time - r.born > 1) e.human.mind.ask('untied', 50);
  }

  snap(r, why) {
    const g = this.g, p = r.pts;
    if (p) { const m = (SEG >> 1) * 3; g.audio?.at('snap', p[m], p[m + 1], p[m + 2], 0.9); }
    this.remove(r);
    if (why === 'cut') this.stats.cut++; else this.stats.snapped++;
  }

  /** A body that has had its centre moved within it: rope ends stay on the same spot of it. */
  recentre(body, ox, oy, oz) {
    for (const r of this.list) for (const [e, a] of [[r.a, 'a'], [r.b, 'b']]) {
      if (e.body !== body) continue;
      e.lp = [e.lp[0] - ox, e.lp[1] - oy, e.lp[2] - oz];
      const j = r.joint;
      if (a === 'a') { j.lax = e.lp[0]; j.lay = e.lp[1]; j.laz = e.lp[2]; } else { j.lbx = e.lp[0]; j.lby = e.lp[1]; j.lbz = e.lp[2]; }
    }
  }

  /* --------------------------------- cutting ------------------------------ */

  /** A blade's edge moving from A to B this frame: any rope it passes through is cut. */
  cutBy(ax, ay, az, bx, by, bz) {
    let n = 0;
    for (const r of [...this.list]) {
      if (!r.pts) continue;
      for (let i = 0; i < SEG; i++) {
        if (segSegDist(ax, ay, az, bx, by, bz, r.pts, i * 3, i * 3 + 3) < 0.035) { this.snap(r, 'cut'); n++; break; }
      }
    }
    return n;
  }

  /** A round along a line: a rope right in its way may be cut. */
  shot(ox, oy, oz, dx, dy, dz, far) {
    for (const r of [...this.list]) {
      if (!r.pts) continue;
      for (let i = 0; i < SEG; i++) {
        if (rayToSegment(ox, oy, oz, dx, dy, dz, far, r.pts, i * 3, i * 3 + 3) < 0.02) { if (chance(0.45)) this.snap(r, 'cut'); break; }
      }
    }
  }

  /* ---------------------------------- frame --------------------------------- */

  /** Before the physics: people on their feet are held back by ropes that are tied to something that holds. */
  tether() {
    for (const r of this.list) {
      for (let s = 0; s < 2; s++) {
        const me = s ? r.b : r.a, other = s ? r.a : r.b;
        const h = me.human;
        if (!h || h.removed || h.state !== ST.ANIM) continue;
        me.body.toWorld(me.lp[0], me.lp[1], me.lp[2], _a);
        other.body.toWorld(other.lp[0], other.lp[1], other.lp[2], _b);
        const dx = _a[0] - _b[0], dy = _a[1] - _b[1], dz = _a[2] - _b[2];
        const d = Math.hypot(dx, dy, dz);
        if (d <= r.len) continue;
        const ob = other.body, oh = other.human;
        // something light on the other end is dragged by the physics; anything else holds
        const holds = !ob.island || (ob.kinematic && !oh) || ob.mass > 45 || (oh && oh.state === ST.ANIM);
        if (!holds) continue;
        const over = d - r.len, hd = Math.hypot(dx, dz) || 1;
        if (over * hd / (d || 1) < 0.004) continue;
        const k = oh && oh.state === ST.ANIM ? 0.5 : 1;
        const pull = Math.min(over * (hd / d), 0.25) * k;
        h.x -= dx / hd * pull; h.z -= dz / hd * pull;
        const into = (h.vx * dx + h.vz * dz) / hd;
        if (into > 0) { h.vx -= dx / hd * into; h.vz -= dz / hd * into; }
        // run to the end of a rope and it takes your feet out from under you
        if (into > 3.6 && h.tripCool <= 0) { h.tripCool = 2; h.toStumble(38, -dx / hd * 2, -dz / hd * 2); h.mind?.note('felt', 'yanked', 'got to the end of the rope and was yanked back', 0.7); }
      }
    }
  }

  update(dt) {
    const g = this.g;
    const def = g.weapons.def;
    if (this.pending && (!def.rope || (this.pendingKind === 'wire') !== !!def.wire || (this.pending.prop && !g.props.includes(this.pending.prop)) || (this.pending.human && this.pending.human.removed))) { this.pending = null; g.ui?._label(); }
    for (const r of [...this.list]) {
      // an end on something that is no longer there
      let gone = false;
      for (const e of [r.a, r.b]) {
        if (e.prop && !g.props.includes(e.prop)) gone = true;
        if (e.human && (e.human.removed || e.human.gone[e.part])) gone = true;
      }
      if (gone) { this.remove(r); continue; }
      const j = r.joint;
      // pulled past what it can take
      // (a wire pulls out of whatever it was plugged into long before a rope would break)
      if (j.force > (r.wire ? 900 : 8000)) { this.snap(r, 'force'); continue; }
      j.force = 0;
      // pulled tight against something asleep: wake it
      r.a.body.toWorld(r.a.lp[0], r.a.lp[1], r.a.lp[2], _a); r.b.body.toWorld(r.b.lp[0], r.b.lp[1], r.b.lp[2], _b);
      const d = Math.hypot(_a[0] - _b[0], _a[1] - _b[1], _a[2] - _b[2]);
      if (d > r.len * 0.995) for (const e of [r.a, r.b]) { const isl = e.body.island; if (isl && isl.sleeping) isl.wake(); }
      this._draw(r, _a, _b, d);
    }
    // the loose end, while you are choosing where the other goes
    const bx = g.boxes;
    if (this.pending) {
      if (this.marker < 0) { this.marker = bx.alloc(); bx.color(this.marker, 1.6, 1.3, 0.3); }
      const e = this.pending;
      if (e.body) e.body.toWorld(e.lp[0], e.lp[1], e.lp[2], _a); else { _a[0] = e.wp[0]; _a[1] = e.wp[1]; _a[2] = e.wp[2]; }
      const s = 0.05 + Math.sin(g.time * 8) * 0.01;
      bx.set(this.marker, _a[0], _a[1], _a[2], 0, 0, 0, 1, s, s, s);
    } else if (this.marker >= 0) { bx.release(this.marker); this.marker = -1; }
  }

  /** Twelve short pieces along the line from one end to the other, sagging by however much slack there is. */
  _draw(r, A, B, d) {
    const bx = this.g.boxes;
    const slack = r.len - d;
    const sag = slack > 0 ? Math.min(3, Math.sqrt(3 * Math.max(d, 0.05) * slack / 8)) : 0;
    const pts = r.pts || (r.pts = new Float32Array((SEG + 1) * 3));
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG, o = i * 3;
      pts[o] = A[0] + (B[0] - A[0]) * t; pts[o + 1] = A[1] + (B[1] - A[1]) * t - sag * 4 * t * (1 - t); pts[o + 2] = A[2] + (B[2] - A[2]) * t;
    }
    // nor does it hang through the ground
    const gh = this.g.world.ground;
    for (let i = 1; i < SEG; i++) { const o = i * 3, y = gh(pts[o], pts[o + 2]) + 0.012; if (pts[o + 1] < y) pts[o + 1] = y; }
    const w = r.wire ? 0.011 : 0.017;
    for (let i = 0; i < SEG; i++) {
      const o = i * 3;
      const ax = pts[o], ay = pts[o + 1], az = pts[o + 2], ex = pts[o + 3] - ax, ey = pts[o + 4] - ay, ez = pts[o + 5] - az;
      const len = Math.hypot(ex, ey, ez) || 1e-4;
      const ux = ex / len, uy = ey / len, uz = ez / len;
      // the turn that takes +X to the piece's direction
      let qy = -uz, qz = uy, qw = 1 + ux;
      const ql = Math.hypot(qy, qz, qw);
      if (ql < 1e-5) { qy = 1; qz = 0; qw = 0; } else { qy /= ql; qz /= ql; qw /= ql; }
      bx.set(r.inst[i], ax + ex / 2, ay + ey / 2, az + ez / 2, 0, qy, qz, qw, len + w * 0.6, w, w);
    }
  }

  clear() { for (const r of [...this.list]) this.remove(r); this.pending = null; }
}

/* ---------------------------------- geometry -------------------------------- */

/** The nearest a ray (from o along unit d, up to `far`) comes to the segment between two points in `p`. */
function rayToSegment(ox, oy, oz, dx, dy, dz, far, p, i, j) {
  return segSegDist(ox, oy, oz, ox + dx * far, oy + dy * far, oz + dz * far, p, i, j);
}

/** The nearest two segments come to each other: (a..b) and the points at i and j of `p`. */
function segSegDist(ax, ay, az, bx, by, bz, p, i, j) {
  const cx = p[i], cy = p[i + 1], cz = p[i + 2];
  const ex = p[j] - cx, ey = p[j + 1] - cy, ez = p[j + 2] - cz;
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const rx = ax - cx, ry = ay - cy, rz = az - cz;
  const a = ux * ux + uy * uy + uz * uz, e = ex * ex + ey * ey + ez * ez, f = ex * rx + ey * ry + ez * rz;
  let s = 0, t = 0;
  if (a <= 1e-12 && e <= 1e-12) { s = 0; t = 0; }
  else if (a <= 1e-12) { t = clamp(f / e, 0, 1); }
  else {
    const c = ux * rx + uy * ry + uz * rz;
    if (e <= 1e-12) s = clamp(-c / a, 0, 1);
    else {
      const b = ux * ex + uy * ey + uz * ez, den = a * e - b * b;
      s = den > 1e-12 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const qx = ax + ux * s - (cx + ex * t), qy = ay + uy * s - (cy + ey * t), qz = az + uz * s - (cz + ez * t);
  return Math.hypot(qx, qy, qz);
}

