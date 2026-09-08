// Pooled visual effects: tracers, impact sparks, blood, wood chips, damage
// numbers and hit markers.  Everything is recycled so combat never allocates.
import * as THREE from 'three';
import { clamp } from './util.js';

const TRACER_COUNT = 48;
const PARTICLE_COUNT = 260;
const POPUP_COUNT = 28;

export class Effects {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    // --- tracers -------------------------------------------------------
    const tracerGeo = new THREE.CylinderGeometry(0.022, 0.022, 1, 4, 1, true);
    tracerGeo.translate(0, 0.5, 0);
    tracerGeo.rotateX(Math.PI / 2);
    const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9, depthWrite: false });
    this.tracers = [];
    for (let i = 0; i < TRACER_COUNT; i++) {
      const m = new THREE.Mesh(tracerGeo, tracerMat.clone());
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
    this.tracerIdx = 0;

    // --- particles ------------------------------------------------------
    const pGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    this.particles = [];
    const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const m = new THREE.Mesh(pGeo, pMat.clone());
      m.visible = false;
      scene.add(m);
      this.particles.push({ mesh: m, life: 0, vel: new THREE.Vector3(), grav: -14 });
    }
    this.pIdx = 0;

    // --- floating damage numbers ---------------------------------------
    this.popups = [];
    for (let i = 0; i < POPUP_COUNT; i++) {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 64;
      const tex = new THREE.CanvasTexture(c);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      spr.visible = false;
      spr.renderOrder = 900;
      scene.add(spr);
      this.popups.push({ spr, canvas: c, tex, life: 0, vy: 0 });
    }
    this.popIdx = 0;
  }

  tracer(from, to, color = 0xffe9a0) {
    const t = this.tracers[this.tracerIdx = (this.tracerIdx + 1) % this.tracers.length];
    t.mesh.visible = true;
    t.mesh.position.copy(from);
    t.mesh.lookAt(to);
    const len = from.distanceTo(to);
    t.mesh.scale.set(1, 1, len);
    t.mesh.material.color.setHex(color);
    t.mesh.material.opacity = 0.95;
    t.life = 0.07;
  }

  particle(x, y, z, vx, vy, vz, color, life = 0.5, size = 1, grav = -14) {
    const p = this.particles[this.pIdx = (this.pIdx + 1) % this.particles.length];
    p.mesh.visible = true;
    p.mesh.position.set(x, y, z);
    p.size = size;
    p.mesh.scale.setScalar(size);
    p.mesh.material.color.setHex(color);
    p.vel.set(vx, vy, vz);
    p.grav = grav;
    p.life = life;
    p.max = life;
  }

  burst(point, normalish, color, count = 8, speed = 3.4, life = 0.5, size = 1) {
    for (let i = 0; i < count; i++) {
      this.particle(
        point.x, point.y, point.z,
        (Math.random() - 0.5) * speed + normalish.x * speed * 0.5,
        Math.random() * speed * 0.8 + 0.6,
        (Math.random() - 0.5) * speed + normalish.z * speed * 0.5,
        color, life * (0.6 + Math.random() * 0.6), size
      );
    }
  }

  impact(point, tag) {
    const n = { x: 0, y: 1, z: 0 };
    if (tag === 'wood') this.burst(point, n, 0x8a6136, 7, 3.0, 0.5, 1.0);
    else if (tag === 'flesh') this.burst(point, n, 0xc8303a, 8, 3.0, 0.45, 0.9);
    else if (tag === 'build') this.burst(point, n, 0xb98a4a, 6, 2.6, 0.45, 0.9);
    else this.burst(point, n, 0xcfd3d8, 6, 3.2, 0.4, 0.8);
  }

  damageNumber(x, y, z, amount, kind = 'normal') {
    const p = this.popups[this.popIdx = (this.popIdx + 1) % this.popups.length];
    const ctx = p.canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 64);
    ctx.font = 'bold 42px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(String(amount), 64, 32);
    ctx.fillStyle = kind === 'shield' ? '#63c8ff' : kind === 'crit' ? '#ffd23f' : '#ffffff';
    ctx.fillText(String(amount), 64, 32);
    p.tex.needsUpdate = true;
    p.spr.position.set(x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.5);
    p.spr.scale.set(1.1, 0.55, 1);
    p.spr.visible = true;
    p.life = 0.9; p.vy = 1.6;
  }

  update(dt) {
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.mesh.material.opacity = clamp(t.life / 0.07, 0, 1) * 0.95;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    for (const p of this.particles) {
      if (p.life > 0) {
        p.life -= dt;
        p.vel.y += p.grav * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        const s = clamp(p.life / p.max, 0, 1);
        p.mesh.scale.setScalar(Math.max(0.02, p.size * s));
        if (p.life <= 0) p.mesh.visible = false;
      }
    }
    for (const p of this.popups) {
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= dt * 1.4;
        p.spr.position.y += p.vy * dt;
        p.spr.material.opacity = clamp(p.life / 0.4, 0, 1);
        if (p.life <= 0) p.spr.visible = false;
      }
    }
  }
}
