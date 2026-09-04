/* =============================================================================
   Citizens: the one entry under Humans in the spawn menu.
   ========================================================================== */
import { Character } from './character.js';
import { CitizenAI } from './ai.js';
import { makeAppearance } from './appearance.js';
import { makeRng } from '../core/util.js';

export function spawnCitizen(game, position, opts = {}) {
  const seed = opts.seed != null ? opts.seed : (Math.random() * 1e9) | 0;
  const rng = makeRng(seed);
  const look = makeAppearance(rng);

  const c = new Character(game.world, look, {
    x: position.x,
    z: position.z,
    yaw: opts.yaw != null ? opts.yaw : rng() * Math.PI * 2,
    seed,
    name: 'Citizen',
    castShadow: game.quality.shadows,
  });
  game.scene.add(c.body.group);
  c.ai = new CitizenAI(c, game);
  c.onDamage = (info) => game.handleDamage(info);
  c.onStrike = (attacker, side, vel) => game.resolveStrike(attacker, side, vel);
  game.registerCharacter(c);
  c.teleport(position.x, position.z, c.yaw);
  return c;
}

