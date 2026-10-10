// What Players say. Their lines go into the game's chat as "<Name> text", typed out at a
// person's pace, in each Player's own style (cheerful, chill, grumpy, nerdy, competitive): about
// what happens to them (a creeper, diamonds, dying, the dragon), hellos and goodbyes, and answers
// when someone talks to them (from its menu: tap a Player, then Talk). They understand simple
// requests ("follow me", "wait here", "come here", "give me some bread", "go home"...).
//
// With an AI's key typed into the Player API, a Player's answers come from that AI instead:
// the request goes to the Player AI Bridge pack (it can reach the internet only on a dedicated
// server), and the answer comes back as a script event. The AI may add an action in angle
// brackets (<follow>, <stay>...) that the Player then does. Without the bridge, Players answer
// by themselves.
import { system, world } from "@minecraft/server";
import * as B from "./bot_body.js";
import * as D from "./bot_data.js";
import * as Inv from "./bot_inv.js";
/** @typedef {import("@minecraft/server").Player} Player */

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const nice = (id) => D.bare(String(id)).replace(/_/g, " ");

// ---------------------------------------------------------------- lines, by style
/** @type {Record<string, Record<string, string[]>>} event -> style ("*" for any) -> lines; {n} is a name, {x} a thing */
const LINES = {
  greet: {
    cheerful: ["hi {n}!", "hey {n} :D", "{n}! hiii", "hello {n}!"], chill: ["yo {n}", "hey", "sup {n}"],
    grumpy: ["oh. hi {n}", "{n}.", "hey I guess"], nerdy: ["greetings {n}", "hello {n}! did you know creepers were a failed pig model", "hi {n}"],
    competitive: ["{n}! race you to diamonds", "hey {n}, bet I get to the End first", "yo {n}"],
  },
  creeper: { "*": ["creeper!!", "CREEPER", "aw man", "nope nope creeper"], grumpy: ["of course there's a creeper"], nerdy: ["creeper, 3 block blast radius, backing off"] },
  died: {
    cheerful: ["oops :(", "noooo my stuff", "rip me", "welp"], chill: ["rip", "oh well", "that happens"],
    grumpy: ["this game hates me", "seriously?!", "ugh"], nerdy: ["that was statistically unlikely", "noted for next time"],
    competitive: ["lag!!", "that didn't count", "unfair"],
  },
  killed_by_player: { "*": ["{n} why", "{n} that wasn't nice", "really {n}?"], grumpy: ["{n} you'll pay for that"], competitive: ["gg {n}. rematch"] },
  hurt_by_player: { "*": ["hey!", "ow", "{n} stop", "why did you hit me?", "{n}??"], grumpy: ["watch it {n}", "do that again and see"], cheerful: ["ouch! {n}!"] },
  angry: { "*": ["ok that's it {n}", "you asked for it", "fine, let's fight"] },
  respawned: { "*": ["back", "ok I'm back", "respawned"], grumpy: ["back. annoyed but back"] },
  tool_broke: { "*": ["my {x} broke", "rip my {x}", "aw, my {x} broke"], nerdy: ["{x} durability depleted"] },
  diamonds: { "*": ["DIAMONDS!", "diamonds!!", "found diamonds :D"], chill: ["oh nice, diamonds"], competitive: ["DIAMONDS. told you"] },
  iron: { "*": ["got some iron", "iron!", "nice, iron"] },
  crafted: { "*": ["made a {x}", "crafted a {x}", "new {x} :)"], competitive: ["{x}. upgrade"] },
  built_home: { "*": ["finished my house :)", "house done!", "home sweet home"], grumpy: ["house is built. don't touch it"] },
  built_portal: { "*": ["portal's ready", "nether portal done", "nether time"] },
  entered_nether: { "*": ["it's so hot here", "made it to the nether", "ok nether, be nice"], grumpy: ["I hate the nether"] },
  found_fortress: { "*": ["found a fortress!", "nether fortress over here", "fortress!"] },
  blaze: { "*": ["got blaze rods", "blaze rods :)"] },
  found_stronghold: { "*": ["I think there's a stronghold down here", "stronghold!!"] },
  found_portal_room: { "*": ["found the portal room!", "END PORTAL"] },
  end_portal: { "*": ["portal is open...", "here goes"] },
  entered_end: { "*": ["I'm in the end", "the end... dragon time", "ok where's the dragon"] },
  dragon_dead: { "*": ["GG!! the dragon is dead", "WE BEAT THE DRAGON", "gg dragon"], chill: ["gg. dragon's done"], competitive: ["dragon down. ez"] },
  elytra: { "*": ["GOT AN ELYTRA", "elytra!!", "I found wings :D"] },
  home_from_end: { "*": ["back home", "made it back", "home!"] },
  traded: { "*": ["good trade", "thanks villager", "nice deal"], grumpy: ["villagers are such ripoffs"] },
  enchanted: { "*": ["ooh, {x}", "enchanted my gear", "got {x}"] },
  brewed: { "*": ["made some potions", "potions done"] },
  lost_friend: { "*": ["{n} where did you go?", "{n}?? hello?", "lost {n}"] },
  joined: { "*": ["hi everyone", "hello!", "hey all"], grumpy: ["..."], chill: ["sup"] },
  night: { "*": ["it's getting dark", "night time, careful", "mobs are coming out"], grumpy: ["night again"] },
  morning: { "*": ["morning!", "it's day again", "good morning"] },
  idle: {
    cheerful: ["this is fun", "I love this world", "anyone want to build something?"], chill: ["nice day", "vibing", "hm"],
    grumpy: ["why is everything so far", "need more iron", "ugh mobs"], nerdy: ["fun fact: you can't sleep in the nether", "a day here is 20 minutes", "bedrock edition has no attack cooldown"],
    competitive: ["who's got the most diamonds?", "speedrun time", "I'm winning"],
  },
};
/** @param {any} bot @param {string} key @param {Record<string, string>} [vars] */
export function line(bot, key, vars = {}) {
  const set = LINES[key];
  if (!set) return "";
  const list = set[bot.style] ?? set["*"] ?? Object.values(set)[0];
  return pick(list).replace(/\{(\w)\}/g, (_, k) => vars[k] ?? "");
}

// ---------------------------------------------------------------- speaking
/** How talkative Players are: 0 only answers, 1 sometimes, 2 often. @param {any} bot */
function talky(bot) {
  return bot.world?.chat ?? 1;
}
/**
 * Say something (after the time it takes to type it). reply: an answer (said even when quiet).
 * @param {any} bot @param {string} text @param {{reply?: boolean, delay?: number}} [o]
 */
export function say(bot, text, o = {}) {
  if (!text) return;
  if (!o.reply && talky(bot) === 0) return;
  const now = system.currentTick;
  const last = bot.chatQueue.length ? bot.chatQueue[bot.chatQueue.length - 1].at : now;
  const typing = o.delay ?? Math.min(100, 12 + text.length * 2);
  bot.chatQueue.push({ text: text.slice(0, 200), at: Math.max(now, last) + typing });
  if (bot.chatQueue.length > 6) bot.chatQueue.shift();
}
/** Maybe say a line about something (less often for quieter Players). @param {any} bot @param {string} key @param {any} [vars] @param {number} [chance] */
function maybe(bot, key, vars, chance = 0.6) {
  const k = talky(bot);
  const p = chance * (k === 2 ? 1.3 : k === 1 ? 0.8 : 0) * (0.5 + bot.persona.chatty);
  if (Math.random() < p) say(bot, line(bot, key, vars));
}
/** @param {any} bot @param {string} text */
function send(bot, text) {
  try {
    world.sendMessage(`<${bot.name}> ${text}`);
  } catch {
    return;
  }
  bot.lastChat = system.currentTick;
  remember(bot, bot.name, text);
}
/** Keep the last few lines of conversation (for the AI, and to answer sensibly). @param {any} bot @param {string} who @param {string} text */
function remember(bot, who, text) {
  bot.history ??= [];
  bot.history.push({ who, text: text.slice(0, 200) });
  if (bot.history.length > 12) bot.history.shift();
}

// ---------------------------------------------------------------- what happens to it
/** @param {any} bot @param {any} ev @param {number} now */
function onEvent(bot, ev, now) {
  switch (ev.kind) {
    case "saw":
      if (ev.typeId === "minecraft:creeper" && now - (bot.saidCreeper ?? 0) > 1200) {
        let d = 99;
        try {
          d = B.dist(ev.entity.location, bot.entity.location);
        } catch {
          d = 99;
        }
        if (d < 10) {
          bot.saidCreeper = now;
          maybe(bot, "creeper", {}, 0.5);
        }
      }
      break;
    case "greet":
      if (ev.player || Math.random() < 0.4) maybe(bot, "greet", { n: ev.name }, 0.9);
      break;
    case "tool_broke":
      maybe(bot, "tool_broke", { x: nice(ev.id) }, 0.7);
      break;
    case "crafted":
      if (/diamond_|netherite_|iron_pickaxe|enchanting_table|shield|bed$/.test(ev.id)) maybe(bot, "crafted", { x: nice(ev.id) }, 0.6);
      break;
    case "respawned":
      maybe(bot, "respawned", {}, 0.7);
      break;
    case "joined":
      maybe(bot, "joined", {}, 0.6);
      break;
    case "enchanted":
      maybe(bot, "enchanted", { x: (ev.list ?? []).map(([n, l]) => nice(n) + " " + l).join(", ") }, 0.7);
      break;
    case "dragon_dead":
      say(bot, line(bot, "dragon_dead"));
      break;
    default:
      if (LINES[ev.kind]) maybe(bot, ev.kind, ev, ev.kind === "elytra" || ev.kind === "found_portal_room" ? 1 : 0.6);
  }
}
/** It died: a line about it a moment after. @param {any} bot @param {string | undefined} cause @param {string | undefined} by */
export function onDied(bot, cause, by) {
  if (by && world.getAllPlayers().some((p) => p.name === by)) maybe(bot, "killed_by_player", { n: by }, 0.9);
  else maybe(bot, "died", {}, 0.8);
}
/** A real player hit it. @param {any} bot @param {Player} p */
export function onHurtBy(bot, p) {
  const now = system.currentTick;
  bot.hitsFrom ??= {};
  const h = (bot.hitsFrom[p.name] = { n: (bot.hitsFrom[p.name]?.at ?? 0) > now - 600 ? (bot.hitsFrom[p.name].n + 1) : 1, at: now });
  // a friend's knock is forgiven, once or twice
  bot.friends[p.name] = (bot.friends[p.name] ?? 0) - 0.5;
  if (h.n === 1) say(bot, line(bot, "hurt_by_player", { n: p.name }), { reply: true, delay: 10 });
  if (h.n >= 3 && !bot.angry.has(p.id)) {
    if (bot.persona.brave > 0.45) {
      bot.angry.add(p.id);
      say(bot, line(bot, "angry", { n: p.name }), { reply: true });
    }
  }
}

// ---------------------------------------------------------------- talking to it
/** Words for the things people ask for. */
const ITEM_WORDS = { bread: "bread", food: "food", iron: "iron_ingot", diamond: "diamond", diamonds: "diamond", wood: "log", logs: "log",
  planks: "planks", stone: "cobblestone", cobble: "cobblestone", cobblestone: "cobblestone", coal: "coal", torch: "torch", torches: "torch",
  pearl: "ender_pearl", pearls: "ender_pearl", eye: "ender_eye", eyes: "ender_eye", arrows: "arrow", arrow: "arrow", gold: "gold_ingot",
  emerald: "emerald", emeralds: "emerald", steak: "cooked_beef", apple: "apple", apples: "apple", string: "string", sticks: "stick", stick: "stick" };

/**
 * Someone said something to it. It answers (by itself, or through the AI) and maybe does
 * what was asked.
 * @param {any} bot @param {Player} p @param {string} text
 */
export function hear(bot, p, text) {
  remember(bot, p.name, text);
  bot.friends[p.name] = Math.min(10, (bot.friends[p.name] ?? 0) + 0.2);
  bot.lastSpoke = { name: p.name, at: system.currentTick };
  B.lookAtEntity(bot, p, 60, 2);
  const ai = aiConfig();
  if (ai && ai.on && ai.key) {
    askAi(bot, p, text, ai);
    return;
  }
  const r = reply(bot, p, text);
  if (r) say(bot, r, { reply: true });
}

/**
 * Something asked from its menu: it answers by itself (so it surely does it), not the AI.
 * @param {any} bot @param {Player} p @param {string} text
 */
export function command(bot, p, text) {
  remember(bot, p.name, text);
  B.lookAtEntity(bot, p, 60, 2);
  const r = reply(bot, p, text);
  if (r) say(bot, r, { reply: true });
}

/** Do a request. @param {any} bot @param {Player} p @param {string} kind @param {any} [extra] */
function request(bot, p, kind, extra = {}) {
  bot.requests ??= [];
  bot.requests.push({ kind, player: p, ...extra });
}
/** How much it likes someone (friend level). @param {any} bot @param {string} name */
const liking = (bot, name) => (bot.friends[name] ?? 0) + bot.persona.friendly * 2;

/** Its own answer (and whatever it does about it). @param {any} bot @param {Player} p @param {string} raw */
export function reply(bot, p, raw) {
  const t = raw.toLowerCase().trim();
  const n = p.name;
  const likes = liking(bot, n);
  const style = bot.style;
  const has = (re) => re.test(t);
  if (has(/^(hi|hello|hey|yo|sup|hiya|howdy)\b/)) return line(bot, "greet", { n });
  if (has(/\b(bye|cya|see ya|goodbye|gtg)\b/)) return pick(["bye " + n + "!", "cya", "see you!", "bye"]);
  if (has(/\b(thanks|thank you|thx|ty)\b/)) return pick(["np", "no problem!", "anytime", "you're welcome"]);
  if (has(/\b(stop|nevermind|never mind|cancel)\b/) && !has(/stop following/)) {
    bot.follow = null;
    bot.stay = null;
    return pick(["ok", "alright", "stopping"]);
  }
  if (has(/\b(follow me|come with me|follow)\b/) && !has(/stop following|don't follow|dont follow/)) {
    if (likes < 0.5) return pick(["nah", "no thanks", "I'm busy"]);
    bot.follow = n;
    bot.stay = null;
    return pick(["ok, right behind you", "lead the way", "following!", "ok"]);
  }
  if (has(/stop following|don't follow|dont follow/)) {
    bot.follow = null;
    return pick(["ok", "fine", "I'll do my own thing then"]);
  }
  if (has(/\b(stay|wait here|wait|stay here|don't move|dont move)\b/)) {
    if (likes < 0.5) return pick(["no", "why", "I've got stuff to do"]);
    bot.stay = { dim: bot.entity.dimension.id, pos: { ...bot.entity.location } };
    bot.follow = null;
    return pick(["ok I'll wait here", "waiting", "sure"]);
  }
  if (has(/\b(you can go|go on|carry on|do your thing|free)\b/)) {
    bot.stay = null;
    bot.follow = null;
    return pick(["ok!", "back to work", "cool"]);
  }
  if (has(/\b(come here|come over|over here|come)\b/)) {
    if (likes < 0) return pick(["no", "why should I"]);
    request(bot, p, "come");
    return pick(["coming", "on my way", "ok"]);
  }
  if (has(/\b(go home|home)\b/)) {
    if (!bot.home) return "I don't have a house yet";
    request(bot, p, "home");
    return pick(["heading home", "ok, going home"]);
  }
  if (has(/\b(build|make).*(house|home|base)\b/)) {
    if (bot.home) return "I already have a house";
    request(bot, p, "build");
    return pick(["ok, building a house", "good idea, a house"]);
  }
  if (has(/\b(sleep|go to bed|bed time|bedtime)\b/)) {
    request(bot, p, "sleep");
    return pick(["ok, sleeping when it's dark", "sure", "night night"]);
  }
  if (has(/\b(drop|throw away|get rid of|clean).*(junk|stuff|inventory)?/) && has(/junk|stuff|inventory|drop/)) {
    request(bot, p, "drop");
    return pick(["ok, dropping my junk", "yeah my inventory is a mess"]);
  }
  if (has(/\btrade\b/)) {
    request(bot, p, "trade");
    return pick(["I'll see what the villagers have", "ok, trading"]);
  }
  if (has(/\benchant\b/)) {
    request(bot, p, "enchant");
    return "I'll try";
  }
  if (has(/\b(repair|fix)\b/)) {
    request(bot, p, "repair");
    return "I'll fix my stuff";
  }
  const give = /\b(give|gimme|can i have|can I get|share)\b(?:\s+me)?(?:\s+(\d+|some|a|an|your|the|all))?\s*([a-z_ ]+)?/.exec(t);
  if (give) {
    const word = (give[3] ?? "").trim().split(/\s+/).find((w) => ITEM_WORDS[w]);
    if (!word) return pick(["give you what?", "what do you want?"]);
    const want = ITEM_WORDS[word];
    const id = D.GROUPS[want] || want === "food" ? want : D.mc(want);
    const have = Inv.count(bot, id);
    if (!have) return pick(["I don't have any " + word, "none, sorry", "I have no " + word]);
    if (likes < 2) return pick(["get your own " + word, "nah, I need it", "maybe if we were friends"]);
    const k = Math.max(1, Math.min(Number(give[2]) || (have > 8 ? 4 : 1), Math.floor(have / 2) || 1));
    const ids = Inv.idsOf(bot, id);
    request(bot, p, "give", { item: ids[0], n: k });
    return pick(["here you go", "sure, here", "catch"]);
  }
  if (has(/\b(what are you doing|wyd|what r u doing|whatcha doing|what's up|whats up)\b/)) return "I'm " + (bot.doing ?? "just hanging around");
  if (has(/\b(where are you|where r u|coords|location)\b/)) {
    const l = B.feet(bot);
    const dim = { "minecraft:overworld": "overworld", "minecraft:nether": "nether", "minecraft:the_end": "end" }[bot.entity.dimension.id];
    return `I'm at ${l.x} ${l.y} ${l.z} in the ${dim}`;
  }
  if (has(/\b(inventory|what do you have|what you got|whatcha got)\b/)) return "I've got " + Inv.summary(bot, 8);
  if (has(/\b(how are you|how r u|you ok|are you ok|hru)\b/)) {
    const hp = B.health(bot);
    if (hp < 8) return pick(["not great, low health", "hurting tbh"]);
    if (bot.hunger < 8) return pick(["hungry", "starving actually"]);
    return { cheerful: "great!! you?", chill: "pretty good", grumpy: "fine I guess", nerdy: "operating normally :)", competitive: "winning, as usual" }[style] ?? "good";
  }
  if (has(/\b(are you a bot|are you real|are you human|you a bot|npc|ai)\b/)) return pick(["I'm a Player :)", "as real as you", "beep boop. jk"]);
  if (has(/\b(friend|friends|be my friend|team|teammates)\b/)) {
    if (likes >= 1 || bot.persona.friendly > 0.6) {
      bot.friends[n] = Math.max(bot.friends[n] ?? 0, 3);
      return pick(["yeah! friends", "sure, team up", "of course :)"]);
    }
    return pick(["maybe", "we'll see", "hmm, not yet"]);
  }
  if (has(/\b(nether|end|dragon)\b/)) {
    if (bot.progress.dragon) return pick(["already beat the dragon :)", "been there, done that"]);
    return "working on it. right now I'm " + (bot.doing ?? "getting ready");
  }
  if (has(/\b(noob|bad|trash|stupid|idiot|dumb|loser)\b/)) {
    bot.friends[n] = (bot.friends[n] ?? 0) - 1;
    return { grumpy: "says you", competitive: "1v1 me then", cheerful: "hey, that's mean :(", nerdy: "that's not very constructive", chill: "ok" }[style] ?? "rude";
  }
  if (has(/\b(gg|good job|nice|well done|cool|awesome|wow)\b/)) return pick(["thanks!", "ty :)", "gg", "hehe"]);
  if (has(/\?$/)) return pick(["hmm, not sure", "idk", "good question", "maybe?"]);
  return pick(["lol", "ok", "true", "haha", "yeah", "hm"]);
}

// ---------------------------------------------------------------- the AI
const AI_KEY = "zt:ai";
/** @returns {{on: boolean, provider: string, key: string, model?: string, url?: string} | undefined} */
export function aiConfig() {
  try {
    const raw = world.getDynamicProperty(AI_KEY);
    return raw ? JSON.parse(String(raw)) : undefined;
  } catch {
    return undefined;
  }
}
/** @param {any} cfg */
export function setAiConfig(cfg) {
  world.setDynamicProperty(AI_KEY, cfg ? JSON.stringify(cfg) : undefined);
}
/** Is the bridge there (it answered a ping)? */
export const bridge = { seen: -1, warned: false };
/** request id -> {bot, player, text, at} */
const pending = new Map();

/** What it tells the AI about itself and what's going on. @param {any} bot */
function context(bot) {
  const l = B.feet(bot);
  const dim = { "minecraft:overworld": "Overworld", "minecraft:nether": "Nether", "minecraft:the_end": "End" }[bot.entity.dimension.id];
  const friends = Object.entries(bot.friends).filter(([, v]) => v >= 3).map(([k]) => k).slice(0, 4).join(", ") || "none yet";
  return `You are ${bot.name}, a player in a Minecraft Bedrock world, chatting in the game's chat. ` +
    `Personality: ${bot.style}. Write like a real player: short, casual, lowercase is fine, no emojis, one or two short sentences, never more than 150 characters. ` +
    `Never say you are an AI or a bot. Right now you are ${bot.doing ?? "hanging around"} in the ${dim} at ${l.x} ${l.y} ${l.z}. ` +
    `Health ${Math.round(B.health(bot))}/20, hunger ${bot.hunger}/20, level ${bot.level}. Inventory: ${Inv.summary(bot, 10)}. ` +
    `Progress: ${bot.progress.dragon ? "you have beaten the Ender Dragon" : "working toward the End; current step " + (bot.progress.stage ?? "starting out")}. ` +
    `Friends: ${friends}. If the player asks you to do something you can do, end your reply with exactly one tag: ` +
    "<follow> <stop> <stay> <come> <home> <sleep> <build> <trade> <drop> or <give ITEM N> (ITEM a Minecraft item id like bread or iron_ingot).";
}
/** Send a message to the AI bridge. @param {any} bot @param {Player} p @param {string} text @param {any} cfg */
function askAi(bot, p, text, cfg) {
  const id = bot.uid.slice(0, 4) + (system.currentTick % 100000).toString(36);
  const sys = context(bot);
  const msgs = (bot.history ?? []).slice(-8).map((h) => ({ role: h.who === bot.name ? "assistant" : "user", content: h.who === bot.name ? h.text : `${h.who}: ${h.text}` }));
  // the last line must be theirs
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") msgs.push({ role: "user", content: `${p.name}: ${text}` });
  const cfgOut = { provider: cfg.provider, key: cfg.key, model: cfg.model, url: cfg.url };
  let body = JSON.stringify({ id, cfg: cfgOut, sys, msgs });
  while (body.length > 2000 && msgs.length > 1) {
    msgs.shift();
    body = JSON.stringify({ id, cfg: cfgOut, sys, msgs });
  }
  if (body.length > 2000) body = JSON.stringify({ id, cfg: cfgOut, sys: sys.slice(0, 600), msgs: msgs.slice(-1) });
  pending.set(id, { bot, player: p, text, at: system.currentTick });
  try {
    system.sendScriptEvent("zt:ai_request", body);
  } catch {
    pending.delete(id);
    const r = reply(bot, p, text);
    if (r) say(bot, r, { reply: true });
  }
}
/** An answer from the bridge. @param {string} message */
export function onAiReply(message) {
  let data;
  try {
    data = JSON.parse(message);
  } catch {
    return;
  }
  bridge.seen = system.currentTick;
  const req = pending.get(data.id);
  if (!req) return;
  pending.delete(data.id);
  const bot = req.bot;
  if (bot.dead || !bot.entity?.isValid) return;
  if (data.error) {
    const r = reply(bot, req.player, req.text);
    if (r) say(bot, r, { reply: true });
    if (!bridge.warned && req.player?.isValid) {
      bridge.warned = true;
      req.player.sendMessage("§7[Player AI] The AI didn't answer: " + String(data.error).slice(0, 120));
    }
    return;
  }
  let text = String(data.text ?? "").trim();
  // an action at the end: <follow>, <give bread 3>...
  const act = /<\s*(follow|stop|stay|come|home|sleep|build|trade|drop|give)\s*([a-z_:]+)?\s*(\d+)?\s*>\s*$/i.exec(text);
  if (act) {
    text = text.slice(0, act.index).trim();
    doAction(bot, req.player, act[1].toLowerCase(), act[2], Number(act[3]) || 1);
  }
  text = text.replace(/[<>]/g, "").replace(/\s+/g, " ").slice(0, 200);
  if (text) say(bot, text, { reply: true });
}
/** @param {any} bot @param {Player} p @param {string} act @param {string | undefined} item @param {number} n */
function doAction(bot, p, act, item, n) {
  switch (act) {
    case "follow":
      bot.follow = p.name;
      bot.stay = null;
      break;
    case "stop":
      bot.follow = null;
      bot.stay = null;
      break;
    case "stay":
      bot.stay = { dim: bot.entity.dimension.id, pos: { ...bot.entity.location } };
      bot.follow = null;
      break;
    case "give": {
      if (!item) break;
      const id = D.mc(item.replace(/^minecraft:/, ""));
      const ids = Inv.idsOf(bot, (x) => x === id);
      if (ids.length) request(bot, p, "give", { item: ids[0], n: Math.min(n, Inv.count(bot, id)) });
      break;
    }
    default:
      request(bot, p, act);
  }
}
/** Answers that never came: the Player answers by itself (and the player hears why, once). */
function aiTimeouts() {
  const now = system.currentTick;
  for (const [id, req] of pending) {
    if (now - req.at < 300) continue;
    pending.delete(id);
    const bot = req.bot;
    if (bot.dead) continue;
    const r = reply(bot, req.player, req.text);
    if (r) say(bot, r, { reply: true });
    if (!bridge.warned && req.player?.isValid) {
      bridge.warned = true;
      req.player.sendMessage("§7[Player AI] No answer from the AI bridge. Players can only use an AI on a dedicated server running the Player AI Bridge pack; they'll answer by themselves for now.");
    }
  }
}

// ---------------------------------------------------------------- the tick
/** @param {any} bot @param {number} now */
export function chatTick(bot, now) {
  if (bot.events.length) {
    for (const ev of bot.events) {
      try {
        onEvent(bot, ev, now);
      } catch {
        /* ignore */
      }
    }
    bot.events.length = 0;
  }
  // what it picked up worth a word
  for (const p of bot.picked.splice(0)) {
    bot.firsts ??= {};
    const kind = p.id === "minecraft:diamond" ? "diamonds" : p.id === "minecraft:raw_iron" ? "iron" : p.id === "minecraft:blaze_rod" ? "blaze" : undefined;
    if (kind && !bot.firsts[kind]) {
      bot.firsts[kind] = now;
      maybe(bot, kind, {}, 0.9);
    } else if (kind && now - bot.firsts[kind] > 24000) {
      bot.firsts[kind] = now;
      maybe(bot, kind, {}, 0.3);
    }
  }
  if (bot.chatQueue.length && bot.chatQueue[0].at <= now) send(bot, bot.chatQueue.shift().text);
  // the time of day, and idle chatter, now and then
  if ((now + bot.phase) % 1200 === 0) {
    const t = world.getTimeOfDay();
    if (bot.entity.dimension.id === "minecraft:overworld") {
      const night = t > 12500 && t < 23000;
      if (night !== bot.wasNight && bot.wasNight !== undefined) maybe(bot, night ? "night" : "morning", {}, 0.25);
      bot.wasNight = night;
    }
    if (now - (bot.lastChat ?? 0) > 6000) maybe(bot, "idle", {}, 0.12);
  }
}
/** Once a tick for all Players: AI answers that never came. */
export function aiTick() {
  if (pending.size) aiTimeouts();
}
