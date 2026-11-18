/* =============================================================================
   Electricity.

   A running generator puts power into whatever it is wired to, and on into
   whatever that is wired to in turn. A wire carries it; so does steel (a
   beam, a steel wall, the generator's own frame); so does a lamp, which
   passes it on along the next wire, so one generator can light a string of
   bulbs. Wood, crates and rope carry nothing. A lamp with power lights.

   A person is where it goes to earth. With a live wire clipped to them, or a
   hand or a foot on live steel, every muscle locks at once: they cannot let
   go, they cannot breathe, they go over stiff and shaking, it burns where it
   goes in, and the longer it goes on the likelier the heart is to lose its
   rhythm and stop. It ends when the generator stops or is wrecked, the wire
   comes off or is cut, or they are knocked clear of what they were touching.
   ========================================================================== */
import { P, PART_COUNT } from '../human/rig.js';
import { ST } from '../human/human.js';
import { clamp, rand, chance } from '../core/util.js';

const _a = [0, 0, 0];
/** The parts that are most often what touches something. */
const TOUCH = [P.HAND_L, P.HAND_R, P.FOOT_L, P.FOOT_R, P.FARM_L, P.FARM_R, P.SHIN_L, P.SHIN_R];

export class Power {
  constructor(game) {
    this.g = game;
    this.live = new Set();      // props with power in them right now
    this.contacts = [];         // { h, part, by, x, y, z }: people it is going through
    this.zaps = new Map();      // person -> { t, part }
    this.stats = { zaps: 0, arrests: 0, wiresLive: 0 };
  }

  /** Whether a wire has power in it now. */
  check(r) { this._network(); return this.live.has(r.a.prop) || this.live.has(r.b.prop); }

  /** Everything a running generator reaches: through wires, steel and lamps. */
  _network() {
    const g = this.g, live = this.live;
    live.clear();
    this.contacts.length = 0;
    const wires = g.ropes ? g.ropes.list.filter((r) => r.wire) : [];
    const queue = [];
    for (const t of g.things ? g.things.list : []) if (t.type === 'generator' && t.running && !t.broken) { live.add(t.prop); queue.push(t.prop); }
    if (!queue.length) { this.stats.wiresLive = 0; return; }
    let wl = 0;
    while (queue.length) {
      const node = queue.pop();
      for (const r of wires) {
        const other = r.a.prop === node ? r.b : r.b.prop === node ? r.a : null;
        if (!other) continue;
        wl++;
        if (other.human) {
          other.body.toWorld(other.lp[0], other.lp[1], other.lp[2], _a);
          this.contacts.push({ h: other.human, part: other.part, by: r.by, x: _a[0], y: _a[1], z: _a[2] });
          continue;
        }
        const o = other.prop;
        if (!o || live.has(o)) continue;
        // lamps pass it on, and so does steel; wood and everything else stop it
        if (!(o.thing || (o.vox && o.vox.mat !== 'wood'))) continue;
        live.add(o);
        queue.push(o);
      }
    }
    this.stats.wiresLive = wl;
    // and anyone with a hand or a foot on live steel
    for (const o of live) {
      if (!o.vox) continue;
      const b = o.body;
      for (const h of g.humans) {
        if (h.removed || Math.hypot(h.x - b.px, h.z - b.pz) > b.boundR + 1.2) continue;
        const parts = h.state === ST.RAGDOLL ? ALL : TOUCH;
        for (const p of parts) {
          if (h.gone[p]) continue;
          const pb = h.bodies[p];
          b.toLocal(pb.px, pb.py, pb.pz, _a);
          const m = Math.min(pb.hx, pb.hy, pb.hz) + 0.025;
          if (Math.abs(_a[0]) > b.hx + m || Math.abs(_a[1]) > b.hy + m || Math.abs(_a[2]) > b.hz + m) continue;
          // only where there is actually steel, not a hole in it
          if (!near(o.vox, _a)) continue;
          this.contacts.push({ h, part: p, by: null, x: pb.px, y: pb.py, z: pb.pz });
          break;
        }
      }
    }
  }

  update(dt) {
    const g = this.g;
    this._network();
    const now = new Set();
    for (const c of this.contacts) {
      const h = c.h;
      if (h.removed || now.has(h)) continue;
      now.add(h);
      let z = this.zaps.get(h);
      if (!z) {
        z = { t: 0, part: c.part, by: c.by };
        this.zaps.set(h, z);
        this.stats.zaps++;
        g.audio?.at('zap', c.x, c.y, c.z, 1);
        if (c.by && c.by !== h) g.minds?.witness({ kind: 'attack', actor: c.by, victim: h, weapon: 'wire', part: c.part, x: c.x, y: c.y, z: c.z, rep: { pain: 40, bones: [] } });
        g.minds?.witness({ kind: 'zap', victim: h, x: c.x, y: c.y, z: c.z });
      }
      z.t += dt; z.part = c.part;
      // every muscle locks: they go over, stiff, and cannot let go
      h.tase(0.3, c.by, 'shock');
      const hh = h.h;
      if (hh.alive && !hh.god) {
        hh.burn(c.part, dt * 7, false);
        hh.air = Math.max(0, hh.air - dt * 4.5);
        // the heart: the longer it goes through the chest, the likelier it is to fibrillate and stop
        if (!hh.heartStopped && chance(dt * (0.025 + Math.min(0.14, z.t * 0.018)))) {
          hh.heartStopped = true; hh.pulse = 0;
          hh.mechanism = hh.mechanism || 'Electrocution';
          hh.events.push('arrest');
          this.stats.arrests++;
        }
      }
      // sparks where it goes in, a buzz, and a blue-white flicker
      if (chance(dt * 9)) g.gore.puff('flash', c.x + rand(-0.03, 0.03), c.y + rand(-0.03, 0.03), c.z + rand(-0.03, 0.03), rand(0.08, 0.18), 0.05, 0.75, 0.85, 1);
      g.audio?.loop('zap' + h.id, 'zap', c.x, c.y, c.z, 0.9);
      g.lights?.ask('point', c.x, c.y, c.z, 0xc7dcff, 1.5 + rand(0, 3), 4);
      // the body jerks
      if (h.state === ST.RAGDOLL && chance(dt * 6)) { const b = h.bodies[c.part]; b.applyImpulse(rand(-6, 6), rand(0, 5), rand(-6, 6)); }
    }
    // those it has let go of
    for (const [h, z] of this.zaps) {
      if (now.has(h)) continue;
      this.zaps.delete(h);
      if (!h.removed && h.mind && h.h.alive && h.h.conscious) {
        h.mind.note('felt', 'zapped', 'electricity went through me and I could not let go', 1);
        h.mind.ask('zapped', 80, null, 1.2);
      }
    }
  }

  clear() { this.zaps.clear(); this.live.clear(); this.contacts.length = 0; }
}

const ALL = Array.from({ length: PART_COUNT }, (_, i) => i);

/** Is there a cube of this voxel thing at, or right beside, a point in its own space? */
function near(v, lp) {
  const cs = v.cs;
  const gx = lp[0] + v.cx, gy = lp[1] + v.cy, gz = lp[2] + v.cz;
  const i0 = Math.floor(gx / cs[0]), j0 = Math.floor(gy / cs[1]), k0 = Math.floor(gz / cs[2]);
  for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) for (let dk = -2; dk <= 2; dk++) {
    const i = i0 + di, j = j0 + dj, k = k0 + dk;
    if (i < 0 || j < 0 || k < 0 || i >= v.nx || j >= v.ny || k >= v.nz) continue;
    if (v.cells[v.idx(i, j, k)]) return true;
  }
  return false;
}
