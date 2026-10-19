/* =============================================================================
   SHALLOW - what it leaves lying about. Each is a thing of the mod's
   (sandbox.items): the hand from above can pick it up and throw it, and
   uninstalling the mod takes it away.

     Husk       a skin with nothing in it: the one it tore its way out of,
                or somebody it emptied and never got into. A ragdoll, limp
                all the way through - nothing in it to hold it in shape.
     Legs       the bottom half of somebody it tore in half: a ragdoll of
                its own, the hips and the legs, dripping
     Skeleton   every bone of somebody, pulled out in one piece: a ragdoll
                of bones
     Organ      a heart, a pair of lungs, a stomach, the guts: small and
                wet, they bounce and roll and leave blood where they land

   The thing holds them in its hands while it works (heldBy: { man, side }).
   ========================================================================== */
import { Ragdoll } from '../../physics/ragdoll.js';
import { Body } from '../../physics/rigid.js';
import { makeRagdoll, toJoints } from '../../game/limp.js';
import { DIM, makeJoints } from '../../game/skeleton.js';
import { POLICE_UNIFORM } from '../../game/render.js';
import { clamp, rand, moveToward } from '../../core/util.js';
import { MOD, gripAt, lerpPt } from './common.js';
import { drawEmptySkin, drawLowerHalf, drawSkeleton, ORGANS } from './look.js';

/** How somebody looked, kept for drawing what is left of them. */
export function lookOf(man) {
  return {
    name: man.name, scale: man.scale, facing: man.rag ? man.rag.facing : man.facing, hair: man.hair,
    uniform: man.officer ? POLICE_UNIFORM : null, hat: man.officer ? 'police' : null, belt: man.officer,
    tint: man.tint || null,
  };
}

/** Somebody's body as makeRagdoll (game/limp.js) wants it: where it is, and how it was moving. */
function bodyOf(man, o = {}) {
  const copy = (src) => {
    const j = makeJoints();
    for (const k of Object.keys(j)) if (k !== 'headAngle' && src[k]) { j[k].x = src[k].x; j[k].y = src[k].y; }
    j.headAngle = src.headAngle || 0;
    return j;
  };
  return {
    scale: man.scale, facing: man.rag ? man.rag.facing : man.facing,
    wj: copy(man.wj), prevWj: copy(man.prevWj),
    health: { broken: {}, severed: {}, dislocated: {} },
    cut: o.cut === undefined ? { ...man.cut } : o.cut, cuffed: false,
  };
}

const worldOf = (sb) => {
  const boxes = [];
  for (const c of sb.crates) if (!c.carriedBy && !c.removed) boxes.push(c.body);
  return { floor: 0, left: sb.left, right: sb.right, boxes, friction: 0.55 };
};

/** Nothing inside to hold it in shape: every joint goes any way at all. */
export function boneless(rag) {
  for (const j of rag.joints) j.half = Math.PI;
  rag.friction = 0.09;
  rag.passive = 0;
  rag.tone = 0;
}

/* ------------------------------------------------------------------------------ */

/** Something made of points and sticks, lying about: picked up and thrown like anything else. */
class RagItem {
  constructor(sb, kind, name, scale) {
    this.mod = MOD;
    this.kind = kind;
    this.name = name;
    this.sandbox = sb;
    this.scale = scale;
    this.removed = false;
    this.rag = null;
    this.holdRef = null;     // the point a hand of the thing's takes it by
    this.heldBy = null;      // { man, side }
    this.inHand = false;     // the hand from above has it
    this.seed = rand(0, 100);
    this.age = 0;
  }
  get pos() { return this.rag.center; }
  // (not one rigid body: the sandbox's loose things leave it alone)
  get loose() { return false; }
  contains(x, y, r) {
    const pad = r + 0.06 * this.scale;
    for (const q of this.rag.p) if (q.r > 0.01 && Math.hypot(q.x - x, q.y - y) < pad + q.r) return true;
    return false;
  }
  /** Taken by one of its hands. */
  takenBy(man, side) {
    this.heldBy = { man, side };
    if (this.inHand && man.sandbox.hand) man.sandbox.hand.release();
    const g = gripAt(man, side);
    this.rag.grab(this.holdRef, g.x, g.y);
  }
  /** Let go of, and sent on its way at (vx, vy). */
  letGo(vx = null, vy = null) {
    this.heldBy = null;
    this.rag.release();
    if (vx !== null) this.rag.fling(vx, vy, 0.7);
  }
  // the hand from above (game/hand.js): it holds itself
  handGrab(x, y) {
    if (this.heldBy) return false;
    let best = null, bd = Infinity;
    for (let i = 0; i < this.rag.p.length; i++) {
      const q = this.rag.p[i];
      if (q.r <= 0.01) continue;
      const d = Math.hypot(q.x - x, q.y - y);
      if (d < bd) { bd = d; best = i; }
    }
    if (best === null) return false;
    this.inHand = true;
    this.rag.grab(best, x, y);
    return true;
  }
  handHold(x, y) { this.rag.grabAt.x = x; this.rag.grabAt.y = y; }
  handRelease() { this.inHand = false; this.rag.release(); }
  update(dt, sb) {
    this.age += dt;
    const h = this.heldBy;
    if (h) {
      if (h.man.removed || h.man.dead || !h.man.sh) this.letGo();
      else {
        const g = gripAt(h.man, h.side);
        this.rag.grabAt.x = g.x;
        this.rag.grabAt.y = g.y;
      }
    }
    this.rag.step(dt, worldOf(sb));
    // knocked clean out of the world: the whole of it back in
    const c = this.rag.center;
    if (c.y < -1 || c.x < sb.left - 1 || c.x > sb.right + 1) {
      const dx = clamp(c.x, sb.left + 1, sb.right - 1) - c.x, dy = c.y < -1 ? 1 - c.y : 0;
      for (const q of this.rag.p) { q.x += dx; q.y += dy; q.px = q.x; q.py = q.y; }
    }
    this.after(dt, sb);
  }
  after() {}
}

/* ----------------------------------- husks ----------------------------------- */

/**
 * A skin with nothing in it, lying in the pose the body was in: wet with
 * black (it came out of this one) or with blood (it emptied this one).
 */
export class Husk extends RagItem {
  constructor(sb, man, o = {}) {
    super(sb, 'husk', `${man.name}'s skin`, man.scale);
    this.look = lookOf(man);
    this.black = !!o.black;
    this.open = o.open ?? 1;
    this.deflate = o.deflate ?? 0;
    this.cut = { ...man.cut };
    this.rag = makeRagdoll(bodyOf(man));
    boneless(this.rag);
    this.holdRef = this.rag.byName.neck;
    this.j = makeJoints();
    this.holder = { wj: this.j };
  }
  after(dt) { this.deflate = moveToward(this.deflate, 1, dt * 1.1); }
  draw(ctx) {
    toJoints(this.rag, this.holder);
    drawEmptySkin(ctx, this.j, { ...this.look, facing: this.rag.facing }, { deflate: this.deflate, open: this.open, black: this.black, cut: this.cut });
  }
  tap() {
    return this.black
      ? `${this.look.name}'s skin, split open down the back. Whatever was wearing it is not in it any more.`
      : `What is left of ${this.look.name}: the skin, and nothing else.`;
  }
}

/* ------------------------------------ legs ------------------------------------ */

// [name, parent from, parent to, pivot, child, lo, hi, rest] as in game/limp.js, with the stub of back as the parent
const LEG_JOINTS = [
  ['hipA', 'hip', 'U', 'hip', 'kneeA', 45, 210, 172],
  ['kneeA', 'hip', 'kneeA', 'kneeA', 'footA', -3, 150, 12],
  ['ankleA', 'kneeA', 'footA', 'footA', 'toeA', -150, -60, -110],
  ['hipB', 'hip', 'U', 'hip', 'kneeB', 45, 210, 178],
  ['kneeB', 'hip', 'kneeB', 'kneeB', 'footB', -3, 150, 18],
  ['ankleB', 'kneeB', 'footB', 'footB', 'toeB', -150, -60, -110],
];

/** Where a joint of somebody is and was a step ago: off their ragdoll, if they are one. */
function jointNow(man, name) {
  if (man.rag && man.rag.byName[name] !== undefined) {
    const q = man.rag.p[man.rag.byName[name]];
    return [{ x: q.x, y: q.y }, { x: q.px, y: q.py }];
  }
  return [man.wj[name], man.prevWj[name]];
}

/** The bottom half of somebody: hips, legs, and a stub of the back where the rest was torn off. */
export class Legs extends RagItem {
  constructor(sb, man) {
    super(sb, 'legs', `${man.name}'s legs`, man.scale);
    this.look = lookOf(man);
    this.bleed = 1;
    this.dripT = 0;
    this.clip = null;
    const s = man.scale;
    const rag = new Ragdoll({ facing: this.look.facing, gravity: 18 });
    const dt = 1 / 120;
    const add = (name, q, o, mass, r) => rag.point(name, q.x, q.y, mass * s, r * s,
      clamp((q.x - o.x) / dt, -25, 25), clamp((q.y - o.y) / dt, -25, 25), dt);
    const [hp, hq] = jointNow(man, 'hip'), [cp, cq] = jointNow(man, 'chest');
    add('U', lerpPt(hp, cp, 0.4), lerpPt(hq, cq, 0.4), 4, 0.04);
    add('hip', hp, hq, 13, 0.042);
    for (const side of ['A', 'B']) {
      for (const [k, m, r] of [['knee', 6.5, 0.038], ['foot', 3.8, 0.036], ['toe', 0.7, 0.03]]) {
        const [p, q] = jointNow(man, k + side);
        add(k + side, p, q, m, r);
      }
    }
    const n = rag.byName;
    rag.link(n.U, n.hip, DIM.spineLow * s * 0.4);
    for (const side of ['A', 'B']) {
      rag.link(n.hip, n['knee' + side], DIM.thigh * s);
      rag.link(n['knee' + side], n['foot' + side], DIM.shin * s);
      rag.link(n['foot' + side], n['toe' + side], DIM.foot * s);
    }
    for (const [name, pf, pt, cf, ct, lo, hi, rest] of LEG_JOINTS) {
      const i = rag.joint(name, n[pf], n[pt], n[cf], n[ct], lo, hi);
      rag.joints[i].rest = (rest * Math.PI) / 180;
    }
    rag.tone = 0;
    this.rag = rag;
    this.holdRef = n.hip;
  }
  /** Where the top of it is, the raw end. */
  get top() { const q = this.rag.p[this.rag.byName.U]; return { x: q.x, y: q.y }; }
  after(dt, sb) {
    this.bleed *= Math.exp(-dt * 0.08);
    if (this.bleed > 0.05 && (this.dripT -= dt) <= 0) {
      this.dripT = 0.05 + (1 - this.bleed) * 0.4;
      const t = this.top;
      sb.fx.drip(t.x, t.y, null, this.look.tint);
    }
  }
  draw(ctx) {
    const n = this.rag.byName, P = (k) => this.rag.p[n[k]];
    const pts = { U: P('U'), hip: P('hip'), kneeA: P('kneeA'), footA: P('footA'), toeA: P('toeA'), kneeB: P('kneeB'), footB: P('footB'), toeB: P('toeB') };
    drawLowerHalf(ctx, pts, this.look, this.sandbox.time + this.seed, this.clip);
  }
  tap() { return `${this.look.name}'s legs. Just the legs.`; }
}

/* ---------------------------------- skeleton ---------------------------------- */

/** Every bone somebody had, in one piece, in the pose they were in when it came out. */
export class Skeleton extends RagItem {
  constructor(sb, man) {
    super(sb, 'skeleton', `${man.name}'s skeleton`, man.scale);
    this.look = lookOf(man);
    this.rag = makeRagdoll(bodyOf(man));
    this.rag.tone = 0;
    this.rag.friction = 0.05;
    this.holdRef = this.rag.byName.chest;
    this.j = makeJoints();
    this.holder = { wj: this.j };
  }
  draw(ctx) {
    toJoints(this.rag, this.holder);
    drawSkeleton(ctx, this.j, this.scale, this.rag.facing);
  }
  tap() { return `${this.look.name}'s skeleton. All of it.`; }
}

/* ----------------------------------- organs ----------------------------------- */

const ORGAN = {
  heart: { name: 'Heart', w: 0.13, h: 0.15, mass: 0.35, say: 'a heart' },
  lungs: { name: 'Lungs', w: 0.24, h: 0.22, mass: 1.2, say: 'a pair of lungs' },
  stomach: { name: 'Stomach', w: 0.17, h: 0.15, mass: 0.6, say: 'a stomach' },
  guts: { name: 'Guts', w: 0.26, h: 0.13, mass: 1.6, say: 'the guts' },
};
export const ORGAN_ORDER = ['heart', 'lungs', 'stomach', 'guts'];

/** Small and wet: it bounces, rolls, and leaves blood wherever it goes. */
export class Organ {
  constructor(sb, what, owner, x, y, vx, vy) {
    const spec = ORGAN[what];
    this.mod = MOD;
    this.kind = 'organ';
    this.organ = what;
    this.name = `${owner.name}'s ${spec.name.toLowerCase()}`;
    this.of = owner.name;
    this.sandbox = sb;
    this.removed = false;
    const s = owner.scale;
    this.w = spec.w * s;
    this.h = spec.h * s;
    this.body = new Body(this.w * 0.9, this.h * 0.85, spec.mass, { x, y, rot: rand(-1, 1), owner: this, friction: 0.85, restitution: 0.12, angularDamping: 0.9 });
    this.body.vel.x = vx;
    this.body.vel.y = vy;
    this.body.angVel = rand(-7, 7);
    sb.phys.add(this.body);
    this.inWorld = true;
    this.bleed = 1;
    this.dripT = 0;
    this.landed = false;
  }
  get pos() { return this.body.pos; }
  get loose() { return !this.removed; }
  contains(x, y, r) { return this.body.contains(x, y, r * 0.6 + 0.05); }
  leave(sb) { if (this.inWorld) { sb.phys.remove(this.body); this.inWorld = false; } }
  update(dt, sb) {
    const b = this.body;
    this.bleed *= Math.exp(-dt * 0.12);
    if (this.bleed > 0.04 && (this.dripT -= dt) <= 0) {
      this.dripT = 0.12 + (1 - this.bleed) * 0.6;
      sb.fx.drip(b.pos.x, b.pos.y - this.h * 0.3);
    }
    // the first time it hits the floor: a wet smack, and a splash
    if (!this.landed && b.pos.y < this.h * 0.75 && b.vel.y > -0.5) {
      this.landed = true;
      sb.fx.blood(b.pos.x, b.pos.y, 0, 1.2, 8, 0.8);
      sb.fx.pool(b.pos.x, 0, 0.35);
      sb.emit('shallowSplat', { what: this, x: b.pos.x, y: b.pos.y });
    }
  }
  draw(ctx) {
    const b = this.body;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(b.rot);
    ORGANS[this.organ](ctx, this.w, this.h);
    ctx.restore();
  }
  tap() { return `${ORGAN[this.organ].say[0].toUpperCase()}${ORGAN[this.organ].say.slice(1)}. It was ${this.of}'s.`; }
}
