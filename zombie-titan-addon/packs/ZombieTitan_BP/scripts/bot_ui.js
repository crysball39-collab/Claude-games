// The Players' menus. Tap a Player to talk to it, befriend it, ask it to follow you or wait,
// give it what you're holding, ask it for something, see its inventory and how it's doing, or
// ask it to do something (go home, build, sleep, trade...). The Player API item lists the
// Players in the world and sets things for all of them: how many there can be, whether they
// build, how chatty they are, and the AI that talks for them (where you type its key).
import { system, world } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import * as Bot from "./bot.js";
import * as B from "./bot_body.js";
import * as Chat from "./bot_chat.js";
import * as D from "./bot_data.js";
import * as Inv from "./bot_inv.js";
import * as St from "./bot_stations.js";
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Entity} Entity */

const nice = (id) => D.bare(String(id)).replace(/_/g, " ");
const DIMS = { "minecraft:overworld": "Overworld", "minecraft:nether": "Nether", "minecraft:the_end": "End" };

/** How it's doing, the way the game's HUD would show it. @param {any} bot */
function status(bot) {
  const hp = Math.ceil(B.health(bot));
  const lines = [
    `§cHealth ${hp}/20§r   §6Hunger ${bot.hunger}/20§r   §7Armour ${Inv.armorPoints(bot)}§r   §aLevel ${bot.level}§r`,
    `§7Doing:§r ${bot.doing ?? "hanging around"}`,
    `§7Holding:§r ${Inv.held(bot) ? nice(Inv.held(bot).typeId) : "nothing"}`,
    `§7Progress:§r ${bot.progress.dragon ? "beat the Ender Dragon" : "on " + (bot.progress.stage ?? "wood") + " (" + bot.progress.done.length + " steps done)"}`,
    `§7Where:§r ${DIMS[bot.entity.dimension.id] ?? bot.entity.dimension.id}, ${B.feet(bot).x} ${B.feet(bot).y} ${B.feet(bot).z}`,
    `§7Kills ${bot.stats.kills}, deaths ${bot.stats.deaths}, blocks mined ${bot.stats.mined}`,
  ];
  return lines.join("\n");
}

/**
 * Its menu, for the player who tapped it.
 * @param {Player} player @param {Entity} e
 */
export function openMenu(player, e) {
  const bot = Bot.botOf(e);
  if (!bot || bot.dead) return;
  const name = player.name;
  const friend = (bot.friends[name] ?? 0) >= 3;
  const following = bot.follow === name;
  // it turns to face whoever's talking to it
  B.lookAtEntity(bot, player, 80, 3);
  /** @type {Array<[string, () => void]>} */
  const actions = [];
  const form = new ActionFormData().title(bot.name).body(status(bot) + (friend ? "\n§aYou're friends.§r" : ""));
  const add = (label, fn) => {
    form.button(label);
    actions.push([label, fn]);
  };
  add("Talk", () => talk(player, bot));
  if (!friend) add("Befriend", () => befriend(player, bot));
  const order = (words) => {
    say(player, words);
    Chat.command(bot, player, words);
  };
  add(following ? "Stop following me" : "Follow me", () => order(following ? "stop following me" : "follow me"));
  add(bot.stay ? "You can go" : "Wait here", () => order(bot.stay ? "you can go" : "wait here"));
  add("Give it what you're holding", () => give(player, bot));
  add("Ask it for something", () => ask(player, bot));
  add("Its inventory", () => inventory(player, bot));
  add("Ask it to...", () => tasks(player, bot));
  form.show(player).then((r) => {
    if (r.canceled || r.selection === undefined) return;
    try {
      actions[r.selection]?.[1]();
    } catch (err) {
      console.warn("[Titans] Player menu: " + err);
    }
  }).catch(() => {});
}

/** What the player said goes in the chat too, as players' chat does. @param {Player} player @param {string} text */
function say(player, text) {
  world.sendMessage(`<${player.name}> ${text}`);
}

/** @param {Player} player @param {any} bot */
function talk(player, bot) {
  new ModalFormData().title("Talk to " + bot.name).textField("Say something", "hi!").submitButton("Say").show(player).then((r) => {
    if (r.canceled || !r.formValues) return;
    const text = String(r.formValues[0] ?? "").trim().slice(0, 200);
    if (!text) return;
    say(player, text);
    if (!bot.dead) Chat.hear(bot, player, text);
  }).catch(() => {});
}

/** Ask to be friends: a friendly Player says yes; one you've been hitting won't. @param {Player} player @param {any} bot */
function befriend(player, bot) {
  say(player, "want to be friends?");
  const hits = bot.hitsFrom?.[player.name]?.n ?? 0;
  const chance = 0.35 + bot.persona.friendly * 0.5 + (bot.friends[player.name] ?? 0) * 0.15 - hits * 0.2;
  system.runTimeout(() => {
    if (bot.dead) return;
    if (Math.random() < chance) {
      bot.friends[player.name] = Math.max(3, bot.friends[player.name] ?? 0);
      bot.angry.delete(player.id);
      Chat.say(bot, { cheerful: "yes!! friends :D", chill: "sure, friends", grumpy: "...fine. friends", nerdy: "friendship accepted",
        competitive: "ok, but I'm still beating you to the End" }[bot.style] ?? "sure!", { reply: true });
    } else {
      bot.friends[player.name] = (bot.friends[player.name] ?? 0) + 0.7;
      Chat.say(bot, ["hmm, maybe later", "I don't know you yet", "ask me again sometime"][Math.floor(Math.random() * 3)], { reply: true });
    }
  }, 20);
}

/** Hand it what you're holding. @param {Player} player @param {any} bot */
function give(player, bot) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  const slot = player.selectedSlotIndex;
  const it = inv?.getItem(slot);
  if (!it) {
    player.sendMessage("§7You're not holding anything.");
    return;
  }
  if (Inv.freeSlots(bot) === 0 && !Inv.stacks(bot).some((s) => s.item.isStackableWith(it) && s.item.amount + it.amount <= s.item.maxAmount)) {
    Chat.say(bot, "my inventory's full, sorry", { reply: true });
    return;
  }
  inv.setItem(slot, undefined);
  Inv.add(bot, it);
  B.swing(bot);
  bot.friends[player.name] = Math.min(10, (bot.friends[player.name] ?? 0) + (/diamond|netherite|enchanted|golden_apple|elytra/.test(it.typeId) ? 2 : 1));
  say(player, "here, have " + (it.amount > 1 ? it.amount + " " : "a ") + nice(it.typeId));
  Chat.say(bot, { cheerful: "thank you!! :D", chill: "thanks", grumpy: "oh. thanks", nerdy: "thank you, that's useful", competitive: "nice, thanks" }[bot.style] ?? "thanks!", { reply: true });
  Inv.equipArmor(bot);
}

/** Ask it for one of its things. @param {Player} player @param {any} bot */
function ask(player, bot) {
  const tally = new Map();
  for (const { item } of Inv.stacks(bot)) tally.set(item.typeId, (tally.get(item.typeId) ?? 0) + item.amount);
  const ids = [...tally.keys()].slice(0, 24);
  if (!ids.length) {
    Chat.say(bot, "I don't have anything", { reply: true });
    return;
  }
  const form = new ActionFormData().title("Ask " + bot.name + " for...");
  for (const id of ids) form.button(`${nice(id)} x${tally.get(id)}`);
  form.show(player).then((r) => {
    if (r.canceled || r.selection === undefined) return;
    const id = ids[r.selection];
    say(player, "can I have some " + nice(id) + "?");
    if (bot.dead) return;
    const liking = (bot.friends[player.name] ?? 0) + bot.persona.friendly * 2;
    const junk = Inv.JUNK.some(([j]) => j === id);
    const precious = /_(sword|pickaxe|helmet|chestplate|leggings|boots)$|ender_eye|ender_pearl|blaze_rod|elytra|bow$|shield/.test(id);
    if (!junk && (liking < 2 || (precious && liking < 5))) {
      Chat.say(bot, ["nah, I need that", "get your own :P", "maybe if we were better friends"][Math.floor(Math.random() * 3)], { reply: true });
      return;
    }
    const n = Math.max(1, Math.min(junk ? tally.get(id) : Math.ceil(tally.get(id) / 2), 64));
    bot.requests.push({ kind: "give", player, item: id, n });
    Chat.say(bot, ["sure", "here you go", "ok, catch"][Math.floor(Math.random() * 3)], { reply: true });
  }).catch(() => {});
}

/** Everything it carries. @param {Player} player @param {any} bot */
function inventory(player, bot) {
  const c = Inv.container(bot);
  const fmt = (it) => (it ? `${nice(it.typeId)}${it.amount > 1 ? " x" + it.amount : ""}${it.nameTag ? ' "' + it.nameTag + '"' : ""}` : "-");
  const hot = [];
  const rest = [];
  if (c) {
    for (let i = 0; i < c.size; i++) {
      const it = c.getItem(i);
      if (i < 9) hot.push(`${i + 1}: ${fmt(it)}`);
      else if (it) rest.push(fmt(it));
    }
  }
  const worn = ["Head", "Chest", "Legs", "Feet"].map((s) => fmt(Inv.getEquip(bot, s))).join(", ");
  const pots = Object.entries(St.potions(bot)).map(([k, n]) => `${nice(k)} x${n}`).join(", ") || "none";
  const body = [`§eHands:§r ${fmt(Inv.held(bot))} | ${fmt(Inv.getEquip(bot, "Offhand"))}`, `§eArmour:§r ${worn}`, `§eHotbar:§r`, ...hot,
    `§eInventory (${c ? c.size - 9 : 27} slots):§r ${rest.join(", ") || "empty"}`, `§ePotions:§r ${pots}`, `§eLevel:§r ${bot.level}`].join("\n");
  new ActionFormData().title(bot.name + "'s inventory").body(body).button("OK").show(player).catch(() => {});
}

/** Ask it to do something. @param {Player} player @param {any} bot */
function tasks(player, bot) {
  /** @type {Array<[string, string, string]>} label, what you say, request */
  const list = [["Come here", "come here", "come"], ["Go home", "go home", "home"], ["Build a house", "build a house", "build"],
    ["Sleep tonight", "go to bed", "sleep"], ["Trade with villagers", "go trade with the villagers", "trade"], ["Enchant its gear", "enchant your stuff", "enchant"],
    ["Fix its gear", "repair your stuff", "repair"], ["Drop its junk", "drop your junk", "drop"]];
  const form = new ActionFormData().title("Ask " + bot.name + " to...");
  for (const [label] of list) form.button(label);
  form.show(player).then((r) => {
    if (r.canceled || r.selection === undefined || bot.dead) return;
    const [, words] = list[r.selection];
    say(player, words);
    Chat.command(bot, player, words);
  }).catch(() => {});
}

// ---------------------------------------------------------------- the Player API item
const PROVIDERS = [["off", "Off (Players answer by themselves)"], ["anthropic", "Claude (Anthropic)"], ["openai", "OpenAI"],
  ["gemini", "Gemini (Google)"], ["custom", "Other (OpenAI-compatible URL)"]];

/** The Player API: the Players in the world, and the settings. @param {Player} player */
export function openApi(player) {
  const live = Bot.live();
  const form = new ActionFormData().title("Player API").body(`Players in this world: ${live.length} of ${Bot.settings().max}.\n` +
    `AI: ${aiLine()}`);
  form.button("Players");
  form.button("Settings and AI key");
  form.show(player).then((r) => {
    if (r.canceled) return;
    if (r.selection === 0) list(player);
    else if (r.selection === 1) settingsForm(player);
  }).catch(() => {});
}
function aiLine() {
  const ai = Chat.aiConfig();
  if (!ai || !ai.on || !ai.key) return "off";
  const p = PROVIDERS.find(([k]) => k === ai.provider)?.[1] ?? ai.provider;
  const seen = Chat.bridge.seen >= 0 && system.currentTick - Chat.bridge.seen < 72000;
  return `${p}, key ending ${ai.key.slice(-4)}${seen ? " §a(bridge connected)§r" : " §7(no bridge found yet)§r"}`;
}
/** @param {Player} player */
function list(player) {
  const live = Bot.live();
  if (!live.length) {
    player.sendMessage("§7There are no Players yet. Use a Player Spawn Egg.");
    return;
  }
  const form = new ActionFormData().title("Players");
  for (const bot of live) {
    form.button(`${bot.name}\n§8${DIMS[bot.entity.dimension.id] ?? ""} - ${bot.doing ?? ""}`.slice(0, 80));
  }
  form.show(player).then((r) => {
    if (r.canceled || r.selection === undefined) return;
    const bot = live[r.selection];
    if (bot && !bot.dead) openMenu(player, bot.entity);
  }).catch(() => {});
}
/** @param {Player} player */
function settingsForm(player) {
  const s = Bot.settings();
  const ai = Chat.aiConfig() ?? { on: false, provider: "anthropic", key: "" };
  const pIndex = ai.on ? Math.max(0, PROVIDERS.findIndex(([k]) => k === ai.provider)) : 0;
  const form = new ModalFormData().title("Player API settings")
    .slider("Most Players at once", 1, 10, { valueStep: 1, defaultValue: s.max })
    .toggle("Players break and place blocks", { defaultValue: s.build })
    .toggle("Players keep the world around them going when they wander off (ticking areas)", { defaultValue: s.roam })
    .dropdown("How much they chat", ["Only when spoken to", "Sometimes", "A lot"], { defaultValueIndex: s.chat })
    .dropdown("AI that talks for them", PROVIDERS.map(([, label]) => label), { defaultValueIndex: pIndex })
    .textField(ai.key ? `API key (one is saved, ending ${ai.key.slice(-4)}: leave empty to keep it)` : "API key", "paste your key here")
    .textField("Model (optional)", "the provider's default", { defaultValue: ai.model ?? "" })
    .textField("Server URL (for Other only)", "https://.../v1/chat/completions", { defaultValue: ai.url ?? "" })
    .toggle("Forget the saved key", { defaultValue: false })
    .submitButton("Save");
  form.show(player).then((r) => {
    if (r.canceled || !r.formValues) return;
    const v = r.formValues;
    Bot.saveSettings({ max: Number(v[0]), build: !!v[1], roam: !!v[2], chat: Number(v[3]) });
    const provider = PROVIDERS[Number(v[4])]?.[0] ?? "off";
    const typed = String(v[5] ?? "").trim();
    const key = v[8] ? "" : typed || ai.key || "";
    if (provider === "off" || !key) {
      Chat.setAiConfig(key ? { ...ai, on: false, key } : undefined);
      player.sendMessage(provider === "off" ? "§aSaved. Players answer by themselves." : "§eSaved, but there's no key: Players answer by themselves.");
      return;
    }
    Chat.setAiConfig({ on: true, provider, key, model: String(v[6] ?? "").trim() || undefined, url: String(v[7] ?? "").trim() || undefined });
    player.sendMessage("§aSaved. The key stays in this world's save; anyone with the world file can read it.");
    // is the bridge there?
    const before = Chat.bridge.seen;
    try {
      system.sendScriptEvent("zt:ai_ping", "");
    } catch {
      /* ignore */
    }
    system.runTimeout(() => {
      if (Chat.bridge.seen > before) player.sendMessage("§a[Player AI] The AI bridge is running: Players will answer with the AI.");
      else player.sendMessage("§e[Player AI] The AI bridge isn't running here. AI answers need a dedicated server (BDS) with the Player AI Bridge pack; until then Players answer by themselves.");
    }, 40);
  }).catch(() => {});
}
