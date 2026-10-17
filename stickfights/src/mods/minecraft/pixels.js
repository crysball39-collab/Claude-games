/* =============================================================================
   MINECRAFT - pixel art, the way the blocks and the mobs are drawn.

   A sprite is rows of letters, one per pixel, with a palette saying what
   colour each letter is ('.' is see-through). It is painted once, the first
   time it is needed, onto a little canvas of its own, and drawn from there
   at whatever size, with no smoothing, so the pixels stay square.

   A texture is the same, worked out pixel by pixel by a function instead
   (noise, mostly, the way block textures are), so a block can have a grain
   without anyone typing out 256 letters.

   Everything is drawn in the world's own units with y going up, which
   upends a canvas image: blit() turns it the right way up.
   ========================================================================== */

const painted = new WeakMap();

function canvasOf(w, h) {
  if (typeof document === 'undefined') return null;   // (a test with no page)
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** The canvas for a sprite (rows + palette), painted the first time it is asked for. `white` paints every pixel white. */
export function sprite(def, white = false) {
  let entry = painted.get(def);
  if (!entry) { entry = {}; painted.set(def, entry); }
  const key = white ? 'white' : 'plain';
  if (entry[key] !== undefined) return entry[key];
  const rows = def.rows, w = rows[0].length, h = rows.length;
  const c = canvasOf(w, h);
  if (c) {
    const g = c.getContext('2d');
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = rows[y][x];
        if (k === '.' || k === ' ') continue;
        g.fillStyle = white ? '#ffffff' : def.pal[k] || '#ff00ff';
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  entry[key] = c;
  return c;
}

/** A texture worked out pixel by pixel: fn(x, y) -> a colour, or null to leave it clear. */
export function texture(w, h, fn) {
  return { w, h, fn, rows: null };
}

export function textureCanvas(tex, white = false) {
  let entry = painted.get(tex);
  if (!entry) { entry = {}; painted.set(tex, entry); }
  const key = white ? 'white' : 'plain';
  if (entry[key] !== undefined) return entry[key];
  const c = canvasOf(tex.w, tex.h);
  if (c) {
    const g = c.getContext('2d');
    for (let y = 0; y < tex.h; y++) {
      for (let x = 0; x < tex.w; x++) {
        const col = tex.fn(x, y);
        if (!col) continue;
        g.fillStyle = white ? '#ffffff' : col;
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  entry[key] = c;
  return c;
}

/**
 * Draws a sprite or texture canvas into the box (x, y, w, h) - world units,
 * y up, (x, y) the bottom left corner - square pixels and all. `flip`
 * mirrors it left to right.
 */
export function blit(ctx, img, x, y, w, h, flip = false, alpha = 1) {
  if (!img) return;
  ctx.save();
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  ctx.translate(x + (flip ? w : 0), y + h);
  ctx.scale((flip ? -w : w) / img.width, -h / img.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/** Same, centred on (cx, cy) and turned by a (radians, the world's way round). */
export function blitAt(ctx, img, cx, cy, w, h, a = 0, flip = false, alpha = 1) {
  if (!img) return;
  ctx.save();
  ctx.translate(cx, cy);
  if (a) ctx.rotate(a);
  blit(ctx, img, -w / 2, -h / 2, w, h, flip, alpha);
  ctx.restore();
}

/** A steady pseudo-random number in 0..1 for a pixel, so a texture is the same every time. */
export function hash(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Checks that every row of a sprite is as long as the first (a mistake in one shows up at once). */
export function checked(def) {
  const w = def.rows[0].length;
  for (const r of def.rows) if (r.length !== w) throw new Error(`sprite row "${r}" is ${r.length} long, not ${w}`);
  return def;
}

/* --------------------------------- colours --------------------------------- */

export const C = {
  // Steve
  hair: '#3b2a1a', skin: '#bd8b72', skinDark: '#a8765e', beard: '#5e3f2c', eyeWhite: '#ffffff', eye: '#4b45b8',
  shirt: '#00a8a8', shirtDark: '#008282', pants: '#3b3dbf', pantsDark: '#2c2e8f', shoe: '#4a4a4a',
  // stone and diamond
  diamond: '#5decf5', diamondMid: '#2bc7d8', diamondDark: '#16707c', stone: '#8c8c8c', stoneDark: '#585858', stick: '#6b4423', stickDark: '#4a2e17',
  // the Wither and its skeletons
  wither: '#1c1c1c', witherMid: '#2e2e2e', witherLight: '#4a4a4a', bone: '#343434', boneLight: '#4f4f4f', boneDark: '#1a1a1a',
  armor: 'rgba(120, 190, 255, 0.45)', soulFire: '#38d6e8',
  // blocks
  plankLight: '#c69c5f', plank: '#9b7443', plankDark: '#75552c', post: '#5a3c1c',
  soul: '#4a3727', soulLight: '#5c4632', soulDark: '#3a2a1d', soulFace: '#271b12',
  gold: '#e1b12c', goldLight: '#fbe26a', goldDark: '#b58a17',
};

/* ---------------------------------- sprites ---------------------------------- */

/** A wither skeleton's skull, face on: dark, with black sockets and teeth. */
export const SKULL = checked({
  rows: [
    'kkkkkkkk',
    'kgggggkk',
    'kbbkkbbk',
    'kbbkkbbk',
    'kkkbbkkk',
    'kgkkkkgk',
    'kbkbkbkk',
    'kkkkkkkk',
  ],
  pal: { k: '#262626', g: '#383838', b: '#060606' },
});

/** The Wither's own heads: darker still, with a grey brow over the sockets. */
export const WITHER_HEAD = checked({
  rows: [
    'kkkkkkkk',
    'kggkkggk',
    'kbbkkbbk',
    'kbwkkbwk',
    'kkkbbkkk',
    'kkkkkkkk',
    'kbkbkbkk',
    'kkkkkkkk',
  ],
  pal: { k: '#191919', g: '#4a4a4a', b: '#020202', w: '#9a9a9a' },
});

/** A blue wither skull, the dangerous kind. */
export const BLUE_SKULL = checked({
  rows: SKULL.rows,
  pal: { k: '#3b6bd6', g: '#6aa0ff', b: '#0d1c52' },
});

/** Steve's head, side on, looking right: hair over the top and back, an eye, the beard. */
export const STEVE_HEAD = checked({
  rows: [
    'HHHHHHHH',
    'HHHHHHHH',
    'HHHHHHHS',
    'HHHSSWES',
    'HHHKSSSS',
    'HHSSSSSS',
    'HSSSSBBS',
    'HSSSBBBS',
  ],
  pal: { H: C.hair, S: C.skin, K: C.skinDark, W: C.eyeWhite, E: C.eye, B: C.beard },
});

/** A golden apple. */
export const GOLDEN_APPLE = checked({
  rows: [
    '....s...',
    '...sll..',
    '.gyyyyg.',
    'gyywyyyg',
    'gyyyyyyg',
    'gyyyyyyo',
    '.gyyyyo.',
    '..oooo..',
  ],
  pal: { s: '#5a3a1a', l: '#4c9a2a', g: C.gold, y: C.goldLight, w: '#fffbe0', o: C.goldDark },
});

/* --------------------------------- textures ---------------------------------- */

/** Soul sand: dark brown grit, and faces in it that look as if they are screaming. */
const SOUL_FACES = [[2, 2], [9, 7], [3, 11], [11, 1]];
export const SOUL_SAND = texture(16, 16, (x, y) => {
  for (const [fx, fy] of SOUL_FACES) {
    const dx = x - fx, dy = y - fy;
    // eyes, then a wide mouth, then a little chin
    if (dy === 0 && (dx === 0 || dx === 2)) return C.soulFace;
    if (dy === 2 && dx >= 0 && dx <= 2) return C.soulFace;
    if (dy === 3 && dx === 1) return C.soulFace;
    if (dy === 1 && (dx === 0 || dx === 2)) return C.soulDark;
  }
  const n = hash(x, y, 7);
  return n < 0.18 ? C.soulDark : n > 0.8 ? C.soulLight : C.soul;
});

/** A crafting table from the front: the top's edge, the legs, a saw and a hammer hung on it. */
export const CRAFTING_FRONT = checked({
  rows: [
    'TTTTTTTTTTTTTTTT',
    'TtTTTtTTTtTTTtTT',
    'DDDDDDDDDDDDDDDD',
    'PmmmmmmmmmmmmmmP',
    'PmssSmmmmHHHHmmP',
    'PmssSmmmmHHHHmmP',
    'PmssSmmmmmmwwmmP',
    'PdssSddddddwwddP',
    'PmssSmmmmmmwwmmP',
    'PmsSmmmmmmmwwmmP',
    'PmwwmmmmmmmwwmmP',
    'PmwwmmmmmmmmmmmP',
    'PddddddddddddddP',
    'PmmmmmmmmmmmmmmP',
    'PmmmmmmmmmmmmmmP',
    'PPPPPPPPPPPPPPPP',
  ],
  pal: { T: C.plankLight, t: '#a8823f', D: '#4f3418', P: C.post, m: C.plank, d: C.plankDark, s: '#cfcfcf', S: '#8a8a8a', H: '#707070', w: C.stick },
});
