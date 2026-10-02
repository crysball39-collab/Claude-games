/* =============================================================================
   Blood Zombies.

   The same body as everyone else, but dead and still walking: grey-green
   skin, torn and filthy clothes, blood all down the front of them and round
   the mouth, eyes gone pale. They do not think much. They find the nearest
   living person - you, if you are close - and walk at them with their arms
   out, and when they get there they claw. They do not run from anything,
   and they keep getting up until they are put down for good.

   The Shadow Mutant raises them; the RCV2 can spawn them too.
   ========================================================================== */
import { Color, Vector3 } from 'three';
import { Character, STATE } from './character.js';
import { CitizenAI, AI_STATE } from './ai.js';
import { makeAppearance } from './appearance.js';
import { boxLocalToWorld } from './skeleton.js';
import { makeRng, angleDelta, clamp } from '../core/util.js';

const _v1 = new Vector3(), _v2 = new Vector3();

export const ZOMBIE = {
  sight: 34,          // how far off they notice someone living
  reach: 0.95,        // close enough to claw
  swing: [0.55, 0.95],// between swipes
  speed: 0.82,        // a shamble: most of a walk, never a run
  health: 90,
};

const SKINS = [0x8a9474, 0x7e8a6e, 0x9a9a82, 0x76806a];
const RAGS = [0x4a4438, 0x3a3e34, 0x5a4c3e, 0x3c3a40, 0x5c3a32, 0x2e3436];

function zombieAppearance(rng) {
  const look = makeAppearance(rng);
  const skin = rng.pick(SKINS);
  look.skin = new Color(skin);
  look.skinShadow = new Color(skin).multiplyScalar(0.78);
  look.skinName = 'Dead';
  look.shirt = new Color(rng.pick(RAGS));
  look.pants = new Color(rng.pick(RAGS)).multiplyScalar(0.8);
  look.shoes = new Color(0x1c1a18);
  look.eye = '#d8d6c4';
  look.hair = new Color(0x2a2620);
  if (rng() < 0.35) look.hairStyle = 'bald';
  look.bravery = 1;
  look.aggression = 1;
  return look;
}

/** Blood everywhere it would be: down the front, round the mouth, on the hands. */
function bloody(c, rng) {
  const parts = ['upperTorso', 'midTorso', 'lowerTorso', 'head', 'neck', 'upperArmR', 'upperArmL',
    'lowerArmR', 'lowerArmL', 'handR', 'handL', 'upperLegR', 'upperLegL', 'lowerLegR', 'lowerLegL'];
  for (let i = 0; i < 34; i++) {
    const name = parts[(rng() * parts.length) | 0];
    const bone = c.rig.byName[name];
    if (!bone) continue;
    // mostly on the front (-Z), some anywhere
    const h = bone.boxHalf;
    _v1.set((rng() - 0.5) * h.x * 2, (rng() - 0.5) * h.y * 2, rng() < 0.7 ? -h.z : (rng() - 0.5) * h.z * 2);
    boxLocalToWorld(bone, _v1, _v2);
    c.body.paintHit(name, _v2, {
      kind: rng() < 0.25 ? 'impact' : 'blood', severity: 0.6 + rng() * 0.4,
      dir: { x: (rng() - 0.5) * 0.4, y: -1 }, allowTear: true, dark: 0.3 + rng() * 0.4,
    });
  }
  c.setInjuries({ mouthBleed: 0.9, noseBleed: 0.4, eyeR: rng() < 0.4 ? 'bloodshot' : 'ok' });
  c.bleeding = 0;
}

export function spawnZombie(game, position, opts = {}) {
  const seed = opts.seed != null ? opts.seed : (Math.random() * 1e9) | 0;
  const rng = makeRng(seed);
  const look = zombieAppearance(rng);
  const c = new Character(game.world, look, {
    x: position.x,
    z: position.z,
    yaw: opts.yaw != null ? opts.yaw : rng() * Math.PI * 2,
    seed,
    name: 'Zombie',
    castShadow: game.quality.shadows,
  });
  game.scene.add(c.body.group);
  c.isZombie = true;
  c.upperPose = 'zombieReach';
  c.maxHealth = c.health = ZOMBIE.health;
  c.speedWalk *= ZOMBIE.speed;
  c.ai = new ZombieAI(c, game);
  c.onDamage = (info) => game.handleDamage(info);
  c.onStrike = (attacker, side, vel) => game.resolveStrike(attacker, side, vel);
  c.onInjury = (info) => game.handleInjury(info);
  c.onGib = (info) => game.gore?.throwPart(info.mesh, info.vel);
  c.onArmourLost = (info) => game.dropWorn(info.character, info.armour, info.dir);
  game.registerCharacter(c);
  c.teleport(position.x, position.z, c.yaw);
  bloody(c, rng);
  c.body.flush();
  return c;
}

export class ZombieAI extends CitizenAI {
  constructor(character, game) {
    super(character, game);
    this.isZombie = true;
    this.target = null;
    this.retarget = 0;
    this.swing = 0;
  }

  // nothing frightens them and nothing makes them think twice
  onThreatened() {}
  onWitness() {}
  onHurt(info) {
    const a = info.attacker || this.c.lastAttacker;
    if (a && a !== this.c && !a.isZombie && !a.dead) { this.target = a; this.retarget = 2.5; }
  }

  /** The nearest living person who is not one of them, the player first among equals. */
  _pickTarget() {
    const c = this.c, g = this.game;
    let best = null, bestD = ZOMBIE.sight;
    for (const o of g.characters) {
      if (o === c || o.isZombie || o.dead || o.body?.destroyed) continue;
      let d = o.pos.distanceTo(c.pos);
      if (o === g.player) d *= 0.75;
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  update(dt) {
    const c = this.c;
    this.stateTime += dt;
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    this.swing = Math.max(0, this.swing - dt);
    this.retarget -= dt;
    c.wantRun = false;
    c.crouchWant = false;
    if (c.dead) { c.moveInput.set(0, 0, 0); return; }
    if (c.state !== STATE.CONTROLLED) {
      this._setState(AI_STATE.DOWN);
      c.moveInput.set(0, 0, 0);
      c.wantsUp = true;
      return;
    }
    if (this.retarget <= 0 || !this.target || this.target.dead || !this.game.characters.includes(this.target)) {
      this.target = this._pickTarget();
      this.retarget = 1.2;
    }
    const t = this.target;
    c.combatReady = !!t;
    c.squareUp = false;
    if (!t) {
      // nobody about: stand and sway, now and then drift somewhere
      this.state === AI_STATE.WANDER ? this._wander(dt) : this._idle(dt);
      this._stuckCheck(dt);
      return;
    }
    this.state = AI_STATE.FIGHT;
    const d = Math.hypot(t.pos.x - c.pos.x, t.pos.z - c.pos.z);
    if (d > ZOMBIE.reach * 0.8) this._followPath(dt, t.pos, ZOMBIE.reach * 0.75, true);
    else c.moveInput.set(0, 0, 0);
    this._facePoint(t.pos, dt, 6);
    // within reach and roughly facing them: claw
    if (d < ZOMBIE.reach && this.swing <= 0) {
      _v1.set(t.pos.x - c.pos.x, 0, t.pos.z - c.pos.z);
      const want = Math.atan2(-_v1.x, -_v1.z);
      if (Math.abs(angleDelta(c.gazeYaw, want)) < 0.7 && c.punch(true)) {
        this.swing = ZOMBIE.swing[0] + this.rng() * (ZOMBIE.swing[1] - ZOMBIE.swing[0]);
      }
    }
    this._maybeJump(dt);
    this._stuckCheck(dt);
    void clamp;
  }
}
