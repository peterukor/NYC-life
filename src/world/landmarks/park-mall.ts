// =====================================================================
// Central Park Galleria — a cartoon shopping mall facing the park.
// (Not real New York; added for the game.) Big pink building with a
// glass atrium dome, colourful shop windows, an entrance canopy, flags
// and a giant sign.
// =====================================================================

import * as THREE from 'three';
import { signTexture } from '../../render/textures.ts';
import { LANDMARKS } from './registry.ts';
import { Toy } from './toy.ts';

LANDMARKS.add({
  id: 'parkMall',
  build({ inner, group, track }) {
    const cx = (inner.minX + inner.maxX) / 2;
    const cz = (inner.minZ + inner.maxZ) / 2;
    const w = inner.maxX - inner.minX - 2;
    const d = inner.maxZ - inner.minZ - 2;
    const toy = new Toy();
    toy.block(w, 14, d, cx, 0, cz, '#ff8fc0', 0.05); // main body
    toy.block(w + 1, 1.4, d + 1, cx, 14, cz, '#ffffff', 0.3); // roof trim
    toy.block(w * 0.6, 8, d * 0.6, cx, 15.4, cz, '#ffd0e4', 0.08); // upper level
    // Glass atrium dome.
    toy.add(new THREE.SphereGeometry(Math.min(w, d) * 0.28, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.4, 0.8, 1).translate(cx, 23.4, cz), '#9fe3ff');
    // Shop windows on every side (rows of bright panes).
    const panes = ['#ffd93d', '#6bcb77', '#4d96ff', '#ff6b6b', '#c77dff'];
    for (let i = 0; i < 6; i++) {
      const x = cx - w / 2 + (w / 6) * (i + 0.5);
      toy.block(w / 6 - 2, 5, 0.6, x, 1, cz + d / 2 + 0.1, panes[i % panes.length], 0.2);
      toy.block(w / 6 - 2, 5, 0.6, x, 1, cz - d / 2 - 0.1, panes[(i + 2) % panes.length], 0.2);
    }
    // Entrance canopy facing the park (west) and flags.
    toy.block(1.2, 0.8, 16, inner.minX - 2, 7, cz, '#ffffff', 0.3);
    for (const z of [cz - 7, cz + 7]) toy.cyl(0.3, 0.3, 7, inner.minX - 2.5, 0.18, z, '#ffffff', 8);
    for (let i = 0; i < 4; i++) {
      const z = cz - d / 2 + (d / 4) * (i + 0.5);
      toy.cyl(0.15, 0.15, 8, inner.minX + 1, 22, z, '#ffffff', 6);
      toy.block(0.2, 2, 3, inner.minX + 1, 27.5, z + 1.5, panes[i], 0.1);
    }
    group.add(toy.build('landmark-park-mall'));

    // Big sign over the entrance.
    const sign = new THREE.Mesh(track(new THREE.PlaneGeometry(26, 4.5)), track(new THREE.MeshBasicMaterial({ map: track(signTexture('GALLERIA', '#ff2d87')) })));
    sign.position.set(inner.minX - 0.2, 10.5, cz);
    sign.rotation.y = -Math.PI / 2;
    group.add(sign);
  },
});
