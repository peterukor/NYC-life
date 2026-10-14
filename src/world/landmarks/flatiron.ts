// =====================================================================
// Flatiron Building — cartoon version.
//
// The famous wedge: a triangle-shaped tower with a rounded "nose",
// cream stone with horizontal bands, a heavy cornice on top and a
// darker base. Sits in a little plaza with trees and benches.
// =====================================================================

import * as THREE from 'three';
import { LANDMARKS } from './registry.ts';
import { Toy } from './toy.ts';

const STONE = '#f1e3c6';
const BAND = '#d9c39b';
const BASE = '#b99b77';

/** A triangle (wedge) prism pointing north, with its base on y0. */
function wedge(w: number, d: number, y0: number, h: number, inset = 0): THREE.BufferGeometry {
  const s = new THREE.Shape();
  // Shape y becomes world −z after the rotation below, so the nose (y = +d/2) points north.
  s.moveTo(-w / 2 + inset, -d / 2 + inset);
  s.lineTo(w / 2 - inset, -d / 2 + inset);
  s.lineTo(0, d / 2 - inset * 2);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelSize: 0.6, bevelThickness: 0.4, bevelSegments: 2 });
  g.rotateX(-Math.PI / 2).translate(0, y0, 0);
  return g;
}

LANDMARKS.add({
  id: 'flatiron',
  build({ inner, group }) {
    const cx = (inner.minX + inner.maxX) / 2;
    const cz = (inner.minZ + inner.maxZ) / 2;
    const w = Math.min(36, inner.maxX - inner.minX - 10);
    const d = inner.maxZ - inner.minZ - 2;
    const toy = new Toy();
    toy.block(inner.maxX - inner.minX, 0.25, inner.maxZ - inner.minZ, cx, 0, cz, '#e7dfd0', 0.02);
    const H = 78;
    toy.add(wedge(w, d, 0.25, 8).translate(cx, 0, cz), BASE);
    toy.add(wedge(w, d, 8.25, H - 8, 0.4).translate(cx, 0, cz), STONE);
    // Horizontal bands every few floors.
    for (let y = 16; y < H - 4; y += 9) toy.add(wedge(w + 0.8, d + 0.8, y, 0.9).translate(cx, 0, cz), BAND);
    // Heavy cornice and roof.
    toy.add(wedge(w + 2, d + 2, H, 2.2).translate(cx, 0, cz), BAND);
    // The rounded nose at the north tip.
    toy.cyl(1.6, 1.6, H, cx, 0.25, cz - d / 2 + 1.2, STONE, 14);
    // Little plaza: trees and benches either side.
    for (const side of [-1, 1]) {
      const x = cx + side * (w / 2 + 8);
      for (const z of [cz - 6, cz + 6]) {
        toy.cyl(0.25, 0.3, 2.6, x, 0.25, z, '#7a5236', 6);
        toy.sphere(2.1, x, 4.2, z, '#5cb85c');
        toy.sphere(1.4, x + 0.6, 5.4, z - 0.3, '#7fd36d');
      }
      toy.block(3, 0.6, 1, x, 0.25, cz, '#7a5236', 0.3);
    }
    group.add(toy.build('landmark-flatiron'));
  },
});
