/* =============================================================================
   The law: who did what to whom, and whether it was a crime.

   Every blow, shot and death in the sandbox comes past here, and most of
   what people do to each other is a crime - but not hitting back at someone
   who went for you first, not stepping in against someone in the middle of
   hurting somebody, and nothing an officer does in the line of duty.
   Monsters (a mod's) are not people to the law, either way.

     assault         a punch, a kick, a shove with a thrown body
     armed assault   the same with brass knuckles, a blade, a crate
     tasing          a taser used on somebody, by anyone but an officer
     threat          a gun held on somebody who was doing nothing
     shots fired     a shot at somebody
     shooting        a shot that hit them
     murder          a death at the end of any of that

   Whoever saw it remembers it. An officer who saw it - or heard the shots,
   which carry the width of the world - goes after whoever did it; the rest
   tell the first officer they come across (police.js).
   ========================================================================== */

export const CRIMES = {
  assault: { sev: 1, label: 'Assault', said: 'attacked' },
  armedAssault: { sev: 2, label: 'Assault with a weapon', said: 'went at', with: true },
  tasing: { sev: 1.2, label: 'Tasing someone', said: 'tased' },
  threat: { sev: 1.5, label: 'Threatening someone with a gun', said: 'pulled a gun on' },
  shotsFired: { sev: 2.5, label: 'Shots fired', said: 'shot at' },
  shooting: { sev: 3, label: 'Shooting someone', said: 'shot' },
  murder: { sev: 4, label: 'Murder', said: 'killed' },
};

const SELF_DEFENCE = 12;     // seconds after someone goes for you that hitting them back is fair
const STEPPING_IN = 20;      // ...and after someone commits a crime, that stopping them is

const monster = (p) => !!(p && p.species && (p.species.monster || p.species.mindless));

export class Law {
  constructor(sb) {
    this.sb = sb;
    this.crimes = [];
    this.aggro = new Map();   // who went for whom: attacker -> Map(victim -> { first, last })
    this.held = new Map();    // guns held on people: "a>b" -> since when
    this.t = 0;
    sb.on('swing', (e) => { if (e.who && e.target) this.mark(e.who, e.target); });
    sb.on('squareUp', (e) => { if (e.who && e.target) this.mark(e.who, e.target); });
    sb.on('hit', (e) => this.onHit(e));
    sb.on('shot', (e) => this.onShot(e));
    sb.on('tased', (e) => this.onTased(e));
    sb.on('death', (e) => this.onDeath(e));
    sb.on('cuffed', (e) => this.answered(e.who));
  }

  clear() {
    this.crimes.length = 0;
    this.aggro.clear();
    this.held.clear();
  }

  /** Whether something a to v is the law's business at all. */
  counts(a, v) {
    if (!a || !v || a === v || a.kind !== 'stickman' || v.kind !== 'stickman' || a.removed) return false;
    if (monster(a) || monster(v)) return false;
    // an officer bringing somebody in is doing the job
    if (a.officer) return false;
    return true;
  }

  /** a went for v: when this run of it started, and when it was last. */
  mark(a, v) {
    if (!a || !v || a === v) return;
    let m = this.aggro.get(a);
    if (!m) { m = new Map(); this.aggro.set(a, m); }
    const now = this.sb.time, e = m.get(v);
    if (!e || now - e.last > SELF_DEFENCE) m.set(v, { first: now, last: now });
    else e.last = now;
  }

  /**
   * a doing it to v is fair: v went for a first (whoever started it does not
   * get to call hitting back self defence), or v was just now hurting somebody.
   */
  justified(a, v) {
    const now = this.sb.time;
    const theirs = this.aggro.get(v) && this.aggro.get(v).get(a);
    if (theirs && now - theirs.last < SELF_DEFENCE) {
      const mine = this.aggro.get(a) && this.aggro.get(a).get(v);
      if (!mine || now - mine.last > SELF_DEFENCE || theirs.first <= mine.first) return true;
    }
    return this.crimes.some((c) => c.by === v && c.against !== a && !c.done && now - c.t < STEPPING_IN);
  }

  onHit(e) {
    const a = e.by, v = e.who;
    if (!this.counts(a, v)) return;
    let kind;
    if (e.weapon === 'bullet' || e.weapon === 'vestRound') kind = 'shooting';
    else if (e.weapon === 'taserZap') kind = 'tasing';
    else if (e.kind === 'impact') kind = e.object && e.object.kind === 'crate' ? 'armedAssault' : 'assault';
    else kind = e.armed || e.weapon ? 'armedAssault' : 'assault';
    const fair = this.justified(a, v);
    this.mark(a, v);
    if (!fair) this.record(kind, a, v, e.x, e.y);
  }

  onShot(e) {
    const a = e.who, v = e.target;
    if (!this.counts(a, v)) return;
    const fair = this.justified(a, v);
    this.mark(a, v);
    if (!fair) this.record('shotsFired', a, v, e.x, e.y, true);
  }

  onTased(e) {
    const a = e.by, v = e.who;
    if (!this.counts(a, v)) return;
    const fair = this.justified(a, v);
    this.mark(a, v);
    if (!fair) this.record('tasing', a, v, v.wj.chest.x, v.wj.chest.y);
  }

  onDeath(e) {
    const k = e.by, v = e.who;
    if (!this.counts(k, v)) return;
    // only a death at the end of something that was a crime is murder
    const now = this.sb.time;
    if (this.crimes.some((c) => c.by === k && c.against === v && now - c.t < 120)) this.record('murder', k, v, v.wj.hip.x, v.wj.hip.y + 0.3);
  }

  /** Guns held on people who were doing nothing, a second and more: a threat. */
  update(dt) {
    if ((this.t -= dt) > 0) return;
    this.t = 0.5;
    const now = this.sb.time;
    for (const p of this.sb.people) {
      const o = p.aimTarget;
      if (!p.aiming || !o || o.kind !== 'stickman' || p.armedWith === 'taser') continue;
      if (!this.counts(p, o) || this.justified(p, o)) continue;
      const key = p.id + '>' + o.id;
      const since = this.held.get(key);
      if (since === undefined || now - since > 30) { this.held.set(key, now); continue; }
      if (now - since > 1.2) {
        this.held.set(key, now - 1.2 + 15);
        this.mark(p, o);
        this.record('threat', p, o, p.wj.handA.x, p.wj.handA.y);
      }
    }
    if (this.held.size > 200) this.held.clear();
  }

  /**
   * A crime: kept, and told to everyone who saw it (or, for shots, heard it):
   * officers go after whoever did it, everybody else remembers.
   */
  record(kind, by, against, x, y, loud = false) {
    const sb = this.sb, now = sb.time;
    let c = this.crimes.find((o) => o.by === by && o.against === against && o.kind === kind && !o.done && now - o.t < 6);
    if (c) { c.t = now; c.x = x; c.y = y; }
    else {
      c = { kind, sev: CRIMES[kind].sev, label: CRIMES[kind].label, by, against, t: now, x, y, done: false };
      this.crimes.push(c);
      if (this.crimes.length > 80) this.crimes.shift();
    }
    const heard = loud || kind === 'shooting' || kind === 'shotsFired' || kind === 'murder';
    for (const p of sb.people) {
      if (p === by || !p.brain || p.removed || !p.alive || !p.conscious) continue;
      const seen = p === against || p.brain.canSee(x, y);
      if (p.officer) { if (seen || (heard && Math.abs(p.pos.x - x) < 60)) p.brain.learnCrime(c, seen); }
      else if (seen) p.brain.witnessed(c);
    }
    sb.emit('crime', { crime: c, who: by, about: against, x, y });
    return c;
  }

  /** The worst they have done lately that nobody has made them answer for. */
  wanted(p, window = 180) {
    const now = this.sb.time;
    let best = null;
    for (const c of this.crimes) {
      if (c.by !== p || c.done || now - c.t > window) continue;
      if (!best || c.sev > best.sev) best = c;
    }
    return best;
  }

  /** Cuffed: what they did has been answered for. */
  answered(p) {
    for (const c of this.crimes) if (c.by === p) c.done = true;
  }
}
