/* =============================================================================
   MINECRAFT - blocks, items, crafting, and the totem that brings the Wither.

     Crafting Table  a block (it stacks, it can be climbed and thrown, like a
                     crate): tap it to see its crafting grid
     Soul Sand       a block, dark brown, full of faces
     Wither Skull    an item: small, it can be picked up and thrown
     Wither Totem    four soul sand in a T with three skulls on top. Crafted
                     from those, at a crafting table, into the spawn menu;
                     placed from there; ACTIVATE, and it rises, glows white,
                     shakes, and goes off - and the Wither is there
     Nether Star     what the Wither leaves when it is beaten

   Crafting takes what is lying by the table: put 4 Soul Sand and 3 Wither
   Skulls within a few metres of it (or drop them on it), tap the table, and
   CRAFT. The totem goes into the spawn menu - a count on its card - and
   comes out of it again when it is placed.
   ========================================================================== */
import { Crate } from '../../game/props.js';
import { Body } from '../../physics/rigid.js';
import { clamp, rand, easeOut, smooth } from '../../core/util.js';
import { sprite, textureCanvas, SKULL, SOUL_SAND } from './pixels.js';
import { MOD, explode, puffs, sparkles } from './effects.js';
import {
  drawCraftingTable, drawSoulSand, drawSkullItem, drawNetherStar, drawTotem, TOTEM_W, TOTEM_H, BLOCK,
} from './look.js';

/** What has been crafted and not placed yet. */
export const inventory = { totems: 0 };

const REACH = 3.2;       // how far from the table its materials can lie
const CHARGE = 3.6;      // a totem, from ACTIVATE to the bang

/* ---------------------------------- blocks ---------------------------------- */

const BLOCKS = {
  table: { name: 'Crafting Table', draw: drawCraftingTable },
  soul: { name: 'Soul Sand', draw: drawSoulSand },
};

/**
 * A block is a crate as far as the world is concerned - it falls, stacks,
 * gets climbed, sat on and thrown - that looks like a block.
 */
export class Block extends Crate {
  constructor(sb, x, y, type) {
    super(sb, x, y, 0);
    this.mod = MOD;
    this.block = type;
    this.name = BLOCKS[type].name;
  }
  drawShape(ctx, w, h) { BLOCKS[this.block].draw(ctx, w, h); }
}

/** A crafting table: a block with a crafting grid to it. */
export class CraftingTable extends Block {
  constructor(sb, x, y) { super(sb, x, y, 'table'); }

  /** What is lying close enough to be used: soul sand blocks and wither skulls, nearest first. */
  materials(sb) {
    const me = this.pos;
    const near = (t) => Math.hypot(t.pos.x - me.x, t.pos.y - me.y);
    const sand = sb.crates.filter((c) => c !== this && !c.removed && !c.carriedBy && c.block === 'soul' && near(c) < REACH).sort((a, b) => near(a) - near(b));
    const skulls = sb.items.filter((i) => !i.removed && i.kind === 'witherSkull' && near(i) < REACH).sort((a, b) => near(a) - near(b));
    return { sand: sand.slice(0, 4), skulls: skulls.slice(0, 3) };
  }

  panel(sb) {
    const m = this.materials(sb);
    const ready = m.sand.length >= 4 && m.skulls.length >= 3;
    return {
      title: 'CRAFTING',
      draw: (ctx, w, h) => drawCraftingGrid(ctx, w, h, m.skulls.length, m.sand.length, ready),
      text: [
        'Wither Totem: 3 Wither Skulls on top of 4 Soul Sand.',
        `By the table now: ${m.sand.length}/4 Soul Sand, ${m.skulls.length}/3 Wither Skulls. Put them within ${REACH.toFixed(0)} m of it, or drop them on it.`,
        inventory.totems ? `Crafted and waiting in the spawn menu: ${inventory.totems}` : '',
      ].filter(Boolean),
      buttons: [{ id: 'craft', label: 'CRAFT', enabled: ready, primary: true }],
    };
  }

  panelPress(id, sb) {
    if (id !== 'craft') return null;
    const m = this.materials(sb);
    if (m.sand.length < 4 || m.skulls.length < 3) return { say: 'Not enough here yet: 4 Soul Sand and 3 Wither Skulls' };
    // they go into the table, and a totem comes out (into the spawn menu)
    for (const t of [...m.sand, ...m.skulls]) {
      puffs(sb, { x: t.pos.x, y: t.pos.y, n: 5, speed: 1, size: 0.12, grow: -0.6, life: 0.5, colors: ['#5c4632', '#3a2a1d', '#bdbdbd'] });
      sb.remove(t);
    }
    inventory.totems++;
    sparkles(sb, this.pos.x, this.pos.y + BLOCK * 0.6, 10, 0.4);
    sb.emit('crafted', { what: 'witherTotem', x: this.pos.x, y: this.pos.y });
    sb.emit('inventory', { mod: MOD });
    return { say: 'Crafted a Wither Totem! It is in the spawn menu now.', close: true };
  }
}

/** The crafting screen of that game, roughly: a grey panel, a 3x3 grid, an arrow, the result. */
function drawCraftingGrid(ctx, w, h, skulls, sand, ready) {
  ctx.fillStyle = '#c6c6c6';
  ctx.fillRect(0, 0, w, h);
  bevel(ctx, 0, 0, w, h, '#ffffff', '#555555', 6);
  ctx.fillStyle = '#404040';
  ctx.font = '700 22px system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText('Crafting', 24, 14);
  const S = 52, G = 6, x0 = 40, y0 = 50;
  const soul = textureCanvas(SOUL_SAND), skull = sprite(SKULL);
  // the shape: skulls along the top, soul sand in a T under them
  const want = [['skull', 'skull', 'skull'], ['soul', 'soul', 'soul'], [null, 'soul', null]];
  let sk = 0, so = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const x = x0 + c * (S + G), y = y0 + r * (S + G);
      slot(ctx, x, y, S);
      const k = want[r][c];
      if (!k) continue;
      const have = k === 'skull' ? sk++ < skulls : so++ < sand;
      const img = k === 'skull' ? skull : soul;
      if (!img) continue;
      ctx.globalAlpha = have ? 1 : 0.22;
      ctx.imageSmoothingEnabled = false;
      const pad = k === 'skull' ? 9 : 5;
      ctx.drawImage(img, x + pad, y + pad, S - pad * 2, S - pad * 2);
      ctx.globalAlpha = 1;
    }
  }
  // the arrow
  const ax = x0 + 3 * (S + G) + 30, ay = y0 + S + G + S / 2;
  ctx.fillStyle = ready ? '#7a7a7a' : '#9a9a9a';
  ctx.fillRect(ax, ay - 7, 52, 14);
  ctx.beginPath(); ctx.moveTo(ax + 52, ay - 18); ctx.lineTo(ax + 76, ay); ctx.lineTo(ax + 52, ay + 18); ctx.closePath(); ctx.fill();
  // the result
  const ox = ax + 100, oy = ay - 40;
  slot(ctx, ox, oy, 80);
  ctx.save();
  ctx.globalAlpha = ready ? 1 : 0.25;
  ctx.translate(ox + 40, oy + 72);
  const k = 66 / TOTEM_W;
  ctx.scale(k, -k);
  drawTotem(ctx, 0, 0);
  ctx.restore();
  if (ready) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 15px system-ui, sans-serif';
    ctx.fillText('1', ox + 64, oy + 60);
  }
}

function slot(ctx, x, y, s) {
  ctx.fillStyle = '#8b8b8b';
  ctx.fillRect(x, y, s, s);
  bevel(ctx, x, y, s, s, '#373737', '#ffffff', 3);
}

function bevel(ctx, x, y, w, h, tl, br, k) {
  ctx.fillStyle = tl;
  ctx.fillRect(x, y, w, k);
  ctx.fillRect(x, y, k, h);
  ctx.fillStyle = br;
  ctx.fillRect(x, y + h - k, w, k);
  ctx.fillRect(x + w - k, y, k, h);
}

/* ---------------------------------- items ----------------------------------- */

/** Something small that lies about, falls, and can be picked up by the hand and thrown. */
class Item {
  constructor(sb, kind, name, w, h, mass, x, y, o = {}) {
    this.mod = MOD;
    this.kind = kind;
    this.name = name;
    this.sandbox = sb;
    this.removed = false;
    this.body = new Body(w, h, mass, { x, y, rot: o.rot || 0, owner: this, friction: 0.6, restitution: o.bounce ?? 0.15, angularDamping: 0.5 });
    sb.phys.add(this.body);
    this.inWorld = true;
  }
  get pos() { return this.body.pos; }
  get loose() { return !this.removed; }
  contains(x, y, r) { return this.body.contains(x, y, r * 0.6 + 0.06); }
  leave(sb) { if (this.inWorld) { sb.phys.remove(this.body); this.inWorld = false; } }
}

export class WitherSkullItem extends Item {
  constructor(sb, x, y) { super(sb, 'witherSkull', 'Wither Skull', BLOCK * 0.5, BLOCK * 0.5, 2.2, x, y, { rot: rand(-0.3, 0.3) }); }
  draw(ctx) {
    const b = this.body;
    drawSkullItem(ctx, b.pos.x, b.pos.y, b.w, b.rot);
  }
}

export class NetherStar extends Item {
  constructor(sb, x, y) {
    super(sb, 'netherStar', 'Nether Star', 0.34, 0.34, 0.5, x, y, { bounce: 0.35 });
    this.age = 0;
    this.glintT = 0;
  }
  update(dt, sb) {
    this.age += dt;
    if ((this.glintT -= dt) <= 0) {
      this.glintT = rand(0.25, 0.6);
      sparkles(sb, this.pos.x, this.pos.y, 2, 0.25);
    }
  }
  draw(ctx) {
    const b = this.body;
    drawNetherStar(ctx, b.pos.x, b.pos.y, 0.42, b.rot, this.age);
  }
  tap() { return 'A Nether Star: what the Wither leaves behind. It will not burn, and it never goes out.'; }
}

/* ---------------------------------- the totem -------------------------------- */

/**
 * Four soul sand in a T, three skulls on top, standing on the floor. It is
 * not a body: people walk past it and it does not move - until ACTIVATE.
 */
export class Totem {
  constructor(sb, x, y) {
    this.mod = MOD;
    this.kind = 'witherTotem';
    this.name = 'Wither Totem';
    this.sandbox = sb;
    this.removed = false;
    this.behind = true;
    this.grabbable = false;
    this.base = { x, y };
    this.pos = { x, y };
    this.charging = false;
    this.t = 0;
    this.rise = 0;
    this.glow = 0;
    this.shake = 0;
    this.sparkT = 0;
  }
  get loose() { return false; }
  contains(x, y, r) {
    const p = this.pos, b = BLOCK;
    const inBox = (x0, y0, x1, y1) => x > x0 - r && x < x1 + r && y > y0 - r && y < y1 + r;
    return inBox(p.x - b / 2, p.y, p.x + b / 2, p.y + b) || inBox(p.x - b * 1.5, p.y + b, p.x + b * 1.5, p.y + b * 2.5);
  }
  button() { return this.charging ? null : { label: 'ACTIVATE' }; }
  buttonAt() { return { x: this.pos.x, y: this.pos.y + TOTEM_H + 0.25 }; }
  press(sb) {
    if (this.charging || this.removed) return null;
    this.charging = true;
    this.t = 0;
    sb.emit('totemCharge', { what: this, x: this.pos.x, y: this.pos.y + BLOCK });
    return 'The totem rises...';
  }
  tap() { return this.charging ? 'Too late to stop it now.' : 'A Wither Totem. Press ACTIVATE when you are ready for what comes out of it.'; }
  bossbar() { return this.charging ? { name: 'Wither', frac: clamp(this.t / CHARGE, 0, 1), color: '#b23cd1' } : null; }
  update(dt, sb) {
    if (!this.charging) return;
    this.t += dt;
    const k = this.t / CHARGE;
    // it lifts off the floor, and slows; it whitens; it shakes harder and harder
    this.rise = easeOut(clamp(this.t / 2.2, 0, 1)) * 1.3;
    this.glow = smooth(k);
    this.shake = k;
    const s = (Math.sin(this.t * 63) + Math.sin(this.t * 41)) * 0.03 * this.shake;
    this.pos.x = this.base.x + s;
    this.pos.y = this.base.y + this.rise + Math.cos(this.t * 57) * 0.02 * this.shake;
    if ((this.sparkT -= dt) <= 0) {
      this.sparkT = 0.08;
      sparkles(sb, this.pos.x + rand(-1.1, 1.1), this.pos.y + rand(0, TOTEM_H), 2, 0.1);
    }
    if (this.t >= CHARGE) this.burst(sb);
  }
  /** The bang - and the Wither, where the totem was. */
  burst(sb) {
    const cx = this.base.x, cy = this.base.y + this.rise + BLOCK;
    explode(sb, cx, cy, null, 2.0);
    puffs(sb, { x: cx, y: cy, n: 26, speed: 4, size: 0.3, grow: 0.5, life: 1.2, colors: ['#ffffff', '#f3f3f3', '#dcdcdc'], spread: 0.8 });
    sb.emit('totemBurst', { x: cx, y: cy });
    sb.remove(this);
    if (this.onBurst) this.onBurst(sb, cx, this.base.y + this.rise * 0.6);
  }
  draw(ctx) {
    if (this.glow > 0.05) {
      // light pouring out of it, softly, all round
      const cx = this.pos.x, cy = this.pos.y + TOTEM_H * 0.55, r = TOTEM_W * 0.55 + this.glow * 1.8;
      const g = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
      g.addColorStop(0, `rgba(255,255,255,${(this.glow * 0.75).toFixed(3)})`);
      g.addColorStop(0.5, `rgba(255,255,255,${(this.glow * 0.3).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    drawTotem(ctx, this.pos.x, this.pos.y, this.glow);
  }
}

/* --------------------------------- placing ---------------------------------- */

export function spawnBlock(sb, type, x, y) {
  if (sb.crates.length >= 40) return null;
  x = clamp(x, sb.left + BLOCK / 2 + 0.05, sb.right - BLOCK / 2 - 0.05);
  const b = type === 'table' ? new CraftingTable(sb, x, Math.max(y, BLOCK / 2 + 0.01)) : new Block(sb, x, Math.max(y, BLOCK / 2 + 0.01), type);
  sb.crates.push(b);
  sb.emit('spawn', { what: b, x, y });
  return b;
}

export function spawnSkull(sb, x, y) {
  return sb.addItem(new WitherSkullItem(sb, clamp(x, sb.left + 0.3, sb.right - 0.3), Math.max(y, BLOCK * 0.25 + 0.01)));
}

export function spawnStar(sb, x, y) {
  const s = sb.addItem(new NetherStar(sb, x, Math.max(0.3, y)));
  if (s) { s.body.vel.y = 3; s.body.angVel = rand(-3, 3); }
  return s;
}

/** A totem out of the spawn menu, if one has been crafted. */
export function placeTotem(sb, x, onBurst) {
  if (inventory.totems <= 0) return null;
  x = clamp(x, sb.left + TOTEM_W / 2 + 0.1, sb.right - TOTEM_W / 2 - 0.1);
  const t = sb.addItem(new Totem(sb, x, 0));
  if (!t) return null;
  t.onBurst = onBurst;
  inventory.totems--;
  puffs(sb, { x, y: 0.3, n: 10, speed: 1.5, size: 0.18, grow: 0.4, life: 0.6, colors: ['#5c4632', '#3a2a1d'] });
  sb.emit('inventory', { mod: MOD });
  return t;
}

