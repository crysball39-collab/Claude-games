// Omegafish simulation: birth, its head and tail attacks, the lightning shot,
// burrowing under the ground and bursting out beneath its prey, its minions,
// the arrow stun (the only time players can hurt it), the explosions at your
// feet when it glows white, its death and loot, and the Growth Serum on
// silverfish.
//   node tools/sim/run.mjs omegafish
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
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** a point `ahead` blocks in front of the titan and `side` blocks to its right, wherever it faces */
function around(t, ahead, side = 0, up = 0) {
  const yaw = (t.getRotation().y * Math.PI) / 180;
  const f = { x: -Math.sin(yaw), z: Math.cos(yaw) };
  const r = { x: -Math.cos(yaw), z: -Math.sin(yaw) };
  return { x: t.location.x + f.x * ahead + r.x * side, y: 64 + up, z: t.location.z + f.z * ahead + r.z * side };
}
/** stand there, looking at a point */
function stand(p, at, look) {
  p.location = { ...at };
  p.rotation = { x: 0, y: (Math.atan2(-(look.x - at.x), look.z - at.z) * 180) / Math.PI };
}
const swing = (p, t) => world.afterEvents.entityHitEntity.fire({ damagingEntity: p, hitEntity: t });
function shoot(p, t, where, type = "minecraft:arrow") {
  const shot = ow.spawnEntity(type, where);
  world.afterEvents.projectileHitEntity.fire({
    projectile: shot, dimension: ow, location: where, hitVector: { x: 0, y: 0, z: 1 }, source: p,
    getEntityHit: () => ({ entity: t }),
  });
  shot.valid = false;
}
const arrowHits = (n) => since(n).filter((m) => m.includes("Arrow hit")).length;

console.log("birth");
const player = new Player(ow, { x: 0, y: 64, z: 20 });
ow.entities.push(player);
protect(player);
const titan = ow.spawnEntity("zt:omegafish", { x: 0, y: 64, z: 0 });
runTicks(1);
check(titan.props["zt:birth"] === true && titan.props["zt:grow"] < 0.1, "rises from the ground at silverfish size");
check(hpOf(titan) <= 800, "boss bar starts at 10%");
check(log.messages.some((m) => m.includes("an Omegafish is rising")), "players are told an Omegafish is rising");
runTicks(210);
check(titan.props["zt:birth"] === false && titan.props["zt:grow"] === 1, "fully grown after 10 seconds");
check(hpOf(titan) === 8000, "full 8,000 HP");
check(titan.props["zt:anim"] === 11, "rears up and hisses awake");

console.log("attacks");
const seen = new Set();
let bolts = 0;
let burned = false;
const counted = new Set();
runTicks(9000, (t) => {
  seen.add(titan.props["zt:anim"]);
  if (player.onFire) burned = true;
  // in front of it, behind it (where its tail is) and far away, in turns
  const phase = Math.floor(t / 600) % 3;
  if (phase === 0) player.location = around(titan, 45, 2);
  else if (phase === 1 && t % 600 === 0) player.location = around(titan, 9, 1);
  else if (phase === 2 && titan.props["zt:anim"] === 0) player.location = around(titan, -10, 1);
  for (const e of ow.entities) {
    if (counted.has(e.id)) continue;
    if (e.typeId === "minecraft:lightning_bolt") (bolts++, counted.add(e.id));
  }
});
check(seen.has(3) && seen.has(7), "head butts and body slams what is in front of it");
check(seen.has(4) && seen.has(6), "swipes and smashes its tail at what is behind it");
check(seen.has(5) && bolts > 0 && burned, "shoots lightning that sets its prey burning (" + bolts + " bolts)");
check(seen.has(9) && seen.has(10), "burrows and erupts");
check(player.damageTaken > 0, "hurts the player (" + Math.round(player.damageTaken) + " damage)");
const minions = ow.getEntities({ type: "zt:silverfish_minion" });
check(minions.length > 0, "summons silverfish minions (" + minions.length + ")");
check(minions.every((m) => m.spawnEvent?.startsWith("zt:as_")), "in the four minion ranks");
for (const m of minions) m.valid = false;

console.log("burrowing");
runTicks(400, () => titan.props["zt:anim"] === 0);
let started = false;
runTicks(3000, () => {
  if (titan.props["zt:anim"] === 9) return (started = true);
  player.location = around(titan, 70, 0);
  return false;
});
check(started, "a far-off target makes it burrow");
const goal = { ...player.location };
const from = { ...titan.location };
runTicks(40, () => titan.props["zt:burrowed"] === true);
check(titan.props["zt:burrowed"] === true, "it dives underground");
let hp0 = hpOf(titan);
titan.applyDamage(300, { cause: "entityAttack", damagingEntity: player });
const zombie = ow.spawnEntity("minecraft:zombie", { x: titan.location.x + 3, y: 64, z: titan.location.z });
titan.applyDamage(300, { cause: "entityAttack", damagingEntity: zombie });
zombie.valid = false;
check(hpOf(titan) === hp0, "nothing can hurt it underground");
let n = log.messages.length;
shoot(player, titan, { x: titan.location.x, y: 66, z: titan.location.z });
check(arrowHits(n) === 0, "arrows don't count while it is underground");
const d0 = flat(titan.location, goal);
runTicks(20);
const d1 = flat(titan.location, goal);
check(d0 - d1 > 14, "tunnels toward its prey far faster than it walks (" + (d0 - d1).toFixed(1) + " blocks in a second)");
check(log.particles.includes("zt:rumble"), "a rumbling trail shows where it tunnels");
const dmg0 = player.damageTaken;
const kb0 = player.knockbacks.length;
let erupted = false;
runTicks(200, () => (erupted = titan.props["zt:anim"] === 10));
check(erupted && flat(titan.location, goal) < 4, "bursts out of the ground right under its prey (" + flat(titan.location, goal).toFixed(1) + " away, from " + flat(from, goal).toFixed(0) + ")");
check(titan.props["zt:burrowed"] === false, "and can be hit again");
runTicks(8);
check(player.damageTaken > dmg0 && player.knockbacks.slice(kb0).some((k) => k.y >= 1), "the eruption hurts its prey and throws it into the air");

console.log("lightning and explosions can't hurt it");
runTicks(200, () => titan.props["zt:anim"] === 0);
hp0 = hpOf(titan);
titan.applyDamage(500, { cause: "lightning" });
titan.applyDamage(500, { cause: "entityExplosion" });
check(hpOf(titan) === hp0, "no damage from lightning or explosions");

console.log("only hurt while flopped over");
player.components["minecraft:equippable"].slots.Mainhand = new ItemStack("minecraft:diamond_sword");
// beyond its sight (80 blocks), so it stays still while we shoot, but in earshot (128)
player.location = { x: titan.location.x + 100, y: 64, z: titan.location.z };
runTicks(200, () => titan.props["zt:anim"] === 0);
hp0 = hpOf(titan);
n = log.messages.length;
stand(player, around(titan, 9, 0), around(titan, 5, 0, 1));
titan.applyDamage(50, { cause: "entityAttack", damagingEntity: player });
swing(player, titan);
check(hpOf(titan) === hp0, "sword blows do nothing while it is upright");
check(since(n).some((m) => m.includes("arrows")), "tells the player to shoot it with arrows");
check(titan.events.includes("zt:omegafish_block"), "its damage sensor blocks the blow");
player.location = { x: titan.location.x + 100, y: 64, z: titan.location.z };
n = log.messages.length;
runTicks(6);
shoot(player, titan, around(titan, 0, 0, 4), "minecraft:snowball");
check(arrowHits(n) === 0, "a snowball doesn't count");

console.log("arrows");
let hits = 0;
for (let i = 0; i < 5; i++) {
  runTicks(6);
  n = log.messages.length;
  shoot(player, titan, around(titan, [-4, 2, 6, -1, 3][i], [2, -3, 0, 3, -1][i], [4, 5, 3, 6, 4][i]));
  hits += arrowHits(n);
}
check(hits === 5 && titan.props["zt:stunned"] === false, "five arrows count down (" + hits + "/5), still upright");
runTicks(6);
n = log.messages.length;
// a multishot volley: three arrows in the same moment count once
shoot(player, titan, around(titan, 0, 0, 5));
shoot(player, titan, around(titan, 1, 1, 5));
shoot(player, titan, around(titan, -1, -1, 5));
check(titan.props["zt:stunned"] === true && titan.props["zt:anim"] === 8, "the sixth arrow flips it onto its back");
check(since(n).some((m) => m.includes("FLOPS OVER")), "the flop is announced");
hp0 = hpOf(titan);
titan.applyDamage(50, { cause: "entityAttack", damagingEntity: player });
check(hpOf(titan) < hp0, "players can hurt it while it is on its back");
// (its priest minions may still heal it, as in the Java mod: clear them for this check)
for (const m of ow.getEntities({ type: "zt:silverfish_minion" })) m.valid = false;
const regenHp = hpOf(titan);
runTicks(200);
check(hpOf(titan) <= regenHp, "it doesn't regenerate on its back");
runTicks(190);
check(titan.props["zt:stunned"] === false, "rolls back over after about 19 seconds");
runTicks(60, () => titan.props["zt:anim"] === 0);
n = log.messages.length;
runTicks(6);
shoot(player, titan, around(titan, 0, 0, 4));
check(arrowHits(n) === 1, "the count starts again from zero");

console.log("fury");
n = log.messages.length;
titan.getComponent("minecraft:health").setCurrentValue(1900);
runTicks(2);
check(titan.props["zt:enraged"] === true, "below a quarter of its health it glows white");
check(since(n).some((m) => m.includes("ENRAGED")), "the fury is announced");
const ex0 = log.explosions.length;
// where the player stood each tick: a blast goes off where they stood a second before (time to dodge)
const stood = new Map();
runTicks(1200, (t) => {
  // (players keep it low: it heals out of its fury otherwise)
  titan.getComponent("minecraft:health").setCurrentValue(1900);
  player.location = around(titan, 30, 4);
  stood.set(t, { ...player.location });
});
const blasts = log.explosions.slice(ex0);
// (the titan reads where the player stood at the end of the tick before)
const misses = blasts.filter((x) => !stood.has(x.tick - 21) || flat(x, stood.get(x.tick - 21)) > 0.5);
check(blasts.length >= 5 && misses.length === 0, "explosions go off at its enemies' feet, a second after they crackle (" + blasts.length + ")");
check(blasts.every((x) => !x.breaksBlocks), "they break no blocks");
check(log.sounds.includes("random.fuse"), "each one crackles a second before it blows");

console.log("death: it flops onto its back");
player.components["minecraft:equippable"].slots.Mainhand = new ItemStack("zt:dark_fists");
for (let i = 0; i < 400 && titan.valid; i++) {
  titan.props["zt:stunned"] = true;
  titan.props["zt:burrowed"] = false;
  titan.applyDamage(200, { cause: "entityAttack", damagingEntity: player });
  runTicks(1);
}
check(!titan.valid, "it dies");
runTicks(2);
const corpse = ow.getEntities({ type: "zt:omegafish_corpse" })[0];
check(!!corpse, "a corpse plays the death");
check(log.messages.some((m) => m.includes("Omegafish has been slain")), "death announced");
const items0 = log.items.length;
runTicks(160);
const drops = log.items.slice(items0);
const total = (id) => drops.filter(([i]) => i === id).reduce((a, [, c]) => a + c, 0);
check(total("minecraft:stone") >= 16 && total("minecraft:stone_bricks") >= 16, "drops stone and stone bricks");
check(total("minecraft:paper") >= 16, "drops paper (" + total("minecraft:paper") + ")");
check(total("minecraft:diamond") >= 4 && total("minecraft:emerald") >= 4, "drops diamonds and emeralds");
check(player.xp === 1000, "killer gets 1,000 XP (" + player.xp + ")");
runTicks(160);
check(!corpse.valid, "corpse removed after the sequence");

console.log("growth serum");
for (const [type, x] of [["minecraft:silverfish", 200], ["zt:silverfish_minion", 400]]) {
  const mob = ow.spawnEntity(type, { x, y: 64, z: 200 });
  runTicks(1);
  const bottle = ow.spawnEntity("zt:growth_serum", { x, y: 65, z: 200 });
  bottle.valid = false;
  world.afterEvents.projectileHitEntity.fire({
    projectile: bottle, dimension: ow, location: { x, y: 65, z: 200 }, hitVector: { x: 0, y: -1, z: 0 }, source: player,
    getEntityHit: () => ({ entity: mob }),
  });
  runTicks(1);
  const grown = ow.getEntities({ type: "zt:omegafish" }).filter((t) => Math.abs(t.location.x - x) < 1);
  check(!mob.valid && grown.length === 1, "a " + type.replace(/^.*:/, "").replace("_", " ") + " grows into an Omegafish");
}

console.log("");
if (warnings.length) {
  console.log("script warnings:");
  for (const w of warnings.slice(0, 20)) console.log("  " + w);
}
console.log(failures === 0 && warnings.length === 0 ? "ALL GOOD" : `${failures} failures, ${warnings.length} warnings`);
process.exit(failures === 0 && warnings.length === 0 ? 0 : 1);
