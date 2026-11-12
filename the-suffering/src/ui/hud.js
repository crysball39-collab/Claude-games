/* =============================================================================
   Everything on the screen that is not the city: the buttons under the
   thumbs, the sandbox menu, the talk bar, pause and settings.
   ========================================================================== */
import { ST } from '../human/human.js';
import { WEAPONS } from '../combat/weapons.js';
import { CLIPS } from '../human/anim.js';
import { MODELS } from '../mind/voices.js';
import { LINE_COUNT } from '../mind/lines.js';
import { KERB, groundHeight } from '../world/city.js';
import { $, $$, el, store, clamp, rand, IS_TOUCH } from '../core/util.js';

export class UI {
  constructor(game, deps) {
    this.g = game;
    Object.assign(this, deps);            // input, weapons, speech, voices, doctor, sound, settings, save, apply
    this.toastT = 0; this.moveT = 0; this.hitT = 0; this.deadT = 0; this.slow = 0;
    this.playing = false;
    this._wire();
    this.weaponsChanged();
    this._syncSettings();
    this._aiStatus();
    this.voices.onChange = () => this._aiStatus();
  }

  /* -------------------------------- wiring -------------------------------- */

  _wire() {
    const g = this.g, inp = this.input, w = this.weapons;
    inp.bind($('#btn-jump'), 'jump');
    inp.bind($('#btn-crouch'), 'crouch');
    inp.bind($('#btn-reload'), 'reload');
    inp.bind($('#btn-use'), 'use');
    inp.bind($('#btn-drop'), 'drop');
    inp.bind($('#btn-attack'), 'attack', {
      onDown: () => { if (!w.def.gun) { this._hints(true); } if (g.doctor) this._pickCentre(); },
      onUp: () => this._hints(false),
      // a thumb sliding off the button picks the next move by direction
      onSwipe: (dir) => { if (!w.def.gun) { w.choice = dir; this._hints(true); } },
    });
    const tap = (id, fn) => { const b = $(id); b.addEventListener('pointerdown', (e) => e.stopPropagation()); b.addEventListener('click', (e) => { e.preventDefault(); this.sound.unlock(); fn(e); b.blur(); }); };
    tap('#btn-menu', () => this.toggleSandbox());
    tap('#btn-doctor', () => this.toggleDoctor());
    tap('#btn-talk', () => this.openTalk());
    tap('#btn-view', () => { g.firstPerson = !g.firstPerson; $('#btn-view').classList.toggle('on', g.firstPerson); this.toast(g.firstPerson ? 'First person' : 'Third person'); });
    tap('#btn-pause', () => this.pause('main'));
    tap('#btn-resume', () => this.resume());
    tap('#btn-restart', () => { g.respawn(true); this.resume(); });
    tap('#btn-quit', () => { this.pauseOff(); this.showMenu(); });
    tap('#btn-fullscreen', () => this._fullscreen());
    tap('#btn-respawn', () => { $('#dead').hidden = true; this.deadT = 0; g.respawn(false); inp.enabled = true; });
    tap('#btn-play', () => this.play());
    tap('#btn-settings', () => this.pause('settings', true));
    tap('#btn-help', () => this.pause('help', true));
    tap('#doc-ask', () => this.askPatient());
    tap('#doc-me', () => this.doctor.select(g.player));
    tap('#ai-test', () => this._aiTest());
    tap('#talk-cancel', () => this.closeTalk());
    for (const b of $$('[data-close]')) tap('[data-close="' + b.dataset.close + '"]', () => (b.dataset.close === 'doctor' ? this.toggleDoctor(false) : this.toggleSandbox(false)));
    for (const b of $$('[data-spawn]')) b.addEventListener('click', () => this.spawn(b.dataset.spawn));
    for (const b of $$('[data-clean]')) b.addEventListener('click', () => { g.cleanUp(b.dataset.clean); this.toast('Cleaned up: ' + b.textContent.toLowerCase()); this._count(); });
    for (const b of $$('[data-heal]')) b.addEventListener('click', () => { this.healPlayer(); });
    for (const b of $$('#pause-tabs button')) b.addEventListener('click', () => this._ptab(b.dataset.ptab));
    $('#talk-bar').addEventListener('submit', (e) => { e.preventDefault(); const t = $('#talk-input'); if (this.speech.playerSay(t.value)) { t.value = ''; this.closeTalk(); } });
    $('#talk-input').addEventListener('keydown', (e) => { if (e.key === 'Escape') this.closeTalk(); e.stopPropagation(); });

    inp.onTap = (x, y) => {
      if (!g.doctor) return;
      const h = g.pick(x, y);
      if (h) { this.doctor.select(h); this.sound.play('pickup', 0.3); }
    };
    inp.onSlot = (i) => w.select(i - 1);
    inp.onCycle = (d) => w.cycle(d);
    inp.onKey = (k) => {
      if (!this.playing) return;
      if (k === 'pause') { if (g.paused) this.resume(); else if (!$('#sandbox').hidden) this.toggleSandbox(false); else if (g.doctor) this.toggleDoctor(false); else this.pause('main'); }
      else if (g.paused) return;
      else if (k === 'menu') this.toggleSandbox();
      else if (k === 'doctor') this.toggleDoctor();
      else if (k === 'view') $('#btn-view').click();
      else if (k === 'talk') this.openTalk();
    };
    // a mouse is captured for looking around; not while the doctor needs it for pointing
    $('#viewport').addEventListener('click', () => { this.sound.unlock(); if (!IS_TOUCH && this.playing && !g.paused && !g.doctor) inp.requestLock(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.playing && !g.paused) this.pause('main'); });

    // settings
    const s = this.settings;
    const bindSet = (id, key, kind, after) => {
      const e = $(id);
      e.addEventListener(kind === 'check' ? 'change' : 'input', () => {
        s[key] = kind === 'check' ? e.checked : kind === 'num' ? Number(e.value) : e.value;
        this.save(); this.apply(); after?.();
      });
    };
    bindSet('#set-quality', 'quality', 'text', () => this.toast('Graphics change when the game next starts'));
    bindSet('#set-shadows', 'shadows', 'check', () => this.toast('Shadows change when the game next starts'));
    bindSet('#set-gore', 'gore', 'check'); bindSet('#set-sens', 'sens', 'num'); bindSet('#set-fov', 'fov', 'num');
    bindSet('#set-invert', 'invert', 'check'); bindSet('#set-volume', 'volumePct', 'num');
    bindSet('#set-people', 'people', 'num'); bindSet('#set-cars', 'cars', 'num');
    bindSet('#set-key', 'aiKey', 'text', () => { this.voices.reset(); this._aiStatus(); });
    bindSet('#set-model', 'aiModel', 'text', () => this._aiStatus());
    bindSet('#set-live', 'aiLive', 'check', () => this._aiStatus());
    bindSet('#set-pace', 'aiPace', 'text'); bindSet('#set-tts', 'tts', 'check');
    const sel = $('#set-model');
    for (const m of MODELS) { const o = el('option', null, m.name); o.value = m.id; sel.appendChild(o); }
    $('#ai-note').textContent = `Everyone has ${LINE_COUNT} lines of their own to draw on. With a key, each request is billed to it; the key is kept in this browser and sent only to the Claude API. Without one, TALK and the doctor's Ask still reach Claude where this page is opened inside Claude; anywhere else people keep to their own lines.`;
  }

  _syncSettings() {
    const s = this.settings;
    $('#set-quality').value = s.quality; $('#set-shadows').checked = !!s.shadows; $('#set-gore').checked = s.gore !== false;
    $('#set-sens').value = s.sens; $('#set-fov').value = s.fov; $('#set-invert').checked = !!s.invert; $('#set-volume').value = s.volumePct;
    $('#set-people').value = s.people; $('#set-cars').value = s.cars;
    $('#set-key').value = s.aiKey || ''; $('#set-model').value = this.voices.model; $('#set-live').checked = s.aiLive !== false;
    $('#set-pace').value = String(s.aiPace || 4); $('#set-tts').checked = !!s.tts;
  }

  _aiStatus() {
    const st = this.voices.status(), e = $('#ai-status');
    e.textContent = st.text; e.className = 'status ' + st.tone;
  }

  async _aiTest() {
    const v = this.voices, e = $('#ai-status');
    if (!v.askable) { e.textContent = 'Nothing to test: there is no key, and this page is not open inside Claude.'; e.className = 'status'; return; }
    e.textContent = 'Asking...'; e.className = 'status';
    const lines = await v.speak('It is a grey afternoon. People to speak for:\n\n#1: Rosa, 41, a woman in a yellow coat. Works as: florist. Today: on a lunch break. Habit: makes dark jokes under stress. Nature: cheerful, talkative.\nCondition: healthy, conscious. Pain 0/100, blood 100%, pulse 74. Standing about.\nFeels: fine.\nEmotions: fear 0, anger 0, sadness 0, joy 55, surprise 20, boredom 10.\nSees: the stranger (close, ahead).\nNow: the stranger has just said to them: "Testing, testing. Can you hear me?". They answer.', { asked: true });
    if (lines && lines.length && lines[0].say) { e.textContent = 'It works. Rosa says: "' + lines[0].say + '"'; e.className = 'status live'; }
    else this._aiStatus();
    if (!lines && !v.error) { e.textContent = 'No answer came back. People will use their own lines.'; e.className = 'status err'; }
  }

  /* ------------------------------ screens --------------------------------- */

  showMenu() {
    this.playing = false;
    $('#menu').hidden = false; $('#hud').hidden = true; $('#dead').hidden = true;
    this.toggleSandbox(false); this.toggleDoctor(false);
    this.g.paused = true; this.input.enabled = false; this.input.exitLock();
    this.sound.suspend(true);
  }
  play() {
    $('#menu').hidden = true; $('#hud').hidden = false;
    this.playing = true;
    this.g.paused = false; this.input.enabled = true; this.input.reset(); this.input.enabled = true;
    this.sound.unlock(); this.sound.suspend(false);
    if (!this.greeted) { this.greeted = true; this.toast(IS_TOUCH ? 'Left thumb moves. Drag to look. SPAWN opens the sandbox.' : 'WASD to move, click to look around, Tab for the sandbox.', 5); }
  }
  pause(tab = 'main', fromMenu = false) {
    this.fromMenu = fromMenu;
    this.g.paused = true; this.input.enabled = false; this.input.reset(); this.input.exitLock();
    $('#pause').hidden = false;
    $('#pause-title').textContent = fromMenu ? (tab === 'help' ? 'HOW TO PLAY' : 'SETTINGS') : 'PAUSED';
    $$('#pause-tabs button')[0].hidden = fromMenu;
    this._ptab(tab);
    this.closeTalk();
    this.sound.suspend(true);
  }
  _ptab(tab) {
    for (const b of $$('#pause-tabs button')) b.classList.toggle('on', b.dataset.ptab === tab);
    for (const s of $$('#pause [data-ppane]')) s.hidden = s.dataset.ppane !== tab;
  }
  pauseOff() { $('#pause').hidden = true; }
  resume() {
    this.pauseOff();
    if (this.fromMenu) { this.fromMenu = false; return; }
    this.g.paused = false; this.input.enabled = true;
    this.sound.suspend(false);
  }

  toggleSandbox(on) {
    const p = $('#sandbox');
    const show = on === undefined ? p.hidden : on;
    if (show) this.toggleDoctor(false);
    p.hidden = !show;
    $('#btn-menu').classList.toggle('on', show);
    if (show) { this.input.exitLock(); this._count(); }
    this._layout();
  }
  toggleDoctor(on) {
    const show = on === undefined ? !this.g.doctor : on;
    if (show) { $('#sandbox').hidden = true; $('#btn-menu').classList.remove('on'); this.input.exitLock(); }
    this.doctor.open(show);
    $('#btn-doctor').classList.toggle('on', show);
    $('#doctor-hint').hidden = !show || !!this.g.selected;
    this._layout();
  }
  /** Panels cover the thumb buttons on their side of the screen. */
  _layout() {
    const doc = !!this.g.doctor, box = !$('#sandbox').hidden;
    const portrait = window.innerHeight > window.innerWidth;
    $('#buttons').style.visibility = doc || (box && portrait) ? 'hidden' : '';
    $('#stick-zone').style.visibility = (box && !portrait) || ((doc || box) && portrait) ? 'hidden' : '';
    $('#crosshair').style.visibility = doc ? 'hidden' : '';
    $('#weapon-bar').style.visibility = doc || box ? 'hidden' : '';
  }

  openTalk() {
    if (!this.playing || this.g.paused) return;
    this.input.exitLock();
    $('#talk-bar').hidden = false;
    const t = $('#talk-input');
    setTimeout(() => t.focus(), 30);
  }
  closeTalk() { $('#talk-bar').hidden = true; $('#talk-input').blur(); }

  _pickCentre() {
    const r = this.g.renderer.domElement.getBoundingClientRect();
    const h = this.g.pick(r.left + r.width / 2, r.top + r.height / 2);
    if (h) this.doctor.select(h);
  }
  askPatient() {
    const h = this.g.selected;
    if (!h || h.isPlayer) { this.toast('Select somebody else first.'); return; }
    if (!this.speech.askAfter(h)) this.toast(h.h.alive ? 'They are unconscious.' : 'They are past answering.');
  }

  _fullscreen() {
    const d = document, e = d.documentElement;
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else { const p = (e.requestFullscreen || e.webkitRequestFullscreen).call(e); if (p && p.catch) p.catch(() => this.toast('Full screen is not available here.')); }
    } catch { this.toast('Full screen is not available here.'); }
  }

  /* -------------------------------- sandbox ------------------------------- */

  spawn(what) {
    const g = this.g, p = g.player;
    this.sound.unlock();
    if (what === 'human' || what === 'crowd') {
      const n = what === 'crowd' ? 5 : 1;
      for (let i = 0; i < n; i++) {
        const [x, z] = g.spotAhead(3 + (n > 1 ? rand(0, 2.5) : 0), n > 1 ? 1.4 : 0.2);
        const h = g.spawnHuman(x, z, Math.atan2(p.x - x, p.z - z));
        g.minds.witness({ kind: 'spawn', what: h.look.desc, x, y: h.y + 1.4, z });
        if (h.mind) { h.mind.note('felt', 'arrive', 'found myself standing in the street with no idea how I got here', 0.6); h.mind.stir('surprise', 50); h.mind.ask('sawSpawn', 40, null, rand(0.6, 2)); }
      }
      this.toast(n > 1 ? 'Five people' : 'A person');
    } else if (what === 'crate') {
      const [x, z] = g.spotAhead(2.6, 0.15);
      g.spawnCrate(x, groundHeight(x, z) + 1.3, z);
      g.minds.witness({ kind: 'spawn', what: 'a crate', x, y: 1, z });
      this.toast('Crate');
    } else if (WEAPONS[what]) {
      const [x, z] = g.spotAhead(1.5, 0.1);
      this.weapons.spawn(what, x, groundHeight(x, z) + 1.1, z);
      this.toast(WEAPONS[what].name + ' - walk up to it and pick it up');
    }
    this._count();
  }

  healPlayer() {
    const g = this.g, p = g.player;
    if (!p.h.alive || p.h.missing.some((m) => m)) { g.respawn(false); $('#dead').hidden = true; this.deadT = 0; this.input.enabled = true; }
    else { p.h.heal(); g.gore.clearHuman(p); p.bloodied = 0; if (p.state === ST.RAGDOLL) p.startGetUp(); }
    this.toast('Good as new');
  }

  _count() {
    const g = this.g;
    const alive = g.humans.filter((h) => !h.isPlayer && h.h.alive).length, dead = g.humans.filter((h) => !h.isPlayer && !h.h.alive).length;
    const crates = g.props.filter((p) => p.kind === 'crate').length;
    $('#sandbox-count').textContent = `${alive} alive, ${dead} dead, ${crates} crate${crates === 1 ? '' : 's'}, ${this.weapons.items.length} weapon${this.weapons.items.length === 1 ? '' : 's'}.`;
  }

  /* ------------------------------ small things ---------------------------- */

  toast(text, secs = 2.4) { const t = $('#toast'); t.textContent = text; t.classList.add('show'); this.toastT = secs; }
  showMove(label) { const m = $('#move-name'); m.textContent = label; m.classList.add('show'); this.moveT = 0.5; this._label(); }
  hitMark() { $('#crosshair').classList.add('hit'); this.hitT = 0.14; }

  _hints(on) {
    const w = this.weapons, box = $('#move-hints');
    box.hidden = !on || !!w.def.gun;
    if (box.hidden) return;
    const next = w.choice >= 0 ? w.choice : w.combo;
    for (const s of $$('#move-hints span')) { const i = Number(s.dataset.i); s.textContent = CLIPS[w.def.moves[i]].label; s.classList.toggle('next', i === next); }
  }

  _label() {
    const w = this.weapons, d = w.def;
    $('#attack-label').textContent = d.label;
    $('#attack-next').textContent = d.gun ? '' : CLIPS[d.moves[(w.choice >= 0 ? w.choice : this.g.time - w.lastAttack > 1.15 ? 0 : w.combo) % 4]].label;
  }

  weaponsChanged() {
    const w = this.weapons, bar = $('#weapon-bar');
    bar.textContent = '';
    const add = (name, i) => {
      const b = el('button', 'slot' + (w.current === i ? ' on' : ''), name);
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); w.select(i); });
      bar.appendChild(b);
    };
    add('FISTS', -1);
    w.inventory.forEach((it, i) => add(it.def.name.toUpperCase(), i));
    const d = w.def;
    $('#btn-reload').hidden = !d.gun;
    $('#btn-drop').hidden = d.id === 'fists';
    $('#crosshair').classList.toggle('gun', !!d.gun);
    this._label(); this.ammoChanged(); this.nearChanged();
  }
  ammoChanged() {
    const e = this.weapons.equipped, a = $('#ammo');
    a.hidden = !(e && e.def.gun);
    if (!a.hidden) { a.textContent = `${e.ammo} / ${e.def.mag}`; a.classList.toggle('low', e.ammo <= Math.ceil(e.def.mag * 0.2)); }
  }
  nearChanged() {
    const n = this.weapons.near;
    $('#btn-use').hidden = !n;
    if (n) $('#use-label').textContent = 'PICK UP';
  }

  update(dt) {
    const g = this.g, p = g.player;
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) $('#toast').classList.remove('show');
    if (this.moveT > 0 && (this.moveT -= dt) <= 0) $('#move-name').classList.remove('show');
    if (this.hitT > 0 && (this.hitT -= dt) <= 0) $('#crosshair').classList.remove('hit');
    this.doctor.update(dt);
    this.slow += dt;
    if (this.slow > 0.2) {
      this.slow = 0;
      const c = p.h.condition;
      const bar = $('#v-cond');
      bar.style.width = c.pct + '%';
      bar.style.background = c.tone === 'good' ? 'var(--ok)' : c.tone === 'warn' ? 'var(--warn)' : 'var(--bad)';
      $('#v-blood').style.width = clamp(p.h.bloodPct, 0, 100) + '%';
      $('#btn-crouch').classList.toggle('on', !!g.crouchHeld);
      $('#doctor-hint').hidden = !g.doctor || !!g.selected;
      this._label();
      if (!$('#sandbox').hidden) this._count();
    }
    // the end
    if (!p.h.alive) {
      this.deadT += dt;
      if (this.deadT > 1.6 && $('#dead').hidden) {
        $('#dead-cause').textContent = p.h.cause || 'Cause unknown';
        $('#dead').hidden = false;
        this.input.enabled = false; this.input.reset(); this.input.exitLock();
      }
    }
  }
}
