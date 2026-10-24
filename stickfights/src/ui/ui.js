/* =============================================================================
   The HUD: the spawn menu, the three tools, the buttons along the top, the
   settings, and the inspector that shows what a stickman thinks and feels.

   Tools:
     HAND    drag anything to move it, let go while moving to throw it; tap a
             stickman to open their mind; drag empty space to pan. With the
             world paused, whatever is dragged is simply put somewhere else,
             just as it is
     SPAWN   tap the world to place whatever was picked in the spawn menu
     FREEZE  tap something to freeze it in place, and again to let it go
     WIRE    tie things together - or to the background - with a rope, a
             fixed rope or a pin: drag from one thing to another (or tap one,
             then the other); a pin goes in with one tap, through whatever is
             there
     ERASE   tap something to remove it (a wire too)

   Pinching zooms and pans with any tool. Keyboard: 1 to 6 pick a thing to
   spawn (a stickman, knuckles, a crate, a knife, a machete, a Glock-19), 7
   to 9 the first three things the installed mods add, H hand, Z freeze, W
   wire, X erase, Space pause, S slow motion, F follow, Tab spawn menu, + and
   - zoom, 0 reset the camera, M sound, Delete removes whoever is selected,
   Esc closes things. Tapping a gun lying on the floor fires it.

   Mods (see mods/ and ui/mods-screen.js) put a section of their own in the
   spawn menu for each one installed, and what is different about the people
   they add shows in the inspector: what kind of thing they are, what their
   hands are, and buttons for what they can do.

   The inspector is not just for looking. Their feelings are bars that can be
   dragged, their personality is eight sliders, every other person in the
   sandbox is listed under what they think of them - Friends, Knows,
   Dislikes, Enemies - and can be moved to another group, and any of them can
   be picked for them to go and fight.
   ========================================================================== */
import { Gestures } from '../core/input.js';
import {
  drawStickman, drawCrateShape, drawKnuckleShape, drawKnifeShape, drawMacheteShape, drawGlockShape,
  drawM1911Shape, drawTaserShape, drawVestShape, drawAmmoBoxShape, drawGunShape, drawCrowbarShape,
  KNIFE_W, KNIFE_H, MACHETE_W, MACHETE_H, CROWBAR_W, CROWBAR_H, AK_W, MOSS_W, INK,
} from '../game/draw.js';
import { drawWallShape, WALLS } from '../game/structures.js';
import { drawPlantShape } from '../game/trees.js';
import { drawGallowsShape } from '../game/gallows.js';
import { WIRES, tie, pinAt } from '../game/wires.js';
import { setFrozen, frozenSaid, freezable } from '../game/freeze.js';
import { POLICE_UNIFORM } from '../game/render.js';
import { spawnOfficer } from '../game/police.js';
import { solve, makeJoints, P, DIM } from '../game/skeleton.js';
import { STAND } from '../game/clips.js';
import { describeTraits } from '../game/people.js';
import { relCategory } from '../game/brain.js';
import { STYLE } from '../game/animator.js';
import { LIMITS } from '../game/sandbox.js';
import { isGun, AMMO_BOXES, VEST_W, VEST_H } from '../game/props.js';
import { clamp } from '../core/util.js';
import { parseTemperature, setTemperature, fmtTemp, toF, vitalConditions, hasVitals, breathes } from '../game/vitals.js';
import { installedMods, findSpawnable, modSpawnables, modOption } from '../mods/index.js';
import { ModsScreen } from './mods-screen.js';

const KINDS = {
  stickman: { name: 'Stickman', short: 'STICKMAN', plural: 'stickmen', limit: 'people' },
  knuckles: { name: 'Brass Knuckles', short: 'KNUCKLES', plural: 'brass knuckles', limit: 'knuckles' },
  knife: { name: 'Combat Knife', short: 'KNIFE', plural: 'knives', limit: 'knives' },
  machete: { name: 'Machete', short: 'MACHETE', plural: 'machetes', limit: 'machetes' },
  glock: { name: 'Glock-19', short: 'GLOCK-19', plural: 'pistols', limit: 'guns' },
  m1911: { name: 'M1911', short: 'M1911', plural: 'pistols', limit: 'guns' },
  taser: { name: 'Taser', short: 'TASER', plural: 'guns and tasers', limit: 'guns' },
  crate: { name: 'Crate', short: 'CRATE', plural: 'crates', limit: 'crates' },
  officer: { name: 'Officer', short: 'OFFICER', plural: 'people', limit: 'people' },
  vest: { name: 'Light Vest', short: 'VEST', plural: 'vests', limit: 'vests' },
  crowbar: { name: 'Crowbar', short: 'CROWBAR', plural: 'crowbars', limit: 'crowbars' },
  ak47: { name: 'AK-47', short: 'AK-47', plural: 'guns', limit: 'guns', an: true },
  mossberg: { name: 'Mossberg 500', short: 'MOSSBERG', plural: 'guns', limit: 'guns' },
  ammo9: { name: '9 mm Ammo Box', short: '9 MM AMMO', plural: 'ammo boxes', limit: 'ammo' },
  ammo45: { name: '.45 ACP Ammo Box', short: '.45 AMMO', plural: 'ammo boxes', limit: 'ammo' },
  ammo762: { name: '7.62 mm Ammo Can', short: '7.62 AMMO', plural: 'ammo boxes', limit: 'ammo' },
  ammo12: { name: 'Box of 12 Gauge Shells', short: '12 GA SHELLS', plural: 'ammo boxes', limit: 'ammo' },
  woodWall: { name: 'Wood Wall', short: 'WOOD WALL', plural: 'walls', limit: 'walls' },
  metalWall: { name: 'Metal Wall', short: 'METAL WALL', plural: 'walls', limit: 'walls' },
  glassWall: { name: 'Glass Wall', short: 'GLASS WALL', plural: 'walls', limit: 'walls' },
  gallows: { name: 'Gallows', short: 'GALLOWS', plural: 'gallows', limit: 'gallows' },
  tree: { name: 'Tree', short: 'TREE', plural: 'trees and bushes', limit: 'plants' },
  bush: { name: 'Bush', short: 'BUSH', plural: 'trees and bushes', limit: 'plants' },
};
// the ammo boxes in the spawn menu: one for each kind of round
const AMMO_KEYS = { ammo9: 'ammo9', ammo45: 'ammo45', ammo762: 'ammo762', ammo12: 'ammo12' };
const SLOT_SAID = { holster: 'In the holster', pocket: 'In a pocket', duty: 'On the duty belt' };
const KEYS = ['stickman', 'knuckles', 'crate', 'knife', 'machete', 'glock'];
const ARM_NAMES = {
  knife: 'Grab the knife', machete: 'Grab the machete', glock: 'Grab the gun', m1911: 'Grab the M1911', taser: 'Grab the taser', knuckles: 'Grab the brass knuckles',
  crowbar: 'Grab the crowbar', ak47: 'Grab the AK-47', mossberg: 'Grab the shotgun',
};
// a padlock: the shackle drops into the body when it is locked (CSS moves it)
const LOCK_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path class="shackle" d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/><rect x="5" y="11" width="14" height="10" rx="2.5" fill="currentColor"/></svg>';
// the rows of buttons a mod's people have in the inspector
const ABILITY_ROWS = { hands: 'Hands', do: 'Do' };

const OPTION_NAMES = {
  fight: (t) => 'Fight ' + t.name,
  flee: (t) => 'Get away from ' + t.name,
  chat: (t) => 'Talk to ' + t.name,
  help: (t) => 'Help ' + t.name,
  mourn: (t) => 'Mourn ' + t.name,
  arm: (t) => ARM_NAMES[t.kind] || (t.name ? 'Grab the ' + t.name.toLowerCase() : 'Grab a weapon'),
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
  hide: (t) => 'Hide from ' + t.name,
  respond: (t) => 'Deal with ' + t.name,
  comply: (t) => 'Do as ' + t.name + ' says',
  detained: () => 'Sit tight in the cuffs',
  vest: () => 'Put on the vest',
  ammo: () => 'Take rounds from the ammo box',
  catchBreath: () => 'Catch their breath',
  report: (t) => 'Tell ' + t.name + ' what happened',
  patrol: () => 'Walk the beat',
  release: (t) => 'Let ' + t.name + ' go',
};

// what someone thinks of someone else, as the inspector groups them
const GROUPS = [['friend', 'FRIENDS'], ['knows', 'KNOWS'], ['dislikes', 'DISLIKES'], ['enemy', 'ENEMIES'], ['stranger', "HASN'T MET"]];
const REL_CHOICES = [['friend', 'Friend'], ['knows', 'Knows'], ['dislikes', 'Dislikes'], ['enemy', 'Enemy']];
const REL_SAID = {
  friend: (a, b) => `${a} counts ${b} as a friend now`,
  knows: (a, b) => `${a} just knows ${b} now`,
  dislikes: (a, b) => `${a} dislikes ${b} now`,
  enemy: (a, b) => `${b} is ${a}'s enemy now`,
};

const TRAIT_ROWS = [
  ['bravery', 'Bravery'], ['aggression', 'Aggression'], ['temper', 'Temper'], ['empathy', 'Empathy'],
  ['sociability', 'Sociability'], ['curiosity', 'Curiosity'], ['toughness', 'Toughness'], ['skill', 'Fighting skill'],
];

const WEAPON_SAID = { knuckles: 'Wearing brass knuckles', knife: 'Holding a combat knife', machete: 'Holding a machete', crowbar: 'Holding a crowbar' };
// bone -> the two joints of the X-ray figure it runs between
const XRAY_BONE = {
  skull: ['head', 'head'], neck: ['neck', 'head'], spine: ['hip', 'neck'], ribs: ['chest', 'chest'], pelvis: ['hip', 'hip'],
  humerusA: ['shoulder', 'elbowA'], forearmA: ['elbowA', 'handA'], humerusB: ['shoulder', 'elbowB'], forearmB: ['elbowB', 'handB'],
  femurA: ['hip', 'kneeA'], tibiaA: ['kneeA', 'footA'], femurB: ['hip', 'kneeB'], tibiaB: ['kneeB', 'footB'],
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
    this.wireKind = 'woodRope';
    this.wireStart = null;     // the wire tool: where the first end went { t, x, y }, until the second goes in
    this.wireEnd = null;       // ...and where the other end would go, as the pointer moves
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

    this.mods = new ModsScreen({ sb, changed: (m, on) => this.modsChanged(m, on) });
    this.panelThing = null;
    this.panelT = 0;
    this.bars = new Map();
    this.worldBtns = new Map();
    // a mod saying something can now be placed, or used up
    sb.on('inventory', () => this.updateBadges());
    this.bindHud();
    this.sb.on('becomes', (e) => this.becomes(e.from, e.to));
    this.bindDrawer();
    this.bindInspector();
    this.bindSettings();
    this.bindPanel();
    this.bindKeys();
    this.drawCardIcons();
    this.renderDrawerMods();
    this.setSpawnKind('stickman');
  }

  /** Somebody carried on in another body (a mod's): the inspector and the camera go with them. */
  becomes(from, to) {
    if (!to || to.removed) return;
    if (this.selected === from) this.select(to);
    if (this.cam.follow === from) this.cam.follow = to;
  }

  /** What the HUD needs to know about a kind of thing: the game's own, or one a mod adds. */
  kindInfo(k) {
    return KINDS[k] || findSpawnable(k) || KINDS.stickman;
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
    if (this.tool === 'wire') { this.wireTap(w.x, w.y); return; }
    const thing = this.sb.thingAt(w.x, w.y, this.tol);
    if (this.tool === 'erase') {
      // (a timber of a gallows: the whole gallows)
      const t = thing && thing.group && !thing.group.removed ? thing.group : thing;
      if (t) {
        this.sb.remove(t);
        this.toast('Removed ' + (t.kind === 'stickman' ? t.name : 'the ' + t.name.toLowerCase()));
        if (t === this.selected) this.select(null);
      }
      return;
    }
    if (this.tool === 'freeze') {
      if (!thing || !freezable(thing)) { this.toast(thing ? `The ${thing.name.toLowerCase()} can't be frozen` : 'Tap something to freeze it in place'); return; }
      const on = !thing.frozenInPlace;
      // (a timber of a gallows: every timber of it)
      if (thing.group && !thing.group.removed) {
        for (const p of thing.group.parts) setFrozen(this.sb, p, on);
        thing.group.frozenInPlace = on;
        this.toast(on ? 'The gallows is frozen in place' : 'The gallows is free to move again');
        return;
      }
      if (setFrozen(this.sb, thing, on)) this.toast(frozenSaid(thing, on));
      return;
    }
    if (this.tool === 'spawn') {
      if (thing && thing.kind === 'stickman') { this.select(thing); return; }
      this.spawnAt(w.x, w.y);
      return;
    }
    if (thing && thing.kind === 'stickman') this.select(thing === this.selected ? null : thing);
    else if (thing && isGun(thing.kind) && thing.loose) this.fireLoose(thing);
    // a mod's thing with more to it: a panel to open, or something to say for itself
    else if (thing && thing.panel) this.openPanel(thing);
    // a gallows: the lever pulled (or put back)
    else if (thing && thing.group && thing.group.pull && !thing.group.removed) this.toast(thing.group.pull());
    else if (thing && thing.tap) { const said = thing.tap(this.sb); if (said) this.toast(said); }
    else if (thing && thing.kind === 'ammo') this.toast(thing.describe());
    else if (thing && thing.kind === 'vest') this.toast(`${thing.name}: ${Math.round(thing.condition * 100)}% left in it` + (thing.dents.length ? `, ${thing.dents.length} round${thing.dents.length === 1 ? '' : 's'} in it` : ''));
    else if (thing) this.toast(thing.wornBy ? `${thing.name}, in ${thing.wornBy.name}'s hand` + (thing.spec && thing.mag !== undefined ? ` (${thing.mag}/${thing.spec.mag})` : '')
      : thing.carriedBy ? `${thing.name === 'Crate' ? 'A crate' : thing.name}, held up by ${thing.carriedBy.name}`
        : thing.kind === 'limb' ? `${thing.of}'s ${thing.name.replace('Severed ', '')}, cut clean off`
          : thing.stuckIn && thing.stuckIn.person ? `${thing.name}, stuck in ${thing.stuckIn.person.name}. Drag it to pull it out` : thing.stuckIn ? `${thing.name}, stuck fast` : thing.name);
    else this.select(null);
  }

  /** A pistol on the floor, tapped: it goes off the way it is pointing. Empty, a fresh magazine goes in instead. */
  fireLoose(g) {
    // a mod's gun says for itself what happened
    if (g.fireLoose) { const said = this.sb.fireLoose(g); if (said) this.toast(said); return; }
    if (g.mag <= 0) {
      if (g.reload()) this.toast(`Fresh magazine in: ${g.mag} rounds, ${g.spare} spare`);
      else { this.sb.fireLoose(g); this.toast('Click. Out of ammo.'); }
      return;
    }
    this.sb.fireLoose(g);
    this.toast(g.mag ? `Bang! ${g.mag} left in the magazine` : 'Bang! That was the last one in the magazine');
  }

  dragStart(sx, sy, button) {
    if (!this.started) return 'pan';
    this.sound.unlock();
    if (button === 1 || button === 2) return 'pan';
    const w = this.world(sx, sy);
    // the wire tool: from here to wherever it is let go
    if (this.tool === 'wire') {
      if (WIRES[this.wireKind].pin) return 'pan';
      this.wireStart = this.wireStartAt(w.x, w.y);
      this.wireEnd = { x: w.x, y: w.y };
      return 'wire';
    }
    const thing = this.tool === 'erase' || this.tool === 'freeze' ? null : this.sb.thingAt(w.x, w.y, this.tol);
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
    } else if (mode === 'wire') {
      this.wireEnd = this.world(sx, sy);
    } else if (mode === 'pan') {
      this.cam.pan(dx, dy);
    }
  }

  dragEnd(sx, sy, mode) {
    if (mode === 'grab') this.hand.release();
    else if (mode === 'wire') {
      const w = this.world(sx, sy);
      const s0 = this.wireStart;
      // (a drag that went nowhere is a tap: that end stays put, waiting for the other)
      if (s0 && Math.hypot(w.x - s0.x, w.y - s0.y) < 0.08) { this.wireEnd = null; this.wireHint(); return; }
      this.wireFinish(w.x, w.y);
    }
  }

  /* ---------------------------------- wires --------------------------------- */

  /** The first end of a wire: whatever is there (the first thing a wire can be tied to), or the background. */
  wireStartAt(x, y) {
    const things = this.sb.thingsAt(x, y, this.tol);
    return { t: things[0] || null, x, y };
  }

  /** A tap with the wire tool: a pin goes in; a rope's first end - or, with one already in, its second. */
  wireTap(x, y) {
    const sb = this.sb, type = this.wireKind;
    if (WIRES[type].pin) {
      const r = pinAt(sb, type, x, y, sb.thingsAt(x, y, this.tol));
      if (r.error) this.toast(r.error);
      else this.toast(r.describe().replace(/ - .*$/, ''));
      return;
    }
    if (!this.wireStart) {
      this.wireStart = this.wireStartAt(x, y);
      this.wireHint();
      return;
    }
    this.wireFinish(x, y);
  }

  /** The second end in: the wire tied (or why not). */
  wireFinish(x, y) {
    const sb = this.sb, s0 = this.wireStart;
    this.wireStart = null;
    this.wireEnd = null;
    if (!s0) return;
    let t1 = sb.thingsAt(x, y, this.tol).find((t) => t !== s0.t) || null;
    if (s0.t && t1 === null && sb.thingsAt(x, y, this.tol).includes(s0.t)) t1 = s0.t;
    const r = tie(sb, this.wireKind, s0.t, s0.x, s0.y, t1, x, y);
    if (r.error) { this.toast(r.error); this.wireHint(); return; }
    this.toast(r.describe().replace(/ - .*$/, ''));
    this.wireHint();
  }

  /** What to do next with the wire tool. */
  wireHint() {
    if (this.tool !== 'wire') return;
    const spec = WIRES[this.wireKind];
    if (spec.pin) this.hint(`${spec.name}: tap where it goes - through what is there, or into the background`);
    else if (this.wireStart) this.hint(`${spec.name}: now tap (or drag to) where the other end goes`);
    else this.hint(`${spec.name}: drag from one thing to another - or to the background`);
  }

  setWireKind(k) {
    if (!WIRES[k]) return;
    this.wireKind = k;
    this.wireStart = null;
    for (const b of document.querySelectorAll('.wire-kind')) {
      const on = b.dataset.wire === k;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    this.$('tool-wire-name').textContent = WIRES[k].name.toUpperCase().replace('FIXED ', 'FIXED ');
    this.wireHint();
  }

  spawnAt(x, y) {
    const k = this.spawnKind, sb = this.sb;
    const mod = KINDS[k] ? null : findSpawnable(k);
    let made = null;
    if (mod) made = mod.spawn(sb, x, y);
    else if (k === 'stickman') made = sb.spawnStickman(x);
    else if (k === 'crate') made = sb.spawnCrate(x, Math.max(y, 0.4));
    else if (k === 'knuckles') made = sb.spawnKnuckles(x, Math.max(y, 0.12));
    else if (k === 'knife') made = sb.spawnKnife(x, Math.max(y, 0.1), Math.random() * 0.4 - 0.2);
    else if (k === 'machete') made = sb.spawnMachete(x, Math.max(y, 0.1), Math.random() * 0.3 - 0.15);
    else if (k === 'glock') made = sb.spawnGun(x, Math.max(y, 0.12), Math.random() * 0.3 - 0.15);
    else if (k === 'm1911') made = sb.spawnGun(x, Math.max(y, 0.12), Math.random() * 0.3 - 0.15, 'm1911');
    else if (k === 'taser') made = sb.spawnTaser(x, Math.max(y, 0.12), Math.random() * 0.3 - 0.15);
    else if (k === 'officer') made = spawnOfficer(sb, x);
    else if (k === 'vest') made = sb.spawnVest(x, Math.max(y, 0.1));
    else if (k === 'crowbar') made = sb.spawnCrowbar(x, Math.max(y, 0.1), Math.random() * 0.3 - 0.15);
    else if (k === 'ak47' || k === 'mossberg') made = sb.spawnGun(x, Math.max(y, 0.14), Math.random() * 0.2 - 0.1, k);
    else if (AMMO_KEYS[k]) made = sb.spawnAmmo(x, Math.max(y, 0.2), AMMO_KEYS[k]);
    else if (WALLS[k]) made = sb.spawnWall(k, x, y);
    else if (k === 'tree' || k === 'bush') made = sb.spawnPlant(k, x, y);
    else if (k === 'gallows') made = sb.spawnGallows(x - 1, y);
    if (!made) {
      const info = this.kindInfo(k);
      // (a mod's thing may have its own reason: nothing crafted yet, say)
      const why = mod && mod.why ? mod.why(sb) : null;
      this.toast(why || `That's as many ${info.plural} as the sandbox holds (${LIMITS[info.limit]})`, why ? 3.2 : 2.2);
      return null;
    }
    this.sound.pop(x);
    if (mod && mod.said) this.toast(mod.said(made));
    else if (made.kind === 'stickman') this.toast(made.officer ? `${made.name}, on duty` : `${made.name} appeared`);
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
    for (const b of document.querySelectorAll('.wire-kind')) b.addEventListener('click', () => this.setWireKind(b.dataset.wire));
    for (const id of ['btn-mods', 'btn-mods-title', 'drawer-get-mods']) $(id).addEventListener('click', () => this.openMods());
  }

  openMods() {
    this.gestures.reset();
    this.mods.show();
  }

  /** A mod has gone in or come out: the spawn menu, the spawn tool and the inspector catch up. */
  modsChanged(m, on) {
    this.renderDrawerMods();
    if (!on && !KINDS[this.spawnKind] && !findSpawnable(this.spawnKind)) {
      this.setSpawnKind('stickman');
      if (this.tool === 'spawn') this.setTool('hand');
    }
    if (this.selected && this.selected.removed) this.select(null);
    if (this.started) this.toast(on ? `${m.name} installed` : `${m.name} removed`);
  }

  setTool(t) {
    this.tool = t;
    this.wireStart = null;
    this.wireEnd = null;
    for (const b of document.querySelectorAll('.tool')) b.classList.toggle('active', b.dataset.tool === t);
    this.$('wirebar').classList.toggle('hidden', t !== 'wire');
    this.drawIcon(document.querySelector('#tool-spawn .tool-icon'), this.spawnKind);
    if (t === 'spawn') this.hint(`Tap the world to place ${placeName(this.kindInfo(this.spawnKind))}`);
    else if (t === 'erase') this.hint('Tap something to remove it');
    else if (t === 'freeze') this.hint('Tap something to freeze it in place - tap it again to let it go');
    else if (t === 'wire') this.wireHint();
    else if (this.sb.paused) this.hint('Paused: drag anything to move it');
    else this.hint('');
  }

  togglePause() {
    this.sb.paused = !this.sb.paused;
    this.$('btn-pause').classList.toggle('on', this.sb.paused);
    this.$('paused-tag').classList.toggle('hidden', !this.sb.paused);
    // (whatever is in the hand is put down: held while paused, it is only moved; while running, it swings)
    if (this.hand.active) this.hand.release();
    if (this.tool === 'hand') this.hint(this.sb.paused ? 'Paused: drag anything to move it' : '');
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
    for (const c of document.querySelectorAll('.card')) c.addEventListener('click', () => this.cardPicked(c));
  }

  toggleDrawer(open) {
    const d = this.$('drawer');
    const want = open === undefined ? !d.classList.contains('open') : open;
    d.classList.toggle('open', want);
    d.setAttribute('aria-hidden', want ? 'false' : 'true');
    if (want) { this.gestures.reset(); this.updateBadges(); }
  }

  setSpawnKind(k) {
    if (!KINDS[k] && !findSpawnable(k)) k = 'stickman';
    this.spawnKind = k;
    for (const c of document.querySelectorAll('.card')) c.classList.toggle('selected', c.dataset.spawn === k);
    this.$('tool-spawn-name').textContent = this.kindInfo(k).short;
    const cv = document.querySelector('#tool-spawn .tool-icon');
    this.drawIcon(cv, k);
    if (this.tool === 'spawn') this.hint(`Tap the world to place ${placeName(this.kindInfo(k))}`);
  }

  /** A section of the spawn menu for each installed mod, with a card for each thing it adds. */
  renderDrawerMods() {
    const box = this.$('drawer-mods');
    box.textContent = '';
    for (const m of installedMods()) {
      const cat = document.createElement('div');
      cat.className = 'cat mod-cat';
      const tag = document.createElement('i');
      tag.className = 'mod-tag';
      tag.textContent = 'MOD';
      cat.append(document.createTextNode(m.name.toUpperCase()), tag);
      box.appendChild(cat);
      for (const sp of m.spawnables || []) {
        const c = document.createElement('button');
        c.className = 'card mod-card';
        c.dataset.spawn = sp.kind;
        c.dataset.mod = m.id;
        const cv = document.createElement('canvas');
        cv.className = 'card-icon';
        cv.width = 72;
        cv.height = 72;
        const text = document.createElement('span');
        text.className = 'card-text';
        const b = document.createElement('b');
        b.textContent = sp.name;
        const small = document.createElement('small');
        small.textContent = sp.blurb || '';
        text.append(b, small);
        c.append(cv, text);
        if (sp.badge) {
          // how many there are to place, for something that has to be made first
          const badge = document.createElement('i');
          badge.className = 'card-badge';
          c.appendChild(badge);
        }
        c.addEventListener('click', () => this.cardPicked(c));
        box.appendChild(c);
        this.drawIcon(cv, sp.kind, true);
      }
    }
    const n = installedMods().length;
    for (const id of ['mods-count', 'mods-count-title']) this.$(id).textContent = n ? String(n) : '';
    this.$('drawer-get-mods').textContent = n ? 'More mods, or remove them, in MODS' : 'More things to spawn, in MODS';
    for (const c of document.querySelectorAll('.card')) c.classList.toggle('selected', c.dataset.spawn === this.spawnKind);
    this.updateBadges();
  }

  /** The counts on the cards of things that have to be made before they can be placed. */
  updateBadges() {
    for (const c of document.querySelectorAll('.card.mod-card')) {
      const sp = findSpawnable(c.dataset.spawn);
      const badge = c.querySelector('.card-badge');
      if (!sp || !badge) continue;
      const t = sp.badge(this.sb);
      badge.textContent = t || '';
      c.classList.toggle('locked', !!(sp.locked && sp.locked(this.sb)));
    }
  }

  cardPicked(c) {
    // something that has to be made first, and has not been: what to do about it, instead
    const sp = c.classList.contains('mod-card') ? findSpawnable(c.dataset.spawn) : null;
    if (sp && sp.locked && sp.locked(this.sb)) { this.toast(sp.why ? sp.why(this.sb) : 'Not yet', 3.2); return; }
    this.setSpawnKind(c.dataset.spawn);
    this.setTool('spawn');
    this.toggleDrawer(false);
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
    const mod = KINDS[kind] ? null : findSpawnable(kind);
    if (mod) {
      if (mod.icon) mod.icon(ctx, w, h, card);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return;
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
    } else if (kind === 'machete') {
      const s = (w * (card ? 0.86 : 1.02)) / MACHETE_W;
      const a = card ? 0.62 : 0.78;
      ctx.setTransform(s * Math.cos(a), -s * Math.sin(a), -s * Math.sin(a), -s * Math.cos(a), w / 2, card ? h * 0.5 : h / 2);
      drawMacheteShape(ctx, MACHETE_W, MACHETE_H, 0);
    } else if (kind === 'glock') {
      const s = (w * (card ? 0.7 : 0.86)) / 0.3;
      ctx.setTransform(s, 0, 0, -s, w / 2, card ? h * 0.47 : h * 0.47);
      drawGlockShape(ctx, 1, 0, 0);
    } else if (kind === 'm1911') {
      const s = (w * (card ? 0.72 : 0.88)) / 0.33;
      ctx.setTransform(s, 0, 0, -s, w / 2, h * 0.47);
      drawM1911Shape(ctx, 1, 0, 0);
    } else if (kind === 'taser') {
      const s = (w * (card ? 0.66 : 0.84)) / 0.26;
      ctx.setTransform(s, 0, 0, -s, w / 2, h * 0.47);
      drawTaserShape(ctx, 1, true);
    } else if (kind === 'officer') {
      const j = solve(STAND, 1, makeJoints());
      const s = card ? (h * 0.78) / 1.78 : h;
      ctx.setTransform(s, 0, 0, -s, w / 2, card ? h * 0.84 : h + 0.84 * s);
      drawStickman(ctx, j, {
        scale: 1, facing: 1, hair: 'none', hat: 'police', face: { eyes: 'normal', brow: 0.1, mouth: 0.15, open: 0 },
        uniform: POLICE_UNIFORM, belt: true, vest: { police: true, dents: [] }, kit: { holster: 'm1911', duty: 'taser' },
      });
    } else if (kind === 'vest') {
      const s = (w * (card ? 0.78 : 0.95)) / VEST_W;
      ctx.setTransform(s, 0, 0, -s, w / 2, card ? h * 0.84 - (VEST_H / 2) * s : h / 2);
      drawVestShape(ctx, VEST_W, VEST_H, false, 1);
    } else if (AMMO_KEYS[kind]) {
      // all of them in scale: the can fills the card, the boxes sit in it
      const size = AMMO_KEYS[kind], sp = AMMO_BOXES[size];
      const s = (w * (card ? 0.8 : 0.95)) / AMMO_BOXES.ammo762.w;
      ctx.setTransform(s, 0, 0, -s, w / 2, card ? h * 0.84 - (sp.h / 2) * s : h / 2);
      drawAmmoBoxShape(ctx, size, sp.w, sp.h, 1);
    } else if (kind === 'crowbar') {
      const s = (w * (card ? 0.86 : 1.02)) / CROWBAR_W;
      const a = card ? 0.62 : 0.78;
      ctx.setTransform(s * Math.cos(a), -s * Math.sin(a), -s * Math.sin(a), -s * Math.cos(a), w / 2, card ? h * 0.5 : h / 2);
      drawCrowbarShape(ctx, CROWBAR_W, CROWBAR_H, 0);
    } else if (kind === 'ak47' || kind === 'mossberg') {
      // a long gun, at a slant to fit
      const len = kind === 'ak47' ? AK_W : MOSS_W;
      const s = (w * (card ? 0.98 : 1.1)) / len;
      const a = card ? 0.42 : 0.55;
      ctx.setTransform(s * Math.cos(a), -s * Math.sin(a), -s * Math.sin(a), -s * Math.cos(a), w / 2, h * 0.5);
      drawGunShape(ctx, kind, 1, 0, 0);
    } else if (WALLS[kind]) {
      // a length of the wall, near enough life size on the card
      const sp = WALLS[kind];
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, card ? h * 0.84 : h);
      ctx.clip();
      const k = (card ? h * 0.84 : h) / 0.9;
      ctx.translate(w / 2, card ? h * 0.84 : h);
      // (three panels side by side, so it reads as a wall)
      for (const dx of [-1, 0, 1]) drawWallShape(ctx, kind, dx * sp.w * k * 1.04, 0, sp.h * k * 0.62);
      ctx.restore();
    } else if (kind === 'tree' || kind === 'bush') {
      drawPlantShape(ctx, kind, w / 2, card ? h * 0.84 : h, card ? h * 0.8 : h * 0.98, kind === 'tree' ? 11 : 5);
    } else if (kind === 'gallows') {
      const hh = card ? h * 0.8 : h * 0.98;
      drawGallowsShape(ctx, w / 2 - hh * 0.27, card ? h * 0.84 : h, hh);
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
    $('ins-uncuff').addEventListener('click', () => {
      const p = this.selected;
      if (p && p.uncuff()) this.toast(`${p.name} is out of the cuffs`);
    });
    // what is in their hand into its holster or a pocket - or out again
    $('ins-kit').addEventListener('click', () => {
      const p = this.selected;
      if (!p || p.dead) return;
      const now = this.sb.time;
      // a fidget gives way to it; a punch, a reload or anything else under way does not
      if (!p.ready && p.state === 'stand' && !p.strike && !p.reloading && !p.stowing && !p.drawing && !p.donning && !p.wantItem && !p.ammoBox && !p.cuffing) p.anim.stopAction(0.08);
      if (p.weapon) {
        const what = p.weapon.name, slot = p.slotFor(p.weapon);
        if (p.stow()) {
          if (p.brain) p.brain.kitT = now + 8;
          this.toast(`${p.name} puts the ${what.toLowerCase()} ${slot === 'pocket' ? 'in a pocket' : slot === 'duty' ? 'on the duty belt' : 'in the holster'}`);
        }
        return;
      }
      const slot = ['holster', 'duty', 'pocket'].find((k) => p.stowed[k]);
      if (slot && p.drawFrom(slot)) {
        if (p.brain) { p.brain.calmT = now + 10; p.brain.kitT = now + 2; }
        this.toast(`${p.name} gets the ${p.stowed[slot].name.toLowerCase()} out`);
      }
    });
    $('ins-delete').addEventListener('click', () => {
      const p = this.selected;
      if (!p) return;
      this.sb.remove(p);
      this.toast(`Removed ${p.name}`);
      this.select(null);
    });
    // the bars are made once and only their widths change (and the body's, the number beside them)
    this.meters = {};
    this.vals = {};
    this.locks = {};
    const rows = [...EMOTION_ROWS.map((r) => [...r, 'ins-emotions']),
      ['conscious', 'Conscious', '#e6dfc8', 'ins-vitals'], ['adrenaline', 'Adrenaline', '#ffb13b', 'ins-vitals'], ['oxygen', 'Oxygen', '#5cc8ff', 'ins-vitals'],
      ['temp', 'Temp', null, 'ins-vitals'],
      ['pain', 'Pain', '#ff6b6b', 'ins-vitals'], ['blood', 'Blood', '#c0182a', 'ins-vitals'], ['stamina', 'Stamina', '#4fbf78', 'ins-vitals']];
    for (const [key, label, color, where] of rows) {
      const box = $(where);
      if (key === 'temp') { this.tempRow(box); continue; }
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
      if (where === 'ins-vitals') {
        row.classList.add('val');
        const v = document.createElement('b');
        row.appendChild(v);
        this.vals[key] = v;
      }
      if (where === 'ins-emotions') {
        this.editableMeter(row, bar, key);
        // and a padlock: locked, the feeling stays exactly where it is
        const lock = document.createElement('button');
        lock.className = 'lock-btn';
        lock.innerHTML = LOCK_ICON;
        lock.addEventListener('click', () => this.toggleLock(key));
        row.appendChild(lock);
        this.locks[key] = { row, lock };
      }
    }

    // personality: a slider for each trait
    this.sliders = {};
    for (const [key, label] of TRAIT_ROWS) {
      const row = document.createElement('label');
      row.className = 'trait';
      const l = document.createElement('span');
      l.textContent = label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.step = '1';
      const val = document.createElement('b');
      input.addEventListener('input', () => {
        const p = this.selected;
        if (!p || !p.brain || p.dead) return;
        p.brain.setTrait(key, +input.value / 100);
        val.textContent = input.value;
        this.showTraits(p);
      });
      row.append(l, input, val);
      $('ins-personality').appendChild(row);
      this.sliders[key] = { input, val };
    }

    // people: a group for each of the ways they can feel about someone, the
    // rows kept from one refresh to the next so the controls in them keep working
    this.rows = new Map();
    this.groups = {};
    for (const [key, title] of GROUPS) {
      const g = document.createElement('div');
      g.className = 'ppl-group ' + key;
      const head = document.createElement('div');
      head.className = 'ppl-title';
      const count = document.createElement('i');
      head.append(document.createTextNode(title), count);
      const list = document.createElement('div');
      const none = document.createElement('div');
      none.className = 'ppl-none';
      none.textContent = 'Nobody';
      g.append(head, list, none);
      $('ins-people').appendChild(g);
      this.groups[key] = { g, count, list, none };
    }
    $('ins-order-stop').addEventListener('click', () => {
      const p = this.selected;
      if (!p || !p.brain || !p.brain.ordered) return;
      const o = p.brain.ordered.target;
      p.brain.standDown();
      this.toast(`${p.name} leaves ${o.name} alone`);
      this.insT = 0;
    });
  }

  /**
   * Their temperature: a thermometer (25 to 45 degrees, 37 marked), the
   * number - which can be typed over, in C, F or K, to set it - and a lock
   * that holds it wherever it is.
   */
  tempRow(box) {
    const row = document.createElement('div');
    row.className = 'meter temp';
    const l = document.createElement('span');
    l.textContent = 'Temp';
    const bar = document.createElement('div');
    bar.className = 'bar thermo';
    const fill = document.createElement('div');
    fill.className = 'fill';
    const norm = document.createElement('i');
    const mark = document.createElement('div');
    mark.className = 'mark';
    bar.append(fill, norm, mark);
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'temp-input';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.enterKeyHint = 'done';
    input.title = 'Type a temperature: 37, 104F, -10, 300 ...';
    const lock = document.createElement('button');
    lock.className = 'lock-btn';
    lock.innerHTML = LOCK_ICON;
    lock.addEventListener('click', () => this.toggleTempLock());
    row.append(l, bar, input, lock);
    box.appendChild(row);
    let shown = '';
    const apply = () => {
      const p = this.selected;
      if (!p || !hasVitals(p) || input.value === shown) { input.value = shown; return; }
      const t = parseTemperature(input.value);
      if (t === null) {
        this.toast('Type a temperature, like 37, 104F or -10', 1.8);
        input.value = shown;
        return;
      }
      setTemperature(p, t);
      shown = input.value = fmtTemp(t);
      this.toast(`${p.name} is now ${fmtTemp(t)} (${toF(t)} °F)${p.health.tempLock != null ? ', held there' : ''}`, 1.6);
      this.insT = 0;
    };
    input.addEventListener('focus', () => { shown = input.value; input.select(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); apply(); input.blur(); }
      else if (e.key === 'Escape') { input.value = shown; input.blur(); }
    });
    input.addEventListener('blur', () => { if (input.value !== shown) apply(); });
    this.thermo = { row, fill, mark, input, lock };
  }

  /** Holds whoever is selected at the temperature they are now, or lets it go. */
  toggleTempLock() {
    const p = this.selected;
    if (!p || !hasVitals(p)) return;
    const h = p.health, on = h.tempLock == null;
    h.tempLock = on ? h.temp : null;
    this.toast(on ? `${p.name}'s temperature is held at ${fmtTemp(h.temp)}` : `${p.name}'s temperature can change again`);
    this.insT = 0;
  }

  /** The body's bars: how awake, how much adrenaline and air, the temperature, the pain, the blood, the breath. */
  showVitals(p) {
    const h = p.health, m = this.meters, v = this.vals;
    const pct = (x) => Math.round(clamp(x, 0, 1) * 100) + '%';
    const bar = (k, f, text) => { m[k].style.width = (clamp(f, 0, 1) * 100).toFixed(0) + '%'; v[k].textContent = text; };
    const awake = p.dead || h.frozen ? 0 : h.conscious;
    bar('conscious', awake, pct(awake));
    bar('adrenaline', h.adrenaline || 0, pct(h.adrenaline || 0));
    const air = breathes(p);
    bar('oxygen', air ? h.oxygen : 1, air ? pct(h.oxygen) : '—');
    m.oxygen.parentNode.parentNode.classList.toggle('off', !air);
    bar('pain', p.dead ? 0 : h.pain / 100, String(p.dead ? 0 : Math.round(h.pain)));
    // (what they can still lose: empty is bled dry, and nothing more comes out of them)
    bar('blood', h.bloodLeft, pct(h.bloodLeft));
    bar('stamina', p.dead ? 0 : p.stamina, pct(p.dead ? 0 : p.stamina));
    const T = this.thermo;
    if (!hasVitals(p)) return;
    const t = h.temp, k = clamp((t - 25) / 20, 0, 1);
    T.fill.style.width = (k * 100).toFixed(1) + '%';
    T.mark.style.left = (k * 100).toFixed(1) + '%';
    T.fill.style.background = h.frozen ? '#bfe6ff' : p.flames ? '#ff7a1a' : t < 35 ? '#5fb4ff' : t < 38 ? '#8fdc95' : t < 40 ? '#ffc24a' : '#ff5a3a';
    T.row.classList.toggle('hot', t >= 38);
    T.row.classList.toggle('cold', t <= 35);
    const held = h.tempLock != null;
    T.row.classList.toggle('locked', held);
    T.lock.classList.toggle('on', held);
    T.lock.setAttribute('aria-pressed', held ? 'true' : 'false');
    T.lock.setAttribute('aria-label', `${held ? 'Let go of' : 'Hold'} ${p.name}'s temperature`);
    T.input.setAttribute('aria-label', `${p.name}'s temperature`);
    if (document.activeElement !== T.input) T.input.value = fmtTemp(t);
  }

  /** A feeling's bar, made something to drag: wherever it is let go is how they feel (for now - feelings settle). */
  editableMeter(row, bar, key) {
    row.classList.add('edit');
    let id = null;
    const set = (e) => {
      const p = this.selected;
      if (!p || !p.brain || p.dead) return;
      const r = bar.getBoundingClientRect();
      const v = clamp((e.clientX - r.left) / r.width, 0, 1);
      p.brain.setEmotion(key, v);
      this.meters[key].style.width = (v * 100).toFixed(0) + '%';
    };
    bar.addEventListener('pointerdown', (e) => {
      const p = this.selected;
      if (!p || !p.brain || p.dead) return;
      e.preventDefault();
      id = e.pointerId;
      bar.setPointerCapture(id);
      row.classList.add('drag');
      set(e);
    });
    bar.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      row.classList.remove('drag');
      const p = this.selected;
      if (p && p.brain && !p.dead) this.toast(`${p.name}: ${key} ${Math.round(p.brain.emo[key] * 100)}%${p.brain.emo.isLocked(key) ? ' (locked)' : ''}`, 1.2);
    };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
  }

  /** Locks a feeling of whoever is selected where it is, or lets it go. */
  toggleLock(key) {
    const p = this.selected;
    if (!p || !p.brain || p.dead) return;
    const on = !p.brain.emo.isLocked(key);
    p.brain.lockEmotion(key, on);
    const pct = Math.round(p.brain.emo[key] * 100);
    this.toast(on ? `${p.name}'s ${key} is locked at ${pct}%` : `${p.name}'s ${key} can change again`);
    this.insT = 0;
  }

  /** The chips under the name: what is unusual about them. */
  showTraits(p) {
    const chips = this.$('ins-traits');
    chips.textContent = '';
    if (p.officer) {
      const c = document.createElement('span');
      c.className = 'chip officer';
      c.textContent = 'Police officer';
      chips.appendChild(c);
    }
    // what they are, when it is not a person
    if (p.species && p.species.label) {
      const c = document.createElement('span');
      c.className = 'chip species';
      c.textContent = p.species.label;
      chips.appendChild(c);
    }
    for (const t of describeTraits(p.brain ? p.brain.traits : p.traits || {})) {
      const c = document.createElement('span');
      c.className = 'chip';
      c.textContent = t;
      chips.appendChild(c);
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
    // something with no mind of its own shows its body and its species' own say only
    ins.classList.toggle('mindless', !p.brain);
    this.$('ins-name').textContent = p.name;
    this.showTraits(p);
    // somebody else's people
    for (const e of this.rows.values()) e.row.remove();
    this.rows.clear();
    for (const [key, { input, val }] of Object.entries(this.sliders)) {
      const v = Math.round((p.brain ? p.brain.traits[key] : 0.5) * 100);
      input.value = String(v);
      val.textContent = String(v);
      input.setAttribute('aria-label', `${p.name}'s ${key}`);
    }
    this.$('ins-follow').classList.toggle('on', this.cam.follow === p);
    this.abil = null;
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
    if (!p.brain) { this.updateMindless(p); return; }
    const b = p.brain, h = p.health, $ = this.$;
    $('ins-boss').classList.add('hidden');
    const mood = $('ins-mood');
    mood.textContent = p.dead ? 'Dead' : h.frozen ? 'Frozen solid' : !p.conscious ? 'Unconscious' : b.emo.label;
    mood.classList.toggle('dead', p.dead);
    $('ins-doing').textContent = b.doing;
    for (const [k] of EMOTION_ROWS) {
      this.meters[k].style.width = (p.dead ? 0 : b.emo[k] * 100).toFixed(0) + '%';
      this.meters[k].parentNode.parentNode.classList.toggle('off', p.dead);
      const { row, lock } = this.locks[k];
      const on = b.emo.isLocked(k) && !p.dead;
      row.classList.toggle('locked', on);
      lock.classList.toggle('on', on);
      lock.disabled = p.dead;
      lock.setAttribute('aria-pressed', on ? 'true' : 'false');
      lock.setAttribute('aria-label', `${on ? 'Unlock' : 'Lock'} ${p.name}'s ${k}`);
    }
    for (const [key, { input, val }] of Object.entries(this.sliders)) {
      input.disabled = p.dead;
      if (document.activeElement === input) continue;
      const v = String(Math.round(b.traits[key] * 100));
      if (input.value !== v) { input.value = v; val.textContent = v; }
    }
    const ord = b.ordered && !b.ordered.target.removed ? b.ordered : null;
    $('ins-order').classList.toggle('hidden', !ord || p.dead);
    this.updateAbilities(p);
    if (ord) $('ins-order-text').textContent = `Sent to fight ${ord.target.name}`;
    this.showVitals(p);
    $('ins-heal').disabled = p.dead;
    $('ins-uncuff').classList.toggle('hidden', !p.cuffed);
    const kit = $('ins-kit'), stowable = !!p.weapon && !!p.slotFor(p.weapon), drawable = !p.weapon && p.kit.length > 0;
    kit.classList.toggle('hidden', p.dead || !!p.cuffed || !(stowable || drawable));
    kit.textContent = p.weapon ? 'Put away' : 'Get it out';
    kit.disabled = p.state !== 'stand';

    // fire, ice and a hand round the throat first; then whatever is at work on them (a mod's: acid, withering)
    const conds = [...vitalConditions(p), ...p.afflictions.filter((a) => a.label).map((a) => a.label), ...h.conditions()];
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
      const g = p.weapon;
      s.textContent = g.describe ? g.describe(p)
        : p.armedWith === 'glock' ? `Holding a Glock-19 (${g.mag}/15, ${g.spare} spare)${p.reloading ? ', reloading' : ''}`
          : WEAPON_SAID[p.armedWith] || 'Holding ' + g.name;
      cb.appendChild(s);
    } else if (p.species && p.species.describeArms) {
      const said = p.species.describeArms(p);
      if (said) {
        const s = document.createElement('div');
        s.className = 'arms';
        s.textContent = said;
        cb.appendChild(s);
      }
    }
    if (p.vest) {
      const s = document.createElement('div');
      const v = p.vest;
      s.textContent = `Wearing a ${v.police ? 'police' : 'light'} vest (${Math.round(v.condition * 100)}%${v.dents.length ? `, ${v.dents.length} round${v.dents.length === 1 ? '' : 's'} in it` : ''})`;
      cb.appendChild(s);
    }
    for (const [slot, it] of p.kit) {
      const s = document.createElement('div');
      const said = it.describe ? it.describe(p).replace(/^Carrying /, '') : it.name;
      s.textContent = `${SLOT_SAID[slot]}: ${said}`;
      cb.appendChild(s);
    }
    if (p.cuffed || p.tased) {
      const s = document.createElement('div');
      s.className = 'bad';
      s.textContent = p.tased ? 'Being tased' : `In handcuffs${p.cuffed.by ? ' (arrested by ' + p.cuffed.by.name + ')' : ''}`;
      cb.prepend(s);
    }
    if (p.stuck.length) {
      const s = document.createElement('div');
      s.className = 'bad';
      const what = (e) => (e.knife && e.knife.kind === 'machete' ? 'machete' : 'knife');
      s.textContent = p.stuck.length > 1 ? `${p.stuck.length} blades stuck in them` : `A ${what(p.stuck[0])} stuck in them`;
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
      l.textContent = (OPTION_NAMES[o.kind] || modOption(o.kind) || (() => o.kind))(o.target || {});
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

    this.updatePeople(p);

    // what they remember: the things that mattered most, strongest first
    const mb = $('ins-memories');
    mb.textContent = '';
    const mems = b.memories.filter((m) => m.w > 0.06).sort((x, y) => y.w * (0.4 + Math.abs(y.v)) - x.w * (0.4 + Math.abs(x.v))).slice(0, 6);
    for (const m of mems) {
      const row = document.createElement('div');
      row.className = 'memory' + (m.v < -0.2 ? ' bad' : m.v > 0.2 ? ' good' : '') + (m.w < 0.25 ? ' faint' : '');
      const ago = document.createElement('i');
      ago.textContent = fmtAgo(this.sb.time - m.t);
      row.append(ago, document.createTextNode(b.memoryText(m)));
      mb.appendChild(row);
    }
    if (!mems.length) {
      const row = document.createElement('div');
      row.className = 'thought';
      row.textContent = 'Nothing worth remembering yet.';
      mb.appendChild(row);
    }
  }

  /**
   * The inspector for something with no mind (a mod's boss): what it is doing,
   * what its species has to say about it - bars and lines - and its body.
   */
  updateMindless(p) {
    const $ = this.$, sp = p.species || {};
    const info = sp.inspect ? sp.inspect(p) : { mood: '', doing: '', bars: [], lines: [] };
    $('ins-mood').textContent = info.mood || '';
    $('ins-mood').classList.toggle('dead', !!info.dead);
    $('ins-doing').textContent = info.doing || '';
    $('ins-order').classList.add('hidden');
    const box = $('ins-boss');
    box.classList.remove('hidden');
    box.textContent = '';
    for (const bar of info.bars || []) {
      const row = document.createElement('div');
      row.className = 'boss-meter';
      const l = document.createElement('span');
      l.textContent = bar.label;
      const track = document.createElement('div');
      track.className = 'bar';
      const fill = document.createElement('div');
      fill.className = 'fill';
      fill.style.width = (clamp(bar.frac, 0, 1) * 100).toFixed(1) + '%';
      fill.style.background = bar.color || '#b23cd1';
      track.appendChild(fill);
      const v = document.createElement('b');
      v.textContent = bar.text || '';
      row.append(l, track, v);
      box.appendChild(row);
    }
    const cb = $('ins-conds');
    cb.textContent = '';
    for (const line of info.lines || []) {
      const s = document.createElement('div');
      s.className = line.bad ? 'bad' : line.good ? 'ok' : '';
      s.textContent = line.text;
      cb.appendChild(s);
    }
    this.updateAbilities(p);
    $('ins-heal').disabled = !!info.dead;
  }

  /* ------------------------------ a thing's panel ----------------------------- */

  bindPanel() {
    const $ = this.$;
    $('panel-close').addEventListener('click', () => this.closePanel());
    $('thing-panel').addEventListener('click', (e) => { if (e.target.id === 'thing-panel') this.closePanel(); });
  }

  /** Something in the world with more to show than its name: its panel (a crafting table's grid). */
  openPanel(thing) {
    this.panelThing = thing;
    this.gestures.reset();
    this.$('thing-panel').classList.remove('hidden');
    this.refreshPanel(true);
  }

  closePanel() {
    this.panelThing = null;
    this.$('thing-panel').classList.add('hidden');
  }

  refreshPanel(rebuild = false) {
    const t = this.panelThing;
    if (!t) return;
    if (t.removed) { this.closePanel(); return; }
    const p = t.panel(this.sb);
    const $ = this.$;
    $('panel-title').textContent = p.title || t.name;
    const cv = $('panel-canvas');
    if (p.draw) {
      cv.classList.remove('hidden');
      const ctx = cv.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      p.draw(ctx, cv.width, cv.height);
    } else cv.classList.add('hidden');
    $('panel-text').textContent = '';
    for (const line of p.text || []) {
      const d = document.createElement('div');
      d.textContent = line;
      $('panel-text').appendChild(d);
    }
    const bb = $('panel-buttons');
    const ids = (p.buttons || []).map((b) => b.id).join(',');
    if (rebuild || bb.dataset.ids !== ids) {
      bb.textContent = '';
      bb.dataset.ids = ids;
      for (const b of p.buttons || []) {
        const btn = document.createElement('button');
        btn.className = 'panel-btn';
        btn.dataset.id = b.id;
        btn.addEventListener('click', () => this.pressPanel(b.id));
        bb.appendChild(btn);
      }
    }
    for (const b of p.buttons || []) {
      const btn = bb.querySelector(`[data-id="${b.id}"]`);
      btn.textContent = b.label;
      btn.disabled = b.enabled === false;
      btn.classList.toggle('primary', !!b.primary);
    }
  }

  pressPanel(id) {
    const t = this.panelThing;
    if (!t || !t.panelPress) return;
    const r = t.panelPress(id, this.sb) || {};
    if (r.say) this.toast(r.say, 3);
    if (r.close) this.closePanel();
    else this.refreshPanel();
  }

  /* -------------------------- bosses and world buttons ------------------------- */

  /** A bar along the top for each boss in the world, and while one is on its way. */
  updateBossbars() {
    const sb = this.sb, box = this.$('bossbars');
    const want = [];
    for (const p of sb.people) if (!p.removed && p.species && p.species.bossbar) { const b = p.species.bossbar(p); if (b) want.push([p, b]); }
    for (const it of sb.items) if (!it.removed && it.bossbar) { const b = it.bossbar(); if (b) want.push([it, b]); }
    const live = new Set(want.map(([k]) => k));
    this.$('hud').classList.toggle('has-boss', want.length > 0);
    for (const [k, el] of this.bars) if (!live.has(k)) { el.root.remove(); this.bars.delete(k); }
    for (const [k, b] of want) {
      let el = this.bars.get(k);
      if (!el) {
        const root = document.createElement('div');
        root.className = 'bossbar';
        const name = document.createElement('div');
        name.className = 'boss-name';
        const track = document.createElement('div');
        track.className = 'boss-track';
        const fill = document.createElement('div');
        fill.className = 'boss-fill';
        track.appendChild(fill);
        root.append(name, track);
        box.appendChild(root);
        el = { root, name, fill, track };
        this.bars.set(k, el);
      }
      el.name.textContent = b.name + (b.note ? ` - ${b.note}` : '');
      el.fill.style.width = (clamp(b.frac, 0, 1) * 100).toFixed(2) + '%';
      el.fill.style.background = b.color || '#b23cd1';
      el.track.classList.toggle('armored', !!b.armored);
      el.root.title = b.text || '';
    }
  }

  /** Buttons that sit above things in the world (ACTIVATE, over a totem), kept where the thing is. */
  updateWorldButtons() {
    const sb = this.sb, box = this.$('world-buttons'), cam = this.cam;
    const live = new Set();
    for (const it of sb.items) {
      if (it.removed || !it.button) continue;
      const b = it.button(sb);
      if (!b) continue;
      live.add(it);
      let el = this.worldBtns.get(it);
      if (!el) {
        el = document.createElement('button');
        el.className = 'world-btn';
        el.addEventListener('click', () => {
          const said = it.press(sb);
          if (said) this.toast(said, 2.6);
        });
        box.appendChild(el);
        this.worldBtns.set(it, el);
      }
      const at = it.buttonAt ? it.buttonAt() : { x: it.pos.x, y: it.pos.y + 1 };
      const s = cam.toScreen(at.x, at.y);
      el.textContent = b.label;
      el.disabled = b.enabled === false;
      el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
      el.style.display = s.x < -60 || s.x > cam.w + 60 || s.y < -40 || s.y > cam.h + 40 ? 'none' : '';
    }
    for (const [it, el] of this.worldBtns) if (!live.has(it)) { el.remove(); this.worldBtns.delete(it); }
  }

  /**
   * Buttons for whatever a mod's people can do that nobody else can (their
   * species says what): made once for whoever is selected, then only lit up
   * and greyed out as things change, so a tap is never lost to a refresh.
   */
  updateAbilities(p) {
    const wrap = this.$('ins-abil-wrap');
    const list = p.species && p.species.abilities ? p.species.abilities(p) : null;
    wrap.classList.toggle('hidden', !list || !list.length);
    if (!list || !list.length) { this.abil = null; return; }
    const ids = list.map((a) => a.id).join(',');
    if (!this.abil || this.abil.who !== p || this.abil.ids !== ids) {
      const box = this.$('ins-abilities');
      box.textContent = '';
      this.abil = { who: p, ids, btns: new Map(), defs: new Map() };
      const rows = {};
      for (const a of list) {
        let row = rows[a.group];
        if (!row) {
          row = rows[a.group] = document.createElement('div');
          row.className = 'abil-row';
          const t = document.createElement('span');
          t.className = 'abil-title';
          t.textContent = ABILITY_ROWS[a.group] || a.group;
          row.appendChild(t);
          box.appendChild(row);
        }
        const btn = document.createElement('button');
        btn.className = 'abil-btn';
        btn.dataset.ability = a.id;
        btn.textContent = a.label;
        btn.addEventListener('click', () => this.useAbility(a.id));
        row.appendChild(btn);
        this.abil.btns.set(a.id, btn);
      }
    }
    const off = p.dead || !p.conscious;
    for (const a of list) {
      const btn = this.abil.btns.get(a.id);
      btn.classList.toggle('on', !!a.on);
      btn.disabled = off;
      btn.setAttribute('aria-pressed', a.on ? 'true' : 'false');
      this.abil.defs.set(a.id, a);
    }
  }

  useAbility(id) {
    const p = this.selected, ab = this.abil;
    if (!p || !ab || ab.who !== p || p.dead || !p.conscious) return;
    const a = ab.defs.get(id);
    if (!a) return;
    const done = a.pick();
    if (a.group === 'hands') {
      this.toast(id === 'auto' ? `${p.name} picks their own hands again` : id === 'hands' ? `${p.name} keeps their hands as hands`
        : `${p.name}: ${a.label.toLowerCase()} for hands`);
    } else this.toast(done === false ? `${p.name} can't do that right now` : `${p.name}: ${a.label.toLowerCase()}!`);
    this.insT = 0;
  }

  /**
   * Everyone else in the sandbox, under what the selected person thinks of
   * them. Rows stay put between refreshes and only move group when what they
   * think changes - never while their menu is open.
   */
  updatePeople(p) {
    const b = p.brain;
    const seen = new Set();
    for (const o of this.sb.people) {
      if (o === p || o.removed) continue;
      seen.add(o);
      let e = this.rows.get(o);
      if (!e) { e = this.personRow(o); this.rows.set(o, e); }
      const r = b.rels.get(o);
      const cat = relCategory(r);
      const busy = document.activeElement === e.sel;
      if (cat !== e.cat && !busy) {
        // in name order within the group
        const list = this.groups[cat].list;
        let before = null;
        for (const c of list.children) if (c.dataset.name.localeCompare(o.name) > 0) { before = c; break; }
        list.insertBefore(e.row, before);
        e.cat = cat;
      }
      const [cls, text] = relTag(r, o, p);
      e.tag.className = 'tag ' + cls;
      e.tag.textContent = text;
      if (!busy) e.sel.value = cat;
      e.sel.disabled = p.dead;
      e.sel.setAttribute('aria-label', `What ${p.name} thinks of ${o.name}`);
      const ordered = !!(b.ordered && b.ordered.target === o);
      e.fight.textContent = ordered ? 'Stop' : 'Fight';
      e.fight.classList.toggle('on', ordered);
      e.fight.disabled = p.dead || (o.dead && !ordered);
      e.fight.setAttribute('aria-label', ordered ? `Call ${p.name} off ${o.name}` : `Send ${p.name} to fight ${o.name}`);
    }
    for (const [o, e] of this.rows) if (!seen.has(o)) { e.row.remove(); this.rows.delete(o); }
    for (const [key] of GROUPS) {
      const g = this.groups[key];
      const n = g.list.children.length;
      g.count.textContent = n ? String(n) : '';
      g.none.style.display = n ? 'none' : '';
      if (key === 'stranger') g.g.style.display = n ? '' : 'none';
    }
  }

  personRow(o) {
    const row = document.createElement('div');
    row.className = 'person';
    row.dataset.name = o.name;
    const who = document.createElement('span');
    who.className = 'who';
    const n = document.createElement('b');
    n.textContent = o.name;
    const tag = document.createElement('span');
    who.append(n, tag);
    const sel = document.createElement('select');
    const never = new Option('Stranger', 'stranger');
    never.disabled = true;
    sel.add(never);
    for (const [v, t] of REL_CHOICES) sel.add(new Option(t, v));
    sel.addEventListener('change', () => {
      const p = this.selected;
      if (!p || !p.brain || p.dead) return;
      p.brain.setRelation(o, sel.value);
      this.toast(REL_SAID[sel.value](p.name, o.name));
      sel.blur();
      this.insT = 0;
    });
    const fight = document.createElement('button');
    fight.className = 'mini-btn fight';
    fight.textContent = 'Fight';
    fight.addEventListener('click', () => this.orderFight(o));
    row.append(who, sel, fight);
    return { row, tag, sel, fight, cat: null };
  }

  /** Sends the selected person after `o` - or, if that is who they were already sent after, calls them off. */
  orderFight(o) {
    const p = this.selected;
    if (!p || !p.brain) return;
    const b = p.brain;
    if (b.ordered && b.ordered.target === o) {
      b.standDown();
      this.toast(`${p.name} leaves ${o.name} alone`);
    } else if (p.dead) this.toast(`${p.name} is dead`);
    else if (o.dead) this.toast(`${o.name} is already dead`);
    else if (b.order('fight', o)) {
      this.toast(p.conscious && p.state === 'stand' ? `${p.name} goes after ${o.name}` : `${p.name} will go after ${o.name} once they are back on their feet`);
    }
    this.insT = 0;
  }

  /**
   * An X-ray of them: every bone, white while it is sound, warming to yellow
   * and red as the part around it takes damage, and broken bones drawn
   * snapped, in red. Whatever has been cut off is not there, joints out of
   * their sockets are ringed in purple, and the bullets still in them show
   * up as little gold dots.
   */
  drawFigure(p) {
    const cv = this.$('ins-figure');
    const ctx = cv.getContext('2d');
    const h = p.health;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const part = (k) => h.parts[k];
    const col = (bone, partKey) => {
      if (h.frozen) return '#a9dcff';
      if (p.flames && (p.flames.parts[partKey] || 0) > 0.1) return '#ff8a2a';
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
    const S = h.severed;
    // cut off halfway along: the half that is left, ending in a red stump
    const half = (a, b, c, w) => {
      const mx = (j[a].x + j[b].x) / 2, my = (j[a].y + j[b].y) / 2;
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(j[a].x, j[a].y); ctx.lineTo(mx, my); ctx.stroke();
      ctx.fillStyle = '#ff4a3d';
      ctx.beginPath(); ctx.arc(mx, my, w * 0.75, 0, Math.PI * 2); ctx.fill();
    };
    // legs and arms
    for (const side of ['B', 'A']) {
      const leg = 'leg' + side, arm = 'arm' + side;
      if (S['femur' + side]) half('hip', 'knee' + side, col('femur' + side, leg), 0.075);
      else {
        bone('hip', 'knee' + side, col('femur' + side, leg), 0.075, B('femur' + side));
        if (S['tibia' + side]) half('knee' + side, 'foot' + side, col('tibia' + side, leg), 0.065);
        else {
          bone('knee' + side, 'foot' + side, col('tibia' + side, leg), 0.065, B('tibia' + side));
          bone('foot' + side, 'toe' + side, col('tibia' + side, leg), 0.05);
        }
      }
      if (S['humerus' + side]) half('shoulder', 'elbow' + side, col('humerus' + side, arm), 0.065);
      else {
        bone('shoulder', 'elbow' + side, col('humerus' + side, arm), 0.065, B('humerus' + side));
        if (S['forearm' + side]) half('elbow' + side, 'hand' + side, col('forearm' + side, arm), 0.055);
        else bone('elbow' + side, 'hand' + side, col('forearm' + side, arm), 0.055, B('forearm' + side));
      }
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
    // joints out of their sockets
    ctx.strokeStyle = '#c77dff';
    ctx.lineWidth = 0.025;
    for (const [jn, out] of Object.entries(h.dislocated)) {
      if (!out) continue;
      const at = j[jn.startsWith('shoulder') ? 'shoulder' : jn];
      if (!at) continue;
      ctx.beginPath(); ctx.arc(at.x + (jn.startsWith('shoulder') ? (jn.endsWith('A') ? 0.05 : -0.05) : 0), at.y, 0.06, 0, Math.PI * 2); ctx.stroke();
    }
    // the bullets still in them, spread along the bone they stopped in
    ctx.fillStyle = '#ffd166';
    const per = {};
    for (const bn of h.bullets) {
      const ends = XRAY_BONE[bn];
      if (!ends) continue;
      const i = per[bn] = (per[bn] || 0) + 1;
      const t = ends[0] === ends[1] ? 0 : 0.3 + ((i * 0.27) % 0.45);
      const x = j[ends[0]].x + (j[ends[1]].x - j[ends[0]].x) * t + (ends[0] === ends[1] ? (i - 1) * 0.04 : 0);
      const y = j[ends[0]].y + (j[ends[1]].y - j[ends[0]].y) * t;
      ctx.beginPath(); ctx.arc(x, y, 0.028, 0, Math.PI * 2); ctx.fill();
    }
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
      if (e.key === 'Escape' && this.mods.isOpen) { this.mods.close(); return; }
      if (!this.started || this.mods.isOpen || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const k = e.key;
      if (k >= '1' && k <= '6') { this.setSpawnKind(KEYS[+k - 1]); this.setTool('spawn'); }
      else if (k >= '7' && k <= '9') {
        const sp = modSpawnables()[+k - 7];
        if (sp) { this.setSpawnKind(sp.kind); this.setTool('spawn'); }
      }
      else if (k === 'h' || k === 'H') this.setTool('hand');
      else if (k === 'z' || k === 'Z') this.setTool('freeze');
      else if (k === 'w' || k === 'W') this.setTool('wire');
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
        if (this.wireStart) { this.wireStart = null; this.wireEnd = null; this.wireHint(); }
        else if (this.panelThing) this.closePanel();
        else if (this.$('drawer').classList.contains('open')) this.toggleDrawer(false);
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
    this.updateBossbars();
    this.updateWorldButtons();
    if (this.panelThing && (this.panelT -= dt) <= 0) { this.panelT = 0.25; this.refreshPanel(); }
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
      const k = this.spawnKind;
      const mod = KINDS[k] ? null : findSpawnable(k);
      const box = AMMO_KEYS[k] ? AMMO_BOXES[AMMO_KEYS[k]] : null;
      const stands = k === 'stickman' || k === 'officer' || (mod && mod.living) || WALLS[k] || k === 'tree' || k === 'bush' || k === 'gallows';
      const y = stands ? this.sb.surfaceBelow(w.x, 0.15, WALLS[k] || k === 'tree' || k === 'bush' || k === 'gallows' ? w.y + 0.02 : 100).y
        : Math.max(w.y, k === 'crate' ? 0.39 : k === 'knife' ? 0.03 : k === 'machete' || k === 'crowbar' ? 0.05 : k === 'glock' || k === 'm1911' || k === 'taser' ? 0.08 : k === 'ak47' || k === 'mossberg' ? 0.14 : box ? box.h / 2 : 0.04);
      ghost = { kind: box ? 'ammo' : this.spawnKind, size: box ? AMMO_KEYS[k] : null, x: k === 'gallows' ? w.x - 1 : w.x, y, draw: mod && mod.ghost ? mod.ghost : null };
    }
    // a wire being put in: from its first end to the pointer (or, a pin, where it would go)
    let wire = null;
    if (this.tool === 'wire') {
      const at = this.wireEnd || (this.hover ? this.world(this.hover.x, this.hover.y) : null);
      if (this.wireStart && at) wire = { type: this.wireKind, x0: this.wireStart.x, y0: this.wireStart.y, x1: at.x, y1: at.y };
      else if (WIRES[this.wireKind].pin && at) wire = { type: this.wireKind, x0: at.x, y0: at.y, x1: at.x, y1: at.y };
    }
    return {
      selected: this.selected,
      ghost,
      wire,
      hand: { active: this.hand.active, x: this.hand.x, y: this.hand.y },
    };
  }
}

/** "a Crate" - or just "Uzi", for somebody with a name of their own. */
function placeName(info) {
  return info.proper ? info.name : (info.an ? 'an ' : 'a ') + info.name;
}

/** A word on how it stands with someone, beyond which group they are in. */
function relTag(r, o, p) {
  if (o.dead) return ['dead', 'Dead'];
  if (p.brain && p.brain.fightTarget === o) return ['enemy', 'Fighting'];
  if (!r) return ['', ''];
  if (r.fear > 0.4) return ['afraid', 'Afraid of'];
  if (r.anger > 0.45) return ['enemy', 'Angry at'];
  return ['', ''];
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
