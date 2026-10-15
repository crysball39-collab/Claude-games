/* =============================================================================
   Draws the sandbox: the grey sky, the black floor, the crates, the brass
   knuckles, everyone in it, the blood and the dust.

   Then, over the top and at the same size whatever the zoom: names, speech
   and thought bubbles, health bars, and the little symbols that say how
   somebody feels - an anger mark, a sweat drop, a heart, stars going round
   a dizzy head.
   ========================================================================== */
import { drawStickman, drawCrateShape, drawKnuckleShape, INK, BLOOD, BLOOD_DARK } from './draw.js';
import { DIM } from './skeleton.js';
import { clamp, TAU } from '../core/util.js';

export const SKY = '#9b9b9b';
export const FLOOR = '#000000';
const OUTSIDE = '#7d7d7d';
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export class Renderer {
  constructor(canvas, sandbox, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sb = sandbox;
    this.cam = camera;
    this.opts = { names: true, bubbles: true, thoughts: true };
  }

  resize(w, h, dpr) {
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  /**
   * @param {object} ui  { selected, ghost: { kind, x, y }, hand: {x, y, active},
   *                     erasing }
   */
  draw(ui = {}) {
    const ctx = this.ctx, cam = this.cam, sb = this.sb;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = SKY;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    cam.apply(ctx);
    const v = cam.view(1);
    ctx.fillStyle = OUTSIDE;
    if (v.minX < sb.left) ctx.fillRect(v.minX, 0, sb.left - v.minX, v.maxY);
    if (v.maxX > sb.right) ctx.fillRect(sb.right, 0, v.maxX - sb.right, v.maxY);
    ctx.fillStyle = FLOOR;
    ctx.fillRect(v.minX, Math.min(v.minY, -1), v.maxX - v.minX, -Math.min(v.minY, -1));

    this.drawSplats(ctx, v);
    for (const c of sb.crates) if (!c.carriedBy) this.drawCrate(ctx, c);
    for (const k of sb.knuckles) if (!k.wornBy) this.drawKnuckles(ctx, k);

    const order = [...sb.people].sort((a, b) => this.layer(a, ui) - this.layer(b, ui));
    for (const p of order) {
      if (p.box.maxX < v.minX || p.box.minX > v.maxX) continue;
      this.drawPerson(ctx, p);
    }
    for (const c of sb.crates) if (c.carriedBy) this.drawCrate(ctx, c);
    this.drawFx(ctx);
    if (ui.ghost) this.drawGhost(ctx, ui.ghost);

    // screen space from here: text and symbols stay the same size at any zoom
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    const bubbles = [];
    for (const p of order) {
      if (p.box.maxX < v.minX || p.box.minX > v.maxX) continue;
      this.drawOverlay(ctx, p, ui, bubbles);
    }
    this.placeBubbles(ctx, bubbles);
    if (ui.hand && ui.hand.active) this.drawHand(ctx, ui.hand);
  }

  layer(p, ui) {
    if (p === ui.selected) return 4;
    if (p.dead) return 0;
    if (p.lying) return 1;
    if (p.state === 'held') return 3;
    return 2;
  }

  drawSplats(ctx, v) {
    for (const s of this.sb.fx.splats) {
      if (s.x + s.w < v.minX || s.x - s.w > v.maxX) continue;
      ctx.fillStyle = s.dark ? BLOOD_DARK : BLOOD;
      ctx.beginPath();
      ctx.ellipse(s.x, 0.004, s.w, s.h, 0, 0, TAU);
      ctx.fill();
    }
  }

  drawCrate(ctx, c) {
    const b = c.body;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(b.rot);
    drawCrateShape(ctx, b.w, b.h, c.stains);
    ctx.restore();
  }

  drawKnuckles(ctx, k) {
    const b = k.body;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(b.rot);
    drawKnuckleShape(ctx, b.w, b.h, k.blood);
    ctx.restore();
  }

  drawPerson(ctx, p) {
    const h = p.health;
    const broken = {};
    for (const k of ['armA', 'armB', 'legA', 'legB']) if (h.parts[k].broken) broken[k] = true;
    drawStickman(ctx, p.wj, {
      scale: p.scale,
      facing: p.facing,
      hair: p.hair,
      face: p.face,
      weapon: p.weapon ? 'A' : null,
      weaponBlood: p.weapon ? p.weapon.blood : 0,
      wounds: p.wounds,
      headMarks: p.headMarks,
      broken,
      pale: p.dead ? 0.7 : clamp((0.86 - h.blood) / 0.42, 0, 1),
      bruise: h.parts.head.bruise,
      ink: p.dead ? '#1b1b1b' : INK,
    });
  }

  drawFx(ctx) {
    const fx = this.sb.fx;
    for (const d of fx.drops) {
      ctx.fillStyle = BLOOD;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, TAU);
      ctx.fill();
    }
    for (const p of fx.puffs) {
      const k = p.age / p.life;
      ctx.fillStyle = `rgba(70, 70, 70, ${0.35 * (1 - k)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1 + k * 1.5), 0, TAU);
      ctx.fill();
    }
    ctx.lineCap = 'round';
    for (const b of fx.bursts) {
      const k = b.age / b.life;
      ctx.strokeStyle = `rgba(255, 255, 255, ${1 - k})`;
      ctx.lineWidth = 0.02;
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = b.a + (i / 7) * TAU;
        const r0 = b.r * (0.3 + k * 0.5), r1 = b.r * (0.75 + k * 0.6) * (i % 2 ? 0.7 : 1);
        ctx.moveTo(b.x + Math.cos(a) * r0, b.y + Math.sin(a) * r0);
        ctx.lineTo(b.x + Math.cos(a) * r1, b.y + Math.sin(a) * r1);
      }
      ctx.stroke();
    }
  }

  drawGhost(ctx, g) {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.translate(g.x, g.y);
    if (g.kind === 'crate') drawCrateShape(ctx, 0.78, 0.78, null);
    else if (g.kind === 'knuckles') drawKnuckleShape(ctx, 0.26, 0.11, 0);
    else if (g.kind === 'stickman') {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.07;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-0.1, 0.03); ctx.lineTo(0, 0.85); ctx.lineTo(0.1, 0.03);
      ctx.moveTo(0, 0.85); ctx.lineTo(0, 1.35);
      ctx.moveTo(-0.12, 0.85); ctx.lineTo(0, 1.3); ctx.lineTo(0.12, 0.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 1.55, 0.155, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawHand(ctx, hand) {
    const s = this.cam.toScreen(hand.x, hand.y);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 9, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fill();
  }

  /* ------------------------------ over the heads ------------------------------ */

  drawOverlay(ctx, p, ui, bubbles) {
    const cam = this.cam;
    const r = DIM.headR * p.scale;
    const top = cam.toScreen(p.wj.head.x, Math.max(p.wj.head.y + r, p.box.maxY));
    const headS = cam.toScreen(p.wj.head.x, p.wj.head.y);
    const rPx = r * cam.ppm;
    let y = top.y - 8;
    const sel = p === ui.selected;

    if (sel) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(top.x - 7, y - 10); ctx.lineTo(top.x + 7, y - 10); ctx.lineTo(top.x, y - 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      y -= 12;
    }

    if (this.opts.names || sel) {
      ctx.font = `${sel ? 700 : 600} ${sel ? 13 : 11}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = p.dead ? 'rgba(20, 20, 20, 0.55)' : 'rgba(10, 10, 10, 0.85)';
      ctx.fillText(p.dead ? p.name + ' †' : p.name, top.x, y);
      y -= sel ? 15 : 13;
    }

    const hurt = this.sb.time - p.hurtT < 4;
    if (!p.dead && (hurt || sel)) {
      const hp = p.health.overall;
      const w = 34;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(top.x - w / 2 - 1, y - 5, w + 2, 6);
      ctx.fillStyle = hp > 0.6 ? '#5fd35f' : hp > 0.3 ? '#f0c040' : '#e04040';
      ctx.fillRect(top.x - w / 2, y - 4, w * hp, 4);
      y -= 9;
    }

    // seeing stars, or out cold
    const t = this.sb.time;
    if (p.alive && p.conscious && p.health.dizzy > 0.4) {
      for (let i = 0; i < 3; i++) {
        const a = t * 4 + (i * TAU) / 3;
        drawStar(ctx, headS.x + Math.cos(a) * rPx * 1.4, headS.y - rPx * 1.1 + Math.sin(a) * rPx * 0.45, 4);
      }
    }
    if (p.alive && !p.conscious) {
      ctx.font = `700 13px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.6 + i / 3) % 1;
        ctx.globalAlpha = 1 - k;
        ctx.fillText('z', headS.x + rPx + k * 16, headS.y - rPx - k * 24);
      }
      ctx.globalAlpha = 1;
    }

    if (p.emote && p.alive) {
      const e = p.emote;
      const pop = Math.min(1, e.t / 0.12);
      drawIcon(ctx, e.kind, headS.x + rPx * 1.35 * p.facing, headS.y - rPx * 1.2, 11 * pop);
    }

    if (this.opts.thoughts && p.thought && p.alive && !(p.bubble && this.opts.bubbles)) {
      const th = p.thought;
      const pop = Math.min(1, th.t / 0.15);
      const fade = Math.min(1, (th.dur - th.t) / 0.3);
      ctx.globalAlpha = clamp(fade, 0, 1);
      drawThought(ctx, top.x + 18 * p.facing, y - 22, 18 * pop, th.icon, headS, rPx);
      ctx.globalAlpha = 1;
    }

    if (this.opts.bubbles && p.bubble) {
      const b = p.bubble;
      bubbles.push({ x: top.x, y: y - 4, text: b.text, loud: b.loud, alpha: clamp((b.dur - b.t) / 0.25, 0, 1), sel });
    }
  }

  /**
   * Speech bubbles, stacked so none covers another: the lowest goes where it
   * wants, and anything that would overlap it moves up out of the way, its
   * tail still pointing at whoever is talking.
   */
  placeBubbles(ctx, list) {
    const placed = [];
    const W = this.cam.w;
    list.sort((a, b) => b.y - a.y || (a.sel ? -1 : 1));
    for (const b of list) {
      const m = measureBubble(ctx, b.text, b.loud);
      let x = clamp(b.x - m.w / 2, 4, W - m.w - 4);
      let bottom = b.y - 7;
      for (let k = 0; k < 8; k++) {
        const hit = placed.find((r) => x < r.x + r.w + 3 && x + m.w + 3 > r.x && bottom - m.h < r.y + r.h + 3 && bottom + 3 > r.y);
        if (!hit) break;
        bottom = hit.y - 4;
      }
      placed.push({ x, y: bottom - m.h, w: m.w, h: m.h });
      ctx.globalAlpha = b.alpha;
      drawBubbleAt(ctx, m, x, bottom - m.h, b.x, b.y, b.loud);
      ctx.globalAlpha = 1;
    }
  }
}

/* -------------------------------- bubbles and icons ---------------------------- */

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx, text, max) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > max && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function bubbleFont(loud) { return `${loud ? 800 : 600} ${loud ? 13 : 12}px ${FONT}`; }

function measureBubble(ctx, text, loud) {
  ctx.font = bubbleFont(loud);
  const lines = wrap(ctx, loud ? text.toUpperCase() : text, 150);
  const lh = loud ? 15 : 14;
  let w = 0;
  for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
  return { lines, lh, w: w + 14, h: lines.length * lh + 9 };
}

/** A measured speech bubble with its top left at (bx, by), its tail ending at (tx, ty). */
function drawBubbleAt(ctx, m, bx, by, tx, ty, loud) {
  const { w, h } = m;
  const base = clamp(tx, bx + 10, bx + w - 10);
  ctx.fillStyle = loud ? '#fff6d6' : '#ffffff';
  ctx.strokeStyle = '#111';
  ctx.lineWidth = loud ? 2 : 1.5;
  roundRect(ctx, bx, by, w, h, 7);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(base - 5, by + h - 0.5);
  ctx.lineTo(tx, ty);
  ctx.lineTo(base + 4, by + h - 0.5);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(base - 5, by + h);
  ctx.lineTo(tx, ty);
  ctx.lineTo(base + 4, by + h);
  ctx.stroke();
  ctx.font = bubbleFont(loud);
  ctx.fillStyle = '#111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  m.lines.forEach((l, i) => ctx.fillText(l, bx + w / 2, by + 5 + i * m.lh));
}

/** A thought cloud with an icon in it, trailing little circles back to the head. */
function drawThought(ctx, x, y, s, icon, head, rPx) {
  if (s < 2) return;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1.3;
  const puffs = [[0, 0, 1], [-0.75, 0.15, 0.7], [0.75, 0.15, 0.7], [-0.4, -0.55, 0.65], [0.42, -0.5, 0.65], [0, 0.55, 0.6]];
  ctx.beginPath();
  for (const [dx, dy, r] of puffs) {
    ctx.moveTo(x + dx * s + r * s, y + dy * s);
    ctx.arc(x + dx * s, y + dy * s, r * s, 0, TAU);
  }
  ctx.stroke();
  ctx.fill();
  for (const [k, r] of [[0.45, 3.2], [0.72, 2.2]]) {
    ctx.beginPath();
    ctx.arc(x + (head.x - x) * k, y + s * 0.5 + (head.y - rPx - y - s * 0.5) * k, r, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  drawIcon(ctx, icon, x, y, s * 0.62);
}

function drawStar(ctx, x, y, r) {
  ctx.fillStyle = '#ffe14d';
  ctx.strokeStyle = '#6b5300';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** Small symbols, drawn in screen space around (x, y) about s pixels across. */
export function drawIcon(ctx, kind, x, y, s) {
  if (s < 1) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const text = (t, color, weight = 800) => {
    ctx.font = `${weight} ${Math.round(s * 1.6)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(t, 0, 0);
    ctx.fillStyle = color;
    ctx.fillText(t, 0, 0);
  };
  switch (kind) {
    case 'heart':
      ctx.fillStyle = '#e8305a';
      ctx.strokeStyle = '#6d0f24';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.75);
      ctx.bezierCurveTo(-s * 1.2, -s * 0.1, -s * 0.55, -s * 0.95, 0, -s * 0.35);
      ctx.bezierCurveTo(s * 0.55, -s * 0.95, s * 1.2, -s * 0.1, 0, s * 0.75);
      ctx.fill();
      ctx.stroke();
      break;
    case 'anger':
      ctx.strokeStyle = '#d4141b';
      ctx.lineWidth = Math.max(1.6, s * 0.2);
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 2);
        ctx.beginPath();
        ctx.arc(s * 0.62, s * 0.62, s * 0.5, Math.PI * 1.05, Math.PI * 1.45);
        ctx.stroke();
        ctx.restore();
      }
      break;
    case 'sweat':
    case 'tear':
      ctx.fillStyle = kind === 'sweat' ? '#7ec8f2' : '#4e9de6';
      ctx.strokeStyle = '#1e5a85';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(s * 0.75, s * 0.1, 0, s * 0.75);
      ctx.quadraticCurveTo(-s * 0.75, s * 0.1, 0, -s);
      ctx.fill();
      ctx.stroke();
      break;
    case 'exclaim': text('!', '#e8202a'); break;
    case 'question': text('?', '#1d4fbf'); break;
    case 'music': text('♪', '#2a2a2a', 700); break;
    case 'zzz': text('z', '#ffffff'); break;
    case 'skull':
      ctx.fillStyle = '#f2f2f2';
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, -s * 0.15, s * 0.7, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(-s * 0.4, s * 0.3, s * 0.8, s * 0.45);
      ctx.strokeRect(-s * 0.4, s * 0.3, s * 0.8, s * 0.45);
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(-s * 0.28, -s * 0.15, s * 0.17, 0, TAU);
      ctx.arc(s * 0.28, -s * 0.15, s * 0.17, 0, TAU);
      ctx.fill();
      break;
    case 'fist':
      ctx.fillStyle = '#f2f2f2';
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 1.4;
      roundRect(ctx, -s * 0.7, -s * 0.55, s * 1.4, s * 1.1, s * 0.3);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      for (let i = 1; i < 4; i++) { ctx.moveTo(-s * 0.7 + i * s * 0.35, -s * 0.55); ctx.lineTo(-s * 0.7 + i * s * 0.35, -s * 0.1); }
      ctx.moveTo(-s * 0.7, s * 0.05); ctx.lineTo(-s * 0.15, s * 0.05);
      ctx.stroke();
      break;
    case 'crate':
      ctx.save();
      ctx.scale(1, -1);
      drawCrateShape(ctx, s * 1.4, s * 1.4, null);
      ctx.restore();
      break;
    case 'knuckles':
      ctx.save();
      ctx.scale(s * 1.4 / 0.26, -s * 1.4 / 0.26);
      drawKnuckleShape(ctx, 0.26, 0.11, 0);
      ctx.restore();
      break;
    case 'cross':
      ctx.fillStyle = '#e02a2a';
      ctx.fillRect(-s * 0.25, -s * 0.75, s * 0.5, s * 1.5);
      ctx.fillRect(-s * 0.75, -s * 0.25, s * 1.5, s * 0.5);
      break;
    case 'eye':
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-s, 0);
      ctx.quadraticCurveTo(0, -s * 0.9, s, 0);
      ctx.quadraticCurveTo(0, s * 0.9, -s, 0);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.32, 0, TAU);
      ctx.fill();
      break;
    case 'chat':
      ctx.fillStyle = '#222';
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(i * s * 0.5, 0, s * 0.17, 0, TAU); ctx.fill(); }
      break;
    case 'run':
      text('»', '#222');
      break;
    case 'idea':
      ctx.fillStyle = '#ffe14d';
      ctx.strokeStyle = '#6b5300';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, -s * 0.2, s * 0.6, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#777';
      ctx.fillRect(-s * 0.28, s * 0.38, s * 0.56, s * 0.35);
      break;
    case 'sparkle':
      drawStar(ctx, 0, 0, s * 0.8);
      break;
    case 'broken':
      ctx.strokeStyle = '#d4141b';
      ctx.lineWidth = Math.max(1.6, s * 0.2);
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, -s * 0.8); ctx.lineTo(s * 0.1, -s * 0.1); ctx.lineTo(-s * 0.2, s * 0.1); ctx.lineTo(s * 0.5, s * 0.8);
      ctx.stroke();
      break;
    default:
      text('…', '#222');
  }
  ctx.restore();
}
