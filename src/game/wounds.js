/* =============================================================================
   Wounds you can see the depth of.

   Paint takes care of bruises, blood and scorching. These are the hits that
   go past the surface: a bullet hole with a lip of torn flesh round it, a
   machete gash with the edges standing open, a split where a hammer burst
   the skin over a lump, and a burn charred black and blistered at the edge.

   Each one is a small solid stuck to the outside of the part it landed on,
   parented to that part's box so it moves with it - into a ragdoll, and off
   with a limb if the limb comes off. The shapes are built once and shared;
   a wound is one mesh and a transform.
   ========================================================================== */
import {
  BufferGeometry, Float32BufferAttribute, SphereGeometry, CylinderGeometry, TorusGeometry,
  BoxGeometry, Mesh, MeshLambertMaterial, Matrix4, Quaternion, Vector3, Color, Euler,
} from 'three';
import { worldToBoxLocal } from './skeleton.js';
import { makeRng, clamp01 } from '../core/util.js';

const _local = new Vector3(), _n = new Vector3(), _t = new Vector3(), _d = new Vector3();
const _q = new Quaternion(), _q2 = new Quaternion(), _m = new Matrix4();
const _z = new Vector3(0, 0, 1);
const _s = new Vector3();
const _c = new Color();

/** How many a person can carry before the oldest make way, and in all. */
const PER_BODY = 16;
const TOTAL = 140;

/* ------------------------------ shape building ----------------------------- */

/**
 * Bakes a list of pieces into one vertex coloured geometry. Each piece is a
 * geometry, a colour, and where it sits: wounds are laid out with the skin
 * at z = 0 and +Z pointing out of the body.
 */
function bake(pieces) {
  const pos = [], nor = [], col = [];
  for (const p of pieces) {
    let g = p.geo;
    if (p.rot) g.applyMatrix4(_m.makeRotationFromEuler(new Euler(...p.rot)));
    if (p.scale) g.scale(...p.scale);
    if (p.at) g.translate(...p.at);
    // the transforms above carry the normals with them, smooth as built
    g = g.index ? g.toNonIndexed() : g;
    const a = g.attributes.position, n = g.attributes.normal;
    _c.set(p.color);
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      // a little variation so a flat colour reads as flesh, not plastic
      const k = 1 + (p.mottle ? (Math.sin(i * 12.9898) * 43758.5453 % 1) * p.mottle : 0);
      col.push(_c.r * k, _c.g * k, _c.b * k);
    }
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

/** A round dome on the skin: half a squashed sphere. */
const dome = (r, h, seg = 12) => new SphereGeometry(r, seg, Math.max(4, seg >> 1), 0, Math.PI * 2, 0, Math.PI / 2)
  .applyMatrix4(new Matrix4().makeRotationX(Math.PI / 2)).scale(1, 1, h / r);

const FLESH = 0x9c2a26, RAW = 0xc9473f, DEEP = 0x3a0606, FAT = 0xe4c48a, BONE = 0xeee5cf;
const LIP = 0xb5544a, SWOLLEN = 0x7a3456, CHAR = 0x25170f, CHAR2 = 0x45301f, BLISTER = 0xe9b88a;

function buildShapes() {
  const shapes = {};

  /* A bullet hole. A ring of torn flesh pushed up round a dark, deep centre,
     a raw red collar inside it going down. Bigger out the back, but a hit is
     a hit here. */
  shapes.hole = [0, 1].map((v) => bake([
    { geo: new TorusGeometry(0.0105, 0.0042 + v * 0.001, 6, 14), color: LIP, at: [0, 0, 0.0005], scale: [1, 1, 0.7], mottle: 0.25 },
    { geo: new CylinderGeometry(0.0095, 0.006, 0.010, 12, 1, true), color: RAW, rot: [Math.PI / 2, 0, 0], at: [0, 0, -0.003] },
    { geo: new CylinderGeometry(0.0072, 0.0072, 0.0012, 12), color: DEEP, rot: [Math.PI / 2, 0, 0], at: [0, 0, 0.0002] },
    // a fleck of blood run out under it
    { geo: dome(0.007, 0.0008, 8), color: FLESH, at: [0.002, -0.014 - v * 0.004, 0], scale: [0.8, 1.6, 1] },
  ]));

  /* A gash: a long slit with the lips of it standing open, fat and muscle
     showing down the sides, and in the deep one the bone at the bottom. */
  const gash = (deep) => bake([
    { geo: dome(0.03, 0.004, 14), color: LIP, scale: [1.5, 0.30, 1], mottle: 0.2 },
    { geo: dome(0.03, 0.003, 14), color: DEEP, scale: [1.38, 0.16, 1], at: [0, 0, 0.0018] },
    // the two lips, swollen up off the skin either side
    { geo: new CylinderGeometry(0.0042, 0.0042, 0.08, 8), color: RAW, rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.75], at: [0, 0.0075, 0.0022], mottle: 0.2 },
    { geo: new CylinderGeometry(0.0042, 0.0042, 0.08, 8), color: RAW, rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.75], at: [0, -0.0075, 0.0022], mottle: 0.2 },
    // the layer of fat just under the skin, either side of the cut
    { geo: new BoxGeometry(0.07, 0.0016, 0.003), color: FAT, at: [0, 0.0042, 0.0012] },
    { geo: new BoxGeometry(0.07, 0.0016, 0.003), color: FAT, at: [0, -0.0042, 0.0012] },
    ...(deep ? [{ geo: new CylinderGeometry(0.0026, 0.0026, 0.05, 8), color: BONE, rot: [0, 0, Math.PI / 2], at: [0, 0, 0.0028] }] : []),
  ]);
  shapes.gash = [gash(false), gash(true)];

  /* Blunt force that broke the skin: a swollen purple lump with a ragged
     split across the top of it. */
  shapes.split = [0, 1].map((v) => bake([
    { geo: dome(0.028, 0.009, 14), color: SWOLLEN, scale: [1.1, 0.9, 1], mottle: 0.3 },
    { geo: dome(0.016, 0.004, 10), color: LIP, scale: [1.5, 0.45, 1], at: [0, 0, 0.0072], rot: [0, 0, v * 0.6] },
    { geo: dome(0.016, 0.003, 10), color: DEEP, scale: [1.35, 0.2, 1], at: [0, 0, 0.0088], rot: [0, 0, v * 0.6] },
  ]));

  /* A burn. A black, cracked crust with the skin round it raw red and
     coming up in blisters. */
  shapes.burn = [0, 1, 2].map((v) => {
    const rng = makeRng(31 + v * 7);
    const pieces = [
      { geo: dome(0.034, 0.0022, 16), color: RAW, scale: [1.15, 0.95, 1], mottle: 0.25 },
      { geo: dome(0.026, 0.0045, 14), color: CHAR, scale: [1.1, 0.9, 1], mottle: 0.5 },
    ];
    // crust broken into plates
    for (let i = 0; i < 4; i++) {
      const a = rng() * Math.PI * 2, d = rng() * 0.012;
      pieces.push({ geo: dome(0.007 + rng() * 0.005, 0.0022, 7), color: CHAR2,
        at: [Math.cos(a) * d, Math.sin(a) * d, 0.0034], mottle: 0.4 });
    }
    // blisters round the edge
    const n = 4 + ((rng() * 4) | 0);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, d = 0.026 + rng() * 0.012;
      const r = 0.003 + rng() * 0.004;
      pieces.push({ geo: dome(r, r * 0.8, 8), color: BLISTER, at: [Math.cos(a) * d, Math.sin(a) * d, 0.0008] });
    }
    return bake(pieces);
  });
  return shapes;
}

let SHAPES = null;
let MATERIAL = null;

/* ---------------------------------- system --------------------------------- */

export class WoundSystem {
  constructor(game) {
    this.game = game;
    this.rng = makeRng(0x3e0d);
    if (!SHAPES) {
      SHAPES = buildShapes();
      MATERIAL = new MeshLambertMaterial({ vertexColors: true });
    }
    /** character -> [{ mesh, kind, bone, local, size }] in the order they came */
    this.byBody = new Map();
    this.count = 0;
  }

  /**
   * Opens a wound where a hit landed.
   *
   * @param {Character} c
   * @param {string} boneName
   * @param {Vector3} point  world point of the hit
   * @param {string} kind  'hole' | 'gash' | 'split' | 'burn'
   * @param {object} o  severity 0..1, dir (world direction the hit travelled)
   */
  add(c, boneName, point, kind, { severity = 0.6, dir = null } = {}) {
    const shapes = SHAPES[kind];
    if (!shapes || !c || c.body?.destroyed) return null;
    const entry = c.body.entries.get(boneName);
    if (!entry || entry.detached || entry.bone.def.finger) return null;
    const bone = entry.bone;
    const rng = this.rng;
    const sev = clamp01(severity);

    /* Onto the outside of the part: whichever face the hit is nearest, at
       the surface of the clothes if there are any. */
    const half = entry.cloth ? entry.cloth.half : bone.boxHalf;
    worldToBoxLocal(bone, point, _local);
    const rx = Math.abs(_local.x) / half.x, ry = Math.abs(_local.y) / half.y, rz = Math.abs(_local.z) / half.z;
    _n.set(0, 0, 0);
    if (rx >= ry && rx >= rz) _n.x = Math.sign(_local.x) || 1;
    else if (ry >= rz) _n.y = Math.sign(_local.y) || 1;
    else _n.z = Math.sign(_local.z) || 1;
    // a wound sits on the face, never off the edge of it
    const along = (v, h) => Math.max(-h * 0.8, Math.min(h * 0.8, v));
    _local.set(
      _n.x ? _n.x * half.x : along(_local.x, half.x),
      _n.y ? _n.y * half.y : along(_local.y, half.y),
      _n.z ? _n.z * half.z : along(_local.z, half.z),
    ).addScaledVector(_n, 0.0006);

    const list = this._list(c);

    // Burns do not stack into a pile of separate patches: a fresh one close
    // to an old one makes the old one bigger.
    if (kind === 'burn') {
      for (const w of list) {
        if (w.kind !== 'burn' || w.bone !== boneName) continue;
        if (w.local.distanceToSquared(_local) > 0.03 * 0.03 * w.size * w.size * 1.8) continue;
        w.size = Math.min(1.9, w.size + 0.08 + sev * 0.1);
        this._place(w, half);
        return w;
      }
    }

    // face it out of the body, turned to line up with the blow
    _q.setFromUnitVectors(_z, _n);
    let spin = rng() * Math.PI * 2;
    if (dir && (kind === 'gash' || kind === 'split')) {
      // the cut runs the way the blade did, across the face it opened
      _d.copy(dir).applyQuaternion(_q2.copy(bone.worldQuat).invert());
      _d.addScaledVector(_n, -_d.dot(_n));
      if (_d.lengthSq() > 1e-6) {
        _t.set(1, 0, 0).applyQuaternion(_q);
        const b = _s.copy(_n).cross(_t);
        spin = Math.atan2(_d.dot(b), _d.dot(_t));
      }
    }
    _q2.setFromAxisAngle(_z, spin);
    _q.multiply(_q2);

    const variants = shapes;
    const pick = kind === 'gash' ? (sev > 0.75 ? 1 : 0) : (rng() * variants.length) | 0;
    const mesh = new Mesh(variants[pick], MATERIAL);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.name = 'wound';
    const size = (kind === 'hole' ? 0.9 + sev * 0.35 : 0.7 + sev * 0.5) * (0.85 + rng() * 0.3);
    const axis = _n.x ? 'x' : _n.y ? 'y' : 'z';
    const w = { mesh, kind, bone: boneName, local: _local.clone(), quat: _q.clone(), size, entry, axis };
    this._place(w, half);
    entry.skin.mesh.add(mesh);
    list.push(w);
    this.count++;

    while (list.length > PER_BODY) this._drop(c, list[0]);
    if (this.count > TOTAL) this._dropOldest();
    return w;
  }

  _place(w, half) {
    // as big as it wants to be, but never wider than the face it is on
    let s = w.size;
    const face = w.axis === 'x' ? Math.min(half.y, half.z) : w.axis === 'y' ? Math.min(half.x, half.z)
      : Math.min(half.x, half.y);
    const base = { hole: 0.03, gash: 0.11, split: 0.06, burn: 0.08 }[w.kind];
    if (base * s > face * 2.1) s = (face * 2.1) / base;
    w.mesh.position.copy(w.local);
    w.mesh.quaternion.copy(w.quat);
    w.mesh.scale.set(s, s, Math.min(1.4, s));
    w.mesh.updateMatrix();
  }

  _list(c) {
    let list = this.byBody.get(c);
    if (!list) { list = []; this.byBody.set(c, list); }
    return list;
  }

  _drop(c, w) {
    const list = this.byBody.get(c);
    const i = list ? list.indexOf(w) : -1;
    if (i >= 0) list.splice(i, 1);
    w.mesh.removeFromParent();
    this.count--;
  }

  _dropOldest() {
    // the person carrying the most gives one up
    let worst = null, n = 0;
    for (const [c, list] of this.byBody) if (list.length > n) { n = list.length; worst = c; }
    if (worst) this._drop(worst, this.byBody.get(worst)[0]);
  }

  /** How many open wounds someone has, of one kind or of all. */
  countOn(c, kind = null) {
    const list = this.byBody.get(c);
    if (!list) return 0;
    return kind ? list.filter((w) => w.kind === kind).length : list.length;
  }

  /** Healed: respawning, or the map being washed. */
  clear(c) {
    const list = this.byBody.get(c);
    if (!list) return;
    for (const w of list) w.mesh.removeFromParent();
    this.count -= list.length;
    this.byBody.delete(c);
  }

  /** Forget whoever has gone. Their meshes went with their bodies. */
  prune() {
    for (const [c, list] of this.byBody) {
      if (!c.body?.destroyed && this.game.characters.includes(c)) continue;
      this.count -= list.length;
      this.byBody.delete(c);
    }
  }

  clearAll() {
    for (const c of [...this.byBody.keys()]) this.clear(c);
  }
}
