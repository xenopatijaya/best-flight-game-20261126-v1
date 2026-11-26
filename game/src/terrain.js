// terrain.js — one job: the Meridian Archipelago itself — islands, lagoon,
// airstrips, palms, clouds and sky — plus heightAt(x, z) shared by the
// flight model for terrain collision and landings.
import * as THREE from 'three';
import { WORLD } from './config.js';
import { createRandom, makeNoise2D } from './random.js';

// Island bumps: gaussian hills. The main island holds the home strip.
export const ISLANDS = [
  { x: 0, z: 0, r: 620, h: 95 }, // Home Isle — home strip
  { x: -1050, z: -750, r: 430, h: 78 }, // North Isle — strip 2
  { x: 1150, z: -620, r: 380, h: 64 }, // East Isle — strip 3
  { x: -1150, z: 950, r: 340, h: 58 }, // West Isle
  { x: 1250, z: 1050, r: 300, h: 70 }, // Far Isle — storm delivery
  { x: 250, z: -1250, r: 210, h: 40 }, // Gull Rock
  { x: -550, z: 1350, r: 180, h: 34 }, // Turtle Cay
];

// Airstrips: flat pads carved into the terrain. heading is the landing
// heading in radians: forward is (-sin h, -cos h). Every strip sits on its
// island's low shore (not the peak) with a clear approach over the lagoon,
// so a landing never has to dive off a cliff onto the pad.
export const STRIPS = [
  { name: 'HOME', x: 0, z: 560, heading: -Math.PI / 2, length: 260, width: 30, altitude: 12 },
  { name: 'NORTH', x: -1050, z: -370, heading: Math.PI / 2, length: 220, width: 26, altitude: 10 },
  { name: 'EAST', x: 1150, z: -290, heading: Math.PI / 2, length: 220, width: 26, altitude: 10 },
];

const noise = makeNoise2D(WORLD.seed + 7);

function bump(x, z, island) {
  const dx = (x - island.x) / island.r;
  const dz = (z - island.z) / island.r;
  const d2 = dx * dx + dz * dz;
  if (d2 > 1.4) return 0;
  return island.h * Math.exp(-d2 * 2.2);
}

function stripFlatten(x, z) {
  // Returns {flat, altitude} — flat 1.0 means fully flattened to the strip.
  let best = { flat: 0, altitude: 0 };
  for (const s of STRIPS) {
    const dx = x - s.x;
    const dz = z - s.z;
    const fwd = stripForward(s);
    const right = stripRight(s);
    const along = dx * fwd.x + dz * fwd.z;
    const across = dx * right.x + dz * right.z;
    const ha = Math.abs(along) / (s.length / 2);
    const wa = Math.abs(across) / (s.width / 2);
    if (ha < 1.6 && wa < 2.2) {
      const edge = Math.max(ha, wa / 1.4);
      const flat = Math.max(0, 1 - Math.max(0, edge - 0.55) / 0.45);
      if (flat > best.flat) best = { flat, altitude: s.altitude };
    }
  }
  return best;
}

/** Ground height in metres at (x, z). Water is 0; islands rise above it. */
export function heightAt(x, z) {
  let h = -6; // lagoon floor
  for (const island of ISLANDS) h += bump(x, z, island);
  // Rolling detail, stronger on high ground so peaks look carved.
  const detail = noise(x * 0.004, z * 0.004) * 4 + noise(x * 0.015, z * 0.015) * 1.5;
  h += detail * Math.max(0, Math.min(1, h / 40));
  const strip = stripFlatten(x, z);
  if (strip.flat > 0) h = h * (1 - strip.flat) + strip.altitude * strip.flat;
  return h;
}

/** Strip axis: a plane landing on strip s flies heading s.heading, whose
 * forward vector is (-sin h, -cos h) in (x, z); right is (cos h, -sin h). */
export function stripForward(s) {
  return { x: -Math.sin(s.heading), z: -Math.cos(s.heading) };
}
export function stripRight(s) {
  return { x: Math.cos(s.heading), z: -Math.sin(s.heading) };
}

/** True when (x, z) is over the strip's paved area (for landing checks). */
export function stripAt(x, z) {
  for (const s of STRIPS) {
    const dx = x - s.x;
    const dz = z - s.z;
    const fwd = stripForward(s);
    const right = stripRight(s);
    const along = dx * fwd.x + dz * fwd.z;
    const across = dx * right.x + dz * right.z;
    if (Math.abs(along) <= s.length / 2 && Math.abs(across) <= s.width / 2) return s;
  }
  return null;
}

function terrainColor(h, slope, rand) {
  // One style: sand at the waterline, grass on the flats, rock on the peaks.
  const sand = new THREE.Color(0xe8d29a);
  const grass = new THREE.Color(0x5da24a);
  const grass2 = new THREE.Color(0x6fb457);
  const rock = new THREE.Color(0x8a7f72);
  const c = new THREE.Color();
  if (h < 3) c.copy(sand);
  else if (h < 34) c.copy(grass).lerp(grass2, rand());
  else c.copy(grass2).lerp(rock, Math.min(1, (h - 34) / 40));
  if (slope > 0.55) c.lerp(rock, 0.6);
  if (h < 1.5) c.lerp(sand, 0.7);
  return c;
}

export function buildTerrain(scene) {
  const rand = createRandom(WORLD.seed);
  const group = new THREE.Group();
  group.name = 'archipelago';

  // --- Ground: displaced plane with vertex colours ---
  const SEG = 220;
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const h = heightAt(v.x, v.z);
    pos.setY(i, h);
    // slope estimate from neighbours, cheap: sample height a step away
    const slope = Math.abs(heightAt(v.x + 12, v.z) - h) / 12 + Math.abs(heightAt(v.x, v.z + 12) - h) / 12;
    const c = terrainColor(h, slope, rand);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.name = 'ground';
  group.add(ground);

  // --- Lagoon water: a big translucent plane just below the beaches ---
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.size, WORLD.size),
    new THREE.MeshPhongMaterial({
      color: 0x1e7fa8,
      transparent: true,
      opacity: 0.82,
      shininess: 120,
      specular: 0x99ddff,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = WORLD.waterLevel + 0.4;
  water.name = 'lagoon';
  group.add(water);

  // --- Airstrips: dark asphalt pads with white centre line ---
  // A thin box slab, rotated about Y so its long side follows the strip's
  // landing heading (local +x maps to the forward vector).
  for (const s of STRIPS) {
    const yaw = s.heading + Math.PI / 2;
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(s.length, 0.4, s.width),
      new THREE.MeshLambertMaterial({ color: 0x3a3f46 }),
    );
    pad.rotation.y = yaw;
    pad.position.set(s.x, s.altitude + 0.1, s.z);
    pad.name = `strip-${s.name}`;
    group.add(pad);
    // centre dashes along the landing direction
    const fwd = stripForward(s);
    const dashGeo = new THREE.BoxGeometry(14, 0.15, 1.6);
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5f2e8 });
    for (let d = -s.length / 2 + 24; d < s.length / 2 - 10; d += 34) {
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.rotation.y = yaw;
      dash.position.set(s.x + fwd.x * d, s.altitude + 0.35, s.z + fwd.z * d);
      group.add(dash);
    }
    // windsock pole + cone at the strip's edge
    const right = stripRight(s);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 12, 6),
      new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }),
    );
    const px = s.x + right.x * (s.width / 2 + 12);
    const pz = s.z + right.z * (s.width / 2 + 12);
    pole.position.set(px, s.altitude + 6, pz);
    group.add(pole);
    const sock = new THREE.Mesh(
      new THREE.ConeGeometry(1.6, 6, 8),
      new THREE.MeshLambertMaterial({ color: 0xff7a1a }),
    );
    sock.rotation.z = Math.PI / 2.4;
    sock.position.set(px + 2.4, s.altitude + 11, pz);
    sock.name = 'windsock';
    group.add(sock);
  }

  // --- Palm trees: trunk + crossed leaf planes, scattered on the flats ---
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.9, 9, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  const leafGeo = new THREE.ConeGeometry(3.2, 6.5, 5);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8f3a });
  const palm = new THREE.Group();
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 4.5;
  palm.add(trunk);
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    const a = (i / 5) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.6, 9.6, Math.sin(a) * 1.6);
    leaf.rotation.z = Math.cos(a) * 0.9;
    leaf.rotation.x = -Math.sin(a) * 0.9;
    palm.add(leaf);
  }
  let planted = 0;
  let guard = 0;
  while (planted < 90 && guard++ < 3000) {
    const x = (rand() * 2 - 1) * (WORLD.size / 2 - 80);
    const z = (rand() * 2 - 1) * (WORLD.size / 2 - 80);
    const h = heightAt(x, z);
    if (h < 4 || h > 30 || stripAt(x, z)) continue;
    const tree = palm.clone();
    tree.position.set(x, h - 0.3, z);
    tree.rotation.y = rand() * Math.PI * 2;
    const s = 0.8 + rand() * 0.7;
    tree.scale.setScalar(s);
    group.add(tree);
    planted++;
  }

  // --- Clouds: soft white blobs drifting high above the lagoon ---
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
  const puffGeo = new THREE.SphereGeometry(1, 10, 8);
  const clouds = new THREE.Group();
  clouds.name = 'clouds';
  for (let i = 0; i < 22; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rand() * 3);
    for (let p = 0; p < puffs; p++) {
      const puff = new THREE.Mesh(puffGeo, cloudMat);
      puff.position.set((rand() * 2 - 1) * 22, (rand() * 2 - 1) * 4, (rand() * 2 - 1) * 10);
      puff.scale.set(14 + rand() * 14, 6 + rand() * 5, 10 + rand() * 8);
      cloud.add(puff);
    }
    cloud.position.set((rand() * 2 - 1) * 1900, 240 + rand() * 120, (rand() * 2 - 1) * 1900);
    cloud.userData.drift = 1.5 + rand() * 2;
    clouds.add(cloud);
  }
  group.add(clouds);

  scene.add(group);
  return { group, clouds };
}

/** Drift the clouds slowly; call every frame with dt seconds. */
export function stepClouds(clouds, dt) {
  for (const cloud of clouds.children) {
    cloud.position.x += cloud.userData.drift * dt;
    if (cloud.position.x > WORLD.size / 2) cloud.position.x = -WORLD.size / 2;
  }
}
