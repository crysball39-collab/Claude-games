// Structure + furniture kit.  Every builder call adds a mesh to the POI group
// and (unless marked decorative) a collider, so the same data drives rendering,
// walking and bullets.
import * as THREE from 'three';
import { mat } from './models.js';

export class Door {
  constructor(pivot, collider, opts = {}) {
    this.kind = 'door';
    this.pivot = pivot;
    this.collider = collider;
    this.open = false;
    this.angle = 0;
    this.target = 0;
    this.swing = opts.swing ?? Math.PI * 0.62;
    this.world = new THREE.Vector3();
    pivot.getWorldPosition(this.world);
  }
  toggle() {
    this.open = !this.open;
    this.target = this.open ? this.swing : 0;
    this.collider.solid = !this.open;
  }
  update(dt) {
    if (Math.abs(this.angle - this.target) < 0.001) return;
    const sp = 7.5 * dt;
    this.angle += Math.sign(this.target - this.angle) * Math.min(sp, Math.abs(this.target - this.angle));
    this.pivot.rotation.y = this.angle;
  }
}

export class StructureBuilder {
  constructor(scene, physics, name = 'structure') {
    this.scene = scene;
    this.physics = physics;
    this.group = new THREE.Group();
    this.group.name = name;
    scene.add(this.group);
    this.doors = [];
    this.props = [];
    this.chestSpots = [];
    this.parent = this.group;
  }

  /** Temporarily parent new meshes under `g` (used for rotated sub-assemblies). */
  into(g, fn) {
    const prev = this.parent;
    this.parent = g;
    fn();
    this.parent = prev;
  }

  mesh(m, x, y, z, rotY = 0) {
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    this.parent.add(m);
    return m;
  }

  /** Decorative box (no collision). */
  deco(cx, cy, cz, sx, sy, sz, color, rotY = 0, opts = {}) {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    const m = new THREE.Mesh(geo, opts.material || mat(color, opts.matOpts || {}));
    m.castShadow = opts.castShadow ?? true;
    m.receiveShadow = true;
    return this.mesh(m, cx, cy, cz, rotY);
  }

  _aabbFor(cx, cy, cz, sx, sy, sz, rotY) {
    if (!rotY) return [cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2];
    const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
    const ex = (sx * c + sz * s) / 2, ez = (sx * s + sz * c) / 2;
    return [cx - ex, cy - sy / 2, cz - ez, cx + ex, cy + sy / 2, cz + ez];
  }

  /** Solid box: mesh + collider. */
  solid(cx, cy, cz, sx, sy, sz, color, rotY = 0, opts = {}) {
    const m = this.deco(cx, cy, cz, sx, sy, sz, color, rotY, opts);
    const [a, b, c, d, e, f] = this._aabbFor(cx, cy, cz, sx, sy, sz, rotY);
    const col = this.physics.addBox(a, b, c, d, e, f, { tag: opts.tag || null });
    m.userData.collider = col;
    if (opts.wood) {
      const prop = { kind: 'prop', hp: opts.wood.hp, maxHp: opts.wood.hp, wood: opts.wood.amount, mesh: m, collider: col, alive: true, builder: this };
      col.owner = prop; col.tag = 'wood';
      m.userData.dynamic = true;     // destructible: keep it out of the merged mesh
      this.props.push(prop);
    }
    return m;
  }

  /** Invisible collider (used for tower shells / cliff blockers). */
  blocker(cx, cy, cz, sx, sy, sz) {
    const [a, b, c, d, e, f] = this._aabbFor(cx, cy, cz, sx, sy, sz, 0);
    return this.physics.addBox(a, b, c, d, e, f);
  }

  cylSolid(cx, cy, cz, r, h, color, seg = 14, opts = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg, 1, opts.open || false),
      opts.material || mat(color));
    m.castShadow = true; m.receiveShadow = true;
    if (opts.open) { m.material = (opts.material || mat(color)).clone(); m.material.side = THREE.DoubleSide; }
    this.mesh(m, cx, cy, cz);
    if (!opts.noCollide) this.physics.addCyl(cx, cz, r, cy - h / 2, cy + h / 2, { tag: opts.tag || null });
    return m;
  }

  /**
   * Wall with a rectangular hole for a door/window.
   * axis 'x' -> wall runs along X; 'z' -> runs along Z.
   */
  wallWithHole(cx, cy, cz, len, height, thick, color, axis, holeCenter, holeW, holeH, holeBottom = 0) {
    const half = len / 2;
    const l0 = -half, l1 = half;
    const hl = holeCenter - holeW / 2, hr = holeCenter + holeW / 2;
    const segs = [];
    if (hl > l0 + 0.02) segs.push({ c: (l0 + hl) / 2, w: hl - l0, y: cy, h: height });
    if (l1 > hr + 0.02) segs.push({ c: (hr + l1) / 2, w: l1 - hr, y: cy, h: height });
    // lintel above the hole
    const topH = height - (holeBottom + holeH);
    if (topH > 0.02) segs.push({ c: holeCenter, w: holeW, y: cy - height / 2 + holeBottom + holeH + topH / 2, h: topH });
    if (holeBottom > 0.02) segs.push({ c: holeCenter, w: holeW, y: cy - height / 2 + holeBottom / 2, h: holeBottom });
    for (const s of segs) {
      if (axis === 'x') this.solid(cx + s.c, s.y, cz, s.w, s.h, thick, color);
      else this.solid(cx, s.y, cz + s.c, thick, s.h, s.w, color);
    }
  }

  /** Hinged door filling a hole. `axis` matches wallWithHole. */
  door(x, y, z, w, h, axis, opts = {}) {
    const pivot = new THREE.Group();
    const dir = opts.flip ? -1 : 1;
    pivot.position.set(x + (axis === 'x' ? -dir * w / 2 : 0), y, z + (axis === 'z' ? -dir * w / 2 : 0));
    this.parent.add(pivot);
    const color = opts.color ?? 0x7a5433;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? w : 0.12, h, axis === 'x' ? 0.12 : w),
      mat(color));
    panel.castShadow = true; panel.receiveShadow = true;
    panel.position.set(axis === 'x' ? dir * w / 2 : 0, h / 2, axis === 'z' ? dir * w / 2 : 0);
    pivot.add(panel);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), mat(0xd8c070));
    knob.position.set(axis === 'x' ? dir * (w - 0.16) : 0.1, h * 0.5, axis === 'z' ? dir * (w - 0.16) : 0.1);
    pivot.add(knob);

    const cw = axis === 'x' ? w : 0.16, cd = axis === 'x' ? 0.16 : w;
    const col = this.physics.addBox(x - cw / 2, y, z - cd / 2, x + cw / 2, y + h, z + cd / 2, { tag: 'door' });
    pivot.userData.dynamic = true;
    const d = new Door(pivot, col, { swing: dir * Math.PI * 0.6 });
    d.pos = new THREE.Vector3(x, y, z);
    col.owner = d;
    this.doors.push(d);
    return d;
  }

  /** Slab (floor/ceiling) with a rectangular stairwell hole cut out. */
  slabWithHole(cx, cy, cz, w, d, thick, color, hole) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    if (!hole) { this.solid(cx, cy, cz, w, thick, d, color); return; }
    const hx0 = Math.max(x0, hole.x0), hx1 = Math.min(x1, hole.x1);
    const hz0 = Math.max(z0, hole.z0), hz1 = Math.min(z1, hole.z1);
    const rect = (ax0, az0, ax1, az1) => {
      if (ax1 - ax0 < 0.05 || az1 - az0 < 0.05) return;
      this.solid((ax0 + ax1) / 2, cy, (az0 + az1) / 2, ax1 - ax0, thick, az1 - az0, color);
    };
    rect(x0, z0, x1, hz0);
    rect(x0, hz1, x1, z1);
    rect(x0, hz0, hx0, hz1);
    rect(hx1, hz0, x1, hz1);
  }

  /** Straight staircase from (x,y0) up to y1, running along +Z or +X. */
  stairs(x, y0, z, y1, axis = 'z', width = 1.4, color = 0x8a6640, dir = 1, rise = 0.3, run = 0.32) {
    const steps = Math.max(1, Math.round((y1 - y0) / rise));
    for (let i = 0; i < steps; i++) {
      const h = y0 + (i + 1) * ((y1 - y0) / steps);
      const off = dir * (i * run + run / 2);
      if (axis === 'z') this.solid(x, h - 0.09, z + off, width, 0.18, run + 0.02, color);
      else this.solid(x + off, h - 0.09, z, run + 0.02, 0.18, width, color);
    }
    return { length: steps * run, top: y1 };
  }

  /** Registers a spot where a chest may spawn. */
  chestSpot(x, y, z, rotY = 0, tag = '') {
    this.chestSpots.push({ x, y, z, rotY, tag });
  }

  // --- furniture ---------------------------------------------------------
  woodOpts(hp, amount) { return { wood: { hp, amount } }; }

  sofa(x, y, z, rot = 0, color = 0x8a4a3a) {
    const g = new THREE.Group();
    this.mesh(g, x, y, z, rot);
    this.into(g, () => {
      this.deco(0, 0.22, 0, 2.0, 0.44, 0.9, color);
      this.deco(0, 0.60, -0.36, 2.0, 0.72, 0.2, color);
      this.deco(-0.95, 0.48, 0, 0.16, 0.5, 0.9, color);
      this.deco(0.95, 0.48, 0, 0.16, 0.5, 0.9, color);
      this.deco(-0.48, 0.48, 0.02, 0.85, 0.14, 0.8, 0xa05a48);
      this.deco(0.48, 0.48, 0.02, 0.85, 0.14, 0.8, 0xa05a48);
    });
    const c = this._aabbFor(x, y + 0.35, z, 2.1, 0.7, 1.0, rot);
    const col = this.physics.addBox(...c, { tag: 'wood' });
    col.owner = { kind: 'prop', hp: 130, maxHp: 130, wood: 26, mesh: g, collider: col, alive: true };
    col.owner.mesh.userData.dynamic = true;
    this.props.push(col.owner);
    return g;
  }

  table(x, y, z, rot = 0, w = 1.6, d = 0.9, color = 0x7a5433) {
    const g = new THREE.Group();
    this.mesh(g, x, y, z, rot);
    const h = 0.78;
    this.into(g, () => {
      this.deco(0, h, 0, w, 0.09, d, color);
      for (const sx of [-1, 1]) for (const sz of [-1, 1])
        this.deco(sx * (w / 2 - 0.12), h / 2, sz * (d / 2 - 0.12), 0.1, h, 0.1, color);
    });
    const c = this._aabbFor(x, y + h / 2 + 0.02, z, w, h + 0.09, d, rot);
    const col = this.physics.addBox(...c, { tag: 'wood' });
    col.owner = { kind: 'prop', hp: 110, maxHp: 110, wood: 24, mesh: g, collider: col, alive: true };
    col.owner.mesh.userData.dynamic = true;
    this.props.push(col.owner);
    g.userData.top = y + h + 0.05;
    return g;
  }

  chair(x, y, z, rot = 0, color = 0x7a5433) {
    const g = new THREE.Group();
    this.mesh(g, x, y, z, rot);
    this.into(g, () => {
      this.deco(0, 0.46, 0, 0.5, 0.08, 0.5, color);
      this.deco(0, 0.75, -0.21, 0.5, 0.6, 0.08, color);
      for (const sx of [-1, 1]) for (const sz of [-1, 1])
        this.deco(sx * 0.2, 0.23, sz * 0.2, 0.07, 0.46, 0.07, color);
    });
    const c = this._aabbFor(x, y + 0.28, z, 0.55, 0.56, 0.55, rot);
    const col = this.physics.addBox(...c, { tag: 'wood' });
    col.owner = { kind: 'prop', hp: 70, maxHp: 70, wood: 16, mesh: g, collider: col, alive: true };
    col.owner.mesh.userData.dynamic = true;
    this.props.push(col.owner);
    g.userData.top = y + 0.52;
    return g;
  }

  tv(x, y, z, rot = 0) {
    const g = new THREE.Group();
    this.mesh(g, x, y, z, rot);
    this.into(g, () => {
      this.deco(0, 0.30, 0, 1.5, 0.6, 0.42, 0x5a4030);
      this.deco(0, 0.92, -0.02, 1.25, 0.72, 0.09, 0x1a1c20);
      this.deco(0, 0.92, 0.04, 1.12, 0.6, 0.02, 0x2a3550);
    });
    const c = this._aabbFor(x, y + 0.3, z, 1.5, 0.6, 0.45, rot);
    const col = this.physics.addBox(...c, { tag: 'wood' });
    col.owner = { kind: 'prop', hp: 90, maxHp: 90, wood: 20, mesh: g, collider: col, alive: true };
    col.owner.mesh.userData.dynamic = true;
    this.props.push(col.owner);
    return g;
  }

  rug(x, y, z, rot = 0, w = 2.6, d = 1.8, color = 0x8c3b45) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), mat(color));
    m.receiveShadow = true; m.castShadow = false;
    return this.mesh(m, x, y + 0.02, z, rot);
  }

  bed(x, y, z, rot = 0, sheet = 0xdfe6ee) {
    const g = new THREE.Group();
    this.mesh(g, x, y, z, rot);
    this.into(g, () => {
      this.deco(0, 0.28, 0, 1.2, 0.34, 2.1, 0x6b4a2e);
      this.deco(0, 0.52, 0.08, 1.16, 0.18, 1.9, sheet);
      this.deco(0, 0.62, -0.82, 0.86, 0.16, 0.4, 0xffffff);
      this.deco(0, 0.7, -1.08, 1.2, 0.8, 0.1, 0x6b4a2e);
    });
    const c = this._aabbFor(x, y + 0.3, z, 1.25, 0.62, 2.2, rot);
    const col = this.physics.addBox(...c, { tag: 'wood' });
    col.owner = { kind: 'prop', hp: 120, maxHp: 120, wood: 24, mesh: g, collider: col, alive: true };
    col.owner.mesh.userData.dynamic = true;
    this.props.push(col.owner);
    return g;
  }

  toilet(x, y, z, rot = 0) {
    const g = new THREE.Group();
    this.mesh(g, x, y, z, rot);
    this.into(g, () => {
      this.deco(0, 0.2, 0, 0.42, 0.4, 0.55, 0xf2f4f6);
      this.deco(0, 0.42, 0.03, 0.44, 0.08, 0.5, 0xe6e9ec);
      this.deco(0, 0.55, -0.3, 0.42, 0.7, 0.22, 0xf2f4f6);
    });
    const c = this._aabbFor(x, y + 0.35, z, 0.5, 0.7, 0.6, rot);
    this.physics.addBox(...c);
    return g;
  }

  sink(x, y, z, rot = 0) {
    const g = new THREE.Group();
    this.mesh(g, x, y, z, rot);
    this.into(g, () => {
      this.deco(0, 0.75, 0, 0.75, 0.16, 0.45, 0xf2f4f6);
      this.deco(0, 0.4, -0.1, 0.2, 0.7, 0.2, 0xe0e3e6);
      this.deco(0, 0.9, -0.14, 0.07, 0.2, 0.07, 0xb9c2cc);
      this.deco(0, 1.55, 0, 0.7, 0.9, 0.06, 0xcfe3ee);
    });
    const c = this._aabbFor(x, y + 0.45, z, 0.8, 0.9, 0.5, rot);
    this.physics.addBox(...c);
    return g;
  }

  bathtub(x, y, z, rot = 0) {
    const g = new THREE.Group();
    this.mesh(g, x, y, z, rot);
    this.into(g, () => {
      this.deco(0, 0.28, 0, 1.7, 0.56, 0.85, 0xf2f4f6);
      this.deco(0, 0.5, 0, 1.5, 0.2, 0.65, 0xdfeaf2);
    });
    const c = this._aabbFor(x, y + 0.3, z, 1.75, 0.6, 0.9, rot);
    this.physics.addBox(...c);
    return g;
  }

  counter(x, y, z, rot = 0, w = 2.2, color = 0x8a6a45) {
    const g = new THREE.Group();
    this.mesh(g, x, y, z, rot);
    this.into(g, () => {
      this.deco(0, 0.45, 0, w, 0.9, 0.65, color);
      this.deco(0, 0.93, 0, w + 0.06, 0.07, 0.7, 0x4a4f55);
      for (let i = -1; i <= 1; i += 2) this.deco(i * w * 0.22, 0.6, 0.33, w * 0.36, 0.5, 0.03, 0x9c7a52);
    });
    const c = this._aabbFor(x, y + 0.48, z, w, 0.96, 0.7, rot);
    const col = this.physics.addBox(...c, { tag: 'wood' });
    col.owner = { kind: 'prop', hp: 140, maxHp: 140, wood: 28, mesh: g, collider: col, alive: true };
    col.owner.mesh.userData.dynamic = true;
    this.props.push(col.owner);
    return g;
  }

  fridge(x, y, z, rot = 0) {
    const g = new THREE.Group();
    this.mesh(g, x, y, z, rot);
    this.into(g, () => {
      this.deco(0, 0.9, 0, 0.8, 1.8, 0.7, 0xd6dade);
      this.deco(0, 1.25, 0.36, 0.76, 1.05, 0.04, 0xc2c8cd);
      this.deco(0, 0.5, 0.36, 0.76, 0.85, 0.04, 0xc2c8cd);
      this.deco(0.3, 1.0, 0.4, 0.05, 0.5, 0.05, 0x8b9199);
    });
    const c = this._aabbFor(x, y + 0.9, z, 0.85, 1.8, 0.75, rot);
    this.physics.addBox(...c);
    return g;
  }

  stove(x, y, z, rot = 0) {
    const g = new THREE.Group();
    this.mesh(g, x, y, z, rot);
    this.into(g, () => {
      this.deco(0, 0.45, 0, 0.9, 0.9, 0.65, 0x3a3f45);
      this.deco(0, 0.92, 0, 0.92, 0.06, 0.67, 0x22262b);
      for (const sx of [-0.22, 0.22]) for (const sz of [-0.15, 0.15])
        this.deco(sx, 0.96, sz, 0.22, 0.03, 0.22, 0x101215);
    });
    const c = this._aabbFor(x, y + 0.47, z, 0.95, 0.95, 0.7, rot);
    this.physics.addBox(...c);
    return g;
  }

  shelf(x, y, z, rot = 0, w = 1.6, h = 1.9, color = 0x7a5433) {
    const g = new THREE.Group();
    this.mesh(g, x, y, z, rot);
    this.into(g, () => {
      this.deco(-w / 2, h / 2, 0, 0.08, h, 0.42, color);
      this.deco(w / 2, h / 2, 0, 0.08, h, 0.42, color);
      for (let i = 0; i <= 3; i++) this.deco(0, (h / 3) * i + 0.02, 0, w, 0.07, 0.42, color);
      this.deco(0, h / 2, -0.21, w, h, 0.05, 0x63482c);
    });
    const c = this._aabbFor(x, y + h / 2, z, w, h, 0.45, rot);
    const col = this.physics.addBox(...c, { tag: 'wood' });
    col.owner = { kind: 'prop', hp: 110, maxHp: 110, wood: 24, mesh: g, collider: col, alive: true };
    col.owner.mesh.userData.dynamic = true;
    this.props.push(col.owner);
    return g;
  }

  crate(x, y, z, rot = 0, s = 0.9) {
    const g = new THREE.Group();
    this.mesh(g, x, y, z, rot);
    this.into(g, () => {
      this.deco(0, s / 2, 0, s, s, s, 0x8a6136);
      this.deco(0, s / 2, 0, s * 1.02, s * 0.16, s * 1.02, 0x6b4526);
      this.deco(0, s * 0.9, 0, s * 1.02, s * 0.14, s * 1.02, 0x6b4526);
    });
    const c = this._aabbFor(x, y + s / 2, z, s, s, s, rot);
    const col = this.physics.addBox(...c, { tag: 'wood' });
    col.owner = { kind: 'prop', hp: 80, maxHp: 80, wood: 22, mesh: g, collider: col, alive: true };
    col.owner.mesh.userData.dynamic = true;
    this.props.push(col.owner);
    g.userData.top = y + s;
    return g;
  }

  barrel(x, y, z, color = 0x6b4526) {
    const g = new THREE.Group();
    this.mesh(g, x, y, z, 0);
    this.into(g, () => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 10), mat(color));
      m.castShadow = true; m.receiveShadow = true; m.position.y = 0.5;
      this.parent.add(m);
      this.deco(0, 0.28, 0, 0.88, 0.1, 0.88, 0x4a2f19);
      this.deco(0, 0.74, 0, 0.88, 0.1, 0.88, 0x4a2f19);
    });
    const col = this.physics.addCyl(x, z, 0.45, y, y + 1.0, { tag: 'wood' });
    col.owner = { kind: 'prop', hp: 90, maxHp: 90, wood: 22, mesh: g, collider: col, alive: true };
    col.owner.mesh.userData.dynamic = true;
    this.props.push(col.owner);
    g.userData.top = y + 1.0;
    return g;
  }

  // --- medical / lab -----------------------------------------------------
  medBed(x, y, z, rot = 0) {
    const g = new THREE.Group();
    this.mesh(g, x, y, z, rot);
    this.into(g, () => {
      this.deco(0, 0.32, 0, 1.0, 0.12, 2.0, 0xb9c2cc);
      this.deco(0, 0.5, 0.1, 0.95, 0.22, 1.75, 0xe8eef4);
      this.deco(0, 0.72, -0.95, 1.0, 0.7, 0.08, 0x8b9199);
      this.deco(0, 0.6, 0.98, 1.0, 0.45, 0.08, 0x8b9199);
      for (const sx of [-0.4, 0.4]) for (const sz of [-0.85, 0.85])
        this.deco(sx, 0.16, sz, 0.08, 0.32, 0.08, 0x6f7780);
    });
    const c = this._aabbFor(x, y + 0.35, z, 1.05, 0.7, 2.05, rot);
    this.physics.addBox(...c);
    return g;
  }

  ivStand(x, y, z) {
    const g = new THREE.Group();
    this.mesh(g, x, y, z, 0);
    this.into(g, () => {
      this.deco(0, 0.9, 0, 0.05, 1.8, 0.05, 0xb9c2cc);
      this.deco(0, 0.03, 0, 0.5, 0.06, 0.5, 0x8b9199);
      this.deco(0.12, 1.6, 0, 0.18, 0.3, 0.12, 0xd8e8f0);
      this.deco(0, 1.78, 0, 0.28, 0.04, 0.04, 0xb9c2cc);
    });
    this.physics.addCyl(x, z, 0.22, y, y + 1.8);
    return g;
  }

  medCabinet(x, y, z, rot = 0) {
    const g = new THREE.Group();
    this.mesh(g, x, y, z, rot);
    this.into(g, () => {
      this.deco(0, 0.9, 0, 1.0, 1.8, 0.45, 0xe4e9ee);
      this.deco(0, 1.2, 0.24, 0.9, 0.9, 0.03, 0xa9d6e5, 0, { matOpts: { transparent: true, opacity: 0.55 } });
      this.deco(0, 1.55, 0.26, 0.24, 0.24, 0.02, 0xd8402f);
      this.deco(0, 1.55, 0.27, 0.2, 0.06, 0.02, 0xffffff);
      this.deco(0, 1.55, 0.27, 0.06, 0.2, 0.02, 0xffffff);
    });
    const c = this._aabbFor(x, y + 0.9, z, 1.05, 1.8, 0.5, rot);
    this.physics.addBox(...c);
    return g;
  }

  monitorDesk(x, y, z, rot = 0, screens = 3) {
    const g = new THREE.Group();
    this.mesh(g, x, y, z, rot);
    this.into(g, () => {
      this.deco(0, 0.85, 0, 2.6, 0.1, 0.85, 0x3c4148);
      this.deco(0, 0.42, -0.35, 2.5, 0.85, 0.1, 0x2b3037);
      for (let i = 0; i < screens; i++) {
        const sx = (i - (screens - 1) / 2) * 0.9;
        this.deco(sx, 1.28, -0.2, 0.8, 0.5, 0.06, 0x15181c);
        this.deco(sx, 1.28, -0.16, 0.72, 0.42, 0.02, 0x2ad0a0, 0, { matOpts: { emissive: 0x0d4a3a } });
        this.deco(sx, 0.98, -0.2, 0.16, 0.24, 0.14, 0x22262b);
      }
      for (let i = 0; i < 8; i++)
        this.deco(-1.0 + i * 0.28, 0.92, 0.28, 0.22, 0.05, 0.16, i % 3 === 0 ? 0xd85050 : 0x50a8d8);
    });
    const c = this._aabbFor(x, y + 0.45, z, 2.6, 0.9, 0.9, rot);
    this.physics.addBox(...c);
    return g;
  }

  serverRack(x, y, z, rot = 0) {
    const g = new THREE.Group();
    this.mesh(g, x, y, z, rot);
    this.into(g, () => {
      this.deco(0, 1.05, 0, 0.9, 2.1, 0.8, 0x24282d);
      for (let i = 0; i < 7; i++) {
        this.deco(0, 0.35 + i * 0.25, 0.41, 0.8, 0.16, 0.03, 0x33383e);
        this.deco(0.3, 0.35 + i * 0.25, 0.43, 0.05, 0.05, 0.02, i % 2 ? 0x30e08a : 0xe0a030);
      }
    });
    const c = this._aabbFor(x, y + 1.05, z, 0.95, 2.1, 0.85, rot);
    this.physics.addBox(...c);
    return g;
  }

  /** One-way glass: mirrored on one side, see-through from the other. */
  oneWayGlass(x, y, z, w, h, axis = 'x') {
    const g = new THREE.Group();
    this.mesh(g, x, y, z, 0);
    const glassMat = new THREE.MeshLambertMaterial({
      color: 0x9fd8e8, transparent: true, opacity: 0.34, side: THREE.DoubleSide,
    });
    const mirrorMat = new THREE.MeshLambertMaterial({ color: 0x7b8896, transparent: true, opacity: 0.9 });
    const sw = axis === 'x' ? w : 0.06, sd = axis === 'x' ? 0.06 : w;
    this.into(g, () => {
      const pane = new THREE.Mesh(new THREE.BoxGeometry(sw, h, sd), glassMat);
      pane.receiveShadow = false;
      this.parent.add(pane);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mirrorMat);
      back.position.set(axis === 'x' ? 0 : 0.045, 0, axis === 'x' ? 0.045 : 0);
      back.rotation.y = axis === 'x' ? Math.PI : -Math.PI / 2;
      this.parent.add(back);
      // frame
      const fc = 0x2b3037;
      this.deco(axis === 'x' ? -w / 2 : 0, 0, axis === 'x' ? 0 : -w / 2, axis === 'x' ? 0.1 : 0.12, h + 0.1, axis === 'x' ? 0.12 : 0.1, fc);
      this.deco(axis === 'x' ? w / 2 : 0, 0, axis === 'x' ? 0 : w / 2, axis === 'x' ? 0.1 : 0.12, h + 0.1, axis === 'x' ? 0.12 : 0.1, fc);
      this.deco(0, h / 2, 0, axis === 'x' ? w : 0.12, 0.1, axis === 'x' ? 0.12 : w, fc);
      this.deco(0, -h / 2, 0, axis === 'x' ? w : 0.12, 0.1, axis === 'x' ? 0.12 : w, fc);
    });
    this.physics.addBox(x - sw / 2 - 0.02, y - h / 2, z - sd / 2 - 0.02, x + sw / 2 + 0.02, y + h / 2, z + sd / 2 + 0.02);
    return g;
  }

  /**
   * Merge every static mesh in this structure into one mesh per material.
   * A POI is thousands of little boxes; without this the draw-call count
   * alone tanks the frame rate.  Doors and destructible props opt out via
   * userData.dynamic.
   */
  finalize() {
    this.group.updateMatrixWorld(true);
    const byMat = new Map();
    const drop = [];
    const walk = (obj) => {
      if (obj !== this.group && obj.userData && obj.userData.dynamic) return;
      if (obj.isMesh && obj.geometry && obj.material && !obj.isInstancedMesh) {
        const key = obj.material.uuid;
        let bucket = byMat.get(key);
        if (!bucket) { bucket = { material: obj.material, geos: [] }; byMat.set(key, bucket); }
        const g = (obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry.clone());
        g.applyMatrix4(obj.matrixWorld);
        bucket.geos.push(g);
        drop.push(obj);
        return;
      }
      for (const c of obj.children) walk(c);
    };
    walk(this.group);
    for (const o of drop) if (o.parent) o.parent.remove(o);

    let merged = 0;
    for (const { material, geos } of byMat.values()) {
      let total = 0;
      for (const g of geos) total += g.attributes.position.count;
      const pos = new Float32Array(total * 3);
      const nrm = new Float32Array(total * 3);
      let off = 0;
      for (const g of geos) {
        const p = g.attributes.position, n = g.attributes.normal;
        pos.set(p.array.subarray(0, p.count * 3), off * 3);
        if (n) nrm.set(n.array.subarray(0, n.count * 3), off * 3);
        off += p.count;
        g.dispose();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      merged++;
    }
    return merged;
  }

  torch(x, y, z, withLight = false) {
    const g = new THREE.Group();
    this.mesh(g, x, y, z, 0);
    this.into(g, () => {
      this.deco(0, 0, 0, 0.1, 0.7, 0.1, 0x4a3a2a);
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 6),
        new THREE.MeshBasicMaterial({ color: 0xffb347 }));
      f.position.y = 0.5;
      this.parent.add(f);
    });
    if (withLight) {
      const light = new THREE.PointLight(0xffa040, 1.0, 13, 2);
      light.position.set(x, y + 0.5, z);
      this.group.add(light);
    }
    return g;
  }
}
