// A tiny stand-in for @minecraft/server, just enough to run the add-on's
// scripts in Node and smoke-test them (flat stone world at y = 64).
import { readFileSync } from "node:fs";
import { join } from "node:path";
const listeners = () => {
  const subs = [];
  return {
    subs,
    subscribe(fn, opts) {
      subs.push({ fn, opts });
      return fn;
    },
    unsubscribe() {},
    fire(ev) {
      for (const { fn, opts } of subs) {
        if (opts?.entityTypes) {
          const e = ev.deadEntity ?? ev.hurtEntity ?? ev.entity;
          if (e && !opts.entityTypes.includes(e.typeId)) continue;
        }
        fn(ev);
      }
    },
  };
};

export const log = { sounds: [], particles: [], messages: [], commands: [], items: [], errors: [], explosions: [], animations: [] };

export const GameMode = { Survival: "Survival", Creative: "Creative", Adventure: "Adventure", Spectator: "Spectator" };
export const Difficulty = { Peaceful: "Peaceful", Easy: "Easy", Normal: "Normal", Hard: "Hard" };
export const EquipmentSlot = { Mainhand: "Mainhand", Offhand: "Offhand", Head: "Head", Chest: "Chest", Legs: "Legs", Feet: "Feet" };
export const ItemLockMode = { inventory: "inventory", none: "none", slot: "slot" };
export const EasingType = { InOutSine: "InOutSine", Linear: "Linear", OutQuad: "OutQuad" };
export const InputPermissionCategory = { Camera: 1, Movement: 2, LateralMovement: 4, Sneak: 5, Jump: 6 };

let nextId = 1;
let tickCounter = 0;
const intervals = [];
const timeouts = [];

export const system = {
  get currentTick() {
    return tickCounter;
  },
  runInterval(fn, n = 1) {
    intervals.push({ fn, n });
    return intervals.length;
  },
  runTimeout(fn, n = 1) {
    timeouts.push({ fn, at: tickCounter + n });
    return timeouts.length;
  },
  run(fn) {
    timeouts.push({ fn, at: tickCounter });
  },
  runJob(gen) {
    jobs.push(gen);
    return jobs.length;
  },
  afterEvents: { scriptEventReceive: listeners() },
  beforeEvents: { startup: listeners(), shutdown: listeners() },
};
const jobs = [];

export function runTicks(n, each) {
  for (let i = 0; i < n; i++) {
    tickCounter++;
    for (const d of dims.values()) d._physics();
    for (const t of [...timeouts]) {
      if (t.at <= tickCounter) {
        timeouts.splice(timeouts.indexOf(t), 1);
        t.fn();
      }
    }
    // jobs get a slice of each tick, like system.runJob
    for (const job of [...jobs]) {
      for (let k = 0; k < 40; k++) {
        if (job.next().done) {
          jobs.splice(jobs.indexOf(job), 1);
          break;
        }
      }
    }
    for (const iv of intervals) if (tickCounter % iv.n === 0) iv.fn();
    // a callback returning true stops early
    if (each && each(tickCounter) === true) return;
  }
}

export class MolangVariableMap {
  constructor() {
    this.vars = {};
  }
  setFloat(k, v) {
    this.vars[k] = v;
  }
  setVector3(k, v) {
    if (![v.x, v.y, v.z].every(Number.isFinite)) throw new Error("bad vector " + k);
    this.vars[k] = v;
  }
  setColorRGB(k, v) {
    this.vars[k] = v;
  }
  setColorRGBA(k, v) {
    this.vars[k] = v;
  }
}

export class BlockVolume {
  constructor(from, to) {
    this.from = from;
    this.to = to;
  }
}

export class ItemStack {
  constructor(typeId, amount = 1) {
    if (!typeId.includes(":")) throw new Error("bad item " + typeId);
    if (amount < 1 || amount > 255) throw new Error("bad amount " + amount);
    this.typeId = typeId;
    this.amount = amount;
    this.lore = [];
    this.lockMode = "none";
    this.keepOnDeath = false;
  }
  getLore() {
    return this.lore;
  }
  setLore(l) {
    this.lore = l;
  }
}

// The blocks of one version of Minecraft (ZT_MC, default the newest in vanilla-blocks.json,
// which run.mjs puts in the working directory with custom-blocks.json for the pack's own):
// id -> { state: allowed values }. Without those files any well-formed id passes.
function loadBlocks() {
  let vanilla;
  let custom = {};
  try {
    vanilla = JSON.parse(readFileSync(join(process.cwd(), "vanilla-blocks.json"), "utf8"));
    custom = JSON.parse(readFileSync(join(process.cwd(), "custom-blocks.json"), "utf8"));
  } catch {
    return undefined;
  }
  const want = process.env.ZT_MC || vanilla.base;
  const base = vanilla.versions[vanilla.base];
  const v = vanilla.versions[want];
  if (!v) throw new Error("no block list for Minecraft " + want);
  const props = { ...base.props, ...v.props };
  const names = { ...base.blocks };
  if (want !== vanilla.base) {
    for (const id of v.removed) delete names[id];
    Object.assign(names, v.blocks);
  }
  const table = new Map();
  for (const [id, list] of Object.entries(names)) table.set(id, Object.fromEntries(list.map((k) => [k, props[k]])));
  for (const [id, states] of Object.entries(custom)) table.set(id, states);
  return { version: want, table };
}
export const blocks = loadBlocks();

function checkState(id, k, v) {
  const allowed = blocks?.table.get(id)?.[k];
  if (!blocks) {
    if (!["string", "number", "boolean"].includes(typeof v)) throw new Error("bad block state " + k);
    return;
  }
  if (!allowed) throw new Error(`block ${id} has no state ${k} in Minecraft ${blocks.version}`);
  if (!allowed.some((a) => a === v)) throw new Error(`${JSON.stringify(v)} is not a value of ${id} state ${k} in Minecraft ${blocks.version}`);
}

export const BlockTypes = {
  get(id) {
    if (blocks) return blocks.table.has(id) ? { id } : undefined;
    return id.startsWith("minecraft:") ? { id } : undefined;
  },
};

export class BlockPermutation {
  constructor(id, states) {
    this.type = { id };
    this.states = { ...(states ?? {}) };
  }
  static resolve(id, states) {
    if (typeof id !== "string" || !/^(minecraft|zt):[a-z0-9_]+$/.test(id)) throw new Error("bad block id " + id);
    if (blocks && !blocks.table.has(id)) throw new Error(`no block ${id} in Minecraft ${blocks.version}`);
    for (const [k, v] of Object.entries(states ?? {})) checkState(id, k, v);
    return new BlockPermutation(id, states);
  }
  withState(k, v) {
    checkState(this.type.id, k, v);
    return new BlockPermutation(this.type.id, { ...this.states, [k]: v });
  }
  getState(k) {
    return this.states[k];
  }
}

// Chunks a test marks as not loaded ("cx,cz"): placing or reading blocks there throws, as in the game.
export const unloadedChunks = new Set();
export class LocationInUnloadedChunkError extends Error {}
export class UnloadedChunksError extends Error {}
function chunkUnloaded(x, z) {
  return unloadedChunks.has(`${Math.floor(x / 16)},${Math.floor(z / 16)}`);
}
function areaUnloaded(a, b) {
  if (!unloadedChunks.size) return false;
  for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x) + 15; x += 16) {
    for (let z = Math.min(a.z, b.z); z <= Math.max(a.z, b.z) + 15; z += 16) {
      if (chunkUnloaded(Math.min(x, Math.max(a.x, b.x)), Math.min(z, Math.max(a.z, b.z)))) return true;
    }
  }
  return false;
}

const stoneTop = 64;
export const blockOverrides = new Map();
/** every block a script placed: "x,y,z" -> permutation */
export const placed = new Map();
function blockAt(x, y, z) {
  const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  if (blockOverrides.has(key)) return blockOverrides.get(key);
  const p = placed.get(key);
  if (p) return p.type.id;
  return y < stoneTop ? "minecraft:stone" : "minecraft:air";
}
export function blockPerm(x, y, z) {
  return placed.get(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`);
}
function placeBlock(loc, perm) {
  const key = `${Math.floor(loc.x)},${Math.floor(loc.y)},${Math.floor(loc.z)}`;
  blockOverrides.delete(key);
  placed.set(key, perm);
}

class Block {
  constructor(dim, x, y, z) {
    this.dimension = dim;
    this.location = { x, y, z };
    this.typeId = blockAt(x, y, z);
    this.permutation = blockPerm(x, y, z) ?? new BlockPermutation(this.typeId, {});
  }
  get isAir() {
    return this.typeId === "minecraft:air" || this.typeId.startsWith("minecraft:light_block");
  }
  get isLiquid() {
    return this.typeId.includes("water") || this.typeId.includes("lava");
  }
  get isSolid() {
    return !this.isAir && !/carpet|barrier|light_block|candle|lantern|chain/.test(this.typeId);
  }
}

class Component {
  constructor(owner) {
    this.owner = owner;
  }
}

class Health extends Component {
  constructor(owner, max) {
    super(owner);
    this.max = max;
    this.value = max;
  }
  get currentValue() {
    return this.value;
  }
  get effectiveMax() {
    return this.max;
  }
  setCurrentValue(v) {
    if (!Number.isFinite(v)) throw new Error("bad health " + v);
    this.value = Math.max(0, Math.min(this.max, v));
    return true;
  }
  resetToMaxValue() {
    this.value = this.max;
  }
}

// In the real API `owner` is the shooter, which scripts may set, so the
// projectile entity itself is kept separately.
class Projectile {
  constructor(entity) {
    this.entity = entity;
    this.owner = undefined;
  }
  shoot(vel) {
    if (![vel.x, vel.y, vel.z].every(Number.isFinite)) throw new Error("bad shot");
    this.entity.velocity = { ...vel };
    this.entity.flying = true;
  }
}

class Equippable extends Component {
  constructor(owner) {
    super(owner);
    this.slots = { Mainhand: undefined };
  }
  getEquipment(slot) {
    return this.slots[slot];
  }
  setEquipment(slot, item) {
    this.slots[slot] = item;
    return true;
  }
  getEquipmentSlot(slot) {
    const self = this;
    return {
      getItem: () => self.slots[slot],
      setItem: (it) => {
        self.slots[slot] = it;
      },
    };
  }
}

const FAMILIES = {
  "zt:zombie_titan": ["zombie_titan", "titan", "zt_ally", "zombie", "undead", "monster", "mob"],
  "zt:zombie_minion": ["zombie_minion", "zt_ally", "zombie", "undead", "monster", "mob"],
  "zt:zombie_titan_corpse": ["zt_ally", "inanimate"],
  "zt:proto_ball": ["zt_ally", "projectile"],
  "zt:skeleton_titan": ["skeleton_titan", "titan", "zt_ally", "skeleton", "undead", "monster", "mob"],
  "zt:skeleton_minion": ["skeleton_minion", "zt_ally", "skeleton", "undead", "monster", "mob"],
  "zt:skeleton_titan_corpse": ["zt_ally", "inanimate"],
  "zt:titan_arrow": ["zt_ally", "projectile"],
  "zt:growth_serum": ["projectile"],
  "zt:creeper_titan": ["creeper_titan", "titan", "zt_ally", "creeper", "monster", "mob"],
  "zt:creeper_minion": ["creeper_minion", "zt_ally", "creeper", "monster", "mob"],
  "zt:creeper_titan_corpse": ["zt_ally", "inanimate"],
  "minecraft:creeper": ["creeper", "monster", "mob"],
  "minecraft:player": ["player"],
  "minecraft:zombie": ["zombie", "monster", "mob"],
  "minecraft:skeleton": ["skeleton", "undead", "monster", "mob"],
  "minecraft:husk": ["zombie", "monster", "mob"],
  "minecraft:cow": ["cow", "mob"],
  "minecraft:villager_v2": ["villager", "mob"],
  "zt:figure": ["figure", "zt_figure", "monster", "mob"],
  "zt:seek": ["seek", "zt_seek", "monster", "mob"],
  "zt:figure_bar": ["zt_doors_bar", "zt_doors_prop", "inanimate"],
  "zt:seek_bar": ["zt_doors_bar", "zt_doors_prop", "inanimate"],
  "zt:figure_lure": ["zt_figure_lure", "zt_doors_prop", "inanimate"],
  "zt:hotel_door": ["zt_hotel_door", "zt_doors_prop", "inanimate"],
  "zt:library_book": ["zt_library_book", "zt_doors_prop", "inanimate"],
  "zt:library_paper": ["zt_library_paper", "zt_doors_prop", "inanimate"],
  "zt:library_lamp": ["zt_library_lamp", "zt_doors_prop", "inanimate"],
  "zt:chandelier": ["zt_chandelier", "zt_doors_prop", "inanimate"],
  "zt:seek_hand": ["zt_seek_hand", "zt_doors_prop", "inanimate"],
  "zt:seek_eye": ["zt_seek_eye", "zt_doors_prop", "inanimate"],
};
const DOORS_PROPS = new Set(["zt:figure_bar", "zt:seek_bar", "zt:figure_lure", "zt:hotel_door", "zt:library_book",
  "zt:library_paper", "zt:library_lamp", "zt:chandelier", "zt:seek_hand", "zt:seek_eye"]);
const HEALTH = {
  "zt:zombie_titan": 20000, "zt:zombie_minion": 30, "zt:zombie_titan_corpse": 1, "minecraft:player": 20, "minecraft:zombie": 20,
  "minecraft:villager_v2": 20, "zt:skeleton_titan": 20000, "zt:skeleton_minion": 30, "zt:skeleton_titan_corpse": 1,
  "minecraft:skeleton": 20, "minecraft:husk": 20, "minecraft:cow": 10,
  "zt:creeper_titan": 25000, "zt:creeper_minion": 30, "zt:creeper_titan_corpse": 1, "minecraft:creeper": 20,
  "zt:figure": 50000, "zt:seek": 1000, "zt:figure_bar": 100, "zt:seek_bar": 100, "zt:figure_lure": 1, "zt:hotel_door": 1,
  "zt:library_book": 1, "zt:library_paper": 1, "zt:library_lamp": 1, "zt:chandelier": 1, "zt:seek_hand": 1, "zt:seek_eye": 1,
};
const PROPS = {
  "zt:zombie_titan": { "zt:anim": 0, "zt:moving": false, "zt:armed": true, "zt:enraged": false, "zt:birth": false, "zt:grow": 1 },
  "zt:zombie_titan_corpse": { "zt:armed": false },
  "zt:zombie_minion": { "zt:casting": false },
  "zt:skeleton_titan": { "zt:anim": 0, "zt:moving": false, "zt:stunned": false, "zt:enraged": false, "zt:birth": false, "zt:grow": 1 },
  "zt:skeleton_minion": { "zt:casting": false },
  "zt:creeper_titan": { "zt:anim": 0, "zt:moving": false, "zt:stunned": false, "zt:enraged": false, "zt:birth": false, "zt:grow": 1 },
  "zt:creeper_titan_corpse": { "zt:fuse": 0, "zt:enraged": false },
  "zt:creeper_minion": { "zt:casting": false },
  "zt:figure": { "zt:gait": 0, "zt:act": 0 },
  "zt:seek": { "zt:anim": 0 },
  "zt:hotel_door": { "zt:open": false, "zt:locked": false, "zt:guided": false, "zt:plate": 0, "zt:yaw": 0 },
  "zt:library_lamp": { "zt:fallen": false, "zt:yaw": 0 },
  "zt:library_book": { "zt:yaw": 0 },
  "zt:library_paper": { "zt:yaw": 0 },
  "zt:chandelier": { "zt:state": 0 },
  "zt:seek_hand": { "zt:anim": 0, "zt:yaw": 0 },
  "zt:seek_eye": { "zt:pair": false, "zt:size": 1.0, "zt:yaw": 0 },
};
const PROP_RANGES = { "zt:gait": [0, 2], "zt:act": [0, 4], "zt:plate": [0, 13], "zt:state": [0, 2], "zt:size": [0.4, 2.0],
  "zt:yaw": [-180, 180] };
// The pack's own entities, read from its files by run.mjs: these win over the tables above.
const ENTITIES = (() => {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), "entities.json"), "utf8"));
  } catch {
    return {};
  }
})();
for (const [id, def] of Object.entries(ENTITIES)) {
  FAMILIES[id] = def.families;
  if (def.health !== undefined) HEALTH[id] = def.health;
  PROPS[id] = Object.fromEntries(Object.entries(def.props).map(([k, p]) => {
    const fallback = { bool: false, int: p.range?.[0] ?? 0, float: p.range?.[0] ?? 0, enum: p.values?.[0] }[p.type];
    return [k, typeof p.default === typeof fallback ? p.default : fallback];
  }));
}
/** A property value the game would refuse, as an error message (or undefined). */
function badProperty(typeId, id, v) {
  const p = ENTITIES[typeId]?.props[id];
  if (!p) return undefined;
  if (p.type === "bool") return typeof v === "boolean" ? undefined : `${id} must be true or false`;
  if (p.type === "enum") return p.values.includes(v) ? undefined : `${id} has no value ${v}`;
  if (typeof v !== "number" || !Number.isFinite(v)) return `${id} must be a number`;
  if (p.type === "int" && !Number.isInteger(v)) return `${id} must be whole: ${v}`;
  if (p.range && (v < p.range[0] || v > p.range[1])) return `${id} out of range ${v}`;
  return undefined;
}

const PROJECTILES = new Set(["zt:proto_ball", "zt:titan_arrow", "zt:growth_serum", "minecraft:fireball"]);

export class Entity {
  constructor(dim, typeId, loc) {
    this.id = String(nextId++);
    this.typeId = typeId;
    this.dimension = dim;
    this.location = { ...loc };
    this.rotation = { x: 0, y: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.valid = true;
    this.nameTag = "";
    this.props = { ...(PROPS[typeId] ?? {}) };
    this.dyn = {};
    this.effects = [];
    this.damageTaken = 0;
    this.events = [];
    this.components = {};
    if (HEALTH[typeId]) this.components["minecraft:health"] = new Health(this, HEALTH[typeId]);
    if (PROJECTILES.has(typeId)) this.components["minecraft:projectile"] = new Projectile(this);
    if (typeId === "zt:zombie_minion" || typeId === "zt:skeleton_minion" || typeId === "zt:creeper_minion") {
      this.components["minecraft:variant"] = { value: 0 };
    }
    this.knockbacks = [];
    this.isInWater = false;
    this.isSwimming = false;
    this.effectInfo = {};
  }
  get isValid() {
    return this.valid;
  }
  get isOnGround() {
    const l = this.location;
    if (Math.abs(l.y - Math.round(l.y)) > 0.01) return false;
    return new Block(this.dimension, Math.floor(l.x), Math.round(l.y) - 1, Math.floor(l.z)).isSolid;
  }
  getRotation() {
    return { ...this.rotation };
  }
  setRotation(r) {
    if (!Number.isFinite(r.y) || !Number.isFinite(r.x)) throw new Error("bad rotation");
    this.rotation = { ...r };
  }
  getProperty(id) {
    if (!(id in this.props)) throw new Error(`${this.typeId} has no property ${id}`);
    return this.props[id];
  }
  setProperty(id, v) {
    if (!(id in this.props)) throw new Error(`${this.typeId} has no property ${id}`);
    const bad = badProperty(this.typeId, id, v);
    if (bad) throw new Error(`${this.typeId}: ${bad}`);
    if (typeof v !== typeof this.props[id]) throw new Error(`property ${id} type ${typeof v}`);
    if (id === "zt:anim" && (v < 0 || v > 15 || !Number.isInteger(v))) throw new Error("anim out of range " + v);
    if (["zt:yaw", "zt:plate", "zt:gait", "zt:act", "zt:state"].includes(id) && !Number.isInteger(v)) throw new Error(id + " must be whole: " + v);
    if ((id === "zt:grow" || id === "zt:fuse") && (v < 0 || v > 1)) throw new Error(id + " out of range " + v);
    const range = PROP_RANGES[id];
    if (range && (v < range[0] || v > range[1])) throw new Error(id + " out of range " + v);
    if (this.typeId === "zt:seek" && id === "zt:anim" && v > 3) throw new Error("seek anim out of range " + v);
    if (this.typeId === "zt:seek_hand" && id === "zt:anim" && v > 2) throw new Error("hand anim out of range " + v);
    this.props[id] = v;
  }
  getDynamicProperty(k) {
    return this.dyn[k];
  }
  setDynamicProperty(k, v) {
    this.dyn[k] = v;
  }
  triggerEvent(id) {
    const def = ENTITIES[this.typeId];
    if (def && !def.events.includes(id)) throw new Error(`${this.typeId} has no event ${id}`);
    this.events.push(id);
  }
  getComponent(id) {
    return this.components[id];
  }
  applyDamage(amount, opts) {
    if (!Number.isFinite(amount) || amount < 0) throw new Error("bad damage " + amount);
    const hp = this.components["minecraft:health"];
    if (!hp) return false;
    // Doors scenery and Seek: nothing hurts them. The Figure: only weapons, and not its own kind
    if (DOORS_PROPS.has(this.typeId) || this.typeId === "zt:seek") return false;
    if (this.typeId === "zt:figure") {
      const src = opts?.damagingEntity;
      if (!["entityAttack", "projectile"].includes(opts?.cause)) return false;
      if (src && (FAMILIES[src.typeId]?.includes("zt_figure") || FAMILIES[src.typeId]?.includes("zt_seek"))) return false;
    }
    // the titan's damage sensor: immune while armed to players, allies never hurt it
    if (this.typeId === "zt:zombie_titan") {
      const src = opts?.damagingEntity;
      if (this.props["zt:birth"]) return false;
      if (src && FAMILIES[src.typeId]?.includes("zt_ally")) return false;
      if (src?.typeId === "minecraft:player" && this.props["zt:armed"]) return false;
      if (src?.typeId === "minecraft:player" && src.held?.typeId === "zt:dark_fists") amount *= this.props["zt:enraged"] ? 2.5 : 5;
      else if (this.props["zt:enraged"]) amount *= 0.5;
    }
    // the skeleton and creeper titans' damage sensors: players only hurt them while they are stunned
    if (this.typeId === "zt:creeper_titan" && ["lightning", "entityExplosion", "blockExplosion"].includes(opts?.cause)) return false;
    if (this.typeId === "zt:skeleton_titan" || this.typeId === "zt:creeper_titan") {
      const src = opts?.damagingEntity;
      if (this.props["zt:birth"]) return false;
      if (src && FAMILIES[src.typeId]?.includes("zt_ally")) return false;
      if (src?.typeId === "minecraft:player" && !this.props["zt:stunned"]) return false;
      if (opts?.cause === "projectile" && this.props["zt:enraged"]) return false;
      if (src?.typeId === "minecraft:player" && src.held?.typeId === "zt:dark_fists") amount *= this.props["zt:enraged"] ? 2.5 : 5;
      else if (this.props["zt:enraged"]) amount *= 0.5;
    }
    if (FAMILIES[this.typeId]?.includes("zt_ally") && opts?.damagingEntity && FAMILIES[opts.damagingEntity.typeId]?.includes("zt_ally")) return false;
    this.damageTaken += amount;
    hp.setCurrentValue(hp.currentValue - amount);
    world.afterEvents.entityHurt.fire({ hurtEntity: this, damage: amount, damageSource: { cause: opts?.cause, damagingEntity: opts?.damagingEntity } });
    if (hp.currentValue <= 0 && this.valid && !this.dead) {
      this.dead = true;
      world.afterEvents.entityDie.fire({ deadEntity: this, damageSource: { cause: opts?.cause, damagingEntity: opts?.damagingEntity } });
      if (this.typeId !== "minecraft:player") this.valid = false;
    }
    return true;
  }
  kill() {
    const hp = this.components["minecraft:health"];
    if (hp && hp.currentValue > 0) {
      hp.setCurrentValue(0);
      if (!this.dead) {
        this.dead = true;
        world.afterEvents.entityDie.fire({ deadEntity: this, damageSource: { cause: "override" } });
      }
    }
    if (this.typeId !== "minecraft:player") this.valid = false;
    return true;
  }
  teleport(loc, opts) {
    if (![loc.x, loc.y, loc.z].every(Number.isFinite)) throw new Error("bad teleport");
    if (!this.valid) throw new Error("teleport of removed entity");
    this.location = { x: loc.x, y: loc.y, z: loc.z };
    if (opts?.dimension && opts.dimension !== this.dimension) {
      this.dimension.entities = this.dimension.entities.filter((e) => e !== this);
      this.dimension = opts.dimension;
      opts.dimension.entities.push(this);
    }
    if (opts?.rotation) this.rotation = { ...opts.rotation };
    if (opts?.facingLocation) {
      const d = { x: opts.facingLocation.x - loc.x, z: opts.facingLocation.z - loc.z };
      this.rotation = { x: 0, y: (Math.atan2(-d.x, d.z) * 180) / Math.PI };
    }
  }
  getVelocity() {
    return { ...this.velocity };
  }
  setOnFire(seconds) {
    this.onFire = seconds;
    return true;
  }
  applyKnockback(h, v) {
    if (![h.x, h.z, v].every(Number.isFinite)) throw new Error("bad knockback");
    this.knockbacks.push({ x: h.x, z: h.z, y: v, tick: tickCounter });
  }
  applyImpulse(v) {
    if (![v.x, v.y, v.z].every(Number.isFinite)) throw new Error("bad impulse");
    if (this.typeId === "minecraft:player") throw new Error("applyImpulse on player");
    this.velocity.x += v.x;
    this.velocity.y += v.y;
    this.velocity.z += v.z;
  }
  clearVelocity() {
    this.velocity = { x: 0, y: 0, z: 0 };
  }
  addEffect(id, dur, o) {
    if (!Number.isFinite(dur) || dur <= 0) throw new Error("bad effect duration " + dur);
    this.effects.push(id);
    this.effectInfo[id] = { duration: dur, amplifier: o?.amplifier ?? 0 };
  }
  removeEffect(id) {
    const had = id in this.effectInfo;
    delete this.effectInfo[id];
    this.effects = this.effects.filter((e) => e !== id);
    return had;
  }
  getEffect(id) {
    return this.effectInfo[id];
  }
  getBlockFromViewDirection(opts) {
    const from = this.getHeadLocation();
    const dir = this.getViewDirection();
    return this.dimension.getBlockFromRay(from, dir, opts);
  }
  remove() {
    this.valid = false;
  }
  matches(opts) {
    if (opts.families) return opts.families.every((f) => FAMILIES[this.typeId]?.includes(f));
    return true;
  }
  getHeadLocation() {
    return { x: this.location.x, y: this.location.y + 1.62, z: this.location.z };
  }
  getViewDirection() {
    const yaw = (this.rotation.y * Math.PI) / 180;
    return { x: -Math.sin(yaw), y: 0, z: Math.cos(yaw) };
  }
  runCommand(cmd) {
    log.commands.push(cmd);
    return { successCount: 1 };
  }
}

export class Player extends Entity {
  constructor(dim, loc) {
    super(dim, "minecraft:player", loc);
    this.name = "Steve";
    this.gameMode = GameMode.Survival;
    this.isSneaking = false;
    this.isSprinting = false;
    this.isJumping = false;
    this.music = null;
    this.permissions = {};
    this.cameraLog = [];
    const self = this;
    this.camera = {
      isValid: true,
      setCamera(preset, opts) {
        if (preset !== "minecraft:free") throw new Error("unknown camera preset " + preset);
        self.cameraLog.push(["set", opts?.facingEntity ? "entity" : "location"]);
        self.cameraOn = true;
      },
      clear() {
        self.cameraLog.push(["clear"]);
        self.cameraOn = false;
      },
      fade(o) {
        self.cameraLog.push(["fade"]);
      },
    };
    this.inputPermissions = {
      setPermissionCategory(cat, on) {
        self.permissions[cat] = on;
      },
      isPermissionCategoryEnabled(cat) {
        return self.permissions[cat] !== false;
      },
    };
    this.cooldowns = {};
    this.xp = 0;
    this.components["minecraft:equippable"] = new Equippable(this);
    this.components["minecraft:inventory"] = { container: new Container(36) };
    this.onScreenDisplay = {
      setActionBar: (t) => log.messages.push("[actionbar] " + t),
      setTitle: (t, o) => log.messages.push("[title] " + t + (o?.subtitle ? " / " + o.subtitle : "")),
    };
  }
  get held() {
    return this.components["minecraft:equippable"].slots.Mainhand;
  }
  getGameMode() {
    return this.gameMode;
  }
  setGameMode(m) {
    if (!Object.values(GameMode).includes(m)) throw new Error("bad game mode " + m);
    this.gameMode = m;
  }
  playMusic(id, o) {
    if (typeof id !== "string") throw new Error("bad music");
    this.music = id;
  }
  stopMusic() {
    this.music = null;
  }
  playSound(id, o) {
    log.sounds.push(id);
  }
  respawn(loc) {
    const hp = this.components["minecraft:health"];
    hp.resetToMaxValue();
    this.dead = false;
    this.damageTaken = 0;
    if (loc) this.location = { ...loc };
    world.afterEvents.playerSpawn.fire({ player: this, initialSpawn: false });
  }
  sendMessage(t) {
    log.messages.push(t);
  }
  startItemCooldown(c, t) {
    this.cooldowns[c] = t;
  }
  getItemCooldown(c) {
    return this.cooldowns[c] ?? 0;
  }
  playAnimation(a, o) {
    if (typeof a !== "string" || !a.startsWith("animation.")) throw new Error("bad animation " + a);
    log.commands.push("anim " + a);
    log.animations.push([this.id, a, tickCounter]);
  }
  addExperience(n) {
    this.xp += n;
    return this.xp;
  }
}

class Container {
  constructor(size) {
    this.size = size;
    this.slots = new Array(size).fill(undefined);
  }
  get emptySlotsCount() {
    return this.slots.filter((x) => !x).length;
  }
  getItem(i) {
    if (i < 0 || i >= this.size) throw new Error("slot out of range " + i);
    return this.slots[i];
  }
  setItem(i, item) {
    if (i < 0 || i >= this.size) throw new Error("slot out of range " + i);
    this.slots[i] = item;
  }
  addItem(item) {
    const i = this.slots.findIndex((x) => !x);
    if (i < 0) return item;
    this.slots[i] = item;
    return undefined;
  }
}

class Dimension {
  constructor(id) {
    this.id = id;
    this.entities = [];
    this.heightRange = { min: -64, max: 320 };
  }
  _physics() {
    for (const e of this.entities) {
      if (!e.valid) continue;
      e.location.x += e.velocity.x;
      e.location.y += e.velocity.y;
      e.location.z += e.velocity.z;
      if (e.flying) {
        e.velocity.y -= 0.05;
        if (e.location.y <= stoneTop) {
          e.location.y = stoneTop;
          e.flying = false;
          world.afterEvents.projectileHitBlock.fire({ projectile: e, dimension: this, location: { ...e.location }, hitVector: e.velocity, source: undefined, getBlockHit: () => ({}) });
          e.valid = false;
        }
      } else if (e.typeId !== "zt:zombie_titan" && e.typeId !== "zt:zombie_titan_corpse") {
        e.velocity = { x: 0, y: 0, z: 0 };
      } else {
        e.velocity = { x: e.velocity.x * 0.91, y: e.velocity.y * 0.98, z: e.velocity.z * 0.91 };
      }
    }
    this.entities = this.entities.filter((e) => e.valid || e.typeId === "minecraft:player");
  }
  _query(opts = {}) {
    let list = this.entities.filter((e) => e.valid);
    if (opts.type) list = list.filter((e) => e.typeId === opts.type);
    if (opts.excludeFamilies) list = list.filter((e) => !opts.excludeFamilies.some((f) => FAMILIES[e.typeId]?.includes(f)));
    if (opts.families) list = list.filter((e) => opts.families.every((f) => FAMILIES[e.typeId]?.includes(f)));
    if (opts.location && opts.maxDistance !== undefined) {
      const l = opts.location;
      list = list.filter((e) => Math.hypot(e.location.x - l.x, e.location.y - l.y, e.location.z - l.z) <= opts.maxDistance);
    }
    if (opts.closest && opts.location) {
      const l = opts.location;
      list.sort((a, b) => Math.hypot(a.location.x - l.x, a.location.z - l.z) - Math.hypot(b.location.x - l.x, b.location.z - l.z));
      list = list.slice(0, opts.closest);
    }
    return list;
  }
  getEntities(opts) {
    return this._query(opts);
  }
  getPlayers(opts = {}) {
    return this._query({ ...opts, type: "minecraft:player" });
  }
  spawnEntity(id, loc, opts) {
    if (![loc.x, loc.y, loc.z].every(Number.isFinite)) throw new Error("bad spawn location");
    if (id.startsWith("zt:") && Object.keys(ENTITIES).length && !ENTITIES[id]) throw new Error("no entity " + id);
    if (opts?.spawnEvent && ENTITIES[id] && !ENTITIES[id].events.includes(opts.spawnEvent)) throw new Error(`${id} has no event ${opts.spawnEvent}`);
    const e = id === "minecraft:player" ? new Player(this, loc) : new Entity(this, id, loc);
    e.spawnEvent = opts?.spawnEvent;
    if (e.components["minecraft:variant"] && opts?.spawnEvent) {
      e.components["minecraft:variant"].value = { "zt:as_loyalist": 0, "zt:as_priest": 1, "zt:as_zealot": 2, "zt:as_templar": 3 }[opts.spawnEvent];
    }
    this.entities.push(e);
    timeouts.push({ fn: () => world.afterEvents.entitySpawn.fire({ entity: e, cause: "Spawned" }), at: tickCounter });
    return e;
  }
  spawnItem(item, loc) {
    log.items.push([item.typeId, item.amount]);
    return new Entity(this, "minecraft:item", loc);
  }
  spawnParticle(id, loc, vars) {
    if (![loc.x, loc.y, loc.z].every(Number.isFinite)) throw new Error("bad particle location " + id);
    log.particles.push(id);
  }
  playSound(id, loc, o) {
    if (![loc.x, loc.y, loc.z].every(Number.isFinite)) throw new Error("bad sound location " + id);
    log.sounds.push(id);
  }
  getBlock(l) {
    if (l.y < this.heightRange.min || l.y >= this.heightRange.max) throw new Error("LocationOutOfWorldBoundaries");
    if (chunkUnloaded(l.x, l.z)) throw new LocationInUnloadedChunkError("location is in an unloaded chunk");
    return new Block(this, Math.floor(l.x), Math.floor(l.y), Math.floor(l.z));
  }
  getTopmostBlock(xz) {
    return new Block(this, Math.floor(xz.x), stoneTop - 1, Math.floor(xz.z));
  }
  getBlockFromRay(origin, dir, opts) {
    for (let d = 0; d < (opts?.maxDistance ?? 64); d += 0.25) {
      const p = { x: origin.x + dir.x * d, y: origin.y + dir.y * d, z: origin.z + dir.z * d };
      const b = this.getBlock(p);
      if (!b.isAir) return { block: b, face: "Up", faceLocation: { x: p.x - b.location.x, y: p.y - b.location.y, z: p.z - b.location.z } };
    }
    return undefined;
  }
  fillBlocks(vol, block, opts) {
    log.commands.push("fill");
    const a = vol.from;
    const b = vol.to;
    const n = (Math.abs(b.x - a.x) + 1) * (Math.abs(b.y - a.y) + 1) * (Math.abs(b.z - a.z) + 1);
    if (n > 32768) throw new Error("fill too large: " + n);
    if (typeof block === "string") BlockPermutation.resolve(block);
    else if (!(block instanceof BlockPermutation)) throw new Error("not a block");
    if (areaUnloaded(a, b)) throw new UnloadedChunksError("the area has unloaded chunks");
    if (block instanceof BlockPermutation) {
      for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) {
        for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) {
          for (let z = Math.min(a.z, b.z); z <= Math.max(a.z, b.z); z++) placeBlock({ x, y, z }, block);
        }
      }
    }
    return {};
  }
  setBlockPermutation(loc, perm) {
    if (!(perm instanceof BlockPermutation)) throw new Error("not a permutation");
    if (![loc.x, loc.y, loc.z].every(Number.isInteger)) throw new Error("block location not whole: " + JSON.stringify(loc));
    if (chunkUnloaded(loc.x, loc.z)) throw new LocationInUnloadedChunkError("location is in an unloaded chunk");
    placeBlock(loc, perm);
  }
  setBlockType(loc, id) {
    const perm = BlockPermutation.resolve(id);
    if (chunkUnloaded(loc.x, loc.z)) throw new LocationInUnloadedChunkError("location is in an unloaded chunk");
    placeBlock(loc, perm);
  }
  createExplosion(loc, r, o) {
    if (![loc.x, loc.y, loc.z, r].every(Number.isFinite)) throw new Error("bad explosion");
    log.commands.push("explosion");
    log.explosions.push({ ...loc, radius: r, breaksBlocks: !!o?.breaksBlocks, tick: tickCounter });
    return true;
  }
  runCommand(c) {
    log.commands.push(c);
    return { successCount: 1 };
  }
}

const dims = new Map([
  ["overworld", new Dimension("minecraft:overworld")],
  ["nether", new Dimension("minecraft:nether")],
  ["the_end", new Dimension("minecraft:the_end")],
]);

const worldDyn = {};
export const world = {
  timeOfDay: 14000,
  difficulty: Difficulty.Normal,
  gameRules: { mobGriefing: true, doMobLoot: true, pvp: true },
  afterEvents: {
    entitySpawn: listeners(),
    entityDie: listeners(),
    entityHurt: listeners(),
    entityHitEntity: listeners(),
    projectileHitBlock: listeners(),
    projectileHitEntity: listeners(),
    itemUse: listeners(),
    itemStartUse: listeners(),
    itemCompleteUse: listeners(),
    playerBreakBlock: listeners(),
    playerSpawn: listeners(),
    playerLeave: listeners(),
    playerInteractWithEntity: listeners(),
  },
  getDimension(id) {
    const d = dims.get(id.replace("minecraft:", ""));
    if (!d) throw new Error("no dimension " + id);
    return d;
  },
  getAllPlayers() {
    return [...dims.values()].flatMap((d) => d.entities.filter((e) => e.typeId === "minecraft:player"));
  },
  getEntity(id) {
    for (const d of dims.values()) for (const e of d.entities) if (e.id === id && e.valid) return e;
    return undefined;
  },
  getTimeOfDay() {
    return this.timeOfDay;
  },
  getAbsoluteTime() {
    return tickCounter + 100000;
  },
  getDifficulty() {
    return this.difficulty;
  },
  getDynamicProperty(k) {
    return worldDyn[k];
  },
  setDynamicProperty(k, v) {
    worldDyn[k] = v;
  },
  sendMessage(t) {
    log.messages.push(t);
  },
};
