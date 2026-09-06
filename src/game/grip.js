/* =============================================================================
   HOW A HAND HOLDS SOMETHING

   A fist is not a hook. The fingers turn about one axis - across the palm -
   so the only thing a closed hand can actually hold is a handle lying along
   that axis, in the hole the curled fingers leave in front of the palm. That
   is why a blade cannot point straight down the forearm while being gripped,
   and why trying to draw it that way puts the handle through the palm.

   So every held weapon is placed the way a real one is: the handle goes
   through the hole, and whatever the weapon does - cut, strike, shoot - comes
   out of the knuckle side, perpendicular to the handle, exactly as a hammer,
   a machete and a pistol all do.

     center   where the hole is, in the hand bone's own space
     radius   how thick a handle fits in it
     curl     the two finger angles that close around one
     thumb    and the two thumb angles that lie along it

   The numbers are geometry, not taste: `center` and `radius` are the inscribed
   circle of the pocket bounded by the palm face and the two curled finger
   segments, and the clips use `curl` so the fingers close exactly on it.
   ========================================================================== */
import { Vector3, Quaternion, Matrix4 } from 'three';

export const FIST = {
  center: new Vector3(0, 0.082, -0.036),
  radius: 0.0153,
  curl: [-1.55, -1.35],
  thumb: [-0.62, -0.42],
};

const _out = new Vector3();
const _z = new Vector3();
const _x = new Vector3();
const _m = new Matrix4();

const _hold = new Vector3();

/**
 * The transform of a held weapon, in the hand bone's own space.
 *
 * @param {number} side  +1 right hand, -1 left
 * @param {object} spec
 *   rake  how far the handle tips towards the fingertips rather than lying
 *         straight across the palm - a real grip is diagonal, entering at the
 *         index knuckle and leaving under the little finger
 *   roll  turn of the weapon about its own handle: 0 points whatever the
 *         weapon does out over the knuckles, which is where a blade cuts, a
 *         hammer strikes and a barrel aims
 *   hold  the point on the weapon, in its own space, that the fist closes on:
 *         the middle of a machete's handle, the middle of a pistol's grip
 */
export function gripLocal(side, spec, outQuat, outPos) {
  const rake = spec.rake ?? 0.45;
  const roll = spec.roll || 0;
  // Out of the thumb side of the fist: the direction anything held points.
  _out.set(-side, rake, 0).normalize();
  // The back of the hand, turned about the handle by `roll`.
  _z.set(0, 0, 1).applyAxisAngle(_out, roll).normalize();
  _x.crossVectors(_out, _z);
  _m.makeBasis(_x, _out, _z);
  outQuat.setFromRotationMatrix(_m);

  // The weapon's own origin is wherever it has to be for `hold` to land in
  // the middle of the fist.
  _hold.fromArray(spec.hold || [0, 0, 0]).applyQuaternion(outQuat);
  outPos.copy(FIST.center).sub(_hold);
  return outPos;
}

/**
 * The same thing in world space: where a weapon's own origin sits, and which
 * way it is turned, given the hand bone holding it.
 */
export function gripWorld(bone, spec, outQuat, outPos) {
  gripLocal(spec.side ?? (bone.def.side || 1), spec, outQuat, outPos);
  outPos.applyQuaternion(bone.worldQuat).add(bone.worldPos);
  outQuat.premultiply(bone.worldQuat);
  return outPos;
}

/**
 * Where a point on a held weapon ends up in the world. `local` is in the
 * weapon's own space; `quat`/`origin` come from gripWorld.
 */
export function weaponPoint(local, quat, origin, out) {
  return out.copy(local).applyQuaternion(quat).add(origin);
}
