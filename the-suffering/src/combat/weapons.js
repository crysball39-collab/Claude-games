/* =============================================================================
   Weapons.

   Fists, a knife, a machete, an M1911 and an AK-47. The three you swing each
   have four different attacks, and none of them has a hit box: for as long
   as a swing is in the part of its arc that can land, the knuckles, the toe
   or a row of points along the blade are followed through the air from where
   they were last frame to where they are now, and whatever body part one of
   those paths passes through is what got hit, where it got hit, and in which
   direction.

   The two guns trace a line from the muzzle to whatever is under the
   crosshair. A rifle round keeps going out of the far side.
   ========================================================================== */
import { Body, Island, Joint, BALL, rayBody } from '../physics/world.js';
import { CLIPS, MOVES, RELOAD } from '../human/anim.js';
import { ST } from '../human/human.js';
import { P } from '../human/rig.js';
import { groundHeight, KERB } from '../world/city.js';
import { rgb } from '../render/boxes.js';
import { cellUV } from '../render/quads.js';
import { DECAL, ATLAS_COLS, ATLAS_ROWS } from '../render/textures.js';
import { clamp, clamp01, lerp, smooth, rand, chance, wrapAngle } from '../core/util.js';

const STEEL = 0xc3c8cc, DARK = 0x26282c, WOOD = 0x7a4a26, GRIP = 0x3a2a1c, VEST = 0x121316, MAG = 0x15161a, YELLOW = 0xd8b614;
const tilt = (a) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];

/** Box lists: x, y, z, width, height, length, colour, [rotation], [is blade], [is the magazine]. Barrel or blade toward +Z. */
export const WEAPONS = {
  fists: { id: 'fists', name: 'Fists', label: 'PUNCH', hold: 'guard', moves: MOVES.fists, melee: true },
  knife: {
    id: 'knife', name: 'Knife', label: 'SLASH', hold: 'blade', moves: MOVES.knife, melee: true, blade: [0.07, 0.19, 4], mass: 0.4, half: [0.02, 0.022, 0.16], centre: 0.07,
    boxes: [[0, 0, 0.145, 0.005, 0.03, 0.17, STEEL, null, 1], [0, -0.004, 0.225, 0.005, 0.018, 0.04, STEEL, null, 1], [0, 0, 0.055, 0.014, 0.052, 0.012, DARK], [0, 0, 0, 0.024, 0.03, 0.1, 0x18191b]],
  },
  machete: {
    id: 'machete', name: 'Machete', label: 'CHOP', hold: 'blade', moves: MOVES.machete, melee: true, blade: [0.1, 0.5, 6], mass: 0.9, half: [0.02, 0.04, 0.32], centre: 0.22, chops: true,
    boxes: [[0, 0.004, 0.3, 0.005, 0.056, 0.44, STEEL, null, 1], [0, 0.012, 0.5, 0.005, 0.074, 0.13, STEEL, null, 1], [0, 0, 0.07, 0.016, 0.06, 0.014, DARK], [0, 0, 0, 0.028, 0.034, 0.13, GRIP]],
  },
  m1911: {
    id: 'm1911', name: 'M1911', label: 'FIRE', hold: 'pistol', gun: true, mag: 7, auto: false, gap: 0.17, power: 1.0, hp: 32, impulse: 20, spread: 0.01, kick: 0.03,
    reload: 1.5, loud: 158, mass: 1.1, half: [0.018, 0.07, 0.11], centre: 0.04, grip: [0, -0.055, -0.02], muzzle: [0, 0.022, 0.17], sound: 'pistol',
    boxes: [[0, 0.022, 0.06, 0.028, 0.032, 0.21, DARK], [0, 0, 0.04, 0.026, 0.02, 0.13, 0x3c3f44], [0, -0.062, -0.02, 0.028, 0.11, 0.046, GRIP, tilt(0.22)], [0, -0.026, 0.03, 0.008, 0.03, 0.05, DARK], [0, 0.04, -0.03, 0.01, 0.01, 0.012, 0x101010], [0, -0.121, -0.033, 0.024, 0.014, 0.042, MAG, tilt(0.22), 0, 1]],
    slide: 0, magSize: [0.011, 0.05, 0.017],
  },
  ak47: {
    id: 'ak47', name: 'AK-47', label: 'FIRE', hold: 'rifle', gun: true, mag: 30, auto: true, gap: 0.1, power: 1.4, hp: 44, impulse: 26, spread: 0.016, kick: 0.019, pierce: true,
    reload: 2.3, loud: 162, mass: 3.6, half: [0.03, 0.11, 0.45], centre: 0.12, grip: [0, -0.07, -0.06], muzzle: [0, 0.012, 0.6], sound: 'rifle',
    boxes: [[0, 0, 0, 0.046, 0.07, 0.3, DARK], [0, 0.012, 0.38, 0.02, 0.02, 0.44, 0x1b1c1f], [0, 0.042, 0.27, 0.026, 0.026, 0.2, 0x303236], [0, 0.004, 0.25, 0.052, 0.05, 0.2, WOOD],
      [0, -0.02, -0.28, 0.04, 0.085, 0.27, WOOD, tilt(0.1)], [0, -0.085, -0.06, 0.035, 0.1, 0.042, WOOD, tilt(0.3)], [0, -0.095, 0.085, 0.03, 0.13, 0.06, 0x202124, tilt(-0.32), 0, 1],
      [0, -0.19, 0.135, 0.03, 0.08, 0.056, 0x202124, tilt(-0.62), 0, 1], [0, 0.045, 0.56, 0.01, 0.04, 0.012, DARK], [0, 0.05, 0.05, 0.02, 0.02, 0.03, DARK]],
    slide: 9, magSize: [0.014, 0.09, 0.028],
  },
  /* two barbed probes on seven metres of wire: no wound to speak of, and five seconds in which no muscle answers */
  taser: {
    id: 'taser', name: 'Taser', label: 'TASE', hold: 'pistol', gun: true, taser: true, mag: 2, auto: false, gap: 0.7, power: 0, hp: 0, impulse: 0, spread: 0.008, kick: 0.006,
    reload: 1.5, loud: 92, mass: 0.45, half: [0.02, 0.06, 0.1], centre: 0.03, grip: [0, -0.05, -0.02], muzzle: [0, 0.02, 0.135], sound: 'tasershot', range: 7.5, cycle: 5,
    boxes: [[0, 0.02, 0.03, 0.036, 0.052, 0.16, YELLOW], [0, -0.056, -0.02, 0.03, 0.105, 0.046, 0x1d1e22, tilt(0.2)], [0, -0.018, 0.03, 0.008, 0.028, 0.05, 0x1d1e22],
      [0, 0.05, 0, 0.012, 0.012, 0.03, 0x17181b], [0, 0.02, 0.118, 0.032, 0.046, 0.03, 0x17181b, tilt(0), 0, 1]],
    slide: -1, magSize: [0.015, 0.022, 0.015],
  },
  /* not weapons, but picked up, carried and dropped like them */
  cuffs: {
    id: 'cuffs', name: 'Handcuffs', label: 'CUFF', hold: 'none', tool: true, cuffs: true, mass: 0.35, half: [0.085, 0.014, 0.04], centre: 0,
    boxes: [[0.045, 0, 0, 0.07, 0.016, 0.075, STEEL], [-0.045, 0, 0, 0.07, 0.016, 0.075, STEEL], [0, 0, 0, 0.03, 0.008, 0.014, 0x8d9197], [0.045, 0, 0, 0.04, 0.02, 0.045, 0x26282c], [-0.045, 0, 0, 0.04, 0.02, 0.045, 0x26282c]],
  },
  helmet: {
    id: 'helmet', name: 'Light helmet', wear: 'helmet', mass: 1.2, half: [0.125, 0.085, 0.14], centre: 0,
    boxes: [[0, 0.03, 0, 0.24, 0.1, 0.26, VEST], [0, -0.04, -0.115, 0.24, 0.09, 0.03, VEST], [0.11, -0.03, -0.02, 0.022, 0.08, 0.19, VEST], [-0.11, -0.03, -0.02, 0.022, 0.08, 0.19, VEST], [0, 0, 0.14, 0.2, 0.02, 0.04, 0x1c1e22]],
  },
  vest: {
    id: 'vest', name: 'Light vest', wear: 'vest', mass: 2.4, half: [0.2, 0.06, 0.25], centre: 0,
    boxes: [[0, 0, 0.08, 0.38, 0.1, 0.3, VEST], [0, 0, -0.15, 0.31, 0.09, 0.16, VEST], [0.13, 0.03, 0.2, 0.07, 0.05, 0.1, 0x1c1e22], [-0.13, 0.03, 0.2, 0.07, 0.05, 0.1, 0x1c1e22]],
  },
};

/** Turns three perpendicular unit vectors (where a thing's own X, Y and Z end up) into a rotation. */
function basis(ex, ey, ez) {
  const m00 = ex[0], m10 = ex[1], m20 = ex[2], m01 = ey[0], m11 = ey[1], m21 = ey[2], m02 = ez[0], m12 = ez[1], m22 = ez[2];
  const tr = m00 + m11 + m22;
  if (tr > 0) { const k = Math.sqrt(tr + 1) * 2; return [(m21 - m12) / k, (m02 - m20) / k, (m10 - m01) / k, 0.25 * k]; }
  if (m00 > m11 && m00 > m22) { const k = Math.sqrt(1 + m00 - m11 - m22) * 2; return [0.25 * k, (m01 + m10) / k, (m02 + m20) / k, (m21 - m12) / k]; }
  if (m11 > m22) { const k = Math.sqrt(1 + m11 - m00 - m22) * 2; return [(m01 + m10) / k, 0.25 * k, (m12 + m21) / k, (m02 - m20) / k]; }
  const k = Math.sqrt(1 + m22 - m00 - m11) * 2; return [(m02 + m20) / k, (m12 + m21) / k, 0.25 * k, (m10 - m01) / k];
}
const H = Math.SQRT1_2;
const slant = (a) => { const d = [Math.sin(a), -Math.cos(a), 0]; return basis([0, 0, 1], [d[1], -d[0], 0], d); };
const slantUp = (a) => { const d = [Math.sin(a), Math.cos(a), 0]; return basis([0, 0, -1], [-d[1], d[0], 0], d); };
/**
 * Where each weapon rides when it is not in the hand: which part of the body,
 * where on it (metres, for someone of average size), which way it lies, and
 * how the right hand gets there. +X is the wearer's left.
 */
export const MOUNT = {
  m1911: { part: P.PELVIS, pos: [-0.192, 0.035, 0.03], q: [H, 0, 0, H], reach: 'hip', dur: 0.46, word: 'holster' },       // muzzle down on the right hip
  knife: { part: P.PELVIS, pos: [0.186, 0.03, 0.02], q: [H, 0, 0, H], reach: 'cross', dur: 0.52, word: 'sheath' },        // blade down on the left hip
  machete: { part: P.CHEST, pos: [-0.11, 0.12, -0.135], q: slant(0.5), reach: 'back', dur: 0.66, word: 'back' },          // across the back, handle at the right shoulder
  ak47: { part: P.CHEST, pos: [0.02, -0.02, -0.15], q: slantUp(0.62), reach: 'back', dur: 0.7, word: 'back' },            // slung, muzzle over the left shoulder
  taser: { part: P.PELVIS, pos: [0.125, 0.035, 0.112], q: [H, 0, 0, H], reach: 'cross', dur: 0.5, word: 'holster' },      // cross-draw, front of the left hip
  cuffs: { part: P.PELVIS, pos: [0.05, 0.03, -0.118], q: [H, 0, 0, H], reach: 'hip', dur: 0.4, word: 'belt' },            // on the belt at the back
};

const _a = [0, 0, 0], _b = [0, 0, 0], _c = [0, 0, 0], _hit = [0, 0, 0, 0, 0, 0, 0], _n = [0, 0, 0];
const NONE = [];

export class Weapons {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.inventory = [];               // what the player is carrying besides their hands
    this.current = -1;                 // index into inventory, or -1 for fists
    this.combo = 0; this.lastAttack = -9; this.choice = -1;
    this.near = null;                  // a weapon on the ground within reach
    this.tracers = [];
    this.casings = [];
    this.cool = 0; this.heat = 0;
    this.lastMove = '';
    this.assist = null;
    this.lastItem = null;              // what the player last had out, for DRAW
  }

  /** Seconds left of the player's reload. */
  get reloading() { const r = this.game.player.reload; return r ? r.dur - r.t : 0; }

  get equipped() { return this.current >= 0 ? this.inventory[this.current] : null; }
  get def() { const e = this.equipped; return e ? e.def : WEAPONS.fists; }

  /* -------------------------------- objects ------------------------------- */

  /** Makes a weapon and drops it at a point. */
  spawn(type, x, y, z) {
    const def = WEAPONS[type];
    if (!def || type === 'fists') return null;
    if (this.items.length >= 24) {
      const old = this.items.find((i) => !i.holder && !this.inventory.includes(i));
      if (old) this.remove(old);
    }
    const item = this._make(type);
    item.px = x; item.py = y; item.pz = z;
    this._toGround(item, x, y, z, rand(-3, 3), [rand(-1, 1), 1, rand(-1, 1)]);
    return item;
  }

  _make(type) {
    const g = this.game, def = WEAPONS[type];
    const item = { type, def, body: null, island: null, prop: null, holder: null, ammo: def.mag || 0, bloody: 0, inst: def.boxes.map(() => g.boxes.alloc()),
      px: 0, py: 0, pz: 0, q: [0, 0, 0, 1], cool: 0, magOut: false, slide: 0, spots: [] };
    // the flat faces blood can land on: every box of the model that sits square to it
    if (!def.wear) {
      item.skin = [];
      for (const b of def.boxes) if (!b[7] && (def.gun ? b[5] > 0.1 : b[8])) item.skin.push(new Surface(item, b));
      item.reach2 = (def.half[2] * 2 + 0.2) ** 2;
    }
    this._paint(item);
    this.items.push(item);
    return item;
  }

  /** Puts a weapon straight on to somebody: in its holster, or in the hand. */
  give(human, type, inHand = false) {
    if (!WEAPONS[type] || type === 'fists' || WEAPONS[type].wear) return null;
    if (human.cuffed) return null;
    const item = this._make(type);
    item.holder = human;
    if (human.isPlayer) {
      this.inventory.push(item);
      if (inHand) { this.current = this.inventory.length - 1; this._sync(); } else this.game.ui?.weaponsChanged();
    } else {
      (human.kit || (human.kit = [])).push(item);
      if (inHand) human.weapon = item;
    }
    return item;
  }

  /** Everything this person has on them. */
  kit(human) { return human.isPlayer ? this.inventory : human.kit || NONE; }

  _paint(item) {
    const g = this.game, red = rgb(0x6e0808);
    item.def.boxes.forEach((b, i) => {
      const c = rgb(b[6]);
      const k = b[8] ? item.bloody * 0.85 : 0;
      g.boxes.color(item.inst[i], lerp(c[0], red[0], k), lerp(c[1], red[1], k), lerp(c[2], red[2], k));
    });
  }

  _toGround(item, x, y, z, yaw = 0, vel = null) {
    const g = this.game, d = item.def;
    const body = new Body({ hx: d.half[0], hy: d.half[1], hz: d.half[2], mass: d.mass, x, y, z, shape: 1, kind: 'weapon', friction: 0.8, angDamp: 1.2, bounce: 0.15, inertiaFloor: 0.004 });
    body.qy = Math.sin(yaw / 2); body.qw = Math.cos(yaw / 2);
    // lying on its side is how a dropped thing ends up
    if (vel) { body.vx = vel[0]; body.vy = vel[1]; body.vz = vel[2]; body.wx = rand(-5, 5); body.wz = rand(-5, 5); body.wy = rand(-3, 3); }
    const island = new Island(null); island.add(body);
    g.world.addIsland(island);
    item.body = body; item.island = island; item.holder = null;
    item.prop = { kind: 'weapon', body, island, item };
    body.owner = item.prop;
    g.props.push(item.prop);
  }

  _offGround(item) {
    const g = this.game;
    if (!item.body) return;
    const i = g.props.indexOf(item.prop);
    if (i >= 0) g.props.splice(i, 1);
    g.world.removeIsland(item.island);
    g.gore.clearBody(item.body);
    item.body = null; item.island = null; item.prop = null;
  }

  /** A person is gone for good: so is what they were carrying. */
  forget(human) {
    if (human.isPlayer) return;
    for (const it of (human.kit || NONE).slice()) this.remove(it);
    human.kit = null; human.weapon = null;
    if (human.cuffed) { const c = human.cuffed; this.game.world.removeJoint(c.joint); c.item.wornBy = null; human.cuffed = null; this.remove(c.item); }
    human.cuffing = null;
    for (const it of this.items) if (it.wire && it.wire.target === human) this._dropWire(it);
    if (human.reload && human.reload.magIdx >= 0) this.game.boxes.release(human.reload.magIdx);
    human.reload = null; human.swap = null;
  }

  remove(item) {
    this._offGround(item);
    this._dropWire(item);
    if (item.wornBy && item.wornBy.cuffed && item.wornBy.cuffed.item === item) { const t = item.wornBy; this.game.world.removeJoint(t.cuffed.joint); t.cuffed = null; t.pose.cuffed = 0; item.wornBy = null; }
    if (item.skin) for (const f of item.skin) this.game.gore.clearBody(f);
    const who = item.holder;
    if (who && !who.isPlayer) { const k = who.kit ? who.kit.indexOf(item) : -1; if (k >= 0) who.kit.splice(k, 1); if (who.weapon === item) who.weapon = null; if (who.reload && who.reload.item === item) this._cancelReload(who); if (who.swap && who.swap.to === item) who.swap = null; }
    for (const i of item.inst) this.game.boxes.release(i);
    const k = this.items.indexOf(item);
    if (k >= 0) this.items.splice(k, 1);
    const n = this.inventory.indexOf(item);
    if (n >= 0) { this.inventory.splice(n, 1); if (this.current >= this.inventory.length) this.current = this.inventory.length - 1; this._sync(); }
  }
  onPropRemoved(prop) { if (prop.kind === 'weapon' && prop.item && this.items.includes(prop.item)) { prop.item.body = null; prop.item.island = null; prop.item.prop = null; this.remove(prop.item); } }

  /* ------------------------------- carrying ------------------------------- */

  pickUp(item = this.near) {
    const g = this.game, p = g.player;
    if (!item) {
      // nothing to pick up, but somebody in cuffs within reach: take them off
      if (this.nearCuffed && !p.cuffed) { this.uncuff(this.nearCuffed, null); g.ui?.toast('Cuffs off'); return true; }
      return false;
    }
    if (item.holder === p || p.cuffed) return false;
    if (item.def.wear) {
      const helmet = item.def.wear === 'helmet';
      if (helmet ? p.helmet : p.vest) { g.ui?.toast('You are already wearing one.'); return false; }
      this.remove(item);
      if (helmet) p.wearHelmet(); else p.wearVest();
      g.audio?.play('pickup', 0.5);
      g.ui?.toast(helmet ? 'Light helmet on' : 'Light vest on');
      g.ui?.weaponsChanged();
      return true;
    }
    if (!p.h.armOk(-1)) return false;
    if (this.inventory.length >= 4) { g.ui?.toast('You are carrying all you can. Drop something first.'); return false; }
    // off the ground, or off somebody who is in no state to object
    const from = item.holder;
    if (from) { const k = from.kit ? from.kit.indexOf(item) : -1; if (k >= 0) from.kit.splice(k, 1); if (from.weapon === item) from.weapon = null; }
    this._offGround(item);
    this.inventory.push(item);
    this.current = this.inventory.length - 1;
    this._sync();
    g.audio?.play('pickup', 0.5);
    g.ui?.toast(item.def.name + (item.def.gun ? ` - ${item.ammo} rounds` : '') + (from ? ', taken from ' + (from.look.first || 'them') : ''));
    return true;
  }

  select(i) {
    const p = this.game.player;
    if (p.cuffed) return;
    if (i < -1 || i >= this.inventory.length || i === this.current) return;
    if (p.anim.busy || p.swap || p.state !== ST.ANIM) return;
    this.current = i; this.combo = 0;
    if (i >= 0) this.lastItem = this.inventory[i];
    this._swapTo(p, i >= 0 ? this.inventory[i] : null);
    this.game.ui?.weaponsChanged();
  }

  /** Puts away what is in the hand, or takes out what was last in it. */
  holster() {
    if (this.current >= 0) { this.lastItem = this.equipped; this.select(-1); return; }
    if (!this.inventory.length) return;
    const i = this.inventory.indexOf(this.lastItem);
    this.select(i >= 0 ? i : this.inventory.length - 1);
  }

  /** Takes off the vest, or the helmet, and leaves it at the player's feet. */
  shedVest() { this._shed('vest'); }
  shedHelmet() { this._shed('helmet'); }
  _shed(what) {
    const p = this.game.player;
    if (p.state !== ST.ANIM || p.cuffed) return;
    if (what === 'helmet') { if (!p.helmet) return; p.removeHelmet(); } else { if (!p.vest) return; p.removeVest(); }
    this.spawn(what, p.x + Math.sin(p.yaw) * 0.5, p.y + (what === 'helmet' ? 1.5 : 1.0), p.z + Math.cos(p.yaw) * 0.5);
    this.game.ui?.toast(what === 'helmet' ? 'Helmet off' : 'Vest off');
    this.game.ui?.weaponsChanged();
  }

  /* ---- handcuffs ---- */

  /** Can this person be handcuffed as they are? Down, out cold, locked rigid by a taser, or given up. */
  cuffable(t) {
    if (!t || t.removed || t.cuffed || !t.h.alive) return false;
    for (const i of [P.FARM_L, P.FARM_R, P.HAND_L, P.HAND_R]) if (t.gone[i] || !t.attached[i]) return false;
    if (t.state !== ST.ANIM || t.tased > 0 || !t.h.conscious) return true;
    return t.pose.handsUp > 0.5 || t.pose.cower > 0.5;
  }

  /**
   * Starts putting handcuffs on somebody: it takes a moment, and they have to
   * stay within reach for it. `force` is for someone who is standing still and
   * letting it happen.
   */
  cuff(by, target, force = false) {
    const item = this.kit(by).find((i) => i.def.cuffs);
    if (!item || by.cuffing || by.cuffed || by.state !== ST.ANIM || by.swap || by.reload) return false;
    if (!(force ? target && !target.cuffed && target.h.alive && !target.removed : this.cuffable(target))) return false;
    if (Math.hypot(target.x - by.x, target.z - by.z) > 2.0) return false;
    by.cuffing = { target, item, t: 0, dur: 1.5, low: target.state !== ST.ANIM };
    return true;
  }

  _applyCuffs(by, t, item) {
    const g = this.game;
    // off the belt, or out of the hand
    if (by.isPlayer) { const i = this.inventory.indexOf(item); if (i >= 0) this.inventory.splice(i, 1); if (this.current >= this.inventory.length || this.inventory[this.current] !== this.equipped) this.current = -1; this._sync(); }
    else { const k = by.kit ? by.kit.indexOf(item) : -1; if (k >= 0) by.kit.splice(k, 1); if (by.weapon === item) by.weapon = null; }
    // whatever they were carrying is taken off them
    this.dropFrom(t, true);
    item.holder = null; item.wornBy = t;
    const s = t.scale, a = t.bodies[P.FARM_L], b = t.bodies[P.FARM_R];
    const joint = new Joint(a, b, { la: [-0.03 * s, -0.12 * s, -0.02 * s], lb: [0.03 * s, -0.12 * s, -0.02 * s], type: BALL, swing: Math.PI, twist: Math.PI, damp: 0.4, name: 'cuffs' });
    g.world.addJoint(joint);
    t.cuffed = { item, by, joint, t: g.time };
    t.pose.cuffed = 1;
    g.audio?.at('cuff', t.x, t.y + 1, t.z, 0.8);
    t.mind?.note('felt', 'cuffed', `was handcuffed by ${t.mind.name(by)}`, 0.9, { by });
    t.mind?.stir('fear', 20); t.mind?.stir('anger', 14);
    t.mind?.ask('cuffed', 60, null, rand(0.6, 1.6));
    g.minds?.witness({ kind: 'cuff', actor: by, victim: t, x: t.x, y: t.y + 1, z: t.z });
    if (by.officer && by.brain && by.brain.arrested) by.brain.arrested(t);
    if (t.isPlayer) { g.ui?.toast('You have been handcuffed.', 3.5); g.ui?.weaponsChanged(); }
    else if (by.isPlayer) g.ui?.toast('Handcuffed');
  }

  /** Takes the cuffs off somebody. They go to `to`, or on to the ground. */
  uncuff(t, to = null) {
    const c = t.cuffed, g = this.game;
    if (!c) return;
    g.world.removeJoint(c.joint);
    t.cuffed = null; t.custody = null; t.pose.cuffed = 0;
    const item = c.item;
    item.wornBy = null;
    g.audio?.at('cuff', t.x, t.y + 1, t.z, 0.5);
    if (to && to.isPlayer && this.inventory.length < 4) { item.holder = to; this.inventory.push(item); }
    else if (to && !to.isPlayer) { item.holder = to; (to.kit || (to.kit = [])).push(item); }
    else { const h = t.bodies[P.PELVIS]; this._toGround(item, h.px, h.py + 0.1, h.pz, 0, [rand(-0.5, 0.5), 0.8, rand(-0.5, 0.5)]); }
    if (t.isPlayer || (to && to.isPlayer)) g.ui?.weaponsChanged();
  }

  /** The player, with cuffs in hand, uses them on whoever is in front of them. */
  useCuffs() {
    const g = this.game, p = g.player;
    if (p.cuffing || p.cuffed) return false;
    let t = null, best = 1.8;
    for (const o of g.humans) {
      if (o === p || o.removed) continue;
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d < best && Math.abs(wrapAngle(Math.atan2(o.x - p.x, o.z - p.z) - g.camYaw)) < 1.3) { best = d; t = o; }
    }
    if (!t) { g.ui?.toast('Nobody within reach.'); return false; }
    if (t.cuffed) { this.uncuff(t, p); g.ui?.toast('Cuffs off'); return true; }
    if (!this.cuffable(t)) { g.ui?.toast('They have to be down, or to have given up.'); return false; }
    return this.cuff(p, t);
  }

  /* ---- for anyone: hand to holster and back ---- */

  /** Starts moving `to` into the hand (or the hand's contents away, for null). */
  _swapTo(h, to) {
    if (h.weapon === to && !h.swap) return false;
    const out = h.weapon, m = MOUNT[(out || to).type];
    this._cancelReload(h);
    h.swap = { t: 0, dur: m.dur * (out && to ? 1.25 : 1), to, reach: m.reach, w: 0, done: false };
    return true;
  }
  /** An armed person brings out their weapon: the one named, or the first gun they carry, or anything. */
  draw(h, item = null) {
    const kit = this.kit(h);
    const it = item || kit.find((x) => x.def.gun && !x.def.taser) || kit.find((x) => !x.def.tool);
    if (!it || h.weapon === it || h.swap || h.cuffed || h.cuffing || h.state !== ST.ANIM || !h.h.armOk(-1)) return false;
    return this._swapTo(h, it);
  }
  putAway(h) {
    if (!h.weapon || h.swap || h.state !== ST.ANIM) return false;
    return this._swapTo(h, null);
  }
  cycle(d) {
    const n = this.inventory.length + 1;
    this.select(((this.current + 1 + d + n) % n) - 1);
  }

  /** Lets go of what is in the hand. */
  drop() {
    const item = this.equipped, p = this.game.player;
    if (!item) return;
    this.inventory.splice(this.current, 1);
    this.current = -1;
    this._release(item, p, true);
    this._sync();
  }

  _release(item, human, toss) {
    const hand = human.bodies[P.HAND_R];
    const y = Math.max(groundHeight(hand.px, hand.pz) + 0.25, hand.py);
    const f = toss ? 2.2 : 0.5;
    this._toGround(item, hand.px + Math.sin(human.yaw) * 0.25, y, hand.pz + Math.cos(human.yaw) * 0.25, human.yaw, [Math.sin(human.yaw) * f + human.vx, 1.2, Math.cos(human.yaw) * f + human.vz]);
  }

  /** Whatever this person was holding falls. */
  dropFrom(human, all = false) {
    this._cancelReload(human); human.swap = null;
    if (!human.isPlayer) {
      const kit = human.kit || NONE;
      for (const item of all ? kit.slice() : human.weapon ? [human.weapon] : NONE) {
        const i = kit.indexOf(item); if (i >= 0) kit.splice(i, 1);
        if (human.weapon === item) { human.weapon = null; this._release(item, human, false); }
        else { const b = human.bodies[MOUNT[item.type].part]; this._toGround(item, b.px, b.py, b.pz, human.yaw, [human.vx, 0.5, human.vz]); }
      }
      human.weapon = null;
      return;
    }
    const list = all ? this.inventory.slice() : this.equipped ? [this.equipped] : [];
    for (const item of list) { const i = this.inventory.indexOf(item); if (i >= 0) this.inventory.splice(i, 1); this._release(item, human, false); }
    this.current = Math.min(this.current, this.inventory.length - 1);
    if (!all) this.current = -1;
    this._sync();
  }
  onRespawn(oldP, newP) { this.current = -1; this.lastItem = null; this._sync(); }

  /** The hand holds what is selected, at once: for picking up, dropping, starting again. */
  _sync() {
    const p = this.game.player, e = this.equipped;
    this._cancelReload(p); p.swap = null;
    p.weapon = e;
    if (e) this.lastItem = e;
    if (e) e.holder = p;
    for (const it of this.inventory) if (it !== e) it.holder = p;
    this.game.ui?.weaponsChanged();
  }

  /* -------------------------------- attacking ----------------------------- */

  /** The player asks for an attack. `which` picks a move, or -1 for the next in the combo. */
  attack(which = -1) {
    const g = this.game, p = g.player, def = this.def;
    if (p.state !== ST.ANIM || !p.h.conscious || p.cuffed || p.cuffing) return false;
    if (def.gun) return this.fire();
    if (def.tool) return this.useCuffs();
    if (p.anim.busy) { if (which >= 0) this.choice = which; else this.queued = true; return false; }
    const usesRight = def.id !== 'fists';
    if (usesRight && !p.h.armOk(-1)) { g.ui?.toast('That arm is useless.'); return false; }
    if (g.time - this.lastAttack > 1.15) this.combo = 0;
    let idx = which >= 0 ? which : this.choice >= 0 ? this.choice : this.combo;
    this.choice = -1; this.queued = false;
    let name = def.moves[idx % 4];
    // a punch needs an arm, a kick needs two legs
    if (def.id === 'fists') {
      const ok = (n) => (CLIPS[n].limb === 'handL' ? p.h.armOk(1) : CLIPS[n].limb === 'handR' ? p.h.armOk(-1) : p.h.legOk(1) && p.h.legOk(-1));
      for (let k = 0; k < 4 && !ok(name); k++) { idx++; name = def.moves[idx % 4]; }
      if (!ok(name)) return false;
    }
    this.combo = (idx + 1) % 4;
    this.lastAttack = g.time;
    this.lastMove = CLIPS[name].label;
    this._swing(p, name, def);
    g.ui?.showMove(this.lastMove, idx % 4);
    return true;
  }

  /** Starts a swing for anyone, turning them a little toward whoever is in front of them. */
  _swing(human, name, def, aimAt = null) {
    const g = this.game, clip = CLIPS[name];
    // who are they trying to hit? the nearest person roughly ahead
    let target = aimAt, best = 9;
    const face = human.isPlayer ? g.camYaw : human.yaw;
    if (!target) {
      for (const o of g.humans) {
        if (o === human || o.removed) continue;
        const dx = o.x - human.x, dz = o.z - human.z, d = Math.hypot(dx, dz);
        if (d > 2.6) continue;
        const off = Math.abs(wrapAngle(Math.atan2(dx, dz) - face));
        if (off > 1.0) continue;
        const score = d + off * 1.2 + (o.h.alive ? 0 : 0.8);
        if (score < best) { best = score; target = o; }
      }
    }
    let low = 0, lunge = clip.lunge;
    if (target) {
      const dx = target.x - human.x, dz = target.z - human.z, d = Math.hypot(dx, dz);
      const yaw = Math.atan2(dx, dz);
      if (human.isPlayer) { g.camYaw += clamp(wrapAngle(yaw - g.camYaw), -0.35, 0.35) * 0.6; human.intent.face = yaw; } else human.intent.face = yaw;
      human.yaw += clamp(wrapAngle(yaw - human.yaw), -0.9, 0.9);
      const c = target.bodies[P.CHEST];
      // someone on the ground has to be reached down to
      low = clamp01((0.85 - (c.py - human.y)) / 0.6);
      // step in far enough for this particular move to connect
      lunge = clamp(d - clip.reach * human.scale, 0, 0.85);
    }
    human.lowAim = clip.limb === 'footR' ? 0 : low;
    human.lunge = lunge;
    human.guardT = 5;
    human.anim.play(name);
    const act = human.anim.action;
    act.def = def; act.hits = new Set(); act.prev = null; act.landed = 0;
    g.audio?.at(def.blade ? 'swish' : 'whoosh', human.x, human.y + 1.2, human.z, 0.5);
    g.minds?.witness({ kind: 'swing', actor: human, weapon: def.id, x: human.x, y: human.y + 1.2, z: human.z });
  }

  /** Someone who is not the player throws a punch. */
  npcAttack(human, target) {
    if (human.state !== ST.ANIM || human.anim.busy || human.cuffed || human.cuffing) return false;
    const def = WEAPONS.fists;
    const able = def.moves.filter((n) => (CLIPS[n].limb === 'handL' ? human.h.armOk(1) : CLIPS[n].limb === 'handR' ? human.h.armOk(-1) : human.h.legOk(1) && human.h.legOk(-1)));
    if (!able.length) return false;
    this._swing(human, able[(Math.random() * able.length) | 0], def, target);
    return true;
  }

  /** Where the striking surface is right now: writes n points into `out`, returns n. */
  _points(human, act, out) {
    const clip = act.clip, s = human.scale;
    if (clip.limb === 'handL' || clip.limb === 'handR') {
      const b = human.bodies[clip.limb === 'handL' ? P.HAND_L : P.HAND_R];
      b.toWorld(0, -0.045 * s, 0, _a); out[0] = _a[0]; out[1] = _a[1]; out[2] = _a[2];
      return 1;
    }
    if (clip.limb === 'footR') {
      const b = human.bodies[P.FOOT_R];
      b.toWorld(0, 0, 0.11 * s, _a); out[0] = _a[0]; out[1] = _a[1]; out[2] = _a[2];
      b.toWorld(0, 0.02 * s, 0, _a); out[3] = _a[0]; out[4] = _a[1]; out[5] = _a[2];
      return 2;
    }
    const b = human.bodies[P.HAND_R], bl = act.def.blade, dir = clip.reverse ? -1 : 1, n = bl[2];
    for (let i = 0; i < n; i++) {
      b.toWorld(0, -0.03 * s, dir * (bl[0] + bl[1] * (i / (n - 1))), _a);
      out[i * 3] = _a[0]; out[i * 3 + 1] = _a[1]; out[i * 3 + 2] = _a[2];
    }
    return n;
  }

  _melee(human, dt) {
    const g = this.game, act = human.anim.action;
    if (!act || !act.def) return;
    if (!human.anim.striking) { act.prev = null; return; }
    const pts = this._pts || (this._pts = new Float32Array(24));
    const n = this._points(human, act, pts);
    if (!act.prev) { act.prev = new Float32Array(24); act.prev.set(pts); return; }
    const clip = act.clip, def = act.def, prev = act.prev;
    const maxHits = def.blade ? 2 : 1;
    if (def.blade && human.weapon && human.weapon.bloody > 0.25 && chance(dt * 26 * human.weapon.bloody)) {
      const k = (n - 1) * 3, vx = (pts[k] - prev[k]) / dt, vy = (pts[k + 1] - prev[k + 1]) / dt, vz = (pts[k + 2] - prev[k + 2]) / dt;
      if (vx * vx + vy * vy + vz * vz > 16) g.gore.castOff(pts[k], pts[k + 1], pts[k + 2], vx, vy, vz, human.weapon.bloody);
    }
    // from the tip inward: the tip travels furthest and arrives first
    for (let k = n - 1; k >= 0 && act.landed < maxHits; k--) {
      const ox = prev[k * 3], oy = prev[k * 3 + 1], oz = prev[k * 3 + 2];
      let dx = pts[k * 3] - ox, dy = pts[k * 3 + 1] - oy, dz = pts[k * 3 + 2] - oz;
      const len = Math.hypot(dx, dy, dz);
      if (len < 0.004) continue;
      dx /= len; dy /= len; dz /= len;
      const hit = g.rayPeople(ox, oy, oz, dx, dy, dz, len + 0.03, human, def.blade ? 0.03 : 0.055);
      if (hit && !act.hits.has(hit.human)) {
        act.hits.add(hit.human); act.landed++;
        this._land(human, act, hit, ox + dx * hit.t, oy + dy * hit.t, oz + dz * hit.t, dx, dy, dz, len / dt);
        continue;
      }
      // crates and cars take the blow too
      if (act.hitThing) continue;
      for (const o of g.props) {
        if (o.kind !== 'crate') continue;
        const t = rayBody(o.body, ox, oy, oz, dx, dy, dz, len + 0.04, _hit, 0.03);
        if (t < 0) continue;
        act.hitThing = true;
        const J = (clip.limb === 'footR' ? 110 : def.blade ? 45 : 60) * clip.power;
        o.body.applyImpulse(dx * J, dy * J * 0.4 + J * 0.1, dz * J, ox + dx * t, oy + dy * t, oz + dz * t);
        g.audio?.at('crate', o.body.px, o.body.py, o.body.pz, 0.7);
        g.minds?.noise(o.body.px, o.body.py, o.body.pz, 68, 'crash', human);
        if (human.isPlayer) g.shake = Math.max(g.shake, 0.4);
        break;
      }
    }
    prev.set(pts);
  }

  _land(attacker, act, hit, px, py, pz, dx, dy, dz, speed) {
    const g = this.game, clip = act.clip, def = act.def, t = hit.human;
    const strength = (attacker.isPlayer ? 1.1 : 0.72) * clamp(0.6 + attacker.h.mobility * 0.4, 0.5, 1) * rand(0.9, 1.1);
    const power = clip.power * strength;
    let J = clip.kind === 'blunt' ? (clip.push ? 50 : 8 + clip.power * 18) : clip.kind === 'stab' ? 13 : def.chops ? 30 : 10;
    J *= strength;
    // a blow lands along the way the fist was travelling, biased the way the attacker faces
    const fx = Math.sin(attacker.yaw), fz = Math.cos(attacker.yaw);
    let ix = dx * 0.55 + fx * 0.45, iy = dy * 0.5, iz = dz * 0.55 + fz * 0.45;
    const l = Math.hypot(ix, iy, iz) || 1; ix /= l; iy /= l; iz /= l;
    const rep = t.hit({
      part: hit.part, type: clip.kind, power, point: [px, py, pz], dir: [ix, iy, iz], normal: hit.ln, impulse: J,
      lift: clip.up ? J * 0.9 : 0, chop: def.chops ? clip.chop || 1 : 0, attacker, weapon: def.id, through: 0.1,
    });
    const snd = clip.kind === 'blunt' ? 'punch' : clip.kind === 'stab' ? 'stab' : def.chops ? 'chop' : 'slash';
    g.audio?.at(snd, px, py, pz, clamp01(0.5 + power * 0.3));
    g.minds?.noise(px, py, pz, clip.kind === 'blunt' ? 72 : 66, 'blow', attacker);
    g.minds?.witness({ kind: 'attack', actor: attacker, victim: t, weapon: def.id, part: hit.part, x: px, y: py, z: pz, rep });
    if (def.blade && act.def === def) {
      const item = attacker.weapon;
      if (item) {
        item.bloody = Math.min(1, item.bloody + 0.34); this._paint(item);
        if (rep && !rep.stopped) g.gore.smear(item, 2 + (power > 1.3 ? 2 : 0), true);
      }
    }
    // and on the hand that held it
    if (rep && !rep.stopped && (rep.wound && rep.wound.bleed > 0.5 || clip.kind !== 'blunt') && !attacker.gone[P.HAND_R]) {
      const part = clip.limb === 'handL' ? P.HAND_L : clip.limb === 'footR' ? P.FOOT_R : P.HAND_R;
      if (!attacker.gone[part]) g.gore.mark(attacker, part, 'dot', [rand(-0.02, 0.02), rand(-0.04, 0.02), rand(-0.03, 0.03)], [chance(0.5) ? 1 : -1, 0, 0], rand(0.03, 0.06));
      attacker.bloodied = Math.min(1, attacker.bloodied + 0.04);
    }
    if (attacker.isPlayer) { g.shake = Math.max(g.shake, 0.35 + power * 0.25); g.ui?.hitMark(); }
    return rep;
  }

  /* ----------------------------------- guns ------------------------------- */

  reload() {
    const p = this.game.player, e = this.equipped;
    if (!e || !e.def.gun || p.weapon !== e || p.reload || p.swap || e.ammo >= e.def.mag) return;
    if (this.reloadFor(p)) this.game.ui?.toast('Reloading');
  }

  /** Anyone with a gun in their hand and a spare arm changes the magazine. */
  reloadFor(h) {
    const item = h.weapon;
    if (!item || !item.def.gun || h.reload || h.swap || h.state !== ST.ANIM || !h.h.armOk(-1) || h.cuffed) return false;
    this._dropWire(item);
    h.reload = { t: 0, dur: item.def.reload * (h.h.armOk(1) ? 1 : 1.8), item, kind: item.def.hold, out: false, grab: false, seated: false, racked: false, magIdx: -1 };
    return true;
  }
  _cancelReload(h) {
    const r = h.reload;
    if (!r) return;
    if (r.magIdx >= 0) this.game.boxes.release(r.magIdx);
    r.item.magOut = false; r.item.slide = 0;
    h.reload = null; h.handFull = 0;
  }

  /** One frame of whatever a person's hands are in the middle of. */
  _hands(h, dt) {
    const g = this.game, sw = h.swap;
    if (sw) {
      if (h.state !== ST.ANIM || !h.h.conscious) h.swap = null;
      else {
        sw.t += dt;
        const u = sw.t / sw.dur;
        sw.w = smooth(Math.min(u, 1 - u) * 3);
        if (!sw.done && u >= 0.5) {
          sw.done = true;
          h.weapon = sw.to && sw.to.holder === h ? sw.to : null;
          g.audio?.at('pickup', h.x, h.y + 1, h.z, 0.35);
          if (h.isPlayer) { g.ui?.weaponsChanged(); g.ui?.ammoChanged(); }
        }
        if (u >= 1) h.swap = null;
      }
    }
    const c = h.cuffing;
    if (c) {
      const t = c.target;
      if (h.state !== ST.ANIM || !h.h.conscious || t.removed || !t.h.alive || t.cuffed || Math.hypot(t.x - h.x, t.z - h.z) > 2.6 || t.gone[P.HAND_L] || t.gone[P.HAND_R]) h.cuffing = null;
      else {
        // the clock only runs while they are within arm's length
        if (Math.hypot(t.x - h.x, t.z - h.z) < 1.35) c.t += dt;
        c.low = t.state !== ST.ANIM;
        if (c.t >= c.dur) { h.cuffing = null; this._applyCuffs(h, t, c.item); }
      }
    }
    const r = h.reload;
    if (!r) return;
    const item = r.item, R = RELOAD[r.kind] || RELOAD.pistol;
    if (h.weapon !== item || h.state !== ST.ANIM || !h.h.conscious || !h.h.armOk(-1)) { this._cancelReload(h); return; }
    r.t += dt;
    const u = r.t / r.dur, hand = h.bodies[P.HAND_L];
    if (!r.out && u >= R.magOut) {
      r.out = true; item.magOut = true;
      this._dropMag(h, item);
      g.audio?.at('click', item.px, item.py, item.pz, 0.5);
    }
    if (!r.grab && u >= R.grab) {
      r.grab = true;
      if (h.h.armOk(1)) { h.handFull = 1; r.magIdx = g.boxes.alloc(); g.boxes.colorHex(r.magIdx, MAG); }
    }
    if (!r.seated && u >= R.magIn) {
      r.seated = true; item.magOut = false; item.ammo = item.def.mag; h.handFull = 0;
      if (r.magIdx >= 0) { g.boxes.release(r.magIdx); r.magIdx = -1; }
      g.audio?.at('reload', item.px, item.py, item.pz, 0.7);
      if (h.isPlayer) g.ui?.ammoChanged();
    }
    // the slide comes back with the hand, and goes forward on its own
    item.slide = u > R.rackA && u < R.rackB ? (u - R.rackA) / (R.rackB - R.rackA) : 0;
    if (!r.racked && u >= R.rackB) { r.racked = true; g.audio?.at('click', item.px, item.py, item.pz, 0.75); }
    if (r.magIdx >= 0) {
      const sz = item.def.magSize, s = h.scale;
      g.boxes.setOn(r.magIdx, hand.px, hand.py, hand.pz, hand.qx, hand.qy, hand.qz, hand.qw, -0.026 * s, -0.03 * s, 0.02 * s, sz[0] * 2, sz[2] * 2, sz[1] * 2);
    }
    if (u >= 1) { h.reload = null; h.handFull = 0; item.slide = 0; }
  }

  /** The empty magazine, on its way to the ground. */
  _dropMag(h, item) {
    const g = this.game, sz = item.def.magSize;
    this._trimCasings();
    rotv(item.q, 0, -0.12, 0, _a);
    const b = new Body({ hx: sz[0], hy: sz[1], hz: sz[2], mass: 0.12, x: item.px + _a[0], y: item.py + _a[1], z: item.pz + _a[2], kind: 'casing', friction: 0.7, bounce: 0.2, inertiaFloor: 0.0004, angDamp: 0.6, collides: false });
    b.qx = item.q[0]; b.qy = item.q[1]; b.qz = item.q[2]; b.qw = item.q[3];
    b.vx = h.vx + rand(-0.3, 0.3); b.vz = h.vz + rand(-0.3, 0.3); b.vy = -0.6;
    b.wx = rand(-4, 4); b.wz = rand(-4, 4);
    const island = new Island(null); island.add(b); g.world.addIsland(island);
    const idx = g.boxes.alloc(); g.boxes.colorHex(idx, MAG);
    this.casings.push({ body: b, island, idx, size: [sz[0] * 2, sz[1] * 2, sz[2] * 2] });
  }
  _trimCasings() {
    const g = this.game;
    while (this.casings.length > 44) { const o = this.casings.shift(); g.world.removeIsland(o.island); g.boxes.release(o.idx); }
  }

  /**
   * Somebody other than the player fires at something. `aim` is the point they
   * mean to hit; how near they come depends on range, nerves and how fast
   * they are shooting. Returns true if a round went off.
   */
  npcFire(h, aim, skill = 0.6) {
    const g = this.game, e = h.weapon;
    if (!e || !e.def.gun || e.cool > 0 || h.reload || h.swap || h.cuffed || h.cuffing || h.state !== ST.ANIM || !h.h.armOk(-1)) return false;
    const d = e.def;
    if (d.taser) {
      const m = e.muzzleWorld || [h.x, h.y + 1.4 * h.scale, h.z];
      let dx = aim[0] - m[0], dy = aim[1] - m[1], dz = aim[2] - m[2];
      const l = Math.hypot(dx, dy, dz) || 1, sp = 0.02 + (1 - skill) * 0.04;
      return this._taser(h, e, dx / l + rand(-sp, sp), dy / l + rand(-sp, sp), dz / l + rand(-sp, sp));
    }
    if (e.ammo <= 0) { g.audio?.at('click', h.x, h.y + 1.4, h.z, 0.5); e.cool = 0.4; this.reloadFor(h); return false; }
    e.ammo--; e.cool = d.gap * rand(2.2, 4.5);
    const m = e.muzzleWorld || [h.x, h.y + 1.4 * h.scale, h.z];
    let dx = aim[0] - m[0], dy = aim[1] - m[1], dz = aim[2] - m[2];
    let l = Math.hypot(dx, dy, dz) || 1;
    const sp = d.spread * 2 + (1 - skill) * 0.075 + (h.speed > 1 ? 0.03 : 0) + clamp01(h.h.pain / 90) * 0.05;
    dx = dx / l + rand(-sp, sp); dy = dy / l + rand(-sp, sp) * 0.7; dz = dz / l + rand(-sp, sp);
    l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    this._bullet(h, d, m[0], m[1], m[2], dx, dy, dz, d.power, 0);
    h.anim.recoil = 1;
    g.gore.puff('flash', m[0] + dx * 0.12, m[1] + dy * 0.12, m[2] + dz * 0.12, d.auto ? 0.5 : 0.36, 0.055, 1, 0.92, 0.7);
    g.gore.puff('smoke', m[0] + dx * 0.2, m[1] + dy * 0.2, m[2] + dz * 0.2, 0.22, 0.7, 0.75, 0.75, 0.75);
    this._casing(h, m, dx, dz);
    g.audio?.at(d.sound, m[0], m[1], m[2], 1);
    g.minds?.noise(m[0], m[1], m[2], d.loud, 'gunshot', h);
    g.minds?.witness({ kind: 'shot', actor: h, weapon: d.id, x: m[0], y: m[1], z: m[2] });
    return true;
  }

  /**
   * A taser. With its wires already in somebody, the trigger sends another
   * cycle down them; otherwise it fires a cartridge, and if the probes find a
   * person inside seven metres that person stops being in charge of their body.
   */
  _taser(h, e, dx, dy, dz) {
    const g = this.game, d = e.def, m = e.muzzleWorld || [h.x, h.y + 1.4 * h.scale, h.z];
    const w = e.wire;
    if (w && w.hit && w.target && !w.target.removed && w.life > 0) {
      w.zap = d.cycle; w.target.tase(d.cycle, h);
      e.cool = 0.6;
      g.audio?.at('taser', m[0], m[1], m[2], 0.9);
      g.minds?.noise(m[0], m[1], m[2], 80, 'crackle', h);
      return true;
    }
    if (e.ammo <= 0) { g.audio?.at('click', m[0], m[1], m[2], 0.6); e.cool = 0.3; this.reloadFor(h); return false; }
    e.ammo--; e.cool = d.gap;
    this._dropWire(e);
    let far = d.range;
    const wall = g.world.rayWorld(m[0], m[1], m[2], dx, dy, dz, far);
    if (wall >= 0) far = wall;
    const ph = g.rayPeople(m[0], m[1], m[2], dx, dy, dz, far, h, 0.04);
    h.anim.recoil = 0.35;
    g.audio?.at('tasershot', m[0], m[1], m[2], 0.9);
    g.gore.puff('smoke', m[0] + dx * 0.1, m[1] + dy * 0.1, m[2] + dz * 0.1, 0.12, 0.3, 0.8, 0.8, 0.75);
    g.minds?.noise(m[0], m[1], m[2], d.loud, 'crackle', h);
    const fx = g.gore.fx;
    if (ph) {
      const t = ph.human;
      // the probes skate off a helmet
      const stopped = ph.part === P.HEAD && t.helmet && !t.gone[P.HEAD];
      e.wire = { target: t, part: ph.part, lp: ph.lp.slice(), ln: ph.ln.slice(), life: stopped ? 0.5 : 24, zap: stopped ? 0 : d.cycle, hit: !stopped, q: [fx.alloc(), fx.alloc()], spark: 0, buzz: 0 };
      if (!stopped) {
        t.tase(d.cycle, h);
        g.minds?.witness({ kind: 'attack', actor: h, victim: t, weapon: 'taser', part: ph.part, x: t.x, y: t.y + 1.2, z: t.z, rep: null });
        if (h.isPlayer) g.ui?.hitMark();
      }
    } else {
      // a miss: the wires lie where they fell for a moment
      e.wire = { target: null, end: [m[0] + dx * far, m[1] + dy * far - 0.3, m[2] + dz * far], life: 0.6, zap: 0, hit: false, q: [fx.alloc(), fx.alloc()], spark: 0, buzz: 0 };
    }
    return true;
  }
  _dropWire(item) {
    const w = item.wire;
    if (!w) return;
    for (const q of w.q) this.game.gore.fx.release(q);
    item.wire = null;
  }

  /** The wires, drawn from muzzle to probes, and the current kept flowing while the cycle lasts. */
  _wires(it, dt) {
    const g = this.game, w = it.wire, h = it.holder, fx = g.gore.fx, cam = g.camera.position;
    w.life -= dt; w.zap -= dt;
    const t = w.target;
    if (w.life <= 0 || !h || h.weapon !== it || !it.muzzleWorld || (t && (t.removed || t.gone[w.part]))) { this._dropWire(it); return; }
    const m = it.muzzleWorld;
    let ex, ey, ez;
    if (t) { t.bodies[w.part].toWorld(w.lp[0], w.lp[1], w.lp[2], _a); ex = _a[0]; ey = _a[1]; ez = _a[2]; } else { ex = w.end[0]; ey = w.end[1]; ez = w.end[2]; }
    const len = Math.hypot(ex - m[0], ey - m[1], ez - m[2]);
    if (len > it.def.range + 2.5) { this._dropWire(it); return; }
    const live = w.zap > 0 && t;
    for (let k = 0; k < 2; k++) {
      // two wires, a hand's width apart where they land
      const o = (k ? 0.045 : -0.045), q = w.q[k];
      if (q < 0) continue;
      const bx = ex + o * (ez - m[2]) / (len || 1), by = ey + (k ? 0.03 : -0.03), bz = ez - o * (ex - m[0]) / (len || 1);
      const dx = bx - m[0], dy = by - m[1], dz = bz - m[2];
      const vx = cam.x - m[0], vy = cam.y - m[1], vz = cam.z - m[2];
      let sx = dy * vz - dz * vy, sy = dz * vx - dx * vz, sz = dx * vy - dy * vx;
      const sl = Math.hypot(sx, sy, sz) || 1, wd = 0.004 + 0.0012 * Math.hypot(vx, vy, vz);
      sx = sx / sl * wd; sy = sy / sl * wd; sz = sz / sl * wd;
      fx.corners(q, m[0] - sx, m[1] - sy, m[2] - sz, bx - sx, by - sy, bz - sz, bx + sx, by + sy, bz + sz, m[0] + sx, m[1] + sy, m[2] + sz);
      const uvw = WHITE_UV();
      fx.uvRect(q, uvw[0], uvw[1], uvw[2], uvw[3]);
      const f = live ? 0.75 + 0.25 * Math.sin(g.time * 90 + k) : 0.5;
      fx.tint(q, live ? 0.75 : 0.5, live ? 0.9 : 0.52, live ? 1 : 0.56, f);
    }
    if (live) {
      t.tased = Math.max(t.tased, Math.min(w.zap, 0.3));
      w.spark -= dt; w.buzz -= dt;
      if (w.spark <= 0) { w.spark = 0.07; g.gore.puff('flash', ex + rand(-0.05, 0.05), ey + rand(-0.05, 0.05), ez + rand(-0.05, 0.05), rand(0.05, 0.11), 0.05, 0.7, 0.88, 1); }
      if (w.buzz <= 0) { w.buzz = 0.42; g.audio?.at('taser', ex, ey, ez, 0.85); g.minds?.noise(ex, ey, ez, 78, 'crackle', h); }
    }
  }

  fire() {
    const g = this.game, p = g.player, e = this.equipped;
    if (!e || !e.def.gun || this.cool > 0 || p.reload || p.swap || p.weapon !== e || p.cuffed || p.cuffing) return false;
    if (!p.h.armOk(-1)) return false;
    if (e.def.taser) {
      if (e.cool > 0) return false;
      const a = g.aim, m = e.muzzleWorld || [p.x, p.y + 1.4, p.z];
      // toward whatever the crosshair is on, as with any gun
      let far = 40;
      const wl = g.world.rayWorld(a.ox, a.oy, a.oz, a.dx, a.dy, a.dz, far); if (wl >= 0) far = wl;
      const hp = g.rayPeople(a.ox, a.oy, a.oz, a.dx, a.dy, a.dz, far, p, 0.03); if (hp) far = hp.t;
      let dx = a.ox + a.dx * far - m[0], dy = a.oy + a.dy * far - m[1], dz = a.oz + a.dz * far - m[2];
      const l = Math.hypot(dx, dy, dz) || 1;
      if (l < 0.6) { dx = a.dx; dy = a.dy; dz = a.dz; } else { dx /= l; dy /= l; dz /= l; }
      const ok = this._taser(p, e, dx, dy, dz);
      this.cool = e.cool;
      g.ui?.ammoChanged();
      return ok;
    }
    const d = e.def;
    if (e.ammo <= 0) { g.audio?.play('click', 0.6); this.cool = 0.25; this.reload(); return false; }
    e.ammo--; this.cool = d.gap; this.heat = Math.min(1, this.heat + (d.auto ? 0.13 : 0.3));
    // from the muzzle toward whatever the crosshair is on
    const a = g.aim;
    let far = 220;
    const w = g.world.rayWorld(a.ox, a.oy, a.oz, a.dx, a.dy, a.dz, far);
    if (w >= 0) far = w;
    const ph = g.rayPeople(a.ox, a.oy, a.oz, a.dx, a.dy, a.dz, far, p, 0.02);
    if (ph) far = ph.t;
    for (const o of g.props) { const t = rayBody(o.body, a.ox, a.oy, a.oz, a.dx, a.dy, a.dz, far, null); if (t >= 0 && t < far) far = t; }
    const tx = a.ox + a.dx * far, ty = a.oy + a.dy * far, tz = a.oz + a.dz * far;
    const m = e.muzzleWorld || [p.x, p.y + 1.4, p.z];
    let dx = tx - m[0], dy = ty - m[1], dz = tz - m[2];
    let l = Math.hypot(dx, dy, dz) || 1;
    // something right in front of the barrel: shoot where the camera looks
    if (l < 0.7) { dx = a.dx; dy = a.dy; dz = a.dz; l = 1; }
    const sp = d.spread * (1 + this.heat * 2.2) * (p.speed > 2 ? 1.8 : 1) * (p.crouching ? 0.6 : 1);
    dx = dx / l + rand(-sp, sp); dy = dy / l + rand(-sp, sp); dz = dz / l + rand(-sp, sp);
    l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    this._bullet(p, d, m[0], m[1], m[2], dx, dy, dz, d.power, 0);

    // what the shooter feels and sees
    p.anim.recoil = 1;
    g.camPitch += d.kick * rand(0.8, 1.2); g.camYaw += d.kick * rand(-0.45, 0.45);
    g.shake = Math.max(g.shake, d.auto ? 0.45 : 0.6);
    g.gore.puff('flash', m[0] + dx * 0.12, m[1] + dy * 0.12, m[2] + dz * 0.12, d.auto ? 0.5 : 0.36, 0.055, 1, 0.92, 0.7);
    g.gore.puff('smoke', m[0] + dx * 0.2, m[1] + dy * 0.2, m[2] + dz * 0.2, 0.22, 0.7, 0.75, 0.75, 0.75);
    this._casing(p, m, dx, dz);
    g.audio?.play(d.sound, 1);
    g.minds?.noise(m[0], m[1], m[2], d.loud, 'gunshot', p);
    g.minds?.witness({ kind: 'shot', actor: p, weapon: d.id, x: m[0], y: m[1], z: m[2] });
    g.ui?.ammoChanged();
    return true;
  }

  /** Follows one round until it stops. */
  _bullet(shooter, d, ox, oy, oz, dx, dy, dz, power, depth) {
    const g = this.game;
    let far = 240, what = 0, prop = null, car = null;
    const wn = this._wn || (this._wn = [0, 1, 0]);
    const w = g.world.rayWorld(ox, oy, oz, dx, dy, dz, far, wn);
    if (w >= 0) { far = w; what = 1; }
    const nx = wn[0], ny = wn[1], nz = wn[2];
    for (const o of g.props) {
      const t = rayBody(o.body, ox, oy, oz, dx, dy, dz, far, _hit);
      if (t >= 0 && t < far) { far = t; what = 2; prop = o; _c[0] = _hit[3]; _c[1] = _hit[4]; _c[2] = _hit[5]; _b[0] = _hit[0]; _b[1] = _hit[1]; _b[2] = _hit[2]; }
    }
    if (g.traffic) for (const c of g.traffic.cars) {
      const t = rayBody(c.body, ox, oy, oz, dx, dy, dz, far, _hit);
      if (t >= 0 && t < far) { far = t; what = 3; car = c; _c[0] = _hit[3]; _c[1] = _hit[4]; _c[2] = _hit[5]; _b[0] = _hit[0]; _b[1] = _hit[1]; _b[2] = _hit[2]; }
    }
    const ph = g.rayPeople(ox, oy, oz, dx, dy, dz, far, depth === 0 ? shooter : null, 0.012);
    if (ph) { far = ph.t; what = 4; }
    const hx = ox + dx * far, hy = oy + dy * far, hz = oz + dz * far;
    if (depth === 0) this.tracers.push({ ax: ox, ay: oy, az: oz, bx: hx, by: hy, bz: hz, t: 0, q: g.gore.fx.alloc() });

    if (what === 4) {
      const t = ph.human, limb = ph.part >= P.UARM_L;
      const rep = t.hit({ part: ph.part, type: 'bullet', power, point: [hx, hy, hz], dir: [dx, dy, dz], normal: ph.ln, impulse: d.impulse * power / d.power, through: ph.exit, hp: d.hp * power / d.power, attacker: shooter, weapon: d.id });
      g.audio?.at('flesh', hx, hy, hz, 0.8);
      if (depth === 0 && far < 1.5 && shooter.weapon && rep && !rep.stopped) g.gore.smear(shooter.weapon, far < 0.8 ? 2 : 1);
      g.minds?.witness({ kind: 'attack', actor: shooter, victim: t, weapon: d.id, part: ph.part, x: hx, y: hy, z: hz, rep });
      if (shooter.isPlayer) g.ui?.hitMark();
      // out the other side, and on
      const goes = rep ? rep.through : true;
      if (goes && depth < 2 && (d.pierce || limb)) {
        const e = ph.exit + 0.02;
        this._bullet(shooter, d, hx + dx * e, hy + dy * e, hz + dz * e, dx + rand(-0.03, 0.03), dy + rand(-0.03, 0.03), dz + rand(-0.03, 0.03), power * (d.pierce ? 0.62 : 0.4), depth + 1);
      }
      return;
    }
    if (what === 1) {
      g.gore.hole(hx, hy, hz, nx, ny, nz, false);
      g.gore.puff('smoke', hx + nx * 0.05, hy + ny * 0.05, hz + nz * 0.05, 0.3, 0.45, 0.8, 0.78, 0.74);
      g.audio?.at(chance(0.3) ? 'ricochet' : 'impact', hx, hy, hz, 0.7);
      g.minds?.noise(hx, hy, hz, 84, 'impact', shooter);
    } else if (what === 2) {
      const b = prop.body;
      b.applyImpulse(dx * 24, dy * 24, dz * 24, hx, hy, hz);
      g.gore.puff('smoke', hx, hy, hz, 0.28, 0.4, 0.7, 0.6, 0.45);
      const dcl = g.gore._attach(b, g.gore._onFace(b, [_b[0], _b[1], _b[2]], [_c[0], _c[1], _c[2]], 0.12, 0.12, rand(6.28)), HOLE_UV(), null, -1);
      if (dcl) dcl.stain = true;
      g.audio?.at('crate', hx, hy, hz, 0.6);
    } else if (what === 3) {
      const b = car.body;
      const dcl = g.gore._attach(b, g.gore._onFace(b, [_b[0], _b[1], _b[2]], [_c[0], _c[1], _c[2]], 0.13, 0.13, rand(6.28)), HOLE_UV(), null, -1);
      if (dcl) dcl.stain = true;
      g.gore.puff('flash', hx, hy, hz, 0.22, 0.07, 1, 0.9, 0.6);
      g.audio?.at('ricochet', hx, hy, hz, 0.8);
      g.traffic.shotAt(car, shooter);
    }
  }

  _casing(p, m, dx, dz) {
    const g = this.game;
    this._trimCasings();
    const b = new Body({ hx: 0.006, hy: 0.006, hz: 0.014, mass: 0.02, x: m[0] - dx * 0.2, y: m[1] + 0.02, z: m[2] - dz * 0.2, kind: 'casing', friction: 0.6, bounce: 0.3, inertiaFloor: 0.00002, angDamp: 0.4, collides: false });
    // out to the right, up and a little back
    b.vx = -dz * rand(1.6, 2.4) + p.vx; b.vz = dx * rand(1.6, 2.4) + p.vz; b.vy = rand(2, 3);
    b.wx = rand(-30, 30); b.wz = rand(-30, 30);
    const island = new Island(null); island.add(b); g.world.addIsland(island);
    const idx = g.boxes.alloc(); g.boxes.colorHex(idx, 0xc9a13c);
    this.casings.push({ body: b, island, idx });
  }

  /* ---------------------------------- frame ------------------------------- */

  update(dt) {
    const g = this.game, p = g.player, inp = g.input;
    this.cool = Math.max(0, this.cool - dt);
    this.heat = Math.max(0, this.heat - dt * 1.6);
    for (const it of this.items) if (it.cool > 0) it.cool -= dt;
    for (const h of g.humans) if (h.swap || h.reload || h.cuffing) this._hands(h, dt);
    // the player's hands
    if (g.doctor == null && p.state === ST.ANIM) {
      const def = this.def;
      if (p.swap) { this.queued = false; this.choice = -1; }
      else if (def.gun) { if (def.auto ? inp.down.attack : inp.pressed.attack) this.fire(); }
      else if (inp.pressed.attack) this.attack(-1);
      else if (inp.pressed.alt) this.attack(3);
      else if ((this.queued || this.choice >= 0) && !p.anim.busy) this.attack(-1);
      if (inp.pressed.reload) this.reload();
      if (inp.pressed.use) this.pickUp();
      if (inp.pressed.drop && !p.cuffed) this.drop();
      if (inp.pressed.holster && !p.cuffed) this.holster();
    }
    if (!p.anim.action) p.lowAim = 0;
    // every swing in progress, the player's and everybody else's
    for (const h of g.humans) if (h.anim.action && h.state === ST.ANIM) this._melee(h, dt);

    // what is lying within reach?
    let near = null, nd = 1.9;
    if (p.state === ST.ANIM) for (const it of this.items) {
      if (it.body) {
        const d = Math.hypot(it.body.px - p.x, it.body.pz - p.z);
        if (d < nd && Math.abs(it.body.py - p.y) < 1.6) { nd = d; near = it; }
      } else if (it.holder && it.holder !== p && !it.holder.removed && (!it.holder.h.alive || !it.holder.h.conscious) && !it.def.wear) {
        // still on somebody who is past minding
        const d = Math.hypot(it.px - p.x, it.pz - p.z) + 0.3;
        if (d < nd && Math.abs(it.py - p.y) < 1.6) { nd = d; near = it; }
      }
    }
    // or somebody in handcuffs, who could be let out of them
    let nc = null;
    if (!near && p.state === ST.ANIM && !p.cuffed) { let bd = 1.5; for (const o of g.humans) { if (o === p || !o.cuffed || o.removed) continue; const d = Math.hypot(o.x - p.x, o.z - p.z); if (d < bd) { bd = d; nc = o; } } }
    if (near !== this.near || nc !== this.nearCuffed) { this.near = near; this.nearCuffed = nc; g.ui?.nearChanged(); }
  }

  /** A bracelet on each wrist and a link of chain between them. */
  _drawCuffs(it) {
    const bx = this.game.boxes, t = it.wornBy, s = t.scale;
    const L = t.bodies[P.FARM_L], R = t.bodies[P.FARM_R];
    if (t.removed || t.gone[P.FARM_L] || t.gone[P.FARM_R]) { for (const i of it.inst) bx.hide(i); it.shown = false; return; }
    it.shown = true;
    const z = 0.1 * s, y = -0.118 * s;
    bx.setOn(it.inst[0], L.px, L.py, L.pz, L.qx, L.qy, L.qz, L.qw, 0, y, 0, z, 0.028 * s, z);
    bx.setOn(it.inst[1], R.px, R.py, R.pz, R.qx, R.qy, R.qz, R.qw, 0, y, 0, z, 0.028 * s, z);
    bx.hide(it.inst[3]); bx.hide(it.inst[4]);
    // the chain: a thin box from one wrist to the other, its long side turned along the line between them
    L.toWorld(0, y, 0, _a); R.toWorld(0, y, 0, _b);
    const dx = _b[0] - _a[0], dy = _b[1] - _a[1], dz = _b[2] - _a[2], len = Math.hypot(dx, dy, dz) || 1e-4;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    // the turn that takes +X to (ux,uy,uz)
    let qx = 0, qy = -uz, qz = uy, qw = 1 + ux;
    const ql = Math.hypot(qy, qz, qw);
    if (ql < 1e-5) { qy = 1; qz = 0; qw = 0; } else { qy /= ql; qz /= ql; qw /= ql; }
    bx.set(it.inst[2], (_a[0] + _b[0]) / 2, (_a[1] + _b[1]) / 2, (_a[2] + _b[2]) / 2, qx, qy, qz, qw, len, 0.012 * s, 0.012 * s);
    it.px = (_a[0] + _b[0]) / 2; it.py = (_a[1] + _b[1]) / 2; it.pz = (_a[2] + _b[2]) / 2;
  }

  /** After physics: put every weapon where it now is. */
  late(dt) {
    const g = this.game, bx = g.boxes, p = g.player;
    for (const it of this.items) {
      const d = it.def, h = it.holder;
      let px = it.px, py = it.py, pz = it.pz, qx = 0, qy = 0, qz = 0, qw = 1, show = true;
      if (it.wire) this._wires(it, dt);
      if (it.wornBy) { this._drawCuffs(it); continue; }
      if (it.body) {
        const b = it.body;
        qx = b.qx; qy = b.qy; qz = b.qz; qw = b.qw;
        // the box round a weapon is centred on its middle, the model on its grip
        b.toWorld(0, 0, -d.centre, _a); px = _a[0]; py = _a[1]; pz = _a[2];
        if (b.py < -10) { b.teleport(p.x, 2, p.z); b.vx = b.vy = b.vz = 0; }
      } else if (h && !h.removed && h.weapon === it && !h.gone[P.HAND_R] && h.attached[P.HAND_R]) {
        // in the hand, lying in the curl of the fingers
        const hand = h.bodies[P.HAND_R], s = h.scale;
        if (d.gun && h.state === ST.ANIM) {
          // a gun points where its owner is looking, whatever the wrist is doing
          const yaw = h.isPlayer ? g.camYaw : h.aimYaw ?? h.yaw;
          const rw = h.anim.reloadW, R = RELOAD[d.hold], low = h.isPlayer ? 0 : h.gunLow || 0;
          const pitch = (h.isPlayer ? g.camPitch : h.aimPitch || 0) * (1 - rw) * (1 - low) + h.anim.recoil * 0.12 + R.tilt * rw - low * 0.9;
          const roll = R.roll * rw;
          const sy = Math.sin(yaw / 2), cy = Math.cos(yaw / 2), sx = Math.sin(-pitch / 2), cx = Math.cos(-pitch / 2);
          qx = cy * sx; qy = sy * cx; qz = -sy * sx; qw = cy * cx;
          if (roll) { const sr = Math.sin(roll / 2), cr = Math.cos(roll / 2); const ax = qx * cr + qy * sr, ay = qy * cr - qx * sr, az = qz * cr + qw * sr, aw = qw * cr - qz * sr; qx = ax; qy = ay; qz = az; qw = aw; }
          it.q[0] = qx; it.q[1] = qy; it.q[2] = qz; it.q[3] = qw;
          rotv(it.q, d.grip[0], d.grip[1], d.grip[2], _a);
          hand.toWorld(0.016 * s, -0.03 * s, 0.01, _b);
          px = _b[0] - _a[0]; py = _b[1] - _a[1]; pz = _b[2] - _a[2];
          rotv(it.q, d.muzzle[0], d.muzzle[1], d.muzzle[2], _a);
          it.muzzleWorld = [px + _a[0], py + _a[1], pz + _a[2]];
        } else {
          const act = h.anim.action, rev = act && act.clip.reverse;
          hand.toWorld(0.016 * s, -0.03 * s, 0, _a); px = _a[0]; py = _a[1]; pz = _a[2];
          // a reversed grip is the hand's rotation followed by half a turn about its own Y
          if (rev) { qx = -hand.qz; qy = hand.qw; qz = hand.qx; qw = -hand.qy; }
          else { qx = hand.qx; qy = hand.qy; qz = hand.qz; qw = hand.qw; }
          it.q[0] = qx; it.q[1] = qy; it.q[2] = qz; it.q[3] = qw;
        }
      } else if (h && !h.removed && h.weapon !== it && MOUNT[it.type]) {
        // put away: on the hip, in its sheath, across the back
        const m = MOUNT[it.type], b = h.bodies[m.part], s = h.scale;
        if (h.gone[m.part]) show = false;
        else {
          b.toWorld(m.pos[0] * s, m.pos[1] * s, m.pos[2] * s, _a); px = _a[0]; py = _a[1]; pz = _a[2];
          const ax = m.q[0], ay = m.q[1], az = m.q[2], aw = m.q[3];
          qx = b.qw * ax + b.qx * aw + b.qy * az - b.qz * ay;
          qy = b.qw * ay - b.qx * az + b.qy * aw + b.qz * ax;
          qz = b.qw * az + b.qx * ay - b.qy * ax + b.qz * aw;
          qw = b.qw * aw - b.qx * ax - b.qy * ay - b.qz * az;
          it.q[0] = qx; it.q[1] = qy; it.q[2] = qz; it.q[3] = qw;
        }
      } else show = false;
      it.px = px; it.py = py; it.pz = pz;
      if (it.body) { it.q[0] = qx; it.q[1] = qy; it.q[2] = qz; it.q[3] = qw; }
      it.shown = show;
      for (let i = 0; i < d.boxes.length; i++) {
        const b = d.boxes[i];
        if (!show || (b[9] && it.magOut)) { bx.hide(it.inst[i]); continue; }
        // the slide, or the bolt handle, comes back when it is worked
        const back = it.slide && i === d.slide ? it.slide * 0.034 : 0;
        bx.setOn(it.inst[i], px, py, pz, qx, qy, qz, qw, b[0], b[1], b[2] - back, b[3], b[4], b[5], b[7] || null);
      }
    }
    for (const o of this.casings) { const b = o.body, z = o.size; bx.set(o.idx, b.px, b.py, b.pz, b.qx, b.qy, b.qz, b.qw, z ? z[0] : 0.012, z ? z[1] : 0.012, z ? z[2] : 0.028); }
    // tracers: a streak that lasts a blink
    const fx = g.gore.fx, cam = g.camera.position;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t += dt;
      if (t.t > 0.07 || t.q < 0) { fx.release(t.q); this.tracers.splice(i, 1); continue; }
      const dx = t.bx - t.ax, dy = t.by - t.ay, dz = t.bz - t.az;
      const vx = cam.x - t.ax, vy = cam.y - t.ay, vz = cam.z - t.az;
      let sx = dy * vz - dz * vy, sy = dz * vx - dx * vz, sz = dx * vy - dy * vx;
      const sl = Math.hypot(sx, sy, sz) || 1, wd = 0.012 + 0.0025 * Math.hypot(vx, vy, vz);
      sx = sx / sl * wd; sy = sy / sl * wd; sz = sz / sl * wd;
      fx.corners(t.q, t.ax - sx, t.ay - sy, t.az - sz, t.bx - sx, t.by - sy, t.bz - sz, t.bx + sx, t.by + sy, t.bz + sz, t.ax + sx, t.ay + sy, t.az + sz);
      const uvw = WHITE_UV();
      fx.uvRect(t.q, uvw[0], uvw[1], uvw[2], uvw[3]);
      fx.tint(t.q, 1, 0.93, 0.7, 0.75 * (1 - t.t / 0.07));
    }
  }
}

/**
 * One flat-sided piece of a weapon, for blood to stick to. It answers the same
 * questions a physics body does about where its own points are in the world,
 * from wherever the weapon was last drawn: in a hand, on a hip, on the ground.
 */
class Surface {
  constructor(item, b) {
    this.item = item;
    this.ox = b[0]; this.oy = b[1]; this.oz = b[2];
    this.hx = b[3] / 2; this.hy = b[4] / 2; this.hz = b[5] / 2;
    this.island = null;
  }
  toWorld(x, y, z, out) {
    const it = this.item;
    rotv(it.q, this.ox + x, this.oy + y, this.oz + z, out);
    out[0] += it.px; out[1] += it.py; out[2] += it.pz;
    return out;
  }
  toLocal(x, y, z, out) {
    const it = this.item, q = it.q;
    _iq[0] = -q[0]; _iq[1] = -q[1]; _iq[2] = -q[2]; _iq[3] = q[3];
    rotv(_iq, x - it.px, y - it.py, z - it.pz, out);
    out[0] -= this.ox; out[1] -= this.oy; out[2] -= this.oz;
    return out;
  }
}
const _iq = [0, 0, 0, 1];

let _hole = null, _white = null;
function HOLE_UV() { return _hole || (_hole = cellUV(DECAL.hole[0], DECAL.hole[1], ATLAS_COLS, ATLAS_ROWS)); }
function WHITE_UV() { return _white || (_white = cellUV(DECAL.white[0], DECAL.white[1], ATLAS_COLS, ATLAS_ROWS, 0.03)); }

function rotv(q, x, y, z, out) {
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  out[0] = x + qw * tx + (qy * tz - qz * ty); out[1] = y + qw * ty + (qz * tx - qx * tz); out[2] = z + qw * tz + (qx * ty - qy * tx);
  return out;
}
