/* =============================================================================
   The gallows: an upright post, a beam out from the top of it with a brace
   under it, a platform at about chest height on two legs, a trapdoor in the
   platform with a lever beside it - and from the end of the beam, a rope
   with a noose on the end of it, hanging over the trapdoor.

   It is built of timbers, each a slab of wood like a wall (structures.js),
   cell by cell, and each held up by what it rests on: the post and the legs
   by the ground, the beam and the brace by the post, the platform by the post
   and its leg, the trapdoor by the platform and the front leg. Shoot through
   the post, saw at it, pull it away with the hand, and what it held comes
   down with it.

   The noose hangs and swings. Somebody's neck brought to it - carried there
   by the hand, or a limp body falling through it - and it closes round it.
   Set down on the trapdoor, they stand up in it, stuck there, and they know
   what it is for. Tap the gallows with the hand and the lever is pulled: the
   trapdoor drops open on its hinge, and whoever is standing on it drops
   through and hangs by the neck, which chokes them. Tap it again and the
   trapdoor is shut.
   ========================================================================== */
import { Slab, CELL } from './structures.js';
import { Wire, WIRES, tie, drawNooseLoop, noosed } from './wires.js';
import { DIM } from './skeleton.js';
import { clamp, rand } from '../core/util.js';

// how it is laid out: from the middle of the foot of the post (metres)
const POST = { x: 0, w: 0.24, h: 4 };
const BEAM = { x0: -0.12, x1: 1.88, y: 3.8, h: 0.2 };
const DECK = { x0: 0, x1: 1.44, y: 1.1, h: 0.16 };
const LEG = { x: 0.83, w: 0.16 };
const FRONT = { x: 2.24, w: 0.16 };
const TRAP = { x0: 1.44, x1: 2.16, h: 0.12 };
const NOOSE = { x: 1.8, len: 1.27, loop: 0.085, give: 0.25 };
const LEVER = { x: 0.42, len: 0.5 };

let nextId = 1;

/** The cells of a slab with c in [c0, c1] and r in [r0, r1] (inclusive), as indices. */
function cellsIn(s, c0, c1, r0, r1) {
  const out = new Set();
  for (let r = Math.max(0, r0); r <= Math.min(s.rows - 1, r1); r++) {
    for (let c = Math.max(0, c0); c <= Math.min(s.cols - 1, c1); c++) out.add(r * s.cols + c);
  }
  return out;
}

export class Gallows {
  /** Standing with the foot of its post at (x, y). */
  constructor(sb, x, y) {
    this.id = nextId++;
    this.sandbox = sb;
    this.kind = 'gallows';
    this.name = 'Gallows';
    this.x = x;
    this.y = y;
    this.removed = false;
    this.frozenInPlace = false;
    this.open = false;
    this.lever = 0;            // 0 home .. 1 pulled
    this.wire = null;          // the noose, round somebody's neck
    this.hinge = null;         // the pin the trapdoor swings on, while it is open
    this.noose = null;         // the noose hanging empty: a chain of points
    this.nooseT = 0;
    const part = (name, cx, y0, w, h, rot = 0) => {
      const s = new Slab(sb, 'gallows', cx, y0, { size: { w, h }, rot, group: this, name: `Gallows ${name}` });
      s.part = name;
      return sb.addSlab(s);
    };
    this.post = part('post', x + POST.x, y, POST.w, POST.h);
    this.beam = part('beam', x + (BEAM.x0 + BEAM.x1) / 2, y + BEAM.y, BEAM.x1 - BEAM.x0, BEAM.h);
    this.leg = part('leg', x + LEG.x, y, LEG.w, DECK.y + 0.02);
    this.front = part('front leg', x + FRONT.x, y, FRONT.w, DECK.y + DECK.h);
    this.deck = part('platform', x + (DECK.x0 + DECK.x1) / 2, y + DECK.y, DECK.x1 - DECK.x0, DECK.h);
    this.trap = part('trapdoor', x + (TRAP.x0 + TRAP.x1) / 2, y + DECK.y + DECK.h - TRAP.h, TRAP.x1 - TRAP.x0, TRAP.h);
    // the brace: from the post up to the beam, at forty-five degrees
    const bl = 1.12, bx0 = x + 0.06, by0 = y + 3.05, d = Math.SQRT1_2;
    this.brace = new Slab(sb, 'gallows', 0, 0, {
      size: { w: 0.12, h: bl }, group: this, name: 'Gallows brace', rot: -Math.PI / 4, at: { x: bx0 + d * bl / 2, y: by0 + d * bl / 2 },
    });
    this.brace.part = 'brace';
    sb.addSlab(this.brace);
    // what holds each part up (the post and the legs stand on the ground)
    const hold = (s, by, cells, gx, gy) => ({ cells, by, gx, gy });
    const b = this.beam, k = this.brace, dk = this.deck, tr = this.trap;
    b.holds = [hold(b, this.post, cellsIn(b, 0, Math.round(POST.w / CELL) - 1, 0, b.rows - 1), POST.w / 2, b.gh / 2)];
    k.holds = [
      hold(k, this.post, cellsIn(k, 0, k.cols - 1, 0, 1), k.gw / 2, CELL),
      hold(k, b, cellsIn(k, 0, k.cols - 1, k.rows - 2, k.rows - 1), k.gw / 2, k.gh - CELL),
    ];
    const legC = Math.round((LEG.x - DECK.x0) / CELL);
    dk.holds = [
      hold(dk, this.post, cellsIn(dk, 0, 1, 0, dk.rows - 1), CELL * 0.75, dk.gh / 2),
      hold(dk, this.leg, cellsIn(dk, legC - 2, legC + 2, 0, 0), LEG.x - DECK.x0, CELL * 0.5),
    ];
    tr.holds = [
      hold(tr, dk, cellsIn(tr, 0, 0, 0, tr.rows - 1), -CELL * 0.75, tr.gh / 2),
      hold(tr, this.front, cellsIn(tr, tr.cols - 1, tr.cols - 1, 0, tr.rows - 1), tr.gw + CELL, tr.gh / 2),
    ];
    // where the trapdoor sits, shut: its grid's middle (to be put back there)
    this.trapHome = tr.gridCentre();
    this.trapHolds = tr.holds;
    this.hang();
  }

  get pos() { return { x: this.x + 0.9, y: this.y + 2 }; }
  /** Every part of it still standing as part of it (the pieces that have come off are loose bits of wood). */
  get parts() { return this.sandbox.slabs.filter((s) => s.group === this && !s.removed); }

  /** Where the noose's rope is fixed to the beam, in the world - or null, with no beam to hang it from. */
  anchor() {
    const b = this.beam;
    if (!b || b.removed || !b.contains(...this.anchorAt(), CELL)) return null;
    const [x, y] = this.anchorAt();
    return { x, y };
  }

  /** The spot under the end of the beam the rope is tied to, as the beam is now. */
  anchorAt() {
    const p = this.beam.fromGrid(NOOSE.x - BEAM.x0, CELL * 0.6);
    return [p.x, p.y];
  }

  /** A fresh noose, hanging empty from the beam. */
  hang() {
    const a = this.anchor();
    if (!a) { this.noose = null; this.nooseT = 1; return; }
    const n = 12, pts = [];
    for (let i = 0; i <= n; i++) {
      const y = a.y - (NOOSE.len * i) / n;
      pts.push({ x: a.x, y, px: a.x, py: y });
    }
    this.noose = pts;
  }

  /** The middle of the loop of the empty noose. */
  loopAt() {
    const n = this.noose;
    if (!n) return null;
    const p = n[n.length - 1], q = n[n.length - 2];
    const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / d) * NOOSE.loop, y: p.y + (dy / d) * NOOSE.loop };
  }

  update(dt) {
    const sb = this.sandbox;
    // the lever goes where it was put
    this.lever += clamp((this.open ? 1 : 0) - this.lever, -dt * 6, dt * 6);
    // the trapdoor, open: when it is gone, so is its hinge
    if (this.hinge && this.hinge.removed) this.hinge = null;
    // and on its hinge it swings down as far as hanging straight down - no further, in under the platform
    if (this.open && this.hinge && this.trap && !this.trap.removed) this.stop(this.trap);
    // the noose round somebody: until it is cut, or they are gone
    if (this.wire && this.wire.removed) { this.wire = null; this.nooseT = 1.5; }
    if (this.wire) { this.settleIn(); return; }
    if (!this.noose) {
      // a rope cut (or snapped) is replaced, after a moment
      if ((this.nooseT -= dt) <= 0) this.hang();
      return;
    }
    const a = this.anchor();
    if (!a) { this.noose = null; this.nooseT = 1e9; return; }
    // a neck brought to the loop, by the hand or falling limp: it closes round it
    // (looked for before the rope swings, so the body on its way in does not knock it away first)
    const loop = this.loopAt();
    for (const p of sb.people) {
      if (p.removed || noosed(p) || !(p.state === 'held' || p.rag)) continue;
      const s = p.scale || 1, head = p.wj.head;
      const neck = p.rag && p.rag.byName.neck !== undefined ? p.rag.p[p.rag.byName.neck] : p.wj.neck;
      // (the neck at the loop, or the head just through it)
      if (Math.hypot(neck.x - loop.x, neck.y - loop.y) > 0.22 * s && Math.hypot(head.x - loop.x, head.y - loop.y) > 0.15 * s) continue;
      this.closeOn(p, a);
      return;
    }
    this.swing(dt, a);
  }

  /**
   * Somebody just put in the noose by the hand, let go: they are set down
   * straight under it, on their feet on the trapdoor (the trapdoor shut), and
   * stand there - not dropped in a heap, or off to one side, choking on the
   * edge of the platform before anybody has touched the lever.
   */
  settleIn() {
    const w = this.wire, p = w.b.t;
    if (this.placed || !p || p.removed || p.state === 'held') return;
    this.placed = true;
    const tr = this.trap;
    if (this.open || !tr || tr.removed || !tr.anchored) return;
    const w0 = p.wj, x = this.x + NOOSE.x - 0.08, dx = x - w0.hip.x;
    // (only if they were let go of over the platform, and not below it)
    if (Math.abs(dx) > 1.2 || w0.hip.y < tr.pos.y) return;
    const top = tr.body.aabb().maxY;
    const rag = p.rag;
    if (!rag) {
      p.pos.x += dx;
      p.vel.x = 0;
      return;
    }
    // under the noose, nothing below the top of the trapdoor, and still
    let low = Infinity;
    for (const q of rag.p) low = Math.min(low, q.y - (q.r || 0));
    const dy = Math.max(0, top + 0.01 - low);
    for (const q of rag.p) { q.x += dx; q.y += dy; q.px = q.x; q.py = q.y; }
    p.vel.x = p.vel.y = 0;
    rag.wake();
    // and, awake and able to, onto their feet: there and then, near enough the
    // trapdoor - or, higher, dropping onto it (the neck staying where it was, not
    // the whole body standing up from wherever the legs had swung to)
    if (!p.alive || !p.conscious || p.state !== 'thrown' || !p.health.canUse('legA') || !p.health.canUse('legB')) return;
    const s = p.scale || 1, y = Math.max(top, rag.p[rag.byName.neck].y - (DIM.thigh + DIM.shin + DIM.torso) * s);
    if (y - top < 0.15) p.recover('stand', 'idle', { dur: 0.35 });
    else { p.recover('air', 'fall', { dur: 0.25 }); p.pos.y = y; }
  }

  /**
   * The trapdoor, open, swung down against its stop: hanging straight down
   * from its hinge, where a catch takes it and keeps it - it would swing back
   * into whoever has dropped through, and be something under their feet. The
   * hand can still take it off the catch.
   */
  stop(tr) {
    const b = tr.body, h = this.hingeAt;
    const held = this.sandbox.hand && this.sandbox.hand.holding === tr;
    if (this.latched) {
      if (held) { this.latched = false; b.setKinematic(false); }
      // (still caught: whatever has been done to it since)
      else if (!b.kinematic) b.setKinematic(true);
      return;
    }
    if (b.rot >= -Math.PI / 2) return;
    b.rot = -Math.PI / 2;
    const at = tr.fromGrid(CELL * 0.6, tr.gh / 2);
    b.pos.x += h.x - at.x;
    b.pos.y += h.y - at.y;
    b.vel.x = b.vel.y = b.angVel = 0;
    if (!held) { this.latched = true; b.setKinematic(true); }
  }

  /** The empty noose, hanging from the beam: swinging, and never through the floor. */
  swing(dt, a) {
    const ch = this.noose, n = ch.length - 1, seg = NOOSE.len / n, g = 18 * dt * dt;
    for (let i = 1; i <= n; i++) {
      const q = ch[i];
      const vx = (q.x - q.px) * 0.99, vy = (q.y - q.py) * 0.99;
      q.px = q.x; q.py = q.y;
      q.x += vx; q.y += vy - g;
    }
    ch[0].x = a.x; ch[0].y = a.y;
    for (let it = 0; it < 6; it++) {
      for (let i = 0; i < n; i++) {
        const p = ch[i], q = ch[i + 1];
        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1e-6, k = (d - seg) / d;
        if (i > 0) { p.x += dx * k * 0.5; p.y += dy * k * 0.5; q.x -= dx * k * 0.5; q.y -= dy * k * 0.5; } else { q.x -= dx * k; q.y -= dy * k; }
      }
      for (let i = 1; i <= n; i++) if (ch[i].y < 0.02) ch[i].y = 0.02;
    }
    // anything moving through it pushes it aside (but not somebody the hand is putting in it)
    for (const p of this.sandbox.people) {
      if (p.removed || p.state === 'held') continue;
      for (const j of [p.wj.head, p.wj.chest]) {
        for (let i = 2; i <= n; i++) {
          const q = ch[i], d = Math.hypot(q.x - j.x, q.y - j.y), r = 0.12;
          if (d < r && d > 1e-6) { q.x = j.x + ((q.x - j.x) / d) * r; q.y = j.y + ((q.y - j.y) / d) * r; }
        }
      }
    }
  }

  /** The noose round p's neck: a rope from the beam that holds them by it from now on. */
  closeOn(p, a) {
    const sb = this.sandbox, b = this.beam;
    if (!p.rag && p.ragdolls) p.goLimp({ state: 'thrown', tone: 0.35 });
    const l = b.body.toLocal(a.x, a.y);
    const end = p.rag ? { kind: 'man', t: p, name: 'neck' } : { kind: 'joint', t: p, name: 'neck' };
    const w = new Wire(sb, 'noose', { kind: 'body', t: b, lx: l.x, ly: l.y }, end);
    // (the open loop takes up rope that closing it round a neck gives back: room for them to stand on the trapdoor)
    w.len = NOOSE.len + NOOSE.loop + NOOSE.give;
    w.gallows = this;
    sb.addWire(w);
    this.wire = w;
    // (put in it by the hand - or let go of by it just as it closed - they are set down in it)
    this.placed = p.state !== 'held' && !(sb.time - (p.thrownAt ?? -99) < 0.6);
    this.noose = null;
    const neck = p.wj.neck;
    sb.emit('noosed', { who: p, what: this, x: neck.x, y: neck.y });
    p.notify('noosed', { what: this });
  }

  /**
   * The lever, pulled (tapped with the hand): the trapdoor drops open on its
   * hinge - or, open, it is shut again. What it says happened.
   */
  pull() {
    const sb = this.sandbox, tr = this.trap, dk = this.deck;
    if (!tr || tr.removed) return 'The trapdoor is gone';
    if (!this.open) {
      if (!tr.anchored) return 'The trapdoor has come loose';
      // who is standing on it, or hanging over it, goes down with it
      const on = sb.people.filter((p) => !p.removed && Math.abs(p.wj.hip.x - tr.pos.x) < 0.5 && p.pos.y > tr.pos.y - 0.1 && p.pos.y < tr.pos.y + 0.6);
      this.open = true;
      tr.uproot();
      // it gives way under them: nothing to stand on (they drop through, not ride it
      // down, pushing it round as they go), and nothing it catches on as it swings -
      // the platform its hinge is in, or the people that were on it
      tr.dropping = true;
      tr.body.ignore = new Set([...(dk && !dk.removed ? [dk.body] : []), ...on.map((p) => p.proxy).filter(Boolean)]);
      for (const p of on) if (p.support === tr.body) { p.onGround = false; p.support = null; }
      const hx = this.x + TRAP.x0 + CELL * 0.6, hy = tr.pos.y;
      this.hingeAt = { x: hx, y: hy };
      if (dk && !dk.removed) {
        const w = tie(sb, 'metalPin', tr, hx, hy, dk, hx, hy);
        this.hinge = w && !w.error ? w : null;
      }
      tr.body.angVel = -1.5;
      // (seen where whoever was on it is: the trapdoor itself is out of sight behind the edge of the platform from most places)
      sb.emit('trapdoor', { what: this, open: true, x: tr.pos.x, y: tr.pos.y + 0.6, on });
      return 'The lever is pulled: the trapdoor drops open';
    }
    // shut again: back on its hinge, flat, held where it was
    if (this.hinge && !this.hinge.removed) this.hinge.snap('removed');
    this.hinge = null;
    this.open = false;
    tr.body.rot = 0;
    tr.body.vel.x = tr.body.vel.y = tr.body.angVel = 0;
    const g = tr.gridCentre();
    tr.body.pos.x += this.trapHome.x - g.x;
    tr.body.pos.y += this.trapHome.y - g.y;
    tr.body.ignore = null;
    tr.dropping = false;
    this.latched = false;
    tr.anchored = true;
    tr.holds = this.trapHolds;
    tr.holdSig = undefined;
    tr.fit();
    sb.emit('trapdoor', { what: this, open: false, x: tr.pos.x, y: tr.pos.y, on: [] });
    return 'The trapdoor is shut again';
  }

  /** What it says for itself, tapped: the lever, pulled. */
  tap() { return this.pull(); }

  /** Moved by (dx, dy), as it is: every part of it. */
  shift(dx, dy) {
    for (const s of this.parts) s.shift(dx, dy);
    this.x += dx;
    this.y += dy;
    this.trapHome = { x: this.trapHome.x + dx, y: this.trapHome.y + dy };
    if (this.hingeAt) this.hingeAt = { x: this.hingeAt.x + dx, y: this.hingeAt.y + dy };
    if (this.noose) for (const q of this.noose) { q.x += dx; q.y += dy; q.px += dx; q.py += dy; }
  }

  /** Out of the world: every part of it, and its rope. */
  leave() {
    const sb = this.sandbox;
    for (const w of [this.wire, this.hinge]) if (w && !w.removed) w.snap('removed');
    for (const s of this.parts) sb.remove(s, { quiet: true });
    this.noose = null;
    this.removed = true;
  }

  /** The lever, and the empty noose; the timbers draw themselves (they are slabs). */
  draw(ctx) {
    const dk = this.deck;
    if (dk && !dk.removed) {
      const base = { x: this.x + LEVER.x, y: this.y + DECK.y + DECK.h };
      const a = Math.PI / 2 + 0.55 - this.lever * 1.1;
      const tip = { x: base.x + Math.cos(a) * LEVER.len, y: base.y + Math.sin(a) * LEVER.len };
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#2c2d30';
      ctx.lineWidth = 0.045;
      ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
      ctx.strokeStyle = '#8d969e';
      ctx.lineWidth = 0.02;
      ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
      ctx.fillStyle = '#7a1414';
      ctx.beginPath(); ctx.arc(tip.x, tip.y, 0.045, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2c2d30';
      ctx.fillRect(base.x - 0.06, base.y - 0.01, 0.12, 0.05);
    }
    if (!this.noose) return;
    const ch = this.noose, spec = WIRES.noose;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [w, col] of [[spec.width, spec.dark], [spec.width * 0.55, spec.colour]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(ch[0].x, ch[0].y);
      for (let i = 1; i < ch.length; i++) ctx.lineTo(ch[i].x, ch[i].y);
      ctx.stroke();
    }
    drawNooseLoop(ctx, ch[ch.length - 1], ch[ch.length - 2], spec);
  }
}

/** A gallows drawn for the spawn menu: its foot at (x, y), `h` tall. */
export function drawGallowsShape(ctx, x, y, h) {
  const k = h / 4.1;
  const W = '#94643a', D = '#5e3c1f';
  const box = (x0, y0, w, hh, rot = 0) => {
    ctx.save();
    ctx.translate(x + x0 * k, y - y0 * k);
    ctx.rotate(rot);
    ctx.fillStyle = W;
    ctx.fillRect(0, -hh * k, w * k, hh * k);
    ctx.strokeStyle = D;
    ctx.lineWidth = Math.max(1, k * 0.03);
    ctx.strokeRect(0, -hh * k, w * k, hh * k);
    ctx.restore();
  };
  box(-0.12, 0, POST.w, POST.h);
  box(BEAM.x0, BEAM.y, BEAM.x1 - BEAM.x0, BEAM.h);
  box(LEG.x - LEG.w / 2, 0, LEG.w, DECK.y);
  box(FRONT.x - FRONT.w / 2, 0, FRONT.w, DECK.y + DECK.h);
  box(DECK.x0, DECK.y, TRAP.x1 - DECK.x0, DECK.h);
  // the brace
  ctx.save();
  ctx.translate(x + 0.06 * k, y - 3.05 * k);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = W;
  ctx.fillRect(0, -0.06 * k, 1.1 * k, 0.12 * k);
  ctx.restore();
  // the rope and the noose
  const spec = WIRES.noose;
  ctx.strokeStyle = spec.colour;
  ctx.lineWidth = Math.max(1.2, k * 0.035);
  ctx.beginPath(); ctx.moveTo(x + NOOSE.x * k, y - BEAM.y * k); ctx.lineTo(x + NOOSE.x * k, y - (BEAM.y - NOOSE.len) * k); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x + NOOSE.x * k, y - (BEAM.y - NOOSE.len - NOOSE.loop) * k, NOOSE.loop * 0.8 * k, NOOSE.loop * k, 0, 0, Math.PI * 2); ctx.stroke();
}

/** The noose: how big, where (for the verifier and the tests). */
export const GALLOWS = { POST, BEAM, DECK, TRAP, NOOSE, LEVER };
