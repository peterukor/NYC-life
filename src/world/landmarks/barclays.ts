// =====================================================================
// Barclays Center (shown as "Atlantic Arena") — cartoon version.
//
// Reference points kept: a low oval arena wrapped in rusty
// weathered-steel bands with glass at street level, and the huge
// "oculus" canopy cantilevered over the plaza with a ring screen
// underneath. Toy proportions, one draw call plus the glowing ring.
// =====================================================================

import * as THREE from 'three';
import { LANDMARKS } from './registry.ts';
import { Toy } from './toy.ts';

const RUST = '#b5653a';
const RUST_DARK = '#7e3f22';
const GLASS = '#8fd3ff';

LANDMARKS.add({
  id: 'atlanticArena',
  build({ inner, group, track }) {
    const cx = (inner.minX + inner.maxX) / 2;
    const cz = (inner.minZ + inner.maxZ) / 2;
    const rx = (inner.maxX - inner.minX) / 2 - 1;
    const sz = (inner.maxZ - inner.minZ) / (inner.maxX - inner.minX);
    const toy = new Toy();
    const oval = (r: number, h: number, y0: number, color: string) => toy.add(new THREE.CylinderGeometry(r, r, h, 40).scale(1, 1, sz).translate(cx, y0 + h / 2, cz), color);

    oval(rx - 1.5, 6, 0, GLASS); // glass street level
    oval(rx, 3, 6, RUST_DARK);
    // Weathered-steel bands that swell outward, like the real facade.
    for (let i = 0; i < 4; i++) oval(rx + (i % 2 ? 1.2 : 0), 4.2, 9 + i * 4.4, i % 2 ? RUST : RUST_DARK);
    toy.add(new THREE.CylinderGeometry(rx - 3, rx + 0.5, 3, 40).scale(1, 1, sz).translate(cx, 28, cz), '#d9d4cc'); // roof
    // The oculus canopy over the plaza (west side), on two stubby legs.
    const ox = inner.minX - 4;
    toy.add(new THREE.TorusGeometry(13, 4, 10, 40).rotateX(Math.PI / 2).scale(1, 0.35, 1).translate(ox, 16, cz), RUST);
    toy.cyl(1, 1.2, 15, ox + 9, 0, cz - 9, RUST_DARK, 8);
    toy.cyl(1, 1.2, 15, ox + 9, 0, cz + 9, RUST_DARK, 8);
    group.add(toy.build('landmark-atlantic-arena'));

    // The glowing ring screen under the oculus.
    const ring = new THREE.Mesh(track(new THREE.TorusGeometry(10.5, 0.8, 6, 40).rotateX(Math.PI / 2)), track(new THREE.MeshBasicMaterial({ color: '#ff3d7f', toneMapped: false })));
    ring.position.set(ox, 14.2, cz);
    ring.userData.landmarkLight = true;
    group.add(ring);
  },
});
