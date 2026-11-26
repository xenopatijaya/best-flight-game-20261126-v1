// render.js — one job: the Three.js scene — sky, sun, sea haze, the chase and
// cockpit cameras, and the glowing mission rings. It paints; it never flies.
import * as THREE from 'three';
import { CAMERA, WORLD } from './config.js';
import { buildTerrain, stepClouds } from './terrain.js';
import { buildAircraft } from './aircraft.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(canvas.clientWidth || 1280, canvas.clientHeight || 720, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  // One style: warm late-afternoon sky over a turquoise lagoon.
  scene.background = new THREE.Color(0x8fc7e8);
  scene.fog = new THREE.Fog(0xa8cfe8, 900, 3200);

  const sun = new THREE.DirectionalLight(0xfff2d0, 2.2);
  sun.position.set(600, 900, 300);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xbfd9ee, 0.9));
  const hemi = new THREE.HemisphereLight(0xbfd9ee, 0x3d6b4a, 0.65);
  scene.add(hemi);

  // --- Squall rain for Storm Run: short streaks in a box that rides with
  // the plane, so the storm is something you fly through, not just wind. ---
  const RAIN_DROPS = 700;
  const RAIN_BOX = { x: 260, y: 170, z: 260 };
  const rainPos = new Float32Array(RAIN_DROPS * 2 * 3);
  const rainSpeed = new Float32Array(RAIN_DROPS);
  for (let i = 0; i < RAIN_DROPS; i++) {
    rainPos[i * 6] = (Math.random() - 0.5) * RAIN_BOX.x;
    rainPos[i * 6 + 1] = (Math.random() - 0.5) * RAIN_BOX.y;
    rainPos[i * 6 + 2] = (Math.random() - 0.5) * RAIN_BOX.z;
    rainPos[i * 6 + 3] = rainPos[i * 6];
    rainPos[i * 6 + 4] = rainPos[i * 6 + 1] - 2.5;
    rainPos[i * 6 + 5] = rainPos[i * 6 + 2];
    rainSpeed[i] = 55 + Math.random() * 35;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(
    rainGeo,
    new THREE.LineBasicMaterial({ color: 0xd6e9ff, transparent: true, opacity: 0.5 }),
  );
  rain.visible = false;
  rain.frustumCulled = false;
  scene.add(rain);
  const skyClear = new THREE.Color(0x8fc7e8);
  const skyStorm = new THREE.Color(0x5d7488);
  const fogClear = new THREE.Fog(0xa8cfe8, 900, 3200);
  const fogStorm = new THREE.Fog(0x7e93a6, 500, 2200);

  const terrain = buildTerrain(scene);
  const aircraft = buildAircraft();
  scene.add(aircraft.group);

  const camera = new THREE.PerspectiveCamera(62, 1280 / 720, 0.5, 9000);
  camera.position.set(0, 40, 60);

  // --- Mission rings: golden toruses, the next one pulsing bright. ---
  const ringGroup = new THREE.Group();
  ringGroup.name = 'rings';
  scene.add(ringGroup);
  const ringGeo = new THREE.TorusGeometry(16, 1.1, 12, 40);
  const ringMatNext = new THREE.MeshBasicMaterial({ color: 0xffb020 });
  const ringMatLater = new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.35 });
  const ringMatDone = new THREE.MeshBasicMaterial({ color: 0x37d67a, transparent: true, opacity: 0.5 });
  let ringMeshes = [];

  function setRings(rings, nextIndex) {
    for (const m of ringMeshes) ringGroup.remove(m);
    ringMeshes = [];
    for (const ring of rings) {
      const mat = ring.passed ? ringMatDone : ring.index === nextIndex ? ringMatNext : ringMatLater;
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.position.copy(ring.pos);
      mesh.rotation.y = Math.PI / 2; // face the tour direction loosely
      ringGroup.add(mesh);
      ringMeshes.push(mesh);
    }
  }

  // --- Delivery beacon for Storm Run: a tall light pillar on Far Isle. ---
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 320, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff5030, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  beacon.position.set(1250, 160, 1050);
  beacon.visible = false;
  scene.add(beacon);

  const camPos = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const desired = new THREE.Vector3();
  let firstFrame = true;

  /**
   * Paint one frame.
   * snap: flight state snapshot {pos, heading, pitch, roll, speed, throttle, onGround}
   * opts: {mode: 'chase'|'cockpit', time, rings, nextRing, showBeacon, raining}
   */
  function draw(snap, opts) {
    const plane = aircraft.group;
    // In the cockpit you are inside the plane: the model stays out of its
    // own view, so the windscreen shows only the world ahead.
    plane.visible = opts.mode !== 'cockpit';
    plane.position.copy(snap.pos);
    plane.rotation.order = 'YXZ';
    plane.rotation.y = snap.heading;
    plane.rotation.x = snap.pitch; // nose up = positive pitch
    plane.rotation.z = -snap.roll;
    // realDt is the wall-clock frame time: the camera must smooth on real
    // time, not on the fixed physics step, or a slow frame rate leaves the
    // camera hundreds of metres behind the plane.
    const realDt = opts.realDt ?? opts.dt ?? 0.016;
    aircraft.prop.rotation.z += (0.25 + snap.throttle * 2.4) * realDt * 22;

    // Chase camera: behind and above, smoothed so it never fights the pilot.
    const cp = Math.cos(snap.pitch);
    const back = new THREE.Vector3(
      Math.sin(snap.heading) * cp,
      -Math.sin(snap.pitch),
      Math.cos(snap.heading) * cp,
    );
    if (opts.mode === 'cockpit') {
      const off = CAMERA.cockpitOffset;
      desired.copy(snap.pos).add(new THREE.Vector3(
        -Math.sin(snap.heading) * off.z - Math.cos(snap.heading) * off.x,
        off.y,
        -Math.cos(snap.heading) * off.z + Math.sin(snap.heading) * off.x,
      ));
      camPos.copy(desired);
      camTarget.copy(snap.pos).add(new THREE.Vector3(
        -Math.sin(snap.heading) * 60,
        Math.sin(snap.pitch) * 60 + 2,
        -Math.cos(snap.heading) * 60,
      ));
    } else {
      desired.copy(snap.pos).addScaledVector(back, CAMERA.chaseDistance);
      desired.y += CAMERA.chaseHeight;
      if (firstFrame) {
        camPos.copy(desired);
        firstFrame = false;
      } else {
        // Critically damped follow on real frame time: stiff enough to stay
        // on the plane's tail through a banked turn, soft enough to never
        // snap — and correct at any frame rate, not just 60 fps.
        const k = 1 - Math.exp(-realDt * CAMERA.chaseLag);
        camPos.lerp(desired, k);
      }
      camTarget.copy(snap.pos).add(new THREE.Vector3(0, 1.5, 0));
    }
    camera.position.copy(camPos);
    camera.lookAt(camTarget);

    // Rings pulse: the next one breathes, passed ones stay green and calm.
    const t = opts.time ?? 0;
    ringMeshes.forEach((mesh, i) => {
      const ring = opts.rings?.[i];
      if (!ring) return;
      mesh.material = ring.passed ? ringMatDone : i === opts.nextRing ? ringMatNext : ringMatLater;
      const s = i === opts.nextRing ? 1 + Math.sin(t * 3) * 0.05 : 1;
      mesh.scale.setScalar(s);
      mesh.rotation.z = Math.sin(t * 0.4 + i) * 0.08;
    });
    beacon.visible = !!opts.showBeacon;

    // Squall: rain rides with the plane and the sky goes grey while the
    // delivery is still outstanding; clear again once the medkit is down.
    const raining = !!opts.raining;
    rain.visible = raining;
    if (raining) {
      rain.position.copy(snap.pos);
      const attr = rainGeo.attributes.position;
      for (let i = 0; i < RAIN_DROPS; i++) {
        let y = attr.array[i * 6 + 1] - rainSpeed[i] * realDt;
        if (y < -RAIN_BOX.y / 2) {
          y += RAIN_BOX.y;
          attr.array[i * 6] = (Math.random() - 0.5) * RAIN_BOX.x;
          attr.array[i * 6 + 2] = (Math.random() - 0.5) * RAIN_BOX.z;
        }
        attr.array[i * 6 + 1] = y;
        attr.array[i * 6 + 4] = y - 2.5;
        attr.array[i * 6 + 3] = attr.array[i * 6];
        attr.array[i * 6 + 5] = attr.array[i * 6 + 2];
      }
      attr.needsUpdate = true;
      scene.background = skyStorm;
      scene.fog = fogStorm;
      hemi.intensity = 0.35;
    } else {
      scene.background = skyClear;
      scene.fog = fogClear;
      hemi.intensity = 0.65;
    }

    stepClouds(terrain.clouds, realDt);
    renderer.render(scene, camera);
  }

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return { draw, resize, setRings, scene, camera, renderer, aircraft };
}
