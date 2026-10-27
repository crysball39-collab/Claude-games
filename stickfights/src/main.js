/* =============================================================================
   STICKFIGHTS - boot and frame loop.

   Behind the title screen a few stickmen are already getting on with their
   lives (and one of them has a grudge). PLAY clears them away and hands you
   an empty sandbox and the spawn menu.
   ========================================================================== */
import { Sandbox } from './game/sandbox.js';
import { Brain } from './game/brain.js';
import { Camera } from './game/camera.js';
import { Renderer } from './game/render.js';
import { Hand } from './game/hand.js';
import { STYLE } from './game/animator.js';
import { Sound } from './core/audio.js';
import { UI } from './ui/ui.js';
import { loadMap } from './game/maps.js';
import { CLIPS } from './game/clips.js';
import { LINES } from './game/lines.js';
import { armOf } from './game/props.js';
import { spawnOfficer } from './game/police.js';
import * as Mods from './mods/index.js';
import * as Vitals from './game/vitals.js';
import * as Wires from './game/wires.js';

const canvas = document.getElementById('view');
const sb = new Sandbox();
sb.makeBrain = (man, traits) => new Brain(man, traits);
const cam = new Camera(sb);
const renderer = new Renderer(canvas, sb, cam);
const hand = new Hand(sb);
sb.hand = hand;
const sound = new Sound();
const ui = new UI({ sb, cam, renderer, hand, sound, canvas });
let started = false;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.resize(w, h, dpr);
  cam.resize(w, h, dpr);
  if (!started) cam.titleView();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

/* --------------------------------- sound ---------------------------------- */

const SCREAMS = new Set(['panic', 'hurtBig', 'flee', 'grabbed', 'grabbedAgain', 'broken', 'shot', 'severedSelf', 'chopped', 'gunshots', 'dislocatedSelf', 'tased', 'onFire']);
sb.on('hit', (e) => {
  // a body frozen solid: whatever hit it, ice cracks
  if (e.who && e.who.health && e.who.health.frozen) sound.iceCrack(e.x);
  if (e.weapon === 'bullet' || e.weapon === 'vestRound') return;   // its own sound, from bulletHit (or vestStop)
  if (armOf(e.weapon)) {
    // a mod's weapon makes its own noise (the mod listens for it); the view still jumps
    if (!e.blocked && (e.power > 1.7 || e.fatal)) cam.shake(Math.min(0.6, 0.15 + e.power * 0.08));
    return;
  }
  if (e.weapon === 'knife') {
    if (e.deep) sound.stab(e.power, e.x); else sound.slash(e.x);
    if (!e.blocked) sound.punch(e.power * 0.35, false, e.x);
  } else if (e.weapon === 'machete') {
    sound.chop(e.power, e.x);
  } else if (e.weapon === 'crowbar') {
    sound.punch(e.power, false, e.x);
    sound.clang(e.power * 0.35, e.x);
  } else if (e.kind === 'impact' && e.object && e.object.kind === 'stickman') {
    sound.punch(e.power * 0.7, false, e.x);
  } else if (e.kind === 'impact') {
    sound.wood(e.power * 3, e.x);
    sound.punch(e.power * 0.6, false, e.x);
  } else {
    sound.punch(e.power, e.armed, e.x, e.blocked);
  }
  if (!e.blocked && (e.power > 1.7 || e.fatal)) cam.shake(Math.min(0.6, 0.15 + e.power * 0.08));
});
sb.on('swing', (e) => {
  if (e.kind === 'slash') sound.slash(e.who.pos.x);
  else sound.whoosh(e.who.pos.x, e.kind === 'cross' || e.kind === 'kick' || e.kind === 'uppercut' || e.kind === 'stab' || e.kind === 'chop' || e.kind === 'hack');
});
sb.on('shot', (e) => {
  if (e.silent) return;   // a gun with a noise of its own (a mod's)
  const heavy = e.heavy || !!(e.gun && e.gun.spec && e.gun.spec.energy > 1.1);
  const kind = e.kind || (e.gun && e.gun.kind);
  if (kind === 'ak47') sound.rifleShot(e.x);
  else if (kind === 'mossberg') sound.shotgun(e.x, !!e.who);
  else sound.gunshot(e.x, heavy);
  // the closer it is to the middle of the view, the more the view jumps
  cam.shake((0.08 + 0.18 / (1 + Math.abs(e.x - cam.x) / 4)) * (heavy ? 1.3 : 1));
});
// the taser, the vest, the holster, the cuffs
sb.on('taserFire', (e) => sound.taserFire(e.x));
sb.on('taserTick', (e) => sound.crackle(e.x));
sb.on('taserArc', (e) => sound.crackle(e.x, true));
sb.on('driveStun', (e) => sound.crackle(e.x, true));
sb.on('probeHit', (e) => sound.stab(0.2, e.x));
sb.on('probeBlocked', (e) => sound.clink(2, e.x));
sb.on('cartOut', (e) => sound.gunClick(e.x, 'magOut'));
sb.on('cartIn', (e) => sound.gunClick(e.x, 'magIn'));
sb.on('vestStop', (e) => { sound.vestStop(e.x); cam.shake(0.1); });
sb.on('vestOn', (e) => sound.velcro(e.x));
sb.on('stow', (e) => sound.holster(e.x));
sb.on('drawWeapon', (e) => sound.holster(e.x, true));
sb.on('cuffed', (e) => sound.cuffs(e.x));
sb.on('uncuffed', (e) => sound.cuffs(e.x, true));
sb.on('radio', (e) => sound.radio(e.x));
sb.on('ammoTaken', (e) => sound.rattle(e.x));
sb.on('knuckleCrack', (e) => sound.knuckleCrack(e.x));
sb.on('stumbleStep', (e) => sound.scuff(e.x, e.speed));
sb.on('stumbleFall', (e) => sound.thud(3 + e.speed, e.x));
sb.on('dryFire', (e) => sound.dryFire(e.x));
sb.on('magOut', (e) => sound.gunClick(e.x, 'magOut'));
sb.on('magIn', (e) => sound.gunClick(e.x, 'magIn'));
sb.on('rack', (e) => sound.gunClick(e.x, 'rack'));
sb.on('casing', (e) => sound.casing(e.x, e.speed));
sb.on('ricochet', (e) => sound.ricochet(e.x));
sb.on('bulletHit', (e) => {
  if (e.material === 'metal') sound.clang(e.energy, e.x);
  else if (e.material === 'glass') sound.tink(e.x, e.energy);
  else if (e.material === 'wood') sound.bulletHit('crate', e.x);
  else sound.bulletHit(e.what ? e.what.kind : null, e.x);
});
sb.on('sever', (e) => { sound.sever(e.x); cam.shake(0.25); });
sb.on('dislocate', (e) => sound.jointPop(e.x));
sb.on('relocate', (e) => sound.jointPop(e.x));
sb.on('faint', (e) => sound.thud(4, e.who.pos.x));
sb.on('throw', (e) => sound.whoosh(e.who.pos.x, true));
sb.on('clatter', (e) => {
  const k = e.what.kind, mat = e.what.mat ? e.what.mat.name : null;
  if (k === 'crate') sound.wood(e.speed, e.x);
  // a piece of wall, a log: by what it is made of, and how heavy it is
  else if (mat === 'metal') sound.clang(e.speed / 6, e.x);
  else if (mat === 'glass') sound.tink(e.x, e.speed / 6);
  else if (mat === 'wood' || k === 'log') { sound.wood(e.speed, e.x); if (e.what.body && e.what.body.mass > 30) sound.thud(e.speed, e.x); }
  else sound.clink(e.speed * (k === 'knife' ? 0.8 : 1), e.x);
  if ((k === 'crate' && e.speed > 9) || (k === 'log' && e.what.body.mass > 60 && e.speed > 4)) cam.shake(k === 'log' ? 0.35 : 0.15);
});
// walls, trees and wires
sb.on('slabBreak', (e) => {
  const mat = e.what.mat.name;
  if (mat === 'metal') sound.clang(1.5, e.x);
  else if (mat === 'glass') sound.tink(e.x, 1.5);
  else if (mat === 'concrete' || mat === 'brick') sound.rubble(e.x, e.cells > 300);
  else sound.splinter(e.x, e.cells > 40);
});
sb.on('slabFree', (e) => {
  const mat = e.what.mat.name;
  if (mat === 'wood') sound.creak(e.x); else if (mat === 'metal') sound.clang(2, e.x); else if (mat === 'concrete' || mat === 'brick') sound.groan(e.x);
});
// a building: a storey giving way, a lump of it landing, a lump pulled off it
sb.on('slabGive', (e) => { sound.groan(e.x); cam.shake(0.25); });
sb.on('rubble', (e) => { sound.rubble(e.x, e.big); cam.shake(e.big ? 0.4 : 0.08); });
sb.on('slabTear', (e) => sound.rubble(e.x, false));
sb.on('limbFall', (e) => { if (e.tree) sound.creak(e.x); else sound.splinter(e.x, e.big); });
sb.on('snapBough', (e) => sound.splinter(e.x, e.big));
sb.on('rustle', (e) => sound.rustle(e.x, e.hard));
sb.on('wire', (e) => sound.tieOn(e.metal, e.pin, e.x));
sb.on('wireSnap', (e) => sound.snapWire(e.metal, e.x));
sb.on('uproot', (e) => { sound.rustle(e.x, true); sound.splinter(e.x, e.kind === 'tree'); });
sb.on('rooted', (e) => { sound.thud(4, e.x); sound.rustle(e.x); });
sb.on('slabStand', (e) => sound.thud(5, e.x));
sb.on('trapdoor', (e) => { sound.trapdoor(e.x, e.open); if (e.open) cam.shake(0.12); });
sb.on('noosed', (e) => { sound.tieOn(false, false, e.x); sound.ropeCreak(e.x); });
sb.on('freezeInPlace', (e) => sound.lockInPlace(true, e.x));
sb.on('unfreeze', (e) => sound.lockInPlace(false, e.x));
sb.on('thud', (e) => sound.thud(e.speed, e.x));
sb.on('collide', (e) => { sound.thud(e.speed * 0.8, e.x); cam.shake(Math.min(0.4, e.speed * 0.025)); });
sb.on('land', (e) => { if (e.speed > 5) sound.thud(e.speed * 0.5, e.who.pos.x); });
sb.on('knock', (e) => {
  if (e.material === 'metal') sound.clang(e.loud ? 1.2 : 0.7, e.x ?? e.who.pos.x);
  else if (e.material === 'glass') sound.tink(e.x ?? e.who.pos.x, 1);
  else sound.wood(e.loud ? 5 : 2.5, e.who.pos.x);
});
sb.on('break', (e) => sound.crack(e.who.pos.x));
sb.on('stuck', (e) => { if (e.into && e.into.kind === 'stickman') sound.stab(1.5, e.x); else sound.thunk(e.x); });
sb.on('pullout', (e) => sound.stab(0.6, e.x));
sb.on('clap', (e) => sound.clap(e.x, e.soft));
sb.on('death', (e) => { if (!e.silent) sound.death(e.who.voice, e.who.pos.x); });
// fire and ice
sb.on('ignite', (e) => sound.ignite(e.x));
sb.on('fireCrackle', (e) => sound.fire(e.power, e.x));
sb.on('extinguish', (e) => {
  if (e.how === 'cooled' || e.how === 'frozen') sound.steamHiss(e.x, true);
  else if (e.how === 'rolled' || e.how === 'smothered' || e.how === 'blown') sound.whoosh(e.x);
});
sb.on('freeze', (e) => sound.freeze(e.x));
sb.on('thaw', (e) => sound.steamHiss(e.x, false));
sb.on('iceSnap', (e) => { sound.iceCrack(e.x, true); cam.shake(0.15); });
sb.on('iceThud', (e) => sound.iceCrack(e.x, e.speed > 8));
sb.on('shatter', (e) => { sound.shatter(e.x); cam.shake(0.4); });
sb.on('glassShatter', (e) => { sound.shatter(e.x); cam.shake(0.2); });
sb.on('gasp', (e) => sound.gasp(e.who.voice, e.x));
sb.on('dropRoll', (e) => sound.thud(4, e.who.pos.x));
sb.on('rollOver', (e) => sound.thud(2.2, e.x));
sb.on('speech', (e) => {
  sound.voice(e.text, e.who.voice, e.loud, e.who.pos.x);
  if (e.loud && SCREAMS.has(e.kind)) sound.scream(e.who.voice, e.who.pos.x);
});

/* ---------------------------------- mods ---------------------------------- */

// every mod hooks itself up now, installed or not, so installing one later needs no reload
Mods.setupMods({ sb, sound, cam });

/* ------------------------------ behind the title -------------------------- */

function demo() {
  sb.clear();
  sb.spawnCrate(2.6, 0.4);
  sb.spawnCrate(2.65, 1.2);
  sb.spawnKnuckles(-2.6, 0.1);
  sb.spawnKnife(5.6, 0.1, 0.3);
  sb.spawnMachete(-6.4, 0.1, 0.1);
  const a = sb.spawnStickman(-4.2, null, { traits: { aggression: 0.85, temper: 0.85, bravery: 0.8 } });
  const b = sb.spawnStickman(-0.8, null, { traits: { sociability: 0.8, empathy: 0.7 } });
  const c = sb.spawnStickman(1.2, null, { traits: { sociability: 0.7, aggression: 0.3 } });
  sb.spawnStickman(4.6, null, { traits: { curiosity: 0.8 } });
  // and an officer on the beat, for when it does
  spawnOfficer(sb, 7.2);
  // a grudge, so something happens while the title is up
  a.brain.rel(c).anger = 0.75;
  a.brain.rel(c).like = -0.5;
  b.brain.rel(c).like = 0.5;
  c.brain.rel(b).like = 0.5;
}
demo();
cam.titleView();

/* ---------------------------------- loop ---------------------------------- */

let last = performance.now();
const failed = new Set();
function frame(now) {
  // (the next frame asked for first: whatever goes wrong in this one, the game goes on)
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  try {
    sb.update(dt);
    cam.update(dt);
    sound.listenX = cam.x;
    sound.span = cam.w / cam.ppm;
    if (started) ui.update(dt);
    renderer.draw(started ? ui.drawState() : {});
  } catch (e) {
    // told once, to whoever has the console open - and the canvas put back the way it was
    if (!failed.has(e.message)) { failed.add(e.message); console.error(e); }
    const ctx = renderer.ctx;
    if (ctx.reset) ctx.reset();
    else { for (let i = 0; i < 64; i++) ctx.restore(); ctx.globalAlpha = 1; }
  }
}
requestAnimationFrame(frame);

function start() {
  if (started) return;
  started = true;
  ui.started = true;
  document.getElementById('title').classList.remove('active');
  document.getElementById('hud').classList.remove('hidden');
  // (the map chosen behind the title, made afresh: the people from the title gone)
  loadMap(sb, sb.map);
  sb.paused = false;
  ui.frameMap();
  sound.unlock();
  ui.toggleDrawer(true);
  // full screen and landscape where the browser allows it; harmless where not
  const el = document.documentElement;
  if (el.requestFullscreen && matchMedia('(pointer: coarse)').matches) {
    el.requestFullscreen().then(() => {
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    }).catch(() => {});
  }
}
document.getElementById('btn-play').addEventListener('click', start);

// for tests and the curious
window.__sf = { sb, cam, ui, hand, sound, renderer, STYLE, start, demo, CLIPS, LINES, mods: Mods, vitals: Vitals, wires: Wires };
