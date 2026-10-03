/* =============================================================================
   Teams, and what each person looks like: shirt in the team colour, trousers
   a darker shade of it, a skin tone, hair, eyes, and a face painted onto the
   front of the head.
   ========================================================================== */
import { PARTS, P } from './rig.js';
import { FACE } from './paint.js';
import { pick, shade, mix } from '../core/util.js';

export const TEAMS = [
  { id: 'red', name: 'Red', color: '#d63a33', pants: '#5b1b19' },
  { id: 'blue', name: 'Blue', color: '#2f6fe0', pants: '#1c2f5c' },
  { id: 'yellow', name: 'Yellow', color: '#f2c22e', pants: '#5c4f1f' },
  { id: 'purple', name: 'Purple', color: '#8a46d6', pants: '#38204f' },
  { id: 'black', name: 'Black', color: '#232327', pants: '#3b3b42' },
  { id: 'orange', name: 'Orange', color: '#f07a1f', pants: '#5a3013' },
];
export const TEAM = Object.fromEntries(TEAMS.map((t) => [t.id, t]));

const SKINS = ['#f3cba9', '#e6b28b', '#d29a72', '#b07650', '#8a5636', '#5f3a24'];
const HAIR = ['#1d140d', '#3b2414', '#5e3a1f', '#8b5a2b', '#c9a15f', '#151515', '#7a2e17', '#9a9a9a'];
const EYES = ['#3b5e8c', '#4a7a3a', '#5a3a1f', '#2a1a10', '#6f7f8f'];
const SHOES = ['#1c1c1e', '#2c211a', '#3d3d3d', '#ece8e0'];
const STYLES = ['short', 'short', 'buzz', 'long', 'bald', 'mohawk'];

export function randomLook(team) {
  const t = TEAM[team];
  return {
    team,
    shirt: t.color,
    pants: t.pants,
    skin: pick(SKINS),
    hair: pick(HAIR),
    eyes: pick(EYES),
    shoe: pick(SHOES),
    style: pick(STYLES),
  };
}

/* -------------------------------- painting ------------------------------- */

function noise(ctx, t, base, amount, density = 0.06) {
  const n = Math.round(t.w * t.h * density);
  for (let i = 0; i < n; i++) {
    const x = t.x + Math.random() * t.w, y = t.y + Math.random() * t.h;
    ctx.fillStyle = Math.random() < 0.5 ? shade(base, 1 - amount) : shade(base, 1 + amount);
    ctx.fillRect(x, y, 1, 1);
  }
}

/** Light from above: tops brighter, bottoms darker, sides slightly darker. */
const FACE_SHADE = [0.93, 0.93, 1.08, 0.78, 1.0, 0.95];

function fillTile(ctx, t, color, fi) {
  ctx.fillStyle = shade(color, FACE_SHADE[fi]);
  // bleed one pixel past the tile so filtering never picks up a neighbour
  ctx.fillRect(t.x - 1, t.y - 1, t.w + 2, t.h + 2);
}

/** Paints a whole body's atlas. */
export function paintBody(ctx, layout, look) {
  ctx.clearRect(0, 0, layout.width, layout.height);
  PARTS.forEach((part, pi) => {
    const tiles = layout.tiles[pi];
    let color;
    switch (part.look) {
      case 'shirt': color = look.shirt; break;
      case 'pants': color = look.pants; break;
      case 'shoe': color = look.shoe; break;
      default: color = look.skin;
    }
    for (let fi = 0; fi < 6; fi++) {
      const t = tiles[fi];
      fillTile(ctx, t, color, fi);
      if (part.look === 'shirt' || part.look === 'pants') noise(ctx, t, color, 0.06, 0.05);
      else if (part.look === 'skin' || part.look === 'head') noise(ctx, t, color, 0.025, 0.03);
    }
    // details
    const tl = (f) => tiles[f];
    if (part.name === 'upperTorso') {
      // collar
      const t = tl(FACE.pz);
      ctx.fillStyle = look.skin;
      ctx.beginPath();
      ctx.moveTo(t.x + t.w * 0.38, t.y);
      ctx.lineTo(t.x + t.w * 0.5, t.y + t.h * 0.28);
      ctx.lineTo(t.x + t.w * 0.62, t.y);
      ctx.fill();
      ctx.fillStyle = shade(look.shirt, 0.8);
      ctx.fillRect(t.x + t.w * 0.48, t.y + t.h * 0.3, 1, t.h * 0.7);
    }
    if (part.name === 'lowerTorso') {
      // hem over the trousers
      for (const f of [0, 1, 4, 5]) {
        const t = tl(f);
        ctx.fillStyle = shade(look.shirt, 0.75);
        ctx.fillRect(t.x, t.y + t.h - 2, t.w, 2);
      }
    }
    if (part.name.startsWith('upperArm')) {
      for (const f of [0, 1, 4, 5]) {
        const t = tl(f);
        ctx.fillStyle = shade(look.shirt, 0.78);
        ctx.fillRect(t.x, t.y + t.h - 3, t.w, 3);
      }
    }
    if (part.name === 'pelvis') {
      // belt
      for (const f of [0, 1, 4, 5]) {
        const t = tl(f);
        ctx.fillStyle = '#1a1612';
        ctx.fillRect(t.x, t.y, t.w, Math.max(2, t.h * 0.16));
        if (f === FACE.pz) {
          ctx.fillStyle = '#b8a060';
          ctx.fillRect(t.x + t.w * 0.45, t.y, t.w * 0.1, Math.max(2, t.h * 0.16));
        }
      }
    }
    if (part.name.startsWith('foot')) {
      const t = tl(FACE.ny);
      ctx.fillStyle = shade(look.shoe === '#ece8e0' ? '#9a948a' : '#111111', 1);
      ctx.fillRect(t.x, t.y, t.w, t.h);
      for (const f of [0, 1, 4, 5]) {
        const s = tl(f);
        ctx.fillStyle = look.shoe === '#ece8e0' ? '#c9c3b8' : '#0d0d0d';
        ctx.fillRect(s.x, s.y + s.h - 2, s.w, 2);
      }
    }
    if (part.name.startsWith('hand')) {
      // knuckles on the front of the fist
      const t = tl(FACE.ny);
      ctx.fillStyle = shade(look.skin, 0.85);
      for (let k = 1; k < 4; k++) ctx.fillRect(t.x + (t.w * k) / 4, t.y + 1, 1, t.h - 2);
    }
  });
  paintHead(ctx, layout.tiles[P.head], look, 'normal');
}

/** Hair on the head's top, back and sides; the face on the front. */
export function paintHead(ctx, tiles, look, expression) {
  const hair = look.hair, style = look.style;
  const front = tiles[FACE.pz], top = tiles[FACE.py], back = tiles[FACE.nz];
  const sides = [tiles[FACE.px], tiles[FACE.nx]];

  if (expression === 'normal') {
    if (style !== 'bald') {
      ctx.fillStyle = hair;
      if (style === 'mohawk') {
        ctx.fillRect(top.x + top.w * 0.38, top.y, top.w * 0.24, top.h);
        ctx.fillRect(back.x + back.w * 0.38, back.y, back.w * 0.24, back.h * 0.6);
      } else {
        ctx.fillRect(top.x - 1, top.y - 1, top.w + 2, top.h + 2);
        noise(ctx, top, hair, 0.15, 0.08);
        const backH = style === 'long' ? 0.95 : style === 'buzz' ? 0.4 : 0.6;
        ctx.fillStyle = hair;
        ctx.fillRect(back.x - 1, back.y - 1, back.w + 2, back.h * backH + 1);
        for (const s of sides) {
          const h = style === 'long' ? 0.8 : style === 'buzz' ? 0.2 : 0.32;
          ctx.fillRect(s.x - 1, s.y - 1, s.w + 2, s.h * h + 1);
          if (style === 'long') {
            // hair falls behind the ear
            ctx.fillRect(s.x, s.y, s.w * 0.45, s.h * 0.95);
          }
        }
        // fringe
        const fh = style === 'buzz' ? 0.08 : style === 'long' ? 0.2 : 0.15;
        ctx.fillRect(front.x - 1, front.y - 1, front.w + 2, front.h * fh + 1);
        if (style === 'long') {
          ctx.fillRect(front.x, front.y, front.w * 0.12, front.h * 0.75);
          ctx.fillRect(front.x + front.w * 0.88, front.y, front.w * 0.12, front.h * 0.75);
        }
      }
    }
    // ears
    for (const s of sides) {
      ctx.fillStyle = shade(look.skin, 0.82);
      ctx.fillRect(s.x + s.w * 0.42, s.y + s.h * 0.36, s.w * 0.16, s.h * 0.24);
    }
  }

  const f = front;
  const ex = f.w * 0.21, ey = f.h * 0.42, ew = f.w * 0.17, eh = Math.max(3, f.h * 0.085);
  const cx = f.x + f.w / 2;
  // clear the face region below the fringe, so expressions can be redrawn
  if (expression !== 'normal') {
    ctx.fillStyle = look.skin;
    ctx.fillRect(f.x + f.w * 0.15, f.y + f.h * 0.3, f.w * 0.7, f.h * 0.3);
  }
  for (const s of [-1, 1]) {
    const x = cx + s * ex - ew / 2, y = f.y + ey;
    if (expression === 'dead') {
      ctx.strokeStyle = '#1a0a0a';
      ctx.lineWidth = Math.max(1, f.w * 0.035);
      ctx.beginPath();
      ctx.moveTo(x, y - eh * 0.3); ctx.lineTo(x + ew, y + eh * 1.2);
      ctx.moveTo(x + ew, y - eh * 0.3); ctx.lineTo(x, y + eh * 1.2);
      ctx.stroke();
      continue;
    }
    if (expression === 'hurt') {
      ctx.fillStyle = '#1a0a0a';
      ctx.fillRect(x, y + eh * 0.4, ew, Math.max(1, eh * 0.35));
      continue;
    }
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(x, y, ew, eh);
    ctx.fillStyle = look.eyes;
    ctx.fillRect(x + ew * 0.3, y, ew * 0.45, eh);
    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(x + ew * 0.42, y + eh * 0.2, ew * 0.22, eh * 0.6);
    // brow
    ctx.fillStyle = shade(look.hair, 0.9);
    ctx.fillRect(x - ew * 0.1, y - eh * 1.1, ew * 1.2, Math.max(1, eh * 0.45));
  }
  if (expression === 'normal') {
    // nose
    ctx.fillStyle = shade(look.skin, 0.8);
    ctx.fillRect(cx - f.w * 0.04, f.y + f.h * 0.52, f.w * 0.08, f.h * 0.12);
  }
  // mouth
  ctx.fillStyle = expression === 'normal' ? mix(look.skin, '#5a1a1a', 0.6) : '#2a0b0b';
  const mw = f.w * (expression === 'normal' ? 0.3 : 0.24);
  ctx.fillRect(cx - mw / 2, f.y + f.h * 0.74, mw, Math.max(2, f.h * 0.045));
}
