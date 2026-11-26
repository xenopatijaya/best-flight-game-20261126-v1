// flight.js — one job: the arcade flight model — lift, stall, turns, fuel,
// damage, landings and crashes. No rendering here: it only moves numbers.
import * as THREE from 'three';
import { PLANE } from './config.js';
import { heightAt, stripAt } from './terrain.js';

export const EVENT_NONE = 0;
export const EVENT_TAKEOFF = 1;
export const EVENT_LANDED = 2;
export const EVENT_CRASH = 4;
export const EVENT_DAMAGE = 8;
export const EVENT_FUEL_EMPTY = 16;

const GEAR_HEIGHT = 1.25; // metres from ground to the plane origin when parked

export function createFlight() {
  const state = {
    pos: new THREE.Vector3(0, 12, -260),
    heading: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: 100,
    damage: 0,
    flaps: false,
    gearDown: true,
    onGround: true,
    airborne: false,
    verticalSpeed: 0,
    wind: new THREE.Vector3(0, 0, 0),
    crashed: false,
    landedStrip: null,
    groundTime: 0, // seconds continuously on the ground; a fresh touchdown
    time: 0, // cannot rotate again until it has settled (no bounce takeoffs)
  };

  function forward() {
    const cp = Math.cos(state.pitch);
    return new THREE.Vector3(
      -Math.sin(state.heading) * cp,
      Math.sin(state.pitch),
      -Math.cos(state.heading) * cp,
    );
  }

  function reset(start) {
    state.pos.set(start.x, start.y, start.z);
    state.heading = start.heading ?? 0;
    state.pitch = 0;
    state.roll = 0;
    state.speed = start.speed ?? 0;
    state.throttle = start.throttle ?? 0;
    state.fuel = start.fuel ?? 100;
    state.damage = 0;
    state.flaps = false;
    state.gearDown = true;
    state.onGround = start.onGround ?? true;
    state.airborne = !state.onGround;
    state.verticalSpeed = 0;
    state.crashed = false;
    state.landedStrip = null;
    state.groundTime = 0;
    state.time = 0;
  }

  /** Advance the model by dt seconds. input: {pitch, roll, throttle, flaps, gear, brake}. */
  function step(dt, input, wind) {
    if (state.crashed) return EVENT_NONE;
    state.time += dt;
    let events = EVENT_NONE;

    // --- Throttle and fuel: full power burns fast, idle sips. Empty tank = glide. ---
    const wantThrottle = state.fuel > 0 ? input.throttle : 0;
    state.throttle += (wantThrottle - state.throttle) * Math.min(1, dt * 2.5);
    const burn = (PLANE.fuelBurnIdle + (PLANE.fuelBurn - PLANE.fuelBurnIdle) * state.throttle) * dt;
    const hadFuel = state.fuel > 0;
    state.fuel = Math.max(0, state.fuel - burn);
    if (hadFuel && state.fuel <= 0) events |= EVENT_FUEL_EMPTY;

    const flapFactor = state.flaps ? 0.82 : 1; // flaps: slower, more lift, steadier
    const targetSpeed = state.throttle * PLANE.maxSpeed * flapFactor;
    const accel = state.onGround ? PLANE.accel * 0.55 : PLANE.accel;
    if (state.speed < targetSpeed) state.speed = Math.min(targetSpeed, state.speed + accel * dt);
    else state.speed = Math.max(targetSpeed, state.speed - PLANE.drag * 22 * dt);

    // --- Attitude: elevator pitches, ailerons roll, roll turns the heading. ---
    const stallRatio = Math.max(0, 1 - state.speed / PLANE.stallSpeed);
    if (state.airborne) {
      state.pitch += input.pitch * PLANE.pitchRate * dt;
      // Stalled wing: the nose drops on its own, whatever the stick says.
      if (stallRatio > 0) state.pitch -= 0.35 * stallRatio * dt;
      state.pitch = Math.max(-PLANE.maxPitch, Math.min(PLANE.maxPitch, state.pitch));
      state.roll += input.roll * PLANE.rollRate * dt;
      state.roll = Math.max(-PLANE.maxRoll, Math.min(PLANE.maxRoll, state.roll));
      // Coordinated turn: bank into the heading change, scaled by airspeed.
      state.heading -= state.roll * PLANE.turnCoordination * (state.speed / PLANE.maxSpeed) * dt * 1.6;
      // Gentle self-levelling when the stick is centred.
      if (Math.abs(input.roll) < 0.05) state.roll *= Math.max(0, 1 - dt * 0.7);
      if (Math.abs(input.pitch) < 0.05) state.pitch *= Math.max(0, 1 - dt * 0.4);
    } else {
      // On the ground: steer with the ailerons, pitch only lifts the nose at speed.
      state.heading -= input.roll * 0.5 * dt * Math.min(1, state.speed / 20);
      state.pitch = 0;
      state.roll = 0;
      if (input.brake) state.speed = Math.max(0, state.speed - 26 * dt);
    }

    state.flaps = !!input.flaps;
    state.gearDown = input.gear !== false;

    // --- Velocity: forward flight plus stall sink plus wind. ---
    // A stalled wing loses lift linearly with the shortfall: hanging on the
    // prop at high pitch no longer holds the plane up.
    const fwd = forward();
    const sink = state.airborne ? PLANE.gravitySink * stallRatio : 0;
    const vel = fwd.clone().multiplyScalar(state.speed);
    vel.y -= sink;
    if (wind) vel.add(wind);
    state.pos.addScaledVector(vel, dt);
    state.verticalSpeed = vel.y;

    // --- Ground and water: landings, damage and crashes. ---
    const groundH = heightAt(state.pos.x, state.pos.z);
    const groundClearance = state.pos.y - groundH;
    // Rolling on the ground follows the terrain, dips included.
    if (state.onGround && !state.airborne) state.pos.y = groundH + GEAR_HEIGHT;
    if (groundClearance <= GEAR_HEIGHT) {
      const strip = stripAt(state.pos.x, state.pos.z);
      const overWater = groundH < 1;
      const vsDown = -state.verticalSpeed;
      if (overWater && !strip) {
        state.crashed = true;
        return events | EVENT_CRASH;
      }
      if (state.airborne) {
        if (strip && state.gearDown && vsDown < PLANE.crashVerticalSpeed && state.speed < 68) {
          // Touchdown on a strip.
          state.onGround = true;
          state.airborne = false;
          state.pos.y = groundH + GEAR_HEIGHT;
          state.pitch = 0;
          state.roll = 0;
          state.landedStrip = strip;
          events |= EVENT_LANDED;
          if (vsDown > PLANE.hardLandingVerticalSpeed) {
            state.damage = Math.min(100, state.damage + 25);
            events |= EVENT_DAMAGE;
          }
        } else if (state.gearDown && vsDown < PLANE.hardLandingVerticalSpeed && state.speed < 55 && !overWater) {
          // Rough-field landing: survivable, costly.
          state.onGround = true;
          state.airborne = false;
          state.pos.y = groundH + GEAR_HEIGHT;
          state.pitch = 0;
          state.roll = 0;
          state.damage = Math.min(100, state.damage + 35);
          events |= EVENT_LANDED | EVENT_DAMAGE;
        } else {
          state.crashed = true;
          return events | EVENT_CRASH;
        }
      } else {
        state.pos.y = groundH + GEAR_HEIGHT;
      }
      if (state.damage >= 100) {
        state.crashed = true;
        return events | EVENT_CRASH;
      }
    }

    // Track time on the ground: a touchdown needs a moment to settle before
    // the plane may rotate again, or a flare input bounces it straight back up.
    if (state.onGround) state.groundTime += dt;
    else state.groundTime = 0;

    // --- Takeoff: fast enough on a strip, settled, nose up, and she flies. ---
    if (state.onGround && state.groundTime > 0.8 && state.speed > PLANE.takeoffSpeed && input.pitch > 0.25) {
      state.onGround = false;
      state.airborne = true;
      state.pitch = 0.12;
      events |= EVENT_TAKEOFF;
    }

    // World edge: turn back with a gentle push, never a wall.
    const edge = 2050;
    if (Math.abs(state.pos.x) > edge || Math.abs(state.pos.z) > edge) {
      state.heading += Math.PI * dt * 0.4;
    }
    return events;
  }

  return { state, step, reset, forward };
}
