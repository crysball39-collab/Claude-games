/* =============================================================================
   Pictures for the bag, the equipment slots and the Stall's counter, drawn
   on canvases once and kept as data URLs: each item, and a faint outline of
   what goes in each empty slot.
   ========================================================================== */
import { rng } from '../core/util.js';

const cache = new Map();

function draw(key, size, fn) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  fn(ctx, size);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

/** A sword lying corner to corner, point up and to the right. */
function sword(ctx, s, { blade, edge, guard, grip, pommel, rust = false, wood = false }) {
  const r = rng(wood ? 4 : 9);
  ctx.save();
  ctx.translate(s / 2, s / 2);
  ctx.rotate(-Math.PI / 4);
  const L = s * 0.62, w = s * (wood ? 0.1 : 0.085);
  // blade
  ctx.fillStyle = blade;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -s * 0.12);
  ctx.lineTo(-w / 2, -s * 0.12 - L + w);
  ctx.lineTo(0, -s * 0.12 - L);
  ctx.lineTo(w / 2, -s * 0.12 - L + w);
  ctx.lineTo(w / 2, -s * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = edge;
  ctx.fillRect(-w * 0.12, -s * 0.12 - L + w, w * 0.24, L - w);
  if (rust) {
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = r() < 0.5 ? 'rgba(150, 72, 28, 0.75)' : 'rgba(104, 50, 20, 0.7)';
      const y = -s * 0.12 - r() * (L - w);
      ctx.fillRect(-w / 2 + r() * w, y, 1 + r() * 2.5, 1 + r() * 2.5);
    }
  }
  if (wood) {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = 'rgba(90, 55, 22, 0.45)';
      ctx.fillRect(-w / 2 + r() * w, -s * 0.12 - r() * (L - w), 1, 6 + r() * 10);
    }
  }
  // guard, grip, pommel
  ctx.fillStyle = guard;
  ctx.fillRect(-s * 0.15, -s * 0.13, s * 0.3, s * 0.06);
  ctx.fillStyle = grip;
  ctx.fillRect(-w * 0.45, -s * 0.07, w * 0.9, s * 0.2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  for (let k = 0; k < 4; k++) ctx.fillRect(-w * 0.45, -s * 0.05 + k * s * 0.045, w * 0.9, 1.5);
  ctx.fillStyle = pommel;
  ctx.fillRect(-s * 0.05, s * 0.13, s * 0.1, s * 0.07);
  ctx.restore();
}

function shield(ctx, s) {
  const r = rng(5);
  const x0 = s * 0.18, y0 = s * 0.12, w = s * 0.64, h = s * 0.76;
  const planks = 5;
  for (let i = 0; i < planks; i++) {
    const g = 0.88 + r() * 0.24;
    ctx.fillStyle = `rgb(${Math.round(160 * g)}, ${Math.round(106 * g)}, ${Math.round(56 * g)})`;
    ctx.fillRect(x0 + (i * w) / planks, y0, w / planks, h);
    ctx.fillStyle = '#4a2e14';
    ctx.fillRect(x0 + (i * w) / planks, y0, 1.5, h);
  }
  ctx.strokeStyle = '#4c4f52';
  ctx.lineWidth = s * 0.05;
  ctx.strokeRect(x0, y0, w, h);
  ctx.fillStyle = '#6d7175';
  ctx.fillRect(s / 2 - s * 0.1, s / 2 - s * 0.1, s * 0.2, s * 0.2);
  ctx.fillStyle = '#9aa0a4';
  ctx.fillRect(s / 2 - s * 0.05, s / 2 - s * 0.05, s * 0.1, s * 0.1);
  ctx.fillStyle = '#a7abae';
  for (const [u, v] of [[0.12, 0.08], [0.88, 0.08], [0.12, 0.92], [0.88, 0.92]]) ctx.fillRect(x0 + w * u - 2, y0 + h * v - 2, 4, 4);
}

/** Fills a shape (points as fractions of the icon) with oak slats, and outlines it. */
function oak(ctx, s, pts, { seed = 3, tone = '#b07a40', slat = 0.12, across = false } = {}) {
  const r = rng(seed);
  ctx.save();
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
  ctx.closePath();
  ctx.clip();
  const n = Math.ceil(1 / slat);
  for (let i = 0; i < n; i++) {
    const g = 0.86 + r() * 0.26;
    const [cr, cg, cb] = [parseInt(tone.slice(1, 3), 16), parseInt(tone.slice(3, 5), 16), parseInt(tone.slice(5, 7), 16)];
    ctx.fillStyle = `rgb(${Math.round(cr * g)}, ${Math.round(cg * g)}, ${Math.round(cb * g)})`;
    if (across) ctx.fillRect(0, i * slat * s, s, slat * s + 1); else ctx.fillRect(i * slat * s, 0, slat * s + 1, s);
    ctx.fillStyle = 'rgba(60, 34, 12, 0.5)';
    if (across) ctx.fillRect(0, i * slat * s, s, 1.2); else ctx.fillRect(i * slat * s, 0, 1.2, s);
    for (let k = 0; k < 2; k++) {
      ctx.fillStyle = 'rgba(70, 40, 14, 0.3)';
      const p = (i + r()) * slat * s;
      if (across) ctx.fillRect(r() * s * 0.4, p, s * (0.3 + r() * 0.5), 1); else ctx.fillRect(p, r() * s * 0.4, 1, s * (0.3 + r() * 0.5));
    }
  }
  ctx.restore();
  ctx.strokeStyle = '#3e2410';
  ctx.lineWidth = s * 0.035;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
  ctx.closePath();
  ctx.stroke();
}

const DARK_OAK = '#76491f';

function helmet(ctx, s) {
  // the cap, as a rounded dome
  const dome = [];
  for (let i = 0; i <= 16; i++) { const a = Math.PI + (i / 16) * Math.PI; dome.push([0.5 + Math.cos(a) * 0.34, 0.6 + Math.sin(a) * 0.4]); }
  dome.push([0.84, 0.66], [0.16, 0.66]);
  oak(ctx, s, dome, { seed: 11 });
  // the brim and the nose guard
  oak(ctx, s, [[0.13, 0.58], [0.87, 0.58], [0.87, 0.68], [0.13, 0.68]], { seed: 12, tone: DARK_OAK, across: true, slat: 0.5 });
  oak(ctx, s, [[0.46, 0.6], [0.54, 0.6], [0.54, 0.86], [0.46, 0.86]], { seed: 13, tone: DARK_OAK });
}

function chestplate(ctx, s) {
  oak(ctx, s, [[0.24, 0.24], [0.4, 0.2], [0.6, 0.2], [0.76, 0.24], [0.76, 0.86], [0.24, 0.86]], { seed: 21 });
  oak(ctx, s, [[0.08, 0.3], [0.26, 0.2], [0.3, 0.42], [0.12, 0.46]], { seed: 22, tone: DARK_OAK });
  oak(ctx, s, [[0.92, 0.3], [0.74, 0.2], [0.7, 0.42], [0.88, 0.46]], { seed: 23, tone: DARK_OAK });
  ctx.fillStyle = 'rgba(52, 30, 12, 0.85)';
  ctx.fillRect(s * 0.24, s * 0.52, s * 0.52, s * 0.05);
}

function leggings(ctx, s) {
  oak(ctx, s, [[0.24, 0.24], [0.48, 0.24], [0.46, 0.9], [0.27, 0.9]], { seed: 31 });
  oak(ctx, s, [[0.52, 0.24], [0.76, 0.24], [0.73, 0.9], [0.54, 0.9]], { seed: 32 });
  oak(ctx, s, [[0.2, 0.1], [0.8, 0.1], [0.8, 0.28], [0.2, 0.28]], { seed: 33, tone: DARK_OAK, across: true, slat: 0.5 });
  oak(ctx, s, [[0.25, 0.62], [0.47, 0.62], [0.47, 0.72], [0.25, 0.72]], { seed: 34, tone: DARK_OAK, across: true, slat: 0.5 });
  oak(ctx, s, [[0.53, 0.62], [0.75, 0.62], [0.75, 0.72], [0.53, 0.72]], { seed: 35, tone: DARK_OAK, across: true, slat: 0.5 });
}

function boots(ctx, s) {
  for (const [dx, seed] of [[0, 41], [0.42, 42]]) {
    oak(ctx, s, [[0.1 + dx, 0.18], [0.32 + dx, 0.18], [0.32 + dx, 0.6], [0.48 + dx, 0.68], [0.48 + dx, 0.8], [0.1 + dx, 0.8]], { seed });
    oak(ctx, s, [[0.08 + dx, 0.76], [0.5 + dx, 0.76], [0.5 + dx, 0.86], [0.08 + dx, 0.86]], { seed: seed + 5, tone: DARK_OAK, across: true, slat: 0.5 });
  }
}

function bracelet(ctx, s) {
  ctx.strokeStyle = '#3a2616';
  ctx.lineWidth = s * 0.03;
  ctx.beginPath(); ctx.ellipse(s / 2, s / 2, s * 0.3, s * 0.24, 0, 0, Math.PI * 2); ctx.stroke();
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = s / 2 + Math.cos(a) * s * 0.3, y = s / 2 + Math.sin(a) * s * 0.24;
    ctx.fillStyle = i % 2 ? '#7a4a22' : '#c48c4e';
    ctx.beginPath(); ctx.arc(x, y, s * 0.075, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(40, 22, 8, 0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(255, 236, 200, 0.4)';
    ctx.fillRect(x - s * 0.03, y - s * 0.035, s * 0.025, s * 0.025);
  }
}

function charm(ctx, s) {
  // the cord, and the knot of oak hanging from it
  ctx.strokeStyle = '#3a2616';
  ctx.lineWidth = s * 0.03;
  ctx.beginPath(); ctx.moveTo(s * 0.2, s * 0.1); ctx.quadraticCurveTo(s * 0.5, s * 0.62, s * 0.8, s * 0.1); ctx.stroke();
  const disc = [];
  for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; disc.push([0.5 + Math.cos(a) * 0.22, 0.64 + Math.sin(a) * 0.24]); }
  oak(ctx, s, disc, { seed: 51, tone: '#c08a50' });
  ctx.strokeStyle = 'rgba(52, 28, 10, 0.9)';
  ctx.lineWidth = s * 0.04;
  ctx.beginPath(); ctx.arc(s * 0.5, s * 0.64, s * 0.1, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * 0.36, s * 0.64); ctx.lineTo(s * 0.64, s * 0.64); ctx.moveTo(s * 0.5, s * 0.49); ctx.lineTo(s * 0.5, s * 0.79); ctx.stroke();
}

export function itemIcon(kind) {
  return draw(kind, 96, (ctx, s) => {
    if (kind === 'wooden_sword') sword(ctx, s, { blade: '#c08a52', edge: '#d9a86e', guard: '#6b4220', grip: '#4a2c14', pommel: '#6b4220', wood: true });
    else if (kind === 'rusty_sword') sword(ctx, s, { blade: '#9fa3a3', edge: '#c9cccb', guard: '#5e4a32', grip: '#3b2a1c', pommel: '#6d5a3c', rust: true });
    else if (kind === 'wood_shield') shield(ctx, s);
    else if (kind === 'wood_helmet') helmet(ctx, s);
    else if (kind === 'wood_chestplate') chestplate(ctx, s);
    else if (kind === 'wood_leggings') leggings(ctx, s);
    else if (kind === 'wood_boots') boots(ctx, s);
    else if (kind === 'bead_bracelet') bracelet(ctx, s);
    else if (kind === 'oak_charm') charm(ctx, s);
  });
}

/** Outlines for empty equipment slots. */
export function slotIcon(slot) {
  return draw('slot:' + slot, 64, (ctx, s) => {
    ctx.fillStyle = '#f0dcb4';
    ctx.strokeStyle = '#f0dcb4';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    const p = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s))); ctx.closePath(); ctx.fill(); };
    switch (slot) {
      case 'helmet': p([[0.2, 0.62], [0.2, 0.42], [0.32, 0.22], [0.5, 0.16], [0.68, 0.22], [0.8, 0.42], [0.8, 0.62], [0.62, 0.62], [0.62, 0.8], [0.38, 0.8], [0.38, 0.62]]); break;
      case 'chest': p([[0.12, 0.3], [0.32, 0.16], [0.42, 0.24], [0.58, 0.24], [0.68, 0.16], [0.88, 0.3], [0.8, 0.46], [0.72, 0.42], [0.72, 0.86], [0.28, 0.86], [0.28, 0.42], [0.2, 0.46]]); break;
      case 'legs': p([[0.24, 0.14], [0.76, 0.14], [0.8, 0.88], [0.58, 0.88], [0.5, 0.38], [0.42, 0.88], [0.2, 0.88]]); break;
      case 'boots': p([[0.16, 0.18], [0.4, 0.18], [0.4, 0.6], [0.56, 0.7], [0.56, 0.84], [0.16, 0.84]]); p([[0.6, 0.18], [0.84, 0.18], [0.84, 0.84], [0.62, 0.84], [0.62, 0.6]]); break;
      case 'weapon': ctx.translate(s / 2, s / 2); ctx.rotate(-Math.PI / 4); ctx.fillRect(-s * 0.04, -s * 0.38, s * 0.08, s * 0.5); ctx.fillRect(-s * 0.15, s * 0.1, s * 0.3, s * 0.06); ctx.fillRect(-s * 0.03, s * 0.16, s * 0.06, s * 0.16); break;
      case 'offhand': p([[0.18, 0.16], [0.82, 0.16], [0.82, 0.84], [0.18, 0.84]]); break;
      default: // accessory: a ring
        ctx.beginPath(); ctx.arc(s / 2, s * 0.56, s * 0.24, 0, Math.PI * 2); ctx.stroke();
        p([[0.42, 0.22], [0.58, 0.22], [0.64, 0.3], [0.5, 0.38], [0.36, 0.3]]);
    }
  });
}
