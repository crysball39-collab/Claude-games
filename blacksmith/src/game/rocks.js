/* =============================================================================
   The rocks in the cave, and what happens when you hit them.

   Pebbles, rocks and boulders, each with its own health and its own number of
   ores inside. When one breaks, its ores leap out and fly to you, each rolled
   on the ore table as it comes. A broken rock is replaced a little later
   somewhere else, so the cave never runs dry.
   ========================================================================== */
import { Group, Mesh, MeshLambertMaterial, Color, Vector3 } from 'three';
import { ROCKS, ROCK_COUNTS, ROCK_RESPAWN, rollMinedOre } from './data.js';
import { rockGeometry } from './geo.js';
import { rockTexture } from './textures.js';
import { Bar3D } from './fx.js';
import { makeRng, angleDelta } from '../core/util.js';

const LOOK = {
  pebble: { color: '#b3aca3', speck: '#8a837a', squash: 0.62, detail: 1 },
  rock: { color: '#948d86', speck: '#6f6962', squash: 0.72, detail: 1 },
  boulder: { color: '#77727a', speck: '#57525a', squash: 0.82, detail: 2 },
};

export class RockField {
  constructor({ scene, collider, spots, fx }) {
    this.scene = scene;
    this.collider = collider;
    this.spots = spots;
    this.fx = fx;
    this.rng = makeRng(4242);
    this.rocks = [];
    this.pending = [];          // { kind, at } waiting to grow back
    this.time = 0;
    this.texture = rockTexture(128, { seed: 33 });
    this.materials = {};
    for (const kind of Object.keys(ROCKS)) {
      this.materials[kind] = new MeshLambertMaterial({ map: this.texture, color: LOOK[kind].color });
    }
    // a few shapes of each, shared
    this.geos = {};
    for (const kind of Object.keys(ROCKS)) {
      this.geos[kind] = [0, 1, 2, 3].map((i) => rockGeometry(ROCKS[kind].radius, {
        seed: i * 97 + kind.length * 13, detail: LOOK[kind].detail, squash: LOOK[kind].squash, rough: 0.3,
      }));
    }
  }

  /** Fills the cave: every kind up to its count. */
  populate(avoid = null) {
    for (const [kind, n] of Object.entries(ROCK_COUNTS)) {
      for (let i = 0; i < n; i++) this.spawn(kind, avoid);
    }
  }

  _freeSpot(kind, avoid) {
    const r = ROCKS[kind].radius;
    const options = this.spots.filter((s) =>
      !this.rocks.some((k) => (k.x - s.x) ** 2 + (k.z - s.z) ** 2 < (k.radius + r + 1.2) ** 2) &&
      (!avoid || (avoid.x - s.x) ** 2 + (avoid.z - s.z) ** 2 > 5 * 5));
    if (!options.length) return null;
    return options[Math.floor(this.rng() * options.length)];
  }

  spawn(kind, avoid = null) {
    const spot = this._freeSpot(kind, avoid);
    if (!spot) return null;
    const def = ROCKS[kind];
    const group = new Group();
    group.position.set(spot.x, 0, spot.z);
    group.rotation.y = spot.ry + this.rng() * 2;
    const mesh = new Mesh(this.geos[kind][Math.floor(this.rng() * 4)], this.materials[kind]);
    mesh.castShadow = true;
    group.add(mesh);
    const height = mesh.geometry.boundingBox.max.y;
    const bar = new Bar3D(kind === 'boulder' ? 1.2 : 0.8, 0.1, '#f2c03a');
    bar.group.position.set(0, height + 0.45, 0);
    group.add(bar.group);
    this.scene.add(group);
    const rock = {
      kind, def, hp: def.hp, maxHp: def.hp, x: spot.x, z: spot.z, radius: def.radius, height,
      group, mesh, bar, barTime: 0, shake: 0, grow: 0,
      shape: this.collider.circle(spot.x, spot.z, def.radius * 0.92, { h: height, data: null, camera: false }),
    };
    rock.shape.data = rock;
    this.rocks.push(rock);
    return rock;
  }

  /**
   * The rock you would hit swinging from `pos` facing `yaw`: the nearest one
   * whose near side is within `reach`, in front of you or nearly touching.
   */
  target(pos, yaw, reach = 1.9) {
    let best = null, bestScore = Infinity;
    for (const r of this.rocks) {
      if (r.hp <= 0) continue;
      const dx = r.x - pos.x, dz = r.z - pos.z;
      const d = Math.hypot(dx, dz) - r.radius;
      if (d > reach) continue;
      const off = Math.abs(angleDelta(yaw, Math.atan2(dx, dz)));
      if (off > 1.9 && d > 0.6) continue;
      const score = d + off * 0.6;
      if (score < bestScore) { bestScore = score; best = r; }
    }
    return best;
  }

  /**
   * A pickaxe lands. Returns what happened: 'tough' (this pickaxe cannot
   * touch it), 'hit', or 'broke' along with the ores it drops.
   */
  hit(rock, damage, tier, from) {
    if (!rock || rock.hp <= 0) return { result: 'none' };
    const at = this._contact(rock, from);
    rock.shake = 0.18;
    rock.barTime = 3;
    rock.bar.group.visible = true;
    if (tier < rock.def.tier) {
      this.fx.sparks(at, 8, { color: new Color('#ffe9b0'), speed: 3, up: 2 });
      return { result: 'tough', at };
    }
    rock.hp = Math.max(0, rock.hp - damage);
    rock.bar.set(rock.hp / rock.maxHp);
    const shade = LOOK[rock.kind].color;
    this.fx.debris(at, 4, shade, { speed: 2.4, size: 0.07 });
    this.fx.sparks(at, 4, { speed: 2.5, up: 1.6, size: 0.05 });
    if (rock.hp > 0) return { result: 'hit', at, damage };
    // broken: it bursts, and its ores are rolled one by one
    const center = new Vector3(rock.x, rock.height * 0.5, rock.z);
    this.fx.debris(center, 14 + rock.def.drops * 3, shade, { speed: 4, size: 0.1 + rock.radius * 0.08 });
    this.fx.dust(center, 6, { size: rock.radius * 1.2 });
    const ores = [];
    for (let i = 0; i < rock.def.drops; i++) ores.push(rollMinedOre());
    this._remove(rock);
    const [lo, hi] = ROCK_RESPAWN;
    this.pending.push({ kind: rock.kind, at: this.time + lo + this.rng() * (hi - lo) });
    return { result: 'broke', at: center, damage, ores };
  }

  /** Where a swing from `from` meets this rock's surface. */
  _contact(rock, from) {
    const dx = from.x - rock.x, dz = from.z - rock.z;
    const d = Math.hypot(dx, dz) || 1;
    return new Vector3(rock.x + (dx / d) * rock.radius * 0.8, Math.min(rock.height * 0.7, 0.9), rock.z + (dz / d) * rock.radius * 0.8);
  }

  _remove(rock) {
    rock.hp = 0;
    this.collider.remove(rock.shape);
    rock.group.removeFromParent();
    rock.bar.dispose();
    this.rocks.splice(this.rocks.indexOf(rock), 1);
  }

  update(dt, player) {
    this.time += dt;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.pending[i].at > this.time) continue;
      const rock = this.spawn(this.pending[i].kind, player);
      if (rock) {
        rock.grow = 0.001;
        this.pending.splice(i, 1);
      } else {
        this.pending[i].at = this.time + 3;
      }
    }
    for (const r of this.rocks) {
      if (r.shake > 0) {
        r.shake -= dt;
        const k = Math.max(0, r.shake) / 0.18;
        r.mesh.position.set((Math.random() - 0.5) * 0.08 * k, 0, (Math.random() - 0.5) * 0.08 * k);
        r.mesh.scale.setScalar(1 + 0.05 * k);
      }
      if (r.grow > 0) {
        // grows back up out of the floor
        r.grow = Math.min(1, r.grow + dt * 1.6);
        const s = 1 - Math.pow(1 - r.grow, 3);
        r.mesh.scale.set(1, s, 1);
        r.mesh.position.y = 0;
        if (r.grow >= 1) r.grow = 0;
      }
      if (r.barTime > 0) {
        r.barTime -= dt;
        if (r.barTime <= 0) r.bar.group.visible = false;
      }
    }
  }

  /** Puts everything back for a fresh visit, as it is when you first walk in. */
  reset(player = null) {
    for (const r of [...this.rocks]) this._remove(r);
    this.pending.length = 0;
    this.populate(player);
  }

  dispose() {
    for (const r of [...this.rocks]) this._remove(r);
    for (const list of Object.values(this.geos)) for (const g of list) g.dispose();
    for (const m of Object.values(this.materials)) m.dispose();
    this.texture.dispose();
  }
}
