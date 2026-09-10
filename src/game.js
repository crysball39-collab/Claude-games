// Match runtime: world assembly, 100 players, bullets, loot and the game loop.
import * as THREE from 'three';
import { Physics } from './physics.js';
import { createTerrain, createWater, heightAt, Nature, WORLD, POIS, SEA_LEVEL } from './world.js';
import { buildSummeringFalls } from './poi_summering.js';
import { buildSnowySnarks } from './poi_snowy.js';
import { buildPumpedPalms } from './poi_pumped.js';
import { Player } from './player.js';
import { Bot, botName } from './ai.js';
import { Effects } from './effects.js';
import { BuildSystem } from './building.js';
import { Chest, Pickup, floorLoot, itemScore, makeWeapon, makeConsumable } from './loot.js';
import { RARITY } from './models.js';
import { Storm } from './storm.js';
import { GameMap } from './map.js';
import { buildSpawnIsland, BattleBus, pickDropTarget, SPAWN, SPAWN_TIME, DROP_FROM, DROP_TO } from './bus.js';
import { makeRng, clamp, lerp, TAU } from './util.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export const TOTAL_PLAYERS = 100;

export class Game {
  constructor(renderer, hud, opts = {}) {
    this.renderer = renderer;
    this.hud = hud;
    this.state = 'loading';
    this.time = 0;
    this.seed = opts.seed || 20260908;
    this.rng = makeRng(this.seed);
    this.cosmetics = opts.cosmetics;
    this.playerName = opts.playerName || 'You';
    this.onMatchEnd = opts.onMatchEnd || (() => {});

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.12, 3000);

    this.actors = [];
    this.bots = [];
    this.chests = [];
    this.pickups = [];
    this.doors = [];
    this.poiCenters = POIS.map(p => ({ x: p.x, z: p.z }));
    this.eliminated = 0;
    this.phase = 'spawn';          // 'spawn' -> 'bus' -> 'live'
    this.phaseT = SPAWN_TIME;
    this.damageEnabled = false;    // nobody can be hurt before the drop
    this.bus = null;
    this.spawnArea = SPAWN;
  }

  // ------------------------------------------------------------ world setup
  async setup(progress = () => {}) {
    const scene = this.scene;
    progress('Preparing island', 0.02);

    scene.fog = new THREE.Fog(0xbcd8ea, 260, 900);
    scene.background = new THREE.Color(0xbcd8ea);
    scene.add(this.makeSky());

    // Interiors are lit almost entirely by the hemisphere + ambient fill, so
    // that rooms under a roof stay readable without a light per room.
    const hemi = new THREE.HemisphereLight(0xdcefff, 0x77826a, 1.35);
    scene.add(hemi);
    scene.add(new THREE.AmbientLight(0xbcd0e4, 0.42));
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.15);
    sun.position.set(120, 220, 80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 380;
    const S = 96;
    sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
    sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
    sun.shadow.bias = -0.0009;
    sun.shadow.normalBias = 0.035;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    this.physics = new Physics(heightAt);

    await this.yieldFrame(progress, 'Raising terrain', 0.08);
    const terrain = createTerrain();
    this.terrain = terrain.mesh;
    this.mapCanvas = terrain.mapCanvas;
    scene.add(this.terrain);
    scene.add(createWater());

    await this.yieldFrame(progress, 'Building Summering Falls', 0.28);
    this.poiSummering = buildSummeringFalls(scene, this.physics);
    await this.yieldFrame(progress, 'Building Snowy Snarks', 0.44);
    this.poiSnowy = buildSnowySnarks(scene, this.physics);
    await this.yieldFrame(progress, 'Digging out Pumped Palms', 0.58);
    this.poiPumped = buildPumpedPalms(scene, this.physics);

    for (const b of [this.poiSummering, this.poiSnowy, this.poiPumped]) {
      this.doors.push(...b.doors);
    }

    await this.yieldFrame(progress, 'Planting trees', 0.70);
    this.nature = new Nature(scene, this.physics);
    this.nature.scatter(makeRng(this.seed ^ 0x51ab));

    // map boundary so nobody wanders off the island
    const H = WORLD.half;
    this.physics.addBox(-H - 24, -40, -H - 30, H + 24, 260, -H - 6);
    this.physics.addBox(-H - 24, -40, H + 6, H + 24, 260, H + 30);
    this.physics.addBox(-H - 30, -40, -H - 24, -H - 6, 260, H + 24);
    this.physics.addBox(H + 6, -40, -H - 24, H + 30, 260, H + 24);

    await this.yieldFrame(progress, 'Hiding chests', 0.80);
    this.spawnChests();
    this.scatterFloorLoot();

    this.effects = new Effects(scene, this.camera);
    this.build = new BuildSystem(scene, this.physics);
    this.storm = new Storm(scene, makeRng(this.seed ^ 0x5701));
    this.gameMap = new GameMap(this.mapCanvas);
    this.makeWaypointBeam();

    await this.yieldFrame(progress, 'Raising the spawn island', 0.88);
    const before = new Set(this.physics.all);
    this.spawnIsland = buildSpawnIsland(scene, this.physics);
    this.spawnColliders = [...this.physics.all].filter(c => !before.has(c));

    await this.yieldFrame(progress, 'Gathering 100 players', 0.94);
    this.spawnActors();

    progress('Ready', 1);
    this.state = 'match';
  }

  yieldFrame(progress, label, p) {
    progress(label, p);
    return new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  }

  makeSky() {
    const c = document.createElement('canvas');
    c.width = 8; c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.0, '#2f6fb5');
    g.addColorStop(0.45, '#79b3dd');
    g.addColorStop(0.72, '#bcd8ea');
    g.addColorStop(1.0, '#e6f0f5');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 256);
    const tex = new THREE.CanvasTexture(c);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 24, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    sky.renderOrder = -1;
    return sky;
  }

  // ------------------------------------------------------------------ loot
  spawnChests() {
    const rng = makeRng(this.seed ^ 0x9c31);
    const spotsOf = (b, tag) => b.chestSpots.filter(s => s.tag === tag);

    // Summering Falls: one chest inside one of the five apartment blocks...
    const apt = rng.shuffle(spotsOf(this.poiSummering, 'apartment'));
    if (apt.length) this.addChest(apt[0], 'Summering Falls');
    // ...and three of the seven house bathrooms.
    const baths = rng.shuffle(spotsOf(this.poiSummering, 'bathroom')).slice(0, 3);
    for (const s of baths) this.addChest(s, 'Summering Falls');

    // Pumped Palms: on the chair in the resting unit.
    for (const s of spotsOf(this.poiPumped, 'resting')) this.addChest(s, 'Pumped Palms');

    // Snowy Snarks: throne, armoury, tower top, dinner table, bridge.
    for (const tag of ['throne', 'armory', 'tower', 'dining', 'bridge']) {
      for (const s of spotsOf(this.poiSnowy, tag)) this.addChest(s, 'Snowy Snarks');
    }
  }

  addChest(spot, poi) {
    const c = new Chest(spot.x, spot.y, spot.z, spot.rotY || 0, this.scene, this.physics, spot.tag);
    c.poi = poi;
    this.chests.push(c);
    return c;
  }

  /** Ground loot so a 100-player lobby has something to fight over. */
  scatterFloorLoot() {
    const rng = makeRng(this.seed ^ 0x2f7a);
    const drop = (x, z, fromY) => {
      const y = this.physics.floorAt(x, z, fromY, 0.35);
      if (y < -900) return false;
      // reject spots buried inside geometry
      const near = this.physics.query(x - 0.4, z - 0.4, x + 0.4, z + 0.4);
      for (const c of near) {
        if (!c.solid) continue;
        if (c.miny < y + 1.4 && c.maxy > y + 0.25 &&
            x > c.minx && x < c.maxx && z > c.minz && z < c.maxz) return false;
      }
      this.spawnPickup(floorLoot(rng), x, y + 0.05, z);
      return true;
    };
    const region = (cx, cz, r, fromY, count) => {
      let placed = 0, guard = 0;
      while (placed < count && guard++ < count * 25) {
        const a = rng() * TAU, d = Math.sqrt(rng()) * r;
        if (drop(cx + Math.cos(a) * d, cz + Math.sin(a) * d, fromY)) placed++;
      }
    };
    region(0, -940, 115, 30, 40);        // Summering Falls (ground + upper floors)
    region(-800, 820, 110, 46, 34);      // Snowy Snarks
    region(0, 0, 110, 12, 26);           // Pumped Palms surface
    region(0, -2, 46, -2.9, 16);         // the lab hallway and rooms
    region(-43, 0, 9, -2.9, 4);          // control room
    region(43, 1, 9, -2.9, 4);           // resting unit
  }

  makeWaypointBeam() {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 260, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x3ad6ff, transparent: true, opacity: 0.22,
        side: THREE.DoubleSide, depthWrite: false, fog: false })
    );
    beam.position.y = 130;
    g.add(beam);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 3.4, 20),
      new THREE.MeshBasicMaterial({ color: 0x3ad6ff, transparent: true, opacity: 0.75,
        side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.4;
    g.add(ring);
    g.visible = false;
    this.scene.add(g);
    this.waypointBeam = g;
  }

  setWaypoint(x, z) {
    const wp = this.gameMap.setWaypoint(x, z);
    if (!wp) return null;
    const y = this.physics.floorAt(x, z, 400, 0.4);
    this.waypointBeam.position.set(x, Math.max(y, -20), z);
    this.waypointBeam.visible = true;
    return wp;
  }

  clearWaypoint() {
    this.gameMap.clearWaypoint();
    this.waypointBeam.visible = false;
  }

  spawnPickup(item, x, y, z, vx = 0, vy = 0, vz = 0) {
    const p = new Pickup(item, x, y, z, this.scene);
    p.vel.set(vx, vy, vz);
    p.settled = (vx === 0 && vy === 0 && vz === 0);
    if (p.settled) { p.pos.y = y; p.group.position.copy(p.pos); }
    this.pickups.push(p);
    return p;
  }

  // ---------------------------------------------------------------- actors
  spawnActors() {
    const rng = makeRng(this.seed ^ 0x77a1);
    // Everybody starts on the spawn island; the bus takes them to the map.
    const islandSpot = () => {
      const h = SPAWN.half - 6;
      return { x: SPAWN.x + (rng() * 2 - 1) * h, z: SPAWN.z + (rng() * 2 - 1) * h, y: SPAWN.y };
    };
    const spot = (i, minD = 34) => {
      // Most of the lobby lands around the three POIs (as if they had dropped
      // there); the rest are spread over the island.
      let x, z, tries = 0;
      do {
        if (i % 10 < 7) {
          const p = POIS[i % POIS.length];
          const a = rng() * TAU, d = minD + rng() * 150;
          x = p.x + Math.cos(a) * d; z = p.z + Math.sin(a) * d;
        } else {
          x = (rng() * 2 - 1) * (WORLD.half - 140);
          z = (rng() * 2 - 1) * (WORLD.half - 140);
        }
        tries++;
      } while (heightAt(x, z) < SEA_LEVEL + 3 && tries < 40);
      return { x, z, y: this.physics.floorAt(x, z, 400, 0.4) + 0.2 };
    };

    const ps = islandSpot();
    this.player = new Player(this, {
      x: ps.x, y: ps.y, z: ps.z, name: this.playerName,
      cosmetics: this.cosmetics, yaw: rng() * TAU,
    });
    this.player.inv.add(makeConsumable('bandage', 3));
    this.player.select(this.player.inv.pickaxeSlot);
    this.player.equipT = 0;
    this.actors.push(this.player);

    const tints = [0x2e5aa8, 0x8a3a3a, 0x3f7a45, 0x7a5aa8, 0xa8853f, 0x3a7a8a, 0xa85a3a, 0x555b66];
    for (let i = 0; i < TOTAL_PLAYERS - 1; i++) {
      const s = islandSpot();
      const bot = new Bot(this, {
        x: s.x, y: s.y, z: s.z, seed: i + 3,
        name: botName(i, makeRng(i * 31 + 7)),
        yaw: rng() * TAU,
        tint: tints[i % tints.length],
        cosmetics: { skin: ['recruit', 'commando', 'aviator', 'renegade', 'sentinel'][i % 5],
                     backbling: ['none', 'pack', 'roll'][i % 3], pickaxe: 'default' },
      });
      // seed bots with a starter item now and then so early fights happen
      if (rng() < 0.35) bot.inv.add(makeWeapon(['m1911', 'mac10', 'ak47'][Math.floor(rng() * 3)], 'common', rng));
      if (rng() < 0.4) bot.inv.add(makeConsumable('bandage', 2 + Math.floor(rng() * 3)));
      const bw = bot.inv.bestWeapon();
      if (bw >= 0) bot.select(bw);
      this.bots.push(bot);
      this.actors.push(bot);
    }
    this.aliveCount = this.actors.length;
  }

  // --------------------------------------------------------------- combat
  fireBullet(shooter, origin, dir, weapon) {
    const maxT = weapon.def.range;
    const hit = this.physics.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxT);
    let bestT = hit ? hit.t : maxT;
    let victim = null;
    for (const a of this.actors) {
      if (a === shooter || !a.alive) continue;
      const dx = a.pos.x - origin.x, dz = a.pos.z - origin.z;
      if (dx * dx + dz * dz > (bestT + 2) * (bestT + 2)) continue;
      const t = a.hitTest(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, bestT);
      if (t >= 0 && t < bestT) { bestT = t; victim = a; }
    }
    const end = _v.set(origin.x + dir.x * bestT, origin.y + dir.y * bestT, origin.z + dir.z * bestT);
    this.effects.tracer(origin, end, shooter.isPlayer ? 0xfff0b0 : 0xffd070);

    if (victim) {
      const head = victim.isHead(end.y);
      const def = weapon.def;
      // shotguns lose most of their bite past a few metres
      let dmg = weapon.damage;
      if (def.falloffStart) {
        const f = 1 - clamp((bestT - def.falloffStart) / (def.falloffEnd - def.falloffStart), 0, 1);
        dmg *= lerp(def.falloffMin ?? 0.3, 1, f);
      }
      if (head) dmg *= weapon.headMult || 1.5;
      dmg = Math.min(Math.round(dmg), weapon.maxHit ?? Infinity);
      const before = victim.health + victim.shield;
      victim.takeDamage(dmg, shooter, end, head);
      this.effects.impact(end, 'flesh');
      const dealt = Math.round(before - (victim.health + victim.shield));
      if (shooter.isPlayer) {
        this.effects.damageNumber(end.x, end.y + 0.3, end.z, dealt, head ? 'crit' : (victim.shield > 0 ? 'shield' : 'normal'));
        this.hud.showHit(!victim.alive);
      }
      if (victim.isPlayer) { this.hud.flashDamage(); victim.camShake = 0.12; }
      return;
    }
    if (hit) {
      const col = hit.collider;
      if (col) {
        this.damageCollider(col, weapon.damage, shooter, false);
        this.effects.impact(end, col.tag || 'stone');
      } else this.effects.impact(end, 'dirt');
    }
  }

  /** Bullets and pickaxes both land here. Returns wood granted. */
  damageCollider(col, amount, actor, harvest) {
    const o = col.owner;
    if (!o) return 0;
    if (o.kind === 'build') { o.damage(amount); return 0; }
    if (o.kind === 'door') return 0;
    if (o.kind === 'chest') { if (harvest) this.openChest(o, actor); return 0; }
    if (o.kind === 'nature') {
      const res = this.nature.damage(o, amount);
      return harvest ? res.wood : 0;
    }
    if (o.kind === 'prop') {
      if (!o.alive) return 0;
      const before = o.hp;
      o.hp -= amount;
      const frac = (before - Math.max(0, o.hp)) / o.maxHp;
      const wood = Math.round(o.wood * frac);
      if (o.hp <= 0) {
        o.alive = false;
        this.physics.remove(o.collider);
        if (o.mesh.parent) o.mesh.parent.remove(o.mesh);
        this.effects.burst(_v2.set(col.minx / 2 + col.maxx / 2, col.maxy, col.minz / 2 + col.maxz / 2),
          { x: 0, y: 1, z: 0 }, 0x8a6136, 12, 3.4, 0.6, 1.2);
      }
      return harvest ? wood : 0;
    }
    return 0;
  }

  pickaxeStrike(actor) {
    const origin = actor.eyePos(_v);
    const dir = actor.aimTarget && actor.isPlayer
      ? _v2.copy(actor.aimTarget).sub(origin).normalize()
      : actor.aimDir(_v2);
    const reach = 3.4;
    const hit = this.physics.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, reach);
    let bestT = hit ? hit.t : reach;
    let victim = null;
    for (const a of this.actors) {
      if (a === actor || !a.alive) continue;
      const t = a.hitTest(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, bestT);
      if (t >= 0 && t < bestT) { bestT = t; victim = a; }
    }
    const end = _v.set(origin.x + dir.x * bestT, origin.y + dir.y * bestT, origin.z + dir.z * bestT);
    if (victim) {
      const before = victim.health + victim.shield;
      victim.takeDamage(22, actor, end, false);
      this.effects.impact(end, 'flesh');
      if (actor.isPlayer) {
        this.effects.damageNumber(end.x, end.y + 0.3, end.z, Math.round(before - (victim.health + victim.shield)));
        this.hud.showHit(!victim.alive);
      }
      if (victim.isPlayer) this.hud.flashDamage();
      return;
    }
    if (hit && hit.collider) {
      const wood = this.damageCollider(hit.collider, 42, actor, true);
      if (wood > 0) {
        actor.inv.wood = Math.min(999, actor.inv.wood + wood);
        if (actor.isPlayer) this.effects.damageNumber(end.x, end.y + 0.4, end.z, '+' + wood, 'shield');
      }
      this.effects.impact(end, hit.collider.tag || 'stone');
    } else if (hit) this.effects.impact(end, 'dirt');
  }

  /**
   * Something made a sound.  Bots inside the radius get told about it and will
   * turn toward gunfire, or walk over to investigate it.
   */
  makeNoise(x, z, radius, source, kind) {
    if (!this.bots || this.phase !== 'live') return;
    const r2 = radius * radius;
    for (const b of this.bots) {
      if (!b.alive || b === source) continue;
      const dx = b.pos.x - x, dz = b.pos.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2);
      if (d > b.hearRange * (kind === 'shot' ? 1.25 : 0.55)) continue;
      b.hearNoise(x, z, kind, source, d);
    }
  }

  // ------------------------------------------------------------ interaction
  nearestInteractable(actor, maxDist = 2.9) {
    let best = null, bestD = maxDist;
    const px = actor.pos.x, py = actor.pos.y, pz = actor.pos.z;
    for (const c of this.chests) {
      if (c.opened) continue;
      const d = Math.hypot(c.pos.x - px, c.pos.z - pz);
      if (d < bestD && Math.abs(c.pos.y - py) < 2.6) { bestD = d; best = { type: 'chest', ref: c }; }
    }
    for (const p of this.pickups) {
      if (!p.alive) continue;
      const d = Math.hypot(p.pos.x - px, p.pos.z - pz);
      if (d < bestD && Math.abs(p.pos.y - py) < 2.4) { bestD = d; best = { type: 'pickup', ref: p }; }
    }
    for (const d of this.doors) {
      const dd = Math.hypot(d.pos.x - px, d.pos.z - pz);
      if (dd < bestD && Math.abs(d.pos.y - py) < 3.0) { bestD = dd; best = { type: 'door', ref: d }; }
    }
    return best;
  }

  interact(actor) {
    const target = this.nearestInteractable(actor);
    if (!target) return false;
    if (target.type === 'chest') this.openChest(target.ref, actor);
    else if (target.type === 'pickup') this.tryPickup(actor, target.ref);
    else target.ref.toggle();
    return true;
  }

  openChest(chest, actor) {
    if (chest.opened) return;
    const rng = makeRng((this.seed ^ 0x1234) + Math.round(chest.pos.x * 31 + chest.pos.z * 17));
    chest.open(rng, 0.15, (item, x, y, z, vx, vy, vz) => this.spawnPickup(item, x, y, z, vx, vy, vz));
    if (actor && actor.isPlayer) this.hud.killFeed('Chest opened', true);
  }

  tryPickup(actor, pickup) {
    if (!pickup.alive) return false;
    const item = pickup.item;
    const res = actor.inv.add(item);
    if (res.added) {
      this.removePickup(pickup);
      actor.refreshHeld();
      if (actor.isPlayer) {
        this.hud.killFeed(`Picked up ${item.name}`, true);
        if (item.kind === 'weapon' && actor.inv.slots[actor.inv.selected] == null) actor.select(res.slot);
      } else if (item.kind === 'weapon') {
        const bw = actor.inv.bestWeapon();
        if (bw >= 0) actor.select(bw);
      }
      return true;
    }
    // inventory full: swap out something worse
    let swapSlot = -1;
    if (actor.isPlayer) {
      swapSlot = actor.inv.holdingPickaxe ? 0 : actor.inv.selected;
    } else if (item.kind === 'weapon') {
      const worst = actor.inv.worstWeaponSlot();
      if (worst >= 0 && itemScore(actor.inv.slots[worst]) < itemScore(item)) swapSlot = worst;
    }
    if (swapSlot < 0) return false;
    const dropped = actor.inv.remove(swapSlot);
    actor.inv.slots[swapSlot] = item;
    this.removePickup(pickup);
    if (dropped) this.spawnPickup(dropped, actor.pos.x, actor.pos.y + 0.9, actor.pos.z,
      Math.sin(actor.yaw) * 2.2, 2.6, Math.cos(actor.yaw) * 2.2);
    actor.refreshHeld();
    if (actor.isPlayer) this.hud.killFeed(`Swapped for ${item.name}`, true);
    return true;
  }

  removePickup(p) {
    p.dispose(this.scene);
    const i = this.pickups.indexOf(p);
    if (i >= 0) this.pickups.splice(i, 1);
  }

  onDeath(actor, killer) {
    this.aliveCount--;
    this.eliminated++;
    if (killer && killer !== actor) killer.kills++;
    // Storm and fall deaths are constant background noise with 99 bots, so they
    // only reach the feed when they involve you.
    const mine = killer === this.player || actor === this.player;
    if (killer || mine) {
      const who = killer ? killer.name : (actor.lastCause === 'storm' ? 'The storm' : 'The fall');
      this.hud.killFeed(`${who} eliminated ${actor.name}`, mine);
    }

    // drop everything they were carrying
    let i = 0;
    for (const it of actor.inv.slots) {
      if (!it) continue;
      const a = (i++ / 5) * TAU;
      this.spawnPickup(it, actor.pos.x, actor.pos.y + 1.0, actor.pos.z,
        Math.cos(a) * 2.4, 3.4, Math.sin(a) * 2.4);
    }
    actor.inv.slots.fill(null);
    actor.refreshHeld();
    if (actor.plate) actor.plate.visible = false;

    if (actor === this.player) {
      this.state = 'dead';
      // capture the placement now — reading it when the timer fires would pick
      // up every elimination that happened while the death cam was running
      const place = this.aliveCount + 1, kills = actor.kills;
      setTimeout(() => this.onMatchEnd({ won: false, kills, place }), 2600);
    } else if (this.aliveCount === 1 && this.player.alive) {
      this.state = 'won';
      setTimeout(() => this.onMatchEnd({ won: true, kills: this.player.kills, place: 1 }), 2200);
    }
  }

  // ----------------------------------------------------------- match phases
  startBus() {
    this.phase = 'bus';
    this.bus = new BattleBus(this.scene, makeRng(this.seed ^ 0x0b05));
    // the island is no longer needed and must not block anyone's descent
    this.spawnIsland.group.visible = false;
    for (const c of this.spawnColliders) this.physics.remove(c);
    this.spawnColliders.length = 0;

    const rng = makeRng(this.seed ^ 0x0d1e);
    for (const a of this.actors) {
      if (!a.alive) continue;
      a.mode = 'bus';
      a.vel.set(0, 0, 0);
      if (a !== this.player) {
        a.root.visible = false;
        a.dropTarget = pickDropTarget(rng);
        // leave the bus a little before its closest pass to the chosen spot
        const t = this.bus.closestT(a.dropTarget.x, a.dropTarget.z);
        a.dropT = clamp(t - 0.02 - rng() * 0.02, DROP_FROM, DROP_TO);
      }
    }
    this.hud.banner('DROP WHEN READY', 'Tap JUMP to leave the bus');
  }

  dropActor(a) {
    if (a.mode !== 'bus') return;
    a.mode = 'dive';
    a.root.visible = true;
    a.pos.copy(this.bus.pos);
    a.pos.y -= 9;
    const fx = Math.sin(this.bus.heading), fz = Math.cos(this.bus.heading);
    a.vel.set(fx * 14, -3, fz * 14);
    if (a !== this.player) a.diveTarget = a.dropTarget;
    else {
      a.rig.ensureGlider();
      this.hud.banner('SKYDIVING', 'Steer with the stick — the glider opens on its own');
    }
    if (a.rig.ensureGlider) a.rig.ensureGlider();
  }

  startLive() {
    this.phase = 'live';
    this.damageEnabled = true;
    this.storm.activate();
    if (this.bus) { this.bus.dispose(this.scene); this.bus = null; }
    this.hud.banner('THE STORM IS COMING', 'Stay inside the circle');
  }

  updatePhase(dt) {
    if (this.phase === 'spawn') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.startBus();
      return;
    }
    if (this.phase !== 'bus') return;
    this.bus.update(dt);
    for (const a of this.actors) {
      if (a.mode !== 'bus') continue;
      a.pos.copy(this.bus.pos);
      a.pos.y -= 9;        // low enough that the chase camera clears the bus
      a.yaw = this.bus.heading;
    }
    for (const b of this.bots) {
      if (b.mode === 'bus' && b.alive && this.bus.t >= b.dropT) this.dropActor(b);
    }
    if (this.bus.t >= DROP_TO) {
      for (const a of this.actors) if (a.mode === 'bus') this.dropActor(a);
    }
    if (this.bus.done) this.startLive();
  }

  // ------------------------------------------------------------------ loop
  update(dt) {
    this.time += dt;
    this.updatePhase(dt);
    const input = this.hud.input;
    const p = this.player;

    p.update(dt, input, this.hud);
    p.updateCamera(this.camera, dt);

    // bots: full logic near the player, cheap logic far away
    const px = p.pos.x, pz = p.pos.z;
    for (let i = 0; i < this.bots.length; i++) {
      const b = this.bots[i];
      const d2 = (b.pos.x - px) * (b.pos.x - px) + (b.pos.z - pz) * (b.pos.z - pz);
      const lod = d2 < 90 * 90 ? 0 : d2 < 260 * 260 ? 1 : 2;
      if (b.mode === 'bus') { b.update(dt, lod); continue; }   // hidden inside the bus
      if (lod === 2) {
        // still simulate, just not every frame and without rig animation
        if ((i + Math.floor(this.time * 60)) % 3 !== 0) continue;
        b.update(dt * 3, lod);
        b.root.visible = false;
      } else {
        b.root.visible = true;
        b.update(dt, lod);
      }
    }

    this.storm.update(dt, this.actors);
    // sprinting footsteps and building are quieter giveaways than gunfire
    if (p.alive && p.grounded && p.speed2D > 6) this.makeNoise(p.pos.x, p.pos.z, 26, p, 'steps');
    for (const c of this.chests) c.update(dt);
    for (const d of this.doors) d.update(dt);
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      const d2 = (pk.pos.x - px) * (pk.pos.x - px) + (pk.pos.z - pz) * (pk.pos.z - pz);
      pk.group.visible = d2 < 150 * 150;
      if (pk.group.visible || !pk.settled) pk.update(dt, this.physics);
    }
    this.effects.update(dt);

    // build preview
    if (input.buildMode && p.alive) this.build.showGhost(p, input.buildType);
    else this.build.hideGhost();

    // interaction prompt
    if (p.alive) {
      const t = this.nearestInteractable(p);
      if (t) {
        const label = t.type === 'chest' ? 'Open Chest'
          : t.type === 'door' ? (t.ref.open ? 'Close Door' : 'Open Door')
          : `Pick up ${t.ref.item.name}` + (t.ref.item.kind === 'weapon'
            ? ` <b style="color:#${RARITY[t.ref.item.rarity].glow.toString(16)}">${RARITY[t.ref.item.rarity].name}</b>` : '');
        this.hud.setPrompt(`<b>USE</b> &middot; ${label}`);
      } else this.hud.setPrompt(null);
    } else this.hud.setPrompt(null);

    // shadow camera follows the player
    this.sun.position.set(p.pos.x + 90, p.pos.y + 170, p.pos.z + 70);
    this.sun.target.position.set(p.pos.x, p.pos.y, p.pos.z);
    this.sun.target.updateMatrixWorld();

    this.hud.update(p, this);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const m = Array.isArray(o.material) ? o.material : [o.material];
        for (const mm of m) { if (mm.map) mm.map.dispose(); mm.dispose(); }
      }
    });
  }
}
