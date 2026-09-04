/* =============================================================================
   Citizens are randomised: skin, clothes, shoes, hair and eyes.
   ========================================================================== */
import { Color } from 'three';

export const SKIN_TONES = [
  { name: 'White',      hex: 0xefc6a4, shadow: 0xd0a382 },
  { name: 'Light brown',hex: 0xd39c6c, shadow: 0xb37f52 },
  { name: 'Brown',      hex: 0xa06a3c, shadow: 0x81522c },
  { name: 'Dark brown', hex: 0x5f3a20, shadow: 0x462a16 },
];

export const HAIR_COLORS = [
  0x14100d, 0x2b1d14, 0x4a2f1c, 0x6b4526, 0x9a6b32,
  0xc9a35b, 0xa04d24, 0x8a8377, 0xd8d3c8, 0x3d2b3a,
];

export const SHIRT_COLORS = [
  0xb23a34, 0x2f6ea8, 0x3f8a54, 0xd8b64a, 0x7a4a9c,
  0xd97c33, 0x2c2f38, 0xe0e0d8, 0x4c8f9c, 0x8c3f66,
  0x5d6b3a, 0xc45b7a, 0x37474f, 0xa8a29a,
];

export const PANTS_COLORS = [
  0x35435c, 0x2a2d33, 0x5a4a34, 0x6a6a62, 0x3f5a3a,
  0x7a6a52, 0x1f2229, 0x4a3a52, 0x8a7a5a,
];

export const SHOE_COLORS = [
  0x1a1a1c, 0x3a2a1c, 0x6a4a2a, 0xe4e2dc, 0x2a3a5a, 0x7a2a2a,
];

export const EYE_COLORS = [
  '#4a2c17', '#2e1a0d', '#4a7ba8', '#3f7a3f', '#7a5a2a', '#66707a', '#5a4a3a',
];

export const HAIR_STYLES = ['short', 'buzz', 'mop', 'bald', 'tall'];

export function makeAppearance(rng) {
  const skin = SKIN_TONES[rng.int(0, SKIN_TONES.length - 1)];
  const hairStyle = rng.chance(0.08) ? 'bald' : rng.pick(HAIR_STYLES.filter((s) => s !== 'bald'));
  return {
    skinName: skin.name,
    skin: new Color(skin.hex),
    skinShadow: new Color(skin.shadow),
    hair: new Color(rng.pick(HAIR_COLORS)),
    hairStyle,
    shirt: new Color(rng.pick(SHIRT_COLORS)),
    pants: new Color(rng.pick(PANTS_COLORS)),
    shoes: new Color(rng.pick(SHOE_COLORS)),
    eye: rng.pick(EYE_COLORS),
    longSleeves: rng.chance(0.55),
    longPants: rng.chance(0.78),
    // build variation, applied as a mild scale on the whole rig
    build: 0.92 + rng() * 0.16,
    heightScale: 0.95 + rng() * 0.11,
    voicePitch: 0.85 + rng() * 0.4,
    bravery: rng(),          // 0 = bolts instantly, 1 = swings back
    aggression: rng(),
  };
}

export function playerAppearance() {
  return {
    skinName: 'White',
    skin: new Color(0xe8bb95),
    skinShadow: new Color(0xc79b76),
    hair: new Color(0x2b1d14),
    hairStyle: 'short',
    shirt: new Color(0x2c3038),
    pants: new Color(0x24272e),
    shoes: new Color(0x18181a),
    eye: '#4a6f8a',
    longSleeves: true,
    longPants: true,
    build: 1.0,
    heightScale: 1.0,
    voicePitch: 1,
    bravery: 1,
    aggression: 1,
  };
}
