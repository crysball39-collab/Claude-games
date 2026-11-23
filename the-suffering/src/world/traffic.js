/* =============================================================================
   Everything with wheels.

   Traffic keeps to the right hand lane of each street, slows for the
   junction ahead, takes it one at a time, and picks a new street at random
   when it gets there. Drivers brake for anyone standing in the road and lean
   on the horn if that person stays there. Gunfire nearby makes them put
   their foot down and stop caring who is in the way.

   Every car has somebody at the wheel, who can be seen through the glass,
   shot through it, or dragged out of it. A car that is hit hard, or whose
   driver stops driving it, comes off its rails and goes wherever its own
   weight takes it: the same physics that moves a car you drive. Its driver,
   if they still can, stops, looks at the damage, and either drives back into
   the traffic or gets out.

   Cars hit walls, posts, each other and people. Each impact is a change of
   speed, and that is what decides the damage: a dent as deep as the energy
   put into it, an engine that smokes, and in the end burns and goes up.
   Anyone lying in the road is driven over: under the wheels it is a tonne
   and a half on whatever part of them is there.
   ========================================================================== */
import { Car, WheelSet, BODY, WHEEL_R, WHEELBASE, TRACK, carDecal } from './car.js';
import { Boxes } from '../render/boxes.js';
import { Body, Island } from '../physics/world.js';
import { ROAD_W, LANE, KERB, ROADS, groundHeight } from './city.js';
import { CAR_PAINT } from './models.js';
import { ST } from '../human/human.js';
import { P, PART_COUNT } from '../human/rig.js';
import { cellUV } from '../render/quads.js';
import { DECAL, ATLAS_COLS, ATLAS_ROWS } from '../render/textures.js';
import { clamp, clamp01, lerp, rand, pick, chance, wrapAngle, damp, TAU } from '../core/util.js';

const CRUISE = 8.2, TURN_SPEED = 4.2, ACCEL = 3.2, BRAKE = 8.5;
const HALF = ROAD_W / 2;
const HL = 2.15, HW = 0.9;
const uvOf = (c) => cellUV(c[0], c[1], ATLAS_COLS, ATLAS_ROWS);
const HOLE_UV = uvOf(DECAL.hole), EXIT_UV = uvOf(DECAL.exitMetal), CRACK_UV = uvOf(DECAL.crack), SCORCH_UV = uvOf(DECAL.scorch);
const SPLAT_UV = DECAL.splat.map(uvOf), SOOT_UV = uvOf(DECAL.soot);
const _a = [0, 0, 0], _b = [0, 0, 0], _c = [0, 0, 0];
const _near = [];
const _hit = { nx: 0, nz: 0, depth: 0, px: 0, pz: 0 };
const DEBRIS_MAX = 40;

export class Traffic {
  constructor(game, count) {
    this.game = game;
    game.traffic = this;            // the cars made below look for the wheel set here
    this.cars = [];
    this.wheelSet = new WheelSet(game.scene, Boxes);
    this.near = null;               // the car the player could get into
    this.booms = [];                // explosions still lighting the street
    this.debris = [];
    this.crushT = new Map();
    this.stats = { crashes: 0, explosions: 0, carjacks: 0, runOver: 0, windows: 0, shots: 0, smashed: 0 };
    this.want = count;
    this._park();
    this.setCount(count);
  }

  /* ------------------------------ the cars ------------------------------- */

  _make(kind, paint) {
    const car = new Car(this.game, kind, paint);
    this.cars.push(car);
    return car;
  }

  /** The cars parked round the city: real cars, which anyone can get into. */
  _park() {
    for (const p of this.game.city.parked || []) {
      const car = this._make(p.kind || 'sedan', p.paint ?? pick(CAR_PAINT));
      car.x = p.x; car.z = p.z; car.yaw = p.yaw; car.y = groundHeight(p.x, p.z);
      car.mode = 'parked'; car.hand = 1; car.home = p;
      car.place(0);
    }
  }

  /** How many cars are out driving round. */
  get moving() { return this.cars.filter((c) => c.traffic && !c.wreck).length; }

  setCount(n) {
    this.want = n;
    const p = this.game.player;
    const mine = () => this.cars.filter((c) => c.traffic && (!p || p.car !== c));
    let list = mine();
    // too many: the ones furthest away go first, wrecks before anything
    while (list.filter((c) => !c.wreck).length > n || (n === 0 && list.length)) {
      let worst = null, ws = -1;
      for (const c of list) {
        const s = Math.hypot(c.x - (p ? p.x : 0), c.z - (p ? p.z : 0)) + (c.wreck ? 500 : 0);
        if (s > ws) { ws = s; worst = c; }
      }
      if (!worst) break;
      this.remove(worst);
      list = mine();
    }
    let guard = 0;
    while (this.cars.filter((c) => c.traffic && !c.wreck && c.mode === 'rail').length < n && guard++ < 200) this._add();
  }

  /** A car from the sandbox: parked where it is put, nobody in it. */
  spawnParked(kind, x, z, yaw) {
    const paint = kind === 'police' ? 0xf0f0ec : kind === 'taxi' ? 0xe0b021 : pick(CAR_PAINT);
    const car = this._make(kind, paint);
    car.x = x; car.z = z; car.yaw = yaw; car.y = groundHeight(x, z);
    car.mode = 'parked'; car.hand = 1; car.traffic = false; car.spawned = true;
    car.place(0);
    // nothing standing where it appeared
    for (const h of this.game.humans) if (!h.car && this._inside(car, h.x, h.z, 0.25) && h.state === ST.ANIM) h.shove((h.x - x) * 2, (h.z - z) * 2, 30, null);
    return car;
  }

  /**
   * A police unit sent after you: a patrol car with two officers, or a S.W.A.T. van with four (two in the cab, two on
   * its steps). It appears on a street (the Response picks one out of your sight), already moving, lights and siren
   * going, and drives itself to you (see _pursue).
   */
  spawnUnit(kind, at) {
    const g = this.game;
    if (!g.spawnOfficer || !g.spawnSwat) return null;
    const car = this._make(kind, kind === 'police' ? 0xf0f0ec : 0x16181c);
    car.x = at.x; car.z = at.z; car.yaw = at.yaw; car.y = groundHeight(at.x, at.z);
    car.mode = 'loose'; car.traffic = false; car.hand = 0; car.unit = kind; car.siren = true; car.quiet = false;
    car.ai = { state: 'pursue', t: 0, stuck: 0, route: null, routeT: 0, wp: 0, rx: 0, rz: 0 };
    const v0 = 7;
    car.vx = Math.sin(at.yaw) * v0; car.vz = Math.cos(at.yaw) * v0; car.speed = v0;
    car.place(0);
    const n = kind === 'swatvan' ? 4 : 2;
    for (let i = 0; i < n; i++) {
      const h = kind === 'swatvan' ? g.spawnSwat(car.x, car.z, car.yaw) : g.spawnOfficer(car.x, car.z, car.yaw);
      if (!h) continue;
      if (kind === 'swatvan') h.vanTeam = true;
      this.seat(h, car, i, true);
    }
    this.stats.units = (this.stats.units || 0) + 1;
    return car;
  }

  /** The sandbox's clean up: wrecks, cars left lying about, and the pieces; the city's own and the traffic stay. */
  clearCars() {
    const p = this.game.player;
    for (const c of this.cars.slice()) {
      if (c.home && !c.wreck && c.mode === 'parked' && c.hp > 99) continue;
      if (c.seats.includes(p)) continue;
      if (c.traffic && !c.wreck && c.mode === 'rail') continue;
      this.remove(c);
    }
    for (const d of this.debris.splice(0)) this._dropDebris(d);
    // the city's own parked cars come back
    for (const home of this.game.city.parked || []) {
      if (this.cars.some((c) => c.home === home)) continue;
      const car = this._make(home.kind || 'sedan', home.paint);
      car.x = home.x; car.z = home.z; car.yaw = home.yaw; car.y = groundHeight(home.x, home.z);
      car.mode = 'parked'; car.hand = 1; car.home = home;
      car.place(0);
    }
  }

  /** Everything back as the city was built: for tests. */
  reset() {
    for (const c of this.cars.slice()) this.remove(c);
    for (const d of this.debris.splice(0)) this._dropDebris(d);
    this.booms.length = 0;
    this._park();
    this.setCount(this.want);
  }

  _add() {
    const g = this.game, J = g.city.junctions;
    const a = J[(Math.random() * J.length) | 0];
    const b = J[pick(a.out)];
    const len = Math.hypot(b.x - a.x, b.z - a.z) - ROAD_W;
    const s = rand(1, len - 6);
    const probe = { from: a.id, to: b.id, s, u: -1, turn: null };
    this._railPose(probe);
    const p = g.player;
    if (p && Math.hypot(probe.x - p.x, probe.z - p.z) < 18) return false;
    for (const c of this.cars) if (Math.hypot(c.x - probe.x, c.z - probe.z) < 7) return false;
    const kind = chance(0.18) ? 'van' : chance(0.15) ? 'taxi' : 'sedan';
    const paint = kind === 'taxi' ? 0xe0b021 : pick(CAR_PAINT);
    const car = this._make(kind, paint);
    Object.assign(car, { traffic: true, mode: 'rail', from: a.id, to: b.id, next: -1, s, u: -1, turn: null, speed: rand(3, CRUISE), wait: 0, honk: 0, panic: 0, blocked: 0, cruise: CRUISE * rand(0.85, 1.12) });
    this._railPose(car);
    car.y = 0; car.place(0);
    // and somebody driving it, now and then somebody beside them
    if (g.spawnHuman) {
      const d = g.spawnHuman(car.x, car.z, car.yaw);
      if (d) this.seat(d, car, 0, true);
      if (car.seats.length > 1 && chance(0.2)) { const q = g.spawnHuman(car.x, car.z, car.yaw); if (q) this.seat(q, car, 1, true); }
    }
    return true;
  }

  remove(car) {
    const g = this.game;
    for (const h of car.seats) {
      if (!h) continue;
      if (h.isPlayer) this.unseat(h);
      else { car.seats[h.seat] = null; h.car = null; g.removeHuman ? g.removeHuman(h) : h.remove(); }
    }
    for (const j of g.city.junctions) if (j.holder === car) j.holder = null;
    car.dispose();
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    if (this.near === car) this.near = null;
  }

  /* ------------------------------- people -------------------------------- */

  /** Somebody gets into a seat. */
  seat(h, car, i, instant = false) {
    if (!h || !car || car.seats[i] || h.car) return false;
    car.seats[i] = h;
    h.enterCar(car, i, instant);
    if (!instant) this.game.audio?.at('door', car.x, car.y + 0.8, car.z, 0.7);
    return true;
  }
  /** And out again, beside the door on their side if there is room there. `raw`: dragged or thrown out, not climbing out. */
  unseat(h, raw = false) {
    const car = h.car;
    if (!car) return null;
    const spot = this._doorSpot(car, h.seat, h);
    car.seats[h.seat] = null;
    h.leaveCar(spot.x, spot.z, spot.yaw, car, raw);
    this.game.audio?.at('door', car.x, car.y + 0.8, car.z, 0.7);
    return spot;
  }
  _doorSpot(car, i, who = null) {
    const sp = car.seatAt[i] || car.seatAt[0], side = sp[0] > 0 ? 1 : -1;
    const tries = [[side * 1.42, sp[2] + 0.15], [side * 1.42, sp[2] - 0.75], [side * 1.42, sp[2] + 1.05], [side * 2.1, sp[2]], [-side * 1.42, sp[2] + 0.15], [-side * 1.42, sp[2] - 0.75], [0, HL + 0.8], [0, -HL - 0.8]];
    for (const [lx, lz] of tries) {
      car.toWorld(lx, 0, lz, _a);
      if (this._clearSpot(_a[0], _a[2], car, who)) return { x: _a[0], z: _a[2], yaw: car.yaw + (lx >= 0 ? Math.PI / 2 : -Math.PI / 2) };
    }
    car.toWorld(side * 1.42, 0, sp[2], _a);
    return { x: _a[0], z: _a[2], yaw: car.yaw };
  }
  /** Room for somebody to stand: no wall, no car, and nobody already standing (or lying) there. */
  _clearSpot(x, z, except, who = null) {
    if (!this.game.city.isClear(x, z, 0.3)) return false;
    for (const c of this.cars) if (c !== except && this._inside(c, x, z, 0.3)) return false;
    for (const h of this.game.humans) {
      if (h === who || h.removed || h.car) continue;
      if ((h.x - x) ** 2 + (h.z - z) ** 2 < 0.7 * 0.7) return false;
    }
    return true;
  }
  /** Is a point (with a margin) within a car's footprint? */
  _inside(c, x, z, pad = 0) {
    const ex = x - c.x, ez = z - c.z;
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    const lz = ex * fx + ez * fz, lx = ex * fz - ez * fx;
    return Math.abs(lx) < HW + pad && Math.abs(lz) < HL + pad;
  }

  /** Able to drive: alive, awake, not in cuffs, not rigid with a taser's current. */
  _fit(h) { return !!h && !h.removed && h.h.alive && h.h.conscious && !h.cuffed && h.tased <= 0; }

  /** The player (or anyone) takes a car: whoever is driving it is pulled out first. */
  enter(h, car) {
    const g = this.game;
    if (!car || !car.drivable || h.car) return false;
    const d = car.seats[0];
    if (d === h) return false;
    if (d) {
      const spot = this.unseat(d, true);
      if (d.h.alive && d.h.conscious) {
        // hauled out by the collar and shoved away from it
        const ax = spot ? spot.x - car.x : 1, az = spot ? spot.z - car.z : 0, al = Math.hypot(ax, az) || 1;
        d.shove(ax / al * 2.2, az / al * 2.2, 46, h);
        if (d.mind) {
          const m = d.mind;
          m.note('felt', 'carjack', `was dragged out of my own car by ${h.isPlayer ? 'the stranger' : 'someone'}`, 1, { by: h });
          m.stir('fear', 55); m.stir('anger', 50 + m.p.temper * 35); m.stir('surprise', 70);
          m.ask('carjacked', 92, null, rand(0.4, 1));
          // whoever did it is a danger, and a criminal, and the police are going to hear about it
          const k = m._know(h); k.hostile = 1; k.crime = Math.max(k.crime, 2); k.crimeT = g.time; k.hurtMe = true;
          m._threaten(h, 62);
          m._wantCall({ kind: 'assault', x: d.x, z: d.z, victim: d, suspect: h, self: true });
        }
        g.minds?.witness({ kind: 'attack', actor: h, victim: d, weapon: 'carjack', part: P.CHEST, x: d.x, y: d.y + 1.2, z: d.z, rep: { pain: 6, bones: [] } });
      } else d.toRagdoll();
      this.stats.carjacks++;
    }
    // whoever else is in it gets out, and away
    for (let i = 1; i < car.seats.length; i++) {
      const o = car.seats[i];
      if (!o || o.isPlayer) continue;
      this.unseat(o);
      if (o.h.alive && o.h.conscious) { o.mind?.stir('fear', 70); o.mind?.ask('carjacked', 60, null, rand(0.8, 1.6)); }
      else o.toRagdoll();
    }
    if (car.mode === 'rail') this.loosen(car);
    car.mode = 'loose'; car.traffic = false; car.ai = null; car.hand = 0;
    this.seat(h, car, 0);
    if (h.isPlayer) { g.ui?.drivingChanged?.(true); g.ui?.toast(car.hp < 50 ? 'In. It is not in good shape.' : 'In. GAS and BRAKE to drive, the arrows to steer.'); }
    return true;
  }

  /** Out of the car, wherever it is: at speed, that is a fall onto the road. */
  exit(h) {
    const car = h.car;
    if (!car) return false;
    const sp = Math.hypot(car.vx, car.vz);
    this.unseat(h);
    if (car.seats[0] == null) { car.gas = 0; car.brake = 0; car.steerIn = 0; car.hand = sp < 1 ? 1 : 0; }
    if (sp > 3.5 && h.state === ST.ANIM) {
      h.toRagdoll();
      for (const b of h.bodies) { b.vx += car.vx * 0.85; b.vz += car.vz * 0.85; }
      h.mind?.note('felt', 'bail', 'threw myself out of a moving car', 0.8);
    }
    if (h.isPlayer) this.game.ui?.drivingChanged?.(false);
    return true;
  }

  /** A car comes off its rails: it keeps the speed it had and is driven (or not) from here on. */
  loosen(car) {
    if (car.mode !== 'rail') return;
    for (const j of this.game.city.junctions) if (j.holder === car) j.holder = null;
    car.mode = 'loose'; car.traffic = false;       // out of the traffic until it is back in a lane
    car.vx = car.dx * car.speed; car.vz = car.dz * car.speed; car.w = 0;
    car.ai = { state: 'stop', t: 0, wait: rand(1.4, 3) };
  }

  /* ------------------------------- rails --------------------------------- */

  /** Works out where a car is from how far along its lane or its turn it is. */
  _railPose(car) {
    const J = this.game.city.junctions, a = J[car.from], b = J[car.to];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
    const rx = -dz, rz = dx;                       // the right hand side, facing along the street
    if (car.u < 0) {
      car.x = a.x + dx * (HALF + car.s) + rx * LANE;
      car.z = a.z + dz * (HALF + car.s) + rz * LANE;
      car.yaw = Math.atan2(dx, dz);
      car.dx = dx; car.dz = dz;
      return;
    }
    const t = car.turn, u = car.u, v = 1 - u;
    car.x = v * v * t.x0 + 2 * v * u * t.cx + u * u * t.x1;
    car.z = v * v * t.z0 + 2 * v * u * t.cz + u * u * t.z1;
    const tx = 2 * v * (t.cx - t.x0) + 2 * u * (t.x1 - t.cx), tz = 2 * v * (t.cz - t.z0) + 2 * u * (t.z1 - t.cz);
    const l = Math.hypot(tx, tz) || 1;
    car.dx = tx / l; car.dz = tz / l;
    car.yaw = Math.atan2(tx, tz);
  }

  _beginTurn(car) {
    const J = this.game.city.junctions, a = J[car.from], b = J[car.to], c = J[car.next];
    const L = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
    const M = Math.hypot(c.x - b.x, c.z - b.z), ex = (c.x - b.x) / M, ez = (c.z - b.z) / M;
    const x0 = b.x - dx * HALF - dz * LANE, z0 = b.z - dz * HALF + dx * LANE;
    const x1 = b.x + ex * HALF - ez * LANE, z1 = b.z + ez * HALF + ex * LANE;
    const straight = Math.abs(dx * ex + dz * ez) > 0.9;
    const cx = straight ? (x0 + x1) / 2 : b.x - dz * LANE - ez * LANE, cz = straight ? (z0 + z1) / 2 : b.z + dx * LANE + ex * LANE;
    const len = straight ? ROAD_W : (Math.hypot(cx - x0, cz - z0) + Math.hypot(x1 - cx, z1 - cz)) * 0.82;
    car.turn = { x0, z0, x1, z1, cx, cz, len, straight };
    car.u = 0;
  }

  _rail(car, dt) {
    const g = this.game, J = g.city.junctions;
    const a = J[car.from], b = J[car.to];
    const L = Math.hypot(b.x - a.x, b.z - a.z) - ROAD_W;
    // a frightened driver drives like it
    const d = car.seats[0];
    if (d && d.mind && d.mind.emo.fear > 70) car.panic = Math.max(car.panic, 2);
    const panic = car.panic > 0;
    let limit = car.cruise * (panic ? 1.55 : 1) * (car.hp < 50 ? 0.75 : 1);
    let stopIn = Infinity;
    // a siren close by: slow right down and let it through
    for (const o of this.cars) {
      if (o === car || !o.unit || !o.siren || o.quiet || !o.drivable) continue;
      if ((o.x - car.x) ** 2 + (o.z - car.z) ** 2 < 24 * 24) { limit = Math.min(limit, 2.2); break; }
    }

    if (car.u < 0) {
      if (car.next < 0 && car.s > L - 14) {
        const opts = b.out.filter((id) => id !== car.from);
        car.next = pick(opts.length ? opts : b.out);
      }
      const toLine = L - car.s;
      if (toLine < 12) limit = Math.min(limit, lerp(TURN_SPEED, limit, clamp01((toLine - 2) / 10)));
      let clearAhead = b.holder === null || b.holder === car;
      if (clearAhead && car.next >= 0) {
        for (const o of this.cars) if (o !== car && o.mode === 'rail' && o.from === car.to && o.to === car.next && o.u < 0 && o.s < 6.5) clearAhead = false;
      }
      if (!clearAhead) stopIn = Math.min(stopIn, toLine - 0.4);
      for (const o of this.cars) {
        if (o === car || o.mode !== 'rail') continue;
        let gap = Infinity;
        if (o.from === car.from && o.to === car.to && o.u < 0 && o.s > car.s) gap = o.s - car.s - 5.4;
        else if (o.from === car.from && o.to === car.to && o.u >= 0) gap = toLine - 0.4;
        if (gap < stopIn) stopIn = gap;
      }
    } else if (!car.turn.straight) limit = Math.min(limit, TURN_SPEED * (panic ? 1.5 : 1));

    // people, things, and cars that are not in the traffic, in the way
    const look = car.speed * car.speed / (2 * BRAKE) + 4.5;
    let person = false, thing = false, wall = false;
    if (!panic || car.speed < 2) {
      for (const h of g.humans) {
        if (h.removed || h.car) continue;
        const ex = h.x - car.x, ez = h.z - car.z;
        const along = ex * car.dx + ez * car.dz, side = ex * -car.dz + ez * car.dx;
        if (along < 1.2 || along > look + 2 || Math.abs(side) > 1.35) continue;
        // someone lying in the road is driven round if possible and over if not
        if (h.state === ST.RAGDOLL && car.blocked > (h.h.alive ? 7 : 3)) continue;
        person = true;
        stopIn = Math.min(stopIn, along - HL - 1.1);
      }
    }
    const obstacle = (bx, bz, hx, hz, ux, uz, fixed) => {
      let near = Infinity;
      for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) {
        const px = bx + ux * hx * u - uz * hz * v, pz = bz + uz * hx * u + ux * hz * v;
        const ex = px - car.x, ez = pz - car.z;
        const along = ex * car.dx + ez * car.dz, side = ex * -car.dz + ez * car.dx;
        if (along < 1.2 || along > look + 1 || Math.abs(side) > 1.4) continue;
        if (along < near) near = along;
      }
      if (near === Infinity) return;
      if (car.blocked > 3.5 && !fixed) return;
      thing = true;
      if (fixed) wall = true;
      stopIn = Math.min(stopIn, near - HL - 0.9);
    };
    for (const o of g.props) {
      if (!o.solid) continue;
      const bb = o.body;
      if (bb.py - bb.boundR > 1.6) continue;
      if ((bb.px - car.x) ** 2 + (bb.pz - car.z) ** 2 > (look + 6) ** 2) continue;
      bb.dirToWorld(1, 0, 0, _a);
      const l = Math.hypot(_a[0], _a[2]) || 1;
      obstacle(bb.px, bb.pz, bb.hx, bb.hz, _a[0] / l, _a[2] / l, o.vox && o.vox.anchored);
    }
    for (const o of this.cars) {
      if (o === car || o.mode === 'rail') continue;
      if ((o.x - car.x) ** 2 + (o.z - car.z) ** 2 > (look + 7) ** 2) continue;
      obstacle(o.x, o.z, HW, HL, Math.cos(o.yaw), -Math.sin(o.yaw), true);
    }

    // speed
    let target = limit;
    if (stopIn < Infinity) target = Math.min(target, stopIn <= 0.15 ? 0 : Math.sqrt(2 * BRAKE * 0.8 * Math.max(0, stopIn - 0.15)));
    if ((car.blocked > 3 && !person && !wall) || (person && car.blocked > 7)) target = Math.max(target, 1.6);
    const before = car.speed;
    if (target < car.speed) car.speed = Math.max(target, car.speed - BRAKE * dt);
    else car.speed = Math.min(target, car.speed + ACCEL * (panic ? 1.8 : 1) * dt);
    car.braking = car.speed < before - 0.5 * dt || (car.speed < 0.2 && stopIn < 6);
    if (before - car.speed > BRAKE * dt * 0.9 && before > 5 && !car.screech) { car.screech = true; g.audio?.at('screech', car.x, 0.5, car.z, clamp01(before / 9)); g.minds?.noise(car.x, 0.5, car.z, 94, 'screech', null); }
    if (car.speed > 3) car.screech = false;
    if (car.speed < 0.25 && (person || thing)) {
      car.blocked += dt;
      if (person && car.blocked > 1.1 && car.honk <= 0) this._honk(car);
    } else if (car.speed > 1) car.blocked = Math.max(0, car.blocked - dt * 2);

    // move
    const step = car.speed * dt, yaw0 = car.yaw;
    if (car.u < 0) {
      car.s += step;
      if (car.s >= L) {
        if (car.next < 0) car.next = pick(b.out);
        b.holder = car;
        this._beginTurn(car);
      }
    } else {
      car.u += step / car.turn.len;
      if (car.u >= 1) {
        if (J[car.to].holder === car) J[car.to].holder = null;
        car.from = car.to; car.to = car.next; car.next = -1; car.s = 0; car.u = -1; car.turn = null;
      }
    }
    this._railPose(car);
    // the front wheels turned as far as the curve asks for
    const w = dt > 0 ? wrapAngle(car.yaw - yaw0) / dt : 0;
    car.steer = damp(car.steer, Math.atan(w * WHEELBASE / Math.max(1, car.speed)), 8, dt);
    car.w = w; car.vx = car.dx * car.speed; car.vz = car.dz * car.speed;
    car.spin += car.speed / WHEEL_R * dt;
    car.reversing = false;
    this._ground(car, dt, car.braking ? 1 : 0);
    car.place(dt);
  }

  _honk(car) {
    const g = this.game;
    car.honk = rand(1.6, 2.6);
    g.audio?.at('horn', car.x, 1, car.z, 1);
    g.minds?.noise(car.x, 1, car.z, 106, 'horn', car.seats[0] || null);
  }

  /** Something loud happened: drivers close enough to hear it lose their nerve. */
  scare(x, z, radius) {
    for (const c of this.cars) if (Math.hypot(c.x - x, c.z - z) < radius) c.panic = Math.max(c.panic || 0, rand(4, 8));
  }

  /** How soon the nearest car reaches a point on a street, in seconds; Infinity if none is coming. */
  eta(x, z) {
    let best = Infinity;
    for (const c of this.cars) {
      if (c.wreck) continue;
      const sp = Math.hypot(c.vx, c.vz);
      if (sp < 0.8) continue;
      const ux = c.vx / sp, uz = c.vz / sp;
      const ex = x - c.x, ez = z - c.z;
      const along = ex * ux + ez * uz, side = Math.abs(ex * -uz + ez * ux);
      if (along < -1 || side > 2.6 || along > 30) continue;
      const t = along / Math.max(1.5, sp);
      if (t < best) best = t;
    }
    return best;
  }

  /* -------------------------- driving, freely ---------------------------- */

  /** A driver who has come off the rails: stops, gets their breath, then drives back into the traffic or gets out. */
  _ai(car, d, dt) {
    const a = car.ai || (car.ai = { state: 'stop', t: 0, wait: rand(1.2, 2.6) });
    a.t += dt;
    const fwd = car.vx * Math.sin(car.yaw) + car.vz * Math.cos(car.yaw);
    car.hand = 0;
    // to stop: the brake until it has, then the handbrake (the brake held at a standstill would reverse it)
    const halt = () => { car.gas = 0; car.steerIn = 0; if (Math.abs(fwd) > 0.6) { car.brake = fwd > 0 ? 1 : 0; car.gas = fwd < 0 ? 1 : 0; } else { car.brake = 0; car.hand = 1; } };
    const m = d.mind, afraid = m && m.emo.fear > 60;
    if (!car.drivable) {
      halt();
      if (Math.abs(fwd) < 2.5) this._everyoneOut(car, true);
      return;
    }
    if (a.state === 'stop') {
      halt();
      if (Math.abs(fwd) < 0.3 && a.t > a.wait) {
        const threat = m && m.threat && Math.hypot(m.threat.x - car.x, m.threat.z - car.z) < 12;
        if (car.hp < 45 || (threat && !afraid && chance(0.5))) { this._everyoneOut(car, afraid); return; }
        a.state = afraid || threat ? 'flee' : 'rejoin'; a.t = 0; a.stuck = 0;
        if (m) m.doing = a.state === 'flee' ? 'driving away as fast as the car will go' : 'getting back into the traffic';
      }
      return;
    }
    if (a.state === 'reverse') {
      car.gas = 0; car.brake = 0.8; car.steerIn = a.steer;
      if (a.t > 1.7) { a.state = a.back || 'rejoin'; a.t = 0; a.stuck = 0; }
      return;
    }
    // back to the nearest lane going the way the car is pointing
    const L = this._nearestLane(car.x, car.z, car.yaw);
    if (!L) { halt(); return; }
    const sp = Math.abs(fwd);
    const ahead = Math.min(L.len, Math.max(0, L.s) + 6 + sp * 0.5);
    const tx = L.ox + L.dx * ahead, tz = L.oz + L.dz * ahead;
    const ang = wrapAngle(Math.atan2(tx - car.x, tz - car.z) - car.yaw);
    car.steerIn = clamp(-ang * 2.4, -1, 1);
    const want = a.state === 'flee' ? 12 : car.panic > 0 ? 9 : 5.5;
    car.gas = fwd < want ? (Math.abs(ang) > 1.2 ? 0.45 : 0.85) : 0;
    car.brake = fwd > want + 1.5 ? 0.5 : 0;
    if (Math.abs(L.side) < 0.7 && Math.abs(wrapAngle(L.yaw - car.yaw)) < 0.28 && L.s > 0 && L.s < L.len - 4) { this._toRail(car, L, Math.max(0, fwd)); return; }
    if (fwd < 0.5) a.stuck += dt; else a.stuck = Math.max(0, a.stuck - dt);
    if (a.stuck > 2.4) { a.back = a.state; a.state = 'reverse'; a.t = 0; a.steer = -car.steerIn; }
    if (a.t > 40) this._everyoneOut(car, false);
  }

  /**
   * A police driver on the way to you: along the streets, fast, the siren going, to wherever you are if they can see
   * you (or have just been told), or else to where you were last seen. Close to you, they stop, and everyone gets out
   * (Brain._unitRide). If you are driving, they follow you, and stop when you do. When nobody is wanted any more,
   * they turn the siren off and go back into the traffic.
   */
  _pursue(car, d, dt) {
    const g = this.game, a = car.ai, p = g.player, P = g.police;
    a.t += dt;
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const fwd = car.vx * fx + car.vz * fz;
    car.hand = 0;
    const halt = () => { car.gas = 0; car.steerIn = 0; if (Math.abs(fwd) > 0.6) { car.brake = fwd > 0 ? 1 : 0; car.gas = fwd < 0 ? 1 : 0; } else { car.brake = 0; car.hand = 1; } };
    if (!P || !P.wanted || !p || !p.h.alive) {
      // stood down: lights off, back into the traffic (and taken away once out of sight: see Response._home)
      car.siren = false;
      car.ai = { state: 'rejoin', t: 0, stuck: 0 };
      return;
    }
    if (a.state === 'arrived') {
      halt();
      car.quiet = true;
      // everyone got out and you have gone: whoever is left at the wheel comes after you again
      const dd = Math.hypot((p.car || p).x - car.x, (p.car || p).z - car.z);
      if (a.t > 6 && dd > 45 && car.seats[0] && !car.seats[0].isPlayer && P.lastSeen && g.time - P.lastSeen.t < 6) { a.state = 'pursue'; a.t = 0; car.quiet = false; a.route = null; }
      return;
    }
    if (a.state === 'back') {
      car.gas = 0; car.brake = 0.85; car.steerIn = a.steer;
      if (a.t > 1.3) { a.state = 'pursue'; a.t = 0; a.stuck = 0; }
      return;
    }
    car.quiet = false;
    // where to: you, where they know you are
    const fresh = P.lastSeen && g.time - P.lastSeen.t < 4;
    const you = p.car || p;
    const tx = fresh || !P.lastSeen ? you.x : P.lastSeen.x, tz = fresh || !P.lastSeen ? you.z : P.lastSeen.z;
    a.routeT -= dt;
    if (!a.route || a.routeT <= 0 || Math.hypot(tx - a.rx, tz - a.rz) > 10) {
      a.route = this._streetRoute(car.x, car.z, car.yaw, tx, tz, Math.abs(fwd));
      a.wp = 0; a.routeT = 3; a.rx = tx; a.rz = tz;
    }
    const R = a.route;
    // there: near you (on foot, or stopped in a car), or at the spot they were sent to
    const toYou = Math.hypot(you.x - car.x, you.z - car.z), end = R[R.length - 1];
    const toEnd = Math.hypot(end.x - car.x, end.z - car.z);
    const youStopped = !p.car || Math.hypot(p.car.vx, p.car.vz) < 2.5;
    // (somewhere off the street, the nearest it can get on the street is as near as it gets)
    if ((fresh && youStopped && toYou < (p.car ? 10 : 13)) || (youStopped && toEnd < 6.5)) { a.state = 'arrived'; a.t = 0; halt(); return; }
    // the next point on the way, and the one after (to know whether it is a corner)
    while (a.wp < R.length - 1 && Math.hypot(R[a.wp].x - car.x, R[a.wp].z - car.z) < (R[a.wp].j ? 5.5 : 3)) a.wp++;
    const w = R[a.wp], nx = R[Math.min(R.length - 1, a.wp + 1)];
    const wd = Math.hypot(w.x - car.x, w.z - car.z);
    // down the middle of the road, between the two lanes of traffic (which keep to their own); braking for anything
    // in it, and round it if it is not going anywhere
    let ax = w.x, az = w.z, slow = Infinity, block = null;
    for (const o of this.cars) {
      if (o === car || (p.car === o && fresh)) continue;
      const ex = o.x - car.x, ez = o.z - car.z;
      if (ex * ex + ez * ez > 900) continue;
      const along = ex * fx + ez * fz, side = ex * -fz + ez * fx;
      if (along < 2.5 || along > 9 + Math.max(0, fwd) * 0.9 || Math.abs(side) > 1.7) continue;
      const v = Math.max(0, (along - 5.2) * 0.9 + Math.max(0, o.vx * fx + o.vz * fz));
      if (v < slow) { slow = v; block = { o, side }; }
    }
    if (block && Math.hypot(block.o.vx, block.o.vz) < 1 && fwd < 2.5) a.blockT = (a.blockT || 0) + dt; else a.blockT = 0;
    if (a.blockT > 1.5 && !a.around) { a.around = { t: 2.6, dir: block.side > 0 ? -1 : 1 }; a.blockT = 0; }
    if (a.around) {
      a.around.t -= dt;
      if (a.around.t <= 0) a.around = null;
      else { ax += -fz * a.around.dir * 3.2 + fx * 4; az += fx * a.around.dir * 3.2 + fz * 4; slow = Infinity; }
    }
    const ang = wrapAngle(Math.atan2(ax - car.x, az - car.z) - car.yaw);
    car.steerIn = clamp(-ang * 2.6, -1, 1);
    // how fast: flat out on a straight, slow for a corner, slower near you
    let want = car.unit === 'swatvan' ? 14 : 17, cap = Infinity;
    if (w.j && nx !== w) {
      const ix = w.x - car.x, iz = w.z - car.z, ox = nx.x - w.x, oz = nx.z - w.z;
      const c = (ix * ox + iz * oz) / ((Math.hypot(ix, iz) || 1) * (Math.hypot(ox, oz) || 1));
      // a corner: no faster than it can be braked down from to take it at a crawl by the time it is there
      if (c < 0.7) cap = Math.min(cap, Math.sqrt(36 + 2 * 6.5 * Math.max(0, wd - 6.5)));
    }
    if (Math.abs(ang) > 1.2) cap = Math.min(cap, 5);
    cap = Math.min(cap, slow);
    // through a junction a little more carefully, whatever is crossing it
    if (w.j && wd < 12) cap = Math.min(cap, 11);
    const close = Math.min(toYou, toEnd);
    if (close < 32) want = Math.min(want, 4 + close * 0.42);
    // stuck for good (tangled with a car it hit, say): they get out and come the rest of the way on foot
    a.slowT = Math.abs(fwd) < 2.5 ? (a.slowT || 0) + dt : Math.max(0, (a.slowT || 0) - dt * 2);
    if (a.slowT > 8) { a.state = 'arrived'; a.t = 0; a.bail = true; halt(); return; }
    // keeping up with you in your car (but never faster into a corner, or into the back of somebody, than it can take)
    if (p.car && fresh) want = Math.max(want, Math.min(20, Math.hypot(p.car.vx, p.car.vz) + 4));
    want = Math.min(want, cap);
    // somebody in the road just ahead: brake for them (not for you)
    for (const h of g.humans) {
      if (h.removed || h.car || h.isPlayer || h.state !== ST.ANIM) continue;
      const ex = h.x - car.x, ez = h.z - car.z, along = ex * fx + ez * fz, side = ex * -fz + ez * fx;
      if (along > 2 && along < 3 + fwd * 0.6 && Math.abs(side) < 1.3) want = Math.min(want, Math.max(0, along - 3.5));
    }
    car.gas = fwd < want ? (Math.abs(ang) > 1.0 ? 0.55 : 1) : 0;
    car.brake = fwd > want + 0.4 ? clamp01((fwd - want) / 2) : 0;
    // stuck against something: back off, wheel the other way, and try again
    if (fwd < 0.6 && car.gas > 0) a.stuck += dt; else a.stuck = Math.max(0, a.stuck - dt * 2);
    if (a.stuck > 1.6) { a.state = 'back'; a.t = 0; a.steer = -Math.sign(car.steerIn || 1); a.route = null; }
  }

  /**
   * The way along the streets from one point to another: the junctions to go through, then the point of the street
   * nearest where they are going, then (if that is not on a street) nothing further. Each point is { x, z, j } (j: a
   * junction, where the way may turn).
   */
  _streetRoute(x, z, yaw, tx, tz, speed = 0) {
    const J = this.game.city.junctions, E = ROADS[ROADS.length - 1], S = ROADS[0];
    // the nearest point on a street's middle, and which junctions are at either end of that piece of it
    const onStreet = (px, pz) => {
      let best = null, bd = Infinity;
      for (let i = 0; i < ROADS.length; i++) {
        const qz = clamp(pz, S, E), d = Math.abs(px - ROADS[i]) + Math.abs(pz - qz);
        if (d < bd) { bd = d; best = { x: ROADS[i], z: qz, i, axis: 'z' }; }
        const qx = clamp(px, S, E), d2 = Math.abs(pz - ROADS[i]) + Math.abs(px - qx);
        if (d2 < bd) { bd = d2; best = { x: qx, z: ROADS[i], j: i, axis: 'x' }; }
      }
      // the junctions either side of it along the street
      const k = (v) => { let n = 0; while (n < ROADS.length - 2 && v > ROADS[n + 1]) n++; return n; };
      if (best.axis === 'z') { const a = k(best.z); best.ends = [a * 4 + best.i, (a + 1) * 4 + best.i]; }
      else { const a = k(best.x); best.ends = [best.j * 4 + a, best.j * 4 + a + 1]; }
      return best;
    };
    const A = onStreet(x, z), B = onStreet(tx, tz);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    // turning round in the street costs time, more the faster it is going
    const turnRound = 25 + speed * 4;
    const out = [];
    // the same piece of street: straight there (turning round first if it is behind)
    const same = A.ends[0] === B.ends[0] && A.ends[1] === B.ends[1];
    let direct = Infinity;
    if (same) { const dx = B.x - x, dz = B.z - z, L = Math.hypot(dx, dz); direct = L + (L > 1 && (dx * fx + dz * fz) / L < -0.2 ? turnRound : 0); }
    // otherwise through the junctions: a shortest way that knows which way it came into each one, so that a U turn
    // (which, at a junction at the edge of the city, is a building) is the last thing it does
    const N = J.length, K = N + 1, NONE = N;
    const dist = new Float32Array(N * K).fill(Infinity), prev = new Int16Array(N * K).fill(-1), done = new Uint8Array(N * K);
    const turn = (f, u, v) => {
      if (f === NONE) return 0;
      if (v === f) return 90;
      const ax = J[u].x - J[f].x, az = J[u].z - J[f].z, bx = J[v].x - J[u].x, bz = J[v].z - J[u].z;
      return ax * bx + az * bz > 0 ? 0 : 4;
    };
    for (const e of A.ends) {
      const other = A.ends[0] === e ? A.ends[1] : A.ends[0];
      const j = J[e], dx = j.x - x, dz = j.z - z, L = Math.hypot(dx, dz);
      const behind = L > 0.5 && (dx * fx + dz * fz) / L < -0.2;
      // a junction just driven through is not one to go back to at speed
      if (behind && L < 9 && speed > 3) continue;
      const k = e * K + (other === e ? NONE : other);
      dist[k] = Math.min(dist[k], L + (behind ? turnRound : 0));
    }
    for (;;) {
      let u = -1, bd = Infinity;
      for (let i = 0; i < N * K; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      const uj = (u / K) | 0, uf = u % K;
      for (const v of J[uj].out) {
        const k = v * K + uj;
        const w = dist[u] + Math.hypot(J[v].x - J[uj].x, J[v].z - J[uj].z) + turn(uf, uj, v);
        if (w < dist[k]) { dist[k] = w; prev[k] = u; }
      }
    }
    // into the target's piece of street from either end: from the end it is reached at, along toward the other
    let goal = -1, gs = Infinity;
    for (const e of B.ends) {
      const other = B.ends[0] === e ? B.ends[1] : B.ends[0];
      for (let f = 0; f < K; f++) {
        const k = e * K + f;
        if (dist[k] === Infinity) continue;
        const sc = dist[k] + Math.hypot(J[e].x - B.x, J[e].z - B.z) + (f === other ? 90 : 0);
        if (sc < gs) { gs = sc; goal = k; }
      }
    }
    if (goal >= 0 && gs < direct) {
      const chain = [];
      for (let u = goal; u >= 0; u = prev[u]) chain.unshift((u / K) | 0);
      for (const u of chain) out.push({ x: J[u].x, z: J[u].z, j: true });
    }
    out.push({ x: B.x, z: B.z, j: false });
    return out;
  }

  _toRail(car, L, speed) {
    car.mode = 'rail';
    car.from = L.from; car.to = L.to; car.s = L.s; car.u = -1; car.turn = null; car.next = -1;
    car.speed = speed; car.ai = null; car.w = 0; car.blocked = 0;
    car.cruise = car.cruise || CRUISE;
    car.traffic = true;
  }

  /** The lane nearest a point that runs (more or less) the way the car is facing. */
  _nearestLane(x, z, yaw) {
    const J = this.game.city.junctions;
    let best = null, bs = Infinity;
    for (const a of J) for (const id of a.out) {
      const b = J[id];
      const D = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / D, dz = (b.z - a.z) / D;
      const ox = a.x + dx * HALF - dz * LANE, oz = a.z + dz * HALF + dx * LANE;
      const len = D - ROAD_W;
      const s = (x - ox) * dx + (z - oz) * dz;
      const side = (x - ox) * -dz + (z - oz) * dx;
      const off = s < 0 ? -s : s > len ? s - len : 0;
      const lyaw = Math.atan2(dx, dz);
      const score = Math.abs(side) + off + Math.abs(wrapAngle(lyaw - yaw)) * 6;
      if (score < bs) { bs = score; best = { from: a.id, to: b.id, s, side, len, ox, oz, dx, dz, yaw: lyaw }; }
    }
    return best;
  }

  _everyoneOut(car, afraid) {
    for (const h of car.seats) {
      if (!h || h.isPlayer || !this._fit(h)) continue;
      this.unseat(h);
      if (h.mind) {
        h.mind.stir('fear', afraid ? 45 : 15);
        h.mind.note('felt', 'getout', car.fire >= 0 ? 'got out of a burning car' : car.hp < 45 ? 'got out of my wrecked car' : 'got out of the car', 0.7);
        if (car.fire >= 0 || car.hp < 30) h.mind.ask('carFire', 70, null, rand(0.3, 1));
      }
    }
    car.gas = 0; car.steerIn = 0;
  }

  /** One step of a car under its own physics: pedals, steering, tyres. */
  _physics(car, h) {
    const S = car.spec;
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), lx = Math.cos(car.yaw), lz = -Math.sin(car.yaw);
    let vf = car.vx * fx + car.vz * fz, vs = car.vx * lx + car.vz * lz;
    const power = car.power, flats = car.flats || 0;
    const gas = car.gas, brake = car.brake;
    const top = S.top * (1 - flats * 0.22);
    let thr = 0, stop = 0;
    if (brake > 0 && gas > 0) stop = 9.5 * brake;
    else if (brake > 0) { if (vf > 0.5) stop = 9.5 * brake; else thr = -brake * S.accel * 0.75 * power * clamp01(1 + vf / S.rev); }
    else if (gas > 0) { if (vf < -0.5) stop = 9.5 * gas; else thr = gas * S.accel * power * clamp01(1 - vf / top) * (vf < 6 ? 1.2 : 1); }
    if (car.hand) stop = Math.max(stop, 5.5);
    const res = 0.2 + flats * 0.6 + (gas === 0 && brake === 0 ? 0.32 : 0) + 0.0011 * vf * vf + (car.wreck ? 6 : 0);
    vf += thr * h;
    const r = (stop + res) * h;
    vf = vf > r ? vf - r : vf < -r ? vf + r : thr !== 0 ? vf : 0;
    // the front wheels turn at a rate, and less far the faster it goes
    const maxSt = S.steer / (1 + Math.abs(vf) / 15);
    const want = -car.steerIn * maxSt + car.pull;
    car.steer += clamp(want - car.steer, -2.8 * h, 2.8 * h);
    // the turn the steering asks for, as far as the tyres can hold it
    const grip = S.grip * (1 - flats * 0.15);
    let wT = vf * Math.tan(car.steer) / WHEELBASE;
    const latMax = grip * (car.hand ? 1.3 : 1.08);
    if (Math.abs(wT * vf) > latMax) wT = Math.sign(wT) * latMax / Math.max(0.5, Math.abs(vf));
    if (car.hand && Math.abs(vf) > 4) wT *= 1.7;
    car.w += (wT - car.w) * Math.min(1, h * (car.hand ? 4 : 11));
    // sideways: the tyres scrub it off, up to what they can hold; with the back wheels locked, not much
    const lat = (car.hand ? grip * 0.3 : grip * 1.4) * h;
    vs = vs > lat ? vs - lat : vs < -lat ? vs + lat : 0;
    car.slip = Math.abs(vs);
    car.vx = fx * vf + lx * vs; car.vz = fz * vf + lz * vs;
    car.yaw += car.w * h;
    car.x += car.vx * h; car.z += car.vz * h;
    car.speed = vf;
    car.spin += vf / WHEEL_R * h;
    car.braking = (stop > 0 && Math.abs(vf) > 0.2) || (brake > 0 && vf > 0.5);
    car.reversing = vf < -0.3 || (brake > 0 && vf <= 0.5 && gas === 0);
    car.thr = thr;
  }

  /** The four wheels on whatever is under them; the body leaning on its springs. */
  _ground(car, dt, brake = 0) {
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), lx = Math.cos(car.yaw), lz = -Math.sin(car.yaw);
    const hw = WHEELBASE / 2, ht = TRACK / 2;
    const at = (f, l) => groundHeight(car.x + fx * f + lx * l, car.z + fz * f + lz * l);
    const FL = at(hw, ht), FR = at(hw, -ht), RL = at(-hw, ht), RR = at(-hw, -ht);
    const front = (FL + FR) / 2, back = (RL + RR) / 2, left = (FL + RL) / 2, right = (FR + RR) / 2;
    const y = (front + back) / 2 + (car.bump || 0) - (car.flats || 0) * 0.03;
    car.y = damp(car.y, y, 20, dt);
    const dive = brake * clamp01(Math.abs(car.speed) / 6) * 0.025 - clamp01(car.thr || 0) * 0.012;
    const lean = clamp(car.w * car.speed * 0.006, -0.05, 0.05);
    car.pitch = damp(car.pitch, -Math.atan2(front - back, WHEELBASE) + dive, 10, dt);
    car.roll = damp(car.roll, Math.atan2(left - right, TRACK) + lean, 10, dt);
    car.bump = damp(car.bump || 0, 0, 7, dt);
  }

  _drive(car, dt) {
    const g = this.game, d = car.seats[0];
    if (d && d.isPlayer) { /* the pedals are the player's: set by the game from the controls */ }
    else if (d && this._fit(d) && car.unit && car.ai && (car.ai.state === 'pursue' || car.ai.state === 'arrived' || car.ai.state === 'back')) this._pursue(car, d, dt);
    else if (d && this._fit(d)) this._ai(car, d, dt);
    else { car.gas = 0; car.steerIn = 0; car.brake = 0; if (Math.hypot(car.vx, car.vz) < 0.2 && !d) car.hand = 1; }
    if (!car.drivable) car.gas = 0;
    // a parked car that nothing has touched costs nothing
    const sp = Math.hypot(car.vx, car.vz);
    if (car.mode === 'parked' && sp < 0.01 && Math.abs(car.w) < 0.01 && !(d && d.isPlayer)) { car.vx = car.vz = car.w = 0; return; }
    const n = Math.max(1, Math.min(8, Math.ceil(sp * dt / 0.25)));
    const h = dt / n;
    for (let k = 0; k < n; k++) { this._physics(car, h); this._collide(car, h); }
    this._ground(car, dt, car.braking ? 1 : 0);
    car.place(dt);
    // stopped, with nobody at the wheel: it is parked again
    if (!d && sp < 0.05 && car.mode === 'loose') { car.mode = 'parked'; car.vx = car.vz = car.w = 0; car.hand = 1; }
    if (d && car.mode === 'parked') car.mode = 'loose';
    // tyres squealing: braking hard, or sliding
    if ((car.slip > 2.2 && sp > 5) || (car.braking && sp > 9 && car.brake > 0.8)) {
      if (!car.screech) { car.screech = true; g.audio?.at('screech', car.x, 0.5, car.z, clamp01(sp / 14)); g.minds?.noise(car.x, 0.5, car.z, 94, 'screech', d || null); }
      if (chance(0.3) && g.gore) for (const k of [2, 3]) { const wp = car.wheelPos[k]; car.toWorld(wp[0], 0.02, wp[2], _a); g.gore._groundDecal(SOOT_UV, _a[0], groundHeight(_a[0], _a[2]) + 0.013, _a[2], 0.22, 0.5, -car.yaw, 0.45); }
    } else if (sp < 3 || car.slip < 0.5) car.screech = false;
  }

  /* ------------------------------ collisions ----------------------------- */

  /** A car's footprint against an axis aligned box: the way out and how far, and where they touch. */
  _obbBox(car, bx, bz, ex, ez, out) {
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), lx = fz, lz = -fx;
    const cx = car.x - bx, cz = car.z - bz;
    let best = Infinity, nx = 0, nz = 0, axis = 0;
    const test = (ax, az, k) => {
      const rc = HW * Math.abs(lx * ax + lz * az) + HL * Math.abs(fx * ax + fz * az);
      const rb = ex * Math.abs(ax) + ez * Math.abs(az);
      const d = cx * ax + cz * az;
      const o = rc + rb - Math.abs(d);
      if (o <= 0) return false;
      if (o < best) { best = o; const s = d < 0 ? -1 : 1; nx = ax * s; nz = az * s; axis = k; }
      return true;
    };
    if (!test(1, 0, 0) || !test(0, 1, 0) || !test(fx, fz, 1) || !test(lx, lz, 1)) return false;
    out.nx = nx; out.nz = nz; out.depth = best;
    if (axis === 0) {
      // the box's face: the corner of the car furthest into it
      let m = Infinity;
      for (const [a, b] of CORNERS) {
        const px = car.x + fx * HL * a + lx * HW * b, pz = car.z + fz * HL * a + lz * HW * b;
        const v = px * nx + pz * nz;
        if (v < m) { m = v; out.px = px; out.pz = pz; }
      }
    } else {
      // the car's face: the corner of the box furthest into the car
      let m = -Infinity;
      for (const [a, b] of CORNERS) {
        const px = bx + ex * a, pz = bz + ez * b;
        const v = px * nx + pz * nz;
        if (v > m) { m = v; out.px = px; out.pz = pz; }
      }
    }
    return true;
  }

  /** Two footprints (one a car, the other a car or any box on the ground, given by centre, half sizes and its X axis). */
  _obbObb(car, bx, bz, hx, hz, ux, uz, out) {
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), lx = fz, lz = -fx;
    const vx = -uz, vz = ux;                         // the other box's Z axis
    const cx = car.x - bx, cz = car.z - bz;
    let best = Infinity, nx = 0, nz = 0, mine = false;
    const test = (ax, az, own) => {
      const ra = HW * Math.abs(lx * ax + lz * az) + HL * Math.abs(fx * ax + fz * az);
      const rb = hx * Math.abs(ux * ax + uz * az) + hz * Math.abs(vx * ax + vz * az);
      const d = cx * ax + cz * az;
      const o = ra + rb - Math.abs(d);
      if (o <= 0) return false;
      if (o < best) { best = o; const s = d < 0 ? -1 : 1; nx = ax * s; nz = az * s; mine = own; }
      return true;
    };
    if (!test(fx, fz, true) || !test(lx, lz, true) || !test(ux, uz, false) || !test(vx, vz, false)) return false;
    out.nx = nx; out.nz = nz; out.depth = best;
    if (!mine) {
      let m = Infinity;
      for (const [a, b] of CORNERS) {
        const px = car.x + fx * HL * a + lx * HW * b, pz = car.z + fz * HL * a + lz * HW * b;
        const v = px * nx + pz * nz;
        if (v < m) { m = v; out.px = px; out.pz = pz; }
      }
    } else {
      let m = -Infinity;
      for (const [a, b] of CORNERS) {
        const px = bx + ux * hx * b + vx * hz * a, pz = bz + uz * hx * b + vz * hz * a;
        const v = px * nx + pz * nz;
        if (v > m) { m = v; out.px = px; out.pz = pz; }
      }
    }
    return true;
  }

  _collide(car, h) {
    const g = this.game, W = g.world;
    const r = HL + 0.4;
    W.queryStatics(car.x - r, car.z - r, car.x + r, car.z + r, _near);
    for (let i = 0; i < _near.length; i++) {
      const s = _near[i];
      if (s.maxy < car.y + 0.34 || s.miny > car.y + 1.3) continue;
      if (this._obbBox(car, (s.minx + s.maxx) / 2, (s.minz + s.maxz) / 2, (s.maxx - s.minx) / 2, (s.maxz - s.minz) / 2, _hit)) this._fixed(car, _hit, s.kind || 'wall');
    }
    // other cars
    for (const o of this.cars) {
      if (o === car) continue;
      if ((o.x - car.x) ** 2 + (o.z - car.z) ** 2 > 22) continue;
      // two cars both under their own physics meet once, not twice
      if (o.mode === 'loose' && !o.wreck && o.id < car.id) continue;
      if (o.wreck && o.body.py - o.body.boundR > car.y + 1.4) continue;
      const ux = Math.cos(o.yaw), uz = -Math.sin(o.yaw);
      if (this._obbObb(car, o.x, o.z, HW, HL, ux, uz, _hit)) this._carCar(car, o, _hit);
    }
    // heavy things lying about, and walls that were put up
    for (const o of g.props) {
      if (!o.solid) continue;
      const b = o.body;
      if (b.py + b.boundR < car.y + 0.32 || b.py - b.boundR > car.y + 1.4) continue;
      const rr = HL + b.boundR + 0.2;
      if ((b.px - car.x) ** 2 + (b.pz - car.z) ** 2 > rr * rr) continue;
      const fixed = o.vox && o.vox.anchored;
      if (!fixed && b.mass < 120) continue;              // light things: the physics shoves them aside
      b.dirToWorld(1, 0, 0, _a);
      let ux = _a[0], uz = _a[2];
      const l = Math.hypot(ux, uz);
      if (l < 0.3) { b.dirToWorld(0, 1, 0, _a); ux = _a[0]; uz = _a[2]; }
      const ll = Math.hypot(ux, uz) || 1; ux /= ll; uz /= ll;
      if (!this._obbObb(car, b.px, b.pz, Math.max(0.05, b.hx), Math.max(0.05, b.hz), ux, uz, _hit)) continue;
      if (fixed) this._wall(car, o, _hit);
      else this._heavy(car, o, _hit);
    }
  }

  /** Into something that does not move. */
  _fixed(car, c, what) {
    car.x += c.nx * c.depth; car.z += c.nz * c.depth;
    const j = this._resolve(car, c, null, 0.12);
    // how hard: the speed the two met at, where they met (all of it this car's, against something that does not give)
    if (j > 0) this._impact(car, c.px, c.pz, -c.nx, -c.nz, -this._vn * 1.12, what, null);
  }

  /**
   * The impulse between a car and something else (another car, or nothing:
   * a wall), along the normal at the contact. Returns its size.
   */
  _resolve(a, c, b, e, mb = 0, bvx = 0, bvz = 0, bw = 0) {
    const ma = a.spec.mass, Ia = ma * (4 * HL * HL + 4 * HW * HW) / 12;
    const rax = c.px - a.x, raz = c.pz - a.z;
    let vpx = a.vx + a.w * raz, vpz = a.vz - a.w * rax;
    let ib = 0, Ib = 0, rbx = 0, rbz = 0;
    if (b) {
      ib = 1 / mb; Ib = mb * (4 * HL * HL + 4 * HW * HW) / 12;
      rbx = c.px - b.x; rbz = c.pz - b.z;
      vpx -= bvx + bw * rbz; vpz -= bvz - bw * rbx;
    }
    const vn = vpx * c.nx + vpz * c.nz;
    this._vn = vn;
    if (vn >= 0) return 0;
    const ra = raz * c.nx - rax * c.nz, rb = rbz * c.nx - rbx * c.nz;
    const k = 1 / ma + ra * ra / Ia + (b ? ib + rb * rb / Ib : 0);
    const j = -(1 + e) * vn / k;
    a.vx += j * c.nx / ma; a.vz += j * c.nz / ma; a.w += j * ra / Ia;
    // scraping along whatever it hit
    const tx = -c.nz, tz = c.nx;
    const vt = vpx * tx + vpz * tz;
    const rat = raz * tx - rax * tz, rbt = rbz * tx - rbx * tz;
    const kt = 1 / ma + rat * rat / Ia + (b ? ib + rbt * rbt / Ib : 0);
    const jt = clamp(-vt / kt, -0.45 * j, 0.45 * j);
    a.vx += jt * tx / ma; a.vz += jt * tz / ma; a.w += jt * rat / Ia;
    if (b) { this._jb = j; this._jbt = jt; this._rb = rb; this._rbt = rbt; this._Ib = Ib; }
    return j;
  }

  _carCar(a, b, c) {
    // a car on its rails is knocked off them by anything more than a touch
    const rvx = a.vx - b.vx, rvz = a.vz - b.vz;
    const closing = -(rvx * c.nx + rvz * c.nz);
    if (b.mode === 'rail') { if (closing > 1.0) this.loosen(b); }
    if (b.mode === 'parked' && closing > 0.3) b.mode = 'loose';
    const fixedB = b.mode === 'rail';
    const ma = a.spec.mass, mb = b.wreck ? b.body.mass : b.spec.mass;
    // apart, in proportion
    const share = fixedB ? 1 : mb / (ma + mb);
    a.x += c.nx * c.depth * share; a.z += c.nz * c.depth * share;
    if (!fixedB && !b.wreck) { b.x -= c.nx * c.depth * (1 - share); b.z -= c.nz * c.depth * (1 - share); }
    let j;
    if (fixedB) j = this._resolve(a, c, null, 0.15);
    else {
      j = this._resolve(a, c, b, 0.15, mb, b.vx, b.vz, b.w || 0);
      if (j > 0) {
        if (b.wreck) { b.body.applyImpulse(-c.nx * j, 0, -c.nz * j, c.px, b.body.py, c.pz); b.island.wake?.(); }
        else {
          b.vx -= c.nx * j / mb; b.vz -= c.nz * j / mb; b.w -= j * this._rb / this._Ib;
          const tx = -c.nz, tz = c.nx;
          b.vx -= tx * this._jbt / mb; b.vz -= tz * this._jbt / mb; b.w -= this._jbt * this._rbt / this._Ib;
        }
      }
    }
    if (j > 0) {
      // the closing speed at the point they met, shared out by weight: the lighter car takes more of it
      const s = -this._vn * 1.15, ka = fixedB ? 1 : mb / (ma + mb);
      this._impact(a, c.px, c.pz, -c.nx, -c.nz, s * ka, 'car', b);
      this._impact(b, c.px, c.pz, c.nx, c.nz, s * (1 - ka) + (fixedB ? s * 0.5 : 0), 'car', a);
    }
  }

  /** Into a wall somebody put up: through it, if it is wood and the car is going fast enough. */
  _wall(car, o, c) {
    const v = o.vox, g = this.game;
    const vn = -(car.vx * c.nx + car.vz * c.nz);
    const need = v.mat === 'wood' ? 4.5 : v.mat === 'sheet' ? 11 : 99;
    if (vn > need) {
      // every cube within reach of the bumper goes, flying the way the car was going
      const R = 0.45 + vn * 0.03, gy = car.y + 0.75;
      let gone = 0;
      for (let k = 0; k < v.N; k++) {
        if (!v.cells[k]) continue;
        v.world(k, _a);
        if (_a[1] > gy + 0.9 || _a[1] < car.y + 0.15) continue;
        if (Math.hypot(_a[0] - c.px, _a[2] - c.pz) > R + 0.6) continue;
        if (!this._inside(car, _a[0], _a[2], 0.35)) continue;
        v.remove(k, car.vx * rand(0.5, 0.9), rand(0.5, 2.5), car.vz * rand(0.5, 0.9));
        gone++;
      }
      if (gone) {
        this.stats.smashed += gone;
        const keep = v.mat === 'wood' ? 0.82 : 0.6;
        car.vx *= keep; car.vz *= keep;
        g.audio?.at(v.mat === 'wood' ? 'splinter' : 'clang', c.px, car.y + 0.7, c.pz, 1);
        g.minds?.noise(c.px, car.y + 0.7, c.pz, 100, 'crash', car.seats[0] || null);
        this._impact(car, c.px, c.pz, -c.nx, -c.nz, vn * (1 - keep) * 1.4, 'wall', null);
        return;
      }
    }
    this._fixed(car, c, 'wall');
  }

  /** Into something heavy that is not fixed down: both move. */
  _heavy(car, o, c) {
    const b = o.body, mb = b.mass;
    const share = mb / (car.spec.mass + mb);
    car.x += c.nx * c.depth * share; car.z += c.nz * c.depth * share;
    const vx = b.vx, vz = b.vz;
    const j = this._resolve(car, c, { x: b.px, z: b.pz }, 0.1, mb, vx, vz, b.wy || 0);
    if (j > 0) {
      b.applyImpulse(-c.nx * j, j * 0.08, -c.nz * j, c.px, b.py, c.pz);
      if (b.island && b.island.wake) b.island.wake();
      this._impact(car, c.px, c.pz, -c.nx, -c.nz, -this._vn * mb / (car.spec.mass + mb) * 1.1, 'thing', null);
    }
  }

  /**
   * A car took a knock: `dv` is how much its speed changed (metres a
   * second), (ix, iz) the way the blow went. The metal gives as far as that
   * deserves; the engine takes what it takes; the people in it are thrown
   * against their belts.
   */
  _impact(car, wx, wz, ix, iz, dv, what, other) {
    if (car.wreck || dv < 1.1) return;
    const g = this.game;
    car.toLocal(wx, car.y + 0.6, wz, _a);
    car.dirToLocal(ix, 0, iz, _b);
    const lx = clamp(_a[0], -HW, HW), lz = clamp(_a[2], -HL, HL);
    // the contact is on the skin: a point just inside it
    const depth = clamp((dv - 1.4) * 0.05, 0, 0.8) * (what === 'person' ? 0.35 : 1);
    const radius = 0.32 + Math.min(0.55, dv * 0.035);
    car.dent(lx, clamp(_a[1], 0.35, 1.15), lz, _b[0], 0, _b[2], depth, radius);
    const by = other && other.seats ? other.seats[0] : null;
    car.damage(Math.pow(Math.max(0, dv - 2.5), 1.6), by);
    if (car.hitCool <= 0 || dv > 4) {
      car.hitCool = 0.25;
      const loud = clamp01(dv / 10);
      g.audio?.at(dv > 6 ? 'crash' : 'carhit', wx, car.y + 0.6, wz, 0.5 + loud * 0.6);
      if (dv > 3) g.minds?.noise(wx, car.y + 0.6, wz, 86 + dv * 2, 'crash', car.seats[0] || null);
      if (dv > 4) { this.stats.crashes++; if (g.voxels) for (let k = 0; k < Math.min(10, dv | 0); k++) g.voxels.chip(wx, car.y + 0.6, wz, -ix * rand(1, 3) + car.vx * 0.5, rand(0.5, 2.5), -iz * rand(1, 3) + car.vz * 0.5, PAINT_CHIP, car._chipCol || (car._chipCol = paintRGB(car.paint)), 0); }
    }
    // the people in it: thrown against belts, wheel, dashboard, door
    if (dv > 6) for (const h of car.seats) if (h) this._jolt(car, h, dv, _b[0], _b[2], lx, lz);
    if (car.seats[0] && car.seats[0].isPlayer) g.shake = Math.max(g.shake, clamp(dv / 7, 0.3, 2.2));
    if (dv > 5 && what !== 'person') g.minds?.witness({ kind: 'crash', car, x: wx, y: car.y + 0.8, z: wz, power: dv });
  }

  /** Somebody in a car that has just hit something. */
  _jolt(car, h, dv, ix, iz, lx, lz) {
    if (h.h.god) return;
    // most of a frontal crash is in the head and chest; a side one at the near side; the belt and the bag take the edge off
    const sp = car.seatAt[h.seat];
    const near = Math.abs(ix) > 0.6 && Math.sign(lx) === Math.sign(sp[0]) ? 1.5 : 1;
    const p = (dv - 6) / 6 * near;
    const parts = [P.HEAD, P.CHEST, P.NECK];
    if (Math.abs(iz) > 0.6 && dv > 12) parts.push(chance(0.5) ? P.SHIN_L : P.SHIN_R, chance(0.5) ? P.THIGH_L : P.THIGH_R);
    if (near > 1) parts.push(sp[0] > 0 ? P.UARM_L : P.UARM_R, P.PELVIS);
    for (const part of parts) {
      const b = h.bodies[part];
      const rep = h.hit({ part, type: 'blunt', power: p * (part === P.HEAD ? 0.9 : part === P.NECK ? 0.6 : 1) * rand(0.7, 1.2), point: [b.px, b.py, b.pz], dir: [-ix, 0, -iz], normal: [0, 0, 1], impulse: 0, attacker: null, weapon: 'crash' });
      if (rep && h.mind && rep.pain > 5) h.mind.feel(part, 'blunt', rep, 'a crash');
    }
    if (dv > 9) h.mind?.note('felt', 'crash', 'was in a car crash', 1);
  }

  /** A car met somebody on their feet (called when they are struck). */
  struck(car, h, closing) {
    const g = this.game;
    if (!car || car.wreck) return;
    // a person is a tenth of a car: it loses a little of its speed, and the front takes a dent
    const ma = car.spec.mass, mh = 80;
    const k = mh / (ma + mh) * clamp01(closing / Math.max(0.5, Math.hypot(car.vx, car.vz)));
    car.vx *= 1 - k; car.vz *= 1 - k;
    if (car.mode === 'rail') car.speed *= 1 - k;
    const sp = Math.hypot(car.vx, car.vz) || 1;
    this._impact(car, h.x, h.z, car.vx / sp, car.vz / sp, closing * 0.5, 'person', null);
    // fast enough and they come up over the bonnet: the windscreen stars where their head meets it, and there is blood on it
    if (closing > 8.5 && car.windows[0] && !car.windows[0].broken) {
      car.hitGlass(0, null, 2 + closing * 0.25);
      const lp = [rand(-0.4, 0.4), 1.0, 0.82], ln = [0, 0.6, 0.8];
      const d = g.gore._attach(car.body, carDecal(car, lp, ln, 0.5, 0.5, rand(TAU), 0.02), CRACK_UV, null, -1);
      if (d) d.stain = true;
      const s = g.gore._attach(car.body, carDecal(car, [lp[0] + rand(-0.1, 0.1), lp[1], lp[2]], ln, 0.42, 0.42, rand(TAU), 0.024), pick(SPLAT_UV), null, -1);
      if (s) s.stain = true;
    }
    const d = car.seats[0];
    if (d && h !== d) g.minds?.witness({ kind: 'attack', actor: d, victim: h, weapon: 'car', part: P.PELVIS, x: h.x, y: h.y + 1, z: h.z, rep: { pain: 30, bones: [] } });
    this.stats.runOver++;
  }

  /* ---------------------------- under the wheels -------------------------- */

  _crush(dt) {
    const g = this.game, now = g.time;
    for (const car of this.cars) {
      const sp = Math.abs(car.speed);
      if (car.wreck || sp < 0.5) continue;
      for (const h of g.humans) {
        if (h.removed || h.car || h.state === ST.ANIM) continue;
        if ((h.x - car.x) ** 2 + (h.z - car.z) ** 2 > 16) continue;
        for (let w = 0; w < 4; w++) {
          const wp = car.wheelPos[w];
          car.toWorld(wp[0], 0, wp[2], _a);
          const gy = groundHeight(_a[0], _a[2]);
          for (let i = 0; i < PART_COUNT; i++) {
            if (h.gone[i]) continue;
            const b = h.bodies[i];
            if (b.py - gy > 0.42) continue;
            const ex = b.px - _a[0], ez = b.pz - _a[2];
            const rr = 0.2 + Math.min(b.hx, b.hz);
            if (ex * ex + ez * ez > rr * rr) continue;
            // each wheel goes over it in its turn: front, then back
            const key = (car.id * 100000 + h.id * 32 + i) * 4 + w;
            if (now - (this.crushT.get(key) || -9) < 0.6) continue;
            this.crushT.set(key, now);
            // a quarter of the car on it, and how fast it came
            // a third of a tonne on one tyre: more than any bone is made to take
            const load = car.spec.mass / 4 / 340;
            const power = clamp(load * 1.6 * (1 + sp * 0.06), 1.2, 4.5) * (i === P.HEAD ? 1.5 : i === P.NECK ? 1.2 : 1);
            const rep = h.hit({ part: i, type: 'crush', power, point: [b.px, b.py + b.hy, b.pz], dir: [0, -1, 0], normal: [0, 1, 0], impulse: 0, attacker: car.seats[0] || null, weapon: 'car' });
            b.vy = Math.min(b.vy, -0.5); b.vx += car.vx * 0.25; b.vz += car.vz * 0.25;
            car.bump = Math.max(car.bump || 0, 0.07 + Math.min(0.08, b.hy));
            g.audio?.at(rep && rep.bones && rep.bones.length ? 'crack' : 'thud', b.px, b.py, b.pz, 0.9);
            if (!h.h.god) g.gore.burst(b.px, b.py + 0.05, b.pz, car.vx * 0.1, 0.6, car.vz * 0.1, 10 + power * 6, 2.4, 0.9);
            this.stats.runOver++;
            if (car.seats[0] && car.seats[0].isPlayer) g.shake = Math.max(g.shake, 0.35);
            if (h.mind && rep) h.mind.feel(i, 'blunt', rep, 'a car');
          }
        }
      }
    }
    if (this.crushT.size > 400) for (const [k, t] of this.crushT) if (now - t > 2) this.crushT.delete(k);
  }

  /* ------------------------------ gunfire ------------------------------- */

  /**
   * A round has hit a car (at a point the car's own ray found). Glass breaks
   * or stars, metal is holed, the engine and the tyres are hurt. Returns how
   * much of the round goes on into the car.
   */
  shot(car, hit, shooter, def, power, wx, wy, wz) {
    const g = this.game, lp = hit.lp, ln = hit.ln;
    this.stats.shots++;
    car.panic = Math.max(car.panic || 0, 7);
    if (car.honk <= 0 && car.seats[0] && chance(0.5)) this._honk(car);
    if (hit.glass >= 0) {
      const broke = car.hitGlass(hit.glass, lp, 1);
      if (!broke) { const d = g.gore._attach(car.body, carDecal(car, lp, ln, 0.16, 0.16, rand(TAU), 0.012), CRACK_UV, null, -1); if (d) d.stain = true; }
      else this.stats.windows++;
      g.audio?.at('glass', wx, wy, wz, 0.6);
      return 0.92;
    }
    if (hit.glass === -2) return 1;          // through a window that is already gone
    // metal: a hole, a spark
    const d = g.gore._attach(car.body, carDecal(car, lp, ln, 0.11, 0.11, rand(TAU)), HOLE_UV, null, -1);
    if (d) d.stain = true;
    g.gore.puff('flash', wx, wy, wz, 0.2, 0.06, 1, 0.9, 0.6);
    g.audio?.at('ricochet', wx, wy, wz, 0.7);
    // what is behind the metal there
    const engine = !car.van ? lp[2] > 1.05 : lp[2] > 1.45;
    const tank = lp[2] < -1.25 && lp[1] < 0.6;
    const k = def && def.rifle ? 1.4 : 1;
    if (engine) car.damage(2.6 * power * k, shooter);
    else if (tank) { car.damage(1.1 * power * k, shooter); if (car.hp < 70 && chance(0.06 * k)) car.catchFire(shooter); }
    else car.damage(0.35 * power, shooter);
    // a tyre
    for (let w = 0; w < 4; w++) {
      const wp = car.wheelPos[w];
      if (Math.hypot(lp[0] - wp[0], lp[1] - wp[1], lp[2] - wp[2]) < WHEEL_R + 0.05 && !(car.flat && car.flat[w])) {
        car.flat = car.flat || [0, 0, 0, 0];
        car.flat[w] = 1; car.flats = car.flat.reduce((s, v) => s + v, 0);
        car.wheelBend[w] = Math.max(car.wheelBend[w], 0.02);
        car.pull = clamp(car.pull + (wp[0] > 0 ? 0.03 : -0.03) * (wp[2] > 0 ? 1 : 0.5), -0.12, 0.12);
        g.audio?.at('burst', wx, wy, wz, 0.5);
      }
    }
    if (car.mode === 'rail' && car.hp < 30) this.loosen(car);
    // through the door skin, and on into whatever is inside
    return engine ? 0.25 : clamp(1 - 0.55 / Math.max(0.6, power), 0, 0.85);
  }

  /**
   * A blow from somebody on foot: a fist, a boot, a blade or a bar. Glass
   * breaks under anything hard (a windscreen cracks first); a bar or a boot
   * puts a dent in a panel; an edge only scratches the paint.
   */
  blow(car, hit, by, def, clip, wx, wy, wz, dx, dy, dz) {
    const g = this.game, lp = hit.lp;
    const hard = !!def.blade || clip.limb === 'footR';
    const power = clip.power * (def.blunt ? 1.6 : def.blade ? 1 : clip.limb === 'footR' ? 0.9 : 0.4);
    car.panic = Math.max(car.panic || 0, 4);
    if (car.honk <= 0 && car.seats[0] && chance(0.6)) this._honk(car);
    if (hit.glass >= 0) {
      if (hard) {
        const broke = car.hitGlass(hit.glass, lp, power * 2.5);
        if (broke) this.stats.windows++;
        else { const d = g.gore._attach(car.body, carDecal(car, lp, hit.ln, 0.22, 0.22, rand(TAU), 0.012), CRACK_UV, null, -1); if (d) d.stain = true; }
      }
      g.audio?.at(hard ? 'glass' : 'punch', wx, wy, wz, hard ? 0.7 : 0.5);
    } else if (hit.glass !== -2) {
      if (def.blunt || clip.limb === 'footR' || (!def.blade && clip.power > 1.2)) {
        car.dirToLocal(dx, dy, dz, _b);
        car.dent(lp[0], lp[1], lp[2], _b[0], _b[1], _b[2], 0.012 * power, 0.1 + 0.03 * power);
        g.audio?.at(def.hitSound || 'carhit', wx, wy, wz, 0.55);
      } else {
        // a blade skates off the metal
        g.gore.puff('flash', wx, wy, wz, 0.12, 0.05, 1, 0.9, 0.6);
        g.audio?.at(def.blade ? 'clang' : 'punch', wx, wy, wz, 0.6);
      }
      car.damage(0.25 * power, by);
    }
    g.minds?.noise(wx, wy, wz, 74, 'crash', by);
    if (car.mode === 'rail' && car.hp < 30) this.loosen(car);
  }

  /** And the far side of it, where a round comes out. */
  shotOut(car, hit, wx, wy, wz) {
    const g = this.game;
    if (hit.glass >= 0) { car.hitGlass(hit.glass, hit.lp, 1); g.audio?.at('glass', wx, wy, wz, 0.5); return 0.92; }
    if (hit.glass === -2) return 1;
    const d = g.gore._attach(car.body, carDecal(car, hit.lp, hit.ln, 0.15, 0.15, rand(TAU)), EXIT_UV, null, -1);
    if (d) d.stain = true;
    g.gore.puff('flash', wx, wy, wz, 0.16, 0.05, 1, 0.85, 0.5);
    if (g.weapons) g.weapons.stats.exits++;
    return 0.5;
  }

  /** Burning fuel on the bodywork. */
  heat(car, amount, who = null) {
    if (car.wreck || car.fire >= 0) return;
    car.heat = (car.heat || 0) + amount;
    if (car.heat > 1) car.catchFire(who);
  }

  /* -------------------------------- boom --------------------------------- */

  explode(car) {
    const g = this.game;
    if (car.wreck) return;
    car.wreck = true; car.mode = 'wreck'; car.traffic = car.traffic && false;
    car.fire = 0; car.burnFor = rand(22, 34); car.hp = 0;
    this.stats.explosions++;
    car.toWorld(0, 0.8, car.van ? 1.0 : 0.3, _c);
    const x = _c[0], y = _c[1], z = _c[2];
    // the shell blackens, the glass goes, the bonnet and the roof are blown out
    for (let i = 0; i < car.windows.length; i++) if (car.windows[i]) car.breakGlass(i);
    for (const k in car.lamps) for (const idx of car.lamps[k]) { car.lampsBroken[idx] = true; car._lamp(idx, 0x1a1a1a); }
    car.dent(0, 0.85, car.van ? 1.7 : 1.5, 0, 1, 0.2, 0.32, 0.9);
    car.dent(0, 1.3, -0.25, 0, 1, 0, 0.14, 0.9);
    for (let k = 0; k < 4; k++) car.dent(rand(-0.9, 0.9), rand(0.4, 1.1), rand(-2, 2), rand(-1, 1), rand(-0.2, 0.5), rand(-1, 1), rand(0.05, 0.16), rand(0.4, 0.8));
    this._char(car);
    // everyone still in it is thrown out of it, burning
    for (const h of car.seats.slice()) {
      if (!h) continue;
      const sp = car.seatAt[h.seat];
      car.toWorld(sp[0], sp[1] + 0.2, sp[2], _a);
      car.seats[h.seat] = null;
      h.leaveCar(_a[0], _a[2], car.yaw, car, true);
      h.toRagdoll();
      for (const b of h.bodies) { b.vx += (b.px - x) * 3 + rand(-1, 1); b.vy += rand(3, 6); b.vz += (b.pz - z) * 3 + rand(-1, 1); }
      if (h.isPlayer) g.ui?.drivingChanged?.(false);
    }
    // the wreck: a free body now, as tall as the whole car, thrown up by its own blast
    const b = car.body;
    car.wreckCy = car.van ? 0.82 : 0.76;
    b.setBox(BODY.hx, car.wreckCy, BODY.hz, car.spec.mass * 0.9, true);
    car.toWorld(0, car.wreckCy, 0, _a);
    b.teleport(_a[0], _a[1], _a[2]);
    b.setKinematic(false);
    car.island.mover = false;
    b.vx = car.vx * 0.6; b.vz = car.vz * 0.6; b.vy = rand(3.5, 5.5);
    b.wx = rand(-1.5, 1.5); b.wy = rand(-0.8, 0.8); b.wz = rand(-1.5, 1.5);
    car.island.wake?.();
    car.vx = car.vz = car.w = 0;
    this.blast(x, y, z, 1, car.lastBy, car);
    // a ring of burning fuel on the ground, and the scorch under it
    if (g.fire) for (let k = 0; k < 6; k++) { const a = rand(TAU), r = rand(0.5, 3); g.fire.patch(x + Math.cos(a) * r, groundHeight(x, z) + 0.02, z + Math.sin(a) * r, rand(0.3, 0.6), rand(6, 14), car.lastBy); }
    g.gore._groundDecal(SCORCH_UV, x, groundHeight(x, z) + 0.014, z, 7.5, 7.5, rand(TAU), 0.95);
    // pieces of it
    for (let k = 0; k < 8; k++) this._debris(car, x, y, z);
    const d = car.lastBy;
    if (d && d.isPlayer) g.police?.raise(2, car.unit || car.kind === 'police' ? 'you blew up a police car' : 'you blew up a car', { x, z }, { kind: car.unit || car.kind === 'police' ? 'copCar' : 'car', key: 'car' + car.id });
  }

  /** Paint burnt off: the shell goes black and brown, the seats to ash. */
  _char(car) {
    const col = car.shellMesh.geometry.attributes.color.array;
    for (let i = 0; i < col.length; i += 3) {
      const n = Math.sin(i * 12.9898) * 43758.5453, k = n - Math.floor(n);
      const r = 0.035 + k * 0.05;
      col[i] = r * 1.25; col[i + 1] = r * 1.0; col[i + 2] = r * 0.85;
    }
    car.shellMesh.geometry.attributes.color.needsUpdate = true;
    const ic = car.innerMesh.geometry.attributes.color.array;
    for (let i = 0; i < ic.length; i++) ic[i] *= 0.35;
    car.innerMesh.geometry.attributes.color.needsUpdate = true;
    const set = this.wheelSet;
    for (const [t, h] of car.wheelIdx) { set.tyres.colorHex(t, 0x0b0b0c); set.hubs.colorHex(h, 0x3a3532); }
  }

  /**
   * A blast at a point: 1 is a car's fuel tank. People near it are thrown,
   * burnt, struck by pieces, and the nearest of them torn apart; things are
   * thrown; other cars take it too, and may go up in turn.
   */
  blast(x, y, z, power = 1, by = null, source = null) {
    const g = this.game, R = 9 * power;
    g.audio?.at('explosion', x, y, z, 1.2);
    g.minds?.noise(x, y, z, 140, 'explosion', by);
    g.minds?.witness({ kind: 'explosion', x, y, z, by });
    this.scare(x, z, 70);
    const cam = Math.hypot(g.camX - x, g.camZ - z);
    g.shake = Math.max(g.shake, clamp(2.6 - cam / 14, 0.2, 2.6));
    this.booms.push({ x, y: y + 1, z, t: 0 });
    // fire and smoke
    if (g.fire) for (let k = 0; k < 70; k++) {
      const a = rand(TAU), u = rand(0.2, 1), sp = rand(2, 7) * power;
      g.fire._add(1, x + Math.cos(a) * u, y + rand(0, 0.8), z + Math.sin(a) * u, Math.cos(a) * sp, rand(2, 7) * power, Math.sin(a) * sp, rand(0.5, 1.1), rand(0.5, 1.0) * power, rand(1.8, 2.6), by);
    }
    for (let k = 0; k < 16; k++) g.gore.puff('smoke', x + rand(-1.5, 1.5), y + rand(0.5, 3), z + rand(-1.5, 1.5), rand(1.6, 3.2) * power, rand(2.5, 4.5), 0.12, 0.11, 0.1);
    g.air?.blast(x, y, z, power, by);
    for (let k = 0; k < 5; k++) g.gore.puff('flash', x + rand(-1, 1), y + rand(0, 1.5), z + rand(-1, 1), rand(2, 3.4) * power, rand(0.12, 0.22), 1, 0.75, 0.4);
    // people
    for (const h of g.humans) {
      if (h.removed) continue;
      const c = h.bodies[P.CHEST];
      const dx = c.px - x, dy = c.py - y, dz = c.pz - z, d = Math.hypot(dx, dy, dz);
      if (d > R) continue;
      const f = (1 - d / R) ** 2;
      if (h.car && h.car !== source) {
        // the car round them takes most of it
        if (f > 0.5) h.car && this.traffic_noop;
        continue;
      }
      const ux = dx / (d || 1), uy = dy / (d || 1), uz = dz / (d || 1);
      if (!h.h.god) {
        // thrown
        if (h.state !== ST.RAGDOLL && f > 0.04) h.toRagdoll();
        for (const b of h.bodies) { b.vx += ux * f * 14 + rand(-1, 1) * f; b.vy += (0.5 + Math.max(0, uy)) * f * 9; b.vz += uz * f * 14 + rand(-1, 1) * f; b.wx += rand(-6, 6) * f; b.wz += rand(-6, 6) * f; }
        // the blast itself, on the side facing it
        const n = f > 0.5 ? 4 : f > 0.2 ? 3 : 2;
        for (let k = 0; k < n; k++) {
          const part = pick([P.CHEST, P.HEAD, P.ABDOMEN, P.PELVIS, P.UARM_L, P.UARM_R, P.THIGH_L, P.THIGH_R, P.SHIN_L, P.SHIN_R, P.FARM_L, P.FARM_R]);
          if (h.gone[part]) continue;
          const b = h.bodies[part];
          h.hit({ part, type: 'blunt', power: f * 4.2 * rand(0.7, 1.2), point: [b.px - ux * 0.1, b.py - uy * 0.1, b.pz - uz * 0.1], dir: [ux, uy, uz], impulse: 0, attacker: by, weapon: 'explosion' });
        }
        // pieces of the car, at the speed of a bullet
        const frags = f > 0.15 ? 1 + ((f * 4) | 0) : chance(f * 4) ? 1 : 0;
        for (let k = 0; k < frags; k++) {
          const part = (Math.random() * PART_COUNT) | 0;
          if (h.gone[part]) continue;
          const b = h.bodies[part];
          h.hit({ part, type: chance(0.5) ? 'bullet' : 'cut', power: rand(0.6, 1.4), point: [b.px - ux * b.hx, b.py, b.pz - uz * b.hz], dir: [ux, uy, uz], impulse: 4, through: 0.12, hp: 20, attacker: by, weapon: 'shrapnel' });
        }
        // close enough to be torn apart
        if (f > 0.55 && !h.h.god) {
          const limbs = [P.FARM_L, P.FARM_R, P.SHIN_L, P.SHIN_R, P.UARM_L, P.UARM_R, P.THIGH_L, P.THIGH_R].filter((p) => h.attached[p] && !h.gone[p]);
          const n = f > 0.8 ? 2 : 1;
          for (let k = 0; k < n && limbs.length; k++) {
            const pp = limbs.splice((Math.random() * limbs.length) | 0, 1)[0];
            if (chance(0.55 + f * 0.4)) h.sever(pp, [ux * 9 * f, 5 * f, uz * 9 * f]);
          }
          if (f > 0.85 && chance(0.4)) h.burst(chance(0.5) ? P.HEAD : P.ABDOMEN, [ux * 6, 4, uz * 6]);
        }
        // and burnt
        if (g.fire && f > 0.18) for (let k = 0; k < 3; k++) g.fire.ignite(h, (Math.random() * PART_COUNT) | 0, f * 0.8, by);
        if (h.h && h.h.burn) h.h.burn && (() => {})();
      }
      h.mind?.note('felt', 'blast', 'was caught by an explosion', 1);
      if (h.isPlayer) g.shake = Math.max(g.shake, 3);
    }
    // things
    for (const o of g.props) {
      const b = o.body;
      const dx = b.px - x, dy = b.py - y, dz = b.pz - z, d = Math.hypot(dx, dy, dz);
      if (d > R) continue;
      const f = (1 - d / R) ** 2, k = f * Math.min(b.mass, 400) * 14 / (d || 1);
      if (o.vox && f > 0.3) {
        const v = o.vox;
        for (let c = 0; c < v.N; c++) {
          if (!v.cells[c]) continue;
          v.world(c, _a);
          const e = Math.hypot(_a[0] - x, _a[1] - y, _a[2] - z);
          if (e < 1.6 * power * (v.mat === 'wood' ? 1.4 : 0.7)) v.remove(c, (_a[0] - x) * 4, 3, (_a[2] - z) * 4);
        }
      }
      if (b.kinematic) continue;
      b.applyImpulse(dx * k, (dy + 1.5) * k, dz * k, b.px, b.py, b.pz);
      if (b.island && b.island.wake) b.island.wake();
      if (o.kind === 'crate' && g.fire && f > 0.3) g.fire.igniteCrate(o, f * 2);
    }
    for (const it of g.weapons ? g.weapons.items : []) {
      const b = it.body;
      if (!b) continue;
      const dx = b.px - x, dz = b.pz - z, d = Math.hypot(dx, dz);
      if (d > R) continue;
      const f = (1 - d / R) ** 2;
      b.vx += dx / (d || 1) * f * 10; b.vy += f * 7; b.vz += dz / (d || 1) * f * 10;
      if (b.island && b.island.wake) b.island.wake();
    }
    // other cars
    for (const o of this.cars) {
      if (o === source) continue;
      const dx = o.x - x, dz = o.z - z, d = Math.hypot(dx, dz);
      if (d > R + 2) continue;
      const f = (1 - Math.max(0, d - 1.5) / R) ** 2;
      o.toLocal(x, y, z, _a);
      const lx = clamp(_a[0], -HW, HW), lz = clamp(_a[2], -HL, HL);
      const ux = -_a[0], uz = -_a[2], ul = Math.hypot(ux, uz) || 1;
      o.dent(lx, 0.8, lz, -ux / ul * 0 + (lx - _a[0]) / (Math.hypot(lx - _a[0], lz - _a[2]) || 1), 0, (lz - _a[2]) / (Math.hypot(lx - _a[0], lz - _a[2]) || 1), f * 0.35, 0.9);
      for (let i = 0; i < o.windows.length; i++) if (o.windows[i] && chance(f * 1.4)) o.breakGlass(i);
      o.damage(f * 95, by);
      if (o.wreck) { o.body.applyImpulse(dx / (d || 1) * f * 9000, f * 6000, dz / (d || 1) * f * 9000, o.body.px, o.body.py, o.body.pz); o.island.wake?.(); }
      else if (o.mode !== 'rail' || f > 0.2) { if (o.mode === 'rail') this.loosen(o); if (o.mode === 'parked') o.mode = 'loose'; o.vx += dx / (d || 1) * f * 6; o.vz += dz / (d || 1) * f * 6; }
      // the people in it
      for (const h of o.seats) if (h && f > 0.3) { const b = h.bodies[P.HEAD]; h.hit({ part: P.HEAD, type: 'blunt', power: f * 1.6, point: [b.px, b.py, b.pz], dir: [dx / (d || 1), 0, dz / (d || 1)], impulse: 0, attacker: by, weapon: 'explosion' }); }
    }
  }

  _debris(car, x, y, z) {
    const g = this.game;
    while (this.debris.length >= DEBRIS_MAX) this._dropDebris(this.debris.shift());
    const s = [rand(0.25, 0.7), rand(0.03, 0.08), rand(0.25, 0.8)];
    const b = new Body({ hx: s[0] / 2, hy: s[1] / 2, hz: s[2] / 2, mass: rand(4, 14), x: x + rand(-0.6, 0.6), y: y + rand(0.2, 0.8), z: z + rand(-1.2, 1.2), shape: 1, kind: 'debris', friction: 0.7, angDamp: 0.6 });
    const a = rand(TAU), sp = rand(4, 11);
    b.vx = Math.cos(a) * sp; b.vz = Math.sin(a) * sp; b.vy = rand(4, 11);
    b.wx = rand(-12, 12); b.wy = rand(-12, 12); b.wz = rand(-12, 12);
    const isl = new Island(null); isl.add(b); g.world.addIsland(isl);
    const idx = g.boxes.alloc();
    g.boxes.colorHex(idx, chance(0.5) ? 0x1c1a18 : car.paint);
    this.debris.push({ body: b, island: isl, idx, s, born: g.time, fire: rand(4, 10) });
  }
  _dropDebris(d) {
    this.game.world.removeIsland(d.island);
    this.game.boxes.release(d.idx);
  }

  /* -------------------------------- frame -------------------------------- */

  update(dt) {
    const g = this.game, J = g.city.junctions;
    for (const car of this.cars.slice()) {
      car.hitCool = Math.max(0, car.hitCool - dt);
      car.honk = Math.max(0, (car.honk || 0) - dt);
      car.panic = Math.max(0, (car.panic || 0) - dt);
      if (car.heat) car.heat = Math.max(0, car.heat - dt * 0.25);
      if (car.wreck) { car.follow(); continue; }
      if (car.mode === 'rail') {
        if (!this._fit(car.seats[0]) || car.seats[0].isPlayer) this.loosen(car);
        else { this._rail(car, dt); continue; }
      }
      this._drive(car, dt);
    }
    // a car on fire burns, then goes up
    for (const car of this.cars) {
      if (car.fire < 0) continue;
      car.fire += dt;
      if (!car.wreck && car.fire >= car.boomT) this.explode(car);
    }
    this._crush(dt);
    this._effects(dt);
    for (const j of J) if (j.holder && !this.cars.includes(j.holder)) j.holder = null;
    this._nearCar();
    // the traffic is kept topped up, out of sight
    this.topT = (this.topT || 0) + dt;
    if (this.topT > 2) {
      this.topT = 0;
      const live = this.cars.filter((c) => c.traffic && !c.wreck && c.mode === 'rail').length;
      if (live < this.want) this._add();
      // and the wrecks and empty cars that have piled up are taken away, the furthest first
      const left = this.cars.filter((c) => c.traffic === false && !c.home && !c.unit && !c.seats.some((h) => h && h.isPlayer));
      if (left.length > 6) {
        const p = g.player;
        let worst = null, ws = 40;
        for (const c of left) { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d > ws) { ws = d; worst = c; } }
        if (worst) this.remove(worst);
      }
    }
  }

  /** Smoke, fire, the flash of a blast, pieces of car. */
  _effects(dt) {
    const g = this.game;
    const night = g.daylight && g.daylight.mode !== 'day';
    for (const car of this.cars) {
      car.draw(dt);
      const lv = car.smoke;
      // after dark the headlights light the road ahead (yours first, then whichever car is nearest)
      if (night && car.drivable && car.seats[0] && !car.lampsBroken[car.lamps.head[0]]) {
        const mine = car.seats[0].isPlayer;
        car.toWorld(0, 0.66, 2.3, _a); car.dirToWorld(0, -0.14, 1, _b);
        g.lights?.ask('spot', _a[0], _a[1], _a[2], 0xfff1d6, mine ? 70 : 34, 40, _b[0], _b[1], _b[2], mine ? 2 : 0);
      }
      // a police car with its lights going: blue and red, and the siren
      if (car.siren && car.drivable) {
        if (!car.quiet) g.audio?.loop('siren' + car.id, 'siren', car.x, car.y + 1.5, car.z, 0.9);
        if (night) { car.toWorld(0, 2.4, -0.2, _a); g.lights?.ask('point', _a[0], _a[1], _a[2], Math.floor(g.time * 6) % 2 ? 0xff3030 : 0x3a7cff, 7, 12, 0, -1, 0, 0); }
      }
      if (car.fire >= 0) {
        // the engine bay alight, then all of it
        const all = car.wreck, life = all ? 1 - clamp01((car.fire - car.burnFor * 0.6) / (car.burnFor * 0.4)) : 1;
        if (all && car.fire > car.burnFor) { if (chance(dt * 3)) { car.toWorld(rand(-0.5, 0.5), 1.0, rand(-1.5, 1.5), _a); g.gore.puff('smoke', _a[0], _a[1], _a[2], rand(0.8, 1.4), rand(2, 3), 0.18, 0.17, 0.16); } continue; }
        const n = all ? 4 : 2;
        for (let k = 0; k < n; k++) {
          if (!chance(life)) continue;
          car.toWorld(rand(-0.7, 0.7), rand(0.75, 1.0), all ? rand(-2, 2) : rand(1.1, 2.0) * (car.van ? 1.05 : 1), _a);
          g.fire?.flameAt(_a[0], _a[1], _a[2], rand(0.35, 0.6) * (all ? 1.3 : 1));
        }
        if (chance(dt * 9)) { car.toWorld(rand(-0.4, 0.4), 1.2, all ? rand(-1.5, 1.5) : 1.5, _a); g.gore.puff('smoke', _a[0], _a[1], _a[2], rand(0.9, 1.6), rand(2.2, 3.5), 0.12, 0.115, 0.11); }
        car.toWorld(0, 1.2, all ? 0 : 1.5, _a);
        g.lights?.ask('point', _a[0], _a[1] + 0.6, _a[2], 0xff8a3a, 16 * life + rand(0, 4), 11);
        g.audio?.loop('carfire' + car.id, 'fire', _a[0], _a[1], _a[2], 0.9);
        // whoever is still sitting in it burns with it
        if (g.fire) for (const h of car.seats) if (h && chance(dt * 3)) g.fire.ignite(h, (Math.random() * PART_COUNT) | 0, 0.25, car.lastBy);
      } else if (lv > 0) {
        car.smokeT += dt * (lv === 1 ? 5 : lv === 2 ? 8 : 12);
        while (car.smokeT >= 1) {
          car.smokeT -= 1;
          car.toWorld(rand(-0.35, 0.35), 0.82, car.van ? rand(1.5, 2.0) : rand(1.3, 2.0), _a);
          const c = lv === 1 ? 0.8 : lv === 2 ? 0.5 : 0.2;
          g.gore.puff('smoke', _a[0], _a[1], _a[2], lv === 1 ? 0.45 : lv === 2 ? 0.65 : 0.9, lv === 1 ? 1.3 : 2.0, c, c, c * 0.98);
        }
      }
    }
    // the flash of a blast lights the street for a moment
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i];
      b.t += dt;
      if (b.t > 0.7) { this.booms.splice(i, 1); continue; }
      g.lights?.ask('point', b.x, b.y + 1, b.z, 0xffb060, 140 * (1 - b.t / 0.7), 32, 0, -1, 0, 2);
    }
    // pieces: drawn, burning a little, and gone in time
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i], b = d.body;
      if (g.time - d.born > 60) { this._dropDebris(d); this.debris.splice(i, 1); continue; }
      g.boxes.set(d.idx, b.px, b.py, b.pz, b.qx, b.qy, b.qz, b.qw, d.s[0], d.s[1], d.s[2]);
      if (d.fire > 0) { d.fire -= dt; if (chance(dt * 6)) g.fire?.flameAt(b.px, b.py + 0.05, b.pz, 0.18); }
    }
    this.wheelSet.commit();
  }

  /** The car the player is standing beside, if they could get into it. */
  _nearCar() {
    const g = this.game, p = g.player;
    let best = null, bd = 1.7;
    if (p && !p.car && p.state === ST.ANIM && !p.cuffed) {
      for (const c of this.cars) {
        if (!c.drivable) continue;
        if ((c.x - p.x) ** 2 + (c.z - p.z) ** 2 > 16) continue;
        // either front door: from the passenger side you climb across
        const sp = c.seatAt[0];
        for (const side of [1, -1]) {
          c.toWorld(side * (sp[0] + 0.85), 0, sp[2] + 0.1, _a);
          const d = Math.hypot(_a[0] - p.x, _a[2] - p.z);
          if (d < bd) { bd = d; best = c; }
        }
      }
    }
    if (best !== this.near) { this.near = best; g.ui?.nearChanged(); }
  }
}

const CORNERS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const PAINT_CHIP = [0.03, 0.006, 0.03];
function paintRGB(hex) { return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]; }
