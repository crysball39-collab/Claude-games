/* =============================================================================
   SUPER DURABILITY - skin like stone. A blow, a cut, a fall, a blast or a fire
   does a fraction of what it would do to anybody else; a bullet rings off
   them and goes somewhere else; a blade skids off without opening them up,
   and nothing - not a machete, not a grenade, not a rifle round - takes a
   limb off. Bones are hard to break and knives do not stay in. A bare fist
   or foot that lands on them hurts whoever threw it. The worst a superhuman
   blow or a monster the size of a building can do still gets through, a
   little: they are hard to hurt, not impossible to.

   (The rest of the game sees this as man.toughSkin, and the armor() and
   shot() hooks below: stickman.js for blows, rounds, falls and limbs coming
   off, explode.js for blasts, vitals.js for burning.)

   The moves:
     Brace          feet planted, arms up: for a few seconds nothing moves
                    them, and a fist on them hurts the fist
     Bullet Walk    straight at somebody shooting at them, rounds sparking
                    off, and the gun taken out of their hand
     Headbutt       a skull harder than anything: dazed, if not down
     Body Slam      up, and down on top of them, full weight
     Human Shield   in front of a friend somebody is shooting at, arms out,
                    taking every round meant for them
     Smother        onto a live grenade (or C4, or TNT): whatever it does,
                    it does mostly to them
     Unstoppable    a charge, head down, through everybody in the way
     Blade Catch    the knife (or the machete) caught in a bare hand, and
                    taken off them - or snapped
     Hit Me         arms wide: everybody who wants a fight, come and have
                    one - and every blow costs whoever throws it
     Shrug Off      up off the floor in an instant (or out of somebody's
                    grip), everybody near shoved away
   ========================================================================== */
import { alive, awake, now, strike, shockwave, takeInHand, setPhase, besideX, say, clamp, sign, rand, chance } from './common.js';
import { Ring, Cracks } from './fx.js';
import { armOf, isBlade, isFirearm, defineArm } from '../props.js';

// what it does to anybody on the end of it, as far as wounds, memories and witnesses go
const ARM = (kind, o) => defineArm(kind, { memory: 'hurtMe', hurt: 'hurtBig', scary: 0.5, power: 2.5, ...o });
ARM('ironHead', { name: 'A head like a rock', noun: 'headbutt', cause: 'a headbutt', shove: 1.4, nasty: 2.4, breaks: 0.3, verb: 'headbutted me', seen: 'sawHeadbutt' });
ARM('bodySlam', { name: 'A body slam', noun: 'slam', cause: 'being landed on', shove: 1.6, nasty: 2.6, breaks: 0.4, verb: 'landed on me', seen: 'sawSlam' });
ARM('ram', { name: 'A charge', noun: 'charge', cause: 'being run down', shove: 2, nasty: 2, breaks: 0.15, verb: 'ran straight through me' });
// a fist or a foot on skin like stone: whoever threw it, hurt by it
ARM('hardSkin', { name: 'Hitting something too hard to hit', noun: 'blow', cause: 'hitting someone who could not be hurt', shove: 0.15, nasty: 1, breaks: 0.25, memory: null, hurt: 'pwHandHurt', scary: 0.2, power: 1 });
// a round that rang off the skin: a bruise, at most
ARM('skinRound', { name: 'A round off the skin', noun: 'round', cause: 'a bullet', shove: 0.5, nasty: 0.6, memory: 'shotMe', hurt: 'pwBulletBounce', scary: 0.5, power: 2 });

const act = (man, clip, o = {}) => man.anim.act(clip, { fadeIn: 0.05, fadeOut: 0.15, ...o });

/** On foot, up to them: true once they are within `gap` and ready to do something. */
function closeOnFoot(man, o, gap = 0.85, speed = 'run') {
  const d = Math.abs(o.pos.x - man.pos.x);
  if (d > gap + 0.15) { man.goTo(besideX(man, o, gap), speed); return false; }
  man.stop();
  man.faceTo(o.pos.x);
  return man.ready;
}

const gunOn = (o) => !!o && !!o.weapon && isFirearm(o.armedWith);
const bladeOn = (o) => {
  if (!o || !o.weapon) return false;
  const k = o.armedWith, s = armOf(k);
  return isBlade(k) || k === 'crowbar' || !!(s && s.blade && !o.innate);
};
/** Somebody with a gun pointed at `p` right now. */
function shooterAt(sb, p) {
  for (const q of sb.people) if (q !== p && awake(q) && q.aiming && q.aimTarget === p && q.gunReady && q.weapon) return q;
  return null;
}
/** A grenade, a block of C4 or TNT that is going to go off, within r of x (the nearest). */
function liveBomb(sb, x, y, r) {
  let best = null, bd = r;
  for (const t of sb.items) {
    if (t.removed || !t.lit || !t.body || t.kind === 'missile' || !t.loose) continue;
    const d = Math.hypot(t.pos.x - x, (t.pos.y - y) * 0.6);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}
/** How many people are within r of it, who would be caught in it. */
function caughtBy(sb, t, r, but) {
  let n = 0;
  for (const p of sb.people) if (p !== but && alive(p) && Math.hypot(p.pos.x - t.pos.x, p.pos.y - t.pos.y) < r) n++;
  return n;
}
/** How many people with a mind to fight are within r. */
function foesNear(me, r) {
  let n = 0;
  for (const p of me.sandbox.people) {
    if (p === me || !awake(p) || p.lying || Math.abs(p.pos.x - me.pos.x) > r) continue;
    if ((p.brain && p.brain.fighting) || (me.brain && me.brain.isHostile(p))) n++;
  }
  return n;
}
/** People standing between them and `o`, in the way of a charge. */
function inPath(me, o) {
  const a = Math.min(me.pos.x, o.pos.x), b = Math.max(me.pos.x, o.pos.x);
  let n = 0;
  for (const p of me.sandbox.people) if (p !== me && p !== o && awake(p) && !p.lying && p.pos.x > a && p.pos.x < b && Math.abs(p.pos.y - me.pos.y) < 1) n++;
  return n;
}

// blows thrown with a bare hand or foot (a weapon swung is the weapon's business)
const BARE = new Set(['jab', 'cross', 'uppercut', 'kick', 'stomp']);
const FOOT = new Set(['kick', 'stomp']);

const MOVES = {
  brace: {
    label: 'Brace', say: 'pwBrace', cool: 9, max: 4.4, needs: 'none', clips: ['braceSelf'],
    want: (me, o, c) => (c.d < 2.6 && (o.attacking || me.health.overall < 0.6) ? 0.7 : 0),
    start(man) { return man.onGround && man.state === 'stand'; },
    step(man, m, dt, st) {
      switch (m.phase) {
        case 'start':
          man.stop();
          act(man, 'braceSelf', { fadeOut: 0.25 });
          st.braceT = 3.8;
          man.sandbox.emit('brace', { who: man, x: man.wj.chest.x, y: man.wj.chest.y });
          setPhase(m, 'hold');
          return true;
        case 'hold':
          man.stop();
          return st.braceT > 0;
      }
      return false;
    },
    end(man, m, why, st) { if (st) st.braceT = 0; },
  },

  bulletWalk: {
    label: 'Bullet Walk', say: 'pwBulletWalk', cool: 10, max: 12, clips: ['toughWalk', 'shoveHard'],
    want: (me, o, c) => (gunOn(o) && c.d > 2.2 && c.d < 16 ? 2.2 : 0),
    step(man, m) {
      const o = m.o;
      if (!alive(o)) return false;
      switch (m.phase) {
        case 'start':
          act(man, 'toughWalk', { fadeOut: 0.2 });
          setPhase(m, 'walk');
          return true;
        case 'walk': {
          // not running: walking, the way you would if nothing could hurt you
          if (man.anim.actionName !== 'toughWalk' && !man.anim.acting) act(man, 'toughWalk', { fadeOut: 0.2 });
          const d = Math.abs(o.pos.x - man.pos.x);
          if (d > 0.95) { man.goTo(besideX(man, o, 0.75), 'walk'); return m.pt < 10; }
          man.stop();
          man.faceTo(o.pos.x);
          setPhase(m, 'take');
          return true;
        }
        case 'take': {
          const dir = sign(o.pos.x - man.pos.x) || man.facing;
          man.anim.stopAction(0.05);
          act(man, 'shoveHard', { fadeIn: 0.03 });
          // the gun out of their hand (theirs now, if a hand is free)
          if (gunOn(o) && o.weapon) {
            const g = o.weapon;
            o.dropWeapon(0);
            if (!takeInHand(man, g) && g.body) { g.body.vel.x = dir * 3; g.body.vel.y = 2; }
            man.sandbox.emit('gunTaken', { who: man, target: o, item: g, x: o.wj.handA.x, y: o.wj.handA.y });
            if (o.brain) o.brain.speak('pwGunTaken', { other: man.name }, 0.8, man, true);
          }
          strike(man, o, { part: 'torso', power: 1.5, weapon: 'ram', dir, launch: { x: dir * 6, y: 3 } });
          setPhase(m, 'after');
          return true;
        }
        case 'after': return m.pt < 0.5;
      }
      return false;
    },
  },

  headbutt: {
    label: 'Headbutt', say: 'pwHeadbutt', cool: 6, max: 5, clips: ['headbutt'],
    want: (me, o, c) => (c.d < 3 && !o.lying && !o.heldBy ? 1.1 : 0),
    step(man, m) {
      const o = m.o;
      if (!alive(o)) return false;
      switch (m.phase) {
        case 'start': setPhase(m, 'approach'); return true;
        case 'approach':
          if (!closeOnFoot(man, o, 0.5)) return m.pt < 4;
          act(man, 'headbutt', { fadeIn: 0.03 });
          setPhase(m, 'butt');
          return true;
        case 'butt':
          if (m.pt > 0.2 && !m.data.hit) {
            m.data.hit = true;
            const d = Math.abs(o.pos.x - man.pos.x);
            if (d < 1.1 && !o.lying) {
              const dir = sign(o.pos.x - man.pos.x) || man.facing;
              strike(man, o, { part: 'head', power: 2.8, weapon: 'ironHead', dir });
              if (!o.removed && o.alive) {
                o.health.dizzy = Math.max(o.health.dizzy || 0, 2.4);
                if (o.state === 'stand' && chance(0.55)) o.knockDown(dir, 1.4);
              }
              man.sandbox.emit('headbutt', { who: man, target: o, x: man.wj.head.x, y: man.wj.head.y, loud: true });
            }
          }
          return m.pt < 0.5;
      }
      return false;
    },
  },

  bodySlam: {
    label: 'Body Slam', say: 'pwBodySlam', cool: 9, max: 5, allow: ['air'], clips: ['slamTuck', 'slamLand'],
    // (somebody on the floor: dropped on from above, all of them)
    want: (me, o, c) => (c.d < 4.5 && !o.heldBy && Math.abs(c.dy || 0) < 1 ? (o.lying ? 1.3 : c.d > 1.2 ? 1 : 0) : 0),
    step(man, m) {
      const o = m.o;
      if (!alive(o)) return m.phase === 'air' ? !man.onGround : false;
      switch (m.phase) {
        case 'start': setPhase(m, 'approach'); return true;
        case 'approach': {
          const d = Math.abs(o.pos.x - man.pos.x);
          if (d > 2.6) { man.goTo(besideX(man, o, 2.2), 'run'); return m.pt < 4; }
          if (!man.ready) return m.pt < 4;
          const dir = sign(o.pos.x - man.pos.x) || man.facing;
          man.faceTo(o.pos.x);
          if (!man.jump(dir * 3.5, 7.5)) return m.pt < 4;
          setPhase(m, 'up');
          return true;
        }
        case 'up':
          // off the ground: curled up, and steering for them
          if (man.onGround && m.pt < 0.25) return true;
          if (man.state === 'air' && man.anim.actionName !== 'slamTuck') act(man, 'slamTuck', { fadeIn: 0.05, fadeOut: 0.05 });
          if (man.state === 'air') setPhase(m, 'air');
          return m.pt < 1;
        case 'air':
          man.vel.x = clamp((o.pos.x - man.pos.x) * 5, -7, 7);
          if (!man.onGround && man.state === 'air') return m.pt < 2.5;
          setPhase(m, 'land');
          return true;
        case 'land': {
          if (m.data.done) return m.pt < 0.6;
          m.data.done = true;
          man.anim.stopAction(0.02);
          act(man, 'slamLand', { fadeIn: 0.02, fadeOut: 0.3 });
          const x = man.pos.x, dir = sign(o.pos.x - x) || man.facing;
          if (Math.abs(o.pos.x - x) < 1.4 && Math.abs(o.pos.y - man.pos.y) < 1.2) {
            strike(man, o, { part: 'torso', power: 3, weapon: 'bodySlam', dir });
            if (!o.removed && o.alive && o.state !== 'down') o.knockDown(dir, 1.8);
          }
          shockwave(man, x, man.pos.y, 2, 1.1, { spare: o });
          if (man.pos.y < 0.05) man.sandbox.effects.push(new Cracks(x, 0.7));
          man.sandbox.emit('bodySlam', { who: man, target: o, x, y: man.pos.y, loud: true });
          return true;
        }
      }
      return false;
    },
  },

  humanShield: {
    label: 'Human Shield', say: 'pwHumanShield', cool: 12, max: 9, needs: 'friend', clips: ['shieldArms'],
    want: (me, o) => (alive(o) && shooterAt(me.sandbox, o) ? 1 : 0),
    step(man, m, dt) {
      const o = m.o;
      if (!alive(o)) return false;
      const sh = shooterAt(man.sandbox, o);
      if (sh) { m.data.sh = sh; m.data.quiet = 0; } else m.data.quiet = (m.data.quiet || 0) + dt;
      const s = m.data.sh;
      // nobody shooting at them, after all: nothing to stand in front of
      if (!s || !alive(s)) return m.pt < 1;
      const dir = sign(s.pos.x - o.pos.x) || 1;
      const spot = clamp(o.pos.x + dir * 0.85, man.sandbox.left + 0.3, man.sandbox.right - 0.3);
      switch (m.phase) {
        case 'start': setPhase(m, 'go'); return true;
        case 'go':
          if (Math.abs(man.pos.x - spot) > 0.3) { man.goTo(spot, 'run'); return m.pt < 5; }
          man.stop();
          man.faceTo(s.pos.x);
          act(man, 'shieldArms', { fadeOut: 0.25 });
          man.shielding = o;
          man.sandbox.emit('humanShield', { who: man, target: o, by: s, x: man.wj.chest.x, y: man.wj.chest.y, loud: true });
          if (o.brain) o.brain.speak('pwShielded', { other: man.name }, 0.7, man, true);
          setPhase(m, 'stand');
          return true;
        case 'stand':
          // the friend moved: keep in front of them
          if (Math.abs(man.pos.x - spot) > 0.5) man.goTo(spot, 'walk');
          else man.stop();
          man.faceTo(s.pos.x);
          if (man.anim.actionName !== 'shieldArms' && !man.anim.acting) act(man, 'shieldArms', { fadeOut: 0.25 });
          // as long as the shooting goes on, and a moment after
          return m.data.quiet < 1.6 && m.pt < 8;
      }
      return false;
    },
    end(man) { man.shielding = null; },
  },

  smother: {
    label: 'Smother', say: 'pwSmother', cool: 14, max: 7, needs: 'none', clips: ['smotherDive'],
    want: () => 0,
    start(man, m) {
      const b = liveBomb(man.sandbox, man.pos.x, man.pos.y, 12);
      if (!b) return false;
      m.data.bomb = b;
      return true;
    },
    step(man, m) {
      const b = m.data.bomb, sb = man.sandbox;
      if (!b || b.removed || !b.lit) return false;
      switch (m.phase) {
        case 'start': setPhase(m, 'go'); return true;
        case 'go': {
          const d = b.pos.x - man.pos.x;
          if (Math.abs(d) > 1.1 || !man.ready) { man.goTo(b.pos.x - sign(d || 1) * 0.7, 'run'); return m.pt < 5; }
          man.stop();
          man.faceTo(b.pos.x);
          act(man, 'smotherDive', { fadeIn: 0.03, fadeOut: 0.02 });
          setPhase(m, 'dive');
          return true;
        }
        case 'dive':
          if (m.pt < 0.22) return true;
          // down on top of it: whatever it does now, it does mostly to them
          man.smothering = { bomb: b, until: now(man) + 8 };
          man.knockDown(sign(b.pos.x - man.pos.x) || man.facing, 0.4);
          sb.emit('smother', { who: man, what: b, x: b.pos.x, y: b.pos.y, loud: true });
          return false;
      }
      return false;
    },
  },

  unstoppable: {
    label: 'Unstoppable', say: 'pwUnstoppable', cool: 10, max: 4, clips: ['ramCharge'],
    want: (me, o, c) => (c.d > 2.5 && c.d < 12 && Math.abs(c.dy || 0) < 1 ? 0.6 + inPath(me, o) * 0.5 : 0),
    step(man, m, dt, st) {
      const o = m.o, sb = man.sandbox;
      switch (m.phase) {
        case 'start': {
          if (!alive(o)) return false;
          const dir = sign(o.pos.x - man.pos.x) || man.facing;
          m.data.dir = dir;
          m.data.to = clamp(o.pos.x + dir * 1.6, sb.left + 0.4, sb.right - 0.4);
          m.data.hit = new Set();
          man.faceTo(o.pos.x);
          act(man, 'ramCharge', { fadeOut: 0.2 });
          st.charging = true;
          sb.emit('unstoppable', { who: man, target: o, x: man.pos.x, y: man.pos.y + 1, loud: true });
          setPhase(m, 'charge');
          return true;
        }
        case 'charge': {
          const dir = m.data.dir;
          man.goTo(m.data.to, 'run');
          // everybody in the way goes over, or flying
          for (const p of sb.people) {
            if (p === man || m.data.hit.has(p) || !alive(p) || p.state === 'held' || (p.species && p.species.giant)) continue;
            const ahead = (p.pos.x - man.pos.x) * dir;
            if (ahead < -0.1 || ahead > 0.75 || Math.abs(p.pos.y - man.pos.y) > 1) continue;
            m.data.hit.add(p);
            if (p.lying) continue;
            strike(man, p, { part: 'torso', power: p === o ? 2.2 : 1.6, weapon: 'ram', dir, launch: { x: dir * (p === o ? 9 : 7), y: 4 } });
            sb.emit('ram', { who: man, target: p, x: p.wj.chest.x, y: p.wj.chest.y, loud: true });
          }
          for (const c of sb.crates) {
            if (c.removed || c.carriedBy) continue;
            const ahead = (c.pos.x - man.pos.x) * dir;
            if (ahead > 0 && ahead < 0.9 && c.pos.y < man.pos.y + 1.4) c.body.applyImpulse(dir * 9 * c.body.mass * 0.4, 3 * c.body.mass * 0.4, c.pos.x, c.pos.y);
          }
          // there, or stopped by a wall
          if ((m.data.to - man.pos.x) * dir < 0.2) { setPhase(m, 'stop'); return true; }
          m.data.still = Math.abs(man.vel.x) < 0.5 && m.pt > 0.4 ? (m.data.still || 0) + dt : 0;
          if (m.data.still > 0.3) { setPhase(m, 'stop'); return true; }
          return m.pt < 3;
        }
        case 'stop':
          man.stop();
          st.charging = false;
          return m.pt < 0.3;
      }
      return false;
    },
    end(man, m, why, st) { if (st) st.charging = false; },
  },

  bladeCatch: {
    label: 'Blade Catch', say: 'pwBladeCatch', cool: 8, max: 5, clips: ['bladeCatch'],
    want: (me, o, c) => (bladeOn(o) && c.d < 6 ? 2 : 0),
    step(man, m) {
      const o = m.o, sb = man.sandbox;
      if (!alive(o)) return false;
      switch (m.phase) {
        case 'start': setPhase(m, 'approach'); return true;
        case 'approach':
          if (!bladeOn(o)) return false;
          if (!closeOnFoot(man, o, 0.7)) return m.pt < 4;
          act(man, 'bladeCatch', { fadeIn: 0.03 });
          setPhase(m, 'catch');
          return true;
        case 'catch':
          if (m.pt > 0.22 && !m.data.done) {
            m.data.done = true;
            if (!bladeOn(o) || Math.abs(o.pos.x - man.pos.x) > 1.3) return m.pt < 0.6;
            const k = o.weapon, h = o.wj.handA;
            o.dropWeapon(0);
            sb.fx.sparks(h.x, h.y, 5);
            // a hand free: theirs now. Not: snapped in two, and dropped
            if (!man.weapon && takeInHand(man, k)) {
              sb.emit('bladeCatch', { who: man, target: o, item: k, x: h.x, y: h.y, loud: true });
            } else {
              sb.remove(k, { quiet: true });
              sb.fx.sparks(h.x, h.y, 9);
              sb.emit('bladeSnap', { who: man, target: o, x: h.x, y: h.y, loud: true });
            }
            if (o.brain) o.brain.speak('pwBladeTaken', { other: man.name }, 0.8, man, true);
          }
          return m.pt < 0.6;
      }
      return false;
    },
  },

  hitMe: {
    label: 'Hit Me', say: 'pwHitMe', cool: 14, max: 5, needs: 'none', clips: ['tauntWide'],
    want: (me, o, c) => { const n = foesNear(me, 7); return n >= 2 ? 0.9 : n === 1 && c.d < 3 && !o.lying ? 0.35 : 0; },
    start(man) { return man.onGround && man.state === 'stand'; },
    step(man, m, dt, st) {
      const sb = man.sandbox;
      switch (m.phase) {
        case 'start': {
          man.stop();
          act(man, 'tauntWide', { fadeOut: 0.25 });
          st.braceT = 4.2;
          // everybody spoiling for a fight, near enough to hear: come on, then
          for (const p of sb.people) {
            if (p === man || !awake(p) || !p.brain || Math.abs(p.pos.x - man.pos.x) > 9) continue;
            const r = p.brain.rel(man);
            const keen = (p.brain.fighting && p.brain.fightTarget !== man) || r.like < -0.1 || (man.brain && man.brain.isHostile(p));
            if (!keen) continue;
            r.anger = Math.max(r.anger, 0.85);
            if (p.brain.fighting && p.brain.fightTarget !== man && chance(0.75)) p.brain.order('fight', man);
          }
          sb.emit('hitMe', { who: man, x: man.wj.chest.x, y: man.wj.chest.y, loud: true });
          setPhase(m, 'taunt');
          return true;
        }
        case 'taunt':
          man.stop();
          return st.braceT > 0;
      }
      return false;
    },
    end(man, m, why, st) { if (st) st.braceT = 0; },
  },

  shrugOff: {
    label: 'Shrug Off', say: 'pwShrugOff', cool: 8, max: 1.6, needs: 'none', allow: ['down', 'crawl', 'held', 'getup', 'stagger', 'stumble'], clips: ['shrugBurst'],
    want: () => 0,
    start(man) {
      if (man.rag) return false;
      const by = man.state === 'held' ? man.heldBy : null;
      // (not out of the hand in the sky, and not out of a giant's fist)
      if (man.state === 'held' && (!by || by.kind !== 'stickman' || (by.species && by.species.giant))) return false;
      return true;
    },
    step(man, m) {
      const sb = man.sandbox;
      switch (m.phase) {
        case 'start': {
          const holder = man.state === 'held' ? man.heldBy : null;
          if (holder) {
            man.release();
            strike(man, holder, { part: 'torso', power: 1.4, weapon: 'ram', dir: sign(holder.pos.x - man.pos.x) || man.facing, launch: { x: (sign(holder.pos.x - man.pos.x) || man.facing) * 6, y: 3 } });
          }
          // up, all at once
          if (man.state !== 'stand' && man.state !== 'air' && man.state !== 'held') {
            man.setState('stand');
            man.balance = 1;
            man.anim.play(man.idleClip(), { blend: 0.08 });
          }
          if (man.state === 'stand') act(man, 'shrugBurst', { fadeIn: 0.03, fadeOut: 0.25 });
          shockwave(man, man.pos.x, man.pos.y, 1.9, 1, { spare: null });
          sb.effects.push(new Ring(man.wj.chest.x, man.wj.chest.y, 1.6, 0.3));
          sb.emit('shrugOff', { who: man, x: man.wj.chest.x, y: man.wj.chest.y, loud: true });
          setPhase(m, 'after');
          return true;
        }
        case 'after': return m.pt < 0.6;
      }
      return false;
    },
  },
};

export const DURABILITY = {
  key: 'Durability', name: 'Super Durability', chip: 'Unbreakable',
  felt: 'My skin feels like stone. I could walk through anything.',
  moves: MOVES,
  tough: true,
  gain(man, st) { man.toughSkin = true; st.braceT = 0; },
  lose(man, st) { man.toughSkin = false; man.shielding = null; man.smothering = null; st.braceT = 0; },
  update(man, st, dt) {
    if (st.braceT > 0) st.braceT -= dt;
    // lying on a bomb: kept under them until it goes (or long after it should have)
    const sm = man.smothering;
    if (sm) {
      const b = sm.bomb;
      if (!b || b.removed || now(man) > sm.until || (!man.lying && man.state !== 'thrown')) man.smothering = null;
      else if (b.body && b.inWorld) {
        const c = man.wj.chest;
        b.body.pos.x += (c.x - b.body.pos.x) * Math.min(1, dt * 12);
        b.body.vel.x *= 0.5;
      }
    }
  },
  /** Charging: a little faster than they would run. */
  speed(man, st, kind) { return st.charging && kind === 'run' ? 1.45 : 1; },
  /** How much a blow moves them: braced, hardly at all. */
  steady(man, st) { return st.braceT > 0 ? 0.05 : 0.45; },
  /** How much of what lands on them gets through the skin. */
  armor(man, st, h, part, weapon) {
    if (st.braceT > 0) return 0.03;
    const spec = armOf(weapon);
    // a building-sized monster, or another power, still gets some of it through
    if (spec && spec.power >= 10) return 0.45;
    if (weapon === 'superBlow' || weapon === 'crush' || weapon === 'skyFall' || weapon === 'slam') return 0.35;
    if (weapon === 'skinRound') return 0.3;
    if (weapon === 'explosion' || weapon === 'shrapnel') return 0.2;
    if (spec && spec.burn) return 0.3;
    if (isBlade(weapon) || (spec && spec.blade)) return 0.1;
    if (h.kind === 'impact' || h.kind === 'fall') return 0.15;
    return 0.12;
  },
  /** A blow landing on them: a bare fist or foot hurts whoever threw it; a blade rings off. */
  struck(man, st, h) {
    const by = h.by;
    if (!by || by === man || by.removed || by.dead || h.object || by.toughSkin) return;
    const sb = man.sandbox;
    const braced = st.braceT > 0;
    if (h.weapon && h.weapon !== 'knuckles') {
      // steel on stone: sparks, and now and then it jars out of the hand
      if (isBlade(h.weapon) || h.weapon === 'crowbar' || h.weapon === 'machete') {
        sb.fx.sparks(h.x, h.y, 4);
        sb.emit('bladeBounce', { who: man, by, x: h.x, y: h.y });
        if (braced && by.weapon && chance(0.35)) by.dropWeapon(1.5);
      }
      return;
    }
    if (!BARE.has(h.kind)) return;
    const k = (braced ? 0.6 : 0.2) * h.power * (h.weapon === 'knuckles' ? 0.5 : 1);
    if (k < 0.1 || (!braced && !chance(0.45))) return;
    const foot = FOOT.has(h.kind);
    const at = foot ? by.wj.footA : by.wj.handA;
    by.takeHit({ by: man, part: foot ? 'legA' : 'armA', x: at.x, y: at.y, dir: -(sign(man.pos.x - by.pos.x) || 1), power: k, kind: 'impact', weapon: 'hardSkin', bone: foot ? 'tibiaA' : 'forearmA' });
    sb.emit('hardSkin', { who: man, by, x: at.x, y: at.y, braced });
    if (by.brain && by.alive) by.brain.speak('pwHandHurt', { other: man.name }, braced ? 0.9 : 0.5, man, true);
  },
  /** A round reaching them: it rings off, a bruise at most, and goes on somewhere else. */
  shot(man, st, by, hit, dx, dy, energy) {
    const sb = man.sandbox;
    sb.fx.sparks(hit.x, hit.y, 3 + Math.round(energy * 3));
    man.takeHit({ by, part: hit.part, x: hit.x, y: hit.y, dir: sign(dx) || 1, power: 0.5 * energy, kind: 'shot', weapon: 'skinRound', bone: null });
    sb.emit('bulletBounce', { who: man, by, x: hit.x, y: hit.y, energy, loud: true });
    if (man.brain && man.alive && chance(0.35)) man.brain.speak('pwBulletBounce', by ? { other: by.name } : {}, 1, by, true);
    // and off it: back the way it came, more or less (and it can still find somebody else)
    if (energy > 0.45 && chance(0.55)) {
      const a = Math.atan2(-dy, -dx) + rand(-1, 1), e = energy * 0.32;
      sb.later(0, () => sb.shoot(null, hit.x + Math.cos(a) * 0.3, hit.y + Math.sin(a) * 0.3, a, { energy: e }));
      sb.emit('ricochet', { x: hit.x, y: hit.y, by });
    }
    return 0;
  },
  /** Out of the fist-fight: in front of a friend being shot at, onto a bomb, up off the floor. */
  reflex(me, st, brain, start) {
    if (me.pmove) return;
    const sb = me.sandbox, t = now(me);
    // down, or held by somebody, with trouble near: up again, at once
    if (((me.state === 'down' || me.state === 'crawl') && !me.rag && foesNear(me, 3) > 0) ||
      (me.state === 'held' && me.heldBy && me.heldBy.kind === 'stickman' && !(me.heldBy.species && me.heldBy.species.giant))) {
      if (t - (st.cool.shrugOff ?? -99) > 8 && chance(0.6) && start(me, 'durability', 'shrugOff', null)) return;
    }
    if (me.state !== 'stand') return;
    // a grenade going off where people are
    const b = liveBomb(sb, me.pos.x, me.pos.y, 9);
    if (b && b.left > 0.9 && caughtBy(sb, b, 3.5, me) > 0 && t - (st.cool.smother ?? -99) > 14 && chance(0.7) && start(me, 'durability', 'smother', null)) return;
    // a friend somebody is shooting at
    if (t - (st.cool.humanShield ?? -99) > 12) {
      for (const p of sb.people) {
        if (p === me || !alive(p) || Math.abs(p.pos.x - me.pos.x) > 12 || brain.rel(p).like < 0.3) continue;
        if (shooterAt(sb, p) && chance(0.6) && start(me, 'durability', 'humanShield', p)) return;
      }
    }
  },
};
