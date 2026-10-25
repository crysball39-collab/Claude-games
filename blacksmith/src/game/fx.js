/* =============================================================================
   Effects: sparks off a pickaxe, chips off a rock, smoke from the chimney,
   steam from the quench, ore that flies to you when a rock breaks, numbers
   that float up off what you hit, and the bars and name tags over heads.

   Every kind of particle is one draw call: a quad per particle, turned to
   face the camera in the vertex shader.
   ========================================================================== */
import {
  InstancedBufferGeometry, InstancedBufferAttribute, PlaneGeometry, ShaderMaterial,
  AdditiveBlending, NormalBlending, Mesh, InstancedMesh, BoxGeometry, MeshLambertMaterial,
  Object3D, Color, Vector3, Sprite, SpriteMaterial, CanvasTexture, SRGBColorSpace, DynamicDrawUsage,
} from 'three';
import { clamp01, lerp, easeOutCubic } from '../core/util.js';
import { softDotTexture, tagCanvas, drawTag } from './textures.js';
import { oreMaterial } from './materials.js';

/* -------------------------------- billboards ------------------------------- */

const VERT = /* glsl */`
  attribute vec3 offset;
  attribute float size;
  attribute float spin;
  attribute vec4 tint;
  varying vec4 vTint;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(offset, 1.0);
    float c = cos(spin), s = sin(spin);
    vec2 p = position.xy * size;
    mv.xy += vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */`
  uniform sampler2D map;
  varying vec4 vTint;
  varying vec2 vUv;
  void main() {
    vec4 t = texture2D(map, vUv);
    gl_FragColor = vec4(vTint.rgb * t.rgb, vTint.a * t.a);
    if (gl_FragColor.a < 0.004) discard;
    #include <colorspace_fragment>
  }`;

class Billboards {
  constructor(scene, max, { additive = false, texture } = {}) {
    this.max = max;
    const quad = new PlaneGeometry(1, 1);
    const g = new InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    g.setAttribute('uv', quad.attributes.uv);
    this.offset = new InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(DynamicDrawUsage);
    this.size = new InstancedBufferAttribute(new Float32Array(max), 1).setUsage(DynamicDrawUsage);
    this.spinA = new InstancedBufferAttribute(new Float32Array(max), 1).setUsage(DynamicDrawUsage);
    this.tint = new InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(DynamicDrawUsage);
    g.setAttribute('offset', this.offset);
    g.setAttribute('size', this.size);
    g.setAttribute('spin', this.spinA);
    g.setAttribute('tint', this.tint);
    g.instanceCount = 0;
    this.material = new ShaderMaterial({
      uniforms: { map: { value: texture } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    });
    this.mesh = new Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 6 : 5;
    scene.add(this.mesh);
    this.geo = g;
    this.p = [];
  }

  /** { pos, vel, life, size, grow, gravity, drag, color (Color), alpha, fade, spin } */
  spawn(o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({
      x: o.pos.x, y: o.pos.y, z: o.pos.z,
      vx: o.vel?.x || 0, vy: o.vel?.y || 0, vz: o.vel?.z || 0,
      age: 0, life: o.life || 1, size: o.size || 0.2, grow: o.grow || 0,
      g: o.gravity || 0, drag: o.drag || 0, c: o.color || new Color(1, 1, 1),
      a: o.alpha ?? 1, fadeIn: o.fadeIn || 0, spin: o.spin || 0, rot: Math.random() * 6.28,
    });
  }

  update(dt) {
    const P = this.p;
    let n = 0;
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      q.age += dt;
      if (q.age >= q.life) continue;
      q.vy -= q.g * dt;
      const k = Math.exp(-q.drag * dt);
      q.vx *= k; q.vy *= k; q.vz *= k;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.rot += q.spin * dt;
      P[n++] = q;
    }
    P.length = n;
    const off = this.offset.array, sz = this.size.array, sp = this.spinA.array, tn = this.tint.array;
    for (let i = 0; i < n; i++) {
      const q = P[i];
      const t = q.age / q.life;
      off[i * 3] = q.x; off[i * 3 + 1] = q.y; off[i * 3 + 2] = q.z;
      sz[i] = q.size * (1 + q.grow * t);
      sp[i] = q.rot;
      const fin = q.fadeIn > 0 ? clamp01(t / q.fadeIn) : 1;
      tn[i * 4] = q.c.r; tn[i * 4 + 1] = q.c.g; tn[i * 4 + 2] = q.c.b;
      tn[i * 4 + 3] = q.a * fin * (1 - t);
    }
    this.geo.instanceCount = n;
    this.offset.needsUpdate = this.size.needsUpdate = this.spinA.needsUpdate = this.tint.needsUpdate = true;
  }

  clear() { this.p.length = 0; this.geo.instanceCount = 0; }

  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.material.dispose();
  }
}

/* ---------------------------------- chips ---------------------------------- */

/** Little tumbling boxes: rock chips, splinters, bits of bone. */
class Chips {
  constructor(scene, max) {
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial({ color: 0xffffff }), max);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
    this.max = max;
    this.p = [];
    this._o = new Object3D();
    this._c = new Color();
    // instanceColor has to exist before the first draw
    this.mesh.setColorAt(0, this._c.set(1, 1, 1));
  }

  spawn({ pos, vel, life = 0.9, size = 0.06, color = '#888', floor = 0 }) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({
      x: pos.x, y: pos.y, z: pos.z, vx: vel.x, vy: vel.y, vz: vel.z,
      rx: Math.random() * 6, ry: Math.random() * 6, sx: (Math.random() - 0.5) * 14, sy: (Math.random() - 0.5) * 14,
      age: 0, life, size, color: new Color(color), floor,
    });
  }

  update(dt) {
    const P = this.p;
    let n = 0;
    for (const q of P) {
      q.age += dt;
      if (q.age >= q.life) continue;
      q.vy -= 14 * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < q.floor + q.size / 2) {
        q.y = q.floor + q.size / 2;
        q.vy *= -0.3; q.vx *= 0.6; q.vz *= 0.6; q.sx *= 0.5; q.sy *= 0.5;
      }
      q.rx += q.sx * dt; q.ry += q.sy * dt;
      P[n++] = q;
    }
    P.length = n;
    const o = this._o;
    for (let i = 0; i < n; i++) {
      const q = P[i];
      const s = q.size * (1 - Math.pow(q.age / q.life, 3));
      o.position.set(q.x, q.y, q.z);
      o.rotation.set(q.rx, q.ry, 0);
      o.scale.set(s, s, s);
      o.updateMatrix();
      this.mesh.setMatrixAt(i, o.matrix);
      this.mesh.setColorAt(i, q.color);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.p.length = 0; this.mesh.count = 0; }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/* ---------------------------------- the lot -------------------------------- */

const SPARK = new Color('#ffb547');
const HOT = new Color('#ff7a1f');

export class Effects {
  constructor(scene, camera, floatersEl) {
    this.scene = scene;
    this.camera = camera;
    this.dot = softDotTexture(64);
    this.glow = new Billboards(scene, 260, { additive: true, texture: this.dot });
    this.smoke = new Billboards(scene, 160, { texture: this.dot });
    this.chips = new Chips(scene, 160);
    this.flyers = [];
    this.floatEl = floatersEl;
    this.floats = [];
    this._v = new Vector3();
  }

  /** Moves everything to another scene, for going in and out of the cave. */
  moveTo(scene) {
    this.scene = scene;
    for (const m of [this.glow.mesh, this.smoke.mesh, this.chips.mesh]) scene.add(m);
    this.glow.clear(); this.smoke.clear(); this.chips.clear();
    for (const f of this.flyers) { f.mesh.removeFromParent(); f.done?.(); }
    this.flyers.length = 0;
  }

  sparks(pos, n = 10, { color = SPARK, speed = 4, up = 2.5, life = 0.45, size = 0.07 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
      this.glow.spawn({
        pos, vel: { x: Math.cos(a) * s, y: up * (0.5 + Math.random()), z: Math.sin(a) * s },
        life: life * (0.6 + Math.random() * 0.7), size: size * (0.6 + Math.random() * 0.8),
        gravity: 9, drag: 1.5, color,
      });
    }
  }

  /** Bits of rock off a hit, in the rock's own colour. */
  debris(pos, n = 6, color = '#7d7a72', { speed = 3, size = 0.07, floor = 0 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random());
      this.chips.spawn({
        pos, vel: { x: Math.cos(a) * s, y: 2 + Math.random() * 3, z: Math.sin(a) * s },
        size: size * (0.5 + Math.random()), color, life: 0.8 + Math.random() * 0.6, floor,
      });
    }
  }

  dust(pos, n = 5, { color = new Color('#b8ab98'), size = 0.5, life = 0.9 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.smoke.spawn({
        pos: { x: pos.x + Math.cos(a) * 0.2, y: pos.y + Math.random() * 0.2, z: pos.z + Math.sin(a) * 0.2 },
        vel: { x: Math.cos(a) * 0.8, y: 0.4 + Math.random() * 0.4, z: Math.sin(a) * 0.8 },
        life: life * (0.7 + Math.random() * 0.6), size, grow: 1.5, drag: 1.5, color, alpha: 0.45, spin: (Math.random() - 0.5),
      });
    }
  }

  smokePuff(pos, { color = new Color('#555'), size = 0.6, alpha = 0.35, rise = 1.0, life = 3 } = {}) {
    this.smoke.spawn({
      pos, vel: { x: (Math.random() - 0.5) * 0.3, y: rise * (0.7 + Math.random() * 0.5), z: (Math.random() - 0.5) * 0.3 },
      life, size, grow: 2.2, drag: 0.3, color, alpha, fadeIn: 0.15, spin: (Math.random() - 0.5) * 0.6,
    });
  }

  steam(pos, n = 14) {
    for (let i = 0; i < n; i++) {
      this.smoke.spawn({
        pos: { x: pos.x + (Math.random() - 0.5) * 0.25, y: pos.y, z: pos.z + (Math.random() - 0.5) * 0.25 },
        vel: { x: (Math.random() - 0.5) * 0.6, y: 1.2 + Math.random() * 1.2, z: (Math.random() - 0.5) * 0.6 },
        life: 1.2 + Math.random() * 0.8, size: 0.3, grow: 3, drag: 0.8, color: new Color('#f4f4f4'), alpha: 0.55, fadeIn: 0.1,
      });
    }
  }

  /** A soft glow that flares and dies: the flash of a legendary ore. */
  flare(pos, color = HOT, size = 1.4, life = 0.5) {
    this.glow.spawn({ pos, vel: { x: 0, y: 0.2, z: 0 }, life, size, grow: 0.6, color, alpha: 0.9 });
  }

  /**
   * An ore leaps out of a broken rock and flies to whoever broke it, then
   * `done` runs: that is when it is actually yours.
   */
  oreFlyer(ore, from, target, done, delay = 0) {
    const geo = new BoxGeometry(0.13, 0.11, 0.12);
    const mesh = new Mesh(geo, oreMaterial(ore));
    mesh.position.copy(from);
    mesh.visible = delay <= 0;
    this.scene.add(mesh);
    const a = Math.random() * Math.PI * 2;
    this.flyers.push({
      mesh, target, done, delay, age: 0,
      vel: new Vector3(Math.cos(a) * 1.6, 4.2 + Math.random() * 1.5, Math.sin(a) * 1.6),
      spin: new Vector3(Math.random() * 8, Math.random() * 8, 0),
    });
  }

  update(dt) {
    this.glow.update(dt);
    this.smoke.update(dt);
    this.chips.update(dt);
    // flyers: up and out, then homing in
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      if (f.delay > 0) { f.delay -= dt; if (f.delay <= 0) f.mesh.visible = true; continue; }
      f.age += dt;
      const m = f.mesh;
      if (f.age < 0.42) {
        f.vel.y -= 13 * dt;
        m.position.addScaledVector(f.vel, dt);
        if (m.position.y < 0.1) { m.position.y = 0.1; f.vel.y = Math.abs(f.vel.y) * 0.3; }
      } else {
        const tgt = this._v.copy(f.target.position || f.target).add({ x: 0, y: 1.0, z: 0 });
        const k = 1 - Math.exp(-dt * (6 + (f.age - 0.42) * 30));
        m.position.lerp(tgt, k);
        if (m.position.distanceToSquared(tgt) < 0.09 || f.age > 1.6) {
          m.removeFromParent();
          m.geometry.dispose();
          this.flyers.splice(i, 1);
          f.done?.();
          continue;
        }
      }
      m.rotation.x += f.spin.x * dt;
      m.rotation.y += f.spin.y * dt;
    }
    this._updateFloats(dt);
  }

  /* -------------------------- floating numbers -------------------------- */

  /** Text that floats up off a point in the world and fades. */
  text(pos, str, cls = 'dmg', color = null) {
    const el = document.createElement('div');
    el.className = 'floater ' + cls;
    el.textContent = str;
    if (color) el.style.color = color;
    this.floatEl.appendChild(el);
    this.floats.push({ el, pos: new Vector3().copy(pos), age: 0, life: cls === 'ore' ? 1.3 : 0.85, dx: (Math.random() - 0.5) * 30 });
    if (this.floats.length > 24) this._dropFloat(0);
  }

  _dropFloat(i) {
    this.floats[i].el.remove();
    this.floats.splice(i, 1);
  }

  _updateFloats(dt) {
    if (!this.floats.length) return;
    const w = this.floatEl.clientWidth, h = this.floatEl.clientHeight;
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.age += dt;
      if (f.age >= f.life) { this._dropFloat(i); continue; }
      const t = f.age / f.life;
      const v = this._v.copy(f.pos).project(this.camera);
      if (v.z > 1) { f.el.style.opacity = '0'; continue; }
      const x = (v.x * 0.5 + 0.5) * w + f.dx * easeOutCubic(t);
      const y = (-v.y * 0.5 + 0.5) * h - 60 * easeOutCubic(t);
      const s = t < 0.15 ? lerp(0.6, 1.2, t / 0.15) : lerp(1.2, 1, Math.min(1, (t - 0.15) * 4));
      f.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%) scale(${s.toFixed(2)})`;
      f.el.style.opacity = String(t > 0.7 ? (1 - t) / 0.3 : 1);
    }
  }

  clear() {
    this.glow.clear(); this.smoke.clear(); this.chips.clear();
    for (const f of this.floats) f.el.remove();
    this.floats.length = 0;
    for (const f of this.flyers) { f.mesh.removeFromParent(); f.done?.(); }
    this.flyers.length = 0;
  }

  dispose() {
    this.clear();
    this.glow.dispose(); this.smoke.dispose(); this.chips.dispose();
    this.dot.dispose();
  }
}

/* ------------------------------- over heads -------------------------------- */

/** A health bar that hangs over something and always faces you. */
export class Bar3D {
  constructor(width = 0.9, height = 0.1, color = '#e8463a') {
    this.group = new Object3D();
    const bg = new Sprite(new SpriteMaterial({ color: '#140c08', transparent: true, opacity: 0.75, depthWrite: false }));
    bg.scale.set(width + 0.05, height + 0.05, 1);
    const fill = new Sprite(new SpriteMaterial({ color, depthWrite: false }));
    fill.scale.set(width, height, 1);
    // A sprite turns to face the camera but its position does not, so the
    // fill cannot be moved left to start at the bar's left edge. Its anchor
    // can: see set().
    this.group.add(bg, fill);
    bg.renderOrder = 8; fill.renderOrder = 9;
    this.bg = bg; this.fill = fill;
    this.width = width;
    this.group.visible = false;
    this._f = 1;
  }

  set(frac) {
    const f = clamp01(frac);
    if (Math.abs(f - this._f) < 0.002) return;
    this._f = f;
    this.fill.visible = f > 0.002;
    if (!this.fill.visible) return;
    this.fill.scale.x = this.width * f;
    // the left edge of a quad f wide, anchored at the middle of a bar 1 wide
    this.fill.center.x = 0.5 / f;
  }

  dispose() {
    this.bg.material.dispose();
    this.fill.material.dispose();
  }
}

/** A name, or a level, floating over a head. */
export class Tag {
  constructor(text, opts = {}) {
    this.opts = { w: 256, h: 72, ...opts };
    this.canvas = tagCanvas(text, this.opts);
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.sprite = new Sprite(new SpriteMaterial({ map: this.texture, depthWrite: false, transparent: true }));
    const scale = opts.scale || 0.9;
    this.sprite.scale.set(scale, scale * this.opts.h / this.opts.w, 1);
    this.sprite.renderOrder = 10;
    this.text = text;
  }

  set(text, opts = {}) {
    if (text === this.text && !opts.force) return;
    this.text = text;
    Object.assign(this.opts, opts);
    drawTag(this.canvas.getContext('2d'), text, this.opts);
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
    this.sprite.material.dispose();
  }
}
