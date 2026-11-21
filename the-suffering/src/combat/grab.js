/* =============================================================================
   Taking hold of things with your hands.

   GRAB reaches for whatever is under the crosshair and within reach: a crate,
   a lamp, a generator, a beam or a wall that has come loose, a severed limb,
   or somebody lying on the ground who is past resisting (out cold, or dead).
   If nothing is under the crosshair, it reaches for the nearest such thing in
   front of you.

   The reach is the arm's own: the hand is sent to the spot, the shoulder and
   the elbow find their way there (see Human._reach), the body bends and
   crouches for anything low, and the fingers open for it and close round it.
   From then on it is held by the hand itself: a light thing is picked up and
   carried in front of you, in both hands if both are free; anything heavier
   is dragged, the arm stretched out toward it, and you go no faster than its
   weight allows. A person is taken by the wrist, the ankle or the collar,
   whichever is nearest where you reached.

   GRAB again lets go. ATTACK throws whatever is being carried. The hold is
   broken if it snags on something, if you fall or are knocked down, or if the
   person being dragged comes round.
   ========================================================================== */
import { Joint, rayBody } from '../physics/world.js';
import { ST } from '../human/human.js';
import { P, PARTS } from '../human/rig.js';
import { clamp, clamp01, lerp } from '../core/util.js';

const REACH = 2.0;          // metres from the player to what can be taken hold of
const CARRY = 20;           // kg: anything lighter is picked up and carried; heavier is dragged
const ONE_HAND = 9;         // kg: light enough to carry in one hand
const TOO_HEAVY = 420;      // kg: nobody moves this
const ARM = 0.56;           // how far out the hand goes from the shoulder when dragging (scaled)
const _a = [0, 0, 0], _b = [0, 0, 0], _c = [0, 0, 0];

/** Where on a person you take hold, by the part that was reached for: [part, point on it (unscaled), what it is called]. */
const GRIP = [];
for (const p of [P.HAND_L, P.FARM_L, P.UARM_L]) GRIP[p] = [P.FARM_L, [0, -0.115, 0], 'wrist'];
for (const p of [P.HAND_R, P.FARM_R, P.UARM_R]) GRIP[p] = [P.FARM_R, [0, -0.115, 0], 'wrist'];
for (const p of [P.THIGH_L, P.SHIN_L, P.FOOT_L]) GRIP[p] = [P.SHIN_L, [0, -0.17, 0], 'ankle'];
for (const p of [P.THIGH_R, P.SHIN_R, P.FOOT_R]) GRIP[p] = [P.SHIN_R, [0, -0.17, 0], 'ankle'];
for (const p of [P.PELVIS, P.ABDOMEN, P.CHEST, P.NECK, P.HEAD]) GRIP[p] = [P.CHEST, [0, 0.125, 0], 'collar'];

export class Grab {
  constructor(game) {
    this.g = game;
    this.hold = null;          // what is being reached for or held
    this.near = null;          // what GRAB would take, for the button
    this.nearT = 0;
    this.stats = { grabs: 0, drags: 0, carries: 0, throws: 0, slips: 0, freed: 0 };
  }

  /* ------------------------------- choosing -------------------------------- */

  /** Somebody who can be taken hold of: on the ground and past resisting, or a part of somebody that has come off. */
  _takesHuman(h, part) {
    const p = this.g.player;
    if (!h || h === p || h.removed || h.gone[part] || h.puppet) return false;
    if (!h.attached[part]) return true;
    return h.state === ST.RAGDOLL && !h.car && (!h.h.alive || !h.h.conscious);
  }
  _takesProp(o) {
    if (!o || o.removed || !o.body || o.kind === 'weapon') return false;
    if (o.body.kinematic) return false;          // fixed in place: a wall still standing where it was put
    return true;
  }

  /** What GRAB would take hold of now, or null: { body, lp, human, part, prop, mass, name, where }. */
  find() {
    const g = this.g, p = g.player, a = g.aim;
    if (p.state !== ST.ANIM || p.car || p.cuffed || !p.h.alive) return null;
    const back = Math.hypot(a.ox - p.x, a.oz - p.z);
    let best = REACH + back, hit = null;
    const w = g.world.rayWorld(a.ox, a.oy, a.oz, a.dx, a.dy, a.dz, best);
    if (w >= 0) best = w;
    for (const o of g.props) {
      const t = o.vox ? o.vox.ray(a.ox, a.oy, a.oz, a.dx, a.dy, a.dz, best) : rayBody(o.body, a.ox, a.oy, a.oz, a.dx, a.dy, a.dz, best, null);
      if (t >= 0 && t < best) { best = t; hit = this._takesProp(o) ? { prop: o, body: o.body } : null; }
    }
    const ph = g.rayPeople(a.ox, a.oy, a.oz, a.dx, a.dy, a.dz, best, p, 0.05);
    if (ph) { best = ph.t; hit = this._takesHuman(ph.human, ph.part) ? { human: ph.human, part: ph.part } : null; }
    if (hit) {
      const wx = a.ox + a.dx * best, wy = a.oy + a.dy * best, wz = a.oz + a.dz * best;
      // too close to the lens, or too far from the hands
      if (best < back - 0.6 || Math.hypot(wx - p.x, wz - p.z) > 1.9 * p.scale || wy > p.y + 2.1 * p.scale) hit = null;
      else hit = this._describe(hit, wx, wy, wz);
    }
    return hit || this._nearest();
  }

  /** Nothing under the crosshair: the nearest thing that can be taken, in front and within reach. */
  _nearest() {
    const g = this.g, p = g.player;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    let best = null, bd = 1.55 * p.scale;
    const consider = (x, y, z, make) => {
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d >= bd || y > p.y + 2 * p.scale || y < p.y - 0.6) return;
      if (d > 0.35 && (dx * fx + dz * fz) / d < 0.25) return;
      bd = d; best = make;
    };
    for (const o of g.props) if (this._takesProp(o)) consider(o.body.px, o.body.py, o.body.pz, { prop: o, body: o.body });
    for (const h of g.humans) {
      if (h === p || h.removed) continue;
      for (const part of [P.FARM_L, P.FARM_R, P.SHIN_L, P.SHIN_R, P.CHEST, P.HEAD, P.THIGH_L, P.THIGH_R, P.HAND_L, P.HAND_R, P.FOOT_L, P.FOOT_R]) {
        if (!this._takesHuman(h, part)) continue;
        const b = h.bodies[part];
        consider(b.px, b.py, b.pz, { human: h, part });
      }
    }
    if (!best) return null;
    const b = best.body || best.human.bodies[best.part];
    if (best.prop) {
      // the nearest point of its surface to where the hands would be
      b.toLocal(p.x + fx * 0.3 * p.scale, p.y + 0.9 * p.scale, p.z + fz * 0.3 * p.scale, _a);
      const lx = clamp(_a[0], -b.hx, b.hx), ly = clamp(_a[1], -b.hy, b.hy), lz = clamp(_a[2], -b.hz, b.hz);
      // (from inside it, out to the nearest face)
      if (lx === _a[0] && ly === _a[1] && lz === _a[2]) { const ex = b.hx - Math.abs(lx), ey = b.hy - Math.abs(ly), ez = b.hz - Math.abs(lz); if (ex <= ey && ex <= ez) _a[0] = Math.sign(lx || 1) * b.hx; else if (ey <= ez) _a[1] = Math.sign(ly || 1) * b.hy; else _a[2] = Math.sign(lz || 1) * b.hz; }
      else { _a[0] = lx; _a[1] = ly; _a[2] = lz; }
      b.toWorld(_a[0], _a[1], _a[2], _b);
      return this._describe(best, _b[0], _b[1], _b[2]);
    }
    return this._describe(best, b.px, b.py, b.pz);
  }

  /** Where exactly the hand goes on it, how heavy it is, and what to call it. */
  _describe(hit, wx, wy, wz) {
    if (hit.human) {
      const h = hit.human, s = h.scale;
      let part = hit.part, lp;
      const gr = GRIP[part];
      if (h.attached[part] && gr && h.attached[gr[0]] && !h.gone[gr[0]]) {
        part = gr[0]; lp = [gr[1][0] * s, gr[1][1] * s, gr[1][2] * s]; hit.where = gr[2];
      } else {
        // a piece on its own: wherever on it the hand landed, a little in from the surface
        const b = h.bodies[part]; b.toLocal(wx, wy, wz, _a);
        lp = [clamp(_a[0], -b.hx * 0.6, b.hx * 0.6), clamp(_a[1], -b.hy * 0.7, b.hy * 0.7), clamp(_a[2], -b.hz * 0.6, b.hz * 0.6)];
        hit.where = PARTS[part].label.replace(/^(left|right) /, '');
      }
      hit.part = part; hit.body = h.bodies[part]; hit.lp = lp;
      let m = 0; for (const b of hit.body.island.bodies) m += b.mass;
      hit.mass = m;
      hit.piece = !h.attached[part];
      hit.name = hit.piece ? 'the ' + hit.where : (h.h.alive ? (h.look.first || 'them') : 'the body');
      return hit;
    }
    const o = hit.prop, b = o.body;
    b.toLocal(wx, wy, wz, _a);
    // on the surface where it was reached for, pulled in a touch so the fingers close on it
    hit.lp = [clamp(_a[0], -b.hx, b.hx) * 0.92, clamp(_a[1], -b.hy, b.hy) * 0.92, clamp(_a[2], -b.hz, b.hz) * 0.92];
    hit.mass = b.mass;
    hit.name = o.vox ? 'the ' + o.vox.name.toLowerCase() : o.thing ? 'the ' + o.thing.def.name.toLowerCase() : 'the ' + o.kind;
    return hit;
  }

  /* ------------------------------- grabbing -------------------------------- */

  /** GRAB: take hold of what is in reach, or let go of what is held. */
  toggle() {
    if (this.hold) { this.release(this.hold.phase === 'hold' ? 'let go' : 'cancel'); return; }
    const g = this.g, p = g.player;
    const t = this.find();
    if (!t) { g.ui?.toast('Nothing within reach to grab.'); return; }
    if (t.mass > TOO_HEAVY) { g.ui?.toast(`${cap(t.name)} is far too heavy to move.`); return; }
    // which hands: the right is busy with whatever it holds; the left with a magazine or a stock
    const rightFree = !p.weapon && p.attached[P.HAND_R] && p.h.armOk(0);
    const leftFree = p.attached[P.HAND_L] && p.h.armOk(1) && !p.reload && !p.swap && !p.handFull;
    if (!rightFree && !leftFree) { g.ui?.toast('Your hands are full.'); return; }
    const two = rightFree && leftFree && (t.where === 'collar' || (t.mass >= ONE_HAND && t.mass < CARRY));
    const carry = t.mass < (two ? CARRY : ONE_HAND) && !(t.human && !t.piece);
    if (!carry && t.prop) {
      // something heavy pulled along the ground is taken hold of half way up: pulled by the top edge, it tips over
      const b = t.body; b.dirToLocal(0, 1, 0, _a);
      const up = Math.abs(_a[0]) > Math.abs(_a[1]) ? (Math.abs(_a[0]) > Math.abs(_a[2]) ? 0 : 2) : (Math.abs(_a[1]) > Math.abs(_a[2]) ? 1 : 2);
      t.lp = t.lp.slice(); t.lp[up] *= 0.1;
    }
    const hands = [];
    if (two) {
      // the two hands a little either side of the spot, along whichever way across it runs most nearly left to right
      const b = t.body, s = p.scale, lx = Math.cos(p.yaw), lz = -Math.sin(p.yaw);
      b.dirToLocal(lx, 0, lz, _a);
      const ax = Math.abs(_a[0]) >= Math.abs(_a[2]) ? 0 : 2, sg = _a[ax] >= 0 ? 1 : -1;
      const half = ax === 0 ? b.hx : b.hz, off = carry ? half * 0.95 : t.where === 'collar' ? 0.09 * s : Math.min(half * 0.8, 0.12 * s);
      for (const side of [0, 1]) {
        const lp = t.lp.slice();
        // the left hand on the side to the player's left
        lp[ax] = (carry ? 0 : lp[ax]) + (side === 0 ? sg : -sg) * off;
        hands.push({ side, lp, joint: null });
      }
    } else hands.push({ side: rightFree ? 1 : 0, lp: t.lp, joint: null });
    this.hold = { ...t, hands, carry, phase: 'reach', t: 0, near: 0, rope: 0.3, slip: 0, by: p };
    this._skip(p, t.body.island, true);
    p.dragMax = 0.35;
    g.audio?.at('whoosh', p.x, p.y + 1, p.z, 0.15);
  }

  /** The player's limbs pass by an island (on), or go back to bumping into everything (off). */
  _skip(p, isl, on) { for (const b of p.bodies) b.skipIsland = on ? isl : null; }

  /** The hand has got there: close it on the thing. */
  _close() {
    const g = this.g, H = this.hold, p = H.by, s = p.scale;
    for (const e of H.hands) {
      const hand = p.bodies[e.side ? P.HAND_R : P.HAND_L];
      const la = [(e.side ? 0.015 : -0.015) * s, -0.045 * s, 0.01 * s];
      hand.toWorld(la[0], la[1], la[2], _a); H.body.toWorld(e.lp[0], e.lp[1], e.lp[2], _b);
      const gap = Math.hypot(_a[0] - _b[0], _a[1] - _b[1], _a[2] - _b[2]);
      // the arm is a strong spring, not an iron bar: it only pulls, and it gives a little under the weight, so
      // that a turn or a step does not fling what is held; it is stiffer for heavier things, which take more pulling
      const k = 120 * H.mass + 1500;
      e.joint = g.world.addJoint(new Joint(hand, H.body, { la, lb: e.lp, rope: Math.max(0.03, gap), compliance: 1 / k, damp: 0, name: 'grab' }));
      hand.nohit = H.body;
      p.grasp[e.side] = 1;
    }
    H.phase = 'hold'; H.t = 0; H.rope = H.hands[0].joint.rope;
    { const e = H.hands[0]; H.body.toWorld(e.lp[0], e.lp[1], e.lp[2], _a); H.y0 = _a[1]; }
    // what is held touches the hand that holds it and nothing else of you: dragged against your legs, it would
    // shove you along, and you it, faster and faster
    p.holdBody = H.body;
    H.body.island.wake();
    this.stats.grabs++;
    if (H.carry) this.stats.carries++; else this.stats.drags++;
    const at = H.body;
    if (H.human) {
      g.audio?.at('flesh', at.px, at.py, at.pz, 0.25);
      // bare hands on skin leave prints
      g.police?.touched(H.human, p);
      if (!H.piece) g.minds?.witness({ kind: 'drag', actor: p, victim: H.human, x: at.px, y: at.py + 0.3, z: at.pz });
      g.ui?.toast(H.piece ? `You pick up ${H.name}.` : `You take ${H.name === 'the body' ? 'the body' : H.name} by the ${H.where}.`);
    } else {
      g.audio?.at(H.prop.wood ? 'crate' : 'pickup', at.px, at.py, at.pz, 0.35);
      g.ui?.toast(H.carry ? `You pick up ${H.name}.` : `You take hold of ${H.name}. Walk to drag it.`);
    }
    g.ui?.grabChanged();
  }

  /** Lets go. `why` is for the message. */
  release(why = 'let go') {
    const H = this.hold, g = this.g;
    if (!H) return;
    this.hold = null;
    this.why = why;
    const p = H.by;
    this._skip(p, null, false);
    p.holdBody = null;
    for (const e of H.hands) {
      if (e.joint) g.world.removeJoint(e.joint);
      const hand = p.bodies[e.side ? P.HAND_R : P.HAND_L];
      if (hand.nohit === H.body) hand.nohit = null;
      p.reachT[e.side] = null; p.grasp[e.side] = -1;
    }
    p.stoop = 0; p.grabFace = null; p.grabStep = null; p.dragMax = Infinity;
    if (H.body.island && H.phase === 'hold') H.body.island.wake();
    if (why === 'slip') { this.stats.slips++; g.ui?.toast(`${cap(H.name)} slips out of your grip.`); }
    else if (why === 'freed') { this.stats.freed++; g.ui?.toast(`${cap(H.name)} pulls free.`); }
    else if (why === 'reach') g.ui?.toast(`You can't reach ${H.name}.`);
    g.ui?.grabChanged();
  }

  /** ATTACK with something carried: it goes the way you are looking. */
  throwIt() {
    const H = this.hold, g = this.g, a = g.aim;
    if (!H || !H.carry || H.phase !== 'hold') return false;
    const b = H.body, m = H.mass, v = clamp(48 / (m + 2.5), 3, 12);
    this.release('throw');
    b.vx = a.dx * v + H.by.vx; b.vy = a.dy * v + 1.6; b.vz = a.dz * v + H.by.vz;
    b.wx += (Math.random() - 0.5) * 6; b.wz += (Math.random() - 0.5) * 6;
    b.island.wake();
    this.stats.throws++;
    g.audio?.at('whoosh', b.px, b.py, b.pz, 0.5);
    H.by.anim.recoil = 0.6;
    return true;
  }

  /* ---------------------------------- frame -------------------------------- */

  /** Before the people move: where the hands are to go. */
  update(dt) {
    const g = this.g, p = g.player, inp = g.input;
    if (this.hold && this._broken()) return;
    if (g.doctor == null && p.state === ST.ANIM && !p.car && inp.pressed.grab) this.toggle();
    const H = this.hold;
    if (!H) return;
    // ATTACK throws what is carried, instead of whatever the hand would have done; a hand that is holding on to
    // something does not punch (a gun in the other one still fires)
    if (H.carry && H.phase === 'hold' && inp.pressed.attack) { inp.pressed.attack = false; this.throwIt(); return; }
    if (H.hands.some((e) => e.side === 1)) { inp.pressed.attack = false; inp.pressed.alt = false; }
    H.t += dt;
    const s = p.scale, yaw = p.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), lx = Math.cos(yaw), lz = -Math.sin(yaw);
    if (H.phase === 'reach') {
      // a step or two up to it, then the hand (or both) to the spot, the body bending and turning for it
      let lowest = 9, cx = 0, cz = 0;
      for (const e of H.hands) {
        H.body.toWorld(e.lp[0], e.lp[1], e.lp[2], _a);
        p.reachT[e.side] = { x: _a[0], y: _a[1], z: _a[2], w: 1, rate: 3.2 };
        p.grasp[e.side] = 0;
        lowest = Math.min(lowest, _a[1]); cx += _a[0] / H.hands.length; cz += _a[2] / H.hands.length;
      }
      const low = clamp01((p.y + 1.02 * s - lowest) / 0.78);
      // how far in front of the feet a hand gets to best: nearer for something low, which the body bends over
      const want = lerp(0.42, 0.5, low) * s, d = Math.hypot(cx - p.x, cz - p.z);
      p.grabStep = { x: cx, z: cz, d: want };
      // close enough, or as close as the way allows: whatever is in the way has stopped the feet
      const moved = H.lx == null ? 1 : Math.hypot(p.x - H.lx, p.z - H.lz);
      H.lx = p.x; H.lz = p.z;
      H.stuck = moved < 0.25 * dt ? (H.stuck || 0) + dt : 0;
      const close = d < want + 0.12 * s || H.stuck > 0.25;
      if (close) H.near += dt; else H.near = 0;
      p.stoop = low * clamp01(1.6 - (d - want) / (0.6 * s));
      p.grabFace = Math.atan2(cx - p.x, cz - p.z);
      p.dragMax = 0.35;
      return;
    }
    // held: you face the way you are looking, and what you hold is in front of you; turn and it comes round with you
    p.grabFace = g.camYaw; p.grabStep = null;
    for (const e of H.hands) p.grasp[e.side] = 1;
    // the gap from palm to grip closes over the first moments, so there is no jerk
    H.rope = Math.max(0.025, H.rope - dt * 0.8);
    for (const e of H.hands) e.joint.rope = H.rope;
    const isl = H.body.island;
    if (isl && isl.sleeping) isl.wake();
    if (H.carry) {
      // in front, at the height of the belly: in one hand a little to that side, in two, between them
      const half = H.hands.length > 1 ? Math.min(0.24 * s, Math.hypot(H.hands[0].lp[0] - H.hands[1].lp[0], H.hands[0].lp[2] - H.hands[1].lp[2]) / 2) : 0;
      for (const e of H.hands) {
        const off = H.hands.length > 1 ? (e.side === 0 ? half : -half) : (e.side === 0 ? 0.12 : -0.12) * s;
        p.reachT[e.side] = { x: p.x + fx * 0.36 * s + lx * off, y: p.y + 1.02 * s, z: p.z + fz * 0.36 * s + lz * off, w: 1, rate: 6 };
      }
      p.stoop = 0;
      p.dragMax = clamp(3.4 - H.mass * 0.06, 1.6, 3.4) * s;
    } else {
      // the arm (or both) out in front at full stretch: walk away and it comes after you. A person's wrist or ankle
      // or collar comes up to the hip; anything else is held at the height it was taken hold of, so that it stays
      // on the ground and slides
      let low = 9;
      const ty = H.human ? p.y + 0.72 * s : clamp(H.y0, p.y + 0.3 * s, p.y + 1.15 * s);
      const sy = p.y + (1.33 - 0.25 * p.stoop) * s;
      const r = clamp(Math.sqrt(Math.max(0, (ARM * s) ** 2 - (sy - ty) ** 2)) + 0.14 * s, 0.42 * s, 0.62 * s);
      for (const e of H.hands) {
        const side = (e.side === 0 ? 1 : -1) * (H.hands.length > 1 ? 0.15 : 0.13) * s;
        p.reachT[e.side] = { x: p.x + fx * r + lx * side, y: ty, z: p.z + fz * r + lz * side, w: 1, rate: 6 };
      }
      low = ty;
      // bent over for something held low
      p.stoop = Math.max(0.22, clamp01((p.y + 0.82 * s - low) / 0.5) * 0.85);
      p.dragMax = clamp(2.4 * 45 / (H.mass + 15), 0.5, 2.4) * s;
    }
  }

  /** Is the hold over? Lets go and says why if it is. */
  _broken() {
    const H = this.hold, g = this.g, p = H.by;
    if (p !== g.player || p.removed || p.state !== ST.ANIM || p.car || p.cuffed || !p.h.alive) { this.release('fell'); return true; }
    for (const e of H.hands) {
      if (!p.attached[e.side ? P.HAND_R : P.HAND_L]) { this.release('fell'); return true; }
      if (e.side === 1 && p.weapon) { this.release('let go'); return true; }
    }
    if (H.human) {
      const h = H.human;
      if (h.removed || h.gone[H.part] || !g.world.islands.includes(H.body.island)) { this.release('gone'); return true; }
      if (!H.piece && (h.state !== ST.RAGDOLL || (h.h.alive && h.h.conscious))) { this.release('freed'); return true; }
    } else if (H.prop.removed || !g.props.includes(H.prop) || H.body.kinematic) { this.release('gone'); return true; }
    if (H.phase === 'reach' && (H.t > 3 || H.near > 1.1)) { this.release('reach'); return true; }
    return false;
  }

  /** After the physics: has the hand got there, has the thing caught on something? */
  late(dt) {
    const g = this.g, H = this.hold, p = g.player;
    if (H) {
      const s = p.scale;
      let worst = 0;
      for (const e of H.hands) {
        p.bodies[e.side ? P.HAND_R : P.HAND_L].toWorld((e.side ? 0.015 : -0.015) * s, -0.045 * s, 0.01 * s, _a);
        H.body.toWorld(e.lp[0], e.lp[1], e.lp[2], _b);
        worst = Math.max(worst, Math.hypot(_a[0] - _b[0], _a[1] - _b[1], _a[2] - _b[2]));
        if (e.joint) {
          // pulled harder than a grip can hold
          if (e.joint.force > 9000) { H.slip += 0.12; }
          e.joint.force = 0;
        }
      }
      if (H.phase === 'reach') {
        if (worst < 0.07 * s || (H.near > 0.45 && worst < 0.3 * s)) this._close();
      } else {
        // caught on something, the hand and the grip pulled apart
        H.slip = worst > 0.42 * s ? H.slip + dt : Math.max(0, H.slip - dt * 2);
        if (H.slip > 0.3) this.release('slip');
      }
    }
    // what is in reach, for the button
    this.nearT -= dt;
    if (this.nearT <= 0) {
      this.nearT = 0.12;
      const n = this.hold ? null : this.find();
      const key = n ? n.body : null;
      if (key !== (this.near ? this.near.body : null)) { this.near = n; g.ui?.grabChanged(); } else this.near = n;
    }
  }

  /** What the GRAB button says. */
  label() {
    const H = this.hold;
    if (H) return 'LET GO';
    const n = this.near;
    if (!n) return '';
    const two = !this.g.player.weapon;
    return n.mass < (two ? CARRY : ONE_HAND) && !(n.human && !n.piece) ? 'GRAB' : 'DRAG';
  }

  /** Everything let go of: the game is starting again, or the player is being replaced. */
  clear() { if (this.hold) this.release('gone'); this.near = null; }
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
