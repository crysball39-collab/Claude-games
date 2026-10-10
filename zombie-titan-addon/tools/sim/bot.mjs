// The Players: one joins from its spawn egg, walks and looks about like a player, sees what's
// in front of it (and what moves at the edge of its sight) but not behind it, hears footsteps,
// picks things up, eats when hungry, fights a zombie with its sword (crits, knockback), raises
// its shield at a skeleton, backs off a creeper, runs from a warden, dies (its things spill,
// a death message) and respawns, keeps its mind through a save; its menu (talk, befriend,
// follow, wait, give and ask for things), its chat, the Player API settings and the AI bridge.
//   node tools/sim/run.mjs bot
import { ItemStack, log, Player, runTicks, sim, system, world } from "@minecraft/server";
import { ui } from "@minecraft/server-ui";

const warnings = [];
console.warn = (...a) => {
  warnings.push(a.join(" "));
  if (process.env.ZT_TRACE) process.stderr.write("WARN " + a.join(" ") + "\n");
};

// grass over dirt over stone; a bright day
sim.terrain = (dim, x, y, z) => (dim === "minecraft:overworld" ? (y === 63 ? "minecraft:grass_block" : y >= 60 && y < 63 ? "minecraft:dirt" : undefined) : undefined);
sim.items = true;
world.timeOfDay = 1000;

await import("./scripts/main.js");
const Bot = await import("./scripts/bot.js");
const B = await import("./scripts/bot_body.js");
const S = await import("./scripts/bot_skills.js");
const Inv = await import("./scripts/bot_inv.js");
const Chat = await import("./scripts/bot_chat.js");

const ow = world.getDimension("overworld");
let failures = 0;
function check(cond, msg) {
  if (cond) console.log("  ok   " + msg);
  else {
    failures++;
    console.log("  FAIL " + msg);
  }
}
const said = (bot, n = 0) => log.messages.slice(n).filter((m) => m.startsWith(`<${bot.name}> `));
/** Make the Player do one thing (nothing else interrupts it) until it's done. */
function run(bot, gen, ticks) {
  let done = false;
  let result;
  const wrapped = (function* () {
    result = yield* gen;
    done = true;
    return result;
  })();
  bot.task = { name: "test", prio: 1000, gen: wrapped, since: system.currentTick, ttl: 1e9 };
  runTicks(ticks, () => done);
  return { done, result };
}
/** Hold it still (a task nothing beats) for a number of ticks. */
function hold(bot, ticks) {
  return run(bot, S.wait(ticks), ticks + 2);
}

console.log("joining");
let n0 = log.messages.length;
const egg = ow.spawnEntity("zt:player", { x: 0.5, y: 64, z: 0.5 });
runTicks(2);
const bot = Bot.botOf(egg);
check(!!bot, "a Player comes out of the spawn egg");
check(log.messages.slice(n0).some((m) => m === `§e${bot.name} joined the game`), `"${bot.name} joined the game"`);
check(egg.nameTag === bot.name && egg.getProperty("zt:skin") === bot.skin, `its name over its head, skin ${bot.skin}`);
check(Inv.container(bot)?.size === 36, "36 inventory slots, as a player has");
check(B.health(bot) === 20 && bot.hunger === 20, "20 health and 20 hunger");

console.log("moving about");
let t0 = system.currentTick;
let r = run(bot, S.goTo(bot, { x: 20, y: 64, z: 0, r: 0.5 }), 400);
const took = system.currentTick - t0;
check(r.done && r.result && B.flat(egg.location, { x: 20.5, z: 0.5 }) < 1.2, `walks 20 blocks (${took} ticks)`);
check(took >= 20 / B.SPEED.sprint - 2 && took < 20 / B.SPEED.walk * 2, "at a player's pace");
// a block in the way: it jumps up it
ow.getBlock({ x: 25, y: 64, z: 0 }) && setRow(25, 64, -3, 3, "minecraft:stone");
r = run(bot, S.goTo(bot, { x: 30, y: 64, z: 0, r: 0.5 }), 400);
check(r.result && Math.abs(egg.location.y - 64) < 0.2 && egg.location.x > 29, "over a step in its way and on");
function setRow(x, y, z0, z1, id) {
  for (let z = z0; z <= z1; z++) ow.setBlockType({ x, y, z }, id);
}

console.log("looking");
B.lookAt(bot, { x: 30.5, y: 65.6, z: 20 }, 60, 5);
hold(bot, 20);
check(Math.abs(B.wrap(bot.headYaw - 0)) < 5, `turns its head to look (yaw ${bot.headYaw.toFixed(0)})`);
check(Math.abs(egg.getProperty("zt:look_y")) <= 85 && egg.getRotation().y !== undefined, "and its body follows its head");
const yaws = new Set();
run(bot, (function* () {
  for (let i = 0; i < 300; i++) {
    yaws.add(Math.round(bot.headYaw / 10));
    yield;
  }
})(), 310);
check(yaws.size > 3, "with nothing to do, it glances about");

console.log("seeing and hearing");
bot.seen.clear();
bot.headYaw = 0;
bot.yaw = 0;
bot.headPitch = 0;
const front = ow.spawnEntity("minecraft:zombie", { x: 30.5, y: 64, z: 12 });
const behind = ow.spawnEntity("minecraft:zombie", { x: 30.5, y: 64, z: -8 });
const Sense = await import("./scripts/bot_senses.js");
B.lookAt(bot, { x: 30.5, y: 65.6, z: 30 }, 40, 9);
Sense.senseTick(bot, system.currentTick);
check(bot.seen.has(front.id), "sees a zombie in front of it");
check(!bot.seen.has(behind.id), "not one behind it");
// one walking behind: it hears its steps and turns
behind.velocity = { x: 0.1, y: 0, z: 0 };
bot.look = undefined;
const heard0 = bot.heard.length;
Sense.senseTick(bot, system.currentTick);
check(bot.heard.length > heard0 && bot.heard[bot.heard.length - 1].kind === "footsteps", "hears footsteps behind it");
// a wall between: out of sight
for (let x = 28; x <= 33; x++) for (let y = 64; y <= 67; y++) ow.setBlockType({ x, y, z: 6 }, "minecraft:stone");
bot.seen.clear();
bot.look = undefined;
B.lookAt(bot, { x: 30.5, y: 65.6, z: 30 }, 40, 9);
Sense.senseTick(bot, system.currentTick);
check(!bot.seen.has(front.id), "nothing through a wall");
for (let x = 28; x <= 33; x++) for (let y = 64; y <= 67; y++) ow.setBlockType({ x, y, z: 6 }, "minecraft:air");
front.remove();
behind.remove();
// a sound: a block breaking nearby
bot.look = undefined;
Sense.soundAt([bot], ow, { x: 34, y: 64, z: 0 }, "break");
check(bot.heard.some((h) => h.kind === "break"), "hears a block break nearby");

console.log("picking things up");
ow.spawnItem(new ItemStack("minecraft:bread", 3), { x: 31, y: 64.5, z: 1 });
r = run(bot, S.collect(bot, { x: 31, y: 64, z: 1 }, 5, 100), 120);
check(Inv.count(bot, "minecraft:bread") === 3, "walks over to some bread and picks it up");

console.log("eating");
bot.hunger = 9;
bot.sat = 0;
bot.task = null;
runTicks(80, () => bot.hunger > 9);
check(bot.hunger > 9 && Inv.count(bot, "minecraft:bread") === 2, `hungry, it eats bread (hunger 9 -> ${bot.hunger})`);
check(log.sounds.includes("random.eat") && log.sounds.includes("random.burp"), "munching, then a burp");

console.log("fighting");
sim.mobs = true;
Inv.add(bot, new ItemStack("minecraft:stone_sword", 1));
Inv.add(bot, new ItemStack("minecraft:shield", 1));
B.heal(bot, 20);
const z = ow.spawnEntity("minecraft:zombie", { x: 36.5, y: 64, z: 0.5 });
bot.task = null;
const kills0 = bot.stats.kills;
const lvl0 = bot.level + bot.xp;
let swings = 0;
let lastSwing = egg.getProperty("zt:swing");
runTicks(600, () => {
  if (egg.getProperty("zt:swing") !== lastSwing) {
    swings++;
    lastSwing = egg.getProperty("zt:swing");
  }
  return !z.valid;
});
check(!z.valid, `kills a zombie that came at it (${swings} swings)`);
check(Inv.held(bot)?.typeId === "minecraft:stone_sword" && Inv.getEquip(bot, "Offhand")?.typeId === "minecraft:shield", "with its sword in hand and shield in the other");
check(bot.stats.kills === kills0 + 1 && bot.level + bot.xp > lvl0, "the kill counts, and gives it experience");
check(z.knockbacks.length > 0, "its hits knock the zombie back");
check(Inv.durabilityLeft(Inv.held(bot)) < 1, "its sword wears");
// a skeleton: shield up
const sk = ow.spawnEntity("minecraft:skeleton", { x: 46.5, y: 64, z: 0.5 });
let blocked = false;
runTicks(600, () => {
  if (egg.getProperty("zt:blocking")) blocked = true;
  return !sk.valid;
});
check(blocked, "raises its shield walking up to a skeleton");
check(!sk.valid, "and kills it");
// a creeper: hit and back off
B.heal(bot, 20);
const cr = ow.spawnEntity("minecraft:creeper", { x: egg.location.x + 6, y: 64, z: egg.location.z });
let closest = 99;
let backed = false;
runTicks(500, () => {
  if (!cr.valid) return true;
  const d = B.dist(cr.location, egg.location);
  if (d < closest) closest = d;
  if (closest < 3 && d > closest + 2) backed = true;
  return false;
});
check(backed || !cr.valid, `backs off from a creeper (closest ${closest.toFixed(1)})`);
for (const e of ow.entities.filter((e) => e.typeId === "minecraft:creeper")) e.remove();
// a warden: run
B.heal(bot, 20);
const w = ow.spawnEntity("minecraft:warden", { x: egg.location.x + 10, y: 64, z: egg.location.z });
w.components["minecraft:health"] ??= { currentValue: 500, effectiveMax: 500, setCurrentValue() {} };
bot.task = null;
const startD = B.dist(w.location, egg.location);
runTicks(200);
Sense.senseTick(bot, system.currentTick);
runTicks(200);
check(B.dist(w.location, egg.location) > startD + 8, `runs from a warden (${startD.toFixed(0)} -> ${B.dist(w.location, egg.location).toFixed(0)} blocks)`);
w.remove();
sim.mobs = false;

console.log("dying and respawning");
Inv.add(bot, new ItemStack("minecraft:cobblestone", 20));
const items0 = log.items.length;
n0 = log.messages.length;
const killer = ow.spawnEntity("minecraft:zombie", { x: egg.location.x + 1, y: 64, z: egg.location.z });
egg.applyDamage(100, { cause: "entityAttack", damagingEntity: killer });
killer.remove();
check(log.messages.slice(n0).some((m) => m === `${bot.name} was slain by Zombie`), `"${bot.name} was slain by Zombie"`);
check(log.items.slice(items0).some(([id]) => id === "minecraft:cobblestone") && log.items.slice(items0).some(([id]) => id === "minecraft:stone_sword"),
  "everything it had falls where it died");
check(bot.dead && bot.level === 0, "dead, its experience gone");
runTicks(80);
const body = bot.entity;
check(!bot.dead && body !== egg && body.isValid, "a few seconds later it respawns");
check(Inv.stacks(bot).length === 0 && bot.hunger === 20, "with nothing, and full");
check(B.flat(body.location, { x: 0, z: 0 }) < 4, "at the world spawn (it has no bed)");
check(Bot.botOf(body) === bot && bot.stats.deaths === 1, "the same Player (it remembers its death)");
runTicks(100);
check(said(bot, n0).length > 0, `says something about it: "${said(bot, n0)[0] ?? ""}"`);

console.log("its memory");
bot.progress.stage = "iron";
bot.progress.done.push("wood", "stone");
bot.friends.Alex = 4;
Bot.save(bot);
const raw = body.getDynamicProperty("zt:bot");
const st = JSON.parse(raw);
check(st.name === bot.name && st.progress.stage === "iron" && st.friends.Alex === 4, "what it is and knows is saved on it");
// the world reloads: a new object for the same entity
Bot.bots.delete(bot.uid);
const reloaded = ow.spawnEntity("zt:player", { x: 5, y: 64, z: 5 });
reloaded.setDynamicProperty("zt:bot", raw);
body.remove();
runTicks(3);
const again = Bot.botOf(reloaded);
check(again && again.name === bot.name && again.progress.stage === "iron" && again.friends.Alex === 4 && again.skin === bot.skin,
  "after a reload it's the same Player, where it left off");
const me = again;
me.events.length = 0;

console.log("talking to it");
const steve = new Player(ow, { x: 7, y: 64, z: 5 });
steve.selectedSlotIndex = 0;
ow.entities.push(steve);
/** Answer each form in turn with a function of the form. */
let answers = [];
ui.answer = (form) => {
  const f = answers.shift();
  return f ? f(form) : { canceled: true };
};
const button = (label) => (form) => {
  const i = form.items.filter((x) => x.type === "button").findIndex((b) => b.text.startsWith(label));
  if (i < 0) throw new Error("no button " + label + " in " + form.titleText);
  return { canceled: false, selection: i };
};
const text = (t) => () => ({ canceled: false, formValues: [t] });
async function tap(...steps) {
  answers = steps;
  world.afterEvents.playerInteractWithEntity.fire({ player: steve, target: me.entity });
  for (let i = 0; i < 6; i++) await Promise.resolve();
}
n0 = log.messages.length;
await tap(button("Talk"), text("hi there"));
runTicks(120);
check(log.messages.slice(n0).includes("<Steve> hi there"), "what you say shows in the chat");
check(said(me, n0).length >= 1, `it answers: "${said(me, n0).at(-1) ?? ""}"`);
const menu = ui.shown.find((s) => s.form.titleText === me.name);
check(menu && /Health \d+\/20/.test(menu.form.bodyText) && /Hunger/.test(menu.form.bodyText) && /Doing:/.test(menu.form.bodyText),
  "its menu shows its health, hunger, armour, level and what it's doing");

console.log("follow me, wait here");
me.friends.Steve = 3;
await tap(button("Follow me"));
runTicks(30);
check(me.follow === "Steve", "Follow me: it follows");
steve.location = { x: 20, y: 64, z: 15 };
runTicks(300);
check(B.dist(me.entity.location, steve.location) < 4.5, `it keeps up as you walk off (${B.dist(me.entity.location, steve.location).toFixed(1)} blocks)`);
await tap(button("Wait here"));
runTicks(30);
check(me.stay && !me.follow, "Wait here: it stops following and waits");
const waitAt = { ...me.entity.location };
steve.location = { x: 40, y: 64, z: 15 };
runTicks(300);
check(B.dist(me.entity.location, waitAt) < 3.5, "and stays put");
await tap(button("You can go"));
runTicks(10);
check(!me.stay, "You can go: back to its own business");
steve.location = { x: me.entity.location.x + 2, y: 64, z: me.entity.location.z };

console.log("giving and asking");
const inv = steve.getComponent("minecraft:inventory").container;
inv.setItem(0, new ItemStack("minecraft:diamond", 2));
const like0 = me.friends.Steve;
await tap(button("Give it what you're holding"));
runTicks(40);
check(Inv.count(me, "minecraft:diamond") === 2 && !inv.getItem(0), "you give it your diamonds; it takes them");
check(me.friends.Steve > like0, "and likes you more for it");
Inv.add(me, new ItemStack("minecraft:cooked_beef", 10));
const drop0 = log.items.length;
await tap(button("Ask it for something"), button("cooked beef"));
runTicks(200);
check(log.items.slice(drop0).some(([id]) => id === "minecraft:cooked_beef") && Inv.count(me, "minecraft:cooked_beef") < 10,
  "you ask a friend for some steak: it tosses you some");
me.friends.Steve = 0;
me.persona.friendly = 0;
n0 = log.messages.length;
await tap(button("Ask it for something"), button("diamond"));
// (a longer line takes longer to type)
runTicks(120);
check(Inv.count(me, "minecraft:diamond") === 2 && said(me, n0).length === 1, `a stranger asking for its diamonds gets "${said(me, n0)[0] ?? ""}"`);
me.persona.friendly = 0.8;
await tap(button("Befriend"));
runTicks(60);
check(me.friends.Steve > 0, `Befriend: it ${me.friends.Steve >= 3 ? "says yes" : "thinks about it"}`);
await tap(button("Its inventory"));
const invForm = ui.shown[ui.shown.length - 1].form;
check(/Hotbar/.test(invForm.bodyText) && /diamond x2/.test(invForm.bodyText), "you can see its inventory");

console.log("its chat");
me.friends.Steve = 5;
n0 = log.messages.length;
Chat.hear(me, steve, "what are you doing?");
runTicks(150);
check(said(me, n0).some((m) => m.includes("I'm")), `asked what it's doing: "${said(me, n0).find((m) => m.includes("I'm")) ?? said(me, n0)[0] ?? ""}"`);
n0 = log.messages.length;
Chat.hear(me, steve, "give me some diamonds");
runTicks(200);
check(Inv.count(me, "minecraft:diamond") === 1, "a friend asks for diamonds: it gives one of its two");
n0 = log.messages.length;
Chat.hear(me, steve, "where are you");
runTicks(150);
check(said(me, n0).some((m) => /I'm at -?\d+ -?\d+ -?\d+ in the overworld/.test(m)), "tells you where it is");

console.log("the Player API");
let opened = false;
answers = [(form) => {
  opened = /Players in this world: 1 of 4/.test(form.bodyText);
  return { canceled: false, selection: 1 };
}, () => ({ canceled: false, formValues: [6, true, true, 2, 1, "sk-ant-test-1234", "", "", false] })];
world.afterEvents.itemUse.fire({ source: steve, itemStack: new ItemStack("zt:player_api", 1) });
for (let i = 0; i < 6; i++) await Promise.resolve();
check(opened, "it shows how many Players there are");
check(Bot.settings().max === 6 && Bot.settings().chat === 2, "sets the most Players and how chatty they are");
const ai = Chat.aiConfig();
check(ai?.on && ai.provider === "anthropic" && ai.key === "sk-ant-test-1234", "saves the AI and its key");
// the bridge: it gets the request and answers
const requests = [];
system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id === "zt:ai_request") requests.push(JSON.parse(ev.message));
  if (ev.id === "zt:ai_ping") system.sendScriptEvent("zt:ai_pong", "");
});
runTicks(50);
check(Chat.bridge.seen > 0, "it finds the AI bridge (it answered a ping)");
n0 = log.messages.length;
Chat.hear(me, steve, "hey, come with me to the village");
runTicks(3);
check(requests.length === 1 && requests[0].cfg.key === "sk-ant-test-1234" && requests[0].msgs.at(-1).content.includes("come with me"),
  "talking to it sends the AI what you said");
check(requests[0].sys.includes(me.name) && requests[0].sys.includes("Health"), "with who it is and what it's doing");
system.sendScriptEvent("zt:ai_reply", JSON.stringify({ id: requests[0].id, text: "sure, lead the way <follow>" }));
runTicks(80);
check(said(me, n0).includes(`<${me.name}> sure, lead the way`), "says what the AI answered");
check(me.follow === "Steve", "and does what it said (follows you)");
me.follow = null;
// no answer: it answers by itself, and you're told why
n0 = log.messages.length;
Chat.hear(me, steve, "hello?");
runTicks(400);
check(said(me, n0).length === 1, "no answer from the AI: it answers by itself");

console.log("");
const bad = warnings.filter((w) => !/no answer/i.test(w));
check(bad.length === 0, "no script errors" + (bad.length ? ": " + bad.slice(0, 3).join(" | ") : ""));
console.log(failures === 0 ? "ALL GOOD" : `${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
