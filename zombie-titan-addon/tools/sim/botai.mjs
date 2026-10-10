// The Player AI Bridge pack with the Zombie Titan pack: what a player says to a Player goes to
// the AI set in the Player API item (Claude, OpenAI, Gemini, or another server that speaks
// OpenAI's chat completions), in the shape each service wants; the answer comes back as the
// Player's chat line (and it does what it said); errors and refusals leave the Player answering
// by itself.
//   node tools/sim/run.mjs botai
import { log, Player, runTicks, sim, system, world } from "@minecraft/server";
import { net } from "@minecraft/server-net";

const warnings = [];
console.warn = (...a) => {
  warnings.push(a.join(" "));
  if (process.env.ZT_TRACE) process.stderr.write("WARN " + a.join(" ") + "\n");
};

sim.terrain = (dim, x, y, z) => (dim === "minecraft:overworld" ? (y === 63 ? "minecraft:grass_block" : y >= 60 && y < 63 ? "minecraft:dirt" : undefined) : undefined);
world.timeOfDay = 1000;

await import("./scripts/main.js");
await import("./bridge/bridge.js");
const Bot = await import("./scripts/bot.js");
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
/** Ticks pass, and the web answers that came in are handled between them. */
async function settle(ticks) {
  for (let i = 0; i < ticks; i++) {
    runTicks(1);
    for (let k = 0; k < 10; k++) await Promise.resolve();
  }
}
const headers = (req) => Object.fromEntries(req.headers.map((h) => [h.key, h.value]));
const ok = (body) => ({ status: 200, body: JSON.stringify(body) });

const egg = ow.spawnEntity("zt:player", { x: 0.5, y: 64, z: 0.5 });
runTicks(2);
const bot = Bot.botOf(egg);
const steve = new Player(ow, { x: 3, y: 64, z: 0 });
ow.entities.push(steve);
bot.friends.Steve = 4;
/** Talk to it and let the answer come back. */
async function talk(text, ticks = 120) {
  const n = log.messages.length;
  const before = net.requests.length;
  Chat.hear(bot, steve, text);
  await settle(ticks);
  return { lines: said(bot, n), req: net.requests.length > before ? net.requests[net.requests.length - 1] : undefined };
}

console.log("is it there?");
let pong = false;
system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id === "zt:ai_pong") pong = true;
});
system.sendScriptEvent("zt:ai_ping", "ping");
await settle(3);
check(pong, "it answers the Player API's ping");

console.log("Claude");
Chat.setAiConfig({ on: true, provider: "anthropic", key: "sk-ant-test-1234" });
net.handler = () => ok({ type: "message", role: "assistant", stop_reason: "end_turn",
  content: [{ type: "thinking", thinking: "", signature: "abc" }, { type: "text", text: "sure, lead the way <follow>" }] });
let t = await talk("hey, come with me to the village");
let h = headers(t.req);
let body = JSON.parse(t.req.body);
check(t.req.uri === "https://api.anthropic.com/v1/messages" && t.req.method === "Post", "it posts to Claude's Messages API");
check(h["x-api-key"] === "sk-ant-test-1234" && h["anthropic-version"] === "2023-06-01" && h["content-type"] === "application/json", "with the key and the API version");
check(body.model === "claude-opus-5-5" && body.max_tokens >= 1000 && body.system.includes(bot.name), "the default model, and who the Player is");
check(body.messages[0].role === "user" && body.messages.at(-1).role === "user" && body.messages.at(-1).content.includes("come with me"),
  "the conversation, from and to the player");
check(body.output_config?.effort === "low" && body.fallbacks === "default" && h["anthropic-beta"] === "server-side-fallback-2026-07-01",
  "a chat line's low effort, and another model tries if it's declined");
check(t.lines.some((m) => m.endsWith("> sure, lead the way")), `the answer is the Player's line: "${t.lines.at(-1) ?? ""}"`);
check(bot.follow === "Steve", "and it does what it said: it follows");
bot.follow = null;

// its own lines in the conversation go as the assistant's, never two of a side in a row
body = JSON.parse((await talk("cool")).req.body);
const roles = body.messages.map((m) => m.role);
check(roles.includes("assistant") && roles.every((r, i) => i === 0 || r !== roles[i - 1]), `turns alternate (${roles.join(" ")})`);

// a model chosen in the Player API item, which takes no effort setting or fallback
Chat.setAiConfig({ on: true, provider: "anthropic", key: "sk-ant-test-1234", model: "claude-haiku-4-5" });
body = JSON.parse((await talk("what are you up to")).req.body);
check(body.model === "claude-haiku-4-5" && !body.output_config && !body.fallbacks, "a model of its own choosing, with only what that model takes");

console.log("when it goes wrong");
Chat.setAiConfig({ on: true, provider: "anthropic", key: "sk-ant-wrong" });
net.handler = () => ({ status: 401, body: JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }) });
let n0 = log.messages.length;
t = await talk("hello?");
check(t.lines.length === 1, `a bad key: the Player answers by itself ("${t.lines[0] ?? ""}")`);
check(log.messages.slice(n0).some((m) => /didn't answer: invalid x-api-key/.test(m)), "and the player hears why");
net.handler = () => ok({ type: "message", role: "assistant", stop_reason: "refusal", content: [], stop_details: { type: "refusal", category: null } });
t = await talk("tell me something");
check(t.lines.length === 1, "declined: it answers by itself");
net.handler = () => new Promise(() => {});
t = await talk("are you there", 360);
check(t.lines.length === 1, "no answer at all: after a while it answers by itself");

console.log("OpenAI, Gemini and others");
Chat.setAiConfig({ on: true, provider: "openai", key: "sk-test-openai" });
net.handler = () => ok({ choices: [{ message: { role: "assistant", content: "yeah, mining iron rn" } }] });
t = await talk("what are you doing");
h = headers(t.req);
body = JSON.parse(t.req.body);
check(t.req.uri === "https://api.openai.com/v1/chat/completions" && h.authorization === "Bearer sk-test-openai", "OpenAI: its chat completions, with the key");
check(body.messages[0].role === "system" && body.messages[0].content.includes(bot.name) && body.model && body.reasoning_effort === "low",
  "who the Player is goes first; the default model, thinking little");
check(t.lines.some((m) => m.endsWith("> yeah, mining iron rn")), "and the answer comes back");

Chat.setAiConfig({ on: true, provider: "gemini", key: "AIzaTest" });
net.handler = () => ok({ candidates: [{ content: { role: "model", parts: [{ text: "found some diamonds!" }] } }] });
t = await talk("any luck?");
h = headers(t.req);
body = JSON.parse(t.req.body);
check(/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[\w.-]+:generateContent$/.test(t.req.uri) && h["x-goog-api-key"] === "AIzaTest",
  "Gemini: generateContent, with the key");
check(body.systemInstruction.parts[0].text.includes(bot.name) && body.contents.at(-1).role === "user" && body.contents.some((c) => c.role === "model"),
  "who the Player is, and the conversation as Gemini has it (its own lines the model's)");
check(t.lines.some((m) => m.endsWith("> found some diamonds!")), "and the answer comes back");

Chat.setAiConfig({ on: true, provider: "custom", key: "none", model: "llama3", url: "http://localhost:11434/v1/chat/completions" });
net.handler = () => ok({ choices: [{ message: { role: "assistant", content: "hi from my own server" } }] });
t = await talk("hi");
body = JSON.parse(t.req.body);
check(t.req.uri === "http://localhost:11434/v1/chat/completions" && !headers(t.req).authorization && body.model === "llama3" && !body.reasoning_effort,
  "another server: its URL and model, no key needed");
check(t.lines.some((m) => m.endsWith("> hi from my own server")), "and the answer comes back");

console.log("busy");
Chat.setAiConfig({ on: true, provider: "anthropic", key: "sk-ant-test-1234" });
let release = [];
net.handler = () => new Promise((res) => release.push(() => res(ok({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" }))));
const most = { open: 0 };
const before = net.requests.length;
for (const line of ["one", "two", "three", "four"]) Chat.hear(bot, steve, line);
for (let i = 0; i < 40; i++) {
  await settle(1);
  most.open = Math.max(most.open, net.open);
  if (i % 8 === 7) for (const r of release.splice(0)) r();
}
check(most.open <= 2 && net.requests.length - before === 4, `at most two requests at once (${most.open}), the rest wait their turn`);

console.log("");
check(warnings.length === 0, "no script errors" + (warnings.length ? ": " + warnings.slice(0, 3).join(" | ") : ""));
console.log(failures === 0 ? "ALL GOOD" : `${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
