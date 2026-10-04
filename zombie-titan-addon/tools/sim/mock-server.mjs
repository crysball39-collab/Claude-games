// A tiny stand-in for @minecraft/server, just enough to run the add-on's
// scripts in Node and smoke-test them (flat stone world at y = 64).
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

export const log = { sounds: [], particles: [], messages: [], commands: [], items: [], errors: [] };

export const GameMode = { Survival: "Survival", Creative: "Creative", Adventure: "Adventure", Spectator: "Spectator" };
export const Difficulty = { Peaceful: "Peaceful", Easy: "Easy", Normal: "Normal", Hard: "Hard" };
export const EquipmentSlot = { Mainhand: "Mainhand", Offhand: "Offhand", Head: "Head", Chest: "Chest", Legs: "Legs", Feet: "Feet" };

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
  afterEvents: { scriptEventReceive: listeners() },
  beforeEvents: { startup: listeners(), shutdown: listeners() },
};

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
  }
  getLore() {
    return this.lore;
  }
  setLore(l) {
    this.lore = l;
  }
}

export const BlockTypes = {
  get(id) {
    return id.startsWith("minecraft:") ? { id } : undefined;
  },
};

const stoneTop = 64;
export const blockOverrides = new Map();
function blockAt(x, y, z) {
  const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  if (blockOverrides.has(key)) return blockOverrides.get(key);
  return y < stoneTop ? "minecraft:stone" : "minecraft:air";
}

class Block {
  constructor(dim, x, y, z) {
    this.dimension = dim;
    this.location = { x, y, z };
    this.typeId = blockAt(x, y, z);
  }
  get isAir() {
    return this.typeId === "minecraft:air";
  }
  get isLiquid() {
    return this.typeId.includes("water") || this.typeId.includes("lava");
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
  "minecraft:player": ["player"],
  "minecraft:zombie": ["zombie", "monster", "mob"],
  "minecraft:skeleton": ["skeleton", "undead", "monster", "mob"],
  "minecraft:husk": ["zombie", "monster", "mob"],
  "minecraft:cow": ["cow", "mob"],
  "minecraft:villager_v2": ["villager", "mob"],
};
const HEALTH = {
  "zt:zombie_titan": 20000, "zt:zombie_minion": 30, "zt:zombie_titan_corpse": 1, "minecraft:player": 20, "minecraft:zombie": 20,
  "minecraft:villager_v2": 20, "zt:skeleton_titan": 20000, "zt:skeleton_minion": 30, "zt:skeleton_titan_corpse": 1,
  "minecraft:skeleton": 20, "minecraft:husk": 20, "minecraft:cow": 10,
};
const PROPS = {
  "zt:zombie_titan": { "zt:anim": 0, "zt:moving": false, "zt:armed": true, "zt:enraged": false, "zt:birth": false, "zt:grow": 1 },
  "zt:zombie_titan_corpse": { "zt:armed": false },
  "zt:zombie_minion": { "zt:casting": false },
  "zt:skeleton_titan": { "zt:anim": 0, "zt:moving": false, "zt:stunned": false, "zt:enraged": false, "zt:birth": false, "zt:grow": 1 },
  "zt:skeleton_minion": { "zt:casting": false },
};
const PROJECTILES = new Set(["zt:proto_ball", "zt:titan_arrow", "zt:growth_serum"]);

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
    if (typeId === "zt:zombie_minion" || typeId === "zt:skeleton_minion") this.components["minecraft:variant"] = { value: 0 };
    this.knockbacks = [];
  }
  get isValid() {
    return this.valid;
  }
  get isOnGround() {
    return Math.abs(this.location.y - stoneTop) < 0.01;
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
    if (typeof v !== typeof this.props[id]) throw new Error(`property ${id} type ${typeof v}`);
    if (id === "zt:anim" && (v < 0 || v > 15 || !Number.isInteger(v))) throw new Error("anim out of range " + v);
    if (id === "zt:grow" && (v < 0 || v > 1)) throw new Error("grow out of range " + v);
    this.props[id] = v;
  }
  getDynamicProperty(k) {
    return this.dyn[k];
  }
  setDynamicProperty(k, v) {
    this.dyn[k] = v;
  }
  triggerEvent(id) {
    this.events.push(id);
  }
  getComponent(id) {
    return this.components[id];
  }
  applyDamage(amount, opts) {
    if (!Number.isFinite(amount) || amount < 0) throw new Error("bad damage " + amount);
    const hp = this.components["minecraft:health"];
    if (!hp) return false;
    // the titan's damage sensor: immune while armed to players, allies never hurt it
    if (this.typeId === "zt:zombie_titan") {
      const src = opts?.damagingEntity;
      if (this.props["zt:birth"]) return false;
      if (src && FAMILIES[src.typeId]?.includes("zt_ally")) return false;
      if (src?.typeId === "minecraft:player" && this.props["zt:armed"]) return false;
      if (src?.typeId === "minecraft:player" && src.held?.typeId === "zt:dark_fists") amount *= this.props["zt:enraged"] ? 2.5 : 5;
      else if (this.props["zt:enraged"]) amount *= 0.5;
    }
    // the skeleton titan's damage sensor: players only hurt it while it is stunned
    if (this.typeId === "zt:skeleton_titan") {
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
    if (hp.currentValue <= 0 && this.valid) {
      world.afterEvents.entityDie.fire({ deadEntity: this, damageSource: { cause: opts?.cause, damagingEntity: opts?.damagingEntity } });
      if (this.typeId !== "minecraft:player") this.valid = false;
    }
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
    this.effects.push(id);
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
    this.cooldowns = {};
    this.xp = 0;
    this.components["minecraft:equippable"] = new Equippable(this);
    this.onScreenDisplay = {
      setActionBar: (t) => log.messages.push("[actionbar] " + t),
      setTitle: (t, o) => log.messages.push("[title] " + t),
    };
  }
  get held() {
    return this.components["minecraft:equippable"].slots.Mainhand;
  }
  getGameMode() {
    return this.gameMode;
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
    log.commands.push("anim " + a);
  }
  addExperience(n) {
    this.xp += n;
    return this.xp;
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
    const e = id === "minecraft:player" ? new Player(this, loc) : new Entity(this, id, loc);
    if (id === "zt:zombie_minion" && opts?.spawnEvent) {
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
    return {};
  }
  createExplosion(loc, r, o) {
    log.commands.push("explosion");
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
    playerLeave: listeners(),
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
