/* =============================================================================
   A torch on a wall, the same one at the cave mouth and all round the cave:
   an iron plate fixed to the wall with an arm out to a collar, a wooden
   handle leaning out from the wall through the collar, a pitch-soaked head,
   and the flame standing on the head's tip. The flame sprite is pinned by its
   foot, so when it flickers it grows and shrinks upward, never off the torch.
   ========================================================================== */
import { Mesh, BoxGeometry, CylinderGeometry, Sprite, SpriteMaterial, AdditiveBlending, Vector3, Quaternion, Matrix4 } from 'three';

const UP = new Vector3(0, 1, 0);

/** Where, up the flame texture, the foot of the fire is: the tip of the torch goes there. */
export const FLAME_FOOT = 0.1;

/**
 * Puts a torch into `parent` (as loose meshes, so the area can merge them).
 * `at` is the point on the wall's face the plate is fixed to, `out` the
 * wall's outward direction (only its level part counts). The handle leans
 * `lean` radians out from upright. Returns the flame and halo sprites, to
 * flicker, and the tip, where the fire is.
 */
export function addTorch(parent, at, out, { wood, iron, pitch, flameTex, haloTex = null, lean = 0.4, size = 1, disposables = [] }) {
  const s = size;
  const o = new Vector3(out.x, 0, out.z).normalize();
  const side = new Vector3().crossVectors(UP, o);
  // the wall's own frame (x along it, y up, z out of it), and the handle's (y along it)
  const flat = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(side, UP, o));
  const dir = UP.clone().multiplyScalar(Math.cos(lean)).addScaledVector(o, Math.sin(lean));
  const along = new Quaternion().setFromUnitVectors(UP, dir);
  const base = new Vector3(at.x, at.y, at.z);
  const add = (geo, mat, pos, q) => {
    const m = new Mesh(geo, mat);
    m.position.copy(pos);
    m.quaternion.copy(q);
    parent.add(m);
    disposables.push(geo);
    return m;
  };

  // iron: the plate, sunk a hair into the wall so no gap shows behind it, the arm, the collar
  add(new BoxGeometry(0.13 * s, 0.34 * s, 0.045 * s), iron, base.clone().addScaledVector(o, 0.0125 * s).addScaledVector(UP, -0.05 * s), flat);
  add(new BoxGeometry(0.036 * s, 0.036 * s, 0.11 * s), iron, base.clone().addScaledVector(o, 0.085 * s), flat);
  const collar = base.clone().addScaledVector(o, 0.15 * s);
  add(new CylinderGeometry(0.056 * s, 0.056 * s, 0.065 * s, 8), iron, collar, along);
  // the handle, a fifth of a metre of it below the collar, and the head on top
  const len = 0.6 * s;
  const foot = collar.clone().addScaledVector(dir, -0.2 * s);
  add(new CylinderGeometry(0.038 * s, 0.03 * s, len, 7), wood, foot.clone().addScaledVector(dir, len / 2), along);
  add(new CylinderGeometry(0.064 * s, 0.048 * s, 0.17 * s, 8), pitch, foot.clone().addScaledVector(dir, len + 0.06 * s), along);
  const tip = foot.clone().addScaledVector(dir, len + 0.125 * s);

  const flame = new Sprite(new SpriteMaterial({ map: flameTex, blending: AdditiveBlending, depthWrite: false, color: 0xffe2c4 }));
  flame.center.set(0.5, FLAME_FOOT);
  flame.position.copy(tip);
  flame.scale.set(0.34 * s, 0.62 * s, 1);
  flame.userData.base = 0.34 * s;
  // kept for the checks: where the fire is, which way the wall faces, which way the handle points
  flame.userData.tip = tip.clone();
  flame.userData.out = o.clone();
  flame.userData.dir = dir.clone();
  parent.add(flame);
  disposables.push(flame.material);
  let halo = null;
  if (haloTex) {
    halo = new Sprite(new SpriteMaterial({ map: haloTex, blending: AdditiveBlending, depthWrite: false }));
    halo.position.copy(tip).addScaledVector(UP, 0.14 * s);
    halo.scale.set(2.1 * s, 2.1 * s, 1);
    parent.add(halo);
    disposables.push(halo.material);
  }
  return { flame, halo, tip, dir };
}
