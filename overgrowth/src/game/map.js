/* =============================================================================
   The map: a green platform floating in the sky, with a small grey platform
   in the middle of it. Fall off the edge and you keep falling.
   ========================================================================== */
import {
  Mesh, BoxGeometry, MeshLambertMaterial, CanvasTexture, RepeatWrapping, SRGBColorSpace, Vector3,
  Quaternion, HemisphereLight, DirectionalLight, Color, Fog, SphereGeometry, ShaderMaterial, BackSide,
} from 'three';
import { Body } from '../physics/world.js';
import { FloorPaint, PaintCanvas, packBoxes, buildBoxGeometry, drawSplat, drawPool, FACE } from './paint.js';
import { rng } from '../core/util.js';

export const GREEN_HALF = 25;            // the green platform is 50 x 50 m
export const GREY_HALF = 3.5;            // the grey one 7 x 7 m...
export const GREY_TOP = 0.22;            // ...and this tall

function grassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const r = rng(7);
  ctx.fillStyle = '#4f9a3a';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const x = r() * 256, y = r() * 256;
    const k = r();
    ctx.fillStyle = k < 0.33 ? '#5aa843' : k < 0.66 ? '#468d33' : '#62b04a';
    ctx.fillRect(x, y, 1 + r() * 2, 2 + r() * 4);
  }
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = 'rgba(40, 80, 25, 0.35)';
    ctx.fillRect(r() * 256, r() * 256, 1, 3);
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(GREEN_HALF / 2.5, GREEN_HALF / 2.5);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function dirtTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  const r = rng(11);
  ctx.fillStyle = '#6b4a2e';
  ctx.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = r() < 0.5 ? '#5a3d25' : '#7d5838';
    ctx.fillRect(r() * 256, r() * 64, 2 + r() * 3, 1 + r() * 2);
  }
  // grass lip along the top
  ctx.fillStyle = '#4f9a3a';
  ctx.fillRect(0, 0, 256, 6);
  for (let x = 0; x < 256; x += 2) {
    ctx.fillRect(x, 6, 2, r() * 6);
  }
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.repeat.set(12, 1);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Concrete on every face of the grey platform. */
function paintConcrete(ctx, tiles) {
  const r = rng(3);
  for (let fi = 0; fi < 6; fi++) {
    const t = tiles[fi];
    ctx.fillStyle = fi === FACE.py ? '#9a9da1' : '#86898d';
    ctx.fillRect(t.x - 1, t.y - 1, t.w + 2, t.h + 2);
    const n = Math.round(t.w * t.h * 0.05);
    for (let i = 0; i < n; i++) {
      const g = 130 + ((r() * 40) | 0);
      ctx.fillStyle = `rgb(${g}, ${g + 2}, ${g + 5})`;
      ctx.fillRect(t.x + r() * t.w, t.y + r() * t.h, 1 + r() * 2, 1 + r() * 2);
    }
    if (fi === FACE.py) {
      // slab joints
      ctx.fillStyle = 'rgba(70, 72, 75, 0.7)';
      for (let k = 1; k < 4; k++) {
        ctx.fillRect(t.x + (t.w * k) / 4, t.y, 2, t.h);
        ctx.fillRect(t.x, t.y + (t.h * k) / 4, t.w, 2);
      }
      ctx.strokeStyle = '#6e7175';
      ctx.lineWidth = 6;
      ctx.strokeRect(t.x + 3, t.y + 3, t.w - 6, t.h - 6);
    }
  }
}

export class GameMap {
  constructor(game) {
    this.game = game;
    const scene = game.scene;

    /* --------------------------------- sky -------------------------------- */
    const sky = new Color('#9fd3f5');
    scene.background = sky;
    scene.fog = new Fog(sky, 45, 160);
    const skyMat = new ShaderMaterial({
      side: BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new Color('#4a9ae0') }, mid: { value: new Color('#a9dbf7') }, low: { value: new Color('#e9f4f2') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.6)) : mix(mid, low, pow(-h, 0.5)); gl_FragColor = vec4(c, 1.0); }',
    });
    this.sky = new Mesh(new SphereGeometry(400, 24, 16), skyMat);
    this.sky.renderOrder = -1;
    scene.add(this.sky);

    /* -------------------------------- light ------------------------------- */
    scene.add(new HemisphereLight('#dff1ff', '#4d6b3a', 1.15));
    const sun = new DirectionalLight('#fff4e0', 1.9);
    sun.position.set(14, 30, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = -18; s.right = 18; s.top = 18; s.bottom = -18; s.near = 1; s.far = 90;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    /* ---------------------------- green platform -------------------------- */
    const H = GREEN_HALF, depth = 2;
    const grass = new MeshLambertMaterial({ map: grassTexture() });
    const dirt = new MeshLambertMaterial({ map: dirtTexture() });
    const under = new MeshLambertMaterial({ color: '#4b3420' });
    const green = new Mesh(new BoxGeometry(H * 2, depth, H * 2), [dirt, dirt, grass, under, dirt, dirt]);
    green.position.set(0, -depth / 2, 0);
    green.receiveShadow = true;
    scene.add(green);
    // the rock it sits on, narrowing underneath
    const rock = new Mesh(new BoxGeometry(H * 1.6, 6, H * 1.6), new MeshLambertMaterial({ color: '#5a4630' }));
    rock.position.set(0, -depth - 3, 0);
    scene.add(rock);
    const rock2 = new Mesh(new BoxGeometry(H * 0.9, 8, H * 0.9), new MeshLambertMaterial({ color: '#4d3c29' }));
    rock2.position.set(0, -depth - 10, 0);
    scene.add(rock2);

    this.greenBody = new Body({ half: new Vector3(H, depth / 2, H), kind: 'static', friction: 0.8 });
    this.greenBody.setPose(new Vector3(0, -depth / 2, 0), new Quaternion());
    this.greenBody.slab = true;
    game.world.add(this.greenBody);

    /* ---------------------------- grey platform --------------------------- */
    const G = GREY_HALF;
    const gsize = new Vector3(G * 2, GREY_TOP, G * 2);
    this.greyLayout = packBoxes([{ size: gsize, density: 70 }], 1024, 2, 8, 1024);
    this.greyPaint = new PaintCanvas(this.greyLayout.width, this.greyLayout.height);
    paintConcrete(this.greyPaint.ctx, this.greyLayout.tiles[0]);
    this.greyPaint.dirty = true;
    const grey = new Mesh(buildBoxGeometry([{ size: gsize }], this.greyLayout), new MeshLambertMaterial({ map: this.greyPaint.texture }));
    grey.position.set(0, GREY_TOP / 2, 0);
    grey.receiveShadow = true;
    grey.castShadow = true;
    scene.add(grey);
    this.grey = grey;
    this.greySize = gsize;
    this.greyBody = new Body({ half: new Vector3(G, GREY_TOP / 2, G), kind: 'static', friction: 0.8 });
    this.greyBody.setPose(new Vector3(0, GREY_TOP / 2, 0), new Quaternion());
    this.greyBody.slab = true;
    game.world.add(this.greyBody);

    /* --------------------------- blood on the grass ----------------------- */
    this.floor = new FloorPaint(scene, [-H, -H, H, H], 0, 5, 512);
  }

  /** Height of whatever is underfoot, or -Infinity past the edge. */
  groundAt(x, z) {
    if (Math.abs(x) <= GREY_HALF && Math.abs(z) <= GREY_HALF) return GREY_TOP;
    if (Math.abs(x) <= GREEN_HALF && Math.abs(z) <= GREEN_HALF) return 0;
    return -Infinity;
  }

  edgeDistance(x, z) {
    return GREEN_HALF - Math.max(Math.abs(x), Math.abs(z));
  }

  onGrey(x, z) { return Math.abs(x) <= GREY_HALF && Math.abs(z) <= GREY_HALF; }

  /** A drop landing at (x, y, z) on top of whichever platform is there. */
  paintSplat(x, y, z, radius, dir) {
    if (this.onGrey(x, z)) {
      this.greyTop(x, z, (ctx, px, py, ppm) => drawSplat(ctx, px, py, Math.max(1, radius * ppm), { dx: dir ? dir.x : 0, dy: dir ? dir.z : 0 }));
    } else {
      this.floor.splat(x, z, radius, dir);
    }
  }

  paintPool(x, y, z, radius, alpha) {
    if (this.onGrey(x, z)) {
      this.greyTop(x, z, (ctx, px, py, ppm) => drawPool(ctx, px, py, radius * ppm, alpha));
    } else {
      this.floor.pool(x, z, radius, alpha);
    }
  }

  greyTop(x, z, fn) {
    const t = this.greyLayout.tiles[0][FACE.py];
    // top face: u = -X... v = +Z (see paint.js FACES)
    const u = -x / (GREY_HALF * 2) + 0.5;      // 0..1 across the face, left to right
    const v = z / (GREY_HALF * 2) + 0.5;
    const px = t.x + u * t.w, py = t.y + (1 - v) * t.h;
    const ctx = this.greyPaint.ctx;
    ctx.save();
    ctx.beginPath(); ctx.rect(t.x, t.y, t.w, t.h); ctx.clip();
    fn(ctx, px, py, t.w / (GREY_HALF * 2));
    ctx.restore();
    this.greyPaint.dirty = true;
  }

  clearBlood() {
    this.floor.clear();
    paintConcrete(this.greyPaint.ctx, this.greyLayout.tiles[0]);
    this.greyPaint.dirty = true;
  }

  /** Keeps the sun's shadow box on whatever the camera is looking at. */
  followShadow(focus) {
    const s = this.sun;
    s.target.position.set(focus.x, 0, focus.z);
    s.position.set(focus.x + 14, 30, focus.z + 10);
    s.target.updateMatrixWorld();
  }
}
