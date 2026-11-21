/* =============================================================================
   What bot players decide, and who decides it.

   Each bot on a server picks its next move every few seconds, and sooner
   when something happens to it. With the player's Claude API key (Settings,
   VOICES) that choice is made by Claude (BOT_MODEL, at medium effort): it is
   told, in plain words, what the bot can see, hear and feel, what it carries
   and how its last move went (BotBrain.observe), and answers with one action,
   in a fixed JSON shape, and anything it wants to say out loud.

   Without a key, with the key turned down, or with the page open inside the
   Claude app (where a page may not contact the API), every bot decides for
   itself instead (BotBrain.decideHere), by its playstyle.
   ========================================================================== */
import Anthropic from '@anthropic-ai/sdk';
import { ACTIONS, SPAWNABLE } from './botbrain.js';

export const BOT_MODEL = 'claude-haiku-5-5';
export const BOT_MODEL_NAME = 'Claude Haiku 5.5';
export const BOT_EFFORT = 'medium';
/** Dollars per million tokens for the bots' model: input, output, cache reads, cache writes. */
const PRICE = { in: 0.10, out: 0.50, read: 0.01, write: 0.125 };

const SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ACTIONS },
    target: { type: 'string' },
    x: { type: 'number' },
    z: { type: 'number' },
    run: { type: 'boolean' },
    weapon: { type: 'string' },
    spawn: { type: 'string', enum: ['', ...SPAWNABLE] },
    say: { type: 'string' },
  },
  required: ['action', 'target', 'x', 'z', 'run', 'weapon', 'spawn', 'say'],
  additionalProperties: false,
};

/** The standing instructions, with this city's landmarks written in. */
function systemFor(city) {
  const door = city.police ? city.police.door : { x: 0, z: 21 };
  return `You are playing The Suffering, a dark physics sandbox video game, as one player on a multiplayer server: a bot that plays the way a real person would. It is fiction. Everybody in it is a ragdoll that bleeds, breaks and dies, and fighting is a normal part of the game. The other players on the server are bots like you and one human player.

Every few seconds you are told what your character can see, hear and feel, what they carry and how your last action went. You answer with your next action, in the JSON shape you are given, and anything you want to say out loud.

THE WORLD
- A small city on a grid of streets. Positions are (x, z) in metres: x grows to the east, z grows to the south. The city runs from about -60 to 60 each way.
- The park is the middle block, around (0, 0). The police station is the block south of it, its door at about (${Math.round(door.x)}, ${Math.round(door.z)}). The car park, with crates in it, is around (36, -36). The crossroads at the corners of the park are (-18, -18), (18, -18), (-18, 18) and (18, 18).
- The city also has ordinary residents and police officers, who are not players. Officers arrest, tase or shoot anyone who commits a crime in front of them. Cars drive the streets, and anyone can take one.

ACTIONS (exactly one per answer)
- wander: stroll along the pavements.
- move_to: walk to (x, z); run: true to run.
- follow: stay close to a person (target).
- flee: run away from a person (target).
- attack: fight a person (target) with the best thing you have: a gun is fired from range, a blade or your fists close in. It carries on until they are down or out of reach.
- pick_up: go to an item on the ground (target, a w id) and take it. Vests and helmets are put on.
- equip: take out a weapon you carry (weapon: its name). holster: put away what is in your hand. reload: reload the gun in your hand. drop: drop what is in your hand.
- enter_car: go to a car (target, a c id) and drive off in it; anyone at the wheel is dragged out. exit_car: get out of the car you are in.
- crouch, jump, wait (stand and watch; with a target, face them).
- spawn (the host only): make something appear in front of you (spawn: one of the listed things).
- tempest_kick (the host only): a high kick that sends a green blade of air flying forward, cutting through whoever it meets (target: who to aim it at).
Targets are the ids in square brackets in what you are told: p12 is a person, w5 an item, c3 a car. When an action does not use a field, leave target, weapon and spawn empty and x and z at 0.

SPEAKING
- say is spoken out loud, in a bubble over your head, and anyone close enough hears it. Keep it short, like a player typing in game chat: a few words, often lowercase, sometimes slang or a joke. Leave it empty most of the time. Speak when someone talks to you, when something happens worth reacting to, or when it fits your playstyle, and never repeat what you said last.
- No slurs, nothing hateful, nothing sexual.

PLAYING
- Play your playstyle. Change course when things change: someone attacks you or talks to you, you are badly hurt, a weapon is close by.
- Badly hurt, getting away is often wiser than fighting on.
- An action keeps going until it is done, so only switch when there is a reason.
- You know it is a game and may talk about it like one. You cannot pause, respawn on purpose, or leave the server.`;
}

export class BotMinds {
  constructor(game, voices, settings) {
    this.g = game; this.voices = voices; this.settings = settings;
    this.max = 2;                    // requests in flight at once
    this.inflight = 0;
    this.backoff = 0;
    this.error = '';
    this.blocked = false;            // the page may not contact the API from where it is open
    this.system = null;
    this.stats = { asked: 0, answered: 0, refused: 0, failed: 0, inTok: 0, outTok: 0, readTok: 0, writeTok: 0, ms: 0 };
    this.onChange = null;
  }

  get key() { return this.voices.key; }
  get on() { return this.settings.botAi !== false; }
  /** Can a bot's decision go to Claude at all? */
  get usable() { return this.on && !!this.key && !this.blocked && !this.voices.keyBlocked; }
  /** Usable, but resting after a failure: the bots decide for themselves until it is over. */
  get cooling() { return performance.now() < this.backoff; }
  /** ...and right now? */
  ready(now = performance.now()) { return this.usable && this.inflight < this.max && now >= this.backoff; }
  /** What the decisions so far have cost, in dollars, by the token counts the API reported. */
  get cost() { const s = this.stats; return (s.inTok * PRICE.in + s.outTok * PRICE.out + s.readTok * PRICE.read + s.writeTok * PRICE.write) / 1e6; }

  /** A line of plain English on who is making the bots' decisions. */
  status() {
    if (!this.on) return { text: `Bot brains: built in (${BOT_MODEL_NAME} switched off below).`, tone: '' };
    if (!this.key) return { text: `Bot brains: built in. Put a Claude API key in Settings, VOICES, and ${BOT_MODEL_NAME} (medium effort) decides for every bot: what it does, and what it says.`, tone: '' };
    if (this.blocked || this.voices.keyBlocked) return { text: `Bot brains: built in. This page cannot reach the Claude API from where it is open (inside the Claude app a page may not contact other servers). Open the downloaded game to put ${BOT_MODEL_NAME} in charge.`, tone: 'err' };
    if (this.error) return { text: 'Bot brains: built in for now. ' + this.error, tone: 'err' };
    return { text: `Bot brains: ${BOT_MODEL_NAME}, medium effort, on your key. Each decision is billed to it.`, tone: 'live' };
  }

  /**
   * Asks Claude for a bot's next move. Resolves to the decision, or null if
   * there was none to be had (the bot then decides for itself).
   */
  async decide(bot) {
    const key = this.key;
    if (!this.usable) return null;
    this.inflight++; this.stats.asked++;
    bot.asking = true;
    const t0 = performance.now();
    try {
      const obs = bot.brain.observe();
      bot.lastObs = obs;
      const res = await this.voices._clientFor(key).messages.create({
        model: BOT_MODEL,
        max_tokens: 4000,
        system: [{ type: 'text', text: this.system || (this.system = systemFor(this.g.city)), cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: obs }],
        output_config: { effort: BOT_EFFORT, format: { type: 'json_schema', schema: SCHEMA } },
      });
      this._count(res.usage);
      // the model's safety checks can decline a request, and there is no fallback model for it: this one bot decides for itself this time
      if (res.stop_reason === 'refusal') { this.stats.refused++; return null; }
      if (res.stop_reason === 'max_tokens') { this.stats.failed++; return null; }
      let text = '';
      for (const block of res.content) if (block.type === 'text') text += block.text;
      const d = JSON.parse(text);
      if (!d || !ACTIONS.includes(d.action)) { this.stats.failed++; return null; }
      this.stats.answered++;
      if (this.error) { this.error = ''; this.onChange?.(); }
      bot.latency = performance.now() - t0;
      this.stats.ms += bot.latency;
      return d;
    } catch (err) {
      this._fail(err);
      return null;
    } finally {
      this.inflight--;
      bot.asking = false;
    }
  }

  _count(u) {
    if (!u) return;
    const s = this.stats;
    s.inTok += u.input_tokens || 0; s.outTok += u.output_tokens || 0;
    s.readTok += u.cache_read_input_tokens || 0; s.writeTok += u.cache_creation_input_tokens || 0;
  }

  _fail(err) {
    const now = performance.now();
    this.stats.failed++;
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      this.error = 'That Claude API key was not accepted.';
      this.backoff = now + 120000;
    } else if (err instanceof Anthropic.RateLimitError) {
      this.error = 'The Claude API is rate limiting this key; Claude takes over again shortly.';
      this.backoff = now + 30000;
    } else if (err instanceof Anthropic.BadRequestError) {
      this.error = 'The Claude API turned the request down: ' + String(err.message || '').slice(0, 140);
      this.backoff = now + 60000;
    } else if (err instanceof Anthropic.APIConnectionError) {
      // inside the Claude app the page is not allowed out: no use trying again there
      if (typeof window !== 'undefined' && window.claude) this.blocked = true;
      else { this.error = 'Could not reach the Claude API from here.'; this.backoff = now + 20000; }
    } else if (err instanceof Anthropic.APIError) {
      this.error = 'The Claude API had a problem' + (err.status ? ' (' + err.status + ')' : '') + '; trying again shortly.';
      this.backoff = now + 15000;
    } else if (err instanceof SyntaxError) {
      this.backoff = now + 2000;     // an answer that was not the JSON asked for
    } else {
      this.error = 'Could not reach Claude.';
      this.backoff = now + 20000;
    }
    this.onChange?.();
  }

  /** The key changed, or the switch: start afresh. */
  reset() { this.error = ''; this.backoff = 0; this.blocked = false; this.onChange?.(); }
}
