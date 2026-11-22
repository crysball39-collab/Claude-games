/* =============================================================================
   Arrows and bolts.

   Loosed from a bow or shot from a crossbow, an arrow is a thing in the air:
   it leaves at the speed the string gave it, drops under its own weight, and
   turns to follow the way it is going. Each frame the line it travels along
   is tested against people, crates, wooden walls, cars, buildings and the
   street, and where it first meets something it stops.

   In a person it is a deep puncture (armour may turn it), and the arrow stays
   in the wound, moving with the part it is in. In wood and in the earth it
   sticks, quivering. Off stone, steel and glass it glances, and falls.
   ========================================================================== */
import { rayBody } from '../physics/world.js';
import { groundHeight } from '../world/city.js';
import { P } from '../human/rig.js';
import { clamp01, rand } from '../core/util.js';

const G = 9.81;
const STEEL = 0xb8bdc2;
/** Each kind's model along its own +Z (the point forward), and where the point is. Box: x, y, z, w, h, l, colour. */
export const ARROW_KINDS = {
  arrow: {
    tip: 0.42, drag: 0.03, mass: 0.03, word: 'arrow',
    boxes: [[0, 0, 0, 0.0085, 0.0085, 0.74, 0x9a7448], [0, 0, 0.395, 0.003, 0.024, 0.05, STEEL], [0, 0, 0.395, 0.024, 0.003, 0.05, STEEL], [0, 0, 0.364, 0.011, 0.011, 0.022, 0x5a5e62],
      [0, 0, -0.29, 0.0016, 0.032, 0.1, 0xc63a26], [0, 0, -0.29, 0.032, 0.0016, 0.1, 0xece6d6], [0, 0, -0.372, 0.011, 0.011, 0.014, 0x18191b]],
  },
  bolt: {
    tip: 0.23, drag: 0.04, mass: 0.026, word: 'bolt',
    boxes: [[0, 0, 0, 0.011, 0.011, 0.36, 0x2b2d30], [0, 0, 0.205, 0.015, 0.015, 0.05, STEEL], [0, 0, -0.15, 0.0016, 0.024, 0.07, 0x2f7a42], [0, 0, -0.15, 0.024, 0.0016, 0.07, 0x2f7a42]],
  },
};
const MAX_KEEP = 60;
const _q = [0, 0, 0, 1], _a = [0, 0, 0], _b = [0, 0, 0, 0, 0, 0], _n = [0, 0, 0];
const _car = { lp: [0, 0, 0], ln: [0, 0, 0], tag: '', piece: 0, exit: 0, glass: -1 };

/** The turn that points +Z along (dx, dy, dz), with no roll. */
export function aimQuat(dx, dy, dz, out = _q) {
  const yaw = Math.atan2(dx, dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
  const sy = Math.sin(yaw / 2), cy = Math.cos(yaw / 2), sx = Math.sin(-pitch / 2), cx = Math.cos(-pitch / 2);
  out[0] = cy * sx; out[1] = sy * cx; out[2] = -sy * sx; out[3] = cy * cx;
  return out;
}
const qmul = (a, b, out) => {
  const x = a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1];
  const y = a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0];
  const z = a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3];
  const w = a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2];
  out[0] = x; out[1] = y; out[2] = z; out[3] = w; return out;
};

/**
 * Which way to send something at `v` metres a second from o so that it comes
 * down on t: the flatter of the two arcs. Null when t is out of its reach.
 */
export function lob(ox, oy, oz, tx, ty, tz, v) {
  const dx = tx - ox, dy = ty - oy, dz = tz - oz, d = Math.hypot(dx, dz);
  if (d < 0.3) { const l = Math.hypot(dx, dy, dz) || 1; return [dx / l, dy / l, dz / l]; }
  const v2 = v * v, disc = v2 * v2 - G * (G * d * d + 2 * dy * v2);
  if (disc < 0) return null;
  const a = Math.atan((v2 - Math.sqrt(disc)) / (G * d)), c = Math.cos(a);
  return [dx / d * c, Math.sin(a), dz / d * c];
}

export class Arrows {
  constructor(game) {
    this.g = game;
    this.list = [];                     // in the air, stuck in something, or lying where it fell
    this.stats = { loosed: 0, people: 0, stuck: 0, glanced: 0, stopped: 0, ghosts: 0 };
  }

  /**
   * One arrow (or bolt) leaves the string at (x, y, z), going (vx, vy, vz).
   * `ghost`: somebody else's, as their game saw it, which hurts nobody here.
   */
  loose(by, kind, x, y, z, vx, vy, vz, power, weapon, ghost = false) {
    const K = ARROW_KINDS[kind] || ARROW_KINDS.arrow;
    const a = { kind, K, by, weapon, x, y, z, vx, vy, vz, v0: Math.hypot(vx, vy, vz), power, ghost, t: 0, state: 'fly', inst: K.boxes.map(() => this.g.boxes.alloc()), q: [0, 0, 0, 1], spent: false, life: 120 };
    a.inst.forEach((i, n) => this.g.boxes.colorHex(i, K.boxes[n][6]));
    aimQuat(vx, vy, vz, a.q);
    this.list.push(a);
    if (!ghost) this.stats.loosed++; else if (by) this.stats.ghosts++;
    this._trim();
    return a;
  }

  /** An arrow already in somebody (another player's shot, as their game saw it land): put it there. */
  stickAt(h, part, point, dir, kind = 'arrow', depth = 0.1) {
    if (!h || h.removed || h.gone[part]) return null;
    const K = ARROW_KINDS[kind] || ARROW_KINDS.arrow, l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const dx = dir[0] / l, dy = dir[1] / l, dz = dir[2] / l;
    const a = this.loose(null, kind, point[0], point[1], point[2], dx, dy, dz, 0, 'bow', true);
    this._stickPart(a, h, part, point[0], point[1], point[2], dx, dy, dz, depth);
    return a;
  }

  _trim() {
    let n = this.list.length - MAX_KEEP;
    for (let i = 0; i < this.list.length && n > 0; i++) if (this.list[i].state !== 'fly') { this._drop(this.list[i]); i--; n--; }
  }
  _drop(a) {
    const k = this.list.indexOf(a);
    if (k >= 0) this.list.splice(k, 1);
    for (const i of a.inst) this.g.boxes.release(i);
  }

  /* --------------------------------- flight --------------------------------- */

  update(dt) {
    for (const a of [...this.list]) {
      if (a.state === 'fly') this._fly(a, dt);
      else if ((a.life -= dt) <= 0) this._drop(a);
    }
  }

  _fly(a, dt) {
    a.t += dt;
    if (a.t > 7 || a.y < -5) { this._drop(a); return; }
    // in two halves when it is going fast, so nothing thin is stepped over
    const n = a.v0 * dt > 0.9 ? 2 : 1;
    for (let s = 0; s < n && a.state === 'fly'; s++) this._step(a, dt / n);
  }

  _step(a, dt) {
    const g = this.g, K = a.K;
    const drag = Math.exp(-K.drag * dt);
    a.vx *= drag; a.vz *= drag; a.vy = a.vy * drag - G * dt;
    const ox = a.x, oy = a.y, oz = a.z;
    let dx = a.vx * dt, dy = a.vy * dt, dz = a.vz * dt;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return;
    dx /= len; dy /= len; dz /= len;
    aimQuat(a.vx, a.vy, a.vz, a.q);
    let best = len, what = 0, ph = null, prop = null, car = null;
    // people (the one who loosed it is behind it for the first moment)
    if (!a.spent) {
      ph = g.rayPeople(ox, oy, oz, dx, dy, dz, best, a.t < 0.2 ? a.by : null, 0.012);
      if (ph) { best = ph.t; what = 1; }
    }
    // buildings and the street
    const w = g.world.rayWorld(ox, oy, oz, dx, dy, dz, best, _n);
    if (w >= 0 && w < best) { best = w; what = 2; }
    // crates, walls and beams, lamps, things lying about
    for (const o of g.props) {
      const b = o.body;
      if (!b || o.kind === 'weapon') continue;
      const ex = b.px - ox, ey = b.py - oy, ez = b.pz - oz, R = (b.boundR || 1) + best;
      if (ex * ex + ey * ey + ez * ez > R * R) continue;
      const t = o.vox ? o.vox.ray(ox, oy, oz, dx, dy, dz, best) : rayBody(b, ox, oy, oz, dx, dy, dz, best, null);
      if (t >= 0 && t < best) { best = t; what = 3; prop = o; }
    }
    // cars
    if (g.traffic) for (const c of g.traffic.cars) {
      if ((c.x - ox) ** 2 + (c.z - oz) ** 2 > (4 + best) ** 2) continue;
      const t = c.ray(ox, oy, oz, dx, dy, dz, best, _car);
      // through a window that is already gone, into the car
      if (t >= 0 && t < best && _car.glass !== -2) { best = t; what = 4; car = c; }
    }
    a.x = ox + dx * best; a.y = oy + dy * best; a.z = oz + dz * best;
    if (!what) return;
    const x = a.x, y = a.y, z = a.z;
    if (what === 1 && ph.human.removed) return;
    if (what === 1) this._person(a, ph, x, y, z, dx, dy, dz);
    else if (what === 2) {
      const ground = _n[1] > 0.7 && y < groundHeight(x, z) + 0.25;
      // the earth takes an arrow that comes down into it; a wall of brick or stone turns it
      if (ground && !a.spent && dy < -0.25) this._stickWorld(a, x, y, z, dx, dy, dz, 0.06 + 0.1 * clamp01(-dy));
      else if (ground && a.spent) this._rest(a, x, y, z);
      else this._glance(a, _n[0], _n[1], _n[2], x, y, z, 'arrowglance');
    } else if (what === 3) {
      const wood = prop.kind === 'crate' || (prop.vox && prop.vox.mat === 'wood');
      if (wood && !a.spent) this._stickProp(a, prop, x, y, z, dx, dy, dz);
      else { rayBody(prop.body, ox, oy, oz, dx, dy, dz, len + 0.1, _b); prop.body.dirToWorld(_b[3] || 0, _b[4] || 1, _b[5] || 0, _n); this._glance(a, _n[0], _n[1], _n[2], x, y, z, 'arrowglance'); }
      if (!a.ghost && !prop.vox) prop.body.applyImpulse(dx * a.v0 * K.mass, dy * a.v0 * K.mass, dz * a.v0 * K.mass, x, y, z);
    } else if (what === 4) {
      car.dirToWorld(_car.ln[0], _car.ln[1], _car.ln[2], _n);
      this._glance(a, _n[0], _n[1], _n[2], x, y, z, _car.glass >= 0 ? 'clink' : 'arrowglance');
    }
  }

  /** Into somebody. */
  _person(a, ph, x, y, z, dx, dy, dz) {
    const g = this.g, t = ph.human;
    const speed = Math.hypot(a.vx, a.vy, a.vz), k = clamp01(speed / a.v0);
    if (a.ghost) {
      // another player's arrow, as it looked from here: whoever it struck takes it in their own game (and puts it in
      // themselves, exactly where it went); in somebody else's stand-in it is seen to stay; anybody else, it is gone
      if (t.puppet) { this._stickPart(a, t, ph.part, x, y, z, dx, dy, dz, 0.08); g.gore.burst(x, y, z, -dx, 0.4, -dz, 6, 2); }
      else this._drop(a);
      g.audio?.at('arrowhit', x, y, z, 0.6);
      return;
    }
    const power = a.power * (0.35 + 0.65 * k * k);
    const rep = t.hit({ part: ph.part, type: 'stab', arrow: a.kind, power, point: [x, y, z], dir: [dx, dy, dz], normal: ph.ln, impulse: (a.kind === 'bolt' ? 6 : 3.5) * k, attacker: a.by, weapon: a.weapon });
    this.stats.people++;
    if (a.by && a.by.isPlayer) g.ui?.hitMark();
    if (rep && rep.stopped) {
      // the vest or the helmet turned it
      this.stats.stopped++;
      const b = t.bodies[ph.part];
      b.dirToWorld(ph.ln[0], ph.ln[1], ph.ln[2], _n);
      this._glance(a, _n[0], _n[1], _n[2], x, y, z, 'arrowglance');
      return;
    }
    g.audio?.at('arrowhit', x, y, z, 0.9);
    // deeper the harder it came: a bolt from close by goes in to the fletching's end of its length
    const depth = Math.min(a.kind === 'bolt' ? 0.17 : 0.15, 0.05 + 0.06 * power);
    this._stickPart(a, t, ph.part, x, y, z, dx, dy, dz, depth);
    if (rep) g.minds?.witness({ kind: 'attack', actor: a.by, victim: t, weapon: a.weapon, part: ph.part, x, y, z, rep });
  }

  /** Held in a part of a body from now on, its point `depth` inside. */
  _stickPart(a, h, part, x, y, z, dx, dy, dz, depth) {
    const b = h.bodies[part], K = a.K;
    aimQuat(dx, dy, dz, a.q);
    const cx = x + dx * (depth - K.tip), cy = y + dy * (depth - K.tip), cz = z + dz * (depth - K.tip);
    b.toLocal(cx, cy, cz, _a);
    const inv = [-b.qx, -b.qy, -b.qz, b.qw];
    a.state = 'stuck'; a.human = h; a.part = part; a.body = b; a.lp = [_a[0], _a[1], _a[2]]; a.lq = qmul(inv, a.q, [0, 0, 0, 1]);
    a.quiver = 0.35; a.life = 240;
    this.stats.stuck++;
  }

  /** Fixed where it went in: the ground. */
  _stickWorld(a, x, y, z, dx, dy, dz, depth) {
    const K = a.K;
    aimQuat(dx, dy, dz, a.q);
    a.x = x + dx * (depth - K.tip); a.y = y + dy * (depth - K.tip); a.z = z + dz * (depth - K.tip);
    a.state = 'stuck'; a.body = null; a.quiver = 0.5; a.life = 150;
    this.g.audio?.at('arrowwood', x, y, z, 0.55);
    this.stats.stuck++;
  }

  /** Into a crate or a wooden wall: it rides on whatever it is in. */
  _stickProp(a, o, x, y, z, dx, dy, dz) {
    const b = o.body, K = a.K, depth = a.kind === 'bolt' ? 0.07 : 0.05;
    aimQuat(dx, dy, dz, a.q);
    b.toLocal(x + dx * (depth - K.tip), y + dy * (depth - K.tip), z + dz * (depth - K.tip), _a);
    a.state = 'stuck'; a.prop = o; a.body = b; a.lp = [_a[0], _a[1], _a[2]]; a.lq = qmul([-b.qx, -b.qy, -b.qz, b.qw], a.q, [0, 0, 0, 1]);
    a.quiver = 0.5; a.life = 150;
    this.g.audio?.at('arrowwood', x, y, z, 0.7);
    this.stats.stuck++;
  }

  /** Turned aside: it comes off at a slant, slower, and is no danger to anybody after. */
  _glance(a, nx, ny, nz, x, y, z, sound) {
    const vn = a.vx * nx + a.vy * ny + a.vz * nz;
    a.vx = (a.vx - 2 * vn * nx) * 0.22 + rand(-1, 1); a.vy = (a.vy - 2 * vn * ny) * 0.22 + rand(0, 1.2); a.vz = (a.vz - 2 * vn * nz) * 0.22 + rand(-1, 1);
    a.x = x + nx * 0.03; a.y = y + ny * 0.03; a.z = z + nz * 0.03;
    a.v0 = Math.max(4, Math.hypot(a.vx, a.vy, a.vz));
    if (!a.spent) { this.stats.glanced++; this.g.audio?.at(sound, x, y, z, 0.6); }
    a.spent = true;
  }

  /** Down: it lies where it fell. */
  _rest(a, x, y, z) {
    const yaw = Math.atan2(a.vx, a.vz) + rand(-0.3, 0.3);
    a.q[0] = 0; a.q[1] = Math.sin(yaw / 2); a.q[2] = 0; a.q[3] = Math.cos(yaw / 2);
    a.x = x; a.y = groundHeight(x, z) + 0.008; a.z = z;
    a.state = 'down'; a.body = null; a.life = 90;
  }

  /* ---------------------------------- drawing --------------------------------- */

  /** After physics: everything where it now is. */
  late(dt) {
    const bx = this.g.boxes;
    for (const a of [...this.list]) {
      let px = a.x, py = a.y, pz = a.z, q = a.q;
      if (a.state === 'stuck' && a.body) {
        const h = a.human, o = a.prop;
        // whoever (or whatever) it was in is gone, or the part it was in is: it falls
        if ((h && (h.removed || h.gone[a.part])) || (o && (o.removed || !this.g.props.includes(o)))) {
          if (h && h.removed) { this._drop(a); continue; }
          a.body.toWorld(a.lp[0], a.lp[1], a.lp[2], _a);
          a.x = _a[0]; a.y = _a[1]; a.z = _a[2]; a.vx = rand(-0.5, 0.5); a.vy = 0.5; a.vz = rand(-0.5, 0.5); a.v0 = 2;
          a.state = 'fly'; a.spent = true; a.body = null; a.human = null; a.prop = null; a.t = 0;
          continue;
        }
        const b = a.body;
        b.toWorld(a.lp[0], a.lp[1], a.lp[2], _a);
        px = _a[0]; py = _a[1]; pz = _a[2];
        q = qmul([b.qx, b.qy, b.qz, b.qw], a.lq, _q);
      }
      // a shiver along its length for a moment after it goes in
      if (a.quiver > 0) {
        a.quiver = Math.max(0, a.quiver - dt);
        const w = Math.sin(this.g.time * 70) * 0.04 * (a.quiver / 0.5);
        q = qmul(q, [w, w * 0.6, 0, 1], [0, 0, 0, 1]);
        const l = Math.hypot(q[0], q[1], q[2], q[3]); q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l;
      }
      if (a.state === 'fly' || !a.body) {
        // in the air (and lying about) the model is drawn from its point back
        const K = a.K, f = a.state === 'fly' ? K.tip : 0;
        const ax = 2 * (q[0] * q[2] + q[3] * q[1]), ay = 2 * (q[1] * q[2] - q[3] * q[0]), az = 1 - 2 * (q[0] * q[0] + q[1] * q[1]);
        px -= ax * f; py -= ay * f; pz -= az * f;
      }
      const B = a.K.boxes;
      for (let i = 0; i < B.length; i++) { const e = B[i]; bx.setOn(a.inst[i], px, py, pz, q[0], q[1], q[2], q[3], e[0], e[1], e[2], e[3], e[4], e[5]); }
    }
  }

  /** How many are sticking out of somebody. */
  inHuman(h) { let n = 0; for (const a of this.list) if (a.state === 'stuck' && a.human === h) n++; return n; }

  clear() {
    for (const a of [...this.list]) this._drop(a);
  }
}
