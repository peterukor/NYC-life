// =====================================================================
// Empire State Building — cartoon version.
//
// Reference points kept from the real building (Fifth Ave & 34th St):
//   • a wide 5-storey base filling the block;
//   • a tall limestone shaft with vertical metal stripes;
//   • stepped setbacks near the top;
//   • the Art Deco crown that lights up at night, and the mast/antenna.
// Exaggerated for the toy look: chunkier tiers, a fatter mast and a
// glowing red tip. One draw call (plus the glowing crown).
// =====================================================================

import * as THREE from 'three';
import { LANDMARKS } from './registry.ts';
import { Toy } from './toy.ts';

const STONE = '#f2e2bd';
const STONE_DARK = '#d9c294';
const STRIPE = '#a8b4c8';
const WINDOW = '#7fb3e6';

LANDMARKS.add({
  id: 'empireState',
  build({ inner, group, track }) {
    const cx = (inner.minX + inner.maxX) / 2;
    const cz = (inner.minZ + inner.maxZ) / 2;
    const bw = inner.maxX - inner.minX - 2;
    const bd = inner.maxZ - inner.minZ - 2;
    const toy = new Toy();

    // Base: 5 storeys with a row of shop windows.
    toy.block(bw, 22, bd, cx, 0, cz, STONE_DARK, 0.05);
    toy.block(bw + 0.6, 1.4, bd + 0.6, cx, 22, cz, STONE, 0.3);
    toy.block(bw - 4, 4, 0.6, cx, 2, cz + bd / 2, WINDOW, 0.2);

    // Shaft and setbacks: (width, depth, from, to).
    const tiers: [number, number, number, number][] = [
      [44, 28, 23, 150],
      [34, 22, 150, 178],
      [26, 18, 178, 196],
      [18, 13, 196, 210],
    ];
    for (const [w, d, y0, y1] of tiers) {
      toy.block(w, y1 - y0, d, cx, y0, cz, STONE, 0.04);
      toy.block(w + 1.2, 1.6, d + 1.2, cx, y1 - 1.6, cz, STONE_DARK, 0.3); // ledge
      // Vertical metal stripes between the window columns.
      const n = Math.max(3, Math.round(w / 5));
      for (let i = 0; i < n; i++) {
        const x = cx - w / 2 + (w / n) * (i + 0.5);
        toy.block(1.1, y1 - y0 - 4, 0.8, x, y0 + 1.5, cz + d / 2 + 0.2, STRIPE, 0.3);
        toy.block(1.1, y1 - y0 - 4, 0.8, x, y0 + 1.5, cz - d / 2 - 0.2, STRIPE, 0.3);
      }
      const m = Math.max(2, Math.round(d / 5));
      for (let i = 0; i < m; i++) {
        const z = cz - d / 2 + (d / m) * (i + 0.5);
        toy.block(0.8, y1 - y0 - 4, 1.1, cx + w / 2 + 0.2, y0 + 1.5, z, STRIPE, 0.3);
        toy.block(0.8, y1 - y0 - 4, 1.1, cx - w / 2 - 0.2, y0 + 1.5, z, STRIPE, 0.3);
      }
    }
    // Observation deck and mast.
    toy.block(12, 6, 10, cx, 210, cz, STONE_DARK, 0.2);
    toy.cyl(5, 6, 8, cx, 216, cz, STONE, 12);
    toy.cyl(3.6, 4.6, 10, cx, 224, cz, STRIPE, 12);
    toy.cyl(1.2, 2.2, 22, cx, 234, cz, '#d8dde8', 8);
    toy.cyl(0.35, 0.6, 16, cx, 256, cz, '#8a93a8', 6);
    toy.sphere(1.3, cx, 272.5, cz, '#ff4d4d');
    group.add(toy.build('landmark-empire-state'));

    // The famous lit-up crown: a separate glowing ring.
    const crown = new THREE.Mesh(track(new THREE.CylinderGeometry(5.3, 6.3, 7.6, 12, 1, true)), track(new THREE.MeshBasicMaterial({ color: '#ffcf56', toneMapped: false, side: THREE.DoubleSide })));
    crown.position.set(cx, 220, cz);
    crown.userData.landmarkLight = true;
    group.add(crown);
  },
});
