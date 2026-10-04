// Creeper Titan simulation: birth, its attacks (TNT rain and lightning
// included), the head-hit stun (the only time players can hurt it), the
// charged phase, and the slow death: the fuse, the swelling and the blast.
//   node tools/sim/run.mjs creeper
import { ItemStack, log, Player, runTicks, world } from "@minecraft/server";

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
const hpOf = (e) => e.getComponent("minecraft:health").currentValue;
const since = (n) => log.messages.slice(n);
/** the titan faces +Z (yaw 0): stand `ahead` blocks in front of it, `side` blocks to its left */
const inFront = (t, ahead, side = 0) => ({ x: t.location.x + side, y: 64, z: t.location.z + ahead });

console.log("birth");
const player = new Player(ow, { x: 0, y: 64, z: 20 });
ow.entities.push(player);
protect(player);
const titan = ow.spawnEntity("zt:creeper_titan", { x: 0, y: 64, z: 0 });
runTicks(1);
check(titan.props["zt:birth"] === true && titan.props["zt:grow"] < 0.1, "rises from the ground at creeper size");
check(hpOf(titan) <= 2500, "boss bar starts at 10%");
check(log.messages.some((m) => m.includes("Creeper Titan is rising")), "players are told a Creeper Titan is rising");
runTicks(210);
check(titan.props["zt:birth"] === false && titan.props["zt:grow"] === 1, "fully grown after 10 seconds");
check(hpOf(titan) === 25000, "full 25,000 HP");
check(titan.props["zt:anim"] === 11, "hisses awake");

console.log("attacks");
const seen = new Set();
let tnt = 0;
let bolts = 0;
const counted = new Set();
runTicks(6000, (t) => {
  seen.add(titan.props["zt:anim"]);
  // alternate between melee range and far away so it uses both kinds of attack
  if (t % 300 === 0) {
    const far = Math.floor(t / 300) % 3 === 0;
    player.location = inFront(titan, far ? 50 : 14, 3);
  }
  for (const e of ow.entities) {
    if (counted.has(e.id)) continue;
    if (e.typeId === "minecraft:tnt") (tnt++, counted.add(e.id));
    if (e.typeId === "minecraft:lightning_bolt") (bolts++, counted.add(e.id));
  }
});
const attacks = [1, 2, 3, 5, 6, 7].filter((a) => seen.has(a));
check(attacks.filter((a) => a <= 5).length >= 3, "uses its melee attacks: " + attacks.join(","));
check(seen.has(6) && tnt > 0, "rains TNT on a far target (" + tnt + " TNT)");
check(bolts > 0, "calls down lightning (" + bolts + " bolts)");
check(log.particles.includes("zt:fuse_spark"), "the air crackles before lightning strikes");
check(player.damageTaken > 0, "hurts the player (" + Math.round(player.damageTaken) + " damage)");
const minions = ow.getEntities({ type: "zt:creeper_minion" }).length;
check(minions > 0, "summons creeper minions (" + minions + ")");

console.log("lightning and explosions can't hurt it");
let hp0 = hpOf(titan);
titan.applyDamage(500, { cause: "lightning" });
titan.applyDamage(500, { cause: "entityExplosion" });
check(hpOf(titan) === hp0, "no damage from lightning or explosions");

console.log("only hurt while stunned");
player.components["minecraft:equippable"].slots.Mainhand = new ItemStack("minecraft:diamond_sword");
hp0 = hpOf(titan);
let n = log.messages.length;
titan.applyDamage(50, { cause: "entityAttack", damagingEntity: player });
world.afterEvents.entityHitEntity.fire({ damagingEntity: player, hitEntity: titan });
check(hpOf(titan) === hp0, "player hits do nothing while it stands");
check(since(n).some((m) => m.includes("hit its head")), "tells the player how to stun it");
check(titan.props["zt:stunned"] === false, "a hit at the wrong moment doesn't stun it");

console.log("hit its head while it is down");
// wait for a Head Slam, Body Slam or Thunder Clap, then hit it from the front while its head is down
const windows = { 1: 50, 3: 110, 7: 118 };
let started = -1;
let current = 0;
let stunnedAt = -1;
let behindTried = false;
runTicks(12000, (t) => {
  const a = titan.props["zt:anim"];
  if (a !== current) {
    current = a;
    started = t;
  }
  if (t % 200 === 0 && !(a in windows)) player.location = inFront(titan, 14, 2);
  if (a in windows && t - started === windows[a]) {
    if (!behindTried) {
      // from behind, it doesn't count
      behindTried = true;
      player.location = inFront(titan, -10, 0);
      world.afterEvents.entityHitEntity.fire({ damagingEntity: player, hitEntity: titan });
      check(titan.props["zt:stunned"] === false, "a hit from behind while its head is down doesn't count");
      return false;
    }
    player.location = inFront(titan, 9, 1);
    world.afterEvents.entityHitEntity.fire({ damagingEntity: player, hitEntity: titan });
    if (titan.props["zt:stunned"]) stunnedAt = t;
  }
  return stunnedAt >= 0;
});
check(stunnedAt >= 0, "a hit on its head while it is down stuns it");
check(titan.props["zt:anim"] === 8, "it keels over");
check(log.messages.some((m) => m.includes("keeled over")), "the stun is announced");
hp0 = hpOf(titan);
titan.applyDamage(50, { cause: "entityAttack", damagingEntity: player });
check(hpOf(titan) < hp0, "players can hurt it while it is down");
// (its priest minions may still heal it, as in the Java mod: clear them for this check)
for (const m of ow.getEntities({ type: "zt:creeper_minion" })) m.valid = false;
const regenHp = hpOf(titan);
runTicks(200);
check(hpOf(titan) <= regenHp, "it doesn't regenerate while stunned");
runTicks(300);
check(titan.props["zt:stunned"] === false, "gets back up after 23 seconds");

console.log("charged");
n = log.messages.length;
titan.getComponent("minecraft:health").setCurrentValue(6000);
runTicks(2);
check(titan.props["zt:enraged"] === true, "below a quarter of its health it becomes charged");
check(since(n).some((m) => m.includes("CHARGED")), "the charge is announced");

console.log("death: the fuse, the swell and the blast");
player.components["minecraft:equippable"].slots.Mainhand = new ItemStack("zt:dark_fists");
player.location = inFront(titan, 30, 0);
for (let i = 0; i < 400 && titan.valid; i++) {
  titan.props["zt:stunned"] = true;
  titan.applyDamage(200, { cause: "entityAttack", damagingEntity: player });
  runTicks(1);
}
check(!titan.valid, "it dies");
runTicks(2);
const corpse = ow.getEntities({ type: "zt:creeper_titan_corpse" })[0];
check(!!corpse, "a corpse plays the death");
check(!!corpse && corpse.props["zt:enraged"] === true, "it died charged");
check(log.messages.some((m) => m.includes("Creeper Titan has been slain")), "death announced");
n = log.messages.length;
const boomsBefore = log.explosions.length;
runTicks(150);
check(!!corpse && corpse.props["zt:fuse"] > 0.2 && corpse.props["zt:fuse"] < 0.5, "the fuse burns down (" + corpse?.props["zt:fuse"] + ")");
check(since(n).some((m) => m.includes("fuse is lit")), "players are warned to run");
check(since(n).some((m) => m.includes("[title]") && m.includes("RUN")), "a RUN! title for players nearby");
check(log.explosions.length === boomsBefore, "no real explosions while the fuse burns");
const before = log.items.length;
const dmg0 = player.damageTaken;
runTicks(175);
const booms = log.explosions.slice(boomsBefore);
check(booms.length === 5, "five huge explosions along its body (" + booms.length + ")");
check(booms.every((b) => b.radius >= 6 && b.breaksBlocks), "big enough to leave a crater");
check(corpse.props["zt:fuse"] === 1, "the corpse is gone in the blast");
check(player.damageTaken > dmg0, "the blast hurts players nearby");
const drops = log.items.slice(before);
check(drops.some(([id]) => id === "minecraft:gunpowder") && drops.some(([id]) => id === "minecraft:tnt"), "drops gunpowder and TNT");
check(drops.some(([id]) => id.startsWith("minecraft:music_disc")), "drops music discs");
check(drops.some(([id]) => id === "minecraft:creeper_head"), "drops creeper heads");
check(player.xp === 50000, "killer gets 50,000 XP (" + player.xp + ")");
runTicks(60);
check(!corpse.valid, "corpse removed after the sequence");

console.log("growth serum");
const creeper = ow.spawnEntity("minecraft:creeper", { x: 200, y: 64, z: 200 });
runTicks(1);
const bottle = ow.spawnEntity("zt:growth_serum", { x: 200, y: 65, z: 200 });
bottle.valid = false;
world.afterEvents.projectileHitEntity.fire({
  projectile: bottle, dimension: ow, location: { x: 200, y: 65, z: 200 }, hitVector: { x: 0, y: -1, z: 0 }, source: player,
  getEntityHit: () => ({ entity: creeper }),
});
runTicks(1);
check(!creeper.valid && ow.getEntities({ type: "zt:creeper_titan" }).length === 1, "a creeper grows into a Creeper Titan");

console.log("");
if (warnings.length) {
  console.log("script warnings:");
  for (const w of warnings.slice(0, 20)) console.log("  " + w);
}
console.log(failures === 0 && warnings.length === 0 ? "ALL GOOD" : `${failures} failures, ${warnings.length} warnings`);
process.exit(failures === 0 && warnings.length === 0 ? 0 : 1);
