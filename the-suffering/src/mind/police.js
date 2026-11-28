/* =============================================================================
   The police, as an organisation: what they have been told, what they know
   about you, and who is sent where.

   They know nothing they have not been told. An officer knows what they can
   see and hear, and whatever another officer says over the radio; the
   station knows what callers tell it. Somebody who saw you do it can describe
   you; somebody who only came across the body cannot. Officers sent to a body
   examine it, and their fingerprint scanner names whoever touched it with
   bare hands.

   What they know about you comes out as a wanted level, up to six stars:
     one star     they want you in handcuffs: you are told to stop, tased if
                  you will not, and arrested
     two stars    you have used a gun or a blade on someone, killed, or gone
                  for an officer: they shoot, and patrol cars come after you
     three stars  you have killed an officer, or kept on: a helicopter as well
     four stars   black S.W.A.T. vans, and S.W.A.T. teams on foot
     five stars   all of it, more often, and two helicopters
     six stars    the army: soldiers, army trucks full of them, jeeps with
                  a machine gun on a turret, attack helicopters with missiles
                  and a gun, and tanks
   Every crime they hear of while you are wanted adds to what they hold
   against you (each one once, however many saw it or rang in), and enough of
   it is another star. Who is sent, and how, is the Response's business.
   Officers who lose sight of you search: around where you were last seen if
   that was recently, all over the city if they only have your prints. When
   none of them has seen you for long enough, a star goes out.
   ========================================================================== */
import { ST } from '../human/human.js';
import { P } from '../human/rig.js';
import { clamp, rand, chance, pick } from '../core/util.js';
import { Response } from './response.js';

export const MAX_WANTED = 6;
/** Seconds without being seen before each level drops by one. */
const COOL = [0, 70, 95, 110, 125, 140, 160];
/** How many stars each kind of thing earns, once they know it was you. */
export const STARS = { assault: 1, menace: 1, prints: 1, suspicion: 1, resisting: 1, weapon: 2, stabbing: 2, shooting: 2, shots: 2, murder: 2, officer: 2, burning: 2, electrocution: 2, freezing: 2, car: 2, copCar: 2, copKill: 3, heli: 3, army: 3 };
/** How much each thing adds to what they hold against you: the more of it, the more of them come. */
const HEAT = { assault: 1, menace: 1, prints: 1, suspicion: 0.5, resisting: 1, weapon: 1, stabbing: 2, shooting: 2, shots: 1, murder: 5, officer: 3, burning: 3, electrocution: 3, freezing: 3, car: 3, copCar: 6, copKill: 9, heli: 14, army: 16 };
/** What they have to hold against you for three, four, five and six stars. */
export const HEAT_AT = [0, 0, 0, 12, 28, 50, 80];
/** What a report is about, in the words the station would use. */
const WHAT = {
  body: 'a body', assault: 'an assault', stabbing: 'a stabbing', shooting: 'a shooting', shots: 'shots fired', murder: 'a killing', menace: 'a man threatening people with a weapon',
  burning: 'someone set on fire', electrocution: 'someone electrocuted', freezing: 'someone frozen',
};
/** How long prints left by bare hands can still be lifted, in seconds. */
const PRINT_LIFE = 900;

export class Police {
  constructor(game) {
    this.g = game;
    this.wanted = 0;
    this.coolT = 0;              // seconds since an officer last saw you while you were wanted
    this.lastSeen = null;        // { x, z, t } where, and when
    this.seen = false;           // an officer has eyes on you right now
    this.seenBy = null;
    this.reports = [];           // incidents called in
    this.nextId = 1;
    this.log = [];               // { t, text }: what has happened, newest last
    this.stats = { calls: 0, reports: 0, scans: 0, matches: 0, raised: 0, cleared: 0, busted: 0, spotted: 0, reinforcements: 0 };
    this.reinT = 0; this.lookT = 0; this.calmT = 0;
    this.extra = new Set();      // officers called in on top of the station's own
    this.why = '';
    this.heat = 0;               // what they hold against you (see HEAT)
    this.counted = new Map();    // each thing they hold against you, once: key -> when
    this.response = new Response(this);
  }

  get now() { return this.g.time; }
  get ignored() { return !!this.g.settings.cheatCops && !!(this.g.auth && this.g.auth.admin); }

  note(text) {
    this.log.push({ t: this.now, text });
    if (this.log.length > 40) this.log.shift();
  }

  /* --------------------------------- reports ------------------------------ */

  /**
   * A call has come in. `info` is { kind, x, z, victim, suspect, desc }: the
   * suspect only if the caller saw who did it.
   */
  report(caller, info) {
    const now = this.now;
    this.stats.calls++;
    let rep = null;
    for (const r of this.reports) {
      if (r.status === 'closed') continue;
      // two different victims are two different calls, wherever they are; otherwise near enough and soon enough is the same thing
      const same = info.victim && r.victim ? r.victim === info.victim : Math.hypot(r.x - info.x, r.z - info.z) < 22 && now - r.t < 120;
      if (same) { rep = r; break; }
    }
    if (rep) {
      rep.callers++;
      // a later caller may know more: who did it, or that it is worse than first said
      if (info.suspect && !rep.suspect) { rep.suspect = info.suspect; rep.desc = info.desc; }
      if ((STARS[info.kind] || 0) > (STARS[rep.kind] || 0) || rep.kind === 'shots') rep.kind = info.kind;
      if (info.victim && !rep.victim) rep.victim = info.victim;
    } else {
      rep = { id: this.nextId++, kind: info.kind, x: info.x, z: info.z, t: now, victim: info.victim || null, suspect: info.suspect || null, desc: info.desc || '', caller, callers: 1, status: 'open', assigned: [], scanned: false };
      this.reports.push(rep);
      this.stats.reports++;
      this.note(`call: ${WHAT[rep.kind] || rep.kind}${rep.suspect ? ', the caller saw who did it' : ''}`);
    }
    // a caller who saw you do it can tell them it was you, and where
    if (info.suspect && info.suspect.isPlayer) this.raise(STARS[info.kind] || 1, `reported: ${WHAT[info.kind] || info.kind}`, { x: info.x, z: info.z }, { kind: info.kind, victim: info.victim });
    return rep;
  }

  /** An officer can be spared for this report. */
  _free(o) {
    const b = o.brain;
    if (!o.officer || !b || !o.mind || o.removed || !o.h.alive || !o.h.conscious || o.state !== ST.ANIM || o.cuffed) return false;
    return (b.mode === 'post' && (!b.post || b.post.kind !== 'desk')) || b.mode === 'search';
  }

  /* --------------------------------- you ---------------------------------- */

  /**
   * They now know you did something worth `level` stars. `info` ({ kind, victim, key }) says what it was, so that it
   * is held against you once, however many saw it or rang in about it; and enough of it is more stars.
   */
  raise(level, why, where = null, info = null) {
    if (this.ignored || level <= 0) return;
    const p = this.g.player;
    if (!p || !p.h.alive) return;
    const was = this.wanted;
    if (info && info.kind) this._hold(info, where);
    this.wanted = Math.max(this.wanted, Math.min(MAX_WANTED, Math.max(level, this.heatStars)));
    this.coolT = 0;
    if (where) this.lastSeen = { x: where.x, z: where.z, t: this.now };
    if (this.wanted !== was) {
      this.stats.raised++;
      this.why = why;
      this.note(`wanted ${this.wanted}: ${why}`);
      this.g.ui?.wantedChanged(this.wanted, why);
      // everyone on the net hears it
      this._sync(true);
    }
  }

  /** What they hold against you, as stars: three to six once there is enough of it (else none). */
  get heatStars() { let n = 0; for (let k = 3; k <= MAX_WANTED; k++) if (this.heat >= HEAT_AT[k]) n = k; return n; }

  /** One thing held against you: counted once (the same victim, or the same place and moment, is the same thing). */
  _hold(info, where) {
    const now = this.now, kind = info.kind;
    const at = where || this.lastSeen || this.g.player;
    const key = info.key || kind + ':' + (info.victim ? 'v' + info.victim.id : Math.round(at.x / 14) + ',' + Math.round(at.z / 14));
    const t = this.counted.get(key);
    // a victim is one victim for good; somewhere is somewhere for half a minute
    if (t != null && (info.victim || now - t < 30)) return false;
    this.counted.set(key, now);
    if (this.counted.size > 200) for (const [k, v] of this.counted) { if (now - v > 600) this.counted.delete(k); }
    this.heat += HEAT[kind] ?? 1;
    this.note(`held against you: ${kind} (${this.heat.toFixed(1)})`);
    return true;
  }

  /** The admin says how wanted you are: up to six stars, or none. */
  setWanted(level, why = 'admin') {
    level = Math.max(0, Math.min(MAX_WANTED, level | 0));
    if (level === 0) { this.clear(why); return; }
    const p = this.g.player;
    if (level > this.wanted) { this.heat = Math.max(this.heat, HEAT_AT[level]); this.raise(level, 'an admin says so', { x: p.x, z: p.z }); return; }
    if (level < this.wanted) { this.wanted = level; this.heat = Math.min(this.heat, HEAT_AT[level] || 0); this.g.ui?.wantedChanged(level, why); this._sync(false); }
  }

  /**
   * Somebody has died. An officer killed by you is the whole force's business: an attack on one is known as it
   * happens (see Mind.hit), and a death on the radio is no secret.
   */
  killed(h) {
    const p = this.g.player;
    if (!h || !h.officer || h.lastAttacker !== p || !p || !p.h.alive) return;
    this.raise(STARS.copKill, h.soldier ? 'you killed a soldier' : h.swat ? 'you killed a S.W.A.T. officer' : 'you killed a police officer', { x: p.x, z: p.z }, { kind: 'copKill', victim: h });
  }

  /** An officer has you in sight. */
  spotted(officer) {
    const p = this.g.player, now = this.now;
    const gap = this.lastSeen ? now - this.lastSeen.t : 99;
    this.lastSeen = { x: p.x, z: p.z, t: now };
    this.coolT = 0;
    this.seen = true; this.seenBy = officer;
    if (gap > 6) {
      this.stats.spotted++;
      this.note('spotted');
      officer.mind?.ask('copSpotted', 72);
      // and says where over the radio
      for (const o of this.g.humans) {
        if (o === officer || !o.officer || !o.mind || !o.h.alive) continue;
        const k = o.mind._know(p, false);
        k.x = p.x; k.z = p.z;
        o.mind.note('heard', 'radio', `heard over the radio that the suspect has been seen ${o.mind.where(p.x, p.z).text}`, 0.6);
      }
    }
  }

  /** You are in handcuffs, put on by an officer. */
  busted(by) {
    if (!this.wanted) return;
    this.stats.busted++;
    this.note('arrested');
    this.clear('arrested');
    this.g.ui?.toast('Arrested.', 3);
  }

  /** It is over: arrested, dead, or forgotten. */
  clear(why = 'lost') {
    const was = this.wanted;
    this.wanted = 0; this.coolT = 0; this.lastSeen = null; this.why = ''; this.heat = 0; this.counted.clear();
    if (was) { this.stats.cleared++; this.note(`clear: ${why}`); this.g.ui?.wantedChanged(0, why); }
    // nobody on the net is after you any more
    const p = this.g.player;
    for (const o of this.g.humans) {
      if (!o.officer || !o.mind) continue;
      const k = o.mind.known.get(p.id);
      if (k) { k.crime = Math.min(k.crime, 0.5); k.hostile = 0; k.hurtMe = false; k.wanted = 0; }
      if (o.mind.threat && o.mind.threat.src === p) o.mind.threat = null;
      if (o.brain && o.brain.suspect === p) { o.brain.suspect = null; o.brain.sk = null; }
    }
  }

  /** Respawned: a new person, unknown to anyone. */
  reset() { this.clear('respawned'); this.response.reset(); }

  /* ------------------------------ fingerprints ---------------------------- */

  /** Bare hands on somebody leave prints on them. */
  touched(victim, by) {
    if (!victim || !by || victim === by || !by.isPlayer) return;
    (victim.prints || (victim.prints = new Map())).set(by.id, this.now);
  }

  /** What an officer's scanner finds on a body: the player, or nobody. */
  scan(officer, victim) {
    this.stats.scans++;
    const p = this.g.player, at = victim.prints && victim.prints.get(p.id);
    const hit = at != null && this.now - at < PRINT_LIFE;
    this.note(hit ? 'prints: a match' : 'prints: nothing on file');
    if (hit) {
      this.stats.matches++;
      // they know who it is; not where
      this.raise(STARS.prints, 'your fingerprints were on the body', null, { kind: 'prints', victim });
      if (!this.wanted) return true;
      this.g.ui?.toast('The police found your fingerprints on the body. They are searching the city.', 4);
    }
    return hit;
  }

  /* --------------------------------- searching ---------------------------- */

  /** Somewhere for an officer to look. */
  searchPoint(officer) {
    const city = this.g.city, now = this.now, ls = this.lastSeen;
    if (ls && now - ls.t < 45) {
      // round where you were last seen, further out the longer it has been
      const r = 4 + (now - ls.t) * 1.4;
      for (let k = 0; k < 8; k++) {
        const a = rand(0, Math.PI * 2), d = rand(r * 0.3, r);
        const x = ls.x + Math.cos(a) * d, z = ls.z + Math.sin(a) * d;
        if (city.isClear(x, z, 0.5)) return { x, z };
      }
      return { x: ls.x, z: ls.z };
    }
    // only your name: the whole city, each officer somewhere the others are not
    let best = null, bs = -1;
    for (let k = 0; k < 6; k++) {
      const pt = city.randomPavement();
      let near = 99;
      for (const o of this.g.humans) { if (o === officer || !o.officer || !o.brain || !o.brain.dest2) continue; near = Math.min(near, Math.hypot(o.brain.dest2.x - pt.x, o.brain.dest2.z - pt.z)); }
      const sc = near + rand(0, 8);
      if (sc > bs) { bs = sc; best = pt; }
    }
    return best;
  }

  /* ---------------------------------- frame ------------------------------- */

  update(dt) {
    const g = this.g, p = g.player, now = this.now;
    if (!p) return;
    if (this.ignored && this.wanted) this.clear('ignored');
    if (!p.h.alive && this.wanted) this.clear('dead');

    // can any officer see you?
    this.lookT -= dt;
    if (this.lookT <= 0) {
      this.lookT = 0.25;
      this.seen = false; this.seenBy = null;
      if (this.wanted) {
        for (const o of g.humans) {
          if (!o.officer || !o.mind || !o.h.alive || !o.h.conscious || o.removed) continue;
          if (Math.hypot(o.x - p.x, o.z - p.z) > 46) continue;
          if (o.mind.canSeeHuman(p) > 0.35) { this.spotted(o); break; }
        }
      }
    }
    if (this.wanted) {
      if (this.seen) this.coolT = 0;
      else {
        this.coolT += dt;
        if (this.coolT > COOL[this.wanted]) {
          this.wanted--; this.coolT = 0;
          // and what they hold against you comes down with it, or the star would be straight back
          this.heat = Math.min(this.heat, this.wanted >= 3 ? HEAT_AT[this.wanted] : 6);
          this.note(`cooled to ${this.wanted}`);
          if (this.wanted === 0) this.clear('lost');
          else { this.g.ui?.wantedChanged(this.wanted, 'they are still looking'); this._sync(false); }
        }
      }
    }
    this._sync(false);

    // reports: someone goes to each
    for (const r of this.reports) {
      if (r.status === 'closed') continue;
      if (now - r.t > 300) { r.status = 'closed'; continue; }
      r.assigned = r.assigned.filter((o) => o.brain && o.brain.callout === r && !o.removed && o.h.alive);
      const want = r.kind === 'shooting' || r.kind === 'murder' || r.kind === 'shots' ? 2 : 1;
      if (r.assigned.length >= want || r.status !== 'open') continue;
      let best = null, bd = Infinity;
      for (const o of g.humans) {
        if (!this._free(o) || r.assigned.includes(o)) continue;
        const d = Math.hypot(o.x - r.x, o.z - r.z);
        if (d < bd) { bd = d; best = o; }
      }
      if (best) { r.assigned.push(best); best.brain.dispatch(r); }
    }
    this.reports = this.reports.filter((r) => r.status !== 'closed' || now - r.t < 400);

    // who is sent, and in what: on foot from the station, in cars, in the air; and home again when it is over
    // (on somebody else's server the police, and everything they send, are the host's)
    if (!g.mirror) this.response.update(dt);
  }

  /**
   * What every officer knows about you is what the net knows: how wanted you
   * are, and where you were last seen. (What each has seen with their own
   * eyes they still know besides.)
   */
  _sync(fresh) {
    const g = this.g, p = g.player, now = this.now;
    for (const o of g.humans) {
      if (!o.officer || !o.mind || !o.h.alive) continue;
      const k = o.mind._know(p, false);
      k.wanted = this.wanted;
      if (!this.wanted) continue;
      k.crime = Math.max(k.crime, this.wanted >= 2 ? 3 : 2);
      if (fresh) k.crimeT = now;
      if (this.lastSeen && now - k.last > 0.5) { k.x = this.lastSeen.x; k.z = this.lastSeen.z; }
    }
  }

  /** A description of you as a caller would give it. */
  describe(p) {
    const l = p.look;
    return l.desc || 'a man';
  }
}
