// =====================================================================
// Chrysler Building — cartoon version.
//
// What makes it recognisable (kept and exaggerated):
//   • a slim brick-and-white tower with stepped shoulders;
//   • the stainless-steel crown of stacked arches with triangle windows
//     (they glow at night);
//   • the needle-thin spire on top;
//   • the silver eagle gargoyles sticking out at the corners.
// =====================================================================

import * as THREE from 'three';
import { LANDMARKS } from './registry.ts';
import { Toy } from './toy.ts';

const WHITE = '#f2efe8';
const BRICK = '#d9d2c5';
const STEEL = '#cfd8e3';
const STEEL_DARK = '#9aa8b8';
const WINDOW = '#7fb3e6';

LANDMARKS.add({
  id: 'chrysler',
  build({ inner, group, track }) {
    const cx = (inner.minX + inner.maxX) / 2;
    const cz = (inner.minZ + inner.maxZ) / 2;
    const toy = new Toy();
    // Plaza paving around the tower.
    toy.block(inner.maxX - inner.minX, 0.25, inner.maxZ - inner.minZ, cx, 0, cz, '#ece3d3', 0.02);
    // Base and shoulders.
    toy.block(34, 30, 24, cx, 0.25, cz, BRICK, 0.04);
    toy.block(35, 1.2, 25, cx, 30, cz, WHITE, 0.3);
    toy.block(28, 40, 20, cx, 31, cz, BRICK, 0.04);
    toy.block(29, 1.2, 21, cx, 71, cz, WHITE, 0.3);
    toy.block(22, 70, 18, cx, 72, cz, BRICK, 0.04);
    // Vertical window strips and white piers on the shaft.
    for (let i = 0; i < 5; i++) {
      const x = cx - 8 + i * 4;
      toy.block(1.4, 64, 0.5, x, 75, cz + 9.1, WINDOW, 0.3);
      toy.block(1.4, 64, 0.5, x, 75, cz - 9.1, WINDOW, 0.3);
    }
    for (let i = 0; i < 4; i++) {
      const z = cz - 6 + i * 4;
      toy.block(0.5, 64, 1.4, cx + 11.1, 75, z, WINDOW, 0.3);
      toy.block(0.5, 64, 1.4, cx - 11.1, 75, z, WINDOW, 0.3);
    }
    // Eagle gargoyles at the corners of the top setback.
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      toy.block(3.2, 1.2, 1.2, cx + dx * 12, 138, cz + dz * 9, STEEL, 0.4);
      toy.sphere(0.9, cx + dx * 13.4, 138.8, cz + dz * 9.5, STEEL);
    }
    toy.block(23, 2, 19, cx, 142, cz, WHITE, 0.3);
    // The crown: stacked, shrinking steel arches, then the spire.
    const tiers = [
      [10, 8],
      [8.2, 7],
      [6.5, 6],
      [4.8, 5],
      [3.2, 4],
    ];
    let y = 144;
    for (const [r, h] of tiers) {
      toy.cyl(r * 0.8, r, h, cx, y, cz, STEEL, 16);
      toy.add(new THREE.SphereGeometry(r * 0.8, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(cx, y + h, cz), STEEL_DARK);
      y += h;
    }
    toy.cyl(0.25, 1.6, 26, cx, y, cz, STEEL, 8);
    group.add(toy.build('landmark-chrysler'));

    // Triangle windows in the crown that glow at night (one ring per tier).
    const glow = track(new THREE.MeshBasicMaterial({ color: '#ffe8a3', toneMapped: false }));
    y = 144;
    for (const [r, h] of tiers) {
      const ring = new THREE.Mesh(track(new THREE.CylinderGeometry(r * 0.82, r * 1.01, h * 0.55, 8, 1, true)), glow);
      ring.position.set(cx, y + h * 0.45, cz);
      ring.userData.landmarkLight = true;
      group.add(ring);
      y += h;
    }
  },
});
