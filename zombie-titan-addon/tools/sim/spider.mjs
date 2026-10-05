// Spider Titan simulation: birth, its attacks (webs and lightning included),
// the cobwebs it spins and how they melt away, the leg-hit stun (the only time
// players can hurt it), its fury at low health, its death and loot, and the
// Growth Serum on spiders.
//   node tools/sim/run.mjs spider
import { readFileSync } from "node:fs";
import { ItemStack, log, Player, runTicks, world } from "@minecraft/server";

const warnings = [];
console.warn = (...a) => {
  warnings.push(a.join(" "));
  if (process.env.ZT_TRACE) process.stderr.write("WARN " + a.join(" ") + "\n");
};

await import("./scripts/main.js");
const Spider = await import("./scripts/spider_titan.js");

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
/** a point `ahead` blocks in front of the titan and `side` blocks to its right, wherever it faces */
function around(t, ahead, side = 0, up = 0) {
  const yaw = (t.getRotation().y * Math.PI) / 180;
  const f = { x: -Math.sin(yaw), z: Math.cos(yaw) };
  const r = { x: -Math.cos(yaw), z: -Math.sin(yaw) };
  return { x: t.location.x + f.x * ahead + r.x * side, y: t.location.y + up, z: t.location.z + f.z * ahead + r.z * side };
}
/** stand there, looking at a point */
function stand(p, at, look) {
  p.location = { ...at };
  p.rotation = { x: 0, y: (Math.atan2(-(look.x - at.x), look.z - at.z) * 180) / Math.PI };
}
const swing = (p, t) => world.afterEvents.entityHitEntity.fire({ damagingEntity: p, hitEntity: t });
function shoot(p, t, where) {
  const arrow = ow.spawnEntity("minecraft:arrow", where);
  world.afterEvents.projectileHitEntity.fire({
    projectile: arrow, dimension: ow, location: where, hitVector: { x: 0, y: 0, z: 1 }, source: p,
    getEntityHit: () => ({ entity: t }),
  });
  arrow.valid = false;
}

console.log("birth");
const player = new Player(ow, { x: 0, y: 64, z: 20 });
ow.entities.push(player);
protect(player);
const titan = ow.spawnEntity("zt:spider_titan", { x: 0, y: 64, z: 0 });
runTicks(1);
check(titan.props["zt:birth"] === true && titan.props["zt:grow"] < 0.1, "rises from the ground at spider size");
check(hpOf(titan) <= 1000, "boss bar starts at 10%");
check(log.messages.some((m) => m.includes("Spider Titan is rising")), "players are told a Spider Titan is rising");
runTicks(210);
check(titan.props["zt:birth"] === false && titan.props["zt:grow"] === 1, "fully grown after 10 seconds");
check(hpOf(titan) === 10000, "full 10,000 HP");
check(titan.props["zt:anim"] === 11, "rears up and hisses awake");

console.log("attacks");
const seen = new Set();
let bolts = 0;
const counted = new Set();
let spun = 0;
runTicks(7200, (t) => {
  seen.add(titan.props["zt:anim"]);
  spun = Math.max(spun, Spider.websSpun());
  // alternate between its reach and far away (keeping away as it comes), so it uses both kinds of attack
  const far = Math.floor(t / 600) % 2 === 0;
  if (far || t % 600 === 0) {
    player.location = around(titan, far ? 40 : 14, 3);
    player.location.y = 64;
  }
  for (const e of ow.entities) {
    if (counted.has(e.id)) continue;
    if (e.typeId === "minecraft:lightning_bolt") (bolts++, counted.add(e.id));
  }
});
const melee = [3, 5, 9].filter((a) => seen.has(a));
check(melee.length === 3, "rears up and smashes, sweeps a leg, claps its front legs: " + melee.join(","));
check(seen.has(6) && log.particles.includes("zt:web_strand") && log.particles.includes("zt:web_burst"), "shoots webs at a far target");
check(seen.has(7) && bolts > 0, "calls down lightning (" + bolts + " bolts)");
check(seen.has(14), "leaps at far-off prey");
check(spun > 0, "spins cobwebs around its prey (" + spun + ")");
check(player.damageTaken > 0, "hurts the player (" + Math.round(player.damageTaken) + " damage)");
const minions = ow.getEntities({ type: "zt:spider_minion" });
check(minions.length > 0, "summons spider minions (" + minions.length + ")");
check(minions.every((m) => m.spawnEvent?.startsWith("zt:as_")), "in the four minion ranks");

console.log("something high above it");
let anti = false;
runTicks(400, () => {
  player.location = around(titan, 10, 0, 16);
  if (titan.props["zt:anim"] === 4) anti = true;
  return anti;
});
check(anti, "gets an anti-titan strike");
player.location = around(titan, 30, 0);
player.location.y = 64;

console.log("webs melt");
runTicks(300, () => titan.props["zt:anim"] === 0);
const before = Spider.websSpun();
// keep it from spinning more while the old ones melt
player.location = { x: 900, y: 64, z: 900 };
runTicks(640);
check(before > 0 && Spider.websSpun() === 0, "its cobwebs melt away after 30 seconds (" + before + " -> " + Spider.websSpun() + ")");

console.log("lightning and explosions can't hurt it");
let hp0 = hpOf(titan);
titan.applyDamage(500, { cause: "lightning" });
titan.applyDamage(500, { cause: "entityExplosion" });
check(hpOf(titan) === hp0, "no damage from lightning or explosions");

console.log("only hurt while stunned");
player.components["minecraft:equippable"].slots.Mainhand = new ItemStack("minecraft:diamond_sword");
runTicks(200, () => titan.props["zt:anim"] === 0);
hp0 = hpOf(titan);
let n = log.messages.length;
stand(player, around(titan, 11, 0), around(titan, 6, 0, 1));
titan.applyDamage(50, { cause: "entityAttack", damagingEntity: player });
swing(player, titan);
check(hpOf(titan) === hp0, "player hits do nothing while it stands");
check(since(n).some((m) => m.includes("legs")), "tells the player to hit its legs");
check(titan.props["zt:stunned"] === false && (titan.events.includes("zt:spider_block")), "a blow to its head doesn't count");

console.log("hit its legs");
let actions = 0;
for (let i = 0; i < 7; i++) {
  runTicks(6);
  // beside it, swinging at the nearest leg
  stand(player, around(titan, 2, i % 2 ? 9 : -9), around(titan, 2, i % 2 ? 6 : -6, 1));
  const a0 = log.messages.length;
  swing(player, titan);
  if (since(a0).some((m) => m.includes("Leg hit"))) actions++;
}
check(actions === 7 && titan.props["zt:stunned"] === false, "seven leg hits count down (" + actions + "/7), still standing");
// from in front, aiming past its head at a front leg, counts too
runTicks(6);
stand(player, around(titan, 12, -3), around(titan, 7, -7, 1));
n = log.messages.length;
swing(player, titan);
check(since(n).some((m) => m.includes("Leg hit") || m.includes("LEGS GIVE WAY")), "aiming at a front leg from in front counts");
check(titan.props["zt:stunned"] === true && titan.props["zt:anim"] === 8, "the eighth hit knocks it flat");
check(log.messages.some((m) => m.includes("LEGS GIVE WAY")), "the collapse is announced");
hp0 = hpOf(titan);
titan.applyDamage(50, { cause: "entityAttack", damagingEntity: player });
check(hpOf(titan) < hp0, "players can hurt it while it is down");
// (its priest minions may still heal it, as in the Java mod: clear them for this check)
for (const m of ow.getEntities({ type: "zt:spider_minion" })) m.valid = false;
const regenHp = hpOf(titan);
runTicks(200);
check(hpOf(titan) <= regenHp, "it doesn't regenerate while stunned");
runTicks(240);
check(titan.props["zt:stunned"] === false, "gets back up after 21 seconds");
runTicks(120, () => titan.props["zt:anim"] === 0);

console.log("its legs are part of its hitbox");
{
  const box = JSON.parse(readFileSync("entities.json", "utf8"))["zt:spider_titan"];
  const cb = box.collision;
  // its knees stand about 11 blocks out and 15 up, its lower legs reach 13-18 blocks out
  let inside = 0;
  let total = 0;
  for (const yaw of [0, 30, 45, 90, 135]) {
    const a = (yaw * Math.PI) / 180;
    for (const [side, ahead, up] of [[11, -9, 14], [11, 0, 15], [11, 7, 14], [14, -7, 8], [15, 0, 6], [15, 5, 6], [13, 9, 5]]) {
      for (const sgn of [-1, 1]) {
        // a point `ahead` in front and `side` to one side, turned to the titan's facing
        const dx = -Math.sin(a) * ahead - Math.cos(a) * side * sgn;
        const dz = Math.cos(a) * ahead - Math.sin(a) * side * sgn;
        total++;
        if (Math.abs(dx) <= cb.width / 2 && Math.abs(dz) <= cb.width / 2 && up <= cb.height) inside++;
      }
    }
  }
  check(inside === total, "its knees and lower legs are inside its hitbox whichever way it faces (" + inside + "/" + total + ")");
}

console.log("arrows in its legs");
let shots = 0;
for (let i = 0; i < 8; i++) {
  runTicks(6);
  stand(player, around(titan, 30, 0), titan.location);
  const a0 = log.messages.length;
  shoot(player, titan, around(titan, [-1, 4, -6, 2][i % 4], i % 2 ? 13 : -13, [3, 8, 14, 6][i % 4]));
  if (since(a0).some((m) => m.includes("Leg hit") || m.includes("LEGS GIVE WAY"))) shots++;
}
check(shots === 8 && titan.props["zt:stunned"] === true, "eight arrows in its legs knock it down too (" + shots + ")");
runTicks(560, () => titan.props["zt:anim"] === 0 && !titan.props["zt:stunned"]);
n = log.messages.length;
runTicks(6);
shoot(player, titan, around(titan, 9, 0, 6));
check(!since(n).some((m) => m.includes("Leg hit")) && titan.props["zt:stunned"] === false, "an arrow in its head doesn't count");

console.log("fury");
n = log.messages.length;
titan.getComponent("minecraft:health").setCurrentValue(2400);
runTicks(2);
check(titan.props["zt:enraged"] === true, "below a quarter of its health it flashes red with fury");
check(since(n).some((m) => m.includes("ENRAGED")), "the fury is announced");

console.log("death: it rolls onto its back");
player.components["minecraft:equippable"].slots.Mainhand = new ItemStack("zt:dark_fists");
player.location = around(titan, 30, 0);
for (let i = 0; i < 400 && titan.valid; i++) {
  titan.props["zt:stunned"] = true;
  titan.applyDamage(200, { cause: "entityAttack", damagingEntity: player });
  runTicks(1);
}
check(!titan.valid, "it dies");
runTicks(2);
const corpse = ow.getEntities({ type: "zt:spider_titan_corpse" })[0];
check(!!corpse, "a corpse plays the death");
check(log.messages.some((m) => m.includes("Spider Titan has been slain")), "death announced");
const items0 = log.items.length;
runTicks(160);
const drops = log.items.slice(items0);
const total = (id) => drops.filter(([i]) => i === id).reduce((a, [, c]) => a + c, 0);
check(total("minecraft:string") >= 256, "drops string (" + total("minecraft:string") + ")");
check(total("minecraft:spider_eye") >= 64 && total("minecraft:fermented_spider_eye") >= 24, "drops spider eyes");
check(total("minecraft:web") >= 24 && total("minecraft:diamond") >= 8 && total("minecraft:emerald") >= 8, "drops cobwebs, diamonds and emeralds");
check(player.xp === 12000, "killer gets 12,000 XP (" + player.xp + ")");
runTicks(160);
check(!corpse.valid, "corpse removed after the sequence");

console.log("growth serum");
for (const [type, x] of [["minecraft:spider", 200], ["minecraft:cave_spider", 400]]) {
  const mob = ow.spawnEntity(type, { x, y: 64, z: 200 });
  runTicks(1);
  const bottle = ow.spawnEntity("zt:growth_serum", { x, y: 65, z: 200 });
  bottle.valid = false;
  world.afterEvents.projectileHitEntity.fire({
    projectile: bottle, dimension: ow, location: { x, y: 65, z: 200 }, hitVector: { x: 0, y: -1, z: 0 }, source: player,
    getEntityHit: () => ({ entity: mob }),
  });
  runTicks(1);
  const grown = ow.getEntities({ type: "zt:spider_titan" }).filter((t) => Math.abs(t.location.x - x) < 1);
  check(!mob.valid && grown.length === 1, "a " + type.slice(10).replace("_", " ") + " grows into a Spider Titan");
}

console.log("");
if (warnings.length) {
  console.log("script warnings:");
  for (const w of warnings.slice(0, 20)) console.log("  " + w);
}
console.log(failures === 0 && warnings.length === 0 ? "ALL GOOD" : `${failures} failures, ${warnings.length} warnings`);
process.exit(failures === 0 && warnings.length === 0 ? 0 : 1);
