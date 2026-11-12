/* =============================================================================
   Traffic.

   Cars keep to the right hand lane of each street, slow for the junction
   ahead, take it one at a time, and pick a new street at random when they
   get there. They brake for anyone standing in the road and lean on the horn
   if that person stays there. Gunfire nearby makes a driver put their foot
   down and stop caring who is in the way.

   A car is a kinematic box: it goes where its driver takes it and pushes
   whatever it meets.
   ========================================================================== */
import { Body, Island } from '../physics/world.js';
import { ROAD_W, LANE } from './city.js';
import { buildCar, CAR, CAR_PAINT } from './models.js';
import { ST } from '../human/human.js';
import { clamp, clamp01, lerp, rand, pick } from '../core/util.js';

const CRUISE = 8.2, TURN_SPEED = 4.2, ACCEL = 3.2, BRAKE = 8.5;
const HALF = ROAD_W / 2;

export class Traffic {
  constructor(game, count) {
    this.game = game;
    this.cars = [];
    this.setCount(count);
  }

  setCount(n) {
    while (this.cars.length > n) this._remove(this.cars[this.cars.length - 1]);
    let guard = 0;
    while (this.cars.length < n && guard++ < 200) this._add();
  }

  _add() {
    const g = this.game, J = g.city.junctions;
    const a = J[(Math.random() * J.length) | 0];
    const b = J[pick(a.out)];
    const len = Math.hypot(b.x - a.x, b.z - a.z) - ROAD_W;
    const s = rand(1, len - 6);
    // not on top of another car, and not next to the player
    for (const c of this.cars) if (c.from === a.id && c.to === b.id && Math.abs(c.s - s) < 8) return;
    const kind = Math.random() < 0.18 ? 'van' : Math.random() < 0.15 ? 'taxi' : 'sedan';
    const paint = kind === 'taxi' ? 0xe0b021 : pick(CAR_PAINT);
    const mesh = buildCar(paint, kind);
    mesh.traverse((o) => { if (o.isMesh) o.castShadow = g.shadows; });
    g.scene.add(mesh);
    const body = new Body({ hx: CAR.halfW, hy: CAR.halfH, hz: CAR.halfL, mass: 1300, y: CAR.centreY, shape: 1, kind: 'car', friction: 0.6 });
    body.setKinematic(true);
    const island = new Island(null); island.add(body); island.mover = true;
    g.world.addIsland(island);
    const car = { mesh, body, island, kind, from: a.id, to: b.id, next: -1, s, u: -1, turn: null, speed: rand(3, CRUISE), x: 0, z: 0, yaw: 0, wait: 0, honk: 0, panic: 0, blocked: 0, cruise: CRUISE * rand(0.85, 1.12), id: this.cars.length + 1, hits: 0 };
    body.owner = car;
    this._place(car);
    const p = g.player;
    if (Math.hypot(car.x - p.x, car.z - p.z) < 18) { g.scene.remove(mesh); g.world.removeIsland(island); return; }
    body.setPose(car.x, CAR.centreY, car.z, 0, Math.sin(car.yaw / 2), 0, Math.cos(car.yaw / 2), 0);
    this.cars.push(car);
  }

  _remove(car) {
    const g = this.game;
    g.scene.remove(car.mesh);
    car.mesh.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    g.world.removeIsland(car.island);
    g.gore.clearBody(car.body);
    for (const j of g.city.junctions) if (j.holder === car) j.holder = null;
    this.cars.splice(this.cars.indexOf(car), 1);
  }

  /** Works out where a car is from where it is along its lane or its turn. */
  _place(car) {
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
    // the corner is where the lane coming in meets the lane going out
    const cx = straight ? (x0 + x1) / 2 : b.x - dz * LANE - ez * LANE, cz = straight ? (z0 + z1) / 2 : b.z + dx * LANE + ex * LANE;
    const len = straight ? ROAD_W : (Math.hypot(cx - x0, cz - z0) + Math.hypot(x1 - cx, z1 - cz)) * 0.82;
    car.turn = { x0, z0, x1, z1, cx, cz, len, straight };
    car.u = 0;
  }

  shotAt(car, shooter) {
    car.panic = Math.max(car.panic, 7);
    if (car.honk <= 0) this._honk(car);
  }

  _honk(car) {
    const g = this.game;
    car.honk = rand(1.6, 2.6);
    g.audio?.at('horn', car.x, 1, car.z, 1);
    g.minds?.noise(car.x, 1, car.z, 106, 'horn', null);
  }

  /** Something loud happened: drivers close enough to hear it lose their nerve. */
  scare(x, z, radius) {
    for (const c of this.cars) if (Math.hypot(c.x - x, c.z - z) < radius) c.panic = Math.max(c.panic, rand(4, 8));
  }

  update(dt) {
    const g = this.game, J = g.city.junctions;
    for (const car of this.cars) {
      car.honk = Math.max(0, car.honk - dt); car.panic = Math.max(0, car.panic - dt);
      const a = J[car.from], b = J[car.to];
      const L = Math.hypot(b.x - a.x, b.z - a.z) - ROAD_W;
      const panic = car.panic > 0;
      let limit = car.cruise * (panic ? 1.55 : 1);
      let stopIn = Infinity;                 // metres until we must be stationary

      if (car.u < 0) {
        if (car.next < 0 && car.s > L - 14) {
          const opts = b.out.filter((id) => id !== car.from);
          car.next = pick(opts.length ? opts : b.out);
        }
        // ease off for the junction, and wait at the line if someone is in it
        const toLine = L - car.s;
        if (toLine < 12) limit = Math.min(limit, lerp(TURN_SPEED, limit, clamp01((toLine - 2) / 10)));
        let clearAhead = b.holder === null || b.holder === car;
        if (clearAhead && car.next >= 0) {
          // and only if there is room on the far side
          for (const o of this.cars) if (o !== car && o.from === car.to && o.to === car.next && o.u < 0 && o.s < 6.5) clearAhead = false;
        }
        if (!clearAhead) stopIn = Math.min(stopIn, toLine - 0.4);
        // the car in front
        for (const o of this.cars) {
          if (o === car) continue;
          let gap = Infinity;
          if (o.from === car.from && o.to === car.to && o.u < 0 && o.s > car.s) gap = o.s - car.s - 5.4;
          else if (o.from === car.from && o.to === car.to && o.u >= 0) gap = toLine - 0.4;
          if (gap < stopIn) stopIn = gap;
        }
      } else if (!car.turn.straight) limit = Math.min(limit, TURN_SPEED * (panic ? 1.5 : 1));

      // people and things in the way
      const look = car.speed * car.speed / (2 * BRAKE) + 4.5;
      let person = false, thing = false;
      if (!panic || car.speed < 2) {
        for (const h of g.humans) {
          if (h.removed) continue;
          const ex = h.x - car.x, ez = h.z - car.z;
          const along = ex * car.dx + ez * car.dz, side = ex * -car.dz + ez * car.dx;
          if (along < 1.2 || along > look + 2 || Math.abs(side) > 1.35) continue;
          // someone lying in the road is driven round if possible and over if not
          if (h.state === ST.RAGDOLL && (car.blocked > (h.h.alive ? 7 : 3))) continue;
          person = true;
          stopIn = Math.min(stopIn, along - CAR.halfL - 1.1);
        }
      }
      for (const o of g.props) {
        if (o.kind !== 'crate') continue;
        const ex = o.body.px - car.x, ez = o.body.pz - car.z;
        const along = ex * car.dx + ez * car.dz, side = ex * -car.dz + ez * car.dx;
        if (along < 1.2 || along > look + 1 || Math.abs(side) > 1.4 || o.body.py > 1.6) continue;
        if (car.blocked > 3.5) continue;
        thing = true;
        stopIn = Math.min(stopIn, along - CAR.halfL - 0.9);
      }

      // speed
      let target = limit;
      if (stopIn < Infinity) target = Math.min(target, stopIn <= 0.15 ? 0 : Math.sqrt(2 * BRAKE * 0.8 * Math.max(0, stopIn - 0.15)));
      if ((car.blocked > 3 && !person) || (person && car.blocked > 7)) target = Math.max(target, 1.6);     // push through
      const before = car.speed;
      if (target < car.speed) car.speed = Math.max(target, car.speed - BRAKE * dt);
      else car.speed = Math.min(target, car.speed + ACCEL * (panic ? 1.8 : 1) * dt);
      if (before - car.speed > BRAKE * dt * 0.9 && before > 5 && !car.screech) { car.screech = true; g.audio?.at('screech', car.x, 0.5, car.z, clamp01(before / 9)); g.minds?.noise(car.x, 0.5, car.z, 94, 'screech', null); }
      if (car.speed > 3) car.screech = false;
      if (car.speed < 0.25 && (person || thing)) {
        car.blocked += dt;
        if (person && car.blocked > 1.1 && car.honk <= 0) this._honk(car);
      } else if (car.speed > 1) car.blocked = Math.max(0, car.blocked - dt * 2);

      // move
      const step = car.speed * dt;
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
      this._place(car);
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.yaw;
      car.body.setPose(car.x, CAR.centreY, car.z, 0, Math.sin(car.yaw / 2), 0, Math.cos(car.yaw / 2), dt);
    }
    // a junction whose holder has somehow gone is free again
    for (const j of J) if (j.holder && !this.cars.includes(j.holder)) j.holder = null;
  }

  /** How soon the nearest car reaches a point on a street, in seconds; Infinity if none is coming. */
  eta(x, z) {
    let best = Infinity;
    for (const c of this.cars) {
      const ex = x - c.x, ez = z - c.z;
      const along = ex * c.dx + ez * c.dz, side = Math.abs(ex * -c.dz + ez * c.dx);
      if (along < -1 || side > 2.6 || along > 30) continue;
      const t = along / Math.max(1.5, c.speed);
      if (c.speed > 0.8 && t < best) best = t;
    }
    return best;
  }
}
