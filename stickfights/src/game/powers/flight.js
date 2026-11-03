/* =============================================================================
   FLIGHT - up off the ground and wherever they like: hovering a metre or two
   up, flying where their brain would have walked, out of reach of whatever
   they are running from, and down again on their feet.

   The moves:
     Sky Toss       grab them, fly straight up, and throw them down at the ground
     Wall Pin       grab them, fly them into the nearest wall, pin them there
                    and punch them twice
     Kick & Slam    a kick that sends them up, after them, and slam them down
     Dive Bomb      up high over them, and straight down feet first: a crater
     Tackle         low and fast into them, carry them along, drive them down
     Air Juggle     an uppercut into the air, two more on the way, a kick away
     Spin Throw     by the ankle, round and round in the air, and let go
     Sky Drop       grab them, up as high as it goes, and let go
     Fly-by         past them at speed, a fist on the way through
     Airlift        a friend in trouble picked up and flown out of it
   ========================================================================== */
import { alive, awake, now, seize, holding, holdAt, letGo, strike, fling, shockwave, setPhase, besideX, wallBeside, say, clamp, sign, rand, chance } from './common.js';
import { Cracks, Wind } from './fx.js';

const HOVER = 1.5;        // how high they hang about, off whatever is under them (m)
const CRUISE = 7.5;       // how fast they fly, getting somewhere (m/s)

/** The height of whatever is under them. */
export function groundAt(man, x = man.pos.x) {
  const s = man.sandbox.surfaceBelow(x, 0.1, Math.max(man.pos.y, 0) + 0.05, man);
  return s ? s.y : 0;
}

export function takeOff(man, st, vy = 3.5) {
  if (st.flying) return true;
  if (man.rag || man.dead || !man.conscious || man.cuffed || (man.state !== 'stand' && man.state !== 'air')) return false;
  man.dropCarried();
  man.anim.stopAction(0.06);
  man.setState('air');
  man.onGround = false;
  man.support = null;
  man.jumpPending = null;
  man.vel.y = Math.max(man.vel.y, vy);
  man.gravity = 0;
  st.flying = true;
  st.landing = false;
  st.flyT = 0;
  man.sandbox.emit('pwTakeoff', { who: man, x: man.pos.x, y: man.pos.y });
  man.sandbox.fx.dust(man.pos.x, man.pos.y, 6, 0.6);
  return true;
}

/** Down onto their feet, gently, wherever they are. */
export function land(man, st) { if (st.flying) st.landing = true; }

/** Where a flier is going, and how fast at most (a move sets these; otherwise, wherever their brain is going). */
function goal(man, st) {
  if (st.goal) return st.goal;
  const gx = man.intent.x ?? man.pos.x;
  if (st.landing) return { x: gx, y: groundAt(man, gx) - 0.3 };
  // (running from something, high up out of its reach)
  const h = st.high ? 3.6 : HOVER;
  return { x: gx, y: groundAt(man, gx) + h + Math.sin(st.t * 2.3) * 0.07 };
}

/* ------------------------------------ moves ----------------------------------- */

/** Where somebody is held in front of them: their hands, a little out. */
const hands = (man) => {
  const a = man.wj.handA, b = man.wj.handB;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
};
const flyTo = (st, x, y, max = 9, accel = 6) => { st.goal = { x, y }; st.max = max; st.accel = accel; };
const at = (man, g, r = 0.35) => Math.hypot(g.x - man.pos.x, g.y - man.pos.y) < r;
const chest = (o) => o.wj.chest;
/** Hovering where they are, watching, until it is time to come down. */
function after(man, m, st, dt, wait = 0.7) {
  if (!st.goal) flyTo(st, man.pos.x, man.pos.y, 3);
  st.clip = null;
  if (m.o && alive(m.o)) man.faceTo(m.o.pos.x);
  if (m.pt > wait) { st.goal = null; if (!st.stay) land(man, st); return false; }
  return true;
}
/** Fly in beside them, at the height to take hold of them by the chest. */
function closeIn(man, m, st, o, { max = 10, gap = 0.55 } = {}) {
  takeOff(man, st);
  const c = chest(o), side = sign(man.pos.x - o.pos.x) || -man.facing;
  const g = { x: c.x + side * gap, y: c.y - 0.95 };
  flyTo(st, g.x, g.y, max);
  st.clip = 'flyReach';
  man.facing = -side;
  return at(man, g, 0.4) || Math.abs(man.pos.x - g.x) < 0.3 && Math.abs(man.pos.y - g.y) < 0.6;
}
const tooLong = (m, t) => m.pt > t;
const endHold = (man, m) => { if (m.o && holding(man, m.o)) letGo(man, m.o, man.vel.x * 0.5, man.vel.y * 0.5); };

const MOVES = {
  skyToss: {
    label: 'Sky Toss', say: 'pwSkyToss', cool: 9, max: 9, clips: ['flyThrowDown'],
    want: (me, o, c) => (c.d < 10 && !o.heldBy && !(o.species && o.species.giant) ? 1 + (c.r.anger > 0.8 ? 0.6 : 0) : 0),
    step(man, m, dt, st) {
      const o = m.o;
      if (!o || o.removed) return false;
      switch (m.phase) {
        case 'start': setPhase(m, 'approach'); return true;
        case 'approach':
          if (closeIn(man, m, st, o, { max: 11 })) {
            // (by the collar: they hang straight down from it)
            if (!seize(man, o, o.wj.neck.x, o.wj.neck.y)) return false;
            setPhase(m, 'rise');
            if (o.brain) o.brain.speak('pwCarriedUp', { other: man.name }, 0.8, man, true);
          }
          return !tooLong(m, 4);
        case 'rise': {
          if (!holding(man, o)) return false;
          flyTo(st, man.pos.x, groundAt(man) + 6.5, 7, 4);
          st.clip = 'flyCarry';
          const h = hands(man);
          holdAt(man, o, h.x, h.y - 0.05, man.vel.x, man.vel.y);
          if (man.pos.y > groundAt(man) + 6 || m.pt > 2.4) { setPhase(m, 'wind'); man.anim.act('flyThrowDown', { fadeIn: 0.06, fadeOut: 0.2 }); }
          return true;
        }
        case 'wind': {
          if (!holding(man, o)) return false;
          flyTo(st, man.pos.x, man.pos.y, 2);
          // (held out in front, over the drop, not over their own head)
          const hd = man.wj.head;
          holdAt(man, o, hd.x + man.facing * 0.75, hd.y + 0.25, 0, 2);
          if (m.pt > 0.32) {
            letGo(man, o, man.facing * 4, -21);
            man.sandbox.emit('skyToss', { who: man, target: o, x: man.pos.x, y: man.pos.y, loud: true });
            man.sandbox.effects.push(new Wind(man.pos.x, man.pos.y + 1, 0, -1));
            setPhase(m, 'after');
          }
          return true;
        }
        case 'after': return after(man, m, st, dt, 1);
      }
      return false;
    },
    end(man, m, why, st) { endHold(man, m); if (st) { st.goal = null; st.clip = null; } },
  },

  wallPin: {
    label: 'Wall Pin', say: 'pwWallPin', cool: 10, max: 10, clips: ['flyPunch'],
    want: (me, o, c) => (c.d < 8 && !o.heldBy && wallFor(me, o) ? 1.1 : 0),
    start(man, m) { m.data.wall = wallFor(man, m.o); return !!m.data.wall; },
    step(man, m, dt, st) {
      const o = m.o, W = m.data.wall;
      if (!o || o.removed) return false;
      switch (m.phase) {
        case 'start': setPhase(m, 'approach'); return true;
        case 'approach':
          if (closeIn(man, m, st, o, { max: 11 })) {
            // (by the collar: pinned up against the wall by it, feet off the floor)
            if (!seize(man, o, o.wj.neck.x, o.wj.neck.y)) return false;
            setPhase(m, 'carry');
          }
          return !tooLong(m, 4);
        case 'carry': {
          if (!holding(man, o)) return false;
          const g0 = groundAt(man, W.x - W.dir * 0.8);
          const pin = { x: W.x - W.dir * 0.22, y: g0 + 1.6 };
          flyTo(st, pin.x - W.dir * 0.55, g0 + 0.45, 12, 7);
          st.clip = 'flyCarry';
          man.facing = W.dir;
          const h = hands(man);
          holdAt(man, o, h.x, h.y, man.vel.x, man.vel.y);
          if (Math.abs(man.pos.x - (pin.x - W.dir * 0.55)) < 0.3 || m.pt > 3) {
            m.data.pin = pin;
            holdAt(man, o, pin.x, pin.y, 0, 0);
            // slammed into it: the wall takes it, and so does whoever is between
            strike(man, o, { part: 'torso', power: 1.4, weapon: 'slam', dir: W.dir, at: pin });
            if (W.wall && W.wall.damage) W.wall.damage(W.x, pin.y, 0.16, 1.2, 'blunt', { dx: W.dir, dy: 0, speed: 3 });
            man.sandbox.fx.dust(W.x, pin.y, 8, 0.6);
            man.sandbox.emit('wallPin', { who: man, target: o, x: pin.x, y: pin.y, loud: true });
            if (o.brain) o.brain.speak('pwPinned', { other: man.name }, 0.7, man, true);
            setPhase(m, 'pin');
          }
          return true;
        }
        case 'pin': case 'punch1': case 'punch2': {
          if (!holding(man, o)) return false;
          const pin = m.data.pin;
          flyTo(st, pin.x - W.dir * 0.6, pin.y - 0.95, 2, 10);
          st.clip = 'flyPin';
          man.facing = W.dir;
          holdAt(man, o, pin.x, pin.y, 0, 0);
          if (m.phase === 'pin' && m.pt > 0.35) { setPhase(m, 'punch1'); man.anim.act('flyPunch', { fadeIn: 0.04, fadeOut: 0.12 }); }
          else if (m.phase !== 'pin' && m.pt > 0.13 && !m.data[m.phase]) {
            m.data[m.phase] = true;
            strike(man, o, { part: 'head', power: 2.3, weapon: 'superBlow', dir: W.dir });
            if (W.wall && W.wall.damage) W.wall.damage(W.x, pin.y + 0.35, 0.12, 0.9, 'blunt', { dx: W.dir, dy: 0, speed: 3 });
            man.sandbox.fx.dust(W.x, pin.y + 0.3, 5, 0.4);
          }
          if (m.phase === 'punch1' && m.pt > 0.42) { setPhase(m, 'punch2'); man.anim.act('flyPunch', { fadeIn: 0.04, fadeOut: 0.12 }); }
          else if (m.phase === 'punch2' && m.pt > 0.5) { letGo(man, o, 0, -1); setPhase(m, 'after'); }
          return true;
        }
        case 'after': return after(man, m, st, dt, 0.8);
      }
      return false;
    },
    end(man, m, why, st) { endHold(man, m); if (st) { st.goal = null; st.clip = null; } },
  },

  kickSlam: {
    label: 'Kick & Slam', say: 'pwKickSlam', cool: 8, max: 8, clips: ['launchKick', 'flySlam'], allow: [],
    want: (me, o, c) => (c.d < 4.5 && me.onGround && !o.lying && !o.heldBy && o.state !== 'thrown' ? 1.2 : 0),
    start(man, m) { return man.onGround && man.state === 'stand' && !m.o.lying; },
    step(man, m, dt, st) {
      const o = m.o;
      if (!o || o.removed) return false;
      const dir = sign(o.pos.x - man.pos.x) || man.facing;
      switch (m.phase) {
        case 'start': setPhase(m, 'approach'); return true;
        case 'approach': {
          if (st.flying) { st.landing = true; return !tooLong(m, 3); }
          const d = Math.abs(o.pos.x - man.pos.x);
          if (d > 1.0) { man.goTo(besideX(man, o, 0.85), 'run'); return !tooLong(m, 3.5); }
          man.stop(); man.faceTo(o.pos.x);
          if (!man.ready) return !tooLong(m, 4);
          man.anim.act('launchKick', { fadeIn: 0.04, fadeOut: 0.12 });
          setPhase(m, 'kick');
          return true;
        }
        case 'kick':
          if (m.pt > 0.17 && !m.data.kicked) {
            m.data.kicked = true;
            strike(man, o, { part: 'torso', power: 1.8, weapon: 'superBlow', dir, launch: { x: dir * 1.6, y: 11.5 } });
            man.sandbox.emit('launched', { who: o, by: man, x: o.pos.x, y: o.pos.y + 1, loud: true });
          }
          if (m.pt > 0.32) { setPhase(m, 'chase'); man.anim.stopAction(0.08); takeOff(man, st, 6); m.data.top = -99; }
          return true;
        case 'chase': {
          const c = chest(o);
          flyTo(st, c.x - dir * 0.25, c.y + 0.55, 15, 9);
          st.clip = 'flyRise';
          man.facing = dir;
          // (the top of their flight: they stop going up)
          const vy = (c.y - (m.data.py ?? c.y)) / Math.max(dt, 1e-3);
          m.data.py = c.y;
          if ((man.pos.y > c.y - 0.2 && Math.abs(man.pos.x - c.x) < 0.9) || (m.pt > 0.45 && vy < 0.5) || m.pt > 1.6) {
            setPhase(m, 'slam');
            man.anim.act('flySlam', { fadeIn: 0.04, fadeOut: 0.15 });
          }
          return true;
        }
        case 'slam':
          flyTo(st, man.pos.x, man.pos.y, 1);
          if (m.pt > 0.14 && !m.data.slammed) {
            m.data.slammed = true;
            strike(man, o, { part: 'torso', power: 2.4, weapon: 'slam', dir, at: o.wj.chest });
            fling(o, dir * 1.2, -24);
            man.sandbox.emit('slamDown', { who: man, target: o, x: o.pos.x, y: o.wj.chest.y, loud: true });
            man.sandbox.effects.push(new Wind(o.wj.chest.x, o.wj.chest.y, 0, -1));
          }
          if (m.pt > 0.45) setPhase(m, 'after');
          return true;
        case 'after': return after(man, m, st, dt, 0.8);
      }
      return false;
    },
    end(man, m, why, st) { if (st) { st.goal = null; st.clip = null; } },
  },

  diveBomb: {
    label: 'Dive Bomb', say: 'pwDiveBomb', cool: 10, max: 9, clips: ['heroLand'],
    want: (me, o, c) => (c.d > 2.5 && c.d < 13 ? 0.9 : 0),
    step(man, m, dt, st) {
      const o = m.o;
      if (!o || o.removed) return false;
      switch (m.phase) {
        case 'start': takeOff(man, st, 6); setPhase(m, 'rise'); return true;
        case 'rise': {
          const gx = o.pos.x + (o.vel ? o.vel.x * 0.3 : 0);
          flyTo(st, gx, groundAt(man, gx) + 7, 11, 5);
          st.clip = 'flyRise';
          man.faceTo(o.pos.x);
          if ((Math.abs(man.pos.x - gx) < 0.7 && man.pos.y > groundAt(man, gx) + 5.8) || m.pt > 3.2) {
            setPhase(m, 'dive');
            st.dive = { o, x: o.pos.x };
            st.goal = null;
            man.vel.y = -8;
          }
          return true;
        }
        case 'dive':
          // (the air hook drives this one: straight down, steering for them)
          if (!st.flying && !st.dive) { setPhase(m, 'recover'); return true; }
          return !tooLong(m, 3);
        case 'recover':
          return m.pt < 0.75;
      }
      return false;
    },
    end(man, m, why, st) { if (st) { st.dive = null; st.goal = null; st.clip = null; } },
  },

  tackle: {
    label: 'Tackle', say: 'pwTackle', cool: 8, max: 7, clips: [],
    want: (me, o, c) => (c.d > 2 && c.d < 10 && !o.lying && !o.heldBy ? 1 : 0),
    step(man, m, dt, st) {
      const o = m.o;
      if (!o || o.removed) return false;
      const dir = m.data.dir ?? (m.data.dir = sign(o.pos.x - man.pos.x) || man.facing);
      switch (m.phase) {
        case 'start': takeOff(man, st, 2.5); setPhase(m, 'charge'); return true;
        case 'charge': {
          const c = chest(o);
          flyTo(st, c.x + dir * 0.6, c.y - 1.0, 15, 8);
          st.clip = 'flyTackle';
          man.facing = dir;
          if (Math.abs(man.wj.chest.x - c.x) < 0.55 && Math.abs(man.wj.chest.y - c.y) < 0.9) {
            strike(man, o, { part: 'torso', power: 1.7, weapon: 'superBlow', dir });
            if (!seize(man, o, c.x, c.y)) return false;
            m.data.x0 = man.pos.x;
            setPhase(m, 'carry');
          }
          return !tooLong(m, 3);
        }
        case 'carry': {
          if (!holding(man, o)) return false;
          flyTo(st, man.pos.x + dir * 4, groundAt(man) + 0.9, 12, 8);
          st.clip = 'flyTackle';
          const h = hands(man);
          holdAt(man, o, h.x + dir * 0.1, h.y, man.vel.x, man.vel.y);
          if (Math.abs(man.pos.x - m.data.x0) > 3.5 || m.pt > 1.3) {
            letGo(man, o, dir * 7, -13);
            man.sandbox.emit('slamDown', { who: man, target: o, x: o.pos.x, y: o.wj.chest.y, loud: true });
            setPhase(m, 'after');
          }
          return true;
        }
        case 'after': return after(man, m, st, dt, 0.6);
      }
      return false;
    },
    end(man, m, why, st) { endHold(man, m); if (st) { st.goal = null; st.clip = null; } },
  },

  juggle: {
    label: 'Air Juggle', say: 'pwJuggle', cool: 9, max: 8, clips: ['launchUppercut', 'flyPunch', 'flyKick'],
    want: (me, o, c) => (c.d < 3.5 && me.onGround && !o.lying && !o.heldBy && o.state !== 'thrown' ? 0.9 : 0),
    start(man, m) { return man.onGround && man.state === 'stand'; },
    step(man, m, dt, st) {
      const o = m.o;
      if (!o || o.removed) return false;
      const dir = sign(o.pos.x - man.pos.x) || man.facing;
      switch (m.phase) {
        case 'start': setPhase(m, 'approach'); return true;
        case 'approach': {
          const d = Math.abs(o.pos.x - man.pos.x);
          if (d > 0.95) { man.goTo(besideX(man, o, 0.8), 'run'); return !tooLong(m, 3.5); }
          man.stop(); man.faceTo(o.pos.x);
          if (!man.ready) return !tooLong(m, 4);
          man.anim.act('launchUppercut', { fadeIn: 0.04, fadeOut: 0.12 });
          setPhase(m, 'launch');
          return true;
        }
        case 'launch':
          if (m.pt > 0.15 && !m.data.up) {
            m.data.up = true;
            strike(man, o, { part: 'head', power: 1.5, weapon: 'superBlow', dir, launch: { x: dir * 0.6, y: 12.5 } });
            man.sandbox.emit('launched', { who: o, by: man, x: o.pos.x, y: o.pos.y + 1, loud: true });
          }
          if (m.pt > 0.3) { man.anim.stopAction(0.06); takeOff(man, st, 7); setPhase(m, 'up'); }
          return true;
        case 'up': case 'hit1': case 'hit2': case 'finish': {
          const c = chest(o);
          flyTo(st, c.x - dir * 0.7, c.y - 0.95, 16, 10);
          st.clip = 'flyReach';
          man.facing = dir;
          const close = Math.abs(man.wj.chest.x - c.x) < 1.1 && Math.abs(man.wj.chest.y - c.y) < 1;
          if (m.phase === 'up' && (close && m.pt > 0.2 || m.pt > 0.9)) { setPhase(m, 'hit1'); man.anim.act('flyPunch', { fadeIn: 0.03, fadeOut: 0.1 }); }
          else if (m.phase === 'hit1' || m.phase === 'hit2') {
            if (m.pt > 0.09 && !m.data[m.phase]) { m.data[m.phase] = true; strike(man, o, { part: m.phase === 'hit1' ? 'torso' : 'head', power: 1.2, weapon: 'superBlow', dir, launch: { x: dir * 0.8, y: 5.5 } }); }
            if (m.pt > 0.28) { setPhase(m, m.phase === 'hit1' ? 'hit2' : 'finish'); man.anim.act(m.phase === 'finish' ? 'flyKick' : 'flyPunch', { fadeIn: 0.03, fadeOut: 0.12 }); }
          } else if (m.phase === 'finish') {
            if (m.pt > 0.12 && !m.data.fin) { m.data.fin = true; strike(man, o, { part: 'torso', power: 2.1, weapon: 'superBlow', dir, launch: { x: dir * 13, y: 2.5 } }); }
            if (m.pt > 0.35) setPhase(m, 'after');
          }
          return true;
        }
        case 'after': return after(man, m, st, dt, 0.6);
      }
      return false;
    },
    end(man, m, why, st) { if (st) { st.goal = null; st.clip = null; } },
  },

  spinThrow: {
    label: 'Spin Throw', say: 'pwSpinThrow', cool: 10, max: 9, clips: [],
    want: (me, o, c) => (c.d < 7 && !o.heldBy ? 0.8 : 0),
    step(man, m, dt, st) {
      const o = m.o;
      if (!o || o.removed) return false;
      switch (m.phase) {
        case 'start': setPhase(m, 'approach'); return true;
        case 'approach': {
          takeOff(man, st, 2);
          const f = o.wj.footA, side = sign(man.pos.x - o.pos.x) || -man.facing;
          const g = { x: f.x + side * 0.5, y: Math.max(groundAt(man, f.x) + 0.25, f.y - 0.55) };
          flyTo(st, g.x, g.y, 10);
          st.clip = 'flyReach';
          man.facing = -side;
          if (at(man, g, 0.5)) {
            if (!seize(man, o, f.x, f.y)) return false;
            m.data.c = { x: man.pos.x, y: groundAt(man) + 2.6 };
            m.data.a = Math.atan2(f.y - (man.pos.y + 1), f.x - man.pos.x);
            m.data.w = 2;
            setPhase(m, 'spin');
            if (o.brain) o.brain.speak('pwSpun', { other: man.name }, 0.7, man, true);
          }
          return !tooLong(m, 4);
        }
        case 'spin': {
          if (!holding(man, o)) return false;
          const C = m.data.c;
          flyTo(st, C.x, C.y, 6, 8);
          st.clip = 'spinThrow';
          // (faster and faster, round in front of them)
          m.data.w = Math.min(15, m.data.w + dt * 16);
          m.data.a += m.data.w * dt;
          const R = 1.45, hx = man.pos.x, hy = man.pos.y + 1.15;
          const px = hx + Math.cos(m.data.a) * R, py = hy + Math.sin(m.data.a) * R * 0.75;
          const tvx = -Math.sin(m.data.a) * m.data.w * R, tvy = Math.cos(m.data.a) * m.data.w * R * 0.75;
          holdAt(man, o, px, Math.max(groundAt(man, px) + 0.25, py), tvx, tvy);
          man.facing = sign(px - hx) || man.facing;
          // let go on the way up and toward where they want them to go
          const want = m.data.dir ?? (m.data.dir = sign(o.pos.x - man.pos.x) || 1);
          if (m.pt > 1.2 && sign(tvx) === want && tvy > 0) {
            letGo(man, o, tvx * 1.05, tvy * 0.8 + 3);
            man.sandbox.emit('spinThrow', { who: man, target: o, x: px, y: py, loud: true });
            setPhase(m, 'after');
          }
          return !tooLong(m, 3.5);
        }
        case 'after': return after(man, m, st, dt, 0.7);
      }
      return false;
    },
    end(man, m, why, st) { endHold(man, m); if (st) { st.goal = null; st.clip = null; } },
  },

  skyDrop: {
    label: 'Sky Drop', say: 'pwSkyDrop', cool: 14, max: 10, clips: [],
    want: (me, o, c) => (c.d < 10 && !o.heldBy && c.r.anger > 0.85 && me.brain && me.brain.traits.aggression > 0.6 ? 0.6 : 0),
    step(man, m, dt, st) {
      const o = m.o;
      if (!o || o.removed) return false;
      switch (m.phase) {
        case 'start': setPhase(m, 'approach'); return true;
        case 'approach':
          if (closeIn(man, m, st, o, { max: 11 })) {
            // (by the collar: they hang straight down from it)
            if (!seize(man, o, o.wj.neck.x, o.wj.neck.y)) return false;
            setPhase(m, 'rise');
            if (o.brain) o.brain.speak('pwCarriedUp', { other: man.name }, 0.9, man, true);
          }
          return !tooLong(m, 4);
        case 'rise': {
          if (!holding(man, o)) return false;
          flyTo(st, man.pos.x, groundAt(man) + 11, 7.5, 4);
          st.clip = 'flyCarry';
          const h = hands(man);
          holdAt(man, o, h.x, h.y - 0.05, man.vel.x, man.vel.y);
          if (man.pos.y > groundAt(man) + 10.3 || m.pt > 3.5) {
            setPhase(m, 'hold');
            say(man, 'pwSkyDropLet', o, 0.8);
          }
          return true;
        }
        case 'hold': {
          if (!holding(man, o)) return false;
          flyTo(st, man.pos.x, man.pos.y, 1);
          st.clip = 'flyCarry';
          const h = hands(man);
          holdAt(man, o, h.x, h.y, 0, 0);
          if (m.pt > 0.9) { letGo(man, o, 0, 0, 'skyFall'); man.sandbox.emit('skyDrop', { who: man, target: o, x: man.pos.x, y: man.pos.y, loud: true }); setPhase(m, 'after'); }
          return true;
        }
        case 'after': return after(man, m, st, dt, 1.4);
      }
      return false;
    },
    end(man, m, why, st) { endHold(man, m); if (st) { st.goal = null; st.clip = null; } },
  },

  flyBy: {
    label: 'Fly-by', say: 'pwFlyBy', cool: 7, max: 7, clips: [],
    want: (me, o, c) => (c.d > 3 && c.d < 12 && !o.lying ? 1 : 0),
    step(man, m, dt, st) {
      const o = m.o;
      if (!o || o.removed) return false;
      switch (m.phase) {
        case 'start': {
          takeOff(man, st, 3);
          m.data.dir = sign(o.pos.x - man.pos.x) || man.facing;
          setPhase(m, 'run');
          return true;
        }
        case 'run': {
          const dir = m.data.dir, hd = o.wj.head;
          // through where their head is, and on past them
          flyTo(st, hd.x + dir * 4, hd.y - 1.05, 16, 9);
          st.clip = 'flyForward';
          man.facing = dir;
          const dx = (hd.x - man.wj.handA.x) * dir;
          if (!m.data.hit && dx < 0.35 && dx > -0.6 && Math.abs(man.wj.chest.y - hd.y) < 1.1) {
            m.data.hit = true;
            man.anim.act('flyPunch', { fadeIn: 0.02, fadeOut: 0.1 });
            strike(man, o, { part: 'head', power: 1.9, weapon: 'superBlow', dir, launch: { x: dir * 8, y: 3.5 } });
            man.sandbox.emit('flyBy', { who: man, target: o, x: hd.x, y: hd.y, loud: true });
          }
          if ((man.pos.x - hd.x) * dir > 3.2 || m.pt > 2.5) setPhase(m, 'after');
          return true;
        }
        case 'after': return after(man, m, st, dt, 0.5);
      }
      return false;
    },
    end(man, m, why, st) { if (st) { st.goal = null; st.clip = null; } },
  },

  airlift: {
    label: 'Airlift', say: 'pwAirlift', cool: 10, max: 12, needs: 'friend', clips: [],
    want: (me, o) => (alive(o) && !o.heldBy && (o.lying || threatNear(me, o, 4)) ? 1 : 0),
    step(man, m, dt, st) {
      const o = m.o;
      if (!o || o.removed) return false;
      switch (m.phase) {
        case 'start': setPhase(m, 'approach'); return true;
        case 'approach':
          if (closeIn(man, m, st, o, { max: 10 })) {
            if (!seize(man, o, chest(o).x, chest(o).y)) return false;
            const th = threatNear(man, o, 12);
            const away = th ? sign(o.pos.x - th.pos.x) || 1 : (sign(o.pos.x) || 1) * -1;
            m.data.to = clamp(o.pos.x + away * 10, man.sandbox.left + 1.5, man.sandbox.right - 1.5);
            setPhase(m, 'carry');
            if (o.brain && o.alive && o.conscious) o.brain.speak('pwRescued', { other: man.name }, 0.7, man, false);
          }
          return !tooLong(m, 4.5);
        case 'carry': {
          if (!holding(man, o)) return false;
          const tx = m.data.to;
          flyTo(st, tx, groundAt(man, tx) + 2.4, 8, 4);
          st.clip = 'flyCarry';
          man.facing = sign(tx - man.pos.x) || man.facing;
          const h = hands(man);
          holdAt(man, o, h.x, h.y, man.vel.x, man.vel.y);
          if (Math.abs(man.pos.x - tx) < 0.5 || m.pt > 5) setPhase(m, 'down');
          return true;
        }
        case 'down': {
          if (!holding(man, o)) return false;
          flyTo(st, man.pos.x, groundAt(man) + 0.55, 3, 5);
          st.clip = 'flyCarry';
          const h = hands(man);
          holdAt(man, o, h.x, h.y, 0, man.vel.y);
          if (man.pos.y < groundAt(man) + 0.75 || m.pt > 2) { letGo(man, o, 0, 0); o.thrownBy = null; setPhase(m, 'after'); }
          return true;
        }
        case 'after': return after(man, m, st, dt, 0.3);
      }
      return false;
    },
    end(man, m, why, st) { endHold(man, m); if (st) { st.goal = null; st.clip = null; } },
  },
};

/** The wall to pin them against: behind them, away from the flier, if there is one near; else the other way. */
function wallFor(man, o) {
  const sb = man.sandbox, y = o.wj.chest.y;
  const away = sign(o.pos.x - man.pos.x) || man.facing;
  const w = wallBeside(sb, o.pos.x, y, away, 9) || wallBeside(sb, o.pos.x, y, -away, 9) || wallBeside(sb, o.pos.x, y, away, 40) || wallBeside(sb, o.pos.x, y, -away, 40);
  if (!w) return null;
  return { ...w, dir: sign(w.x - o.pos.x) || away };
}

/** Somebody nearby who means harm to `o` (or to `me`). */
function threatNear(me, o, r) {
  const b = me.brain;
  let best = null, bd = r;
  for (const p of me.sandbox.people) {
    if (p === me || p === o || !awake(p)) continue;
    const d = Math.abs(p.pos.x - o.pos.x);
    if (d > bd) continue;
    const bad = (b && b.rel(p).like < -0.3) || (p.brain && p.brain.behaviour && p.brain.behaviour.target === o && p.brain.behaviour.kind === 'fight');
    if (bad) { bd = d; best = p; }
  }
  return best;
}

export const FLIGHT = {
  key: 'Flight', name: 'Flight', chip: 'Can fly',
  felt: 'I feel light. Like I could just... step off the ground.',
  moves: MOVES,
  gain(man, st) { st.flying = false; st.stay = false; st.t = 0; st.flyT = 0; },
  lose(man, st) { if (st.flying) { st.flying = false; man.gravity = 1; } },

  update(man, st, dt) {
    if (st.flying) {
      st.flyT += dt;
      // knocked out of the air, grabbed, gone limp: not flying any more
      if (man.state !== 'air' || man.rag || !man.conscious || man.dead) { st.flying = false; st.dive = null; man.gravity = 1; st.goal = null; return; }
      // wind off them, flying fast
      const sp = Math.hypot(man.vel.x, man.vel.y);
      if (sp > 9 && chance(dt * 6)) man.sandbox.effects.push(new Wind(man.wj.chest.x, man.wj.chest.y, -man.vel.x / sp, -man.vel.y / sp, 0.5));
      // (nothing to fly for: down again, unless told to stay up)
      if (!man.pmove && !st.stay && !st.high && !st.joy && st.flyT > 1.5) land(man, st);
      if (st.joy && st.flyT > st.joy) { st.joy = 0; land(man, st); }
    }
  },

  air(man, st, dt) {
    if (!st.flying) return false;
    // diving: straight down on them, feet first
    if (st.dive) {
      const o = st.dive.o, tx = alive(o) ? o.pos.x : st.dive.x;
      man.vel.x += (clamp((tx - man.pos.x) * 4, -6, 6) - man.vel.x) * (1 - Math.exp(-dt * 6));
      man.vel.y = Math.max(-24, man.vel.y - 40 * dt);
      man.gravity = 0;
      man.anim.play('diveBomb', { blend: 0.1 });
      man.anim.setOverlay(null);
      return true;
    }
    const g = goal(man, st);
    const dx = g.x - man.pos.x, dy = g.y - man.pos.y, d = Math.hypot(dx, dy) || 1e-6;
    const max = st.goal ? st.max || CRUISE : CRUISE * (man.intent.speed === 'run' || man.intent.speed === 'flee' ? 1.3 : 0.8);
    const sp = Math.min(max, d * 3.2);
    const k = 1 - Math.exp(-dt * (st.goal ? st.accel || 6 : 4));
    man.vel.x += ((dx / d) * sp - man.vel.x) * k;
    man.vel.y += ((dy / d) * sp - man.vel.y) * k;
    man.gravity = 0;
    if (!st.goal) {
      if (Math.abs(man.vel.x) > 0.7) man.facing = sign(man.vel.x);
      else if (man.intent.face !== null && man.intent.face !== undefined) man.faceTo(man.intent.face);
    }
    const fast = Math.abs(man.vel.x) > 3.2;
    man.anim.play(st.clip || (fast ? 'flyForward' : 'flyHover'), { blend: 0.16 });
    man.anim.setOverlay(null);
    return true;
  },

  touchDown(man, st, v) {
    if (!st.flying) return false;
    const sb = man.sandbox;
    if (st.dive) {
      // the dive ends in the floor: a crater, and everybody near goes over
      const o = st.dive.o;
      st.dive = null;
      st.flying = false;
      man.gravity = 1;
      man.setState('stand');
      man.vel.x = 0; man.vel.y = 0;
      man.anim.stopAction(0.02);
      man.anim.act('heroLand', { fadeIn: 0.02, fadeOut: 0.25 });
      if (alive(o) && Math.abs(o.pos.x - man.pos.x) < 1 && Math.abs(o.pos.y - man.pos.y) < 1.3) {
        strike(man, o, { part: o.lying ? 'torso' : 'head', power: 3.4, weapon: 'superBlow', dir: sign(o.pos.x - man.pos.x) || 1 });
      }
      shockwave(man, man.pos.x, man.pos.y, 2.8, 3, { spare: null });
      if (man.pos.y < 0.05) sb.effects.push(new Cracks(man.pos.x, 1));
      sb.emit('diveImpact', { who: man, x: man.pos.x, y: man.pos.y, speed: v, loud: true });
      return true;
    }
    if (st.landing || v > 0.5 || !man.pmove) {
      st.flying = false;
      st.landing = false;
      st.high = false;
      man.gravity = 1;
      man.setState('stand');
      man.vel.y = 0;
      man.vel.x *= 0.3;
      if (v > 2) man.anim.act('flyLand', { fadeIn: 0.03, fadeOut: 0.2, speed: 1.6 });
      sb.fx.dust(man.pos.x, man.pos.y, 4, 0.5);
      sb.emit('pwLand', { who: man, x: man.pos.x, y: man.pos.y, speed: v });
      return true;
    }
    // (brushing the floor in the middle of something: back up off it)
    man.onGround = false;
    man.vel.y = Math.max(man.vel.y, 1.5);
    return true;
  },

  toggles(man, st) {
    return [{
      id: 'flight:fly', label: st.flying ? 'Land' : 'Fly', on: st.flying,
      pick: () => {
        if (st.flying) { st.stay = false; st.high = false; land(man, st); return true; }
        st.stay = true;
        return takeOff(man, st, 4);
      },
      say: (done) => (done === false ? `${man.name} can't take off right now` : st.flying && st.stay ? `${man.name} is flying` : `${man.name} comes down`),
    }];
  },

  reflex(me, st, brain, start) {
    const b = brain.behaviour, kind = b && b.kind;
    // running from something: up, out of its reach
    if ((kind === 'flee' || kind === 'panic') && !me.pmove) {
      const t = b.from || b.target || null;
      const close = !t || Math.abs(t.pos.x - me.pos.x) < 8;
      if (close && (me.ready || st.flying)) { if (takeOff(me, st, 5)) st.high = true; }
      return;
    }
    if (st.high && kind !== 'flee' && kind !== 'panic') { st.high = false; if (!st.stay) land(me, st); }
    // now and then, just for the joy of it: a turn round the place and back down
    if (!st.flying && me.ready && (!kind || kind === 'idle' || kind === 'wander') && chance(0.006 * (0.5 + (brain.emo.joy || 0)))) {
      if (takeOff(me, st, 4)) {
        st.joy = rand(3, 6);
        const x = clamp(me.pos.x + rand(-6, 6), me.sandbox.left + 1, me.sandbox.right - 1);
        me.goTo(x, 'walk');
        brain.speak('flyJoy', {}, 0.5, null, false);
      }
    }
    // a friend down, and somebody standing over them: get them out of there
    if (!me.pmove && me.ready && kind !== 'flee') {
      const f = friendInTrouble(me, brain);
      if (f && now(me) - (st.cool.airlift ?? -99) > (MOVES.airlift.cool ?? 10) && chance(0.35)) {
        start(me, 'flight', 'airlift', f);
      }
    }
  },
};

/** A friend lying hurt with somebody dangerous near them (for a rescue). */
export function friendInTrouble(me, brain) {
  for (const p of me.sandbox.people) {
    if (p === me || !alive(p) || p.heldBy) continue;
    if (brain.rel(p).like < 0.4 || Math.abs(p.pos.x - me.pos.x) > 14) continue;
    if (!(p.lying || p.health.overall < 0.45)) continue;
    if (threatNear(me, p, 3.5)) return p;
  }
  return null;
}
