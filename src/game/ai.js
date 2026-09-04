/* =============================================================================
   Citizen behaviour: A* pathfinding around map parts and spawned objects, plus
   the decision to stand, run or swing back. Jumping and crouching only happen
   when there is an actual reason for them.
   ========================================================================== */
import { Vector3 } from 'three';
import { clamp, clamp01, lerp, dampAngle, angleDelta, makeRng } from '../core/util.js';
import { STATE } from './character.js';

const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3();

/* -------------------------------------------------------------------------- */
/*                                  nav grid                                  */
/* -------------------------------------------------------------------------- */

export class NavGrid {
  constructor(half = 40, cell = 0.7) {
    this.half = half;
    this.cell = cell;
    this.w = Math.ceil((half * 2) / cell);
    this.h = this.w;
    const n = this.w * this.h;
    this.blocked = new Uint8Array(n);
    this.cost = new Float32Array(n);      // soft avoidance around obstacles
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.from = new Int32Array(n);
    this.stamp = new Int32Array(n);
    this.state = new Uint8Array(n);       // 1 open, 2 closed
    this.version = 1;
    this.heap = new Int32Array(n + 1);
    this.heapSize = 0;
    this.dirty = true;
    this.rebuildTimer = 0;
  }

  idx(cx, cz) { return cz * this.w + cx; }
  cellX(x) { return Math.floor((x + this.half) / this.cell); }
  cellZ(z) { return Math.floor((z + this.half) / this.cell); }
  worldX(cx) { return cx * this.cell - this.half + this.cell / 2; }
  worldZ(cz) { return cz * this.cell - this.half + this.cell / 2; }
  inside(cx, cz) { return cx >= 0 && cz >= 0 && cx < this.w && cz < this.h; }

  /** Marks every cell covered by an obstacle too tall to simply walk over. */
  rebuild(world, { stepHeight = 0.42, radius = 0.34, groundY = 0 } = {}) {
    this.blocked.fill(0);
    this.cost.fill(0);
    const margin = 2;   // keep citizens off the very lip of the plate
    const edge = Math.ceil(margin / this.cell);
    for (let cz = 0; cz < this.h; cz++) {
      for (let cx = 0; cx < this.w; cx++) {
        if (cx < edge || cz < edge || cx >= this.w - edge || cz >= this.h - edge) {
          this.blocked[this.idx(cx, cz)] = 1;
        }
      }
    }

    const mark = (b) => {
      if (b.aabbMax.y <= groundY + stepHeight) return;      // step straight over it
      const pad = radius;
      const x0 = this.cellX(b.aabbMin.x - pad), x1 = this.cellX(b.aabbMax.x + pad);
      const z0 = this.cellZ(b.aabbMin.z - pad), z1 = this.cellZ(b.aabbMax.z + pad);
      for (let cz = z0; cz <= z1; cz++) {
        for (let cx = x0; cx <= x1; cx++) {
          if (!this.inside(cx, cz)) continue;
          const i = this.idx(cx, cz);
          this.blocked[i] = 1;
          // a ring of extra cost so paths do not scrape past crates
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = cx + dx, nz = cz + dz;
              if (!this.inside(nx, nz)) continue;
              const j = this.idx(nx, nz);
              if (!this.blocked[j]) this.cost[j] = Math.max(this.cost[j], 1.6);
            }
          }
        }
      }
    };
    for (let i = 0; i < world.bodies.length; i++) mark(world.bodies[i]);
    for (let i = 0; i < world.staticBodies.length; i++) mark(world.staticBodies[i]);
    this.dirty = false;
  }

  isBlockedWorld(x, z) {
    const cx = this.cellX(x), cz = this.cellZ(z);
    if (!this.inside(cx, cz)) return true;
    return this.blocked[this.idx(cx, cz)] === 1;
  }

  /** Nearest walkable cell to a world point, searched outwards. */
  nearestFree(x, z) {
    let cx = clamp(this.cellX(x), 0, this.w - 1);
    let cz = clamp(this.cellZ(z), 0, this.h - 1);
    if (!this.blocked[this.idx(cx, cz)]) return [cx, cz];
    for (let r = 1; r < 14; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const nx = cx + dx, nz = cz + dz;
          if (!this.inside(nx, nz)) continue;
          if (!this.blocked[this.idx(nx, nz)]) return [nx, nz];
        }
      }
    }
    return null;
  }

  /* ------------------------------ the search ----------------------------- */

  findPath(sx, sz, tx, tz, out, maxNodes = 2600) {
    out.length = 0;
    const start = this.nearestFree(sx, sz);
    const goal = this.nearestFree(tx, tz);
    if (!start || !goal) return false;
    const si = this.idx(start[0], start[1]);
    const gi = this.idx(goal[0], goal[1]);
    if (si === gi) { out.push(new Vector3(this.worldX(goal[0]), 0, this.worldZ(goal[1]))); return true; }

    const ver = ++this.version;
    this.heapSize = 0;
    this.g[si] = 0;
    this.f[si] = this._h(start[0], start[1], goal[0], goal[1]);
    this.from[si] = -1;
    this.stamp[si] = ver;
    this.state[si] = 1;
    this._push(si);

    let nodes = 0;
    let found = false;
    while (this.heapSize > 0 && nodes < maxNodes) {
      const cur = this._pop();
      if (cur === gi) { found = true; break; }
      this.state[cur] = 2;
      nodes++;
      const cx = cur % this.w, cz = (cur / this.w) | 0;
      for (let k = 0; k < 8; k++) {
        const dx = NEI[k * 2], dz = NEI[k * 2 + 1];
        const nx = cx + dx, nz = cz + dz;
        if (!this.inside(nx, nz)) continue;
        const ni = this.idx(nx, nz);
        if (this.blocked[ni]) continue;
        if (dx !== 0 && dz !== 0) {
          // no cutting corners through a blocked diagonal
          if (this.blocked[this.idx(cx + dx, cz)] || this.blocked[this.idx(cx, cz + dz)]) continue;
        }
        if (this.stamp[ni] === ver && this.state[ni] === 2) continue;
        const step = (dx !== 0 && dz !== 0) ? 1.41421356 : 1;
        const ng = this.g[cur] + step + this.cost[ni];
        if (this.stamp[ni] === ver && ng >= this.g[ni]) continue;
        this.stamp[ni] = ver;
        this.state[ni] = 1;
        this.g[ni] = ng;
        this.f[ni] = ng + this._h(nx, nz, goal[0], goal[1]);
        this.from[ni] = cur;
        this._push(ni);
      }
    }
    if (!found) return false;

    // unwind, then straighten
    const raw = [];
    let n = gi;
    let guard = 0;
    while (n !== -1 && guard++ < 4096) { raw.push(n); n = this.from[n]; }
    raw.reverse();
    this._smooth(raw, out);
    return out.length > 0;
  }

  _h(ax, az, bx, bz) {
    const dx = Math.abs(ax - bx), dz = Math.abs(az - bz);
    return (dx + dz) + (1.41421356 - 2) * Math.min(dx, dz);
  }

  /** String pulling: drop waypoints that a straight line already covers. */
  _smooth(raw, out) {
    if (raw.length === 0) return;
    let anchor = 0;
    out.push(this._point(raw[0]));
    for (let i = 2; i < raw.length; i++) {
      if (!this.lineClear(raw[anchor], raw[i])) {
        anchor = i - 1;
        out.push(this._point(raw[anchor]));
      }
    }
    out.push(this._point(raw[raw.length - 1]));
    if (out.length > 1) out.shift();     // the first point is where we already are
  }

  _point(i) {
    return new Vector3(this.worldX(i % this.w), 0, this.worldZ((i / this.w) | 0));
  }

  lineClear(ia, ib) {
    let x0 = ia % this.w, z0 = (ia / this.w) | 0;
    const x1 = ib % this.w, z1 = (ib / this.w) | 0;
    const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
    const sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;
    let guard = 0;
    while (guard++ < 512) {
      if (this.blocked[this.idx(x0, z0)]) return false;
      if (x0 === x1 && z0 === z1) return true;
      const e2 = err * 2;
      if (e2 > -dz) { err -= dz; x0 += sx; }
      if (e2 < dx) { err += dx; z0 += sz; }
      if (!this.inside(x0, z0)) return false;
    }
    return false;
  }

  lineClearWorld(x0, z0, x1, z1) {
    const a = this.nearestFree(x0, z0), b = this.nearestFree(x1, z1);
    if (!a || !b) return false;
    return this.lineClear(this.idx(a[0], a[1]), this.idx(b[0], b[1]));
  }

  /* --------------------------------- heap -------------------------------- */

  _push(i) {
    let n = ++this.heapSize;
    this.heap[n] = i;
    while (n > 1) {
      const p = n >> 1;
      if (this.f[this.heap[p]] <= this.f[this.heap[n]]) break;
      const t = this.heap[p]; this.heap[p] = this.heap[n]; this.heap[n] = t;
      n = p;
    }
  }

  _pop() {
    const top = this.heap[1];
    this.heap[1] = this.heap[this.heapSize--];
    let n = 1;
    for (;;) {
      const l = n * 2, r = l + 1;
      let s = n;
      if (l <= this.heapSize && this.f[this.heap[l]] < this.f[this.heap[s]]) s = l;
      if (r <= this.heapSize && this.f[this.heap[r]] < this.f[this.heap[s]]) s = r;
      if (s === n) break;
      const t = this.heap[s]; this.heap[s] = this.heap[n]; this.heap[n] = t;
      n = s;
    }
    return top;
  }
}

const NEI = [1, 0, -1, 0, 0, 1, 0, -1, 1, 1, 1, -1, -1, 1, -1, -1];

/* -------------------------------------------------------------------------- */
/*                                citizen brain                               */
/* -------------------------------------------------------------------------- */

export const AI_STATE = {
  IDLE: 'idle', WANDER: 'wander', ALERT: 'alert', FLEE: 'flee', FIGHT: 'fight', DOWN: 'down',
};

export class CitizenAI {
  constructor(character, game) {
    this.c = character;
    this.game = game;
    this.rng = makeRng((Math.random() * 1e9) | 0);
    this.state = AI_STATE.IDLE;
    this.stateTime = 0;
    this.path = [];
    this.pathIndex = 0;
    this.repathTimer = 0;
    this.goal = new Vector3();
    this.hasGoal = false;
    this.fear = 0;
    this.anger = 0;
    this.threat = null;
    this.threatSeen = 0;
    this.lookTarget = null;
    this.idleTimer = 1 + this.rng() * 3;
    this.jumpCooldown = 0;
    this.crouchTimer = 0;
    this.punchTimer = 0;
    this.stuckTimer = 0;
    this.lastPos = new Vector3().copy(character.pos);
    this.bravery = character.look.bravery ?? 0.5;
    this.aggression = character.look.aggression ?? 0.5;
    this.chatter = 0;

    character.wantsUp = true;
  }

  /* ------------------------------- reactions ----------------------------- */

  onHurt(info) {
    const c = this.c;
    const amount = info.amount || 0;
    // Getting hit makes a timid citizen run and an angry one swing back, so
    // fear and anger have to grow at different rates.
    this.fear = clamp01(this.fear + amount * 0.022 + 0.08);
    this.anger = clamp01(this.anger + amount * 0.045 * (0.4 + this.aggression));
    if (info.attacker) { this.threat = info.attacker; this.threatSeen = 3.5; }
    else if (c.lastAttacker) { this.threat = c.lastAttacker; this.threatSeen = 3.0; }
    this.repathTimer = 0;
    c.body.setExpression('frown');
  }

  /** Someone is pointing the reality crusher at us, or swinging near us. */
  onThreatened(source, intensity = 0.35) {
    this.fear = clamp01(this.fear + intensity);
    this.threat = source;
    this.threatSeen = 3.0;
    if (this.state === AI_STATE.IDLE || this.state === AI_STATE.WANDER) this._setState(AI_STATE.ALERT);
  }

  onWitness(victim) {
    if (victim === this.c) return;
    const d = this.c.pos.distanceTo(victim.pos);
    if (d > 14) return;
    this.fear = clamp01(this.fear + 0.34 * (1 - d / 14));
    this.threatSeen = Math.max(this.threatSeen, 2.4);
  }

  _setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
    this.repathTimer = 0;
    if (s === AI_STATE.FLEE) this.c.body.setExpression('frown');
    if (s === AI_STATE.IDLE) this.c.body.setExpression('neutral');
  }

  /* -------------------------------- update ------------------------------- */

  update(dt) {
    const c = this.c;
    this.stateTime += dt;
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    this.punchTimer = Math.max(0, this.punchTimer - dt);
    this.crouchTimer = Math.max(0, this.crouchTimer - dt);
    this.threatSeen = Math.max(0, this.threatSeen - dt);
    this.fear = clamp01(this.fear - dt * 0.055);
    this.anger = clamp01(this.anger - dt * 0.04);

    if (c.dead) { c.moveInput.set(0, 0, 0); return; }

    if (c.state !== STATE.CONTROLLED) {
      this._updateDown(dt);
      return;
    }
    if (this.state === AI_STATE.DOWN) this._setState(AI_STATE.IDLE);

    this._senseThreat(dt);
    this._decide();

    switch (this.state) {
      case AI_STATE.IDLE: this._idle(dt); break;
      case AI_STATE.WANDER: this._wander(dt); break;
      case AI_STATE.ALERT: this._alert(dt); break;
      case AI_STATE.FLEE: this._flee(dt); break;
      case AI_STATE.FIGHT: this._fight(dt); break;
      default: break;
    }

    this._avoidIncoming(dt);
    this._maybeJump(dt);
    this._stuckCheck(dt);
  }

  _updateDown(dt) {
    const c = this.c;
    this._setState(AI_STATE.DOWN);
    // Crawl away from whatever hurt us while we are still on the floor.
    if (this.threat && !c.dead && this.fear > 0.3) {
      _v1.copy(c.pos).sub(this.threat.pos); _v1.y = 0;
      if (_v1.lengthSq() > 0.001) c.moveInput.copy(_v1.normalize());
    } else {
      c.moveInput.set(0, 0, 0);
    }
    c.wantsUp = !c.dead;
    void dt;
  }

  _senseThreat(dt) {
    const game = this.game;
    const c = this.c;
    let best = null, bestScore = 0;
    const candidates = game.threatCandidates();
    for (let i = 0; i < candidates.length; i++) {
      const t = candidates[i];
      if (t === c || t.dead) continue;
      const d = c.pos.distanceTo(t.pos);
      if (d > 22) continue;
      let score = (22 - d) / 22;
      if (t === this.threat) score += 0.4;
      if (t.combatReady) score += 0.35;
      if (t.equipped === 'rcv2') score += 0.15;
      if (score > bestScore) { bestScore = score; best = t; }
    }
    if (best && (this.threatSeen > 0 || bestScore > 0.55)) {
      this.threat = best;
      // Being loomed over by someone swinging is threatening on its own.
      const d = c.pos.distanceTo(best.pos);
      if (d < 3.0 && best.combatReady) this.fear = clamp01(this.fear + dt * 0.55);
      if (d < 5.0 && best.equipped === 'rcv2' && game.isAimingAt(best, c)) {
        this.fear = clamp01(this.fear + dt * 0.42);
        this.threatSeen = Math.max(this.threatSeen, 1.2);
      }
    }
    if (this.threatSeen <= 0 && this.fear < 0.12) this.threat = null;
  }

  _decide() {
    const c = this.c;
    if (!this.threat) {
      if (this.state === AI_STATE.FLEE || this.state === AI_STATE.FIGHT || this.state === AI_STATE.ALERT) {
        if (this.fear < 0.2 && this.anger < 0.2) this._setState(AI_STATE.IDLE);
      }
      return;
    }
    const hurt = 1 - c.health / c.maxHealth;
    const willFight = (this.anger * 1.2 + this.aggression * 0.6 + this.bravery * 0.7)
                    > (this.fear * 1.3 + hurt * 0.9 + 0.45);
    if (this.fear > 0.16 || this.anger > 0.16) {
      this._setState(willFight ? AI_STATE.FIGHT : AI_STATE.FLEE);
    }
  }

  /* ------------------------------- behaviours ---------------------------- */

  _idle(dt) {
    const c = this.c;
    c.moveInput.set(0, 0, 0);
    c.wantRun = false;
    c.crouchWant = false;
    this.idleTimer -= dt;
    // idle glancing about
    if (this.rng() < dt * 0.4) this.lookYaw = c.yaw + (this.rng() - 0.5) * 1.6;
    if (this.lookYaw != null) c.yaw = dampAngle(c.yaw, this.lookYaw, 2.2, dt);
    if (this.idleTimer <= 0) {
      this.idleTimer = 3 + this.rng() * 6;
      this._setState(AI_STATE.WANDER);
      this._pickWanderGoal();
    }
  }

  _pickWanderGoal() {
    const c = this.c;
    const grid = this.game.nav;
    for (let i = 0; i < 12; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = 4 + this.rng() * 16;
      const x = c.pos.x + Math.cos(a) * r;
      const z = c.pos.z + Math.sin(a) * r;
      if (!grid.isBlockedWorld(x, z)) { this.goal.set(x, 0, z); this.hasGoal = true; this.repathTimer = 0; return; }
    }
    this.hasGoal = false;
    this._setState(AI_STATE.IDLE);
  }

  _wander(dt) {
    const c = this.c;
    c.wantRun = false;
    c.crouchWant = false;
    if (!this.hasGoal) { this._setState(AI_STATE.IDLE); return; }
    const arrived = this._followPath(dt, this.goal, 0.75);
    if (arrived || this.stateTime > 22) {
      this.hasGoal = false;
      this.idleTimer = 2 + this.rng() * 5;
      this._setState(AI_STATE.IDLE);
    }
  }

  _alert(dt) {
    const c = this.c;
    c.moveInput.set(0, 0, 0);
    c.wantRun = false;
    if (this.threat) this._facePoint(this.threat.pos, dt, 8);
    if (this.stateTime > 1.6) {
      if (this.fear > 0.35) this._setState(AI_STATE.FLEE);
      else this._setState(AI_STATE.IDLE);
    }
  }

  _flee(dt) {
    const c = this.c;
    c.wantRun = true;
    c.crouchWant = false;
    const t = this.threat;
    if (!t) { this._setState(AI_STATE.IDLE); return; }

    const d = c.pos.distanceTo(t.pos);
    if (d > 26 && this.fear < 0.45) { this._setState(AI_STATE.IDLE); this.fear *= 0.5; return; }

    if (this.repathTimer <= 0) {
      this.repathTimer = 0.55 + this.rng() * 0.3;
      // run to the free spot furthest from the threat
      _v1.copy(c.pos).sub(t.pos); _v1.y = 0;
      if (_v1.lengthSq() < 1e-4) _v1.set(1, 0, 0);
      _v1.normalize();
      let bestX = 0, bestZ = 0, bestScore = -Infinity;
      for (let i = 0; i < 9; i++) {
        const a = Math.atan2(_v1.x, _v1.z) + (i - 4) * 0.42;
        const r = 9 + this.rng() * 7;
        const x = c.pos.x + Math.sin(a) * r;
        const z = c.pos.z + Math.cos(a) * r;
        if (this.game.nav.isBlockedWorld(x, z)) continue;
        const score = Math.hypot(x - t.pos.x, z - t.pos.z) - Math.abs(i - 4) * 0.8;
        if (score > bestScore) { bestScore = score; bestX = x; bestZ = z; }
      }
      if (bestScore > -Infinity) {
        this.goal.set(bestX, 0, bestZ); this.hasGoal = true; this._repath();
      } else {
        this.hasGoal = false;      // nowhere left to run
      }
    } else {
      this.repathTimer -= dt;
    }

    if (this.hasGoal) {
      this._followPath(dt, this.goal, 1.0, true);
    } else if (d < 3.0 && this.fear > 0.7) {
      // Cornered and terrified: stop, duck, cover up.
      c.crouchWant = true;
      c.moveInput.set(0, 0, 0);
      this._facePoint(t.pos, dt, 6);
    }
  }

  _fight(dt) {
    const c = this.c;
    const t = this.threat;
    if (!t || t.dead) { this.anger *= 0.4; this._setState(AI_STATE.IDLE); return; }
    const d = c.pos.distanceTo(t.pos);
    c.wantRun = d > 3.2;
    c.crouchWant = false;
    this._facePoint(t.pos, dt, 9);

    if (d > 0.78) {
      this._followPath(dt, t.pos, 0.62, true);
    } else {
      _v1.copy(t.pos).sub(c.pos); _v1.y = 0; _v1.normalize();
      const side = (this.id2 = this.id2 || (this.rng() < 0.5 ? -1 : 1));
      if (d < 0.48) {
        c.moveInput.copy(_v1).multiplyScalar(-0.5);          // too close, back off
      } else {
        // circle, leaning slightly in, so nobody stands nose to nose
        c.moveInput.set(-_v1.z * side * 0.35 + _v1.x * 0.2, 0, _v1.x * side * 0.35 + _v1.z * 0.2);
      }
    }

    // swing when the target is actually in front and in reach
    if (d < 0.95 && this.punchTimer <= 0) {
      _v1.copy(t.pos).sub(c.pos); _v1.y = 0;
      const want = Math.atan2(-_v1.x, -_v1.z);
      if (Math.abs(angleDelta(c.yaw, want)) < 0.55) {
        if (c.punch(true)) this.punchTimer = 0.42 + this.rng() * 0.5;
      }
    }
    if (this.stateTime > 20 && this.anger < 0.3) this._setState(AI_STATE.IDLE);
    if (c.health < c.maxHealth * 0.28 && this.fear > this.bravery * 0.7) this._setState(AI_STATE.FLEE);
  }

  /* --------------------------------- steering ---------------------------- */

  _repath() {
    const c = this.c;
    this.path.length = 0;
    this.pathIndex = 0;
    this.game.nav.findPath(c.pos.x, c.pos.z, this.goal.x, this.goal.z, this.path);
  }

  /**
   * Walks the current path towards `target`. Returns true once we are there.
   */
  _followPath(dt, target, arriveDist = 0.8, chase = false) {
    const c = this.c;
    const nav = this.game.nav;
    this.repathTimer -= dt;

    const dGoal = Math.hypot(target.x - c.pos.x, target.z - c.pos.z);
    if (dGoal < arriveDist) { c.moveInput.set(0, 0, 0); return true; }

    const needRepath = this.repathTimer <= 0 ||
      (this.path.length === 0) ||
      (chase && this.goal.distanceToSquared(target) > 2.25);
    if (needRepath) {
      this.goal.set(target.x, 0, target.z);
      this.repathTimer = chase ? 0.4 : 0.85;
      // A clear straight line means there is no need to plan at all.
      if (nav.lineClearWorld(c.pos.x, c.pos.z, target.x, target.z)) {
        this.path.length = 0;
        this.path.push(new Vector3(target.x, 0, target.z));
        this.pathIndex = 0;
      } else {
        this._repath();
      }
    }

    if (this.path.length === 0) {
      _v1.set(target.x - c.pos.x, 0, target.z - c.pos.z).normalize();
      c.moveInput.copy(_v1);
      this._faceMove(dt);
      return false;
    }

    let wp = this.path[this.pathIndex];
    while (wp && Math.hypot(wp.x - c.pos.x, wp.z - c.pos.z) < 0.62) {
      this.pathIndex++;
      wp = this.path[this.pathIndex];
    }
    if (!wp) { this.path.length = 0; return dGoal < arriveDist + 0.4; }

    _v1.set(wp.x - c.pos.x, 0, wp.z - c.pos.z);
    const len = _v1.length() || 1;
    _v1.multiplyScalar(1 / len);
    // gentle separation from other citizens
    this._separate(_v1);
    c.moveInput.copy(_v1);
    this._faceMove(dt);
    return false;
  }

  _separate(dir) {
    const c = this.c;
    const others = this.game.characters;
    const closing = this.state === AI_STATE.FIGHT ? this.threat : null;
    for (let i = 0; i < others.length; i++) {
      const o = others[i];
      if (o === c || o.isDown || o === closing) continue;
      const dx = c.pos.x - o.pos.x, dz = c.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 0.81 || d2 < 1e-5) continue;
      const d = Math.sqrt(d2);
      const k = (0.9 - d) / 0.9 * 0.9;
      dir.x += (dx / d) * k;
      dir.z += (dz / d) * k;
    }
    const l = Math.hypot(dir.x, dir.z);
    if (l > 1e-5) { dir.x /= l; dir.z /= l; }
  }

  _faceMove(dt) {
    const c = this.c;
    if (c.moveInput.lengthSq() < 1e-4) return;
    const want = Math.atan2(-c.moveInput.x, -c.moveInput.z);
    c.yaw = dampAngle(c.yaw, want, this.state === AI_STATE.FLEE ? 10 : 7, dt);
  }

  _facePoint(p, dt, rate = 8) {
    const c = this.c;
    _v1.set(p.x - c.pos.x, 0, p.z - c.pos.z);
    if (_v1.lengthSq() < 1e-6) return;
    const want = Math.atan2(-_v1.x, -_v1.z);
    c.yaw = dampAngle(c.yaw, want, rate, dt);
    c.pitch = lerp(c.pitch, clamp((p.y - (c.pos.y + 0.6)) * 0.4, -0.5, 0.5), clamp01(dt * 6));
  }

  /* ------------------------------ jump / crouch -------------------------- */

  /** Jump only when something walkable-height is genuinely in the way. */
  _maybeJump(dt) {
    const c = this.c;
    c.wantJump = false;
    if (this.jumpCooldown > 0 || !c.grounded) return;
    if (c.moveInput.lengthSq() < 0.2) return;
    _v1.copy(c.moveInput).normalize();
    const feet = c.pos.y - 0.945;
    const ahead = _v2.set(c.pos.x + _v1.x * 0.75, feet + 0.25, c.pos.z + _v1.z * 0.75);
    const bodies = this.game.world.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (b.aabbMax.y < feet + 0.12) continue;
      if (b.aabbMax.y > feet + 1.05) continue;      // too tall to hop, go round
      if (ahead.x < b.aabbMin.x - 0.25 || ahead.x > b.aabbMax.x + 0.25) continue;
      if (ahead.z < b.aabbMin.z - 0.25 || ahead.z > b.aabbMax.z + 0.25) continue;
      c.wantJump = true;
      this.jumpCooldown = 0.85;
      return;
    }
    void dt;
  }

  /** Duck when something heavy is flying at head height. */
  _avoidIncoming(dt) {
    const c = this.c;
    if (this.crouchTimer > 0) { c.crouchWant = true; return; }
    const feet = c.pos.y - 0.945;
    const bodies = this.game.world.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const sp = b.vel.length();
      if (sp < 5.5) continue;
      _v1.copy(c.pos).sub(b.pos);
      const dist = _v1.length();
      if (dist > 9 || dist < 0.3) continue;
      _v2.copy(b.vel).multiplyScalar(1 / sp);
      const t = _v1.dot(_v2);
      if (t <= 0 || t > 9) continue;
      _v3.copy(b.pos).addScaledVector(_v2, t);           // closest approach
      const miss = Math.hypot(_v3.x - c.pos.x, _v3.z - c.pos.z);
      if (miss > 0.85) continue;
      if (_v3.y < feet + 0.85) continue;                  // it is going past our legs
      this.crouchTimer = 0.75;
      this.fear = clamp01(this.fear + 0.25);
      c.crouchWant = true;
      return;
    }
    void dt;
  }

  _stuckCheck(dt) {
    const c = this.c;
    if (c.moveInput.lengthSq() < 0.05) { this.stuckTimer = 0; this.lastPos.copy(c.pos); return; }
    if (c.pos.distanceToSquared(this.lastPos) < 0.0025) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.9) {
        this.stuckTimer = 0;
        this.repathTimer = 0;
        this.path.length = 0;
        if (this.jumpCooldown <= 0 && this.rng() < 0.5) { c.wantJump = true; this.jumpCooldown = 1.0; }
        // sidestep so two citizens do not deadlock
        _v1.copy(c.moveInput);
        c.moveInput.set(-_v1.z, 0, _v1.x);
      }
    } else {
      this.stuckTimer = 0;
    }
    this.lastPos.copy(c.pos);
  }
}
