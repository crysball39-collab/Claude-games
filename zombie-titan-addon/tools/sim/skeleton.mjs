// Skeleton Titan simulation: birth, arrow volley, melee attacks, the obsidian
// stun (the only time players can hurt it), death, corpse and loot.
//   node tools/sim/run.mjs skeleton
import { blockOverrides, ItemStack, log, Player, runTicks, world } from "@minecraft/server";

const warnings = [];
console.warn = (...a) => {
  warnings.push(a.join(" "));
  if (process.env.ZT_TRACE) process.stderr.write("WARN " + a.join(" ") + "\n");
};

await import("./scripts/main.js");

const ow = world.getDimension("overworld");
let failures = 0;
function check(cond, msg) {
  if (cond) console.log("  ok   " + msg);
  else {
    failures++;
    console.log("  FAIL " + msg);
  }
}
function protect(p) {
  const hp = p.getComponent("minecraft:health");
  hp.max = 1e9;
  hp.setCurrentValue(1e9);
}

console.log("birth");
const player = new Player(ow, { x: 0, y: 64, z: 20 });
ow.entities.push(player);
protect(player);
const titan = ow.spawnEntity("zt:skeleton_titan", { x: 0, y: 64, z: 0 });
runTicks(1);
check(titan.props["zt:birth"] === true && titan.props["zt:grow"] < 0.1, "rises from the ground at skeleton size");
check(titan.getComponent("minecraft:health").currentValue <= 2000, "boss bar starts at 10%");
check(log.messages.some((m) => m.includes("Skeleton Titan is rising")), "players are told a Skeleton Titan is rising");
runTicks(210);
check(titan.props["zt:birth"] === false && titan.props["zt:grow"] === 1, "fully grown after 10 seconds");
check(titan.getComponent("minecraft:health").currentValue === 20000, "full 20,000 HP");
check(titan.props["zt:anim"] === 11, "rattles awake");
check(log.messages.some((m) => m.includes("Skeleton Titan has awoken")), "wake-up announced");

console.log("arrow volley");
let volley = false;
let maxArrows = 0;
let arrowsSeen = 0;
const seenIds = new Set();
runTicks(1600, () => {
  // keep the player out of reach so it shoots instead of walking into melee range
  player.location = { x: titan.location.x, y: 64, z: titan.location.z + 60 };
  if (titan.props["zt:anim"] === 5) volley = true;
  const arrows = ow.getEntities({ type: "zt:titan_arrow" });
  for (const a of arrows) seenIds.add(a.id);
  maxArrows = Math.max(maxArrows, arrows.length);
});
arrowsSeen = seenIds.size;
check(volley, "looses an arrow volley at a far target");
check(arrowsSeen >= 100, "fires a stream of giant arrows (" + arrowsSeen + ")");
check(maxArrows < 120, "arrows are cleaned up as they land (at most " + maxArrows + " at once)");
check(log.sounds.includes("zt.skel.bow"), "bow sounds");

console.log("melee");
const seen = new Set();
runTicks(3000, (t) => {
  seen.add(titan.props["zt:anim"]);
  if (t % 100 === 0) player.location = { x: titan.location.x + 2, y: 64, z: titan.location.z + 18 };
});
const melee = [2, 3, 6, 7].filter((a) => seen.has(a));
check(melee.length >= 3, "uses its melee attacks: " + melee.join(","));
check(player.damageTaken > 0, "hurts the player (" + Math.round(player.damageTaken) + " damage)");
check(log.particles.includes("zt:bone_dust"), "bone dust flies");
const minions = ow.getEntities({ type: "zt:skeleton_minion" }).length;
check(minions > 0, "summons skeleton minions (" + minions + ")");

console.log("only hurt while stunned");
player.components["minecraft:equippable"].slots.Mainhand = new ItemStack("minecraft:diamond_sword");
let hp0 = titan.getComponent("minecraft:health").currentValue;
titan.applyDamage(50, { cause: "entityAttack", damagingEntity: player });
world.afterEvents.entityHitEntity.fire({ damagingEntity: player, hitEntity: titan });
check(titan.getComponent("minecraft:health").currentValue === hp0, "player hits do nothing while it stands");
check(log.messages.some((m) => m.includes("knocked down")), "tells the player how to knock it down");

console.log("bow slam on obsidian");
function obsidianAround(c) {
  blockOverrides.clear();
  for (let r = 6; r <= 40; r++) {
    for (let a = 0; a < 360; a += 2) {
      const x = Math.floor(c.x + Math.cos((a * Math.PI) / 180) * r);
      const z = Math.floor(c.z + Math.sin((a * Math.PI) / 180) * r);
      blockOverrides.set(`${x},63,${z}`, "minecraft:obsidian");
    }
  }
}
obsidianAround(titan.location);
let stunnedAt = -1;
runTicks(8000, (t) => {
  if (stunnedAt < 0 && titan.props["zt:stunned"]) stunnedAt = t;
  if (stunnedAt < 0 && t % 100 === 0) {
    // the titan follows the player, so the obsidian field follows the titan
    obsidianAround(titan.location);
    player.location = { x: titan.location.x + 2, y: 64, z: titan.location.z + 18 };
  }
  return stunnedAt >= 0;
});
check(stunnedAt >= 0, "its bow slam on obsidian knocks it down");
check(titan.props["zt:anim"] === 8, "it lies stunned");
check(log.messages.some((m) => m.includes("collapsed")), "the knock-down is announced");
blockOverrides.clear();
hp0 = titan.getComponent("minecraft:health").currentValue;
titan.applyDamage(50, { cause: "entityAttack", damagingEntity: player });
check(titan.getComponent("minecraft:health").currentValue < hp0, "players can hurt it while it is down");
const regenHp = titan.getComponent("minecraft:health").currentValue;
runTicks(200);
check(titan.getComponent("minecraft:health").currentValue <= regenHp, "no healing while stunned");
runTicks(300);
check(titan.props["zt:stunned"] === false, "gets back up after 22.5 seconds");

console.log("death");
player.components["minecraft:equippable"].slots.Mainhand = new ItemStack("zt:dark_fists");
titan.props["zt:stunned"] = true;
for (let i = 0; i < 400 && titan.valid; i++) {
  titan.props["zt:stunned"] = true;
  titan.applyDamage(100, { cause: "entityAttack", damagingEntity: player });
  runTicks(1);
}
check(!titan.valid, "it dies");
runTicks(2);
const corpse = ow.getEntities({ type: "zt:skeleton_titan_corpse" })[0];
check(!!corpse, "a corpse plays the collapse");
check(log.messages.some((m) => m.includes("Skeleton Titan has been slain")), "death announced");
const before = log.items.length;
runTicks(320);
const drops = log.items.slice(before);
check(drops.some(([id]) => id === "minecraft:bone") && drops.some(([id]) => id === "minecraft:arrow"), "drops bones and arrows");
check(drops.some(([id]) => id === "minecraft:bow"), "drops its bow");
check(player.xp === 20000, "killer gets 20,000 XP (" + player.xp + ")");
check(!!corpse && !corpse.valid, "corpse removed after the sequence");

console.log("");
if (warnings.length) {
  console.log("script warnings:");
  for (const w of warnings.slice(0, 20)) console.log("  " + w);
}
console.log(failures === 0 && warnings.length === 0 ? "ALL GOOD" : `${failures} failures, ${warnings.length} warnings`);
process.exit(failures === 0 && warnings.length === 0 ? 0 : 1);
