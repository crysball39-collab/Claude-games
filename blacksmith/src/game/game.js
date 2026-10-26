/* =============================================================================
   The game: three places, one smith, and everything that happens between them.

     The Meadow     - the stone circle you start on, the Forge, the cave mouth
     The Cave       - the ring-shaped room: rocks to mine, three skeletons, Rob
     The Deep Mine  - down the hall from the cave: boulders, three elite
                      skeletons in iron, and Jack

   Walking into the cave mouth takes you inside; walking back out of the
   tunnel brings you home. The hall in the cave's north wall goes down to the
   deep mine, and its steps bring you back up. The anvil borrows the camera
   for a close-up and runs the forging - the pour, the hammer, the quench -
   before it hands you what you made. Rob and Jack give out bounties. And all
   of it is written to the save as it happens.
   ========================================================================== */
import {
  PerspectiveCamera, WebGLRenderer, SRGBColorSpace, ACESFilmicToneMapping, PCFShadowMap, PCFSoftShadowMap,
  Raycaster, Vector2, Vector3, Group, Mesh, Box3, Color,
} from 'three';
import { buildOverworld, OW } from './overworld.js';
import { buildCave, CV } from './cave.js';
import { buildDeep, DM } from './deep.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { Effects } from './fx.js';
import { RockField } from './rocks.js';
import { SkeletonPack } from './skeletons.js';
import { makeRob, makeJack } from './rob.js';
import { sfx } from './sfx.js';
import { updateOreMaterials, hotMetalMaterial, oreMaterial } from './materials.js';
import { buildWeapon, buildArmorPlate, outlineGeometry, layInMould } from './gear.js';
import {
  ORES, RARITIES, QUESTS, PICKAXES, SKELETON, ELITE, DEEP_ROCK_COUNTS, HAMMER,
  recipe, itemName, itemRarity, partsOf, strikeGrade, forgeScore, rankOf,
} from './data.js';
import { writeSave } from './save.js';
import { robPortrait, jackPortrait, itemIcon } from '../ui/icons.js';
import {
  yieldToPaint, clamp, clamp01, lerp, smoothstep, easeOutCubic, easeInOutCubic, damp, dampAngle, IS_TOUCH, money,
} from '../core/util.js';

export const QUALITY = {
  low: { name: 'low', shadows: false, shadowMap: 512, pixelRatio: 1.0, tufts: 0, caveLights: 3, antialias: false },
  medium: { name: 'medium', shadows: true, shadowMap: 1024, pixelRatio: 1.5, tufts: 500, caveLights: 5, antialias: false },
  high: { name: 'high', shadows: true, shadowMap: 2048, pixelRatio: 2, tufts: 1400, caveLights: 10, antialias: true },
};

const NO_INPUT = { move: { x: 0, y: 0 }, pressed: {}, down: {}, sprint: false };

/**
 * The forging game: how far the bucket tips, how fast the mould fills, and
 * how long the parts that play themselves take, in seconds.
 */
const CRAFT = {
  tilt: 1.15,             // the bucket, tipped all the way
  pour: 0.55,             // of the mould filled in a second, with the chain pulled all the way down
  settle: 0.5,            // the bucket swinging back once the mould is full
  lift: 0.3, carry: 0.6,  // the cast up out of the mould, then over onto the anvil
  firstRing: 0.5,         // on the anvil, before the first white ring
  ranked: 1.4,            // the rank on show, before the quench
  toWater: 0.7,           // carried over the water
  dipped: 0.85,           // how far down the handle must come for the gear to go in
  cool: 1.6,              // in the water
  out: 0.5,               // lifted back out
  reveal: 0.7,            // up and turning, before the card
};
/** The steps of the forging that happen over the water. */
const AT_WATER = new Set(['quench', 'cool', 'out', 'reveal', 'done']);
const HOT_METAL = new Color(0xffa040);
const SPLASH = new Color('#cfe8ff');

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
    // the lava in the mould is drawn only as far as it has spread
    this.renderer.localClippingEnabled = true;
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
    progress(0.56, 'Digging out the cave');
    await yieldToPaint();
    this.areas.deep = buildDeep({ quality: this.quality });
    progress(0.68, 'Going deeper');
    await yieldToPaint();
    const cave = this.areas.cave, deep = this.areas.deep;
    this.fx = new Effects(this.areas.overworld.scene, this.camera, document.querySelector('#floaters'));
    // each mine has its own rocks, its own skeletons and its own bounty-giver
    this.fields = {
      cave: new RockField({ scene: cave.scene, collider: cave.collider, spots: cave.rockSpots, fx: this.fx }),
      deep: new RockField({ scene: deep.scene, collider: deep.collider, spots: deep.rockSpots, fx: this.fx, counts: DEEP_ROCK_COUNTS, seed: 777 }),
    };
    this.packs = {
      cave: new SkeletonPack({ scene: cave.scene, arena: cave.arena, fx: this.fx, kind: SKELETON }),
      deep: new SkeletonPack({ scene: deep.scene, arena: deep.arena, fx: this.fx, kind: ELITE, seed: 2929 }),
    };
    for (const f of Object.values(this.fields)) f.populate();
    for (const k of Object.values(this.packs)) k.populate();
    this.rob = makeRob(cave.scene);
    this.jack = makeJack(deep.scene);
    this.npcs = { rob: this.rob, jack: this.jack };
    progress(0.8, 'Waking the skeletons');
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

  /** The rocks and the skeletons where you are, or the cave's when you are in neither mine. */
  get rocks() { return this.fields[this.area?.id] || this.fields.cave; }
  get skeletons() { return this.packs[this.area?.id] || this.packs.cave; }
  /** Who gives out bounties where you are. */
  get giver() { return this.area?.id === 'deep' ? 'jack' : this.area?.id === 'cave' ? 'rob' : null; }

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
    if (id === 'deep') this._hint('hintDeep', 'The elites down here wear iron and hit hard. Jack\'s camp, on your left, is safe.', 4600, 2600);
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
    if (area.mine && this.mode !== 'menu') {
      this.rocks.update(dt, p.pos);
      if (this.mode !== 'talk') this.skeletons.update(dt, p, this._skHooks);
      this.npcs[this.giver].update(dt, p.pos, this.questState(this.giver));
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
    const p = this.player.pos, id = this.area.id;
    if (id === 'overworld' && this.area.enteringCave(p)) this.travel('cave', CV.entry);
    else if (id === 'cave' && this.area.leaving(p)) this.travel('overworld', OW.caveExit);
    else if (id === 'cave' && this.area.descending(p)) this.travel('deep', DM.entry);
    else if (id === 'deep' && this.area.leaving(p)) this.travel('cave', CV.hall.back);
  }

  _interactions(input) {
    const p = this.player.pos;
    let near = null;
    if (this.area.id === 'overworld' && this.area.nearAnvil(p)) near = 'anvil';
    if (this.area.id === 'overworld' && this.area.nearWall(p)) near = 'wall';
    const g = this.giver && this.npcs[this.giver];
    if (g && Math.hypot(p.x - g.pos.x, p.z - g.pos.z) < 3.3) near = this.giver;
    this.hud.setInteract({ anvil: 'ANVIL', wall: 'PICKAXES', rob: 'TALK', jack: 'TALK' }[near] || null);
    if (input.pressed.interact && near) this._use(near);
    if (this._tap) {
      const t = this._tap;
      this._tap = null;
      this._tapWorld(t.x, t.y);
    }
  }

  /** A tap on the screen that was not a drag: did it land on the anvil, the pickaxe wall, Rob or Jack? */
  onTap(x, y) {
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
    const g = this.giver && this.npcs[this.giver];
    const things = this.area.id === 'overworld'
      ? [['anvil', this.area.forge.anvil, new Vector3(OW.anvil.x, 0, OW.anvil.z), 13, 'Walk over to the anvil first'],
        ['wall', this.area.pickWall.hit, new Vector3(OW.wall.x, 0, OW.wall.z), 13, 'Walk over to the pickaxe wall first']]
      : g ? [[this.giver, g.group, g.pos, 10, `Walk over to ${g.name} first`]] : [];
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
    else if (what === 'rob' || what === 'jack') this.talkTo(what);
  }

  /* --------------------------------- combat -------------------------------- */

  /** Pickaxe for a rock, weapon for a skeleton: whatever is in front of you. */
  _pickTarget(pl) {
    const weapon = this.profile.weapon();
    if (this.area.mine) {
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
    if (s.tool === 'hammer') { this._hammerBlow(s.grade); return; }
    if (!this.area.mine) return;
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
      const { dealt, killed } = this.skeletons.hit(s, damage, pl.pos);
      this.fx.text(new Vector3(s.pos.x, s.elite ? 2.15 : 2.0, s.pos.z), '-' + dealt, 'dmg');
      // iron rings when it is hit; bone just cracks
      this.fx.sparks(new Vector3(s.pos.x, 1.25, s.pos.z), s.elite ? 9 : 5, { color: new Color(s.elite ? '#ffd9a0' : '#fff1d0'), speed: 2.5 });
      if (killed) this._killed(s);
    }
  }

  /** One fewer: Rob counts any skeleton, Jack only the elites. */
  _killed(s) {
    const P = this.profile;
    P.stats.kills++;
    if (s?.elite) P.stats.elites++;
    for (const [id, Q] of Object.entries(QUESTS)) {
      const q = P.quests[id];
      if (!q.active || q.kills >= Q.kills || (Q.elite && !s?.elite)) continue;
      q.kills++;
      if (q.kills >= Q.kills) {
        this.hud.announce('BOUNTY DONE', `Go back to ${Q.giver} and get paid`, '#f2c03a', 2600);
        sfx.play('quest');
      } else {
        this.hud.toast(`${Q.elite ? 'Elites' : 'Skeletons'} ${q.kills} / ${Q.kills}`, 1400);
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
      this._hint('hintHurt', `Low on health? Back off to ${this.area.id === 'deep' ? 'Jack' : 'Rob'}'s camp: skeletons won't follow you there.`, 4200);
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

  /** What the mark over a bounty-giver's head should say. */
  questState(id = 'rob') {
    const Q = QUESTS[id], q = this.profile.quests[id];
    if (q.active) return q.kills >= Q.kills ? 'ready' : 'active';
    if (this.profile.level < Q.level) return 'locked:' + Q.level;
    return 'offer';
  }

  talkToRob() { this.talkTo('rob'); }

  talkTo(id) {
    if (this.mode !== 'play') return;
    const npc = this.npcs[id];
    this.mode = 'talk';
    this.talking = id;
    this.input?.reset();
    this.hud.setBusy(true);
    this.dlg.open(npc.name, id === 'jack' ? jackPortrait() : robPortrait());
    // the camera comes round to look at them past your shoulder
    const r = npc.pos, p = this.player.pos;
    const dx = r.x - p.x, dz = r.z - p.z, d = Math.hypot(dx, dz) || 1;
    const side = new Vector3(-dz / d, 0, dx / d);
    const camPos = new Vector3(p.x - (dx / d) * 2.2 + side.x * 1.1, 2.1, p.z - (dz / d) * 2.2 + side.z * 1.1);
    this.camRig.lend(camPos, new Vector3(r.x, 1.55, r.z), 0.6);
    this.player.yaw = Math.atan2(dx, dz);
    this._says(id);
    sfx.play('ui');
  }

  /** What they say, and what you can say back. */
  _says(id, override = null) {
    const P = this.profile, Q = QUESTS[id], q = P.quests[id];
    const pay = `${money(Q.cash)} and ${Q.exp.toLocaleString('en-US')} EXP`;
    const choices = [];
    let text;
    const take = { label: id === 'jack' ? 'KILL 5 ELITES' : 'KILL 3 SKELETONS', primary: true, pick: () => this._accept(id) };
    if (q.active && q.kills >= Q.kills) {
      text = id === 'jack'
        ? `Five of 'em in pieces, iron and all. I keep my word: ${pay}.`
        : 'Ha! That\'s three of \'em back in the ground where they belong. Here - $1,000 and a hundred EXP, like I promised.';
      choices.push({ label: `CLAIM ${money(Q.cash)} + ${Q.exp.toLocaleString('en-US')} EXP`, primary: true, pick: () => this._claim(id) });
    } else if (q.active) {
      const left = Q.kills - q.kills;
      text = id === 'jack'
        ? `${left} more elite${left === 1 ? '' : 's'}. They keep to the far side of the pillars. Dash when one raises its sword.`
        : `${left} more skeleton${left === 1 ? '' : 's'} to go. Rattly fellas with wooden daggers - they hang about round the far side of the big wall.`;
    } else if (id === 'jack' && P.level < Q.level) {
      text = !P.met.jack
        ? `Easy, smith. Name's Jack. The skeletons down here aren't Rob's rattlers - they're elites, in iron chestplates and boots, with iron swords. I pay ${pay} for five of them, but I don't send anyone under level ${Q.level}. You're level ${P.level}. Come back when you're ready.`
        : `Level ${P.level} still. It takes level ${Q.level} for this work. Rob, up top, pays for the small ones - that's how I started.`;
      P.met.jack = true;
      this._dirty = true;
    } else if (!P.met[id]) {
      text = id === 'jack'
        ? `Name's Jack. I hunt the elites - skeletons in iron, with iron swords. Kill five for me and I'll pay you ${pay}.`
        : `Well now, a smith! Name's Rob. These mines are crawling with skeletons. Kill three of 'em for me and I'll pay you ${money(Q.cash)} - and ${Q.exp} EXP for the experience.`;
      choices.push(take);
    } else {
      text = id === 'jack'
        ? (q.completed ? `Back for more? Five elites, ${pay}. Same as always.` : `Level ${P.level} now. Good. Five elites, ${pay}. Keep your armour on.`)
        : (q.completed
          ? `Back for more? Same deal as always: three skeletons, ${pay}.`
          : `Still got work if you want it. Three skeletons, ${pay}.`);
      choices.push(take);
    }
    choices.push({ label: 'BYE', pick: () => this.closeTalk() });
    this.dlg.say(override || text, choices);
  }

  _accept(id) {
    const P = this.profile, Q = QUESTS[id], q = P.quests[id];
    if (P.level < Q.level) return;
    P.met[id] = true;
    q.active = true;
    q.kills = 0;
    this._dirty = true;
    sfx.play('quest');
    this.hud.toast(id === 'jack' ? 'Bounty: kill 5 elite skeletons' : 'Bounty: kill 3 skeletons', 1800);
    this._says(id, id === 'jack'
      ? 'Five elites. I\'ll be by the fire. They hit harder than anything up top - an armoured smith lasts a lot longer down here.'
      : 'Good on you. Three skeletons - I\'ll be right here when you\'re done. Mind those daggers; dash out of the way when they wind up.');
  }

  /** Paid, for as many as it took. Repeatable, every time. */
  _claim(id) {
    const P = this.profile, Q = QUESTS[id], q = P.quests[id];
    if (!(q.active && q.kills >= Q.kills)) return;
    q.active = false;
    q.kills = 0;
    q.completed++;
    P.addCash(Q.cash);
    const levels = P.addExp(Q.exp);
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
      this.hud.announce(`+${money(Q.cash)}`, `+${Q.exp.toLocaleString('en-US')} EXP`, '#f2c03a', 2000);
    }
    if (id === 'jack') {
      this._says(id, `There: ${money(Q.cash)}. Fancy another five? They'll be back on their feet soon enough.`);
      return;
    }
    const next = QUESTS.jack;
    this._says(id, P.level >= next.level && !P.met.jack
      ? `There you are: ${money(Q.cash)}. Level ${P.level}, eh? Then go and see Jack - down the hall in the north wall, in the deep mine. He pays a lot more, for a lot worse.`
      : P.hasPickaxe('stone')
        ? `There you are: ${money(Q.cash)}. Fancy another go? Those bones don't stay down for long.`
        : `There you are: ${money(Q.cash)}. That's just what a Stone Pickaxe costs on the wall outside the cave mouth - the only thing that'll crack a boulder.`);
  }

  closeTalk() {
    if (this.mode !== 'talk') return;
    this.talking = null;
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
    const shot = this._anvilShot();
    this._shot = { pos: shot.pos.clone(), look: shot.look.clone() };
    this.camRig.lend(shot.pos, shot.look, 0.75);
    this.forgeUI.open();
    sfx.play('ui');
  }

  /** The close-up on the anvil, framed in the left of the screen, clear of the menu. */
  _anvilShot() {
    const top = this.area.forge.anvilTop;
    const hfov = 2 * Math.atan(Math.tan((this.camera.fov * Math.PI / 180) / 2) * this.camera.aspect);
    const D = 2.55;
    // looking west, screen right is north (-z): aim right of the anvil to put it
    // left of centre, in the space the menu leaves clear
    const free = clamp(this.forgeUI.freeFrac, 0.3, 0.7);
    const shift = 0.88 * (1 - free) * D * Math.tan(hfov / 2);
    return { pos: new Vector3(top.x + D, top.y + 1.15, top.z - shift * 0.25), look: new Vector3(top.x - 0.2, top.y - 0.22, top.z - shift) };
  }

  /**
   * Where the camera is while you forge: on the bucket and the mould, then
   * the anvil, then the water. Each puts what matters left of centre, clear
   * of the handle and the TAP button on the right.
   */
  _craftShot(c) {
    const F = this.area.forge;
    if (c.phase === 'pour' || (c.phase === 'cast' && c.t < CRAFT.lift)) {
      const m = F.mouldTop;
      return { pos: new Vector3(m.x + 1.75, m.y + 1.5, m.z + 0.3), look: new Vector3(m.x, m.y + 0.42, m.z - 0.22) };
    }
    if (c.phase === 'cast' || c.phase === 'hammer' || c.phase === 'ranked') {
      const top = F.anvilTop;
      return { pos: new Vector3(top.x + 2.15, top.y + 1.15, top.z + 0.15), look: new Vector3(top.x - 0.1, top.y + 0.08, top.z - 0.45) };
    }
    const w = F.waterTop;
    return { pos: new Vector3(w.x + 1.9, w.y + 1.15, w.z + 0.7), look: new Vector3(w.x + 0.05, w.y + 0.3, w.z - 0.35) };
  }

  /** The mould on the pedestal is cut to whatever the anvil's menu is showing. */
  setMould(type) {
    if (this.area?.id === 'overworld' && !this.craft) this.area.forge.mould.set(type);
  }

  /**
   * FORGE was pressed: the ore goes in and the gear is yours. Now it has to
   * be made - poured, hammered and quenched - and how well the hammering
   * goes is its rank.
   */
  forge(type, mix) {
    if (this.mode !== 'forge' || this.craft) return;
    if (!this.profile.takeOres(mix)) return;
    const R = recipe(type);
    const item = this.profile.addItem({ kind: R.kind, type, mix });
    this.profile.stats.crafted++;
    this.save();
    this.setMould(type);
    this.craft = {
      phase: 'pour', t: 0, item, kind: R.kind, type,
      pull: 0, tilt: 0, fill: 0, from: 0, full: false, pouring: 0,     // the pour
      grades: [], ring: -CRAFT.firstRing, r: null,                      // the hammer
      dip: 0, ready: false,                                             // the quench
      mesh: null, hot: null,
    };
    this.forgeUI.startGame(this.craft);
    sfx.play('ui');
  }

  /**
   * The handle on the screen, from 0 (up) to 1 (pulled all the way down): the
   * chain that tips the bucket while pouring, the gear going into the water
   * while quenching. Ignored the rest of the time.
   */
  pullHandle(k) {
    const c = this.craft;
    if (!c) return;
    k = clamp01(k);
    if (c.phase === 'pour' && !c.full) {
      if (c.pull < 0.05 && k >= 0.05) sfx.play('chain');
      c.pull = k;
    } else if (c.phase === 'quench' && c.ready) {
      c.dip = k;
    }
  }

  /** TAP: a blow of the hammer, graded by where the white ring was. Returns the grade, or null if it was no time to strike. */
  strike() {
    const c = this.craft;
    if (!c || c.phase !== 'hammer' || c.r == null) return null;
    return this._hammerStrike(strikeGrade(c.r));
  }

  _hammerStrike(grade) {
    const c = this.craft;
    c.grades.push(grade.id);
    c.r = null;
    c.ring = -HAMMER.gap;
    this.player.swing = { kind: 'chop', t: 0, dur: 0.3, tool: 'hammer', target: null, landed: false, face: Math.PI / 2, grade: grade.id };
    if (grade.id === 'perfect') sfx.play('perfect');
    this.forgeUI.showGrade(grade, c.grades.length);
    if (c.grades.length >= HAMMER.strikes) {
      c.item.rank = forgeScore(c.grades);
      c.phase = 'ranked';
      c.t = 0;
      this.forgeUI.showRank(rankOf(c.item.rank), c.item.rank);
      this.save();
    }
    return grade;
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
    // the camera eases to the anvil beside the menu, or to whatever the forging is at
    const want = c ? this._craftShot(c) : this._anvilShot();
    const k = 1 - Math.exp(-dt * 3.2);
    this._shot.pos.lerp(want.pos, k);
    this._shot.look.lerp(want.look, k);
    this.camRig.reframe(this._shot.pos, this._shot.look);
    if (!c) return;
    c.t += dt;
    // you turn to what you are working on: the chain, the anvil, the water
    if (!p.swing && (!this._walk || this._walk.t >= 1)) {
      const at = c.phase === 'pour' ? F.mouldTop : AT_WATER.has(c.phase) ? F.waterTop : null;
      p.yaw = dampAngle(p.yaw, at ? Math.atan2(at.x - p.pos.x, at.z - p.pos.z) : Math.PI / 2, 6, dt);
    }
    // between blows the metal settles back to its glow
    if (c.hot && !AT_WATER.has(c.phase)) c.hot.emissiveIntensity = damp(c.hot.emissiveIntensity, 1.2, 4, dt);
    if (c.phase === 'pour') this._pour(c, dt);
    else {
      // the bucket swings the rest of the way back
      c.tilt = damp(c.tilt, 0, 4, dt);
      F.tipper.rotation.x = -c.tilt;
      if (c.phase === 'cast') this._cast(c);
      else if (c.phase === 'hammer') this._hammer(c, dt);
      else if (c.phase === 'ranked') { if (c.t >= CRAFT.ranked) { c.phase = 'quench'; c.t = 0; } }
      else this._quench(c, dt);
    }
    this.forgeUI.updateGame(c);
  }

  /** 1. The chain tips the bucket and lava runs into the mould, until the mould is full. */
  _pour(c, dt) {
    const F = this.area.forge;
    c.tilt = damp(c.tilt, c.full ? 0 : c.pull * CRAFT.tilt, c.full ? 4 : 10, dt);
    F.tipper.rotation.x = -c.tilt;
    const flow = c.full ? 0 : smoothstep((c.tilt - 0.5) / (CRAFT.tilt - 0.5));
    F.stream.visible = flow > 0.02;
    if (F.stream.visible) {
      F.tipper.updateWorldMatrix(true, false);
      const gantry = F.stream.parent;
      const lip = gantry.worldToLocal(F.tipper.localToWorld(new Vector3(0, -0.04, -0.21)));
      const bottom = 0.73;
      const thick = 0.35 + 0.65 * flow;
      F.stream.position.set(lip.x, (lip.y + bottom) / 2, lip.z);
      F.stream.scale.set(thick, Math.max(0.05, lip.y - bottom), thick);
      c.from = lip.z;
      c.fill = Math.min(1, c.fill + flow * CRAFT.pour * dt);
      if (Math.random() < dt * 30) this.fx.sparks(gantry.localToWorld(new Vector3(lip.x, bottom + 0.02, lip.z)), 1, { speed: 0.8, up: 1.2, life: 0.4, size: 0.05 });
      c.pouring -= dt;
      if (c.pouring <= 0) { sfx.play('pour'); c.pouring = 0.8; }
    }
    F.mould.fill(c.fill, c.from);
    F.lavaGlow.intensity = 2.5 + flow * 5;
    // full: the bucket swings back up by itself, however hard the chain is pulled
    if (c.fill >= 1 && !c.full) {
      c.full = true;
      c.pull = 0;
      c.t = 0;
      sfx.play('ui');
    }
    if (c.full && c.t >= CRAFT.settle) {
      c.phase = 'cast';
      c.t = 0;
      c.mesh = this._castShape(c);
      F.anvil.parent.add(c.mesh);
      this._cast(c);
    }
  }

  /** 2. What was cast comes up out of the mould, still glowing, and over onto the anvil. */
  _cast(c) {
    const F = this.area.forge;
    const inMould = F.mouldTop.clone().add(new Vector3(0, 0.02, 0));
    const lifted = inMould.clone().add(new Vector3(0, 0.2, 0));
    F.mould.fill(0);
    if (c.t < CRAFT.lift) {
      c.mesh.position.lerpVectors(inMould, lifted, easeOutCubic(c.t / CRAFT.lift));
    } else {
      const k = clamp01((c.t - CRAFT.lift) / CRAFT.carry);
      c.mesh.position.lerpVectors(lifted, this._onAnvil(), easeInOutCubic(k));
      c.mesh.position.y += Math.sin(k * Math.PI) * 0.3;
    }
    if (c.t >= CRAFT.lift + CRAFT.carry) {
      c.mesh.position.copy(this._onAnvil());
      c.phase = 'hammer';
      c.t = 0;
      c.ring = -CRAFT.firstRing;
      sfx.play('hit');
      this.fx.sparks(this._onAnvil(), 10, { speed: 2, up: 2 });
    }
  }

  _onAnvil() { return this.area.forge.anvilTop.clone().add(new Vector3(0, 0.012, -0.1)); }

  /**
   * 3. Five blows. For each a white ring closes on the TAP button, and a tap
   * as it crosses the green ring is a Perfect. If it closes all the way
   * without a tap, that blow is Bad.
   */
  _hammer(c, dt) {
    if (c.grades.length >= HAMMER.strikes) return;
    c.ring += dt;
    if (c.ring < 0) { c.r = null; return; }
    const k = c.ring / HAMMER.shrink;
    if (k >= 1) { this._hammerStrike(strikeGrade(null)); return; }
    c.r = HAMMER.from + (HAMMER.to - HAMMER.from) * k;
  }

  /**
   * 4. Over to the water, and down into it on the handle. In the water it
   * cools and loses its glow, then comes back out by itself, finished.
   */
  _quench(c, dt) {
    const F = this.area.forge, m = c.mesh, w = F.waterTop;
    // a long blade goes in point first and only so far: the tub is 45cm deep
    const half = m.userData.half;
    const hover = new Vector3(w.x, w.y + 0.12 + half, w.z);
    const under = new Vector3(w.x, w.y + Math.min(-0.1, half - 0.42), w.z);
    if (c.phase === 'quench') {
      const k = clamp01(c.t / CRAFT.toWater);
      if (k < 1) {
        m.position.lerpVectors(this._onAnvil(), hover, easeInOutCubic(k));
        m.position.y += Math.sin(k * Math.PI) * 0.25;
        standUp(m, c.kind, easeInOutCubic(k));
        return;
      }
      if (!c.ready) { c.ready = true; c.dip = 0; }
      standUp(m, c.kind, 1);
      m.position.lerpVectors(hover, under, c.dip);
      if (c.dip >= CRAFT.dipped) {
        c.phase = 'cool';
        c.t = 0;
        c.dip = 1;
        sfx.play('hiss');
        this.fx.steam(w, 16);
        this.fx.sparks(w, 14, { color: SPLASH, speed: 2.2, up: 2.4, life: 0.5, size: 0.05 });
      }
    } else if (c.phase === 'cool') {
      m.position.copy(under);
      const k = clamp01(c.t / CRAFT.cool);
      c.cooled = k;
      c.hot.emissiveIntensity = 1.2 * (1 - smoothstep(k * 1.15));
      c.hot.color.lerpColors(HOT_METAL, oreMaterial(partsOf(c.item.mix)[0]).color, smoothstep(k));
      if (Math.random() < dt * 9) this.fx.steam(w, 2);
      if (c.t > CRAFT.cool * 0.5 && !c.hissed) { c.hissed = true; sfx.play('hiss'); }
      if (k >= 1) {
        c.phase = 'out';
        c.t = 0;
        this._finish(c);
      }
    } else if (c.phase === 'out') {
      const k = clamp01(c.t / CRAFT.out);
      m.position.lerpVectors(under, hover, easeOutCubic(k));
      c.dip = 1 - k;
      if (k >= 1) { c.phase = 'reveal'; c.t = 0; c.dip = 0; this.fx.steam(w, 6); }
    } else {
      // 5. up, turning in the light, in its true colours
      const k = clamp01(c.t / CRAFT.reveal);
      m.position.copy(hover);
      m.position.y += easeOutCubic(k) * 0.3;
      m.rotation.y += dt * 1.6;
      if (c.phase === 'reveal' && k >= 1) {
        c.phase = 'done';
        this.forgeUI.showResult(c.item);
        const r = rankOf(c.item.rank);
        sfx.play(r.id === 'perfect' || itemRarity(c.item) === 'legendary' ? 'legendary' : r.mult >= 1 ? 'quest' : 'nope');
      }
      // the shot stays until the card is put away
      if (c.phase === 'done' && !this.forgeUI.showingResult) this._endCraft();
    }
  }

  /** The cast: a plate in the mould's outline, glowing hot, lying as the mould held it. */
  _castShape(c) {
    const F = this.area.forge;
    const geo = outlineGeometry(c.type, { ...F.mould.fit, depth: 0.03 });
    c.hot = hotMetalMaterial().clone();
    const g = new Group();
    g.rotation.order = 'YXZ';
    g.add(layInMould(new Mesh(geo, c.hot), c.type));
    // half its height, which is how far it reaches down once it is stood up over the water
    g.userData.half = geo.boundingBox.max.y;
    return g;
  }

  /**
   * Out of the water it is the real thing, the same size and the same way
   * round as the cast was: the weapon in its three ores, or the armour's
   * plate edged in its trim.
   */
  _finish(c) {
    const F = this.area.forge;
    const parts = partsOf(c.item.mix);
    let made;
    if (c.kind === 'weapon') {
      const wpn = buildWeapon(c.type, parts);
      wpn.position.sub(new Box3().setFromObject(wpn).getCenter(new Vector3()));
      made = new Group();
      made.add(wpn);
      made.scale.setScalar(F.mould.scale);
    } else {
      made = buildArmorPlate(c.type, parts, F.mould.fit);
    }
    layInMould(made, c.type);
    for (const old of [...c.mesh.children]) {
      old.removeFromParent();
      old.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    }
    c.mesh.add(made);
  }

  _hammerBlow(grade = 'good') {
    const at = this._onAnvil().add(new Vector3(0, 0.04, 0));
    const big = { perfect: 1.6, great: 1.25, good: 1, mid: 0.75, bad: 0.45 }[grade] ?? 1;
    sfx.play(grade === 'bad' ? 'thud' : 'clang', { gap: 0 });
    this.camRig.shake(0.05 * big, 0.12);
    this.fx.sparks(at, Math.round(16 * big), { speed: 3.2 * Math.sqrt(big), up: 2.6, size: 0.06 });
    if (grade === 'perfect') this.fx.flare(at, undefined, 0.9, 0.35);
    // each blow brightens the metal for a moment
    if (this.craft?.hot) this.craft.hot.emissiveIntensity = 1.2 + 0.8 * big;
  }

  _dropMesh(c) {
    if (!c.mesh) return;
    c.mesh.removeFromParent();
    c.mesh.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    c.mesh = null;
  }

  /** The forging is over, or left part-way: everything back as it was. */
  _endCraft() {
    const c = this.craft;
    if (!c) return;
    // walked away before the hammering was done: the blows not struck count as Mid
    if (!Number.isFinite(c.item.rank)) { c.item.rank = forgeScore(c.grades); this._dirty = true; }
    const F = this.areas.overworld.forge;
    F.tipper.rotation.x = 0;
    F.stream.visible = false;
    F.mould.fill(0);
    F.lavaGlow.intensity = 2.5;
    this._dropMesh(c);
    c.hot?.dispose();
    this.craft = null;
    this.forgeUI.endGame();
  }

  /** EQUIP on the card. */
  equipForged(uid) { this.equip(uid); }

  closeForge() {
    if (this.mode !== 'forge') return;
    if (this.craft) this._endCraft();
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
    const running = [];
    for (const [id, Q] of Object.entries(QUESTS)) {
      const q = P.quests[id];
      if (q.active) running.push({ giver: Q.giver, what: Q.elite ? 'elites' : 'skeletons', kills: q.kills, need: Q.kills });
    }
    this.hud.setQuests(running);
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
    // quitting part-way through forging still leaves the gear ranked, and saved so
    if (this.craft) { this._endCraft(); this.save(); }
    this.fx?.dispose();
    for (const f of Object.values(this.fields || {})) f.dispose();
    for (const k of Object.values(this.packs || {})) k.dispose();
    for (const n of Object.values(this.npcs || {})) n.dispose();
    this.player?.dispose();
    for (const a of Object.values(this.areas || {})) a.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * Stands the gear up over the water, `k` of the way from lying on the anvil:
 * a blade point down with its flat to the camera, armour the right way up.
 */
function standUp(m, kind, k) {
  if (kind === 'weapon') m.rotation.set(-Math.PI / 2 * k, Math.PI / 2 * k, 0);
  else m.rotation.set(0, 0, -Math.PI / 2 * k);
}

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
