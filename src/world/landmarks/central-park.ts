// =====================================================================
// Central Park — cartoon version.
//
// The park blocks themselves (grass, paths, trees) come from the city
// builder ('park' blocks in layout.ts). This adds what makes it read as
// CENTRAL PARK: a low stone wall around the edge, a big lake with
// rowboats, a cast-iron "Bow Bridge"-style arch over it, rocky outcrops,
// and a fountain plaza with an angel-topped fountain.
// =====================================================================

import * as THREE from 'three';
import { blockRect } from '../layout.ts';
import { LANDMARKS } from './registry.ts';
import { Toy } from './toy.ts';

LANDMARKS.add({
  id: 'centralPark',
  build({ district, group, track, animate }) {
    // The park covers blocks c=1..4, r=0..1 (see layout.ts).
    const a = blockRect(district, 1, 0);
    const b = blockRect(district, 4, 1);
    const park = { minX: a.minX, maxX: b.maxX, minZ: a.minZ, maxZ: b.maxZ };
    const toy = new Toy();

    // Low stone wall around the park, with gaps for entrances.
    const wall = '#b9b2a6';
    for (let x = park.minX; x < park.maxX - 6; x += 24) {
      toy.block(18, 1.1, 0.9, x + 9, 0.18, park.maxZ - 0.5, wall, 0.3);
      toy.block(18, 1.1, 0.9, x + 9, 0.18, park.minZ + 0.5, wall, 0.3);
    }

    // The lake: a soft blob of water across the middle of the park.
    const lx = (park.minX + park.maxX) / 2;
    const lz = park.maxZ - (park.maxZ - park.minZ) * 0.38;
    const lake = new THREE.Shape();
    const R = 44;
    for (let i = 0; i <= 40; i++) {
      const t = (i / 40) * Math.PI * 2;
      const r = R * (1 + 0.18 * Math.sin(t * 3) + 0.1 * Math.cos(t * 5));
      const px = Math.cos(t) * r * 1.6;
      const pz = Math.sin(t) * r * 0.55;
      if (i === 0) lake.moveTo(px, pz);
      else lake.lineTo(px, pz);
    }
    const water = new THREE.Mesh(track(new THREE.ShapeGeometry(lake, 6).rotateX(Math.PI / 2)), track(new THREE.MeshLambertMaterial({ color: '#5cc8f2' })));
    water.position.set(lx, 0.32, lz);
    water.receiveShadow = true;
    group.add(water);
    // A sandy rim under the water so the shore reads.
    const rim = new THREE.Mesh(track(new THREE.ShapeGeometry(lake, 6).rotateX(Math.PI / 2).scale(1.06, 1, 1.12)), track(new THREE.MeshLambertMaterial({ color: '#e9d8a6' })));
    rim.position.set(lx, 0.28, lz);
    group.add(rim);

    // Bow-style bridge: a white arch with a railing.
    const arch = new THREE.TorusGeometry(10, 0.9, 6, 24, Math.PI).scale(1, 0.32, 1).translate(0, 0, 0);
    toy.add(arch.clone().translate(lx + 6, 0.3, lz - 1.8), '#f4f1ea');
    toy.add(arch.clone().translate(lx + 6, 0.3, lz + 1.8), '#f4f1ea');
    toy.add(new THREE.BoxGeometry(20, 0.4, 3.6).translate(lx + 6, 3.2, lz), '#c8a47e');

    // Rocky outcrops (Central Park is famous for them).
    const rock = '#8f8a93';
    for (const [dx, dz, s] of [[-60, -10, 5], [52, 14, 4], [-28, 22, 3.5], [70, -16, 3]] as const) {
      toy.add(new THREE.DodecahedronGeometry(s, 0).scale(1.6, 0.7, 1.2).translate(lx + dx, 0.6, lz + dz), rock);
    }

    // Fountain plaza with an angel on top (Bethesda Terrace vibes).
    const fx = lx - 40;
    const fz = park.minZ + 22;
    toy.cyl(9, 9.4, 0.5, fx, 0.18, fz, '#e7d9bf', 24);
    toy.cyl(5, 5.4, 1.2, fx, 0.68, fz, '#cdbb99', 20);
    toy.cyl(4.4, 4.4, 0.4, fx, 1.6, fz, '#6fd3f7', 20);
    toy.cyl(0.8, 1.2, 4, fx, 1.8, fz, '#7c8f7a', 10);
    toy.cyl(2.2, 0.6, 0.6, fx, 5.6, fz, '#7c8f7a', 12);
    toy.sphere(0.8, fx, 7.2, fz, '#6f8a74');
    toy.add(new THREE.ConeGeometry(0.9, 2.2, 6).translate(fx, 8.3, fz), '#6f8a74');
    toy.add(new THREE.BoxGeometry(3, 0.3, 0.8).rotateZ(0.25).translate(fx - 0.9, 8.6, fz), '#6f8a74'); // wings
    toy.add(new THREE.BoxGeometry(3, 0.3, 0.8).rotateZ(-0.25).translate(fx + 0.9, 8.6, fz), '#6f8a74');
    group.add(toy.build('landmark-central-park'));

    // Rowboats drifting slowly on the lake.
    const boats = new THREE.Group();
    const boatToy = new Toy();
    const colors = ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff'];
    colors.forEach((c, i) => {
      const ang = (i / colors.length) * Math.PI * 2;
      boatToy.block(4.2, 0.9, 1.8, Math.cos(ang) * 30, 0.2, Math.sin(ang) * 9, c, 0.35);
    });
    const boatMesh = boatToy.build('rowboats');
    boats.add(boatMesh);
    boats.position.set(lx, 0.15, lz);
    group.add(boats);
    let t = 0;
    animate((dt) => {
      t += dt;
      boats.rotation.y = Math.sin(t * 0.05) * 0.4;
      boatMesh.position.y = Math.sin(t * 1.5) * 0.08;
    });
  },
});
