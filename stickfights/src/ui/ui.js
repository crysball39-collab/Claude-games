/* =============================================================================
   The HUD: the spawn menu, the three tools, the buttons along the top, the
   settings, and the inspector that shows what a stickman thinks and feels.

   Tools:
     HAND   drag anything to move it, let go while moving to throw it; tap a
            stickman to open their mind; drag empty space to pan
     SPAWN  tap the world to place whatever was picked in the spawn menu
     ERASE  tap something to remove it

   Pinching zooms and pans with any tool. Keyboard: 1 2 3 pick a thing to
   spawn, H hand, X erase, Space pause, S slow motion, F follow, Tab spawn
   menu, + and - zoom, 0 reset the camera, M sound, Delete removes whoever is
   selected, Esc closes things.
   ========================================================================== */
import { Gestures } from '../core/input.js';
import { drawStickman, drawCrateShape, drawKnuckleShape, INK } from '../game/draw.js';
import { solve, makeJoints, P } from '../game/skeleton.js';
import { STAND } from '../game/clips.js';
import { describeTraits } from '../game/people.js';
import { PARTS } from '../game/health.js';
import { STYLE } from '../game/animator.js';
import { LIMITS } from '../game/sandbox.js';
import { clamp } from '../core/util.js';

const KINDS = {
  stickman: { name: 'Stickman', short: 'STICKMAN', plural: 'stickmen' },
  knuckles: { name: 'Brass Knuckles', short: 'KNUCKLES', plural: 'brass knuckles' },
  crate: { name: 'Crate', short: 'CRATE', plural: 'crates' },
};

const OPTION_NAMES = {
  fight: (t) => 'Fight ' + t.name,
  flee: (t) => 'Get away from ' + t.name,
  chat: (t) => 'Talk to ' + t.name,
  help: (t) => 'Help ' + t.name,
  mourn: (t) => 'Mourn ' + t.name,
  arm: () => 'Grab the brass knuckles',
  inspect: (t) => (t.kind === 'stickman' ? "Look at " + t.name + "'s body" : 'Look at the ' + t.name.toLowerCase()),
  play: () => 'Climb a crate',
  rest: () => 'Sit down and rest',
  idle: () => 'Stand around',
  wander: () => 'Wander about',
  celebrate: () => 'Celebrate',
  panic: () => 'Panic',
  cower: (t) => 'Cower from ' + t.name,
  investigate: () => 'Check out a noise',
  confront: (t) => 'Stand up to ' + t.name,
  watch: (t) => 'Watch ' + t.name + ' fight',
  throw: (t) => 'Throw a crate at ' + t.name,
};

const EMOTION_ROWS = [
  ['joy', 'Joy', '#f2c14e'],
  ['sadness', 'Sadness', '#5b9bf0'],
  ['anger', 'Anger', '#e8453c'],
  ['fear', 'Fear', '#a874e8'],
  ['surprise', 'Surprise', '#f08a3c'],
];

export class UI {
  constructor({ sb, cam, renderer, hand, sound, canvas }) {
    this.sb = sb;
    this.cam = cam;
    this.renderer = renderer;
    this.hand = hand;
    this.sound = sound;
    this.canvas = canvas;
    this.tool = 'hand';
    this.spawnKind = 'stickman';
    this.selected = null;
    this.hover = null;
    this.toastT = 0;
    this.insT = 0;
    this.clearArmed = 0;
    this.slow = false;
    this.started = false;
    this.$ = (id) => document.getElementById(id);

    this.gestures = new Gestures(canvas, {
      tap: (x, y) => this.tap(x, y),
      dragStart: (x, y, button) => this.dragStart(x, y, button),
      dragMove: (x, y, dx, dy, mode) => this.dragMove(x, y, dx, dy, mode),
      dragEnd: (x, y, mode) => this.dragEnd(x, y, mode),
      pinch: (scale, cx, cy, dx, dy) => { this.cam.zoomAt(scale, cx, cy); this.cam.pan(dx, dy); },
      wheel: (dy, x, y) => this.cam.zoomAt(Math.exp(-dy * 0.0015), x, y),
      hover: (x, y) => { this.hover = { x, y }; },
      leave: () => { this.hover = null; },
    });

    this.bindHud();
    this.bindDrawer();
    this.bindInspector();
    this.bindSettings();
    this.bindKeys();
    this.drawCardIcons();
    this.setSpawnKind('stickman');
  }

  /* -------------------------------------------------------------------------- */
  /*                                  gestures                                  */
  /* -------------------------------------------------------------------------- */

  world(sx, sy) { return this.cam.toWorld(sx, sy); }
  get tol() { return clamp(26 / this.cam.ppm, 0.12, 0.6); }

  tap(sx, sy) {
    if (!this.started) return;
    this.sound.unlock();
    const w = this.world(sx, sy);
    const thing = this.sb.thingAt(w.x, w.y, this.tol);
    if (this.tool === 'erase') {
      if (thing) {
        this.sb.remove(thing);
        this.toast('Removed ' + (thing.kind === 'stickman' ? thing.name : 'the ' + thing.name.toLowerCase()));
        if (thing === this.selected) this.select(null);
      }
      return;
    }
    if (this.tool === 'spawn') {
      if (thing && thing.kind === 'stickman') { this.select(thing); return; }
      this.spawnAt(w.x, w.y);
      return;
    }
    if (thing && thing.kind === 'stickman') this.select(thing === this.selected ? null : thing);
    else if (thing) this.toast(thing.wornBy ? `${thing.name}, on ${thing.wornBy.name}'s hand` : thing.carriedBy ? `A crate, held up by ${thing.carriedBy.name}` : thing.name);
    else this.select(null);
  }

  dragStart(sx, sy, button) {
    if (!this.started) return 'pan';
    this.sound.unlock();
    if (button === 1 || button === 2) return 'pan';
    const w = this.world(sx, sy);
    const thing = this.tool === 'erase' ? null : this.sb.thingAt(w.x, w.y, this.tol);
    if (thing && this.hand.grab(thing, w.x, w.y)) {
      this.cam.follow = null;
      return 'grab';
    }
    return 'pan';
  }

  dragMove(sx, sy, dx, dy, mode) {
    if (mode === 'grab') {
      const w = this.world(sx, sy);
      this.hand.move(w.x, w.y);
    } else if (mode === 'pan') {
      this.cam.pan(dx, dy);
    }
  }

  dragEnd(sx, sy, mode) {
    if (mode === 'grab') this.hand.release();
  }

  spawnAt(x, y) {
    const k = this.spawnKind, sb = this.sb;
    let made = null;
    if (k === 'stickman') made = sb.spawnStickman(x);
    else if (k === 'crate') made = sb.spawnCrate(x, Math.max(y, 0.4));
    else if (k === 'knuckles') made = sb.spawnKnuckles(x, Math.max(y, 0.12));
    if (!made) {
      this.toast(`That's as many ${KINDS[k].plural} as the sandbox holds (${LIMITS[k === 'stickman' ? 'people' : k === 'crate' ? 'crates' : 'knuckles']})`);
      return null;
    }
    this.sound.pop(x);
    if (made.kind === 'stickman') this.toast(`${made.name} appeared`);
    return made;
  }

  /* -------------------------------------------------------------------------- */
  /*                                    HUD                                     */
  /* -------------------------------------------------------------------------- */

  bindHud() {
    const $ = this.$;
    $('btn-menu').addEventListener('click', () => this.toggleDrawer());
    for (const b of document.querySelectorAll('.tool')) b.addEventListener('click', () => this.setTool(b.dataset.tool));
    $('btn-pause').addEventListener('click', () => this.togglePause());
    $('btn-slow').addEventListener('click', () => this.toggleSlow());
    $('btn-sound').addEventListener('click', () => this.toggleSound());
    $('btn-settings').addEventListener('click', () => this.toggleSettings(true));
    $('btn-clear').addEventListener('click', () => this.clearPressed());
    $('btn-sound').classList.toggle('off', !this.sound.on);
  }

  setTool(t) {
    this.tool = t;
    for (const b of document.querySelectorAll('.tool')) b.classList.toggle('active', b.dataset.tool === t);
    if (t === 'spawn') this.hint(`Tap the world to place a ${KINDS[this.spawnKind].name}`);
    else if (t === 'erase') this.hint('Tap something to remove it');
    else this.hint('');
  }

  togglePause() {
    this.sb.paused = !this.sb.paused;
    this.$('btn-pause').classList.toggle('on', this.sb.paused);
    this.$('paused-tag').classList.toggle('hidden', !this.sb.paused);
  }

  toggleSlow() {
    this.slow = !this.slow;
    this.sb.timeScale = this.slow ? 0.25 : 1;
    this.$('btn-slow').classList.toggle('on', this.slow);
    this.toast(this.slow ? 'Slow motion' : 'Normal speed');
  }

  toggleSound() {
    this.sound.setOn(!this.sound.on);
    if (this.sound.on) this.sound.unlock();
    this.$('btn-sound').classList.toggle('off', !this.sound.on);
    this.toast(this.sound.on ? 'Sound on' : 'Sound off');
  }

  clearPressed() {
    const b = this.$('btn-clear');
    if (this.clearArmed > 0) {
      this.sb.clear();
      this.select(null);
      this.clearArmed = 0;
      b.classList.remove('armed');
      this.toast('Cleared');
      return;
    }
    this.clearArmed = 2.5;
    b.classList.add('armed');
    this.toast('Tap again to clear everything');
  }

  toast(text, secs = 2.2) {
    const t = this.$('toast');
    t.textContent = text;
    t.classList.add('show');
    this.toastT = secs;
  }

  hint(text) {
    const h = this.$('hint');
    h.textContent = text;
    h.classList.toggle('show', !!text);
  }

  /* -------------------------------------------------------------------------- */
  /*                                 spawn menu                                 */
  /* -------------------------------------------------------------------------- */

  bindDrawer() {
    this.$('btn-close').addEventListener('click', () => this.toggleDrawer(false));
    for (const c of document.querySelectorAll('.card')) {
      c.addEventListener('click', () => {
        this.setSpawnKind(c.dataset.spawn);
        this.setTool('spawn');
        this.toggleDrawer(false);
      });
    }
  }

  toggleDrawer(open) {
    const d = this.$('drawer');
    const want = open === undefined ? !d.classList.contains('open') : open;
    d.classList.toggle('open', want);
    d.setAttribute('aria-hidden', want ? 'false' : 'true');
    if (want) this.gestures.reset();
  }

  setSpawnKind(k) {
    this.spawnKind = k;
    for (const c of document.querySelectorAll('.card')) c.classList.toggle('selected', c.dataset.spawn === k);
    this.$('tool-spawn-name').textContent = KINDS[k].short;
    const cv = document.querySelector('#tool-spawn .tool-icon');
    this.drawIcon(cv, k);
    if (this.tool === 'spawn') this.hint(`Tap the world to place a ${KINDS[k].name}`);
  }

  drawCardIcons() {
    for (const c of document.querySelectorAll('.card')) this.drawIcon(c.querySelector('canvas'), c.dataset.spawn, true);
  }

  /** The little pictures on the cards and the spawn tool, drawn with the game's own code. */
  drawIcon(cv, kind, card = false) {
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (card) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, h * 0.84, w, h * 0.16);
    }
    if (kind === 'stickman') {
      const j = solve(STAND, 1, makeJoints());
      const s = (h * (card ? 0.78 : 0.95)) / 1.78;
      ctx.setTransform(s, 0, 0, -s, w / 2, card ? h * 0.84 : h * 0.98);
      drawStickman(ctx, j, { scale: 1, facing: 1, hair: 'tuft', face: { eyes: 'normal', brow: 0, mouth: 0.4, open: 0 }, ink: card ? INK : '#111' });
    } else if (kind === 'crate') {
      const s = (h * (card ? 0.55 : 0.85)) / 0.78;
      ctx.setTransform(s, 0, 0, -s, w / 2, card ? h * 0.84 - (0.39 * s) : h / 2);
      drawCrateShape(ctx, 0.78, 0.78, null);
    } else if (kind === 'knuckles') {
      const s = (w * (card ? 0.7 : 0.9)) / 0.26;
      ctx.setTransform(s, 0, 0, -s, w / 2, card ? h * 0.62 : h / 2);
      drawKnuckleShape(ctx, 0.26, 0.11, 0);
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                                  inspector                                 */
  /* -------------------------------------------------------------------------- */

  bindInspector() {
    const $ = this.$;
    $('ins-close').addEventListener('click', () => this.select(null));
    $('ins-follow').addEventListener('click', () => {
      const p = this.selected;
      if (!p) return;
      this.cam.follow = this.cam.follow === p ? null : p;
      $('ins-follow').classList.toggle('on', this.cam.follow === p);
    });
    $('ins-heal').addEventListener('click', () => {
      const p = this.selected;
      if (p && p.heal()) this.toast(`${p.name} is good as new`);
    });
    $('ins-delete').addEventListener('click', () => {
      const p = this.selected;
      if (!p) return;
      this.sb.remove(p);
      this.toast(`Removed ${p.name}`);
      this.select(null);
    });
    // the bars are made once and only their widths change
    this.meters = {};
    const rows = [...EMOTION_ROWS.map((r) => [...r, 'ins-emotions']), ['pain', 'Pain', '#ff6b6b', 'ins-vitals'], ['blood', 'Blood', '#c0182a', 'ins-vitals']];
    for (const [key, label, color, where] of rows) {
      const box = $(where);
      const row = document.createElement('div');
      row.className = 'meter';
      const l = document.createElement('span');
      l.textContent = label;
      const bar = document.createElement('div');
      bar.className = 'bar';
      const fill = document.createElement('div');
      fill.className = 'fill';
      fill.style.background = color;
      bar.appendChild(fill);
      row.append(l, bar);
      box.appendChild(row);
      this.meters[key] = fill;
    }
  }

  select(p) {
    if (this.selected) this.selected.selected = false;
    this.selected = p;
    const ins = this.$('inspector');
    if (!p) {
      ins.classList.add('hidden');
      if (this.cam.follow) this.cam.follow = null;
      return;
    }
    p.selected = true;
    ins.classList.remove('hidden');
    this.$('ins-name').textContent = p.name;
    const chips = this.$('ins-traits');
    chips.textContent = '';
    for (const t of describeTraits(p.traits || {})) {
      const c = document.createElement('span');
      c.className = 'chip';
      c.textContent = t;
      chips.appendChild(c);
    }
    this.$('ins-follow').classList.toggle('on', this.cam.follow === p);
    this.insT = 0;
    this.updateInspector();
    this.keepInView(p);
  }

  /** If the inspector has just covered whoever it is about, slide the view over. */
  keepInView(p) {
    const r = this.$('inspector').getBoundingClientRect();
    const s = this.cam.toScreen(p.wj.neck.x, p.wj.neck.y);
    if (s.x < r.left - 20 || s.y > r.bottom || s.y < r.top) return;
    const portrait = r.width > this.cam.w * 0.7;
    if (portrait) this.cam.glideTo(this.cam.x, this.cam.y + (r.top - 40 - s.y) / this.cam.ppm);
    else this.cam.glideTo(this.cam.x + (s.x - r.left * 0.5) / this.cam.ppm, this.cam.y);
  }

  updateInspector() {
    const p = this.selected;
    if (!p) return;
    if (p.removed) { this.select(null); return; }
    const b = p.brain, h = p.health, $ = this.$;
    const mood = $('ins-mood');
    mood.textContent = p.dead ? 'Dead' : !p.conscious ? 'Unconscious' : b.emo.label;
    mood.classList.toggle('dead', p.dead);
    $('ins-doing').textContent = b.doing;
    for (const [k] of EMOTION_ROWS) this.meters[k].style.width = (p.dead ? 0 : b.emo[k] * 100).toFixed(0) + '%';
    this.meters.pain.style.width = (p.dead ? 0 : clamp(h.pain, 0, 100)).toFixed(0) + '%';
    this.meters.blood.style.width = (clamp((h.blood - 0.38) / 0.62, 0, 1) * 100).toFixed(0) + '%';
    $('ins-heal').disabled = p.dead;

    const conds = h.conditions();
    const cb = $('ins-conds');
    cb.textContent = '';
    if (!conds.length) {
      const s = document.createElement('div');
      s.className = 'ok';
      s.textContent = 'Unhurt';
      cb.appendChild(s);
    }
    for (const c of conds.slice(0, 6)) {
      const s = document.createElement('div');
      s.className = 'bad';
      s.textContent = c;
      cb.appendChild(s);
    }
    if (p.weapon) {
      const s = document.createElement('div');
      s.textContent = 'Wearing brass knuckles';
      cb.appendChild(s);
    }
    this.drawFigure(p);

    const ob = $('ins-options');
    ob.textContent = '';
    const opts = p.dead || !p.conscious ? [] : b.options.slice(0, 4);
    const top = opts.length ? Math.max(...opts.map((o) => o.score)) : 1;
    for (let i = 0; i < opts.length; i++) {
      const o = opts[i];
      const row = document.createElement('div');
      row.className = 'opt' + (i === 0 ? ' top' : '');
      const l = document.createElement('span');
      l.textContent = (OPTION_NAMES[o.kind] || (() => o.kind))(o.target || {});
      const bar = document.createElement('div');
      bar.className = 'bar';
      const fill = document.createElement('div');
      fill.className = 'fill';
      fill.style.width = clamp((o.score / top) * 100, 4, 100).toFixed(0) + '%';
      bar.appendChild(fill);
      row.append(l, bar);
      ob.appendChild(row);
    }
    if (!opts.length) {
      const row = document.createElement('div');
      row.className = 'thought';
      row.textContent = p.dead ? 'Nothing, any more.' : 'Nothing. Out cold.';
      ob.appendChild(row);
    }

    const tb = $('ins-thoughts');
    tb.textContent = '';
    for (const t of b.thoughts.slice(-5)) {
      const row = document.createElement('div');
      row.className = 'thought';
      const ago = document.createElement('i');
      ago.textContent = fmtAgo(this.sb.time - t.t);
      row.append(ago, document.createTextNode(t.text));
      tb.appendChild(row);
    }

    const pb = $('ins-people');
    pb.textContent = '';
    const rels = [...b.rels.values()].filter((r) => !r.other.removed && r.met)
      .sort((x, y) => (Math.abs(y.like) + y.anger + y.fear + y.fam) - (Math.abs(x.like) + x.anger + x.fear + x.fam))
      .slice(0, 5);
    for (const r of rels) {
      const row = document.createElement('div');
      row.className = 'person';
      const n = document.createElement('b');
      n.textContent = r.other.name;
      const tag = document.createElement('span');
      const [cls, text] = relTag(r);
      tag.className = 'tag ' + cls;
      tag.textContent = text;
      row.append(n, tag);
      pb.appendChild(row);
    }
    if (!rels.length) {
      const row = document.createElement('div');
      row.className = 'thought';
      row.textContent = 'Has not met anyone yet.';
      pb.appendChild(row);
    }
  }

  /** A little stick figure, each part coloured by how it is doing. */
  drawFigure(p) {
    const cv = this.$('ins-figure');
    const ctx = cv.getContext('2d');
    const h = p.health;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const col = (k) => {
      if (p.dead) return '#666';
      const part = h.parts[k];
      if (part.broken) return '#8e1b1b';
      const f = part.hp / part.max;
      return f > 0.66 ? '#5fd35f' : f > 0.33 ? '#f0c040' : '#e04040';
    };
    const j = solve(P({ t: 0, aA: [24, 6], aB: [-24, 6], lA: [12, 0], lB: [-12, 0] }), 1, makeJoints());
    const s = 54;
    ctx.setTransform(s, 0, 0, -s, cv.width / 2, cv.height - 6);
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.09;
    const seg = (a, b, c) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(j[a].x, j[a].y); ctx.lineTo(j[b].x, j[b].y); ctx.stroke(); };
    seg('hip', 'kneeA', col('legA')); seg('kneeA', 'footA', col('legA'));
    seg('hip', 'kneeB', col('legB')); seg('kneeB', 'footB', col('legB'));
    seg('hip', 'neck', col('torso'));
    seg('shoulder', 'elbowA', col('armA')); seg('elbowA', 'handA', col('armA'));
    seg('shoulder', 'elbowB', col('armB')); seg('elbowB', 'handB', col('armB'));
    ctx.strokeStyle = col('head');
    ctx.beginPath();
    ctx.arc(j.head.x, j.head.y, 0.155, 0, Math.PI * 2);
    ctx.stroke();
  }

  /* -------------------------------------------------------------------------- */
  /*                                  settings                                  */
  /* -------------------------------------------------------------------------- */

  bindSettings() {
    const $ = this.$;
    const saved = loadSettings();
    const map = {
      'set-names': (v) => { this.renderer.opts.names = v; },
      'set-bubbles': (v) => { this.renderer.opts.bubbles = v; },
      'set-thoughts': (v) => { this.renderer.opts.thoughts = v; },
      'set-blood': (v) => { this.sb.settings.blood = v; },
      'set-flipbook': (v) => { STYLE.flipbook = v; },
    };
    for (const [id, apply] of Object.entries(map)) {
      const el = $(id);
      if (saved[id] !== undefined) el.checked = saved[id];
      apply(el.checked);
      el.addEventListener('change', () => {
        apply(el.checked);
        saved[id] = el.checked;
        saveSettings(saved);
      });
    }
    $('settings-close').addEventListener('click', () => this.toggleSettings(false));
    $('settings').addEventListener('click', (e) => { if (e.target.id === 'settings') this.toggleSettings(false); });
    $('btn-home').addEventListener('click', () => { this.cam.home(); this.toggleSettings(false); });
  }

  toggleSettings(open) {
    this.$('settings').classList.toggle('hidden', !open);
    if (open) this.gestures.reset();
  }

  /* -------------------------------------------------------------------------- */
  /*                                  keyboard                                  */
  /* -------------------------------------------------------------------------- */

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (!this.started || e.target.tagName === 'INPUT') return;
      const k = e.key;
      if (k === '1' || k === '2' || k === '3') { this.setSpawnKind(['stickman', 'knuckles', 'crate'][+k - 1]); this.setTool('spawn'); }
      else if (k === 'h' || k === 'H') this.setTool('hand');
      else if (k === 'x' || k === 'X') this.setTool('erase');
      else if (k === ' ') { e.preventDefault(); this.togglePause(); }
      else if (k === 's' || k === 'S') this.toggleSlow();
      else if (k === 'm' || k === 'M') this.toggleSound();
      else if (k === 'f' || k === 'F') { if (this.selected) this.$('ins-follow').click(); }
      else if (k === 'Tab') { e.preventDefault(); this.toggleDrawer(); }
      else if (k === '+' || k === '=') this.cam.zoomAt(1.2, this.cam.w / 2, this.cam.h / 2);
      else if (k === '-' || k === '_') this.cam.zoomAt(1 / 1.2, this.cam.w / 2, this.cam.h / 2);
      else if (k === '0') this.cam.home();
      else if ((k === 'Delete' || k === 'Backspace') && this.selected) this.$('ins-delete').click();
      else if (k === 'Escape') {
        if (this.$('drawer').classList.contains('open')) this.toggleDrawer(false);
        else if (!this.$('settings').classList.contains('hidden')) this.toggleSettings(false);
        else if (this.selected) this.select(null);
        else this.setTool('hand');
      }
    });
  }

  /* -------------------------------------------------------------------------- */
  /*                                  per frame                                 */
  /* -------------------------------------------------------------------------- */

  update(dt) {
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) this.$('toast').classList.remove('show');
    if (this.clearArmed > 0 && (this.clearArmed -= dt) <= 0) this.$('btn-clear').classList.remove('armed');
    if (this.selected && (this.insT -= dt) <= 0) {
      this.insT = 0.15;
      this.updateInspector();
    }
  }

  /** What the renderer needs to know from the HUD this frame. */
  drawState() {
    let ghost = null;
    if (this.tool === 'spawn' && this.hover && !this.hand.active) {
      const w = this.world(this.hover.x, this.hover.y);
      const y = this.spawnKind === 'stickman' ? this.sb.surfaceBelow(w.x, 0.15, 100).y
        : Math.max(w.y, this.spawnKind === 'crate' ? 0.39 : 0.04);
      ghost = { kind: this.spawnKind, x: w.x, y };
    }
    return {
      selected: this.selected,
      ghost,
      hand: { active: this.hand.active, x: this.hand.x, y: this.hand.y },
    };
  }
}

function relTag(r) {
  if (r.other.dead) return ['dead', 'Dead'];
  if (r.like > 0.4) return ['friend', 'Friend'];
  if (r.fear > 0.4) return ['afraid', 'Afraid of'];
  if (r.anger > 0.45) return ['enemy', 'Angry at'];
  if (r.like < -0.3) return ['enemy', 'Dislikes'];
  if (r.fam > 0.2 || r.greeted) return ['', 'Knows'];
  return ['', 'Stranger'];
}

function fmtAgo(s) {
  if (s < 1) return 'now';
  if (s < 60) return Math.round(s) + 's';
  return Math.floor(s / 60) + 'm';
}

function loadSettings() {
  try { return JSON.parse(localStorage.getItem('sf.settings') || '{}'); } catch (_) { return {}; }
}

function saveSettings(s) {
  try { localStorage.setItem('sf.settings', JSON.stringify(s)); } catch (_) { /* private mode */ }
}
