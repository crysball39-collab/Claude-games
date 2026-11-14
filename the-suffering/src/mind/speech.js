/* =============================================================================
   Saying things.

   Minds decide that something is worth saying; this decides who actually
   gets to say it, in what words, and puts the words over their head. A cry
   of pain is immediate and always scripted - nobody waits on a network to
   scream. Anything less urgent goes to Claude when Claude is connected, a
   few people at a time, and falls back to that person's own stock of lines
   the moment it is not.

   Whatever is said is also a sound in the world: people near enough hear the
   words, people further off hear some of them.
   ========================================================================== */
import { line, flavour, isShout, classify } from './lines.js';
import { P } from '../human/rig.js';
import { ST } from '../human/human.js';
import { $, el, clamp, rand } from '../core/util.js';

const _s = [0, 0, 0], _v = [0, 0, 0];
const SCREAMS = new Set(['hitCut', 'hitShot', 'hitStab', 'lostLimb', 'boneBreak', 'tased']);
/** What an officer says where a member of the public would say something else; null is nothing at all. */
const COP = {
  greet: 'copGreet', greetBack: 'copGreet', replyGreet: 'copGreet', playerNear: 'copGreet', sawSpawn: 'copIdle', idle: 'copIdle', bored: 'copIdle',
  aimedAt: 'copChallenge', sawWeapon: null, surrender: 'copChallenge', replyThreat: 'copChallenge', replyThreatBrave: 'copChallenge', replyScared: 'copCalm',
  sawFist: 'copHalt', sawAttack: 'copHalt', sawShot: 'copFire', gunshot: 'copRespond', startle: 'copRespond', flee: 'copRespond', cower: 'copRespond', gawk: 'copRespond',
  sawHurt: 'copMedic', sawBlood: 'copMedic', sawDismember: 'copMedic', sawHeadless: 'copMedic', sawCarHit: 'copMedic', mourn: 'copMedic',
  relief: 'copClear', fight: 'copHalt', fightWin: 'copDown', sawDeath: 'copRespond', sawCorpse: 'copRespond', replyGo: 'copGreet', replyInsult: 'copGreet',
};
const NOW = {
  reply: null,
  copChallenge: 'they have their pistol on someone who is holding a weapon, and are ordering them to drop it', copHalt: 'they are ordering someone who has just attacked a person to stop',
  copFire: 'they have just opened fire on an armed suspect and are calling it in', copDown: 'the suspect is on the ground and they are covering them',
  copCalm: 'the suspect has stopped and they are keeping them still at gunpoint', copClear: 'the trouble is over and they are standing down', copIdle: 'nothing is happening on their shift',
  copSubdue: 'words have not worked and they are going in with their hands to put someone on the ground',
  copReload: 'they are changing magazine in the middle of a firefight', copRespond: 'they are running toward trouble they have heard', copGreet: 'a member of the public has come up to them',
  hitVest: 'a bullet has just hit their vest and not gone through', hitHelmet: 'a bullet has just glanced off their helmet',
  tased: 'a taser has locked every muscle in their body and they can only make a noise', afterTase: 'a taser has just let go of them and they are lying on the ground getting their body back',
  cuffed: 'they have just been put in handcuffs', inCell: 'they are locked in the cell at the police station, in handcuffs',
  copTaser: 'they are about to fire their taser at someone who will not stop, and are shouting the warning', copCuff: 'they are putting handcuffs on the suspect',
  copCustody: 'they have the suspect in handcuffs and are reporting it', copMedic: 'someone is badly hurt in front of them and they are calling for an ambulance', copWalk: 'they are walking a handcuffed prisoner to the station',
  hitBlunt: 'they have just been struck and react', hitCut: 'they have just been cut and react', hitStab: 'they have just been stabbed and react',
  hitShot: 'they have just been shot and react', hitUnseen: 'something has just hurt them and they did not see what', hitCar: 'a car has just hit them',
  lostLimb: 'a part of their body has just been taken off', boneBreak: 'a bone has just broken', bleeding: 'they have noticed how much they are bleeding',
  downPain: 'they are on the ground, hurt', crawl: 'they are dragging themselves away along the ground', dying: 'they can feel themselves dying',
  cold: 'they are freezing', cantBreathe: 'they cannot get their breath', nausea: 'they are about to be sick', blind: 'they have just realised they cannot see',
  deaf: 'their ears are ringing and they can barely hear', paralysed: 'they cannot feel their legs', wake: 'they are coming round after blacking out',
  getUp: 'they are getting back on their feet', sawDeath: 'they have just watched someone die', sawDismember: 'they have just watched someone lose a limb',
  sawHeadless: 'they have just seen someone without a head', sawAttack: 'they have just watched an attack', sawShot: 'they have just watched someone get shot',
  sawFist: 'they are watching a fist fight', sawWeapon: 'they have just noticed a weapon', aimedAt: 'a gun is pointed straight at them',
  surrender: 'they have their hands up', gunshot: 'they have just heard gunfire', flee: 'they are running for their life', cower: 'they are curled up, hiding their head',
  sawCorpse: 'they have come across a dead body', sawBlood: 'they have noticed blood on the ground', sawHurt: 'they have noticed someone who is hurt',
  sawCarHit: 'they have just watched a car hit someone', carNear: 'a car has just nearly hit them', horn: 'a driver is sounding the horn at them',
  sawSpawn: 'they have just watched something appear out of thin air', fight: 'they are fighting back', fightWin: 'the person they were fighting has gone down',
  relief: 'the danger seems to have passed', mourn: 'they are kneeling beside someone who is badly hurt or dead', gawk: 'they are watching the trouble from a distance',
  idle: 'nothing is happening; a passing thought, said aloud to nobody', bored: 'they are bored', phone: 'they are looking at their phone',
  greet: 'they greet someone they are passing', chatA: 'they make small talk with the person next to them', chatB: 'they answer small talk from the person next to them',
  playerNear: 'the stranger is standing uncomfortably close to them', bump: 'someone has just barged into them', stumble: 'they are staggering, trying not to fall',
  startle: 'something has just made them jump', crate: 'a crate has just crashed down near them', react: 'a moment after what just happened to them',
};

export class Speech {
  constructor(game, voices) {
    this.g = game; this.voices = voices;
    this.layer = $('#bubbles');
    this.pool = []; this.active = [];
    this.queue = [];
    this.tickT = 0; this.lastAi = -99;
    this.stats = { scripted: 0, ai: 0, failed: 0 };
    this.last = null;                 // the most recent thing anybody said, for tests
  }

  /* --------------------------------- bubbles ------------------------------ */

  /** Somebody says something. */
  say(human, text, o = {}) {
    const g = this.g, now = g.time;
    if (!text) return;
    if (!human.isPlayer && (!human.h.alive || !human.h.conscious || human.gone[P.HEAD] || !human.attached[P.HEAD])) return;
    let b = this.active.find((x) => x.human === human);
    if (!b) {
      const node = this.pool.pop() || el('div', 'bubble');
      if (this.layer) this.layer.appendChild(node);
      b = { el: node, human, until: 0, text: '' };
      this.active.push(b);
      if (this.active.length > 9) this._drop(0);
    }
    const dur = clamp(1.4 + text.length * 0.055, 1.8, 6.5);
    b.until = now + dur; b.text = text; b.seen = true; b.check = 0;
    b.el.textContent = text;
    b.el.className = 'bubble' + (o.shout ? ' shout' : '') + (o.you ? ' you' : '') + (o.ai ? ' ai' : '');
    human.talkT = dur * 0.85;
    if (o.shout && !human.isPlayer) human.scream = Math.min(1.1, dur * 0.45);
    const m = human.mind;
    if (m) { m.said = text; m.saidAt = now; m.saidAi = !!o.ai; m.speakCool = dur + rand(0.8, 2.6); }
    this.last = { human, text, ai: !!o.ai, t: now };

    const hd = human.bodies[P.HEAD];
    g.audio?.voice(human, o.scream ? 'scream' : o.shout ? 'shout' : 'talk', text, hd.px, hd.py, hd.pz);
    g.minds?.noise(hd.px, hd.py, hd.pz, o.shout ? 88 : 65, 'speech', human, text, !!o.chat);
    if (o.scream) g.minds?.noise(hd.px, hd.py, hd.pz, 101, 'scream', human);
    this._aloud(human, text, o);
  }

  /** Reads a line out with the browser's own voice, if the player has asked for that. */
  _aloud(human, text, o) {
    const g = this.g, synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    if (!g.settings.tts || !synth || human.isPlayer) return;
    const d = Math.hypot(human.x - g.player.x, human.z - g.player.z);
    if (d > 16 || synth.pending) return;
    try {
      const u = new SpeechSynthesisUtterance(text.replace(/\*[^*]*\*/g, ''));
      u.pitch = clamp(human.look.pitch, 0.5, 2); u.rate = o.shout ? 1.25 : 1.05; u.volume = clamp(1 - d / 18, 0.15, 1) * (g.settings.volume ?? 0.7);
      synth.speak(u);
    } catch { /* no voice here */ }
  }

  _drop(i) {
    const b = this.active[i];
    b.el.remove();
    this.pool.push(b.el);
    this.active.splice(i, 1);
  }
  forget(human) {
    for (let i = this.active.length - 1; i >= 0; i--) if (this.active[i].human === human) this._drop(i);
    this.queue = this.queue.filter((q) => q.m.h !== human);
  }

  /* --------------------------------- frame -------------------------------- */

  update(dt) {
    const g = this.g, now = g.time, cam = g.camera.position;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i], h = b.human;
      if (now > b.until || h.removed || (!h.isPlayer && !h.h.alive)) { this._drop(i); continue; }
      const hd = h.bodies[h.attached[P.HEAD] ? P.HEAD : P.CHEST];
      g.toScreen(hd.px, hd.py + 0.3, hd.pz, _s);
      const d = Math.hypot(hd.px - cam.x, hd.py - cam.y, hd.pz - cam.z);
      // words do not carry through a building
      b.check -= dt;
      if (b.check <= 0) { b.check = 0.25; b.seen = d < 3 || g.world.lineClear(cam.x, cam.y, cam.z, hd.px, hd.py + 0.2, hd.pz); }
      const show = _s[2] < 1 && d < 44 && b.seen && !(h.isPlayer && g.firstPerson);
      if (!show) { b.el.style.display = 'none'; continue; }
      const sc = clamp(1.2 - d / 36, 0.5, 1.08);
      const life = b.until - now;
      b.el.style.display = '';
      b.el.style.opacity = life < 0.35 ? String(life / 0.35) : '';
      b.el.style.transform = `translate(${_s[0].toFixed(1)}px, ${_s[1].toFixed(1)}px) translate(-50%, -100%) scale(${sc.toFixed(3)})`;
    }

    this.tickT -= dt;
    if (this.tickT <= 0) { this.tickT = 0.2; this._schedule(); }
  }

  /** Works out who speaks next, and whether Claude or their own lines supply the words. */
  _schedule() {
    const g = this.g, now = g.time, v = this.voices, pl = g.player;
    if (!g.minds) return;
    for (const m of g.minds.list) {
      const h = m.h;
      if (!h.h.alive || !h.h.conscious || m.awaiting || !m.want.length) continue;
      let best = null;
      for (const w of m.want) if (w.at <= now && (!best || w.pri > best.pri)) best = w;
      if (!best) continue;
      const reflex = best.pri >= 90, asked = best.kind === 'reply';
      if (m.speakCool > 0 && !reflex && !asked) continue;
      if (reflex && now - m.saidAt < 0.8) continue;
      m.want.splice(m.want.indexOf(best), 1);
      const d = Math.hypot(h.x - pl.x, h.z - pl.z);
      if (d > 50 && !reflex) continue;
      const useAi = !reflex && this.queue.length < 8 && (v.live || (asked && v.askable)) && best.kind !== 'react';
      if (best.kind === 'react' && !v.live) continue;
      if (useAi || (best.kind === 'react' && v.live)) {
        m.awaiting = true;
        this.queue.push({ m, want: best, at: now, asked, d });
      } else {
        this._scripted(m, best);
        // the cry was theirs; what they say next can be anything
        if (reflex && v.live && d < 30) m.ask('react', 70, { after: best.kind }, rand(1.2, 2));
      }
    }
    if (this.queue.length && v.ready()) {
      const pace = Number(g.settings.aiPace) || 4;
      if (this.queue.some((q) => q.asked) || now - this.lastAi >= pace) this._flush();
    } else if (this.queue.length && !v.live && !v.askable) {
      // the connection went away while people were waiting
      for (const q of this.queue.splice(0)) { q.m.awaiting = false; this._scripted(q.m, q.want); }
    }
    // nobody waits for ever
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      if (now - q.at > 9) { this.queue.splice(i, 1); q.m.awaiting = false; if (q.asked) this._scripted(q.m, q.want); }
    }
  }

  _scripted(m, want) {
    const h = m.h, L = h.look;
    let kind = want.kind;
    if (kind === 'react') return;
    const vars = Object.assign({ first: L.first, job: L.persona.job, errand: L.persona.errand }, want.vars || {});
    if (kind === 'reply') kind = this._replyKind(m, vars.text || '');
    if (h.officer && COP[kind] !== undefined) { kind = COP[kind]; if (!kind) return; }
    let text = line(kind, vars);
    if (!text) return;
    text = flavour(text, m.p, m.mood);
    this.stats.scripted++;
    this.say(h, text, { shout: isShout(text) || want.pri >= 90, chat: kind === 'chatA', scream: SCREAMS.has(kind) });
  }

  /** Which of a person's stock answers fits what was said to them, given the state they are in. */
  _replyKind(m, text) {
    const h = m.h, hh = h.h, e = m.emo, pl = this.g.player;
    const cat = classify(text);
    if (m.deaf > 16) return 'replyDeaf';
    const hurt = hh.pain > 50 || h.state === ST.RAGDOLL || hh.bleedOut > 4;
    if (cat === 'replyHelp') return hurt ? 'replyHelpHurt' : 'replyHelpFine';
    if (cat === 'replyThreat') return m.p.bravery > 0.72 && !(pl.weapon && pl.weapon.def.gun) && !hurt ? 'replyThreatBrave' : 'replyThreat';
    if (hurt) return 'replyHurt';
    const k = m.known.get(pl.id);
    if (e.fear > 55 && k && k.hostile > 0.5) return 'replyScared';
    return cat;
  }

  _flush() {
    const g = this.g, now = g.time;
    this.queue = this.queue.filter((q) => {
      const ok = q.m.h.h.alive && q.m.h.h.conscious && !q.m.h.removed;
      if (!ok) q.m.awaiting = false;
      return ok;
    });
    if (!this.queue.length) return;
    // whoever was spoken to first, then whoever has most cause, nearest first
    this.queue.sort((a, b) => (b.asked - a.asked) || (b.want.pri - a.want.pri) || (a.d - b.d));
    const batch = this.queue.splice(0, 4);
    const asked = batch.some((q) => q.asked);
    this.lastAi = now;
    const scene = this.scene(batch);
    this.voices.speak(scene, { asked }).then((lines) => {
      for (const q of batch) {
        const m = q.m, h = m.h;
        m.awaiting = false;
        if (h.removed || !h.h.alive || !h.h.conscious) continue;
        const l = lines && lines.find((x) => x.id === h.id);
        if (l && l.say) { this.stats.ai++; this.say(h, l.say, { shout: l.shout, ai: true }); }
        else if (!lines) { this.stats.failed++; this._scripted(m, q.want); }
      }
    });
  }

  /** Everything Claude is told about the people it is about to speak for. */
  scene(batch) {
    const parts = ['It is a grey afternoon. People to speak for:'];
    for (const q of batch) parts.push(this.describe(q.m, q.want));
    return parts.join('\n\n');
  }

  describe(m, want) {
    const h = m.h, hh = h.h, L = h.look, p = m.p, c = hh.condition, e = m.emo, now = this.g.time;
    const traits = [p.bravery > 0.66 ? 'brave' : p.bravery < 0.33 ? 'timid' : '', p.temper > 0.66 ? 'short-tempered' : p.temper < 0.3 ? 'even-tempered' : '',
      p.empathy > 0.7 ? 'soft-hearted' : p.empathy < 0.3 ? 'cold' : '', p.cheer > 0.66 ? 'cheerful' : p.cheer < 0.3 ? 'gloomy' : '',
      p.jumpy > 0.7 ? 'easily startled' : '', p.squeamish > 0.7 ? 'squeamish' : '', p.chatty > 0.7 ? 'talkative' : p.chatty < 0.35 ? 'quiet' : ''].filter(Boolean).join(', ') || 'unremarkable';
    const out = [];
    out.push(`#${h.id}: ${L.first}, ${L.age}, ${L.desc}. Works as: ${p.job}. Today: ${p.errand}. Habit: ${p.quirk}. Nature: ${traits}.`);
    out.push(`Condition: ${c.label.toLowerCase()}, ${c.aware}. Pain ${Math.round(hh.pain)}/100, blood ${Math.round(hh.bloodPct)}%, pulse ${Math.round(hh.pulse)}. ${m.doing}.`);
    out.push(`Feels: ${m.feels.join('; ') || 'fine'}.`);
    out.push(`Emotions: fear ${Math.round(e.fear)}, anger ${Math.round(e.anger)}, sadness ${Math.round(e.sadness)}, joy ${Math.round(e.joy)}, surprise ${Math.round(e.surprise)}, boredom ${Math.round(e.boredom)}.`);
    out.push('Sees: ' + (hh.blind >= 2 ? 'nothing; they are blind' : m.sees.length ? m.sees.slice(0, 5).map((s) => s.text).join('; ') : 'nobody nearby') + '.');
    const mem = m.memory.slice(-7).map((x) => '- ' + x.text);
    if (mem.length) out.push('Recently, oldest first:\n' + mem.join('\n'));
    if (m.said && now - m.saidAt < 25) out.push(`Said a moment ago: "${m.said}"`);
    let prompt;
    if (want.kind === 'reply') {
      const v = want.vars || {};
      prompt = v.doctor ? 'someone has crouched beside them and asked how they are. They answer.'
        : `the stranger has just said to them: "${v.text}"${v.clear < 1 ? ' (they only caught part of it)' : ''}. They answer.`;
    } else prompt = (NOW[want.kind] || 'they react to what has just happened') + '.';
    out.push('Now: ' + prompt);
    return out.join('\n');
  }

  /* -------------------------- the player's own voice ------------------------ */

  playerSay(raw) {
    const g = this.g, text = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    if (!text) return false;
    const pl = g.player;
    this.say(pl, text, { you: true, shout: isShout(text) });
    // what the words themselves do to whoever heard them
    const cat = classify(text), now = g.time;
    for (const m of g.minds ? g.minds.list : []) {
      const last = m.memory[m.memory.length - 1];
      if (!last || last.kind !== 'speech' || now - last.t > 0.1) continue;
      if (cat === 'replyThreat') { m.stir('fear', 26); m.stir('surprise', 18); m._threaten(pl, 46); }
      else if (cat === 'replyInsult') { m.stir('anger', 24); m.stir('joy', -15); }
      else if (cat === 'replySorry') { m.stir('anger', -20); m.stir('fear', -8); }
      else if (cat === 'replyGo') { m.hurry = now + 6; }
      else if (cat === 'replyStay' && m.h.brain) { m.h.brain.pause = 4; }
      else if (cat === 'replyGreet' || cat === 'replyHow' || cat === 'replyThanks') { m.stir('joy', 6); }
      if (m.h.brain && m.h.state === ST.ANIM && (!m.threat || m.threat.level < 30)) { m.h.brain.facing = { x: pl.x, z: pl.z, until: now + 5 }; m.lookAt = { x: pl.x, y: pl.y + 1.6, z: pl.z, until: now + 5 }; }
    }
    return true;
  }

  /** The doctor asks a patient how they are. */
  askAfter(human) {
    const m = human.mind;
    if (!m || !human.h.alive || !human.h.conscious) return false;
    m.want = m.want.filter((w) => w.kind !== 'reply');
    m.ask('reply', 87, { text: 'How are you? Tell me what is wrong.', clear: 1, d: 1, doctor: true });
    m.speakCool = 0;
    return true;
  }
}
