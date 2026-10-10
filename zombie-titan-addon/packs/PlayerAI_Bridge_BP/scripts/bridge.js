// Player AI Bridge: carries what players say to the Players (from the Zombie Titan add-on) to
// the AI whose key was typed into the Player API item, and brings the answer back.
//
// The Zombie Titan pack sends `zt:ai_request` script events: {id, cfg: {provider, key, model,
// url}, sys, msgs: [{role: "user" | "assistant", content}]}. This pack answers with `zt:ai_reply`
// {id, text} or {id, error}, and answers a `zt:ai_ping` with a `zt:ai_pong`.
//
// Web requests need @minecraft/server-net, which only a Bedrock Dedicated Server (BDS) has: Beta
// APIs on in the world, and "@minecraft/server-net" in the allowed_modules of the server's
// config/default/permissions.json.
import { system } from "@minecraft/server";
import { http, HttpHeader, HttpRequest, HttpRequestMethod } from "@minecraft/server-net";

/** The longest answer passed back (the Players keep chat lines short anyway). */
const MAX_TEXT = 300;
/** Seconds before a request is given up on (the Player answers by itself after 15). */
const TIMEOUT = 12;
/** Requests at once; more wait their turn, and old ones are dropped. */
const MAX_BUSY = 2;

/** Claude models that take an effort setting, and those that retry a declined request on another model. */
const EFFORT = /^claude-(opus|sonnet|haiku|fable|mythos)-(5|4-[6-9])/;
const FALLBACKS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);
const DEFAULT_MODEL = { anthropic: "claude-opus-5-5", openai: "gpt-5-mini", gemini: "gemini-3.6-flash" };

/** @type {{id: string, cfg: any, sys: string, msgs: any[], at: number}[]} */
const queue = [];
let busy = 0;

system.afterEvents.scriptEventReceive.subscribe(
  (ev) => {
    if (ev.id === "zt:ai_ping") send("zt:ai_pong", "ok");
    else if (ev.id === "zt:ai_request") take(ev.message);
  },
  { namespaces: ["zt"] },
);

/** @param {string} id @param {string} message */
function send(id, message) {
  try {
    system.sendScriptEvent(id, message);
  } catch (e) {
    console.warn("[Player AI Bridge] couldn't answer: " + e);
  }
}
/** @param {string} id @param {string} text */
function answer(id, text) {
  send("zt:ai_reply", JSON.stringify({ id, text: text.slice(0, MAX_TEXT) }));
}
/** @param {string} id @param {string} error */
function fail(id, error) {
  send("zt:ai_reply", JSON.stringify({ id, error: String(error).slice(0, 200) }));
}

/** A request from a Player. @param {string} message */
function take(message) {
  let req;
  try {
    req = JSON.parse(message);
  } catch {
    return;
  }
  if (!req || typeof req.id !== "string") return;
  if (!req.cfg || !req.cfg.key || !Array.isArray(req.msgs)) {
    fail(req.id, "no AI set up");
    return;
  }
  queue.push({ id: req.id, cfg: req.cfg, sys: String(req.sys ?? ""), msgs: req.msgs, at: system.currentTick });
  next();
}

function next() {
  while (busy < MAX_BUSY && queue.length) {
    const job = queue.shift();
    // waited too long: the Player has already answered by itself
    if (!job || system.currentTick - job.at > 200) continue;
    busy++;
    ask(job)
      .then((text) => answer(job.id, text))
      .catch((e) => fail(job.id, e instanceof Error ? e.message : e))
      .finally(() => {
        busy--;
        next();
      });
  }
}

/**
 * The conversation as the AI services want it: starting with someone speaking to it, never the
 * same side twice in a row (lines next to each other are joined).
 * @param {any[]} msgs
 */
function tidy(msgs) {
  /** @type {{role: "user" | "assistant", content: string}[]} */
  const out = [];
  for (const m of msgs) {
    const role = m?.role === "assistant" ? "assistant" : "user";
    const content = String(m?.content ?? "").trim();
    if (!content) continue;
    if (!out.length && role === "assistant") continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += "\n" + content;
    else out.push({ role, content });
  }
  return out;
}

/** Ask the AI. @param {{cfg: any, sys: string, msgs: any[]}} job @returns {Promise<string>} */
async function ask(job) {
  const msgs = tidy(job.msgs);
  if (!msgs.length) throw new Error("nothing to answer");
  const call = build(job.cfg, job.sys, msgs);
  const req = new HttpRequest(call.uri).setMethod(HttpRequestMethod.Post).setTimeout(TIMEOUT).setBody(JSON.stringify(call.body));
  req.setHeaders(call.headers.map(([k, v]) => new HttpHeader(k, v)));
  const res = await http.request(req);
  let data;
  try {
    data = JSON.parse(res.body);
  } catch {
    throw new Error(`the AI service answered ${res.status} with something that isn't JSON`);
  }
  if (res.status < 200 || res.status >= 300) throw new Error(errorOf(data) ?? `the AI service answered ${res.status}`);
  const text = call.read(data).replace(/\s+/g, " ").trim();
  if (!text) throw new Error("the AI gave an empty answer");
  return text;
}

/** The message in an error answer, whichever service sent it. @param {any} data */
function errorOf(data) {
  const e = data?.error;
  if (!e) return undefined;
  return typeof e === "string" ? e : e.message ?? e.type ?? undefined;
}

/**
 * The request for the chosen service.
 * @param {{provider: string, key: string, model?: string, url?: string}} cfg
 * @param {string} sys
 * @param {{role: "user" | "assistant", content: string}[]} msgs
 * @returns {{uri: string, headers: [string, string][], body: any, read: (data: any) => string}}
 */
function build(cfg, sys, msgs) {
  const provider = cfg.provider === "auto" ? guess(cfg.key) : cfg.provider;
  if (provider === "anthropic") {
    // Claude's Messages API
    const model = cfg.model || DEFAULT_MODEL.anthropic;
    /** @type {[string, string][]} */
    const headers = [["content-type", "application/json"], ["x-api-key", cfg.key], ["anthropic-version", "2023-06-01"]];
    /** @type {any} */
    const body = { model, max_tokens: 4000, system: sys, messages: msgs };
    // a chat line needs little thought
    if (EFFORT.test(model)) body.output_config = { effort: "low" };
    // a declined request is tried again on the model Anthropic recommends for it
    if (FALLBACKS.has(model)) {
      body.fallbacks = "default";
      headers.push(["anthropic-beta", "server-side-fallback-2026-07-01"]);
    }
    return {
      uri: "https://api.anthropic.com/v1/messages",
      headers,
      body,
      read: (data) => {
        if (data.stop_reason === "refusal") throw new Error("the AI declined to answer");
        /** @type {{type: string, text?: string}[]} */
        const blocks = data.content ?? [];
        const text = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
        if (!text.trim() && data.stop_reason === "max_tokens") throw new Error("the answer ran too long");
        return text;
      },
    };
  }
  if (provider === "gemini") {
    const model = cfg.model || DEFAULT_MODEL.gemini;
    return {
      uri: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: [["content-type", "application/json"], ["x-goog-api-key", cfg.key]],
      body: {
        systemInstruction: { parts: [{ text: sys }] },
        contents: msgs.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      },
      read: (data) => {
        /** @type {{text?: string}[]} */
        const parts = data.candidates?.[0]?.content?.parts ?? [];
        return parts.map((p) => p.text ?? "").join("");
      },
    };
  }
  // OpenAI, or any server that speaks its chat completions (OpenRouter, LM Studio, Ollama...)
  const custom = provider !== "openai";
  if (custom && !cfg.url) throw new Error("no server URL set for Other");
  const model = cfg.model || (custom ? undefined : DEFAULT_MODEL.openai);
  /** @type {any} */
  const body = { messages: [{ role: "system", content: sys }, ...msgs] };
  if (model) body.model = model;
  // its reasoning models: a chat line needs little
  if (!custom && /^(gpt-5|o\d)/.test(model ?? "")) body.reasoning_effort = "low";
  /** @type {[string, string][]} */
  const headers = [["content-type", "application/json"]];
  if (cfg.key && cfg.key !== "none") headers.push(["authorization", "Bearer " + cfg.key]);
  return {
    uri: custom ? String(cfg.url) : "https://api.openai.com/v1/chat/completions",
    headers,
    body,
    read: (data) => {
      const c = data.choices?.[0];
      if (c?.message?.refusal) throw new Error("the AI declined to answer");
      return String(c?.message?.content ?? "");
    },
  };
}

/** Which service a key is for, from how it starts. @param {string} key */
function guess(key) {
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("AIza")) return "gemini";
  return "openai";
}

console.log("[Player AI Bridge] ready: Players can chat through the AI set in the Player API item.");
