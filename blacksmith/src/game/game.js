/* =============================================================================
   The game: two places, one smith, and everything that happens between them.

     The Meadow  - the stone circle you start on, the Forge, the cave mouth
     The Cave    - the ring-shaped room: rocks to mine, three skeletons, Rob

   Walking into the cave mouth takes you inside; walking back out of the
   tunnel brings you home. The anvil borrows the camera for a close-up and
   runs the forging - the pour, the hammer, the quench - before it hands you
   what you made. Rob gives you his bounty and sells you his pickaxe. And
   all of it is written to the save as it happens.
   ========================================================================== */
import {
  PerspectiveCamera, WebGLRenderer, SRGBColorSpace, ACESFilmicToneMapping, PCFShadowMap, PCFSoftShadowMap,
  Raycaster, Vector2, Vector3, Group, Mesh, BoxGeometry, SphereGeometry, Color,
} from 'three';
import { buildOverworld, OW } from './overworld.js';
import { buildCave, CV } from './cave.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { Effects } from './fx.js';
import { RockField } from './rocks.js';
import { SkeletonPack } from './skeletons.js';
import { Rob } from './rob.js';
import { sfx } from './sfx.js';
import { updateOreMaterials, hotMetalMaterial, oreMaterial } from './materials.js';
import { buildWeapon } from './gear.js';
import { ORES, RARITIES, QUEST, PICKAXES, recipe, itemName, itemRarity, partsOf } from './data.js';
import { writeSave } from './save.js';
import { robPortrait, itemIcon } from '../ui/icons.js';
import { yieldToPaint, clamp, clamp01, lerp, smoothstep, easeOutCubic, IS_TOUCH, money } from '../core/util.js';

export const QUALITY = {
  low: { name: 'low', shadows: false, shadowMap: 512, pixelRatio: 1.0, tufts: 0, caveLights: 3, antialias: false },
  medium: { name: 'medium', shadows: true, shadowMap: 1024, pixelRatio: 1.5, tufts: 500, caveLights: 5, antialias: false },
  high: { name: 'high', shadows: true, shadowMap: 2048, pixelRatio: 2, tufts: 1400, caveLights: 10, antialias: true },
};

const NO_INPUT = { move: { x: 0, y: 0 }, pressed: {}, down: {}, sprint: false };

/** The forging, in seconds from the moment you press FORGE. */
const CRAFT = { pourEnd: 1.15, toAnvil: 1.4, hammer: [1.55, 2.0, 2.45], quench: 2.95, dunk: 3.2, reveal: 3.45, done: 3.75 };

export class Game {
  constructor({ viewport, settings, profile, hud, inventory, forgeUI, shopUI, dialogue, input }) {
    this.viewport = viewport;
    this.settings = settings;
    this.profile = profile;
    this.hud = hud;
    this.inv = inventory;
    this.forgeUI = forgeUI;
    this.shopUI = shopUI;
    this.dlg = dialogue;
    this.input = input;
    const q = QUALITY[settings.quality] || QUALITY.medium;
    this.quality = { ...q, shadows: q.shadows && !!settings.shadows };

    this.camera = new PerspectiveCamera(60, 1, 0.08, 900);
    this.renderer = new WebGLRenderer({ antialias: q.antialias, powerPreference: 'high-performance' });
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    this.pixelRatio = this.basePixelRatio;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    if (this.quality.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = q.name === 'high' ? PCFSoftShadowMap : PCFShadowMap;
    }
    viewport.appendChild(this.renderer.domElement);
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();

    this.camRig = new CameraRig(this.camera);
    this.raycaster = new Raycaster();
    this.mode = 'play';           // play, forge, shop, talk, menu, dead, travel
    this.time = 0;
    this.area = null;
    this.craft = null;
    this._tap = null;
    this._click = false;
    this._dirty = false;
    this._sinceSave = 0;
    this._frameAvg = 1 / 60;
    this._slowFor = 0;
    this._fastFor = 0;
    this.stats = { fps: 60 };
    this.running = false;
    this._unsub = profile.onChange(() => { this._dirty = true; });
  }

  resize() {
    const w = this.viewport.clientWidth || window.innerWidth;
    const h = this.viewport.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // a wide landscape screen sees plenty sideways; a squarer one needs more
    this.camera.fov = w / h > 1.6 ? 58 : 66;
    this.camera.updateProjectionMatrix();
  }

  /* ---------------------------------- load --------------------------------- */

  async load(progress) {
    progress(0.04, 'Laying the stone circle');
    await yieldToPaint();
    this.areas = { overworld: buildOverworld({ quality: this.quality }) };
    progress(0.4, 'Lighting the forge');
    await yieldToPaint();
    this.areas.cave = buildCave({ quality: this.quality });
    progress(0.62, 'Digging out the cave');
    await yieldToPaint();
    const cave = this.areas.cave;
    this.fx = new Effects(this.areas.overworld.scene, this.camera, document.querySelector('#floaters'));
    this.rocks = new RockField({ scene: cave.scene, collider: cave.collider, spots: cave.rockSpots, fx: this.fx });
    this.rocks.populate();
    this.skeletons = new SkeletonPack({ scene: cave.scene, collider: cave.collider, spots: cave.skeletonSpots, fx: this.fx, inCamp: cave.inCamp });
    this.skeletons.populate();
    this.rob = new Rob(cave.scene);
    progress(0.78, 'Waking the skeletons');
    await yieldToPaint();
    this.player = new Player(this.profile);
    this.player.onExhausted = () => this.input?.setSprint(false);
    this._world = {
      collider: null, ground: null, camYaw: 0,
      pickTarget: (pl) => this._pickTarget(pl),
      impact: (pl, s) => this._impact(pl, s),
      onSwing: (pl, s) => sfx.play(s.kind === 'heavy' ? 'heavy' : 'swing'),
      onDash: () => sfx.play('dash'),
      onTired: () => this.hud.toast('Too tired to dash', 1000),
    };
    this._skHooks = {
      playerAlive: () => !this.player.dead,
      hitPlayer: (dmg, from) => this._hurtPlayer(dmg, from),
      onDeath: (s, at) => this._skeletonGone(s, at),
    };
    progress(0.9, 'Tying on your apron');
    await yieldToPaint();
    // Compile every shader now, so the first trip into the cave does not stutter.
    for (const a of Object.values(this.areas)) {
      a.scene.add(this.player.group);
      this.renderer.compile(a.scene, this.camera);
      a.scene.remove(this.player.group);
    }
    progress(1, 'Ready');
  }

  /** Puts you where the save says you were, or on the stone circle. */
  begin() {
    const P = this.profile;
    const area = this.areas[P.where] || this.areas.overworld;
    const s = area.spawn;
    const pose = P.pos ? { x: P.pos[0], z: P.pos[1], yaw: P.yaw ?? s.yaw } : { x: s.x, z: s.z, yaw: s.yaw };
    this.enter(area.id, pose, true);
    this._refreshWallTags();
    this.running = true;
  }

  /** Straight into an area, no fade. */
  enter(id, pose, banner = true) {
    const area = this.areas[id];
    if (this.area) this.area.scene.remove(this.player.group);
    this.area = area;
    area.scene.add(this.player.group);
    this.fx.moveTo(area.scene);
    this.player.teleport(pose.x, pose.z, pose.yaw, area.ground(pose.x, pose.z));
    area.collider.resolve(this.player.pos, this.player.radius);
    this.player.group.position.copy(this.player.pos);
    this.camRig.snapBehind(this.player.pos, this.player.yaw);
    this.profile.where = id;
    this._world.collider = area.collider;
    this._world.ground = area.ground;
    if (banner) this.hud.areaBanner(area.name, area.sub);
    this.hud.setInteract(null);
    if (id === 'cave') this._hint('hintCave', 'Hold ATTACK by a pebble or a rock to mine it. Rob is just to your right.', 4200, 2600);
  }

  /** A word of advice, once per smith, a moment after `delay` ms. */
  _hint(key, text, ms = 3600, delay = 0) {
    const met = this.profile.met;
    if (met[key]) return;
    met[key] = true;
    this._dirty = true;
    setTimeout(() => this.hud.toast(text, ms), delay);
  }

  /** Through a fade to black. */
  async travel(id, pose) {
    if (this.mode === 'travel') return;
    this.mode = 'travel';
    this.input?.reset();
    const fade = document.querySelector('#fade');
    fade.classList.add('on');
    await wait(360);
    this.enter(id, pose);
    this.save();
    await wait(80);
    fade.classList.remove('on');
    this.mode = 'play';
  }

  /* --------------------------------- frame --------------------------------- */

  update(dt, input) {
    if (!this.running) return;
    this.time += dt;
    this.profile.stats.playTime += dt;
    updateOreMaterials(this.time);
    const look = input.consumeLook();
    const area = this.area;
    const p = this.player;
    const playing = this.mode === 'play';

    area.update(dt, this.time, { player: p.pos, camera: this.camera, fx: this.fx });
    if (area.id === 'cave' && this.mode !== 'menu') {
      this.rocks.update(dt, p.pos);
      if (this.mode !== 'talk') this.skeletons.update(dt, p, this._skHooks);
      this.rob.update(dt, p.pos, this.questState());
    }

    if (this.mode !== 'menu') {
      if (this._click && playing) { input.pressed.attack = true; this._click = false; }
      p.frozen = !playing;
      this._world.camYaw = this.camRig.yaw;
      p.update(dt, playing ? input : NO_INPUT, this._world);
    }
    if (playing) {
      this._interactions(input);
      this._triggers();
    } else {
      // a tap that arrived just as a menu opened belongs to nothing
      this._tap = null;
      this._click = false;
    }
    if (this.mode === 'forge') this._updateForge(dt);
    if (this.mode === 'shop') this._updateShop(dt);

    this.camRig.update(dt, playing || this.mode === 'dead' ? look : null, p, area);
    this.fx.update(dt);
    this._hud();
    this._autosave(dt);
    this._adaptPerformance(dt);
  }

  render() {
    if (!this.area) return;
    this.renderer.render(this.area.scene, this.camera);
  }

  /* ------------------------------ world events ----------------------------- */

  _triggers() {
    const p = this.player.pos;
    if (this.area.id === 'overworld' && this.area.enteringCave(p)) {
      this.travel('cave', CV.entry);
    } else if (this.area.id === 'cave' && this.area.leaving(p)) {
      this.travel('overworld', OW.caveExit);
    }
  }

  _interactions(input) {
    const p = this.player.pos;
    let near = null;
    if (this.area.id === 'overworld' && this.area.nearAnvil(p)) near = 'anvil';
    if (this.area.id === 'overworld' && this.area.nearWall(p)) near = 'wall';
    if (this.area.id === 'cave' && Math.hypot(p.x - this.rob.pos.x, p.z - this.rob.pos.z) < 3.3) near = 'rob';
    this.hud.setInteract({ anvil: 'ANVIL', wall: 'PICKAXES', rob: 'TALK' }[near] || null);
    if (input.pressed.interact && near) this._use(near);
    if (this._tap) {
      const t = this._tap;
      this._tap = null;
      this._tapWorld(t.x, t.y);
    }
  }

  /** A tap on the screen that was not a drag: did it land on the anvil, the pickaxe wall, or Rob? */
  onTap(x, y) {
    if (this.mode === 'forge' && this.craft) { this.skipCraft(); return; }
    if (this.mode === 'shop') { this._tapWall(x, y); return; }
    if (this.mode !== 'play') return;
    this._tap = { x, y };
  }

  _ray(x, y) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster;
  }

  _tapWorld(x, y) {
    const ray = this._ray(x, y);
    // the things a tap can mean, here, and how near you must be for it to count
    const things = this.area.id === 'overworld'
      ? [['anvil', this.area.forge.anvil, new Vector3(OW.anvil.x, 0, OW.anvil.z), 13, 'Walk over to the anvil first'],
        ['wall', this.area.pickWall.hit, new Vector3(OW.wall.x, 0, OW.wall.z), 13, 'Walk over to the pickaxe wall first']]
      : [['rob', this.rob.group, this.rob.pos, 10, 'Walk over to Rob first']];
    let best = null;
    for (const [what, obj, at, reach, far] of things) {
      const hit = ray.intersectObject(obj, true)[0];
      if (hit && (!best || hit.distance < best.d)) best = { what, at, reach, far, d: hit.distance };
    }
    if (best) {
      const d = Math.hypot(best.at.x - this.player.pos.x, best.at.z - this.player.pos.z);
      if (d < best.reach) this._use(best.what);
      else this.hud.toast(best.far);
      return;
    }
    // with a mouse, a click on nothing in particular is a swing
    if (!IS_TOUCH) this._click = true;
  }

  _use(what) {
    if (what === 'anvil') this.openForge();
    else if (what === 'wall') this.openShop();
    else if (what === 'rob') this.talkToRob();
  }

  /* --------------------------------- combat -------------------------------- */

  /** Pickaxe for a rock, weapon for a skeleton: whatever is in front of you. */
  _pickTarget(pl) {
    const weapon = this.profile.weapon();
    if (this.area.id === 'cave') {
      const sk = this.skeletons.nearest(pl.pos, 3.3);
      if (sk) {
        return { tool: weapon ? 'weapon' : 'pickaxe', target: { skeleton: sk }, face: Math.atan2(sk.pos.x - pl.pos.x, sk.pos.z - pl.pos.z) };
      }
      const rock = this.rocks.target(pl.pos, pl.yaw, 2.1);
      if (rock) return { tool: 'pickaxe', target: { rock }, face: Math.atan2(rock.x - pl.pos.x, rock.z - pl.pos.z) };
    }
    return { tool: pl.tool, target: null };
  }

  _impact(pl, s) {
    if (s.tool === 'hammer') { this._hammerBlow(); return; }
    if (this.area.id !== 'cave') return;
    const pk = this.profile.pickaxe();
    if (s.tool === 'pickaxe') {
      let rock = s.target?.rock;
      if (!rock && !s.target?.skeleton) rock = this.rocks.target(pl.pos, pl.yaw, 2.1);
      if (rock && rock.hp > 0) { this._mine(rock, pk, pl); return; }
      const list = this.skeletons.inReach(pl.pos, pl.yaw, 1.9, 120, 1);
      if (list.length) this._strike(list, pk.damage, pl);
      return;
    }
    const w = this.profile.weapon();
    if (!w) return;
    const list = this.skeletons.inReach(pl.pos, pl.yaw, w.reach, w.arc, w.hits);
    if (list.length) this._strike(list, w.damage, pl);
  }

  _mine(rock, pk, pl) {
    const res = this.rocks.hit(rock, pk.mining, pk.tier, pl.pos);
    if (res.result === 'tough') {
      sfx.play('tough');
      this.fx.text(res.at, 'Too hard!', 'nope');
      if (this.time - (this._toughAt ?? -99) > 4) {
        this._toughAt = this.time;
        this.hud.toast(this.profile.hasPickaxe('stone')
          ? 'Equip your Stone Pickaxe to break boulders'
          : 'Boulders need a Stone Pickaxe: $1,000 on the pickaxe wall by the cave mouth', 3000);
      }
      return;
    }
    sfx.play('pick');
    this.camRig.shake(0.035, 0.1);
    this.fx.text(res.at, '-' + res.damage, 'dmg');
    if (res.result === 'broke') {
      sfx.play('break');
      this.profile.stats.mined++;
      res.ores.forEach((ore, i) => this.fx.oreFlyer(ore, res.at, this.player.group, () => this._gotOre(ore), i * 0.09));
    }
  }

  _gotOre(ore) {
    this.profile.addOre(ore, 1);
    this.hud.pickup(ore);
    this._hint('hintOre', 'Ore goes in your bag. Take it to the anvil in the Forge to make something.', 4200, 900);
    const r = RARITIES[ORES[ore].rarity];
    sfx.play('pickup', { rank: r.rank, gap: 0.02 });
    if (r.rank >= 2) {
      this.hud.announce(ORES[ore].name.toUpperCase() + '!', r.name + ' ore', r.color, r.rank >= 4 ? 3600 : 2200);
      sfx.play(r.rank >= 4 ? 'legendary' : 'rare', { rank: r.rank });
      const at = this.player.pos.clone().setY(this.player.pos.y + 1.2);
      this.fx.flare(at, new Color(r.color), r.rank >= 4 ? 3 : 1.6, 0.7);
    }
    this.hud.bumpBag();
  }

  _strike(list, damage, pl) {
    sfx.play('hit');
    this.camRig.shake(0.05, 0.12);
    for (const s of list) {
      const killed = this.skeletons.hit(s, damage, pl.pos);
      this.fx.text(new Vector3(s.pos.x, 2.0, s.pos.z), '-' + damage, 'dmg');
      this.fx.sparks(new Vector3(s.pos.x, 1.25, s.pos.z), 5, { color: new Color('#fff1d0'), speed: 2.5 });
      if (killed) this._killed(s);
    }
  }

  _killed() {
    this.profile.stats.kills++;
    const q = this.profile.quest;
    if (q.active && q.kills < QUEST.kills) {
      q.kills++;
      if (q.kills >= QUEST.kills) {
        this.hud.announce('BOUNTY DONE', 'Go back to Rob and get paid', '#f2c03a', 2600);
        sfx.play('quest');
      } else {
        this.hud.toast(`Skeletons ${q.kills} / ${QUEST.kills}`, 1400);
      }
    }
    this._dirty = true;
  }

  /** It has fallen to bits: sometimes its bones are worth keeping. */
  _skeletonGone(s, at) {
    sfx.play('bones');
    if (Math.random() * ORES.bones.oneIn < 1) {
      this.fx.oreFlyer('bones', at, this.player.group, () => this._gotOre('bones'));
    }
  }

  _hurtPlayer(dmg, from) {
    const got = this.player.takeHit(dmg, from);
    const at = this.player.pos.clone().setY(this.player.pos.y + 2.0);
    if (got < 0) {
      if (!this.player.dead) { this.fx.text(at, 'Dodged!', 'dmg'); sfx.play('dodge'); }
      return;
    }
    this.fx.text(at, '-' + got, 'hurt');
    this.hud.flashDamage(0.45 + got / 30);
    sfx.play('hurt');
    this.camRig.shake(0.1, 0.2);
    if (this.player.dead) this._died();
    else if (this.player.hp < this.profile.maxHp() * 0.35) {
      this._hint('hintHurt', 'Low on health? Back off to Rob\'s camp: skeletons won\'t follow you there.', 4200);
    }
  }

  _died() {
    this.mode = 'dead';
    this.profile.stats.deaths++;
    sfx.play('death');
    this.input?.setSprint(false);
    this.save();
    setTimeout(() => { if (this.mode === 'dead') this.hud.showDeath(); }, 1100);
  }

  /** Back on the stone circle, with everything you had. */
  respawn() {
    if (this.mode !== 'dead') return;
    this.hud.hideDeath();
    this.player.revive();
    this.mode = 'play';
    if (this.area.id !== 'overworld') this.travel('overworld', OW.spawn);
    else { this.enter('overworld', OW.spawn); this.save(); }
  }

  /* --------------------------------- quests -------------------------------- */

  /** What the mark over Rob's head should say. */
  questState() {
    const q = this.profile.quest;
    if (q.active) return q.kills >= QUEST.kills ? 'ready' : 'active';
    return 'offer';
  }

  talkToRob() {
    if (this.mode !== 'play') return;
    this.mode = 'talk';
    this.input?.reset();
    this.hud.setBusy(true);
    this.dlg.open('Rob', robPortrait());
    // the camera comes round to look at him past your shoulder
    const r = this.rob.pos, p = this.player.pos;
    const dx = r.x - p.x, dz = r.z - p.z, d = Math.hypot(dx, dz) || 1;
    const side = new Vector3(-dz / d, 0, dx / d);
    const camPos = new Vector3(p.x - (dx / d) * 2.2 + side.x * 1.1, 2.1, p.z - (dz / d) * 2.2 + side.z * 1.1);
    this.camRig.lend(camPos, new Vector3(r.x, 1.55, r.z), 0.6);
    this.player.yaw = Math.atan2(dx, dz);
    this._robSays();
    sfx.play('ui');
  }

  _robSays(override = null) {
    const P = this.profile, q = P.quest;
    const choices = [];
    let text;
    if (q.active && q.kills >= QUEST.kills) {
      text = 'Ha! That\'s three of \'em back in the ground where they belong. Here - $1,000 and a hundred EXP, like I promised.';
      choices.push({ label: `CLAIM ${money(QUEST.cash)} + ${QUEST.exp} EXP`, primary: true, pick: () => this._claimBounty() });
    } else if (q.active) {
      const left = QUEST.kills - q.kills;
      text = `${left} more skeleton${left === 1 ? '' : 's'} to go. Rattly fellas with wooden daggers - they hang about round the far side of the big wall.`;
    } else if (!P.met.rob) {
      text = `Well now, a smith! Name's Rob. These mines are crawling with skeletons. Kill three of 'em for me and I'll pay you ${money(QUEST.cash)} - and ${QUEST.exp} EXP for the experience.`;
      choices.push({ label: 'KILL 3 SKELETONS', primary: true, pick: () => this._acceptBounty() });
    } else {
      text = q.completed
        ? `Back for more? Same deal as always: three skeletons, ${money(QUEST.cash)} and ${QUEST.exp} EXP.`
        : `Still got work if you want it. Three skeletons, ${money(QUEST.cash)} and ${QUEST.exp} EXP.`;
      choices.push({ label: 'KILL 3 SKELETONS', primary: true, pick: () => this._acceptBounty() });
    }
    choices.push({ label: 'BYE', pick: () => this.closeTalk() });
    this.dlg.say(override || text, choices);
  }

  _acceptBounty() {
    const P = this.profile;
    P.met.rob = true;
    P.quest.active = true;
    P.quest.kills = 0;
    this._dirty = true;
    sfx.play('quest');
    this.hud.toast('Bounty: kill 3 skeletons', 1800);
    this._robSays('Good on you. Three skeletons - I\'ll be right here when you\'re done. Mind those daggers; dash out of the way when they wind up.');
  }

  _claimBounty() {
    const P = this.profile, q = P.quest;
    if (!(q.active && q.kills >= QUEST.kills)) return;
    q.active = false;
    q.kills = 0;
    q.completed++;
    P.addCash(QUEST.cash);
    const levels = P.addExp(QUEST.exp);
    sfx.play('coin');
    this.save();
    if (levels > 0) {
      this.player.refreshGear();
      this.player.hp = P.maxHp();
      setTimeout(() => {
        this.hud.announce('LEVEL UP!', `Level ${P.level} - max HP ${P.maxHp()}`, '#ffd36a', 2800);
        sfx.play('level');
        this.fx.sparks(this.player.pos.clone().setY(this.player.pos.y + 1.4), 24, { color: new Color('#ffd36a'), speed: 3, up: 3 });
      }, 300);
    } else {
      this.hud.announce(`+${money(QUEST.cash)}`, `+${QUEST.exp} EXP`, '#f2c03a', 2000);
    }
    this._robSays(P.hasPickaxe('stone')
      ? `There you are: ${money(QUEST.cash)}. Fancy another go? Those bones don't stay down for long.`
      : `There you are: ${money(QUEST.cash)}. That's just what a Stone Pickaxe costs on the wall outside the cave mouth - the only thing that'll crack a boulder.`);
  }

  closeTalk() {
    if (this.mode !== 'talk') return;
    this.dlg.close();
    this.camRig.giveBack(0.5);
    this.mode = 'play';
    this.hud.setBusy(false);
    this.save();
  }

  /* ------------------------------- the anvil ------------------------------- */

  openForge() {
    if (this.mode !== 'play' || this.area.id !== 'overworld') return;
    this.mode = 'forge';
    this.input?.reset();
    this.input?.setSprint(false);
    this.hud.setBusy(true);
    const A = OW.anvil;
    // you step round behind the anvil, facing out of the forge
    this._walk = { from: this.player.pos.clone(), to: new Vector3(A.x - 0.95, OW.forge.floor, A.z + 0.02), t: 0, yaw0: this.player.yaw, yaw1: Math.PI / 2 };
    this.player.holdHammer(true);
    this._shotK = 0;
    const shot = this._anvilShot(0);
    this.camRig.lend(shot.pos, shot.look, 0.75);
    this.forgeUI.open();
    sfx.play('ui');
  }

  /**
   * The close-up on the anvil. `wide` 0 frames it in the left of the screen,
   * clear of the menu; 1 pulls back to take in the mould and the water too.
   */
  _anvilShot(wide) {
    const top = this.area.forge.anvilTop;
    const hfov = 2 * Math.atan(Math.tan((this.camera.fov * Math.PI / 180) / 2) * this.camera.aspect);
    const D = 2.55;
    // looking west, screen right is north (-z): aim right of the anvil to put it
    // left of centre, in the space the menu leaves clear
    const free = clamp(this.forgeUI.freeFrac, 0.3, 0.7);
    const shift = 0.88 * (1 - free) * D * Math.tan(hfov / 2);
    const tight = { pos: new Vector3(top.x + D, top.y + 1.15, top.z - shift * 0.25), look: new Vector3(top.x - 0.2, top.y - 0.22, top.z - shift) };
    const midZ = (top.z + OW.mold.z) / 2 - 0.35;
    const far = { pos: new Vector3(top.x + 3.25, top.y + 1.3, midZ), look: new Vector3(top.x - 0.3, top.y + 0.05, midZ) };
    const k = smoothstep(wide);
    return {
      pos: new Vector3().lerpVectors(tight.pos, far.pos, k),
      look: new Vector3().lerpVectors(tight.look, far.look, k),
    };
  }

  /** FORGE was pressed: the ore goes in, the item is yours, and then the show. */
  forge(type, mix) {
    if (this.mode !== 'forge' || this.craft) return;
    if (!this.profile.takeOres(mix)) return;
    const R = recipe(type);
    const item = this.profile.addItem({ kind: R.kind, type, mix });
    this.profile.stats.crafted++;
    this.save();
    this.forgeUI.showWorking(true);
    this.craft = { t: 0, item, kind: R.kind, type, hit: 0, mesh: null, steamed: false, shown: false };
    sfx.play('pour');
  }

  skipCraft() {
    if (!this.craft) return;
    this.craft.t = Math.max(this.craft.t, CRAFT.done);
  }

  /** The few steps round to where you work, at the anvil or the wall. */
  _stepWalk(dt) {
    const w = this._walk, p = this.player;
    if (!w || w.t >= 1) return;
    w.t = Math.min(1, w.t + dt / 0.45);
    const k = easeOutCubic(w.t);
    p.pos.lerpVectors(w.from, w.to, k);
    p.yaw = lerpAngle(w.yaw0, w.yaw1, k);
    p.group.position.copy(p.pos);
    p.rig.root.rotation.y = p.yaw;
  }

  _updateForge(dt) {
    const p = this.player;
    this._stepWalk(dt);
    const F = this.area.forge;
    const c = this.craft;
    this._shotK = clamp01(this._shotK + (c && c.t < CRAFT.done ? dt : -dt) * 2.2);
    const shot = this._anvilShot(this._shotK);
    this.camRig.reframe(shot.pos, shot.look);
    if (!c) return;

    c.t += dt;
    const t = c.t;
    // 1. the bucket tips and lava runs into the mould
    const tilt = t < CRAFT.pourEnd ? smoothstep(t / 0.35) * 1.15 : 1.15 * (1 - smoothstep((t - CRAFT.pourEnd) / 0.3));
    F.tipper.rotation.x = tilt;
    const pouring = t > 0.25 && t < CRAFT.pourEnd + 0.05;
    F.stream.visible = pouring;
    if (pouring) {
      F.tipper.updateWorldMatrix(true, false);
      const lip = F.tipper.localToWorld(new Vector3(0, -0.04, 0.21));
      const gantry = F.stream.parent;
      const a = gantry.worldToLocal(lip.clone());
      const bottom = 0.73;
      F.stream.position.set(a.x, (a.y + bottom) / 2, a.z);
      F.stream.scale.set(1, Math.max(0.05, a.y - bottom), 1);
      if (Math.random() < dt * 30) this.fx.sparks(gantry.localToWorld(new Vector3(a.x, bottom + 0.02, a.z)), 1, { speed: 0.8, up: 1.2, life: 0.4, size: 0.05 });
    }
    const fill = smoothstep((t - 0.35) / (CRAFT.pourEnd - 0.35)) * (1 - smoothstep((t - CRAFT.toAnvil) / 0.25));
    F.moldLava.scale.set(Math.max(0.001, fill), Math.max(0.001, fill), 1);
    F.lavaGlow.intensity = 2.5 + (pouring ? 5 : 0);

    // 2. what was cast comes up onto the anvil, glowing
    if (t >= CRAFT.toAnvil && !c.mesh) {
      c.mesh = this._castShape(c);
      F.anvil.parent.add(c.mesh);
      c.mesh.position.copy(F.anvilTop).add(new Vector3(0, 0.035, -0.18));
      this.fx.sparks(F.anvilTop, 10, { speed: 2, up: 2 });
    }
    // 3. the hammer, three times
    if (c.hit < CRAFT.hammer.length && t >= CRAFT.hammer[c.hit]) {
      c.hit++;
      p.swing = { kind: 'chop', t: 0, dur: 0.42, tool: 'hammer', target: null, landed: false, face: Math.PI / 2 };
    }
    // 4. into the water
    if (c.mesh && t >= CRAFT.quench && t < CRAFT.reveal) {
      const k = smoothstep((t - CRAFT.quench) / (CRAFT.dunk - CRAFT.quench));
      const from = F.anvilTop.clone().add(new Vector3(0, 0.035, -0.18));
      const to = F.waterTop.clone().add(new Vector3(0, -0.12, 0));
      c.mesh.position.lerpVectors(from, to, k);
      c.mesh.position.y += Math.sin(k * Math.PI) * 0.45;
      c.mesh.scale.setScalar(lerp(1, 0.7, k));
      if (k >= 1 && !c.steamed) {
        c.steamed = true;
        sfx.play('hiss');
        this.fx.steam(F.waterTop, 18);
        c.mesh.visible = false;
      }
    }
    // 5. out it comes, cooled, in its true colours
    if (t >= CRAFT.reveal && c.mesh && !c.revealed) {
      c.revealed = true;
      this._coolShape(c);
      c.mesh.visible = true;
      c.mesh.scale.setScalar(1);
    }
    if (c.revealed && c.mesh) {
      const k = clamp01((t - CRAFT.reveal) / 0.4);
      c.mesh.position.set(F.anvilTop.x, F.anvilTop.y + 0.25 + easeOutCubic(k) * 0.35, F.anvilTop.z - 0.2);
      c.mesh.rotation.y += dt * 1.6;
    }
    if (t >= CRAFT.done && !c.shown) {
      c.shown = true;
      this._finishCraftVisuals(c, true);
      this.forgeUI.showResult(c.item);
      sfx.play(itemRarity(c.item) === 'legendary' ? 'legendary' : 'quest');
    }
    // the shot stays until the card is put away
    if (c.shown && !this.forgeUI.showingResult) this._endCraft();
  }

  /** What sits on the anvil while it is still hot: the weapon's shape, or a plate. */
  _castShape(c) {
    let g;
    if (c.kind === 'weapon') {
      g = buildWeapon(c.type, partsOf(c.item.mix));
      g.rotation.set(Math.PI / 2, 0, 0);
      g.position.z = 0;
      const holder = new Group();
      g.position.set(0, 0, -0.1);
      holder.add(g);
      g = holder;
    } else {
      g = new Group();
      const parts = c.type === 'helmet' ? [new SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)]
        : c.type === 'chestplate' ? [new BoxGeometry(0.4, 0.06, 0.34)]
          : c.type === 'leggings' ? [new BoxGeometry(0.14, 0.06, 0.42), new BoxGeometry(0.14, 0.06, 0.42)]
            : [new BoxGeometry(0.12, 0.1, 0.22), new BoxGeometry(0.12, 0.1, 0.22)];
      parts.forEach((geo, i) => {
        const m = new Mesh(geo, oreMaterial(partsOf(c.item.mix)[0]));
        m.position.x = parts.length > 1 ? (i - 0.5) * 0.18 : 0;
        g.add(m);
      });
    }
    g.traverse((o) => { if (o.isMesh) { o.userData.cool = o.material; o.material = hotMetalMaterial(); } });
    return g;
  }

  _coolShape(c) {
    c.mesh.traverse((o) => { if (o.isMesh && o.userData.cool) o.material = o.userData.cool; });
  }

  _hammerBlow() {
    const F = this.area.forge;
    sfx.play('clang');
    this.camRig.shake(0.05, 0.12);
    this.fx.sparks(F.anvilTop.clone().add(new Vector3(0, 0.05, -0.1)), 16, { speed: 3.2, up: 2.6, size: 0.06 });
  }

  _finishCraftVisuals(c, keepMesh = false) {
    const F = this.area.forge;
    F.tipper.rotation.x = 0;
    F.stream.visible = false;
    F.moldLava.scale.set(0.001, 0.001, 1);
    F.lavaGlow.intensity = 2.5;
    if (c.mesh) {
      if (!c.revealed) { this._coolShape(c); c.revealed = true; }
      c.mesh.visible = true;
      if (!keepMesh) this._dropMesh(c);
    }
  }

  _dropMesh(c) {
    if (!c.mesh) return;
    c.mesh.removeFromParent();
    c.mesh.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    c.mesh = null;
  }

  _endCraft() {
    const c = this.craft;
    if (!c) return;
    this._finishCraftVisuals(c);
    this._dropMesh(c);
    this.craft = null;
  }

  /** EQUIP on the card. */
  equipForged(uid) { this.equip(uid); }

  closeForge() {
    if (this.mode !== 'forge') return;
    if (this.craft) {
      // walking away mid-forge still leaves you with the thing
      if (!this.craft.shown) this.craft.shown = true;
      this._endCraft();
    }
    this.forgeUI.close();
    this.camRig.giveBack(0.6);
    this.camRig.yaw = this.player.yaw + Math.PI;
    this.player.holdHammer(false);
    this.mode = 'play';
    this.hud.setBusy(false);
    this.save();
  }

  /* ---------------------------- the pickaxe wall ---------------------------- */

  openShop() {
    if (this.mode !== 'play' || this.area.id !== 'overworld') return;
    this.mode = 'shop';
    this.input?.reset();
    this.input?.setSprint(false);
    this.hud.setBusy(true);
    const Wl = this.area.pickWall, at = Wl.standAt;
    // you step off to the wall's left end, so the camera has a clear look at it
    this._walk = {
      from: this.player.pos.clone(), to: new Vector3(at.x, 0, at.z), t: 0, yaw0: this.player.yaw,
      yaw1: Math.atan2(Wl.center.x - at.x, Wl.center.z - at.z),
    };
    this._shopK = 0;
    this._shopType = null;
    const shot = this._wallShot(0, null);
    this.camRig.lend(shot.pos, shot.look, 0.75);
    this.shopUI.open();
    sfx.play('ui');
  }

  /**
   * The camera on the wall: `k` 0 frames the whole wall in the left of the
   * screen, clear of the menu; 1 closes in on the pickaxe `type` while it is
   * down off its pegs being looked at.
   */
  _wallShot(k, type) {
    const Wl = this.area.pickWall;
    const hfov = 2 * Math.atan(Math.tan((this.camera.fov * Math.PI / 180) / 2) * this.camera.aspect);
    const frame = (centre, D, rise) => {
      // looking at the wall's face, screen right is the wall's own right: aim
      // to the right of what is being shown, to put it left of the middle,
      // in the space the menu leaves clear
      const shift = 0.88 * (1 - clamp(this.shopUI.freeFrac, 0.3, 0.7)) * D * Math.tan(hfov / 2);
      return {
        pos: centre.clone().addScaledVector(Wl.normal, D).addScaledVector(Wl.right, shift * 0.2).add(new Vector3(0, rise, 0)),
        look: centre.clone().addScaledVector(Wl.right, shift).add(new Vector3(0, -0.05, 0)),
      };
    };
    const whole = frame(Wl.center, 3.7, 0.45);
    if (!type) return whole;
    const close = frame(Wl.showPoint(type), 2.3, 0.15);
    const e = smoothstep(k);
    return { pos: whole.pos.lerp(close.pos, e), look: whole.look.lerp(close.look, e) };
  }

  _updateShop(dt) {
    this._stepWalk(dt);
    const showing = this.area.pickWall.showing;
    if (showing) this._shopType = showing;
    this._shopK = clamp01(this._shopK + (showing ? dt : -dt) * 2.2);
    const shot = this._wallShot(this._shopK, this._shopType);
    this.camRig.reframe(shot.pos, shot.look);
  }

  /** Takes a pickaxe down off its pegs for a closer look. */
  inspectPickaxe(type) {
    if (this.mode !== 'shop') return;
    this.area.pickWall.showing = type;
  }

  /** In the shop, a tap on a pickaxe on the wall picks that one. */
  _tapWall(x, y) {
    const ray = this._ray(x, y);
    let best = null;
    for (const [type, s] of Object.entries(this.area.pickWall.slots)) {
      const hit = ray.intersectObject(s.pick, true)[0];
      if (hit && (!best || hit.distance < best.d)) best = { type, d: hit.distance };
    }
    if (best) { this.shopUI.select(best.type); sfx.play('ui'); }
  }

  buyPickaxe(type) {
    const P = this.profile, def = PICKAXES[type];
    if (this.mode !== 'shop' || !def || P.hasPickaxe(type)) return;
    if (!P.spend(def.price)) {
      sfx.play('nope');
      this.hud.toast(`That one is ${money(def.price)}. You have ${money(P.cash)}.`, 2200);
      return;
    }
    const it = P.addItem({ kind: 'pickaxe', type });
    this.equip(it.uid);
    this._refreshWallTags();
    sfx.play('coin');
    this.save();
    this.hud.announce(def.name.toUpperCase(), def.tier >= 1 ? 'Boulders can be mined now' : 'It is in your hand', RARITIES[def.rarity].color, 2400);
  }

  equipPickaxe(type) {
    const it = this.profile.itemsOf('pickaxe').find((x) => x.type === type);
    if (it) this.equip(it.uid);
  }

  /** Each tag on the wall says OWNED once that pickaxe is yours. */
  _refreshWallTags() {
    const Wl = this.areas?.overworld?.pickWall;
    if (!Wl) return;
    for (const [type, s] of Object.entries(Wl.slots)) {
      const p = PICKAXES[type];
      if (this.profile.hasPickaxe(type)) s.setTag('OWNED', '#1d5a1d');
      else s.setTag(p.price ? money(p.price) : 'FREE');
    }
  }

  closeShop() {
    if (this.mode !== 'shop') return;
    this.shopUI.close();
    this.area.pickWall.showing = null;
    this.camRig.giveBack(0.6);
    this.camRig.yaw = this.player.yaw + Math.PI;
    this.mode = 'play';
    this.hud.setBusy(false);
    this.save();
  }

  /* ------------------------------- inventory ------------------------------- */

  openInventory() {
    if (this.mode !== 'play') return;
    this.mode = 'menu';
    this.input?.reset();
    this.inv.open();
    sfx.play('ui');
  }

  closeInventory() {
    if (this.mode !== 'menu' || !this.inv.isOpen) return;
    this.inv.close();
    this.mode = 'play';
    this.save();
  }

  equip(uid) {
    const it = this.profile.item(uid);
    if (!it) return;
    this.profile.equip(uid);
    if (it.kind === 'weapon') this.player.tool = 'weapon';
    if (it.kind === 'pickaxe') this.player.tool = 'pickaxe';
    this.player.refreshGear();
    // at the anvil you keep hold of the hammer; the new thing goes on when you leave
    if (this.mode === 'forge') this.player.holdHammer(true);
    sfx.play('ui');
    this.hud.toast(`Equipped ${itemName(it)}`, 1300);
  }

  unequip(slot) {
    if (!this.profile.unequip(slot)) return;
    this.player.refreshGear();
    sfx.play('ui');
  }

  scrap(uid) {
    const it = this.profile.item(uid);
    if (it && this.profile.scrap(uid)) this.hud.toast(`Scrapped ${itemName(it)}`, 1300);
  }

  /* ----------------------------------- HUD --------------------------------- */

  _hud() {
    const p = this.player, P = this.profile;
    this.hud.setVitals(p.hp, P.maxHp(), p.stamina, 100, p.exhausted);
    const L = P.levelInfo();
    this.hud.setLevel(L.level, L.into, L.need);
    this.hud.setCash(P.cash);
    this.hud.setQuest(P.quest.active ? { kills: P.quest.kills, need: QUEST.kills } : null);
    const held = p.heldParts();
    this.hud.setAttackIcon(held ? itemIcon(held.item) : null);
  }

  /* ---------------------------------- save --------------------------------- */

  save() {
    const P = this.profile, p = this.player;
    if (!p || !this.area) return;
    if (p.dead) {
      P.where = 'overworld';
      P.pos = [OW.spawn.x, OW.spawn.z];
      P.yaw = OW.spawn.yaw;
    } else {
      P.where = this.area.id;
      P.pos = [Math.round(p.pos.x * 100) / 100, Math.round(p.pos.z * 100) / 100];
      P.yaw = Math.round(p.yaw * 100) / 100;
    }
    writeSave(P.toJSON());
    this.hud.saved();
    this._dirty = false;
    this._sinceSave = 0;
  }

  _autosave(dt) {
    this._sinceSave += dt;
    if ((this._dirty && this._sinceSave > 2.5) || this._sinceSave > 20) this.save();
  }

  /* ------------------------------ performance ------------------------------ */

  /** Resolution comes down a step at a time while frames run long, and back when there is room. */
  _adaptPerformance(dt) {
    if (!(dt > 0) || dt > 0.5) return;
    this._frameAvg += (dt - this._frameAvg) * 0.05;
    this.stats.fps = Math.round(1 / this._frameAvg);
    if (this._frameAvg > 1 / 42) { this._slowFor += dt; this._fastFor = 0; }
    else if (this._frameAvg < 1 / 56) { this._fastFor += dt; this._slowFor = 0; }
    else { this._slowFor = 0; this._fastFor = 0; }
    const min = Math.max(0.6, this.basePixelRatio * 0.55);
    if (this._slowFor > 2 && this.pixelRatio > min + 0.01) {
      this._slowFor = 0;
      this.pixelRatio = Math.max(min, this.pixelRatio * 0.85);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
    } else if (this._fastFor > 6 && this.pixelRatio < this.basePixelRatio - 0.01) {
      this._fastFor = 0;
      this.pixelRatio = Math.min(this.basePixelRatio, this.pixelRatio * 1.1);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
    }
  }

  dispose() {
    this.running = false;
    window.removeEventListener('resize', this._onResize);
    this._unsub?.();
    if (this.craft) this._endCraft();
    this.fx?.dispose();
    this.rocks?.dispose();
    this.skeletons?.dispose();
    this.rob?.dispose();
    this.player?.dispose();
    for (const a of Object.values(this.areas || {})) a.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
