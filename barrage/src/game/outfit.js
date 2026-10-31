/* =============================================================================
   What you wear: the wood armour and the accessories.

   Armour is boxes of oak a little bigger than the body parts they cover,
   carried by the same bones as the body - so a helmet goes where the head
   goes, all the way down when you are knocked flat. A blow that lands on
   the wood does a share less, and leaves its mark on the wood instead of on
   you: a dent from a fist or a foot, a gouge from a blade, a splintered pit
   from a bullet. Where the wood stops - your face under the helmet's brim -
   blows land as they always did. Blood that lands on the wood stains it.

   All four pieces of one set together make you harder to knock down. The
   bead bracelet brings your stamina back faster; the oak charm adds to your
   health. Two of the same accessory add up.
   ========================================================================== */
import { SkinnedMesh, MeshLambertMaterial, Matrix4, Vector3 } from 'three';
import { packBoxes, buildBoxGeometry, PaintCanvas } from './paint.js';
import { P, NP } from './rig.js';
import { ITEMS, ARMOUR, ACCESSORIES } from './gear.js';
import { rng, shade } from '../core/util.js';

const OAK = '#a8743e';
const CAP = '#9b6a37';
const DARK = '#6a4220';
const CORD = '#3a2616';
const _l = new Vector3();

/** One box of an outfit: on `part`, `size` across, centred at `at` in the part's frame. */
const box = (part, size, at, tex = 'oak') => ({ part: P[part], size: new Vector3(...size), at: new Vector3(...at), tex });

/** The boxes a piece is made of, worn in `slot`; `gear` is everything worn, for things that sit on others. */
function pieces(kind, slot, gear) {
  const side = slot === 'acc2' ? 'R' : 'L';
  switch (kind) {
    case 'wood_helmet': return [
      box('head', [0.236, 0.082, 0.256], [0, 0.085, 0], 'cap'),        // the cap, down to the brow
      box('head', [0.236, 0.13, 0.034], [0, 0, -0.116]),              // down the back of the head
      box('head', [0.03, 0.074, 0.022], [0, 0.012, 0.119], 'dark'),    // over the nose
    ];
    case 'wood_chestplate': return [
      box('upperTorso', [0.404, 0.212, 0.238], [0, 0.004, 0.002]),
      box('middleTorso', [0.334, 0.158, 0.218], [0, 0, 0.002]),
      box('lowerTorso', [0.302, 0.12, 0.206], [0, 0.005, 0.002]),
      box('upperArmL', [0.136, 0.105, 0.136], [0, 0.105, 0], 'dark'),
      box('upperArmR', [0.136, 0.105, 0.136], [0, 0.105, 0], 'dark'),
    ];
    case 'wood_leggings': return [
      box('pelvis', [0.356, 0.15, 0.236], [0, 0, 0], 'dark'),
      box('upperLegL', [0.164, 0.34, 0.174], [0, 0.035, 0]),
      box('upperLegR', [0.164, 0.34, 0.174], [0, 0.035, 0]),
      box('lowerLegL', [0.134, 0.09, 0.146], [0, 0.17, 0.004], 'dark'),
      box('lowerLegR', [0.134, 0.09, 0.146], [0, 0.17, 0.004], 'dark'),
    ];
    case 'wood_boots': return [
      box('lowerLegL', [0.134, 0.22, 0.146], [0, -0.095, 0.004]),
      box('lowerLegR', [0.134, 0.22, 0.146], [0, -0.095, 0.004]),
      box('footL', [0.124, 0.096, 0.284], [0, 0.008, 0], 'dark'),
      box('footR', [0.124, 0.096, 0.284], [0, 0.008, 0], 'dark'),
    ];
    case 'bead_bracelet': return [box('lowerArm' + side, [0.105, 0.036, 0.105], [0, -0.095, 0], 'beads')];
    case 'oak_charm': {
      // on the chest, in front of the chestplate if there is one; two charms hang side by side
      const z = (gear.chest ? 0.121 : 0.105) + 0.009;
      const two = gear.acc1 === 'oak_charm' && gear.acc2 === 'oak_charm';
      const out = [box('upperTorso', [0.052, 0.062, 0.018], [two ? (slot === 'acc1' ? 0.034 : -0.034) : 0, 0.03, z], 'charm')];
      if (!two || slot === 'acc1') out.push(box('neck', [0.114, 0.016, 0.114], [0, -0.02, 0], 'cord'));
      return out;
    }
  }
  return [];
}

/* -------------------------------------------------------------------------- */
/*                                  painting                                  */
/* -------------------------------------------------------------------------- */

/** Oak slats running the long way, darker seams, grain, and worn dark edges. */
function paintWood(ctx, t, r, base) {
  ctx.fillStyle = base;
  ctx.fillRect(t.x - 2, t.y - 2, t.w + 4, t.h + 4);
  const along = t.h >= t.w;
  const span = along ? t.w : t.h, len = along ? t.h : t.w;
  const n = Math.max(1, Math.round(span / 14));
  for (let i = 0; i < n; i++) {
    const a = (i * span) / n, b = ((i + 1) * span) / n;
    ctx.fillStyle = shade(base, 0.86 + r() * 0.26);
    if (along) ctx.fillRect(t.x + a, t.y, b - a, t.h); else ctx.fillRect(t.x, t.y + a, t.w, b - a);
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = `rgba(66, 36, 12, ${0.14 + r() * 0.2})`;
      const p = a + r() * (b - a), from = r() * len * 0.4, l = len * (0.3 + r() * 0.6);
      if (along) ctx.fillRect(t.x + p, t.y + from, 1, l); else ctx.fillRect(t.x + from, t.y + p, l, 1);
    }
    if (i > 0) {
      ctx.fillStyle = 'rgba(36, 20, 8, 0.6)';
      if (along) ctx.fillRect(t.x + a - 0.5, t.y, 1.2, t.h); else ctx.fillRect(t.x, t.y + a - 0.5, t.w, 1.2);
    }
  }
  // the edges, handled dark
  const e = Math.max(1, Math.min(t.w, t.h) * 0.07);
  ctx.strokeStyle = 'rgba(40, 22, 8, 0.55)';
  ctx.lineWidth = e;
  ctx.strokeRect(t.x + e / 2, t.y + e / 2, t.w - e, t.h - e);
  // and pegs at the corners of the bigger faces
  if (t.w > 24 && t.h > 24) {
    ctx.fillStyle = 'rgba(30, 16, 6, 0.8)';
    const m = e * 2.2, s = Math.max(1.5, e * 0.9);
    for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) ctx.fillRect(t.x + m + u * (t.w - 2 * m) - s / 2, t.y + m + v * (t.h - 2 * m) - s / 2, s, s);
  }
}

function paintBeads(ctx, t, r) {
  ctx.fillStyle = CORD;
  ctx.fillRect(t.x - 2, t.y - 2, t.w + 4, t.h + 4);
  const d = Math.max(2, Math.min(t.h, t.w) * 0.9);
  const n = Math.max(1, Math.floor(Math.max(t.w, t.h) / (d * 1.05)));
  const along = t.w >= t.h;
  for (let i = 0; i < n; i++) {
    const c = (i + 0.5) * (Math.max(t.w, t.h) / n);
    const x = along ? t.x + c : t.x + t.w / 2, y = along ? t.y + t.h / 2 : t.y + c;
    ctx.fillStyle = i % 2 ? '#7a4a22' : '#c48c4e';
    ctx.beginPath(); ctx.arc(x, y, d / 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 236, 200, 0.35)';
    ctx.fillRect(x - d * 0.22, y - d * 0.28, Math.max(1, d * 0.18), Math.max(1, d * 0.18));
  }
}

function paintCharm(ctx, t, r) {
  paintWood(ctx, t, r, '#c08a50');
  // a carved knot: a ring, crossed
  const cx = t.x + t.w / 2, cy = t.y + t.h / 2, rr = Math.min(t.w, t.h) * 0.3;
  ctx.strokeStyle = 'rgba(52, 28, 10, 0.85)';
  ctx.lineWidth = Math.max(1, rr * 0.35);
  ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - rr * 1.3, cy); ctx.lineTo(cx + rr * 1.3, cy); ctx.moveTo(cx, cy - rr * 1.3); ctx.lineTo(cx, cy + rr * 1.3); ctx.stroke();
}

function paintBox(ctx, tiles, tex, r) {
  for (const t of tiles) {
    if (tex === 'beads') paintBeads(ctx, t, r);
    else if (tex === 'cord') { ctx.fillStyle = CORD; ctx.fillRect(t.x - 2, t.y - 2, t.w + 4, t.h + 4); }
    else if (tex === 'charm') paintCharm(ctx, t, r);
    else paintWood(ctx, t, r, tex === 'dark' ? DARK : tex === 'cap' ? CAP : OAK);
  }
}

/* -------------------------------------------------------------------------- */
/*                                  the outfit                                */
/* -------------------------------------------------------------------------- */

export class Outfit {
  constructor(fighter) {
    this.f = fighter;
    this.mesh = null;
    this.boxes = [];
    this.byPart = Array.from({ length: NP }, () => []);
    this.pad = new Float32Array(NP).fill(0.004);   // how far past each body part the outfit reaches
    this.worn = {};
  }

  /** Puts on what `gear` says: { helmet, chest, legs, boots, acc1, acc2 } item ids or null. */
  set(gear) {
    const worn = {};
    for (const s of [...ARMOUR, ...ACCESSORIES]) worn[s] = gear[s] && ITEMS[gear[s]] ? gear[s] : null;
    if (JSON.stringify(worn) === JSON.stringify(this.worn) && (this.mesh || !this.boxes.length)) return;
    this.clear();
    this.worn = worn;
    const boxes = [];
    for (const s of [...ARMOUR, ...ACCESSORIES]) {
      const kind = worn[s];
      if (!kind) continue;
      const T = ITEMS[kind];
      for (const b of pieces(kind, s, worn)) boxes.push({ ...b, kind, guard: T.guard || 0 });
    }
    this.boxes = boxes;
    if (!boxes.length) return;
    for (const b of boxes) this.byPart[b.part].push(b);
    for (let i = 0; i < NP; i++) {
      let pad = 0.004;
      const half = this.f.bodies[i].half;
      for (const b of this.byPart[i]) {
        pad = Math.max(pad,
          Math.abs(b.at.x) + b.size.x / 2 - half.x,
          Math.abs(b.at.y) + b.size.y / 2 - half.y,
          Math.abs(b.at.z) + b.size.z / 2 - half.z);
      }
      this.pad[i] = pad;
    }
    this.layout = packBoxes(boxes.map((b) => ({ size: b.size, density: b.tex === 'beads' || b.tex === 'charm' || b.tex === 'cord' ? 600 : 260 })), 512);
    const geometry = buildBoxGeometry(boxes.map((b) => ({ size: b.size, offset: b.at, bone: b.part })), this.layout, true);
    this.paint = new PaintCanvas(this.layout.width, this.layout.height);
    const r = rng(7);
    boxes.forEach((b, i) => paintBox(this.paint.ctx, this.layout.tiles[i], b.tex, r));
    this.paint.dirty = true;
    this.material = new MeshLambertMaterial({ map: this.paint.texture });
    this.mesh = new SkinnedMesh(geometry, this.material);
    this.mesh.bind(this.f.mesh.skeleton, new Matrix4());
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.f.game.scene.add(this.mesh);
    if (this.f.fade < 1) this.setFade(this.f.fade);
  }

  clear() {
    if (this.mesh) {
      this.f.game.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.material.dispose();
      this.paint.dispose();
      this.mesh = null;
    }
    this.boxes = [];
    for (const l of this.byPart) l.length = 0;
    this.pad.fill(0.004);
    this.worn = {};
  }

  /** How many pieces of one set are on: { set: count }. */
  sets() {
    const n = {};
    for (const s of ARMOUR) {
      const T = ITEMS[this.worn[s]];
      if (T && T.set) n[T.set] = (n[T.set] || 0) + 1;
    }
    return n;
  }

  /** The armour box on `part` that a point (in the part's frame) is under, or null. */
  over(part, local, slack = 0.012) {
    for (const b of this.byPart[part]) {
      if (!b.guard) continue;
      if (Math.abs(local.x - b.at.x) <= b.size.x / 2 + slack &&
          Math.abs(local.y - b.at.y) <= b.size.y / 2 + slack &&
          Math.abs(local.z - b.at.z) <= b.size.z / 2 + slack) return b;
    }
    return null;
  }

  /** The armour a blow at a world point on `part` lands on, or null. */
  covering(part, point) {
    if (!this.byPart[part].length) return null;
    return this.over(part, this.f.bodies[part].toLocal(point, _l));
  }

  /** Paints on box b; local is in its part's frame. */
  paintOn(b, local, radius, opts) {
    const i = this.boxes.indexOf(b);
    if (i < 0) return;
    _l.copy(local).sub(b.at);
    this.paint.splat(_l, b.size, this.layout.tiles[i], radius, opts);
  }

  /**
   * Blood (or anything else) landing at a point on `part`, in the part's
   * frame: painted on whatever is worn there. False if nothing is.
   */
  splat(part, local, radius, opts) {
    for (const b of this.byPart[part]) {
      if (Math.abs(local.x - b.at.x) <= b.size.x / 2 + 0.006 &&
          Math.abs(local.y - b.at.y) <= b.size.y / 2 + 0.006 &&
          Math.abs(local.z - b.at.z) <= b.size.z / 2 + 0.006) {
        this.paintOn(b, local, radius, opts);
        return true;
      }
    }
    return false;
  }

  setFade(f) {
    if (!this.mesh) return;
    const m = this.material;
    m.transparent = f < 1;
    m.opacity = f;
    m.depthWrite = f > 0.5;
  }
}
