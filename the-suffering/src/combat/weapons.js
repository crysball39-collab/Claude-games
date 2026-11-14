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
import { Body, Island, rayBody } from '../physics/world.js';
import { CLIPS, MOVES, RELOAD } from '../human/anim.js';
import { ST } from '../human/human.js';
import { P } from '../human/rig.js';
import { groundHeight, KERB } from '../world/city.js';
import { rgb } from '../render/boxes.js';
import { cellUV } from '../render/quads.js';
import { DECAL, ATLAS_COLS, ATLAS_ROWS } from '../render/textures.js';
import { clamp, clamp01, lerp, smooth, rand, chance, wrapAngle } from '../core/util.js';

const STEEL = 0xc3c8cc, DARK = 0x26282c, WOOD = 0x7a4a26, GRIP = 0x3a2a1c, VEST = 0x121316, MAG = 0x15161a;
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
  /* not a weapon, but it is picked up and dropped like one */
  vest: {
    id: 'vest', name: 'Light vest', wear: true, mass: 2.4, half: [0.2, 0.06, 0.25], centre: 0,
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
    this._paint(item);
    this.items.push(item);
    return item;
  }

  /** Puts a weapon straight on to somebody: in its holster, or in the hand. */
  give(human, type, inHand = false) {
    if (!WEAPONS[type] || type === 'fists' || WEAPONS[type].wear) return null;
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
    if (human.reload && human.reload.magIdx >= 0) this.game.boxes.release(human.reload.magIdx);
    human.reload = null; human.swap = null;
  }

  remove(item) {
    this._offGround(item);
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
    if (!item || item.holder === p) return false;
    if (item.def.wear) {
      if (p.vest) { g.ui?.toast('You are already wearing one.'); return false; }
      this.remove(item);
      p.wearVest();
      g.audio?.play('pickup', 0.5);
      g.ui?.toast('Light vest on');
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

  /** Takes off the vest and leaves it at the player's feet. */
  shedVest() {
    const p = this.game.player;
    if (!p.vest || p.state !== ST.ANIM) return;
    p.removeVest();
    this.spawn('vest', p.x + Math.sin(p.yaw) * 0.5, p.y + 1.0, p.z + Math.cos(p.yaw) * 0.5);
    this.game.ui?.toast('Vest off');
    this.game.ui?.weaponsChanged();
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
    const it = item || kit.find((x) => x.def.gun) || kit[0];
    if (!it || h.weapon === it || h.swap || h.state !== ST.ANIM || !h.h.armOk(-1)) return false;
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
    if (p.state !== ST.ANIM || !p.h.conscious) return false;
    if (def.gun) return this.fire();
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
    if (human.state !== ST.ANIM || human.anim.busy) return false;
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
      if (item) { item.bloody = Math.min(1, item.bloody + 0.34); this._paint(item); }
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
    if (!item || !item.def.gun || h.reload || h.swap || h.state !== ST.ANIM || !h.h.armOk(-1)) return false;
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
    if (!e || !e.def.gun || e.cool > 0 || h.reload || h.swap || h.state !== ST.ANIM || !h.h.armOk(-1)) return false;
    const d = e.def;
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

  fire() {
    const g = this.game, p = g.player, e = this.equipped;
    if (!e || !e.def.gun || this.cool > 0 || p.reload || p.swap || p.weapon !== e) return false;
    if (!p.h.armOk(-1)) return false;
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
    for (const h of g.humans) if (h.swap || h.reload) this._hands(h, dt);
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
      if (inp.pressed.drop) this.drop();
      if (inp.pressed.holster) this.holster();
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
    if (near !== this.near) { this.near = near; g.ui?.nearChanged(); }
  }

  /** After physics: put every weapon where it now is. */
  late(dt) {
    const g = this.game, bx = g.boxes, p = g.player;
    for (const it of this.items) {
      const d = it.def, h = it.holder;
      let px = it.px, py = it.py, pz = it.pz, qx = 0, qy = 0, qz = 0, qw = 1, show = true;
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
      } else if (h && !h.removed && h.weapon !== it) {
        // put away: on the hip, in its sheath, across the back
        const m = MOUNT[it.type], b = h.bodies[m.part], s = h.scale;
        if (!m || h.gone[m.part]) show = false;
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

let _hole = null, _white = null;
function HOLE_UV() { return _hole || (_hole = cellUV(DECAL.hole[0], DECAL.hole[1], ATLAS_COLS, ATLAS_ROWS)); }
function WHITE_UV() { return _white || (_white = cellUV(DECAL.white[0], DECAL.white[1], ATLAS_COLS, ATLAS_ROWS, 0.03)); }

function rotv(q, x, y, z, out) {
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  out[0] = x + qw * tx + (qy * tz - qz * ty); out[1] = y + qw * ty + (qz * tx - qx * tz); out[2] = z + qw * tz + (qx * ty - qy * tx);
  return out;
}
