/* =============================================================================
   FIREARMS

   Two of them, built the way everything else in this game is built: out of
   boxes, in code, with no art on disk. The detail is in how many boxes - a
   Glock is thirty-odd parts and an AK is nearer fifty, down to the front sight
   ears, the rivets in the receiver and the trigger safety blade inside the
   trigger - because at arm's length in first person that is what reads.

   Everything a gun does that a machete does not lives here too: what it holds,
   what happens when it runs dry, how hard it kicks, where the flash goes.
   ========================================================================== */
import {
  Group, Mesh, MeshLambertMaterial, MeshBasicMaterial, BoxGeometry,
  CylinderGeometry, Vector3, Quaternion, AdditiveBlending, DoubleSide,
  PlaneGeometry, InstancedMesh, Object3D, DynamicDrawUsage,
} from 'three';
import { RigidBody } from '../physics/rigid.js';
import { makeAtlasBoxGeometry } from './skeleton.js';
import { makeRng } from '../core/util.js';

const rng = makeRng(0x9111);
const _v1 = new Vector3();

/* -------------------------------------------------------------------------- */
/*                             shared materials                               */
/* -------------------------------------------------------------------------- */

let mats = null;
function gunMaterials() {
  if (mats) return mats;
  mats = {
    // Glock: polymer frame is not the same black as the slide, and the slide
    // is not the same black as its own worn edges.
    polymer: new MeshLambertMaterial({ color: 0x27282c }),
    slide: new MeshLambertMaterial({ color: 0x1b1c20 }),
    slideWear: new MeshLambertMaterial({ color: 0x4a4c52 }),
    steel: new MeshLambertMaterial({ color: 0x33353a }),
    brightSteel: new MeshLambertMaterial({ color: 0x8d919a }),
    sightDot: new MeshLambertMaterial({ color: 0xe8e4d8 }),
    // AK: stamped receiver, bakelite-ish furniture, blued barrel
    receiver: new MeshLambertMaterial({ color: 0x2a2c30 }),
    wood: new MeshLambertMaterial({ color: 0x6a4526 }),
    woodDark: new MeshLambertMaterial({ color: 0x4e3119 }),
    blued: new MeshLambertMaterial({ color: 0x24252a }),
    mag: new MeshLambertMaterial({ color: 0x2f3a2c }),
    brass: new MeshLambertMaterial({ color: 0xb08a3a }),
    /* M16: anodised aluminium and glass filled polymer, not steel and wood.
       Lifted a long way off true matte black, because a rifle that is all one
       value in shadow is a silhouette rather than a gun. */
    alloy: new MeshLambertMaterial({ color: 0x53565c }),
    alloyDark: new MeshLambertMaterial({ color: 0x3a3d42 }),
    m16Polymer: new MeshLambertMaterial({ color: 0x3e4038 }),
    m16PolymerDark: new MeshLambertMaterial({ color: 0x2c2e29 }),
    magAlloy: new MeshLambertMaterial({ color: 0x5b5f63 }),
    black: new MeshLambertMaterial({ color: 0x1a1c1f }),
  };
  return mats;
}

/** Adds a box to a group. Sizes and offsets in metres, angles in radians. */
function box(group, mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new Mesh(new BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (rx || ry || rz) m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  group.add(m);
  return m;
}

/* -------------------------------------------------------------------------- */
/*                                  Glock 19                                  */
/* -------------------------------------------------------------------------- */

export const GLOCK = {
  id: 'glock',
  label: 'Glock-19',
  capacity: 15,
  length: 0.187,          // real 19 is 187 mm
  mass: 0.9,
  /** The box that stands in for it on the floor, in the model's own space. */
  half: new Vector3(0.022, 0.082, 0.078),
  center: new Vector3(0, -0.034, -0.030),
  /** Where the muzzle is, in the model's own space. */
  muzzle: new Vector3(0, 0.019, -0.093),
  /** Where a case comes out. */
  ejectAt: new Vector3(0.018, 0.030, -0.012),
};

/**
 * The model. Built along -Z, so the gun points where the hand points, with the
 * grip hanging down from the origin - the origin is where the palm closes.
 */
export function createGlockModel() {
  const M = gunMaterials();
  const g = new Group();

  /* ------------------------------- the frame ----------------------------- */
  // grip, raked back the way a pistol grip is
  const grip = box(g, M.polymer, 0.030, 0.108, 0.038, 0, -0.052, 0.006, 0.11);
  grip.name = 'grip';
  // the finger grooves, three of them across the front strap
  for (let i = 0; i < 3; i++) {
    box(g, M.polymer, 0.031, 0.006, 0.005, 0, -0.020 - i * 0.026, -0.012 + i * 0.003, 0.11);
  }
  // backstrap and the beavertail that keeps the slide off the hand
  box(g, M.polymer, 0.029, 0.030, 0.010, 0, -0.004, 0.024, 0.11);
  /* The magazine is its own group so it can leave the gun during a reload:
     the floorplate under the butt is all of it you ever see. */
  const mag = new Group();
  mag.name = 'magazine';
  box(mag, M.polymer, 0.028, 0.008, 0.034, 0, -0.104, 0.018, 0.11);
  box(mag, M.mag, 0.024, 0.004, 0.030, 0, -0.109, 0.019, 0.11);
  box(mag, M.mag, 0.023, 0.056, 0.026, 0, -0.075, 0.014, 0.11);
  g.add(mag);

  // trigger guard: front, bottom and the rear post
  box(g, M.polymer, 0.026, 0.008, 0.008, 0, -0.014, -0.036);
  box(g, M.polymer, 0.026, 0.028, 0.007, 0, -0.028, -0.036);
  box(g, M.polymer, 0.026, 0.007, 0.030, 0, -0.040, -0.022);
  // the trigger itself, with the little safety blade down its middle
  const trigger = box(g, M.slide, 0.008, 0.016, 0.006, 0, -0.024, -0.020);
  trigger.name = 'trigger';
  box(g, M.slideWear, 0.003, 0.012, 0.004, 0, -0.024, -0.022);

  // dust cover and the accessory rail under the barrel
  box(g, M.polymer, 0.026, 0.014, 0.052, 0, -0.006, -0.052);
  for (let i = 0; i < 2; i++) box(g, M.polymer, 0.028, 0.004, 0.005, 0, -0.013, -0.040 - i * 0.014);

  // slide stop and takedown lever, on the left where they belong
  box(g, M.slide, 0.004, 0.006, 0.026, -0.016, -0.002, -0.014);
  box(g, M.slide, 0.004, 0.005, 0.010, -0.016, -0.010, -0.030);

  /* ------------------------------- the slide ----------------------------- */
  const slide = new Group();
  slide.name = 'slide';
  box(slide, M.slide, 0.026, 0.030, 0.150, 0, 0.020, -0.030);
  // the flat top and the ejection port cut into the right side
  box(slide, M.slide, 0.020, 0.006, 0.146, 0, 0.036, -0.030);
  box(slide, M.brightSteel, 0.004, 0.014, 0.030, 0.012, 0.024, -0.026);
  box(slide, M.slideWear, 0.005, 0.010, 0.008, 0.013, 0.030, -0.010);   // extractor

  // serrations: eight at the rear, six at the front, both sides
  for (let i = 0; i < 8; i++) {
    const z = 0.032 - i * 0.006;
    box(slide, M.slideWear, 0.027, 0.020, 0.002, 0, 0.020, z);
  }
  for (let i = 0; i < 6; i++) {
    const z = -0.070 - i * 0.006;
    box(slide, M.slideWear, 0.027, 0.018, 0.002, 0, 0.020, z);
  }
  // sights: rear notch with two dots, front blade with one
  box(slide, M.slide, 0.016, 0.007, 0.006, 0, 0.041, 0.030);
  box(slide, M.sightDot, 0.003, 0.003, 0.002, -0.005, 0.041, 0.028);
  box(slide, M.sightDot, 0.003, 0.003, 0.002, 0.005, 0.041, 0.028);
  box(slide, M.slide, 0.005, 0.008, 0.004, 0, 0.042, -0.100);
  box(slide, M.sightDot, 0.003, 0.003, 0.002, 0, 0.043, -0.102);
  // barrel hood and the muzzle crown showing at the front
  box(slide, M.brightSteel, 0.012, 0.012, 0.010, 0, 0.019, -0.100);
  const bore = new Mesh(new CylinderGeometry(0.0045, 0.0045, 0.012, 8), M.blued);
  bore.rotation.x = Math.PI / 2;
  bore.position.set(0, 0.019, -0.100);
  slide.add(bore);
  g.add(slide);

  g.userData.slide = slide;
  g.userData.magazine = mag;
  g.userData.trigger = trigger;
  g.userData.materials = Object.values(M);
  return g;
}

/* -------------------------------------------------------------------------- */
/*                                   AK-47                                    */
/* -------------------------------------------------------------------------- */

export const AK47 = {
  id: 'ak47',
  label: 'AK-47',
  capacity: 30,
  length: 0.88,
  mass: 4.3,
  half: new Vector3(0.030, 0.100, 0.400),
  center: new Vector3(0, -0.030, -0.120),
  muzzle: new Vector3(0, 0.028, -0.500),
  ejectAt: new Vector3(0.024, 0.040, -0.040),
};

export function createAkModel() {
  const M = gunMaterials();
  const g = new Group();

  /* ----------------------------- the receiver ---------------------------- */
  box(g, M.receiver, 0.030, 0.060, 0.200, 0, 0.010, -0.030);
  // the stamped dust cover on top, with its rear lip
  const cover = box(g, M.receiver, 0.028, 0.014, 0.170, 0, 0.044, -0.030);
  cover.name = 'dustCover';
  box(g, M.receiver, 0.026, 0.010, 0.010, 0, 0.048, 0.052);
  // rivets down the side, which is what a stamped receiver looks like
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      box(g, M.blued, 0.003, 0.005, 0.005, sx * 0.016, 0.004, 0.020 - i * 0.044);
    }
  }
  // the big safety selector paddle, on the right
  box(g, M.blued, 0.005, 0.052, 0.014, 0.017, 0.014, 0.020, 0, 0, 0.35);
  // charging handle sticking out of the right of the bolt carrier, with the
  // knurled knob on the end that a hand actually pulls
  box(g, M.brightSteel, 0.026, 0.008, 0.008, 0.020, 0.038, -0.020);
  box(g, M.slideWear, 0.010, 0.014, 0.014, 0.032, 0.038, -0.020);

  /* ---------------------------- trigger group ---------------------------- */
  /* Front to back along the bottom of an AK: the magazine, then the trigger
     guard with the trigger in it, then the pistol grip. It had none of the
     middle one, which is what made the underside read as two loose lumps. */
  // the well the magazine goes up into, and the catch that holds it there
  box(g, M.receiver, 0.030, 0.016, 0.046, 0, -0.026, -0.055);
  box(g, M.blued, 0.026, 0.009, 0.010, 0, -0.030, -0.029);
  // trigger guard: front bar, the loop under it, and the rear post
  box(g, M.blued, 0.024, 0.030, 0.007, 0, -0.038, -0.031);
  box(g, M.blued, 0.024, 0.007, 0.048, 0, -0.051, -0.008);
  box(g, M.blued, 0.024, 0.028, 0.008, 0, -0.036, 0.013);
  // the trigger itself, hooked forward the way a trigger is
  box(g, M.brightSteel, 0.006, 0.024, 0.007, 0, -0.032, -0.012, 0.20);
  box(g, M.brightSteel, 0.006, 0.009, 0.010, 0, -0.043, -0.016, 0.55);

  /* ------------------------------- furniture ----------------------------- */
  // pistol grip: raked back, with a palm swell and a capped bottom
  box(g, M.wood, 0.026, 0.092, 0.030, 0, -0.056, 0.026, 0.30);
  box(g, M.wood, 0.030, 0.044, 0.028, 0, -0.048, 0.022, 0.30);
  box(g, M.woodDark, 0.029, 0.010, 0.033, 0, -0.100, 0.040, 0.30);
  box(g, M.blued, 0.010, 0.006, 0.010, 0, -0.101, 0.038, 0.30);
  // buttstock: wrist then comb
  box(g, M.wood, 0.028, 0.040, 0.090, 0, 0.000, 0.108, -0.10);
  box(g, M.wood, 0.030, 0.056, 0.130, 0, 0.010, 0.200, -0.06);
  box(g, M.woodDark, 0.032, 0.062, 0.012, 0, 0.014, 0.266, -0.06);   // butt plate
  /* Lower handguard and the upper one over the gas tube. The lower one is
     what the other hand closes round, so it is sized to fit the hole a fist
     actually leaves rather than to the width of the real thing. */
  box(g, M.wood, 0.034, 0.030, 0.130, 0, -0.008, -0.170);
  box(g, M.woodDark, 0.036, 0.008, 0.028, 0, -0.021, -0.112);   // the retainer
  box(g, M.wood, 0.034, 0.026, 0.120, 0, 0.038, -0.165);
  // the vent slots in the upper handguard
  for (let i = 0; i < 3; i++) {
    for (const sx of [-1, 1]) {
      box(g, M.blued, 0.003, 0.010, 0.026, sx * 0.017, 0.040, -0.200 + i * 0.038);
    }
  }

  /* -------------------------------- barrel ------------------------------- */
  const barrel = new Mesh(new CylinderGeometry(0.0085, 0.0085, 0.400, 10), M.blued);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.028, -0.300);
  g.add(barrel);
  // gas block with its tube, the front sight block, and the ears round the post
  box(g, M.blued, 0.024, 0.036, 0.030, 0, 0.040, -0.250, 0.35);
  const gasTube = new Mesh(new CylinderGeometry(0.007, 0.007, 0.150, 8), M.blued);
  gasTube.rotation.x = Math.PI / 2;
  gasTube.position.set(0, 0.046, -0.180);
  g.add(gasTube);
  box(g, M.blued, 0.022, 0.030, 0.024, 0, 0.038, -0.452);
  for (const sx of [-1, 1]) box(g, M.blued, 0.004, 0.026, 0.010, sx * 0.009, 0.052, -0.452);
  box(g, M.brightSteel, 0.003, 0.016, 0.003, 0, 0.050, -0.452);      // the post itself
  // slant muzzle brake
  box(g, M.blued, 0.018, 0.018, 0.032, 0, 0.028, -0.492, 0, 0, 0.2);
  // cleaning rod under the barrel, because it is always there
  const rod = new Mesh(new CylinderGeometry(0.0022, 0.0022, 0.300, 6), M.brightSteel);
  rod.rotation.x = Math.PI / 2;
  rod.position.set(0, 0.010, -0.300);
  g.add(rod);
  // rear sight leaf on its block
  box(g, M.blued, 0.026, 0.010, 0.030, 0, 0.050, -0.110);
  box(g, M.blued, 0.020, 0.008, 0.008, 0, 0.058, -0.100);

  /* ------------------------------ magazine ------------------------------- */
  /* The curve is the whole silhouette of this gun, and it curves FORWARDS:
     the floorplate sits ahead of the feed lips, not behind them. It was built
     leaning the other way, which is why the magazine looked like a staircase
     going backwards into the trigger. Five short sections, each leaning a
     little further than the last and overlapping enough that the joins do not
     read as steps. */
  const mag = new Group();
  mag.name = 'magazine';
  let my = -0.030, mz = -0.055, ang = 0.10;
  for (let i = 0; i < 5; i++) {
    my -= 0.032 * Math.cos(ang);
    mz -= 0.032 * Math.sin(ang);
    const w = 0.026 - i * 0.001;
    box(mag, M.mag, w, 0.044, 0.031 - i * 0.001, 0, my, mz, ang);
    // the pressed ribs down each side of a steel magazine
    for (const sx of [-1, 1]) {
      box(mag, M.blued, 0.002, 0.030, 0.005, sx * (w / 2), my, mz - 0.005, ang);
    }
    ang += 0.13;
  }
  // floorplate, a little wider than the body it caps
  box(mag, M.blued, 0.028, 0.008, 0.034, 0, my - 0.023 * Math.cos(ang),
    mz - 0.023 * Math.sin(ang), ang);
  g.add(mag);

  g.userData.magazine = mag;
  g.userData.dustCover = cover;
  g.userData.materials = Object.values(M);
  return g;
}

/* -------------------------------------------------------------------------- */
/*                                    M16                                     */
/* -------------------------------------------------------------------------- */

export const M16 = {
  id: 'm16',
  label: 'M16',
  capacity: 30,
  length: 0.79,
  mass: 3.6,
  half: new Vector3(0.028, 0.095, 0.380),
  center: new Vector3(0, -0.020, -0.130),
  muzzle: new Vector3(0, 0.020, -0.500),
  ejectAt: new Vector3(0.020, 0.048, -0.030),
};

/**
 * Everything an AK is not: aluminium instead of stamped steel, the stock in
 * line with the bore instead of dropped below it, the sight up on a carry
 * handle, and a magazine that hangs almost straight down.
 */
export function createM16Model() {
  const M = gunMaterials();
  const g = new Group();

  /* ----------------------------- receivers ------------------------------- */
  // lower, with the magwell built into the front of it
  box(g, M.alloy, 0.028, 0.052, 0.170, 0, 0.004, -0.028);
  box(g, M.alloy, 0.032, 0.056, 0.050, 0, -0.020, -0.050);        // magwell
  box(g, M.alloyDark, 0.033, 0.010, 0.052, 0, -0.046, -0.050);    // magwell lip
  // upper, flat topped, with the ejection port and its cover on the right
  box(g, M.alloy, 0.030, 0.042, 0.190, 0, 0.046, -0.034);
  box(g, M.alloyDark, 0.004, 0.020, 0.044, 0.016, 0.044, -0.026);
  box(g, M.alloyDark, 0.005, 0.014, 0.014, 0.017, 0.056, -0.004); // brass deflector
  box(g, M.alloyDark, 0.008, 0.014, 0.014, 0.016, 0.042, 0.004);  // forward assist
  // the takedown pins, which are the two circles on the side of every AR
  for (const sz of [0.040, -0.086]) {
    for (const sx of [-1, 1]) {
      box(g, M.alloyDark, 0.003, 0.010, 0.010, sx * 0.015, 0.010, sz);
    }
  }

  /* ---------------------------- carry handle ----------------------------- */
  // two walls and a bridge over the top, with the rear sight down inside it
  for (const sx of [-1, 1]) {
    box(g, M.alloy, 0.005, 0.030, 0.110, sx * 0.012, 0.082, -0.010);
  }
  box(g, M.alloy, 0.029, 0.012, 0.110, 0, 0.101, -0.010);
  box(g, M.alloyDark, 0.020, 0.014, 0.016, 0, 0.084, 0.036);      // aperture block
  box(g, M.sightDot, 0.005, 0.005, 0.003, 0, 0.086, 0.043);       // the hole itself
  box(g, M.alloyDark, 0.010, 0.008, 0.010, 0.011, 0.076, 0.030);  // windage drum
  // charging handle: the T that sticks out the back under the handle
  box(g, M.alloyDark, 0.024, 0.010, 0.030, 0, 0.066, 0.060);
  box(g, M.alloyDark, 0.044, 0.008, 0.008, 0, 0.066, 0.076);

  /* ---------------------------- trigger group ---------------------------- */
  box(g, M.alloyDark, 0.024, 0.028, 0.008, 0, -0.034, -0.026);    // guard, front
  box(g, M.alloyDark, 0.024, 0.007, 0.044, 0, -0.046, -0.006);    // guard, bottom
  box(g, M.alloyDark, 0.024, 0.026, 0.008, 0, -0.032, 0.014);     // guard, rear post
  box(g, M.brightSteel, 0.006, 0.022, 0.007, 0, -0.028, -0.008, 0.20);
  box(g, M.brightSteel, 0.006, 0.008, 0.010, 0, -0.038, -0.012, 0.55);
  // magazine release on the right, bolt catch on the left, selector above them
  box(g, M.alloyDark, 0.008, 0.012, 0.012, 0.017, 0.000, -0.044);
  box(g, M.alloyDark, 0.006, 0.020, 0.030, -0.016, 0.006, -0.020);
  box(g, M.alloyDark, 0.008, 0.010, 0.024, -0.017, 0.016, 0.006, 0, 0, 0.4);

  /* ------------------------------- furniture ----------------------------- */
  // A2 pistol grip, with the finger swell at the front
  box(g, M.m16Polymer, 0.026, 0.094, 0.030, 0, -0.054, 0.030, 0.28);
  box(g, M.m16Polymer, 0.028, 0.026, 0.016, 0, -0.038, 0.012, 0.28);
  box(g, M.m16PolymerDark, 0.028, 0.010, 0.032, 0, -0.098, 0.044, 0.28);
  // buttstock, in line with the bore the way an AR is
  box(g, M.m16Polymer, 0.036, 0.062, 0.150, 0, 0.026, 0.145, -0.02);
  box(g, M.m16PolymerDark, 0.038, 0.070, 0.014, 0, 0.026, 0.222, -0.02);
  box(g, M.alloyDark, 0.020, 0.014, 0.024, 0, 0.058, 0.196);      // sling swivel plate
  box(g, M.m16PolymerDark, 0.030, 0.008, 0.100, 0, -0.005, 0.150, -0.02);

  /* ------------------------- handguard and barrel ------------------------ */
  /* Round and ribbed, and no fatter than a hand can close round. */
  const guard = new Mesh(new CylinderGeometry(0.026, 0.028, 0.150, 10), M.m16Polymer);
  guard.rotation.x = Math.PI / 2;
  guard.position.set(0, 0.014, -0.200);
  guard.castShadow = true;
  g.add(guard);
  for (let i = 0; i < 5; i++) {
    const rib = new Mesh(new CylinderGeometry(0.029, 0.029, 0.006, 10), M.m16PolymerDark);
    rib.rotation.x = Math.PI / 2;
    rib.position.set(0, 0.014, -0.140 - i * 0.030);
    g.add(rib);
  }
  box(g, M.alloyDark, 0.036, 0.036, 0.014, 0, 0.014, -0.128);     // delta ring
  const barrel = new Mesh(new CylinderGeometry(0.008, 0.008, 0.230, 10), M.blued);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.020, -0.360);
  g.add(barrel);
  // front sight base: the triangle, its post, and the sling loop under it
  box(g, M.blued, 0.020, 0.030, 0.026, 0, 0.034, -0.300);
  for (const sx of [-1, 1]) box(g, M.blued, 0.004, 0.024, 0.012, sx * 0.008, 0.054, -0.300);
  box(g, M.brightSteel, 0.003, 0.014, 0.003, 0, 0.056, -0.300);
  box(g, M.blued, 0.014, 0.018, 0.008, 0, 0.004, -0.302);
  // gas tube running back from the sight base to the upper
  const gas = new Mesh(new CylinderGeometry(0.004, 0.004, 0.170, 6), M.blued);
  gas.rotation.x = Math.PI / 2;
  gas.position.set(0, 0.036, -0.212);
  g.add(gas);
  // birdcage flash hider, slotted
  const cage = new Mesh(new CylinderGeometry(0.013, 0.011, 0.048, 8), M.blued);
  cage.rotation.x = Math.PI / 2;
  cage.position.set(0, 0.020, -0.478);
  g.add(cage);
  for (let i = 0; i < 4; i++) {
    box(g, M.black, 0.004, 0.028, 0.020, 0, 0.020, -0.482, 0, 0, (i * Math.PI) / 4);
  }

  /* ------------------------------ magazine ------------------------------- */
  /* A STANAG hangs almost straight down - only a slight curve, which is the
     other half of telling this apart from the AK at a glance. */
  const mag = new Group();
  mag.name = 'magazine';
  let my = -0.052, mz = -0.050, ang = 0.05;
  for (let i = 0; i < 4; i++) {
    my -= 0.038 * Math.cos(ang);
    mz -= 0.038 * Math.sin(ang);
    box(mag, M.magAlloy, 0.026, 0.048, 0.030, 0, my, mz, ang);
    for (const sx of [-1, 1]) {
      box(mag, M.alloyDark, 0.002, 0.034, 0.004, sx * 0.013, my, mz - 0.005, ang);
    }
    ang += 0.05;
  }
  box(mag, M.m16PolymerDark, 0.028, 0.010, 0.034, 0, my - 0.026 * Math.cos(ang),
    mz - 0.026 * Math.sin(ang), ang);
  g.add(mag);

  g.userData.magazine = mag;
  g.userData.materials = Object.values(M);
  return g;
}

/* -------------------------------------------------------------------------- */
/*                             loose guns on the map                          */
/* -------------------------------------------------------------------------- */

function spawnGun(game, position, spec, model, { quat = null, reuse = null } = {}) {
  const body = new RigidBody({
    shape: 'box',
    half: spec.half.clone(),
    mass: spec.mass,
    pos: position.clone(),
    friction: 0.8,
    restitution: 0.03,
    linDamp: 0.3,
    angDamp: 0.6,
    tag: spec.id,
  });
  if (quat) body.quat.copy(quat);
  else body.quat.setFromAxisAngle(_v1.set(0, 1, 0), rng() * Math.PI * 2);
  body.updateDerived();

  const mesh = reuse ? reuse.model : model();
  // the model's origin is at the grip; the collider is centred on the gun
  mesh.userData.bodyOffset = spec.center.clone().negate();
  mesh.matrixAutoUpdate = false;
  body.mesh = mesh;
  body.userData.label = spec.label;
  body.userData.grabbable = true;
  body.userData.pickup = spec.id;
  body.userData.ammo = reuse ? reuse.ammo : spec.capacity;
  if (!reuse || !mesh.parent) game.scene.add(mesh);
  game.world.addBody(body);
  game.trackSpawn(body);
  return body;
}

export function spawnGlock(game, position, opts = {}) {
  return spawnGun(game, position, GLOCK, createGlockModel, opts);
}
export function spawnAk(game, position, opts = {}) {
  return spawnGun(game, position, AK47, createAkModel, opts);
}
export function spawnM16(game, position, opts = {}) {
  return spawnGun(game, position, M16, createM16Model, opts);
}

/* -------------------------------------------------------------------------- */
/*                              muzzle flash                                  */
/* -------------------------------------------------------------------------- */

/**
 * The flash is three things at once: a bright core at the muzzle, a short
 * cone of burning powder in front of it, and a puff of smoke that outlives
 * both. All of it lasts about four frames, which is what a real one does.
 */
export class MuzzleFlash {
  constructor(scene) {
    this.scene = scene;
    this.group = new Group();
    this.group.visible = false;
    this.group.matrixAutoUpdate = false;

    const hot = new MeshBasicMaterial({
      color: 0xfff3c4, transparent: true, opacity: 0.95,
      blending: AdditiveBlending, depthWrite: false, side: DoubleSide,
    });
    const glow = new MeshBasicMaterial({
      color: 0xffb038, transparent: true, opacity: 0.8,
      blending: AdditiveBlending, depthWrite: false, side: DoubleSide,
    });
    const smokeMat = new MeshBasicMaterial({
      color: 0x8f8b84, transparent: true, opacity: 0.3, depthWrite: false,
    });
    this.mats = [hot, glow, smokeMat];

    this.core = new Mesh(new BoxGeometry(0.035, 0.035, 0.035), hot);
    // a four-armed star, which is what a flash looks like head on
    this.star = new Mesh(new PlaneGeometry(0.22, 0.22), glow);
    this.star2 = new Mesh(new PlaneGeometry(0.22, 0.22), glow);
    this.star2.rotation.z = Math.PI / 4;
    this.cone = new Mesh(new CylinderGeometry(0.002, 0.042, 0.13, 7, 1, true), glow);
    this.cone.rotation.x = -Math.PI / 2;
    this.cone.position.z = -0.065;
    this.smoke = new Mesh(new BoxGeometry(0.10, 0.10, 0.10), smokeMat);
    this.smoke.position.z = -0.10;

    for (const m of [this.core, this.star, this.star2, this.cone, this.smoke]) {
      m.matrixAutoUpdate = true;
      this.group.add(m);
    }
    scene.add(this.group);
    this.life = 0;
    this.duration = 0.06;
  }

  /** @param {Quaternion} quat where the barrel is pointing */
  fire(point, quat, scale = 1) {
    this.group.position.copy(point);
    this.group.quaternion.copy(quat);
    const s = scale * (0.8 + rng() * 0.5);
    this.group.scale.set(s, s, s);
    this.group.rotateZ(rng() * Math.PI);
    this.group.updateMatrix();
    this.group.visible = true;
    this.life = this.duration;
  }

  update(dt) {
    if (this.life <= 0) return;
    this.life -= dt;
    const t = Math.max(0, this.life / this.duration);
    if (t <= 0) { this.group.visible = false; return; }
    this.mats[0].opacity = 0.95 * t;
    this.mats[1].opacity = 0.8 * t * t;
    this.mats[2].opacity = 0.3 * t;
    this.smoke.scale.setScalar(1 + (1 - t) * 2.2);
    this.core.scale.setScalar(0.6 + t * 0.8);
  }

  dispose() {
    this.scene.remove(this.group);
    for (const m of this.mats) m.dispose();
    for (const c of this.group.children) c.geometry?.dispose();
  }
}

/* -------------------------------------------------------------------------- */
/*                             ejected cases                                  */
/* -------------------------------------------------------------------------- */

const MAX_CASES = 40;

/** Brass, thrown out to the right, bouncing once and lying where it lands. */
export class CaseEjector {
  constructor(scene) {
    this.scene = scene;
    const geo = new BoxGeometry(0.009, 0.009, 0.022);
    const mat = new MeshLambertMaterial({ color: 0xc79a3c });
    this.mesh = new InstancedMesh(geo, mat, MAX_CASES);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
    this.mat = mat;
    this.obj = new Object3D();
    this.cases = [];
    for (let i = 0; i < MAX_CASES; i++) {
      this.cases.push({
        alive: false, pos: new Vector3(), vel: new Vector3(),
        spin: new Vector3(), rot: new Quaternion(), life: 0,
      });
    }
    this.cursor = 0;
    this._hideAll();
  }

  _hideAll() {
    this.obj.position.set(0, -999, 0);
    this.obj.scale.setScalar(0.001);
    this.obj.updateMatrix();
    for (let i = 0; i < MAX_CASES; i++) this.mesh.setMatrixAt(i, this.obj.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  eject(point, dir) {
    const c = this.cases[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_CASES;
    c.alive = true;
    c.life = 4 + rng() * 2;
    c.pos.copy(point);
    c.vel.copy(dir).multiplyScalar(2.2 + rng() * 1.4);
    c.vel.y += 1.6 + rng();
    c.spin.set((rng() - 0.5) * 26, (rng() - 0.5) * 26, (rng() - 0.5) * 26);
    c.rot.identity();
  }

  update(dt, groundY = 0) {
    let live = false;
    for (let i = 0; i < MAX_CASES; i++) {
      const c = this.cases[i];
      if (!c.alive) continue;
      live = true;
      c.life -= dt;
      c.vel.y -= 20 * dt;
      c.pos.addScaledVector(c.vel, dt);
      if (c.pos.y < groundY + 0.006) {
        c.pos.y = groundY + 0.006;
        c.vel.y = Math.abs(c.vel.y) * 0.24;
        c.vel.x *= 0.6; c.vel.z *= 0.6;
        c.spin.multiplyScalar(0.5);
        if (c.vel.lengthSq() < 0.02) { c.vel.set(0, 0, 0); c.spin.set(0, 0, 0); }
      }
      _v1.set(c.spin.x * dt, c.spin.y * dt, c.spin.z * dt);
      const q = new Quaternion().setFromEuler({ x: _v1.x, y: _v1.y, z: _v1.z, order: 'XYZ',
        isEuler: true });
      c.rot.multiply(q);
      if (c.life <= 0) { c.alive = false; this.obj.position.set(0, -999, 0); this.obj.scale.setScalar(0.001); }
      else { this.obj.position.copy(c.pos); this.obj.quaternion.copy(c.rot); this.obj.scale.setScalar(1); }
      this.obj.updateMatrix();
      this.mesh.setMatrixAt(i, this.obj.matrix);
    }
    if (live) this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() { for (const c of this.cases) c.alive = false; this._hideAll(); }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
