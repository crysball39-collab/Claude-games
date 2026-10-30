/* =============================================================================
   What everybody looks like.

   Each kind of fighter has its own outfit, painted straight onto the boxes
   of its body: the player's blue tunic and red headband; the brawlers'
   bare chests and taped fists (so the bruises show); the swordsmen's
   tunics, the shield bearers' olive, the gunners' black vests, the
   champion's red sash, and the shopkeeper's apron. Skin, hair and eyes vary
   from person to person, and the face is painted onto the front of the head.

   `surface[i]` says, for every body part, whether it is covered by cloth and
   in what colour, so a blade can tear the cloth and show the skin under it.
   ========================================================================== */
import { PARTS, P } from './rig.js';
import { FACE } from './paint.js';
import { pick, shade, mix, chance } from '../core/util.js';

const SKINS = ['#f3cba9', '#e6b28b', '#d29a72', '#b07650', '#8a5636', '#5f3a24'];
const HAIR = ['#1d140d', '#3b2414', '#5e3a1f', '#8b5a2b', '#c9a15f', '#151515', '#7a2e17', '#9a9a9a'];
const EYES = ['#3b5e8c', '#4a7a3a', '#5a3a1f', '#2a1a10', '#6f7f8f'];
const STYLES = ['short', 'short', 'buzz', 'long', 'bald', 'mohawk'];
const EARTH = ['#5b3a29', '#3c4a2c', '#4a4a52', '#6b2b20', '#2f3640', '#5a4a32'];

/** The kinds of people, and how each dresses. */
export const KINDS = {
  player: () => ({
    skin: '#d9a27a', hair: '#2b1a10', eyes: '#3b5e8c', style: 'short',
    shirt: '#2d5d9a', sleeves: true, pants: '#3b2f26', shoe: '#4a3020',
    band: '#c0302a', wraps: '#e8e2d0', sash: '#1a1612', face: 'normal',
  }),
  brawler: () => ({
    shirt: null, sleeves: false, pants: pick(EARTH), shoe: chance(0.5) ? null : '#3a2a1c',
    wraps: pick(['#d8cfb8', '#d8cfb8', '#9a2a22', '#2b2b2b']), band: chance(0.3) ? pick(['#9a2a22', '#2b2b2b', '#c9a15f']) : null,
    sash: '#1a1612', face: 'angry',
  }),
  swordsman: () => ({
    shirt: pick(['#8c2f22', '#a07a2c', '#6b4a2a']), sleeves: true, pants: pick(['#2f2a24', '#3a3026']), shoe: '#3a2a1c',
    wraps: null, band: null, sash: '#5a3b1c', face: 'angry',
  }),
  shield: () => ({
    shirt: '#4b5d3a', sleeves: true, pants: '#2f3326', shoe: '#2a2018',
    wraps: '#8a7a5a', band: chance(0.5) ? '#2b2b2b' : null, sash: '#3a2a18', face: 'angry',
  }),
  gunner: () => ({
    shirt: '#6f747a', sleeves: true, vest: '#1f2226', pants: '#25282d', shoe: '#141414',
    wraps: null, band: null, mask: '#2a2d33', sash: '#141414', face: 'angry',
  }),
  champion: () => ({
    skin: pick(['#b07650', '#8a5636', '#d29a72']), hair: '#151515', style: 'bald', beard: true,
    shirt: null, sleeves: false, pants: '#2a1414', shoe: '#2a1a10',
    wraps: '#d4a838', band: null, sash: '#b3201c', face: 'angry',
  }),
  keeper: () => ({
    skin: '#e6b28b', hair: '#9a9a9a', style: 'short', eyes: '#5a3a1f', mustache: true,
    shirt: '#e0d6c0', sleeves: true, apron: '#6b4a2a', pants: '#3a3026', shoe: '#2c211a',
    wraps: null, band: null, sash: '#4a3020', face: 'normal',
  }),
  red: () => ({ shirt: null, sleeves: false, pants: '#7a1c18', shoe: null, wraps: '#d63a33', sash: '#1a1612', face: 'angry' }),
  blue: () => ({ shirt: null, sleeves: false, pants: '#1c2f5c', shoe: null, wraps: '#2f6fe0', sash: '#1a1612', face: 'angry' }),
};

export function makeLook(kind) {
  const base = { skin: pick(SKINS), hair: pick(HAIR), eyes: pick(EYES), style: pick(STYLES) };
  const look = { kind, ...base, ...KINDS[kind]() };
  if (look.style === 'bald') look.hair = shade(look.skin, 0.9);
  look.surface = surfaces(look);
  return look;
}

/** Per body part: the colour of the cloth over it, or null for bare skin. */
function surfaces(look) {
  return PARTS.map((p) => {
    const n = p.name;
    if (n === 'pelvis' || n.startsWith('upperLeg') || n.startsWith('lowerLeg')) return look.pants;
    if (n.includes('Torso')) return look.vest || look.shirt;
    if (n.startsWith('upperArm')) return look.sleeves ? look.shirt : null;
    if (n.startsWith('foot')) return look.shoe;
    return null;
  });
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

const SIDES = [FACE.px, FACE.nx, FACE.pz, FACE.nz];

/** Paints a whole body's atlas. */
export function paintBody(ctx, layout, look) {
  ctx.clearRect(0, 0, layout.width, layout.height);
  PARTS.forEach((part, pi) => {
    const tiles = layout.tiles[pi];
    const n = part.name;
    const cloth = look.surface[pi];
    let color = cloth || look.skin;
    if (n.startsWith('hand') && look.wraps) color = look.wraps;
    for (let fi = 0; fi < 6; fi++) {
      const t = tiles[fi];
      fillTile(ctx, t, color, fi);
      noise(ctx, t, color, cloth ? 0.06 : 0.025, cloth ? 0.05 : 0.03);
    }
    const tl = (f) => tiles[f];

    if (n === 'upperTorso') {
      const t = tl(FACE.pz);
      if (look.shirt) {
        // collar
        ctx.fillStyle = look.skin;
        ctx.beginPath();
        ctx.moveTo(t.x + t.w * 0.38, t.y);
        ctx.lineTo(t.x + t.w * 0.5, t.y + t.h * 0.28);
        ctx.lineTo(t.x + t.w * 0.62, t.y);
        ctx.fill();
      } else {
        // bare chest: a line down the middle and the pecs
        ctx.fillStyle = shade(look.skin, 0.82);
        ctx.fillRect(t.x + t.w * 0.495, t.y + t.h * 0.15, 1, t.h * 0.7);
        ctx.fillRect(t.x + t.w * 0.18, t.y + t.h * 0.62, t.w * 0.26, 1);
        ctx.fillRect(t.x + t.w * 0.56, t.y + t.h * 0.62, t.w * 0.26, 1);
      }
      if (look.vest) {
        // the shirt shows down the open front of the vest
        ctx.fillStyle = look.shirt;
        ctx.fillRect(t.x + t.w * 0.4, t.y, t.w * 0.2, t.h);
        ctx.fillStyle = '#5a5e64';
        for (let k = 0; k < 3; k++) ctx.fillRect(t.x + t.w * 0.37, t.y + t.h * (0.25 + k * 0.25), 2, 2);
      }
    }
    if (n === 'middleTorso' || n === 'lowerTorso') {
      const t = tl(FACE.pz);
      if (look.vest) {
        ctx.fillStyle = look.shirt;
        ctx.fillRect(t.x + t.w * 0.4, t.y, t.w * 0.2, t.h);
      } else if (!look.shirt) {
        // stomach muscles
        ctx.fillStyle = shade(look.skin, 0.84);
        ctx.fillRect(t.x + t.w * 0.495, t.y, 1, t.h * 0.9);
        ctx.fillRect(t.x + t.w * 0.3, t.y + t.h * 0.5, t.w * 0.4, 1);
      }
      if (look.apron) {
        ctx.fillStyle = look.apron;
        ctx.fillRect(t.x + t.w * 0.12, t.y - 1, t.w * 0.76, t.h + 2);
      }
    }
    if (n === 'upperTorso' && look.apron) {
      const t = tl(FACE.pz);
      ctx.fillStyle = look.apron;
      ctx.fillRect(t.x + t.w * 0.22, t.y + t.h * 0.35, t.w * 0.56, t.h * 0.65 + 1);
      ctx.fillRect(t.x + t.w * 0.22, t.y, 2, t.h * 0.35);
      ctx.fillRect(t.x + t.w * 0.78 - 2, t.y, 2, t.h * 0.35);
    }
    if (n === 'lowerTorso' && look.shirt) {
      // hem over the trousers
      for (const f of SIDES) {
        const t = tl(f);
        ctx.fillStyle = shade(look.vest || look.shirt, 0.75);
        ctx.fillRect(t.x, t.y + t.h - 2, t.w, 2);
      }
    }
    if (n.startsWith('upperArm') && look.sleeves && look.shirt) {
      for (const f of SIDES) {
        const t = tl(f);
        ctx.fillStyle = shade(look.shirt, 0.78);
        ctx.fillRect(t.x, t.y + t.h - 3, t.w, 3);
      }
    }
    if (n === 'pelvis') {
      // belt or sash
      for (const f of SIDES) {
        const t = tl(f);
        ctx.fillStyle = look.sash || '#1a1612';
        ctx.fillRect(t.x, t.y, t.w, Math.max(2, t.h * (look.sash && look.sash !== '#1a1612' ? 0.3 : 0.16)));
        if (f === FACE.pz && (!look.sash || look.sash === '#1a1612')) {
          ctx.fillStyle = '#b8a060';
          ctx.fillRect(t.x + t.w * 0.45, t.y, t.w * 0.1, Math.max(2, t.h * 0.16));
        }
      }
      if (look.apron) {
        const t = tl(FACE.pz);
        ctx.fillStyle = look.apron;
        ctx.fillRect(t.x + t.w * 0.12, t.y + t.h * 0.16, t.w * 0.76, t.h);
      }
    }
    if (n.startsWith('lowerLeg') && look.apron) {
      const t = tl(FACE.pz);
      ctx.fillStyle = look.apron;
      ctx.fillRect(t.x, t.y, t.w, t.h * 0.25);
    }
    if (n.startsWith('foot')) {
      const t = tl(FACE.ny);
      ctx.fillStyle = look.shoe ? '#111111' : shade(look.skin, 0.75);
      ctx.fillRect(t.x, t.y, t.w, t.h);
      if (look.shoe) {
        for (const f of SIDES) {
          const s = tl(f);
          ctx.fillStyle = '#0d0d0d';
          ctx.fillRect(s.x, s.y + s.h - 2, s.w, 2);
        }
      } else {
        // toes on the front of a bare foot
        const s = tl(FACE.pz);
        ctx.fillStyle = shade(look.skin, 0.78);
        for (let k = 1; k < 5; k++) ctx.fillRect(s.x + (s.w * k) / 5, s.y + s.h * 0.4, 1, s.h * 0.6);
      }
    }
    if (n.startsWith('hand')) {
      // knuckles on the front of the fist
      const t = tl(FACE.ny);
      ctx.fillStyle = shade(look.wraps || look.skin, 0.82);
      for (let k = 1; k < 4; k++) ctx.fillRect(t.x + (t.w * k) / 4, t.y + 1, 1, t.h - 2);
    }
    if (n.startsWith('lowerArm') && look.wraps) {
      // the tape runs up past the wrist
      for (const f of SIDES) {
        const t = tl(f);
        ctx.fillStyle = shade(look.wraps, FACE_SHADE[f]);
        ctx.fillRect(t.x - 1, t.y + t.h * 0.72, t.w + 2, t.h * 0.28 + 1);
        ctx.fillStyle = shade(look.wraps, 0.8);
        ctx.fillRect(t.x, t.y + t.h * 0.8, t.w, 1);
      }
    }
  });
  paintHead(ctx, layout.tiles[P.head], look, look.face || 'normal');
}

/** Hair on the head's top, back and sides; the face on the front. */
export function paintHead(ctx, tiles, look, expression) {
  const hair = look.hair, style = look.style;
  const front = tiles[FACE.pz], top = tiles[FACE.py], back = tiles[FACE.nz];
  const sides = [tiles[FACE.px], tiles[FACE.nx]];
  const fresh = expression === 'normal' || expression === 'angry';

  if (fresh) {
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
          if (style === 'long') ctx.fillRect(s.x, s.y, s.w * 0.45, s.h * 0.95);
        }
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
    // a headband all the way round
    if (look.band) {
      for (const t of [front, back, ...sides]) {
        ctx.fillStyle = look.band;
        ctx.fillRect(t.x - 1, t.y + t.h * 0.17, t.w + 2, Math.max(2, t.h * 0.1));
      }
      ctx.fillRect(back.x + back.w * 0.42, back.y + back.h * 0.22, back.w * 0.06, back.h * 0.3);
      ctx.fillRect(back.x + back.w * 0.52, back.y + back.h * 0.22, back.w * 0.06, back.h * 0.26);
    }
    if (look.beard) {
      ctx.fillStyle = mix(look.hair, look.skin, 0.15);
      ctx.fillRect(front.x - 1, front.y + front.h * 0.66, front.w + 2, front.h * 0.34 + 1);
      for (const s of sides) ctx.fillRect(s.x + s.w * 0.6, s.y + s.h * 0.55, s.w * 0.4 + 1, s.h * 0.45 + 1);
    }
  }

  const f = front;
  const ex = f.w * 0.21, ey = f.h * 0.42, ew = f.w * 0.17, eh = Math.max(3, f.h * 0.085);
  const cx = f.x + f.w / 2;
  // clear the face region below the fringe, so expressions can be redrawn
  if (!fresh) {
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
    // brow: level, or slanted down toward the nose when angry
    ctx.fillStyle = shade(look.style === 'bald' ? '#3a2a20' : look.hair, 0.85);
    const bw = ew * 1.25, bh = Math.max(1.5, eh * 0.5);
    const bx = x - ew * 0.12, by = y - eh * 1.15;
    if (expression === 'angry') {
      ctx.beginPath();
      // inner end (toward the nose) lower than the outer end
      const inner = s < 0 ? bx + bw : bx, outer = s < 0 ? bx : bx + bw;
      ctx.moveTo(outer, by - bh * 0.4);
      ctx.lineTo(inner, by + bh * 0.9);
      ctx.lineTo(inner, by + bh * 1.9);
      ctx.lineTo(outer, by + bh * 0.6);
      ctx.fill();
    } else {
      ctx.fillRect(bx, by, bw, bh);
    }
  }
  if (fresh) {
    // nose
    ctx.fillStyle = shade(look.skin, 0.8);
    ctx.fillRect(cx - f.w * 0.04, f.y + f.h * 0.52, f.w * 0.08, f.h * 0.12);
    if (look.mustache) {
      ctx.fillStyle = shade(look.hair, 0.9);
      ctx.fillRect(cx - f.w * 0.17, f.y + f.h * 0.66, f.w * 0.34, Math.max(2, f.h * 0.05));
    }
  }
  // mouth
  ctx.fillStyle = expression === 'normal' ? mix(look.skin, '#5a1a1a', 0.6) : '#2a0b0b';
  const mw = f.w * (expression === 'normal' ? 0.3 : 0.24);
  ctx.fillRect(cx - mw / 2, f.y + f.h * 0.74, mw, Math.max(2, f.h * 0.045));
  // a gunner's mask over the lower face
  if (look.mask && fresh) {
    ctx.fillStyle = look.mask;
    ctx.fillRect(f.x - 1, f.y + f.h * 0.58, f.w + 2, f.h * 0.42 + 1);
    for (const s of sides) ctx.fillRect(s.x + s.w * 0.55, s.y + s.h * 0.58, s.w * 0.45 + 1, s.h * 0.2);
  }
}
