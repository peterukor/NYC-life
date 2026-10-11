// =====================================================================
// Funland — a cartoon amusement park next to Central Park (game-only,
// Coney Island vibe). A turning Ferris wheel with colourful cars, a roller coaster
// with a big drop, a spinning carousel and striped carnival tents.
// Moving parts are animated through ctx.animate().
// =====================================================================

import * as THREE from 'three';
import { blockRect } from '../layout.ts';
import { LANDMARKS } from './registry.ts';
import { Toy } from './toy.ts';

const CANDY = ['#ff3d7f', '#ffd93d', '#4d96ff', '#6bcb77', '#c77dff', '#ff8a3d'];

LANDMARKS.add({
  id: 'funland',
  build({ place, district, group, track, animate }) {
    // Covers the place's block and the one north of it (see layout.ts).
    const [c, r] = place.block;
    const a = blockRect(district, c, r - 1);
    const b = blockRect(district, c, r);
    const area = { minX: a.minX + 4, maxX: a.maxX - 4, minZ: a.minZ + 4, maxZ: b.maxZ - 4 };
    const cx = (area.minX + area.maxX) / 2;

    // ---- Ferris wheel (rotating)
    const wheelX = cx + 14;
    const wheelZ = area.minZ + 22;
    const R = 16;
    const hub = R + 4;
    const frame = new Toy();
    for (const s of [-1, 1]) {
      frame.add(new THREE.CylinderGeometry(0.6, 0.9, hub + 1, 8).rotateZ(0.32).translate(wheelX - 5.5, hub / 2, wheelZ + s * 2.6), '#ffffff');
      frame.add(new THREE.CylinderGeometry(0.6, 0.9, hub + 1, 8).rotateZ(-0.32).translate(wheelX + 5.5, hub / 2, wheelZ + s * 2.6), '#ffffff');
    }
    frame.block(16, 1, 8, wheelX, 0.18, wheelZ, '#ffd93d', 0.3);
    group.add(frame.build('ferris-frame'));
    const wheel = new THREE.Group();
    const spin = new Toy();
    spin.add(new THREE.TorusGeometry(R, 0.5, 6, 40), '#ff3d7f');
    spin.add(new THREE.TorusGeometry(R * 0.55, 0.35, 6, 32), '#ffd93d');
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      spin.add(new THREE.CylinderGeometry(0.18, 0.18, R, 4).translate(0, R / 2, 0).rotateZ(ang), '#ffffff');
    }
    spin.cyl(1.4, 1.4, 6, 0, -3, 0, '#4d96ff', 12);
    const spinMesh = spin.build('ferris-wheel');
    wheel.add(spinMesh);
    // Gondolas stay upright while the wheel turns.
    const cars: THREE.Mesh[] = [];
    for (let i = 0; i < 10; i++) {
      const car = new THREE.Mesh(track(new THREE.CylinderGeometry(1.5, 1.2, 2.2, 8)), track(new THREE.MeshLambertMaterial({ color: CANDY[i % CANDY.length] })));
      cars.push(car);
      group.add(car);
    }
    wheel.position.set(wheelX, hub, wheelZ);
    group.add(wheel);

    // ---- Roller coaster: a looping track on supports.
    const coaster = new Toy();
    const pts: THREE.Vector3[] = [];
    const cz0 = area.maxZ - 34;
    for (let i = 0; i <= 60; i++) {
      const t = (i / 60) * Math.PI * 2;
      const x = cx + Math.cos(t) * 26;
      const z = cz0 + Math.sin(t) * 14;
      const y = 6 + 10 * Math.max(0, Math.sin(t * 2 + 0.6)) + 6 * Math.max(0, Math.cos(t));
      pts.push(new THREE.Vector3(x, y, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    coaster.add(new THREE.TubeGeometry(curve, 160, 0.55, 6, true), '#ff3d7f');
    coaster.add(new THREE.TubeGeometry(curve, 160, 0.55, 6, true).translate(0, -1, 0), '#ffd93d');
    for (let i = 0; i < 60; i += 3) {
      const p = curve.getPointAt(i / 60);
      coaster.cyl(0.35, 0.45, p.y - 1, p.x, 0.18, p.z, '#ffffff', 6);
    }
    group.add(coaster.build('roller-coaster'));
    const train = new THREE.Mesh(track(new THREE.BoxGeometry(2.4, 1.4, 5)), track(new THREE.MeshLambertMaterial({ color: '#4d96ff' })));
    group.add(train);

    // ---- Carousel (rotating striped roof)
    const carX = cx - 18;
    const carZ = area.minZ + 18;
    const base = new Toy();
    base.cyl(9, 9.5, 1, carX, 0.18, carZ, '#ffffff', 24);
    base.cyl(0.8, 0.8, 7, carX, 1, carZ, '#ffd93d', 10);
    group.add(base.build('carousel-base'));
    const roof = new Toy();
    for (let i = 0; i < 12; i++) {
      roof.add(new THREE.ConeGeometry(10, 4, 12, 1, false, (i / 12) * Math.PI * 2, Math.PI / 6).translate(0, 2, 0), i % 2 ? '#ff3d7f' : '#ffffff');
    }
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      roof.cyl(0.15, 0.15, 5, Math.cos(ang) * 6.5, -5, Math.sin(ang) * 6.5, '#ffd93d', 6);
      roof.block(1.2, 1.4, 2.6, Math.cos(ang) * 6.5, -3.4, Math.sin(ang) * 6.5, CANDY[i % CANDY.length], 0.4);
    }
    const roofMesh = roof.build('carousel-top');
    roofMesh.position.set(carX, 8, carZ);
    group.add(roofMesh);

    // ---- Striped carnival tents
    const tents = new Toy();
    for (let i = 0; i < 5; i++) {
      const x = area.minX + 8 + i * ((area.maxX - area.minX - 16) / 4);
      const z = (area.minZ + area.maxZ) / 2;
      tents.block(6, 3, 6, x, 0.18, z, '#ffffff', 0.15);
      for (let k = 0; k < 8; k++) tents.add(new THREE.ConeGeometry(5, 3.4, 8, 1, false, (k / 8) * Math.PI * 2, Math.PI / 4).translate(x, 4.9, z), k % 2 ? CANDY[i] : '#ffffff');
    }
    group.add(tents.build('carnival-tents'));

    // ---- Motion
    let t = 0;
    const v = new THREE.Vector3();
    animate((dt) => {
      t += dt;
      wheel.rotation.z = t * 0.12;
      cars.forEach((car, i) => {
        const ang = t * 0.12 + (i / cars.length) * Math.PI * 2;
        car.position.set(wheelX + Math.cos(ang) * R, hub + Math.sin(ang) * R - 1.6, wheelZ);
      });
      roofMesh.rotation.y = t * 0.6;
      const u = (t * 0.08) % 1;
      train.position.copy(curve.getPointAt(u)).y += 1.2;
      curve.getTangentAt(u, v);
      train.lookAt(train.position.clone().add(v));
    });
  },
});
