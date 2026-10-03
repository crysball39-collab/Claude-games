/* =============================================================================
   AI play mode.

   An AI that plays the game for you, through the same controls you have: it
   pushes the stick, turns the camera, and presses JUMP, CROUCH, USE, RELOAD,
   SPAWN, DELETE and the big button. Nothing it does reaches past the input -
   if it wants a vest on, it spawns one with the RCV2, walks up to it and
   presses USE, the way you would.

   It runs entirely offline. There is no language model behind the chat: it
   knows the game - every map, weapon, piece of armour, everyone who lives in
   it, both Easter eggs and both bosses - and it talks about what it is doing
   from a large bank of lines.

   The plan is a small scheduler over generator functions. Each activity is a
   script that yields once a frame ("walk to the stairs", "go down them",
   "touch the red RCV2"), so a boss run reads in order, top to bottom, and
   carries on straight across a map change: the game is rebuilt on travel,
   the autopilot is not.
   ========================================================================== */
import { Vector3 } from 'three';
import { STATE } from './character.js';
import { GUNS, MELEE, CARRY, SPAWNABLES } from './game.js';
import { ARMOUR } from './armour.js';
import { isUnlocked } from './progress.js';
import { BRAIN_ACTIONS } from './brain.js';

const HIP = 0.945;
const TAU = Math.PI * 2;
const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3();

const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const yawTo = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz));
const pick = (a) => a[(Math.random() * a.length) | 0];

/** Activities that are already a fight, or cannot stop half way. */
/** What a request from you (or the brain) does not cut short. */
const UNSTOPPABLE = new Set(['boss fight', 'claim', 'travel']);

const SELF_DEFENDED = new Set(['boss fight', 'defend', 'grate', 'egg', 'guns', 'melee', 'horde',
  'flamer', 'firefist', 'officer']);

/** The maps it can pick from the menu (the secret ones are reached, not picked). */
const MENU_MAPS = ['baseplate', 'pitvalley', 'legacy'];
const MAP_NAME = {
  baseplate: 'Plains', pitvalley: 'Pit Valley', legacy: 'Legacy',
  redplains: 'Red Plains', darklegacy: 'Dark Legacy',
};

/* -------------------------------------------------------------------------- */
/*                               what it says                                 */
/* -------------------------------------------------------------------------- */

const LINES = {
  hello: [
    'AI play is on. I have the controls - sit back.',
    'Okay, my turn. Let me show you how this game is played.',
    'Hands off the stick, I got this.',
    'AI online. Armour, guns, bosses - let\'s go.',
  ],
  bye: ['Controls are yours again.', 'Handing it back. Have fun.', 'Your turn. Try not to die.'],
  arrive: {
    baseplate: ['Plains. Flat grass, a platform, four walls. A sandbox in the purest sense.',
      'Back on Plains. Good place to test weapons - nothing to hide behind.'],
    pitvalley: ['Pit Valley. There\'s a red RCV2 down in that pit - north-east corner, past the pond.',
      'Pit Valley. The bridge goes over the pit; the stairs on the west wall go into it.'],
    legacy: ['Legacy. Tower, lake, hotel, crane. And one of the sewer grates under the walkway has a bent bar...',
      'Legacy! The lake is deep here - fifteen seconds of air, then you start drowning.'],
    redplains: ['Red Plains. The fire over the pillar is Silva, waiting.',
      'Red Plains - everything here is the colour of a burn. Nobody lives here. Silva saw to that.'],
    darklegacy: ['Dark Legacy. Same island, black sky. Something lives under the ground by the tower.',
      'Made it through the bent bar. Dark Legacy. Walk past the tower and the Shadow Mutant comes up.'],
  },
  travel: ['Switching maps. {map} it is.', 'Let\'s go to {map}.', 'I want to see {map} again.', 'Heading to {map}.'],
  explore: ['Just going to have a look around.', 'Stretching my legs.', 'Let me walk the map a bit.',
    'Exploring. You never know what\'s lying about.'],
  landmark: ['That\'s the {name}.', 'Passing the {name}.', 'Here\'s the {name}.'],
  armUp: ['Gearing up: Medium Vest, neck armour, helmet, then a rifle.', 'Equipping before the fight. Armour first, gun last.',
    'Never fight a boss naked. Spawning my kit.'],
  armourOn: ['{item} on.', 'Wearing the {item}.', '{item} - check.'],
  gunOn: ['Got the {item}. {ammo} rounds.', '{item} in hand.', '{item} picked up. Loaded.'],
  reload: ['Reloading!', 'Mag change.', 'Empty - reloading.', 'Swapping the tank.'],
  rcv2: ['RCV2 time. Spawning some toys.', 'Let me play with the RCV2 for a bit.', 'Spawn, grab, throw. The classics.'],
  grab: ['Got it on the beam.', 'Grabbed!', 'Holding it...'],
  fling: ['Yeet.', 'And... throw!', 'Off you go.'],
  delete: ['Cleaning up with the RCV2 delete.', 'Deleting the mess.', 'Gone. The RCV2 deletes anything you point it at.'],
  guns: ['Range day. Let\'s try the {item}.', 'Testing the {item} on some Mutants.', '{item} versus Mutants. Place your bets.'],
  melee: ['Going in close with the {item}.', '{item} time. Nothing like a good swing.',
    'The {item} - let\'s see what it does to a Mutant.'],
  flamer: ['Flamethrower. Burn marks, here we come.', 'Hold to burn. RELOAD swaps the tank.'],
  firefist: ['Fire Fist! Punches set people alight, FIREBALL throws fire.', 'Fireball practice.'],
  horde: ['Spawning a few Mutants. They walk at the nearest living thing - that\'s me.',
    'Mutant horde. They shamble, they claw, they keep getting up.'],
  officer: ['Spawning an Officer. Don\'t hurt anyone in front of him - he\'ll shoot you.',
    'Officers carry a Glock and wear a vest. They only shoot if you attack someone they can see.'],
  officerFight: ['I hurt someone in front of the Officer. He\'s shooting at me now - fair enough.',
    'Officer\'s hostile. Self defence!'],
  citizens: ['A few citizens for company.', 'Spawning citizens. They fight back if you start something.'],
  swim: ['Going for a swim. Watching the air meter.', 'The lake is three metres deep. Let\'s dive.'],
  air: ['Air\'s low - surfacing!', 'Need to breathe. Going up.'],
  kill: ['Got one.', 'Down.', 'That\'s a kill.', 'One less.', 'Clean.', 'Next!'],
  killMutant: ['Mutant down. For good this time.', 'Put that Mutant down.', 'Mutant dropped.'],
  killOfficer: ['Officer down. Sorry, officer.', 'That\'s the Officer dealt with.'],
  hurt: ['Ow!', 'That hurt.', 'Hit!', 'Ouch, okay.', 'I\'m taking damage.'],
  lowHp: ['Health is low. Careful now.', 'I\'m in bad shape.', 'One more hit and I\'m done.'],
  died: ['I died. Respawning.', 'Well, that went badly. Again!', 'Dead. Back in a second.', 'Oof. Respawning.'],
  ragdoll: ['Knocked down - getting up.', 'Up, up...'],
  bossDecide: {
    silva: ['Boss time: Silva. Route - Pit Valley, the red RCV2 in the pit, Red Plains, touch the fire.',
      'Let\'s go kill Silva. First the Easter egg in Pit Valley.'],
    shadow: ['Boss time: the Shadow Mutant. Legacy, the bent sewer grate, Dark Legacy, past the tower.',
      'Let\'s go kill the Shadow Mutant. The way in is the bent grate under the walkway in Legacy.'],
  },
  egg: ['Down the stairs on the west wall, into the pit.', 'Into the pit - stairs are on the west wall.'],
  eggPond: ['Round the pond to the north-east corner. There it is, glowing.', 'The red RCV2 is in the far corner, past the pond.'],
  eggTouch: ['Touching the red RCV2.', 'Here it is. Touch.'],
  orb: ['Walking up to the fire over the pillar.', 'There\'s Silva\'s fire. Touching it starts the fight.'],
  grate: ['To the beach, then into the lake.', 'Diving for the bent grate - the one with the bubbles.'],
  grateEnter: ['Squeezing through the bent bar.', 'Found the bent bar. In we go.'],
  tower: ['Out of the water. Gear up, then walk past the tower.', 'Past the tower is where he comes up.'],
  cutscene: ['Here it comes...', 'Oh, here we go.', 'Cutscene. Watch this.'],
  silvaFight: ['Silva: three fireballs, a jump that lands on a ring, and a chest beam. I strafe, leave the ring, and keep moving sideways.',
    'Silva has 2500 HP. Shooting the body, dodging everything.'],
  shadowFight: ['Shadow Mutant: 5000 HP. Spikes under me, tentacle stabs, a barrage, Mutant summons and a slam. Let\'s dance.',
    'He only summons again once all his Mutants are dead. Keep them down, keep him busy.'],
  callout: {
    fireball: ['Fireballs! Strafing.', 'Head back, jaw open - three fireballs incoming.'],
    jump: ['He\'s jumping - out of the ring!', 'Ring under me. Moving!'],
    beam: ['Chest beam! Run sideways, never stand still.', 'Beam charging - keep moving across it.'],
    spikes: ['Dark Spikes under me - leave the ring!', 'Spikes! Out of the circle.'],
    stab: ['Tentacle stab - juke!', 'Stab coming, side step.'],
    barrage: ['Barrage! Zig-zag!', 'Tentacle barrage, weaving.'],
    summon: ['He\'s summoning Mutants. Five of them.', 'Mutants incoming - clearing them first.'],
    slam: ['Slam! Getting out of range and jumping the wave.', 'He\'s kneeling - slam! Back off and jump the shockwave.'],
  },
  bossHalf: ['Half his health gone.', 'Halfway there!', 'He\'s at half.'],
  bossQuarter: ['Nearly dead!', 'Quarter left. Push!', 'Almost!'],
  bossWin: {
    silva: ['SILVA IS DEAD! Grabbing the red RCV2 he dropped - that\'s the Fire Fist.',
      'Silva down! Now the reward: take the red RCV2.'],
    shadow: ['THE SHADOW MUTANT IS DEAD! GG.', 'Shadow Mutant down. Dark Legacy is quiet now.'],
  },
  claim: ['Taking the red RCV2.', 'Fire Fist, here I come.'],
  idle: [
    'Fun fact: limbs are tough now, but a sledgehammer still breaks bones.',
    'The Medium Vest covers the whole torso and the hips. Twice the light vest.',
    'The RCV2 can spawn anything in the menu - even Mutants.',
    'Officers wear a black uniform and a police badge. Leave the citizens alone near them.',
    'Mutants find the nearest living person and claw. They never run from anything.',
    'Silva has no legs of his own - he rides on four that aren\'t a man\'s.',
    'The Shadow Mutant has six tentacles and no pupils. Very rude.',
    'Burn marks stay on whoever you set alight. Wash the Blood clears them.',
    'Underwater you get fifteen seconds of air. After that it\'s ten damage a second.',
    'Two Easter eggs: the red RCV2 in Pit Valley, and the bent sewer grate in Legacy.',
    'The Fire Fist is earned by beating Silva. It lives in slot 9.',
    'The M16 fires faster than the AK, the AK hits harder.',
    'The Glock is semi automatic. One press, one round.',
    'The Mossberg 500 throws nine pellets a shell. Up close it is brutal; far off, not so much.',
    'Helmets cover the head, not the face. Aim for the face, I guess.',
    'I\'m an offline AI. No internet needed - I just know this game really well.',
    'Somebody should build a statue of me on the tower.',
    'If you want the controls back, press the AI button.',
    'Gore is better in the dark. Just saying.',
    'I wonder who built the hotel in Legacy. Three storeys and a garage.',
    'The crane in Legacy has crates under it you can knock about.',
    'Tip: in deep water, JUMP swims up and CROUCH dives.',
    'Thrown crates hurt bosses too. Not much, but they do.',
  ],
};

/** The lines that stay local even with Claude talking: they have to land
    in the instant they are about. */
const ESSENTIAL = new Set([
  ...Object.values(LINES.callout), LINES.died, LINES.air,
  LINES.bossWin.silva, LINES.bossWin.shadow,
]);

/* What it thinks, offline, when it picks something to do. Online, Claude's
   own thinking takes the place of these. */
const THOUGHTS = {
  explore: ['Nothing going on. Let me see what is lying around.', 'I have not looked round this map properly yet.',
    'A walk first. Then violence.'],
  rcv2: ['I feel like throwing things. The RCV2 can grab anything.', 'Physics time - spawn some crates and fling them.'],
  guns: ['I want to hear a gun go off. The {item} it is.', 'Range practice with the {item}. Mutants make good targets.'],
  melee: ['Guns are too easy. Let me try the {item} up close.', 'Close quarters with a {item}. Risky. Fun.'],
  horde: ['A horde would be a good warm-up. Four Mutants.', 'Let me see how many Mutants I can handle at once.'],
  armour: ['I keep taking hits. Armour first.', 'Medium vest, neck guard, helmet - being careful for once.'],
  flamer: ['Something should be on fire. Flamethrower.', 'Burn marks. I want to see burn marks.'],
  officer: ['I wonder if the Officer really shoots you for punching someone. Testing it.',
    'Officers only shoot if they see you hurt someone. Let me check that.'],
  firefist: ['I earned the Fire Fist. Might as well use it.', 'Fireballs. Obviously.'],
  swim: ['The lake is deep. A quick dive, watching the air.', 'Swim break.'],
  cleanup: ['This place is a mess. Deleting my stuff.', 'Too much junk lying around. RCV2 delete.'],
  travel: ['I have seen enough of this map. Somewhere else.', 'New map. I am bored of this one.'],
  boss: ['I have warmed up enough. Boss time.', 'Time for a real fight.'],
};

function fill(text, vars) {
  return text.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ''));
}

/* -------------------------------------------------------------------------- */
/*                                 autopilot                                  */
/* -------------------------------------------------------------------------- */

export class AutoPilot {
  /**
   * @param {object} o
   *   chat  an AiChat
   *   hud   the Hud (for the selected item readout)
   */
  constructor(o = {}) {
    this.chat = o.chat || null;
    this.hud = o.hud || null;
    /** Claude, if there is an API key: the thinking and the talking. */
    this.brain = o.brain || null;
    /** How many seconds between thoughts, when online. */
    this.thinkEvery = o.thinkEvery || (() => 15);
    this.events = [];             // what has happened lately, as text
    this._pending = null;         // the brain's last decision, waiting for a gap
    this._brainT = 3;
    this._poke = false;
    this._userMsg = null;
    this._lastBrainErr = '';
    this.enabled = false;
    this.game = null;
    this.time = 0;
    this.dt = 0;

    /* The fake controller the game reads instead of yours. */
    this._look = { x: 0, y: 0 };
    this.input = {
      move: { x: 0, y: 0 },
      pressed: {},
      down: {},
      consumeLook: () => this._look,
    };

    // the plan
    this.task = null;
    this.taskName = '';
    this.goal = null;             // 'silva' | 'shadow' | null
    this.goalFails = 0;
    this.sinceBoss = 0;
    this.lastActivity = '';
    this.lastBoss = null;
    this.stats = { kills: 0, deaths: 0, silva: 0, shadow: 0 };

    // what it wants this frame
    this.want = new Vector3();
    this.speed = 0;
    this.aimPoint = null;
    this._aimPointV = new Vector3();
    this.aimYaw = null;
    this.aimPitch = null;
    this.turnRate = 7;
    this.aimErr = 1;
    this.side = 1;
    this.sideT = 0;

    // memory
    this._said = new Map();
    this._lastSay = -99;
    this._lastBanter = 0;
    this._hp = 1;
    this._hurtSaid = -99;
    this._known = new WeakSet();
    this._deadT = 0;
    this._bossState = '';
    this._bossHpMark = 1;
    this._mine = [];              // what it spawned, to clean up later
  }

  /* ------------------------------ lifecycle ------------------------------ */

  setEnabled(on) {
    if (on === this.enabled) return;
    this.enabled = on;
    this.chat?.show(on);
    this.task = null;
    this._resetInput();
    if (on) {
      this.say(this.brain?.online ? 'AI play is on - thinking with Claude. Talk to me below.' : pick(LINES.hello), { force: true });
      this._brainT = 1.5;
      this._lastBanter = this.time;
      if (this.game) this._arrived();
    } else {
      this.say(pick(LINES.bye), { force: true });
    }
  }

  /** A new map has finished loading: this is the game now. */
  attach(game) {
    this.game = game;
    this._hp = 1;
    this._bossState = '';
    this._encState = '';
    this._bossHpMark = 1;
    this._mine = [];
    if (this.enabled) this._arrived();
  }

  detach() { this.game = null; }

  _arrived() {
    const id = this.game?.map?.id;
    this.event('Arrived on ' + (MAP_NAME[id] || id) + '.', true);
    if (this.brain?.online) return;
    const lines = LINES.arrive[id];
    if (lines) this.say(pick(lines), { force: true });
  }

  /* -------------------------------- talking ------------------------------ */

  say(text, { force = false, kind = '', gap = 2.2 } = {}) {
    if (!text || !this.chat) return;
    if (!force && this.time - this._lastSay < gap) return;
    this._lastSay = this.time;
    this._lastBanter = this.time;
    this.chat.push(text, kind);
  }

  /** A line from a list, not the one said last time from it. */
  line(list, vars, opts) {
    if (!list || !list.length) return;
    let text = pick(list);
    const last = this._said.get(list);
    if (list.length > 1 && text === last) text = list[(list.indexOf(text) + 1) % list.length];
    this._said.set(list, text);
    text = fill(text, vars);
    // every line is also a note of what just happened, for the brain
    this.event(text);
    /* Online, Claude does the talking; only the split-second callouts stay
       local, because by the time a reply came back the moment is gone. */
    if (this.brain?.online && !ESSENTIAL.has(list)) return;
    this.say(text, opts);
  }

  /** Something happened worth telling the brain about. */
  event(text, poke = false) {
    this.events.push({ t: this.time, text });
    if (this.events.length > 24) this.events.shift();
    if (poke) this._poke = true;
  }

  /** A thought, shown in the chat as one. */
  think(text) {
    if (!text || !this.chat) return;
    this.chat.push(text, 'think');
  }

  /** You, typing to it. */
  tell(text) {
    text = String(text || '').trim().slice(0, 240);
    if (!text) return;
    this.chat?.push(text, 'you');
    this.event('The viewer said: ' + text);
    if (this.brain?.online) { this._userMsg = text; this._poke = true; return; }
    this._offlineReply(text);
  }

  /* ------------------------------ the frame ------------------------------ */

  _resetInput() {
    const inp = this.input;
    inp.move.x = 0; inp.move.y = 0;
    inp.pressed = {};
    inp.down = {};
    this._look.x = 0; this._look.y = 0;
  }

  press(name) { this.input.pressed[name] = true; }
  hold(name) { this.input.down[name] = true; }

  get g() { return this.game; }
  get p() { return this.game?.player; }

  /**
   * One frame: think, then return the input the game should read instead of
   * the real controls.
   */
  update(dt) {
    this.dt = dt;
    this.time += dt;
    this._resetInput();
    const g = this.game, p = g?.player;
    if (!g || !p || g.travelling || !g.running) return this.input;

    this._watch(dt);

    // a cutscene has the controls: watch it
    if (g.cutscene) {
      if (!this._watching) { this._watching = true; this.line(LINES.cutscene, null, { force: true }); this._poke = true; }
      this._brainTick(dt);
      return this.input;
    }
    this._watching = false;

    // dead: a beat, then the respawn button
    if (p.dead) {
      if (this._deadT <= 0) {
        this._deadT = 2.6;
        this.stats.deaths++;
        this.line(LINES.died, null, { force: true });
        this._poke = true;
      }
      this._deadT -= dt;
      if (this._deadT <= 0.01) {
        this._deadT = 0;
        g.respawnPlayer();
        this.task = null;
        this._resume = null;
      }
      return this.input;
    }
    this._deadT = 0;

    // knocked over: ask to get up
    if (p.state !== STATE.CONTROLLED && p.state !== STATE.STUMBLE) {
      if (!this._downSaid) { this._downSaid = true; this.line(LINES.ragdoll, null, { gap: 6 }); }
      if (((this.time * 4) | 0) % 2 === 0) this.press('jump');
      return this.input;
    }
    this._downSaid = false;
    // left crouched (by you, before AI play was switched on): stand up
    if (p.crouchWant && !p.swimming) this.press('crouch');

    // a fight that has started is the only thing that matters
    const st = g.encounter?.state;
    if (st === 'fight' && this.taskName !== 'boss fight') { this.task = null; this._resume = null; }
    // things that come before whatever it was doing
    this._interrupts();

    if (!this.task) this._nextTask();
    this._clearIntent();
    if (this.task) {
      let r;
      try { r = this.task.next(); } catch (e) { console.warn('[autopilot]', this.taskName, e); r = { done: true }; }
      if (r.done) {
        this.task = null;
        const back = this._resume;
        this._resume = null;
        if (back && back.game === this.game) { this.task = back.task; this.taskName = back.name; }
      }
    }
    this._safety();
    this._apply(dt);
    this._banter();
    this._brainTick(dt);
    return this.input;
  }

  _clearIntent() {
    this.want.set(0, 0, 0);
    this.speed = 0;
    this.aimPoint = null;
    this.aimYaw = null;
    this.aimPitch = null;
    this.turnRate = 7;
  }

  /** Turns what it wants - a direction, a place to look - into stick and camera. */
  _apply(dt) {
    const g = this.game, p = g.player;
    // where to look
    let wy = g.camYaw, wp = g.camPitch;
    if (this.aimPoint) {
      const e = g.camera.position;
      const dx = this.aimPoint.x - e.x, dy = this.aimPoint.y - e.y, dz = this.aimPoint.z - e.z;
      wy = Math.atan2(-dx, -dz);
      wp = Math.atan2(dy, Math.hypot(dx, dz));
    } else if (this.aimYaw != null) {
      wy = this.aimYaw;
      wp = this.aimPitch != null ? this.aimPitch : -0.06;
    } else if (this.speed > 0.05 && this.want.lengthSq() > 1e-4) {
      wy = Math.atan2(-this.want.x, -this.want.z);
      wp = -0.06;
    }
    wp = clamp(wp, -1.4, 1.4);
    const k = 1 - Math.exp(-16 * dt);
    const cap = this.turnRate * dt;
    const dyaw = clamp(wrap(wy - g.camYaw) * k, -cap, cap);
    const dpit = clamp((wp - g.camPitch) * k, -cap, cap);
    this._look.x = -dyaw;
    this._look.y = -dpit;
    this.aimErr = Math.abs(wrap(wy - g.camYaw - dyaw)) + Math.abs(wp - g.camPitch - dpit);

    // where to go, relative to where the camera will be facing
    if (this.speed > 0.01 && this.want.lengthSq() > 1e-6) {
      const yaw = g.camYaw + dyaw;
      const s = Math.sin(yaw), c = Math.cos(yaw);
      const len = Math.hypot(this.want.x, this.want.z);
      const wx = this.want.x / len, wz = this.want.z / len;
      /* Walking is the stick most of the way over - just short of where it
         becomes a run. Pushing it half way, as this used to, crawls along at
         a metre a second: the slow walk. */
      const mag = this.speed >= 0.8 ? 1 : 0.76;
      this.input.move.y = (wx * -s + wz * -c) * mag;
      this.input.move.x = (wx * c + wz * -s) * mag;
    }
    void p;
  }

  /* ---------------------------- intent helpers --------------------------- */

  /** Push the stick toward a point (flat), running unless told not to. */
  moveToward(x, z, run = true) {
    const p = this.p;
    this.want.set(x - p.pos.x, 0, z - p.pos.z);
    this.speed = run ? 1 : 0.6;
  }

  moveDir(x, z, run = true) {
    this.want.set(x, 0, z);
    this.speed = run ? 1 : 0.6;
  }

  lookAt(v) { this._aimPointV.copy(v); this.aimPoint = this._aimPointV; }

  *wait(sec, fn = null) {
    let t = 0;
    while (t < sec) { t += this.dt; if (fn) fn(); yield; }
  }

  feet() { return this.p.pos.y - HIP; }

  /* ------------------------------ navigation ----------------------------- */

  /**
   * Walks to (x, z). Plans round things on the nav grid when the straight
   * line is blocked; `direct` steers straight there (down stairs, through
   * water - places the grid does not know). Jumps when stuck, sidesteps if
   * that does not work. Returns whether it got there.
   */
  *goTo(x, z, { arrive = 0.9, run = true, timeout = 45, direct = false, look = null, onStep = null } = {}) {
    const path = [];
    let idx = 0, repath = 0, t = 0;
    let checkT = 0, lastX = this.p.pos.x, lastZ = this.p.pos.z, stuck = 0, side = 0, sideT = 0;
    while (true) {
      const g = this.game, p = g.player;
      const dx = x - p.pos.x, dz = z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < arrive) return true;
      t += this.dt;
      if (t > timeout) return false;
      if (!direct) {
        repath -= this.dt;
        if (repath <= 0) {
          repath = 1.4;
          path.length = 0; idx = 0;
          if (g.nav.lineClearWorld(p.pos.x, p.pos.z, x, z)) path.push(new Vector3(x, 0, z));
          else if (!g.nav.findPath(p.pos.x, p.pos.z, x, z, path)) path.push(new Vector3(x, 0, z));
          // the last point of a plan is the nearest free cell; the real goal is where we are going
          if (path.length) path[path.length - 1].set(x, 0, z);
        }
      }
      let tx = x, tz = z;
      if (!direct && path.length) {
        while (idx < path.length - 1 && Math.hypot(path[idx].x - p.pos.x, path[idx].z - p.pos.z) < 0.75) idx++;
        tx = path[idx].x; tz = path[idx].z;
      }
      if (sideT > 0) {
        sideT -= this.dt;
        const ux = (tx - p.pos.x) / (Math.hypot(tx - p.pos.x, tz - p.pos.z) || 1);
        const uz = (tz - p.pos.z) / (Math.hypot(tx - p.pos.x, tz - p.pos.z) || 1);
        this.moveDir(-uz * side + ux * 0.3, ux * side + uz * 0.3, run);
      } else {
        // anything more than a few steps away is a run, whatever was asked
        this.moveToward(tx, tz, (run || d > 3.5) && d > 1.6);
      }
      if (look) this.lookAt(look);
      if (onStep) onStep(d);
      // stuck?
      checkT += this.dt;
      if (checkT > 0.7) {
        const moved = Math.hypot(p.pos.x - lastX, p.pos.z - lastZ);
        checkT = 0; lastX = p.pos.x; lastZ = p.pos.z;
        if (moved < 0.3 && sideT <= 0) {
          stuck++;
          this.press('jump');
          if (stuck >= 2) { side = Math.random() < 0.5 ? -1 : 1; sideT = 0.7; repath = 0; stuck = 0; }
        } else if (moved > 0.6) stuck = 0;
      }
      yield;
    }
  }

  /* ------------------------------- the plan ------------------------------ */

  _start(name, gen) {
    this.taskName = name;
    this._resume = null;
    const self = this;
    this.task = (function* run() {
      try { yield* gen; } catch (e) { console.warn('[autopilot]', name, e); }
      void self;
    })();
  }

  _inPit() { return this.game.map.id === 'pitvalley' && this.feet() < -1.5; }

  _nextTask() {
    const g = this.game, p = g.player, id = g.map.id, enc = g.encounter;
    if (enc && enc.state === 'fight') return this._start('boss fight', this.bossFight());
    if (id === 'redplains' && enc?.state === 'won') return this._start('claim', this.claimReward());
    // the secret maps are only for the fights in them
    if (id === 'redplains' && enc?.state === 'waiting') this.goal = 'silva';
    if (id === 'darklegacy' && enc?.state === 'waiting') this.goal = 'shadow';
    if (id === 'darklegacy' && enc?.state === 'won' && this.goal === 'shadow') this.goal = null;
    if (this._inPit() && this.goal !== 'silva') return this._start('leave pit', this.leavePit());
    if (p.water && (id === 'legacy' || id === 'darklegacy') && !(this.goal === 'shadow' && id === 'legacy')) {
      return this._start('swim out', this.swimToShore());
    }
    if (this.goalFails >= 3) { this.goal = null; this.goalFails = 0; }

    // what the brain (or you) asked for, unless it is in the middle of a run
    const asked = this._takeBrainAction();
    if (asked && (!this.goal || asked.forced || asked.action.startsWith('fight_'))) {
      if (!asked.action.startsWith('fight_')) this.goal = null;
      this.lastActivity = asked.action;
      return this._startBrainAction(asked.action);
    }

    if (this.goal === 'silva') {
      if (id === 'pitvalley') return this._start('egg', this.eggRun());
      if (id === 'redplains') return this._start('orb', this.orbRun());
      return this._start('travel', this.travelTask('pitvalley'));
    }
    if (this.goal === 'shadow') {
      if (id === 'legacy') return this._start('grate', this.grateRun());
      if (id === 'darklegacy') return this._start('tower', this.towerRun());
      return this._start('travel', this.travelTask('legacy'));
    }
    if (id === 'redplains' || id === 'darklegacy') {
      // nothing left to do here: somewhere else
      return this._start('travel', this.travelTask(pick(MENU_MAPS)));
    }

    // a boss, now and then, more likely the longer it has been
    this.sinceBoss++;
    if (this.sinceBoss > 2 && Math.random() < 0.1 + this.sinceBoss * 0.08) {
      this.sinceBoss = 0;
      let boss = isUnlocked('firefist') ? (this.lastBoss === 'shadow' ? 'silva' : 'shadow') : 'silva';
      if (this.lastBoss === boss && Math.random() < 0.6) boss = boss === 'silva' ? 'shadow' : 'silva';
      this.lastBoss = boss;
      this.goal = boss;
      this.goalFails = 0;
      if (!this.brain?.online) this.think(pick(THOUGHTS.boss));
      this.line(LINES.bossDecide[boss], null, { force: true });
      return this._nextTask();
    }

    const acts = [
      ['explore', 2], ['rcv2', 2], ['guns', 3], ['melee', 2], ['horde', 2], ['armour', 1],
      ['flamer', 1.2], ['officer', 1], ['travel', 1.1], ['cleanup', this._mine.length > 6 ? 3 : 0.3],
    ];
    if (isUnlocked('firefist')) acts.push(['firefist', 1.4]);
    if (id === 'legacy') acts.push(['swim', 1]);
    let total = 0;
    for (const a of acts) if (a[0] !== this.lastActivity) total += a[1];
    let r = Math.random() * total, choice = 'explore';
    for (const a of acts) {
      if (a[0] === this.lastActivity) continue;
      r -= a[1];
      if (r <= 0) { choice = a[0]; break; }
    }
    this.lastActivity = choice;
    return this.startActivity(choice, true);
  }

  /** Starts one activity by name. */
  startActivity(choice, mused = false) {
    const id = this.game.map.id;
    if (mused && !this.brain?.online) this._muse(choice);
    switch (choice) {
      case 'explore': return this._start('explore', this.explore());
      case 'rcv2': return this._start('rcv2', this.rcvPlay());
      case 'guns': return this._start('guns', this.gunRange(pick(['glock', 'ak47', 'm16', 'mossberg', 'mossberg'])));
      case 'melee': return this._start('melee', this.meleeFight(pick(['machete', 'sledge', 'crowbar'])));
      case 'horde': return this._start('horde', this.horde());
      case 'armour': return this._start('armour',
        this.armUp({ gun: null, armour: [Math.random() < 0.4 ? 'vest' : 'mvest', 'neckguard', 'helmet'] }));
      case 'flamer': return this._start('flamer', this.gunRange('flamethrower'));
      case 'officer': return this._start('officer', this.officerDemo());
      case 'firefist': return this._start('firefist', this.fireFistPlay());
      case 'swim': return this._start('swim', this.swim());
      case 'cleanup': return this._start('cleanup', this.cleanup());
      case 'travel': {
        const others = MENU_MAPS.filter((m) => m !== id);
        return this._start('travel', this.travelTask(pick(others)));
      }
      case 'silva': case 'shadow':
        this.goal = choice; this.goalFails = 0; this.lastBoss = choice;
        this.line(LINES.bossDecide[choice], null, { force: true });
        this.task = null;
        return this._nextTask();
      default: return this._start('explore', this.explore());
    }
  }

  /** An offline thought about what it is about to do. */
  _muse(choice) {
    const list = THOUGHTS[choice];
    if (list) this.think(fill(pick(list), { item: 'gun' }));
  }

  /* ------------------------------ interrupts ----------------------------- */

  /** Something is attacking it: deal with that before anything else. */
  _interrupts() {
    if (this.task && SELF_DEFENDED.has(this.taskName)) return;
    const t = this._nearestThreat(7);
    if (!t) return;
    if (t.ai?.isOfficer) this.line(LINES.officerFight, null, { force: true });
    // whatever it was doing carries on once this is dealt with
    const was = this.task ? { task: this.task, name: this.taskName, game: this.game } : null;
    this._start('defend', this.defend());
    this._resume = was;
  }

  _isThreat(c) {
    const p = this.p;
    if (c === p || c.dead || c.body?.destroyed) return false;
    if (c.isZombie) return true;
    if (c.ai?.isOfficer) return c.ai.hostile && c.ai.target === p;
    // a citizen who has decided to fight it
    return c.ai?.state === 'fight' && c.ai.threat === p && !c.isDown;
  }

  _nearestThreat(range) {
    const p = this.p;
    let best = null, bd = range;
    for (const c of this.game.characters) {
      if (!this._isThreat(c)) continue;
      const d = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
      // an officer with a gun is a threat from much further off
      const dd = c.ai?.isOfficer ? d * 0.4 : d;
      if (dd < bd) { bd = dd; best = c; }
    }
    return best;
  }

  /** Keeps its head above water when the air is going. */
  _safety() {
    const p = this.p;
    if (p.underwater && p.air < 0.3) {
      this.hold('jump');
      this.input.down.crouch = false;
      if (!this._airSaid) { this._airSaid = true; this.line(LINES.air, null, { force: true }); }
    } else if (!p.underwater) this._airSaid = false;
  }

  /* ------------------------------- watching ------------------------------ */

  /** Kills, hits, the boss's moves: things worth a word. */
  _watch(dt) {
    const g = this.game, p = g.player;
    // its own health
    const hp = p.health / p.maxHealth;
    if (hp < this._hp - 0.12 && this.time - this._hurtSaid > 5 && !p.dead) {
      this._hurtSaid = this.time;
      this.line(hp < 0.3 ? LINES.lowHp : LINES.hurt, null, { gap: 1.5 });
    }
    this._hp = hp;
    // kills
    for (const c of g.characters) {
      if (c === p || !c.dead || this._known.has(c)) continue;
      this._known.add(c);
      if (c.lastAttacker !== p) continue;
      this.stats.kills++;
      this._poke = this._poke || Math.random() < 0.5;
      const list = c.isZombie ? LINES.killMutant : c.ai?.isOfficer ? LINES.killOfficer : LINES.kill;
      this.line(list, null, { gap: 1.2 });
    }
    // the boss
    const enc = g.encounter, b = enc?.boss;
    if (enc && enc.state !== this._encState) {
      if (enc.state === 'won' && this._encState === 'fight') {
        const who = g.map.id === 'redplains' ? 'silva' : 'shadow';
        this.stats[who]++;
        this._poke = true;
        this.line(LINES.bossWin[who], null, { force: true, kind: 'win' });
        if (who === 'shadow') this.goal = null;
      }
      this._encState = enc.state;
    }
    if (b && enc.state === 'fight') {
      if (b.state !== this._bossState) {
        this._bossState = b.state;
        const call = LINES.callout[b.state];
        if (call) this.line(call, null, { force: true, kind: 'call' });
      }
      const f = b.hp / b.maxHp;
      if (f < 0.5 && this._bossHpMark > 0.5) { this._bossHpMark = 0.5; this.line(LINES.bossHalf, null, { force: true }); }
      if (f < 0.25 && this._bossHpMark > 0.25) { this._bossHpMark = 0.25; this.line(LINES.bossQuarter, null, { force: true }); }
    }
    void dt;
  }

  _banter() {
    if (this.brain?.online) return;
    if (this.time - this._lastBanter > 26 + Math.random() * 10) this.line(LINES.idle, null, { gap: 6 });
  }

  /* ------------------------------- the brain ----------------------------- */

  /** Every so often, or when something happens, asks Claude what next. */
  _brainTick(dt) {
    const b = this.brain;
    if (!b?.online) return;
    if (b.lastError && b.lastError !== this._lastBrainErr) {
      this._lastBrainErr = b.lastError;
      this.chat?.push(b.lastError, 'sys');
    }
    this._brainT -= dt;
    const due = this._brainT <= 0 || (this._poke && this._brainT < this.thinkEvery() - 3);
    if (!due || !b.ready()) return;
    this._brainT = this.thinkEvery();
    this._poke = false;
    const asked = this._userMsg;
    this._userMsg = null;
    const game = this.game;
    b.ask(this.describe(asked)).then((r) => {
      if (!r || !this.enabled) return;
      if (r.thinking) this.think(r.thinking.length > 220 ? r.thinking.slice(0, 217).trimEnd() + '...' : r.thinking);
      else if (r.intent) this.think(r.intent);
      if (r.say) { this.say(r.say, { force: true }); this.event('You said: ' + r.say); }
      if (r.action && r.action !== 'continue') {
        this._pending = { action: r.action, at: this.time, forced: !!r.now || !!asked };
        // asked to do something else right now: drop what it is doing, unless
        // that is a fight already under way or a map that has gone
        if (this._pending.forced && this.game === game && !UNSTOPPABLE.has(this.taskName)) {
          this.task = null;
          this._resume = null;
        }
      }
    });
  }

  /** The game, right now, in words. */
  describe(viewer = null) {
    const g = this.game, p = g.player;
    const lines = [];
    const mins = Math.floor(this.time / 60), secs = Math.floor(this.time % 60);
    lines.push(`Session time ${mins}m${secs}s. Map: ${MAP_NAME[g.map.id] || g.map.id}.`);
    const worn = Object.values(p.worn).filter(Boolean);
    const armour = worn.length
      ? worn.map((a) => ARMOUR[a.kind]?.label || a.kind).join(', ') +
        ` (${Math.round(worn.reduce((n, a) => n + a.hp, 0))}/${Math.round(worn.reduce((n, a) => n + a.maxHp, 0))})`
      : 'none';
    const gun = g.carried ? CARRY[g.carried.kind]?.label + (GUNS[g.carried.kind]
      ? ` (${g.carried.ammo}/${GUNS[g.carried.kind].capacity})` : '') : 'nothing';
    lines.push(`You: health ${Math.round(p.health)}/${Math.round(p.maxHealth)}${p.dead ? ' (DEAD)' : ''}, armour ${armour}, ` +
      `carrying ${gun}, in hand: ${g.equipped}${p.swimming ? ', swimming' : ''}${p.underwater ? `, underwater (air ${Math.round(p.air * 100)}%)` : ''}.`);
    lines.push(`Fire Fist ${isUnlocked('firefist') ? 'unlocked' : 'locked'}. This session: ${this.stats.kills} kills, ` +
      `${this.stats.deaths} deaths, Silva beaten ${this.stats.silva}x, Shadow Mutant beaten ${this.stats.shadow}x.`);
    lines.push(`Doing now: ${this.taskName || 'nothing'}${this.goal ? ` (on the way to fight ${this.goal === 'silva' ? 'Silva' : 'the Shadow Mutant'})` : ''}.`);
    // who is about
    const counts = {};
    let nearest = null, nd = Infinity;
    for (const c of g.characters) {
      if (c === p || c.dead) continue;
      const kind = c.isZombie ? 'Mutant' : c.ai?.isOfficer ? (c.ai.hostile && c.ai.target === p ? 'Officer (shooting at you)' : 'Officer') : 'citizen';
      counts[kind] = (counts[kind] || 0) + 1;
      const d = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
      if (d < nd) { nd = d; nearest = kind; }
    }
    const who = Object.entries(counts).map(([k, n]) => `${n} ${k}${n > 1 && !k.includes('(') ? 's' : ''}`).join(', ');
    lines.push(`Around you: ${who || 'nobody alive'}${nearest ? ` (nearest: ${nearest}, ${nd.toFixed(0)} m)` : ''}; ` +
      `${g.spawnedBodies.length} loose objects.`);
    const enc = g.encounter, b = enc?.boss;
    if (b) {
      const name = g.map.id === 'redplains' ? 'Silva' : 'Shadow Mutant';
      lines.push(`Boss: ${name}, encounter ${enc.state}, ${Math.round(b.hp)}/${b.maxHp} HP, doing: ${b.state}.`);
    }
    if (g.cutscene) lines.push('A cutscene is playing.');
    const ev = this.events.slice(-12).map((e) => `- ${Math.max(0, Math.round(this.time - e.t))}s ago: ${e.text}`);
    if (ev.length) lines.push('Recent events, oldest first:\n' + ev.join('\n'));
    const said = (this.chat?.log || []).slice(-6);
    if (said.length) lines.push('Recent chat (yours unless marked):\n' + said.map((t) => '- ' + t).join('\n'));
    lines.push('Actions you can pick:\n' + Object.entries(BRAIN_ACTIONS).map(([k, v]) => `- ${k}: ${v}`).join('\n'));
    if (viewer) lines.push(`The viewer just wrote to you: "${viewer}"`);
    else lines.push('Nobody has written to you. Say something if you want to, and decide what to do next.');
    return lines.join('\n\n');
  }

  /** Takes the brain's decision, if it is still fresh. */
  _takeBrainAction() {
    const a = this._pending;
    this._pending = null;
    if (!a || this.time - a.at > 90) return null;
    return a;
  }

  /** Starts what the brain picked. */
  _startBrainAction(name) {
    const id = this.game.map.id;
    const [kind, what] = name.split('_');
    if (kind === 'guns') return this._start('guns', this.gunRange(what));
    if (kind === 'melee') return this._start('melee', this.meleeFight(what));
    if (kind === 'travel') return this._start('travel', this.travelTask(what));
    if (name === 'fight_silva') return this.startActivity('silva');
    if (name === 'fight_shadow') return this.startActivity('shadow');
    if (name === 'flamethrower') return this.startActivity('flamer');
    if (name === 'swim' && id !== 'legacy') return this._start('travel', this.travelTask('legacy'));
    if (name === 'firefist' && !isUnlocked('firefist')) {
      this.say('No Fire Fist yet - Silva has it. Going to get it.', { force: true });
      return this.startActivity('silva');
    }
    return this.startActivity(name);
  }

  /**
   * Offline, it still listens: it picks out what you asked for and does it,
   * and tells you it is playing on instinct.
   */
  _offlineReply(text) {
    const t = text.toLowerCase();
    const want = [
      [/silva|red plains|pit egg|red rcv2/, 'fight_silva'], [/shadow|dark legacy|grate|tentacle/, 'fight_shadow'],
      [/shotgun|mossberg/, 'guns_mossberg'], [/\bak\b|ak-?47/, 'guns_ak47'], [/m16/, 'guns_m16'],
      [/glock|pistol/, 'guns_glock'], [/flame/, 'flamethrower'], [/machete/, 'melee_machete'],
      [/sledge|hammer/, 'melee_sledge'], [/crowbar/, 'melee_crowbar'], [/fire ?fist|fireball/, 'firefist'],
      [/officer|police|cop/, 'officer'], [/horde|zombie|mutant/, 'horde'], [/armou?r|vest|helmet/, 'armour'],
      [/rcv2|throw|grab|crate/, 'rcv2'], [/clean|delete/, 'cleanup'], [/swim|dive|lake/, 'swim'],
      [/plains|baseplate/, 'travel_baseplate'], [/pit valley/, 'travel_pitvalley'], [/legacy/, 'travel_legacy'],
      [/explore|walk|look around/, 'explore'],
    ];
    const hit = want.find(([re]) => re.test(t));
    if (hit) {
      this.say(pick(['On it.', 'Sure thing.', 'You got it.', 'Okay, doing that.']) + ' (' + BRAIN_ACTIONS[hit[1]] + ')', { force: true });
      this._pending = { action: hit[1], at: this.time, forced: true };
      if (!UNSTOPPABLE.has(this.taskName)) { this.task = null; this._resume = null; }
      return;
    }
    this.say(pick([
      'I can only follow simple requests offline - add a Claude API key in Settings and I can talk about anything.',
      'Offline, I mostly understand things like "fight Silva", "go to Legacy" or "use the shotgun".',
    ]), { force: true });
  }

  /* ============================== activities ============================== */

  *travelTask(id) {
    const g = this.game;
    if (g.map.id === id) return;
    this.line(LINES.travel, { map: MAP_NAME[id] || id }, { force: true });
    yield* this.wait(1.2);
    if (this.game !== g) return;
    g.travel(id, 'The AI picked ' + (MAP_NAME[id] || id));
    // the next game takes over from here; nothing else to do in this one
    while (this.game === g) yield;
  }

  /** Visits two or three places worth seeing, and says what they are. */
  *explore() {
    this.line(LINES.explore);
    const g = this.game, lm = g.map.landmarks || {};
    const named = [];
    const NAMES = { tower: 'tower', rampFoot: 'tower ramp', hotelDoor: 'hotel', garage: 'garage', bridge: 'stone bridge',
      tent: 'military tent', crane: 'crane', beach: 'beach', walkBeach: 'walkway', walkEast: 'walkway' };
    for (const [k, v] of Object.entries(lm)) {
      if (!(v instanceof Vector3) || !NAMES[k]) continue;
      if (g.nav.isBlockedWorld(v.x, v.z) && !g.nav.nearestFree(v.x, v.z)) continue;
      named.push({ x: v.x, z: v.z, name: NAMES[k] });
    }
    const stops = [];
    for (let i = 0; i < 3; i++) {
      if (named.length && Math.random() < 0.6) stops.push(named.splice((Math.random() * named.length) | 0, 1)[0]);
      else {
        const pt = this._randomPoint();
        if (pt) stops.push(pt);
      }
    }
    for (const s of stops) {
      const ok = yield* this.goTo(s.x, s.z, { arrive: 2.2, timeout: 30 });
      if (ok && s.name) this.line(LINES.landmark, { name: s.name }, { gap: 3 });
      // a look round
      const yaw0 = this.game.camYaw;
      yield* this.wait(1.4, () => { this.aimYaw = yaw0 + Math.sin(this.time * 1.3) * 0.9; this.aimPitch = 0.02; });
    }
  }

  _randomPoint() {
    const g = this.game, half = (g.map.half || 40) - 5;
    for (let i = 0; i < 30; i++) {
      const x = (Math.random() * 2 - 1) * half, z = (Math.random() * 2 - 1) * half;
      if (!g.nav.isBlockedWorld(x, z) && g.world.hasGroundAt(x, z)) return { x, z };
    }
    return null;
  }

  /** A clear direction to spawn in: looks for open ground in front. */
  _clearYaw() {
    const g = this.game, p = g.player;
    let best = g.camYaw, bestScore = -1;
    for (let i = 0; i < 12; i++) {
      const yaw = g.camYaw + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (TAU / 12);
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      let score = 0;
      for (let d = 1; d <= 5; d++) {
        const x = p.pos.x + fx * d, z = p.pos.z + fz * d;
        if (g.nav.isBlockedWorld(x, z) || !g.world.hasGroundAt(x, z)) break;
        score++;
      }
      if (score > bestScore) { bestScore = score; best = yaw; }
      if (score >= 5) break;
    }
    return best;
  }

  *equip(name) {
    const g = this.game;
    if (g.equipped !== name) {
      g.setEquipped(name);
      yield* this.wait(0.25);
    }
    return g.equipped === name;
  }

  /**
   * Spawns something with the RCV2, the way you would: RCV2 out, pick it in
   * the menu, look at the ground ahead, press +. Returns what appeared.
   */
  *spawn(id, { pitch = -0.32, yaw = null } = {}) {
    const g = this.game;
    yield* this.equip('rcv2');
    if (g.equipped !== 'rcv2') return null;
    const item = g.setSelected(id);
    this.hud?.setSelectedItem(item.name);
    const want = yaw != null ? yaw : this._clearYaw();
    yield* this.wait(0.45, () => { this.aimYaw = want; this.aimPitch = pitch; });
    const bodies = new Set(g.spawnedBodies), people = new Set(g.characters);
    this.press('spawn');
    yield;
    if (this.game !== g) return null;
    const body = g.spawnedBodies.find((b) => !bodies.has(b));
    const c = g.characters.find((x) => !people.has(x));
    const got = body || c || null;
    if (got) this._mine.push(got);
    return got;
  }

  /** Walks up to a thing on the ground and presses USE on it. */
  *useOn(body, { tries = 3 } = {}) {
    const g = this.game;
    for (let i = 0; i < tries; i++) {
      if (!g.spawnedBodies.includes(body)) return true;
      yield* this.goTo(body.pos.x, body.pos.z, { arrive: 0.95, run: false, timeout: 8 });
      if (!g.spawnedBodies.includes(body)) return true;
      yield* this.wait(0.3, () => { this.lookAt(body.pos); });
      if (g.pickupInReach() !== body && i < tries - 1) {
        // step closer and look straight at it
        yield* this.goTo(body.pos.x, body.pos.z, { arrive: 0.45, run: false, timeout: 3 });
        yield* this.wait(0.2, () => { this.lookAt(body.pos); });
      }
      this.press('use');
      yield; yield;
      if (!g.spawnedBodies.includes(body)) return true;
    }
    return !g.spawnedBodies.includes(body);
  }

  /** Spawns a weapon and picks it up. */
  *getWeapon(kind) {
    const g = this.game;
    if (g.carried?.kind === kind) return true;
    if (g.carried) { this.press('use'); yield; yield* this.wait(0.3); }
    for (let i = 0; i < 2; i++) {
      const body = yield* this.spawn(kind);
      if (!body) continue;
      yield* this.wait(0.35);
      yield* this.useOn(body);
      if (g.carried?.kind === kind) {
        const i2 = this._mine.indexOf(body);
        if (i2 >= 0) this._mine.splice(i2, 1);
        const spec = GUNS[kind];
        this.line(LINES.gunOn, { item: CARRY[kind].label, ammo: spec ? g.carried.ammo : '' });
        return true;
      }
    }
    return false;
  }

  /**
   * Gets ready for a fight: the best armour in every slot, then a gun. Hands
   * have to be empty to put armour on (USE with something in hand drops it),
   * so whatever is held goes down first.
   */
  *armUp({ gun = 'ak47', armour = ['mvest', 'neckguard', 'helmet'] } = {}) {
    const g = this.game, p = g.player;
    this.line(LINES.armUp, null, { force: true });
    const need = armour.filter((id) => p.worn[ARMOUR[id].slot]?.kind !== id);
    if (need.length && g.carried) { this.press('use'); yield; yield* this.wait(0.35); }
    for (const id of need) {
      for (let i = 0; i < 2; i++) {
        if (p.worn[ARMOUR[id].slot]?.kind === id) break;
        const body = yield* this.spawn(id);
        if (!body) continue;
        yield* this.wait(0.35);
        yield* this.useOn(body);
        if (p.worn[ARMOUR[id].slot]?.kind === id) {
          const i2 = this._mine.indexOf(body);
          if (i2 >= 0) this._mine.splice(i2, 1);
          this.line(LINES.armourOn, { item: ARMOUR[id].label });
        }
      }
      if (this.game !== g) return;
    }
    if (gun) {
      yield* this.getWeapon(gun);
      yield* this.topUp();
    }
  }

  /** A gun that is not full gets a fresh magazine, while there is time. */
  *topUp() {
    const g = this.game, c = g.carried, spec = c && GUNS[c.kind];
    if (!spec || c.ammo >= spec.capacity) return;
    yield* this.equip(c.kind);
    this.press('reload');
    yield;
    yield* this.wait(0.2);
    while (g.reloadTimer > 0) yield;
  }

  /* ------------------------------- shooting ------------------------------ */

  _clearShot(to) {
    const g = this.game, e = g.camera.position;
    _v1.subVectors(to, e);
    const d = _v1.length();
    if (d < 0.5) return true;
    _v1.multiplyScalar(1 / d);
    const hit = g.world.raycastStatic(e, _v1, d - 0.4);
    return !hit;
  }

  /**
   * Pulls the trigger when the aim is on: holds it down for a full auto,
   * taps for a pistol, swings for a blade or a fist. Reloads on empty.
   */
  _fire(dist, { tol = 0.07, clear = true } = {}) {
    const g = this.game, name = g.equipped, spec = GUNS[name];
    this._fireT = (this._fireT || 0) - this.dt;
    if (spec && g.carried) {
      if (g.carried.ammo <= 0) {
        if (!(g.reloadTimer > 0) && this._fireT <= 0) {
          this.press('reload');
          this._fireT = 0.5;
          this.line(LINES.reload, null, { gap: 4 });
        }
        return;
      }
      if (!clear || this.aimErr > tol * (spec.flame ? 3 : 1) || dist > spec.range) return;
      if (spec.auto) { this.hold('primary'); if (this._fireT <= 0) { this.press('primary'); this._fireT = 0.1; } }
      else if (this._fireT <= 0) { this.press('primary'); this._fireT = 0.17 + Math.random() * 0.12; }
      return;
    }
    if (name === 'firefist') {
      if (this.aimErr > tol * 2 || this._fireT > 0) return;
      if (dist > 2.2) { if (clear) { this.press('fireball'); this._fireT = 0.6; } }
      else { this.press('primary'); this._fireT = 0.35; }
      return;
    }
    if (name === 'rcv2') return;
    // fists and blades
    if (dist < 1.3 && this.aimErr < 0.4 && this._fireT <= 0) {
      this.press('primary');
      this._fireT = MELEE[name] ? 0.45 : 0.32;
    }
  }

  _closest(filter, range = Infinity) {
    const p = this.p;
    let best = null, bd = range;
    for (const c of this.game.characters) {
      if (c === p || c.body?.destroyed || !filter(c)) continue;
      const d = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  _targets(filter) {
    const p = this.p;
    return this.game.characters.filter((c) => c !== p && !c.dead && !c.body?.destroyed && filter(c));
  }

  /**
   * Fights whoever `filter` picks until they are dead, the time runs out or
   * there is nobody left. Guns keep their distance and strafe; blades and
   * fists close in.
   */
  *combat(filter, { timeout = 40 } = {}) {
    let t = 0;
    const chest = new Vector3();
    while (t < timeout) {
      t += this.dt;
      const g = this.game, p = g.player;
      const list = this._targets(filter);
      if (!list.length) return true;
      let tgt = null, bd = Infinity;
      for (const c of list) {
        const d = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
        if (d < bd) { bd = d; tgt = c; }
      }
      tgt.chestPosition(chest);
      if (tgt.isDown) chest.y = Math.min(chest.y, tgt.pos.y);
      const d = bd;
      const spec = GUNS[g.equipped];
      const ranged = !!spec || g.equipped === 'firefist';
      this.turnRate = 9;
      this.lookAt(chest);
      if (ranged) {
        const want = spec?.flame ? 4 : spec?.pellets ? 4.5 : g.equipped === 'firefist' ? 6 : 8;
        this._strafeAround(tgt.pos, d, want, 0.7);
        // anything with claws that close: back off from it first
        const near = this._closest((c) => c.isZombie && !c.dead, 2.6);
        if (near && !spec?.flame) {
          const nx = p.pos.x - near.pos.x, nz = p.pos.z - near.pos.z;
          this.want.x += nx * 2; this.want.z += nz * 2;
        }
        this._fire(d, { clear: this._clearShot(chest) });
      } else {
        if (d > 0.85) this.moveToward(tgt.pos.x, tgt.pos.z, d > 1.8);
        this._fire(d);
      }
      this._stuckJump();
      yield;
    }
    return false;
  }

  /** Circle a point at about `want` metres, swapping direction now and then. */
  _strafeAround(at, d, want, strafe = 1) {
    const p = this.p;
    this.sideT -= this.dt;
    if (this.sideT <= 0) { this.sideT = 1.1 + Math.random() * 1.8; if (Math.random() < 0.6) this.side = -this.side; }
    const ux = (at.x - p.pos.x) / (d || 1), uz = (at.z - p.pos.z) / (d || 1);
    const radial = clamp((d - want) / 3, -1, 1);
    let x = -uz * this.side * strafe + ux * radial * 1.3;
    let z = ux * this.side * strafe + uz * radial * 1.3;
    // do not strafe into something
    const g = this.game;
    const l = Math.hypot(x, z) || 1;
    if (g.nav.isBlockedWorld(p.pos.x + (x / l) * 1.2, p.pos.z + (z / l) * 1.2)) {
      this.side = -this.side; this.sideT = 1.2;
      x = -uz * this.side * strafe + ux * radial * 1.3;
      z = ux * this.side * strafe + uz * radial * 1.3;
    }
    this.moveDir(x, z, true);
  }

  _stuckJump() {
    const p = this.p;
    this._sjT = (this._sjT || 0) + this.dt;
    if (this._sjT < 0.6) return;
    const moved = this._sjP ? Math.hypot(p.pos.x - this._sjP.x, p.pos.z - this._sjP.z) : 1;
    this._sjP = this._sjP || new Vector3();
    this._sjP.copy(p.pos);
    this._sjT = 0;
    if (this.speed > 0.5 && moved < 0.25) { this.press('jump'); this.side = -this.side; }
  }

  /* --------------------------- sandbox activities ------------------------ */

  *defend() {
    const g = this.game;
    if (!GUNS[g.equipped] && !MELEE[g.equipped] && g.equipped !== 'firefist') {
      if (g.carried) g.setEquipped(g.carried.kind);
      else if (isUnlocked('firefist')) g.setEquipped('firefist');
      else g.setEquipped('fists');
    }
    yield* this.combat((c) => this._isThreat(c), { timeout: 30 });
  }

  /** Spawn a few things and throw them about with the RCV2, then clear up. */
  *rcvPlay() {
    this.line(LINES.rcv2);
    const g = this.game;
    if (g.carried) { this.press('use'); yield; yield* this.wait(0.3); }
    const things = [];
    for (const id of ['crate', 'crate', 'boulder']) {
      const b = yield* this.spawn(id, { pitch: -0.2 });
      if (b) things.push(b);
      yield* this.wait(0.3);
    }
    if (Math.random() < 0.6) {
      const c = yield* this.spawn('citizen', { pitch: -0.15 });
      if (c) things.push(c);
    }
    yield* this.wait(0.6);
    for (const th of things) {
      if (this.game !== g) return;
      const at = th.center || th.pos;
      if (!at) continue;
      // grab it
      let grabbed = false;
      for (let i = 0; i < 3 && !grabbed; i++) {
        yield* this.equip('rcv2');           // a fight may have put it away
        yield* this.wait(0.35, () => { this.lookAt(th.center || th.pos); this.turnRate = 6; });
        this.press('primary');
        yield;
        grabbed = g.rcv2.holding;
      }
      if (!grabbed) continue;
      this.line(LINES.grab, null, { gap: 3 });
      // swing it round and let go part way
      const y0 = g.camYaw, dir = Math.random() < 0.5 ? -1 : 1;
      yield* this.wait(0.5, () => { this.aimYaw = y0 + dir * 0.4; this.aimPitch = 0.15; });
      let t = 0;
      while (t < 0.35) {
        t += this.dt;
        this.aimYaw = y0 - dir * 1.4; this.aimPitch = 0.35; this.turnRate = 14;
        yield;
      }
      this.press('primary');
      this.line(LINES.fling, null, { gap: 2 });
      yield* this.wait(1.2);
    }
    if (Math.random() < 0.7) yield* this.cleanup(things);
  }

  /** Deletes what it spawned with the RCV2 (or the list given). */
  *cleanup(list = null) {
    const g = this.game;
    const todo = (list || this._mine).filter((e) => g.spawnedBodies.includes(e) || g.characters.includes(e));
    if (!todo.length) { this._mine = []; return; }
    this.line(LINES.delete, null, { gap: 3 });
    if (!(yield* this.equip('rcv2'))) return;
    for (const e of todo) {
      if (this.game !== g) return;
      if (!g.spawnedBodies.includes(e) && !g.characters.includes(e)) continue;
      const at = () => e.center || e.pos;
      const gone = () => !g.spawnedBodies.includes(e) && !g.characters.includes(e);
      for (let i = 0; i < 3 && !gone(); i++) {
        const d0 = Math.hypot(at().x - g.player.pos.x, at().z - g.player.pos.z);
        if (d0 > 8 - i * 2.5) yield* this.goTo(at().x, at().z, { arrive: 6 - i * 2.5, timeout: 10 });
        yield* this.equip('rcv2');
        yield* this.wait(0.4, () => { this.lookAt(at()); this.turnRate = 6; });
        this.press('delete');
        yield;
        yield* this.wait(0.25);
      }
    }
    this._mine = this._mine.filter((e) => g.spawnedBodies.includes(e) || g.characters.includes(e));
  }

  /** A gun (or the flamethrower) against Mutants it spawns for the purpose. */
  *gunRange(kind) {
    if (!this.brain?.online && this.lastActivity !== 'guns' && this.lastActivity !== 'flamer') {
      this.think(fill(pick(THOUGHTS[kind === 'flamethrower' ? 'flamer' : 'guns']), { item: CARRY[kind].label }));
    }
    this.line(kind === 'flamethrower' ? LINES.flamer : LINES.guns, { item: CARRY[kind].label });
    if (!(yield* this.getWeapon(kind))) return;
    const n = kind === 'flamethrower' ? 2 : 3;
    yield* this.spawnFoes(Math.random() < 0.75 ? 'zombie' : 'citizen', n, kind === 'flamethrower' ? 6 : 10);
    yield* this.equip(kind);
    yield* this.combat((c) => this._mine.includes(c) || c.isZombie, { timeout: 45 });
    yield* this.topUp();
  }

  /** Spawns foes some distance away: walks back from them as they appear. */
  *spawnFoes(kind, n, dist = 9) {
    const g = this.game;
    const yaw = this._clearYaw();
    const made = [];
    for (let i = 0; i < n; i++) {
      const c = yield* this.spawn(kind, { pitch: -0.05, yaw: yaw + (i - (n - 1) / 2) * 0.35 });
      if (c) made.push(c);
      yield* this.wait(0.2);
    }
    // back off to give the guns some room
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const p = g.player;
    const tx = p.pos.x + fx * (dist - 3), tz = p.pos.z + fz * (dist - 3);
    if (!g.nav.isBlockedWorld(tx, tz)) {
      yield* this.goTo(tx, tz, { arrive: 1.2, timeout: 3, direct: true, look: made[0]?.center || null });
    }
    return made;
  }

  *meleeFight(kind) {
    this.line(LINES.melee, { item: CARRY[kind].label });
    if (!(yield* this.getWeapon(kind))) return;
    yield* this.spawnFoes('zombie', 1 + ((Math.random() * 2) | 0), 5);
    yield* this.equip(kind);
    yield* this.combat((c) => c.isZombie, { timeout: 40 });
  }

  *horde() {
    this.line(LINES.horde);
    const g = this.game;
    if (!g.carried || !GUNS[g.carried.kind]) yield* this.getWeapon(pick(['ak47', 'm16', 'mossberg']));
    yield* this.spawnFoes('zombie', 4, 12);
    if (g.carried) yield* this.equip(g.carried.kind);
    yield* this.combat((c) => c.isZombie, { timeout: 60 });
    yield* this.topUp();
  }

  *officerDemo() {
    this.line(LINES.officer, null, { force: true });
    const g = this.game;
    const off = yield* this.spawn('officer', { pitch: -0.1 });
    yield* this.wait(2.5, () => { if (off?.center) this.lookAt(off.center); });
    if (!off || Math.random() < 0.35) { this.say('He\'s just standing there. Good officer.'); return; }
    // test the theory: a citizen, hit in front of him
    const cit = yield* this.spawn('citizen', { pitch: -0.25 });
    if (!cit) return;
    yield* this.equip('fists');
    this.say('Let\'s see what happens if I punch this citizen in front of him...');
    let t = 0;
    while (t < 6 && !cit.dead && !(off.ai?.hostile)) {
      t += this.dt;
      cit.chestPosition(_v2);
      const d = Math.hypot(cit.pos.x - g.player.pos.x, cit.pos.z - g.player.pos.z);
      this.lookAt(_v2);
      if (d > 0.85) this.moveToward(cit.pos.x, cit.pos.z, d > 3);
      this._fire(d);
      yield;
    }
    if (off.ai?.hostile) {
      this.line(LINES.officerFight, null, { force: true });
      if (!g.carried || !GUNS[g.carried.kind]) {
        // run from him first, then arm
        yield* this.getWeapon('glock');
      }
      if (g.carried) yield* this.equip(g.carried.kind);
      yield* this.combat((c) => this._isThreat(c), { timeout: 30 });
    }
  }

  *fireFistPlay() {
    this.line(LINES.firefist, null, { force: true });
    yield* this.spawnFoes('zombie', 3, 10);
    yield* this.equip('firefist');
    yield* this.combat((c) => c.isZombie, { timeout: 40 });
  }

  /** Into the lake for a dive and out again. */
  *swim() {
    this.line(LINES.swim, null, { force: true });
    if (!(yield* this.goTo(-36, -22.5, { arrive: 1.5, timeout: 40 }))) return;
    yield* this.goTo(-36, -34, { arrive: 1.2, timeout: 20, direct: true });
    // under for a few seconds
    let t = 0;
    while (t < 4 && this.p.air > 0.45) { t += this.dt; this.hold('crouch'); this.moveDir(0, -1, false); yield; }
    yield* this.swimToShore();
  }

  *swimToShore() {
    let t = 0;
    while (this.p.water && t < 30) {
      t += this.dt;
      this.hold('jump');
      this.moveToward(-34, -21.5, true);
      this._stuckJump();
      yield;
    }
    yield* this.goTo(-34, -20.5, { arrive: 1.2, timeout: 6, direct: true });
  }

  *leavePit() {
    yield* this.goTo(-8.2, 1.8, { arrive: 0.8, timeout: 25, direct: true });
    yield* this.goTo(-8.2, 9.6, { arrive: 0.8, timeout: 15, direct: true, run: false });
  }

  /* ============================== Easter eggs ============================= */

  /** Pit Valley: down the stairs, round the pond, touch the red RCV2. */
  *eggRun() {
    const g = this.game;
    const egg = g.map.interactables.find((i) => i.id === 'redRCV2');
    if (!egg) { this.goal = null; return; }
    this.line(LINES.egg, null, { force: true });
    if (!this._inPit()) {
      if (!(yield* this.goTo(-8.2, 9.8, { arrive: 0.7, timeout: 50 }))) { this.goalFails++; return; }
      yield* this.goTo(-8.2, 7.4, { arrive: 0.5, timeout: 6, direct: true, run: false });
      yield* this.goTo(-8.2, 1.7, { arrive: 0.6, timeout: 15, direct: true, run: false });
    }
    if (!this._inPit()) { this.goalFails++; return; }
    this.line(LINES.eggPond, null, { force: true });
    yield* this.goTo(-6.4, -5.4, { arrive: 0.8, timeout: 15, direct: true });
    yield* this.goTo(7.0, -6.4, { arrive: 0.5, timeout: 15, direct: true, run: false });
    yield* this.wait(0.6, () => this.lookAt(egg.position));
    this.line(LINES.eggTouch, null, { force: true });
    for (let i = 0; i < 4 && this.game === g; i++) {
      this.lookAt(egg.position);
      this.press('use');
      yield;
      yield* this.wait(0.5, () => this.lookAt(egg.position));
      if (g.travelling) break;
      yield* this.goTo(egg.position.x - 0.7, egg.position.z + 0.6, { arrive: 0.3, timeout: 3, direct: true, run: false });
    }
    if (!g.travelling) { this.goalFails++; return; }
    while (this.game === g) yield;
  }

  /** Red Plains: kit on, up onto the platform, touch the fire over the pillar. */
  *orbRun() {
    const g = this.game, enc = g.encounter;
    if (!enc || enc.state !== 'waiting') return;
    yield* this.armUp({ gun: 'ak47' });
    if (this.game !== g) return;
    this.line(LINES.orb, null, { force: true });
    if (!(yield* this.goTo(0, 3.4, { arrive: 0.9, timeout: 40 }))) { this.goalFails++; return; }
    yield* this.goTo(0, 1.3, { arrive: 0.35, timeout: 6, direct: true, run: false });
    const orb = enc.orbUse.position;
    /* USE with something in hand puts it down rather than touching anything,
       so the rifle goes down on the platform first - it is right there to
       pick back up the moment the fight starts. */
    if (g.carried) {
      this.say('Rifle down for a second - USE with something in hand just drops it.', { gap: 1 });
      this.press('use');
      yield;
      yield* this.wait(0.4);
    }
    for (let i = 0; i < 4 && enc.state === 'waiting'; i++) {
      yield* this.wait(0.5, () => this.lookAt(orb));
      this.press('use');
      yield;
      yield* this.wait(0.3);
    }
    if (enc.state === 'waiting') this.goalFails++;
  }

  /** After Silva: take the red RCV2 he left (it unlocks the Fire Fist). */
  *claimReward() {
    const g = this.game, enc = g.encounter;
    const at = enc.rewardUse.position;
    this.line(LINES.claim, null, { force: true });
    yield* this.goTo(at.x, at.z, { arrive: 1.0, timeout: 30 });
    // the run is over either way; if this fails, the next plan comes straight back here
    this.goal = null;
    for (let i = 0; i < 5 && enc.state === 'won'; i++) {
      yield* this.wait(0.4, () => this.lookAt(at));
      this.press('use');
      yield;
      yield* this.wait(0.3);
      if (enc.state === 'won') yield* this.goTo(at.x, at.z, { arrive: 0.6, timeout: 4, direct: true, run: false });
    }
    while (this.game === g && g.travelling) yield;
  }

  /** Legacy: the beach, into the lake, down to the bent grate, through it. */
  *grateRun() {
    const g = this.game, lm = g.map.landmarks;
    const grate = lm?.bentGrate;
    if (!grate) { this.goal = null; return; }
    this.line(LINES.grate, null, { force: true });
    const p = g.player;
    if (!p.water) {
      if (!(yield* this.goTo(-34, -22.6, { arrive: 1.2, timeout: 60 }))) { this.goalFails++; return; }
    }
    // swim out to just short of the walkway
    let t = 0;
    while (t < 30) {
      t += this.dt;
      const d = Math.hypot(grate.x - p.pos.x, grate.z + 5 - p.pos.z);
      if (d < 1.2) break;
      this.moveToward(grate.x, grate.z + 5, true);
      if (p.underwater && p.air < 0.5) this.hold('jump');
      this._stuckJump();
      yield;
    }
    // and down, under it, to the grate
    t = 0;
    while (t < 12) {
      t += this.dt;
      const d = Math.hypot(grate.x - p.pos.x, grate.z + 1.0 - p.pos.z);
      if (d < 0.6 && this.feet() < -2.9) break;
      if (this.feet() > -3.1) this.hold('crouch');
      this.moveToward(grate.x, grate.z + 1.0, false);
      this.lookAt(grate);
      yield;
    }
    this.line(LINES.grateEnter, null, { force: true });
    for (let i = 0; i < 6 && this.game === g && !g.travelling; i++) {
      yield* this.wait(0.35, () => { this.lookAt(grate); this.hold('crouch'); this.moveToward(grate.x, grate.z + 1.0, false); });
      this.press('use');
      yield;
    }
    if (!g.travelling) { this.goalFails++; return; }
    while (this.game === g) yield;
  }

  /** Dark Legacy: up and out of the lake, kit on, then past the tower. */
  *towerRun() {
    const g = this.game, enc = g.encounter;
    if (!enc || enc.state !== 'waiting') return;
    const p = g.player;
    if (p.water) yield* this.swimToShore();
    this.line(LINES.tower, null, { force: true });
    if (!(yield* this.goTo(24, -6, { arrive: 1.5, timeout: 70 }))) { this.goalFails++; return; }
    yield* this.armUp({ gun: Math.random() < 0.5 ? 'ak47' : 'm16' });
    if (this.game !== g || enc.state !== 'waiting') return;
    yield* this.goTo(24, 6, { arrive: 0.8, timeout: 20 });
  }

  /* ============================== boss fights ============================= */

  *bossFight() {
    const g = this.game, enc = g.encounter, b = enc.boss;
    const silva = g.map.id === 'redplains';
    this.line(silva ? LINES.silvaFight : LINES.shadowFight, null, { force: true });
    this._bossHpMark = Math.min(this._bossHpMark, b.hp / b.maxHp + 0.01);
    this.side = Math.random() < 0.5 ? -1 : 1;
    const aim = new Vector3();
    while (enc.state === 'fight' && this.game === g) {
      const p = g.player;
      // no gun (a respawn, or the fight started bare-handed): get one, from far off
      if (!g.carried || !GUNS[g.carried.kind]) {
        const d = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
        if (isUnlocked('firefist') && g.equipped !== 'firefist') g.setEquipped('firefist');
        // one lying close by (the one put down to touch the fire): take that
        const lying = this._gunNearby(9);
        if (lying && !this._rearming) {
          this._rearming = true;
          yield* this.useOn(lying, { tries: 2 });
          this._rearming = false;
          if (g.carried) this.line(LINES.gunOn, { item: CARRY[g.carried.kind].label, ammo: g.carried.ammo });
          continue;
        }
        if (d > 13 && !this._rearming) {
          this._rearming = true;
          yield* this.getWeapon(silva ? 'ak47' : 'm16');
          this._rearming = false;
          continue;
        }
      } else if (g.equipped !== g.carried.kind) {
        g.setEquipped(g.carried.kind);
      }
      this.turnRate = 10;
      const d = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
      // whatever is closest and dangerous: his Mutants first if they are on top of us
      let target = null;
      if (!silva) {
        let md = 6.5;
        for (const m of b.minions || []) {
          if (m.dead) continue;
          const dm = Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z);
          if (dm < md) { md = dm; target = m; }
        }
      }
      let dist;
      if (target) { target.chestPosition(aim); dist = Math.hypot(target.pos.x - p.pos.x, target.pos.z - p.pos.z); }
      else { aim.copy(b.center); dist = d; }
      this.lookAt(aim);

      const dodge = silva ? this._dodgeSilva(b, d) : this._dodgeShadow(b, d);
      if (!dodge) {
        const want = silva ? 11 : 10.5;
        this._strafeAround(b.pos, d, want, 1);
        this._keepInside();
      }
      // reload when he is busy recovering and the mag is getting light
      const c = g.carried, spec = c && GUNS[c.kind];
      if (spec && c.ammo > 0 && c.ammo < spec.capacity * 0.3 && b.state === 'recover' && !(g.reloadTimer > 0)) {
        this.press('reload');
      } else {
        this._fire(dist, { tol: 0.09, clear: true });
      }
      this._stuckJump();
      yield;
    }
    // (the win itself is noticed, and celebrated, by _watch)
    if (enc.state === 'won') yield* this.wait(2.5);
  }

  /** A gun on the ground within `range`, if there is one. */
  _gunNearby(range) {
    const g = this.game, p = g.player;
    let best = null, bd = range;
    for (const b of g.spawnedBodies) {
      if (!GUNS[b.userData.pickup]) continue;
      const d = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
      if (d < bd && Math.abs(b.pos.y - p.pos.y) < 2.5) { bd = d; best = b; }
    }
    return best;
  }

  /** Keeps away from the edge of the map (and, in Dark Legacy, the lake). */
  _keepInside() {
    const g = this.game, p = g.player, half = (g.map.half || 40) - 6;
    let x = 0, z = 0;
    if (p.pos.x > half) x -= 1; if (p.pos.x < -half) x += 1;
    if (p.pos.z > half) z -= 1; if (p.pos.z < -half) z += 1;
    if (g.map.id === 'darklegacy' && p.pos.z < -16) z += 1.5;
    if (x || z) { this.want.x += x * 1.5; this.want.z += z * 1.5; }
  }

  /** Silva: fireballs, the jump ring, the chest beam. */
  _dodgeSilva(b, d) {
    const g = this.game, p = g.player;
    // the jump: out of the ring
    if (b.state === 'jump' && b.jumpTo) {
      const jx = p.pos.x - b.jumpTo.x, jz = p.pos.z - b.jumpTo.z;
      const jd = Math.hypot(jx, jz);
      if (jd < 6.2) {
        if (jd < 0.3) this.moveDir(-Math.cos(this.side), Math.sin(this.side), true);
        else this.moveDir(jx / jd, jz / jd, true);
        return true;
      }
    }
    // fireballs heading this way: step off their line
    for (const f of g.fire?.balls || []) {
      if (f.owner !== 'boss') continue;
      _v1.subVectors(p.pos, f.pos);
      const v2 = f.vel.lengthSq();
      if (v2 < 1) continue;
      const tc = _v1.dot(f.vel) / v2;
      if (tc < 0 || tc > 1.4) continue;
      _v2.copy(f.pos).addScaledVector(f.vel, tc);
      const mx = p.pos.x - _v2.x, mz = p.pos.z - _v2.z;
      const miss = Math.hypot(mx, mz);
      if (miss > 2.4) continue;
      const vx = f.vel.x, vz = f.vel.z, vl = Math.hypot(vx, vz) || 1;
      let sx = -vz / vl, sz = vx / vl;
      if (sx * mx + sz * mz < 0 || (miss < 0.2 && this.side < 0)) { sx = -sx; sz = -sz; }
      this.moveDir(sx, sz, true);
      return true;
    }
    // the beam: keep running across it, always the same way
    if (b.state === 'beam') {
      const ux = (b.pos.x - p.pos.x) / (d || 1), uz = (b.pos.z - p.pos.z) / (d || 1);
      const radial = clamp((d - 12) / 4, -0.6, 0.6);
      this.moveDir(-uz * this.side + ux * radial, ux * this.side + uz * radial, true);
      this._keepInside();
      return true;
    }
    // too close to him: he slams and shoves
    if (d < 5) { this.moveDir(p.pos.x - b.pos.x, p.pos.z - b.pos.z, true); return true; }
    return false;
  }

  /** The Shadow Mutant: spikes, stab, barrage, slam (and his Mutants). */
  _dodgeShadow(b, d) {
    const g = this.game, p = g.player;
    const ux = (b.pos.x - p.pos.x) / (d || 1), uz = (b.pos.z - p.pos.z) / (d || 1);
    const across = (s) => this.moveDir(-uz * s + ux * 0.1, ux * s + uz * 0.1, true);

    // Slam: get away while he charges and kneels, then jump the wave
    if (b.state === 'slam') {
      if (!b.slamReady || (b.slamReady && b.t < 1.05)) {
        this.moveDir(-ux - uz * this.side * 0.3, -uz + ux * this.side * 0.3, true);
        this._keepInside();
        return true;
      }
      if (b.slamAt && b.waveR != null) {
        const dw = Math.hypot(p.pos.x - b.slamAt.x, p.pos.z - b.slamAt.z);
        const ahead = dw - b.waveR;
        if (ahead > 1.4 && ahead < 4.2 && dw < 14 && p.grounded) this.press('jump');
        this.moveDir(-ux, -uz, true);
        return true;
      }
    }
    // Spikes: out of any ring that is filling under us; jump as they come up
    for (const m of b.marks || []) {
      if (!m.on || !m.ring.visible) continue;
      const r = m.ring.scale.x;
      if (r > 3) continue;                   // that is the slam's ring
      const mx = p.pos.x - m.ring.position.x, mz = p.pos.z - m.ring.position.z;
      const md = Math.hypot(mx, mz);
      if (md > r + 0.9) continue;
      if (b.state === 'spikes') {
        const S = 0.5 + 0.8 + 0.45;
        const k = b.t - (b.casts || 0) * S;
        if (k > 1.15 && k < 1.32 && md < r + 0.2 && p.grounded) this.press('jump');
        if (k < 0.5) { across(this.side); return true; }  // still following: just keep moving
      }
      if (md < 0.2) across(this.side);
      else this.moveDir(mx / md, mz / md, true);
      return true;
    }
    /* Stab and Barrage: a tentacle aims a little ahead of where you are
       running, so stepping sideways does not beat it - nobody turns that
       fast. What does: running straight out of its reach (fourteen metres),
       and jumping just as each one locks, so the tip arrives where your
       chest was. */
    const away = () => { this.moveDir(-ux - uz * this.side * 0.25, -uz + ux * this.side * 0.25, true); this._keepInside(); };
    if (b.state === 'stab') {
      if (b.t > 0.55 && b.t < 0.63 && p.grounded) this.press('jump');
      away();
      return true;
    }
    if (b.state === 'barrage') {
      const k = (b.t % 0.38);
      if (b.t < 6 * 0.38 && k > 0.25 && k < 0.31 && p.grounded) this.press('jump');
      away();
      return true;
    }
    // on top of him: back off
    if (d < 4) { this.moveDir(-ux, -uz, true); return true; }
    return false;
  }
}

export { LINES, SPAWNABLES };
