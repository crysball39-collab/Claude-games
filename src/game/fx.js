/* =============================================================================
   Effects: fire, embers, smoke, sparks, splashes, shockwaves and flashes.

   Particles are GL points with a soft round falloff drawn in the shader, so
   there is no texture to ship and a thousand of them cost one draw call per
   blend mode. Additive for anything that glows; normal for smoke and water.

   Lights are a fixed pool that never leaves the scene. three.js rebuilds every
   material's shader when the NUMBER of lights changes, so a flash that added
   and removed its own light would stutter the whole frame each time.
   ========================================================================== */
import {
  BufferGeometry, BufferAttribute, Points, ShaderMaterial, AdditiveBlending,
  NormalBlending, Color, PointLight, Mesh, RingGeometry, SphereGeometry,
  MeshBasicMaterial, DoubleSide, Vector3,
} from 'three';
import { makeRng, clamp01 } from '../core/util.js';

const _c = new Color(), _c2 = new Color();
const _v = new Vector3();

const VERT = /* glsl */`
  attribute float size;
  attribute vec4 tint;
  varying vec4 vTint;
  uniform float scale;
  void main() {
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(size * scale / max(0.05, -mv.z), 0.0, 512.0);
    gl_Position = projectionMatrix * mv;
  }
`;
/* A glowing ball: bright where you look straight into it, fading to
   nothing at the rim, so it reads as light rather than as a painted disc. */
const GLOW_VERT = /* glsl */`
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const GLOW_FRAG = /* glsl */`
  uniform vec3 color;
  uniform float opacity;
  uniform float falloff;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float f = max(dot(normalize(vN), normalize(vV)), 0.0);
    gl_FragColor = vec4(color, opacity * pow(f, falloff));
    #include <colorspace_fragment>
  }
`;

/**
 * Additive glow for a sphere. Set `material.uniforms.opacity.value` to fade
 * it, and `material.uniforms.color.value` to tint it.
 */
export function softGlowMaterial(color, opacity = 0.6, falloff = 2.2) {
  return new ShaderMaterial({
    vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG,
    uniforms: {
      color: { value: new Color(color) },
      opacity: { value: opacity },
      falloff: { value: falloff },
    },
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
}

const FRAG = /* glsl */`
  varying vec4 vTint;
  uniform float hard;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float a = 1.0 - d;
    a = mix(a * a, smoothstep(1.0, 0.7, d), hard);
    gl_FragColor = vec4(vTint.rgb, vTint.a * a);
  }
`;

/** One pool of points with one blend mode. */
class ParticlePool {
  constructor(scene, max, { additive = true, hard = 0 } = {}) {
    this.max = max;
    this.geo = new BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.tint = new Float32Array(max * 4);
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geo.setAttribute('size', new BufferAttribute(this.size, 1));
    this.geo.setAttribute('tint', new BufferAttribute(this.tint, 4));
    this.mat = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { scale: { value: 400 }, hard: { value: hard } },
      transparent: true, depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    });
    this.points = new Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
    scene.add(this.points);
    // state, struct of arrays
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.a0 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.cursor = 0;
    this.alive = 0;
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, col0, col1, alpha, drag, grav) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1;
    _c.set(col0); _c2.set(col1);
    this.c0[k] = _c.r; this.c0[k + 1] = _c.g; this.c0[k + 2] = _c.b;
    this.c1[k] = _c2.r; this.c1[k + 1] = _c2.g; this.c1[k + 2] = _c2.b;
    this.a0[i] = alpha;
    this.drag[i] = drag;
    this.grav[i] = grav;
  }

  update(dt, scale) {
    this.mat.uniforms.scale.value = scale;
    let n = 0;
    for (let i = 0; i < this.max; i++) {
      const k = i * 3, t4 = i * 4;
      if (this.life[i] <= 0) { this.size[i] = 0; this.tint[t4 + 3] = 0; continue; }
      n++;
      this.life[i] -= dt;
      const t = 1 - clamp01(this.life[i] / this.maxLife[i]);
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[k] *= dr; this.vel[k + 1] = this.vel[k + 1] * dr + this.grav[i] * dt; this.vel[k + 2] *= dr;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.tint[t4] = this.c0[k] + (this.c1[k] - this.c0[k]) * t;
      this.tint[t4 + 1] = this.c0[k + 1] + (this.c1[k + 1] - this.c0[k + 1]) * t;
      this.tint[t4 + 2] = this.c0[k + 2] + (this.c1[k + 2] - this.c0[k + 2]) * t;
      // in quickly, out slowly
      const fade = t < 0.08 ? t / 0.08 : 1 - (t - 0.08) / 0.92;
      this.tint[t4 + 3] = this.a0[i] * Math.max(0, fade);
    }
    this.alive = n;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.tint.needsUpdate = true;
  }

  clear() { this.life.fill(0); }

  dispose() {
    this.points.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}

export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.rng = makeRng(0xf1e);
    this.glow = new ParticlePool(scene, 1400, { additive: true });
    this.soft = new ParticlePool(scene, 500, { additive: false, hard: 0.15 });

    this.lights = [];
    for (let i = 0; i < 2; i++) {
      const l = new PointLight(0xff7a30, 0, 8, 1.8);
      l.userData = { life: 0, max: 1, peak: 0 };
      scene.add(l);
      this.lights.push(l);
    }

    // expanding rings on the ground, for anything heavy landing or going off
    this.rings = [];
    const ringGeo = new RingGeometry(0.82, 1, 48);
    ringGeo.rotateX(-Math.PI / 2);
    this.ringGeo = ringGeo;
    for (let i = 0; i < 4; i++) {
      const mat = new MeshBasicMaterial({
        color: 0xff7a30, transparent: true, opacity: 0, blending: AdditiveBlending,
        depthWrite: false, side: DoubleSide,
      });
      const m = new Mesh(ringGeo, mat);
      m.visible = false;
      m.renderOrder = 7;
      m.userData = { life: 0, max: 1, r0: 0.5, r1: 4 };
      scene.add(m);
      this.rings.push(m);
    }

    // the white-hot ball at the heart of an explosion
    this.flashes = [];
    this.flashGeo = new SphereGeometry(1, 16, 12);
    for (let i = 0; i < 3; i++) {
      const mat = new MeshBasicMaterial({
        color: 0xffd9a0, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false,
      });
      const m = new Mesh(this.flashGeo, mat);
      m.visible = false;
      m.renderOrder = 8;
      m.userData = { life: 0, max: 1, r: 1 };
      scene.add(m);
      this.flashes.push(m);
    }
    this.scale = 400;
  }

  /** Pixels a one metre particle covers at one metre away, for the shader. */
  setView(camera, heightPx) {
    this.scale = heightPx / (2 * Math.tan((camera.fov * Math.PI) / 360));
  }

  /* --------------------------------- emitters ------------------------------- */

  /** Licks of flame: rise, swell, cool from yellow through orange to nothing. */
  fire(pos, { count = 6, spread = 0.12, up = 1.6, size = 0.32, life = 0.55, vel = null } = {}) {
    const r = this.rng;
    for (let i = 0; i < count; i++) {
      const vx = (r() - 0.5) * 0.8 + (vel ? vel.x : 0);
      const vy = up * (0.6 + r() * 0.8) + (vel ? vel.y : 0);
      const vz = (r() - 0.5) * 0.8 + (vel ? vel.z : 0);
      this.glow.spawn(
        pos.x + (r() - 0.5) * spread * 2, pos.y + (r() - 0.5) * spread, pos.z + (r() - 0.5) * spread * 2,
        vx, vy, vz, life * (0.6 + r() * 0.7),
        size * (0.5 + r() * 0.4), size * (1.1 + r() * 0.6),
        r() < 0.35 ? 0xfff2b0 : 0xffb43a, r() < 0.5 ? 0xb8200a : 0x601008,
        0.9, 2.2, 0.8,
      );
    }
  }

  /** Small bright sparks that rise, drift and wink out. */
  embers(pos, { count = 4, spread = 0.25, up = 1.2, life = 1.4 } = {}) {
    const r = this.rng;
    for (let i = 0; i < count; i++) {
      this.glow.spawn(
        pos.x + (r() - 0.5) * spread * 2, pos.y + (r() - 0.5) * spread, pos.z + (r() - 0.5) * spread * 2,
        (r() - 0.5) * 1.2, up * (0.4 + r()), (r() - 0.5) * 1.2,
        life * (0.5 + r() * 0.8), 0.05 + r() * 0.04, 0.02,
        0xffd070, 0xff3a10, 1, 1.4, 0.3,
      );
    }
  }

  smoke(pos, { count = 4, spread = 0.3, up = 0.9, size = 0.7, life = 2.2, dark = 0.16 } = {}) {
    const r = this.rng;
    for (let i = 0; i < count; i++) {
      const v = 0.12 + r() * dark;
      _c.setRGB(v, v * 0.92, v * 0.88);
      this.soft.spawn(
        pos.x + (r() - 0.5) * spread * 2, pos.y + (r() - 0.5) * spread, pos.z + (r() - 0.5) * spread * 2,
        (r() - 0.5) * 0.6, up * (0.5 + r() * 0.6), (r() - 0.5) * 0.6,
        life * (0.6 + r() * 0.6), size * 0.5, size * (1.4 + r()),
        _c.getHex(), 0x2a2624, 0.42, 0.9, 0.35,
      );
    }
  }

  /** Hot fragments thrown out hard: they fall, which embers do not. */
  sparks(pos, dir = null, { count = 14, speed = 9, life = 0.6 } = {}) {
    const r = this.rng;
    for (let i = 0; i < count; i++) {
      _v.set(r() - 0.5, r() * 0.8, r() - 0.5).normalize();
      if (dir) _v.addScaledVector(dir, 0.9).normalize();
      const s = speed * (0.4 + r() * 0.8);
      this.glow.spawn(pos.x, pos.y, pos.z, _v.x * s, _v.y * s, _v.z * s,
        life * (0.5 + r()), 0.08, 0.03, 0xfff0c0, 0xff4a10, 1, 1.1, -14);
    }
  }

  /** Water thrown up by something landing in it. */
  splash(pos, speed = 6) {
    const r = this.rng;
    const n = Math.min(40, 10 + speed * 2) | 0;
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, out = 0.8 + r() * 1.6;
      this.soft.spawn(pos.x, pos.y + 0.05, pos.z,
        Math.cos(a) * out, 1.8 + r() * speed * 0.45, Math.sin(a) * out,
        0.5 + r() * 0.5, 0.09 + r() * 0.08, 0.05, 0xdff4ff, 0x9fc8d8, 0.7, 0.6, -18);
    }
  }

  /** A ring of light spreading out across the ground. */
  ring(pos, { radius = 4, life = 0.55, color = 0xff7a30, y = null } = {}) {
    const m = this.rings.find((x) => x.userData.life <= 0) || this.rings[0];
    m.position.set(pos.x, (y ?? pos.y) + 0.05, pos.z);
    m.material.color.set(color);
    m.userData.life = life; m.userData.max = life;
    m.userData.r0 = radius * 0.15; m.userData.r1 = radius;
    m.visible = true;
  }

  /** A burst of light from one of the pool. */
  light(pos, { color = 0xff8a40, intensity = 30, life = 0.35, distance = 10 } = {}) {
    let l = this.lights[0];
    for (const x of this.lights) if (x.userData.life < l.userData.life) l = x;
    l.position.copy(pos);
    l.color.set(color);
    l.distance = distance;
    l.userData.life = life; l.userData.max = life; l.userData.peak = intensity;
    l.intensity = intensity;
  }

  /** The white ball at the middle of a blast. */
  flash(pos, { radius = 1, life = 0.22, color = 0xffd9a0 } = {}) {
    const m = this.flashes.find((x) => x.userData.life <= 0) || this.flashes[0];
    m.position.copy(pos);
    m.material.color.set(color);
    m.userData.life = life; m.userData.max = life; m.userData.r = radius;
    m.visible = true;
  }

  /** Everything at once, scaled: what a fireball does when it lands. */
  explosion(pos, { scale = 1, color = 0xff7a30 } = {}) {
    this.flash(pos, { radius: 0.9 * scale, life: 0.2 + 0.08 * scale });
    this.fire(pos, { count: Math.round(22 * scale), spread: 0.35 * scale, up: 2.4 * scale,
      size: 0.55 * scale, life: 0.7 });
    this.sparks(pos, null, { count: Math.round(18 * scale), speed: 8 * scale });
    this.smoke(pos, { count: Math.round(8 * scale), spread: 0.5 * scale, size: 1.1 * scale });
    this.embers(pos, { count: Math.round(12 * scale), spread: 0.6 * scale, up: 2 });
    this.light(pos, { color, intensity: 40 * scale, life: 0.45, distance: 9 * scale });
  }

  /* ---------------------------------- frame --------------------------------- */

  update(dt, camera = null, heightPx = 0) {
    if (camera && heightPx) this.setView(camera, heightPx);
    this.glow.update(dt, this.scale);
    this.soft.update(dt, this.scale);
    for (const l of this.lights) {
      const u = l.userData;
      if (u.life <= 0) { l.intensity = 0; continue; }
      u.life -= dt;
      l.intensity = u.peak * Math.max(0, u.life / u.max) ** 1.5;
    }
    for (const m of this.rings) {
      const u = m.userData;
      if (u.life <= 0) { m.visible = false; continue; }
      u.life -= dt;
      const t = 1 - Math.max(0, u.life / u.max);
      const r = u.r0 + (u.r1 - u.r0) * (1 - (1 - t) * (1 - t));
      m.scale.set(r, 1, r);
      m.material.opacity = 0.85 * (1 - t);
    }
    for (const m of this.flashes) {
      const u = m.userData;
      if (u.life <= 0) { m.visible = false; continue; }
      u.life -= dt;
      const t = 1 - Math.max(0, u.life / u.max);
      m.scale.setScalar(u.r * (0.5 + t * 0.9));
      m.material.opacity = 1 - t;
    }
  }

  clear() {
    this.glow.clear(); this.soft.clear();
    for (const l of this.lights) { l.userData.life = 0; l.intensity = 0; }
    for (const m of this.rings) { m.userData.life = 0; m.visible = false; }
    for (const m of this.flashes) { m.userData.life = 0; m.visible = false; }
  }

  dispose() {
    this.glow.dispose(); this.soft.dispose();
    for (const l of this.lights) l.removeFromParent();
    for (const m of this.rings) { m.removeFromParent(); m.material.dispose(); }
    for (const m of this.flashes) { m.removeFromParent(); m.material.dispose(); }
    this.ringGeo.dispose();
    this.flashGeo.dispose();
  }
}
