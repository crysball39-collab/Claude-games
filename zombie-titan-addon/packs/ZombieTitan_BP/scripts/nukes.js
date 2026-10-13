// The nukes: the Nuke Silo and the Missile Silo; Little Boy, Fat Man and the Doomsday Missile.
//
// A silo is placed from its item and tapped for its controls: load a payload (or use one on the
// silo), aim it at any x y z (~ for the silo's own, "ground" for wherever the ground is), open
// the hatch doors and activate: a siren and ten seconds counting down, then the launch. The
// rocket climbs out of sight, flies (from eight seconds to a minute, by how far) and comes down
// on its target (anyone near it hears the whistle and sees it fall), and goes off. A flash; a
// shockwave running out at the speed of sound with the boom, hurting and throwing what it
// reaches, less the farther out (2500 blocks for Little Boy, 4000 for Fat Man, 1500 for the
// Doomsday Missile); and a mushroom cloud with smoke rolling out from its foot, which every
// player sees however far off (each is shown their own, drawn nearer and smaller). Within 500
// blocks of a nuke (200 of the missile) everything turns to ash round a crater; out to half the
// blast's reach leaves, grass and flowers burn away and glass shatters, and glass shatters to
// its edge. What isn't loaded when it goes off changes when it is (each chunk once: the sites
// remember which). radiation.js reads the sites for the fallout.
import { BlockTypes, BlockVolume, GameMode, ItemStack, MolangVariableMap, system, world } from "@minecraft/server";
import { ActionFormData, MessageFormData, ModalFormData } from "@minecraft/server-ui";
import * as Doors from "./doors_common.js";
import * as U from "./util.js";

/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/**
 * Where a payload went off: k its kind, d its dimension, t the world's time then; g the ground
 * under it (once that's been loaded), s set for one that went off on the ground.
 * @typedef {{ id: number, k: number, d: string, x: number, y: number, z: number, t: number, g?: number, s?: number }} Site
 * A payload on its way: at the world's time it gets there; gr set when it's aimed at the ground.
 * @typedef {{ id: number, k: number, d: string, x: number, y: number, z: number, at: number, gr?: number }} Flight
 * @typedef {{ x: number, y: number, z: number, ground?: boolean }} Target
 */

export const NUKE_SILO = "zt:nuke_silo";
export const MISSILE_SILO = "zt:missile_silo";
export const SILOS = [NUKE_SILO, MISSILE_SILO];
export const ROCKET = "zt:nuke_rocket";
export const CLOUD = "zt:mushroom_cloud";
export const ASH = "zt:ash";

/**
 * The payloads, by item. kind: the rocket's zt:kind (a silo's zt:payload is kind + 1); blast: how
 * far its shockwave hurts; ash: within this everything is ash; crater, depth: the hole it
 * leaves; fallout: how far its radiation reaches (radiation.js; 0: none); cloud: how tall its
 * mushroom cloud grows.
 */
export const PAYLOADS = {
  "zt:little_boy": { kind: 0, name: "Little Boy", silo: NUKE_SILO, blast: 2500, ash: 500, crater: 28, depth: 14, fallout: 3000, cloud: 260 },
  "zt:fat_man": { kind: 1, name: "Fat Man", silo: NUKE_SILO, blast: 4000, ash: 500, crater: 36, depth: 18, fallout: 5000, cloud: 320 },
  "zt:doomsday_missile": { kind: 2, name: "Doomsday Missile", silo: MISSILE_SILO, blast: 1500, ash: 200, crater: 20, depth: 10, fallout: 0,
    cloud: 180 },
};
/** @typedef {typeof PAYLOADS["zt:little_boy"]} Payload */
const KINDS = Object.entries(PAYLOADS).sort((a, b) => a[1].kind - b[1].kind);
/** @param {number} kind @returns {Payload} */
export function payload(kind) {
  return KINDS[kind]?.[1] ?? KINDS[0][1];
}
/** @param {number} kind */
export function payloadItem(kind) {
  return KINDS[kind]?.[0];
}

export const CFG = {
  /** Seconds a silo counts down. */
  countdown: 10,
  /** The doors take as long to open (gen_nuke_anims.py). */
  doorTicks: 60,
  /** How long the rocket is seen climbing out of the silo. */
  climbTicks: 120,
  /** @param {number} dist @returns {number} seconds a payload flies to a target `dist` blocks off */
  flightSeconds: (dist) => Math.min(60, Math.max(8, 6 + dist / 120)),
  /** Players this near the target see it fall, for this long, from this high. */
  nearTarget: 256,
  fallTicks: 90,
  fallHeight: 110,
  /** Blocks a tick the shockwave (and its boom) runs: the speed of sound. */
  wave: 17,
  /** Seconds a mushroom cloud lasts (gen_nuke_anims.py has it drift apart from 150). */
  cloudLife: 180,
  /** A cloud farther than this from a player is drawn this far off, smaller to match. */
  proxyDist: 40,
  cloudView: 8000,
  /** Chunks this far round each player are made ash, burnt or shattered. */
  processRadius: 4,
  chunksPerTick: 3,
  /** Milliseconds a tick may spend on them (at least one chunk a tick is seen to). */
  msPerTick: 8,
  /** How deep the ash goes below the ground at the ash zone's edge (deeper toward ground zero),
   * and how far above the ground things are changed. */
  ashDepth: 8,
  above: 24,
  maxSites: 40,
};

// =============================================================================================
// What's remembered: the sites and the payloads in flight
// =============================================================================================
const SITES = "zt:nuke_sites";
const FLIGHTS = "zt:nuke_flights";
let ready = false;
/** @type {Site[]} */
let siteList = [];
/** @type {Flight[]} */
let flightList = [];
let nextId = 1;
let sitesDirty = false;

function loadState() {
  ready = true;
  try {
    siteList = JSON.parse(String(world.getDynamicProperty(SITES) ?? "[]"));
  } catch {
    siteList = [];
  }
  try {
    flightList = JSON.parse(String(world.getDynamicProperty(FLIGHTS) ?? "[]"));
  } catch {
    flightList = [];
  }
  if (!Array.isArray(siteList)) siteList = [];
  if (!Array.isArray(flightList)) flightList = [];
  nextId = Math.max(0, ...siteList.map((s) => s.id), ...flightList.map((f) => f.id)) + 1;
}
function saveSites() {
  sitesDirty = false;
  try {
    world.setDynamicProperty(SITES, JSON.stringify(siteList));
  } catch {
    /* ignore */
  }
}
function saveFlights() {
  try {
    world.setDynamicProperty(FLIGHTS, JSON.stringify(flightList));
  } catch {
    /* ignore */
  }
}
/** The places payloads have gone off (radiation.js reads them). @returns {Site[]} */
export function sites() {
  if (!ready) loadState();
  return siteList;
}
/** The payloads on their way. @returns {Flight[]} */
export function flights() {
  if (!ready) loadState();
  return flightList;
}
/** Forgets everything in memory and reads it back, as when the world is opened again (for tests). */
export function reload() {
  bitsOf.clear();
  queue.length = 0;
  queued.clear();
  loadState();
}

// =============================================================================================
// Small helpers
// =============================================================================================
/** @param {number} n */
function fmt(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
/** @param {Vector3} a @param {{x: number, z: number}} b */
function flat(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
/** Which way b is from a, in words. @param {Vector3} a @param {{x: number, z: number}} b */
function compass(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (Math.hypot(dx, dz) < 1) return "right here";
  const names = ["south", "south-west", "west", "north-west", "north", "north-east", "east", "south-east"];
  const yaw = (Math.atan2(-dx, dz) * 180) / Math.PI;
  return names[((Math.round(yaw / 45) % 8) + 8) % 8];
}
/** @param {Entity} e @param {string} id @param {any} v */
function prop(e, id, v) {
  try {
    e.setProperty(id, v);
  } catch {
    /* ignore */
  }
}
/** @param {Entity} e @param {string} id */
function getProp(e, id) {
  try {
    return e.getProperty(id);
  } catch {
    return undefined;
  }
}
/** @param {Player} p */
function creative(p) {
  try {
    return p.getGameMode() === GameMode.Creative;
  } catch {
    return false;
  }
}
/** @param {Player} p @param {string} id @param {Vector3} at @param {Record<string, number>} [vars] */
function playerParticle(p, id, at, vars) {
  try {
    if (vars) {
      const m = new MolangVariableMap();
      for (const [k, v] of Object.entries(vars)) m.setFloat("variable." + k, v);
      p.spawnParticle(id, at, m);
    } else p.spawnParticle(id, at);
  } catch {
    /* ignore */
  }
}
/** @param {Player} p @param {number} strength @param {number} seconds */
function shake(p, strength, seconds) {
  try {
    p.runCommand(`camerashake add @s ${strength.toFixed(2)} ${seconds.toFixed(2)} positional`);
  } catch {
    /* ignore */
  }
}
/** Tells every player within `radius` of an entity. @param {Entity} e @param {number} radius @param {string} text */
function tellNear(e, radius, text) {
  try {
    for (const p of e.dimension.getPlayers({ location: e.location, maxDistance: radius })) p.sendMessage(text);
  } catch {
    /* ignore */
  }
}
/** @param {Dimension} dim @param {number} x @param {number} y @param {number} z */
function idAt(dim, x, y, z) {
  try {
    return dim.getBlock({ x, y, z })?.typeId;
  } catch {
    return undefined;
  }
}
/** Air, water and the like, and the plants a bomb falls through. */
const OPEN = /^minecraft:(air|cave_air|void_air|water|flowing_water|lava|flowing_lava|short_grass|tall_grass|fern|large_fern|vine|snow_layer|deadbush|bush|light_block.*)$|_leaves$|_flower$|_sapling$/;

// =============================================================================================
// The silos
// =============================================================================================
/** @type {Map<string, number>} silo id -> when its doors last moved */
const doorsMovedAt = new Map();
/** @typedef {{ silo: Entity, dim: Dimension, kind: number, target: Target, start: number }} Countdown */
/** @type {Map<string, Countdown>} silo id -> its countdown */
export const countdowns = new Map();

/** What a silo holds, where it's aimed, whether it's open. @param {Entity} silo */
export function siloState(silo) {
  let target;
  try {
    const s = silo.getDynamicProperty("zt:target");
    target = typeof s === "string" ? /** @type {Target} */ (JSON.parse(s)) : undefined;
  } catch {
    target = undefined;
  }
  return {
    payload: Number(getProp(silo, "zt:payload") ?? 0),
    open: !!getProp(silo, "zt:open"),
    stage: Number(getProp(silo, "zt:stage") ?? 0),
    target,
  };
}
/** @param {Entity} silo */
function doorsReady(silo) {
  return siloState(silo).open && system.currentTick - (doorsMovedAt.get(silo.id) ?? -1e9) >= CFG.doorTicks;
}
/** What has to be done before it can launch, or undefined. @param {Entity} silo */
function missing(silo) {
  const st = siloState(silo);
  if (!st.payload) return silo.typeId === NUKE_SILO ? "Load a nuke first: Little Boy or Fat Man." : "Load a Doomsday Missile first.";
  if (!st.target) return "Set a target first.";
  if (!st.open) return "Open the doors first.";
  if (!doorsReady(silo)) return "The doors are still opening.";
  if (countdowns.has(silo.id)) return "It's already counting down.";
  return undefined;
}
/** @param {Target} t */
function targetText(t) {
  return `${t.x} ${t.ground ? "ground" : t.y} ${t.z}`;
}

/**
 * A player tapped a silo: holding a payload, they load it; otherwise its controls open.
 * @param {Player} player @param {Entity} silo @returns {boolean} whether it was a silo
 */
export function onInteract(player, silo) {
  if (!SILOS.includes(silo.typeId)) return false;
  // (a countdown the world was closed during is over)
  if (siloState(silo).stage === 1 && !countdowns.has(silo.id)) prop(silo, "zt:stage", 0);
  let held;
  try {
    held = player.getComponent("minecraft:equippable")?.getEquipment(/** @type {any} */ ("Mainhand"));
  } catch {
    held = undefined;
  }
  if (held && held.typeId in PAYLOADS) load(player, silo, held.typeId, true);
  else panel(player, silo);
  return true;
}

/** @param {Player} player @param {string} id */
function countOf(player, id) {
  let n = 0;
  try {
    const inv = player.getComponent("minecraft:inventory")?.container;
    if (!inv) return 0;
    for (let i = 0; i < inv.size; i++) {
      const it = inv.getItem(i);
      if (it?.typeId === id) n += it.amount;
    }
  } catch {
    /* ignore */
  }
  return n;
}
/** Takes one `id` from the player: from their hand, or anywhere in their inventory. @param {Player} player @param {string} id @param {boolean} fromHand */
function takeOne(player, id, fromHand) {
  if (creative(player)) return true;
  try {
    if (fromHand) {
      const eq = player.getComponent("minecraft:equippable");
      const it = eq?.getEquipment(/** @type {any} */ ("Mainhand"));
      if (!eq || !it || it.typeId !== id) return false;
      if (it.amount <= 1) eq.setEquipment(/** @type {any} */ ("Mainhand"), undefined);
      else {
        it.amount -= 1;
        eq.setEquipment(/** @type {any} */ ("Mainhand"), it);
      }
      return true;
    }
    const inv = player.getComponent("minecraft:inventory")?.container;
    if (!inv) return false;
    for (let i = 0; i < inv.size; i++) {
      const it = inv.getItem(i);
      if (it?.typeId !== id) continue;
      if (it.amount <= 1) inv.setItem(i, undefined);
      else {
        it.amount -= 1;
        inv.setItem(i, it);
      }
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
/** @param {Player} player @param {string} id */
function give(player, id) {
  if (creative(player)) return;
  const item = new ItemStack(id, 1);
  try {
    const left = player.getComponent("minecraft:inventory")?.container?.addItem(item);
    if (left) player.dimension.spawnItem(left, player.location);
  } catch {
    try {
      player.dimension.spawnItem(item, player.location);
    } catch {
      /* ignore */
    }
  }
}

/** @param {Player} player @param {Entity} silo @param {string} id @param {boolean} fromHand */
function load(player, silo, id, fromHand) {
  const spec = PAYLOADS[/** @type {keyof typeof PAYLOADS} */ (id)];
  if (!spec || !U.isValid(silo)) return;
  if (spec.silo !== silo.typeId) {
    player.sendMessage(spec.silo === NUKE_SILO ? `§c${spec.name} is a nuke: it goes in a Nuke Silo.` :
      "§cThe Doomsday Missile is a missile, not a nuke: it goes in a Missile Silo.");
    return;
  }
  const st = siloState(silo);
  if (countdowns.has(silo.id)) return;
  if (st.payload) {
    player.sendMessage(`§cThe silo already holds ${payload(st.payload - 1).name}.`);
    return;
  }
  if (!takeOne(player, id, fromHand)) {
    player.sendMessage(`§cYou have no ${spec.name}.`);
    return;
  }
  prop(silo, "zt:payload", spec.kind + 1);
  U.sound(silo.dimension, "random.anvil_land", silo.location, 0.6, 0.6);
  player.sendMessage(`§a${spec.name} loaded.` + (st.target ? "" : " §7Now set a target."));
}
/** @param {Player} player @param {Entity} silo */
function unload(player, silo) {
  const st = siloState(silo);
  if (!st.payload || countdowns.has(silo.id)) return;
  prop(silo, "zt:payload", 0);
  const id = payloadItem(st.payload - 1);
  if (id) give(player, id);
  player.sendMessage(`§e${payload(st.payload - 1).name} unloaded.`);
}
/** @param {Entity} silo @param {boolean} open */
function setDoors(silo, open) {
  if (siloState(silo).open === open || countdowns.has(silo.id)) return;
  prop(silo, "zt:open", open);
  doorsMovedAt.set(silo.id, system.currentTick);
  U.sound(silo.dimension, "zt.silo.doors", silo.location);
}
/** @param {Player} player @param {Entity} silo */
function pickUp(player, silo) {
  const st = siloState(silo);
  if (st.payload || st.open || countdowns.has(silo.id)) return;
  give(player, silo.typeId);
  try {
    silo.remove();
  } catch {
    /* ignore */
  }
}

/** The silo's controls. @param {Player} player @param {Entity} silo */
export function panel(player, silo) {
  if (!U.isValid(silo)) return;
  const st = siloState(silo);
  const spec = st.payload ? payload(st.payload - 1) : undefined;
  const nuke = silo.typeId === NUKE_SILO;
  const c = countdowns.get(silo.id);
  const why = missing(silo);
  const lines = [
    "§lPayload:§r " + (spec ? `${spec.name} §7(blast radius ${fmt(spec.blast)} blocks)` : "§7empty"),
    "§lTarget:§r " + (st.target ? `${targetText(st.target)} §7(${fmt(flat(silo.location, st.target))} blocks ${compass(silo.location, st.target)})` :
      "§7not set"),
    "§lDoors:§r " + (st.open ? (doorsReady(silo) ? "open" : "opening...") : "closed"),
    "§lStatus:§r " + (c ? `§c§lLAUNCHING IN ${Math.max(1, CFG.countdown - Math.floor((system.currentTick - c.start) / 20))}` :
      why ? "§e" + why : "§a§lREADY TO LAUNCH"),
  ];
  if (!spec) lines.push("", nuke ? "§7Use Little Boy or Fat Man on the silo to load it." : "§7Use a Doomsday Missile on the silo to load it.");
  const form = new ActionFormData().title(nuke ? "Nuke Silo" : "Missile Silo").body(lines.join("\n"));
  /** @type {(() => void)[]} */
  const actions = [];
  /** @param {string} text @param {string | undefined} icon @param {() => void} fn */
  const add = (text, icon, fn) => {
    form.button(text, icon);
    actions.push(fn);
  };
  if (c) add("§c§lABORT LAUNCH", undefined, () => abort(silo, player));
  else {
    add("Set Target", undefined, () => targetForm(player, silo));
    if (!spec) {
      for (const [id, p] of KINDS) {
        if (p.silo !== silo.typeId || !(creative(player) || countOf(player, id) > 0)) continue;
        add("Load " + p.name, "textures/items/zt_" + id.split(":")[1], () => load(player, silo, id, false));
      }
    } else add("Unload " + spec.name, undefined, () => unload(player, silo));
    add(st.open ? "Close Doors" : "Open Doors", undefined, () => setDoors(silo, !st.open));
    add("§4§lACTIVATE", undefined, () => activate(player, silo));
    if (!spec && !st.open) add("Pick Up Silo", "textures/items/zt_" + silo.typeId.split(":")[1], () => pickUp(player, silo));
  }
  form.show(player).then((r) => {
    if (r.canceled || r.selection === undefined || !U.isValid(silo)) return;
    actions[r.selection]?.();
  }).catch(() => {});
}

/** A coordinate as typed: a number, or ~ (and a number) from `base`. @param {string} s @param {number} base */
export function coord(s, base) {
  const t = s.trim();
  if (!t) return NaN;
  if (t.startsWith("~")) {
    const rest = t.slice(1).trim();
    return Math.floor(base) + (rest ? Number(rest) : 0);
  }
  return Number(t);
}
/** @param {Player} player @param {Entity} silo */
function targetForm(player, silo) {
  const t = siloState(silo).target;
  new ModalFormData()
    .title("Target")
    .textField("X", "a number, or ~ for the silo's own (~100: 100 east of it)", { defaultValue: t ? String(t.x) : "" })
    .textField("Y", "a number, ~, or ground", { defaultValue: t ? (t.ground ? "ground" : String(t.y)) : "ground" })
    .textField("Z", "a number, or ~ (~-100: 100 north of the silo)", { defaultValue: t ? String(t.z) : "" })
    .submitButton("Set Target")
    .show(player)
    .then((r) => {
      if (r.canceled || !r.formValues || !U.isValid(silo)) return;
      const v = r.formValues.map((x) => String(x ?? ""));
      const base = silo.location;
      const ground = /^\s*(ground|g)?\s*$/i.test(v[1]);
      /** @type {Target} */
      const p = { x: coord(v[0], base.x), y: ground ? Math.floor(base.y) : coord(v[1], base.y), z: coord(v[2], base.z) };
      if (![p.x, p.y, p.z].every(Number.isFinite)) {
        player.sendMessage(`§cThose aren't coordinates: "${v.join(" ")}". Type numbers, or ~ for the silo's own.`);
        return;
      }
      const range = silo.dimension.heightRange;
      p.x = Math.max(-29999984, Math.min(29999984, Math.floor(p.x)));
      p.z = Math.max(-29999984, Math.min(29999984, Math.floor(p.z)));
      p.y = Math.max(range.min, Math.min(range.max - 1, Math.floor(p.y)));
      if (ground) p.ground = true;
      try {
        silo.setDynamicProperty("zt:target", JSON.stringify(p));
      } catch {
        return;
      }
      player.sendMessage(`§aTarget set: ${targetText(p)}§r, ${fmt(flat(base, p))} blocks ${compass(base, p)}.`);
      panel(player, silo);
    })
    .catch(() => {});
}

/** @param {Player} player @param {Entity} silo */
function activate(player, silo) {
  const why = missing(silo);
  if (why) {
    player.sendMessage("§c" + why);
    return;
  }
  const st = siloState(silo);
  const spec = payload(st.payload - 1);
  const t = /** @type {Target} */ (st.target);
  const inside = flat(player.location, t) <= spec.blast;
  const body = [
    `Target: ${targetText(t)}`,
    `Distance: ${fmt(flat(silo.location, t))} blocks ${compass(silo.location, t)}`,
    `Blast radius: ${fmt(spec.blast)} blocks; everything within ${fmt(spec.ash)} turns to ash`,
    spec.fallout ? `Fallout: radiation for ${fmt(spec.fallout)} blocks around` : "No fallout",
  ];
  if (inside) body.push("", "§c§lYou are inside the blast radius!§r");
  body.push("", "This can't be undone.");
  new MessageFormData()
    .title(`Launch ${spec.name}?`)
    .body(body.join("\n"))
    .button1("§4§lLAUNCH")
    .button2("Cancel")
    .show(player)
    .then((r) => {
      if (r.canceled || r.selection !== 0 || !U.isValid(silo)) return;
      const again = missing(silo);
      if (again) {
        player.sendMessage("§c" + again);
        return;
      }
      begin(silo);
    })
    .catch(() => {});
}

/** The countdown starts. @param {Entity} silo */
export function begin(silo) {
  const st = siloState(silo);
  if (!st.payload || !st.target) return;
  const spec = payload(st.payload - 1);
  countdowns.set(silo.id, { silo, dim: silo.dimension, kind: st.payload - 1, target: st.target, start: system.currentTick });
  prop(silo, "zt:stage", 1);
  U.sound(silo.dimension, "zt.nuke.siren", silo.location, 2);
  tellNear(silo, 64, `§c§l${spec.name} launches in ${CFG.countdown} seconds!`);
}
/** @param {Entity} silo @param {Player} [player] */
function abort(silo, player) {
  if (!countdowns.delete(silo.id)) return;
  prop(silo, "zt:stage", 0);
  if (player) player.sendMessage("§eLaunch aborted.");
}
/** @param {number} tick */
function countdownTick(tick) {
  for (const [id, c] of countdowns) {
    if (!U.isValid(c.silo)) {
      countdowns.delete(id);
      continue;
    }
    const t = tick - c.start;
    if (t > 0 && t % 100 === 0 && t < CFG.countdown * 20) U.sound(c.dim, "zt.nuke.siren", c.silo.location, 2);
    if (t % 20 === 0 && t < CFG.countdown * 20) {
      const left = CFG.countdown - t / 20;
      U.sound(c.dim, "zt.nuke.beep", c.silo.location, 1.5, left <= 3 ? 1.3 : 1);
      try {
        for (const p of c.dim.getPlayers({ location: c.silo.location, maxDistance: 48 })) {
          p.onScreenDisplay.setTitle(`§c${left}`, { subtitle: "§4LAUNCH", fadeInDuration: 0, stayDuration: 18, fadeOutDuration: 4 });
        }
      } catch {
        /* ignore */
      }
    }
    if (t >= CFG.countdown * 20) {
      countdowns.delete(id);
      launch(c);
    }
  }
}

// =============================================================================================
// Launch, flight and fall
// =============================================================================================
/** @typedef {{ e: Entity, dim: Dimension, base: Vector3, y: number, v: number, t: number }} Climb */
/** @type {Map<string, Climb>} */
const climbing = new Map();
/** @typedef {{ e: Entity, dim: Dimension, y: number, speed: number }} Fall */
/** @type {Map<number, Fall>} flight id -> its bomb coming down */
const falling = new Map();

/** @param {Countdown} c */
function launch(c) {
  const { silo, dim } = c;
  const spec = payload(c.kind);
  prop(silo, "zt:stage", 0);
  prop(silo, "zt:payload", 0);
  const at = { x: silo.location.x, y: silo.location.y + 0.75, z: silo.location.z };
  try {
    const rocket = dim.spawnEntity(ROCKET, at);
    rocket.setProperty("zt:kind", c.kind);
    climbing.set(rocket.id, { e: rocket, dim, base: { ...at }, y: at.y, v: 0.12, t: 0 });
  } catch {
    /* it flies all the same */
  }
  U.sound(dim, "zt.nuke.launch", at, 3);
  U.quake(dim, at, 64, 1.6, 3);
  const secs = CFG.flightSeconds(flat(at, c.target));
  /** @type {Flight} */
  const f = { id: nextId++, k: c.kind, d: dim.id, x: c.target.x, y: c.target.y, z: c.target.z, at: U.nowTick() + Math.round(secs * 20) };
  if (c.target.ground) f.gr = 1;
  flightList.push(f);
  saveFlights();
  tellNear(silo, 64, `§c§l${spec.name} launched!§r It reaches ${targetText(c.target)} in ${Math.round(secs)} seconds.`);
}

function climbTick() {
  for (const [id, r] of climbing) {
    if (!U.isValid(r.e)) {
      climbing.delete(id);
      continue;
    }
    r.t++;
    r.v = Math.min(3, r.v + 0.03);
    r.y += r.v;
    if (r.t <= 60 && r.t % 3 === 0) U.particle(r.dim, "zt:launch_smoke", r.base);
    // (the exhaust sets alight whatever's on the silo)
    if (r.t <= 20 && r.t % 5 === 0) {
      for (const e of U.livingAround(r.dim, r.base, 3.5)) {
        try {
          e.setOnFire(5, true);
        } catch {
          /* ignore */
        }
      }
    }
    if (r.t >= CFG.climbTicks || r.y >= r.dim.heightRange.max + 40) {
      climbing.delete(id);
      try {
        r.e.remove();
      } catch {
        /* ignore */
      }
      continue;
    }
    try {
      r.e.teleport({ x: r.base.x, y: r.y, z: r.base.z });
    } catch {
      climbing.delete(id);
    }
  }
}

/** @param {Flight} f */
function dropFlight(f) {
  const i = flightList.indexOf(f);
  if (i >= 0) flightList.splice(i, 1);
  saveFlights();
}
/** Anyone near the target sees the bomb come down. @param {Flight} f @param {Dimension} dim @param {number} now */
function startFall(f, dim, now) {
  const left = Math.max(1, f.at - now);
  if (f.gr) {
    // (aimed at the ground: wherever the ground is there)
    const g = groundAt(dim, f.x, f.z, dim.heightRange.max - 3);
    if (g === undefined) return false;
    f.y = g;
  }
  const from = Math.min(f.y + (CFG.fallHeight * left) / CFG.fallTicks, dim.heightRange.max - 1);
  let bomb;
  try {
    bomb = dim.spawnEntity(ROCKET, { x: f.x + 0.5, y: from, z: f.z + 0.5 });
    bomb.setProperty("zt:kind", f.k);
    bomb.setProperty("zt:falling", true);
  } catch {
    return false;
  }
  falling.set(f.id, { e: bomb, dim, y: from, speed: Math.max(0.3, (from - f.y) / left) });
  for (const p of dim.getPlayers()) {
    const d = flat(p.location, f);
    if (d > CFG.nearTarget) continue;
    try {
      p.playSound("zt.nuke.whistle", { volume: Math.max(0.25, 1 - d / CFG.nearTarget) });
    } catch {
      /* ignore */
    }
  }
  return true;
}
/** The bomb falls a step: through the air, until it reaches its target or hits the ground. @param {Flight} f @param {Fall} b */
function fallStep(f, b) {
  if (!U.isValid(b.e)) {
    // (no one's left to see it: it goes off when it's due, all the same)
    falling.delete(f.id);
    return;
  }
  const x = Math.floor(f.x);
  const z = Math.floor(f.z);
  const next = Math.max(f.y, b.y - b.speed);
  for (let y = Math.floor(b.y); y >= Math.floor(next); y--) {
    const id = idAt(b.dim, x, y, z);
    if (id && !OPEN.test(id)) {
      boom(f, b, { x: f.x + 0.5, y: y + 1, z: f.z + 0.5 });
      return;
    }
  }
  if (next <= f.y + 0.01) {
    boom(f, b, { x: f.x + 0.5, y: f.y, z: f.z + 0.5 });
    return;
  }
  b.y = next;
  try {
    b.e.teleport({ x: f.x + 0.5, y: next, z: f.z + 0.5 });
  } catch {
    /* ignore */
  }
}
/** @param {Flight} f @param {Fall} b @param {Vector3} at */
function boom(f, b, at) {
  falling.delete(f.id);
  try {
    b.e.remove();
  } catch {
    /* ignore */
  }
  dropFlight(f);
  detonate(f.k, b.dim, at, true);
}

function flightTick() {
  if (!flightList.length) return;
  const now = U.nowTick();
  for (const f of [...flightList]) {
    const b = falling.get(f.id);
    if (b) {
      fallStep(f, b);
      if (!falling.has(f.id) && flightList.includes(f) && now >= f.at + 40) {
        dropFlight(f);
        detonate(f.k, world.getDimension(f.d), { x: f.x + 0.5, y: f.y, z: f.z + 0.5 }, !!f.gr);
      }
      continue;
    }
    let dim;
    try {
      dim = world.getDimension(f.d);
    } catch {
      dropFlight(f);
      continue;
    }
    if (now >= f.at - CFG.fallTicks && now < f.at && dim.getPlayers().some((p) => flat(p.location, f) <= CFG.nearTarget) &&
      startFall(f, dim, now)) continue;
    if (now >= f.at) {
      dropFlight(f);
      detonate(f.k, dim, { x: f.x + 0.5, y: f.y, z: f.z + 0.5 }, !!f.gr);
    }
  }
}

// =============================================================================================
// The blast
// =============================================================================================
/** @typedef {{ site: Site, spec: Payload, dim: Dimension, at: Vector3, t0: number, mobs: {e: Entity, d: number}[], next: number, hit: Set<string> }} Blast */
/** @type {Blast[]} */
export const blasts = [];

/** How much the blast hurts `d` blocks out. @param {Payload} spec @param {number} d */
export function blastDamage(spec, d) {
  if (d <= spec.ash) return 5000;
  if (d > spec.blast) return 0;
  const x = (spec.blast - d) / (spec.blast - spec.ash);
  return Math.round(4 + 196 * x * x);
}
/**
 * The ground at (x, z), below fromY: the top of the first solid block (trees and plants aside);
 * the world's floor if there's none; undefined if it isn't loaded.
 * @param {Dimension} dim @param {number} x @param {number} z @param {number} fromY
 */
function groundAt(dim, x, z, fromY) {
  const r = dim.heightRange;
  for (let y = Math.min(Math.floor(fromY) + 2, r.max - 1); y >= r.min; y--) {
    const id = idAt(dim, Math.floor(x), y, Math.floor(z));
    if (id === undefined) return undefined;
    if (OPEN.test(id) || FOLIAGE.test(id) || /_log$|_wood$|mushroom_block|mushroom_stem/.test(id)) continue;
    return y + 1;
  }
  return r.min;
}
/** Trims the oldest sites when there are too many. */
function trimSites() {
  while (siteList.length > CFG.maxSites) {
    const old = siteList.shift();
    if (old) forgetBits(old.id);
  }
}

/**
 * A payload goes off.
 * @param {number} kind @param {Dimension} dim @param {Vector3} at @param {boolean} [onGround] it hit the ground
 * @returns {Site}
 */
export function detonate(kind, dim, at, onGround = false) {
  if (!ready) loadState();
  const spec = payload(kind);
  /** @type {Site} */
  const site = { id: nextId++, k: kind, d: dim.id, x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z), t: U.nowTick() };
  if (onGround) site.s = 1;
  const g = groundAt(dim, site.x, site.z, site.y);
  if (g !== undefined) site.g = g;
  siteList.push(site);
  trimSites();
  saveSites();
  // the flash, for everyone who can see it
  for (const p of dim.getPlayers()) {
    let eye;
    try {
      eye = p.getHeadLocation();
    } catch {
      continue;
    }
    const d = U.len(U.sub(eye, at));
    if (d <= spec.blast * 2) flash(p, d, spec, site, eye);
  }
  // the shockwave reaches what's loaded in its time
  /** @type {{e: Entity, d: number}[]} */
  const mobs = [];
  try {
    for (const e of dim.getEntities({ location: at, maxDistance: spec.blast, excludeFamilies: ["inanimate"], excludeTypes: ["minecraft:player"] })) {
      mobs.push({ e, d: U.len(U.sub(e.location, at)) });
    }
  } catch {
    /* ignore */
  }
  mobs.sort((a, b) => a.d - b.d);
  blasts.push({ site, spec, dim, at: { ...at }, t0: system.currentTick, mobs, next: 0, hit: new Set() });
  return site;
}

/** @param {Player} p @param {number} d @param {Payload} spec @param {Site} site @param {Vector3} eye */
function flash(p, d, spec, site, eye) {
  const k = Math.max(0, 1 - d / (spec.blast * 2));
  Doors.fade(p, 0.05, 0.1 + 0.9 * k, 0.8 + 2.5 * k, { red: 1, green: 1, blue: 0.94 });
  if (d < spec.blast) {
    try {
      p.addEffect("blindness", Math.round(20 * (1 + 4 * k)), { amplifier: 0, showParticles: false });
    } catch {
      /* ignore */
    }
  }
  const v = view(eye, site);
  if (v) playerParticle(p, "zt:nuke_flash", { x: v.at.x, y: v.at.y + 0.5 * v.size, z: v.at.z }, { scale: (v.k * spec.cloud) / 260 });
}

/** @param {Entity} e @param {number} d @param {Blast} b */
function shockMob(e, d, b) {
  if (!U.isValid(e)) return;
  const dmg = blastDamage(b.spec, d);
  if (dmg <= 0) return;
  U.hurt(e, dmg, undefined, "blockExplosion");
  const away = U.sub(e.location, b.at);
  const k = 1 - d / b.spec.blast;
  U.knock(e, away.x, away.z, 0.6 + 3.5 * k, 0.3 + 0.5 * k);
  if (d < b.spec.blast * 0.6) {
    try {
      e.setOnFire(Math.round(3 + 7 * k), true);
    } catch {
      /* ignore */
    }
  }
}
/** @param {Player} p @param {number} d @param {Blast} b */
function shockPlayer(p, d, b) {
  const spec = b.spec;
  const away = U.sub(p.location, b.at);
  const f = Math.hypot(away.x, away.z) || 1;
  if (d <= spec.blast) {
    const k = 1 - d / spec.blast;
    const vulnerable = U.isVulnerablePlayer(p);
    if (vulnerable) U.hurt(p, blastDamage(spec, d), undefined, "blockExplosion");
    U.knock(p, away.x, away.z, 0.6 + 3.5 * k, 0.3 + 0.5 * k);
    if (vulnerable && d < spec.blast * 0.6) {
      try {
        p.setOnFire(Math.round(3 + 7 * k), true);
      } catch {
        /* ignore */
      }
    }
    shake(p, Math.min(4, 0.5 + 3 * k), 2.5);
    playerParticle(p, "zt:shock_dust", p.location, { dx: away.x / f, dz: away.z / f });
  } else shake(p, 0.3, 1.5);
  // the boom comes with it
  const near = d < spec.blast * 0.5;
  try {
    p.playSound(near ? "zt.nuke.blast" : "zt.nuke.rumble", { volume: near ? 1 : Math.max(0.35, 1.2 - d / (spec.blast * 2)) });
  } catch {
    /* ignore */
  }
}
/** @param {number} tick */
function blastTick(tick) {
  for (const b of [...blasts]) {
    const r = (tick - b.t0) * CFG.wave;
    for (const p of b.dim.getPlayers()) {
      if (b.hit.has(p.id)) continue;
      const d = U.len(U.sub(p.location, b.at));
      if (d > r) continue;
      b.hit.add(p.id);
      if (d <= b.spec.blast * 2) shockPlayer(p, d, b);
    }
    while (b.next < b.mobs.length && b.mobs[b.next].d <= r) {
      shockMob(b.mobs[b.next].e, b.mobs[b.next].d, b);
      b.next++;
    }
    if (r > b.spec.blast * 2) blasts.splice(blasts.indexOf(b), 1);
  }
}

// =============================================================================================
// The mushroom clouds: each player sees their own, on the line from their eye to the real one,
// no farther off than proxyDist and smaller to match, so a cloud thousands of blocks away (far
// past what the game keeps loaded) still stands on their horizon as big as it should.
// =============================================================================================
/** @typedef {{ e: Entity, player: string, size: number, lift: number, sentAt: number }} Proxy */
/** @type {Map<string, Proxy>} "player id|site id" -> the cloud drawn for them */
const proxies = new Map();

/** @param {Vector3} eye @param {Site} s */
function view(eye, s) {
  const spec = payload(s.k);
  const foot = { x: s.x + 0.5, y: s.g ?? s.y, z: s.z + 0.5 };
  const d = U.len(U.sub(foot, eye));
  if (d > CFG.cloudView) return undefined;
  const k = d > CFG.proxyDist ? CFG.proxyDist / d : 1;
  return { at: { x: eye.x + (foot.x - eye.x) * k, y: eye.y + (foot.y - eye.y) * k, z: eye.z + (foot.z - eye.z) * k }, k, size: (spec.cloud / 4) * k };
}
/** The clouds drawn for a player (for tests). @param {string} playerId */
export function cloudsOf(playerId) {
  return [...proxies.entries()].filter(([, p]) => p.player === playerId).map(([key, p]) => ({ site: Number(key.split("|")[1]), entity: p.e }));
}
/** @param {string} key */
function dropProxy(key) {
  const pr = proxies.get(key);
  proxies.delete(key);
  try {
    if (pr && U.isValid(pr.e)) pr.e.remove();
  } catch {
    /* ignore */
  }
}
/** @param {Dimension} dim @param {number} x @param {number} y @param {number} z */
function openAt(dim, x, y, z) {
  const id = idAt(dim, Math.floor(x), Math.floor(y), Math.floor(z));
  return id === undefined || OPEN.test(id);
}
/** @param {Player} p @param {Site} s @param {string} key @param {NonNullable<ReturnType<typeof view>>} v @param {number} now @param {number} tick */
function placeProxy(p, s, key, v, now, tick) {
  const dim = p.dimension;
  // (stood in a block it would be lit black: it stands in the air above, its model sunk back down)
  let lift = 0;
  while (lift < 12 && !openAt(dim, v.at.x, v.at.y + lift, v.at.z)) lift++;
  const pos = { x: v.at.x, y: v.at.y + lift, z: v.at.z };
  let pr = proxies.get(key);
  if (pr && (!U.isValid(pr.e) || U.len(U.sub(pr.e.location, pos)) > 48)) {
    dropProxy(key);
    pr = undefined;
  }
  if (!pr) {
    let e;
    try {
      e = dim.spawnEntity(CLOUD, pos);
    } catch {
      return;
    }
    pr = { e, player: p.id, size: -1, lift: -1, sentAt: -99 };
    proxies.set(key, pr);
    try {
      p.setPropertyOverrideForEntity(e, "zt:visible", true);
    } catch {
      // (if it can't be shown to them alone, everyone sees it: better than no one)
      prop(e, "zt:visible", true);
    }
  } else if (U.len(U.sub(pr.e.location, pos)) > 0.01) {
    try {
      pr.e.teleport(pos);
    } catch {
      /* ignore */
    }
  }
  const size = Math.min(128, v.size);
  if (Math.abs(pr.size - size) > pr.size * 0.005 + 0.0005) {
    prop(pr.e, "zt:size", size);
    pr.size = size;
  }
  if (lift !== pr.lift) {
    prop(pr.e, "zt:lift", lift);
    pr.lift = lift;
  }
  const age = Math.min(1000, (now - s.t) / 20);
  if (tick - pr.sentAt >= 10) {
    prop(pr.e, "zt:age", age);
    pr.sentAt = tick;
  }
  // smoke rolling out from its foot, for its first minute and a half
  if (age < 90 && tick % 10 === 0) playerParticle(p, "zt:nuke_smoke", pos, { scale: (v.k * payload(s.k).cloud) / 260 });
}
/** @param {number} tick */
function cloudTick(tick) {
  const now = U.nowTick();
  const live = siteList.filter((s) => (now - s.t) / 20 < CFG.cloudLife);
  if (!live.length && !proxies.size) return;
  const want = new Set();
  for (const p of world.getAllPlayers()) {
    let eye;
    try {
      eye = p.getHeadLocation();
    } catch {
      continue;
    }
    for (const s of live) {
      if (s.d !== p.dimension.id) continue;
      const v = view(eye, s);
      if (!v) continue;
      const key = p.id + "|" + s.id;
      want.add(key);
      placeProxy(p, s, key, v, now, tick);
    }
  }
  for (const key of [...proxies.keys()]) if (!want.has(key)) dropProxy(key);
}
/** Clouds and rockets left over from before the world was last closed. */
function sweep() {
  const mine = new Set([...proxies.values()].map((p) => p.e.id));
  const flying = new Set([...climbing.keys(), ...[...falling.values()].map((b) => b.e.id)]);
  for (const id of ["overworld", "nether", "the_end"]) {
    let dim;
    try {
      dim = world.getDimension(id);
    } catch {
      continue;
    }
    if (!dim.getPlayers().length) continue;
    try {
      for (const e of dim.getEntities({ type: CLOUD })) if (!mine.has(e.id)) e.remove();
      for (const e of dim.getEntities({ type: ROCKET })) if (!flying.has(e.id)) e.remove();
      // (a countdown the world was closed during is over)
      for (const e of dim.getEntities({ families: ["zt_silo"] })) {
        if (getProp(e, "zt:stage") === 1 && !countdowns.has(e.id)) prop(e, "zt:stage", 0);
      }
    } catch {
      /* ignore */
    }
  }
}

// =============================================================================================
// Ash, burning and shattering, a chunk at a time as each is loaded
// =============================================================================================
/** Which chunks round a site are done: a bitmap over the square of chunks it reaches. */
class Bits {
  /** @param {number} n @param {string} [packed] */
  constructor(n, packed) {
    this.a = new Uint8Array((n + 7) >> 3);
    if (packed) this.unpack(packed);
  }
  /** @param {number} i */
  get(i) {
    return (this.a[i >> 3] >> (i & 7)) & 1;
  }
  /** @param {number} i */
  set(i) {
    this.a[i >> 3] |= 1 << (i & 7);
  }
  /** As hex, with runs of empty bytes as "z<count>." */
  pack() {
    const HEX = "0123456789abcdef";
    const out = [];
    const a = this.a;
    let i = 0;
    while (i < a.length) {
      if (a[i] === 0) {
        let j = i;
        while (j < a.length && a[j] === 0) j++;
        out.push("z" + (j - i).toString(36) + ".");
        i = j;
      } else {
        out.push(HEX[a[i] >> 4] + HEX[a[i] & 15]);
        i++;
      }
    }
    return out.join("");
  }
  /** @param {string} s */
  unpack(s) {
    let i = 0;
    let k = 0;
    while (i < s.length && k < this.a.length) {
      if (s[i] === "z") {
        const end = s.indexOf(".", i);
        if (end < 0) break;
        k += parseInt(s.slice(i + 1, end), 36) || 0;
        i = end + 1;
      } else {
        this.a[k++] = parseInt(s.substr(i, 2), 16) || 0;
        i += 2;
      }
    }
  }
}
/** @type {Map<number, Bits>} */
const bitsOf = new Map();
/** @type {Set<number>} */
const dirtyBits = new Set();
const PART = 30000;
/** @param {Site} s */
function regionOf(s) {
  const spec = payload(s.k);
  const R = Math.ceil((spec.blast + 16) / 16);
  return { cx0: Math.floor(s.x / 16), cz0: Math.floor(s.z / 16), R, side: 2 * R + 1 };
}
/** @param {Site} s @param {number} cx @param {number} cz */
function chunkIndex(s, cx, cz) {
  const g = regionOf(s);
  const a = cx - g.cx0 + g.R;
  const b = cz - g.cz0 + g.R;
  if (a < 0 || b < 0 || a >= g.side || b >= g.side) return -1;
  return a * g.side + b;
}
/** @param {Site} s */
function bits(s) {
  let b = bitsOf.get(s.id);
  if (!b) {
    const g = regionOf(s);
    let packed = "";
    for (let k = 0; ; k++) {
      const part = world.getDynamicProperty(`zt:nuke_done_${s.id}_${k}`);
      if (typeof part !== "string") break;
      packed += part;
    }
    b = new Bits(g.side * g.side, packed);
    bitsOf.set(s.id, b);
  }
  return b;
}
function saveBits() {
  for (const id of dirtyBits) {
    const b = bitsOf.get(id);
    if (!b) continue;
    const s = b.pack();
    const n = Math.ceil(s.length / PART);
    try {
      for (let k = 0; k < n; k++) world.setDynamicProperty(`zt:nuke_done_${id}_${k}`, s.slice(k * PART, (k + 1) * PART));
      for (let k = n; world.getDynamicProperty(`zt:nuke_done_${id}_${k}`) !== undefined; k++) world.setDynamicProperty(`zt:nuke_done_${id}_${k}`, undefined);
    } catch {
      /* ignore */
    }
  }
  dirtyBits.clear();
}
/** @param {number} id */
function forgetBits(id) {
  bitsOf.delete(id);
  dirtyBits.delete(id);
  try {
    for (let k = 0; world.getDynamicProperty(`zt:nuke_done_${id}_${k}`) !== undefined; k++) world.setDynamicProperty(`zt:nuke_done_${id}_${k}`, undefined);
  } catch {
    /* ignore */
  }
}
/** Whether the chunk holding (x, z) has been seen to since a site's blast (for tests). @param {Site} s @param {number} x @param {number} z */
export function processed(s, x, z) {
  const i = chunkIndex(s, Math.floor(x / 16), Math.floor(z / 16));
  return i >= 0 && !!bits(s).get(i);
}

// what becomes what
const FOLIAGE = /_leaves$|_leaves_flowered$|_sapling$|_tulip$|_carpet$|_torch$|^minecraft:(torch|short_grass|tall_grass|fern|large_fern|deadbush|vine|glow_lichen|sweet_berry_bush|reeds|bamboo|cactus|cactus_flower|wheat|carrots|potatoes|beetroot|melon_stem|pumpkin_stem|torchflower_crop|pitcher_crop|waterlily|brown_mushroom|red_mushroom|azalea|flowering_azalea|cave_vines|cave_vines_body_with_berries|cave_vines_head_with_berries|hanging_roots|spore_blossom|big_dripleaf|small_dripleaf_block|snow_layer|pale_hanging_moss|leaf_litter|firefly_bush|bush|short_dry_grass|tall_dry_grass|wildflowers|pink_petals|weeping_vines|twisting_vines|crimson_roots|warped_roots|nether_sprouts|crimson_fungus|warped_fungus|cocoa|fire|soul_fire|dandelion|poppy|blue_orchid|allium|azure_bluet|oxeye_daisy|cornflower|lily_of_the_valley|wither_rose|sunflower|lilac|rose_bush|peony|torchflower|pitcher_plant|open_eyeblossom|closed_eyeblossom)$|^zt:(spore_grass_plant|spore_mushroom|spore_crop)$/;
const AQUATIC = /^minecraft:(kelp|seagrass|sea_pickle)$|_coral$|_coral_fan$|_coral_wall_fan$/;
const GLASS = /glass/;
const GRASSY = /^minecraft:(grass_block|mycelium|podzol)$/;
/** What a blast leaves be: air and liquids, and what can't be broken. */
const KEEP = /^minecraft:(air|cave_air|void_air|water|flowing_water|lava|flowing_lava|bedrock|barrier|command_block|chain_command_block|repeating_command_block|structure_block|structure_void|jigsaw|light_block.*|allow|deny|border_block|end_portal|end_portal_frame|end_gateway|portal|reinforced_deepslate|invisible_bedrock|moving_block|bubble_column)$|^zt:(ash|shroomed_altar)$/;
/** @type {{ foliage: string[], aquatic: string[], glass: string[], grassy: string[], keep: string[] } | undefined} */
let lists;
function blockLists() {
  if (lists) return lists;
  let all = [];
  try {
    all = BlockTypes.getAll().map((t) => t.id);
  } catch {
    all = [];
  }
  lists = {
    foliage: all.filter((id) => FOLIAGE.test(id)),
    aquatic: all.filter((id) => AQUATIC.test(id)),
    glass: all.filter((id) => GLASS.test(id)),
    grassy: all.filter((id) => GRASSY.test(id)),
    keep: all.filter((id) => KEEP.test(id)),
  };
  // (whatever the game lists, air, water, lava and bedrock are never made ash)
  for (const id of ["minecraft:air", "minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava", "minecraft:bedrock", ASH]) {
    if (!lists.keep.includes(id)) lists.keep.push(id);
  }
  return lists;
}

/**
 * Fills a column of the world, from y0 to y1, in pieces the game allows.
 * @param {Dimension} dim @param {number} x @param {number} z @param {number} w @param {number} h @param {number} y0 @param {number} y1
 * @param {string} block @param {import("@minecraft/server").BlockFilter} [filter]
 */
function fill(dim, x, z, w, h, y0, y1, block, filter) {
  const r = dim.heightRange;
  y0 = Math.max(r.min, Math.floor(y0));
  y1 = Math.min(r.max - 1, Math.floor(y1));
  if (y1 < y0) return;
  const step = Math.max(1, Math.floor(32768 / (w * h)));
  for (let y = y0; y <= y1; y += step) {
    const top = Math.min(y1, y + step - 1);
    dim.fillBlocks(new BlockVolume({ x, y, z }, { x: x + w - 1, y: top, z: z + h - 1 }), block,
      filter ? { blockFilter: filter, ignoreChunkBoundErrors: true } : { ignoreChunkBoundErrors: true });
  }
}
/** @param {Dimension} dim @param {number} x @param {number} z @param {number} w @param {number} h @param {number} y0 @param {number} y1 */
function ashen(dim, x, z, w, h, y0, y1) {
  const L = blockLists();
  if (L.foliage.length) fill(dim, x, z, w, h, y0, y1, "minecraft:air", { includeTypes: L.foliage });
  if (L.aquatic.length) fill(dim, x, z, w, h, y0, y1, "minecraft:water", { includeTypes: L.aquatic });
  fill(dim, x, z, w, h, y0, y1, ASH, { excludeTypes: L.keep });
}
/** @param {Dimension} dim @param {number} x @param {number} z @param {number} w @param {number} h @param {number} y0 @param {number} y1 */
function burn(dim, x, z, w, h, y0, y1) {
  const L = blockLists();
  if (L.foliage.length) fill(dim, x, z, w, h, y0, y1, "minecraft:air", { includeTypes: L.foliage });
  if (L.grassy.length) fill(dim, x, z, w, h, y0, y1, "minecraft:dirt", { includeTypes: L.grassy });
  if (L.glass.length) fill(dim, x, z, w, h, y0, y1, "minecraft:air", { includeTypes: L.glass });
}
/** @param {Dimension} dim @param {number} x @param {number} z @param {number} w @param {number} h @param {number} y0 @param {number} y1 */
function shatter(dim, x, z, w, h, y0, y1) {
  const L = blockLists();
  if (L.glass.length) fill(dim, x, z, w, h, y0, y1, "minecraft:air", { includeTypes: L.glass });
}

/** How deep the ash goes `d` blocks from ground zero: from 24 blocks there to 8 at the zone's edge. @param {Payload} spec @param {number} d */
export function ashDepthAt(spec, d) {
  return Math.round(CFG.ashDepth + 16 * Math.max(0, 1 - d / spec.ash) ** 2);
}
/** Does a site leave a crater (it went off on or near the ground)? @param {Site} s */
function cratered(s) {
  return !!s.s || (s.g !== undefined && s.y - s.g <= 24);
}

/**
 * Sees to one chunk: ash, a crater, burning or shattering, by how far it is from the blast; and
 * the mobs that were in it when it went off (not loaded then) are hurt now.
 * @param {Site} s @param {number} cx @param {number} cz @returns {"unloaded" | "done"}
 */
function processChunk(s, cx, cz) {
  let dim;
  try {
    dim = world.getDimension(s.d);
  } catch {
    return "done";
  }
  const spec = payload(s.k);
  const x0 = cx * 16;
  const z0 = cz * 16;
  if (idAt(dim, x0, Math.max(dim.heightRange.min, 0), z0) === undefined) return "unloaded";
  if (s.g === undefined) {
    const g = groundAt(dim, s.x, s.z, s.y + 64);
    if (g !== undefined) {
      s.g = g;
      sitesDirty = true;
    }
  }
  const inX = s.x >= x0 && s.x < x0 + 16;
  const inZ = s.z >= z0 && s.z < z0 + 16;
  const nearest = Math.hypot(inX ? 0 : Math.min(Math.abs(x0 - s.x), Math.abs(x0 + 16 - s.x)), inZ ? 0 : Math.min(Math.abs(z0 - s.z), Math.abs(z0 + 16 - s.z)));
  // (where the crater goes it waits until the ground at ground zero is known)
  if (nearest < spec.crater && s.g === undefined) return "unloaded";
  // the lie of the land: the tops of sixteen columns
  const tops = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let b;
      try {
        b = dim.getTopmostBlock({ x: x0 + 1 + i * 4, z: z0 + 1 + j * 4 });
      } catch {
        return "unloaded";
      }
      if (b) tops.push(b.location.y);
    }
  }
  if (!tops.length) return "done";
  const lo = Math.min(...tops);
  const top = Math.max(...tops) + CFG.above;
  const crater = cratered(s) && s.g !== undefined ? spec.crater : 0;
  /** @param {number} d */
  const zone = (d) => (d < crater ? 4 : d <= spec.ash ? 3 : d <= spec.blast * 0.5 ? 2 : d <= spec.blast ? 1 : 0);
  /** @param {number} x @param {number} z @param {number} w */
  const dist = (x, z, w) => Math.hypot(x + w / 2 - (s.x + 0.5), z + w / 2 - (s.z + 0.5));
  /** @param {number} z4 @param {number} x @param {number} z @param {number} w */
  const apply = (z4, x, z, w) => {
    if (z4 === 4) {
      // the crater: a bowl round ground zero, lined with ash
      for (let i = 0; i < w; i += 2) {
        for (let j = 0; j < w; j += 2) {
          const d = dist(x + i, z + j, 2);
          const depth = d < crater ? spec.depth * (1 - (d / crater) ** 2) : 0;
          const floor = Math.round(/** @type {number} */ (s.g) - depth);
          // (bedrock and the like stay: no hole into the void)
          if (depth > 0.5) fill(dim, x + i, z + j, 2, 2, floor, top, "minecraft:air", { excludeTypes: blockLists().keep });
          ashen(dim, x + i, z + j, 2, 2, Math.min(lo - ashDepthAt(spec, d), floor - 3), top);
        }
      }
    } else if (z4 === 3) ashen(dim, x, z, w, w, lo - ashDepthAt(spec, dist(x, z, w) - w * 0.71), top);
    else if (z4 === 2) burn(dim, x, z, w, w, lo - 2, top);
    else if (z4 === 1) shatter(dim, x, z, w, w, lo - 4, top);
  };
  const corners = [[0, 0], [16, 0], [0, 16], [16, 16]].map(([a, b]) => Math.hypot(x0 + a - (s.x + 0.5), z0 + b - (s.z + 0.5)));
  const zNear = zone(nearest);
  const zFar = zone(Math.max(...corners));
  try {
    if (zNear === zFar && zNear !== 4) apply(zNear, x0, z0, 16);
    else for (let i = 0; i < 16; i += 4) for (let j = 0; j < 16; j += 4) apply(zone(dist(x0 + i, z0 + j, 4)), x0 + i, z0 + j, 4);
  } catch (err) {
    if (err instanceof Error && /unloaded/i.test(err.name + err.message)) return "unloaded";
    console.warn("[Titans] nuke: " + err);
  }
  // mobs that weren't loaded when the shockwave went by
  if (U.nowTick() - s.t > (2 * spec.blast) / CFG.wave + 40) {
    try {
      const r = dim.heightRange;
      for (const e of dim.getEntities({ location: { x: x0, y: r.min, z: z0 }, volume: { x: 16, y: r.max - r.min, z: 16 },
        excludeFamilies: ["inanimate"], excludeTypes: ["minecraft:player"] })) {
        const d = Math.hypot(e.location.x - s.x, e.location.z - s.z);
        if (d <= spec.blast) U.hurt(e, blastDamage(spec, d), undefined, "blockExplosion");
      }
    } catch {
      /* ignore */
    }
  }
  return "done";
}

/** @typedef {{ s: Site, cx: number, cz: number, i: number, key: string }} Job */
/** @type {Job[]} */
const queue = [];
/** @type {Set<string>} */
const queued = new Set();
/** Queues the chunks round each player that a blast reached and that haven't been seen to. */
function scan() {
  for (const p of world.getAllPlayers()) {
    let l;
    try {
      l = p.location;
    } catch {
      continue;
    }
    const dimId = p.dimension.id;
    const pcx = Math.floor(l.x / 16);
    const pcz = Math.floor(l.z / 16);
    for (const s of siteList) {
      if (s.d !== dimId) continue;
      const spec = payload(s.k);
      if (flat(l, s) > spec.blast + 16 * (CFG.processRadius + 2)) continue;
      const b = bits(s);
      for (let ring = 0; ring <= CFG.processRadius; ring++) {
        for (let a = -ring; a <= ring; a++) {
          for (let c = -ring; c <= ring; c++) {
            if (Math.max(Math.abs(a), Math.abs(c)) !== ring) continue;
            const cx = pcx + a;
            const cz = pcz + c;
            const i = chunkIndex(s, cx, cz);
            if (i < 0 || b.get(i)) continue;
            const key = s.id + ":" + i;
            if (queued.has(key)) continue;
            const nx = Math.max(cx * 16, Math.min(s.x, cx * 16 + 15));
            const nz = Math.max(cz * 16, Math.min(s.z, cz * 16 + 15));
            if (Math.hypot(nx - s.x, nz - s.z) > spec.blast) {
              // (out of its reach: nothing to do)
              b.set(i);
              dirtyBits.add(s.id);
              continue;
            }
            queued.add(key);
            queue.push({ s, cx, cz, i, key });
          }
        }
      }
    }
  }
}
function processTick() {
  const start = Date.now();
  let done = 0;
  while (queue.length && done < CFG.chunksPerTick && (done === 0 || Date.now() - start < CFG.msPerTick)) {
    const job = /** @type {Job} */ (queue.shift());
    queued.delete(job.key);
    if (!siteList.includes(job.s)) continue;
    const b = bits(job.s);
    if (b.get(job.i)) continue;
    // (one not loaded is tried again when it's next round a player)
    if (processChunk(job.s, job.cx, job.cz) === "unloaded") continue;
    b.set(job.i);
    dirtyBits.add(job.s.id);
    done++;
  }
}
/** How many chunks are waiting to be seen to (for tests). */
export function pending() {
  return queue.length;
}

// =============================================================================================
// Ticks, players leaving, commands
// =============================================================================================
/** @param {number} tick */
export function nukesTick(tick) {
  if (!ready) loadState();
  countdownTick(tick);
  climbTick();
  flightTick();
  blastTick(tick);
  cloudTick(tick);
  if (tick % 20 === 7) scan();
  processTick();
  if (tick % 100 === 3) sweep();
  if (tick % 200 === 11) {
    if (sitesDirty) saveSites();
    saveBits();
  }
}

/** @param {string} playerId */
export function forgetPlayer(playerId) {
  for (const [key, p] of [...proxies]) if (p.player === playerId) dropProxy(key);
}

/**
 * /scriptevent zt:nuke clear   forget every blast (the fallout goes; the ash stays)
 * /scriptevent zt:nuke list    where they were
 * @param {string} message @param {Player | undefined} source
 */
export function command(message, source) {
  if (!ready) loadState();
  const say = (/** @type {string} */ t) => (source ? source.sendMessage(t) : world.sendMessage(t));
  const word = message.trim().toLowerCase();
  if (word === "clear") {
    for (const s of siteList) forgetBits(s.id);
    siteList = [];
    flightList = [];
    saveSites();
    saveFlights();
    for (const key of [...proxies.keys()]) dropProxy(key);
    queue.length = 0;
    queued.clear();
    say("§aEvery blast is forgotten: no more fallout.");
    return;
  }
  if (!siteList.length) {
    say("§7No nukes have gone off.");
    return;
  }
  const now = U.nowTick();
  for (const s of siteList) {
    say(`§e${payload(s.k).name}§r at ${s.x} ${s.y} ${s.z} (${s.d.replace("minecraft:", "")}), ${((now - s.t) / 24000).toFixed(1)} days ago`);
  }
}
