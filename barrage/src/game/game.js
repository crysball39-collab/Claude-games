/* =============================================================================
   The game: the scene, the physics world, everyone in it, and the loop.

   The simulation runs at a fixed 60 steps a second (with 8 physics
   substeps each, 6 on a struggling phone) and the picture is interpolated
   between steps, so it looks the same on a 60 Hz phone and a 120 Hz one.
   ========================================================================== */
import { Scene, PerspectiveCamera, Vector3 } from 'three';
import { World } from '../physics/world.js';
import { selfCollide, P } from './rig.js';
import { Fighter } from './fighter.js';
import { Held } from './gear.js';
import { Blood } from './blood.js';
import { Guns } from './guns.js';
import { Arena, MASK, STALL_SPOT, R, GATES } from './arena.js';
import { wrapAngle } from '../core/util.js';
import { FollowCamera } from './camera.js';
import { Waves } from './waves.js';
import { Player } from './player.js';
import { Brain, Keeper } from './brain.js';
import { flushAll } from './paint.js';

const STEP = 1 / 60;

export class Game {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(60, 1, 0.05, 600);
    this.world = new World();
    this.world.filter = (a, b) => this.canCollide(a, b);
    this.world.onWake = (b) => { if (b.owner && b.owner.wake) b.owner.wake(); };
    this.world.onSubstep = () => {
      for (const f of this.fighters) if (f.action) f.strikeTest();
    };
    this.fighters = [];
    this.props = [];               // everything held or dropped: blood lands on it
    this.dropped = [];
    this.time = 0;
    this.acc = 0;
    this.timeScale = 1;
    this.maxSteps = 3;             // a slow frame catches up by at most this many steps
    this.paused = false;
    this.lowPower = false;
    this.listeners = {};
    this.player = null;
    this.keeper = null;
    this.demoing = false;

    this.arena = new Arena(this);
    this.blood = new Blood(this);
    this.guns = new Guns(this);
    this.cam = new FollowCamera(this.camera, this);
    this.waves = new Waves(this);
    this.focus = new Vector3();
  }

  /* -------------------------------- events -------------------------------- */

  on(name, fn) { (this.listeners[name] || (this.listeners[name] = [])).push(fn); }
  emit(name, ...args) { for (const fn of this.listeners[name] || []) fn(...args); }

  /* -------------------------------- world --------------------------------- */

  groundAt(x, z) { return this.arena.groundAt(x, z); }

  /** Are these two on opposite sides? The shopkeeper is on nobody's. */
  foes(a, b) { return a.team !== b.team && a.team !== 'neutral' && b.team !== 'neutral'; }

  canCollide(a, b) {
    const oa = a.owner, ob = b.owner;
    if (oa && oa === ob) return oa.bodies ? selfCollide(a.part, b.part) : false;
    // gear never fights the body that holds it
    if (oa && oa.holder && oa.holder === ob) return false;
    if (ob && ob.holder && ob.holder === oa) return false;
    return true;
  }

  /* ------------------------------- spawning ------------------------------- */

  spawn(kind, opts) {
    const f = new Fighter(this, { kind, ...opts });
    this.fighters.push(f);
    return f;
  }

  removeFighter(f) {
    f.remove();
    const i = this.fighters.indexOf(f);
    if (i >= 0) this.fighters.splice(i, 1);
  }

  addHeld(kind) {
    const h = new Held(this, kind);
    this.props.push(h);
    return h;
  }

  removeHeld(h) {
    h.remove();
    let i = this.props.indexOf(h);
    if (i >= 0) this.props.splice(i, 1);
    i = this.dropped.indexOf(h);
    if (i >= 0) this.dropped.splice(i, 1);
  }

  /** You, in the middle of the sand, facing north, carrying what is in your slots. */
  spawnPlayer(input, gear) {
    if (this.player) this.removeFighter(this.player);
    const f = this.spawn('player', {
      team: 'player', x: 0, z: 0.5, heading: Math.PI, health: 100, power: 1, toughness: 0.7, stumbleAt: 21, mask: MASK.player,
    });
    f.controller = new Player(f, input);
    if (gear.weapon) f.equip('weapon', gear.weapon);
    if (gear.offhand) f.equip('offhand', gear.offhand);
    this.player = f;
    this.cam.mode = 'follow';
    this.cam.snapBehind(f);
    return f;
  }

  spawnKeeper() {
    if (this.keeper) return this.keeper;
    const at = this.arena.keeperSpot;
    const f = this.spawn('keeper', { team: 'neutral', x: at.x, z: at.z, heading: Math.PI, health: 100, mask: 0 });
    f.invulnerable = true;
    f.controller = new Keeper(f, at);
    this.keeper = f;
    return f;
  }

  /** Two teams brawling in the middle of the sand, for the title screen. */
  demo() {
    this.clearAll();
    this.demoing = true;
    this.cam.mode = 'orbit';
    for (let k = 0; k < 3; k++) {
      const a = this.spawn('red', { team: 'red', x: -2.4, z: (k - 1) * 1.4, heading: Math.PI / 2, health: 70 });
      a.controller = new Brain(a, 'red', 0.4);
      a.controller.turn = true;
      const b = this.spawn('blue', { team: 'blue', x: 2.4, z: (k - 1) * 1.4, heading: -Math.PI / 2, health: 70 });
      b.controller = new Brain(b, 'blue', 0.4);
      b.controller.turn = true;
    }
    this.demoOver = 0;
  }

  /** Everyone and everything off the sand. */
  clearAll() {
    this.waves.reset();
    for (const f of [...this.fighters]) this.removeFighter(f);
    for (const h of [...this.props]) this.removeHeld(h);
    this.player = null;
    this.keeper = null;
    this.blood.clear();
    this.arena.clearBlood();
    this.demoing = false;
  }

  /* ------------------------------- damage --------------------------------- */

  onHit(victim, hit) {
    this.emit('hit', victim, hit);
  }

  onDeath(f, cause) {
    this.emit('death', f, f.lastAttacker, cause);
  }

  /** Is the player close enough to the counter to be served? */
  atStall() {
    const p = this.player;
    if (!p || !p.alive || p.state !== 'active') return false;
    return Math.hypot(p.root.x - STALL_SPOT.x, p.root.z - STALL_SPOT.z) < 2.3;
  }

  /* --------------------------------- loop --------------------------------- */

  frame(dt, input) {
    dt = Math.min(dt, 0.1);
    if (!this.paused) {
      this.acc += dt * this.timeScale;
      let n = 0;
      while (this.acc >= STEP && n < this.maxSteps) {
        this.fixedStep(STEP);
        this.acc -= STEP;
        n++;
      }
      if (n === this.maxSteps) this.acc = 0;
    }
    const alpha = this.paused ? 1 : Math.min(1, this.acc / STEP);
    for (const f of this.fighters) f.syncVisual(alpha);
    for (const p of this.props) p.sync(alpha);

    const subject = this.player || null;
    this.cam.update(this.paused ? 0 : dt, this.paused ? null : input, subject);
    this.arena.followShadow(this.cam.focus(this.focus));
    if (!this.paused) this.arena.update(dt);
    flushAll(performance.now() / 1000);
  }

  fixedStep(dt) {
    this.time += dt;
    for (const f of this.fighters) f.beginStep();
    for (const p of this.props) p.beginStep();
    for (const f of this.fighters) f.update(dt);
    this.separate();
    // fewer substeps when a lot is moving at once, to keep phones at speed
    let awake = 0;
    for (const b of this.world.bodies) if (b.dynamic) awake++;
    this.world.substeps = awake > 150 || this.lowPower ? 6 : 8;
    this.world.step(dt);
    for (const f of [...this.fighters]) f.afterStep(dt);
    this.blood.update(dt);
    this.guns.update(dt);
    this.waves.update(dt);
    // between rounds you get your breath back
    if (this.player && (this.waves.state === 'rest' || this.waves.state === 'cleared')) this.player.heal(dt * 12);
    this.rescue();
    // gear lying about goes with the dead
    for (const h of [...this.dropped]) {
      if (h.fadeAt != null && this.time > h.fadeAt + 1.5) this.removeHeld(h);
      else if (h.body.x.y < -20) this.removeHeld(h);
    }
    if (this.demoing) this.demoStep(dt);
  }

  /** Knocked through an open portcullis into a tunnel, you are put back on the sand. */
  rescue() {
    const p = this.player;
    if (!p || p.state !== 'active') return;
    const r = Math.hypot(p.root.x, p.root.z);
    if (r < R - 0.1) return;
    const a = Math.atan2(p.root.x, p.root.z);
    // only the three enemy tunnels: the plaza beyond the south gate is yours to walk in
    if (!GATES.some((g) => !g.player && Math.abs(wrapAngle(a - g.angle)) < 0.4)) return;
    p.root.x = Math.sin(a) * (R - 0.9);
    p.root.z = Math.cos(a) * (R - 0.9);
  }

  demoStep(dt) {
    const teams = new Set(this.fighters.filter((f) => f.alive).map((f) => f.team));
    this.demoOver = teams.size < 2 ? this.demoOver + dt : 0;
    if (this.demoOver > 4) this.demo();
  }

  /** People on their feet do not walk through one another. */
  separate() {
    const hs = this.fighters;
    for (let i = 0; i < hs.length; i++) {
      const a = hs[i];
      if (a.state !== 'active' || !a.mask) continue;
      for (let j = 0; j < hs.length; j++) {
        const b = hs[j];
        if (b === a || b.removed || !b.mask) continue;
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
          this.arena.confine(b.root, 0.3, b.mask);
        } else {
          a.root.x += nx * push; a.root.z += nz * push;
        }
        this.arena.confine(a.root, 0.3, a.mask);
      }
    }
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    // held upright, a phone needs a wider view to show the same fight
    this.camera.fov = w < h ? 74 : 60;
    this.camera.updateProjectionMatrix();
  }
}

export { P };
