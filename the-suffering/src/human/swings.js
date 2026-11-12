/* Written by tools/pose-solve.mjs. Edit the swings there, not here. */
export const SWINGS = {
 rest: [
  [
   0,
   {
    shR: -0.14,
    shROut: 0.02,
    shRIn: -0.19,
    elR: 1.47,
    wrR: -0.81,
    wrRSide: -0.21
   }
  ]
 ],
 slash: [
  [
   0.2,
   {
    shR: 0.73,
    shROut: 0.5,
    shRIn: -0.57,
    elR: 1.52,
    wrR: -1.6,
    wrRSide: -0.06,
    spineTwist: -0.4
   }
  ],
  [
   0.42,
   {
    shR: 1.4,
    shROut: 0.11,
    shRIn: 0.04,
    elR: 0.2,
    wrR: -1.49,
    wrRSide: -0.01,
    spineTwist: 0.05
   }
  ],
  [
   0.6,
   {
    shR: 1.39,
    shROut: 0.24,
    shRIn: 0.45,
    elR: 0.05,
    wrR: -1.23,
    wrRSide: -0.03,
    spineTwist: 0.45
   }
  ]
 ],
 backslash: [
  [
   0.2,
   {
    shR: 1.08,
    shROut: 0,
    shRIn: 0.5,
    elR: 0.94,
    wrR: -1.6,
    wrRSide: 0.1,
    spineTwist: 0.4
   }
  ],
  [
   0.42,
   {
    shR: 1.46,
    shROut: 0,
    shRIn: 0.1,
    elR: 0.07,
    wrR: -1.35,
    wrRSide: 0.19,
    spineTwist: 0
   }
  ],
  [
   0.6,
   {
    shR: 1.33,
    shROut: 0.62,
    shRIn: -0.18,
    elR: 0.05,
    wrR: -1.6,
    wrRSide: 0.28,
    spineTwist: -0.4
   }
  ]
 ],
 stab: [
  [
   0.24,
   {
    shR: -0.47,
    shROut: 0.14,
    shRIn: 0.12,
    elR: 2.02,
    wrR: -1.46,
    wrRSide: -0.22,
    spineTwist: -0.35,
    rootZ: -0.03
   }
  ],
  [
   0.5,
   {
    shR: 0.53,
    shROut: 0,
    shRIn: -0.1,
    elR: 1.35,
    wrR: -1.6,
    wrRSide: 0.32,
    spineTwist: 0.42,
    rootZ: 0.12
   }
  ],
  [
   0.62,
   {
    shR: 0.47,
    shROut: 0,
    shRIn: -0.06,
    elR: 1.44,
    wrR: -1.6,
    wrRSide: 0.35,
    spineTwist: 0.4,
    rootZ: 0.12
   }
  ]
 ],
 overhand: [
  [
   0.3,
   {
    shR: 1.72,
    shROut: 0,
    shRIn: -0.16,
    elR: 1.8,
    wrR: -0.98,
    wrRSide: 0.15,
    spineBend: -0.18
   }
  ],
  [
   0.54,
   {
    shR: 1.57,
    shROut: 0.22,
    shRIn: 0.15,
    elR: 0.99,
    wrR: -0.04,
    wrRSide: 0.03,
    spineBend: 0.26
   }
  ],
  [
   0.68,
   {
    shR: 1.15,
    shROut: 0.18,
    shRIn: 0.21,
    elR: 1.21,
    wrR: -0.08,
    wrRSide: -0.05,
    spineBend: 0.32
   }
  ]
 ],
 chop: [
  [
   0.26,
   {
    shR: 1.94,
    shROut: 0,
    shRIn: -0.87,
    elR: 1.52,
    wrR: -1.6,
    wrRSide: 0.57,
    spineTwist: -0.35,
    spineBend: -0.1
   }
  ],
  [
   0.44,
   {
    shR: 1.76,
    shROut: 0.68,
    shRIn: -0.69,
    elR: 1.46,
    wrR: -1.6,
    wrRSide: -0.03,
    spineTwist: 0.1,
    spineBend: 0.06
   }
  ],
  [
   0.6,
   {
    shR: 0.76,
    shROut: 0,
    shRIn: 0.1,
    elR: 1.05,
    wrR: -1.6,
    wrRSide: 0.08,
    spineTwist: 0.48,
    spineBend: 0.22
   }
  ]
 ],
 backhand: [
  [
   0.26,
   {
    shR: 1.75,
    shROut: 0.52,
    shRIn: 0.55,
    elR: 0.93,
    wrR: -1.36,
    wrRSide: -0.08,
    spineTwist: 0.38,
    spineBend: -0.05
   }
  ],
  [
   0.44,
   {
    shR: 1.85,
    shROut: 0,
    shRIn: 0.53,
    elR: 0.1,
    wrR: -1.43,
    wrRSide: 0.37,
    spineTwist: 0.05,
    spineBend: 0.06
   }
  ],
  [
   0.6,
   {
    shR: 1.29,
    shROut: 0,
    shRIn: 0.1,
    elR: 0.05,
    wrR: -1.1,
    wrRSide: 0.14,
    spineTwist: -0.42,
    spineBend: 0.2
   }
  ]
 ],
 cleave: [
  [
   0.32,
   {
    shR: 2.47,
    shROut: 0.06,
    shRIn: 0.16,
    elR: 1.05,
    wrR: -1.46,
    wrRSide: -0.02,
    spineBend: -0.26,
    waistBend: -0.05,
    rootY: 0.02
   }
  ],
  [
   0.5,
   {
    shR: 2.61,
    shROut: 0,
    shRIn: 0.28,
    elR: 0.05,
    wrR: -1.6,
    wrRSide: 0.2,
    spineBend: 0.08,
    waistBend: 0.04
   }
  ],
  [
   0.62,
   {
    shR: 1.89,
    shROut: 0,
    shRIn: 0.17,
    elR: 0.05,
    wrR: -1.02,
    wrRSide: 0.1,
    spineBend: 0.44,
    waistBend: 0.2,
    rootY: -0.09
   }
  ],
  [
   0.7,
   {
    shR: 1.72,
    shROut: 0,
    shRIn: 0.16,
    elR: 0.05,
    wrR: -0.88,
    wrRSide: 0.08,
    spineBend: 0.48,
    waistBend: 0.2,
    rootY: -0.09
   }
  ]
 ],
 sweep: [
  [
   0.24,
   {
    shR: 0.95,
    shROut: 0,
    shRIn: -0.44,
    elR: 1.78,
    wrR: -1.6,
    wrRSide: 0.57,
    spineTwist: -0.55
   }
  ],
  [
   0.44,
   {
    shR: 1.7,
    shROut: 1.38,
    shRIn: -0.7,
    elR: 1.11,
    wrR: -1.6,
    wrRSide: -0.12,
    spineTwist: 0.05
   }
  ],
  [
   0.62,
   {
    shR: 2.13,
    shROut: 1.44,
    shRIn: 0.01,
    elR: 0.05,
    wrR: -1.6,
    wrRSide: -0.06,
    spineTwist: 0.62
   }
  ]
 ]
};
