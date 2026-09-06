/* =============================================================================
   THE JOINT TABLE

   Every number that decides how a human body is allowed to move lives here and
   nowhere else: what each joint may rotate to, what each bone weighs, how much
   a ragdoll damps, how hard a hit carries through the skeleton. Nothing in this
   file does anything - it is read by skeleton.js (pose limits), character.js
   (masses, impacts, ragdoll damping) and world.js (the guards) - so a joint can
   be loosened or a limb made heavier by editing one line here.

   Angles are written in DEGREES, because that is how joint ranges are actually
   quoted, and converted once at the bottom.

   Sign conventions come from skeleton.js and are worth restating, because the
   limits below are meaningless without them:

     arms / legs   +X swings the limb FORWARD
     elbows        bend FORWARD, so flexion is POSITIVE X
     knees         bend BACKWARD, so flexion is NEGATIVE X
     spine / head  +X leans BACKWARD, so a forward bend is NEGATIVE X
     fingers       curl towards the palm with NEGATIVE X
     +Y on a spine bone turns the RIGHT shoulder forward

   Anything with `mirror: true` has its Y and Z ranges flipped for the left
   side, exactly as animation clips are mirrored.
   ========================================================================== */

const D = Math.PI / 180;

/* -------------------------------------------------------------------------- */
/*                            rotation limits                                 */
/* -------------------------------------------------------------------------- */

/**
 * Per bone, in the bone's own local frame, in degrees.
 *
 * The head and neck split the range a real neck has between them: about 80
 * degrees of yaw, 45 of pitch and 40 of tilt, half each, so neither one has to
 * do something a neck cannot.
 *
 * The spine is split the way an actual spine is: the thoracic section (upper
 * torso) does most of the twisting, the lumbar section (lower torso) very
 * little. Adding the three together gives a torso that turns about 75 degrees
 * and folds about 90 forward, which is a person.
 */
const LIMITS_DEG = {
  pelvis: { x: [-90, 90], y: [-180, 180], z: [-90, 90] },      // the root, free

  lowerTorso: { x: [-32, 14], y: [-13, 13], z: [-14, 14] },
  midTorso: { x: [-30, 12], y: [-26, 26], z: [-16, 16] },
  upperTorso: { x: [-30, 12], y: [-46, 46], z: [-16, 16] },

  neck: { x: [-24, 24], y: [-42, 42], z: [-21, 21] },
  head: { x: [-24, 24], y: [-42, 42], z: [-21, 21] },

  /* Shoulder: a ball and socket, so the range is huge - but not so huge that
     the arm can swing through the ribs. Negative Z takes the right arm out to
     its own side; the small positive allowance is how far it may come across
     the chest. */
  upperArm: {
    x: [-62, 178], y: [-90, 90], z: [-152, 34], mirror: true,
  },
  // Elbow: a hinge. Zero is straight, and it never goes past that.
  lowerArm: { x: [0, 148], y: [-82, 82], z: [-9, 9], mirror: true },
  // Wrist: bends and deviates, barely rotates.
  hand: { x: [-72, 78], y: [-26, 26], z: [-22, 22], mirror: true },
  // Fingers curl in and stop almost dead at straight.
  fingerA: { x: [-101, 9], y: [-9, 9], z: [-6, 6] },
  fingerB: { x: [-113, 5], y: [-6, 6], z: [-5, 5] },
  thumbA: { x: [-72, 12], y: [-14, 14], z: [-34, 34], mirror: true },
  thumbB: { x: [-84, 6], y: [-8, 8], z: [-8, 8] },

  /* Hip: a ball and socket too, with far less freedom behind than in front. */
  upperLeg: { x: [-27, 126], y: [-42, 42], z: [-47, 22], mirror: true },
  // Knee: a hinge the other way round. Zero is straight; it bends negative.
  lowerLeg: { x: [-148, 0], y: [-16, 16], z: [-7, 7], mirror: true },
  /* Ankle: points and lifts, twists a little. The rig's flat-footed zero is not
     the anatomical one - the foot bone is turned a quarter turn at rest - so
     the range is set from what a crouch actually asks for rather than from a
     textbook, while the twist stays tight, which is the part that looks wrong
     when it is loose. */
  foot: { x: [-52, 44], y: [-22, 22], z: [-16, 16], mirror: true },
  // The toe box is welded to the foot, as the design asks.
  footTip: { x: [0, 0], y: [0, 0], z: [0, 0] },
};

/** Which entry above governs a given bone name. */
export function limitKeyFor(name) {
  if (LIMITS_DEG[name]) return name;
  const m = name.match(/^(upperArm|lowerArm|hand|upperLeg|lowerLeg|foot|footTip)[RL]$/);
  if (m) return m[1];
  if (/^finger[RL]\d A?$/.test(name)) return null;
  if (/^finger[RL]\dA$/.test(name)) return 'fingerA';
  if (/^finger[RL]\dB$/.test(name)) return 'fingerB';
  if (/^thumb[RL]A$/.test(name)) return 'thumbA';
  if (/^thumb[RL]B$/.test(name)) return 'thumbB';
  return null;
}

/**
 * Limits in radians, resolved per bone name and already mirrored for the left
 * side. Built once; read every frame.
 */
export const JOINT_LIMITS = (() => {
  const out = Object.create(null);
  const build = (name, spec, left) => {
    const flip = left && spec.mirror;
    out[name] = {
      x: [spec.x[0] * D, spec.x[1] * D],
      y: flip ? [-spec.y[1] * D, -spec.y[0] * D] : [spec.y[0] * D, spec.y[1] * D],
      z: flip ? [-spec.z[1] * D, -spec.z[0] * D] : [spec.z[0] * D, spec.z[1] * D],
    };
  };
  for (const key of Object.keys(LIMITS_DEG)) {
    const spec = LIMITS_DEG[key];
    if (/^(upperArm|lowerArm|hand|upperLeg|lowerLeg|foot|footTip)$/.test(key)) {
      build(key + 'R', spec, false);
      build(key + 'L', spec, true);
    } else if (key === 'fingerA' || key === 'fingerB') {
      for (const S of ['R', 'L']) {
        for (let i = 0; i < 4; i++) build(`finger${S}${i}${key === 'fingerA' ? 'A' : 'B'}`, spec, S === 'L');
      }
    } else if (key === 'thumbA' || key === 'thumbB') {
      for (const S of ['R', 'L']) build(`thumb${S}${key === 'thumbA' ? 'A' : 'B'}`, spec, S === 'L');
    } else {
      build(key, spec, false);
    }
  }
  return out;
})();

/** Clamps one bone's local euler in place. Returns true if anything moved. */
export function clampBoneEuler(name, euler) {
  const lim = JOINT_LIMITS[name];
  if (!lim) return false;
  let touched = false;
  if (euler.x < lim.x[0]) { euler.x = lim.x[0]; touched = true; }
  else if (euler.x > lim.x[1]) { euler.x = lim.x[1]; touched = true; }
  if (euler.y < lim.y[0]) { euler.y = lim.y[0]; touched = true; }
  else if (euler.y > lim.y[1]) { euler.y = lim.y[1]; touched = true; }
  if (euler.z < lim.z[0]) { euler.z = lim.z[0]; touched = true; }
  else if (euler.z > lim.z[1]) { euler.z = lim.z[1]; touched = true; }
  return touched;
}

/**
 * Which joints are held to their limits in the DRAWN pose of a ragdoll.
 *
 * Not all of them, and the reason is worth writing down. The physics is free to
 * put a body somewhere a body cannot quite go; correcting that in the drawing
 * only moves the picture away from where the weight actually is. For a hinge
 * the correction is small and the error is glaring - a knee bent backwards is
 * the single thing that makes a ragdoll look broken - so hinges, the neck and
 * the spine are held. Shoulders and hips are left alone: their cones are wide,
 * a body lying on its side genuinely reaches the edge of one, and pulling a
 * whole leg back into range lifts it off the ground it is lying on.
 */
export const DRAWN_LIMIT_BONES = new Set([
  'lowerArmR', 'lowerArmL', 'lowerLegR', 'lowerLegL',
  'handR', 'handL', 'footR', 'footL',
  'neck', 'head', 'lowerTorso', 'midTorso', 'upperTorso',
]);

/* -------------------------------------------------------------------------- */
/*                          how much each bone weighs                         */
/* -------------------------------------------------------------------------- */

/**
 * [particle, kilograms, radius in metres, bone, which end of it].
 *
 * Roughly a seventy kilo adult, distributed the way one is: the hips and chest
 * carry most of it, a hand is under a kilo. Equal masses would make a ragdoll
 * behave like a rack of coat hangers, so they are not equal.
 */
export const BONE_MASS = [
  ['hip', 7.0, 0.13, 'pelvis', 'pos'],
  ['pelvisTop', 5.0, 0.12, 'pelvis', 'end'],
  ['lt', 5.0, 0.12, 'lowerTorso', 'end'],
  ['mt', 6.0, 0.13, 'midTorso', 'end'],
  ['shoulders', 7.0, 0.13, 'upperTorso', 'end'],
  ['neckTop', 2.5, 0.07, 'neck', 'end'],
  ['headTop', 4.5, 0.11, 'head', 'end'],
];
for (const S of ['R', 'L']) {
  BONE_MASS.push(
    [`shoulder${S}`, 2.2, 0.09, 'upperArm' + S, 'pos'],
    [`elbow${S}`, 2.0, 0.07, 'upperArm' + S, 'end'],
    [`wrist${S}`, 1.4, 0.06, 'lowerArm' + S, 'end'],
    [`handEnd${S}`, 0.9, 0.06, 'hand' + S, 'end'],
    [`hip${S}`, 3.5, 0.10, 'upperLeg' + S, 'pos'],
    [`knee${S}`, 3.5, 0.08, 'upperLeg' + S, 'end'],
    [`ankle${S}`, 2.2, 0.07, 'lowerLeg' + S, 'end'],
    [`toe${S}`, 1.1, 0.06, 'foot' + S, 'end'],
  );
}

/* -------------------------------------------------------------------------- */
/*                            ragdoll behaviour                               */
/* -------------------------------------------------------------------------- */

export const RAGDOLL = {
  /** Extra velocity damping while a body is not under its own control, per
      second. This is what stops limbs oscillating like springs after a fall. */
  damping: 2.6,
  /** Muscle strength while ragdolling: not zero, so a body still has tone. */
  strength: 0.075,
  /** ...and while dead, which is as close to a sack as this game gets. */
  deadStrength: 0.012,
  /** Muscle strength while stumbling, between the two. */
  stumbleStrength: [0.22, 0.46],
};

/**
 * Joints that must not fold the wrong way once physics has the body.
 *
 * A particle skeleton has no twist to constrain - a bone is a line between two
 * points, so it cannot twist unnaturally in the first place - but it can very
 * happily bend a knee backwards. Each guard names the three joints involved and
 * which way the middle one is allowed to sit relative to the line between the
 * other two, measured along the body's own forward axis.
 *
 *   sign +1  the middle joint must stay in FRONT of the line (knees)
 *   sign -1  it must stay BEHIND it (elbows)
 */
/**
 * The cones a ball joint may move in, as half angles in degrees.
 *
 * Measured from the limb hanging at rest, and read against the body's own
 * frame, so they hold whichever way up the body is. These are what stop a leg
 * folding through the pelvis it hangs off once physics has the body.
 */
export const CONE_LIMITS = [
  // the same numbers the hip and shoulder rows of LIMITS_DEG use, so the
  // physics and the drawing agree about what a joint can do
  { root: 'hipR', tip: 'kneeR', side: 1, fwd: 126, back: 27, out: 47, across: 22 },
  { root: 'hipL', tip: 'kneeL', side: -1, fwd: 126, back: 27, out: 47, across: 22 },
  { root: 'shoulderR', tip: 'elbowR', side: 1, fwd: 178, back: 62, out: 152, across: 34 },
  { root: 'shoulderL', tip: 'elbowL', side: -1, fwd: 178, back: 62, out: 152, across: 34 },
];

export const HINGE_GUARDS = [
  { a: 'hipR', b: 'kneeR', c: 'ankleR', sign: 1, margin: 0.035 },
  { a: 'hipL', b: 'kneeL', c: 'ankleL', sign: 1, margin: 0.035 },
  { a: 'shoulderR', b: 'elbowR', c: 'wristR', sign: -1, margin: 0.025 },
  { a: 'shoulderL', b: 'elbowL', c: 'wristL', sign: -1, margin: 0.025 },
];

/**
 * Extra spacing between particular joints, on top of the capsules above.
 *
 * The capsules do the work; these are the few spots where joint centres can
 * still be crushed together without the bones themselves overlapping.
 *
 * Kept deliberately short: these run every solver pass, and the pairs below are
 * the ones that actually go wrong. Each is [particle, particle, metres apart],
 * and every distance is set BELOW the closest that pair comes in any pose the
 * animation actually takes - measured, not guessed. These exist to stop things
 * passing through each other, not to enforce personal space, and one that fires
 * during a normal walk would spend the whole time fighting the animation.
 */
/**
 * The parts of a body that are solid against each other, as capsules: a bone
 * between two joints with a thickness. Everything not listed - fingers, toes -
 * is too small to be worth the arithmetic.
 *
 * `scale` trims a capsule's radius where the box it represents is not really
 * that fat, or where the pose naturally brings it close to a neighbour.
 */
export const SOLID_PARTS = [
  { name: 'pelvis', a: 'hip', b: 'pelvisTop', r: 0.15 },
  { name: 'lowerTorso', a: 'pelvisTop', b: 'lt', r: 0.14 },
  { name: 'midTorso', a: 'lt', b: 'mt', r: 0.145 },
  { name: 'upperTorso', a: 'mt', b: 'shoulders', r: 0.155 },
  { name: 'neck', a: 'shoulders', b: 'neckTop', r: 0.06 },
  { name: 'head', a: 'neckTop', b: 'headTop', r: 0.105 },
  { name: 'upperArmR', a: 'shoulderR', b: 'elbowR', r: 0.052 },
  { name: 'lowerArmR', a: 'elbowR', b: 'wristR', r: 0.046 },
  { name: 'handR', a: 'wristR', b: 'handEndR', r: 0.042 },
  { name: 'upperArmL', a: 'shoulderL', b: 'elbowL', r: 0.052 },
  { name: 'lowerArmL', a: 'elbowL', b: 'wristL', r: 0.046 },
  { name: 'handL', a: 'wristL', b: 'handEndL', r: 0.042 },
  { name: 'upperLegR', a: 'hipR', b: 'kneeR', r: 0.072 },
  { name: 'lowerLegR', a: 'kneeR', b: 'ankleR', r: 0.060 },
  { name: 'footR', a: 'ankleR', b: 'toeR', r: 0.048 },
  { name: 'upperLegL', a: 'hipL', b: 'kneeL', r: 0.072 },
  { name: 'lowerLegL', a: 'kneeL', b: 'ankleL', r: 0.060 },
  { name: 'footL', a: 'ankleL', b: 'toeL', r: 0.048 },
];

/**
 * Pairs that are always in contact and must never be pushed apart. Two bones
 * meeting at a joint are excluded automatically - they share a particle - but
 * these lie against each other by the shape of a body rather than by a joint,
 * and a solver told to separate them would spend every frame fighting the
 * animation.
 */
export const SOLID_IGNORE = [
  /* The spine is one stack of meat. Segments that skip a link - the pelvis and
     the middle torso, with the lower torso between them - overlap by the shape
     of a torso, not by anything going wrong, and the same is true of a thigh
     against the pelvis it hangs from. Measured, not assumed: these are exactly
     the pairs found overlapping through idling, walking, running, crouching and
     punching, and no others. */
  ['pelvis', 'midTorso'], ['pelvis', 'upperTorso'], ['pelvis', 'neck'],
  ['lowerTorso', 'upperTorso'], ['lowerTorso', 'neck'], ['midTorso', 'neck'],
  ['pelvis', 'upperLegR'], ['pelvis', 'upperLegL'],

  ['upperArmR', 'upperTorso'], ['upperArmL', 'upperTorso'],
  ['upperArmR', 'neck'], ['upperArmL', 'neck'],
  ['upperArmR', 'midTorso'], ['upperArmL', 'midTorso'],
  ['upperLegR', 'lowerTorso'], ['upperLegL', 'lowerTorso'],
  ['upperLegR', 'upperLegL'],
  ['neck', 'upperTorso'], ['head', 'upperTorso'],
  ['footR', 'upperLegR'], ['footL', 'upperLegL'],
  ['handR', 'upperArmR'], ['handL', 'upperArmL'],
];

/** How hard a self collision pushes. Enough to separate, gently enough to look
    like flesh rather than a spring. */
export const SOLID_STIFFNESS = 0.35;

/** ...and how hard one body pushes against a different body. */
export const CROSS_STIFFNESS = 0.45;

export const SELF_COLLISION = [
  // arms against the chest and belly
  ['elbowR', 'mt', 0.20], ['elbowL', 'mt', 0.20],
  ['wristR', 'mt', 0.24], ['wristL', 'mt', 0.24],
  ['handEndR', 'mt', 0.22], ['handEndL', 'mt', 0.22],
  ['elbowR', 'lt', 0.17], ['elbowL', 'lt', 0.17],
  ['wristR', 'lt', 0.22], ['wristL', 'lt', 0.22],
  // ...and against the head and neck
  ['wristR', 'headTop', 0.20], ['wristL', 'headTop', 0.20],
  ['handEndR', 'headTop', 0.19], ['handEndL', 'headTop', 0.19],
  // legs against each other and against the pelvis
  ['kneeR', 'kneeL', 0.17],
  ['ankleR', 'ankleL', 0.15],
  ['toeR', 'toeL', 0.13],
  ['kneeR', 'hip', 0.24], ['kneeL', 'hip', 0.24],
  // hands against each other
  ['handEndR', 'handEndL', 0.11],
];

/* -------------------------------------------------------------------------- */
/*                            looking and aiming                              */
/* -------------------------------------------------------------------------- */

/**
 * Which joints take up a turn of the head, and in what order.
 *
 * A person looking to one side turns their eyes and head first, recruits the
 * neck as the target goes further round, and only then starts bringing the
 * chest with them. Each joint gives what it has before the next one is asked,
 * and the shares below are how much of each joint's own limit the gaze is
 * allowed to spend - the rest is left for the animation.
 */
export const LOOK_CHAIN = {
  yaw: [
    { bone: 'head', share: 0.9 },
    { bone: 'neck', share: 0.9 },
    { bone: 'upperTorso', share: 0.55 },
    { bone: 'midTorso', share: 0.45 },
  ],
  pitch: [
    { bone: 'head', share: 0.75 },
    { bone: 'neck', share: 0.75 },
    { bone: 'upperTorso', share: 0.3 },
  ],
};

/**
 * How far the hips may fall behind the gaze before they have to come round.
 * Below this the body simply looks over its shoulder; past it, it turns.
 */
export const BODY_TURN_THRESHOLD = 68 * D;

/** How much of the turn the arms take when a weapon is being aimed. */
export const AIM_ARM_FOLLOW = 0.55;

/* -------------------------------------------------------------------------- */
/*                          how a hit travels                                 */
/* -------------------------------------------------------------------------- */

/**
 * A hit belongs to the part it landed on. It reaches the neighbouring bones
 * with less behind it, and the one after that with less again - so a punch to
 * the head snaps the head, rocks the neck and barely troubles the chest, while
 * something heavy enough carries all the way down.
 */
export const IMPACT = {
  /** What survives each step along the skeleton away from the struck bone. */
  falloff: 0.42,
  /** How many bones out even the heaviest hit reaches. */
  maxHops: 5,
  /** Hits softer than this reach one bone fewer per step of gentleness. */
  hopsPerSeverity: 4,
  /** Metres per second a single hit may add to any one joint. */
  maxJointSpeed: 11,
  /** Share of the impulse that goes to the whole body rather than the part. */
  bodyShare: 0.55,
};

export { D as DEG };
