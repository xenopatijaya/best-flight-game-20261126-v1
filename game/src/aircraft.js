// aircraft.js — one job: the Kestrel bush plane itself — a model built from
// primitives (fuselage, wings, tail, spinning prop, landing gear) plus its
// navigation lights. No borrowed art: every part is drawn here.
import * as THREE from 'three';

const PAINT = 0xe8542f; // kestrel orange
const PAINT_DARK = 0xb23a1d;
const CREAM = 0xf5eeda;
const METAL = 0x9aa2ab;
const GLASS = 0x1d3a4d;

/** Builds the plane. Returns { group, prop, gearLeft, gearRight, gearNose }. */
export function buildAircraft() {
  const group = new THREE.Group();
  group.name = 'kestrel';

  const paint = new THREE.MeshLambertMaterial({ color: PAINT });
  const paintDark = new THREE.MeshLambertMaterial({ color: PAINT_DARK });
  const cream = new THREE.MeshLambertMaterial({ color: CREAM });
  const metal = new THREE.MeshLambertMaterial({ color: METAL });
  const glass = new THREE.MeshPhongMaterial({ color: GLASS, shininess: 90, specular: 0xaaccdd });

  // Fuselage: a tapered cylinder along z, nose forward (-z is forward here).
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.55, 5.6, 12), paint);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.set(0, 0, 0.4);
  group.add(fuselage);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 1.1, 12), paintDark);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0, -2.9);
  group.add(nose);

  // Canopy: a flattened sphere, glassy.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 10), glass);
  canopy.scale.set(0.9, 0.75, 1.7);
  canopy.position.set(0, 0.55, -0.7);
  group.add(canopy);

  // Main wing: wide, slightly swept, cream underside stripe.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.22, 1.7), paint);
  wing.position.set(0, 0.15, -0.3);
  group.add(wing);
  const wingStripe = new THREE.Mesh(new THREE.BoxGeometry(9.24, 0.1, 0.5), cream);
  wingStripe.position.set(0, 0.28, -0.9);
  group.add(wingStripe);
  // Wingtip lights: red left, green right.
  const tipL = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  tipL.position.set(-4.6, 0.15, -0.3);
  group.add(tipL);
  const tipR = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0x22ff66 }));
  tipR.position.set(4.6, 0.15, -0.3);
  group.add(tipR);

  // Tail: horizontal stabiliser + vertical fin with a cream flash.
  const stabiliser = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 1.1), paint);
  stabiliser.position.set(0, 0.2, 3.0);
  group.add(stabiliser);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.7, 1.4), paint);
  fin.position.set(0, 0.85, 3.0);
  group.add(fin);
  const finFlash = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.9), cream);
  finFlash.position.set(0, 1.05, 3.0);
  group.add(finFlash);

  // Propeller: hub + two blades, spins with throttle.
  const prop = new THREE.Group();
  prop.position.set(0, 0, -3.55);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 8), metal);
  hub.rotation.x = Math.PI / 2;
  prop.add(hub);
  const bladeGeo = new THREE.BoxGeometry(0.28, 2.6, 0.08);
  const blade1 = new THREE.Mesh(bladeGeo, paintDark);
  prop.add(blade1);
  const blade2 = new THREE.Mesh(bladeGeo, paintDark);
  blade2.rotation.z = Math.PI / 2;
  prop.add(blade2);
  group.add(prop);

  // Landing gear: two mains + nose wheel, struts that compress on touchdown.
  function makeGear(x, z) {
    const leg = new THREE.Group();
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6), metal);
    strut.position.y = -0.7;
    leg.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.y = -1.25;
    leg.add(wheel);
    leg.position.set(x, -0.4, z);
    group.add(leg);
    return leg;
  }
  const gearLeft = makeGear(-1.1, -1.2);
  const gearRight = makeGear(1.1, -1.2);
  const gearNose = makeGear(0, -2.6);

  // Registration on the fuselage side, as a tiny canvas texture (drawn, not borrowed).
  const regCanvas = document.createElement('canvas');
  regCanvas.width = 256;
  regCanvas.height = 64;
  const ctx = regCanvas.getContext('2d');
  ctx.fillStyle = '#f5eeda';
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PK-KST', 128, 34);
  const regTex = new THREE.CanvasTexture(regCanvas);
  const reg = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 0.48),
    new THREE.MeshBasicMaterial({ map: regTex, transparent: true }),
  );
  reg.position.set(0.86, 0.1, 1.2);
  reg.rotation.y = Math.PI / 2;
  group.add(reg);

  return { group, prop, gearLeft, gearRight, gearNose };
}
