/* =============================================================================
   SUPER SPEED - they run three times as fast as anybody, and in a fight
   everything they do comes about twice as fast: a punch is over before the
   other one has seen it start. Moving fast, they leave afterimages behind
   them, and a blow they see coming, they are often just not there for.

   The moves:
     Blitz          in, and a storm of punches faster than the eye can follow
     Blink Strike   gone - and behind them, hitting them in the back
     Whirlwind      round and round them so fast the wind lifts them off the ground
     Afterimage     a step aside so fast what is left behind is a picture of them
     Snatch         the weapon out of their hand before they know it has gone
     Gust Punch     a punch at the air so fast the air hits them
     Dropkick       a sprint, and both feet into them
     Kick Storm     a flurry of kicks, then one that sends them away
     Rescue Dash    a friend in trouble, picked up and out of there in a blink
     Lightning Line straight through a line of them, hitting every one
   ========================================================================== */
import { alive, awake, now, seize, holding, holdAt, letGo, strike, fling, shockwave, setPhase, besideX, wallBeside, say, takeInHand, clamp, sign, rand, chance } from './common.js';
import { ghostsOf, Wind, Streak } from './fx.js';

const ZIP = 34;           // a dash, metres a second

/**
 * Straight to x along the ground, faster than a car - but not through a wall.
 * True once they are there (or as near as the wall lets them).
 */
function zip(man, m, x, dt, speed = ZIP) {
  const sb = man.sandbox, dir = sign(x - man.pos.x);
  if (!dir) return true;
  let to = clamp(x, sb.left + 0.3, sb.right - 0.3);
  const w = wallBeside(sb, man.pos.x, man.pos.y + 0.9, dir, Math.abs(to - man.pos.x) + 0.3);
  if (w && w.wall) to = w.x - dir * 0.3;
  const step = speed * dt;
  man.facing = dir;
  man.stop();
  man.vel.x = 0;
  if (Math.abs(to - man.pos.x) <= step) {
    man.pos.x = to;
    ghostsOf(sb).add(man, 0.5);
    if (man.anim.actionName === 'speedDash') man.anim.stopAction(0.06);
    return true;
  }
  man.pos.x += dir * step;
  ghostsOf(sb).add(man, 0.45);
  dash(man);
  return false;
}
/** The dash itself: leaning into it, arms back (started once, held while it lasts). */
function dash(man) { if (man.anim.actionName !== 'speedDash') man.anim.act('speedDash', { fadeIn: 0.03, fadeOut: 0.08 }); }
const act = (man, clip, o = {}) => man.anim.act(clip, { fadeIn: 0.03, fadeOut: 0.1, ...o });
const endHold = (man, m) => { if (m.o && holding(man, m.o)) letGo(man, m.o, 0, 0); };

/** Into reach of them in a blink. True once there and facing them. */
function closeIn(man, m, o, gap, dt) {
  const tx = besideX(man, o, gap);
  if (Math.abs(man.pos.x - tx) > 0.08 && !zip(man, m, tx, dt)) return false;
  man.faceTo(o.pos.x);
  return true;
}

const MOVES = {
  blitz: {
    label: 'Blitz', say: 'pwBlitz', cool: 7, max: 5, clips: ['blitzFlurry', 'speedDash', 'cross'],
    want: (me, o, c) => (c.d < 9 && !o.lying && !o.heldBy ? 1.3 : 0),
    step(man, m, dt) {
      const o = m.o;
      if (!alive(o)) return false;
      const dir = sign(o.pos.x - man.pos.x) || man.facing;
      switch (m.phase) {
        case 'start': setPhase(m, 'in'); return true;
        case 'in':
          if (closeIn(man, m, o, 0.7, dt)) { act(man, 'blitzFlurry'); setPhase(m, 'flurry'); m.data.n = 0; }
          return m.pt < 1.5;
        case 'flurry': {
          // (knocked back by it, they are followed: there is no getting away from it)
          if (Math.abs(o.pos.x - man.pos.x) > 0.95) zip(man, m, besideX(man, o, 0.7), dt);
          man.faceTo(o.pos.x);
          ghostsOf(man.sandbox).add(man, 0.25, 0.05);
          m.data.tick = (m.data.tick ?? 0.05) - dt;
          if (m.data.tick <= 0 && Math.abs(o.pos.x - man.pos.x) < 1.3) {
            m.data.tick = 0.065;
            m.data.n++;
            strike(man, o, { part: m.data.n % 3 ? 'torso' : 'head', power: 0.5, weapon: 'speedBlow', dir });
            if (o.state === 'stand' || o.state === 'stagger') o.vel.x += dir * 0.15;
          }
          if (m.pt > 0.95) { act(man, 'cross', { speed: 2 }); setPhase(m, 'finish'); }
          return true;
        }
        case 'finish':
          if (m.pt > 0.05 && !m.data.fin) {
            m.data.fin = true;
            strike(man, o, { part: 'head', power: 1.6, weapon: 'speedBlow', dir, launch: { x: dir * 7, y: 3 } });
            man.sandbox.emit('blitz', { who: man, target: o, n: m.data.n, x: o.wj.chest.x, y: o.wj.chest.y, loud: true });
          }
          return m.pt < 0.3;
      }
      return false;
    },
  },

  blink: {
    label: 'Blink Strike', say: 'pwBlink', cool: 6, max: 3, clips: ['speedDash', 'kick'],
    want: (me, o, c) => (c.d < 10 && !o.lying && !o.heldBy && o.state === 'stand' ? 1.1 : 0),
    step(man, m, dt) {
      const o = m.o;
      if (!alive(o)) return false;
      switch (m.phase) {
        case 'start': m.data.dir = sign(o.pos.x - man.pos.x) || man.facing; setPhase(m, 'go'); return true;
        case 'go': {
          // round them, to the far side: behind them
          const tx = o.pos.x + m.data.dir * 0.8;
          if (zip(man, m, tx, dt, 44)) { man.faceTo(o.pos.x); act(man, 'kick', { speed: 2 }); setPhase(m, 'hit'); }
          return m.pt < 1;
        }
        case 'hit':
          if (m.pt > 0.07 && !m.data.hit) {
            m.data.hit = true;
            const dir = sign(o.pos.x - man.pos.x) || man.facing;
            strike(man, o, { part: 'torso', power: 2, weapon: 'speedBlow', dir, launch: { x: dir * 7, y: 2.5 } });
            man.sandbox.emit('blink', { who: man, target: o, x: o.wj.chest.x, y: o.wj.chest.y, loud: true });
          }
          return m.pt < 0.35;
      }
      return false;
    },
  },

  whirlwind: {
    label: 'Whirlwind', say: 'pwWhirlwind', cool: 12, max: 4, clips: ['speedDash'],
    want: (me, o, c) => (c.d < 8 && !o.heldBy && o.state !== 'thrown' ? 0.8 : 0),
    step(man, m, dt) {
      const o = m.o;
      if (!o || o.removed) return false;
      const sb = man.sandbox;
      switch (m.phase) {
        case 'start': m.data.cx = o.pos.x; m.data.a = 0; setPhase(m, 'in'); return true;
        case 'in':
          if (zip(man, m, m.data.cx - (sign(o.pos.x - man.pos.x) || 1) * 1.1, dt)) setPhase(m, 'spin');
          return m.pt < 1;
        case 'spin': {
          // round and round: in a picture that is flat, back and forth across them, faster and faster
          m.data.a += dt * (10 + m.pt * 10);
          const x = m.data.cx + Math.cos(m.data.a) * 1.15;
          man.facing = sign(-Math.sin(m.data.a)) || man.facing;
          man.pos.x = x;
          man.vel.x = 0;
          ghostsOf(sb).add(man, 0.4, 0.012);
          dash(man);
          if (chance(dt * 12)) sb.fx.dust(x, man.pos.y, 2, 1.2);
          // the wind picks them up
          if (m.pt > 0.35 && !m.data.held && alive(o)) {
            m.data.held = seize(man, o, o.wj.chest.x, o.wj.chest.y);
            m.data.y0 = o.wj.chest.y;
            if (o.brain) o.brain.speak('pwSpun', { other: man.name }, 0.8, man, true);
          }
          if (m.data.held && holding(man, o)) {
            const k = Math.min(1, (m.pt - 0.35) / 0.8);
            const sp = m.data.a * 0.5;
            holdAt(man, o, m.data.cx + Math.cos(sp) * 0.25, m.data.y0 + 1.8 * k + Math.sin(sp) * 0.2, 0, 0);
          }
          for (const t of sb.loose()) {
            const b = t.body;
            if (!b || b.invMass <= 0 || Math.abs(b.pos.x - m.data.cx) > 2.5 || b.mass > 30) continue;
            b.applyImpulse(-Math.sin(m.data.a) * 2 * b.mass * dt * 10, 3 * b.mass * dt * 10, b.pos.x, b.pos.y);
          }
          if (m.pt > 1.8) {
            if (holding(man, o)) letGo(man, o, rand(-3, 3), 4);
            sb.emit('whirlwind', { who: man, target: o, x: m.data.cx, y: man.pos.y + 1, loud: true });
            setPhase(m, 'out');
          }
          return true;
        }
        case 'out':
          zip(man, m, m.data.cx - man.facing * 2.5, dt);
          return m.pt < 0.25;
      }
      return false;
    },
    end(man, m) { endHold(man, m); },
  },

  dodge: {
    label: 'Afterimage', say: 'pwDodge', sayP: 0.3, cool: 3, max: 1, needs: 'none', clips: ['speedDash'],
    want: () => 0,
    step(man, m, dt, st) {
      switch (m.phase) {
        case 'start': {
          const o = m.o && alive(m.o) ? m.o : null;
          const away = o ? -(sign(o.pos.x - man.pos.x) || man.facing) : -man.facing;
          m.data.to = man.pos.x + away * 1.8;
          ghostsOf(man.sandbox).add(man, 0.9, 0.45);
          st.dodgeT = 0.5;
          setPhase(m, 'go');
          return true;
        }
        case 'go':
          if (zip(man, m, m.data.to, dt, 40)) { setPhase(m, 'done'); if (m.o && alive(m.o)) man.faceTo(m.o.pos.x); }
          return m.pt < 0.5;
        case 'done': return m.pt < 0.15;
      }
      return false;
    },
  },

  snatch: {
    label: 'Snatch', say: 'pwSnatch', cool: 7, max: 3, clips: ['speedDash'],
    want: (me, o, c) => (c.d < 10 && o.weapon && !o.heldBy ? (o.gunReady ? 2.2 : 1.2) : 0),
    start(man, m) { return !!m.o.weapon; },
    step(man, m, dt) {
      const o = m.o;
      if (!alive(o)) return false;
      switch (m.phase) {
        case 'start': m.data.x0 = man.pos.x; setPhase(m, 'in'); return true;
        case 'in':
          if (closeIn(man, m, o, 0.5, dt)) {
            const w = o.weapon;
            if (!w) return false;
            o.dropWeapon(0);
            // in their hand, if there is a hand free (and a pocket for what is in it); else thrown well out of reach
            m.data.w = w;
            setPhase(m, 'out');
            man.sandbox.emit('snatch', { who: man, target: o, what: w, x: o.wj.handA.x, y: o.wj.handA.y, loud: true });
            if (o.brain) o.brain.speak('pwSnatched', { other: man.name }, 0.9, man, true);
          }
          return m.pt < 1;
        case 'out': {
          const w = m.data.w;
          // the weapon goes with them
          if (w && !w.removed && w.loose && w.body) { w.body.pos.x = man.wj.handA.x; w.body.pos.y = Math.max(0.15, man.wj.handA.y); w.body.vel.x = man.facing * 2; w.body.vel.y = 0; }
          if (zip(man, m, m.data.x0, dt)) {
            // in their hand (or a pocket) - or, nowhere to put it, thrown well out of reach behind them
            if (w && !w.removed && w.loose && !takeInHand(man, w) && w.body) { w.body.vel.x = -man.facing * 6; w.body.vel.y = 4; }
            return false;
          }
          return m.pt < 1;
        }
      }
      return false;
    },
  },

  gustPunch: {
    label: 'Gust Punch', say: 'pwGustPunch', cool: 8, max: 2, needs: 'none', clips: ['gustPunch'],
    want: (me, o, c) => (c.d > 1.3 && c.d < 4.5 && !o.lying ? 1 : 0),
    start(man) { return man.state === 'stand'; },
    step(man, m) {
      switch (m.phase) {
        case 'start':
          man.stop();
          if (m.o && alive(m.o)) man.faceTo(m.o.pos.x);
          if (!man.ready) return m.pt < 0.8;
          act(man, 'gustPunch');
          setPhase(m, 'punch');
          return true;
        case 'punch':
          if (m.pt > 0.09 && !m.data.hit) {
            m.data.hit = true;
            const h = man.wj.handA;
            shockwave(man, h.x, h.y - 0.6, 4.8, 1.5, { cone: man.facing, lift: 0.35, weapon: 'speedBlow' });
            man.sandbox.effects.push(new Wind(h.x, h.y, man.facing, 0, 1.4));
            man.sandbox.emit('gustPunch', { who: man, x: h.x, y: h.y, loud: true });
          }
          return m.pt < 0.45;
      }
      return false;
    },
  },

  dropkick: {
    label: 'Dropkick', say: 'pwDropkick', cool: 8, max: 3, clips: ['dropkick', 'speedDash'],
    want: (me, o, c) => (c.d > 2 && c.d < 12 && !o.lying && !o.heldBy ? 1 : 0),
    step(man, m, dt) {
      const o = m.o;
      if (!alive(o)) return false;
      switch (m.phase) {
        case 'start': setPhase(m, 'run'); return true;
        case 'run':
          if (closeIn(man, m, o, 1.1, dt)) { act(man, 'dropkick'); setPhase(m, 'kick'); }
          return m.pt < 1.5;
        case 'kick':
          if (m.pt > 0.1 && !m.data.hit) {
            m.data.hit = true;
            const dir = sign(o.pos.x - man.pos.x) || man.facing;
            strike(man, o, { part: 'torso', power: 2.4, weapon: 'speedBlow', dir, launch: { x: dir * 14, y: 4 } });
            man.sandbox.emit('dropkick', { who: man, target: o, x: o.wj.chest.x, y: o.wj.chest.y, loud: true });
          }
          return m.pt < 0.7;
      }
      return false;
    },
  },

  kickStorm: {
    label: 'Kick Storm', say: 'pwKickStorm', cool: 8, max: 4, clips: ['kickStorm', 'kick'],
    want: (me, o, c) => (c.d < 8 && !o.lying && !o.heldBy ? 0.9 : 0),
    step(man, m, dt) {
      const o = m.o;
      if (!alive(o)) return false;
      const dir = sign(o.pos.x - man.pos.x) || man.facing;
      switch (m.phase) {
        case 'start': setPhase(m, 'in'); return true;
        case 'in':
          if (closeIn(man, m, o, 0.95, dt)) { act(man, 'kickStorm'); setPhase(m, 'storm'); }
          return m.pt < 1.5;
        case 'storm':
          if (Math.abs(o.pos.x - man.pos.x) > 1.1) zip(man, m, besideX(man, o, 0.9), dt);
          man.faceTo(o.pos.x);
          ghostsOf(man.sandbox).add(man, 0.25, 0.06);
          m.data.tick = (m.data.tick ?? 0.06) - dt;
          if (m.data.tick <= 0 && Math.abs(o.pos.x - man.pos.x) < 1.5) {
            m.data.tick = 0.085;
            strike(man, o, { part: chance(0.5) ? 'legA' : 'torso', power: 0.55, kind: 'kick', weapon: 'speedBlow', dir });
          }
          if (m.pt > 0.85) { act(man, 'kick', { speed: 2 }); setPhase(m, 'finish'); }
          return true;
        case 'finish':
          if (m.pt > 0.06 && !m.data.fin) {
            m.data.fin = true;
            strike(man, o, { part: 'torso', power: 1.8, kind: 'kick', weapon: 'speedBlow', dir, launch: { x: dir * 9, y: 3 } });
            man.sandbox.emit('kickStorm', { who: man, target: o, x: o.wj.chest.x, y: o.wj.chest.y, loud: true });
          }
          return m.pt < 0.35;
      }
      return false;
    },
  },

  rescueDash: {
    label: 'Rescue Dash', say: 'pwRescueDash', cool: 9, max: 5, needs: 'friend', clips: ['speedDash'],
    want: (me, o) => (alive(o) && !o.heldBy && (o.lying || threatNear(me, o, 4)) ? 1 : 0),
    step(man, m, dt) {
      const o = m.o;
      if (!o || o.removed) return false;
      switch (m.phase) {
        case 'start': setPhase(m, 'in'); return true;
        case 'in':
          if (closeIn(man, m, o, 0.35, dt)) {
            if (!seize(man, o, o.wj.chest.x, o.wj.chest.y)) return false;
            const th = threatNear(man, o, 12);
            const away = th ? sign(o.pos.x - th.pos.x) || 1 : -(sign(o.pos.x) || 1);
            m.data.to = clamp(o.pos.x + away * 10, man.sandbox.left + 1.5, man.sandbox.right - 1.5);
            setPhase(m, 'out');
            if (o.brain && o.alive && o.conscious) o.brain.speak('pwRescued', { other: man.name }, 0.7, man, false);
          }
          return m.pt < 1.5;
        case 'out': {
          if (!holding(man, o)) return false;
          const c = man.wj.shoulder;
          holdAt(man, o, c.x - man.facing * 0.05, c.y + 0.15, 0, 0);
          if (zip(man, m, m.data.to, dt, 22)) { letGo(man, o, 0, 0); o.thrownBy = null; setPhase(m, 'done'); }
          return m.pt < 2;
        }
        case 'done': return m.pt < 0.2;
      }
      return false;
    },
    end(man, m) { endHold(man, m); },
  },

  lightningLine: {
    label: 'Lightning Line', say: 'pwLightningLine', cool: 10, max: 2, clips: ['speedDash'],
    want: (me, o, c) => { const n = lineUp(me, sign(o.pos.x - me.pos.x) || me.facing); return c.d < 10 && n >= 1 ? 0.6 + n * 0.4 : 0; },
    step(man, m, dt) {
      const o = m.o, sb = man.sandbox;
      switch (m.phase) {
        case 'start':
          m.data.dir = o && alive(o) ? sign(o.pos.x - man.pos.x) || man.facing : man.facing;
          m.data.x0 = man.pos.x;
          m.data.to = man.pos.x + m.data.dir * 9;
          m.data.hit = new Set();
          setPhase(m, 'go');
          return true;
        case 'go': {
          const done = zip(man, m, m.data.to, dt, 40);
          for (const p of sb.people) {
            if (p === man || m.data.hit.has(p) || !alive(p) || p.lying) continue;
            if (Math.abs(p.pos.y - man.pos.y) > 1 || (p.pos.x - m.data.x0) * m.data.dir < 0) continue;
            if ((man.pos.x - p.pos.x) * m.data.dir < 0.1) continue;
            m.data.hit.add(p);
            strike(man, p, { part: 'torso', power: 1.4, weapon: 'speedBlow', dir: m.data.dir, launch: { x: m.data.dir * rand(3, 6), y: rand(4, 7) } });
          }
          if (done) {
            sb.effects.push(new Streak(m.data.x0, man.pos.x, man.pos.y + 1));
            sb.emit('lightningLine', { who: man, n: m.data.hit.size, x: man.pos.x, y: man.pos.y + 1, loud: true });
            setPhase(m, 'stop');
          }
          return m.pt < 1;
        }
        case 'stop': if (o && alive(o)) man.faceTo(o.pos.x); return m.pt < 0.3;
      }
      return false;
    },
  },
};

/** How many people are standing in a line in front of them, within 9 m (for Lightning Line). */
function lineUp(me, dir) {
  let n = 0;
  for (const p of me.sandbox.people) {
    if (p === me || !awake(p) || p.lying) continue;
    const d = (p.pos.x - me.pos.x) * dir;
    if (d > 0.3 && d < 9 && Math.abs(p.pos.y - me.pos.y) < 1 && (!me.brain || me.brain.rel(p).like < 0.2)) n++;
  }
  return n;
}
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

export const SPEED = {
  key: 'Speed', name: 'Super Speed', chip: 'Super fast',
  felt: 'Everything else has gone slow. Or I have gone fast.',
  moves: MOVES,
  gain(man, st) { st.dodgeT = 0; st.ghostT = 0; },
  speed(man, st, kind) { return kind === 'run' ? 3.2 : kind === 'flee' ? 3.5 : kind === 'walk' ? 1.15 : 1; },
  /** Twice as quick at everything in a fight (or on the move); at rest, the same as anybody. */
  tempo(man, st) { return man.pmove || (man.brain && man.brain.fighting) || Math.abs(man.vel.x) > 4 ? 2 : 1; },
  update(man, st, dt) {
    if (st.dodgeT > 0) st.dodgeT -= dt;
    // a blur of them behind them as they go
    if (Math.abs(man.vel.x) > 6 && man.state === 'stand') {
      st.ghostT -= dt;
      if (st.ghostT <= 0) { st.ghostT = 0.035; ghostsOf(man.sandbox).add(man, 0.35); }
      if (chance(dt * 8)) man.sandbox.fx.dust(man.pos.x - man.facing * 0.2, man.pos.y, 1, 0.6);
    }
  },
  /** A blow coming that they saw: usually, they are not there by the time it lands. */
  beforeHit(man, st, h) {
    if (st.dodgeT > 0 && h.weapon !== 'bullet') return 'dodged';
    if (!h.by || h.by === man || !awake(man) || man.pmove || (man.state !== 'stand' && man.state !== 'stagger') || man.lying) return null;
    if (h.kind === 'impact' || h.kind === 'fall' || h.weapon === 'shockwave' || h.weapon === 'explosion' || h.weapon === 'mind') return null;
    const bullet = h.weapon === 'bullet';
    const seen = !man.brain || man.brain.sees(h.by);
    if (!seen || !chance(bullet ? 0.25 : 0.6)) return null;
    if (now(man) - (st.dodgedT ?? -9) < (bullet ? 0.6 : 0.9)) return null;
    st.dodgedT = now(man);
    // a blink to one side, away from it: a picture of them where they were
    const g = ghostsOf(man.sandbox);
    g.add(man, 0.9, 0.5);
    const away = -(sign(h.by.pos.x - man.pos.x) || man.facing);
    const sb = man.sandbox;
    man.pos.x = clamp(man.pos.x + away * rand(0.9, 1.4), sb.left + 0.3, sb.right - 0.3);
    man.faceTo(h.by.pos.x);
    sb.emit('speedDodge', { who: man, by: h.by, bullet, x: man.pos.x, y: man.pos.y + 1 });
    if (man.brain && chance(0.25)) man.brain.speak('pwDodged', { other: h.by.name }, 1, h.by, false);
    return 'dodged';
  },
};
