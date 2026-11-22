/* =============================================================================
   Police helicopters.

   One comes at three stars, two at five. It flies in high, over everything
   in the city, and comes down to work once it is over you. Two kinds:

     gunner   two S.W.A.T. officers sit in the open doors with rifles. It
              circles you, the door on the inside of the circle toward you,
              and whoever is sitting in it shoots when they have a line on
              you. It stays as long as you are worth a helicopter.
     drop     four S.W.A.T. on the benches behind the open doors. It finds
              somewhere open near you, comes down to a hover, drops a rope
              from each door, and they go down them two at a time; then it
              pulls the ropes in and leaves.

   Whoever is in it can see you from up there unless a building is in the
   way, and tells the rest of them where you are. At night a searchlight
   under its nose follows you.

   It can be shot. Rounds hole it; enough of them and the engine smokes,
   then burns, and it loses its tail and comes down spinning; so does one
   whose pilot has been shot. Where it comes down it blows up, and whoever is
   still in it is thrown out. Anyone shot on the rope falls.
   ========================================================================== */
import * as THREE from 'three';
import { Merger } from '../render/merge.js';
import { signTexture } from '../render/textures.js';
import { KERB, ROADS, groundHeight } from './city.js';
import { P, PELVIS_HEIGHT } from '../human/rig.js';
import { ST } from '../human/human.js';
import { clamp, clamp01, lerp, rand, chance, pick, damp, wrapAngle, TAU } from '../core/util.js';

const CRUISE_Y = 64;           // over everything in the city, going to and from
const MAX_SPEED = 24, ACCEL = 7, CLIMB = 7, YAW_RATE = 1.1;
const ROTOR_R = 5.2;
const ROPE_DOOR = 0.9;         // where the ropes hang from, out from the middle
const BLUE = 0x16306b, WHITE = 0xe7eaee, DARK = 0x23262b, INSIDE = 0x34383e, GREY = 0x8b9096;

/** The crew's places, in its own space (nose toward +Z, +X its left, the skids at y = 0): pilot front right, then the doors. */
const CREW = {
  gunner: {
    at: [[-0.38, 0.95, 1.15], [0.62, 0.76, -0.2], [-0.62, 0.76, -0.2]],
    kind: [{ pilot: true }, { gun: true, yaw: Math.PI / 2, side: 1 }, { gun: true, yaw: -Math.PI / 2, side: -1 }],
  },
  drop: {
    at: [[-0.38, 0.95, 1.15], [0.48, 1.06, 0.22], [-0.48, 1.06, 0.22], [0.48, 1.06, -0.62], [-0.48, 1.06, -0.62]],
    kind: [{ pilot: true }, { yaw: Math.PI / 2, side: 1 }, { yaw: -Math.PI / 2, side: -1 }, { yaw: Math.PI / 2, side: 1 }, { yaw: -Math.PI / 2, side: -1 }],
  },
};

const _a = [0, 0, 0], _b = [0, 0, 0];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

/* ------------------------------- the model -------------------------------- */

let _geo = null;
/** Everything that does not move, as one mesh (shared by every helicopter): fuselage, boom, fin, skids. */
function bodyGeometry() {
  if (_geo) return _geo;
  const m = new Merger(), glass = new Merger();
  // the belly under the floor, and the floor the doors open on to
  m.box(0, 0.5, 0.35, 1.5, 0.26, 4.0, BLUE);
  m.box(0, 0.65, -0.15, 1.42, 0.05, 1.7, INSIDE);
  // the cockpit: blue up to the elbows, glass above, a nose in front
  for (const sx of [1, -1]) m.box(sx * 0.73, 0.92, 1.45, 0.05, 0.6, 1.7, BLUE);
  m.box(0, 0.86, 2.45, 1.3, 0.5, 0.5, BLUE);
  m.box(0, 1.2, 2.25, 1.2, 0.18, 0.4, DARK, -0.5);
  for (const sx of [1, -1]) {
    glass.box(sx * 0.73, 1.55, 1.45, 0.03, 0.66, 1.66, 0);
    m.box(sx * 0.73, 1.55, 0.62, 0.07, 0.72, 0.08, WHITE);       // the pillar between the cockpit and the door
  }
  glass.box(0, 1.58, 2.08, 1.34, 0.9, 0.04, 0, -0.62);            // the windscreen, raked back
  // the cabin behind: open both sides, a roof, a back wall, the benches
  m.box(0, 1.97, 0.55, 1.5, 0.1, 3.2, WHITE);                      // the roof, over cockpit and cabin
  m.box(0, 1.3, -1.02, 1.46, 1.3, 0.08, INSIDE);
  for (const sx of [1, -1]) m.box(sx * 0.42, 0.86, -0.2, 0.36, 0.38, 1.5, INSIDE);
  // a stripe along the sides below the doors
  for (const sx of [1, -1]) m.box(sx * 0.76, 0.66, 0.35, 0.02, 0.07, 3.9, WHITE);
  // behind the cabin, narrowing into the boom
  m.box(0, 1.3, -1.45, 1.3, 1.2, 0.8, BLUE);
  m.box(0, 1.75, -1.45, 1.2, 0.36, 0.8, WHITE);
  m.box(0, 1.5, -2.6, 0.5, 0.5, 1.8, BLUE);
  m.box(0, 1.55, -4.45, 0.3, 0.3, 2.4, BLUE);
  m.box(0, 1.67, -3.3, 0.36, 0.08, 3.6, WHITE);
  // the engine on top, and the mast
  m.box(0, 2.22, -0.25, 0.95, 0.42, 1.8, WHITE);
  m.box(0, 2.1, 0.8, 0.8, 0.2, 0.5, WHITE);
  m.cyl(0, 2.55, 0.1, 0.16, 0.35, DARK);
  // the fin, the tailplane, the tail rotor's hub
  m.box(0, 2.15, -5.75, 0.08, 1.2, 0.75, BLUE, -0.25);
  m.box(0, 1.55, -5.0, 1.8, 0.06, 0.42, BLUE);
  for (const sx of [1, -1]) m.box(sx * 0.9, 1.68, -5.0, 0.05, 0.3, 0.38, BLUE);
  m.cyl(0.12, 2.05, -5.85, 0.12, 0.16, DARK, 0, 0, Math.PI / 2);
  // skids, and the struts up to the belly
  for (const sx of [1, -1]) {
    m.box(sx * 0.86, 0.05, 0.3, 0.08, 0.07, 3.1, DARK);
    m.box(sx * 0.86, 0.1, 1.86, 0.08, 0.07, 0.25, DARK, 0.55);
    for (const z of [-0.5, 1.15]) m.box(sx * 0.78, 0.25, z, 0.06, 0.45, 0.07, DARK, 0, 0, sx * 0.25);
  }
  // the searchlight under the nose
  m.cyl(0, 0.3, 2.1, 0.22, 0.18, DARK);
  _geo = { body: m.build(), glass: glass.build() };
  return _geo;
}

let _rotorGeo = null;
function rotorGeometry() {
  if (_rotorGeo) return _rotorGeo;
  const m = new Merger(), t = new Merger();
  for (let k = 0; k < 4; k++) m.box(0, 0, 0, 0.3, 0.035, ROTOR_R * 2, 0x1a1c1f, 0, k * Math.PI / 4, 0);
  m.cyl(0, 0, 0, 0.34, 0.12, DARK);
  t.box(0, 0, 0, 0.04, 1.1, 0.13, 0x1a1c1f); t.box(0, 0, 0, 0.04, 0.13, 1.1, 0x1a1c1f);
  _rotorGeo = { main: m.build(), tail: t.build() };
  return _rotorGeo;
}

const _bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const _glassMat = new THREE.MeshPhongMaterial({ color: 0x9fb3c2, transparent: true, opacity: 0.28, depthWrite: false, shininess: 90, specular: 0x9aa7b4, side: THREE.DoubleSide });
const _blurMat = new THREE.MeshBasicMaterial({ color: 0x15171a, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
const _beamMat = new THREE.MeshBasicMaterial({ color: 0xfff2d0, transparent: true, opacity: 0.075, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
let _signTex = null;

/* --------------------------------- one ------------------------------------ */

let _id = 1;

export class Heli {
  constructor(air, kind, x, y, z, yaw) {
    this.air = air; this.g = air.g;
    this.id = _id++;
    this.heli = true; this.kind = kind;
    this.x = x; this.y = y; this.z = z; this.yaw = yaw; this.pitch = 0; this.roll = 0;
    this.vx = 0; this.vy = 0; this.vz = 0; this.speed = 0; this.w = 0;
    this.hp = 100; this.down = false; this.wreck = false; this.fire = -1;
    this.state = 'inbound'; this.t = 0; this.stateT = 0;
    this.circle = chance(0.5) ? 1 : -1; this.theta = 0;
    this.seen = 0;            // seconds since it last had you in sight
    this.target = null;       // { x, z } it is working round
    this.drop = null;         // where it is putting its team down
    this.ropes = [];          // { side, z, idx, len, out }
    this.lastBy = null;
    const C = CREW[kind];
    this.seatAt = C.at.map((a) => a.slice());
    this.seatKind = C.kind.map((k) => ({ ...k }));
    this.seats = this.seatAt.map(() => null);
    this.spin = 0; this.spinRate = 36; this.tailSpin = 0;
    this._build();
    this.place();
  }

  get drivable() { return !this.down; }

  _build() {
    const g = this.g, G = bodyGeometry(), R = rotorGeometry();
    const grp = this.group = new THREE.Group();
    this.bodyMesh = new THREE.Mesh(G.body, _bodyMat);
    this.bodyMesh.castShadow = !!g.shadows;
    this.glassMesh = new THREE.Mesh(G.glass, _glassMat); this.glassMesh.renderOrder = 6;
    this.rotor = new THREE.Mesh(R.main, _bodyMat); this.rotor.position.set(0, 2.72, 0.1); this.rotor.castShadow = !!g.shadows;
    this.blur = new THREE.Mesh(new THREE.CircleGeometry(ROTOR_R, 28).rotateX(-Math.PI / 2), _blurMat);
    this.blur.position.set(0, 2.74, 0.1); this.blur.renderOrder = 5;
    this.tail = new THREE.Mesh(R.tail, _bodyMat); this.tail.position.set(0.2, 2.05, -5.85);
    // POLICE down each side of the boom, and under the belly
    if (!_signTex) _signTex = signTexture('POLICE');
    const sm = new THREE.MeshBasicMaterial({ map: _signTex, side: THREE.DoubleSide });
    const s1 = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.36), sm); s1.position.set(0.26, 1.5, -2.65); s1.rotation.y = Math.PI / 2;
    const s2 = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.36), sm); s2.position.set(-0.26, 1.5, -2.65); s2.rotation.y = -Math.PI / 2;
    const s3 = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), sm); s3.position.set(0, 0.36, 0.4); s3.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    // lamps: red to port (its left, +X), green to starboard, a beacon on the fin, and the searchlight's beam
    const lamp = (hex, x, y, z, s = 0.09) => { const l = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshBasicMaterial({ color: hex })); l.position.set(x, y, z); grp.add(l); return l; };
    lamp(0xff2a2a, 0.78, 0.7, 0.9); lamp(0x2aff5a, -0.78, 0.7, 0.9);
    this.beacon = lamp(0x3a0808, 0, 2.8, -5.95, 0.12);
    this.beam = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1, 18, 1, true).translate(0, -0.5, 0), _beamMat);
    this.beam.visible = false; this.beam.renderOrder = 7;
    g.scene.add(this.beam);
    this.signs = [s1, s2, s3];
    grp.add(this.bodyMesh, this.glassMesh, this.rotor, this.blur, this.tail, s1, s2, s3);
    g.scene.add(grp);
  }

  dispose() {
    const g = this.g;
    g.scene.remove(this.group); g.scene.remove(this.beam);
    this.blur.geometry.dispose(); this.beam.geometry.dispose();
    for (const s of this.signs) { s.geometry.dispose(); s.material.dispose(); }
    for (const r of this.ropes) if (r.idx >= 0) g.boxes.release(r.idx);
    this.ropes.length = 0;
  }

  place() {
    const grp = this.group;
    grp.position.set(this.x, this.y, this.z);
    grp.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    grp.updateMatrixWorld();
  }

  /** A point in its own space, in the world (and back). */
  toWorld(lx, ly, lz, out) {
    const q = this.group.quaternion, p = this.group.position;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const tx = 2 * (qy * lz - qz * ly), ty = 2 * (qz * lx - qx * lz), tz = 2 * (qx * ly - qy * lx);
    out[0] = p.x + lx + qw * tx + (qy * tz - qz * ty);
    out[1] = p.y + ly + qw * ty + (qz * tx - qx * tz);
    out[2] = p.z + lz + qw * tz + (qx * ty - qy * tx);
    return out;
  }
  toLocal(wx, wy, wz, out) {
    const q = this.group.quaternion, p = this.group.position;
    const qx = -q.x, qy = -q.y, qz = -q.z, qw = q.w;
    const lx = wx - p.x, ly = wy - p.y, lz = wz - p.z;
    const tx = 2 * (qy * lz - qz * ly), ty = 2 * (qz * lx - qx * lz), tz = 2 * (qx * ly - qy * lx);
    out[0] = lx + qw * tx + (qy * tz - qz * ty);
    out[1] = ly + qw * ty + (qz * tx - qx * tz);
    out[2] = lz + qw * tz + (qx * ty - qy * tx);
    return out;
  }

  /** Who is in it, and whether they are any use. */
  get pilot() { return this.seats[0]; }
  get pilotOk() { const h = this.seats[0]; return !!h && !h.removed && h.h.alive && h.h.conscious; }
  get crewAboard() { return this.seats.filter((h) => h && !h.removed); }

  /** Off it: someone sitting in it gets out (at the bottom of a rope), or, dead or thrown, falls from where they are. */
  release(h, fall = false) {
    const i = this.seats.indexOf(h);
    if (i < 0) return;
    this.seats[i] = null;
    if (!fall) {
      this.toWorld(this.seatAt[i][0], this.seatAt[i][1], this.seatAt[i][2], _a);
      h.leaveCar(_a[0], _a[2], h.yaw, this, false);
      return;
    }
    // from where they are, not from the ground: they fall, with the helicopter's speed
    h.car = this; h.seat = i;
    h.fallOff();
  }

  /* ------------------------------- flying -------------------------------- */

  /** Toward (tx, ty, tz), arriving rather than overshooting; turning to face `face` (or the way it is going). */
  _fly(dt, tx, ty, tz, face = null, top = MAX_SPEED) {
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    const want = Math.min(top, Math.sqrt(2 * ACCEL * 0.8 * d), d * 2.2);
    const wx = d > 0.01 ? dx / d * want : 0, wz = d > 0.01 ? dz / d * want : 0;
    const ax = clamp((wx - this.vx) * 2, -ACCEL, ACCEL), az = clamp((wz - this.vz) * 2, -ACCEL, ACCEL);
    this.vx += ax * dt; this.vz += az * dt;
    const wy = clamp((ty - this.y) * 0.9, -CLIMB, CLIMB);
    this.vy += clamp((wy - this.vy) * 3, -8, 8) * dt;
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    this.speed = Math.hypot(this.vx, this.vz);
    // the nose round toward where it is told to look, or where it is going
    const yawT = face != null ? face : this.speed > 3 ? Math.atan2(this.vx, this.vz) : this.yaw;
    const turn = clamp(wrapAngle(yawT - this.yaw), -YAW_RATE * dt, YAW_RATE * dt);
    this.yaw += turn; this.w = turn / dt;
    // leaning into it: the nose down to go forward, over to the side to turn or slide
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const fwdA = ax * fx + az * fz, sideA = ax * fz - az * fx;
    const vf = this.vx * fx + this.vz * fz;
    this.pitch = damp(this.pitch, clamp(vf * 0.012 + fwdA * 0.03, -0.3, 0.3), 3, dt);
    this.roll = damp(this.roll, clamp(-sideA * 0.03 - this.w * 0.12, -0.35, 0.35), 3, dt);
  }

  /** How high it has to be to be clear of everything within `r` of a point. */
  safeAlt(x, z, r) {
    let top = KERB;
    for (const b of this.g.city.buildings) {
      const ex = Math.max(b.x0 - x, 0, x - b.x1), ez = Math.max(b.z0 - z, 0, z - b.z1);
      if (ex * ex + ez * ez < r * r) top = Math.max(top, KERB + b.h + 2.5);
    }
    return top;
  }

  /** Where you are, as far as it knows. */
  _you() {
    const g = this.g, p = g.player, P = g.police;
    if (this.seen < 3 || !P || !P.lastSeen) { const y = p.car || p; return { x: y.x, z: y.z }; }
    return { x: P.lastSeen.x, z: P.lastSeen.z };
  }

  update(dt) {
    const g = this.g;
    this.t += dt; this.stateT += dt;
    if (this.down) { this._wrecked(dt); return; }
    // the pilot shot, or the tail gone: it comes down
    if (this.state !== 'crash' && (this.hp <= 0 || !this.pilotOk)) { this.state = 'crash'; this.stateT = 0; this.air.stats.downed++; g.audio?.at('whump', this.x, this.y, this.z, 1); }
    const S = this.state;
    if (S === 'inbound') this._inbound(dt);
    else if (S === 'orbit') this._orbit(dt);
    else if (S === 'dropping') this._dropping(dt);
    else if (S === 'leave') this._leave(dt);
    else if (S === 'crash') this._crash(dt);
    if (this.removed) return;
    this.place();
    this._ropes(dt);
    this._effects(dt);
  }

  _inbound(dt) {
    const you = this._you();
    this.target = you;
    let tx = you.x, tz = you.z;
    if (this.kind === 'drop') {
      if (!this.drop) this.drop = this._dropSpot(you.x, you.z);
      if (this.drop) { tx = this.drop.x; tz = this.drop.z; }
    } else {
      // to its place on the circle round you
      tx = you.x + Math.sin(this.theta) * 22; tz = you.z + Math.cos(this.theta) * 22;
    }
    const d = Math.hypot(tx - this.x, tz - this.z);
    // high until it is over the place, then down to work (a drop goes down only once it is right over its spot)
    this._fly(dt, tx, d > 30 || this.kind === 'drop' ? CRUISE_Y : this._workAlt(you.x, you.z), tz);
    if (d < 30) {
      if (this.kind === 'drop' && this.drop) { this.state = 'dropping'; this.stateT = 0; this.phase = 'down'; }
      else if (this.kind === 'gunner') { this.state = 'orbit'; this.stateT = 0; this.theta = Math.atan2(this.x - you.x, this.z - you.z); }
    }
  }

  /** How high to work at over a point: clear of the buildings round it, low enough to see and be seen. */
  _workAlt(x, z) { return clamp(this.safeAlt(x, z, 28) + 6, 18, 58); }

  /** Circling you, the door on the inside of the circle toward you. */
  _orbit(dt) {
    const you = this._you();
    this.target = you;
    const R = this.seen > 6 ? 30 : 22;
    this.theta += this.circle * (7 / R) * dt;
    const tx = you.x + Math.sin(this.theta) * R, tz = you.z + Math.cos(this.theta) * R;
    // the inside door toward the middle: going round one way the left side faces in, the other way the right
    const tangent = Math.atan2(Math.cos(this.theta) * this.circle, -Math.sin(this.theta) * this.circle);
    this._fly(dt, tx, this._workAlt(you.x, you.z), tz, tangent, 16);
  }

  /** Somewhere open near you to put a team down: a street or the park, nothing tall within the rotor's reach. */
  _dropSpot(px, pz) {
    const g = this.g, city = g.city;
    let best = null, bs = Infinity;
    for (let k = 0; k < 60; k++) {
      let x, z;
      if (k < 36) {
        // along the middle of the streets
        const r = ROADS[(Math.random() * ROADS.length) | 0], v = rand(-54, 54);
        if (k % 2) { x = r; z = v; } else { x = v; z = r; }
      } else { x = rand(-12, 12); z = rand(-12, 12); }
      const d = Math.hypot(x - px, z - pz);
      if (d < 8 || d > 34) continue;
      if (this.safeAlt(x, z, ROTOR_R + 1.6) > KERB + 0.5) continue;
      if (!city.isClear(x, z, 0.6)) continue;
      const sc = Math.abs(d - 14) + rand(0, 4);
      if (sc < bs) { bs = sc; best = { x, z }; }
    }
    return best;
  }

  /** Down to a hover over the spot, a rope from each door, and the team down them two at a time. */
  _dropping(dt) {
    const g = this.g, D = this.drop, gy = groundHeight(D.x, D.z);
    const hover = gy + 11.5;
    const face = this.dropYaw ?? (this.dropYaw = this.yaw);
    if (this.phase === 'down') {
      this._fly(dt, D.x, Math.abs(this.x - D.x) + Math.abs(this.z - D.z) < 4 ? hover : Math.max(this.y, hover), D.z, face, 10);
      if (Math.abs(this.y - hover) < 0.8 && Math.hypot(this.x - D.x, this.z - D.z) < 1.5 && this.speed < 1.5) {
        this.phase = 'ropes'; this.stateT = 0;
        for (const side of [1, -1]) this.ropes.push({ side, z: 0.22, len: 0, out: true, idx: g.boxes.alloc() });
        for (const r of this.ropes) g.boxes.colorHex(r.idx, 0x2b2622);
        g.audio?.at('whump', this.x, this.y - 2, this.z, 0.4);
      }
      return;
    }
    this._fly(dt, D.x, hover, D.z, face, 6);
    if (this.phase === 'ropes') {
      if (this.stateT > 1.2) { this.phase = 'go'; this.stateT = 0; this.next = 1; this.goT = 0; }
      return;
    }
    if (this.phase === 'go') {
      // two at a time, one from each door: front pair, then the back pair
      this.goT -= dt;
      if (this.goT <= 0 && this.next <= 4) {
        for (const i of [this.next, this.next + 1]) this._toRope(i);
        this.next += 2; this.goT = 2.6;
      }
      this._roping(dt);
      const left = this.seats.slice(1).some((h) => h && h.h.alive && h.h.conscious);
      if (this.next > 4 && !left && this.goT < 1.6) { this.phase = 'up'; this.stateT = 0; for (const r of this.ropes) r.out = false; }
      return;
    }
    if (this.phase === 'up') {
      this._roping(dt);
      if (this.stateT > 1.3) { this.leave(); }
    }
  }

  /** Off the bench and on to the rope. */
  _toRope(i) {
    const h = this.seats[i];
    if (!h || h.removed || !h.h.alive || !h.h.conscious) return;
    const K = this.seatKind[i], side = K.side;
    // standing outside the door, facing the rope (and the helicopter)
    K.rope = true; K.yaw = side > 0 ? -Math.PI / 2 : Math.PI / 2; K.ropeX = side * ROPE_DOOR;
    this.seatAt[i] = [side * (ROPE_DOOR + 0.26), 1.35, 0.22];
    K.v = 0;
    h.mind?.note('felt', 'rope', 'went down a rope from a helicopter', 0.6);
    this.air.stats.roped++;
  }

  /** Everyone on a rope: down it, faster and then slower, and off at the bottom. */
  _roping(dt) {
    const g = this.g;
    for (let i = 1; i < this.seats.length; i++) {
      const h = this.seats[i], K = this.seatKind[i];
      if (!h || !K.rope) continue;
      // shot on the way down: they let go
      if (h.removed || !h.h.alive || !h.h.conscious) { this.release(h, true); continue; }
      const sp = this.seatAt[i];
      this.toWorld(sp[0], sp[1], sp[2], _a);
      const gy = groundHeight(_a[0], _a[2]);
      const above = _a[1] - PELVIS_HEIGHT * h.scale * 0.92 - gy;
      K.v = above > 2.2 ? Math.min(5.5, (K.v || 0) + dt * 9) : Math.max(1.2, K.v - dt * 12);
      sp[1] -= K.v * dt;
      if (above <= 0.06) { this.release(h, false); h.mind?.ask('copHalt', 55, null, 0.4); }
    }
  }

  _leave(dt) {
    // straight up out of trouble, then away over the edge of the city
    if (!this.away) { const a = Math.atan2(this.x, this.z) + rand(-0.6, 0.6); this.away = { x: Math.sin(a) * 160, z: Math.cos(a) * 160 }; }
    const high = this.y < CRUISE_Y - 8;
    this._fly(dt, high ? this.x + this.vx * 0.5 : this.away.x, CRUISE_Y, high ? this.z + this.vz * 0.5 : this.away.z, null, high ? 6 : MAX_SPEED);
    if (Math.hypot(this.x, this.z) > 150) this.air.remove(this);
  }

  leave() {
    if (this.down || this.state === 'leave' || this.state === 'crash') return;
    // not with somebody on the end of a rope: the team goes down first, and then it goes
    if (this.state === 'dropping' && (this.phase === 'ropes' || this.phase === 'go')) return;
    this.state = 'leave'; this.stateT = 0;
    for (const r of this.ropes) r.out = false;
  }

  /** Coming down: no tail rotor to hold it, so it spins, and less and less lift. */
  _crash(dt) {
    const g = this.g;
    this.w = Math.min(4.5, (this.w || 0) * 0.98 + dt * 3);
    this.yaw += this.w * dt;
    this.vy -= 7.5 * dt;
    this.vx *= 1 - dt * 0.3; this.vz *= 1 - dt * 0.3;
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    this.pitch = damp(this.pitch, 0.25, 1.5, dt); this.roll = damp(this.roll, 0.4 * Math.sin(this.t * 2), 1.5, dt);
    this.spinRate = Math.max(8, this.spinRate - dt * 6);
    // anyone on a rope lets go
    for (let i = 1; i < this.seats.length; i++) if (this.seats[i] && this.seatKind[i].rope) this.release(this.seats[i], true);
    // what it hits: the ground, or the top of a building
    const gy = groundHeight(this.x, this.z);
    let roof = -Infinity;
    for (const b of g.city.buildings) if (this.x > b.x0 - 1 && this.x < b.x1 + 1 && this.z > b.z0 - 1 && this.z < b.z1 + 1) roof = Math.max(roof, KERB + b.h);
    if (this.y < gy + 0.2 || (roof > -Infinity && this.y < roof + 0.5) || this.stateT > 25) this._impact(Math.max(gy, roof > -Infinity && this.y < roof + 0.5 ? roof : gy));
  }

  /** It hits: the blast, whoever is still in it thrown out, and the burning wreck. */
  _impact(at) {
    const g = this.g;
    this.y = at;
    const spd = Math.hypot(this.vx, this.vz);
    for (const h of this.seats.slice()) {
      if (!h) continue;
      this.release(h, true);
      for (const b of h.bodies) { b.vx += rand(-4, 4); b.vy = rand(2, 6); b.vz += rand(-4, 4); }
      // a helicopter hitting the ground: few walk away from it (and it is down to whoever brought it down)
      if (this.lastBy) h.lastAttacker = this.lastBy;
      if (chance(0.7)) h.h.kill('Helicopter crash');
      else for (let k = 0; k < 3; k++) {
        const part = pick([P.CHEST, P.HEAD, P.ABDOMEN, P.PELVIS, P.THIGH_L, P.THIGH_R, P.UARM_L, P.UARM_R]), b = h.bodies[part];
        h.hit({ part, type: 'blunt', power: rand(2.5, 4.5), point: [b.px, b.py, b.pz], dir: [0, -1, 0], normal: [0, 1, 0], impulse: 5, attacker: this.lastBy || 'a crash', weapon: 'explosion' });
      }
    }
    this.down = true; this.wreck = true; this.downT = 0;
    this.vx = this.vy = this.vz = 0; this.w = 0;
    this.pitch = 0.18; this.roll = rand(-0.7, 0.7);
    this.spinRate = 0;
    this.rotor.rotation.z = 0.4; this.blur.visible = false;
    this.place();
    g.traffic?.blast(this.x, this.y + 1.2, this.z, 1.35, this.lastBy, null);
    if (g.fire) for (let k = 0; k < 8; k++) { const a = rand(TAU), r = rand(0.5, 3.5); g.fire.patch(this.x + Math.cos(a) * r, groundHeight(this.x, this.z) + 0.02, this.z + Math.sin(a) * r, rand(0.3, 0.6), rand(10, 20), this.lastBy); }
    // a wreck: blackened
    this.bodyMesh.material = _wreckMat; this.rotor.material = _wreckMat; this.tail.visible = false;
    for (const s of this.signs) s.visible = false;
    this.air.stats.crashed++;
    if (this.lastBy && this.lastBy.isPlayer) g.police?.raise(3, 'you brought down a police helicopter', { x: this.x, z: this.z }, { kind: 'heli', key: 'heli' + this.id });
    void spd;
  }

  _wrecked(dt) {
    const g = this.g;
    this.downT += dt;
    if (this.downT < 40) {
      const life = 1 - this.downT / 40;
      if (chance(dt * 10 * life)) { this.toWorld(rand(-0.6, 0.6), rand(0.8, 2), rand(-1.5, 1.5), _a); g.fire?.flameAt(_a[0], _a[1], _a[2], rand(0.4, 0.8)); }
      if (chance(dt * 6)) { this.toWorld(rand(-0.4, 0.4), 2.2, rand(-1, 1), _a); g.gore.puff('smoke', _a[0], _a[1], _a[2], rand(1, 1.8), rand(2.5, 4), 0.12, 0.115, 0.11); }
      this.toWorld(0, 1.5, 0, _a);
      g.lights?.ask('point', _a[0], _a[1] + 0.6, _a[2], 0xff8a3a, 18 * life + rand(0, 4), 12);
      g.audio?.loop('helifire' + this.id, 'fire', _a[0], _a[1], _a[2], 0.9 * life);
    }
    // long cold, and out of your sight: taken away
    const p = g.player;
    if (this.downT > 90 && Math.hypot(this.x - p.x, this.z - p.z) > 45) this.air.remove(this);
  }

  /* ------------------------------- ropes --------------------------------- */

  _ropes(dt) {
    const g = this.g;
    for (let k = this.ropes.length - 1; k >= 0; k--) {
      const r = this.ropes[k];
      this.toWorld(r.side * ROPE_DOOR, 1.92, r.z, _a);
      const full = Math.max(0.1, _a[1] - groundHeight(_a[0], _a[2]) - 0.1);
      r.len = r.out ? Math.min(full, r.len + dt * 14) : Math.max(0, r.len - dt * 9);
      if (!r.out && r.len <= 0.01) { g.boxes.release(r.idx); this.ropes.splice(k, 1); continue; }
      g.boxes.set(r.idx, _a[0], _a[1] - r.len / 2, _a[2], 0, 0, 0, 1, 0.035, r.len, 0.035);
    }
  }

  /* ------------------------------- show ---------------------------------- */

  _effects(dt) {
    const g = this.g;
    this.spin += this.spinRate * dt;
    this.rotor.rotation.y = this.spin;
    this.tailSpin += this.spinRate * 4.7 * dt;
    this.tail.rotation.x = this.tailSpin;
    // the beacon flashes
    const on = Math.floor(this.t * 1.6) % 2 === 0 && (this.t * 1.6) % 1 < 0.25;
    this.beacon.material.color.setHex(on ? 0xff3a3a : 0x3a0808);
    // the noise of it
    g.audio?.loop('rotor' + this.id, 'rotor', this.x, this.y + 2, this.z, this.state === 'crash' ? 3.2 : 4.5);
    // close to the ground, the downwash raises the dust
    const gy = groundHeight(this.x, this.z), up = this.y - gy;
    if (up < 18 && chance(dt * 14 * (1 - up / 18))) {
      const a = rand(TAU), r = rand(1, 5);
      g.gore.puff('smoke', this.x + Math.cos(a) * r, gy + 0.3, this.z + Math.sin(a) * r, rand(1.0, 2.2), rand(0.8, 1.4), 0.72, 0.68, 0.6);
    }
    // hurt: smoke from the engine, thin then thick; then fire
    if (this.hp < 55 && chance(dt * (this.hp < 25 ? 16 : 7))) {
      this.toWorld(rand(-0.3, 0.3), 2.4, -0.6, _a);
      const c = this.hp < 25 ? 0.15 : 0.55;
      g.gore.puff('smoke', _a[0], _a[1], _a[2], rand(0.8, 1.5), rand(1.8, 2.8), c, c, c * 0.98);
    }
    if ((this.hp < 15 || this.state === 'crash') && chance(dt * 12)) { this.toWorld(rand(-0.3, 0.3), 2.3, rand(-1.2, -0.2), _a); g.fire?.flameAt(_a[0], _a[1], _a[2], rand(0.35, 0.6)); }
    // at night, the searchlight on you
    const night = g.daylight && g.daylight.mode !== 'day';
    const T = this.target;
    if (night && T && (this.state === 'orbit' || this.state === 'dropping' || this.state === 'inbound')) {
      this.toWorld(0, 0.2, 2.1, _a);
      const ty = groundHeight(T.x, T.z) + 0.5, dx = T.x - _a[0], dy = ty - _a[1], dz = T.z - _a[2], d = Math.hypot(dx, dy, dz) || 1;
      g.lights?.ask('spot', _a[0], _a[1], _a[2], 0xfff6e0, 120, Math.min(120, d + 20), dx / d, dy / d, dz / d, 3);
      this.beam.visible = true;
      this.beam.position.set(_a[0], _a[1], _a[2]);
      _v.set(-dx / d, -dy / d, -dz / d);
      this.beam.quaternion.setFromUnitVectors(_up, _v);
      this.beam.scale.set(1, d, 1);
    } else this.beam.visible = false;
  }

  /* ------------------------------- shots --------------------------------- */

  /** A ray against it: roughly its fuselage and boom. Returns the distance, or -1. */
  ray(ox, oy, oz, dx, dy, dz, maxT) {
    const o = this.toLocal(ox, oy, oz, _a);
    // directions into its space: the inverse turn only
    const q = this.group.quaternion, qx = -q.x, qy = -q.y, qz = -q.z, qw = q.w;
    const tx = 2 * (qy * dz - qz * dy), ty = 2 * (qz * dx - qx * dz), tz = 2 * (qx * dy - qy * dx);
    const lx = dx + qw * tx + (qy * tz - qz * ty), ly = dy + qw * ty + (qz * tx - qx * tz), lz = dz + qw * tz + (qx * ty - qy * tx);
    let best = -1;
    for (const B of BOXES) {
      let t0 = 0, t1 = maxT;
      for (let k = 0; k < 3; k++) {
        const oo = o[k], dd = k === 0 ? lx : k === 1 ? ly : lz, lo = B[k] - B[k + 3], hi = B[k] + B[k + 3];
        if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) { t0 = Infinity; break; } continue; }
        let a = (lo - oo) / dd, b = (hi - oo) / dd;
        if (a > b) { const s = a; a = b; b = s; }
        if (a > t0) t0 = a; if (b < t1) t1 = b;
        if (t0 > t1) break;
      }
      if (t0 <= t1 && t0 < maxT && (best < 0 || t0 < best)) best = t0;
    }
    return best;
  }

  /** A round (or a blast) hits it. */
  hurt(amount, by, x, y, z) {
    if (this.down) return;
    const g = this.g;
    this.hp -= amount;
    if (by) this.lastBy = by;
    this.air.stats.hits++;
    g.gore.puff('flash', x, y, z, 0.18, 0.05, 1, 0.88, 0.6);
    g.audio?.at(chance(0.5) ? 'clang' : 'ricochet', x, y, z, 0.8);
    // the crew know they are being shot at
    for (const h of this.seats) if (h && h.mind && by && h.h.alive) { h.mind.stir('fear', 6); const k = h.mind._know(by); k.hostile = 1; k.hurtMe = true; }
  }
}

/**
 * Its shape for rounds: centre and half sizes, in its own space. The doors are open: a round through one goes into
 * the cabin, at whoever is sitting there (the cockpit, the belly, the roof, the back wall, the boom, the engine, the fin).
 */
const BOXES = [[0, 1.25, 1.6, 0.76, 0.75, 0.95], [0, 0.5, 0.35, 0.75, 0.14, 2.0], [0, 1.97, -0.2, 0.75, 0.06, 0.85], [0, 1.3, -1.45, 0.65, 0.65, 0.45],
  [0, 1.5, -3.6, 0.26, 0.26, 2.4], [0, 2.2, -0.25, 0.48, 0.22, 0.9], [0, 2.15, -5.75, 0.06, 0.6, 0.4]];
const _wreckMat = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x3a3634 });

/* -------------------------------- the lot ---------------------------------- */

export class Air {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.stats = { sent: 0, downed: 0, crashed: 0, hits: 0, roped: 0, left: 0, shots: 0 };
  }

  /** A helicopter of that kind, crewed, coming in from the edge of the city, high. */
  spawn(kind = 'gunner', from = null) {
    const g = this.g;
    if (!g.spawnOfficer || !g.spawnSwat) return null;
    const p = g.player;
    const a = from != null ? from : rand(TAU);
    const x = p.x + Math.sin(a) * 120, z = p.z + Math.cos(a) * 120;
    const hl = new Heli(this, kind, clamp(x, -150, 150), CRUISE_Y, clamp(z, -150, 150), a + Math.PI);
    hl.theta = a;
    this.list.push(hl);
    // the pilot, and the team
    const pilot = g.spawnOfficer(hl.x, hl.z, hl.yaw);
    pilot.pilot = true;
    this._seat(pilot, hl, 0);
    for (let i = 1; i < hl.seats.length; i++) {
      const h = g.spawnSwat(hl.x, hl.z, hl.yaw);
      h.heliTeam = true;
      this._seat(h, hl, i);
      // the door gunners with their rifles out
      if (kind === 'gunner') { const r = (h.kit || []).find((it) => it.def.rifle); if (r && g.weapons) g.weapons.draw(h, r); }
    }
    this.stats.sent++;
    return hl;
  }

  _seat(h, hl, i) {
    hl.seats[i] = h;
    h.enterCar(hl, i, true);
  }

  remove(hl) {
    const g = this.g, i = this.list.indexOf(hl);
    if (i < 0) return;
    for (const h of hl.seats) if (h) { hl.seats[hl.seats.indexOf(h)] = null; h.car = null; h.seat = -1; g.removeHuman(h); }
    hl.dispose();
    hl.removed = true;
    this.list.splice(i, 1);
    if (!hl.down) this.stats.left++;
  }

  clear() { for (const hl of this.list.slice()) this.remove(hl); }

  update(dt) {
    const g = this.g, p = g.player, P = g.police;
    for (const hl of this.list.slice()) hl.update(dt);
    // whoever is up there sees you, unless a building is between
    if (!P || !p || !P.wanted) return;
    const c = p.bodies[P0];
    for (const hl of this.list) {
      if (hl.down || hl.state === 'crash') continue;
      hl.seen += dt;
      hl.lookT = (hl.lookT || 0) - dt;
      if (hl.lookT > 0) continue;
      hl.lookT = 0.25;
      const spotter = hl.seats.find((h) => h && h.h.alive && h.h.conscious && h.mind);
      if (!spotter) continue;
      const dx = c.px - hl.x, dy = c.py - (hl.y + 0.3), dz = c.pz - hl.z, d = Math.hypot(dx, dy, dz);
      if (d > 115) continue;
      const t = g.world.rayWorld(hl.x, hl.y + 0.3, hl.z, dx / d, dy / d, dz / d, d - 0.6);
      if (t >= 0) continue;
      hl.seen = 0;
      P.spotted(spotter);
    }
  }

  /** A round's path against every helicopter but `skip` (the one the shooter is in). Nearest hit, or null. */
  ray(ox, oy, oz, dx, dy, dz, far, skip = null) {
    let best = null;
    for (const hl of this.list) {
      if (hl === skip) continue;
      const ex = hl.x - ox, ey = hl.y + 1.2 - oy, ez = hl.z - oz, along = ex * dx + ey * dy + ez * dz;
      if (along < -8 || along > far + 8 || ex * ex + ey * ey + ez * ez - along * along > 64) continue;
      const t = hl.ray(ox, oy, oz, dx, dy, dz, far);
      if (t >= 0 && t < far && (!best || t < best.t)) best = { t, heli: hl };
    }
    return best;
  }

  /** A round hits one: what it does is in Heli.hurt. */
  shot(hl, power, by, x, y, z, rifle = false) {
    this.stats.shots++;
    hl.hurt(power * (rifle ? 2.6 : 2.1), by, x, y, z);
  }

  /** A blast near them: the closer, the worse. */
  blast(x, y, z, power, by) {
    for (const hl of this.list) {
      const d = Math.hypot(hl.x - x, hl.y + 1.2 - y, hl.z - z);
      if (d < 9 * power) hl.hurt(60 * power * (1 - d / (9 * power)), by, hl.x, hl.y + 1, hl.z);
    }
  }

  /**
   * What the crew are doing (their Brain hands over to this while they are aboard): the pilot flies; the door
   * gunners shoot at you when you are on their side and in sight; the team on the benches wait for the ropes.
   */
  crew(h, brain, dt) {
    const g = this.g, hl = h.car, m = h.mind, K = hl.seatKind[h.seat] || {};
    h.intent.face = null;
    if (K.pilot) { if (m) m.doing = hl.state === 'crash' ? 'fighting the controls of a falling helicopter' : 'flying the police helicopter'; h.aimYaw = null; return; }
    if (K.rope) { if (m) m.doing = 'sliding down a rope from the helicopter'; h.aimYaw = null; return; }
    if (!K.gun) { if (m) m.doing = hl.state === 'dropping' ? 'about to go down the rope' : 'riding in the police helicopter, waiting to go down the ropes'; h.aimYaw = null; return; }
    if (m) m.doing = 'in the helicopter\'s open door, with a rifle';
    const Pz = g.police, p = g.player, W = g.weapons, e = h.weapon;
    if (!Pz || !Pz.wanted || !p.h.alive || !e || !e.def.gun || hl.state === 'crash') { h.aimYaw = null; h.aimPitch = -0.4; brain.aimT = 0; return; }
    const c = p.bodies[P0], head = h.bodies[P.HEAD];
    const ex = head.px, ey = head.py, ez = head.pz;
    const dx = c.px - ex, dy = c.py - ey, dz = c.pz - ez, d = Math.hypot(dx, dy, dz);
    // only out of their own door, and only what they can see
    const rel = wrapAngle(Math.atan2(dx, dz) - h.yaw);
    const clear = d < 90 && Math.abs(rel) < 1.45 && g.world.rayWorld(ex, ey, ez, dx / d, dy / d, dz / d, d - 0.5) < 0;
    if (!clear) { h.aimYaw = null; h.aimPitch = -0.4; brain.aimT = 0; return; }
    h.aimYaw = Math.atan2(dx, dz); h.aimPitch = Math.atan2(dy, Math.hypot(dx, dz));
    brain.aimT = (brain.aimT || 0) + dt;
    // bursts, with a breath between them
    brain.burstT = (brain.burstT || 0) - dt;
    if (brain.aimT < 0.8 || brain.burstT > 0) return;
    if (brain.burst == null || brain.burst <= 0) brain.burst = 3 + ((Math.random() * 3) | 0);
    const lead = 0.12;
    // (steady hands, braced in a doorway: S.W.A.T. marksmen, on a platform that does not keep still)
    if (W.npcFire(h, [c.px + (p.car ? p.car.vx : p.vx) * lead, c.py + rand(-0.15, 0.1), c.pz + (p.car ? p.car.vz : p.vz) * lead], 0.8)) {
      brain.burst--;
      if (brain.burst <= 0) brain.burstT = rand(0.7, 1.4);
      if (!brain.firedAt) { brain.firedAt = true; m?.ask('copFire', 66, null, rand(0.2, 0.6)); }
    }
  }
}

const P0 = P.CHEST;
