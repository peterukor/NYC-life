// =====================================================================
// transit.ts — the subway ride (and the rideshare ride) between areas.
//
// The ride is also the LOADING SCREEN: while you watch the train rattle
// through the tunnel (or the car cross the bridge), the next borough is
// built in the background. It's short, skippable, and random events
// can happen on board (Showtime, spilled coffee, signal problems).
// The train car has ad posters too: "ads underground".
// =====================================================================

import * as THREE from 'three';
import { adTexture, HOUSE_ADS } from '../render/textures.ts';
import { makeAvatar, OUTFIT_COLORS, SKIN_TONES, HAIR_COLORS } from './avatar.ts';

export interface TransitScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update: (dt: number) => void;
  dispose: () => void;
}

export function buildSubwayRide(aspect: number): TransitScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#05060a');
  const disposables: { dispose(): void }[] = [];
  const t = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const lam = (c: string) => t(new THREE.MeshLambertMaterial({ color: c }));

  const L = 18;
  const car = new THREE.Group();
  const floor = new THREE.Mesh(t(new THREE.BoxGeometry(3, 0.1, L)), lam('#4a4e57'));
  const ceiling = new THREE.Mesh(t(new THREE.BoxGeometry(3, 0.1, L)), lam('#d9dde3'));
  ceiling.position.y = 2.4;
  car.add(floor, ceiling);
  // Orange-and-yellow bench seats, the classic look.
  for (const side of [-1.25, 1.25]) {
    const seat = new THREE.Mesh(t(new THREE.BoxGeometry(0.5, 0.45, L - 2)), lam(side < 0 ? '#f4a261' : '#e9c46a'));
    seat.position.set(side, 0.3, 0);
    const wall = new THREE.Mesh(t(new THREE.BoxGeometry(0.08, 2.4, L)), lam('#c5cbd3'));
    wall.position.set(side * 1.2, 1.2, 0);
    car.add(seat, wall);
  }
  // Poles.
  for (let z = -6; z <= 6; z += 4) {
    const pole = new THREE.Mesh(t(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 6)), lam('#e5e5e5'));
    pole.position.set(0, 1.2, z);
    car.add(pole);
  }
  // Ad posters above the windows ("car cards").
  for (let i = 0; i < 6; i++) {
    const ad = HOUSE_ADS[(i * 3) % HOUSE_ADS.length];
    const poster = new THREE.Mesh(t(new THREE.PlaneGeometry(1.6, 0.45)), t(new THREE.MeshBasicMaterial({ map: adTexture(ad, 1.6 / 0.45), toneMapped: false })));
    const side = i % 2 ? 1 : -1;
    poster.position.set(side * 1.14, 2.05, -6 + Math.floor(i / 2) * 6);
    poster.rotation.y = -side * Math.PI / 2;
    car.add(poster);
  }
  // Riders.
  const riders: ReturnType<typeof makeAvatar>[] = [];
  for (let i = 0; i < 7; i++) {
    const a = makeAvatar({ body: i % 2 ? 'f' : 'm', skin: SKIN_TONES[(i * 5) % SKIN_TONES.length], top: OUTFIT_COLORS[(i * 3) % OUTFIT_COLORS.length], bottom: '#2b2d42', hair: HAIR_COLORS[i % HAIR_COLORS.length] });
    const side = i % 2 ? 1.1 : -1.1;
    a.root.position.set(side, i < 4 ? -0.35 : 0, -7 + i * 2.1);
    a.root.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    if (i >= 4) a.root.position.x = side * 0.4; // standing riders
    car.add(a.root);
    riders.push(a);
    disposables.push({ dispose: a.dispose });
  }
  scene.add(car);

  // Tunnel lights rushing past the windows.
  const lightMat = t(new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false }));
  const lights: THREE.Mesh[] = [];
  for (let i = 0; i < 14; i++) {
    for (const side of [-1.9, 1.9]) {
      const m = new THREE.Mesh(t(new THREE.BoxGeometry(0.15, 0.15, 0.6)), lightMat);
      m.position.set(side, 1.5, -40 + i * 6);
      scene.add(m);
      lights.push(m);
    }
  }
  scene.add(new THREE.HemisphereLight('#f1f5ff', '#20232a', 1.1));
  const fl = new THREE.PointLight('#ffffff', 18, 20);
  fl.position.set(0, 2.2, 0);
  scene.add(fl);

  const camera = new THREE.PerspectiveCamera(62, aspect, 0.1, 200);
  camera.position.set(0, 1.55, 8.2);
  camera.lookAt(0, 1.3, -6);

  let time = 0;
  return {
    scene,
    camera,
    update(dt) {
      time += dt;
      for (const m of lights) {
        m.position.z += dt * 38;
        if (m.position.z > 40) m.position.z -= 84;
      }
      // The car sways and rattles like the real thing.
      car.rotation.z = Math.sin(time * 2.3) * 0.006 + Math.sin(time * 11) * 0.002;
      car.position.y = Math.sin(time * 17) * 0.004;
      for (const r of riders) r.animate(0, dt);
    },
    dispose() {
      disposables.forEach((x) => x.dispose());
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
    },
  };
}
