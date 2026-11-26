// missions.js — one job: the three sorties — what the pilot must do, how the
// rings and strips are laid out, and how a run is scored.
import * as THREE from 'three';
import { STRIPS, heightAt } from './terrain.js';

export const MISSION_RINGS = 1;
export const MISSION_HOP = 2;
export const MISSION_STORM = 4;

/** Ring positions for Ring Run: a clockwise tour of the archipelago, starting
 * straight off HOME's runway over the south-eastern lagoon. */
export function ringCourse() {
  const spots = [
    [700, 60, 650],
    [1250, 65, 100],
    [1150, 65, -400],
    [600, 70, -900],
    [-250, 65, -950],
    [-950, 70, -700],
    [-1100, 65, -100],
    [-700, 70, 650],
  ];
  return spots.map(([x, y, z], i) => ({
    index: i,
    pos: new THREE.Vector3(x, Math.max(y, heightAt(x, z) + 30), z),
    radius: 20,
    passed: false,
  }));
}

/** One delivery point for Storm Run: the clinic pad on Far Isle. */
export function stormTarget() {
  return { x: 1250, z: 1050, y: heightAt(1250, 1050) + 26 };
}

export function createMission(kind) {
  const mission = {
    kind,
    name: kind === MISSION_RINGS ? 'RING RUN' : kind === MISSION_HOP ? 'ISLAND HOP' : 'STORM RUN',
    startedAt: 0,
    elapsed: 0,
    rings: kind === MISSION_RINGS ? ringCourse() : [],
    nextRing: 0,
    stripsLanded: [],
    delivered: false,
    done: false,
    failed: false,
    score: 0,
    message: '',
  };
  return mission;
}

/** Distance from the plane to the current objective (ring or strip). */
export function objectiveTarget(mission) {
  if (mission.kind === MISSION_RINGS) {
    const ring = mission.rings[mission.nextRing];
    return ring ? { pos: ring.pos, label: `RING ${mission.nextRing + 1}/${mission.rings.length}` } : null;
  }
  if (mission.kind === MISSION_HOP) {
    const next = STRIPS.find((s) => !mission.stripsLanded.includes(s.name));
    return next
      ? { pos: new THREE.Vector3(next.x, next.altitude + 20, next.z), label: `LAND: ${next.name}` }
      : null;
  }
  const t = stormTarget();
  return { pos: new THREE.Vector3(t.x, t.y, t.z), label: 'DELIVER: FAR ISLE' };
}

/**
 * Advance mission logic by one step. flightState is the flight model's state.
 * Returns an event string ('ring', 'landed', 'delivered', 'complete', 'fail') or ''.
 */
export function stepMission(mission, flightState, dt, events) {
  if (mission.done || mission.failed) return '';
  mission.elapsed += dt;
  const pos = flightState.pos;

  if (mission.kind === MISSION_RINGS) {
    const ring = mission.rings[mission.nextRing];
    if (ring && !ring.passed) {
      const d = pos.distanceTo(ring.pos);
      if (d < ring.radius) {
        ring.passed = true;
        mission.nextRing += 1;
        mission.score += 100;
        if (mission.nextRing >= mission.rings.length) {
          mission.done = true;
          mission.score += Math.max(0, Math.round(1500 - mission.elapsed * 5)) + Math.round(flightState.fuel * 5);
          return 'complete';
        }
        return 'ring';
      }
    }
  }

  if (mission.kind === MISSION_HOP) {
    if (events.landed && flightState.landedStrip) {
      const strip = flightState.landedStrip;
      if (!mission.stripsLanded.includes(strip.name)) {
        mission.stripsLanded.push(strip.name);
        // Soft touchdown pays: slow vertical speed and low damage score best.
        const softness = Math.max(0, 100 - Math.abs(flightState.verticalSpeed) * 12);
        mission.score += 200 + Math.round(softness);
        if (mission.stripsLanded.length >= 3) {
          mission.done = true;
          mission.score += Math.max(0, Math.round(1200 - mission.elapsed * 4)) + Math.round(flightState.fuel * 5);
          return 'complete';
        }
        return 'landed';
      }
    }
  }

  if (mission.kind === MISSION_STORM) {
    const t = stormTarget();
    const d = Math.hypot(pos.x - t.x, pos.z - t.z);
    if (d < 60 && pos.y < t.y + 40 && !mission.delivered) {
      mission.delivered = true;
      mission.done = true;
      mission.score += 800 + Math.round(flightState.fuel * 8) + Math.max(0, Math.round(1000 - mission.elapsed * 4));
      return 'complete';
    }
  }

  if (flightState.fuel <= 0 && !flightState.airborne && flightState.speed < 2 && mission.elapsed > 5) {
    mission.failed = true;
    return 'fail';
  }
  return '';
}

/** Gusting crosswind for Storm Run: varies with time, always pushes sideways. */
export function stormWind(time) {
  const gust = Math.sin(time * 0.7) * 0.6 + Math.sin(time * 1.7 + 1.3) * 0.4;
  return new THREE.Vector3(9 + gust * 7, 0, 4 + Math.sin(time * 0.5) * 5);
}
