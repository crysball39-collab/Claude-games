/* =============================================================================
   The game: one scene, one physics world, and the order things happen in.
   ========================================================================== */
import * as THREE from 'three';
import { World, Body, Island } from './physics/world.js';
import { City, groundHeight, KERB, LIMIT } from './world/city.js';
import { Boxes } from './render/boxes.js';
import { Quads, cellUV } from './render/quads.js';
import { decalAtlas, FaceAtlas, crateTexture, DECAL, ATLAS_COLS, ATLAS_ROWS } from './render/textures.js';
import { Human, ST } from './human/human.js';
import { playerLook, randomLook } from './human/looks.js';
import { P } from './human/rig.js';
import { Gore } from './combat/gore.js';
import { clamp, clamp01, damp, lerp, rand, wrapAngle } from './core/util.js';

export const QUALITY = {
  low: { ratio: 1, shadows: false, substeps: 6, particles: 450, antialias: false, people: 8, cars: 5 },
  medium: { ratio: 1.5, shadows: false, substeps: 7, particles: 800, antialias: true, people: 12, cars: 6 },
  high: { ratio: 2, shadows: true, substeps: 8, particles: 1200, antialias: true, people: 15, cars: 8 },
};

const _v = [0, 0, 0], _n = [0, 0, 0];
const SHADOW_UV = cellUV(DECAL.shadow[0], DECAL.shadow[1], ATLAS_COLS, ATLAS_ROWS);
const RING_UV = cellUV(DECAL.ring[0], DECAL.ring[1], ATLAS_COLS, ATLAS_ROWS);

export class Game {
  constructor(viewport, settings, input) {
    this.viewport = viewport;
    this.settings = settings;
    this.input = input;
    const q = this.q = QUALITY[settings.quality] || QUALITY.medium;
    this.shadows = settings.shadows ?? q.shadows;

    const r = this.renderer = new THREE.WebGLRenderer({ antialias: q.antialias, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.ratio));
    r.shadowMap.enabled = this.shadows;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    viewport.appendChild(r.domElement);

    const scene = this.scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x9da2a3, 55, 210);
    scene.background = new THREE.Color(0x9da2a3);
    this.camera = new THREE.PerspectiveCamera(settings.fov || 64, 1, 0.08, 500);
    this.camera.rotation.order = 'YXZ';

    scene.add(new THREE.HemisphereLight(0xb7c4d2, 0x4a4640, 1.25));
    const sun = this.sun = new THREE.DirectionalLight(0xffe9cf, 1.9);
    sun.position.set(30, 55, 18);
    if (this.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const c = sun.shadow.camera;
      c.left = -34; c.right = 34; c.top = 34; c.bottom = -34; c.near = 5; c.far = 140;
      sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    }
    scene.add(sun, sun.target);

    this.world = new World();
    this.world.substeps = q.substeps;
    this.city = new City(scene, this.world, { shadows: this.shadows });

    this.atlas = decalAtlas();
    this.faces = new FaceAtlas();
    this.boxes = new Boxes(scene, 2400, new THREE.MeshLambertMaterial({ color: 0xffffff }), { shadows: this.shadows });
    this.crateBoxes = new Boxes(scene, 96, new THREE.MeshLambertMaterial({ map: crateTexture() }), { shadows: this.shadows });
    this.faceQuads = new Quads(scene, 64, this.faces.texture, { offset: -2, renderOrder: 4, alphaTest: 0.08 });
    this.under = new Quads(scene, 96, this.atlas, { offset: -1, renderOrder: 0, alphaTest: 0.005 });

    this.humans = [];
    this.props = [];
    this.pieces = [];
    this.time = 0; this.dt = 1 / 60;
    this.camX = 0; this.camZ = 0;
    this.gore = new Gore(this, { particles: q.particles });
    this.gore.enabled = settings.gore !== false;

    const sp = this.city.spawn;
    this.player = new Human(this, playerLook(), sp.x, sp.z, sp.yaw, { player: true });
    this.humans.push(this.player);
    this.camYaw = sp.yaw; this.camPitch = -0.12;
    this.camDist = 3.3; this.camPos = new THREE.Vector3(sp.x, 2, sp.z - 3);
    this.pivot = new THREE.Vector3(sp.x, 1.5, sp.z);
    this.firstPerson = false;
    this.aim = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 1, ox: 0, oy: 0, oz: 0 };
    this.shake = 0;
    this.doctor = null;                 // set when doctor mode is on
    this.selected = null;
    this.paused = false;
    this.maxPeople = 34;
    this.stats = { fps: 60, ms: 0 };

    for (const c of this.city.crateSpots) this.spawnCrate(c[0], KERB + 0.41 + (c[2] ? 0.82 : 0), c[1]);

    // filled in by main once the rest is built
    this.audio = null; this.weapons = null; this.traffic = null; this.minds = null; this.speech = null; this.ui = null;
    this.resize();
  }

  resize() {
    const w = this.viewport.clientWidth || window.innerWidth, h = this.viewport.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    // a tall screen needs a wider lens to see the same street
    const base = this.settings.fov || 64;
    this.camera.fov = w >= h ? base : clamp(base * (1 + (h / w - 1) * 0.42), base, 96);
    this.camera.updateProjectionMatrix();
    this.width = w; this.height = h;
  }

  /* -------------------------------- spawning ------------------------------ */

  /** A spot a couple of paces in front of the player that nothing is standing in. */
  spotAhead(dist = 2.6, spread = 0) {
    const p = this.player;
    const a = this.camYaw + rand(-spread, spread);
    for (let k = 0; k < 8; k++) {
      const d = dist + k * 0.45;
      const x = p.x + Math.sin(a) * d + rand(-spread, spread), z = p.z + Math.cos(a) * d + rand(-spread, spread);
      if (this.city.isClear(x, z, 0.45)) return [x, z];
    }
    return [p.x + Math.sin(a) * 1.2, p.z + Math.cos(a) * 1.2];
  }

  spawnHuman(x, z, yaw = rand(-Math.PI, Math.PI), look = randomLook()) {
    // make room: the long dead go first, then whoever is furthest away
    while (this.humans.length >= this.maxPeople) {
      let worst = null, score = -1;
      for (const h of this.humans) {
        if (h.isPlayer || h === this.selected) continue;
        const d = Math.hypot(h.x - this.player.x, h.z - this.player.z);
        const s = (h.h.alive ? 0 : 500 + h.deadFor) + d;
        if (s > score) { score = s; worst = h; }
      }
      if (!worst) break;
      this.removeHuman(worst);
    }
    const h = new Human(this, look, x, z, yaw);
    this.humans.push(h);
    this.minds?.adopt(h);
    return h;
  }

  removeHuman(h) {
    if (h.isPlayer) return;
    h.remove();
    const i = this.humans.indexOf(h);
    if (i >= 0) this.humans.splice(i, 1);
    this.pieces = this.pieces.filter((p) => p.human !== h);
    if (this.selected === h) this.selected = null;
    this.minds?.forget(h);
    this.speech?.forget(h);
  }

  spawnCrate(x, y, z) {
    if (this.props.filter((p) => p.kind === 'crate').length >= 40) {
      const old = this.props.find((p) => p.kind === 'crate');
      this.removeProp(old);
    }
    const body = new Body({ hx: 0.4, hy: 0.4, hz: 0.4, mass: 24, x, y, z, shape: 1, dense: true, kind: 'crate', friction: 0.75, bounce: 0.08, angDamp: 0.5 });
    const island = new Island(null);
    island.add(body);
    this.world.addIsland(island);
    const idx = this.crateBoxes.alloc();
    const prop = { kind: 'crate', body, island, idx, born: this.time };
    body.owner = prop;
    this.props.push(prop);
    return prop;
  }

  removeProp(p) {
    const i = this.props.indexOf(p);
    if (i < 0) return;
    this.props.splice(i, 1);
    this.world.removeIsland(p.island);
    if (p.kind === 'crate') this.crateBoxes.release(p.idx);
    this.gore.clearBody(p.body);
    p.removed = true;
    this.weapons?.onPropRemoved(p);
  }

  /* --------------------------------- frame -------------------------------- */

  frame(realDt) {
    const dt = this.dt = clamp(realDt, 1 / 144, 1 / 30);
    if (this.paused) { this.renderer.render(this.scene, this.camera); return; }
    this.time += dt;
    const inp = this.input, p = this.player;
    inp.begin();

    this._control(dt);
    this.minds?.update(dt);
    this.traffic?.update(dt);
    for (const h of this.humans) h.update(dt);
    this.weapons?.update(dt);
    for (const o of this.props) { const b = o.body; b.preSpeed = Math.hypot(b.vx, b.vy, b.vz); b.slow = b.preSpeed < 4.2; }
    this.world.step(dt);
    for (const h of this.humans) h.late(dt);
    this.weapons?.late(dt);

    // crates
    for (const o of this.props) {
      if (o.kind !== 'crate') continue;
      const b = o.body;
      this.crateBoxes.set(o.idx, b.px, b.py, b.pz, b.qx, b.qy, b.qz, b.qw, b.hx * 2, b.hy * 2, b.hz * 2);
      if (b.hit > 2.5 && (!o.cool || this.time > o.cool)) { o.cool = this.time + 0.25; this.audio?.at('crate', b.px, b.py, b.pz, clamp01(b.hit / 9)); this.minds?.noise(b.px, b.py, b.pz, 62 + b.hit * 2, 'crash', null); }
      if (b.py < -20) { b.teleport(p.x, 3, p.z); b.vx = b.vy = b.vz = 0; }
    }
    // limbs that have lain about for a long time are cleared away
    if (this.pieces.length > 26) {
      const old = this.pieces.shift();
      if (!old.human.removed) old.human.dropPiece(old.island);
    }

    this._camera(dt);
    this.gore.update(dt, this.camera);
    this.speech?.update(dt);
    this._underlay();
    this.ui?.update(dt);
    this.audio?.listen(this.camPos.x, this.camPos.y, this.camPos.z, this.camYaw);

    this.boxes.commit(); this.crateBoxes.commit(); this.faceQuads.commit(); this.under.commit();
    this.faces.flush(this.time);
    if (!this.headless) this.renderer.render(this.scene, this.camera);
  }

  /** Runs the game forward without drawing it: for tests, and for nothing else. */
  advance(seconds, step = 1 / 60) {
    this.headless = true;
    for (let i = 0, n = Math.round(seconds / step); i < n; i++) this.frame(step);
    this.headless = false;
  }

  /** The player's thumbs. */
  _control(dt) {
    const inp = this.input, p = this.player, s = this.settings;
    const [lx, ly] = inp.takeLook();
    this.camYaw = wrapAngle(this.camYaw - lx);
    this.camPitch = clamp(this.camPitch - ly, -1.2, 1.25);
    const sy = Math.sin(this.camYaw), cy = Math.cos(this.camYaw);
    const mx = inp.move.x, my = inp.move.y;
    const it = p.intent;
    // forward is where the camera looks; right is to the camera's right
    it.mx = sy * my - cy * mx;
    it.mz = cy * my + sy * mx;
    it.run = true;
    if (inp.pressed.crouch) this.crouchHeld = !this.crouchHeld;
    if (inp.pressed.jump) { it.jump = true; this.crouchHeld = false; }
    it.crouch = !!this.crouchHeld;
    const armed = p.weapon && p.weapon.def.gun;
    it.face = armed || p.anim.action || p.guardT > 0 || this.firstPerson ? this.camYaw : null;
    p.aimPitch = armed ? this.camPitch : 0;
    p.lookYaw = clamp(wrapAngle(this.camYaw - p.yaw), -1.2, 1.2);
    p.lookPitch = this.camPitch;
    if (p.state === ST.RAGDOLL && p.h.alive && p.h.conscious && !p.h.canStand) {
      const m = Math.hypot(it.mx, it.mz);
      p.crawlDir = m > 0.3 ? [it.mx / m, it.mz / m] : null;
    } else p.crawlDir = null;
  }

  _camera(dt) {
    const p = this.player, cam = this.camera;
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const dx = Math.sin(this.camYaw) * cp, dy = sp, dz = Math.cos(this.camYaw) * cp;
    const rx = -Math.cos(this.camYaw), rz = Math.sin(this.camYaw);
    const chest = p.bodies[P.CHEST], head = p.bodies[P.HEAD];
    const first = this.firstPerson && p.state !== ST.RAGDOLL && p.attached[P.HEAD];
    let tx, ty, tz;
    if (first) {
      head.toWorld(0, 0.05 * p.scale, 0.06 * p.scale, _v);
      tx = _v[0]; ty = _v[1]; tz = _v[2];
      this.pivot.set(tx, ty, tz);
      this.camPos.set(tx, ty, tz);
    } else {
      const down = p.state === ST.RAGDOLL;
      tx = chest.px; tz = chest.pz;
      ty = down ? chest.py + 0.55 : p.y + (p.crouching ? 1.2 : 1.56) * p.scale;
      const k = 1 - Math.exp(-dt * (down ? 6 : 16));
      this.pivot.x += (tx - this.pivot.x) * k; this.pivot.y += (ty - this.pivot.y) * k; this.pivot.z += (tz - this.pivot.z) * k;
      const side = 0.42, ox = this.pivot.x + rx * side, oy = this.pivot.y + 0.12, oz = this.pivot.z + rz * side;
      let dist = this.camDist;
      // nothing solid between the shoulder and the lens
      const hit = this.world.rayWorld(ox, oy, oz, -dx, -dy, -dz, dist + 0.3);
      if (hit >= 0) dist = Math.max(0.35, hit - 0.25);
      for (const o of this.props) {
        if (o.kind !== 'crate') continue;
        const b = o.body, ex = b.px - ox, ey = b.py - oy, ez = b.pz - oz;
        const t = -(ex * dx + ey * dy + ez * dz);
        if (t > 0 && t < dist && (ex + dx * t) ** 2 + (ey + dy * t) ** 2 + (ez + dz * t) ** 2 < 0.36) dist = Math.max(0.35, t - 0.5);
      }
      this.camDistNow = damp(this.camDistNow ?? dist, dist, dist < (this.camDistNow ?? dist) ? 30 : 6, dt);
      this.camPos.set(ox - dx * this.camDistNow, oy - dy * this.camDistNow, oz - dz * this.camDistNow);
      const gy = groundHeight(this.camPos.x, this.camPos.z) + 0.18;
      if (this.camPos.y < gy) this.camPos.y = gy;
    }
    this.shake = Math.max(0, this.shake - dt * 3.2);
    const sh = this.shake * this.shake * 0.05;
    cam.position.set(this.camPos.x + rand(-sh, sh), this.camPos.y + rand(-sh, sh), this.camPos.z + rand(-sh, sh));
    cam.rotation.set(this.camPitch + rand(-sh, sh) * 0.6, this.camYaw + Math.PI, 0);
    this.camX = this.camPos.x; this.camZ = this.camPos.z;
    const a = this.aim;
    a.ox = cam.position.x; a.oy = cam.position.y; a.oz = cam.position.z; a.dx = dx; a.dy = dy; a.dz = dz;

    this.city.sky.position.copy(cam.position);
    if (this.shadows) {
      // the patch of city the sun casts shadows on follows the player
      const sx = Math.round(p.x / 2) * 2, sz = Math.round(p.z / 2) * 2;
      this.sun.position.set(sx + 30, 55, sz + 18);
      this.sun.target.position.set(sx, 0, sz);
    }
  }

  /** Soft shadows under people and cars when real ones are off, and the doctor's ring. */
  _underlay() {
    const u = this.under;
    let n = 0;
    if (!this.shadows) {
      for (const h of this.humans) {
        if (n >= u.capacity - 2) break;
        const b = h.bodies[P.PELVIS];
        if (h.gone[P.PELVIS]) continue;
        const gy = groundHeight(b.px, b.pz);
        const lift = clamp01((b.py - gy) / 2.5);
        const lying = h.state === ST.RAGDOLL;
        const s = (lying ? 1.5 : 0.95) * (1 + lift * 0.6);
        u.flat(n, b.px, gy + 0.011, b.pz, s, s, 0);
        u.uvRect(n, SHADOW_UV[0], SHADOW_UV[1], SHADOW_UV[2], SHADOW_UV[3]);
        u.tint(n, 1, 1, 1, 0.75 * (1 - lift * 0.7));
        n++;
      }
      if (this.traffic) for (const c of this.traffic.cars) {
        if (n >= u.capacity - 2) break;
        u.flat(n, c.x, 0.011, c.z, 2.9, 5.6, -c.yaw);
        u.uvRect(n, SHADOW_UV[0], SHADOW_UV[1], SHADOW_UV[2], SHADOW_UV[3]);
        u.tint(n, 1, 1, 1, 0.8);
        n++;
      }
      for (const o of this.props) {
        if (n >= u.capacity - 2 || o.kind !== 'crate') continue;
        const b = o.body, gy = groundHeight(b.px, b.pz);
        if (b.py - gy > 3) continue;
        u.flat(n, b.px, gy + 0.011, b.pz, 1.5, 1.5, 0);
        u.uvRect(n, SHADOW_UV[0], SHADOW_UV[1], SHADOW_UV[2], SHADOW_UV[3]);
        u.tint(n, 1, 1, 1, 0.6);
        n++;
      }
    }
    const sel = this.doctor ? this.selected : null;
    if (sel && !sel.removed) {
      const b = sel.bodies[sel.gone[P.PELVIS] ? P.CHEST : P.PELVIS];
      const gy = groundHeight(b.px, b.pz);
      const s = 1.5 + Math.sin(this.time * 4) * 0.08;
      u.flat(n, b.px, gy + 0.03, b.pz, s, s, this.time * 0.8);
      u.uvRect(n, RING_UV[0], RING_UV[1], RING_UV[2], RING_UV[3]);
      u.tint(n, 1, 1, 1, 0.95);
      n++;
    }
    for (let i = n; i < u.count; i++) u.hide(i);
    u.count = Math.max(u.count, n);
  }

  /* --------------------------------- queries ------------------------------ */

  /**
   * The first person a ray meets. Returns { human, part, t, lp, ln, exit } or
   * null. `skip` is someone to ignore; `grow` fattens every part a little.
   */
  rayPeople(ox, oy, oz, dx, dy, dz, maxT, skip = null, grow = 0, out = null) {
    let best = null, bt = maxT;
    const tmp = this._rb || (this._rb = [0, 0, 0, 0, 0, 0, 0]);
    for (const h of this.humans) {
      if (h === skip || h.removed) continue;
      // a quick rejection against a ball round the whole person
      const c = h.bodies[P.CHEST];
      const ex = c.px - ox, ey = c.py - oy, ez = c.pz - oz;
      const t0 = ex * dx + ey * dy + ez * dz;
      const d2 = ex * ex + ey * ey + ez * ez - t0 * t0;
      if (t0 < -2 || t0 > bt + 2 || (d2 > 5.5 && h.pieces.length === 0)) continue;
      for (let i = 0; i < h.bodies.length; i++) {
        if (h.gone[i]) continue;
        const b = h.bodies[i];
        const t = rayBodyLocal(b, ox, oy, oz, dx, dy, dz, bt, tmp, grow);
        if (t < 0 || t >= bt) continue;
        bt = t;
        best = best || {};
        best.human = h; best.part = i; best.t = t;
        best.lp = [tmp[0], tmp[1], tmp[2]]; best.ln = [tmp[3], tmp[4], tmp[5]]; best.exit = tmp[6];
      }
    }
    return best;
  }

  /** Who is under a point on the screen, for the doctor. */
  pick(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1, ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    const v = new THREE.Vector3(nx, ny, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    const o = this.camera.position;
    const wall = this.world.rayWorld(o.x, o.y, o.z, v.x, v.y, v.z, 120);
    const far = wall >= 0 ? wall + 0.3 : 120;
    // your own back is always in the way in third person: anyone else under the finger comes first
    let hit = this.rayPeople(o.x, o.y, o.z, v.x, v.y, v.z, far, this.player, 0.09);
    if (!hit && !this.firstPerson) hit = this.rayPeople(o.x, o.y, o.z, v.x, v.y, v.z, far, null, 0.09);
    return hit ? hit.human : null;
  }

  /** Projects a world point to the screen, in CSS pixels; z > 1 means behind the camera. */
  toScreen(x, y, z, out) {
    const v = this._sv || (this._sv = new THREE.Vector3());
    v.set(x, y, z).project(this.camera);
    out[0] = (v.x * 0.5 + 0.5) * this.width; out[1] = (-v.y * 0.5 + 0.5) * this.height; out[2] = v.z;
    return out;
  }

  /* ------------------------- things the sandbox can do ---------------------- */

  cleanUp(what) {
    if (what === 'blood' || what === 'all') this.gore.clean();
    if (what === 'bodies' || what === 'all') {
      for (const h of this.humans.slice()) if (!h.isPlayer && (!h.h.alive || what === 'all')) this.removeHuman(h);
      for (const h of this.humans) for (const pc of h.pieces.slice()) h.dropPiece(pc.island);
      this.pieces.length = 0;
    }
    if (what === 'things' || what === 'all') {
      for (const o of this.props.slice()) this.removeProp(o);
    }
  }

  /** Puts the player back together where they stand, or at the start. */
  respawn(home = false) {
    const old = this.player, sp = this.city.spawn;
    const x = home ? sp.x : clamp(old.x, -LIMIT + 2, LIMIT - 2), z = home ? sp.z : clamp(old.z, -LIMIT + 2, LIMIT - 2);
    const held = old.weapon;
    if (held) this.weapons?.dropFrom(old, true);
    const i = this.humans.indexOf(old);
    old.remove();
    this.pieces = this.pieces.filter((pc) => pc.human !== old);
    const p = this.player = new Human(this, playerLook(), x, z, this.camYaw, { player: true });
    this.humans[i] = p;
    if (this.selected === old) this.selected = p;
    this.weapons?.onRespawn(old, p);
    this.minds?.playerChanged(old, p);
    return p;
  }
}

/* a ray against one body's box: like physics/world rayBody, inlined to avoid a second import cycle */
function rayBodyLocal(b, ox, oy, oz, dx, dy, dz, maxT, out, grow) {
  b.toLocal(ox, oy, oz, _v);
  b.dirToLocal(dx, dy, dz, _n);
  const lox = _v[0], loy = _v[1], loz = _v[2], ldx = _n[0], ldy = _n[1], ldz = _n[2];
  const hx = b.hx + grow, hy = b.hy + grow, hz = b.hz + grow;
  const ix = 1 / (ldx || 1e-12), iy = 1 / (ldy || 1e-12), iz = 1 / (ldz || 1e-12);
  let t1 = (-hx - lox) * ix, t2 = (hx - lox) * ix;
  let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2), axis = 0;
  t1 = (-hy - loy) * iy; t2 = (hy - loy) * iy;
  let a = Math.min(t1, t2), c = Math.max(t1, t2);
  if (a > tmin) { tmin = a; axis = 1; } if (c < tmax) tmax = c;
  t1 = (-hz - loz) * iz; t2 = (hz - loz) * iz;
  a = Math.min(t1, t2); c = Math.max(t1, t2);
  if (a > tmin) { tmin = a; axis = 2; } if (c < tmax) tmax = c;
  if (tmax < 0 || tmin > tmax || tmin > maxT) return -1;
  const t = tmin < 0 ? 0 : tmin;
  out[0] = lox + ldx * t; out[1] = loy + ldy * t; out[2] = loz + ldz * t;
  out[3] = axis === 0 ? (ldx > 0 ? -1 : 1) : 0;
  out[4] = axis === 1 ? (ldy > 0 ? -1 : 1) : 0;
  out[5] = axis === 2 ? (ldz > 0 ? -1 : 1) : 0;
  out[6] = tmax - t;
  return t;
}
