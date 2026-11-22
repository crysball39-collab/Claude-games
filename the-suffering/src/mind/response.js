/* =============================================================================
   Who the police send after you, and in what.

   The station's own officers, and more of them on foot while you are wanted
   (S.W.A.T. from two stars), come out of the station door, as they always
   have. On top of that, by the stars:

     two stars    patrol cars: two officers, lights and siren, sent from out
                  of your sight to wherever you are; they follow you if you
                  drive, and get out when they reach you
     three stars  a helicopter: either two S.W.A.T. in its doors with rifles,
                  or four who go down ropes to the ground before it leaves
     four stars   black S.W.A.T. vans (two in the cab, two on the steps), and
                  S.W.A.T. teams coming on foot from out of sight
     five stars   all of it, more often and more of it, and two helicopters

   Everything comes from somewhere you cannot see, a fair way off, and goes
   home the same way once it is over: whatever is out of your sight when you
   are no longer wanted is quietly taken away.
   ========================================================================== */
import { ST } from '../human/human.js';
import { rand, chance, pick, clamp } from '../core/util.js';
import { ROADS, ROAD_W, LANE, groundHeight } from '../world/city.js';

/**
 * By the stars: how many officers on foot from the station, how many patrol cars, helicopters, S.W.A.T. vans and
 * S.W.A.T. on foot at once, how long between one being sent and the next, and how many police in all.
 */
const LEVELS = [
  null,
  { foot: 6, cap: 10 },
  { foot: 8, cars: 1, carGap: 26, cap: 13 },
  { foot: 6, cars: 2, carGap: 22, helis: 1, heliGap: 28, cap: 18 },
  { foot: 6, cars: 2, carGap: 20, helis: 1, heliGap: 24, vans: 1, vanGap: 30, swat: 4, swatGap: 22, cap: 22 },
  { foot: 6, cars: 3, carGap: 12, helis: 2, heliGap: 14, vans: 2, vanGap: 16, swat: 6, swatGap: 12, cap: 28 },
];
/** How much of the usual traffic is left on the streets at each level (a city clears its streets for this). */
const TRAFFIC = [1, 1, 1, 1, 0.6, 0.4];

export class Response {
  constructor(police) {
    this.P = police;
    this.g = police.g;
    this.reinT = 0;
    this.t = { car: 0, heli: 0, van: 0, swat: 0 };
    this.level = 0;
    this.calmT = 0;
    this.stats = { cars: 0, helis: 0, vans: 0, swat: 0, foot: 0, home: 0 };
  }

  get cfg() { return LEVELS[this.P.wanted] || null; }

  /** Everyone police and on their feet or in a seat: what the force has out. */
  get force() { return this.g.humans.filter((h) => h.officer && !h.removed && h.h.alive && h.h.conscious && !h.puppet).length; }

  /** Units on the go: patrol cars and vans still running, helicopters still flying. */
  units(kind) {
    const T = this.g.traffic, A = this.g.air;
    if (kind === 'heli') return A ? A.list.filter((x) => !x.down && x.state !== 'leave').length : 0;
    return T ? T.cars.filter((c) => c.unit === kind && c.drivable && c.seats.some((h) => h && h.officer)).length : 0;
  }

  update(dt) {
    const g = this.g, P = this.P, p = g.player;
    if (!p) return;
    const n = P.wanted, C = this.cfg;
    // a new star: the first of whatever it brings is not long coming
    if (n > this.level) {
      if (n >= 2) this.t.car = Math.min(this.t.car, rand(5, 9));
      if (n >= 3) this.t.heli = Math.min(this.t.heli, rand(8, 13));
      if (n >= 4) { this.t.van = Math.min(this.t.van, rand(7, 12)); this.t.swat = Math.min(this.t.swat, rand(4, 8)); }
    }
    this.level = n;
    for (const k in this.t) this.t[k] -= dt;
    // the streets clear at four and five stars, and fill again after (to what they were, unless that was changed meanwhile)
    const T = g.traffic;
    if (T) {
      const thin = TRAFFIC[n];
      if (thin < 1) {
        if (this.thinned == null) this.baseCars = T.want;
        const want = Math.round(this.baseCars * thin);
        if (this.thinned !== want) { T.setCount(want); this.thinned = want; }
      } else if (this.thinned != null) {
        if (T.want === this.thinned) T.setCount(this.baseCars);
        this.thinned = null;
      }
    }
    // nobody is sent while there is no room for anybody (a test may close the city to newcomers)
    const room = g.maxPeople > 0;

    if (n && C && room) {
      const force = this.force, cap = C.cap;
      // on foot, from the station (at two stars and up it is S.W.A.T. who come out of it)
      this._station(dt, C, force);
      if (force < cap) {
        if (C.cars && this.t.car <= 0 && this.units('police') < C.cars) { this.t.car = C.carGap * rand(0.8, 1.2); if (this._car('police')) this.stats.cars++; }
        else if (C.helis && this.t.heli <= 0 && this.units('heli') < C.helis) { this.t.heli = C.heliGap * rand(0.8, 1.2); if (this._heli()) this.stats.helis++; }
        else if (C.vans && this.t.van <= 0 && this.units('swatvan') < C.vans && force + 4 <= cap + 2) { this.t.van = C.vanGap * rand(0.8, 1.2); if (this._car('swatvan')) this.stats.vans++; }
        else if (C.swat && this.t.swat <= 0 && this._swatOnFoot() < C.swat) { this.t.swat = C.swatGap * rand(0.8, 1.2); if (this._swatTeam()) this.stats.swat++; }
      }
    }
    // the helicopters stay while it is a helicopter's business, and go home when it is not
    if (g.air) for (const hl of g.air.list) if (!hl.down && hl.state !== 'leave' && (n < 3 || (hl.kind === 'gunner' && this.units('heli') > (C && C.helis || 0)))) hl.leave();
    this._home(dt);
  }

  /** More officers out of the station door when it is serious. */
  _station(dt, C, force) {
    const g = this.g, P = this.P, p = g.player, S = g.city.police;
    const onFoot = g.humans.filter((o) => o.officer && o.h.alive && o.h.conscious && !o.removed && !o.cuffed && !o.car && !o.unit);
    this.reinT -= dt;
    if (!S || onFoot.length >= C.foot || force >= C.cap || this.reinT > 0 || g.humans.length >= g.maxPeople - 1) return;
    this.reinT = 4;
    const nearDoor = Math.hypot(p.x - S.door.x, p.z - S.door.z) < 12;
    const at = nearDoor ? S.inside : S.door;
    const post = { x: at.x, z: at.z, yaw: Math.PI, kind: 'beat' };
    const o = P.wanted >= 2 && g.spawnSwat ? g.spawnSwat(at.x + rand(-0.6, 0.6), at.z + rand(-0.3, 0.3), Math.PI, post) : g.spawnOfficer(at.x + rand(-0.6, 0.6), at.z + rand(-0.3, 0.3), Math.PI, post);
    P.extra.add(o);
    P.stats.reinforcements++;
    this.stats.foot++;
    P.note('reinforcement');
  }

  /* ------------------------------ where from ------------------------------ */

  /** Can you see this point (from your eyes, past the buildings)? */
  _inSight(x, y, z) {
    const g = this.g, p = g.player, ey = p.y + 1.55;
    const dx = x - p.x, dy = y - ey, dz = z - p.z, d = Math.hypot(dx, dy, dz) || 1;
    const t = g.world.rayWorld(p.x, ey, p.z, dx / d, dy / d, dz / d, d);
    return t < 0;
  }

  /**
   * A point on a street, in its right hand lane and facing along it, between `min` and `max` metres from you, out of
   * your sight if there is one, with no car on it. Null if there is nowhere.
   */
  streetSpot(min = 45, max = 95) {
    const g = this.g, p = g.player, J = g.city.junctions, T = g.traffic;
    const best = [];
    for (const a of J) for (const id of a.out) {
      const b = J[id];
      const L = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
      for (let k = 1; k <= 3; k++) {
        const s = ROAD_W / 2 + (L - ROAD_W) * k / 4;
        const x = a.x + dx * s - dz * LANE, z = a.z + dz * s + dx * LANE;
        const d = Math.hypot(x - p.x, z - p.z);
        if (d < min || d > max) continue;
        if (T && T.cars.some((c) => Math.hypot(c.x - x, c.z - z) < 9)) continue;
        const seen = this._inSight(x, 1.2, z);
        best.push({ x, z, yaw: Math.atan2(dx, dz), score: (seen ? 0 : 100) + rand(0, 30) - Math.abs(d - (min + max) / 2) * 0.3 });
      }
    }
    if (!best.length) return null;
    best.sort((u, v) => v.score - u.score);
    return pick(best.slice(0, 3));
  }

  /** A pavement out of your sight, `min`..`max` metres off, with room for a few people. */
  _footSpot(min = 32, max = 60) {
    const g = this.g, p = g.player, city = g.city;
    let best = null, bs = -Infinity;
    for (let k = 0; k < 24; k++) {
      const s = city.randomPavement();
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < min || d > max || !city.isClear(s.x, s.z, 0.6)) continue;
      const sc = (this._inSight(s.x, 1.2, s.z) ? 0 : 100) + rand(0, 20);
      if (sc > bs) { bs = sc; best = s; }
    }
    return best;
  }

  /* ------------------------------- sending -------------------------------- */

  /** A patrol car (two officers) or a S.W.A.T. van (four), sent on its way to you. */
  _car(kind) {
    const g = this.g, T = g.traffic;
    if (!T || !T.spawnUnit) return null;
    const at = this.streetSpot();
    if (!at) return null;
    const car = T.spawnUnit(kind, at);
    if (!car) return null;
    car.cameSeen = this._inSight(at.x, 1.2, at.z);
    for (const h of car.seats) if (h) this.P.extra.add(h);
    this.P.note(kind === 'swatvan' ? 'a S.W.A.T. van sent' : 'a patrol car sent');
    return car;
  }

  /** A helicopter: two door gunners, or four to go down the ropes (at five stars the second is the other kind). */
  _heli() {
    const g = this.g, A = g.air;
    if (!A) return null;
    const other = A.list.find((x) => !x.down && x.state !== 'leave');
    const kind = other ? (other.kind === 'gunner' ? 'drop' : 'gunner') : chance(0.5) ? 'gunner' : 'drop';
    const hl = A.spawn(kind);
    if (!hl) return null;
    for (const h of hl.seats) if (h) this.P.extra.add(h);
    this.P.note(`a helicopter sent (${kind === 'gunner' ? 'door gunners' : 'to rope a team down'})`);
    return hl;
  }

  _swatOnFoot() { return this.g.humans.filter((h) => h.swat && h.footTeam && !h.removed && h.h.alive && h.h.conscious).length; }

  /** Two or three S.W.A.T. on foot, from somewhere you cannot see. */
  _swatTeam() {
    const g = this.g, at = this._footSpot();
    if (!at) return null;
    const n = this.P.wanted >= 5 ? 3 : 2, out = [];
    const yaw = Math.atan2(g.player.x - at.x, g.player.z - at.z);
    for (let i = 0; i < n; i++) {
      const x = at.x + Math.sin(yaw + Math.PI / 2) * (i - (n - 1) / 2) * 0.9, z = at.z + Math.cos(yaw + Math.PI / 2) * (i - (n - 1) / 2) * 0.9;
      if (!g.city.isClear(x, z, 0.35)) continue;
      const h = g.spawnSwat(x, z, yaw, { x, z, yaw, kind: 'beat' });
      h.footTeam = true;
      this.P.extra.add(h);
      out.push(h);
    }
    if (out.length) this.P.note('a S.W.A.T. team on foot');
    return out.length ? out : null;
  }

  /* -------------------------------- home ---------------------------------- */

  /** It is over (or this much of it is): whatever is out of your sight goes home. */
  _home(dt) {
    const g = this.g, P = this.P, p = g.player, T = g.traffic;
    this.calmT = P.wanted ? 0 : this.calmT + dt;
    // the officers called in go back, once nobody is wanted and they are well away from you
    if (!P.wanted && this.calmT > 40) for (const o of [...P.extra]) {
      if (o.removed || !o.h.alive) { P.extra.delete(o); continue; }
      if (o.car) continue;        // (in a car or a helicopter, they go with it)
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      const busy = o.brain && (o.brain.mode === 'engage' || o.brain.mode === 'escort' || o.brain.mode === 'callout' || o.cuffing);
      if (!busy && d > 40) { g.removeHuman(o); P.extra.delete(o); }
    }
    if (!T) return;
    for (const c of T.cars.slice()) {
      if (!c.unit) continue;
      // a unit nobody is in any more, or one sent for more stars than there are now, once you cannot see it
      const empty = !c.seats.some((h) => h && h.officer && h.h.alive);
      const done = (c.unit === 'police' && P.wanted < 2) || (c.unit === 'swatvan' && P.wanted < 4);
      if (!(done && (this.calmT > 15 || P.wanted)) && !(empty && this.calmT > 30)) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < 40 || this._inSight(c.x, 1.2, c.z)) continue;
      T.remove(c);
      this.stats.home++;
    }
  }

  /** Everything sent, gone at once: for a fresh start (a respawn, a test). */
  reset() {
    const g = this.g, T = g.traffic;
    if (T) for (const c of T.cars.slice()) if (c.unit) T.remove(c);
    if (T && this.thinned != null) { if (T.want === this.thinned) T.setCount(this.baseCars); this.thinned = null; }
    g.air?.clear();
    this.t = { car: 0, heli: 0, van: 0, swat: 0 };
    this.level = 0; this.calmT = 0;
  }
}
