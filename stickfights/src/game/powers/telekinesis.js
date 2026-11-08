/* =============================================================================
   TELEKINESIS - moving things, and people, without touching them: a hand
   held out, a glow round whatever they have hold of, and it goes where the
   hand says.

   The moves:
     Lift          up off their feet, held in the air, kicking
     Throw         lifted, and thrown across the room
     Force Push    everything in front of them shoved away at once
     Pull          yanked across the floor to them
     Choke         held up by the throat by nothing at all
     Barrage       everything loose nearby up in the air - and at them, one by one
     Disarm        the weapon pulled out of their hand and into theirs
     Bullet Stop   rounds fired at them stop in the air, and hang there
     Slam          lifted and slammed into the floor, again and again
     Float         up off the ground themselves, hanging in the air
   ========================================================================== */
import { alive, awake, now, seize, holding, holdAt, letGo, strike, fling, shockwave, Grip, looseNear, setPhase, say, takeInHand, clamp, sign, rand, chance } from './common.js';
import { tkGlow, StoppedRounds } from './fx.js';

const G = 18;
const act = (man, clip, o = {}) => man.anim.act(clip, { fadeIn: 0.06, fadeOut: 0.18, ...o });
/** Holding a pose for as long as it takes (a one-off, re-held while the move runs). */
const pose = (man, clip) => { if (man.anim.actionName !== clip) man.anim.act(clip, { fadeIn: 0.1, fadeOut: 0.2 }); };
const reach = (man) => man.wj.handA;
const endHold = (man, m) => { if (m.o && holding(man, m.o)) letGo(man, m.o, 0, 0); };
const inRange = (me, o, r) => Math.hypot(o.pos.x - me.pos.x, o.pos.y - me.pos.y) < r;

/** Somebody held up in the air at (x, y): glowing, and the hand on them. */
function float(man, m, o, x, y, vx = 0, vy = 0) {
  holdAt(man, o, x, y, vx, vy);
  tkGlow(man, o);
}

const MOVES = {
  lift: {
    label: 'Lift', say: 'pwTkLift', cool: 8, max: 4, clips: ['tkLift'],
    want: (me, o, c) => (inRange(me, o, 9) && !o.heldBy ? 0.9 : 0),
    step(man, m, dt) {
      const o = m.o;
      if (!o || o.removed) return false;
      switch (m.phase) {
        case 'start':
          if (!man.ready && man.state === 'stand') return m.pt < 0.6;
          man.stop(); man.faceTo(o.pos.x);
          if (!seize(man, o, o.wj.chest.x, o.wj.chest.y)) return false;
          m.data.x = o.wj.chest.x; m.data.y = o.wj.chest.y;
          act(man, 'tkLift', { fadeOut: 0.3 });
          setPhase(m, 'up');
          if (o.brain) o.brain.speak('pwLifted', { other: man.name }, 0.8, man, true);
          return true;
        case 'up': case 'hold': {
          if (!holding(man, o)) return false;
          pose(man, 'tkLift');
          const k = Math.min(1, m.pt / 0.6);
          const y = m.phase === 'up' ? m.data.y + 1.9 * k : m.data.y + 1.9 + Math.sin(m.t * 3) * 0.06;
          float(man, m, o, m.data.x, y, 0, 0);
          if (m.phase === 'up' && m.pt > 0.6) setPhase(m, 'hold');
          if (m.phase === 'hold' && m.pt > (m.told ? 2.2 : 1.6)) { letGo(man, o, 0, -1); setPhase(m, 'after'); }
          return true;
        }
        case 'after': return m.pt < 0.3;
      }
      return false;
    },
    end(man, m) { endHold(man, m); },
  },

  throw: {
    label: 'Throw', say: 'pwTkThrow', cool: 8, max: 4, clips: ['tkLift', 'tkThrow'],
    want: (me, o, c) => (inRange(me, o, 9) && !o.heldBy ? 1.2 : 0),
    step(man, m, dt) {
      const o = m.o;
      if (!o || o.removed) return false;
      switch (m.phase) {
        case 'start':
          if (!man.ready && man.state === 'stand') return m.pt < 0.6;
          man.stop(); man.faceTo(o.pos.x);
          if (!seize(man, o, o.wj.chest.x, o.wj.chest.y)) return false;
          m.data.x = o.wj.chest.x; m.data.y = o.wj.chest.y;
          act(man, 'tkLift', { fadeOut: 0.1 });
          setPhase(m, 'up');
          if (o.brain) o.brain.speak('pwLifted', { other: man.name }, 0.7, man, true);
          return true;
        case 'up': {
          if (!holding(man, o)) return false;
          const k = Math.min(1, m.pt / 0.55);
          float(man, m, o, m.data.x - man.facing * 0.3 * k, m.data.y + 1.5 * k, 0, 0);
          if (m.pt > 0.7) { act(man, 'tkThrow', { fadeIn: 0.04 }); setPhase(m, 'throw'); }
          return true;
        }
        case 'throw':
          if (!holding(man, o)) return false;
          if (m.pt > 0.12) {
            const away = sign(o.pos.x - man.pos.x) || man.facing;
            letGo(man, o, away * 15, 6.5);
            man.sandbox.emit('tkThrow', { who: man, target: o, x: o.wj.chest.x, y: o.wj.chest.y, loud: true });
            setPhase(m, 'after');
          } else float(man, m, o, m.data.x - man.facing * 0.3, m.data.y + 1.5, 0, 0);
          return true;
        case 'after': return m.pt < 0.35;
      }
      return false;
    },
    end(man, m) { endHold(man, m); },
  },

  push: {
    label: 'Force Push', say: 'pwTkPush', cool: 8, max: 2, needs: 'none', clips: ['tkPush'],
    want: (me, o, c) => (c.d < 6 && !o.lying ? 1 + countAhead(me, 6) * 0.2 : 0),
    start(man) { return man.state === 'stand'; },
    step(man, m) {
      switch (m.phase) {
        case 'start':
          man.stop();
          if (m.o && alive(m.o)) man.faceTo(m.o.pos.x);
          if (!man.ready) return m.pt < 0.8;
          act(man, 'tkPush');
          setPhase(m, 'push');
          return true;
        case 'push':
          if (m.pt > 0.22 && !m.data.hit) {
            m.data.hit = true;
            const h = man.wj.handA;
            for (const p of shockwave(man, h.x, man.pos.y, 6.5, 2.2, { cone: man.facing, lift: 0.5, weapon: 'mind' })) tkGlow(man, p, 0.6);
            man.sandbox.emit('tkPush', { who: man, x: h.x, y: h.y, loud: true });
          }
          return m.pt < 0.6;
      }
      return false;
    },
  },

  pull: {
    label: 'Pull', say: 'pwTkPull', cool: 6, max: 3, clips: ['tkPull', 'cross'],
    want: (me, o, c) => (c.d > 2.5 && c.d < 10 && !o.heldBy && !o.lying ? 1 : 0),
    step(man, m) {
      const o = m.o;
      if (!alive(o)) return false;
      const dir = sign(o.pos.x - man.pos.x) || man.facing;
      switch (m.phase) {
        case 'start':
          man.stop(); man.faceTo(o.pos.x);
          if (!man.ready && man.state === 'stand') return m.pt < 0.6;
          act(man, 'tkPull');
          setPhase(m, 'reach');
          return true;
        case 'reach':
          tkGlow(man, o);
          if (m.pt > 0.25) {
            fling(o, -dir * clamp(Math.abs(o.pos.x - man.pos.x) * 1.5, 6, 13), 3.5);
            man.sandbox.emit('tkPull', { who: man, target: o, x: o.wj.chest.x, y: o.wj.chest.y, loud: true });
            if (o.brain) o.brain.speak('pwYanked', { other: man.name }, 0.6, man, true);
            setPhase(m, 'catch');
          }
          return true;
        case 'catch':
          // pulled into reach: a fist waiting for them
          if (!m.data.hit && Math.abs(o.pos.x - man.pos.x) < 1.1 && man.ready) {
            m.data.hit = true;
            man.faceTo(o.pos.x);
            act(man, 'cross', { speed: 1.2 });
            man.sandbox.later(0.12, () => { if (alive(o) && Math.abs(o.pos.x - man.pos.x) < 1.3) strike(man, o, { part: 'head', power: 1.5, kind: 'punch', weapon: null, dir: -dir, launch: { x: -dir * 3, y: 1 } }); });
          }
          return m.pt < 0.9;
      }
      return false;
    },
  },

  choke: {
    label: 'Choke', say: 'pwTkChoke', cool: 12, max: 5, clips: ['tkChoke'],
    want: (me, o, c) => (inRange(me, o, 7) && !o.heldBy && c.r.anger > 0.7 && !o.lying ? 0.8 : 0),
    step(man, m, dt) {
      const o = m.o;
      if (!o || o.removed) return false;
      switch (m.phase) {
        case 'start':
          if (!man.ready && man.state === 'stand') return m.pt < 0.6;
          man.stop(); man.faceTo(o.pos.x);
          if (!seize(man, o, o.wj.neck.x, o.wj.neck.y)) return false;
          m.data.x = o.wj.neck.x; m.data.y = o.wj.neck.y;
          act(man, 'tkChoke', { fadeOut: 0.3 });
          setPhase(m, 'hold');
          return true;
        case 'hold': {
          if (!holding(man, o)) return false;
          pose(man, 'tkChoke');
          const k = Math.min(1, m.pt / 0.5);
          float(man, m, o, m.data.x, m.data.y + 0.55 * k + Math.sin(m.t * 9) * 0.02, 0, 0);
          if (!o.dead) {
            o.health.oxygen = Math.max(0, (o.health.oxygen ?? 1) - dt * 0.24);
            o.health.pain = Math.min(130, o.health.pain + dt * 8);
            if (o.brain && chance(dt * 0.9)) o.brain.speak('choking', {}, 1, null, false);
          }
          if (m.pt > (m.told ? 3.2 : 2.6)) { letGo(man, o, 0, 0); setPhase(m, 'after'); }
          return true;
        }
        case 'after': return m.pt < 0.3;
      }
      return false;
    },
    end(man, m) { endHold(man, m); },
  },

  barrage: {
    label: 'Barrage', say: 'pwTkBarrage', cool: 12, max: 6, clips: ['tkLift', 'tkThrow'],
    want: (me, o, c) => (c.d > 2 && c.d < 12 && throwables(me).length >= 2 ? 1.1 : 0),
    start(man, m) { m.data.things = throwables(man).slice(0, 5); return m.data.things.length > 0; },
    step(man, m, dt) {
      const o = m.o, sb = man.sandbox;
      switch (m.phase) {
        case 'start':
          man.stop();
          if (o && alive(o)) man.faceTo(o.pos.x);
          m.data.grips = m.data.things.map((t) => new Grip(sb, t, t.body.pos.x, t.body.pos.y, { hz: 3.5, damping: 0.8, by: man })).filter((g) => g.ok);
          if (!m.data.grips.length) return false;
          act(man, 'tkLift', { fadeOut: 0.3 });
          setPhase(m, 'gather');
          return true;
        case 'gather': case 'fire': {
          pose(man, m.phase === 'fire' ? 'tkThrow' : 'tkLift');
          // round above their head, turning slowly
          const gs = m.data.grips;
          gs.forEach((g, i) => {
            if (!g.ok) return;
            const a = m.t * 1.4 + (i / gs.length) * Math.PI * 2;
            g.to(man.pos.x + Math.cos(a) * 1.2, man.pos.y + 2.5 + Math.sin(a) * 0.35, dt);
            tkGlow(man, g.thing, 0.7);
          });
          if (m.phase === 'gather' && m.pt > 0.9) { setPhase(m, 'fire'); m.data.next = 0; }
          if (m.phase === 'fire') {
            m.data.next -= dt;
            const g = gs.find((x) => x.ok);
            if (!g) return m.pt < 0.6;
            if (m.data.next <= 0) {
              m.data.next = 0.28;
              const b = g.thing.body;
              const tx = o && alive(o) ? o.wj.chest.x : man.pos.x + man.facing * 8, ty = o && alive(o) ? o.wj.chest.y : 1;
              const dx = tx - b.pos.x, dy = ty - b.pos.y, d = Math.hypot(dx, dy) || 1;
              const sp = 17, t = d / sp;
              g.release((dx / d) * sp, (dy / d) * sp + 0.5 * G * t, man);
              sb.emit('tkHurl', { who: man, target: o, what: g.thing, x: b.pos.x, y: b.pos.y, loud: false });
            }
          }
          return true;
        }
      }
      return false;
    },
    end(man, m) { for (const g of m.data.grips || []) if (!g.dead) g.release(0, 0, man); },
  },

  disarm: {
    label: 'Disarm', say: 'pwTkDisarm', cool: 6, max: 2.5, clips: ['tkPull'],
    want: (me, o, c) => (o.weapon && inRange(me, o, 12) ? (o.gunReady ? 2.4 : 1.3) : 0),
    start(man, m) { return !!m.o.weapon; },
    step(man, m, dt) {
      const o = m.o, sb = man.sandbox;
      switch (m.phase) {
        case 'start': {
          man.stop(); man.faceTo(o.pos.x);
          const w = o.weapon;
          if (!w) return false;
          act(man, 'tkPull');
          o.dropWeapon(0);
          m.data.w = w;
          m.data.grip = new Grip(sb, w, w.body.pos.x, w.body.pos.y, { hz: 6, damping: 0.9, by: man });
          if (!m.data.grip.ok) return false;
          sb.emit('tkDisarm', { who: man, target: o, what: w, x: w.body.pos.x, y: w.body.pos.y, loud: true });
          if (o.brain) o.brain.speak('pwSnatched', { other: man.name }, 0.8, man, true);
          setPhase(m, 'pull');
          return true;
        }
        case 'pull': {
          const g = m.data.grip, w = m.data.w;
          if (!g.ok) return false;
          const h = reach(man);
          g.to(h.x + man.facing * 0.15, Math.max(0.4, h.y), dt);
          tkGlow(man, w, 0.8);
          const b = w.body;
          if (Math.hypot(b.pos.x - h.x, b.pos.y - h.y) < 0.45 || m.pt > 1.2) {
            g.release(0, 0, man);
            // into the hand (or a pocket); at their feet, if there is nowhere for it
            if (!takeInHand(man, w)) { b.vel.x = 0; b.vel.y = 0; }
            return false;
          }
          return true;
        }
      }
      return false;
    },
    end(man, m) { if (m.data.grip && !m.data.grip.dead) m.data.grip.release(0, 0, man); },
  },

  bulletStop: {
    label: 'Bullet Stop', say: 'pwTkBulletStop', cool: 10, max: 5.5, needs: 'none', clips: ['tkShield'],
    want: () => 0,
    start(man, m, st) { st.shieldT = 5; return true; },
    step(man, m, dt, st) {
      if (man.state === 'stand') pose(man, 'tkShield');
      return st.shieldT > 0;
    },
    end(man, m, why, st) { if (st) { st.shieldT = 0; dropStopped(man, st); } },
  },

  slam: {
    label: 'Slam', say: 'pwTkSlam', cool: 10, max: 5, clips: ['tkSlam'],
    want: (me, o, c) => (inRange(me, o, 8) && !o.heldBy && c.r.anger > 0.6 ? 1 : 0),
    step(man, m, dt) {
      const o = m.o;
      if (!o || o.removed) return false;
      switch (m.phase) {
        case 'start':
          if (!man.ready && man.state === 'stand') return m.pt < 0.6;
          man.stop(); man.faceTo(o.pos.x);
          if (!seize(man, o, o.wj.chest.x, o.wj.chest.y)) return false;
          m.data.x = o.wj.chest.x;
          m.data.g = 0;
          m.data.n = 0;
          // (the first lift is from wherever they are - on their feet, as often as not - not from the floor)
          m.data.from = o.wj.chest.y;
          act(man, 'tkSlam', { fadeOut: 0.3 });
          setPhase(m, 'up');
          if (o.brain) o.brain.speak('pwLifted', { other: man.name }, 0.7, man, true);
          return true;
        case 'up': case 'down': {
          if (!holding(man, o)) return false;
          pose(man, 'tkSlam');
          const top = m.data.g + 2.4, bottom = m.data.g + 0.28;
          if (m.phase === 'up') {
            const k = Math.min(1, m.pt / 0.38), from = m.data.from ?? bottom;
            float(man, m, o, m.data.x, from + (top - from) * k, 0, 2);
            if (m.pt > 0.42) setPhase(m, 'down');
          } else {
            const k = Math.min(1, m.pt / 0.11);
            float(man, m, o, m.data.x, top + (bottom - top) * k, 0, -18);
            if (m.pt > 0.12) {
              m.data.n++;
              strike(man, o, { part: 'torso', power: 1.35, weapon: 'slam', dir: sign(o.pos.x - man.pos.x) || 1, at: o.wj.chest });
              man.sandbox.fx.dust(m.data.x, m.data.g, 10, 1);
              man.sandbox.emit('tkSlam', { who: man, target: o, n: m.data.n, x: m.data.x, y: m.data.g, loud: true });
              if (m.data.n >= 3) { letGo(man, o, 0, -2); setPhase(m, 'after'); }
              else { m.data.from = bottom; setPhase(m, 'up'); }
            }
          }
          return true;
        }
        case 'after': return m.pt < 0.4;
      }
      return false;
    },
    end(man, m) { endHold(man, m); },
  },

  float: {
    label: 'Float', say: 'pwTkFloat', sayP: 0.5, cool: 6, max: 7, needs: 'none', clips: [],
    want: () => 0,
    start(man, m, st) {
      if (man.state !== 'stand' && man.state !== 'air') return false;
      man.setState('air');
      man.onGround = false;
      man.support = null;
      man.vel.y = Math.max(man.vel.y, 2);
      st.floatY = man.pos.y + 1.4;
      st.floating = true;
      return true;
    },
    step(man, m, dt, st) {
      if (man.state !== 'air') return false;
      return m.pt < (m.told ? 6 : 4);
    },
    end(man, m, why, st) { if (st) st.floating = false; man.gravity = 1; },
  },
};

/** Loose things within reach that could be thrown with a thought: not too big, not somebody's. */
function throwables(me) {
  return looseNear(me.sandbox, me.pos.x, me.pos.y + 0.5, 7, { max: 6 }).filter((t) => t.body.mass < 120 && !t.background);
}
function countAhead(me, r) {
  let n = 0;
  for (const p of me.sandbox.people) {
    if (p === me || !awake(p) || p.lying) continue;
    const d = (p.pos.x - me.pos.x) * me.facing;
    if (d > 0 && d < r && Math.abs(p.pos.y - me.pos.y) < 1.5) n++;
  }
  return n;
}

/** The rounds hanging in the air drop, all at once. */
function dropStopped(man, st) {
  if (!st.stopped || !st.stopped.length) return;
  for (const r of st.stopped) r.drop = true;
  st.stopped = [];
}

export const TELEKINESIS = {
  key: 'TK', name: 'Telekinesis', chip: 'Telekinetic',
  felt: 'I can feel everything in the room. Like it is all on strings, and I am holding them.',
  moves: MOVES,
  gain(man, st) { st.shieldT = 0; st.stopped = []; st.floating = false; },
  lose(man, st) { st.shieldT = 0; dropStopped(man, st); if (st.floating) { st.floating = false; man.gravity = 1; } },
  update(man, st, dt) {
    if (st.shieldT > 0) {
      st.shieldT -= dt;
      if (st.shieldT <= 0 || !awake(man)) { st.shieldT = 0; dropStopped(man, st); }
    }
    if (st.floating && (man.state !== 'air' || !awake(man))) { st.floating = false; man.gravity = 1; }
  },
  air(man, st, dt) {
    if (!st.floating) return false;
    // hanging in the air, drifting where their brain wants to be
    const gx = man.intent.x ?? man.pos.x;
    const gy = st.floatY + Math.sin(st.t * 2) * 0.06;
    const k = 1 - Math.exp(-dt * 4);
    man.vel.x += (clamp((gx - man.pos.x) * 2, -2.5, 2.5) - man.vel.x) * k;
    man.vel.y += ((gy - man.pos.y) * 3 - man.vel.y) * k;
    man.gravity = 0;
    if (Math.abs(man.vel.x) > 0.5) man.facing = sign(man.vel.x);
    man.anim.play('tkFloat', { blend: 0.2 });
    man.anim.setOverlay(null);
    tkGlow(man, null, 0.5);
    return true;
  },
  touchDown(man, st) {
    if (!st.floating) return false;
    man.onGround = false;
    man.vel.y = Math.max(man.vel.y, 1);
    return true;
  },
  /** A round coming at them, with the shield up: how far along its path it stops, or null. */
  stopsRound(man, st, px, py, dx, dy, range) {
    if (!(st.shieldT > 0) || !awake(man)) return null;
    const c = man.wj.chest, R = 1.35;
    const fx = px - c.x, fy = py - c.y;
    const b = fx * dx + fy * dy, cc = fx * fx + fy * fy - R * R;
    if (cc < 0) return null; // (fired from inside it: by them, or right up against them)
    const disc = b * b - cc;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    return t < 1e-3 || t > range ? null : t;
  },
  /** ...and it did: there it hangs, until the shield comes down. */
  roundStopped(man, st, x, y, dx, dy) {
    if (!st.stopped) st.stopped = [];
    st.stopped.push(StoppedRounds.of(man.sandbox).add(x, y, Math.atan2(dy, dx)));
    man.sandbox.emit('bulletStopped', { who: man, x, y, loud: false });
    tkGlow(man, null, 1);
  },
  reflex(me, st, brain, start) {
    if (me.pmove) return;
    const t = now(me);
    // a gun on them: the shield up, or the gun out of their hand
    const ab = brain.aimedBy, aimed = ab && t - (brain.aimedT ?? -9) < 0.8 && alive(ab) && ab.gunReady;
    const shot = brain.gunThreat && t - brain.gunThreat.t < 1.5;
    if ((aimed || shot) && !(st.shieldT > 0)) {
      if (aimed && ab.weapon && t - (st.cool.disarm ?? -99) > 6 && chance(0.45) && Math.hypot(ab.pos.x - me.pos.x, ab.pos.y - me.pos.y) < 12) {
        if (start(me, 'tk', 'disarm', ab)) return;
      }
      if (t - (st.cool.bulletStop ?? -99) > 6 && chance(aimed ? 0.5 : 0.7)) start(me, 'tk', 'bulletStop', null);
    }
  },
};
