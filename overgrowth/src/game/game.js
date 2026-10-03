/* =============================================================================
   The game: the scene, the physics world, everyone in it, and the loop.

   Simulation runs at a fixed 60 steps a second (8 physics substeps each) and
   the picture is interpolated between steps, so it looks the same on a 60 Hz
   phone and a 120 Hz one.
   ========================================================================== */
import {
  Scene, PerspectiveCamera, Vector3, Quaternion, Mesh, RingGeometry, CircleGeometry,
  MeshBasicMaterial, Group, Raycaster, Vector2,
} from 'three';
import { World } from '../physics/world.js';
import { rayBox } from '../physics/collide.js';
import { selfCollide, P, NP } from './rig.js';
import { Human } from './human.js';
import { Prop, PROP_TYPES } from './props.js';
import { Blood } from './blood.js';
import { GameMap, GREEN_HALF, GREY_HALF, GREY_TOP } from './map.js';
import { FreeCamera } from './camera.js';
import { flushAll } from './paint.js';
import { TEAMS, TEAM } from './appearance.js';
import { rand } from '../core/util.js';

const STEP = 1 / 60;
export const MAX_HUMANS = 40;
export const MAX_PROPS = 40;

export class Game {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(62, 1, 0.05, 900);
    this.world = new World();
    this.world.filter = (a, b) => this.canCollide(a, b);
    this.world.onWake = (b) => { if (b.owner && b.owner.wake) b.owner.wake(); };
    this.world.onSubstep = () => {
      for (const h of this.humans) if (h.action) h.strikeTest();
    };
    this.humans = [];
    this.props = [];
    this.time = 0;
    this.acc = 0;
    this.timeScale = 1;
    this.paused = false;
    this.lowPower = false;
    this.listeners = {};
    this.stats = { hits: 0, deaths: 0, spawned: 0, punches: 0 };

    this.map = new GameMap(this);
    this.blood = new Blood(this);
    this.cam = new FreeCamera(this.camera, this);
    this.focus = new Vector3();

    this.selection = null;      // { type: 'human', team } or { type: 'prop', kind }
    this.makeMarker();
  }

  /* -------------------------------- events -------------------------------- */

  on(name, fn) { (this.listeners[name] || (this.listeners[name] = [])).push(fn); }
  emit(name, ...args) { for (const fn of this.listeners[name] || []) fn(...args); }

  /* -------------------------------- world --------------------------------- */

  groundAt(x, z) { return this.map.groundAt(x, z); }
  edgeDistance(x, z) { return this.map.edgeDistance(x, z); }

  canCollide(a, b) {
    const oa = a.owner, ob = b.owner;
    if (oa && oa === ob) return oa.bodies ? selfCollide(a.part, b.part) : false;
    // a weapon never fights the hand that holds it
    if (oa && oa.holder && oa.holder === ob) return false;
    if (ob && ob.holder && ob.holder === oa) return false;
    return true;
  }

  /* ------------------------------- spawning ------------------------------- */

  spawnHuman(team, x, z, heading = rand(-Math.PI, Math.PI)) {
    if (this.humans.length >= MAX_HUMANS) { this.emit('toast', `That's the limit: ${MAX_HUMANS} people`); return null; }
    const h = new Human(this, team, x, z, heading);
    this.humans.push(h);
    this.stats.spawned++;
    this.emit('spawn', h);
    return h;
  }

  spawnProp(kind, x, z, y = null, quat = null) {
    if (this.props.length >= MAX_PROPS) { this.emit('toast', `That's the limit: ${MAX_PROPS} objects`); return null; }
    const T = PROP_TYPES[kind];
    const g = this.groundAt(x, z);
    const q = quat || new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rand(0, Math.PI * 2));
    const pos = new Vector3(x, y != null ? y : (isFinite(g) ? g : 0) + T.size[1] / 2 + 0.6, z);
    if (T.weapon && quat == null) {
      // lie them down flat
      q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), kind === 'sword' ? 0 : Math.PI / 2));
      pos.y = (isFinite(g) ? g : 0) + 0.25;
    }
    const p = new Prop(this, kind, pos, q);
    this.props.push(p);
    this.emit('spawn', p);
    return p;
  }

  /** Spawns the current selection at the marker. */
  spawnSelected(count = 1) {
    const s = this.selection;
    const at = this.markerPoint;
    if (!s || !at) return 0;
    let made = 0;
    for (let i = 0; i < count; i++) {
      const spot = this.freeSpot(at, s.type === 'human' ? 0.75 : 0.5, i);
      if (!spot) break;
      if (s.type === 'human') {
        if (this.spawnHuman(s.team, spot.x, spot.z, this.cam.yaw + Math.PI + rand(-0.4, 0.4))) made++;
      } else if (this.spawnProp(s.kind, spot.x, spot.z, s.kind === 'crate' ? null : undefined)) {
        made++;
      }
    }
    return made;
  }

  /** A place near p with nobody standing on it. */
  freeSpot(p, clearance, n) {
    for (let ring = 0; ring < 8; ring++) {
      const tries = ring === 0 ? 1 : 6 + ring * 4;
      for (let k = 0; k < tries; k++) {
        const a = (k / tries) * Math.PI * 2 + n * 1.7 + ring;
        const r = ring * clearance * 0.9;
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        if (this.edgeDistance(x, z) < 0.6) continue;
        let ok = true;
        for (const h of this.humans) {
          if (h.removed) continue;
          if (Math.hypot(h.root.x - x, h.root.z - z) < clearance) { ok = false; break; }
        }
        if (ok) for (const pr of this.props) {
          if (pr.removed || pr.holder) continue;
          if (Math.hypot(pr.body.x.x - x, pr.body.x.z - z) < clearance * 0.9 + pr.body.radius * 0.5) { ok = false; break; }
        }
        if (ok) return { x, z };
      }
    }
    return null;
  }

  removeHuman(h) {
    h.remove();
    const i = this.humans.indexOf(h);
    if (i >= 0) this.humans.splice(i, 1);
    this.emit('removed', h);
  }

  removeProp(p) {
    p.remove();
    const i = this.props.indexOf(p);
    if (i >= 0) this.props.splice(i, 1);
  }

  clearAll() {
    for (const h of [...this.humans]) this.removeHuman(h);
    for (const p of [...this.props]) this.removeProp(p);
    this.blood.clear();
    this.map.clearBlood();
    this.emit('cleared');
  }

  clearDead() {
    for (const h of [...this.humans]) if (!h.alive) this.removeHuman(h);
  }

  /** A pickup reached for something: the nearest free weapon to the right hand. */
  tryPickup(h) {
    const hand = h.bodies[P.handR].x;
    let best = null, bd = 0.95;
    for (const p of this.props) {
      if (!p.weapon || p.holder || p.removed) continue;
      // nearest point on the weapon's long axis
      const b = p.body;
      const ax = new Vector3(b.axes[6], b.axes[7], b.axes[8]);
      const rel = new Vector3().subVectors(hand, b.x);
      const t = Math.max(-b.half.z, Math.min(b.half.z, rel.dot(ax)));
      const d = rel.addScaledVector(ax, -t).length();
      if (d < bd) { bd = d; best = p; }
    }
    if (best) {
      best.attach(h);
      h.brain.dropClaim();
      this.emit('pickup', h, best);
    } else {
      h.brain.missedPickup();
    }
  }

  onHit(victim, hit) {
    this.stats.hits++;
    if (hit.kind === 'fist') this.stats.punches++;
    this.emit('hit', victim, hit);
    if (victim.alive || !hit.attacker) return;
  }

  onDeath(h, cause) {
    this.stats.deaths++;
    let killer = null;
    if (cause === 'hit' || cause === 'impact') {
      // whoever hit them last
      killer = h.brain.grudge && h.brain.grudgeT > -3 ? h.brain.grudge : null;
      if (killer) killer.kills++;
    }
    this.emit('death', h, killer, cause);
  }

  /* ------------------------------- the marker ----------------------------- */

  makeMarker() {
    const g = new Group();
    const ring = new Mesh(new RingGeometry(0.34, 0.42, 40), new MeshBasicMaterial({ color: '#39ff5a', transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    const dot = new Mesh(new CircleGeometry(0.07, 20), new MeshBasicMaterial({ color: '#39ff5a', transparent: true, opacity: 0.9, depthWrite: false }));
    dot.rotation.x = -Math.PI / 2;
    g.add(ring, dot);
    g.renderOrder = 3;
    g.visible = false;
    this.marker = g;
    this.markerRing = ring;
    this.scene.add(g);
    this.markerPoint = null;
    this.raycaster = new Raycaster();
  }

  /** Where the middle of the screen meets the platform, or null. */
  aimPoint(ndcX = 0, ndcY = 0) {
    this.raycaster.setFromCamera(new Vector2(ndcX, ndcY), this.camera);
    const o = this.raycaster.ray.origin, d = this.raycaster.ray.direction;
    if (d.y > -1e-4) return null;
    // the grey platform first: it sits on top
    let t = (GREY_TOP - o.y) / d.y;
    if (t > 0) {
      const x = o.x + d.x * t, z = o.z + d.z * t;
      if (Math.abs(x) <= GREY_HALF && Math.abs(z) <= GREY_HALF) return new Vector3(x, GREY_TOP, z);
    }
    t = -o.y / d.y;
    if (t <= 0 || t > 200) return null;
    const x = o.x + d.x * t, z = o.z + d.z * t;
    if (Math.abs(x) > GREEN_HALF - 0.4 || Math.abs(z) > GREEN_HALF - 0.4) return null;
    if (Math.abs(x) <= GREY_HALF && Math.abs(z) <= GREY_HALF) {
      // went under the lip of the grey platform from the side
      return new Vector3(x, GREY_TOP, z);
    }
    return new Vector3(x, 0, z);
  }

  updateMarker() {
    const p = this.selection ? this.aimPoint() : null;
    this.markerPoint = p;
    this.marker.visible = !!p;
    if (p) {
      this.marker.position.set(p.x, p.y + 0.012, p.z);
      const s = 1 + 0.08 * Math.sin(this.time * 6);
      this.markerRing.scale.set(s, s, s);
      const col = this.selection.type === 'human' ? TEAM[this.selection.team].color : '#39ff5a';
      this.markerRing.material.color.set(col);
    }
  }

  /** The first person or object under a screen point. */
  pick(ndcX, ndcY) {
    this.raycaster.setFromCamera(new Vector2(ndcX, ndcY), this.camera);
    const o = this.raycaster.ray.origin, d = this.raycaster.ray.direction;
    let best = null, bt = Infinity;
    for (const h of this.humans) {
      for (let i = 0; i < NP; i++) {
        const b = h.bodies[i];
        const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, b.x, b.axes, b.half, bt);
        if (t >= 0 && t < bt) { bt = t; best = h; }
      }
    }
    for (const p of this.props) {
      const b = p.body;
      const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, b.x, b.axes, b.half, bt);
      if (t >= 0 && t < bt) { bt = t; best = p; }
    }
    return best;
  }

  /* --------------------------------- loop --------------------------------- */

  frame(dt, input) {
    dt = Math.min(dt, 0.1);
    if (!this.paused) {
      this.acc += dt * this.timeScale;
      let n = 0;
      while (this.acc >= STEP && n < 3) {
        this.fixedStep(STEP);
        this.acc -= STEP;
        n++;
      }
      if (n === 3) this.acc = 0;
    }
    const alpha = this.paused ? 1 : Math.min(1, this.acc / STEP);
    for (const h of this.humans) h.syncVisual(alpha);
    for (const p of this.props) p.sync(alpha);

    if (input) this.cam.update(dt, input);
    this.cam.focus(this.focus);
    this.map.followShadow(this.focus);
    this.updateMarker();
    flushAll(performance.now() / 1000);
  }

  fixedStep(dt) {
    this.time += dt;
    for (const h of this.humans) h.beginStep();
    for (const p of this.props) p.beginStep();
    for (const h of this.humans) h.update(dt);
    this.separate();
    // fewer substeps when a lot is moving at once, to keep phones at speed
    let awake = 0;
    for (const b of this.world.bodies) if (b.dynamic) awake++;
    this.world.substeps = awake > 160 || this.lowPower ? 6 : 8;
    this.world.step(dt);
    for (const h of [...this.humans]) h.afterStep(dt);
    for (const p of [...this.props]) {
      if (!p.holder && p.body.x.y < -40) this.removeProp(p);
    }
    this.blood.update(dt);
    this.countT = (this.countT || 0) - dt;
    if (this.countT <= 0) { this.countT = 0.25; this.emit('counts', this.teamCounts()); }
  }

  /** People on their feet do not walk through one another. */
  separate() {
    const hs = this.humans;
    for (let i = 0; i < hs.length; i++) {
      const a = hs[i];
      if (a.state !== 'active') continue;
      for (let j = 0; j < hs.length; j++) {
        const b = hs[j];
        if (b === a || b.removed) continue;
        if (b.state === 'ragdoll' || b.state === 'dead') continue;
        if (b.state === 'active' && j < i) continue;
        const dx = a.root.x - b.root.x, dz = a.root.z - b.root.z;
        const d2 = dx * dx + dz * dz;
        const r = 0.5;
        if (d2 >= r * r || d2 < 1e-8) continue;
        const d = Math.sqrt(d2), push = (r - d);
        const nx = dx / d, nz = dz / d;
        if (b.state === 'active') {
          a.root.x += nx * push * 0.5; a.root.z += nz * push * 0.5;
          b.root.x -= nx * push * 0.5; b.root.z -= nz * push * 0.5;
        } else {
          a.root.x += nx * push; a.root.z += nz * push;
        }
      }
    }
  }

  teamCounts() {
    const c = {};
    for (const t of TEAMS) c[t.id] = { alive: 0, dead: 0 };
    for (const h of this.humans) {
      if (h.alive) c[h.team].alive++;
      else c[h.team].dead++;
    }
    return c;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    // held upright, a phone needs a wider view to show the same platform
    this.camera.fov = w < h ? 76 : 62;
    this.camera.updateProjectionMatrix();
  }
}
