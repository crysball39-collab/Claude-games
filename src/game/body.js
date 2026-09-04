/* =============================================================================
   The visible body: one six sided box per part, garments layered over the skin,
   hair on the head, a painted face, and the machinery that lets damage be drawn
   onto whichever surface actually got hit.
   ========================================================================== */
import { Group, Mesh, MeshLambertMaterial, Vector3, Color, DoubleSide, FrontSide } from 'three';
import {
  makeAtlasBoxGeometry, localPointToFaceUV, worldToBoxLocal, FACE_NZ,
} from './skeleton.js';
import { PaintSurface, paintBlood, paintBruise, paintTear, drawFace, paintSplat } from './paint.js';
import { makeRng, clamp01 } from '../core/util.js';

const _v = new Vector3();
const _local = new Vector3();

/* Box geometries are shared between every character that uses the same size. */
const geoCache = new Map();
function boxGeo(size) {
  const key = `${size.x.toFixed(4)}_${size.y.toFixed(4)}_${size.z.toFixed(4)}`;
  let g = geoCache.get(key);
  if (!g) { g = makeAtlasBoxGeometry(size.x, size.y, size.z); geoCache.set(key, g); }
  return g;
}

const CLOTH_MARGIN = 0.013;

function clothSize(size, extra = CLOTH_MARGIN) {
  return new Vector3(size.x + extra, size.y + extra * 0.35, size.z + extra);
}

/* -------------------------------------------------------------------------- */

export class Body {
  /**
   * @param {SkeletonRig} rig
   * @param {object} look  result of makeAppearance()
   */
  constructor(rig, look, { castShadow = true, seed = 1 } = {}) {
    this.rig = rig;
    this.look = look;
    this.rng = makeRng(seed);
    this.group = new Group();
    this.group.matrixAutoUpdate = false;
    this.group.matrix.identity();
    this.entries = new Map();     // boneName -> { skin, cloth }
    this.meshes = [];
    this.materials = [];
    this.surfaces = [];
    this.castShadow = castShadow;
    this.mouth = 'neutral';
    this.destroyed = false;

    this.sharedFingerMat = new MeshLambertMaterial({ color: look.skin });
    this.materials.push(this.sharedFingerMat);

    this._build();
  }

  /* ------------------------------- building ------------------------------ */

  _build() {
    const look = this.look;
    for (const bone of this.rig.bones) {
      const def = bone.def;
      const entry = { bone, skin: null, cloth: null };

      // ---- skin / flesh box ----
      const isFinger = !!def.finger;
      const mat = isFinger ? this.sharedFingerMat : new MeshLambertMaterial({ color: look.skin.clone() });
      if (!isFinger) this.materials.push(mat);
      const mesh = new Mesh(boxGeo(bone.boxSize), mat);
      mesh.castShadow = this.castShadow && !isFinger;
      mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.userData.bone = bone;
      this.group.add(mesh);
      this.meshes.push(mesh);
      entry.skin = {
        mesh, material: mat, kind: 'skin', cell: def.atlas || 24,
        base: look.skin.clone(), surface: null, bone,
      };

      // ---- garment ----
      const garment = this._garmentFor(def);
      if (garment) {
        const size = clothSize(bone.boxSize);
        const cmat = new MeshLambertMaterial({ color: garment.color.clone(), side: FrontSide });
        this.materials.push(cmat);
        const cmesh = new Mesh(boxGeo(size), cmat);
        cmesh.castShadow = this.castShadow;
        cmesh.matrixAutoUpdate = false;
        cmesh.userData.bone = bone;
        this.group.add(cmesh);
        this.meshes.push(cmesh);
        entry.cloth = {
          mesh: cmesh, material: cmat, kind: 'cloth', cell: def.atlas || 24,
          base: garment.color.clone(), surface: null, bone,
          half: new Vector3().copy(size).multiplyScalar(0.5),
          torn: 0, garment: garment.name,
        };
      }

      this.entries.set(bone.name, entry);
    }

    this._buildHair();
    this._buildFace();
  }

  _garmentFor(def) {
    const look = this.look;
    switch (def.cloth) {
      case 'shirt': return { name: 'shirt', color: look.shirt };
      case 'sleeve': return { name: 'shirt', color: look.shirt };
      case 'cuff': return look.longSleeves ? { name: 'shirt', color: look.shirt } : null;
      case 'pants': return { name: 'pants', color: look.pants };
      case 'pantLeg': return look.longPants ? { name: 'pants', color: look.pants } : null;
      case 'shoe': return { name: 'shoes', color: look.shoes };
      default: return null;
    }
  }

  _buildHair() {
    const style = this.look.hairStyle;
    if (style === 'bald') { this.hairMeshes = []; return; }
    const head = this.rig.byName.head;
    const hs = head.boxSize;
    // The hairline must stay above the eyebrows, which sit at about 30% down
    // the head - hence the offsets below.
    const defs = {
      buzz: [{ s: [hs.x + 0.006, 0.052, hs.z + 0.006], o: [0, 0.2095, 0] }],
      short: [{ s: [hs.x + 0.011, 0.084, hs.z + 0.011], o: [0, 0.2050, 0] }],
      mop: [
        { s: [hs.x + 0.019, 0.098, hs.z + 0.019], o: [0, 0.2120, 0] },
        // side and back fall, kept behind the face
        { s: [hs.x + 0.019, 0.095, 0.030], o: [0, 0.128, -(hs.z / 2) - 0.006] },
        { s: [0.024, 0.095, hs.z * 0.86], o: [(hs.x / 2) + 0.007, 0.128, -0.022] },
        { s: [0.024, 0.095, hs.z * 0.86], o: [-(hs.x / 2) - 0.007, 0.128, -0.022] },
      ],
      tall: [
        { s: [hs.x - 0.014, 0.055, hs.z - 0.014], o: [0, 0.2085, 0] },
        { s: [hs.x - 0.055, 0.105, hs.z - 0.055], o: [0, 0.285, 0] },
      ],
    }[style] || [];
    this.hairMeshes = [];
    const mat = new MeshLambertMaterial({ color: this.look.hair });
    this.materials.push(mat);
    for (const d of defs) {
      const m = new Mesh(boxGeo(_v.set(d.s[0], d.s[1], d.s[2])), mat);
      m.castShadow = this.castShadow;
      m.matrixAutoUpdate = false;
      m.userData.hairOffset = new Vector3(d.o[0], d.o[1], d.o[2]);
      this.group.add(m);
      this.meshes.push(m);
      this.hairMeshes.push(m);
    }
  }

  _buildFace() {
    const entry = this.entries.get('head').skin;
    const surf = this._ensureSurface(entry);
    this.faceSurface = surf;
    this._drawFaceInto(surf);
    surf.flush();
  }

  _drawFaceInto(surf) {
    const look = this.look;
    surf.withFace(FACE_NZ, (ctx, w, h) => {
      drawFace(ctx, w, h, {
        eyeColor: look.eye,
        browColor: '#' + (look.hairStyle === 'bald' ? look.skinShadow : look.hair).getHexString(),
        mouth: this.mouth,
        skinShadow: '#' + look.skinShadow.getHexString(),
      });
    });
  }

  /** Redraws the face (used when the expression changes). */
  setExpression(mouth) {
    if (mouth === this.mouth || !this.faceSurface) return;
    this.mouth = mouth;
    const entry = this.entries.get('head').skin;
    // repaint the base skin on the face cell, then the new expression
    this.faceSurface.withFace(FACE_NZ, (ctx, w, h) => {
      ctx.fillStyle = '#' + entry.base.getHexString();
      ctx.fillRect(0, 0, w, h);
    });
    this._drawFaceInto(this.faceSurface);
    // damage that had been painted on the face is lost; re-blot lightly
    if (this.faceSurface.bloodAmount > 0) {
      this.faceSurface.withFace(FACE_NZ, (ctx, w, h) => {
        paintBlood(ctx, w * 0.5, h * 0.62, w * 0.14, 0.6, this.rng, 0.4);
      });
    }
    this.faceSurface.flush();
  }

  /* ------------------------------- surfaces ------------------------------ */

  _ensureSurface(entry) {
    if (entry.surface) return entry.surface;
    const base = entry.base;
    const hex = '#' + base.getHexString();
    const isCloth = entry.kind === 'cloth';
    const rng = this.rng;
    const surf = new PaintSurface(entry.cell, (ctx, w, h) => {
      ctx.fillStyle = hex;
      ctx.fillRect(0, 0, w, h);
      // A whisper of texture so flat boxes do not look like plastic.
      const n = isCloth ? 240 : 150;
      for (let i = 0; i < n; i++) {
        const x = rng() * w, y = rng() * h;
        ctx.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)';
        ctx.fillRect(x, y, 1 + rng() * 1.6, 1 + rng() * 1.6);
      }
      if (isCloth) {
        ctx.strokeStyle = 'rgba(0,0,0,0.05)';
        ctx.lineWidth = 1;
        for (let y = 0; y < h; y += 3) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      }
    }, { alphaCut: isCloth });

    entry.material.map = surf.texture;
    entry.material.color.set(0xffffff);
    if (isCloth) {
      entry.material.alphaTest = 0.5;
      entry.material.side = DoubleSide;
    }
    entry.material.needsUpdate = true;
    entry.surface = surf;
    this.surfaces.push(surf);
    return surf;
  }

  /* -------------------------------- damage ------------------------------- */

  /**
   * Paints a hit. `kind` decides which inks are used:
   *   'blunt'  - bruising, only bleeds when it is very heavy
   *   'impact' - bruising plus blood
   *   'blood'  - splatter arriving from somewhere else
   */
  paintHit(boneName, worldPoint, {
    kind = 'blunt', severity = 1, dir = null, allowTear = true, dark = 0,
  } = {}) {
    const entry = this.entries.get(boneName);
    if (!entry) return;
    const bone = entry.bone;
    worldToBoxLocal(bone, worldPoint, _local);

    const rng = this.rng;
    const cloth = entry.cloth;
    const skin = entry.skin;

    const clothHalf = cloth ? cloth.half : null;
    const skinUV = localPointToFaceUV(_local, bone.boxHalf);
    const clothUV = cloth ? localPointToFaceUV(_local, clothHalf) : null;

    const sev = clamp01(severity);

    if (kind === 'blood') {
      // Splatter landing from outside: it lands on whatever is on the outside.
      const target = cloth ? cloth : skin;
      const uv = cloth ? clothUV : skinUV;
      const surf = this._ensureSurface(target);
      surf.paintFace(uv.face, uv.u, uv.v, (ctx, x, y, cell) => {
        const r = cell * (0.06 + sev * 0.16);
        if (dir) paintSplat(ctx, x, y, r, dir.x, dir.y, rng, dark);
        else paintBlood(ctx, x, y, r, sev * 0.7, rng, dark);
      });
      surf.bloodAmount += sev;
      return;
    }

    // ---- bruising: always on the skin, even under clothing ----
    if (kind === 'blunt' || kind === 'impact') {
      const surf = this._ensureSurface(skin);
      surf.paintFace(skinUV.face, skinUV.u, skinUV.v, (ctx, x, y, cell) => {
        paintBruise(ctx, x, y, cell * (0.10 + sev * 0.20), 0.4 + sev * 0.7, rng);
      });
      surf.bruiseAmount += sev;
    }

    // ---- scuffing / dirt on the garment from a blunt hit ----
    if (cloth && kind === 'blunt' && rng() < 0.5) {
      const surf = this._ensureSurface(cloth);
      surf.paintFace(clothUV.face, clothUV.u, clothUV.v, (ctx, x, y, cell) => {
        ctx.fillStyle = `rgba(30,24,18,${0.10 + rng() * 0.14})`;
        ctx.beginPath(); ctx.arc(x, y, cell * (0.08 + rng() * 0.12), 0, Math.PI * 2); ctx.fill();
      });
    }

    // ---- bleeding ----
    const bleeds = kind === 'impact' || (kind === 'blunt' && sev > 0.82 && rng() < 0.30);
    if (bleeds) {
      const outer = cloth || skin;
      const uv = cloth ? clothUV : skinUV;
      const surf = this._ensureSurface(outer);
      surf.paintFace(uv.face, uv.u, uv.v, (ctx, x, y, cell) => {
        paintBlood(ctx, x, y, cell * (0.09 + sev * 0.20), sev, rng, dark);
      });
      surf.bloodAmount += sev;
      if (cloth) {
        // it soaks through onto the skin as well
        const s2 = this._ensureSurface(skin);
        s2.paintFace(skinUV.face, skinUV.u, skinUV.v, (ctx, x, y, cell) => {
          paintBlood(ctx, x, y, cell * (0.08 + sev * 0.16), sev * 0.8, rng, 0.3);
        });
        s2.bloodAmount += sev * 0.6;
      }
    }

    // ---- cloth tears: rare from blunt force, common from real damage ----
    if (allowTear && cloth) {
      const chance = kind === 'blunt' ? 0.05 * sev : 0.34 * sev;
      if (rng() < chance) {
        const surf = this._ensureSurface(cloth);
        surf.paintFace(clothUV.face, clothUV.u, clothUV.v, (ctx, x, y, cell) => {
          paintTear(ctx, x, y, cell * (0.08 + sev * 0.16), rng);
        });
        surf.tearAmount += sev;
        cloth.torn += sev;
      }
    }
  }

  /** Blood arriving from a spray, aimed at the closest part. */
  splatterAt(boneName, worldPoint, dirX, dirY, severity) {
    this.paintHit(boneName, worldPoint, { kind: 'blood', severity, dir: { x: dirX, y: dirY }, dark: 0 });
  }

  flush() {
    for (let i = 0; i < this.surfaces.length; i++) this.surfaces[i].flush();
  }

  washClean() {
    for (const entry of this.entries.values()) {
      for (const e of [entry.skin, entry.cloth]) {
        if (!e || !e.surface) continue;
        e.surface.dispose();
        e.material.map = null;
        e.material.color.copy(e.base);
        e.material.alphaTest = 0;
        e.material.needsUpdate = true;
        e.surface = null;
      }
    }
    this.surfaces.length = 0;
    this.faceSurface = null;
    this._buildFace();
  }

  /* ------------------------------- transform ----------------------------- */

  /** Copies the rig's world transforms onto the meshes. */
  sync() {
    for (const entry of this.entries.values()) {
      const bone = entry.bone;
      _v.copy(bone.boxOffset).applyQuaternion(bone.worldQuat).add(bone.worldPos);
      const s = entry.skin.mesh;
      s.position.copy(_v);
      s.quaternion.copy(bone.worldQuat);
      s.updateMatrix();
      if (entry.cloth) {
        const c = entry.cloth.mesh;
        c.position.copy(_v);
        c.quaternion.copy(bone.worldQuat);
        c.updateMatrix();
      }
    }
    if (this.hairMeshes) {
      const head = this.rig.byName.head;
      for (const m of this.hairMeshes) {
        _v.copy(m.userData.hairOffset).applyQuaternion(head.worldQuat).add(head.worldPos);
        m.position.copy(_v);
        m.quaternion.copy(head.worldQuat);
        m.updateMatrix();
      }
    }
  }

  setVisible(v) { this.group.visible = v; }

  dispose() {
    this.destroyed = true;
    for (const s of this.surfaces) s.dispose();
    for (const m of this.materials) { if (m.map) m.map.dispose?.(); m.dispose(); }
    this.group.removeFromParent();
    this.meshes.length = 0;
  }
}

export { Color };
