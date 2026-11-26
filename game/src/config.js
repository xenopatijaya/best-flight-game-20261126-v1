// config.js — one job: every tuning number for Kestrel Run, in one place.
export const WORLD = {
  size: 4200, // world spans -2100..2100 in x and z, metres
  waterLevel: 0,
  seed: 20261126,
};

export const PLANE = {
  maxSpeed: 92, // m/s at full throttle (~179 kt)
  cruiseSpeed: 55,
  stallSpeed: 22, // below this the wing stops flying and the nose drops
  accel: 14, // m/s^2 toward target speed
  drag: 0.12,
  pitchRate: 0.55, // rad/s at full elevator
  rollRate: 1.8, // rad/s at full aileron
  maxPitch: 0.6,
  maxRoll: 1.05,
  turnCoordination: 1.25, // how much roll turns into heading change
  gravitySink: 9.5, // m/s^2 of sink when slow and nose-high
  fuelCapacity: 100, // percent
  fuelBurn: 0.55, // percent per second at full throttle
  fuelBurnIdle: 0.08,
  crashVerticalSpeed: 9, // m/s down on touchdown = crash
  hardLandingVerticalSpeed: 5, // m/s down = damage, bounced landing
  takeoffSpeed: 26,
};

export const CAMERA = {
  chaseDistance: 17.5, // closer in: the Kestrel reads bigger in frame
  chaseHeight: 5.5,
  chaseLag: 10, // smoothing, higher = stiffer
  cockpitOffset: { x: 0, y: 2.2, z: 0.2 }, // above the canopy, over the nose
};

export const MISSIONS = [
  {
    id: 'rings',
    name: 'RING RUN',
    tagline: 'Thread all 8 sky rings over the lagoon.',
    rings: 8,
    fuel: 100,
    timePar: 150,
  },
  {
    id: 'hop',
    name: 'ISLAND HOP',
    tagline: 'Land on all three island strips. Gear down, gentle touchdown.',
    strips: 3,
    fuel: 100,
    timePar: 240,
  },
  {
    id: 'storm',
    name: 'STORM RUN',
    tagline: 'Deliver the medkit to Far Isle through the squall. Watch the fuel.',
    fuel: 62,
    timePar: 200,
  },
];

export const HUD = {
  knotsPerMs: 1.94384,
  feetPerM: 3.28084,
};
