// main.js — one job: glue. The loop, the screens (title / play / pause /
// win / crash), mission wiring, HUD refresh and the ?shot= screenshot scenes.
// ?seed=N fixes the world. ?shot=cover|rings|landing|debrief stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady.
import * as THREE from 'three';
import { WORLD, MISSIONS } from './config.js';
import { createFlight, EVENT_TAKEOFF, EVENT_LANDED, EVENT_CRASH, EVENT_DAMAGE, EVENT_FUEL_EMPTY } from './flight.js';
import { createMission, stepMission, objectiveTarget, stormWind, MISSION_RINGS, MISSION_HOP, MISSION_STORM } from './missions.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_OVER, SCREEN_WIN } from './render.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_RESTART, ACTION_CAMERA, ACTION_MISSION_1, ACTION_MISSION_2, ACTION_MISSION_3 } from './input.js';
import { createAudio } from './audio.js';
import { updateHud, toast } from './hud.js';
import { stageShot } from './shots.js';
import { STRIPS } from './terrain.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : WORLD.seed;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const flight = createFlight();
const audio = createAudio();

let screen = SCREEN_TITLE;
let mission = createMission(MISSION_RINGS);
let cameraMode = 'chase';
let elapsed = 0;
let warnedFuel = false;
let warnedStall = false;

function announce(message) {
  status.textContent = message;
}

function setMission(next) {
  mission = next;
  renderer.setRings(mission.rings ?? [], mission.nextRing ?? 0);
}

function startPoseFor(kind) {
  const strip = STRIPS[0];
  return {
    x: strip.x,
    y: strip.altitude + 1.25,
    z: strip.z,
    heading: strip.heading,
    speed: 0,
    fuel: kind === MISSION_STORM ? 62 : 100,
    onGround: true,
  };
}

function startMission(kind) {
  setMission(createMission(kind));
  flight.reset(startPoseFor(kind));
  warnedFuel = false;
  warnedStall = false;
  screen = SCREEN_PLAY;
  audio.start();
  document.getElementById('screen-title').classList.add('hidden');
  document.getElementById('screen-win').classList.add('hidden');
  document.getElementById('screen-over').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  const brief = MISSIONS.find((m) => m.id === (kind === 1 ? 'rings' : kind === 2 ? 'hop' : 'storm'));
  announce(`${mission.name}. ${brief?.tagline ?? ''}`);
  toast(`${mission.name} — good luck, pilot`, 2600);
}

function showScreen(id) {
  for (const s of ['screen-title', 'screen-win', 'screen-over']) document.getElementById(s).classList.add('hidden');
  if (id) document.getElementById(id).classList.remove('hidden');
}

/** Best score per sortie, kept on this machine so a return flight has
 * something to beat. */
function bestFor(kind) {
  try {
    return Number(localStorage.getItem(`kestrel-best-${kind}`) ?? 0) || 0;
  } catch {
    return 0;
  }
}
function recordBest(kind, score) {
  const best = Math.max(bestFor(kind), score);
  try {
    localStorage.setItem(`kestrel-best-${kind}`, String(best));
  } catch {
    // Private mode or no storage: the run still counts, just not kept.
  }
  return best;
}

function fmtClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The debrief line: score, time against the par, fuel left, best ever. */
function winStatsText() {
  const best = recordBest(mission.kind, mission.score);
  const parts = [
    `Score ${mission.score}`,
    `Time ${fmtClock(mission.elapsed)}`,
    `Fuel ${Math.round(flight.state.fuel)}% left`,
    `Best ${best}`,
  ];
  if (mission.timePar) {
    const diff = mission.timePar - mission.elapsed;
    parts.push(diff >= 0 ? `Under par by ${fmtClock(diff)}` : `Over par by ${fmtClock(-diff)}`);
  }
  return parts.join('  ·  ');
}

function endRun(win) {
  if (win) {
    screen = SCREEN_WIN;
    document.getElementById('win-title').textContent = `${mission.name} COMPLETE`;
    document.getElementById('win-stats').textContent = winStatsText();
    showScreen('screen-win');
    announce(`${mission.name} complete. Score ${mission.score}.`);
    audio.fanfare();
  } else {
    screen = SCREEN_OVER;
    const reason = flight.state.crashed ? 'The Kestrel is down.' : 'Out of fuel on the ground.';
    document.getElementById('over-title').textContent = flight.state.crashed ? 'CRASHED' : 'STRANDED';
    document.getElementById('over-stats').textContent =
      `${reason} Score ${mission.score}  ·  Rings ${mission.nextRing}/${mission.rings.length}  ·  Strips ${mission.stripsLanded.length}/3`;
    showScreen('screen-over');
    announce(`Run over. ${reason}`);
    audio.crashSound();
  }
  document.getElementById('hud').classList.add('hidden');
}

function hudSnapshot() {
  const s = flight.state;
  return {
    posX: s.pos.x,
    posZ: s.pos.z,
    altM: Math.max(0, s.pos.y),
    speedMs: s.speed,
    headingDeg: ((-s.heading * 180) / Math.PI % 360 + 360) % 360,
    pitch: s.pitch,
    roll: s.roll,
    fuel: s.fuel,
    throttle: s.throttle,
    vsMs: s.verticalSpeed,
    gear: s.gearDown,
    flaps: s.flaps,
    damage: s.damage,
  };
}

function handleMissionEvent(event) {
  if (event === 'ring') {
    audio.ringChime();
    // nextRing already counts the ring just taken.
    toast(`RING ${mission.nextRing} — CLEAN! +100`);
    renderer.setRings(mission.rings, mission.nextRing);
  } else if (event === 'landed') {
    audio.touchdown();
    const l = mission.lastLanding;
    if (l) {
      const rating = l.vs <= 1.5 ? 'BUTTERY' : l.vs <= 3 ? 'SMOOTH' : l.vs <= 5 ? 'FIRM' : 'HARD';
      toast(`TOUCHDOWN ${l.strip} — ${rating} +${l.bonus}`);
    } else {
      toast(`TOUCHDOWN on ${flight.state.landedStrip?.name ?? 'a strip'} — +score for a soft landing`);
    }
  } else if (event === 'complete') {
    endRun(true);
  } else if (event === 'fail') {
    endRun(false);
  }
}

function stepGame(dt) {
  const live = window.__input.read();
  const wind = mission.kind === MISSION_STORM ? stormWind(elapsed) : new THREE.Vector3(0, 0, 0);
  const events = flight.step(dt, live, wind);
  const s = flight.state;

  if (events & EVENT_TAKEOFF) toast('AIRBORNE — gear up with G when you are clear');
  if (events & EVENT_LANDED) {
    audio.touchdown();
    if (!mission.done) toast(`TOUCHDOWN — ${s.landedStrip ? s.landedStrip.name + ' strip' : 'rough field'}`);
  }
  if (events & EVENT_DAMAGE) toast('HARD LANDING — the Kestrel took damage', 3000);
  if (events & EVENT_FUEL_EMPTY) {
    toast('FUEL EMPTY — glide her down gently', 4000);
    audio.warning();
  }
  if (events & EVENT_CRASH) {
    endRun(false);
    return;
  }

  // Warnings the pilot can still act on.
  if (s.fuel < 20 && !warnedFuel && s.airborne) {
    warnedFuel = true;
    toast('LOW FUEL — find a strip', 3500);
    audio.warning();
  }
  if (s.airborne && s.speed < 26 && !warnedStall) {
    warnedStall = true;
    toast('STALL WARNING — nose down, add power', 3000);
    audio.warning();
  } else if (s.speed > 30) warnedStall = false;

  const missionEvent = stepMission(mission, s, dt, { landed: !!(events & EVENT_LANDED) });
  if (missionEvent) handleMissionEvent(missionEvent);

  audio.update(s.throttle, s.speed, s.airborne);
  updateHud(hudSnapshot(), mission, objectiveTarget(mission));
}

let lastPaint = 0;

function paint(now) {
  const s = flight.state;
  const realDt = lastPaint ? Math.min((now - lastPaint) / 1000, 0.25) : STEP;
  lastPaint = now;
  renderer.draw(
    { pos: s.pos, heading: s.heading, pitch: s.pitch, roll: s.roll, speed: s.speed, throttle: s.throttle, onGround: s.onGround },
    {
      mode: cameraMode,
      dt: STEP,
      realDt,
      time: elapsed,
      rings: mission.rings,
      nextRing: mission.nextRing,
      showBeacon: mission.kind === MISSION_STORM && !mission.delivered,
      raining: mission.kind === MISSION_STORM && !mission.delivered,
    },
  );
}

function runShot(name) {
  const game = { flight, setMission };
  const scene = stageShot(name, game);
  cameraMode = scene.cameraMode;
  showScreen(null);
  document.getElementById('hud').classList.remove('hidden');
  if (scene.overlay === 'win') {
    // The win screen carries the result on its own; the HUD would collide
    // with its title, so it stays hidden for this shot.
    document.getElementById('win-title').textContent = `${mission.name} COMPLETE`;
    document.getElementById('win-stats').textContent = winStatsText();
    showScreen('screen-win');
    document.getElementById('screen-win').classList.add('shot-top');
    document.getElementById('hud').classList.add('hidden');
  } else if (scene.overlay === 'title') {
    showScreen('screen-title');
    document.getElementById('hud').classList.add('hidden');
  }
  updateHud(hudSnapshot(), mission, objectiveTarget(mission));
  let painted = 0;
  function paintFrame(now) {
    paint(now);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paintFrame);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paintFrame);
}

function runGame() {
  window.__input = createInput();
  // Title first: the pilot picks a sortie, then flies. The Kestrel waits on
  // the home strip behind the title screen.
  setMission(createMission(MISSION_RINGS));
  flight.reset(startPoseFor(MISSION_RINGS));
  screen = SCREEN_TITLE;
  document.getElementById('hud').classList.add('hidden');
  showScreen('screen-title');
  announce('Kestrel Run. Pick a sortie: 1 Ring Run, 2 Island Hop, 3 Storm Run.');

  let last = performance.now();
  let accumulator = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const actions = window.__input.takeActions();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startMission(mission.kind);
    }
    if (actions & ACTION_MISSION_1 && screen !== SCREEN_PLAY) startMission(MISSION_RINGS);
    if (actions & ACTION_MISSION_2 && screen !== SCREEN_PLAY) startMission(MISSION_HOP);
    if (actions & ACTION_MISSION_3 && screen !== SCREEN_PLAY) startMission(MISSION_STORM);
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Flying.');
    }
    if (actions & ACTION_RESTART && (screen === SCREEN_PLAY || screen === SCREEN_PAUSED)) startMission(mission.kind);
    if (actions & ACTION_CAMERA) cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase';

    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        elapsed += STEP;
        stepGame(STEP);
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY) {
          accumulator = 0;
          break;
        }
      }
    } else {
      accumulator = 0;
      // Idle scene behind the title: slow orbit over the lagoon.
      if (screen === SCREEN_TITLE) {
        elapsed += 0.016;
        flight.state.heading += 0.0006;
      }
    }
    paint(now);
  }

  // Leaving the tab pauses a running game rather than letting it fly unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // Mission buttons on the title screen.
  for (const [id, kind] of [['btn-ring', MISSION_RINGS], ['btn-hop', MISSION_HOP], ['btn-storm', MISSION_STORM]]) {
    document.getElementById(id).addEventListener('click', () => startMission(kind));
  }
  document.getElementById('btn-again').addEventListener('click', () => startMission(mission.kind));
  const backToMenu = () => {
    screen = SCREEN_TITLE;
    showScreen('screen-title');
    document.getElementById('hud').classList.add('hidden');
    flight.reset(startPoseFor(mission.kind));
  };
  document.getElementById('btn-menu').addEventListener('click', backToMenu);
  document.getElementById('btn-menu2').addEventListener('click', backToMenu);
  document.getElementById('btn-retry').addEventListener('click', () => startMission(mission.kind));

  // Fit the canvas to its box.
  function fit() {
    const box = document.getElementById('stage');
    renderer.resize(box.clientWidth, box.clientHeight);
  }
  window.addEventListener('resize', fit);
  fit();
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
