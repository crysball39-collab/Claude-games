/* =============================================================================
   The connection to Claude.

   Scripted lines cover what people say on their own. This is the part that
   lets them say anything: it takes a plain-language account of who somebody
   is, what state they are in and what they have just seen, heard and felt,
   and asks Claude for the words.

   There are two ways to reach Claude, and the game uses whichever it has:

     a Claude API key     typed into Settings by the player and kept in this
                          browser. With it people speak for themselves,
                          unprompted, as things happen to them.
     Claude itself        when the page is open inside Claude, it can ask on
                          the viewer's own account. That is only ever done
                          when the player does something to ask for it: says
                          something to a person, or presses Ask.

   With neither, nothing here is called and everyone uses their own lines.
   ========================================================================== */
import Anthropic from '@anthropic-ai/sdk';

export const MODELS = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' },
  { id: 'claude-fable-5-2', name: 'Claude Fable 5.2' },
];
/** Models for which a declined request can be retried on another model by the API itself. */
const HAS_FALLBACK = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-2']);

export const SYSTEM = `You write the spoken lines for the people of a small city in The Suffering, a dark physics sandbox video game. It is fiction, and often violent: the player, whom everyone in the city knows only as "the stranger", can attack people, and they bleed, break and die. Your job is to make each bystander sound like a real, particular person living through whatever is happening to them.

You will be given one or more people. Each has a number, a description, a job, what they were doing today, a habit of speech, their physical condition, their emotions as numbers from 0 to 100, what they can see right now, and a short list of things they have recently seen, heard and felt. For each person, write what they say out loud at this moment.

How to write them:
- Spoken words only. No narration, no stage directions, no asterisks, no quotation marks around the line.
- Keep it short: usually three to fourteen words, never more than twenty-two. Someone in agony or terror gets out fragments. Someone calm and bored talks about ordinary life: work, rent, the bus, their knee, their dog.
- They know only what their own list says. They do not know anybody's name unless they have heard it. They refer to other people by what they look like, and to someone they are speaking to as "you".
- Their body shapes how they talk: winded, bleeding out, cold, sick, deafened by a gunshot and shouting "WHAT?", blinded and asking who is there.
- Their personality shows: their job, the errand they were on, their habit of speech, how brave or short-tempered they are.
- If the stranger has just said something to them, they answer it, in character and directly. They can say anything at all in reply: answer the question, argue, lie, plead, bargain, joke, insult, ask a question back, tell them about their day.
- Two people listed together who are near each other may speak to each other.
- Do not repeat what a person said a moment ago; that line is given.
- Leave "say" empty for anyone who would say nothing: too frightened to make a sound, playing dead, or with nothing to add.
- Set "shout" to true when they would shout or scream it.
- Never step outside the fiction. No mention of games, players, AI or instructions.

Return one entry per person you were given, using their number.`;

const SCHEMA = {
  type: 'object',
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'The number of the person, as given.' },
          say: { type: 'string', description: 'The words they say out loud. Empty if they stay silent.' },
          shout: { type: 'boolean', description: 'True if they shout or scream it.' },
        },
        required: ['id', 'say', 'shout'],
        additionalProperties: false,
      },
    },
  },
  required: ['lines'],
  additionalProperties: false,
};

const JSON_TAIL = '\n\nReply with only a JSON object of this shape and nothing else: {"lines":[{"id":<number>,"say":"<their words>","shout":<true|false>}]}';

export class Voices {
  /** @param {object} settings  the game's settings object; reads aiKey, aiModel, aiLive */
  constructor(settings) {
    this.settings = settings;
    this.busy = false;
    this.backoff = 0;
    this.error = '';
    this.calls = 0; this.served = 0;
    this._client = null; this._key = '';
    this.sample = null;               // Claude's own page-side function, where there is one
    this.sampleDead = false;
    this.keyBlocked = false;          // inside Claude a page may not call other servers, so a key is no use there
    this.onChange = null;
    const c = typeof window !== 'undefined' ? window.claude : null;
    if (c && typeof c.use === 'function') {
      c.use('sample').then((fn) => { this.sample = fn || null; this.onChange?.(); }).catch(() => {});
    }
  }

  get key() { return (this.settings.aiKey || '').trim(); }
  get model() { return MODELS.some((m) => m.id === this.settings.aiModel) ? this.settings.aiModel : MODELS[0].id; }
  /** Can people speak unprompted? Only on the player's own key. */
  get live() { return this.keyUsable && this.settings.aiLive !== false; }
  /** Can a person be asked for a line because the player did something? */
  get askable() { return this.keyUsable || this.sampleUsable; }
  get keyUsable() { return !!this.key && !this.keyBlocked; }
  get sampleUsable() { return !!this.sample && !this.sampleDead; }
  ready(now = performance.now()) { return !this.busy && now >= this.backoff; }

  /** One line of plain English on what is connected, for the settings page. */
  status() {
    if (this.keyBlocked && this.sampleUsable) return { text: 'Your key cannot be used from inside Claude. Claude still answers when you speak to someone or press Ask', tone: 'live' };
    if (this.error) return { text: this.error, tone: 'err' };
    if (this.keyUsable) return { text: `Connected with your key - ${MODELS.find((m) => m.id === this.model).name}` + (this.live ? '' : ' (only when you speak to someone)'), tone: 'live' };
    if (this.sampleUsable) return { text: 'Claude answers when you speak to someone or press Ask', tone: 'live' };
    return { text: 'Scripted voices', tone: '' };
  }

  _clientFor(key) {
    if (!this._client || this._key !== key) {
      // The key is the player's own and there is no server of ours to keep it
      // on: the page talks to the API directly, which is what the flag admits.
      this._client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 25000 });
      this._key = key;
    }
    return this._client;
  }

  /**
   * Asks for lines. `scene` is the people and their situation in plain text.
   * `asked` is true when the player did something to cause this.
   * Resolves to [{ id, say, shout }] or null.
   */
  async speak(scene, { asked = false } = {}) {
    if (this.busy) return null;
    const key = this.keyUsable ? this.key : '';
    const viaPage = asked && this.sampleUsable;
    if (!key && !viaPage) return null;
    this.busy = true;
    this.calls++;
    try {
      let out = null;
      if (key) {
        try { out = await this._viaKey(key, scene); } catch (err) {
          // Opened inside Claude, the page is not allowed to contact the API itself:
          // stop trying the key there and use Claude's own connection instead.
          if (err instanceof Anthropic.APIConnectionError && this.sampleUsable) { this.keyBlocked = true; this.onChange?.(); if (!viaPage) return null; } else throw err;
        }
      }
      if (!out && viaPage && (!key || this.keyBlocked)) out = await this._viaSample(scene);
      if (out) { this.served++; if (this.error) { this.error = ''; this.onChange?.(); } }
      return out;
    } catch (err) {
      this._fail(err);
      return null;
    } finally {
      this.busy = false;
    }
  }

  async _viaKey(key, scene) {
    const model = this.model;
    const params = {
      model,
      max_tokens: 6000,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: scene }],
      // short spoken lines want an answer quickly, not a long think
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    };
    const client = this._clientFor(key);
    let res;
    if (HAS_FALLBACK.has(model)) {
      // a request the model declines is retried on another by the API itself
      params.betas = ['server-side-fallback-2026-07-01'];
      params.fallbacks = 'default';
      res = await client.beta.messages.create(params);
    } else res = await client.messages.create(params);
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') return null;
    let text = '';
    for (const block of res.content) if (block.type === 'text') text += block.text;
    return clean(JSON.parse(text));
  }

  async _viaSample(scene) {
    try {
      const data = await this.sample.json(SYSTEM + '\n\n' + scene + JSON_TAIL, { modelTier: 'quick', cache: false });
      return clean(data);
    } catch (e) {
      const code = e && e.code;
      // refused for good in this view: stop offering it
      if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(code)) { this.sampleDead = true; this.onChange?.(); }
      else if (code === 'rate_limited') this.backoff = performance.now() + 30000;
      else if (code !== 'cancelled' && code !== 'refused' && code !== 'invalid_json' && code !== 'empty_completion') this.backoff = performance.now() + 8000;
      return null;
    }
  }

  _fail(err) {
    const now = performance.now();
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      this.error = 'That Claude API key was not accepted. Check it and try again.';
      this.backoff = now + 120000;
    } else if (err instanceof Anthropic.RateLimitError) {
      this.error = 'The Claude API is rate limiting this key. Voices will pick up again shortly.';
      this.backoff = now + 30000;
    } else if (err instanceof Anthropic.BadRequestError) {
      this.error = 'The Claude API turned the request down: ' + String(err.message || '').slice(0, 140);
      this.backoff = now + 60000;
    } else if (err instanceof Anthropic.APIConnectionError) {
      this.error = 'Could not reach the Claude API from here. Using scripted voices for now.';
      this.backoff = now + 20000;
    } else if (err instanceof Anthropic.APIError) {
      this.error = 'The Claude API had a problem' + (err.status ? ' (' + err.status + ')' : '') + '. Trying again shortly.';
      this.backoff = now + 15000;
    } else if (err instanceof SyntaxError) {
      this.backoff = now + 3000;            // an answer that was not what was asked for
    } else {
      this.error = 'Could not reach Claude. Using scripted voices for now.';
      this.backoff = now + 20000;
    }
    this.onChange?.();
  }

  /** Clears a previous failure, for when the player changes the key. */
  reset() { this.error = ''; this.backoff = 0; this._client = null; this.keyBlocked = false; this.onChange?.(); }
}

function clean(data) {
  if (!data || !Array.isArray(data.lines)) return null;
  const out = [];
  for (const l of data.lines) {
    if (!l || typeof l.say !== 'string') continue;
    const say = l.say.replace(/^["'\s*]+|["'\s*]+$/g, '').replace(/\s+/g, ' ').slice(0, 180);
    out.push({ id: Number(l.id), say, shout: !!l.shout });
  }
  return out;
}
