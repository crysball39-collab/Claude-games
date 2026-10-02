/* =============================================================================
   Dark Legacy: the Shadow Mutant.

   Something lives under the ground by the tower. Walk past the tower and it
   comes up: a tall man-shape, completely black, hairless, with white eyes
   that have no pupils, black claws where its fingers should be, six
   tentacles growing out of its back, and black fog coming off it all the
   time.

   Five attacks, each with a tell, each one you can get out of the way of:

     Dark Spikes        a dark ring under your feet, then spikes up out of
                        the ground through it, then back down
     Tentacle Stab      one tentacle draws back, then shoots out at where
                        you were standing
     Tentacle Barrage   all six, one after another, each aimed fresh
     Mutant Summon      arms up, and five Mutants pull themselves out
                        of the ground round it
     Slam               it kneels, raises both fists, and brings them down:
                        a blast round it and a ring of spikes running out
                        across the ground. Jump the ring.

   5000 HP. Bullets, blades, fists, fire and thrown things all hurt it.
   ========================================================================== */
import {
  Group, Mesh, BoxGeometry, SphereGeometry, ConeGeometry, CylinderGeometry, RingGeometry,
  MeshLambertMaterial, MeshBasicMaterial, AdditiveBlending, DoubleSide, PointLight,
  Vector3, Quaternion,
} from 'three';
import { STATE } from './character.js';
import { softGlowMaterial } from './fx.js';
import { spawnZombie } from './zombie.js';
import { clamp, clamp01, lerp, damp, makeRng } from '../core/util.js';

const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3(), _v4 = new Vector3();
const _q = new Quaternion();
const UP = new Vector3(0, 1, 0);

/** Dark Spikes: how long the ring follows you, how long it warns, and how big it is. */
export const SPIKES = { track: 0.5, warn: 0.8, after: 0.45, radius: 1.3 };

export const SHADOW = {
  name: 'SHADOW MUTANT',
  hp: 5000,
  walk: 3.0,
  turn: 3.2,
  reach: 14,          // furthest a tentacle stretches
  minions: 5,         // how many Mutants one summon raises
  dmg: { spikes: 18, stab: 22, barrage: 9, slam: 26, wave: 15 },
};

/* -------------------------------------------------------------------------- */
/*                                  the model                                 */
/* -------------------------------------------------------------------------- */

function buildModel() {
  const skin = new MeshLambertMaterial({ color: 0x0b0b0f, emissive: 0x05050a });
  const claw = new MeshLambertMaterial({ color: 0x010102 });
  const eyeMat = new MeshBasicMaterial({ color: 0xffffff });
  const eyeGlow = softGlowMaterial(0xe8f0ff, 0.9, 1.8);
  const mats = [skin, claw, eyeMat, eyeGlow];
  const geos = [];
  const box = (w, h, d) => { const g = new BoxGeometry(w, h, d); geos.push(g); return g; };
  const mesh = (g, m, x = 0, y = 0, z = 0) => {
    const o = new Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    return o;
  };

  const root = new Group();
  const hips = new Group(); hips.position.y = 1.18; root.add(hips);
  hips.add(mesh(box(0.42, 0.24, 0.26), skin));

  // legs: thigh, knee, shin, foot - long and thin, slightly bowed
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new Group(); hip.position.set(s * 0.15, -0.08, 0); hips.add(hip);
    hip.add(mesh(box(0.17, 0.58, 0.19), skin, 0, -0.29, 0));
    const knee = new Group(); knee.position.set(0, -0.58, 0); hip.add(knee);
    knee.add(mesh(box(0.14, 0.56, 0.15), skin, 0, -0.28, 0.02));
    const ankle = new Group(); ankle.position.set(0, -0.56, 0.02); knee.add(ankle);
    ankle.add(mesh(box(0.15, 0.08, 0.32), skin, 0, -0.03, -0.08));
    for (let i = 0; i < 3; i++) {
      const c = mesh(new ConeGeometry(0.022, 0.12, 5), claw, (i - 1) * 0.045, -0.04, -0.28);
      c.rotation.x = -Math.PI / 2;
      geos.push(c.geometry);
      ankle.add(c);
    }
    legs.push({ hip, knee, ankle, side: s });
  }

  // the body: a narrow waist, a broad chest
  const spine = new Group(); spine.position.y = 0.1; hips.add(spine);
  spine.add(mesh(box(0.36, 0.42, 0.24), skin, 0, 0.21, 0));
  const chest = new Group(); chest.position.y = 0.42; spine.add(chest);
  chest.add(mesh(box(0.62, 0.42, 0.34), skin, 0, 0.2, 0));
  chest.add(mesh(box(0.5, 0.12, 0.3), skin, 0, -0.02, 0));
  const neck = new Group(); neck.position.y = 0.42; chest.add(neck);
  neck.add(mesh(box(0.13, 0.14, 0.13), skin, 0, 0.07, 0));
  const head = new Group(); head.position.y = 0.14; neck.add(head);
  head.add(mesh(box(0.25, 0.32, 0.28), skin, 0, 0.15, 0));
  head.add(mesh(box(0.2, 0.08, 0.22), skin, 0, 0.0, -0.02));      // the jaw, narrower
  // the eyes: white, no pupils, and lit from inside
  const eyes = [];
  const eyeGeo = new SphereGeometry(1, 10, 8); geos.push(eyeGeo);
  for (const s of [-1, 1]) {
    const e = new Mesh(eyeGeo, eyeMat);
    e.scale.set(0.038, 0.019, 0.012);
    e.position.set(s * 0.064, 0.18, -0.142);
    e.rotation.z = s * -0.25;
    head.add(e);
    const g = new Mesh(eyeGeo, eyeGlow);
    g.scale.setScalar(0.09);
    g.position.copy(e.position);
    g.renderOrder = 9;
    head.add(g);
    eyes.push(e, g);
  }

  // arms ending in claws
  const arms = [];
  for (const s of [-1, 1]) {
    const shoulder = new Group(); shoulder.position.set(s * 0.37, 0.33, 0); chest.add(shoulder);
    shoulder.add(mesh(box(0.13, 0.56, 0.14), skin, 0, -0.28, 0));
    const elbow = new Group(); elbow.position.set(0, -0.56, 0); shoulder.add(elbow);
    elbow.add(mesh(box(0.11, 0.54, 0.12), skin, 0, -0.27, 0));
    const hand = new Group(); hand.position.set(0, -0.54, 0); elbow.add(hand);
    hand.add(mesh(box(0.12, 0.12, 0.07), skin, 0, -0.05, 0));
    for (let i = 0; i < 4; i++) {
      const c = mesh(new ConeGeometry(0.018, 0.26, 5), claw, (i - 1.5) * 0.03, -0.22, -0.01 + Math.abs(i - 1.5) * 0.01);
      c.rotation.x = Math.PI;
      c.rotation.z = (i - 1.5) * 0.08;
      geos.push(c.geometry);
      hand.add(c);
    }
    arms.push({ shoulder, elbow, hand, side: s });
  }

  /* The six tentacles: roots on the back of the chest, each a chain of
     segments placed in the world every frame, so they can wave or reach
     anywhere without belonging to any bone. */
  const tentGroup = new Group();
  const segGeo = new CylinderGeometry(1, 1, 1, 6); geos.push(segGeo);
  const tipGeo = new ConeGeometry(1, 1, 6); geos.push(tipGeo);
  const tentacles = [];
  const roots = [[-0.14, 0.32], [0.14, 0.32], [-0.22, 0.14], [0.22, 0.14], [-0.15, -0.02], [0.15, -0.02]];
  for (let i = 0; i < 6; i++) {
    const n = 12;
    const segs = [];
    for (let k = 0; k < n; k++) {
      const m = new Mesh(k === n - 1 ? tipGeo : segGeo, k === n - 1 ? claw : skin);
      m.castShadow = true;
      m.matrixAutoUpdate = false;
      tentGroup.add(m);
      segs.push(m);
    }
    tentacles.push({
      i, segs, root: new Vector3(roots[i][0], roots[i][1], 0.17),
      pts: Array.from({ length: n + 1 }, () => new Vector3()),
      // for attacks: 0 = waving, 1 = fully out at `target`
      reach: 0, target: new Vector3(), draw: 0, phase: i * 1.7,
      side: roots[i][0] < 0 ? -1 : 1, up: roots[i][1],
    });
  }
  return { root, hips, spine, chest, neck, head, legs, arms, tentGroup, tentacles, eyes, eyeGlow, mats, geos };
}

/** Puts a unit cylinder between two points. */
function placeSegment(m, a, b, r0, r1) {
  _v1.subVectors(b, a);
  const len = _v1.length();
  if (len < 1e-5) { m.visible = false; return; }
  m.visible = true;
  _q.setFromUnitVectors(UP, _v1.multiplyScalar(1 / len));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.copy(_q);
  const r = (r0 + r1) / 2;
  m.scale.set(r, len, r);
  m.updateMatrix();
}

/* -------------------------------------------------------------------------- */
/*                                  the boss                                  */
/* -------------------------------------------------------------------------- */

export class ShadowMutant {
  constructor(game, at) {
    this.game = game;
    this.rng = makeRng(0x5ad0);
    this.m = buildModel();
    game.scene.add(this.m.root);
    game.scene.add(this.m.tentGroup);
    this.light = new PointLight(0xc8d4ff, 0, 5, 1.8);
    game.scene.add(this.light);

    this.home = at.clone();
    this.pos = at.clone();
    this.vel = new Vector3();
    this.yaw = 0;
    this.hp = SHADOW.hp;
    this.maxHp = SHADOW.hp;
    this.state = 'dormant';
    this.t = 0;
    this.rise = 0;           // 0 under the ground, 1 standing on it
    this.visible = false;
    this.center = new Vector3();
    this.flash = 0;
    this.cooldown = { spikes: 2, stab: 1.5, barrage: 6, summon: 9, slam: 7 };
    this.pose = { kneel: 0, armsUp: 0, slam: 0, roar: 0, lean: 0, walk: 0 };
    this.cur = { ...this.pose };
    this.walkPhase = 0;
    this.volumes = [];
    this.minions = [];
    this.thrownHit = new WeakMap();

    this._buildEffects();
    this.setVisible(false);
  }

  _buildEffects() {
    const scene = this.game.scene;
    // the spikes: a pool of tall black cones that come up through the ground
    this.spikeGeo = new ConeGeometry(0.22, 1.9, 6);
    this.spikeGeo.translate(0, 0.95, 0);
    this.spikeMat = new MeshLambertMaterial({ color: 0x0a0810, emissive: 0x08020e });
    this.spikes = [];
    for (let i = 0; i < 80; i++) {
      const m = new Mesh(this.spikeGeo, this.spikeMat);
      m.visible = false;
      m.castShadow = true;
      scene.add(m);
      this.spikes.push({ m, t: 0, life: 0, x: 0, z: 0, y: 0, h: 1, active: false });
    }
    // the tell under your feet: a dark violet ring filling in
    const ringGeo = new RingGeometry(0.82, 1, 40); ringGeo.rotateX(-Math.PI / 2);
    const fillGeo = new RingGeometry(0, 1, 40); fillGeo.rotateX(-Math.PI / 2);
    this.markGeos = [ringGeo, fillGeo];
    this.marks = [];
    for (let i = 0; i < 4; i++) {
      const ringMat = new MeshBasicMaterial({ color: 0x9a40ff, transparent: true, opacity: 0,
        blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
      const fillMat = new MeshBasicMaterial({ color: 0x30084a, transparent: true, opacity: 0,
        depthWrite: false, side: DoubleSide });
      const ring = new Mesh(ringGeo, ringMat), fill = new Mesh(fillGeo, fillMat);
      ring.renderOrder = 7; fill.renderOrder = 6;
      ring.visible = fill.visible = false;
      scene.add(ring, fill);
      this.marks.push({ ring, fill, on: false });
    }
  }

  setVisible(v) {
    this.visible = v;
    this.m.root.visible = v;
    this.m.tentGroup.visible = v;
  }

  get player() { return this.game.player; }
  forward(out) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  /* -------------------------------- frame -------------------------------- */

  update(dt) {
    if (this.state === 'gone') { this._updateSpikes(dt); return; }
    this.t += dt;
    for (const k of Object.keys(this.cooldown)) this.cooldown[k] = Math.max(0, this.cooldown[k] - dt);
    this.flash = Math.max(0, this.flash - dt * 4);
    this.minions = this.minions.filter((z) => !z.dead && this.game.characters.includes(z));

    switch (this.state) {
      case 'dormant': break;
      case 'emerge': this._emerge(dt); break;
      case 'roar': this._roar(dt); break;
      case 'idle': this._idle(dt); break;
      case 'chase': this._chase(dt); break;
      case 'spikes': this._spikesAttack(dt); break;
      case 'stab': this._stab(dt); break;
      case 'barrage': this._barrage(dt); break;
      case 'summon': this._summon(dt); break;
      case 'slam': this._slam(dt); break;
      case 'recover': this._recover(dt); break;
      case 'dying': this._dying(dt); break;
      default: break;
    }
    this._updateSpikes(dt);
    if (this.visible) {
      this._animate(dt);
      this._fog(dt);
      if (this.rise > 0.9 && this.state !== 'dying') { this._shove(); this._thrownObjects(); }
    }
  }

  _setState(s) { this.state = s; this.t = 0; }

  _face(x, z, dt, rate = SHADOW.turn) {
    const want = Math.atan2(-(x - this.pos.x), -(z - this.pos.z));
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += clamp(d, -rate * dt, rate * dt);
    return Math.abs(d);
  }

  floorY(x = this.pos.x, z = this.pos.z) {
    const f = this.game.world.floorAt(x, z, this.pos.y + 1.2);
    return Number.isFinite(f) ? f : 0;
  }

  /** Walkable for him: dry ground, inside the walls. */
  _canStand(x, z) {
    const w = this.game.world, half = this.game.map.half - 3;
    if (Math.abs(x) > half || Math.abs(z) > half - 8) return false;
    if (!w.hasGroundAt(x, z)) return false;
    return true;
  }

  _move(dt) {
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    if (this._canStand(nx, nz)) { this.pos.x = nx; this.pos.z = nz; } else this.vel.set(0, 0, 0);
    this.pos.y = damp(this.pos.y, this.floorY() - (1 - this.rise) * 2.9, 12, dt);
  }

  /* ------------------------------ coming up ------------------------------ */

  startEmerge() {
    this.setVisible(true);
    this.rise = 0;
    this.pos.y = this.floorY() - 2.9;
    this._setState('emerge');
  }

  _emerge(dt) {
    this.rise = Math.min(1, this.rise + dt / 2.6);
    this.pose = { kneel: 0.6 * (1 - this.rise), armsUp: 0.3, slam: 0, roar: 0, lean: 0.25 * (1 - this.rise), walk: 0 };
    this._face(this.player.pos.x, this.player.pos.z, dt, 1.2);
    this._move(dt);
    const fx = this.game.fx;
    if (fx) {
      fx.darkFog(_v1.set(this.pos.x, this.floorY() + 0.2, this.pos.z), { count: 2, spread: 2.0, size: 1.3, up: 0.6 });
      if (this.rng() < dt * 10) fx.sparks(_v1, null, { count: 2, speed: 3, life: 0.5 });
    }
    this.game.shake = Math.min(0.5, this.game.shake + dt * 0.8);
  }

  startRoar() { this.rise = 1; this._setState('roar'); }

  _roar(dt) {
    const k = clamp01(this.t / 0.5) * (1 - clamp01((this.t - 1.8) / 0.4));
    this.pose = { kneel: 0, armsUp: 0.15, slam: 0, roar: k, lean: -0.15 * k, walk: 0 };
    this._move(dt);
    this.game.shake = Math.min(0.9, this.game.shake + dt * 2 * k);
    if (this.game.fx && this.rng() < dt * 12) {
      this.game.fx.darkFog(this.headPos(_v1), { count: 2, spread: 0.4, size: 0.8, up: 1.2 });
    }
  }

  wake() {
    this.rise = 1;
    this.setVisible(true);
    this.pos.y = this.floorY();
    this._setState('idle');
  }

  /* ------------------------------- thinking ------------------------------- */

  _rest() { return { kneel: 0, armsUp: 0, slam: 0, roar: 0, lean: 0.05, walk: 0 }; }

  _idle(dt) {
    this.pose = this._rest();
    this.vel.multiplyScalar(Math.exp(-6 * dt));
    this._move(dt);
    if (this.t > 0.5) this._setState('chase');
  }

  _recover(dt) {
    this.pose = this._rest();
    this.vel.multiplyScalar(Math.exp(-6 * dt));
    this._move(dt);
    this._face(this.player.pos.x, this.player.pos.z, dt, SHADOW.turn * 0.6);
    if (this.t > this.recoverFor) this._setState('chase');
  }

  _chase(dt) {
    const p = this.player;
    this.pose = this._rest();
    _v1.set(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z);
    const dist = _v1.length();
    this._face(p.pos.x, p.pos.z, dt);
    let want = 0;
    if (dist > 9) want = 1;
    else if (dist < 3.2) want = -0.5;
    if (dist > 1e-3) _v1.multiplyScalar(1 / dist);
    this.vel.x = damp(this.vel.x, _v1.x * want * SHADOW.walk, 3, dt);
    this.vel.z = damp(this.vel.z, _v1.z * want * SHADOW.walk, 3, dt);
    this.pose.walk = clamp01(Math.hypot(this.vel.x, this.vel.z) / SHADOW.walk);
    this._move(dt);
    if (p.dead || this.t < 0.6) return;
    const pick = this._pick(dist);
    if (pick) this._start(pick);
  }

  _pick(dist) {
    const c = this.cooldown, o = [];
    if (c.spikes <= 0 && dist > 2.5) o.push(['spikes', dist > 8 ? 3 : 2]);
    if (c.stab <= 0 && dist > 2 && dist < SHADOW.reach - 1) o.push(['stab', 3]);
    if (c.barrage <= 0 && dist > 2 && dist < SHADOW.reach - 2) o.push(['barrage', 2]);
    // a fresh summon only once every Mutant from the last one is dead
    if (c.summon <= 0 && this.minions.length === 0) o.push(['summon', 1.5]);
    if (c.slam <= 0 && dist < 11) o.push(['slam', dist < 3.5 ? 5 : 1.8]);
    if (!o.length) return null;
    let total = 0;
    for (const x of o) total += x[1];
    let r = this.rng() * total;
    for (const x of o) { r -= x[1]; if (r <= 0) return x[0]; }
    return o[0][0];
  }

  _start(name) {
    this._setState(name);
    this.vel.set(0, 0, 0);
    this.step = 0;
    this.hitDone = false;
    if (name === 'stab') this.tent = this.m.tentacles[(this.rng() * 6) | 0];
    if (name === 'barrage') this.order = [0, 3, 1, 4, 2, 5];
    if (name === 'spikes') this.casts = 0;
  }

  _end(name, recover) {
    this.cooldown[name] = { spikes: 5, stab: 3.5, barrage: 10, summon: 22, slam: 11 }[name];
    for (const k of Object.keys(this.cooldown)) this.cooldown[k] = Math.max(this.cooldown[k], 1.0);
    for (const tt of this.m.tentacles) { tt.reach = 0; tt.draw = 0; }
    this.recoverFor = recover;
    this._setState('recover');
  }

  /* ------------------------------ Dark Spikes ----------------------------- */
  /* Three casts. For each: a ring under you that follows you for half a
     second, stops, fills for a beat, and then the spikes come up through
     it. Stand still and you are on them. */

  _spikesAttack(dt) {
    const p = this.player;
    this.pose = { ...this._rest(), armsUp: 0.45, lean: 0.2 };
    this._face(p.pos.x, p.pos.z, dt);
    this._move(dt);
    /* The ring follows you for half a second, then stops where you are and
       fills for most of a second before the spikes come up. Walking is
       enough to get out of it in that time; only what is inside the ring
       when they come up is hit. */
    const S = SPIKES;
    const cast = S.track + S.warn + S.after;
    const k = this.t - this.casts * cast;
    const mark = this.marks[this.casts % this.marks.length];
    if (k < S.track) {
      this.spot = this.spot || new Vector3();
      this.spot.set(p.pos.x, this.floorY(p.pos.x, p.pos.z), p.pos.z);
      this._mark(mark, this.spot, S.radius, 0);
    } else if (k < S.track + S.warn) {
      this._mark(mark, this.spot, S.radius, (k - S.track) / S.warn);
    } else if (!this.hitDone) {
      this.hitDone = true;
      this._hideMark(mark);
      this._erupt(this.spot, S.radius, SHADOW.dmg.spikes);
    } else if (k >= cast) {
      this.casts++;
      this.hitDone = false;
      if (this.casts >= 3) this._end('spikes', 0.8);
    }
  }

  _mark(mk, at, radius, k) {
    mk.on = true;
    mk.ring.visible = mk.fill.visible = true;
    mk.ring.position.set(at.x, at.y + 0.04, at.z);
    mk.fill.position.set(at.x, at.y + 0.035, at.z);
    mk.ring.scale.setScalar(radius);
    mk.fill.scale.setScalar(radius * clamp01(k));
    mk.ring.material.opacity = 0.55 + Math.sin(this.game.time * 22) * 0.2;
    mk.fill.material.opacity = 0.55;
  }

  _hideMark(mk) {
    mk.on = false;
    mk.ring.visible = mk.fill.visible = false;
  }

  /** A cluster of spikes up out of the ground, and whatever is over them is hit. */
  _erupt(at, radius, damage, { count = 7, ring = false, h = 1.0 } = {}) {
    const g = this.game;
    const pts = [];
    if (ring) {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        pts.push([at.x + Math.cos(a) * radius, at.z + Math.sin(a) * radius]);
      }
    } else {
      pts.push([at.x, at.z]);
      for (let i = 0; i < count - 1; i++) {
        const a = (i / (count - 1)) * Math.PI * 2 + this.rng() * 0.4;
        const r = radius * (0.45 + this.rng() * 0.45);
        pts.push([at.x + Math.cos(a) * r, at.z + Math.sin(a) * r]);
      }
    }
    for (const [x, z] of pts) this._spike(x, z, h * (0.8 + this.rng() * 0.5));
    g.fx?.darkFog(_v1.set(at.x, at.y + 0.2, at.z), { count: 6, spread: radius * 0.8, size: 1.1, up: 1 });
    g.shake = Math.min(0.6, g.shake + 0.15);
    if (ring) return;
    for (const c of g.characters) {
      if (c.isZombie || c.dead || c.body?.destroyed) continue;
      const dx = c.pos.x - at.x, dz = c.pos.z - at.z;
      if (dx * dx + dz * dz > radius * radius) continue;
      const feet = c.pos.y - 0.945;
      if (feet > at.y + 0.7) continue;            // jumped it
      this._hurt(c, damage, _v2.set(dx * 20, 260, dz * 20), 'lowerTorso', 'hole');
    }
  }

  _spike(x, z, h) {
    const s = this.spikes.find((q) => !q.active) || this.spikes[0];
    s.active = true;
    s.x = x; s.z = z; s.y = this.floorY(x, z); s.h = h;
    s.t = 0; s.life = 1.0;
    s.m.visible = true;
    s.m.rotation.set((this.rng() - 0.5) * 0.25, this.rng() * 6, (this.rng() - 0.5) * 0.25);
  }

  _updateSpikes(dt) {
    for (const s of this.spikes) {
      if (!s.active) continue;
      s.t += dt;
      // up in a tenth of a second, held, back down
      const up = s.t < 0.1 ? s.t / 0.1 : s.t < 0.62 ? 1 : 1 - (s.t - 0.62) / 0.38;
      if (up <= 0 && s.t > 0.62) { s.active = false; s.m.visible = false; continue; }
      const k = clamp01(up);
      s.m.position.set(s.x, s.y - 1.9 * s.h * (1 - k), s.z);
      s.m.scale.set(1, s.h, 1);
    }
  }

  _hurt(c, damage, force, bone = 'midTorso', wound = null) {
    const b = c.rig.byName[bone];
    c.applyImpact(b ? b.worldPos.clone() : c.center.clone(), force, {
      boneName: bone, damage, type: 'impact', severity: clamp01(damage / 30), wound,
    });
  }

  /* ----------------------------- Tentacle Stab ---------------------------- */

  _stab(dt) {
    const p = this.player, tt = this.tent;
    this.pose = { ...this._rest(), lean: 0.2 };
    this._face(p.pos.x, p.pos.z, dt);
    this._move(dt);
    const t = this.t;
    if (t < 0.6) {
      tt.draw = clamp01(t / 0.5);                  // drawn back
      this._lockOn(tt, 0.2);
    } else if (t < 0.8) {
      tt.draw = 0;
      tt.reach = clamp01((t - 0.6) / 0.16);
      if (tt.reach >= 1 && !this.hitDone) { this.hitDone = true; this._tentacleHit(tt, SHADOW.dmg.stab, 180); }
    } else if (t < 1.4) {
      tt.reach = 1 - clamp01((t - 1.0) / 0.4);
    } else {
      this._end('stab', 0.6);
    }
  }

  /** Where a tentacle is going: at you, a little ahead of where you are going. */
  _lockOn(tt, lead) {
    const p = this.player;
    p.chestPosition(tt.target);
    tt.target.x += p.vel.x * lead;
    tt.target.z += p.vel.z * lead;
    // no further than a tentacle stretches
    this.rootWorld(tt, _v1);
    _v2.subVectors(tt.target, _v1);
    if (_v2.length() > SHADOW.reach) tt.target.copy(_v1).addScaledVector(_v2.normalize(), SHADOW.reach);
  }

  /** The tip runs from the root to the target; whoever is on that line is hit. */
  _tentacleHit(tt, damage, push) {
    const g = this.game;
    this.rootWorld(tt, _v1);
    _v2.subVectors(tt.target, _v1);
    const L = _v2.length();
    if (L < 1e-3) return;
    _v2.multiplyScalar(1 / L);
    for (const c of g.characters) {
      if (c.isZombie || c.dead || c.body?.destroyed) continue;
      c.chestPosition(_v3);
      // only the far end of the line hurts: the tip, not the whole length
      const along = clamp(_v3.clone().sub(_v1).dot(_v2), 0, L);
      if (along < L - 1.6) continue;
      _v4.copy(_v1).addScaledVector(_v2, along);
      if (_v4.distanceTo(_v3) > 0.7) continue;
      this._hurt(c, damage, _v4.copy(_v2).multiplyScalar(push).add(_v3.set(0, 30, 0)), 'upperTorso', 'hole');
      g.gore?.burst(c.center, _v2, 12, { speed: 3, spread: 0.7, size: 0.03 });
    }
  }

  /* --------------------------- Tentacle Barrage --------------------------- */

  _barrage(dt) {
    const p = this.player;
    this.pose = { ...this._rest(), lean: 0.3, armsUp: 0.2 };
    this._face(p.pos.x, p.pos.z, dt);
    this._move(dt);
    const each = 0.38;
    const T = this.t;
    for (let n = 0; n < 6; n++) {
      const tt = this.m.tentacles[this.order[n]];
      const t = T - n * each;
      if (t < 0) { tt.draw = 0; continue; }
      if (t < 0.3) { tt.draw = clamp01(t / 0.25); this._lockOn(tt, 0.12); continue; }
      if (t < 0.45) {
        tt.draw = 0;
        tt.reach = clamp01((t - 0.3) / 0.12);
        if (tt.reach >= 1 && !tt.hit) { tt.hit = true; this._tentacleHit(tt, SHADOW.dmg.barrage, 90); }
        continue;
      }
      tt.reach = 1 - clamp01((t - 0.55) / 0.3);
    }
    if (T > 6 * each + 0.9) {
      for (const tt of this.m.tentacles) tt.hit = false;
      this._end('barrage', 1.0);
    }
  }

  /* ----------------------------- Mutant Summon ---------------------------- */

  _summon(dt) {
    const t = this.t;
    this.pose = { ...this._rest(), armsUp: clamp01(t / 0.7), roar: clamp01((t - 0.4) / 0.4) * 0.6, lean: -0.1 };
    this._move(dt);
    const fx = this.game.fx;
    if (!this.summonAt) {
      // five places round him, on dry ground
      this.summonAt = [];
      for (let i = 0; i < 14 && this.summonAt.length < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + this.rng() * 0.5;
        const r = 3.5 + this.rng() * 2.5;
        const x = this.pos.x + Math.cos(a) * r, z = this.pos.z + Math.sin(a) * r;
        if (this._canStand(x, z)) this.summonAt.push(new Vector3(x, this.floorY(x, z), z));
      }
    }
    if (t < 1.4) {
      for (const at of this.summonAt) {
        if (fx && this.rng() < dt * 8) fx.darkFog(at, { count: 1, spread: 0.5, size: 0.9, up: 0.6 });
      }
    } else if (!this.hitDone) {
      this.hitDone = true;
      const room = SHADOW.minions - this.minions.length;
      for (const at of this.summonAt.slice(0, room)) {
        const z = spawnZombie(this.game, at, { yaw: Math.atan2(-(this.player.pos.x - at.x), -(this.player.pos.z - at.z)) });
        z.summoned = true;
        this.minions.push(z);
        fx?.darkFog(at, { count: 8, spread: 0.8, size: 1.4, up: 1.4 });
        fx?.ring(at, { radius: 1.6, life: 0.6, color: 0x7a30c0 });
      }
      this.game.hud?.toast('Mutants claw their way out of the ground', 1400);
    } else if (t > 2.2) {
      this.summonAt = null;
      this._end('summon', 0.8);
    }
  }

  /* --------------------------------- Slam --------------------------------- */

  _slam(dt) {
    const g = this.game;
    /* From further off he closes in first, fast and low, so the slam lands
       on top of you rather than in front of you. */
    if (!this.slamReady) {
      const p = this.player;
      _v1.set(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z);
      const d = _v1.length();
      this._face(p.pos.x, p.pos.z, dt, SHADOW.turn * 1.5);
      this.pose = { ...this._rest(), lean: 0.45, walk: 1 };
      if (d > 3.6 && this.t < 2.2) {
        _v1.multiplyScalar(1 / Math.max(d, 1e-3));
        this.vel.x = damp(this.vel.x, _v1.x * 6.5, 6, dt);
        this.vel.z = damp(this.vel.z, _v1.z * 6.5, 6, dt);
        this._move(dt);
        return;
      }
      this.slamReady = true;
      this.vel.set(0, 0, 0);
      this.t = 0;
    }
    const t = this.t;
    const tell = 1.05;
    if (t < tell) {
      // down on one knee, both fists up over the head
      this.pose = { kneel: clamp01(t / 0.6), armsUp: clamp01(t / 0.7), slam: 0, roar: 0, lean: 0.1, walk: 0 };
      this._face(this.player.pos.x, this.player.pos.z, dt, SHADOW.turn * 0.5);
      if (!this.slamMark) this.slamMark = this.marks[3];
      this._mark(this.slamMark, _v1.set(this.pos.x, this.floorY(), this.pos.z), 4.5, t / tell);
    } else if (!this.hitDone) {
      this.hitDone = true;
      this._hideMark(this.slamMark);
      this.pose = { kneel: 1, armsUp: 0, slam: 1, roar: 0, lean: 0.5, walk: 0 };
      const at = _v1.set(this.pos.x, this.floorY(), this.pos.z).clone();
      this.slamAt = at;
      g.fx?.ring(at, { radius: 13, life: 1.0, color: 0x6a20b0, y: at.y });
      g.fx?.darkFog(at, { count: 16, spread: 2.5, size: 1.8, up: 1.2 });
      g.fx?.sparks(at, null, { count: 14, speed: 6, life: 0.5 });
      g.shake = Math.min(1.4, g.shake + 0.9);
      // the blast round him
      for (const c of g.characters) {
        if (c.isZombie || c.dead || c.body?.destroyed) continue;
        const d = Math.hypot(c.pos.x - at.x, c.pos.z - at.z);
        if (d > 4.5) continue;
        const k = 1 - d / 4.5;
        _v2.set(c.pos.x - at.x, 0, c.pos.z - at.z).normalize().multiplyScalar(160 * k + 40);
        _v2.y = 120 * k + 40;
        this._hurt(c, SHADOW.dmg.slam * k + 8, _v2, 'midTorso');
      }
      this.waveR = 1.5;
      this.waveHit = new Set();
      this.waveRings = [3, 5.5, 8, 10.5, 13];
    } else {
      // the wave runs out across the ground
      const prev = this.waveR;
      this.waveR += dt * 14;
      while (this.waveRings.length && this.waveRings[0] <= this.waveR) {
        const r = this.waveRings.shift();
        this._erupt(this.slamAt, r, 0, { count: Math.round(r * 2.4), ring: true, h: 0.7 });
      }
      for (const c of g.characters) {
        if (c.isZombie || c.dead || c.body?.destroyed || this.waveHit.has(c)) continue;
        const d = Math.hypot(c.pos.x - this.slamAt.x, c.pos.z - this.slamAt.z);
        if (d < prev - 0.6 || d > this.waveR + 0.6 || d > 13.5) continue;
        const feet = c.pos.y - 0.945;
        if (feet > this.slamAt.y + 0.5) continue;   // jumped it
        this.waveHit.add(c);
        _v2.set(c.pos.x - this.slamAt.x, 0, c.pos.z - this.slamAt.z).normalize().multiplyScalar(60);
        _v2.y = 200;
        this._hurt(c, SHADOW.dmg.wave, _v2, 'lowerLegR', 'hole');
      }
      this.pose = { kneel: clamp01(1 - (t - tell - 0.5) / 0.6), armsUp: 0, slam: clamp01(1 - (t - tell) / 0.8), roar: 0, lean: 0.2, walk: 0 };
      if (t > tell + 1.4) { this.slamMark = null; this.slamReady = false; this._end('slam', 1.0); }
    }
    this._move(dt);
  }

  /* ------------------------------ being hurt ------------------------------ */

  takeDamage(amount, point = null, kind = 'blunt') {
    if (this.state === 'dying' || this.state === 'gone' || this.state === 'dormant' ||
        this.state === 'emerge' || this.state === 'roar') return;
    this.hp = Math.max(0, this.hp - amount);
    this.flash = Math.min(1, this.flash + 0.2 + amount / 80);
    if (point) this.game.fx?.darkFog(point, { count: 2, spread: 0.15, size: 0.5, up: 0.6 });
    this.game.hud?.setBoss(SHADOW.name, this.hp, this.maxHp);
    if (this.hp <= 0) this._die();
    void kind;
  }

  _die() {
    this.slamReady = false;
    for (const mk of this.marks) this._hideMark(mk);
    for (const tt of this.m.tentacles) { tt.reach = 0; tt.draw = 0; }
    this._setState('dying');
    // what he raised goes down with him
    for (const z of this.minions) if (!z.dead) z.die();
    this.minions.length = 0;
  }

  _dying(dt) {
    const t = this.t;
    this.pose = { kneel: clamp01(t / 0.8), armsUp: 0, slam: 0, roar: clamp01(t / 0.4) * (1 - clamp01((t - 1.5) / 0.5)), lean: -0.3, walk: 0 };
    // and then he goes back into the ground he came out of, as fog
    if (t > 1.2) this.rise = Math.max(0, this.rise - dt / 2.2);
    this._move(dt);
    this.game.fx?.darkFog(this.center, { count: 4, spread: 1.0, size: 1.6, up: 1.5 });
    this.game.shake = Math.min(0.6, this.game.shake + dt);
    if (this.rise <= 0) {
      this.setVisible(false);
      this.light.intensity = 0;
      this._setState('gone');
      this.onDeath?.(this.pos.clone());
    }
  }

  /** Bodies are solid to him: walk into him and you stop. */
  _shove() {
    const p = this.player;
    if (!p || p.isRagdolling) return;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const R = 0.75;
    if (d >= R || d < 1e-4) return;
    p.pos.x += (dx / d) * (R - d);
    p.pos.z += (dz / d) * (R - d);
  }

  _thrownObjects() {
    for (const b of this.game.world.bodies) {
      const speed = b.vel.length();
      if (speed < 6) continue;
      const last = this.thrownHit.get(b) || 0;
      if (this.game.time - last < 0.6) continue;
      const r = b.shape === 'sphere' ? b.radius : b.half.length();
      if (!this.hitTest(b.pos, r * 0.8)) continue;
      this.thrownHit.set(b, this.game.time);
      this.takeDamage(clamp(b.mass * speed * 0.32, 8, 180), b.pos, 'blunt');
      _v1.copy(b.pos).sub(this.center).normalize();
      b.vel.copy(_v1).multiplyScalar(speed * 0.45);
      b.vel.y = Math.abs(b.vel.y) + 2;
      b.wake?.();
    }
  }

  /* ------------------------------ hit testing ----------------------------- */

  _updateVolumes() {
    const m = this.m, V = this.volumes;
    V.length = 0;
    const wp = (o, x, y, z) => o.localToWorld(new Vector3(x, y, z));
    V.push({ type: 'c', name: 'torso', a: wp(m.hips, 0, 0, 0), b: wp(m.chest, 0, 0.4, 0), r: 0.3, mult: 1 });
    V.push({ type: 's', name: 'head', a: wp(m.head, 0, 0.15, 0), r: 0.19, mult: 1.6 });
    for (const arm of m.arms) {
      V.push({ type: 'c', name: 'arm', a: wp(arm.shoulder, 0, 0, 0), b: wp(arm.elbow, 0, 0, 0), r: 0.1, mult: 0.9 });
      V.push({ type: 'c', name: 'arm', a: wp(arm.elbow, 0, 0, 0), b: wp(arm.hand, 0, -0.2, 0), r: 0.09, mult: 0.9 });
    }
    for (const leg of m.legs) {
      V.push({ type: 'c', name: 'leg', a: wp(leg.hip, 0, 0, 0), b: wp(leg.knee, 0, 0, 0), r: 0.11, mult: 0.8 });
      V.push({ type: 'c', name: 'leg', a: wp(leg.knee, 0, 0, 0), b: wp(leg.ankle, 0, 0, 0), r: 0.09, mult: 0.8 });
    }
  }

  hitTest(p, radius = 0) {
    if (!this.visible || this.state === 'gone' || this.rise < 0.5) return null;
    if (this.center.distanceToSquared(p) > 9) return null;
    let best = null, bestD = Infinity;
    for (const v of this.volumes) {
      let d;
      if (v.type === 's') d = v.a.distanceTo(p) - v.r;
      else {
        _v1.subVectors(v.b, v.a);
        const L2 = _v1.lengthSq();
        const t = L2 > 0 ? clamp(_v2.subVectors(p, v.a).dot(_v1) / L2, 0, 1) : 0;
        d = _v3.copy(v.a).addScaledVector(_v1, t).distanceTo(p) - v.r;
      }
      if (d <= radius && d < bestD) { bestD = d; best = v; }
    }
    return best;
  }

  raycast(origin, dir, maxDist = 300) {
    if (!this.visible || this.state === 'gone' || this.rise < 0.5) return null;
    let best = null;
    for (const v of this.volumes) {
      let t = null;
      if (v.type === 's') {
        _v1.subVectors(origin, v.a);
        const b = _v1.dot(dir), c = _v1.lengthSq() - v.r * v.r;
        const disc = b * b - c;
        if (disc >= 0) t = -b - Math.sqrt(disc);
      } else {
        _v1.subVectors(v.b, v.a);
        _v2.subVectors(origin, v.a);
        const a = dir.dot(dir), bb = dir.dot(_v1), c = _v1.dot(_v1), d = dir.dot(_v2), e = _v1.dot(_v2);
        const den = a * c - bb * bb;
        let u = den > 1e-8 ? (a * e - bb * d) / den : 0;
        u = clamp(u, 0, 1);
        const s = Math.max(0, (u * bb - d) / a);
        _v3.copy(origin).addScaledVector(dir, s);
        _v4.copy(v.a).addScaledVector(_v1, u);
        const miss = _v3.distanceTo(_v4);
        if (miss <= v.r) t = s - Math.sqrt(Math.max(0, v.r * v.r - miss * miss));
      }
      if (t != null && t > 0 && t < maxDist && (!best || t < best.distance)) {
        best = { distance: t, part: v, point: origin.clone().addScaledVector(dir, t) };
      }
    }
    return best;
  }

  headPos(out) { return this.m.head.localToWorld(out.set(0, 0.15, 0)); }

  rootWorld(tt, out) { return this.m.chest.localToWorld(out.copy(tt.root)); }

  /* ------------------------------- animation ------------------------------ */

  _animate(dt) {
    const m = this.m, P = this.pose, C = this.cur;
    for (const k of Object.keys(P)) C[k] = damp(C[k] ?? 0, P[k], k === 'slam' ? 22 : 9, dt);
    this.walkPhase += dt * (2 + C.walk * 5.5);
    const sw = Math.sin(this.walkPhase) * C.walk;
    const breath = Math.sin(this.game.time * 1.7) * 0.02;

    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;
    // kneeling: the hips come down and the back leg folds
    m.hips.position.y = 1.18 - C.kneel * 0.55;
    m.hips.rotation.x = C.lean * 0.4;
    m.spine.rotation.x = C.lean * 0.5 - C.roar * 0.35 + breath;
    m.chest.rotation.x = C.lean * 0.3 - C.roar * 0.25;
    m.neck.rotation.x = -C.roar * 0.4 + 0.1;
    m.head.rotation.x = -C.roar * 0.5 + Math.sin(this.game.time * 0.9) * 0.05;
    for (const leg of m.legs) {
      const s = leg.side;
      const kneeling = leg.side < 0 ? C.kneel : C.kneel * 0.6;
      leg.hip.rotation.x = sw * 0.55 * s - kneeling * (s < 0 ? 1.4 : 0.2);
      leg.knee.rotation.x = Math.max(0, -sw * s) * 0.7 + kneeling * (s < 0 ? 1.6 : 1.9) + 0.08;
      leg.ankle.rotation.x = -kneeling * 0.3;
    }
    for (const arm of m.arms) {
      const s = arm.side;
      // hanging, swinging, up over the head, slammed down, thrown wide
      arm.shoulder.rotation.x = -sw * 0.45 * s - C.armsUp * 2.6 + C.slam * 1.2 + 0.15;
      arm.shoulder.rotation.z = s * (0.18 + C.roar * 1.1 + C.armsUp * 0.15);
      arm.elbow.rotation.x = -0.25 - C.armsUp * 0.4 - C.slam * 0.1;
      arm.hand.rotation.x = -0.1;
    }
    m.root.updateMatrixWorld(true);

    // eyes flare when he roars or is hurt
    const glow = 0.8 + C.roar * 0.6 + this.flash * 0.4;
    m.eyeGlow.uniforms.opacity.value = clamp(glow, 0, 1.6);
    this.headPos(_v1);
    this.light.position.copy(_v1);
    this.light.intensity = this.rise > 0.3 ? 1.2 + C.roar * 2 : 0;

    this._animateTentacles(dt);
    this._updateVolumes();
    this.center.copy(this.m.chest.localToWorld(_v1.set(0, 0.1, 0)));
  }

  _animateTentacles(dt) {
    const m = this.m, time = this.game.time;
    const fwd = this.forward(_v3).clone();
    const side = new Vector3(-fwd.z, 0, fwd.x);
    const back = fwd.clone().negate();
    for (const tt of m.tentacles) {
      const n = tt.segs.length;
      const root = this.rootWorld(tt, _v1).clone();
      const pts = tt.pts;
      const L = 2.4;                      // resting length
      const spread = 0.6 + this.cur.roar * 0.9;
      // waving: out behind and to the side, curling up, never still
      for (let k = 0; k <= n; k++) {
        const s = k / n;
        const wave = Math.sin(time * 2.1 + tt.phase + s * 4) * 0.35 * s;
        const wave2 = Math.cos(time * 1.6 + tt.phase * 1.3 + s * 3) * 0.3 * s;
        const draw = tt.draw;
        pts[k].copy(root)
          .addScaledVector(back, s * L * (0.6 - draw * 0.3) + draw * s * 0.6)
          .addScaledVector(side, tt.side * s * L * 0.45 * spread + wave2)
          .addScaledVector(UP, (tt.up - 0.1) * s * 2.5 + Math.sin(s * Math.PI) * 0.6 + s * s * (0.6 + draw * 1.2) + wave);
      }
      // reaching: the chain straightens out towards the target
      if (tt.reach > 0) {
        const r = tt.reach;
        for (let k = 0; k <= n; k++) {
          const s = k / n;
          _v2.copy(root).lerp(tt.target, s);
          _v2.y += Math.sin(s * Math.PI) * 0.4 * (1 - r);
          pts[k].lerp(_v2, clamp01(r * 1.2 - (1 - s) * 0.2));
        }
      }
      for (let k = 0; k < n; k++) {
        const r0 = lerp(0.075, 0.018, k / n), r1 = lerp(0.075, 0.018, (k + 1) / n);
        placeSegment(tt.segs[k], pts[k], pts[k + 1], r0, r1);
        if (k === n - 1) tt.segs[k].scale.set(0.035, tt.segs[k].scale.y, 0.035);
      }
    }
    void dt;
  }

  /** Black fog coming off him all the time. */
  _fog(dt) {
    const fx = this.game.fx;
    if (!fx || this.rise < 0.05) return;
    /* A haze round him rather than a cloud over him: mostly round the legs
       and low on the body, so the shape and the eyes still read. */
    this.fogAcc = (this.fogAcc || 0) + dt * 8;
    while (this.fogAcc > 1) {
      this.fogAcc -= 1;
      const k = this.rng() * this.rng();
      const a = this.rng() * Math.PI * 2, r = 0.5 + this.rng() * 0.6;
      _v1.set(this.pos.x + Math.cos(a) * r, this.pos.y + k * 2.2, this.pos.z + Math.sin(a) * r);
      fx.darkFog(_v1, { count: 1, spread: 0.2, size: 0.6 + this.rng() * 0.5, up: 0.35, life: 1.5 });
    }
  }

  /** Back where he came up, whole again, for a fresh attempt. */
  reset() {
    this.slamReady = false;
    this.hp = this.maxHp;
    this.pos.copy(this.home);
    this.vel.set(0, 0, 0);
    this.rise = 1;
    for (const z of this.minions) this.game.removeCharacter?.(z);
    this.minions.length = 0;
    for (const mk of this.marks) this._hideMark(mk);
    for (const s of this.spikes) { s.active = false; s.m.visible = false; }
    for (const tt of this.m.tentacles) { tt.reach = 0; tt.draw = 0; }
    this.cooldown = { spikes: 2, stab: 1.5, barrage: 6, summon: 9, slam: 7 };
    this.setVisible(true);
    this._setState('idle');
    this.game.hud?.setBoss(SHADOW.name, this.hp, this.maxHp);
  }

  dispose() {
    this.m.root.removeFromParent();
    this.m.tentGroup.removeFromParent();
    this.light.removeFromParent();
    for (const s of this.spikes) s.m.removeFromParent();
    for (const mk of this.marks) { mk.ring.removeFromParent(); mk.fill.removeFromParent(); mk.ring.material.dispose(); mk.fill.material.dispose(); }
    for (const g of this.markGeos) g.dispose();
    this.spikeGeo.dispose();
    this.spikeMat.dispose();
    for (const m of this.m.mats) m.dispose();
    for (const g of this.m.geos) g.dispose();
  }
}

/* -------------------------------------------------------------------------- */
/*                                the encounter                               */
/* -------------------------------------------------------------------------- */

/** The cutscene, in seconds from walking past the tower. */
export const SHADOW_CUT = { rumble: 0, rise: 1.4, risen: 4.0, roar: 4.2, title: 4.7, back: 6.6, fight: 7.4 };

export class ShadowEncounter {
  constructor(game) {
    this.game = game;
    this.state = 'waiting';
    this.t = 0;
    this.cam = null;
    this.rng = makeRng(0xda4c);
    const lm = game.map.landmarks || {};
    this.line = lm.towerLine ?? 6;
    this.tower = lm.tower ? lm.tower.clone() : new Vector3(-13, 9, 1);
    this.respawnPoint = new Vector3(0, 0, 38);
    this.respawnYaw = Math.PI;
    this.boss = new ShadowMutant(game, new Vector3(-4, 0, 16));
    this.boss.onDeath = () => this._won();
  }

  get active() { return this.state === 'cutscene' || this.state === 'fight'; }

  update(dt) {
    this.boss.update(dt);
    const g = this.game, p = g.player;
    if (this.state === 'waiting') {
      // past the tower, on dry ground, on your feet
      if (p && !p.dead && p.state === STATE.CONTROLLED && !p.water && p.pos.z > this.tower.z) this.begin();
      return;
    }
    if (this.state === 'cutscene') this._cutscene(dt);
    if (this.state === 'won' && !this.barHidden && g.time - this.wonAt > 2) {
      this.barHidden = true;
      g.hud?.hideBoss();
    }
  }

  /** Where he comes up: ahead of you, on open ground. */
  _emergePoint(out) {
    const p = this.game.player, w = this.game.world;
    for (const [dx, dz] of [[0, 9], [3, 9], [-3, 9], [0, 7], [5, 6], [-5, 6], [0, 5]]) {
      const x = clamp(p.pos.x + dx, -45, 45), z = clamp(p.pos.z + dz, -20, 36);
      const f = w.floorAt(x, z, 2);
      if (w.hasGroundAt(x, z) && Math.abs(f) < 0.05) return out.set(x, 0, z);
    }
    return out.set(p.pos.x, 0, clamp(p.pos.z + 6, -20, 36));
  }

  begin() {
    const g = this.game, p = g.player;
    this.state = 'cutscene';
    this.t = 0;
    this._emergePoint(this.boss.home);
    this.boss.pos.copy(this.boss.home);
    this.boss.yaw = Math.atan2(-(p.pos.x - this.boss.pos.x), -(p.pos.z - this.boss.pos.z));
    this.cam = { pos: new Vector3(), look: new Vector3() };
    this.flags = {};
    g.cutscene = this;
    g.hud?.setCutscene(true);
    p.animator.cancelAction();
    p.moveInput.set(0, 0, 0);
  }

  _cutscene(dt) {
    const g = this.game, p = g.player, b = this.boss, C = SHADOW_CUT, f = this.flags;
    const t = (this.t += dt);
    p.moveInput.set(0, 0, 0);
    const E = b.home;
    // the ground going: rumbling, fog welling up, cracks of violet light
    if (t < C.rise) {
      g.shake = Math.min(0.5, g.shake + dt * 0.6);
      if (g.fx && this.rng() < dt * 14) g.fx.darkFog(_v1.set(E.x, 0.1, E.z), { count: 2, spread: 2, size: 1.4, up: 0.5 });
      if (!f.crack) { f.crack = true; g.fx?.ring(E, { radius: 3.2, life: 1.2, color: 0x7a30c0, y: 0 }); }
    }
    if (t >= C.rise && !f.rise) {
      f.rise = true;
      b.startEmerge();
      b._erupt(_v1.set(E.x, 0, E.z), 2.6, 0, { count: 12, ring: true, h: 1.2 });
    }
    if (t >= C.roar && !f.roar) { f.roar = true; b.startRoar(); }
    if (t >= C.title && !f.title) { f.title = true; g.hud?.showTitle(SHADOW.name, 'WHAT LIVES UNDER LEGACY'); }

    // the shots
    p.eyePosition(_v2);
    const toBoss = _v3.set(E.x - _v2.x, 0, E.z - _v2.z);
    if (toBoss.lengthSq() < 1e-4) toBoss.set(0, 0, 1);
    toBoss.normalize();
    const side = _v4.set(-toBoss.z, 0, toBoss.x);
    if (t < C.rise) {
      // over your shoulder at the patch of ground
      const pos = _v1.copy(_v2).addScaledVector(toBoss, -1.2).addScaledVector(side, 0.5).addScaledVector(UP, 0.35);
      this._setCam(pos, new Vector3(E.x, 0.4, E.z), dt, t < dt * 1.5 ? null : 3);
    } else if (t < C.back) {
      // low on the ground in front of him, looking up as he comes out of it
      const s = clamp01((t - C.rise) / (C.back - C.rise));
      const fwd = b.forward(new Vector3());
      const pos = new Vector3(E.x, 0, E.z).addScaledVector(fwd, 4.6 - s * 1.2)
        .addScaledVector(new Vector3(-fwd.z, 0, fwd.x), 1.4).addScaledVector(UP, 0.5 + s * 0.4);
      const look = b.headPos(new Vector3());
      look.y = Math.max(look.y - 0.3, 0.6);
      this._setCam(pos, look, dt, f.shot2 ? 4 : null);
      f.shot2 = true;
    } else {
      if (!f.back) { f.back = true; g.hud?.hideTitle(); }
      const pos = _v1.copy(_v2).addScaledVector(toBoss, -2.4).addScaledVector(side, 0.9).addScaledVector(UP, 0.6);
      this._setCam(pos, new Vector3(E.x, 1.6, E.z), dt, f.shot3 ? 4 : null);
      f.shot3 = true;
    }
    if (t >= C.fight) this._startFight();
  }

  _setCam(pos, look, dt, follow) {
    const c = this.cam;
    if (!c) return;
    if (follow == null) { c.pos.copy(pos); c.look.copy(look); return; }
    c.pos.lerp(pos, clamp01(dt * follow));
    c.look.lerp(look, clamp01(dt * follow * 1.4));
  }

  showForCompile(on) { this.boss.setVisible(on); }

  skip() {
    if (this.state !== 'cutscene') return;
    this._startFight();
  }

  _startFight() {
    const g = this.game, p = g.player, b = this.boss;
    this.state = 'fight';
    this.cam = null;
    g.cutscene = null;
    g.hud?.setCutscene(false);
    g.hud?.hideTitle();
    b.wake();
    b.yaw = Math.atan2(-(p.pos.x - b.pos.x), -(p.pos.z - b.pos.z));
    g.hud?.setBoss(SHADOW.name, b.hp, b.maxHp);
    g.camYaw = Math.atan2(-(b.pos.x - p.pos.x), -(b.pos.z - p.pos.z));
    g.camPitch = 0.12;
    p.gazeYaw = g.camYaw;
    g.hud?.toast('Kill the Shadow Mutant', 1800);
  }

  onRespawn() {
    if (this.state !== 'fight') return;
    this.boss.reset();
  }

  _won() {
    const g = this.game;
    this.state = 'won';
    this.wonAt = g.time;
    g.hud?.toast('The Shadow Mutant is dead', 2600);
  }

  dispose() {
    const g = this.game;
    if (g.cutscene === this) g.cutscene = null;
    g.hud?.setCutscene(false);
    g.hud?.hideTitle();
    g.hud?.hideBoss();
    this.boss.dispose();
  }
}
