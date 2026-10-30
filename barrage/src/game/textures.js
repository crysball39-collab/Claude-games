/* =============================================================================
   Every surface in the world, painted onto canvases at load time: the sand,
   the arena's sandstone, the cobbles of the plaza, grass, planks, the
   Stall's striped awning, banners and signs. Nothing is loaded from disk.
   ========================================================================== */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { rng, shade } from '../core/util.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, ctx: c.getContext('2d') };
}

function tex(c, rx = 1, ry = 1, aniso = 8) {
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

/** Raked arena sand: warm, speckled, with the faint arcs of the rake. */
export function sandTexture() {
  const { c, ctx } = canvas(512, 512);
  const r = rng(3);
  ctx.fillStyle = '#d2b07a';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const k = r();
    ctx.fillStyle = k < 0.3 ? '#c49e66' : k < 0.6 ? '#dcbd88' : k < 0.85 ? '#cba771' : '#b8915c';
    ctx.fillRect(r() * 512, r() * 512, 1 + r() * 2, 1 + r() * 2);
  }
  // rake lines
  ctx.strokeStyle = 'rgba(150, 115, 70, 0.18)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    const y = i * 20 + r() * 6;
    ctx.beginPath();
    for (let x = 0; x <= 512; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 3);
    ctx.stroke();
  }
  // pebbles
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(110, 90, 70, 0.55)' : 'rgba(235, 220, 190, 0.6)';
    ctx.beginPath();
    ctx.arc(r() * 512, r() * 512, 1 + r() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  return tex(c, 6, 6);
}

/** Sandstone blocks in courses, the mortar darker. tall: more courses for a high wall. */
export function stoneTexture(seed = 5, base = '#b9946a', rows = 6) {
  const { c, ctx } = canvas(256, 256);
  const r = rng(seed);
  ctx.fillStyle = '#6e563c';
  ctx.fillRect(0, 0, 256, 256);
  const rh = 256 / rows;
  for (let row = 0; row < rows; row++) {
    let x = row % 2 ? -32 : 0;
    while (x < 256) {
      const w = 48 + r() * 40;
      ctx.fillStyle = shade(base, 0.82 + r() * 0.3);
      ctx.fillRect(x + 2, row * rh + 2, w - 4, rh - 4);
      for (let k = 0; k < 40; k++) {
        ctx.fillStyle = r() < 0.5 ? 'rgba(90, 66, 40, 0.18)' : 'rgba(255, 240, 210, 0.12)';
        ctx.fillRect(x + 2 + r() * (w - 4), row * rh + 2 + r() * (rh - 4), 2, 2);
      }
      // a chip off the corner now and then
      if (r() < 0.3) {
        ctx.fillStyle = 'rgba(70, 52, 34, 0.5)';
        ctx.fillRect(x + w - 10, row * rh + 2, 7, 5);
      }
      x += w;
    }
  }
  return tex(c, 1, 1);
}

/** Rounded cobbles for the plaza. */
export function cobbleTexture() {
  const { c, ctx } = canvas(512, 512);
  const r = rng(9);
  ctx.fillStyle = '#5a5046';
  ctx.fillRect(0, 0, 512, 512);
  const s = 32;
  for (let y = 0; y < 512; y += s) {
    for (let x = (y / s) % 2 ? -s / 2 : 0; x < 512; x += s) {
      const g = 0.8 + r() * 0.35;
      ctx.fillStyle = shade('#9a8a76', g);
      const w = s - 4 - r() * 4, h = s - 4 - r() * 4;
      const px = x + 2 + r() * 2, py = y + 2 + r() * 2;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(px, py, w, h, 7); else ctx.rect(px, py, w, h);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 245, 225, 0.12)';
      ctx.fillRect(px + 3, py + 2, w - 8, 3);
    }
  }
  return tex(c, 4, 3);
}

export function grassTexture() {
  const { c, ctx } = canvas(256, 256);
  const r = rng(7);
  ctx.fillStyle = '#6b8a3e';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const k = r();
    ctx.fillStyle = k < 0.33 ? '#789a46' : k < 0.66 ? '#5e7b36' : '#86a650';
    ctx.fillRect(r() * 256, r() * 256, 1 + r() * 2, 2 + r() * 4);
  }
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = 'rgba(120, 100, 60, 0.35)';
    ctx.fillRect(r() * 256, r() * 256, 3 + r() * 4, 2);
  }
  return tex(c, 30, 30);
}

/** Planks running along u. */
export function woodTexture(base = '#8a5a32', seed = 13, planks = 4) {
  const { c, ctx } = canvas(256, 256);
  const r = rng(seed);
  const h = 256 / planks;
  for (let i = 0; i < planks; i++) {
    ctx.fillStyle = shade(base, 0.85 + r() * 0.3);
    ctx.fillRect(0, i * h, 256, h);
    for (let k = 0; k < 60; k++) {
      ctx.fillStyle = 'rgba(60, 35, 15, 0.22)';
      ctx.fillRect(r() * 256, i * h + r() * h, 10 + r() * 30, 1);
    }
    ctx.fillStyle = 'rgba(40, 22, 8, 0.7)';
    ctx.fillRect(0, i * h, 256, 2);
    // nail heads
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(12, i * h + h / 2 - 2, 4, 4);
    ctx.fillRect(240, i * h + h / 2 - 2, 4, 4);
  }
  return tex(c, 1, 1);
}

/** A heavy door: vertical planks, iron straps and studs. */
export function doorTexture() {
  const { c, ctx } = canvas(256, 512);
  const r = rng(17);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = shade('#6e4526', 0.85 + r() * 0.3);
    ctx.fillRect(i * 51.2, 0, 51.2, 512);
    ctx.fillStyle = 'rgba(30, 16, 6, 0.6)';
    ctx.fillRect(i * 51.2, 0, 2, 512);
    for (let k = 0; k < 50; k++) {
      ctx.fillStyle = 'rgba(50, 28, 10, 0.25)';
      ctx.fillRect(i * 51.2 + r() * 51, r() * 512, 1, 14 + r() * 40);
    }
  }
  for (const y of [70, 256, 440]) {
    ctx.fillStyle = '#2c2c2e';
    ctx.fillRect(0, y - 14, 256, 28);
    ctx.fillStyle = '#5a5a5e';
    for (let x = 16; x < 256; x += 40) ctx.fillRect(x, y - 4, 8, 8);
  }
  return tex(c, 1, 1);
}

/** Red and cream stripes for the Stall's awning. */
export function awningTexture() {
  const { c, ctx } = canvas(256, 128);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#efe2c4' : '#b02a22';
    ctx.fillRect(i * 32, 0, 32, 128);
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
  for (let y = 0; y < 128; y += 4) ctx.fillRect(0, y, 256, 1);
  return tex(c, 1, 1, 4);
}

/** A hanging banner: the arena's colours and two crossed swords. */
export function bannerTexture(color = '#9c1f1a', trim = '#d9a538') {
  const { c, ctx } = canvas(128, 256);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 128, 256);
  ctx.fillStyle = trim;
  ctx.fillRect(0, 0, 128, 10);
  ctx.fillRect(8, 0, 6, 256); ctx.fillRect(114, 0, 6, 256);
  // swallowtail
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.clearRect(0, 226, 128, 30);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(0, 226); ctx.lineTo(64, 226); ctx.lineTo(0, 256); ctx.fill();
  ctx.beginPath(); ctx.moveTo(128, 226); ctx.lineTo(64, 226); ctx.lineTo(128, 256); ctx.fill();
  // crossed swords
  ctx.save();
  ctx.translate(64, 110);
  for (const a of [-0.7, 0.7]) {
    ctx.save();
    ctx.rotate(a);
    ctx.fillStyle = '#e9e1cf';
    ctx.fillRect(-4, -62, 8, 92);
    ctx.fillStyle = trim;
    ctx.fillRect(-16, 26, 32, 7);
    ctx.fillRect(-4, 33, 8, 18);
    ctx.restore();
  }
  ctx.restore();
  const t = tex(c, 1, 1, 4);
  return t;
}

/** Painted letters on a board. font falls back if the display face is not loaded. */
export function signTexture(text, { w = 512, h = 128, bg = '#5a3a1e', fg = '#f2d38a', font = 'Bungee', size = 64 } = {}) {
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const r = rng(29);
  for (let k = 0; k < 120; k++) {
    ctx.fillStyle = 'rgba(30, 16, 6, 0.25)';
    ctx.fillRect(r() * w, r() * h, 20 + r() * 40, 1);
  }
  ctx.strokeStyle = '#2a1608';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, w - 10, h - 10);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${size}px ${font}, "Arial Black", Impact, sans-serif`;
  ctx.fillText(text, w / 2, h / 2 + 4);
  return tex(c, 1, 1, 4);
}

export function dirtTexture() {
  const { c, ctx } = canvas(256, 256);
  const r = rng(31);
  ctx.fillStyle = '#7a6448';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2400; i++) {
    ctx.fillStyle = r() < 0.5 ? '#6c5740' : '#89714f';
    ctx.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 2);
  }
  return tex(c, 1, 1);
}
