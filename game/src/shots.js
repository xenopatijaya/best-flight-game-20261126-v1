// shots.js — one job: deterministic screenshot scenes for ?shot=.
// Each scene flies the REAL flight model forward from a fixed start with a
// simple autopilot, so the screenshots are true renders of the game itself.
import * as THREE from 'three';
import { MISSION_RINGS, MISSION_HOP, MISSION_STORM, createMission, stormWind } from './missions.js';
import { STRIPS, heightAt, stripForward } from './terrain.js';

const DT = 1 / 60;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Steer the plane toward a point: proportional pitch/roll, steady throttle,
 * and never below the terrain ahead — the autopilot climbs over hills. */
function autopilot(flight, target, seconds, opts = {}) {
  const wind = opts.wind ?? new THREE.Vector3(0, 0, 0);
  const throttle = opts.throttle ?? 0.7;
  const steps = Math.floor(seconds / DT);
  for (let i = 0; i < steps; i++) {
    const s = flight.state;
    if (s.crashed) break;
    const dx = target.x - s.pos.x;
    const dy = target.y - s.pos.y;
    const dz = target.z - s.pos.z;
    const horizontal = Math.hypot(dx, dz);
    const desiredHeading = Math.atan2(-dx, -dz);
    const headingErr = wrapAngle(desiredHeading - s.heading);
    // Terrain ahead: stay at least 28 m above the ground 120 m in front.
    const aheadX = s.pos.x - Math.sin(s.heading) * 120;
    const aheadZ = s.pos.z - Math.cos(s.heading) * 120;
    // Terrain clearance: 28 m in the cruise, but a landing approach must be
    // allowed to come down to the strip, so the caller can lower it.
    const clearance = opts.minClearance ?? 28;
    const floorY = heightAt(aheadX, aheadZ) + clearance;
    const wantY = Math.max(target.y, floorY);
    const desiredPitch = clamp(Math.atan2(wantY - s.pos.y, Math.max(1, horizontal)), -0.3, 0.3);
    // Bank into the turn, but gently: a shallow bank reads better on camera.
    const desiredRoll = clamp(-headingErr * 0.55, -0.5, 0.5);
    const input = {
      pitch: clamp((desiredPitch - s.pitch) * 2.0, -1, 1),
      roll: clamp((desiredRoll - s.roll) * 1.6, -1, 1),
      throttle,
      flaps: !!opts.flaps,
      gear: opts.gear !== false,
      brake: false,
    };
    flight.step(DT, input, wind);
    if (opts.stopWhen && opts.stopWhen(s)) break;
  }
}

function startOnStrip(flight, stripName, fuel) {
  const strip = STRIPS.find((s) => s.name === stripName) ?? STRIPS[0];
  flight.reset({
    x: strip.x,
    y: strip.altitude + 1.25,
    z: strip.z,
    heading: strip.heading,
    speed: 0,
    fuel,
    onGround: true,
  });
}

function startAirborne(flight, x, y, z, heading, speed, fuel) {
  flight.reset({
    x,
    y,
    z,
    heading,
    speed,
    fuel,
    onGround: false,
  });
}

/**
 * Stage one named scene. game: { flight, setMission }.
 * Returns { mission, cameraMode, showBeacon, overlay } for main.js to paint.
 */
export function stageShot(name, game) {
  const { flight } = game;
  if (name === 'cover') {
    // Ring Run, mid-tour: a gentle bank toward the third ring over the lagoon.
    // Two rings are already banked, so the HUD reads RING 3/8.
    const mission = createMission(MISSION_RINGS);
    mission.rings[0].passed = true;
    mission.rings[1].passed = true;
    mission.nextRing = 2;
    mission.score = 200;
    game.setMission(mission);
    startAirborne(flight, 700, 72, -150, -1.0, 50, 88);
    autopilot(flight, mission.rings[2].pos, 6.5, { throttle: 0.72, gear: false });
    mission.elapsed = 42;
    return { mission, cameraMode: 'chase', showBeacon: false, overlay: 'none' };
  }
  if (name === 'rings') {
    // A gentle bank through the fifth ring, sun low over the east isles.
    const mission = createMission(MISSION_RINGS);
    mission.rings.forEach((r, i) => {
      if (i < 4) {
        r.passed = true;
        mission.nextRing = 4;
      }
    });
    mission.score = 400;
    game.setMission(mission);
    startAirborne(flight, 100, 72, -600, 0.75, 55, 76);
    autopilot(flight, mission.rings[4].pos, 6, { throttle: 0.8, gear: false });
    mission.elapsed = 96;
    return { mission, cameraMode: 'chase', showBeacon: false, overlay: 'none' };
  }
  if (name === 'landing') {
    // Island Hop, final approach: gear down, flaps out, HOME strip ahead.
    const mission = createMission(MISSION_HOP);
    mission.stripsLanded = ['NORTH'];
    mission.score = 312;
    game.setMission(mission);
    const strip = STRIPS[0];
    const fwd = stripForward(strip);
    const approach = new THREE.Vector3(
      strip.x - fwd.x * 520,
      strip.altitude + 55,
      strip.z - fwd.z * 520,
    );
    startAirborne(flight, approach.x, approach.y, approach.z, strip.heading, 46, 64);
    // Aim at the numbers, not the strip centre, and let the clearance drop
    // to the runway: this is a landing, not a fly-over.
    const threshold = new THREE.Vector3(strip.x - fwd.x * 60, strip.altitude + 3, strip.z - fwd.z * 60);
    autopilot(flight, threshold, 12, {
      throttle: 0.4,
      flaps: true,
      gear: true,
      minClearance: 2,
      stopWhen: (s) => s.onGround || s.pos.y < strip.altitude + 8,
    });
    mission.elapsed = 131;
    return { mission, cameraMode: 'chase', showBeacon: false, overlay: 'none' };
  }
  if (name === 'debrief') {
    // Storm Run complete: parked on Far Isle's south beach facing the open
    // lagoon, debrief on screen, HUD hidden so nothing collides with it.
    const mission = createMission(MISSION_STORM);
    mission.delivered = true;
    mission.done = true;
    mission.elapsed = 187;
    mission.score = 2140;
    game.setMission(mission);
    const beach = { x: 1250, z: 1300 };
    flight.reset({
      x: beach.x,
      y: heightAt(beach.x, beach.z) + 1.25,
      z: beach.z,
      heading: Math.PI, // facing south, out to sea
      speed: 0,
      fuel: 21,
      onGround: true,
    });
    return { mission, cameraMode: 'chase', showBeacon: false, overlay: 'win' };
  }
  // Fallback: the title scene over Home Isle.
  const mission = createMission(MISSION_RINGS);
  game.setMission(mission);
  startOnStrip(flight, 'HOME', 100);
  return { mission, cameraMode: 'chase', showBeacon: false, overlay: 'title' };
}
