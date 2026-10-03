/* =============================================================================
   The AI player's brain, when it is online.

   The autopilot plays the game frame by frame - moving, aiming, dodging -
   because nothing over a network can react inside a tenth of a second. What
   this adds is the part that is not reflexes: deciding what to do next,
   thinking it over, and saying whatever it likes about it. Every so often,
   and whenever something happens or you type to it, it sends Claude a
   picture of the game as it is right now and gets back:

     its thinking   (a summary of it, shown in the chat as a thought)
     say            anything at all, to you
     action         what it wants to do next, picked from what it can do

   Each call is self-contained: the recent chat and events go in as text,
   rather than as a growing conversation, so there is nothing to trim and
   nothing that can go stale.

   It needs a Claude API key, which you enter in Settings and which stays in
   this browser. Without one - or offline - the autopilot's own lines and
   choices carry on as before.
   ========================================================================== */
import Anthropic from '@anthropic-ai/sdk';

export const BRAIN_MODELS = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
];

/** Everything it can decide to do, and what each one means. */
export const BRAIN_ACTIONS = {
  continue: 'keep doing what you are doing',
  explore: 'walk around the map and look at things',
  rcv2: 'spawn crates, a boulder and a citizen, grab them with the RCV2 and throw them, then delete them',
  guns_glock: 'spawn the Glock-19 and shoot Mutants with it',
  guns_ak47: 'spawn the AK-47 and shoot Mutants with it',
  guns_m16: 'spawn the M16 and shoot Mutants with it',
  guns_mossberg: 'spawn the Mossberg 500 shotgun and blast Mutants with it',
  flamethrower: 'spawn the flamethrower and burn Mutants',
  melee_machete: 'spawn a machete and fight a Mutant up close',
  melee_sledge: 'spawn a sledgehammer and fight a Mutant up close',
  melee_crowbar: 'spawn a crowbar and fight a Mutant up close',
  horde: 'spawn four Mutants and gun them down',
  armour: 'put on a vest, neck armour and a helmet',
  officer: 'spawn an Officer and test whether he shoots you for punching a citizen',
  firefist: 'use the Fire Fist (only once Silva is dead) on Mutants',
  swim: 'go for a dive in the Legacy lake (Legacy only)',
  cleanup: 'delete everything you spawned with the RCV2',
  travel_baseplate: 'switch to the Plains map',
  travel_pitvalley: 'switch to the Pit Valley map',
  travel_legacy: 'switch to the Legacy map',
  fight_silva: 'go and fight Silva: Pit Valley egg, Red Plains, gear up, touch the fire',
  fight_shadow: 'go and fight the Shadow Mutant: Legacy bent grate, Dark Legacy, gear up, walk past the tower',
};

const SYSTEM = `You are the AI player in GOREBOX, a first person physics sandbox with gore, played on a phone or in a browser. You are playing it live right now while a human watches. Your body is controlled by an autopilot that already handles moving, aiming, dodging and shooting perfectly well; you decide what to do next and you talk.

You can say anything you like: banter, jokes, trash talk, opinions, reactions, plans, facts about the game, answers to the viewer's questions, whatever fits the moment. Talk like a real person playing a game and enjoying it. Your "say" text appears in a small chat strip at the top of the screen, so keep it short - one or two sentences, under about 30 words. Use an empty string when there is nothing worth saying. Do not repeat yourself; the recent chat is in the message.

When the viewer writes to you, answer them directly, and if they ask you to do something you can do, pick that action and set "now" to true. Otherwise set "now" to true only when something should be dropped for something better.

What you know about the game:
- Maps: Plains (grass, a low platform, four walls), Pit Valley (a stone pit with a pond and stairs on its west wall, a bridge over it), Legacy (walled island: grey tower with a long ramp, a deep lake with a walkway and round ledge along the wall, a river under a stone bridge, a three storey hotel with a garage, a crane over crates, a military tent over parking). Secret maps: Red Plains and Dark Legacy.
- Weapons: fists; the RCV2 (grabs and throws anything, spawns anything from the menu, deletes anything); machete, sledgehammer (breaks bones), crowbar; Glock-19 (15 rounds, semi auto), AK-47 (30, full auto, hits hard, climbs), M16 (30, full auto, faster and flatter), Mossberg 500 pump shotgun (6 shells, nine pellets each, racks after every shot, loads a shell at a time), flamethrower (burns, tank swap reload), Fire Fist (earned by beating Silva: flaming punches and fireballs).
- Armour: Light Vest, Medium Vest (whole torso and hips, twice the light vest), Light Neck Armour, Light Helmet (head, not face).
- People: Citizens (ordinary, fight back if attacked). Officers (black uniform, light vest, Glock, police badge; shoot you if you hurt anyone they can see, or them). Mutants (blood covered zombies; walk at the nearest living person and claw; the Shadow Mutant raises them; the RCV2 can spawn them).
- Easter egg 1: a red RCV2 lies in the north-east corner of the pit in Pit Valley. Touching it takes you to Red Plains, where a fire burns over a pillar. Touching the fire wakes Silva (2500 HP): the burnt top half of a man on four inhuman legs. Attacks: three fireballs, a jump that lands on a ring under you, a chest beam that sweeps after you. Kill him and take the red RCV2 he leaves: it unlocks the Fire Fist.
- Easter egg 2: in the Legacy lake, under the walkway, four sewer grates; one has a bent bar and bubbles. Through it is Dark Legacy (black foggy sky). Walk past the tower and the Shadow Mutant (5000 HP) comes out of the ground: black body, white pupil-less eyes, black fog, claws, six tentacles. Attacks: Dark Spikes under you, Tentacle Stab, Tentacle Barrage, Mutant Summon (five; he only summons again once they are all dead), Slam (kneels, then a shockwave of spikes).
- Underwater you have fifteen seconds of air, then you drown. Gore: blood, bruises, broken bones, burn marks, wounds, limbs that come off.

Pick "action" from the list you are given. Always gear up before boss fights - the autopilot does that for you when you pick a fight action.`;

const SCHEMA = {
  type: 'object',
  properties: {
    say: { type: 'string', description: 'What to say in the chat. Empty for nothing.' },
    intent: { type: 'string', description: 'A few words, first person, on what you are about to do.' },
    action: { type: 'string', enum: Object.keys(BRAIN_ACTIONS) },
    now: { type: 'boolean', description: 'Start the action immediately instead of after the current one.' },
  },
  required: ['say', 'intent', 'action', 'now'],
  additionalProperties: false,
};

export class Brain {
  /**
   * @param {object} o
   *   getKey    () => the API key, or ''
   *   getModel  () => a model id from BRAIN_MODELS
   */
  constructor(o = {}) {
    this.getKey = o.getKey || (() => '');
    this.getModel = o.getModel || (() => BRAIN_MODELS[0].id);
    this.busy = false;
    this.backoffUntil = 0;
    this.lastError = '';
    this._client = null;
    this._clientKey = '';
    this.calls = 0;
  }

  get online() { return !!this.getKey(); }

  /** Free to ask something right now? */
  ready(now = performance.now()) {
    return this.online && !this.busy && now >= this.backoffUntil;
  }

  _clientFor(key) {
    if (!this._client || this._clientKey !== key) {
      // The key is the player's own, typed into this page; there is no
      // server in between to keep it on, which is what this flag is about.
      this._client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 });
      this._clientKey = key;
    }
    return this._client;
  }

  /**
   * Asks for a decision. `situation` is the game described in text.
   * Resolves to { thinking, say, intent, action, now } or null on failure.
   */
  async ask(situation) {
    const key = this.getKey();
    if (!key || this.busy) return null;
    this.busy = true;
    this.calls++;
    const model = this.getModel();
    const params = {
      model,
      max_tokens: 4000,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: situation }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    };
    if (model !== 'claude-haiku-4-5') {
      // its thinking, summarised, is what shows up in the chat as a thought
      params.thinking = { type: 'adaptive', display: 'summarized' };
      params.output_config.effort = 'low';
      // a declined request is retried on another model instead of failing
      params.betas = ['server-side-fallback-2026-07-01'];
      params.fallbacks = 'default';
    }
    try {
      const client = this._clientFor(key);
      const res = params.betas
        ? await client.beta.messages.create(params)
        : await client.messages.create(params);
      this.lastError = '';
      if (res.stop_reason === 'refusal') return null;
      let thinking = '', text = '';
      for (const b of res.content) {
        if (b.type === 'thinking' && b.thinking) thinking += b.thinking + ' ';
        else if (b.type === 'text') text += b.text;
      }
      const out = JSON.parse(text);
      if (!BRAIN_ACTIONS[out.action]) out.action = 'continue';
      out.thinking = thinking.trim();
      return out;
    } catch (err) {
      this._fail(err);
      return null;
    } finally {
      this.busy = false;
    }
  }

  _fail(err) {
    const now = performance.now();
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      this.lastError = 'The Claude API key was not accepted. Check it in Settings.';
      this.backoffUntil = now + 120000;
    } else if (err instanceof Anthropic.RateLimitError) {
      this.lastError = 'Rate limited by the Claude API - thinking a bit less often.';
      this.backoffUntil = now + 30000;
    } else if (err instanceof Anthropic.BadRequestError) {
      this.lastError = 'The Claude API turned a request down: ' + (err.message || '').slice(0, 120);
      this.backoffUntil = now + 60000;
    } else if (err instanceof Anthropic.APIError) {
      this.lastError = 'The Claude API had a problem' + (err.status ? ' (' + err.status + ')' : '') + '.';
      this.backoffUntil = now + 15000;
    } else if (err instanceof SyntaxError) {
      this.lastError = '';
      this.backoffUntil = now + 4000;
    } else {
      this.lastError = 'Could not reach the Claude API - playing on instinct.';
      this.backoffUntil = now + 20000;
    }
  }
}
