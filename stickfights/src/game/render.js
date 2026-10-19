/* =============================================================================
   Draws the sandbox: the grey sky, the black floor, the crates, the weapons
   lying about, everyone in it, the pieces of anyone who lost some, the blood,
   the dust, the empty cases and the flash and streak of a shot.

   Blood is drawn wherever it is: in the air as drops, and streams as one
   unbroken arc; on the floor and up the walls; and on anything it landed
   on, over the top of it (blood.js drawStains).

   Trees stand at the back, behind everything; bushes at the front, in front
   of whoever is in them. Walls, and whatever has come off a wall or a tree,
   are among the crates. Ropes, rods and pins go over the people they are
   tied to. Anything frozen in place has a pale dashed line round it.

   Then, over the top and at the same size whatever the zoom: names, speech
   and thought bubbles, health bars, and the little symbols that say how
   somebody feels - an anger mark, a sweat drop, a heart, stars going round
   a dizzy head.

   Fire and ice are drawn on top of whoever has them (vitals.js): a glow
   behind somebody burning and the flames in front; frost, or a whole shell
   of ice; and a face that goes red with heat, blue with cold or for want of
   air, and black with burning.
   ========================================================================== */
import {
  drawStickman, drawCrateShape, drawKnuckleShape, drawKnifeShape, drawMacheteShape, drawSeveredLimb,
  drawTaserShape, drawVestShape, drawAmmoBoxShape, drawGunShape, drawCrowbarShape,
  KNIFE_W, KNIFE_H, MACHETE_W, MACHETE_H, CROWBAR_W, CROWBAR_H, INK, BLOOD, BLOOD_DARK, BRASS, BRASS_DARK,
} from './draw.js';
import { AMMO_BOXES, VEST_W, VEST_H, GUN_MODELS } from './props.js';
import { drawWallShape, WALLS } from './structures.js';
import { drawPlantShape } from './trees.js';
import { WIRES } from './wires.js';
import { drawVitalsBack, drawVitalsFront, headFill, inkFor, drawIcedLimb } from './vitals.js';
import { drawStains, drawBlots } from './blood.js';
import { DIM } from './skeleton.js';
import { clamp, TAU } from '../core/util.js';

export const SKY = '#9b9b9b';
export const FLOOR = '#000000';
const OUTSIDE = '#7d7d7d';
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
// an officer's uniform: a navy shirt, darker trousers
export const POLICE_UNIFORM = { top: '#1f2d52', topFar: '#2c3b62', legs: '#151c31', legsFar: '#222b43' };

/** The pale outline round something frozen in place by the freeze tool. */
export function drawFrozenBox(ctx, b, pad = 0.03) {
  ctx.save();
  ctx.translate(b.pos.x, b.pos.y);
  ctx.rotate(b.rot);
  ctx.strokeStyle = 'rgba(120, 200, 255, 0.95)';
  ctx.lineWidth = 0.022;
  ctx.setLineDash([0.07, 0.05]);
  ctx.strokeRect(-b.w / 2 - pad, -b.h / 2 - pad, b.w + pad * 2, b.h + pad * 2);
  ctx.setLineDash([]);
  ctx.restore();
}

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
    this.drawWallSplats(ctx, v);
    // the trees, at the very back
    for (const t of sb.plants) if (t.kind !== 'bush') this.drawPlant(ctx, t, v);
    // a mod's things: the big ones that stand at the back first
    for (const it of sb.items) if (it.behind) { it.draw(ctx); drawStains(ctx, it); }
    for (const c of sb.crates) if (!c.carriedBy) this.drawCrate(ctx, c);
    for (const w of sb.slabs) if (!(w.body.aabb().maxX < v.minX || w.body.aabb().minX > v.maxX)) this.drawSlab(ctx, w);
    for (const l of sb.logs) if (!(l.body.aabb().maxX < v.minX - 3 || l.body.aabb().minX > v.maxX + 3)) this.drawLog(ctx, l);
    for (const k of sb.knuckles) if (!k.wornBy) this.drawKnuckles(ctx, k);
    for (const k of sb.blades) if (!k.wornBy && !(k.stuckIn && k.stuckIn.person)) this.drawKnife(ctx, k);
    for (const k of sb.crowbars) if (!k.wornBy) this.drawKnife(ctx, k);
    for (const g of sb.guns) if (!g.wornBy) this.drawGun(ctx, g);
    for (const v of sb.vests) if (!v.wornBy) this.drawVest(ctx, v);
    for (const a of sb.ammo) this.drawAmmo(ctx, a);
    for (const l of sb.limbs) this.drawLimb(ctx, l);
    for (const it of sb.items) if (!it.behind) { it.draw(ctx); drawStains(ctx, it); }
    this.drawCasings(ctx, v);

    const order = [...sb.people].sort((a, b) => this.layer(a, ui) - this.layer(b, ui));
    for (const p of order) {
      if (p.box.maxX < v.minX || p.box.minX > v.maxX) continue;
      this.drawPerson(ctx, p);
    }
    for (const c of sb.crates) if (c.carriedBy) this.drawCrate(ctx, c);
    // the bushes, in front of whoever is in them; the wires over everything they hold
    for (const t of sb.plants) if (t.kind === 'bush') this.drawPlant(ctx, t, v);
    for (const w of sb.wires) w.draw(ctx);
    if (ui.wire) this.drawWirePreview(ctx, ui.wire);
    this.drawFrozen(ctx, v);
    this.drawFx(ctx);
    // a mod's beams, missiles and blasts
    for (const e of sb.effects) if (e.draw) e.draw(ctx);
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
      ctx.fillStyle = s.tint ? s.tint[s.dark ? 1 : 0] : s.dark ? BLOOD_DARK : BLOOD;
      ctx.beginPath();
      ctx.ellipse(s.x, 0.004, s.w, s.h, 0, 0, TAU);
      ctx.fill();
    }
  }

  /** Blood on the walls: a splash on the face of the wall, and the run down from it. */
  drawWallSplats(ctx, v) {
    const sb = this.sb, list = sb.fx.wallSplats;
    if (!list.length) return;
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? sb.left : sb.right;
      if (x0 < v.minX - 0.5 || x0 > v.maxX + 0.5) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(side < 0 ? x0 - 2 : x0, -1, 2, Math.max(60, v.maxY + 1));
      ctx.clip();
      for (const s of list) {
        if (s.side !== side) continue;
        ctx.fillStyle = s.tint ? s.tint[s.dark ? 1 : 0] : s.dark ? BLOOD_DARK : BLOOD;
        ctx.beginPath();
        ctx.ellipse(x0 + side * s.w * 0.3, s.y, s.w, s.h, 0, 0, TAU);
        ctx.fill();
        if (s.run > 0.004) {
          const rw = s.w * 0.42;
          ctx.fillRect(x0 + side * s.w * 0.35 - rw / 2, s.y - s.run, rw, s.run);
          ctx.beginPath();
          ctx.arc(x0 + side * s.w * 0.35, s.y - s.run, rw * 0.62, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  drawCrate(ctx, c) {
    const b = c.body;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(b.rot);
    // (a block from a mod draws itself; the blood on it goes over the top, inside its edges)
    if (c.drawShape) {
      c.drawShape(ctx, b.w, b.h);
      if (c.stains.length) {
        ctx.beginPath();
        ctx.rect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.clip();
        drawBlots(ctx, c.stains);
      }
    } else drawCrateShape(ctx, b.w, b.h, c.stains, c.holes);
    ctx.restore();
  }

  /** A wall, or a piece of one: what is left of it (structures.js draws its own picture). */
  drawSlab(ctx, w) {
    w.draw(ctx);
    if (w.frozenInPlace) drawFrozenBox(ctx, w.body);
  }

  drawKnuckles(ctx, k) {
    const b = k.body;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(b.rot);
    drawKnuckleShape(ctx, b.w, b.h, k.blood);
    ctx.restore();
    drawStains(ctx, k);
  }

  drawKnife(ctx, k) {
    const b = k.body;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(b.rot);
    if (k.kind === 'machete') drawMacheteShape(ctx, MACHETE_W, MACHETE_H, k.blood);
    else if (k.kind === 'crowbar') drawCrowbarShape(ctx, CROWBAR_W, CROWBAR_H, k.blood);
    else drawKnifeShape(ctx, KNIFE_W, KNIFE_H, k.blood);
    ctx.restore();
    drawStains(ctx, k);
  }

  drawGun(ctx, g) {
    // a gun from a mod draws itself
    if (g.draw) { g.draw(ctx); drawStains(ctx, g); return; }
    const b = g.body;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(b.rot);
    drawGunShape(ctx, g.kind, 1, g.blood, g.slide);
    ctx.restore();
    drawStains(ctx, g);
  }

  /** A tree or a bush, if any of it is in view. */
  drawPlant(ctx, t, v) {
    const bb = t.bounds();
    if (bb.x1 < v.minX || bb.x0 > v.maxX) return;
    t.draw(ctx);
  }

  /** Something off a tree: a branch, a log, a whole tree on its side. */
  drawLog(ctx, l) {
    l.draw(ctx);
  }

  /** Where a wire would go, while it is being put in: from where it was started to the pointer. */
  drawWirePreview(ctx, w) {
    const spec = WIRES[w.type];
    if (!spec) return;
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = spec.colour;
    ctx.lineWidth = Math.max(spec.width, 0.03);
    ctx.lineCap = 'round';
    if (!spec.pin) {
      ctx.setLineDash([0.08, 0.06]);
      ctx.beginPath();
      ctx.moveTo(w.x0, w.y0);
      ctx.lineTo(w.x1, w.y1);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = spec.dark;
    for (const [x, y] of spec.pin ? [[w.x1, w.y1]] : [[w.x0, w.y0], [w.x1, w.y1]]) {
      ctx.beginPath(); ctx.arc(x, y, Math.max(spec.width, 0.035), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  /** A pale dashed line round everything frozen in place. */
  drawFrozen(ctx, v) {
    const sb = this.sb;
    for (const p of sb.people) {
      if (!p.frozenInPlace || p.box.maxX < v.minX || p.box.minX > v.maxX) continue;
      const b = p.box;
      ctx.save();
      ctx.strokeStyle = 'rgba(120, 200, 255, 0.95)';
      ctx.lineWidth = 0.022;
      ctx.setLineDash([0.07, 0.05]);
      ctx.strokeRect(b.minX - 0.05, b.minY - 0.05, b.maxX - b.minX + 0.1, b.maxY - b.minY + 0.1);
      ctx.restore();
    }
    for (const t of [...sb.crates, ...sb.loose(), ...sb.items]) {
      if (!t.frozenInPlace || !t.body || t.kind === 'wall' || t.kind === 'piece') continue;
      drawFrozenBox(ctx, t.body);
    }
    for (const t of sb.plants) {
      if (!t.frozenInPlace) continue;
      const b = t.bounds();
      ctx.save();
      ctx.strokeStyle = 'rgba(120, 200, 255, 0.95)';
      ctx.lineWidth = 0.03;
      ctx.setLineDash([0.1, 0.07]);
      ctx.strokeRect(b.x0 - 0.05, Math.max(0, b.y0 - 0.05), b.x1 - b.x0 + 0.1, b.y1 - Math.max(0, b.y0) + 0.1);
      ctx.restore();
    }
  }

  drawVest(ctx, v) {
    const b = v.body;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(b.rot);
    drawVestShape(ctx, b.w, b.h, v.police, v.condition);
    ctx.restore();
    drawStains(ctx, v);
  }

  drawAmmo(ctx, a) {
    const b = a.body;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(b.rot);
    drawAmmoBoxShape(ctx, a.size, b.w, b.h, a.rounds / a.spec.rounds);
    ctx.restore();
    drawStains(ctx, a);
  }

  drawLimb(ctx, l) {
    const b = l.body;
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(b.rot);
    drawSeveredLimb(ctx, l.local, 0.07 * l.scale, l.iced ? '#1c2c3c' : '#1b1b1b', l.tint || null);
    if (l.iced) drawIcedLimb(ctx, l.local, 0.07 * l.scale);
    ctx.restore();
    drawStains(ctx, l);
  }

  drawCasings(ctx, v) {
    ctx.fillStyle = BRASS;
    ctx.strokeStyle = BRASS_DARK;
    ctx.lineWidth = 0.004;
    for (const c of this.sb.fx.casings) {
      if (c.x < v.minX || c.x > v.maxX) continue;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.a);
      if (c.shell) {
        // a shotgun shell: the red hull, the brass head
        ctx.fillStyle = '#b3201c';
        ctx.fillRect(-0.03, -0.011, 0.05, 0.022);
        ctx.fillStyle = BRASS;
        ctx.fillRect(-0.042, -0.012, 0.014, 0.024);
      } else {
        const l = c.long ? 0.05 : 0.034;
        ctx.fillStyle = BRASS;
        ctx.fillRect(-l / 2, -0.007, l, 0.014);
        ctx.strokeRect(-l / 2, -0.007, l, 0.014);
      }
      ctx.restore();
    }
  }

  drawPerson(ctx, p) {
    const h = p.health;
    if (p.flames) drawVitalsBack(ctx, p);
    const stuck = p.stuck.length ? p.stuck.map((e) => { const q = p.knifePose(e); return { x: q.x, y: q.y, a: q.a, blood: e.knife.blood, kind: e.knife.kind }; }) : null;
    drawStickman(ctx, p.wj, {
      scale: p.scale,
      facing: p.rag ? p.rag.facing : p.facing,
      hair: p.hair,
      face: p.face,
      hurt: h.face,
      weapon: p.armedWith,
      weaponBlood: p.weapon ? p.weapon.blood : 0,
      gunSlide: GUN_MODELS[p.armedWith] && p.weapon ? p.weapon.slide : 0,
      // an officer's uniform and cap; what they have put away, a vest, handcuffs
      uniform: p.officer ? POLICE_UNIFORM : null,
      hat: p.officer ? 'police' : null,
      belt: p.officer,
      kit: p.kit.length ? { holster: p.stowed.holster && p.stowed.holster.kind, pocket: p.stowed.pocket && p.stowed.pocket.kind, duty: p.stowed.duty && p.stowed.duty.kind, back: p.stowed.back && p.stowed.back.kind } : null,
      vest: p.vest,
      donning: p.donning,
      cuffed: !!p.cuffed,
      wounds: p.wounds,
      headMarks: p.headMarks,
      broken: h.broken,
      cut: p.cut,
      dislocated: h.dislocated,
      stuck,
      pale: p.dead ? 0.7 : clamp((0.86 - h.blood) / 0.42 + h.shock * 0.4, 0, 1),
      bruise: h.parts.head.bruise,
      ink: inkFor(p) || (p.dead ? '#1b1b1b' : INK),
      headFill: headFill(p),
      // what a mod adds: its species' own drawing, what they bleed, a held thing that draws itself
      man: p,
      skin: p.species && p.species.skin ? p.species.skin : null,
      tint: p.tint,
      heldDraw: p.weapon && p.weapon.drawHeld ? (c, j, s, f) => p.weapon.drawHeld(c, j, s, f, p) : null,
    });
    for (const a of p.afflictions) if (a.draw) a.draw(ctx, p);
    drawVitalsFront(ctx, p);
  }

  drawFx(ctx) {
    const fx = this.sb.fx;
    // the streak of a bullet, bright at first and gone in a blink
    ctx.lineCap = 'round';
    for (const t of fx.tracers) {
      const k = t.age / t.life;
      ctx.strokeStyle = `rgba(255, 236, 170, ${0.85 * (1 - k)})`;
      ctx.lineWidth = 0.018 * (1 - k * 0.5);
      ctx.beginPath();
      ctx.moveTo(t.x0, t.y0);
      ctx.lineTo(t.x1, t.y1);
      ctx.stroke();
    }
    for (const f of fx.flashes) {
      const k = 1 - f.age / f.life, L = 0.2 * f.s * (0.6 + k * 0.6);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.a);
      ctx.fillStyle = `rgba(255, 210, 90, ${0.95 * k})`;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(L * 0.45, L * 0.32);
      ctx.lineTo(L, 0);
      ctx.lineTo(L * 0.45, -L * 0.32);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(255, 255, 230, ${k})`;
      ctx.beginPath();
      ctx.arc(L * 0.12, 0, L * 0.16, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    for (const sp of fx.sparkles) {
      ctx.fillStyle = `rgba(255, 220, 120, ${1 - sp.age / sp.life})`;
      ctx.fillRect(sp.x - 0.008, sp.y - 0.008, 0.016, 0.016);
    }
    ctx.fillStyle = '#d9a464';
    for (const c of fx.chips) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.a);
      ctx.globalAlpha = Math.min(1, 2 * (1 - c.age / c.life));
      ctx.fillRect(-0.02, -0.005, 0.04, 0.01);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    // blood in the air: a drop of a stream is joined to the one before it, so the stream is one arc
    ctx.lineCap = 'round';
    for (const d of fx.drops) {
      const col = d.tint ? d.tint[0] : BLOOD, l = d.link;
      if (l && !l.gone && Math.abs(l.x - d.x) + Math.abs(l.y - d.y) < 0.3) {
        ctx.strokeStyle = col;
        ctx.lineWidth = d.r + l.r;
        ctx.beginPath();
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(d.x, d.y);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = col;
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
    // smoke and steam, spreading as they rise
    for (const p of fx.smokes) {
      const k = p.age / p.life, a = Math.min(1, p.age * 6) * (1 - k);
      ctx.fillStyle = p.steam ? `rgba(240, 244, 248, ${0.4 * a})` : `rgba(40, 38, 36, ${0.34 * a * p.k})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1 + k * 2.6), 0, TAU);
      ctx.fill();
    }
    // bits off walls and trees: splinters and scraps, shards of glass, leaves
    for (const d of fx.debris) {
      const fade = d.rest && d.age > 30 ? Math.max(0, 1 - (d.age - 30) / 10) : 1;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.a);
      ctx.globalAlpha = fade * (d.sharp ? 0.85 : 1);
      ctx.fillStyle = d.c;
      if (d.leaf) {
        ctx.beginPath();
        ctx.ellipse(0, 0, d.s, d.s * 0.55, 0, 0, TAU);
        ctx.fill();
      } else if (d.sharp) {
        ctx.beginPath();
        ctx.moveTo(-d.s, -d.s * 0.3); ctx.lineTo(d.s * 0.8, -d.s * 0.5); ctx.lineTo(d.s * 0.2, d.s * 0.6);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(-d.s / 2, -d.s / 2, d.s, d.s);
        if (d.glow > 0) { ctx.fillStyle = `rgba(255, 150, 60, ${d.glow.toFixed(2)})`; ctx.fillRect(-d.s / 2, -d.s / 2, d.s, d.s); }
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    for (const e of fx.emberBits) {
      const k = e.age / e.life, tw = 0.6 + 0.4 * Math.sin(e.age * 30 + e.seed);
      ctx.fillStyle = `rgba(255, ${170 + Math.round(60 * (1 - k))}, 60, ${(1 - k) * tw})`;
      ctx.fillRect(e.x - 0.008, e.y - 0.008, 0.016, 0.016);
    }
    // ice: little clear splinters, catching the light as they tumble
    for (const p of fx.iceBits) {
      const a = Math.min(1, 2 * (1 - p.age / p.life));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = `rgba(200, 232, 255, ${0.85 * a})`;
      ctx.beginPath();
      ctx.moveTo(-p.s, -p.s * 0.4);
      ctx.lineTo(p.s, 0);
      ctx.lineTo(-p.s * 0.3, p.s * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
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
    if (g.draw) g.draw(ctx);
    else if (g.kind === 'crate') drawCrateShape(ctx, 0.78, 0.78, null);
    else if (g.kind === 'knuckles') drawKnuckleShape(ctx, 0.26, 0.11, 0);
    else if (g.kind === 'knife') drawKnifeShape(ctx, KNIFE_W, KNIFE_H, 0);
    else if (g.kind === 'machete') drawMacheteShape(ctx, MACHETE_W, MACHETE_H, 0);
    else if (g.kind === 'crowbar') drawCrowbarShape(ctx, CROWBAR_W, CROWBAR_H, 0);
    else if (GUN_MODELS[g.kind]) drawGunShape(ctx, g.kind, 1, 0, 0);
    else if (g.kind === 'taser') drawTaserShape(ctx, 1, true);
    else if (g.kind === 'vest') drawVestShape(ctx, VEST_W, VEST_H, false, 1);
    else if (g.kind === 'ammo') { const sp = AMMO_BOXES[g.size] || AMMO_BOXES.ammo9; drawAmmoBoxShape(ctx, g.size, sp.w, sp.h, 1); }
    else if (WALLS[g.kind]) { ctx.scale(1, -1); drawWallShape(ctx, g.kind, 0, 0, WALLS[g.kind].h); }
    else if (g.kind === 'tree' || g.kind === 'bush') drawPlantShape(ctx, g.kind, 0, 0, g.kind === 'bush' ? 1 : 5, 11);
    else {
      // a stickman - or anybody else a mod adds
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
    // (a boss has its bar along the top instead)
    if (!p.dead && (hurt || sel) && !(p.species && p.species.bossbar)) {
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
    // (frozen solid is not asleep)
    if (p.alive && !p.conscious && !p.health.frozen) {
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
    case 'knife':
      ctx.save();
      ctx.rotate(-0.6);
      ctx.scale(s * 1.9 / KNIFE_W, -s * 1.9 / KNIFE_W);
      drawKnifeShape(ctx, KNIFE_W, KNIFE_H, 0);
      ctx.restore();
      break;
    case 'machete':
      ctx.save();
      ctx.rotate(-0.6);
      ctx.scale(s * 2.1 / MACHETE_W, -s * 2.1 / MACHETE_W);
      drawMacheteShape(ctx, MACHETE_W, MACHETE_H, 0);
      ctx.restore();
      break;
    case 'gun':
      ctx.save();
      ctx.scale(s * 1.7 / 0.3, -s * 1.7 / 0.3);
      drawGlockShape(ctx, 1, 0, 0);
      ctx.restore();
      break;
    case 'taser':
      ctx.save();
      ctx.scale(s * 1.7 / 0.26, -s * 1.7 / 0.26);
      drawTaserShape(ctx, 1, true);
      ctx.restore();
      break;
    case 'vest':
      ctx.save();
      ctx.scale(s * 1.8 / 0.26, -s * 1.8 / 0.26);
      drawVestShape(ctx, 0.26, 0.13, false, 1);
      ctx.restore();
      break;
    case 'ammo':
      ctx.save();
      ctx.scale(s * 1.6 / 0.34, -s * 1.6 / 0.34);
      drawAmmoBoxShape(ctx, 'medium', 0.34, 0.2, 1);
      ctx.restore();
      break;
    case 'badge':
      // a gold shield with a star on it
      ctx.fillStyle = '#e2b84a';
      ctx.strokeStyle = '#7a5a12';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.85);
      ctx.quadraticCurveTo(s * 0.45, -s * 0.6, s * 0.75, -s * 0.62);
      ctx.quadraticCurveTo(s * 0.78, s * 0.35, 0, s * 0.9);
      ctx.quadraticCurveTo(-s * 0.78, s * 0.35, -s * 0.75, -s * 0.62);
      ctx.quadraticCurveTo(-s * 0.45, -s * 0.6, 0, -s * 0.85);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#7a5a12';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? s * 0.13 : s * 0.3;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case 'limb':
      ctx.save();
      ctx.rotate(-0.5);
      ctx.scale(s * 1.4, -s * 1.4);
      drawSeveredLimb(ctx, [{ x: -0.6, y: 0 }, { x: 0.35, y: 0 }, { x: 0.6, y: 0.18 }], 0.16);
      ctx.restore();
      break;
    case 'bone':
      ctx.strokeStyle = '#222';
      ctx.fillStyle = '#f4f1e8';
      ctx.lineWidth = 1.2;
      ctx.save();
      ctx.rotate(-0.6);
      ctx.fillRect(-s * 0.7, -s * 0.16, s * 1.4, s * 0.32);
      ctx.strokeRect(-s * 0.7, -s * 0.16, s * 1.4, s * 0.32);
      for (const e of [-1, 1]) for (const k of [-1, 1]) {
        ctx.beginPath(); ctx.arc(e * s * 0.72, k * s * 0.2, s * 0.24, 0, TAU); ctx.fill(); ctx.stroke();
      }
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
