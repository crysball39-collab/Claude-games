/* =============================================================================
   What keeps a stickman going besides blood and bone - adrenaline, the air in
   them and how hot or cold they are - and the two things that happen to a
   body pushed too far either way: it catches fire, or it freezes.

     adrenaline   0..1. Fear, anger, a blow, a fall, being picked up, being
                  on fire: it surges in a second or two and wears off over
                  most of a minute. While it is up they feel less of the
                  pain, run faster, hit harder, tire slower and come round
                  sooner - and they bleed faster, and their aim shakes
     oxygen       0..1 of what their blood can carry. It goes down while
                  they cannot breathe - held up by the head, frozen solid -
                  and stays down a little for smoke, a punctured lung, lost
                  blood or being out of breath. Low, they go dizzy; lower,
                  they pass out; long enough near the bottom, it kills them
     temperature  degrees C, and 37 is right. It can be set to anything (the
                  inspector takes it typed), and the body sweats or shivers
                  its way back - fast from very hot, slowly from very cold -
                  unless it is locked where it was put.
                    38+   hot: flushed, sweating
                    40+   overheating: dizzy, slower, out of breath sooner
                    42+   heatstroke: out cold past 43 or so, and kept up it
                          kills them, sooner the hotter
                    60+   they catch fire
                    35-   cold: shivering
                    32-   hypothermia: slow and clumsy, the shivering stops
                    28-   out cold; below 24 the cold starts to kill them
                    0-    frozen solid
                  The dead, the frozen and the undead do nothing about it:
                  they go, slowly, to the temperature of the air.

   Burning
     Flames on every part that has caught, spreading along the body and to
     anybody it touches. Each burning part takes damage (no blood, all pain),
     the face blackens, smoke and embers go up, the heat climbs. A body burns
     through what there is to burn in under twenty seconds - and it has
     usually killed them before then - unless the fire is put out: rolled
     out on the floor, patted out by somebody, blown out (swung through the
     air), or cooled (a temperature under 36 puts it out with a hiss).
   Freezing
     Frost on them as they get cold. Frozen solid: an ice shell, icicles, and
     the body locked stiff in the pose it froze in - it stands there, or
     falls over all of a piece. Breathing, bleeding and thinking stop, and
     within a quarter of a minute or so the cold kills them. Warmed past 0
     the ice melts and runs off; if they are still alive they come round,
     shivering, with frostbite. Hit hard while frozen, a limb snaps off like
     an icicle; hit very hard, or dropped from high enough, the whole body
     shatters.
   ========================================================================== */
import { BONES, DIM, HEAD_BONE, pointOnBone } from './skeleton.js';
import { PARTS } from './health.js';
import { goneAt } from './draw.js';
import { clamp, clamp01, lerp, rand, chance, sign } from '../core/util.js';

export const NORMAL_TEMP = 37;
/** The air in the sandbox: what the dead and the frozen go to, slowly. */
export const AIR_TEMP = 20;
/** At this or hotter, they catch fire. */
export const IGNITE_AT = 60;
/** At this or colder, they freeze solid. */
export const FREEZE_AT = 0;
export const COLDEST = -273.15;
export const HOTTEST = 5000;

// how fast each part burns at the height of it, hit points a second
const BURN = { head: 8.5, torso: 10, armA: 5, armB: 5, legA: 5.2, legB: 5.2 };
// which parts the fire gets to from which
const NEXT = { head: ['torso'], torso: ['head', 'armA', 'armB', 'legA', 'legB'], armA: ['torso'], armB: ['torso'], legA: ['torso'], legB: ['torso'] };
// where the flames come off each part: [bone, how far along]
const FLAMES = {
  head: [[HEAD_BONE, 1]],
  torso: [[0, 0.15], [0, 0.65], [1, 0.3], [1, 0.8]],
  armA: [[3, 0.35], [3, 0.85], [4, 0.45], [4, 0.95]],
  armB: [[5, 0.35], [5, 0.85], [6, 0.45], [6, 0.95]],
  legA: [[7, 0.3], [7, 0.8], [8, 0.35], [8, 0.85]],
  legB: [[10, 0.3], [10, 0.8], [11, 0.35], [11, 0.85]],
};
// the long bones a frozen limb snaps at, by the point of the ragdoll that hit
const SNAP_AT = {
  handA: 'forearmA', midForeA: 'forearmA', elbowA: 'humerusA', midHumA: 'humerusA',
  handB: 'forearmB', midForeB: 'forearmB', elbowB: 'humerusB', midHumB: 'humerusB',
  footA: 'tibiaA', toeA: 'tibiaA', midTibA: 'tibiaA', kneeA: 'femurA', midFemA: 'femurA',
  footB: 'tibiaB', toeB: 'tibiaB', midTibB: 'tibiaB', kneeB: 'femurB', midFemB: 'femurB',
};

/* --------------------------------- who can --------------------------------- */

/** Whether a body keeps vitals at all (a mod's boss may keep its own count instead). */
export const hasVitals = (man) => !!man && !!man.health && typeof man.health.temp === 'number';
/** Whether they need air: the undead and machines do not (a mod's says so: species.breathes). */
export function breathes(man) {
  const sp = man.species;
  return !sp || (sp.breathes ?? !sp.undead);
}
/** Whether fire takes to them (species.fireproof says not). */
export const canBurn = (man) => hasVitals(man) && !(man.species && man.species.fireproof);
/** Whether they can be frozen solid. */
export const canFreeze = (man) => hasVitals(man) && !man.steadfast && !(man.species && man.species.frostproof);

/** What is stopping them breathing, if anything: 'dead', 'ice' or 'choke' (held up by the head). */
export function airway(man) {
  const h = man.health;
  if (h.dead) return 'dead';
  if (h.frozen) return 'ice';
  if (man.state === 'held' && man.held && man.held.part === 'head') return 'choke';
  return null;
}

function vit(man) {
  return man.vit || (man.vit = { painWas: man.health.pain, warmth: 0, air: null, airWas: null, smokeT: 0, steamT: 0, frostT: 0, afterFire: 0 });
}

/* -------------------------------- every step -------------------------------- */

/** Runs every step for every stickman (stickman.js), before their health. */
export function updateVitals(man, dt) {
  if (!hasVitals(man) || man.removed) return;
  const h = man.health, v = vit(man);
  const sp = man.species;
  const undead = !!(sp && sp.undead);
  updateTemp(man, h, v, dt, !h.dead && !undead);
  if (man.flames) updateFire(man, dt);
  else if (h.temp >= IGNITE_AT && canBurn(man) && !h.frozen) ignite(man, { power: firePower(h.temp) });
  if (man.smoulder > 0) smoulder(man, dt);
  if (!h.frozen && h.temp <= FREEZE_AT && canFreeze(man)) freezeSolid(man);
  else if (h.frozen) updateIce(man, dt);
  updateAir(man, h, v, dt);
  updateAdrenaline(man, h, v, dt);
  if (!h.dead) effects(man, h, v, dt, undead);
}

/** How big a fire a body that hot starts. */
const firePower = (t) => clamp(0.4 + (t - IGNITE_AT) / 250, 0.4, 1);

function updateTemp(man, h, v, dt, regulates) {
  const warmth = v.warmth;
  v.warmth = 0;
  if (h.tempLock != null) { h.temp = h.tempLock; return; }
  let T = h.temp;
  if (regulates && !h.frozen) {
    // a living body steers back to 37: sweating when it is too hot, shivering when it is
    // too cold. The hotter it is the faster it loses heat; the colder, the less it can do
    const target = NORMAL_TEMP + (1 - clamp01(man.stamina / 0.6)) * 0.7 + h.adrenaline * 0.3;
    // (a body on fire sheds anything past 42 into the flames in a second or two; one that is not, past 50, a good deal slower)
    const shed = h.burning ? 0.08 * Math.max(0, T - 42) : 0.012 * Math.max(0, T - 50);
    const k = T > target ? 0.03 + 0.006 * Math.max(0, T - 40) + shed : 0.022 * (T > 32 ? 1 : T > 26 ? 0.7 : 0.3);
    T += (target - T) * (1 - Math.exp(-k * dt));
  } else {
    // the dead, the frozen and the undead go to the temperature of the air: the further off it, the faster
    const k = 0.0045 + 0.0004 * Math.max(0, Math.abs(T - AIR_TEMP) - 20);
    T += (AIR_TEMP - T) * (1 - Math.exp(-k * dt));
  }
  // burning, the heat climbs: the flames are on the skin, and the inside of them only gets so hot
  // (and for a few seconds after, the shock of it keeps them going)
  const f = man.flames;
  v.afterFire = Math.max(0, (v.afterFire || 0) - dt);
  h.burning = !!f || v.afterFire > 0;
  if (f) {
    const top = 38.5 + 3 * f.power;
    if (T < top) T = Math.min(top, T + (0.3 + 0.5 * f.power) * f.power * dt);
  }
  // a fire close by warms anybody cold (and thaws anybody frozen), but cooks nobody
  if (warmth > 0 && T < 36) T = Math.min(36, T + warmth * dt);
  h.temp = clamp(T, COLDEST, HOTTEST);
}

function updateAir(man, h, v, dt) {
  if (!breathes(man)) { h.oxygen = 1; v.air = null; return; }
  if (h.dead) { h.oxygen = Math.max(0, h.oxygen - dt * 0.06); v.air = 'dead'; return; }
  const why = airway(man);
  v.airWas = v.air;
  v.air = why;
  if (why) {
    // nothing coming in: what is there goes, faster with the heart racing, slower in the cold
    const need = 0.03 * (1 + h.adrenaline * 0.5) * (h.temp < 32 ? 0.45 : 1) * (why === 'ice' ? 0.3 : 1);
    h.oxygen = Math.max(0, h.oxygen - need * dt);
    return;
  }
  let target = 0.985;
  target -= (1 - clamp01(man.stamina / 0.5)) * 0.05;
  if (h.lung) target -= 0.12;
  if (h.bones.ribs.broken) target -= 0.03;
  const f = man.flames;
  if (f) target -= 0.2 * f.power * (0.6 + 0.4 * (f.parts.head || 0));
  if (h.blood < 0.7) target -= (0.7 - h.blood) * 0.35;
  target = clamp(target, 0.3, 1);
  const k = h.oxygen < target ? 0.55 * (1 + h.adrenaline * 0.6) : 1.2;
  h.oxygen += (target - h.oxygen) * (1 - Math.exp(-k * dt));
  // the first breath after going without
  if (v.airWas === 'choke' && h.oxygen < 0.85 && man.conscious) {
    man.sandbox.emit('gasp', { who: man, x: man.wj.head.x, y: man.wj.head.y });
    man.notify('gasp', {});
  }
}

function updateAdrenaline(man, h, v, dt) {
  const rise = h.pain - v.painWas;
  v.painWas = h.pain;
  if (h.dead || h.frozen) { h.adrenaline = Math.max(0, h.adrenaline - dt * 0.05); return; }
  let want = 0;
  const b = man.brain;
  if (b && man.conscious) {
    const E = b.emo;
    want = Math.max((E.fear - 0.08) * 1.05, (E.anger - 0.1) * 0.9, (E.surprise - 0.1) * 0.55, 0);
    if (b.fighting || b.fleeing) want = Math.max(want, 0.5);
  }
  if (man.flames) want = Math.max(want, 0.95);
  if (v.air === 'choke' && man.conscious) want = Math.max(want, 0.85);
  if (man.state === 'held' || man.state === 'thrown' || man.state === 'stumble' || man.tased) want = Math.max(want, 0.55);
  // a fresh hurt sends it up all at once
  if (rise > 0) h.adrenaline = Math.min(1, h.adrenaline + rise * 0.006);
  // the cold slows everything down, this too
  if (h.temp < 32) want *= clamp01((h.temp - 26) / 6);
  if (h.adrenaline < want) h.adrenaline += (want - h.adrenaline) * (1 - Math.exp(-dt * 1.4));
  else h.adrenaline = Math.max(want, h.adrenaline - dt * 0.022);
}

/** What too hot, too cold and too little air do to the living: the damage it adds up to, and the dizziness. */
function effects(man, h, v, dt, undead) {
  const T = h.temp;
  if (!undead) {
    const Th = h.burning ? Math.min(T, 44) : T;
    const hot = Th > 41 ? Math.pow((Math.min(Th, 47) - 41) / 6, 1.5) * 0.15 : 0;
    h.heat = hot ? Math.min(1, h.heat + hot * dt) : Math.max(0, h.heat - dt * 0.004);
    const cold = T < 24 ? (24 - T) * 0.0025 : 0;
    h.chill = cold ? Math.min(1, h.chill + cold * dt) : Math.max(0, h.chill - dt * 0.006);
    if (breathes(man)) {
      const low = h.oxygen < 0.4 ? (0.4 - h.oxygen) * 0.5 : 0;
      h.hypoxia = low ? Math.min(1, h.hypoxia + low * dt) : Math.max(0, h.hypoxia - dt * 0.01);
    }
    let cause = null, killer = null;
    if (h.heat >= 1) cause = 'heatstroke';
    else if (h.chill >= 1) cause = h.frozen ? 'frozen solid' : 'hypothermia';
    else if (h.hypoxia >= 1) {
      cause = v.air === 'choke' ? 'suffocation' : man.flames ? 'smoke inhalation' : 'lack of oxygen';
      if (v.air === 'choke' && man.heldBy && !man.heldBy.removed) killer = man.heldBy;
    }
    if (cause) {
      if (man.flames && man.flames.by && !man.flames.by.removed && !killer) killer = man.flames.by;
      h.kill(cause);
      man.die(cause, killer);
      return;
    }
  }
  // dizzy with the heat, or for want of air
  if (T > 40) h.dizzy = Math.max(h.dizzy, (T - 40) * 0.6);
  if (h.oxygen < 0.72) h.dizzy = Math.max(h.dizzy, (0.72 - h.oxygen) * 8);
  // very cold, and not yet frozen: the fingers and toes begin to go
  if (T < 10 && !h.frozen && (v.frostT -= dt) <= 0) {
    v.frostT = 2;
    const part = ['armA', 'armB', 'legA', 'legB'][Math.floor(Math.random() * 4)];
    h.hit(part, 0.6 + (10 - T) * 0.05, { burn: true, cutBy: 'Frostbite', cause: 'hypothermia' });
  }
  // too hot, steam comes off them
  const sb = man.sandbox;
  if (T > 45 && !man.flames && (v.steamT -= dt) <= 0) {
    v.steamT = clamp(0.5 - (T - 45) * 0.01, 0.08, 0.5);
    sb.fx.steam(man.wj.head.x + rand(-0.1, 0.1), man.wj.head.y + 0.1, 1);
  }
}

/* ----------------------------------- fire ----------------------------------- */

/**
 * Sets them alight. o = { power 0..1, part: just that part to begin with
 * (otherwise all of them at once), by: whoever did it }. False if it does
 * not take: fireproof, frozen, gone.
 */
export function ignite(man, o = {}) {
  if (!canBurn(man) || man.removed) return false;
  const h = man.health;
  if (h.frozen) return false;
  const power = clamp(o.power ?? 0.45, 0.1, 1);
  let f = man.flames;
  const fresh = !f;
  if (fresh) {
    // a body that has burned already has less left to burn
    f = man.flames = { t: 0, power: 0, fuel: 1 - (man.char || 0) * 0.7, parts: {}, tick: 0.1, smother: 0, by: o.by || null, emberT: 0, smokeT: 0, crackleT: 0, markT: 0.5 };
  } else if (o.by && !f.by) f.by = o.by;
  f.power = Math.max(f.power, power);
  if (o.part) f.parts[o.part] = Math.max(f.parts[o.part] || 0, power);
  else for (const p of PARTS) f.parts[p] = Math.max(f.parts[p] || 0, power);
  if (fresh) {
    man.rolling = 0;
    man.smoulder = 0;
    h.adrenaline = Math.max(h.adrenaline, 0.6);
    const c = man.wj.chest;
    man.sandbox.emit('ignite', { who: man, by: f.by, x: c.x, y: c.y, part: o.part || null });
    man.notify('onFire', { by: f.by });
  }
  return true;
}

/** The fire out. how: 'out' (burned out), 'rolled', 'smothered', 'blown', 'cooled', 'frozen', 'healed'. */
export function extinguish(man, how = 'out') {
  const f = man.flames;
  if (!f) return false;
  man.flames = null;
  man.smoulder = how === 'healed' ? 0 : 2.5 + Math.min(4, f.t * 0.2);
  vit(man).afterFire = how === 'healed' ? 0 : 6;
  const c = man.wj.chest;
  man.sandbox.emit('extinguish', { who: man, how, x: c.x, y: c.y });
  man.notify('putOut', { how });
  return true;
}

/** Somebody's warmth on them (huddled up close, rubbing their arms): k degrees a second, for anybody colder than 36. */
export function warm(man, k) {
  if (hasVitals(man)) vit(man).warmth += k;
}

/** Somebody beating at the flames on them: k of the fire, a second. */
export function smother(man, k) {
  if (man.flames) man.flames.smother += k;
}

function updateFire(man, dt) {
  const f = man.flames, h = man.health, sb = man.sandbox;
  f.t += dt;
  if (!man.conscious) man.rolling = 0;
  // too cold to burn, or frozen: out, with a hiss
  if (h.temp < 36 || h.frozen) { extinguish(man, h.frozen ? 'frozen' : 'cooled'); return; }
  const rolling = man.rolling > 0 && man.state === 'down';
  const speed = Math.hypot(man.vel.x, man.vel.y);
  // it grows on what there is to burn, and dies back once that is nearly gone; rolling on
  // the floor smothers it, so does somebody beating at it, and so does enough of a wind
  const grow = f.fuel > 0.15 ? 0.35 : -0.25;
  const blown = Math.max(0, speed - 9) * 0.06;
  f.power = clamp01(f.power + (grow - (rolling ? 0.95 : 0) - blown - f.smother) * dt);
  // (what burns is what is alight: one arm goes through it slower than the whole of them)
  let alight = 0;
  for (const p of PARTS) alight += f.parts[p] || 0;
  f.fuel = Math.max(0, f.fuel - dt * (0.012 + 0.055 * f.power * alight / PARTS.length + (rolling ? 0.06 : 0)));
  const smothered = f.smother > 0;
  f.smother = 0;
  if (f.power < 0.03) {
    extinguish(man, rolling ? 'rolled' : smothered ? 'smothered' : blown > 0 ? 'blown' : 'out');
    return;
  }
  // part to part
  for (const p of PARTS) {
    let k = f.parts[p] || 0;
    if (k < f.power) {
      let src = 0;
      for (const q of NEXT[p]) src = Math.max(src, f.parts[q] || 0);
      if (src > 0.25) k += dt * 0.32 * src;
    }
    f.parts[p] = Math.min(k, f.power);
  }
  // what it does to them, four times a second
  if ((f.tick -= dt) <= 0) {
    f.tick = 0.25;
    const was = !h.dead;
    let lit = 0;
    for (const p of PARTS) {
      const k = f.parts[p] || 0;
      if (k < 0.05) continue;
      lit += k;
      if (!was) continue;
      h.hit(p, BURN[p] * k * 0.25, { burn: true, cutBy: 'Fire', cause: 'burns' });
    }
    if (was) {
      h.shock = Math.min(1, h.shock + 0.003 * lit);
      man.hurtT = sb.time;
      if (f.by && !f.by.removed && f.by !== man) man.lastHit = { by: f.by, t: sb.time, part: 'torso', power: 0.3, kind: 'fire', blocked: false, object: null, weapon: 'fire' };
    }
    if (was && h.dead) man.die(h.cause || 'burns', f.by && !f.by.removed ? f.by : null);
    // the skin blackening, one mark at a time
    if ((f.markT -= 0.25) <= 0) {
      f.markT = 0.6 + rand(0, 0.6);
      const alight = PARTS.filter((p) => (f.parts[p] || 0) > 0.3);
      if (alight.length) {
        const p = alight[Math.floor(Math.random() * alight.length)];
        if (p === 'head') man.headMark(man.wj.head.x + rand(-0.1, 0.1), man.wj.head.y + rand(-0.1, 0.1), 0.9, true);
        else {
          const [b, t] = FLAMES[p][Math.floor(Math.random() * FLAMES[p].length)];
          if (!goneAt(man.cut, b, t)) man.addWound({ bone: b, t: clamp(t + rand(-0.1, 0.1), 0.05, 0.95), r: 0.5, burn: true });
        }
      }
    }
  }
  man.char = Math.min(1, (man.char || 0) + dt * 0.045 * f.power);
  if (f.parts.head > 0.3) man.charHead = Math.min(1, (man.charHead || 0) + dt * 0.05 * f.power);
  // smoke and embers going up, and the crackle of it
  if ((f.smokeT -= dt) <= 0) {
    f.smokeT = 0.09 / (0.3 + f.power);
    const q = randomFlamePoint(man);
    if (q) sb.fx.smoke(q.x, q.y + 0.1, 1, 0.6 + f.power * 0.6);
  }
  if ((f.emberT -= dt) <= 0) {
    f.emberT = 0.12 / (0.3 + f.power);
    const q = randomFlamePoint(man);
    if (q) sb.fx.embers(q.x, q.y, 1);
  }
  if ((f.crackleT -= dt) <= 0) {
    f.crackleT = rand(0.18, 0.4);
    sb.emit('fireCrackle', { who: man, x: man.wj.chest.x, power: f.power });
  }
  spread(man, dt);
}

/** After the fire: smoke still coming off them for a few seconds. */
function smoulder(man, dt) {
  man.smoulder = Math.max(0, man.smoulder - dt);
  const v = vit(man);
  if ((v.smokeT -= dt) <= 0) {
    v.smokeT = 0.18;
    const j = man.wj;
    const k = Math.random();
    man.sandbox.fx.smoke(lerp(j.hip.x, j.head.x, k) + rand(-0.06, 0.06), lerp(j.hip.y, j.head.y, k), 1, 0.45 * Math.min(1, man.smoulder / 2));
  }
}

/** The flames to anybody touching them, and their heat to anybody near (which thaws the frozen). */
function spread(man, dt) {
  const f = man.flames, sb = man.sandbox, c = man.wj.chest;
  for (const q of sb.people) {
    if (q === man || q.removed || !hasVitals(q) || Math.abs(q.pos.x - man.pos.x) > 2.2) continue;
    const d = Math.hypot(q.wj.chest.x - c.x, q.wj.chest.y - c.y);
    if (d < 1.4) vit(q).warmth += 0.9 * f.power * (1 - d / 1.4);
    if (!canBurn(q) || q.health.frozen || (q.flames && q.flames.power > 0.5)) continue;
    // somebody holding them, or holding on to them, catches it soonest; somebody beating it out, at arm's length, least
    const close = q.heldBy === man || man.heldBy === q;
    const careful = q.brain && q.brain.behaviour && q.brain.behaviour.kind === 'douse' ? 0.3 : 1;
    let touch = null;
    for (const p of PARTS) {
      const k = f.parts[p] || 0;
      if (k < 0.2) continue;
      for (const [b, t] of FLAMES[p]) {
        if (goneAt(man.cut, b, t)) continue;
        const pt = pointOnBone(man.wj, b, t, _pt);
        touch = q.touch(pt.x, pt.y, 0.08 * man.scale);
        if (touch) break;
      }
      if (touch) break;
    }
    if ((touch || close) && chance(dt * 0.4 * f.power * (close ? 4 : careful))) {
      ignite(q, { part: touch ? touch.part : 'torso', power: 0.35, by: f.by && !f.by.removed ? f.by : null });
    }
  }
}
const _pt = { x: 0, y: 0 };

function randomFlamePoint(man) {
  const f = man.flames;
  const lit = PARTS.filter((p) => (f.parts[p] || 0) > 0.1);
  if (!lit.length) return null;
  const p = lit[Math.floor(Math.random() * lit.length)];
  const [b, t] = FLAMES[p][Math.floor(Math.random() * FLAMES[p].length)];
  if (goneAt(man.cut, b, t)) return null;
  if (p === 'head') return { x: man.wj.head.x, y: man.wj.head.y + DIM.headR * man.scale * 0.6 };
  return pointOnBone(man.wj, b, t);
}

/* ------------------------------------ ice ------------------------------------ */

/**
 * Frozen solid where they stand: locked stiff, the pose they were in kept.
 * With ragdolls, the body becomes one stiff ragdoll - it can stand, topple,
 * be picked up and dropped; without, the pose just stays.
 */
export function freezeSolid(man) {
  const h = man.health, sb = man.sandbox;
  if (h.frozen || !canFreeze(man) || man.removed) return false;
  if (man.flames) extinguish(man, 'frozen');
  h.frozen = true;
  h.conscious = 0;
  man.ice = { t: 0, melt: 0, cracks: 0, seed: Math.floor(Math.random() * 1000) };
  man.rolling = 0;
  man.strike = null;
  man.blocking = false;
  man.dropCarried();
  man.anim.stopAction(0.02);
  man.bubble = null;
  man.thought = null;
  man.emote = null;
  if (man.state !== 'held' && !man.rag) {
    if (!man.goLimp({ state: man.dead ? 'dead' : 'ko', tone: 0 })) {
      // no ragdolls: nothing more than that the pose stays where it is (stickman.js)
      man.setState(man.dead ? 'dead' : 'ko');
    }
  } else if (man.rag && !man.dead && man.state !== 'held' && man.state !== 'thrown') man.setState('ko');
  if (man.rag) man.rag.lock();
  const c = man.wj.chest;
  sb.emit('freeze', { who: man, x: c.x, y: c.y });
  man.notify('frozen', {});
  return true;
}

/** The ice gone: they can move again - or, dead, fall over. */
export function thaw(man) {
  const h = man.health, sb = man.sandbox;
  if (!h.frozen) return false;
  h.frozen = false;
  man.ice = null;
  man.thawedT = sb.time;
  if (man.rag) man.rag.unlock();
  // the cold's damage: fingers, toes, the face - and, warm enough, they start to come round
  if (!h.dead) {
    for (const p of ['armA', 'armB', 'legA', 'legB']) if (chance(0.6)) h.hit(p, rand(2, 5), { burn: true, cutBy: 'Frostbite', cause: 'hypothermia' });
    h.pain = Math.max(h.pain, 30);
    h.conscious = Math.max(h.conscious, 0.2);
  } else if (man.weapon) man.dropWeapon(0.3);
  const c = man.wj.chest;
  sb.emit('thaw', { who: man, x: c.x, y: c.y });
  man.notify('thawed', {});
  return true;
}

function updateIce(man, dt) {
  const h = man.health, sb = man.sandbox;
  const ice = man.ice || (man.ice = { t: 0, melt: 0, cracks: 0, seed: Math.floor(Math.random() * 1000) });
  ice.t += dt;
  h.conscious = 0;
  // coming down on the floor, or brought up short against a wall or a crate: all the speed it
  // had goes into the ice (measured here, going in: the ragdoll only reports what is left of it)
  const sp = Math.hypot(man.vel.x, man.vel.y);
  if (man.rag && man.state !== 'held' && ice.t > 0.1) {
    let hit = 0;
    if (!man.onGround) {
      ice.air = sp;
      if ((ice.fast || 0) - sp > 7) hit = ice.fast - sp;
    } else if (ice.air > 0) { hit = ice.air; ice.air = 0; }
    if (hit > 0) {
      ice.fast = sp;
      iceFall(man, hit);
      if (man.removed || !h.frozen) return;
    }
  } else ice.air = 0;
  ice.fast = Math.max(sp, (ice.fast || 0) * Math.pow(0.92, dt * 120));
  if (h.temp > FREEZE_AT) {
    // melting: faster the warmer they are, running off them as it goes
    ice.melt += dt * (0.2 + 0.05 * (h.temp - FREEZE_AT));
    if (chance(dt * 14)) {
      const j = man.wj, pts = ['handA', 'handB', 'elbowA', 'elbowB', 'head', 'hip', 'kneeA', 'kneeB'];
      const q = j[pts[Math.floor(Math.random() * pts.length)]];
      sb.fx.water(q.x + rand(-0.05, 0.05), q.y - 0.05, 1);
    }
    if (ice.melt >= 1) thaw(man);
  } else ice.melt = Math.max(0, ice.melt - dt * 0.5);
}

/**
 * A blow to a body frozen solid: it cracks the ice, and hard enough snaps a
 * limb off - or shatters the whole thing. o = { part, bone, power, x, y, dir,
 * by, bullet }.
 */
export function iceBlow(man, o) {
  const h = man.health;
  if (!h.frozen || !man.ice || man.removed) return;
  const ice = man.ice, p = o.power || 1;
  ice.cracks = Math.min(8, ice.cracks + 1 + Math.floor(p));
  man.sandbox.fx.shards(o.x ?? man.wj.chest.x, o.y ?? man.wj.chest.y, Math.round(4 + p * 4), (o.dir || 0) * 1.5, 1);
  const limb = o.part && (o.part.startsWith('arm') || o.part.startsWith('leg'));
  if (limb) {
    const bone = o.bone && SEVERABLE_SET.has(o.bone) ? o.bone : (o.part.startsWith('arm') ? 'forearm' : 'tibia') + o.part.slice(-1);
    if (chance(clamp((p - 0.9) * 0.8, 0, 0.95) + (o.bullet ? 0.35 : 0))) snap(man, bone, o.dir || 0, p);
  } else if (chance(clamp((p - 1.8) * 0.5, 0, 1) + (o.bullet ? 0.35 : 0))) {
    shatter(man, o);
  }
}
const SEVERABLE_SET = new Set(['forearmA', 'humerusA', 'forearmB', 'humerusB', 'tibiaA', 'femurA', 'tibiaB', 'femurB']);

/**
 * A frozen body brought up short at `speed` (metres a second): toppling over
 * or a short drop does nothing much, one from three or four metres snaps off
 * whichever limb hit first, and from higher still - or thrown hard - the
 * whole thing goes.
 */
export function iceFall(man, speed) {
  if (!man.health.frozen || speed < 6.5) return;
  const sb = man.sandbox;
  sb.emit('iceThud', { who: man, x: man.wj.hip.x, speed });
  if (speed >= 10.5) { shatter(man, { power: speed / 4 }); return; }
  man.ice.cracks = Math.min(8, man.ice.cracks + 1);
  // the limb lowest down hit first
  let best = null;
  for (const k of Object.keys(SNAP_AT)) {
    const q = man.wj[k];
    if (!q || goneAtJoint(man.cut, k) || (best && q.y >= best.y)) continue;
    if (/^mid/.test(k)) continue;
    best = { y: q.y, name: k };
  }
  if (best && chance((speed - 5.5) * 0.3)) snap(man, SNAP_AT[best.name], sign(man.vel.x), speed / 6);
  else sb.fx.shards(man.wj.hip.x, man.pos.y + 0.05, 8, man.vel.x * 0.3, 0.6);
}

/** One frozen limb off, like an icicle. */
function snap(man, bone, dir, power) {
  if (man.sever(bone, dir, power, { quiet: true })) man.sandbox.emit('iceSnap', { who: man, bone, x: man.wj.chest.x, y: man.wj.chest.y });
}

/** The whole frozen body in pieces: every limb off at the top, ice everywhere, and that is the end of them. */
export function shatter(man, o = {}) {
  const h = man.health, sb = man.sandbox;
  if (!h.frozen || man.removed) return;
  const dir = o.dir || (chance(0.5) ? 1 : -1), power = Math.max(1.5, o.power || 2);
  for (const bone of ['humerusA', 'humerusB', 'femurA', 'femurB']) man.sever(bone, dir * rand(0.2, 1.3) + rand(-0.8, 0.8), power * rand(0.6, 1.2), { quiet: true });
  const c = man.wj.chest;
  sb.fx.shards(c.x, c.y, 40, dir * 2, 2.2);
  if (man.ice) man.ice.cracks = 8;
  // (the shatter first, so whoever sees it has seen that, and then the death)
  sb.emit('shatter', { who: man, x: c.x, y: c.y, by: o.by || null });
  if (!h.dead) { h.kill('shattered'); man.die('shattered', o.by || null, dir, power); }
}

/* ---------------------------- set from the outside ---------------------------- */

/**
 * Their temperature set to t (degrees C): it takes effect straight away -
 * they catch fire, freeze, thaw or go out - and if `lock`, it stays there.
 */
export function setTemperature(man, t, lock = null) {
  if (!hasVitals(man)) return false;
  const h = man.health;
  t = clamp(t, COLDEST, HOTTEST);
  h.temp = t;
  if (lock === true || (lock === null && h.tempLock != null)) h.tempLock = t;
  else if (lock === false) h.tempLock = null;
  if (man.flames && t < 36) extinguish(man, 'cooled');
  if (t >= IGNITE_AT && !h.frozen && canBurn(man)) ignite(man, { power: firePower(t) });
  else if (man.flames && t >= IGNITE_AT) man.flames.power = Math.max(man.flames.power, firePower(t));
  if (t <= FREEZE_AT && !h.frozen && canFreeze(man)) freezeSolid(man);
  // something drastic, and they know it
  man.sandbox.emit('tempSet', { who: man, temp: t });
  if (man.brain && Math.abs(t - NORMAL_TEMP) > 2.5) man.notify('tempShock', { temp: t });
  return true;
}

/** Back to how they were: no fire, no ice, everything where it should be (the heal button). */
export function healVitals(man) {
  if (!hasVitals(man)) return;
  if (man.flames) extinguish(man, 'healed');
  if (man.health.frozen) thaw(man);
  man.ice = null;
  man.smoulder = 0;
  man.char = 0;
  man.charHead = 0;
  man.rolling = 0;
  if (man.vit) { man.vit.warmth = 0; man.vit.air = null; man.vit.airWas = null; }
}

/** Reads a temperature as typed: "40", "-12.5", "104F", "300 K", "37 °C" - or a word. Null if it is not one. */
export function parseTemperature(text) {
  const s = String(text || '').trim().toLowerCase().replace(/,/g, '.');
  if (!s) return null;
  const WORDS = { normal: 37, warm: 38.5, hot: 41, boiling: 100, fire: 300, burning: 300, cold: 33, freezing: -10, frozen: -20, ice: -20 };
  if (s in WORDS) return WORDS[s];
  const m = s.match(/^([+-]?\d+(?:\.\d+)?|[+-]?\.\d+)\s*(?:°|º|deg(?:rees?)?)?\s*(c|celsius|f|fahrenheit|k|kelvin)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const u = (m[2] || 'c')[0];
  const c = u === 'f' ? (n - 32) * 5 / 9 : u === 'k' ? n + COLDEST : n;
  return Math.round(clamp(c, COLDEST, HOTTEST) * 100) / 100;
}

/** A temperature to read: "37.0 °C", "-18 °C", "1200 °C". */
export function fmtTemp(t) {
  const a = Math.abs(t);
  return (a >= 100 ? Math.round(t) : t.toFixed(1)) + ' °C';
}
/** And in Fahrenheit, for whoever thinks in it. */
export const toF = (t) => Math.round(t * 9 / 5 + 32);

/** What is going on with them, for the inspector, worst first. */
export function vitalConditions(man) {
  const out = [];
  if (!hasVitals(man)) return out;
  if (man.flames) out.push(man.rolling > 0 ? 'On fire (rolling it out)' : 'On fire');
  if (man.health.frozen) out.push(man.ice && man.ice.melt > 0.05 ? 'Frozen solid (thawing)' : 'Frozen solid');
  else if (man.smoulder > 0) out.push('Smouldering');
  if (!man.dead && man.vit && man.vit.air === 'choke') out.push('Choking');
  if ((man.char || 0) > 0.35) out.push(man.dead ? 'Charred' : 'Badly burned');
  return out;
}

/* -------------------------------- how it looks -------------------------------- */

const HEAD = [228, 228, 228];
const mixInto = (c, to, k) => { if (k <= 0) return; c[0] = lerp(c[0], to[0], k); c[1] = lerp(c[1], to[1], k); c[2] = lerp(c[2], to[2], k); };

/** The colour of their face: flushed hot, blue with cold or for want of air, blackened by fire. Null when it is just a face. */
export function headFill(man) {
  if (!hasVitals(man)) return null;
  const h = man.health, T = h.temp;
  const hot = clamp01((T - 37.6) / 5) * 0.75;
  const cold = clamp01((35.5 - T) / 12) * 0.85;
  const blue = breathes(man) && !h.dead ? clamp01((0.84 - h.oxygen) / 0.34) * 0.7 : 0;
  const char = (man.charHead || 0) * 0.92 + (man.char || 0) * 0.15;
  if (hot <= 0 && cold <= 0 && blue <= 0 && char <= 0.02) return null;
  const c = HEAD.slice();
  mixInto(c, [246, 178, 160], hot);
  mixInto(c, [190, 214, 240], cold);
  mixInto(c, [170, 182, 228], blue);
  mixInto(c, [52, 40, 33], char);
  return `rgb(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0})`;
}

/** The colour of their lines: frozen, a cold dark blue. */
export function inkFor(man) {
  if (!hasVitals(man)) return null;
  if (man.health.frozen) return '#1c2c3c';
  return null;
}

/** Behind them: the glow of the fire. */
export function drawVitalsBack(ctx, man) {
  const f = man.flames;
  if (!f) return;
  const c = man.wj.chest, s = man.scale;
  const now = man.sandbox.time;
  const r = (0.75 + 0.35 * f.power) * s * (0.94 + 0.06 * Math.sin(now * 13));
  const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
  g.addColorStop(0, `rgba(255, 150, 50, ${0.32 * f.power})`);
  g.addColorStop(1, 'rgba(255, 120, 40, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** In front of them: frost, the ice shell, and the flames. */
export function drawVitalsFront(ctx, man) {
  if (!hasVitals(man)) return;
  const h = man.health;
  if (h.frozen && man.ice) drawIce(ctx, man);
  else if (h.temp < 15) drawFrost(ctx, man, clamp01((15 - h.temp) / 15));
  if (man.flames) drawFlames(ctx, man);
  else if (man.smoulder > 0) drawEmbersOn(ctx, man);
}

// a little noise that stays put: the same number for the same seed every frame
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function drawFlames(ctx, man) {
  const f = man.flames, s = man.scale, now = man.sandbox.time, j = man.wj;
  const lean0 = clamp(-man.vel.x * 0.07, -0.7, 0.7);
  const pt = { x: 0, y: 0 };
  // three passes: the red outside, the orange, the yellow heart
  const layers = [[1, 'rgba(226, 64, 18, 0.55)'], [0.7, 'rgba(255, 140, 30, 0.8)'], [0.38, 'rgba(255, 228, 130, 0.95)']];
  let i = 0;
  const tongues = [];
  const add = (x, y, W, H, lean) => tongues.push([x, y, W, H, lean]);
  for (const p of PARTS) {
    const k = f.parts[p] || 0;
    if (k < 0.04) continue;
    for (const [b, t] of FLAMES[p]) {
      i++;
      if (goneAt(man.cut, b, t)) continue;
      if (p === 'head') { pt.x = j.head.x; pt.y = j.head.y + DIM.headR * s * 0.55; }
      else pointOnBone(j, b, t, pt);
      const seed = i * 7.31 + man.id;
      const flick = 0.72 + 0.2 * Math.sin(now * (9 + hash(seed) * 6) + seed) + 0.12 * Math.sin(now * 23 + seed * 2.1);
      const H = (0.17 + 0.17 * hash(seed + 1)) * (p === 'head' ? 1.4 : 1) * k * (0.6 + 0.4 * f.power) * s * flick;
      const W = (0.05 + 0.03 * hash(seed + 2)) * s * (0.65 + 0.35 * k);
      const lean = lean0 + 0.14 * Math.sin(now * 5.3 + seed);
      add(pt.x + (hash(seed + 3) - 0.5) * 0.05 * s, pt.y, W, H, lean);
    }
  }
  // and, well alight, great sheets of it off the back and the head
  const big = Math.min(f.parts.torso || 0, f.power);
  if (big > 0.45) {
    for (const [q, n] of [[j.chest, 0], [j.neck, 1], [j.head, 2]]) {
      const seed = 97 + n * 13 + man.id;
      const flick = 0.75 + 0.25 * Math.sin(now * (7 + n) + seed);
      add(q.x, q.y, 0.075 * s, (0.3 + 0.12 * n) * big * s * flick, lean0 + 0.18 * Math.sin(now * 4 + seed));
    }
  }
  for (const [k, colour] of layers) {
    ctx.fillStyle = colour;
    for (const [x, y, W, H, lean] of tongues) tongue(ctx, x, y, W * k, H * (0.45 + 0.55 * k), lean);
  }
}

/** One flame: round at the bottom, licking up to a point, leaning with the wind. */
function tongue(ctx, bx, by, w, h, lean) {
  const sx = Math.sin(lean), cy = Math.cos(lean);
  const tx = bx + sx * h, ty = by + cy * h;
  const mx = bx + sx * h * 0.35, my = by + cy * h * 0.35;
  ctx.beginPath();
  ctx.moveTo(bx - w, by);
  ctx.quadraticCurveTo(mx - w * 1.1, my, tx, ty);
  ctx.quadraticCurveTo(mx + w * 1.1, my, bx + w, by);
  ctx.arc(bx, by, w, 0, -Math.PI, true);
  ctx.closePath();
  ctx.fill();
}

/** The last of it, glowing here and there. */
function drawEmbersOn(ctx, man) {
  const now = man.sandbox.time, j = man.wj, s = man.scale;
  const k = Math.min(1, man.smoulder / 2);
  const pts = ['chest', 'hip', 'elbowA', 'kneeA', 'handB'];
  for (let i = 0; i < pts.length; i++) {
    const q = j[pts[i]];
    const a = k * (0.5 + 0.5 * Math.sin(now * 6 + i * 2.3));
    ctx.fillStyle = `rgba(255, 120, 30, ${0.8 * a})`;
    ctx.beginPath();
    ctx.arc(q.x + (hash(i + man.id) - 0.5) * 0.04, q.y, 0.016 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Frost on them: white crystals along the limbs and across the top of the head. */
function drawFrost(ctx, man, k) {
  const j = man.wj, s = man.scale, r = DIM.headR * s;
  ctx.strokeStyle = `rgba(236, 248, 255, ${0.35 + 0.5 * k})`;
  ctx.lineWidth = 0.007 * s;
  ctx.lineCap = 'round';
  const n = Math.round(30 * k);
  const pt = { x: 0, y: 0 };
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const b = [0, 1, 3, 4, 5, 6, 7, 8, 10, 11][Math.floor(hash(i + man.id * 3) * 10)];
    const t = hash(i * 1.7 + man.id);
    if (goneAt(man.cut, b, t)) continue;
    pointOnBone(j, b, t, pt);
    const z = (0.012 + 0.012 * hash(i + 9)) * s;
    for (let a = 0; a < 3; a++) {
      const ang = (a / 3) * Math.PI + hash(i) * 2;
      const dx = Math.cos(ang) * z, dy = Math.sin(ang) * z;
      ctx.moveTo(pt.x - dx, pt.y - dy);
      ctx.lineTo(pt.x + dx, pt.y + dy);
    }
  }
  ctx.stroke();
  // the head: a rime round the top of it
  ctx.strokeStyle = `rgba(232, 246, 255, ${0.25 + 0.55 * k})`;
  ctx.lineWidth = DIM.line * s * 0.45;
  ctx.beginPath();
  const top = Math.PI / 2;
  ctx.arc(j.head.x, j.head.y, r, top - 1.1 * k, top + 1.1 * k);
  ctx.stroke();
}

/** Frozen solid: the body in a clear blue shell, catching the light, icicles hanging off it, cracked where it was hit. */
function drawIce(ctx, man) {
  const j = man.wj, s = man.scale, ice = man.ice;
  const a = clamp01(1 - ice.melt);
  if (a <= 0) return;
  const cut = man.cut || {};
  const chains = [['hip', 'chest', 'neck', 'head']];
  // (a limb cut off ends where it was cut)
  const arm = (side) => {
    const c = cut['arm' + side];
    return !c ? ['shoulder', 'elbow' + side, 'hand' + side] : c.startsWith('midHum') ? ['shoulder', c] : ['shoulder', 'elbow' + side, c];
  };
  const leg = (side) => {
    const c = cut['leg' + side];
    return !c ? ['hip', 'knee' + side, 'foot' + side, 'toe' + side] : c.startsWith('midFem') ? ['hip', c] : ['hip', 'knee' + side, c];
  };
  chains.push(arm('A'), arm('B'), leg('A'), leg('B'));
  ctx.save();
  ctx.globalAlpha = a;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // the shell
  ctx.strokeStyle = 'rgba(170, 216, 250, 0.38)';
  ctx.lineWidth = 0.17 * s;
  ctx.beginPath();
  for (const ch of chains) {
    ctx.moveTo(j[ch[0]].x, j[ch[0]].y);
    for (let i = 1; i < ch.length; i++) ctx.lineTo(j[ch[i]].x, j[ch[i]].y);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(176, 220, 252, 0.4)';
  ctx.beginPath();
  ctx.arc(j.head.x, j.head.y, (DIM.headR + 0.06) * s, 0, Math.PI * 2);
  ctx.fill();
  // the light catching it
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 0.012 * s;
  ctx.beginPath();
  for (const ch of chains) {
    for (let i = 1; i < ch.length; i++) {
      const p = j[ch[i - 1]], q = j[ch[i]];
      const dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy) || 1;
      const ox = (-dy / L) * 0.05 * s, oy = (dx / L) * 0.05 * s;
      ctx.moveTo(p.x + (q.x - p.x) * 0.2 + ox, p.y + (q.y - p.y) * 0.2 + oy);
      ctx.lineTo(p.x + (q.x - p.x) * 0.55 + ox, p.y + (q.y - p.y) * 0.55 + oy);
    }
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(j.head.x, j.head.y, (DIM.headR + 0.03) * s, 1.9, 2.6);
  ctx.stroke();
  // icicles off whatever hangs lowest on each limb, and off the chin
  ctx.fillStyle = 'rgba(214, 238, 255, 0.85)';
  const hang = (q, len) => {
    ctx.beginPath();
    ctx.moveTo(q.x - 0.018 * s, q.y - 0.03 * s);
    ctx.lineTo(q.x, q.y - (0.03 + len) * s);
    ctx.lineTo(q.x + 0.018 * s, q.y - 0.03 * s);
    ctx.closePath();
    ctx.fill();
  };
  for (const k of ['elbowA', 'handA', 'elbowB', 'handB', 'kneeA', 'kneeB']) {
    if (goneAtJoint(cut, k)) continue;
    hang(j[k], 0.05 + 0.06 * hash(ice.seed + k.length + (k.endsWith('A') ? 1 : 2)));
  }
  hang({ x: j.head.x, y: j.head.y - DIM.headR * s }, 0.06);
  // cracks, where it took a blow
  if (ice.cracks > 0) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 0.008 * s;
    ctx.beginPath();
    for (let i = 0; i < ice.cracks; i++) {
      const b = [0, 1, 3, 5, 7, 10][Math.floor(hash(ice.seed + i * 3.3) * 6)];
      const p0 = pointOnBone(j, b, 0.2 + 0.6 * hash(ice.seed + i));
      let x = p0.x, y = p0.y;
      ctx.moveTo(x, y);
      for (let n = 0; n < 4; n++) {
        x += (hash(ice.seed + i * 7 + n) - 0.5) * 0.1 * s;
        y += (hash(ice.seed + i * 5 + n * 3) - 0.5) * 0.1 * s;
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}
function goneAtJoint(cut, k) {
  const side = k.slice(-1);
  if (k.startsWith('elbow')) return !!cut['arm' + side] && cut['arm' + side] === 'midHum' + side;
  if (k.startsWith('hand')) return !!cut['arm' + side];
  if (k.startsWith('knee')) return !!cut['leg' + side] && cut['leg' + side] === 'midFem' + side;
  if (k.startsWith('foot') || k.startsWith('toe')) return !!cut['leg' + side];
  return false;
}

/** A severed piece that came off frozen: still in its ice. */
export function drawIcedLimb(ctx, pts, lw) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(170, 216, 250, 0.42)';
  ctx.lineWidth = lw * 2.4;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.lineWidth = lw * 0.18;
  ctx.stroke();
  ctx.restore();
}

