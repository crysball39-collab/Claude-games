/* =============================================================================
   Morphs: turning into something else, from the admin panel. One so far:
   Venom.

   A black goo wells up on your head and runs down over you, part by part,
   and you grow with it - every box and joint of you, so what is standing
   there at the end is really that big, not just drawn so: black and glossy,
   white eyes, a mouthful of teeth, claws. It has 5000 health and three
   things it does:

     CLAW         in place of PUNCH: a raking swipe that opens three slashes
     VENOM SURGE  a line of black spikes bursts out of the ground ahead and
                  throws whoever is standing on it into the air
     EAT          the tongue lashes out at the nearest box ragdoll, drags it
                  in, and it is bitten and swallowed whole
   ========================================================================== */
import { Mesh, MeshLambertMaterial, ConeGeometry, BoxGeometry, Vector3, Quaternion } from 'three';
import { P, NP, PARTS } from './rig.js';
import { FACE } from './paint.js';
import { paintBody } from './appearance.js';
import { SWING_R } from './anim.js';
import { rand, clamp, smooth } from '../core/util.js';

export const MORPHS = {
  venom: {
    id: 'venom', name: 'Venom', health: 5000, scale: 1.4, speed: 1.15, toughness: 0.3,
    blurb: 'A black goo grows on your head and spreads down over you, and you grow with it.',
    abilities: [
      { id: 'claw', name: 'Claw', key: 'PUNCH', text: 'Raking swipes that tear three slashes at a time.' },
      { id: 'surge', name: 'Venom Surge', key: 'SURGE', text: 'A line of black spikes bursts out of the ground ahead of you.' },
      { id: 'eat', name: 'Eat', key: 'EAT', text: 'Your tongue grabs the nearest box ragdoll; you bite, and swallow it.' },
    ],
  },
};

/** Seconds the change takes, and how long before each ability can be used again. */
const CHANGE = 2.6;
export const COOLDOWN = { surge: 5, eat: 6 };

/** How far down the body the goo has to travel to reach each part: the head first, the feet last. */
const SPREAD = PARTS.map((p) => {
  const n = p.name;
  if (n === 'head') return 0;
  if (n === 'neck') return 0.1;
  if (n === 'upperTorso') return 0.2;
  if (n.startsWith('upperArm') || n === 'middleTorso') return 0.3;
  if (n === 'lowerTorso') return 0.4;
  if (n.startsWith('lowerArm')) return 0.42;
  if (n === 'pelvis') return 0.5;
  if (n.startsWith('hand')) return 0.52;
  if (n.startsWith('upperLeg')) return 0.62;
  if (n.startsWith('lowerLeg')) return 0.78;
  return 0.92;
});

const GOO = '#0d0b11';
const _v = new Vector3(), _w = new Vector3(), _q = new Quaternion();
const Z = new Vector3(0, 0, 1);

/* -------------------------------------------------------------------------- */
/*                                  painting                                  */
/* -------------------------------------------------------------------------- */

/** Blots of goo on a tile; `full` covers it, with a wet sheen. */
function goo(ctx, t, blots, full) {
  ctx.fillStyle = GOO;
  if (full) {
    ctx.fillRect(t.x - 2, t.y - 2, t.w + 4, t.h + 4);
    // the sheen: pale streaks, as if wet
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = `rgba(150, 160, 200, ${0.08 + Math.random() * 0.08})`;
      ctx.fillRect(t.x + Math.random() * t.w, t.y + Math.random() * t.h * 0.5, Math.max(1, t.w * 0.06), t.h * (0.2 + Math.random() * 0.3));
    }
    return;
  }
  const s = Math.min(t.w, t.h);
  for (let k = 0; k < blots; k++) {
    const r = s * (0.12 + Math.random() * 0.22);
    ctx.beginPath();
    ctx.arc(t.x + Math.random() * t.w, t.y + Math.random() * t.h, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Venom's face: great white eyes slanting up and out, and a mouth full of teeth. */
function face(ctx, t) {
  const X = (u) => t.x + u * t.w, Y = (v) => t.y + v * t.h;
  ctx.fillStyle = GOO;
  ctx.fillRect(t.x - 2, t.y - 2, t.w + 4, t.h + 4);
  ctx.fillStyle = '#f6f6f2';
  for (const s of [-1, 1]) {
    const m = (u) => X(0.5 + s * u);
    ctx.beginPath();
    ctx.moveTo(m(0.06), Y(0.44));
    ctx.lineTo(m(0.44), Y(0.16));
    ctx.lineTo(m(0.4), Y(0.36));
    ctx.lineTo(m(0.16), Y(0.5));
    ctx.closePath();
    ctx.fill();
  }
  // the mouth: wide, dark red inside, teeth down from the top and up from the bottom
  ctx.fillStyle = '#3a0710';
  ctx.beginPath();
  ctx.moveTo(X(0.08), Y(0.6));
  ctx.quadraticCurveTo(X(0.5), Y(0.7), X(0.92), Y(0.6));
  ctx.quadraticCurveTo(X(0.5), Y(0.98), X(0.08), Y(0.6));
  ctx.fill();
  ctx.fillStyle = '#f2efe6';
  const n = 9;
  for (let i = 0; i < n; i++) {
    const u0 = 0.12 + (i / n) * 0.76, u1 = u0 + 0.76 / n;
    const top = 0.62 + Math.abs(i - (n - 1) / 2) * 0.006;
    ctx.beginPath(); ctx.moveTo(X(u0), Y(top)); ctx.lineTo(X(u1), Y(top)); ctx.lineTo(X((u0 + u1) / 2), Y(top + 0.1)); ctx.fill();
    const bot = 0.86 - Math.abs(i - (n - 1) / 2) * 0.02;
    ctx.beginPath(); ctx.moveTo(X(u0), Y(bot)); ctx.lineTo(X(u1), Y(bot)); ctx.lineTo(X((u0 + u1) / 2), Y(bot - 0.08)); ctx.fill();
  }
}

/** White claws at the ends of the fingers. */
function claws(ctx, tiles) {
  ctx.fillStyle = '#f2efe6';
  for (const fi of [FACE.pz, FACE.nz, FACE.px, FACE.nx]) {
    const t = tiles[fi];
    for (let k = 0; k < 3; k++) {
      const x = t.x + t.w * (0.2 + k * 0.3);
      ctx.beginPath();
      ctx.moveTo(x - t.w * 0.09, t.y + t.h * 0.62);
      ctx.lineTo(x + t.w * 0.09, t.y + t.h * 0.62);
      ctx.lineTo(x, t.y + t.h);
      ctx.fill();
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                                  the morph                                 */
/* -------------------------------------------------------------------------- */

export class Morph {
  constructor(f, id) {
    this.f = f;
    this.game = f.game;
    this.id = id;
    this.kind = MORPHS[id];
    this.t = 0;
    this.growing = true;
    this.claws = true;
    this.cool = { surge: 0, eat: 0 };
    this.parts = new Float32Array(NP);       // how far the goo has covered each part, 0..1
    this.spikes = [];
    this.lash = null;
    this.spikeGeo = new ConeGeometry(1, 1, 4);
    this.spikeGeo.translate(0, 0.5, 0);        // standing on its base
    this.spikeMat = new MeshLambertMaterial({ color: '#100c16', emissive: '#1c0f2c', emissiveIntensity: 0.5 });
    this.tongueGeo = new BoxGeometry(1, 1, 1);
    this.tongueMat = new MeshLambertMaterial({ color: '#b8283f' });
    // swallowed by the goo: what you wore and carried comes back when you change back
    if (f.outfit.mesh) f.outfit.mesh.visible = false;
    f.equip('weapon', null);
    f.equip('offhand', null);
    this.game.emit('morph', f, id);
  }

  update(dt) {
    for (const k in this.cool) this.cool[k] = Math.max(0, this.cool[k] - dt);
    if (this.growing) this.grow(dt);
    if (this.spikes.length) this.updateSpikes(dt);
    if (this.lash) this.updateLash(dt);
  }

  /** The goo running down, and you growing with it. */
  grow(dt) {
    const f = this.f;
    this.t += dt;
    const k = Math.min(1, this.t / CHANGE);
    const ctx = f.paint.ctx;
    for (let i = 0; i < NP; i++) {
      const p = clamp((k - SPREAD[i] * 0.75) / 0.25, 0, 1);
      if (p <= this.parts[i]) continue;
      const tiles = f.layout.tiles[i];
      const full = p >= 1;
      for (const t of tiles) goo(ctx, t, Math.ceil((p - this.parts[i]) * 14), full);
      if (full && i === P.head) face(ctx, tiles[FACE.pz]);
      if (full && (i === P.handL || i === P.handR)) claws(ctx, tiles);
      this.parts[i] = p;
      f.paint.dirty = true;
    }
    f.setScale(1 + (this.kind.scale - 1) * smooth((this.t - 0.4) / (CHANGE - 0.4)));
    if (k >= 1) {
      this.growing = false;
      f.health = f.maxHealth;
      this.game.emit('morphed', f, this.id);
    }
  }

  /* --------------------------------- surge --------------------------------- */

  /** A line of spikes out of the ground ahead, one after another, as far as the nearest wall. */
  surge() {
    const f = this.f, g = this.game;
    if (this.growing || this.cool.surge > 0 || !f.canAct()) return false;
    this.cool.surge = COOLDOWN.surge;
    f.play(SWING_R, -25, 1.25);
    const fwd = _v.set(Math.sin(f.heading), 0, Math.cos(f.heading)).clone();
    const side = new Vector3(fwd.z, 0, -fwd.x);
    const from = f.root.clone().setY(0.6);
    const reach = Math.min(9.5, g.arena.rayWalls(from, fwd, 9.5) - 0.3);
    const hit = new Set();
    for (let i = 0, d = 1.1 * f.scale; d < reach; i++, d += 0.42) {
      const at = f.root.clone().addScaledVector(fwd, d).addScaledVector(side, rand(-0.15, 0.15)).setY(0);
      const big = 1 - i * 0.012;
      this.spikes.push({ at, delay: i * 0.028, t: 0, h: rand(1.0, 1.55) * big, r: rand(0.1, 0.15), lean: rand(-0.25, 0.25), mesh: null, hit, fwd, main: true });
      for (const s of [-1, 1]) {
        if (Math.random() < 0.6) {
          this.spikes.push({ at: at.clone().addScaledVector(side, s * rand(0.28, 0.42)), delay: i * 0.028 + 0.02, t: 0, h: rand(0.5, 0.9) * big, r: rand(0.06, 0.1), lean: s * rand(0.3, 0.6), mesh: null, hit, fwd, main: false });
        }
      }
    }
    g.emit('surge', f);
    return true;
  }

  updateSpikes(dt) {
    const g = this.game;
    for (let i = this.spikes.length - 1; i >= 0; i--) {
      const s = this.spikes[i];
      s.t += dt;
      const t = s.t - s.delay;
      if (t < 0) continue;
      if (!s.mesh) {
        const m = new Mesh(this.spikeGeo, this.spikeMat);
        m.castShadow = true;
        m.scale.set(s.r, s.h, s.r);
        _q.setFromAxisAngle(_w.set(s.fwd.z, 0, -s.fwd.x), s.lean).premultiply(new Quaternion().setFromAxisAngle(_w.set(0, 1, 0), Math.random() * 2));
        m.quaternion.copy(_q);
        m.position.copy(s.at);
        g.scene.add(m);
        s.mesh = m;
        if (s.main) {
          g.emit('spike', s.at);
          this.impale(s);
        }
      }
      // up out of the sand fast, a moment there, then back down
      const rise = clamp(t / 0.07, 0, 1), sink = clamp((t - 0.55) / 0.3, 0, 1);
      s.mesh.position.y = (rise - 1 - sink) * s.h;
      if (sink >= 1) {
        g.scene.remove(s.mesh);
        this.spikes.splice(i, 1);
      }
    }
  }

  /** Whoever is standing where a spike comes up goes up with it. */
  impale(s) {
    const f = this.f, g = this.game;
    for (const e of g.fighters) {
      if (e === f || e.removed || !e.alive || s.hit.has(e) || !g.foes(f, e)) continue;
      const p = e.pelvis.x;
      if (Math.hypot(p.x - s.at.x, p.z - s.at.z) > 0.7 || p.y > s.h + 0.8) continue;
      s.hit.add(e);
      const dir = new Vector3(s.fwd.x * 0.6, 1, s.fwd.z * 0.6).normalize();
      e.takeHit({
        part: P.pelvis, point: p.clone(), dir, J: 72, speed: 12, damage: 55 * f.power, attacker: f,
        kind: 'blade', striker: null, weapon: null, swing: dir.clone(),
      });
    }
  }

  /* ---------------------------------- eat ---------------------------------- */

  /** Where the tongue comes out: the middle of the mouth. */
  mouth(out) {
    return this.f.head.toWorld(out.set(0, -0.045, 0.12).multiplyScalar(this.f.scale), out);
  }

  /** The tongue at the nearest box ragdoll in reach - in front of you, by choice. */
  eat() {
    const f = this.f, g = this.game;
    if (this.growing || this.cool.eat > 0 || this.lash || f.state !== 'active') return false;
    let best = null, bs = Infinity;
    const fx = Math.sin(f.heading), fz = Math.cos(f.heading);
    for (const e of g.fighters) {
      if (e === f || e.removed || !e.alive || !g.foes(f, e)) continue;
      const dx = e.root.x - f.root.x, dz = e.root.z - f.root.z;
      const d = Math.hypot(dx, dz);
      if (d > 9) continue;
      const s = d - ((dx * fx + dz * fz) / (d || 1)) * 1.5;
      if (s < bs) { bs = s; best = e; }
    }
    if (!best) return false;
    this.cool.eat = COOLDOWN.eat;
    const links = [];
    for (let i = 0; i < 12; i++) {
      const m = new Mesh(this.tongueGeo, this.tongueMat);
      g.scene.add(m);
      links.push(m);
    }
    this.lash = { target: best, phase: 'out', t: 0, tip: this.mouth(new Vector3()), links, from: null };
    f.face = Math.atan2(best.root.x - f.root.x, best.root.z - f.root.z);
    g.emit('lash', f);
    return true;
  }

  updateLash(dt) {
    const f = this.f, g = this.game, L = this.lash, e = L.target;
    const mouth = this.mouth(new Vector3());
    L.t += dt;
    const gone = e.removed || (L.phase === 'out' && !e.alive);
    if (gone && L.phase !== 'back') L.phase = 'back';
    if (L.phase === 'out') {
      // the tongue flies at them
      const to = e.chest.x;
      _v.subVectors(to, L.tip);
      const d = _v.length(), step = 17 * dt;
      if ((d <= step + 0.15 && L.t > 0.12) || L.t > 0.7) {
        L.tip.copy(to);
        L.phase = 'pull';
        L.t = 0;
        if (e.state === 'active' || e.state === 'stumble' || e.state === 'getup') e.enterRagdoll();
        e.lastAttacker = f;
        g.emit('grab', e);
      } else L.tip.addScaledVector(_v, step / d);
    } else if (L.phase === 'pull') {
      // and drags them in
      L.tip.copy(e.chest.x);
      for (const b of e.bodies) {
        if (b.sleeping) e.wake();
        _v.subVectors(mouth, b.x);
        const d = _v.length();
        if (d > 1e-3) b.v.lerp(_w.copy(_v).multiplyScalar(Math.min(10, d * 5) / d), 0.3);
      }
      // dangled at the mouth a moment, then the bite
      if ((L.t > 0.4 && e.chest.x.distanceTo(mouth) < 0.8 * f.scale) || L.t > 1.3) this.bite(e, mouth);
    } else if (L.phase === 'swallow') {
      // down in one, shrinking into the mouth
      const k = clamp(L.t / 0.6, 0, 1);
      for (let i = 0; i < NP; i++) {
        const b = e.bodies[i];
        _v.lerpVectors(L.from[i], mouth, smooth(k));
        b.setPose(_v, b.q);
      }
      e.look3.setScalar(e.scale * Math.max(0.02, 1 - k));
      L.tip.copy(mouth);
      if (k >= 1) {
        g.waves.discard(e);
        L.phase = 'back';
      }
    } else {
      // and back in
      _v.subVectors(mouth, L.tip);
      const d = _v.length(), step = 30 * dt;
      if (d <= step) { this.endLash(); return; }
      L.tip.addScaledVector(_v, step / d);
    }
    this.drawTongue(mouth, L.tip);
  }

  bite(e, mouth) {
    const f = this.f, g = this.game, L = this.lash;
    g.emit('chomp', f, mouth);
    g.blood.spray(e.chest.x, _v.subVectors(mouth, e.chest.x).normalize().negate(), 40, 3.5, 0.9, 0.016, e);
    e.lastAttacker = f;
    if (e.alive) e.die('eaten');
    f.heal(150);
    // held by the jaws now, not the physics
    L.from = e.bodies.map((b) => { b.setKinematic(true); return b.x.clone(); });
    L.phase = 'swallow';
    L.t = 0;
  }

  /** The tongue: a string of red boxes from the mouth to the tip, swinging a little. */
  drawTongue(a, b) {
    const links = this.lash.links, n = links.length;
    const len = a.distanceTo(b);
    const wob = Math.min(0.25, len * 0.05);
    let prev = a.clone();
    for (let i = 0; i < n; i++) {
      const k = (i + 1) / n;
      const p = new Vector3().lerpVectors(a, b, k);
      p.y += Math.sin(k * Math.PI) * wob * Math.sin(this.lash.t * 30 + i);
      const m = links[i];
      m.position.addVectors(prev, p).multiplyScalar(0.5);
      const seg = prev.distanceTo(p);
      m.quaternion.setFromUnitVectors(Z, _w.subVectors(p, prev).normalize());
      const w = 0.07 * this.f.scale * (1 - k * 0.4);
      m.scale.set(w, w * 0.5, Math.max(0.01, seg + 0.01));
      prev = p;
    }
  }

  endLash() {
    if (!this.lash) return;
    for (const m of this.lash.links) this.game.scene.remove(m);
    this.lash = null;
  }

  /* ------------------------------- changing back ---------------------------- */

  /** Yourself again: your own skin and size; main.js gives you back what you wore and carried. */
  end() {
    const f = this.f, g = this.game;
    this.endLash();
    for (const s of this.spikes) if (s.mesh) g.scene.remove(s.mesh);
    this.spikes.length = 0;
    f.setScale(1);
    // your own skin and face again (the marks the goo covered are gone with it)
    paintBody(f.paint.ctx, f.layout, f.look);
    f.faceExpr = null;
    f.paint.dirty = true;
    if (f.outfit.mesh) f.outfit.mesh.visible = true;
    this.spikeGeo.dispose(); this.spikeMat.dispose(); this.tongueGeo.dispose(); this.tongueMat.dispose();
  }
}
