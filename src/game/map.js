/* =============================================================================
   Maps. There is one for now: the Test Baseplate, a grass plate.
   ========================================================================== */
import {
  Group, Mesh, BoxGeometry, PlaneGeometry, MeshLambertMaterial, MeshBasicMaterial,
  DirectionalLight, HemisphereLight, AmbientLight, Fog, Color, BackSide, Vector3,
  SphereGeometry, DoubleSide,
} from 'three';
import { makeGrassTexture, makeSkyTexture } from './textures.js';

export const MAPS = [
  {
    id: 'baseplate',
    name: 'Test Baseplate',
    subtitle: 'Grass plate &middot; 80 x 80 m',
    description:
      'A flat green plate with nothing on it and nothing to stop you. ' +
      'Spawn crates, boulders and citizens, then find out what happens to them.',
    build: buildBaseplate,
  },
];

export function getMap(id) { return MAPS.find((m) => m.id === id) || MAPS[0]; }

/* -------------------------------------------------------------------------- */

function buildBaseplate(ctx) {
  const { scene, world, quality } = ctx;
  const group = new Group();
  const HALF = 40;
  const disposables = [];

  /* ------------------------------- lighting ------------------------------ */
  scene.background = new Color(0x9dc0dd);
  scene.fog = new Fog(0xa8c6dc, 55, 190);

  const hemi = new HemisphereLight(0xbcd8f2, 0x4a5a34, 0.85);
  scene.add(hemi);

  const sun = new DirectionalLight(0xfff3dc, 1.55);
  sun.position.set(38, 56, 22);
  sun.target.position.set(0, 0, 0);
  scene.add(sun);
  scene.add(sun.target);
  if (quality.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
    const d = 22;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 140;
    sun.shadow.bias = -0.0016;
    sun.shadow.normalBias = 0.028;
  }
  const amb = new AmbientLight(0xffffff, 0.24);
  scene.add(amb);

  /* --------------------------------- sky --------------------------------- */
  const skyTex = makeSkyTexture();
  const skyMat = new MeshBasicMaterial({ map: skyTex, side: BackSide, fog: false, depthWrite: false });
  const sky = new Mesh(new SphereGeometry(420, 24, 16), skyMat);
  sky.frustumCulled = false;
  group.add(sky);
  disposables.push(sky.geometry, skyMat, skyTex);

  /* ------------------------------ the plate ------------------------------ */
  const grass = makeGrassTexture(quality.grassSize, 7);
  grass.texture.repeat.set(28, 28);
  const plateMat = new MeshLambertMaterial({ map: grass.texture });
  const plate = new Mesh(new BoxGeometry(HALF * 2, 2, HALF * 2), plateMat);
  plate.position.set(0, -1, 0);
  plate.receiveShadow = quality.shadows;
  group.add(plate);
  disposables.push(plate.geometry, plateMat, grass.texture);

  // Painted-on side walls so the edge of the world reads as a slab, not a void.
  const sideMat = new MeshLambertMaterial({ color: 0x53412c });
  const side = new Mesh(new BoxGeometry(HALF * 2 + 0.02, 1.9, HALF * 2 + 0.02), sideMat);
  side.position.set(0, -1.02, 0);
  group.add(side);
  disposables.push(side.geometry, sideMat);

  /* ------------------------------ blood decals ---------------------------- */
  // filled in by the gore system; the sheet lives one centimetre above the grass
  const decalGeo = new PlaneGeometry(HALF * 2, HALF * 2);
  const decalMat = new MeshBasicMaterial({
    transparent: true, depthWrite: false, side: DoubleSide, opacity: 0.94,
  });
  const decal = new Mesh(decalGeo, decalMat);
  decal.rotation.x = -Math.PI / 2;
  decal.position.y = 0.012;
  decal.renderOrder = 2;
  group.add(decal);
  disposables.push(decalGeo, decalMat);

  scene.add(group);

  world.hasGround = true;
  world.groundY = 0;
  world.groundMin.set(-HALF, -2, -HALF);
  world.groundMax.set(HALF, 0, HALF);
  world.killY = -35;

  return {
    id: 'baseplate',
    group,
    half: HALF,
    decalMesh: decal,
    sun,
    spawnPoint: new Vector3(0, 0, 6),
    spawnYaw: 0,
    attachDecalTexture(tex) { decalMat.map = tex; decalMat.needsUpdate = true; },
    dispose() {
      scene.remove(group);
      scene.remove(hemi); scene.remove(sun); scene.remove(sun.target); scene.remove(amb);
      scene.fog = null;
      for (const d of disposables) d.dispose?.();
    },
  };
}
