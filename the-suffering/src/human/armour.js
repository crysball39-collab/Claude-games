/* =============================================================================
   Body armour: what each vest and each helmet covers, what it does to what
   hits it there, and what it looks like on.

   Three of each:
     light    a concealable soft vest over the chest and the belly; a thin
              shell of a helmet that leaves the face and the ears open
     medium   a heavier soft vest that wraps the whole torso, hips and groin
              included, with stab panels; a ballistic helmet down over the ears
     swat     a plate carrier: steel-hard plates front and back over the chest
              and the belly that stop a rifle round, soft armour at the sides,
              a collar, shoulder pads and a groin flap; a high-cut ballistic
              helmet with a clear visor down over the face

   Soft armour catches a pistol round and spreads it into a bruise; a rifle
   round goes through it with less behind it. A plate stops both, and the
   person behind it still feels like they were kicked by a horse. Nothing
   stops the blow itself: it arrives as blunt force, less of it.
   ========================================================================== */
import { P } from './rig.js';
import { chance } from '../core/util.js';

/**
 * For each material and kind of blow: [power left when it is stopped (it
 * arrives as a blunt blow), power left when it gets through, chance it is
 * stopped]. A blunt blow is never stopped, only softened.
 */
export const PROTECT = {
  soft2: { arrow: [0.4, 0.55, 0.5], pistol: [0.6, 1, 1], rifle: [0, 0.7, 0], ball: [0.85, 0.6, 0.4], shot: [0.25, 1, 1], cut: [0.3, 1, 1], stab: [0, 0.45, 0], blunt: [0, 0.8, 0] },
  soft3: { arrow: [0.3, 0.45, 0.6], pistol: [0.42, 1, 1], rifle: [0, 0.55, 0], ball: [0.6, 0.8, 0.9], shot: [0.2, 1, 1], cut: [0.22, 1, 1], stab: [0.25, 0.3, 0.5], blunt: [0, 0.7, 0] },
  plate: { arrow: [0.25, 1, 1], pistol: [0.3, 1, 1], rifle: [0.75, 1, 1], ball: [0.45, 1, 1], shot: [0.12, 1, 1], cut: [0.15, 1, 1], stab: [0.2, 1, 1], blunt: [0, 0.55, 0] },
  shell: { arrow: [0.35, 0.6, 0.75], pistol: [0.8, 0.8, 0.6], rifle: [0, 0.9, 0], ball: [0, 0.85, 0], shot: [0.3, 0.7, 0.8], cut: [0.35, 1, 1], stab: [0, 0.5, 0], blunt: [0, 0.4, 0] },
  ballistic: { arrow: [0.3, 0.5, 0.95], pistol: [0.62, 0.7, 0.95], rifle: [1.0, 0.75, 0.12], ball: [0.8, 0.75, 0.7], shot: [0.2, 1, 1], cut: [0.3, 1, 1], stab: [0, 0.3, 0], blunt: [0, 0.35, 0] },
  heavy: { arrow: [0.3, 1, 1], pistol: [0.55, 1, 1], rifle: [1.05, 0.65, 0.35], ball: [0.65, 1, 0.95], shot: [0.2, 1, 1], cut: [0.25, 1, 1], stab: [0, 0.25, 0], blunt: [0, 0.3, 0] },
  visor: { arrow: [0.3, 1, 0.9], pistol: [0.45, 0.85, 0.85], rifle: [0, 0.8, 0], ball: [0, 0.8, 0.3], shot: [0.25, 1, 0.95], cut: [0.2, 1, 1], stab: [0.2, 1, 1], blunt: [0, 0.35, 0] },
};

export const VESTS = {
  light: { kind: 'light', name: 'Light vest', item: 'vest', mass: 2.4, lift: 0.03 },
  medium: { kind: 'medium', name: 'Medium vest', item: 'vestM', mass: 4.2, lift: 0.034 },
  swat: { kind: 'swat', name: 'S.W.A.T. vest', item: 'vestS', mass: 9.5, lift: 0.045 },
};
export const HELMETS = {
  light: { kind: 'light', name: 'Light helmet', item: 'helmet', mass: 1.2, lift: 0.022, fall: 0.5 },
  medium: { kind: 'medium', name: 'Medium helmet', item: 'helmetM', mass: 1.5, lift: 0.024, fall: 0.42 },
  swat: { kind: 'swat', name: 'S.W.A.T. helmet', item: 'helmetS', mass: 2.3, lift: 0.024, fall: 0.38 },
};
/** Which kind an item is, by its id. */
export const ARMOUR_ITEM = { vest: ['vest', 'light'], vestM: ['vest', 'medium'], vestS: ['vest', 'swat'], helmet: ['helmet', 'light'], helmetM: ['helmet', 'medium'], helmetS: ['helmet', 'swat'] };

/**
 * What the vest puts between a blow and the body, at a point on a part (lp,
 * in the part's own space; ln, the face it came in through), or null.
 */
export function vestCover(kind, part, lp, ln, s) {
  if (kind === 'light') return part === P.CHEST || part === P.ABDOMEN ? 'soft2' : null;
  if (kind === 'medium') return part === P.CHEST || part === P.ABDOMEN || part === P.PELVIS ? 'soft3' : null;
  // the plates are front and back; the sides are soft
  if (part === P.CHEST || part === P.ABDOMEN) return Math.abs(ln[2]) > 0.55 && Math.abs(lp[0]) < 0.14 * s ? 'plate' : 'soft3';
  if (part === P.PELVIS || part === P.NECK) return 'soft3';
  // shoulder pads: the top of the upper arm
  if (part === P.UARM_L || part === P.UARM_R) return lp[1] > -0.01 * s ? 'soft3' : null;
  return null;
}

/** The same for the helmet, on the head: the shell, the visor, or nothing. */
export function helmetCover(kind, lp, ln, s, visorOk) {
  const y = lp[1];
  const face = ln[2] > 0.5, side = Math.abs(ln[0]) > 0.5, back = ln[2] < -0.5;
  if (ln[1] < -0.5) return null;                         // under the chin
  if (kind === 'light') {
    if (y < -0.035 * s) return null;
    return face && y < 0.05 * s ? null : 'shell';
  }
  if (kind === 'medium') {
    if (face) return y >= 0.05 * s ? 'ballistic' : null;
    if (side) return y >= -0.065 * s ? 'ballistic' : null;
    if (back) return y >= -0.08 * s ? 'ballistic' : null;
    return y >= -0.035 * s ? 'ballistic' : null;
  }
  // S.W.A.T.: the face behind the visor, while it holds
  if (face) return y >= 0.05 * s ? 'heavy' : visorOk && y >= -0.1 * s ? 'visor' : null;
  if (side) return y >= -0.04 * s ? 'heavy' : null;
  if (back) return y >= -0.07 * s ? 'heavy' : null;
  return y >= -0.035 * s ? 'heavy' : null;
}

/**
 * A blow meeting armour of material `mat`. `round` says what kind of bullet
 * it was: 'pistol', 'rifle', 'ball' (a soft lead musket ball, big and slow:
 * soft armour often catches it, but it lands like a sledgehammer) or 'shot'
 * (a pellet of buckshot, which almost anything stops). An arrow or a bolt is
 * met as 'arrow': a plate turns it; soft armour, made to catch bullets, is
 * as likely to let a broadhead through as not. Returns what gets
 * through: { type, power, hp, stopped }.
 */
export function throughArmour(mat, type, round, power, hp) {
  const key = type === 'bullet' ? (round === true ? 'rifle' : round || 'pistol') : type;
  const row = PROTECT[mat] && PROTECT[mat][key];
  if (!row) return { type, power, hp, stopped: false };
  const [stopK, passK, p] = row;
  if (key !== 'blunt' && p > 0 && (p >= 1 || chance(p))) return { type: 'blunt', power: power * stopK, hp: 0, stopped: true };
  return { type, power: power * passK, hp: hp ? hp * passK : hp, stopped: false };
}

const BLACK = 0x121316, TRIM = 0x1d2024, OLIVE = 0x3d4232, OLIVE_D = 0x31352a, WEB = 0x55513f, SWAT_K = 0x15171a, SWAT_T = 0x22252a, WHITE = 0xe9e9e4;

/**
 * The boxes a vest is made of, each riding on a part: [part, local centre,
 * size, colour]. `sz` is the person's part sizes, `s` their scale.
 */
export function vestBoxes(kind, sz, s, police) {
  const c = sz[P.CHEST], a = sz[P.ABDOMEN], p = sz[P.PELVIS], n = sz[P.NECK], u = sz[P.UARM_L];
  const out = [];
  const add = (part, l, z, hex) => out.push([part, l, z, hex]);
  if (kind === 'light') {
    add(P.CHEST, [0, -0.012 * s, 0], [c[0] + 0.04 * s, c[1] * 0.94, c[2] + 0.055 * s], BLACK);
    add(P.ABDOMEN, [0, 0.008 * s, 0], [a[0] + 0.045 * s, a[1] + 0.02 * s, a[2] + 0.055 * s], BLACK);
    add(P.CHEST, [0.115 * s, c[1] * 0.5 + 0.004 * s, 0], [0.07 * s, 0.03 * s, c[2] + 0.03 * s], TRIM);
    add(P.CHEST, [-0.115 * s, c[1] * 0.5 + 0.004 * s, 0], [0.07 * s, 0.03 * s, c[2] + 0.03 * s], TRIM);
    add(P.CHEST, [0, -0.05 * s, c[2] * 0.5 + 0.034 * s], [0.2 * s, 0.11 * s, 0.022 * s], TRIM);
    if (police) {
      add(P.CHEST, [0.07 * s, 0.07 * s, c[2] * 0.5 + 0.03 * s], [0.11 * s, 0.035 * s, 0.006 * s], WHITE);
      add(P.CHEST, [0, 0.04 * s, -(c[2] * 0.5 + 0.03 * s)], [0.24 * s, 0.06 * s, 0.006 * s], WHITE);
    }
  } else if (kind === 'medium') {
    // olive drab, the whole torso: chest, belly, and a skirt over the hips and the groin
    add(P.CHEST, [0, -0.008 * s, 0], [c[0] + 0.05 * s, c[1] * 0.97, c[2] + 0.065 * s], OLIVE);
    add(P.ABDOMEN, [0, 0.006 * s, 0], [a[0] + 0.056 * s, a[1] + 0.03 * s, a[2] + 0.066 * s], OLIVE);
    add(P.PELVIS, [0, 0.045 * s, 0], [p[0] + 0.05 * s, p[1] * 0.5, p[2] + 0.06 * s], OLIVE);
    add(P.PELVIS, [0, -0.045 * s, p[2] * 0.5 + 0.026 * s], [0.15 * s, 0.11 * s, 0.022 * s], OLIVE_D);   // groin flap
    add(P.CHEST, [0.115 * s, c[1] * 0.5 + 0.006 * s, 0], [0.08 * s, 0.035 * s, c[2] + 0.04 * s], OLIVE_D);
    add(P.CHEST, [-0.115 * s, c[1] * 0.5 + 0.006 * s, 0], [0.08 * s, 0.035 * s, c[2] + 0.04 * s], OLIVE_D);
    // webbing across the front, and a collar of padding at the back of the neck
    for (let k = 0; k < 3; k++) add(P.CHEST, [0, (-0.075 + k * 0.05) * s, c[2] * 0.5 + 0.036 * s], [0.25 * s, 0.014 * s, 0.01 * s], WEB);
    add(P.ABDOMEN, [0, 0.02 * s, a[2] * 0.5 + 0.037 * s], [0.24 * s, 0.014 * s, 0.01 * s], WEB);
    add(P.CHEST, [0, c[1] * 0.5 - 0.01 * s, -(c[2] * 0.5 + 0.03 * s)], [0.2 * s, 0.05 * s, 0.03 * s], OLIVE_D);
    add(P.PELVIS, [0, 0.075 * s, 0], [p[0] + 0.058 * s, 0.03 * s, p[2] + 0.068 * s], WEB);                // belt
  } else {
    // a black plate carrier: plates standing proud front and back, pouches, collar, shoulders, groin
    add(P.CHEST, [0, -0.006 * s, 0], [c[0] + 0.055 * s, c[1] * 0.98, c[2] + 0.07 * s], SWAT_K);
    add(P.CHEST, [0, -0.01 * s, c[2] * 0.5 + 0.045 * s], [0.25 * s, 0.25 * s, 0.03 * s], SWAT_T);
    add(P.CHEST, [0, -0.01 * s, -(c[2] * 0.5 + 0.045 * s)], [0.25 * s, 0.25 * s, 0.03 * s], SWAT_T);
    add(P.ABDOMEN, [0, 0.008 * s, 0], [a[0] + 0.06 * s, a[1] + 0.035 * s, a[2] + 0.075 * s], SWAT_K);
    for (let k = -1; k <= 1; k++) add(P.ABDOMEN, [k * 0.075 * s, 0.015 * s, a[2] * 0.5 + 0.062 * s], [0.062 * s, 0.11 * s, 0.045 * s], SWAT_T);
    add(P.PELVIS, [0, 0.05 * s, 0], [p[0] + 0.05 * s, p[1] * 0.45, p[2] + 0.062 * s], SWAT_K);
    add(P.PELVIS, [0, -0.04 * s, p[2] * 0.5 + 0.03 * s], [0.15 * s, 0.13 * s, 0.024 * s], SWAT_K);
    add(P.NECK, [0, -0.012 * s, -0.004 * s], [n[0] + 0.085 * s, n[1] * 0.85, n[2] + 0.08 * s], SWAT_K);     // collar
    add(P.UARM_L, [0, u[1] * 0.27, 0], [u[0] + 0.04 * s, u[1] * 0.46, u[2] + 0.04 * s], SWAT_K);
    add(P.UARM_R, [0, u[1] * 0.27, 0], [u[0] + 0.04 * s, u[1] * 0.46, u[2] + 0.04 * s], SWAT_K);
    // white letters' worth of patch across the back, and a small one on the chest
    add(P.CHEST, [0, 0.07 * s, -(c[2] * 0.5 + 0.062 * s)], [0.21 * s, 0.05 * s, 0.006 * s], WHITE);
    add(P.CHEST, [0.06 * s, 0.075 * s, c[2] * 0.5 + 0.061 * s], [0.1 * s, 0.03 * s, 0.006 * s], WHITE);
  }
  return out;
}

/**
 * The boxes a helmet is made of, on the head, in unscaled metres: [local
 * centre, size, colour, glass?]. Glass is drawn see-through.
 */
export function helmetBoxes(kind) {
  if (kind === 'light') return [
    [[0, 0.1, -0.006], [0.246, 0.085, 0.262], BLACK],            // crown
    [[0, 0.03, -0.124], [0.246, 0.15, 0.03], BLACK],             // back, down to the nape
    [[0.118, 0.035, -0.02], [0.022, 0.11, 0.2], BLACK], [[-0.118, 0.035, -0.02], [0.022, 0.11, 0.2], BLACK],
    [[0, 0.066, 0.138], [0.2, 0.02, 0.04], TRIM],                // a stub of a brim
    [[0.112, -0.06, 0.03], [0.012, 0.1, 0.014], TRIM], [[-0.112, -0.06, 0.03], [0.012, 0.1, 0.014], TRIM],
  ];
  if (kind === 'medium') return [
    [[0, 0.102, -0.006], [0.254, 0.09, 0.272], OLIVE],
    [[0, 0.018, -0.128], [0.254, 0.175, 0.032], OLIVE],          // down over the nape
    [[0.123, 0.018, -0.016], [0.026, 0.155, 0.222], OLIVE], [[-0.123, 0.018, -0.016], [0.026, 0.155, 0.222], OLIVE],   // over the ears
    [[0, 0.07, 0.137], [0.236, 0.032, 0.05], OLIVE],             // the brow of it, sloping out
    [[0, 0.064, -0.006], [0.262, 0.018, 0.28], OLIVE_D],          // the band round it
    [[0.116, -0.078, 0.04], [0.012, 0.09, 0.014], OLIVE_D], [[-0.116, -0.078, 0.04], [0.012, 0.09, 0.014], OLIVE_D],
    [[0, -0.122, 0.07], [0.06, 0.014, 0.03], OLIVE_D],           // chin cup
  ];
  return [
    [[0, 0.104, -0.006], [0.252, 0.09, 0.27], SWAT_K],
    [[0, 0.035, -0.126], [0.252, 0.14, 0.032], SWAT_K],
    [[0.122, 0.05, -0.02], [0.024, 0.1, 0.2], SWAT_K], [[-0.122, 0.05, -0.02], [0.024, 0.1, 0.2], SWAT_K],     // high cut over the ears
    [[0.133, 0.068, -0.01], [0.012, 0.026, 0.17], SWAT_T], [[-0.133, 0.068, -0.01], [0.012, 0.026, 0.17], SWAT_T],   // rails
    [[0.128, -0.006, -0.006], [0.034, 0.064, 0.074], 0x2a2c30], [[-0.128, -0.006, -0.006], [0.034, 0.064, 0.074], 0x2a2c30],   // ear defenders
    [[0, 0.108, 0.14], [0.064, 0.036, 0.022], SWAT_T],           // night-vision mount
    [[0.124, 0.07, 0.124], [0.016, 0.044, 0.026], SWAT_T], [[-0.124, 0.07, 0.124], [0.016, 0.044, 0.026], SWAT_T],   // visor pivots
    [[0, 0.075, 0.138], [0.236, 0.026, 0.016], SWAT_T],          // the visor's top edge
    [[0.118, -0.018, 0.142], [0.008, 0.19, 0.012], SWAT_T], [[-0.118, -0.018, 0.142], [0.008, 0.19, 0.012], SWAT_T],   // its rim
    [[0, -0.018, 0.146], [0.228, 0.19, 0.01], 0x8fb0cc, true],   // the visor
  ];
}
