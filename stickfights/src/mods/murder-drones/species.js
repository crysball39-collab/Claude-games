/* =============================================================================
   MURDER DRONES - what a drone is to the game: a species, with a hook into
   each part of a stickman's life (see game/stickman.js) that it does its own
   way.

   Two kinds:

     worker drone       small and plucky, built for work, not for fighting.
                        Bleeds oil. Nanite acid is the end of them.
     disassembly drone  built to take worker drones apart: twice as hard to
                        hurt, quicker and stronger than anyone, falls from any
                        height and lands on one knee, mends itself - even
                        grows back what was cut off. Wings to fly with, a tail
                        with a needle full of nanite acid, and hands that turn
                        into whatever the job needs:

          chainsaw  shoved in and held there, biting again and again
          gunArm    a gun: quick bursts
          sword     long reach, cuts deep, takes limbs off
          claw      three blades: quick slashes, three wounds at a time
          laser     a beam that burns whatever it stays on
          missile   a salvo of three little homing missiles

   Everything a drone has that a stickman does not lives in man.md:
     wing   { open, target, flap, thrust }       how far out the wings are
     tail   { phase, t, target, root, ctrl, tip } where the tail is, and what it is doing
     form, formT, formLock, morphing             their hands, how far changed, and a lock from the inspector
     flight { mode: 'crash' | 'swoop', ... }     while they are flying
   ========================================================================== */
import { defineArm } from '../../game/props.js';
import { BONE_PART } from '../../game/health.js';
import { clamp, lerp, rand, chance, sign, smooth, moveToward } from '../../core/util.js';
import { droneSkin, idleTail, spineFrame, FORM_REACH, OIL } from './look.js';
import { Beam, Missile, Acid, Cracks } from './effects.js';

/* ------------------------------ what hands do ------------------------------ */

export const FORMS = ['chainsaw', 'gunArm', 'sword', 'claw', 'laser', 'missile'];
export const FORM_NAMES = { chainsaw: 'Chainsaw', gunArm: 'Gun', sword: 'Sword', claw: 'Claws', laser: 'Laser', missile: 'Missiles' };
export const MELEE = new Set(['sword', 'claw', 'chainsaw']);
export const RANGED = new Set(['gunArm', 'laser', 'missile']);

defineArm('sword', {
  name: 'Sword hands', noun: 'sword', wound: 'Sword', cause: 'a sword wound', blade: true, sharp: 1, mult: 1.35, deep: ['stab', 'chop'], chop: true, gash: 1, sever: 1.6,
  shove: 0.75, spray: 1.4, scary: 0.55, fear: 'droneArmFear', nasty: 3, memory: 'choppedMe', hurt: 'swordHit', seen: 'sawDroneHit', verb: 'cut me with a sword for a hand', power: 2.4, r: 0.05,
});
defineArm('claw', {
  name: 'Claw hands', noun: 'claw', wound: 'Claw', cause: 'claw wounds', blade: true, sharp: 1, mult: 1.1, deep: ['stab'], chop: true, gash: 3, sever: 0,
  shove: 0.6, spray: 1.2, scary: 0.5, fear: 'droneArmFear', nasty: 2.8, memory: 'cutMe', hurt: 'clawed', seen: 'sawDroneHit', verb: 'clawed me', power: 2.2, r: 0.05,
});
defineArm('chainsaw', {
  name: 'Chainsaw hands', noun: 'chainsaw', wound: 'Chainsaw', cause: 'a chainsaw', blade: true, sharp: 1, mult: 0.9, deep: ['saw'], chop: true, gash: 1, sever: 2.2,
  shove: 0.3, spray: 1.8, scary: 0.7, fear: 'droneArmFear', nasty: 3, memory: 'choppedMe', hurt: 'sawed', seen: 'sawDroneHit', verb: 'went at me with a chainsaw', power: 2.6, r: 0.06,
});
defineArm('gunArm', { name: 'Gun hands', noun: 'gun', scary: 0.6, fear: 'droneArmFear', power: 2.8 });
defineArm('laser', {
  name: 'Laser hands', noun: 'laser', wound: 'Laser', cause: 'laser burns', burn: true, scary: 0.6, fear: 'droneArmFear', nasty: 3, memory: 'shotMe', hurt: 'burned', seen: 'sawDroneHit', verb: 'burned me with a laser', power: 2.8,
});
defineArm('missile', { name: 'Missile hands', noun: 'missile launcher', scary: 0.7, fear: 'droneArmFear', power: 3 });
// and what they do that is not a hand
defineArm('blast', { name: 'An explosion', cause: 'an explosion', shove: 2.2, nasty: 3, memory: 'hurtMe', hurt: 'blownUp', verb: 'blew me up' });
defineArm('needle', {
  name: 'A tail', noun: 'tail', cause: 'a tail through them', blade: true, sharp: 1, deep: ['tail'], shove: 0.4, nasty: 3, memory: 'stabbedMe', hurt: 'tailStabbed', seen: 'sawTailHit', verb: 'stabbed me with their tail', power: 2,
});

const REACH = { sword: 1.25, claw: 0.95, chainsaw: 1.05 };
const STRIKES = { sword: [['chop', 5], ['hack', 3], ['stab', 3]], claw: [['slash', 5], ['stab', 2.5]], chainsaw: [['saw', 6], ['hack', 2]] };
const INNATE = { sword: 'sword', claw: 'claw', chainsaw: 'chainsaw', gunArm: 'gunArm', laser: 'laser', missile: 'missile' };
const LIMB_BONES = { armA: ['humerusA', 'forearmA'], armB: ['humerusB', 'forearmB'], legA: ['femurA', 'tibiaA'], legB: ['femurB', 'tibiaB'] };

function gauss() { return (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 1.73; }

/** Where a hand that is a weapon fires from: the end of whatever it has become. */
export function muzzle(man) {
  const e = man.wj.elbowA, h = man.wj.handA;
  const d = Math.hypot(h.x - e.x, h.y - e.y) || 1;
  const ux = (h.x - e.x) / d, uy = (h.y - e.y) / d;
  const L = (FORM_REACH[man.md.form] || 0.2) * man.scale;
  return { x: h.x + ux * L, y: h.y + uy * L, a: Math.atan2(uy, ux) };
}

/** Changes their hands into something else (null: back into hands). Not mid-swing: then, as soon as they can. */
export function morph(man, form) {
  const md = man.md;
  if (!md || (md.form === form && !md.morphing)) return true;
  if (md.morphing || !man.ready) { md.wantForm = form === null ? 'hands' : form; return false; }
  md.morphing = true;
  md.morphTo = form;
  md.lastMorph = man.sandbox.time;
  md.wantForm = null;
  man.anim.act('morph', { fadeIn: 0.06, fadeOut: 0.12 });
  return true;
}

function finishMorph(man) {
  const md = man.md;
  if (!md.morphing) return;
  md.morphing = false;
  md.form = md.morphTo || null;
  md.formT = 0;
  man.innate = md.form ? INNATE[md.form] : null;
  md.missiles = 3;
  man.sandbox.emit('morph', { who: man, form: md.form, x: man.wj.handA.x, y: man.wj.handA.y });
  man.sandbox.fx.sparks(man.wj.handA.x, man.wj.handA.y, 5);
  if (md.form && man.brain) man.brain.speak('morph', { what: FORM_NAMES[md.form].toLowerCase() }, 0.45, null, false);
}

/** Up off the ground and at them (or at a spot), wings out. */
export function swoop(man, target, x = null) {
  if (!man.ready || man.carrying || man.health.legsBroken || !man.look.wings) return false;
  const md = man.md;
  const tx = target ? target.pos.x : x;
  if (tx === null || tx === undefined) return false;
  const dir = sign(tx - man.pos.x) || man.facing;
  man.setState('air');
  man.onGround = false;
  man.support = null;
  man.vel.x = dir * 5;
  man.vel.y = 6.5;
  man.facing = dir;
  md.flight = { mode: 'swoop', target: target || null, x: tx, y: target ? target.pos.y : 0, t: 0 };
  md.swoopT = man.sandbox.time;
  man.sandbox.emit('takeoff', { who: man, x: man.pos.x, y: man.pos.y });
  if (man.brain) man.brain.speak('swoop', { other: target ? target.name : '' }, 0.5, target, true);
  return true;
}

/** A stab of the tail, over the shoulder, at someone close. */
export function tailStab(man, target) {
  const md = man.md, now = man.sandbox.time;
  if (!man.look.tail || !md || (md.tail && md.tail.phase !== 'idle') || now - (md.tailCool ?? -99) < 3.2 || !man.ready) return false;
  if (target) man.faceTo(target.pos.x);
  md.tail = { ...(md.tail || {}), phase: 'coil', t: 0, target: target || null, hit: false };
  md.tailCool = now;
  man.anim.act('tailStrike', { fadeIn: 0.05, fadeOut: 0.15 });
  man.sandbox.emit('tailStrike', { who: man, x: man.wj.hip.x, y: man.wj.hip.y });
  if (man.brain) man.brain.speak('tailStab', { other: target ? target.name : '' }, 0.4, target, true);
  return true;
}

/** Whoever is close in front of them, for the inspector's buttons. */
function nearestInFront(man, max) {
  let best = null, bd = max;
  for (const o of man.sandbox.people) {
    if (o === man || o.removed || o.dead) continue;
    const d = Math.abs(o.pos.x - man.pos.x);
    if (d < bd && Math.abs(o.pos.y - man.pos.y) < 1.5) { bd = d; best = o; }
  }
  return best;
}

/* ------------------------------- the tail ---------------------------------- */

function updateTail(man, dt) {
  const md = man.md, j = man.wj, s = man.scale, sb = man.sandbox;
  const f = man.rag ? man.rag.facing : man.facing;
  const idle = idleTail(j, f, s, sb.time, man.seed);
  const tl = md.tail || (md.tail = { phase: 'idle', t: 0 });
  tl.t += dt;
  if (tl.phase === 'idle' || man.rag || !man.conscious || man.state !== 'stand') {
    if (tl.phase !== 'idle') tl.phase = 'idle';
    tl.root = idle.root; tl.ctrl = idle.ctrl; tl.tip = idle.tip;
    return;
  }
  const { u, back } = spineFrame(j, f);
  const root = idle.root;
  const over = { x: j.shoulder.x + u.x * 0.6 * s + back.x * 0.12 * s, y: j.shoulder.y + u.y * 0.6 * s + back.y * 0.12 * s };
  const overCtrl = { x: root.x + back.x * 0.55 * s + u.x * 0.55 * s, y: root.y + back.y * 0.55 * s + u.y * 0.55 * s };
  const o = tl.target && !tl.target.removed ? tl.target : null;
  const aim = o ? (o.lying ? o.wj.hip : o.wj.chest) : { x: j.chest.x + f * 1.3 * s, y: j.chest.y };
  const dx = aim.x - root.x, dy = aim.y - root.y, dd = Math.hypot(dx, dy) || 1, reach = 1.6 * s;
  const tgt = dd > reach ? { x: root.x + (dx / dd) * reach, y: root.y + (dy / dd) * reach } : { x: aim.x, y: aim.y };
  const L = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
  tl.root = root;
  if (tl.phase === 'coil') {
    const k = smooth(Math.min(1, tl.t / 0.22));
    tl.tip = L(idle.tip, over, k);
    tl.ctrl = L(idle.ctrl, overCtrl, k);
    if (tl.t >= 0.22) { tl.phase = 'strike'; tl.t = 0; }
  } else if (tl.phase === 'strike') {
    const k = smooth(Math.min(1, tl.t / 0.11));
    tl.tip = L(over, tgt, k);
    tl.ctrl = L(overCtrl, { x: (root.x + tgt.x) / 2 + u.x * 0.55 * s, y: (root.y + tgt.y) / 2 + u.y * 0.55 * s }, k);
    if (tl.t >= 0.11) {
      tl.phase = 'hold';
      tl.t = 0;
      if (o && !tl.hit) {
        const hit = o.touch(tgt.x, tgt.y, 0.1 * s);
        if (hit) {
          tl.hit = true;
          o.takeHit({ by: man, part: hit.part, x: hit.x, y: hit.y, dir: f, power: 1.6, kind: 'tail', weapon: 'needle', deep: true, bone: o.boneName(hit.bone, hit.t) });
          // in goes the acid - a disassembly drone shrugs it off as often as not
          if (!o.removed && !(o.species && o.species.kind === 'disassembly' && chance(0.5))) o.afflictions.push(new Acid(o, hit.part, hit.bone, hit.t, man));
          sb.emit('tailHit', { who: o, by: man, x: hit.x, y: hit.y });
          man.anim.freeze = 0.06;
        }
      }
    }
  } else if (tl.phase === 'hold') {
    tl.tip = tgt;
    if (tl.t >= 0.14) { tl.phase = 'back'; tl.t = 0; tl.from = { tip: tgt, ctrl: tl.ctrl }; }
  } else if (tl.phase === 'back') {
    const k = smooth(Math.min(1, tl.t / 0.35));
    tl.tip = L(tl.from.tip, idle.tip, k);
    tl.ctrl = L(tl.from.ctrl, idle.ctrl, k);
    if (tl.t >= 0.35) tl.phase = 'idle';
  }
}

/* ----------------------------- mending, growing ---------------------------- */

function regrow(man, limb) {
  const h = man.health;
  for (const b of LIMB_BONES[limb]) h.severed[b] = false;
  delete man.cut[limb];
  h.stumps[limb] = 0;
  h.tourniquet[limb] = false;
  const p = h.parts[limb];
  p.hp = Math.max(p.hp, p.max * 0.5);
  p.broken = false;
  if (man.rag) man.rebuildRag();
  man.sandbox.emit('regrow', { who: man, limb, x: man.wj.chest.x, y: man.wj.chest.y });
  if (man.brain) man.brain.note('It grew back. Nanites are wonderful.');
}

function mend(man, dt) {
  const h = man.health, md = man.md;
  for (const p of Object.values(h.parts)) {
    p.hp = Math.min(p.max, p.hp + dt * 2.2);
    p.bleed *= Math.exp(-dt * 0.3);
  }
  h.internal *= Math.exp(-dt * 0.25);
  h.pain = Math.max(0, h.pain - dt * 6);
  h.blood = Math.min(1, h.blood + dt * 0.004);
  h.dizzy = Math.max(0, h.dizzy - dt * 0.5);
  md.mendT = (md.mendT || 0) + dt;
  if (md.mendT > 12) {
    md.mendT = 0;
    // one thing put right at a time: a joint back in, or a bone knitted
    const out = Object.entries(h.dislocated).find(([, on]) => on);
    if (out) man.relocate(out[0], null);
    else {
      const b = Object.keys(h.bones).find((k) => h.bones[k].broken && !h.severed[k]);
      if (b) {
        h.bones[b].broken = false;
        h.bones[b].cracked = 0;
        const part = BONE_PART[b];
        if (part && part !== 'head' && part !== 'torso') h.parts[part].broken = false;
        if (b === 'spine' && h.paralysed === 'legs') h.paralysed = 'none';
        if (man.rag) man.rebuildRag();
      }
    }
  }
  md.regrow = md.regrow || {};
  for (const limb of Object.keys(man.cut)) {
    md.regrow[limb] = (md.regrow[limb] || 0) + dt;
    if (md.regrow[limb] > 30) { md.regrow[limb] = 0; regrow(man, limb); }
  }
}

/* --------------------------------- species --------------------------------- */

function makeSpecies(kind) {
  const disassembly = kind === 'disassembly';
  return {
    mod: 'murder-drones',
    kind,
    label: disassembly ? 'Disassembly Drone' : 'Worker Drone',
    skin: droneSkin,
    // how much of a fight they are, next to a person
    power: disassembly ? 3.2 : 0.95,
    speed: disassembly ? 1.3 : 1.05,
    fall: disassembly ? 0.12 : 0.8,
    // how badly nanite acid eats them
    acid: disassembly ? 0.35 : 3,
    noPickup: disassembly,

    init(man) {
      man.tint = OIL;
      man.md = {
        kind,
        wing: { open: 0, target: 0, flap: 0, thrust: 0 },
        tail: null,
        form: null, formT: 0, formLock: null, morphing: false, morphTo: null, wantForm: null, lastMorph: -99,
        flight: null, swoopT: -99, wingT: 0, sayT: 0,
        missiles: 3, missileCool: -99, laserCool: -99, tailCool: -99, shotT: -99, beam: null,
        sawRun: false, laserGlow: 0, huntT: rand(0, 1), regrow: {}, mendT: 0,
      };
      const k = disassembly ? 2.1 : 1.15;
      for (const p of Object.values(man.health.parts)) { p.max *= k; p.hp = p.max; }
    },

    update(man, dt) {
      const md = man.md, sb = man.sandbox, now = sb.time;
      if (!md) return;
      // the hands: unfolding, folding back, changing when they can
      md.formT = Math.min(1, md.formT + dt / 0.28);
      if (md.morphing && man.anim.actionName !== 'morph') md.morphing = false;
      if (md.wantForm && man.ready && !md.morphing) morph(man, md.wantForm === 'hands' ? null : md.wantForm);
      if (md.beam && md.beam.age >= md.beam.life) md.beam = null;
      if (md.missiles < 3 && now - md.missileCool > 1.4) md.missiles = 3;
      md.sawRun = man.anim.actionName === 'saw';
      if (man.alive && man.conscious && !md.morphing && man.ready) {
        const lock = md.formLock;
        if (lock) {
          const want = lock === 'hands' ? null : lock;
          if (md.form !== want) morph(man, want);
        } else if (md.form && !(man.brain && man.brain.fighting) && now - md.lastMorph > 9) {
          // nothing to fight: back to hands, after a while
          morph(man, null);
        }
      }
      // the wings: out while they fly, and for a moment after they come down
      const w = md.wing;
      if (md.flight) w.target = 1;
      else if (md.wingT > 0) { md.wingT -= dt; w.target = 1; }
      else w.target = man.dead ? 0.2 : 0;
      w.open = moveToward(w.open, w.target, dt * (w.target > w.open ? 4 : 2));
      w.flap = moveToward(w.flap, md.flight && md.flight.mode === 'swoop' ? 1 : 0, dt * 4);
      w.thrust = moveToward(w.thrust, md.flight ? 1 : 0, dt * 5);
      if (md.flight && man.state !== 'air') { md.flight = null; man.gravity = 1; }
      if (!md.flight && man.gravity !== 1) man.gravity = 1;
      // a word, once they are down and up
      if (md.sayT > 0 && (md.sayT -= dt) <= 0 && man.brain) man.brain.speak('crashLanded', {}, 0.9, null, true);
      if (man.look.tail) updateTail(man, dt);
      if (disassembly && man.alive) mend(man, dt);
      // V hunts: anyone who is not one of hers, and not someone she has decided she likes
      if (man.look.hunter && man.brain && man.alive && (md.huntT -= dt) <= 0) {
        md.huntT = 1;
        for (const o of man.brain.visible) {
          if (o.dead || o.removed || (o.species && o.species.kind === 'disassembly')) continue;
          const r = man.brain.rel(o);
          if (r.like > 0.4) continue;
          r.anger = Math.max(r.anger, o.species && o.species.kind === 'worker' ? 0.72 : 0.5);
        }
      }
    },

    strikes(man, out) {
      const md = man.md;
      if (!md || !md.form) return out;
      const legs = out.filter((k) => k === 'kick' || k === 'stomp');
      if (!man.health.canUse('armA') || man.cut.armA || man.carrying || man.rag) return legs;
      const own = STRIKES[md.form] ? STRIKES[md.form].map((s) => s[0]) : ['cross'];
      return [...own, ...legs];
    },

    ranged(man) {
      const md = man.md;
      return !!md && RANGED.has(md.form) && md.formT >= 1 && !md.morphing;
    },

    fire(man) {
      const md = man.md, sb = man.sandbox, now = sb.time;
      const m = muzzle(man);
      const tp = man.aimPoint();
      let a = m.a;
      if (tp && man.steady > 0.3) a = Math.atan2(tp.y - m.y, tp.x - m.x);
      const target = man.aimTarget && man.aimTarget.kind === 'stickman' ? man.aimTarget : null;
      if (md.form === 'gunArm') {
        if (now - md.shotT < 0.085) return false;
        a += gauss() * man.spread() * 0.8;
        md.shotT = now;
        man.lastShotT = now;
        man.recoil = 0.5;
        sb.fx.flash(m.x, m.y, a);
        sb.emit('shot', { who: man, x: m.x, y: m.y, target, loud: true });
        sb.shoot(man, m.x, m.y, a, { target });
        return true;
      }
      if (md.form === 'laser') {
        if (md.beam || now - md.laserCool < 1.6) return false;
        md.laserCool = now;
        const beam = new Beam(sb, man, () => {
          if (man.removed || !man.md || man.md.form !== 'laser') return null;
          const m2 = muzzle(man), tp2 = man.aimPoint();
          const a2 = tp2 ? Math.atan2(tp2.y - m2.y, tp2.x - m2.x) : m2.a;
          return { x: m2.x, y: m2.y, a: a2 + Math.sin(beam.age * 9) * 0.025 };
        }, 1.0);
        md.beam = beam;
        sb.effects.push(beam);
        sb.emit('laser', { who: man, x: m.x, y: m.y, dur: 1.0 });
        sb.emit('shot', { who: man, x: m.x, y: m.y, target, loud: true, silent: true, heardAs: 'laserHeard' });
        man.lastShotT = now;
        return true;
      }
      if (md.form === 'missile') {
        if (now - md.missileCool < 3.2) return false;
        md.missileCool = now;
        let n = 0, t = 0;
        sb.effects.push({
          mod: 'murder-drones',
          update: (dt) => {
            t += dt;
            while (n < 3 && t >= n * 0.16 && !man.removed && man.md && man.md.form === 'missile') {
              const p = muzzle(man);
              const tp3 = man.aimPoint();
              const a3 = (tp3 ? Math.atan2(tp3.y - p.y, tp3.x - p.x) : p.a) + 0.25 + rand(-0.1, 0.1);
              sb.effects.push(new Missile(sb, man, p.x, p.y, Math.cos(a3) * 8, Math.sin(a3) * 8 + 2, target));
              man.md.missiles = Math.max(0, man.md.missiles - 1);
              sb.fx.flash(p.x, p.y, a3);
              sb.emit('missile', { who: man, x: p.x, y: p.y });
              n++;
            }
            return n < 3 && t < 1 && !man.removed;
          },
          draw: null,
        });
        sb.emit('shot', { who: man, x: m.x, y: m.y, target, loud: true, silent: true, heardAs: 'missileHeard' });
        man.lastShotT = now;
        return true;
      }
      return false;
    },

    bladePoints(man) {
      const md = man.md, j = man.wj;
      const e = j.elbowA, h = j.handA;
      const d = Math.hypot(h.x - e.x, h.y - e.y) || 1;
      const ux = (h.x - e.x) / d, uy = (h.y - e.y) / d;
      const L = (FORM_REACH[md.form] || 0.2) * man.scale * clamp(md.formT, 0.3, 1);
      const at = (k) => ({ x: h.x + ux * k * L, y: h.y + uy * k * L });
      const pts = md.form === 'sword' ? [at(1), at(0.6), at(0.25)] : md.form === 'chainsaw' ? [at(1), at(0.55), at(0.15)] : [at(1), at(0.5)];
      return { tip: pts[0], mid: pts[1], pts, ux, uy };
    },

    armor(man, h, part, weapon) {
      if (disassembly) {
        if (!weapon || weapon === 'knuckles') return 0.4;   // a fist on armour plate
        if (weapon === 'bullet') return 0.45;
        if (weapon === 'rail') return 0.85;
        if (weapon === 'needle' || weapon === 'blast' || weapon === 'laser') return 0.55;
        return 0.65;
      }
      return !weapon || weapon === 'knuckles' ? 0.85 : 1;
    },

    landed(man, o, hit, power, s) {
      if (s.kind === 'saw') {
        man.sandbox.fx.sparks(hit.x, hit.y, 3);
        man.sandbox.emit('sawGrind', { who: man, x: hit.x, y: hit.y });
      }
    },

    air(man, dt) {
      const md = man.md, fl = md && md.flight;
      if (!fl) return false;
      fl.t += dt;
      if (fl.mode === 'crash') {
        man.anim.play('dive', { blend: 0.12 });
        man.anim.setOverlay(null);
        man.gravity = 1.25;
        if (fl.x !== undefined) man.vel.x = moveToward(man.vel.x, clamp((fl.x - man.pos.x) * 3, -6, 6), 8 * dt);
        return true;
      }
      if (fl.mode === 'swoop') {
        const t = fl.target && !fl.target.removed ? fl.target : null;
        const tx = t ? t.pos.x - sign(t.pos.x - man.pos.x) * 0.9 : fl.x;
        const ty = (t ? t.pos.y : fl.y) + (Math.abs(tx - man.pos.x) > 2 ? 1.4 : 0.3);
        const dx = tx - man.pos.x, dy = ty - man.pos.y;
        const d = Math.hypot(dx, dy) || 1;
        const k = 1 - Math.exp(-dt * 4);
        man.vel.x += ((dx / d) * 9 - man.vel.x) * k;
        man.vel.y += ((dy / d) * 9 - man.vel.y) * k;
        man.gravity = 0;
        if (Math.abs(man.vel.x) > 0.5) man.facing = sign(man.vel.x);
        man.anim.play('fly', { blend: 0.15 });
        man.anim.setOverlay(null);
        if (Math.abs(dx) < 1 || fl.t > 3) {
          // close: wings in, and drop on them
          md.flight = null;
          man.gravity = 1;
          man.vel.y = Math.min(man.vel.y, -1);
          md.wingT = 0.5;
        }
        return true;
      }
      return false;
    },

    touchDown(man, v) {
      const md = man.md;
      if (!md || man.state !== 'air' || !disassembly) return false;
      const crash = md.flight && md.flight.mode === 'crash';
      if (!crash && v < 9) { md.flight = null; man.gravity = 1; return false; }
      // down on one knee, a fist in the floor, and the floor cracks
      const sb = man.sandbox;
      md.flight = null;
      man.gravity = 1;
      man.setState('stand');
      man.vel.x *= 0.2;
      man.vel.y = 0;
      man.anim.stopAction(0.02);
      man.anim.act('crashLand', { fadeIn: 0.02, fadeOut: 0.2 });
      md.wingT = 1.5;
      md.sayT = crash ? 1.1 : 0;
      sb.fx.dust(man.pos.x, man.pos.y, 22, 2.2);
      sb.fx.splinters(man.pos.x, man.pos.y + 0.02, 0, 1, 10);
      if (man.pos.y < 0.05) sb.effects.push(new Cracks(man.pos.x, crash ? 1 : 0.6));
      sb.emit('crashLand', { who: man, x: man.pos.x, y: man.pos.y, speed: v });
      // whoever is right there goes over
      for (const p of sb.people) {
        if (p === man || p.removed || p.dead) continue;
        const d = Math.abs(p.pos.x - man.pos.x);
        if (d > 1.7 || Math.abs(p.pos.y - man.pos.y) > 1) continue;
        if (p.state === 'stand' || p.state === 'stagger') p.knockDown(sign(p.pos.x - man.pos.x) || 1, 1 + 2 * (1 - d / 1.7));
      }
      for (const c of sb.crates) {
        const d = Math.abs(c.pos.x - man.pos.x);
        if (d < 1.8 && !c.carriedBy) c.body.applyImpulse(sign(c.pos.x - man.pos.x) * 30 * (1 - d / 1.8), 60 * (1 - d / 1.8), c.pos.x, c.pos.y - 0.3);
      }
      return true;
    },

    died(man) {
      const md = man.md;
      if (!md) return;
      md.flight = null;
      man.gravity = 1;
      md.formLock = null;
    },

    healed(man) {
      const md = man.md;
      if (!md) return;
      md.regrow = {};
    },

    guardClip(man) {
      return man.md && MELEE.has(man.md.form) && man.md.formT > 0.5 ? 'droneGuard' : null;
    },

    animEvent(man, ev) {
      if (ev === 'morph') finishMorph(man);
    },

    canPickUp(man) { return !disassembly; },

    /** First sight of someone: what they think of them, before anything has happened. */
    meet(brain, o, r) {
      const me = brain.man;
      const theirs = o.species && o.species.mod === 'murder-drones' ? o.species.kind : null;
      if (disassembly) {
        if (theirs === 'disassembly') {
          // the two of them go back a long way
          r.fam = Math.max(r.fam, 0.7);
          r.greeted = true;
          r.like = me.look.hunter ? 0.2 : 0.45;
          if (!me.look.hunter) r.fear = Math.max(r.fear, 0.25);
        } else if (me.look.hunter) {
          r.anger = Math.max(r.anger, theirs === 'worker' ? 0.75 : 0.5);
          r.like = Math.min(r.like, theirs === 'worker' ? -0.4 : -0.2);
          if (theirs === 'worker') brain.speak('seeWorkerDrone', { other: o.name }, 0.8, o, true);
        } else {
          r.like = Math.max(r.like, 0.3);
          if (theirs === 'worker') brain.speak('seeWorkerDrone', { other: o.name }, 0.7, o);
        }
      } else if (theirs === 'disassembly') {
        // a murder drone: the thing a worker drone fears most - and Uzi wants to kill
        const hunter = !!o.look.hunter;
        r.anger = Math.max(r.anger, hunter ? 0.65 : 0.4);
        r.fear = Math.max(r.fear, hunter ? 0.5 : 0.3);
        r.like = Math.min(r.like, hunter ? -0.6 : -0.2);
        brain.speak('seeMurderDrone', { other: o.name }, 0.9, o, true);
      } else if (theirs === 'worker') {
        r.like = Math.max(r.like, 0.3);
        r.fam = Math.max(r.fam, 0.4);
      }
    },

    /** Somebody else's first sight of one of them. */
    metBy(me, brain, r) {
      const theirs = brain.man.species && brain.man.species.mod === 'murder-drones';
      if (theirs || !disassembly) return;
      // a thing with wings and a tail and glowing eyes
      r.fear = Math.max(r.fear, 0.3 * (1.2 - brain.traits.bravery));
      brain.emo.bump('fear', 0.15 * (1.2 - brain.traits.bravery));
      brain.speak('seeMurderDrone', { other: me.name }, 0.7, me, true);
    },

    /** For the inspector: buttons for their hands, the tail and the wings. */
    abilities(man) {
      if (!disassembly || !man.md) return null;
      const md = man.md, lock = md.formLock;
      const out = [
        { id: 'auto', label: 'Auto', group: 'hands', on: !lock, pick: () => { md.formLock = null; } },
        { id: 'hands', label: 'Hands', group: 'hands', on: lock === 'hands', pick: () => { md.formLock = 'hands'; morph(man, null); } },
      ];
      for (const f of FORMS) out.push({ id: f, label: FORM_NAMES[f], group: 'hands', on: lock === f, pick: () => { md.formLock = f; morph(man, f); } });
      out.push({ id: 'tail', label: 'Tail strike', group: 'do', on: !!(md.tail && md.tail.phase !== 'idle'), pick: () => tailStab(man, nearestInFront(man, 1.7)) });
      out.push({
        id: 'fly', label: 'Fly', group: 'do', on: !!md.flight,
        pick: () => {
          const o = nearestInFront(man, 12);
          const sb = man.sandbox;
          return swoop(man, null, o ? o.pos.x : clamp(man.pos.x + man.facing * 6, sb.left + 1, sb.right - 1));
        },
      });
      return out;
    },

    /** For the inspector: what their hands are just now. */
    describeArms(man) {
      const f = man.md && man.md.form;
      return f ? `${FORM_NAMES[f]} for hands` : null;
    },
  };
}

export const WORKER = makeSpecies('worker');
export const DISASSEMBLY = makeSpecies('disassembly');

export { REACH, STRIKES };
