/* =============================================================================
   The rounds.

   A round starts with you in the middle of the sand: the south doors shut,
   a horn, a count of three, and then the portcullises go up and the box
   ragdolls come out of the tunnels. Each round brings more of them, and new
   kinds join as the rounds go on:

     round 1+   brawlers - fists and feet
     round 3+   swordsmen - wooden swords, and from round 6 rusty steel ones
     round 4+   shield bearers
     round 5+   gunners
     every 5th  a champion: big, hard to knock down, hits like a cart

   Only so many are out at once; the rest wait in the tunnels and come out as
   others fall. Clear the round and the south doors open: go out to the
   Stall, spend what you earned, and come back in to start the next one.

   Fall, and the run is over: you start again from round 1, with everything
   you own.
   ========================================================================== */
import { Vector3 } from 'three';
import { Brain } from './brain.js';
import { GATES, MASK, R } from './arena.js';
import { rand, chance, pick } from '../core/util.js';

/** Coins for each kill, and for clearing a round. */
export function killReward(kind, wave) {
  if (kind === 'champion') return 10 + wave;
  return 2 + Math.floor(wave / 3) + (kind === 'gunner' ? 1 : 0);
}
export function clearReward(wave) { return 5 + wave * 2; }

/** Who comes out in round n. */
export function roster(n) {
  const list = [];
  const count = Math.min(2 + n, 15);
  let gunners = 0;
  const maxGunners = n >= 5 ? 1 + Math.floor((n - 5) / 3) : 0;
  for (let i = 0; i < count; i++) {
    const r = Math.random();
    if (n >= 5 && gunners < maxGunners && r < 0.2) { list.push({ kind: 'gunner', role: 'gunner', gun: true }); gunners++; continue; }
    if (n >= 4 && r < 0.38) { list.push({ kind: 'shield', role: 'shield', shield: true, weapon: n >= 7 && chance(0.5) ? 'wooden_sword' : null }); continue; }
    if (n >= 3 && r < 0.62) { list.push({ kind: 'swordsman', role: 'swordsman', weapon: n >= 6 && chance(0.55) ? 'rusty_sword' : 'wooden_sword' }); continue; }
    list.push({ kind: 'brawler', role: 'brawler' });
  }
  // the brawlers come out first, the harder ones later
  list.sort((a, b) => (a.role === 'brawler' ? 0 : 1) - (b.role === 'brawler' ? 0 : 1));
  if (n % 5 === 0) list.push({ kind: 'champion', role: 'champion', boss: true });
  return list;
}

/** Health, punch and weight for a kind of enemy in round n. */
function stats(spec, n) {
  if (spec.boss) return { health: 230 + n * 18, power: 1.1 + n * 0.04, toughness: 0.45 };
  const base = { brawler: 58, swordsman: 62, shield: 70, gunner: 50 }[spec.kind] || 60;
  return { health: base + n * 6, power: 0.5 + n * 0.05, toughness: spec.kind === 'shield' ? 0.85 : 1 };
}

export class Waves {
  constructor(game) {
    this.game = game;
    this.state = 'idle';          // idle | intro | fight | cleared | rest | defeat
    this.wave = 1;
    this.t = 0;
    this.queue = [];
    this.enemies = [];
    this.killed = 0;
    this.total = 0;
    this.gateTurn = 0;
    this.gateClose = {};
    this.tokenT = 0;
    this.runKills = 0;
    this.runCoins = 0;
  }

  get fighting() { return this.state === 'intro' || this.state === 'fight'; }
  get left() { return this.total - this.killed; }
  maxAlive() { return Math.min(7, 3 + Math.floor(this.wave / 2)); }
  maxTurns() { return Math.min(4, 1 + Math.floor(this.wave / 3)); }

  /** Starts round n: shut the south doors, sound the horn, count down. */
  begin(n) {
    const g = this.game;
    this.wave = n;
    this.queue = roster(n);
    this.total = this.queue.length;
    this.killed = 0;
    this.state = 'intro';
    this.t = 3.2;
    g.arena.setGate('south', false);
    g.arena.showMarkers(false, false);
    g.emit('waveIntro', n, this.total);
  }

  /** Between rounds: the south doors open onto the plaza. */
  rest() {
    const g = this.game;
    this.state = 'rest';
    g.arena.setGate('south', true);
    g.arena.showMarkers(true, false);
    g.emit('rest', this.wave);
  }

  update(dt) {
    const g = this.game;
    this.t -= dt;
    for (const id of Object.keys(this.gateClose)) {
      this.gateClose[id] -= dt;
      if (this.gateClose[id] <= 0) {
        delete this.gateClose[id];
        // shut it once nobody is still coming through
        const busy = this.enemies.some((e) => e.alive && e.controller && e.controller.gate && e.controller.gate.id === id);
        if (busy) this.gateClose[id] = 1;
        else g.arena.setGate(id, false);
      }
    }
    if (this.state === 'intro' && this.t <= 0) {
      this.state = 'fight';
      this.t = 0;
      g.emit('waveStart', this.wave);
    }
    if (this.state === 'fight') {
      const alive = this.enemies.filter((e) => e.alive).length;
      if (this.queue.length && alive < this.maxAlive() && this.t <= 0) {
        this.spawnNext();
        this.t = rand(0.5, 1.1);
      }
      this.tokenT -= dt;
      if (this.tokenT <= 0) { this.tokenT = 0.4; this.handOutTurns(); }
      if (!this.queue.length && alive === 0) this.clear();
    }
    if (this.state === 'cleared' && this.t <= 0) this.rest();
    // in a long round the oldest bodies are carried off before it ends
    const dead = this.enemies.filter((e) => !e.alive && e.fadeAt == null);
    if (dead.length > 5) {
      dead.sort((a, b) => a.diedAt - b.diedAt);
      if (g.time - dead[0].diedAt > 8) dead[0].fadeAt = g.time;
    }
    // the dead are carried off a little while after the round
    for (const f of [...this.enemies]) {
      if (f.alive || f.fadeAt == null) continue;
      if (g.time < f.fadeAt) continue;
      const k = 1 - (g.time - f.fadeAt) / 1.5;
      if (k <= 0) { this.enemies.splice(this.enemies.indexOf(f), 1); g.removeFighter(f); }
      else f.setFade(k);
    }
  }

  spawnNext() {
    const g = this.game;
    const spec = this.queue.shift();
    const gates = GATES.filter((x) => !x.player);
    const gate = g.arena.gates[gates[this.gateTurn++ % gates.length].id];
    // stand them in the tunnel behind whoever is already waiting there
    const waiting = this.enemies.filter((e) => e.alive && e.controller && e.controller.gate === gate).length;
    const at = gate.spawn(waiting);
    const s = stats(spec, this.wave);
    const f = g.spawn(spec.kind, {
      team: 'enemy', x: at.x, z: at.z, heading: Math.atan2(-at.x, -at.z), mask: MASK.others, ...s,
    });
    const skill = Math.min(1, 0.15 + this.wave * 0.07);
    f.controller = new Brain(f, spec.role, skill);
    f.controller.gate = gate;
    f.spec = spec;
    if (spec.weapon) f.equip('weapon', spec.weapon);
    if (spec.shield) f.equip('offhand', 'wood_shield');
    if (spec.gun) f.giveGun();
    this.enemies.push(f);
    if (!g.arena.gateOpen(gate.id) && gate.target === 0) g.arena.setGate(gate.id, true);
    this.gateClose[gate.id] = 4;
    g.emit('enemySpawn', f);
    return f;
  }

  /** Only a few may close in and swing at once: the nearest, mostly. */
  handOutTurns() {
    const p = this.game.player;
    const melee = this.enemies.filter((e) => e.alive && e.controller && e.controller.role !== 'gunner');
    if (!p) { for (const e of melee) e.controller.turn = true; return; }
    melee.sort((a, b) => {
      const da = Math.hypot(a.root.x - p.root.x, a.root.z - p.root.z) - (a.controller.turn ? 0.8 : 0);
      const db = Math.hypot(b.root.x - p.root.x, b.root.z - p.root.z) - (b.controller.turn ? 0.8 : 0);
      return da - db;
    });
    const n = this.maxTurns();
    melee.forEach((e, i) => { e.controller.turn = i < n; });
    for (const e of this.enemies) if (e.controller && e.controller.role === 'gunner') e.controller.turn = true;
  }

  /** An enemy fell. */
  onDeath(f) {
    if (!this.enemies.includes(f) || f.counted) return 0;
    f.counted = true;
    f.diedAt = this.game.time;
    this.killed++;
    this.game.guns.dropLaser(f);
    if (!this.fighting) return 0;
    const coins = killReward(f.spec ? f.spec.kind : 'brawler', this.wave);
    this.runKills++;
    this.runCoins += coins;
    return coins;
  }

  clear() {
    const g = this.game;
    this.state = 'cleared';
    this.t = 2.4;
    const coins = clearReward(this.wave);
    this.runCoins += coins;
    for (const f of this.enemies) if (!f.alive) f.fadeAt = g.time + 3;
    for (const h of g.dropped) h.fadeAt = g.time + 3;
    g.emit('waveCleared', this.wave, coins);
    this.wave++;
  }

  /** You fell. */
  defeat() {
    if (this.state === 'defeat') return;
    this.state = 'defeat';
    this.queue = [];
    this.game.emit('defeat', this.wave, { kills: this.runKills, coins: this.runCoins });
  }

  /** Clears the sand of every enemy, living or dead, and forgets the run. */
  reset() {
    const g = this.game;
    for (const f of this.enemies) { g.guns.dropLaser(f); g.removeFighter(f); }
    this.enemies = [];
    this.queue = [];
    for (const h of [...g.dropped]) g.removeHeld(h);
    g.dropped.length = 0;
    for (const gate of GATES) if (!gate.player) g.arena.setGate(gate.id, false, true);
    this.gateClose = {};
    this.state = 'idle';
    this.runKills = 0;
    this.runCoins = 0;
  }
}

export { R, pick };
