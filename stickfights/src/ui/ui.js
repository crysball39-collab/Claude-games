/* =============================================================================
   The HUD: the spawn menu, the three tools, the buttons along the top, the
   settings, and the inspector that shows what a stickman thinks and feels.

   Tools:
     HAND   drag anything to move it, let go while moving to throw it; tap a
            stickman to open their mind; drag empty space to pan
     SPAWN  tap the world to place whatever was picked in the spawn menu
     ERASE  tap something to remove it

   Pinching zooms and pans with any tool. Keyboard: 1 2 3 4 pick a thing to
   spawn (a stickman, knuckles, a crate, a knife), H hand, X erase, Space pause, S slow motion, F follow, Tab spawn
   menu, + and - zoom, 0 reset the camera, M sound, Delete removes whoever is
   selected, Esc closes things.
   ========================================================================== */
import { Gestures } from '../core/input.js';
import { drawStickman, drawCrateShape, drawKnuckleShape, drawKnifeShape, KNIFE_W, KNIFE_H, INK } from '../game/draw.js';
import { solve, makeJoints, P, DIM } from '../game/skeleton.js';
import { STAND } from '../game/clips.js';
import { describeTraits } from '../game/people.js';
import { BONE_LIST } from '../game/health.js';
import { STYLE } from '../game/animator.js';
import { LIMITS } from '../game/sandbox.js';
import { clamp } from '../core/util.js';

const KINDS = {
  stickman: { name: 'Stickman', short: 'STICKMAN', plural: 'stickmen', limit: 'people' },
  knuckles: { name: 'Brass Knuckles', short: 'KNUCKLES', plural: 'brass knuckles', limit: 'knuckles' },
  knife: { name: 'Combat Knife', short: 'KNIFE', plural: 'knives', limit: 'knives' },
  crate: { name: 'Crate', short: 'CRATE', plural: 'crates', limit: 'crates' },
};

const OPTION_NAMES = {
  fight: (t) => 'Fight ' + t.name,
  flee: (t) => 'Get away from ' + t.name,
  chat: (t) => 'Talk to ' + t.name,
  help: (t) => 'Help ' + t.name,
  mourn: (t) => 'Mourn ' + t.name,
  arm: (t) => (t.kind === 'knife' ? 'Grab the knife' : 'Grab the brass knuckles'),
  pullout: () => 'Pull the knife out',
  exercise: () => 'Do some exercise',
  throwKnife: (t) => 'Throw the knife at ' + t.name,
  surrender: (t) => 'Put their hands up to ' + t.name,
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
    else if (thing) this.toast(thing.wornBy ? `${thing.name}, in ${thing.wornBy.name}'s hand` : thing.carriedBy ? `A crate, held up by ${thing.carriedBy.name}`
      : thing.stuckIn && thing.stuckIn.person ? `${thing.name}, stuck in ${thing.stuckIn.person.name}. Drag it to pull it out` : thing.stuckIn ? `${thing.name}, stuck fast` : thing.name);
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
    else if (k === 'knife') made = sb.spawnKnife(x, Math.max(y, 0.1), Math.random() * 0.4 - 0.2);
    if (!made) {
      this.toast(`That's as many ${KINDS[k].plural} as the sandbox holds (${LIMITS[KINDS[k].limit]})`);
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
    this.drawIcon(document.querySelector('#tool-spawn .tool-icon'), this.spawnKind);
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
      // the whole body on a card; from the hips up on the little tool button,
      // where a whole one would be all hairlines
      const s = card ? (h * 0.78) / 1.78 : h;
      ctx.setTransform(s, 0, 0, -s, w / 2, card ? h * 0.84 : h + 0.84 * s);
      // on the button it is drawn in the button's own colour, which flips when the tool is picked
      const ink = card ? INK : getComputedStyle(cv).color || INK;
      drawStickman(ctx, j, { scale: 1, facing: 1, hair: 'tuft', face: { eyes: 'normal', brow: 0, mouth: 0.4, open: 0 }, ink, far: ink });
    } else if (kind === 'crate') {
      const s = (h * (card ? 0.55 : 0.85)) / 0.78;
      ctx.setTransform(s, 0, 0, -s, w / 2, card ? h * 0.84 - (0.39 * s) : h / 2);
      drawCrateShape(ctx, 0.78, 0.78, null);
    } else if (kind === 'knuckles') {
      const s = (w * (card ? 0.7 : 0.9)) / 0.26;
      ctx.setTransform(s, 0, 0, -s, w / 2, card ? h * 0.62 : h / 2);
      drawKnuckleShape(ctx, 0.26, 0.11, 0);
    } else if (kind === 'knife') {
      const s = (w * (card ? 0.82 : 0.95)) / KNIFE_W;
      const a = card ? 0.5 : 0.7;
      ctx.setTransform(s * Math.cos(a), -s * Math.sin(a), -s * Math.sin(a), -s * Math.cos(a), w / 2, card ? h * 0.52 : h / 2);
      drawKnifeShape(ctx, KNIFE_W, KNIFE_H, 0);
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
      s.textContent = p.armedWith === 'knife' ? 'Holding a combat knife' : 'Wearing brass knuckles';
      cb.appendChild(s);
    }
    if (p.stuck.length) {
      const s = document.createElement('div');
      s.className = 'bad';
      s.textContent = p.stuck.length > 1 ? `${p.stuck.length} knives stuck in them` : 'A knife stuck in them';
      cb.prepend(s);
    }
    this.drawFigure(p);

    const ob = $('ins-options');
    ob.textContent = '';
    const helpless = !p.dead && p.conscious && (p.state === 'down' || p.state === 'crawl' || p.state === 'held' || p.state === 'thrown' || p.state === 'getup');
    const opts = p.dead || !p.conscious || helpless ? [] : b.options.slice(0, 4);
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
      row.textContent = p.dead ? 'Nothing, any more.' : !p.conscious ? 'Nothing. Out cold.'
        : p.health.paralysed === 'all' ? 'Nothing. They cannot move.' : p.state === 'held' || p.state === 'thrown' ? 'Nothing. They are not in charge of themselves.' : 'Nothing until they are back on their feet.';
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

  /**
   * An X-ray of them: every bone, white while it is sound, warming to yellow
   * and red as the part around it takes damage, and broken bones drawn
   * snapped, in red.
   */
  drawFigure(p) {
    const cv = this.$('ins-figure');
    const ctx = cv.getContext('2d');
    const h = p.health;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const part = (k) => h.parts[k];
    const col = (bone, partKey) => {
      if (p.dead) return '#5d6a70';
      if (h.bones[bone] && h.bones[bone].broken) return '#ff4a3d';
      const f = part(partKey).hp / part(partKey).max;
      return f > 0.66 ? '#e8f1f4' : f > 0.33 ? '#f3c95a' : '#f08a3c';
    };
    const j = solve(P({ t: 0, aA: [22, 8], aB: [-22, 8], lA: [10, 0], lB: [-10, 0] }), 1, makeJoints());
    const s = 70;
    ctx.setTransform(s, 0, 0, -s, cv.width / 2, cv.height - 5);
    ctx.lineCap = 'round';
    const bone = (a, b, c, w = 0.065, broken = false) => {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.beginPath();
      if (!broken) { ctx.moveTo(j[a].x, j[a].y); ctx.lineTo(j[b].x, j[b].y); ctx.stroke(); return; }
      // snapped in the middle, the two halves out of line
      const mx = (j[a].x + j[b].x) / 2, my = (j[a].y + j[b].y) / 2;
      const dx = j[b].x - j[a].x, dy = j[b].y - j[a].y;
      ctx.moveTo(j[a].x, j[a].y); ctx.lineTo(mx - dx * 0.04 + dy * 0.12, my - dy * 0.04 - dx * 0.12);
      ctx.moveTo(mx + dx * 0.04 - dy * 0.1, my + dy * 0.04 + dx * 0.1); ctx.lineTo(j[b].x - dy * 0.14, j[b].y + dx * 0.14);
      ctx.stroke();
    };
    const B = (id) => !!(h.bones[id] && h.bones[id].broken);
    // legs and arms
    for (const side of ['B', 'A']) {
      bone('hip', 'knee' + side, col('femur' + side, 'leg' + side), 0.075, B('femur' + side));
      bone('knee' + side, 'foot' + side, col('tibia' + side, 'leg' + side), 0.065, B('tibia' + side));
      bone('foot' + side, 'toe' + side, col('tibia' + side, 'leg' + side), 0.05);
      bone('shoulder', 'elbow' + side, col('humerus' + side, 'arm' + side), 0.065, B('humerus' + side));
      bone('elbow' + side, 'hand' + side, col('forearm' + side, 'arm' + side), 0.055, B('forearm' + side));
    }
    // the spine, as vertebrae
    const sc = col('spine', 'torso');
    ctx.fillStyle = sc;
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const x = j.hip.x + (j.neck.x - j.hip.x) * t, y = j.hip.y + (j.neck.y - j.hip.y) * t;
      ctx.fillRect(x - 0.035, y - 0.02, 0.07, 0.034);
    }
    if (B('spine')) { ctx.strokeStyle = '#ff4a3d'; ctx.lineWidth = 0.035; ctx.beginPath(); ctx.moveTo(j.hip.x - 0.08, j.chest.y - 0.08); ctx.lineTo(j.hip.x + 0.08, j.chest.y - 0.02); ctx.stroke(); }
    // the ribcage: four pairs of ribs curving round from the spine
    ctx.strokeStyle = col('ribs', 'torso');
    ctx.lineWidth = 0.03;
    for (let i = 0; i < 4; i++) {
      const y = j.chest.y + 0.18 - i * 0.055;
      const w = 0.1 + i * 0.012;
      for (const d of [-1, 1]) {
        if (B('ribs') && i === 1 && d > 0) continue;
        ctx.beginPath();
        ctx.moveTo(j.chest.x, y);
        ctx.quadraticCurveTo(j.chest.x + d * w * 1.2, y + 0.01, j.chest.x + d * w, y - 0.05);
        ctx.stroke();
      }
    }
    // the pelvis
    ctx.strokeStyle = col('pelvis', 'torso');
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.moveTo(j.hip.x - 0.13, j.hip.y + 0.08);
    ctx.quadraticCurveTo(j.hip.x, j.hip.y - 0.1, j.hip.x + 0.13, j.hip.y + 0.08);
    if (B('pelvis')) ctx.moveTo(j.hip.x + 0.02, j.hip.y + 0.04), ctx.lineTo(j.hip.x - 0.03, j.hip.y - 0.06);
    ctx.stroke();
    // the neck and the skull
    ctx.strokeStyle = col('neck', 'head');
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(j.neck.x, j.neck.y);
    ctx.lineTo(j.head.x, j.head.y - DIM.headR * 0.9);
    ctx.stroke();
    if (B('neck')) {
      ctx.strokeStyle = '#ff4a3d';
      ctx.lineWidth = 0.03;
      ctx.beginPath(); ctx.moveTo(j.neck.x - 0.06, j.neck.y + 0.04); ctx.lineTo(j.neck.x + 0.06, j.neck.y + 0.08); ctx.stroke();
    }
    ctx.strokeStyle = col('skull', 'head');
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.arc(j.head.x, j.head.y, DIM.headR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = col('skull', 'head');
    ctx.beginPath();
    ctx.arc(j.head.x - 0.05, j.head.y + 0.01, 0.03, 0, Math.PI * 2);
    ctx.arc(j.head.x + 0.05, j.head.y + 0.01, 0.03, 0, Math.PI * 2);
    ctx.fill();
    if (B('skull')) {
      ctx.strokeStyle = '#ff4a3d';
      ctx.lineWidth = 0.025;
      ctx.beginPath();
      ctx.moveTo(j.head.x - 0.08, j.head.y + 0.12); ctx.lineTo(j.head.x - 0.02, j.head.y + 0.06); ctx.lineTo(j.head.x + 0.04, j.head.y + 0.13);
      ctx.stroke();
    }
    // knives in them, where they are
    if (p.stuck.length) {
      ctx.fillStyle = '#ff4a3d';
      for (const e of p.stuck) {
        const [a, b] = [['hip', 'chest'], ['chest', 'neck'], ['neck', 'head'], ['shoulder', 'elbowA'], ['elbowA', 'handA'], ['shoulder', 'elbowB'], ['elbowB', 'handB'],
          ['hip', 'kneeA'], ['kneeA', 'footA'], ['footA', 'toeA'], ['hip', 'kneeB'], ['kneeB', 'footB'], ['footB', 'toeB']][e.bone];
        const x = j[a].x + (j[b].x - j[a].x) * e.t, y = j[a].y + (j[b].y - j[a].y) * e.t;
        ctx.beginPath(); ctx.arc(x, y, 0.045, 0, Math.PI * 2); ctx.fill();
      }
    }
    void BONE_LIST;
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
      'set-ragdoll': (v) => { this.sb.settings.ragdoll = v; },
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
      if (k === '1' || k === '2' || k === '3' || k === '4') { this.setSpawnKind(['stickman', 'knuckles', 'crate', 'knife'][+k - 1]); this.setTool('spawn'); }
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
        : Math.max(w.y, this.spawnKind === 'crate' ? 0.39 : this.spawnKind === 'knife' ? 0.03 : 0.04);
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
