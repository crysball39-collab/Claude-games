/* =============================================================================
   SUPER STRENGTH - everything they do with their body, three times over: a
   punch that would knock somebody down sends them across the room, a blow
   that would send them back a step barely rocks them, and nothing is too
   heavy to pick up.

   The moves:
     Mega Punch       wound right back, and a punch that sends them flying
     Ground Pound     both fists into the floor: a shockwave, everybody over
     Heave            the heaviest thing near them, overhead, and thrown
     Overhead Toss    picked up over their head, and thrown across the room
     Bear Hug         held, and squeezed until something gives
     Launcher         an uppercut that puts them high in the air
     Thunder Clap     hands together hard enough to knock people off their feet
     Quake Stomp      a stamp that shakes the ground: everybody stumbles
     Wall Breaker     a charge, shoulder first, through anything in the way
     Lift & Slam      up over their head, and down into the floor
   ========================================================================== */
import { alive, awake, now, seize, holding, holdAt, letGo, strike, fling, shockwave, Grip, looseNear, setPhase, besideX, say, clamp, sign, rand, chance } from './common.js';
import { Cracks, Ring } from './fx.js';
// (the game's gravity, as stickman.js has it: not imported, so the two files do not need each other)
const G = 18;

/** On foot, up to them: true once they are within `gap` and ready to do something. */
function closeOnFoot(man, m, o, gap = 0.85, speed = 'run') {
  const d = Math.abs(o.pos.x - man.pos.x);
  if (d > gap + 0.15) { man.goTo(besideX(man, o, gap), speed); return false; }
  man.stop();
  man.faceTo(o.pos.x);
  return man.ready;
}
const chest = (o) => o.wj.chest;
const hands = (man) => ({ x: (man.wj.handA.x + man.wj.handB.x) / 2, y: (man.wj.handA.y + man.wj.handB.y) / 2 });
const endHold = (man, m) => { if (m.o && holding(man, m.o)) letGo(man, m.o, 0, 0); };
const act = (man, clip, o = {}) => man.anim.act(clip, { fadeIn: 0.05, fadeOut: 0.15, ...o });

const MOVES = {
  megaPunch: {
    label: 'Mega Punch', say: 'pwMegaPunch', cool: 7, max: 6, clips: ['megaWind', 'megaPunch'],
    want: (me, o, c) => (c.d < 5 && !o.lying && !o.heldBy ? 1.3 : 0),
    step(man, m) {
      const o = m.o;
      if (!alive(o)) return false;
      const dir = sign(o.pos.x - man.pos.x) || man.facing;
      switch (m.phase) {
        case 'start': setPhase(m, 'approach'); return true;
        case 'approach':
          if (!closeOnFoot(man, m, o, 0.85)) return m.pt < 4;
          act(man, 'megaWind');
          setPhase(m, 'wind');
          return true;
        case 'wind':
          man.faceTo(o.pos.x);
          if (m.pt > 0.38) { act(man, 'megaPunch', { fadeIn: 0.02 }); setPhase(m, 'punch'); }
          return true;
        case 'punch':
          if (m.pt > 0.07 && !m.data.hit) {
            m.data.hit = true;
            const d = Math.abs(o.pos.x - man.pos.x);
            if (d < 1.4 && Math.abs(o.pos.y - man.pos.y) < 1) {
              strike(man, o, { part: o.lying ? 'torso' : chance(0.6) ? 'head' : 'torso', power: 3.6, weapon: 'superBlow', dir, launch: { x: dir * 15, y: 4.5 } });
              man.sandbox.effects.push(new Ring(man.wj.handA.x, man.wj.handA.y, 0.9, 0.25));
            }
            man.sandbox.emit('megaPunch', { who: man, target: o, x: man.wj.handA.x, y: man.wj.handA.y, loud: true });
          }
          return m.pt < 0.45;
      }
      return false;
    },
  },

  groundPound: {
    label: 'Ground Pound', say: 'pwGroundPound', cool: 10, max: 4, needs: 'none', clips: ['groundPound'],
    want: (me, o, c) => (c.d < 3.6 && me.onGround && crowd(me, 4) >= 1 ? 1 + crowd(me, 4) * 0.3 : 0),
    start(man) { return man.onGround && man.state === 'stand'; },
    step(man, m) {
      switch (m.phase) {
        case 'start':
          man.stop();
          if (m.o && alive(m.o)) man.faceTo(m.o.pos.x);
          if (!man.ready) return m.pt < 1;
          act(man, 'groundPound', { fadeIn: 0.05, fadeOut: 0.3 });
          setPhase(m, 'pound');
          return true;
        case 'pound':
          if (m.pt > 0.46 && !m.data.hit) {
            m.data.hit = true;
            const x = man.pos.x + man.facing * 0.35;
            shockwave(man, x, man.pos.y, 4.4, 2.8);
            if (man.pos.y < 0.05) man.sandbox.effects.push(new Cracks(x, 1.1));
            man.sandbox.effects.push(new Ring(x, man.pos.y + 0.1, 4.4, 0.45, true));
            man.sandbox.emit('groundPound', { who: man, x, y: man.pos.y, loud: true });
          }
          return m.pt < 1.1;
      }
      return false;
    },
  },

  heave: {
    label: 'Heave', say: 'pwHeave', cool: 9, max: 9, clips: ['heaveLift', 'heaveThrow'],
    want: (me, o, c) => (c.d > 2.5 && c.d < 12 && heavyNear(me) ? 1.1 : 0),
    start(man, m) { m.data.thing = heavyNear(man); return !!m.data.thing; },
    step(man, m, dt) {
      const o = m.o, T = m.data.thing;
      if (!T || T.removed || T.wornBy) return false;
      const b = T.body;
      switch (m.phase) {
        case 'start': setPhase(m, 'walk'); return true;
        case 'walk': {
          const d = b.pos.x - man.pos.x;
          if (Math.abs(d) > 0.9) { man.goTo(b.pos.x - sign(d) * 0.7, 'run'); return m.pt < 5; }
          man.stop(); man.faceTo(b.pos.x);
          if (!man.ready) return m.pt < 6;
          act(man, 'heaveLift', { fadeOut: 0.1 });
          m.data.grip = new Grip(man.sandbox, T, b.pos.x, b.pos.y, { hz: 5, damping: 0.9, by: man });
          if (!m.data.grip.ok) return false;
          setPhase(m, 'lift');
          return true;
        }
        case 'lift': case 'aim': {
          const gp = m.data.grip;
          if (!gp.ok) return false;
          const k = Math.min(1, m.pt / 0.5);
          const top = man.pos.y + 2.15 * man.scale;
          gp.to(man.pos.x, m.phase === 'lift' ? b.pos.y + (top - b.pos.y) * k : top, dt);
          if (o && alive(o)) man.faceTo(o.pos.x);
          if (m.phase === 'lift' && m.pt > 0.55) setPhase(m, 'aim');
          if (m.phase === 'aim' && m.pt > 0.3) { act(man, 'heaveThrow', { fadeIn: 0.03 }); setPhase(m, 'throw'); }
          return true;
        }
        case 'throw': {
          const gp = m.data.grip;
          if (!gp.ok) return false;
          if (m.pt < 0.12) { gp.to(man.pos.x - man.facing * 0.2, man.pos.y + 2.25, dt); return true; }
          // a lob that comes down on them
          const tx = o && alive(o) ? o.wj.chest.x : man.pos.x + man.facing * 8, ty = o && alive(o) ? o.wj.chest.y : 1;
          const dx = tx - b.pos.x, vx = sign(dx || man.facing) * clamp(Math.abs(dx) * 1.6, 7, 16);
          const t = Math.max(0.25, Math.abs(dx) / Math.abs(vx));
          const vy = clamp((ty - b.pos.y + 0.5 * G * t * t) / t, -2, 14);
          gp.release(vx, vy, man);
          man.sandbox.emit('heave', { who: man, target: o, what: T, x: b.pos.x, y: b.pos.y, loud: true });
          setPhase(m, 'after');
          return true;
        }
        case 'after': return m.pt < 0.4;
      }
      return false;
    },
    end(man, m) { if (m.data.grip && !m.data.grip.dead) m.data.grip.release(0, 0, man); },
  },

  overheadToss: {
    label: 'Overhead Toss', say: 'pwOverheadToss', cool: 8, max: 7, clips: ['liftOverhead', 'heaveThrow'],
    want: (me, o, c) => (c.d < 5 && !o.heldBy ? 1 : 0),
    step(man, m, dt) {
      const o = m.o;
      if (!alive(o) && !(o && !o.removed)) return false;
      switch (m.phase) {
        case 'start': setPhase(m, 'approach'); return true;
        case 'approach':
          if (!closeOnFoot(man, m, o, 0.6)) return m.pt < 4;
          if (!seize(man, o, chest(o).x, chest(o).y)) return false;
          act(man, 'liftOverhead', { fadeOut: 0.05 });
          setPhase(m, 'lift');
          if (o.brain) o.brain.speak('pwLiftedUp', { other: man.name }, 0.7, man, true);
          return true;
        case 'lift': {
          if (!holding(man, o)) return false;
          const h = hands(man);
          holdAt(man, o, h.x, h.y + 0.1, 0, 0);
          if (m.pt > 0.75) { act(man, 'heaveThrow', { fadeIn: 0.03 }); setPhase(m, 'throw'); }
          return true;
        }
        case 'throw': {
          if (!holding(man, o)) return false;
          const h = hands(man);
          holdAt(man, o, h.x, h.y, man.facing * 6, 4);
          if (m.pt > 0.11) {
            letGo(man, o, man.facing * 16, 7.5);
            man.sandbox.emit('overheadToss', { who: man, target: o, x: h.x, y: h.y, loud: true });
            setPhase(m, 'after');
          }
          return true;
        }
        case 'after': return m.pt < 0.5;
      }
      return false;
    },
    end(man, m) { endHold(man, m); },
  },

  bearHug: {
    label: 'Bear Hug', say: 'pwBearHug', cool: 12, max: 6, clips: ['bearHug'],
    want: (me, o, c) => (c.d < 3 && !o.heldBy && !o.lying && c.r.anger > 0.6 ? 0.8 : 0),
    step(man, m, dt) {
      const o = m.o;
      if (!o || o.removed) return false;
      switch (m.phase) {
        case 'start': setPhase(m, 'approach'); return true;
        case 'approach':
          if (!closeOnFoot(man, m, o, 0.45)) return m.pt < 4;
          if (!seize(man, o, chest(o).x, chest(o).y)) return false;
          act(man, 'bearHug', { fadeOut: 0.2 });
          setPhase(m, 'squeeze');
          return true;
        case 'squeeze': {
          if (!holding(man, o)) return false;
          const c = man.wj.chest;
          holdAt(man, o, c.x + man.facing * 0.24, c.y - 0.02, 0, 0);
          m.data.tick = (m.data.tick ?? 0.3) - dt;
          if (m.data.tick <= 0 && !o.dead) {
            m.data.tick = 0.32;
            o.takeHit({ by: man, part: 'torso', x: o.wj.chest.x, y: o.wj.chest.y, dir: man.facing, power: 1.1, kind: 'impact', weapon: 'crush', bone: 'ribs' });
            o.health.oxygen = Math.max(0, (o.health.oxygen ?? 1) - 0.09);
            if (o.brain && chance(0.4)) o.brain.speak('pwCrushed', { other: man.name }, 0.8, man, true);
            man.sandbox.emit('crush', { who: man, target: o, x: o.wj.chest.x, y: o.wj.chest.y });
          }
          if (m.pt > 1.8) { letGo(man, o, man.facing * 1.5, 0); setPhase(m, 'after'); }
          return true;
        }
        case 'after': return m.pt < 0.4;
      }
      return false;
    },
    end(man, m) { endHold(man, m); },
  },

  launcher: {
    label: 'Launcher', say: 'pwLauncher', cool: 8, max: 5, clips: ['launchUppercut'],
    want: (me, o, c) => (c.d < 4 && !o.lying && !o.heldBy && o.state !== 'thrown' ? 1 : 0),
    step(man, m) {
      const o = m.o;
      if (!alive(o)) return false;
      const dir = sign(o.pos.x - man.pos.x) || man.facing;
      switch (m.phase) {
        case 'start': setPhase(m, 'approach'); return true;
        case 'approach':
          if (!closeOnFoot(man, m, o, 0.75)) return m.pt < 4;
          act(man, 'launchUppercut', { fadeIn: 0.04 });
          setPhase(m, 'hit');
          return true;
        case 'hit':
          if (m.pt > 0.15 && !m.data.hit) {
            m.data.hit = true;
            strike(man, o, { part: 'head', power: 2.6, weapon: 'superBlow', dir, launch: { x: dir * 1.2, y: 17 } });
            man.sandbox.emit('launched', { who: o, by: man, x: o.pos.x, y: o.pos.y + 1, loud: true });
          }
          return m.pt < 0.55;
      }
      return false;
    },
  },

  thunderClap: {
    label: 'Thunder Clap', say: 'pwThunderClap', cool: 11, max: 3, needs: 'none', clips: ['thunderClap'],
    want: (me, o, c) => (c.d < 5 && inFront(me, 5) >= 1 ? 0.9 + inFront(me, 5) * 0.25 : 0),
    start(man) { return man.state === 'stand' && man.onGround; },
    step(man, m) {
      switch (m.phase) {
        case 'start':
          man.stop();
          if (m.o && alive(m.o)) man.faceTo(m.o.pos.x);
          if (!man.ready) return m.pt < 1;
          act(man, 'thunderClap', { fadeOut: 0.25 });
          setPhase(m, 'clap');
          return true;
        case 'clap':
          if (m.pt > 0.32 && !m.data.hit) {
            m.data.hit = true;
            const h = hands(man), sb = man.sandbox;
            shockwave(man, h.x, h.y - 0.4, 6, 2.1, { cone: man.facing, lift: 0.6 });
            // and the bang: everybody near enough has their ears ringing
            for (const p of sb.people) {
              if (p === man || !awake(p)) continue;
              const d = Math.hypot(p.pos.x - h.x, p.pos.y - h.y);
              if (d < 8) p.health.dizzy = Math.min(4, (p.health.dizzy || 0) + 1.6 * (1 - d / 8));
            }
            for (const w of sb.slabs) {
              if (w.removed || !w.mat || w.mat.name !== 'glass') continue;
              const c = w.body.pos, d = (c.x - h.x) * man.facing;
              if (d > 0 && d < 5 && w.damage) w.damage(c.x - man.facing * 0.05, h.y, 0.3, 2.2, 'blast', { dx: man.facing, dy: 0, speed: 4 });
            }
            sb.effects.push(new Ring(h.x, h.y, 2.4, 0.35));
            sb.emit('thunderClap', { who: man, x: h.x, y: h.y, loud: true });
          }
          return m.pt < 0.9;
      }
      return false;
    },
  },

  quakeStomp: {
    label: 'Quake Stomp', say: 'pwQuakeStomp', cool: 9, max: 3, needs: 'none', clips: ['quakeStomp'],
    want: (me, o, c) => (c.d < 5 && crowd(me, 6) >= 1 ? 0.8 + crowd(me, 6) * 0.2 : 0),
    start(man) { return man.state === 'stand' && man.onGround; },
    step(man, m) {
      switch (m.phase) {
        case 'start':
          man.stop();
          if (!man.ready) return m.pt < 1;
          act(man, 'quakeStomp', { fadeOut: 0.2 });
          setPhase(m, 'stomp');
          return true;
        case 'stomp':
          if (m.pt > 0.34 && !m.data.hit) {
            m.data.hit = true;
            const sb = man.sandbox, x = man.wj.footA.x;
            shockwave(man, x, man.pos.y, 2.6, 1.6, { lift: 0.5 });
            // the floor shakes: everybody standing further out loses their footing
            for (const p of sb.people) {
              if (p === man || !awake(p) || p.state !== 'stand') continue;
              const d = Math.abs(p.pos.x - x);
              if (d < 2.6 || d > 8 || Math.abs(p.pos.y - man.pos.y) > 1) continue;
              p.balance -= 0.9 * (1 - d / 8);
              if (chance(0.6 * (1 - d / 8))) p.knockDown(sign(p.pos.x - x) || 1, 0.8);
            }
            if (man.pos.y < 0.05) sb.effects.push(new Cracks(x, 0.8));
            sb.emit('quakeStomp', { who: man, x, y: man.pos.y, loud: true });
          }
          return m.pt < 0.8;
      }
      return false;
    },
  },

  wallBreaker: {
    label: 'Wall Breaker', say: 'pwWallBreaker', cool: 9, max: 6, clips: ['shoulderCharge'],
    want: (me, o, c) => (c.d > 2 && c.d < 10 && !o.lying ? (wallBetween(me, o) ? 1.4 : 0.6) : 0),
    step(man, m, dt) {
      const o = m.o;
      if (!alive(o)) return false;
      switch (m.phase) {
        case 'start':
          m.data.dir = sign(o.pos.x - man.pos.x) || man.facing;
          m.data.x0 = man.pos.x;
          m.data.broke = new Set();
          setPhase(m, 'charge');
          return true;
        case 'charge': {
          const dir = m.data.dir, sb = man.sandbox;
          man.facing = dir;
          man.vel.x = dir * 10;
          if (man.anim.actionName !== 'shoulderCharge') man.anim.act('shoulderCharge', { fadeIn: 0.08, fadeOut: 0.2 });
          // anything standing in the way gets a hole through it the size of a person
          for (const w of sb.slabs) {
            if (w.removed || w.background || m.data.broke.has(w)) continue;
            const bb = w.body.aabb();
            if (bb.minY > man.pos.y + 1.6 || bb.maxY < man.pos.y + 0.2) continue;
            const face = dir > 0 ? bb.minX : bb.maxX;
            if ((face - man.pos.x) * dir < 0.45 && (face - man.pos.x) * dir > -0.2) {
              m.data.broke.add(w);
              for (const yy of [0.35, 0.75, 1.15, 1.55]) if (w.damage) w.damage(face + dir * 0.05, man.pos.y + yy, 0.42, 60, 'blunt', { dx: dir, dy: 0, speed: 10, bulk: true });
              sb.fx.dust(face, man.pos.y + 1, 18, 1.4);
              sb.emit('wallSmash', { who: man, wall: w, x: face, y: man.pos.y + 1, loud: true });
            }
          }
          for (const c of sb.crates) {
            if (c.removed || c.carriedBy) continue;
            const d = (c.body.pos.x - man.pos.x) * dir;
            if (d > 0 && d < 0.6 && Math.abs(c.body.pos.y - man.pos.y - 0.5) < 1) c.body.applyImpulse(dir * 14 * c.body.mass, 4 * c.body.mass, c.body.pos.x, c.body.pos.y);
          }
          const d = (o.pos.x - man.pos.x) * dir;
          if (d < 0.6 && d > -0.4 && Math.abs(o.pos.y - man.pos.y) < 1.2) {
            strike(man, o, { part: 'torso', power: 2.5, weapon: 'superBlow', dir, launch: { x: dir * 11, y: 3.5 } });
            setPhase(m, 'stop');
          }
          if (Math.abs(man.pos.x - m.data.x0) > 12 || m.pt > 2) setPhase(m, 'stop');
          return true;
        }
        case 'stop':
          man.vel.x *= Math.exp(-dt * 8);
          return m.pt < 0.4;
      }
      return false;
    },
    end(man) { if (man.anim.actionName === 'shoulderCharge') man.anim.stopAction(0.2); },
  },

  liftSlam: {
    label: 'Lift & Slam', say: 'pwLiftSlam', cool: 9, max: 7, clips: ['liftOverhead', 'slamDown'],
    want: (me, o, c) => (c.d < 5 && !o.heldBy ? 1.1 : 0),
    step(man, m) {
      const o = m.o;
      if (!o || o.removed) return false;
      switch (m.phase) {
        case 'start': setPhase(m, 'approach'); return true;
        case 'approach':
          if (!closeOnFoot(man, m, o, 0.55)) return m.pt < 4;
          if (!seize(man, o, chest(o).x, chest(o).y)) return false;
          act(man, 'liftOverhead', { fadeOut: 0.05 });
          setPhase(m, 'lift');
          if (o.brain) o.brain.speak('pwLiftedUp', { other: man.name }, 0.7, man, true);
          return true;
        case 'lift': {
          if (!holding(man, o)) return false;
          const h = hands(man);
          holdAt(man, o, h.x, h.y + 0.1, 0, 0);
          if (m.pt > 0.8) { act(man, 'slamDown', { fadeIn: 0.03, fadeOut: 0.3 }); setPhase(m, 'slam'); }
          return true;
        }
        case 'slam': {
          if (!holding(man, o)) return m.pt < 0.6;
          const h = hands(man);
          holdAt(man, o, h.x, h.y, man.facing * 2, -10);
          if (m.pt > 0.12) {
            letGo(man, o, man.facing * 1.5, -23);
            const x = man.pos.x + man.facing * 0.9;
            man.sandbox.later(0.12, () => {
              shockwave(man, x, man.pos.y, 1.8, 1.1, { spare: o });
              if (man.pos.y < 0.05) man.sandbox.effects.push(new Cracks(x, 0.6));
            });
            man.sandbox.emit('slamDown', { who: man, target: o, x, y: man.pos.y, loud: true });
            setPhase(m, 'after');
          }
          return true;
        }
        case 'after': return m.pt < 0.6;
      }
      return false;
    },
    end(man, m) { endHold(man, m); },
  },
};

/** How many people (not them) are standing within r. */
function crowd(me, r) {
  let n = 0;
  for (const p of me.sandbox.people) if (p !== me && awake(p) && !p.lying && Math.abs(p.pos.x - me.pos.x) < r && Math.abs(p.pos.y - me.pos.y) < 1.5) n++;
  return n;
}
/** How many people are standing in front of them, within r. */
function inFront(me, r) {
  let n = 0;
  for (const p of me.sandbox.people) {
    if (p === me || !awake(p) || p.lying) continue;
    const d = (p.pos.x - me.pos.x) * me.facing;
    if (d > 0 && d < r && Math.abs(p.pos.y - me.pos.y) < 1.5) n++;
  }
  return n;
}
/** The heaviest thing within 5 m that they could pick up and throw. */
function heavyNear(me) {
  const list = looseNear(me.sandbox, me.pos.x, me.pos.y + 0.4, 5, { max: 10 });
  let best = null;
  for (const t of list) if (!best || t.body.mass > best.body.mass) best = t;
  return best && best.body.mass >= 1.5 ? best : null;
}
/** A wall standing between them and `o`. */
function wallBetween(me, o) {
  const a = Math.min(me.pos.x, o.pos.x), b = Math.max(me.pos.x, o.pos.x);
  for (const w of me.sandbox.slabs) {
    if (w.removed || w.background || w.loose) continue;
    const bb = w.body.aabb();
    if (bb.maxX > a && bb.minX < b && bb.minY < me.pos.y + 1.2 && bb.maxY > me.pos.y + 0.4) return w;
  }
  return null;
}

export const STRENGTH = {
  key: 'Strength', name: 'Super Strength', chip: 'Super strong',
  felt: "My hands feel like they could go through a wall. I don't know my own strength.",
  moves: MOVES,
  gain(man, st) { st.base = man.strength; man.strength = man.strength * 3.2; },
  lose(man, st) { man.strength = st.base ?? 1; },
  steady() { return 0.35; },
  /** A blow of theirs, landing: hard enough, it sends them off their feet and across the floor. */
  landed(man, st, o, hit, power) {
    if (!alive(o) || o.state === 'held' || o.lying || (o.species && o.species.giant)) return;
    if (power < 2.4 || !chance(power > 4 ? 0.8 : 0.35)) return;
    o.launch(man.facing * Math.min(11, power * 2.1), 2 + Math.min(3, power * 0.35));
  },
};
