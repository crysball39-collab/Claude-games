/* =============================================================================
   What people do.

   A mind decides how someone feels; this decides what they do about it.
   Left alone they walk the pavements, wait for a gap in the traffic, stop to
   look at their phone or pass the time of day. Given a reason they run,
   freeze with their hands up, curl into a ball, stand and stare, kneel by
   somebody who has been hurt - or swing back.

   They crouch when they cower, when they kneel, and for a moment when a gun
   goes off. They jump when a crate is in the way of their running, when a
   car is about to hit them, and sometimes just because something made them.
   ========================================================================== */
import { ST } from '../human/human.js';
import { P } from '../human/rig.js';
import { onRoad } from '../world/city.js';
import { clamp, rand, chance, wrapAngle, pick } from '../core/util.js';

const _a = [0, 0, 0], _r = [0, 0];
const WORD = { m1911: 'gun', ak47: 'rifle', knife: 'knife', machete: 'machete' };

export class Brain {
  constructor(human, game) {
    this.h = human; this.g = game; this.m = human.mind;
    this.mode = human.officer ? 'post' : 'wander'; this.modeT = 0;
    // officers only
    this.post = null; this.suspect = null; this.sk = null; this.aimT = 0; this.calmT = 9; this.skill = rand(0.55, 0.85);
    this.dest = null; this.saidDown = false; this.saidReload = false; this.firedAt = false; this.strafe = 1;
    this.path = []; this.at = game.city.nearestNode(human.x, human.z); this.prev = this.at;
    this.side = rand(-0.75, 0.75);
    this.pause = rand(0, 2); this.phone = 0;
    this.decideT = rand(0, 0.35); this.replan = 0;
    this.stuck = 0; this.lx = human.x; this.lz = human.z; this.stuckT = 0; this.dodge = 0; this.dodgeSide = 1;
    this.attackT = 0; this.sayT = rand(4, 14); this.subject = null; this.duck = 0; this.ducked = false;
    this.waited = 0; this.greeted = new Map(); this.nearT = 0;
    this.chatT = rand(8, 30); this.facing = null; this.leap = 0;
  }

  _enter(mode) {
    const m = this.m, was = this.mode;
    this.mode = mode; this.modeT = 0; this.path.length = 0; this.replan = 0; this.sayT = rand(0.6, 2);
    if (mode === 'flee') { this.ducked = false; }
    if (mode === 'wander' && (was === 'flee' || was === 'cower' || was === 'surrender')) { m.ask('relief', 46, null, rand(0.5, 2)); this.pause = rand(1, 3); }
  }

  update(dt) {
    const h = this.h, m = this.m, hh = h.h, it = h.intent, g = this.g;
    it.mx = 0; it.mz = 0; it.run = false; it.crouch = false; it.face = null;
    h.pose.cower = 0; h.pose.handsUp = 0; h.pose.phone = 0;
    this.modeT += dt; this.sayT -= dt; this.attackT -= dt;
    if (h.state !== ST.ANIM) { h.aimYaw = null; }
    if (!hh.alive) { m.doing = 'dead'; h.crawlDir = null; return; }
    if (!hh.conscious) { m.doing = 'unconscious'; h.crawlDir = null; return; }

    if (h.state === ST.RAGDOLL) {
      const t = m.threat;
      // too frightened to move: lie still and hope
      h.stayDown = !!(t && t.level > 50 && m.emo.fear > 75 && m.p.bravery < 0.4 && Math.hypot(t.x - h.x, t.z - h.z) < 9);
      if (!hh.canStand && t && m.emo.fear > 25) {
        const dx = h.x - t.x, dz = h.z - t.z, d = Math.hypot(dx, dz) || 1;
        h.crawlDir = [dx / d, dz / d];
        m.doing = 'crawling away';
        if (this.sayT <= 0) { m.ask('crawl', 36); this.sayT = rand(5, 9); }
      } else {
        h.crawlDir = null;
        m.doing = h.stayDown ? 'lying still, playing dead' : hh.canStand ? 'on the ground' : 'lying helpless';
        if (this.sayT <= 0 && hh.pain > 35 && !h.stayDown) { m.ask('downPain', 44); this.sayT = rand(4, 9); }
      }
      return;
    }
    h.crawlDir = null; h.stayDown = false;
    if (h.state === ST.STUMBLE) { m.doing = 'staggering'; if (this.sayT <= 0) { m.ask('stumble', 42); this.sayT = 3; } return; }
    if (h.state === ST.GETUP) { m.doing = 'getting up'; if (this.modeT > 0.2 && this.sayT <= 0) { m.ask('getUp', 30); this.sayT = 8; } return; }

    this.decideT -= dt;
    if (this.decideT <= 0) { this.decideT = 0.35; if (h.officer) this._decideOfficer(); else this._decide(); }
    switch (this.mode) {
      case 'post': this._post(dt); break;
      case 'respond': this._respond(dt); break;
      case 'engage': this._engage(dt); break;
      case 'flee': this._flee(dt); break;
      case 'cower': this._cower(dt); break;
      case 'surrender': this._surrender(dt); break;
      case 'fight': this._fight(dt); break;
      case 'gawk': this._gawk(dt); break;
      case 'mourn': this._mourn(dt); break;
      default: this._wander(dt);
    }
    this._traffic(dt);
    this._unstick(dt);
    this._look();
  }

  _decide() {
    const h = this.h, m = this.m, e = m.emo, p = m.p, t = m.threat;
    const danger = t ? t.level : 0;
    let mode = this.mode;
    if (t && danger > 18) {
      const d = Math.hypot(t.x - h.x, t.z - h.z);
      const src = t.src, k = src ? m.known.get(src.id) : null;
      const gun = k && (k.armed === 'm1911' || k.armed === 'ak47');
      const blade = k && (k.armed === 'knife' || k.armed === 'machete');
      // anger and nerve on one side of the scales, fear on the other
      const urge = e.anger + p.bravery * 30 - e.fear * (blade ? 1.3 : 0.8);
      const willFight = src && src.h.alive && src.h.conscious && !gun && (!blade || p.bravery > 0.85) && p.bravery > 0.3 &&
        urge > (this.mode === 'fight' ? 8 : 20) && (k && (k.hurtMe || p.temper > 0.72)) && h.h.mobility > 0.55 && d < 16;
      const calm = this.mode === 'wander' || this.mode === 'gawk' || this.mode === 'mourn';
      if (willFight) mode = 'fight';
      // a gun pointed straight at you: most people stop where they are
      else if (m.aimed > 0 && d < 16 && (this.mode === 'surrender' || p.bravery < 0.72 || e.fear > 80)) mode = 'surrender';
      else if (this.mode === 'surrender' && this.modeT < 3) mode = 'surrender';
      else if (e.fear > 26 || danger > 42) {
        if (this.mode === 'cower' && this.modeT < 5 && d < 11) mode = 'cower';
        // the first sight of a weapon close by roots some people to the spot
        else if (calm && (gun || blade) && d < 9 && chance(p.bravery < 0.4 ? 0.55 : 0.22)) mode = gun ? 'surrender' : 'cower';
        else if (this.mode !== 'cower' && e.fear > 84 && d < 6 && p.bravery < 0.33 && chance(0.2)) mode = 'cower';
        else mode = 'flee';
      } else mode = d < 42 ? 'gawk' : 'wander';
    } else if (this.mode !== 'wander' && this.mode !== 'mourn') mode = 'wander';
    else if (this.mode === 'wander' && p.empathy > 0.45 && this.modeT > 3 && chance(0.12)) {
      // someone needs help, and nobody is waving a weapon about
      for (const s of m.sees) {
        if (s.d > 16 || s.o.isPlayer) continue;
        if (s.o.state === ST.RAGDOLL && (!s.o.h.alive || !s.o.h.canStand)) { this.subject = s.o; mode = 'mourn'; break; }
      }
    }
    if (mode !== this.mode) this._enter(mode);
  }

  /* ================================= officers ============================== */

  /** Who, of everyone this officer knows about, most needs dealing with? */
  _decideOfficer() {
    const h = this.h, m = this.m, g = this.g, now = g.time;
    let best = null, bk = null, bs = 0;
    for (const k of m.known.values()) {
      if (!(k.crime > 0)) continue;
      const o = k.o;
      if (!o || o.removed || o.officer || !o.h.alive) { k.crime = 0; continue; }
      // time without a fresh offence, and the count comes down
      if (now - k.crimeT > 9) k.crime = Math.max(0, k.crime - 0.07);
      if (k.crime < 0.9) continue;
      const d = Math.hypot(o.x - h.x, o.z - h.z);
      const sc = k.crime * 10 - d * 0.1 + (k.hurtMe ? 8 : 0);
      if (sc > bs) { bs = sc; best = o; bk = k; }
    }
    const changed = best !== this.suspect;
    this.suspect = best; this.sk = bk;
    let t = m.threat;
    if (t && t.src && !best) { const k = m.known.get(t.src.id); if (t.src.officer || ((!k || k.crime < 0.9) && now - (k ? k.crimeT : 0) > 6)) { m.threat = null; t = null; } }
    const mode = best ? 'engage' : t && t.level > 30 ? 'respond' : 'post';
    if (mode !== this.mode) {
      const was = this.mode;
      this._enter(mode);
      if (mode === 'post' && was !== 'post') { m.ask('copClear', 44, null, rand(0.6, 1.6)); this.calmT = 0; }
    }
    if (best && (changed || this.modeT === 0)) { this.aimT = 0; this.firedAt = false; this.saidDown = false; this._radio(best, bk.crime); }
  }

  /** What one officer knows, the others on the net know. */
  _radio(suspect, crime) {
    const h = this.h, now = this.g.time;
    for (const o of this.g.humans) {
      if (o === h || !o.officer || !o.mind || !o.h.alive || !o.h.conscious) continue;
      if (Math.hypot(o.x - h.x, o.z - h.z) > 150) continue;
      const k = o.mind._know(suspect);
      if (k.crime >= crime) continue;
      k.crime = crime; k.crimeT = now; k.x = suspect.x; k.z = suspect.z;
      o.mind.note('heard', 'radio', `heard over the radio that ${o.mind.name(suspect)} ${crime >= 2.5 ? 'has attacked someone and is dangerous' : 'is causing trouble'}`, 0.7);
    }
  }

  /** Which part of the station a point is in: out of it, the public side of the lobby, or behind the desk. */
  _zone(x, z) {
    const S = this.g.city.police;
    if (!S || x < S.x0 || x > S.x1 || z < S.z0 || z > S.z1) return 'out';
    return z > S.deskZ + 0.3 && x < S.side + 1.6 ? 'back' : 'front';
  }

  /** The next place to walk to on the way to a point, given the door and the desk are in the way. */
  _route(tx, tz) {
    const h = this.h, S = this.g.city.police;
    const a = this._zone(h.x, h.z), b = this._zone(tx, tz);
    if (!S || a === b) { _r[0] = tx; _r[1] = tz; return _r; }
    const cx = S.door.x;
    if (a === 'out') {
      // in through the door: line up with it, then step through
      if (Math.abs(h.x - cx) < 0.9 && h.z > S.door.z - 0.7) { _r[0] = S.inside.x; _r[1] = S.inside.z; } else { _r[0] = S.door.x; _r[1] = S.door.z; }
    } else if (a === 'back') {
      // round the end of the desk
      if (h.x < S.side - 0.4) { _r[0] = S.side; _r[1] = S.deskZ + 1.1; } else { _r[0] = S.side; _r[1] = S.deskZ - 0.7; }
    } else if (b === 'back') {
      if (h.x < S.side - 0.4 || h.z > S.deskZ - 0.5 && h.x > S.side + 0.4) { _r[0] = S.side; _r[1] = S.deskZ - 0.7; } else { _r[0] = S.side; _r[1] = S.deskZ + 1.1; }
    } else {
      // front of the lobby to the street
      if (Math.abs(h.x - cx) < 0.9) { _r[0] = S.door.x; _r[1] = S.door.z - 0.5; } else { _r[0] = S.inside.x; _r[1] = S.inside.z; }
    }
    return _r;
  }

  /** Gets an officer to a point: through the station if need be, along the pavements if it is far. */
  _walkTo(x, z, run) {
    const h = this.h, city = this.g.city, d = Math.hypot(x - h.x, z - h.z);
    const zh = this._zone(h.x, h.z), zt = this._zone(x, z);
    if (d < 17 || zh !== 'out') {
      // close, or still indoors: straight there, by way of the door
      const far = zh !== 'out' && zt === 'out' && d >= 17;
      const r = far ? this._route(city.police.door.x, city.police.door.z - 1.5) : this._route(x, z);
      this.path.length = 0;
      return this._go(r[0], r[1], run, 1);
    }
    // a long way: along the pavements, like anyone else, to the corner nearest it
    this.replan -= 0.016;
    if (!this.dest || Math.hypot(this.dest.x - x, this.dest.z - z) > 8 || !this.path.length || this.replan <= 0) {
      this.replan = 2.5;
      this.dest = { x, z };
      this.at = city.nearestNode(h.x, h.z); this.prev = this.at;
      this.path = city.path(this.at, city.nearestNode(x, z));
      const n0 = city.nodes[this.path[0]];
      if (this.path.length > 1 && n0 && Math.hypot(n0.x - h.x, n0.z - h.z) < 1.2) this.path.shift();
    }
    if (!this._follow(run, 1)) return this._go(x, z, run, 1);
    return d;
  }

  /** Nothing is happening: stand where they are posted, or walk the beat. */
  _post(dt) {
    const h = this.h, m = this.m, g = this.g, post = this.post;
    h.aimYaw = null; h.aimPitch = h.weapon ? -0.85 : 0;
    this.calmT += dt;
    // the pistol goes back in its holster once things have been quiet for a moment
    if (h.weapon && this.calmT > 1.2 && !h.swap && !h.reload) {
      if (h.weapon.def.gun && h.weapon.ammo < h.weapon.def.mag) { g.weapons.reloadFor(h); return; }
      if (this.calmT > 2.2) g.weapons.putAway(h);
    }
    if (h.reload) { m.doing = 'reloading'; return; }
    if (!post || post.kind === 'beat') { this._wander(dt); return; }
    const d = Math.hypot(post.x - h.x, post.z - h.z);
    if (d > 0.45) { m.doing = 'going back to their post'; this._walkTo(post.x, post.z, false); return; }
    m.doing = post.kind === 'desk' ? 'on duty at the front desk' : post.kind === 'door' ? 'standing guard at the station door' : 'standing guard';
    // facing out, eyes moving
    h.intent.face = post.yaw + Math.sin(g.time * 0.23 + h.id) * 0.45;
    const pl = g.player, dp = Math.hypot(pl.x - h.x, pl.z - h.z);
    if (dp < 2.2 && pl.state === ST.ANIM) { this.nearT += dt; if (this.nearT > 1.5) { m.ask('copGreet', 30); this.nearT = -14; } } else this.nearT = Math.min(0, this.nearT + dt);
    if (this.sayT <= 0 && m.speakCool <= 0) { if (chance(0.5)) m.ask('copIdle', 12); this.sayT = rand(14, 34); }
  }

  /** Trouble somewhere, and nobody yet to hold responsible: go and look. */
  _respond(dt) {
    const h = this.h, m = this.m, g = this.g, t = m.threat;
    if (!t) return;
    this.calmT = 0;
    m.doing = 'going to see what the trouble is';
    const dx = t.x - h.x, dz = t.z - h.z, d = Math.hypot(dx, dz);
    // gunfire: the pistol is out before they get there
    if (t.level > 55 && d < 45 && !h.weapon && !h.swap) g.weapons.draw(h);
    h.aimYaw = null; h.aimPitch = h.weapon ? -0.85 : 0;
    if (d > 5) this._walkTo(t.x, t.z, t.level > 45);
    else h.intent.face = Math.atan2(dx, dz);
    if (this.sayT <= 0) { if (d > 8) m.ask('copRespond', 42); this.sayT = rand(9, 17); }
  }

  /**
   * Someone has to be stopped. Words first, at gunpoint, for a weapon in the
   * hand or a blow struck; the pistol for anyone who has used a weapon on a
   * person, who is holding a gun and has already been warned off it, or who
   * comes at them with a blade. Nobody who has stopped is shot.
   */
  _engage(dt) {
    const h = this.h, m = this.m, g = this.g, S = this.suspect, k = this.sk, now = g.time, W = g.weapons;
    if (!S || !k || S.removed) return;
    this.calmT = 0;
    const c = S.bodies[P.CHEST];
    const seen = m.canSeeHuman(S) > 0;
    if (seen) { k.x = S.x; k.z = S.z; }
    const tx = seen || k.x == null ? S.x : k.x, tz = seen || k.z == null ? S.z : k.z;
    const dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz) || 1;
    const gun = !!(h.weapon && h.weapon.def.gun);
    const sGun = !!(S.weapon && S.weapon.def.gun), sBlade = !!(S.weapon && !S.weapon.def.gun);
    const down = S.state === ST.RAGDOLL || !S.h.conscious;
    const quiet = now - k.crimeT;
    const complying = !down && ((!S.weapon && !S.anim.action && quiet > 3.5) || S.pose.handsUp > 0.5);
    const lethal = k.crime >= 2.5 || (sGun && k.crime >= 1.6) || (sBlade && seen && d < 3.4 && k.crime >= 1) || (k.hurtMe && h.h.pain > 42);
    // someone with empty hands who will not stop is put on the ground by hand
    const subdue = !lethal && !S.weapon && !down && !complying && k.crime >= 1.9 && h.h.armOk(1) && h.h.armOk(-1);
    m.doing = down ? `covering ${m.name(S)}, who is down` : complying ? `holding ${m.name(S)} at gunpoint` : lethal ? `in a fight for their life with ${m.name(S)}` : subdue ? `going in to restrain ${m.name(S)}` : `ordering ${m.name(S)} to stop`;

    if (subdue) {
      h.aimYaw = null; h.aimPitch = 0;
      if (h.weapon && !h.swap && !h.reload) W.putAway(h);
      h.intent.face = Math.atan2(dx, dz); h.guardT = 2;
      if (d > 1.05) this._walkTo(tx, tz, d > 3);
      if (!h.weapon && d < 1.35 && this.attackT <= 0) { W.npcAttack(h, S); this.attackT = rand(0.6, 1.1); }
      if (this.sayT <= 0) { m.ask('copSubdue', 64); this.sayT = rand(3, 5); }
      return;
    }

    // the pistol comes out. With no pistol, or no arm for it, it is fists or distance.
    if (!gun && !h.swap && !W.draw(h)) {
      if (sGun || sBlade) { m._threaten(S, 92); this._flee(dt); return; }
      h.intent.face = Math.atan2(dx, dz); h.guardT = 2;
      if (d > 1.05) this._go(tx, tz, d > 4, 1);
      if (d < 1.35 && this.attackT <= 0 && !down && !complying) { W.npcAttack(h, S); this.attackT = rand(0.7, 1.3); }
      return;
    }

    // where to stand: near enough to be heard and to hit, not near enough to be grabbed
    const want = lethal ? 11 : 6.5;
    if (!seen && d > 2.5) this._walkTo(tx, tz, true);
    else if (d > want + 3) this._walkTo(tx, tz, d > want + 9);
    else if (d < 3.4 && !down && !complying) this._go(h.x - dx / d * 3, h.z - dz / d * 3, false, 0.75);
    const yaw = Math.atan2(S.x - h.x, S.z - h.z);
    if (seen || d < 14) h.intent.face = yaw;

    // the muzzle follows the suspect while there is one to see; otherwise low and ready
    const eye = h.y + 1.42 * h.scale;
    if (seen && gun && !h.reload) { h.aimYaw = yaw; h.aimPitch = Math.atan2(c.py - eye, Math.hypot(S.x - h.x, S.z - h.z)); this.aimT += dt; }
    else { h.aimYaw = null; h.aimPitch = gun ? -0.85 : 0; this.aimT = 0; }

    if (down) {
      if (!this.saidDown) { this.saidDown = true; m.ask('copDown', 62, null, rand(0.4, 1.2)); }
      // somebody who cannot get up is no longer anybody's emergency
      if (quiet > 5) k.crime = Math.max(0, k.crime - dt * 0.5);
      return;
    }
    this.saidDown = false;
    if (complying) {
      if (this.sayT <= 0) { m.ask('copCalm', 50); this.sayT = rand(4, 7); }
      return;
    }
    if (!seen) return;
    if (!lethal) {
      if (this.sayT <= 0) { m.ask(S.weapon ? 'copChallenge' : 'copHalt', 66, { weapon: WORD[S.weapon ? S.weapon.def.id : ''] || 'weapon' }); this.sayT = rand(2.6, 4.4); }
      return;
    }
    if (h.reload) { if (!this.saidReload) { this.saidReload = true; m.ask('copReload', 60); } return; }
    this.saidReload = false;
    if (!gun || h.swap || this.aimT < 0.55 || d > 44) return;
    // is anyone else in the way?
    const mu = h.weapon.muzzleWorld || [h.x, eye, h.z];
    const ax = c.px + S.vx * 0.08 - mu[0], ay = c.py - mu[1], az = c.pz + S.vz * 0.08 - mu[2], al = Math.hypot(ax, ay, az) || 1;
    const first = g.rayPeople(mu[0], mu[1], mu[2], ax / al, ay / al, az / al, al + 0.4, h, 0.14);
    if (first && first.human !== S) {
      // a step to the side for a clear line
      if (chance(dt * 0.6)) this.strafe = -this.strafe;
      this._go(h.x - dz / d * this.strafe * 2, h.z + dx / d * this.strafe * 2, false, 0.7);
      h.intent.face = yaw;
      return;
    }
    if (W.npcFire(h, [c.px + S.vx * 0.08, c.py + rand(-0.14, 0.1), c.pz + S.vz * 0.08], this.skill) && !this.firedAt) {
      this.firedAt = true;
      m.ask('copFire', 70, null, rand(0.2, 0.8));
    }
  }

  /* -------------------------------- moving -------------------------------- */

  _go(x, z, run, mag = 1) {
    const h = this.h, it = h.intent;
    let dx = x - h.x, dz = z - h.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return 0;
    dx /= d; dz /= d;
    if (this.dodge > 0) { const k = this.dodgeSide * 0.9; const sx = -dz * k, sz = dx * k; dx = dx * 0.5 + sx; dz = dz * 0.5 + sz; const l = Math.hypot(dx, dz); dx /= l; dz /= l; }
    it.mx = dx * mag; it.mz = dz * mag; it.run = run;
    this.moving = true;
    return d;
  }

  /** Follows the pavement network toward wherever `this.path` leads. */
  _follow(run, mag) {
    const g = this.g, h = this.h, nodes = g.city.nodes;
    if (!this.path.length) return false;
    const n = nodes[this.path[0]], from = nodes[this.prev];
    // keep to one side of the pavement, like everybody else
    let ox = 0, oz = 0;
    const sx = n.x - from.x, sz = n.z - from.z, sl = Math.hypot(sx, sz);
    if (sl > 0.5) { ox = -sz / sl * this.side; oz = sx / sl * this.side; }
    const d = this._go(n.x + ox, n.z + oz, run, mag);
    if (d < 0.75) { this.prev = this.at = this.path.shift(); this.waited = 0; }
    return true;
  }

  /** Is the next stretch a crossing with a car bearing down on it? */
  _mustWait() {
    const g = this.g, h = this.h, nodes = g.city.nodes;
    if (!this.path.length || !g.traffic) return false;
    const link = nodes[this.prev].links.find((l) => l.to === this.path[0]);
    if (!link || !link.cross || onRoad(h.x, h.z)) return false;
    const a = nodes[this.prev], b = nodes[this.path[0]];
    if (Math.hypot(h.x - a.x, h.z - a.z) > 1.6) return false;
    const eta = g.traffic.eta((a.x + b.x) / 2, (a.z + b.z) / 2);
    return eta < 3.6 && this.waited < 9;
  }

  _wander(dt) {
    const g = this.g, h = this.h, m = this.m, e = m.emo, p = m.p, city = g.city;
    m.doing = 'walking, ' + p.errand;
    if (this.facing && this.facing.until > g.time) {
      // somebody spoke: stop and face them for a moment
      h.intent.face = Math.atan2(this.facing.x - h.x, this.facing.z - h.z);
      m.doing = 'talking';
      return;
    }
    if (this.pause > 0) {
      this.pause -= dt;
      m.doing = this.phone > 0 ? 'looking at their phone' : 'standing about';
      if (this.phone > 0) { this.phone -= dt; h.pose.phone = 1; if (this.sayT <= 0 && chance(0.4)) { m.ask('phone', 14); this.sayT = rand(8, 16); } }
      this._small(dt);
      return;
    }
    if (!this.path.length) {
      // wherever the last few minutes left them, the way on starts from their own corner:
      // setting off straight for the next one would take them diagonally through the traffic
      let here = city.nodes[this.at];
      if (Math.hypot(here.x - h.x, here.z - h.z) > 1.6) { this.at = city.nearestNode(h.x, h.z); this.prev = this.at; here = city.nodes[this.at]; }
      const dest = (Math.random() * city.nodes.length) | 0;
      this.path = city.path(this.at, dest);
      if (this.path[0] === this.at && Math.hypot(here.x - h.x, here.z - h.z) <= 1.6) this.path.shift();
      if (!this.path.length) { this.pause = 1; return; }
    }
    if (this._mustWait()) { this.waited += dt; m.doing = 'waiting to cross'; this._small(dt); return; }
    const hurry = m.hurry && m.hurry > g.time;
    this._follow(hurry || onRoad(h.x, h.z) && g.traffic && g.traffic.eta(h.x, h.z) < 4, hurry ? 0.8 : 1);
    if (hurry) h.intent.run = true;
    // now and then: stop, look around, get the phone out
    if (!onRoad(h.x, h.z) && chance(dt * 0.035)) {
      this.pause = rand(2, 6);
      if (e.boredom > 45 || chance(0.35)) this.phone = this.pause;
    }
    this._small(dt);
  }

  /** The small change of a quiet day: greetings, grumbles, staring strangers. */
  _small(dt) {
    const g = this.g, h = this.h, m = this.m, e = m.emo, p = m.p, now = g.time;
    if (m.threat) return;
    // passing somebody
    for (const s of m.sees) {
      if (s.d > 2.4) break;
      const o = s.o;
      if (!o.h.alive || o.state !== ST.ANIM) continue;
      const last = this.greeted.get(o.id) || -99;
      if (now - last < 50) continue;
      this.greeted.set(o.id, now);
      if (chance(0.25 + p.chatty * 0.5)) {
        if (!o.isPlayer && this.chatT <= 0 && chance(0.5)) { m.ask('chatA', 26); this.chatT = rand(25, 60); this.pause = rand(3, 5); this.facing = { x: o.x, z: o.z, until: now + 4 }; }
        else m.ask('greet', 22);
      }
    }
    this.chatT -= dt;
    // the stranger, standing far too close for far too long
    const pl = g.player, dp = Math.hypot(pl.x - h.x, pl.z - h.z);
    if (dp < 1.5 && pl.state === ST.ANIM) { this.nearT += dt; if (this.nearT > 2.8) { m.ask('playerNear', 30); this.nearT = -12; } } else this.nearT = Math.min(0, this.nearT + dt);
    if (this.sayT <= 0 && m.speakCool <= 0) {
      if (e.boredom > 62 && chance(0.5)) { m.ask('bored', 15); this.sayT = rand(9, 20); }
      else if (chance(0.25 * p.chatty)) { m.ask('idle', 10); this.sayT = rand(12, 30); }
      else this.sayT = rand(4, 9);
    }
  }

  _flee(dt) {
    const g = this.g, h = this.h, m = this.m, t = m.threat, city = g.city;
    if (!t) return;
    m.doing = 'running from ' + (t.src ? m.name(t.src) : 'the shooting');
    // the first reaction to a bang is to duck
    if (m.startle > 0.4 && !this.ducked) { this.ducked = true; this.duck = rand(0.35, 0.9); if (m.p.jumpy > 0.55 && chance(0.5)) h.intent.jump = true; m.ask('startle', 50); }
    if (this.duck > 0) { this.duck -= dt; h.intent.crouch = true; h.pose.cower = 0.6; return; }
    this.replan -= dt;
    if (this.replan <= 0 || !this.path.length) {
      this.replan = rand(1.4, 2.4);
      this.at = city.nearestNode(h.x, h.z); this.prev = this.at;
      // the node that is furthest from the danger without being a marathon away
      let best = this.at, score = -Infinity;
      for (const n of city.nodes) {
        const away = Math.hypot(n.x - t.x, n.z - t.z), mine = Math.hypot(n.x - h.x, n.z - h.z);
        // do not run past the thing we are running from
        const through = ((n.x - h.x) * (t.x - h.x) + (n.z - h.z) * (t.z - h.z)) / (mine + 0.1);
        const s = away - mine * 0.55 - Math.max(0, through) * 1.2 + rand(0, 6);
        if (s > score) { score = s; best = n.id; }
      }
      this.path = city.path(this.at, best, { x: t.x, z: t.z, r: 24 });
      if (this.path[0] === this.at && this.path.length > 1) {
        // if the first node is behind us, toward the danger, skip it
        const n0 = city.nodes[this.path[0]];
        if ((n0.x - h.x) * (t.x - h.x) + (n0.z - h.z) * (t.z - h.z) > 0 || Math.hypot(n0.x - h.x, n0.z - h.z) < 1) this.path.shift();
      }
    }
    if (!this._follow(true, 1)) {
      // nowhere on the map to go: straight away from it
      const dx = h.x - t.x, dz = h.z - t.z, d = Math.hypot(dx, dz) || 1;
      this._go(h.x + dx / d * 5, h.z + dz / d * 5, true, 1);
    }
    if (this.sayT <= 0) { m.ask('flee', 54); this.sayT = rand(3, 7); }
  }

  _cower(dt) {
    const h = this.h, m = this.m, t = m.threat;
    m.doing = 'cowering';
    h.intent.crouch = true; h.pose.cower = 1;
    if (t) h.intent.face = Math.atan2(h.x - t.x, h.z - t.z);
    if (this.sayT <= 0) { m.ask('cower', 50); this.sayT = rand(3, 6); }
  }

  _surrender(dt) {
    const h = this.h, m = this.m, t = m.threat;
    m.doing = 'standing with hands raised';
    h.pose.handsUp = 1;
    if (t) h.intent.face = Math.atan2(t.x - h.x, t.z - h.z);
    if (this.sayT <= 0) { m.ask(m.aimed > 0 ? 'aimedAt' : 'surrender', 60); this.sayT = rand(3, 6); }
  }

  _fight(dt) {
    const g = this.g, h = this.h, m = this.m, t = m.threat;
    const o = t && t.src;
    if (!o || o.removed || !o.h.alive || !o.h.conscious) {
      if (o && (!o.h.alive || !o.h.conscious)) m.ask('fightWin', 50);
      m.threat = null; this._enter('wander'); return;
    }
    m.doing = 'fighting ' + m.name(o);
    const dx = o.x - h.x, dz = o.z - h.z, d = Math.hypot(dx, dz);
    h.intent.face = Math.atan2(dx, dz);
    h.guardT = 2;
    if (o.state === ST.RAGDOLL && d < 1.6) { if (this.attackT <= 0 && chance(0.4)) { g.weapons.npcAttack(h, o); this.attackT = rand(0.9, 1.6); } return; }
    if (d > 1.0) this._go(o.x, o.z, d > 3, d > 3 ? 0.85 : 1);
    if (d < 1.35 && this.attackT <= 0) { g.weapons.npcAttack(h, o); this.attackT = rand(0.55, 1.2); }
    if (this.sayT <= 0) { m.ask('fight', 52); this.sayT = rand(3, 6); }
  }

  _gawk(dt) {
    const h = this.h, m = this.m, t = m.threat;
    m.doing = 'watching from a distance';
    if (t) h.intent.face = Math.atan2(t.x - h.x, t.z - h.z);
    if (this.sayT <= 0) { m.ask('gawk', 24); this.sayT = rand(5, 10); }
  }

  _mourn(dt) {
    const h = this.h, m = this.m, o = this.subject;
    if (!o || o.removed || this.modeT > 16 || (o.state !== ST.RAGDOLL)) { this.subject = null; this._enter('wander'); return; }
    const c = o.bodies[o.gone[P.CHEST] ? P.PELVIS : P.CHEST];
    const dx = c.px - h.x, dz = c.pz - h.z, d = Math.hypot(dx, dz);
    if (d > 1.25) { m.doing = 'going to help ' + m.name(o); this._go(c.px, c.pz, d > 5, 1); return; }
    m.doing = 'kneeling beside ' + m.name(o);
    h.intent.face = Math.atan2(dx, dz);
    h.intent.crouch = true; h.pose.kneel = 1;
    if (this.sayT <= 0) { m.ask('mourn', 42); this.sayT = rand(3, 6); m.stir('sadness', 6); }
  }

  /* ----------------------------- staying alive ---------------------------- */

  /** A car is about to arrive where this person is standing. */
  _traffic(dt) {
    const g = this.g, h = this.h, m = this.m;
    this.leap = Math.max(0, this.leap - dt);
    if (!g.traffic || this.leap > 0 || !onRoad(h.x, h.z)) return;
    for (const c of g.traffic.cars) {
      if (c.speed < 3.5) continue;
      const ex = h.x - c.x, ez = h.z - c.z;
      const along = ex * c.dx + ez * c.dz, side = ex * -c.dz + ez * c.dx;
      if (along < 0 || along > c.speed * 0.9 + 2.5 || Math.abs(side) > 1.5) continue;
      // out of the way, by whichever side is nearer
      const s = side >= 0 ? 1 : -1;
      h.intent.mx = -c.dz * s; h.intent.mz = c.dx * s; h.intent.run = true; h.intent.jump = true;
      this.leap = 1.2;
      m.stir('fear', 30); m.stir('surprise', 40); m.stir('anger', 14);
      m.note('saw', 'car', 'a car nearly hit me', 0.8);
      m.ask('carNear', 62, null, 0.4);
      return;
    }
  }

  /** Walking into something and getting nowhere. */
  _unstick(dt) {
    const g = this.g, h = this.h, it = h.intent;
    this.dodge = Math.max(0, this.dodge - dt);
    const wants = Math.hypot(it.mx, it.mz) > 0.3;
    this.stuckT += dt;
    if (this.stuckT < 0.5) return;
    const moved = Math.hypot(h.x - this.lx, h.z - this.lz);
    this.lx = h.x; this.lz = h.z; this.stuckT = 0;
    if (!wants || moved > 0.22) { this.stuck = 0; return; }
    this.stuck++;
    // a crate in the way is something to go over; anything else, round
    let low = false;
    for (const o of g.props) {
      if (o.kind !== 'crate') continue;
      const b = o.body;
      if (Math.hypot(b.px - h.x, b.pz - h.z) < 1.3 && b.py + b.hy - h.y < 1.05 && (b.px - h.x) * it.mx + (b.pz - h.z) * it.mz > 0) { low = true; break; }
    }
    if (low && (this.mode === 'flee' || this.stuck > 1)) { it.jump = true; return; }
    this.dodge = 0.9; this.dodgeSide = this.stuck % 2 ? 1 : -1;
    if (this.stuck > 4) { this.path.length = 0; this.replan = 0; this.at = g.city.nearestNode(h.x, h.z); this.prev = this.at; this.stuck = 0; }
  }

  /** Where the head turns. */
  _look() {
    const g = this.g, h = this.h, m = this.m;
    let x, y, z, has = false;
    if (m.lookAt && m.lookAt.until > g.time) { x = m.lookAt.x; y = m.lookAt.y; z = m.lookAt.z; has = true; }
    else if (m.threat && this.mode !== 'flee') { x = m.threat.x; y = h.y + 1.5; z = m.threat.z; has = true; }
    else if (m.sees.length && m.sees[0].d < 5) { const o = m.sees[0].o; x = o.x; z = o.z; y = o.bodies[P.CHEST].py + 0.3; has = true; }
    if (!has) { h.lookYaw = 0; h.lookPitch = 0; return; }
    const dx = x - h.x, dz = z - h.z, d = Math.hypot(dx, dz) || 1;
    h.lookYaw = clamp(wrapAngle(Math.atan2(dx, dz) - h.yaw), -1.2, 1.2);
    h.lookPitch = clamp(Math.atan2(y - (h.y + 1.65 * h.scale), d), -0.6, 0.5);
  }
}

/** Keeps the pavements populated: new faces arrive where you are not looking. */
export function populate(game, target) {
  let living = 0;
  for (const h of game.humans) if (!h.isPlayer && h.h.alive && !h.officer) living++;
  if (living >= target || game.humans.length >= game.maxPeople) return null;
  const p = game.player;
  for (let i = 0; i < 12; i++) {
    const s = game.city.randomPavement();
    if (Math.hypot(s.x - p.x, s.z - p.z) < 32) continue;
    if (!game.city.isClear(s.x, s.z, 0.5)) continue;
    return game.spawnHuman(s.x, s.z);
  }
  return null;
}
