/* =============================================================================
   MINECRAFT - how everything it adds is drawn.

     Steve             all boxes: a square head with his face on the side he
                       is looking, a cyan shirt, blue trousers, a diamond
                       sword or a bow in his hand
     a wither skeleton tall, thin, nearly black bones, a skull, a stone sword
     the Wither        three skulls on a bar of bone, a spine and ribs, a tail;
                       glowing white, shaking, or wrapped in blue armour, as
                       it is spawning, dying or past its half
     blocks and items  a crafting table, soul sand, a wither skull, a nether
                       star, the totem the three of them make
     icons             for the spawn menu and the MODS screen

   Bodies are drawn along the stickman's own joints (game/skeleton.js), so
   they bend and fall like everyone else; drawInjuries puts the damage on.
   ========================================================================== */
import { drawInjuries, goneAt } from '../../game/draw.js';
import { solve, makeJoints, P } from '../../game/skeleton.js';
import { clamp, lerp, TAU } from '../../core/util.js';
import {
  sprite, textureCanvas, blit, blitAt, C, SKULL, WITHER_HEAD, STEVE_HEAD, GOLDEN_APPLE, SOUL_SAND, CRAFTING_FRONT,
} from './pixels.js';

const BLOCK = 0.78;

/* ------------------------------ boxes on bones ------------------------------ */

/** A box from a to b, w thick, outlined (blocky limbs). */
function box(ctx, a, b, w, color, outline = 'rgba(0, 0, 0, 0.55)') {
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = w + 0.03; ctx.stroke(); }
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
}

const at = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const dirOf = (a, b) => { const d = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / d, y: (b.y - a.y) / d }; };

/* ---------------------------------- Steve ----------------------------------- */

/** A leg: trousers to the ankle, a grey shoe. */
function steveLeg(ctx, j, side, s, far, cut) {
  const hip = j.hip, knee = j['knee' + side], foot = j['foot' + side], toe = j['toe' + side];
  const legs = far ? C.pantsDark : C.pants;
  const w = 0.17 * s;
  const gone = (b, t) => goneAt(cut, b, t);
  const thigh = side === 'A' ? 7 : 10, shin = side === 'A' ? 8 : 11;
  if (!gone(thigh, 0.5)) box(ctx, hip, knee, w, legs);
  if (!gone(shin, 0.5)) {
    box(ctx, knee, at(knee, foot, 0.8), w, legs);
    box(ctx, at(knee, foot, 0.8), foot, w, far ? '#3a3a3a' : C.shoe);
    box(ctx, foot, at(foot, toe, 0.7), w * 0.8, far ? '#3a3a3a' : C.shoe);
  }
}

/** An arm: a short cyan sleeve, then skin. */
function steveArm(ctx, j, side, s, far, cut) {
  const sh = j.shoulder, el = j['elbow' + side], hand = j['hand' + side];
  const w = 0.15 * s;
  const up = side === 'A' ? 3 : 5, fore = side === 'A' ? 4 : 6;
  const skin = far ? C.skinDark : C.skin, shirt = far ? C.shirtDark : C.shirt;
  if (!goneAt(cut, up, 0.5)) {
    box(ctx, sh, at(sh, el, 0.4), w, shirt);
    box(ctx, at(sh, el, 0.4), el, w, skin);
  }
  if (!goneAt(cut, fore, 0.5)) box(ctx, el, hand, w, skin);
}

/** A square head turned with the neck, face on the side they look to. */
function squareHead(ctx, j, o, size, def, hurtFlash = 0) {
  const f = o.facing || 1;
  ctx.save();
  ctx.translate(j.head.x, j.head.y);
  ctx.rotate(-(j.headAngle || 0) * f);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(-size / 2 - 0.015, -size / 2 - 0.015, size + 0.03, size + 0.03);
  blit(ctx, sprite(def), -size / 2, -size / 2, size, size, f < 0);
  if (hurtFlash > 0) {
    ctx.globalAlpha = hurtFlash;
    ctx.fillStyle = '#ff2a2a';
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** Red, for a moment, when hit - the way everything in that game flashes. */
const hurtFlash = (man) => (man && man.sandbox && !man.dead ? clamp(1 - (man.sandbox.time - (man.hurtT ?? -99)) / 0.25, 0, 1) * 0.55 : 0);

export const steveSkin = {
  full(ctx, j, o) {
    const s = o.scale || 1, man = o.man || {}, cut = o.cut || {};
    const flash = hurtFlash(man);
    // the far side, a shade darker; the body; the near side; the head
    steveArm(ctx, j, 'B', s, true, cut);
    steveLeg(ctx, j, 'B', s, true, cut);
    box(ctx, j.hip, j.neck, 0.25 * s, C.shirt);
    steveLeg(ctx, j, 'A', s, false, cut);
    squareHead(ctx, j, o, 0.4 * s, STEVE_HEAD, flash);
    drawSteveHeld(ctx, j, s, o.facing || 1, man, cut);
    steveArm(ctx, j, 'A', s, false, cut);
    drawInjuries(ctx, j, o, 0.15 * s);
    if (flash > 0) {
      ctx.globalAlpha = flash * 0.6;
      box(ctx, j.hip, j.neck, 0.25 * s, '#ff2a2a', null);
      ctx.globalAlpha = 1;
    }
  },
};

/** Whatever Steve has in his hand: his sword, his bow (drawn back as far as it is), or an apple on its way to his mouth. */
function drawSteveHeld(ctx, j, s, f, man, cut) {
  const mc = man.mc;
  if (!mc || cut.armA) return;
  if (mc.eating) { blitAt(ctx, sprite(GOLDEN_APPLE), j.handA.x, j.handA.y + 0.04, 0.2 * s, 0.2 * s, 0, f < 0); return; }
  if (mc.form === 'bow') drawBow(ctx, j.handA, dirOf(j.elbowA, j.handA), s, mc.drawing ? mc.draw : 0, j.handB);
  else drawSword(ctx, j.elbowA, j.handA, s, 'diamond');
}

/** A sword in a hand, along the forearm: a pixel blade with a dark edge, a guard, a wooden grip. */
export function drawSword(ctx, elbow, hand, s, kind = 'diamond', len = 0.78) {
  const u = dirOf(elbow, hand);
  const light = kind === 'diamond' ? C.diamond : C.stone, mid = kind === 'diamond' ? C.diamondMid : '#767676';
  const dark = kind === 'diamond' ? C.diamondDark : C.stoneDark;
  const p = (k) => ({ x: hand.x + u.x * k * s, y: hand.y + u.y * k * s });
  ctx.lineCap = 'butt';
  // grip
  ctx.strokeStyle = C.stickDark; ctx.lineWidth = 0.06 * s;
  ctx.beginPath(); ctx.moveTo(p(-0.08).x, p(-0.08).y); ctx.lineTo(p(0.05).x, p(0.05).y); ctx.stroke();
  // guard
  const n = { x: -u.y, y: u.x };
  const g = p(0.07);
  ctx.strokeStyle = kind === 'diamond' ? '#0f4f57' : '#3a3a3a'; ctx.lineWidth = 0.045 * s;
  ctx.beginPath(); ctx.moveTo(g.x - n.x * 0.09 * s, g.y - n.y * 0.09 * s); ctx.lineTo(g.x + n.x * 0.09 * s, g.y + n.y * 0.09 * s); ctx.stroke();
  // blade: dark edge, then the face, then a light line down it
  const a = p(0.09), b = p(len);
  ctx.strokeStyle = dark; ctx.lineWidth = 0.085 * s;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.strokeStyle = mid; ctx.lineWidth = 0.055 * s;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(p(len - 0.03).x, p(len - 0.03).y); ctx.stroke();
  ctx.strokeStyle = light; ctx.lineWidth = 0.02 * s;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(p(len - 0.06).x, p(len - 0.06).y); ctx.stroke();
  // the point
  const tip = p(len + 0.06);
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(b.x - n.x * 0.042 * s, b.y - n.y * 0.042 * s); ctx.lineTo(tip.x, tip.y); ctx.lineTo(b.x + n.x * 0.042 * s, b.y + n.y * 0.042 * s);
  ctx.closePath(); ctx.fill();
}

/**
 * A bow held out at hand, along u, drawn back by `draw` (0..1): the limbs
 * bend, the string comes back to the other hand, an arrow on it.
 */
export function drawBow(ctx, hand, u, s, draw = 0, pull = null) {
  const n = { x: -u.y, y: u.x };
  const L = 0.42 * s, bend = (0.12 + draw * 0.1) * s;
  const top = { x: hand.x + n.x * L - u.x * bend, y: hand.y + n.y * L - u.y * bend };
  const bot = { x: hand.x - n.x * L - u.x * bend, y: hand.y - n.y * L - u.y * bend };
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.lineWidth = 0.07 * s;
  ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.quadraticCurveTo(hand.x + u.x * 0.16 * s, hand.y + u.y * 0.16 * s, bot.x, bot.y); ctx.stroke();
  ctx.strokeStyle = '#8a5a2b';
  ctx.lineWidth = 0.045 * s;
  ctx.stroke();
  // the string, back to the drawing hand when there is one
  const back = draw > 0.05 && pull ? pull : { x: hand.x - u.x * bend * 1.1, y: hand.y - u.y * bend * 1.1 };
  ctx.strokeStyle = '#e6e6e6';
  ctx.lineWidth = 0.012 * s;
  ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(back.x, back.y); ctx.lineTo(bot.x, bot.y); ctx.stroke();
  if (draw > 0.05 && pull) {
    // an arrow nocked on it
    ctx.strokeStyle = '#5a3a1a';
    ctx.lineWidth = 0.022 * s;
    const tip = { x: hand.x + u.x * 0.18 * s, y: hand.y + u.y * 0.18 * s };
    ctx.beginPath(); ctx.moveTo(back.x, back.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    ctx.fillStyle = '#9a9a9a';
    ctx.beginPath();
    ctx.moveTo(tip.x + u.x * 0.07 * s, tip.y + u.y * 0.07 * s);
    ctx.lineTo(tip.x + n.x * 0.03 * s, tip.y + n.y * 0.03 * s);
    ctx.lineTo(tip.x - n.x * 0.03 * s, tip.y - n.y * 0.03 * s);
    ctx.closePath(); ctx.fill();
  }
}

/* ------------------------------ wither skeleton ------------------------------ */

/** Bones as bones: thin, nearly black, knobbly at the joints; ribs on the spine; a skull; a stone sword. */
export const skeletonSkin = {
  full(ctx, j, o) {
    const s = o.scale || 1, man = o.man || {}, cut = o.cut || {}, f = o.facing || 1;
    const flash = hurtFlash(man);
    const dead = !!man.dead;
    const bone = dead ? '#2a2a2a' : C.bone, far = C.boneDark;
    const w = 0.055 * s;
    const line = (a, b, c, ww = w) => { box(ctx, a, b, ww, c, 'rgba(0, 0, 0, 0.6)'); };
    const limb = (chain, b1, b2, c) => {
      if (!goneAt(cut, b1, 0.5)) line(j[chain[0]], j[chain[1]], c);
      if (!goneAt(cut, b2, 0.5)) line(j[chain[1]], j[chain[2]], c);
    };
    limb(['shoulder', 'elbowB', 'handB'], 5, 6, far);
    limb(['hip', 'kneeB', 'footB'], 10, 11, far);
    // spine, ribs, pelvis
    line(j.hip, j.neck, bone, w * 1.1);
    const u = dirOf(j.hip, j.neck), n = { x: -u.y, y: u.x };
    for (let i = 0; i < 3; i++) {
      const c = at(j.chest, j.neck, 0.15 + i * 0.28);
      const half = (0.13 - i * 0.012) * s;
      line({ x: c.x - n.x * half, y: c.y - n.y * half }, { x: c.x + n.x * half, y: c.y + n.y * half }, i === 1 ? C.boneLight : bone, w * 0.75);
    }
    line({ x: j.hip.x - n.x * 0.09 * s, y: j.hip.y - n.y * 0.09 * s }, { x: j.hip.x + n.x * 0.09 * s, y: j.hip.y + n.y * 0.09 * s }, bone, w);
    limb(['hip', 'kneeA', 'footA'], 7, 8, bone);
    squareHead(ctx, j, o, 0.36 * s, SKULL, flash);
    if (!cut.armA && man.innate) drawSword(ctx, j.elbowA, j.handA, s, 'stone', 0.7);
    limb(['shoulder', 'elbowA', 'handA'], 3, 4, bone);
    // the joints, as knobs
    ctx.fillStyle = C.boneLight;
    for (const k of ['elbowA', 'kneeA']) ctx.fillRect(j[k].x - w * 0.6, j[k].y - w * 0.6, w * 1.2, w * 1.2);
    drawInjuries(ctx, j, o, w);
    void f;
  },
};

/* --------------------------------- the Wither -------------------------------- */

/**
 * The Wither, from its joints: head is the middle skull, handA and handB the
 * two either side, neck the bar of bone they sit on, chest the ribs, hip the
 * bottom of the spine, footA the end of the tail. (wither.js puts them there.)
 */
export const witherSkin = {
  full(ctx, j, o) {
    const man = o.man || {}, mc = man.mc || {};
    const t = man.sandbox ? man.sandbox.time : 0;
    // shaking: spawning, changing, dying
    const shake = mc.shake || 0;
    const sx = shake ? (Math.sin(t * 71) + Math.sin(t * 43)) * 0.035 * shake : 0;
    const sy = shake ? Math.cos(t * 67) * 0.03 * shake : 0;
    ctx.save();
    ctx.translate(sx, sy);
    drawWitherBody(ctx, j, man, mc, t);
    ctx.restore();
  },
};

function drawWitherBody(ctx, j, man, mc, t) {
  const f = man.facing || 1;
  const bar = { a: { x: j.handB.x, y: j.neck.y }, b: { x: j.handA.x, y: j.neck.y } };
  // the tail, the spine, the ribs, the bar - all bone
  const outline = 'rgba(0, 0, 0, 0.7)';
  box(ctx, j.hip, j.kneeA, 0.15, C.witherMid, outline);
  box(ctx, j.kneeA, j.footA, 0.11, C.witherMid, outline);
  box(ctx, j.neck, j.hip, 0.17, C.wither, outline);
  for (let i = 0; i < 3; i++) {
    const y = j.chest.y + 0.18 - i * 0.16, half = 0.31 - i * 0.04;
    box(ctx, { x: j.chest.x - half, y }, { x: j.chest.x + half, y }, 0.07, i === 0 ? C.witherLight : C.witherMid, outline);
  }
  box(ctx, bar.a, bar.b, 0.2, C.wither, outline);
  ctx.fillStyle = C.witherLight;
  ctx.fillRect(bar.a.x, bar.a.y + 0.05, bar.b.x - bar.a.x, 0.04);
  // the heads: the side ones look at their own targets
  const side = mc.headLook || {};
  head(ctx, j.handB, 0.46, side.B ?? f);
  head(ctx, j.handA, 0.46, side.A ?? f);
  head(ctx, j.head, 0.62, f);

  const flash = hurtFlash(man);
  const glow = mc.glow || 0;
  // armour past its half: a blue shell over all of it, with light running across
  if (mc.armored && !man.dead) {
    ctx.save();
    ctx.globalAlpha = 0.28 + 0.1 * Math.sin(t * 5);
    const shell = (x0, y0, x1, y1) => {
      ctx.fillStyle = '#7fc4ff';
      ctx.fillRect(x0 - 0.05, y0 - 0.05, x1 - x0 + 0.1, y1 - y0 + 0.1);
    };
    shell(bar.a.x - 0.23, j.neck.y - 0.14, bar.b.x + 0.23, j.head.y + 0.36);
    shell(j.chest.x - 0.33, j.hip.y, j.chest.x + 0.33, j.neck.y);
    shell(Math.min(j.hip.x, j.footA.x) - 0.1, j.footA.y - 0.05, Math.max(j.hip.x, j.footA.x) + 0.1, j.hip.y);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#d6ecff';
    const k = (t * 0.8) % 1;
    for (let i = 0; i < 3; i++) {
      const y = lerp(j.footA.y, j.head.y + 0.3, (k + i / 3) % 1);
      ctx.fillRect(bar.a.x - 0.25, y, bar.b.x - bar.a.x + 0.5, 0.05);
    }
    ctx.restore();
  }
  // a glow over the whole of it: white when it is coming or going, blue as it is born
  if (glow > 0 || flash > 0) {
    ctx.save();
    const col = mc.glowColor || '#ffffff';
    const paint = (a, c) => {
      ctx.globalAlpha = a;
      ctx.fillStyle = c;
      for (const [p, size] of [[j.head, 0.62], [j.handA, 0.46], [j.handB, 0.46]]) ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      ctx.fillRect(bar.a.x, bar.a.y - 0.1, bar.b.x - bar.a.x, 0.2);
      ctx.fillRect(j.chest.x - 0.31, j.hip.y, 0.62, j.neck.y - j.hip.y);
    };
    if (glow > 0) paint(glow * 0.8, col);
    if (flash > 0) paint(flash * 0.7, '#ff2a2a');
    ctx.restore();
  }
}

function head(ctx, p, size, f) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(p.x - size / 2 - 0.02, p.y - size / 2 - 0.02, size + 0.04, size + 0.04);
  blit(ctx, sprite(WITHER_HEAD), p.x - size / 2, p.y - size / 2, size, size, f < 0);
}

/* ---------------------------------- blocks ---------------------------------- */

export function drawCraftingTable(ctx, w, h) { blit(ctx, sprite(CRAFTING_FRONT), -w / 2, -h / 2, w, h); }
export function drawSoulSand(ctx, w, h) { blit(ctx, textureCanvas(SOUL_SAND), -w / 2, -h / 2, w, h); }

/** A wither skull lying about (an item): face on. */
export function drawSkullItem(ctx, x, y, size, a = 0, flip = false) { blitAt(ctx, sprite(SKULL), x, y, size, size, a, flip); }

/** A nether star: four points, white, faintly gold and blue, with a halo that breathes. */
export function drawNetherStar(ctx, x, y, size, a = 0, t = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);
  for (let i = 3; i >= 1; i--) {
    ctx.globalAlpha = (0.08 + pulse * 0.05) * i;
    ctx.fillStyle = i === 1 ? '#fffbe6' : '#fff2b0';
    const r = size * (0.45 + i * 0.22);
    ctx.fillRect(-r / 2, -r / 2, r, r);
  }
  ctx.globalAlpha = 1;
  const star = (r, inner, col) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * TAU, rr = i % 2 ? inner : r;
      ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
    }
    ctx.closePath();
    ctx.fill();
  };
  star(size * 0.62, size * 0.2, '#c7d9e8');
  star(size * 0.52, size * 0.15, '#fffdf0');
  star(size * 0.24, size * 0.09, '#fff3a6');
  ctx.restore();
}

/** The totem: four soul sand in a T, three wither skulls along the top. `glow` 0..1 paints it white. */
export function drawTotem(ctx, x, y, glow = 0, skulls = 3) {
  const b = BLOCK, sk = b * 0.5;
  const soul = textureCanvas(SOUL_SAND), skull = sprite(SKULL);
  blit(ctx, soul, x - b / 2, y, b, b);
  for (let i = -1; i <= 1; i++) blit(ctx, soul, x + i * b - b / 2, y + b, b, b);
  for (let i = -1; i <= 1 && i < skulls - 1; i++) blit(ctx, skull, x + i * b - sk / 2, y + b * 2, sk, sk);
  if (glow > 0) {
    ctx.globalAlpha = clamp(glow, 0, 1) * 0.85;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - b / 2, y, b, b);
    ctx.fillRect(x - b * 1.5, y + b, b * 3, b);
    for (let i = -1; i <= 1; i++) ctx.fillRect(x + i * b - sk / 2, y + b * 2, sk, sk);
    ctx.globalAlpha = 1;
  }
}

export const TOTEM_W = BLOCK * 3;
export const TOTEM_H = BLOCK * 2.5;
export { BLOCK };

/* ----------------------------------- icons ----------------------------------- */

const steveIconPose = () => solve(P({ t: 2, aA: [40, 30], aB: [-10, 10] }), 1, makeJoints());

/** The cards in the spawn menu: kind is steve, table, soul, skull or totem. */
export function drawIcon(ctx, w, h, card, kind) {
  const ground = card ? h * 0.84 : h;
  if (kind === 'steve') {
    const j = steveIconPose();
    const s = card ? (h * 0.7) / 1.95 : h * 0.95;
    ctx.setTransform(s, 0, 0, -s, w / 2, card ? ground : h + 0.86 * s);
    const fake = { mc: { form: 'sword', apples: 3 }, sandbox: null, hurtT: -99 };
    steveSkin.full(ctx, j, { scale: 1, facing: 1, man: fake, cut: {} });
    return;
  }
  const size = card ? h * 0.5 : h * 0.8;
  const s = size / BLOCK;
  ctx.setTransform(s, 0, 0, -s, w / 2, card ? ground - size / 2 : h / 2);
  if (kind === 'table') drawCraftingTable(ctx, BLOCK, BLOCK);
  else if (kind === 'soul') drawSoulSand(ctx, BLOCK, BLOCK);
  else if (kind === 'skull') {
    ctx.setTransform(s, 0, 0, -s, w / 2, card ? ground - size * 0.32 : h / 2);
    drawSkullItem(ctx, 0, 0, BLOCK * 0.62);
  } else if (kind === 'totem') {
    const k = card ? (h * 0.72) / TOTEM_H : (h * 0.9) / TOTEM_H;
    ctx.setTransform(k, 0, 0, -k, w / 2, card ? ground : h);
    drawTotem(ctx, 0, 0);
  }
}

/** The mod's picture on the MODS screen: Steve and the Wither, face to face over a strip of grass. */
export function drawModIcon(ctx, w, h) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#5a7fc4');
  sky.addColorStop(1, '#9cc0f0');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // grass and dirt
  const g = h * 0.78;
  ctx.fillStyle = '#5b8f2e';
  ctx.fillRect(0, g, w, h * 0.06);
  ctx.fillStyle = '#7a5534';
  ctx.fillRect(0, g + h * 0.06, w, h);
  ctx.fillStyle = '#6a4a2c';
  for (let i = 0; i < 9; i++) ctx.fillRect((i * 37) % w, g + h * 0.1 + (i * 13) % (h * 0.1), w * 0.06, h * 0.04);
  ctx.imageSmoothingEnabled = false;
  const steve = sprite(STEVE_HEAD), wh = sprite(WITHER_HEAD);
  if (steve) ctx.drawImage(steve, w * 0.08, h * 0.3, w * 0.36, w * 0.36);
  if (wh) {
    ctx.save();
    ctx.translate(w * 0.92, h * 0.22);
    ctx.scale(-1, 1);
    ctx.drawImage(wh, 0, 0, w * 0.4, w * 0.4);
    ctx.restore();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
