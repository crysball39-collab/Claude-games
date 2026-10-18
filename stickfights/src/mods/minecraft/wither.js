/* =============================================================================
   MINECRAFT - the Wither: a boss, with a bar along the top and 600 health.

   It is a stickman underneath - so everything in the game can hit it - with
   no mind of its own: its species does all its thinking, and moves its
   joints to where its parts really are (head the middle skull, handA and
   handB the side ones, neck the bar of bone, chest the ribs, hip the bottom
   of the spine, footA the end of the tail). Nothing knocks it down, nothing
   cuts anything off it, and nobody picks it up.

     coming out    out of the totem's blast, glowing blue, untouchable for a
                   moment
     phase 1       up in the air, out of reach of anything without a gun or a
                   bow: the middle head spits black skulls at its target,
                   the side heads at whoever else is about, and every so
                   often a slow blue skull, which is far worse
     half way      it stops, shakes, glows, goes off like a bomb - and comes
                   out of it in Wither Armour, with wither skeletons standing
                   up out of soul fire around it
     phase 2       armour: arrows and bullets bounce off. It comes down low,
                   where a sword can reach it, and charges at people,
                   ramming through them; more skeletons now and then
     dying         it roars, shakes, glows white - and explodes, and where it
                   was there is a Nether Star

   Everything it does withers whoever it catches. It mends itself, slowly,
   all the time.
   ========================================================================== */
import { Health } from '../../game/health.js';
import { defineArm } from '../../game/props.js';
import { BONES } from '../../game/skeleton.js';
import { clamp, rand, chance, sign, smooth } from '../../core/util.js';
import { witherSkin } from './look.js';
import { MOD, SkullShot, explode, wither, undead, puffs } from './effects.js';
import { spawnSkeleton, WITHER_SKELETON } from './skeleton.js';
import { spawnStar } from './blocks.js';
import './clips.js';

export const MAX_HP = 600;
const SCALE = 2.4;           // (its bones are thick: what hits it uses the scale)
const HIGH = 2.5, LOW = 0.5; // where the end of its tail hangs, before and after half way

// (an explosion throws people itself: the blow it lands is not much of a shove on top)
defineArm('mcBlast', { name: 'An explosion', cause: 'an explosion', shove: 0.5, nasty: 3, memory: 'hurtMe', hurt: 'mcBlownUp', verb: 'blew me up' });
defineArm('witherRam', {
  name: 'The Wither', noun: 'Wither', cause: 'the Wither', shove: 2.4, nasty: 3, memory: 'hurtMe', hurt: 'mcRammed', verb: 'rammed into me', power: 3,
});

const NOTHING = { damage: 0, wound: false, broke: null, ko: false, fatal: false };

/**
 * The Wither's health: one pool, 600 of it. Whatever hurts it takes from the
 * pool - nothing bleeds, breaks or comes off - and it never dies of it here:
 * the species sees the pool empty and does the dying itself.
 */
class BossHealth extends Health {
  constructor(max) {
    super(0.9);
    this.bossMax = max;
    this.bossHp = max;
    this.shield = 0;      // seconds left of nothing getting through
  }
  hit(part, amount) {
    if (this.shield > 0 || this.bossHp <= 0) return NOTHING;
    const d = Math.max(0, amount);
    this.bossHp = Math.max(0, this.bossHp - d);
    return { damage: d, wound: false, broke: null, ko: false, fatal: false };
  }
  update(dt) {
    this.time += dt;
    if (this.shield > 0) this.shield -= dt;
    return false;
  }
  get overall() { return this.bossHp / this.bossMax; }
  heal() { super.heal(); this.bossHp = this.bossMax; }
  conditions() { return []; }
}

/* ------------------------------- what it does ------------------------------- */

const alive = (p) => p && !p.removed && !p.dead;

/** Who it goes after: the nearest of the living - unless someone has just hurt it. */
function pickTarget(man) {
  const sb = man.sandbox, mc = man.mc, now = sb.time;
  let best = null, bs = -Infinity;
  for (const p of sb.people) {
    if (p === man || !alive(p) || undead(p)) continue;
    const d = Math.hypot(p.pos.x - man.pos.x, p.pos.y - man.pos.y);
    if (d > 32) continue;
    const hurt = mc.hurtBy.get(p);
    const s = -d + (hurt !== undefined && now - hurt < 8 ? 9 : 0) + (p === mc.target ? 3 : 0);
    if (s > bs) { bs = s; best = p; }
  }
  return best;
}

/** Someone for a side head to look at: anyone else alive nearby - or, now and then, the target again. */
function pickOther(man, main) {
  const near = man.sandbox.people.filter((p) => p !== man && p !== main && alive(p) && !undead(p) && Math.abs(p.pos.x - man.pos.x) < 18);
  if (near.length && chance(0.75)) return near[Math.floor(Math.random() * near.length)];
  return chance(0.4) ? main : null;
}

/** A skull out of a mouth (from: the head's centre), at someone - led a little, if they are moving. */
function shoot(man, from, target, blue) {
  const sb = man.sandbox;
  if (!target || !alive(target)) return false;
  const tp = target.lying ? target.wj.hip : target.wj.chest;
  const speed = blue ? 5.5 : 10;
  const d0 = Math.hypot(tp.x - from.x, tp.y - from.y) || 1;
  const lead = (target.vel ? target.vel.x : 0) * (d0 / speed) * 0.5;
  // not a perfect shot: there is room to get out of the way
  const a = Math.atan2(tp.y - from.y, tp.x + lead - from.x) + (Math.random() - 0.5) * (blue ? 0.12 : 0.24);
  const ux = Math.cos(a), uy = Math.sin(a);
  sb.effects.push(new SkullShot(sb, man, from.x + ux * 0.36, from.y + uy * 0.36, ux * speed, uy * speed, blue));
  sb.emit('witherShoot', { who: man, x: from.x, y: from.y, blue });
  return true;
}

/** Wither skeletons, up out of soul fire on either side of it (as many as there is room for). */
function summon(man, n) {
  const sb = man.sandbox;
  const out = sb.people.filter((p) => p.species === WITHER_SKELETON && alive(p)).length;
  let made = 0;
  for (let i = 0; i < n && out + made < 5; i++) {
    const side = i % 2 ? -1 : 1;
    const x = clamp(man.pos.x + side * rand(1.3, 3.2), sb.left + 0.6, sb.right - 0.6);
    if (spawnSkeleton(sb, x, man)) made++;
  }
  return made > 0;
}

/** Charges at someone: a wind-up, a rush that rams through anyone in the way, and a moment to recover. */
function startDash(man, o) {
  const mc = man.mc;
  if (mc.dash || !alive(o)) return false;
  mc.dash = { phase: 'wind', t: 0, hit: new Set(), target: o };
  man.sandbox.emit('witherDashWind', { who: man, x: man.pos.x, y: man.wj.chest.y });
  return true;
}

function updateDash(man, dt) {
  const mc = man.mc, D = mc.dash, sb = man.sandbox, j = man.wj;
  D.t += dt;
  if (D.phase === 'wind') {
    mc.shake = 0.7;
    man.vel.x *= Math.exp(-dt * 6);
    man.vel.y *= Math.exp(-dt * 6);
    if (D.t > 0.55) {
      const o = alive(D.target) ? D.target : mc.target;
      const tp = o ? o.wj.chest : { x: man.pos.x + man.facing * 6, y: 1 };
      const dx = tp.x - j.chest.x, dy = tp.y - j.chest.y, d = Math.hypot(dx, dy) || 1;
      man.vel.x = (dx / d) * 13;
      man.vel.y = (dy / d) * 13;
      man.facing = sign(dx);
      D.phase = 'go';
      D.t = 0;
      sb.emit('witherDash', { who: man, x: j.chest.x, y: j.chest.y });
    }
  } else if (D.phase === 'go') {
    mc.shake = 0.2;
    if (man.pos.y < 0.15 && man.vel.y < 0) man.vel.y = 0;
    // anyone it goes through
    for (const p of sb.people) {
      if (p === man || !alive(p) || undead(p) || D.hit.has(p)) continue;
      let best = null;
      for (const at of [j.chest, j.neck, j.head]) {
        const n = p.nearestPart(at.x, at.y);
        if (n && (!best || n.d < best.d)) best = n;
      }
      if (!best || best.d > 0.75) continue;
      D.hit.add(p);
      p.takeHit({ by: man, part: best.part, x: best.x, y: best.y, dir: sign(man.vel.x), power: 2.2, kind: 'impact', weapon: 'witherRam', bone: p.boneName(best.bone, best.t) });
      if (p.removed) continue;
      wither(p, 5, 1, man);
      if (p.alive && p.state !== 'held') p.launch(sign(man.vel.x) * 4.5, 2.6);
      sb.emit('witherRamHit', { who: p, by: man, x: best.x, y: best.y });
    }
    const wall = man.pos.x < sb.left + 1.3 || man.pos.x > sb.right - 1.3;
    if (D.t > 0.65 || wall) { D.phase = 'recover'; D.t = 0; man.vel.x *= 0.3; man.vel.y *= 0.3; }
  } else if (D.t > 0.5) {
    mc.shake = 0;
    mc.dash = null;
    mc.dashT = rand(6.5, 9.5);
  }
}

/* ---------------------------------- states ----------------------------------- */

function fight(man, dt) {
  const mc = man.mc, sb = man.sandbox, j = man.wj;
  if ((mc.retargetT -= dt) <= 0 || !alive(mc.target)) { mc.target = pickTarget(man); mc.retargetT = 2.5; }
  const o = mc.target;
  if (mc.dash) { updateDash(man, dt); return; }
  if (!o) return;
  if ((mc.shootT -= dt) <= 0) {
    shoot(man, j.head, o, false);
    mc.shootT = mc.phase === 1 ? rand(2.2, 3) : rand(1.7, 2.3);
  }
  if ((mc.sideT -= dt) <= 0) {
    const side = chance(0.5) ? 'A' : 'B', from = j['hand' + side];
    const other = pickOther(man, o);
    if (other && shoot(man, from, other, false)) mc.headLook[side] = sign(other.pos.x - from.x);
    mc.sideT = rand(4, 5.5);
  }
  if ((mc.blueT -= dt) <= 0) {
    shoot(man, j.head, o, true);
    mc.blueT = rand(9, 13);
  }
  if (mc.phase === 2) {
    if ((mc.dashT -= dt) <= 0 && Math.abs(o.pos.x - man.pos.x) < 12) startDash(man, o);
    if ((mc.summonT -= dt) <= 0) {
      const out = sb.people.filter((p) => p.species === WITHER_SKELETON && alive(p)).length;
      if (out < 3) summon(man, 2);
      mc.summonT = rand(20, 28);
    }
  }
}

/** Half way: it stops, shakes, glows - a blast - and it is in armour, with skeletons around it. */
function change(man) {
  const mc = man.mc, sb = man.sandbox, h = man.health, j = man.wj;
  const k = clamp(mc.t / 1.2, 0, 1);
  mc.shake = 0.9;
  mc.glow = mc.armored ? Math.max(0, 1 - (mc.t - 1.2) / 1.2) : smooth(k) * 0.8;
  mc.glowColor = '#bfe0ff';
  h.shield = 0.3;
  man.vel.x *= 0.9;
  man.vel.y *= 0.9;
  if (!mc.armored && mc.t > 1.2) {
    mc.armored = true;
    explode(sb, j.chest.x, j.chest.y, man, 1.3, { wither: 5, spare: man });
    summon(man, 3);
    sb.emit('witherArmor', { who: man, x: j.chest.x, y: j.chest.y });
  }
  if (mc.t > 2.4) {
    mc.state = 'fight';
    mc.phase = 2;
    mc.glow = 0;
    mc.shake = 0;
    mc.dashT = 2.5;
    mc.summonT = rand(20, 28);
    mc.t = 0;
  }
}

/** Out of health: a roar, shaking harder and harder, white - and gone in a blast, leaving a Nether Star. */
function dying(man) {
  const mc = man.mc, sb = man.sandbox, j = man.wj;
  const k = clamp(mc.t / 2.6, 0, 1);
  mc.shake = 0.3 + smooth(k) * 1.4;
  mc.glow = smooth(k);
  mc.glowColor = '#ffffff';
  man.vel.x *= 0.9;
  man.vel.y = 0.15;
  if (!mc.roared) {
    mc.roared = true;
    sb.emit('witherRoar', { who: man, x: j.chest.x, y: j.chest.y });
  }
  if (mc.t >= 2.6 && !mc.burst) {
    mc.burst = true;
    const x = j.chest.x, y = j.chest.y;
    explode(sb, x, y, man, 2.4, { spare: man });
    puffs(sb, { x, y, n: 30, speed: 4.5, size: 0.35, grow: 0.5, life: 1.3, colors: ['#ffffff', '#efefef', '#d8d8d8'], spread: 0.8 });
    spawnStar(sb, x, y);
    const by = mc.lastBy && !mc.lastBy.removed ? mc.lastBy : null;
    // (it is gone after this step: everyone who saw it go is told now)
    sb.emit('death', { who: man, by, cause: 'slain', silent: true });
    sb.emit('witherDeath', { who: man, by, x, y });
    // (out of the world after this step, not in the middle of it)
    sb.effects.push({ mod: MOD, update: () => { sb.remove(man); return false; } });
  }
}

/** What it is up to, in words, for the inspector. */
function doing(man) {
  const mc = man.mc, o = mc.target && alive(mc.target) ? mc.target : null;
  switch (mc.state) {
    case 'emerge': return 'Coming out of the blast';
    case 'change': return 'Its armour is coming up';
    case 'dying': return 'Roaring - it is about to go';
    default:
      if (mc.dash) return mc.dash.phase === 'wind' ? `About to charge at ${o ? o.name : 'someone'}` : `Charging${o ? ' at ' + o.name : ''}`;
      return o ? `Spitting skulls at ${o.name}` : 'Looking for something alive';
  }
}

/* ---------------------------------- species ---------------------------------- */

export const WITHER = {
  mod: MOD,
  kind: 'wither',
  label: 'Boss',
  skin: witherSkin,
  mindless: true,
  steadfast: true,
  monster: true,
  undead: true,
  tireless: true,
  mute: true,
  noPickup: true,
  // (how much of a fight it looks to anyone sizing it up: plenty, but not hopeless)
  power: 2.2,
  speed: 1,
  fall: 0,

  init(man) {
    man.health = new BossHealth(MAX_HP);
    man.tint = ['#3a3a3a', '#1e1e1e'];
    man.gravity = 0;
    man.mc = {
      phase: 1, state: 'emerge', t: 0, armored: false, glow: 1, glowColor: '#8fb8ff', shake: 0.5,
      target: null, retargetT: 0, shootT: 2, sideT: 3.2, blueT: rand(8, 12), dashT: 4, dash: null, summonT: 25,
      headLook: { A: 1, B: -1 }, lastBy: null, hurtBy: new Map(), bob: rand(0, 6), roared: false, burst: false,
    };
  },

  spawned(man) {
    man.setState('air');
    man.onGround = false;
    man.anim.play('witherFloat');
    man.health.shield = 1.3;
  },

  update(man, dt) {
    const mc = man.mc, h = man.health;
    if (!mc || man.removed || mc.burst) return;
    mc.t += dt;
    if (man.state !== 'air') man.setState('air');
    if (h.bossHp <= 0 && mc.state !== 'dying') { mc.state = 'dying'; mc.t = 0; mc.dash = null; h.shield = 99; }
    switch (mc.state) {
      case 'emerge':
        mc.glow = Math.max(0, 1 - mc.t / 1.3);
        mc.shake = Math.max(0, 0.5 - mc.t * 0.4);
        if (mc.t > 1.3) { mc.state = 'fight'; mc.t = 0; mc.glow = 0; mc.shake = 0; }
        break;
      case 'fight':
        if (mc.phase === 1 && h.bossHp <= h.bossMax / 2) { mc.state = 'change'; mc.t = 0; mc.dash = null; break; }
        fight(man, dt);
        break;
      case 'change': change(man); break;
      case 'dying': dying(man); break;
    }
    // it mends, all the time (after it has seen where its health is: half way stays half way)
    if (mc.state !== 'dying') h.bossHp = Math.min(h.bossMax, h.bossHp + dt);
  },

  /** How it moves: hanging high (or, armoured, low), off to one side of its target, bobbing. */
  air(man, dt) {
    const mc = man.mc, sb = man.sandbox, t = sb.time;
    if (!mc) return true;
    man.anim.play('witherFloat', { blend: 0.2 });
    man.anim.setOverlay(null);
    if (mc.dash && mc.dash.phase === 'go') return true;
    const o = mc.target && alive(mc.target) ? mc.target : null;
    const low = mc.phase === 2;
    let tx = man.pos.x, ty = low ? LOW : HIGH;
    const still = mc.state !== 'fight' || mc.dash;
    if (!still && o) {
      const side = sign(man.pos.x - o.pos.x) || 1;
      tx = o.pos.x + side * (low ? 3 : 5.2) + Math.sin(t * 0.35 + mc.bob) * 1.5;
    }
    ty += Math.sin(t * 1.3 + mc.bob) * (low ? 0.12 : 0.3);
    if (still) { tx = man.pos.x; ty = man.pos.y; }
    tx = clamp(tx, sb.left + 1.3, sb.right - 1.3);
    const max = low ? 4.4 : 3.6, k = 1 - Math.exp(-dt * 1.8);
    man.vel.x += (clamp((tx - man.pos.x) * 1.2, -max, max) - man.vel.x) * k;
    man.vel.y += (clamp((ty - man.pos.y) * 1.6, -max, max) - man.vel.y) * k;
    if (o && !mc.dash) man.facing = sign(o.pos.x - man.pos.x) || man.facing;
    return true;
  },

  touchDown() { return true; },

  /** Its joints, where its parts are. */
  pose(man) {
    const j = man.wj, p = man.pos, f = man.facing, mc = man.mc;
    const t = man.sandbox.time;
    const sway = Math.sin(t * 2 + (mc ? mc.bob : 0)) * 0.12;
    const set = (k, x, y) => { j[k].x = x; j[k].y = y; };
    set('footA', p.x - f * (0.24 + sway * 0.5), p.y);
    set('kneeA', p.x - f * (0.3 + sway), p.y + 0.3);
    set('hip', p.x - f * 0.05, p.y + 0.62);
    set('chest', p.x, p.y + 1.05);
    set('neck', p.x, p.y + 1.47);
    set('shoulder', p.x, p.y + 1.47);
    set('head', p.x, p.y + 1.88);
    const bob = Math.sin(t * 3.1) * 0.03;
    set('elbowA', p.x + 0.45, p.y + 1.47);
    set('handA', p.x + 0.78, p.y + 1.72 + bob);
    set('elbowB', p.x - 0.45, p.y + 1.47);
    set('handB', p.x - 0.78, p.y + 1.72 - bob);
    for (const s of ['B']) { set('knee' + s, j.kneeA.x, j.kneeA.y); set('foot' + s, j.footA.x, j.footA.y); }
    set('toeA', j.footA.x, j.footA.y);
    set('toeB', j.footA.x, j.footA.y);
    // leaning into a charge, or back from it
    const lean = mc && mc.dash ? (mc.dash.phase === 'wind' ? -0.22 : mc.dash.phase === 'go' ? 0.3 : 0) * f : 0;
    if (lean) {
      const c = Math.cos(-lean), s = Math.sin(-lean), o = j.hip;
      for (const k of ['footA', 'kneeA', 'chest', 'neck', 'shoulder', 'head', 'elbowA', 'handA', 'elbowB', 'handB', 'kneeB', 'footB', 'toeA', 'toeB']) {
        const dx = j[k].x - o.x, dy = j[k].y - o.y;
        j[k].x = o.x + dx * c - dy * s;
        j[k].y = o.y + dx * s + dy * c;
      }
    }
    for (const b of BONES) {
      if (!b[4]) continue;
      j[b[4]].x = (j[b[0]].x + j[b[1]].x) / 2;
      j[b[4]].y = (j[b[0]].y + j[b[1]].y) / 2;
    }
    j.headAngle = 0;
  },

  proxy(man) { return { x: man.pos.x, y: man.pos.y + 1.2, w: 0.9, h: 1.9 }; },

  /** Who is hurting it; and, in armour, what does not get through. */
  armor(man, h, part, weapon) {
    const mc = man.mc;
    // its own skeletons do not hurt it
    if (h.by && h.by !== man && undead(h.by)) return 0;
    if (mc && h.by && h.by !== man) {
      mc.lastBy = h.by;
      mc.hurtBy.set(h.by, man.sandbox.time);
    }
    if (WITHER.deflects(man, weapon)) {
      if (h.x !== undefined) man.sandbox.fx.sparks(h.x, h.y, 4);
      man.sandbox.emit('armorDeflect', { who: man, x: h.x, y: h.y, weapon });
      return 0;
    }
    return 1;
  },

  /** Past half way, its armour sends back what is shot at it. */
  deflects(man, weapon) {
    return !!(man.mc && man.mc.armored) && (weapon === 'arrow' || weapon === 'bullet' || weapon === 'rail');
  },

  hostileTo(man, o) { return !man.dead && !(man.mc && man.mc.burst) && !!o && !undead(o); },

  /** Up in the air it is out of reach of anything that cannot shoot (or fly); armoured and low, it is not. */
  reachable(man) { return man.pos.y < 1.2; },

  bossbar(man) {
    const h = man.health, mc = man.mc;
    if (!h || !mc || mc.burst) return null;
    return {
      name: man.name, frac: h.bossHp / h.bossMax, color: '#b23cd1', armored: mc.armored,
      note: mc.armored ? 'Wither Armour' : '', text: `${Math.ceil(h.bossHp)} / ${h.bossMax}`,
    };
  },

  inspect(man) {
    const h = man.health, mc = man.mc;
    const out = man.sandbox.people.filter((p) => p.species === WITHER_SKELETON && alive(p)).length;
    return {
      mood: mc.state === 'dying' ? 'Dying' : mc.phase === 2 ? 'Enraged' : 'Hostile',
      doing: doing(man),
      dead: mc.burst,
      bars: [{ label: 'Health', frac: h.bossHp / h.bossMax, color: '#b23cd1', text: `${Math.ceil(h.bossHp)} / ${h.bossMax}` }],
      lines: [
        mc.phase === 2
          ? { text: 'Phase 2: in Wither Armour. Arrows and bullets bounce off it; it comes down low, and charges', bad: true }
          : { text: 'Phase 1: up out of reach, spitting skulls. At half its health its armour comes up' },
        { text: 'Everything it does withers whoever it catches', bad: true },
        { text: 'It mends itself: 1 health a second' },
        { text: out ? `Wither skeletons out: ${out}` : 'No wither skeletons out' },
      ],
    };
  },

  abilities(man) {
    const mc = man.mc;
    if (!mc || mc.state === 'dying' || mc.burst) return null;
    const o = () => (alive(mc.target) ? mc.target : (mc.target = pickTarget(man)));
    return [
      { id: 'black', label: 'Black skull', group: 'do', on: false, pick: () => shoot(man, man.wj.head, o(), false) },
      { id: 'blue', label: 'Blue skull', group: 'do', on: false, pick: () => shoot(man, man.wj.head, o(), true) },
      { id: 'dash', label: 'Charge', group: 'do', on: !!mc.dash, pick: () => (mc.phase === 2 && mc.state === 'fight' ? startDash(man, o()) : false) },
      { id: 'summon', label: 'Summon skeletons', group: 'do', on: false, pick: () => summon(man, 2) },
      {
        id: 'phase', label: 'Phase 2', group: 'do', on: mc.phase === 2,
        pick: () => {
          if (mc.phase !== 1 || mc.state !== 'fight') return false;
          man.health.bossHp = Math.min(man.health.bossHp, man.health.bossMax / 2);
          return true;
        },
      },
    ];
  },

  /** Everyone's first sight of it (its own kind excepted). */
  metBy(me, brain, r) {
    if (undead(brain.man)) { r.like = Math.max(r.like, 0.5); return; }
    const T = brain.traits;
    r.fear = Math.max(r.fear, 0.6 * (1.25 - T.bravery));
    brain.emo.bump('fear', 0.3 * (1.2 - T.bravery));
    brain.emo.bump('surprise', 0.5);
    brain.speak('seeWither', { other: me.name }, 0.9, me, true);
  },

  healed(man) {
    const mc = man.mc;
    if (!mc || mc.burst) return;
    mc.state = 'fight';
    mc.phase = 1;
    mc.armored = false;
    mc.dash = null;
    mc.glow = 0;
    mc.shake = 0;
  },
};

/** The Wither, at x - out of a totem's blast. */
export function spawnWither(sb, x, y = 1) {
  const n = sb.people.filter((p) => p.species === WITHER).length;
  const man = sb.spawnStickman(x, Math.max(0.6, y), {
    name: n ? `Wither ${n + 1}` : 'Wither', species: WITHER, scale: SCALE, airborne: true, hair: 'none', voice: 0.4, strength: 2,
    traits: { bravery: 1, aggression: 1, temper: 1, empathy: 0, sociability: 0, curiosity: 0, toughness: 1, skill: 0.8 },
    look: { key: 'wither' },
  });
  if (!man) return null;
  sb.emit('witherSpawn', { who: man, x, y });
  return man;
}

export const isWither = (p) => !!(p && p.species === WITHER);
