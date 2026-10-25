/* =============================================================================
   Icons, painted on a canvas. Every part of a forged thing is painted in the
   ore it was forged from, so a Diamond sword with a Gold guard and an Iron
   pommel looks exactly like that in the bag.

   Each icon is drawn once and kept as a data URL.
   ========================================================================== */
import { ORES, PICKAXES, partsOf } from '../game/data.js';

const S = 128;
const cache = new Map();
const OUTLINE = '#1a110a';

function canvas() {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  return c;
}

function cached(key, draw) {
  let url = cache.get(key);
  if (url) return url;
  const c = canvas();
  const ctx = c.getContext('2d');
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

/* --------------------------------- paint ----------------------------------- */

/** A fill that looks like the ore: metal shines, gems glint, Irisite shifts. */
function orePaint(ctx, ore, x0, y0, x1, y1) {
  const L = (ORES[ore] || ORES.stone).look;
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  if (L.kind === 'iris') {
    ['#ff6ad5', '#ffd36a', '#7affb0', '#6ad8ff', '#b07aff', '#ff6ad5'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
  } else if (L.kind === 'metal') {
    g.addColorStop(0, L.light); g.addColorStop(0.35, L.base); g.addColorStop(0.55, L.light);
    g.addColorStop(0.75, L.base); g.addColorStop(1, L.dark);
  } else if (L.kind === 'gem') {
    g.addColorStop(0, L.light); g.addColorStop(0.45, L.base); g.addColorStop(1, L.dark);
  } else {
    g.addColorStop(0, L.light); g.addColorStop(0.5, L.base); g.addColorStop(1, L.dark);
  }
  return g;
}

function shape(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

/** Fills the current path with the ore and outlines it. */
function paint(ctx, ore, box = [0, 0, S, S], line = 4) {
  ctx.fillStyle = orePaint(ctx, ore, box[0], box[1], box[2], box[3]);
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = line;
  ctx.stroke();
}

function plainFill(ctx, fill, line = 4) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = line;
  ctx.stroke();
}

function glint(ctx, x, y, r = 6) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.25, y - r * 0.25); ctx.lineTo(x + r, y);
  ctx.lineTo(x + r * 0.25, y + r * 0.25); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.25, y + r * 0.25);
  ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.25, y - r * 0.25); ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function halo(ctx, color, strength = 0.5) {
  const g = ctx.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  g.addColorStop(0, color.replace('rgb', 'rgba').replace(')', `,${strength})`));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
}

const hexRgb = (h) => {
  const n = parseInt(h.slice(1), 16);
  return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
};

/* ---------------------------------- ores ----------------------------------- */

export function oreIcon(id) {
  return cached('ore:' + id, (ctx) => {
    const L = ORES[id].look;
    if (L.kind === 'iris' || L.kind === 'gem') halo(ctx, hexRgb(L.base), L.kind === 'iris' ? 0.55 : 0.3);
    if (L.kind === 'bone') {
      drawBone(ctx, 64, 64, 0.75, 92);
      drawBone(ctx, 64, 64, -0.75, 92);
      return;
    }
    if (L.kind === 'gem' || L.kind === 'iris') {
      // a cluster of crystals
      crystal(ctx, id, 64, 104, 22, 70, -0.05);
      crystal(ctx, id, 38, 108, 15, 44, -0.45);
      crystal(ctx, id, 90, 108, 16, 48, 0.42);
      glint(ctx, 58, 46, 8);
      if (L.kind === 'iris') { glint(ctx, 92, 68, 6); glint(ctx, 34, 74, 5); }
      return;
    }
    // a lump: rock is matte and speckled, metal is a faceted nugget
    const pts = [[30, 52], [48, 30], [80, 26], [102, 44], [106, 76], [86, 100], [50, 104], [24, 84]];
    shape(ctx, pts);
    paint(ctx, id, [20, 20, 110, 110]);
    ctx.save();
    shape(ctx, pts);
    ctx.clip();
    // facets: a bright one up top, a dark one underneath
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    shape(ctx, [[48, 30], [80, 26], [72, 52], [44, 56]]); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    shape(ctx, [[86, 100], [106, 76], [80, 70], [62, 88]]); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    for (const [a, b] of [[[44, 56], [72, 52]], [[72, 52], [80, 70]], [[80, 70], [62, 88]], [[44, 56], [62, 88]]]) {
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
    }
    if (L.kind === 'rock') {
      ctx.fillStyle = 'rgba(40,36,32,0.45)';
      for (const [x, y, r] of [[50, 70, 4], [78, 48, 3], [88, 82, 3.5], [40, 88, 2.5], [66, 92, 3]]) {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    if (L.kind === 'metal') { glint(ctx, 58, 40, 7); glint(ctx, 92, 60, 4); }
  });
}

function crystal(ctx, ore, x, base, w, h, tilt) {
  ctx.save();
  ctx.translate(x, base);
  ctx.rotate(tilt);
  const pts = [[-w / 2, 0], [-w / 2, -h * 0.72], [0, -h], [w / 2, -h * 0.72], [w / 2, 0]];
  shape(ctx, pts);
  paint(ctx, ore, [-w, -h, w, 0], 3.5);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  shape(ctx, [[-w / 2, 0], [-w / 2, -h * 0.72], [0, -h], [0, 0]]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, 0); ctx.stroke();
  ctx.restore();
}

/** A bone: a shaft with two knuckles at each end. */
function drawBone(ctx, cx, cy, angle, len, ore = 'bones') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  const half = len / 2, w = 10, k = 9;
  const path = () => {
    ctx.beginPath();
    ctx.rect(-half + k, -w / 2, len - 2 * k, w);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const x = sx * (half - k), y = sy * k * 0.62;
        ctx.moveTo(x + k * 0.9, y);
        ctx.arc(x, y, k * 0.9, 0, Math.PI * 2);
      }
    }
  };
  // outline everything first, then fill over the inside of it, so the
  // knuckles and the shaft read as one shape
  path();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 7;
  ctx.stroke();
  path();
  ctx.fillStyle = orePaint(ctx, ore, -half, -20, half, 20);
  ctx.fill();
  ctx.restore();
}

/* --------------------------------- weapons --------------------------------- */

const BLADES = {
  //          blade length, width, guard width, grip, pommel
  dagger: { bl: 46, bw: 15, gw: 34, grip: 18, pr: 7 },
  sword: { bl: 70, bw: 12, gw: 40, grip: 20, pr: 7.5 },
  broadsword: { bl: 72, bw: 20, gw: 52, grip: 26, pr: 9 },
};

function drawWeapon(ctx, type, [blade, guard, pommel]) {
  const B = BLADES[type];
  const total = B.bl + B.grip + B.pr * 2 + 8;
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.rotate(Math.PI / 4);
  const top = -total / 2, gy = top + B.bl;          // the blade runs from top to the guard
  // blade, with a ridge down the middle
  shape(ctx, [[0, top], [B.bw / 2, top + B.bw * 0.9], [B.bw / 2, gy], [-B.bw / 2, gy], [-B.bw / 2, top + B.bw * 0.9]]);
  paint(ctx, blade, [-B.bw, top, B.bw, gy]);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, top + 6); ctx.lineTo(0, gy - 3); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  shape(ctx, [[0, top + 4], [B.bw / 2 - 2, top + B.bw * 0.9], [B.bw / 2 - 2, gy - 2], [0, gy - 2]]);
  ctx.fill();
  // cross-guard
  const gh = type === 'dagger' ? 7 : 8;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(-B.gw / 2, gy, B.gw, gh, 3) : ctx.rect(-B.gw / 2, gy, B.gw, gh);
  paint(ctx, guard, [-B.gw / 2, gy, B.gw / 2, gy + gh]);
  if (type !== 'dagger') {
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sx * B.gw / 2, gy + gh / 2, gh * 0.75, 0, Math.PI * 2);
      paint(ctx, guard, [-B.gw / 2, gy, B.gw / 2, gy + gh], 3);
    }
  }
  // grip, wrapped
  const g0 = gy + gh, g1 = g0 + B.grip;
  ctx.beginPath();
  ctx.rect(-4.5, g0, 9, B.grip);
  plainFill(ctx, '#6b3f1d', 3);
  ctx.strokeStyle = '#2e1a0b';
  ctx.lineWidth = 2;
  for (let y = g0 + 4; y < g1 - 1; y += 5) { ctx.beginPath(); ctx.moveTo(-4.5, y); ctx.lineTo(4.5, y + 2); ctx.stroke(); }
  // pommel
  ctx.beginPath();
  if (type === 'dagger') ctx.arc(0, g1 + B.pr - 1, B.pr, 0, Math.PI * 2);
  else shape(ctx, [[0, g1 - 1], [B.pr, g1 + B.pr], [0, g1 + B.pr * 2 + 1], [-B.pr, g1 + B.pr]]);
  paint(ctx, pommel, [-B.pr, g1, B.pr, g1 + B.pr * 2], 3);
  ctx.restore();
  glint(ctx, 84, 34, 5);
}

/* -------------------------------- pickaxes --------------------------------- */

function drawPickaxe(ctx, type) {
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.rotate(Math.PI / 4);
  ctx.beginPath();
  ctx.rect(-5, -40, 10, 92);
  plainFill(ctx, '#9a6a3a');
  ctx.strokeStyle = 'rgba(60,34,14,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-1, -34); ctx.lineTo(-1, 46); ctx.stroke();
  // the head, a crescent of two picks
  ctx.beginPath();
  ctx.moveTo(-50, -18);
  ctx.quadraticCurveTo(-20, -52, 0, -50);
  ctx.quadraticCurveTo(20, -52, 50, -18);
  ctx.quadraticCurveTo(18, -38, 0, -36);
  ctx.quadraticCurveTo(-18, -38, -50, -18);
  ctx.closePath();
  if (type === 'stone') paint(ctx, 'stone', [-50, -52, 50, -18]);
  else plainFill(ctx, '#c99256');
  ctx.beginPath();
  ctx.rect(-9, -52, 18, 18);
  if (type === 'stone') plainFill(ctx, '#bfa070', 3); else plainFill(ctx, '#8a5a2e', 3);
  ctx.restore();
}

/* --------------------------------- armour ---------------------------------- */

function drawHelmet(ctx, [plate, body, trim]) {
  // side and back guards
  ctx.beginPath();
  ctx.moveTo(26, 62); ctx.lineTo(26, 100); ctx.lineTo(44, 106); ctx.lineTo(46, 70); ctx.closePath();
  paint(ctx, body, [26, 60, 46, 106]);
  ctx.beginPath();
  ctx.moveTo(102, 62); ctx.lineTo(102, 100); ctx.lineTo(84, 106); ctx.lineTo(82, 70); ctx.closePath();
  paint(ctx, body, [82, 60, 102, 106]);
  // the crown
  ctx.beginPath();
  ctx.moveTo(24, 70);
  ctx.bezierCurveTo(22, 22, 106, 22, 104, 70);
  ctx.closePath();
  paint(ctx, plate, [24, 24, 104, 70]);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.ellipse(48, 44, 12, 7, -0.5, 0, Math.PI * 2); ctx.fill();
  // brow band, nose guard, crest
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(20, 64, 88, 11, 4) : ctx.rect(20, 64, 88, 11);
  paint(ctx, trim, [20, 64, 108, 75], 3.5);
  ctx.beginPath(); ctx.rect(59, 72, 10, 30);
  paint(ctx, trim, [59, 72, 69, 102], 3.5);
  ctx.beginPath(); ctx.moveTo(56, 26); ctx.quadraticCurveTo(64, 10, 72, 26); ctx.closePath();
  paint(ctx, trim, [56, 10, 72, 26], 3);
}

function drawChest(ctx, [plate, body, trim]) {
  // pauldrons
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(64 + sx * 38, 40, 17, 14, sx * 0.4, 0, Math.PI * 2);
    paint(ctx, body, [64 + sx * 38 - 17, 26, 64 + sx * 38 + 17, 54]);
  }
  // lower plates
  ctx.beginPath();
  ctx.moveTo(38, 82); ctx.lineTo(90, 82); ctx.lineTo(86, 112); ctx.lineTo(42, 112); ctx.closePath();
  paint(ctx, body, [38, 82, 90, 112]);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2;
  for (const y of [92, 102]) { ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(88, y); ctx.stroke(); }
  // breastplate
  ctx.beginPath();
  ctx.moveTo(34, 30); ctx.lineTo(52, 26); ctx.quadraticCurveTo(64, 34, 76, 26); ctx.lineTo(94, 30);
  ctx.lineTo(92, 86); ctx.quadraticCurveTo(64, 94, 36, 86); ctx.closePath();
  paint(ctx, plate, [34, 26, 94, 92]);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(64, 36); ctx.lineTo(64, 86); ctx.stroke();
  // trim: collar and the lower edge
  ctx.beginPath(); ctx.moveTo(50, 24); ctx.quadraticCurveTo(64, 36, 78, 24);
  ctx.lineWidth = 9; ctx.strokeStyle = OUTLINE; ctx.stroke();
  ctx.lineWidth = 5.5; ctx.strokeStyle = orePaint(ctx, trim, 50, 20, 78, 36); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(36, 86); ctx.quadraticCurveTo(64, 94, 92, 86);
  ctx.lineWidth = 9; ctx.strokeStyle = OUTLINE; ctx.stroke();
  ctx.lineWidth = 5.5; ctx.strokeStyle = orePaint(ctx, trim, 36, 84, 92, 94); ctx.stroke();
}

function drawLegs(ctx, [plate, body, trim]) {
  for (const sx of [-1, 1]) {
    const x = 64 + sx * 17;
    ctx.beginPath();
    ctx.moveTo(x - 14, 34); ctx.lineTo(x + 14, 34); ctx.lineTo(x + 12, 112); ctx.lineTo(x - 12, 112); ctx.closePath();
    paint(ctx, body, [x - 14, 34, x + 14, 112]);
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x - 11, 40, 22, 30, 5) : ctx.rect(x - 11, 40, 22, 30);
    paint(ctx, plate, [x - 11, 40, x + 11, 70], 3.5);
    ctx.beginPath();
    ctx.ellipse(x, 78, 11, 8, 0, 0, Math.PI * 2);
    paint(ctx, trim, [x - 11, 70, x + 11, 86], 3.5);
  }
  // faulds and belt
  ctx.beginPath();
  ctx.moveTo(42, 24); ctx.lineTo(86, 24); ctx.lineTo(90, 46); ctx.lineTo(38, 46); ctx.closePath();
  paint(ctx, plate, [38, 24, 90, 46]);
  ctx.beginPath(); ctx.rect(38, 18, 52, 9);
  paint(ctx, trim, [38, 18, 90, 27], 3.5);
}

function drawBoots(ctx, [plate, body, trim]) {
  for (const [ox, flip] of [[36, 1], [76, 1]]) {
    ctx.save();
    ctx.translate(ox, 0);
    ctx.scale(flip, 1);
    // the boot
    ctx.beginPath();
    ctx.moveTo(0, 30); ctx.lineTo(24, 30); ctx.lineTo(26, 82); ctx.lineTo(40, 88); ctx.lineTo(40, 104);
    ctx.lineTo(-4, 104); ctx.lineTo(-2, 30); ctx.closePath();
    paint(ctx, body, [-4, 30, 40, 104]);
    // shin plate and toe cap
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(2, 38, 20, 34, 4) : ctx.rect(2, 38, 20, 34);
    paint(ctx, plate, [2, 38, 22, 72], 3.5);
    ctx.beginPath();
    ctx.moveTo(22, 84); ctx.lineTo(40, 88); ctx.lineTo(40, 100); ctx.lineTo(20, 100); ctx.closePath();
    paint(ctx, plate, [20, 84, 40, 100], 3.5);
    // cuff and sole
    ctx.beginPath(); ctx.rect(-4, 24, 30, 9);
    paint(ctx, trim, [-4, 24, 26, 33], 3.5);
    ctx.beginPath(); ctx.rect(-5, 100, 46, 7);
    paint(ctx, trim, [-5, 100, 41, 107], 3.5);
    ctx.restore();
  }
}

/* ---------------------------------- items ---------------------------------- */

/** Any item in the bag. */
export function itemIcon(item) {
  if (item.kind === 'pickaxe') return cached('pick:' + item.type, (ctx) => drawPickaxe(ctx, item.type));
  const parts = partsOf(item.mix);
  return recipeIcon(item.type, parts);
}

/** What a recipe would look like with these parts; neutral grey with none. */
export function recipeIcon(type, parts = null) {
  const p = parts || ['iron', 'iron', 'iron'];
  return cached(`${type}:${p.join(',')}`, (ctx) => {
    if (type === 'dagger' || type === 'sword' || type === 'broadsword') drawWeapon(ctx, type, p);
    else if (type === 'helmet') drawHelmet(ctx, p);
    else if (type === 'chestplate') drawChest(ctx, p);
    else if (type === 'leggings') drawLegs(ctx, p);
    else if (type === 'boots') drawBoots(ctx, p);
  });
}

/** Grey outlines for the empty equip slots. */
export function ghostIcon(slot) {
  return cached('ghost:' + slot, (ctx) => {
    const P = ['stone', 'stone', 'stone'];
    if (slot === 'pickaxe') drawPickaxe(ctx, 'wood');
    else if (slot === 'weapon') drawWeapon(ctx, 'sword', P);
    else ({ helmet: drawHelmet, chest: drawChest, legs: drawLegs, boots: drawBoots })[slot](ctx, P);
    // flattened to a silhouette
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, S, S);
  });
}

/** Rob, for the talking box. */
export function robPortrait() {
  return cached('rob', (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#3a2a1c'); g.addColorStop(1, '#1c130c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    // shoulders
    ctx.beginPath(); ctx.moveTo(14, 128); ctx.quadraticCurveTo(20, 96, 64, 94); ctx.quadraticCurveTo(108, 96, 114, 128); ctx.closePath();
    plainFill(ctx, '#3f5a7a');
    // face
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(34, 34, 60, 62, 10) : ctx.rect(34, 34, 60, 62);
    plainFill(ctx, '#e8b48c');
    // beard
    ctx.beginPath(); ctx.moveTo(32, 66); ctx.quadraticCurveTo(64, 74, 96, 66); ctx.lineTo(92, 92);
    ctx.quadraticCurveTo(64, 116, 36, 92); ctx.closePath();
    plainFill(ctx, '#a5582a');
    ctx.fillStyle = '#8a4520';
    ctx.fillRect(46, 68, 36, 6);
    // eyes
    ctx.fillStyle = '#fff'; ctx.fillRect(44, 54, 12, 8); ctx.fillRect(72, 54, 12, 8);
    ctx.fillStyle = '#3a6b8f'; ctx.fillRect(48, 55, 6, 7); ctx.fillRect(76, 55, 6, 7);
    ctx.fillStyle = '#6b4a2a'; ctx.fillRect(42, 48, 16, 4); ctx.fillRect(70, 48, 16, 4);
    // the hard hat, lamp lit
    ctx.beginPath(); ctx.moveTo(26, 40); ctx.quadraticCurveTo(64, 2, 102, 40); ctx.closePath();
    plainFill(ctx, '#e3b23c');
    ctx.beginPath(); ctx.rect(22, 38, 84, 8);
    plainFill(ctx, '#c9971f', 3);
    ctx.beginPath(); ctx.arc(64, 26, 8, 0, Math.PI * 2);
    plainFill(ctx, '#fff6c8', 3);
  });
}

/** The colour of an item's rarity, for borders. */
export function rarityClass(r) { return 'r-' + r; }

export function oreName(id) { return ORES[id].name; }
export function pickaxeName(type) { return PICKAXES[type].name; }
