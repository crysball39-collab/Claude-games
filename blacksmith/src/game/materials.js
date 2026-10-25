/* =============================================================================
   Materials that more than one thing shares: one per ore, so a Gold blade,
   a Gold helmet and a lump of Gold in the cave all catch the light the same
   way, plus the hot glow metal has while it is still on the anvil.
   ========================================================================== */
import { MeshPhongMaterial, Color } from 'three';
import { ORES } from './data.js';

const cache = new Map();

/** The one material for everything forged from this ore. */
export function oreMaterial(id) {
  let m = cache.get(id);
  if (m) return m;
  const look = (ORES[id] || ORES.stone).look;
  const dull = look.kind === 'rock' || look.kind === 'bone';
  m = new MeshPhongMaterial({
    color: look.base,
    specular: dull ? 0x1a1a1a : new Color(look.light).lerp(new Color(look.base), 0.35),
    shininess: look.shine,
    emissive: look.glow || 0x000000,
    flatShading: look.kind === 'gem' || look.kind === 'iris',
  });
  m.userData.ore = id;
  cache.set(id, m);
  return m;
}

/** Irisite never quite holds one colour. */
export function updateOreMaterials(t) {
  const m = cache.get('irisite');
  if (!m) return;
  m.color.setHSL((t * 0.11) % 1, 0.8, 0.64);
  m.emissive.setHSL((t * 0.11 + 0.45) % 1, 0.85, 0.16);
}

let hot = null;
/** White-orange metal fresh from the mould. */
export function hotMetalMaterial() {
  if (!hot) hot = new MeshPhongMaterial({ color: 0xffa040, emissive: 0xff5a10, emissiveIntensity: 1.2, shininess: 30 });
  return hot;
}
