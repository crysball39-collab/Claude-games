/* =============================================================================
   Paintable surfaces. Every body part, garment, crate and the floor itself owns
   (or can lazily grow) a canvas that damage is drawn onto, which is how bruises,
   blood splatter and cloth tears end up exactly where the hit landed.
   ========================================================================== */
import { CanvasTexture, SRGBColorSpace, LinearMipmapLinearFilter, RepeatWrapping } from 'three';
import { makeRng, clamp01 } from '../core/util.js';
import { faceRect } from './skeleton.js';

const rnd = makeRng(0x9e3779b9);

/* -------------------------------------------------------------------------- */
/*                                atlas surface                               */
/* -------------------------------------------------------------------------- */

/**
 * A 3x2 face atlas for one box. `cell` is the pixel size of a single face.
 * `drawBase` fills the canvas with the part's clean appearance; everything
 * painted afterwards is damage.
 */
export class PaintSurface {
  constructor(cell, drawBase, { alphaCut = false } = {}) {
    this.cell = cell;
    this.canvas = document.createElement('canvas');
    this.canvas.width = cell * 3;
    this.canvas.height = cell * 2;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false });
    this.ctx.imageSmoothingEnabled = true;
    if (drawBase) drawBase(this.ctx, this.canvas.width, this.canvas.height, this);

    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearMipmapLinearFilter;
    this.texture.generateMipmaps = true;
    this.texture.anisotropy = 2;
    this.alphaCut = alphaCut;
    this.dirty = false;
    this.bloodAmount = 0;
    this.bruiseAmount = 0;
    this.tearAmount = 0;
  }

  /** Runs `fn(ctx, px, py, cellSize)` clipped to the given face. */
  paintFace(face, u, v, fn) {
    const { ctx, canvas, cell } = this;
    const r = faceRect(face, canvas.width, canvas.height);
    const px = r.x + clamp01(u) * r.w;
    const py = r.y + (1 - clamp01(v)) * r.h;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    fn(ctx, px, py, cell);
    ctx.restore();
    this.dirty = true;
  }

  /** Paints without clipping - used for the face, which is authored by hand. */
  withFace(face, fn) {
    const r = faceRect(face, this.canvas.width, this.canvas.height);
    this.ctx.save();
    this.ctx.beginPath(); this.ctx.rect(r.x, r.y, r.w, r.h); this.ctx.clip();
    this.ctx.translate(r.x, r.y);
    fn(this.ctx, r.w, r.h);
    this.ctx.restore();
    this.dirty = true;
  }

  flush() {
    if (!this.dirty) return;
    this.texture.needsUpdate = true;
    this.dirty = false;
  }

  dispose() { this.texture.dispose(); }
}

/* -------------------------------------------------------------------------- */
/*                              gore ink recipes                              */
/* -------------------------------------------------------------------------- */

export const BLOOD_FRESH = [138, 12, 16];
export const BLOOD_DARK = [78, 8, 11];

function bloodCss(a = 1, dark = 0) {
  const c = dark
    ? BLOOD_DARK
    : [BLOOD_FRESH[0] - dark * 40, BLOOD_FRESH[1], BLOOD_FRESH[2]];
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}

/** Irregular blob path centred on (x,y). */
function blobPath(ctx, x, y, r, points, wobble, rand) {
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rr = r * (1 - wobble * 0.5 + rand() * wobble);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/**
 * Bruising: what blunt force leaves behind. Purple heart with a jaundiced
 * halo, no broken skin.
 */
export function paintBruise(ctx, x, y, radius, severity = 1, rand = rnd) {
  const r = radius * (0.8 + severity * 0.5);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0.00, `rgba(58,20,58,${0.42 * severity + 0.2})`);
  g.addColorStop(0.35, `rgba(92,26,58,${0.34 * severity + 0.14})`);
  g.addColorStop(0.68, `rgba(120,58,42,${0.2 * severity + 0.08})`);
  g.addColorStop(1.00, 'rgba(140,110,40,0)');
  ctx.fillStyle = g;
  blobPath(ctx, x, y, r, 12, 0.5, rand);
  ctx.fill();

  // a couple of darker capillary blots inside
  const n = 2 + ((rand() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2, d = rand() * r * 0.45;
    ctx.fillStyle = `rgba(48,16,46,${0.16 + rand() * 0.2 * severity})`;
    blobPath(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.12 + rand() * 0.22), 8, 0.7, rand);
    ctx.fill();
  }
}

/** Open wound / blood splatter. Only used when the hit is more than a fist. */
export function paintBlood(ctx, x, y, radius, severity = 1, rand = rnd, dark = 0) {
  ctx.fillStyle = bloodCss(0.9, dark);
  blobPath(ctx, x, y, radius * (0.55 + severity * 0.35), 14, 0.75, rand);
  ctx.fill();

  ctx.fillStyle = bloodCss(0.62, dark);
  blobPath(ctx, x, y, radius * (0.9 + severity * 0.6), 16, 0.9, rand);
  ctx.fill();

  // thrown droplets around the wound
  const drops = 5 + ((rand() * 9 * severity) | 0);
  for (let i = 0; i < drops; i++) {
    const a = rand() * Math.PI * 2;
    const d = radius * (0.9 + rand() * 2.4 * severity);
    const rr = radius * (0.06 + rand() * 0.24);
    ctx.fillStyle = bloodCss(0.5 + rand() * 0.45, dark);
    blobPath(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, rr, 7, 0.8, rand);
    ctx.fill();
  }
  // a run or two, because blood does not stay put
  if (rand() < 0.55) {
    const w = radius * (0.16 + rand() * 0.2);
    const h = radius * (1.2 + rand() * 2.6 * severity);
    ctx.fillStyle = bloodCss(0.62, dark);
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w * 0.55, y + h);
    ctx.lineTo(x - w * 0.55, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath(); ctx.arc(x, y + h, w * 0.62, 0, Math.PI * 2); ctx.fill();
  }
}

/** Directional splatter, used for droplets that fly and land somewhere else. */
export function paintSplat(ctx, x, y, radius, dirX, dirY, rand = rnd, dark = 0) {
  const len = Math.hypot(dirX, dirY) || 1;
  const nx = dirX / len, ny = dirY / len;
  ctx.fillStyle = bloodCss(0.78, dark);
  blobPath(ctx, x, y, radius, 12, 0.85, rand);
  ctx.fill();
  const tails = 3 + ((rand() * 5) | 0);
  for (let i = 0; i < tails; i++) {
    const spread = (rand() - 0.5) * 1.1;
    const ax = nx * Math.cos(spread) - ny * Math.sin(spread);
    const ay = nx * Math.sin(spread) + ny * Math.cos(spread);
    const d = radius * (1 + rand() * 3.2);
    ctx.fillStyle = bloodCss(0.5 + rand() * 0.4, dark);
    blobPath(ctx, x + ax * d, y + ay * d, radius * (0.1 + rand() * 0.3), 7, 0.9, rand);
    ctx.fill();
  }
}

/**
 * Cloth tear: punches a real hole in the garment's alpha and frays the edge, so
 * the skin underneath shows through.
 */
export function paintTear(ctx, x, y, radius, rand = rnd) {
  const pts = 9 + ((rand() * 5) | 0);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const rr = radius * (0.35 + rand() * 0.95);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // frayed threads round the rip
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = Math.max(0.6, radius * 0.09);
  for (let i = 0; i < pts + 4; i++) {
    const a = rand() * Math.PI * 2;
    const r0 = radius * (0.6 + rand() * 0.4);
    const r1 = r0 + radius * (0.15 + rand() * 0.45);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
    ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.restore();
}

/* -------------------------------------------------------------------------- */
/*                                    face                                    */
/* -------------------------------------------------------------------------- */

/**
 * Rectangular eyes with a coloured iris and a pupil, a flat two dimensional
 * nose and a flat mouth. Drawn straight onto the head atlas' front face.
 */
/**
 * The face, drawn flat onto the head's front cell. `injuries` decides what has
 * happened to it: each eye is one of
 *
 *   ok | bloodshot | bleeding | hanging | gone
 *
 * and the nose and mouth carry their own 0..1 bleed. A hanging eye leaves an
 * empty socket here - the eyeball itself is a real object on a cord, built in
 * body.js, because a dangling eye has to swing.
 */
export function drawFace(ctx, w, h, opts) {
  const {
    eyeColor = '#4a7a3a', browColor = '#3a2a1c', mouth = 'neutral', skinShadow = null,
    injuries = null, rand = rnd,
  } = opts;
  const inj = injuries || {};
  const eyeState = { R: inj.eyeR || 'ok', L: inj.eyeL || 'ok' };
  const noseBleed = inj.noseBleed || 0;
  const mouthBleed = inj.mouthBleed || 0;
  const cx = w / 2;
  const px = (v) => Math.max(1, Math.round(v));

  // A touch of shading so the flat face reads as a head.
  if (skinShadow) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0.10)');
    g.addColorStop(0.45, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.14)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  /* ------------------------------- the eyes ------------------------------ */
  const eyeW = w * 0.265;
  const eyeH = h * 0.155;
  const eyeY = h * 0.455;
  const gap = w * 0.080;

  for (const sgn of [-1, 1]) {
    const ex = cx + sgn * (gap / 2) - (sgn < 0 ? eyeW : 0);
    /* The face is drawn as the character sees out of it, so the eye on the
       left of the image is their right eye. */
    const state = sgn < 0 ? eyeState.R : eyeState.L;

    // brow
    ctx.fillStyle = browColor;
    ctx.fillRect(ex - w * 0.012, eyeY - h * 0.105, eyeW + w * 0.024, px(h * 0.048));

    // socket
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(ex - w * 0.014, eyeY - h * 0.020, eyeW + w * 0.028, eyeH + h * 0.040);

    if (state === 'gone' || state === 'hanging') {
      // An empty socket: dark, wet, and running down the cheek.
      ctx.fillStyle = '#1b0a09';
      ctx.fillRect(ex, eyeY, eyeW, eyeH);
      ctx.fillStyle = 'rgba(58,8,10,0.92)';
      ctx.fillRect(ex + eyeW * 0.10, eyeY + eyeH * 0.16, eyeW * 0.80, eyeH * 0.68);
      paintBlood(ctx, ex + eyeW * 0.5, eyeY + eyeH * 0.6, eyeW * 0.42, 1, rand, 0.15);
      // the trail down the face
      ctx.fillStyle = 'rgba(120,10,14,0.85)';
      ctx.fillRect(ex + eyeW * 0.34, eyeY + eyeH, px(eyeW * 0.20), h * (state === 'hanging' ? 0.30 : 0.22));
      paintBlood(ctx, ex + eyeW * 0.44, eyeY + eyeH * 2.4, eyeW * 0.24, 0.65, rand, 0.3);
      continue;
    }

    // sclera - a rectangle, as asked
    ctx.fillStyle = '#f4efe7';
    ctx.fillRect(ex, eyeY, eyeW, eyeH);

    if (state === 'bloodshot' || state === 'bleeding') {
      // veins across the white
      ctx.strokeStyle = 'rgba(178,26,24,0.85)';
      ctx.lineWidth = Math.max(1, w * 0.006);
      for (let i = 0; i < 5; i++) {
        const y0 = eyeY + eyeH * (0.2 + 0.6 * rand());
        ctx.beginPath();
        ctx.moveTo(ex, y0);
        ctx.lineTo(ex + eyeW * (0.35 + 0.5 * rand()), y0 + eyeH * (rand() - 0.5) * 0.5);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(190,40,34,0.28)';
      ctx.fillRect(ex, eyeY, eyeW, eyeH);
    }

    // iris, also rectangular, in the character's eye colour
    const irisW = eyeW * 0.56, irisH = eyeH * 0.90;
    const irisX = ex + eyeW * 0.5 - irisW / 2 + sgn * eyeW * 0.04;
    const irisY = eyeY + eyeH * 0.5 - irisH / 2;
    ctx.fillStyle = eyeColor;
    ctx.fillRect(irisX, irisY, irisW, irisH);

    // pupil
    const pw = irisW * 0.54, ph = irisH * 0.70;
    ctx.fillStyle = '#0d0d11';
    ctx.fillRect(irisX + (irisW - pw) / 2, irisY + (irisH - ph) / 2, pw, ph);

    // catch light
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(irisX + irisW * 0.08, irisY + irisH * 0.10, px(irisW * 0.22), px(irisH * 0.22));

    // lash line
    ctx.fillStyle = 'rgba(28,18,12,0.75)';
    ctx.fillRect(ex, eyeY, eyeW, px(h * 0.018));
    ctx.strokeStyle = 'rgba(28,18,12,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ex + 0.5, eyeY + 0.5, eyeW - 1, eyeH - 1);

    if (state === 'bleeding') {
      // welling up along the lower lid, then down the cheek
      ctx.fillStyle = 'rgba(140,12,16,0.95)';
      ctx.fillRect(ex, eyeY + eyeH - px(h * 0.014), eyeW, px(h * 0.020));
      ctx.fillStyle = 'rgba(126,10,14,0.8)';
      ctx.fillRect(ex + eyeW * 0.38, eyeY + eyeH, px(eyeW * 0.16), h * 0.20);
      paintBlood(ctx, ex + eyeW * 0.46, eyeY + eyeH * 2.0, eyeW * 0.20, 0.55, rand, 0.3);
    }
  }

  /* -------------------------- the nose, flat and 2D ---------------------- */
  const nTop = h * 0.545, nBot = h * 0.715;
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.020, nTop);
  ctx.lineTo(cx + w * 0.055, nBot);
  ctx.lineTo(cx - w * 0.055, nBot);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(40,22,14,0.78)';
  ctx.fillRect(cx - w * 0.058, nBot - h * 0.012, px(w * 0.036), px(h * 0.026));
  ctx.fillRect(cx + w * 0.022, nBot - h * 0.012, px(w * 0.036), px(h * 0.026));

  if (noseBleed > 0) {
    // out of both nostrils, further down the harder it was hit
    const run = h * (0.05 + noseBleed * 0.16);
    ctx.fillStyle = 'rgba(132,10,14,0.92)';
    for (const s2 of [-1, 1]) {
      const x0 = cx + s2 * w * 0.040 - w * 0.014;
      ctx.fillRect(x0, nBot - h * 0.006, px(w * 0.028), run);
    }
    paintBlood(ctx, cx, nBot + run * 0.9, w * (0.028 + noseBleed * 0.030), noseBleed * 0.7, rand, 0.25);
  }

  /* ------------------------- the mouth, also flat ------------------------ */
  const my = h * 0.845, mw = w * 0.38;
  ctx.strokeStyle = 'rgba(104,44,42,0.95)';
  ctx.lineWidth = Math.max(2, h * 0.034);
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (mouth === 'frown') {
    ctx.moveTo(cx - mw / 2, my + h * 0.026);
    ctx.quadraticCurveTo(cx, my - h * 0.044, cx + mw / 2, my + h * 0.026);
  } else if (mouth === 'smile') {
    ctx.moveTo(cx - mw / 2, my - h * 0.020);
    ctx.quadraticCurveTo(cx, my + h * 0.060, cx + mw / 2, my - h * 0.020);
  } else {
    ctx.moveTo(cx - mw / 2, my);
    ctx.quadraticCurveTo(cx, my + h * 0.016, cx + mw / 2, my);
  }
  ctx.stroke();

  if (mouthBleed > 0) {
    // over the lip and down the chin
    ctx.fillStyle = 'rgba(122,8,12,0.9)';
    ctx.fillRect(cx - mw * 0.18, my + h * 0.008, px(mw * 0.36), h * (0.02 + mouthBleed * 0.05));
    const run = h * (0.04 + mouthBleed * 0.10);
    ctx.fillRect(cx - w * 0.026, my + h * 0.020, px(w * 0.030), run);
    ctx.fillRect(cx + w * 0.008, my + h * 0.020, px(w * 0.022), run * 0.7);
    paintBlood(ctx, cx, my + run + h * 0.03, w * (0.032 + mouthBleed * 0.036), mouthBleed * 0.7, rand, 0.28);
  }
}

/** An open, pained mouth for when things have gone badly. */
export function drawFaceMouthOpen(ctx, w, h) {
  const cx = w / 2, my = h * 0.75;
  ctx.fillStyle = '#3a1416';
  ctx.beginPath();
  ctx.ellipse(cx, my, w * 0.13, h * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f0e6da';
  ctx.fillRect(cx - w * 0.10, my - h * 0.08, w * 0.20, h * 0.022);
}

/* -------------------------------------------------------------------------- */
/*                            ground / world decals                           */
/* -------------------------------------------------------------------------- */

/**
 * A transparent sheet stretched over the map that collects everything spilled
 * on the floor. One texture, painted in world coordinates.
 */
export class DecalSheet {
  constructor(size, worldMin, worldMax) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d');
    this.size = size;
    this.min = worldMin;
    this.max = worldMax;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.wrapS = this.texture.wrapT = RepeatWrapping;
    this.texture.minFilter = LinearMipmapLinearFilter;
    this.texture.generateMipmaps = true;
    this.dirty = false;
    this.count = 0;
  }

  worldToPixel(x, z) {
    const u = (x - this.min) / (this.max - this.min);
    const v = (z - this.min) / (this.max - this.min);
    return { px: u * this.size, py: v * this.size, inside: u >= 0 && u <= 1 && v >= 0 && v <= 1 };
  }

  paint(x, z, fn) {
    const { px, py, inside } = this.worldToPixel(x, z);
    if (!inside) return false;
    this.ctx.save();
    fn(this.ctx, px, py, this.size / (this.max - this.min));
    this.ctx.restore();
    this.dirty = true;
    this.count++;
    return true;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.size, this.size);
    this.dirty = true;
    this.count = 0;
  }

  flush() {
    if (!this.dirty) return;
    this.texture.needsUpdate = true;
    this.dirty = false;
  }
}

